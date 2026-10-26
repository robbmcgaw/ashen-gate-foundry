/**
 * Ashen Gate shared sidebar-folder convention (docs/folder-convention.md). The same file ships, unchanged, in every
 * module that creates world documents; scripts/check.mjs fails when the copies differ. It has no imports and no
 * dependency on another module: everything it needs comes from Foundry's globals (or the `env` argument in tests).
 *
 *   Ashen Gate                  one top-level folder per document type (Journal, Item, Actor, ...)
 *     <Area>                    a module's own documents (Factions Data, Shops, Cinders, ...)
 *     Backups                   safety copies only (snapshots, level backups, held reward copies); GM-only, sorted last
 *
 * Folders are found by type + name + parent and created only when missing, so any module may be the first to need
 * "Ashen Gate". Creation is serialised through one lock shared by every module in the same browser tab and re-checked
 * afterwards, so two modules asking at once get one folder. Only a GM can create folders; for anyone else the lookups
 * simply return null. Nothing here ever deletes a document or touches ownership.
 */
export const AG_ROOT = 'Ashen Gate';
export const AG_BACKUPS = 'Backups';
/** Manual sort position for folders that belong at the end of their parent (Backups). */
export const AG_SORT_LAST = 900000;

const LOCKS_KEY = '__agFolderLocks';
const locks = () => (globalThis[LOCKS_KEY] ??= new Map());
const values = coll => (coll?.values ? [...coll.values()] : coll?.contents ? [...coll.contents] : [...(coll ?? [])]);
export const folderParentId = folder => { const p = folder?.folder; return (p && typeof p === 'object' ? p.id : p) ?? null; };
const envOf = env => ({
  game: env?.game ?? globalThis.game,
  Folder: env?.Folder ?? globalThis.CONFIG?.Folder?.documentClass ?? globalThis.Folder,
  warn: env?.warn ?? ((...a) => console.warn('[ashen-gate folders]', ...a))
});
const same = (type, name, parentId) => f => f?.type === type && f?.name === name && folderParentId(f) === parentId;
const pickOne = matches => [...matches].sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;

/** The folder at `names` (e.g. ['Ashen Gate', 'Backups']) for a document type, or null. Never creates. */
export function findFolderPath(type, names, env) {
  const {game} = envOf(env);
  let parent = null;
  for (const name of names) {
    parent = pickOne(values(game?.folders).filter(same(type, name, parent?.id ?? null)));
    if (!parent) return null;
  }
  return parent;
}

async function ensureOne(type, name, parentId, e) {
  const key = JSON.stringify([type, parentId, name]);
  const pending = locks().get(key);
  if (pending) return pending;
  const find = () => values(e.game?.folders).filter(same(type, name, parentId));
  const run = (async () => {
    let hit = pickOne(find());
    if (hit) return hit;
    await Promise.resolve();            // let a sibling that started a moment ago finish its create first
    hit = pickOne(find());
    if (hit) return hit;
    const data = {name, type, folder: parentId, sorting: 'a'};
    if (name === AG_BACKUPS) data.sort = AG_SORT_LAST;
    const made = await e.Folder.create(data);
    // Another GM client (or a module that does not use the lock) may have created it at the same moment. Everyone
    // picks the same winner (lowest id); a loser stays as an empty folder, because nothing here deletes anything.
    const all = find();
    if (all.length > 1) {
      const winner = pickOne(all);
      if (made && winner?.id !== made.id) e.warn(`Two "${name}" folders were created at once; using ${winner.id}. The empty extra can be deleted by hand.`);
      return winner;
    }
    return made ?? pickOne(all);
  })();
  locks().set(key, run);
  try { return await run; } finally { locks().delete(key); }
}

/**
 * The folder at `names` for a document type, creating each missing level (GM only; others get a lookup).
 * Reuses a folder that already exists with the same name under the same parent, wherever it came from.
 */
export async function ensureFolderPath(type, names, env) {
  const e = envOf(env);
  if (!e.game?.user?.isGM) return findFolderPath(type, names, env);
  let parent = null;
  for (const name of names) parent = await ensureOne(type, name, parent?.id ?? null, e);
  return parent;
}

/**
 * ensureFolderPath that never throws: a folder problem must not stop a module saving its data. Returns the folder, or
 * null (the document is then created loose and a later migration files it).
 */
export async function folderOrNull(type, names, env) {
  try { return (await ensureFolderPath(type, names, env)) ?? null; }
  catch (error) { envOf(env).warn(`Could not prepare the folder ${names.join(' / ')}:`, error?.message ?? error); return null; }
}
export const folderIdOrNull = async (type, names, env) => (await folderOrNull(type, names, env))?.id ?? null;

/** Path for a module's own area: Ashen Gate / <area> (or deeper, `area` may be a list). */
export const areaPath = area => [AG_ROOT, ...(Array.isArray(area) ? area : [area])];
/** Path for safety copies: Ashen Gate / Backups (/ <sub>). */
export const backupsPath = sub => [AG_ROOT, AG_BACKUPS, ...(sub ? [sub] : [])];

/**
 * Moves a module's own documents that are loose, or still in the module's old default folder, into the folder
 * `plan(doc)` names. A document the GM filed somewhere else is left exactly where it is. Only `folder` is written
 * (never ownership, flags or content) and nothing is deleted. Safe to run again: documents already in place are skipped.
 *
 *   docs        the module's candidate documents (a collection or array)
 *   plan(doc)   the folder path for a document this module owns, or null for one it does not (ownership by its own
 *               flags, never by name alone)
 *   legacyIds   ids of the module's old default folders (a document there counts as "not moved by the GM")
 *   update(rows) writes [{_id, folder}] (e.g. JournalEntry.updateDocuments)
 * Returns {moved, left, inPlace, ids}.
 */
export async function nestDocuments({type, docs, plan, legacyIds = new Set(), update, env}) {
  const e = envOf(env);
  if (!e.game?.user?.isGM) return {moved: 0, left: 0, inPlace: 0, ids: []};
  const targets = new Map(), rows = [];
  let left = 0, inPlace = 0;
  for (const doc of values(docs)) {
    const path = plan(doc);
    if (!path) continue;
    const current = folderParentId({folder: doc.folder});
    if (current !== null && !legacyIds.has(current)) {
      // A folder inside our own target is "in place"; any other folder is the GM's choice.
      const target = findFolderPath(type, path, env);
      if (target && target.id === current) inPlace++; else left++;
      continue;
    }
    const key = JSON.stringify(path);
    if (!targets.has(key)) targets.set(key, await ensureFolderPath(type, path, env));
    const folder = targets.get(key);
    if (!folder) continue;
    if (folder.id === current) { inPlace++; continue; }
    rows.push({_id: doc.id, folder: folder.id});
  }
  if (rows.length) await update(rows);
  return {moved: rows.length, left, inPlace, ids: rows.map(r => r._id)};
}

/** True on the one GM client that should run world migrations (the active GM, or the only client in tests). */
export const isMigrationGM = env => {
  const {game} = envOf(env);
  if (!game?.user?.isGM) return false;
  const active = game.users?.activeGM;
  return active ? active.isSelf === true || active.id === game.user.id : true;
};
