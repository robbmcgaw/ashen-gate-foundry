/**
 * Allow retired ids again (0.100.0). Pure logic plus one GM-only data-layer function; no Foundry globals.
 *
 * Sync remembers every id it deleted, and every old id a `supersedes` replaced, in the world setting `syncRetiredIds` so an
 * id is never imported again by accident. When an earlier Sync deleted records only because their files were not chosen,
 * the pack is right and that memory is what blocks the records. This lets the GM take chosen ids off the list.
 *
 * Rules (enforced here, not only by hiding the button):
 *  1. GM only: a non-GM caller throws.
 *  2. An id retired through `supersedes` stays retired. Going forward those ids are also written to `syncSupersededIds`.
 *     Older data does not say which ids were superseded, so an id is allowed only when the package being previewed carries
 *     a record with that exact id (the package defines it, so the GM means it) and it is not the old side of any
 *     `supersedes` in that package nor in the `syncSupersededIds` list.
 *  3. Only the ids asked for are removed; running it again changes nothing.
 */
import {SYNC_RETIRED_SETTING} from './sync.js';

export const SYNC_SUPERSEDED_SETTING = 'syncSupersededIds';
export const RETIRED_REASON = 'This id was deleted by an earlier sync and stays retired (ids are never reused). Give the record a new id.';
export const REFUSAL = Object.freeze({
  superseded: 'A newer record replaced this id (supersedes), so it stays retired.',
  notInPackage: 'The package being previewed has no record with this id. Preview the package that carries it first.',
  invalid: 'Not a valid id.'
});

/** The text of the confirmation (the dialog title is `Allow N id(s) again?`, its button `Allow ids`). */
export const allowTitle = n => `Allow ${n} ${n === 1 ? 'id' : 'ids'} again?`;
export const ALLOW_BUTTON = 'Allow ids';
export const allowConfirmText = n => `${n === 1 ? 'This id was' : `These ${n} ids were`} removed by an earlier Sync. Allowing ${n === 1 ? 'it' : 'them'} lets the next Sync create ${n === 1 ? 'the record' : 'the records'} again from the pack. Nothing else changes: no document in your world is touched, and an id that a newer record replaced stays retired.`;

const list = v => Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];

/**
 * Sorts ids into allowed (to remove from the retired list), unchanged (not on it already) and refused with a reason.
 * `set` is the Sync set of the package being previewed (buildSyncSet); `superseded` the saved syncSupersededIds.
 */
export function planAllowRetired({ids, retired, superseded, set}) {
  const gone = new Set(list(retired)), memo = new Set(list(superseded));
  const allowed = [], unchanged = [], refused = [];
  for (const id of [...new Set(Array.isArray(ids) ? ids : [])]) {
    if (typeof id !== 'string' || !id.trim()) { refused.push({id: String(id), reason: REFUSAL.invalid}); continue; }
    if (memo.has(id) || set?.supersedes?.has?.(id)) { refused.push({id, reason: REFUSAL.superseded}); continue; }
    if (!gone.has(id)) { unchanged.push(id); continue; }
    if (!set?.records?.has?.(id)) { refused.push({id, reason: REFUSAL.notInPackage}); continue; }
    allowed.push(id);
  }
  return {allowed, unchanged, refused};
}

/** True when the preview may offer to allow this id (the same test as the data layer, without reading the retired list). */
export const canAllowId = (id, {superseded, set}) => !list(superseded).includes(id) && !set?.supersedes?.has?.(id) && Boolean(set?.records?.has?.(id));

/**
 * GM only. Removes the allowed ids, and only those, from `syncRetiredIds`. Returns {allowed, refused:[{id,reason}], unchanged}.
 * `allowed` holds the ids taken off the list by this call; `unchanged` ids were not retired (nothing to do).
 */
export async function allowRetiredIds(game, moduleId, ids, {set} = {}) {
  if (!game?.user?.isGM) throw new Error('Only a GM can allow retired ids again.');
  if (!Array.isArray(ids)) throw new TypeError('allowRetiredIds needs a list of ids.');
  const retired = list(game.settings.get(moduleId, SYNC_RETIRED_SETTING));
  const superseded = list(game.settings.get(moduleId, SYNC_SUPERSEDED_SETTING));
  const plan = planAllowRetired({ids, retired, superseded, set});
  if (plan.allowed.length) {
    const drop = new Set(plan.allowed);
    await game.settings.set(moduleId, SYNC_RETIRED_SETTING, retired.filter(id => !drop.has(id)));
  }
  return plan;
}

/** Remembers superseded old ids apart from the retired list (GM-run Sync only). Idempotent. */
export async function noteSupersededIds(game, moduleId, oldIds) {
  const prior = list(game.settings.get(moduleId, SYNC_SUPERSEDED_SETTING));
  const next = [...new Set([...prior, ...list(oldIds)])].sort();
  if (next.length !== prior.length) await game.settings.set(moduleId, SYNC_SUPERSEDED_SETTING, next);
}
