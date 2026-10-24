/**
 * Scene looks (0.61.0): GM-only extras for the Scenes tab, built on the scene moods API (scene-moods.js).
 *
 *  - blendSets: a Day to Night style slider that blends two moods into a fine-tune draft (nothing is written until Apply).
 *  - rollWeather: a seeded "Random weather" proposal (same seed, same result) that is previewed before it is applied.
 *  - Looks: a saved combination (one base mood plus layers, optionally a playlist) applied to chosen scenes or a folder,
 *    with a preview list first and an undo for the last batch.
 *  - A per-scene default look, restored when that scene is activated (opt-in, off unless switched on).
 *  - applyByName: api.scenes.apply("Name") for macros.
 *
 * Writes go only through the scene moods API (the scene's own environment, weather and fog fields and Manager's own flags).
 * The only other things touched are a look's own world setting, a scene's own `defaultLook` flag and, only when the GM ticks it,
 * a playlist's play/stop through Foundry's public Playlist methods.
 */
import {MODULE_ID} from './core.js';
import {MOOD_FIELDS, FLAG_STACK, FLAG_BASE, FLAG_MOOD, readField, sameValue} from './scene-moods.js';

export const LOOKS_SETTING = 'sceneLooks';
export const AUTO_LOOK_SETTING = 'sceneAutoLook';
export const FLAG_DEFAULT_LOOK = 'defaultLook';
export const MAX_LOOK_LAYERS = 12;

const FIELD = new Map(MOOD_FIELDS.map(f => [f.path, f]));
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const fail = message => ({ok:false, message});
const GM_ONLY = 'Only the GM can change scene looks.';
const round = (value, step) => Math.round(value / step) * step;

/* ---------- blend ---------- */

