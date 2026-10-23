/**
 * Regression (reported after 0.37.0, not reproduced here): quick bar keys in a popped-out Hub, end to end through the sheet's own render path. Two fake documents (the
 * main Foundry page and the pop-out's), Foundry's detachWindow / attachWindow mocked the way V14 documents them (the
 * element moves to the other document, then _onDetach / _onAttach run and the Hub redraws). Mocked Foundry: this
 * proves the logic and wiring only, not Foundry's real detached window or its own keyboard handling.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass} from '../scripts/sheet.mjs';
import {registerQuickKeys, pressQuickSlot} from '../scripts/quick-keys.mjs';

const Hub = createHubSheetClass(FakeActorSheetV2);

/** A document that keeps its keydown listeners and can "press" a key at its body (bubble phase, like a real one). */
function fakeDoc(name) {
  const doc = {name, listeners: [], activeElement: null, documentElement: {dataset: {}, style: {setProperty() {}, removeProperty() {}}, classList: {toggle() {}, add() {}, remove() {}}},
    addEventListener(type, fn, capture) { if (type === 'keydown') doc.listeners.push({fn, capture: !!capture}); },
    removeEventListener(type, fn, capture) { doc.listeners = doc.listeners.filter(l => !(l.fn === fn && l.capture === !!capture)); }};
  doc.body = {tagName: 'BODY', closest: () => null, ownerDocument: doc};
  return doc;
}
/** A keydown at `doc`'s body: capture listeners, then bubble ones, as long as nobody stopped it. */
function press(doc, code, extra = {}) {
  const ev = {type: 'keydown', code, key: code.replace(/^Digit/, ''), target: doc.body, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
    repeat: false, isComposing: false, stopped: false, prevented: false,
    preventDefault() { ev.prevented = true; }, stopPropagation() { ev.stopped = true; }, stopImmediatePropagation() { ev.stopped = true; }, ...extra};
  for (const l of [...doc.listeners.filter(l => l.capture), ...doc.listeners.filter(l => !l.capture)]) { if (ev.stopped) break; l.fn(ev); }
  return ev;
}

/** The Hub's .window-content stand-in: what was drawn is a string, and the slots are found in it. */
function fakeContent(owner) {
  let html = '';
  const content = {get ownerDocument() { return owner.doc; }, tagName: 'SECTION', classList: [], scrollTop: 0, scrollLeft: 0,
    get innerHTML() { return html; }, set innerHTML(v) { html = v; },
    querySelector: sel => sel === '[data-hotbar-slot]' && /data-hotbar-slot=/.test(html) ? {} : sel === '.window-content' ? content : null,
    querySelectorAll: () => [], contains: () => false, addEventListener() {}, insertAdjacentHTML() {}};
  return content;
}

function bootHub() {
  installGlobals();
  const main = fakeDoc('main'), pop = fakeDoc('pop-out');
  globalThis.document = main;
  // Slot 2 holds a world macro that counts its runs.
  const runs = [];
  const macro = {documentName: 'Macro', uuid: 'Macro.m2', name: '[TEST] Slot two', img: 'm.webp', canExecute: true, execute: async () => { runs.push(owner.doc.name); return 'ran'; }};
  globalThis.fromUuidSync = uuid => uuid === macro.uuid ? macro : null;
  const actor = makeActor();
  actor.flags = {'ashen-gate-character-hub': {hotbar: [null, {type: 'Macro', uuid: macro.uuid}]}};
  const sheet = new Hub({document: actor});
  const owner = {doc: main};
  const content = fakeContent(owner);
  sheet.element = {get ownerDocument() { return owner.doc; }, style: {setProperty() {}, removeProperty() {}}, classList: {toggle() {}, add() {}, remove() {}},
    querySelector: sel => content.querySelector(sel), querySelectorAll: () => [], dataset: {}};
  sheet.rendered = true;
  sheet.position = {top: 40, height: 800, width: 1240};
  sheet.setPosition = p => Object.assign(sheet.position, p);
  // A render draws the real Hub HTML into the content through the sheet's own _replaceHTML.
  sheet.render = async () => { sheet._replaceHTML(await sheet._renderHTML(), content); return sheet; };
  // V14: detachWindow moves the element to the new window's document, then calls _onDetach(from, to); attachWindow back.
  sheet._canDetach = () => true;
  sheet.detachWindow = async () => { owner.doc = pop; sheet._onDetach(main, pop); };
  sheet.attachWindow = async () => { owner.doc = main; sheet._onAttach(pop, main); };
  // Foundry's keybindings: the Hub's ten bindings with their default keys, and the main window's key handling.
  const bindings = new Map();
  registerQuickKeys({register: (ns, action, cfg) => bindings.set(action, cfg)}, (i, ev) => pressQuickSlot(i, ev, [sheet], null));
  game.keybindings = {get: (ns, action) => bindings.get(action)?.editable ?? []};
  main.addEventListener('keydown', ev => {   // what Foundry's KeyboardManager does in its own page
    for (const cfg of bindings.values()) if (cfg.editable.some(b => b.key === ev.code) && cfg.onDown({event: ev})) { ev.preventDefault(); return; }
  });
  const settle = () => new Promise(r => setTimeout(r, 0));
  return {sheet, main, pop, runs, settle, content};
}

