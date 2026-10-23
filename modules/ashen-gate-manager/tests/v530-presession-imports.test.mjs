/** 0.53.0 pre-session check, Imports row. Mocked Foundry globals: proves logic, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {runPreSessionCheck} from '../scripts/pre-session-check.js';
import {world, now, by} from './fixtures/pre-session-world.mjs';

test('imports: Blocked/Conflict are not stored, so the row is N-A and reads no setting', async () => {
  const {game} = world();
  const read = [];
  game.settings.get = (ns, key) => { read.push(`${ns}.${key}`); return null; };
  const rows = by(await runPreSessionCheck(game, {now}), 'Imports');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'N-A');
  assert.match(rows[0].text, /does not store Blocked or Conflict results; preview a package on the Import tab/);
  assert.ok(!read.some(k => k.includes('importHistory')));
});
