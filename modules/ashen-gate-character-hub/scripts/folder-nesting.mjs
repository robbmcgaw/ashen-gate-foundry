/**
 * Where the Hub files its world documents (docs/folder-convention.md): level backup copies (Actors) under "Ashen Gate /
 * Backups", the GM-only Journey journal under Journal "Ashen Gate / Character Hub". Found by the Hub's own flags, never
 * by name. Level backups used to sit in "Ashen Gate / Level backups"; the migration moves them unless the GM filed one elsewhere.
 */
import {MODULE_ID} from './constants.mjs';
import {folderOrNull, folderIdOrNull, findFolderPath, nestDocuments, isMigrationGM, areaPath, backupsPath} from './ag-folders.mjs';

export const BACKUPS_PATH = backupsPath(), LEGACY_BACKUP_PATH = ['Ashen Gate', 'Level backups'], JOURNEY_PATH = areaPath('Character Hub');
export const SETTING = 'folderNesting', DONE = '1';

export const backupsFolder = () => folderOrNull('Actor', BACKUPS_PATH);
export const journeyFolderId = () => folderIdOrNull('JournalEntry', JOURNEY_PATH);

export const planActor = doc => doc?.flags?.[MODULE_ID]?.levelBackup ? BACKUPS_PATH : null;
export const planJournal = doc => doc?.flags?.[MODULE_ID]?.journeyStore === true ? JOURNEY_PATH : null;

/** GM, once per world: files the Hub's own backups and Journey journal. Re-runnable; leaves anything the GM moved. */
export async function migrateFolders({game = globalThis.game, JournalEntry = globalThis.JournalEntry, Actor = globalThis.Actor} = {}) {
  if (!isMigrationGM({game})) return null;
  if (game.settings.get(MODULE_ID, SETTING) === DONE) return null;
  const env = {game};
  const old = findFolderPath('Actor', LEGACY_BACKUP_PATH, env);
  const actors = await nestDocuments({type: 'Actor', docs: game.actors, plan: planActor, env, legacyIds: new Set(old ? [old.id] : []),
    update: rows => (Actor.implementation ?? Actor).updateDocuments(rows)});
  const journals = await nestDocuments({type: 'JournalEntry', docs: game.journal, plan: planJournal, env,
    update: rows => (JournalEntry.implementation ?? JournalEntry).updateDocuments(rows)});
  await game.settings.set(MODULE_ID, SETTING, DONE);
  return {actors, journals};
}
