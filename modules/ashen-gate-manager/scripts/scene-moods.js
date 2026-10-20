/**
 * Scene moods (0.22.0): GM-only presets that switch a Scene's lighting environment and core weather.
 *
 * Only core Scene fields are touched. Field paths were confirmed against the V14 Scene schema
 * (community type definitions fvtt-types 14.366): `environment.darknessLevel`,
 * `environment.globalLight.enabled`, `environment.base|dark.{hue,intensity,luminosity,saturation,shadows}`
 * and the top-level `weather` string, whose ids are the keys of `CONFIG.weatherEffects`.
 * Every path is still feature-detected on the live Scene schema before writing.
 *
 * FUTURE EXTENSION (not implemented): a particle module such as FXMaster could be driven from a
 * preset's own optional `particles` entry, only when `game.modules.get('fxmaster')?.active` and its
 * public API exist. Nothing here reads or requires any third-party module.
 */
import {MODULE_ID, getPath} from './core.js';

export const MOODS_SETTING = 'sceneMoods';
export const FLAG_BASE = 'moodBase';
export const FLAG_MOOD = 'mood';
export const NO_WEATHER = '';

/** The only Scene fields a preset may set. */
export const MOOD_FIELDS = Object.freeze([
  {path:'environment.darknessLevel', label:'Darkness', kind:'number', min:0, max:1, step:0.05},
  {path:'environment.globalLight.enabled', label:'Global illumination', kind:'boolean'},
  {path:'environment.base.hue', label:'Day tint hue', kind:'number', min:0, max:1, step:0.01},
  {path:'environment.base.intensity', label:'Day tint intensity', kind:'number', min:0, max:1, step:0.05},
  {path:'environment.base.luminosity', label:'Day luminosity', kind:'number', min:-1, max:1, step:0.05},
  {path:'environment.base.saturation', label:'Day saturation', kind:'number', min:-1, max:1, step:0.05},
  {path:'environment.base.shadows', label:'Day shadows', kind:'number', min:0, max:1, step:0.05},
  {path:'environment.dark.hue', label:'Night tint hue', kind:'number', min:0, max:1, step:0.01},
  {path:'environment.dark.intensity', label:'Night tint intensity', kind:'number', min:0, max:1, step:0.05},
  {path:'environment.dark.luminosity', label:'Night luminosity', kind:'number', min:-1, max:1, step:0.05},
  {path:'weather', label:'Weather', kind:'weather'}
]);
const FIELD = new Map(MOOD_FIELDS.map(f => [f.path, f]));

/** Shipped defaults: a starting point only, editable per world. Weather ids are core V14 ids. */
export const DEFAULT_MOODS = Object.freeze([
  {id:'day', label:'Day', isDefault:true, set:{'environment.darknessLevel':0, 'weather':NO_WEATHER}},
  {id:'twilight', label:'Twilight', isDefault:true, set:{'environment.darknessLevel':0.45, 'environment.base.hue':0.07, 'environment.base.intensity':0.35, 'weather':NO_WEATHER}},
  {id:'windy', label:'Windy (leaves)', isDefault:true, set:{'environment.darknessLevel':0.1, 'weather':'leaves'}},
  {id:'storm', label:'Storm', isDefault:true, set:{'environment.darknessLevel':0.6, 'environment.base.saturation':-0.4, 'weather':'rainStorm'}},
  {id:'night', label:'Night', isDefault:true, set:{'environment.darknessLevel':0.9, 'weather':NO_WEATHER}}
].map(m => Object.freeze({...m, set:Object.freeze(m.set)})));

const clone = value => JSON.parse(JSON.stringify(value));
const fail = message => ({ok:false, message});
const GM_ONLY = 'Only the GM can change scene moods.';

