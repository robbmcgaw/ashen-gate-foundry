/** 0.27.0 Keep pin art proportions: mocked PIXI/Foundry objects, logic only. Nothing here draws on a real V14 canvas. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeLocation, pinPresentation, notePatch, publishable, hasUnpublishedChanges, playerView, exportPackage, parseImport, importRecords, MODULE_ID, PIN_DEFAULTS} from '../scripts/model.mjs';
import {proportionalLayout, textureSize, ASPECT_CAP, setKeepProportions, relayoutControlIcon, layoutOf} from '../scripts/pin-proportions.mjs';
import {applyPinLook, keepsProportions, refreshPins, registerPinLook} from '../scripts/pin-look.mjs';

// ---- mocked PIXI and a ControlIcon that behaves like core's (square in _refresh, own pivot / hitArea) ----
class Rect { constructor(x = 0, y = 0, width = 0, height = 0) { Object.assign(this, {x, y, width, height}); } }
class RRect extends Rect { constructor(x, y, w, h, radius) { super(x, y, w, h); this.radius = radius; } }
const EMPTY = {baseTexture: {valid: false, once() {}}, orig: {width: 1, height: 1}};
globalThis.PIXI = {Rectangle: Rect, RoundedRectangle: RRect, Texture: {EMPTY}};
globalThis.canvas = {dimensions: {uiScale: 1}};
const gfx = () => { const g = {visible: true, shapes: [], clear() { this.shapes = []; }, beginFill() {}, endFill() {}, lineStyle() {}, drawShape(r) { this.shapes.push(r); }}; return g; };
const pos = () => { const p = {x: 0, y: 0, set(x, y) { p.x = x; p.y = y; }}; return p; };
function tex(w, h, valid = true) {
  const handlers = {};
  const base = {valid, once(ev, fn) { (handlers[ev] ??= []).push(fn); }, fire(ev) { for (const fn of handlers[ev] ?? []) fn(); handlers[ev] = []; }};
  return {baseTexture: base, orig: {width: w, height: h}};
}
function controlIcon({size = 48, texture = tex(100, 100)} = {}) {
  const ci = {
    size, pivot: pos(), bg: gfx(), border: gfx(), icon: {texture, width: 0, height: 0, position: pos()},
    tooltip: {position: pos()}, hitArea: new Rect(), refreshes: 0,
    refresh() { ci.refreshes++; ci._refresh(); },            // core defers this a tick; the test runs it at once
    _refresh() {                                              // core: everything a square of `size`
      ci.pivot.set(ci.size / 2, ci.size / 2);
      ci.bg.clear(); ci.bg.drawShape(new RRect(0, 0, ci.size, ci.size, 5));
      ci.icon.width = ci.icon.height = ci.size;
      ci.border.clear(); ci.border.drawShape(new RRect(0, 0, ci.size, ci.size, 5));
      ci.tooltip.position.set(ci.size / 2, -12);
      ci.hitArea.width = ci.hitArea.height = ci.size;
    }
  };
  ci._refresh();
  return ci;
}
function note({keep = false, bound = true, anchor = 1, iconSize = 48, texture, label = 'District'} = {}) {
  const flags = bound ? {[MODULE_ID]: {pinKey: 'PIN-abc', pin: {src: 'x.webp', size: iconSize, ...(keep ? {keep: true} : {})}}} : {};
  const sets = [];
  return {
    hover: false, controlled: false, isPreview: false, layer: {highlightObjects: false}, sets,
    renderFlags: {set: f => sets.push(f)},
    controlIcon: controlIcon({size: iconSize, texture}),
    tooltip: {visible: false, position: pos(), style: {}},
    document: {text: label, iconSize, fontSize: 32, textAnchor: anchor, get label() { return this.text; }, getFlag: (s, k) => flags[s]?.[k], flags}
  };
}
const square = ci => ci.hitArea.width === ci.size && ci.hitArea.height === ci.size && ci.pivot.x === ci.size / 2 && ci.icon.position.x === 0;

// ---- model ----
test('the field defaults to off, normalises to a boolean and old records need no migration', () => {
  assert.equal(normalizeLocation({id: 'LOC-A', name: 'A'}).pinKeepProportions, false);
  assert.equal(normalizeLocation({id: 'LOC-A', name: 'A', pinKeepProportions: true}).pinKeepProportions, true);
  for (const bad of ['true', 1, null, {}, 'yes']) assert.equal(normalizeLocation({id: 'LOC-A', name: 'A', pinKeepProportions: bad}).pinKeepProportions, false);
  const once = normalizeLocation({id: 'LOC-A', name: 'A', pinKeepProportions: true});
  assert.deepEqual(normalizeLocation(once), once, 'normalising again changes nothing (re-runnable)');
});

test('it is GM-side: not in the published body, no "unpublished changes", the player view is identical', () => {
  const base = {id: 'LOC-A', pinKey: 'abcdefghijkl1234', name: 'A', state: 'revealed', pin: {size: 60}};
  const off = normalizeLocation(base), on = normalizeLocation({...base, pinKeepProportions: true});
  assert.equal('pinKeepProportions' in publishable(on), false);
  assert.equal(hasUnpublishedChanges({...off, pinKeepProportions: true}), false);
  assert.deepEqual(playerView(on, [on]), playerView(off, [off]));
  assert.equal(JSON.stringify(playerView(on, [on])).includes('roportion'), false);
});

test('export / import round trip; an update import that omits it keeps the world\'s value', () => {
  const on = normalizeLocation({id: 'LOC-A', name: 'A', pinKeepProportions: true});
  const pkg = exportPackage([on]);
  assert.equal(pkg.records[0].location.pinKeepProportions, true);
  assert.equal(parseImport(pkg, []).created[0].pinKeepProportions, true);
  const bare = {manifest: pkg.manifest, records: [{...pkg.records[0], location: (({pinKeepProportions, ...rest}) => rest)(pkg.records[0].location)}]};
  assert.equal(parseImport(bare, []).created[0].pinKeepProportions, false, 'a new location from an old package is off');
  assert.equal(importRecords(bare.records, [on], {mode: 'update'}).updated[0].pinKeepProportions, true, 'additive: the world value stays');
  assert.equal(importRecords(pkg.records, [normalizeLocation({id: 'LOC-A', name: 'A'})], {mode: 'update'}).updated[0].pinKeepProportions, true, 'a package that sets it wins');
});

test('pinPresentation carries keep for every state, and is unchanged when off', () => {
  for (const state of ['hidden', 'unidentified', 'revealed']) for (const extra of [{}, {audience: {mode: 'selected', userIds: ['p1']}}, {archived: true}]) {
    const loc = {id: 'LOC-A', name: 'A', state, ...extra};
    const off = pinPresentation(loc), on = pinPresentation({...loc, pinKeepProportions: true});
    assert.equal('keep' in off, false, `${state} off has no key`);
    assert.deepEqual({...on, keep: undefined}, {...off, keep: undefined});
    assert.equal(on.keep, true, `${state} ${JSON.stringify(extra)}`);
  }
  assert.deepEqual(pinPresentation({id: 'LOC-A', name: 'A', state: 'hidden', pin: {img: 'secret.webp'}}), {text: '', src: PIN_DEFAULTS.unidentifiedImg, size: 48});
});

test('a region\'s default pin (childPin) does not carry the toggle', () => {
  const region = {id: 'LOC-R', name: 'R', isRegion: true, pinKeepProportions: true, childPin: {size: 80}};
  const child = {id: 'LOC-C', name: 'C', parentLocationId: 'LOC-R', state: 'revealed'};
  assert.equal(pinPresentation(child, {all: [region, child]}).keep, undefined);
});

test('notePatch writes keep when turned on, an explicit false when turned off, and leaves untouched notes alone', () => {
  const key = 'k'.repeat(16);
  const pres = {text: 'A', src: 'a.webp', size: 60};
  const settled = {text: 'A', iconSize: 60, texture: {src: 'a.webp'}, flags: {[MODULE_ID]: {pinKey: key, pin: {src: 'a.webp', size: 60}}}};
  assert.equal(notePatch(settled, key, pres), null, 'off and never on: not rewritten');
  const on = notePatch(settled, key, {...pres, keep: true});
  assert.deepEqual(on, {flags: {[MODULE_ID]: {pinKey: key, pin: {src: 'a.webp', size: 60, keep: true}}}});
  const wasOn = {...settled, flags: {[MODULE_ID]: {pinKey: key, pin: {src: 'a.webp', size: 60, keep: true}}}};
  assert.equal(notePatch(wasOn, key, {...pres, keep: true}), null, 'on and settled');
  assert.equal(notePatch(wasOn, key, pres).flags[MODULE_ID].pin.keep, false, 'off again writes false (flag updates merge)');
  const overridden = {...wasOn, texture: {src: 'hand.webp'}, iconSize: 90};
  assert.equal(notePatch(overridden, key, {...pres, keep: true}), null, 'a hand-set image/size stays and the toggle is already on');
  assert.equal(notePatch({...overridden, flags: settled.flags}, key, {...pres, keep: true}).flags[MODULE_ID].pin.keep, true, 'the toggle follows the location even on an overridden pin');
});

// ---- pure maths ----
test('layout: height is the pin size, width follows the aspect, centred on the note', () => {
  const l = proportionalLayout({size: 48, texW: 400, texH: 100});
  assert.deepEqual(l.frame, {w: 192, h: 48});
  assert.deepEqual(l.sprite, {x: 0, y: 0, w: 192, h: 48});
  assert.deepEqual(l.pivot, {x: 96, y: 24}, 'pivot at the centre, as core pivots the square at size/2');
  assert.deepEqual(l.hit, {x: 0, y: 0, w: 192, h: 48});
  const w = proportionalLayout({size: 50, texW: 300, texH: 200});
  assert.deepEqual(w.frame, {w: 75, h: 50});
  const tall = proportionalLayout({size: 40, texW: 100, texH: 200});
  assert.deepEqual(tall.frame, {w: 20, h: 40});
  assert.equal(proportionalLayout({size: 48, texW: 80, texH: 80}).frame.w, 48, 'a square image is the square');
});

test('layout: aspect is capped at 4:1 and 1:4, and a capped image is fitted whole, not stretched', () => {
  assert.equal(ASPECT_CAP, 4);
  const wide = proportionalLayout({size: 48, texW: 1000, texH: 100});          // 10:1
  assert.equal(wide.frame.w, 192); assert.equal(wide.capped, true);
  assert.equal(wide.sprite.w, 192); assert.equal(wide.sprite.h, 19.2, 'true 10:1 inside the 4:1 frame');
  assert.equal(wide.sprite.y, (48 - 19.2) / 2);
  const tall = proportionalLayout({size: 48, texW: 100, texH: 1000});
  assert.equal(tall.frame.w, 12); assert.ok(Math.abs(tall.sprite.w / tall.sprite.h - 0.1) < 1e-9);
  assert.equal(proportionalLayout({size: 48, texW: 400, texH: 100}).capped, false, 'exactly 4:1 is allowed');
});

test('layout: unusable input yields null (the square stays)', () => {
  for (const a of [{}, {size: 0, texW: 1, texH: 1}, {size: 48, texW: 0, texH: 5}, {size: 48, texW: NaN, texH: 5}, {size: 48, texW: 5, texH: -1}, {size: 'x', texW: 5, texH: 5}]) assert.equal(proportionalLayout(a), null);
  assert.equal(textureSize(null), null); assert.equal(textureSize(EMPTY), null); assert.equal(textureSize(tex(0, 0)), null); assert.equal(textureSize(tex(50, 20, false)), null);
  assert.deepEqual(textureSize(tex(50, 20)), {w: 50, h: 20});
});

// ---- the ControlIcon wrapper ----
test('toggle on: a core refresh is followed by the rectangle (survives Foundry\'s own refresh)', () => {
  const ci = controlIcon({size: 48, texture: tex(400, 100)});
  assert.equal(setKeepProportions(ci, true), true);
  assert.deepEqual([ci.hitArea.width, ci.hitArea.height], [192, 48]);
  assert.deepEqual([ci.pivot.x, ci.pivot.y], [96, 24]);
  assert.deepEqual([ci.icon.width, ci.icon.height], [192, 48]);
  assert.deepEqual([ci.bg.shapes[0].width, ci.bg.shapes[0].height], [192, 48]);
  assert.deepEqual([ci.border.shapes[0].width, ci.border.shapes[0].height], [192, 48]);
  assert.equal(ci.tooltip.position.x, 96, 'elevation text centred over the wider frame');
  ci.size = 60; ci.refresh();                                      // Foundry resizes the pin: core draws a square, then we redraw
  assert.deepEqual([ci.hitArea.width, ci.hitArea.height, ci.pivot.x, ci.pivot.y], [240, 60, 120, 30]);
  assert.equal(layoutOf(ci).frame.w, 240);
});

test('toggle off restores the square, and a pin that was never on is never touched', () => {
  const ci = controlIcon({size: 48, texture: tex(400, 100)});
  const before = ci._refresh;
  assert.equal(setKeepProportions(ci, false), false);
  assert.equal(ci._refresh, before, 'no wrapper installed for an off pin');
  setKeepProportions(ci, true); assert.equal(square(ci), false);
  setKeepProportions(ci, false);
  assert.ok(square(ci)); assert.equal(layoutOf(ci), null);
  assert.deepEqual([ci.icon.width, ci.icon.height], [48, 48]);
  ci.refresh(); assert.ok(square(ci), 'later core refreshes stay square');
});

test('texture not loaded yet: square first, rectangle when it loads', () => {
  const t = tex(300, 100, false);
  const ci = controlIcon({size: 48, texture: t});
  let changed = 0;
  setKeepProportions(ci, true, () => { changed++; });
  assert.ok(square(ci), 'waiting for the image');
  assert.equal(layoutOf(ci), null);
  setKeepProportions(ci, true, () => { changed++; });              // re-applying while waiting does not pile up listeners
  t.baseTexture.valid = true; t.baseTexture.fire('loaded');
  assert.deepEqual([ci.hitArea.width, ci.hitArea.height], [144, 48]);
  assert.equal(changed, 1);
});

test('texture swapped before the old one loaded: the stale load is ignored', () => {
  const t1 = tex(300, 100, false), ci = controlIcon({texture: t1});
  setKeepProportions(ci, true);
  const t2 = tex(100, 100); ci.icon.texture = t2; ci.refresh();
  assert.equal(layoutOf(ci).frame.w, 48);
  t1.baseTexture.valid = true; t1.baseTexture.fire('loaded');
  assert.equal(layoutOf(ci).frame.w, 48, 'still the current texture\'s shape');
});

test('load failure (the texture never becomes valid) leaves the square and does not throw', () => {
  const t = tex(300, 100, false), ci = controlIcon({texture: t});
  assert.doesNotThrow(() => setKeepProportions(ci, true));
  t.baseTexture.fire('error');
  assert.ok(square(ci));
  ci.icon.texture = null; assert.doesNotThrow(() => ci.refresh()); assert.ok(square(ci));
  const broken = controlIcon({texture: tex(300, 100)}); broken.bg = null;
  assert.doesNotThrow(() => setKeepProportions(broken, true));
});

// ---- applyPinLook / hook integration ----
test('applyPinLook reads the flag: on draws the rectangle, off leaves Foundry\'s square', () => {
  const on = note({keep: true, texture: tex(400, 100)}); assert.equal(keepsProportions(on), true);
  assert.equal(applyPinLook(on, {look: 'framed'}), true);
  assert.deepEqual([on.controlIcon.hitArea.width, on.controlIcon.hitArea.height], [192, 48]);
  const off = note({keep: false, texture: tex(400, 100)}); applyPinLook(off, {look: 'framed'});
  assert.ok(square(off.controlIcon));
  const unbound = note({bound: false, keep: true, texture: tex(400, 100)}); assert.equal(applyPinLook(unbound, {}), false);
  assert.ok(square(unbound.controlIcon), 'a Note that is not ours is never touched');
});

test('toggle turned off on a placed pin: the next hook puts the square back', () => {
  const n = note({keep: true, texture: tex(400, 100)}); applyPinLook(n, {});
  assert.equal(square(n.controlIcon), false);
  n.document.flags[MODULE_ID].pin.keep = false;
  applyPinLook(n, {});
  assert.ok(square(n.controlIcon));
});

test('Image only still hides bg and frame on a wide pin; hover brings the frame back', () => {
  const n = note({keep: true, texture: tex(400, 100)});
  applyPinLook(n, {look: 'image'});
  assert.equal(n.controlIcon.bg.visible, false); assert.equal(n.controlIcon.border.visible, false);
  assert.equal(n.controlIcon.icon.width, 192);
  n.hover = true; applyPinLook(n, {look: 'image'});
  assert.equal(n.controlIcon.border.visible, true);
});

test('the label sits below the rectangle (height = pin size); side anchors clear the wider edge; offsets still apply', () => {
  const A = {BOTTOM: 1, TOP: 2, LEFT: 3, RIGHT: 4, CENTER: 0};
  globalThis.CONST = {TEXT_ANCHOR_POINTS: A};
  try {
    const t = tex(400, 100);
    const b = note({keep: true, texture: t, anchor: A.BOTTOM}); applyPinLook(b, {nameOffset: 0});
    assert.deepEqual([b.tooltip.position.x, b.tooltip.position.y], [0, 24 + 12], 'same spot core uses: size/2 + 12');
    const b2 = note({keep: true, texture: t, anchor: A.BOTTOM}); applyPinLook(b2, {nameOffset: -8});
    assert.equal(b2.tooltip.position.y, 24 + 4);
    const r = note({keep: true, texture: t, anchor: A.RIGHT}); applyPinLook(r, {});
    assert.deepEqual([r.tooltip.position.x, r.tooltip.position.y], [96 + 12, 0], 'beside the wide edge, not beside a 48px square');
    const l = note({keep: true, texture: t, anchor: A.LEFT}); applyPinLook(l, {nameOffset: 5});
    assert.equal(l.tooltip.position.x, -(96 + 17));
    const top = note({keep: true, texture: t, anchor: A.TOP}); applyPinLook(top, {});
    assert.equal(top.tooltip.position.y, -36);
    // off: exactly as before 0.27.0 (core's position is left alone at offset 0)
    const off = note({keep: false, texture: t, anchor: A.RIGHT}); applyPinLook(off, {});
    assert.deepEqual([off.tooltip.position.x, off.tooltip.position.y], [0, 0]);
    const offMoved = note({keep: false, texture: t, anchor: A.RIGHT}); applyPinLook(offMoved, {nameOffset: 5});
    assert.equal(offMoved.tooltip.position.x, 24 + 17);
  } finally { delete globalThis.CONST; }
});

test('a late texture load asks the Note to refresh its tooltip and state', () => {
  const t = tex(400, 100, false), n = note({keep: true, texture: t});
  applyPinLook(n, {});
  t.baseTexture.valid = true; t.baseTexture.fire('loaded');
  assert.deepEqual(n.sets.at(-1), {refreshState: true, refreshTooltip: true});
  assert.equal(n.controlIcon.hitArea.width, 192);
});

test('refreshPins also rebuilds the icon so a turned-off pin returns to square at once', () => {
  const on = note({keep: true, texture: tex(400, 100)}); applyPinLook(on, {});
  on.document.flags[MODULE_ID].pin.keep = false;
  const before = on.controlIcon.refreshes;
  refreshPins([on, note({bound: false})]);
  assert.equal(on.controlIcon.refreshes, before + 1);
  applyPinLook(on, {}); assert.ok(square(on.controlIcon));
});

test('updateNote hook redraws a bound Note when its module flags change, and ignores other updates', () => {
  const hooks = {calls: {}, on(n, fn) { this.calls[n] = fn; }};
  registerPinLook(hooks, () => ({}));
  const n = note({keep: true});
  hooks.calls.updateNote({object: n}, {flags: {[MODULE_ID]: {pin: {keep: true}}}});
  assert.equal(n.sets.length, 1);
  hooks.calls.updateNote({object: n}, {x: 5});
  hooks.calls.updateNote({object: null}, {flags: {[MODULE_ID]: {}}});
  assert.equal(n.sets.length, 1);
  assert.doesNotThrow(() => hooks.calls.updateNote(null, null));
});

test('the editor has the checkbox next to Pin size with the hint; Save Changes carries it; help and README mention it', () => {
  const app = fs.readFileSync(new URL('../scripts/app.mjs', import.meta.url), 'utf8');
  assert.match(app, /data-toggle="pinKeepProportions"[^>]*>\s*Keep pin art proportions/);
  assert.match(app, /Draws the pin wider or taller to match the image\. Pin size sets the height\./);
  assert.ok(app.indexOf('data-bind="pin.size"') < app.indexOf('pinKeepProportions') && app.indexOf('pinKeepProportions') < app.indexOf('id="agl-teaser"'));
  const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /Keep pin art proportions/);
});
