/**
 * Companions (AG-F07, owned by the Hub): one mount and up to a GM-set number of pets per character (none until the GM raises the limit), each an
 * Item on the character with optional "perk" Items attached. The list lives in
 * flags['ashen-gate-character-hub'].companions on the character Actor: [{id, kind, itemId, perkItemIds}] in order.
 * Caps live in world settings, which only the GM can change. Perk Items only display; nothing is applied.
 */
import {MODULE_ID, num} from './constants.mjs';
import {canEdit} from './actions.mjs';
import {requirePart} from './visibility.mjs';

export const KINDS = ['mount', 'pet'];
export const DEFAULT_PET_CAP = 0;
const FLAG = 'companions';
const refuse = error => ({ok: false, error});
const newId = () => globalThis.foundry?.utils?.randomID?.(12) ?? Math.random().toString(36).slice(2, 14);

// ---------- Caps (GM-only world settings) ----------

const getSetting = (key, fallback) => { try { const v = globalThis.game?.settings?.get(MODULE_ID, key); return v ?? fallback; } catch { return fallback; } };
export const defaultPetCap = () => { const v = Math.trunc(num(getSetting('petCap', DEFAULT_PET_CAP), DEFAULT_PET_CAP)); return v < 0 ? 0 : v; };
/** Per-character override: a number, 'none' (no pets) or 'unlimited'. Missing means the world default. */
export const petCapOverride = actor => getSetting('petCapOverrides', {})?.[actor?.id] ?? null;
/** The pet limit for this character (Infinity when unlimited). */
export function petCapFor(actor) {
  const o = petCapOverride(actor);
  if (o === 'unlimited') return Infinity;
  if (o === 'none') return 0;
  const base = o !== null && Number.isFinite(Number(o)) ? Math.max(0, Math.trunc(Number(o))) : defaultPetCap();
  return base + bonusPetSlots(actor);
}

// Hook for a later companion skill tree (nothing uses it yet): another module may register a source that grants
// extra pet slots to a character. Slots add to the GM's limit; 'none' and 'unlimited' overrides still win.
const slotSources = new Map();
export function registerPetSlotSource(id, fn) {
  if (typeof id !== 'string' || !id || typeof fn !== 'function') return refuse('registerPetSlotSource(id, fn) needs an id and a function.');
  slotSources.set(id, fn);
  return {ok: true};
}
export const unregisterPetSlotSource = id => slotSources.delete(id);
export function bonusPetSlots(actor) {
  let total = 0;
  for (const fn of slotSources.values()) { try { const n = Math.trunc(Number(fn(actor))); if (n > 0) total += n; } catch { /* a broken source grants nothing */ } }
  return total;
}
const capLabel = cap => cap === Infinity ? 'unlimited' : String(cap);

export async function setDefaultPetCap(value) {
  if (!globalThis.game?.user?.isGM) return refuse('Only the GM can change the pet limit.');
  const v = Math.trunc(num(value, NaN));
  if (!Number.isFinite(v) || v < 0) return refuse('The pet limit must be 0 or more.');
  await game.settings.set(MODULE_ID, 'petCap', v);
  return {ok: true, result: v};
}
/** value: '' (use the default), 'none', 'unlimited' or a whole number. */
export async function setPetCapOverride(actorId, value) {
  if (!globalThis.game?.user?.isGM) return refuse('Only the GM can change a character\'s pet limit.');
  const all = {...getSetting('petCapOverrides', {})};
  if (value === '' || value === null || value === undefined) delete all[actorId];
  else if (value === 'none' || value === 'unlimited') all[actorId] = value;
  else { const v = Math.trunc(num(value, NaN)); if (!Number.isFinite(v) || v < 0) return refuse('The pet limit must be 0 or more.'); all[actorId] = v; }
  await game.settings.set(MODULE_ID, 'petCapOverrides', all);
  return {ok: true, result: all[actorId] ?? null};
}

// ---------- Reading ----------

const cleanEntry = e => e && typeof e === 'object' && KINDS.includes(e.kind) && typeof e.itemId === 'string'
  ? {id: String(e.id || e.itemId), kind: e.kind, itemId: e.itemId, perkItemIds: Array.isArray(e.perkItemIds) ? [...new Set(e.perkItemIds.filter(x => typeof x === 'string'))] : []} : null;
