/**
 * Test players (ag-test-players/1). General Manager owns one world setting, `ashen-gate-manager.testPlayers`: an array of
 * User ids. Every Ashen Gate module reads that key (through its own copy of ag-test-players.mjs, never through Manager's
 * code) and treats a listed non-GM user as if its Player Access setting were ON. Real players keep following each module's
 * own setting. Nothing here grants GM power or changes Document permissions.
 *
 * Only the GM changes it: setTestPlayers and saveGmSetup throw for anyone else, and guardTestPlayersWrite refuses a write
 * made by a non-GM before it is sent (Foundry's server also keeps world settings GM-only by default).
 */
import { TEST_PLAYERS_CONTRACT, TEST_PLAYERS_SETTING, TEST_PLAYERS_MODULE } from './ag-test-players.mjs';

export { TEST_PLAYERS_CONTRACT, TEST_PLAYERS_SETTING };
export const TEST_PLAYERS_HINT = 'These users see every Ashen Gate module as if Player Access were on. Other players follow each module\'s own setting. Item and journal permissions still follow normal player rules.';

const usersOf = users => [...(users?.contents ?? users?.values?.() ?? users ?? [])];

/** The world's non-GM users, by name. */
export const nonGmUsers = users => usersOf(users).filter(u => u?.id && u.isGM !== true)
  .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));

/** A list of ids reduced to unique ids of existing non-GM users (anything else is dropped). Malformed input gives []. */
export function cleanTestPlayerIds(value, users) {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(nonGmUsers(users).map(u => u.id));
  return [...new Set(value.filter(id => typeof id === 'string' && allowed.has(id)))];
}

/** Rows for the GM Setup checklist: every non-GM user, ticked when listed. `selected` (a draft) wins over the saved list. */
export function testPlayerRows(users, saved, selected = null) {
  const on = new Set(Array.isArray(selected) ? selected : Array.isArray(saved) ? saved : []);
  return nonGmUsers(users).map(u => ({ id: u.id, name: String(u.name ?? u.id), checked: on.has(u.id) }));
}

/** The saved ids, read defensively (the setting may be missing or malformed). */
export function readTestPlayers(game, moduleId = TEST_PLAYERS_MODULE) {
  try { const v = game.settings.get(moduleId, TEST_PLAYERS_SETTING); return Array.isArray(v) ? v.filter(id => typeof id === 'string') : []; } catch { return []; }
}

/** Registers the world setting: config:false (not in the Game Settings screen), default []. */
export function registerTestPlayersSetting(game, moduleId = TEST_PLAYERS_MODULE, { onChange = null } = {}) {
  game.settings.register(moduleId, TEST_PLAYERS_SETTING, {
    name: 'Test players', hint: TEST_PLAYERS_HINT, scope: 'world', config: false, type: Array, default: [],
    ...(onChange ? { onChange } : {})
  });
}

/** GM only. Saves the list (cleaned to existing non-GM users) when it changed. Returns the saved ids. */
export async function setTestPlayers(game, ids, moduleId = TEST_PLAYERS_MODULE) {
  if (!game?.user?.isGM) throw new Error('Only the GM can choose Test players.');
  if (!Array.isArray(ids)) throw new TypeError('Test players must be a list of user ids.');
  const next = cleanTestPlayerIds(ids, game.users).sort();
  const now = [...readTestPlayers(game, moduleId)].sort();
  if (next.join('\n') !== now.join('\n')) await game.settings.set(moduleId, TEST_PLAYERS_SETTING, next);
  return next;
}

/** preCreateSetting / preUpdateSetting: false (refuse) when a non-GM writes the Test players setting. */
export function guardTestPlayersWrite(setting, userId, game, moduleId = TEST_PLAYERS_MODULE) {
  if (setting?.key !== `${moduleId}.${TEST_PLAYERS_SETTING}`) return true;
  return game?.users?.get?.(userId)?.isGM === true;
}

/** The api.testPlayers object (read for anyone, write for the GM). */
export function testPlayersApi(game, moduleId = TEST_PLAYERS_MODULE) {
  return Object.freeze({
    contract: TEST_PLAYERS_CONTRACT,
    key: `${moduleId}.${TEST_PLAYERS_SETTING}`,
    get: () => (game.user?.isGM ? readTestPlayers(game, moduleId) : readTestPlayers(game, moduleId).filter(id => id === game.user?.id)),
    set: ids => setTestPlayers(game, ids, moduleId)
  });
}
