/** 0.47.0 smart icons through the Import tab: preview picks, Change… respected by Apply, flags, re-import never
 *  overwriting a GM edit, placeholders filled, Re-pick only on request. Synthetic [TEST] records; mocked Foundry and
 *  FilePicker: proves the handler logic, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {FAKE_ICONS, fakeTree} from './fixtures/smart-icons-fixture.mjs';

const M = 'ashen-gate-manager';
const record = (id, name, img, type = 'loot') => ({id, entity_type: 'Material', status: 'approved', version: '1.0.0',
  provenance: {source: '[TEST] smart icons'}, visibility: 'player', refs: [],
  foundry: {document_type: 'Item', data: {name, type, ...(img === undefined ? {} : {img}), system: {description: {value: '<p>[TEST] synthetic</p>'}}}}});
const PACKAGE = {manifest: {schema_version: 'ag-foundry-import/0.1', package_id: 'AG-TEST-SMART-ICONS', version: '1.0.0'}, records: [
  record('MAT-TEST-CALTROPS', '[TEST] Iron Caltrops'),
  record('MAT-TEST-DRAUGHT', '[TEST] Healing Draught', 'icons/svg/item-bag.svg', 'consumable'),
  record('MAT-TEST-NOTES', '[TEST] Old Notes', 'icons/sundries/scrolls/scroll-bound-brown.webp'),
  record('MAT-TEST-SHIELD', '[TEST] Oak Shield'),
  record('MAT-TEST-REMOTE', '[TEST] Remote Art', 'https://example.test/art.webp'),
  record('MAT-TEST-LANTERN', '[TEST] Brass Lantern'),
]};

function collection() {
  const contents = [];
  return {contents, get(id) { return contents.find(x => x.id === id); }, values() { return contents.values(); }, filter(fn) { return contents.filter(fn); }, find(fn) { return contents.find(fn); }};
}
function setPath(object, dotted, value) {
  const parts = dotted.split('.'); let cur = object;
  for (const part of parts.slice(0, -1)) cur = cur[part] ??= {};
  cur[parts.at(-1)] = structuredClone(value);
}
function makeDocument(documentName, data, index) {
  const doc = {...structuredClone(data), id: `agmock${index}`, documentName, uuid: `${documentName}.agmock${index}`};
  doc.getFlag = (ns, key) => doc.flags?.[ns]?.[key] ?? null;
  doc.setFlag = async (ns, key, value) => { doc.flags ??= {}; doc.flags[ns] ??= {}; doc.flags[ns][key] = structuredClone(value); };
  doc.unsetFlag = async (ns, key) => { if (doc.flags?.[ns]) delete doc.flags[ns][key]; };
  doc.update = async changes => { for (const [k, v] of Object.entries(changes)) setPath(doc, k, v); return doc; };
  doc.toObject = () => structuredClone(Object.fromEntries(Object.entries(doc).filter(([, v]) => typeof v !== 'function')));
  doc.testUserPermission = () => true;
  return doc;
}
const el = (dataset = {}) => ({dataset, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }});

function installMockFoundry() {
  const instances = []; let nextId = 0;
  const collections = {items: collection(), journal: collection(), actors: collection(), tables: collection(), macros: collection(), folders: collection()};
  const callbacks = {once: new Map(), on: new Map()};
  const actions = ['preview', 'select', 'apply'].map(agAction => el({agAction}));
  const fileInput = {files: [], value: '', listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }};
  const fileButton = {disabled: false, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }};
  const fileWrap = {dataset: {agFileKind: 'import'}, querySelector(s) { return s === '[data-ag-file-button]' ? fileButton : s === 'input[type="file"]' ? fileInput : null; }};
  const controls = {profile: Object.assign(el(), {value: 'session-safe'}), repick: el(), smart: el()};
  const iconChange = [];
  const root = {style: {setProperty() {}}, dataset: {}, classList: {add() {}, remove() {}, contains() { return false; }},
    querySelector(s) { return s === '[data-ag-profile]' ? controls.profile : s === '[data-ag-repick-icons]' ? controls.repick : s === '[data-ag-smart-icons]' ? controls.smart : null; },
    querySelectorAll(s) { return s === '[data-ag-action]' ? actions : s === '.ag-file' ? [fileWrap] : s === '[data-ag-icon-change]' ? iconChange : []; }};
  class ApplicationV2 { constructor() { instances.push(this); this.element = root; } async render() { this.rendered = true; return this; } async _onRender() {} }
  const byType = {Item: collections.items, JournalEntry: collections.journal, Actor: collections.actors, RollTable: collections.tables, Macro: collections.macros};
  for (const [type, target] of Object.entries(byType)) globalThis[type] = {create: async data => { const doc = makeDocument(type, data, ++nextId); target.contents.push(doc); return doc; }};
  globalThis.Folder = {create: async data => { const doc = {...structuredClone(data), id: `agfolder${collections.folders.contents.length + 1}`}; collections.folders.contents.push(doc); return doc; }};
  const settings = new Map();
  const managerModule = {id: M, api: null};
  globalThis.game = {user: {isGM: true, id: 'v470-gm'}, world: {id: 'v470-mock'}, modules: new Map([[M, managerModule]]), ...collections,
    settings: {menus: new Map(), register() {}, registerMenu(_n, key, value) { this.menus.set(key, value); }, get(_n, key) { return settings.get(key); }, async set(_n, key, value) { settings.set(key, structuredClone(value)); }}, packs: new Map()};
  globalThis.Hooks = {on: (n, fn) => callbacks.on.set(n, fn), off() {}, once: (n, fn) => callbacks.once.set(n, fn)};
  const tree = fakeTree(FAKE_ICONS);
  class FilePicker { constructor(options) { this.options = options; FilePicker.opened.push(options); } render() { this.options.callback(FilePicker.nextPick); return this; } }
  FilePicker.opened = []; FilePicker.nextPick = null; FilePicker.browse = tree.browse;
  globalThis.foundry = {applications: {api: {ApplicationV2, HandlebarsApplicationMixin: Base => class extends Base {}, DialogV2: {confirm: async () => true}}, apps: {FilePicker: {implementation: FilePicker}}},
    utils: {deepClone: structuredClone, randomID: () => `ag-r${++nextId}`}};
  globalThis.CONST = {DOCUMENT_OWNERSHIP_LEVELS: {NONE: 0}};
  globalThis.ui = {notifications: {info() {}, error(message) { throw new Error(message); }}};
  globalThis.fetch = async () => ({ok: true, status: 200});
  globalThis.CSS ??= {escape: s => String(s).replace(/"/g, '\\"')};
  return {callbacks, collections, instances, managerModule, actions, fileInput, controls, iconChange, settings, FilePicker, tree};
}
async function pick(runtime, payload) {
  const text = JSON.stringify(payload);
  runtime.fileInput.files = [{name: 'AG_Test_SmartIcons.json', size: text.length, text: async () => text}];
  runtime.fileInput.value = 'AG_Test_SmartIcons.json';
  await runtime.fileInput.listeners.change();
}
async function waitFor(predicate, message) {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 5)); }
  assert.fail(message);
}
const click = (runtime, name) => runtime.actions.find(a => a.dataset.agAction === name).listeners.click({preventDefault() {}});
const row = (app, id) => app.preview.find(r => r.id === id);
const docOf = (runtime, id) => runtime.collections.items.contents.find(d => d.flags?.[M]?.source?.sourceId === id);

test('0.47.0: import picks smart icons, keeps authored ones, respects Change…, and re-import never overwrites a GM edit', async () => {
  const runtime = installMockFoundry();
  await import(`../scripts/main.js?v470=${Date.now()}${Math.random()}`);
  runtime.callbacks.once.get('init')?.();
  runtime.callbacks.once.get('ready')?.();
  await runtime.managerModule.api.open();
  const app = runtime.instances.at(-1);
  await app._onRender({}, {});
  await pick(runtime, PACKAGE);
  assert.deepEqual(app.errors, []);
  // The preview never waits for the index: picks fill in when it is ready.
  await waitFor(() => app.preview.length && app.preview.every(r => !r.icon?.pending), 'icon index never became ready');
  assert.match(row(app, 'MAT-TEST-CALTROPS').icon.img, /^icons\/environment\/traps\//);
  assert.equal(row(app, 'MAT-TEST-CALTROPS').icon.source, 'smart');
  assert.match(row(app, 'MAT-TEST-DRAUGHT').icon.img, /^icons\/consumables\/potions\//);
  assert.equal(row(app, 'MAT-TEST-NOTES').icon, null, 'an authored icon (even a generic one) is not offered for change');
  assert.equal(row(app, 'MAT-TEST-REMOTE').icon, null, 'a remote URL is not offered for change');
  assert.ok(!runtime.tree.calls.some(c => c.includes('icons/svg')));

  // Change… on the shield row: the FilePicker's choice is what Apply writes.
  runtime.iconChange.push(el({agIconChange: 'MAT-TEST-SHIELD'}));
  await app._onRender({}, {});
  runtime.FilePicker.nextPick = 'icons/custom/picked-shield.webp';
  runtime.iconChange[0].listeners.click({preventDefault() {}});
  assert.equal(runtime.FilePicker.opened.at(-1).type, 'image');
  assert.equal(row(app, 'MAT-TEST-SHIELD').icon.img, 'icons/custom/picked-shield.webp');
  runtime.iconChange.length = 0;

  await click(runtime, 'select');
  await waitFor(() => app.selected.size === 6, 'select did not pick all records');
  await click(runtime, 'apply');
  await waitFor(() => runtime.settings.has('importHistory') && !app.busy, 'import did not finish');
  const results = runtime.settings.get('importHistory').at(-1).results;
  assert.deepEqual(results.filter(r => r.status === 'error'), []);
  const caltrops = docOf(runtime, 'MAT-TEST-CALTROPS'), draught = docOf(runtime, 'MAT-TEST-DRAUGHT'), notes = docOf(runtime, 'MAT-TEST-NOTES'),
    shield = docOf(runtime, 'MAT-TEST-SHIELD'), remote = docOf(runtime, 'MAT-TEST-REMOTE'), lantern = docOf(runtime, 'MAT-TEST-LANTERN');
  assert.match(caltrops.img, /traps/);
  assert.deepEqual([caltrops.flags[M].iconSource, caltrops.flags[M].iconPath], ['smart', caltrops.img]);
  assert.match(draught.img, /potions/); assert.equal(draught.flags[M].iconSource, 'smart');
  assert.equal(notes.img, 'icons/sundries/scrolls/scroll-bound-brown.webp'); assert.equal(notes.flags[M].iconSource, 'authored');
  assert.equal(shield.img, 'icons/custom/picked-shield.webp'); assert.equal(shield.flags[M].iconSource, 'authored');
  assert.equal(remote.img, 'https://example.test/art.webp');
  assert.match(lantern.img, /lights/);
  assert.equal(results.filter(r => r.action === 'icon-smart').length, 3);
  assert.match(app.message, /chose 3 icon\(s\)/);

  // Re-import, nothing changed in the source: Manager's own picks are not GM edits, so nothing to do.
  await pick(runtime, PACKAGE);
  await waitFor(() => app.preview.length === 6, 'preview');
  for (const id of PACKAGE.records.map(r => r.id)) assert.equal(row(app, id).action, 'unchanged', `${id}: ${row(app, id).reason}`);

  // The GM changes the caltrops icon; the lantern goes back to a placeholder; the draught has an older Manager pick.
  caltrops.img = 'icons/gm/my-caltrops.webp';
  lantern.img = 'icons/svg/item-bag.svg';
  draught.img = 'icons/consumables/potions/old-pick.webp'; draught.flags[M].iconPath = draught.img;
  await click(runtime, 'preview');
  assert.equal(row(app, 'MAT-TEST-CALTROPS').action, 'unchanged'); assert.equal(row(app, 'MAT-TEST-CALTROPS').icon, null);
  assert.equal(row(app, 'MAT-TEST-LANTERN').action, 'icon', 'a world placeholder is filled');
  assert.equal(row(app, 'MAT-TEST-DRAUGHT').action, 'unchanged', 'an earlier Manager pick stays without Re-pick');
  // Re-pick smart icons: only Manager's own pick is redone; the GM's icon is still left alone.
  await app._onRender({}, {});
  runtime.controls.repick.listeners.change({target: {checked: true}});
  assert.equal(row(app, 'MAT-TEST-DRAUGHT').action, 'icon');
  assert.equal(row(app, 'MAT-TEST-CALTROPS').icon, null);
  await click(runtime, 'select');
  assert.deepEqual([...app.selected].sort(), ['MAT-TEST-DRAUGHT', 'MAT-TEST-LANTERN']);
  await click(runtime, 'apply');
  await waitFor(() => !app.busy && runtime.settings.get('importHistory').length === 2, 'second import did not finish');
  assert.equal(caltrops.img, 'icons/gm/my-caltrops.webp', 'GM edit kept');
  assert.match(lantern.img, /lights/); assert.equal(lantern.flags[M].iconSource, 'smart');
  assert.match(draught.img, /^icons\/consumables\/potions\/(?!old-pick)/); assert.equal(draught.flags[M].iconPath, draught.img);
  assert.deepEqual(runtime.settings.get('importHistory').at(-1).results.filter(r => r.status === 'error'), []);

  // A later package that authors a real icon replaces Manager's pick (the normal update), and the flag says authored.
  const authored = structuredClone(PACKAGE);
  authored.records[5].foundry.data.img = 'icons/sundries/lights/lantern-iron.webp';
  authored.records[5].version = '1.0.1';
  await pick(runtime, authored);
  await waitFor(() => app.preview.length === 6, 'preview');
  assert.equal(row(app, 'MAT-TEST-LANTERN').action, 'update', row(app, 'MAT-TEST-LANTERN').reason);
});
