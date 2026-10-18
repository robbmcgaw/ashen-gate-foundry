/** Folder allocation for Locations-owned world Journals.
 * Intentionally non-migrating: existing Journals and their folders remain untouched.
 * Folder matching is typed (JournalEntry) + exact name + parent id, never by name alone.
 */
export const JOURNAL_FOLDER_PATHS = Object.freeze({
  source: 'Ashen Gate/Locations/Source Records',
  projection: 'Ashen Gate/Locations/Published Journals',
  map_registry: 'Ashen Gate/Locations/Map Registry'
});

export async function ensureLocationJournalFolder(role, {folders = globalThis.game?.folders, FolderClass = globalThis.Folder} = {}) {
  const path = JOURNAL_FOLDER_PATHS[role];
  if (!path) throw new Error(`Unknown Locations Journal folder role: ${role}`);
  if (!folders?.contents || !FolderClass?.create) throw new Error('Foundry Folder API unavailable. No Journal created.');
  let parentId = null;
  for (const name of path.split('/')) {
    const matches = folders.contents.filter(f =>
      f.type === 'JournalEntry' && f.name === name && (f.folder?.id ?? f.folder ?? null) === parentId
    );
    if (matches.length > 1) throw new Error(`Ambiguous Journal folder: ${path}. Resolve duplicate folders first.`);
    let current = matches[0];
    if (!current) {
      current = await FolderClass.create({name, type:'JournalEntry', folder:parentId});
      if (!current?.id) throw new Error(`Could not create Journal folder ${name}. No Journal created.`);
    }
    parentId = current.id;
  }
  return parentId;
}
