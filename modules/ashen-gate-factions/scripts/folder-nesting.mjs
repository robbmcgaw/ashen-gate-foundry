/**
 * Where Renown files its world documents (docs/folder-convention.md). Journals: "Ashen Gate / Factions Data" for
 * definitions, state and the per-player views; "Ashen Gate / Backups" for import snapshots. Items: held reward copies in
 * "Ashen Gate / Backups / Renown Rewards". Renown's own flags say what is its document; names are never used.
 */
import {MODULE_ID} from './core.mjs';
import {folderOrNull, folderIdOrNull, nestDocuments, isMigrationGM, areaPath, backupsPath} from './ag-folders.mjs';

export const FACTIONS_PATH = areaPath('Factions Data'), BACKUPS_PATH = backupsPath(), HOLDING_PATH = backupsPath('Renown Rewards');
/** The names of the folders earlier versions made at the top of the sidebar. */
export const LEGACY_STORAGE_NAME = 'Ashen Gate — Factions Data', LEGACY_HOLDING_NAME = 'Ashen Gate Rewards (Renown)';
export const SETTING = 'folderNesting', DONE = '1';

export const factionsFolder = () => folderOrNull('JournalEntry', FACTIONS_PATH);
export const backupsFolder = () => folderOrNull('JournalEntry', BACKUPS_PATH);
export const holdingFolder = () => folderOrNull('Item', HOLDING_PATH);

const flagsOf = d => d?.flags?.[MODULE_ID] ?? {};
export const isSnapshot = d => Boolean(flagsOf(d).importSnapshot);
export const isModuleJournal = d => { const f = flagsOf(d); return Boolean(f.faction || f.groupClaims || f.individual || f.playerView || f.folderIndex || f.importSnapshot); };
export const planJournal = d => isSnapshot(d) ? BACKUPS_PATH : isModuleJournal(d) ? FACTIONS_PATH : null;
export const planHolding = d => d?.documentName !== 'Actor' && flagsOf(d).holding ? HOLDING_PATH : null;

/** The folders Renown itself made at the top level under their original name (flagged by Renown). A GM-renamed or moved one is theirs. */
export function legacyFolderIds(folders, type, flagTest, name) {
  return new Set([...(folders?.values?.() ?? folders ?? [])].filter(f => f.type === type && !(f.folder?.id ?? f.folder) && f.name === name && flagTest(f)).map(f => f.id));
}

/** GM, once per world: files Renown's own loose or old-folder documents (Journals and held reward Items). Re-runnable. */
export async function migrateFolders({game = globalThis.game, JournalEntry = globalThis.JournalEntry, Item = globalThis.Item} = {}) {
  if (!isMigrationGM({game})) return null;
  if (game.settings.get(MODULE_ID, SETTING) === DONE) return null;
  const env = {game};
  const flag = (f, k, v) => (f.flags?.[MODULE_ID]?.[k] ?? f.getFlag?.(MODULE_ID, k)) === v;
  const journals = await nestDocuments({type: 'JournalEntry', docs: game.journal, plan: planJournal, update: rows => (JournalEntry.implementation ?? JournalEntry).updateDocuments(rows), env,
    legacyIds: legacyFolderIds(game.folders, 'JournalEntry', f => flag(f, 'storageFolder', true), LEGACY_STORAGE_NAME)});
  const items = await nestDocuments({type: 'Item', docs: game.items, plan: planHolding, update: rows => (Item.implementation ?? Item).updateDocuments(rows), env,
    legacyIds: legacyFolderIds(game.folders, 'Item', f => flag(f, 'store', 'reward-holding'), LEGACY_HOLDING_NAME)});
  await game.settings.set(MODULE_ID, SETTING, DONE);
  return {journals, items};
}
