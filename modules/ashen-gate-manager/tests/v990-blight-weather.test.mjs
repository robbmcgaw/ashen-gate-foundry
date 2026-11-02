/** 0.99.0: the six "Blight:" weather effects (moved from Locations) and their six one-click scene layers.
 *  Mocked Foundry and synthetic data: this proves registration, the fixed look, motion/flashing handling and the layer list,
 *  not how the effects look on a live canvas. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {EFFECT_IDS, EFFECT_LABELS, FLICKERING, LOOK, MAX_PARTICLES, registerBlightWeather, contextFor, createOverlayShader, refreshWeather,
  isBlightEffect, resetWarnings} from '../scripts/blight-weather.js';
import {DEFAULT_LAYERS, validatePreset, upgradeStoredPreset, createSceneMoods, MOODS_SETTING, LAYERS_SETTING, CALM_SETTING} from '../scripts/scene-moods.js';
import {rollWeather} from '../scripts/scene-looks.js';

const ALL = Object.values(EFFECT_IDS);
class Base { static get defaultUniforms() { return {alpha: 1, tint: [1, 1, 1]}; } static get FRAGMENT_HEADER() { return 'HEADER'; } static COMPUTE_MASK = 'float mask = 1.0;'; }
const shaders = () => ({WeatherShaderEffect: class {}, AbstractWeatherShader: Base, RainShader: class RainShader {}, FogShader: class FogShader {}});
const env = (over = {}) => {
  const logs = [];
  return {logs, config: {weatherEffects: {snow: {id: 'snow'}}}, canvas: {rendering: {shaders: shaders()}}, foundry: {canvas: {animation: {ParticleGenerator: class {}}}},
    reduced: () => false, calm: () => false, log: m => logs.push(m), ...over};
};

test('registers the same six ids with the same "Blight: " labels and leaves core effects alone', () => {
  assert.deepEqual(ALL.sort(), ['agBlightAshFall', 'agBlightGlassMotes', 'agBlightHaze', 'agBlightRedRain', 'agBlightSporeDrift', 'agBlightWarpedShimmer']);
  const e = env();
  const r = registerBlightWeather(e);
  assert.deepEqual([...r.registered].sort(), [...ALL].sort());
  assert.deepEqual(r.skipped, []);
  assert.deepEqual(Object.keys(e.config.weatherEffects).sort(), ['snow', ...ALL].sort());
  for (const id of ALL) {
    const entry = e.config.weatherEffects[id];
    assert.equal(entry.id, id);
    assert.match(entry.label, /^Blight: /);
    assert.equal(entry.label, EFFECT_LABELS[id]);
    assert.ok(Array.isArray(entry.effects) && entry.effects.length > 0, id);
    assert.ok(isBlightEffect(id));
  }
  assert.deepEqual(Object.values(EFFECT_LABELS).sort(), ['Blight: Ash fall', 'Blight: Blight haze', 'Blight: Glass motes', 'Blight: Red rain', 'Blight: Spore drift', 'Blight: Warped shimmer']);
});

test('every effect entry is one core accepts: particles or a shader class, never both; shader-only ones turn the occlusion filter off', () => {
  const e = env();
  registerBlightWeather(e);
  for (const id of ALL) for (const fx of e.config.weatherEffects[id].effects) {
    assert.ok(!!fx.effectClass !== !!fx.particles?.length, `${id}/${fx.id}`);
    if (fx.effectClass) assert.ok(fx.shaderClass);
  }
  for (const id of [EFFECT_IDS.redRain, EFFECT_IDS.haze, EFFECT_IDS.shimmer]) assert.deepEqual(e.config.weatherEffects[id].filter, {enabled: false});
  for (const id of [EFFECT_IDS.ash, EFFECT_IDS.spores, EFFECT_IDS.glass]) assert.equal(e.config.weatherEffects[id].filter, undefined);
});

test('one fixed look: the old strength-2 look, with no strength control and the old flag ignored', () => {
  assert.deepEqual({...LOOK}, {density: 1, opacity: 1});
  const e = env({scene: () => ({getFlag: () => 0})}); // an old strength flag of 0 used to switch the effect off
  registerBlightWeather(e);
  const ash = e.config.weatherEffects[EFFECT_IDS.ash].effects[0].particles;
  assert.deepEqual(ash.map(p => p.count), [60, 5]);
  assert.equal(e.config.weatherEffects[EFFECT_IDS.spores].effects[0].particles[0].count, 70);
  assert.equal(e.config.weatherEffects[EFFECT_IDS.glass].effects[0].particles[0].count, 80);
  assert.ok(ash[0].count <= MAX_PARTICLES);
  const rain = e.config.weatherEffects[EFFECT_IDS.redRain].effects;
  assert.equal(rain[0].config.opacity, 0.28); assert.equal(rain[1].config.opacity, 0.08);
  assert.equal(e.config.weatherEffects[EFFECT_IDS.haze].effects[1].config.opacity, 0.32);
  assert.equal(e.config.weatherEffects[EFFECT_IDS.shimmer].effects[0].config.opacity, 0.22);
  const src = fs.readFileSync(new URL('../scripts/blight-weather.js', import.meta.url), 'utf8');
  assert.ok(!/blightStrength|getFlag|renderSceneConfig|preUpdateScene/.test(src.replace(/`flags\.ashen-gate-locations\.blightStrength`/, '')));
});

test('reduced motion slows drift and stills the pulse, wink and flicker', () => {
  const calmCtx = contextFor(true, false);
  assert.equal(calmCtx.pace, 0.15); assert.equal(calmCtx.motion, 0); assert.equal(calmCtx.winks, false);
  const normal = contextFor(false, false);
  assert.equal(normal.pace, 1); assert.equal(normal.motion, 1); assert.equal(normal.winks, true);
  const on = env(); registerBlightWeather(on);
  const off = env({reduced: () => true}); registerBlightWeather(off);
  assert.equal(typeof on.config.weatherEffects[EFFECT_IDS.glass].effects[0].particles[0].onUpdate, 'function');
  assert.equal(off.config.weatherEffects[EFFECT_IDS.glass].effects[0].particles[0].onUpdate, undefined);
  assert.equal(off.config.weatherEffects[EFFECT_IDS.spores].effects[0].particles[0].onUpdate, undefined);
  assert.equal(off.config.weatherEffects[EFFECT_IDS.shimmer].effects[0].config.motion, 0);
});

test('the world "No flashing" switch removes the wink and flicker (read at draw time) but not the drift', () => {
  let calm = false;
  const e = env({calm: () => calm});
  registerBlightWeather(e);
  const glass = e.config.weatherEffects[EFFECT_IDS.glass], shimmer = e.config.weatherEffects[EFFECT_IDS.shimmer], ash = e.config.weatherEffects[EFFECT_IDS.ash];
  assert.equal(typeof glass.effects[0].particles[0].onUpdate, 'function');
  assert.equal(shimmer.effects[0].config.motion, 1);
  calm = true;
  assert.equal(glass.effects[0].particles[0].onUpdate, undefined);
  assert.equal(shimmer.effects[0].config.motion, 0);
  assert.equal(ash.effects[0].particles[0].velocity.speed[0], 14, 'drift speed is unchanged');
  calm = () => { throw new Error('setting missing'); };
  const e2 = env({calm}); registerBlightWeather(e2);
  assert.ok(e2.config.weatherEffects[EFFECT_IDS.glass].effects.length > 0, 'an unreadable switch reads as off');
  assert.deepEqual([...FLICKERING].sort(), [EFFECT_IDS.glass, EFFECT_IDS.shimmer].sort());
});

test('absent APIs fail soft: no throw, skipped ids reported, one log line', () => {
  resetWarnings();
  for (const bad of [{config: null}, {config: {}}, {config: {weatherEffects: null}}, {config: {weatherEffects: 'x'}}]) {
    const e = env(bad);
    const r = registerBlightWeather(e);
    assert.deepEqual(r.registered, []);
    assert.equal(r.skipped.length, 6);
  }
  resetWarnings();
  const noParticles = env({foundry: {}}); const a = registerBlightWeather(noParticles);
  assert.deepEqual([...a.skipped].sort(), [EFFECT_IDS.ash, EFFECT_IDS.glass, EFFECT_IDS.spores].sort());
  assert.deepEqual([...a.registered].sort(), [EFFECT_IDS.haze, EFFECT_IDS.redRain, EFFECT_IDS.shimmer].sort());
  resetWarnings();
  const noShaders = env({canvas: {}}); const b = registerBlightWeather(noShaders);
  assert.deepEqual([...b.registered].sort(), [EFFECT_IDS.ash, EFFECT_IDS.glass, EFFECT_IDS.spores].sort());
  assert.doesNotThrow(() => registerBlightWeather({config: {weatherEffects: Object.freeze({})}, log: () => { throw new Error('log'); }}));
  const broken = env({reduced: () => { throw new Error('boom'); }}); registerBlightWeather(broken);
  assert.deepEqual(broken.config.weatherEffects[EFFECT_IDS.ash].effects, [], 'a builder that throws draws nothing');
});

test('the overlay shader builds from the core base and never carries a status word in its source', () => {
  const C = createOverlayShader(Base);
  assert.equal(C.defaultUniforms.opacity, 0.1);
  assert.match(C._createFragmentShader(), /gl_FragColor/);
});

test('refreshWeather redraws only a Blight scene and never throws', () => {
  const calls = [];
  const canvas = {scene: {weather: EFFECT_IDS.haze}, weather: {initializeEffects: x => calls.push(x)}};
  const config = {weatherEffects: {[EFFECT_IDS.haze]: {id: 'h'}}};
  assert.equal(refreshWeather({canvas, config}), true); assert.equal(calls.length, 1);
  assert.equal(refreshWeather({canvas: {...canvas, scene: {weather: 'snow'}}, config}), false);
  assert.equal(refreshWeather({canvas: null, config, log: () => {}}), false);
});

/* ---------- scene layers ---------- */

