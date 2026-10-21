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

test('the Companions GM table lists the character but not its level backup', () => {
  const {hero, backup} = world();
  const html = gmSetupTab();
  assert.match(html, new RegExp(`data-actor="${hero.id}"`));
  assert.doesNotMatch(html, new RegExp(`data-actor="${backup.id}"`));
  assert.doesNotMatch(html, /level 3/);
  assert.doesNotMatch(companionsTab({actor: backup, editable: true}), /pet-cap-override/, 'no GM pet-limit control on a backup copy');
  assert.match(companionsTab({actor: hero, editable: true}), /pet-cap-override/, 'still there on the character');
});

test('a backup is refused as a pet-cap override target; the character is unaffected', async () => {
  const {hero, backup} = world();
  const r = await c.setPetCapOverride(backup.id, '2');
  assert.equal(r.ok, false); assert.equal(r.error, REFUSAL);
  assert.equal(game.settings.store.petCapOverrides, undefined, 'nothing written');
  assert.deepEqual(await c.setPetCapOverride(hero.id, '2'), {ok: true, result: 2});
  assert.equal(c.petCapFor(hero), 2);
});

test('a backup is refused as a companion, and its own companions cannot be changed', async () => {
  const {hero, backup} = world();
  await c.setPetCapOverride(hero.id, 'unlimited');
  const linked = await c.addActorCompanion(hero, backup, 'pet');
  assert.equal(linked.ok, false); assert.equal(linked.error, REFUSAL);
  const onBackup = await c.addActorCompanion(backup, makeActor(), 'mount');
  assert.equal(onBackup.ok, false); assert.equal(onBackup.error, REFUSAL);
  assert.equal(hero.calls.length, 0); assert.equal(backup.calls.length, 0);
  const steed = Object.assign(makeActor(), {id: 'steed', uuid: 'Actor.steed', name: '[TEST] Steed', type: 'npc'});
  assert.equal((await c.addActorCompanion(hero, steed, 'mount')).ok, true, 'a normal Actor still links');
});
