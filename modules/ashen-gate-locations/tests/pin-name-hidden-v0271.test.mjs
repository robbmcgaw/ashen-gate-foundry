/** 0.27.1: with Keep pin art proportions on, the drawn name under the pin is hidden unless the location says otherwise. Mocked Foundry; logic only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeLocation, pinPresentation, notePatch, publishable, hasUnpublishedChanges, exportPackage, parseImport, importRecords, MODULE_ID} from '../scripts/model.mjs';
import {applyPinLook, hidesName, refreshPins, registerPinLook} from '../scripts/pin-look.mjs';

function note({keep = false, showName = false, text = 'The Muster', label = text, hover = false} = {}) {
  const flags = {[MODULE_ID]: {pinKey: 'PIN-abc', pin: {src: 'x.webp', size: 48, ...(keep ? {keep: true} : {}), ...(showName ? {showName: true} : {})}}};
  const doc = {text, iconSize: 48, fontSize: 32, textAnchor: 1, label, getFlag: (s, k) => flags[s]?.[k], flags};
  return {hover, controlled: false, isPreview: false, layer: {highlightObjects: false}, renderFlags: {set() {}}, controlIcon: null,
    tooltip: {visible: false, text: label, position: {x: 0, y: 0, set() {}}, style: {}}, document: doc};
}
const base = {id: 'LOC-A', name: 'The Muster'};

test('model: defaults off, normalises to a boolean, survives re-normalising', () => {
  assert.equal(normalizeLocation(base).pinShowNameWithProportions, false);
  assert.equal(normalizeLocation({...base, pinShowNameWithProportions: true}).pinShowNameWithProportions, true);
  for (const bad of ['true', 1, null, {}]) assert.equal(normalizeLocation({...base, pinShowNameWithProportions: bad}).pinShowNameWithProportions, false);
  const once = normalizeLocation({...base, pinKeepProportions: true, pinShowNameWithProportions: true});
  assert.deepEqual(normalizeLocation(once), once);
});

test('model: not published, no unpublished changes, export / import / additive import round trip', () => {
  const off = normalizeLocation(base), on = normalizeLocation({...base, pinKeepProportions: true, pinShowNameWithProportions: true});
  assert.equal('pinShowNameWithProportions' in publishable(on), false);
  assert.equal(hasUnpublishedChanges({...off, pinShowNameWithProportions: true}), false);
  const pkg = exportPackage([on]);
  assert.equal(pkg.records[0].location.pinShowNameWithProportions, true);
  assert.equal(parseImport(pkg, []).created[0].pinShowNameWithProportions, true);
  const bare = {manifest: pkg.manifest, records: [{...pkg.records[0], location: (({pinShowNameWithProportions, ...r}) => r)(pkg.records[0].location)}]};
  assert.equal(parseImport(bare, []).created[0].pinShowNameWithProportions, false);
  assert.equal(importRecords(bare.records, [on], {mode: 'update'}).updated[0].pinShowNameWithProportions, true, 'additive: the world value stays');
});

test('pinPresentation carries showName only with keep on; text is untouched', () => {
  for (const state of ['hidden', 'unidentified', 'revealed']) {
    const loc = {...base, state, pinKeepProportions: true, pinShowNameWithProportions: true};
    assert.equal(pinPresentation(loc).showName, true, state);
    assert.equal(pinPresentation({...loc, pinShowNameWithProportions: false}).showName, undefined, state);
    assert.equal(pinPresentation({...loc, pinKeepProportions: false}).showName, undefined, 'override alone does nothing');
  }
  assert.equal(pinPresentation({...base, state: 'revealed', pinKeepProportions: true}).text, 'The Muster', 'label data is never blanked');
});

test('notePatch writes showName, an explicit false when removed, and leaves settled notes alone', () => {
  const key = 'k'.repeat(16), pres = {text: 'A', src: 'a.webp', size: 60, keep: true};
  const settled = {text: 'A', iconSize: 60, texture: {src: 'a.webp'}, flags: {[MODULE_ID]: {pinKey: key, pin: {src: 'a.webp', size: 60, keep: true}}}};
  assert.equal(notePatch(settled, key, pres), null);
  assert.equal(notePatch(settled, key, {...pres, showName: true}).flags[MODULE_ID].pin.showName, true);
  const shown = {...settled, flags: {[MODULE_ID]: {pinKey: key, pin: {src: 'a.webp', size: 60, keep: true, showName: true}}}};
  assert.equal(notePatch(shown, key, {...pres, showName: true}), null);
  assert.equal(notePatch(shown, key, pres).flags[MODULE_ID].pin.showName, false);
  assert.equal(notePatch(shown, key, {...pres, keep: undefined, showName: true}).flags[MODULE_ID].pin.showName, false, 'keep off drops it too');
});

test('label hidden with keep on in hover and always modes, on hover, and text is unchanged', () => {
  for (const nameMode of ['hover', 'always']) for (const hover of [false, true]) {
    const n = note({keep: true, hover}); n.tooltip.visible = hover; // core would show it on hover
    assert.equal(hidesName(n), true);
    applyPinLook(n, {nameMode, look: 'framed'});
    assert.equal(n.tooltip.visible, false, `${nameMode} hover=${hover}`);
    assert.equal(n.document.text, 'The Muster'); assert.equal(n.document.label, 'The Muster');
  }
  const hl = note({keep: true}); hl.layer.highlightObjects = true; hl.tooltip.visible = true;
  applyPinLook(hl, {nameMode: 'hover'}); assert.equal(hl.tooltip.visible, false, 'layer highlight does not bring it back');
});

test('hidden even when the label is not ours (empty text)', () => {
  const n = note({keep: true, text: ''}); n.tooltip.visible = true; applyPinLook(n, {nameMode: 'always'});
  assert.equal(n.tooltip.visible, false);
});

test('override on: the label behaves normally (always forces it on; hover leaves core)', () => {
  const a = note({keep: true, showName: true}); assert.equal(hidesName(a), false);
  applyPinLook(a, {nameMode: 'always'}); assert.equal(a.tooltip.visible, true);
  const h = note({keep: true, showName: true}); h.tooltip.visible = false; applyPinLook(h, {nameMode: 'hover'}); assert.equal(h.tooltip.visible, false, 'hover mode: core decides');
  h.tooltip.visible = true; applyPinLook(h, {nameMode: 'hover'}); assert.equal(h.tooltip.visible, true);
});

test('keep off: unchanged; override flag alone does nothing', () => {
  const a = note({keep: false}); applyPinLook(a, {nameMode: 'always'}); assert.equal(a.tooltip.visible, true);
  const b = note({keep: false, showName: true}); assert.equal(hidesName(b), false); applyPinLook(b, {nameMode: 'always'}); assert.equal(b.tooltip.visible, true);
  const c = note({keep: false}); c.tooltip.visible = true; applyPinLook(c, {nameMode: 'hover'}); assert.equal(c.tooltip.visible, true);
});

test('re-applied on every refreshNote and on updateNote flag changes (core re-shows it on each refreshState)', () => {
  const hooks = {calls: {}, on(n, fn) { this.calls[n] = fn; }};
  registerPinLook(hooks, () => ({nameMode: 'hover'}));
  const n = note({keep: true});
  n.tooltip.visible = true; hooks.calls.refreshNote(n, {}); assert.equal(n.tooltip.visible, false);
  n.tooltip.visible = true; hooks.calls.refreshNote(n, {}); assert.equal(n.tooltip.visible, false);
  const sets = []; n.renderFlags.set = f => sets.push(f);
  hooks.calls.updateNote({object: n}, {flags: {[MODULE_ID]: {pin: {showName: true}}}});
  assert.equal(sets.length, 1);
  n.document.flags[MODULE_ID].pin.showName = true; n.tooltip.visible = true; hooks.calls.refreshNote(n, {});
  assert.equal(n.tooltip.visible, true, 'turning the override on lets core show it again');
  assert.doesNotThrow(() => refreshPins([n]));
});

test('editor: second checkbox only with keep on, default off, with the hint; help and README mention it', () => {
  const app = fs.readFileSync(new URL('../scripts/app.mjs', import.meta.url), 'utf8');
  assert.match(app, /d\.pinKeepProportions \? `[^`]*data-toggle="pinShowNameWithProportions"[^>]*>\s*Show the name under the pin/);
  assert.match(app, /The wide art usually carries the name, so it is hidden by default\./);
  assert.ok(app.indexOf('data-toggle="pinKeepProportions"') < app.indexOf('data-toggle="pinShowNameWithProportions"'));
  assert.match(fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8'), /Show the name under the pin/);
});

// ---- Banner width ----
import {BANNER_WIDTH, bannerWidthOf} from '../scripts/model.mjs';
import {proportionalLayout, drawnSize, setKeepProportions, layoutOf} from '../scripts/pin-proportions.mjs';
import {noteBannerWidth} from '../scripts/pin-look.mjs';

test('banner width: clamps to 0 or 48..1024, normalises, round trips, never published', () => {
  assert.deepEqual([BANNER_WIDTH.min, BANNER_WIDTH.max, BANNER_WIDTH.step], [48, 1024, 8]);
  for (const [v, want] of [[undefined, 0], ['', 0], [0, 0], [-5, 0], ['abc', 0], [null, 0], [10, 48], [47, 48], [48, 48], [320, 320], ['320', 320], [320.4, 320], [5000, 1024]]) assert.equal(bannerWidthOf(v), want, String(v));
  assert.equal(normalizeLocation(base).pinBannerWidth, 0);
  const on = normalizeLocation({...base, pinKeepProportions: true, pinBannerWidth: '320'});
  assert.equal(on.pinBannerWidth, 320); assert.deepEqual(normalizeLocation(on), on);
  assert.equal('pinBannerWidth' in publishable(on), false);
  assert.equal(hasUnpublishedChanges({...normalizeLocation(base), pinBannerWidth: 320}), false);
  const pkg = exportPackage([on]);
  assert.equal(pkg.records[0].location.pinBannerWidth, 320);
  assert.equal(parseImport(pkg, []).created[0].pinBannerWidth, 320);
  const bare = {manifest: pkg.manifest, records: [{...pkg.records[0], location: (({pinBannerWidth, ...r}) => r)(pkg.records[0].location)}]};
  assert.equal(parseImport(bare, []).created[0].pinBannerWidth, 0);
  assert.equal(importRecords(bare.records, [on], {mode: 'update'}).updated[0].pinBannerWidth, 320, 'additive');
});

test('banner width: presentation and notePatch carry it (only with keep), clearing writes 0', () => {
  const loc = {...base, state: 'revealed', pinKeepProportions: true, pinBannerWidth: 320};
  assert.equal(pinPresentation(loc).width, 320);
  assert.equal(pinPresentation({...loc, pinKeepProportions: false}).width, undefined);
  assert.equal(pinPresentation({...loc, pinBannerWidth: 0}).width, undefined);
  const key = 'k'.repeat(16), pres = {text: 'A', src: 'a.webp', size: 60, keep: true};
  const settled = {text: 'A', iconSize: 60, texture: {src: 'a.webp'}, flags: {[MODULE_ID]: {pinKey: key, pin: {src: 'a.webp', size: 60, keep: true}}}};
  assert.equal(notePatch(settled, key, pres), null, 'width 0: unchanged');
  assert.equal(notePatch(settled, key, {...pres, width: 320}).flags[MODULE_ID].pin.width, 320);
  const w = {...settled, flags: {[MODULE_ID]: {pinKey: key, pin: {src: 'a.webp', size: 60, keep: true, width: 320}}}};
  assert.equal(notePatch(w, key, {...pres, width: 320}), null);
  assert.equal(notePatch(w, key, {...pres, width: 400}).flags[MODULE_ID].pin.width, 400);
  assert.equal(notePatch(w, key, pres).flags[MODULE_ID].pin.width, 0);
});

test('layout maths: width mode sets the frame width, height follows the aspect; size mode unchanged at width 0', () => {
  const l = proportionalLayout({size: 48, width: 320, texW: 400, texH: 100});
  assert.deepEqual(l.frame, {w: 320, h: 80}); assert.deepEqual(l.pivot, {x: 160, y: 40}); assert.deepEqual(l.hit, {x: 0, y: 0, w: 320, h: 80});
  assert.equal(l.halfW, 160); assert.equal(l.halfH, 40);
  const sq = proportionalLayout({size: 48, width: 96, texW: 100, texH: 100}); assert.deepEqual(sq.frame, {w: 96, h: 96});
  const capped = proportionalLayout({size: 48, width: 400, texW: 1000, texH: 100});
  assert.deepEqual(capped.frame, {w: 400, h: 100}, 'frame width is the width; 4:1 cap sets the height'); assert.equal(capped.capped, true);
  assert.equal(capped.sprite.w, 400); assert.equal(capped.sprite.h, 40);
  const tall = proportionalLayout({size: 48, width: 100, texW: 100, texH: 1000}); assert.deepEqual(tall.frame, {w: 100, h: 400});
  assert.deepEqual(proportionalLayout({size: 48, width: 0, texW: 400, texH: 100}).frame, {w: 192, h: 48});
  assert.deepEqual(proportionalLayout({size: 48, texW: 400, texH: 100}).frame, {w: 192, h: 48});
  assert.deepEqual(drawnSize({size: 48, width: 320, texW: 400, texH: 100}), {w: 320, h: 80});
  assert.deepEqual(drawnSize({size: 48, texW: 400, texH: 100}), {w: 192, h: 48});
  assert.equal(drawnSize({size: 48, width: 320}), null);
});

test('banner width: hand-edited icon size wins; width reaches the drawn icon and the label offset', () => {
  const mk = (iconSize, width) => { const n = note({keep: true, showName: true}); n.document.getFlag = (s, k) => (k === 'pin' ? {src: 'x.webp', size: 48, keep: true, showName: true, width} : undefined); n.document.iconSize = iconSize; return n; };
  assert.equal(noteBannerWidth(mk(48, 320)), 320);
  assert.equal(noteBannerWidth(mk(90, 320)), 0, 'hand-edited size: width ignored, size is the height');
  assert.equal(noteBannerWidth(mk(48, 0)), 0);
  assert.equal(noteBannerWidth(note({keep: false})), 0);
  // icon level
  const PX = globalThis.PIXI;
  globalThis.PIXI = {Rectangle: class { constructor(x, y, w, h) { Object.assign(this, {x, y, width: w, height: h}); } }, RoundedRectangle: class { constructor(x, y, w, h) { Object.assign(this, {x, y, width: w, height: h}); } }, Texture: {EMPTY: {}}};
  try {
    const g = () => ({visible: true, clear() {}, beginFill() {}, endFill() {}, lineStyle() {}, drawShape() {}});
    const p = () => ({x: 0, y: 0, set(x, y) { this.x = x; this.y = y; }});
    const ci = {size: 48, pivot: p(), bg: g(), border: g(), icon: {texture: {baseTexture: {valid: true, once() {}}, orig: {width: 400, height: 100}}, width: 0, height: 0, position: p()}, tooltip: {position: p()}, hitArea: {x: 0, y: 0, width: 48, height: 48}, _refresh() {}};
    assert.equal(setKeepProportions(ci, true, null, 0), true);
    assert.deepEqual([ci.hitArea.width, ci.hitArea.height], [192, 48]);
    assert.equal(setKeepProportions(ci, true, null, 320), true, 'width change alone redraws');
    assert.deepEqual([ci.hitArea.width, ci.hitArea.height, ci.pivot.x, ci.pivot.y], [320, 80, 160, 40]);
    assert.equal(layoutOf(ci).halfW, 160);
    assert.equal(setKeepProportions(ci, true, null, 320), false);
    setKeepProportions(ci, true, null, 0); assert.deepEqual([ci.hitArea.width, ci.hitArea.height], [192, 48], 'cleared: Pin size is the height again');
  } finally { globalThis.PIXI = PX; }
});

test('editor: Banner width number + slider (48..1024 step 8) only with keep on, Pin size disabled with the hint while set', () => {
  const app = fs.readFileSync(new URL('../scripts/app.mjs', import.meta.url), 'utf8');
  assert.match(app, /d\.pinKeepProportions \? `<div[^`]*Banner width \(px\)/);
  assert.equal((app.match(/data-bind="pinBannerWidth"/g) || []).length, 2, 'number and range share one binding');
  assert.match(app, /type="range"[^>]*data-bind="pinBannerWidth"/);
  assert.match(app, /id="agl-pin-size"[^>]*\$\{d\.pinKeepProportions && d\.pinBannerWidth \? 'disabled' : ''\}/);
  assert.match(app, /Using Banner width/);
  assert.match(app, /Draws about/);
  assert.match(app, /syncBanner\(root, el\)/);
  assert.match(fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8'), /Banner width/);
});
