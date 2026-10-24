import {ID,VERSION,isPlayerCharacter,sharedConditionChoices,unknownStatusLabel,isLevelBackup,LEVEL_BACKUP_REFUSAL,SKILL_IDS,escapeHTML as E,createSession,summary,acceptRoll,skipRoll,resolveNow,cancelSession,projectSession,MAX_HISTORY,formatBonus,skillBonus,skillRollMode,tallyHTML,describeTableResult,resolveStatusSources,removeUnknownStatus,isUnlocked,withUnlocked,removalDecision,applyDecision,isController,withController,OVERLAY_OPACITY_DEFAULT,clampOverlayOpacity,overlayBackground,statusEntries,resolveStatusId,conditionGroups,hasStatus,isReadOnlyStatus,READ_ONLY_STATUS_HINT,stashRow,historyEntry,containedItems,moveBundle,contentsNote,appendHistory,approvalLabel,planStashDelete,STASH_HISTORY_CAP,rollFormSession,normalizeTab,rollPrefill,ROLL_OPEN_MODES,readGp,planGoldAward,goldAwardEntry,planGoldUndo,applyGoldUndo,goldCardHTML,COINS,COIN_LABELS,entryCoin,readCoin,readCoins,planCoinMove,planPurseAdjust,purseEntry,purseUndoable,planPurseUndo,applyPurseUndo,purseLine,PURSE_KINDS,ELECTRUM_OFF,coinChoices,shownCoins,strandedElectrum,planElectrumConvert,convertPreview,convertEntry,convertLine,planConvertUndo,applyConvertUndo,CONSENT_TIMEOUT_MS,consentVoters,createPoll,recordVote,pollOutcome,shopLine,fundLogEntry,COIN_EXCHANGE,coinsText,coinStripHTML,coinChipsHTML} from './core.mjs';
import {launcherRoot,mountLauncher} from './ag-launchers.mjs';
import {confirmDialog,confirmDanger,guardDirty,infoDialog,formDialog} from './ag-dialogs.mjs';
import {windowSize,subTabs,tabPanelAttrs,bindTablist,fold,bindFolds,linkButton,uiState} from './ag-html.mjs';
import {readDrop,resolveItemDrop,grantBundle} from './ag-item-drop.mjs';
import {shopsApi,shopsView,shopsFooter,bindShops,handleShops,shopHooks,shopsDirty} from './shops.mjs';
import {button,emptyState,rowHTML,rowsHTML,focusKey,restoreFocus,refocusSoon,guardKeys,stopActivationKeys} from './ui-parts.mjs';
import {pickStashDeposit} from './keyboard-add.mjs';
import {configureTrade,tradeApi,tradeHooks,tradeSocketHandlers,handleTrade,playerShopsView,bindPlayerShops,shopsVisible,shopsOn,shopVoteRequired,executeBuy,refreshShopWindows,postTradeCard} from './shop-buy.mjs';
import {executeSell} from './shop-sell.mjs';
import {servicesApi,executeServiceUse} from './services.mjs';
import {merchantsApi,migrateLists} from './merchant-lists.mjs';
import {executeExchange,exchange,quoteExchange,exchangeHTML,bindExchange,fundFee,FUND_FEE_MAX,FUND_SLOW,fundRequest} from './party-fund.mjs';
import {importApi} from './shop-import.mjs';
import {installItemTips,uuidTipAttrs} from './item-tips.mjs';

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
// 0.13.2 GM Setup "Use electrum": off (the default) leaves ep out of every Utilities coin choice and display.
const electrumEnabled=()=>game.settings.get(ID,'electrumEnabled')===true;
const getSession=()=>game.settings.get(ID,'activeSession')||{};
const getHistory=()=>game.settings.get(ID,'history')||[];
const getResult=()=>{const s=game.settings.get(ID,'lastResult');return s?.schema==='ag-utilities-session/0.1'&&s.status==='completed'?s:null;};
const activeSession=()=>{const s=getSession();return s?.schema==='ag-utilities-session/0.1'&&s.status==='active'?s:null;};
const isOwned=(actor,user=game.user)=>Boolean(actor&&!isLevelBackup(actor)&&(user?.isGM||actor.testUserPermission?.(user,'OWNER')));
const allCharacters=()=>[...game.actors].filter(a=>a.type==='character'&&!isLevelBackup(a)).sort((a,b)=>a.name.localeCompare(b.name));
/** An Actor named by id as the target of an action; refuses a level backup copy. */
const targetActor=id=>{const a=game.actors.get(id);if(isLevelBackup(a))throw Error(LEVEL_BACKUP_REFUSAL);return a;};
const permittedActors=()=>allCharacters().filter(a=>isOwned(a));
const ownedIds=()=>permittedActors().map(a=>a.id);
const skillName=k=>game.i18n.localize(CONFIG.DND5E?.skills?.[k]?.label??k);
/** 0.26.1: CONFIG.statusEffects is keyed by id in Foundry V14 (an array in older cores); statusEntries reads both. */
const statusList=()=>statusEntries(globalThis.CONFIG?.statusEffects);
const statusConfig=k=>statusList().find(x=>x.id===k);
const statusName=k=>game.i18n.localize(statusConfig(k)?.name??k);
/** 0.28.3: a status Foundry does not list (a Character Hub mark such as agch-vex) is named after the effect that carries it, never its raw id. */
const statusLabel=(actor,k)=>statusConfig(k)?statusName(k):unknownStatusLabel(actor,k);
const nativeIds=()=>statusList().map(x=>x.id);
/** 0.29.1: the one conditions list the tracker's Apply and the Character Hub's conditions strip both offer: native statuses by name, without read-only ones (Strain chip) and exhaustion (it has levels: the pill beside HP). */
const conditionChoices=()=>sharedConditionChoices(statusList(),{label:statusName});
const getUnlocks=()=>game.settings.get(ID,'conditionUnlocks')||{};
// 0.23.0: GM Setup "owners manage conditions" (world, default off) and condition controllers {userId:true} (world, GM only).
const ownersManage=()=>game.settings.get(ID,'ownersManageConditions')===true;
const getControllers=()=>game.settings.get(ID,'conditionControllers')||{};
const controlsConditions=(user=game.user)=>Boolean(user&&!user.isGM&&isController(getControllers(),user.id));
/** 0.29.2: the unlock and owners-manage settings no longer decide anything (owners manage their own characters; players manage non-player actors). */
const conditionRules=()=>({nativeIds:nativeIds(),controllers:getControllers(),users:[...game.users]});
/** Party characters this user can see (Limited or better); the GM and condition controllers see all of them. */
const partyCharacters=(user=game.user)=>allCharacters().filter(a=>user?.isGM||controlsConditions(user)||a.testUserPermission?.(user,'LIMITED'));
const canRemove=(actor,id,user=game.user)=>removalDecision({user,actor,statusId:id,...conditionRules()}).ok;
/** Whether `user` may apply some native condition to `actor` (the Apply row shows); each status is re-checked on apply. */
const canApplyTo=(actor,user=game.user)=>statusList().some(x=>applyDecision({user,actor,statusId:x.id,...conditionRules()}).ok);
const error=e=>{console.error(`[${ID}]`,e);ui.notifications?.error(e?.message||String(e));};
const option=(id,title,selected)=>`<option value="${E(id)}" ${id===selected?'selected':''}>${E(title)}</option>`;
const tip=text=>`data-tooltip="${E(text)}" data-tooltip-class="ag-tooltip"`;
/** The module's one button helper (ui-parts.mjs); `icon` is a Font Awesome solid icon name. */
const btn=(action,title,opts={})=>button(action,title,opts);
/** The module's one empty state (ui-parts.mjs): a short title and, optionally, the next step, an icon and one action. */
const empty=(title,text='',opts)=>emptyState(title,text,opts);
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
function actorsCheckboxes(ticked=[]){const a=allCharacters(),on=new Set(ticked);return a.length?`<div class="agu-choices">${a.map(x=>`<label class="ag-field ag-field--inline"><input type="checkbox" name="agu-participant" value="${E(x.id)}" ${on.has(x.id)?'checked':''}> ${E(x.name)}</label>`).join('')}</div>`:'<p class="ag-field__hint">No characters yet. Add at least two characters to start a check.</p>';}
/** 0.26.0: skills as toggle chips (aria-pressed), like the shop's "Item types it buys". */
function skillChoices(ticked=['acr','ath','prc']){return `<div class="ag-chip-group agu-skill-chips" role="group" aria-labelledby="agu-skill-label">${SKILL_IDS.map(s=>`<button type="button" class="ag-chip agu-skill" data-skill="${E(s)}" aria-pressed="${ticked.includes(s)}">${E(skillName(s))}</button>`).join('')}</div>`;}
/** Characters ticked by default: the dnd5e Primary Party, else characters owned by connected players. */
function partyDefaults(){try{return goldDefaults().actorIds;}catch{return [];}}
/**
 * One start form for both kinds: Group result (a Group Check) or Individual rolls (a Roll Request). 0.26.0: a fold,
 * open while nothing is running or shown; while a check runs it is a one-line hint instead.
 */
function createPanel(app,{idle=true}={}){if(!isGM())return '';
 if(activeSession())return `<p class="ag-field__hint agu-start-hint">${E(notice())}</p>`;
 const pre=app.rollPrefill??null,group=app.rollMode!=='individual',radio=(v,label,hint,on)=>`<label class="ag-field ag-field--inline agu-mode"><input type="radio" name="agu-mode" value="${v}" ${on?'checked':''}><span><strong>${E(label)}</strong><br><small>${E(hint)}</small></span></label>`;
 const body=`<fieldset><legend>Result</legend><div class="agu-choices">${radio('group','Group result','Everyone rolls; the average of the rolls is compared with the DC for one pass or fail.',group)}${radio('individual','Individual rolls','Each character makes one roll of one skill; each result is shown on its own.',!group)}</div></fieldset>
 <label class="ag-field">Title<input id="agu-title" maxlength="120" placeholder="${group?'New Group Check':'New Roll Request'}" value="${E(pre?.title??'')}"></label>
 <fieldset><legend>Participating characters</legend>${actorsCheckboxes(pre?.actorIds??partyDefaults())}</fieldset>
 <div class="ag-field"><span id="agu-skill-label">Skills</span>${skillChoices(pre?.skills)}<p class="ag-field__hint" id="agu-skill-hint">${group?'Characters choose from the picked skills.':'Pick exactly one skill.'}</p></div>
 <div class="agu-compact"><label class="ag-field">DC<input id="agu-dc" type="number" min="0" max="100" value="${pre?(pre.dc===null?'':E(pre.dc)):'15'}"></label><label class="ag-field" data-group-only ${group?'':'hidden'}>Rolls per character<select id="agu-roll-count">${[1,2,3,4,5].map(n=>option(String(n),String(n),'1')).join('')}</select></label></div>
 <p class="ag-field__hint">Leave the DC empty to record rolls without a pass or fail. Players pick advantage or disadvantage when they roll.</p>
 <div class="agu-actions">${btn('start','Start Rolls',{kind:'primary',icon:'fa-dice-d20'})}</div>`;
 const open=app.startOpen??(idle||Boolean(pre));
 return `<div class="agu-start" data-start-rolls>${fold({title:'Start Rolls',open,body})}</div>`;
}
/** GM-only start. Reads the Rolls form; one active slot, so a second start is refused whatever its mode. */
async function startRolls(form){
 if(!isGM())throw Error('GM only.');
 if(activeSession())throw Error('Resolve or cancel the active interaction first.');
 const dcText=String(form.dc??'').trim();
 for(const id of [].concat(form.actors??[]))targetActor(id);
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
 return `<div class="agu-checkbar" role="progressbar" aria-valuemin="0" aria-valuemax="${slots.length}" aria-valuenow="${done}" aria-label="Rolls resolved">${slots.map(x=>`<span class="agu-checkbar-seg ${E(x.status)}"></span>`).join('')}</div>`;
}
/** Slot status → kit badge variant: accepted reads as ok, waiting and skipped stay plain. */
const slotBadge=status=>status==='accepted'?'ag-badge--ok':'';
function verdictOf(s,sm){return s.dc===null?'Recorded':sm.result==='success'?'Success':sm.result==='failure'?'Failure':'No Result';}
function resultView(res){const kind=res.kind;
 const projected=projectSession(res,{userId:game.user.id,isGM:isGM(),ownedActorIds:ownedIds()}),sm=summary(projected);
 const verdict=kind==='group'?verdictOf(res,sm):'Responses';
 const cls=verdict==='Success'?'success':verdict==='Failure'?'failure':'';
 const rows=projected.actors.map(id=>{
  const cells=projected.slots.filter(x=>x.actorId===id).map(sl=>{
   const text=sl.status==='accepted'?(sl.total===null?'Roll hidden':`${labelSkill(sl.skill)} ${sl.total}${kind==='request'&&res.dc!==null?` · ${sl.total>=res.dc?'Success':'Failure'}`:''}`):sl.status==='skipped'?'Skipped':'No roll';
   return `<span class="ag-badge ${slotBadge(sl.status)}">${E(text)}</span>`;
  }).join('');
  return rowHTML({title:E(game.actors.get(id)?.name||'Unavailable Actor'),end:`<span class="agu-contributions">${cells}</span>`,cls:'agu-roll-row'});
 }).join('');
 const avg=kind==='group'&&sm.average!==null?`<div class="agu-result-score"><span class="agu-result-num">${E(sm.average.toFixed(1))}</span><span class="agu-result-vs">average${res.dc===null?'':` vs DC ${E(res.dc)}`}</span></div>`:'';
 return `<section class="agu-card ag-card agu-result ${cls}"><div class="agu-line"><h2>${E(res.name)}</h2><span class="ag-badge">${E(sessionKind(res))} · finished</span></div><div class="agu-verdict">${E(verdict)}</div>${avg}${rows?rowsHTML(rows):''}${isGM()?`<div class="agu-actions">${btn('clear-result','Clear Result',{kind:'ghost'})}</div><p class="ag-field__hint">Everyone sees this result until you clear it or start the next check.</p>`:''}</section>`;
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
  const cells=slots.map(s=>`<span class="ag-badge ${slotBadge(s.status)}">${E(slotText(s,session.kind))}</span>`).join('');
  const bonuses=isGM()&&actor&&slots.some(x=>x.status==='pending')?session.skills.map(k=>`${E(skillName(k))} ${E(bonusText(actor,k))}`).join(' · '):'';
  return rowHTML({title:E(actor?.name||'Unavailable Actor'),meta:bonuses,cls:'agu-roll-row',end:`<span class="agu-contributions">${cells}</span>${isGM()&&slots.some(x=>x.status==='pending')?btn('skip','Skip One',{kind:'sm',attrs:`data-actor="${E(id)}" aria-label="Skip one roll for ${E(actor?.name||'this character')}"`}):''}`});
 }).join('');
 const preset=selectedActor&&skills[0]?skillRollMode(selectedActor,skills[0]):{mode:0,sources:[]};
 const skillOptions=skills.map(x=>option(x,`${skillName(x)} (${bonusText(selectedActor,x)})`,x)).join('');
 const rollForm=actorIds.length?`<section class="agu-action-panel"><h3>Your roll is requested</h3><p class="agu-note">${E(session.name)} · ${session.kind==='group'?'Choose one of the allowed skills.':'Roll the requested skill.'}</p><div class="agu-compact"><label class="ag-field">Character<select id="agu-roll-actor">${actorIds.map(id=>option(id,game.actors.get(id)?.name??'Unavailable',selected)).join('')}</select></label><label class="ag-field">Skill (bonus)<select id="agu-roll-skill">${skillOptions}</select></label><label class="ag-field">Roll<select id="agu-roll-mode">${['0','1','-1'].map(m=>option(m,modeLabels[m],String(preset.mode))).join('')}</select></label></div><p class="agu-note" id="agu-mode-hint">${E(modeHint(preset))}</p>${btn('roll','Roll Now',{kind:isGM()?'':'primary',cls:'agu-roll-large',icon:'fa-dice-d20',disabled:!skills.length})}</section>`:'';
 return `<section class="ag-card agu-card"><div class="agu-line"><h2>${E(session.name)}</h2><span class="ag-badge ag-badge--accent">${E(sessionKind(session))}</span></div>
 <p class="agu-note agu-big">${session.kind==='group'?`DC ${E(session.dc??'none')} · ${session.rollsPerActor} per character · unique skills`:`Public ${E(skillName(session.skills[0]))} request · ${session.dc===null?'No DC':`DC ${E(session.dc)}`}`}</p>
 <div class="agu-line agu-big"><strong>${E(headline)}</strong><strong>${sum.accepted+sum.skipped}/${sum.totalSlots} resolved</strong></div>
 ${checkBar(projected.slots)}
 ${isGM()?`<p class="agu-note agu-big">${session.kind==='group'?`Average ${sum.average===null?'—':sum.average.toFixed(1)}`:`${sum.accepted} responses accepted`}</p>`:''}
 ${isGM()?(rows?rowsHTML(rows):'')+rollForm:rollForm+`<p class="agu-note">${sum.pending} ${sum.pending===1?'roll':'rolls'} still pending.</p>`}
 ${isGM()?`<div class="agu-actions agu-session-actions">${btn('cancel','Cancel Session',{kind:'ghost'})}${btn('resolve','End & Record',{kind:'primary'})}</div>`:''}
 </section>`;
}
/** Rolls. 0.26.0: the GM gets sub-tabs Current (the check, its result, Start Rolls) and History (finished checks). */
const ROLLS_SUBS=[{id:'current',label:'Current'},{id:'history',label:'History'}];
function rollsCurrent(app){const active=activeSession(),res=getResult();
 const idle=res?resultView(res):isGM()?empty('No rolls running','Start one with Start Rolls below.',{icon:'fa-dice-d20'}):empty('No roll requested yet','When your GM asks for a roll, it appears here.',{icon:'fa-dice-d20'});
 return (active?sessionView(active,app):idle)+createPanel(app,{idle:!active&&!res});}
