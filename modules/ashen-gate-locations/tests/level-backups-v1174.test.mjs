/** 1.17.4: the Character Hub level-up backup helper (flags['ashen-gate-character-hub'].levelBackup). 0.20.0: the night-watch
 *  checks that used it went with journeys; the helper stays exported for partners. Logic only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {isLevelBackup} from '../scripts/model.mjs';

const ava = {id: 'a1', name: '[TEST] Ava', type: 'character', flags: {}};
const backup = {id: 'b1', name: '[TEST] Ava - level 3', type: 'character', flags: {'ashen-gate-character-hub': {levelBackup: {level: 3, sourceId: 'a1'}}}};

test('isLevelBackup: only a truthy Character Hub levelBackup flag; safe when absent', () => {
  assert.equal(isLevelBackup(backup), true);
  assert.equal(isLevelBackup(ava), false);
  assert.equal(isLevelBackup({type: 'character'}), false);
  assert.equal(isLevelBackup({flags: {'ashen-gate-character-hub': {levelBackup: null}}}), false);
  assert.equal(isLevelBackup(null), false);
  assert.equal(isLevelBackup(undefined), false);
});
