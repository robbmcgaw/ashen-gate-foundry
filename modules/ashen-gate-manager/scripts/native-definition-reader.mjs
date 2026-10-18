/**
 * AG-WORK-0013/0014: Manager consumer of Archie's read-only native resolver
 * baseline at GitHub main 496f2302c4617e48aee44e9cc9b9a76d8e0bc9ef.
 * Temporary ag-definition-resolver/0.1-prototype result wire, NOT a public v1
 * standard, writable catalog, world setting or mandatory Manager dependency.
 *
 * Source: foundry/shared/resolver/src/{resolver,foundry-world-adapter,
 * foundry-live-resolver,provider-registry,foundry-compendium-adapter}.mjs
 * Standalone specialist modules should bundle the approved shared baseline,
 * NOT depend on this optional Manager consumer API at startup.
 */
import {readStoredDefinition} from './source-projection.mjs';
export const READER_CONTRACT='ag-definition-resolver/0.1-prototype';
const ID=/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
const TYPES=['Item','Actor','JournalEntry','RollTable','Macro'];
const DEFINITION_SCOPES=['generic_rules','setting_adapter','publication'];
const HOOKS=TYPES.flatMap(type=>['create','update','delete'].map(op=>`${op}${type}`));
const srcFlag=doc=>doc?.flags?.['ashen-gate-manager']?.source;
const archived=doc=>doc?.flags?.['ashen-gate-manager']?.lifecycle?.archived===true;
const values=coll=>Array.isArray(coll?.contents)?coll.contents:(Array.isArray(coll)?coll:typeof coll?.values==='function'?[...coll.values()]:[]);
const statusOnly=status=>({status});
const safeId=id=>typeof id==='string'&&ID.test(id);
const envelopeValid=s=>safeId(s?.sourceId)&&typeof s.entityType==='string'&&Boolean(s.entityType.trim())&&
  typeof(s.sourceVersion??s.version)==='string'&&Boolean((s.sourceVersion??s.version).trim())&&
  ['proposed','draft','approved','superseded','retired'].includes(s.status)&&
  ['player','gm','reveal_gated'].includes(s.visibility)&&
  (s.scope==null||DEFINITION_SCOPES.includes(s.scope))&&
  Array.isArray(s.provenance?.sources)&&Array.isArray(s.refs)&&s.refs.every(r=>
    r&&typeof r.relation==='string'&&r.relation.trim()&&safeId(r.target_id)&&['required','optional'].includes(r.mode));

/** Returns a safe minimal binding: never the raw flags or the source record. */
function binding(row){const s=row.source;const native=!row.binding;
  return {id:s.sourceId,entityType:s.entityType,kind:native?'native':'domain',
    ...(native?{uuid:row.doc.uuid}:{providerId:row.binding.providerId,recordKey:row.binding.recordKey}),
    version:s.sourceVersion??s.version,...(typeof row.doc?.name==='string'?{title:row.doc.name}:{})};}
function visible(row,user,isRevealed=()=>false){
  if(user?.isGM===true)return true;
  if(!user)return false;
  if(row.source.visibility==='gm')return false;
  if(row.source.visibility==='reveal_gated') {
    try {if(isRevealed(row,user)!==true)return false;}catch{return false;}
  }
  try {return (row.binding?row.canRead?.(user)===true:row.doc.testUserPermission?.(user,'OBSERVER')===true) &&
    (!row.pack || row.pack.testUserPermission?.(user,'OBSERVER')===true);}catch{return false;}
}
function entryStatus(doc,source){
  if(archived(doc))return 'archived';
  if(!source)return 'not_managed';
  if(!envelopeValid(source))return 'invalid_metadata';
  if(typeof doc.uuid!=='string'||!doc.uuid.match(/^(?:Item|Actor|JournalEntry|RollTable|Macro|Compendium)\./))return 'invalid_uuid';
  return 'ok';
}

/**
 * Manager-facing native reader: world documents and explicitly requested packs.
 * Pack loading is GM-initiated, not an implicit world/pack priority policy.
 * Lookups always check current game.user and current document read permission.
 */
