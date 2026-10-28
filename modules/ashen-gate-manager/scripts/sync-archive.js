/**
 * Sync from package (0.75.0): "Also archive records that are no longer in the package". The SAFE alternative to "Also delete records not in
 * these files". Pure logic plus the writes, with the Foundry calls injected, so the Node suite covers it.
 *
 *  - Archive is Manager's own reversible archive (Library → Archive): the document moves to an "Ashen Gate — Archive <type>" folder and
 *    carries flags.<module>.lifecycle = {archived: true, ...}. Sync adds `archivedBy: 'sync'` and hides the document from players
 *    (default ownership None, remembered in `previousOwnershipDefault`). Nothing is deleted and no id is retired.
 *  - A document that Sync archived comes back by itself when a later Sync includes its record again (for example the reserve pack is
 *    ticked): folder and default ownership are put back. A document someone archived by hand in Library is never restored by Sync.
 *  - Locations and Quest Log records belong to those modules. Manager only asks them, through feature-detected methods:
 *      locationsApi.archiveLocations(ids, {source, reason}) → {archived: string[], skipped: [{id, reason}], alreadyArchived?: string[]}
 *      locationsApi.restoreLocations(ids, {source})        → {restored: string[], skipped: [{id, reason}]}
 *      questApi.archiveQuests(ids, {source, reason})       → {archived: string[], skipped: [{id, reason}], alreadyArchived?: string[]}
 *      questApi.restoreQuests(ids, {source})               → {restored: string[], skipped: [{id, reason}]}
 *    Both methods of a pair must exist, or Manager treats the module as "needs an update" and archives nothing there.
 */
import {MODULE_ID, MANAGED_TYPES} from './core.js';
import {BASELINE_FLAG, LEVEL} from './release.js';

export const ARCHIVE_LABEL = 'Also archive records that are no longer in the package';
export const ARCHIVED_BY = 'sync';
export const PARTNER_SOURCE = 'ashen-gate-manager';
const FOLDER_WORD = {Item: 'Items', JournalEntry: 'Journals', Actor: 'Actors', RollTable: 'Roll Tables', Macro: 'Macros'};
export const archiveFolderName = documentName => `Ashen Gate — Archive ${FOLDER_WORD[documentName] ?? documentName}`;

/** The one explanation the preview, the switch and the dialogs share. */
export const ARCHIVE_EXPLAIN = 'Archive keeps everything: the record moves to an "Ashen Gate — Archive" folder and is hidden from players, its permanent id stays live, and it is restored automatically when a later Sync includes it again (for example when the reserve pack is ticked). Delete is different: it removes the document and retires its id for good.';

/** Partner-owned record kinds Sync can ask to archive. */
export const PARTNERS = Object.freeze({
  Location: {label: 'Locations', moduleId: 'ashen-gate-locations', archive: 'archiveLocations', restore: 'restoreLocations'},
  Quest: {label: 'Quest Log', moduleId: 'ashen-gate-quest-manager', archive: 'archiveQuests', restore: 'restoreQuests'}
});
export const isPartnerKind = kind => Object.prototype.hasOwnProperty.call(PARTNERS, kind);

/** The module's API when it can archive AND restore (feature-detected, never by version number); otherwise null. */
export function partnerArchiveApi(game, kind) {
  const spec = PARTNERS[kind];
  if (!spec) return null;
  const mod = game?.modules?.get?.(spec.moduleId);
  const api = mod?.active ? mod.api : null;
  return api && typeof api[spec.archive] === 'function' && typeof api[spec.restore] === 'function' ? api : null;
}

// ---------- what counts as a dependency ----------
/** Ids a record or flag requires: plain ids, typed refs with a hard mode, and {id, optional: false}. Optional references never block. */
export function hardTargets(refs) {
  const out = [];
  for (const r of Array.isArray(refs) ? refs : []) {
    if (typeof r === 'string') out.push(r);
    else if (r && typeof r === 'object') {
      if (typeof r.target_id === 'string') { if (['hard_requirement', 'required'].includes(r.mode)) out.push(r.target_id); }
      else if (typeof r.id === 'string' && r.optional !== true) out.push(r.id);
    }
  }
  return out;
}
/**
 * Every id something still needs: the hard references of the records in the chosen packs, and (transitively) of the world documents those
 * records need. Map id → [names of what needs it].
 */
