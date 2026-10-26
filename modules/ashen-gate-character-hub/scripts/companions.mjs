/**
 * Companions (0.48.0; 0.49.0 adds auto-listing of owned NPC Actors, see "Auto-listing" below): a Mount box and up to three Pet boxes. A companion is a world Actor (an NPC with stats, linked by
 * UUID, Observer permission needed for players). A character may link many pet Actors and many mount Actors; up to three
 * pets (the character's pet slot count, 0 to 3) and one mount are active at once. A pet has Head and Body sockets; the
 * mount has Saddle and four Tack. Gear (pet clothing, mount gear) is an ordinary Item on the character dropped into a
 * socket; a socket holds one item and an item sits in one socket of one companion at a time. Gear stays with its own
 * companion Actor when another becomes active. Nothing is applied: the stats box only reads the items' own dnd5e data
 * and Active Effects.
 *
 * Saved data: flags['ashen-gate-character-hub'].companionSlots (version 2)
 *   {version: 2, activePets: [uuid|null, uuid|null, uuid|null], activeMount: uuid|null, pets: [actorUuid], mounts: [actorUuid],
 *    gear: {actorId: {socketKey: gearItemId}}, perks: {actorId: [perkItemId]}, labels: {actorId: {name, description}}}
 * labels are the player's own name and description for a companion, kept on the character (the Actor is never changed).
 * (actorId is the UUID without its "Actor." prefix, because Foundry reads dots in flag keys as paths.)
 * Version 1 ({activePet, ..., other1..other4}) is read as version 2 (activePet becomes activePets[0], other1..4 become
 * tack1..4) and written as version 2 by migrateCompanionSlots or the next change; nothing is deleted. The pre-0.47.0 list
 * flags[...].companions is never deleted or rewritten. Older Item companions (no Actor) stay in the old flag and are
 * listed read-only in the tab.
 *
 * Which socket an item fits (docs/companion-items-schema.md): an item with companion.slot (saddle | tack for mount-gear,
 * head | body for pet-clothing) fits only that socket type; an unclassified item fits any socket of its kind.
 * Pet slots: world settings petSlots (default 3) and petSlotOverrides ({actorId: 0..3}); the old petCap and
 * petCapOverrides are registered, untouched and ignored.
 */
import {MODULE_ID} from './constants.mjs';
export {companionRole, COMPANION_ROLES, ID_PREFIXES, companionStats, routeForRole} from './companion-items.mjs';
import {companionRole, routeForRole, companionSlot, slotFit, SLOT_LABELS} from './companion-items.mjs';
import {canEdit} from './actions.mjs';
import {requirePart} from './visibility.mjs';
import {grantBundle} from './ag-item-drop.mjs';
import {isBackup} from './level-backup.mjs';

export const KINDS = ['mount', 'pet'];
export const SLOTS_VERSION = 2;
export const MAX_PET_SLOTS = 3;
export const SOCKETS = {
  pet: [{key: 'head', type: 'head', label: 'Head', name: 'Head'}, {key: 'body', type: 'body', label: 'Body', name: 'Body'}],
  mount: [{key: 'saddle', type: 'saddle', label: 'Saddle', name: 'Saddle'},
    ...[1, 2, 3, 4].map(n => ({key: `tack${n}`, type: 'tack', label: 'Tack', name: `Tack ${n}`}))]
};
/** Socket keys saved by 0.47.0 (Other 1 to 4) read as Tack 1 to 4. */
const LEGACY_SOCKET_KEYS = {tack1: 'other1', tack2: 'other2', tack3: 'other3', tack4: 'other4'};
export const socketLabel = (kind, key) => SOCKETS[kind]?.find(s => s.key === key)?.label ?? key;
export const socketName = (kind, key) => SOCKETS[kind]?.find(s => s.key === key)?.name ?? key;
const FLAG = 'companionSlots', LEGACY_FLAG = 'companions';
const refuse = error => ({ok: false, error});
/** Level backup copies (0.27.0) are not playable characters: never a companion target. */
export const BACKUP_REFUSAL = 'That is a level backup copy, not a playable character.';
const gearList = kind => kind === 'mount' ? 'gear' : 'clothing';
const NOT_GEAR_TYPES = ['class', 'subclass', 'background', 'race', 'spell'];
const listKey = kind => kind === 'pet' ? 'pets' : 'mounts';
const kindName = kind => kind === 'pet' ? 'pet' : 'mount';

// ---------- Pet slots (0.48.0) ----------
// How many pets may be active at once: the GM's default (world setting petSlots, 0 to 3), a per-character override
// (petSlotOverrides {actorId: 0..3}), plus any extra slots partners register; the total is never more than 3.
// The old petCap and petCapOverrides settings stay saved and are not read.
export const DEFAULT_PET_SLOTS = 3;
const SLOTS_SETTING = 'petSlots', OVERRIDES_SETTING = 'petSlotOverrides';
/** Linked pets are unlimited; only the active ones are limited (see petSlotsFor). Kept for partners that call it. */
export const petCapFor = () => Infinity;
/** A whole number 0 to 3 from a setting or input, or null when it is not one. */
export function parseSlotCount(v) {
  if (v === null || v === undefined || typeof v === 'boolean' || (typeof v === 'string' && !v.trim())) return null;
  const n = Number(v);
  return Number.isInteger(n) ? Math.min(MAX_PET_SLOTS, Math.max(0, n)) : null;
}
const readSetting = key => { try { return globalThis.game?.settings?.get?.(MODULE_ID, key); } catch { return undefined; } };
export const defaultPetSlots = () => parseSlotCount(readSetting(SLOTS_SETTING)) ?? DEFAULT_PET_SLOTS;
/** The saved per-character overrides, cleaned: {actorId: 0..3}. */
export function petSlotOverrides() {
  const raw = readSetting(OVERRIDES_SETTING), out = {};
  if (isObj(raw)) for (const [k, v] of Object.entries(raw)) { const n = parseSlotCount(v); if (k && n !== null) out[k] = n; }
  return out;
}
const slotSources = new Map();
/**
 * Extra pet slots from another module: fn(actor) returns a whole number of extra slots (0 or more). The total is clamped
 * to 3. Registering the same id again replaces it.
 */
