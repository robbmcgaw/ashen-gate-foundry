// Exact Objective consumer; Archie 0.1-prototype is the definition authority when
// configured. Player view ALWAYS comes from Quest's sanitized, permission-checked
// projection, never native documents, compendiums, or readSource() raw records.
import {MOD} from './core.mjs';
import {validateEnvelope} from './vendor/archie-resolver/contracts.mjs';
export const RESOLVER_CONTRACT='ag-definition-resolver/0.1-prototype';
const OBJECTIVE_ID=/^(?:QUEST|ORDER|CONTRACT)-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const KIND={QUEST:'quest',ORDER:'work_order',CONTRACT:'contract'};
const rows=c=>Array.isArray(c?.contents)?c.contents:Array.isArray(c)?c:typeof c?.values==='function'?[...c.values()]:[];
const notFound=()=>({status:'not_found'});
const expectedKind=id=>KIND[id.split('-')[0]];
// Strict seven-field envelope: no scope=campaign_state, untyped refs, or
// silently synthesized fields, including on the Manager-disabled path.
export function validNativeSource(meta,id){
 if(!meta || typeof meta!=='object' || meta.sourceId!==id)return false;
 const rec={id:meta.sourceId,entity_type:meta.entityType,status:meta.status,
  version:meta.sourceVersion??meta.version,provenance:meta.provenance,
  visibility:meta.visibility,refs:meta.refs,...(meta.scope!==undefined?{scope:meta.scope}:{})};
 return validateEnvelope(rec).length===0;
}
function managedDocuments(game,id){
 const found=[];
 for(const coll of ['journal','items','actors','tables','macros'])for(const doc of rows(game?.[coll])){
  if(doc?.pack||doc?.parent||doc?.flags?.['ashen-gate-manager']?.lifecycle?.archived===true)continue;
  const s=doc?.flags?.['ashen-gate-manager']?.source;
  if(s?.sourceId===id)found.push({doc,s});
 }
 return found;
}
function nativeResolve(game,id,{entityType,expectedVersion}={}){
 const group=managedDocuments(game,id);
 if(!group.length)return notFound();
 if(group.length>1)return {status:'conflict',count:group.length};
 const {doc,s}=group[0];
 if(!validNativeSource(s,id))return {status:'invalid_metadata'};
 if(s.entityType!==entityType)return {status:'type_mismatch'};
 const kind=s.definition?.objective_kind;
 if(typeof kind!=='string')return {status:'invalid_metadata'};
 if(kind!==expectedKind(id))return {status:'type_mismatch'};
 if(['retired','superseded'].includes(s.status))return {status:'inactive'};
 const version=s.sourceVersion??s.version;
 if(expectedVersion&&expectedVersion!==version)return {status:'stale',expectedVersion,actualVersion:version};
 if(typeof doc.uuid!=='string'||!doc.uuid.trim())return {status:'invalid_binding'};
 return {status:'ok',binding:{id,entityType,kind:'native',uuid:doc.uuid,version}};
}
function pinnedAvailable(reader){return reader?.contract===RESOLVER_CONTRACT&&
 typeof reader.resolve==='function'&&typeof reader.readSource==='function';}
