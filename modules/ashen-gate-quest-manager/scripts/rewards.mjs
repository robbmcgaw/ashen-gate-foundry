// Quest item rewards (contract ag-quest-rewards/1): the GM's reward list on a quest, and giving it to characters (0.12.0).
// Every call is GM only and every write goes through updateState (assertGM, validState, publish).
import {MOD,REWARD_VISIBILITY,REWARD_RECIPIENTS,MAX_ADDED_REWARDS,MAX_GRANTS,emptyRewards,rewardRows,grantedKeys,givenTo,isLevelBackup,isPlayerCharacter,LEVEL_BACKUP_ERROR} from './core.mjs';
import {getPrivate,allPrivate,updateState} from './store.mjs';
import {resolveItemDrop,itemRef,resolveRef,bundleOf,grantBundle,dragPayload} from './ag-item-drop.mjs';

export const REWARDS_CONTRACT='ag-quest-rewards/1';
export const HOLDING_FOLDER='Ashen Gate Rewards (Quest Log)';
const gmOnly=()=>{if(!game.user?.isGM)throw new Error('GM only.');};
const randomKey=()=>`rw-${globalThis.foundry?.utils?.randomID?.(8)??Math.random().toString(36).slice(2,10)}`;
function questOf(questId){
 const doc=getPrivate(questId);if(!doc)throw new Error('Quest not found.');
 const source=doc.getFlag(MOD,'source'),state=doc.getFlag(MOD,'state');
 return {source,state,rewards:structuredClone(state.rewards??emptyRewards())};
}
const save=(questId,rewards)=>updateState(questId,{rewards});
const isHolding=item=>!!item?.flags?.[MOD]?.holding;

/** The folder that holds GM-only copies of items dropped from an Actor (design §2.4), created on first use. */
async function holdingFolder(){
 const found=[...(game.folders??[])].find(f=>f.type==='Item'&&f.flags?.[MOD]?.store==='reward-holding');
 if(found)return found;
 return Folder.create({name:HOLDING_FOLDER,type:'Item',flags:{[MOD]:{store:'reward-holding'}}});
}
/** A world copy of an embedded Item (with its contents), GM only. The source Actor and its Item are never changed (D1). */
async function createHolding(item,from){
 const folder=await holdingFolder();
 const {data}=await grantBundle(item,{scope:MOD,tag:{holding:{from,at:Date.now()}}});
 for(const d of data){d.folder=folder?.id??null;d.ownership={default:0};}
 const created=await Item.createDocuments(data,{keepId:true,renderSheet:false});
 const root=created?.find?.(d=>d.id===data[0]._id)??created?.[0];
 if(!root)throw new Error('Could not create the held copy of that item.');
 return root;
}
/** Delete a holding copy and its contents, unless another quest's reward still points at it. */
async function dropHolding(ref){
 if(ref?.sourceKind!=='holding'||!ref.uuid)return;
 if(allPrivate().some(({state})=>(state.rewards?.added??[]).some(a=>a.ref?.uuid===ref.uuid)))return;
 let item=null;try{item=await globalThis.fromUuid?.(ref.uuid);}catch{item=null;}
 if(!isHolding(item)||item.pack||item.parent)return;
 const ids=(await bundleOf(item)).filter(isHolding).map(d=>d.id);
 if(ids.length)await Item.deleteDocuments(ids);
}

/** The merged rows with their resolve status: ok | missing | conflict (two world Items claim the id). */
export async function listRewards(questId){
 gmOnly();const {source,state}=questOf(questId);
 const out=[];
 for(const row of rewardRows(source,state)){
  const found=await resolveRef(row.origin==='gm'?row.ref:{itemId:row.itemId});
  const look=row.origin==='gm'?row.ref:found.item;
  out.push({...row,name:look?.name||row.itemId||'',img:look?.img??null,uuid:found.item?.uuid??null,status:found.status,givenTo:givenTo(state,row),
   reason:found.status==='conflict'?'Two items use this id.':found.status==='missing'?"That item no longer exists or can't be found.":''});
 }
 return out;
}