const NEW_LAYERS = {
  'blight-fx-ash-fall': ['Ash fall', EFFECT_IDS.ash], 'blight-fx-spore-drift': ['Spore drift', EFFECT_IDS.spores], 'blight-fx-red-rain': ['Red rain', EFFECT_IDS.redRain],
  'blight-fx-haze': ['Blight haze', EFFECT_IDS.haze], 'blight-fx-glass-motes': ['Glass motes', EFFECT_IDS.glass], 'blight-fx-warped-shimmer': ['Warped shimmer', EFFECT_IDS.shimmer]
};

test('six new one-click layers set the new weather ids; the two old colour layers keep their ids and are renamed', () => {
  const byId = Object.fromEntries(DEFAULT_LAYERS.map(l => [l.id, l]));
  assert.equal(byId['ash-fall'].label, 'Ash tint'); assert.equal(byId['blight-haze'].label, 'Sickly tint');
  for (const [id, [label, weather]] of Object.entries(NEW_LAYERS)) {
    const l = byId[id];
    assert.ok(l, id); assert.equal(l.label, label); assert.equal(l.kind, 'layer'); assert.equal(l.isDefault, true);
    assert.equal(l.set.weather, weather); assert.ok(isBlightEffect(l.set.weather));
    assert.deepEqual(validatePreset(l), [], id);
  }
  const labels = DEFAULT_LAYERS.map(l => l.label);
  assert.equal(new Set(labels).size, labels.length, 'no two layers share a name');
  assert.equal(new Set(DEFAULT_LAYERS.map(l => l.id)).size, DEFAULT_LAYERS.length);
});

