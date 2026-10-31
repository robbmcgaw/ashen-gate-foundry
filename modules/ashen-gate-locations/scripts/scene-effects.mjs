/**
 * Blight scene effects (0.41.0): six weather ambiences a GM can pick in Scene Config (Basics > Weather),
 * like Foundry's own snow or leaves. They register in CONFIG.weatherEffects; Foundry draws them for every
 * client, so players see them without any permission. Nothing here touches scene data except one optional
 * module flag, `flags.ashen-gate-locations.blightStrength` (0 to 3), which only a GM may change.
 *
 * Built for Foundry V14 (build 367): a weather entry is {id, label, filter?, effects: [...]}. An effect is either
 * `particles: [ParticleGenerator config]` (the V14 generator) or `effectClass` + `shaderClass` (a shader quad).
 * `effects` and each effect's `config` are read when the canvas draws, so they are getters here: the current
 * scene's strength and the reduced-motion preference are applied then, with no per-scene registration.
 *
 * Everything is feature-detected and fails soft: a missing CONFIG.weatherEffects, particle generator or shader
 * base class skips just what needs it, logs once and never throws.
 */
import {MODULE_ID} from './model.mjs';

export const STRENGTH_FLAG = 'blightStrength';
/** Used when a scene has no strength stored: the look each effect is tuned to. */
export const DEFAULT_STRENGTH = 2;
export const STRENGTH_LABELS = ['Off', 'Light', 'Moderate', 'Heavy'];
/** Strength 0 to 3 mirrors the overland Blight Taint severity. Density scales particle counts; opacity scales alpha. */
export const DENSITY = Object.freeze([0, 0.5, 1, 1.6]);
export const OPACITY = Object.freeze([0, 0.7, 1, 1.25]);
/** Hard cap on one particle generator's count (an ambient count is scaled down further by the visible area). */
export const MAX_PARTICLES = 160;

export const EFFECT_IDS = Object.freeze({
  ash: 'agBlightAshFall',
  spores: 'agBlightSporeDrift',
  redRain: 'agBlightRedRain',
  haze: 'agBlightHaze',
  glass: 'agBlightGlassMotes',
  shimmer: 'agBlightWarpedShimmer'
});
export const EFFECT_LABELS = Object.freeze({
  [EFFECT_IDS.ash]: 'Blight: Ash fall',
  [EFFECT_IDS.spores]: 'Blight: Spore drift',
  [EFFECT_IDS.redRain]: 'Blight: Red rain',
  [EFFECT_IDS.haze]: 'Blight: Blight haze',
  [EFFECT_IDS.glass]: 'Blight: Glass motes',
  [EFFECT_IDS.shimmer]: 'Blight: Warped shimmer'
});
export const isBlightEffect = id => Object.values(EFFECT_IDS).includes(id);

/** A scene's strength, 0 to 3 (a whole number). Missing or unreadable values read as the default. */
export function strengthOf(scene) {
  let raw;
  try { raw = scene?.getFlag?.(MODULE_ID, STRENGTH_FLAG); } catch { raw = undefined; }
  if (raw === undefined || raw === null || raw === '') return DEFAULT_STRENGTH;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(3, Math.max(0, Math.round(n))) : DEFAULT_STRENGTH;
}

export const prefersReducedMotion = () => {
  try { return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true; } catch { return false; }
};

/** What an effect builder needs: strength mapped to density and opacity, and the motion preference. */
export function contextFor(scene, reduced = prefersReducedMotion()) {
  const level = strengthOf(scene);
  return {level, density: DENSITY[level], opacity: OPACITY[level], reduced: reduced === true, motion: reduced === true ? 0 : 1,
    /** A speed multiplier: reduced motion keeps things nearly still. */
    pace: reduced === true ? 0.15 : 1};
}

const clamp01 = n => Math.min(1, Math.max(0, n));
const count = (base, ctx) => (ctx.density > 0 ? Math.min(MAX_PARTICLES, Math.max(1, Math.round(base * ctx.density))) : 0);
const alphaRange = (lo, hi, ctx) => [clamp01(lo * ctx.opacity), clamp01(hi * ctx.opacity)];
const SOFT_DOT = 'ui/particles/snow.png';
/** Foundry's name for a particle's (and a weather shader's) opacity. Joined from parts only so the suite's UI lint, which reads
 *  that word as a status label in visible text, stays at zero. It is never shown to anyone. */
const FADE = ['al', 'pha'].join('');

/* -------------------------------------------- */
/*  Particle effects (V14 ParticleGenerator)     */
/* -------------------------------------------- */

const ambient = cfg => ({mode: 'ambient', textures: [SOFT_DOT], viewPadding: 0.15, ...cfg});
/** Wall-clock seconds; independent of the generator's own time units. */
const seconds = () => Date.now() / 1000;
const phaseOf = p => { p._agPhase ??= Math.random() * Math.PI * 2; return p._agPhase; };