/** Add a dropped Item as a reward. Folders, Actors and other documents are refused with plain text. */
export async function addFromDrop(questId,dropData){
 gmOnly();const {rewards}=questOf(questId);
 if(dropData?.agQuestReward?.questId===questId)return {ok:false,reason:''}; // its own row dropped back: nothing to add
 const found=await resolveItemDrop(dropData);
 if(!found.ok)return {ok:false,reason:found.reason};
 if(rewards.added.length>=MAX_ADDED_REWARDS)return {ok:false,reason:`A quest can hold ${MAX_ADDED_REWARDS} added rewards.`};
 const item=found.items[0];
 let ref=await itemRef(item),holding=null;
 if(ref.sourceKind==='embedded'){
  holding=await createHolding(item,ref.parentUuid);
  ref={...ref,uuid:holding.uuid,sourceKind:'holding',packId:null};
 }
 const keys=new Set(rewards.added.map(a=>a.key));let key=randomKey();while(keys.has(key))key=randomKey();
 const row={key,ref,visibility:'on_complete',recipient:'chosen'};
 rewards.added.push(row);
 try{await save(questId,rewards);}
 catch(err){if(holding)await Item.deleteDocuments((await bundleOf(holding)).map(d=>d.id)).catch(()=>{});throw err;}
 return {ok:true,row:structuredClone(row)};
}

/** Change a row's quantity, visibility or recipient. GM rows change in place; imported rows through overrides. */
export async function updateReward(questId,key,patch={}){
 gmOnly();const {source,state,rewards}=questOf(questId);
 const row=rewardRows(source,state).find(r=>r.key===key);if(!row)throw new Error('Reward not found.');
 const next={};
 if(patch.quantity!==undefined){const q=Number(patch.quantity);if(!Number.isInteger(q)||q<1)throw new Error('Quantity must be a whole number, 1 or more.');next.quantity=q;}
 if(patch.visibility!==undefined){if(!REWARD_VISIBILITY.includes(patch.visibility))throw new Error('Unknown visibility.');next.visibility=patch.visibility;}
 if(patch.recipient!==undefined){if(!REWARD_RECIPIENTS.includes(patch.recipient))throw new Error('Unknown recipient.');next.recipient=patch.recipient;}
 if(row.origin==='gm'){
  const a=rewards.added.find(x=>x.key===key);
  if(next.quantity!==undefined)a.ref={...a.ref,quantity:next.quantity};
  if(next.visibility)a.visibility=next.visibility;
  if(next.recipient)a.recipient=next.recipient;
 }else rewards.overrides={...rewards.overrides,[key]:{...(rewards.overrides?.[key]??{}),...next}};
 const saved=await save(questId,rewards);
 return {ok:true,row:rewardRows(source,saved).find(r=>r.key===key)};
}

/** GM rows are deleted (and their held copy, unless a grant line points at it); imported rows are marked removed. */
export async function removeReward(questId,key){
 gmOnly();const {source,state,rewards}=questOf(questId);
 const row=rewardRows(source,state).find(r=>r.key===key);if(!row)throw new Error('Reward not found.');
 if(row.origin==='import'){
  rewards.overrides={...rewards.overrides,[key]:{...(rewards.overrides?.[key]??{}),removed:true}};
  await save(questId,rewards);return {ok:true};
 }
 const granted=(rewards.grants??[]).some(g=>(g?.lines??[]).some(l=>l?.rewardKey===key));
 rewards.added=rewards.added.filter(a=>a.key!==key);
 if(rewards.overrides)delete rewards.overrides[key];
 await save(questId,rewards);
 if(!granted)await dropHolding(row.ref);
 return {ok:true};
}

/* ---- 0.12.0: giving rewards (design §3.4–3.6). Every grant is started and confirmed by the GM. ---- */
const HUB='ashen-gate-character-hub';
const randomId=n=>globalThis.foundry?.utils?.randomID?.(n)??Math.random().toString(36).slice(2,2+n);
const actorName=id=>game.actors?.get?.(id)?.name??'a character';

/** The characters a quest goes to: its character on individual quests; on party quests the player characters
    (isPlayerCharacter: players' characters, no NPCs, monsters or level backups). */
export function partyActors(state){
 if(state?.scope==='individual'){const a=game.actors?.get?.(state.actorId);return a&&!isLevelBackup(a)?[a]:[];}
 const users=[...(game.users??[])];
 return [...(game.actors??[])].filter(a=>isPlayerCharacter(a,users));
}
/** Items on an Actor tagged as this reward (questId, rewardKey, round). */
function taggedItems(actor,questId,rewardKey,round){
 return [...(actor?.items??[])].filter(i=>{const t=i?.flags?.[MOD]?.reward;return t&&t.questId===questId&&t.rewardKey===rewardKey&&t.round===round;});
}
/** Given in this round: a granted record line, or an item on the Actor carrying the reward tag (a grant whose record was lost). */
export function isGranted(state,actor,rewardKey,round,questId,keys=grantedKeys(state)){
 if(!actor)return false;
 return keys.has(`${rewardKey}|${round}|${actor.id}`)||taggedItems(actor,questId,rewardKey,round).length>0;
}
/**
 * The plan for one grant: [{actorId, lines:[{rewardKey, round, quantity}]}]. Pure.
 * choices: {[rewardKey]: {give, actorId}} (chosen) | {give, actorIds} (each) | {give, split:{[actorId]: n}} (split).
 * Individual quests always give the full quantity to their character. Throws plain text when a choice can't be granted.
 */
