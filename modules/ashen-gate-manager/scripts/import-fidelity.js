/** v0.6.0 import fidelity helpers. Canonical IDs remain source-of-truth. */
const IDENTIFIER = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
const MARKER = /\[\[AGREF:([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)(?:\|([^\]\r\n]{1,160}))?\]\]/g;
const ASHEN_ROOT = 'Ashen Gate';
export function folderSegments(path) {
  if (path === undefined || path === null || path === '') return null;
  if (typeof path !== 'string' || path.length > 550 || /[\u0000-\u001f\\]/.test(path)) throw new Error('folder_path must be a safe slash-delimited string.');
  const parts=path.split('/');
  if(parts.length>8 || parts.some(p=>!p || p!==p.trim() || p==='.' || p==='..' || p.length>95 || /[<>]/.test(p)))
    throw new Error('folder_path contains an invalid segment or exceeds eight levels.');
  if(parts[0]!==ASHEN_ROOT) throw new Error('folder_path must begin with "Ashen Gate/".');
  return parts;
}
export function validateImportPresentation(record) {
  const issues=[];
  try { folderSegments(record?.foundry?.folder_path); } catch(e) {issues.push(`${record.id}: ${e.message}`);}
  const data=record?.foundry?.data;
  const texts=record?.foundry?.document_type==='Item' ? [data?.system?.description?.value] : record?.foundry?.document_type==='Actor' ? [data?.system?.details?.biography?.value,...(Array.isArray(data?.items)?data.items:[]).map(item=>item.system?.description?.value)] : record?.foundry?.document_type==='RollTable' ? [data?.description] : (data?.pages??[]).map(p=>p?.text?.content);
  for(const html of texts){if(typeof html!=='string')continue;
    const markerCount=(html.match(/\[\[AGREF:/g)??[]).length;
    const parsed=[...html.matchAll(MARKER)];
    if(parsed.length!==markerCount) issues.push(`${record.id}: invalid AGREF marker; expected [[AGREF:ID|Label]].`);
    for(const match of parsed) if(insideHtmlTag(html,match.index)) issues.push(`${record.id}: AGREF marker in HTML tag/attribute; use it in text content.`);
  }
  return issues;
}
export function iconFallback(record) {
  const prefix=String(record?.id??'').split('-')[0];
  const type=String(record?.entity_type??'').toLowerCase();
  let name='item';
  // The canonical ID prefix is authoritative when it identifies a known category.
  if(prefix==='PROF') name='profession';
  else if(prefix==='REC') name='recipe';
  else if(prefix==='MAT') name='material';
  else if(prefix==='PERK'||prefix==='HPERK') name='perk';
  else if(prefix==='MUT'||prefix==='POWER'||prefix==='CINDER') name='cinder';
  else if(record?.foundry?.document_type==='JournalEntry') name='journal';
  else if(record?.foundry?.document_type==='Actor') name='actor';
  else if(record?.foundry?.document_type==='RollTable') name='rolltable';
  else if(record?.foundry?.document_type==='Macro') name='macro';
  else if(type.includes('profession')) name='profession';
  else if(type.includes('recipe')) name='recipe';
  else if(type.includes('material')) name='material';
  else if(type.includes('perk')||type.includes('feature')) name='perk';
  return `modules/ashen-gate-manager/assets/icons/${name}.svg`;
}
export async function chooseIcon(record, probe=undefined) {
  const authored=record?.foundry?.data?.img;
  if(typeof authored==='string' && authored.trim()) {
    const value=authored.trim();
    // Do not rewrite remote URLs or assets that cannot be conclusively tested.
    if(probe && !/^(https?:)?\/\//i.test(value)){
      try {let result=await probe(value);if(result===404||result===410) return {img:iconFallback(record),reason:'missing-authored',original:value};}
      catch{ /* Lack of verification is not proof the authored art is missing. */ }
    }
    return {img:value,reason:'authored'};
  }
  return {img:iconFallback(record),reason:'fallback'};
}
function insideHtmlTag(html,start){return html.lastIndexOf('<',start)>html.lastIndexOf('>',start);}
export function safeHtml(str){return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function safeLinkLabel(str){return safeHtml(str).replace(/[{}\[\]]/g,'');}
function docId(doc){return doc?.getFlag?.('ashen-gate-manager','source')?.sourceId ?? doc?.flags?.['ashen-gate-manager']?.source?.sourceId;}
export function buildUuidIndex(documents) {
  const index=new Map();
  for(const doc of documents){
    const id=docId(doc);
    if(!id || !IDENTIFIER.test(id) || doc?.getFlag?.('ashen-gate-manager','lifecycle')?.archived)continue;
    const uuid=doc.uuid;
    if(typeof uuid!=='string'||! /^(Item|JournalEntry|Actor|RollTable|Macro)\.[A-Za-z0-9]+$/.test(uuid))continue;
    if(!index.has(id))index.set(id,[]);
    index.get(id).push({uuid,name:String(doc.name??id),type:doc.documentName});
  }
  return index;
}
export function resolveUuid(index,id){
  const matches=index.get(id)??[];
  if(matches.length===0)return {status:'missing',id};
  if(matches.length>1)return {status:'ambiguous',id,uuids:matches.map(m=>m.uuid)};
  return {status:'resolved',id,...matches[0]};
}
/** 0.68.0: targets written as @AGRef (viewer-resolved) instead of a fixed @UUID link. */
export const viewerResolved=(id,type)=>type==='Actor'||(type==='JournalEntry'&&/^HANDOUT-/.test(String(id)));
export function resolveRichText(html,index){
  if(typeof html!=='string') return {text:html,resolved:[],issues:[]};
  const resolved=[],issues=[];
  const text=html.replace(MARKER,(token,id,label,at)=>{
    if(insideHtmlTag(html,at)){issues.push({level:'error',id,message:`AGREF ${id} occurs inside HTML markup/attribute.`});return token;}
    const result=resolveUuid(index,id);
    if(result.status!=='resolved'){issues.push({level:'error',id,message:`AGREF ${id}: ${result.status}${result.uuids?' ('+result.uuids.join(', ')+')':''}.`});return token;}
    resolved.push(id);
    const text=safeLinkLabel(label && label!==id ? label : result.name);
    // 0.68.0: an Actor, or a handout journal (which may have a player Item twin), becomes a Manager reference link that is
    // resolved for each viewer when shown (see reference-links.mjs); everything else stays a Foundry content link.
    if(viewerResolved(id,result.type)) return `@AGRef[${id}]{${text||'Related record'}}`;
    return `@UUID[${result.uuid}]{${text}}`;
  });
  if((html.match(/\[\[AGREF:/g)??[]).length!==[...html.matchAll(MARKER)].length)
    issues.push({level:'error',id:'AGREF',message:'Malformed AGREF marker remains.'});
  return {text,resolved,issues};
}
/**
 * `moduleRecord(id)` (optional, 0.44.3): see module-records.js. A link to a record another module holds is kept by its
 * canonical id (listed in `moduleLinks`, no UUID binding); one that module has not imported yet is an 'info' issue.
 */
export function resolveTypedRefs(refs,index,excludeIds=[],moduleRecord=null){
  const bindings=[],issues=[],moduleLinks=[];const excluded=new Set(excludeIds);
  for(const ref of refs??[]){
    const id=typeof ref==='string'?ref:ref.target_id??ref.id;
    if(!IDENTIFIER.test(id??'')){issues.push({level:'error',id,message:`Invalid source reference ${id}.`});continue;}
    const result=resolveUuid(index,id);
    if(result.status==='resolved'){bindings.push({target_id:id,uuid:result.uuid,relation:ref.relation??ref.type??'references'});continue;}
    const optional=ref?.mode==='optional'||ref?.optional===true||ref?.mode==='optional_integration'||ref?.mode==='coupled';
    const held=result.status==='missing'&&typeof moduleRecord==='function'?moduleRecord(id):null;
    if(held?.exists){moduleLinks.push({target_id:id,module:held.owner.label});continue;}
    if(held){
      const label=held.owner.label,off=held.active?'':` ${label} is not active in this world.`;
      if(optional){issues.push({level:'info',id,message:`Optional link ${id}: will link when ${label} imports it.${off}`});continue;}
      issues.push({level:'error',id,message:`Required link ${id}: ${label} record not found; import it in ${label} first.${off}`});continue;
    }
    issues.push({level:optional?'warning':'error',id,message:`${optional?'Optional':'Required'} link ${id}: ${result.status}${excluded.has(id)?' (record not selected)':''}.`});
  }
  return {bindings,issues,moduleLinks};
}
/**
 * Related-record cells (0.60.3). Contract: an author marks an element (normally a table cell) in a description with
 * data-ag-ref="<relation>" and puts the target's plain display name inside, e.g. <td data-ag-ref="created_by">Iron Caltrops</td>.
 * <relation> is the relation of one of the record's typed refs (created_by, gathered_by, ...). On import the cell content becomes a
 * world-local content link, @UUID[...]{Iron Caltrops} (0.68.0: @AGRef[<id>]{...} for an Actor or handout journal), when that target exists in the world and `canLink(target_id)` allows it;
 * otherwise it stays plain text. The marker attribute is kept so every re-import resolves again from the source text. Nothing is
 * appended for refs that have no marker, and a raw id or relation name is never shown.
 * `bindings` = resolveTypedRefs(...).bindings; `nameOf(target_id)` = the target's display name; returns the new html.
 */
const REF_ID_LIKE=/^[A-Z]+(?:-[A-Z0-9_]+)+$/;
export function resolveRefCells(html,bindings,{nameOf=()=>'',canLink=()=>false}={}){
  if(typeof html!=='string'||!html.includes('data-ag-ref'))return html;
  return html.replace(/(<([a-z][a-z0-9]*)\b[^>]*\bdata-ag-ref="([A-Za-z0-9_]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g,(whole,open,tag,relation,inner,close)=>{
    let label=inner.replace(/@(?:UUID|AGRef)\[[^\]]*\]\{([^}]*)\}/g,'$1').replace(/<[^>]*>/g,'').replace(/[{}\[\]]/g,'').trim();
    const candidates=(bindings??[]).filter(b=>b.relation===relation);
    const named=candidates.filter(b=>label&&String(nameOf(b.target_id)).toLowerCase()===label.toLowerCase());
    const pick=named[0]??(candidates.length===1?candidates[0]:null);
    if(!label||REF_ID_LIKE.test(label))label=pick?safeLinkLabel(nameOf(pick.target_id)||''):'';
    if(!label)return `${open}${close}`;
    if(!pick||!canLink(pick.target_id))return `${open}${label}${close}`;
    // 0.68.0: an Actor or handout journal target is an @AGRef, resolved for each viewer when shown (see resolveRichText).
    return viewerResolved(pick.target_id,String(pick.uuid).split('.')[0])?`${open}@AGRef[${pick.target_id}]{${label}}${close}`:`${open}@UUID[${pick.uuid}]{${label}}${close}`;
  });
}

/**
 * 0.54.2: Manager no longer writes a "References" list into descriptions (it printed raw relation tokens and ids into
 * player-readable text; the bindings live in flags.<module>.source.refs). Older imports left one behind: this removes
 * exactly that section (the one marked data-ag-managed-links) and the line break before it. Idempotent.
 */
export function stripReferenceBlock(html){
  if(typeof html!=='string'||!html.includes('data-ag-managed-links'))return html;
  return html.replace(/\n?<section\b[^>]*\bdata-ag-managed-links="1"[^>]*>[\s\S]*?<\/section>/g,'');
}

/** Only explicit placeholders demand UUIDs; typed refs are checked in the final pass. */
export function markerTargets(record){
  const data=record?.foundry?.data;
  const texts=record?.foundry?.document_type==='Item'?[data?.system?.description?.value]:record?.foundry?.document_type==='Actor'?[data?.system?.details?.biography?.value,...(Array.isArray(data?.items)?data.items:[]).map(item=>item.system?.description?.value)]:record?.foundry?.document_type==='RollTable'?[data?.description]:(data?.pages??[]).map(p=>p?.text?.content);
  const ids=new Set();
  for(const text of texts)if(typeof text==='string')for(const match of text.matchAll(MARKER))ids.add(match[1]);
  return [...ids];
}
