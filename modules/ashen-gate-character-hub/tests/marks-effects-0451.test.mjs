/**
 * 0.45.1: weapon masteries act. Sap / Slow / Vex are timed effects (dnd5e special duration, real changes), Topple asks for the
 * save and puts Prone, Cleave / Graze / Nick / Push show their rule. Mocked Foundry: proves the logic and the data written,
 * not dnd5e's own expiry or roll handling (check those live in Forge).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users} from './foundry-mock.mjs';
import * as m from '../scripts/marks.mjs';
import {MODULE_ID} from '../scripts/constants.mjs';

const WEAPONS = () => [
  {id: 'w1', name: '[TEST] Mace', type: 'weapon', system: {equipped: true, masteryOptions: [{value: 'sap'}, {value: 'topple'}, {value: 'vex'}, {value: 'slow'}, {value: 'push'}]}}
];
function target(id, speeds = {walk: 30, fly: 60, swim: 0}) {
  const a = {documentName: 'Actor', id, uuid: `Actor.${id}`, name: `[TEST] ${id}`, effects: [], statuses: new Set(), system: {attributes: {movement: {speeds}}},
    testUserPermission: u => u.isGM, async createEmbeddedDocuments(t, rows) { for (const r of rows) { const e = {...r, id: `e${a.effects.length}${Math.random()}`, async delete() { a.effects = a.effects.filter(x => x !== e); }}; a.effects.push(e); } return rows; }};
  return a;
}
const tokenFor = (a, id) => ({actor: a, name: a.name, document: {id, name: a.name, actor: a, parent: {id: 's1'}}});
function world(targets = []) {
  installGlobals({user: users.gm});
  game.users = [{...users.gm, active: true}]; game.users.get = id => game.users.find(u => u.id === id);
  game.socket = {emit() {}, on() {}};
  game.user.targets = new Set(targets);
  CONFIG.DND5E.weaponMasteries = {sap: {label: 'Sap'}, topple: {label: 'Topple'}, vex: {label: 'Vex'}, slow: {label: 'Slow'}, push: {label: 'Push'}};
  CONFIG.DND5E.movementTypes = {walk: 'Walk', fly: 'Fly', swim: 'Swim', jump: 'Jump'};
  const actor = makeActor({items: WEAPONS()});
  actor.system = {abilities: {str: {mod: 3}}, attributes: {prof: 2}};
  actor.items.get('w1').system.abilityMod = 'str';
  const tokens = targets.map(t => t.document);
  const scene = {id: 's1', tokens: Object.assign(tokens, {get: id => tokens.find(t => t.id === id)})};
  game.scenes = {get: id => id === 's1' ? scene : null}; globalThis.canvas = {scene};
  globalThis.fromUuidSync = u => u === actor.uuid ? actor : u === `${actor.uuid}.Item.w1` ? actor.items.get('w1') : null;
  return actor;
}

test('Sap: Disadvantage on the target\'s attack rolls until the start of the attacker\'s next turn', () => {
  const actor = world(), foe = target('goblin');
  const d = m.markEffectData(m.markById('sap'), actor, undefined, foe);
  assert.deepEqual(d.changes, [{key: 'system.rolls.attack.mode', type: 'add', value: '-1'}]);
  assert.deepEqual(d.duration, {expiry: 'sourceStart'});
  assert.equal(d.origin, actor.uuid, 'dnd5e reads the source actor from origin to find whose turn ends it');
  assert.match(d.description, /Disadvantage on its next attack roll before the start of your next turn/);
});

test('Slow: 10 ft off each speed the target has (never jump or a 0 speed); a second Slow replaces the first', async () => {
  const actor = world(), foe = target('ogre', {walk: 40, fly: 0, swim: 20, jump: 5});
  assert.deepEqual(m.markEffectData(m.markById('slow'), actor, undefined, foe).changes.map(c => [c.key, c.type, c.value]),
    [['system.attributes.movement.speeds.walk', 'add', '-10'], ['system.attributes.movement.speeds.swim', 'add', '-10']]);
  await m.toggleMarkOn(actor, foe, 'slow');
  const other = {...actor, uuid: 'Actor.other', name: '[TEST] Other', items: actor.items, testUserPermission: () => true};
  other.items = actor.items; globalThis.fromUuidSync = u => u === 'Actor.other' ? other : null;
  await m.toggleMarkOn(other, foe, 'slow');
  assert.equal(foe.effects.length, 1, 'Slow does not add up past 10 ft');
  assert.equal(foe.effects[0].flags[MODULE_ID].mark.by, 'Actor.other');
});

test('Cleave, Graze, Nick and Push show their rule and put nothing on a target; no target needed', async () => {
  const actor = world();
  actor.items.get('w1').system.masteryOptions = [{value: 'push'}, {value: 'nick'}];
  const r = await m.applyMark(actor, 'push');
  assert.equal(r.ok, true); assert.match(r.notice, /^Pushed: If you hit a creature with this weapon, you can push it up to 10 feet/);
  assert.match((await m.applyMark(actor, 'graze')).error, /has no Grazed to place/, 'still only from the character\'s own weapons');
  assert.match((await m.toggleMarkOn(actor, target('x'), 'push')).error, /puts nothing on a target/, 'refused in the data layer too');
});

test('Topple: asks for the save with the DC, and only a failed save puts Prone on the target', async () => {
  const foe = target('goblin'), actor = world([tokenFor(foe, 't1')]);
  const asked = [];
  let r = await m.applyMark(actor, 'topple', {ui: {confirm: async (msg, o) => { asked.push([msg, o]); return false; }}});
  assert.equal(r.ok, true); assert.match(asked[0][0], /Constitution saving throw \(DC 13\)/, '8 + 3 + 2');
  assert.equal(foe.effects.length, 0); assert.match(r.notice, /saved/);
  assert.equal(m.toppleDC({system: {}}, null), null, 'no number invented when dnd5e does not say');
});

test('an attack roll ends Sap on the attacker, and the Vex they placed on a creature they target', async () => {
  const foe = target('goblin'), actor = world([tokenFor(foe, 't1')]);
  const other = target('bystander');
  await m.toggleMarkOn(actor, foe, 'vex');
  await m.toggleMarkOn(actor, other, 'vex');
  actor.effects = [{flags: {[MODULE_ID]: {mark: {id: 'sap', by: 'Actor.x'}}}, async delete() { actor.effects = []; }}];
  const ended = await m.spendMarks(actor);
  assert.deepEqual(ended.sort(), ['sap', 'vex']);
  assert.equal(foe.effects.length, 0, 'the targeted creature\'s Vex is spent');
  assert.equal(other.effects.length, 1, 'a Vex on a creature not attacked stays');
  assert.deepEqual(await m.spendMarks(null), []);
});

// 0.46.6: Foundry only marks an expired effect (duration.expired) and leaves it on the target as an inactive effect.
test('an expired Sap is not listed, and placing it again puts a fresh one on instead of taking the dead one off', async () => {
  const foe = target('goblin'), actor = world([tokenFor(foe, 't1')]);
  assert.equal((await m.toggleMarkOn(actor, foe, 'sap')).result, 'added');
  assert.equal(m.placedMarks(actor).length, 1, 'listed while it lasts');
  foe.effects[0].duration = {expired: true};   // dnd5e / Foundry: the attacker's next turn started
  assert.equal(m.placedMarks(actor).length, 0, 'an expired mark is no chip');
  assert.equal(m.findMark(foe, 'sap', actor.uuid), null);
  const r = await m.toggleMarkOn(actor, foe, 'sap');
  assert.equal(r.result, 'added', 'a new Sap, not "removed"');
  assert.equal(foe.effects.length, 1, 'the expired one is cleared');
  assert.notEqual(foe.effects[0].duration?.expired, true);
  assert.equal(m.placedMarks(actor).length, 1);
});

test('placing a mark clears other expired Hub marks on that target and leaves unrelated effects alone', async () => {
  const foe = target('goblin'), actor = world([tokenFor(foe, 't1')]);
  await m.toggleMarkOn(actor, foe, 'vex');
  foe.effects[0].duration = {expired: true};
  const stranger = {flags: {}, duration: {expired: true}, async delete() { foe.effects = foe.effects.filter(x => x !== stranger); }};
  foe.effects.push(stranger);
  await m.toggleMarkOn(actor, foe, 'slow');
  assert.deepEqual(foe.effects.map(e => e.flags?.[MODULE_ID]?.mark?.id ?? 'other').sort(), ['other', 'slow']);
});
