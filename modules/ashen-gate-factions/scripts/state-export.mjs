/** Renown play-state export (0.27.0). Pure JS, no Foundry runtime: module.mjs hands it the stored records.
 * `ag-factions-state-export/0.1` is campaign PLAY STATE (standings, claims, requests, reveals, membership, Vows). It is
 * deliberately not the definitions format (`ag-factions-source-export/0.4`) and General Manager's reconcile reads only content
 * schemas, so a backup file in this schema is never mistaken for content. No definition text, no timestamps of its own. */
import {upgradeFaction,progressFor} from './core.mjs';
import {isDeity} from './deity.mjs';
import {normalizeVow} from './vow.mjs';
export const STATE_EXPORT_SCHEMA='ag-factions-state-export/0.1';
const ENVELOPE=['id','entity_type','scope','version','faction_id','actor_id'];
const byText=(a,b)=>String(a).localeCompare(String(b));
/** Rank position of a score on a track: ids and names from the definition, nothing invented. */
export function progressOf(track,score){
  if(!track?.milestones?.length)return null;
  const p=progressFor(track,Number(score)||0);
  return {rank_id:p.rank.id,rank:p.rank.name,rank_index:p.index,rank_threshold:p.rank.threshold,next_rank_id:p.next?.id??null,next_rank:p.next?.name??null,next_threshold:p.next?.threshold??null,remaining:p.remaining};
}
/** Every actor id a stored state names (arrays called `actors`, and `actor_id` fields), so each can be shown with a name. */
function actorIdsIn(value,out=new Set()){
  if(Array.isArray(value))value.forEach(v=>actorIdsIn(v,out));
  else if(value&&typeof value==='object'){
    for(const [k,v] of Object.entries(value)){
      if(k==='actors'&&Array.isArray(v))v.filter(x=>typeof x==='string'&&x).forEach(x=>out.add(x));
      else if(k==='actor_id'&&typeof v==='string'&&v)out.add(v);
      else actorIdsIn(v,out);
    }
  }
  return out;
}
const withoutEnvelope=state=>{const s=structuredClone(state??{});for(const k of ENVELOPE)delete s[k];return s;};
/**
 * @param {object} args
 * @param {boolean} args.isGM   refused unless true (the API checks too; this is the service-level guard)
 * @param {object[]} args.definitions  stored faction/deity records (flags.faction)
 * @param {object[]} args.groupStates  stored group state records (flags.groupClaims)
 * @param {object[]} args.personalStates  stored per-character state records (flags.individual)
 * @param {{id:string,name:string,vow:any,vowLog:any[]}[]} args.actors  the world's characters with their Vow flags
 */
export function buildStateExport({isGM,definitions=[],groupStates=[],personalStates=[],actors=[]}){
  if(isGM!==true)throw Error('GM authorization required.');
  const defs=new Map();
  for(const raw of definitions){try{const f=upgradeFaction(raw);defs.set(f.id,f);}catch{/* unreadable definition: its state is still exported below, unnamed */}}
  const names=new Map(actors.map(a=>[a.id,a.name??null]));
  const info=id=>{const f=defs.get(id);return {id,kind:f?(isDeity(f)?'deity':'faction'):null,name:f?.name??null};};
  const factions=new Map();
  for(const id of defs.keys())factions.set(id,{...info(id),renown_track_id:isDeity(defs.get(id))?null:defs.get(id).renown_track?.id??null,individual_track_id:defs.get(id).individual_track?.id??null,group:null});
  for(const state of groupStates){
    const id=state?.faction_id;if(!id)continue;
    const f=defs.get(id),entry=factions.get(id)??{...info(id),renown_track_id:null,individual_track_id:null,group:null,definition_missing:true};
    const body=withoutEnvelope(state);
    body.progress=f&&!isDeity(f)?progressOf(f.renown_track,state.standing?.score):null;
    body.actor_names=Object.fromEntries([...actorIdsIn(state)].sort(byText).map(a=>[a,names.get(a)??null]));
    entry.group=body;factions.set(id,entry);
  }
  const people=new Map();
  const person=id=>{if(!people.has(id))people.set(id,{actor_id:id,actor_name:names.get(id)??null,vow:null,vow_log:[],factions:[]});return people.get(id);};
  for(const a of actors){
    const vow=normalizeVow(a.vow),log=Array.isArray(a.vowLog)?structuredClone(a.vowLog):[];
    if(!vow&&!log.length)continue;
    const p=person(a.id);
    p.vow=vow?{...vow,deity_name:info(vow.deity_id).name}:null;p.vow_log=log;
  }
  for(const state of personalStates){
    const id=state?.faction_id,actorId=state?.actor_id;if(!id||!actorId)continue;
    const f=defs.get(id),body=withoutEnvelope(state);
    person(actorId).factions.push({faction_id:id,kind:info(id).kind,faction_name:info(id).name,...body,progress:f?progressOf(f.individual_track,state.standing?.score):null,...(f?{}:{definition_missing:true})});
  }
  for(const p of people.values())p.factions.sort((a,b)=>byText(a.faction_id,b.faction_id));
  return {
    schema_version:STATE_EXPORT_SCHEMA,
    factions:[...factions.values()].sort((a,b)=>byText(a.id,b.id)),
    personal:[...people.values()].sort((a,b)=>byText(a.actor_name??'',b.actor_name??'')||byText(a.actor_id,b.actor_id))
  };
}
