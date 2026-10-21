/**
 * Companions (AG-F07, owned by the Hub): one mount and up to a GM-set number of pets per character (none until the GM
 * raises the limit). The list lives in flags['ashen-gate-character-hub'].companions on the character Actor, in order:
 *   [{id, kind, itemId, actorUuid, name, description, perkItemIds, gearItemIds, clothing}]
 * A companion is either an Item on the character (itemId, as before 0.12.0) or a world Actor linked by UUID
 * (actorUuid, 0.12.0). name/description are the player's own text for the card. A mount has gear and perk Items; a pet
 * has perks and three clothing slots. All of those are ordinary Items on the character (docs/companion-items-schema.md).
 * Entries saved before 0.12.0 read unchanged (missing fields default), so there is nothing to migrate.
 * Caps live in world settings, which only the GM can change. Nothing is applied: the stats box only reads the items'
 * own dnd5e data and Active Effects.
 */
import {MODULE_ID, num} from './constants.mjs';
export {companionRole, COMPANION_ROLES, ID_PREFIXES, companionStats, routeForRole} from './companion-items.mjs';
import {companionRole, routeForRole} from './companion-items.mjs';
import {canEdit} from './actions.mjs';
import {requirePart} from './visibility.mjs';
import {grantBundle} from './ag-item-drop.mjs';
import {isBackup} from './level-backup.mjs';

export const KINDS = ['mount', 'pet'];
export const DEFAULT_PET_CAP = 0;
const FLAG = 'companions';
const refuse = error => ({ok: false, error});
/** Level backup copies (0.27.0) are not playable characters: never a pet-cap or companion target. */
export const BACKUP_REFUSAL = 'That is a level backup copy, not a playable character.';
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
  if (isBackup(globalThis.game?.actors?.get?.(actorId))) return refuse(BACKUP_REFUSAL);
  const all = {...getSetting('petCapOverrides', {})};
  if (value === '' || value === null || value === undefined) delete all[actorId];
  else if (value === 'none' || value === 'unlimited') all[actorId] = value;
  else { const v = Math.trunc(num(value, NaN)); if (!Number.isFinite(v) || v < 0) return refuse('The pet limit must be 0 or more.'); all[actorId] = v; }
  await game.settings.set(MODULE_ID, 'petCapOverrides', all);
  return {ok: true, result: all[actorId] ?? null};
}

// ---------- Reading ----------