export function grantPlan(rows,state,choices={},{party=[],nameOf=id=>id}={}){
 const keys=grantedKeys(state),byActor=new Map(),partySet=new Set(party);
 const add=(actorId,row,quantity)=>{
  if(keys.has(`${row.key}|${row.round}|${actorId}`))throw new Error(`${row.name??row.key} was already given to ${nameOf(actorId)}.`);
  if(!byActor.has(actorId))byActor.set(actorId,[]);byActor.get(actorId).push({rewardKey:row.key,round:row.round,quantity});
 };
 for(const row of rows){
  const c=choices[row.key];if(!c?.give||row.removed)continue;
  const label=row.name??row.key;
  if(state.scope==='individual'){add(state.actorId,row,row.quantity);continue;}
  if(row.recipient==='each'){
   const ids=[...new Set(c.actorIds??[])];if(!ids.length)throw new Error(`Tick at least one character for ${label}.`);
   for(const id of ids){if(!partySet.has(id))throw new Error(`${nameOf(id)} is not in the party.`);add(id,row,row.quantity);}
  }else if(row.recipient==='split'){
   const parts=Object.entries(c.split??{}).map(([id,n])=>[id,Number(n)]).filter(([,n])=>n!==0);
   if(parts.some(([,n])=>!Number.isInteger(n)||n<0))throw new Error(`Split ${label} in whole numbers.`);
   const total=parts.reduce((t,[,n])=>t+n,0);
   if(total!==row.quantity)throw new Error(`The split for ${label} must add up to ${row.quantity} (now ${total}).`);
   for(const [id,n] of parts){if(!partySet.has(id))throw new Error(`${nameOf(id)} is not in the party.`);add(id,row,n);}
  }else{
   if(!c.actorId)throw new Error(`Choose a character for ${label}.`);
   if(!partySet.has(c.actorId))throw new Error(`${nameOf(c.actorId)} is not in the party.`);
   add(c.actorId,row,row.quantity);
  }
 }
 return [...byActor].map(([actorId,lines])=>({actorId,lines}));
}

const locks=new Map();
/** One grant at a time per quest (in memory, GM client). */
function withLock(questId,fn){
 const prev=locks.get(questId)??Promise.resolve();
 const run=prev.catch(()=>{}).then(fn);
 locks.set(questId,run.finally(()=>{if(locks.get(questId)===run)locks.delete(questId);}));
 return run;
}
/** Give one character their lines, all or nothing: one create call, every id verified, anything made is deleted on failure. */
async function giveActor(actor,lines,{questId,grantId}){
 const data=[],per=[];
 for(const line of lines){
  const {data:d}=await grantBundle(line.item,{quantity:line.quantity,scope:MOD,tag:{reward:{questId,rewardKey:line.rewardKey,round:line.round,grantId}}});
  per.push(d.map(x=>x._id));data.push(...d);
 }
 const want=data.map(d=>d._id),arrivedIds=()=>want.filter(id=>actor.items?.get?.(id));
 try{
  const created=await actor.createEmbeddedDocuments('Item',data,{keepId:true,renderSheet:false});
  const got=new Set((created??[]).map(d=>d?.id??d?._id));
  if(want.every(id=>got.has(id)))return {ok:true,itemIds:per};
  const made=want.filter(id=>got.has(id)||actor.items?.get?.(id));
  if(made.length)await actor.deleteEmbeddedDocuments('Item',made);
  return {ok:false,reason:'Not every item arrived, so none were kept.'};
 }catch(err){
  const made=arrivedIds();
  if(made.length)await actor.deleteEmbeddedDocuments('Item',made).catch(e=>console.warn(`[${MOD}] Could not undo a failed grant`,e));
  return {ok:false,reason:`Could not create the items: ${err?.message??err}`};
 }
}
const missingReason=(status,name)=>status==='conflict'?`${name}: two items use this id.`:`${name} no longer exists or can't be found.`;

