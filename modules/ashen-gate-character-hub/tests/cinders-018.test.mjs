/** 0.18.0: Strain bar and Cinders panel through Ashen Gate | Cinders' public API (stand-in API, mocked Foundry; logic only, not the live UI). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users} from './foundry-mock.mjs';
import {strainModel, strainHtml, stepStrain, cindersSummary, pushFromHub} from '../scripts/cinders.mjs';
import {characterPanelHtml} from '../scripts/character.mjs';
import {PANELS, panelState} from '../scripts/partners.mjs';
import {ACTIONS} from '../scripts/sheet.mjs';

const calls = [];
function cinders({value = 4, cinderList = null, refuse = false} = {}) {
  calls.length = 0;
  return {active: true, api: {
    open: o => calls.push(['open', o]),
    playerAccess: {getState: () => ({playerAccessEnabled: true})},
    strain: {contract: 'ag-strain/1',
      get: () => { if (refuse) throw new Error('Actor access denied'); return {value, band: {label: `[TEST] Band at ${value}`}, chance: value >= 10 ? 100 : 25, guaranteed: value >= 10, normalUseBackfires: value >= 10, guaranteeAt: 10}; },
      add: async (a, n, o) => { calls.push(['add', n, o]); return {from: value, to: value + n}; },
      remove: async (a, n, o) => { calls.push(['remove', n, o]); return {from: value, to: value - n}; }},
    cinder: {contract: 'ag-cinder/1',
      list: () => cinderList ?? [{instanceId: 'cinst_TEST00001', name: '[TEST] Ember Cinder', enhancements: [{name: '[TEST] Steady'}],
        powers: [{powerId: 'POWER-TEST-SPARK', name: '[TEST] Spark', standard: '[TEST] normal', modes: [{id: 'amplify', label: '[TEST] Amplify', cost: 1, after: 5, chance: 15, guaranteed: false}]}]}],
      previewPush: (a, i, p, m) => ({powerName: '[TEST] Spark', label: '[TEST] Amplify', effect: '', strain: value, after: value + 1, cost: 1, chance: 15, guaranteed: false, modifiers: []}),
      push: async (a, p, m) => { calls.push(['push', p, m]); return {opId: 'op'}; }}}};
}

test('Strain bar: nothing without Cinders; band, chance and over-10 shown; players get no buttons, the GM gets − / +', () => {
  installGlobals({user: users.owner, modules: {}});
  assert.equal(strainHtml(makeActor(), false), '');
  installGlobals({user: users.owner, modules: {'ashen-gate-cinders': cinders({value: 13})}});
  const m = strainModel(makeActor());
  assert.deepEqual([m.fill, m.label, m.over, m.chance], [100, '13 / 10+', 3, 100]);
  const player = strainHtml(makeActor(), false);
  assert.match(player, /13 \/ 10\+/);assert.match(player, /\[TEST\] Band at 13/);assert.match(player, /\+3 over/);assert.match(player, /every use of a Cinder power backfires/i);
  assert.doesNotMatch(player, /strain-step/, 'read-only for players');
  installGlobals({user: users.gm, modules: {'ashen-gate-cinders': cinders({value: 4})}});
  const gm = strainHtml(makeActor(), false);
  assert.equal((gm.match(/data-action="strain-step"/g) ?? []).length, 2);assert.match(gm, /4 \/ 10/);assert.doesNotMatch(gm, /over/);
  installGlobals({user: users.owner, modules: {'ashen-gate-cinders': cinders({refuse: true})}});
  assert.equal(strainHtml(makeActor(), false), '', 'a refusal hides the bar, never breaks the sheet');
});
test('Strain bar sits with hit points and follows the Hub\'s own Strain toggle', () => {
  installGlobals({user: users.owner, modules: {'ashen-gate-cinders': cinders({value: 2})}});
  assert.match(characterPanelHtml({actor: makeActor()}), /agch-strain/);
  installGlobals({user: users.owner, modules: {'ashen-gate-cinders': cinders({value: 2})}, settings: {playerVisibility: {strain: false}}});
  assert.doesNotMatch(characterPanelHtml({actor: makeActor()}), /agch-strain/);
  installGlobals({user: users.gm, modules: {'ashen-gate-cinders': cinders({value: 2})}, settings: {playerVisibility: {strain: false}}});
  assert.match(characterPanelHtml({actor: makeActor()}), /agch-strain/, 'the GM always sees it');
});
test('GM − / + go to api.strain with a source and reason; players are refused before any call', async () => {
  installGlobals({user: users.gm, modules: {'ashen-gate-cinders': cinders()}});
  assert.equal((await stepStrain(makeActor(), 1)).ok, true);assert.equal((await stepStrain(makeActor(), -1)).ok, true);
  assert.deepEqual(calls.map(c => [c[0], c[1], c[2].source.kind, c[2].source.module]), [['add', 1, 'gm', 'ashen-gate-character-hub'], ['remove', 1, 'gm', 'ashen-gate-character-hub']]);
  assert.match(calls[0][2].reason, /GM adjustment/);
  installGlobals({user: users.owner, modules: {'ashen-gate-cinders': cinders()}});
  assert.match((await stepStrain(makeActor(), 1)).error, /Only the GM/);assert.equal(calls.length, 0);
  assert.equal(typeof ACTIONS['strain-step'], 'function');assert.equal(typeof ACTIONS['cinder-push'], 'function');
});
test('Cinders panel: Cinder, powers and Push modes with cost and chance; empty and older module handled', () => {
  installGlobals({user: users.owner, modules: {'ashen-gate-cinders': cinders()}});
  const panel = PANELS.find(p => p.id === 'ashen-gate-cinders');
  const s = panelState(panel, makeActor());
  assert.equal(s.state, 'ok');assert.match(s.html, /\[TEST\] Ember Cinder/);assert.match(s.html, /\+1 Strain → 5 · Backfire 15%/);
  assert.match(s.html, /data-action="cinder-push"[^>]*data-instance="cinst_TEST00001"[^>]*data-power="POWER-TEST-SPARK"[^>]*data-mode="amplify"/);
  assert.match(cindersSummary(makeActor(), cinders({cinderList: []}).api), /No Cinder bound/);
  assert.match(cindersSummary(makeActor(), {cinder: {}}), /Update Ashen Gate \| Cinders/);
  panel.open(cinders().api, makeActor());assert.equal(calls[0][0], 'open');
});
test('Push from the Hub: confirm with Cinders\' preview, then Cinders\' push; cancel does nothing', async () => {
  installGlobals({user: users.owner, modules: {'ashen-gate-cinders': cinders()}});
  const data = {instance: 'cinst_TEST00001', power: 'POWER-TEST-SPARK', mode: 'amplify'};
  let shown = '';
  assert.equal((await pushFromHub(makeActor(), data, async html => { shown = html; return false; })).result, null);
  assert.match(shown, /Strain 4 → <strong>5<\/strong> \(\+1\)/);assert.equal(calls.length, 0);
  await pushFromHub(makeActor(), data, async () => true);
  assert.deepEqual(calls, [['push', 'POWER-TEST-SPARK', 'amplify']]);
  installGlobals({user: users.owner, modules: {}});
  assert.match((await pushFromHub(makeActor(), data, async () => true)).error, /not active/);
});
