/** Ashen Gate Profession Ledger crafting core (0.9.0).
 * Plans and executes a craft against real Actor inventories. No Foundry globals are read
 * here; callers pass Actors, the recipe and the result Item data, so the rules are testable.
 */
import {norm,inventory,quantity} from './core.mjs';
import {ACCESS_LEVELS,progressOf} from './progression.mjs';

export const LEDGER_SCOPE='ashen-gate-profession-ledger';
/** Material visibility a player is never shown, even when a party member holds the Item. */
const SECRET_VISIBILITY=new Set(['gm','reveal_gated']);
export const playerSafeItem=item=>!SECRET_VISIBILITY.has(item?.sourceVisibility);

/** Canonical tiers are lowercase ("apprentice"); the progression table uses "Apprentice". */
export function tierLevel(tier){
  const key=Object.keys(ACCESS_LEVELS).find(k=>norm(k)===norm(tier));
  return key?ACCESS_LEVELS[key]:null;
}
export const tierLabel=tier=>{const key=Object.keys(ACCESS_LEVELS).find(k=>norm(k)===norm(tier));return key??(tier?String(tier):'');};

/** Material Items an Actor holds that can be used as ingredients. */
export function materialStock(actor,{playerView=false}={}){
  return inventory(actor).filter(i=>i.qty>0&&(!i.category||i.category==='Material')&&(!i.sourceId||i.sourceId.startsWith('MAT-'))&&(!playerView||playerSafeItem(i)));
}
function matches(item,ing,materialDefs){
  if(ing.materialId&&item.sourceId)return item.sourceId===ing.materialId;
  if(item.sourceId)return false;
  // Untagged legacy Items only match by the ingredient's (or catalog) display name, never by an ID.
  const expected=(ing.name&&ing.name!==ing.materialId?ing.name:null)??materialDefs.find(m=>m.id===ing.materialId)?.name;
  return Boolean(expected)&&norm(item.name)===norm(expected);
}

/**
 * Who has what for a recipe. The crafter's own Items are used first, then other party members'.
 * `contributors` lists the other Actors whose Items may be requested. Never mutates anything.
 */
export function planCraft(recipe,crafter,contributors=[],{materialDefs=[],playerView=false,nameOf=ing=>ing.name}={}){
  const actors=[crafter,...contributors.filter(a=>a&&a.id!==crafter?.id)];
  const stock=actors.flatMap(actor=>materialStock(actor,{playerView}).map(i=>({...i,actor,left:i.qty})));
  const requirements=[],allocations=[];
  for(const ing of recipe?.ingredients??[]){
    let needed=ing.quantity;
    const hits=stock.filter(s=>matches(s,ing,materialDefs));
    const own=hits.filter(s=>s.actor.id===crafter.id).reduce((n,s)=>n+s.left,0);
    const party=hits.reduce((n,s)=>n+s.left,0);
    for(const s of hits){
      if(!needed)break;
      const take=Math.min(needed,s.left);if(take<1)continue;
      allocations.push({materialId:ing.materialId??null,name:nameOf(ing)||s.name,quantity:take,actorId:s.actor.id,actorName:s.actor.name,itemId:s.id,own:s.actor.id===crafter.id});
      s.left-=take;needed-=take;
    }
    requirements.push({materialId:ing.materialId??null,name:nameOf(ing)||hits[0]?.name||'',required:ing.quantity,own,party,missing:needed});
  }
  const missing=requirements.filter(r=>r.missing>0);
  const foreign=allocations.filter(a=>!a.own);
  return {requirements,allocations,missing,foreign,ready:Boolean(recipe?.hasStructuredIngredients)&&!missing.length,ownReady:Boolean(recipe?.hasStructuredIngredients)&&!missing.length&&!foreign.length};
}

/** Everything that must be true before a craft is attempted, as a list of plain-language reasons.
 * 0.29.0: `label` is the word the recipe's profession uses for a recipe, in lower case (display only; default "recipe"). */
export function craftBlockers({recipe,crafter,knownIds,result,label='recipe'}){
  const out=[];
  if(!recipe)return [`This ${label} is not available to you.`];
  if(!knownIds.includes(recipe.id))out.push(`${crafter?.name??'This character'} has not learned this ${label}.`);
  // 0.28.0: an activity (kind "activity") needs no ingredients and makes no item; known recipe and level rules are the same.
  if(recipe.kind!=='activity'){
    if(!recipe.hasStructuredIngredients)out.push(`This ${label} has no ingredient list yet. Ask your GM.`);
    if(!result)out.push(`The item this ${label} makes is not in this world yet. Ask your GM to import it with General Manager.`);
  }
  const need=tierLevel(recipe.tier),progress=recipe.professionId?progressOf(crafter,recipe.professionId):null;
  // Only tracked progress is enforced; a character without Ledger XP is not assumed to be under-levelled.
  if(need&&progress&&progress.level<need)out.push(`Needs ${tierLabel(recipe.tier)} (profession level ${need}); ${crafter.name} is level ${progress.level}.`);
  return out;
}

