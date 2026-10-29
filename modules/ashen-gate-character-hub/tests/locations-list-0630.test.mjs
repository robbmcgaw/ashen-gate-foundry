/** 0.63.0: Ashen Gate → Locations draws Locations' own list (api.listModel). Mocked Foundry: proves the markup, the options sent, the click path through
 *  Locations' API, the folds and the fallbacks; the list itself (parity with the window, player safety) is proven in Locations' own tests. Not the live Hub. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users} from './foundry-mock.mjs';
import {ashenGateTab, openPartner, panelState, PANELS} from '../scripts/partners.mjs';
import * as locs from '../scripts/locations-list.mjs';
import {ACTIONS, EDITS} from '../scripts/sheet.mjs';
import fs from 'node:fs';

const ID = 'ashen-gate-locations';
const row = (ref, name, extra = {}) => ({ref, name, state: 'revealed', active: false, isRegion: false, restricted: false, match: true, children: [], ...extra});
const sec = (id, label, over = {}) => ({id, label, count: 0, flat: false, container: false, ref: null, rows: [], sections: [], ...over});
/** Fosstryn Frontier > Fosstryn Approaches > Fosstryn > The Muster, a shop nested under a place, and a flat "No region" group. */
function sections() {
  const fosstryn = sec('LOC-TEST-FOSS', '[TEST] Fosstryn', {ref: 'LOC-TEST-FOSS', count: 3, rows: [row('LOC-TEST-MUSTER', '[TEST] The Muster', {type: 'Yard', active: true}),
    row('LOC-TEST-MARKET', '[TEST] Market', {children: [row('LOC-TEST-SMITHY', '[TEST] Smithy <b>', {restricted: true})]})]});
  const approaches = sec('LOC-TEST-APP', '[TEST] Fosstryn Approaches', {ref: 'LOC-TEST-APP', count: 3, sections: [fosstryn]});
  return [sec('LOC-TEST-FRONT', '[TEST] Fosstryn Frontier', {ref: 'LOC-TEST-FRONT', count: 3, sections: [approaches]}),
    sec('loose:No region', 'No region', {flat: true, count: 1, rows: [row('LOC-TEST-HUT', '[TEST] Hut')]})];
}
const controls = gm => ({search: {placeholder: gm ? 'Search name, region, skill, material, quest…' : 'Search locations'},
  filters: gm ? [{key: 'threat', label: 'Threat', all: 'All', value: 'hot', options: [{value: 'hot', label: 'Hot', count: 2}, {value: 'deadly', label: 'Deadly', count: 1}]},
    {key: 'region', label: 'Region', all: 'All', value: '', options: [{value: '[TEST] Elsewhere', label: '[TEST] Elsewhere', count: 1}]}] : [],
  sorts: gm ? [{value: 'name', label: 'Name'}, {value: 'threat', label: 'Threat'}] : [{value: 'name', label: 'Name'}], sort: 'name', sortDesc: false, canReverse: gm});
const modelFor = (gm, over = {}) => ({contract: 'ag-locations-list/1', audience: gm ? 'gm' : 'player', query: '', filtering: false, total: 4, shown: 4, empty: '',
  controls: controls(gm), filters: {}, sort: 'name', sortDesc: false, sections: sections(), ...over});
function partner({gm = false, model = modelFor(gm), listModel, extra = {}} = {}) {
  const calls = [];
  const api = {listModel: listModel ?? (o => { calls.push(['listModel', o]); return typeof model === 'function' ? model(o) : model; }),
    openLocation: ref => calls.push(['openLocation', ref]), open: () => calls.push(['open']), listLocations: () => { calls.push(['listLocations']); return [{id: 'LOC-TEST-FLAT', name: '[TEST] Flat'}]; }, ...extra};
  return {calls, modules: {[ID]: {active: true, api}}};
}
const tab = (sheet = {agTab: ID}) => ashenGateTab({actor: makeActor(), sheet});

