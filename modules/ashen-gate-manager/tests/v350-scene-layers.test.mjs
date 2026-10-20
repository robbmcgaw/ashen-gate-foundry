/** Scene layers, fine-tune, favourites and moods file (0.35.0). Proves logic with mocked Foundry globals, not native Foundry rendering. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSceneMoods, validatePreset, DEFAULT_LAYERS, DEFAULT_MOODS, MOODS_SETTING, LAYERS_SETTING, MOOD_FIELDS, FILE_FORMAT,
  insertEntry, removeEntry} from '../scripts/scene-moods.js';

const M = 'ashen-gate-manager';
const V14_PATHS = ['environment', 'environment.darknessLevel', 'environment.darknessLock', 'environment.cycle', 'environment.globalLight',
  ...['enabled', 'bright', 'luminosity', 'color'].map(f => `environment.globalLight.${f}`),
  ...['base', 'dark'].flatMap(k => ['hue', 'intensity', 'luminosity', 'saturation', 'shadows'].map(f => `environment.${k}.${f}`)), 'weather',
  'fog', 'fog.colors', 'fog.colors.explored', 'fog.colors.unexplored'];
const CORE_WEATHER = ['leaves', 'rain', 'rainStorm', 'fog', 'snow', 'blizzard'];

const setPath = (obj, path, value) => {const keys = path.split('.'); const last = keys.pop(); keys.reduce((o, k) => (o[k] ??= {}), obj)[last] = value;};
const getPath = (obj, path) => path.split('.').reduce((v, k) => v?.[k], obj);

function mkScene({id = 'S1', name = '[TEST] Mill Yard', flags = {}, regions = []} = {}) {
  const fields = new Set(V14_PATHS);
  class Scene {static schema = {getField: p => fields.has(p) ? {} : undefined};}
  return Object.assign(new Scene(), {id, name, updates: [], flags: structuredClone(flags), regions: {contents: regions},
    environment: {darknessLevel: 0.2, darknessLock: false, cycle: true, globalLight: {enabled: false, bright: false, luminosity: 0, color: null},
      base: {hue: 0, intensity: 0, luminosity: 0, saturation: 0, shadows: 0}, dark: {hue: 257 / 360, intensity: 0, luminosity: -0.25, saturation: 0, shadows: 0}},
    weather: '', fog: {colors: {explored: null, unexplored: null}},
    getFlag(scope, key) {return this.flags[scope]?.[key];},
    async update(data, options) {this.updates.push({data: structuredClone(data), options}); for(const [k, v] of Object.entries(data)) setPath(this, k, structuredClone(v)); return this;}
  });
}
function mkWorld({gm = true, scene = mkScene(), weather = CORE_WEATHER} = {}) {
  const store = {[MOODS_SETTING]: [], [LAYERS_SETTING]: []};
  const game = {user: {isGM: gm}, modules: {get: () => ({version: '0.35.0'})},
    settings: {get: (ns, key) => structuredClone(store[key]), set: async (ns, key, v) => {store[key] = structuredClone(v); return v;}},
    scenes: {contents: [scene], get: id => (id === scene.id ? scene : undefined), active: scene}};
  const api = createSceneMoods({game, getConfig: () => ({weatherEffects: Object.fromEntries(weather.map(w => [w, {id: w}]))}), getCanvas: () => ({scene})});
  return {api, store, scene};
}
const snapshot = scene => structuredClone({environment: scene.environment, weather: scene.weather, fog: scene.fog});

test('default layers are valid, use only V14 fields and core weather ids, and match the approved list', () => {
  assert.deepEqual(DEFAULT_LAYERS.map(l => l.label), ['Mist', 'Rain', 'Snow', 'Cold night', 'Blood moon', 'Hearth glow', 'Pitch black', 'Bright moon']);
  for(const p of [...DEFAULT_LAYERS, ...DEFAULT_MOODS]) {
    assert.deepEqual(validatePreset(p), [], p.id);
    for(const path of Object.keys(p.set)) assert.ok(V14_PATHS.includes(path), path);
    if(p.set.weather) assert.ok(CORE_WEATHER.includes(p.set.weather), p.set.weather);
  }
  for(const f of MOOD_FIELDS) assert.ok(V14_PATHS.includes(f.path), f.path);
});

test('a layer stacks on the mood; removing it puts back only its own fields', async () => {
  const {api, scene} = mkWorld();
  await api.applyMood('night');
  const out = await api.addLayer('mist');
  assert.equal(out.ok, true, out.message);
  assert.equal(scene.weather, 'fog');
  assert.equal(scene.environment.darknessLevel, 0.9);
  assert.deepEqual(Object.keys(scene.updates.at(-1).data).filter(k => !k.startsWith('flags.')), ['weather'], 'layer writes only its field');
  const state = api.getState();
  assert.equal(state.mood.id, 'night');
  assert.deepEqual(state.layers.map(l => l.id), ['mist']);
  assert.equal(state.mood.fields.find(f => f.path === 'weather').covered, true, 'mood weather is covered by Mist');
  const removed = await api.removeEffect('mist');
  assert.equal(removed.ok, true);
  assert.equal(scene.weather, '', 'back to the mood\'s weather (none)');
  assert.equal(scene.environment.darknessLevel, 0.9, 'mood untouched');
  assert.deepEqual(api.getState().layers, []);
});

test('removing a middle entry hands its "before" up; the scene changes only when the top entry goes', async () => {
  const {api, scene} = mkWorld();
  await api.applyMood('night');          // darkness 0.9
  await api.addLayer('bright-moon');     // darkness 0.65
  await api.addLayer('pitch-black');     // darkness 1
  assert.equal(scene.environment.darknessLevel, 1);
  const n = scene.updates.length;
  await api.removeEffect('bright-moon');
  assert.equal(scene.environment.darknessLevel, 1, 'still decided by Pitch black');
  assert.ok(!('environment.darknessLevel' in scene.updates[n].data), 'no darkness write');
  assert.equal(scene.environment.dark.luminosity, -0.25, 'Bright moon\'s own uncovered field restored');
  await api.removeEffect('pitch-black');
  assert.equal(scene.environment.darknessLevel, 0.9, 'back to Night, not Bright moon');
  assert.equal(scene.environment.globalLight.enabled, false);
  await api.restore();
  assert.equal(scene.environment.darknessLevel, 0.2);
});

test('swapping the mood under a layer keeps the layer visible, and removal reveals the new mood', async () => {
  const {api, scene} = mkWorld();
  await api.applyMood('night');
  await api.addLayer('rain');
  const out = await api.applyMood('windy');
  assert.equal(out.ok, true);
  assert.match(out.message, /Layers on top still decide Weather/);
  assert.equal(scene.weather, 'rain', 'Rain stays on top');
  assert.equal(scene.environment.darknessLevel, 0.1, 'Windy darkness applied');
  await api.removeEffect('rain');
  assert.equal(scene.weather, 'leaves', 'Windy weather now shows');
  await api.restore();
  assert.equal(scene.weather, '');
  assert.equal(scene.environment.darknessLevel, 0.2);
});

test('a field the GM changed since is kept on removal and Back to normal, and the message says so', async () => {
  const {api, scene} = mkWorld();
  const original = snapshot(scene);
  await api.addLayer('cold-night');
  await scene.update({'environment.dark.intensity': 0.55}); // GM edits in Scene config
  const out = await api.removeEffect('cold-night');
  assert.equal(out.ok, true);
  assert.equal(scene.environment.dark.intensity, 0.55, 'GM edit kept');
  assert.equal(scene.environment.dark.hue, original.environment.dark.hue, 'untouched-since field restored');
  assert.match(out.message, /Kept because you changed it since: Night tint intensity 0\.55/);
  assert.equal(out.kept.length, 1);
  await api.applyMood('storm');
  await scene.update({'weather': 'snow'});
  const back = await api.restore();
  assert.equal(scene.weather, 'snow');
  assert.equal(scene.environment.darknessLevel, 0.2);
  assert.match(back.message, /Weather snow/);
});

test('0.22.0 moodBase/mood flags are read as a one-entry stack, restored exactly and converted on the next write', async () => {
  const scene = mkScene({flags: {[M]: {moodBase: {capturedAt: 1, fields: [
    {path: 'environment.darknessLevel', value: 0.3}, {path: 'weather', value: 'fog'}, {path: 'environment.base.hue', value: 0.1}]},
    mood: {id: 'night', label: 'Night', appliedAt: 2}}}});
  scene.environment.darknessLevel = 0.9; scene.weather = ''; scene.environment.base.hue = 0.07;
  const {api} = mkWorld({scene});
  const state = api.getState();
  assert.equal(state.mood.id, 'night');
  assert.equal(state.hasBase, true);
  assert.equal(scene.updates.length, 0, 'reading never writes');
  await api.addLayer('mist');
  assert.equal(scene.getFlag(M, 'moodBase'), null, 'legacy flag cleared');
  assert.equal(scene.getFlag(M, 'mood'), null);
  assert.equal(scene.getFlag(M, 'moodStack').entries.length, 2);
  await api.restore();
  assert.equal(scene.environment.darknessLevel, 0.3);
  assert.equal(scene.weather, 'fog');
  assert.equal(scene.environment.base.hue, 0.1);
  assert.equal(scene.getFlag(M, 'moodStack'), null);
});

test('legacy restore with no new writes still works and clears the old flags (safe to run twice)', async () => {
  const scene = mkScene({flags: {[M]: {moodBase: {fields: [{path: 'environment.darknessLevel', value: 0.3}]}, mood: {id: 'night', label: 'Night'}}}});
  scene.environment.darknessLevel = 0.9;
  const {api} = mkWorld({scene});
  assert.equal((await api.restore()).ok, true);
  assert.equal(scene.environment.darknessLevel, 0.3);
  assert.equal(scene.getFlag(M, 'moodBase'), null);
  assert.equal((await api.restore()).ok, false, 'second run: nothing to restore');
});

test('one weather at a time: a new weather layer reports what it replaces; the same layer twice is refused', async () => {
  const {api} = mkWorld();
  await api.addLayer('mist');
  const out = await api.addLayer('rain');
  assert.match(out.message, /replaces Mist/);
  const again = await api.addLayer('rain');
  assert.equal(again.ok, false);
  assert.match(again.message, /already on/);
  assert.equal((await api.addLayer('nope')).ok, false);
});

test('unavailable weather or a missing field refuses a layer and changes nothing', async () => {
  const {api, scene} = mkWorld({weather: ['rain']});
  const out = await api.addLayer('snow');
  assert.equal(out.ok, false);
  assert.match(out.message, /Weather "snow" is not available.*Nothing changed/);
  assert.equal(scene.updates.length, 0);
});

test('fine-tune writes only changed fields, outside the stack, validates first, and a later removal keeps it', async () => {
  const {api, scene} = mkWorld();
  await api.addLayer('hearth-glow');
  const n = scene.updates.length;
  assert.equal((await api.applyDraft({'environment.darknessLevel': 3})).ok, false, 'out of range refused');
  assert.equal((await api.applyDraft({'environment.globalLight.color': 'orange'})).ok, false, 'bad colour refused');
  assert.equal((await api.applyDraft({'flags.x': 1})).ok, false, 'unknown field refused');
  assert.equal(scene.updates.length, n, 'nothing written by refusals');
  const out = await api.applyDraft({'environment.globalLight.color': '#ff0000', 'environment.darknessLevel': 0.2}, {animate: 3000});
  assert.equal(out.ok, true, out.message);
  assert.deepEqual(Object.keys(scene.updates.at(-1).data), ['environment.globalLight.color'], 'unchanged darkness not written, no flag write');
  assert.deepEqual(scene.updates.at(-1).options, {}, 'no darkness fade when darkness did not change');
  const removed = await api.removeEffect('hearth-glow');
  assert.equal(scene.environment.globalLight.color, '#ff0000', 'fine-tune edit kept');
  assert.equal(scene.environment.globalLight.enabled, false, 'other Hearth glow fields restored');
  assert.match(removed.message, /Global light colour #ff0000/);
});

test('transitions: preset transitionMs fades darkness unless the caller passes a duration', async () => {
  const {api, scene} = mkWorld();
  await api.savePreset({id: 'slow-dusk', label: 'Slow dusk', kind: 'mood', set: {'environment.darknessLevel': 0.7}, transitionMs: 10000});
  await api.applyMood('slow-dusk');
  assert.deepEqual(scene.updates.at(-1).options, {animateDarkness: 10000});
  await api.applyMood('slow-dusk', {animate: 0});
  assert.deepEqual(scene.updates.at(-1).options, {}, 'Instant wins; same darkness means no write anyway');
  await api.applyMood('night', {animate: 3000});
  assert.deepEqual(scene.updates.at(-1).options, {animateDarkness: 3000});
  await api.addLayer('mist', {animate: 3000});
  assert.deepEqual(scene.updates.at(-1).options, {}, 'no darkness change, no fade option');
  assert.deepEqual(validatePreset({id: 'x', label: 'X', set: {weather: ''}, transitionMs: 70000}).length, 1);
});

test('favourites are per scene, only for existing moods, and cleared when the last is removed', async () => {
  const {api, scene} = mkWorld();
  assert.equal((await api.toggleFavourite('night')).favourite, true);
  assert.deepEqual(api.getState().favourites, ['night']);
  assert.equal((await api.toggleFavourite('ghost')).ok, false);
  assert.equal((await api.toggleFavourite('night')).favourite, false);
  assert.equal(scene.getFlag(M, 'moodFavourites'), null);
});

test('region notes count core Suppress Weather and Adjust Darkness behaviours (read only)', () => {
  const scene = mkScene({regions: [{behaviors: {contents: [{type: 'suppressWeather'}]}}, {behaviors: {contents: [{type: 'adjustDarknessLevel'}, {type: 'suppressWeather', disabled: true}]}}]});
  const {api} = mkWorld({scene});
  assert.deepEqual(api.getState().scene.regions, {weather: 1, darkness: 1});
  assert.equal(scene.updates.length, 0);
});

test('players are refused by every new function, and nothing is written', async () => {
  const {api, scene, store} = mkWorld({gm: false});
  const file = {format: FILE_FORMAT, formatVersion: 1, presets: []};
  for(const out of [await api.addLayer('mist'), await api.removeEffect('mist'), await api.applyDraft({'weather': 'rain'}), await api.toggleFavourite('night'),
    api.exportPresets(), api.previewImport(file), await api.importPresets(file), await api.removePreset('mist', {kind: 'layer'})]) {
    assert.equal(out.ok, false); assert.match(out.message, /Only the GM/);
  }
  assert.equal(scene.updates.length, 0);
  assert.deepEqual(store, {[MOODS_SETTING]: [], [LAYERS_SETTING]: []});
});

test('layer presets: save, edit, remove, reset; moods and layers are kept apart', async () => {
  const {api, store} = mkWorld();
  assert.equal((await api.savePreset({id: 'ashfall', label: 'Ashfall', kind: 'layer', set: {'fog.colors.unexplored': '#332222'}})).ok, true);
  assert.equal(api.listMoods().layers.length, 9);
  assert.equal(api.listMoods().presets.length, 5, 'moods untouched');
  assert.deepEqual(store[MOODS_SETTING], [], 'mood setting not written');
  assert.equal((await api.removePreset('ashfall', {kind: 'layer'})).ok, true);
  assert.equal((await api.removePreset('ashfall', {kind: 'layer'})).ok, false);
  await api.resetDefaults();
  assert.deepEqual(store, {[MOODS_SETTING]: [], [LAYERS_SETTING]: []});
});

test('moods file: export shape, preview statuses, keep / replace / both, invalid skipped, scenes untouched', async () => {
  const {api, store, scene} = mkWorld({weather: ['rain', 'fog', 'snow', 'leaves', 'rainStorm']});
  const out = api.exportPresets({moods: true, layers: false});
  assert.equal(out.ok, true);
  assert.equal(out.filename, 'ashen-gate-moods.json');
  assert.equal(out.data.format, FILE_FORMAT);
  assert.equal(out.data.formatVersion, 1);
  assert.equal(out.data.exportedFrom, 'ashen-gate-manager 0.35.0');
  assert.deepEqual(out.data.presets.map(p => p.kind), ['mood', 'mood', 'mood', 'mood', 'mood']);
  assert.ok(!('isDefault' in out.data.presets[0]), 'no world-only fields in the file');
  assert.equal(api.exportPresets({moods: false, layers: false}).ok, false);

  const file = {format: FILE_FORMAT, formatVersion: 1, presets: [
    {id: 'foggy-dawn', label: 'Foggy dawn', kind: 'mood', set: {'environment.darknessLevel': 0.3, weather: 'fog'}},
    {id: 'night', label: 'Night', kind: 'mood', set: {'environment.darknessLevel': 0.9, weather: ''}},
    {id: 'storm', label: 'Wild storm', kind: 'mood', set: {'environment.darknessLevel': 0.8}},
    {id: 'mist', label: 'Thick mist', kind: 'layer', set: {weather: 'fog', 'environment.darknessLevel': 0.4}},
    {id: 'sandstorm', label: 'Sandstorm', kind: 'layer', set: {weather: 'sandstorm'}},
    {id: 'Bad Id', label: 'x', kind: 'layer', set: {weather: ''}}]};
  const preview = api.previewImport(file);
  assert.deepEqual(preview.items.map(i => i.status), ['new', 'same', 'conflict', 'conflict', 'new', 'invalid']);
  assert.equal(preview.items[4].unavailable, 'sandstorm');
  const result = await api.importPresets(file, {choices: {'mood:storm': 'replace', 'layer:mist': 'both'}});
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(result.counts, {added: 2, replaced: 1, copied: 1, kept: 1, skipped: 1});
  const list = api.listMoods();
  assert.equal(list.presets.find(p => p.id === 'storm').label, 'Wild storm');
  assert.ok(list.presets.some(p => p.id === 'foggy-dawn'));
  assert.equal(list.layers.find(p => p.id === 'mist').label, 'Mist', 'mine kept');
  assert.equal(list.layers.find(p => p.id === 'mist-2').label, 'Thick mist (imported)');
  assert.ok(list.layers.some(p => p.id === 'sandstorm'), 'unavailable weather still imports');
  assert.equal(scene.updates.length, 0, 'scenes never changed');
  assert.equal((await api.importPresets({format: 'other'})).ok, false);
  assert.equal(api.previewImport({format: FILE_FORMAT, formatVersion: 2, presets: []}).ok, false);
  const keepAll = mkWorld();
  await keepAll.api.importPresets({format: FILE_FORMAT, formatVersion: 1, presets: [{id: 'x', label: 'X', kind: 'layer', set: {weather: ''}}]});
  assert.deepEqual(keepAll.store[MOODS_SETTING], [], 'an unchanged kind is not written');
  assert.equal(keepAll.store[LAYERS_SETTING].length, 9);
});

test('pure stack helpers: insert under a higher entry and remove from the middle', () => {
  const current = new Map([['weather', '']]), writes = new Map(), kept = [];
  const entries = [];
  insertEntry(entries, 0, {id: 'rain', kind: 'layer', label: 'Rain', set: {weather: 'rain'}}, current, writes);
  insertEntry(entries, 0, {id: 'windy', kind: 'mood', label: 'Windy', set: {weather: 'leaves'}}, current, writes);
  assert.deepEqual(entries.map(e => e.fields[0]), [{path: 'weather', before: '', after: 'leaves'}, {path: 'weather', before: 'leaves', after: 'rain'}]);
  assert.equal(writes.get('weather'), 'rain', 'the covered insert wrote nothing');
  writes.clear();
  removeEntry(entries, 0, current, writes, kept);
  assert.deepEqual(entries[0].fields[0], {path: 'weather', before: '', after: 'rain'});
  assert.equal(writes.size, 0);
});

test('Scenes tab: rail, layer strip, stack with remove buttons, fine-tune Cancel left / Apply right, export and import', () => {
  const tpl = fs.readFileSync(new URL('../templates/manager.hbs', import.meta.url), 'utf8');
  const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  assert.match(tpl, /aria-label="Scenes sections"/);
  assert.match(tpl, /data-ag-layer-add="\{\{id\}\}"/);
  assert.match(tpl, /data-ag-effect-remove="\{\{kind\}\}:\{\{id\}\}"/);
  assert.match(tpl, /draft-cancel">Cancel<\/button>[\s\S]{0,400}draft-apply"/);
  assert.match(tpl, /Draft only\. Nothing changes for players until Apply\./);
  assert.match(tpl, /data-ag-action="mood-export"/);
  assert.match(tpl, /data-ag-mood-import-choice/);
  assert.match(tpl, /data-ag-mood-favourite/);
  assert.match(main, /LAYERS_SETTING,\{name:"Scene layer presets",scope:"world",config:false/);
});

test('version 0.35.0 is consistent', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../module.json', import.meta.url), 'utf8'));
  assert.equal(manifest.version, '0.35.0');
  assert.match(manifest.download, /ashen-gate-manager-v0\.35\.0\/ashen-gate-manager\.zip$/);
  assert.match(fs.readFileSync(new URL('../templates/manager.hbs', import.meta.url), 'utf8'), /v0\.35\.0 Beta/);
});
