/** 0.36.1: dropping a location on the canvas places exactly one pin, by either path. Mocked Foundry: logic only, not the live canvas. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvasDrop, setDragging} from '../scripts/canvas-drop.mjs';

function rig({gm = true, scene = {name: '[TEST] Town'}, fail = null, loc = {name: '[TEST] Inn'}} = {}) {
  const placed = [], info = [], warn = [], err = [];
  let t = 1000;
  const cd = createCanvasDrop({
    isGM: () => gm, now: () => t,
    api: () => ({getLocation: () => loc, placeOnScene: async (id, o) => { if (fail) throw new Error(fail); placed.push({id, ...o}); return {}; }}),
    canvas: () => ({scene, canvasCoordinatesFromClient: p => ({x: p.x * 2, y: p.y * 2})}),
    notify: {info: m => info.push(m), warn: m => warn.push(m), error: e => err.push(e.message)}
  });
  const ev = (payload, {x = 10, y = 20} = {}) => ({clientX: x, clientY: y, defaultPrevented: false, stopped: 0,
    dataTransfer: {getData: () => (typeof payload === 'string' ? payload : JSON.stringify(payload))},
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped++; }, stopImmediatePropagation() { this.stopped++; }});
  return {cd, placed, info, warn, err, ev, tick: n => { t += n; }};
}
const LOC = {type: 'AshenGateLocation', id: 'LOC-TEST-INN'};

test('DOM drop places one pin at canvas coordinates, stops the event, and says so', async () => {
  const r = rig(); const e = r.ev(LOC);
  await r.cd.onDrop(e);
  assert.deepEqual(r.placed, [{id: 'LOC-TEST-INN', scene: {name: '[TEST] Town'}, x: 20, y: 40}]);
  assert.equal(e.defaultPrevented, true); assert.ok(e.stopped >= 1);
  assert.deepEqual(r.info, ['Placed [TEST] Inn on [TEST] Town.']);
});

test('the hook after the DOM drop for the same event does not place again, and the other order is the same', async () => {
  const r = rig(); const e = r.ev(LOC);
  await r.cd.onDrop(e);
  assert.equal(r.cd.onHook({}, {...LOC, x: 20, y: 40}, e), false);
  await new Promise(res => setImmediate(res));
  assert.equal(r.placed.length, 1);
  const q = rig(); const e2 = q.ev(LOC);
  q.cd.onHook({}, {...LOC, x: 20, y: 40}, e2);
  await q.cd.onDrop(e2);
  await new Promise(res => setImmediate(res));
  assert.equal(q.placed.length, 1);
});

test('a hook-only drop (no DOM listener) still places once; a new drop later places again', async () => {
  const r = rig();
  assert.equal(r.cd.onHook({}, {...LOC, x: 5, y: 6}, undefined), false);
  r.cd.onHook({}, {...LOC, x: 5, y: 6}, undefined); // same drop seen twice without an event object
  await new Promise(res => setImmediate(res));
  assert.equal(r.placed.length, 1);
  r.tick(2000);
  r.cd.onHook({}, {...LOC, x: 5, y: 6}, undefined);
  await new Promise(res => setImmediate(res));
  assert.equal(r.placed.length, 2);
});

test('a non-GM is ignored on both paths', async () => {
  const r = rig({gm: false}); const e = r.ev(LOC);
  assert.equal(await r.cd.onDrop(e), undefined);
  assert.equal(r.cd.onHook({}, LOC, e), undefined);
  assert.equal(e.defaultPrevented, false);
  assert.deepEqual([r.placed, r.info, r.warn], [[], [], []]);
});

test('other drag types and non-JSON drops are ignored and left to Foundry', async () => {
  const r = rig();
  for (const payload of [{type: 'Actor', uuid: 'Actor.x'}, {type: 'AshenGateLocationMove', id: 'LOC-TEST-INN'}, {type: 'AshenGateReorder', id: 'a'}, 'not json', '']) {
    const e = r.ev(payload);
    assert.equal(await r.cd.onDrop(e), undefined);
    assert.equal(e.defaultPrevented, false); assert.equal(e.stopped, 0);
  }
  assert.equal(r.cd.onHook({}, {type: 'Actor'}, {}), undefined);
  assert.deepEqual([r.placed, r.info, r.warn], [[], [], []]);
});

test('never silent: no scene, no id, bad position all warn; a failed placement shows the error and can be retried', async () => {
  let r = rig({scene: null}); await r.cd.onDrop(r.ev(LOC));
  assert.match(r.warn[0], /Open a scene/); assert.equal(r.placed.length, 0);
  r = rig(); await r.cd.onDrop(r.ev({type: 'AshenGateLocation'}));
  assert.match(r.warn[0], /which location/);
  r = rig(); await r.cd.onDrop(r.ev(LOC, {x: NaN}));
  assert.match(r.warn[0], /position/);
  r = rig({fail: 'No location found with that reference.'});
  await r.cd.onDrop(r.ev(LOC));
  assert.deepEqual(r.err, ['No location found with that reference.']); assert.equal(r.info.length, 0);
});

test('dragover is allowed only for our own drag, for a GM', () => {
  const r = rig(); const mk = () => ({defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, dataTransfer: {}});
  let e = mk(); setDragging(null); r.cd.onDragOver(e); assert.equal(e.defaultPrevented, false);
  setDragging('AshenGateLocationMove'); e = mk(); r.cd.onDragOver(e); assert.equal(e.defaultPrevented, false);
  setDragging('AshenGateLocation'); e = mk(); r.cd.onDragOver(e); assert.equal(e.defaultPrevented, true);
  const p = rig({gm: false}); e = mk(); p.cd.onDragOver(e); assert.equal(e.defaultPrevented, false);
  setDragging(null);
});

test('attach binds capture listeners to the new element and detaches the old one', () => {
  const r = rig(); const log = [];
  const el = n => ({addEventListener: (t, f, c) => log.push(`+${n}:${t}:${c}`), removeEventListener: (t, f, c) => log.push(`-${n}:${t}:${c}`)});
  assert.equal(r.cd.attach(el('a')), true); r.cd.attach(el('b'));
  assert.deepEqual(log, ['+a:drop:true', '+a:dragover:true', '-a:drop:true', '-a:dragover:true', '+b:drop:true', '+b:dragover:true']);
  assert.equal(r.cd.attach(null), false);
});

// ---- placed-pin confirmation (pin-verify.mjs) ----
import {confirmPlacement, hiddenReasons, isOffScreen} from '../scripts/pin-verify.mjs';
const noWait = () => Promise.resolve();
function vrig({obj, scene = {id: 's1', name: '[TEST] Town'}, canvasScene = scene, toggle = true, pivot = {x: 0, y: 0}} = {}) {
  const info = [], warn = [], pans = [], logs = [];
  const note = {id: 'n1', x: 5000, y: 5000, iconSize: 40, texture: {src: 'icons/test.webp'}, object: obj};
  const canvas = {scene: canvasScene, notes: {placeables: obj ? [obj] : [], active: false}, stage: {pivot, scale: {x: 1}}, app: {screen: {width: 1000, height: 800}}, animatePan: async p => pans.push(p)};
  const game = {settings: {get: () => toggle}};
  const run = () => confirmPlacement({note, name: '[TEST] Inn', scene, x: 5000, y: 5000, canvas, game, notify: {info: m => info.push(m), warn: m => warn.push(m)}, wait: noWait, log: {warn: (...a) => logs.push(a)}});
  return {run, info, warn, pans, logs, note};
}
const drawn = (extra = {}) => ({document: {id: 'n1'}, id: 'n1', visible: true, alpha: 1, controlIcon: {width: 40, height: 40, alpha: 1}, ...extra});

test('a drawn, visible pin far from the view pans to it and reports success', async () => {
  const r = vrig({obj: drawn()}); const out = await r.run();
  assert.equal(out.ok, true); assert.equal(out.panned, true);
  assert.deepEqual(r.pans, [{x: 5000, y: 5000, duration: 500}]);
  assert.deepEqual(r.info, ['Placed [TEST] Inn on [TEST] Town.']); assert.deepEqual(r.warn, []);
});
test('a pin already in view is not panned to', async () => {
  const r = vrig({obj: drawn(), pivot: {x: 4900, y: 4900}}); await r.run();
  assert.deepEqual(r.pans, []); assert.equal(isOffScreen({app: {screen: {width: 10, height: 10}}, stage: {pivot: {x: 0, y: 0}, scale: {x: 1}}}, 100, 0), true);
});
test('no canvas object: warns with the position and a console detail, no success note', async () => {
  const r = vrig({obj: null}); const out = await r.run();
  assert.equal(out.ok, false); assert.equal(r.info.length, 0);
  assert.match(r.warn[0], /placed at 5000, 5000.*did not draw it/); assert.equal(r.logs.length, 1);
});
test('hidden, empty picture, zero size and transparent pins each give a plain reason', () => {
  const doc = {iconSize: 40, texture: {src: 'a.webp'}};
  assert.match(hiddenReasons(drawn({visible: false}), doc, {game: {settings: {get: () => false}}, canvas: {notes: {active: false}}}).join(), /Map Notes are turned off/);
  assert.match(hiddenReasons(drawn({isVisible: false}), doc, {game: {settings: {get: () => true}}}).join(), /marked it hidden/);
  assert.match(hiddenReasons(drawn(), {iconSize: 0, texture: {src: 'a'}}).join(), /size is zero/);
  assert.match(hiddenReasons(drawn(), {iconSize: NaN, texture: {src: 'a'}}).join(), /size is zero/);
  assert.match(hiddenReasons(drawn(), {iconSize: 40, texture: {src: ''}}).join(), /picture is empty/);
  assert.match(hiddenReasons(drawn({alpha: 0}), doc).join(), /transparent/);
  assert.match(hiddenReasons(drawn({controlIcon: {width: NaN, height: 5, alpha: 1}}), doc).join(), /no drawn size/);
  assert.deepEqual(hiddenReasons(drawn(), doc), []);
});
test('placing on a scene that is not on screen is reported', async () => {
  const r = vrig({obj: drawn(), canvasScene: {id: 'other', name: 'Other'}}); const out = await r.run();
  assert.equal(out.ok, false); assert.match(r.warn[0], /not the one on screen/);
});
test('a canvas object that appears a frame late is found', async () => {
  const obj = drawn(); const r = vrig({obj: null});
  let n = 0; r.note.object = undefined;
  const canvas = {scene: {id: 's1'}, notes: {get placeables() { return ++n > 2 ? [obj] : []; }}, stage: {pivot: {x: 5000, y: 5000}, scale: {x: 1}}, app: {screen: {width: 1000, height: 800}}};
  const info = [];
  const out = await confirmPlacement({note: r.note, name: 'X', scene: {id: 's1', name: 'S'}, canvas, game: {settings: {get: () => true}}, notify: {info: m => info.push(m), warn() {}}, wait: noWait});
  assert.equal(out.ok, true); assert.deepEqual(info, ['Placed X on S.']);
});
test('drop path uses confirm instead of the plain note, and a warning replaces the success note', async () => {
  const seen = []; const info = [];
  const cd = createCanvasDrop({isGM: () => true, api: () => ({getLocation: () => ({name: 'N'}), placeOnScene: async () => ({id: 'n9'})}),
    canvas: () => ({scene: {name: 'S'}, canvasCoordinatesFromClient: p => p}), notify: {info: m => info.push(m), warn() {}, error() {}},
    confirm: async a => seen.push(a)});
  await cd.onHook({}, {type: 'AshenGateLocation', id: 'LOC-TEST-X', x: 1, y: 2}, {});
  await new Promise(res => setImmediate(res));
  assert.equal(seen.length, 1); assert.equal(seen[0].note.id, 'n9'); assert.equal(info.length, 0);
});
