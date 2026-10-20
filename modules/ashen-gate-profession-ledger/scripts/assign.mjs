/** Ashen Gate Profession Ledger: profession assignment (0.16.0, AG-F01).
 * Which professions a character qualifies for from their dnd5e skill and tool PROFICIENCIES (never class), or (0.20.0)
 * from carrying a qualifying core item such as Fishing Tackle, using the crosswalk from effectiveMapping, and which
 * imported PROF-* Profession Items they still lack.
 * Pure rules; main.js reads Foundry, enforces the GM gate and creates the Items.
 */
import {PROFESSION_NAMES,norm} from './core.mjs';
import {SKILL_IDS,SKILL_LABELS,professionKey,requiredToolRef,toolLabel,skillLabel,toolProficient,carriedItem,cleanItemList,CROSSWALK_LISTS,toolKeys} from './checks.mjs';

export const PROFESSION_KEYS=Object.freeze(PROFESSION_NAMES.map(professionKey));
export const professionTitle=key=>PROFESSION_NAMES.find(n=>professionKey(n)===key)??key;

/** A catalog skill name ("Nature") as a dnd5e skill id, or null. No aliases are guessed. */
const skillIdOf=name=>{const t=String(name??'').trim();if(SKILL_IDS.includes(t))return t;return SKILL_IDS.find(k=>norm(SKILL_LABELS[k])===norm(t))??null;};
const toolIdOf=name=>requiredToolRef(name)?.key??null;

/**
 * Catalog layer of the crosswalk, from imported Profession definitions [{sourceId, name, access}].
 * Only a definition whose `access` names at least one any-of list counts; an empty `access` ({}) leaves the
 * built-in default in place. Names that match no dnd5e skill/tool are reported in `unresolved`, not guessed.
 * Two definitions for one profession that disagree are reported in `conflicts` and neither is used.
 */
export function catalogCrosswalk(definitions=[]){
  const out={},unresolved=[],conflicts=[],seen=new Map();
  for(const d of definitions){
    const access=d?.access;
    if(!access||typeof access!=='object')continue;
    const lists={skillProficienciesAnyOf:'qualifySkills',toolProficienciesAnyOf:'qualifyTools',advantageToolsAnyOf:'advantageTools'};
    if(![...Object.keys(lists),'itemsAnyOf'].some(f=>Array.isArray(access[f])))continue;
    const key=professionKey(d.name);
    if(!PROFESSION_KEYS.includes(key))continue;
    const entry={qualifySkills:[],qualifyTools:[],advantageTools:[]};
    for(const [field,list] of Object.entries(lists))for(const name of Array.isArray(access[field])?access[field]:[]){
      const id=list==='qualifySkills'?skillIdOf(name):toolIdOf(name);
      if(id){if(!entry[list].includes(id))entry[list].push(id);}
      else unresolved.push({sourceId:d.sourceId??null,profession:professionTitle(key),field,name:String(name)});
    }
    // 0.20.0, additive: carried items (names or UUIDs, kept as written). Absent means the built-in items stay.
    if(Array.isArray(access.itemsAnyOf))entry.items=cleanItemList(access.itemsAnyOf);
    const sig=JSON.stringify(entry);
    if(seen.has(key)&&seen.get(key)!==sig){if(!conflicts.includes(key))conflicts.push(key);continue;}
    seen.set(key,sig);out[key]=entry;
  }
  for(const key of conflicts)delete out[key];
  return {catalog:out,unresolved,conflicts:conflicts.map(professionTitle)};
}

/** Professions with no qualifying skill, tool or item in this crosswalk: nobody can be proposed for them. */
export const unmappedProfessions=map=>PROFESSION_KEYS.filter(k=>!(map.qualifySkills[k]?.length||map.qualifyTools[k]?.length||map.items?.[k]?.length)).map(professionTitle);

const skillProficient=(actor,key)=>Number(actor?.system?.skills?.[key]?.value??0)>0;
/** [{key, profession, reason}] for each profession the character qualifies for, e.g. "Herbalism Kit + Nature → Herbalism"
 * or "Fishing Tackle (carried) → Fishing". */
export function qualifications(actor,map){
  const out=[];
  for(const key of PROFESSION_KEYS){
    const tools=(map.qualifyTools[key]??[]).filter(t=>toolProficient(actor,t)).map(toolLabel);
    const skills=(map.qualifySkills[key]??[]).filter(s=>skillProficient(actor,s)).map(skillLabel);
    const items=[...new Set((map.items?.[key]??[]).map(ref=>carriedItem(actor,ref)?.name).filter(Boolean))].map(n=>`${n} (carried)`);
    const why=[...tools,...skills,...items];
    if(why.length)out.push({key,profession:professionTitle(key),reason:`${why.join(' + ')} → ${professionTitle(key)}`});
  }
  return out;
}

