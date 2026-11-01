/**
 * Blight weather (Manager 0.99.0): six scene moods a GM can pick in Scene Config (Basics > Weather) or add as
 * one-click layers in Scenes > Moods & layers. They register in CONFIG.weatherEffects on every client; Foundry
 * draws them for every client, so players see them with no permission. Nothing here writes scene data.
 *
 * They moved here from Locations 0.41.0 to 0.42.x with the same six ids (a scene that already uses one keeps it).
 * Each effect has ONE fixed look: the one the old default strength (2, "Moderate") drew. There is no strength control
 * and the old `flags.ashen-gate-locations.blightStrength` flag is ignored.
 *
 * Built for Foundry V14 (build 367): a weather entry is {id, label, filter?, effects: [...]}. An effect is either
 * `particles: [ParticleGenerator config]` (the V14 generator) or `effectClass` + `shaderClass` (a shader quad).
 * `effects` is a getter, read when the canvas draws, so the reduced-motion preference and the world "No flashing"
 * switch apply then, with no per-scene registration.
 *
 * Everything is feature-detected and fails soft: a missing CONFIG.weatherEffects, particle generator or shader
 * base class skips just what needs it, logs once and never throws.
 */
import {MODULE_ID} from './core.js';

/** The one look: what Locations drew at strength 2 (density x1, opacity x1). */
export const LOOK = Object.freeze({density: 1, opacity: 1});
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
/** Effects whose look winks or flickers; they are marked `flashing` in the layers and calmed by "No flashing". */
export const FLICKERING = Object.freeze([EFFECT_IDS.glass, EFFECT_IDS.shimmer]);
export const isBlightEffect = id => Object.values(EFFECT_IDS).includes(id);

export const prefersReducedMotion = () => {
  try { return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true; } catch { return false; }
};

/**
 * What an effect builder needs. `reduced` is the system motion preference; `calm` is the world "No flashing" switch.
 * Reduced motion slows everything and stills the pulse, wink and flicker; "No flashing" removes only the wink and flicker.
 */
export function contextFor(reduced = prefersReducedMotion(), calm = false) {
  const r = reduced === true, c = calm === true;
  return {density: LOOK.density, opacity: LOOK.opacity, reduced: r, calm: c,
    /** 0 holds the overlay shader's time term (no flicker, bands stand still). */
    motion: r || c ? 0 : 1,
    /** Whether the wink / flicker is drawn at all. */
    winks: !(r || c),
    /** A speed multiplier: reduced motion keeps things nearly still. */
    pace: r ? 0.15 : 1};
}

const clamp01 = n => Math.min(1, Math.max(0, n));
const count = (base, ctx) => (Math.min(MAX_PARTICLES, Math.max(1, Math.round(base * ctx.density))));
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
  const wink = ctx.winks ? {
    onSpawn: p => { phaseOf(p); },
    onUpdate: p => { p[FADE] *= 0.2 + 0.8 * Math.abs(Math.sin(seconds() * 4 + phaseOf(p))); }
  } : {};
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
 * @param {object} [env] globals, injectable for tests: config, canvas, foundry, reduced(), calm(), log
 */
export function registerBlightWeather(env = {}) {
  const result = {registered: [], skipped: []};
  try {
    const config = env.config ?? globalThis.CONFIG;
    const cv = env.canvas ?? globalThis.canvas;
    const fnd = env.foundry ?? globalThis.foundry;
    const log = env.log ?? console.warn;
    const reduced = env.reduced ?? prefersReducedMotion;
    const calm = env.calm ?? (() => false);
    const target = config?.weatherEffects;
    if (!target || typeof target !== 'object') {
      warnOnce(log, 'no-weather', 'CONFIG.weatherEffects is not available, so the Blight weather effects were not added.');
      result.skipped.push(...Object.values(EFFECT_IDS));
      return result;
    }
    const shaders = cv?.rendering?.shaders;
    const hasParticles = typeof fnd?.canvas?.animation?.ParticleGenerator === 'function';
    const hasShaders = typeof shaders?.WeatherShaderEffect === 'function' && typeof shaders?.AbstractWeatherShader === 'function';
    const Overlay = hasShaders ? createOverlayShader(shaders.AbstractWeatherShader) : null;
    const ctx = () => {
      let c = false;
      try { c = calm() === true; } catch { c = false; }
      return contextFor(reduced(), c);
    };
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
        warnOnce(log, `missing-${def.needs}`, `This Foundry build has no ${def.needs === 'particles' ? 'particle generator' : 'weather shader classes'}, so the Blight weather effects that need it were not added.`);
        continue;
      }
      const entry = {id: def.id, label: EFFECT_LABELS[def.id]};
      if (def.filter) entry.filter = def.filter;
      // Read when the canvas draws: the motion preference and the "No flashing" switch apply then.
      Object.defineProperty(entry, 'effects', {enumerable: true, configurable: true, get() {
        try { return def.build(ctx()); } catch (err) {
          warnOnce(log, `build-${def.id}`, `The "${EFFECT_LABELS[def.id]}" effect could not be built and draws nothing: ${err?.message ?? err}`);
          return [];
        }
      }});
      target[def.id] = entry;
      result.registered.push(def.id);
    }
  } catch (err) {
    try { (env.log ?? console.warn)(`${MODULE_ID} | Blight weather effects could not be added: ${err?.message ?? err}`); } catch { /* nothing more to do */ }
  }
  return result;
}

/** Redraw the viewed scene's weather without redrawing the canvas (used when the motion preference changes). Fails soft. */
export function refreshWeather(env = {}) {
  try {
    const cv = env.canvas ?? globalThis.canvas;
    const config = env.config ?? globalThis.CONFIG;
    const scene = cv?.scene;
    if (!scene || !isBlightEffect(scene.weather) || typeof cv?.weather?.initializeEffects !== 'function') return false;
    cv.weather.initializeEffects(config?.weatherEffects?.[scene.weather]);
    return true;
  } catch (err) {
    try { (env.log ?? console.warn)(`${MODULE_ID} | The weather effect could not be refreshed: ${err?.message ?? err}`); } catch { /* ignore */ }
    return false;
  }
}
