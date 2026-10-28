/** 0.21.0 Pin look: mocked Foundry Notes and settings; logic only. These tests do not render a real V14 canvas. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NAME_SIZE, nameSizeOf, applyPinLook, registerPinLook, readPinLook, refreshPins, labelIsOurs, pinLookOf, PIN_LOOKS, DEFAULT_PIN_LOOK} from '../scripts/pin-look.mjs';
import {MODULE_ID} from '../scripts/model.mjs';

const gfx = () => ({visible: true});
function note({bound = true, text = 'Ashenford', pageView = '', hasPage = false, hover = false, controlled = false, anchor = 1, fontSize} = {}) {
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
  assert.deepEqual(readPinLook(() => undefined), {look: 'framed', nameMode: 'hover', showName: false, nameSize: 14, wrap: 0, nameOffset: 0});
  const store = {pinLook: 'image', pinShowName: true, pinNameSize: 20};
  assert.deepEqual(readPinLook(k => store[k]), {look: 'image', nameMode: 'always', showName: true, nameSize: 20, wrap: 0, nameOffset: 0});
  assert.deepEqual(readPinLook(() => { throw new Error('no settings'); }), {look: 'framed', nameMode: 'hover', showName: false, nameSize: 14, wrap: 0, nameOffset: 0});
});

test('main.mjs registers both settings as world scope, GM-restricted, default Framed and name off', () => {
  const main = fs.readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  assert.match(main, /register\(MODULE_ID, 'pinLook',[^]*?scope: 'world'[^]*?default: DEFAULT_PIN_LOOK, restricted: true/);
  assert.match(main, /register\(MODULE_ID, 'pinNameMode',[^]*?scope: 'world'[^]*?default: '', restricted: true[^]*?register\(MODULE_ID, 'pinShowName',[^]*?default: false/);
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
  assert.equal(n.document.textAnchor, 1);
});

test('Show name makes the label always visible, with a readable outline, and leaves the text alone', () => {
  const n = note(); applyPinLook(n, {look: 'image', showName: true});
  assert.equal(n.tooltip.visible, true);
  assert.ok(n.tooltip.style.strokeThickness >= 2); assert.equal(n.tooltip.style.dropShadow, true);
  assert.equal(n.document.text, 'Ashenford'); assert.equal(n.document.label, 'Ashenford');
  const off = note(); applyPinLook(off, {look: 'image', nameMode: 'hover'});
  assert.equal(off.tooltip.visible, false, 'hover mode leaves visibility to core');
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
  assert.deepEqual(hooks.calls.map(c => c[0]), ['refreshNote', 'updateNote']); // 0.27.0 adds updateNote (keep-proportions flag changes)
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
  assert.match(src, /set\(MODULE_ID, 'pinLook'/); assert.match(src, /set\(MODULE_ID, 'pinNameMode'/);
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

test('Name size applies to the label in both modes, and writes nothing to the Note', () => {
  const n = note(); const before = JSON.stringify(n.document);
  applyPinLook(n, {nameMode: 'hover', nameSize: 10}); assert.equal(n.tooltip.style.fontSize, 10);
  applyPinLook(n, {nameMode: 'always', nameSize: 10});
  assert.equal(JSON.stringify(n.document), before);
});

test('main.mjs registers pinNameSize as a world Number; GM Setup saves it', () => {
  const main = fs.readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  assert.match(main, /register\(MODULE_ID, 'pinNameSize',[^]*?scope: 'world'[^]*?type: Number, default: NAME_SIZE.default, restricted: true/);
  const app = fs.readFileSync(new URL('../scripts/app.mjs', import.meta.url), 'utf8');
  assert.match(app, /id="agl-set-pinsize" type="number"/); assert.match(app, /set\(MODULE_ID, 'pinNameSize'/);
});

import {wrapLabel, wrapOf, WRAP} from '../scripts/pin-look.mjs';
test('wrapLabel breaks at word boundaries for several limits', () => {
  assert.equal(wrapLabel('The Ashen Gate Watchtower', 10), 'The Ashen\nGate\nWatchtower');
  assert.equal(wrapLabel('The Ashen Gate Watchtower', 20), 'The Ashen Gate\nWatchtower');
  assert.equal(wrapLabel('The Ashen Gate Watchtower', 60), 'The Ashen Gate Watchtower');
  for (const n of [6, 8, 12, 25]) for (const l of wrapLabel('Old Mill of the Seven Weeping Willows', n).split('\n')) assert.ok(Array.from(l).length <= n, `${n}: ${l}`);
});
test('wrapLabel cuts a word longer than the limit, keeps line breaks, trims spaces', () => {
  assert.equal(wrapLabel('Supercalifragilistic', 8), 'Supercal\nifragili\nstic');
  assert.equal(wrapLabel('Hi supercalifragilistic', 8), 'Hi\nsupercal\nifragili\nstic');
  assert.equal(wrapLabel('North Gate\nand Keep   ', 30), 'North Gate\nand Keep');
});
test('wrapLabel counts code points, not UTF-16 units', () => {
  assert.equal(wrapLabel('😀😀😀😀😀😀😀😀', 6), '😀😀😀😀😀😀\n😀😀');
  assert.equal(wrapLabel('Château Ünïcode', 8), 'Château\nÜnïcode');
});
test('wrap 0 is off and the clamp is 0 or 6..60', () => {
  assert.equal(wrapLabel('A fairly long location name', 0), 'A fairly long location name');
  assert.equal(wrapOf(0), 0); assert.equal(wrapOf(-3), 0); assert.equal(wrapOf('x'), 0);
  assert.equal(wrapOf(2), 6); assert.equal(wrapOf(999), 60); assert.equal(wrapOf('18.4'), 18);
  assert.deepEqual({...WRAP}, {off: 0, min: 6, max: 60});
  assert.deepEqual(readPinLook(k => ({pinNameWrap: 12})[k]).wrap, 12);
  assert.equal(readPinLook(() => undefined).wrap, 0);
});
test('the hook wraps only the displayed tooltip text, never the document, and restores with wrap 0', () => {
  const n = note({text: 'The Ashen Gate Watchtower'}); n.tooltip.text = n.document.label; const before = JSON.stringify(n.document);
  applyPinLook(n, {showName: true, wrap: 10});
  assert.equal(n.tooltip.text, 'The Ashen\nGate\nWatchtower'); assert.equal(n.tooltip.style.align, 'center');
  assert.equal(JSON.stringify(n.document), before); assert.equal(n.document.label, 'The Ashen Gate Watchtower');
  const off = note({text: 'The Ashen Gate Watchtower'}); off.tooltip.text = off.document.label;
  applyPinLook(off, {showName: true, wrap: 0, nameOffset: 0}); assert.equal(off.tooltip.text, 'The Ashen Gate Watchtower');
  const nameOff = note({text: 'The Ashen Gate Watchtower'}); nameOff.tooltip.text = nameOff.document.label;
  applyPinLook(nameOff, {nameMode: 'hover', wrap: 0, nameOffset: 0}); assert.equal(nameOff.tooltip.text, 'The Ashen Gate Watchtower');
});
test('unidentified labels wrap the same way; hidden and unbound pins are never wrapped or revealed', () => {
  const u = note({text: 'Unknown settlement nearby'}); u.tooltip.text = u.document.label;
  applyPinLook(u, {showName: true, wrap: 12}); assert.equal(u.tooltip.text, 'Unknown\nsettlement\nnearby');
  const hidden = note({text: '', hasPage: true, pageView: ''}); hidden.tooltip.text = 'x';
  applyPinLook(hidden, {showName: true, wrap: 6}); assert.equal(hidden.tooltip.text, 'x'); assert.equal(hidden.tooltip.visible, false);
  const other = note({bound: false, text: 'The Ashen Gate Watchtower'}); other.tooltip.text = other.document.label;
  applyPinLook(other, {showName: true, wrap: 6}); assert.equal(other.tooltip.text, 'The Ashen Gate Watchtower');
});
test('main.mjs registers pinNameWrap (world Number, default 0); GM Setup saves it', () => {
  const main = fs.readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  assert.match(main, /register\(MODULE_ID, 'pinNameWrap',[^]*?scope: 'world'[^]*?type: Number, default: 0, restricted: true/);
  const app = fs.readFileSync(new URL('../scripts/app.mjs', import.meta.url), 'utf8');
  assert.match(app, /id="agl-set-pinwrap" type="number"/); assert.match(app, /set\(MODULE_ID, 'pinNameWrap'/);
});

import {legacyNameMode, nameModeOf, NAME_MODES, DEFAULT_NAME_MODE} from '../scripts/pin-look.mjs';
test('name mode: fresh world is hover; the old boolean migrates by reading, never by rewriting', () => {
  assert.equal(DEFAULT_NAME_MODE, 'hover'); assert.deepEqual(Object.keys(NAME_MODES), ['hover', 'always']);
  const get = store => k => store[k];
  assert.equal(legacyNameMode(get({})), 'hover');
  assert.equal(legacyNameMode(get({pinNameMode: '', pinShowName: true})), 'always');
  assert.equal(legacyNameMode(get({pinNameMode: '', pinShowName: false})), 'hover');
  assert.equal(legacyNameMode(get({pinNameMode: 'hover', pinShowName: true})), 'hover', 'a chosen mode wins over the old value');
  assert.equal(legacyNameMode(get({pinNameMode: 'always', pinShowName: false})), 'always');
  assert.equal(nameModeOf('junk'), 'hover');
  const legacy = {pinNameMode: '', pinShowName: true}; const copy = {...legacy};
  readPinLook(get(legacy)); assert.deepEqual(legacy, copy);
  assert.equal(readPinLook(get(legacy)).nameMode, 'always'); assert.equal(readPinLook(get(legacy)).showName, true);
});
test('mode switch both ways: always forces the label on, hover hands visibility back to core', () => {
  const n = note({text: 'The Ashen Gate Watchtower'});
  applyPinLook(n, {nameMode: 'always'}); assert.equal(n.tooltip.visible, true);
  n.tooltip.visible = false; // what core's _refreshState sets again after the redraw (not hovered)
  applyPinLook(n, {nameMode: 'hover'}); assert.equal(n.tooltip.visible, false, 'not forced in hover mode');
  n.tooltip.visible = true; // core shows it on hover
  applyPinLook(n, {nameMode: 'hover'}); assert.equal(n.tooltip.visible, true);
});
test('label style (size, outline, wrap) applies in hover mode too, to our labels only', () => {
  const n = note({text: 'The Ashen Gate Watchtower'}); n.tooltip.text = n.document.label;
  applyPinLook(n, {nameMode: 'hover', nameSize: 12, wrap: 10});
  assert.equal(n.tooltip.style.fontSize, 12); assert.equal(n.tooltip.style.strokeThickness, 2); assert.equal(n.tooltip.text, 'The Ashen\nGate\nWatchtower');
  const hidden = note({text: '', hasPage: true, pageView: ''}); hidden.tooltip.text = 'x';
  applyPinLook(hidden, {nameMode: 'hover', nameSize: 12, wrap: 6}); assert.equal(hidden.tooltip.style.fontSize, 32); assert.equal(hidden.tooltip.text, 'x');
});
test('GM Setup offers a Name under the pin choice and saves pinNameMode', () => {
  const app = fs.readFileSync(new URL('../scripts/app.mjs', import.meta.url), 'utf8');
  assert.match(app, /<select id="agl-set-pinname">/); assert.match(app, /set\(MODULE_ID, 'pinNameMode'/);
});

import {OFFSET, offsetOf} from '../scripts/pin-look.mjs';
function pnote(o = {}) {
  const n = note(o); n.tooltip.position = {x: 0, y: 0, set(x, y) { this.x = x; this.y = y; }};
  n.document.iconSize = o.iconSize ?? 48; return n;
}
globalThis.CONST = {...(globalThis.CONST ?? {}), TEXT_ANCHOR_POINTS: {CENTER: 0, BOTTOM: 1, TOP: 2, LEFT: 3, RIGHT: 4}};
test('Name distance: 0 leaves core\'s position alone; clamp is -40..40', () => {
  const n = pnote({anchor: 1}); n.tooltip.position.set(0, 36); applyPinLook(n, {nameMode: 'always', nameOffset: 0});
  assert.deepEqual([n.tooltip.position.x, n.tooltip.position.y], [0, 36]);
  assert.deepEqual({...OFFSET}, {min: -40, max: 40, default: 0});
  assert.equal(offsetOf(-999), -40); assert.equal(offsetOf(999), 40); assert.equal(offsetOf('x'), 0); assert.equal(offsetOf('-7.6'), -8);
  assert.equal(readPinLook(k => ({pinNameOffset: -8})[k]).nameOffset, -8); assert.equal(readPinLook(() => undefined).nameOffset, 0);
});
test('Name distance is computed from core\'s rule, once, and does not accumulate over refreshes', () => {
  const n = pnote({anchor: 1, iconSize: 48}); // core: halfPad = 24 + 12 = 36
  for (let i = 0; i < 5; i++) applyPinLook(n, {nameMode: 'always', nameOffset: -8});
  assert.equal(n.tooltip.position.y, 28); assert.equal(n.tooltip.position.x, 0);
  n.tooltip.position.set(0, 36); applyPinLook(n, {nameMode: 'always', nameOffset: -8}); assert.equal(n.tooltip.position.y, 28, 'core re-positioned it; same answer');
  const big = pnote({anchor: 1, iconSize: 100}); applyPinLook(big, {nameMode: 'hover', nameOffset: -8}); assert.equal(big.tooltip.position.y, 54);
  const far = pnote({anchor: 1}); applyPinLook(far, {nameMode: 'always', nameOffset: 10}); assert.equal(far.tooltip.position.y, 46);
});
test('Name distance never goes past the pin edge, and works for each anchor and with Image only', () => {
  const n = pnote({anchor: 1, iconSize: 32}); applyPinLook(n, {look: 'image', nameMode: 'always', nameOffset: -40}); assert.equal(n.tooltip.position.y, 16);
  for (const [anchor, x, y] of [[2, 0, -28], [3, -28, 0], [4, 28, 0]]) { const m = pnote({anchor}); applyPinLook(m, {nameMode: 'always', nameOffset: -8}); assert.deepEqual([m.tooltip.position.x, m.tooltip.position.y], [x, y]); }
  const c = pnote({anchor: 0}); c.tooltip.position.set(0, 0); applyPinLook(c, {nameMode: 'always', nameOffset: -8}); assert.deepEqual([c.tooltip.position.x, c.tooltip.position.y], [0, 0]);
});
test('Name distance touches only our bound Notes\' tooltip, and writes nothing', () => {
  const other = pnote({bound: false, anchor: 1}); other.tooltip.position.set(0, 36); applyPinLook(other, {nameMode: 'always', nameOffset: -8}); assert.equal(other.tooltip.position.y, 36);
  const hidden = pnote({anchor: 1, text: '', hasPage: true, pageView: ''}); hidden.tooltip.position.set(0, 36); applyPinLook(hidden, {nameMode: 'always', nameOffset: -8}); assert.equal(hidden.tooltip.position.y, 36);
  const n = pnote({anchor: 1}); const before = JSON.stringify(n.document); applyPinLook(n, {nameMode: 'always', nameOffset: -8});
  assert.equal(JSON.stringify(n.document), before); assert.equal(n.document.textAnchor, 1);
  assert.doesNotThrow(() => applyPinLook({document: {getFlag: () => 'k', text: 'x', label: 'x', iconSize: 48}, tooltip: {}}, {nameMode: 'always', nameOffset: -8}));
});
test('main.mjs registers pinNameOffset (world Number, default 0); GM Setup saves it', () => {
  const main = fs.readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  assert.match(main, /register\(MODULE_ID, 'pinNameOffset',[^]*?scope: 'world'[^]*?type: Number, default: 0, restricted: true/);
  const app = fs.readFileSync(new URL('../scripts/app.mjs', import.meta.url), 'utf8');
  assert.match(app, /id="agl-set-pinoffset" type="number"/); assert.match(app, /set\(MODULE_ID, 'pinNameOffset'/); assert.match(app, /Negative numbers move the name closer to the pin|negative numbers move the name closer to the pin/i);
});