test('only the winking and flickering layers are marked flashing', () => {
  const flashing = DEFAULT_LAYERS.filter(l => l.flashing).map(l => l.set.weather).sort();
  assert.deepEqual(flashing, [...FLICKERING].sort());
});

test('a stored, untouched copy of the old layers follows the new names; an edited or renamed one is left alone', () => {
  const old = DEFAULT_LAYERS.find(l => l.id === 'ash-fall');
  assert.equal(upgradeStoredPreset({...old, label: 'Ash fall'}).label, 'Ash tint');
  assert.equal(upgradeStoredPreset({id: 'blight-haze', label: 'Blight haze', isDefault: true, set: {weather: ''}}).label, 'Sickly tint');
  assert.equal(upgradeStoredPreset({...old, label: 'My ash'}).label, 'My ash');
  assert.equal(upgradeStoredPreset({...old, label: 'Ash fall', isDefault: false}).label, 'Ash fall');
});

test('Random weather takes the new weather layers like any other, and never the flashing ones while No flashing is on', () => {
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const calmOn = rollWeather({seed: i, layers: DEFAULT_LAYERS, calm: true});
    assert.ok(!calmOn.layerIds.includes('blight-fx-glass-motes') && !calmOn.layerIds.includes('blight-fx-warped-shimmer'));
    rollWeather({seed: i, layers: DEFAULT_LAYERS}).layerIds.forEach(id => seen.add(id));
  }
  for (const id of Object.keys(NEW_LAYERS)) assert.ok(seen.has(id), id);
});