test('the folders nest as Locations returns them and every link is a kit button that opens through Locations', () => {
  const p = partner(); installGlobals({user: users.owner, modules: p.modules});
  const html = tab();
  const order = ['Fosstryn Frontier', 'Fosstryn Approaches', '[TEST] Fosstryn<', 'The Muster', 'Market', 'Smithy', 'No region', '[TEST] Hut'];
  let at = -1; for (const s of order) { const i = html.indexOf(s, at + 1); assert.ok(i > at, `${s} in order`); at = i; }
  assert.match(html, /agch-loc__groups--root/);
  assert.equal((html.match(/agch-loc__toggle/g) ?? []).length, 4, 'a toggle per folder');
  assert.match(html, /<button type="button" class="ag-link" data-action="partner-open" data-partner="ashen-gate-locations" data-ref="LOC-TEST-MUSTER" data-ag-always="">\[TEST\] The Muster<\/button>/);
  assert.match(html, /data-ref="LOC-TEST-SMITHY"[^>]*>\[TEST\] Smithy &lt;b&gt;<\/button>/, 'names are escaped, nested under their parent place');
  assert.match(html, /Here now/); assert.match(html, /Selected players/);
  assert.doesNotMatch(html, /Other places|data-agch-embed|<b>/);
  assert.deepEqual(p.calls.map(c => c[0]), ['listModel'], 'only the model is read: no second copy of the records');
});

test('exactly one Open Locations button', () => {
  installGlobals({user: users.gm, modules: partner({gm: true}).modules});
  assert.equal((tab().match(/Open Locations/g) ?? []).length, 1);
  assert.equal((tab().match(/data-action="partner-open" data-partner="ashen-gate-locations"(?! data-ref)/g) ?? []).length, 1);
});

test('the Hub sends its view settings and who is asking; a player is never asked for revealedOnly', () => {
  const g = partner({gm: true}); installGlobals({user: users.gm, modules: g.modules});
  const sheet = {agTab: ID, locUi: {query: 'mill', filters: {threat: 'hot'}, sort: 'threat', sortDesc: true, filtersOpen: false, filtering: false}};
  tab(sheet);
  assert.deepEqual(g.calls[0][1], {query: 'mill', filters: {threat: 'hot'}, sort: 'threat', sortDesc: true, revealedOnly: true});
  const p = partner(); installGlobals({user: users.owner, modules: p.modules});
  tab(); assert.equal(p.calls[0][1].revealedOnly, false);
});

test('GM: Filters chip, sort select and direction come from the model; the filter row opens on demand with counts', () => {
  installGlobals({user: users.gm, modules: partner({gm: true}).modules});
  const closed = tab();
  assert.match(closed, /data-action="loc-filters"[^>]*aria-pressed="false"[^>]*>[\s\S]*Filters \(1\)/);
  assert.doesNotMatch(closed, /id="agch-loc-filters"/);
  assert.match(closed, /data-edit="loc-sort"/); assert.match(closed, /data-action="loc-sortdir"[^>]*aria-label="Sort direction: ascending"/);
  assert.match(closed, /Showing 4 of 4/);
  const open = tab({agTab: ID, locUi: {query: '', filters: {}, sort: 'name', sortDesc: false, filtersOpen: true}});
  assert.match(open, /id="agch-loc-filters"/);
  assert.match(open, /data-edit="loc-filter" data-filter-key="threat"[^>]*>[\s\S]*<option value="">All<\/option><option value="hot" selected>Hot \(2\)<\/option>/);
  assert.match(open, /aria-label="Search locations"/);
});

test('a player gets the window\'s player list: search only, no Filters, no sort, no counts line', () => {
  installGlobals({user: users.owner, modules: partner().modules});
  const html = tab();
  assert.match(html, /placeholder="Search locations"/);
  assert.doesNotMatch(html, /loc-filters|loc-sort|loc-sortdir|Showing \d+ of/);
});

test('empty states: nothing revealed, and nothing matching with a way back', () => {
  installGlobals({user: users.owner, modules: partner({model: modelFor(false, {shown: 0, total: 0, empty: 'none', sections: []})}).modules});
  assert.match(tab(), /No places revealed yet/);
  installGlobals({user: users.gm, modules: partner({gm: true, model: modelFor(true, {shown: 0, empty: 'no-match', filtering: true, query: 'zz', sections: []})}).modules});
  const html = tab({agTab: ID, locUi: {query: 'zz', filters: {}, sort: 'name', sortDesc: false}});
  assert.match(html, /Nothing matches/); assert.match(html, /data-action="loc-clear"/);
});

