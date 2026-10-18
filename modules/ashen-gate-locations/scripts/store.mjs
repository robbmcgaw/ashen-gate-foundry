/**
 * World storage. Two JournalEntries, both created on demand by the GM:
 *  - "Locations (GM Data)": ownership NONE; flag `locations` holds every full record.
 *  - "Locations (Player View)": ownership OBSERVER; one page per location whose `view` flag is the
 *    sanitized playerView() JSON. Unrevealed locations get an empty page with ownership NONE, so a
 *    Map Note pointing at that page is hidden from players by Foundry itself.
 * Players read only the second Journal. Nothing hidden is ever written into it.
 */
import {MODULE_ID, normalizeLocation, playerView, viewHtml} from './model.mjs';

const ROLE_GM = 'gm-data';
const ROLE_VIEW = 'player-view';
const LEGACY_ROLES = ['source', 'projection', 'map_registry'];
const FOLDER_PATH = ['Ashen Gate', 'Locations'];
const NOTE_ICON = 'icons/svg/castle.svg';

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
  const locations = list.map(normalizeLocation).filter(l => l.id);
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

/** The page data Foundry should hold for one location. Exported for tests. */
export function pageData(loc, all) {
  const view = playerView(loc, all);
  return {
    name: view?.name ?? 'Unrevealed location', type: 'text',
    text: {content: viewHtml(view), format: htmlFormat()},
    ownership: {default: view ? levels().INHERIT : levels().NONE},
    // A JSON string, not an object: Foundry merges object flags on update, which could keep a
    // field the GM just hid. A string is always replaced whole.
    flags: {[MODULE_ID]: {locationId: loc.id, view: view ? JSON.stringify(view) : ''}}
  };
}

export async function syncPlayerView(locations) {
  assertGM();
  const journal = await viewJournal();
  const pages = new Map([...journal.pages].map(p => [p.getFlag(MODULE_ID, 'locationId'), p]));
  const create = [], update = [];
  for (const loc of locations) {
    const data = pageData(loc, locations);
    const page = pages.get(loc.id);
    pages.delete(loc.id);
    if (!page) { create.push(data); continue; }
    const same = page.name === data.name && page.getFlag(MODULE_ID, 'view') === data.flags[MODULE_ID].view
      && page.ownership?.default === data.ownership.default;
    if (!same) update.push({_id: page.id, ...data});
  }
  const remove = [...pages.values()].map(p => p.id);
  if (create.length) await journal.createEmbeddedDocuments('JournalEntryPage', create);
  if (update.length) await journal.updateEmbeddedDocuments('JournalEntryPage', update);
  if (remove.length) await journal.deleteEmbeddedDocuments('JournalEntryPage', remove);
}

/** Map Note labels show the name only while the location is revealed. */
async function syncNotes(locations) {
  const names = new Map(locations.map(l => [l.id, l.revealed ? l.name : '']));
  for (const scene of game.scenes ?? []) {
    const updates = [];
    for (const note of scene.notes ?? []) {
      const id = note.getFlag?.(MODULE_ID, 'locationId');
      if (id && names.has(id) && note.text !== names.get(id)) updates.push({_id: note.id, text: names.get(id)});
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

/** Places a Map Note for a location on a scene. The note opens the location (see main.mjs). */
export async function placeNote(location, {scene, x, y}) {
  assertGM();
  if (!scene) throw new Error('Open a scene first.');
  await syncPlayerView(readAll());
  const journal = byRole(ROLE_VIEW);
  const page = [...journal.pages].find(p => p.getFlag(MODULE_ID, 'locationId') === location.id);
  const [note] = await scene.createEmbeddedDocuments('Note', [{
    entryId: journal.id, pageId: page?.id ?? null, x: Math.round(x), y: Math.round(y),
    text: location.revealed ? location.name : '', texture: {src: NOTE_ICON}, iconSize: 48,
    flags: {[MODULE_ID]: {locationId: location.id}}
  }]);
  return note;
}

/** 0.8.x kept test-only data in differently-flagged Journals. Leave it alone; just say so once. */
export function legacyJournalCount() {
  return [...game.journal].filter(j => LEGACY_ROLES.includes(j.getFlag(MODULE_ID, 'role'))).length;
}
