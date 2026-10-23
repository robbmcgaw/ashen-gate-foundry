/** Ashen Gate Profession Ledger: profession assignment (0.16.0, AG-F01).
 * Which professions a character qualifies for from their dnd5e skill and tool PROFICIENCIES (never class), or (0.20.0)
 * from carrying a qualifying core item (legacy `items` lists only since 0.22.0), using the crosswalk from effectiveMapping, and which
 * imported PROF-* Profession Items they still lack.
 * Pure rules; main.js reads Foundry, enforces the GM gate and creates the Items.
 */
import {PROFESSION_NAMES,norm} from './core.mjs';
import {SKILL_IDS,SKILL_LABELS,professionKey,requiredToolRef,toolLabel,skillLabel,carriedItem,cleanItemList,CROSSWALK_LISTS,ITEM_LISTS,toolKeys,
  toolGroupOf,toolProficiencyMatches} from './checks.mjs';
import {allProfessions,noteProfession,PROFESSION_CATEGORIES} from './professions.mjs';

/** The built-in professions' keys (the 14 originals, then Artistry). */
export const PROFESSION_KEYS=Object.freeze(PROFESSION_NAMES.map(professionKey));
/** 0.28.0: every profession the crosswalk covers: the built-ins plus imported creative professions (registry extras). */
export const allProfessionKeys=()=>[...new Set([...PROFESSION_KEYS,...allProfessions().map(p=>p.key)])];
/** 0.22.0: shown names. Keys, ids and stored names never change; "Hunting" still matches huntingskinning (see professionKey). */
const PROFESSION_DISPLAY_NAMES=Object.freeze({huntingskinning:'Hunting'});
export const professionTitle=key=>PROFESSION_DISPLAY_NAMES[key]??allProfessions().find(p=>professionKey(p.name)===key)?.name??key;

/** A catalog skill name ("Nature") as a dnd5e skill id, or null. No aliases are guessed. */
const skillIdOf=name=>{const t=String(name??'').trim();if(SKILL_IDS.includes(t))return t;return SKILL_IDS.find(k=>norm(SKILL_LABELS[k])===norm(t))??null;};
/** 0.22.1: a tool name or key as a dnd5e tool key, only when dnd5e (or the built-in list) has that tool; else null. */
const toolIdOf=name=>{const group=toolGroupOf(name);if(group)return group;const key=requiredToolRef(name)?.key??null;return key&&toolKeys().includes(key)?key:null;};
/** 0.22.1: the profession a PROF-* definition is for, the same for the catalog and Assign: from the PROF id first
 * (PROF-TG-HERBALISM → herbalism), else from its name. Null when neither names a profession. */
export function definitionProfessionKey(sourceId,name,category=null){
  const id=String(sourceId??''),keys=allProfessionKeys();
  if(/^PROF-[A-Z0-9-]+$/.test(id)){const parts=id.split('-').slice(1);
    for(let i=0;i<parts.length;i++){const k=professionKey(parts.slice(i).join(' '));if(keys.includes(k))return k;}}
  const named=professionKey(name);
  if(keys.includes(named))return named;
  // 0.28.0: a new profession imported with category `creative` joins the registry by its name.
  return PROFESSION_CATEGORIES.includes(category)?noteProfession({name,category}):null;
}

/**
 * Catalog layer of the crosswalk, from imported Profession definitions [{sourceId, name, access}].
 * Only a definition whose `access` names at least one any-of list counts; an empty `access` ({}) leaves the
 * built-in default in place, and so does (0.29.1) any list the definition leaves out; an explicit [] means "none". Names that match no dnd5e skill/tool are reported in `unresolved`, not guessed.
 * Two definitions for one profession that disagree are reported in `conflicts` and neither is used.
 */
