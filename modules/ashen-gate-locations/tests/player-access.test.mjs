import test from 'node:test';
import assert from 'node:assert/strict';
import {gmOnlyPlayerAccess} from '../scripts/player-access.js';

test('DEC-0072 reports Locations as permanently GM-only with no setter',()=>{
 const access=gmOnlyPlayerAccess();
 assert.deepEqual(access.getState(),{
   contract:'ag-player-access/1',moduleId:'ashen-gate-locations',
   audience:'gm-only',playerAccessEnabled:false,configurable:false
 });
 assert.equal(access.setEnabled,undefined);
 assert.equal(Object.isFrozen(access),true);
});

test('public status never includes records, journal text, GM user IDs or player settings',()=>{
 const keys=Object.keys(gmOnlyPlayerAccess().getState()).sort();
 assert.deepEqual(keys,['audience','configurable','contract','moduleId','playerAccessEnabled'].sort());
});
