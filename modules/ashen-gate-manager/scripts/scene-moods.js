/**
 * Scene moods (0.22.0) and layers (0.35.0): GM-only presets that change a Scene's lighting environment,
 * core weather and fog colours.
 *
 * Only core Scene fields are touched. Field paths were confirmed against the V14 Scene schema
 * (community type definitions fvtt-types 14.366): `environment.darknessLevel`, `environment.cycle`,
 * `environment.globalLight.{enabled,bright,luminosity,color}`,
 * `environment.base|dark.{hue,intensity,luminosity,saturation,shadows}`, `fog.colors.{explored,unexplored}`
 * and the top-level `weather` string, whose ids are the keys of `CONFIG.weatherEffects`.
 * Every path is still feature-detected on the live Scene schema before writing.
 *
 * A scene carries one stack (flags.ashen-gate-manager.moodStack): at most one mood at the bottom, then layers.
 * Each entry records only the fields it set as {path, before, after}. A field belongs to the top-most entry
 * that set it. Removing an entry hands its `before` up to a higher entry that also set the field, otherwise
 * writes `before` back only while the scene still shows the entry's `after`; a value the GM changed since is kept.
 * The stack also keeps `original` (0.35.1): each field's value from before Manager first changed it (moods, layers
 * or fine-tune). Back to normal writes every original value back, so fine-tune edits are undone too.
 *
 * FUTURE EXTENSION (not implemented): a particle module such as FXMaster could be driven from a
 * preset's own optional `particles` entry, only when `game.modules.get('fxmaster')?.active` and its
 * public API exist. Nothing here reads or requires any third-party module.
 */
import {MODULE_ID, getPath} from './core.js';

export const MOODS_SETTING = 'sceneMoods';
export const LAYERS_SETTING = 'sceneLayers';
export const FLAG_STACK = 'moodStack';
export const FLAG_FAVOURITES = 'moodFavourites';
/** 0.22.0–0.34.x flags, read once and converted into a one-entry stack. */
export const FLAG_BASE = 'moodBase';
export const FLAG_MOOD = 'mood';
export const NO_WEATHER = '';
export const FILE_FORMAT = 'ashen-gate.scene-moods';
export const FILE_VERSION = 1;
export const MAX_TRANSITION_MS = 60000;
export const KINDS = Object.freeze(['mood', 'layer']);

/** The only Scene fields a preset or the fine-tune panel may set. `group` drives the Scenes tab layout. */
export const MOOD_FIELDS = Object.freeze([
  {path:'environment.darknessLevel', label:'Darkness', kind:'number', min:0, max:1, step:0.05, group:'light'},
  {path:'environment.globalLight.enabled', label:'Global illumination', kind:'boolean', group:'light'},
  {path:'environment.globalLight.bright', label:'Bright global light', kind:'boolean', group:'light'},
  {path:'environment.globalLight.luminosity', label:'Global light glow', kind:'number', min:0, max:1, step:0.05, group:'light'},
  {path:'environment.globalLight.color', label:'Global light colour', kind:'color', group:'light'},
  {path:'environment.cycle', label:'Blend day and night colours with darkness', kind:'boolean', group:'light'},
  {path:'environment.base.hue', label:'Day tint hue', kind:'number', min:0, max:1, step:0.01, group:'day'},
  {path:'environment.base.intensity', label:'Day tint intensity', kind:'number', min:0, max:1, step:0.05, group:'day'},
  {path:'environment.base.luminosity', label:'Day luminosity', kind:'number', min:-1, max:1, step:0.05, group:'day'},
  {path:'environment.base.saturation', label:'Day saturation', kind:'number', min:-1, max:1, step:0.05, group:'day'},
  {path:'environment.base.shadows', label:'Day shadows', kind:'number', min:0, max:1, step:0.05, group:'day'},
  {path:'environment.dark.hue', label:'Night tint hue', kind:'number', min:0, max:1, step:0.01, group:'night'},
  {path:'environment.dark.intensity', label:'Night tint intensity', kind:'number', min:0, max:1, step:0.05, group:'night'},
  {path:'environment.dark.luminosity', label:'Night luminosity', kind:'number', min:-1, max:1, step:0.05, group:'night'},
  {path:'environment.dark.saturation', label:'Night saturation', kind:'number', min:-1, max:1, step:0.05, group:'night'},
  {path:'environment.dark.shadows', label:'Night shadows', kind:'number', min:0, max:1, step:0.05, group:'night'},
  {path:'weather', label:'Weather', kind:'weather', group:'atmosphere'},
  {path:'fog.colors.unexplored', label:'Unexplored fog colour', kind:'color', group:'atmosphere'},
  {path:'fog.colors.explored', label:'Explored fog colour', kind:'color', group:'atmosphere'}
]);
export const FIELD_GROUPS = Object.freeze([
  {id:'light', label:'Light'}, {id:'night', label:'Night tint (full darkness)'},
  {id:'day', label:'Day tint (no darkness)'}, {id:'atmosphere', label:'Atmosphere'}
]);
const FIELD = new Map(MOOD_FIELDS.map(f => [f.path, f]));
const DARKNESS = 'environment.darknessLevel';

