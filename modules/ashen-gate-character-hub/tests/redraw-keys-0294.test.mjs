/**
 * 0.29.4: quiet redraws (scroll per tab, focus, identical HTML skipped), the Compact see-through slider and the quick
 * bar keys. Mocked Foundry and a tiny fake DOM: these prove the logic and wiring only, not the live Foundry window,
 * real scrolling or Foundry's own keyboard handling.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass} from '../scripts/sheet.mjs';
import {captureScroll, restoreScroll, fieldKey} from '../scripts/redraw.mjs';
import {applyCompactOpacity} from '../scripts/compact-opacity.mjs';
import {QUICK_KEY_ACTIONS, registerQuickKeys, pressQuickSlot, targetHub, isTyping, slotForKey, syncQuickKeys, unbindQuickKeys} from '../scripts/quick-keys.mjs';
import {HELP_HTML} from '../scripts/help.mjs';

const Hub = createHubSheetClass(FakeActorSheetV2);

/** A fake element: tag, classes, data/name attributes, scroll offsets and (for fields) value, caret and focus. */
function el(tagName, classes = [], attrs = {}, props = {}) {
  const e = {tagName, classList: classes, attributes: Object.entries(attrs).map(([name, value]) => ({name, value: String(value)})),
    scrollTop: 0, scrollLeft: 0, disabled: false, ...props,
    matches: sel => sel.split(',').map(s => s.trim()).some(s => s.toUpperCase() === tagName),
    focus() { e.doc.activeElement = e; e.focused = true; },
    setSelectionRange(a, b) { e.caret = [a, b]; }};
  return e;
}
/** A .window-content stand-in. Setting innerHTML "parses" by calling page[html]() for fresh elements (all at scroll 0). */
function fakeContent(pages, doc = {activeElement: null}) {
  let html = '', kids = [];
  const content = {sets: 0, listeners: {}, ownerDocument: doc,
    get innerHTML() { return html; },
    set innerHTML(v) { html = v; content.sets++; kids = (pages[v] ?? (() => []))(); for (const k of kids) k.doc = doc; },
    querySelectorAll: sel => sel === '*' ? kids : kids.filter(k => k.matches(sel)),
    querySelector: sel => (sel === '[data-hotbar-slot]' ? kids.find(k => k.attributes.some(a => a.name === 'data-hotbar-slot')) : null) ?? null,
    contains: t => kids.includes(t),
    addEventListener(type, fn) { (content.listeners[type] ??= []).push(fn); },
    insertAdjacentHTML() {}, scrollTop: 0, scrollLeft: 0, classList: [], tagName: 'SECTION'};
  return content;
}
const listPage = (n = 3) => () => [el('DIV', ['agch-char']), el('DIV', ['agch-body', 'is-busy']), ...Array.from({length: n}, () => el('ARTICLE', ['agch-card']))];
const body = c => c.querySelectorAll('*').find(e => e.classList.includes('agch-body'));
const char = c => c.querySelectorAll('*').find(e => e.classList.includes('agch-char'));

function openHub(pages, settings = {}) {
  installGlobals({settings});
  const sheet = new Hub({document: makeActor()});
  const content = fakeContent(pages);
  sheet.element = {style: {setProperty() {}, removeProperty() {}}, classList: {toggle() {}, remove() {}}, querySelector: () => null, ownerDocument: content.ownerDocument};
  return {sheet, content};
}

test('scroll: every scrolled area is matched by tag, classes (state classes ignored) and order', () => {
  const a = fakeContent({x: listPage(), y: listPage()});
  a.innerHTML = 'x';
  body(a).scrollTop = 420; a.querySelectorAll('*')[3].scrollTop = 7;
  const saved = captureScroll(a);
  assert.deepEqual(Object.keys(saved).sort(), ['ARTICLE.agch-card#1', 'DIV.agch-body#0']);
  a.innerHTML = 'y';
  assert.equal(body(a).scrollTop, 0, 'a fresh draw starts at the top');
  restoreScroll(a, saved);
  assert.equal(body(a).scrollTop, 420);
  assert.equal(a.querySelectorAll('*')[3].scrollTop, 7);
  assert.equal(a.querySelectorAll('*')[2].scrollTop, 0);
});

