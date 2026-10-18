/** ag-player-access/1, DEC-0072 — pure access-policy helpers. */
export const ACCESS_CONTRACT='ag-player-access/1';
export function canOpenPlayerInterface(user,enabled){return Boolean(user?.isGM || enabled===true);}
export function requireInterfaceAccess(user,enabled){
 if(!user || !canOpenPlayerInterface(user,enabled))throw Error('Headquarters Player Access is hidden by the GM.');
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
