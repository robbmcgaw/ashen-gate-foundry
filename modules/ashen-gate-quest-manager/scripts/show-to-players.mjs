// 0.28.0 Show to Players: a GM presses "Show to Players" on a quest and every other connected client that may see it
// is told about it. Since 0.30.0 that pops the small tracked-objectives tracker (openQuest in main.mjs), not the Quest Log window. No Foundry globals here:
// main.mjs hands in everything the Foundry side provides (users, socket, the visibility check, the opener).
//
// One socket channel (module.<id>, shared with the Game Journal) and one message: {type:'show-quest', key}. The key is
// the id of the quest's published Quest Log view (a random Foundry document id), never the permanent quest id, a name,
// objectives, rewards or notes. Each client reads what its own permissions allow.
//   Sender side: GM only (assertGM); needs Player Access on and a published view; goes only to connected non-GM users
//   who may observe that view (so a character-only quest reaches its owners only); rate limited.
//   Receiving side: ignored unless the socket's sender is a GM user; GMs open nothing; Player Access, the document and
//   the player's own OBSERVER permission are re-checked here, and a refusal opens nothing and shows nothing.
import {assertGM,STATUSES} from './core.mjs';
import {statusChip,isPlayerVisible,UNTITLED} from './quests-tab.mjs';

export const SHOW_SOCKET_TYPE='show-quest';
export const SHOW_MIN_GAP_MS=1500;
const KEY=/^[A-Za-z0-9]{16}$/;
const plural=(n,one,many)=>`${n} ${n===1?one:many}`;

/**
 * What Reveal would have to change for this quest to be visible to players, following Reveal in Quest Log's bulk actions:
 * drafts and GM-only definitions are refused, never published; nothing is revealed here without the GM's confirmation.
 * Returns {visible:true} | {refuse:text} | {patch, lines:[text]}.
 */
export function planShowReveal(source,state){
 if(isPlayerVisible(source,state))return {visible:true};
 if(source.visibility==='gm')return {refuse:'This quest has a GM-only definition, so it cannot be published. Change Definition visibility in its editor first.'};
 if(statusChip(source,state)==='Draft')return {refuse:'This quest is still a draft, and drafts stay GM only. Give it a status first.'};
 const patch={},lines=[];
 if(source.visibility==='reveal_gated'&&!state.revealed){patch.revealed=true;lines.push('It is marked Revealed.');}
 if(state.status==='Hidden'){
  // 0.30.0 A quest hidden with the Hide button remembers the status it had and gets it back.
  const prev=state.statusBeforeHide,back=STATUSES.includes(prev)&&prev!=='Hidden'?prev:'Available';
  patch.status=back;if(prev!==undefined)patch.statusBeforeHide=null;lines.push(`Its status changes from Hidden to ${back}.`);}
 if(!isPlayerVisible(source,{...state,...patch}))return {refuse:'This quest cannot be made visible from here. Check its status, reveal and audience in its editor.'};
 return {patch,lines};
}

/**
 * 0.30.0 The inverse of Reveal, from the same two state fields. Hiding keeps the quest, its status, progress, notes and
 * reveal history: a reveal-gated quest only has `revealed` cleared; a player-visible one is set to Hidden and remembers the
 * status it had (`statusBeforeHide`), which Reveal puts back. Returns {noop:true} | {patch}.
 */
export function planHide(source,state){
 if(!isPlayerVisible(source,state))return {noop:true};
 const patch={revealed:false};
 if(isPlayerVisible(source,{...state,...patch})){patch.statusBeforeHide=state.status;patch.status='Hidden';}
 return {patch};
}
/** GM only (updateState refuses anyone else). deps: {entries(), updateState(id,patch), notify(msg,kind), dirty()}. */
export async function hideFlow(id,deps){
 const entry=deps.entries().find(e=>e.source.id===id);
 if(!entry)throw new Error('Quest not found.');
 const name=entry.source.name||UNTITLED,plan=planHide(entry.source,entry.state);
 if(plan.noop){deps.notify(`${name} is already hidden from players.`,'info');return {status:'already_hidden'};}
 if(deps.dirty())throw new Error('Save or cancel your changes to the open quest first.');
 await deps.updateState(id,plan.patch);
 deps.notify(`${name} is hidden from players. Reveal to players brings it back as it was.`,'info');
 return {status:'hidden'};
}
/** The Reveal to players button: the same reveal-then-show path as Show to Players, without its confirmation (the click is the choice). */
export const revealFlow=(id,deps)=>showQuestFlow(id,{...deps,confirm:async()=>true});

/**
 * deps: {moduleId, user(), users(), socket, access(), now(), sleep(ms), projection(questId) -> GM-only published view document,
 *   visibleViews() -> [{document,view}] the current user may read, journalDoc(key), autoOpen(), busy(), openQuest(viewId), notify(msg)}
 */
