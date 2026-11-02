/** 0.101.0: the dock's pop-outs remember their place. Mocked Foundry and DOM: proves the logic and wiring, not how the live window moves. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fakeStorage} from '../../../scripts/kit-tests/fake-dom.mjs';
import {cleanRect, clampRect, readRect, writeRect, createPopoutPositions, MIN_WIDTH, MIN_HEIGHT, SAVE_DELAY_MS} from '../scripts/popout-position.js';
import {openSidebarTab, closeSidebarTab} from '../scripts/sidebar-tabs.js';
import {installPlayerDock, POPOUT_CLOSE_HOOKS} from '../scripts/player-dock.js';

const tick = () => new Promise(r => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };
const VP = {width: 1600, height: 900};
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

function timers() {
  const q = new Map(); let n = 0;
  return {setTimer: fn => { q.set(++n, fn); return n; }, clearTimer: id => q.delete(id), flush: () => { const f = [...q.values()]; q.clear(); f.forEach(fn => fn()); }, size: () => q.size};
}
function listeners() {
  const map = new Map();
  return {addEventListener: (t, f) => map.set(t, f), removeEventListener: t => map.delete(t), fire: t => map.get(t)?.(), has: t => map.has(t)};
}
function popoutApp(position) {
  const app = {rendered: true, position: {...position}, sets: [], async close() { this.rendered = false; }, setPosition(p) { this.sets.push(p); Object.assign(this.position, p); }};
  return app;
}
function env({storage = fakeStorage(), userId = 'U1', win = {innerWidth: 1600, innerHeight: 900}, position = {left: 100, top: 80, width: 400, height: 300}} = {}) {
  const t = timers(), doc = listeners();
  const app = popoutApp(position);
  const ui = {combat: {popout: null, renderPopout() { this.popout = app; return Promise.resolve(app); }}};
  const positions = createPopoutPositions({storage, getUserId: () => userId, win, doc, setTimer: t.setTimer, clearTimer: t.clearTimer});
  return {storage, t, doc, app, ui, positions};
}

test('clampRect: inside stays, off-screen is pulled in, oversize shrinks, tiny viewport keeps it fully visible', () => {
  assert.deepEqual(clampRect({left: 100, top: 80, width: 400, height: 300}, VP), {left: 100, top: 80, width: 400, height: 300});
  assert.deepEqual(clampRect({left: 2000, top: 1500, width: 400, height: 300}, VP), {left: 1200, top: 600, width: 400, height: 300});
  assert.deepEqual(clampRect({left: -300, top: -50, width: 400, height: 300}, VP), {left: 0, top: 0, width: 400, height: 300});
  assert.deepEqual(clampRect({left: 10, top: 10, width: 5000, height: 4000}, VP), {left: 0, top: 0, width: 1600, height: 900});
  assert.deepEqual(clampRect({left: 10, top: 10, width: 20, height: 20}, VP), {left: 10, top: 10, width: MIN_WIDTH, height: MIN_HEIGHT});
  const tiny = clampRect({left: 700, top: 500, width: 400, height: 300}, {width: 320, height: 240});
  assert.deepEqual(tiny, {left: 0, top: 0, width: 320, height: 240});
  assert.ok(tiny.left + tiny.width <= 320 && tiny.top + tiny.height <= 240);
  const noSize = clampRect({left: 1590, top: 895}, VP);
  assert.ok(noSize.left + MIN_WIDTH <= VP.width && noSize.top + MIN_HEIGHT <= VP.height);
  assert.equal(clampRect({left: 1, top: 1}, {width: 0, height: 0}), null);
  assert.equal(clampRect({left: 1, top: 1}, null), null);
});

test('corrupt or missing data is ignored', () => {
  const s = fakeStorage();
  assert.equal(readRect(s, 'U1', 'combat'), null);
  for (const bad of ['{nope', 'null', '"x"', '[]', '{"left":"1","top":2}', '{"left":null,"top":3}', '{"top":3}']) {
    s.setItem('agm-dock-window:U1:combat', bad);
    assert.equal(readRect(s, 'U1', 'combat'), null, bad);
  }
  assert.equal(cleanRect({left: NaN, top: 1}), null);
  assert.deepEqual(cleanRect({left: 1.4, top: 2.6, width: 'auto', height: -5}), {left: 1, top: 3});
  assert.equal(readRect({getItem() { throw new Error('blocked'); }}, 'U1', 'combat'), null);
  assert.equal(writeRect({getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }}, 'U1', 'combat', {left: 1, top: 1}), false);
  assert.equal(writeRect(null, 'U1', 'combat', {left: 1, top: 1}), false);
  const e = env({storage: s});
  s.setItem('agm-dock-window:U1:combat', '{broken');
  assert.equal(e.positions.restore('combat', e.app), null);
  assert.equal(e.app.sets.length, 0);
});

test('save on move (debounced), save on close, and no write when unchanged', async () => {
  const e = env();
  openSidebarTab('combat', {ui: e.ui, prefer: 'popout', memory: {}, positions: e.positions});
  await settle();
  assert.equal(e.positions.isTracking('combat'), true);
  assert.equal(e.storage.map.size, 0, 'opening alone writes nothing');
  e.app.position = {left: 220, top: 140, width: 500, height: 350};
  e.doc.fire('pointerup'); e.doc.fire('pointerup');
  assert.equal(e.t.size(), 1, 'debounced to one pending save');
  assert.equal(e.storage.map.size, 0);
  e.t.flush();
  assert.deepEqual(JSON.parse(e.storage.map.get('agm-dock-window:U1:combat')), {left: 220, top: 140, width: 500, height: 350});
  let writes = 0; const orig = e.storage.setItem; e.storage.setItem = (k, v) => { writes++; orig(k, v); };
  e.doc.fire('pointerup'); e.t.flush();
  assert.equal(writes, 0, 'unchanged position is not rewritten');
  e.app.position = {left: 30, top: 40, width: 420, height: 310};
  const memory = {};
  closeSidebarTab('combat', {ui: e.ui, memory, positions: e.positions});
  assert.equal(writes, 1, 'captured at close without waiting for the timer');
  assert.deepEqual(readRect(e.storage, 'U1', 'combat'), {left: 30, top: 40, width: 420, height: 310});
  assert.equal(e.positions.isTracking('combat'), false);
  assert.equal(e.doc.has('pointerup'), false, 'listener removed');
});

test('the close hook saves for a window closed with its own X', async () => {
  const e = env();
  openSidebarTab('combat', {ui: e.ui, prefer: 'popout', memory: {}, positions: e.positions});
  await settle();
  e.app.position = {left: 5, top: 6, width: 300, height: 200};
  e.positions.onClosed({other: true});
  assert.equal(e.storage.map.size, 0, 'a different window is ignored');
  e.positions.onClosed(e.app);
  assert.deepEqual(readRect(e.storage, 'U1', 'combat'), {left: 5, top: 6, width: 300, height: 200});
  assert.equal(e.positions.isTracking('combat'), false);
});

test('restore on open, clamped to the current viewport', async () => {
  const s = fakeStorage();
  writeRect(s, 'U1', 'combat', {left: 1200, top: 600, width: 400, height: 300});
  const e = env({storage: s, win: {innerWidth: 800, innerHeight: 500}, position: {left: 0, top: 0, width: 300, height: 200}});
  openSidebarTab('combat', {ui: e.ui, prefer: 'popout', memory: {}, positions: e.positions});
  await settle();
  assert.equal(e.app.sets.length, 1);
  assert.deepEqual(e.app.sets[0], {left: 400, top: 200, width: 400, height: 300});
  // roomy window: exact spot
  const e2 = env({storage: s, win: {innerWidth: 1920, innerHeight: 1080}});
  openSidebarTab('combat', {ui: e2.ui, prefer: 'popout', memory: {}, positions: e2.positions});
  await settle();
  assert.deepEqual(e2.app.sets[0], {left: 1200, top: 600, width: 400, height: 300});
});

test('no saved position: the dock does exactly what it did before', async () => {
  const e = env();
  const memory = {};
  assert.equal(openSidebarTab('combat', {ui: e.ui, prefer: 'popout', memory, positions: e.positions}), 'popout');
  await settle();
  assert.equal(e.app.sets.length, 0);
  assert.deepEqual(memory.combat, {via: 'popout'});
  const plain = env();
  assert.equal(openSidebarTab('combat', {ui: plain.ui, prefer: 'popout', memory: {}}), 'popout', 'works with no position memory at all');
  assert.equal(openSidebarTab('combat', {ui: {combat: {renderPopout() { throw new Error('x'); }}, sidebar: {}}, prefer: 'popout', memory: {}, positions: e.positions}), false);
});

test('one key per tab, so tabs never share a position', async () => {
  const s = fakeStorage();
  writeRect(s, 'U1', 'combat', {left: 10, top: 10, width: 300, height: 300});
  writeRect(s, 'U1', 'chat', {left: 500, top: 100, width: 350, height: 400});
  assert.deepEqual(readRect(s, 'U1', 'combat'), {left: 10, top: 10, width: 300, height: 300});
  assert.deepEqual(readRect(s, 'U1', 'chat'), {left: 500, top: 100, width: 350, height: 400});
  assert.equal(readRect(s, 'U1', 'journal'), null);
  const e = env({storage: s});
  const chat = popoutApp({left: 0, top: 0, width: 100, height: 100});
  e.ui.chat = {popout: null, renderPopout() { this.popout = chat; return chat; }};
  openSidebarTab('chat', {ui: e.ui, prefer: 'popout', memory: {}, positions: e.positions});
  await settle();
  assert.deepEqual(chat.sets[0], {left: 500, top: 100, width: 350, height: 400});
});

test('per-user isolation: another user in the same browser keeps their own spot', async () => {
  const s = fakeStorage();
  writeRect(s, 'U1', 'combat', {left: 10, top: 10, width: 300, height: 300});
  writeRect(s, 'U2', 'combat', {left: 700, top: 300, width: 320, height: 280});
  const e = env({storage: s, userId: 'U2'});
  openSidebarTab('combat', {ui: e.ui, prefer: 'popout', memory: {}, positions: e.positions});
  await settle();
  assert.deepEqual(e.app.sets[0], {left: 700, top: 300, width: 320, height: 280});
  e.app.position = {left: 50, top: 60, width: 330, height: 290};
  e.positions.release('combat');
  assert.deepEqual(readRect(s, 'U1', 'combat'), {left: 10, top: 10, width: 300, height: 300}, 'U1 untouched');
  assert.deepEqual(readRect(s, 'U2', 'combat'), {left: 50, top: 60, width: 330, height: 290});
  e.positions.clear(['combat']);
  assert.equal(readRect(s, 'U2', 'combat'), null);
  assert.ok(readRect(s, 'U1', 'combat'));
});

test('a height of "auto" is not saved as a size', () => {
  const s = fakeStorage();
  assert.equal(writeRect(s, 'U1', 'combat', {left: 5, top: 5, width: 300, height: 'auto'}), true);
  assert.deepEqual(readRect(s, 'U1', 'combat'), {left: 5, top: 5, width: 300});
});

test('the second press still closes the pop-out', async () => {
  const e = env();
  const memory = {};
  openSidebarTab('combat', {ui: e.ui, prefer: 'popout', memory, positions: e.positions});
  await settle();
  assert.equal(closeSidebarTab('combat', {ui: e.ui, memory, positions: e.positions}), 'popout');
  await settle();
  assert.equal(e.app.rendered, false);
  assert.equal(closeSidebarTab('combat', {ui: e.ui, memory, positions: {release() { throw new Error('boom'); }}}), false, 'already closed');
  const e2 = env();
  openSidebarTab('combat', {ui: e2.ui, prefer: 'popout', memory: {}});
  assert.equal(closeSidebarTab('combat', {ui: e2.ui, memory: {}, positions: {release() { throw new Error('boom'); }}}), 'popout', 'a failing position memory never blocks the close');
});

test('install wires the close hooks and removes them again', () => {
  const on = [], off = [];
  const hooks = {on: (n, f) => { on.push(n); return on.length; }, off: (n, id) => off.push(n)};
  const doc = {getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: {classList: {toggle() {}}}, defaultView: {innerWidth: 1000, innerHeight: 700}};
  const stop = installPlayerDock({game: {user: {id: 'U1', isGM: true}}, hooks, doc, getUi: () => ({}), appearance: {getState: () => ({}), subscribe: () => () => {}}, layout: {disable() {}, enable() {}, measure() {}}, storage: fakeStorage()});
  for (const name of POPOUT_CLOSE_HOOKS) assert.ok(on.includes(name), name);
  stop();
  for (const name of POPOUT_CLOSE_HOOKS) assert.ok(off.includes(name), name);
});

test('the helper stays client-only and does not patch Foundry', () => {
  const src = read('../scripts/popout-position.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(src, /settings\.set|setFlag|libWrapper|Object\.defineProperty|new Proxy|\.update\(|game\.settings/);
  assert.ok(SAVE_DELAY_MS > 0);
});

test('docs: changelog and README mention the feature', () => {
  assert.match(read('../CHANGELOG.md'), /^## 0\.101\.0 /);
  assert.match(read('../README.md'), /Dock pop-outs remember their place/);
});