/** Run a plan (GM, one at a time per quest). Returns {grantId, results:[{actorId, name, ok, items:[{name,quantity}], reason}]}. */
export function executeGrant(questId,plan){
 gmOnly();
 return withLock(questId,async()=>{
  const {source,state,rewards}=questOf(questId);
  const rows=new Map(rewardRows(source,state).map(r=>[r.key,r])),keys=grantedKeys(state);
  const grantId=`g-${randomId(10)}`,record=[],results=[],journey=[];
  for(const {actorId,lines} of plan){
   const actor=game.actors?.get?.(actorId),name=actor?.name??'a character',todo=[],items=[];
   if(!actor){for(const l of lines)record.push({...l,actorId,itemIds:[],status:'failed',reason:'Character not found.'});results.push({actorId,name,ok:false,items,reason:'Character not found.'});continue;}
   if(isLevelBackup(actor)){for(const l of lines)record.push({...l,actorId,itemIds:[],status:'failed',reason:LEVEL_BACKUP_ERROR});results.push({actorId,name,ok:false,items,reason:LEVEL_BACKUP_ERROR});continue;}
   let fail='';
   for(const l of lines){
    const row=rows.get(l.rewardKey);
    if(!row||row.removed||row.gone||row.round!==l.round){fail||='A reward changed or was removed; open Give rewards again.';todo.push({...l,row:row??null});continue;}
    if(keys.has(`${l.rewardKey}|${l.round}|${actorId}`))continue;
    const tagged=taggedItems(actor,questId,l.rewardKey,l.round);
    if(tagged.length){record.push({rewardKey:l.rewardKey,round:l.round,actorId,quantity:l.quantity,itemIds:tagged.map(i=>i.id),status:'granted',repaired:true});continue;}
    const found=await resolveRef(row.origin==='gm'?row.ref:{itemId:row.itemId});
    const label=found.item?.name??row.ref?.name??row.itemId;
    if(found.status!=='ok'){fail||=missingReason(found.status,label);todo.push({...l,row});continue;}
    todo.push({...l,row,item:found.item,name:found.item.name});
   }
   if(!todo.length){results.push({actorId,name,ok:true,items,reason:''});continue;}
   const done=fail?{ok:false,reason:fail}:await giveActor(actor,todo,{questId,grantId});
   todo.forEach((l,i)=>record.push({rewardKey:l.rewardKey,round:l.round,actorId,quantity:l.quantity,itemIds:done.ok?done.itemIds[i]:[],status:done.ok?'granted':'failed',...(done.ok?{}:{reason:done.reason})}));
   if(done.ok){for(const l of todo)items.push({name:l.name,img:l.item.img??null,quantity:l.quantity,itemId:l.row.itemId??null});journey.push({actor,items});}
   results.push({actorId,name,ok:done.ok,items:items.map(({name,quantity})=>({name,quantity})),reason:done.ok?'':done.reason});
  }
  if(!record.length)return {grantId:null,results};
  rewards.grants=[...(rewards.grants??[]),{grantId,at:Date.now(),by:game.user?.id??null,lines:record}].slice(-MAX_GRANTS);
  await save(questId,rewards);
  for(const {actor,items} of journey)await recordJourney(actor,{questId,questName:source.name,grantId,items});
  if(journey.length)await rewardCard(source.name,journey);
  return {grantId,results};
 });
}
/** Character Hub's Journey (feature-detected). A missing or failing Hub never fails the grant. */
async function recordJourney(actor,reward){
 const fn=game.modules?.get?.(HUB)?.api?.journey?.recordReward;if(typeof fn!=='function')return;
 try{const r=await fn(actor,reward);if(r&&r.ok===false)console.warn(`[${MOD}] Journey did not record the reward:`,r.reason??r);}
 catch(err){console.warn(`[${MOD}] Journey did not record the reward:`,err);}
}
/** Whisper card (D9): the GMs and the players who own a recipient. Names and quantities only. */
export function cardWhisper(actors){
 const users=[...(game.users??[])];
 return [...new Set([...users.filter(u=>u.isGM),...users.filter(u=>!u.isGM&&actors.some(a=>a.testUserPermission?.(u,'OWNER')))].map(u=>u.id))];
}
async function rewardCard(questName,given){
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const body=given.map(({actor,items})=>`<p><strong>${esc(actor.name)}</strong></p><ul>${items.map(i=>`<li>${i.quantity} × ${esc(i.name)}</li>`).join('')}</ul>`).join('');
 try{await ChatMessage.create({content:`<h3>Quest reward: ${esc(questName)}</h3>${body}`,whisper:cardWhisper(given.map(g=>g.actor)),speaker:{alias:'Quest Log'}});}
 catch(err){console.warn(`[${MOD}] Could not post the reward card:`,err);}
}

