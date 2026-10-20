import {ID,VERSION,SKILL_IDS,escapeHTML as E,createSession,summary,acceptRoll,skipRoll,resolveNow,cancelSession,projectSession,MAX_HISTORY,formatBonus,skillBonus,skillRollMode,tallyHTML,describeTableResult,resolveStatusSources,removeUnknownStatus,isUnlocked,withUnlocked,removalDecision,conditionGroups,stashRow,historyEntry,appendHistory,approvalLabel,STASH_HISTORY_CAP,rollFormSession,normalizeTab,readGp,planGoldAward,goldAwardEntry,planGoldUndo,applyGoldUndo,goldCardHTML,COINS,COIN_LABELS,entryCoin,readCoin,readCoins,planCoinMove,planPurseAdjust,purseEntry,purseUndoable,planPurseUndo,applyPurseUndo,purseLine,PURSE_KINDS,CONSENT_TIMEOUT_MS,consentVoters,createPoll,recordVote,pollOutcome} from './core.mjs';
import {launcherRoot,mountLauncher} from './ag-launchers.mjs';
import {confirmDialog,infoDialog,formDialog} from './dialogs.mjs';

const {ApplicationV2}=foundry.applications.api;
let windowInstance=null;
let overlayInstance=null;
const SOCKET=`module.${ID}`;
let activeRoll=false;
let saving=false;
let sessionQueue=Promise.resolve();
let lastPromptedSession=null;
function queueSession(task){const next=sessionQueue.then(task);sessionQueue=next.catch(()=>{});return next;}
const isGM=()=>Boolean(game.user?.isGM);
const permitted=()=>isGM()||game.settings.get(ID,'playerAccessEnabled')===true;
const getSession=()=>game.settings.get(ID,'activeSession')||{};
const getHistory=()=>game.settings.get(ID,'history')||[];
const getResult=()=>{const s=game.settings.get(ID,'lastResult');return s?.schema==='ag-utilities-session/0.1'&&s.status==='completed'?s:null;};
const activeSession=()=>{const s=getSession();return s?.schema==='ag-utilities-session/0.1'&&s.status==='active'?s:null;};
const isOwned=(actor,user=game.user)=>Boolean(actor&&(user?.isGM||actor.testUserPermission?.(user,'OWNER')));
const allCharacters=()=>[...game.actors].filter(a=>a.type==='character').sort((a,b)=>a.name.localeCompare(b.name));
const permittedActors=()=>allCharacters().filter(a=>isOwned(a));
const ownedIds=()=>permittedActors().map(a=>a.id);
const skillName=k=>game.i18n.localize(CONFIG.DND5E?.skills?.[k]?.label??k);
const statusConfig=k=>CONFIG.statusEffects?.find(x=>x.id===k);
const statusName=k=>game.i18n.localize(statusConfig(k)?.name??k);
const nativeIds=()=>(CONFIG.statusEffects||[]).map(x=>x.id);
const getUnlocks=()=>game.settings.get(ID,'conditionUnlocks')||{};
/** Party characters this user can see (Limited or better); the GM sees all of them. */
const partyCharacters=(user=game.user)=>allCharacters().filter(a=>user?.isGM||a.testUserPermission?.(user,'LIMITED'));
const canRemove=(actor,id,user=game.user)=>removalDecision({user,actor,statusId:id,unlocks:getUnlocks(),nativeIds:nativeIds()}).ok;
const error=e=>{console.error(`[${ID}]`,e);ui.notifications?.error(e?.message||String(e));};
const option=(id,title,selected)=>`<option value="${E(id)}" ${id===selected?'selected':''}>${E(title)}</option>`;
const btn=(action,title,{disabled=false,kind='',attrs=''}={})=>`<button type="button" class="${E(kind)}" data-action="${E(action)}" ${disabled?'disabled':''} ${attrs}>${E(title)}</button>`;
const empty=msg=>`<div class="ag-empty agu-empty">${E(msg)}</div>`;
/** Manager's player-safe My Appearance window, or null when Manager (or that API) is absent. */
const appearanceOpener=()=>{const m=game.modules.get('ashen-gate-manager');const open=m?.active?m.api?.appearance?.openMyAppearance:null;return typeof open==='function'?open:null;};
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
   // A finished check stays on screen for everyone until the GM clears it (or starts the next one).
   await game.settings.set(ID,'lastResult',s.status==='completed'?{...s,audit:[],slots:s.slots.map(x=>({...x,proofMessageId:null,userId:null}))}:{});
   await game.settings.set(ID,'activeSession',{});
 } finally {saving=false;}
 if(s.status==='completed'&&s.kind==='group')await postTally(s);
}
/** GM-only chat summary of a finished Group Check. A chat failure never loses the stored result. */
async function postTally(s){
 try{
  await ChatMessage.create({content:tallyHTML(s,{actorName:id=>game.actors.get(id)?.name??'Unavailable Actor',skillLabel:skillName}),whisper:[...game.users].filter(u=>u.isGM).map(u=>u.id),speaker:ChatMessage.getSpeaker?.()??{}});
 }catch(e){console.warn(`[${ID}] Could not post the Group Check tally`,e);ui.notifications?.warn?.(`Utilities could not post the "${s.name}" tally to chat (${e?.message??e}). The result is saved: see Rolls or History.`);}
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
   const s=activeSession();if(!s||s.id!==payload.sessionId)throw Error('That check has already ended.');
   // Roll type/skill attestation in the native chat payload requires dnd5e 6.0.6 in-world verification.
   acceptRoll(s,{actorId:actor.id,skill:payload.skill,total,userId:author.id,proofMessageId:proof.id});
   await storeSession(s);
  });
 }catch(e){console.warn(`[${ID}] Rejected roll submission ${message.id}: ${e.message}`);await tellRejected(author,actor,e.message);}
}
/** The submitter (and GMs) see why a roll was not counted, instead of waiting on "awaiting GM acceptance". */
async function tellRejected(author,actor,reason){
 if(!author)return;
 try{await ChatMessage.create({content:`Roll not counted${actor?` for ${E(actor.name)}`:''}: ${E(reason)}`,speaker:ChatMessage.getSpeaker?.()??{},whisper:[...new Set([...[...game.users].filter(u=>u.isGM).map(u=>u.id),author.id])]});}
 catch(e){console.warn(`[${ID}] Could not report the rejected roll`,e);}
}
function actorsCheckboxes(ticked=[]){const a=allCharacters(),on=new Set(ticked);return a.length?`<div class="agu-choices">${a.map(x=>`<label class="agu-inline"><input type="checkbox" name="agu-participant" value="${E(x.id)}" ${on.has(x.id)?'checked':''}> ${E(x.name)}</label>`).join('')}</div>`:empty('Create two disposable character Actors in the Actors directory before starting a check.');}
function skillChoices(){return `<div class="agu-choices">${SKILL_IDS.map(s=>`<label class="agu-inline"><input type="checkbox" name="agu-skill" value="${E(s)}" ${['acr','ath','prc'].includes(s)?'checked':''}>${E(skillName(s))}</label>`).join('')}</div>`;}
/** Characters ticked by default: the dnd5e Primary Party, else characters owned by connected players. */
function partyDefaults(){try{return goldDefaults().actorIds;}catch{return [];}}
/** One start form for both kinds: Group result (a Group Check) or Individual rolls (a Roll Request). */
function createPanel(app){if(!isGM())return '';
 if(activeSession())return `<div class="agu-note">${E(notice())}</div>`;
 const group=app.rollMode!=='individual',radio=(v,label,hint,on)=>`<label class="agu-inline agu-mode"><input type="radio" name="agu-mode" value="${v}" ${on?'checked':''}><span><strong>${E(label)}</strong><br><small>${E(hint)}</small></span></label>`;
 return `<section class="ag-card agu-card"><h2>Start Rolls</h2>
 <fieldset><legend>Result</legend><div class="agu-choices">${radio('group','Group result','Everyone rolls; the average of the rolls is compared with the DC for one pass or fail.',group)}${radio('individual','Individual rolls','Each character makes one roll of one skill; each result is shown on its own.',!group)}</div></fieldset>
 <label>Title<input id="agu-title" maxlength="120" placeholder="${group?'New Group Check':'New Roll Request'}"></label>
 <fieldset><legend>Participating characters</legend>${actorsCheckboxes(partyDefaults())}</fieldset>
 <fieldset><legend>Skills</legend><p class="agu-note" id="agu-skill-hint">${group?'Characters choose from the ticked skills.':'Tick exactly one skill.'}</p>${skillChoices()}</fieldset>
 <div class="agu-compact"><label>DC <input id="agu-dc" type="number" min="0" max="100" value="15"></label><label data-group-only ${group?'':'hidden'}>Rolls per character <select id="agu-roll-count">${[1,2,3,4,5].map(n=>option(String(n),String(n),'1')).join('')}</select></label></div>
 <p class="agu-note">Leave the DC empty to record rolls without a pass or fail. Players pick advantage or disadvantage when they roll.</p>
 <div class="agu-actions">${btn('start','Start Rolls',{kind:'primary'})}</div></section>`;
}
/** GM-only start. Reads the Rolls form; one active slot, so a second start is refused whatever its mode. */
async function startRolls(form){
 if(!isGM())throw Error('GM only.');
 if(activeSession())throw Error('Resolve or cancel the active interaction first.');
 const dcText=String(form.dc??'').trim();
 const session=rollFormSession({...form,dc:dcText===''?null:Number(dcText),id:crypto.randomUUID(),createdBy:game.user.id});
 await queueSession(async()=>{if(activeSession())throw Error('An active interaction already exists.');if(getResult())await game.settings.set(ID,'lastResult',{});await storeSession(session);});
 return session;
}
function slotText(slot,kind){return slot.status==='accepted'?`${slot.total} · ${labelSkill(slot.skill)}`:slot.status==='skipped'?'Skipped':'Waiting';}
const modeLabels={'0':'Normal','1':'Advantage','-1':'Disadvantage'};
const modeHint=m=>m.sources.length?`Preset from ${m.sources.join('; ')}. You can change it.`:'No advantage or disadvantage found on the sheet or effects. You can still choose one.';
const bonusText=(actor,skill)=>formatBonus(skillBonus(actor,skill));
function checkBar(slots){
 const done=slots.filter(x=>x.status!=='pending').length;
 return `<div class="ag-checkbar" role="progressbar" aria-valuemin="0" aria-valuemax="${slots.length}" aria-valuenow="${done}" aria-label="Rolls resolved">${slots.map(x=>`<span class="ag-checkbar-seg ${E(x.status)}"></span>`).join('')}</div>`;
}
function verdictOf(s,sm){return s.dc===null?'Recorded':sm.result==='success'?'Success':sm.result==='failure'?'Failure':'No Result';}
function resultView(res){const kind=res.kind;
 const projected=projectSession(res,{userId:game.user.id,isGM:isGM(),ownedActorIds:ownedIds()}),sm=summary(projected);
 const verdict=kind==='group'?verdictOf(res,sm):'Responses';
 const cls=verdict==='Success'?'success':verdict==='Failure'?'failure':'';
 const rows=projected.actors.map(id=>{
  const cells=projected.slots.filter(x=>x.actorId===id).map(sl=>{
   const text=sl.status==='accepted'?(sl.total===null?'Roll hidden':`${labelSkill(sl.skill)} ${sl.total}${kind==='request'&&res.dc!==null?` · ${sl.total>=res.dc?'Success':'Failure'}`:''}`):sl.status==='skipped'?'Skipped':'No roll';
   return `<span class="ag-badge agu-pill ${E(sl.status)}">${E(text)}</span>`;
  }).join('');
  return `<div class="agu-participant"><strong>${E(game.actors.get(id)?.name||'Unavailable Actor')}</strong><div class="agu-contributions">${cells}</div></div>`;
 }).join('');
 const avg=kind==='group'&&sm.average!==null?`<div class="ag-result-score"><span class="ag-result-num">${E(sm.average.toFixed(1))}</span><span class="ag-result-vs">average${res.dc===null?'':` vs DC ${E(res.dc)}`}</span></div>`:'';
 return `<section class="agu-card ag-card ag-result ${cls}"><div class="agu-line"><h2>${E(res.name)}</h2><span class="ag-badge agu-pill">${E(sessionKind(res))} · finished</span></div><div class="ag-result-verdict">${E(verdict)}</div>${avg}${rows}${isGM()?`<div class="agu-actions">${btn('clear-result','Clear Result',{kind:'primary ag-btn'})}</div><p class="agu-note">Everyone sees this result until you clear it or start the next check.</p>`:''}</section>`;
}
function sessionView(session,app){
 const projected=projectSession(session,{userId:game.user.id,isGM:isGM(),ownedActorIds:ownedIds()});
 const sum=summary(projected),pending=projected.slots.filter(x=>x.status==='pending'&&isOwned(game.actors.get(x.actorId)));
 const actorIds=[...new Set(pending.map(x=>x.actorId))];
 const selected=actorIds.includes(app.rollActorId)?app.rollActorId:actorIds[0];
 const selectedActor=game.actors.get(selected);
 const acceptedSkill=new Set(projected.slots.filter(x=>x.actorId===selected&&x.status==='accepted').map(x=>x.skill));
 const skills=session.skills.filter(s=>!acceptedSkill.has(s));
 const headline=session.kind==='group'?'Team progress':'Responses';
 const rows=projected.actors.map(id=>{
  const actor=game.actors.get(id),slots=projected.slots.filter(x=>x.actorId===id);
  const cells=slots.map(s=>`<span class="ag-badge agu-pill ${E(s.status)}">${E(slotText(s,session.kind))}</span>`).join('');
  const bonuses=isGM()&&actor&&slots.some(x=>x.status==='pending')?`<small class="agu-bonuses">${session.skills.map(k=>`${E(skillName(k))} ${E(bonusText(actor,k))}`).join(' · ')}</small>`:'';
  return `<div class="agu-participant"><div class="agu-who"><strong>${E(actor?.name||'Unavailable Actor')}</strong>${bonuses}</div><div class="agu-contributions">${cells}</div>${isGM()&&slots.some(x=>x.status==='pending')?btn('skip','Skip One',{attrs:`data-actor="${E(id)}"`}):''}</div>`;
 }).join('');
 const preset=selectedActor&&skills[0]?skillRollMode(selectedActor,skills[0]):{mode:0,sources:[]};
 const skillOptions=skills.map(x=>option(x,`${skillName(x)} (${bonusText(selectedActor,x)})`,x)).join('');
 const rollForm=actorIds.length?`<section class="agu-action-panel"><h3>Your roll is requested</h3><p class="agu-note">${E(session.name)} · ${session.kind==='group'?'Choose one of the allowed skills.':'Roll the requested skill.'}</p><div class="agu-compact"><label>Character<select id="agu-roll-actor">${actorIds.map(id=>option(id,game.actors.get(id)?.name??'Unavailable',selected)).join('')}</select></label><label>Skill (bonus)<select id="agu-roll-skill">${skillOptions}</select></label><label>Roll<select id="agu-roll-mode">${['0','1','-1'].map(m=>option(m,modeLabels[m],String(preset.mode))).join('')}</select></label></div><p class="agu-note" id="agu-mode-hint">${E(modeHint(preset))}</p>${btn('roll','Roll Now',{kind:'primary ag-btn agu-roll-large',disabled:!skills.length})}</section>`:'';
 return `<section class="ag-card agu-card"><div class="agu-line"><h2>${E(session.name)}</h2><span class="ag-badge ag-badge--accent agu-pill">${E(sessionKind(session))}</span></div>
 <p class="agu-note agu-big">${session.kind==='group'?`DC ${E(session.dc??'none')} · ${session.rollsPerActor} per character · unique skills`:`Public ${E(skillName(session.skills[0]))} request · ${session.dc===null?'No DC':`DC ${E(session.dc)}`}`}</p>
 <div class="agu-line agu-big"><strong>${E(headline)}</strong><strong>${sum.accepted+sum.skipped}/${sum.totalSlots} resolved</strong></div>
 ${checkBar(projected.slots)}
 ${isGM()?`<p class="agu-note agu-big">${session.kind==='group'?`Average ${sum.average===null?'—':sum.average.toFixed(1)}`:`${sum.accepted} responses accepted`}</p>`:''}
 ${isGM()?rows+rollForm:rollForm+`<p class="agu-note">${sum.pending} contribution(s) still pending.</p>`}
 ${isGM()?`<div class="agu-actions">${btn('resolve','End & Record',{kind:'primary ag-btn'})}${btn('cancel','Cancel Session',{kind:'danger ag-btn'})}</div>`:''}
 </section>`;
}
function rollsView(app){const active=activeSession(),res=getResult();
 const idle=res?resultView(res):isGM()?empty('No rolls running. Start one below.'):empty('No active roll request for your character.');
 return (active?sessionView(active,app):idle)+createPanel(app);}
