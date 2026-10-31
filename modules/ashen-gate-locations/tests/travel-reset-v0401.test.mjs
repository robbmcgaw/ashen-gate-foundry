/** 0.40.1: Reset travel day… (GM only, for testing) and the Travel tab's box radii.
 *  Mocked Foundry data; proves logic, markup and permission checks, not how the real window looks or behaves. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createApi} from '../scripts/api.mjs';
import {createOverland, useOverland, resetDay} from '../scripts/overland.mjs';
import {CONDITION_IDS} from '../scripts/overland-conditions.mjs';
import {travelHtml, previewCard} from '../scripts/overland-view.mjs';
import {resetOptionsFromForm, RESET_OPTIONS} from '../scripts/overland-reset.mjs';
import {installFoundry, gm, player} from './foundry-mock.mjs';
import {readAll, writeAll, readViews, placeNote, readOverlandSecret, writeOverlandSecret} from '../scripts/store.mjs';

const PIA = {id: 'p1', name: '[TEST] Pia', isGM: false, active: true};
const LOCS = [
  {id: 'LOC-TEST-REGION', name: '[TEST] Reach', state: 'revealed', isRegion: true, overlandConditions: {'harsh-weather': 2}},
  {id: 'LOC-TEST-CAMP', name: '[TEST] Camp', state: 'revealed', parentLocationId: 'LOC-TEST-REGION', active: true}
];
const SECRET_WORDS = /severity|conditions|mounted|announce|guidance|mitigation|harsh-weather|hard-ground|warped-paths|areaConditions/i;

function boot() {
  const world = {pub: {}, sec: {}, writes: 0, locations: structuredClone(LOCS), n: 0};
  const make = isGM => createOverland({
    isGM: () => isGM, playerTravel: () => true, read: () => structuredClone(world.pub), write: async v => { world.pub = structuredClone(v); world.writes++; },
    readSecret: () => { if (!isGM) throw new Error('Only the GM can do that.'); return structuredClone(world.sec); },
    writeSecret: async v => { if (!isGM) throw new Error('Only the GM can do that.'); world.sec = structuredClone(v); },
    actors: () => [], id: () => `e${++world.n}`, locations: () => world.locations, sendDeclare: async action => gmSvc.receiveDeclare(PIA, action)
  });
  const gmSvc = make(true), playerSvc = make(false);
  const apiFor = (svc, isGM) => createApi({version: '0.40.1', isGM: () => isGM, playerAccessEnabled: () => true, overland: svc});
  return {world, gmSvc, playerSvc, gmApi: apiFor(gmSvc, true), playerApi: apiFor(playerSvc, false)};
}
/** A busy day 4: 2 actions used, 2 journal cards, a waiting request, daily conditions (all areas and one area). */
async function busy() {
  const b = boot();
  await b.gmSvc.setArea('LOC-TEST-CAMP');
  await b.gmSvc.newDay(); await b.gmSvc.newDay(); await b.gmSvc.newDay();
  await b.gmSvc.act('travel', {text: 'one'}); await b.gmSvc.act('scout', {text: 'two'});
  await b.playerSvc.declare('explore');
  await b.gmSvc.setCondition('warped-paths', 2); await b.gmSvc.setCondition('harsh-weather', 1, {scope: 'area'});
  await b.gmSvc.setMounted(true); await b.gmSvc.setAnnounce(true);
  return b;
}

