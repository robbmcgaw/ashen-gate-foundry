/**
 * Companions (0.47.0): a Pet box and a Mount box. A companion is a world Actor (an NPC with stats, linked by UUID,
 * Observer permission needed for players). A character may link many pet Actors and many mount Actors, but exactly one of
 * each is active. Each companion has sockets: a pet has Head and Body; a mount has Saddle and four Other. Gear (pet
 * clothing, mount gear) is an ordinary Item on the character dropped into a socket; a socket holds one item and an item
 * sits in one socket of one companion at a time. Gear stays with its own companion Actor when another becomes active.
 * Nothing is applied: the stats box only reads the items' own dnd5e data and Active Effects.
 *
 * Saved data: flags['ashen-gate-character-hub'].companionSlots (version 1)
 *   {version: 1, activePet: uuid|null, activeMount: uuid|null, pets: [actorUuid], mounts: [actorUuid],
 *    gear: {actorId: {socketKey: gearItemId}}, perks: {actorId: [perkItemId]}}
 * (actorId is the UUID without its "Actor." prefix, because Foundry reads dots in flag keys as paths.)
 * The pre-0.47.0 list flags[...].companions is never deleted or rewritten. Reading prefers companionSlots; while it is
 * absent the same shape is derived in memory from the old list (migrateCompanionSlots writes it, safe to re-run).
 * Older Item companions (no Actor) stay in the old flag and are listed read-only in the tab.
 *
 * Which socket an item fits: the item data says nothing about Saddle, Head or Body (docs/companion-items-schema.md), so any
 * gear item for that kind fits any socket of it. The pet limit settings (petCap, petCapOverrides) are no longer used.
 */
import {MODULE_ID} from './constants.mjs';
export {companionRole, COMPANION_ROLES, ID_PREFIXES, companionStats, routeForRole} from './companion-items.mjs';
import {companionRole, routeForRole} from './companion-items.mjs';
import {canEdit} from './actions.mjs';
import {requirePart} from './visibility.mjs';
import {grantBundle} from './ag-item-drop.mjs';
import {isBackup} from './level-backup.mjs';

export const KINDS = ['mount', 'pet'];
export const SLOTS_VERSION = 1;
export const SOCKETS = {
  pet: [{key: 'head', label: 'Head'}, {key: 'body', label: 'Body'}],
  mount: [{key: 'saddle', label: 'Saddle'}, {key: 'other1', label: 'Other 1'}, {key: 'other2', label: 'Other 2'}, {key: 'other3', label: 'Other 3'}, {key: 'other4', label: 'Other 4'}]
};
export const socketLabel = (kind, key) => SOCKETS[kind]?.find(s => s.key === key)?.label ?? key;
const FLAG = 'companionSlots', LEGACY_FLAG = 'companions';
const refuse = error => ({ok: false, error});
/** Level backup copies (0.27.0) are not playable characters: never a companion target. */
export const BACKUP_REFUSAL = 'That is a level backup copy, not a playable character.';
const NOT_GEAR_TYPES = ['class', 'subclass', 'background', 'race', 'spell'];
const activeKey = kind => kind === 'pet' ? 'activePet' : 'activeMount';
const listKey = kind => kind === 'pet' ? 'pets' : 'mounts';
const kindName = kind => kind === 'pet' ? 'pet' : 'mount';

// ---------- Retired pet limit (0.47.0) ----------
// The GM's pet limit no longer applies; the saved settings stay untouched. These keep the read-only API working.
export const DEFAULT_PET_CAP = 0;
/** Always unlimited now: the Pet box holds as many pet Items as the character owns, with one active. */
export const petCapFor = () => Infinity;
/** Reserved hook kept so partners that call it do not break. It registers nothing and changes nothing. */
export function registerPetSlotSource(id, fn) {
  if (typeof id !== 'string' || !id || typeof fn !== 'function') return refuse('registerPetSlotSource(id, fn) needs an id and a function.');
  return {ok: true};
}
export const unregisterPetSlotSource = () => false;

// ---------- Reading ----------

