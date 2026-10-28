/** 0.27.2: players see no threat badge on the list; the detail says "Threat Level:" before the badge; GM list unchanged. Mocked Foundry: HTML only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installFoundry, gm, player} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {readAll, writeAll, readViews, placeNote} from '../scripts/store.mjs';
import {parseImport} from '../scripts/model.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
const {LocationsApp} = await import('../scripts/app.mjs');
globalThis.CSS ??= {escape: v => String(v)};
const sample = parseImport(JSON.parse(fs.readFileSync(new URL('../examples/test-locations.json', import.meta.url))), []).created;

/** A world with the [TEST] sample, settings and notifications. Returns what was set and said. */
async function world({access = false} = {}) {
  const g = installFoundry();
  const state = {access, accessCalls: [], settings: new Map([['unidentifiedLabel', 'Unknown place'], ['unknownPinImage', ''], ['defaultLegKm', 5]]), info: [], warn: []};
  g.settings = {get: (_, k) => state.settings.get(k), set: async (_, k, v) => { state.settings.set(k, v); return v; }};
  globalThis.ui = {notifications: {info: m => state.info.push(m), warn: m => state.warn.push(m), error: m => state.warn.push(m)}};
  const mod = {version: '0.19.0', active: true};
  mod.api = createApi({version: '0.19.0', isGM: () => game.user.isGM, playerAccessEnabled: () => state.access,
    setPlayerAccess: async v => { state.accessCalls.push(v); state.access = v; }, readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}, playerIds: () => []});
  g.modules = {get: id => id === 'ashen-gate-locations' ? mod : null};
  g.user = gm;
  await writeAll(sample);
  return {api: mod.api, state};
}
/** A window whose render() only counts (the tests read _renderHTML() themselves). */
const gmApp = () => { const app = new LocationsApp(); app.element = null; app.renders = 0; app.render = async () => { app.renders++; }; return app; };

import {viewHtml, playerView} from '../scripts/model.mjs';
const BADGE = /<span class="ag-badge[^"]*agl-threat agl-threat--(\w+)">/;

test('player list: no threat badge on any row (flat, search, tree); detail: "Threat Level:" then the badge', async () => {
  await world({access: true});
  game.user = player;
  for (const mut of [() => {}, a => { a.query = 'a'; }, a => { a.treeMode = true; }]) {
    const app = gmApp(); mut(app);
    const html = await app._renderHTML();
    const list = html.slice(html.indexOf('<aside class="agl-list'), html.indexOf('</aside>'));
    assert.match(list, /agl-row/, 'rows are there');
    assert.doesNotMatch(list, /agl-threat/, 'no threat badge in the list');
  }
  const app = gmApp();
  const first = (await app._renderHTML()).match(/data-action="select" data-id="([^"]+)"/)[1];
  const withThreat = sample.map(l => l.id).filter(Boolean);
  let found = 0;
  for (const id of withThreat) {
    app.selectedId = id;
    const html = await app._renderHTML();
    const detail = html.slice(html.indexOf('<section class="agl-detail'));
    const m = detail.match(/<span class="agl-threat-label">Threat Level:<\/span> <span class="ag-badge[^"]*agl-threat agl-threat--(\w+)">/);
    if (m) { found++; assert.doesNotMatch(html.slice(0, html.indexOf('<section class="agl-detail')), /agl-threat/); }
  }
  assert.ok(found > 0 && first, 'at least one revealed sample location shows label + badge in its detail');
});

test('GM list still shows the threat badge on rows', async () => {
  await world();
  const html = await gmApp()._renderHTML();
  const list = html.slice(html.indexOf('<aside class="agl-list'), html.indexOf('</aside>'));
  assert.match(list, BADGE);
});

test('Player Preview uses the detail (label + badge); Journal page says "Threat Level: Hot"', async () => {
  await world();
  game.user = gm;
  const app = gmApp();
  const v = {key: 'k', state: 'revealed', name: '[TEST] Place', threat: 'hot', layout: []};
  assert.match(app.viewerHtml(v, {partyNotes: false}), /<span class="agl-threat-label">Threat Level:<\/span> <span class="ag-badge ag-badge--warn agl-threat agl-threat--hot">Hot<\/span>/, 'the preview renders through the same viewer');
  assert.doesNotMatch(app.viewerHtml({...v, threat: undefined}, {partyNotes: false}), /Threat/);
  assert.match(viewHtml({name: 'X', state: 'revealed', threat: 'hot'}), /<em>Threat Level: Hot<\/em>/);
  assert.doesNotMatch(viewHtml({name: 'X', state: 'revealed'}), /Threat/, 'a hidden threat stays hidden');
});