function stashActor(){return game.actors.find(a=>a.getFlag(ID,'partyStash')===true);}
const stashEnabled=()=>game.settings.get(ID,'stashEnabled')===true;
/** Defaults to ON: only an explicit false turns the party vote off. */
const stashVoteRequired=()=>game.settings.get(ID,'stashVoteRequired')!==false;
/** Coin vote: '' (never saved) follows the item vote; 'on'/'off' once the GM has saved it. */
const purseVoteRequired=()=>{const v=game.settings.get(ID,'purseVoteRequired');return v==='on'?true:v==='off'?false:stashVoteRequired();};
function inventoryView(app){
 const stash=stashActor(),on=stashEnabled();
 if(!isGM())return on&&stash?stashPanel(app):`<section class="ag-card agu-card"><h2>Party Stash</h2>${empty(stash?'The GM has turned the party stash off.':'There is no party stash yet.')}</section>`;
 const count=stash?stash.items.size??[...stash.items].length:0;
 return `<section class="ag-card agu-card"><div class="agu-line"><h2>Party Stash</h2><span class="ag-badge agu-pill ${on?'ag-badge--ok':''}">${on?'On for players':'Off for players'}</span></div><p class="agu-note">The stash is an NPC Actor kept by Utilities. While it is on, players get Observer permission on it so they can read item sheets; Utilities moves items for them through the GM client. You can move items freely.</p>${stash?`<p>Stash: <strong>${E(stash.name)}</strong> · ${E(count)} item(s)</p><div class="agu-actions">${btn('toggle-stash',on?'Turn Off for Players':'Turn On for Players',{kind:on?'danger':''})}${btn('gold-award','Award Gold',{kind:'primary'})}</div>`:empty('No party stash yet.')+`<div class="agu-actions">${btn('gold-award','Award Gold')}${btn('create-stash','Create Party Stash',{kind:'primary'})}</div>`}</section>${stash?stashPanel(app):''}`;
}
async function openUuid(uuid){const doc=await fromUuid(uuid);if(!doc?.sheet)throw Error('That document could not be found or has no sheet.');doc.sheet.render(true);}
function tableView(app){if(!isGM())return empty('Only the GM can roll and distribute RollTable messages.');
 const tables=[...game.tables].sort((a,b)=>a.name.localeCompare(b.name));
 const recipients=[...game.users].filter(u=>!u.isGM).map(u=>`<label class="agu-inline"><input type="checkbox" name="agu-recipient" value="${E(u.id)}">${E(u.name)}</label>`).join('');
 return `<section class="ag-card agu-card"><h2>RollTable Messenger</h2><p class="agu-note">Rolls with Foundry's own RollTable draw. Text, document and compendium results are supported; documents are linked in the message.</p><label>Foundry RollTable<select id="agu-table">${tables.map(t=>option(t.id,t.name,t.id)).join('')}</select></label><div class="agu-actions">${btn('table-roll','Roll Privately',{disabled:!tables.length})}</div><label>Outgoing message<textarea id="agu-table-message" rows="3">${E(app.tableDraft)}</textarea></label><fieldset><legend>Recipients (none = public to all)</legend><div class="agu-choices">${recipients||empty('No players connected.')}</div></fieldset><label class="agu-inline"><input type="checkbox" id="agu-table-auto" ${app.tableAuto?'checked':''}>Auto-Send drawn results</label><div class="agu-actions">${btn('table-send','Send Message',{kind:'primary',disabled:!app.tableDraft.trim()})}</div></section>${drawPanel(app)}`;
}
function drawPanel(app){const d=app.lastDraw;if(!d?.length)return '';
 return `<section class="ag-card agu-card"><h3>Last draw</h3>${d.map(r=>r.kind==='document'?`<div class="agu-participant"><span class="agu-status-title">${r.img?`<img class="agu-status-icon" src="${E(r.img)}" alt="">`:''}<strong>${E(r.label)}</strong><span class="ag-badge agu-pill">Document</span></span>${btn('open-uuid','Open',{attrs:`data-open-uuid="${E(r.uuid)}"`})}</div>`:`<div class="agu-participant"><span>${E(r.label)}</span></div>`).join('')}</section>`;}