const idList = v => Array.isArray(v) ? [...new Set(v.filter(x => typeof x === 'string' && x))] : [];
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const emptySlots = () => ({version: SLOTS_VERSION, activePet: null, activeMount: null, pets: [], mounts: [], gear: {}, perks: {}});
/** Gear and perk maps are keyed by the world Actor id (no dots). */
export const ckey = uuid => String(uuid ?? '').replace(/^Actor\./, '');
const worldUuid = v => typeof v === 'string' && /^Actor\.[A-Za-z0-9]+$/.test(v) ? v : null;

/** The saved companionSlots flag, normalised (unknown keys dropped, duplicates removed). Null when absent or not version 1. */
export function cleanSlots(raw) {
  if (!isObj(raw) || raw.version !== SLOTS_VERSION) return null;
  const out = emptySlots(), seen = new Set();
  for (const kind of KINDS) for (const u of idList(raw[listKey(kind)])) if (worldUuid(u) && !seen.has(u)) { seen.add(u); out[listKey(kind)].push(u); }
  for (const kind of KINDS) out[activeKey(kind)] = typeof raw[activeKey(kind)] === 'string' && out[listKey(kind)].includes(raw[activeKey(kind)]) ? raw[activeKey(kind)] : null;
  const owned = new Map([...out.pets.map(u => [ckey(u), 'pet']), ...out.mounts.map(u => [ckey(u), 'mount'])]);
  const used = new Set();
  if (isObj(raw.gear)) for (const [k, sockets] of Object.entries(raw.gear)) {
    const kind = owned.get(k); if (!kind || !isObj(sockets)) continue;
    for (const {key} of SOCKETS[kind]) {
      const g = sockets[key];
      if (typeof g === 'string' && g && !used.has(g)) { used.add(g); (out.gear[k] ??= {})[key] = g; }
    }
  }
  if (isObj(raw.perks)) for (const [k, list] of Object.entries(raw.perks)) {
    if (!owned.has(k)) continue;
    const ids = idList(list).filter(p => !used.has(p)); ids.forEach(p => used.add(p));
    if (ids.length) out.perks[k] = ids;
  }
  return out;
}

/** One entry of the pre-0.47.0 list: Actor-linked companions only (Item companions are listed read-only, not migrated). */
function legacyEntry(e) {
  if (!isObj(e) || !KINDS.includes(e.kind)) return null;
  const uuid = worldUuid(e.actorUuid); if (!uuid) return null;
  return {kind: e.kind, uuid, perkItemIds: idList(e.perkItemIds), gearItemIds: e.kind === 'mount' ? idList(e.gearItemIds) : [],
    clothing: e.kind === 'pet' ? (Array.isArray(e.clothing) ? e.clothing : []).filter(x => typeof x === 'string' && x) : []};
}
/** The new shape built from the old list, in memory only. The old flag is read, never changed. */
export function slotsFromLegacy(actor) {
  const raw = actor?.flags?.[MODULE_ID]?.[LEGACY_FLAG], out = emptySlots();
  const entries = (Array.isArray(raw) ? raw : []).map(legacyEntry).filter(Boolean);
  const used = new Set(), has = id => !!actor.items?.get?.(id), taken = new Set();
  for (const e of entries) if (!taken.has(e.uuid)) { taken.add(e.uuid); out[listKey(e.kind)].push(e.uuid); }
  for (const kind of KINDS) out[activeKey(kind)] = out[listKey(kind)][0] ?? null;
  for (const e of entries) {
    if (!out[listKey(e.kind)].includes(e.uuid)) continue;
    const k = ckey(e.uuid), gear = e.kind === 'mount' ? e.gearItemIds : e.clothing;
    gear.filter(id => has(id) && !used.has(id)).slice(0, SOCKETS[e.kind].length).forEach((id, n) => { used.add(id); (out.gear[k] ??= {})[SOCKETS[e.kind][n].key] = id; });
    const perks = e.perkItemIds.filter(id => has(id) && !used.has(id)); perks.forEach(id => used.add(id));
    if (perks.length) out.perks[k] = perks;
  }
  return out;
}
/** The companion data in force: the saved companionSlots flag when present, else derived from the old list. */
export const readSlots = actor => cleanSlots(actor?.flags?.[MODULE_ID]?.[FLAG]) ?? slotsFromLegacy(actor);
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

