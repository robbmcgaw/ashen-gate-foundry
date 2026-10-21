/** 0.16.0 double-click to change the shown art: FilePicker like Foundry's own image editor, owner/GM only (mocked Foundry; logic only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {changeArt, currentArt, ART_FIELDS} from '../scripts/art.mjs';
import {createHubSheetClass} from '../scripts/sheet.mjs';

/** A FilePicker stand-in that records its options and lets the test pick or cancel. */
function installPicker() {
  const made = [];
  class FP { constructor(o) { this.options = o; made.push(this); } async browse(path) { this.browsed = path; return this; } pick(path) { return this.options.callback(path); } }
  globalThis.foundry = {applications: {apps: {FilePicker: {implementation: FP}}}};
  return made;
}
function hero() {
  const actor = makeActor();
  actor.img = 'portraits/hero.webp';
  actor.prototypeToken = {texture: {src: 'tokens/hero-token.webp'}, randomImg: false};
  actor._source = {img: actor.img, prototypeToken: {texture: {src: actor.prototypeToken.texture.src}}};
  actor.constructor = {getDefaultArtwork: () => ({img: 'icons/svg/mystery-man.svg', texture: {src: 'icons/svg/mystery-man.svg'}})};
  return actor;
}

test('portrait: image picker at the current path, default artwork as root; choosing updates actor.img', async () => {
  installGlobals({user: users.owner});
  const made = installPicker(), actor = hero();
  assert.deepEqual(await changeArt(actor, 'portrait'), {ok: true, result: 'picker'});
  const fp = made[0];
  assert.equal(fp.options.type, 'image'); assert.equal(fp.options.current, 'portraits/hero.webp'); assert.equal(fp.browsed, 'portraits/hero.webp');
  assert.deepEqual(fp.options.redirectToRoot, ['icons/svg/mystery-man.svg']);
  await fp.pick('portraits/new.webp');
  assert.deepEqual(actor.calls.at(-1), ['update', {img: 'portraits/new.webp'}]);
});

test('token art: the prototype token texture (image or video, as on the dnd5e sheet)', async () => {
  installGlobals({user: users.gm});
  const made = installPicker(), actor = hero();
  await changeArt(actor, 'token');
  assert.equal(made[0].options.type, 'imagevideo'); assert.equal(made[0].options.current, 'tokens/hero-token.webp');
  await made[0].pick('tokens/new.webm');
  assert.deepEqual(actor.calls.at(-1), ['update', {'prototypeToken.texture.src': 'tokens/new.webm'}]);
  assert.deepEqual(ART_FIELDS, {portrait: 'img', token: 'prototypeToken.texture.src'});
  assert.equal(currentArt(actor, 'token'), 'tokens/hero-token.webp');
});

test('cancel or the same file changes nothing; non-owners are refused before any picker opens', async () => {
  installGlobals({user: users.owner});
  let made = installPicker(); const actor = hero();
  await changeArt(actor, 'portrait');
  await made[0].pick(''); await made[0].pick(null); await made[0].pick('portraits/hero.webp');
  assert.equal(actor.calls.length, 0, 'cancel / same path: no update');
  installGlobals({user: users.observer}); made = installPicker();
  assert.match((await changeArt(actor, 'portrait')).error, /don't own/);
  assert.equal(made.length, 0, 'no picker for observers');
  assert.equal((await changeArt(actor, 'banner')).ok, false);
});

test('a random-image token opens Prototype Token settings instead, like the dnd5e sheet', async () => {
  installGlobals({user: users.owner});
  const made = installPicker(), actor = hero(), opened = [];
  actor.prototypeToken.randomImg = true;
  globalThis.foundry.applications.sheets = {PrototypeTokenConfig: class { constructor(o) { opened.push(o); } async render() { return this; } }};
  assert.deepEqual(await changeArt(actor, 'token'), {ok: true, result: 'token-config'});
  assert.equal(opened[0].prototype, actor.prototypeToken); assert.equal(made.length, 0);
});

test('the art pane: hint and double-click only for owners/GM, mode follows the Portrait/Token art toggle, toggle click untouched', async () => {
  installGlobals({user: users.owner});
  const made = installPicker();
  const Cls = createHubSheetClass(FakeActorSheetV2), actor = hero(), sheet = new Cls({document: actor});
  let html = await sheet._renderHTML();
  assert.match(html, /class="agch-doll__art is-editable" data-art-edit="portrait" data-tooltip="Double-click to change portrait"/);
  sheet.dollArt = 'token';
  html = await sheet._renderHTML();
  assert.match(html, /data-art-edit="token" data-tooltip="Double-click to change token art"/);
  const pane = {dataset: {artEdit: 'token'}};
  await sheet._onArtEdit({target: {closest: sel => sel === '[data-art-edit]' ? pane : null}, preventDefault() {}});
  assert.equal(made.at(-1).options.current, 'tokens/hero-token.webp');
  const n = made.length;
  await sheet._onArtEdit({target: {closest: sel => sel === '[data-art-edit]' ? pane : {}}, preventDefault() {}});
  assert.equal(made.length, n, 'a double-click on the Portrait/Token art button or the AC shield does nothing here');
  installGlobals({user: users.observer});
  const view = new Cls({document: actor});
  html = await view._renderHTML();
  assert.match(html, /<div class="agch-doll__art"><img/, 'observers: no hint, no cursor, no handler target');
  assert.equal(await view._onArtEdit({target: {closest: () => pane}, preventDefault() {}}), null);
  assert.equal(made.length, n);
});
