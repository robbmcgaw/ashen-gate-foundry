/** 0.64.0 / 0.66.0 / 0.67.0 (single-click toggle): the player-dock portrait button (0.66.0: the picture is the only button). A tiny fake DOM and mocked Foundry: proves the logic and the calls, not the real dock. */
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
  assert.equal(btn.getAttribute('aria-label'), 'Open [TEST] Hero'); assert.equal(btn.getAttribute('data-tooltip'), 'Open [TEST] Hero');
  assert.equal(btn.tag, 'button');
  // 0.66.0: no separate "Open Hub" text button; the slot holds exactly one button
  assert.equal(slot.all('button').length, 1); assert.equal(slot.querySelector('[data-agch-dock-action="open"]'), null);
  assert.equal(btn.text, undefined);
  // idempotent: a second pass updates in place
  syncDockPortrait({game: globalThis.game, doc, canvas: null, open: () => {}}); assert.equal(slot.all('button').length, 1);
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

const flush = () => new Promise(r => setTimeout(r, 0));
/** A fake clock and a fake Hub window registry for the toggle tests. */
function toggleRig({hero = actor()} = {}) {
  setup({user: {...users.owner, character: hero}}); const d = makeDoc();
  class FakeHub { constructor(doc) { this.document = doc; this.rendered = true; this.closed = 0; } async close() { this.closed++; this.rendered = false; registry.delete(this); hooks.fire('closeCharacterHubSheet'); } }
  const registry = new Set(); const listeners = {};
  const hooks = {on: (n, f) => { listeners[n] = f; return n; }, off() {}, fire: n => listeners[n]?.()};
  let t = 10_000; const clock = {tick: ms => { t += ms; }};
  const api = {sheetClass: FakeHub, open: async a => { const app = new FakeHub(a); registry.add(app); hooks.fire('renderCharacterHubSheet'); return {ok: true, result: app}; }};
  const stop = installDockPortrait({game: globalThis.game, hooks, doc: d.doc, canvas: () => null, Observer: undefined, api: () => api, apps: () => ({values: () => registry.values()}), now: () => t});
  const btn = d.slot.querySelector('[data-agch-dock-action="portrait"]');
  return {hero, d, btn, registry, hooks, clock, stop, FakeHub};
}

test('single click toggles: opens when closed, closes when open; pressed state, tooltip and label follow', async () => {
  const r = toggleRig(); const {btn, registry, clock} = r;
  assert.equal(btn.getAttribute('aria-pressed'), 'false'); assert.equal(btn.getAttribute('aria-label'), 'Open [TEST] Hero'); assert.equal(btn.getAttribute('data-tooltip'), 'Open [TEST] Hero');
  btn.fire('click', {detail: 1}); await flush();
  assert.equal(registry.size, 1); assert.equal(btn.getAttribute('aria-pressed'), 'true');
  assert.equal(btn.getAttribute('aria-label'), 'Close [TEST] Hero'); assert.equal(btn.getAttribute('data-tooltip'), 'Close [TEST] Hero');
  const app = [...registry][0]; assert.equal(app.document, r.hero);
  clock.tick(1000); btn.fire('click', {detail: 1}); await flush();
  assert.equal(app.closed, 1); assert.equal(registry.size, 0); assert.equal(btn.getAttribute('aria-pressed'), 'false'); assert.equal(btn.getAttribute('aria-label'), 'Open [TEST] Hero');
  clock.tick(1000); btn.fire('click', {detail: 1}); await flush(); assert.equal(registry.size, 1); assert.equal(btn.getAttribute('aria-pressed'), 'true');
  r.stop();
});

test('closing the Hub with its own X resets the button; another actor\'s Hub does not count', async () => {
  const r = toggleRig(); const {btn, registry, clock} = r;
  btn.fire('click', {detail: 1}); await flush(); assert.equal(btn.getAttribute('aria-pressed'), 'true');
  await [...registry][0].close();  // the window X path: close() then the close hook
  assert.equal(btn.getAttribute('aria-pressed'), 'false');
  const other = new r.FakeHub(actor({id: 'zz'})); registry.add(other); r.hooks.fire('renderCharacterHubSheet');
  assert.equal(btn.getAttribute('aria-pressed'), 'false');
  clock.tick(1000); btn.fire('click', {detail: 1}); await flush(); assert.equal(other.closed, 0); assert.equal(registry.size, 2);
  r.stop();
});

