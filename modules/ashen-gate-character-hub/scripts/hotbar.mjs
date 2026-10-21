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
/** Clears a slot. The result carries what was there ({index, previous, name}) so the sheet can offer Undo. */
export async function clearHotbarSlot(actor, index) {
  const blocked = guard(actor); if (blocked) return blocked;
  const slots = hotbarSlots(actor), at = Math.trunc(Number(index));
  if (!(at >= 0 && at < HOTBAR_SLOTS)) return refuse('Unknown slot.');
  const previous = slots[at], name = previous ? hotbarData(actor)[at].name : null;
  slots[at] = null;
  await write(actor, slots);
  return {ok: true, result: {index: at, previous, name}};
}
const sameSlot = (a, b) => !!a && !!b && a.type === b.type && a.id === b.id && a.uuid === b.uuid;
/**
 * Undo of a clear (0.26.0): puts `entry` back in slot `index`, touching no other slot. Does nothing (and says why)
 * when the item or macro is gone, or something else was put in that slot meanwhile.
 */
export async function restoreHotbarSlot(actor, index, entry, name = null) {
  const blocked = guard(actor); if (blocked) return blocked;
  const at = Math.trunc(Number(index)), want = cleanSlot(entry), label = name ?? 'That item';
  if (!(at >= 0 && at < HOTBAR_SLOTS) || !want) return refuse('Nothing to undo.');
  const doc = want.type === 'Item' ? actor.items?.get?.(want.id) : (() => { try { return globalThis.fromUuidSync?.(want.uuid) ?? null; } catch { return null; } })();
  if (!doc) return refuse(`${label} is gone, so slot ${at + 1} stays empty.`);
  const slots = hotbarSlots(actor);
  if (sameSlot(slots[at], want)) return {ok: true, result: at};
  if (slots[at]) return refuse(`Slot ${at + 1} has something else now, so it was left as it is.`);
  slots[at] = want;
  await write(actor, slots);
  return {ok: true, result: at};
}

export const UNDO_MS = 5000;
/**
 * Pending Undo notices for one sheet. Each clear gets its own entry (its own slot and Actor); a newer clear of the
 * same slot replaces the older entry. An entry expires after `ms` and the clear stands. `onChange` redraws notices.
 */
export function createUndoList({ms = UNDO_MS, onChange = () => {}, timers = globalThis} = {}) {
  const pending = new Map();
  let seq = 0;
  const drop = id => { const p = pending.get(id); if (!p) return null; timers.clearTimeout?.(p.timer); pending.delete(id); return p; };
  return {
    /** Records a clear result; returns the entry id, or null when the slot was already empty. */
    add(actor, result) {
      if (!result?.previous) return null;
      for (const [id, p] of pending) if (p.actor === actor && p.index === result.index) drop(id);
      const id = `u${++seq}`;
      const timer = timers.setTimeout?.(() => { if (drop(id)) onChange(); }, ms);
      pending.set(id, {id, actor, index: result.index, entry: result.previous, name: result.name, timer});
      onChange();
      return id;
    },
    async undo(id) {
      const p = drop(String(id));
      if (!p) return refuse('Too late to undo: the slot stays clear.');
      onChange();
      return restoreHotbarSlot(p.actor, p.index, p.entry, p.name);
    },
    list: () => [...pending.values()].map(({id, index, name}) => ({id, index, name})),
    /** The sheet closed: forget every pending undo (the clears stand). */
    clear() { for (const id of [...pending.keys()]) drop(id); }
  };
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
