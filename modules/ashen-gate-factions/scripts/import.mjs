/** Factions import: validate a definitions file, plan what is new, and write it through injected GM-only I/O.
 * Portable: no Foundry runtime here. Additive only: a faction id that already exists is skipped whole, so its
 * definition, discovery and Renown are never touched. `starting_state` applies to NEW factions only.
 */
import {sourceDefinition,validateFaction,adjustStanding} from './core.mjs';
// 0.4 adds deities (entity_type 'Deity'); 0.3 files (factions only) are still accepted.
export const IMPORT_SCHEMA='ag-factions-source-export/0.4';
export const IMPORT_SCHEMAS=Object.freeze(['ag-factions-source-export/0.3',IMPORT_SCHEMA]);
const START_KEYS=['faction_id','party_discovered','group_renown','actors'];
const ACTOR_KEYS=['name','discovered','renown'];
const EVENT_KEYS=['delta','reason'];
const isObj=v=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const closed=(v,keys,path,errors)=>{for(const k of Object.keys(v))if(!keys.includes(k))errors.push(`${path}: unknown field ${k}.`);};
function renownList(list,path,errors){
  if(list===undefined)return [];
  if(!Array.isArray(list)){errors.push(`${path}: array required.`);return [];}
  list.forEach((e,i)=>{
    if(!isObj(e)){errors.push(`${path}[${i}]: object required.`);return;}
    closed(e,EVENT_KEYS,`${path}[${i}]`,errors);
    if(!Number.isSafeInteger(e.delta)||e.delta===0||Math.abs(e.delta)>1000)errors.push(`${path}[${i}].delta: nonzero integer, at most 1000.`);
    if(typeof e.reason!=='string'||!e.reason.trim()||e.reason.length>400)errors.push(`${path}[${i}].reason: 1-400 characters required.`);
  });
  return list;
}
/** Checks the file and says what an import would do. Writes nothing. `existingIds` is the set of faction ids already in the world. */
export function planImport(data,existingIds=new Set()){
  const errors=[],rows=[];
  if(!isObj(data))return {errors:['The file is not a JSON object.'],rows};
  if(!IMPORT_SCHEMAS.includes(data.schema_version))errors.push(`schema_version must be ${IMPORT_SCHEMAS.join(' or ')}.`);
  if(!Array.isArray(data.definitions)||!data.definitions.length)errors.push('definitions: a non-empty array is required.');
  if(data.starting_state!==undefined&&!Array.isArray(data.starting_state))errors.push('starting_state: array required.');
  if(errors.length)return {errors,rows};
  const seen=new Set(),starts=new Map();
  (data.starting_state??[]).forEach((s,i)=>{
    const path=`starting_state[${i}]`;
    if(!isObj(s)){errors.push(`${path}: object required.`);return;}
    closed(s,START_KEYS,path,errors);
    if(starts.has(s.faction_id))errors.push(`${path}: the same faction appears twice.`);
    starts.set(s.faction_id,s);
    if(s.party_discovered!==undefined&&typeof s.party_discovered!=='boolean')errors.push(`${path}.party_discovered: Boolean required.`);
    renownList(s.group_renown,`${path}.group_renown`,errors);
    if(s.actors!==undefined&&!Array.isArray(s.actors))errors.push(`${path}.actors: array required.`);
    (Array.isArray(s.actors)?s.actors:[]).forEach((a,j)=>{
      if(!isObj(a)){errors.push(`${path}.actors[${j}]: object required.`);return;}
      closed(a,ACTOR_KEYS,`${path}.actors[${j}]`,errors);
      if(typeof a.name!=='string'||!a.name.trim())errors.push(`${path}.actors[${j}].name: character name required.`);
      if(a.discovered!==undefined&&typeof a.discovered!=='boolean')errors.push(`${path}.actors[${j}].discovered: Boolean required.`);
      renownList(a.renown,`${path}.actors[${j}].renown`,errors);
    });
  });
  data.definitions.forEach((raw,i)=>{
    let clean;
    try{clean=sourceDefinition(raw);}catch(e){errors.push(`definitions[${i}]: ${e.message}`);return;}
    const nm=`"${clean.name||'Unnamed'}"`,faults=validateFaction(clean);
    if(faults.length){errors.push(`definitions[${i}] ${nm}: ${faults.join(' ')}`);return;}
    if(seen.has(clean.id)){errors.push(`definitions[${i}]: duplicate ${nm}.`);return;}
    const deity=clean.entity_type==='Deity';
    if(deity&&data.schema_version!==IMPORT_SCHEMA){errors.push(`definitions[${i}] ${nm}: deities need schema_version ${IMPORT_SCHEMA}.`);return;}
    if(deity&&starts.get(clean.id)?.group_renown?.length)errors.push(`starting_state for ${nm}: deities have no group Renown; use actors[].renown.`);
    seen.add(clean.id);
    const exists=existingIds.has(clean.id);
    rows.push({id:clean.id,name:clean.name,kind:deity?'deity':'faction',action:exists?'skip':'new',reason:exists?'Already in this world; kept as is.':'',definition:clean,start:exists?null:starts.get(clean.id)??null});
  });
  let orphan=0;for(const id of starts.keys())if(!seen.has(id))orphan++;if(orphan)errors.push(`starting_state: ${orphan} ${orphan===1?'entry has':'entries have'} no matching definition.`);
  return {errors,rows};
}
/**
 * Writes the plan. `io` carries every Foundry call, so this function is the whole data-layer rule:
 *   assertGM()                         throws unless the current user is a GM (called before anything else)
 *   createFaction(definition)          creates the definition and group-state Journals
 *   updateGroup(id, fn)                fn(state) -> new group campaign state
 *   updatePersonal(id, actor, fn)      same for one character's personal state
 *   findActor(name)                    {id, name} | null
 *   finish(id)                         per-faction follow-up (auto knowledge, projection)
 *   eventId(), now()
 * Returns {added, skipped, missingActors}.
 */