function conditionIcon(id){const cfg=statusConfig(id),img=cfg?.img??cfg?.icon;return typeof img==='string'&&img&&!/^\s*javascript:/i.test(img)?`<img class="agu-status-icon" src="${E(img)}" alt="">`:'';}
function statusSourceLine(actor,id){
 const sources=resolveStatusSources(actor,id);
 if(!sources.length)return `<small class="agu-source">No active effect found for this status; it may come from the system or another module.</small>`;
 return sources.map(x=>{
  let origin='';
  if(x.origin){let doc=null;try{doc=fromUuidSync(x.origin);}catch{}
   origin=` · from ${doc?.name?`<a class="agu-link" data-open-uuid="${E(x.origin)}" href="#" role="button">${E(doc.name)}</a>`:E(x.parentName||'unknown source')}`;}
  else if(x.parentName&&!x.onActor)origin=` · from ${E(x.parentName)}`;
  return `<small class="agu-source">Effect: <strong>${E(x.name)}</strong>${origin}${x.onActor?'':' (item effect: Remove disables it)'}${x.disabled?' (disabled)':''}</small>`;
 }).join('');
}
function lockBadge(actor){return isUnlocked(getUnlocks(),actor.id)?`<span class="ag-badge ag-badge--ok agu-pill" title="Its owner can remove native conditions"><i class="fa-solid fa-lock-open" aria-hidden="true"></i>Unlocked</span>`:`<span class="ag-badge agu-pill" title="Only the GM can remove conditions"><i class="fa-solid fa-lock" aria-hidden="true"></i>Locked</span>`;}
function conditionsView(app){const characters=partyCharacters();const actor=characters.find(a=>a.id===app.actorId)||characters[0];const statuses=actor?[...(actor.statuses||[])]:[],known=CONFIG.statusEffects||[];
 const showSources=actor&&(isGM()||actor.testUserPermission?.(game.user,'OBSERVER'));
 const roster=characters.map(a=>`<button type="button" data-condition-actor="${E(a.id)}" class="agu-roster-row ${actor?.id===a.id?'active':''}"><span class="agu-who"><span>${E(a.name)}</span>${lockBadge(a)}</span><span class="agu-roster-status">${[...(a.statuses||[])].map(s=>conditionIcon(s)+`<span title="${E(statusName(s))}">${E(statusName(s))}</span>`).join('')||'No conditions'}</span></button>`).join('');
 const details=statuses.length?statuses.map(id=>{const unknown=!statusConfig(id);
  return `<div class="agu-participant"><div class="agu-who"><span class="agu-status-title">${conditionIcon(id)}${E(statusName(id))}${unknown?'<span class="ag-badge agu-pill" title="Not a native Foundry status">Custom</span>':''}</span>${unknown&&showSources?statusSourceLine(actor,id):''}</div>${canRemove(actor,id)?btn('remove-status','Remove',{attrs:`data-status="${E(id)}"`}):''}</div>`;}).join(''):empty('No conditions on this character.');
 const unlocked=actor&&isUnlocked(getUnlocks(),actor.id);
 const lockLine=actor?`<div class="agu-line agu-lock-line"><span>Removal by owner: ${lockBadge(actor)}</span>${isGM()?btn('toggle-lock',unlocked?'Lock Removal':'Unlock for Owner',{kind:'ag-btn ag-btn--sm',attrs:`data-actor="${E(actor.id)}"`}):''}</div>`:'';
 const overlayOn=game.settings.get(ID,'overlayOpen')===true;
 return `<section class="ag-card agu-card"><div class="agu-line"><h2>Party Conditions</h2>${btn('toggle-overlay',overlayOn?'Close Overlay':'Pop Out Overlay',{kind:'ag-btn ag-btn--sm',attrs:`aria-pressed="${overlayOn}"`})}</div><div class="agu-party-panes"><section><h3>Party Characters</h3>${roster||empty('No characters you can see. The GM can give you Limited or Observer permission on party characters.')}</section><section><h3>${E(actor?.name||'Select a character')}</h3>${lockLine}${details}${isGM()&&actor?`<div class="agu-compact"><label>Native condition<select id="agu-condition-status">${known.map(x=>option(x.id,statusName(x.id),x.id)).join('')}</select></label>${btn('add-status','Apply',{kind:'primary'})}</div>`:''}</section></div><p class="agu-note">Condition removal is locked for every character until the GM unlocks it; an unlocked character's owner can then remove its native conditions. Statuses Foundry does not list (shown as Custom) are traced to the effect that grants them, and only the GM can remove them. Automatic duration, exhaustion and concentration management are not part of Utilities.</p></section>`;
}
function historyView(app){if(!isGM())return empty('History is GM-only.');
 const history=getHistory();return `<section class="ag-card agu-card"><h2>Completed & Cancelled Checks</h2>${history.length?history.map(s=>{
  const sm=summary(s),detail=s.slots.map(sl=>`${game.actors.get(sl.actorId)?.name??'Unavailable Actor'}: ${sl.status==='accepted'?`${sl.skill?skillName(sl.skill):'Roll'} ${sl.total}${s.kind==='request'&&s.dc!==null?` (${sl.total>=s.dc?'Success':'Failure'} vs DC ${s.dc})`:''}`:sl.status}`).join(' · ');
  const outcome=s.status==='cancelled'?'Cancelled':sm.result==='no-result'?'No Result':sm.result==='completed'?'Recorded':sm.result==='success'?'Success':'Failure';
  return `<div class="agu-history"><div class="agu-line"><strong>${E(s.name)}</strong><span>${E(sessionKind(s))} · ${E(outcome)}</span></div><p>${E(detail)}</p><small>${E(new Date(s.closedAt||s.createdAt).toLocaleString())}${s.kind==='group'&&sm.average!==null?` · Average ${E(sm.average.toFixed(1))}`:''}</small></div>`;
 }).join(''):empty('No completed interactions yet.')}</section>`;
}
function helpHtml(){const gm=isGM();return `<p><strong>Utilities</strong> holds the party tools for running a session.</p><ul><li><strong>Rolls</strong>: ${gm?'pick characters and skills and send a roll to players. <em>Group result</em> averages everyone\'s rolls against the DC for one pass or fail (a Group Check); <em>Individual rolls</em> asks each character for one roll of one skill and shows each result (a Roll Request). Only one can run at a time; it ends when everyone has rolled, or you can end it early.':'when the GM asks for a roll, roll it here for your character.'}</li><li><strong>Party Inventory</strong>: the shared party stash${gm?', which you turn on or off for players':''}, and the <strong>Party purse</strong> (copper to platinum): deposit coins from your character or take them out${gm?'; you can also Adjust the purse directly and Undo adjustments and takes in History, and turn the coin vote on or off in GM Setup':' (taking out uses the party vote when the GM has it on for coins)'}.</li><li><strong>Roll Tables</strong>: roll a table and ${gm?'send the result to chat or selected players':'view results the GM shares'}.</li><li><strong>Conditions</strong>: see and remove the native conditions on party characters.</li>${gm?'<li><strong>History</strong>: finished Group Checks and Roll Requests.</li><li><strong>GM Setup</strong>: Player Access and other settings.</li>':''}</ul>${gm?'<p>Skipping a contribution, ending or cancelling a check, clearing stash history and removing a non-native condition ask you to confirm first.</p>':''}`;}
function setupView(){return `<section class="ag-card agu-card"><h2>GM Setup</h2><label class="agu-inline"><input id="agu-access" type="checkbox" ${game.settings.get(ID,'playerAccessEnabled')?'checked':''}>Enable Player Access</label><p class="agu-note">This controls the player-facing Utilities launcher, not native Actor ownership.</p><label class="agu-inline"><input id="agu-stash-enabled" type="checkbox" ${stashEnabled()?'checked':''}>Party Stash on for players</label><p class="agu-note">Off: players can't see the stash or move items in or out. You can always manage it.</p><label class="agu-inline"><input id="agu-stash-vote" type="checkbox" ${stashVoteRequired()?'checked':''}>Party must accept when a player takes an item out</label><p class="agu-note">On: any other player can deny, and no answer in 60 seconds cancels. Off: players take items out freely. You are never voted on. Every move is recorded in the stash History tab either way.</p><label class="agu-inline"><input id="agu-purse-vote" type="checkbox" ${purseVoteRequired()?'checked':''}>Party must accept when a player takes coins out</label><p class="agu-note">Same rules as the item vote, but for the party purse and set separately. Until you save GM Setup it follows the item setting above.</p><div class="agu-actions">${btn('save-access','Save Changes',{kind:'primary'})}</div></section>`;}
class UtilitiesApp extends ApplicationV2 {
 static DEFAULT_OPTIONS={id:'ashen-gate-utilities-window',classes:['ag-app','ag-utilities'],window:{title:'Ashen Gate | Utilities',resizable:true,minimizable:true},position:{width:900,height:690}};
 constructor(...args){super(...args);this.tab='rolls';this.rollMode='group';this.actorId='';this.rollActorId='';this.tableDraft='';this.tableAuto=false;this.lastDraw=[];this.filter='';this.takeActorId='';this.stashTab='items';this.historyShown=HISTORY_PAGE;this.purseCoin='gp';this.purseAmount='';}
 async _renderHTML(){if(!permitted())throw Error('Utilities is hidden for players.');this.tab=normalizeTab(this.tab);const tabs=[['rolls','Rolls'],['inventory','Party Inventory'],['tables','Roll Tables'],['conditions','Conditions'],...(isGM()?[['history','History'],['setup','GM Setup']]:[])];
  const body=this.tab==='rolls'?rollsView(this):this.tab==='inventory'?inventoryView(this):this.tab==='tables'?tableView(this):this.tab==='conditions'?conditionsView(this):this.tab==='history'&&isGM()?historyView(this):this.tab==='setup'&&isGM()?setupView():empty('Unavailable view.');
  return `<div class="agu-root"><header class="ag-header agu-header"><div class="ag-header__title"><h1><span class="ag-header__brand">Ashen Gate</span> | Utilities</h1><p>Group challenges, individual requests and party utilities</p></div><div class="ag-header__meta">${appearanceOpener()?`<button type="button" class="ag-btn ag-btn--ghost" data-open-appearance title="Choose your Ashen Gate appearance"><i class="fa-solid fa-palette" aria-hidden="true"></i>Appearance</button>`:''}<button type="button" class="ag-btn ag-btn--ghost" data-action="help"><i class="fa-solid fa-circle-question" aria-hidden="true"></i>Help</button><span class="agu-version">v${VERSION} Alpha · ${isGM()?'GM':'Player'}</span></div></header><nav class="ag-tabs agu-tabs" aria-label="Utility sections">${tabs.map(([id,label])=>`<button type="button" data-tab="${id}" aria-current="${this.tab===id?'page':'false'}" class="${this.tab===id?'active':''}">${E(label)}</button>`).join('')}</nav><main class="agu-main">${body}</main><footer class="ag-footer agu-footer"><span>Foundry V14 · dnd5e 6.0.6 target · live acceptance pending</span><span>${this.tab==='inventory'?`Party stash: ${stashEnabled()?'on':'off'} for players`:'Native permissions apply'}</span></footer></div>`;
 }
 // Appearance needs no wiring here: the kit's --ag-* tokens are inherited from the document,
 // which General Manager (when active) keeps in sync with the user's skin.
 _replaceHTML(html,content){content.innerHTML=html;this.bind(content);}
 bind(root){
  for(const el of root.querySelectorAll('[data-tab]'))el.addEventListener('click',async()=>{this.tab=el.dataset.tab;await this.render();});
  for(const r of root.querySelectorAll('input[name="agu-mode"]'))r.addEventListener('change',()=>{this.rollMode=r.value;const group=r.value==='group';
   for(const el of root.querySelectorAll('[data-group-only]'))el.hidden=!group;
   const hint=root.querySelector('#agu-skill-hint');if(hint)hint.textContent=group?'Characters choose from the ticked skills.':'Tick exactly one skill.';
   const title=root.querySelector('#agu-title');if(title)title.placeholder=group?'New Group Check':'New Roll Request';
   if(!group)[...root.querySelectorAll('input[name="agu-skill"]:checked')].slice(1).forEach(x=>{x.checked=false;});});
  root.querySelector('[data-open-appearance]')?.addEventListener('click',()=>{const open=appearanceOpener();if(!open)return ui.notifications?.warn('General Manager is not active, so there are no appearance settings to open.');Promise.resolve(open()).catch(error);});
  for(const b of root.querySelectorAll('[data-condition-actor]'))b.addEventListener('click',async()=>{this.actorId=b.dataset.conditionActor;await this.render();});
  root.querySelector('#agu-roll-actor')?.addEventListener('change',e=>{this.rollActorId=e.target.value;this.render().catch(error);});
  root.querySelector('#agu-roll-skill')?.addEventListener('change',e=>{const actor=game.actors.get(root.querySelector('#agu-roll-actor')?.value),m=actor?skillRollMode(actor,e.target.value):{mode:0,sources:[]};const sel=root.querySelector('#agu-roll-mode');if(sel)sel.value=String(m.mode);const hint=root.querySelector('#agu-mode-hint');if(hint)hint.textContent=modeHint(m);});
  for(const b of root.querySelectorAll('[data-open-uuid]'))b.addEventListener('click',ev=>{ev.preventDefault();openUuid(b.dataset.openUuid).catch(error);});
  root.querySelector('#agu-table-message')?.addEventListener('input',e=>{this.tableDraft=e.target.value;const b=root.querySelector('[data-action="table-send"]');if(b)b.disabled=!this.tableDraft.trim();});
  root.querySelector('#agu-table-auto')?.addEventListener('change',e=>{this.tableAuto=e.target.checked;});
  this.bindStash(root);
  for(const b of root.querySelectorAll('[data-action]'))b.addEventListener('click',()=>this.handle(b.dataset.action,b,root).catch(error));
 }
 async handle(action,b,root){if(b.disabled)return;b.disabled=true;try{
  if(action==='start'){
   const val=q=>root.querySelector(q)?.value,checked=n=>[...root.querySelectorAll(`input[name="${n}"]:checked`)].map(x=>x.value);
   const session=await startRolls({mode:checked('agu-mode')[0]??this.rollMode??'group',title:val('#agu-title'),actors:checked('agu-participant'),skills:checked('agu-skill'),rollsPerActor:val('#agu-roll-count')??1,dc:val('#agu-dc')??''});
   ui.notifications.info(`${sessionKind(session)} sent to selected players.`);return;
  }
  if(action==='help'){await infoDialog('Utilities Help',helpHtml());return;}
  if(action==='roll'){await rollFromActor(root);return;}
  if(action==='clear-result'){if(!isGM())throw Error('GM only.');await game.settings.set(ID,'lastResult',{});return;}
  if(action==='skip'||action==='resolve'||action==='cancel'){
   if(!isGM())throw Error('GM only.');const session=activeSession();if(!session)throw Error('No active check.');
   const msg=action==='skip'?`Skip one contribution for ${game.actors.get(b.dataset.actor)?.name||'the character'}?`:action==='resolve'?'End now? All remaining contributions will be marked Skipped and the result saved to History.':'Cancel this interaction and save it in History?';
   if(!await confirmDialog(msg,{title:action==='skip'?'Skip contribution':action==='resolve'?'End check':'Cancel interaction',yes:action==='skip'?'Skip contribution':action==='resolve'?'End and record':'Cancel interaction',no:'Keep going'}))return;
   await queueSession(async()=>{const latest=activeSession();if(!latest||latest.id!==session.id)throw Error('Session has changed.');
    if(action==='skip')skipRoll(latest,{actorId:b.dataset.actor,reason:'GM-confirmed',userId:game.user.id});
    if(action==='resolve')resolveNow(latest,{userId:game.user.id});
    if(action==='cancel')cancelSession(latest,{userId:game.user.id});
    await storeSession(latest);
   });
   return;
  }
  if(action==='create-stash'){if(!isGM())throw Error('GM only.');if(stashActor())throw Error('Party Stash already exists.');await Actor.create({name:'Ashen Gate | Party Stash',type:'npc',ownership:{default:stashEnabled()?OBSERVER():0},flags:{[ID]:{partyStash:true}}});await this.render();return;}
  if(action==='stash-take'){await notifyResult(withdrawItem(b.dataset.item,root.querySelector('#agu-stash-target')?.value));return;}
  if(action==='stash-history-more'){this.historyShown+=HISTORY_PAGE;await this.render();return;}
  if(action==='stash-history-clear'){if(!await confirmDialog('Clear the whole stash history? This cannot be undone.',{title:'Clear stash history',yes:'Clear history'}))return;await clearStashHistory();this.historyShown=HISTORY_PAGE;ui.notifications?.info('Stash history cleared.');await this.render();return;}
  if(action==='gold-award'){if(await awardGoldDialog())await this.render();return;}
  if(action==='gold-undo'){
   if(!isGM())throw Error('GM only.');
   if(!await confirmDialog('Take this gold back from every character who still has it? Anyone who has already spent it keeps it, and you will be told who.',{title:'Undo gold award',yes:'Undo award'}))return;
   const res=await undoGoldAward(b.dataset.entry),ok=res.filter(r=>r.ok),no=res.filter(r=>!r.ok);
   const msg=`${ok.length?`Took back ${ok.map(r=>`${r.removed} ${r.coin??'gp'} from ${r.actorName}`).join(', ')}.`:'Nothing was taken back.'}${no.length?` Not undone: ${no.map(r=>r.reason).join(' ')}`:''}`;
   (no.length?ui.notifications?.warn:ui.notifications?.info)?.call(ui.notifications,msg);await this.render();return;
  }
  if(action==='purse-deposit'||action==='purse-take'){
   const args={actorId:root.querySelector('#agu-purse-actor')?.value,coin:root.querySelector('#agu-purse-coin')?.value,amount:Number(root.querySelector('#agu-purse-amount')?.value)};
   await notifyResult((action==='purse-deposit'?depositCoins:takeCoins)(args));return;
  }
  if(action==='purse-adjust'){if(await adjustPurseDialog())await this.render();return;}
  if(action==='purse-undo'){
   if(!isGM())throw Error('GM only.');
   if(!await confirmDialog('Undo this purse change? A take is undone only if the character still holds the coins; nothing goes below 0.',{title:'Undo purse change',yes:'Undo change'}))return;
   const r=await undoPurseEntry(b.dataset.entry);
   (r.ok?ui.notifications?.info:ui.notifications?.warn)?.call(ui.notifications,r.ok?'Purse change undone.':`Not undone: ${r.reason}`);await this.render();return;
  }
  if(action==='toggle-stash'){await setStashEnabled(!stashEnabled());await this.render();return;}
  if(action==='table-roll'){
   if(!isGM())throw Error('GM only.');const table=game.tables.get(root.querySelector('#agu-table')?.value);if(!table)throw Error('Choose a native RollTable.');
   if(typeof table.draw!=='function')throw Error('This Foundry version has no RollTable draw.');
   // Foundry's own draw handles formulas, ranges, replacement and drawn-state; we only present the results.
   const drawn=await table.draw({displayChat:false});const results=(drawn?.results||[]).map(describeTableResult);
   if(!results.length)throw Error('The table returned no results. It may be empty or fully drawn without replacement.');
   this.lastDraw=results;
   this.tableDraft=results.map(x=>x.chat).filter(Boolean).join('\n').slice(0,3000);
   if(!this.tableDraft.trim())throw Error('RollTable returned no text.');
   if(this.tableAuto){await sendMessage(this.tableDraft,root);this.tableDraft='';ui.notifications.info('RollTable result sent.');}
   await this.render();return;
  }
  if(action==='table-send'){if(!isGM())throw Error('GM only.');await sendMessage(root.querySelector('#agu-table-message')?.value||'',root);this.tableDraft='';await this.render();return;}
  if(action==='remove-status'){const actor=game.actors.get(this.actorId)||partyCharacters()[0];if(!actor)throw Error('Select a character.');await removeFromUI(actor,b.dataset.status);await this.render();return;}
  if(action==='add-status'){
   if(!isGM())throw Error('GM only.');const actor=game.actors.get(this.actorId)||allCharacters()[0];if(!actor)throw Error('Select a character.');const id=root.querySelector('#agu-condition-status')?.value;
   if(!CONFIG.statusEffects.some(x=>x.id===id))throw Error('Unknown native status.');
   await actor.toggleStatusEffect(id,{active:true});await this.render();return;
  }
  if(action==='toggle-lock'){await setUnlocked(b.dataset.actor,!isUnlocked(getUnlocks(),b.dataset.actor));return;}
  if(action==='toggle-overlay'){await game.settings.set(ID,'overlayOpen',game.settings.get(ID,'overlayOpen')!==true);await this.render();return;}
  if(action==='save-access'){if(!isGM())throw Error('GM only.');await game.settings.set(ID,'playerAccessEnabled',Boolean(root.querySelector('#agu-access')?.checked));const stashBox=root.querySelector('#agu-stash-enabled');if(stashBox&&stashBox.checked!==stashEnabled())await setStashEnabled(stashBox.checked);const voteBox=root.querySelector('#agu-stash-vote');if(voteBox&&voteBox.checked!==stashVoteRequired())await setStashVoteRequired(voteBox.checked);const coinBox=root.querySelector('#agu-purse-vote');if(coinBox)await setPurseVoteRequired(coinBox.checked);ui.notifications.info('GM Setup saved.');return;}
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
  const mode=Number(root.querySelector('#agu-roll-mode')?.value)||0;
  const result=await actor.rollSkill({skill,advantage:mode>0,disadvantage:mode<0});if(result===false||!result)throw Error('Native roll cancelled.');if(!proof)await new Promise(resolve=>setTimeout(resolve,350));
  if(!proof)throw Error('Native roll appeared without verifiable chat evidence. No contribution was counted.');const total=Number(proof.rolls[0]?.total);if(!Number.isFinite(total))throw Error('Native roll total unavailable.');
  const msg=await ChatMessage.create({content:`Roll submitted: ${E(actor.name)} · ${E(skillName(skill))} · ${E(total)} (awaiting GM verification).`,speaker:ChatMessage.getSpeaker({actor}),whisper:[...new Set([...game.users.filter(u=>u.isGM).map(u=>u.id),game.user.id])],flags:{[ID]:{submission:{contract:'ag-utility-roll/0.1',sessionId:s.id,actorId:actor.id,skill,total,proofMessageId:proof.id}}}});
  if(!msg)throw Error('No submission message created.');ui.notifications.info('Roll submitted; awaiting GM acceptance.');
 }finally{Hooks.off('createChatMessage',observe);activeRoll=false;}
}
/* ---- Conditions: removal goes through one gate. A GM removes directly; anyone else asks the
   primary GM client over the module socket, and that client re-checks ownership and the lock. ---- */
async function setUnlocked(actorId,unlocked){
 if(!isGM())throw Error('GM only.');if(typeof unlocked!=='boolean')throw TypeError('Boolean required.');if(!game.actors.get(actorId))throw Error('Character not found.');
 await game.settings.set(ID,'conditionUnlocks',withUnlocked(getUnlocks(),actorId,unlocked));
}
async function executeRemoval(actor,statusId,user){
 const d=removalDecision({user,actor,statusId,unlocks:getUnlocks(),nativeIds:nativeIds()});if(!d.ok)throw Error(d.reason);
 if(nativeIds().includes(statusId)){await actor.toggleStatusEffect(statusId,{active:false});return `Removed ${statusName(statusId)} from ${actor.name}.`;}
 const r=await removeUnknownStatus(actor,statusId);
 return r.disabled?`Disabled ${r.disabled} item effect(s) and deleted ${r.deleted} on ${actor.name}.`:`Removed "${statusName(statusId)}" from ${actor.name}.`;
}
async function removeCondition(actorId,statusId){
 if(!permitted())throw Error('Utilities access is hidden by the GM.');
 const actor=game.actors.get(actorId),d=removalDecision({user:game.user,actor,statusId,unlocks:getUnlocks(),nativeIds:nativeIds()});if(!d.ok)throw Error(d.reason);
 return isGM()?executeRemoval(actor,statusId,game.user):requestGM('remove-status',{actorId,statusId});
}
async function removeFromUI(actor,statusId){
 if(!actor)throw Error('Character not found.');
 if(isGM()&&!statusConfig(statusId)&&!await confirmDialog(`Remove "${statusName(statusId)}" from ${actor.name}? It is not a native status, so its source effect will be removed.`,{title:'Remove condition',yes:'Remove condition'}))return;
 ui.notifications?.info(await removeCondition(actor.id,statusId));
}
const pendingRequests=new Map();
function requestGM(type,data,timeout=15000){
 if(!game.socket?.emit)return Promise.reject(Error('The Utilities socket is unavailable.'));
 if(![...game.users].some(u=>u.isGM&&u.active))return Promise.reject(Error('A GM must be connected.'));
 const requestId=crypto.randomUUID();
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pendingRequests.delete(requestId);reject(Error('The GM client did not answer. Nothing was changed.'));},timeout);
  pendingRequests.set(requestId,{resolve,reject,timer});
  game.socket.emit(SOCKET,{...data,type,requestId,userId:game.user.id});
 });
}
const gmHandlers={
 'remove-status':async(msg,user)=>{if(!user.isGM&&game.settings.get(ID,'playerAccessEnabled')!==true)throw Error('Utilities is hidden for players.');return executeRemoval(game.actors.get(msg.actorId),String(msg.statusId??''),user);},
 'stash-deposit':async(msg,user)=>executeDeposit(String(msg.itemUuid??''),user),
 'stash-withdraw':async(msg,user)=>executeWithdraw(String(msg.itemId??''),String(msg.actorId??''),user),
 'purse-deposit':async(msg,user)=>executePurseDeposit({actorId:String(msg.actorId??''),coin:String(msg.coin??''),amount:msg.amount},user),
 'purse-take':async(msg,user)=>executePurseTake({actorId:String(msg.actorId??''),coin:String(msg.coin??''),amount:msg.amount},user)
};
/** Broadcasts every client handles: the consent poll itself. */
const pollHandlers={
 'stash-vote-request':msg=>{if(Array.isArray(msg.voters)&&msg.voters.includes(game.user?.id))showVotePrompt(msg);},
 'stash-poll-closed':msg=>{closeVotePrompt(msg.pollId);},
 'stash-vote':(msg,senderId)=>{if(isGM()&&coordinatorIsMe())receiveVote(msg,senderId);}
};
async function onSocket(msg,senderId){
 if(!msg||typeof msg!=='object')return;
 if(msg.type==='receipt'){
  const p=msg.userId===game.user?.id&&pendingRequests.get(msg.requestId);if(!p)return;
  pendingRequests.delete(msg.requestId);clearTimeout(p.timer);msg.ok?p.resolve(msg.message):p.reject(Error(msg.message||'The GM client rejected the request.'));return;
 }
 if(pollHandlers[msg.type]){pollHandlers[msg.type](msg,senderId);return;}
 const handler=gmHandlers[msg.type];if(!handler||!isGM()||!coordinatorIsMe())return;
 let ok=false,message='';
 try{
  // When Foundry supplies the sender's id, it must match the claimed requester.
  if(typeof senderId==='string'&&senderId!==msg.userId)throw Error('Request sender mismatch.');
  const user=game.users.get(msg.userId);if(!user?.active)throw Error('Unknown requester.');
  message=await handler(msg,user);ok=true;
 }catch(e){message=e?.message||String(e);console.warn(`[${ID}] Rejected ${msg.type} from ${msg.userId}: ${message}`);}
 game.socket.emit(SOCKET,{type:'receipt',requestId:msg.requestId,userId:msg.userId,ok,message});
}

