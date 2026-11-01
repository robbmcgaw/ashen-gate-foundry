/**
 * Restore Ashen Gate text on linked crafted items (0.97.0). GM only, in Items > Checks.
 *
 * Before 0.97.0, adopting a core item through Core links replaced a crafted item's whole `system` with the core item's, so a
 * "Padded Bedroll" showed a core Bedroll's description, weight, price and activities. This puts the Ashen Gate text back.
 *
 *  - Targets: world Items (never Items on Actors) that have BOTH a coreLink flag marked adopted AND an Ashen Gate crafting
 *    definition (isCraftedItem: created_by_recipe_id, profession_id or tierId in the stored definition, or Ashen Gate
 *    activities or effects). Plain gear is never a target, adopted or not.
 *  - Source: the Manager source stored on the Item. `definition.foundry.data.system` when the Item carries it; otherwise the
 *    import baseline in `managedFields` (the package's own `system.*` values from the last import, which is what Manager
 *    compares Sync against). An Item with nothing stored for any of the four parts is listed and left alone.
 *  - Writes: `system.description`, `system.weight`, `system.price` and `system.activities`, each only when the stored source
 *    has it. Quantity, the source label, every other system field, effects, name, folder, ownership and flags are not touched.
 *    Activity links to effects are not part of the stored source; the next Sync or re-import links them again.
 *  - Undo-safe: the replaced values are kept in the Item's `craftedRestore` flag in the same pass; undoRestoreCrafted puts them back.
 *  - Idempotent and chunked: a restored Item is no longer marked adopted, so a second run finds nothing to do.
 *  Pure logic with the Foundry calls injected, so the Node suite covers it.
 */
import {MODULE_ID, getPath, equal, baselineFields} from './core.js';
import {isCraftedItem, LINK_FLAG} from './core-links.js';

export const RESTORE_FLAG = 'craftedRestore';
export const SECTIONS = Object.freeze(['description', 'weight', 'price', 'activities']);
export const CHUNK = 20;
const GM_ONLY = 'Only the GM can restore Ashen Gate text on items.';
const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

const setPath = (target, path, value) => {
  const keys = path.split('.'), last = keys.pop();
  keys.reduce((o, k) => (isObject(o[k]) ? o[k] : (o[k] = {})), target)[last] = value;
};

/** The stored Ashen Gate values for the four parts: {description?, weight?, price?, activities?}. Empty when nothing is stored. */
export function storedSections(flag) {
  const out = {};
  const direct = flag?.definition?.foundry?.data?.system;
  if (isObject(direct)) for (const key of SECTIONS) if (direct[key] !== undefined) out[key] = clone(direct[key]);
  if (Object.keys(out).length) return out;
  const baseline = baselineFields(flag?.managedFields) ?? {};
  for (const [path, value] of Object.entries(baseline)) {
    const [root, section, ...rest] = path.split('.');
    if (root !== 'system' || !SECTIONS.includes(section)) continue;
    if (!rest.length) out[section] = clone(value);
    else setPath(out[section] = isObject(out[section]) ? out[section] : {}, rest.join('.'), clone(value));
  }
  return out;
}

const targetState = doc => {
  const flag = getPath(doc, `flags.${MODULE_ID}.source`);
  const link = getPath(doc, `flags.${MODULE_ID}.${LINK_FLAG}`);
  if (doc?.documentName !== 'Item' && doc?.documentName !== undefined) return null;
  if (doc?.parent || !flag?.sourceId || link?.adopted !== true || !isCraftedItem(doc)) return null;
  return {flag, link};
};

/**
 * Preview: {total (will be restored), alreadyMatching (adopted but the text already matches; only the mark is cleared),
 * nothingStored (crafted and adopted, no stored source to restore from; left alone), items, targets}. Nothing is written.
 */
export function planRestoreCrafted(docs, {user} = {}) {
  if (!user?.isGM) throw new Error(GM_ONLY);
  const targets = [];
  let alreadyMatching = 0, nothingStored = 0, items = 0;
  for (const doc of docs ?? []) {
    const state = targetState(doc);
    if (!state) continue;
    items++;
    const stored = storedSections(state.flag);
    if (!Object.keys(stored).length) { nothingStored++; continue; }
    const system = doc.toObject?.()?.system ?? doc.system ?? {};
    const differs = Object.keys(stored).some(key => !equal(system[key], stored[key]));
    if (!differs) alreadyMatching++;
    targets.push({doc, id: doc.id, name: doc.name, differs});
  }
  const total = targets.filter(t => t.differs).length;
  return {total, alreadyMatching, nothingStored, items, targets};
}