export async function runImport(plan,io){
  io.assertGM();
  if(plan.errors.length)throw Error(`Import blocked: ${plan.errors[0]}`);
  const added=[],skipped=[],failed=[],missing=new Set();
  const standing=(old,events)=>events.reduce((s,e)=>adjustStanding(s,{delta:e.delta,reason:e.reason,eventId:io.eventId(),when:io.now()}).standing,old);
  for(const row of plan.rows){
    if(row.action==='skip'){skipped.push({id:row.id,name:row.name,reason:row.reason});continue;}
    try{
    await io.createFaction(row.definition);
    const start=row.start??{},actors=[];
    for(const a of start.actors??[]){
      const found=io.findActor(a.name);
      if(!found){missing.add(a.name);continue;}
      actors.push({found,spec:a});
    }
    if(start.party_discovered!==undefined||start.group_renown?.length||actors.some(a=>a.spec.discovered)){
      await io.updateGroup(row.id,state=>{
        const next=structuredClone(state);
        next.discovery={party:false,actors:[],...(next.discovery??{})};
        if(start.party_discovered)next.discovery.party=true;
        for(const {found,spec} of actors)if(spec.discovered&&!next.discovery.actors.includes(found.id))next.discovery.actors.push(found.id);
        if(start.group_renown?.length)next.standing=standing(next.standing,start.group_renown);
        return next;
      });
    }
    for(const {found,spec} of actors){
      if(spec.renown?.length)await io.updatePersonal(row.id,found,state=>({...structuredClone(state),standing:standing(state.standing,spec.renown)}));
    }
    await io.finish(row.id);
    added.push({id:row.id,name:row.name});
    }catch(error){failed.push({id:row.id,reason:String(error?.message??error)});}
  }
  return {added,skipped,failed,missingActors:[...missing]};
}