const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const rgbToHex = rgb => `#${rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

/**
 * Blends two {path: value} sets. `t` 0 gives `a`, 1 gives `b`. Numbers and colours blend smoothly; on/off, weather and a colour set
 * on only one side switch over at the half-way point. A field only one mood sets is left out while the other mood leads.
 * Hue blends in a straight line (it does not take the short way round the colour wheel). Pure; returns a new set.
 */
export function blendSets(a, b, t) {
  const at = Math.max(0, Math.min(1, Number(t) || 0));
  const out = {};
  for(const path of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
    const field = FIELD.get(path);
    if(!field) continue;
    const hasA = a && Object.hasOwn(a, path), hasB = b && Object.hasOwn(b, path);
    const va = a?.[path], vb = b?.[path];
    if(hasA && hasB) {
      if(field.kind === 'number' && typeof va === 'number' && typeof vb === 'number')
        out[path] = Math.max(field.min, Math.min(field.max, Math.round(round(va + (vb - va) * at, field.step) * 1000) / 1000));
      else if(field.kind === 'color' && typeof va === 'string' && typeof vb === 'string' && /^#[0-9a-f]{6}$/i.test(va) && /^#[0-9a-f]{6}$/i.test(vb)) {
        const ca = hexToRgb(va), cb = hexToRgb(vb);
        out[path] = rgbToHex(ca.map((v, i) => v + (cb[i] - v) * at));
      } else out[path] = clone(at < 0.5 ? va : vb);
    } else if(hasA && at < 0.5) out[path] = clone(va);
    else if(hasB && at >= 0.5) out[path] = clone(vb);
  }
  return out;
}

/* ---------- seeded random ---------- */

/** Small deterministic generator (mulberry32) so a seed always gives the same roll. */
export function seededRandom(seed) {
  let h = 1779033703 ^ String(seed).length;
  for(const ch of String(seed)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = (h ^ (h >>> 16)) >>> 0 || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Blight layers come up a little more often than the rest: this is the Ashen Gate frontier. */
export const ROLL_WEIGHTS = Object.freeze({'ash-fall':2, 'blight-haze':2, 'ember-glow':1.5, 'fog-bank':1.5, 'heat-shimmer':1});
const pick = (rand, items, weightOf = () => 1) => {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0);
  let roll = rand() * total;
  for(const item of items) { roll -= weightOf(item); if(roll < 0) return item; }
  return items.at(-1);
};

/**
 * Proposes a mood and layers from a seed. Pure and previewable: nothing is applied here.
 * `moods`/`layers` are preset lists; `onIds` the layers already on the scene (never proposed again); `keepMood` leaves the base mood alone.
 * At most one weather layer and up to two other layers, and never a flashing preset while `calm` is on.
 */
export function rollWeather({seed, moods = [], layers = [], onIds = [], keepMood = true, calm = false}) {
  const rand = seededRandom(seed);
  const usable = list => list.filter(p => !(calm && p.flashing));
  const moodList = usable(moods);
  const free = usable(layers).filter(l => !onIds.includes(l.id));
  const hasWeather = l => Object.hasOwn(l.set ?? {}, 'weather') && Boolean(l.set.weather);
  const weather = free.filter(hasWeather), other = free.filter(l => !hasWeather(l));
  const weight = l => ROLL_WEIGHTS[l.id] ?? 1;
  const mood = !keepMood && moodList.length ? pick(rand, moodList) : null;
  const layerIds = [];
  if(weather.length && rand() < 0.6) layerIds.push(pick(rand, weather, weight).id);
  const pool = other.slice();
  for(let i = 0; i < 2 && pool.length; i++) {
    if(rand() >= (i === 0 ? 0.7 : 0.3)) continue;
    const chosen = pick(rand, pool, weight);
    layerIds.push(chosen.id);
    pool.splice(pool.indexOf(chosen), 1);
  }
  return {seed:String(seed), moodId:mood?.id ?? null, layerIds};
}

/* ---------- looks ---------- */

/** A look id from its label, unique among `taken`. Made once, when the look is saved. */
export function lookIdFromLabel(label, taken = []) {
  const used = new Set([...(taken ?? [])].map(String));
  const slug = String(label ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36).replace(/-+$/, '') || 'look';
  if(!used.has(slug)) return slug;
  for(let n = 2; ; n++) if(!used.has(`${slug}-${n}`)) return `${slug}-${n}`;
}

export function validateLook(look) {
  const problems = [];
  if(!look || typeof look !== 'object') return ['A look must be an object.'];
  if(!/^[a-z0-9][a-z0-9-]{0,39}$/.test(String(look.id ?? ''))) problems.push('Id must be 1-40 lowercase letters, digits or dashes.');
  if(!String(look.label ?? '').trim()) problems.push('A look needs a name.');
  if(look.moodId !== null && look.moodId !== undefined && typeof look.moodId !== 'string') problems.push('The base mood must be a mood id or none.');
  if(!Array.isArray(look.layerIds) || look.layerIds.some(id => typeof id !== 'string')) problems.push('Layers must be a list of layer ids.');
  else if(look.layerIds.length > MAX_LOOK_LAYERS) problems.push(`A look can hold at most ${MAX_LOOK_LAYERS} layers.`);
  if(!look.moodId && !(look.layerIds ?? []).length) problems.push('A look needs a base mood or at least one layer.');
  if(look.playlist != null) {
    if(typeof look.playlist !== 'object' || typeof look.playlist.id !== 'string' || !['start', 'stop'].includes(look.playlist.action)) problems.push('Playlist must name a playlist and Start or Stop.');
  }
  return problems;
}
const tidyLook = look => ({id:look.id, label:String(look.label).trim(), moodId:look.moodId || null, layerIds:[...new Set(look.layerIds ?? [])],
  playlist:look.playlist ? {id:look.playlist.id, action:look.playlist.action} : null});

/** Folder ids a scene sits under (its folder and every parent), feature-detected so any shape of folder works. */
function folderChain(scene) {
  const ids = [];
  for(let f = scene?.folder, guard = 0; f && guard < 20; f = f.folder, guard++) ids.push(f.id ?? f);
  return ids;
}

export function createSceneLooks({game, moods}) {
  const isGM = () => Boolean(game.user?.isGM);
  const readLooks = () => {
    const stored = game.settings.get(MODULE_ID, LOOKS_SETTING);
    return (Array.isArray(stored) ? stored : []).filter(l => l && typeof l === 'object' && !validateLook(l).length).map(tidyLook);
  };
  const sceneById = id => game.scenes?.get?.(id) ?? null;
  const flag = (scene, key) => scene?.getFlag?.(MODULE_ID, key) ?? null;
  let lastBatch = null;

  const playlistById = id => game.playlists?.get?.(id) ?? null;

  /** What applying a plan would do to one scene. Reads only. */
  function previewScene(scene, plan) {
    const row = {sceneId:scene.id, name:scene.name, setsMood:null, adds:[], already:[], problems:[]};
    if(plan.moodId) {
      const out = moods.planPreset('mood', plan.moodId, {sceneId:scene.id});
      if(!out.ok) row.problems.push(out.message); else row.setsMood = {label:out.label, alreadyOn:out.alreadyOn};
    }
    for(const id of plan.layerIds ?? []) {
      const out = moods.planPreset('layer', id, {sceneId:scene.id});
      if(!out.ok) row.problems.push(out.message);
      else if(out.alreadyOn) row.already.push(out.label);
      else row.adds.push(out.label);
    }
    row.changes = Boolean(row.setsMood && !row.setsMood.alreadyOn) || row.adds.length > 0;
    return row;
  }
  const snapshot = scene => ({sceneId:scene.id, name:scene.name,
    fields:Object.fromEntries(MOOD_FIELDS.map(f => [f.path, readField(scene, f.path)])),
    flags:{[FLAG_STACK]:clone(flag(scene, FLAG_STACK)), [FLAG_BASE]:clone(flag(scene, FLAG_BASE)), [FLAG_MOOD]:clone(flag(scene, FLAG_MOOD))}});

  /** Applies a {moodId, layerIds} plan to scenes, one by one. A scene that cannot take it is skipped and reported. */
  async function applyPlan(plan, sceneIds, {animate, playlist = null} = {}) {
    if(!isGM()) return fail(GM_ONLY);
    const ids = [...new Set(sceneIds ?? [])];
    if(!ids.length) return fail('Choose at least one scene.');
    const done = [], skipped = [], batch = [];
    for(const sceneId of ids) {
      const scene = sceneById(sceneId);
      if(!scene) { skipped.push({name:String(sceneId), why:'The scene no longer exists.'}); continue; }
      const row = previewScene(scene, plan);
      if(row.problems.length) { skipped.push({name:scene.name, why:row.problems.join(' ')}); continue; }
      if(!row.changes) { skipped.push({name:scene.name, why:'Already shows this look.'}); continue; }
      const before = snapshot(scene);
      try {
        if(plan.moodId && !row.setsMood.alreadyOn) { const out = await moods.applyMood(plan.moodId, {sceneId, animate}); if(!out.ok) throw new Error(out.message); }
        for(const id of plan.layerIds ?? []) {
          if(moods.planPreset('layer', id, {sceneId}).alreadyOn) continue;
          const out = await moods.addLayer(id, {sceneId, animate}); if(!out.ok) throw new Error(out.message);
        }
      } catch(error) { skipped.push({name:scene.name, why:`Stopped part way: ${error?.message ?? error}`}); }
      const after = snapshot(scene);
      const touched = Object.keys(after.fields).filter(p => !sameValue(after.fields[p], before.fields[p]));
      batch.push({sceneId, name:scene.name, before, afterFields:Object.fromEntries(touched.map(p => [p, after.fields[p]])), touched});
      if(!skipped.some(s => s.name === scene.name)) done.push(scene.name);
    }
    let playlistNote = '';
    if(playlist && done.length) playlistNote = ` ${await runPlaylist(playlist)}`;
    lastBatch = batch.length ? {label:plan.label ?? 'Look', scenes:batch, playlist:playlist ? {...playlist} : null} : lastBatch;
    const parts = [done.length ? `Applied to ${done.length} scene${done.length === 1 ? '' : 's'}.` : 'Nothing was applied.'];
    if(skipped.length) parts.push(`Skipped ${skipped.length}: ${skipped.map(s => `${s.name} (${s.why})`).join('; ')}`);
    return {ok:done.length > 0, done, skipped, message:`${parts.join(' ')}${playlistNote}${done.length ? ' Undo last batch puts them back.' : ''}`};
  }

  async function runPlaylist(spec) {
    const playlist = playlistById(spec.id);
    if(!playlist) return 'The linked playlist was not found, so the music was left alone.';
    try {
      if(spec.action === 'start') { if(typeof playlist.playAll !== 'function') return 'This Foundry cannot start that playlist from here.'; await playlist.playAll(); return `Started playlist ${playlist.name}.`; }
      if(typeof playlist.stopAll !== 'function') return 'This Foundry cannot stop that playlist from here.';
      await playlist.stopAll(); return `Stopped playlist ${playlist.name}.`;
    } catch(error) { return `The playlist did not change: ${error?.message ?? error}`; }
  }

  const planOfLook = look => ({label:look.label, moodId:look.moodId, layerIds:look.layerIds});

  return {
    listLooks() { return isGM() ? {ok:true, looks:readLooks()} : fail(GM_ONLY); },
    /** Reads the base mood and layers now on a scene as a look draft (nothing saved). */
    lookFromScene(sceneId) {
      if(!isGM()) return fail(GM_ONLY);
      const state = moods.getState(sceneId);
      if(!state.ok) return state;
      if(!state.scene) return fail('View or activate a scene first.');
      const known = moods.listMoods();
      const moodId = state.mood && known.presets.some(p => p.id === state.mood.id) ? state.mood.id : null;
      const layerIds = state.layers.map(l => l.id).filter(id => known.layers.some(p => p.id === id));
      if(!moodId && !layerIds.length) return fail('This scene has no mood or layers to save. Apply some first.');
      return {ok:true, moodId, layerIds, sceneName:state.scene.name};
    },
    async saveLook({label, moodId = null, layerIds = [], playlist = null, id} = {}) {
      if(!isGM()) return fail(GM_ONLY);
      const looks = readLooks();
      const existing = id ? looks.find(l => l.id === id) : looks.find(l => l.label.toLowerCase() === String(label ?? '').trim().toLowerCase());
      const look = {id:existing?.id ?? lookIdFromLabel(label, looks.map(l => l.id)), label, moodId, layerIds, playlist};
      const known = moods.listMoods();
      const problems = validateLook(look);
      if(moodId && !known.presets.some(p => p.id === moodId)) problems.push(`Mood "${moodId}" does not exist.`);
      for(const lid of layerIds) if(!known.layers.some(p => p.id === lid)) problems.push(`Layer "${lid}" does not exist.`);
      if(look.playlist && !playlistById(look.playlist.id)) problems.push('That playlist was not found.');
      if(problems.length) return fail(problems.join(' '));
      const next = existing ? looks.map(l => l.id === existing.id ? tidyLook(look) : l) : [...looks, tidyLook(look)];
      await game.settings.set(MODULE_ID, LOOKS_SETTING, next);
      return {ok:true, replaced:Boolean(existing), look:tidyLook(look), message:`Look "${String(label).trim()}" ${existing ? 'updated' : 'saved'}.`};
    },
    async removeLook(id) {
      if(!isGM()) return fail(GM_ONLY);
      const looks = readLooks();
      if(!looks.some(l => l.id === id)) return fail('That look does not exist.');
      await game.settings.set(MODULE_ID, LOOKS_SETTING, looks.filter(l => l.id !== id));
      return {ok:true, message:'Look removed. Scenes that already show it keep their look.'};
    },
    /** Scenes the pickers offer, with the folder name each sits in. */
    listScenes() {
      if(!isGM()) return fail(GM_ONLY);
      const scenes = (game.scenes?.contents ?? []).map(s => ({id:s.id, name:s.name, folder:s.folder?.name ?? '', folderId:s.folder?.id ?? ''}));
      const folders = new Map();
      for(const s of game.scenes?.contents ?? []) for(let f = s.folder, g = 0; f && g < 20; f = f.folder, g++) folders.set(f.id, f.name);
      return {ok:true, scenes, folders:[...folders].map(([id, name]) => ({id, name})).sort((a, b) => a.name.localeCompare(b.name))};
    },
    sceneIdsInFolder(folderId) {
      if(!isGM()) return fail(GM_ONLY);
      return {ok:true, sceneIds:(game.scenes?.contents ?? []).filter(s => folderChain(s).includes(folderId)).map(s => s.id)};
    },
    listPlaylists() { return isGM() ? {ok:true, playlists:(game.playlists?.contents ?? []).map(p => ({id:p.id, name:p.name}))} : fail(GM_ONLY); },
    /** Preview list for a look (or a loose plan) over scenes: one row per scene. */
    previewPlan(plan, sceneIds) {
      if(!isGM()) return fail(GM_ONLY);
      const rows = [...new Set(sceneIds ?? [])].map(id => sceneById(id)).filter(Boolean).map(scene => previewScene(scene, plan));
      return {ok:true, rows, willChange:rows.filter(r => !r.problems.length && r.changes).length};
    },
    previewLook(lookId, sceneIds) {
      if(!isGM()) return fail(GM_ONLY);
      const look = readLooks().find(l => l.id === lookId);
      if(!look) return fail('That look does not exist.');
      return {...this.previewPlan(planOfLook(look), sceneIds), look};
    },
    /** `startPlaylist` is the GM's tick in the preview; a look's playlist never plays without it. */
    async applyLook(lookId, sceneIds, {animate, startPlaylist = false} = {}) {
      if(!isGM()) return fail(GM_ONLY);
      const look = readLooks().find(l => l.id === lookId);
      if(!look) return fail('That look does not exist.');
      return applyPlan(planOfLook(look), sceneIds, {animate, playlist:startPlaylist ? look.playlist : null});
    },
    /** For Random weather: applies a rolled plan to one scene (same preview, batch and undo as a look). */
    async applyRoll(roll, sceneId, {animate} = {}) {
      if(!isGM()) return fail(GM_ONLY);
      return applyPlan({label:`Random weather ${roll.seed}`, moodId:roll.moodId, layerIds:roll.layerIds}, [sceneId], {animate});
    },
    hasUndo() { return Boolean(lastBatch); },
    describeUndo() { return lastBatch ? {label:lastBatch.label, scenes:lastBatch.scenes.map(s => s.name)} : null; },
    /**
     * Puts back what the last batch changed: every field it wrote goes back, but only where the scene still shows what the batch wrote
     * (a value you changed since is kept), and each scene's mood stack is put back as it was. Remembered until Manager reloads.
     */
    async undoLastBatch() {
      if(!isGM()) return fail(GM_ONLY);
      if(!lastBatch) return fail('There is no batch to undo. (Only the last batch since Foundry loaded can be undone; use Back to normal on a scene otherwise.)');
      const {scenes, label} = lastBatch;
      const kept = [], undone = [];
      for(const item of scenes) {
        const scene = sceneById(item.sceneId);
        if(!scene) continue;
        const update = {};
        for(const path of item.touched) {
          if(sameValue(readField(scene, path), item.afterFields[path])) update[path] = clone(item.before.fields[path]);
          else kept.push(`${scene.name}: ${FIELD.get(path)?.label ?? path}`);
        }
        for(const [key, value] of Object.entries(item.before.flags)) update[`flags.${MODULE_ID}.${key}`] = value ?? null;
        await scene.update(update);
        undone.push(scene.name);
      }
      lastBatch = null;
      return {ok:true, undone, kept, message:`Undid "${label}" on ${undone.length} scene${undone.length === 1 ? '' : 's'}.${kept.length ? ` Kept because you changed them since: ${kept.join(', ')}.` : ''}`};
    },
    /* ----- per-scene default look ----- */
    getDefaultLook(sceneId) {
      if(!isGM()) return fail(GM_ONLY);
      const id = flag(sceneById(sceneId || moods.getState()?.scene?.id), FLAG_DEFAULT_LOOK);
      return {ok:true, lookId:typeof id === 'string' && readLooks().some(l => l.id === id) ? id : null, auto:game.settings.get(MODULE_ID, AUTO_LOOK_SETTING) === true};
    },
    async setDefaultLook(sceneId, lookId) {
      if(!isGM()) return fail(GM_ONLY);
      const scene = sceneById(sceneId);
      if(!scene) return fail('Choose a scene first.');
      if(lookId && !readLooks().some(l => l.id === lookId)) return fail('That look does not exist.');
      await scene.update({[`flags.${MODULE_ID}.${FLAG_DEFAULT_LOOK}`]:lookId || null});
      return {ok:true, message:lookId ? `${scene.name} will use this look when it is activated, while "Restore default looks on activation" is on.` : `${scene.name} has no default look now.`};
    },
    async setAutoLook(on) {
      if(!isGM()) return fail(GM_ONLY);
      await game.settings.set(MODULE_ID, AUTO_LOOK_SETTING, Boolean(on));
      return {ok:true, auto:Boolean(on), message:on ? 'Default looks will be applied when a scene is activated.' : 'Scenes keep whatever look they have when activated.'};
    },
    /**
     * Hook handler for a scene becoming active. Only the active GM acts, only when the switch is on and the scene has a default look.
     * Never starts music, never fades, and skips a scene that already shows the look.
     */
    async onSceneActivated(scene) {
      try {
        if(!isGM() || game.users?.activeGM?.id !== game.user?.id) return null;
        if(game.settings.get(MODULE_ID, AUTO_LOOK_SETTING) !== true) return null;
        const lookId = flag(scene, FLAG_DEFAULT_LOOK);
        const look = lookId ? readLooks().find(l => l.id === lookId) : null;
        if(!look) return null;
        const out = await applyPlan(planOfLook(look), [scene.id], {animate:0});
        return out;
      } catch(error) { console.warn(`[${MODULE_ID}] Default look not applied`, error); return null; }
    },
    /**
     * api.scenes.apply("Name"): a look, then a mood, then a layer, matched by name (or permanent id), case-insensitively.
     * Looks apply to `sceneId` or the viewed/active scene. Playlists are never started from here unless `startPlaylist` is true.
     */
    async applyByName(name, {sceneId, animate, startPlaylist = false} = {}) {
      if(!isGM()) return fail(GM_ONLY);
      const wanted = String(name ?? '').trim().toLowerCase();
      if(!wanted) return fail('Give the name of a look, mood or layer.');
      const match = list => list.find(p => String(p.label).toLowerCase() === wanted) ?? list.find(p => p.id === wanted);
      const look = match(readLooks());
      const known = moods.listMoods();
      const target = sceneId ?? moods.getState()?.scene?.id;
      if(look) {
        if(!target) return fail('No scene to change: view or activate a scene first.');
        const out = await this.applyLook(look.id, [target], {animate, startPlaylist});
        return {...out, kind:'look'};
      }
      const mood = match(known.presets);
      if(mood) return {...await moods.applyMood(mood.id, {sceneId, animate}), kind:'mood'};
      const layer = match(known.layers);
      if(layer) return {...await moods.addLayer(layer.id, {sceneId, animate}), kind:'layer'};
      return fail(`No look, mood or layer is called "${name}".`);
    },
    namesForApply() {
      if(!isGM()) return fail(GM_ONLY);
      const known = moods.listMoods();
      return {ok:true, looks:readLooks().map(l => l.label), moods:known.presets.map(p => p.label), layers:known.layers.map(p => p.label)};
    }
  };
}