export function registerPetSlotSource(id, fn) {
  if (typeof id !== 'string' || !id || typeof fn !== 'function') return refuse('registerPetSlotSource(id, fn) needs an id and a function.');
  slotSources.set(id, fn);
  return {ok: true};
}
export const unregisterPetSlotSource = id => slotSources.delete(id);
/** How many pet boxes this character has: override or default, plus partner extras, clamped to 0 to 3. */
export function petSlotsFor(actor) {
  const base = petSlotOverrides()[actor?.id] ?? defaultPetSlots();
  let extra = 0;
  for (const fn of slotSources.values()) { try { const n = Math.trunc(Number(fn(actor))); if (Number.isFinite(n) && n > 0) extra += n; } catch { /* a partner's hook must not break the Hub */ } }
  return Math.min(MAX_PET_SLOTS, base + extra);
}
const gmOnly = user => user?.isGM === true ? null : refuse('Only the GM can change pet slots.');
/** GM only: the default number of pet slots (0 to 3). */
export async function setDefaultPetSlots(value, user = globalThis.game?.user) {
  const blocked = gmOnly(user); if (blocked) return blocked;
  const n = parseSlotCount(value);
  if (n === null || Number(value) !== n) return refuse('Pet slots must be a whole number from 0 to 3.');
  await globalThis.game.settings.set(MODULE_ID, SLOTS_SETTING, n);
  return {ok: true, result: n};
}
/** GM only: one character's pet slots (0 to 3), or '' / null to use the default again. */
export async function setPetSlotOverride(actorId, value, user = globalThis.game?.user) {
  const blocked = gmOnly(user); if (blocked) return blocked;
  if (typeof actorId !== 'string' || !actorId) return refuse('Choose a character.');
  const next = petSlotOverrides();
  if (value === '' || value === null || value === undefined) delete next[actorId];
  else {
    const n = parseSlotCount(value);
    if (n === null || Number(value) !== n) return refuse('Pet slots must be a whole number from 0 to 3.');
    next[actorId] = n;
  }
  await globalThis.game.settings.set(MODULE_ID, OVERRIDES_SETTING, next);
  return {ok: true, result: next[actorId] ?? null};
}

// ---------- Reading ----------

const idList = v => Array.isArray(v) ? [...new Set(v.filter(x => typeof x === 'string' && x))] : [];
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const emptySlots = () => ({version: SLOTS_VERSION, activePets: Array(MAX_PET_SLOTS).fill(null), activeMount: null, pets: [], mounts: [], gear: {}, perks: {}, labels: {}});
/** Gear and perk maps are keyed by the world Actor id (no dots). */
export const ckey = uuid => String(uuid ?? '').replace(/^Actor\./, '');
const worldUuid = v => typeof v === 'string' && /^Actor\.[A-Za-z0-9]+$/.test(v) ? v : null;

export const LABEL_NAME_MAX = 60, LABEL_DESCRIPTION_MAX = 500;
/** Plain text only: markup stripped, trimmed, cut to `max`. */
export const plainText = (v, max) => typeof v === 'string' ? v.replace(/<[^>]*>/g, '').replace(/[<>]/g, '').replace(/\r\n?/g, '\n').trim().slice(0, max).trim() : '';
const cleanLabel = v => isObj(v) ? {name: plainText(v.name, LABEL_NAME_MAX), description: plainText(v.description, LABEL_DESCRIPTION_MAX)} : {name: '', description: ''};

/**
 * The saved companionSlots flag, normalised to version 2 (unknown keys dropped, duplicates removed). Version 1 is read
 * as version 2: activePet becomes activePets[0] and the Other sockets become Tack. Null when absent or another version.
 */
export function cleanSlots(raw) {
  if (!isObj(raw) || (raw.version !== 1 && raw.version !== SLOTS_VERSION)) return null;
  const out = emptySlots(), seen = new Set();
  for (const kind of KINDS) for (const u of idList(raw[listKey(kind)])) if (worldUuid(u) && !seen.has(u)) { seen.add(u); out[listKey(kind)].push(u); }
  const wantPets = raw.version === 1 ? [raw.activePet] : Array.isArray(raw.activePets) ? raw.activePets.slice(0, MAX_PET_SLOTS) : [];
  const taken = new Set();
  wantPets.forEach((u, n) => { if (typeof u === 'string' && out.pets.includes(u) && !taken.has(u)) { taken.add(u); out.activePets[n] = u; } });
  out.activeMount = typeof raw.activeMount === 'string' && out.mounts.includes(raw.activeMount) ? raw.activeMount : null;
  const owned = new Map([...out.pets.map(u => [ckey(u), 'pet']), ...out.mounts.map(u => [ckey(u), 'mount'])]);
  const used = new Set();
  if (isObj(raw.gear)) for (const [k, sockets] of Object.entries(raw.gear)) {
    const kind = owned.get(k); if (!kind || !isObj(sockets)) continue;
    for (const {key} of SOCKETS[kind]) {
      const g = sockets[key] ?? sockets[LEGACY_SOCKET_KEYS[key]];
      if (typeof g === 'string' && g && !used.has(g)) { used.add(g); (out.gear[k] ??= {})[key] = g; }
    }
  }
  if (isObj(raw.perks)) for (const [k, list] of Object.entries(raw.perks)) {
    if (!owned.has(k)) continue;
    const ids = idList(list).filter(p => !used.has(p)); ids.forEach(p => used.add(p));
    if (ids.length) out.perks[k] = ids;
  }
  if (isObj(raw.labels)) for (const [k, v] of Object.entries(raw.labels)) {
    if (!owned.has(k)) continue;
    const l = cleanLabel(v); if (l.name || l.description) out.labels[k] = l;
  }
  return out;
}

/** One entry of the pre-0.47.0 list: Actor-linked companions only (Item companions are listed read-only, not migrated). */
function legacyEntry(e) {
  if (!isObj(e) || !KINDS.includes(e.kind)) return null;
  const uuid = worldUuid(e.actorUuid); if (!uuid) return null;
  return {kind: e.kind, uuid, label: cleanLabel({name: e.name, description: e.description}), perkItemIds: idList(e.perkItemIds), gearItemIds: e.kind === 'mount' ? idList(e.gearItemIds) : [],
    clothing: e.kind === 'pet' ? (Array.isArray(e.clothing) ? e.clothing : []).filter(x => typeof x === 'string' && x) : []};
}
/** The new shape built from the old list, in memory only. The old flag is read, never changed. */
export function slotsFromLegacy(actor) {
  const raw = actor?.flags?.[MODULE_ID]?.[LEGACY_FLAG], out = emptySlots();
  const entries = (Array.isArray(raw) ? raw : []).map(legacyEntry).filter(Boolean);
  const used = new Set(), has = id => !!actor.items?.get?.(id), taken = new Set();
  for (const e of entries) if (!taken.has(e.uuid)) { taken.add(e.uuid); out[listKey(e.kind)].push(e.uuid); }
  out.activePets[0] = out.pets[0] ?? null; out.activeMount = out.mounts[0] ?? null;
  for (const e of entries) {
    if (!out[listKey(e.kind)].includes(e.uuid)) continue;
    const k = ckey(e.uuid), gear = e.kind === 'mount' ? e.gearItemIds : e.clothing;
    gear.filter(id => has(id) && !used.has(id)).slice(0, SOCKETS[e.kind].length).forEach((id, n) => { used.add(id); (out.gear[k] ??= {})[SOCKETS[e.kind][n].key] = id; });
    const perks = e.perkItemIds.filter(id => has(id) && !used.has(id)); perks.forEach(id => used.add(id));
    if (perks.length) out.perks[k] = perks;
    if ((e.label.name || e.label.description) && !out.labels[k]) out.labels[k] = e.label;
  }
  return out;
}
/** The companion data in force: the saved companionSlots flag (version 1 or 2, shown as 2) when present, else derived from the old list. */
export function readSlots(actor) {
  const saved = actor?.flags?.[MODULE_ID]?.[FLAG], s = cleanSlots(saved);
  if (!s) return slotsFromLegacy(actor);
  if (saved.version === 1) mergeLegacyLabels(s, actor);   // names typed before 0.47.0 show until the data is migrated
  return s;
}
/** Adds the pre-0.47.0 names and descriptions for linked Actors that have none yet (never overwrites). */
function mergeLegacyLabels(s, actor) {
  for (const [k, l] of Object.entries(slotsFromLegacy(actor).labels)) if (!s.labels[k] && (s.pets.some(u => ckey(u) === k) || s.mounts.some(u => ckey(u) === k))) s.labels[k] = l;
  return s;
}
/** Every active pet uuid (any pet box). */
const activeSet = s => new Set(s.activePets.filter(Boolean));
/** Older Item companions (no Actor) from the old list, for the read-only "Older companions" fold. */
export function legacyItemCompanions(actor) {
  const raw = actor?.flags?.[MODULE_ID]?.[LEGACY_FLAG];
  return (Array.isArray(raw) ? raw : []).filter(e => isObj(e) && KINDS.includes(e.kind) && !worldUuid(e.actorUuid) && typeof e.itemId === 'string')
    .map(e => ({kind: e.kind, item: actor.items?.get?.(e.itemId) ?? null, name: typeof e.name === 'string' ? e.name : ''})).filter(e => e.item);
}

