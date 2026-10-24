/** Ashen Gate Profession Ledger: gathering node templates (0.25.0).
 * A node template is a reusable gathering spot owned by the Ledger: a permanent NODE-* id, a name, an activity, the
 * gathering profession(s), a tier range, an optional check skill/tool and DC, and material tables (common/rare/exotic)
 * that name MAT-* ids. It is not tied to any Location: the GM can roll on it from anywhere, and a Location may refer
 * to it by id. The schema is documented in docs/gathering-nodes-schema.md.
 * Pure rules: no Foundry globals. main.js reads and writes the GM-only store and enforces the GM gate.
 */
import {norm} from './core.mjs';
import {SKILL_IDS,SKILL_LABELS,professionKey} from './checks.mjs';
import {professionTitle} from './assign.mjs';
import {tierNumber} from './gathering.mjs';

export const NODE_SCHEMA='ag-gathering-nodes/1';
export const NODE_ID=/^NODE-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const MAT=/^MAT-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const TOOL_KEY=/^[a-z][a-z0-9]{0,39}$/i;
export const MAX_NODES=500;
export const MAX_TABLE=20;
const MAX_QTY=999;
/** Activities and the gathering profession each one uses by default. Keys are stored; labels are shown. */
export const ACTIVITIES=Object.freeze({
  mining:Object.freeze({label:'Mining',profession:'mining'}),
  herbalism:Object.freeze({label:'Herbalism',profession:'herbalism'}),
  hunting:Object.freeze({label:'Hunting',profession:'huntingskinning'}),
  fishing:Object.freeze({label:'Fishing',profession:'fishing'}),
  archaeology:Object.freeze({label:'Archaeology',profession:'archaeology'})});
export const ACTIVITY_KEYS=Object.freeze(Object.keys(ACTIVITIES));
/** Gathering profession keys (as checks.mjs professionKey gives them). */
export const NODE_PROFESSIONS=Object.freeze(['archaeology','fishing','herbalism','huntingskinning','mining']);
export const TABLES=Object.freeze(['common','rare','exotic']);
export const TABLE_LABELS=Object.freeze({common:'Common',rare:'Rare (success by 5+)',exotic:'Exotic'});

/** An activity key from a key, a label, or a gathering profession name ("Skinning & Harvesting" is hunting). '' when none. */
export function activityOf(value){
  const n=norm(value);
  if(!n)return '';
  const direct=ACTIVITY_KEYS.find(k=>k===n||norm(ACTIVITIES[k].label)===n);
  if(direct)return direct;
  const pk=professionKey(value);
  return ACTIVITY_KEYS.find(k=>ACTIVITIES[k].profession===pk)??'';
}
export const activityLabel=key=>ACTIVITIES[key]?.label??'';
/** A gathering profession key from a key, name or PROF-* id ("PROF-X-HUNTING-SKINNING"); null when it is not one. */
export function nodeProfession(value){
  const raw=String(value??'').trim();
  const direct=professionKey(raw);
  if(NODE_PROFESSIONS.includes(direct))return direct;
  if(/^PROF-[A-Z0-9-]+$/.test(raw)){
    const parts=raw.split('-').slice(1);
    for(let i=0;i<parts.length;i++){const k=professionKey(parts.slice(i).join(' '));if(NODE_PROFESSIONS.includes(k))return k;}
  }
  return null;
}
export const professionName=key=>professionTitle(key);
/** A dnd5e skill id from an id or label ("Nature"), else ''. */
const skillId=value=>{const t=String(value??'').trim();if(!t)return '';return SKILL_IDS.includes(t)?t:SKILL_IDS.find(k=>norm(SKILL_LABELS[k])===norm(t))??'';};
/** The text shown for a node's skill: a gathering profession by its display name (Hunting), a skill by its label, else as written. */
export function skillText(value){
  const raw=String(value??'').trim();
  if(!raw)return '';
  const pk=nodeProfession(raw);
  if(pk)return professionTitle(pk);
  const sk=skillId(raw);
  return sk?SKILL_LABELS[sk]:raw;
}

