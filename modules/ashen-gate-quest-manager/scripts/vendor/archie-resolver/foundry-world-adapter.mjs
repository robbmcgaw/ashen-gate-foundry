// TEMPORARY source adapter for the historically verified Manager source flags.
import {validateEnvelope} from './contracts.mjs';
const collectionNames=['items','actors','journal','tables','macros'];
export function isArchivedManagerDocument(doc) {
  return doc?.flags?.['ashen-gate-manager']?.lifecycle?.archived === true;
}
function iterable(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === 'function') return [...collection.values()];
  return [];
}
export function readLegacyManagerRecord(doc) {
  const s=doc?.flags?.['ashen-gate-manager']?.source;
  if (!s || typeof s!=='object') return null;
  return {
    id:s.sourceId, entity_type:s.entityType, status:s.status,
    version:s.sourceVersion ?? s.version, provenance:s.provenance,
    visibility:s.visibility, refs:s.refs, ...(s.scope?{scope:s.scope}:{})
  };
}
export function collectFoundryWorldEntries({game}={}) {
  if (!game) throw new Error('Foundry game object is required');
  const entries=[],diagnostics=[];
  for(const name of collectionNames) for(const doc of iterable(game[name])) {
    if (isArchivedManagerDocument(doc)) continue;
    const record=readLegacyManagerRecord(doc);
    if (!record) continue;
    const errors=validateEnvelope(record);
    if (errors.length){diagnostics.push({collection:name,id:doc.id ?? null,code:'incomplete_source_metadata',errors});continue;}
    if(typeof doc.uuid!=='string' || !doc.uuid.trim()){
      diagnostics.push({collection:name,id:doc.id ?? null,code:'missing_foundry_uuid'});continue;
    }
    entries.push({record,binding:{kind:'native',uuid:doc.uuid},publicTitle:doc.name,
      canRead:(who)=>{
        if (!who || who.isGM === true) return false;
        if (typeof doc.testUserPermission!=='function') return false;
        try {return doc.testUserPermission(who,'OBSERVER')===true;} catch{return false;}
      }});
  }
  return {entries, diagnostics};
}