test('popped out: key 2 runs slot 2 once from the pop-out window, drawer closed and open; popped back in it works in the main window', async () => {
  const {sheet, main, pop, runs, settle} = bootHub();
  await sheet.render();
  assert.equal(sheet._agchQuickKeys ?? null, null, 'in the main window Foundry\'s keybindings do it');
  assert.ok(press(main, 'Digit2').prevented); await settle();
  assert.deepEqual(runs, ['main'], 'main window: slot 2 once');

  assert.deepEqual(await sheet.dispatch('pop-out', {dataset: {}}, {}), {ok: true, result: 'out'});
  await settle();
  assert.equal(pop.listeners.length, 1, 'one key listener in the pop-out window');
  assert.equal(sheet.quickOpen, false);
  const closed = press(pop, 'Digit2'); await settle();
  assert.ok(closed.prevented, 'the key is taken');
  assert.deepEqual(runs, ['main', 'pop-out'], 'drawer closed: slot 2 once');

  await sheet.dispatch('quick-toggle', {dataset: {}}, {}); await settle();
  assert.equal(sheet.quickOpen, true);
  press(pop, 'Digit2'); await settle();
  assert.deepEqual(runs, ['main', 'pop-out', 'pop-out'], 'drawer open: slot 2 once');
  press(pop, 'Digit2', {repeat: true}); await settle();
  assert.equal(runs.length, 3, 'holding the key does not repeat it');
  press(main, 'Digit2'); await settle();
  assert.equal(runs.length, 4, 'a key in the main page still reaches the popped-out Hub (once)');

  assert.deepEqual(await sheet.dispatch('pop-out', {dataset: {}}, {}), {ok: true, result: 'in'});
  await settle();
  assert.equal(pop.listeners.length, 0, 'the pop-out listener is gone');
  press(main, 'Digit2'); await settle();
  assert.deepEqual(runs.slice(4), ['main'], 'popped back in: slot 2 once in the main window');
});

test('popped out: one key press seen by both Foundry and the pop-out listener runs the slot once', async () => {
  const {sheet, main, pop, runs, settle} = bootHub();
  await sheet.render();
  await sheet.dispatch('pop-out', {dataset: {}}, {}); await settle();
  // If Foundry also handles keys from a detached window, it sees the same event first (window capture phase).
  pop.addEventListener('keydown', ev => { for (const l of main.listeners) l.fn(ev); }, true);
  press(pop, 'Digit2'); await settle();
  assert.equal(runs.length, 1);
});

test('popped out: keys 1-9 and 0 map to slots 1-10; numpad and modified keys are left alone; typing is left alone', async () => {
  const {sheet, pop, settle} = bootHub();
  await sheet.render();
  await sheet.dispatch('pop-out', {dataset: {}}, {}); await settle();
  const used = [];
  const orig = sheet.dispatch.bind(sheet);
  sheet.dispatch = (a, t, e) => { if (a === 'hotbar-use') { used.push(t.dataset.hotbarSlot); return null; } return orig(a, t, e); };
  for (const d of [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]) press(pop, `Digit${d}`);
  assert.deepEqual(used, ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
  assert.equal(press(pop, 'Numpad2').prevented, false, 'numpad is not bound by default');
  assert.equal(press(pop, 'Digit2', {ctrlKey: true}).prevented, false);
  assert.equal(press(pop, 'Digit2', {target: {closest: () => ({tagName: 'INPUT', type: 'search'})}}).prevented, false);
  assert.equal(used.length, 10);
});
