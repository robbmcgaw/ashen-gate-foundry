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
/** A stand-in for Utilities' conditions API: `allow(actor, statusId, apply, userId)` is its rule (tested in Utilities itself). */
const utilities = (allow = () => true, {playerCharacter = () => false} = {}) => ({contract: 'ag-utilities-conditions/1',
  canApply: () => true, apply: async () => 'ok', canRemove: () => true, remove: async () => 'ok',
  canChangeActor: (a, sid, apply, uid) => allow(a, sid, apply, uid), isPlayerCharacter: playerCharacter,
  choices: () => [{id: 'prone', label: 'Prone', img: 'p.svg'}, {id: 'dead', label: 'Dead', img: 'd.svg'}]});

test('the list is Utilities\' own when it offers one, else dnd5e\'s', () => {
  world({utilities: utilities()});
  assert.deepEqual(conds.conditionChoices(makeActor()).map(c => c.id), ['prone'], '0.50.1: Utilities names dead, which Foundry has no status for here, so it is not offered');
  world();
  assert.deepEqual(conds.conditionChoices(makeActor()).map(c => c.id), ['blinded', 'exhaustion', 'poisoned', 'prone'], '0.46.1: Exhaustion is offered too');
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

test('an unlinked token: a player Utilities allows asks the GM client, which checks the requester again', async () => {
  const me = makeActor(), gob = foe('gob');
  const asked = [];
  const u = utilities((a, sid, apply, uid) => { asked.push([a.id, sid, apply, uid]); return true; });
  const {sent} = world({user: users.owner, utilities: u, targets: [token(gob)], actors: [me]});
  const pending = conds.applyCondition(me, 'target', 'prone');
  await new Promise(r => setTimeout(r, 0));
  assert.equal(sent.length, 1);
  assert.deepEqual({type: sent[0].type, sourceUuid: sent[0].sourceUuid, sceneId: sent[0].sceneId, tokenId: sent[0].tokenId, statusId: sent[0].statusId, active: sent[0].active, userId: sent[0].userId},
    {type: 'condition-toggle', sourceUuid: me.uuid, sceneId: 's1', tokenId: 't-gob', statusId: 'prone', active: true, userId: 'owner'});
  const gm = game.user; game.user = {...users.gm, active: true};
  globalThis.fromUuidSync = u2 => u2 === me.uuid ? me : null;
  await marks.onSocket(sent[0], 'owner');
  assert.deepEqual(gob.calls.at(-1), ['toggleStatusEffect', 'prone', {active: true}]);
  assert.deepEqual(asked.at(-1), ['gob', 'prone', true, 'owner'], 'the GM client asked Utilities about the requester, not about itself');
  const receipt = sent.at(-1); assert.deepEqual([receipt.type, receipt.ok], ['receipt', true]);
  game.user = gm; await marks.onSocket(receipt);
  assert.equal((await pending).ok, true);
});

test('permission matrix in the Hub: GM, own PC, another PC, linked NPC, unlinked token, Player Access off', () => {
  const mine = foe('mine'), other = foe('other'), npc = foe('npc'), wolf = foe('wolf');
  const rule = (a, sid, apply, uid) => a.id === 'mine' || a.id === 'npc' || a.id === 'wolf';   // Utilities' rule, Player Access on
  const u = utilities(rule, {playerCharacter: a => a.id === 'mine' || a.id === 'other'});
  const uApi = {...u, canApply: id => rule({id}), canRemove: id => rule({id})};
  world({user: users.owner, utilities: uApi, actors: [mine, other, npc]});
  const d = (actor, user = users.owner, utilitiesApi = uApi) => conds.conditionDecision({actor, statusId: 'prone', user, utilities: utilitiesApi, token: token(actor)});
  assert.equal(d(mine, users.gm).route, 'direct', 'GM: anything');
  assert.equal(d(other, users.gm).ok, true);
  assert.deepEqual([d(mine).ok, d(mine).route], [true, 'utilities'], 'own PC (a world actor): Utilities carries it out');
  const no = d(other);
  assert.equal(no.ok, false); assert.match(no.error, /another player's character, so only the GM can change its conditions/);
  assert.deepEqual([d(npc).ok, d(npc).route], [true, 'utilities'], 'linked NPC');
  assert.deepEqual([d(wolf).ok, d(wolf).route], [true, 'gm'], 'unlinked token (not a world actor): the GM client');
  const off = {...uApi, canApply: () => false, canRemove: () => false, canChangeActor: () => false, isPlayerCharacter: () => false};
  assert.match(d(mine, users.owner, off).error, /Player Access/, 'Player Access off: refused with the reason');
  assert.match(d(wolf, users.owner, off).error, /Player Access/);
  assert.match(conds.conditionDecision({actor: wolf, statusId: 'prone', user: users.owner, utilities: {...uApi, canChangeActor: undefined}, token: token(wolf)}).error, /Utilities/, 'an older Utilities without canChangeActor: refused');
});

test('the GM client refuses what Utilities refuses: another player\'s character, Player Access off, a status off the list, an older Utilities', async () => {
  const me = makeActor(), gob = foe('gob');
  const allowAll = utilities(() => true);
  world({user: users.gm, utilities: allowAll, targets: [token(gob)], actors: [me]});
  globalThis.fromUuidSync = u => u === me.uuid ? me : null;
  const asOwner = {...users.owner, active: true};
  const msg = {sourceUuid: me.uuid, sceneId: 's1', tokenId: 't-gob', statusId: 'prone', active: true};
  assert.equal(await conds.conditionToggleOnGM(msg, asOwner), 'applied');
  const deny = utilities(() => false, {playerCharacter: () => true});
  world({user: users.gm, utilities: deny, targets: [token(foe('pc'))], actors: [me]});
  globalThis.fromUuidSync = u => u === me.uuid ? me : null;
  await assert.rejects(conds.conditionToggleOnGM({...msg, tokenId: 't-pc'}, asOwner), /another player's character/);
  const offU = utilities(() => false);
  world({user: users.gm, utilities: offU, targets: [token(gob)], actors: [me]});
  globalThis.fromUuidSync = u => u === me.uuid ? me : null;
  await assert.rejects(conds.conditionToggleOnGM(msg, asOwner), /Player Access/);
  await assert.rejects(conds.conditionToggleOnGM({...msg, statusId: 'turned'}, asOwner), /from the list/);
  const old = utilities(() => true); delete old.canChangeActor;
  world({user: users.gm, utilities: old, targets: [token(gob)], actors: [me]});
  globalThis.fromUuidSync = u => u === me.uuid ? me : null;
  await assert.rejects(conds.conditionToggleOnGM(msg, asOwner), /Utilities is needed/);
  await assert.rejects(conds.conditionToggleOnGM({...msg, sourceUuid: 'Actor.nobody'}, asOwner), /Character not found/);
  assert.equal(gob.calls.filter(c => c[0] === 'toggleStatusEffect').length, 1, 'only the allowed change happened');
});

test('Exhaustion: in the list, on the chip with its level, put on with the same toggleStatusEffect', async () => {
  const me = makeActor({statuses: ['exhaustion']}); me.system.attributes.exhaustion = 2;
  world({actors: [me]});
  assert.ok(conds.conditionChoices(me).some(c => c.id === 'exhaustion'));
  const html = conds.conditionsStripHtml({actor: me, editable: true, sheet: {}});
  assert.match(html, /Exhaustion 2/, 'the chip shows its level');
  const other = makeActor(); other.id = 'o'; other.uuid = 'Actor.o';
  const r = await conds.applyCondition(other, 'self', 'exhaustion');
  assert.equal(r.ok, true); assert.deepEqual(other.calls.at(-1), ['toggleStatusEffect', 'exhaustion', {active: true}]);
});