/** The linked Actor (world Actors only), or null when it is gone. */
export function linkedActor(uuid) {
  if (!uuid) return null;
  try { const a = globalThis.fromUuidSync?.(uuid) ?? globalThis.game?.actors?.get?.(uuid.replace(/^Actor\./, '')); return a?.documentName === 'Actor' ? a : null; } catch { return null; }
}
/** The GM, or a user with at least Observer on the Actor: the level the Hub needs to show anything from its sheet. */
export const canSeeActor = a => !!a && (globalThis.game?.user?.isGM === true || a.testUserPermission?.(globalThis.game?.user, 'OBSERVER') === true);

// ---------- Auto-listing (0.49.0) ----------
// Each pet dropdown and the mount dropdown also list the NPC Actors the character's player OWNS (Owner permission only),
// so a player needs no drop or search. Choosing one links it and makes it active. Nothing is ever auto-removed.
export const TYPE_FLAG = 'companionType';
export const COMPANION_TYPES = ['pet', 'mount', 'either', 'none'];
const SIZE_NAMES = {tiny: 'Tiny', sm: 'Small', med: 'Medium', lg: 'Large', huge: 'Huge', grg: 'Gargantuan'};
const SIZE_KIND = {tiny: 'pet', sm: 'pet', med: 'pet', lg: 'mount', huge: 'mount', grg: 'mount'};
export const KIND_TITLE = {pet: 'Pet', mount: 'Mount', either: 'Pet or mount', none: 'Not a companion'};
/** The permanent id Manager stamps on an imported Actor (flags['ashen-gate-manager'].source.sourceId), or ''. */
export const managerIdOf = actor => { const id = actor?.flags?.['ashen-gate-manager']?.source?.sourceId; return typeof id === 'string' ? id : ''; };
/**
 * What kind of companion an Actor is, strongest rule first: (a) the GM's flag companionType (pet | mount | either | none);
 * (b) Manager's id prefix CRE-MOUNT- (mount) or CRE-PET- (pet); (c) any other CRE- id by size; (d) NPC- ids (people) are
 * none; (e) no Manager id: by size. `automatic: true` ignores the GM's flag (what Automatic would give). Size: tiny, sm, med are pets; lg, huge, grg are mounts. Returns
 * {kind: 'pet'|'mount'|'either'|'none', source: 'gm'|'import'|'size'|'person'|'unknown', label}, label in plain words.
 */
export function companionKindOf(actor, {automatic = false} = {}) {
  const flag = automatic ? undefined : actor?.flags?.[MODULE_ID]?.[TYPE_FLAG];
  if (COMPANION_TYPES.includes(flag)) return {kind: flag, source: 'gm', label: `${KIND_TITLE[flag]} (set by GM)`};
  const not = notACreature(actor);
  if (not) return {kind: 'none', source: 'utility', label: `Can't be a companion (${not})`, reason: not};
  const id = managerIdOf(actor);
  if (id.startsWith('CRE-MOUNT-')) return {kind: 'mount', source: 'import', label: 'Mount (imported as a mount)'};
  if (id.startsWith('CRE-PET-')) return {kind: 'pet', source: 'import', label: 'Pet (imported as a pet)'};
  if (id.startsWith('NPC-')) return {kind: 'none', source: 'person', label: 'Not a companion (a person)'};
  const size = actor?.system?.traits?.size, kind = SIZE_KIND[size];
  if (!kind) return {kind: 'none', source: 'unknown', label: 'Not a companion (size unknown)'};
  return {kind, source: 'size', label: `${KIND_TITLE[kind]} (${SIZE_NAMES[size]})`};
}
/**
 * 0.58.2: why an Actor is not a creature at all, or ''. Utility Actors are never auto-listed, found by name, dropped or typed in as a
 * companion: Utilities' Party Stash (its documented Actor flag flags.ashen-gate-utilities.partyStash, feature-detected: no module
 * needed), and Actors of type loot, vehicle or group. Only the GM's companionType flag (pet, mount or either) overrides this.
 */
export function notACreature(actor) {
  if (!actor) return '';
  if (actor.flags?.['ashen-gate-utilities']?.partyStash === true) return 'the party stash';
  if (['loot', 'vehicle', 'group'].includes(actor.type)) return `a ${actor.type} Actor`;
  return '';
}
/** Whether an effective kind fits a box of `kind`. */
export const kindFits = (info, kind) => info.kind === kind || info.kind === 'either';

/** Non-GM users with Owner on the character: the people whose companions are auto-listed. */
function playerOwners(actor) {
  return [...(globalThis.game?.users ?? [])].filter(u => u && !u.isGM && actor.testUserPermission?.(u, 'OWNER') === true);
}
/**
 * Whether `other` counts as owned for this character: at least one non-GM user who owns the character also owns `other`.
 * A character with no non-GM owners (GM-run) uses the viewing user's own permission; a GM viewer has no meaningful
 * "owned" there (a GM owns everything), so nothing is listed automatically and the GM links by drop or find.
 */
export function ownedForCharacter(actor, other, user = globalThis.game?.user) {
  if (!actor || !other) return false;
  const owners = playerOwners(actor);
  if (owners.length) return owners.some(u => other.testUserPermission?.(u, 'OWNER') === true);
  if (!user || user.isGM) return false;
  return other.testUserPermission?.(user, 'OWNER') === true;
}
/** What can never be auto-listed for this character, before ownership and kind: itself, non-NPCs, backups, compendium Actors, Actors the viewer cannot see. */
function listable(actor, a) {
  return !!a && a !== actor && a.uuid !== actor.uuid && a.type === 'npc' && !a.pack && !isBackup(a) && /^Actor\.[A-Za-z0-9]+$/.test(String(a.uuid ?? '')) && canSeeActor(a);
}
/**
 * Read only: the NPC Actors this character's owners own whose effective kind fits `kind` ('pet' or 'mount'), sorted by
 * name: [{actor, uuid, name, info, linked}]. `linked` is true when already linked to the character as `kind`; Actors linked as the other kind are left out.
 */
