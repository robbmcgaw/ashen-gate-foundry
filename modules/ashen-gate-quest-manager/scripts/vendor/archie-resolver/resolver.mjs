import {TEMPORARY_CONTRACT, validateEnvelope} from './contracts.mjs';
const ID=/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
const safeViewer = v => Boolean(v && v.isGM === true);
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
function snapshotEntry(entry) {
  const record = deepFreeze(structuredClone(entry.record));
  const binding = deepFreeze(structuredClone(entry.binding));
  return Object.freeze({ record,binding,
    publicTitle: typeof entry.publicTitle === 'string' ? entry.publicTitle : undefined,
    canRead:entry.canRead });
}
const result = (status,binding=null,extra={}) => ({status,...(binding?{binding}:{}),...extra});
const publicBinding = entry => {
  const b=entry.binding;
  return Object.freeze({id:entry.record.id,entityType:entry.record.entity_type,kind:b.kind,
    ...(b.kind==='native'?{uuid:b.uuid}:{providerId:b.providerId,recordKey:b.recordKey}),
    version:entry.record.version,
    ...(typeof entry.publicTitle==='string'?{title:entry.publicTitle}:{})});
};
export function createResolver(entries,{currentViewer=()=>null,isRevealed=()=>false}={}) {
  if(typeof currentViewer!=='function')throw new TypeError('currentViewer must be a function');
  if(!Array.isArray(entries))throw new TypeError('entries must be an array');
  const byId=new Map(),rejected=[];
  for(let index=0;index<entries.length;index++) {
    const e=entries[index], errors=validateEnvelope(e?.record), b=e?.binding;
    if(!b || (b.kind!=='native' && b.kind!=='domain') ||
      (b.kind==='native' && (typeof b.uuid!=='string'||!b.uuid.trim())) ||
      (b.kind==='domain' && (![b.providerId,b.recordKey].every(x=>typeof x==='string'&&x.length>0))))errors.push('invalid_binding');
    if(errors.length){rejected.push({index,errors});continue;}
    let snapshot;try{snapshot=snapshotEntry(e);}catch{rejected.push({index,errors:['non_serializable_entry']});continue;}
    const id=snapshot.record.id;if(!byId.has(id))byId.set(id,[]);byId.get(id).push(snapshot);
  }
  const isInactive=e=>['retired','superseded'].includes(e.record.status);
  const isPack=e=>e.binding.kind==='native'&&e.binding.uuid.startsWith('Compendium.');
  const isWorld=e=>e.binding.kind==='native'&&!isPack(e);
  function select(group) {
    if(!group.length)return {entry:null,conflicts:[],shadowed:[]};
    const active=group.filter(e=>!isInactive(e));
    if(!active.length)return group.length===1?{entry:group[0],conflicts:[],shadowed:[]}:{entry:null,conflicts:group,shadowed:[]};
    if(active.length===1)return {entry:active[0],conflicts:[],shadowed:group.filter(e=>e!==active[0])};
    const worlds=active.filter(isWorld),packs=active.filter(isPack);
    if(worlds.length===1&&packs.length===active.length-1&&
       packs.every(p=>p.record.entity_type===worlds[0].record.entity_type))
      return {entry:worlds[0],conflicts:[],shadowed:group.filter(e=>e!==worlds[0])};
    return {entry:null,conflicts:active,shadowed:[]};
  }
  function permitted(e,viewer) {
    if(safeViewer(viewer))return true;
    if(e.record.visibility==='gm')return false;
    if(e.record.visibility==='reveal_gated'){
      try{if(isRevealed(e,viewer)!==true)return false;}catch{return false;}
    }
    if(typeof e.canRead!=='function')return false;
    try {if(e.canRead(viewer)!==true)return false;}catch{return false;}
    return true;
  }
  function resolve(id,{entityType,expectedVersion}={}) {
    const viewer=currentViewer();
    if(typeof id!=='string'||!ID.test(id))return result('invalid_id');
    const selection=select(byId.get(id)||[]);
    if(selection.conflicts.length)return safeViewer(viewer)
      ?result('conflict',null,{count:selection.conflicts.length,candidates:selection.conflicts.map(publicBinding)})
      :result('not_found');
    if(!selection.entry)return result('not_found');
    const entry=selection.entry,record=entry.record;
    if(!permitted(entry,viewer))return result('not_found');
    if(entityType&&record.entity_type!==entityType)return result('type_mismatch');
    if(isInactive(entry))return result('inactive');
    if(expectedVersion&&expectedVersion!==record.version)return safeViewer(viewer)
      ?result('stale',null,{expectedVersion,actualVersion:record.version}):result('not_found');
    return result('ok',publicBinding(entry));
  }
  function readSource(id,options) {
    if(!safeViewer(currentViewer()))return result('not_found');
    const answer=resolve(id,options);
    if(answer.status!=='ok')return answer;
    const selection=select(byId.get(id)||[]);
    if(!selection.entry)return result('not_found');
    return {status:'ok',binding:answer.binding,record:structuredClone(selection.entry.record)};
  }
  function list({entityType}={}) {
    const output=[];
    for(const [id] of byId){const answer=resolve(id,{entityType});if(answer.status==='ok')output.push(answer.binding);}
    return output.sort((a,b)=>a.id.localeCompare(b.id));
  }
  function referenceCheck() {
    const requiredFailures=[],optionalGaps=[],missing=[],ambiguousBindings=[],overrides=[];
    for(const [id,group] of byId) {
      const s=select(group);
      if(s.conflicts.length){ambiguousBindings.push({id,candidates:s.conflicts.map(publicBinding)});continue;}
      if(s.shadowed.length)overrides.push({id,selected:publicBinding(s.entry),shadowed:s.shadowed.map(publicBinding)});
      if(!s.entry||isInactive(s.entry))continue;
      for(const r of s.entry.record.refs) {
        const target=select(byId.get(r.target_id)||[]);
        let code=null;
        if(target.conflicts.length)code='ambiguous_target';
        else if(!target.entry)code='missing_target';
        else if(isInactive(target.entry))code='inactive_target';
        if(!code)continue;
        const detail={from:id,to:r.target_id,relation:r.relation,mode:r.mode,code};
        if(code==='missing_target')missing.push({from:id,to:r.target_id,relation:r.relation,mode:r.mode});
        (r.mode==='required'?requiredFailures:optionalGaps).push(detail);
      }
    }
    return {requiredFailures,optionalGaps,missing,ambiguousBindings,overrides};
  }
  function validateReferences() {
    if(!safeViewer(currentViewer()))return {status:'forbidden'};
    const c=referenceCheck();return {status:c.requiredFailures.length||c.ambiguousBindings.length?'failed':'ok',
      requiredFailures:c.requiredFailures,optionalGaps:c.optionalGaps,ambiguousBindings:c.ambiguousBindings};
  }
  function audit() {
    if(!safeViewer(currentViewer()))return {status:'forbidden'};
    const c=referenceCheck();
    return {status:'ok',entries:entries.length,indexed:[...byId.values()].reduce((n,a)=>n+a.length,0),rejected,
      duplicates:c.ambiguousBindings,missing:c.missing,worldOverrides:c.overrides,
      requiredFailures:c.requiredFailures,optionalGaps:c.optionalGaps};
  }
  return Object.freeze({contract:TEMPORARY_CONTRACT,resolve,list,readSource,audit,validateReferences});
}