export const NAME_MAX = 80, DESC_MAX = 2000, CLOTHING_SLOTS = 3;
const idList = v => Array.isArray(v) ? [...new Set(v.filter(x => typeof x === 'string' && x))] : [];
const text = (v, max) => typeof v === 'string' ? v.slice(0, max) : '';
/** One stored entry, normalised: unknown fields dropped, missing ones defaulted. Safe to run any number of times. */
export function cleanEntry(e) {
  if (!e || typeof e !== 'object' || !KINDS.includes(e.kind)) return null;
  const itemId = typeof e.itemId === 'string' && e.itemId ? e.itemId : null, actorUuid = typeof e.actorUuid === 'string' && e.actorUuid ? e.actorUuid : null;
  if (!itemId && !actorUuid) return null;
  return {id: String(e.id || itemId || actorUuid), kind: e.kind, itemId, actorUuid, name: text(e.name, NAME_MAX), description: text(e.description, DESC_MAX),
    perkItemIds: idList(e.perkItemIds), gearItemIds: e.kind === 'mount' ? idList(e.gearItemIds) : [],
    clothing: e.kind === 'pet' ? Array.from({length: CLOTHING_SLOTS}, (x, i) => typeof e.clothing?.[i] === 'string' && e.clothing[i] ? e.clothing[i] : null) : []};
}
/** Stored entries, cleaned. Item companions whose Item is gone are dropped; an Actor companion stays (shown as missing). */
export function storedCompanions(actor) {
  const raw = actor?.flags?.[MODULE_ID]?.[FLAG];
  return (Array.isArray(raw) ? raw : []).map(cleanEntry).filter(e => e && (e.actorUuid || actor.items?.get?.(e.itemId)));
}
/** The linked Actor (world Actors only), or null when it is gone. */
export function linkedActor(uuid) {
  if (!uuid) return null;
  try { const a = globalThis.fromUuidSync?.(uuid) ?? globalThis.game?.actors?.get?.(uuid.replace(/^Actor\./, '')); return a?.documentName === 'Actor' ? a : null; } catch { return null; }
}
/** Companions with their Items and Actors resolved, for display. */
export function companionsData(actor) {
  const items = ids => ids.map(id => actor.items.get(id)).filter(Boolean);
  const entries = storedCompanions(actor).map(e => {
    const item = e.itemId ? actor.items.get(e.itemId) : null, linked = linkedActor(e.actorUuid);
    return {...e, item, actor: linked, missing: !!e.actorUuid && !linked, displayName: e.name || linked?.name || item?.name || 'Missing companion',
      art: linked?.img || item?.img || 'icons/svg/mystery-man.svg', perks: items(e.perkItemIds), gear: items(e.gearItemIds), clothingItems: e.clothing.map(id => id ? actor.items.get(id) ?? null : null)};
  });
  const cap = petCapFor(actor);
  const pets = entries.filter(e => e.kind === 'pet');
  return {mount: entries.find(e => e.kind === 'mount') ?? null, pets, cap, capLabel: capLabel(cap), overCap: pets.length > cap, entries};
}
const usedIds = actor => new Set(storedCompanions(actor).flatMap(e => [e.itemId, ...e.perkItemIds, ...e.gearItemIds, ...e.clothing].filter(Boolean)));
/** Items on the character that are not already a companion, an attached perk or gear, or worn by a pet. */
export function freeItems(actor) {
  const used = usedIds(actor);
  return [...(actor.items ?? [])].filter(i => !used.has(i.id) && !['class', 'subclass', 'background', 'race', 'spell'].includes(i.type))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
/** Free items that may go on a companion: no role, or a role for that companion kind (optionally only one list). */
export const freeItemsFor = (actor, kind, list = null) => freeItems(actor).filter(i => { const r = routeForRole(i, kind); return r.ok && (!list || r.list === list); });

// ---------- Writing (one Actor update per change; caps enforced here) ----------

const write = (actor, entries) => actor.update({[`flags.${MODULE_ID}.${FLAG}`]: entries.map(e => {
  const {id, kind, itemId, actorUuid, name, description, perkItemIds, gearItemIds, clothing} = cleanEntry(e);
  return {id, kind, itemId, actorUuid, name, description, perkItemIds, gearItemIds, clothing};
})});
const notOwner = actor => refuse(`You don't own ${actor?.name ?? 'this character'}, so you can't change its companions.`);
/** Owner only, and (for players) only while the GM shows Companions to players. */
const cannotChange = actor => isBackup(actor) ? refuse(BACKUP_REFUSAL) : canEdit(actor) ? requirePart('companions') : notOwner(actor);

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
  if (usedIds(actor).has(itemId)) return refuse(`${item.name} is already a companion or perk.`);
  const check = canAdd(actor, kind); if (!check.ok) return check;
  const entry = cleanEntry({id: newId(), kind, itemId});
  await write(actor, [...entries, entry]);
  return {ok: true, result: entry};
}

/**
 * Resolves dropped Item data; Items from elsewhere are copied onto the character (only after the cap check). Since
 * 0.25.0 the copy is built by the shared grantBundle, so a container brings its contents; the source is never changed.
 */
async function embedDropped(actor, item, kind) {
  if (item.parent === actor || item.actor === actor) return item.id;
  if (kind) { const check = canAdd(actor, kind); if (!check.ok) return check; }
  const {data} = await grantBundle(item, {quantity: item.system?.quantity ?? 1, scope: MODULE_ID, tag: {}});
  if (!data.length) return null;
  const created = await actor.createEmbeddedDocuments('Item', data, {keepId: true});
  return (created ?? []).find(d => d?.id === data[0]._id)?.id ?? created?.[0]?.id ?? null;
}
/**
 * Links a world Actor (a mount or pet with its own sheet) as a companion. Players need at least Observer permission on
 * it; compendium Actors must be imported into the world first. The Actor itself is never changed.
 */
export async function addActorCompanion(actor, other, kind) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (!other || other.documentName !== 'Actor') return refuse('Drop an Actor here.');
  if (isBackup(other)) return refuse(BACKUP_REFUSAL);
  if (other === actor || other.uuid === actor.uuid) return refuse(`${actor.name} can't be its own companion.`);
  if (other.pack || !String(other.uuid ?? '').startsWith('Actor.')) return refuse(`Import ${other.name} into the world first, then drop it from the Actors sidebar.`);
  const user = globalThis.game?.user;
  if (!user?.isGM && other.testUserPermission?.(user, 'OBSERVER') !== true) return refuse(`You can't see ${other.name}. Ask the GM to share it with you.`);
  const entries = storedCompanions(actor);
  if (entries.some(e => e.actorUuid === other.uuid)) return refuse(`${other.name} is already a companion.`);
  const check = canAdd(actor, kind); if (!check.ok) return check;
  const entry = cleanEntry({id: newId(), kind, actorUuid: other.uuid});
  await write(actor, [...entries, entry]);
  return {ok: true, result: entry};
}

