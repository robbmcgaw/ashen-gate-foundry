/** 0.64.0: the Hub's Ashen Gate → Locations list draws the "Your party is here" pin from Locations' hereNow / containsHere flags. Mocked Foundry; not the live Hub. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users} from './foundry-mock.mjs';
import {ashenGateTab} from '../scripts/partners.mjs';
import * as locs from '../scripts/locations-list.mjs';

const ID = 'ashen-gate-locations';
const row = (ref, name, extra = {}) => ({ref, name, state: 'revealed', active: false, hereNow: false, containsHere: false, isRegion: false, restricted: false, match: true, children: [], ...extra});
const sec = (id, label, over = {}) => ({id, label, count: 1, flat: false, container: false, ref: null, hereNow: false, containsHere: false, rows: [], sections: [], ...over});
const model = () => ({contract: 'ag-locations-list/1', audience: 'player', query: '', filtering: false, total: 2, shown: 2, empty: '',
  controls: {search: {placeholder: 'Search locations'}, filters: [], sorts: [{value: 'name', label: 'Name'}], sort: 'name', sortDesc: false, canReverse: false},
  filters: {}, sort: 'name', sortDesc: false,
  sections: [sec('LOC-A', '[TEST] Outer', {containsHere: true, sections: [sec('LOC-B', '[TEST] Inner', {containsHere: true, rows: [row('LOC-P', '[TEST] Place', {active: true, hereNow: true})]})]}),
    sec('LOC-C', '[TEST] Elsewhere', {rows: [row('LOC-Q', '[TEST] Other')]})]});
const run = () => { installGlobals({user: users.owner, modules: {[ID]: {active: true, api: {listModel: () => model(), openLocation() {}}}}}); return ashenGateTab({actor: makeActor(), sheet: {agTab: ID}}); };
const head = (html, label) => { const at = html.indexOf(label); return html.slice(html.lastIndexOf('<h4', at), html.indexOf('</h4>', at)); };

test('open folders carry no pin (the place has its Here now badge); pins are hidden, not absent, so folding can reveal them', () => {
  const html = run();
  assert.match(html, /Here now/);
  for (const l of ['[TEST] Outer', '[TEST] Inner']) assert.match(head(html, l), /data-here-pin hidden/, l);
  assert.doesNotMatch(head(html, '[TEST] Elsewhere'), /data-here-pin/);
  assert.match(head(html, '[TEST] Inner'), /<\/button><span class="agch-loc__here" role="img" aria-label="Your party is here" data-tooltip="Your party is here"/, 'after the count button, before the open link');
});

test('a folded folder shows its pin; folding in place toggles it', async () => {
  const html = run();
  const key = /data-key="([^"]+)"[^>]*>(?:(?!<\/h4>)[\s\S])*Outer/.exec(html)[1];
  const pin = {hidden: true}, h4 = {querySelector: sel => { assert.match(sel, /data-here-pin/); return pin; }};
  const btn = {dataset: {key}, attrs: {'aria-expanded': 'true'}, getAttribute(n) { return this.attrs[n]; }, setAttribute(n, v) { this.attrs[n] = v; }, closest: () => h4};
  await locs.foldFolder({locUi: {filtering: false}, render() {}}, btn, {querySelectorAll: () => []});
  assert.equal(pin.hidden, false, 'folded -> pin shown');
  await locs.foldFolder({locUi: {filtering: false}, render() {}}, btn, {querySelectorAll: () => []});
  assert.equal(pin.hidden, true, 'unfolded -> pin hidden');
});

test('a folder that is itself the active place always shows it; an older Locations (no flags) draws no pin', () => {
  installGlobals({user: users.owner, modules: {[ID]: {active: true, api: {listModel: () => ({...model(), sections: [sec('LOC-A', '[TEST] Outer', {hereNow: true, containsHere: true})]}), openLocation() {}}}}});
  assert.doesNotMatch(head(ashenGateTab({actor: makeActor(), sheet: {agTab: ID}}), '[TEST] Outer'), /data-here-pin[^>]*hidden/);
  installGlobals({user: users.owner, modules: {[ID]: {active: true, api: {listModel: () => ({...model(), sections: [{...sec('LOC-A', '[TEST] Outer'), hereNow: undefined, containsHere: undefined}]}), openLocation() {}}}}});
  assert.doesNotMatch(ashenGateTab({actor: makeActor(), sheet: {agTab: ID}}), /data-here-pin/);
});
