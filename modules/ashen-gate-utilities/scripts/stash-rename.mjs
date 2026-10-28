/**
 * 0.34.0: the Party Stash character Actor is named "Party" (the feature is still the Party Stash in the UI). Found by its own
 * flag, never by name: a player character called "Party" is not the stash. One GM client renames a stash Actor still named
 * exactly the old default; any other name is the GM's choice and stays.
 */
import {ID, DEFAULT_STASH_NAME, LEGACY_STASH_NAME} from './core.mjs';
import {isMigrationGM} from './ag-folders.mjs';

export const SETTING = 'stashNameMigration', DONE = '1';
export const isStash = a => a?.flags?.[ID]?.partyStash === true || a?.getFlag?.(ID, 'partyStash') === true;

/** GM only, once per world. Re-runnable; renames only (nothing else on the Actor is touched). Returns the Actors it renamed. */
export async function migrateStashName({game = globalThis.game, ui = globalThis.ui} = {}) {
  if (!isMigrationGM({game})) return [];
  if (game.settings.get(ID, SETTING) === DONE) return [];
  const renamed = [];
  for (const a of [...game.actors].filter(x => isStash(x) && x.name === LEGACY_STASH_NAME)) {
    // Read again right before writing: another GM client may have renamed it, or the GM may have, since the list was taken.
    const fresh = game.actors.get?.(a.id) ?? a;
    if (fresh.name !== LEGACY_STASH_NAME) continue;
    await fresh.update({name: DEFAULT_STASH_NAME});
    renamed.push(fresh);
  }
  await game.settings.set(ID, SETTING, DONE);
  if (renamed.length) ui?.notifications?.info(`The Party Stash character is now named "${DEFAULT_STASH_NAME}".`);
  return renamed;
}