const itemOn = (actor, id) => id ? actor.items?.get?.(id) ?? null : null;
/** The tier shown with a gear item's name, when its data carries one (display only). */
export const tierOf = item => { const t = item?.flags?.[MODULE_ID]?.companion?.tier ?? item?.flags?.['ashen-gate-manager']?.source?.tier; return typeof t === 'string' ? t.trim() : ''; };

/** Ids already in use as gear or perks. */
const usedItemIds = s => new Set([...Object.values(s.gear).flatMap(g => Object.values(g)), ...Object.values(s.perks).flat()]);
const sortByName = items => items.sort((a, b) => String(a.name).localeCompare(String(b.name)));
const candidates = (actor, s) => { const used = usedItemIds(s); return [...(actor.items ?? [])].filter(i => !used.has(i.id) && !NOT_GEAR_TYPES.includes(i.type)); };
/** Items on the character that fit a socket of this kind: marked for it first (marked: true), then unmarked gear. */
export function gearChoices(actor, kind) {
  const list = candidates(actor, readSlots(actor)).filter(i => i.type !== 'feat' || companionRole(i)).map(i => ({item: i, route: routeForRole(i, kind, kind === 'mount' ? 'gear' : 'clothing')})).filter(x => x.route.ok);
  return sortByName(list.map(x => x.item)).map(item => ({item, marked: !!companionRole(item)})).sort((a, b) => Number(b.marked) - Number(a.marked));
}
/** Perk Items that fit the active companion's perk list. */
export const perkChoices = (actor, kind) => sortByName(candidates(actor, readSlots(actor)).filter(i => routeForRole(i, kind, 'perk').ok));

/**
 * A linked companion resolved for display. A linked Actor the viewer can no longer observe (the GM unshared it) is
 * `denied`: it stays listed and removable, but its name, art and stats never show.
 */
function entryOf(uuid) {
  const found = linkedActor(uuid), denied = !!found && !canSeeActor(found), actor = denied ? null : found;
  return {uuid, key: ckey(uuid), actor, denied, missing: !found, name: actor?.name ?? (denied ? 'Companion (not shared)' : 'Missing companion'), art: actor?.img || ''};
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
 * Both boxes, resolved for display: {pet, mount}, each {kind, active, others, sockets: [{key, label, item}], perks, gearItems}.
 * `active` and `others` are linked companions {uuid, actor, denied, missing, name, art}.
 */
export function companionBoxes(actor) {
  const s = readSlots(actor), out = {};
  for (const kind of KINDS) {
    const owned = s[listKey(kind)].map(entryOf), active = owned.find(e => e.uuid === s[activeKey(kind)]) ?? null;
    const placed = (active && s.gear[active.key]) || {};
    const sockets = SOCKETS[kind].map(({key, label}) => ({key, label, item: itemOn(actor, placed[key])}));
    const perks = active ? (s.perks[active.key] ?? []).map(id => itemOn(actor, id)).filter(Boolean) : [];
    out[kind] = {kind, active, owned, others: owned.filter(e => e !== active), sockets, perks, gearItems: sockets.map(x => x.item).filter(Boolean)};
  }
  return out;
}
/** Read-only compatibility view used by the public API. */
export function companionsData(actor) {
  const b = companionBoxes(actor), s = readSlots(actor);
  const row = (e, kind) => ({itemId: null, actorUuid: e.uuid, item: null, actor: e.actor, name: e.denied ? '' : e.name, active: e === b[kind].active, perkItemIds: s.perks[e.key] ?? [], gearItemIds: Object.values(s.gear[e.key] ?? {})});
  return {mount: b.mount.active ? row(b.mount.active, 'mount') : null, pets: b.pet.owned.map(e => row(e, 'pet')), cap: Infinity, capLabel: 'unlimited', overCap: false, boxes: b};
}

// ---------- Linking candidates (keyboard route; dragging from the Actors sidebar works for any Actor) ----------

export const LINKABLE_CAP = 150;
/** Every world Actor this user could link to `actor` (observable, not itself, a backup or already linked), unsorted and uncapped. */
function linkCandidates(actor) {
  const s = readSlots(actor), linked = new Set([...s.pets, ...s.mounts]);
  return [...(globalThis.game?.actors ?? [])].filter(a => a !== actor && a.uuid !== actor.uuid && !linked.has(a.uuid) && !isBackup(a) && canSeeActor(a) && String(a.uuid ?? '').startsWith('Actor.'));
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
  for (const kind of KINDS) { out[listKey(kind)] = s[listKey(kind)]; out[activeKey(kind)] = s[activeKey(kind)]; }
  for (const [k, g] of Object.entries(s.gear)) { const kept = Object.fromEntries(Object.entries(g).filter(([, id]) => has(id))); if (Object.keys(kept).length) out.gear[k] = kept; }
  for (const [k, list] of Object.entries(s.perks)) { const kept = list.filter(has); if (kept.length) out.perks[k] = kept; }
  return cleanSlots(out);
}
/** `==` makes Foundry replace the whole object instead of merging, so removed sockets really go. */
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

/** Makes a linked companion Actor this kind's active one. '' or null clears the active one. */
export async function activateCompanion(actor, kind, uuid) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (!KINDS.includes(kind)) return KIND_REFUSAL(kind);
  const s = readSlots(actor);
  if (!uuid) { s[activeKey(kind)] = null; await save(actor, s); return {ok: true, result: null}; }
  if (!s[listKey(kind)].includes(uuid)) return refuse(`That ${kindName(kind)} is not linked to ${actor.name}.`);
  s[activeKey(kind)] = uuid;
  await save(actor, s);
  return {ok: true, result: uuid};
}
/**
 * Links a world Actor (a pet or mount with its own sheet) and makes it active. Players need at least Observer permission
 * on it; compendium Actors must be imported into the world first. The Actor itself is never changed.
 */
