/** AG-WORK-0011: source-only temporary native world-document reader.
 * Read-only, no Manager dependency, no name/UUID fallback, no compendium precedence.
 * Replace with the reviewed AG-WORK-0013 provider only after its external API is approved.
 */
export const CANONICAL_ID = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
export const ARCHIVED_FLAG = 'ashen-gate-manager';
export function definitionSource(doc) { return doc?.flags?.['ashen-gate-manager']?.source ?? null; }
export function isActiveDefinition(doc) {
  const src=definitionSource(doc);
  return !!src && doc?.flags?.[ARCHIVED_FLAG]?.lifecycle?.archived !== true &&
    src.status !== 'retired' && src.status !== 'superseded';
}
/** A player-facing projection must be readable by every present player. */
function visibleToEveryPlayer(doc, game) {
  const viewers=game?.users?.contents?.filter?.(u=>!u.isGM) ?? [];
  if(!viewers.length) return Number(doc?.ownership?.default ?? 0) >= 2;
  try { return viewers.every(u=>doc?.testUserPermission?.(u,'OBSERVER')===true); }
  catch { return false; }
}
/**
 * Active definition bindings by source id. Looking one id up used to scan every world document, which made a render
 * with ~700 recipes and ~400 materials quadratic. The index is rebuilt when the set of documents changes,
 * is always dropped at the next microtask, and every hit is re-checked, so a document edited since is never read stale.
 */
let bindingIndex=null;
const COLLECTIONS=['items','journal','actors','tables','macros'];
/** A real Foundry Collection is a Map: `size` is free, but `contents` copies the whole collection on every read. */
const hasSize=c=>c==null||typeof c.size==='number';
function activeBindings(game,sourceId){
  const cols=COLLECTIONS.map(k=>game?.[k]);
  // 0.41.0: with real Collections, a lookup used to copy all five (`contents`) and compare every document, once per lookup: a catalog
  // render made thousands of lookups, each touching every world document (quadratic). The index lives for one synchronous pass
  // (dropped at the next microtask), and nothing can add or remove a document inside it, so the sizes are enough to notice a change.
  // Anything that is not a Collection (the test doubles) still gets the full identity comparison.
  const sizes=cols.every(hasSize)?cols.map(c=>c?.size??0):null;
  let same=false;
  if(bindingIndex&&bindingIndex.game===game){
    if(sizes&&bindingIndex.sizes)same=sizes.every((n,i)=>n===bindingIndex.sizes[i]);
    else if(!sizes&&!bindingIndex.sizes){
      // Compared by document identity, not by collection: a Collection's `contents` may be a fresh array on every read.
      const docs=cols.flatMap(c=>c?.contents??[]);
      same=bindingIndex.docs.length===docs.length&&bindingIndex.docs.every((d,i)=>d===docs[i]);
    }
  }
  if(!same){
    const docs=cols.flatMap(c=>c?.contents??[]),map=new Map();
    for(const doc of docs){
      if(!isActiveDefinition(doc))continue;
      const id=definitionSource(doc)?.sourceId;
      if(typeof id!=='string')continue;
      if(map.has(id))map.get(id).push(doc);else map.set(id,[doc]);
    }
    bindingIndex={game,docs:sizes?[]:docs,sizes,map};
    queueMicrotask(()=>{bindingIndex=null;});
  }
  return (bindingIndex.map.get(sourceId)??[]).filter(doc=>isActiveDefinition(doc)&&definitionSource(doc)?.sourceId===sourceId);
}
/**
 * Conservative standalone WORLD-document fallback. The versioned Archie
 * resolver handles explicit compendium packs and domain providers; this local
 * helper does NOT claim equivalent coverage or impose a Manager dependency.
 *
 * Permission authority must always be the authenticated game.user. Never
 * trust an options.viewer object from an exported helper, macro, or console.
 */
export function lookupWorldDefinition(game,sourceId,{
  entityType=null,publicForAll=false,approvedOnly=false,expectedVersion=null,partyKnown=false
}={}) {
  if(typeof sourceId!=='string'||!CANONICAL_ID.test(sourceId))return {status:'invalid'};
  const viewer=game?.user;
  if(!viewer)return {status:'not_found'};
  const bindings=activeBindings(game,sourceId);
  if(!bindings.length)return {status:'not_found'};
  // Do not reveal whether a restricted source has competing bindings.
  if(bindings.length!==1)return {status:viewer.isGM?'conflict':'not_found'};
  const document=bindings[0],src=definitionSource(document);
  if(entityType && src.entityType!==entityType)return {status:viewer.isGM?'wrong_type':'not_found'};
  if((approvedOnly||partyKnown)&&src.status!=='approved')return {status:viewer.isGM?'not_released':'not_found'};
  if(expectedVersion!=null && (src.sourceVersion??src.version)!==expectedVersion)
    return {status:viewer.isGM?'stale':'not_found'};
  // publicForAll is for a GM publishing a sanitized common interface, never a
  // player-requested bypass of personal document permissions.
  if(publicForAll&&viewer.isGM){
    if(src.visibility!=='player'||!visibleToEveryPlayer(document,game))return {status:'not_visible'};
  }else if(!viewer.isGM){
    if(src.visibility!=='player')return {status:'not_found'};
    // partyKnown: the caller has already checked that a party member knows or
    // holds this exact ID. It still requires an approved, player-visible
    // source; it only waives Observer on the world definition document.
    if(partyKnown)return {status:'ok',document,source:src};
    try {if(document.testUserPermission?.(viewer,'OBSERVER')!==true)return {status:'not_found'};}
    catch {return {status:'not_found'};}
  }
  return {status:'ok',document,source:src};
}

/**
 * Read Manager v0.11.1's full immutable source definition from its native document.
 * A successful source-ID binding is not proof that the structured definition exists.
 * Refuse conflicting flag/definition identities rather than silently falling back
 * to presentation text, UUIDs or old recipe shapes. This performs no writes.
 */
export function readWorldDefinition(game,sourceId,options={}) {
  const match=lookupWorldDefinition(game,sourceId,options);
  if(match.status!=='ok')return {status:match.status};
  const {document,source}=match;
  const definition=source?.definition;
  if(!definition || typeof definition!=='object' || Array.isArray(definition)) {
    return {status:'missing_definition'};
  }
  if(definition.id!==sourceId || definition.entity_type!==source.entityType ||
      definition.version!==(source.sourceVersion??source.version) ||
      !Array.isArray(definition.refs) || !Array.isArray(source.refs) ||
      JSON.stringify(definition.refs)!==JSON.stringify(source.refs)) {
    return {status:'invalid_definition'};
  }
  // Do not grant a player source access through a GM-capable caller-supplied role.
  // Existing lookupWorldDefinition obtains the supplied viewer's Foundry permissions.
  return {status:'ok',definition:structuredClone(definition),document};
}