const freezePreset = p => Object.freeze({...p, set:Object.freeze(p.set)});
/** Shipped defaults: a starting point only, editable per world. Weather ids are core V14 ids. */
export const DEFAULT_MOODS = Object.freeze([
  {id:'day', label:'Day', kind:'mood', isDefault:true, set:{[DARKNESS]:0, 'weather':NO_WEATHER}},
  {id:'twilight', label:'Twilight', kind:'mood', isDefault:true, set:{[DARKNESS]:0.45, 'environment.base.hue':0.07, 'environment.base.intensity':0.35, 'weather':NO_WEATHER}},
  {id:'windy', label:'Windy (leaves)', kind:'mood', isDefault:true, set:{[DARKNESS]:0.1, 'weather':'leaves'}},
  {id:'storm', label:'Storm', kind:'mood', isDefault:true, set:{[DARKNESS]:0.6, 'environment.base.saturation':-0.4, 'weather':'rainStorm'}},
  {id:'night', label:'Night', kind:'mood', isDefault:true, set:{[DARKNESS]:0.9, 'weather':NO_WEATHER}}
].map(freezePreset));
export const DEFAULT_LAYERS = Object.freeze([
  {id:'mist', label:'Mist', kind:'layer', isDefault:true, set:{'weather':'fog'}},
  {id:'rain', label:'Rain', kind:'layer', isDefault:true, set:{'weather':'rain'}},
  {id:'snow', label:'Snow', kind:'layer', isDefault:true, set:{'weather':'snow'}},
  // Night tint only shows when the scene blends day and night colours by darkness, so these turn that on (0.35.1).
  {id:'cold-night', label:'Cold night', kind:'layer', isDefault:true, set:{'environment.cycle':true, 'environment.dark.hue':0.6, 'environment.dark.intensity':0.4}},
  {id:'blood-moon', label:'Blood moon', kind:'layer', isDefault:true, set:{'environment.cycle':true, 'environment.dark.hue':0, 'environment.dark.intensity':0.6, 'environment.dark.saturation':0.3}},
  {id:'hearth-glow', label:'Hearth glow', kind:'layer', isDefault:true, set:{'environment.globalLight.enabled':true, 'environment.globalLight.color':'#ffd9a0', 'environment.globalLight.luminosity':0.2}},
  {id:'pitch-black', label:'Pitch black', kind:'layer', isDefault:true, set:{[DARKNESS]:1, 'environment.globalLight.enabled':false}},
  {id:'bright-moon', label:'Bright moon', kind:'layer', isDefault:true, set:{[DARKNESS]:0.65, 'environment.dark.luminosity':0}}
].map(freezePreset));
const DEFAULTS = {mood:DEFAULT_MOODS, layer:DEFAULT_LAYERS};
/** 0.35.0 default sets that lacked `environment.cycle`; a stored, unedited copy is read as the current default. */
const OUTDATED_DEFAULT_SETS = Object.freeze({
  'cold-night':{'environment.dark.hue':0.6, 'environment.dark.intensity':0.4},
  'blood-moon':{'environment.dark.hue':0, 'environment.dark.intensity':0.6, 'environment.dark.saturation':0.3}
});
const sameSet = (a, b) => JSON.stringify(Object.entries(a ?? {}).sort()) === JSON.stringify(Object.entries(b ?? {}).sort());
/** Read-time upgrade of stored layers (never writes; re-runnable). Only untouched defaults change. */
export function upgradeStoredPreset(preset) {
  const old = OUTDATED_DEFAULT_SETS[preset?.id];
  if(!old || !preset.isDefault || !sameSet(preset.set, old)) return preset;
  const current = DEFAULT_LAYERS.find(p => p.id === preset.id);
  return {...preset, set:{...current.set}};
}
const NIGHT_TINT = path => path.startsWith('environment.dark.');
const SETTING = {mood:MOODS_SETTING, layer:LAYERS_SETTING};
const NOUN = {mood:'mood', layer:'layer'};

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const fail = message => ({ok:false, message});
const GM_ONLY = 'Only the GM can change scene moods.';
const kindOf = preset => preset?.kind === 'layer' ? 'layer' : 'mood';
const isColor = value => value === null || (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value));

/** Formats a stored value for messages and summaries. */
export function formatValue(path, value) {
  const field = FIELD.get(path);
  if(field?.kind === 'weather') return value || 'none';
  if(field?.kind === 'boolean') return value ? 'on' : 'off';
  if(field?.kind === 'color') return value || 'none';
  return typeof value === 'number' ? String(Math.round(value * 100) / 100) : String(value);
}