function rollsView(app){
 if(!isGM())return rollsCurrent(app);
 const sub=ROLLS_SUBS.some(t=>t.id===app.rollsSub)?app.rollsSub:'current';
 return `${subTabs({group:'agu-rolls',label:'Rolls sections',tabs:ROLLS_SUBS.map(t=>({...t,count:t.id==='history'?getHistory().length:undefined})),selected:sub})}<section ${tabPanelAttrs('agu-rolls',sub)} class="agu-subpanel">${sub==='history'?historyView(app):rollsCurrent(app)}</section>`;}
function stashActor(){return game.actors.find(a=>a.getFlag(ID,'partyStash')===true);}
const stashEnabled=()=>game.settings.get(ID,'stashEnabled')===true;
/** Defaults to ON: only an explicit false turns the party vote off. */
const stashVoteRequired=()=>game.settings.get(ID,'stashVoteRequired')!==false;
/** Coin vote: '' (never saved) follows the item vote; 'on'/'off' once the GM has saved it. */
const purseVoteRequired=()=>{const v=game.settings.get(ID,'purseVoteRequired');return v==='on'?true:v==='off'?false:stashVoteRequired();};
/**
 * Party Inventory. 0.26.0: the GM's stash card is one toolbar line (name · count · On/Off badge · Award Gold); the
 * On/Off switch lives only in GM Setup (the badge links there). Players see the stash, or why it isn't there.
 */
function inventoryView(app){
 const stash=stashActor(),on=stashEnabled(),ic='fa-sack-dollar';
 if(!isGM())return on&&stash?stashPanel(app):stash?empty('The party stash is off','Your GM has turned the party stash off for now.',{icon:ic}):empty('No party stash yet','Your GM hasn\'t set up a party stash yet.',{icon:ic});
 if(!stash)return `<div class="ag-toolbar agu-stash-bar"><div class="ag-toolbar__end">${awardGoldBtn()}</div></div>${empty('No party stash yet','Create the NPC Actor that holds the party\'s items and coins.',{icon:ic,action:btn('create-stash','Create Party Stash',{icon:'fa-plus'})})}`;
 const count=stash.items.size??[...stash.items].length;
 return `<div class="ag-toolbar agu-stash-bar"><span class="agu-stash-bar__name"><strong>${E(stash.name)}</strong> · ${E(count)} ${count===1?'item':'items'}</span><span class="ag-badge ${on?'ag-badge--ok':''}"><i class="fa-solid ${on?'fa-eye':'fa-eye-slash'}" aria-hidden="true"></i> ${on?'On for players':'Off for players'}</span>${linkButton('Change in GM Setup',{data:{action:'goto-tab',tab:'setup'}})}<div class="ag-toolbar__end">${awardGoldBtn()}</div></div>${stashPanel(app)}`;
}
/** Award Gold looks the same wherever it appears. */
const awardGoldBtn=()=>btn('gold-award','Award Gold',{icon:'fa-coins'});
async function openUuid(uuid){const doc=await fromUuid(uuid);if(!doc?.sheet)throw Error('That document could not be found or has no sheet.');doc.sheet.render(true);}
/** Roll Tables (GM only: 0.26.0 hides the tab from players, who only ever had an empty page). */
function tableView(app){if(!isGM())return '';
 const tables=[...game.tables].sort((a,b)=>a.name.localeCompare(b.name));
 const recipients=[...game.users].filter(u=>!u.isGM).map(u=>`<label class="ag-field ag-field--inline"><input type="checkbox" name="agu-recipient" value="${E(u.id)}">${E(u.name)}</label>`).join('');
 return `<section class="ag-card agu-card"><h2>RollTable Messenger</h2><p class="ag-field__hint">Rolls with Foundry's own RollTable draw; documents are linked in the message.</p><label class="ag-field">Foundry RollTable<select id="agu-table">${tables.map(t=>option(t.id,t.name,t.id)).join('')}</select></label><div class="agu-actions">${btn('table-roll','Roll Privately',{icon:'fa-dice',disabled:!tables.length})}</div><label class="ag-field">Outgoing message<textarea id="agu-table-message" rows="3">${E(app.tableDraft)}</textarea></label><fieldset><legend>Recipients (none = public to all)</legend>${recipients?`<div class="agu-choices">${recipients}</div>`:'<p class="ag-field__hint">No players yet. Players appear here when they join.</p>'}</fieldset><label class="ag-field ag-field--inline"><input type="checkbox" id="agu-table-auto" ${app.tableAuto?'checked':''}>Auto-Send drawn results</label><div class="agu-actions">${btn('table-send','Send Message',{kind:'primary',disabled:!app.tableDraft.trim()})}</div></section>${drawPanel(app)}`;
}
function drawPanel(app){const d=app.lastDraw;if(!d?.length)return '';
 return `<section class="ag-card agu-card"><h3>Last draw</h3>${rowsHTML(d.map(r=>r.kind==='document'?rowHTML({lead:r.img?`<img class="ag-row__icon agu-status-icon" src="${E(r.img)}" alt="">`:'',title:E(r.label),end:`<span class="ag-badge">Document</span>${btn('open-uuid','Open',{kind:'sm',attrs:`data-open-uuid="${E(r.uuid)}" aria-label="Open ${E(r.label)}"`})}`}):rowHTML({title:E(r.label)})))}</section>`;}
function conditionIcon(id){const cfg=statusConfig(id),img=cfg?.img??cfg?.icon;return typeof img==='string'&&img&&!/^\s*javascript:/i.test(img)?`<img class="agu-status-icon" src="${E(img)}" alt="">`:'';}
function statusSourceLine(actor,id){
 const sources=resolveStatusSources(actor,id);
 if(!sources.length)return `<span class="agu-source">No active effect found for this status; it may come from the system or another module.</span>`;
 return sources.map(x=>{
  let origin='';
  if(x.origin){let doc=null;try{doc=fromUuidSync(x.origin);}catch{}
   origin=` · from ${doc?.name?linkButton(doc.name,{data:{openUuid:x.origin}}):E(x.parentName||'unknown source')}`;}
  else if(x.parentName&&!x.onActor)origin=` · from ${E(x.parentName)}`;
  return `<span class="agu-source">Effect: <strong>${E(x.name)}</strong>${origin}${x.onActor?'':' (item effect: Remove disables it)'}${x.disabled?' (disabled)':''}</span>`;
 }).join('');
}
/** GM: who holds condition control, each with Revoke (immediate). A controller sees that they hold it. */
function controllersLine(){
 if(isGM()){const list=[...game.users].filter(u=>!u.isGM&&isController(getControllers(),u.id));
  return `<div class="agu-line agu-controllers"><span>Condition controllers: ${list.length?list.map(u=>`<span class="ag-badge">${E(u.name)}${btn('revoke-controller','Revoke',{kind:'ghost sm',attrs:`data-user="${E(u.id)}" aria-label="Revoke condition control from ${E(u.name)}"`})}</span>`).join(' '):'none'}</span><small class="agu-source">Grant in GM Setup.</small></div>`;}
 return controlsConditions()?`<div class="agu-line agu-controllers"><span class="ag-badge ag-badge--ok" ${tip('The GM lets you also apply and remove native conditions on other players\' characters')}><i class="fa-solid fa-hand-sparkles" aria-hidden="true"></i>Condition controller</span></div>`:'';}
function conditionsView(app){const characters=partyCharacters();const actor=characters.find(a=>a.id===app.actorId)||characters[0];const statuses=actor?[...(actor.statuses||[])]:[],known=conditionChoices();
 // 0.26.1: exactly one option is selected (the last pick, else the first); every option used to carry `selected`, so the list
 // reset to its last entry on each re-render and Apply sent that status instead of the one chosen.
 const pick=known.some(x=>x.id===app.conditionPick)?app.conditionPick:known[0]?.id;
 const showSources=actor&&(isGM()||actor.testUserPermission?.(game.user,'OBSERVER'));
 const roster=characters.map(a=>`<button type="button" data-condition-actor="${E(a.id)}" class="agu-roster-row ${actor?.id===a.id?'active':''}"><span class="agu-who"><span>${E(a.name)}</span></span><span class="agu-roster-status">${[...(a.statuses||[])].map(s=>conditionIcon(s)+`<span>${E(statusLabel(a,s))}</span>`).join('')||'No conditions'}</span></button>`).join('');
 const details=statuses.length?statuses.map(id=>{const unknown=!statusConfig(id);
  return rowHTML({title:`<span class="agu-status-title">${conditionIcon(id)}${E(statusLabel(actor,id))}${unknown?`<span class="ag-badge ag-badge--warn" ${tip('Not a native Foundry status')}>Custom</span>`:''}${isReadOnlyStatus(id)?`<span class="ag-badge" ${tip(READ_ONLY_STATUS_HINT)}><i class="fa-solid fa-lock" aria-hidden="true"></i>Read only</span>`:''}</span>`,meta:isReadOnlyStatus(id)?`${E(READ_ONLY_STATUS_HINT)}.`:unknown&&showSources?statusSourceLine(actor,id):'',end:canRemove(actor,id)?btn('remove-status','Remove',{kind:'sm',attrs:`data-status="${E(id)}" aria-label="Remove ${E(statusLabel(actor,id))} from ${E(actor.name)}"`}):'',cls:'agu-condition-row'});}):[];
 const detailList=details.length?rowsHTML(details):`<p class="ag-field__hint">No conditions on this character right now.</p>`;
 const overlayOn=game.settings.get(ID,'overlayOpen')===true;
 return `<section class="ag-card agu-card"><div class="agu-line"><h2>Party Conditions</h2>${btn('toggle-overlay',overlayOn?'Close Overlay':'Pop Out Overlay',{kind:'sm',icon:'fa-up-right-from-square',attrs:`aria-pressed="${overlayOn}"`})}</div><div class="agu-party-panes"><section><h3>Party Characters</h3>${roster||empty('No characters to show',isGM()?'Create a character to see its conditions here.':'Party characters appear here once your GM shares them with you.')}</section><section><h3>${E(actor?.name||'Select a character')}</h3>${detailList}${actor&&canApplyTo(actor)?`<div class="agu-compact"><label class="ag-field">Native condition<select id="agu-condition-status">${known.map(x=>option(x.id,x.label,pick)).join('')}</select></label>${btn('add-status','Apply',{kind:'primary'})}</div>`:''}</section></div>${controllersLine()}<p class="ag-field__hint">Who may change conditions, Custom and read-only statuses: see Help.</p></section>`;
}
/** Rolls → History (GM): finished and cancelled checks, newest first. */
function historyView(app){if(!isGM())return '';
 const history=getHistory();
 if(!history.length)return empty('No finished checks yet','Group Checks and Roll Requests appear here when they end.',{icon:'fa-clock-rotate-left'});
 return `<div class="ag-toolbar"><span class="ag-toolbar__count">${history.length} ${history.length===1?'check':'checks'}, newest first</span></div>${rowsHTML(history.map(s=>{
  const sm=summary(s),detail=s.slots.map(sl=>`${game.actors.get(sl.actorId)?.name??'Unavailable Actor'}: ${sl.status==='accepted'?`${sl.skill?skillName(sl.skill):'Roll'} ${sl.total}${s.kind==='request'&&s.dc!==null?` (${sl.total>=s.dc?'Success':'Failure'} vs DC ${s.dc})`:''}`:sl.status==='skipped'?'Skipped':'No roll'}`).join(' · ');
  const outcome=s.status==='cancelled'?'Cancelled':sm.result==='no-result'?'No Result':sm.result==='completed'?'Recorded':sm.result==='success'?'Success':'Failure';
  const when=`${new Date(s.closedAt||s.createdAt).toLocaleString()}${s.kind==='group'&&sm.average!==null?` · Average ${sm.average.toFixed(1)}`:''}`;
  return rowHTML({title:E(s.name),meta:`${E(detail)}<br>${E(when)}`,end:`<span class="ag-badge ${outcome==='Success'?'ag-badge--ok':outcome==='Failure'?'ag-badge--danger':''}">${E(sessionKind(s))} · ${E(outcome)}</span>`,cls:'agu-log-row'});
 }),{cls:'agu-roll-history'})}`;
}
/** Help, grouped by tab (0.26.0: the explanations that used to sit on the working screens live here). */
function helpHtml(){const gm=isGM(),sec=(title,body)=>`<h3>${title}</h3>${body}`;
 const rolls=sec('Rolls',gm?'<p>Open <em>Start Rolls</em>, pick characters and skills, and send a roll to players. <em>Group result</em> averages everyone\'s rolls against the DC for one pass or fail (a Group Check); <em>Individual rolls</em> asks each character for one roll of one skill and shows each result (a Roll Request). Only one can run at a time; it ends when everyone has rolled, or you can end it early with <em>End &amp; Record</em>. <em>History</em> lists finished and cancelled checks.</p>':'<p>When the GM asks for a roll, roll it here for your character.</p>');
 const inv=sec('Party Inventory',`<p>The shared party stash${gm?' is an NPC Actor kept by Utilities. While it is on for players (GM Setup), they get Observer permission on it so they can read item sheets; Utilities moves items for them through the GM client. You can move items freely: <em>Add to stash…</em> (from any character, or a copy from the Items sidebar) or drag from any sheet onto the tab; <em>Take</em> or drag a row onto a sheet':''}.${gm?'':' Use <em>Add to stash…</em> (or drag an item from your character sheet onto the Items tab) to stash it; to take one out, use <em>Take</em> into the character picked in <em>Take into</em>, or drag its row onto your sheet (the party may have to accept).'} <em>Delete…</em> on a row removes the item, or some of a stack, for good after a confirmation (a container goes with what is inside it); there is no vote and it is recorded in History. Use <em>Take</em> to keep an item.</p><p><em>Party Fund</em> holds the party purse (copper to platinum${gm?'; electrum only while <em>Use electrum</em> is on in GM Setup':''}). Pick a character, then <em>Deposit</em> coins from it, <em>Take</em> coins out${gm?'':' (taking out uses the party vote when the GM has it on for coins)'}, or <em>Change coins</em> at the standard rates (${gm?'no fee unless you set one in GM Setup → Party Fund':'no fee unless the GM sets one'}). The <em>Log</em> lists who moved how much, and when.${gm?' You can also Adjust the purse directly, and Undo adjustments and takes in History.':''}</p>`);
 const shops=gm?sec('Shops','<p>In <em>Shops &amp; services</em>, build shops (and Banks, deprecated: players change coins in Party Fund), then <em>Present</em> one to all or chosen players; they buy, sell or use it until you click <em>Stop showing</em>. The shop editor has <em>Details</em>, <em>Items</em> and <em>Coins &amp; buying</em>; buttons marked <em>Applies now</em> change the saved shop at once, everything else waits for Save Changes. <em>Add item…</em> (Items) and <em>Choose Actor…</em> (Details) do the same as dropping items or an Actor on the editor.</p><p><em>Merchant lists</em> group the shops and services of a settlement or any group. <em>Share…</em> one with the whole party or chosen players; players can browse a shared list. Switch each store <em>Open</em> (shown to the list\'s players, so they can buy, sell or use it) or <em>Closed</em> (stops showing it to every player), or use <em>Open all</em> / <em>Close all</em>.</p>')
  :shopsVisible()?sec('Shops','<p>Shops and services your GM shows you. Pick Buy, choose how many, who gets it and who pays, then confirm. <em>Merchant lists</em> shows the lists your GM shares with you: <em>Open</em> stores you can use, <em>Closed</em> ones you can only look inside.</p>'):'';
 const tables=gm?sec('Roll Tables','<p>Roll a table with Foundry\'s own draw and send the result to chat or selected players. Text, document and compendium results are supported; documents are linked in the message.</p>'):'';
 const cond=sec('Conditions',`<p>See the conditions on party characters. Players can apply and remove native conditions on their own character and on any monster, NPC or creature (the Character Hub's Target switch reaches tokens); another player's character is the GM's, or a condition controller's${gm?'':controlsConditions()?' (you are one)':''}. Statuses Foundry does not list (shown as Custom) are traced to the effect that grants them, and only the GM can remove them. Read-only statuses such as the Strain chip are changed where they come from (Cinders or the Character Hub Strain bar). Automatic duration, exhaustion and concentration management are not part of Utilities. The overlay has a background slider (only for you).</p>`);
 const setup=gm?sec('GM Setup','<p>Player Access and the other settings; nothing changes until Save Changes. Skipping a contribution, ending or cancelling a check, clearing stash history and removing a non-native condition ask you to confirm first.</p>'):'';
 return `<p><strong>Utilities</strong> holds the party tools for running a session.</p>${rolls}${inv}${shops}${tables}${cond}${setup}`;}
