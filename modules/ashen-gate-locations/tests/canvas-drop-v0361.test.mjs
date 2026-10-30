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
