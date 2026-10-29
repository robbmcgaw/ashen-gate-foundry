/** Renders the window's HTML in GM and player mode. Proves the templates run and what they include,
 *  not how Foundry lays them out. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installFoundry, gm, player} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {readAll, writeAll, readViews, placeNote} from '../scripts/store.mjs';
import {parseImport, publishable} from '../scripts/model.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
const {LocationsApp} = await import('../scripts/app.mjs');
const sample = parseImport(JSON.parse(fs.readFileSync(new URL('../examples/test-locations.json', import.meta.url))), []).created;
sample[0].quests = [{questId: 'QUEST-TEST-ONE'}, {questId: 'QUEST-TEST-SECRET'}];
sample[0].sections.quests = true;
sample[0].published = publishable(sample[0]);

let access = true;
async function world() {
  const game = installFoundry();
  const quests = {
    listQuests: () => [{id: 'QUEST-TEST-ONE', name: '[TEST] Find the Mill', status: 'Active'}, {id: 'QUEST-TEST-SECRET', name: '[TEST] Secret Quest', status: 'Hidden'}],
    listVisible: () => [{id: 'QUEST-TEST-ONE', name: '[TEST] Find the Mill', status: 'Active'}],
    getVisibleObjective: id => id === 'QUEST-TEST-ONE' ? {id, name: '[TEST] Find the Mill'} : null,
    getGMSource: () => null
  };
  const mod = {version: '1.0.0', active: true};
  mod.api = createApi({version: '1.0.0', isGM: () => game.user.isGM, playerAccessEnabled: () => access, setPlayerAccess: async v => { access = v; },
    readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}});
  game.modules = {get: id => id === 'ashen-gate-locations' ? mod : id === 'ashen-gate-quest-manager' ? {active: true, api: quests} : null};
  await writeAll(sample);
}

test('GM builder: list, editor with toggles, quest picker, no ID input', async () => {
  await world();
  const app = new LocationsApp();
  const html = await app._renderHTML();
  assert.match(html, /<h1><span class="ag-header__brand">Ashen Gate<\/span> \| Locations<\/h1>/);
  assert.match(html, /GM Setup/);
  for (const name of ['[TEST] Millbrook', '[TEST] Hidden Cave', '[TEST] Ash Wastes']) assert.ok(html.includes(name), name);
  assert.equal(app.selectedId, 'LOC-TEST-ASH-WASTES', 'first location by name is selected');
  app.select('LOC-TEST-MILLBROOK');
  const editor = await app._renderHTML();
  assert.match(editor, /data-action="state" data-state="revealed"/);
  assert.match(editor, /aria-pressed="true" data-action="state" data-state="revealed"/, 'current state is pressed in the segmented control');
  assert.match(editor, /aria-pressed="false" data-action="state" data-state="hidden"/);
  assert.doesNotMatch(editor, /role="radio"[^>]*data-action="state"/, 'a choice that saves and publishes is a group of pressed buttons, not a radio group (no arrow-key selecting)');
  assert.match(editor, /data-action="publish"/);
  assert.match(editor, /data-action="preview"/);
  assert.match(editor, /data-bind="unidentifiedLabel"/);
  assert.match(editor, /data-bind="parentLocationId"/);
  assert.match(editor, /data-toggle="sections\.resources" checked/);
  assert.match(editor, /GM-only Herb/, 'GM sees hidden entries');
  assert.match(editor, /\[TEST\] Secret Quest/, 'GM sees every linked quest name');
  assert.match(editor, /Save Changes/);
  assert.doesNotMatch(editor, /data-bind="id"/, 'the ID is never an input');
  app.tab = 'setup';
  assert.match(await app._renderHTML(), /Players can open Locations/);
});

test('GM new location is an unsaved draft until Save', async () => {
  await world();
  const app = new LocationsApp();
  app.draft = {...(await import('../scripts/model.mjs')).normalizeLocation({}), name: ''};
  app.dirty = true;
  const html = await app._renderHTML();
  assert.doesNotMatch(html, /data-ag-fold-key="details"/, "a new location has no id yet, so no Details fold");
  assert.equal(app.draft.id, '');
});

test('player viewer shows revealed, visible content only', async () => {
  await world();
  game.user = player;
  const app = new LocationsApp();
  const html = await app._renderHTML();
  assert.doesNotMatch(html, /GM Setup|Save Changes|data-toggle|Hidden Cave|Ash Wastes/);
  app.select('LOC-TEST-MILLBROOK');
  const view = await app._renderHTML();
  assert.match(view, /\[TEST\] Reed Bundle/);
  assert.match(view, /Unavailable/);
  assert.match(view, /\[TEST\] Find the Mill/);
  assert.doesNotMatch(view, /Secret Quest|QUEST-TEST-SECRET|GM-only Herb|smuggler|GM secret/);
  assert.match(view, /\[TEST\] Old Quarry/, 'related revealed location');
  assert.doesNotMatch(view, /LOC-TEST-HIDDEN-CAVE/);
});

test('player with Player Access off cannot render', async () => {
  await world();
  game.user = player; access = false;
  await assert.rejects(() => new LocationsApp()._renderHTML(), /hidden from players/);
  access = true;
});

test('GM node editor: inline fields, exhausted struck through with Restore; player sees badge, no DC', async () => {
  await world();
  const app = new LocationsApp();
  app.select('LOC-TEST-MILLBROOK');
  const node = app.draft.resources[0];
  Object.assign(node, {skill: 'Herbalism', tier: 2, dc: 12, exhausted: true});
  const html = await app._renderHTML();
  for (const f of ['skill', 'tier', 'dc', 'materialId', 'rareMaterialId', 'quantity', 'rareQuantity', 'note'])
    assert.match(html, new RegExp(`data-bind="resources\\.${node.key}\\.${f}"`), f);
  assert.match(html, /agl-node agl-exhausted|agl-node agl-hidden agl-exhausted/);
  assert.match(html, /data-action="restore"/);
  assert.match(html, /data-toggle="resources\.[a-z0-9]+\.dcVisible"/);
  app.setPath(`resources.${node.key}.tier`, '4');
  assert.deepEqual([node.tier, node.dc], [4, 18], 'DC follows the tier when it was the default');
  const locApi = game.modules.get('ashen-gate-locations').api;
  await locApi.saveLocation(app.draft);
  game.user = player;
  const viewer = new LocationsApp();
  viewer.select('LOC-TEST-MILLBROOK');
  assert.doesNotMatch(await viewer._renderHTML(), /Herbalism · Tier 4/, 'Save alone is private');
  game.user = gm;
  await locApi.publishLocation('LOC-TEST-MILLBROOK');
  game.user = player;
  const view = await viewer._renderHTML();
  assert.match(view, /Herbalism · Tier 4/);
  assert.match(view, /Exhausted/);
  assert.doesNotMatch(view, /DC 18/);
});

test('player: unidentified place shows only its label and teaser; children list skips the hidden one', async () => {
  await world();
  const key = readAll().find(l => l.id === 'LOC-TEST-ASH-WASTES').pinKey;
  game.user = player;
  const app = new LocationsApp();
  const list = await app._renderHTML();
  assert.match(list, /<h3[^>]*>[\s\S]*?<span>Unidentified<\/span>/, 'a collapsible Unidentified group (0.32.0)');
  assert.doesNotMatch(list, /Ash Wastes|ASH-WASTES|Hidden Cave|HIDDEN-CAVE/);
  app.select(key);   // what a click on its Map Note does
  const view = await app._renderHTML();
  assert.match(view, /\[TEST\] Smoke on the horizon/);
  assert.match(view, /A grey haze hangs over the far hills/);
  assert.doesNotMatch(view, /Ash Wastes|Cinder Moss|Far Reach|Wilderness|LOC-TEST-ASH/);
  app.select('LOC-TEST-ASH-WASTES');
  assert.equal(app.selectedId, null, 'its LOC id opens nothing');
  app.select('LOC-TEST-MILLBROOK');
  const mill = await app._renderHTML();
  assert.match(mill, /Places Here/);
  assert.match(mill, /\[TEST\] Old Quarry/);
  assert.doesNotMatch(mill, /Hidden Cave/);
});

test('GM: nesting picker offers no place that would loop; state shown on rows', async () => {
  await world();
  const app = new LocationsApp();
  app.select('LOC-TEST-MILLBROOK');
  const html = await app._renderHTML();
  const picker = html.slice(html.indexOf('id="agl-parent"'), html.indexOf('</select>', html.indexOf('id="agl-parent"')));
  assert.doesNotMatch(picker, /Old Quarry|Hidden Cave|value="LOC-TEST-MILLBROOK"/, 'its own children and itself are not offered');
  assert.doesNotMatch(picker, /Ash Wastes/, '0.32.1: only Regions are offered, and Ash Wastes is not one');
  assert.match(html, /Places inside/);
  assert.match(html, /fa-circle-question agl-row__rev" data-tooltip="Unidentified"/);
  assert.match(html, /data-action="new-child"/);
});
