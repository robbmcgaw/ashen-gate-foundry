/** Pure helpers for browsing imported Ashen Gate content (no writes to world documents). */
const SYSTEM_NAMES = Object.freeze({
  'SYS-PROF':'Professions','SYS-MUT':'Cinders','SYS-FACTION':'Renown',
  'SYS-HQ':'Headquarters','SYS-HIRE':'Hirelings','SYS-LOC':'Locations & Exploration',
  'SYS-QUEST':'Quests & Orders'
});
const PREFIX_SYSTEMS = Object.freeze({
  PROF:'SYS-PROF',MAT:'SYS-PROF',REC:'SYS-PROF',
  MUT:'SYS-MUT',POWER:'SYS-MUT',CINDER:'SYS-MUT',
  FACTION:'SYS-FACTION',RENOWN:'SYS-FACTION',
  HQ:'SYS-HQ',FAC:'SYS-HQ',HIRE:'SYS-HIRE',HPERK:'SYS-HIRE',
  LOC:'SYS-LOC',MAP:'SYS-LOC',RES:'SYS-LOC',ROUTE:'SYS-LOC',
  QUEST:'SYS-QUEST',ORDER:'SYS-QUEST',CONTRACT:'SYS-QUEST',ASSIGN:'SYS-QUEST'
});
export function systemOf({sourceId='',ownerSystemId='',entityType='',packageId=''}={}) {
  if(SYSTEM_NAMES[ownerSystemId]) return {key:ownerSystemId,label:SYSTEM_NAMES[ownerSystemId]};
  const prefix=String(sourceId).split('-')[0].toUpperCase();
  const key=PREFIX_SYSTEMS[prefix];
  if(key) return {key,label:SYSTEM_NAMES[key]};
  // Perks, Features and Items can be used by multiple systems. Never assign by ID alone.
  const pkg=String(packageId).toUpperCase();
  const inferred=pkg.includes('CINDER')||pkg.includes('MUTATION') ? 'SYS-MUT' :
    pkg.includes('PROFESSION') ? 'SYS-PROF' : null;
  if(inferred) return {key:inferred,label:SYSTEM_NAMES[inferred]};
  return {key:'unclassified',label:'Unclassified / Shared'};
}
export function normalizeSourceRef(ref) {
  if(typeof ref==='string') return {targetId:ref,relation:'references',mode:'required'};
  return {targetId:ref?.target_id ?? ref?.id ?? '',relation:ref?.relation ?? 'references',
    mode:ref?.mode ?? (ref?.optional ? 'optional':'required')};
}
export function browseLibrary(rows,filters={}) {
  const text=String(filters.search??'').trim().toLowerCase();
  const system=filters.system??'all',status=filters.status??'all',pkg=filters.package??'all';
  const filtered=rows.filter(row=> {
    if(!filters.showArchived && row.archived) return false;
    if(system!=='all' && row.systemKey!==system) return false;
    if(status!=='all' && row.status!==status) return false;
    if(pkg!=='all' && row.packageId!==pkg) return false;
    if(text && ![row.name,row.sourceId,row.kind,row.entityType,row.packageId,row.systemLabel,row.status]
       .some(v=>String(v??'').toLowerCase().includes(text))) return false;
    return true;
  });
  const aggregate=(key)=> [...new Set(rows.map(row=>row[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b))
    .map(value=>({value,count:rows.filter(row=>row[key]===value).length,selected:value===filters[key==='systemKey'?'system':key==='packageId'?'package':key]}));
  return {rows:filtered,summary:{total:rows.length,visible:filtered.length,active:rows.filter(r=>!r.archived).length,
     edited:rows.filter(r=>r.edited>0).length,systems:new Set(rows.map(r=>r.systemKey)).size},
    systemOptions:aggregate('systemKey').map(x=>({...x,label:rows.find(r=>r.systemKey===x.value).systemLabel})),
    statusOptions:aggregate('status'),packageOptions:aggregate('packageId')};
}
export function inspectLibrary(rows,uuid) {
  const selected=rows.find(r=>r.uuid===uuid); if(!selected) return null;
  const ids=new Map();for(const r of rows)if(!ids.has(r.sourceId))ids.set(r.sourceId,r);
  for(const r of rows)for(const id of r.ownedResourceIds??[])if(!ids.has(id))ids.set(id,r);
  const outgoing=(selected.refs??[]).map(raw=>{
    const r=normalizeSourceRef(raw),match=ids.get(r.targetId);
    return {...r,exists:Boolean(match),name:match?.name??'Missing / not managed',uuid:match?.uuid??null};
  });
  const incoming=rows.filter(r=>r.uuid!==uuid).flatMap(row=>(row.refs??[])
    .map(normalizeSourceRef).filter(ref=>ref.targetId===selected.sourceId || (selected.ownedResourceIds??[]).includes(ref.targetId))
    .map(ref=>({...ref,sourceId:row.sourceId,name:row.name,uuid:row.uuid})));
  return {...selected, outgoing,incoming,refCount:outgoing.length,inboundCount:incoming.length,
    editedFields:selected.editedFields??[],visibility:selected.visibility??'—',
    provenanceSummary:(selected.provenance?.sources??[]).join(' • ')||'No source recorded'};
}
/** Find only actual Ashen Gate modules; never invent IDs for optional modules. */
export function isAshenModule(module) {
  const id=String(module?.id??'').toLowerCase(),title=String(module?.title??'');
  return id.startsWith('ashen-gate') || id.startsWith('ag-') || /^ashen gate(?:\s|[—:–-])/i.test(title);
}
export function describeLaunchers(modules,menus=[],managerId='ashen-gate-manager') {
  const knownRoles={
    'ashen-gate-profession-ledger':'Owns character Profession and recipe runtime state; Manager imports definitions only.',
    'ashen-gate-skill-trees':'Owns tree display and unlock progression; Manager supplies stable-ID Features.',
    'ashen-gate-factions':'Owns Renown standings, claims and services; Manager never overwrites those states.'
  };
  return [...modules].filter(isAshenModule).filter(mod=>mod.id!==managerId).map(mod=>{
    const matching=menus.filter(([key])=>String(key).startsWith(`${mod.id}.`));
    matching.sort((a,b)=>Number(/(manager|ledger|main|open)/i.test(b[0]))-Number(/(manager|ledger|main|open)/i.test(a[0])));
    const menu=matching.find(([,entry])=>typeof entry?.type==='function');
    const api=Boolean(mod.active && typeof mod.api?.open==='function');
    const canOpen=Boolean(mod.active&&(api||menu));
    return {id:mod.id,title:mod.title??mod.id,version:mod.version??'—',active:Boolean(mod.active),
      canOpen,launchMethod:api?'api':menu?'menu':'none',menuKey:menu?.[0]??null,
      state:!mod.active?'Not active':canOpen?'Ready':'No launcher exposed',
      role:knownRoles[mod.id]??'Independent specialist module. Manager launcher is optional; campaign state stays with its owner.'};
  }).sort((a,b)=>a.title.localeCompare(b.title));
}