export function eligibleCompanions(actor, kind, user = globalThis.game?.user) {
  if (!KINDS.includes(kind) || !actor) return [];
  const s = readSlots(actor), mine = new Set(s[listKey(kind)]), other = new Set(s[listKey(kind === 'pet' ? 'mount' : 'pet')]);
  return [...(globalThis.game?.actors ?? [])].filter(a => listable(actor, a) && !other.has(a.uuid) && ownedForCharacter(actor, a, user))
    .map(a => ({actor: a, uuid: a.uuid, name: a.name, info: companionKindOf(a), linked: mine.has(a.uuid)})).filter(e => kindFits(e.info, kind))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
/** Why a non-GM may not auto-link `other` as `kind`, or null. The GM may link anything. */
function autoLinkRefusal(actor, other, kind, user) {
  if (user?.isGM) return null;
  if (!listable(actor, other)) return refuse(`${other?.name ?? 'That Actor'} can't be a ${kindName(kind)} for ${actor.name}.`);
  if (!ownedForCharacter(actor, other, user)) return refuse(`You don't own ${other.name}, so it can't be linked from the list. Ask the GM to give you ownership, or drop it on the box.`);
  if (!kindFits(companionKindOf(other), kind)) return refuse(`${other.name} is ${companionKindOf(other).label.replace(/^./, c => c.toLowerCase())}, so it doesn't fit a ${kindName(kind)} box.`);
  return null;
}
/** GM only: sets (pet | mount | either | none) or clears ('' / null / 'auto') the GM's companion type on an NPC Actor. */
export async function setCompanionType(actor, type, user = globalThis.game?.user) {
  if (user?.isGM !== true) return refuse('Only the GM can set a companion type.');
  if (!actor || actor.documentName !== 'Actor') return refuse('Choose an Actor.');
  if (actor.type !== 'npc') return refuse(`${actor.name} is not an NPC, so it can't be a companion.`);
  if (type === '' || type === null || type === undefined || type === 'auto') {
    if (actor.flags?.[MODULE_ID]?.[TYPE_FLAG] !== undefined) await actor.update({[`flags.${MODULE_ID}.-=${TYPE_FLAG}`]: null});
    return {ok: true, result: companionKindOf(actor)};
  }
  if (!COMPANION_TYPES.includes(type)) return refuse('Choose Pet, Mount, Either, None or Automatic.');
  if (actor.flags?.[MODULE_ID]?.[TYPE_FLAG] !== type) await actor.update({[`flags.${MODULE_ID}.${TYPE_FLAG}`]: type});
  return {ok: true, result: companionKindOf(actor)};
}

const itemOn = (actor, id) => id ? actor.items?.get?.(id) ?? null : null;
/** The tier shown with a gear item's name, when its data carries one (display only). */
export const tierOf = item => { const t = item?.flags?.[MODULE_ID]?.companion?.tier ?? item?.flags?.['ashen-gate-manager']?.source?.tier; return typeof t === 'string' ? t.trim() : ''; };

/** Ids already in use as gear or perks. */
const usedItemIds = s => new Set([...Object.values(s.gear).flatMap(g => Object.values(g)), ...Object.values(s.perks).flat()]);
const sortByName = items => items.sort((a, b) => String(a.name).localeCompare(String(b.name)));
const candidates = (actor, s) => { const used = usedItemIds(s); return [...(actor.items ?? [])].filter(i => !used.has(i.id) && !NOT_GEAR_TYPES.includes(i.type)); };
/**
 * Items on the character that fit a socket of this kind (and, with `socket`, that socket's type): marked for it first
 * (marked: true), then unmarked gear. Classified items only appear for their own socket type.
 */
export function gearChoices(actor, kind, socket = null) {
  const list = candidates(actor, readSlots(actor)).filter(i => !gearProblem(actor, i, kind, socket));
  return sortByName(list).map(item => ({item, marked: true}));
}
/**
 * 0.58.2: why an Item on the character can't be companion gear for a `kind` (and, with `socket`, that socket), or ''. Only Items the
 * Companion item conventions mark for this kind (role mount-gear / pet-clothing: flag or ITEM-MOUNT- / ITEM-PET- id) count, so
 * the character's own weapons, armour, amulets, containers and loot never do. An Item the character has equipped or attuned is
 * the character's own gear, not the companion's. `onCharacter: false` (an Item dropped from elsewhere, copied after the checks) skips the equipped test.
 */
export function gearProblem(actor, item, kind, socket = null, {onCharacter = true} = {}) {
  if (!item) return 'That item is not on this character.';
  if (NOT_GEAR_TYPES.includes(item.type) || item.type === 'container' || !companionRole(item)) return `${item.name} is not companion gear. Only items marked as ${kind === 'mount' ? 'mount gear' : 'pet clothing'} can go in a socket.`;
  const route = routeForRole(item, kind, gearList(kind)); if (!route.ok) return route.error;
  if (socket) { const fit = slotFit(item, socket); if (!fit.ok) return fit.error; }
  if (onCharacter && (item.system?.equipped === true || item.system?.attuned === true)) return `${item.name} is equipped or attuned by ${actor?.name ?? 'the character'}, so it can't be companion gear. Unequip it first.`;
  return '';
}
/**
 * 0.58.2: why an Item can't be a companion perk for `kind`, or ''. Only Items marked as this kind's perk (role mount-perk / pet-perk:
 * flag or PERK-MOUNT- / PERK-PET- id, the Companion perks Manager imports) count. The character's own class, species, background and
 * origin feats, class features and profession perks carry no such mark, so they never do; neither does anything the character has equipped or attuned.
 */
export function perkProblem(actor, item, kind, {onCharacter = true} = {}) {
  if (!item) return 'That item is not on this character.';
  if (NOT_GEAR_TYPES.includes(item.type) || !companionRole(item)) return `${item.name} is not a companion perk. Only items marked as ${kind} perks can be attached.`;
  const route = routeForRole(item, kind, 'perk'); if (!route.ok) return route.error;
  if (onCharacter && (item.system?.equipped === true || item.system?.attuned === true)) return `${item.name} is equipped or attuned by ${actor?.name ?? 'the character'}, so it can't be a companion perk. Unequip it first.`;
  return '';
}
/** Perk Items that fit the active companion's perk list (marked companion perks only, from the character's own items, not already used). */
export const perkChoices = (actor, kind) => sortByName(candidates(actor, readSlots(actor)).filter(i => !perkProblem(actor, i, kind)));

/**
 * A linked companion resolved for display. A linked Actor the viewer can no longer observe (the GM unshared it) is
 * `denied`: it stays listed and removable, but its name, art and stats never show.
 */
function entryOf(uuid, labels = {}) {
  const found = linkedActor(uuid), denied = !!found && !canSeeActor(found), actor = denied ? null : found, key = ckey(uuid), label = labels[key] ?? {name: '', description: ''};
  const actorName = actor?.name ?? (denied ? 'Companion (not shared)' : 'Missing companion');
  // The player's own name wins; the Actor's real name is kept (actorName) so the box can show it when different.
  return {uuid, key, actor, denied, missing: !found, ineligible: !!actor && companionKindOf(actor).source === 'utility', name: label.name || actorName, actorName, customName: label.name, description: label.description, art: actor?.img || ''};
}
/** A one-line read-only stats strip from the Actor's own sheet data (AC, HP, speeds), only what is present. */
export function actorStats(actor) {
  const a = actor?.system?.attributes; if (!a) return [];
  const out = [], ac = Number(a.ac?.value), hp = a.hp ?? {};
  if (Number.isFinite(ac) && a.ac?.value !== undefined && a.ac?.value !== null) out.push({label: 'AC', value: String(ac)});
  if (hp.max !== undefined && hp.max !== null && Number.isFinite(Number(hp.max))) out.push({label: 'HP', value: `${Number(hp.value ?? 0)} / ${Number(hp.max)}`});
  const mv = a.movement ?? {}, speeds = mv.speeds ?? mv, units = mv.units ?? 'ft';
  for (const k of ['walk', 'fly', 'swim', 'climb', 'burrow']) { const v = Number(speeds?.[k]); if (Number.isFinite(v) && v > 0) out.push({label: k === 'walk' ? 'Speed' : `${k[0].toUpperCase()}${k.slice(1)} speed`, value: `${v} ${units}`}); }
  return out;
}

/**
 * The boxes, resolved for display: {mount, pets: [pet box per visible pet slot], pet, petSlots}. Each box is
 * {kind, slot, active, others, owned, sockets: [{key, label, name, type, item}], perks, gearItems}. `active` and `others`
 * are linked companions {uuid, actor, denied, missing, name, art}. A pet box shows for each slot below the character's
 * pet slot count, and for any slot that still holds a pet (lowering the count never removes one). `others` of a pet box
 * are the linked pets not active in any pet box. `pet` is the first pet box (or null when there are none).
 */
export function companionBoxes(actor) {
  const s = readSlots(actor), petSlots = petSlotsFor(actor), act = activeSet(s);
  const eligible = {pet: eligibleCompanions(actor, 'pet'), mount: eligibleCompanions(actor, 'mount')};
  const make = (kind, slot, activeUuid) => {
    const owned = s[listKey(kind)].map(u => entryOf(u, s.labels)), active = owned.find(e => e.uuid === activeUuid) ?? null;
    // 0.49.0: owned NPC Actors not linked yet (choosing one links it); never one already active in a pet box.
    const available = eligible[kind].filter(e => !e.linked && !act.has(e.uuid)).map(e => ({uuid: e.uuid, name: e.name, tag: KIND_TITLE[e.info.kind], why: e.info.label}));
    // A linked NPC the character's owners no longer own stays linked; the box says so and the owner can clear it.
    if (active) active.notOwned = !!active.actor && !active.ineligible && active.actor.type === 'npc' && (!globalThis.game?.user?.isGM || playerOwners(actor).length > 0) && !ownedForCharacter(actor, active.actor);
    const placed = (active && s.gear[active.key]) || {};
    const sockets = SOCKETS[kind].map(({key, type, label, name}) => { const item = itemOn(actor, placed[key]); return {key, type, label, name, item, problem: item ? gearProblem(actor, item, kind, {key, type, label}) : ''}; });
    const perks = active ? (s.perks[active.key] ?? []).map(id => itemOn(actor, id)).filter(Boolean) : [];
    const perkProblems = Object.fromEntries(perks.map(i => [i.id, perkProblem(actor, i, kind)]).filter(([, p]) => p));
    const others = kind === 'pet' ? owned.filter(e => !act.has(e.uuid)) : owned.filter(e => e !== active);
    return {kind, slot, active, owned, others, available, sockets, perks, perkProblems, gearItems: sockets.map(x => x.item).filter(Boolean)};
  };
  const pets = [];
  for (let i = 0; i < MAX_PET_SLOTS; i++) if (i < petSlots || s.activePets[i]) pets.push(make('pet', i, s.activePets[i]));
  return {mount: make('mount', 0, s.activeMount), pets, pet: pets[0] ?? null, petSlots};
}
/** Read-only compatibility view used by the public API. */
export function companionsData(actor) {
  const b = companionBoxes(actor), s = readSlots(actor), act = activeSet(s), n = b.petSlots;
  const row = (e, active) => ({itemId: null, actorUuid: e.uuid, item: null, actor: e.actor, name: e.denied && !e.customName ? '' : e.name, description: e.description, actorName: e.denied ? '' : e.actorName, active, perkItemIds: s.perks[e.key] ?? [], gearItemIds: Object.values(s.gear[e.key] ?? {})});
  const pets = s.pets.map(u => entryOf(u, s.labels)).map(e => row(e, act.has(e.uuid)));
  return {mount: b.mount.active ? row(b.mount.active, true) : null, pets, petCap: n, cap: n, capLabel: `${n} pet slot${n === 1 ? '' : 's'}`, overCap: s.activePets.some((u, i) => u && i >= n), boxes: b};
}

// ---------- Linking candidates (keyboard route; dragging from the Actors sidebar works for any Actor) ----------

export const LINKABLE_CAP = 150;
/** Every world Actor this user could link to `actor` (observable, not itself, a backup or already linked), unsorted and uncapped. */
function linkCandidates(actor) {
  const s = readSlots(actor), linked = new Set([...s.pets, ...s.mounts]);
  return [...(globalThis.game?.actors ?? [])].filter(a => a !== actor && a.uuid !== actor.uuid && !linked.has(a.uuid) && !isBackup(a) && canSeeActor(a) && String(a.uuid ?? '').startsWith('Actor.') && companionKindOf(a).source !== 'utility');
}
/** Finds a linkable Actor by typed name among ALL candidates: an exact name (any case) wins, else a name containing the text. */
export function findLinkableActor(actor, text) {
  const q = String(text ?? '').trim().toLowerCase();
  if (!q) return refuse('Type the name of an Actor to link.');
  const all = linkCandidates(actor), exact = all.filter(a => String(a.name ?? '').trim().toLowerCase() === q);
  const hits = exact.length ? exact : all.filter(a => String(a.name ?? '').toLowerCase().includes(q));
  if (hits.length === 1) return {ok: true, actor: hits[0]};
  return refuse(hits.length ? `${hits.length} Actors match "${String(text).trim()}". Type more of the name, or pick one from the list.` : `No Actor you can see matches "${String(text).trim()}". The GM may need to share it with you.`);
}
/** Actors in a folder named "Companions" first (and, when there are any, the whole list); otherwise every non-character Actor. */
export function linkableActors(actor, kind) {
  const all = linkCandidates(actor);
  const inCompanions = a => { for (let f = a.folder; f; f = f.folder) if (/^companions?$/i.test(String(f.name ?? '').trim())) return true; return false; };
  const folderPath = a => { const names = []; for (let f = a.folder; f; f = f.folder) names.unshift(String(f.name ?? '')); return names.join(' / '); };
  const pool = all.some(inCompanions) ? all.filter(inCompanions) : all.filter(a => a.type !== 'character');
  const word = kind === 'mount' ? /mount/i : /pet|companion/i;
  const rank = a => word.test(`${folderPath(a)} ${a.name ?? ''}`) ? 0 : 1;
  return pool.sort((a, b) => rank(a) - rank(b) || String(a.name).localeCompare(String(b.name))).slice(0, LINKABLE_CAP);
}

// ---------- Writing (one Actor update per change; permissions enforced here) ----------

const notOwner = actor => refuse(`You don't own ${actor?.name ?? 'this character'}, so you can't change its companions.`);
/** Owner only, and (for players) only while the GM shows Companions to players. */
const cannotChange = actor => isBackup(actor) ? refuse(BACKUP_REFUSAL) : canEdit(actor) ? requirePart('companions') : notOwner(actor);

/** Drops gear and perk ids whose Items are gone, so their sockets free up. Linked Actors are kept even when missing. */
function prune(actor, s) {
  const has = id => !!itemOn(actor, id), out = emptySlots();
  for (const kind of KINDS) out[listKey(kind)] = s[listKey(kind)];
  out.activePets = [...s.activePets]; out.activeMount = s.activeMount; out.labels = s.labels;
  for (const [k, g] of Object.entries(s.gear)) { const kept = Object.fromEntries(Object.entries(g).filter(([, id]) => has(id))); if (Object.keys(kept).length) out.gear[k] = kept; }
  for (const [k, list] of Object.entries(s.perks)) { const kept = list.filter(has); if (kept.length) out.perks[k] = kept; }
  return cleanSlots(out);
}
/** `==` makes Foundry replace the whole object instead of merging, so removed sockets really go. Always writes version 2. */
const save = (actor, s) => actor.update({[`flags.${MODULE_ID}.==${FLAG}`]: prune(actor, s)});

/** Copies an Item dropped from elsewhere onto the character (the source never changes); returns the embedded id. */
async function embedDropped(actor, item) {
  if (item.parent === actor || item.actor === actor) return item.id;
  const {data} = await grantBundle(item, {quantity: item.system?.quantity ?? 1, scope: MODULE_ID, tag: {}});
  if (!data.length) return null;
  const created = await actor.createEmbeddedDocuments('Item', data, {keepId: true});
  return (created ?? []).find(d => d?.id === data[0]._id)?.id ?? created?.[0]?.id ?? null;
}
const KIND_REFUSAL = kind => refuse(`Unknown companion kind ${kind}.`);

/** The pet box number (0 to 2; a mount is always 0), or a refusal. */
function slotArg(kind, slot) {
  if (kind !== 'pet') return {ok: true, slot: 0};
  const n = slot === undefined || slot === null ? 0 : Number(slot);
  return Number.isInteger(n) && n >= 0 && n < MAX_PET_SLOTS ? {ok: true, slot: n} : refuse(`There is no pet box ${Number(slot) + 1}.`);
}
const activeAt = (s, kind, slot) => kind === 'pet' ? s.activePets[slot] ?? null : s.activeMount;
const setActive = (s, kind, slot, uuid) => { if (kind === 'pet') s.activePets[slot] = uuid; else s.activeMount = uuid; };
const slotCountText = n => n === 0 ? 'no pet slots' : `${n} pet slot${n === 1 ? '' : 's'}`;
/**
 * Whether pet box `slot` may hold `uuid` now: only boxes below the character's pet slot count may be filled, and a pet
 * can be active in one box only. Clearing is never limited.
 */
function petBoxRefusal(actor, s, slot, uuid) {
  const count = petSlotsFor(actor);
  if (slot >= count) return refuse(`${actor.name} has ${slotCountText(count)}, so pet box ${slot + 1} can't be filled. You can clear it.`);
  const elsewhere = s.activePets.findIndex((u, i) => u === uuid && i !== slot);
  if (elsewhere >= 0) return refuse(`That pet is already active in pet box ${elsewhere + 1}.`);
  return null;
}

/**
 * Makes a companion Actor active: the mount, or the pet in box `slot` (0 to 2). '' or null clears it. An Actor that is not
 * linked yet is linked first when it is eligible (the player owns it and its kind fits the box; the GM may link any).
 */
export async function activateCompanion(actor, kind, uuid, slot = 0) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (!KINDS.includes(kind)) return KIND_REFUSAL(kind);
  const at = slotArg(kind, slot); if (!at.ok) return at;
  const s = readSlots(actor);
  if (!uuid) { setActive(s, kind, at.slot, null); await save(actor, s); return {ok: true, result: null}; }
  if (!s[listKey(kind)].includes(uuid)) {
    // 0.49.0: an owned Actor chosen from the dropdown is linked and made active in this box.
    const other = linkedActor(uuid);
    if (!other) return refuse(`That ${kindName(kind)} is not linked to ${actor.name}.`);
    return linkActor(actor, other, kind, at.slot, 'auto');
  }
  if (kind === 'pet') {
    if (s.activePets[at.slot] === uuid) return {ok: true, result: uuid};
    const no = petBoxRefusal(actor, s, at.slot, uuid); if (no) return no;
  }
  setActive(s, kind, at.slot, uuid);
  await save(actor, s);
  return {ok: true, result: uuid};
}
/**
 * Links a world Actor (a pet or mount with its own sheet) and makes it active: the mount, or a pet in box `slot` (without
 * `slot`, the first empty pet box; when every box is full or the character has none, the pet is linked and not active).
 * Players need at least Observer permission on it; compendium Actors must be imported into the world first. The Actor
 * itself is never changed.
 */
