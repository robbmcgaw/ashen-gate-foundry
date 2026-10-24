/** 1.5.2: the window never goes blank, every reveal (eye) toggle works, and the GM quest picker lists hidden quests.
 *  Mocked Foundry: proves the logic and the HTML/CSS contract, not the live window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installFoundry} from './foundry-mock.mjs';
import {readAll, writeAll, readViews, placeNote} from '../scripts/store.mjs';
import {createApi} from '../scripts/api.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
globalThis.CSS ??= {escape: v => String(v)};
const {LocationsApp} = await import('../scripts/app.mjs');

let quests = null;
function boot() {
  const g = installFoundry();
  const mod = {version: '1.5.2', active: true};
  mod.api = createApi({version: '1.5.2', isGM: () => game.user.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}});
  g.modules = {get: id => id === 'ashen-gate-locations' ? mod : id === 'ashen-gate-quest-manager' && quests ? {active: true, api: quests} : null};
  return mod.api;
}
const FULL = {
  name: '[TEST] Hut', sections: {conditions: true, resources: true, factions: true, quests: true, related: true, loot: true, notes: true},
  conditions: [{key: 'c1', label: 'Fog', text: 'Thick'}], resources: [{key: 'r1', label: 'Reeds'}], factions: [{key: 'f1', label: 'Guild'}],
  quests: [{key: 'q1', questId: 'QUEST-TEST-ONE'}], loot: [{key: 'l1', label: 'Coins'}], notes: [{key: 'n1', title: 'Note', text: 'x'}]
};
async function windowFor(extra = {}) {
  const api = boot();
  const other = await api.saveLocation({name: '[TEST] Other'});
  const saved = await api.saveLocation({...FULL, related: [{key: 'rel1', locationId: other.id}], ...extra});
  const app = new LocationsApp();
  app.select(saved.id);
  app.render = async () => {};
  app.element = {querySelector: () => null};
  return app;
}

test('Add Detail, type a title, then leave the field: the draft keeps the title and the page still builds', async () => {
  const app = await windowFor();
  await app.onAction({dataset: {action: 'add-detail'}});
  const d = app.draft.details[0];
  app.setPath(`details.${d.key}.title`, 'Hidden Door');
  const html = await app._renderHTML();
  assert.match(html, /value="Hidden Door"/);
  assert.doesNotMatch(html, /Locations could not be drawn/);
  assert.equal(app.dirty, true);
});

test('reveal (eye) toggle works on a detail, loot and every other entry type, and the page still builds', async () => {
  const app = await windowFor();
  await app.onAction({dataset: {action: 'add-detail'}});
  const detail = app.draft.details[0];
  const targets = [['details', detail.key], ['loot', 'l1'], ['conditions', 'c1'], ['resources', 'r1'], ['factions', 'f1'], ['quests', 'q1'], ['related', 'rel1'], ['notes', 'n1']];
  for (const [section, key] of targets) {
    const entry = app.draft[section].find(e => e.key === key);
    assert.ok(entry, `${section} entry exists`);
    const before = entry.visible;
    assert.match(await app._renderHTML(), new RegExp(`data-toggle="${section}\\.${key}\\.visible"`), `${section} has an eye`);
    app.setPath(`${section}.${key}.visible`, !before);
    assert.equal(entry.visible, !before, `${section} toggled`);
    const html = await app._renderHTML();
    assert.doesNotMatch(html, /Locations could not be drawn/, section);
    assert.match(html, new RegExp(`data-toggle="${section}\\.${key}\\.visible"[^>]*${before ? '' : 'checked'}`), section);
  }
  app.setPath(`resources.r1.dcVisible`, true);
  assert.equal(app.draft.resources[0].dcVisible, true);
});

test('a failure while building the page shows the error with Retry instead of an empty window', async () => {
  const app = await windowFor();
  const logged = [], real = console.error;
  console.error = (...a) => logged.push(a);
  try {
    app.buildHtml = async () => { throw new Error('boom'); };
    const html = await app._renderHTML();
    assert.match(html, /Locations could not be drawn/);
    assert.match(html, /boom/);
    assert.match(html, /data-action="retry"/);
    assert.equal(logged.length, 1, 'logged to the console');
    let rendered = 0;
    app.render = async () => { rendered++; };
    await app.onAction({dataset: {action: 'retry'}});
    assert.equal(rendered, 1);
  } finally { console.error = real; }
});

test('the hidden eye checkbox is anchored inside its label so focusing it can never scroll the window away', () => {
  const css = fs.readFileSync(new URL('../styles/locations.css', import.meta.url), 'utf8');
  assert.match(css, /\.agl-eye \{[^}]*position: relative/);
  assert.match(css, /\.agl-eye input \{[^}]*position: absolute/);
});

test('GM quest picker lists every quest including Hidden and Draft ones; players only what Quest Manager shows', async () => {
  quests = {
    listQuests: () => [{id: 'QUEST-TEST-ONE', name: '[TEST] Open', status: 'Active', definitionStatus: 'approved'},
      {id: 'ORDER-TEST-HID', name: '[TEST] Hidden Order', status: 'Hidden', kind: 'order', definitionStatus: 'draft'}],
    listVisible: () => [{id: 'QUEST-TEST-ONE', name: '[TEST] Open', status: 'Active'}],
    getVisibleObjective: () => null, getGMSource: () => null
  };
  const app = await windowFor({quests: []});
  const html = await app._renderHTML();
  assert.match(html, /\[TEST\] Open \(Active\)/);
  assert.match(html, /\[TEST\] Hidden Order \(Hidden · Draft\)/);
  // GM-only method failing falls back to the visible list rather than an empty picker, and is logged.
  const warned = [], real = console.warn;
  console.warn = (...a) => warned.push(a);
  try {
    quests.listQuests = () => { throw new Error('nope'); };
    const fallback = await app._renderHTML();
    assert.match(fallback, /\[TEST\] Open/);
    assert.doesNotMatch(fallback, /Hidden Order/);
    assert.equal(warned.length >= 1, true);
  } finally { console.warn = real; }
  game.user = {id: 'p1', isGM: false};
  quests.listQuests = () => { throw new Error('GM only'); };
  assert.doesNotMatch(await new LocationsApp().buildHtml().catch(e => String(e)), /Hidden Order/);
  quests = null;
});