export function restoreSummary(r, {done = false} = {}) {
  const n = r.restored ?? r.total;
  return `${done ? 'Restored' : 'To restore'}: ${n}, already matching (only the link mark cleared): ${r.alreadyMatching}, nothing stored to restore from (left as they are): ${r.nothingStored}.`;
}

/**
 * Applies a preview. Each Item is re-read and re-checked first. `update(doc, data, options)` writes one Item; the system part is
 * written with recursive:false (as Core links does) from the live system with only the four parts replaced.
 */
export async function applyRestoreCrafted(plan, {user, update = (doc, data, options) => doc.update(data, options), onProgress = () => {}, signal = null,
  yieldToUI = () => new Promise(r => setTimeout(r, 0)), now = () => new Date().toISOString()} = {}) {
  if (!user?.isGM) throw new Error(GM_ONLY);
  const live = plan.targets.filter(t => targetState(t.doc));
  const changedSincePreview = plan.targets.length - live.length;
  let restored = 0, cleared = 0, cancelled = false;
  const failed = [];
  for (let n = 0; n < live.length; n += CHUNK) {
    if (signal?.aborted) { cancelled = true; break; }
    for (const { doc, name } of live.slice(n, n + CHUNK)) {
      try {
        const state = targetState(doc);
        if (!state) continue;
        const stored = storedSections(state.flag);
        const raw = doc.toObject?.() ?? doc, system = clone(raw.system ?? {});
        const sections = Object.keys(stored).filter(key => !equal(system[key], stored[key]));
        const at = now();
        if (sections.length) {
          const prev = Object.fromEntries(sections.map(key => [key, clone(system[key])]));
          // Snapshot first: an interrupted run leaves the snapshot and the adopted mark, and the next run restores again.
          await update(doc, {[`flags.${MODULE_ID}.${RESTORE_FLAG}`]: {at, sections, prev, link: clone(state.link)}});
          for (const key of sections) system[key] = clone(stored[key]);
          await update(doc, {system}, {recursive: false});
          restored++;
        } else cleared++;
        const link = {...state.link, adopted: false, adoptedPaths: (state.link.adoptedPaths ?? []).filter(p => p !== 'system'), restoredAt: at};
        await update(doc, {[`flags.${MODULE_ID}.${LINK_FLAG}`]: link});
      } catch (error) { failed.push(`${name}: ${error?.message ?? error}`); }
    }
    onProgress({done: Math.min(n + CHUNK, live.length), total: live.length});
    await yieldToUI();
  }
  const out = {ok: true, restored, cleared, failed, changedSincePreview, cancelled, alreadyMatching: plan.alreadyMatching, nothingStored: plan.nothingStored};
  const tail = `${changedSincePreview ? ` ${changedSincePreview} changed since the preview and were left alone.` : ''}${failed.length ? ` ${failed.length} failed: ${failed.slice(0, 3).join('; ')}.` : ''}`;
  out.message = (cancelled ? `Stopped after ${restored + cleared} of ${live.length}. ` : '') + (restored || cleared || cancelled ? restoreSummary(out, {done: true}) : `Nothing to restore. ${restoreSummary(out, {done: true})}`) + tail;
  return out;
}

/** Puts back what the last restore replaced on each Item that still carries its snapshot, and the adopted mark. GM only. */
export async function undoRestoreCrafted(docs, {user, update = (doc, data, options) => doc.update(data, options)} = {}) {
  if (!user?.isGM) throw new Error(GM_ONLY);
  let undone = 0;
  const failed = [];
  for (const doc of docs ?? []) {
    const snap = getPath(doc, `flags.${MODULE_ID}.${RESTORE_FLAG}`);
    if (!snap?.prev || doc?.parent) continue;
    try {
      const system = clone((doc.toObject?.() ?? doc).system ?? {});
      for (const key of snap.sections ?? Object.keys(snap.prev)) system[key] = clone(snap.prev[key]);
      await update(doc, {system}, {recursive: false});
      if (snap.link) await update(doc, {[`flags.${MODULE_ID}.${LINK_FLAG}`]: clone(snap.link)});
      await doc.unsetFlag?.(MODULE_ID, RESTORE_FLAG);
      undone++;
    } catch (error) { failed.push(`${doc.name}: ${error?.message ?? error}`); }
  }
  return {ok: true, undone, failed, message: undone ? `Put back the earlier text on ${undone} item(s).` : 'There is nothing to undo.'};
}