test('rapid double-click: open once, the second click is ignored (net effect open); a later click closes', async () => {
  const r = toggleRig(); const {btn, registry, clock} = r;
  btn.fire('click', {detail: 1}); clock.tick(120); btn.fire('click', {detail: 2}); btn.fire('dblclick'); await flush();
  assert.equal(registry.size, 1); assert.equal(btn.getAttribute('aria-pressed'), 'true');
  clock.tick(120); btn.fire('click', {detail: 1}); await flush(); assert.equal(registry.size, 1, 'still inside the 350 ms window');
  clock.tick(400); btn.fire('click', {detail: 1}); await flush(); assert.equal(registry.size, 0);
  r.stop();
});

test('a click while an open is still running is ignored', async () => {
  setup(); const {doc, slot} = makeDoc(); let release; const calls = []; let t = 0;
  const open = a => { calls.push(a); return new Promise(res => { release = () => res({ok: true}); }); };
  syncDockPortrait({game: globalThis.game, doc, open, now: () => t});
  const btn = slot.querySelector('[data-agch-dock-action="portrait"]');
  btn.fire('click', {detail: 1}); t += 1000; btn.fire('click', {detail: 1}); assert.equal(calls.length, 1);
  release(); await flush(); t += 1000; btn.fire('click', {detail: 1}); assert.equal(calls.length, 2);
});

test('keyboard: Enter/Space (a click with detail 0) toggles like a mouse click', async () => {
  const r = toggleRig(); const {btn, registry, clock} = r;
  assert.equal(btn.tag, 'button');
  btn.fire('click', {detail: 0}); await flush(); assert.equal(registry.size, 1); assert.equal(btn.getAttribute('aria-pressed'), 'true');
  clock.tick(1000); btn.fire('click', {detail: 0}); await flush(); assert.equal(registry.size, 0); assert.equal(btn.getAttribute('aria-pressed'), 'false');
  r.stop();
});

test('actor changes resync; double-click alone adds no extra handler; a refusal warns and stays closed', async () => {
  const r = toggleRig(); assert.equal(r.btn.listeners.dblclick, undefined);
  r.stop();
  const hero = actor(); setup({user: {...users.owner, character: hero}}); const {doc, slot} = makeDoc(); const warned = [];
  globalThis.ui.notifications.warn = m => warned.push(m);
  syncDockPortrait({game: globalThis.game, doc, open: async a => ({ok: false, error: `You can't view ${a.name}.`}), now: () => 0});
  const btn = slot.querySelector('[data-agch-dock-action="portrait"]'); btn.fire('click', {detail: 1}); await flush();
  assert.deepEqual(warned, ["You can't view [TEST] Hero."]); assert.equal(btn.getAttribute('aria-pressed'), 'false');
});

test('installDockPortrait opens via the module api and warns on a refusal', async () => {
  const hero = actor(); setup({user: {...users.owner, character: hero}}); const {doc, slot} = makeDoc(); const seen = [];
  const hooks = {on: (n, f) => { seen.push(n); return f; }, off: () => {}};
  const notes = globalThis.ui.notifications; const warned = []; notes.warn = m => warned.push(m);
  const stop = installDockPortrait({game: globalThis.game, hooks, doc, canvas: () => null, Observer: undefined, api: () => ({open: async a => ({ok: false, error: `You can't view ${a.name}.`})})});
  slot.querySelector('[data-agch-dock-action="portrait"]').fire('click', {detail: 1}); await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(warned, ["You can't view [TEST] Hero."]); assert.ok(seen.includes('renderSidebar')); assert.ok(seen.includes('renderCharacterHubSheet') && seen.includes('closeCharacterHubSheet')); stop();
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
  stop(); assert.equal(obs.on, false); assert.equal(offs.length, 6); assert.equal(fresh.slot.all('[data-agch-dock-portrait]').length, 0);
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

test('Help mentions the dock portrait toggle', () => {
  assert.match(HELP_HTML ?? '', /Dock portrait/); assert.match(HELP_HTML, /click it again to close/i); assert.doesNotMatch(HELP_HTML, /<strong>Double-click<\/strong> it to open your Character Hub/); assert.doesNotMatch(HELP_HTML, /Open Hub<\/strong> button/);
});
