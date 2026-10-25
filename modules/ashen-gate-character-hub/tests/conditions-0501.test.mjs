/**
 * 0.50.1: the conditions list offers only statuses Foundry can toggle, whatever the source; a refused toggle reads as one plain line;
 * every condition has an icon. Mocked Foundry: proves the logic, not the live UI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users} from './foundry-mock.mjs';
import * as conds from '../scripts/conditions.mjs';
import {conditionsData, isToggleableStatus, CONDITION_ICON_FALLBACK} from '../scripts/data.mjs';

const world = (utilitiesChoices = null, registry = null) => {
  installGlobals({user: users.gm, modules: utilitiesChoices ? {'ashen-gate-utilities': {active: true, api: {conditions: {contract: 'ag-utilities-conditions/1', canApply() { return true; }, apply: async () => 'ok', canRemove() { return true; }, remove: async () => 'ok', choices: () => utilitiesChoices}}}} : {}});
  if (registry) CONFIG.statusEffects = registry;
  game.settings.get = () => []; game.settings.set = async () => {};
};

test('a list that names "cover" or a made-up id is cut down to ids Foundry has (V14 object registry)', () => {
  world([{id: 'cover', label: 'Cover', img: 'c.svg'}, {id: 'coverHalf', label: 'Half Cover', img: 'h.svg'}, {id: 'ghost', label: 'Ghost'}, {id: 'prone', label: 'Prone', img: ''}],
    {prone: {name: 'Prone'}, coverHalf: {name: 'Half Cover', exclusiveGroup: 'cover'}, blinded: {name: 'Blinded'}});
  const list = conds.conditionChoices(makeActor());
  assert.deepEqual(list.map(c => c.id), ['coverHalf', 'prone']);
  assert.equal(list[1].img, CONDITION_ICON_FALLBACK, 'no icon given: the generic one');
  assert.equal(isToggleableStatus('cover'), false);
  assert.equal(isToggleableStatus('coverHalf'), true);
});

test('when none of Utilities\' ids exist, the Hub falls back to its own list', () => {
  world([{id: 'cover', label: 'Cover'}]);
  assert.ok(conds.conditionChoices(makeActor()).some(c => c.id === 'prone'));
});

test('a registry key is the id, even when the entry carries another id', () => {
  world(null, {coverHalf: {id: 'cover', name: 'Half Cover'}, prone: {name: 'Prone'}});
  assert.equal(isToggleableStatus('coverHalf'), true);
  assert.equal(isToggleableStatus('cover'), false);
});

test('automatic effects (hud: false) are not offered by the Hub\'s own list', () => {
  world(null, {prone: {name: 'Prone'}, blinded: {name: 'Blinded', hud: false}});
  assert.deepEqual(conditionsData(makeActor()).map(c => c.id), ['prone']);
});

test('statusErrorReason: Foundry\'s raw text never reaches the player', () => {
  assert.equal(conds.statusErrorReason(new Error('Invalid status ID "cover" provided to Actor#toggleStatusEffect')), "Foundry doesn't recognise that condition");
  assert.equal(conds.statusErrorReason(new Error('Nope "abc-123" here\n    at stack')), 'Nope here');
  assert.equal(conds.statusErrorReason(new Error('x'.repeat(300))), 'Foundry refused the change');
  assert.equal(conds.statusErrorReason(undefined), 'Foundry refused the change');
});

test('Apply on an actor whose toggle throws says which condition and which character, in one line', async () => {
  world();
  const me = makeActor(); me.name = '[TEST] Wren';
  me.toggleStatusEffect = async id => { throw new Error(`Invalid status ID "${id}" provided to Actor#toggleStatusEffect`); };
  game.actors = Object.assign([me], {get: id => (id === me.id ? me : null)});
  const r = await conds.applyCondition(me, 'self', 'prone');
  assert.equal(r.ok, false);
  assert.match(r.error, /^Prone was not put on \[TEST\] Wren: Foundry doesn't recognise that condition\.?$/);
  assert.doesNotMatch(r.error, /Invalid status|Actor#|"/);
});
