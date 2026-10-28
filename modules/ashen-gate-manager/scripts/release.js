/**
 * Releasing player-visible records (0.55.0). Manager used to create every imported world document with a default
 * ownership of None, so a record whose source says `approved` + `visibility: 'player'` still could not be read by
 * players, and partners (Profession Ledger, Utilities, ...) reported it as "Unreleased".
 *
 * The rule, in one place:
 *  - Release means the world document's DEFAULT ownership is Observer. Only Items, Journal entries and Actors
 *    carry the rule; Tables and Macros are never released.
 *  - A record is released only when its status is `approved` AND its visibility is `player`. `gm`, `reveal_gated`
 *    and anything not approved stay None.
 *  - Only a default of exactly None is ever raised, and never lowered. Per-user entries are never touched.
 *  - Manager remembers the default it last set (`flags.ashen-gate-manager.ownershipBaseline`). A document whose
 *    baseline is Observer but whose default is None was lowered by the GM on purpose and is left alone. Documents
 *    imported before 0.55.0 have no baseline; their None is Manager's old default, so they are offered for release.
 * Pure logic with the Foundry calls injected, so the Node suite covers it.
 */
export const MODULE_ID = 'ashen-gate-manager';
export const BASELINE_FLAG = 'ownershipBaseline';
export const RELEASE_KINDS = Object.freeze(['Item', 'JournalEntry', 'Actor']);
export const KIND_LABEL = Object.freeze({Item: 'Items', JournalEntry: 'Journal entries', Actor: 'Actors'});
/** Foundry's CONST.DOCUMENT_OWNERSHIP_LEVELS values, so the Node suite needs no globals. */
export const LEVEL = Object.freeze({NONE: 0, OBSERVER: 2});
export const CHUNK = 50;
const EXAMPLES = 8;

/**
 * 0.72.0: who may read the Items Manager creates. 'gm' (the default for a new install): Items are created hidden (default ownership
 * None) and a later update never raises them; the GM releases chosen folders or records with the Release tool. 'player': the
 * 0.55.0 rule above. Journals and Actors always follow the 0.55.0 rule. Handout Items (entity type HandoutItem) are player-facing
 * by design and always follow it, so an item link in a revealed handout still opens. main.js sets this from the world setting.
 */
export const ITEMS_READABLE_SETTING = 'itemsReadable';
export const ITEMS_POLICIES = Object.freeze(['gm', 'player']);
export const PLAYER_FACING_ITEM_TYPES = Object.freeze(['HandoutItem']);
let itemsPolicy = 'player';
export function setItemsPolicy(value) { itemsPolicy = value === 'gm' ? 'gm' : 'player'; return itemsPolicy; }
export const getItemsPolicy = () => itemsPolicy;

/** The raw 0.55.0 test: approved and `player` visibility, on a kind that carries it (ignores the Items policy). */
export function approvedPlayerSource(source, kind) {
  return RELEASE_KINDS.includes(kind) && source?.status === 'approved' && source?.visibility === 'player';
}
/** True when a source record is meant to be readable by players now: approved, `player` visibility, and allowed by the Items policy. */
export function playerVisible(source, kind) {
  if (!approvedPlayerSource(source, kind)) return false;
  if (kind === 'Item' && itemsPolicy === 'gm' && !PLAYER_FACING_ITEM_TYPES.includes(source?.entityType ?? source?.entity_type)) return false;
  return true;
}

/** The default ownership Manager gives a document it creates for `record` (a source record or source flag). */
export function initialOwnership(record, kind, levels = LEVEL) {
  return playerVisible(record, kind) ? levels.OBSERVER : levels.NONE;
}

/**
 * Can the document's default be raised to Observer? `doc` is a world document (or a stand-in with ownership, flags and
 * documentName); `source` its Manager source flag. Returns false for anything but a plain None default the GM has not
 * chosen on purpose.
 */