/** NODE-<SLUG> from a name, unique against `taken` (ids in use or retired). */
export function nodeIdFromName(name,taken=new Set()){
  const slug=String(name??'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40).replace(/-+$/,'')||'SPOT';
  const base=`NODE-${slug}`;
  if(!taken.has(base))return base;
  for(let n=2;;n++)if(!taken.has(`${base}-${n}`))return `${base}-${n}`;
}

const int=(v,lo,hi)=>{if(v===''||v==null||typeof v==='boolean')return null;const n=Number(v);return Number.isInteger(n)&&n>=lo&&n<=hi?n:null;};
const text=(v,max)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,max);

/** One common/rare table entry: {materialId, quantity, chance|null}. */
function tableEntry(raw,where,errors){
  const e=raw&&typeof raw==='object'?raw:{};
  const materialId=String(e.materialId??e.material_id??'').trim();
  if(!MAT.test(materialId)){errors.push(`${where}: a material is missing or not a valid material id.`);return null;}
  let quantity=1;
  if(e.quantity!==undefined&&e.quantity!==''){quantity=int(e.quantity,1,MAX_QTY);if(quantity==null){errors.push(`${where}: quantity must be a whole number 1–${MAX_QTY}.`);quantity=1;}}
  let chance=null;
  if(e.chance!==undefined&&e.chance!==''&&e.chance!==null){chance=int(e.chance,1,100);if(chance==null)errors.push(`${where}: chance must be a whole percent 1–100.`);}
  return {materialId,quantity,chance};
}
/** One exotic entry: {materialId, mode:'discovery'} or {materialId, mode:'designated', chance, condition}. */
function exoticEntry(raw,where,errors){
  const e=raw&&typeof raw==='object'?raw:{};
  const materialId=String(e.materialId??e.material_id??'').trim();
  if(!MAT.test(materialId)){errors.push(`${where}: a material is missing or not a valid material id.`);return null;}
  const mode=e.mode==null||e.mode===''?'discovery':String(e.mode);
  if(!['discovery','designated'].includes(mode)){errors.push(`${where}: mode must be "discovery" or "designated".`);return null;}
  if(mode==='discovery')return {materialId,mode};
  const chance=int(e.chance,1,100);
  if(chance==null)errors.push(`${where}: a designated Exotic needs a chance, a whole percent 1–100.`);
  const condition=e.condition==null||e.condition===''?'success':String(e.condition);
  if(!['success','rare'].includes(condition))errors.push(`${where}: condition must be "success" or "rare".`);
  return {materialId,mode,chance,condition:condition==='rare'?'rare':'success'};
}
/** Common/rare tables: one entry needs no chance; two or more each need one, adding up to 100. */
function checkTable(list,where,errors){
  if(list.length>1){
    if(list.some(e=>e.chance==null))errors.push(`${where}: with more than one material, every entry needs a chance (the chances add up to 100).`);
    else{const sum=list.reduce((n,e)=>n+e.chance,0);if(sum!==100)errors.push(`${where}: chances add up to ${sum}, not 100.`);}
  }
  const seen=new Set();
  for(const e of list){if(seen.has(e.materialId))errors.push(`${where}: the same material is listed twice.`);seen.add(e.materialId);}
}

/**
 * Checks and cleans one template. Returns {node, errors, warnings}: `node` is the stored shape (null when the id or
 * name is unusable). Errors block a save or an import; warnings are shown but do not.
 */