export const addActorCompanion = (actor, other, kind, slot = null) => linkActor(actor, other, kind, slot, 'manual');
/**
 * The shared link path. 'manual' (drop, find, link list) needs Observer for players; 'auto' (chosen from a dropdown) needs
 * the player to own it and its kind to fit (autoLinkRefusal). The GM may link anything either way.
 */
async function linkActor(actor, other, kind, slot, mode) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (!KINDS.includes(kind)) return KIND_REFUSAL(kind);
  if (!other || other.documentName !== 'Actor') return refuse('Drop an Actor here.');
  if (isBackup(other)) return refuse(BACKUP_REFUSAL);
  if (other === actor || other.uuid === actor.uuid) return refuse(`${actor.name} can't be its own companion.`);
  if (other.pack || !worldUuid(other.uuid)) return refuse(`Import ${other.name} into the world first, then drop it from the Actors sidebar.`);
  const kindInfo = companionKindOf(other);
  if (kindInfo.source === 'utility') return refuse(`${other.name} is ${kindInfo.reason}, not a creature, so it can't be a ${kindName(kind)}. ${globalThis.game?.user?.isGM ? "To force it, set its companion type in GM Setup." : 'Ask the GM if you think this is wrong.'}`);
  const user = globalThis.game?.user;
  if (mode === 'auto') { const no = autoLinkRefusal(actor, other, kind, user); if (no) return no; }
  else if (!user?.isGM && other.testUserPermission?.(user, 'OBSERVER') !== true) return refuse(`You can't see ${other.name}. Ask the GM to share it with you.`);
  const s = readSlots(actor), known = s.pets.includes(other.uuid) || s.mounts.includes(other.uuid);
  if (known && !s[listKey(kind)].includes(other.uuid)) return refuse(`${other.name} is already linked as a ${kind === 'pet' ? 'mount' : 'pet'}.`);
  let target = 0, activate = true;
  if (kind === 'pet') {
    const wanted = slot === null || slot === undefined ? null : slotArg(kind, slot);
    if (wanted && !wanted.ok) return wanted;
    if (wanted) {
      if (s.activePets[wanted.slot] !== other.uuid) { const no = petBoxRefusal(actor, s, wanted.slot, other.uuid); if (no) return no; }
      target = wanted.slot;
    } else if (s.activePets.includes(other.uuid)) activate = false;   // already active in a box: nothing more to do
    else { const free = [...Array(Math.min(MAX_PET_SLOTS, petSlotsFor(actor))).keys()].find(i => !s.activePets[i]); if (free === undefined) activate = false; else target = free; }
  }
  if (!known) s[listKey(kind)].push(other.uuid);
  if (activate) setActive(s, kind, target, other.uuid);
  if (known && !activate) return {ok: true, result: other.uuid};
  await save(actor, s);
  return {ok: true, result: other.uuid, activated: activate};
}
/** Stops using a linked Actor as a pet or mount. The Actor is kept; the gear it wore is forgotten (the Items stay on the character). */
export async function removeCompanion(actor, kind, uuid) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (!KINDS.includes(kind)) return KIND_REFUSAL(kind);
  const s = readSlots(actor);
  if (!s[listKey(kind)].includes(uuid)) return refuse(`That ${kindName(kind)} is no longer listed.`);
  s[listKey(kind)] = s[listKey(kind)].filter(u => u !== uuid);
  s.activePets = s.activePets.map(u => u === uuid ? null : u);
  if (s.activeMount === uuid) s.activeMount = null;
  delete s.gear[ckey(uuid)]; delete s.perks[ckey(uuid)]; delete s.labels[ckey(uuid)];
  await save(actor, s);
  return {ok: true};
}

