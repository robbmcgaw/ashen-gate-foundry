/** DEC-0072 / ag-player-access/1: this release exposes a GM-only editor, NOT a player UI.
 * No toggle or playerAccessEnabled setting is registered: making the editor player-accessible
 * would violate the contract. If a separate player viewer ships later, it gets its own gate.
 */
import {MODULE_ID} from './model.js';
export const PLAYER_ACCESS_CONTRACT = 'ag-player-access/1';
export function gmOnlyPlayerAccess() {
  return Object.freeze({
    contract: PLAYER_ACCESS_CONTRACT,
    getState: () => ({
      contract: PLAYER_ACCESS_CONTRACT,
      moduleId: MODULE_ID,
      audience: 'gm-only',
      playerAccessEnabled: false,
      configurable: false
    })
  });
}