export function checkTemplate(raw,{where=''}={}){
  const errors=[],warnings=[];
  const r=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:null;
  if(!r)return {node:null,errors:[`${where||'Node'}: must be an object.`],warnings};
  const id=String(r.id??'').trim();
  const nameForMessages=text(r.name,80);
  const at=where||(nameForMessages?`“${nameForMessages}”`:'This node');
  if(!NODE_ID.test(id))errors.push(`${at}: the id must be a permanent id of capitals, digits and hyphens (leave it blank in the editor to make one from the name).`);
  const name=text(r.name,80);
  if(!name)errors.push(`${at}: name is required.`);
  const activity=activityOf(r.activity);
  if(!activity)errors.push(`${at}: activity ${JSON.stringify(r.activity??null)} must be one of ${ACTIVITY_KEYS.join(', ')}.`);
  let professions=[];
  if(r.professions!==undefined){
    if(!Array.isArray(r.professions))errors.push(`${at}: professions must be a list.`);
    else for(const p of r.professions){const k=nodeProfession(p);if(k){if(!professions.includes(k))professions.push(k);}else errors.push(`${at}: profession ${JSON.stringify(p)} is not a gathering profession (${NODE_PROFESSIONS.map(professionTitle).join(', ')}).`);}
  }
  if(!professions.length&&activity)professions=[ACTIVITIES[activity].profession];
  const tr=r.tier&&typeof r.tier==='object'?r.tier:{min:r.tier,max:r.tier};
  const min=tierNumber(tr.min),max=tierNumber(tr.max??tr.min);
  if(min==null||max==null)errors.push(`${at}: tier needs min and max, each 1–5 (or a tier name).`);
  else if(min>max)errors.push(`${at}: tier min ${min} is above max ${max}.`);
  const c=r.check&&typeof r.check==='object'?r.check:{};
  const skill=c.skill?skillId(c.skill):'';
  if(c.skill&&!skill)errors.push(`${at}: check.skill ${JSON.stringify(c.skill)} is not a dnd5e skill (e.g. "nat" or "Nature").`);
  const tool=c.tool?String(c.tool).trim():'';
  if(tool&&!TOOL_KEY.test(tool))errors.push(`${at}: check.tool ${JSON.stringify(c.tool)} must be a dnd5e tool key (e.g. "herb").`);
  let dc=null;
  if(r.dc!==undefined&&r.dc!==null&&r.dc!==''){dc=int(r.dc,1,40);if(dc==null)errors.push(`${at}: dc must be a whole number 1–40 (leave it out for the tier default).`);}
  for(const k of ['dcVisible','finite'])if(r[k]!==undefined&&typeof r[k]!=='boolean')errors.push(`${at}: ${k} must be true or false.`);
  const m=r.materials&&typeof r.materials==='object'&&!Array.isArray(r.materials)?r.materials:{};
  if(r.materials!==undefined&&m!==r.materials)errors.push(`${at}: materials must be an object {common, rare, exotic}.`);
  const materials={};
  for(const t of TABLES){
    const list=m[t]??[];
    if(!Array.isArray(list)){errors.push(`${at}: materials.${t} must be a list.`);materials[t]=[];continue;}
    if(list.length>MAX_TABLE)errors.push(`${at}: materials.${t} has more than ${MAX_TABLE} entries.`);
    materials[t]=list.slice(0,MAX_TABLE).map((e,i)=>(t==='exotic'?exoticEntry:tableEntry)(e,`${at} materials.${t}[${i}]`,errors)).filter(Boolean);
    if(t!=='exotic')checkTable(materials[t],`${at} materials.${t}`,errors);
    else{const seen=new Set();for(const e of materials[t]){if(seen.has(e.materialId))errors.push(`${at} materials.exotic: the same material is listed twice.`);seen.add(e.materialId);}}
  }
  if(!materials.common.length)warnings.push(`${at}: no common material, so the GM awards this node by hand.`);
  if(materials.rare.length&&!materials.common.length)errors.push(`${at}: a rare table needs a common table too.`);
  const note=text(r.note,500);
  if(!id||!NODE_ID.test(id)||!name)return {node:null,errors,warnings};
  const node={id,name,activity,professions,tier:{min:min??1,max:Math.max(max??min??1,min??1)},check:{skill,tool},dc,dcVisible:r.dcVisible===true,finite:r.finite!==false,
    materials,note};
  return {node,errors,warnings};
}

/** Stored metadata: where a template came from and whether the GM has edited it since (imports never overwrite an edit). */
function cleanMeta(raw){
  const m=raw&&typeof raw==='object'?raw:{};
  const legacy=(Array.isArray(m.legacy)?m.legacy:[]).filter(l=>l&&typeof l==='object'&&l.locationId).map(l=>({locationId:String(l.locationId),locationName:String(l.locationName??''),key:String(l.key??''),uuid:l.uuid?String(l.uuid):null}));
  return {origin:['gm','import','migration'].includes(m.origin)?m.origin:'gm',edited:m.edited===true,createdAt:Number(m.createdAt)||0,updatedAt:Number(m.updatedAt)||0,legacy};
}
/** A stored template, tolerant: anything checkTemplate cannot make a node of is dropped; warnings and errors stay readable. */
function storedTemplate(raw){
  const {node,errors}=checkTemplate(raw);
  if(!node)return null;
  return {...node,meta:cleanMeta(raw?.meta),problems:errors};
}