/**
 * The player's own name and description for a linked companion, stored on the character (plain text, name up to 60
 * characters, description up to 500, markup removed). An empty name falls back to the Actor's own. Owner or GM only.
 */
export async function setCompanionLabel(actor, uuid, {name = '', description = ''} = {}) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  const s = readSlots(actor), k = ckey(uuid);
  if (![...s.pets, ...s.mounts].some(u => u === uuid)) return refuse('That companion is no longer listed.');
  const label = cleanLabel({name, description});
  if (label.name || label.description) s.labels[k] = label; else delete s.labels[k];
  await save(actor, s);
  return {ok: true, result: label};
}

function whereIs(s, itemId) {
  for (const [k, g] of Object.entries(s.gear)) for (const [key, id] of Object.entries(g)) if (id === itemId) return {k, key, kind: s.pets.some(u => ckey(u) === k) ? 'pet' : 'mount'};
  return null;
}
/** The active companion of `kind` (pet box `slot`), or null. */
function activeOf(s, kind, slot) {
  const uuid = activeAt(s, kind, slot);
  return uuid ? {uuid, key: ckey(uuid)} : null;
}
const chooseText = (kind, slot, count) => kind === 'pet' && slot !== null && count > 1 ? `Choose a pet for pet box ${slot + 1} first.` : `Choose a ${kindName(kind)} first.`;
/** Puts a gear Item already on the character into a socket of the active companion (pet box `slot` for pets). */
export async function socketGear(actor, kind, socketKey, itemId, slot = 0) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (!KINDS.includes(kind)) return KIND_REFUSAL(kind);
  const at = slotArg(kind, slot); if (!at.ok) return at;
  const spec = SOCKETS[kind].find(x => x.key === socketKey);
  if (!spec) return refuse(`A ${kindName(kind)} has no ${socketKey} socket.`);
  const s = readSlots(actor), cur = activeOf(s, kind, at.slot);
  if (!cur) return refuse(chooseText(kind, at.slot, companionBoxes(actor).pets.length));
  const item = itemOn(actor, itemId);
  if (!item) return refuse('That item is not on this character.');
  const problem = gearProblem(actor, item, kind, spec); if (problem) return refuse(problem);
  const there = whereIs(s, itemId);
  if (there) return refuse(`${item.name} is already in a ${socketLabel(there.kind, there.key)} socket${there.k === cur.key ? '' : ' of another companion'}. Take it out first.`);
  if (usedItemIds(s).has(itemId)) return refuse(`${item.name} is already on a companion.`);
  const held = itemOn(actor, s.gear[cur.key]?.[socketKey]);
  if (held) return refuse(`The ${spec.label} socket is taken by ${held.name}. Take it out first.`);
  (s.gear[cur.key] ??= {})[socketKey] = itemId;
  await save(actor, s);
  return {ok: true, result: socketKey};
}
/**
 * Gear dropped on a socket (or, with no socketKey, on the box: the first free socket of its type). `slot` is the pet box;
 * without it a pet's gear goes to the first active pet with a free fitting socket. Items from elsewhere are copied onto
 * the character, but only after the fit and free-socket checks pass.
 */
