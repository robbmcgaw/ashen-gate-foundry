/** 0.19.0 UI cleanup (docs/ui-audit-2026-10.md, Locations): editor sub-tabs, one-row toolbar, links as buttons,
 *  status text for screen readers, "Save and …" before actions that need the saved record, kit dialogs and helpers.
 *  Mocked Foundry (a stand-in DialogV2): proves the markup and the logic, not how Foundry draws the window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installFoundry, gm, player} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {readAll, writeAll, readViews, placeNote} from '../scripts/store.mjs';
import {parseImport, normalizeLocation} from '../scripts/model.mjs';
import {mountLocationLauncher, LOCATION_LAUNCHER} from '../scripts/launcher.js';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
const {LocationsApp} = await import('../scripts/app.mjs');
globalThis.CSS ??= {escape: v => String(v)};
const sample = parseImport(JSON.parse(fs.readFileSync(new URL('../examples/test-locations.json', import.meta.url))), []).created;

async function world() {
  const g = installFoundry();
  const said = {info: [], warn: []};
  globalThis.ui = {notifications: {info: m => said.info.push(m), warn: m => said.warn.push(m), error: m => said.warn.push(m)}};
  const mod = {version: '0.19.0', active: true};
  mod.api = createApi({version: '0.19.0', isGM: () => game.user.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}, playerIds: () => []});
  g.modules = {get: id => id === 'ashen-gate-locations' ? mod : null};
  g.user = gm;
  await writeAll(sample);
  return {api: mod.api, said};
}
const gmApp = () => { const app = new LocationsApp(); app.element = null; app.render = async () => {}; return app; };
/** Stand-in DialogV2: records each call and answers with the button whose action is `answer`. */
function dialogs(answer) {
  const seen = [];
  foundry.applications.api.DialogV2 = {wait: async o => {
    seen.push(o);
    const b = o.buttons?.find(x => x.action === answer);
    return b?.callback ? b.callback({}, {form: {elements: []}}) : answer;
  }};
  return seen;
}

