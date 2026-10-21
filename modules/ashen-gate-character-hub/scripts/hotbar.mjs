/**
 * Quick bar (0.13.0): a free hotbar per character. The player drags in things the character owns (its weapons,
 * spells, features, items) or a Macro they can use. Saved on the character Actor in
 * flags['ashen-gate-character-hub'].hotbar = [{type: 'Item'|'Macro', id|uuid} | null] × HOTBAR_SLOTS.
 * A click uses the Item through dnd5e (item.use) or runs the Macro (Foundry's own permission check).
 */
import {MODULE_ID} from './constants.mjs';
import {canEdit} from './actions.mjs';
import {requirePart} from './visibility.mjs';
import {useItem} from './item-actions.mjs';

export const HOTBAR_SLOTS = 10;
const FLAG = 'hotbar';
const refuse = error => ({ok: false, error});

const cleanSlot = s => s && typeof s === 'object'
  ? s.type === 'Item' && typeof s.id === 'string' && s.id ? {type: 'Item', id: s.id}
  : s.type === 'Macro' && typeof s.uuid === 'string' && s.uuid.startsWith('Macro.') ? {type: 'Macro', uuid: s.uuid} : null
  : null;
/** The stored slots, always HOTBAR_SLOTS long; anything odd reads as empty. */
export function hotbarSlots(actor) {
  const raw = actor?.flags?.[MODULE_ID]?.[FLAG];
  return Array.from({length: HOTBAR_SLOTS}, (x, i) => cleanSlot(Array.isArray(raw) ? raw[i] : null));
}
/** Slots resolved for display: {slot, doc, name, img, missing}. */
export function hotbarData(actor) {
  return hotbarSlots(actor).map((slot, i) => {
    if (!slot) return {index: i, slot: null};
    const doc = slot.type === 'Item' ? actor.items?.get?.(slot.id) : (() => { try { return globalThis.fromUuidSync?.(slot.uuid) ?? null; } catch { return null; } })();
    return {index: i, slot, doc, name: doc?.name ?? 'Missing', img: doc?.img ?? 'icons/svg/hazard.svg', missing: !doc};
  });
}
const guard = actor => canEdit(actor) ? requirePart('hotbars') : refuse(`You don't own ${actor?.name ?? 'this character'}, so you can't change its quick bar.`);
const write = (actor, slots) => actor.update({[`flags.${MODULE_ID}.${FLAG}`]: slots.map(cleanSlot)});

/**
 * Puts a dropped document in a slot (or the first free one). Items must belong to this character (drag them from the
 * Hub or the character's sheet); Macros must be world Macros the user can use.
 */
export async function setHotbarSlot(actor, index, doc) {
  const blocked = guard(actor); if (blocked) return blocked;
  const slots = hotbarSlots(actor);
  const at = index === null || index === undefined || index === '' ? slots.findIndex(s => !s) : Math.trunc(Number(index));
  if (!(at >= 0 && at < HOTBAR_SLOTS)) return refuse('The quick bar is full. Clear a slot first (right-click it).');
  let entry = null;
  if (doc?.documentName === 'Item') {
    if (doc.parent !== actor && doc.actor !== actor) return refuse(`Only ${actor.name}'s own items go on the quick bar. Drag it from this character's items.`);
    entry = {type: 'Item', id: doc.id};
  } else if (doc?.documentName === 'Macro') {
    const user = globalThis.game?.user;
    if (doc.pack || !String(doc.uuid ?? '').startsWith('Macro.')) return refuse('Import the macro into the world first.');
    if (!user?.isGM && doc.testUserPermission?.(user, 'LIMITED') !== true) return refuse(`You can't use ${doc.name}.`);
    entry = {type: 'Macro', uuid: doc.uuid};
  } else return refuse('Drop one of this character\'s items or a macro here.');
  slots[at] = entry;
  await write(actor, slots);
  return {ok: true, result: at};
}
export async function clearHotbarSlot(actor, index) {
  const blocked = guard(actor); if (blocked) return blocked;
  const slots = hotbarSlots(actor), at = Math.trunc(Number(index));
  if (!(at >= 0 && at < HOTBAR_SLOTS)) return refuse('Unknown slot.');
  slots[at] = null;
  await write(actor, slots);
  return {ok: true};
}
/** Uses the slot: dnd5e's item.use() for an Item, Macro#execute for a Macro. */
export async function useHotbarSlot(actor, index, event) {
  const blocked = guard(actor); if (blocked) return blocked;
  const d = hotbarData(actor)[Math.trunc(Number(index))];
  if (!d?.slot) return refuse('That slot is empty. Drag an item or a macro onto it.');
  if (d.missing) return refuse('That item or macro is gone. Right-click the slot to clear it.');
  if (d.slot.type === 'Item') return useItem(actor, d.slot.id, event);
  const macro = d.doc;
  if (macro.canExecute === false) return refuse(`You can't run ${macro.name}.`);
  try { return {ok: true, result: await macro.execute?.({actor})}; } catch (err) { return refuse(`${macro.name}: ${err?.message ?? err}`); }
}