export function catalogCrosswalk(definitions=[]){
  const out={},unresolved=[],conflicts=[],seen=new Map();
  for(const d of definitions){
    const access=d?.access;
    if(!access||typeof access!=='object')continue;
    const lists={skillProficienciesAnyOf:'qualifySkills',toolProficienciesAnyOf:'qualifyTools',advantageToolsAnyOf:'advantageTools'};
    if(![...Object.keys(lists),'itemsAnyOf'].some(f=>Array.isArray(access[f])))continue;
    const key=d.key??definitionProfessionKey(d.sourceId,d.name,d.category);
    if(!key)continue;
    // 0.29.1: only a list the content actually gives (an array, [] included) is set. A list it leaves out sets nothing,
    // so the built-in default stays (Archaeology's advantage tool when a record has access lists but no advantage field).
    const entry={};
    for(const [field,list] of Object.entries(lists)){
      if(!Array.isArray(access[field]))continue;
      entry[list]=[];
      for(const name of access[field]){
        const id=list==='qualifySkills'?skillIdOf(name):toolIdOf(name);
        if(id){if(!entry[list].includes(id))entry[list].push(id);}
        else unresolved.push({sourceId:d.sourceId??null,profession:professionTitle(key),field,name:String(name)});
      }
    }
    // 0.27.0: advantage names that ALL match no dnd5e tool set nothing (they are still reported), so the built-in
    // default applies (Archaeology). Access lists are unchanged.
    const advNames=Array.isArray(access.advantageToolsAnyOf)?access.advantageToolsAnyOf:[];
    if(advNames.length&&!entry.advantageTools?.length)delete entry.advantageTools;
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
export const unmappedProfessions=map=>allProfessionKeys().filter(k=>!(map.qualifySkills[k]?.length||map.qualifyTools[k]?.length||map.items?.[k]?.length)).map(professionTitle);

const skillProficient=(actor,key)=>Number(actor?.system?.skills?.[key]?.value??0)>0;
/** [{key, profession, reason}] for each profession the character qualifies for, e.g. "Herbalism Kit + Nature → Herbalism"
 * or, from a legacy items list, "Fishing Tackle (carried) → Fishing". */
export function qualifications(actor,map){
  const out=[];
  for(const key of allProfessionKeys()){
    // 0.28.0: a tool group (Any musical instrument) is named by the instrument that matched, e.g. "Lute".
    const tools=[...new Set((map.qualifyTools[key]??[]).map(t=>toolProficiencyMatches(actor,t)[0]).filter(Boolean).map(toolLabel))];
    const skills=(map.qualifySkills[key]??[]).filter(s=>skillProficient(actor,s)).map(skillLabel);
    const items=[...new Set((map.items?.[key]??[]).map(ref=>carriedItem(actor,ref)?.name).filter(Boolean))].map(n=>`${n} (carried)`);
    const why=[...tools,...skills,...items];
    if(why.length)out.push({key,profession:professionTitle(key),reason:`${why.join(' + ')} → ${professionTitle(key)}`});
  }
  return out;
}

/**
 * 0.28.0: does a character meet an access list ({toolProficienciesAnyOf?, skillProficienciesAnyOf?}, names as in content)?
 * Same resolution as the crosswalk: tool names or dnd5e keys, tool groups ("Any musical instrument") and skill names or ids;
 * proficiency only (nothing carried counts). Any one entry is enough. Returns {ok, matched}: `matched` lists the entries
 * that matched, as written. An access list naming nothing is met ({ok:true, matched:[]}); names that match no dnd5e tool
 * or skill never match.
 */
export function meetsAccess(actor,access){
  const list=v=>Array.isArray(v)?v.filter(x=>typeof x==='string'&&x.trim()).slice(0,50):[];
  const tools=list(access?.toolProficienciesAnyOf),skills=list(access?.skillProficienciesAnyOf);
  const matched=[...tools.filter(n=>{const id=toolIdOf(n);return Boolean(id&&toolProficiencyMatches(actor,id).length);}),
    ...skills.filter(n=>{const id=skillIdOf(n);return Boolean(id&&skillProficient(actor,id));})];
  return {ok:!tools.length&&!skills.length?true:matched.length>0,matched};
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
    if(!allProfessionKeys().includes(key)){unknownProfessions.push(String(name));continue;}
    if(!row||typeof row!=='object'||Array.isArray(row)){errors.push(`${name}: must be an object of lists.`);continue;}
    if(baseline[key]){errors.push(`${name}: ${professionTitle(key)} is listed twice.`);continue;}
    const entry={};
    for(const list of CROSSWALK_LISTS){
      if(row[list]===undefined)continue;
      if(!Array.isArray(row[list])||row[list].some(v=>typeof v!=='string')){errors.push(`${name}: ${list} must be a list of names.`);continue;}
      if(ITEM_LISTS.includes(list)){entry[list]=cleanItemList(row[list]);continue;}
      const ids=[];
      for(const v of row[list]){const id=list==='qualifySkills'?skillIdOf(v):toolIdOf(v);
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
  for(const key of allProfessionKeys())for(const list of CROSSWALK_LISTS){
    const before=oldBaseline?.[key]?.[list]??null,after=newBaseline?.[key]?.[list]??null;
    if(JSON.stringify(before)===JSON.stringify(after))continue;
    rows.push({key,profession:professionTitle(key),list,before,after,gmWins:Boolean(map?.gm?.[list]?.[key])});
  }
  return rows;
}

/** The current table as a file the baseline import reads back: {schema, exportedAt, professions:{key:{...lists, checkTool, checkSkill, origin, inEffect}}}.
 * 0.22.1: only lists the GM or the baseline file set are written as lists (overrides), so a re-import never turns built-in
 * or catalog values (catalog advantage tools above all) into baseline ones. `inEffect` shows the whole table; import ignores it.
 * 0.22.0: the legacy `items` list is written only when a profession has one. */
export function exportCrosswalk(map,{exportedAt=new Date().toISOString(),version=''}={}){
  const professions={};
  for(const key of allProfessionKeys()){const origin={...(map.origin?.[key]??{})},shown=CROSSWALK_LISTS.filter(l=>l!=='items'||map.items?.[key]?.length);
    professions[key]={name:professionTitle(key),...Object.fromEntries(shown.filter(l=>origin[l]==='gm'||origin[l]==='baseline').map(l=>[l,[...(map[l]?.[key]??[])]])),
      checkTool:map.tools?.[key]||null,checkSkill:map.skills?.[key]||null,origin,inEffect:Object.fromEntries(shown.map(l=>[l,[...(map[l]?.[key]??[])]]))};}
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

/** 0.30.0: a recipe record marked `starting: true` (the content's starting recipes). */
export const isStartingRecipe=recipe=>recipe?.starting===true;
/** 0.30.0: the profession key a recipe belongs to (its PROF-* id first, then its profession name), or null. */
export const recipeProfessionKey=recipe=>definitionProfessionKey(recipe?.professionId,recipe?.profession)??(professionKey(recipe?.profession)||null);
/**
 * 0.30.0: the dry-run rows for granting starting recipes. For each character, every `starting: true` recipe of a
 * profession it holds (by PROF-* id or profession key). `heldProfessions(actor)` → {ids:Set, keys:Set};
 * `known(actor)` → the REC-* ids it knows; `unreleased(recipe)` → '' when players may have it, else why not.
 * Row status: 'new' (will be granted), 'known' (already known, skipped) or 'unreleased' (draft or not player-visible,
 * skipped; `reason` says why). Rows come in recipe-name order per character. Pure: reads nothing, writes nothing.
 */
export function startingRecipePlan(actors,recipes,{heldProfessions,known,unreleased}){
  const starting=recipes.filter(r=>isStartingRecipe(r)&&/^REC-[A-Z0-9-]+$/.test(r?.id??'')).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  const rows=[];
  for(const actor of actors){
    const held=heldProfessions(actor),knows=new Set(known(actor)),seen=new Set();
    for(const r of starting){
      const key=recipeProfessionKey(r);
      if(seen.has(r.id)||!(held.ids.has(r.professionId)||(key&&held.keys.has(key))))continue;
      seen.add(r.id);
      const base={id:`${actor.id}:${r.id}`,actorId:actor.id,actorName:actor.name,recipeId:r.id,recipeName:r.name,professionKey:key};
      if(knows.has(r.id))rows.push({...base,status:'known',reason:''});
      else{const why=unreleased(r);rows.push({...base,status:why?'unreleased':'new',reason:why||''});}
    }
  }
  return rows;
}