export function referenceMap(set, docs) {
  const by = new Map();
  const add = (target, from) => { if (!by.has(target)) by.set(target, new Set()); by.get(target).add(from); };
  for (const {record} of set.records.values()) for (const t of hardTargets(record.refs)) if (t !== record.id) add(t, record.name ?? record.foundry?.data?.name ?? record.id);
  const world = new Map();
  for (const s of docs) if (s.flag?.sourceId && !set.allIds.has(s.flag.sourceId) && !world.has(s.flag.sourceId)) world.set(s.flag.sourceId, s);
  const queue = [...by.keys()], seen = new Set(queue);
  while (queue.length) {
    const s = world.get(queue.pop());
    if (!s) continue;
    for (const t of hardTargets(s.flag.refs)) { add(t, s.name ?? s.flag.sourceId); if (!seen.has(t)) { seen.add(t); queue.push(t); } }
  }
  return new Map([...by].map(([id, names]) => [id, [...names]]));
}

/** Why a managed world document must stay where it is instead of being archived; null when it may be archived. */
export function archiveBlock(snap) {
  if (snap.documentName === 'Actor') {
    if (snap.type === 'character') return 'a character sheet: never touched';
    if (snap.playerOwned) return 'owned by a player';
    if (snap.onScene) return 'has tokens on a scene: remove the tokens first';
  }
  if (snap.keep) return 'marked Keep here';
  if (snap.inProtectedFolder) return 'in a protected folder';
  if (snap.onHotbar) return 'on a hotbar';
  return null;
}

// ---------- the writes ----------
const lifecycleOf = doc => doc.getFlag?.(MODULE_ID, 'lifecycle') ?? null;

function assertManaged(doc, user, id) {
  if (!user?.isGM) throw new Error('Only a GM can archive or restore records from Sync.');
  if (!doc || !MANAGED_TYPES.includes(doc.documentName)) throw new Error('Sync only archives Items, Journals, Actors, Roll Tables and Macros.');
  if (doc.parent) throw new Error('Sync never changes a document embedded in a sheet.');
  if (doc.documentName === 'Actor' && doc.type === 'character') throw new Error('Character sheets are never changed by Sync.');
  const flag = doc.getFlag?.(MODULE_ID, 'source');
  if (!flag?.sourceId) throw new Error('Sync only changes documents Manager imported (no Manager source flag on this one).');
  if (id && flag.sourceId !== id) throw new Error(`This document is bound to ${flag.sourceId}, not ${id}.`);
  return flag;
}
/** Throws unless this user may archive this document. `set` (the sync set) and `referenced` (Set of ids) are re-checked here, in the data layer. */
export function assertArchiveTarget(doc, user, id, {set = null, referenced = null} = {}) {
  const flag = assertManaged(doc, user, id);
  if (doc.documentName === 'Actor' && doc.hasPlayerOwner) throw new Error('Sync never archives an Actor a player owns.');
  if (doc.getFlag?.(MODULE_ID, 'keepFolder')) throw new Error('This document is marked Keep here.');
  if (set?.allIds?.has(flag.sourceId)) throw new Error(`${flag.sourceId} is in the chosen packs; Sync does not archive it.`);
  if (referenced?.has(flag.sourceId)) throw new Error(`${flag.sourceId} is still referenced by a record in the chosen packs; Sync does not archive it.`);
  return flag;
}
/** Throws unless this user may restore this document: only one that Sync itself archived. */
export function assertRestoreTarget(doc, user, id) {
  assertManaged(doc, user, id);
  const lc = lifecycleOf(doc);
  if (!lc?.archived || lc.archivedBy !== ARCHIVED_BY) throw new Error('Sync restores only documents that Sync archived.');
}

