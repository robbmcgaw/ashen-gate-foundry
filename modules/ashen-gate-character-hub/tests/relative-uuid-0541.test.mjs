import test from 'node:test';
import assert from 'node:assert/strict';
import {favoriteId} from '../scripts/item-actions.mjs';

const actor = {id: 'A1'}, item = {id: 'I1', getRelativeUUID() { throw new Error('deprecated call must not be used when buildRelativeUuid exists'); }};

test('0.54.1 favoriteId uses foundry.utils.buildRelativeUuid, never the deprecated getRelativeUUID', () => {
  const calls = [];
  globalThis.foundry = {utils: {buildRelativeUuid: (doc, rel) => { calls.push([doc, rel]); return '.Item.I1'; }}};
  assert.equal(favoriteId(actor, item), '.Item.I1');
  assert.deepEqual(calls, [[item, actor]]);
  delete globalThis.foundry;
});
test('0.54.1 favoriteId falls back to the old method on a Foundry without buildRelativeUuid, then to the plain form', () => {
  delete globalThis.foundry;
  assert.equal(favoriteId(actor, {id: 'I2', getRelativeUUID: a => `.Item.${a.id}-old`}), '.Item.A1-old');
  assert.equal(favoriteId(actor, {id: 'I3'}), '.Item.I3');
  globalThis.foundry = {utils: {buildRelativeUuid: () => { throw new Error('x'); }}};
  assert.equal(favoriteId(actor, {id: 'I4'}), '.Item.I4');
  delete globalThis.foundry;
});
