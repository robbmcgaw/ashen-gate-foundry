/** 0.25.0 Default pin for places inside a Region: mocked Foundry; logic only. These tests do not render the real editor or canvas. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry, gm, player, Scene} from './foundry-mock.mjs';
import {readAll, writeAll, readViews, placeNote} from '../scripts/store.mjs';
import {createApi} from '../scripts/api.mjs';
import {normalizeLocation, pinPresentation, inheritedPin, effectivePin, notePatch, playerView, exportPackage, importRecords, parseImport, PIN_DEFAULTS, MODULE_ID} from '../scripts/model.mjs';

const L = (id, o = {}) => normalizeLocation({id: `LOC-${id}`, name: id, state: 'revealed', ...o});
const P = id => `LOC-${id}`;
const cp = (img = '', unidentifiedImg = '', size = 0) => ({img, unidentifiedImg, size});

test('resolution order: own, nearest ancestor, world setting, built-in', () => {
  const all = [L('ROOT', {childPin: cp('r.webp', 'ru.webp', 60)}), L('MID', {parentLocationId: P('ROOT'), childPin: cp('m.webp')}), L('LEAF', {parentLocationId: P('MID')}),
    L('OWN', {parentLocationId: P('MID'), pin: {img: 'own.webp', unidentifiedImg: 'ownu.webp', size: 30}}), L('FREE')];
  const leaf = pinPresentation(all[2], {all});
  assert.deepEqual([leaf.src, leaf.size], ['m.webp', 60], 'img from MID (nearest), size from ROOT (nearest that sets one)');
  assert.equal(pinPresentation({...all[2], state: 'hidden'}, {all}).src, 'ru.webp', 'hidden uses the hidden default, from ROOT');
  const own = pinPresentation(all[3], {all});
  assert.deepEqual([own.src, own.size], ['own.webp', 30], 'own value wins');
  assert.equal(pinPresentation({...all[3], state: 'unidentified'}, {all}).src, 'ownu.webp');
  // No ancestor default: world setting for the unidentified image, then built-ins.
  assert.equal(pinPresentation({...all[4], state: 'hidden'}, {all, unknownImg: 'world.webp'}).src, 'world.webp');
  assert.equal(pinPresentation(all[4], {all, unknownImg: 'world.webp'}).src, PIN_DEFAULTS.img);
  assert.equal(pinPresentation({...all[4], state: 'hidden'}, {all}).src, PIN_DEFAULTS.unidentifiedImg);
  // The ancestor default beats the world setting.
  assert.equal(pinPresentation({...all[2], state: 'hidden'}, {all, unknownImg: 'world.webp'}).src, 'ru.webp');
  // Without `all` (older callers) nothing changes.
  assert.equal(pinPresentation(all[2]).src, PIN_DEFAULTS.img);
  // Selected-players pins resolve the same way.
  assert.equal(pinPresentation({...all[2], audience: {mode: 'selected', userIds: ['p1']}}, {all}).src, 'm.webp');
});

test('missing parents and parent loops end the lookup', () => {
  const a = L('A', {parentLocationId: P('B'), childPin: cp('a.webp')}), b = L('B', {parentLocationId: P('A')});
  assert.equal(pinPresentation(b, {all: [a, b]}).src, 'a.webp');
  assert.equal(pinPresentation(L('C', {parentLocationId: P('A')}), {all: [a, b]}).src, 'a.webp');
  const x = L('X', {parentLocationId: P('Y')}), y = L('Y', {parentLocationId: P('X')});
  assert.equal(pinPresentation(x, {all: [x, y]}).src, PIN_DEFAULTS.img, 'a loop with no default terminates');
  assert.equal(pinPresentation(L('Z', {parentLocationId: P('GONE')}), {all: [x]}).src, PIN_DEFAULTS.img, 'missing parent');
  assert.equal(inheritedPin(P('X'), [x, y], P('X')).img, '');
  assert.equal(inheritedPin('', [x]).size, 0);
  assert.equal(inheritedPin(P('X'), null).size, 0);
});

test('effectivePin says where each value comes from', () => {
  const all = [L('R', {childPin: cp('r.webp', '', 70)}), L('K', {parentLocationId: P('R'), pin: {img: 'k.webp', unidentifiedImg: '', size: 0}})];
  const e = effectivePin(all[1], all, 'world.webp');
  assert.deepEqual(e, {img: 'k.webp', unidentifiedImg: 'world.webp', size: 70, from: {img: 'own', unidentifiedImg: 'world', size: P('R')}});
  assert.equal(effectivePin(all[0], all).from.img, 'built-in');
});

test('the field is sanitised, never rewrites a location\'s own pin, and old data without it works', () => {
  const old = normalizeLocation({id: 'LOC-OLD', name: 'Old', pin: {img: 'a.webp', unidentifiedImg: '', size: 40}});
  assert.deepEqual(old.childPin, cp());
  assert.deepEqual(old.pin, {img: 'a.webp', unidentifiedImg: '', size: 40});
  const bad = normalizeLocation({id: 'LOC-BAD', childPin: {img: 'javascript:alert(1)', unidentifiedImg: 'a"b.webp', size: 9999}});
  assert.deepEqual(bad.childPin, cp());
  assert.deepEqual(normalizeLocation({id: 'LOC-BAD', childPin: 'nonsense'}).childPin, cp());
  const again = normalizeLocation(JSON.parse(JSON.stringify(normalizeLocation({id: 'LOC-G', childPin: cp('g.webp', 'gu.webp', 80)}))));
  assert.deepEqual(again.childPin, cp('g.webp', 'gu.webp', 80), 'normalising twice is stable');
  assert.equal(normalizeLocation(old).pin.img, 'a.webp');
});

test('it is GM-only: not published, and in no player view or page', () => {
  const secret = 'secret/hidden-default.webp';
  const r = L('R', {childPin: cp('secret/r.webp', secret, 80)});
  assert.equal('childPin' in r.published, false);
  const child = L('C', {parentLocationId: P('R'), state: 'unidentified'});
  const view = playerView(child, [r, child]);
  assert.doesNotMatch(JSON.stringify(view), /secret\/|childPin/);
  assert.doesNotMatch(JSON.stringify(playerView(r, [r, child])), /secret\/|childPin/);
});

test('Save refreshes placed pins; a pin edited by hand in the Note config is kept; the own value is never rewritten', async () => {
  const g = installFoundry(); const scene = new Scene(); g.scenes.push(scene);
  g.settings = {get: () => ''};
  const api = createApi({version: '0.27.3', isGM: () => game.user.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {}, readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}});
  const region = await api.createLocation('[TEST] Region'), a = await api.createLocation('[TEST] Auto'), b = await api.createLocation('[TEST] Edited'), c = await api.createLocation('[TEST] Own');
  for (const l of [a, b, c]) await api.saveLocation({...(await api.getLocation(l.id)), parentLocationId: region.id});
  await api.saveLocation({...(await api.getLocation(c.id)), pin: {img: 'own.webp', unidentifiedImg: '', size: 0}});
  for (const l of [a, b, c]) { await api.setLocationState(l.id, 'revealed'); await api.placeOnScene(l.id, {scene, x: 1, y: 2}); }
  const noteOf = id => scene.notes.find(n => n.flags[MODULE_ID].pinKey === api.getLocation(id).pinKey);
  assert.equal(noteOf(a.id).texture.src, PIN_DEFAULTS.img);
  // The GM edits Edited's pin by hand in Foundry's Note config.
  noteOf(b.id).texture.src = 'hand/edited.webp';
  await api.saveLocation({...(await api.getLocation(region.id)), childPin: cp('region.webp', 'regionu.webp', 72)});
  assert.equal(noteOf(a.id).texture.src, 'region.webp'); assert.equal(noteOf(a.id).iconSize, 72);
  assert.equal(noteOf(b.id).texture.src, 'hand/edited.webp', 'hand-edited Note untouched');
  assert.equal(noteOf(b.id).iconSize, 72, 'its unedited size still follows');
  assert.equal(noteOf(c.id).texture.src, 'own.webp'); assert.equal((await api.getLocation(c.id)).pin.img, 'own.webp');
  // Hiding a place uses the hidden default (the page stays empty for players).
  await api.setLocationState(a.id, 'hidden');
  assert.equal(noteOf(a.id).texture.src, 'regionu.webp');
  // Clearing the default goes back to the built-in icon.
  await api.saveLocation({...(await api.getLocation(region.id)), childPin: cp()});
  assert.equal(noteOf(c.id).texture.src, 'own.webp');
  assert.equal(noteOf(a.id).texture.src, PIN_DEFAULTS.unidentifiedImg);
});

test('notePatch keeps a hand-edited Note whatever the resolved image is', () => {
  const note = {text: 'X', iconSize: 48, texture: {src: 'hand.webp'}, flags: {[MODULE_ID]: {pinKey: 'k', pin: {src: 'old.webp', size: 48}}}};
  const patch = notePatch(note, 'k', {text: 'X', src: 'region.webp', size: 48});
  assert.equal(patch?.texture, undefined);
});

test('API: effectivePin is GM only; a player cannot save or read it', async () => {
  installFoundry(); game.settings = {get: () => ''};
  const api = createApi({version: '0.27.3', isGM: () => game.user.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {}, readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}});
  const r = await api.createLocation('[TEST] R'); await api.saveLocation({...(await api.getLocation(r.id)), childPin: cp('r.webp')});
  const k = await api.createLocation('[TEST] K'); await api.saveLocation({...(await api.getLocation(k.id)), parentLocationId: r.id});
  assert.equal(api.effectivePin(k.id).img, 'r.webp'); assert.equal(api.effectivePin('LOC-NOPE'), null);
  await api.setLocationState(r.id, 'revealed'); await api.setLocationState(k.id, 'unidentified');
  game.user = player;
  assert.throws(() => api.effectivePin(k.id), /Only the GM/);
  await assert.rejects(api.saveLocation({id: r.id, childPin: cp('hack.webp')}), /Only the GM/);
  assert.doesNotMatch(JSON.stringify([api.getLocation(r.pinKey), api.listLocations({includeUnidentified: true})]), /r\.webp|childPin/);
});

test('export and import round-trip it; an update import without it keeps the world\'s value', () => {
  const r = L('R', {childPin: cp('r.webp', 'ru.webp', 64)});
  const pkg = exportPackage([r]);
  assert.deepEqual(pkg.records[0].location.childPin, cp('r.webp', 'ru.webp', 64));
  assert.deepEqual(parseImport(pkg, []).created[0].childPin, cp('r.webp', 'ru.webp', 64));
  assert.deepEqual(importRecords(pkg.records, [], {}).created[0].childPin, cp('r.webp', 'ru.webp', 64));
  // Manager-style record from before 0.25.0 (no field): an update keeps the world's.
  const rec = {id: P('R'), entity_type: 'Location', name: 'R', location: {name: 'R'}};
  assert.deepEqual(importRecords([rec], [r], {mode: 'update'}).updated[0].childPin, cp('r.webp', 'ru.webp', 64));
  assert.deepEqual(importRecords([{...rec, location: {name: 'R', childPin: cp('n.webp')}}], [r], {mode: 'update'}).updated[0].childPin, cp('n.webp'));
  assert.deepEqual(importRecords([rec], [], {}).created[0].childPin, cp());
});

test('editor: labelled default-pin fields on any location, with the inherited value as placeholder and the draft bindings', async () => {
  globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
  globalThis.CSS ??= {escape: v => String(v)};
  installFoundry(); game.settings = {get: (_m, k) => k === 'unknownPinImage' ? 'world.webp' : ''};
  const {LocationsApp} = await import('../scripts/app.mjs');
  const all = [L('R', {childPin: cp('r.webp', '', 72)}), L('K', {parentLocationId: P('R')})];
  const html = LocationsApp.prototype.markerHtml.call({}, all[1], all);
  assert.match(html, /Default pin for places inside this one/);
  for (const b of ['childPin.img', 'childPin.unidentifiedImg', 'childPin.size', 'pin.img']) assert.ok(html.includes(`data-bind="${b}"`), b);
  assert.match(html, /id="agl-childPin-img"[^>]*placeholder="r\.webp"/);
  assert.match(html, /id="agl-childPin-unidentifiedImg"[^>]*placeholder="world\.webp"/);
  assert.match(html, /id="agl-childPin-size"[^>]*placeholder="72"/);
  assert.match(html, /id="agl-pin-img"[^>]*placeholder="r\.webp"/, 'its own pin field shows what it inherits');
  const top = LocationsApp.prototype.markerHtml.call({}, all[0], all);
  assert.match(top, /id="agl-childPin-img"[^>]*placeholder="icons\/svg\/castle\.svg"/);
});
