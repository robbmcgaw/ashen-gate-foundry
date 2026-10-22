/** Ashen Gate Manager v0.3: deterministic, Foundry-independent build & lifecycle rules. */
import {canonical, getPath, isPlainObject, exportedFields, equal, flatten} from './core.js';
import {classifyDelivery,domainHandoff} from './delivery.js';
import {managerAssignedIcon} from './smart-icons.js';

const deep = value => structuredClone(value);
const has = (object,key) => Object.prototype.hasOwnProperty.call(object,key);

export function mergeDefaults(defaults, overrides) {
  if (!isPlainObject(defaults)) return deep(overrides);
  const result = deep(defaults);
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (['__proto__','prototype','constructor'].includes(key)) throw new Error(`Unsafe template override key ${key}.`);
    if (isPlainObject(value) && isPlainObject(result[key])) result[key] = mergeDefaults(result[key],value);
    else result[key] = deep(value);
  }
  return result;
}

/** Package-local, declarative Foundry document templates. Does not interpret executable source. */
export function compilePackage(source) {
  if (!isPlainObject(source)) throw new Error('Package root must be an object.');
  const kind=classifyDelivery(source);
  if(kind) throw new Error(kind.notice);
  const pkg = deep(source);
  if (!Array.isArray(pkg.records)) {
    const keys=Object.keys(pkg).slice(0,12).join(', ') || '(none)';
    const rootHint=Array.isArray(pkg.professions)||Array.isArray(pkg.materials)||Array.isArray(pkg.recipes)||Array.isArray(pkg.perks)
      ? ' This looks like a structured specialist catalog, not a Manager import package.' : '';
    const actual=pkg.records===undefined ? 'missing' : Array.isArray(pkg.records) ? 'array' : typeof pkg.records;
    throw new Error(`Expected Manager package records[]; found records=${actual} (top-level keys: ${keys}).${rootHint} Import requires a manifest, records array, and explicit Foundry projections for installable entries. No changes made.`);
  }
  const templates = Array.isArray(pkg.templates) ? pkg.templates : [];
  const map = new Map();
  for (const [index,t] of templates.entries()) {
    if (!isPlainObject(t) || !/^[A-Za-z][\w.-]*$/.test(t.id ?? '')) throw new Error(`templates[${index}]: invalid id.`);
    if (map.has(t.id)) throw new Error(`Duplicate template ID ${t.id}.`);
    if (!['Item','JournalEntry','Actor','RollTable','Macro'].includes(t.document_type)) throw new Error(`Template ${t.id}: unsupported document_type.`);
    if (!isPlainObject(t.defaults)) throw new Error(`Template ${t.id}: defaults must be an object.`);
    if (Object.keys(t.defaults).some(k=>['__proto__','prototype','constructor'].includes(k))) throw new Error(`Template ${t.id}: unsafe defaults key.`);
    const validDefaults={Item:['name','type','img','system'],JournalEntry:['name','img','pages'],
      Actor:['name','type','img','system','prototypeToken','items','effects','flags'],
      RollTable:['name','img','description','formula','replacement','displayRoll','results'],
      Macro:['name','img','type','scope','command']}[t.document_type];
    if (Object.keys(t.defaults).some(k=>!validDefaults.includes(k))) {
      throw new Error(`Template ${t.id}: unsupported default fields.`);
    }
    if (t.document_type==='JournalEntry' && has(t.defaults,'pages')) throw new Error(`Template ${t.id}: Journal pages cannot be shared between records in alpha.`);
    map.set(t.id,t);
  }
  for (const record of pkg.records) {
    if (!record?.template_ref) continue;
    const t=map.get(record.template_ref);
    if (!t) throw new Error(`${record.id}: template ${record.template_ref} not found.`);
    if (!isPlainObject(record.foundry)) record.foundry={};
    if (record.foundry.document_type && record.foundry.document_type!==t.document_type) throw new Error(`${record.id}: template document_type mismatch.`);
    record.foundry.document_type=t.document_type;
    record.foundry.data=mergeDefaults(t.defaults,record.foundry.data ?? {});
    record._ag_template_version = t.version ?? 'unversioned';
  }
  return pkg;
}

