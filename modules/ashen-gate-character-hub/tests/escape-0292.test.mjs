/** Escape closes only an open Hub menu/editor, wherever focus is, in the main or a popped-out window (0.29.2). Mocked Foundry: logic only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass} from '../scripts/sheet.mjs';
import {POPOVERS, escapePopover} from '../scripts/escape.mjs';

const Hub = createHubSheetClass(FakeActorSheetV2);

/** A document that records keydown listeners and can dispatch a key to them the way the browser does (capture first). */
function fakeDoc(name) {
  const doc = {name, listeners: [], body: null, documentElement: {dataset: {}},
    addEventListener(type, fn, capture) { this.listeners.push({type, fn, capture}); },
    removeEventListener(type, fn, capture) { this.listeners = this.listeners.filter(l => !(l.type === type && l.fn === fn && l.capture === capture)); },
    keydown(key, target = doc.body) {
      const ev = {key, target, defaultPrevented: false, stopped: false, immediate: false,
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, stopImmediatePropagation() { this.immediate = true; this.stopped = true; }};
      for (const l of [...this.listeners].filter(l => l.type === 'keydown').sort((a, b) => Number(!!b.capture) - Number(!!a.capture))) { if (ev.immediate) break; l.fn(ev); }
      // Foundry's own Escape (closes the top window) runs last, unless something stopped the key.
      if (key === 'Escape' && !ev.stopped && !ev.defaultPrevented) doc.foundryClosed = true;
      return ev;
    }};
  doc.body = {tag: 'body', closest: () => null};
  return doc;
}

/** The Hub's element: answers querySelector for the popovers that are drawn, and contains its own children. */
function fakeElement(sheet, doc) {
  return {ownerDocument: doc, style: {}, contains: t => t?.inHub === true,
    querySelector(sel) {
      if (sel === '.agch-menu') return sheet.menu ? {} : null;
      if (sel === '[data-journey-form="edit"]') return sheet.journeyEdit ? {} : null;
      if (sel === '.agch-conds__list') return sheet.condAdd && !sheet.compact ? {} : null;
      return null;
    }, querySelectorAll: () => []};
}
const content = () => ({innerHTML: '', querySelector: () => null, addEventListener: () => {}, insertAdjacentHTML: () => {}});

function openHub(doc) {
  installGlobals();
  globalThis.document = doc;
  const sheet = new Hub({document: makeActor()});
  sheet.element = fakeElement(sheet, doc);
  // Each render redraws, the way ApplicationV2 calls _replaceHTML.
  sheet.render = async function (opts) { this.renders.push(opts ?? {}); this._replaceHTML('', content()); return this; };
  return sheet;
}
// Escape's listener is the capture-phase one (a popped-out Hub also has a quick bar key listener, 0.29.4).
const escListeners = doc => doc.listeners.filter(l => l.type === 'keydown' && l.capture).length;

test('slot menu open, focus on <body>: Escape closes only the menu, the Hub stays open', async () => {
  const doc = fakeDoc('main'), sheet = openHub(doc);
  await sheet.dispatch('slot-menu', {dataset: {slot: 'head'}}, {});
  assert.equal(sheet.menu, 'slot:head');
  assert.equal(escListeners(doc), 1, 'one listener on the document while the menu is open');
  const ev = doc.keydown('Escape');
  assert.equal(sheet.menu, null, 'menu closed');
  assert.equal(ev.defaultPrevented, true); assert.equal(ev.stopped, true); assert.equal(ev.immediate, true);
  assert.notEqual(doc.foundryClosed, true, "Foundry's Escape never saw the key");
  assert.equal(escListeners(doc), 0, 'listener removed once nothing is open');
  doc.keydown('Escape');
  assert.equal(doc.foundryClosed, true, 'with nothing open, Escape is Foundry\'s again (closes the Hub)');
});

