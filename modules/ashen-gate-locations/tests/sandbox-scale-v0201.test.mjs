/** 0.20.1: the GM list at sandbox volume (about 110 places, every gathering entry a Ledger node template reference),
 *  and the Reveal status grouping. Synthetic [TEST] data on mocked Foundry globals; not the live window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {readAll, writeAll, readViews, placeNote, presentationOptions} from '../scripts/store.mjs';
import {normalizeLocation} from '../scripts/model.mjs';
import {withNodeInfo, groupRows, applyFilters, filterOptions, searchText, matchesQuery, emptyFilters, comparator} from '../scripts/list-filter.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
const {LocationsApp} = await import('../scripts/app.mjs');

const TEMPLATES = [
  {id: 'NODE-TEST-HERBS', name: '[TEST] Meadow Herbs', activity: 'herbalism', professions: ['herbalism'], tier: {min: 1, max: 2}, finite: true},
  {id: 'NODE-TEST-ORE', name: '[TEST] Surface Ore', activity: 'mining', professions: ['mining'], tier: {min: 1, max: 3}, finite: true}];
const STATES = ['hidden', 'unidentified', 'revealed'];
const make = n => Array.from({length: n}, (_, i) => normalizeLocation({
  id: `LOC-TEST-${String(i).padStart(3, '0')}`, name: `[TEST] Site ${String(i).padStart(3, '0')}`, region: `[TEST] Region ${i % 6}`, state: STATES[i % 3],
  resources: [{id: 'a', nodeId: TEMPLATES[i % 2].id, tier: 1, label: i % 4 === 0 ? '' : `[TEST] Spot ${i}`}]}));

test('references carry no skill or name, so the list reads them from the template', () => {
  const rows = make(8);
  assert.equal(searchText(rows[1]).includes('herb'), false, 'before: nothing to search by');
  const rich = withNodeInfo(rows, TEMPLATES);
  const text = searchText(rich[0]);
  assert.match(text, /meadow herbs/, 'an empty label shows the template name');
  assert.match(text, /herbalism/);
  assert.deepEqual(applyFilters(rich, {...emptyFilters(), profession: 'Mining'}).map(l => l.id), rows.filter((_, i) => i % 2).map(l => l.id));
  assert.deepEqual(filterOptions(rich, emptyFilters()).profession.map(o => [o.label, o.count]), [['Herbalism', 4], ['Mining', 4]]);
  assert.deepEqual(groupRows(rich, 'profession').map(g => [g.label, g.rows.length]), [['Herbalism', 4], ['Mining', 4]]);
  assert.equal(matchesQuery(searchText(rich[3]), 'mining'), true);
});

test('withNodeInfo leaves unknown templates, inline nodes and the stored rows alone', () => {
  const rows = [...make(2), normalizeLocation({id: 'LOC-TEST-IN', name: '[TEST] Inline', resources: [{label: '[TEST] Ore', skill: 'Mining'}]})];
  assert.equal(withNodeInfo(rows, []), rows, 'no templates (Ledger absent): returned as is');
  const rich = withNodeInfo(rows, [TEMPLATES[0]]);
  assert.equal(rich[2], rows[2], 'a location without references is the same object');
  assert.equal(rich[1].resources[0].skill ?? '', '', 'a reference to a template that is not in the list gets nothing');
  assert.equal(rows[0].resources[0].skill ?? '', '', 'the stored location is not changed');
  assert.equal(rich[0].resources[0].skill, 'Herbalism');
});

test('Group by Reveal status: Hidden, Unidentified, Revealed, with counts', () => {
  const g = groupRows(make(10).sort(comparator()), 'status');
  assert.deepEqual(g.map(x => [x.label, x.rows.length]), [['Hidden', 4], ['Unidentified', 3], ['Revealed', 3]]);
});

test('the GM list at 110 places groups by region, searches and filters by template profession, and renders quickly', async () => {
  const game = installFoundry();
  const mod = {version: '0.24.1', active: true};
  mod.api = createApi({version: '0.24.1', isGM: () => game.user.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {}, readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}, viewOptions: presentationOptions});
  const ledger = {active: true, api: {gathering: {templates: {contract: 'ag-gathering-nodes/1', list: () => structuredClone(TEMPLATES), playerView: () => null}}}};
  game.modules = {get: id => id === 'ashen-gate-locations' ? mod : id === 'ashen-gate-profession-ledger' ? ledger : null};
  for (const l of make(110)) await mod.api.saveLocation(l);
  const app = new LocationsApp();
  app.render = async () => {};
  app.groupBy = 'region';
  const t = performance.now();
  let html = await app._renderHTML();
  assert.ok(performance.now() - t < 1500, 'first render at 110 places');
  assert.equal((html.match(/data-action="toggle-group"/g) ?? []).length, 6, 'six region groups');
  assert.equal((html.match(/data-action="select"/g) ?? []).length, 110);
  app.query = 'herbalism';
  html = await app._renderHTML();
  assert.equal((html.match(/data-action="select"/g) ?? []).length, 55, 'search finds places by the template activity');
  app.query = ''; app.filters = {...emptyFilters(), profession: 'Mining'}; app.groupBy = 'status';
  html = await app._renderHTML();
  assert.equal((html.match(/data-action="select"/g) ?? []).length, 55);
  assert.match(html, /Revealed/);
});
