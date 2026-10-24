/**
 * 0.45.2 conditions, option A: the shared list, success feedback, recent-condition chips, and condition changes on tokens that are
 * not linked to a character through the GM client. Mocked Foundry: logic and calls, not the live UI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users} from './foundry-mock.mjs';
import * as conds from '../scripts/conditions.mjs';
import * as marks from '../scripts/marks.mjs';
import {MODULE_ID} from '../scripts/constants.mjs';

const foe = (id = 'gob') => { const a = makeActor(); a.id = id; a.uuid = `Scene.s1.Token.${id}.Actor.${id}`; a.name = `[TEST] ${id}`;
  a.toggleStatusEffect = async (sid, o) => { a.calls.push(['toggleStatusEffect', sid, o]); if (o.active) a.statuses.add(sid); else a.statuses.delete(sid); return true; }; return a; };
const token = actor => ({name: actor.name, actor, document: {id: `t-${actor.id}`, parent: {id: 's1'}, actor}});
function world({user = users.gm, utilities = null, access = true, targets = [], actors = [], setting = []} = {}) {
  const store = {recentConditions: setting};
  installGlobals({user, modules: utilities ? {'ashen-gate-utilities': {active: true, api: {conditions: utilities, playerAccess: {getState: () => ({playerAccessEnabled: access})}}}} : {}});
  game.settings.get = (scope, key) => key === 'recentConditions' ? store.recentConditions : undefined;
  game.settings.set = async (scope, key, v) => { store[key] = v; };
  game.users = [{...users.gm, active: true}, {...users.owner, active: true}]; game.users.get = id => game.users.find(u => u.id === id);
  const sent = []; game.socket = {emit: (n, m) => sent.push(m), on() {}};
  game.actors = Object.assign([...actors], {get: id => actors.find(a => a.id === id) ?? null});
  game.user.targets = new Set(targets);
  const scene = {id: 's1', tokens: Object.assign(targets.map(t => t.document), {get: id => targets.find(t => t.document.id === id)?.document})};
  game.scenes = {get: id => id === 's1' ? scene : null}; globalThis.canvas = {scene};
  return {store, sent};
}
const utilities = (controller = true) => ({contract: 'ag-utilities-conditions/1', canApply: () => true, apply: async () => 'ok', canRemove: () => true, remove: async () => 'ok',
  isController: () => controller, choices: () => [{id: 'prone', label: 'Prone', img: 'p.svg'}, {id: 'dead', label: 'Dead', img: 'd.svg'}]});

test('the list is Utilities\' own when it offers one, else dnd5e\'s', () => {
  world({utilities: utilities()});
  assert.deepEqual(conds.conditionChoices(makeActor()).map(c => c.id), ['prone', 'dead']);
  world();
  assert.deepEqual(conds.conditionChoices(makeActor()).map(c => c.id), ['blinded', 'poisoned', 'prone']);
});

test('feedback: Apply says who got it and who already had it; remove says what came off', async () => {
  const me = makeActor(), gob = foe('gob'), wolf = foe('wolf'); wolf.statuses.add('prone');
  world({targets: [token(gob), token(wolf)], actors: [me]});
  const r = await conds.applyCondition(me, 'target', 'prone');
  assert.equal(r.notice, 'Prone put on [TEST] gob. [TEST] wolf already has Prone.');
  const again = await conds.applyCondition(me, 'target', 'prone');
  assert.equal(again.notice, '[TEST] gob, [TEST] wolf already have Prone.');
  assert.equal((await conds.removeCondition(me, gob.uuid, 'prone')).notice, 'Prone taken off [TEST] gob.');
});

test('recent conditions: the last four put on, newest first, one click to repeat', async () => {
  const me = makeActor();
  const {store} = world({actors: [me]});
  for (const id of ['prone', 'blinded', 'poisoned', 'prone']) { me.statuses.delete(id); await conds.applyCondition(me, 'self', id); }
  assert.deepEqual(store.recentConditions, ['prone', 'poisoned', 'blinded']);
  const html = conds.conditionsStripHtml({actor: me, editable: true, sheet: {}});
  assert.match(html, /data-action="cond-quick" data-status="prone"[\s\S]*data-action="cond-quick" data-status="poisoned"[\s\S]*data-action="cond-quick" data-status="blinded"/);
  assert.match(html, /agch-conds__quick[^>]*data-tooltip="Prone: put it on \[TEST\] Hero now"/);
});

test('an unlinked token: a condition controller asks the GM client, which checks the requester again', async () => {
  const me = makeActor(), gob = foe('gob');
  const {sent} = world({user: users.owner, utilities: utilities(true), targets: [token(gob)], actors: [me]});
  const pending = conds.applyCondition(me, 'target', 'prone');
  await new Promise(r => setTimeout(r, 0));
  assert.equal(sent.length, 1);
  assert.deepEqual({type: sent[0].type, sourceUuid: sent[0].sourceUuid, sceneId: sent[0].sceneId, tokenId: sent[0].tokenId, statusId: sent[0].statusId, active: sent[0].active, userId: sent[0].userId},
    {type: 'condition-toggle', sourceUuid: me.uuid, sceneId: 's1', tokenId: 't-gob', statusId: 'prone', active: true, userId: 'owner'});
  // GM client
  const gm = game.user; game.user = {...users.gm, active: true};
  globalThis.fromUuidSync = u => u === me.uuid ? me : null;
  await marks.onSocket(sent[0], 'owner');
  assert.deepEqual(gob.calls.at(-1), ['toggleStatusEffect', 'prone', {active: true}]);
  const receipt = sent.at(-1); assert.deepEqual([receipt.type, receipt.ok], ['receipt', true]);
  game.user = gm; await marks.onSocket(receipt);
  assert.equal((await pending).ok, true);
});

test('the GM client refuses: a non-controller, a character, a status off the list, hidden Player Access', async () => {
  const me = makeActor(), gob = foe('gob'), pc = foe('pc');
  world({user: users.gm, utilities: utilities(false), targets: [token(gob), token(pc)], actors: [me, pc]});
  globalThis.fromUuidSync = u => u === me.uuid ? me : null;
  const asOwner = {...users.owner, active: true};
  const msg = {sourceUuid: me.uuid, sceneId: 's1', tokenId: 't-gob', statusId: 'prone', active: true};
  await assert.rejects(conds.conditionToggleOnGM(msg, asOwner), /condition controller/);
  world({user: users.gm, utilities: utilities(true), targets: [token(gob), token(pc)], actors: [me, pc]});
  globalThis.fromUuidSync = u => u === me.uuid ? me : null;
  await assert.rejects(conds.conditionToggleOnGM({...msg, tokenId: 't-pc'}, asOwner), /is a character/);
  await assert.rejects(conds.conditionToggleOnGM({...msg, statusId: 'turned'}, asOwner), /from the list/);
  world({user: users.gm, utilities: utilities(true), access: false, targets: [token(gob)], actors: [me]});
  globalThis.fromUuidSync = u => u === me.uuid ? me : null;
  await assert.rejects(conds.conditionToggleOnGM(msg, asOwner), /condition controller/, 'Player Access off: no relay');
  assert.equal(gob.calls.length, 0, 'nothing changed');
  const r = conds.conditionDecision({actor: gob, name: gob.name, statusId: 'prone', user: users.owner, utilities: utilities(true), token: token(gob)});
  assert.equal(r.ok, false, 'and the player is told up front when Player Access is off');
});
