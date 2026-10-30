/** Ashen Gate Profession Ledger: which materials a gathering node may reward (0.42.0). No Foundry globals are read here.
 * A node template names MAT-* materials in its Common, Rare and Exotic tables. A material is only rewarded when it is RELEASED:
 * imported in this world, Manager status `approved` and `player` visibility (state `ok`, or `not-visible`, which is approved and
 * player-visible but whose world Item is not readable by every player: the copy a character receives needs no world Item). Everything
 * else is dropped from the pool at roll time instead of blocking the gather or being rolled. main.js supplies `stateOf(id)` →
 * {state, status} (its materialState); these helpers do the arithmetic and the wording.
 * States: ok, not-visible (released) · draft, gm-only (imported, unreleased: the GM can release them) · missing (not imported) ·
 * duplicate, retired (imported but unusable until fixed in General Manager).
 */
export const TABLE_ORDER=Object.freeze(['common','rare','exotic']);
const LABEL=Object.freeze({common:'Common',rare:'Rare',exotic:'Exotic'});
export const isReleasedState=state=>state==='ok'||state==='not-visible';
/** States the GM can release from the Ledger: the material exists once and only its status or visibility holds it back. */
export const isReleasableState=state=>state==='draft'||state==='gm-only';

/** MAT-* ids of a stored template, per table, in table order: {common:[id], rare:[id], exotic:[id]}. */
export function templateMaterialTables(t){
  const out={};
  for(const k of TABLE_ORDER)out[k]=[...new Set((t?.materials?.[k]??[]).map(e=>e?.materialId).filter(Boolean))];
  return out;
}
/** Every distinct MAT-* a template names, in table order. */
export const templateMaterialIds=t=>[...new Set(TABLE_ORDER.flatMap(k=>templateMaterialTables(t)[k]))];

/**
 * What is wrong with the materials of one template (or of the tables in an editor draft, same shape).
 * `stateOf(id)` → {state, status}; `nameOf(id)` → display name. Returns
 * {total, released, unreleased:[{id,name,state,status,tables}], missing:[...], stuck:[...], releasable:[id], emptyTables:[kind], ok}
 * where `emptyTables` lists the tables that name materials but have none released (a success there rewards nothing),
 * `stuck` are duplicate/retired ones the Ledger cannot release, and `ok` means nothing needs attention.
 */
export function auditMaterials(tables,stateOf,nameOf=id=>id){
  const unreleased=[],missing=[],stuck=[],seen=new Map();
  let released=0;
  const note=(id,kind)=>{const s=stateOf(id)??{state:'missing',status:''};
    const row=seen.get(id)??{id,name:nameOf(id),state:s.state,status:s.status??'',tables:[]};
    row.tables.push(kind);
    if(!seen.has(id)){seen.set(id,row);
      if(isReleasedState(s.state))released++;
      else if(s.state==='missing')missing.push(row);
      else if(isReleasableState(s.state))unreleased.push(row);
      else stuck.push(row);}
    return s;};
  const emptyTables=[];
  for(const kind of TABLE_ORDER){
    const ids=tables?.[kind]??[];
    if(!ids.length)continue;
    let any=false;
    for(const id of ids){if(isReleasedState(note(id,kind).state))any=true;}
    if(!any)emptyTables.push(kind);
  }
  return {total:seen.size,released,unreleased,missing,stuck,releasable:unreleased.map(r=>r.id),emptyTables,
    ok:!unreleased.length&&!missing.length&&!stuck.length};
}
const list=rows=>rows.map(r=>`${r.name} (${[...new Set(r.tables)].map(k=>LABEL[k]).join(', ')})`).join(', ');
/** The GM-facing warning for a node's materials, or '' when there is nothing to say. Names, never raw ids. */
export function auditWarning(audit){
  if(!audit||audit.ok)return '';
  const parts=[];
  if(audit.unreleased.length)parts.push(`Unreleased: ${list(audit.unreleased)}.`);
  if(audit.missing.length)parts.push(`Not imported: ${list(audit.missing)}.`);
  if(audit.stuck.length)parts.push(`Needs fixing in General Manager (imported twice, or retired): ${list(audit.stuck)}.`);
  parts.push('They are left out when this node is rolled.');
  if(audit.emptyTables.length)parts.push(`Nothing can be rewarded from the ${audit.emptyTables.map(k=>LABEL[k]).join(' and ')} table${audit.emptyTables.length>1?'s':''} until a material there is released.`);
  return parts.join(' ');
}

/**
 * Drops the entries `keep(materialId)` rejects from a Common or Rare table and re-normalises the chances.
 * One entry left: it needs no chance. Several left and every chance a whole percent: each chance is scaled by 100 / (sum of the
 * remaining chances) and rounded by largest remainder so they add up to exactly 100 again (70/30 with the 30 dropped is just
 * the 70; 50/30/20 with the 20 dropped becomes 63/37). Entries without chances (older Location nodes) stay equally likely.
 * Returns {table, dropped:[id], scaled:bool, changes:[{materialId, from, to}]}. The input is not changed.
 */
