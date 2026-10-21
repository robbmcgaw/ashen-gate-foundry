/** Alpha-test fixes (0.35.1). Proves logic with mocked Foundry globals, not native Foundry rendering or the live canvas. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSceneMoods, DEFAULT_LAYERS, MOODS_SETTING, LAYERS_SETTING, upgradeStoredPreset} from '../scripts/scene-moods.js';
import {createOrganizer, describePreview, SCHEMA_SETTING, HISTORY_SETTING} from '../scripts/organize.js';

const M = 'ashen-gate-manager';
const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const tpl = read('../templates/manager.hbs');
const main = read('../scripts/main.js');

// ---- Scenes: same mock shape as v350-scene-layers ----
const V14_PATHS = ['environment', 'environment.darknessLevel', 'environment.darknessLock', 'environment.cycle', 'environment.globalLight',
  ...['enabled', 'bright', 'luminosity', 'color'].map(f => `environment.globalLight.${f}`),
  ...['base', 'dark'].flatMap(k => ['hue', 'intensity', 'luminosity', 'saturation', 'shadows'].map(f => `environment.${k}.${f}`)), 'weather',
  'fog', 'fog.colors', 'fog.colors.explored', 'fog.colors.unexplored'];
const setPath = (obj, path, value) => {const keys = path.split('.'); const last = keys.pop(); keys.reduce((o, k) => (o[k] ??= {}), obj)[last] = value;};
function mkScene({flags = {}, darkness = 0.2, cycle = true} = {}) {
  const fields = new Set(V14_PATHS);
  class Scene {static schema = {getField: p => fields.has(p) ? {} : undefined};}
  return Object.assign(new Scene(), {id: 'S1', name: '[TEST] Mill Yard', updates: [], flags: structuredClone(flags), regions: {contents: []},
    environment: {darknessLevel: darkness, darknessLock: false, cycle, globalLight: {enabled: false, bright: false, luminosity: 0, color: null},
      base: {hue: 0, intensity: 0, luminosity: 0, saturation: 0, shadows: 0}, dark: {hue: 257 / 360, intensity: 0, luminosity: -0.25, saturation: 0, shadows: 0}},
    weather: '', fog: {colors: {explored: null, unexplored: null}},
    getFlag(scope, key) {return this.flags[scope]?.[key];},
    async update(data, options) {this.updates.push({data: structuredClone(data), options}); for(const [k, v] of Object.entries(data)) setPath(this, k, structuredClone(v)); return this;}
  });
}
function mkWorld({scene = mkScene(), layers = []} = {}) {
  const store = {[MOODS_SETTING]: [], [LAYERS_SETTING]: layers};
  const game = {user: {isGM: true}, modules: {get: () => ({version: '0.35.1'})},
    settings: {get: (ns, key) => structuredClone(store[key]), set: async (ns, key, v) => {store[key] = structuredClone(v); return v;}},
    scenes: {contents: [scene], get: id => (id === scene.id ? scene : undefined), active: scene}};
  const weather = ['leaves', 'rain', 'rainStorm', 'fog', 'snow'];
  const api = createSceneMoods({game, getConfig: () => ({weatherEffects: Object.fromEntries(weather.map(w => [w, {id: w}]))}), getCanvas: () => ({scene})});
  return {api, store, scene};
}
const look = scene => structuredClone({environment: scene.environment, weather: scene.weather, fog: scene.fog});

test('1. Cold night and Blood moon turn on day/night blending, so their night tint can show', async () => {
  for(const id of ['cold-night', 'blood-moon']) {
    const preset = DEFAULT_LAYERS.find(p => p.id === id);
    assert.equal(preset.set['environment.cycle'], true, id);
    const {api, scene} = mkWorld({scene: mkScene({cycle: false, darkness: 0.9})});
    const out = await api.addLayer(id);
    assert.equal(out.ok, true, out.message);
    assert.equal(scene.environment.cycle, true, `${id}: blending was off, now on`);
    assert.doesNotMatch(out.message, /Night tint/, 'dark scene: no warning');
    await api.removeEffect(id);
    assert.equal(scene.environment.cycle, false, `${id}: removal puts blending back`);
  }
});

test('1. on a bright scene the message says the night tint only shows as it gets dark', async () => {
  const {api} = mkWorld({scene: mkScene({darkness: 0})});
  const out = await api.addLayer('blood-moon');
  assert.match(out.message, /Night tint shows only as the scene gets dark \(Darkness is 0 now\)/);
  const {api: api2} = mkWorld({scene: mkScene({darkness: 0})});
  assert.doesNotMatch((await api2.addLayer('mist')).message, /Night tint/, 'weather layer: no tint note');
});

test('1. stored 0.35.0 copies of the defaults are read as the fixed defaults; edited ones are left alone (no write)', async () => {
  const old = {id: 'cold-night', label: 'Cold night', kind: 'layer', isDefault: true, set: {'environment.dark.hue': 0.6, 'environment.dark.intensity': 0.4}};
  const edited = {id: 'blood-moon', label: 'Blood moon', kind: 'layer', isDefault: false, set: {'environment.dark.hue': 0, 'environment.dark.intensity': 0.6, 'environment.dark.saturation': 0.3}};
  assert.equal(upgradeStoredPreset(old).set['environment.cycle'], true);
  assert.equal(upgradeStoredPreset(upgradeStoredPreset(old)).set['environment.cycle'], true, 're-runnable');
  assert.equal(upgradeStoredPreset(edited), edited);
  const {api, store} = mkWorld({layers: [old, edited]});
  const layers = api.listMoods().layers;
  assert.equal(layers.find(l => l.id === 'cold-night').set['environment.cycle'], true);
  assert.equal(layers.find(l => l.id === 'blood-moon').set['environment.cycle'], undefined);
  assert.deepEqual(store[LAYERS_SETTING], [old, edited], 'setting not rewritten');
});

test('2. Robb\'s case: moods, fine-tune and more moods, then Back to normal restores the original look', async () => {
  const {api, scene} = mkWorld();
  const original = look(scene);
  await api.applyMood('night');
  assert.equal((await api.applyDraft({'environment.darknessLevel': 0.7, 'environment.dark.intensity': 0.5})).ok, true);
  await api.applyMood('day');
  await api.applyMood('storm');
  await api.addLayer('cold-night');
  await api.applyMood('night');
  await api.removeEffect('cold-night');
  assert.notDeepEqual(look(scene), original);
  const out = await api.restore();
  assert.equal(out.ok, true, out.message);
  assert.deepEqual(look(scene), original, 'darkness, tint and weather all back');
  assert.equal(scene.getFlag(M, 'moodStack'), null, 'stack cleared');
  assert.equal(api.getState().hasBase, false);
  assert.equal((await api.restore()).ok, false, 'nothing left to restore');
});

test('2. fine-tune alone can be undone with Back to normal; the first captured value wins', async () => {
  const {api, scene} = mkWorld();
  await api.applyDraft({'environment.darknessLevel': 0.8});
  await api.applyDraft({'environment.darknessLevel': 0.6});
  assert.equal(api.getState().hasBase, true, 'Back to normal is enabled after fine-tune only');
  assert.equal(scene.getFlag(M, 'moodStack').original['environment.darknessLevel'], 0.2);
  await api.restore();
  assert.equal(scene.environment.darknessLevel, 0.2);
});

test('2. removing the last layer keeps fine-tune undoable, and the stack clears itself once nothing differs', async () => {
  const {api, scene} = mkWorld();
  await api.addLayer('hearth-glow');
  await api.applyDraft({'environment.globalLight.color': '#ff0000'});
  await api.removeEffect('hearth-glow');
  assert.equal(scene.environment.globalLight.color, '#ff0000', 'single removal still keeps the fine-tune edit');
  assert.deepEqual(Object.keys(scene.getFlag(M, 'moodStack').original), ['environment.globalLight.color']);
  await api.restore();
  assert.equal(scene.environment.globalLight.color, null);
  const {api: api2, scene: s2} = mkWorld();
  await api2.addLayer('mist');
  await api2.removeEffect('mist');
  assert.equal(s2.getFlag(M, 'moodStack'), null, 'clean removal leaves no flag');
});

test('2. a 0.35.0 stack without original values still restores from the lowest entry', async () => {
  const flags = {[M]: {moodStack: {version: 1, entries: [
    {id: 'night', kind: 'mood', label: 'Night', fields: [{path: 'environment.darknessLevel', before: 0.2, after: 0.9}]},
    {id: 'pitch-black', kind: 'layer', label: 'Pitch black', fields: [{path: 'environment.darknessLevel', before: 0.9, after: 1}, {path: 'environment.globalLight.enabled', before: false, after: false}]}]}}};
  const scene = mkScene({flags, darkness: 0.7}); // fine-tuned since
  const {api} = mkWorld({scene});
  await api.restore();
  assert.equal(scene.environment.darknessLevel, 0.2);
});

test('2. Back to normal also drops the fine-tune draft in the window', () => {
  assert.match(main, /case "mood-restore": this\.moodDraft=null;/);
});

// ---- Organize ----
test('3. Organize buttons reach the organize handler, not Core Links', () => {
  assert.match(main, /case "org-preview": case "org-apply": case "org-backup": case "org-undo": case "org-clear": case "org-housekeeping": await this\.#organizeAction\(name\); break;/);
  assert.doesNotMatch(main, /case "org-housekeeping":\s*case "cl-scan"/);
});

function orgWorld({items = [], folders = [], packs = []} = {}) {
  const store = {[SCHEMA_SETTING]: [], [HISTORY_SETTING]: []};
  const game = {user: {isGM: true}, settings: {get: (ns, k) => structuredClone(store[k]), set: async (ns, k, v) => {store[k] = v;}},
    items: {contents: items}, actors: {contents: []}, journal: {contents: []}, folders: {contents: folders}, packs: {contents: packs}};
  return createOrganizer({game, updateDocuments: async () => {}, createFolder: async d => ({id: `F-${d.name}`, ...d})});
}
const ddbFolder = {id: 'FDDB', name: 'DDB Items', type: 'Item', folder: null, flags: {}};
// D&D Beyond importer items: no Ashen Gate flag, a DDB source book.
const ddbItems = Array.from({length: 3}, (_, n) => ({id: `D${n}`, name: `[TEST] DDB Item ${n}`, type: 'weapon', folder: 'FDDB', flags: {ddbimporter: {id: n}}, system: {source: {book: 'Homebrew Book'}}}));

test('3. DDB items in their own folder: Preview says why nothing moves and how to include them', async () => {
  const api = orgWorld({items: ddbItems, folders: [ddbFolder]});
  const out = await api.preview({source: 'world', types: ['Item']});
  assert.equal(out.totals.moves, 0);
  const text = describePreview(out, 'the world sidebar');
  assert.match(text, /^Nothing would move\. Checked 3 document\(s\) in the world sidebar\. 3 in your own folders \(choose Move: Refile everything to include them\)\./);
  const all = await api.preview({source: 'world', types: ['Item'], mode: 'all'});
  assert.equal(all.totals.moves, 3, 'Refile everything moves them (into Homebrew by the default rules)');
  assert.match(describePreview(all, 'the world sidebar'), /^Preview: 3 of 3 document\(s\) in the world sidebar would move/);
});

test('3. empty source and inspect-only compendium both get a message', async () => {
  assert.match(describePreview(await orgWorld().preview({source: 'world', types: ['Item']}), 'the world sidebar'), /^Nothing to check: the world sidebar has no documents/);
  const pack = {collection: 'world.ddb-items', documentName: 'Item', locked: true, metadata: {packageType: 'world', label: 'DDB Items'}, folders: {contents: []},
    getIndex: async () => ddbItems.map(d => ({...d, _id: d.id, folder: null}))};
  const out = await orgWorld({packs: [pack]}).preview({source: 'pack:world.ddb-items', types: ['Item']});
  assert.match(describePreview(out, 'DDB Items (Item)'), /would move[\s\S]*DDB Items \(Item\) is inspect-only: Compendium is locked/);
});

test('3. Preview always shows its result as a notice, and the toolbar says Organize works on a whole source', () => {
  assert.match(main, /const text=message\?\?describePreview\(out,this\.#organizeSourceLabel\(\)\);\s*this\.orgMessage=text;toast\(text\);/);
  assert.match(tpl, /Organize does not work on a single folder/);
});

// ---- Wording ----
test('4. Core Links: a scan with no core_ref items explains itself in one sentence', () => {
  assert.match(main, /noRefs:Boolean\(p&&!p\.rows\.length\)/);
  assert.match(tpl, /\{\{#if cl\.noRefs\}\}<p class="ag-empty">Nothing to link: Core Links only works on Ashen Gate items/);
});

test('5. Library empty state says what Library shows', () => {
  assert.match(tpl, /Library shows only Ashen Gate records imported through the Import tab/);
});

test('6. GM Setup explains the NPC Codex and Core sources boxes in plain words (same controls)', () => {
  assert.match(tpl, /data-ag-codex-access \{\{#if codexPlayerAccess\}\}checked\{\{\/if\}\}> Let players open the NPC Codex/);
  assert.match(tpl, /Hidden NPCs and your GM notes are never sent to them/);
  assert.match(tpl, /data-ag-setup-auto \{\{#if setup\.auto\}\}checked\{\{\/if\}\}> Find 2024 items automatically/);
  assert.match(tpl, /never changes or moves any item/);
});

test('version 0.35.1 is consistent', () => {
  const manifest = JSON.parse(read('../module.json'));
  assert.equal(manifest.version, '0.35.1');
  assert.match(manifest.download, /ashen-gate-manager-v0\.35\.1\/ashen-gate-manager\.zip$/);
  assert.match(tpl, /v0\.35\.1 Beta/);
  assert.match(main, /General Manager v0\.35\.1 Beta/);
});