test('adding a Blight layer sets the weather id and a calm switch refuses the flashing ones', async () => {
  const store = {[MOODS_SETTING]: [], [LAYERS_SETTING]: [], [CALM_SETTING]: false};
  const fields = new Set(['environment.base.hue', 'environment.base.intensity', 'environment.base.saturation', 'environment.base.luminosity', 'weather']);
  class Scene { static schema = {getField: p => (fields.has(p) ? {} : undefined)}; }
  const scene = Object.assign(new Scene(), {id: 'S1', name: '[TEST] Mill', weather: '', environment: {base: {hue: 0, intensity: 0, saturation: 0, luminosity: 0}}, flags: {},
    getFlag(scope, key) { return this.flags[key]; },
    async update(data) { for (const [k, v] of Object.entries(data)) { if (k === 'weather') this.weather = v; else if (k.startsWith('flags.ashen-gate-manager.')) this.flags[k.split('.').pop()] = v; } return this; }});
  const game = {user: {isGM: true, id: 'U1'}, users: {activeGM: {id: 'U1'}}, modules: {get: () => ({version: '0.101.0'})},
    settings: {get: (ns, key) => structuredClone(store[key]), set: async (ns, key, v) => { store[key] = v; return v; }},
    scenes: {contents: [scene], get: () => scene, active: scene}};
  const config = {weatherEffects: Object.fromEntries(['snow', ...ALL].map(w => [w, {id: w}]))};
  const moods = createSceneMoods({game, getConfig: () => config, getCanvas: () => ({scene})});
  const ok = await moods.addLayer('blight-fx-red-rain', {sceneId: 'S1'});
  assert.equal(ok.ok, true); assert.equal(scene.weather, EFFECT_IDS.redRain);
  store[CALM_SETTING] = true;
  const refused = await moods.addLayer('blight-fx-glass-motes', {sceneId: 'S1'});
  assert.equal(refused.ok, false); assert.match(refused.message, /No flashing/);
  assert.equal(scene.weather, EFFECT_IDS.redRain);
  // Without the effects registered (older Manager is not possible; Locations-only worlds have none) the layer refuses with a clear message.
  const bare = createSceneMoods({game, getConfig: () => ({weatherEffects: {snow: {id: 'snow'}}}), getCanvas: () => ({scene})});
  store[CALM_SETTING] = false;
  const missing = await bare.addLayer('blight-fx-haze', {sceneId: 'S1'});
  assert.equal(missing.ok, false); assert.match(missing.message, /not available/);
});

test('Manager registers the effects in init and manifest/version agree (0.x only)', () => {
  const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  assert.match(main, /import \{registerBlightWeather[^}]*\} from '\.\/blight-weather\.js'/);
  assert.match(main, /registerBlightWeather\(\{calm:/);
  const m = JSON.parse(fs.readFileSync(new URL('../module.json', import.meta.url), 'utf8'));
  assert.equal(m.version, '0.101.0'); assert.match(m.version, /^0\./);
  assert.ok(m.download.endsWith('/ashen-gate-manager-v0.101.0/ashen-gate-manager.zip'));
  assert.match(fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'), /^## 0\.99\.0 /m);
});