export function scaleTable(table,keep){
  const all=(table??[]).map(e=>({...e}));
  const kept=all.filter(e=>keep(e.materialId)),dropped=all.filter(e=>!keep(e.materialId)).map(e=>e.materialId);
  if(!dropped.length||!kept.length)return {table:kept,dropped,scaled:false,changes:[]};
  if(kept.length===1)return {table:[{...kept[0],chance:null}],dropped,scaled:false,changes:[]};
  const chances=kept.map(e=>Number(e.chance));
  if(!chances.every(c=>Number.isFinite(c)&&c>0))return {table:kept,dropped,scaled:false,changes:[]};
  const sum=chances.reduce((n,c)=>n+c,0);
  const exact=chances.map(c=>c*100/sum),floor=exact.map(Math.floor);
  let left=100-floor.reduce((n,c)=>n+c,0);
  [...exact.keys()].sort((a,b)=>(exact[b]-floor[b])-(exact[a]-floor[a])||a-b).forEach(i=>{if(left>0){floor[i]++;left--;}});
  const next=kept.map((e,i)=>({...e,chance:floor[i]}));
  const changes=next.map((e,i)=>({materialId:e.materialId,from:chances[i],to:e.chance})).filter(c=>c.from!==c.to);
  return {table:next,dropped,scaled:changes.length>0,changes};
}

/** A GM note (one line) about what a roll left out, or ''. `scales` = [{kind, dropped:[id], changes:[…]}]; `nameOf(id)`. */
export function poolNote(title,scales,nameOf=id=>id){
  const parts=[];
  for(const s of scales){
    if(!s?.dropped?.length)continue;
    const names=[...new Set(s.dropped.map(nameOf))].join(', ');
    const how=s.changes?.length?` The remaining chances were scaled up in proportion so they add up to 100 (${s.changes.map(c=>`${nameOf(c.materialId)} ${c.from}% to ${c.to}%`).join(', ')}).`:'';
    parts.push(`${LABEL[s.kind]} left out (unreleased or not imported): ${names}.${how}`);
  }
  return parts.length?`${title}: ${parts.join(' ')}`:'';
}
/** The GM message for a tier that has nothing releasable left. Not an error: the gather goes on and that success rewards nothing. */
export const emptyPoolMessage=(title,kind,names=[])=>
  `${title}: every ${LABEL[kind]} material this node lists is unreleased or not imported${names.length?` (${names.join(', ')})`:''}, so nothing was rewarded for it. Use Release materials… on the node in Gathering Nodes, then gather again.`;

/**
 * What Release materials… would do for a set of ids: only materials imported once whose status or visibility holds them back.
 * Returns {release:[{id,name,state,status}], alreadyReleased:n, missing:[name], stuck:[name]}.
 */
export function releasePlan(ids,stateOf,nameOf=id=>id){
  const plan={release:[],alreadyReleased:0,missing:[],stuck:[]};
  for(const id of [...new Set(ids??[])]){
    const s=stateOf(id)??{state:'missing',status:''};
    if(isReleasedState(s.state))plan.alreadyReleased++;
    else if(s.state==='missing')plan.missing.push(nameOf(id));
    else if(isReleasableState(s.state))plan.release.push({id,name:nameOf(id),state:s.state,status:s.status??''});
    else plan.stuck.push(nameOf(id));
  }
  return plan;
}
/** The words on the confirm dialog: names the count, what changes and what does not. */
export function releaseConfirmText(plan){
  const n=plan.release.length,why=r=>r.state==='draft'?`draft${r.status&&r.status!=='draft'?`, ${r.status}`:''}`:'not player-visible';
  const names=plan.release.slice(0,12).map(r=>`${r.name} (${why(r)})`).join(', ')+(n>12?`, and ${n-12} more`:'');
  return `${names}\nEach one is set to approved and player-visible in this world, so a gather can reward it. Nothing is given to anyone, and ownership is not changed. A later General Manager import of a record that is still draft in its pack sets it back.${plan.missing.length?`\nNot imported, so not released: ${plan.missing.join(', ')}.`:''}${plan.stuck.length?`\nImported twice or retired, so not released: ${plan.stuck.join(', ')}.`:''}`;
}

/**
 * The import/validate report lines for node files (informational, never errors): which materials the nodes name that this world
 * does not know yet (not imported), and which are imported but unreleased. `nodes` are parsed templates.
 * Returns {lines:[string], missing:[id], unreleased:[id], perNode:[{id,name,missing,unreleased}]}.
 */
export function importReport(nodes,stateOf,nameOf=id=>id){
  const perNode=[],missing=new Set(),unreleased=new Set();
  for(const n of nodes??[]){
    const a=auditMaterials(templateMaterialTables(n),stateOf,nameOf);
    a.missing.forEach(r=>missing.add(r.id));[...a.unreleased,...a.stuck].forEach(r=>unreleased.add(r.id));
    if(!a.ok)perNode.push({id:n.id,name:n.name,missing:a.missing.map(r=>r.id),unreleased:[...a.unreleased,...a.stuck].map(r=>r.id)});
  }
  const lines=[];
  if(missing.size)lines.push(`${missing.size} material${missing.size===1?'':'s'} named by ${perNode.filter(p=>p.missing.length).length} of these nodes ${missing.size===1?'is':'are'} not imported in this world yet (${[...missing].map(nameOf).slice(0,8).join(', ')}${missing.size>8?`, and ${missing.size-8} more`:''}). Those nodes still import; the missing materials are left out when a node is rolled, until General Manager imports them.`);
  if(unreleased.size)lines.push(`${unreleased.size} imported material${unreleased.size===1?'':'s'} used by these nodes ${unreleased.size===1?'is':'are'} not released to players (${[...unreleased].map(nameOf).slice(0,8).join(', ')}${unreleased.size>8?`, and ${unreleased.size-8} more`:''}). They are left out when a node is rolled; use Release materials… on the node to release them.`);
  return {lines,missing:[...missing],unreleased:[...unreleased],perNode};
}