/* ---- Conditions overlay: a mostly transparent, per-user pop-out. ---- */
function overlayHTML(){
 const groups=conditionGroups(partyCharacters(),{label:statusName,isNative:id=>Boolean(statusConfig(id)),canRemove:(a,id)=>canRemove(a,id)});
 return `<div class="agu-overlay">${groups.length?groups.map(g=>`<section class="agu-ov-group"><h3>${E(g.name)}</h3><ul>${g.conditions.map(c=>`<li><span>${E(c.label)}${c.custom?' <small>(Custom)</small>':''}</span>${c.removable?`<button type="button" class="agu-ov-x" data-ov-remove data-actor="${E(g.actorId)}" data-status="${E(c.id)}" title="Remove ${E(c.label)}" aria-label="Remove ${E(c.label)} from ${E(g.name)}">×</button>`:''}</li>`).join('')}</ul></section>`).join(''):'<p class="agu-ov-empty">No conditions.</p>'}</div>`;
}
const savedOverlayPosition=()=>{const p=game.settings.get(ID,'overlayPosition')||{};return Object.fromEntries(['left','top','width','height'].filter(k=>Number.isFinite(p[k])).map(k=>[k,p[k]]));};
let positionTimer=null;
class ConditionsOverlay extends ApplicationV2 {
 static DEFAULT_OPTIONS={id:'ashen-gate-utilities-conditions-overlay',classes:['ag-app','agu-overlay-app'],window:{title:'Party Conditions',resizable:true,minimizable:false},position:{width:240,height:'auto'}};
 async _renderHTML(){if(!permitted())throw Error('Utilities is hidden for players.');return overlayHTML();}
 _replaceHTML(html,content){content.innerHTML=html;
  for(const b of content.querySelectorAll('[data-ov-remove]'))b.addEventListener('click',()=>{b.disabled=true;removeFromUI(game.actors.get(b.dataset.actor),b.dataset.status).catch(error).finally(()=>{b.disabled=false;});});
 }
 _onPosition(position){super._onPosition?.(position);clearTimeout(positionTimer);
  positionTimer=setTimeout(()=>{const keep=Object.fromEntries(['left','top','width','height'].filter(k=>Number.isFinite(position?.[k])).map(k=>[k,position[k]]));game.settings.set(ID,'overlayPosition',keep).catch(error);},400);}
 // Closing the window with its own X turns the overlay off for this user; closing it for a permission change does not.
 _onClose(options){super._onClose?.(options);if(overlayInstance===this)overlayInstance=null;if(!this.silentClose&&game.settings.get(ID,'overlayOpen'))game.settings.set(ID,'overlayOpen',false).catch(error);}
}
async function openOverlay(){if(!permitted())throw Error('Utilities access is hidden by the GM.');overlayInstance??=new ConditionsOverlay({position:savedOverlayPosition()});await overlayInstance.render({force:true});return overlayInstance;}
async function closeOverlay(){if(!overlayInstance?.rendered)return;overlayInstance.silentClose=true;await overlayInstance.close();}
function syncOverlay(){(game.settings.get(ID,'overlayOpen')===true&&permitted()?openOverlay():closeOverlay()).catch(error);}
function rerenderConditions(){if(windowInstance?.rendered&&!activeRoll)windowInstance.render().catch(error);if(overlayInstance?.rendered)overlayInstance.render().catch(error);}
/* ---- Party stash: one Utilities-owned Actor. Players never edit it; the primary GM client moves
   items for them. Taking an item out needs every other connected player to accept. ---- */
