/**
 * Where Quest Log files its world documents (docs/folder-convention.md). Journals already live under
 * "Ashen Gate / Quests / <kind>"; this adds the race-safe folder lookup for them, and files the GM-only copies of
 * rewards dropped from an Actor (Items) under "Ashen Gate / Backups / Quest Rewards". Found by Quest Log's own flags.
 */
import {MOD} from './core.mjs';
import {folderOrNull, folderIdOrNull, nestDocuments, isMigrationGM, backupsPath} from './ag-folders.mjs';

export const QUESTS_PATH = ['Ashen Gate', 'Quests'], HOLDING_PATH = backupsPath('Quest Rewards');
export const LEGACY_HOLDING_NAME = 'Ashen Gate Rewards (Quest Log)';
export const SETTING = 'folderNesting', DONE = '1';

/** The Journal folder for one Quest Log kind (Quest Log, Character Notes, GM Source, Archives, Assignments, Game Journal). */
export const questFolderId = segment => folderIdOrNull('JournalEntry', [...QUESTS_PATH, segment]);
export const holdingFolder = () => folderOrNull('Item', HOLDING_PATH);
export const planHolding = doc => doc?.flags?.[MOD]?.holding ? HOLDING_PATH : null;

/** GM, once per world: files held reward copies from the old top-level folder. Re-runnable; leaves anything the GM moved. */
export async function migrateFolders({game = globalThis.game, Item = globalThis.Item} = {}) {
  if (!isMigrationGM({game})) return null;
  if (game.settings.get(MOD, SETTING) === DONE) return null;
  const old = [...(game.folders?.values?.() ?? game.folders ?? [])].filter(f => f.type === 'Item' && f.name === LEGACY_HOLDING_NAME && !(f.folder?.id ?? f.folder) && (f.flags?.[MOD]?.store ?? f.getFlag?.(MOD, 'store')) === 'reward-holding');
  const items = await nestDocuments({type: 'Item', docs: game.items, plan: planHolding, env: {game}, legacyIds: new Set(old.map(f => f.id)),
    update: rows => (Item.implementation ?? Item).updateDocuments(rows)});
  await game.settings.set(MOD, SETTING, DONE);
  return {items};
}
