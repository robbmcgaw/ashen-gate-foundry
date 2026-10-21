/** Scene moods (0.22.0; flags moved to the 0.35.0 stack). Proves logic with mocked Foundry globals, not native Foundry rendering. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSceneMoods, validatePreset, DEFAULT_MOODS, MOODS_SETTING, MOOD_FIELDS} from '../scripts/scene-moods.js';

const M = 'ashen-gate-manager';
const V14_PATHS = ['environment', 'environment.darknessLevel', 'environment.darknessLock', 'environment.cycle', 'environment.globalLight',
  ...['enabled', 'bright', 'luminosity', 'color'].map(f => `environment.globalLight.${f}`),
  ...['base', 'dark'].flatMap(k => ['hue', 'intensity', 'luminosity', 'saturation', 'shadows'].map(f => `environment.${k}.${f}`)), 'weather',
  'fog', 'fog.colors', 'fog.colors.explored', 'fog.colors.unexplored'];

const setPath = (obj, path, value) => {const keys = path.split('.'); const last = keys.pop(); keys.reduce((o, k) => (o[k] ??= {}), obj)[last] = value;};
const getPath = (obj, path) => path.split('.').reduce((v, k) => v?.[k], obj);

function mkScene({id = 'S1', name = '[TEST] Overland', paths = V14_PATHS, darknessLock = false} = {}) {
  const fields = new Set(paths);
  class Scene {static schema = {getField: p => fields.has(p) ? {} : undefined};}
  const scene = Object.assign(new Scene(), {id, name, updates: [], flags: {},
    environment: {darknessLevel: 0.2, darknessLock, globalLight: {enabled: true}, base: {hue: 0, intensity: 0, luminosity: 0, saturation: 0, shadows: 0},
      dark: {hue: 257 / 360, intensity: 0, luminosity: -0.25, saturation: 0, shadows: 0}},
    weather: 'fog',
    getFlag(scope, key) {return this.flags[scope]?.[key];},
    async update(data, options) {this.updates.push({data: structuredClone(data), options}); for(const [k, v] of Object.entries(data)) setPath(this, k, structuredClone(v)); return this;}
  });
  return scene;
}

function mkWorld({gm = true, scenes = [mkScene()], weather = ['leaves', 'rain', 'rainStorm', 'fog', 'snow', 'blizzard'], viewed = scenes[0]} = {}) {
  const store = {[MOODS_SETTING]: []};
  const game = {user: {isGM: gm},
    settings: {get: (ns, key) => structuredClone(store[key]), set: async (ns, key, v) => {store[key] = structuredClone(v); return v;}},
    scenes: {contents: scenes, get: id => scenes.find(s => s.id === id), active: scenes[0]}};
  const api = createSceneMoods({game, getConfig: () => ({weatherEffects: Object.fromEntries(weather.map(w => [w, {id: w}]))}), getCanvas: () => ({scene: viewed})});
  return {api, game, store, scene: scenes[0], scenes};
}

test('defaults are valid, marked default, and only use supported fields', () => {
  assert.deepEqual(DEFAULT_MOODS.map(m => m.id), ['day', 'twilight', 'windy', 'storm', 'night']);
  for(const m of DEFAULT_MOODS) {assert.deepEqual(validatePreset(m), []); assert.equal(m.isDefault, true);}
  assert.equal(DEFAULT_MOODS.find(m => m.id === 'windy').set.weather, 'leaves');
  assert.equal(DEFAULT_MOODS.find(m => m.id === 'storm').set.weather, 'rainStorm');
});

test('applying a mood sets only the fields the preset lists, in one update', async () => {
  const {api, scene} = mkWorld();
  const out = await api.applyMood('twilight');
  assert.equal(out.ok, true, out.message);
  assert.equal(scene.updates.length, 1);
  const keys = Object.keys(scene.updates[0].data).filter(k => !k.startsWith('flags.'));
  assert.deepEqual(keys.sort(), ['environment.base.hue', 'environment.base.intensity', 'environment.darknessLevel', 'weather']);
  assert.equal(scene.environment.darknessLevel, 0.45);
  assert.equal(scene.weather, '');
  assert.equal(scene.environment.globalLight.enabled, true, 'untouched field kept');
  assert.equal(scene.environment.dark.luminosity, -0.25, 'untouched field kept');
  assert.deepEqual(scene.updates[0].options, {}, 'no animation unless asked');
  assert.equal(api.getState().mood.id, 'twilight');
});

test('swapping moods keeps the originals as "before", and restore is exact', async () => {
  const {api, scene} = mkWorld();
  const before = structuredClone({environment: scene.environment, weather: scene.weather});
  await api.applyMood('twilight');
  await api.applyMood('night');
  await api.applyMood('storm');
  const stack = scene.getFlag(M, 'moodStack');
  assert.equal(stack.entries.length, 1, 'one mood at a time');
  const storm = stack.entries[0];
  assert.equal(storm.id, 'storm');
  assert.equal(storm.fields.find(f => f.path === 'environment.darknessLevel').before, 0.2, 'original darkness, not twilight');
  assert.equal(storm.fields.find(f => f.path === 'weather').before, 'fog', 'original weather');
  assert.equal(scene.environment.base.hue, 0, 'twilight hue undone when the mood was swapped');
  const out = await api.restore();
  assert.equal(out.ok, true);
  assert.deepEqual({environment: scene.environment, weather: scene.weather}, before);
  assert.equal(scene.getFlag(M, 'moodStack'), null);
  assert.equal((await api.restore()).ok, false, 'nothing to restore twice');
});

test('a missing scene field fails safely with a message and changes nothing', async () => {
  const {api, scene} = mkWorld({scenes: [mkScene({paths: V14_PATHS.filter(p => p !== 'environment.base.hue')})]});
  const out = await api.applyMood('twilight');
  assert.equal(out.ok, false);
  assert.match(out.message, /no scene field environment\.base\.hue.*Nothing changed/);
  assert.equal(scene.updates.length, 0);
});

test('a missing weather id fails safely with a message and changes nothing', async () => {
  const {api, scene} = mkWorld({weather: ['rain']});
  const out = await api.applyMood('windy');
  assert.equal(out.ok, false);
  assert.match(out.message, /Weather "leaves" is not available.*known: rain.*Nothing changed/);
  assert.equal(scene.updates.length, 0);
  assert.equal((await api.applyMood('night')).ok, true, 'No weather still works');
});

test('players are refused by every API function, and nothing is written', async () => {
  const {api, scene, store} = mkWorld({gm: false});
  for(const out of [api.listMoods(), api.getState(), await api.applyMood('day'), await api.restore(),
    await api.savePreset({id: 'x', label: 'X', set: {weather: ''}}), await api.removePreset('day'), await api.resetDefaults()]) {
    assert.equal(out.ok, false); assert.match(out.message, /Only the GM/);
  }
  assert.equal(scene.updates.length, 0);
  assert.deepEqual(store[MOODS_SETTING], []);
});

test('custom presets: add, edit, remove, validate, reset', async () => {
  const {api, scene, store} = mkWorld();
  assert.equal((await api.savePreset({id: 'foggy-dawn', label: 'Foggy dawn', set: {'environment.darknessLevel': 0.3, weather: 'fog'}})).ok, true);
  assert.equal(api.listMoods().presets.length, 6);
  assert.equal((await api.applyMood('foggy-dawn')).ok, true);
  assert.equal(scene.weather, 'fog');
  const edited = await api.savePreset({id: 'night', label: 'Deep night', set: {'environment.darknessLevel': 1}});
  assert.equal(edited.ok, true);
  const night = api.listMoods().presets.find(p => p.id === 'night');
  assert.equal(night.label, 'Deep night'); assert.equal(night.isDefault, false, 'edited default is no longer marked default');
  assert.equal((await api.removePreset('windy')).ok, true);
  assert.ok(!api.listMoods().presets.some(p => p.id === 'windy'));
  for(const bad of [{id: 'Bad Id', label: 'x', set: {weather: ''}}, {id: 'ok', label: '', set: {weather: ''}},
    {id: 'ok', label: 'x', set: {'environment.darknessLevel': 2}}, {id: 'ok', label: 'x', set: {'flags.other': 1}}, {id: 'ok', label: 'x', set: {}}]) {
    assert.equal((await api.savePreset(bad)).ok, false, JSON.stringify(bad));
  }
  assert.equal((await api.removePreset('nope')).ok, false);
  await api.resetDefaults();
  assert.deepEqual(store[MOODS_SETTING], []);
  assert.deepEqual(api.listMoods().presets.map(p => p.id), DEFAULT_MOODS.map(p => p.id));
});

test('works on a chosen scene, reports state, and passes the darkness fade option', async () => {
  const other = mkScene({id: 'S2', name: '[TEST] Cave', darknessLock: true});
  const {api, scene} = mkWorld({scenes: [mkScene(), other]});
  assert.equal(api.getState().scene.name, '[TEST] Overland');
  assert.equal(api.getState().mood, null);
  const out = await api.applyMood('night', {sceneId: 'S2', animate: 3000});
  assert.equal(out.ok, true);
  assert.match(out.message, /Darkness is locked/);
  assert.deepEqual(other.updates[0].options, {animateDarkness: 3000});
  assert.equal(scene.updates.length, 0, 'viewed scene untouched');
  const state = api.getState('S2');
  assert.equal(state.mood.id, 'night'); assert.equal(state.hasBase, true); assert.equal(state.scene.darknessLock, true);
  assert.equal((await api.applyMood('day', {sceneId: 'missing'})).ok, false);
});

test('every mood field is a known V14 Scene path', () => {
  for(const f of MOOD_FIELDS) assert.ok(V14_PATHS.includes(f.path), f.path);
});

test('Scenes tab: GM-only tab with mood buttons, Back to normal, Cancel left / Save right, labelled confirmations', async () => {
  const fs = await import('node:fs');
  const tpl = fs.readFileSync(new URL('../templates/manager.hbs', import.meta.url), 'utf8');
  const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  assert.match(tpl, /data-ag-tab="scenes"/);
  assert.match(tpl, /data-ag-mood-apply="\{\{id\}\}"/);
  assert.match(tpl, /data-ag-action="mood-restore"[^>]*>.*Back to normal/);
  assert.match(tpl, /mood-cancel">Cancel<\/button>.*\s*<button[^>]*mood-save"/);
  assert.match(tpl, /slow weaker player machines/);
  assert.match(main, /yes:`Remove \$\{noun\}`/);
  assert.match(main, /yes:'Reset moods to defaults'/);
  assert.match(main, /scenes:\(\(\{listMoods,getState,applyMood,addLayer,removeEffect,restore/);
});
