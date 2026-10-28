/**
 * Hide / release world Items by folder or record (0.72.0). Pure logic with the Foundry calls injected, so the Node suite covers it.
 *
 *  - Hide: Manager-bound world Items whose DEFAULT ownership is above None become None. Handout Items (player-facing by design)
 *    are never offered. Only `ownership.default` changes (a per-user entry the GM set is never touched), plus the baseline flag
 *    Manager stands behind, so a later Sync or Import does not read the change as a GM edit. Embedded copies on Actors are
 *    separate documents and are never touched.
 *  - Release: Manager-bound world Items that are approved and player-visible in their source but whose default is None become
 *    Observer, by the GM's explicit choice (this ignores the "hidden on purpose" baseline: picking them IS the choice).
 *  - GM only, checked here. Re-checks each Item at Apply, so one changed after the preview is skipped; running it again does nothing.
 */
import {MODULE_ID, BASELINE_FLAG, LEVEL, approvedPlayerSource, PLAYER_FACING_ITEM_TYPES} from './release.js';

export const VISIBILITY_MODES = Object.freeze(['hide', 'release']);
export const CHUNK = 50;
export const NO_FOLDER = '(no folder)';

const entityOf = source => source?.entityType ?? source?.entity_type;
export const isPlayerFacing = source => PLAYER_FACING_ITEM_TYPES.includes(entityOf(source));
/** "Ashen Gate / Professions / Recipes" for a Foundry Folder (or a stand-in with name and folder). */
export function folderPathOf(folder) {
  const names = [];
  for (let f = folder, guard = 0; f && guard < 30; f = f.folder, guard++) names.unshift(f.name ?? '?');
  return names.length ? names.join(' / ') : NO_FOLDER;
}

/** Can this Item be hidden now? `source` is its Manager source flag. */
export function hideable(doc, source, levels = LEVEL) {
  if (doc?.documentName !== 'Item' || !source?.sourceId || isPlayerFacing(source)) return false;
  return (doc.ownership?.default ?? levels.NONE) > levels.NONE;
}
/** Can this Item be released now? Approved + player-visible in its source, not archived, default None. */
export function releasableByChoice(doc, source, levels = LEVEL) {
  if (doc?.documentName !== 'Item' || !source?.sourceId || !approvedPlayerSource(source, 'Item')) return false;
  if (doc?.flags?.[MODULE_ID]?.lifecycle?.archived) return false;
  return (doc.ownership?.default ?? levels.NONE) <= levels.NONE;
}
const test = (mode, doc, source, levels) => mode === 'hide' ? hideable(doc, source, levels) : releasableByChoice(doc, source, levels);

export function visibilityUpdate(mode, doc, levels = LEVEL) {
  const to = mode === 'hide' ? levels.NONE : levels.OBSERVER;
  return {_id: doc.id, 'ownership.default': to, [`flags.${MODULE_ID}.${BASELINE_FLAG}`]: to};
}

/**
 * Preview: {mode, total, groups:[{key, label, items:[{uuid, id, name, sourceId, doc}]}], keptHandouts}. Groups are folders, sorted by
 * path; items by name. Nothing is written. `docs` is every Manager-bound world document.
 */
export function planVisibility(mode, docs, sourceOf, levels = LEVEL) {
  if (!VISIBILITY_MODES.includes(mode)) throw new Error(`Unknown mode ${mode}`);
  const byFolder = new Map();
  let keptHandouts = 0, total = 0;
  for (const doc of docs ?? []) {
    if (doc?.documentName !== 'Item') continue;
    const source = sourceOf(doc);
    if (mode === 'hide' && source?.sourceId && isPlayerFacing(source) && (doc.ownership?.default ?? levels.NONE) > levels.NONE) { keptHandouts++; continue; }
    if (!test(mode, doc, source, levels)) continue;
    const label = folderPathOf(doc.folder);
    if (!byFolder.has(label)) byFolder.set(label, []);
    byFolder.get(label).push({uuid: doc.uuid, id: doc.id, name: doc.name ?? '', sourceId: source.sourceId, doc});
    total++;
  }
  const groups = [...byFolder].sort((a, b) => a[0].localeCompare(b[0])).map(([label, items]) => ({key: label, label, items: items.sort((a, b) => a.name.localeCompare(b.name))}));
  return {mode, total, groups, keptHandouts};
}

/**
 * Applies the chosen Items (`selected`: a Set of uuids). GM only. `write(updates)` does the Foundry update of world Items.
 * Returns {ok, changed, skipped, cancelled, message}.
 */
export async function applyVisibility(plan, selected, {user, sourceOf, write, onProgress = () => {}, signal = null, yieldToUI = () => new Promise(r => setTimeout(r, 0)), levels = LEVEL} = {}) {
  if (!user?.isGM) throw new Error('Only a GM can change who can read Items.');
  const chosen = plan.groups.flatMap(g => g.items).filter(i => selected.has(i.uuid));
  const live = chosen.filter(i => test(plan.mode, i.doc, sourceOf(i.doc), levels));
  const skipped = chosen.length - live.length;
  let changed = 0, cancelled = false;
  for (let n = 0; n < live.length; n += CHUNK) {
    if (signal?.aborted) { cancelled = true; break; }
    const part = live.slice(n, n + CHUNK);
    await write(part.map(i => visibilityUpdate(plan.mode, i.doc, levels)));
    changed += part.length;
    onProgress({done: changed, total: live.length});
    await yieldToUI();
  }
  const verb = plan.mode === 'hide' ? 'Hid' : 'Released';
  const to = plan.mode === 'hide' ? 'from players' : 'to players';
  const message = cancelled ? `Stopped after ${changed} of ${live.length} Item(s). Those are done; run it again to finish.`
    : live.length ? `${verb} ${changed} Item(s) ${to}${skipped ? `; ${skipped} changed since the preview and were left alone` : ''}.`
      : skipped ? `Nothing changed: ${skipped} Item(s) changed since the preview and were left alone.` : 'Nothing to change.';
  return {ok: true, changed, skipped, cancelled, message};
}