export function createManagerDefinitionReader({game,hooks,isRevealed=()=>false}={}){
  if(!game?.user)throw new TypeError('Foundry game with authenticated user is required');
  // Optional adapter must not break Manager startup under unusual Foundry hooks
  // or test mocks. Without hooks callers can refresh() explicitly.
  const supportsHooks=typeof hooks?.on==='function' && typeof hooks?.off==='function';
  let dirty=true,disposed=false,cache=[],diagnostics=[],compendium=[],packs=[];
  let packGeneration=0;
  const providers=new Map();
  const registrations=[];
  const getUser=()=>game.user;
  function rebuild(){
    if(disposed)return false;
    const next=[],diag=[];
    for(const [type,collectionName] of [['Item','items'],['Actor','actors'],['JournalEntry','journal'],['RollTable','tables'],['Macro','macros']]){
      for(const doc of values(game[collectionName])){
        if(doc?.parent||doc?.pack)continue; // no embedded Actor items or implicit packs
        const source=srcFlag(doc),result=entryStatus(doc,source);
        if(result==='archived'||result==='not_managed')continue;
        if(result!=='ok'){diag.push({documentType:type,uuid:doc.uuid??null,code:result});continue;}
        next.push({doc,source});
      }
    }
    // DEC-0078: unique world source overrides matching-type compendium copies.
    // Equal-priority and mixed-type duplicates remain explicit conflicts.
    try {
      const supplied=[];
      for(const [providerId,fn] of providers){
        const entries=fn();
        if(!Array.isArray(entries))throw new Error(`Provider ${providerId} must return synchronous records`);
        for(const item of entries){
          const record=item?.record;
          if(!record||item.binding?.kind!=='domain'||typeof item.canRead!=='function' ||
            !safeId(record.id)||item.binding.providerId!==providerId)
            throw new Error(`Invalid domain provider row from ${providerId}`);
          const source={sourceId:record.id,entityType:record.entity_type,status:record.status,
            version:record.version,provenance:record.provenance,visibility:record.visibility,refs:record.refs,scope:record.scope};
          if(!envelopeValid(source))throw new Error(`Invalid canonical envelope from ${providerId}`);
          supplied.push({source,binding:item.binding,canRead:item.canRead,rawRecord:structuredClone(record)});
        }
      }
      cache=[...next,...supplied,...compendium];diagnostics=diag;dirty=false;
    } catch(e) { cache=[];diagnostics=[{code:'provider_failure',message:String(e.message??e)}];dirty=false; }
    
    return true;
  }
  function rows(){if(disposed)return [];if(dirty)rebuild();return cache;}
  // Matches Archie's DEC-0078 selection semantics, pinned to the shared
  // resolver consumer contract: never resolve ambiguities by names or order.
  function select(group){
    if(!group.length)return {row:null,conflicts:[],shadowed:[]};
    const active=group.filter(x=>!['retired','superseded'].includes(x.source.status));
    if(!active.length)return group.length===1
      ? {row:group[0],conflicts:[],shadowed:[]}
      : {row:null,conflicts:group,shadowed:[]};
    if(active.length===1)return {row:active[0],conflicts:[],shadowed:group.filter(x=>x!==active[0])};
    const worlds=active.filter(x=>x.doc&&!x.pack);
    const packs=active.filter(x=>x.pack);
    if(worlds.length===1 && packs.length===active.length-1 &&
       packs.every(x=>x.source.entityType===worlds[0].source.entityType))
      return {row:worlds[0],conflicts:[],shadowed:group.filter(x=>x!==worlds[0])};
    return {row:null,conflicts:active,shadowed:[]};
  }
  function selected(id){return select(rows().filter(x=>x.source.sourceId===id));}
  function resolve(id,{entityType,expectedVersion}={}){
    if(!safeId(id))return statusOnly('invalid_id');
    const user=getUser(),choice=selected(id);
    if(choice.conflicts.length)return user?.isGM?{
      status:'conflict',count:choice.conflicts.length,candidates:choice.conflicts.map(binding)
    }:statusOnly('not_found');
    const row=choice.row;
    if(!row)return statusOnly('not_found');
    // Never fall through from unreadable world override to readable pack.
    if(!visible(row,user,isRevealed))return statusOnly('not_found');
    if(entityType && entityType!==row.source.entityType)return statusOnly('type_mismatch');
    if(['retired','superseded'].includes(row.source.status))return statusOnly('inactive');
    const version=row.source.sourceVersion??row.source.version;
    if(expectedVersion&&expectedVersion!==version)return user?.isGM?
      {status:'stale',expectedVersion,actualVersion:version}:statusOnly('not_found');
    return {status:'ok',binding:binding(row)};
  }
  function list({entityType}={}){
    return [...new Set(rows().map(x=>x.source.sourceId))]
      .map(id=>resolve(id,{entityType})).filter(x=>x.status==='ok')
      .map(x=>x.binding).sort((a,b)=>a.id.localeCompare(b.id));
  }
  function checkReferences(){
    const byId=new Map();
    for(const row of rows()){
      const id=row.source.sourceId;
      if(!byId.has(id))byId.set(id,[]);
      byId.get(id).push(row);
    }
    const missing=[],requiredFailures=[],optionalGaps=[],ambiguousBindings=[],worldOverrides=[];
    for(const [id,group] of byId){
      const match=select(group);
      if(match.conflicts.length){ambiguousBindings.push({id,candidates:match.conflicts.map(binding)});continue;}
      if(match.shadowed.length)worldOverrides.push({id,selected:binding(match.row),shadowed:match.shadowed.map(binding)});
      if(!match.row||['retired','superseded'].includes(match.row.source.status))continue;
      for(const ref of match.row.source.refs){
        const target=select(byId.get(ref.target_id)||[]);
        let code=null;
        if(target.conflicts.length)code='ambiguous_target';
        else if(!target.row)code='missing_target';
        else if(['retired','superseded'].includes(target.row.source.status))code='inactive_target';
        if(!code)continue;
        const gap={from:id,to:ref.target_id,relation:ref.relation,mode:ref.mode,code};
        if(code==='missing_target')missing.push({from:id,to:ref.target_id,relation:ref.relation,mode:ref.mode});
        (ref.mode==='required'?requiredFailures:optionalGaps).push(gap);
      }
    }
    return {missing,requiredFailures,optionalGaps,ambiguousBindings,worldOverrides};
  }
  function validateReferences(){
    if(!getUser()?.isGM)return {status:'forbidden'};
    const o=checkReferences();
    return {status:o.requiredFailures.length||o.ambiguousBindings.length?'failed':'ok',
      requiredFailures:o.requiredFailures,optionalGaps:o.optionalGaps,ambiguousBindings:o.ambiguousBindings};
  }
  function audit(){
    if(!getUser()?.isGM)return statusOnly('forbidden');
    const all=rows(),o=checkReferences();
    return {status:'ok',indexed:all.length,duplicates:o.ambiguousBindings,missing:o.missing,
      requiredFailures:o.requiredFailures,optionalGaps:o.optionalGaps,worldOverrides:o.worldOverrides,
      worldDiagnostics:diagnostics.map(x=>({...x})),configuredPacks:[...packs],registeredProviders:[...providers.keys()]};
  }
  function invalidate(){dirty=true;}
  const changed=doc=>{if(!doc?.pack&&!doc?.parent)invalidate();};
  if(supportsHooks)for(const name of HOOKS)registrations.push([name,hooks.on(name,changed)]);
  async function loadCompendiums(packIds){
    if(!getUser()?.isGM)throw new Error('Only the GM may configure shared-definition pack readers');
    if(!Array.isArray(packIds)||packIds.some(x=>typeof x!=='string'||!x.trim())||new Set(packIds).size!==packIds.length)
      throw new TypeError('Provide unique explicit pack IDs');
    const next=await loadCompendiumSnapshot(packIds);
    // All-or-nothing replacement: pack load errors do not expose partial indexes.
    packs=[...packIds];compendium=next;invalidate();return {status:'ok',packs:[...packs],documents:next.length};
  }
  function registerProvider({providerId,readEntries}={}){
    if(disposed)throw new Error('resolver disposed');
    if(!getUser()?.isGM)throw new Error('Only the GM may register Manager-side definition providers');
    if(!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(providerId??'')||typeof readEntries!=='function')
      throw new TypeError('Expected module providerId and readEntries function');
    if(providers.has(providerId))throw new Error(`Duplicate provider ${providerId}`);
    providers.set(providerId,readEntries);invalidate();let alive=true;
    return Object.freeze({providerId,unregister(){if(!alive)return false;alive=false;
      if(providers.get(providerId)!==readEntries)return false;providers.delete(providerId);invalidate();return true;}});
  }
  function readSource(id,options){
    if(!getUser()?.isGM)return {status:'not_found'};
    const answer=resolve(id,options);
    if(answer.status!=='ok')return answer;
    const row=selected(id).row;
    return {...answer,record:structuredClone(row.rawRecord??readStoredDefinition(row.source))};
  }
  async function refreshCompendiums(){
    if(!getUser()?.isGM)throw new Error('Only the GM may refresh Manager compendium configuration');
    const generation=++packGeneration;
    // Never expose stale documents while reload is pending, even to a GM.
    compendium=[];invalidate();
    if(disposed)return {status:'unavailable'};
    try{
      const result=await loadCompendiumSnapshot(packs);
      if(disposed||generation!==packGeneration)return {status:'superseded'};
      compendium=result;invalidate();return {status:'ok',count:result.length};
    }catch{
      if(disposed||generation!==packGeneration)return {status:'superseded'};
      compendium=[];invalidate();return {status:'unavailable'};
    }
  }
  async function loadCompendiumSnapshot(packIds){
    const next=[];
    for(const id of packIds){
      const pack=game.packs?.get?.(id);
      if(!pack?.getDocuments)throw new Error('Compendium unavailable: '+id);
      const docs=await pack.getDocuments();
      if(!Array.isArray(docs))throw new Error('Invalid compendium documents: '+id);
      for(const doc of docs){
        const source=srcFlag(doc);
        if(entryStatus(doc,source)==='ok'&&doc.uuid.startsWith('Compendium.'))next.push({doc,source,pack});
      }
    }
    return next;
  }
  const capabilities=Object.freeze({contract:READER_CONTRACT,readOnly:true,
    sources:Object.freeze(['world','domain','registered_provider','configured_compendium']),
    gmSourceRead:true,managerRequired:false});
  function getState(){return {contract:READER_CONTRACT,source:'manager-native-reader',
    ready:!disposed,scope:'world-plus-explicit-compendiums',moduleIndependent:false,readOnly:true};}
  function dispose(){if(disposed)return;disposed=true;packGeneration++;cache=[];compendium=[];providers.clear();
    for(const [name,id] of registrations)hooks.off(name,id??changed);registrations.length=0;}
  return Object.freeze({contract:READER_CONTRACT,capabilities,getState,resolve,list,readSource,audit,validateReferences,registerProvider,
    refresh(){invalidate();return !disposed;},refreshCompendiums,loadCompendiums,dispose});
}

