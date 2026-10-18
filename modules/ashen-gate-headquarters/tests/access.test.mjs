import test from 'node:test';
import assert from 'node:assert/strict';
import {ACCESS_CONTRACT,accessStatus,canOpenPlayerInterface,requireGMToSetAccess,requireInterfaceAccess} from '../js/access.mjs';
const gm={id:'gm',isGM:true}, player={id:'alice',isGM:false};
test('player access contract is exactly ag-player-access/1 and reveals no data',()=>{
 const state=accessStatus('ashen-gate-headquarters',false);
 assert.deepEqual(state,{contract:ACCESS_CONTRACT,moduleId:'ashen-gate-headquarters',audience:'player',playerAccessEnabled:false,configurable:true});
 assert.equal(ACCESS_CONTRACT,'ag-player-access/1');
});
test('existing player-facing releases default Visible; GM retains access when Hidden',()=>{
 assert.ok(canOpenPlayerInterface(player,true));
 assert.ok(canOpenPlayerInterface(gm,false));
 assert.equal(canOpenPlayerInterface(player,false),false);
 assert.throws(()=>requireInterfaceAccess(player,false),/hidden/);
 assert.equal(requireInterfaceAccess(gm,false),true);
});
test('only GM may change boolean gate state',()=>{
 assert.throws(()=>requireGMToSetAccess(player,true),/Only a GM/);
 assert.throws(()=>requireGMToSetAccess(gm,'true'),/Boolean/);
 assert.throws(()=>requireGMToSetAccess(gm,undefined),/Boolean/);
 assert.equal(requireGMToSetAccess(gm,false),true);
});
