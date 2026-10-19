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
 * Only the GM's client writes either (players ask it over the socket, see party-notes.mjs). writeAll, imports
 * and Publish never change the notes themselves.
 */
import {MODULE_ID, DEFAULT_UNIDENTIFIED_LABEL, normalizeLocation, playerView, viewHtml, pinPresentation, notePatch, uniquePinKeys, PIN_KEY,
  normalizeNotes, notesMirror} from './model.mjs';

const ROLE_GM = 'gm-data';
const ROLE_VIEW = 'player-view';
const ROLE_NOTES = 'party-notes';
const LEGACY_ROLES = ['source', 'projection', 'map_registry'];
const FOLDER_PATH = ['Ashen Gate', 'Locations'];

/** World settings that shape what players see on pins and pages. Safe defaults without Foundry settings. */
function setting(key, fallback) {
  try { return game.settings.get(MODULE_ID, key) || fallback; } catch { return fallback; }
}
export const presentationOptions = () => ({label: setting('unidentifiedLabel', DEFAULT_UNIDENTIFIED_LABEL), unknownImg: setting('unknownPinImage', '')});

const levels = () => globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS ?? {INHERIT: -1, NONE: 0, OBSERVER: 2};
const htmlFormat = () => globalThis.CONST?.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1;
const byRole = role => [...game.journal].find(j => j.getFlag(MODULE_ID, 'role') === role) ?? null;
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
  if (doc) await doc.update({[`flags.${MODULE_ID}.locations`]: locations});
  else await JournalEntry.create({name: 'Locations (GM Data)', folder: await ensureFolder(),
    ownership: {default: levels().NONE}, flags: {[MODULE_ID]: {role: ROLE_GM, locations}}});
  await syncPlayerView(locations);
  await syncNotes(locations);
  return locations;
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
    ownership: {default: view ? levels().INHERIT : levels().NONE},
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
  for (const loc of locations) {
    const data = pageData(loc, locations, opts, notes.get(loc.id));
    const page = pages.get(loc.pinKey);
    if (!page) { create.push(data); continue; }
    used.add(page.id);
    const legacy = page.getFlag(MODULE_ID, 'locationId') != null;
    if (legacy) data.flags[MODULE_ID].locationId = null;
    const same = !legacy && page.name === data.name && page.getFlag(MODULE_ID, 'view') === data.flags[MODULE_ID].view
      && page.getFlag(MODULE_ID, 'pinKey') === loc.pinKey && page.ownership?.default === data.ownership.default
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

/** GM: stores one location's notes, then refreshes the copy on its player page (none while it is hidden). */
export async function writeNotes(loc, record) {
  assertGM();
  const rec = normalizeNotes(record, loc.id);
  const store = readNotesStore();
  store.set(loc.id, rec);
  const notes = [...store.values()];
  const doc = byRole(ROLE_NOTES);
  // An array flag is replaced whole on update, so nothing stale is merged back in.
  if (doc) await doc.update({[`flags.${MODULE_ID}.notes`]: notes});
  else await JournalEntry.create({name: 'Locations (Party Notes)', folder: await ensureFolder(),
    ownership: {default: levels().NONE}, flags: {[MODULE_ID]: {role: ROLE_NOTES, notes}}});
  const page = [...(byRole(ROLE_VIEW)?.pages ?? [])].find(p => p.getFlag(MODULE_ID, 'pinKey') === loc.pinKey);
  const flag = loc.state !== 'hidden' && loc.published ? notesFlag(rec) : '';
  if (page && (page.getFlag(MODULE_ID, 'partyNotes') ?? '') !== flag)
    await page.parent.updateEmbeddedDocuments('JournalEntryPage', [{_id: page.id, [`flags.${MODULE_ID}.partyNotes`]: flag}]);
  return rec;
}

/** Any user: the notes copy on a page this user may observe, by pin key; null if there is no such page. */
export function readPlayerNotes(pinKey) {
  const page = [...(byRole(ROLE_VIEW)?.pages ?? [])].find(p => p.getFlag(MODULE_ID, 'pinKey') === pinKey);
  if (!page || !(isGM() || page.testUserPermission(game.user, 'OBSERVER'))) return null;
  try { return notesMirror(JSON.parse(page.getFlag(MODULE_ID, 'partyNotes') || '{}')); } catch { return notesMirror({}); }
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
 */
export async function migrate() {
  assertGM();
  const raw = byRole(ROLE_GM)?.getFlag(MODULE_ID, 'locations');
  const records = Array.isArray(raw) ? raw : [];
  const stale = records.filter(r => !PIN_KEY.test(r?.pinKey ?? '') || !r?.state || r.published === undefined).length;
  const legacyPages = [...(byRole(ROLE_VIEW)?.pages ?? [])].filter(p => p.getFlag(MODULE_ID, 'locationId') != null).length;
  const legacyNotes = [...(game.scenes ?? [])].flatMap(s => [...(s.notes ?? [])]).filter(n => n.getFlag?.(MODULE_ID, 'locationId') != null).length;
  if (stale || legacyPages || legacyNotes) await writeAll(readAll());
  return {records: stale, pages: legacyPages, notes: legacyNotes};
}

/** 0.8.x kept test-only data in differently-flagged Journals. Leave it alone; just say so once. */
export function legacyJournalCount() {
  return [...game.journal].filter(j => LEGACY_ROLES.includes(j.getFlag(MODULE_ID, 'role'))).length;
}