/**
 * The Ledger's GM-only node store. All arrays (Foundry merges flag objects on update, so a map could never lose a key):
 * nodes, retiredIds (deleted ids, never reused), migrated ([sourceKey, nodeId] for Location entries already copied),
 * migrations (one record per copy run, with a backup of the original Location entries), migrationVersion.
 */
export function normalizeStore(raw){
  const s=raw&&typeof raw==='object'?raw:{};
  const nodes=[],seen=new Set();
  for(const n of Array.isArray(s.nodes)?s.nodes:[]){const t=storedTemplate(n);if(t&&!seen.has(t.id)){seen.add(t.id);nodes.push(t);}}
  const retiredIds=[...new Set((Array.isArray(s.retiredIds)?s.retiredIds:[]).filter(id=>NODE_ID.test(String(id))&&!seen.has(id)))];
  const migrated=(Array.isArray(s.migrated)?s.migrated:[]).filter(p=>Array.isArray(p)&&typeof p[0]==='string'&&NODE_ID.test(String(p[1]))).map(p=>[p[0],p[1]]);
  const migrations=(Array.isArray(s.migrations)?s.migrations:[]).filter(m=>m&&typeof m==='object');
  return {schema:NODE_SCHEMA,nodes:nodes.sort((a,b)=>a.name.localeCompare(b.name)),retiredIds,migrated,migrations,migrationVersion:Number(s.migrationVersion)||0};
}
export const emptyStore=()=>normalizeStore({});
const takenIds=store=>new Set([...store.nodes.map(n=>n.id),...store.retiredIds]);
/** The plain template (no meta/problems), as a node file carries it. */
export function plainTemplate(t){
  const {meta,problems,...rest}=t;
  const out={id:rest.id,name:rest.name,activity:rest.activity,professions:[...rest.professions],tier:{...rest.tier}};
  if(rest.check.skill||rest.check.tool)out.check={...(rest.check.skill?{skill:rest.check.skill}:{}),...(rest.check.tool?{tool:rest.check.tool}:{})};
  if(rest.dc!=null)out.dc=rest.dc;
  out.dcVisible=rest.dcVisible;out.finite=rest.finite;
  out.materials=structuredClone(rest.materials);
  if(rest.note)out.note=rest.note;
  return out;
}
const sameTemplate=(a,b)=>JSON.stringify(plainTemplate(a))===JSON.stringify(plainTemplate(b));

/** GM editor save: add a new template (id must be unused, never a retired one) or update an existing one. Marks it edited. */
export function saveTemplate(store,raw,{isNew=false,now=Date.now()}={}){
  const {node,errors,warnings}=checkTemplate(raw);
  if(errors.length)return {ok:false,errors,warnings,store};
  const existing=store.nodes.find(n=>n.id===node.id);
  if(isNew&&existing)return {ok:false,errors:[`Another node, “${existing.name}”, already uses that id. Choose another id.`],warnings,store};
  if(isNew&&store.retiredIds.includes(node.id))return {ok:false,errors:[`That id belonged to a deleted node; ids are never reused. Choose another id.`],warnings,store};
  if(!isNew&&!existing)return {ok:false,errors:['That node no longer exists, so it cannot be updated.'],warnings,store};
  const meta=existing?{...existing.meta,edited:true,updatedAt:now}:{origin:'gm',edited:true,createdAt:now,updatedAt:now,legacy:[]};
  const next={...store,nodes:[...store.nodes.filter(n=>n.id!==node.id),{...node,meta,problems:[]}].sort((a,b)=>a.name.localeCompare(b.name))};
  return {ok:true,errors:[],warnings,store:next,node:next.nodes.find(n=>n.id===node.id)};
}
/** A copy with a new id (<ID>-COPY, -COPY-2, …) and "(copy)" in the name; it is the GM's own, with no Location history. */
export function duplicateTemplate(store,id,{now=Date.now()}={}){
  const src=store.nodes.find(n=>n.id===id);
  if(!src)throw Error('That gathering node no longer exists');
  const taken=takenIds(store);
  let copyId=`${id}-COPY`;
  for(let n=2;taken.has(copyId);n++)copyId=`${id}-COPY-${n}`;
  const copy={...structuredClone(src),id:copyId,name:`${src.name} (copy)`.slice(0,80),meta:{origin:'gm',edited:true,createdAt:now,updatedAt:now,legacy:[]},problems:[]};
  return {store:{...store,nodes:[...store.nodes,copy].sort((a,b)=>a.name.localeCompare(b.name))},node:copy};
}
/** Deletes a template; its id is retired (never reused). Location history links stay, so a copy run never re-creates it. */
export function removeTemplate(store,id){
  if(!store.nodes.some(n=>n.id===id))throw Error('That gathering node no longer exists');
  return {...store,nodes:store.nodes.filter(n=>n.id!==id),retiredIds:[...new Set([...store.retiredIds,id])]};
}