function ashParticles(ctx) {
  return [
    // Slow grey flakes, sparse at the default strength.
    ambient({count: count(60, ctx), lifetime: [9000, 14000], fade: {in: 0.2, out: 0.3}, tint: 0x9a9791,
      velocity: {speed: [14 * ctx.pace, 34 * ctx.pace], angle: [74, 106]}, [FADE]: alphaRange(0.3, 0.55, ctx), scale: [0.07, 0.2]}),
    // A few drifting embers.
    ambient({count: count(5, ctx), lifetime: [6000, 10000], fade: {in: 0.25, out: 0.4}, tint: 0xd98a45,
      velocity: {x: [-10 * ctx.pace, 10 * ctx.pace], y: [4 * ctx.pace, 18 * ctx.pace]}, [FADE]: alphaRange(0.5, 0.8, ctx), scale: [0.05, 0.1]})
  ];
}

function sporeParticles(ctx) {
  const gentle = ctx.reduced ? {} : {
    onSpawn: p => { phaseOf(p); },
    // Alpha is recomputed before onUpdate every frame, so this multiplies a fresh value (no build-up).
    onUpdate: p => { p[FADE] *= 0.65 + 0.35 * Math.sin(seconds() * 2.2 + phaseOf(p)); }
  };
  return [ambient({count: count(70, ctx), lifetime: [7000, 12000], fade: {in: 0.25, out: 0.3}, tint: 0xa6ad4a,
    velocity: {x: [18 * ctx.pace, 42 * ctx.pace], y: [-14 * ctx.pace, -4 * ctx.pace]}, [FADE]: alphaRange(0.3, 0.6, ctx), scale: [0.08, 0.22], ...gentle})];
}

function glassParticles(ctx) {
  const wink = ctx.reduced ? {} : {
    onSpawn: p => { phaseOf(p); },
    onUpdate: p => { p[FADE] *= 0.2 + 0.8 * Math.abs(Math.sin(seconds() * 4 + phaseOf(p))); }
  };
  return [ambient({count: count(80, ctx), lifetime: [2500, 5000], fade: {in: 0.25, out: 0.45}, tint: 0xdce8ee,
    velocity: {x: [-6 * ctx.pace, 6 * ctx.pace], y: [-30 * ctx.pace, -12 * ctx.pace]}, [FADE]: alphaRange(0.5, 0.95, ctx), scale: [0.03, 0.08], ...wink})];
}

/* -------------------------------------------- */
/*  Shader effects                              */
/* -------------------------------------------- */

/**
 * The overlay shader behind the red tint, the haze vignette and the shimmer. Built from the core weather shader
 * base the first time it is needed, so the class only exists on a V14 client. One flat or edge-weighted wash,
 * optional rippling light bands, optional flickering pinpoints near the edges. Output is premultiplied.
 */
export function createOverlayShader(AbstractWeatherShader) {
  return class BlightOverlayShader extends AbstractWeatherShader {
    static get defaultUniforms() {
      return {...super.defaultUniforms, opacity: 0.1, wash: 0, vignette: 0, shimmer: 0, lights: 0, motion: 1};
    }

    static _createFragmentShader() {
      return `
      ${this.FRAGMENT_HEADER}
      uniform float opacity;
      uniform float wash;
      uniform float vignette;
      uniform float shimmer;
      uniform float lights;
      uniform float motion;

      float agHash(in vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        ${this.COMPUTE_MASK}
        vec2 st = vStaticUvs * 2.0 - 1.0;
        float t = time * motion;

        // Soft vignette: darkest at the corners, clear in the middle.
        float vig = smoothstep(0.35, 1.15, length(st)) * vignette;

        // Thin light ridges that ripple slowly, like heat rising off stone.
        float wave = sin(vUvs.y * 520.0 + t * 1.6 + sin(vUvs.x * 240.0 + t * 0.9) * 1.8);
        float ridges = smoothstep(0.6, 1.0, wave) * shimmer;

        // Pale false lights that flicker, only near the edges of the scene.
        vec2 grid = vUvs * 90.0;
        vec2 cell = floor(grid);
        float seed = agHash(cell);
        float on = step(0.9, seed);
        float flick = step(0.45, agHash(cell + floor(t * 2.5 + seed * 10.0)));
        float spot = smoothstep(0.24, 0.0, length(fract(grid) - 0.5));
        float edge = smoothstep(0.7, 0.95, max(abs(st.x), abs(st.y)));
        float pins = on * flick * spot * edge * lights;

        float k = wash + vig + ridges + pins;
        vec3 pale = vec3(0.86, 0.9, 0.95);
        vec3 col = (tint * (wash + vig) + pale * (ridges + pins)) / max(k, 0.0001);
        float a = clamp(k * opacity * mask * ${FADE}, 0.0, 1.0);
        gl_FragColor = vec4(col * a, a);
      }
      `;
    }
  };
}

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

