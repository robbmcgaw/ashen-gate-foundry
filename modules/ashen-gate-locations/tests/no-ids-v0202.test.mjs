/** 0.20.2: canonical ids (LOC-*, MAT-*, NODE-*, QUEST-* ...) are never shown. Renders the GM window (list, tree, every editor
 *  sub-tab, GM Setup, Player Preview) and the player window with sample records, including broken references, and asserts
 *  no id is readable. The one place a GM sees an id is the editor's "Details" fold (with Copy id), removed before checking.
 *  Mocked Foundry: proves the markup and the messages, not how Foundry draws the window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installFoundry, gm, player} from './foundry-mock.mjs';
import {assertNoMachineText, findId} from '../../../scripts/test-helpers/no-ids.mjs';
import {createApi} from '../scripts/api.mjs';
import {readAll, writeAll, readViews, placeNote} from '../scripts/store.mjs';
import {parseImport, publishable} from '../scripts/model.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
globalThis.CSS ??= {escape: v => String(v)};
const {LocationsApp, materialsSummary} = await import('../scripts/app.mjs');
const sample = parseImport(JSON.parse(fs.readFileSync(new URL('../examples/test-locations.json', import.meta.url))), []).created;
// Broken references on purpose: an unknown quest, a deleted related place, a deleted parent, an unknown material, a missing template.
sample[0].quests = [{questId: 'QUEST-TEST-ONE'}, {questId: 'QUEST-TEST-GONE'}];
sample[0].related = [{key: 'rel1', locationId: 'LOC-TEST-DELETED', visible: true}];
sample[0].parentLocationId = 'LOC-TEST-NO-PARENT';
sample[0].resources = [...sample[0].resources, {key: 'x1', label: '', materialId: 'MAT-TEST-UNKNOWN', rareMaterialId: 'MAT-TEST-UNKNOWN-RARE', quantity: 1, rareQuantity: 1, available: true, visible: true},
  {key: 'x2', nodeId: 'NODE-TEST-GONE', available: true, visible: true}];
sample[0].sections.quests = true;
sample[0].published = publishable(sample[0]);

async function world(user) {
  const g = installFoundry();
  const notes = [];
  globalThis.ui = {notifications: {info: m => notes.push(m), warn: m => notes.push(m), error: m => notes.push(m)}};
  const quests = {listQuests: () => [{id: 'QUEST-TEST-ONE', name: '[TEST] Find the Mill', status: 'Active'}], listVisible: () => [],
    getVisibleObjective: id => id === 'QUEST-TEST-ONE' ? {id, name: '[TEST] Find the Mill'} : null, getGMSource: () => null};
  const mod = {version: '0.28.0', active: true};
  mod.api = createApi({version: '0.28.0', isGM: () => game.user.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}, playerIds: () => []});
  g.modules = {get: id => id === 'ashen-gate-locations' ? mod : id === 'ashen-gate-quest-manager' ? {active: true, api: quests} : null};
  g.items = [{name: '[TEST] Reed', flags: {}, system: {}, getFlag: () => undefined}];
  g.user = gm;
  await writeAll(sample);
  g.user = user;
  return {api: mod.api, notes};
}
/** The editor's Details fold is the one GM-only place an id may show (with Copy id). */
const withoutDetails = html => html.replace(/<details class="ag-fold"[^>]*data-ag-fold-key="details"[\s\S]*?<\/details>/, '');

test('GM window: list, tree, every editor sub-tab and GM Setup show no ids; Details keeps the id with Copy id', async () => {
  const {api} = await world(gm);
  const app = new LocationsApp();
  assertNoMachineText(withoutDetails(await app._renderHTML()), 'GM list');
  app.treeMode = true;
  assertNoMachineText(withoutDetails(await app._renderHTML()), 'GM tree');
  app.treeMode = false;
  for (const l of api.listLocations()) {
    app.select(l.id);
    for (const tab of ['content', 'visibility', 'party']) {
      app.editorTab = tab;
      const html = await app._renderHTML();
      assertNoMachineText(withoutDetails(html), `GM editor ${l.name} / ${tab}`);
    }
  }
  app.select(sample[1].id);
  const html = await app._renderHTML();
  assert.match(html, /data-ag-fold-key="details"[\s\S]*Internal id <code>LOC-/, 'GM Details fold carries the id');
  assert.match(html, /data-action="copy-id" data-value="LOC-/);
  assert.ok(findId(html) === null || /Details/.test(html));
  app.tab = 'setup';
  assertNoMachineText(withoutDetails(await app._renderHTML()), 'GM Setup');
});

test('GM editor: broken references show neutral labels, not ids', async () => {
  await world(gm);
  const app = new LocationsApp();
  app.select(sample[0].id);
  app.editorTab = 'content';
  const html = withoutDetails(await app._renderHTML());
  assertNoMachineText(html, 'GM editor with broken references');
  assert.match(html, /Unknown quest/);
  assert.match(html, /Deleted location/);
  assert.match(html, /<span class="ag-badge">Node template<\/span>/, 'a template reference shows no template id');
  assert.match(html, /Unknown material/);
  assertNoMachineText(materialsSummary({materials: {common: [{materialId: 'MAT-TEST-X'}], rare: [{materialId: 'MAT-TEST-Y'}], exotic: []}}), 'materials summary');
});

test('player window: every revealed place shows no ids', async () => {
  const {api} = await world(player);
  const app = new LocationsApp();
  assertNoMachineText(await app._renderHTML(), 'player list');
  const views = api.listVisible?.() ?? readViews();
  assert.ok(views.length > 0);
  for (const v of views) { app.select(v.key || v.id); assertNoMachineText(await app._renderHTML(), `player view ${v.name}`); }
});

test('messages name places by display name, never by id', async () => {
  const {api} = await world(gm);
  const bad = 'LOC-TEST-NOPE';
  for (const run of [() => api.markNodeExhausted(bad, 'n'), () => api.moveLocation(bad, ''), () => api.moveLocation(sample[1].id, bad), () => api.publishLocation(bad)]) {
    await assert.rejects(run, e => { assertNoMachineText(e.message, 'error message'); return true; });
  }
  await assert.rejects(() => api.markNodeExhausted(sample[1].id, 'NODE-TEST-NOPE'), e => { assertNoMachineText(e.message, 'error message'); return true; });
});

test('GM pickers show status words as plain text, not machine tokens', async () => {
  await world(gm);
  const prev = game.modules;
  const quests = {listQuests: () => [{id: 'QUEST-TEST-ONE', name: '[TEST] Find the Mill', status: 'Active', definitionStatus: 'reveal_gated'}], listVisible: () => [], getVisibleObjective: () => null, getGMSource: () => null};
  game.modules = {get: id => id === 'ashen-gate-quest-manager' ? {active: true, api: quests} : prev.get(id)};
  const app = new LocationsApp();
  app.select(sample[1].id); app.editorTab = 'content';
  const html = withoutDetails(await app._renderHTML());
  assertNoMachineText(html, 'GM editor with a reveal_gated quest');
});