function lookupNativeByUuid(game,uuid){
 for(const coll of ['journal','items','actors','tables','macros'])for(const doc of rows(game?.[coll]))
  if(!doc?.pack&&!doc?.parent&&doc.uuid===uuid)return doc;
 return null;
}
function confirmBinding(game,id,answer,packDocumentByUuid){
 if(answer.status!=='ok')return answer;
 const b=answer.binding;
 if(b?.id!==id||b?.entityType!=='Objective'||b.kind!=='native'||typeof b.uuid!=='string')return {status:'unavailable'};
 // Pack metadata is a disposable, GM-only snapshot of configured packs, not
 // another competing identity index. Only Archie's winning UUID is inspected.
 const doc=b.uuid.startsWith('Compendium.')?packDocumentByUuid?.(b.uuid):lookupNativeByUuid(game,b.uuid);
 if(!doc)return {status:'unavailable'};
 const s=doc.flags?.['ashen-gate-manager']?.source;
 if(!validNativeSource(s,id))return {status:'invalid_metadata'};
 if(s.entityType!=='Objective'||s.definition?.objective_kind!==expectedKind(id))return {status:'type_mismatch'};
 if(doc.flags?.['ashen-gate-manager']?.lifecycle?.archived===true)return notFound();
 if(s.sourceVersion!==undefined&&s.sourceVersion!==b.version && s.version!==b.version)return {status:'unavailable'};
 return {status:'ok',binding:{id,entityType:'Objective',kind:'native',uuid:b.uuid,version:b.version}};
}
export function createObjectiveConsumer({game,localSource,visibleProjection,managerApi=()=>null,
 definitionResolver=()=>null,packDocumentByUuid=()=>null,playerAccessEnabled=()=>true}={}){
 if(!game||typeof localSource!=='function'||typeof visibleProjection!=='function')throw new TypeError('Need game and Quest-owned readers');
 function resolveObjective(id,{entityType='Objective',expectedVersion}={}){
  if(typeof id!=='string'||!OBJECTIVE_ID.test(id))return {status:'invalid_id'};
  if(!game.user?.isGM){
   if(playerAccessEnabled()!==true)return notFound();
   let row;try{row=visibleProjection(id);}catch{return notFound();}
   if(!row?.view||row.view.id!==id||row.view.entity_type!=='Objective'||
      row.view.objective_kind!==expectedKind(id))return notFound();
   if(entityType!=='Objective')return notFound();
   // Player API never reads the resolver's raw source, and never makes a
   // published Quest visible solely because a pack has a matching record.
   return {status:'ok',binding:{id,entityType:'Objective',kind:'domain',providerId:MOD,recordKey:id},view:structuredClone(row.view)};
  }
  let source;try{source=localSource(id);}catch{return {status:'conflict'};}
  let external;
  const pinned=definitionResolver();
  if(pinnedAvailable(pinned)) {
   // Pin is authoritative: conflicts/inactive/precedence are decided upstream.
   // No unsafe fallback to a different world/pack candidate after a denial.
   try {external=pinned.resolve(id,{entityType:'Objective',expectedVersion});}
   catch{return {status:'unavailable'};}
   if(!external||typeof external.status!=='string')return {status:'unavailable'};
   external=confirmBinding(game,id,external,packDocumentByUuid);
  } else {
   external=nativeResolve(game,id,{entityType:'Objective',expectedVersion});
   const manager=managerApi();
   if(manager?.contract===RESOLVER_CONTRACT&&typeof manager.resolve==='function'){
    let answer;try{answer=manager.resolve(id,{entityType:'Objective',expectedVersion});}catch{answer={status:'unavailable'};}
    if(['conflict','type_mismatch','inactive','stale'].includes(answer?.status))external=answer;
   }
  }
  // A Quest-owned source and an independent native source are two active
  // authorities, not an automatic clone/override of the campaign record.
  if(source&&['ok','type_mismatch','invalid_metadata','conflict','inactive','stale','invalid_binding','unavailable'].includes(external.status)){
   if(external.status!=='inactive')return {status:'conflict'};
  }
  if(source){
   if(source.entity_type!==entityType||source.objective_kind!==expectedKind(id))return {status:'type_mismatch'};
   if(['retired','superseded'].includes(source.status))return {status:'inactive'};
   if(expectedVersion&&expectedVersion!==source.version)return {status:'stale',expectedVersion,actualVersion:source.version};
   return {status:'ok',binding:{id,entityType:'Objective',kind:'domain',providerId:MOD,recordKey:id,version:source.version}};
  }
  if(entityType!=='Objective')return external.status==='ok'?{status:'type_mismatch'}:external;
  return external;
 }
 return Object.freeze({contract:'ag-objective-consumer/0.2-alpha',resolveObjective});
}
