/** AG-WORK-0009: portable, GM-authoring-only canonical Objective relationship helpers.
 * An Objective link NEVER implies Quest discovery, membership, award, or access.
 * No world UUID, title, status or reveal flag is stored or projected to players.
 */
export const OBJECTIVE_RELATIONS=Object.freeze(['offers_objective','associated_objective']);
export const OBJECTIVE_MODES=Object.freeze(['required','optional']);
const OBJECTIVE_ID=/^(?:QUEST|ORDER|CONTRACT)-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
export function validateObjectiveRef(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('Objective reference must be an object.');
  const {relation,target_id,mode}=input;
  if(!OBJECTIVE_RELATIONS.includes(relation))throw new Error('Unsupported Objective relation.');
  if(typeof target_id!=='string'||!OBJECTIVE_ID.test(target_id))throw new Error('Objective ID must be a canonical QUEST-*, ORDER-* or CONTRACT-* ID.');
  if(!OBJECTIVE_MODES.includes(mode))throw new Error('Objective reference mode must be required or optional.');
  return {relation,target_id,mode};
}
export function objectiveRefs(faction){return (faction?.refs??[]).filter(r=>OBJECTIVE_RELATIONS.includes(r?.relation));}
export function addObjectiveRef(faction,ref){
  const clean=validateObjectiveRef(ref);
  const next=structuredClone(faction);
  next.refs??=[];
  // One faction can associate with and offer the same quest: relation is part of identity.
  if(next.refs.some(r=>r.relation===clean.relation&&r.target_id===clean.target_id))throw Error('That Objective relationship already exists.');
  next.refs.push(clean);
  return next;
}
export function removeObjectiveRef(faction,ref){
  const clean=validateObjectiveRef(ref),next=structuredClone(faction);
  next.refs=(next.refs??[]).filter(r=>!(r.relation===clean.relation&&r.target_id===clean.target_id));
  return next;
}
export function checkObjectiveRefs(faction){
  const errs=[],seen=new Set();
  for(const r of objectiveRefs(faction)){
    try{validateObjectiveRef(r)}catch(e){errs.push(e.message)}
    const k=`${r.relation}:${r.target_id}`;
    if(seen.has(k))errs.push(`Duplicate Objective relationship: ${k}`);
    seen.add(k);
  }
  return errs;
}

/** Optional GM-only Quest Manager v0.3.1 consumer adapter.
 * A stored reference is not proof that a Quest is visible, active, or adopted.
 * This diagnostic never resolves through raw Foundry UUIDs and never provides
 * an Objective grant or a player-facing link.
 */
export const QUEST_CONSUMER_CONTRACT='ag-objective-consumer/0.2-alpha';
export const QUEST_MODULE_CONTRACT='ag-objectives/0.1-alpha';
export function auditObjectiveRefs(faction,questModule){
  const api=questModule?.active?questModule.api:null;
  const usable=api?.contract===QUEST_MODULE_CONTRACT&&
    api?.consumer?.contract===QUEST_CONSUMER_CONTRACT&&
    typeof api.consumer.resolveObjective==='function';
  return objectiveRefs(faction).map(raw=>{
    let ref;
    try{ref=validateObjectiveRef(raw)}catch{
      return {relation:raw?.relation??'',target_id:raw?.target_id??'',mode:raw?.mode??'',status:'invalid_ref'};
    }
    const row={...ref,status:'unverified'};
    if(!usable)return row;
    try{
      // The Quest owner checks exact canonical identity, Objective logical type,
      // and objective_kind=quest/work_order/contract for each prefix.
      const result=api.consumer.resolveObjective(ref.target_id,{entityType:'Objective'});
      if(result?.then)return {...row,status:'unavailable'}; // no speculative async result
      if(result?.status==='ok'){
        if(result.binding?.id===ref.target_id&&result.binding?.entityType==='Objective')
          return {...row,status:'resolved'};
        return {...row,status:'unavailable'};
      }
      return {...row,status:typeof result?.status==='string'?result.status:'unavailable'};
    }catch{return {...row,status:'unavailable'};}
  });
}
