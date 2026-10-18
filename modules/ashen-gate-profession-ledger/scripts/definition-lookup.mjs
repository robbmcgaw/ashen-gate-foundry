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
  const docs=[...(game?.items?.contents??[]),...(game?.journal?.contents??[]),
    ...(game?.actors?.contents??[]),...(game?.tables?.contents??[]),...(game?.macros?.contents??[])];
  const bindings=docs.filter(doc=>isActiveDefinition(doc)&&definitionSource(doc)?.sourceId===sourceId);
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