export async function socketDroppedGear(actor, kind, socketKey, item, slot = null) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (!KINDS.includes(kind)) return KIND_REFUSAL(kind);
  if (!item || item.documentName !== 'Item') return refuse('Drop an item here.');
  const onChar = item.parent === actor || item.actor === actor;
  const problem = gearProblem(actor, item, kind, null, {onCharacter: onChar});
  if (problem) return refuse(problem);
  const given = slot === null || slot === undefined ? null : slotArg(kind, slot);
  if (given && !given.ok) return given;
  const s = readSlots(actor);
  const boxes = kind === 'mount' ? [0] : given ? [given.slot] : [0, 1, 2];
  const specs = socketKey ? SOCKETS[kind].filter(x => x.key === socketKey) : SOCKETS[kind];
  if (socketKey && !specs.length) return refuse(`A ${kindName(kind)} has no ${socketKey} socket.`);
  const fitting = specs.filter(x => slotFit(item, x).ok);
  if (!fitting.length) return refuse(slotFit(item, specs[0]).error);
  const withActive = boxes.map(n => ({n, cur: activeOf(s, kind, n)})).filter(x => x.cur);
  if (!withActive.length) return refuse(chooseText(kind, given ? boxes[0] : null, companionBoxes(actor).pets.length));
  let found = null;
  for (const {n, cur} of withActive) {
    const placed = s.gear[cur.key] ?? {}, free = fitting.find(x => !itemOn(actor, placed[x.key]));
    if (free) { found = {n, key: free.key}; break; }
  }
  if (!found) {
    if (socketKey) { const {cur} = withActive[0], held = itemOn(actor, (s.gear[cur.key] ?? {})[socketKey]); return refuse(`The ${fitting[0].label} socket is taken by ${held?.name ?? 'another item'}. Take it out first.`); }
    const what = companionSlot(item) ? `${SLOT_LABELS[companionSlot(item)]} socket` : `${kindName(kind)} socket`;
    return refuse(`No free ${what}${companionSlot(item) ? ` for ${item.name}` : ''}. Take something out first.`);
  }
  if (item.parent === actor || item.actor === actor) return socketGear(actor, kind, found.key, item.id, found.n);
  const id = await embedDropped(actor, item);
  if (!id) return refuse('The item could not be added to the character.');
  return socketGear(actor, kind, found.key, id, found.n);
}
/** Takes whatever is in the socket out. The Item stays on the character. */
export async function clearSocket(actor, kind, socketKey, slot = 0) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (!KINDS.includes(kind)) return KIND_REFUSAL(kind);
  const at = slotArg(kind, slot); if (!at.ok) return at;
  if (!SOCKETS[kind].some(x => x.key === socketKey)) return refuse(`A ${kindName(kind)} has no ${socketKey} socket.`);
  const s = readSlots(actor), cur = activeOf(s, kind, at.slot);
  if (!cur || !s.gear[cur.key]?.[socketKey]) return {ok: true};
  delete s.gear[cur.key][socketKey];
  if (!Object.keys(s.gear[cur.key]).length) delete s.gear[cur.key];
  await save(actor, s);
  return {ok: true};
}