const OBSERVER=()=>CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER??2;
const itemTypeLabel=t=>{const l=CONFIG.Item?.typeLabels?.[t];return l?game.i18n.localize(l):t;};
async function setStashEnabled(on){
 if(!isGM())throw Error('GM only.');if(typeof on!=='boolean')throw TypeError('Boolean required.');
 await game.settings.set(ID,'stashEnabled',on);
 // Observer lets players open stash item sheets read-only; it never lets them edit the stash.
 const stash=stashActor();if(stash)await stash.update({'ownership.default':on?OBSERVER():0});
}
async function setStashVoteRequired(on){
 if(!isGM())throw Error('GM only.');if(typeof on!=='boolean')throw TypeError('Boolean required.');
 await game.settings.set(ID,'stashVoteRequired',on);
}
async function setPurseVoteRequired(on){
 if(!isGM())throw Error('GM only.');if(typeof on!=='boolean')throw TypeError('Boolean required.');
 await game.settings.set(ID,'purseVoteRequired',on?'on':'off');
}
/* History: read-modify-write is queued so two moves can't overwrite each other's entry. */
let historyQueue=Promise.resolve();
function logStash({kind,approval,user,actor,item}){
 if(!isGM())return Promise.reject(Error('GM only.'));
 const run=async()=>{
  const entry=historyEntry({id:crypto.randomUUID(),kind,approval,user,actor,item,worldTime:game.time?.worldTime??null,realTime:Date.now()});
  await game.settings.set(ID,'stashHistory',appendHistory(game.settings.get(ID,'stashHistory'),entry,STASH_HISTORY_CAP));
 };
 return queueHistory(run);
}
const queueHistory=run=>{const next=historyQueue.then(run);historyQueue=next.catch(()=>{});return next;};
/** A move already happened or was already refused, so a failed log write is reported, not thrown. */
const logQuietly=args=>logStash(args).catch(e=>console.warn(`[${ID}] Could not write stash history: ${e.message}`));
function stashHistory(){
 if(!permitted())throw Error('Utilities access is hidden by the GM.');
 if(!isGM())playerStashGate(game.user);
 const list=structuredClone(Array.isArray(game.settings.get(ID,'stashHistory'))?game.settings.get(ID,'stashHistory'):[]);
 if(isGM())return list;
 // Players see only gold awards the GM made public, without anyone's gp totals; purse rows keep the purse totals
 // (the party's money) but not the character's own coin totals.
 return list.filter(h=>h?.kind!=='gold-award'||h.public===true).map(h=>PURSE_KINDS.includes(h?.kind)?{...h,actorBefore:null,actorAfter:null,undo:[]}:h?.kind!=='gold-award'?h:{...h,recipients:(h.recipients??[]).map(r=>({actorId:r.actorId,actorName:r.actorName,added:r.added,undone:r.undone})),undo:[]});
}
async function clearStashHistory(){
 if(!isGM())throw Error('GM only.');
 await historyQueue.catch(()=>{});
 await game.settings.set(ID,'stashHistory',[]);
}
/* ---- Gold awards: GM-only, one update per character to system.currency.gp, logged in stash history ---- */
/** dnd5e Primary Party members if one is set, otherwise characters owned by connected players. */
function goldDefaults(){
 let party=null;try{party=game.actors?.party??null;}catch{party=null;}
 if(!party){try{party=game.settings.get('dnd5e','primaryParty')?.actor??null;}catch{party=null;}}
 const members=[...(party?.system?.members??[])].map(m=>m?.actor??m).filter(a=>a?.id&&game.actors.get(a.id));
 if(members.length)return {source:'party',partyName:party.name??'Primary Party',actorIds:[...new Set(members.map(a=>a.id))]};
 const players=[...game.users].filter(u=>u.active&&!u.isGM);
 return {source:'players',partyName:null,actorIds:allCharacters().filter(a=>players.some(u=>a.testUserPermission?.(u,'OWNER'))).map(a=>a.id)};
}
const gmWhisper=()=>[...game.users].filter(u=>u.isGM).map(u=>u.id);
function gpOrThrow(actor,coin='gp'){const gp=readCoin(actor,coin);if(gp===null)throw Error(`${actor.name} has no dnd5e ${coin==='gp'?'gold':COIN_LABELS[coin].toLowerCase()} (system.currency.${coin}); Utilities cannot award ${coin==='gp'?'gold':'coins'} here.`);return gp;}
/** API: award gold. mode 'each' (default) or 'split' (whole gp; any remainder is not handed out). */
async function awardGold({amount,mode='each',actorIds,reason='',public:isPublic=false,coin='gp'}={}){
 if(!isGM())throw Error('GM only.');
 return queueHistory(async()=>{
  const actors=[...new Set(actorIds??[])].map(id=>{const a=game.actors.get(id);if(!a)throw Error(`Character ${id} was not found.`);return a;});
  const plan=planGoldAward({amount,mode,coin,recipients:actors.map(a=>({id:a.id,name:a.name,held:gpOrThrow(a,coin)}))});
  const paid=[],failed=[];
  for(const r of plan.recipients){
   try{await game.actors.get(r.actorId).update({[`system.currency.${plan.coin}`]:r.after});paid.push(r);}
   catch(e){failed.push({actorName:r.actorName,reason:e?.message??String(e)});}
  }
  if(!paid.length)throw Error(`No gold was awarded: ${failed.map(f=>`${f.actorName}: ${f.reason}`).join('; ')}`);
  const entry=goldAwardEntry({id:crypto.randomUUID(),plan:{...plan,recipients:paid},reason,isPublic,user:game.user,worldTime:game.time?.worldTime??null,realTime:Date.now()});
  await game.settings.set(ID,'stashHistory',appendHistory(game.settings.get(ID,'stashHistory'),entry,STASH_HISTORY_CAP));
  try{await ChatMessage.create({content:goldCardHTML(entry),whisper:isPublic?[]:gmWhisper(),speaker:ChatMessage.getSpeaker?.()??{}});}
  catch(e){console.warn(`[${ID}] Could not post the gold award card`,e);ui.notifications?.warn?.(`Gold was awarded but the chat card failed (${e?.message??e}). See stash History.`);}
  return {entry:structuredClone(entry),failed};
 });
}
/** API: undo a gold award from history. Reverses only characters that still hold the awarded gp; never twice. */
async function undoGoldAward(entryId){
 if(!isGM())throw Error('GM only.');
 return queueHistory(async()=>{
  const list=game.settings.get(ID,'stashHistory'),entry=(Array.isArray(list)?list:[]).find(h=>h?.id===entryId);
  if(!entry)throw Error('That gold award is no longer in the stash history.');
  const coin=entryCoin(entry),results=planGoldUndo(entry,id=>{const a=game.actors.get(id);return a?readCoin(a,coin):undefined;});
  for(const r of results.filter(x=>x.ok)){
   try{await game.actors.get(r.actorId).update({[`system.currency.${coin}`]:r.next});}
   catch(e){r.ok=false;r.reason=`${r.actorName}: ${e?.message??e}`;}
  }
  const next=applyGoldUndo(entry,results,{user:game.user,realTime:Date.now()});
  await game.settings.set(ID,'stashHistory',game.settings.get(ID,'stashHistory').map(h=>h?.id===entryId?next:h));
  return results.map(r=>({actorId:r.actorId,actorName:r.actorName,ok:r.ok,reason:r.reason,removed:r.ok?r.added:0,coin}));
 });
}
/** GM dialog: form, then a labelled confirmation that shows each share and any remainder. */
async function awardGoldDialog(){
 if(!isGM())throw Error('GM only.');
 const def=goldDefaults(),ids=new Set(def.actorIds);
 const pool=[...new Map([...allCharacters(),...def.actorIds.map(id=>game.actors.get(id))].filter(Boolean).map(a=>[a.id,a])).values()].sort((a,b)=>a.name.localeCompare(b.name));
 if(!pool.length)throw Error('There are no characters to award gold to.');
 const form=await formDialog('Award Gold',[
  {name:'amount',label:'Amount',type:'number',value:''},
  {name:'coin',label:'Coin',type:'select',value:'gp',options:COINS.map(c=>({value:c,label:`${COIN_LABELS[c]} (${c})`}))},
  {name:'mode',label:'How',type:'select',value:'each',options:[{value:'each',label:'Each character gets this amount'},{value:'split',label:'Split this amount evenly'}],hint:'Split pays whole coins only; any remainder is not handed out (it stays with you) and is shown before you confirm.'},
  {name:'reason',label:'Reason (optional)',type:'text',value:''},
  {name:'recipients',label:'Characters',type:'checklist',options:pool.map(a=>({value:a.id,label:a.name,checked:ids.has(a.id)})),hint:def.source==='party'?`Ticked: members of ${def.partyName}.`:'Ticked: characters owned by connected players (no dnd5e Primary Party is set).'},
  {name:'public',label:'Also show the chat card to players',type:'checkbox',value:'1'}
 ],{ok:'Review Award'});
 if(!form)return null;
 const actorIds=[].concat(form.recipients??[]),isPublic=[].concat(form.public??[]).length>0,amount=Number(form.amount),mode=form.mode==='split'?'split':'each',coin=COINS.includes(form.coin)?form.coin:'gp';
 const plan=planGoldAward({amount,mode,coin,recipients:actorIds.map(id=>{const a=game.actors.get(id);return {id,name:a?.name??id,held:a?gpOrThrow(a,coin):NaN};})});
 const lines=[mode==='split'?`Split ${plan.amount} ${coin} evenly: ${plan.share} ${coin} each.`:`${plan.share} ${coin} to each character.`,...plan.recipients.map(r=>`${r.actorName}: ${r.before} → ${r.after} ${coin}`)];
 if(plan.remainder)lines.push(`${plan.remainder} ${coin} left over will NOT be handed out; it stays with you.`);
 lines.push(isPublic?'The chat card will be public.':'The chat card will be whispered to the GM only.');
 if(!await confirmDialog(lines.join('\n'),{title:'Award Gold',yes:`Award ${plan.total} ${coin}`}))return null;
 const out=await awardGold({amount,mode,actorIds,reason:form.reason??'',public:isPublic,coin});
 ui.notifications?.info(`Awarded ${out.entry.recipients.reduce((n,r)=>n+r.added,0)} ${coin}.${out.failed.length?` Not paid: ${out.failed.map(f=>`${f.actorName} (${f.reason})`).join(', ')}.`:''}`);
 return out;
}
/* ---- Party purse: dnd5e system.currency on the stash Actor (an npc, which dnd5e gives currency).
   Coins move one update per document, only system.currency.<coin>; the primary GM client does it for players.
   Each change is queued so two moves can't read the same total, and logged in stash history. ---- */
