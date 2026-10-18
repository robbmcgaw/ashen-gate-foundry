// AG-WORK-0013: explicit async compendium snapshot feeding the existing
// synchronous, read-only resolver. No implicit precedence over world sources.
import {validateEnvelope} from './contracts.mjs';
import {isArchivedManagerDocument, readLegacyManagerRecord} from './foundry-world-adapter.mjs';
export async function loadCompendiumEntries({game, packIds} = {}) {
  if (!game?.packs || typeof game.packs.get !== 'function') throw new TypeError('game.packs is required');
  if (!Array.isArray(packIds) || packIds.some(id => typeof id !== 'string' || !id.trim()))
    throw new TypeError('explicit packIds array required');
  if (new Set(packIds).size !== packIds.length) throw new TypeError('duplicate pack ID');
  const entries = [], diagnostics = [];
  for (const packId of packIds) {
    const pack = game.packs.get(packId);
    if (!pack) throw new Error('configured pack unavailable: ' + packId);
    if (typeof pack.getDocuments !== 'function') throw new TypeError('pack lacks getDocuments: ' + packId);
    const docs = await pack.getDocuments();
    if (!Array.isArray(docs)) throw new TypeError('invalid documents for pack: ' + packId);
    for (const doc of docs) {
      if (isArchivedManagerDocument(doc)) continue;
      const record = readLegacyManagerRecord(doc);
      if (!record) continue;
      const errors = validateEnvelope(record);
      if (errors.length) { diagnostics.push({packId, code:'incomplete_source_metadata', errors}); continue; }
      if (typeof doc.uuid !== 'string' || !doc.uuid.startsWith('Compendium.')) {
        diagnostics.push({packId, code:'missing_compendium_uuid'}); continue;
      }
      entries.push({record,binding:{kind:'native',uuid:doc.uuid},publicTitle:doc.name,
        canRead(viewer) {
          if (!viewer || viewer.isGM) return false;
          if (typeof pack.testUserPermission !== 'function' ||
              typeof doc.testUserPermission !== 'function') return false;
          try {return pack.testUserPermission(viewer,'OBSERVER') === true &&
                     doc.testUserPermission(viewer,'OBSERVER') === true;} catch {return false;}
        }});
    }
  }
  return {entries, diagnostics};
}
