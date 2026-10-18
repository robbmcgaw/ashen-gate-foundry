import {ID,VERSION,SKILL_IDS,escapeHTML as E,createSession,summary,acceptRoll,skipRoll,resolveNow,cancelSession,projectSession,MAX_HISTORY} from './core.mjs';
import {launcherRoot,mountLauncher} from './ag-launchers.mjs';

const {ApplicationV2}=foundry.applications.api;
let windowInstance=null;
let activeRoll=false;
let saving=false;
let sessionQueue=Promise.resolve();
let lastPromptedSession=null;
function queueSession(task){const next=sessionQueue.then(task);sessionQueue=next.catch(()=>{});return next;}
const isGM=()=>Boolean(game.user?.isGM);
const permitted=()=>isGM()||game.settings.get(ID,'playerAccessEnabled')===true;
const getSession=()=>game.settings.get(ID,'activeSession')||{};
const getHistory=()=>game.settings.get(ID,'history')||[];
const activeSession=()=>{const s=getSession();return s?.schema==='ag-utilities-session/0.1'&&s.status==='active'?s:null;};
const isOwned=(actor,user=game.user)=>Boolean(actor&&(user?.isGM||actor.testUserPermission?.(user,'OWNER')));
const allCharacters=()=>[...game.actors].filter(a=>a.type==='character').sort((a,b)=>a.name.localeCompare(b.name));
const permittedActors=()=>allCharacters().filter(a=>isOwned(a));
const ownedIds=()=>permittedActors().map(a=>a.id);
const skillName=k=>game.i18n.localize(CONFIG.DND5E?.skills?.[k]?.label??k);
const statusConfig=k=>CONFIG.statusEffects?.find(x=>x.id===k);
const statusName=k=>game.i18n.localize(statusConfig(k)?.name??k);
const error=e=>{console.error(`[${ID}]`,e);ui.notifications?.error(e?.message||String(e));};
const option=(id,title,selected)=>`<option value="${E(id)}" ${id===selected?'selected':''}>${E(title)}</option>`;
const btn=(action,title,{disabled=false,kind='',attrs=''}={})=>`<button type="button" class="${E(kind)}" data-action="${E(action)}" ${disabled?'disabled':''} ${attrs}>${E(title)}</button>`;
const empty=msg=>`<div class="agu-empty">${E(msg)}</div>`;
const labelSkill=skill=>skillName(skill);
const notice=()=>activeSession()?'Another active interaction is in progress. Resolve or cancel it before starting another.':'';
const sessionKind=s=>s.kind==='group'?'Group Check':'Roll Request';
function sessionHeader(s){const sum=summary(s);return `${sessionKind(s)} · ${s.name} · ${sum.accepted}/${sum.totalSlots} accepted`;} 