/** A Location entry's template reference (future Locations), or null. */
export const entryNodeId=entry=>{const v=entry?.nodeId??entry?.templateId;return NODE_ID.test(String(v??''))?String(v):null;};
/**
 * Where a template is used: Location entries that refer to it by id ('reference'), and Location entries it was copied
 * from ('copied-from', their own data still lives in Locations). `locations`: [{id, name, resources:[entries]}].
 */
export function templateReferences(id,{locations=[],store=emptyStore()}={}){
  const out=[];
  for(const loc of locations)for(const e of loc.resources??[])
    if(entryNodeId(e)===id)out.push({locationId:loc.id,locationName:String(loc.name??loc.id),key:String(e.id??e.key??''),kind:'reference'});
  const names=new Map(locations.map(l=>[l.id,String(l.name??l.id)]));
  for(const [sourceKey,nodeId] of store.migrated){
    if(nodeId!==id)continue;
    const [locationId,key]=sourceKey.split('|');
    if(out.some(r=>r.locationId===locationId&&r.key===key))continue;
    const legacy=store.nodes.find(n=>n.id===id)?.meta.legacy.find(l=>l.locationId===locationId&&l.key===key);
    out.push({locationId,locationName:names.get(locationId)??legacy?.locationName??locationId,key,kind:'copied-from'});
  }
  return out;
}

/** The raw node (gathering.mjs normalizeNode input) for rolling on a template at one tier of its range. */
export function templateNode(t,{tier=null,id=null}={}){
  const want=tierNumber(tier);
  const at=want!=null&&want>=t.tier.min&&want<=t.tier.max?want:t.tier.min;
  const common=t.materials.common,rare=t.materials.rare;
  return {id:id??t.id,templateId:t.id,label:t.name,skill:t.professions.length||t.activity?professionTitle(t.professions[0]??ACTIVITIES[t.activity].profession):t.check.skill,professions:[...t.professions],
    checkSkill:t.check.skill,checkTool:t.check.tool,tier:at,dc:t.dc??'',dcVisible:t.dcVisible,
    materialId:common[0]?.materialId??'',quantity:common[0]?.quantity??1,rareMaterialId:rare[0]?.materialId??'',rareQuantity:rare[0]?.quantity??1,
    tables:{common:structuredClone(common),rare:structuredClone(rare)},exotics:structuredClone(t.materials.exotic),finite:t.finite,note:t.note};
}
/**
 * A Location entry that refers to a template ({nodeId, tier?, label?, dc?, dcVisible?, finite?, exhausted, available, visible, note?}):
 * the template gives the check and the materials; the entry gives its place-specific fields and play state. A reference
 * to a deleted template keeps the entry (nothing to gather, with a reason) instead of breaking the Location.
 */
export function resolveEntry(entry,templateOf){
  const id=entryNodeId(entry);
  if(!id)return entry;
  const t=templateOf(id);
  if(!t)return {...entry,templateId:id,missingTemplate:id,materialId:'',rareMaterialId:'',exotics:[],
    note:'The gathering node this place uses no longer exists: pick another node for it in Locations.'};
  const base=templateNode(t,{tier:entry.tier,id:entry.id??entry.key});
  const own=k=>entry[k]!==undefined&&entry[k]!==null&&entry[k]!=='';
  return {...base,...(own('label')?{label:entry.label}:{}),...(own('dc')?{dc:entry.dc}:{}),...(own('dcVisible')?{dcVisible:entry.dcVisible}:{}),
    ...(own('finite')?{finite:entry.finite}:{}),...(own('note')?{note:entry.note}:{}),
    exhausted:entry.exhausted===true,available:entry.available!==false,visible:entry.visible!==false};
}
/** What a Location may publish to players about a referenced template: no materials' chances, no Exotics, no DC unless shown. */
export function templatePlayerView(t,{tier=null}={}){
  const n=templateNode(t,{tier});
  return {nodeId:t.id,label:n.label,skill:n.skill,activity:t.activity,tier:n.tier,...(t.dcVisible&&t.dc!=null?{dc:t.dc}:{}),
    materialId:n.materialId,quantity:n.quantity,rareMaterialId:n.rareMaterialId,rareQuantity:n.rareQuantity,finite:t.finite};
}