test('a redraw from someone else\'s change keeps the list where the player is reading it', () => {
  const {sheet, content} = openHub({'inv v1': listPage(), 'inv v2': listPage(4)});
  sheet.tab = 'inventory';
  sheet._replaceHTML('inv v1', content);
  body(content).scrollTop = 900; char(content).scrollTop = 30;
  sheet._replaceHTML('inv v2', content);   // the GM changed Strain: new HTML
  assert.equal(content.sets, 2, 'redrawn');
  assert.equal(body(content).scrollTop, 900);
  assert.equal(char(content).scrollTop, 30);
});

test('scroll is per tab: a new tab starts at the top, going back returns to where you were', () => {
  const {sheet, content} = openHub({inv: listPage(), magic: listPage(), 'inv again': listPage()});
  sheet.tab = 'inventory'; sheet._replaceHTML('inv', content);
  body(content).scrollTop = 500;
  sheet.tab = 'magic'; sheet._replaceHTML('magic', content);
  assert.equal(body(content).scrollTop, 0, 'Magic not visited yet: top');
  body(content).scrollTop = 120;
  sheet.tab = 'inventory'; sheet._replaceHTML('inv again', content);
  assert.equal(body(content).scrollTop, 500);
  sheet.tab = 'magic'; sheet._replaceHTML('magic', content);
  assert.equal(body(content).scrollTop, 120);
});

test('an identical redraw is skipped: the content is not replaced, embedded views still refresh', () => {
  const {sheet, content} = openHub({same: listPage()});
  let refreshed = 0;
  sheet._replaceHTML('same', content);
  sheet._embeds.set('k', {element: {}, handle: {refresh: () => refreshed++}});
  body(content).scrollTop = 333;
  sheet._replaceHTML('same', content);
  assert.equal(content.sets, 1, 'not replaced');
  assert.equal(body(content).scrollTop, 333);
  assert.equal(refreshed, 1);
  sheet._onClose({});
  const again = fakeContent({same: listPage()});
  sheet._replaceHTML('same', again);
  assert.equal(again.sets, 1, 'a reopened Hub (new content element) always draws');
  assert.equal(body(again).scrollTop, 0, 'and starts at the top');
});

const searchPage = (value = '') => () => [el('DIV', ['agch-body']), el('INPUT', [], {'data-filter': '', 'data-tab': 'inventory', 'data-tooltip': 'x'}, {type: 'search', value, defaultValue: value})];
const amountPage = (saved = '') => () => [el('INPUT', [], {'data-hp-amount': ''}, {type: 'number', value: saved, defaultValue: saved})];

test('focus: the search box keeps the focus and caret across a redraw (its text comes from the kept filter)', () => {
  const {sheet, content} = openHub({a: searchPage('ro'), b: searchPage('ro')});
  sheet.tab = 'inventory'; sheet.filters.inventory = 'ro';
  sheet._replaceHTML('a', content);
  const box = content.querySelectorAll('input')[0];
  box.focus(); box.selectionStart = 2; box.selectionEnd = 2;
  sheet._replaceHTML('b', content);
  const next = content.querySelectorAll('input')[0];
  assert.notEqual(next, box, 'new element');
  assert.equal(content.ownerDocument.activeElement, next);
  assert.deepEqual(next.caret, [2, 2]);
  assert.equal(next.value, 'ro');
  assert.equal(fieldKey(next), 'INPUT[data-filter=][data-tab=inventory]', 'tooltips are not part of the identity');
});

test('focus: text typed but not saved stays, unless the field now shows a different saved value', () => {
  const {sheet, content} = openHub({a: amountPage(), b: amountPage(), c: amountPage('5')});
  sheet._replaceHTML('a', content);
  let box = content.querySelectorAll('input')[0];
  box.focus(); box.value = '7';
  sheet._replaceHTML('b', content);
  box = content.querySelectorAll('input')[0];
  assert.equal(box.value, '7'); assert.equal(box.focused, true);
  sheet._replaceHTML('c', content);
  box = content.querySelectorAll('input')[0];
  assert.equal(box.value, '5', 'someone else saved a value: theirs shows');
});