/** Active sessions are public-only in this release: nothing secret is written to synced settings. */
async function storeSession(s){
 if(!isGM())throw Error('Only a GM can update a check.');
 if(saving)throw Error('Another session update is still saving.');
 saving=true;
 try{
   if(s.status==='active'){await game.settings.set(ID,'activeSession',s);return;}
   // Archive before clearing so a write failure cannot silently lose the concluded record.
   const history=[s,...getHistory().filter(x=>x.id!==s.id)].slice(0,MAX_HISTORY);
   await game.settings.set(ID,'history',history);
   await game.settings.set(ID,'activeSession',{});
 } finally {saving=false;}
}
function authorOf(message){return message.author??(typeof message.user==='string'?game.users.get(message.user):message.user);}
function coordinatorIsMe(){return [...game.users].filter(u=>u.active&&u.isGM).sort((a,b)=>a.id.localeCompare(b.id))[0]?.id===game.user.id;}
async function processSubmission(message){
 if(!isGM()||!coordinatorIsMe())return;
 const payload=message.flags?.[ID]?.submission;
 if(!payload||payload.contract!=='ag-utility-roll/0.1')return;
 const author=authorOf(message),actor=game.actors.get(payload.actorId);
 try{
  if(!author||!actor||!isOwned(actor,author))throw Error('Submission author lacks Actor ownership.');
  if(message.id===payload.proofMessageId)throw Error('Submission is not native roll proof.');
  const proof=game.messages.get(payload.proofMessageId);
  if(!proof||authorOf(proof)?.id!==author.id||String(proof.speaker?.actor??'')!==actor.id||!Array.isArray(proof.rolls)||!proof.rolls.length)throw Error('Matching native roll not found.');
  const total=Number(proof.rolls[0].total);
  if(!Number.isFinite(total)||total!==Number(payload.total))throw Error('Native roll does not match submission.');
  await queueSession(async()=>{
   const s=activeSession();if(!s||s.id!==payload.sessionId)return;
   // Roll type/skill attestation in the native chat payload requires dnd5e 6.0.6 in-world verification.
   acceptRoll(s,{actorId:actor.id,skill:payload.skill,total,userId:author.id,proofMessageId:proof.id});
   await storeSession(s);
  });
 }catch(e){console.warn(`[${ID}] Rejected roll submission ${message.id}: ${e.message}`);}
}
function actorsCheckboxes(){const a=allCharacters();return a.length?`<div class="agu-choices">${a.map(x=>`<label class="agu-inline"><input type="checkbox" name="agu-participant" value="${E(x.id)}"> ${E(x.name)}</label>`).join('')}</div>`:empty('Create two disposable character Actors in the Actors directory before starting a check.');}
function skillChoices(){return `<div class="agu-choices">${SKILL_IDS.map(s=>`<label class="agu-inline"><input type="checkbox" name="agu-skill" value="${E(s)}" ${['acr','ath','prc'].includes(s)?'checked':''}>${E(skillName(s))}</label>`).join('')}</div>`;}
function createPanel(kind){if(!isGM())return '';
 if(activeSession())return `<div class="agu-note">${E(notice())}</div>`;
 const group=kind==='group';return `<section class="agu-card"><h2>${group?'Start a Group Check':'Send a Roll Request'}</h2>
 <p class="agu-note">${group?'Everyone contributes to one averaged result. Select the characters, skills and DC.':'Ask each selected character for one public skill check. Each result is reported individually.'}</p>
 <label>Title<input id="agu-title" maxlength="120" value="${group?'New Group Check':'New Roll Request'}"></label>
 <fieldset><legend>Participating characters</legend>${actorsCheckboxes()}</fieldset>
 <fieldset><legend>${group?'Allowed skills':'Requested skill'}</legend>${group?skillChoices():`<select id="agu-request-skill">${SKILL_IDS.map(s=>option(s,skillName(s),'prc')).join('')}</select>`}</fieldset>
 <div class="agu-compact"><label>DC <input id="agu-dc" type="number" min="0" max="100" value="15"></label>${group?`<label>Rolls per character <select id="agu-roll-count">${[1,2,3,4,5].map(n=>option(String(n),String(n),'1')).join('')}</select></label>`:''}</div>
 <div class="agu-actions">${btn('start',group?'Start Group Check':'Send Roll Request',{kind:'primary'})}</div></section>`;
}
function slotText(slot,kind){return slot.status==='accepted'?`${slot.total} · ${labelSkill(slot.skill)}`:slot.status==='skipped'?'Skipped':'Waiting';}
function sessionView(session,kind,app){
 if(session.kind!==kind)return `<section class="agu-card agu-quiet"><h2>${kind==='group'?'No Group Check active':'No Roll Request active'}</h2><p>A ${sessionKind(session)} is currently active in its own tab.</p>${isGM()?'Finish or cancel it there before starting another interaction.':'Switch tabs to respond to the current request.'}</section>`;
 const projected=projectSession(session,{userId:game.user.id,isGM:isGM(),ownedActorIds:ownedIds()});
 const sum=summary(projected),pending=projected.slots.filter(x=>x.status==='pending'&&isOwned(game.actors.get(x.actorId)));
 const actorIds=[...new Set(pending.map(x=>x.actorId))];
 const selected=actorIds.includes(app.rollActorId)?app.rollActorId:actorIds[0];
 const acceptedSkill=new Set(projected.slots.filter(x=>x.actorId===selected&&x.status==='accepted').map(x=>x.skill));
 const skills=session.skills.filter(s=>!acceptedSkill.has(s));
 const headline=session.kind==='group'?'Team progress':'Responses';
 const rows=projected.actors.map(id=>{
  const actor=game.actors.get(id),slots=projected.slots.filter(x=>x.actorId===id);
  const cells=slots.map(s=>`<span class="agu-pill ${E(s.status)}">${E(slotText(s,session.kind))}</span>`).join('');
  return `<div class="agu-participant"><strong>${E(actor?.name||'Unavailable Actor')}</strong><div class="agu-contributions">${cells}</div>${isGM()&&slots.some(x=>x.status==='pending')?btn('skip','Skip One',{attrs:`data-actor="${E(id)}"`}):''}</div>`;
 }).join('');
 const rollForm=actorIds.length?`<section class="agu-action-panel"><h3>Your roll is requested</h3><p class="agu-note">${E(session.name)} · ${session.kind==='group'?'Choose one of the allowed skills.':'Roll the requested skill.'}</p><div class="agu-compact"><label>Character<select id="agu-roll-actor">${actorIds.map(id=>option(id,game.actors.get(id)?.name??'Unavailable',selected)).join('')}</select></label><label>Skill<select id="agu-roll-skill">${skills.map(x=>option(x,skillName(x),x)).join('')}</select></label></div>${btn('roll','Roll Now',{kind:'primary agu-roll-large',disabled:!skills.length})}</section>`:'';
 return `<section class="agu-card"><div class="agu-line"><h2>${E(session.name)}</h2><span class="agu-pill">${E(sessionKind(session))}</span></div>
 <p class="agu-note">${session.kind==='group'?`DC ${E(session.dc??'none')} · ${session.rollsPerActor} per character · unique skills`:`Public ${E(skillName(session.skills[0]))} request · ${session.dc===null?'No DC':`DC ${E(session.dc)}`}`}</p>
 <div class="agu-line"><strong>${E(headline)}</strong><strong>${sum.accepted+sum.skipped}/${sum.totalSlots} resolved</strong></div>
 <progress max="${sum.totalSlots}" value="${sum.accepted+sum.skipped}"></progress>
 ${isGM()?`<p class="agu-note">${session.kind==='group'?`Average ${sum.average===null?'—':sum.average.toFixed(1)}`:`${sum.accepted} responses accepted`}</p>`:''}
 ${isGM()?rows+rollForm:rollForm+`<p class="agu-note">${sum.pending} contribution(s) still pending.</p>`}
 ${isGM()?`<div class="agu-actions">${btn('resolve','End & Record',{kind:'primary'})}${btn('cancel','Cancel Session',{kind:'danger'})}</div>`:''}
 </section>`;
}
function interactionView(kind,app){const active=activeSession();return (active?sessionView(active,kind,app):isGM()?empty(kind==='group'?'No Group Check active. Create one below.':'No Roll Request active. Send one below.'):empty('No active roll request for your character.'))+createPanel(kind);}
function stashActor(){return game.actors.find(a=>a.getFlag(ID,'partyStash')===true);}
function inventoryView(){if(!isGM())return `<section class="agu-card"><h2>Party Inventory</h2>${empty('The v0.2.0 Alpha stash is GM-only regardless of Observer permission. Player transfers and unidentified item sharing are not enabled.')}</section>`;
 const stash=stashActor(),items=stash?[...stash.items].map(it=>`<div class="agu-participant"><strong>${E(it.name)}</strong><span>Qty ${E(it.system?.quantity??1)}</span></div>`).join(''):'';
 return `<section class="agu-card"><h2>Party Inventory · GM Preview</h2><p class="agu-note">The stash is a native NPC Actor with default ownership None. Even if players gain Observer permission, Utilities does not publish its contents or transfer controls in this Alpha.</p>${stash?`<p>Stash: <strong>${E(stash.name)}</strong></p>${items||empty('Stash empty.')}${btn('open-stash','Open Native Stash Sheet')}`:empty('No Utilities stash yet.')+btn('create-stash','Create GM-only Party Stash',{kind:'primary'})}</section>`;
}
const safeTextResult=r=>{const type=r?.type,textType=globalThis.CONST?.TABLE_RESULT_TYPES?.TEXT;return (type===0||type==='text'||(textType!==undefined&&type===textType))&&!r?.documentCollection&&!r?.documentId;};
function tableView(app){if(!isGM())return empty('Only the GM can roll and distribute RollTable messages.');
 const tables=[...game.tables].sort((a,b)=>a.name.localeCompare(b.name));
 const recipients=[...game.users].filter(u=>!u.isGM).map(u=>`<label class="agu-inline"><input type="checkbox" name="agu-recipient" value="${E(u.id)}">${E(u.name)}</label>`).join('');
 return `<section class="agu-card"><h2>RollTable Messenger</h2><p class="agu-note">Text-only RollTables are supported. Any table containing document/compendium results is rejected before rolling.</p><label>Foundry RollTable<select id="agu-table">${tables.map(t=>option(t.id,t.name,t.id)).join('')}</select></label><div class="agu-actions">${btn('table-roll','Roll Privately',{disabled:!tables.length})}</div><label>Outgoing message<textarea id="agu-table-message" rows="3">${E(app.tableDraft)}</textarea></label><fieldset><legend>Recipients (none = public to all)</legend><div class="agu-choices">${recipients||empty('No players connected.')}</div></fieldset><label class="agu-inline"><input type="checkbox" id="agu-table-auto" ${app.tableAuto?'checked':''}>Auto-Send safe text results</label><div class="agu-actions">${btn('table-send','Send Message',{kind:'primary',disabled:!app.tableDraft.trim()})}</div></section>`;
}
function conditionIcon(id){const cfg=statusConfig(id),img=cfg?.img??cfg?.icon;return typeof img==='string'&&img&&!/^\s*javascript:/i.test(img)?`<img class="agu-status-icon" src="${E(img)}" alt="">`:'';}
function conditionsView(app){const characters=isGM()?allCharacters():permittedActors();const actor=characters.find(a=>a.id===app.actorId)||characters[0];const statuses=actor?[...(actor.statuses||[])]:[],known=CONFIG.statusEffects||[];
 const roster=characters.map(a=>`<button type="button" data-condition-actor="${E(a.id)}" class="agu-roster-row ${actor?.id===a.id?'active':''}"><span>${E(a.name)}</span><span class="agu-roster-status">${[...(a.statuses||[])].map(s=>conditionIcon(s)+`<span title="${E(statusName(s))}">${E(statusName(s))}</span>`).join('')||'No conditions'}</span></button>`).join('');
 const details=statuses.length?statuses.map(id=>`<div class="agu-participant"><span class="agu-status-title">${conditionIcon(id)}${E(statusName(id))}</span>${isGM()?btn('remove-status','Remove',{attrs:`data-status="${E(id)}"`}) :''}</div>`).join(''):empty('No conditions on this character.');
 return `<section class="agu-card"><h2>Party Conditions</h2><div class="agu-party-panes"><section><h3>${isGM()?'All Characters':'Your Characters'}</h3>${roster||empty('No accessible characters.')}</section><section><h3>${E(actor?.name||'Select a character')}</h3>${details}${isGM()&&actor?`<div class="agu-compact"><label>Native condition<select id="agu-condition-status">${known.map(x=>option(x.id,statusName(x.id),x.id)).join('')}</select></label>${btn('add-status','Apply',{kind:'primary'})}</div>`:''}</section></div><p class="agu-note">Native Foundry statuses only. Automatic duration, exhaustion and concentration management remain outside this Alpha.</p></section>`;
}
function historyView(app){if(!isGM())return empty('History is GM-only.');
 const history=getHistory();return `<section class="agu-card"><h2>Completed & Cancelled Checks</h2>${history.length?history.map(s=>{
  const sm=summary(s),detail=s.slots.map(sl=>`${game.actors.get(sl.actorId)?.name??'Unavailable Actor'}: ${sl.status==='accepted'?`${sl.skill?skillName(sl.skill):'Roll'} ${sl.total}${s.kind==='request'&&s.dc!==null?` (${sl.total>=s.dc?'Success':'Failure'} vs DC ${s.dc})`:''}`:sl.status}`).join(' · ');
  const outcome=s.status==='cancelled'?'Cancelled':sm.result==='no-result'?'No Result':sm.result==='completed'?'Recorded':sm.result==='success'?'Success':'Failure';
  return `<div class="agu-history"><div class="agu-line"><strong>${E(s.name)}</strong><span>${E(sessionKind(s))} · ${E(outcome)}</span></div><p>${E(detail)}</p><small>${E(new Date(s.closedAt||s.createdAt).toLocaleString())}${s.kind==='group'&&sm.average!==null?` · Average ${E(sm.average.toFixed(1))}`:''}</small></div>`;
 }).join(''):empty('No completed interactions yet.')}</section>`;
}
function setupView(){return `<section class="agu-card"><h2>GM Setup</h2><label class="agu-inline"><input id="agu-access" type="checkbox" ${game.settings.get(ID,'playerAccessEnabled')?'checked':''}>Enable Player Access</label><p class="agu-note">This controls the player-facing Utilities launcher, not native Actor ownership.</p><div class="agu-actions">${btn('save-access','Save Player Access',{kind:'primary'})}</div></section>`;}
class UtilitiesApp extends ApplicationV2 {
 static DEFAULT_OPTIONS={id:'ashen-gate-utilities-window',classes:['ag-utilities'],window:{title:'Ashen Gate | Utilities',resizable:true,minimizable:true},position:{width:900,height:690,minWidth:620,minHeight:490}};
 constructor(...args){super(...args);this.tab='checks';this.actorId='';this.rollActorId='';this.tableDraft='';this.tableAuto=false;}
 async _renderHTML(){if(!permitted())throw Error('Utilities is hidden for players.');const tabs=[['checks','Group Checks'],['rolls','Roll Requests'],['inventory','Party Inventory'],['tables','Roll Tables'],['conditions','Conditions'],...(isGM()?[['history','History'],['setup','GM Setup']]:[])];
  const body=this.tab==='checks'?interactionView('group',this):this.tab==='rolls'?interactionView('request',this):this.tab==='inventory'?inventoryView():this.tab==='tables'?tableView(this):this.tab==='conditions'?conditionsView(this):this.tab==='history'&&isGM()?historyView(this):this.tab==='setup'&&isGM()?setupView():empty('Unavailable view.');
  return `<div class="agu-root"><header class="agu-header"><div><h1>Ashen Gate | Utilities</h1><p>Group challenges, individual requests and party utilities</p></div><span class="agu-version">v${VERSION} Alpha · ${isGM()?'GM':'Player'}</span></header><nav class="agu-tabs" aria-label="Utility sections">${tabs.map(([id,label])=>`<button type="button" data-tab="${id}" aria-current="${this.tab===id?'page':'false'}" class="${this.tab===id?'active':''}">${E(label)}</button>`).join('')}</nav><main class="agu-main">${body}</main><footer class="agu-footer"><span>Foundry V14 · dnd5e 6.0.6 target · live acceptance pending</span><span>${this.tab==='inventory'?'Stash transfers: not enabled':'Native permissions apply'}</span></footer></div>`;
 }
 _replaceHTML(html,content){content.innerHTML=html;this.bind(content);this.theme(content);}
 theme(content){try{const api=game.modules.get('ashen-gate-manager')?.api?.appearance;if(api?.contract==='ag-appearance/0.1-beta'&&typeof api.applyTo==='function')api.applyTo(content);}catch(e){console.warn(`[${ID}] Optional appearance unavailable`,e);}}
 bind(root){
  for(const el of root.querySelectorAll('[data-tab]'))el.addEventListener('click',async()=>{this.tab=el.dataset.tab;await this.render();});
  for(const b of root.querySelectorAll('[data-condition-actor]'))b.addEventListener('click',async()=>{this.actorId=b.dataset.conditionActor;await this.render();});
  root.querySelector('#agu-roll-actor')?.addEventListener('change',e=>{this.rollActorId=e.target.value;const session=activeSession(),used=new Set((session?.slots||[]).filter(s=>s.actorId===this.rollActorId&&s.status==='accepted').map(s=>s.skill));const choices=session?.skills.filter(s=>!used.has(s))||[];root.querySelector('#agu-roll-skill').innerHTML=choices.map(x=>option(x,skillName(x),x)).join('');});
  root.querySelector('#agu-table-message')?.addEventListener('input',e=>{this.tableDraft=e.target.value;const b=root.querySelector('[data-action="table-send"]');if(b)b.disabled=!this.tableDraft.trim();});
  root.querySelector('#agu-table-auto')?.addEventListener('change',e=>{this.tableAuto=e.target.checked;});
  for(const b of root.querySelectorAll('[data-action]'))b.addEventListener('click',()=>this.handle(b.dataset.action,b,root).catch(error));
 }
 async handle(action,b,root){if(b.disabled)return;b.disabled=true;try{
  if(action==='start'){
   if(!isGM())throw Error('GM only.');const actors=[...root.querySelectorAll('input[name="agu-participant"]:checked')].map(x=>x.value),kind=this.tab==='rolls'?'request':'group';const skills=kind==='group'?[...root.querySelectorAll('input[name="agu-skill"]:checked')].map(x=>x.value):[root.querySelector('#agu-request-skill')?.value];const dcText=root.querySelector('#agu-dc')?.value;
   if(activeSession())throw Error('Resolve or cancel the active interaction first.');
   const session=createSession({id:crypto.randomUUID(),kind,name:root.querySelector('#agu-title')?.value,actors,skills,rollsPerActor:kind==='group'?Number(root.querySelector('#agu-roll-count')?.value):1,dc:dcText===''?null:Number(dcText),visibility:'public',createdBy:game.user.id});
   await queueSession(async()=>{if(activeSession())throw Error('An active interaction already exists.');await storeSession(session);});
   ui.notifications.info(`${sessionKind(session)} sent to selected players.`);return;
  }
  if(action==='roll'){await rollFromActor(root);return;}
  if(action==='skip'||action==='resolve'||action==='cancel'){
   if(!isGM())throw Error('GM only.');const session=activeSession();if(!session)throw Error('No active check.');
   const msg=action==='skip'?`Skip one contribution for ${game.actors.get(b.dataset.actor)?.name||'the character'}?`:action==='resolve'?'End now? All remaining contributions will be marked Skipped and the result saved to History.':'Cancel this interaction and save it in History?';
   if(!confirm(msg))return;
   await queueSession(async()=>{const latest=activeSession();if(!latest||latest.id!==session.id)throw Error('Session has changed.');
    if(action==='skip')skipRoll(latest,{actorId:b.dataset.actor,reason:'GM-confirmed',userId:game.user.id});
    if(action==='resolve')resolveNow(latest,{userId:game.user.id});
    if(action==='cancel')cancelSession(latest,{userId:game.user.id});
    await storeSession(latest);
   });
   return;
  }
  if(action==='create-stash'){if(!isGM())throw Error('GM only.');if(stashActor())throw Error('Party Stash already exists.');await Actor.create({name:'Ashen Gate | Party Stash',type:'npc',ownership:{default:0},flags:{[ID]:{partyStash:true}}});await this.render();return;}
  if(action==='open-stash'){if(!isGM())throw Error('GM only.');stashActor()?.sheet?.render(true);return;}
  if(action==='table-roll'){
   if(!isGM())throw Error('GM only.');const table=game.tables.get(root.querySelector('#agu-table')?.value);if(!table)throw Error('Choose a native RollTable.');
   if([...table.results].some(x=>!safeTextResult(x)))throw Error('This table includes document/compendium results and cannot be rolled by Utilities in this Alpha. Use a text-only table.');
   const rolled=await table.roll();const results=rolled?.results||[];
   if(!results.length||results.some(x=>!safeTextResult(x)))throw Error('No safe text-only results available.');
   this.tableDraft=results.map(x=>String(x.text||'')).join('\n').slice(0,3000);
   if(!this.tableDraft.trim())throw Error('RollTable returned no text.');
   if(this.tableAuto){await sendMessage(this.tableDraft,root);this.tableDraft='';ui.notifications.info('Safe RollTable text sent.');}
   await this.render();return;
  }
  if(action==='table-send'){if(!isGM())throw Error('GM only.');await sendMessage(root.querySelector('#agu-table-message')?.value||'',root);this.tableDraft='';await this.render();return;}
  if(action==='add-status'||action==='remove-status'){
   if(!isGM())throw Error('GM only.');const actor=game.actors.get(this.actorId)||allCharacters()[0];if(!actor)throw Error('Select a character.');const id=action==='add-status'?root.querySelector('#agu-condition-status')?.value:b.dataset.status;
   if(!CONFIG.statusEffects.some(x=>x.id===id))throw Error('Unknown native status.');await actor.toggleStatusEffect(id,{active:action==='add-status'});await this.render();return;
  }
  if(action==='save-access'){if(!isGM())throw Error('GM only.');await game.settings.set(ID,'playerAccessEnabled',Boolean(root.querySelector('#agu-access')?.checked));ui.notifications.info('Player Access saved.');return;}
 }finally{b.disabled=false;}}
}
async function sendMessage(raw,root){if(!isGM())throw Error('GM only.');const content=String(raw).trim();if(!content||content.length>3000)throw Error('Message must be 1–3000 characters.');const selected=[...root.querySelectorAll('input[name="agu-recipient"]:checked')].map(x=>x.value),valid=selected.filter(id=>game.users.get(id)&&!game.users.get(id).isGM);if(valid.length!==selected.length)throw Error('Invalid recipients.');
 await ChatMessage.create({content:`<p>${E(content).replace(/\n/g,'<br>')}</p>`,whisper:valid.length?[...new Set([...valid,...game.users.filter(u=>u.isGM).map(u=>u.id)])]:[],speaker:ChatMessage.getSpeaker()});
}
async function rollFromActor(root){
 if(activeRoll)throw Error('A roll is already in progress.');if(!permitted())throw Error('Player Access hidden.');if(![...game.users].some(u=>u.isGM&&u.active))throw Error('A GM must be connected to receive this roll.');
 const s=activeSession();if(!s)throw Error('No active check.');const actor=game.actors.get(root.querySelector('#agu-roll-actor')?.value),skill=root.querySelector('#agu-roll-skill')?.value;
 if(!isOwned(actor)||!s.actors.includes(actor.id)||!s.skills.includes(skill))throw Error('Ineligible character or skill.');
 if(!s.slots.some(x=>x.actorId===actor.id&&x.status==='pending'))throw Error('No contributions remain for this character.');
 if(s.kind==='group'&&s.slots.some(x=>x.actorId===actor.id&&x.status==='accepted'&&x.skill===skill))throw Error('This character already used that skill.');
 if(typeof actor.rollSkill!=='function')throw Error('Native dnd5e rollSkill is unavailable.');
 activeRoll=true;let proof=null;const observe=msg=>{if(authorOf(msg)?.id===game.user.id&&msg.speaker?.actor===actor.id&&msg.rolls?.length&&!proof)proof=msg;};Hooks.on('createChatMessage',observe);
 try{
  const result=await actor.rollSkill({skill});if(result===false||!result)throw Error('Native roll cancelled.');if(!proof)await new Promise(resolve=>setTimeout(resolve,350));
  if(!proof)throw Error('Native roll appeared without verifiable chat evidence. No contribution was counted.');const total=Number(proof.rolls[0]?.total);if(!Number.isFinite(total))throw Error('Native roll total unavailable.');
  const msg=await ChatMessage.create({content:`Roll submitted: ${E(actor.name)} · ${E(skillName(skill))} · ${E(total)} (awaiting GM verification).`,speaker:ChatMessage.getSpeaker({actor}),whisper:[...new Set([...game.users.filter(u=>u.isGM).map(u=>u.id),game.user.id])],flags:{[ID]:{submission:{contract:'ag-utility-roll/0.1',sessionId:s.id,actorId:actor.id,skill,total,proofMessageId:proof.id}}}});
  if(!msg)throw Error('No submission message created.');ui.notifications.info('Roll submitted; awaiting GM acceptance.');
 }finally{Hooks.off('createChatMessage',observe);activeRoll=false;}
}
async function open(){if(!permitted())throw Error('Utilities access is hidden by the GM.');if(!windowInstance||!windowInstance.rendered)windowInstance=new UtilitiesApp();await windowInstance.render({force:true});return windowInstance;}
function refreshWindows(){
 if(!permitted()&&!isGM()){
  document.querySelectorAll(`[data-ag-launcher="${ID}"]`).forEach(x=>x.remove());if(windowInstance?.rendered)windowInstance.close().catch(error);
 } else if(windowInstance?.rendered&&!activeRoll){windowInstance.render().catch(error);}
 addLauncher(ui?.actors,ui?.actors?.element);
}
function incomingSession(){
 const s=activeSession();if(!s||!permitted()||isGM())return;
 if(!s.actors.some(id=>isOwned(game.actors.get(id))))return;
 if(s.id===lastPromptedSession)return;
 lastPromptedSession=s.id;
 ui.notifications?.info(`New ${sessionKind(s)}: ${s.name}. Open Utilities to roll.`);
 if(!windowInstance||!windowInstance.rendered)windowInstance=new UtilitiesApp();
 windowInstance.tab=s.kind==='group'?'checks':'rolls';
 windowInstance.render({force:true}).catch(error);
}
function sessionChanged(){refreshWindows();incomingSession();}
function addLauncher(app,html){
 mountLauncher(launcherRoot(app,html),{moduleId:ID,label:'Utilities',icon:'fa-solid fa-dice-d20',onClick:()=>open(),visible:permitted()});
}
Hooks.once('init',()=>{
 game.settings.register(ID,'playerAccessEnabled',{name:'Utilities: Player Access',hint:'New module player launcher starts Hidden until enabled by GM.',scope:'world',config:true,type:Boolean,default:false,onChange:refreshWindows});
 game.settings.register(ID,'activeSession',{name:'Utilities: Active Interaction',scope:'world',config:false,type:Object,default:{},onChange:sessionChanged});
 game.settings.register(ID,'history',{name:'Utilities: Interaction History',scope:'world',config:false,type:Array,default:[],onChange:refreshWindows});
});
Hooks.once('ready',()=>{
 const m=game.modules.get(ID);
 m.api={version:VERSION,contract:'ag-utilities/0.2-alpha',open,playerAccess:{contract:'ag-player-access/1',getState:()=>({contract:'ag-player-access/1',moduleId:ID,audience:'player',playerAccessEnabled:game.settings.get(ID,'playerAccessEnabled'),configurable:true}),setEnabled:async enabled=>{if(!isGM())throw Error('GM only.');if(typeof enabled!=='boolean')throw TypeError('Boolean required.');await game.settings.set(ID,'playerAccessEnabled',enabled);return m.api.playerAccess.getState();}}};
 Hooks.on('renderActorDirectory',addLauncher);Hooks.on('createChatMessage',msg=>{void processSubmission(msg).catch(error);});
 for(const ev of ['updateActor','createActiveEffect','updateActiveEffect','deleteActiveEffect'])Hooks.on(ev,()=>{if(windowInstance?.rendered&&!activeRoll)windowInstance.render().catch(error);});
 Hooks.on('updateUser',refreshWindows);addLauncher(ui?.actors,ui?.actors?.element);
 lastPromptedSession=activeSession()?.id||null;
 console.info(`${ID} ${VERSION} Alpha initialized. Foundry V14/dnd5e 6.0.6 live acceptance pending.`);
});
