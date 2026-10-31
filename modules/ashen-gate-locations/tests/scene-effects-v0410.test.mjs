/** 0.41.0: the six "Blight:" scene effects, the optional per-scene strength and its GM-only guard.
 *  Mocked Foundry: this proves registration, mapping and guards, not how the effects look in a live canvas. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MODULE_ID} from '../scripts/model.mjs';
import {EFFECT_IDS, EFFECT_LABELS, MAX_PARTICLES, DENSITY, OPACITY, DEFAULT_STRENGTH, registerSceneEffects, strengthOf, contextFor, createOverlayShader,
  guardStrengthChange, strengthChanged, refreshWeather, addStrengthField, strengthFieldHtml, isBlightEffect, resetWarnings} from '../scripts/scene-effects.mjs';

const ALL = Object.values(EFFECT_IDS);
const sceneWith = value => ({id: 's1', getFlag: (scope, key) => (scope === MODULE_ID && key === 'blightStrength' ? value : undefined)});

class Base { static get defaultUniforms() { return {alpha: 1, tint: [1, 1, 1]}; } static get FRAGMENT_HEADER() { return 'HEADER'; } static COMPUTE_MASK = 'float mask = 1.0;'; }
const shaders = () => ({WeatherShaderEffect: class {}, AbstractWeatherShader: Base, RainShader: class RainShader {}, FogShader: class FogShader {}});
const env = (over = {}) => {
  const logs = [];
  return {logs, config: {weatherEffects: {snow: {id: 'snow'}}}, canvas: {rendering: {shaders: shaders()}}, foundry: {canvas: {animation: {ParticleGenerator: class {}}}},
    scene: () => sceneWith(undefined), reduced: () => false, log: m => logs.push(m), ...over};
};
const build = (e, id) => { registerSceneEffects(e); return e.config.weatherEffects[id]; };

test('registers all six when CONFIG.weatherEffects exists, with the "Blight: " labels, and leaves the core effects alone', () => {
  const e = env();
  const r = registerSceneEffects(e);
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
  assert.deepEqual(Object.values(EFFECT_LABELS).sort(), ['Blight: Ash fall', 'Blight: Blight haze', 'Blight: Glass motes', 'Blight: Red rain',
    'Blight: Spore drift', 'Blight: Warped shimmer']);
});

test('every effect entry is one core accepts: particles or a shader class, never both', () => {
  const e = env();
  registerSceneEffects(e);
  for (const id of ALL) for (const fx of e.config.weatherEffects[id].effects) {
    const hasShader = !!fx.effectClass, hasParticles = !!fx.particles?.length;
    assert.ok(hasShader !== hasParticles, `${id}/${fx.id}`);
    assert.ok(fx.id);
    if (hasShader) assert.ok(fx.shaderClass, `${id}/${fx.id} shaderClass`);
  }
  // Shader-only ambiences turn the layer occlusion filter off, like core rain, snow and fog.
  for (const id of [EFFECT_IDS.redRain, EFFECT_IDS.haze, EFFECT_IDS.shimmer]) assert.deepEqual(e.config.weatherEffects[id].filter, {enabled: false});
  for (const id of [EFFECT_IDS.ash, EFFECT_IDS.spores, EFFECT_IDS.glass]) assert.equal(e.config.weatherEffects[id].filter, undefined);
});

test('an absent API is a no-op: no throw, nothing added, one log line', () => {
  resetWarnings();
  for (const bad of [{config: undefined}, {config: {}}, {config: {weatherEffects: null}}, {config: {weatherEffects: 'x'}}]) {
    const e = env(bad);
    if (bad.config === undefined) e.config = null;
    const r = registerSceneEffects(e);
    assert.deepEqual(r.registered, []);
    assert.equal(r.skipped.length, 6);
  }
  const e = env({config: {}});
  resetWarnings(); registerSceneEffects(e); registerSceneEffects(e);
  assert.equal(e.logs.length, 1, 'logged once, not on every call');
  assert.doesNotThrow(() => registerSceneEffects({config: new Proxy({}, {get() { throw new Error('boom'); }}), log() { throw new Error('log boom'); }}));
});

test('a missing particle generator or shader base skips only what needs it', () => {
  resetWarnings();
  let e = env({foundry: {}});
  let r = registerSceneEffects(e);
  assert.deepEqual([...r.registered].sort(), [EFFECT_IDS.redRain, EFFECT_IDS.haze, EFFECT_IDS.shimmer].sort());
  assert.deepEqual([...r.skipped].sort(), [EFFECT_IDS.ash, EFFECT_IDS.spores, EFFECT_IDS.glass].sort());
  resetWarnings();
  e = env({canvas: {}});
  r = registerSceneEffects(e);
  assert.deepEqual([...r.registered].sort(), [EFFECT_IDS.ash, EFFECT_IDS.spores, EFFECT_IDS.glass].sort());
  assert.equal(e.logs.length, 1);
});

test('strength reads from the scene flag: unset is 2, values are whole numbers held to 0..3', () => {
  assert.equal(DEFAULT_STRENGTH, 2);
  for (const [raw, want] of [[undefined, 2], [null, 2], ['', 2], ['x', 2], [0, 0], ['0', 0], [1, 1], ['3', 3], [2.6, 3], [7, 3], [-4, 0]]) assert.equal(strengthOf(sceneWith(raw)), want, String(raw));
  assert.equal(strengthOf(null), 2);
  assert.equal(strengthOf({getFlag() { throw new Error('x'); }}), 2);
  assert.deepEqual([...DENSITY], [0, 0.5, 1, 1.6]);
  assert.deepEqual([...OPACITY], [0, 0.7, 1, 1.25]);
});

test('strength maps to density and opacity: 0 draws nothing, more strength means more and brighter, counts are capped', () => {
  const effectsAt = (level, id) => build(env({scene: () => sceneWith(level)}), id).effects;
  for (const id of ALL) assert.deepEqual(effectsAt(0, id), [], `${id} at 0`);
  const ash = level => effectsAt(level, EFFECT_IDS.ash)[0].particles;
  assert.ok(ash(1)[0].count < ash(2)[0].count && ash(2)[0].count < ash(3)[0].count);
  assert.equal(ash(2)[0].count, 60, 'sparse by default');
  assert.ok(ash(1)[0].alpha[1] < ash(2)[0].alpha[1] && ash(2)[0].alpha[1] < ash(3)[0].alpha[1]);
  for (const level of [1, 2, 3]) for (const id of [EFFECT_IDS.ash, EFFECT_IDS.spores, EFFECT_IDS.glass])
    for (const p of effectsAt(level, id)[0].particles) { assert.ok(p.count >= 1 && p.count <= MAX_PARTICLES, `${id} ${level}`); assert.ok(p.alpha.every(a => a >= 0 && a <= 1)); }
  const rain = level => effectsAt(level, EFFECT_IDS.redRain)[0].config.opacity;
  assert.ok(rain(1) < rain(2) && rain(2) < rain(3));
  // The cap holds even for an absurd base count.
  assert.ok(Math.max(...[1, 2, 3].map(l => Math.max(...effectsAt(l, EFFECT_IDS.glass)[0].particles.map(p => p.count)))) <= MAX_PARTICLES);
});

test('the effects follow the brief: palette, direction, blend and parts', () => {
  const e = env();
  registerSceneEffects(e);
  const fx = id => e.config.weatherEffects[id].effects;
  const ash = fx(EFFECT_IDS.ash)[0].particles;
  assert.equal(ash.length, 2, 'flakes plus a few embers');
  assert.ok(ash[1].count < ash[0].count / 5);
  const spores = fx(EFFECT_IDS.spores)[0].particles[0];
  assert.ok(spores.velocity.x[0] > 0 && spores.velocity.y[1] < 0, 'sideways and rising');
  assert.equal(typeof spores.onUpdate, 'function');
  const glass = fx(EFFECT_IDS.glass)[0].particles[0];
  assert.ok(glass.velocity.y[1] < 0 && glass.scale[1] <= 0.1, 'tiny and rising');
  const [rain, tint] = fx(EFFECT_IDS.redRain);
  assert.ok(rain.config.tint[0] > rain.config.tint[1] && rain.config.rotation > 0, 'rust-red, slanted');
  assert.ok(tint.config.wash === 1 && tint.config.opacity <= 0.1, 'a faint red tint');
  const [fog, vignette] = fx(EFFECT_IDS.haze);
  assert.equal(fog.shaderClass.name, 'FogShader');
  assert.ok(vignette.config.vignette === 1);
  const [shimmer] = fx(EFFECT_IDS.shimmer);
  assert.ok(shimmer.config.shimmer === 1 && shimmer.config.lights === 1 && shimmer.config.opacity <= 0.3);
});

test('reduced motion: slow drift, no pulsing or winking, shader time stands nearly still', () => {
  const normal = env(); registerSceneEffects(normal);
  const calm = env({reduced: () => true}); registerSceneEffects(calm);
  const get = (e, id) => e.config.weatherEffects[id].effects;
  assert.equal(contextFor(null, true).motion, 0);
  assert.equal(contextFor(null, false).motion, 1);
  for (const id of [EFFECT_IDS.spores, EFFECT_IDS.glass]) {
    assert.equal(typeof get(normal, id)[0].particles[0].onUpdate, 'function', `${id} animates normally`);
    assert.equal(get(calm, id)[0].particles[0].onUpdate, undefined, `${id} holds still when reduced`);
  }
  assert.ok(get(calm, EFFECT_IDS.ash)[0].particles[0].velocity.speed[1] < get(normal, EFFECT_IDS.ash)[0].particles[0].velocity.speed[1] / 4);
  for (const id of [EFFECT_IDS.redRain, EFFECT_IDS.haze, EFFECT_IDS.shimmer]) for (const fx of get(calm, id)) assert.ok(fx.config.speed <= 0.15, `${id}/${fx.id}`);
  assert.equal(get(calm, EFFECT_IDS.shimmer)[0].config.motion, 0);
  assert.equal(get(normal, EFFECT_IDS.shimmer)[0].config.motion, 1);
});

test('the pulse and wink multiply a fresh alpha and stay within 0..1 of it', () => {
  const e = env(); registerSceneEffects(e);
  for (const id of [EFFECT_IDS.spores, EFFECT_IDS.glass]) {
    const p = e.config.weatherEffects[id].effects[0].particles[0];
    for (let i = 0; i < 20; i++) {
      const particle = {alpha: 0.5};
      p.onSpawn(particle, {});
      p.onUpdate(particle, {});
      assert.ok(particle.alpha >= 0 && particle.alpha <= 0.5, `${id} ${particle.alpha}`);
    }
  }
});

test('the overlay shader declares the uniforms its fragment source reads', () => {
  const Shader = createOverlayShader(Base);
  const u = Shader.defaultUniforms;
  for (const k of ['opacity', 'wash', 'vignette', 'shimmer', 'lights', 'motion', 'alpha', 'tint']) assert.ok(k in u, k);
  const src = Shader._createFragmentShader.call(Shader);
  for (const k of ['opacity', 'wash', 'vignette', 'shimmer', 'lights', 'motion']) assert.match(src, new RegExp(`uniform float ${k};`), k);
  assert.match(src, /void main\(\)/);
  assert.match(src, /gl_FragColor/);
  assert.equal([...src].filter(c => c === '{').length, [...src].filter(c => c === '}').length);
  assert.equal([...src].filter(c => c === '(').length, [...src].filter(c => c === ')').length);
});

test('only a GM may change the strength; stored values are null or a whole number 0..3', () => {
  for (const shape of ['nested', 'flat']) {
    const make = v => (shape === 'nested' ? {flags: {[MODULE_ID]: {blightStrength: v}}} : {[`flags.${MODULE_ID}.blightStrength`]: v});
    const read = c => (shape === 'nested' ? c.flags[MODULE_ID].blightStrength : c[`flags.${MODULE_ID}.blightStrength`]);
    assert.equal(guardStrengthChange(make(2), false), false, `${shape}: a player is refused`);
    assert.equal(guardStrengthChange(make(2), undefined), false);
    for (const [given, stored] of [['3', 3], [1.6, 2], [9, 3], [-1, 0], ['', null], [null, null], ['junk', null]]) {
      const c = make(given);
      assert.equal(guardStrengthChange(c, true), true);
      assert.equal(read(c), stored, `${shape} ${given}`);
    }
  }
  // Unrelated updates and other modules' flags pass untouched, whoever makes them.
  assert.equal(guardStrengthChange({name: 'x'}, false), true);
  assert.equal(guardStrengthChange({flags: {other: {blightStrength: 9}}}, false), true);
  assert.equal(strengthChanged({flags: {[MODULE_ID]: {blightStrength: 1}}}), true);
  assert.equal(strengthChanged({weather: 'x'}), false);
});

test('refreshWeather redraws only a viewed Blight scene, and fails soft', () => {
  const calls = [];
  const cv = weather => ({scene: {weather}, weather: {initializeEffects: x => calls.push(x)}});
  const config = {weatherEffects: {[EFFECT_IDS.haze]: {id: 'h'}, snow: {id: 'snow'}}};
  assert.equal(refreshWeather({canvas: cv(EFFECT_IDS.haze), config}), true);
  assert.deepEqual(calls, [{id: 'h'}]);
  assert.equal(refreshWeather({canvas: cv('snow'), config}), false);
  assert.equal(refreshWeather({canvas: {scene: {weather: EFFECT_IDS.haze}}, config}), false);
  assert.equal(refreshWeather({canvas: null, config}), false);
  const logs = [];
  assert.equal(refreshWeather({canvas: {scene: {weather: EFFECT_IDS.haze}, weather: {initializeEffects() { throw new Error('x'); }}}, config, log: m => logs.push(m)}), false);
  assert.equal(logs.length, 1);
});

// A very small DOM: enough for the form-group lookup and insertion.
class Node {
  constructor(attrs = {}) { this.attrs = attrs; this.kids = []; this.parent = null; this.firstElementChild = null; this._html = ''; }
  set innerHTML(html) { this._html = html; this.firstElementChild = Object.assign(new Node({'data-ag-blight-strength': ''}), {html}); }
  after(node) { this.parent.kids.splice(this.parent.kids.indexOf(this) + 1, 0, node); node.parent = this.parent; }
  closest() { return this.group; }
  querySelector(sel) {
    const all = [];
    const walk = n => { all.push(n); n.kids.forEach(walk); };
    walk(this);
    if (sel === '[data-ag-blight-strength]') return all.find(n => 'data-ag-blight-strength' in n.attrs) ?? null;
    if (sel === 'select[name="weather"]') return all.find(n => n.attrs.name === 'weather') ?? null;
    return null;
  }
}
const sceneConfigDom = () => {
  const root = new Node(), group = new Node(), select = new Node({name: 'weather'});
  group.parent = root; root.kids.push(group); select.group = group; group.kids.push(select); select.parent = group;
  return {root, group};
};

test('Scene Config gets one Blight strength field under Weather, for a GM only', () => {
  globalThis.document = {createElement: () => new Node()};
  const {root, group} = sceneConfigDom();
  assert.equal(addStrengthField(root, sceneWith(undefined), false), false, 'a player gets nothing');
  assert.equal(addStrengthField(root, sceneWith(undefined), true), true);
  assert.equal(root.kids[1].attrs['data-ag-blight-strength'], '');
  assert.equal(root.kids[0], group);
  assert.equal(addStrengthField(root, sceneWith(undefined), true), false, 'not added twice on a re-render');
  assert.equal(root.kids.length, 2);
  assert.equal(addStrengthField({querySelector: () => null}, sceneWith(1), true), false, 'no weather field, nothing to add');
  assert.equal(addStrengthField(null, sceneWith(1), true), false);
  delete globalThis.document;
});

test('the field posts to the scene flag and marks the stored value selected', () => {
  const html = strengthFieldHtml(sceneWith(3));
  assert.match(html, new RegExp(`name="flags\\.${MODULE_ID}\\.blightStrength"`));
  assert.match(html, /<option value="3" selected>/);
  assert.match(html, /<option value="">Default \(2, Moderate\)<\/option>/);
  assert.match(html, /<label for="ag-blight-strength-s1">Blight strength<\/label>/);
  for (const v of ['0', '1', '2']) assert.match(html, new RegExp(`<option value="${v}">`));
  assert.match(strengthFieldHtml(sceneWith(undefined)), /<option value="" selected>/);
  assert.match(strengthFieldHtml(sceneWith(0)), /<option value="0" selected>/);
});

test('main.mjs wires registration, the form field, the GM guard and the redraw; no status words, no data migration', () => {
  const main = fs.readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  for (const needle of ['registerSceneEffects()', "Hooks.on('renderSceneConfig'", "Hooks.on('preUpdateScene'", "Hooks.on('updateScene'", 'guardStrengthChange', 'refreshWeather']) assert.ok(main.includes(needle), needle);
  const src = fs.readFileSync(new URL('../scripts/scene-effects.mjs', import.meta.url), 'utf8');
  for (const label of Object.values(EFFECT_LABELS)) assert.doesNotMatch(label, /alpha|beta|preview|\bnew\b/i);
  assert.doesNotMatch(src, /updateEmbedded|scene\.update\(|setFlag|migrat/);
});