test('focus is not moved when nothing in the Hub had it', () => {
  const {sheet, content} = openHub({a: amountPage(), b: amountPage()});
  sheet._replaceHTML('a', content);
  sheet._replaceHTML('b', content);
  assert.equal(content.ownerDocument.activeElement, null);
});

test('Compact see-through: variable and see-through class on the window, removed in Full; read from the saved setting on each redraw', () => {
  installGlobals({settings: {compactMode: true, compactOpacity: 70}});
  const props = {}, classes = new Set();
  const element = {style: {setProperty: (k, v) => { props[k] = v; }, removeProperty: k => { delete props[k]; }},
    classList: {toggle: (c, on) => on ? classes.add(c) : classes.delete(c), remove: c => classes.delete(c)}, querySelector: () => null};
  const sheet = new Hub({document: makeActor()});
  sheet.element = element;
  const content = fakeContent({a: listPage(), b: listPage(2)});
  sheet._replaceHTML('a', content);
  assert.equal(props['--agch-compact-alpha'], '70%'); assert.ok(classes.has('agch-see-through'));
  // slider: input applies at once, change saves for this user
  const slider = {matches: s => s === '[data-compact-opacity]', value: '60'};
  for (const fn of content.listeners.input) fn({target: slider});
  assert.equal(props['--agch-compact-alpha'], '60%');
  for (const fn of content.listeners.change) fn({target: slider});
  assert.equal(game.settings.store.compactOpacity, 60);
  sheet._replaceHTML('b', content);   // a redraw keeps it
  assert.equal(props['--agch-compact-alpha'], '60%');
  applyCompactOpacity(sheet, 100);
  assert.ok(!classes.has('agch-see-through'), 'opaque: no see-through class');
  sheet.compact = false; applyCompactOpacity(sheet);
  assert.equal(props['--agch-compact-alpha'], undefined);
});

test('Compact see-through CSS: the Compact column fades with the window (it covered the faded background before)', () => {
  const css = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
  assert.match(css, /--agch-bg-raised-fade: color-mix\(in srgb, var\(--ag-surface-raised\) var\(--agch-compact-alpha, 100%\), transparent\)/);
  assert.match(css, /\.agch-root--compact \.agch-char--compact \{ background: radial-gradient\(ellipse at 50% 28%, var\(--agch-bg-raised-fade\), var\(--agch-bg\) 72%\); \}/);
  assert.match(css, /\.agch-see-through \{ backdrop-filter: none; \}/);
});

// ---------- Quick bar keys ----------
/** A Hub stand-in for the key logic: drawn, editable, with a quick bar, recording dispatches. */
const hubLike = (extra = {}) => ({rendered: true, minimized: false, hubContext: {editable: true}, element: {querySelector: s => s === '[data-hotbar-slot]' ? {} : null},
  calls: [], dispatch(action, target, event) { this.calls.push([action, target.dataset.hotbarSlot, event]); return Promise.resolve(); }, ...extra});
const key = (props = {}) => ({code: 'Digit1', target: {closest: () => null}, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...props});