export function createShowToPlayers(deps){
 const CHANNEL=`module.${deps.moduleId}`;
 const sentAt=new Map();let lastHandled=-Infinity;
 const idOf=u=>u?.id;
 const userById=id=>{const all=deps.users();return all?.get?.(id)??[...all].find(u=>idOf(u)===id)??null;};

 /** GM only. Sends the opaque key to the connected non-GM users who may observe the quest. {status, count?} */
 async function send(questId){
  const me=deps.user();assertGM(me);
  if(!deps.access())return {status:'player_access_off'};
  const doc=deps.projection(questId);
  if(!doc)return {status:'not_visible'};
  const now=deps.now();
  if(now-(sentAt.get(doc.id)??-Infinity)<SHOW_MIN_GAP_MS)return {status:'rate_limited'};
  const recipients=[...deps.users()].filter(u=>u&&!u.isGM&&u.active&&u.id!==me.id&&doc.testUserPermission?.(u,'OBSERVER'));
  if(!recipients.length)return {status:'no_recipients',count:0};
  sentAt.set(doc.id,now);
  deps.socket.emit(CHANNEL,{type:SHOW_SOCKET_TYPE,key:doc.id},{recipients:recipients.map(u=>u.id)});
  return {status:'sent',count:recipients.length};
 }

 /** Every client. True when the message was a show message (handled or refused), so other handlers skip it. */
 async function onSocket(msg,senderId){
  if(msg?.type!==SHOW_SOCKET_TYPE)return false;
  const me=deps.user(),sender=userById(senderId);
  if(!sender?.isGM||sender.id===me?.id||me?.isGM)return true;
  if(typeof msg.key!=='string'||!KEY.test(msg.key))return true;
  const now=deps.now();if(now-lastHandled<SHOW_MIN_GAP_MS)return true;lastHandled=now;
  if(!deps.access())return true;
  // The view may still be on its way to this client when the GM has only just revealed it: look a few times.
  let found=null;
  for(let tries=0;tries<4&&!found;tries++){
   if(tries)await deps.sleep(500);
   const doc=deps.journalDoc(msg.key);
   if(doc&&doc.getFlag?.(deps.moduleId,'public')===true&&doc.testUserPermission?.(me,'OBSERVER'))found=deps.visibleViews().find(x=>x.document===doc||x.document?.id===doc.id)??null;
  }
  if(!found)return true;
  const name=found.view?.name||UNTITLED;
  if(deps.autoOpen()&&!deps.busy()){const shown=await deps.openQuest(found.view.id);if(shown?.notify)deps.notify(`Your GM shared a quest: ${name}. Open the Quest Log to read it.`);}
  else deps.notify(`Your GM shared a quest: ${name}. Open the Quest Log to read it.`);
  return true;
 }
 return {send,onSocket};
}

/**
 * The GM's button. deps: {entries() -> [{source,state}], confirm(message,{title,yes}), info(title,message), updateState(id,patch),
 *   send(id), notify(msg,kind), sleep(ms), dirty()}.
 * A quest players cannot see yet is only revealed after a labelled confirmation, then shown.
 */
export async function showQuestFlow(id,deps){
 const entry=deps.entries().find(e=>e.source.id===id);
 if(!entry)throw new Error('Quest not found.');
 const name=entry.source.name||UNTITLED,plan=planShowReveal(entry.source,entry.state);
 if(plan.refuse){await deps.info(`${name} cannot be shown`,plan.refuse);return {status:'refused'};}
 if(!plan.visible){
  if(deps.dirty())throw new Error('Save or cancel your changes to the open quest first.');
  const who=entry.state.scope==='individual'?'the character it is for (and their players)':'all players who can open the Quest Log';
  const ok=await deps.confirm([`${name} is not visible to players yet. Showing it means revealing it first.`,...plan.lines,`Then it is visible to ${who} and opens on their screens.`].join('\n'),
   {title:'Reveal it, then show it?',yes:'Reveal and show'});
  if(!ok)return {status:'cancelled'};
  await deps.updateState(id,plan.patch);
  await deps.sleep(600);
 }
 const res=await deps.send(id);
 if(res.status==='sent')deps.notify(`Shown to ${plural(res.count,'player','players')}.`,'info');
 else if(res.status==='no_recipients')deps.notify('No connected player can see this quest right now, so nothing was shown.','warn');
 else if(res.status==='player_access_off')deps.notify('Quest Log is hidden from players. Turn on Show Quest Log to players in GM Setup first.','warn');
 else if(res.status==='rate_limited')deps.notify('Already shown a moment ago.','info');
 else deps.notify('Players cannot see this quest, so nothing was shown.','warn');
 return res;
}
