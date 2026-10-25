/** Level backup copies stay out of the Companions GM table and are refused as pet-cap / companion targets (0.29.1). Mocked Foundry: logic only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users} from './foundry-mock.mjs';
import * as c from '../scripts/companions.mjs';
import {gmSetupTab, companionsTab} from '../scripts/companion-views.mjs';
import {MODULE_ID} from '../scripts/constants.mjs';

const REFUSAL = 'That is a level backup copy, not a playable character.';
function world() {
  const hero = makeActor();
  const backup = Object.assign(makeActor(), {id: 'bk1', uuid: 'Actor.bk1', name: '[TEST] Hero - level 3', flags: {[MODULE_ID]: {levelBackup: {sourceId: 'actor1', levelBefore: 3}}}});
  const actors = Object.assign([hero, backup], {get: id => [hero, backup].find(a => a.id === id)});
  installGlobals({user: users.gm, actors});
  return {hero, backup};
}

test('GM Setup has the pet slots card (not the old pet-limit table); the old petCap settings are untouched', () => {
  const {hero} = world();
  game.settings.store.petCap = 3; game.settings.store.petCapOverrides = {actor1: 'none'};
  const html = gmSetupTab();
  assert.doesNotMatch(html, /pet-cap/);
  assert.match(html, /data-edit="pet-slots-default"/);
  assert.doesNotMatch(companionsTab({actor: hero, editable: true}), /pet-cap-override/);
  assert.equal(c.petCapFor(hero), Infinity);
  assert.deepEqual([game.settings.store.petCap, game.settings.store.petCapOverrides], [3, {actor1: 'none'}], 'saved values kept');
});

test('a backup is refused as a companion, and its own companions cannot be changed', async () => {
  const {hero, backup} = world();
  const linked = await c.addActorCompanion(hero, backup, 'pet');
  assert.equal(linked.ok, false); assert.equal(linked.error, REFUSAL);
  const onBackup = await c.addActorCompanion(backup, makeActor(), 'mount');
  assert.equal(onBackup.ok, false); assert.equal(onBackup.error, REFUSAL);
  assert.equal(hero.calls.length, 0); assert.equal(backup.calls.length, 0);
  const steed = Object.assign(makeActor(), {id: 'steed', uuid: 'Actor.steed', name: '[TEST] Steed', type: 'npc'});
  assert.equal((await c.addActorCompanion(hero, steed, 'mount')).ok, true, 'a normal Actor still links');
});