/** Adds a perk Item (already on the character) to the active companion's perk list (pet box `slot` for pets). */
export async function attachPerk(actor, kind, itemId, slot = 0) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (!KINDS.includes(kind)) return KIND_REFUSAL(kind);
  const at = slotArg(kind, slot); if (!at.ok) return at;
  const s = readSlots(actor), cur = activeOf(s, kind, at.slot);
  if (!cur) return refuse(chooseText(kind, at.slot, companionBoxes(actor).pets.length));
  const perk = itemOn(actor, itemId);
  if (!perk) return refuse('That item is not on this character.');
  const bad = perkProblem(actor, perk, kind); if (bad) return refuse(bad);
  if (usedItemIds(s).has(itemId)) return refuse(`${perk.name} is already on a companion.`);
  (s.perks[cur.key] ??= []).push(itemId);
  await save(actor, s);
  return {ok: true};
}
export async function attachDroppedPerk(actor, kind, item, slot = null) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (!KINDS.includes(kind)) return KIND_REFUSAL(kind);
  if (!item || item.documentName !== 'Item') return refuse('Drop an item here.');
  const bad = perkProblem(actor, item, kind, {onCharacter: item.parent === actor || item.actor === actor}); if (bad) return refuse(bad);
  const given = slot === null || slot === undefined ? null : slotArg(kind, slot);
  if (given && !given.ok) return given;
  const s = readSlots(actor), n = given ? given.slot : kind === 'mount' ? 0 : s.activePets.findIndex(Boolean);
  if (n < 0 || !activeOf(s, kind, n)) return refuse(chooseText(kind, given ? n : null, companionBoxes(actor).pets.length));
  const id = await embedDropped(actor, item);
  if (!id) return refuse('The item could not be added to the character.');
  return attachPerk(actor, kind, id, n);
}
export async function detachPerk(actor, kind, itemId, slot = 0) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (!KINDS.includes(kind)) return KIND_REFUSAL(kind);
  const at = slotArg(kind, slot); if (!at.ok) return at;
  const s = readSlots(actor), cur = activeOf(s, kind, at.slot);
  if (!cur) return {ok: true};
  s.perks[cur.key] = (s.perks[cur.key] ?? []).filter(id => id !== itemId);
  if (!s.perks[cur.key].length) delete s.perks[cur.key];
  await save(actor, s);
  return {ok: true};
}

/**
 * Something dropped on a box (not on a socket): an Actor is linked as the pet (in that pet box) or mount; an Item goes
 * where its role says (a perk to the perk list, gear to the first free socket of its type). Items marked for the other
 * kind of companion are refused. `slot` is the pet box dropped on.
 */
export async function dropOnBox(actor, kind, doc, slot = null) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (!KINDS.includes(kind)) return KIND_REFUSAL(kind);
  if (doc?.documentName === 'Actor') return addActorCompanion(actor, doc, kind, slot);
  if (!doc || doc.documentName !== 'Item') return refuse('Drop an Actor or an item here.');
  const route = routeForRole(doc, kind); if (!route.ok) return route;
  return route.list === 'perk' ? attachDroppedPerk(actor, kind, doc, slot) : socketDroppedGear(actor, kind, null, doc, slot);
}

// ---------- Migration ----------

/**
 * Brings the character's companion data to version 2 when it is older. A version 1 flag is rewritten as version 2
 * (activePet becomes activePets[0], Other sockets become Tack); a character with only the pre-0.47.0 list gets version 2
 * built from it. Nothing is deleted. Safe to run any number of times: it does nothing once the flag is version 2, and
 * never touches the old list. System action (no player permissions).
 */
export async function migrateCompanionSlots(actor) {
  if (!actor || isBackup(actor)) return {ok: true, migrated: false};
  const flags = actor.flags?.[MODULE_ID], saved = flags?.[FLAG];
  if (isObj(saved) && saved.version === SLOTS_VERSION && cleanSlots(saved)) return {ok: true, migrated: false};
  const v1 = isObj(saved) && saved.version === 1 ? cleanSlots(saved) : null;
  if (v1) { mergeLegacyLabels(v1, actor); await actor.update({[`flags.${MODULE_ID}.==${FLAG}`]: v1}); return {ok: true, migrated: true}; }
  if (!Array.isArray(flags?.[LEGACY_FLAG]) || !flags[LEGACY_FLAG].length) return {ok: true, migrated: false};
  const built = slotsFromLegacy(actor);
  await actor.update({[`flags.${MODULE_ID}.==${FLAG}`]: built});
  return {ok: true, migrated: true};
}
/** GM only, once the world is ready: migrates every character that still has version 1 or only the old list. */
export async function migrateAllCompanionSlots(actors = globalThis.game?.actors) {
  if (!globalThis.game?.user?.isGM) return {ok: false, migrated: 0};
  let migrated = 0;
  for (const a of actors ?? []) {
    if (a.type !== 'character') continue;
    try { if ((await migrateCompanionSlots(a)).migrated) migrated++; } catch (err) { console.warn('Ashen Gate | Character Hub: companions migration skipped for one character', err); }
  }
  return {ok: true, migrated};
}

/**
 * Registers the pet slot settings (hidden; the GM changes them in GM Setup) and the two retired pet limit settings
 * (hidden: their saved values stay in the world, nothing reads them).
 */
export function registerCompanionSettings(settings = globalThis.game?.settings, onChange = () => {}) {
  settings?.register?.(MODULE_ID, 'petCap', {name: 'Character Hub: pets per character (no longer used)', hint: 'No longer used. See pet slots.', scope: 'world', config: false, type: Number, default: 0});
  settings?.register?.(MODULE_ID, 'petCapOverrides', {scope: 'world', config: false, type: Object, default: {}});
  settings?.register?.(MODULE_ID, SLOTS_SETTING, {name: 'Character Hub: default pet slots', hint: 'How many pets a character can have active at once (0 to 3). Change it in GM Setup.', scope: 'world', config: false, type: Number, default: DEFAULT_PET_SLOTS, onChange});
  settings?.register?.(MODULE_ID, OVERRIDES_SETTING, {scope: 'world', config: false, type: Object, default: {}, onChange});
}