// ---- the API ----
test('resetDay is GM only in the API and again in the service; a player changes nothing', async () => {
  const {playerApi, playerSvc, gmApi, world} = await busy();
  const before = JSON.stringify([world.pub, world.sec]);
  await assert.rejects(async () => playerApi.overland.resetDay({day: 1}), /Only the GM/);
  await assert.rejects(playerSvc.resetDay({day: 1}), /Only the GM/);
  assert.equal(JSON.stringify([world.pub, world.sec]), before);
  const st = await gmApi.overland.resetDay({});
  assert.equal(st.day, 1);
});
test('defaults: day 1, actions restored, daily overlay cleared; the journal and the waiting requests stay', async () => {
  const {gmApi, world} = await busy();
  assert.deepEqual([world.pub.day, world.pub.used], [4, 2]);
  const st = await gmApi.overland.resetDay();
  assert.deepEqual([st.day, st.used, st.left], [1, 0, 3]);
  assert.deepEqual(st.conditions, Object.fromEntries(CONDITION_IDS.map(id => [id, 0])));
  assert.deepEqual(st.areaConditions, {});
  assert.deepEqual(st.journal.map(e => e.text), ['one', 'two']);
  assert.equal(st.requests.length, 1);
  assert.deepEqual([world.pub.day, world.pub.used, world.pub.journal.length, world.pub.requests.length], [1, 0, 2, 1]);
  assert.deepEqual(world.sec.areaConditions, {});
});
test('each option works on its own', async () => {
  let b = await busy(), st = await b.gmApi.overland.resetDay({day: 7, clearUsed: false, clearDaily: false});
  assert.deepEqual([st.day, st.used, st.conditions['warped-paths'], st.journal.length, st.requests.length], [7, 2, 2, 2, 1], 'nothing but the day');
  assert.deepEqual(st.areaConditions, {'LOC-TEST-CAMP': {'harsh-weather': 1}});
  b = await busy(); st = await b.gmApi.overland.resetDay({clearUsed: true, clearDaily: false});
  assert.deepEqual([st.used, st.conditions['warped-paths'], st.journal.length], [0, 2, 2], 'clearUsed only');
  b = await busy(); st = await b.gmApi.overland.resetDay({clearUsed: false, clearDaily: true});
  assert.deepEqual([st.used, st.conditions['warped-paths'], st.areaConditions, st.journal.length], [2, 0, {}, 2], 'clearDaily only');
  b = await busy(); st = await b.gmApi.overland.resetDay({clearUsed: false, clearDaily: false, clearJournal: true});
  assert.deepEqual([st.journal.length, st.used, st.requests.length, st.conditions['warped-paths']], [0, 2, 1, 2], 'clearJournal only');
  assert.deepEqual(b.world.sec.moves, []);
  b = await busy(); st = await b.gmApi.overland.resetDay({clearUsed: false, clearDaily: false, clearRequests: true});
  assert.deepEqual([st.requests.length, st.journal.length, st.used], [0, 2, 2], 'clearRequests only');
  b = await busy(); st = await b.gmApi.overland.resetDay({clearJournal: true, clearRequests: true});
  assert.deepEqual([st.day, st.used, st.journal.length, st.requests.length], [1, 0, 0, 0], 'all four');
});
test('the day is clamped to a whole number from 1', async () => {
  const {gmApi} = await busy();
  for (const [given, want] of [[undefined, 1], [0, 1], [-5, 1], [2.7, 2], ['abc', 1], ['', 1], [null, 1], [NaN, 1], ['6', 6], [12, 12], [Infinity, 1], [1e12, 99999]]) {
    assert.equal((await gmApi.overland.resetDay({day: given})).day, want, `day ${String(given)}`);
  }
  assert.equal(resetDay({day: 3, used: 2}, {day: 0}).day, 1);
});
test('it leaves the place records, persistent conditions, current area, Mounted and Announce alone; nothing secret reaches the public setting', async () => {
  const {gmApi, world} = await busy();
  const locations = JSON.stringify(world.locations);
  const st = await gmApi.overland.resetDay({day: 2, clearJournal: true, clearRequests: true});
  assert.equal(JSON.stringify(world.locations), locations);
  assert.equal(gmApi.overland.state().here.persistent['harsh-weather'], 2, 'the Reach keeps its persistent condition');
  assert.equal(st.area.id, 'LOC-TEST-CAMP'); assert.equal(st.mounted, true); assert.equal(st.announce, true);
  assert.doesNotMatch(JSON.stringify(world.pub), SECRET_WORDS);
  assert.deepEqual(Object.keys(world.pub).sort(), ['area', 'day', 'journal', 'requests', 'total', 'used']);
});
test('resetDay posts nothing to players: no chat announcement even with Announce on', async () => {
  const announced = [], pub = {}, sec = {};
  const svc = createOverland({isGM: () => true, playerTravel: () => true, read: () => structuredClone(pub), write: async v => Object.assign(pub, v), readSecret: () => structuredClone(sec), writeSecret: async v => Object.assign(sec, v),
    actors: () => [], announce: async t => announced.push(t), id: () => 'x', locations: () => LOCS});
  await svc.setAnnounce(true); await svc.resetDay({day: 5});
  assert.deepEqual(announced, []);
});