/** Rows with what is still owed: {…row, party:[{id,name,given}], grantable}. Missing rows are listed but not grantable. */
export async function grantableRewards(questId){
 gmOnly();const {state}=questOf(questId);
 const party=partyActors(state),keys=grantedKeys(state);
 return (await listRewards(questId)).filter(r=>!r.removed).map(r=>{
  const people=party.map(a=>({id:a.id,name:a.name,given:isGranted(state,a,r.key,r.round,questId,keys)}));
  const anyGiven=people.some(p=>p.given)||givenTo(state,r,keys).length>0;
  const owed=!r.gone&&(state.scope==='individual'?people.length>0&&!people[0].given:r.recipient==='each'?people.some(p=>!p.given):!anyGiven);
  const givenNames=[...new Set([...people.filter(p=>p.given).map(p=>p.name),...givenTo(state,r,keys).map(actorName)])];
  return {...r,party:people,owed,grantable:owed&&r.status==='ok',givenNames};
 });
}
/** Give rewards from the panel's choices. Plans first (refuses bad choices), then runs the grant. */
export async function grantRewards(questId,choices){
 gmOnly();const {state}=questOf(questId);
 const rows=(await grantableRewards(questId)).filter(r=>r.owed);
 const plan=grantPlan(rows,state,choices,{party:partyActors(state).map(a=>a.id),nameOf:actorName});
 if(!plan.length)throw new Error('Nothing to give: tick at least one reward.');
 return executeGrant(questId,plan);
}
/** Grant again (D5): the row's round goes up by one, so it can be given once more. */
export async function grantAgain(questId,rewardKey,{confirm=false}={}){
 gmOnly();if(confirm!==true)throw new Error('Grant again needs {confirm: true}.');
 const {source,state,rewards}=questOf(questId);
 const row=rewardRows(source,state).find(r=>r.key===rewardKey&&!r.removed);if(!row)throw new Error('Reward not found.');
 if(!givenTo(state,row).length)throw new Error('This reward has not been given yet.');
 rewards.overrides={...rewards.overrides,[rewardKey]:{...(rewards.overrides?.[rewardKey]??{}),round:row.round+1}};
 await save(questId,rewards);return {ok:true,round:row.round+1};
}
/** Drag data for a reward row (D8): a plain Item drag that sheets accept, marked as this quest's reward. */
export function rewardDragData(questId,row){
 return dragPayload({schema:'ag-item-ref/1',uuid:row.uuid,itemId:row.itemId??null,name:row.name,img:row.img??null,quantity:row.quantity},{agQuestReward:{questId,rewardKey:row.key}});
}
/**
 * dropActorSheetData hook body (D8). Returns false for every quest-reward drag (Foundry must not copy it too),
 * undefined for anything else. The grant itself runs in the background and reports through notifications.
 */
export function onActorSheetDrop(actor,data,{notify=globalThis.ui?.notifications}={}){
 const tag=data?.agQuestReward;if(!tag)return undefined;
 if(!game.user?.isGM){notify?.warn?.('Only the GM can give quest rewards.');return false;}
 if(isLevelBackup(actor)){notify?.warn?.(LEVEL_BACKUP_ERROR);return false;}
 try{
  const {source,state}=questOf(tag.questId);
  const row=rewardRows(source,state).find(r=>r.key===tag.rewardKey&&!r.removed&&!r.gone);
  if(!row){notify?.warn?.('That reward is no longer on the quest.');return false;}
  if(isGranted(state,actor,row.key,row.round,tag.questId)){notify?.warn?.(`Already given to ${actor.name}.`);return false;}
  executeGrant(tag.questId,[{actorId:actor.id,lines:[{rewardKey:row.key,round:row.round,quantity:row.quantity}]}]).then(res=>{
   const r=res.results[0];
   if(r?.ok&&r.items.length)notify?.info?.(`Given to ${actor.name}: ${r.items.map(i=>`${i.quantity} × ${i.name}`).join(', ')}.`);
   else if(r&&!r.ok)notify?.warn?.(`Not given to ${actor.name}: ${r.reason}`);
  }).catch(err=>notify?.error?.(err?.message??String(err)));
 }catch(err){notify?.error?.(err?.message??String(err));}
 return false;
}

export function rewardsApi(){
 return {contract:REWARDS_CONTRACT,list:listRewards,addFromDrop,update:updateReward,remove:removeReward,
  grantable:grantableRewards,grant:grantRewards,grantAgain};
}
