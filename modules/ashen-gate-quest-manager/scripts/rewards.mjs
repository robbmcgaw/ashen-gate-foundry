// Quest item rewards (contract ag-quest-rewards/1): the GM's reward list on a quest. Nothing is granted here.
// Every call is GM only and every write goes through updateState (assertGM, validState, publish).
import {MOD,REWARD_VISIBILITY,REWARD_RECIPIENTS,MAX_ADDED_REWARDS,emptyRewards,rewardRows} from './core.mjs';
import {getPrivate,allPrivate,updateState} from './store.mjs';
import {resolveItemDrop,itemRef,resolveRef,bundleOf,grantBundle} from './ag-item-drop.mjs';

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
 const created=await Item.createDocuments(data,{keepId:true});
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
  out.push({...row,name:look?.name||row.itemId||'',img:look?.img??null,status:found.status,
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

export function rewardsApi(){
 return {contract:REWARDS_CONTRACT,list:listRewards,addFromDrop,update:updateReward,remove:removeReward};
}