/** GM Setup: settings only. Nothing saves until Save Changes in the footer (D4: Player Access too); Cancel discards. */
function setupView(){
 const box=(id,on,label,hint)=>`<div class="agu-setting"><label class="ag-field ag-field--inline"><input id="${id}" type="checkbox" data-setup-field ${on?'checked':''}>${E(label)}</label><p class="ag-field__hint agu-setting__hint">${E(hint)}</p></div>`;
 return `<section class="ag-card agu-card agu-setup"><h2>GM Setup</h2>${[
  box('agu-access',game.settings.get(ID,'playerAccessEnabled')===true,'Player Access','Shows the Utilities launcher to players. Native Actor ownership is not changed.'),
  box('agu-stash-enabled',stashEnabled(),'Party Stash on for players','Off: players can\'t see the stash or move items in or out. You can always manage it.'),
  box('agu-stash-vote',stashVoteRequired(),'Party must accept when a player takes an item out','On: any other player can deny, and no answer in 60 seconds cancels. Off: players take items out freely. You are never voted on. Every move is recorded in the stash History tab either way.'),
  box('agu-purse-vote',purseVoteRequired(),'Party must accept when a player takes coins out','Same rules as the item vote, but for the party purse and set separately. Until you save GM Setup it follows the item setting above.'),
  box('agu-electrum',electrumEnabled(),'Use electrum','Off: electrum (ep) is left out of the party purse, Award Gold and coin Deposit/Take/Adjust. If the purse still holds electrum it stays visible (dimmed) until you convert it to silver or gold; nothing is converted without you confirming. Character sheets are not changed.')
 ].join('')}<h3>Party Fund</h3><div class="agu-setting"><label class="ag-field">Coin exchange fee (%)<input id="agu-exchange-fee" type="number" min="0" max="${FUND_FEE_MAX}" step="1" inputmode="numeric" data-setup-field value="${E(fundFee())}"></label><p class="ag-field__hint agu-setting__hint">Party Inventory → Party Fund → Change coins. 0 (the default) means no fee; up to ${FUND_FEE_MAX} %, taken in the coin given, rounded up. Banks keep their own fee.</p></div><h3>Shopping</h3>${[
  box('agu-shops-enabled',shopsOn(),'Shops on for players','On (with Player Access): players get a Shops tab with the shops you present to them, and can buy. Off: players see no shops.'),
  box('agu-shop-vote',shopVoteRequired(),'Party must accept when a player spends the party purse','Same rules as the coin vote: any other player can deny, and no answer in 60 seconds cancels. You are never asked. Until you save GM Setup it follows the coin vote above.')
 ].join('')}<h3>Conditions</h3>${conditionControllersField()}</section>`;}
/** GM Setup: tick players who may apply and remove native conditions on every character (saved with Save Changes). */
function conditionControllersField(){const players=[...game.users].filter(u=>!u.isGM),ctrl=getControllers();
 return `<div class="agu-setting"><fieldset class="ag-field agu-controller-list"><legend>Condition controllers</legend>${players.length?players.map(u=>`<label class="ag-field ag-field--inline"><input type="checkbox" name="agu-controller" value="${E(u.id)}" data-setup-field ${isController(ctrl,u.id)?'checked':''}>${E(u.name)}</label>`).join(''):'<span class="agu-source">No players in this world.</span>'}</fieldset><p class="ag-field__hint agu-setting__hint">Every player can already change conditions on their own character and on any monster or NPC. Ticked players can also change other players' characters, like you, and nothing else. They need Player Access to open Utilities. Revoke here or in the Conditions tab at any time.</p></div>`;}
/** Window footer, only where there is a draft to save: GM Setup and the Shops editors get Cancel / status / Save Changes. */
function footerHTML(app){
 if(app.tab==='shops'){const f=shopsFooter(app);if(f)return f;}
 if(app.tab==='setup'&&isGM())return `<footer class="ag-footer agu-footer">${btn('setup-cancel','Cancel',{kind:'ghost'})}<span class="ag-footer__status" role="status" data-setup-status>${E(app.setupStatus??'')}</span>${btn('save-access','Save Changes',{kind:'primary'})}</footer>`;
 return '';
}
/** The top tabs for this user. 0.26.0: roll History is a sub-tab of Rolls; Roll Tables is GM only, after the shared tabs. */
function windowTabs(){
 return [['rolls','Rolls','fa-dice-d20'],['inventory','Party Inventory','fa-sack-dollar'],...(isGM()?[['shops','Shops','fa-store',true]]:shopsVisible()?[['shops','Shops','fa-store']]:[]),['conditions','Conditions','fa-heart-pulse'],...(isGM()?[['tables','Roll Tables','fa-table-list',true],['setup','GM Setup','fa-gears',true]]:[])];
}
class UtilitiesApp extends ApplicationV2 {
 static DEFAULT_OPTIONS={id:'ashen-gate-utilities-window',classes:['ag-app','ag-utilities','agu-window'],window:{title:'Ashen Gate | Utilities',resizable:true,minimizable:true},position:{width:900,height:690}};
 // Compact size; Comfortable (General Manager → My Appearance) scales it when the window is created.
 constructor(options={}){super({...options,position:{...windowSize(UtilitiesApp.DEFAULT_OPTIONS.position),...options.position}});this.setupStatus='';this.tab='rolls';this.rollsSub='current';this.rollMode='group';this.actorId='';this.rollActorId='';this.tableDraft='';this.tableAuto=false;this.lastDraw=[];this.filter='';this.takeActorId='';this.stashTab='items';this.fundAction='deposit';this.historyShown=HISTORY_PAGE;this.purseCoin='gp';this.purseAmount='';this.shopSub='list';this.shopSearch='';this.shopSort='location';this.shopDraft=null;this.shopDirty=false;this.shopStatus='';this.playerShopSub='open';this.listDraft=null;this.listDirty=false;this.listStatus='';this.shopImport=null;
  // 0.26.0: GM Setup's unsaved edits are guarded (tab switch, close); the shop and list drafts are kept in memory and guarded on close.
  this.setupGuard=guardDirty({status:()=>this.element?.querySelector?.('[data-setup-status]'),onChange:d=>{this.setupStatus=d?'Unsaved changes':'';}});
  this.ui=uiState(ID);}
 async _renderHTML(){if(!permitted())throw Error('Utilities is hidden for players.');this.tab=normalizeTab(this.tab);
  // 0.26.0: the old History tab is Rolls → History.
  if(this.tab==='history'){this.tab='rolls';this.rollsSub='history';}
  const tabs=windowTabs();
  if(!tabs.some(t=>t[0]===this.tab))this.tab='rolls';
  const body=this.tab==='rolls'?rollsView(this):this.tab==='inventory'?inventoryView(this):this.tab==='shops'?(isGM()?shopsView(this):playerShopsView(this)):this.tab==='tables'&&isGM()?tableView(this):this.tab==='conditions'?conditionsView(this):this.tab==='setup'&&isGM()?setupView():empty('Nothing to show here');
  const version=game.modules.get(ID)?.version??VERSION;
  const appearance=appearanceOpener()?`<button type="button" class="ag-btn ag-btn--ghost ag-btn--sm" data-open-appearance ${tip('Choose your Ashen Gate appearance')}><i class="fa-solid fa-palette" aria-hidden="true"></i> Appearance</button>`:'';
  const tabBar=tabs.map(([id,label,icon,gm])=>`<button type="button" role="tab" id="agu-tab-${id}" data-tab="${id}" aria-controls="agu-main-panel" aria-selected="${this.tab===id}" tabindex="${this.tab===id?0:-1}" class="${[this.tab===id?'active':'',gm?'ag-tab--gm':''].filter(Boolean).join(' ')}"><i class="fa-solid ${icon}" aria-hidden="true"></i>${E(label)}</button>`).join('');
  return `<div class="agu-root"><header class="ag-header agu-header"><div class="ag-header__title"><h1><span class="ag-header__brand">Ashen Gate</span> | Utilities</h1></div><div class="ag-header__meta">${appearance}<span class="ag-version">v${E(version)}</span><button type="button" class="ag-btn ag-btn--ghost ag-btn--sm" data-action="help"><i class="fa-solid fa-circle-question" aria-hidden="true"></i> Help</button></div></header><nav class="ag-tabs ag-tabs--scroll agu-tabs" role="tablist" aria-label="Utility sections">${tabBar}</nav><main class="agu-main" id="agu-main-panel" role="tabpanel" aria-labelledby="agu-tab-${this.tab}">${body}</main>${footerHTML(this)}</div>`;
 }
 // Appearance needs no wiring here: the kit's --ag-* tokens are inherited from the document,
 // which General Manager (when active) keeps in sync with the user's skin.
 _replaceHTML(html,content){
  // 0.26.0: focus and the scroll position survive a re-render (§9.6).
  const active=globalThis.document?.activeElement,key=active&&content.contains?.(active)?focusKey(active):null,scroll=content.querySelector?.('.agu-main')?.scrollTop??0;
  content.innerHTML=html;guardKeys(content);this.bind(content);
  const main=content.querySelector?.('.agu-main');if(main&&scroll)main.scrollTop=scroll;
  restoreFocus(content,key);
 }
 /** A top tab switch: asks first when GM Setup has unsaved edits (they would be lost). */
 async selectTab(tab){if(tab===this.tab)return;if(this.tab==='setup'&&!(await this.setupGuard.confirm()))return;this.tab=tab;this.setupStatus='';await this.render();}
 /** Closing asks first when GM Setup, a shop or a merchant list has unsaved edits. */
 async close(options){
  if(!options?.force){
   if(!(await this.setupGuard.confirm()))return this;
   if(shopsDirty(this)&&!(await confirmDanger('Your changes to the open shop or merchant list have not been saved.',{title:'Discard unsaved changes?',yes:'Discard changes',no:'Keep editing'})))return this;
  }
  return super.close(options);
 }
 bind(root){
  const nav=root.querySelector('.agu-tabs');
  if(nav){bindTablist(nav);for(const el of nav.querySelectorAll('[data-tab]'))el.addEventListener('click',()=>{this.selectTab(el.dataset.tab).catch(error);});}
  // Sub-tabs (Rolls, Party Inventory, Shops): one Tab stop, arrow keys; each module handler still runs on click.
  for(const list of root.querySelectorAll('.ag-tabs--sub'))bindTablist(list);
  for(const b of root.querySelectorAll('[id^="agu-rolls-tab-"]'))b.addEventListener('click',()=>{this.rollsSub=b.dataset.tab;this.render().catch(error);});
  const start=root.querySelector('[data-start-rolls] details');
  start?.addEventListener('toggle',()=>{this.startOpen=start.open;});
  root.querySelector('#agu-condition-status')?.addEventListener('change',e=>{this.conditionPick=e.target.value;});
  bindFolds(root,this.ui);
  for(const r of root.querySelectorAll('input[name="agu-mode"]'))r.addEventListener('change',()=>{this.rollMode=r.value;const group=r.value==='group';
   for(const el of root.querySelectorAll('[data-group-only]'))el.hidden=!group;
   const hint=root.querySelector('#agu-skill-hint');if(hint)hint.textContent=group?'Characters choose from the picked skills.':'Pick exactly one skill.';
   const title=root.querySelector('#agu-title');if(title)title.placeholder=group?'New Group Check':'New Roll Request';
   if(!group)[...root.querySelectorAll('.agu-skill[aria-pressed="true"]')].slice(1).forEach(x=>x.setAttribute('aria-pressed','false'));});
  // Skill chips: toggle; Individual rolls keeps exactly one.
  for(const c of root.querySelectorAll('.agu-skill'))c.addEventListener('click',()=>{const on=c.getAttribute('aria-pressed')==='true',single=this.rollMode==='individual';
   if(single)for(const x of root.querySelectorAll('.agu-skill'))x.setAttribute('aria-pressed','false');
   c.setAttribute('aria-pressed',String(single?true:!on));});
  root.querySelector('[data-open-appearance]')?.addEventListener('click',()=>{const open=appearanceOpener();if(!open)return ui.notifications?.warn('General Manager is not active, so there are no appearance settings to open.');Promise.resolve(open()).catch(error);});
  for(const b of root.querySelectorAll('[data-condition-actor]'))b.addEventListener('click',async()=>{this.actorId=b.dataset.conditionActor;await this.render();});
  root.querySelector('#agu-roll-actor')?.addEventListener('change',e=>{this.rollActorId=e.target.value;this.render().catch(error);});
  root.querySelector('#agu-roll-skill')?.addEventListener('change',e=>{const actor=game.actors.get(root.querySelector('#agu-roll-actor')?.value),m=actor?skillRollMode(actor,e.target.value):{mode:0,sources:[]};const sel=root.querySelector('#agu-roll-mode');if(sel)sel.value=String(m.mode);const hint=root.querySelector('#agu-mode-hint');if(hint)hint.textContent=modeHint(m);});
  for(const b of root.querySelectorAll('[data-open-uuid]'))b.addEventListener('click',ev=>{ev.preventDefault();openUuid(b.dataset.openUuid).catch(error);});
  root.querySelector('#agu-table-message')?.addEventListener('input',e=>{this.tableDraft=e.target.value;const b=root.querySelector('[data-action="table-send"]');if(b)b.disabled=!this.tableDraft.trim();});
  root.querySelector('#agu-table-auto')?.addEventListener('change',e=>{this.tableAuto=e.target.checked;});
  if(this.tab==='setup'&&isGM())this.setupGuard?.watch(root.querySelector('.agu-setup'));
  this.bindStash(root);
  bindShops(this,root,{error,render:()=>this.render().catch(error)});
  bindPlayerShops(this,root,{render:()=>this.render().catch(error)});
  for(const b of root.querySelectorAll('[data-action]'))b.addEventListener('click',()=>this.handle(b.dataset.action,b,root).catch(error));
 }
 /**
  * Every [data-action] button of the window and the embed. 0.27.1: when the action is done (a dialog it opened
  * confirmed or cancelled, the view re-rendered), focus goes back to the button, or after Take to the nearest Take.
  */
 async handle(action,b,root){if(b.disabled)return;b.disabled=true;const keys=action==='stash-take'||action==='stash-delete'?takeFocusKeys(b):[focusKey(b)];try{
  if(await handleTrade(this,action,b,{render:()=>this.render()}))return;
  if(await handleShops(this,action,b,{render:()=>this.render(),root}))return;
  if(action==='start'){
   const val=q=>root.querySelector(q)?.value,checked=n=>[...root.querySelectorAll(`input[name="${n}"]:checked`)].map(x=>x.value);
   const session=await startRolls({mode:checked('agu-mode')[0]??this.rollMode??'group',title:val('#agu-title'),actors:checked('agu-participant'),skills:[...root.querySelectorAll('.agu-skill[aria-pressed="true"]')].map(x=>x.dataset?.skill??x.value),rollsPerActor:val('#agu-roll-count')??1,dc:val('#agu-dc')??''});
   this.rollPrefill=null;this.startOpen=undefined;ui.notifications.info(`${sessionKind(session)} sent to selected players.`);return;
  }
  if(action==='help'){await infoDialog('Utilities Help',helpHtml());return;}
  if(action==='roll'){await rollFromActor(root);return;}
  if(action==='clear-result'){if(!isGM())throw Error('GM only.');await game.settings.set(ID,'lastResult',{});return;}
  if(action==='skip'||action==='resolve'||action==='cancel'){
   if(!isGM())throw Error('GM only.');const session=activeSession();if(!session)throw Error('No active check.');
   const msg=action==='skip'?`Skip one contribution for ${game.actors.get(b.dataset.actor)?.name||'the character'}?`:action==='resolve'?'End now? All remaining contributions will be marked Skipped and the result saved to History.':'Cancel this interaction and save it in History?';
   if(!await confirmDialog(msg,{title:action==='skip'?'Skip this contribution?':action==='resolve'?'End this check?':'Cancel this interaction?',yes:action==='skip'?'Skip contribution':action==='resolve'?'End and record':'Cancel interaction',no:'Keep going'}))return;
   await queueSession(async()=>{const latest=activeSession();if(!latest||latest.id!==session.id)throw Error('Session has changed.');
    if(action==='skip')skipRoll(latest,{actorId:b.dataset.actor,reason:'GM-confirmed',userId:game.user.id});
    if(action==='resolve')resolveNow(latest,{userId:game.user.id});
    if(action==='cancel')cancelSession(latest,{userId:game.user.id});
    await storeSession(latest);
   });
   return;
  }
  if(action==='create-stash'){if(!isGM())throw Error('GM only.');if(stashActor())throw Error('Party Stash already exists.');await Actor.create({name:'Ashen Gate | Party Stash',type:'npc',ownership:{default:stashEnabled()?OBSERVER():0},flags:{[ID]:{partyStash:true}}});await this.render();return;}
  if(action==='stash-take'){try{await notifyResult(withdrawItem(b.dataset.item,root.querySelector('#agu-stash-target')?.value));}finally{await this.render?.();}return;}
  if(action==='stash-delete'){try{await notifyResult(deleteStashItem(b.dataset.item));}finally{await this.render?.();}return;}
  if(action==='stash-add'){await addToStash(this,b,root);return;}
  if(action==='stash-history-more'){this.historyShown+=HISTORY_PAGE;await this.render();return;}
  if(action==='stash-history-clear'){if(!await confirmDanger('Clear the whole stash history? This cannot be undone.',{title:'Clear stash history?',yes:'Clear history'}))return;await clearStashHistory();this.historyShown=HISTORY_PAGE;ui.notifications?.info('Stash history cleared.');await this.render();return;}
  if(action==='gold-award'){if(await awardGoldDialog())await this.render();return;}
  if(action==='gold-undo'){
   if(!isGM())throw Error('GM only.');
   if(!await confirmDanger('Take this gold back from every character who still has it? Anyone who has already spent it keeps it, and you will be told who.',{title:'Undo gold award?',yes:'Undo award'}))return;
   const res=await undoGoldAward(b.dataset.entry),ok=res.filter(r=>r.ok),no=res.filter(r=>!r.ok);
   const msg=`${ok.length?`Took back ${ok.map(r=>`${r.removed} ${r.coin??'gp'} from ${r.actorName}`).join(', ')}.`:'Nothing was taken back.'}${no.length?` Not undone: ${no.map(r=>r.reason).join(' ')}`:''}`;
   (no.length?ui.notifications?.warn:ui.notifications?.info)?.call(ui.notifications,msg);await this.render();return;
  }
  if(action==='purse-deposit'||action==='purse-take'){
   const args={actorId:root.querySelector('#agu-purse-actor')?.value,coin:root.querySelector('#agu-purse-coin')?.value,amount:Number(root.querySelector('#agu-purse-amount')?.value)};
   await notifyResult((action==='purse-deposit'?depositCoins:takeCoins)(args));return;
  }
  if(action==='fund-exchange'){
   b.disabled=true;
   try{const msg=await exchange(fundRequest(this));ui.notifications?.info(msg);this.fund={...(this.fund??{}),receive:''};}
   catch(e){const m=e?.message??String(e);ui.notifications?.[m===FUND_SLOW?'warn':'error'](m);}
   await this.render();return;
  }
  if(action==='purse-adjust'){if(await adjustPurseDialog())await this.render();return;}
  if(action==='purse-convert'){if(await convertElectrumDialog())await this.render?.();return;}
  if(action==='purse-convert-undo'){
   if(!isGM())throw Error('GM only.');
   if(!await confirmDanger('Undo this electrum conversion? The electrum goes back into the purse and the silver/gold it added comes out, only if the purse still holds that silver/gold.',{title:'Undo this conversion?',yes:'Undo conversion'}))return;
   const r=await undoElectrumConvert(b.dataset.entry);
   (r.ok?ui.notifications?.info:ui.notifications?.warn)?.call(ui.notifications,r.ok?'Conversion undone.':`Not undone: ${r.reason}`);await this.render();return;
  }
  if(action==='purse-undo'){
   if(!isGM())throw Error('GM only.');
   if(!await confirmDanger('Undo this purse change? A take is undone only if the character still holds the coins; nothing goes below 0.',{title:'Undo purse change?',yes:'Undo change'}))return;
   const r=await undoPurseEntry(b.dataset.entry);
   (r.ok?ui.notifications?.info:ui.notifications?.warn)?.call(ui.notifications,r.ok?'Purse change undone.':`Not undone: ${r.reason}`);await this.render();return;
  }
  if(action==='goto-tab'){await this.selectTab(b.dataset.tab);return;}
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
   const actor=game.actors.get(this.actorId)||partyCharacters()[0];if(!actor)throw Error('Select a character.');const id=root.querySelector('#agu-condition-status')?.value;this.conditionPick=id;
   if(isReadOnlyStatus(id))throw Error(`${statusName(id)} can't be applied here. ${READ_ONLY_STATUS_HINT}.`);
   try{ui.notifications?.info(await applyCondition(actor.id,id));}finally{await this.render();}
   return;
  }
  if(action==='revoke-controller'){const u=game.users.get(b.dataset.user);if(!await confirmDanger(`Revoke condition control from ${u?.name??'this player'}? They can then only change conditions on their own characters, if you allow that.`,{title:`Revoke condition control from ${u?.name??'this player'}?`,yes:'Revoke control'}))return;await setController(b.dataset.user,false);ui.notifications?.info(`${u?.name??'The player'} is no longer a condition controller.`);return;}
  if(action==='toggle-lock'){await setUnlocked(b.dataset.actor,!isUnlocked(getUnlocks(),b.dataset.actor));return;}
  if(action==='toggle-overlay'){await game.settings.set(ID,'overlayOpen',game.settings.get(ID,'overlayOpen')!==true);await this.render();return;}
  if(action==='setup-cancel'){if(!isGM())throw Error('GM only.');this.setupGuard?.markClean();this.setupStatus='';await this.render();return;}
  if(action==='save-access'){if(!isGM())throw Error('GM only.');const feeBox=root.querySelector('#agu-exchange-fee'),fee=feeBox?Number(feeBox.value===''?0:feeBox.value):null;if(fee!==null&&(!Number.isInteger(fee)||fee<0||fee>FUND_FEE_MAX))throw Error(`The exchange fee must be a whole number from 0 to ${FUND_FEE_MAX}. Nothing was saved.`);await game.settings.set(ID,'playerAccessEnabled',Boolean(root.querySelector('#agu-access')?.checked));const stashBox=root.querySelector('#agu-stash-enabled');if(stashBox&&stashBox.checked!==stashEnabled())await setStashEnabled(stashBox.checked);const voteBox=root.querySelector('#agu-stash-vote');if(voteBox&&voteBox.checked!==stashVoteRequired())await setStashVoteRequired(voteBox.checked);const coinBox=root.querySelector('#agu-purse-vote');if(coinBox)await setPurseVoteRequired(coinBox.checked);const epBox=root.querySelector('#agu-electrum');if(epBox&&epBox.checked!==electrumEnabled())await setElectrumEnabled(epBox.checked);const shopBox=root.querySelector('#agu-shops-enabled');if(shopBox&&shopBox.checked!==shopsOn())await game.settings.set(ID,'shopsEnabled',shopBox.checked);const shopVote=root.querySelector('#agu-shop-vote');if(shopVote)await game.settings.set(ID,'shopPurseVote',shopVote.checked?'on':'off');if(fee!==null&&fee!==fundFee())await game.settings.set(ID,'exchangeFeePercent',fee);const ownBox=root.querySelector('#agu-owner-conditions');if(ownBox&&ownBox.checked!==ownersManage())await setOwnersManage(ownBox.checked);const ctrlBoxes=[...(root.querySelectorAll?.('input[name="agu-controller"]')??[])];if(ctrlBoxes.length)await setControllers(ctrlBoxes.filter(x=>x.checked).map(x=>x.value));this.setupGuard?.markClean();this.setupStatus='Saved';const st=root.querySelector?.('[data-setup-status]');if(st)st.textContent=this.setupStatus;ui.notifications.info('GM Setup saved.');return;}
 }finally{b.disabled=false;refocusSoon(root,keys);}}
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
/* ---- Conditions: applying and removing go through one gate each. A GM changes directly; anyone else (owners,
   condition controllers) asks the primary GM client over the module socket, and that client re-checks everything. ---- */
