/**
 * Where Utilities files its world documents (docs/folder-convention.md): the shop journals under Journal "Ashen Gate /
 * Shops", the Party Stash character under Actor "Ashen Gate / Party". Found by Utilities' own flags, never by name.
 */
import {ID} from './core.mjs';
import {folderOrNull, folderIdOrNull, nestDocuments, isMigrationGM, areaPath} from './ag-folders.mjs';

export const SHOPS_PATH = areaPath('Shops'), STASH_PATH = areaPath('Party');
export const SETTING = 'folderNesting', DONE = '1';
const SHOP_STORES = new Set(['shops-gm', 'shops-player']);

/** The folder id new shop journals / the Party Stash go in (null for a non-GM, who never creates them). */
export const shopsFolderId = () => folderIdOrNull('JournalEntry', SHOPS_PATH);
export const stashFolderId = () => folderIdOrNull('Actor', STASH_PATH);

export const planJournal = doc => SHOP_STORES.has(doc?.flags?.[ID]?.store) ? SHOPS_PATH : null;
export const planActor = doc => doc?.flags?.[ID]?.partyStash === true ? STASH_PATH : null;

/** GM, once per world: files Utilities' own loose documents into the folders above. Re-runnable; leaves anything the GM moved. */
export async function migrateFolders({game = globalThis.game, JournalEntry = globalThis.JournalEntry, Actor = globalThis.Actor} = {}) {
  if (!isMigrationGM({game})) return null;
  if (game.settings.get(ID, SETTING) === DONE) return null;
  const env = {game};
  const journals = await nestDocuments({type: 'JournalEntry', docs: game.journal, plan: planJournal, update: rows => JournalEntry.updateDocuments(rows), env});
  const actors = await nestDocuments({type: 'Actor', docs: game.actors, plan: planActor, update: rows => Actor.updateDocuments(rows), env});
  await game.settings.set(ID, SETTING, DONE);
  return {journals, actors};
}