test('clicking a place opens Locations\' own record through its API (viewer or editor is Locations\' call)', async () => {
  const p = partner(); installGlobals({user: users.owner, modules: p.modules});
  const r = await openPartner(makeActor(), ID, 'LOC-TEST-MUSTER');
  assert.equal(r.ok, true);
  assert.deepEqual(p.calls.filter(c => c[0] === 'openLocation'), [['openLocation', 'LOC-TEST-MUSTER']]);
  await openPartner(makeActor(), ID, 'pin-key-unidentified');
  assert.deepEqual(p.calls.filter(c => c[0] === 'openLocation').at(-1), ['openLocation', 'pin-key-unidentified'], 'an unidentified place opens by its pin key');
  const r2 = await openPartner(makeActor(), ID, null);
  assert.deepEqual(p.calls.at(-1), ['open']); assert.equal(r2.ok, true);
  // Locations refusing (Player Access off) is reported, not thrown.
  installGlobals({user: users.owner, modules: {[ID]: {active: true, api: {openLocation() { throw new Error('Locations is hidden from players.'); }, listModel: () => modelFor(false)}}}});
  const bad = await openPartner(makeActor(), ID, 'x');
  assert.equal(bad.ok, false); assert.match(bad.error, /hidden from players/);
});

test('folds: remembered per user, shown folded on the next draw, and not remembered while a search has every folder open', async () => {
  const p = partner(); const notes = installGlobals({user: users.owner, modules: p.modules}); void notes;
  const sheet = {agTab: ID, render() { sheet.rendered = (sheet.rendered ?? 0) + 1; }};
  let html = tab(sheet);
  const key = html.match(/data-action="loc-fold" data-key="([^"]+)"[^>]*>[\s\S]*?Fosstryn Frontier/)[1];
  assert.match(html, new RegExp(`data-key="${key}" data-ag-always aria-expanded="true"`));
  const bodies = [], btn = {dataset: {key}, attrs: {'aria-expanded': 'true'}, getAttribute(n) { return this.attrs[n]; }, setAttribute(n, v) { this.attrs[n] = v; }};
  const body = {hidden: false};
  const root = {querySelectorAll: sel => { bodies.push(sel); return [body]; }};
  await locs.foldFolder(sheet, btn, root);                      // folds
  assert.equal(btn.attrs['aria-expanded'], 'false'); assert.equal(body.hidden, true);
  assert.deepEqual(bodies.at(-1), `[data-sec-body="${key}"]`);
  assert.equal(game.settings.store.collapsedSections[key], true, 'saved for this user');
  html = tab(sheet);
  assert.match(html, new RegExp(`data-key="${key}" data-ag-always aria-expanded="false"`)); assert.match(html, new RegExp(`data-sec-body="${key}" hidden`));
  // while filtering: every folder draws open and a click is not saved
  installGlobals({user: users.owner, modules: partner({model: modelFor(false, {filtering: true, query: 'a'})}).modules});
  const s2 = {agTab: ID, render() {}};
  assert.match(tab(s2), /aria-expanded="true"/); assert.doesNotMatch(tab(s2), /data-sec-body="[^"]+" hidden/);
  const b2 = {dataset: {key: 'x'}, attrs: {'aria-expanded': 'true'}, getAttribute(n) { return this.attrs[n]; }, setAttribute(n, v) { this.attrs[n] = v; }};
  await locs.foldFolder(s2, b2, {querySelectorAll: () => []});
  assert.equal(b2.attrs['aria-expanded'], 'false'); assert.equal(game.settings.store.collapsedSections?.x, undefined, 'not saved while a search is open');
});

test('typing, filters, sort and clear update this window\'s settings and redraw; unknown input never breaks it', async () => {
  const sheet = {render() { sheet.rendered = (sheet.rendered ?? 0) + 1; return null; }};
  await locs.setQuery(sheet, 'mill', 0);
  assert.equal(sheet.locUi.query, 'mill'); assert.equal(sheet.rendered, 1);
  await EDITS['loc-filter'](sheet, {dataset: {filterKey: 'threat'}, value: 'hot'});
  await EDITS['loc-sort'](sheet, {value: 'threat'});
  await ACTIONS['loc-sortdir'](sheet); await ACTIONS['loc-filters'](sheet);
  assert.deepEqual([sheet.locUi.filters, sheet.locUi.sort, sheet.locUi.sortDesc, sheet.locUi.filtersOpen], [{threat: 'hot'}, 'threat', true, true]);
  await ACTIONS['loc-clear'](sheet);
  assert.deepEqual([sheet.locUi.query, sheet.locUi.filters], ['', {}]);
  assert.equal(sheet.rendered, 6);
  // the search is debounced when typing
  const calls = []; const s2 = {render: () => calls.push('r')};
  locs.setQuery(s2, 'a', 5); locs.setQuery(s2, 'ab', 5);
  await new Promise(r => setTimeout(r, 30));
  assert.deepEqual(calls, ['r'], 'one redraw after the last key'); assert.equal(s2.locUi.query, 'ab');
});

