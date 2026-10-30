/** 0.64.0: the player-dock portrait button. A tiny fake DOM and mocked Foundry: proves the logic and the calls, not the real dock. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, users} from './foundry-mock.mjs';
import {dockActor, dockImage, syncDockPortrait, installDockPortrait, STOCK_IMAGE, SLOT_SELECTOR} from '../scripts/dock-portrait.mjs';
import {HELP_HTML} from '../scripts/help.mjs';

class Node {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.listeners = {}; this.parent = null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  append(...kids) { for (const k of kids) { if (typeof k === 'string') { this.text = (this.text ?? '') + k; continue; } k.parent = this; this.children.push(k); } }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  fire(type, event = {}) { for (const fn of this.listeners[type] ?? []) fn({preventDefault() {}, ...event}); }
  matches(sel) { if (/^[a-z]+$/.test(sel)) return this.tag === sel; const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(sel); return !!m && (m[2] === undefined ? m[1] in this.attrs : this.attrs[m[1]] === m[2]); }
  querySelector(sel) { for (const c of this.children) { if (c.matches(sel)) return c; const r = c.querySelector(sel); if (r) return r; } return null; }
  all(sel, out = []) { for (const c of this.children) { if (c.matches(sel)) out.push(c); c.all(sel, out); } return out; }
}
const makeDoc = ({slot = true} = {}) => {
  const body = new Node('body'); const doc = {body, createElement: t => new Node(t), querySelector: s => body.querySelector(s)};
  const dock = new Node('div'); const s = new Node('span'); s.setAttribute('data-agm-dock-slot', 'portrait');
  if (slot) { dock.append(s); body.append(dock); }
  return {doc, body, slot: s, dock};
};
const actor = (o = {}) => ({id: 'a1', name: '[TEST] Hero', type: 'character', img: 'hero.webp', prototypeToken: {texture: {src: 'token.webp'}}, testUserPermission: (u, level) => (o.perm ?? 'OWNER') === 'OWNER' || level === 'LIMITED', ...o});
const setup = ({user = {...users.owner, character: actor(), avatar: 'me.webp'}, actors = []} = {}) => { installGlobals({user, actors}); return user; };

test('slot present: one button, token picture, Open <name> labels', () => {
  const user = setup(); const {doc, slot} = makeDoc();
  const wrap = syncDockPortrait({game: globalThis.game, doc, canvas: null, open: () => {}});
  assert.ok(wrap); assert.equal(slot.all('[data-agch-dock-portrait]').length, 1);
  const btn = slot.querySelector('[data-agch-dock-action="portrait"]'), img = btn.querySelector('img');
  assert.equal(img.getAttribute('src'), 'token.webp'); assert.match(img.getAttribute('alt'), /\[TEST\] Hero/);
  assert.match(btn.getAttribute('aria-label'), /^Open \[TEST\] Hero/); assert.match(btn.getAttribute('data-tooltip'), /^Open \[TEST\] Hero/);
  assert.equal(btn.tag, 'button'); assert.equal(slot.querySelector('[data-agch-dock-action="open"]').tag, 'button');
  assert.equal(slot.querySelector('[data-agch-dock-action="open"]').text, 'Open Hub');
  assert.ok(user);
});

test('no slot (older Manager) or no document: nothing, no error', () => {
  setup(); const {doc} = makeDoc({slot: false});
  assert.equal(syncDockPortrait({game: globalThis.game, doc, open: () => {}}), null);
  assert.equal(syncDockPortrait({game: globalThis.game, doc: null, open: () => {}}), null);
  const stop = installDockPortrait({game: globalThis.game, hooks: undefined, doc, Observer: undefined}); stop();
});

test('GM and no-character users get no button; a stale button is removed', () => {
  setup({user: {...users.gm, character: actor()}}); let d = makeDoc();
  assert.equal(syncDockPortrait({game: globalThis.game, doc: d.doc, open: () => {}}), null);
  setup({user: {...users.owner, character: null}, actors: []}); d = makeDoc();
  assert.equal(syncDockPortrait({game: globalThis.game, doc: d.doc, open: () => {}}), null);
  setup(); d = makeDoc(); syncDockPortrait({game: globalThis.game, doc: d.doc, open: () => {}});
  globalThis.game.user.character = null;
  syncDockPortrait({game: globalThis.game, doc: d.doc, open: () => {}});
  assert.equal(d.slot.all('[data-agch-dock-portrait]').length, 0);
});

test('double-click and Enter/Space open through api.open with the right actor; a single click does not', async () => {
  const hero = actor(); setup({user: {...users.owner, character: hero}}); const {doc, slot} = makeDoc();
  const calls = []; const open = a => { calls.push(a); return {ok: true}; };
  syncDockPortrait({game: globalThis.game, doc, open});
  const btn = slot.querySelector('[data-agch-dock-action="portrait"]'), small = slot.querySelector('[data-agch-dock-action="open"]');
  btn.fire('click', {detail: 1}); btn.fire('click', {detail: 2}); assert.equal(calls.length, 0);
  btn.fire('dblclick'); await Promise.resolve(); assert.deepEqual(calls, [hero]);
  btn.fire('click', {detail: 0}); await Promise.resolve(); assert.equal(calls.length, 2);
  small.fire('click', {detail: 1}); await Promise.resolve(); assert.equal(calls.length, 3);
  assert.ok(calls.every(a => a === hero));
});

test('installDockPortrait opens via the module api and warns on a refusal', async () => {
  const hero = actor(); setup({user: {...users.owner, character: hero}}); const {doc, slot} = makeDoc(); const seen = [];
  const hooks = {on: (n, f) => { seen.push(n); return f; }, off: () => {}};
  const notes = globalThis.ui.notifications; const warned = []; notes.warn = m => warned.push(m);
  const stop = installDockPortrait({game: globalThis.game, hooks, doc, canvas: () => null, Observer: undefined, api: () => ({open: async a => ({ok: false, error: `You can't view ${a.name}.`})})});
  slot.querySelector('[data-agch-dock-action="portrait"]').fire('dblclick'); await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(warned, ["You can't view [TEST] Hero."]); assert.ok(seen.includes('renderSidebar')); stop();
});

test('re-render and a rebuilt dock never duplicate; stop removes listeners and the button', () => {
  setup(); const d = makeDoc(); const handlers = {}; const offs = []; let obs = null;
  class Obs { constructor(cb) { obs = this; this.cb = cb; } observe() { this.on = true; } disconnect() { this.on = false; } }
  const hooks = {on: (n, f) => { handlers[n] = f; return n; }, off: (n, id) => offs.push([n, id])};
  const stop = installDockPortrait({game: globalThis.game, hooks, doc: d.doc, canvas: () => null, Observer: Obs, api: () => ({open: () => ({ok: true})})});
  handlers.renderSidebar(); handlers.updateUser(); obs.cb(); assert.equal(d.slot.all('[data-agch-dock-portrait]').length, 1);
  // Manager rebuilds the dock: a fresh empty slot gets exactly one button
  d.dock.remove(); const fresh = makeDoc(); d.doc.querySelector = s => fresh.body.querySelector(s);
  obs.cb(); obs.cb(); assert.equal(fresh.slot.all('[data-agch-dock-portrait]').length, 1);
  stop(); assert.equal(obs.on, false); assert.equal(offs.length, 4); assert.equal(fresh.slot.all('[data-agch-dock-portrait]').length, 0);
});

test('actor fallback chain: assigned, first owned, controlled token; limited or non-characters are skipped', () => {
  const owned = actor({id: 'o', name: 'Owned'}), npc = actor({id: 'n', type: 'npc'});
  setup({user: {...users.owner, character: null}, actors: [npc, owned]});
  assert.equal(dockActor(globalThis.game, null), owned);
  setup({user: {...users.owner, character: null}, actors: [npc]});
  const tokenActor = actor({id: 't', perm: 'LIMITED'});
  assert.equal(dockActor(globalThis.game, {tokens: {controlled: [{actor: tokenActor}]}}), tokenActor);
  assert.equal(dockActor(globalThis.game, {tokens: {controlled: [{actor: npc}]}}), null);
  assert.equal(dockActor(globalThis.game, {tokens: {get controlled() { throw new Error('no canvas'); }}}), null);
  const assigned = actor({id: 'as'}); setup({user: {...users.owner, character: assigned}, actors: [owned]});
  assert.equal(dockActor(globalThis.game, null), assigned);
});

test('image fallback chain: token texture, actor image, avatar, stock icon; wildcards and video are skipped', () => {
  const u = {avatar: 'me.webp'};
  assert.equal(dockImage(actor(), u), 'token.webp');
  assert.equal(dockImage(actor({prototypeToken: {texture: {src: 'tokens/*.webp'}}}), u), 'hero.webp');
  assert.equal(dockImage(actor({prototypeToken: {texture: {src: 'a.webm'}}}), u), 'hero.webp');
  assert.equal(dockImage(actor({img: '', prototypeToken: {}}), u), 'me.webp');
  assert.equal(dockImage(actor({img: null, prototypeToken: null}), {}), STOCK_IMAGE);
  assert.equal(SLOT_SELECTOR, '[data-agm-dock-slot="portrait"]');
});

test('Help mentions the dock portrait', () => assert.match(HELP_HTML ?? '', /Dock portrait/));