/* ---- Node files (import/export) ---- */
/** Reads a node file {schema:'ag-gathering-nodes/1', nodes:[…]}. Returns {nodes, errors, warnings}; any error rejects the file. */
export function parseNodeFile(data){
  const errors=[],warnings=[];
  if(!data||typeof data!=='object'||Array.isArray(data))return {nodes:[],errors:['A node file is a JSON object {"schema":"ag-gathering-nodes/1","nodes":[…]}.'],warnings};
  if(data.schema!==NODE_SCHEMA)errors.push(`schema must be "${NODE_SCHEMA}" (found ${JSON.stringify(data.schema??null)}).`);
  if(!Array.isArray(data.nodes))return {nodes:[],errors:[...errors,'The file needs a "nodes" list.'],warnings};
  if(data.nodes.length>MAX_NODES)errors.push(`At most ${MAX_NODES} nodes in one file.`);
  const nodes=[],seen=new Set();
  data.nodes.forEach((raw,i)=>{
    const r=checkTemplate(raw,{where:`nodes[${i}]${raw?.name?` “${text(raw.name,80)}”`:''}`});
    errors.push(...r.errors);warnings.push(...r.warnings);
    if(r.node){if(seen.has(r.node.id))errors.push(`“${r.node.name}”: its id is used twice in this file.`);seen.add(r.node.id);nodes.push(r.node);}
  });
  return {nodes,errors,warnings};
}
/**
 * What importing a node file would do. Nothing is written. New ids are added; an existing template the GM has not edited
 * is updated; one the GM edited is kept as it is (reported); a retired id is skipped (ids are never reused).
 */
export function planNodeImport(store,data){
  const parsed=parseNodeFile(data);
  const plan={ok:!parsed.errors.length,errors:parsed.errors,warnings:parsed.warnings,add:[],update:[],keep:[],unchanged:[],retired:[]};
  if(!plan.ok)return plan;
  for(const n of parsed.nodes){
    const cur=store.nodes.find(x=>x.id===n.id);
    if(store.retiredIds.includes(n.id))plan.retired.push(n);
    else if(!cur)plan.add.push(n);
    else if(sameTemplate(cur,n))plan.unchanged.push(n);
    else if(cur.meta.edited)plan.keep.push(n);
    else plan.update.push(n);
  }
  return plan;
}
/** Applies a plan from planNodeImport. Never removes a template; never overwrites a GM edit. */
export function applyNodeImport(store,plan,{now=Date.now()}={}){
  if(!plan?.ok)throw Error(plan?.errors?.[0]??'Nothing to import');
  const byId=new Map(store.nodes.map(n=>[n.id,n]));
  for(const n of plan.add)byId.set(n.id,{...n,meta:{origin:'import',edited:false,createdAt:now,updatedAt:now,legacy:[]},problems:[]});
  for(const n of plan.update){const cur=byId.get(n.id);byId.set(n.id,{...n,meta:{...cur.meta,updatedAt:now},problems:[]});}
  return {...store,nodes:[...byId.values()].sort((a,b)=>a.name.localeCompare(b.name))};
}
/** The store's templates as a node file. */
export function exportNodes(store,{now=new Date()}={}){
  return {schema:NODE_SCHEMA,exportedAt:now.toISOString(),nodes:store.nodes.map(plainTemplate)};
}