/** True when two stored values are the same for undo purposes (numbers within rounding, colours case-insensitive). */
export function sameValue(a, b) {
  if(typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-4;
  const norm = v => v === undefined ? null : typeof v === 'string' ? v.toLowerCase() : v;
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/** Checks a preset's shape and values; returns a list of problems (empty = valid). */
export function validatePreset(preset) {
  const problems = [];
  if(!preset || typeof preset !== 'object') return ['Preset must be an object.'];
  if(!/^[a-z0-9][a-z0-9-]{0,39}$/.test(String(preset.id ?? ''))) problems.push('Id must be 1–40 lowercase letters, digits or dashes.');
  if(!String(preset.label ?? '').trim()) problems.push('Label is required.');
  if(preset.kind !== undefined && !KINDS.includes(preset.kind)) problems.push('Kind must be mood or layer.');
  if(preset.transitionMs !== undefined && !(Number.isInteger(preset.transitionMs) && preset.transitionMs >= 0 && preset.transitionMs <= MAX_TRANSITION_MS))
    problems.push(`Transition must be whole milliseconds from 0 to ${MAX_TRANSITION_MS}.`);
  const set = preset.set;
  if(!set || typeof set !== 'object' || Array.isArray(set)) return [...problems, 'Preset must list the scene fields it sets.'];
  if(!Object.keys(set).length) problems.push('Choose at least one field to set.');
  return [...problems, ...validateSet(set)];
}

/** Checks a {path: value} map against MOOD_FIELDS. */
export function validateSet(set) {
  const problems = [];
  for(const [path, value] of Object.entries(set ?? {})) {
    const field = FIELD.get(path);
    if(!field) {problems.push(`${path} is not a supported mood field.`); continue;}
    if(field.kind === 'number' && !(typeof value === 'number' && Number.isFinite(value) && value >= field.min && value <= field.max))
      problems.push(`${field.label} must be a number from ${field.min} to ${field.max}.`);
    if(field.kind === 'boolean' && typeof value !== 'boolean') problems.push(`${field.label} must be on or off.`);
    if(field.kind === 'weather' && typeof value !== 'string') problems.push(`${field.label} must be a weather id or No weather.`);
    if(field.kind === 'color' && !isColor(value)) problems.push(`${field.label} must be a colour like #ffd9a0, or none.`);
  }
  return problems;
}

/** Feature-detects one Scene field on the live schema (falls back to the scene's own data). */
export function sceneHasField(scene, path) {
  const schema = scene?.constructor?.schema;
  if(typeof schema?.getField === 'function') return Boolean(schema.getField(path));
  return getPath(scene?._source ?? scene, path) !== undefined;
}

/** A field's stored value: source data where Foundry has it (colours stay "#rrggbb" strings), else the document. */
export function readField(scene, path) {
  const value = getPath(scene?._source ?? scene, path);
  return value === undefined ? null : clone(value);
}

const tidyPreset = p => {
  const out = {id:p.id, label:String(p.label).trim(), kind:kindOf(p), isDefault:Boolean(p.isDefault), set:{...p.set}};
  if(p.transitionMs > 0) out.transitionMs = p.transitionMs;
  return out;
};

/**
 * Pure stack logic, exported for tests. `current` is a Map of path -> value the scene shows (kept up to date
 * as changes are planned); `writes` collects the scene changes; `kept` the fields left alone because they changed since.
 */
export function insertEntry(entries, index, entry, current, writes) {
  const fields = [];
  for(const [path, after] of Object.entries(entry.set)) {
    const higher = entries.slice(index).find(e => e.fields.some(f => f.path === path));
    if(higher) {
      const f = higher.fields.find(x => x.path === path);
      fields.push({path, before:clone(f.before), after:clone(after)});
      f.before = clone(after);
    } else {
      fields.push({path, before:clone(current.get(path) ?? null), after:clone(after)});
      if(!sameValue(current.get(path), after)) writes.set(path, clone(after));
      current.set(path, clone(after));
    }
  }
  const made = {id:entry.id, kind:entry.kind, label:entry.label, appliedAt:entry.appliedAt ?? Date.now(), fields};
  entries.splice(index, 0, made);
  return made;
}

export function removeEntry(entries, index, current, writes, kept) {
  const [gone] = entries.splice(index, 1);
  for(const f of gone?.fields ?? []) {
    const higher = entries.slice(index).find(e => e.fields.some(x => x.path === f.path));
    if(higher) {higher.fields.find(x => x.path === f.path).before = clone(f.before); continue;}
    if(sameValue(current.get(f.path), f.after)) {
      if(!sameValue(f.after, f.before)) writes.set(f.path, clone(f.before));
      current.set(f.path, clone(f.before));
    } else kept.push({path:f.path, entry:gone.label, value:current.get(f.path)});
  }
  return gone;
}

export function createSceneMoods({game, getConfig = () => globalThis.CONFIG, getCanvas = () => globalThis.canvas}) {
  const isGM = () => Boolean(game.user?.isGM);
  const weatherIds = () => Object.keys(getConfig()?.weatherEffects ?? {});
  const list = kind => {
    const stored = game.settings.get(MODULE_ID, SETTING[kind]);
    return clone(Array.isArray(stored) && stored.length ? stored : DEFAULTS[kind]).map(p => ({...(kind === 'layer' ? upgradeStoredPreset(p) : p), kind}));
  };
  const find = (kind, id) => list(kind).find(p => p.id === id);
  /** The viewed scene, else the active one, unless a scene id is given. */
  const resolveScene = sceneId => sceneId ? game.scenes?.get?.(sceneId) ?? null : getCanvas()?.scene ?? game.scenes?.active ?? null;
  const flag = (scene, key) => scene?.getFlag?.(MODULE_ID, key) ?? null;

  /** The scene's stack, converting the 0.22.0 moodBase/mood flags on the fly. Never writes. */
  function readStack(scene) {
    const stack = flag(scene, FLAG_STACK);
    if(stack && Array.isArray(stack.entries)) {
      const entries = clone(stack.entries);
      return {entries, original:readOriginal(stack.original, entries), legacy:Boolean(flag(scene, FLAG_BASE) || flag(scene, FLAG_MOOD))};
    }
    const base = flag(scene, FLAG_BASE);
    if(!base || !Array.isArray(base.fields)) return {entries:[], original:{}, legacy:Boolean(flag(scene, FLAG_MOOD))};
    const mood = flag(scene, FLAG_MOOD) || {};
    // The old base covered every field any mood had changed; the scene's current values stand in for "after"
    // so Back to normal still restores the original look exactly, as it did before.
    const entries = [{id:String(mood.id ?? 'mood'), kind:'mood', label:String(mood.label ?? 'Mood'), appliedAt:mood.appliedAt ?? base.capturedAt ?? Date.now(),
      fields:base.fields.filter(f => typeof f?.path === 'string').map(f => ({path:f.path, before:clone(f.value ?? null), after:readField(scene, f.path)}))}];
    return {legacy:true, entries, original:readOriginal(null, entries)};
  }
  /**
   * The captured original values. A 0.35.0 stack has none stored, so the lowest entry that set a field supplies
   * its `before` (higher entries' `before` is the lower entry's value). Only known fields are kept.
   */
  function readOriginal(stored, entries) {
    const out = {};
    if(stored && typeof stored === 'object' && !Array.isArray(stored))
      for(const [path, value] of Object.entries(stored)) if(FIELD.has(path)) out[path] = clone(value ?? null);
    for(const e of entries) for(const f of e.fields ?? []) if(FIELD.has(f.path) && !Object.hasOwn(out, f.path)) out[f.path] = clone(f.before ?? null);
    return out;
  }
  /** Records a field's value the first time Manager changes it; later changes keep the first value. */
  function capture(original, current, paths) {
    let added = false;
    for(const path of paths) if(!Object.hasOwn(original, path)) {original[path] = clone(current.get(path) ?? null); added = true;}
    return added;
  }
  const currentMap = scene => new Map(MOOD_FIELDS.map(f => [f.path, readField(scene, f.path)]));

  /**
   * Writes scene changes and the stack in one update. An original value is dropped once no entry sets the field
   * and the scene shows it again, so the stack clears itself when everything is back to how it was.
   */
  async function commit(scene, entries, writes, legacy, duration, original = {}, current = null) {
    const update = Object.fromEntries(writes);
    const owned = new Set(entries.flatMap(e => e.fields.map(f => f.path)));
    for(const path of Object.keys(original))
      if(!owned.has(path) && current && sameValue(current.get(path), original[path])) delete original[path];
    update[`flags.${MODULE_ID}.${FLAG_STACK}`] = entries.length || Object.keys(original).length ? {version:1, entries, original} : null;
    // Null clears the flags without the "-=" key syntax V14 deprecates.
    if(legacy) {update[`flags.${MODULE_ID}.${FLAG_BASE}`] = null; update[`flags.${MODULE_ID}.${FLAG_MOOD}`] = null;}
    // animateDarkness is an update option core reads to fade darkness; unsupported versions ignore it.
    const options = duration > 0 && writes.has(DARKNESS) ? {animateDarkness:duration} : {};
    await scene.update(update, options);
  }

  function checkSet(scene, set, label) {
    const missing = Object.keys(set).filter(path => !sceneHasField(scene, path));
    if(missing.length) return `This Foundry version has no scene field ${missing.join(', ')}. Nothing changed. Edit "${label}" to remove it.`;
    const weather = set.weather;
    if(weather && !weatherIds().includes(weather))
      return `Weather "${weather}" is not available in this world (known: ${weatherIds().join(', ') || 'none'}). Nothing changed. Edit "${label}" or choose No weather.`;
    return null;
  }
  const label = path => FIELD.get(path)?.label ?? path;
  const keptNote = kept => kept.length ? ` Kept because you changed ${kept.length === 1 ? 'it' : 'them'} since: ${kept.map(k => `${label(k.path)} ${formatValue(k.path, k.value)}`).join(', ')}.` : '';
  /** Night tint is blended in by darkness, so it barely shows on a bright scene or with blending off. */
  const tintNote = (set, current) => {
    if(!Object.keys(set).some(NIGHT_TINT)) return '';
    if(current.get('environment.cycle') === false) return ' Night tint does not show while "Blend day and night colours with darkness" is off: turn it on in Fine-tune.';
    const dark = Number(current.get(DARKNESS) ?? 0);
    return dark < 0.5 ? ` Night tint shows only as the scene gets dark (Darkness is ${formatValue(DARKNESS, dark)} now): add a darker mood such as Night, or raise Darkness in Fine-tune.` : '';
  };
  const lockNote = (scene, writes) => getPath(scene, 'environment.darknessLock') && writes.has(DARKNESS) ? ' Darkness is locked on this scene, so Foundry may keep the old darkness.' : '';
  const durationFor = (animate, preset) => {
    const ms = animate ?? preset?.transitionMs ?? 0;
    return Number.isFinite(ms) ? Math.max(0, Math.min(MAX_TRANSITION_MS, ms)) : 0;
  };
  const sceneOrFail = sceneId => resolveScene(sceneId) ?? null;
  const NO_SCENE = 'No scene to change: view or activate a scene first.';

  /** Core Region behaviours that change how weather or darkness show on this scene (read only, for warnings). */
  function regionNotes(scene) {
    const regions = scene?.regions?.contents ?? (Array.isArray(scene?.regions) ? scene.regions : []);
    let weather = 0, darkness = 0;
    for(const r of regions) {
      const behaviors = r?.behaviors?.contents ?? (Array.isArray(r?.behaviors) ? r.behaviors : []);
      if(behaviors.some(b => b?.type === 'suppressWeather' && !b.disabled)) weather++;
      if(behaviors.some(b => b?.type === 'adjustDarknessLevel' && !b.disabled)) darkness++;
    }
    return {weather, darkness};
  }

  async function savePresets(kind, presetList) {
    if(!isGM()) return fail(GM_ONLY);
    if(!KINDS.includes(kind)) return fail('Kind must be mood or layer.');
    if(!Array.isArray(presetList) || !presetList.length) return fail(`Keep at least one ${NOUN[kind]}.`);
    const ids = new Set();
    for(const preset of presetList) {
      const problems = validatePreset({...preset, kind});
      if(ids.has(preset?.id)) problems.push(`Id ${preset.id} is used twice.`);
      if(problems.length) return fail(`${preset?.label || preset?.id || 'Preset'}: ${problems.join(' ')}`);
      ids.add(preset.id);
    }
    const tidy = presetList.map(p => tidyPreset({...p, kind}));
    await game.settings.set(MODULE_ID, SETTING[kind], tidy);
    return {ok:true, presets:clone(tidy)};
  }

  /** Validates an exported moods file; returns {problems, presets} with every preset tagged with its kind. */
  function readFile(data) {
    if(!data || typeof data !== 'object' || data.format !== FILE_FORMAT) return {problems:[`This is not an Ashen Gate moods file (format must be "${FILE_FORMAT}").`], presets:[]};
    if(data.formatVersion !== FILE_VERSION) return {problems:[`Moods file version ${data.formatVersion} is not supported (expected ${FILE_VERSION}).`], presets:[]};
    if(!Array.isArray(data.presets)) return {problems:['The moods file has no presets list.'], presets:[]};
    return {problems:[], presets:data.presets.map(p => ({...p, kind:kindOf(p)}))};
  }
  function previewImport(data) {
    const {problems, presets} = readFile(data);
    if(problems.length) return {ok:false, message:problems.join(' '), items:[]};
    const known = new Set(weatherIds());
    const items = presets.map(p => {
      const issues = validatePreset(p);
      if(issues.length) return {kind:p.kind, id:String(p.id ?? ''), label:String(p.label ?? p.id ?? 'Preset'), status:'invalid', problems:issues};
      const mine = find(p.kind, p.id);
      const same = mine && mine.label === String(p.label).trim() && JSON.stringify(Object.entries(mine.set).sort()) === JSON.stringify(Object.entries(p.set).sort()) && (mine.transitionMs ?? 0) === (p.transitionMs ?? 0);
      return {kind:p.kind, id:p.id, label:String(p.label).trim(), status:!mine ? 'new' : same ? 'same' : 'conflict', problems:[],
        unavailable:p.set.weather && !known.has(p.set.weather) ? p.set.weather : null};
    });
    return {ok:true, items};
  }

  return {
    fields:MOOD_FIELDS,
    groups:FIELD_GROUPS,
    listMoods() {
      if(!isGM()) return fail(GM_ONLY);
      return {ok:true, presets:list('mood'), layers:list('layer'), weatherIds:weatherIds()};
    },
    getState(sceneId) {
      if(!isGM()) return fail(GM_ONLY);
      const scene = resolveScene(sceneId);
      if(!scene) return {ok:true, scene:null, mood:null, layers:[], hasBase:false, favourites:[], values:{}};
      const {entries, original} = readStack(scene);
      const owners = new Map();
      for(const e of entries) for(const f of e.fields) owners.set(f.path, e);
      const describe = e => ({id:e.id, kind:e.kind, label:e.label, appliedAt:e.appliedAt,
        fields:e.fields.map(f => ({path:f.path, label:label(f.path), value:formatValue(f.path, f.after), covered:owners.get(f.path) !== e}))});
      const mood = entries.find(e => e.kind === 'mood');
      const favourites = flag(scene, FLAG_FAVOURITES);
      return {ok:true, scene:{id:scene.id, name:scene.name, darknessLock:Boolean(getPath(scene, 'environment.darknessLock')), regions:regionNotes(scene)},
        mood:mood ? describe(mood) : null, layers:entries.filter(e => e.kind === 'layer').map(describe), hasBase:entries.length > 0 || Object.keys(original).length > 0,
        favourites:Array.isArray(favourites) ? favourites.filter(id => typeof id === 'string') : [],
        values:Object.fromEntries(MOOD_FIELDS.filter(f => sceneHasField(scene, f.path)).map(f => [f.path, readField(scene, f.path)]))};
    },
    /** Sets the scene's base mood, keeping any layers on top. */
    async applyMood(moodId, {sceneId, animate} = {}) {
      if(!isGM()) return fail(GM_ONLY);
      const scene = sceneOrFail(sceneId);
      if(!scene) return fail(NO_SCENE);
      const preset = find('mood', moodId);
      if(!preset) return fail(`Mood "${moodId}" does not exist.`);
      const problems = validatePreset(preset);
      if(problems.length) return fail(`${preset.label}: ${problems.join(' ')}`);
      const blocked = checkSet(scene, preset.set, preset.label);
      if(blocked) return fail(blocked);
      const {entries, original, legacy} = readStack(scene);
      const current = currentMap(scene), writes = new Map(), kept = [];
      const old = entries.findIndex(e => e.kind === 'mood');
      capture(original, current, [...Object.keys(preset.set), ...(old >= 0 ? entries[old].fields.map(f => f.path) : [])]);
      if(old >= 0) removeEntry(entries, old, current, writes, kept);
      insertEntry(entries, 0, {id:preset.id, kind:'mood', label:preset.label, set:preset.set}, current, writes);
      await commit(scene, entries, writes, legacy, durationFor(animate, preset), original, current);
      const covered = Object.keys(preset.set).filter(path => entries.slice(1).some(e => e.fields.some(f => f.path === path)));
      const coverNote = covered.length ? ` Layers on top still decide ${covered.map(label).join(', ')}.` : '';
      return {ok:true, message:`${scene.name}: ${preset.label}.${coverNote}${keptNote(kept)}${tintNote(preset.set, current)}${lockNote(scene, writes)}`};
    },
    /** Puts a layer on top of the stack. */
    async addLayer(layerId, {sceneId, animate} = {}) {
      if(!isGM()) return fail(GM_ONLY);
      const scene = sceneOrFail(sceneId);
      if(!scene) return fail(NO_SCENE);
      const preset = find('layer', layerId);
      if(!preset) return fail(`Layer "${layerId}" does not exist.`);
      const problems = validatePreset(preset);
      if(problems.length) return fail(`${preset.label}: ${problems.join(' ')}`);
      const blocked = checkSet(scene, preset.set, preset.label);
      if(blocked) return fail(blocked);
      const {entries, original, legacy} = readStack(scene);
      if(entries.some(e => e.kind === 'layer' && e.id === preset.id)) return fail(`${preset.label} is already on ${scene.name}. Remove it first to apply it again.`);
      const replaced = entries.filter(e => e.fields.some(f => f.path in preset.set && !entries.slice(entries.indexOf(e) + 1).some(h => h.fields.some(x => x.path === f.path))));
      const current = currentMap(scene), writes = new Map();
      capture(original, current, Object.keys(preset.set));
      insertEntry(entries, entries.length, {id:preset.id, kind:'layer', label:preset.label, set:preset.set}, current, writes);
      await commit(scene, entries, writes, legacy, durationFor(animate, preset), original, current);
      const note = replaced.length ? ` It replaces ${replaced.map(e => e.label).join(', ')} for the fields they share.` : '';
      return {ok:true, message:`${scene.name}: ${preset.label} added.${note}${tintNote(preset.set, current)}${lockNote(scene, writes)}`};
    },
    /** Removes one layer (or the base mood with kind 'mood'), putting back only its own fields. */
    async removeEffect(id, {kind = 'layer', sceneId, animate = 0} = {}) {
      if(!isGM()) return fail(GM_ONLY);
      const scene = sceneOrFail(sceneId);
      if(!scene) return fail(NO_SCENE);
      const {entries, original, legacy} = readStack(scene);
      const at = entries.findIndex(e => e.kind === kind && e.id === id);
      if(at < 0) return fail(`${NOUN[kind] === 'mood' ? 'That mood' : 'That layer'} is not on ${scene.name}.`);
      const current = currentMap(scene), writes = new Map(), kept = [];
      const gone = removeEntry(entries, at, current, writes, kept);
      await commit(scene, entries, writes, legacy, durationFor(animate), original, current);
      return {ok:true, kept, message:`${scene.name}: ${gone.label} removed. Only its own fields were put back.${keptNote(kept)}`};
    },
    /**
     * Back to normal: writes every captured original value back (moods, layers and fine-tune edits alike),
     * then clears the stack. Fields Manager never changed are left alone.
     */
    async restore({sceneId, animate = 0} = {}) {
      if(!isGM()) return fail(GM_ONLY);
      const scene = sceneOrFail(sceneId);
      if(!scene) return fail(NO_SCENE);
      const {entries, original, legacy} = readStack(scene);
      if(!entries.length && !Object.keys(original).length) return fail(`${scene.name} has no mood, layer or fine-tune change applied, so there is nothing to restore.`);
      const current = currentMap(scene);
      const writes = new Map(Object.entries(original).filter(([path, value]) => sceneHasField(scene, path) && !sameValue(current.get(path), value)).map(([p, v]) => [p, clone(v)]));
      await commit(scene, [], writes, legacy, durationFor(animate));
      const n = writes.size;
      return {ok:true, kept:[], message:`${scene.name}: back to normal. ${n ? `${n} setting${n === 1 ? '' : 's'} restored to the scene's original values (${[...writes.keys()].map(label).join(', ')}).` : 'The scene already showed its original values.'}`};
    },
    /**
     * Fine-tune panel: writes the given fields straight to the scene, outside the stack (it is the GM's own edit,
     * so a later layer removal keeps it; Back to normal undoes it). Only fields that differ from the scene are written.
     */
    async applyDraft(set, {sceneId, animate = 0} = {}) {
      if(!isGM()) return fail(GM_ONLY);
      const scene = sceneOrFail(sceneId);
      if(!scene) return fail(NO_SCENE);
      if(!set || typeof set !== 'object' || Array.isArray(set)) return fail('Nothing to apply.');
      const problems = validateSet(set);
      if(problems.length) return fail(`Fine-tune: ${problems.join(' ')} Nothing changed.`);
      const blocked = checkSet(scene, set, 'the fine-tune values');
      if(blocked) return fail(blocked);
      const writes = new Map(Object.entries(set).filter(([path, value]) => !sameValue(readField(scene, path), value)).map(([p, v]) => [p, clone(v)]));
      if(!writes.size) return {ok:true, message:`${scene.name}: nothing to change, the scene already shows these values.`};
      const options = animate > 0 && writes.has(DARKNESS) ? {animateDarkness:Math.min(MAX_TRANSITION_MS, animate)} : {};
      // Capture the values before the first change so Back to normal can undo fine-tune too.
      const {entries, original, legacy} = readStack(scene);
      const current = currentMap(scene);
      const update = Object.fromEntries(writes);
      if(capture(original, current, writes.keys()) || legacy) {
        update[`flags.${MODULE_ID}.${FLAG_STACK}`] = {version:1, entries, original};
        if(legacy) {update[`flags.${MODULE_ID}.${FLAG_BASE}`] = null; update[`flags.${MODULE_ID}.${FLAG_MOOD}`] = null;}
      }
      await scene.update(update, options);
      for(const [path, value] of writes) current.set(path, value);
      return {ok:true, message:`${scene.name}: ${writes.size} setting${writes.size === 1 ? '' : 's'} changed (${[...writes.keys()].map(label).join(', ')}).${tintNote(set, current)}${lockNote(scene, writes)}`};
    },
    async toggleFavourite(moodId, {sceneId} = {}) {
      if(!isGM()) return fail(GM_ONLY);
      const scene = sceneOrFail(sceneId);
      if(!scene) return fail(NO_SCENE);
      const now = flag(scene, FLAG_FAVOURITES);
      const ids = Array.isArray(now) ? now.filter(id => typeof id === 'string') : [];
      const on = !ids.includes(moodId);
      if(on && !find('mood', moodId)) return fail(`Mood "${moodId}" does not exist.`);
      const next = on ? [...ids, moodId] : ids.filter(id => id !== moodId);
      await scene.update({[`flags.${MODULE_ID}.${FLAG_FAVOURITES}`]:next.length ? next : null});
      return {ok:true, favourite:on, message:`${find('mood', moodId)?.label ?? moodId} ${on ? 'is now a favourite' : 'is no longer a favourite'} on ${scene.name}.`};
    },
    savePresets,
    async savePreset(preset) {
      if(!isGM()) return fail(GM_ONLY);
      const kind = kindOf(preset);
      const presetList = list(kind);
      const at = presetList.findIndex(p => p.id === preset?.id);
      // An edited default is the GM's own preset from then on.
      const next = {...clone(preset ?? {}), kind, isDefault:false};
      if(at >= 0) presetList[at] = next; else presetList.push(next);
      return savePresets(kind, presetList);
    },
    async removePreset(id, {kind = 'mood'} = {}) {
      if(!isGM()) return fail(GM_ONLY);
      const presetList = list(kind);
      if(!presetList.some(p => p.id === id)) return fail(`${kind === 'layer' ? 'Layer' : 'Mood'} "${id}" does not exist.`);
      return savePresets(kind, presetList.filter(p => p.id !== id));
    },
    async resetDefaults() {
      if(!isGM()) return fail(GM_ONLY);
      await game.settings.set(MODULE_ID, MOODS_SETTING, []);
      await game.settings.set(MODULE_ID, LAYERS_SETTING, []);
      return {ok:true, presets:list('mood'), layers:list('layer')};
    },
    /** Builds a moods file (presets only, never scene data). */
    exportPresets({moods = true, layers = true} = {}) {
      if(!isGM()) return fail(GM_ONLY);
      const presets = [...(moods ? list('mood') : []), ...(layers ? list('layer') : [])].map(p => {
        const out = {id:p.id, label:p.label, kind:p.kind, set:{...p.set}};
        if(p.transitionMs > 0) out.transitionMs = p.transitionMs;
        return out;
      });
      if(!presets.length) return fail('Choose moods, layers or both to export.');
      const version = game.modules?.get?.(MODULE_ID)?.version;
      const data = {format:FILE_FORMAT, formatVersion:FILE_VERSION, exportedFrom:`${MODULE_ID}${version ? ` ${version}` : ''}`, exportedAt:new Date().toISOString(), presets};
      return {ok:true, data, filename:'ashen-gate-moods.json'};
    },
    previewImport(data) {
      if(!isGM()) return fail(GM_ONLY);
      return previewImport(data);
    },
    /**
     * Imports a moods file. `choices` maps "kind:id" of a conflicting preset to keep (default), replace or both
     * (adds a copy with a new id). New presets are added; invalid ones are skipped; scenes are never changed.
     */
    async importPresets(data, {choices = {}} = {}) {
      if(!isGM()) return fail(GM_ONLY);
      const preview = previewImport(data);
      if(!preview.ok) return preview;
      const {presets} = readFile(data);
      const lists = {mood:list('mood'), layer:list('layer')};
      const counts = {added:0, replaced:0, copied:0, kept:0, skipped:0};
      const changed = new Set();
      preview.items.forEach((item, i) => {
        const p = tidyPreset({...presets[i], isDefault:false});
        if(item.status === 'invalid') {counts.skipped++; return;}
        if(item.status === 'same') {counts.kept++; return;}
        const target = lists[item.kind];
        if(item.status === 'new') {target.push(p); counts.added++; changed.add(item.kind); return;}
        const choice = choices[`${item.kind}:${item.id}`] ?? 'keep';
        if(choice === 'replace') {target[target.findIndex(x => x.id === p.id)] = p; counts.replaced++; changed.add(item.kind);}
        else if(choice === 'both') {
          let n = 2, id;
          do id = `${p.id.slice(0, 37)}-${n++}`; while(target.some(x => x.id === id));
          target.push({...p, id, label:`${p.label} (imported)`}); counts.copied++; changed.add(item.kind);
        } else counts.kept++;
      });
      for(const kind of changed) {
        const out = await savePresets(kind, lists[kind]);
        if(!out.ok) return out;
      }
      const parts = [['added', counts.added], ['replaced', counts.replaced], ['added as copies', counts.copied], ['kept as they were', counts.kept], ['skipped (invalid)', counts.skipped]]
        .filter(([, n]) => n).map(([w, n]) => `${n} ${w}`);
      return {ok:true, counts, message:`Moods file imported: ${parts.join(', ') || 'nothing to change'}. Scenes were not changed.`};
    }
  };
}