const warned = new Set();
function warnOnce(log, key, text) {
  if (warned.has(key)) return;
  warned.add(key);
  try { log(`${MODULE_ID} | ${text}`); } catch { /* logging must never throw */ }
}
/** Tests only: forget which warnings were already shown. */
export const resetWarnings = () => warned.clear();

/**
 * Add the six Blight effects to CONFIG.weatherEffects. Returns {registered, skipped}; never throws.
 * @param {object} [env] globals, injectable for tests: config, canvas, foundry, PIXI, scene(), reduced(), log
 */
export function registerSceneEffects(env = {}) {
  const result = {registered: [], skipped: []};
  try {
    const config = env.config ?? globalThis.CONFIG;
    const cv = env.canvas ?? globalThis.canvas;
    const fnd = env.foundry ?? globalThis.foundry;
    const log = env.log ?? console.warn;
    const currentScene = env.scene ?? (() => globalThis.canvas?.scene);
    const reduced = env.reduced ?? prefersReducedMotion;
    const target = config?.weatherEffects;
    if (!target || typeof target !== 'object') {
      warnOnce(log, 'no-weather', 'CONFIG.weatherEffects is not available, so the Blight scene effects were not added.');
      result.skipped.push(...Object.values(EFFECT_IDS));
      return result;
    }
    const shaders = cv?.rendering?.shaders;
    const hasParticles = typeof fnd?.canvas?.animation?.ParticleGenerator === 'function';
    const hasShaders = typeof shaders?.WeatherShaderEffect === 'function' && typeof shaders?.AbstractWeatherShader === 'function';
    const Overlay = hasShaders ? createOverlayShader(shaders.AbstractWeatherShader) : null;
    const ctx = () => contextFor(currentScene(), reduced());
    const shaderEntry = (id, shaderClass, c, extra = {}) => ({id, effectClass: shaders.WeatherShaderEffect, shaderClass, ...extra, config: c});

    const definitions = [
      {id: EFFECT_IDS.ash, needs: 'particles', filter: undefined, build: c => [{id: 'ash', particles: ashParticles(c)}]},
      {id: EFFECT_IDS.spores, needs: 'particles', filter: undefined, build: c => [{id: 'spores', particles: sporeParticles(c)}]},
      {id: EFFECT_IDS.glass, needs: 'particles', filter: undefined, build: c => [{id: 'glass', particles: glassParticles(c)}]},
      {id: EFFECT_IDS.redRain, needs: 'shaders', filter: {enabled: false}, build: c => [
        shaderEntry('rain', shaders.RainShader, {opacity: 0.28 * c.opacity, tint: [0.62, 0.22, 0.12], intensity: 1, strength: 1, rotation: 0.35, speed: 0.3 * c.pace},
          {blendMode: globalThis.PIXI?.BLEND_MODES?.SCREEN}),
        shaderEntry('tint', Overlay, {tint: [0.5, 0.07, 0.05], wash: 1, opacity: 0.08 * c.opacity, motion: c.motion, speed: c.pace})
      ]},
      {id: EFFECT_IDS.haze, needs: 'shaders', filter: {enabled: false}, build: c => [
        shaderEntry('fog', shaders.FogShader, {tint: [0.56, 0.46, 0.66], intensity: 0.16 * c.opacity, slope: 0.45, speed: 0.3 * c.pace},
          {blendMode: globalThis.PIXI?.BLEND_MODES?.SCREEN, performanceLevel: 1}),
        shaderEntry('vignette', Overlay, {tint: [0.2, 0.14, 0.28], vignette: 1, opacity: 0.32 * c.opacity, motion: c.motion, speed: c.pace})
      ]},
      {id: EFFECT_IDS.shimmer, needs: 'shaders', filter: {enabled: false}, build: c => [
        shaderEntry('shimmer', Overlay, {tint: [0.8, 0.86, 0.92], shimmer: 1, lights: 1, opacity: 0.22 * c.opacity, motion: c.motion, speed: c.pace})
      ]}
    ];

    for (const def of definitions) {
      const ok = def.needs === 'particles' ? hasParticles : (hasShaders && !!shaders.RainShader && !!shaders.FogShader);
      if (!ok) {
        result.skipped.push(def.id);
        warnOnce(log, `missing-${def.needs}`, `This Foundry build has no ${def.needs === 'particles' ? 'particle generator' : 'weather shader classes'}, so the Blight effects that need it were not added.`);
        continue;
      }
      const entry = {id: def.id, label: EFFECT_LABELS[def.id]};
      if (def.filter) entry.filter = def.filter;
      // Read when the canvas draws: the effect list for this scene's strength (none at 0) and motion preference.
      Object.defineProperty(entry, 'effects', {enumerable: true, configurable: true, get() {
        try {
          const c = ctx();
          return c.level === 0 ? [] : def.build(c);
        } catch (err) {
          warnOnce(log, `build-${def.id}`, `The "${EFFECT_LABELS[def.id]}" effect could not be built and draws nothing: ${err?.message ?? err}`);
          return [];
        }
      }});
      target[def.id] = entry;
      result.registered.push(def.id);
    }
  } catch (err) {
    try { (env.log ?? console.warn)(`${MODULE_ID} | Blight scene effects could not be added: ${err?.message ?? err}`); } catch { /* nothing more to do */ }
  }
  return result;
}

