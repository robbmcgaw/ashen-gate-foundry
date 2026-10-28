/** 0.21.0 Pin look: mocked Foundry Notes and settings; logic only. These tests do not render a real V14 canvas. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applyPinLook, registerPinLook, readPinLook, refreshPins, labelIsOurs, pinLookOf, PIN_LOOKS, DEFAULT_PIN_LOOK} from '../scripts/pin-look.mjs';
import {MODULE_ID} from '../scripts/model.mjs';

const gfx = () => ({visible: true});
function note({bound = true, text = 'Ashenford', pageView = '', hasPage = false, hover = false, controlled = false, anchor = 3} = {}) {
  const flags = bound ? {[MODULE_ID]: {pinKey: 'PIN-abc'}} : {};
  const page = hasPage ? {getFlag: (s, k) => (s === MODULE_ID && k === 'view' ? pageView : undefined)} : undefined;
  const style = {strokeThickness: 4, dropShadow: false};
  return {
    hover, controlled, isPreview: false, layer: {highlightObjects: false}, eventMode: 'static', interactive: true, cursor: 'pointer',
    controlIcon: {bg: gfx(), border: gfx(), icon: {visible: true}, eventMode: 'static', hitArea: {width: 48}},
    tooltip: {visible: false, style},
    document: {text, page, textAnchor: anchor, get label() { return this.text || this.page?.name || 'Journal'; }, getFlag: (s, k) => flags[s]?.[k]}
  };
}

test('the setting values round-trip and default to Foundry\'s framed look', () => {
  assert.equal(DEFAULT_PIN_LOOK, 'framed');
  assert.deepEqual(Object.keys(PIN_LOOKS), ['framed', 'image']);
  assert.equal(PIN_LOOKS.framed, 'Framed (Foundry default)');
  assert.equal(pinLookOf('nonsense'), 'framed');
  assert.deepEqual(readPinLook(() => undefined), {look: 'framed', showName: false});
  const store = {pinLook: 'image', pinShowName: true};
  assert.deepEqual(readPinLook(k => store[k]), {look: 'image', showName: true});
  assert.deepEqual(readPinLook(() => { throw new Error('no settings'); }), {look: 'framed', showName: false});
});

test('main.mjs registers both settings as world scope, GM-restricted, default Framed and name off', () => {
  const main = fs.readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  assert.match(main, /register\(MODULE_ID, 'pinLook',[^]*?scope: 'world'[^]*?default: DEFAULT_PIN_LOOK, restricted: true/);
  assert.match(main, /register\(MODULE_ID, 'pinShowName',[^]*?scope: 'world'[^]*?default: false, restricted: true/);
  assert.match(main, /registerPinLook\(\)/);
});

test('Image only hides the shaded backing and the frame; Framed leaves both', () => {
  const a = note(); applyPinLook(a, {look: 'image'});
  assert.equal(a.controlIcon.bg.visible, false);
  assert.equal(a.controlIcon.border.visible, false);
  assert.equal(a.controlIcon.icon.visible, true);
  const b = note(); applyPinLook(b, {look: 'framed'});
  assert.equal(b.controlIcon.bg.visible, true);
  assert.equal(b.controlIcon.border.visible, true);
});

test('switching back restores the frame (reversible, nothing written)', () => {
  const n = note(); applyPinLook(n, {look: 'image'}); applyPinLook(n, {look: 'framed'});
  assert.equal(n.controlIcon.bg.visible, true); assert.equal(n.controlIcon.border.visible, true);
});

test('the frame returns while an Image-only pin is hovered or selected', () => {
  for (const state of [{hover: true}, {controlled: true}]) {
    const n = note(state); applyPinLook(n, {look: 'image'});
    assert.equal(n.controlIcon.border.visible, true); assert.equal(n.controlIcon.bg.visible, false);
  }
});

test('only Notes bound to a location are touched', () => {
  const other = note({bound: false}); const before = JSON.stringify(other);
  assert.equal(applyPinLook(other, {look: 'image', showName: true}), false);
  assert.equal(JSON.stringify(other), before);
  assert.equal(other.tooltip.visible, false);
});

test('interactivity is untouched: event mode, cursor, hit area and the icon stay as Foundry set them', () => {
  const n = note(); applyPinLook(n, {look: 'image', showName: true});
  assert.equal(n.eventMode, 'static'); assert.equal(n.interactive, true); assert.equal(n.cursor, 'pointer');
  assert.equal(n.controlIcon.eventMode, 'static'); assert.deepEqual(n.controlIcon.hitArea, {width: 48});
  assert.equal(n.document.textAnchor, 3);
});

test('Show name makes the label always visible, with a readable outline, and leaves the text alone', () => {
  const n = note(); applyPinLook(n, {look: 'image', showName: true});
  assert.equal(n.tooltip.visible, true);
  assert.ok(n.tooltip.style.strokeThickness >= 5); assert.equal(n.tooltip.style.dropShadow, true);
  assert.equal(n.document.text, 'Ashenford'); assert.equal(n.document.label, 'Ashenford');
  const off = note(); applyPinLook(off, {look: 'image', showName: false});
  assert.equal(off.tooltip.visible, false, 'hover-only unless Show name is on');
});

test('label rules: a hidden pin (no text, generic page, no view) is never forced to show; unidentified and Selected are', () => {
  const hidden = note({text: '', hasPage: true, pageView: ''}); applyPinLook(hidden, {look: 'image', showName: true});
  assert.equal(hidden.tooltip.visible, false);
  const noPage = note({text: '', hasPage: false}); applyPinLook(noPage, {showName: true});
  assert.equal(noPage.tooltip.visible, false);
  const unidentified = note({text: 'Unknown place'}); applyPinLook(unidentified, {showName: true});
  assert.equal(unidentified.tooltip.visible, true); assert.equal(unidentified.document.label, 'Unknown place');
  const selected = note({text: '', hasPage: true, pageView: '{"name":"X"}'}); applyPinLook(selected, {showName: true});
  assert.equal(selected.tooltip.visible, true); assert.equal(selected.document.text, '');
  assert.equal(labelIsOurs(null), false);
});

test('missing properties never throw', () => {
  const bare = {document: {getFlag: () => 'PIN-abc'}};
  assert.doesNotThrow(() => applyPinLook(bare, {look: 'image', showName: true}));
  assert.doesNotThrow(() => applyPinLook({document: {getFlag: () => 'PIN-abc'}, controlIcon: {}, tooltip: {}}, {look: 'image', showName: true}));
  assert.doesNotThrow(() => applyPinLook({controlIcon: {bg: Object.freeze({}), border: null}, document: {getFlag() { throw new Error('x'); }}}, {look: 'image'}));
  assert.doesNotThrow(() => applyPinLook(null));
  const throwing = note(); Object.defineProperty(throwing.controlIcon.bg, 'visible', {set() { throw new Error('read only'); }, get: () => true});
  assert.doesNotThrow(() => applyPinLook(throwing, {look: 'image', showName: true}));
});

test('registerPinLook hooks refreshNote and never throws inside the hook', () => {
  const hooks = {calls: [], on(name, fn) { this.calls.push([name, fn]); }};
  registerPinLook(hooks, () => ({look: 'image', showName: true}));
  assert.equal(hooks.calls.length, 1); assert.equal(hooks.calls[0][0], 'refreshNote');
  const n = note(); hooks.calls[0][1](n, {});
  assert.equal(n.controlIcon.bg.visible, false);
  const failing = {calls: [], on(name, fn) { this.calls.push(fn); }};
  registerPinLook(failing, () => { throw new Error('settings gone'); });
  assert.doesNotThrow(() => failing.calls[0](note(), {}));
});

test('changing the setting asks only bound Notes on the scene to refresh', () => {
  const set = []; const mk = bound => ({...note({bound}), renderFlags: {set: f => set.push(f)}});
  refreshPins([mk(true), mk(false), mk(true)]);
  assert.deepEqual(set, [{refreshState: true}, {refreshState: true}]);
  assert.doesNotThrow(() => refreshPins(undefined));
});

test('GM Setup offers the Map Pins card and saves both settings', () => {
  const src = fs.readFileSync(new URL('../scripts/app.mjs', import.meta.url), 'utf8');
  assert.match(src, /<h3>Map Pins<\/h3>/); assert.match(src, /id="agl-set-pinlook"/); assert.match(src, /id="agl-set-pinname"/);
  assert.match(src, /set\(MODULE_ID, 'pinLook'/); assert.match(src, /set\(MODULE_ID, 'pinShowName'/);
});