/** Canonical project refs; legacy short refs supported only for earlier experimental packages. */
export function normalizeRef(ref) {
  if (typeof ref === 'string') return {id:ref, optional:false,relation:'legacy_reference',mode:'hard_requirement'};
  if (typeof ref?.target_id==='string') return {id:ref.target_id, optional:!['required','hard_requirement'].includes(ref.mode), relation:ref.relation,mode:ref.mode};
  if (typeof ref?.id==='string') return {id:ref.id, optional:Boolean(ref.optional),relation:ref.type??'legacy_reference',mode:ref.optional?'optional_integration':'hard_requirement'};
  throw new Error('Invalid reference.');
}

/** Stable ID-based import order, handling optional and cyclic relationships without creating invalid document refs. */
export function dependencyOrder(records) {
  const byId=new Map(records.map(r=>[r.id,r]));
  const visited=new Set(),visiting=new Set(),order=[],cycles=[];
  function visit(id,stack=[]) {
    if (visited.has(id)) return;
    if (visiting.has(id)) {cycles.push([...stack,id]);return;}
    visiting.add(id);
    const r=byId.get(id);
    for (const ref of r?.refs ?? []) {
      const nr=normalizeRef(ref);
      if (!nr.optional && byId.has(nr.id)) visit(nr.id,[...stack,id]);
    }
    visiting.delete(id);
    visited.add(id);
    order.push(id);
  }
  for (const r of records) visit(r.id);
  return {order,cycles};
}

export function docManagerSnapshot(document) {
  const raw=document.toObject();
  return {document_type:document.documentName,uuid:document.uuid,document_id:document.id,
    source_id:document.getFlag?.('ashen-gate-manager','source')?.sourceId ?? null,
    capture_id:document.getFlag?.('ashen-gate-manager','capture')?.captureId ?? null,
    raw};
}

export function localEdits(document) {
  const source=document.getFlag?.('ashen-gate-manager','source');
  if (!source?.managedFields) return [];
  // Foundry document accessors can expose Collections, Promises, and other live
  // objects that structuredClone cannot copy. Compare and report against the
  // serialized source shape instead of the live document facade.
  let raw;
  try { raw=document.toObject?.(); } catch { raw=null; }
  const snapshot=raw && typeof raw==='object' ? raw : document;
  // 0.47.0: an icon Manager picked (smart icons) is not a local edit.
  const managerIcon=managerAssignedIcon(snapshot?.img,snapshot?.flags?.['ashen-gate-manager']??document.flags?.['ashen-gate-manager']);
  return Object.entries(source.managedFields).flatMap(([path,baseline])=>{
    if (path==='img' && managerIcon) return [];
    const current=getPath(snapshot,path);
    if (equal(current,baseline)) return [];
    try { return [{path,baseline,current:deep(current ?? null)}]; }
    catch { return [{path,baseline,current:'[Foundry value unavailable in serialized document]'}]; }
  });
}

export function planLifecycle({managed,kind,sourceId=null,entityType=null,archived=false,dependentIds=[],embeddedCount=0,action}) {
  if(['Actor','RollTable','Macro'].includes(kind)) return {action:'blocked',reason:`${kind} lifecycle operations belong to Foundry; Manager only creates and browses these documents.`};
  const handoff=domainHandoff({id:sourceId,entity_type:entityType});
  if(handoff) return {allowed:false,reason:handoff};
  if (!managed) return {allowed:false,reason:'Unmanaged document: adopt/tag separately first.'};
  if (!['Item','JournalEntry'].includes(kind)) return {allowed:false,reason:'Only world Items and Journals support lifecycle changes.'};
  if (action==='archive' && archived) return {allowed:false,reason:'Already archived.'};
  if (action==='restore' && !archived) return {allowed:false,reason:'Not archived.'};
  if (action==='delete' && dependentIds.length) return {allowed:false,reason:`Blocked: referenced by ${dependentIds.join(', ')}.`};
  if (action==='delete' && embeddedCount) return {allowed:false,reason:`Blocked: ${embeddedCount} Actor inventory copy/copies or matching source identities detected.`};
  if (action==='delete' && !archived) return {allowed:false,reason:'Archive before deleting; deletion is only supported for archived managed content.'};
  if (!['archive','restore','delete'].includes(action)) return {allowed:false,reason:'Invalid lifecycle action.'};
  return {allowed:true,reason:'Eligible after explicit confirmation and snapshot.'};
}