/** Checks a preset's shape and values; returns a list of problems (empty = valid). */
export function validatePreset(preset) {
  const problems = [];
  if(!preset || typeof preset !== 'object') return ['Preset must be an object.'];
  if(!/^[a-z0-9][a-z0-9-]{0,39}$/.test(String(preset.id ?? ''))) problems.push('Id must be 1–40 lowercase letters, digits or dashes.');
  if(!String(preset.label ?? '').trim()) problems.push('Label is required.');
  const set = preset.set;
  if(!set || typeof set !== 'object' || Array.isArray(set)) return [...problems, 'Preset must list the scene fields it sets.'];
  if(!Object.keys(set).length) problems.push('Choose at least one field to set.');
  for(const [path, value] of Object.entries(set)) {
    const field = FIELD.get(path);
    if(!field) {problems.push(`${path} is not a supported mood field.`); continue;}
    if(field.kind === 'number' && !(typeof value === 'number' && Number.isFinite(value) && value >= field.min && value <= field.max))
      problems.push(`${field.label} must be a number from ${field.min} to ${field.max}.`);
    if(field.kind === 'boolean' && typeof value !== 'boolean') problems.push(`${field.label} must be on or off.`);
    if(field.kind === 'weather' && typeof value !== 'string') problems.push(`${field.label} must be a weather id or No weather.`);
  }
  return problems;
}

/** Feature-detects one Scene field on the live schema (falls back to the scene's own data). */
export function sceneHasField(scene, path) {
  const schema = scene?.constructor?.schema;
  if(typeof schema?.getField === 'function') return Boolean(schema.getField(path));
  return getPath(scene?._source ?? scene, path) !== undefined;
}

