/** DEC-0072 — independent module-owned interface gate; does not affect game mechanics. */
import { isTestPlayer } from './ag-test-players.mjs';
export const PLAYER_ACCESS_CONTRACT = 'ag-player-access/1';
export const PLAYER_ACCESS_SETTING = 'playerAccessEnabled';

export function playerAccessAllowed(game, moduleId) {
  return Boolean(game.user?.isGM || game.settings.get(moduleId, PLAYER_ACCESS_SETTING) !== false || isTestPlayer(game.user, game));
}
export function assertPlayerAccess(game, moduleId) {
  if (!playerAccessAllowed(game, moduleId)) throw new Error('The GM has hidden this Ashen Gate player interface.');
}
export function accessState(game, moduleId) {
  return {
    contract: PLAYER_ACCESS_CONTRACT,
    moduleId,
    audience: 'player',
    playerAccessEnabled: game.settings.get(moduleId, PLAYER_ACCESS_SETTING) !== false,
    configurable: true
  };
}
export async function setPlayerAccess(game, moduleId, enabled) {
  if (!game.user?.isGM) throw new Error('Only a GM can change Player Access');
  if (typeof enabled !== 'boolean') throw new TypeError('Player Access requires a Boolean enabled value');
  await game.settings.set(moduleId, PLAYER_ACCESS_SETTING, enabled);
  return accessState(game, moduleId);
}