/** The one update that archives a document (folder, hidden from players, lifecycle flag). */
export function archiveUpdate(doc, folderId, {now = new Date(), levels = LEVEL} = {}) {
  const level = doc.ownership?.default ?? levels.NONE;
  const hide = level > levels.NONE;
  return {
    folder: folderId,
    ...(hide ? {'ownership.default': levels.NONE, [`flags.${MODULE_ID}.${BASELINE_FLAG}`]: levels.NONE} : {}),
    [`flags.${MODULE_ID}.lifecycle`]: {archived: true, archivedBy: ARCHIVED_BY, previousFolderId: doc.folder?.id ?? null, previousOwnershipDefault: hide ? level : null, archivedAt: now.toISOString()}
  };
}
/** The update that puts an archived document back (folder, default ownership, flag). */
export function restoreUpdate(doc, folderId, {levels = LEVEL} = {}) {
  const lc = lifecycleOf(doc) ?? {};
  const back = Number.isFinite(lc.previousOwnershipDefault) && (doc.ownership?.default ?? levels.NONE) === levels.NONE ? lc.previousOwnershipDefault : null;
  return {
    folder: folderId ?? null,
    ...(back !== null ? {'ownership.default': back, [`flags.${MODULE_ID}.${BASELINE_FLAG}`]: back} : {}),
    [`flags.${MODULE_ID}.lifecycle.archived`]: false, [`flags.${MODULE_ID}.lifecycle.archivedBy`]: null, [`flags.${MODULE_ID}.lifecycle.previousOwnershipDefault`]: null
  };
}

/** Archives one document. Idempotent: an already archived document is left as it is. folderFor(documentName) → Folder-like {id}. */
export async function writeArchive(doc, row, {user, folderFor, set = null, referenced = null, now = new Date(), bulk = {}}) {
  assertArchiveTarget(doc, user, row.id, {set, referenced});
  if (lifecycleOf(doc)?.archived) return doc;
  const folder = await folderFor(doc.documentName);
  if (!folder?.id) throw new Error('The archive folder could not be created.');
  await doc.update(archiveUpdate(doc, folder.id, {now}), bulk);
  return doc;
}
/** Restores one document that Sync archived. restoreFolderFor(doc, lifecycle) → folder id. Idempotent. */
export async function writeRestore(doc, row, {user, restoreFolderFor, bulk = {}}) {
  if (doc && !lifecycleOf(doc)?.archived) { assertManaged(doc, user, row.id); return doc; }
  assertRestoreTarget(doc, user, row.id);
  const folderId = await restoreFolderFor(doc, lifecycleOf(doc));
  await doc.update(restoreUpdate(doc, folderId), bulk);
  return doc;
}

// ---------- partner modules (Locations, Quest Log) ----------
/**
 * Asks the owning module to archive or restore ids, and turns its report into log entries. A module that does not answer in the
 * expected shape, or throws, archives nothing: every id is reported with the reason.
 */
export async function applyPartnerArchive(kind, ids, api, mode = 'archive') {
  const spec = PARTNERS[kind];
  if (!ids.length) return [];
  const action = mode === 'restore' ? 'restore' : 'archive';
  if (!spec || !api || typeof api[spec[action]] !== 'function') return ids.map(id => ({id, kind, action, status: 'skipped', message: `Not ${action}d: needs a ${spec?.label ?? 'module'} update.`}));
  let report;
  try { report = await api[spec[action]](ids, {source: PARTNER_SOURCE, ...(action === 'archive' ? {reason: 'sync-not-in-package'} : {})}); }
  catch (error) { return ids.map(id => ({id, kind, action, status: 'error', message: String(error?.message ?? error)})); }
  const done = new Set([...(action === 'archive' ? [...(report?.archived ?? []), ...(report?.alreadyArchived ?? [])] : report?.restored ?? [])]);
  const skipped = new Map((Array.isArray(report?.skipped) ? report.skipped : []).map(s => [s?.id, s?.reason]));
  return ids.map(id => done.has(id) ? {id, kind, action, status: 'ok'}
    : {id, kind, action, status: 'skipped', message: skipped.get(id) ?? `${spec.label} did not ${action} it.`});
}