// ---- the tab and the dialog ----
const H = {esc: v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])),
  btn: (action, label, {kind = '', icon = ''} = {}) => `<button type="button" class="ag-btn${kind ? ` ag-btn--${kind}` : ''}" data-action="${action}">${icon ? '<i></i>' : ''}<span>${label}</span></button>`, now: ''};
test('the GM footer has Reset travel day… beside Undo last and New day…; there is still one primary; a player never gets it', async () => {
  const {gmSvc, playerSvc} = await busy();
  const html = travelHtml({state: gmSvc.state(), mods: gmSvc.partyModifiers(), gm: true, areas: gmSvc.areas()}, H);
  assert.match(html, /data-action="ov-reset"><i><\/i><span>Reset travel day…<\/span>/);
  assert.match(html, /data-action="ov-undo"[\s\S]*data-action="ov-reset"[\s\S]*data-action="ov-newday"/);
  assert.doesNotMatch(html.match(/<button[^>]*data-action="ov-reset"[^>]*>/)[0], /primary/);
  assert.equal((html.match(/ag-btn--primary/g) ?? []).length, 1);
  const mine = travelHtml({state: playerSvc.publicState(), gm: false, userId: 'p9'}, H);
  assert.doesNotMatch(mine, /ov-reset|Reset travel day/);
});
test('the form reader: a bad or empty day is 1; the four boxes read as booleans', () => {
  assert.deepEqual(RESET_OPTIONS.map(o => [o.name, o.checked]), [['clearJournal', false], ['clearUsed', true], ['clearRequests', false], ['clearDaily', true]]);
  assert.deepEqual(resetOptionsFromForm({day: '4', clearUsed: ['1']}), {day: 4, clearJournal: false, clearUsed: true, clearRequests: false, clearDaily: false});
  assert.equal(resetOptionsFromForm({day: 'x'}).day, 1); assert.equal(resetOptionsFromForm({day: '0'}).day, 1); assert.equal(resetOptionsFromForm(null).day, 1);
});

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
globalThis.CSS ??= {escape: v => String(v)};
const {LocationsApp} = await import('../scripts/app.mjs');
const sample = (await import('../scripts/model.mjs')).parseImport(JSON.parse(fs.readFileSync(new URL('../examples/test-locations.json', import.meta.url))), []).created;
async function windowWorld({user = gm} = {}) {
  const g = installFoundry();
  const settings = new Map([['unidentifiedLabel', 'Unknown place'], ['unknownPinImage', ''], ['travelForPlayers', true], ['overland', {}]]);
  g.settings = {get: (_, k) => settings.get(k), set: async (_, k, v) => { settings.set(k, structuredClone(v)); return v; }};
  globalThis.ui = {notifications: {info() {}, warn() {}, error() {}}};
  g.user = gm; await writeAll(sample);
  const service = createOverland({isGM: () => game.user.isGM, playerTravel: () => true, read: () => settings.get('overland'), write: v => g.settings.set('x', 'overland', v),
    readSecret: () => game.user.isGM ? readOverlandSecret() : {}, writeSecret: writeOverlandSecret, actors: () => [], id: (() => { let n = 0; return () => `w${++n}`; })()});
  useOverland(service);
  const mod = {version: '0.40.1', active: true};
  mod.api = createApi({version: '0.40.1', isGM: () => game.user.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {}, readAll, writeAll, readViews, placeNote, open() {}, openLocation() {}, playerIds: () => [], overland: service});
  g.modules = {get: id => id === 'ashen-gate-locations' ? mod : null};
  g.user = user;
  return {settings, service};
}
const appOf = () => { const app = new LocationsApp(); app.element = null; app.render = async () => {}; app.tab = 'travel'; return app; };
const formOf = (day, ticked) => ({elements: [{name: 'day', type: 'number', value: day}, ...RESET_OPTIONS.map(o => ({name: o.name, type: 'checkbox', value: '1', checked: ticked.includes(o.name)}))]});