async function setUnlocked(actorId,unlocked){
 if(!isGM())throw Error('GM only.');if(typeof unlocked!=='boolean')throw TypeError('Boolean required.');if(!targetActor(actorId))throw Error('Character not found.');
 await game.settings.set(ID,'conditionUnlocks',withUnlocked(getUnlocks(),actorId,unlocked));
}
async function setOwnersManage(on){if(!isGM())throw Error('GM only.');if(typeof on!=='boolean')throw TypeError('Boolean required.');await game.settings.set(ID,'ownersManageConditions',on);}
/** A condition controller must be an existing non-GM user. */
const controllerUser=userId=>{const u=game.users.get(userId);if(!u)throw Error('Player not found.');if(u.isGM)throw Error('A GM already controls conditions.');return u;};
async function setController(userId,on){
 if(!isGM())throw Error('GM only.');if(typeof on!=='boolean')throw TypeError('Boolean required.');if(on)controllerUser(userId);
 await game.settings.set(ID,'conditionControllers',withController(getControllers(),userId,on));
}
/** Replaces the whole list (GM Setup Save Changes); every id must be an existing non-GM user. */
async function setControllers(userIds){
 if(!isGM())throw Error('GM only.');if(!Array.isArray(userIds))throw TypeError('List of player ids required.');
 const next={};for(const id of userIds){controllerUser(id);next[id]=true;}
 await game.settings.set(ID,'conditionControllers',next);
}
const controllerList=()=>[...game.users].filter(u=>!u.isGM&&isController(getControllers(),u.id)).map(u=>({id:u.id,name:u.name}));
/** Never claim a removal that didn't happen: a write another module refuses resolves without error, so re-read the Actor. */
const stillThere=(actor,statusId)=>Error(`${statusName(statusId)} is still on ${actor.name}: another effect or module keeps it. Check its source.`);
async function executeRemoval(actor,statusId,user){
 const d=removalDecision({user,actor,statusId,...conditionRules()});if(!d.ok)throw Error(d.reason);
 if(nativeIds().includes(statusId)){await actor.toggleStatusEffect(statusId,{active:false});if(hasStatus(actor,statusId))throw stillThere(actor,statusId);return `Removed ${statusName(statusId)} from ${actor.name}.`;}
 const r=await removeUnknownStatus(actor,statusId);
 if(hasStatus(actor,statusId))throw stillThere(actor,statusId);
 return r.disabled?`Disabled ${r.disabled} item effect(s) and deleted ${r.deleted} on ${actor.name}.`:`Removed "${statusName(statusId)}" from ${actor.name}.`;
}
async function removeCondition(actorId,statusId){
 if(!permitted())throw Error('Utilities access is hidden by the GM.');
 const actor=game.actors.get(actorId),d=removalDecision({user:game.user,actor,statusId,...conditionRules()});if(!d.ok)throw Error(d.reason);
 return isGM()?executeRemoval(actor,statusId,game.user):requestGM('remove-status',{actorId,statusId});
}
/** 0.23.0: apply a native condition. Runs on the GM client (directly, or for a player's request after re-checking). */
async function executeApply(actor,statusId,user){statusId=resolveStatusId(statusId,nativeIds());
 const d=applyDecision({user,actor,statusId,...conditionRules()});if(!d.ok)throw Error(d.reason);
 await actor.toggleStatusEffect(statusId,{active:true});
 if(!hasStatus(actor,statusId))throw Error(`${statusName(statusId)} was not applied to ${actor.name}: Foundry or another module refused it.`);
 return `Applied ${statusName(statusId)} to ${actor.name}.`;
}
async function applyCondition(actorId,statusId){
 if(!permitted())throw Error('Utilities access is hidden by the GM.');statusId=resolveStatusId(statusId,nativeIds());
 const actor=game.actors.get(actorId),d=applyDecision({user:game.user,actor,statusId,...conditionRules()});if(!d.ok)throw Error(d.reason);
 return isGM()?executeApply(actor,statusId,game.user):requestGM('apply-status',{actorId,statusId});
}
/** 0.29.2: whether `userId` (default: you) may apply (or remove) `statusId` on this Actor document, a world character or an unlinked token's Actor. Player Access included. */
function canChangeActor(actor,statusId,apply=true,userId=game.user?.id){const user=game.users.get(userId);if(!user||!actor)return false;if(!user.isGM&&game.settings.get(ID,'playerAccessEnabled')!==true)return false;statusId=resolveStatusId(statusId,nativeIds());return (apply?applyDecision:removalDecision)({user,actor,statusId,...conditionRules()}).ok;}
async function removeFromUI(actor,statusId){
 if(!actor)throw Error('Character not found.');
 if(isGM()&&!statusConfig(statusId)&&!await confirmDanger(`Remove "${statusName(statusId)}" from ${actor.name}? It is not a native status, so its source effect will be removed.`,{title:'Remove this condition?',yes:'Remove condition'}))return;
 ui.notifications?.info(await removeCondition(actor.id,statusId));
}
const pendingRequests=new Map();
function requestGM(type,data,timeout=15000,{timeoutMessage='The GM client did not answer. Nothing was changed.'}={}){
 if(!game.socket?.emit)return Promise.reject(Error('The Utilities socket is unavailable.'));
 if(![...game.users].some(u=>u.isGM&&u.active))return Promise.reject(Error('A GM must be connected.'));
 const requestId=crypto.randomUUID();
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pendingRequests.delete(requestId);reject(Error(timeoutMessage));},timeout);
  pendingRequests.set(requestId,{resolve,reject,timer});
  game.socket.emit(SOCKET,{...data,type,requestId,userId:game.user.id});
 });
}
const gmHandlers={
 'remove-status':async(msg,user)=>{if(!user.isGM&&game.settings.get(ID,'playerAccessEnabled')!==true)throw Error('Utilities is hidden for players.');return executeRemoval(game.actors.get(msg.actorId),String(msg.statusId??''),user);},
 'apply-status':async(msg,user)=>{if(!user.isGM&&game.settings.get(ID,'playerAccessEnabled')!==true)throw Error('Utilities is hidden for players.');return executeApply(game.actors.get(msg.actorId),String(msg.statusId??''),user);},
 'stash-deposit':async(msg,user)=>executeDeposit(String(msg.itemUuid??''),user),
 'stash-withdraw':async(msg,user)=>executeWithdraw(String(msg.itemId??''),String(msg.actorId??''),user),
 'stash-delete':async(msg,user)=>executeDelete(String(msg.itemId??''),msg.quantity,user),
 'purse-deposit':async(msg,user)=>executePurseDeposit({actorId:String(msg.actorId??''),coin:String(msg.coin??''),amount:msg.amount},user),
 'purse-take':async(msg,user)=>executePurseTake({actorId:String(msg.actorId??''),coin:String(msg.coin??''),amount:msg.amount},user),
 'shop-buy':async(msg,user)=>executeBuy(msg,user),
 'shop-sell':async(msg,user)=>executeSell(msg,user),
 'service-use':async(msg,user)=>executeServiceUse(msg,user),
 'fund-exchange':async(msg,user)=>executeExchange(msg,user)
};
/** Broadcasts every client handles: the consent poll itself. */
const pollHandlers={
 'stash-vote-request':msg=>{if(Array.isArray(msg.voters)&&msg.voters.includes(game.user?.id))showVotePrompt(msg);},
 'stash-poll-closed':msg=>{closeVotePrompt(msg.pollId);},
 'stash-vote':(msg,senderId)=>{if(isGM()&&coordinatorIsMe())receiveVote(msg,senderId);},
 ...tradeSocketHandlers
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

/* ---- Conditions overlay: a per-user pop-out. 0.23.0: a slider fades only its background (0-100 %, saved per user);
   the header, text and buttons stay opaque. ---- */
const overlayOpacity=()=>{try{return clampOverlayOpacity(game.settings.get(ID,'overlayOpacity'));}catch{return OVERLAY_OPACITY_DEFAULT;}};
/** The kit's window colour as the main Foundry page resolves it (a popped-out browser window may not carry the skin). */
const mainSurface=()=>{try{return globalThis.getComputedStyle?.(globalThis.document.documentElement)?.getPropertyValue?.('--ag-surface')?.trim()||undefined;}catch{return undefined;}};
/**
 * 0.26.1: the slider value goes on the window element as an inline background (plus the CSS variable) and its content
 * area is kept clear. Inline, so it wins over core window rules, including those of a window popped out to its own
 * browser window, where the module's variable rule alone did not reach the visible background.
 */
function applyOverlayOpacity(app,value=overlayOpacity()){const v=clampOverlayOpacity(value),el=app?.element;
 el?.style?.setProperty?.('--agu-ov-alpha',`${v}%`);el?.style?.setProperty?.('background',overlayBackground(v,mainSurface()),'important');
 el?.querySelector?.('.window-content')?.style?.setProperty?.('background','transparent','important');
 return v;}
/** The slider's current position (it may be mid-drag, not yet saved), else the saved per-user value. */
const liveOverlayOpacity=app=>{const f=app?.element?.querySelector?.('[data-ov-opacity]');return f?clampOverlayOpacity(f.value):overlayOpacity();};
function overlayFadeHTML(){const tipText='Overlay background opacity (only for you): 0-100 %. Text and the header stay solid.';
 return `<label class="agu-ov-fade" ${tip(tipText)}><i class="fa-solid fa-circle-half-stroke" aria-hidden="true"></i><input type="range" min="0" max="100" step="5" value="${overlayOpacity()}" data-ov-opacity aria-label="${E(tipText)}"></label>`;}
function overlayHTML(){
 const groups=conditionGroups(partyCharacters(),{label:(id,a)=>statusLabel(a,id),isNative:id=>Boolean(statusConfig(id)),canRemove:(a,id)=>canRemove(a,id)});
 return `<div class="agu-overlay">${overlayFadeHTML()}${groups.length?groups.map(g=>`<section class="agu-ov-group"><h3>${E(g.name)}</h3><ul>${g.conditions.map(c=>`<li><span>${E(c.label)}${c.custom?' <small>(Custom)</small>':''}${c.readOnly?` <small ${tip(READ_ONLY_STATUS_HINT)}>(Read only)</small>`:''}</span>${c.removable?`<button type="button" class="agu-ov-x" data-ov-remove data-actor="${E(g.actorId)}" data-status="${E(c.id)}" ${tip(`Remove ${c.label}`)} aria-label="Remove ${E(c.label)} from ${E(g.name)}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`:''}</li>`).join('')}</ul></section>`).join(''):empty('No conditions','No party character has a condition right now.')}</div>`;
}
const savedOverlayPosition=()=>{const p=game.settings.get(ID,'overlayPosition')||{};return Object.fromEntries(['left','top','width','height'].filter(k=>Number.isFinite(p[k])).map(k=>[k,p[k]]));};
let positionTimer=null;
class ConditionsOverlay extends ApplicationV2 {
 static DEFAULT_OPTIONS={id:'ashen-gate-utilities-conditions-overlay',classes:['ag-app','agu-overlay-app'],window:{title:'Party Conditions',resizable:true,minimizable:false},position:{width:240,height:'auto'}};
 async _renderHTML(){if(!permitted())throw Error('Utilities is hidden for players.');return overlayHTML();}
 _replaceHTML(html,content){const active=globalThis.document?.activeElement,key=active&&content.contains?.(active)?focusKey(active):null;
  content.innerHTML=html;guardKeys(content);applyOverlayOpacity(this);restoreFocus(content,key);
  const fade=content.querySelector('[data-ov-opacity]');
  if(fade){fade.addEventListener('input',()=>applyOverlayOpacity(this,fade.value));fade.addEventListener('change',()=>{game.settings.set(ID,'overlayOpacity',applyOverlayOpacity(this,fade.value))?.catch?.(error);});}
  // 0.27.1: after the remove (and its confirm, confirmed or cancelled) focus goes back to the button while it is still there.
  for(const b of content.querySelectorAll('[data-ov-remove]'))b.addEventListener('click',()=>{const key=focusKey(b);b.disabled=true;removeFromUI(game.actors.get(b.dataset.actor),b.dataset.status).catch(error).finally(()=>{b.disabled=false;refocusSoon(content,[key]);});});
 }
 // 0.26.1: popping out to a browser window (or back) moves the window into another document; apply the value again there.
 _onDetach(from,to){super._onDetach?.(from,to);applyOverlayOpacity(this,liveOverlayOpacity(this));}
 _onAttach(from,to){super._onAttach?.(from,to);applyOverlayOpacity(this,liveOverlayOpacity(this));}
 _onPosition(position){super._onPosition?.(position);clearTimeout(positionTimer);
  positionTimer=setTimeout(()=>{const keep=Object.fromEntries(['left','top','width','height'].filter(k=>Number.isFinite(position?.[k])).map(k=>[k,position[k]]));game.settings.set(ID,'overlayPosition',keep).catch(error);},400);}
 // Closing the window with its own X turns the overlay off for this user; closing it for a permission change does not.
 _onClose(options){super._onClose?.(options);if(overlayInstance===this)overlayInstance=null;if(!this.silentClose&&game.settings.get(ID,'overlayOpen'))game.settings.set(ID,'overlayOpen',false).catch(error);}
}
async function openOverlay(){if(!permitted())throw Error('Utilities access is hidden by the GM.');if(!overlayInstance){const saved=savedOverlayPosition();overlayInstance=new ConditionsOverlay({position:Number.isFinite(saved.width)?saved:{width:windowSize(ConditionsOverlay.DEFAULT_OPTIONS.position).width,...saved}});}await overlayInstance.render({force:true});return overlayInstance;}
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
async function setElectrumEnabled(on){
 if(!isGM())throw Error('GM only.');if(typeof on!=='boolean')throw TypeError('Boolean required.');
 await game.settings.set(ID,'electrumEnabled',on);
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
 // 0.20.0: bank exchanges (0.25.0: and Party Fund exchanges): a player sees their own and the party purse's, not other characters' coins.
 return list.filter(h=>(h?.kind!=='gold-award'||h.public===true)&&((h?.kind!=='bank-exchange'&&h?.kind!==COIN_EXCHANGE)||h.payFrom==='purse'||h.userId===game.user?.id)).map(h=>PURSE_KINDS.includes(h?.kind)?{...h,actorBefore:null,actorAfter:null,undo:[]}:h?.kind==='purse-convert'?{...h,undo:[]}:h?.kind!=='gold-award'?h:{...h,recipients:(h.recipients??[]).map(r=>({actorId:r.actorId,actorName:r.actorName,added:r.added,undone:r.undone})),undo:[]});
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
 const members=[...(party?.system?.members??[])].map(m=>m?.actor??m).filter(a=>a?.id&&game.actors.get(a.id)&&!isLevelBackup(game.actors.get(a.id)));
 if(members.length)return {source:'party',partyName:party.name??'Primary Party',actorIds:[...new Set(members.map(a=>a.id))]};
 const players=[...game.users].filter(u=>u.active&&!u.isGM);
 return {source:'players',partyName:null,actorIds:allCharacters().filter(a=>players.some(u=>a.testUserPermission?.(u,'OWNER'))).map(a=>a.id)};
}
const gmWhisper=()=>[...game.users].filter(u=>u.isGM).map(u=>u.id);
function gpOrThrow(actor,coin='gp'){const gp=readCoin(actor,coin);if(gp===null)throw Error(`${actor.name} has no dnd5e ${coin==='gp'?'gold':COIN_LABELS[coin].toLowerCase()} (system.currency.${coin}); Utilities cannot award ${coin==='gp'?'gold':'coins'} here.`);return gp;}
/** API: award gold. mode 'each' (default) or 'split' (whole gp; any remainder is not handed out). */
async function awardGold({amount,mode='each',actorIds,reason='',public:isPublic=false,coin='gp'}={}){
 if(coin==='ep'&&!electrumEnabled())throw Error(ELECTRUM_OFF);
 if(!isGM())throw Error('GM only.');
 return queueHistory(async()=>{
  const actors=[...new Set(actorIds??[])].map(id=>{const a=targetActor(id);if(!a)throw Error(`Character ${id} was not found.`);return a;});
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
  {name:'coin',label:'Coin',type:'select',value:'gp',options:coinChoices(electrumEnabled()).map(c=>({value:c,label:`${COIN_LABELS[c]} (${c})`}))},
  {name:'mode',label:'How',type:'select',value:'each',options:[{value:'each',label:'Each character gets this amount'},{value:'split',label:'Split this amount evenly'}],hint:'Split pays whole coins only; any remainder is not handed out (it stays with you) and is shown before you confirm.'},
  {name:'reason',label:'Reason (optional)',type:'text',value:''},
  {name:'recipients',label:'Characters',type:'checklist',options:pool.map(a=>({value:a.id,label:a.name,checked:ids.has(a.id)})),hint:def.source==='party'?`Ticked: members of ${def.partyName}.`:'Ticked: characters owned by connected players (no dnd5e Primary Party is set).'},
  {name:'public',label:'Also show the chat card to players',type:'checkbox',value:'1'}
 ],{ok:'Review Award'});
 if(!form)return null;
 const actorIds=[].concat(form.recipients??[]),isPublic=[].concat(form.public??[]).length>0,amount=Number(form.amount),mode=form.mode==='split'?'split':'each',coin=COINS.includes(form.coin)?form.coin:'gp';
 const plan=planGoldAward({amount,mode,coin,electrum:electrumEnabled(),recipients:actorIds.map(id=>{const a=game.actors.get(id);return {id,name:a?.name??id,held:a?gpOrThrow(a,coin):NaN};})});
 const lines=[mode==='split'?`Split ${plan.amount} ${coin} evenly: ${plan.share} ${coin} each.`:`${plan.share} ${coin} to each character.`,...plan.recipients.map(r=>`${r.actorName}: ${r.before} → ${r.after} ${coin}`)];
 if(plan.remainder)lines.push(`${plan.remainder} ${coin} left over will NOT be handed out; it stays with you.`);
 lines.push(isPublic?'The chat card will be public.':'The chat card will be whispered to the GM only.');
 if(!await confirmDialog(lines.join('\n'),{title:'Award gold?',yes:`Award ${plan.total} ${coin}`}))return null;
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
 return [...stash.items].map(i=>stashRow(i,{typeLabel:itemTypeLabel,electrum:electrumEnabled()})).sort((a,b)=>a.typeLabel.localeCompare(b.typeLabel)||a.name.localeCompare(b.name));
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
 const actor=targetActor(actorId),stash=stashActor();
 if(!actor||actor.id===stash?.id)throw Error('Choose a character.');
 if(!(user.isGM||actor.testUserPermission?.(user,'OWNER')))throw Error(`You do not own ${actor.name}.`);
 return actor;
}
const planMove=(kind,actor,stash,coin,amount)=>planCoinMove({kind,coin,amount,actorHas:readCoin(actor,coin),purseHas:readCoin(stash,coin),actorName:actor.name,electrum:electrumEnabled()});
async function executePurseDeposit({actorId,coin,amount},user){
 playerStashGate(user);
 const stash=purseStash(),actor=purseActor(actorId,user);planMove('deposit',actor,stash,coin,amount);
 const plan=await queuePurse(async()=>{const p=planMove('deposit',actor,stash,coin,amount);
  await moveCoins(actor,stash,coin,{fromAfter:p.actorAfter,toAfter:p.purseAfter,toBefore:p.purseBefore});return p;});
 const entry=newPurseEntry({kind:'purse-deposit',approval:user.isGM?'gm':'not-required',plan,user,actor});
 await logPurse(entry).catch(e=>console.warn(`[${ID}] Could not write stash history: ${e.message}`));
 postTradeCard(entry,user); // 0.25.0: whispered to the player and the GM
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
    const outcome=await runConsent(createPoll({id:crypto.randomUUID(),requesterId:user.id,voters:consentVoters(game.users,user.id)}),{purpose:'coins',requester:user.name,item:`${first.amount} ${coin}`,quantity:1,actor:actor.name});
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
 const entry=newPurseEntry({kind:'purse-take',approval,plan,user,actor});
 await logPurse(entry).catch(e=>console.warn(`[${ID}] Could not write stash history: ${e.message}`));
 postTradeCard(entry,user);
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
 const plan=await queuePurse(async()=>{const p=planPurseAdjust({op,coin,amount,purseHas:readCoin(stash,coin),electrum:electrumEnabled()});await stash.update({[coinKey(coin)]:p.purseAfter});return p;});
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
  {name:'coin',label:'Coin',type:'select',value:'gp',options:coinChoices(electrumEnabled()).map(c=>({value:c,label:`${COIN_LABELS[c]} (${c}): ${now[c]}`}))},
  {name:'op',label:'Change',type:'select',value:'add',options:[{value:'add',label:'Add'},{value:'remove',label:'Remove'},{value:'set',label:'Set to'}]},
  {name:'amount',label:'Amount',type:'number',value:''},
  {name:'reason',label:'Reason (optional)',type:'text',value:''}
 ],{ok:'Review Change'});
 if(!form)return null;
 const coin=COINS.includes(form.coin)?form.coin:'gp',op=['add','remove','set'].includes(form.op)?form.op:'add';
 const plan=planPurseAdjust({op,coin,amount:form.amount,purseHas:now[coin],electrum:electrumEnabled()});
 if(!await confirmDialog(`Party purse ${COIN_LABELS[coin]}: ${plan.purseBefore} → ${plan.purseAfter} ${coin}.${form.reason?.trim()?`\nReason: ${form.reason.trim()}`:''}`,{title:'Adjust the party purse?',yes:`Set purse to ${plan.purseAfter} ${coin}`}))return null;
 const entry=await adjustPurse({coin,op,amount:form.amount,reason:form.reason??''});
 ui.notifications?.info(`Party purse ${coin}: ${entry.purseBefore} → ${entry.purseAfter}.`);
 return entry;
}
/** 0.13.2 API, GM only: converts all the purse's electrum to 'sp' or 'gp' (value kept exactly), one stash update, logged with Undo. expectEp: refuse if the purse no longer holds what the preview showed. */
async function convertElectrum({to,reason='',expectEp}={}){
 if(!isGM())throw Error('GM only.');
 const stash=purseStash();
 const plan=await queuePurse(async()=>{const p=planElectrumConvert({to,coins:readCoins(stash)});if(expectEp!==undefined&&p.ep!==expectEp)throw Error(`The purse electrum changed (now ${p.ep} ep); nothing was converted. Review the conversion again.`);await stash.update({[coinKey('ep')]:p.after.ep,[coinKey('sp')]:p.after.sp,[coinKey('gp')]:p.after.gp});return p;});
 const entry=await queueHistory(async()=>{const e=convertEntry({id:crypto.randomUUID(),plan,user:game.user,reason,worldTime:game.time?.worldTime??null,realTime:Date.now()});await game.settings.set(ID,'stashHistory',appendHistory(game.settings.get(ID,'stashHistory'),e,STASH_HISTORY_CAP));return e;});
 return structuredClone(entry);
}
/** 0.13.2 API, GM only: Undo a conversion; refused (and logged) if the silver/gold it added has left the purse. */
async function undoElectrumConvert(entryId){
 if(!isGM())throw Error('GM only.');
 return queuePurse(()=>queueHistory(async()=>{
  const list=game.settings.get(ID,'stashHistory'),entry=(Array.isArray(list)?list:[]).find(h=>h?.id===entryId);
  if(!entry)throw Error('That conversion is no longer in the stash history.');
  const stash=stashActor(),r=planConvertUndo(entry,stash?readCoins(stash):undefined);
  if(r.ok){try{await stash.update({[coinKey('ep')]:r.next.ep,[coinKey('sp')]:r.next.sp,[coinKey('gp')]:r.next.gp});}catch(e){r.ok=false;r.reason=e?.message??String(e);}}
  const next=applyConvertUndo(entry,r,{user:game.user,realTime:Date.now()});
  await game.settings.set(ID,'stashHistory',game.settings.get(ID,'stashHistory').map(h=>h?.id===entryId?next:h));
  return {ok:r.ok,reason:r.reason};
 }));
}
/** GM dialog: silver or gold, then a labelled confirmation with the exact before → after preview. */
async function convertElectrumDialog(){
 if(!isGM())throw Error('GM only.');
 const now=readCoins(purseStash());if(!(now.ep>0))throw Error('The party purse holds no electrum to convert.');
 const form=await formDialog('Convert Electrum',[
  {name:'to',label:`Convert all ${now.ep} ep to`,type:'select',value:'gp',options:[{value:'gp',label:'Gold (2 ep = 1 gp; an odd one becomes 5 sp)'},{value:'sp',label:'Silver (1 ep = 5 sp)'}]},
  {name:'reason',label:'Reason (optional)',type:'text',value:''}
 ],{ok:'Review Conversion'});
 if(!form)return null;
 const plan=planElectrumConvert({to:form.to==='sp'?'sp':'gp',coins:now});
 if(!await confirmDialog(convertPreview(plan).join('\n'),{title:'Convert electrum?',yes:`Convert ${plan.ep} ep`}))return null;
 const entry=await convertElectrum({to:plan.to,reason:form.reason??'',expectEp:plan.ep});
 ui.notifications?.info(`${convertLine(entry)}.`);
 return entry;
}
/**
 * The purse card: title, coins, the electrum note, the embed's own Character/Coin/Amount/Deposit/Take form (`move`), (GM)
 * Adjust / Convert and a one-line caption. 0.28.1: the CSS places the GM tools on the title's line and centres the coins
 * and the form below; in the markup they come after the form, so Tab goes Character, Coin, Amount, Deposit, Take, Adjust.
 */
function purseStrip(app,takers,target,{move:withMove=true}={}){
 const stash=stashActor();if(!stash)return '';
 const coins=readCoins(stash);
 if(!coins)return `<section class="agu-purse" aria-label="Party purse"><h3 class="agu-purse__title">Party purse</h3>${empty('No purse','The stash Actor has no dnd5e currency, so there is no purse.')}</section>`;
 const ep=electrumEnabled(),stranded=strandedElectrum(coins,ep),choices=coinChoices(ep);
 if(!choices.includes(app.purseCoin))app.purseCoin='gp';
 const coinSel=`<label class="ag-field agu-purse-coin">Coin<select id="agu-purse-coin">${choices.map(c=>option(c,COIN_LABELS[c],app.purseCoin)).join('')}</select></label>`;
 const move=withMove&&takers.length?`<div class="agu-purse-move" role="group" aria-label="Deposit or take coins"><label class="ag-field agu-purse-who">Character<select id="agu-purse-actor">${takers.map(a=>option(a.id,`${a.name} (${readCoin(a,app.purseCoin)??'—'} ${app.purseCoin})`,target)).join('')}</select></label>${coinSel}<label class="ag-field agu-purse-amount">Amount<input type="number" id="agu-purse-amount" min="1" step="1" value="${E(app.purseAmount)}" inputmode="numeric"></label><div class="agu-actions agu-purse-buttons">${btn('purse-deposit','Deposit',{kind:'sm',attrs:'data-purse-move="deposit"'})}${btn('purse-take','Take',{kind:'sm',attrs:'data-purse-move="take"'})}</div></div>`:'';
 const gm=isGM()?`<div class="agu-purse-tools">${stranded?btn('purse-convert','Convert electrum to silver/gold',{kind:'sm'}):''}${btn('purse-adjust','Adjust Purse',{kind:'sm'})}</div>`:'';
 const epNote=stranded?`<p class="ag-notice ag-notice--warn agu-ep-note"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>The purse still holds ${E(coins.ep)} electrum (ep), worth ${E(coins.ep*5)} sp. Electrum is off, so it can't be moved here; ${isGM()?'use <strong>Convert electrum to silver/gold</strong> (value kept exactly, undo in History) or turn electrum back on in GM Setup.':'the GM can convert it.'}</span></p>`:'';
 const note=!withMove?'':isGM()?`<p class="agu-note agu-purse-caption">Coin vote: ${purseVoteRequired()?'on':'off'} (change it in GM Setup).</p>`:`<p class="agu-note agu-purse-caption">Deposit moves coins from your character to the purse${purseVoteRequired()?'; Take needs every other connected player to accept':''}. Coins are never converted unless the GM does it.</p>`;
 return `<section class="agu-purse" aria-label="Party purse"><h3 class="agu-purse__title">Party purse</h3>${coinStripHTML(coins,ep)}${epNote}${move}${gm}${note}</section>`;
}
const randomId=()=>foundry.utils?.randomID?.(16)??Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[b%62]).join('');
/** Removes copies made by a move that is being called off. A failure here leaves duplicates, never a loss. */
async function removeCopies(target,data){
 const ids=data.map(d=>d._id).filter(id=>target.items.get(id));
 if(ids.length)await target.deleteEmbeddedDocuments('Item',ids).catch(e=>console.error(`[${ID}] Could not remove partial copies from ${target.name}: ${e.message}`));
}
/**
 * Moves an item and everything inside it (dnd5e keeps a container's contents as separate Items pointing at it).
 * All or nothing: every copy is created in one call and checked on the target before anything is deleted from the
 * source; if any part fails the copies are removed again and the source is left as it was.
 */