test('controls the keyboard reaches and a redraw can find again: buttons, inputs and selects only, each with a stable key', () => {
  installGlobals({user: users.gm, modules: partner({gm: true}).modules});
  const html = tab({agTab: ID, locUi: {query: 'q', filters: {}, sort: 'name', sortDesc: false, filtersOpen: true}});
  assert.doesNotMatch(html, /<(div|span|li|a)[^>]*(data-action|onclick)=/, 'nothing clickable but buttons');
  assert.match(html, /<input type="search" data-agch-loc="query"[^>]*value="q"/);
  const keys = [...html.matchAll(/data-action="loc-fold" data-key="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(keys).size, keys.length, 'one key per folder: focus returns to the same toggle after a redraw');
  for (const m of html.matchAll(/<button type="button" class="ag-btn ag-btn--ghost[^"]*"[^>]*data-action="partner-open"[^>]*>/g)) assert.match(m[0], /aria-label="Open [^"]+"/, 'icon button has a name');
  assert.doesNotMatch(html, /Alpha|Beta|Preview|\bNew\b/);
});

test('fallbacks: no listModel keeps the embed, then the flat summary; a throwing model never breaks the tab; a refused player loses the sub-tab', () => {
  const embedLog = [];
  const noModel = {active: true, api: {listLocations: () => [{id: 'LOC-TEST-FLAT', name: '[TEST] Flat'}], openLocation() {}, open() {}}};
  installGlobals({user: users.owner, modules: {[ID]: noModel}});
  const flat = tab();
  assert.match(flat, /\[TEST\] Flat/); assert.doesNotMatch(flat, /agch-loc/);
  installGlobals({user: users.owner, modules: {[ID]: {active: true, api: {...noModel.api, embed: {modes: ['character'], mount: (el) => { embedLog.push('mount'); return {}; }}}}}});
  assert.match(tab(), /data-agch-embed="ashen-gate-locations" data-mode="character"/);
  // listModel present but not a function => treated as absent
  installGlobals({user: users.owner, modules: {[ID]: {active: true, api: {...noModel.api, listModel: 'nope'}}}});
  assert.match(tab(), /\[TEST\] Flat/);
  // throws: GM sees a note, never an exception; a player who is refused does not get an empty shell
  const boom = msg => ({active: true, api: {...noModel.api, listModel() { throw new Error(msg); }}});
  installGlobals({user: users.gm, modules: {[ID]: boom('Locations is hidden from players.')}});
  assert.match(tab(), /Not available to you right now/);
  installGlobals({user: users.owner, modules: {[ID]: boom('Locations is hidden from players.')}});
  assert.doesNotMatch(tab(), /agch-loc|data-state="error"/);
  installGlobals({user: users.gm, modules: {[ID]: boom('kaput')}});
  assert.match(tab(), /Unavailable right now/);
  // the plain tab call without a sheet (older callers) still renders
  installGlobals({user: users.owner, modules: partner().modules});
  assert.ok(ashenGateTab({actor: makeActor(), sheet: undefined}).length > 0);
});

test('Locations changing redraws open Hubs; the Hub never compares a Locations version', () => {
  const main = fs.readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  assert.match(main, /Hooks\.on\('ashen-gate-locations\.listChanged', \(\) => renderAllHubs\(\)\)/);
  const src = fs.readFileSync(new URL('../scripts/locations-list.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\.version|modules\.get\(/, 'feature-detected through the Hub\'s partnerApi only');
  assert.ok(PANELS.find(p => p.id === ID).summary, 'the flat summary is still there as the last fallback');
  assert.equal(typeof panelState, 'function');
});