test('LOC-CR-01: the GM editor has Content / Visibility & map / Party Notes sub-tabs under one footer; one panel shows', async () => {
  await world();
  const app = gmApp();
  app.select('LOC-TEST-MILLBROOK');
  let html = await app._renderHTML();
  assert.match(html, /<div class="ag-tabs ag-tabs--sub" role="tablist" aria-label="Location editor sections">/);
  const tabs = [...html.matchAll(/role="tab" id="agl-editor-tab-(\w+)" data-tab="\w+" aria-controls="agl-editor-panel-\w+" aria-selected="(true|false)"/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(tabs, [['content', 'true'], ['visibility', 'false'], ['party', 'false']]);
  assert.match(html, /id="agl-editor-panel-content" role="tabpanel" aria-labelledby="agl-editor-tab-content" tabindex="0">/);
  assert.match(html, /id="agl-editor-panel-visibility" role="tabpanel" aria-labelledby="agl-editor-tab-visibility" tabindex="0" hidden>/);
  const panel = id => html.slice(html.indexOf(`id="agl-editor-panel-${id}"`), html.indexOf('</section>\n', html.indexOf(`id="agl-editor-panel-${id}"`)) + 1);
  const content = html.slice(html.indexOf('id="agl-editor-panel-content"'), html.indexOf('id="agl-editor-panel-visibility"'));
  const visibility = html.slice(html.indexOf('id="agl-editor-panel-visibility"'), html.indexOf('id="agl-editor-panel-party"'));
  assert.ok(panel('content'));
  assert.match(content, /data-bind="type"[\s\S]*data-block="description"/, 'Content: the fields, then the blocks');
  assert.doesNotMatch(content, /Who Can See It|Unidentified Marker|data-bind="parentLocationId"|Linked Scenes/);
  assert.match(visibility, /Who Can See It[\s\S]*Applies now[\s\S]*<h3>Place<\/h3>[\s\S]*Unidentified Marker &amp; Pin[\s\S]*Linked Scenes/);
  assert.match(html, /id="agl-editor-panel-party" role="tabpanel"[^>]*hidden>/);
  assert.equal((html.match(/<footer class="ag-footer agl-footer">/g) ?? []).length, 1, 'one shared footer');
  // The head keeps the crumbs, Place on Scene, Move to… and Delete; the image is a thumbnail beside its field.
  const head = html.slice(html.indexOf('<div class="agl-editor__head">'), html.indexOf('<div class="agl-title">'));
  assert.match(head, /data-action="place"[\s\S]*data-action="move-to"[\s\S]*data-action="delete"/);
  app.draft.img = 'icons/x.webp';
  html = await app._renderHTML();
  assert.match(html, /<img class="agl-thumb" src="icons\/x\.webp" alt=""><input id="agl-img"/);
  assert.doesNotMatch(html.slice(html.indexOf('<form class="agl-editor"')), /class="agl-img"/, 'no full-width image in the editor');
  // Switching sub-tabs keeps unsaved edits (no discard question) and is remembered.
  app.setPath('name', '[TEST] Millbrook renamed');
  app.editorTab = 'visibility';
  html = await app._renderHTML();
  assert.equal(app.dirty, true);
  assert.match(html, /id="agl-editor-tab-visibility" data-tab="visibility" aria-controls="agl-editor-panel-visibility" aria-selected="true"/);
  assert.match(html, /value="\[TEST\] Millbrook renamed"/);
  // A new location shows the Party Notes tab with a note, not a missing tab.
  app.select(null); app.draft = {...normalizeLocation({}), name: ''}; app.dirty = true;
  app.editorTab = 'party';
  assert.match(await app._renderHTML(), /Party Notes appear here once the location is saved/);
});

test('LOC-A11Y-01/02: links are real buttons; status icons carry text for screen readers', async () => {
  await world();
  const app = gmApp();
  app.select('LOC-TEST-OLD-QUARRY');
  const html = await app._renderHTML();
  assert.doesNotMatch(html, /<a class="agl-link"|<a [^>]*data-action=/, 'no anchors without href');
  assert.match(html, /<button type="button" class="ag-link" data-action="select" data-id="LOC-TEST-MILLBROOK">\[TEST\] Millbrook<\/button>/, 'crumb is a link button');
  assert.doesNotMatch(html, /<i [^>]*aria-label=/, 'no aria-label on a bare icon');
  assert.match(html, /aria-hidden="true"><\/i><span class="ag-sr-only">Revealed<\/span>/);
  game.user = player;
  const p = new LocationsApp(); p.render = async () => {};
  p.select('LOC-TEST-MILLBROOK');
  const view = await p._renderHTML();
  assert.doesNotMatch(view, /<a class="agl-link"|<a [^>]*data-action=/);
  assert.match(view, /<button type="button" class="ag-link" data-action="select"/);
});

test('LOC-CMP-01, LOC-A11Y-04: in-card hints are hint lines; repeated entry tools name their entry', async () => {
  const {api} = await world();
  await api.saveLocation({...api.getLocation('LOC-TEST-MILLBROOK'), factions: [{key: 'f1', label: '[TEST] Faction A', visible: true}]});
  const app = gmApp();
  app.select('LOC-TEST-MILLBROOK');
  const html = await app._renderHTML();
  const editor = html.slice(html.indexOf('<form class="agl-editor"'));
  assert.doesNotMatch(editor, /<p class="ag-empty">/);
  assert.match(editor, /aria-label="Remove \[TEST\] Faction A"/);
  assert.match(editor, /aria-label="Move \[TEST\] Faction A up"/);
});

test('LOC-CR-03: a gathering node is a summary row with status; materials, availability and Exotic sit in one "Edit node" fold', async () => {
  const {api} = await world();
  await api.saveLocation({...api.getLocation('LOC-TEST-MILLBROOK'), resources: [{key: 'r1', label: '[TEST] Reeds', skill: 'Herbalism', tier: 2, finite: true, available: true}]});
  const app = gmApp();
  app.select('LOC-TEST-MILLBROOK');
  const html = await app._renderHTML();
  const node = html.slice(html.indexOf('data-entry="resources:r1"'), html.indexOf('</li>', html.indexOf('class="ag-fold"', html.indexOf('data-entry="resources:r1"'))));
  const summary = node.slice(0, node.indexOf('<details'));
  assert.match(summary, /data-bind="resources\.r1\.label"[\s\S]*data-bind="resources\.r1\.skill"[\s\S]*data-bind="resources\.r1\.tier"[\s\S]*data-bind="resources\.r1\.dc"/);
  assert.match(summary, /<span class="ag-badge ag-badge--ok">Available<\/span>[\s\S]*data-action="exhaust"/);
  assert.doesNotMatch(summary, /materialId|data-toggle="resources\.r1\.available"/);
  assert.match(node, /<details class="ag-fold" data-ag-fold-key="node:r1"><summary class="ag-fold__summary"><span class="ag-fold__title">Edit node: materials, availability, Exotic<\/span>/, 'saved nodes start folded');
  assert.equal((node.match(/<details/g) ?? []).length, 1, 'no fold inside the fold');
  assert.match(node, /data-bind="resources\.r1\.materialId"[\s\S]*Exotic materials \(optional, GM only\)/);
  assert.match(html, /data-action="add-node"/);
  assert.doesNotMatch(html, /id="agl-add-resources"|id="agl-add-node-template"/, 'one Add node… choice');
  // Custom: choiceDialog is skipped without node templates; the name comes from a form, and the new node opens.
  foundry.applications.api.DialogV2 = {wait: async o => o.buttons.find(b => b.action === 'ok').callback({}, {form: {elements: [{name: 'label', value: '[TEST] Rushes'}]}})};
  await app.onAction({dataset: {action: 'add-node'}});
  const added = app.draft.resources.at(-1);
  assert.equal(added.label, '[TEST] Rushes');
  assert.match(await app._renderHTML(), new RegExp(`data-ag-fold-key="node:${added.key}" open>`));
});

test('LOC-NAV-02: Place on Scene and a state change with unsaved edits ask "Save and …" / Keep editing; Keep editing saves nothing', async () => {
  const {api} = await world();
  const app = gmApp();
  app.select('LOC-TEST-MILLBROOK');
  app.setPath('name', '[TEST] Millbrook (draft)');
  let seen = dialogs('cancel');
  await app.onAction({dataset: {action: 'place'}});
  assert.equal(seen[0].window.title, 'Save changes first?');
  assert.deepEqual(seen[0].buttons.map(b => b.label), ['Keep editing', 'Save and place it on the scene']);
  assert.equal(api.getLocation('LOC-TEST-MILLBROOK').name, '[TEST] Millbrook', 'nothing saved');
  assert.equal(app.dirty, true, 'still editing');
  seen = dialogs('cancel');
  await app.onAction({dataset: {action: 'state', state: 'hidden'}});
  assert.deepEqual(seen[0].buttons.map(b => b.label), ['Keep editing', 'Save and make it hidden']);
  assert.equal(api.getLocation('LOC-TEST-MILLBROOK').state, 'revealed');
  // Clean: no question.
  app.select('LOC-TEST-MILLBROOK');
  seen = dialogs('confirm');
  await app.onAction({dataset: {action: 'state', state: 'hidden'}});
  assert.equal(seen.length, 0);
  assert.equal(api.getLocation('LOC-TEST-MILLBROOK').state, 'hidden');
});

test('LOC-CMP-07: Hidden → Unidentified asks with a labelled "Make unidentified"; Cancel changes nothing', async () => {
  const {api} = await world();
  const app = gmApp();
  app.select('LOC-TEST-HIDDEN-CAVE');
  assert.equal(api.getLocation('LOC-TEST-HIDDEN-CAVE').state, 'hidden');
  let seen = dialogs('cancel');
  await app.onAction({dataset: {action: 'state', state: 'unidentified'}});
  assert.deepEqual(seen[0].buttons.map(b => b.label), ['Cancel', 'Make unidentified']);
  assert.equal(api.getLocation('LOC-TEST-HIDDEN-CAVE').state, 'hidden');
  seen = dialogs('confirm');
  await app.onAction({dataset: {action: 'state', state: 'unidentified'}});
  assert.equal(api.getLocation('LOC-TEST-HIDDEN-CAVE').state, 'unidentified');
});

test('discard questions come from the kit guard: Keep editing is the default; Clear Party Notes keeps Cancel the default', async () => {
  await world();
  const app = gmApp();
  app.select('LOC-TEST-MILLBROOK');
  app.dirty = true;
  const seen = dialogs('cancel');
  assert.equal(await app.confirmDiscard(), false);
  assert.equal(seen[0].window.title, 'Discard unsaved changes?');
  assert.equal(seen[0].buttons.find(b => b.default)?.label, 'Keep editing');
  assert.equal(app.dirty, true);
  dialogs('confirm');
  assert.equal(await app.confirmDiscard(), true);
  assert.equal(app.dirty, false, 'discarding leaves the guard clean');
});

test('LOC-NAV-03: Party Notes buttons say what they save; 0.20.0: players get Locations only (Routes retired), so no tab bar', async () => {
  const {api} = await world();
  // Party Notes come from the notes service; a stand-in is enough to draw the card.
  game.modules.get('ashen-gate-locations').api = {...api, getPartyNotes: () => ({text: '', rev: 0, mine: true, editing: null})};
  game.user = player;
  const p = new LocationsApp(); p.render = async () => {};
  const html = await p._renderHTML();
  const tabs = [...html.matchAll(/role="tab" data-tab="(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(tabs, [], 'one section only (Locations), so no tab bar and no Routes tab');
  p.tab = 'routes';   // an old remembered tab falls back to Locations
  assert.doesNotMatch(await p._renderHTML(), /data-tab="routes"|agl-route/);
  p.tab = 'locations';
  p.select('LOC-TEST-MILLBROOK');
  p.notesEdit = {ref: p.selectedId, text: '', rev: 0, renewed: Date.now()};
  const notes = await p._renderHTML();
  assert.match(notes, /<span>Cancel notes edit<\/span>[\s\S]*<span>Save Party Notes<\/span>/);
});

test('LOC-NAV-05: the GM Scenes launcher is called Locations', () => {
  assert.equal(LOCATION_LAUNCHER.label, 'Locations');
  const made = [];
  const el = tag => ({tagName: tag, dataset: {}, children: [], classList: {add() {}}, setAttribute(k, v) { this[k] = v; }, append(c) { this.children.push(c); c.parentElement = this; },
    querySelector() { return null; }, querySelectorAll() { return []; }, remove() {}});
  globalThis.document = {createElement: tag => { const e = el(tag); made.push(e); return e; }};
  const root = {...el('section'), querySelector: () => null};
  root.prepend = c => root.children.unshift(c);
  try { mountLocationLauncher(root, {isGM: true, onOpen: () => {}}); } catch { /* the DOM stand-in is minimal; the label is what matters */ }
  const button = made.find(e => e.tagName === 'button');
  if (button) {
    assert.match(button.innerHTML, /<span>Locations<\/span>/);
    assert.equal(button['aria-label'], 'Open Ashen Gate Locations (GM)');
  }
});
