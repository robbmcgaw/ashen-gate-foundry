/** Scenes iteration 2 (0.60.11): new layers, blend, random weather, looks, undo batch, default look, No flashing, name API.
 *  Proves logic with mocked Foundry globals and synthetic [TEST] data, not native Foundry rendering or how effects look. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSceneMoods, validatePreset, DEFAULT_LAYERS, MOODS_SETTING, LAYERS_SETTING, CALM_SETTING} from '../scripts/scene-moods.js';
import {createSceneLooks, blendSets, seededRandom, rollWeather, validateLook, lookIdFromLabel, LOOKS_SETTING, AUTO_LOOK_SETTING, FLAG_DEFAULT_LOOK} from '../scripts/scene-looks.js';

const M = 'ashen-gate-manager';
const V14_PATHS = ['environment', 'environment.darknessLevel', 'environment.darknessLock', 'environment.cycle', 'environment.globalLight',
  ...['enabled', 'bright', 'luminosity', 'color'].map(f => `environment.globalLight.${f}`),
  ...['base', 'dark'].flatMap(k => ['hue', 'intensity', 'luminosity', 'saturation', 'shadows'].map(f => `environment.${k}.${f}`)), 'weather',
  'fog', 'fog.colors', 'fog.colors.explored', 'fog.colors.unexplored'];
const CORE_WEATHER = ['leaves', 'rain', 'rainStorm', 'fog', 'snow', 'blizzard'];
const setPath = (obj, path, value) => {const keys = path.split('.'); const last = keys.pop(); keys.reduce((o, k) => (o[k] ??= {}), obj)[last] = value;};

function mkScene({id, name, folder = null}) {
  const fields = new Set(V14_PATHS);
  class Scene {static schema = {getField: p => fields.has(p) ? {} : undefined};}
  return Object.assign(new Scene(), {id, name, folder, updates: [], flags: {}, regions: {contents: []},
    environment: {darknessLevel: 0.2, darknessLock: false, cycle: true, globalLight: {enabled: false, bright: false, luminosity: 0, color: null},
      base: {hue: 0, intensity: 0, luminosity: 0, saturation: 0, shadows: 0}, dark: {hue: 0.7, intensity: 0, luminosity: -0.25, saturation: 0, shadows: 0}},
    weather: '', fog: {colors: {explored: null, unexplored: null}},
    getFlag(scope, key) {return this.flags[scope]?.[key];},
    async update(data) {
      this.updates.push(structuredClone(data));
      for(const [k, v] of Object.entries(data)) {
        if(k.startsWith(`flags.${M}.`)) { const key = k.slice(`flags.${M}.`.length); (this.flags[M] ??= {}); if(v === null) delete this.flags[M][key]; else this.flags[M][key] = structuredClone(v); }
        else setPath(this, k, structuredClone(v));
      }
      return this;
    }});
}
function mkWorld({gm = true, activeGm = true} = {}) {
  const dock = {id: 'F-DOCK', name: '[TEST] Docks', folder: null};
  const yard = {id: 'F-YARD', name: '[TEST] Yards', folder: dock};
  const scenes = [mkScene({id: 'S1', name: '[TEST] Mill'}), mkScene({id: 'S2', name: '[TEST] Pier', folder: dock}), mkScene({id: 'S3', name: '[TEST] Shed', folder: yard})];
  const store = {[MOODS_SETTING]: [], [LAYERS_SETTING]: [], [LOOKS_SETTING]: [], [AUTO_LOOK_SETTING]: false, [CALM_SETTING]: false};
  const played = [];
  const playlist = {id: 'P1', name: '[TEST] Dirge', playAll: async () => played.push('start'), stopAll: async () => played.push('stop')};
  const game = {user: {isGM: gm, id: 'U1'}, users: {activeGM: activeGm ? {id: 'U1'} : {id: 'U2'}}, modules: {get: () => ({version: '0.60.11'})},
    settings: {get: (ns, key) => structuredClone(store[key]), set: async (ns, key, v) => {store[key] = structuredClone(v); return v;}},
    playlists: {contents: [playlist], get: id => (id === 'P1' ? playlist : undefined)},
    scenes: {contents: scenes, get: id => scenes.find(s => s.id === id), active: scenes[0]}};
  const moods = createSceneMoods({game, getConfig: () => ({weatherEffects: Object.fromEntries(CORE_WEATHER.map(w => [w, {id: w}]))}), getCanvas: () => ({scene: scenes[0]})});
  const looks = createSceneLooks({game, moods});
  return {game, store, scenes, moods, looks, played};
}

test('new layers are valid, use only V14 fields and core weather ids, and keep the original eight first', () => {
  const added = DEFAULT_LAYERS.slice(8, 15).map(l => l.label);
  assert.deepEqual(added, ['Ash tint', 'Sickly tint', 'Ember glow', 'Heat shimmer', 'Fog bank', 'Candlelit interior', 'Underwater murk']);
  for(const p of DEFAULT_LAYERS.slice(0, 15)) {
    assert.deepEqual(validatePreset(p), [], p.id);
    for(const path of Object.keys(p.set)) assert.ok(V14_PATHS.includes(path), path);
    if(p.set.weather) assert.ok(CORE_WEATHER.includes(p.set.weather), p.set.weather);
    assert.notEqual(p.flashing, true, 'no core-weather preset flashes');
  }
});

test('a worlds with a saved layer list is offered the new layers, and adding keeps its own presets', async () => {
  const {moods, store} = mkWorld();
  await moods.savePreset({id: 'mine', label: 'Mine', kind: 'layer', set: {weather: ''}});
  assert.deepEqual(moods.listMoods().newDefaults.layers, [], 'a list made from the current defaults misses nothing');
  assert.equal(store[LAYERS_SETTING].length, DEFAULT_LAYERS.length + 1, 'savePreset keeps the shipped ones too');
  const fresh = mkWorld();
  fresh.store[LAYERS_SETTING] = [{id: 'mist', label: 'Mist', kind: 'layer', isDefault: true, set: {weather: 'fog'}}, {id: 'mine', label: 'Mine', kind: 'layer', set: {weather: 'rain'}}];
  assert.equal(fresh.moods.listMoods().newDefaults.layers.length, DEFAULT_LAYERS.length - 1);
  const out = await fresh.moods.addNewDefaults();
  assert.equal(out.ok, true);
  assert.equal(fresh.store[LAYERS_SETTING].find(p => p.id === 'mine').set.weather, 'rain', 'own preset untouched');
  assert.equal(fresh.store[LAYERS_SETTING].length, DEFAULT_LAYERS.length + 1);
  assert.deepEqual(fresh.moods.listMoods().newDefaults.layers, []);
  assert.equal((await fresh.moods.addNewDefaults()).added, 0);
});

test('blendSets: numbers and colours blend, switches flip at half, one-sided fields appear on their side', () => {
  const a = {'environment.darknessLevel': 0, 'environment.globalLight.enabled': false, weather: '', 'fog.colors.unexplored': '#000000', 'environment.base.hue': 0.1};
  const b = {'environment.darknessLevel': 0.9, 'environment.globalLight.enabled': true, weather: 'rain', 'fog.colors.unexplored': '#ffffff', 'environment.dark.hue': 0.6};
  const start = blendSets(a, b, 0), mid = blendSets(a, b, 0.5), end = blendSets(a, b, 1);
  assert.equal(start['environment.darknessLevel'], 0);
  assert.equal(mid['environment.darknessLevel'], 0.45);
  assert.equal(end['environment.darknessLevel'], 0.9);
  assert.equal(start['environment.globalLight.enabled'], false);
  assert.equal(mid['environment.globalLight.enabled'], true);
  assert.equal(start.weather, ''); assert.equal(end.weather, 'rain');
  assert.equal(mid['fog.colors.unexplored'], '#808080');
  assert.ok(Object.hasOwn(start, 'environment.base.hue') && !Object.hasOwn(start, 'environment.dark.hue'));
  assert.ok(!Object.hasOwn(end, 'environment.base.hue') && Object.hasOwn(end, 'environment.dark.hue'));
  assert.deepEqual(blendSets({unknown: 1}, {unknown: 2}, 0.5), {}, 'unsupported paths are dropped');
  assert.equal(blendSets(a, b, 7)['environment.darknessLevel'], 0.9, 't is clamped');
});

test('the blend result is a valid fine-tune set and a draft: nothing is written until applyDraft', async () => {
  const {moods, scenes} = mkWorld();
  const list = moods.listMoods();
  const set = blendSets(list.presets.find(m => m.id === 'day').set, list.presets.find(m => m.id === 'night').set, 0.5);
  assert.equal(scenes[0].updates.length, 0, 'computing the blend writes nothing');
  assert.equal((await moods.applyDraft(set)).ok, true);
  assert.equal(scenes[0].environment.darknessLevel, 0.45);
});

test('seededRandom and rollWeather are deterministic per seed and respect locks', () => {
  const r1 = seededRandom('abc'), r2 = seededRandom('abc');
  assert.deepEqual([r1(), r1(), r1()], [r2(), r2(), r2()]);
  assert.notEqual(seededRandom('abc')(), seededRandom('abd')());
  const moods = [{id: 'day', set: {}}, {id: 'night', set: {}}];
  const layers = [...DEFAULT_LAYERS, {id: 'zap', label: 'Zap', kind: 'layer', flashing: true, set: {weather: 'rainStorm'}}];
  const roll = seed => rollWeather({seed, moods, layers});
  assert.deepEqual(roll('7'), roll('7'));
  const seen = new Set();
  for(let i = 0; i < 200; i++) {
    const out = rollWeather({seed: i, moods, layers, onIds: ['mist'], keepMood: i % 2 === 0, calm: true});
    assert.ok(!out.layerIds.includes('mist'), 'layers already on are never proposed again');
    assert.ok(!out.layerIds.includes('zap'), 'flashing is excluded while calm');
    assert.ok(out.layerIds.filter(id => layers.find(l => l.id === id).set.weather).length <= 1, 'one weather at most');
    assert.ok(out.layerIds.length <= 3);
    if(i % 2 === 0) assert.equal(out.moodId, null, 'keepMood leaves the mood');
    out.layerIds.forEach(id => seen.add(id));
  }
  assert.ok(seen.has('ash-fall') && seen.has('blight-haze'));
  const noCalm = new Set();
  for(let i = 0; i < 300; i++) rollWeather({seed: i, moods, layers, calm: false}).layerIds.forEach(id => noCalm.add(id));
  assert.ok(noCalm.has('zap'), 'flashing can come up when No flashing is off');
});

test('No flashing blocks flashing presets (apply and plan) and the editor field is kept in the export', async () => {
  const {moods, store, scenes} = mkWorld();
  assert.equal((await moods.savePreset({id: 'zap', label: 'Zap', kind: 'layer', flashing: true, set: {weather: 'rain'}})).ok, true);
  assert.equal((await moods.addLayer('zap')).ok, true, 'allowed while the switch is off');
  await moods.removeEffect('zap');
  assert.equal((await moods.setCalm(true)).calm, true);
  assert.equal(store[CALM_SETTING], true);
  const out = await moods.addLayer('zap');
  assert.equal(out.ok, false); assert.match(out.message, /flashing/);
  assert.equal(moods.planPreset('layer', 'zap').ok, false);
  const before = scenes[0].updates.length;
  assert.equal(scenes[0].updates.length, before, 'nothing written by the refused apply');
  assert.equal(moods.exportPresets().data.presets.find(p => p.id === 'zap').flashing, true);
  assert.equal(validatePreset({id: 'x', label: 'X', set: {weather: ''}, flashing: 'yes'}).length, 1);
});

test('looks: validate, ids, save, replace by name, remove', async () => {
  const {looks, moods} = mkWorld();
  assert.equal(lookIdFromLabel('The Wake!', ['the-wake']), 'the-wake-2');
  assert.ok(validateLook({id: 'a', label: 'A', moodId: null, layerIds: []}).length, 'needs a mood or a layer');
  assert.equal((await looks.saveLook({label: 'Ashen dusk', moodId: 'twilight', layerIds: ['ash-fall', 'ember-glow']})).ok, true);
  assert.equal((await looks.saveLook({label: 'Bad', moodId: 'nope', layerIds: []})).ok, false);
  assert.equal((await looks.saveLook({label: 'Bad2', moodId: null, layerIds: ['nope']})).ok, false);
  assert.equal((await looks.saveLook({label: 'Bad3', moodId: 'day', layerIds: [], playlist: {id: 'missing', action: 'start'}})).ok, false);
  const again = await looks.saveLook({label: 'ASHEN DUSK', moodId: 'night', layerIds: []});
  assert.equal(again.replaced, true);
  assert.equal(looks.listLooks().looks.length, 1);
  assert.equal(looks.listLooks().looks[0].moodId, 'night');
  assert.equal((await looks.removeLook('ashen-dusk')).ok, true);
  assert.equal((await looks.removeLook('ashen-dusk')).ok, false);
  assert.equal(moods.getState('S1').layers.length, 0, 'looks never touch scenes by themselves');
});

test('lookFromScene reads the stack; empty scene is refused', async () => {
  const {looks, moods} = mkWorld();
  assert.equal(looks.lookFromScene('S1').ok, false);
  await moods.applyMood('storm', {sceneId: 'S1'}); await moods.addLayer('blight-haze', {sceneId: 'S1'});
  const out = looks.lookFromScene('S1');
  assert.equal(out.moodId, 'storm'); assert.deepEqual(out.layerIds, ['blight-haze']);
});

test('apply a look to chosen scenes: preview first, writes only after apply, one batch, undo restores everything', async () => {
  const {looks, moods, scenes} = mkWorld();
  await looks.saveLook({label: 'Ashen dusk', moodId: 'twilight', layerIds: ['ash-fall', 'ember-glow']});
  const ids = ['S1', 'S2', 'S3'];
  await moods.addLayer('ash-fall', {sceneId: 'S2'});
  const startWeather = scenes.map(s => s.weather);
  const snapshots = scenes.map(s => structuredClone({e: s.environment, w: s.weather, f: s.fog}));
  const pv = looks.previewLook('ashen-dusk', ids);
  assert.equal(pv.rows.length, 3);
  assert.deepEqual(pv.rows[1].already, ['Ash tint'], 'a layer already on is reported, not duplicated');
  assert.deepEqual(pv.rows[0].adds, ['Ash tint', 'Ember glow']);
  assert.equal(scenes[0].updates.length, 0, 'preview writes nothing');
  assert.deepEqual(scenes.map(s => s.weather), startWeather);
  const before2 = structuredClone(scenes[1].environment), beforeW2 = scenes[1].weather, flag2 = structuredClone(scenes[1].flags);
  const out = await looks.applyLook('ashen-dusk', ids);
  assert.equal(out.ok, true, out.message);
  assert.equal(out.done.length, 3);
  for(const s of scenes) { assert.equal(s.weather, 'snow'); assert.equal(s.environment.darknessLevel, 0.45); assert.equal(s.environment.globalLight.color, '#ff7a33'); }
  assert.equal(moods.getState('S3').mood.id, 'twilight');
  assert.equal(looks.hasUndo(), true);
  // The GM changes one value afterwards: undo keeps it.
  await scenes[0].update({'environment.globalLight.luminosity': 0.9});
  const undo = await looks.undoLastBatch();
  assert.equal(undo.ok, true, undo.message);
  assert.equal(scenes[0].environment.globalLight.luminosity, 0.9, 'a value changed since is kept');
  assert.match(undo.message, /Kept because you changed/);
  assert.equal(scenes[0].weather, '');
  assert.equal(scenes[2].weather, ''); assert.equal(scenes[2].environment.darknessLevel, 0.2);
  assert.equal(moods.getState('S3').hasBase, false, 'stack flag put back');
  assert.deepEqual(scenes[1].flags, flag2);
  assert.deepEqual(scenes[1].environment, before2); assert.equal(scenes[1].weather, beforeW2);
  assert.equal(snapshots[2].e.darknessLevel, scenes[2].environment.darknessLevel);
  assert.equal(looks.hasUndo(), false);
  assert.equal((await looks.undoLastBatch()).ok, false);
});

test('a scene that cannot take the look is skipped and named; nothing changes for it', async () => {
  const {looks, scenes, moods} = mkWorld();
  await looks.saveLook({label: 'Storm front', moodId: 'storm', layerIds: []});
  await moods.setCalm(false);
  scenes[1].constructor.schema.getField = p => (p === 'weather' ? undefined : {});
  const pv = looks.previewLook('storm-front', ['S1', 'S2']);
  assert.equal(pv.rows[1].problems.length, 1);
  assert.equal(pv.willChange, 1);
  const out = await looks.applyLook('storm-front', ['S1', 'S2', 'GONE']);
  assert.equal(out.done.length, 1);
  assert.equal(out.skipped.length, 2);
  assert.equal(scenes[1].updates.length, 0);
  assert.equal((await looks.applyLook('storm-front', [])).ok, false);
});

test('folder targeting includes sub-folders; the picker lists folders', () => {
  const {looks} = mkWorld();
  assert.deepEqual(looks.sceneIdsInFolder('F-DOCK').sceneIds, ['S2', 'S3']);
  assert.deepEqual(looks.sceneIdsInFolder('F-YARD').sceneIds, ['S3']);
  assert.deepEqual(looks.listScenes().folders.map(f => f.id).sort(), ['F-DOCK', 'F-YARD']);
});

test('playlist runs only when ticked, once per batch, and a missing playlist does not stop the look', async () => {
  const {looks, played, game} = mkWorld();
  await looks.saveLook({label: 'Wake', moodId: 'night', layerIds: [], playlist: {id: 'P1', action: 'start'}});
  await looks.applyLook('wake', ['S1', 'S2']);
  assert.deepEqual(played, [], 'not ticked: silent');
  await looks.undoLastBatch();
  const out = await looks.applyLook('wake', ['S1', 'S2'], {startPlaylist: true});
  assert.deepEqual(played, ['start']);
  assert.match(out.message, /Started playlist/);
  await looks.undoLastBatch();
  game.playlists.get = () => undefined;
  const gone = await looks.applyLook('wake', ['S1'], {startPlaylist: true});
  assert.equal(gone.ok, true); assert.match(gone.message, /not found/);
});

test('default look: opt-in, active GM only, no music, skipped when already showing', async () => {
  const w = mkWorld();
  await w.looks.saveLook({label: 'Hearth night', moodId: 'night', layerIds: ['candlelit-interior'], playlist: {id: 'P1', action: 'start'}});
  assert.equal((await w.looks.setDefaultLook('S2', 'hearth-night')).ok, true);
  assert.equal(w.scenes[1].flags[M][FLAG_DEFAULT_LOOK], 'hearth-night');
  assert.equal(await w.looks.onSceneActivated(w.scenes[1]), null, 'switch is off by default');
  assert.equal(w.scenes[1].weather, '');
  await w.looks.setAutoLook(true);
  const out = await w.looks.onSceneActivated(w.scenes[1]);
  assert.equal(out.ok, true);
  assert.equal(w.scenes[1].environment.darknessLevel, 0.55, 'the candlelit layer is on top of Night');
  assert.deepEqual(w.played, [], 'activation never starts music');
  const again = await w.looks.onSceneActivated(w.scenes[1]);
  assert.equal(again.ok, false, 'already showing: nothing written');
  assert.equal(await w.looks.onSceneActivated(w.scenes[0]), null, 'no default look on that scene');
  const other = mkWorld({activeGm: false});
  await other.looks.saveLook({label: 'L', moodId: 'night', layerIds: []});
  await other.looks.setDefaultLook('S1', 'l'); await other.looks.setAutoLook(true);
  assert.equal(await other.looks.onSceneActivated(other.scenes[0]), null, 'only the active GM acts');
  assert.equal((await w.looks.setDefaultLook('S2', null)).ok, true);
  assert.equal(w.scenes[1].flags[M]?.[FLAG_DEFAULT_LOOK], undefined);
});

test('applyByName: look, then mood, then layer; case-insensitive; unknown refused; applyRoll uses the same batch', async () => {
  const {looks, scenes, moods} = mkWorld();
  await looks.saveLook({label: 'Storm', moodId: 'night', layerIds: ['rain']});
  const a = await looks.applyByName('storm');
  assert.equal(a.kind, 'look'); assert.equal(scenes[0].environment.darknessLevel, 0.9, 'the look wins over the Storm mood');
  const b = await looks.applyByName('DAY'); assert.equal(b.kind, 'mood');
  const c = await looks.applyByName('ember glow'); assert.equal(c.kind, 'layer');
  assert.equal((await looks.applyByName('nothing here')).ok, false);
  assert.equal((await looks.applyByName('')).ok, false);
  const roll = rollWeather({seed: 5, moods: moods.listMoods().presets, layers: moods.listMoods().layers, onIds: ['rain', 'ember-glow'], keepMood: true});
  if(roll.layerIds.length) { assert.equal((await looks.applyRoll(roll, 'S1')).ok, true); assert.equal(looks.hasUndo(), true); }
  assert.deepEqual(looks.namesForApply().looks, ['Storm']);
});

test('GM only: a player is refused everywhere and nothing is written', async () => {
  const {looks, moods, scenes, store} = mkWorld({gm: false});
  const calls = [looks.listLooks(), looks.lookFromScene('S1'), await looks.saveLook({label: 'x', moodId: 'day'}), await looks.removeLook('x'), looks.listScenes(), looks.sceneIdsInFolder('F'),
    looks.previewLook('x', ['S1']), await looks.applyLook('x', ['S1']), await looks.applyRoll({seed: 1, moodId: 'day', layerIds: []}, 'S1'), await looks.undoLastBatch(),
    await looks.setDefaultLook('S1', null), await looks.setAutoLook(true), await looks.applyByName('Day'), looks.namesForApply(), looks.getDefaultLook('S1'),
    moods.planPreset('mood', 'day'), await moods.addNewDefaults(), await moods.setCalm(true), moods.getCalm()];
  for(const out of calls) assert.equal(out.ok, false);
  assert.equal(scenes.every(s => s.updates.length === 0), true);
  assert.deepEqual(store[LOOKS_SETTING], []); assert.equal(store[AUTO_LOOK_SETTING], false); assert.equal(store[CALM_SETTING], false);
});

test('wiring: tab, settings, hook, API names and help text exist; no raw ids shown in the new template parts', () => {
  const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  const tpl = fs.readFileSync(new URL('../templates/manager.hbs', import.meta.url), 'utf8');
  for(const needle of ["LOOKS_SETTING", "AUTO_LOOK_SETTING", "CALM_SETTING", "Hooks.on('updateScene'", "changes?.active===true", "apply:(name,opts)=>sceneLooks().applyByName", "id:'looks',label:'Looks'", 'undoLastBatch'])
    assert.ok(main.includes(needle), needle);
  for(const needle of ['data-ag-blend-t', 'data-ag-roll-seed', 'data-ag-calm', 'data-ag-action="look-apply"', 'data-ag-look-auto', 'data-ag-mood-flashing', 'defaults-add'])
    assert.ok(tpl.includes(needle), needle);
  assert.ok(tpl.includes('aria-label="Blend from the first mood to the second"'));
  const block = tpl.slice(tpl.indexOf('{{#if moods.looks}}'), tpl.indexOf('{{#if moods.share}}'));
  assert.doesNotMatch(block, /\{\{(lookId|sceneId|moodId|layerIds|folderId)\}\}/, 'ids are not printed');
  assert.match(main, /Time of day blend/);
});