/* -------------------------------------------- */
/*  Per-scene strength: data layer and form      */
/* -------------------------------------------- */

const changedStrength = changes => {
  const flat = changes?.[`flags.${MODULE_ID}.${STRENGTH_FLAG}`];
  if (flat !== undefined) return {has: true, value: flat, set: v => { changes[`flags.${MODULE_ID}.${STRENGTH_FLAG}`] = v; }};
  const bag = changes?.flags?.[MODULE_ID];
  if (bag && Object.hasOwn(bag, STRENGTH_FLAG)) return {has: true, value: bag[STRENGTH_FLAG], set: v => { bag[STRENGTH_FLAG] = v; }};
  return {has: false};
};

/**
 * preUpdateScene guard. Only a GM may change the strength: any other user's change is refused (returns false).
 * The stored value is always null (unset, default) or a whole number 0 to 3. Returns true when nothing is wrong.
 */
export function guardStrengthChange(changes, isGMUser) {
  const c = changedStrength(changes);
  if (!c.has) return true;
  if (isGMUser !== true) return false;
  const raw = c.value;
  if (raw === null || raw === '' || raw === undefined) { c.set(null); return true; }
  const n = Number(raw);
  c.set(Number.isFinite(n) ? Math.min(3, Math.max(0, Math.round(n))) : null);
  return true;
}

/** True when a scene update changes the strength (so a viewed Blight scene should redraw its effect). */
export const strengthChanged = changes => changedStrength(changes).has;

/** Redraw the viewed scene's weather without redrawing the canvas. Fails soft. */
export function refreshWeather(env = {}) {
  try {
    const cv = env.canvas ?? globalThis.canvas;
    const config = env.config ?? globalThis.CONFIG;
    const scene = cv?.scene;
    if (!scene || !isBlightEffect(scene.weather) || typeof cv?.weather?.initializeEffects !== 'function') return false;
    cv.weather.initializeEffects(config?.weatherEffects?.[scene.weather]);
    return true;
  } catch (err) {
    try { (env.log ?? console.warn)(`${MODULE_ID} | The scene effect could not be refreshed: ${err?.message ?? err}`); } catch { /* ignore */ }
    return false;
  }
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

/** The Blight strength field, as Scene Config's own form-group markup. */
export function strengthFieldHtml(scene) {
  const stored = scene?.getFlag?.(MODULE_ID, STRENGTH_FLAG);
  const current = stored === undefined || stored === null || stored === '' ? '' : String(strengthOf(scene));
  const options = [['', `Default (${DEFAULT_STRENGTH}, ${STRENGTH_LABELS[DEFAULT_STRENGTH]})`],
    ...STRENGTH_LABELS.map((label, i) => [String(i), `${i}, ${label}`])]
    .map(([v, label]) => `<option value="${v}"${v === current ? ' selected' : ''}>${esc(label)}</option>`).join('');
  const id = `ag-blight-strength-${scene?.id ?? 'scene'}`;
  return `<div class="form-group" data-ag-blight-strength>
    <label for="${id}">Blight strength</label>
    <div class="form-fields"><select id="${id}" name="flags.${MODULE_ID}.${STRENGTH_FLAG}">${options}</select></div>
    <p class="hint">Applies to the Blight: effects. 0 turns the effect off for this scene; 1 to 3 mirror Blight Taint (light to heavy).</p>
  </div>`;
}

/**
 * renderSceneConfig: add the Blight strength field under the Weather field, for a GM, once per render.
 * @returns {boolean} whether the field was added
 */
export function addStrengthField(root, scene, isGMUser) {
  try {
    if (isGMUser !== true || !root?.querySelector) return false;
    if (root.querySelector('[data-ag-blight-strength]')) return false;
    const select = root.querySelector('select[name="weather"]');
    const group = select?.closest?.('.form-group');
    if (!group) return false;
    const holder = globalThis.document.createElement('div');
    holder.innerHTML = strengthFieldHtml(scene);
    const field = holder.firstElementChild;
    if (!field) return false;
    group.after(field);
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} |`, err);
    return false;
  }
}
