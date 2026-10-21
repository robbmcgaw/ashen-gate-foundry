/** 0.26.0 quick-bar Undo: a right-click clear can be undone for 5 seconds (mocked Foundry; logic only, not the live UI). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import * as hb from '../scripts/hotbar.mjs';
import {undoNoticesHtml} from '../scripts/hotbar-views.mjs';
import {createHubSheetClass, ACTIONS} from '../scripts/sheet.mjs';
import {MODULE_ID} from '../scripts/constants.mjs';

/** Manual timers: run() fires everything due, like the 5 seconds passing. */
function fakeTimers() {
  const due = new Map(); let n = 0;
  return {setTimeout: (fn, ms) => { due.set(++n, {fn, ms}); return n; }, clearTimeout: id => due.delete(id),
    pending: () => [...due.values()], run() { const all = [...due.values()]; due.clear(); all.forEach(t => t.fn()); }};
}
function setup() {
  installGlobals({user: users.owner});
  const actor = makeActor({items: [{id: 'ss', name: '[TEST] Shortsword', type: 'weapon'}, {id: 'hp', name: '[TEST] Potion', type: 'consumable'}]});
  actor.flags = {[MODULE_ID]: {hotbar: [{type: 'Item', id: 'ss'}, {type: 'Item', id: 'hp'}]}};
  const timers = fakeTimers(); let changes = 0;
  const undo = hb.createUndoList({timers, onChange: () => changes++});
  return {actor, timers, undo, changes: () => changes};
}
const clearAndTrack = async (undo, actor, i) => undo.add(actor, (await hb.clearHotbarSlot(actor, i)).result);

test('Undo puts the slot back exactly as it was; the notice lasts 5 seconds', async () => {
  const {actor, timers, undo} = setup();
  const id = await clearAndTrack(undo, actor, 0);
  assert.equal(hb.hotbarSlots(actor)[0], null);
  assert.equal(timers.pending()[0].ms, 5000);
  assert.deepEqual(undo.list(), [{id, index: 0, name: '[TEST] Shortsword'}]);
  assert.match(undoNoticesHtml(undo.list()), /ag-notice[\s\S]*Cleared slot 1: \[TEST\] Shortsword[\s\S]*data-action="hotbar-undo" data-undo="u1"/);
  assert.doesNotMatch(undoNoticesHtml(undo.list()), /title=/);
  assert.deepEqual(await undo.undo(id), {ok: true, result: 0});
  assert.deepEqual(hb.hotbarSlots(actor).slice(0, 2), [{type: 'Item', id: 'ss'}, {type: 'Item', id: 'hp'}]);
  assert.equal(undo.list().length, 0); assert.equal(timers.pending().length, 0, 'timer cancelled');
  assert.equal(undoNoticesHtml(undo.list()), '');
});

test('after 5 seconds the notice goes and the clear stands', async () => {
  const {actor, timers, undo, changes} = setup();
  const id = await clearAndTrack(undo, actor, 1);
  const before = changes();
  timers.run();
  assert.equal(undo.list().length, 0); assert.ok(changes() > before, 'notices redrawn');
  assert.match((await undo.undo(id)).error, /Too late/);
  assert.equal(hb.hotbarSlots(actor)[1], null);
});

test('the item was deleted before Undo: nothing restored, and it says so', async () => {
  const {actor, undo} = setup();
  const id = await clearAndTrack(undo, actor, 0);
  actor.items.splice(actor.items.findIndex(i => i.id === 'ss'), 1);
  const calls = actor.calls.length;
  const r = await undo.undo(id);
  assert.equal(r.ok, false); assert.match(r.error, /\[TEST\] Shortsword is gone, so slot 1 stays empty/);
  assert.equal(actor.calls.length, calls, 'no write');
  assert.equal(hb.hotbarSlots(actor)[0], null);
});

test('two clears in a row: each Undo restores its own slot; a second clear of an empty slot offers nothing', async () => {
  const {actor, undo} = setup();
  const a = await clearAndTrack(undo, actor, 0), b = await clearAndTrack(undo, actor, 1);
  assert.equal(await clearAndTrack(undo, actor, 1), null, 'already empty: no Undo');
  assert.equal(undo.list().length, 2);
  await undo.undo(b);
  assert.deepEqual(hb.hotbarSlots(actor).slice(0, 2), [null, {type: 'Item', id: 'hp'}]);
  await undo.undo(a);
  assert.deepEqual(hb.hotbarSlots(actor).slice(0, 2), [{type: 'Item', id: 'ss'}, {type: 'Item', id: 'hp'}]);
});

test('clear twice quickly (both read the filled slot) shows one notice; the Actor changing meanwhile is respected', async () => {
  const {actor, undo} = setup();
  const r1 = await hb.clearHotbarSlot(actor, 0);
  undo.add(actor, r1.result); const id = undo.add(actor, r1.result);
  assert.equal(undo.list().length, 1, 'one notice per slot');
  // Meanwhile slot 0 got something else and slot 5 changed: Undo leaves both alone.
  await hb.setHotbarSlot(actor, 0, actor.items.get('hp'));
  await hb.setHotbarSlot(actor, 5, actor.items.get('ss'));
  assert.match((await undo.undo(id)).error, /Slot 1 has something else now/);
  assert.deepEqual(hb.hotbarSlots(actor)[0], {type: 'Item', id: 'hp'});
  // Another slot changing does not block the undo, and is kept.
  const id2 = await clearAndTrack(undo, actor, 0);
  await hb.setHotbarSlot(actor, 7, actor.items.get('hp'));
  assert.equal((await undo.undo(id2)).ok, true);
  assert.deepEqual(hb.hotbarSlots(actor)[5], {type: 'Item', id: 'ss'});
  assert.deepEqual(hb.hotbarSlots(actor)[7], {type: 'Item', id: 'hp'});
});

test('Undo is refused in the data layer for a user who cannot edit the character', async () => {
  const {actor} = setup();
  installGlobals({user: users.observer});
  assert.equal((await hb.restoreHotbarSlot(actor, 0, {type: 'Item', id: 'hp'})).ok, false);
});

test('sheet: right-click clear adds a notice, the Undo action restores, closing drops pending undos', async () => {
  const {actor} = setup();
  const Sheet = createHubSheetClass(FakeActorSheetV2);
  const sheet = new Sheet({document: actor});
  const slot = {closest: sel => sel.includes('agch-quick__slot') ? {dataset: {hotbarSlot: '1'}} : null};
  await sheet._onContextMenu({target: slot, preventDefault() {}, stopPropagation() {}});
  assert.equal(hb.hotbarSlots(actor)[1], null);
  const [u] = sheet.undoList.list();
  assert.equal(u.index, 1);
  await ACTIONS['hotbar-undo'](sheet, {dataset: {undo: u.id}});
  assert.deepEqual(hb.hotbarSlots(actor)[1], {type: 'Item', id: 'hp'});
  await sheet._onContextMenu({target: slot, preventDefault() {}, stopPropagation() {}});
  sheet._onClose();
  assert.equal(sheet.undoList.list().length, 0);
  assert.equal(hb.hotbarSlots(actor)[1], null, 'the clear stands');
});
