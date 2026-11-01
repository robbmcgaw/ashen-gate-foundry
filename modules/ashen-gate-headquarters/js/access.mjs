/** ag-player-access/1, DEC-0072 — pure access-policy helpers. */
export const ACCESS_CONTRACT='ag-player-access/1';
import {isTestPlayer} from './ag-test-players.mjs';
/** A Test player (ag-test-players/1, set in General Manager) counts as Player Access ON. `g` is the Foundry game (default: the global). */
export function canOpenPlayerInterface(user,enabled,g=globalThis.game){return Boolean(user?.isGM || enabled===true || isTestPlayer(user,g));}
export function requireInterfaceAccess(user,enabled,g=globalThis.game){
 if(!user || !canOpenPlayerInterface(user,enabled,g))throw Error('Headquarters Player Access is hidden by the GM.');
 return true;
}
export function requireGMToSetAccess(user,enabled){
 if(!user?.isGM)throw Error('Only a GM can change Headquarters Player Access.');
 if(typeof enabled!=='boolean')throw TypeError('Player Access must be a Boolean.');
 return true;
}
export function accessStatus(moduleId,enabled){
 return {contract:ACCESS_CONTRACT,moduleId,audience:'player',playerAccessEnabled:enabled===true,configurable:true};
}
