/**
 * Ashen Gate "Test players" helper (contract ag-test-players/1).
 * Every module ships an identical copy of this file; scripts/check.mjs fails if the copies drift apart.
 *
 * General Manager owns one world setting, `ashen-gate-manager.testPlayers`: an array of User ids. A listed non-GM user
 * is treated as if every module's Player Access setting were ON, so the GM can check the player view with one
 * account while real players keep following each module's own setting. This file only READS that key: it never
 * imports Manager code, never writes it, and returns false whenever Manager is missing, disabled, has not
 * registered the setting, or the stored value is malformed. It never throws.
 *
 * It grants no GM power. GM-only actions stay GM-only, and Document ownership checks are unchanged (a test
 * player sees only what a real player with the same permissions would).
 */
export const TEST_PLAYERS_CONTRACT='ag-test-players/1';
export const TEST_PLAYERS_MODULE='ashen-gate-manager';
export const TEST_PLAYERS_SETTING='testPlayers';

/** The listed User ids (strings only), or [] when Manager or its setting is absent or the value is malformed. */
export function testPlayerIds(g=globalThis.game){
  try{
    if(g?.modules?.get?.(TEST_PLAYERS_MODULE)?.active!==true)return [];
    if(g.settings?.settings?.has?.(`${TEST_PLAYERS_MODULE}.${TEST_PLAYERS_SETTING}`)!==true)return [];
    const value=g.settings.get(TEST_PLAYERS_MODULE,TEST_PLAYERS_SETTING);
    return Array.isArray(value)?value.filter(id=>typeof id==='string'&&id):[];
  }catch{return [];}
}

/** true only for a non-GM user (object or id) whose id is listed in Manager's Test players. */
export function isTestPlayer(user,g=globalThis.game){
  try{
    const u=typeof user==='string'?g?.users?.get?.(user):user;
    if(!u||u.isGM===true||typeof u.id!=='string'||!u.id)return false;
    return testPlayerIds(g).includes(u.id);
  }catch{return false;}
}