async function moveItem(item,target){
 const source=item.parent,{sourceIds,data,contents}=moveBundle(item,source.items,{randomId});
 const nothing=`Nothing was moved; ${item.name} stays with ${source.name}.`;
 try{await target.createEmbeddedDocuments('Item',data,{keepId:true});}
 catch(e){await removeCopies(target,data);throw Error(`Could not move ${item.name}: ${e?.message??e}. ${nothing}`);}
 const missing=data.filter(d=>!target.items.get(d._id)).length;
 if(missing){await removeCopies(target,data);throw Error(`Could not move ${item.name}: ${missing} of ${data.length} items did not arrive in ${target.name}. ${nothing}`);}
 try{await source.deleteEmbeddedDocuments('Item',sourceIds);}
 catch(e){
  const left=sourceIds.filter(id=>source.items.get(id)).length;
  if(left===sourceIds.length){await removeCopies(target,data);throw Error(`Could not move ${item.name}: ${e?.message??e}. ${nothing}`);}
  if(left)throw Error(`${item.name} reached ${target.name}, but ${left} of ${sourceIds.length} items could not be removed from ${source.name}. Nothing was lost; delete the leftover copies there by hand.`);
 }
 return {made:target.items.get(data[0]._id),contents};
}
function playerStashGate(user){if(user.isGM)return;if(game.settings.get(ID,'playerAccessEnabled')!==true)throw Error('Utilities is hidden for players.');if(!stashEnabled())throw Error('The GM has turned the party stash off.');}
async function executeDeposit(uuid,user){
 playerStashGate(user);
 const stash=stashActor();if(!stash)throw Error('There is no party stash yet.');
 const item=await fromUuid(uuid);if(item?.documentName!=='Item')throw Error('Only items can go in the stash.');
 const from=item.parent;
 if(from===stash||from?.id===stash.id)return `${item.name} is already in the stash.`;
 if(!from){
  if(!user.isGM)throw Error('Only items from your own character sheet can go in the stash.');
  // A world or compendium item is copied, not moved; a container comes with everything inside it (from its own pack too).
  const {data,contents}=await grantBundle(item,{quantity:item.system?.quantity});
  try{await stash.createEmbeddedDocuments('Item',data,{keepId:true});}
  catch(e){await removeCopies(stash,data);throw Error(`Could not copy ${item.name}: ${e?.message??e}. Nothing was added.`);}
  const missing=data.filter(d=>!stash.items.get(d._id)).length;
  if(missing){await removeCopies(stash,data);throw Error(`Could not copy ${item.name}: ${missing} of ${data.length} items did not arrive. Nothing was added.`);}
  await logQuietly({kind:'deposit',approval:'gm',user,actor:null,item:{...stashRow(item),contents}});return `Copied ${item.name}${contentsNote(contents)} into the party stash.`;
 }
 if(isLevelBackup(from))throw Error(LEVEL_BACKUP_REFUSAL);
 if(from.documentName!=='Actor'||!(user.isGM||from.testUserPermission?.(user,'OWNER')))throw Error('You can only stash items from a character you own.');
 const row=stashRow(item);const {made,contents}=await moveItem(item,stash);
 await logQuietly({kind:'deposit',approval:user.isGM?'gm':'not-required',user,actor:from,item:{...row,uuid:made?.uuid??row.uuid,contents}});
 return `${from.name} put ${item.name}${contentsNote(contents)} in the party stash.`;
}
const takingItems=new Set();
async function executeWithdraw(itemId,actorId,user){
 playerStashGate(user);
 const stash=stashActor(),item=stash?.items.get(itemId),actor=targetActor(actorId);
 if(!item)throw Error('That item is no longer in the stash.');
 if(!actor||actor.id===stash.id)throw Error('Choose a character to receive the item.');
 if(!(user.isGM||actor.testUserPermission?.(user,'OWNER')))throw Error(`You do not own ${actor.name}.`);
 const row={...stashRow(item),contents:containedItems(item,stash.items).length-1};let approval='gm';
 if(!user.isGM){
  if(takingItems.has(item.id))throw Error(`${item.name} already has a request waiting for the party.`);
  takingItems.add(item.id);
  try{
   if(!stashVoteRequired())approval='not-required';
   else{
    const outcome=await runConsent(createPoll({id:crypto.randomUUID(),requesterId:user.id,voters:consentVoters(game.users,user.id)}),{requester:user.name,item:item.name,quantity:row.quantity,contents:row.contents,actor:actor.name});
    if(outcome!=='approved'){
     await logQuietly({kind:'withdraw',approval:outcome==='denied'?'denied':'timed-out',user,actor,item:row});
     throw Error(outcome==='denied'?`The party denied taking ${item.name}. It stays in the stash.`:`Not every player answered in time. ${item.name} stays in the stash.`);
    }
    approval='accepted';
   }
   if(!stash.items.get(item.id))throw Error('That item left the stash while the party was voting.');
   const {made,contents}=await moveItem(item,actor);
   await logQuietly({kind:'withdraw',approval,user,actor,item:{...row,uuid:made?.uuid??row.uuid,contents}});
   return `${actor.name} took ${item.name}${contentsNote(contents)} from the party stash.`;
  }finally{takingItems.delete(item.id);}
 }
 const {made,contents}=await moveItem(item,actor);
 await logQuietly({kind:'withdraw',approval,user,actor,item:{...row,uuid:made?.uuid??row.uuid,contents}});
 return `${actor.name} took ${item.name}${contentsNote(contents)} from the party stash.`;
}
const deletingItems=new Set();
/** 0.29.0: only the GM client calls this (a player's request is checked here against the sender). */
async function executeDelete(itemId,quantity,user){
 playerStashGate(user);
 if(!user.isGM&&!allCharacters().some(a=>isOwned(a,user)))throw Error('You need a character you own to delete from the stash.');
 const stash=stashActor(),item=stash?.items.get(itemId);
 if(!item)throw Error('That item is no longer in the stash.');
 if(takingItems.has(item.id)||deletingItems.has(item.id))throw Error(`${item.name} has another request in progress. Try again in a moment.`);
 const inside=containedItems(item,stash.items),contents=inside.length-1;
 const plan=planStashDelete({quantity:item.system?.quantity,requested:quantity,contents,name:item.name});
 if(!plan.ok)throw Error(plan.reason);
 deletingItems.add(item.id);
 try{
  const row={...stashRow(item),quantity:plan.remove,contents:plan.whole?contents:0,left:plan.left};
  if(plan.whole){
   const ids=inside.map(i=>i.id);
   try{await stash.deleteEmbeddedDocuments('Item',ids);}
   catch(e){const left=ids.filter(id=>stash.items.get(id)).length;throw Error(left===ids.length?`Could not delete ${item.name}: ${e?.message??e}. Nothing was deleted.`:`${left} of ${ids.length} items could not be deleted from the stash. See the History.`);}
  }else await item.update({'system.quantity':plan.left});
  let note='';
  try{await logStash({kind:'delete',approval:user.isGM?'gm':'not-required',user,actor:null,item:row});}
  catch(e){console.warn(`[${ID}] Could not write stash history: ${e.message}`);note=' The History entry could not be saved.';}
  return `${user.name} deleted ${plan.whole?'':`${plan.remove} of `}${item.name}${contentsNote(plan.whole?contents:0)} from the party stash.${note}`;
 }finally{deletingItems.delete(item.id);}
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
/** 0.26.0: the prompt's title and buttons name what is being approved (a purchase or a take-out, stash or purse). */
export const votePromptText=r=>r?.purpose==='shop'?{title:'Party purse: approve purchase?',deny:'Deny purchase',allow:'Allow purchase'}
 :r?.purpose==='coins'?{title:'Party purse: approve take-out?',deny:'Deny take-out',allow:'Allow take-out'}
 :{title:'Party stash: approve take-out?',deny:'Deny take-out',allow:'Allow take-out'};
const secondsLeft=r=>Math.max(0,Math.round((Number(r.expiresAt)-Date.now())/1000));
class StashVotePrompt extends ApplicationV2 {
 static DEFAULT_OPTIONS={classes:['ag-app','ag-utilities','agu-vote-app'],window:{title:'Party stash: approve take-out?',minimizable:false},position:{width:380,height:'auto'}};
 constructor(request){super({id:`ashen-gate-utilities-vote-${request.pollId}`,window:{title:votePromptText(request).title},position:windowSize(StashVotePrompt.DEFAULT_OPTIONS.position)});this.request=request;}
 async _renderHTML(){const r=this.request,t=votePromptText(r),secs=`<span data-vote-seconds>${E(secondsLeft(r))}</span>`;
  const ask=r.purpose==='shop'?`<p><strong>${E(r.requester)}</strong> wants to spend <strong>${E(r.total)}</strong> from the party purse on <strong>${E(r.quantity)} ${E(r.item)}</strong> at ${E(r.shop)} for <strong>${E(r.actor)}</strong>.</p><p class="agu-note" aria-live="off">If anyone denies, or not everyone answers in ${secs} seconds, nothing is bought and the coins stay in the purse.</p>`
   :r.purpose==='coins'?`<p><strong>${E(r.requester)}</strong> wants to take <strong>${E(r.item)}</strong> from the party purse for <strong>${E(r.actor)}</strong>.</p><p class="agu-note" aria-live="off">If anyone denies, or not everyone answers in ${secs} seconds, the coins stay in the purse.</p>`
   :`<p><strong>${E(r.requester)}</strong> wants to take <strong>${E(r.item)}</strong>${Number(r.quantity)>1?` (×${E(r.quantity)})`:''}${E(contentsNote(Number(r.contents)))} from the party stash for <strong>${E(r.actor)}</strong>.</p><p class="agu-note" aria-live="off">If anyone denies, or not everyone answers in ${secs} seconds, the item stays in the stash.</p>`;
  return `<div class="agu-vote">${ask}<div class="agu-vote-actions">${btn('vote-deny',t.deny)}${btn('vote-accept',t.allow,{kind:'primary'})}</div></div>`;}
 _replaceHTML(html,content){content.innerHTML=html;guardKeys(content);
  for(const b of content.querySelectorAll('[data-action^="vote-"]'))b.addEventListener('click',()=>{this.answer(b.dataset.action==='vote-accept'?'accept':'deny');});
  // The countdown ticks in place (no re-render, so focus stays on the button).
  clearInterval(this.ticker);const left=content.querySelector?.('[data-vote-seconds]');
  if(left&&typeof setInterval==='function'){this.ticker=setInterval(()=>{left.textContent=String(secondsLeft(this.request));if(secondsLeft(this.request)<=0)clearInterval(this.ticker);},1000);this.ticker?.unref?.();}
 }
 _onClose(options){clearInterval(this.ticker);super._onClose?.(options);}
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
/** 0.29.0 API: delete a stash item, or `quantity` of a stack (omit for all). Same gate as taking out: GM, or a player with Player Access and a character they own. No party vote. */
async function deleteItem(itemId,quantity){
 if(!permitted())throw Error('Utilities access is hidden by the GM.');
 if(isGM())return executeDelete(String(itemId??''),quantity,game.user);
 playerStashGate(game.user);
 if(!permittedActors().length)throw Error('You need a character you own to delete from the stash.');
 if(!stashActor()?.items.get(itemId))throw Error('That item is no longer in the stash.');
 return requestGM('stash-delete',{itemId,quantity});
}
/** The Delete… button: a number first for a stack, then the labelled confirmation. Cancel is the default; nothing is deleted before the last click. */
async function deleteStashItem(itemId){
 const item=stashActor()?.items.get(itemId);if(!item)throw Error('That item is no longer in the stash.');
 const stash=stashActor(),contents=containedItems(item,stash.items).length-1,have=Number(item.system?.quantity)||1;
 let n=have;
 if(have>1&&contents===0){
  const r=await formDialog(`Delete from ${item.name}`,[{name:'count',label:`How many to delete (1 to ${have})`,type:'number',value:have,hint:`${have} deletes the whole stack.`}],{ok:'Continue…'});
  if(!r)return;
  const p=planStashDelete({quantity:have,requested:r.count,name:item.name});
  if(!p.ok)throw Error(p.reason);
  n=p.remove;
 }
 const what=n===have?(have>1?`all ${have} of ${item.name}`:item.name):`${n} of ${item.name}`;
 const message=`This permanently deletes ${what}${contentsNote(contents)} from the party stash. It cannot be undone.${contents?`\nEverything inside ${item.name} is deleted with it.`:''}\nTo keep it, choose Cancel and use Take to move it to a character instead.`;
 if(!await confirmDanger(message,{title:`Delete ${item.name}?`,yes:`Delete ${item.name}`}))return;
 return deleteItem(itemId,n===have?undefined:n);
}
const notifyResult=p=>p.then(msg=>{if(msg)ui.notifications?.info(msg);},error);
/** Drag data from a drop event (shared ag-item-drop parser). */
const dragData=event=>readDrop(event);
const stashItemFromUuid=uuid=>{const stash=stashActor();if(!stash||typeof uuid!=='string')return null;let doc=null;try{doc=fromUuidSync(uuid);}catch{}return doc?.parent&&doc.parent.id===stash.id?doc:null;};
/**
 * A drop on the stash list (window or embed): one Item, not a folder; dragging a stash row onto the list does nothing.
 * 0.27.0: Add to stash… hands its pick to this same function. Resolves once the deposit has been reported.
 */
async function stashListDrop(data){
 const {ok,items:[item],reason}=await resolveItemDrop(data);
 if(!ok)return ui.notifications?.warn(reason);
 if(stashItemFromUuid(item.uuid))return;return notifyResult(depositItem(item.uuid));
}
/**
 * 0.27.0 (UT-31): Add to stash…, the keyboard way to drop an item on the stash (window and embed). The player picks
 * from their own characters (the GM from any, or the Items sidebar), then the pick goes through stashListDrop, so the
 * deposit is checked again exactly as a drop is. Focus goes back to the button (handle).
 */
async function addToStash(app,b,root){
 if(!permitted())throw Error('Utilities access is hidden by the GM.');
 if(!isGM())playerStashGate(game.user);
 if(!stashActor())throw Error(isGM()?'Create the party stash first.':'There is no party stash yet.');
 try{
  const data=await pickStashDeposit({characters:isGM()?allCharacters():permittedActors(),gm:isGM(),worldItems:isGM()?game.items?.contents??[]:[],preferred:app.takeActorId});
  if(data)await stashListDrop(data);
 }finally{await app.render?.();}
}
/** After Take: the same button if the item is still there (refused or kept), else the next row's Take, else Add to stash…. */
function takeFocusKeys(b){
 const sel=`[data-action="${b?.dataset?.action??'stash-take'}"]`,row=b?.closest?.('tr'),near=row?.nextElementSibling?.querySelector?.(sel)??row?.previousElementSibling?.querySelector?.(sel);
 return [focusKey(b),near?focusKey(near):null,'button[data-action="stash-add"]','#agu-stash-search'];
}
/** Native actor-sheet drops: out of the stash goes through consent, into the stash is a move, not a copy. */
function onSheetDrop(actor,sheet,data){
 if(data?.type!=='Item'||!actor)return;
 const stash=stashActor();if(!stash)return;
 if(actor.id!==stash.id){const item=stashItemFromUuid(data.uuid);if(!item)return;notifyResult(withdrawItem(item.id,actor.id));return false;}
 if(stashItemFromUuid(data.uuid))return; // sorting inside the stash sheet
 notifyResult(depositItem(data.uuid));return false;
}
/** Party stash table columns, in order (0.26.0: a kit ag-table per item type). The header and every row render exactly these cells. */
const STASH_COLUMNS=[['icon','Picture'],['item','Item'],['qty','Qty'],['weight','Weight (each)'],['value','Value (each)'],['type','Type'],['action','Action']];
const STASH_HIDDEN_HEAD=new Set(['icon','action']);
/** Items (window) or the embed. `purse`: the full purse strip (embed); the window shows one line and Party Fund holds the purse. */
function stashBody(app,{purse=true}={}){
 const stash=stashActor(),on=stashEnabled();
 if(!stash)return empty('No party stash yet',isGM()?'Create one in Utilities → Party Inventory.':'Your GM hasn\'t set up a party stash yet.');
 if(!on&&!isGM())return empty('The party stash is off','Your GM has turned the party stash off for now.');
 const rows=[...stash.items].map(i=>stashRow(i,{typeLabel:itemTypeLabel,electrum:electrumEnabled()}));
 const q=app.filter.trim().toLowerCase(),shown=q?rows.filter(r=>r.name.toLowerCase().includes(q)||r.typeLabel.toLowerCase().includes(q)):rows;
 const takers=isGM()?allCharacters():permittedActors();
 const target=takers.some(a=>a.id===app.takeActorId)?app.takeActorId:takers[0]?.id;
 const groups=[...new Set(shown.map(r=>r.typeLabel))].sort((a,b)=>a.localeCompare(b));
 const num=col=>col==='qty'||col==='weight'?' is-num':col==='action'?' is-actions':'';
 const head=`<thead><tr>${STASH_COLUMNS.map(([col,label])=>`<th scope="col" class="agu-col-${col}${num(col)}">${STASH_HIDDEN_HEAD.has(col)?`<span class="ag-sr-only">${E(label)}</span>`:E(label)}</th>`).join('')}</tr></thead>`;
 const cell=(col,html)=>`<td class="agu-col-${col}${num(col)}">${html}</td>`;
 const stashRowHTML=r=>`<tr class="agu-stash-row" draggable="true" data-stash-item="${E(r.id)}" data-uuid="${E(r.uuid??'')}">${cell('icon',r.img?`<img class="agu-stash-icon" src="${E(r.img)}" alt="">`:'')}${cell('item',`<button type="button" class="agu-stash-name" data-open-item="${E(r.id)}"${uuidTipAttrs(r.uuid,`Open ${r.name}`)}>${E(r.name)}</button>`)}${cell('qty',E(r.quantity))}${cell('weight',E(r.weight))}${cell('value',coinChipsHTML(r.value))}${cell('type',E(r.typeLabel))}${cell('action',(target?btn('stash-take','Take',{kind:'sm',attrs:`data-item="${E(r.id)}" aria-label="Take ${E(r.name)}"`}):'')+(isGM()||target?btn('stash-delete','Delete…',{kind:'sm',attrs:`data-item="${E(r.id)}" aria-label="Delete ${E(r.name)}…"`}):''))}</tr>`;
 const gid=g=>`agu-stash-g-${E(g.replace(/\W+/g,'-'))}`;
 const table=groups.map(g=>{const list=shown.filter(r=>r.typeLabel===g);return `<section class="agu-stash-group"><h3 class="ag-eyebrow" id="${gid(g)}">${E(g)} · ${list.length}</h3><div class="ag-table-wrap"><table class="ag-table agu-stash-table" aria-labelledby="${gid(g)}">${head}<tbody>${list.map(stashRowHTML).join('')}</tbody></table></div></section>`;}).join('');
 const count=q?`${shown.length} of ${rows.length}`:`${rows.length} ${rows.length===1?'item':'items'}`;
 const toolbar=`<div class="ag-toolbar agu-stash-tools"><label class="ag-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" id="agu-stash-search" placeholder="Search items" value="${E(app.filter)}" aria-label="Search the stash"></label>${takers.length?`<div class="ag-toolbar__filters"><label class="ag-field ag-field--inline agu-take-into">Take into<select id="agu-stash-target">${takers.map(a=>option(a.id,a.name,target)).join('')}</select></label></div>`:''}<span class="ag-toolbar__count">${E(count)}</span>${isGM()||takers.length?`<div class="ag-toolbar__end">${btn('stash-add','Add to stash…',{kind:'sm',icon:'fa-plus'})}</div>`:''}</div>`;
 const note=isGM()?'':`<p class="ag-field__hint">Use Add to stash…, or drag an item from your character sheet onto this tab, to stash it. To take one out, use Take or drag its row onto your sheet${stashVoteRequired()?'; every other connected player must accept':''}.</p>`;
 return (purse?purseStrip(app,takers,target):purseLine1())+toolbar+(rows.length?(table||empty('Nothing matches','Clear the search to see every item.')):empty('No items yet','Use Add to stash…, or drag an item from a character sheet onto this tab.',{icon:'fa-box-open'}))+`<div class="agu-dropzone"><i class="fa-solid fa-hand-holding" aria-hidden="true"></i> Drop items anywhere on this tab to put them in the stash</div>`+note;
}
const STASH_SUBS=[{id:'items',label:'Items'},{id:'fund',label:'Party Fund'},{id:'history',label:'History'}];
function stashPanel(app){
 const stash=stashActor();if(!stash||(!stashEnabled()&&!isGM()))return '';
 if(!STASH_SUBS.some(t=>t.id===app.stashTab))app.stashTab='items';
 return `<section class="agu-stash" aria-label="Party stash">${subTabs({group:'agu-stash',label:'Stash sections',tabs:STASH_SUBS,selected:app.stashTab})}<div class="agu-stash-body agu-subpanel" ${tabPanelAttrs('agu-stash',app.stashTab)}>${app.stashTab==='history'?historyBody(app):app.stashTab==='fund'?fundBody(app):stashBody(app,{purse:false})}</div></section>`;
}
/** Items tab: the purse in one line, with the way to Party Fund. */
function purseLine1(){
 const stash=stashActor(),coins=stash?readCoins(stash):null;if(!coins)return '';
 const shown=Object.fromEntries(shownCoins(coins,electrumEnabled()).map(c=>[c,coins[c]]));
 return `<div class="agu-line agu-purse-line"><span>Party purse: <strong>${coinChipsHTML(coinsText(shown))}</strong></span><button type="button" class="ag-btn ag-btn--sm" data-stash-tab="fund"><i class="fa-solid fa-coins" aria-hidden="true"></i> Deposit, take or change coins</button></div>`;
}
/**
 * 0.25.0 Party Fund: the purse, Deposit / Take / Change coins, and the purse's log. 0.26.0: one Character picker at the
 * top drives every form; a switch shows one form at a time, each with its own primary button; the Log is a fold.
 */
const FUND_LOG_ROWS=20;
const FUND_ACTIONS=[['deposit','Deposit'],['take','Take'],['exchange','Change coins']];
function fundForm(app,takers,target){
 const stash=stashActor(),coins=stash?readCoins(stash):null,ep=electrumEnabled(),choices=coinChoices(ep);
 if(!choices.includes(app.purseCoin))app.purseCoin='gp';
 const actions=takers.length?FUND_ACTIONS:FUND_ACTIONS.filter(([id])=>id==='exchange');
 const act=actions.some(([id])=>id===app.fundAction)?app.fundAction:actions[0][0];
 const seg=`<div class="ag-segmented agu-fund-actions" role="radiogroup" aria-label="What to do with coins">${actions.map(([id,label])=>`<button type="button" role="radio" data-fund-action="${id}" aria-checked="${act===id}">${label}</button>`).join('')}</div>`;
 if(act==='exchange')return seg+exchangeHTML(app,{whoseSwitch:true});
 const actor=takers.find(a=>a.id===target),take=act==='take';
 const held=c=>take?(coins?.[c]??0):(readCoin(actor,c)??'—');
 const coinSel=`<label class="ag-field">Coin<select id="agu-purse-coin">${choices.map(c=>option(c,`${COIN_LABELS[c]} (${c}): ${held(c)}`,app.purseCoin)).join('')}</select><span class="ag-field__hint">${take?'In the party purse.':`${E(actor?.name??'')} holds.`}</span></label>`;
 const vote=take&&!isGM()&&purseVoteRequired()?'<p class="ag-field__hint">Every other connected player must accept before the coins leave the purse.</p>':'';
 return `${seg}<section class="agu-fund-form" aria-label="${take?'Take coins':'Deposit coins'}"><div class="ag-form-grid">${coinSel}<label class="ag-field">Amount<input type="number" id="agu-purse-amount" min="1" step="1" value="${E(app.purseAmount)}" inputmode="numeric"></label></div>${vote}<div class="agu-actions">${take?btn('purse-take','Take coins',{kind:'primary',icon:'fa-hand-holding-dollar',attrs:'data-purse-move="take"'}):btn('purse-deposit','Deposit coins',{kind:'primary',icon:'fa-piggy-bank',attrs:'data-purse-move="deposit"'})}</div></section>`;
}
function fundBody(app){
 const takers=isGM()?allCharacters():permittedActors(),target=takers.some(a=>a.id===app.takeActorId)?app.takeActorId:takers[0]?.id;
 // The Change coins form follows the same character.
 if(target&&app.fund?.actorId!==target)app.fund={...(app.fund??{}),actorId:target};
 let log;try{log=stashHistory().filter(fundLogEntry).reverse();}catch(e){log=null;}
 const rows=log?log.slice(0,FUND_LOG_ROWS).map(historyRow):[];
 const logBody=`${log===null?empty('The log is unavailable','You can\'t see stash history right now.'):log.length?rowsHTML(rows):empty('No coins have moved yet','Deposits, takes, exchanges and party purse purchases are listed here: who, when and how much.')}<div class="agu-actions"><button type="button" class="ag-btn ag-btn--ghost ag-btn--sm" data-stash-tab="history"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> Full History</button></div>`;
 const logHTML=`<div class="agu-fund-log">${fold({key:'fund-log',title:'Log',count:log?`${Math.min(log.length,FUND_LOG_ROWS)} of ${log.length}`:undefined,hint:log?.length?'Newest first':'',open:true,body:logBody})}</div>`;
 const picker=takers.length?`<label class="ag-field ag-field--inline agu-fund-who">Character<select id="agu-purse-actor">${takers.map(a=>option(a.id,a.name,target)).join('')}</select></label>`:'';
 const purse=purseStrip(app,takers,target,{move:false});
 const voteNote=isGM()?`<p class="ag-field__hint">Coin vote: ${purseVoteRequired()?'on':'off'} (change it in GM Setup).</p>`:'';
 return `${picker}${purse}${stashActor()&&readCoins(stashActor())?`<div class="agu-fund-panel">${fundForm(app,takers,target)}</div>`:''}${voteNote}${logHTML}`;
}
const HISTORY_PAGE=50;
/* Extra lines for a History or Log row (0.26.0: shown in the kit row's meta; the GM's Undo sits in the row's end). */
const logLine=(text,note=false)=>`<span class="agu-log-line${note?' agu-log-line--note':''}">${E(text)}</span>`;
/** A gold award: reason, per-character coins, remainder and the last refused undo. */
function goldDetail(h){
 if(h.kind!=='gold-award')return '';
 const c=entryCoin(h),per=(h.recipients??[]).map(r=>`${r.actorName} +${r.added} ${c}${Number.isFinite(r.before)?` (${r.before} → ${r.after})`:''}${r.undone?' · undone':''}`).join('; ');
 const left=(h.recipients??[]).some(r=>!r.undone);
 const undo=(h.undo??[]).flatMap(u=>u.results.filter(r=>!r.ok).map(r=>r.reason)).filter(Boolean);
 return `${h.reason?logLine(h.reason):''}${logLine(`${per}${h.remainder?` · ${h.remainder} ${c} not handed out`:''}`)}${isGM()&&undo.length&&left?logLine(`Last undo refused: ${undo.slice(-3).join(' ')}`,true):''}`;
}
/** An electrum conversion: before → after, reason and the last refused undo. */
function convertDetail(h){
 const b=h.before??{},a=h.after??{},parts=[`Purse ${b.ep} → ${a.ep} ep`,...(h.addGp?[`${b.gp} → ${a.gp} gp`]:[]),...(h.addSp?[`${b.sp} → ${a.sp} sp`]:[])];
 if(h.undone)parts.push('undone');
 const refused=(h.undo??[]).filter(u=>!u.ok).map(u=>u.reason).filter(Boolean);
 return `${h.reason?logLine(h.reason):''}${logLine(parts.join(' · '))}${isGM()&&refused.length&&!h.undone?logLine(`Last undo refused: ${refused.at(-1)}`,true):''}`;
}
/** A purse row: before → after, reason and the last refused undo. */
function purseDetail(h){
 if(h.kind==='purse-convert')return convertDetail(h);
 // 0.20.0: a bank exchange shows the two coins before → after.
 if(h.kind==='bank-exchange'||h.kind===COIN_EXCHANGE)return Number.isFinite(h.fromBefore)?logLine(`${h.payFrom==='purse'?'Purse':h.payerName} ${h.fromBefore} → ${h.fromAfter} ${h.from} · ${h.toBefore} → ${h.toAfter} ${h.to}`):'';
 if(!PURSE_KINDS.includes(h.kind))return '';
 const parts=[];
 if(h.moved&&Number.isFinite(h.purseBefore))parts.push(`Purse ${h.purseBefore} → ${h.purseAfter} ${h.coin}`);
 if(h.moved&&Number.isFinite(h.actorBefore))parts.push(`${h.actorName} ${h.actorBefore} → ${h.actorAfter} ${h.coin}`);
 if(h.undone)parts.push('undone');
 const refused=(h.undo??[]).filter(u=>!u.ok).map(u=>u.reason).filter(Boolean);
 return `${h.reason?logLine(h.reason):''}${parts.length?logLine(parts.join(' · ')):''}${isGM()&&refused.length&&!h.undone?logLine(`Last undo refused: ${refused.at(-1)}`,true):''}`;
}
/** The GM's Undo for a row, named after what it undoes. */
function historyActions(h){
 if(!isGM())return '';
 const named=label=>`data-entry="${E(h.id)}" aria-label="${E(`${label}: ${historyLine(h)}`)}"`;
 if(h.kind==='gold-award')return (h.recipients??[]).some(r=>!r.undone)?btn('gold-undo',(h.undo??[]).length?'Undo Remaining':'Undo',{kind:'sm',attrs:named('Undo')}):'';
 if(h.kind==='purse-convert')return h.undone?'':btn('purse-convert-undo','Undo',{kind:'sm',attrs:named('Undo')});
 return PURSE_KINDS.includes(h.kind)&&purseUndoable(h)?btn('purse-undo','Undo',{kind:'sm',attrs:named('Undo')}):'';
}
const worldClock=t=>{if(!Number.isFinite(t))return '';const d=Math.floor(t/86400),r=((t%86400)+86400)%86400,p=n=>String(Math.floor(n)).padStart(2,'0');return `World day ${d}, ${p(r/3600)}:${p((r%3600)/60)}`;};
function historyLine(h){
 if(PURSE_KINDS.includes(h.kind))return purseLine(h);
 if(h.kind==='shop-sale'||h.kind==='bank-exchange'||h.kind===COIN_EXCHANGE)return shopLine(h);
 if(h.kind==='shop-purchase')return h.moved===false?`${h.userName}${h.actorName?` (${h.actorName})`:''} asked to buy ${h.itemName}${h.quantity>1?` ×${h.quantity}`:''} at ${h.shopName} with the party purse`:shopLine(h);
 if(h.kind==='purse-convert')return convertLine(h);
 if(h.kind==='gold-award'){const c=entryCoin(h),names=(h.recipients??[]).map(r=>r.actorName).join(', ');return h.mode==='split'?`${h.userName} split ${h.amount} ${c} between ${names}`:`${h.userName} awarded ${h.share} ${c} each to ${names}`;}
 const who=`${h.userName}${h.actorName?` (${h.actorName})`:''}`,qty=h.quantity>1?` ×${h.quantity}`:'';
 const what=`${h.itemName}${qty}${contentsNote(h.contents)}`;
 if(h.kind==='delete')return `${who} deleted ${what} from the stash${h.left>0?` (${h.left} left)`:''}`;
 return h.kind==='deposit'?`${who} put ${what} in the stash`:h.moved?`${who} took ${what} out of the stash`:`${who} tried to take ${what} out of the stash`;
}
const historyTone=a=>a==='denied'||a==='timed-out'?'ag-badge--danger':a==='accepted'?'ag-badge--ok':a==='gm'?'ag-badge--accent':'';
/** One stash History row (History tab and the Party Fund log), a kit row. */
const historyRow=h=>rowHTML({cls:'agu-log-row',lead:h.img?`<img class="ag-row__icon agu-stash-icon" src="${E(h.img)}" alt="">`:'',title:E(historyLine(h)),
 meta:`${goldDetail(h)}${purseDetail(h)}${logLine(`${new Date(h.realTime).toLocaleString()}${Number.isFinite(h.worldTime)?` · ${worldClock(h.worldTime)}`:''}`)}`,
 end:`<span class="ag-badge ${historyTone(h.approval)}">${E(h.kind==='gold-award'?(entryCoin(h)==='gp'?'Gold':'Coins'):h.kind==='delete'?'Deleted':(PURSE_KINDS.includes(h.kind)||h.kind==='purse-convert')&&h.approval==='gm'?'Purse · GM':h.kind==='bank-exchange'?'Bank':h.kind===COIN_EXCHANGE?'Exchange':approvalLabel(h))}</span>${historyActions(h)}`});
function historyBody(app){
 let list;try{list=stashHistory();}catch(e){return empty('History is unavailable',e.message);}
 const rows=list.slice().reverse(),shown=rows.slice(0,app.historyShown);
 const more=rows.length>shown.length?`<div class="agu-actions">${btn('stash-history-more',`Show more (${rows.length-shown.length} older)`,{kind:'ghost'})}</div>`:'';
 const clear=isGM()?`<div class="ag-toolbar__end">${btn('stash-history-clear','Clear History…',{kind:'danger sm',icon:'fa-trash',disabled:!rows.length})}</div>`:'';
 return `<div class="ag-toolbar"><span class="ag-toolbar__count">${rows.length} ${rows.length===1?'entry':'entries'}, newest first (the latest ${STASH_HISTORY_CAP} are kept)</span>${clear}</div>${rows.length?rowsHTML(shown.map(historyRow))+more:empty('Nothing has moved yet','Items and coins moved in or out of the stash are listed here.',{icon:'fa-clock-rotate-left'})}`;
}
/** Wires the stash panel inside the Utilities window: tabs, search, take-into, sheet links, row drag-out, and drop-in over the whole tab. */
UtilitiesApp.prototype.bindStash=function(root){
  for(const el of root.querySelectorAll('[data-stash-tab]'))el.addEventListener('click',()=>{this.stashTab=el.dataset.stashTab;this.render().catch(error);});
  for(const el of root.querySelectorAll('.agu-stash .ag-tabs--sub [data-tab]'))el.addEventListener('click',()=>{this.stashTab=el.dataset.tab;this.render().catch(error);});
  for(const el of root.querySelectorAll('[data-fund-action]'))el.addEventListener('click',()=>{this.fundAction=el.dataset.fundAction;this.render().catch(error);});
  root.querySelector('#agu-stash-search')?.addEventListener('input',e=>{this.filter=e.target.value;const at=e.target.selectionStart;this.render().then(()=>{const q=this.element?.querySelector?.('#agu-stash-search');if(q){q.focus();q.setSelectionRange?.(at,at);}}).catch(error);});
  root.querySelector('#agu-stash-target')?.addEventListener('change',e=>{this.takeActorId=e.target.value;});
  root.querySelector('#agu-purse-actor')?.addEventListener('change',e=>{this.takeActorId=e.target.value;this.render().catch(error);});
  root.querySelector('#agu-purse-coin')?.addEventListener('change',e=>{this.purseCoin=e.target.value;this.render().catch(error);});
  root.querySelector('#agu-purse-amount')?.addEventListener('input',e=>{this.purseAmount=e.target.value;});
  bindExchange(this,root);
  for(const b of root.querySelectorAll('[data-open-item]'))b.addEventListener('click',()=>{const item=stashActor()?.items.get(b.dataset.openItem);if(!item?.sheet)return error(Error('That item could not be opened.'));item.sheet.render(true);});
  for(const row of root.querySelectorAll('[data-stash-item]'))row.addEventListener('dragstart',ev=>{ev.dataTransfer?.setData('text/plain',JSON.stringify({type:'Item',uuid:row.dataset.uuid}));});
  const zone=root.querySelector('.agu-main');
  if(this.tab!=='inventory'||!zone||!root.querySelector('.agu-stash'))return;
  zone.addEventListener('dragover',ev=>{ev.preventDefault();zone.classList.add('agu-drop-over');});
  zone.addEventListener('dragleave',ev=>{if(!zone.contains(ev.relatedTarget))zone.classList.remove('agu-drop-over');});
  zone.addEventListener('drop',ev=>{ev.preventDefault();zone.classList.remove('agu-drop-over');stashListDrop(dragData(ev)).catch(error);});
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
const EMBED_ACTIONS=new Set(['stash-take','stash-delete','stash-add','purse-deposit','purse-take','purse-adjust','purse-convert']);
const EMBED_MODES=new Set(['stash']);
const embeds=new Set();
/** HTML for one embed: a refusal note when this user may not see the stash, else the stash body (purse + items). */
function embedHTML(state){
 if(!permitted())return empty('Party stash unavailable','Utilities is hidden by the GM for now.');
 if(!isGM()&&!stashEnabled())return stashActor()?empty('The party stash is off','Your GM has turned the party stash off for now.'):empty('No party stash yet','Your GM hasn\'t set up a party stash yet.');
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
 // 0.27.1: Space/Enter on the embed's controls press them; they never reach Foundry's pause keybinding.
 on(element,'keydown',ev=>{stopActivationKeys(element,ev);});on(element,'keyup',ev=>{stopActivationKeys(element,ev);});
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
 on(element,'drop',ev=>{ev.preventDefault();ev.stopPropagation();element.classList?.remove('agu-drop-over');stashListDrop(dragData(ev)).catch(error);});
 embeds.add(ctrl);
 ctrl.render().catch(error);
 return {unmount:ctrl.unmount,refresh:()=>ctrl.render()};
}
const refreshEmbeds=()=>{for(const e of [...embeds])e.render().catch(error);};
function rerenderStash(doc){const stash=stashActor();if(!doc||doc.parent?.id===stash?.id||doc.id===stash?.id)refreshEmbeds();if(!windowInstance?.rendered||windowInstance.tab!=='inventory')return;if(doc&&doc.parent?.id!==stash?.id&&doc.id!==stash?.id)return;windowInstance.render().catch(error);}
/**
 * 0.13.0, GM only: opens Rolls with the Start Rolls form filled in from {skills, dc?, mode, actorIds?, title?}.
 * Nothing is sent to players until the GM clicks Start Rolls; every field can still be changed.
 */
async function openRolls(request={}){
 if(!isGM())throw Error('GM only.');
 const prefill=rollPrefill(request,{characterIds:allCharacters().map(a=>a.id)});
 if(!windowInstance||!windowInstance.rendered)windowInstance=new UtilitiesApp();
 windowInstance.tab='rolls';windowInstance.rollMode=prefill.mode;windowInstance.rollPrefill=prefill;
 await windowInstance.render({force:true});
 return {app:windowInstance,prefill,busy:Boolean(activeSession())};
}
async function open(){if(!permitted())throw Error('Utilities access is hidden by the GM.');if(!windowInstance||!windowInstance.rendered)windowInstance=new UtilitiesApp();await windowInstance.render({force:true});return windowInstance;}
function refreshWindows(){
 refreshShopWindows();
 if(!permitted()&&!isGM()){
  refreshEmbeds();document.querySelectorAll(`[data-ag-launcher="${ID}"]`).forEach(x=>x.remove());if(windowInstance?.rendered)windowInstance.close({force:true}).catch(error);closeOverlay().catch(error);
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
 // 0.23.0: config:false, so Utilities never appears in Foundry's Configure Settings list (players had an empty entry); set in GM Setup.
 game.settings.register(ID,'playerAccessEnabled',{name:'Utilities: Player Access',hint:'The Utilities player launcher stays hidden until the GM turns Player Access on.',scope:'world',config:false,type:Boolean,default:false,onChange:refreshWindows});
 game.settings.register(ID,'activeSession',{name:'Utilities: Active Interaction',scope:'world',config:false,type:Object,default:{},onChange:sessionChanged});
 game.settings.register(ID,'history',{name:'Utilities: Interaction History',scope:'world',config:false,type:Array,default:[],onChange:refreshWindows});
 game.settings.register(ID,'lastResult',{name:'Utilities: Last Finished Check',scope:'world',config:false,type:Object,default:{},onChange:refreshWindows});
 // Characters whose owners may remove conditions: {actorId:true}. Absent means locked.
 game.settings.register(ID,'conditionUnlocks',{name:'Utilities: Condition Removal Unlocks',scope:'world',config:false,type:Object,default:{},onChange:refreshWindows});
 // 0.23.0: owners apply/remove native conditions on all their characters (default off); condition controllers {userId:true}.
 game.settings.register(ID,'ownersManageConditions',{name:'Utilities: Owners Manage Conditions',scope:'world',config:false,type:Boolean,default:false,onChange:refreshWindows});
 game.settings.register(ID,'conditionControllers',{name:'Utilities: Condition Controllers',scope:'world',config:false,type:Object,default:{},onChange:refreshWindows});
 game.settings.register(ID,'overlayOpacity',{name:'Utilities: Conditions Overlay Background Opacity',scope:'client',config:false,type:Number,default:OVERLAY_OPACITY_DEFAULT});
 game.settings.register(ID,'overlayOpen',{name:'Utilities: Conditions Overlay',scope:'client',config:false,type:Boolean,default:false,onChange:syncOverlay});
 game.settings.register(ID,'stashEnabled',{name:'Utilities: Party Stash for Players',scope:'world',config:false,type:Boolean,default:false,onChange:refreshWindows});
 // Party vote on take-outs. Absent/true = vote (the 0.5.x behaviour); false = players withdraw freely.
 game.settings.register(ID,'stashVoteRequired',{name:'Utilities: Party Stash Take-Out Vote',scope:'world',config:false,type:Boolean,default:true,onChange:refreshWindows});
 // Append-only deposit/withdraw log, written only by the GM client (world settings are GM-write).
 // Coin take-out vote: '' = never saved (follows stashVoteRequired); 'on'/'off' once the GM saves GM Setup.
 game.settings.register(ID,'purseVoteRequired',{name:'Utilities: Party Purse Take-Out Vote',scope:'world',config:false,type:String,default:'',onChange:refreshWindows});
 // 0.13.2: GM Setup "Use electrum". Off (default) hides ep in Utilities; the purse still stores system.currency.ep.
 game.settings.register(ID,'electrumEnabled',{name:'Utilities: Use Electrum',scope:'world',config:false,type:Boolean,default:false,onChange:on=>{refreshWindows();Hooks.callAll?.(`${ID}.electrumChanged`,on===true);}});
 // 0.18.0 Shopping: shops for players (default off) and the party vote when a player spends the purse in a shop
 // ('' = never saved, follows the coin vote; 'on'/'off' once the GM saves GM Setup).
 game.settings.register(ID,'shopsEnabled',{name:'Utilities: Shops for Players',scope:'world',config:false,type:Boolean,default:false,onChange:refreshWindows});
 game.settings.register(ID,'shopPurseVote',{name:'Utilities: Party Vote on Shop Purchases',scope:'world',config:false,type:String,default:'',onChange:refreshWindows});
 // 0.25.0 Party Fund: the coin exchange fee, a whole percent 0–50 (0 = no fee).
 game.settings.register(ID,'exchangeFeePercent',{name:'Utilities: Party Fund Exchange Fee',scope:'world',config:false,type:Number,default:0,onChange:refreshWindows});
 game.settings.register(ID,'stashHistory',{name:'Utilities: Party Stash History',scope:'world',config:false,type:Array,default:[],onChange:refreshWindows});
 game.settings.register(ID,'overlayPosition',{name:'Utilities: Conditions Overlay Position',scope:'client',config:false,type:Object,default:{}});
});
Hooks.once('ready',()=>{
 // 0.24.0: item tooltips and click-to-open for shop, sale and stash items in every window and dialog.
 installItemTips();
 const m=game.modules.get(ID);
 m.api={version:VERSION,contract:'ag-utilities/0.2-alpha',open,playerAccess:{contract:'ag-player-access/1',getState:()=>({contract:'ag-player-access/1',moduleId:ID,audience:'player',playerAccessEnabled:game.settings.get(ID,'playerAccessEnabled'),configurable:true}),setEnabled:async enabled=>{if(!isGM())throw Error('GM only.');if(typeof enabled!=='boolean')throw TypeError('Boolean required.');await game.settings.set(ID,'playerAccessEnabled',enabled);return m.api.playerAccess.getState();}},
  conditions:{contract:'ag-utilities-conditions/1',canChangeActor,isPlayerCharacter:a=>isPlayerCharacter(a,[...game.users]),choices:()=>conditionChoices().map(c=>({...c})),isUnlocked:actorId=>isUnlocked(getUnlocks(),actorId),setUnlocked,canRemove:(actorId,statusId)=>permitted()&&canRemove(game.actors.get(actorId),statusId),remove:removeCondition,canApply:(actorId,statusId)=>permitted()&&applyDecision({user:game.user,actor:game.actors.get(actorId),statusId:resolveStatusId(statusId,nativeIds()),...conditionRules()}).ok,apply:applyCondition,ownersManage,setOwnersManage,isController:(userId=game.user?.id)=>controlsConditions(game.users.get(userId)),controllers:()=>{if(!isGM())throw Error('GM only.');return controllerList();},setController,openOverlay:async()=>{await game.settings.set(ID,'overlayOpen',true);return openOverlay();},closeOverlay:()=>game.settings.set(ID,'overlayOpen',false)},
  stash:{contract:'ag-utilities-stash/1',isEnabled:stashEnabled,setEnabled:setStashEnabled,isVoteRequired:stashVoteRequired,setVoteRequired:setStashVoteRequired,history:stashHistory,clearHistory:clearStashHistory,open:openStash,deposit:depositItem,withdraw:withdrawItem,deleteItem,listItems:listStashItems},
  rolls:{contract:'ag-utilities-rolls/1',modes:[...ROLL_OPEN_MODES],skills:[...SKILL_IDS],open:openRolls},
  embed:{contract:'ag-utilities-embed/1',modes:[...EMBED_MODES],mount:mountEmbed},
  purse:{contract:'ag-utilities-purse/1',coins:COINS,exchange,quoteExchange:req=>structuredClone(quoteExchange(req)),exchangeFee:fundFee,isVoteRequired:purseVoteRequired,setVoteRequired:setPurseVoteRequired,totals:purseTotals,deposit:depositCoins,take:takeCoins,adjust:adjustPurse,undo:undoPurseEntry,openAdjust:adjustPurseDialog,convertElectrum,undoConvert:undoElectrumConvert,openConvert:convertElectrumDialog},
  currency:{contract:'ag-utilities-currency/1',electrumEnabled,setElectrumEnabled,coins:()=>coinChoices(electrumEnabled()),hook:`${ID}.electrumChanged`},
  shops:{...shopsApi(),...tradeApi(),...importApi(),services:servicesApi(),merchants:merchantsApi()},
  awardGold,undoGoldAward,gold:{contract:'ag-utilities-gold/1',award:awardGold,undo:undoGoldAward,defaultRecipients:()=>{if(!isGM())throw Error('GM only.');return goldDefaults();},openDialog:awardGoldDialog}};
 game.socket?.on?.(SOCKET,(msg,senderId)=>{void onSocket(msg,senderId).catch(error);});
 Hooks.on('renderActorDirectory',addLauncher);Hooks.on('createChatMessage',msg=>{void processSubmission(msg).catch(error);});
 for(const ev of ['updateActor','createActiveEffect','updateActiveEffect','deleteActiveEffect'])Hooks.on(ev,rerenderConditions);
 for(const ev of ['createItem','updateItem','deleteItem'])Hooks.on(ev,doc=>rerenderStash(doc));
 Hooks.on('dropActorSheetData',onSheetDrop);
 shopHooks(()=>{if(windowInstance?.rendered&&windowInstance.tab==='shops'&&isGM())windowInstance.render().catch(error);},()=>windowInstance);
 configureTrade({stashActor,stashEnabled,purseVoteRequired,runConsent,requestGM,queuePurse,coordinatorIsMe,error,
  logStash:entry=>logPurse(entry),openTab:async tab=>{if(!permitted())throw Error('Utilities access is hidden by the GM.');if(!windowInstance||!windowInstance.rendered)windowInstance=new UtilitiesApp();windowInstance.tab=tab;await windowInstance.render({force:true});return windowInstance;}});
 tradeHooks(()=>{if(windowInstance?.rendered&&windowInstance.tab==='shops')windowInstance.render().catch(error);});
 Hooks.on('updateUser',refreshWindows);addLauncher(ui?.actors,ui?.actors?.element);
 lastPromptedSession=activeSession()?.id||null;
 syncOverlay();
 // 0.25.0: merchant lists get `audience` (re-runnable; writes nothing once done). One GM writes.
 if(isGM()&&coordinatorIsMe())void migrateLists().catch(e=>console.warn(`[${ID}] Could not update merchant lists: ${e?.message??e}`));
 console.info(`${ID} ${VERSION} initialized.`);
});