/** Group allocations into one consumption row per (Actor, Item). */
function consumptionRows(allocations){
  const rows=new Map();
  for(const a of allocations){
    const key=`${a.actorId}:${a.itemId}`;
    if(!rows.has(key))rows.set(key,{...a,quantity:0});
    rows.get(key).quantity+=a.quantity;
  }
  return [...rows.values()];
}

/** Item data for the crafted result, copied from the world `ITEM-*` definition. */
export function resultItemData(worldItem,{recipeId,resultId}){
  const data=typeof worldItem?.toObject==='function'?worldItem.toObject():structuredClone(worldItem??{});
  for(const key of ['_id','id','folder','sort','ownership','_stats','uuid'])delete data[key];
  data.system={...(data.system??{}),quantity:1};
  data.flags={...(data.flags??{}),[LEDGER_SCOPE]:{...(data.flags?.[LEDGER_SCOPE]??{}),entityType:'Item',sourceId:resultId,craftedFrom:recipeId}};
  return data;
}
/** Manager 0.26.0+ core link on the world `ITEM-*` definition (read-only here), or null. */
export const coreLinkOf=worldItem=>worldItem?.flags?.['ashen-gate-manager']?.coreLink??null;
/**
 * 0.17.0: the crafted result as a fresh copy of the linked 2024 core item. Keeps the Ashen Gate name,
 * the Manager source flags (AG id, coreLink) and the Ledger flags, so stacking and recipes still find it.
 */
export function coreResultData(worldItem,coreItem,{recipeId,resultId}){
  const world=typeof worldItem?.toObject==='function'?worldItem.toObject():structuredClone(worldItem??{});
  const data=typeof coreItem?.toObject==='function'?coreItem.toObject():structuredClone(coreItem??{});
  for(const key of ['_id','id','folder','sort','ownership','_stats','uuid'])delete data[key];
  data.name=world.name??data.name;
  data.system={...(data.system??{}),quantity:1};
  data.flags={...(data.flags??{}),'ashen-gate-manager':structuredClone(world.flags?.['ashen-gate-manager']??{}),
    [LEDGER_SCOPE]:{...(world.flags?.[LEDGER_SCOPE]??{}),entityType:'Item',sourceId:resultId,craftedFrom:recipeId,coreItem:true}};
  return data;
}
/**
 * Which item a craft awards: the linked core item when `awardCore` is on and it can be loaded and stacked,
 * else today's world item. `loadCore(uuid)` is Foundry's fromUuid (injectable for tests). Never throws.
 */
export async function craftResultData(worldItem,{recipeId,resultId,awardCore=true,loadCore}){
  const fallback=note=>({data:resultItemData(worldItem,{recipeId,resultId}),core:false,note});
  const link=coreLinkOf(worldItem);
  if(!awardCore||!link?.uuid)return fallback(awardCore?'':'core awards are off');
  let core=null;
  try{core=await loadCore(link.uuid);}catch{core=null;}
  if(!core)return fallback(`linked core item ${link.name??link.uuid} is missing`);
  const raw=typeof core.toObject==='function'?core.toObject():core;
  if(raw.system?.quantity===undefined)return fallback(`core item ${raw.name} cannot stack`);
  return {data:coreResultData(worldItem,raw,{recipeId,resultId}),core:true,note:''};
}
const heldResult=(actor,resultId)=>Array.from(actor?.items??[]).find(i=>{
  const src=i.flags?.['ashen-gate-manager']?.source?.sourceId??i.flags?.[LEDGER_SCOPE]?.sourceId;
  return src===resultId;
});

/**
 * Consume verified ingredients, then produce the result. Every step is checked first;
 * if any write fails, earlier writes are reversed so no Items are lost or duplicated.
 * `canWrite(actor)` is the caller's ownership check (OWNER, or the GM acting for approved owners).
 */