/**
 * 0.20.0: the GM's baseline file ({professions:{<key or name>:{qualifySkills[],qualifyTools[],advantageTools[],items[]}}}).
 * Skills may be dnd5e ids ("nat") or names ("Nature"); tools dnd5e keys ("herb") or names ("Herbalism Kit"); items are
 * kept as written. A list left out of a profession is not set by the file. Unknown names are reported, not guessed;
 * any other field is ignored. Returns {ok, baseline, unresolved, unknownProfessions, errors}.
 */
export function parseBaselineFile(data){
  const errors=[],unresolved=[],unknownProfessions=[],baseline={};
  const profs=data&&typeof data==='object'&&!Array.isArray(data)?data.professions:null;
  if(!profs||typeof profs!=='object'||Array.isArray(profs))return {ok:false,baseline,unresolved,unknownProfessions,errors:['The file needs a "professions" object.']};
  for(const [name,row] of Object.entries(profs)){
    const key=professionKey(name);
    if(!PROFESSION_KEYS.includes(key)){unknownProfessions.push(String(name));continue;}
    if(!row||typeof row!=='object'||Array.isArray(row)){errors.push(`${name}: must be an object of lists.`);continue;}
    if(baseline[key]){errors.push(`${name}: ${professionTitle(key)} is listed twice.`);continue;}
    const entry={};
    for(const list of CROSSWALK_LISTS){
      if(row[list]===undefined)continue;
      if(!Array.isArray(row[list])||row[list].some(v=>typeof v!=='string')){errors.push(`${name}: ${list} must be a list of names.`);continue;}
      if(list==='items'){entry.items=cleanItemList(row.items);continue;}
      const ids=[];
      for(const v of row[list]){const tool=list==='qualifySkills'?null:toolIdOf(v),id=list==='qualifySkills'?skillIdOf(v):toolKeys().includes(tool)?tool:null;
        if(id){if(!ids.includes(id))ids.push(id);}else unresolved.push({profession:professionTitle(key),list,name:v});}
      entry[list]=ids;
    }
    baseline[key]=entry;
  }
  return {ok:!errors.length,baseline,unresolved,unknownProfessions,errors};
}

/** The rows a new baseline changes: [{key, profession, list, before, after, gmWins}] (before/after are the file layers). */
export function baselineChanges(oldBaseline,newBaseline,map){
  const rows=[];
  for(const key of PROFESSION_KEYS)for(const list of CROSSWALK_LISTS){
    const before=oldBaseline?.[key]?.[list]??null,after=newBaseline?.[key]?.[list]??null;
    if(JSON.stringify(before)===JSON.stringify(after))continue;
    rows.push({key,profession:professionTitle(key),list,before,after,gmWins:Boolean(map?.gm?.[list]?.[key])});
  }
  return rows;
}

/** The current table as a file the baseline import reads back: {schema, exportedAt, professions:{key:{...lists, checkTool, checkSkill}}}. */
export function exportCrosswalk(map,{exportedAt=new Date().toISOString(),version=''}={}){
  const professions={};
  for(const key of PROFESSION_KEYS)professions[key]={name:professionTitle(key),...Object.fromEntries(CROSSWALK_LISTS.map(l=>[l,[...(map[l]?.[key]??[])]])),
    checkTool:map.tools?.[key]||null,checkSkill:map.skills?.[key]||null,origin:{...(map.origin?.[key]??{})}};
  return {schema:'ag-ledger-crosswalk/1',module:'ashen-gate-profession-ledger',version,exportedAt,professions};
}

/**
 * The dry-run rows for some characters. `professionItems` maps a profession key to the imported world Profession
 * Items for it ([{sourceId, name, uuid}]); `heldKeys(actor)` / `heldIds(actor)` are the profession keys / PROF-* ids the
 * character already owns. Row status: 'propose' (missing; can be added), 'has' (already owned, never re-added),
 * 'no-item' (no imported Profession Item for it) or 'conflict' (several imported Items; the GM must pick one in Manager).
 */
export function assignmentPlan(actors,map,{professionItems,heldKeys,heldIds}){
  const rows=[];
  for(const actor of actors)for(const q of qualifications(actor,map)){
    const items=professionItems.get(q.key)??[],keys=heldKeys(actor),ids=heldIds(actor);
    const base={actorId:actor.id,actorName:actor.name,key:q.key,profession:q.profession,reason:q.reason};
    if(keys.has(q.key)||items.some(i=>ids.has(i.sourceId)))rows.push({...base,status:'has',sourceId:items.find(i=>ids.has(i.sourceId))?.sourceId??null});
    else if(!items.length)rows.push({...base,status:'no-item',sourceId:null});
    else if(items.length>1)rows.push({...base,status:'conflict',sourceId:null,candidates:items.map(i=>i.sourceId)});
    else rows.push({...base,status:'propose',sourceId:items[0].sourceId,itemName:items[0].name});
  }
  return rows;
}
export const rowId=row=>`${row.actorId}:${row.sourceId??row.key}`;