export async function addActorCompanion(actor, other, kind) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (!KINDS.includes(kind)) return KIND_REFUSAL(kind);
  if (!other || other.documentName !== 'Actor') return refuse('Drop an Actor here.');
  if (isBackup(other)) return refuse(BACKUP_REFUSAL);
  if (other === actor || other.uuid === actor.uuid) return refuse(`${actor.name} can't be its own companion.`);
  if (other.pack || !worldUuid(other.uuid)) return refuse(`Import ${other.name} into the world first, then drop it from the Actors sidebar.`);
  const user = globalThis.game?.user;
  if (!user?.isGM && other.testUserPermission?.(user, 'OBSERVER') !== true) return refuse(`You can't see ${other.name}. Ask the GM to share it with you.`);
  const s = readSlots(actor);
  if (s.pets.includes(other.uuid) || s.mounts.includes(other.uuid)) {
    if (!s[listKey(kind)].includes(other.uuid)) return refuse(`${other.name} is already linked as a ${kind === 'pet' ? 'mount' : 'pet'}.`);
    s[activeKey(kind)] = other.uuid; await save(actor, s); return {ok: true, result: other.uuid};
  }
  s[listKey(kind)].push(other.uuid); s[activeKey(kind)] = other.uuid;
  await save(actor, s);
  return {ok: true, result: other.uuid};
}
/** Stops using a linked Actor as a pet or mount. The Actor is kept; the gear it wore is forgotten (the Items stay on the character). */
export async function removeCompanion(actor, kind, uuid) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (!KINDS.includes(kind)) return KIND_REFUSAL(kind);
  const s = readSlots(actor);
  if (!s[listKey(kind)].includes(uuid)) return refuse(`That ${kindName(kind)} is no longer listed.`);
  s[listKey(kind)] = s[listKey(kind)].filter(u => u !== uuid);
  if (s[activeKey(kind)] === uuid) s[activeKey(kind)] = null;
  delete s.gear[ckey(uuid)]; delete s.perks[ckey(uuid)];
  await save(actor, s);
  return {ok: true};
}

