/** 0.27.0 Level up: starts dnd5e's own level-up flow (mocked Foundry and dnd5e; logic only, not the real dnd5e window). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users} from './foundry-mock.mjs';
import {levelUpState, startLevelUp} from '../scripts/level-up.mjs';
import {shellHtml} from '../scripts/views.mjs';
import {ACTIONS} from '../scripts/sheet.mjs';
import * as j from '../scripts/journey.mjs';
import {MODULE_ID} from '../scripts/constants.mjs';

const FIGHTER = {id: 'fig', name: '[TEST] Fighter', type: 'class', system: {identifier: 'fighter', levels: 3}};
const WIZARD = {id: 'wiz', name: '[TEST] Wizard', type: 'class', system: {identifier: 'wizard', levels: 1}};
/** dnd5e's AdvancementManager stand-in: records forLevelChange calls; `steps` decides whether a window is needed. */
function fakeDnd5e(steps = 1) {
  const calls = [];
  class AdvancementManager {
    constructor(actor) { this.actor = actor; this.steps = []; this.renders = []; }
    static forLevelChange(actor, classId, delta) { const m = new this(actor); m.steps = Array(steps).fill({type: 'forward'}); calls.push({classId, delta, manager: m}); return m; }
    async render(options) { this.renders.push(options); return this; }
  }
  globalThis.dnd5e = {applications: {advancement: {AdvancementManager}}};
  return calls;
}
function setup({user = users.owner, xp = {value: 2700, max: 2700}, items = [FIGHTER], settings = {}, steps = 1} = {}) {
  const notes = installGlobals({user, settings: {levelingMode: 'xp', ...settings}});
  globalThis.CONFIG.DND5E.maxLevel = 20;
  const calls = fakeDnd5e(steps);
  const actor = makeActor({items: items.map(i => structuredClone(i)), system: {details: {level: items.reduce((n, i) => n + i.system.levels, 0), xp}}});
  return {actor, calls, notes};
}

test('ready with enough XP: opens dnd5e\'s advancement window for +1 level of the class', async () => {
  const {actor, calls} = setup();
  assert.equal(levelUpState(actor).ok, true);
  assert.deepEqual(await startLevelUp(actor), {ok: true, result: 'advancement'});
  assert.equal(calls.length, 1); assert.equal(calls[0].classId, 'fig'); assert.equal(calls[0].delta, 1);
  assert.deepEqual(calls[0].manager.renders, [{force: true}]);
  assert.equal(actor.items.get('fig').calls.length, 0, 'the Hub itself changes nothing; dnd5e\'s window applies the level');
});

test('a sheet that can render a child window (as dnd5e sheets do) is used for it', async () => {
  const {actor, calls} = setup(); const shown = [];
  await startLevelUp(actor, {sheet: {_renderChild: m => shown.push(m)}});
  assert.equal(shown[0], calls[0].manager);
});

test('no advancement steps, or advancements disabled: the class level goes up by one, as on the native sheet', async () => {
  let {actor} = setup({steps: 0});
  assert.deepEqual(await startLevelUp(actor), {ok: true, result: 'levels'});
  assert.deepEqual(actor.items.get('fig').calls, [['update', {'system.levels': 4}]]);
  const s = setup({settings: {disableAdvancements: true}});
  assert.deepEqual(await startLevelUp(s.actor), {ok: true, result: 'levels'});
  assert.equal(s.calls.length, 0);
});

test('not enough XP: refused with a plain reason, nothing opens', async () => {
  const {actor, calls} = setup({xp: {value: 1200, max: 2700}});
  assert.deepEqual(levelUpState(actor).reason, 'Not enough XP yet: 1200 of 2700.');
  assert.deepEqual(await startLevelUp(actor), {ok: false, error: 'Not enough XP yet: 1200 of 2700.'});
  assert.equal(calls.length, 0);
});

test('milestone levelling (dnd5e levelingMode "noxp") ignores XP', () => {
  const {actor} = setup({xp: {value: 0, max: 2700}, settings: {levelingMode: 'noxp'}});
  assert.equal(levelUpState(actor).ok, true);
});

