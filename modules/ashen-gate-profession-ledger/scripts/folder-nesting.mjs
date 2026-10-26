/**
 * Where Profession Ledger files its world documents (docs/folder-convention.md): the GM Data journal under Journal "Ashen Gate / Professions" and the "Profession Refresh" snapshots under "Ashen Gate / Backups".
 * Found by this module's own flags, never by name.
 */
import {folderOrNull, folderIdOrNull, nestDocuments, isMigrationGM, areaPath, backupsPath} from './ag-folders.mjs';

export const MODULE_ID = 'ashen-gate-profession-ledger';
export const JOURNAL_PATH = areaPath('Professions');
export const SETTING = 'folderNesting', DONE = '1';

/** The folder new journals go in (null for a non-GM, who never creates them). */
export const journalFolderId = () => folderIdOrNull('JournalEntry', JOURNAL_PATH);
export const backupsFolderId = () => folderIdOrNull('JournalEntry', backupsPath());

export function planJournal(doc) {
  const flags = doc?.flags?.[MODULE_ID] ?? {};
  if (flags.role === 'refresh-snapshot') return backupsPath();
  if (flags.role === 'gm-data') return JOURNAL_PATH;
  return null;
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