let purseQueue=Promise.resolve();
const queuePurse=run=>{const next=purseQueue.then(run);purseQueue=next.catch(()=>{});return next;};
const coinKey=coin=>`system.currency.${coin}`;
function purseStash(){const stash=stashActor();if(!stash)throw Error('There is no party stash yet.');if(!readCoins(stash))throw Error('The party stash has no dnd5e currency (system.currency).');return stash;}
const logPurse=entry=>queueHistory(async()=>{await game.settings.set(ID,'stashHistory',appendHistory(game.settings.get(ID,'stashHistory'),entry,STASH_HISTORY_CAP));return entry;});
const newPurseEntry=args=>purseEntry({id:crypto.randomUUID(),worldTime:game.time?.worldTime??null,realTime:Date.now(),...args});
/** API: the purse totals, {cp,sp,ep,gp,pp}. Players see them while the stash is on for them. */
/** 0.11.0: read-only stash item list for partner modules. Same gate as the stash tab: GM always; players need Player Access and the stash on. */
function listStashItems(){
 if(!permitted())throw Error('Utilities access is hidden by the GM.');
 if(!isGM())playerStashGate(game.user);
 const stash=stashActor();if(!stash)return [];
 return [...stash.items].map(i=>stashRow(i,{typeLabel:itemTypeLabel})).sort((a,b)=>a.typeLabel.localeCompare(b.typeLabel)||a.name.localeCompare(b.name));
}
function purseTotals(){
 if(!permitted())throw Error('Utilities access is hidden by the GM.');
 if(!isGM())playerStashGate(game.user);
 return readCoins(purseStash());
}
/** Gives `amount` to `to` first, then takes it from `from`; if the second update fails the first is put back. */
async function moveCoins(from,to,coin,{fromAfter,toAfter,toBefore}){
 await to.update({[coinKey(coin)]:toAfter});
 try{await from.update({[coinKey(coin)]:fromAfter});}
 catch(e){await to.update({[coinKey(coin)]:toBefore}).catch(err=>console.error(`[${ID}] Could not restore ${to.name} ${coin}`,err));throw e;}
}
function purseActor(actorId,user){
 const actor=game.actors.get(actorId),stash=stashActor();
 if(!actor||actor.id===stash?.id)throw Error('Choose a character.');
 if(!(user.isGM||actor.testUserPermission?.(user,'OWNER')))throw Error(`You do not own ${actor.name}.`);
 return actor;
}
const planMove=(kind,actor,stash,coin,amount)=>planCoinMove({kind,coin,amount,actorHas:readCoin(actor,coin),purseHas:readCoin(stash,coin),actorName:actor.name});
async function executePurseDeposit({actorId,coin,amount},user){
 playerStashGate(user);
 const stash=purseStash(),actor=purseActor(actorId,user);planMove('deposit',actor,stash,coin,amount);
 const plan=await queuePurse(async()=>{const p=planMove('deposit',actor,stash,coin,amount);
  await moveCoins(actor,stash,coin,{fromAfter:p.actorAfter,toAfter:p.purseAfter,toBefore:p.purseBefore});return p;});
 await logPurse(newPurseEntry({kind:'purse-deposit',approval:user.isGM?'gm':'not-required',plan,user,actor})).catch(e=>console.warn(`[${ID}] Could not write stash history: ${e.message}`));
 return `${actor.name} put ${plan.amount} ${coin} in the party purse.`;
}
const takingCoins=new Set();
async function executePurseTake({actorId,coin,amount},user){
 playerStashGate(user);
 const stash=purseStash(),actor=purseActor(actorId,user),first=planMove('take',actor,stash,coin,amount);
 let approval='gm';
 if(!user.isGM){
  if(takingCoins.has(user.id))throw Error('You already have a purse request waiting for the party.');
  takingCoins.add(user.id);
  try{
   if(!purseVoteRequired())approval='not-required';
   else{
    const outcome=await runConsent(createPoll({id:crypto.randomUUID(),requesterId:user.id,voters:consentVoters(game.users,user.id)}),{requester:user.name,item:`${first.amount} ${coin}`,quantity:1,actor:actor.name});
    if(outcome!=='approved'){
     await logPurse(newPurseEntry({kind:'purse-take',approval:outcome==='denied'?'denied':'timed-out',plan:first,user,actor})).catch(()=>{});
     throw Error(outcome==='denied'?`The party denied taking ${first.amount} ${coin}. It stays in the purse.`:`Not every player answered in time. The ${first.amount} ${coin} stays in the purse.`);
    }
    approval='accepted';
   }
  }finally{takingCoins.delete(user.id);}
 }
 // Re-read after the vote: the purse may have changed while the party was deciding.
 const plan=await queuePurse(async()=>{const p=planMove('take',actor,stash,coin,amount);
  await moveCoins(stash,actor,coin,{fromAfter:p.purseAfter,toAfter:p.actorAfter,toBefore:p.actorBefore});return p;});
 await logPurse(newPurseEntry({kind:'purse-take',approval,plan,user,actor})).catch(e=>console.warn(`[${ID}] Could not write stash history: ${e.message}`));
 return `${actor.name} took ${plan.amount} ${coin} from the party purse.`;
}
/** API: a player's (or the GM's) coin moves. A player asks the primary GM client, like item moves. */
async function depositCoins({actorId,coin,amount}={}){
 if(!permitted())throw Error('Utilities access is hidden by the GM.');
 if(isGM())return executePurseDeposit({actorId,coin,amount},game.user);
 playerStashGate(game.user);
 const actor=game.actors.get(actorId),stash=purseStash();if(!isOwned(actor))throw Error('Choose a character you own.');planMove('deposit',actor,stash,coin,amount);
 return requestGM('purse-deposit',{actorId,coin,amount:Number(amount)});
}
async function takeCoins({actorId,coin,amount}={}){
 if(!permitted())throw Error('Utilities access is hidden by the GM.');
 if(isGM())return executePurseTake({actorId,coin,amount},game.user);
 playerStashGate(game.user);
 const actor=game.actors.get(actorId),stash=purseStash();if(!isOwned(actor))throw Error('Choose a character you own.');planMove('take',actor,stash,coin,amount);
 if(purseVoteRequired())ui.notifications?.info('Asking the party to approve…');
 return requestGM('purse-take',{actorId,coin,amount:Number(amount)},CONSENT_TIMEOUT_MS+15000);
}
/** API: GM-only purse change: op 'add' | 'remove' | 'set', with an optional reason. */
async function adjustPurse({coin,op,amount,reason=''}={}){
 if(!isGM())throw Error('GM only.');
 const stash=purseStash();
 const plan=await queuePurse(async()=>{const p=planPurseAdjust({op,coin,amount,purseHas:readCoin(stash,coin)});await stash.update({[coinKey(coin)]:p.purseAfter});return p;});
 const entry=await logPurse(newPurseEntry({kind:'purse-adjust',approval:'gm',plan,user:game.user,reason}));
 return structuredClone(entry);
}
/** API: GM-only Undo of a purse adjustment or a completed take; refused (and the refusal logged) when it would go negative. */
async function undoPurseEntry(entryId){
 if(!isGM())throw Error('GM only.');
 return queuePurse(()=>queueHistory(async()=>{
  const list=game.settings.get(ID,'stashHistory'),entry=(Array.isArray(list)?list:[]).find(h=>h?.id===entryId);
  if(!entry)throw Error('That purse change is no longer in the stash history.');
  const stash=stashActor(),actor=entry.actorId?game.actors.get(entry.actorId):null;
  const r=planPurseUndo(entry,{purseHas:stash?readCoin(stash,entry.coin):undefined,actorHas:actor?readCoin(actor,entry.coin):undefined});
  if(r.ok){
   try{
    if(entry.kind==='purse-adjust')await stash.update({[coinKey(entry.coin)]:r.purseNext});
    else await moveCoins(actor,stash,entry.coin,{fromAfter:r.actorNext,toAfter:r.purseNext,toBefore:readCoin(stash,entry.coin)});
   }catch(e){r.ok=false;r.reason=e?.message??String(e);}
  }
  const next=applyPurseUndo(entry,r,{user:game.user,realTime:Date.now()});
  await game.settings.set(ID,'stashHistory',game.settings.get(ID,'stashHistory').map(h=>h?.id===entryId?next:h));
  return {ok:r.ok,reason:r.reason,coin:entry.coin,change:r.ok?r.change:0};
 }));
}
async function adjustPurseDialog(){
 if(!isGM())throw Error('GM only.');
 const now=readCoins(purseStash());
 const form=await formDialog('Adjust Party Purse',[
  {name:'coin',label:'Coin',type:'select',value:'gp',options:COINS.map(c=>({value:c,label:`${COIN_LABELS[c]} (${c}): ${now[c]}`}))},
  {name:'op',label:'Change',type:'select',value:'add',options:[{value:'add',label:'Add'},{value:'remove',label:'Remove'},{value:'set',label:'Set to'}]},
  {name:'amount',label:'Amount',type:'number',value:''},
  {name:'reason',label:'Reason (optional)',type:'text',value:''}
 ],{ok:'Review Change'});
 if(!form)return null;
 const coin=COINS.includes(form.coin)?form.coin:'gp',op=['add','remove','set'].includes(form.op)?form.op:'add';
 const plan=planPurseAdjust({op,coin,amount:form.amount,purseHas:now[coin]});
 if(!await confirmDialog(`Party purse ${COIN_LABELS[coin]}: ${plan.purseBefore} → ${plan.purseAfter} ${coin}.${form.reason?.trim()?`\nReason: ${form.reason.trim()}`:''}`,{title:'Adjust Party Purse',yes:`Set purse to ${plan.purseAfter} ${coin}`}))return null;
 const entry=await adjustPurse({coin,op,amount:form.amount,reason:form.reason??''});
 ui.notifications?.info(`Party purse ${coin}: ${entry.purseBefore} → ${entry.purseAfter}.`);
 return entry;
}
/** The purse strip at the top of Party Inventory → Items. */
function purseStrip(app,takers,target){
 const stash=stashActor();if(!stash)return '';
 const coins=readCoins(stash);
 if(!coins)return `<section class="agu-purse" aria-label="Party purse"><h3>Party purse</h3>${empty('The stash Actor has no dnd5e currency, so there is no purse.')}</section>`;
 const counters=COINS.map(c=>`<div class="agu-coin" role="group" aria-label="${E(COIN_LABELS[c])}: ${E(coins[c])}"><span class="agu-coin__label">${E(COIN_LABELS[c])} <abbr title="${E(COIN_LABELS[c])}">${c}</abbr></span><strong class="agu-coin__value">${E(coins[c])}</strong></div>`).join('');
 const coinSel=`<label>Coin<select id="agu-purse-coin">${COINS.map(c=>option(c,`${COIN_LABELS[c]} (${c})`,app.purseCoin)).join('')}</select></label>`;
 const move=takers.length?`<div class="agu-purse-move"><label>Character<select id="agu-purse-actor">${takers.map(a=>option(a.id,`${a.name} (${readCoin(a,app.purseCoin)??'—'} ${app.purseCoin})`,target)).join('')}</select></label>${coinSel}<label>Amount<input type="number" id="agu-purse-amount" min="1" step="1" value="${E(app.purseAmount)}" inputmode="numeric"></label><div class="agu-actions">${btn('purse-deposit','Deposit',{kind:'ag-btn ag-btn--sm'})}${btn('purse-take','Take',{kind:'ag-btn ag-btn--sm'})}</div></div>`:'';
 const gm=isGM()?`<div class="ag-toolbar__end">${btn('purse-adjust','Adjust Purse',{kind:'ag-btn ag-btn--sm'})}</div>`:'';
 const note=isGM()?`<p class="agu-note">Coin vote: ${purseVoteRequired()?'on':'off'} (change it in GM Setup).</p>`:`<p class="agu-note">Deposit moves coins from your character to the purse${purseVoteRequired()?'; Take needs every other connected player to accept':''}. Coins are never converted.</p>`;
 return `<section class="agu-purse" aria-label="Party purse"><div class="agu-line"><h3>Party purse</h3>${gm}</div><div class="agu-coins">${counters}</div>${move}${note}</section>`;
}
/** Create first, then delete, so a failure can never lose the item. */
async function moveItem(item,target){
 const data=item.toObject();delete data._id;
 const [made]=await target.createEmbeddedDocuments('Item',[data]);
 if(!made)throw Error(`Could not add ${item.name} to ${target.name}.`);
 await item.delete();return made;
}
function playerStashGate(user){if(user.isGM)return;if(game.settings.get(ID,'playerAccessEnabled')!==true)throw Error('Utilities is hidden for players.');if(!stashEnabled())throw Error('The GM has turned the party stash off.');}
async function executeDeposit(uuid,user){
 playerStashGate(user);
 const stash=stashActor();if(!stash)throw Error('There is no party stash yet.');
 const item=await fromUuid(uuid);if(item?.documentName!=='Item')throw Error('Only items can go in the stash.');
 const from=item.parent;
 if(from===stash||from?.id===stash.id)return `${item.name} is already in the stash.`;
 if(!from){if(!user.isGM)throw Error('Only items from your own character sheet can go in the stash.');await stash.createEmbeddedDocuments('Item',[(()=>{const d=item.toObject();delete d._id;delete d.folder;return d;})()]);await logQuietly({kind:'deposit',approval:'gm',user,actor:null,item:stashRow(item)});return `Copied ${item.name} into the party stash.`;}
 if(from.documentName!=='Actor'||!(user.isGM||from.testUserPermission?.(user,'OWNER')))throw Error('You can only stash items from a character you own.');
 const row=stashRow(item);const made=await moveItem(item,stash);
 await logQuietly({kind:'deposit',approval:user.isGM?'gm':'not-required',user,actor:from,item:{...row,uuid:made?.uuid??row.uuid}});
 return `${from.name} put ${item.name} in the party stash.`;
}
const takingItems=new Set();
async function executeWithdraw(itemId,actorId,user){
 playerStashGate(user);
 const stash=stashActor(),item=stash?.items.get(itemId),actor=game.actors.get(actorId);
 if(!item)throw Error('That item is no longer in the stash.');
 if(!actor||actor.id===stash.id)throw Error('Choose a character to receive the item.');
 if(!(user.isGM||actor.testUserPermission?.(user,'OWNER')))throw Error(`You do not own ${actor.name}.`);
 const row=stashRow(item);let approval='gm';
 if(!user.isGM){
  if(takingItems.has(item.id))throw Error(`${item.name} already has a request waiting for the party.`);
  takingItems.add(item.id);
  try{
   if(!stashVoteRequired())approval='not-required';
   else{
    const outcome=await runConsent(createPoll({id:crypto.randomUUID(),requesterId:user.id,voters:consentVoters(game.users,user.id)}),{requester:user.name,item:item.name,quantity:row.quantity,actor:actor.name});
    if(outcome!=='approved'){
     await logQuietly({kind:'withdraw',approval:outcome==='denied'?'denied':'timed-out',user,actor,item:row});
     throw Error(outcome==='denied'?`The party denied taking ${item.name}. It stays in the stash.`:`Not every player answered in time. ${item.name} stays in the stash.`);
    }
    approval='accepted';
   }
   if(!stash.items.get(item.id))throw Error('That item left the stash while the party was voting.');
   const made=await moveItem(item,actor);
   await logQuietly({kind:'withdraw',approval,user,actor,item:{...row,uuid:made?.uuid??row.uuid}});
  }finally{takingItems.delete(item.id);}
  return `${actor.name} took ${item.name} from the party stash.`;
 }
 const made=await moveItem(item,actor);
 await logQuietly({kind:'withdraw',approval,user,actor,item:{...row,uuid:made?.uuid??row.uuid}});
 return `${actor.name} took ${item.name} from the party stash.`;
}
/** Asks the party; resolves 'approved', 'denied' or 'expired'. Any deny, or the deadline, cancels. */
const polls=new Map();
function runConsent(poll,info){
 const now=pollOutcome(poll);if(now!=='pending')return Promise.resolve(now);
 return new Promise(resolve=>{
  let timer=null;
  const settle=outcome=>{if(!polls.has(poll.id))return;polls.delete(poll.id);clearTimeout(timer);game.socket.emit(SOCKET,{type:'stash-poll-closed',pollId:poll.id,outcome});resolve(outcome);};
  timer=setTimeout(()=>settle('expired'),Math.max(0,poll.expiresAt-Date.now()));
  polls.set(poll.id,{poll,settle});
  game.socket.emit(SOCKET,{type:'stash-vote-request',pollId:poll.id,voters:poll.voters,expiresAt:poll.expiresAt,...info});
 });
}
function receiveVote(msg,senderId){
 const entry=polls.get(msg.pollId);if(!entry)return;
 try{
  if(typeof senderId==='string'&&senderId!==msg.userId)throw Error('Vote sender mismatch.');
  recordVote(entry.poll,{userId:msg.userId,vote:msg.vote});
  const outcome=pollOutcome(entry.poll);if(outcome!=='pending')entry.settle(outcome);
 }catch(e){console.warn(`[${ID}] Ignored stash vote from ${msg.userId}: ${e.message}`);}
}
const votePrompts=new Map();
class StashVotePrompt extends ApplicationV2 {
 static DEFAULT_OPTIONS={classes:['ag-app','ag-utilities','agu-vote-app'],window:{title:'Party Stash: Approve?',minimizable:false},position:{width:380,height:'auto'}};
 constructor(request){super({id:`ashen-gate-utilities-vote-${request.pollId}`});this.request=request;}
 async _renderHTML(){const r=this.request,secs=Math.max(0,Math.round((r.expiresAt-Date.now())/1000));
  return `<div class="agu-vote"><p><strong>${E(r.requester)}</strong> wants to take <strong>${E(r.item)}</strong>${Number(r.quantity)>1?` (×${E(r.quantity)})`:''} from the party stash for <strong>${E(r.actor)}</strong>.</p><p class="agu-note">If anyone denies, or not everyone answers within ${E(secs)} seconds, the item stays in the stash.</p><div class="agu-vote-actions">${btn('vote-deny','Deny',{kind:'danger'})}${btn('vote-accept','Accept',{kind:'primary'})}</div></div>`;}
 _replaceHTML(html,content){content.innerHTML=html;
  for(const b of content.querySelectorAll('[data-action^="vote-"]'))b.addEventListener('click',()=>{this.answer(b.dataset.action==='vote-accept'?'accept':'deny');});
 }
 answer(vote){game.socket.emit(SOCKET,{type:'stash-vote',pollId:this.request.pollId,userId:game.user.id,vote});votePrompts.delete(this.request.pollId);this.close().catch(error);}
}
function showVotePrompt(request){if(votePrompts.has(request.pollId))return;const app=new StashVotePrompt(request);votePrompts.set(request.pollId,app);app.render({force:true}).catch(error);}
function closeVotePrompt(pollId){const app=votePrompts.get(pollId);votePrompts.delete(pollId);if(app?.rendered)app.close().catch(error);}
/** Public entry points. A GM acts directly; a player asks the primary GM client. */
async function depositItem(uuid){
 if(!permitted())throw Error('Utilities access is hidden by the GM.');
 if(isGM())return executeDeposit(uuid,game.user);
 playerStashGate(game.user);return requestGM('stash-deposit',{itemUuid:uuid});
}
async function withdrawItem(itemId,actorId){
 if(!permitted())throw Error('Utilities access is hidden by the GM.');
 if(isGM())return executeWithdraw(itemId,actorId,game.user);
 playerStashGate(game.user);
 const actor=game.actors.get(actorId);if(!isOwned(actor))throw Error('Choose a character you own.');
 if(!stashActor()?.items.get(itemId))throw Error('That item is no longer in the stash.');
 ui.notifications?.info('Asking the party to approve…');
 return requestGM('stash-withdraw',{itemId,actorId},CONSENT_TIMEOUT_MS+15000);
}
const notifyResult=p=>p.then(msg=>{if(msg)ui.notifications?.info(msg);},error);
/** Drag data from a drop event, via Foundry's helper when present. */
function dragData(event){
 const TE=foundry.applications?.ux?.TextEditor?.implementation??globalThis.TextEditor;
 try{return TE?.getDragEventData?TE.getDragEventData(event):JSON.parse(event.dataTransfer?.getData('text/plain')||'{}');}catch{return {};}
}
const stashItemFromUuid=uuid=>{const stash=stashActor();if(!stash||typeof uuid!=='string')return null;let doc=null;try{doc=fromUuidSync(uuid);}catch{}return doc?.parent&&doc.parent.id===stash.id?doc:null;};
/** Native actor-sheet drops: out of the stash goes through consent, into the stash is a move, not a copy. */
function onSheetDrop(actor,sheet,data){
 if(data?.type!=='Item'||!actor)return;
 const stash=stashActor();if(!stash)return;
 if(actor.id!==stash.id){const item=stashItemFromUuid(data.uuid);if(!item)return;notifyResult(withdrawItem(item.id,actor.id));return false;}
 if(stashItemFromUuid(data.uuid))return; // sorting inside the stash sheet
 notifyResult(depositItem(data.uuid));return false;
}
/** Party stash table columns, in order. The header and every row render exactly these cells. */
const STASH_COLUMNS=[['icon',''],['item','Item'],['qty','Qty'],['weight','Weight (each)'],['value','Value (each)'],['type','Type'],['action','Action']];
function stashBody(app){
 const stash=stashActor(),on=stashEnabled();
 if(!stash)return empty(isGM()?'No party stash yet. Create one in Utilities → Party Inventory.':'There is no party stash yet.');
 if(!on&&!isGM())return empty('The GM has turned the party stash off.');
 const rows=[...stash.items].map(i=>stashRow(i,{typeLabel:itemTypeLabel}));
 const q=app.filter.trim().toLowerCase(),shown=q?rows.filter(r=>r.name.toLowerCase().includes(q)||r.typeLabel.toLowerCase().includes(q)):rows;
 const takers=isGM()?allCharacters():permittedActors();
 const target=takers.some(a=>a.id===app.takeActorId)?app.takeActorId:takers[0]?.id;
 const groups=[...new Set(shown.map(r=>r.typeLabel))].sort((a,b)=>a.localeCompare(b));
 // Header and rows are built from the same column list and laid out by one shared grid template (agu-stash-grid),
 // so every header sits over its column at every width.
 const cell=(col,html)=>`<span class="agu-stash-cell agu-col-${col}" role="${col==='icon'?'presentation':'cell'}">${html}</span>`;
 const head=`<div class="agu-stash-grid agu-stash-head" role="row">${STASH_COLUMNS.map(([col,label])=>`<span class="agu-stash-cell agu-col-${col}" role="${col==='icon'?'presentation':'columnheader'}">${E(label)}</span>`).join('')}</div>`;
 const rowHTML=r=>`<div class="agu-stash-grid agu-stash-row" role="row" draggable="true" data-stash-item="${E(r.id)}" data-uuid="${E(r.uuid??'')}">${cell('icon',r.img?`<img class="agu-stash-icon" src="${E(r.img)}" alt="">`:'')}${cell('item',`<button type="button" class="agu-stash-name" data-open-item="${E(r.id)}" title="Open ${E(r.name)}">${E(r.name)}</button>`)}${cell('qty',E(r.quantity))}${cell('weight',E(r.weight))}${cell('value',E(r.value))}${cell('type',E(r.typeLabel))}${cell('action',target?btn('stash-take','Take',{kind:'ag-btn ag-btn--sm',attrs:`data-item="${E(r.id)}" aria-label="Take ${E(r.name)}"`}):'')}</div>`;
 const table=groups.map(g=>`<section class="agu-stash-group"><h3 id="agu-stash-g-${E(g.replace(/\W+/g,'-'))}">${E(g)}</h3><div class="agu-stash-table" role="table" aria-labelledby="agu-stash-g-${E(g.replace(/\W+/g,'-'))}">${head}${shown.filter(r=>r.typeLabel===g).map(rowHTML).join('')}</div></section>`).join('');
 const toolbar=`<div class="ag-toolbar"><input type="search" id="agu-stash-search" placeholder="Search items" value="${E(app.filter)}" aria-label="Search the stash"><div class="ag-toolbar__end">${takers.length?`<label class="agu-inline">Take into <select id="agu-stash-target">${takers.map(a=>option(a.id,a.name,target)).join('')}</select></label>`:''}</div></div>`;
 const note=isGM()?`<p class="agu-note">${on?'On for players.':'Off for players; only you can see and use it.'} You move items freely: drag from any sheet onto this tab, drag a row onto a sheet, or use Take.</p>`:`<p class="agu-note">Drag an item from your character sheet onto this tab to stash it. To take one out, drag its row onto your sheet or use Take${stashVoteRequired()?'; every other connected player must accept':''}.</p>`;
 return purseStrip(app,takers,target)+toolbar+(rows.length?(table||empty('No items match.')):empty('The stash is empty.'))+`<div class="agu-dropzone">Drop items anywhere on this tab to put them in the stash</div>`+note;
}
function stashPanel(app){
 const stash=stashActor();if(!stash||(!stashEnabled()&&!isGM()))return '';
 const tabs=`<nav class="ag-tabs agu-subtabs" aria-label="Stash sections">${[['items','Items'],['history','History']].map(([id,label])=>`<button type="button" data-stash-tab="${id}" aria-current="${app.stashTab===id?'page':'false'}" class="${app.stashTab===id?'active':''}">${label}</button>`).join('')}</nav>`;
 return `<section class="agu-stash" aria-label="Party stash">${tabs}<div class="agu-stash-body">${app.stashTab==='history'?historyBody(app):stashBody(app)}</div></section>`;
}
const HISTORY_PAGE=50;
/** Extra lines for a gold award row: reason, per-character gp, remainder, undo state and the GM's Undo button. */
function goldDetail(h){
 if(h.kind!=='gold-award')return '';
 const c=entryCoin(h),per=(h.recipients??[]).map(r=>`${r.actorName} +${r.added} ${c}${Number.isFinite(r.before)?` (${r.before} → ${r.after})`:''}${r.undone?' · undone':''}`).join('; ');
 const left=(h.recipients??[]).some(r=>!r.undone);
 const undo=(h.undo??[]).flatMap(u=>u.results.filter(r=>!r.ok).map(r=>r.reason)).filter(Boolean);
 return `${h.reason?`<p>${E(h.reason)}</p>`:''}<p>${E(per)}${h.remainder?` · ${E(h.remainder)} ${c} not handed out`:''}</p>${isGM()&&undo.length&&left?`<p class="agu-note">Last undo refused: ${E(undo.slice(-3).join(' '))}</p>`:''}${isGM()&&left?`<div class="agu-actions">${btn('gold-undo',(h.undo??[]).length?'Undo Remaining':'Undo',{kind:'ag-btn ag-btn--sm',attrs:`data-entry="${E(h.id)}"`})}</div>`:''}`;
}
/** Extra lines for a purse row: before → after, reason, undo state and the GM's Undo button. */
function purseDetail(h){
 if(!PURSE_KINDS.includes(h.kind))return '';
 const parts=[];
 if(h.moved&&Number.isFinite(h.purseBefore))parts.push(`Purse ${h.purseBefore} → ${h.purseAfter} ${h.coin}`);
 if(h.moved&&Number.isFinite(h.actorBefore))parts.push(`${h.actorName} ${h.actorBefore} → ${h.actorAfter} ${h.coin}`);
 if(h.undone)parts.push('undone');
 const refused=(h.undo??[]).filter(u=>!u.ok).map(u=>u.reason).filter(Boolean);
 return `${h.reason?`<p>${E(h.reason)}</p>`:''}${parts.length?`<p>${E(parts.join(' · '))}</p>`:''}${isGM()&&refused.length&&!h.undone?`<p class="agu-note">Last undo refused: ${E(refused.at(-1))}</p>`:''}${isGM()&&purseUndoable(h)?`<div class="agu-actions">${btn('purse-undo','Undo',{kind:'ag-btn ag-btn--sm',attrs:`data-entry="${E(h.id)}"`})}</div>`:''}`;
}
const worldClock=t=>{if(!Number.isFinite(t))return '';const d=Math.floor(t/86400),r=((t%86400)+86400)%86400,p=n=>String(Math.floor(n)).padStart(2,'0');return `World day ${d}, ${p(r/3600)}:${p((r%3600)/60)}`;};
function historyLine(h){
 if(PURSE_KINDS.includes(h.kind))return purseLine(h);
 if(h.kind==='gold-award'){const c=entryCoin(h),names=(h.recipients??[]).map(r=>r.actorName).join(', ');return h.mode==='split'?`${h.userName} split ${h.amount} ${c} between ${names}`:`${h.userName} awarded ${h.share} ${c} each to ${names}`;}
 const who=`${h.userName}${h.actorName?` (${h.actorName})`:''}`,qty=h.quantity>1?` ×${h.quantity}`:'';
 return h.kind==='deposit'?`${who} put ${h.itemName}${qty} in the stash`:h.moved?`${who} took ${h.itemName}${qty} out of the stash`:`${who} tried to take ${h.itemName}${qty} out of the stash`;
}
function historyBody(app){
 let list;try{list=stashHistory();}catch(e){return empty(e.message);}
 const rows=list.slice().reverse(),shown=rows.slice(0,app.historyShown);
 const tone=a=>a==='denied'||a==='timed-out'?'ag-badge--danger':a==='accepted'?'ag-badge--ok':a==='gm'?'ag-badge--accent':'';
 const items=shown.map(h=>`<div class="agu-history agu-stash-log"><div class="agu-line"><span class="agu-stash-log__what">${h.img?`<img class="agu-stash-icon" src="${E(h.img)}" alt="">`:''}<strong>${E(historyLine(h))}</strong></span><span class="ag-badge ${tone(h.approval)}">${E(h.kind==='gold-award'?(entryCoin(h)==='gp'?'Gold':'Coins'):PURSE_KINDS.includes(h.kind)&&h.approval==='gm'?'Purse · GM':approvalLabel(h))}</span></div>${goldDetail(h)}${purseDetail(h)}<small>${E(new Date(h.realTime).toLocaleString())}${Number.isFinite(h.worldTime)?` · ${E(worldClock(h.worldTime))}`:''}</small></div>`).join('');
 const more=rows.length>shown.length?`<div class="agu-actions">${btn('stash-history-more',`Show more (${rows.length-shown.length} older)`,{kind:'ag-btn'})}</div>`:'';
 const clear=isGM()?`<div class="ag-toolbar__end">${btn('gold-award','Award Gold',{kind:'ag-btn'})}${btn('stash-history-clear','Clear History',{kind:'ag-btn ag-btn--danger',disabled:!rows.length})}</div>`:'';
 return `<div class="ag-toolbar"><span class="agu-note">${rows.length} ${rows.length===1?'entry':'entries'}, newest first. The log keeps the latest ${STASH_HISTORY_CAP}.</span>${clear}</div>${rows.length?items+more:empty('Nothing has moved in or out of the stash yet.')}`;
}
/** Wires the stash panel inside the Utilities window: tabs, search, take-into, sheet links, row drag-out, and drop-in over the whole tab. */
UtilitiesApp.prototype.bindStash=function(root){
  for(const el of root.querySelectorAll('[data-stash-tab]'))el.addEventListener('click',()=>{this.stashTab=el.dataset.stashTab;this.render().catch(error);});
  root.querySelector('#agu-stash-search')?.addEventListener('input',e=>{this.filter=e.target.value;const at=e.target.selectionStart;this.render().then(()=>{const q=this.element?.querySelector?.('#agu-stash-search');if(q){q.focus();q.setSelectionRange?.(at,at);}}).catch(error);});
  root.querySelector('#agu-stash-target')?.addEventListener('change',e=>{this.takeActorId=e.target.value;});
  root.querySelector('#agu-purse-actor')?.addEventListener('change',e=>{this.takeActorId=e.target.value;this.render().catch(error);});
  root.querySelector('#agu-purse-coin')?.addEventListener('change',e=>{this.purseCoin=e.target.value;this.render().catch(error);});
  root.querySelector('#agu-purse-amount')?.addEventListener('input',e=>{this.purseAmount=e.target.value;});
  for(const b of root.querySelectorAll('[data-open-item]'))b.addEventListener('click',()=>{const item=stashActor()?.items.get(b.dataset.openItem);if(!item?.sheet)return error(Error('That item could not be opened.'));item.sheet.render(true);});
  for(const row of root.querySelectorAll('[data-stash-item]'))row.addEventListener('dragstart',ev=>{ev.dataTransfer?.setData('text/plain',JSON.stringify({type:'Item',uuid:row.dataset.uuid}));});
  const zone=root.querySelector('.agu-main');
  if(this.tab!=='inventory'||!zone||!root.querySelector('.agu-stash'))return;
  zone.addEventListener('dragover',ev=>{ev.preventDefault();zone.classList.add('agu-drop-over');});
  zone.addEventListener('dragleave',ev=>{if(!zone.contains(ev.relatedTarget))zone.classList.remove('agu-drop-over');});
  zone.addEventListener('drop',ev=>{ev.preventDefault();zone.classList.remove('agu-drop-over');const data=dragData(ev);
   if(data?.type!=='Item'||!data.uuid)return ui.notifications?.warn('Drop an item from a character sheet.');
   if(stashItemFromUuid(data.uuid))return;notifyResult(depositItem(data.uuid));});
};
/** API open(): the stash lives in the Utilities window, Party Inventory tab. */
async function openStash(){
 if(!permitted())throw Error('Utilities access is hidden by the GM.');
 if(!isGM()&&!stashEnabled())throw Error('The GM has turned the party stash off.');
 if(!stashActor())throw Error(isGM()?'Create the party stash first.':'There is no party stash yet.');
 if(!windowInstance||!windowInstance.rendered)windowInstance=new UtilitiesApp();
 windowInstance.tab='inventory';await windowInstance.render({force:true});return windowInstance;
}
/* ---- 0.12.0: embeddable party stash for partner modules (Character Hub's Inventory → Party stash).
   The same Items/purse markup as the Party Inventory tab, mounted into the caller's element. Every action goes through
   the same entry points as the window (depositItem, withdrawItem, depositCoins, takeCoins, adjustPurseDialog), so the
   same gates apply: GM always; players need Player Access and the stash on; take-outs keep the party vote. ---- */
