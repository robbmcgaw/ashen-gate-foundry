/** 0.21.0 Pin look: mocked Foundry Notes and settings; logic only. These tests do not render a real V14 canvas. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NAME_SIZE, nameSizeOf, applyPinLook, registerPinLook, readPinLook, refreshPins, labelIsOurs, pinLookOf, PIN_LOOKS, DEFAULT_PIN_LOOK} from '../scripts/pin-look.mjs';
import {MODULE_ID} from '../scripts/model.mjs';

const gfx = () => ({visible: true});
function note({bound = true, text = 'Ashenford', pageView = '', hasPage = false, hover = false, controlled = false, anchor = 3, fontSize} = {}) {
  const flags = bound ? {[MODULE_ID]: {pinKey: 'PIN-abc'}} : {};
  const page = hasPage ? {getFlag: (s, k) => (s === MODULE_ID && k === 'view' ? pageView : undefined)} : undefined;
  const style = {strokeThickness: 4, dropShadow: false, fontSize: fontSize ?? 32};
  return {
    hover, controlled, isPreview: false, layer: {highlightObjects: false}, eventMode: 'static', interactive: true, cursor: 'pointer',
    controlIcon: {bg: gfx(), border: gfx(), icon: {visible: true}, eventMode: 'static', hitArea: {width: 48}},
    tooltip: {visible: false, style},
    document: {text, page, fontSize: fontSize ?? 32, textAnchor: anchor, get label() { return this.text || this.page?.name || 'Journal'; }, getFlag: (s, k) => flags[s]?.[k]}
  };
}

test('the setting values round-trip and default to Foundry\'s framed look', () => {
  assert.equal(DEFAULT_PIN_LOOK, 'framed');
  assert.deepEqual(Object.keys(PIN_LOOKS), ['framed', 'image']);
  assert.equal(PIN_LOOKS.framed, 'Framed (Foundry default)');
  assert.equal(pinLookOf('nonsense'), 'framed');
  assert.deepEqual(readPinLook(() => undefined), {look: 'framed', showName: false, nameSize: 14});
  const store = {pinLook: 'image', pinShowName: true, pinNameSize: 20};
  assert.deepEqual(readPinLook(k => store[k]), {look: 'image', showName: true, nameSize: 20});
  assert.deepEqual(readPinLook(() => { throw new Error('no settings'); }), {look: 'framed', showName: false, nameSize: 14});
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
  assert.ok(n.tooltip.style.strokeThickness >= 2); assert.equal(n.tooltip.style.dropShadow, true);
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
  assert.deepEqual(set, [{refreshState: true, refreshTooltip: true}, {refreshState: true, refreshTooltip: true}]);
  assert.doesNotThrow(() => refreshPins(undefined));
});

test('GM Setup offers the Map Pins card and saves both settings', () => {
  const src = fs.readFileSync(new URL('../scripts/app.mjs', import.meta.url), 'utf8');
  assert.match(src, /<h3>Map Pins<\/h3>/); assert.match(src, /id="agl-set-pinlook"/); assert.match(src, /id="agl-set-pinname"/);
  assert.match(src, /set\(MODULE_ID, 'pinLook'/); assert.match(src, /set\(MODULE_ID, 'pinShowName'/);
});

test('Name size defaults to 14 and is clamped to 8..48', () => {
  assert.deepEqual({...NAME_SIZE}, {min: 8, max: 48, default: 14});
  assert.equal(nameSizeOf(undefined), 14); assert.equal(nameSizeOf('abc'), 14);
  assert.equal(nameSizeOf(1), 8); assert.equal(nameSizeOf(500), 48); assert.equal(nameSizeOf('20.4'), 20);
  const n = note(); applyPinLook(n, {showName: true});
  assert.equal(n.tooltip.style.fontSize, 14);
  const big = note(); applyPinLook(big, {showName: true, nameSize: 999}); assert.equal(big.tooltip.style.fontSize, 48);
  const small = note(); applyPinLook(small, {showName: true, nameSize: 0}); assert.equal(small.tooltip.style.fontSize, 8);
});

test('outline and shadow scale with the size', () => {
  const a = note(); applyPinLook(a, {showName: true, nameSize: 12});
  const b = note(); applyPinLook(b, {showName: true, nameSize: 48});
  assert.equal(a.tooltip.style.strokeThickness, 2); assert.equal(b.tooltip.style.strokeThickness, 8);
  assert.ok(b.tooltip.style.dropShadowBlur > a.tooltip.style.dropShadowBlur);
});

test('a Font Size set by hand on the Note (not Foundry\'s 32) wins over the setting', () => {
  const n = note({fontSize: 20}); applyPinLook(n, {showName: true, nameSize: 14});
  assert.equal(n.tooltip.style.fontSize, 20);
  assert.equal(n.document.fontSize, 20);
});

test('Name size only applies when Show name is on, and writes nothing to the Note', () => {
  const n = note(); const before = JSON.stringify(n.document);
  applyPinLook(n, {showName: false, nameSize: 10}); assert.equal(n.tooltip.style.fontSize, 32);
  applyPinLook(n, {showName: true, nameSize: 10});
  assert.equal(JSON.stringify(n.document), before);
});

test('main.mjs registers pinNameSize as a world Number; GM Setup saves it', () => {
  const main = fs.readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  assert.match(main, /register\(MODULE_ID, 'pinNameSize',[^]*?scope: 'world'[^]*?type: Number, default: NAME_SIZE.default, restricted: true/);
  const app = fs.readFileSync(new URL('../scripts/app.mjs', import.meta.url), 'utf8');
  assert.match(app, /id="agl-set-pinsize" type="number"/); assert.match(app, /set\(MODULE_ID, 'pinNameSize'/);
});