export function releasable(doc, source, levels = LEVEL) {
  if (!source || !playerVisible(source, doc?.documentName)) return false;
  if (doc?.flags?.[MODULE_ID]?.lifecycle?.archived) return false;
  if ((doc?.ownership?.default ?? levels.NONE) !== levels.NONE) return false;
  const baseline = doc?.flags?.[MODULE_ID]?.[BASELINE_FLAG];
  return baseline === undefined || baseline === null || baseline === levels.NONE;
}

/** The update that releases one document: default ownership plus the baseline Manager now stands behind. */
export function releaseUpdate(doc, levels = LEVEL) {
  return {_id: doc.id, 'ownership.default': levels.OBSERVER, [`flags.${MODULE_ID}.${BASELINE_FLAG}`]: levels.OBSERVER};
}

/**
 * Preview: counts by kind, a few examples, and the update list. `docs` is every Manager-bound world document and
 * `sourceOf(doc)` reads its source flag. Nothing is written.
 */
export function previewRelease(docs, sourceOf, levels = LEVEL) {
  const byKind = {}, examples = [], targets = [];
  let alreadyReleased = 0;
  for (const doc of docs) {
    const source = sourceOf(doc);
    if (!source || !playerVisible(source, doc.documentName)) continue;
    if (!releasable(doc, source, levels)) {
      if ((doc.ownership?.default ?? levels.NONE) >= levels.OBSERVER) alreadyReleased++;
      continue;
    }
    byKind[doc.documentName] = (byKind[doc.documentName] ?? 0) + 1;
    targets.push(doc);
    if (examples.length < EXAMPLES) examples.push({kind: doc.documentName, name: doc.name, id: source.sourceId ?? doc.id});
  }
  return {total: targets.length, byKind, kinds: RELEASE_KINDS.filter(k => byKind[k]).map(k => ({kind: k, label: KIND_LABEL[k], count: byKind[k]})),
    examples, alreadyReleased, targets};
}

/** One-line summary of a preview, used by the window and the pre-session check. */
export function previewText(preview) {
  if (!preview.total) return 'Every approved, player-visible record is already visible to players.';
  const parts = preview.kinds.map(k => `${k.count} ${k.label.toLowerCase()}`).join(', ');
  return `${preview.total} approved, player-visible record(s) are hidden from players (${parts}).`;
}

/**
 * Applies a preview in chunks. `write(kind, updates)` does the Foundry update; `onProgress({done,total})` runs after each
 * chunk and `signal` (an AbortSignal) stops between chunks. Re-checks each target first, so a document the GM changed
 * after the preview is skipped, and running it again after it finished does nothing.
 */
export async function applyRelease(preview, sourceOf, {write, onProgress = () => {}, signal = null, yieldToUI = () => new Promise(r => setTimeout(r, 0)), levels = LEVEL} = {}) {
  const live = preview.targets.filter(doc => releasable(doc, sourceOf(doc), levels));
  const skipped = preview.targets.length - live.length;
  let done = 0, cancelled = false;
  const byKind = {};
  for (let n = 0; n < live.length; n += CHUNK) {
    if (signal?.aborted) { cancelled = true; break; }
    const chunk = live.slice(n, n + CHUNK);
    for (const kind of RELEASE_KINDS) {
      const part = chunk.filter(d => d.documentName === kind);
      if (!part.length) continue;
      await write(kind, part.map(d => releaseUpdate(d, levels)));
      byKind[kind] = (byKind[kind] ?? 0) + part.length;
    }
    done += chunk.length;
    onProgress({done, total: live.length});
    await yieldToUI();
  }
  const message = cancelled
    ? `Stopped after ${done} of ${live.length} record(s). Those are released; run it again to finish.`
    : live.length ? `Released ${done} record(s) to players${skipped ? `; ${skipped} changed since the preview and were left alone` : ''}.`
      : skipped ? `Nothing released: ${skipped} record(s) changed since the preview and were left alone.` : 'Nothing to release.';
  return {ok: true, released: done, skipped, cancelled, byKind, message};
}