/* ---- Copying Location nodes into templates (0.25.0 migration) ---- */
const sourceKeyOf=(locationId,entry)=>`${locationId}|${String(entry?.id??entry?.key??'')}`;
/** The template a Location gathering entry (Locations 1.x GM shape) describes; play state (exhausted, available, visible) stays in Locations. */
function templateFromEntry(e,{id,name}){
  const tier=tierNumber(e.tier)??1;
  const activity=activityOf(e.skill);
  const sk=activity?'':skillId(e.skill);
  const dc=int(e.dc,1,40);
  const common=MAT.test(e.materialId??'')?[{materialId:e.materialId,quantity:int(e.quantity,1,MAX_QTY)??1,chance:null}]:[];
  const rare=common.length&&MAT.test(e.rareMaterialId??'')?[{materialId:e.rareMaterialId,quantity:int(e.rareQuantity,1,MAX_QTY)??1,chance:null}]:[];
  const exotic=(Array.isArray(e.exotics)?e.exotics:[]).map(x=>exoticEntry(x,'',[])).filter(Boolean);
  // A skill Locations stored that is neither a gathering profession nor a dnd5e skill is kept in the note, never lost.
  const unknownSkill=String(e.skill??'').trim()&&!activity&&!sk?`Skill in Locations: ${String(e.skill).trim()}.`:'';
  return {id,name,activity,professions:activity?[ACTIVITIES[activity].profession]:[],tier:{min:tier,max:tier},check:{skill:sk,tool:''},dc,
    dcVisible:e.dcVisible===true,finite:e.finite!==false,materials:{common,rare,exotic},note:text([e.note,unknownSkill].filter(Boolean).join(' '),500)};
}
/** The template fields that identify "the same node" (two identical Location entries become one template). */
const shapeKey=t=>JSON.stringify({...plainTemplate({...t,id:'',name:t.name}),id:''});
/**
 * Copies every Location gathering entry that has not been copied before into a template. Re-runnable: an entry already
 * copied (even if its template was later deleted) and an entry that already refers to a template are skipped. Locations
 * records are never changed. Returns {store, created:[ids], linked, skipped, backup}. `locations`: GM records
 * [{id, name, resources:[entries]}].
 */
export function migrateLocationNodes(store,locations,{now=Date.now(),by='',locationsVersion=''}={}){
  const done=new Set(store.migrated.map(p=>p[0]));
  const taken=takenIds(store);
  const nodes=[...store.nodes],migrated=[...store.migrated],created=[],backup=[];
  const byShape=new Map(nodes.filter(n=>n.meta.origin==='migration'&&!n.meta.edited).map(n=>[shapeKey(n),n]));
  let linked=0,skipped=0;
  for(const loc of Array.isArray(locations)?locations:[]){
    for(const e of Array.isArray(loc?.resources)?loc.resources:[]){
      if(!e||typeof e!=='object')continue;
      const key=sourceKeyOf(loc.id,e);
      if(done.has(key)||entryNodeId(e)){skipped++;continue;}
      const legacy={locationId:String(loc.id),locationName:String(loc.name??loc.id),key:String(e.id??e.key??''),uuid:e.uuid?String(e.uuid):null};
      const name=text(e.label,80)||text(e.materialId,80)||'Gathering spot';
      // Keep an id the entry already has when it is a NODE-* id; otherwise one from its name.
      const ownId=NODE_ID.test(String(e.id??''))&&!taken.has(e.id)?e.id:null;
      const draft=templateFromEntry(e,{id:ownId??nodeIdFromName(name,taken),name});
      backup.push({...legacy,entry:structuredClone(e)});
      const same=!ownId?byShape.get(shapeKey(draft)):null;
      if(same){same.meta={...same.meta,legacy:[...same.meta.legacy,legacy]};migrated.push([key,same.id]);done.add(key);linked++;continue;}
      const t={...draft,meta:{origin:'migration',edited:false,createdAt:now,updatedAt:now,legacy:[legacy]},
        problems:draft.activity?[]:[`“${draft.name}”: no activity (the Location skill was not a gathering profession): set one in the editor.`]};
      taken.add(t.id);nodes.push(t);byShape.set(shapeKey(t),t);migrated.push([key,t.id]);done.add(key);created.push(t.id);
    }
  }
  const record=created.length||linked?{at:now,by:String(by),locationsVersion:String(locationsVersion),created:[...created],linked,backup}:null;
  // Stored as-is: templateFromEntry may leave activity empty (kept with a problem note, not dropped).
  const next={...store,nodes:nodes.sort((a,b)=>a.name.localeCompare(b.name)),migrated,migrations:record?[...store.migrations,record]:store.migrations,migrationVersion:Math.max(1,store.migrationVersion)};
  return {store:next,created,linked,skipped,backup};
}