export function buildSourceReplacementPatch(record, docWrapper, {allowLocalEdits=false}={}) {
  const handoff=domainHandoff(record);
  if(handoff) return {action:'blocked',reason:handoff};
  if (record.foundry.document_type!=='Item') return {action:'blocked',reason:'Full source replacement is Item-only in this alpha.'};
  const old=docWrapper.flag?.managedFields;
  if (!old) return {action:'blocked',reason:'No baseline; cannot replace unmanaged content.'};
  if (docWrapper.type!==record.foundry.data.type) return {action:'blocked',reason:'Item subtype mismatch.'};
  if (docWrapper.coreLink?.adopted) return {action:'blocked',reason:`Uses data adopted from core item ${docWrapper.coreLink.name ?? ''}; undo that core link first (Core Links tab).`};
  const incoming=exportedFields(record);
  const removed=Object.keys(old).filter(p=>!has(incoming,p));
  if (removed.length) return {action:'blocked',reason:`Removed source fields require migration: ${removed.join(', ')}`};
  const changes={},localPaths=[];
  for (const [path,value] of Object.entries(incoming)) {
    const live=docWrapper.get(path);
    const baseline=old[path];
    if (!has(old,path) && live!==undefined && !equal(live,value)) return {action:'blocked',reason:`Previously unmanaged field ${path}: manual review required.`};
    if (has(old,path) && !equal(live,baseline)) localPaths.push(path);
    if (!equal(live,value)) changes[path]=value;
  }
  if (localPaths.length && !allowLocalEdits) return {action:'conflict',reason:`Local changes present in ${localPaths.join(', ')}; allow replacement explicitly.`,localPaths};
  return {action:Object.keys(changes).length?'replace':'unchanged',patch:changes,localPaths,
    reason:`${Object.keys(changes).length} source-managed field(s) replaced; ${localPaths.length} local modifications overwritten.`};
}

export function checkMacroUpdate(existing, incoming) {
  if (!existing) return {action:'install',reason:'No managed macro with this registry ID.'};
  const flag=existing.flag;
  if (!flag?.lastCommand) return {action:'blocked',reason:'Missing source baseline; cannot safely update macro.'};
  const normalizeCommand=value=>String(value??'').replace(/\r\n?/g,'\n');
  const live=normalizeCommand(existing.command), baseline=normalizeCommand(flag.lastCommand), source=normalizeCommand(incoming.command);
  if (live !== baseline && live !== source)
    return {action:'conflict',reason:'Local macro code was edited; preserve and export before overwriting.'};
  if (live===source && existing.flag?.version!==incoming.version) return {action:'update',reason:'Macro code unchanged; source version metadata needs refresh.'};
  if (live===source) return {action:'unchanged',reason:'Macro code matches bundled source.'};
  return {action:'update',reason:'Managed macro has no conflicting local edits.'};
}

export function classifySnapshot(snapshot) {
  if (!isPlainObject(snapshot) || snapshot.schema_version !== 'ag-foundry-snapshot/0.3' || !Array.isArray(snapshot.documents))
    throw new Error('Not a valid Ashen Gate Manager 0.3 snapshot.');
  return {documents:snapshot.documents.length,valid:true};
}
