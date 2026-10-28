/**
 * Hidden feature groups (0.62.0). A character's owner or the GM can hide an Origin group (a profession such as "Professions:
 * Herbalism") from the Hub's Features tab and show it again. Display only: the Items, the Profession Ledger, Skill Trees and the
 * standard sheet's own feature list are never touched.
 *
 * Stored on the Actor in the Hub's own flag: flags.ashen-gate-character-hub.hiddenFeatureGroups, an array of Origin group keys
 * (originGroupKey, e.g. "profession-PROF-HERBALISM"). Everyone who opens that character's Hub sees the same list; only the
 * character's owners and the GM can change it (checked here, in the data layer, not only by disabling the button). A key that
 * matches no group any more (the profession was removed) is ignored and never shown or counted; writes drop such keys.
 */
import {MODULE_ID} from './constants.mjs';
import {canEdit} from './actions.mjs';

export const HIDDEN_FLAG = 'hiddenFeatureGroups';
/** Keys kept at most; a character has a handful of groups. */
export const HIDDEN_MAX = 60;
const KEY_MAX = 160;
const refuse = error => ({ok: false, error});

/** The stored keys as a Set; anything that is not a short string (or not an array) is ignored. */
export function hiddenKeys(actor) {
  const raw = actor?.flags?.[MODULE_ID]?.[HIDDEN_FLAG];
  return new Set(Array.isArray(raw) ? raw.filter(k => typeof k === 'string' && k && k.length <= KEY_MAX).slice(0, HIDDEN_MAX) : []);
}
/** Keys that name a group in `groups` ([{key}]): stale keys are left out. */
export const activeHidden = (actor, groups) => {
  const have = new Set(groups.map(g => g.key));
  return new Set([...hiddenKeys(actor)].filter(k => have.has(k)));
};

async function write(actor, keys, what) {
  if (!canEdit(actor)) return refuse(`You don't own ${actor?.name ?? 'this character'}, so you can't ${what}.`);
  const list = [...keys].slice(0, HIDDEN_MAX);
  try {
    await actor.update(list.length ? {[`flags.${MODULE_ID}.${HIDDEN_FLAG}`]: list} : {[`flags.${MODULE_ID}.-=${HIDDEN_FLAG}`]: null});
    return {ok: true, result: list};
  } catch (err) {
    console.error(`${MODULE_ID} | ${what}`, err);
    return refuse(`Could not ${what}: ${err?.message ?? err}`);
  }
}

/**
 * Hides or shows one Origin group. `groups` are the character's current groups ([{key}]): hiding needs a key that names one of them
 * (a made-up key is refused), and the write also drops stale keys. Showing works on any stored key.
 */
export async function setGroupHidden(actor, key, hidden, groups = []) {
  const k = String(key ?? '');
  if (!k || k.length > KEY_MAX) return refuse('That group cannot be hidden.');
  if (!canEdit(actor)) return refuse(`You don't own ${actor?.name ?? 'this character'}, so you can't change which groups are hidden.`);
  const have = new Set(groups.map(g => g.key)), keys = hiddenKeys(actor);
  if (hidden) {
    if (!have.has(k)) return refuse('That group is no longer on this character.');
    keys.add(k);
  } else keys.delete(k);
  return write(actor, [...keys].filter(x => !groups.length || have.has(x)), hidden ? 'hide a feature group' : 'show a feature group');
}
/** Shows every hidden group again (and clears the stored list, stale keys included). */
export const showAllGroups = actor => write(actor, [], 'show the hidden feature groups');
