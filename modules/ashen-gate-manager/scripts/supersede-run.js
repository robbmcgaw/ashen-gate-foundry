/**
 * `supersedes` (0.64.0): what happens beyond the rebound document itself. Pure helpers with injected Foundry bits, so the
 * Node suite covers them.
 *  - Partner modules (feature-detected): api.supersedeIds({OLD: 'NEW'}, {dryRun}) renames keys in THEIR OWN saved state.
 *    A module that is absent, off, or older than this feature is simply not called.
 *  - Manager's own references: other documents' source `refs` and the NPC Codex's GM-added `links` that named an old id.
 * Everything here is GM only, idempotent, and does nothing for an id that is not present.
 */
import {MODULE_ID} from './core.js';
import {PARTNER_API, rewriteRefs} from './supersedes.js';

/** The Ashen Gate modules that may hold ids. Others are never called. */
export const PARTNER_MODULES = Object.freeze([
  {id: 'ashen-gate-factions', label: 'Renown'},
  {id: 'ashen-gate-quest-manager', label: 'Quest Log'}
]);

const toObject = map => map instanceof Map ? Object.fromEntries(map) : {...map};

/** Active partner modules that can re-key ids. */
export function partnerApis(game) {
  return PARTNER_MODULES.map(p => ({...p, api: game?.modules?.get?.(p.id)?.active ? game.modules.get(p.id).api : null}))
    .filter(p => p.api && typeof p.api[PARTNER_API] === 'function');
}

/** Read-only: what each partner would change. Returns [{id, label, changes, notes}]. A failing partner is reported, never thrown. */
export async function previewPartners(game, map, options = {}) {
  const ids = toObject(map);
  if (!Object.keys(ids).length) return [];
  const out = [];
  for (const p of partnerApis(game)) {
    try {
      const r = await p.api[PARTNER_API](ids, {...options, dryRun: true});
      out.push({id: p.id, label: p.label, changes: Number(r?.changed ?? 0), notes: r?.notes ?? []});
    } catch (e) { out.push({id: p.id, label: p.label, changes: 0, error: String(e?.message ?? e)}); }
  }
  return out;
}

/** Writes through each partner's own API. Returns import-log entries (status ok / error). */
export async function applyPartners(game, map, {user, definitions = null} = {}) {
  if (!user?.isGM) throw new Error('Only a GM can update other modules\' saved ids.');
  const ids = toObject(map), log = [];
  if (!Object.keys(ids).length) return log;
  for (const p of partnerApis(game)) {
    try {
      const r = await p.api[PARTNER_API](ids, definitions ? {definitions} : {});
      log.push({id: p.id, kind: p.label, action: 'supersede-ids', status: 'ok', message: `${p.label}: ${Number(r?.changed ?? 0)} saved id(s) re-keyed${r?.notes?.length ? ` (${r.notes.slice(0, 2).join('; ')})` : ''}.`});
    } catch (e) { log.push({id: p.id, kind: p.label, action: 'supersede-ids', status: 'error', message: `${p.label}: ${String(e?.message ?? e)}`}); }
  }
  return log;
}

/**
 * Manager's own references to the old ids: `source.refs` on every Manager-bound document and the Codex `links` on Actors.
 * docs: world documents (duck-typed: getFlag / update, documentName). dryRun counts without writing.
 */
export async function renameManagerRefs(docs, map, {user, dryRun = false} = {}) {
  if (!user?.isGM) throw new Error('Only a GM can update references.');
  const ids = toObject(map);
  let changed = 0;
  if (!Object.keys(ids).length) return {changed};
  for (const doc of docs) {
    const update = {};
    const source = doc.getFlag?.(MODULE_ID, 'source');
    if (source && Array.isArray(source.refs)) {
      const r = rewriteRefs(source.refs, ids);
      if (r.changed) update[`flags.${MODULE_ID}.source.refs`] = r.value;
    }
    if (doc.documentName === 'Actor') {
      const codex = doc.getFlag?.(MODULE_ID, 'codex');
      if (codex && Array.isArray(codex.links)) {
        const r = rewriteRefs(codex.links, ids);
        if (r.changed) update[`flags.${MODULE_ID}.codex.links`] = r.value;
      }
    }
    if (!Object.keys(update).length) continue;
    changed++;
    if (!dryRun) await doc.update(update);
  }
  return {changed};
}