/** Stored entries, cleaned; entries whose Item is gone are dropped (and pruned on the next write). */
export function storedCompanions(actor) {
  const raw = actor?.flags?.[MODULE_ID]?.[FLAG];
  return (Array.isArray(raw) ? raw : []).map(cleanEntry).filter(e => e && actor.items?.get?.(e.itemId));
}
/** Companions with their Items resolved, for display. */
export function companionsData(actor) {
  const entries = storedCompanions(actor).map(e => ({...e, item: actor.items.get(e.itemId), perks: e.perkItemIds.map(id => actor.items.get(id)).filter(Boolean)}));
  const cap = petCapFor(actor);
  const pets = entries.filter(e => e.kind === 'pet');
  return {mount: entries.find(e => e.kind === 'mount') ?? null, pets, cap, capLabel: capLabel(cap), overCap: pets.length > cap, entries};
}
/** Items on the character that are not already a companion or an attached perk. */
export function freeItems(actor) {
  const used = new Set(storedCompanions(actor).flatMap(e => [e.itemId, ...e.perkItemIds]));
  return [...(actor.items ?? [])].filter(i => !used.has(i.id) && !['class', 'subclass', 'background', 'race', 'spell'].includes(i.type))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

// ---------- Writing (one Actor update per change; caps enforced here) ----------

const write = (actor, entries) => actor.update({[`flags.${MODULE_ID}.${FLAG}`]: entries.map(({id, kind, itemId, perkItemIds}) => ({id, kind, itemId, perkItemIds}))});
const notOwner = actor => refuse(`You don't own ${actor?.name ?? 'this character'}, so you can't change its companions.`);
/** Owner only, and (for players) only while the GM shows Companions to players. */
const cannotChange = actor => canEdit(actor) ? requirePart('companions') : notOwner(actor);

/** Checks the one-mount rule and the pet cap for adding one more of `kind`. */
export function canAdd(actor, kind) {
  if (!KINDS.includes(kind)) return refuse(`Unknown companion kind ${kind}.`);
  const entries = storedCompanions(actor);
  if (kind === 'mount' && entries.some(e => e.kind === 'mount')) return refuse(`${actor.name} already has a mount. Remove it first.`);
  if (kind === 'pet') {
    const cap = petCapFor(actor), pets = entries.filter(e => e.kind === 'pet').length;
    if (pets >= cap) return refuse(cap === 0 ? `${actor.name} can't have pets (set by the GM).` : `${actor.name} already has ${pets} of ${capLabel(cap)} pets. Remove one first, or ask the GM to raise the limit.`);
  }
  return {ok: true};
}

/**
 * Adds an Item already on the character as a companion. For a dropped Item from elsewhere, use addDroppedCompanion,
 * which makes the embedded copy first.
 */
export async function addCompanion(actor, itemId, kind) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  const item = actor.items?.get?.(itemId);
  if (!item) return refuse('That item is not on this character.');
  const entries = storedCompanions(actor);
  if (entries.some(e => e.itemId === itemId || e.perkItemIds.includes(itemId))) return refuse(`${item.name} is already a companion or perk.`);
  const check = canAdd(actor, kind); if (!check.ok) return check;
  const entry = {id: newId(), kind, itemId, perkItemIds: []};
  await write(actor, [...entries, entry]);
  return {ok: true, result: entry};
}

/** Resolves dropped Item data; Items from elsewhere are copied onto the character (only after the cap check). */
async function embedDropped(actor, item, kind) {
  if (item.parent === actor || item.actor === actor) return item.id;
  if (kind) { const check = canAdd(actor, kind); if (!check.ok) return check; }
  const data = typeof item.toObject === 'function' ? item.toObject() : {...item};
  delete data._id;
  const [created] = await actor.createEmbeddedDocuments('Item', [data]);
  return created?.id ?? null;
}
export async function addDroppedCompanion(actor, item, kind) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (!item || item.documentName !== 'Item') return refuse('Drop an Item here.');
  const id = await embedDropped(actor, item, kind);
  if (id && typeof id === 'object') return id;
  if (!id) return refuse('The item could not be added to the character.');
  return addCompanion(actor, id, kind);
}

export async function removeCompanion(actor, entryId) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  const entries = storedCompanions(actor);
  if (!entries.some(e => e.id === entryId)) return refuse('That companion is no longer listed.');
  await write(actor, entries.filter(e => e.id !== entryId));
  return {ok: true};
}

/** Moves a companion up (-1) or down (+1) within the list. */
export async function moveCompanion(actor, entryId, step) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  const entries = storedCompanions(actor), i = entries.findIndex(e => e.id === entryId), j = i + (step < 0 ? -1 : 1);
  if (i < 0) return refuse('That companion is no longer listed.');
  if (j < 0 || j >= entries.length) return {ok: true};
  [entries[i], entries[j]] = [entries[j], entries[i]];
  await write(actor, entries);
  return {ok: true};
}

export async function attachPerk(actor, entryId, perkItemId) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  const entries = storedCompanions(actor), entry = entries.find(e => e.id === entryId);
  if (!entry) return refuse('That companion is no longer listed.');
  const perk = actor.items?.get?.(perkItemId);
  if (!perk) return refuse('That item is not on this character.');
  if (entries.some(e => e.itemId === perkItemId || e.perkItemIds.includes(perkItemId))) return refuse(`${perk.name} is already a companion or attached perk.`);
  entry.perkItemIds.push(perkItemId);
  await write(actor, entries);
  return {ok: true};
}
export async function attachDroppedPerk(actor, entryId, item) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (!item || item.documentName !== 'Item') return refuse('Drop an Item here.');
  if (!storedCompanions(actor).some(e => e.id === entryId)) return refuse('That companion is no longer listed.');
  const id = await embedDropped(actor, item, null);
  if (!id) return refuse('The item could not be added to the character.');
  return attachPerk(actor, entryId, id);
}
export async function detachPerk(actor, entryId, perkItemId) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  const entries = storedCompanions(actor), entry = entries.find(e => e.id === entryId);
  if (!entry) return refuse('That companion is no longer listed.');
  entry.perkItemIds = entry.perkItemIds.filter(id => id !== perkItemId);
  await write(actor, entries);
  return {ok: true};
}

/** Registers the two world settings (GM-only by Foundry's world scope). */
export function registerCompanionSettings(settings = globalThis.game?.settings, onChange = () => {}) {
  settings?.register?.(MODULE_ID, 'petCap', {name: 'Character Hub: pets per character', hint: 'How many pets each character may have in the Companions tab (default 0: no pets until you raise it; one mount is always allowed). The GM can override it per character.',
    scope: 'world', config: true, type: Number, default: DEFAULT_PET_CAP, onChange});
  settings?.register?.(MODULE_ID, 'petCapOverrides', {scope: 'world', config: false, type: Object, default: {}, onChange});
}