const EMBED_ACTIONS=new Set(['stash-take','purse-deposit','purse-take','purse-adjust']);
const EMBED_MODES=new Set(['stash']);
const embeds=new Set();
/** HTML for one embed: a refusal note when this user may not see the stash, else the stash body (purse + items). */
function embedHTML(state){
 if(!permitted())return empty('Utilities is hidden by the GM.');
 if(!isGM()&&!stashEnabled())return empty(stashActor()?'The GM has turned the party stash off.':'There is no party stash yet.');
 return stashBody(state);
}
/**
 * api.embed.mount(element, {actorId, mode:'stash'}) → {unmount, refresh}.
 * actorId preselects that character for Take and coin moves when this user may use it (GM: any character; player: owned).
 */
function mountEmbed(element,{actorId='',mode='stash'}={}){
 if(!element||typeof element.addEventListener!=='function')throw TypeError('mount needs a DOM element.');
 if(!EMBED_MODES.has(mode))throw Error(`Unknown embed mode "${mode}". Supported: ${[...EMBED_MODES].join(', ')}.`);
 const ctrl={filter:'',takeActorId:String(actorId||''),purseCoin:'gp',purseAmount:'',mounted:true};
 const abort=new AbortController(),on=(el,ev,fn)=>el.addEventListener(ev,fn,{signal:abort.signal});
 element.classList?.add('ag-utilities','agu-embed');
 ctrl.render=async()=>{
  if(!ctrl.mounted)return;
  if(element.isConnected===false){ctrl.unmount();return;}
  const search=element.querySelector?.('#agu-stash-search'),focus=search&&search===globalThis.document?.activeElement?search.selectionStart:null;
  element.innerHTML=`<div class="agu-embed__body">${embedHTML(ctrl)}</div>`;
  if(focus!==null){const q=element.querySelector?.('#agu-stash-search');q?.focus?.();q?.setSelectionRange?.(focus,focus);}
 };
 ctrl.unmount=()=>{if(!ctrl.mounted)return;ctrl.mounted=false;abort.abort();embeds.delete(ctrl);element.innerHTML='';element.classList?.remove('ag-utilities','agu-embed');};
 // One set of delegated listeners on the caller's element, so re-rendering the inside never re-binds.
 on(element,'click',ev=>{
  const t=ev.target;
  const open=t?.closest?.('[data-open-item]');
  if(open){const item=stashActor()?.items.get(open.dataset.openItem);if(!item?.sheet)return error(Error('That item could not be opened.'));item.sheet.render(true);return;}
  const b=t?.closest?.('[data-action]');
  if(!b||!element.contains(b)||!EMBED_ACTIONS.has(b.dataset.action))return;
  ev.stopPropagation();
  UtilitiesApp.prototype.handle.call(ctrl,b.dataset.action,b,element).catch(error);
 });
 on(element,'input',ev=>{
  const t=ev.target;
  if(t?.id==='agu-stash-search'){ctrl.filter=t.value;ctrl.render().catch(error);}
  else if(t?.id==='agu-purse-amount')ctrl.purseAmount=t.value;
 });
 on(element,'change',ev=>{
  const t=ev.target;ev.stopPropagation();
  if(t?.id==='agu-stash-target')ctrl.takeActorId=t.value;
  else if(t?.id==='agu-purse-actor'){ctrl.takeActorId=t.value;ctrl.render().catch(error);}
  else if(t?.id==='agu-purse-coin'){ctrl.purseCoin=t.value;ctrl.render().catch(error);}
 });
 on(element,'dragstart',ev=>{const row=ev.target?.closest?.('[data-stash-item]');if(row)ev.dataTransfer?.setData('text/plain',JSON.stringify({type:'Item',uuid:row.dataset.uuid}));});
 on(element,'dragover',ev=>{ev.preventDefault();element.classList?.add('agu-drop-over');});
 on(element,'dragleave',ev=>{if(!element.contains(ev.relatedTarget))element.classList?.remove('agu-drop-over');});
 on(element,'drop',ev=>{ev.preventDefault();ev.stopPropagation();element.classList?.remove('agu-drop-over');const data=dragData(ev);
  if(data?.type!=='Item'||!data.uuid)return ui.notifications?.warn('Drop an item from a character sheet.');
  if(stashItemFromUuid(data.uuid))return;notifyResult(depositItem(data.uuid));});
 embeds.add(ctrl);
 ctrl.render().catch(error);
 return {unmount:ctrl.unmount,refresh:()=>ctrl.render()};
}
const refreshEmbeds=()=>{for(const e of [...embeds])e.render().catch(error);};
function rerenderStash(doc){const stash=stashActor();if(!doc||doc.parent?.id===stash?.id||doc.id===stash?.id)refreshEmbeds();if(!windowInstance?.rendered||windowInstance.tab!=='inventory')return;if(doc&&doc.parent?.id!==stash?.id&&doc.id!==stash?.id)return;windowInstance.render().catch(error);}
async function open(){if(!permitted())throw Error('Utilities access is hidden by the GM.');if(!windowInstance||!windowInstance.rendered)windowInstance=new UtilitiesApp();await windowInstance.render({force:true});return windowInstance;}
function refreshWindows(){
 if(!permitted()&&!isGM()){
  refreshEmbeds();document.querySelectorAll(`[data-ag-launcher="${ID}"]`).forEach(x=>x.remove());if(windowInstance?.rendered)windowInstance.close().catch(error);closeOverlay().catch(error);
 } else {rerenderStash();rerenderConditions();if(game.settings.get(ID,'overlayOpen')===true&&!overlayInstance?.rendered)openOverlay().catch(error);}
 addLauncher(ui?.actors,ui?.actors?.element);
}
function incomingSession(){
 const s=activeSession();if(!s||!permitted()||isGM())return;
 if(!s.actors.some(id=>isOwned(game.actors.get(id))))return;
 if(s.id===lastPromptedSession)return;
 lastPromptedSession=s.id;
 ui.notifications?.info(`New ${sessionKind(s)}: ${s.name}. Open Utilities to roll.`);
 if(!windowInstance||!windowInstance.rendered)windowInstance=new UtilitiesApp();
 windowInstance.tab='rolls';
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
 game.settings.register(ID,'lastResult',{name:'Utilities: Last Finished Check',scope:'world',config:false,type:Object,default:{},onChange:refreshWindows});
 // Characters whose owners may remove conditions: {actorId:true}. Absent means locked.
 game.settings.register(ID,'conditionUnlocks',{name:'Utilities: Condition Removal Unlocks',scope:'world',config:false,type:Object,default:{},onChange:refreshWindows});
 game.settings.register(ID,'overlayOpen',{name:'Utilities: Conditions Overlay',scope:'client',config:false,type:Boolean,default:false,onChange:syncOverlay});
 game.settings.register(ID,'stashEnabled',{name:'Utilities: Party Stash for Players',scope:'world',config:false,type:Boolean,default:false,onChange:refreshWindows});
 // Party vote on take-outs. Absent/true = vote (the 0.5.x behaviour); false = players withdraw freely.
 game.settings.register(ID,'stashVoteRequired',{name:'Utilities: Party Stash Take-Out Vote',scope:'world',config:false,type:Boolean,default:true,onChange:refreshWindows});
 // Append-only deposit/withdraw log, written only by the GM client (world settings are GM-write).
 // Coin take-out vote: '' = never saved (follows stashVoteRequired); 'on'/'off' once the GM saves GM Setup.
 game.settings.register(ID,'purseVoteRequired',{name:'Utilities: Party Purse Take-Out Vote',scope:'world',config:false,type:String,default:'',onChange:refreshWindows});
 game.settings.register(ID,'stashHistory',{name:'Utilities: Party Stash History',scope:'world',config:false,type:Array,default:[],onChange:refreshWindows});
 game.settings.register(ID,'overlayPosition',{name:'Utilities: Conditions Overlay Position',scope:'client',config:false,type:Object,default:{}});
});
Hooks.once('ready',()=>{
 const m=game.modules.get(ID);
 m.api={version:VERSION,contract:'ag-utilities/0.2-alpha',open,playerAccess:{contract:'ag-player-access/1',getState:()=>({contract:'ag-player-access/1',moduleId:ID,audience:'player',playerAccessEnabled:game.settings.get(ID,'playerAccessEnabled'),configurable:true}),setEnabled:async enabled=>{if(!isGM())throw Error('GM only.');if(typeof enabled!=='boolean')throw TypeError('Boolean required.');await game.settings.set(ID,'playerAccessEnabled',enabled);return m.api.playerAccess.getState();}},
  conditions:{contract:'ag-utilities-conditions/1',isUnlocked:actorId=>isUnlocked(getUnlocks(),actorId),setUnlocked,canRemove:(actorId,statusId)=>canRemove(game.actors.get(actorId),statusId),remove:removeCondition,openOverlay:async()=>{await game.settings.set(ID,'overlayOpen',true);return openOverlay();},closeOverlay:()=>game.settings.set(ID,'overlayOpen',false)},
  stash:{contract:'ag-utilities-stash/1',isEnabled:stashEnabled,setEnabled:setStashEnabled,isVoteRequired:stashVoteRequired,setVoteRequired:setStashVoteRequired,history:stashHistory,clearHistory:clearStashHistory,open:openStash,deposit:depositItem,withdraw:withdrawItem,listItems:listStashItems},
  embed:{contract:'ag-utilities-embed/1',modes:[...EMBED_MODES],mount:mountEmbed},
  purse:{contract:'ag-utilities-purse/1',coins:COINS,isVoteRequired:purseVoteRequired,setVoteRequired:setPurseVoteRequired,totals:purseTotals,deposit:depositCoins,take:takeCoins,adjust:adjustPurse,undo:undoPurseEntry,openAdjust:adjustPurseDialog},
  awardGold,undoGoldAward,gold:{contract:'ag-utilities-gold/1',award:awardGold,undo:undoGoldAward,defaultRecipients:()=>{if(!isGM())throw Error('GM only.');return goldDefaults();},openDialog:awardGoldDialog}};
 game.socket?.on?.(SOCKET,(msg,senderId)=>{void onSocket(msg,senderId).catch(error);});
 Hooks.on('renderActorDirectory',addLauncher);Hooks.on('createChatMessage',msg=>{void processSubmission(msg).catch(error);});
 for(const ev of ['updateActor','createActiveEffect','updateActiveEffect','deleteActiveEffect'])Hooks.on(ev,rerenderConditions);
 for(const ev of ['createItem','updateItem','deleteItem'])Hooks.on(ev,doc=>rerenderStash(doc));
 Hooks.on('dropActorSheetData',onSheetDrop);
 Hooks.on('updateUser',refreshWindows);addLauncher(ui?.actors,ui?.actors?.element);
 lastPromptedSession=activeSession()?.id||null;
 syncOverlay();
 console.info(`${ID} ${VERSION} Alpha initialized. Foundry V14/dnd5e 6.0.6 live acceptance pending.`);
});