test('ten Foundry keybindings, 1-9 then 0, player-usable, with Foundry\'s PRIORITY precedence', () => {
  const reg = [];
  registerQuickKeys({register: (ns, action, cfg) => reg.push([ns, action, cfg])}, () => true, 3);
  assert.equal(reg.length, 10);
  assert.deepEqual(reg.map(r => r[1]), QUICK_KEY_ACTIONS);
  assert.deepEqual(reg.map(r => r[2].editable[0].key), ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0']);
  assert.ok(reg.every(r => r[0] === 'ashen-gate-character-hub' && r[2].restricted === false && r[2].precedence === 3));
  const seen = [];
  registerQuickKeys({register: (ns, action, cfg) => { if (action === 'quickSlot10') cfg.onDown({event: 'E'}); }}, (i, e) => seen.push([i, e]));
  assert.deepEqual(seen, [[9, 'E']], 'slot 10 is index 9');
});

test('a key uses the slot of the Hub in front and is consumed; with no Hub it is left to Foundry\'s macro bar', () => {
  assert.equal(pressQuickSlot(0, key(), []), false, 'no Hub: Foundry keeps the key');
  const back = hubLike({position: {zIndex: 10}}), front = hubLike({position: {zIndex: 30}});
  assert.equal(pressQuickSlot(2, key(), [back, front]), true);
  assert.deepEqual(front.calls.map(c => c.slice(0, 2)), [['hotbar-use', '2']]);
  assert.equal(back.calls.length, 0);
  assert.equal(targetHub([back, front], back), back, 'the active window wins');
});

test('quick keys: never while typing, once per key press, not on key repeat, not for a view-only or hidden quick bar', () => {
  const hub = hubLike();
  const typing = {closest: () => ({tagName: 'INPUT', type: 'search'})};
  assert.equal(pressQuickSlot(0, key({target: typing}), [hub]), false);
  assert.equal(isTyping({closest: () => ({tagName: 'INPUT', type: 'range'})}), false, 'a focused slider is not typing');
  assert.equal(isTyping({closest: () => ({tagName: 'TEXTAREA'})}), true);
  const ev = key();
  assert.equal(pressQuickSlot(0, ev, [hub]), true);
  assert.equal(pressQuickSlot(0, ev, [hub]), true, 'the same press seen again (popped-out and main handling)');
  assert.equal(hub.calls.length, 1, 'used once');
  assert.equal(pressQuickSlot(0, key({repeat: true}), [hub]), true);
  assert.equal(hub.calls.length, 1, 'holding the key does not repeat the use');
  assert.equal(pressQuickSlot(0, key(), [hubLike({hubContext: {editable: false}})]), false, 'view only: key left alone');
  assert.equal(pressQuickSlot(0, key(), [hubLike({element: {querySelector: () => null}})]), false, 'quick bar hidden by the GM');
  assert.equal(pressQuickSlot(0, key(), [hubLike({minimized: true})]), false);
});

test('slotForKey matches the configured binding by code and exact modifiers', () => {
  const bindings = a => a === 'quickSlot3' ? [{key: 'KeyQ', modifiers: ['Shift']}] : a === 'quickSlot10' ? [{key: 'Digit0', modifiers: []}] : [];
  assert.equal(slotForKey(key({code: 'KeyQ', shiftKey: true}), bindings), 2);
  assert.equal(slotForKey(key({code: 'KeyQ'}), bindings), -1);
  assert.equal(slotForKey(key({code: 'Digit0'}), bindings), 9);
  assert.equal(slotForKey(key({code: 'Digit0', ctrlKey: true}), bindings), -1);
});

test('a popped-out Hub listens for its keys in its own window only, and stops on close', () => {
  installGlobals();
  globalThis.document = {name: 'main'};
  game.keybindings = {get: (ns, a) => a === 'quickSlot1' ? [{key: 'Digit1', modifiers: []}] : []};
  const popDoc = {listeners: [], addEventListener(t, fn) { this.listeners.push(fn); }, removeEventListener(t, fn) { this.listeners = this.listeners.filter(f => f !== fn); }};
  const hub = hubLike({element: {ownerDocument: globalThis.document, querySelector: s => s === '[data-hotbar-slot]' ? {} : null}});
  syncQuickKeys(hub);
  assert.equal(hub._agchQuickKeys ?? null, null, 'in the main window Foundry\'s keybindings do it');
  hub.element.ownerDocument = popDoc;
  syncQuickKeys(hub); syncQuickKeys(hub);
  assert.equal(popDoc.listeners.length, 1, 'one listener');
  let prevented = false;
  popDoc.listeners[0](key({preventDefault() { prevented = true; }, stopPropagation() {}}));
  assert.deepEqual(hub.calls.map(c => c.slice(0, 2)), [['hotbar-use', '0']]);
  assert.ok(prevented);
  popDoc.listeners[0](key({code: 'KeyA'}));
  assert.equal(hub.calls.length, 1, 'other keys pass');
  unbindQuickKeys(hub);
  assert.equal(popDoc.listeners.length, 0);
  delete game.keybindings;
});

test('Help lists the quick bar keys', () => {
  assert.match(HELP_HTML, /<strong>Keys 1-9 and 0<\/strong> use slots 1-10/);
  assert.match(HELP_HTML, /Configure Controls/);
  void users;
});