test('window: Reset travel day… is a labelled danger confirm, Cancel is the default; Cancel changes nothing; Reset day applies the options', async () => {
  const w = await windowWorld();
  await w.service.newDay(); await w.service.newDay(); await w.service.act('travel', {text: 'kept?'}); await w.service.setCondition('warped-paths', 3);
  const app = appOf(), seen = [];
  foundry.applications.api.DialogV2 = {wait: async o => { seen.push(o); return o.buttons.find(b => b.action === 'cancel').callback(); }};
  await app.onAction({dataset: {action: 'ov-reset'}});
  assert.equal(seen[0].window.title, 'Reset travel day?');
  assert.deepEqual(seen[0].buttons.map(b => [b.label, !!b.default]), [['Cancel', true], ['Reset day', false]]);
  assert.ok(seen[0].classes.includes('ag-dialog--danger') && seen[0].classes.includes('ag-dialog--danger-confirm'));
  assert.match(seen[0].content, /name="day" value="1"/);
  assert.match(seen[0].content, /name="clearJournal" value="1">/); assert.match(seen[0].content, /name="clearUsed" value="1" checked>/);
  assert.match(seen[0].content, /name="clearRequests" value="1">/); assert.match(seen[0].content, /name="clearDaily" value="1" checked>/);
  assert.match(seen[0].content, /Clear the travel journal/); assert.match(seen[0].content, /Clear pending requests/);
  assert.deepEqual([w.settings.get('overland').day, w.settings.get('overland').used], [3, 1], 'cancelled: nothing changed');
  foundry.applications.api.DialogV2 = {wait: async o => o.buttons.find(b => b.action === 'confirm').callback(null, {form: formOf('1', ['clearUsed', 'clearDaily'])})};
  await app.onAction({dataset: {action: 'ov-reset'}});
  const pub = w.settings.get('overland');
  assert.deepEqual([pub.day, pub.used, pub.journal.length], [1, 0, 1]);
  assert.equal(readOverlandSecret().conditions['warped-paths'], 0);
  foundry.applications.api.DialogV2 = {wait: async o => o.buttons.find(b => b.action === 'confirm').callback(null, {form: formOf('9', ['clearJournal'])})};
  await app.onAction({dataset: {action: 'ov-reset'}});
  assert.deepEqual([w.settings.get('overland').day, w.settings.get('overland').journal.length], [9, 0]);
});
test('window: a player cannot reach the reset through the window either', async () => {
  const w = await windowWorld({user: player});
  const app = appOf();
  foundry.applications.api.DialogV2 = {wait: async o => o.buttons.find(b => b.action === 'confirm').callback(null, {form: formOf('5', ['clearJournal'])})};
  await app.onAction({dataset: {action: 'ov-reset'}});
  assert.equal(w.settings.get('overland').day ?? 1, 1, 'the service refused it');
});

// ---- shapes: boxes are never pills ----
test('styles: no container in locations.css takes the pill radius; the shared .agl-tile uses the kit box radius', () => {
  const css = fs.readFileSync(new URL('../styles/locations.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /radius-control|999px/, 'pill shapes come only from the kit\'s buttons, inputs and segmented controls');
  assert.match(css, /\.agl-tile\s*\{[^}]*border-radius:\s*var\(--ag-radius\);/);
  assert.match(css, /\.agl-ov-cond\s*\{[^}]*flex-wrap:\s*wrap/, 'condition rows wrap when narrow');
});
test('markup: every Travel box carries the shared agl-tile class', async () => {
  const {gmSvc} = await busy();
  const mods = gmSvc.partyModifiers(), pvReq = gmSvc.previewAction({action: 'scout'});
  const html = travelHtml({state: gmSvc.state(), mods, gm: true, areas: gmSvc.areas(), preview: pvReq}, H);
  for (const re of [/<li class="agl-tile agl-ov-cond"/, /<div class="agl-tile agl-pv__stat"/, /<fieldset class="agl-tile agl-pv__override"/, /<li class="agl-tile agl-ov-request"/, /<li class="agl-tile agl-ov-entry"/]) assert.match(html, re);
  assert.doesNotMatch(html, /<li class="agl-ov-cond"|<div class="agl-pv__stat"|<li class="agl-ov-entry"/);
  assert.match(fs.readFileSync(new URL('../scripts/app.mjs', import.meta.url), 'utf8'), /<li class="agl-tile agl-oc">/);
});
