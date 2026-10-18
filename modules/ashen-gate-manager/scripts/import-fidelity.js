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
export function resolveRichText(html,index){
  if(typeof html!=='string') return {text:html,resolved:[],issues:[]};
  const resolved=[],issues=[];
  const text=html.replace(MARKER,(token,id,label,at)=>{
    if(insideHtmlTag(html,at)){issues.push({level:'error',id,message:`AGREF ${id} occurs inside HTML markup/attribute.`});return token;}
    const result=resolveUuid(index,id);
    if(result.status!=='resolved'){issues.push({level:'error',id,message:`AGREF ${id}: ${result.status}${result.uuids?' ('+result.uuids.join(', ')+')':''}.`});return token;}
    resolved.push(id);
    return `@UUID[${result.uuid}]{${safeLinkLabel(label || result.name)}}`;
  });
  if((html.match(/\[\[AGREF:/g)??[]).length!==[...html.matchAll(MARKER)].length)
    issues.push({level:'error',id:'AGREF',message:'Malformed AGREF marker remains.'});
  return {text,resolved,issues};
}
export function resolveTypedRefs(refs,index,excludeIds=[]){
  const bindings=[],issues=[];const excluded=new Set(excludeIds);
  for(const ref of refs??[]){
    const id=typeof ref==='string'?ref:ref.target_id??ref.id;
    if(!IDENTIFIER.test(id??'')){issues.push({level:'error',id,message:`Invalid source reference ${id}.`});continue;}
    const result=resolveUuid(index,id);
    if(result.status==='resolved'){bindings.push({target_id:id,uuid:result.uuid,relation:ref.relation??ref.type??'references'});continue;}
    const optional=ref?.mode==='optional'||ref?.optional===true||ref?.mode==='optional_integration'||ref?.mode==='coupled';
    issues.push({level:optional?'warning':'error',id,message:`${optional?'Optional':'Required'} link ${id}: ${result.status}${excluded.has(id)?' (record not selected)':''}.`});
  }
  return {bindings,issues};
}
export function appendReferenceBlock(html,bindings,alreadyIncluded=[]){
  if(typeof html!=='string'||!bindings.length)return html;
  const included=new Set(alreadyIncluded);
  const missing=bindings.filter(b=>!included.has(b.target_id));
  if(!missing.length)return html;
  const entries=missing.map(b=>`<li><span>${safeHtml(b.relation)}:</span> @UUID[${b.uuid}]{${safeLinkLabel(b.target_id)}}</li>`).join('');
  return `${html}\n<section class="ag-managed-links" data-ag-managed-links="1"><h4>References</h4><ul>${entries}</ul></section>`;
}

/** Only explicit placeholders demand UUIDs; typed refs are checked in the final pass. */
export function markerTargets(record){
  const data=record?.foundry?.data;
  const texts=record?.foundry?.document_type==='Item'?[data?.system?.description?.value]:record?.foundry?.document_type==='Actor'?[data?.system?.details?.biography?.value,...(Array.isArray(data?.items)?data.items:[]).map(item=>item.system?.description?.value)]:record?.foundry?.document_type==='RollTable'?[data?.description]:(data?.pages??[]).map(p=>p?.text?.content);
  const ids=new Set();
  for(const text of texts)if(typeof text==='string')for(const match of text.matchAll(MARKER))ids.add(match[1]);
  return [...ids];
}
