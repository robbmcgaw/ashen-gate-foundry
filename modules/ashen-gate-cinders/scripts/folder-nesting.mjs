/**
 * Where Cinders files its world documents (docs/folder-convention.md): the GM-only records journal under Journal "Ashen Gate / Cinders".
 * Found by this module's own flags, never by name.
 */
import {folderOrNull, folderIdOrNull, nestDocuments, isMigrationGM, areaPath, backupsPath} from './ag-folders.mjs';

export const MODULE_ID = 'ashen-gate-cinders';
export const JOURNAL_PATH = areaPath('Cinders');
export const SETTING = 'folderNesting', DONE = '1';

/** The folder new journals go in (null for a non-GM, who never creates them). */
export const journalFolderId = () => folderIdOrNull('JournalEntry', JOURNAL_PATH);

export function planJournal(doc) {
  return doc?.flags?.[MODULE_ID]?.gmRecords === true ? JOURNAL_PATH : null;
}

/** GM, once per world: files this module's own loose journals into the folders above. Re-runnable; leaves anything the GM moved. */
export async function migrateFolders({game = globalThis.game, JournalEntry = globalThis.JournalEntry} = {}) {
  if (!isMigrationGM({game})) return null;
  if (game.settings.get(MODULE_ID, SETTING) === DONE) return null;
  const journals = await nestDocuments({type: 'JournalEntry', docs: game.journal, plan: planJournal, env: {game},
    update: rows => (JournalEntry.implementation ?? JournalEntry).updateDocuments(rows)});
  await game.settings.set(MODULE_ID, SETTING, DONE);
  return {journals};
}