const gearList = kind => kind === 'mount' ? 'gear' : 'clothing';
function whereIs(s, itemId) {
  for (const [k, g] of Object.entries(s.gear)) for (const [key, id] of Object.entries(g)) if (id === itemId) return {k, key, kind: s.pets.some(u => ckey(u) === k) ? 'pet' : 'mount'};
  return null;
}
/** The active companion of `kind`, or a refusal. */
function activeOf(actor, s, kind) {
  const uuid = s[activeKey(kind)];
  return uuid ? {uuid, key: ckey(uuid)} : null;
}
/** Puts a gear Item already on the character into a socket of the active companion of `kind`. */
export async function socketGear(actor, kind, socketKey, itemId) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (!KINDS.includes(kind)) return KIND_REFUSAL(kind);
  if (!SOCKETS[kind].some(x => x.key === socketKey)) return refuse(`A ${kindName(kind)} has no ${socketKey} socket.`);
  const s = readSlots(actor), cur = activeOf(actor, s, kind);
  if (!cur) return refuse(`Choose a ${kindName(kind)} first.`);
  const item = itemOn(actor, itemId);
  if (!item) return refuse('That item is not on this character.');
  if (NOT_GEAR_TYPES.includes(item.type) || (item.type === 'feat' && !companionRole(item))) return refuse(`${item.name} cannot go in a socket.`);
  const route = routeForRole(item, kind, gearList(kind)); if (!route.ok) return route;
  const there = whereIs(s, itemId);
  if (there) return refuse(`${item.name} is already in a ${socketLabel(there.kind, there.key)} socket${there.k === cur.key ? '' : ' of another companion'}. Take it out first.`);
  if (usedItemIds(s).has(itemId)) return refuse(`${item.name} is already on a companion.`);
  const held = itemOn(actor, s.gear[cur.key]?.[socketKey]);
  if (held) return refuse(`The ${socketLabel(kind, socketKey)} socket is taken by ${held.name}. Take it out first.`);
  (s.gear[cur.key] ??= {})[socketKey] = itemId;
  await save(actor, s);
  return {ok: true, result: socketKey};
}
/**
 * Gear dropped on a socket (or, with no socketKey, on the box: the first free socket). Items from elsewhere are copied
 * onto the character, but only after the fit and free-socket checks pass.
 */
export async function socketDroppedGear(actor, kind, socketKey, item) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (!KINDS.includes(kind)) return KIND_REFUSAL(kind);
  if (!item || item.documentName !== 'Item') return refuse('Drop an item here.');
  const route = routeForRole(item, kind, gearList(kind)); if (!route.ok) return route;
  if (NOT_GEAR_TYPES.includes(item.type) || (item.type === 'feat' && !companionRole(item))) return refuse(`${item.name} cannot go in a socket.`);
  const s = readSlots(actor), cur = activeOf(actor, s, kind);
  if (!cur) return refuse(`Choose a ${kindName(kind)} first.`);
  const placed = s.gear[cur.key] ?? {}, free = SOCKETS[kind].find(x => !itemOn(actor, placed[x.key]));
  const key = socketKey || free?.key;
  if (!key) return refuse(`No free ${kindName(kind)} socket. Take something out first.`);
  if (itemOn(actor, placed[key])) return refuse(`The ${socketLabel(kind, key)} socket is taken by ${itemOn(actor, placed[key]).name}. Take it out first.`);
  if (item.parent === actor || item.actor === actor) return socketGear(actor, kind, key, item.id);
  const id = await embedDropped(actor, item);
  if (!id) return refuse('The item could not be added to the character.');
  return socketGear(actor, kind, key, id);
}
/** Takes whatever is in the socket out. The Item stays on the character. */
export async function clearSocket(actor, kind, socketKey) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (!KINDS.includes(kind)) return KIND_REFUSAL(kind);
  if (!SOCKETS[kind].some(x => x.key === socketKey)) return refuse(`A ${kindName(kind)} has no ${socketKey} socket.`);
  const s = readSlots(actor), cur = activeOf(actor, s, kind);
  if (!cur || !s.gear[cur.key]?.[socketKey]) return {ok: true};
  delete s.gear[cur.key][socketKey];
  if (!Object.keys(s.gear[cur.key]).length) delete s.gear[cur.key];
  await save(actor, s);
  return {ok: true};
}