test('right-click menu, Other ⋯ menu and the HP editor close the same way; focus inside the Hub too', async () => {
  const doc = fakeDoc('main'), sheet = openHub(doc);
  sheet._onContextMenu({target: {closest: s => s === '[data-action="slot-menu"]' ? {dataset: {slot: 'feet'}} : null}, preventDefault() {}, stopPropagation() {}});
  await Promise.resolve();
  assert.equal(sheet.menu, 'slot:feet');
  doc.keydown('Escape', {inHub: true, closest: () => null});
  assert.equal(sheet.menu, null);
  await sheet.dispatch('other-menu', {dataset: {id: 'abc'}}, {});
  doc.keydown('Escape');
  assert.equal(sheet.menu, null);
  sheet.menu = 'hp'; await sheet.render();
  doc.keydown('Escape', {inHub: true, closest: () => null});
  assert.equal(sheet.menu, null, 'HP editor closed (nothing applied)');
  assert.notEqual(doc.foundryClosed, true);
});

test('conditions add list and the Journey inline editor: Escape closes them, innermost first', async () => {
  const doc = fakeDoc('main'), sheet = openHub(doc);
  sheet.condAdd = true; sheet.journeyEdit = 'j1'; sheet.menu = 'slot:head'; await sheet.render();
  doc.keydown('Escape');
  assert.deepEqual([sheet.menu, sheet.journeyEdit, sheet.condAdd], [null, 'j1', true]);
  doc.keydown('Escape');
  assert.deepEqual([sheet.journeyEdit, sheet.condAdd], [null, true]);
  doc.keydown('Escape');
  assert.equal(sheet.condAdd, false);
  assert.notEqual(doc.foundryClosed, true);
  assert.equal(escListeners(doc), 0);
  assert.deepEqual(POPOVERS.map(p => p.selector), ['.agch-menu', '[data-journey-form="edit"]', '.agch-conds__list']);
});

test('a popover state that is not drawn (conditions list in Compact) does not swallow Escape', async () => {
  const doc = fakeDoc('main'), sheet = openHub(doc);
  sheet.compact = true; sheet.condAdd = true; await sheet.render();
  assert.equal(escListeners(doc), 0);
  doc.keydown('Escape');
  assert.equal(doc.foundryClosed, true);
});

test('popped out: the listener moves to the new window\'s document, and back on Pop in; none left behind', async () => {
  const main = fakeDoc('main'), pop = fakeDoc('popout'), sheet = openHub(main);
  await sheet.dispatch('slot-menu', {dataset: {slot: 'head'}}, {});
  assert.equal(escListeners(main), 1);
  sheet.element.ownerDocument = pop;           // Foundry moved the element into the detached window
  sheet._onDetach(null, null);
  assert.equal(escListeners(main), 0, 'main window cleaned up');
  assert.equal(escListeners(pop), 1, 'menu stays open in the popped-out window');
  pop.keydown('Escape');
  assert.equal(sheet.menu, null); assert.notEqual(pop.foundryClosed, true);
  assert.equal(escListeners(pop), 0);
  await sheet.dispatch('slot-menu', {dataset: {slot: 'head'}}, {});
  sheet.element.ownerDocument = main;
  sheet._onAttach(null, null);
  assert.deepEqual([escListeners(pop), escListeners(main)], [0, 1]);
});

test('re-renders keep exactly one listener; closing the Hub removes it', async () => {
  const doc = fakeDoc('main'), sheet = openHub(doc);
  await sheet.dispatch('slot-menu', {dataset: {slot: 'head'}}, {});
  await sheet.render(); await sheet.render();
  assert.equal(escListeners(doc), 1);
  sheet._onClose({});
  assert.equal(escListeners(doc), 0);
});

test('other keys, IME composition and a key aimed at another window (a Foundry dialog) are left alone', async () => {
  const doc = fakeDoc('main'), sheet = openHub(doc);
  await sheet.dispatch('slot-menu', {dataset: {slot: 'head'}}, {});
  assert.equal(doc.keydown('Enter').stopped, false);
  assert.equal(escapePopover(sheet, {key: 'Escape', isComposing: true, target: doc.body}), false);
  const dialogInput = {closest: s => s.includes('.application') ? {} : null};
  const ev = doc.keydown('Escape', dialogInput);
  assert.equal(ev.stopped, false);
  assert.equal(sheet.menu, 'slot:head', 'the dialog gets the Escape, the menu stays');
});

test('a click outside the menu still closes it (kept)', async () => {
  const doc = fakeDoc('main'), sheet = openHub(doc);
  await sheet.dispatch('slot-menu', {dataset: {slot: 'head'}}, {});
  await sheet._onOutsideClick({target: {closest: () => null}});
  assert.equal(sheet.menu, null);
  assert.equal(escListeners(doc), 0);
});
