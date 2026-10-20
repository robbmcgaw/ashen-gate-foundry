/**
 * World storage. Two JournalEntries, both created on demand by the GM:
 *  - "Locations (GM Data)": ownership NONE; flag `locations` holds every full record.
 *  - "Locations (Player View)": ownership OBSERVER; one page per location whose `view` flag is the
 *    sanitized playerView() JSON. Hidden locations get an empty, generically named page with
 *    ownership NONE, so a Map Note pointing at that page is hidden from players by Foundry itself.
 *    Unidentified locations get a page with only the generic label and teaser.
 * Pages and Map Notes carry only the location's random `pinKey`, never its LOC id (which is made
 * from a name). Players read only the second Journal. Nothing hidden is ever written into it.
 *
 * Party Notes (1.5.0) are campaign state in a third Journal, "Locations (Party Notes)": ownership NONE, flag
 * `notes` holds one record per LOC id. Each visible location's page carries a copy in its `partyNotes` flag
 * (no LOC id); a hidden location's page carries none, so the notes stay private until it is visible again.
 * writeAll, imports and Publish never change the notes themselves.
 *
 * 1.7.0: a fourth Journal, "Locations (Shared Notes)" (role `shared-notes`, players OBSERVER on the entry so they
 * cannot add pages), holds one page per location that is visible to players, keyed by pin key and named
 * generically. Its `shared` flag is the notesMirror() copy (no LOC id, name or GM data). While the location is
 * visible the page gives players OWNER, so they can save without a GM connected; while it is Hidden the page is
 * blanked and set to NONE. Pages are only ever created by a GM, so a location that was never visible has none.
 * The GM store stays the record of truth: syncSharedNotes() (GM: on ready, on every writeAll, and when a player
 * writes a shared page) reconciles both sides with reconcileNotes() and never drops text.
 *
 * 1.8.0: a location's audience ("Everyone" or "Selected players") is enforced with Foundry's own ownership. Its
 * player page and shared-notes page name every player user explicitly: the readers get access, everyone else NONE
 * (explicit, because Foundry merges ownership on update, so a removed player must be set back). Map Notes point at
 * the player page, so Foundry hides a pin from anyone who cannot open that page.
 *
 * 1.10.0 routes: the full records sit in the GM Data Journal's `routes` flag, beside `routeIds` (every RTE id ever
 * issued, so a deleted route's id is never reused). Players read a fifth Journal, "Locations (Routes)" (role
 * `route-view`): one page per version of a route that some player may see (see routes.mjs routeAudiences), named
 * just "Route", carrying only the player-safe view JSON and the route's random view key, and readable only by the
 * players that version is for (every other player explicitly NONE). An undiscovered route has no page at all.
 */
import {MODULE_ID, DEFAULT_UNIDENTIFIED_LABEL, normalizeLocation, playerView, viewHtml, pinPresentation, notePatch, uniquePinKeys, PIN_KEY,
  normalizeNotes, notesMirror, reconcileNotes, inAudience, resolvePassConditions, newPinKey} from './model.mjs';
import {normalizeRoute, routeAudiences, defaultLeg} from './routes.mjs';

const ROLE_GM = 'gm-data';
const ROLE_VIEW = 'player-view';
const ROLE_NOTES = 'party-notes';
const ROLE_SHARED = 'shared-notes';
const ROLE_ROUTE_VIEW = 'route-view';
const LEGACY_ROLES = ['source', 'projection', 'map_registry'];
const FOLDER_PATH = ['Ashen Gate', 'Locations'];

/** World settings that shape what players see on pins and pages. Safe defaults without Foundry settings. */
function setting(key, fallback) {
  try { return game.settings.get(MODULE_ID, key) || fallback; } catch { return fallback; }
}
export const presentationOptions = () => ({label: setting('unidentifiedLabel', DEFAULT_UNIDENTIFIED_LABEL), unknownImg: setting('unknownPinImage', '')});