export async function executeCraft({crafter,recipe,allocations,resultData,resultId,actorOf,canWrite}){
  if(!crafter||!recipe)throw Error('Choose a character and a recipe');
  if(!canWrite(crafter))throw Error(`You need to own ${crafter.name} to craft with them`);
  const rows=consumptionRows(allocations);
  // Verify everything before writing anything.
  const steps=rows.map(row=>{
    const actor=actorOf(row.actorId);
    if(!actor)throw Error(`${row.actorName} is no longer in this world`);
    if(!canWrite(actor))throw Error(`Permission to use ${row.actorName}'s materials was not granted`);
    const item=actor.items?.get?.(row.itemId)??Array.from(actor.items??[]).find(i=>i.id===row.itemId);
    if(!item)throw Error(`${row.actorName} no longer has ${row.name}`);
    const have=quantity(item);
    if(have<row.quantity)throw Error(`${row.actorName} has only ${have} × ${row.name} (needs ${row.quantity})`);
    return {actor,item,row,have,snapshot:typeof item.toObject==='function'?item.toObject():structuredClone({...item})};
  });
  const total=ing=>rows.filter(r=>ing.materialId?r.materialId===ing.materialId:norm(r.name)===norm(ing.name)).reduce((n,r)=>n+r.quantity,0);
  if(!recipe.ingredients?.length)throw Error(`${recipe.name} has no ingredient list`);
  for(const ing of recipe.ingredients)if(total(ing)<ing.quantity)throw Error(`Not enough materials for ${recipe.name}`);
  if(!resultData)throw Error('The item this recipe makes is not in this world yet');
  const done=[];
  const rollback=async()=>{
    for(const step of done.reverse()){
      try{
        if(step.deleted)await step.actor.createEmbeddedDocuments('Item',[step.snapshot],{keepId:true});
        else await step.actor.updateEmbeddedDocuments('Item',[{_id:step.item.id,'system.quantity':step.have}]);
      }catch(err){console.error(`[${LEDGER_SCOPE}] Craft rollback failed for ${step.row.actorName}: ${step.row.name}`,err);}
    }
  };
  try{
    for(const step of steps){
      const left=step.have-step.row.quantity;
      if(left>0)await step.actor.updateEmbeddedDocuments('Item',[{_id:step.item.id,'system.quantity':left}]);
      else await step.actor.deleteEmbeddedDocuments('Item',[step.item.id]);
      done.push({...step,deleted:left<=0});
    }
    const existing=heldResult(crafter,resultId);
    let created;
    if(existing){
      await crafter.updateEmbeddedDocuments('Item',[{_id:existing.id,'system.quantity':quantity(existing)+1}]);
      created=existing;
    }else{
      const out=await crafter.createEmbeddedDocuments('Item',[resultData]);
      if(!out?.length)throw Error('Foundry did not create the crafted item');
      created=out[0];
    }
    return {created,consumed:rows.map(r=>({actorId:r.actorId,actorName:r.actorName,name:r.name,quantity:r.quantity}))};
  }catch(err){
    await rollback();
    throw Error(`Crafting ${recipe.name} was cancelled and materials were restored: ${err.message}`);
  }
}

/**
 * Collects owner consent for foreign materials. Transport-agnostic: `send(message)` delivers to
 * other clients, `deliver(message)` is fed every incoming message. Any decline or timeout cancels.
 */
export class ConsentBroker{
  constructor({send,newId,timeoutMs=120000,setTimer=setTimeout,clearTimer=clearTimeout}){
    Object.assign(this,{send,newId,timeoutMs,setTimer,clearTimer});
    this.pending=new Map();
  }
  /** requests: [{actorId,actorName,approverIds:[userId],rows:[{name,quantity}]}]; resolves {approved,declinedBy?}. */
  ask({requestId,requester,crafterName,recipeName,requests}){
    if(!requests.length)return Promise.resolve({approved:true});
    return new Promise(resolve=>{
      const waiting=new Map(requests.map(r=>[this.newId(),r]));
      const finish=result=>{
        if(!this.pending.has(requestId))return;
        this.clearTimer(entry.timer);this.pending.delete(requestId);
        this.send({type:'consent-closed',requestId,approved:result.approved,reason:result.reason??null});
        resolve(result);
      };
      const entry={waiting,finish,timer:this.setTimer(()=>finish({approved:false,reason:'No answer in time'}),this.timeoutMs)};
      this.pending.set(requestId,entry);
      for(const [consentId,r] of waiting)this.send({type:'consent-request',requestId,consentId,toUserIds:r.approverIds,
        requesterName:requester,crafterName,recipeName,actorId:r.actorId,actorName:r.actorName,rows:r.rows});
    });
  }
  /** An answer counts only from a user it was addressed to. */
  deliver(message,senderId=message?.userId){
    if(message?.type!=='consent-response')return false;
    const entry=this.pending.get(message.requestId);const request=entry?.waiting.get(message.consentId);
    if(!request||!request.approverIds.includes(senderId))return false;
    if(message.approved!==true){entry.finish({approved:false,declinedBy:request.actorName,reason:`${request.actorName}'s owner declined`});return true;}
    entry.waiting.delete(message.consentId);
    if(!entry.waiting.size)entry.finish({approved:true});
    return true;
  }
}