export function createSceneMoods({game, getConfig = () => globalThis.CONFIG, getCanvas = () => globalThis.canvas}) {
  const isGM = () => Boolean(game.user?.isGM);
  const weatherIds = () => Object.keys(getConfig()?.weatherEffects ?? {});
  const presets = () => {
    const stored = game.settings.get(MODULE_ID, MOODS_SETTING);
    return clone(Array.isArray(stored) && stored.length ? stored : DEFAULT_MOODS);
  };
  /** The viewed scene, else the active one, unless a scene id is given. */
  const resolveScene = sceneId => sceneId ? game.scenes?.get?.(sceneId) ?? null : getCanvas()?.scene ?? game.scenes?.active ?? null;
  const baseOf = scene => {const b = scene?.getFlag?.(MODULE_ID, FLAG_BASE); return b && Array.isArray(b.fields) ? b : null;};
  const moodOf = scene => scene?.getFlag?.(MODULE_ID, FLAG_MOOD) || null;

  async function savePresets(list) {
    if(!isGM()) return fail(GM_ONLY);
    if(!Array.isArray(list) || !list.length) return fail('Keep at least one mood preset.');
    const ids = new Set();
    for(const preset of list) {
      const problems = validatePreset(preset);
      if(ids.has(preset?.id)) problems.push(`Id ${preset.id} is used twice.`);
      if(problems.length) return fail(`${preset?.label || preset?.id || 'Preset'}: ${problems.join(' ')}`);
      ids.add(preset.id);
    }
    const tidy = list.map(p => ({id:p.id, label:String(p.label).trim(), isDefault:Boolean(p.isDefault), set:{...p.set}}));
    await game.settings.set(MODULE_ID, MOODS_SETTING, tidy);
    return {ok:true, presets:clone(tidy)};
  }

  return {
    fields:MOOD_FIELDS,
    listMoods() {
      if(!isGM()) return fail(GM_ONLY);
      return {ok:true, presets:presets(), weatherIds:weatherIds()};
    },
    getState(sceneId) {
      if(!isGM()) return fail(GM_ONLY);
      const scene = resolveScene(sceneId);
      if(!scene) return {ok:true, scene:null, mood:null, hasBase:false};
      return {ok:true, scene:{id:scene.id, name:scene.name, darknessLock:Boolean(getPath(scene, 'environment.darknessLock'))},
        mood:moodOf(scene), hasBase:Boolean(baseOf(scene))};
    },
    async applyMood(moodId, {sceneId, animate = 0} = {}) {
      if(!isGM()) return fail(GM_ONLY);
      const scene = resolveScene(sceneId);
      if(!scene) return fail('No scene to change: view or activate a scene first.');
      const preset = presets().find(p => p.id === moodId);
      if(!preset) return fail(`Mood "${moodId}" does not exist.`);
      const problems = validatePreset(preset);
      if(problems.length) return fail(`${preset.label}: ${problems.join(' ')}`);
      const entries = Object.entries(preset.set);
      const missing = entries.filter(([path]) => !sceneHasField(scene, path)).map(([path]) => path);
      if(missing.length) return fail(`This Foundry version has no scene field ${missing.join(', ')}. Nothing changed. Edit the "${preset.label}" mood to remove it.`);
      const weather = preset.set.weather;
      if(weather && !weatherIds().includes(weather))
        return fail(`Weather "${weather}" is not available in this world (known: ${weatherIds().join(', ') || 'none'}). Nothing changed. Edit the "${preset.label}" mood or choose No weather.`);

      // Keep the scene's original value for every field any mood has changed; existing entries are never overwritten.
      const prior = baseOf(scene);
      const base = prior ? clone(prior) : {capturedAt:Date.now(), fields:[]};
      const known = new Set(base.fields.map(f => f.path));
      for(const [path] of entries) if(!known.has(path)) base.fields.push({path, value:clone(getPath(scene, path) ?? null)});

      const update = Object.fromEntries(entries);
      update[`flags.${MODULE_ID}.${FLAG_BASE}`] = base;
      update[`flags.${MODULE_ID}.${FLAG_MOOD}`] = {id:preset.id, label:preset.label, appliedAt:Date.now()};
      // animateDarkness is an update option core reads to fade darkness; unsupported versions ignore it.
      const options = animate > 0 && 'environment.darknessLevel' in preset.set ? {animateDarkness:animate} : {};
      await scene.update(update, options);
      const warn = getPath(scene, 'environment.darknessLock') && 'environment.darknessLevel' in preset.set ? ' Darkness is locked on this scene, so Foundry may keep the old darkness.' : '';
      return {ok:true, message:`${scene.name}: ${preset.label}.${warn}`};
    },
    async restore({sceneId, animate = 0} = {}) {
      if(!isGM()) return fail(GM_ONLY);
      const scene = resolveScene(sceneId);
      if(!scene) return fail('No scene to change: view or activate a scene first.');
      const base = baseOf(scene);
      if(!base) return fail(`${scene.name} has no mood applied, so there is nothing to restore.`);
      const update = Object.fromEntries(base.fields.map(f => [f.path, clone(f.value)]));
      // Null clears the flags without the "-=" key syntax V14 deprecates.
      update[`flags.${MODULE_ID}.${FLAG_BASE}`] = null;
      update[`flags.${MODULE_ID}.${FLAG_MOOD}`] = null;
      const options = animate > 0 && 'environment.darknessLevel' in update ? {animateDarkness:animate} : {};
      await scene.update(update, options);
      return {ok:true, message:`${scene.name}: back to normal.`};
    },
    savePresets,
    async savePreset(preset) {
      if(!isGM()) return fail(GM_ONLY);
      const list = presets();
      const at = list.findIndex(p => p.id === preset?.id);
      // An edited default is the GM's own preset from then on.
      const next = {...clone(preset ?? {}), isDefault:false};
      if(at >= 0) list[at] = next; else list.push(next);
      return savePresets(list);
    },
    async removePreset(id) {
      if(!isGM()) return fail(GM_ONLY);
      const list = presets();
      if(!list.some(p => p.id === id)) return fail(`Mood "${id}" does not exist.`);
      return savePresets(list.filter(p => p.id !== id));
    },
    async resetDefaults() {
      if(!isGM()) return fail(GM_ONLY);
      await game.settings.set(MODULE_ID, MOODS_SETTING, []);
      return {ok:true, presets:presets()};
    }
  };
}