const levels = () => globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS ?? {INHERIT: -1, NONE: 0, OBSERVER: 2, OWNER: 3};
const htmlFormat = () => globalThis.CONST?.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1;
const byRole = role => [...game.journal].find(j => j.getFlag(MODULE_ID, 'role') === role) ?? null;
/** The world's player (non-GM) users. */
export const players = () => [...(game.users ?? [])].filter(u => u?.id && !u.isGM);
/**
 * Ownership for one of a location's pages: `grant` for every player who may see it now (visible state and in its
 * audience), NONE for every other player, and a default that covers players created later.
 */
export function ownershipFor(loc, visible, grant) {
  const L = levels();
  const own = {default: visible && loc.audience?.mode !== 'selected' ? grant : L.NONE};
  for (const u of players()) own[u.id] = visible && inAudience(loc, u.id) ? grant : L.NONE;
  return own;
}
const sameOwnership = (current, want) => Object.entries(want).every(([k, v]) => current?.[k] === v);
export const isGM = () => game.user?.isGM === true;
export function assertGM() {
  if (!isGM()) throw new Error('Only the GM can do that.');
}

async function ensureFolder() {
  let parent = null;
  for (const name of FOLDER_PATH) {
    let folder = [...(game.folders ?? [])].find(f => f.type === 'JournalEntry' && f.name === name && (f.folder?.id ?? f.folder ?? null) === parent);
    if (!folder) folder = await Folder.create({name, type: 'JournalEntry', folder: parent});
    parent = folder?.id ?? null;
  }
  return parent;
}

