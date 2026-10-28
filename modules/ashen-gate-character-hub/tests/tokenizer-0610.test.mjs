/** 0.61.0: double-click / Change button open Tokenizer (vtta-tokenizer) when active; else the picker. Mocked Foundry: does NOT run the real Tokenizer window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users} from './foundry-mock.mjs';
import {changeArt, tokenizerOpener} from '../scripts/art.mjs';
import {HELP_HTML} from '../scripts/help.mjs';
import {readFileSync} from 'node:fs';

function setup({user = users.owner, tok = 'api', id = 'vtta-tokenizer', active = true, tokenizeActor} = {}) {
  installGlobals({user});
  const made = [], tokCalls = [], warns = [];
  class FP { constructor(o) { this.options = o; made.push(this); } async browse() { return this; } }
  globalThis.foundry = {applications: {apps: {FilePicker: {implementation: FP}}}};
  const fn = tokenizeActor ?? (a => { tokCalls.push(a); });
  const api = tok === 'api' ? {tokenizeActor: fn} : tok === 'nofn' ? {launch() {}} : undefined;
  const mod = {active, api};
  globalThis.game.modules = {get: mid => (mid === id ? mod : undefined)};
  globalThis.Tokenizer = undefined;
  const actor = makeActor();
  actor.img = 'p.webp'; actor.prototypeToken = {texture: {src: 't.webp'}, randomImg: false};
  actor._source = {img: 'p.webp', prototypeToken: {texture: {src: 't.webp'}}};
  actor.constructor = {getDefaultArtwork: () => ({})};
  return {made, tokCalls, warns, actor, notify: m => warns.push(m)};
}

test('active + permitted: opens Tokenizer with the actor, no picker (portrait and token art)', async () => {
  const t = setup();
  assert.deepEqual(await changeArt(t.actor, 'portrait', {notify: t.notify}), {ok: true, result: 'tokenizer'});
  assert.deepEqual(await changeArt(t.actor, 'token', {notify: t.notify}), {ok: true, result: 'tokenizer'});
  assert.equal(t.tokCalls.length, 2); assert.equal(t.tokCalls[0], t.actor); assert.equal(t.made.length, 0);
});

test('the older/other module id (tokenizer) and window.Tokenizer are also found; id check needs active', () => {
  setup({id: 'tokenizer'}); assert.equal(typeof tokenizerOpener(), 'function');
  setup({tok: 'none'}); globalThis.Tokenizer = {tokenizeActor() {}}; assert.equal(typeof tokenizerOpener(), 'function');
});

test('absent, inactive or function missing: the picker opens as before', async () => {
  for (const o of [{id: 'other'}, {active: false}, {tok: 'nofn'}, {tok: 'none'}]) {
    const t = setup(o);
    assert.equal(tokenizerOpener(), null);
    assert.deepEqual(await changeArt(t.actor, 'portrait', {notify: t.notify}), {ok: true, result: 'picker'});
    assert.equal(t.made.length, 1); assert.equal(t.warns.length, 0);
  }
  installGlobals({user: users.owner}); globalThis.game.modules = undefined;
  assert.equal(tokenizerOpener(), null, 'no modules collection: no throw');
});

test('no permission: refused before Tokenizer or the picker', async () => {
  const t = setup({user: users.observer});
  assert.match((await changeArt(t.actor, 'portrait', {notify: t.notify})).error, /don't own/);
  assert.equal(t.tokCalls.length, 0); assert.equal(t.made.length, 0);
});

test('Tokenizer throwing (sync or async): short notification, picker opens, nothing uncaught', async () => {
  for (const tokenizeActor of [() => { throw new Error('boom'); }, async () => { throw new Error('late'); }]) {
    const t = setup({tokenizeActor});
    const r = await changeArt(t.actor, 'portrait', {notify: t.notify});
    assert.deepEqual(r, {ok: true, result: 'picker'});
    assert.equal(t.warns.length, 1); assert.match(t.warns[0], /Tokenizer could not be opened/); assert.equal(t.made.length, 1);
  }
});

test('a random-image token still opens Prototype Token settings, not Tokenizer', async () => {
  const t = setup(); t.actor.prototypeToken.randomImg = true;
  globalThis.foundry.applications.sheets = {PrototypeTokenConfig: class { async render() { return this; } }};
  const r = await changeArt(t.actor, 'token', {notify: t.notify});
  assert.equal(t.tokCalls.length, 0); assert.ok(r.ok === false || r.result === 'token-config');
});

test('keyboard route: the Change button and the double-click both call changeArt; the pane is not a button, the button is', () => {
  const src = readFileSync(new URL('../scripts/character.mjs', import.meta.url), 'utf8');
  assert.match(src, /btn\('art-change'/); assert.match(src, /data-art-edit=/);
  const sheet = readFileSync(new URL('../scripts/sheet.mjs', import.meta.url), 'utf8');
  assert.match(sheet, /function changeArtFor[\s\S]*?changeArt\(/); assert.match(sheet, /_onArtEdit[\s\S]*?changeArt\(/);
  assert.match(HELP_HTML.join ? HELP_HTML.join('') : String(HELP_HTML), /Tokenizer/);
});