export async function addDroppedCompanion(actor, item, kind) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (item?.documentName === 'Actor') return addActorCompanion(actor, item, kind);
  if (!item || item.documentName !== 'Item') return refuse('Drop an Actor or an Item here.');
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
  if (usedIds(actor).has(perkItemId)) return refuse(`${perk.name} is already a companion or attached perk.`);
  const route = routeForRole(perk, entry.kind); if (!route.ok) return route;
  entry.perkItemIds.push(perkItemId);
  await write(actor, entries);
  return {ok: true};
}

/**
 * Puts an Item on a companion where its role says (docs/companion-items-schema.md): a mount's gear or perks, a pet's
 * perks or a clothing slot (`slot` 0-2; the first free one when not given). Unmarked items go by type (a feature is a
 * perk; anything else is mount gear or pet clothing). An item marked for the other kind of companion is refused.
 */
export async function attachExtra(actor, entryId, itemId, {slot = null, list = null} = {}) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  const entries = storedCompanions(actor), entry = entries.find(e => e.id === entryId);
  if (!entry) return refuse('That companion is no longer listed.');
  const item = actor.items?.get?.(itemId);
  if (!item) return refuse('That item is not on this character.');
  if (usedIds(actor).has(itemId)) return refuse(`${item.name} is already on a companion.`);
  const route = routeForRole(item, entry.kind, list); if (!route.ok) return route;
  if (route.list === 'perk') entry.perkItemIds.push(itemId);
  else if (route.list === 'gear') entry.gearItemIds.push(itemId);
  else {
    const at = slot !== null && slot !== undefined && slot !== '' ? Math.trunc(Number(slot)) : entry.clothing.findIndex(x => !x);
    if (!(at >= 0 && at < CLOTHING_SLOTS)) return refuse(`${entry.name || 'This pet'} has no free clothing slot. Take something off first.`);
    if (entry.clothing[at]) return refuse('That clothing slot is taken. Take the item off first.');
    entry.clothing[at] = itemId;
  }
  await write(actor, entries);
  return {ok: true, result: route.list};
}
export async function attachDroppedExtra(actor, entryId, item, opts = {}) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (!item || item.documentName !== 'Item') return refuse('Drop an Item here.');
  const entry = storedCompanions(actor).find(e => e.id === entryId);
  if (!entry) return refuse('That companion is no longer listed.');
  const route = routeForRole(item, entry.kind, opts.list ?? null); if (!route.ok) return route;
  const id = await embedDropped(actor, item, null);
  if (!id) return refuse('The item could not be added to the character.');
  return attachExtra(actor, entryId, id, opts);
}
/** Takes an item off a companion (gear, perk or clothing). The Item stays on the character. */
export async function detachExtra(actor, entryId, itemId) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  const entries = storedCompanions(actor), entry = entries.find(e => e.id === entryId);
  if (!entry) return refuse('That companion is no longer listed.');
  entry.perkItemIds = entry.perkItemIds.filter(id => id !== itemId);
  entry.gearItemIds = entry.gearItemIds.filter(id => id !== itemId);
  entry.clothing = entry.clothing.map(id => id === itemId ? null : id);
  await write(actor, entries);
  return {ok: true};
}
/** The player's own name or description for a companion card (plain text, length-capped). Owner only. */
export async function setCompanionText(actor, entryId, field, value) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (!['name', 'description'].includes(field)) return refuse(`Unknown companion field ${field}.`);
  const entries = storedCompanions(actor), entry = entries.find(e => e.id === entryId);
  if (!entry) return refuse('That companion is no longer listed.');
  entry[field] = String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, field === 'name' ? NAME_MAX : DESC_MAX);
  await write(actor, entries);
  return {ok: true, result: entry[field]};
}
export async function attachDroppedPerk(actor, entryId, item) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (!item || item.documentName !== 'Item') return refuse('Drop an Item here.');
  const entry = storedCompanions(actor).find(e => e.id === entryId);
  if (!entry) return refuse('That companion is no longer listed.');
  const route = routeForRole(item, entry.kind); if (!route.ok) return route;
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