/** All locations, full GM data, sorted by name. */
export function readAll() {
  assertGM();
  const raw = byRole(ROLE_GM)?.getFlag(MODULE_ID, 'locations');
  return (Array.isArray(raw) ? raw : []).map(normalizeLocation).filter(l => l.id)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Replaces the stored list, then rebuilds the player view and Map Note labels. */
export async function writeAll(list) {
  assertGM();
  const locations = uniquePinKeys(list.map(normalizeLocation).filter(l => l.id));
  const doc = byRole(ROLE_GM);
  // Skip the write when the stored records already match (Factions 0.8.1 / Quest Manager 0.7.1 did the same).
  if (doc) { if (JSON.stringify(doc.getFlag(MODULE_ID, 'locations')) !== JSON.stringify(locations)) await doc.update({[`flags.${MODULE_ID}.locations`]: locations}); }
  else await JournalEntry.create({name: 'Locations (GM Data)', folder: await ensureFolder(),
    ownership: {default: levels().NONE}, flags: {[MODULE_ID]: {role: ROLE_GM, locations}}});
  await syncPlayerView(locations);
  await syncNotes(locations);
  await syncSharedNotes(locations);
  // Endpoint visibility decides who sees a route, so route pages follow every location change.
  await syncRouteViews(readRoutes(), locations);
  return locations;
}

// ---------- 1.10.0 routes ----------
/** The world's default leg length in km (GM Setup). */
export const defaultLegKm = () => defaultLeg(setting('defaultLegKm', null));
/** GM: every route, full data, in stored order. */
export function readRoutes() {
  assertGM();
  const raw = byRole(ROLE_GM)?.getFlag(MODULE_ID, 'routes');
  return (Array.isArray(raw) ? raw : []).map(normalizeRoute).filter(r => r.id);
}
/** GM: every RTE id ever issued in this world (current and deleted). */
export function usedRouteIds() {
  assertGM();
  const raw = byRole(ROLE_GM)?.getFlag(MODULE_ID, 'routeIds');
  return [...new Set([...(Array.isArray(raw) ? raw.filter(id => typeof id === 'string') : []), ...readRoutes().map(r => r.id)])];
}
/** GM: replaces the stored routes (remembering their ids for good), then rebuilds the players' route pages. */
export async function writeRoutes(list, {locations = null} = {}) {
  assertGM();
  const routes = list.map(normalizeRoute).filter(r => r.id);
  const keys = new Set();
  for (const r of routes) { while (keys.has(r.viewKey)) r.viewKey = newPinKey(); keys.add(r.viewKey); }
  const routeIds = [...new Set([...usedRouteIds(), ...routes.map(r => r.id)])];
  const doc = byRole(ROLE_GM);
  if (doc) {
    if (JSON.stringify(doc.getFlag(MODULE_ID, 'routes')) !== JSON.stringify(routes) || JSON.stringify(doc.getFlag(MODULE_ID, 'routeIds')) !== JSON.stringify(routeIds))
      await doc.update({[`flags.${MODULE_ID}.routes`]: routes, [`flags.${MODULE_ID}.routeIds`]: routeIds});
  } else await JournalEntry.create({name: 'Locations (GM Data)', folder: await ensureFolder(),
    ownership: {default: levels().NONE}, flags: {[MODULE_ID]: {role: ROLE_GM, locations: [], routes, routeIds}}});
  await syncRouteViews(routes, locations ?? readAll());
  return routes;
}
/** The page one version of a route needs: readable by exactly `userIds`, nothing on it but the safe view. */
function routePageData(route, group) {
  const L = levels();
  const own = {default: L.NONE};
  for (const u of players()) own[u.id] = group.userIds.includes(u.id) ? L.OBSERVER : L.NONE;
  return {name: 'Route', type: 'text', text: {content: '', format: htmlFormat()}, ownership: own,
    flags: {[MODULE_ID]: {routeKey: route.viewKey, variant: group.variant, view: JSON.stringify(group.view)}}};
}
const routePageId = p => `${p.getFlag(MODULE_ID, 'routeKey')}:${p.getFlag(MODULE_ID, 'variant')}`;
/** GM: makes the route pages match the routes and locations. Writes nothing when they already match. */
export async function syncRouteViews(routes = readRoutes(), locations = readAll()) {
  assertGM();
  const byId = new Map(locations.map(l => { const n = normalizeLocation(l); return [n.id, n]; }));
  const ids = players().map(u => u.id);
  const opts = {label: presentationOptions().label, defaultLegKm: defaultLegKm()};
  const want = new Map();
  for (const r of routes) for (const g of routeAudiences(r, byId, ids, opts)) want.set(`${r.viewKey}:${g.variant}`, routePageData(r, g));
  let journal = byRole(ROLE_ROUTE_VIEW);
  if (!journal && !want.size) return;
  journal ??= await JournalEntry.create({name: 'Locations (Routes)', folder: await ensureFolder(),
    ownership: {default: levels().OBSERVER}, flags: {[MODULE_ID]: {role: ROLE_ROUTE_VIEW}}});
  const have = new Map();
  const remove = [];
  for (const p of journal.pages) { const k = routePageId(p); if (want.has(k) && !have.has(k)) have.set(k, p); else remove.push(p.id); }
  const create = [], update = [];
  for (const [k, data] of want) {
    const page = have.get(k);
    if (!page) create.push(data);
    else if (page.getFlag(MODULE_ID, 'view') !== data.flags[MODULE_ID].view || !sameOwnership(page.ownership, data.ownership)) update.push({_id: page.id, ownership: data.ownership, [`flags.${MODULE_ID}.view`]: data.flags[MODULE_ID].view});
  }
  if (create.length) await journal.createEmbeddedDocuments('JournalEntryPage', create);
  if (update.length) await journal.updateEmbeddedDocuments('JournalEntryPage', update);
  if (remove.length) await journal.deleteEmbeddedDocuments('JournalEntryPage', remove);
}
/** Any user: the route views this user may read (Foundry's own page permission decides). */
export function readRouteViews() {
  const journal = byRole(ROLE_ROUTE_VIEW);
  if (!journal) return [];
  return [...journal.pages].filter(p => isGM() || p.testUserPermission(game.user, 'OBSERVER'))
    .map(p => { try { return JSON.parse(p.getFlag(MODULE_ID, 'view') || 'null'); } catch { return null; } })
    .filter(Boolean);
}

async function viewJournal() {
  const existing = byRole(ROLE_VIEW);
  if (existing) return existing;
  return JournalEntry.create({name: 'Locations (Player View)', folder: await ensureFolder(),
    ownership: {default: levels().OBSERVER}, flags: {[MODULE_ID]: {role: ROLE_VIEW}}});
}

/** The page data Foundry should hold for one location. Exported for tests. `notes`: its Party Notes record, if any. */
export function pageData(loc, all, opts = presentationOptions(), notes = null) {
  const view = playerView(loc, all, opts);
  return {
    name: view?.name ?? 'Unrevealed location', type: 'text',
    text: {content: viewHtml(view), format: htmlFormat()},
    ownership: ownershipFor(loc, !!view, levels().INHERIT),
    // A JSON string, not an object: Foundry merges object flags on update, which could keep a
    // field the GM just hid. A string is always replaced whole.
    flags: {[MODULE_ID]: {pinKey: loc.pinKey, view: view ? JSON.stringify(view) : '', partyNotes: view ? notesFlag(notes) : ''}}
  };
}
const notesFlag = rec => rec ? JSON.stringify(notesMirror(rec)) : '';

/** 1.2.x pages and notes carried `locationId`; map them to the location's pinKey. */
const legacyKey = (doc, keyById) => keyById.get(doc.getFlag?.(MODULE_ID, 'locationId'));
const bindingKey = (doc, keyById) => {
  const key = doc.getFlag?.(MODULE_ID, 'pinKey');
  return PIN_KEY.test(key ?? '') ? key : legacyKey(doc, keyById);
};

export async function syncPlayerView(locations, opts = presentationOptions()) {
  assertGM();
  const journal = await viewJournal();
  const keyById = new Map(locations.map(l => [l.id, l.pinKey]));
  const notes = readNotesStore();
  const pages = new Map();
  for (const p of journal.pages) { const key = bindingKey(p, keyById); if (key && !pages.has(key)) pages.set(key, p); }
  const create = [], update = [], used = new Set();
  const normalized = locations.map(normalizeLocation);
  for (const loc of locations) {
    const data = pageData(loc, locations, {...opts, normalized}, notes.get(loc.id));
    const page = pages.get(loc.pinKey);
    if (!page) { create.push(data); continue; }
    used.add(page.id);
    const legacy = page.getFlag(MODULE_ID, 'locationId') != null;
    if (legacy) data.flags[MODULE_ID].locationId = null;
    const same = !legacy && page.name === data.name && page.getFlag(MODULE_ID, 'view') === data.flags[MODULE_ID].view
      && page.getFlag(MODULE_ID, 'pinKey') === loc.pinKey && sameOwnership(page.ownership, data.ownership)
      && (page.getFlag(MODULE_ID, 'partyNotes') ?? '') === data.flags[MODULE_ID].partyNotes;
    if (!same) update.push({_id: page.id, ...data});
  }
  // Pages of deleted locations, and any stray duplicate, so no stale player content survives.
  const remove = [...journal.pages].filter(p => !used.has(p.id)).map(p => p.id);
  if (create.length) await journal.createEmbeddedDocuments('JournalEntryPage', create);
  if (update.length) await journal.updateEmbeddedDocuments('JournalEntryPage', update);
  if (remove.length) await journal.deleteEmbeddedDocuments('JournalEntryPage', remove);
}

/**
 * Brings every module-managed Map Note in line with its location's state: label, and image/size
 * unless the GM overrode them on that Note. Notes without our flag are never touched.
 */
async function syncNotes(locations, opts = presentationOptions()) {
  const byKey = new Map(locations.map(l => [l.pinKey, l]));
  const keyById = new Map(locations.map(l => [l.id, l.pinKey]));
  for (const scene of game.scenes ?? []) {
    const updates = [];
    for (const note of scene.notes ?? []) {
      const loc = byKey.get(bindingKey(note, keyById));
      if (!loc) continue;
      const patch = notePatch(note, loc.pinKey, pinPresentation(loc, opts));
      if (patch) updates.push({_id: note.id, ...patch});
    }
    if (updates.length) await scene.updateEmbeddedDocuments('Note', updates);
  }
}

/** Player-safe views of every location this user may observe (revealed ones only). */
export function readViews() {
  const journal = byRole(ROLE_VIEW);
  if (!journal) return [];
  return [...journal.pages]
    .filter(p => isGM() || p.testUserPermission(game.user, 'OBSERVER'))
    .map(p => { try { return JSON.parse(p.getFlag(MODULE_ID, 'view') || 'null'); } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** GM: every Party Notes record, by LOC id. Records of deleted locations are kept (a re-import brings them back). */
export function readNotesStore() {
  assertGM();
  const raw = byRole(ROLE_NOTES)?.getFlag(MODULE_ID, 'notes');
  return new Map((Array.isArray(raw) ? raw : []).map(r => normalizeNotes(r)).filter(r => r.locationId).map(r => [r.locationId, r]));
}
/** GM: one location's notes (an empty record if none were written yet). */
export const readNotes = locationId => readNotesStore().get(locationId) ?? normalizeNotes({}, locationId);

/** GM: stores one location's notes, then refreshes the copies players read (none while it is hidden). */
export async function writeNotes(loc, record) {
  assertGM();
  const n = normalizeNotes(record, loc.id);
  const rec = {...n, base: n.version}; // written to the shared copy below too, so both sides agree on this version
  const store = readNotesStore();
  store.set(loc.id, rec);
  await writeNotesStore([...store.values()]);
  const page = [...(byRole(ROLE_VIEW)?.pages ?? [])].find(p => p.getFlag(MODULE_ID, 'pinKey') === loc.pinKey);
  const flag = visibleToPlayers(loc) ? notesFlag(rec) : '';
  if (page && (page.getFlag(MODULE_ID, 'partyNotes') ?? '') !== flag)
    await page.parent.updateEmbeddedDocuments('JournalEntryPage', [{_id: page.id, [`flags.${MODULE_ID}.partyNotes`]: flag}]);
  const journal = await ensureSharedJournal();
  const change = sharedPageChange(loc, rec, sharedPage(journal, loc.pinKey));
  if (change?.create) await journal.createEmbeddedDocuments('JournalEntryPage', [change.create]);
  if (change?.update) await journal.updateEmbeddedDocuments('JournalEntryPage', [change.update]);
  return rec;
}

async function writeNotesStore(notes) {
  const doc = byRole(ROLE_NOTES);
  // An array flag is replaced whole on update, so nothing stale is merged back in.
  if (doc) await doc.update({[`flags.${MODULE_ID}.notes`]: notes});
  else await JournalEntry.create({name: 'Locations (Party Notes)', folder: await ensureFolder(),
    ownership: {default: levels().NONE}, flags: {[MODULE_ID]: {role: ROLE_NOTES, notes}}});
}

// ---------- 1.7.0 shared notes ----------
const visibleToPlayers = loc => loc.state !== 'hidden' && !!loc.published;
const sharedPage = (journal, pinKey) => [...(journal?.pages ?? [])].find(p => p.getFlag(MODULE_ID, 'pinKey') === pinKey) ?? null;
/** The record on a shared page, or null when it holds none (never written, or blanked while hidden). */
function sharedRecord(page) {
  const raw = page?.getFlag(MODULE_ID, 'shared');
  if (!raw) return null;
  try { const v = JSON.parse(raw); return v && typeof v === 'object' ? normalizeNotes(v) : null; } catch { return null; }
}
async function ensureSharedJournal() {
  return byRole(ROLE_SHARED) ?? JournalEntry.create({name: 'Locations (Shared Notes)', folder: await ensureFolder(),
    ownership: {default: levels().OBSERVER}, flags: {[MODULE_ID]: {role: ROLE_SHARED}}});
}
/** What the shared page for `loc` should become: {create} | {update} | null when it already matches. */
function sharedPageChange(loc, rec, page) {
  const own = ownershipFor(loc, visibleToPlayers(loc), levels().OWNER);
  const flag = visibleToPlayers(loc) ? JSON.stringify(notesMirror(rec)) : '';
  if (!page) return flag ? {create: {name: 'Party Notes', type: 'text', text: {content: '', format: htmlFormat()},
    ownership: own, flags: {[MODULE_ID]: {pinKey: loc.pinKey, shared: flag}}}} : null;
  if (sameOwnership(page.ownership, own) && (page.getFlag(MODULE_ID, 'shared') ?? '') === flag) return null;
  return {update: {_id: page.id, ownership: own, [`flags.${MODULE_ID}.shared`]: flag}};
}

/**
 * GM: reconciles every location's notes with its shared page, then makes each page match: visible → players
 * OWNER with the current copy; hidden → blank and NONE. The GM store is written first, so text a player saved
 * on a page is kept privately before that page is blanked. Re-runnable: writes nothing when all agree. This is
 * also the 1.7.0 migration (it creates the Journal and copies the existing notes in); it never deletes notes.
 */
export async function syncSharedNotes(locations = readAll(), {now = Date.now()} = {}) {
  assertGM();
  const users = game.users;
  const opts = {now, isActive: id => users?.get?.(id)?.active === true, nameOf: id => users?.get?.(id)?.name ?? ''};
  const store = readNotesStore();
  const existing = byRole(ROLE_SHARED);
  const result = {created: 0, updated: 0, fromPlayers: 0, merged: 0, truncated: 0};
  const creates = [], updates = [];
  let storeChanged = false;
  for (const loc of locations) {
    const page = sharedPage(existing, loc.pinKey);
    const before = store.get(loc.id) ?? normalizeNotes({}, loc.id);
    const {record, outcome, truncated} = reconcileNotes(before, sharedRecord(page), opts);
    if (JSON.stringify(record) !== JSON.stringify(before) && (store.has(loc.id) || outcome !== 'same')) { store.set(loc.id, record); storeChanged = true; }
    if (outcome === 'shared') result.fromPlayers++;
    if (outcome === 'merged') result.merged++;
    if (truncated) { result.truncated++; console.warn(`${MODULE_ID} | Party Notes of ${loc.id}: merged text was over the limit; this end was cut:\n${truncated}`); }
    const change = sharedPageChange(loc, record, page);
    if (change?.create) creates.push(change.create);
    if (change?.update) updates.push(change.update);
  }
  if (storeChanged) await writeNotesStore([...store.values()]);
  const journal = existing ?? (creates.length ? await ensureSharedJournal() : null);
  if (creates.length) await journal.createEmbeddedDocuments('JournalEntryPage', creates);
  if (updates.length) await journal.updateEmbeddedDocuments('JournalEntryPage', updates);
  result.created = creates.length; result.updated = updates.length;
  return result;
}

/** Any user: the shared copy for a pin key this user can see: {record, writable}; null if there is none for them. */
export function readSharedNotes(pinKey) {
  const view = [...(byRole(ROLE_VIEW)?.pages ?? [])].find(p => p.getFlag(MODULE_ID, 'pinKey') === pinKey);
  if (!view || !(isGM() || view.testUserPermission(game.user, 'OBSERVER'))) return null;
  const page = sharedPage(byRole(ROLE_SHARED), pinKey);
  if (!page || !(isGM() || page.testUserPermission(game.user, 'OBSERVER'))) return null;
  return {record: sharedRecord(page), writable: isGM() || page.testUserPermission(game.user, 'OWNER')};
}
/** Player, no GM connected: writes the shared copy. Foundry itself refuses it unless the page gives this user OWNER. */
export async function writeSharedNotes(pinKey, record) {
  const shared = readSharedNotes(pinKey);
  if (!shared?.writable) throw new Error("That location isn't available to you.");
  const page = sharedPage(byRole(ROLE_SHARED), pinKey);
  await page.update({[`flags.${MODULE_ID}.shared`]: JSON.stringify(notesMirror(record))});
}
/** Whether a Journal page belongs to the shared notes (main.mjs reconciles when a player writes one). */
export const isSharedNotesPage = page => page?.parent?.getFlag?.(MODULE_ID, 'role') === ROLE_SHARED;

/** Any user: the notes copy for a page this user may observe, by pin key; null if there is no such page. */
export function readPlayerNotes(pinKey) {
  const page = [...(byRole(ROLE_VIEW)?.pages ?? [])].find(p => p.getFlag(MODULE_ID, 'pinKey') === pinKey);
  if (!page || !(isGM() || page.testUserPermission(game.user, 'OBSERVER'))) return null;
  // The shared copy is newer when players saved without a GM; otherwise both carry the same version.
  const shared = readSharedNotes(pinKey)?.record;
  if (shared) return notesMirror(shared);
  try { return notesMirror(JSON.parse(page.getFlag(MODULE_ID, 'partyNotes') || '{}')); } catch { return notesMirror({}); }
}

/** GM: the scenes holding a Map Note for this location: [{uuid, name, count}]. */
export function pinsOf(loc) {
  const out = [];
  for (const scene of game.scenes ?? []) {
    const count = [...(scene.notes ?? [])].filter(n => { const k = n.getFlag?.(MODULE_ID, 'pinKey'); return k ? k === loc.pinKey : n.getFlag?.(MODULE_ID, 'locationId') === loc.id; }).length;
    if (count) out.push({uuid: scene.uuid ?? `Scene.${scene.id}`, name: scene.name ?? '', count});
  }
  return out;
}

/** Places a Map Note for a location on a scene. The note opens the location (see main.mjs). */
export async function placeNote(location, {scene, x, y}) {
  assertGM();
  if (!scene) throw new Error('Open a scene first.');
  const all = readAll();
  const loc = all.find(l => l.id === location.id) ?? normalizeLocation(location);
  await syncPlayerView(all);
  const journal = byRole(ROLE_VIEW);
  const page = [...journal.pages].find(p => p.getFlag(MODULE_ID, 'pinKey') === loc.pinKey);
  const pres = pinPresentation(loc, presentationOptions());
  const [note] = await scene.createEmbeddedDocuments('Note', [{
    entryId: journal.id, pageId: page?.id ?? null, x: Math.round(x), y: Math.round(y),
    text: pres.text, texture: {src: pres.src}, iconSize: pres.size,
    flags: {[MODULE_ID]: {pinKey: loc.pinKey, pin: {src: pres.src, size: pres.size}}}
  }]);
  return note;
}

/**
 * 1.3.0 migration, re-runnable: gives every stored location a pinKey and a marker state, and
 * replaces the `locationId` flag on player pages and Map Notes with the pinKey. Does nothing (and
 * writes nothing) when everything is already current. Returns what it found.
 * 1.8.0: also settles "Pass conditions to places inside" on older records (resolvePassConditions): Regions that
 * were passing conditions stay on (listed in `inheritance`), everything else is off. Additive and re-runnable.
 */
export async function migrate() {
  assertGM();
  const raw = byRole(ROLE_GM)?.getFlag(MODULE_ID, 'locations');
  const records = Array.isArray(raw) ? raw : [];
  const stale = records.filter(r => !PIN_KEY.test(r?.pinKey ?? '') || !r?.state || r.published === undefined).length;
  const legacyPages = [...(byRole(ROLE_VIEW)?.pages ?? [])].filter(p => p.getFlag(MODULE_ID, 'locationId') != null).length;
  const legacyNotes = [...(game.scenes ?? [])].flatMap(s => [...(s.notes ?? [])]).filter(n => n.getFlag?.(MODULE_ID, 'locationId') != null).length;
  const unsettled = records.filter(r => typeof r?.passConditions !== 'boolean' || (r?.published && typeof r.published.passConditions !== 'boolean')).length;
  let inheritance = [];
  if (stale || legacyPages || legacyNotes || unsettled) {
    const list = readAll();
    inheritance = resolvePassConditions(list).turnedOn;
    await writeAll(list);
  }
  return {records: stale, pages: legacyPages, notes: legacyNotes, unsettled, inheritance};
}

/** 0.8.x kept test-only data in differently-flagged Journals. Leave it alone; just say so once. */
export function legacyJournalCount() {
  return [...game.journal].filter(j => LEGACY_ROLES.includes(j.getFlag(MODULE_ID, 'role'))).length;
}