/** Adds a perk Item (already on the character) to the active companion's perk list. */
export async function attachPerk(actor, kind, itemId) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (!KINDS.includes(kind)) return KIND_REFUSAL(kind);
  const s = readSlots(actor), cur = activeOf(actor, s, kind);
  if (!cur) return refuse(`Choose a ${kindName(kind)} first.`);
  const perk = itemOn(actor, itemId);
  if (!perk) return refuse('That item is not on this character.');
  const route = routeForRole(perk, kind, 'perk'); if (!route.ok) return route;
  if (usedItemIds(s).has(itemId)) return refuse(`${perk.name} is already on a companion.`);
  (s.perks[cur.key] ??= []).push(itemId);
  await save(actor, s);
  return {ok: true};
}
export async function attachDroppedPerk(actor, kind, item) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (!KINDS.includes(kind)) return KIND_REFUSAL(kind);
  if (!item || item.documentName !== 'Item') return refuse('Drop an item here.');
  const route = routeForRole(item, kind, 'perk'); if (!route.ok) return route;
  if (!activeOf(actor, readSlots(actor), kind)) return refuse(`Choose a ${kindName(kind)} first.`);
  const id = await embedDropped(actor, item);
  if (!id) return refuse('The item could not be added to the character.');
  return attachPerk(actor, kind, id);
}
export async function detachPerk(actor, kind, itemId) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (!KINDS.includes(kind)) return KIND_REFUSAL(kind);
  const s = readSlots(actor), cur = activeOf(actor, s, kind);
  if (!cur) return {ok: true};
  s.perks[cur.key] = (s.perks[cur.key] ?? []).filter(id => id !== itemId);
  if (!s.perks[cur.key].length) delete s.perks[cur.key];
  await save(actor, s);
  return {ok: true};
}

/**
 * Something dropped on a box (not on a socket): an Actor is linked as the pet or mount; an Item goes where its role says
 * (a perk to the perk list, gear to the first free socket). Items marked for the other kind of companion are refused.
 */
export async function dropOnBox(actor, kind, doc) {
  const blocked = cannotChange(actor); if (blocked) return blocked;
  if (!KINDS.includes(kind)) return KIND_REFUSAL(kind);
  if (doc?.documentName === 'Actor') return addActorCompanion(actor, doc, kind);
  if (!doc || doc.documentName !== 'Item') return refuse('Drop an Actor or an item here.');
  const route = routeForRole(doc, kind); if (!route.ok) return route;
  return route.list === 'perk' ? attachDroppedPerk(actor, kind, doc) : socketDroppedGear(actor, kind, null, doc);
}

// ---------- Migration ----------

/**
 * Builds companionSlots from the old companions list when the character has none yet. Safe to run any number of times:
 * it does nothing once the new flag exists, and never touches the old flag. System action (no player permissions).
 */
export async function migrateCompanionSlots(actor) {
  if (!actor || isBackup(actor)) return {ok: true, migrated: false};
  const flags = actor.flags?.[MODULE_ID];
  if (cleanSlots(flags?.[FLAG])) return {ok: true, migrated: false};
  if (!Array.isArray(flags?.[LEGACY_FLAG]) || !flags[LEGACY_FLAG].length) return {ok: true, migrated: false};
  const built = slotsFromLegacy(actor);
  await actor.update({[`flags.${MODULE_ID}.==${FLAG}`]: built});
  return {ok: true, migrated: true};
}
/** GM only, once the world is ready: migrates every character that still has only the old list. */
export async function migrateAllCompanionSlots(actors = globalThis.game?.actors) {
  if (!globalThis.game?.user?.isGM) return {ok: false, migrated: 0};
  let migrated = 0;
  for (const a of actors ?? []) {
    if (a.type !== 'character') continue;
    try { if ((await migrateCompanionSlots(a)).migrated) migrated++; } catch (err) { console.warn('Ashen Gate | Character Hub: companions migration skipped for one character', err); }
  }
  return {ok: true, migrated};
}

/** Registers the two retired world settings, hidden: their saved values stay in the world, nothing reads them. */
export function registerCompanionSettings(settings = globalThis.game?.settings) {
  settings?.register?.(MODULE_ID, 'petCap', {name: 'Character Hub: pets per character (no longer used)', hint: 'No longer used. Characters may link any number of pets with one active.', scope: 'world', config: false, type: Number, default: DEFAULT_PET_CAP});
  settings?.register?.(MODULE_ID, 'petCapOverrides', {scope: 'world', config: false, type: Object, default: {}});
}