test('dnd5e\'s default (xpBoons) checks XP like "xp"', () => {
  const {actor} = setup({xp: {value: 10, max: 2700}, settings: {levelingMode: undefined}});
  assert.equal(levelUpState(actor).ok, false);
});

test('who may level: owner and GM yes; observer no (checked in the action, not only the button)', async () => {
  assert.equal(levelUpState(setup({user: users.gm}).actor).ok, true);
  const {actor, calls} = setup({user: users.observer});
  const r = await startLevelUp(actor);
  assert.equal(r.ok, false); assert.match(r.error, /owner or the GM/); assert.equal(calls.length, 0);
});

test('no class, or level 20: refused with a reason', () => {
  assert.match(levelUpState(setup({items: []}).actor).reason, /No class yet/);
  assert.match(levelUpState(setup({items: [{...FIGHTER, system: {identifier: 'fighter', levels: 20}}], xp: {value: 355000, max: Infinity}}).actor).reason, /highest level \(20\)/);
});

test('multiclass: asks which class; cancel does nothing', async () => {
  const {actor, calls} = setup({items: [FIGHTER, WIZARD]});
  let offered = null;
  await startLevelUp(actor, {pickClass: async o => { offered = o; return 'wiz'; }});
  assert.deepEqual(offered.map(o => o.value), ['fig', 'wiz']); assert.match(offered[1].label, /\[TEST\] Wizard \(level 1\)/);
  assert.equal(calls[0].classId, 'wiz');
  assert.deepEqual(await startLevelUp(actor, {pickClass: async () => null}), {ok: true, result: null});
  assert.equal(calls.length, 1);
});

test('no AdvancementManager.forLevelChange in this dnd5e: falls back to the native sheet', async () => {
  const {actor} = setup();
  const opened = [];
  class CharacterActorSheet { constructor(o) { this.document = o.document; } async render() { opened.push(this.document); } }
  globalThis.dnd5e = {applications: {actor: {CharacterActorSheet}}};
  const r = await startLevelUp(actor);
  assert.equal(r.ok, true); assert.equal(r.result, 'native'); assert.match(r.notice, /class level selector/);
  assert.equal(opened[0], actor);
});

test('header button: ready, or aria-disabled with the reason; never a title attribute; the click says why', async () => {
  let {actor} = setup();
  let html = shellHtml({actor, editable: true, tab: 'overview'});
  assert.match(html, /data-action="level-up"[^>]*>/); assert.doesNotMatch(html.match(/<button[^>]*data-action="level-up"[^>]*>/)[0], /aria-disabled|title=/);
  const s = setup({xp: {value: 5, max: 2700}});
  html = shellHtml({actor: s.actor, editable: true, tab: 'overview'});
  const tag = html.match(/<button[^>]*data-action="level-up"[^>]*>/)[0];
  assert.match(tag, /aria-disabled="true"/); assert.match(tag, /data-tooltip="Not enough XP yet: 5 of 2700\."/);
  await ACTIONS['level-up']({document: s.actor});
  assert.deepEqual(s.notes.at(-1), ['info', 'Not enough XP yet: 5 of 2700.']);
  assert.equal(s.calls.length, 0);
  assert.doesNotMatch(shellHtml({actor, limited: true, editable: false, tab: 'overview'}), /level-up/);
});

test('the Journey records the new level once (the button records nothing itself)', async () => {
  const {actor} = setup({user: users.gm, steps: 0});
  globalThis.game.users = [{...users.gm, active: true}, {...users.owner, active: true}];
  await j.recordLevel(actor); // first sight remembers level 3
  await startLevelUp(actor);
  actor.system.details.level = 4; // dnd5e derives this from the class levels
  await j.recordLevel(actor); await j.recordLevel(actor);
  const entries = actor.flags[MODULE_ID].journey.entries;
  assert.deepEqual(entries.map(e => e.id), ['level-4']);
});
