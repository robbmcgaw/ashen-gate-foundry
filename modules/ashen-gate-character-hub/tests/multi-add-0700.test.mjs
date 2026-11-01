/** 0.70.0: add several compendium entries at once (mocked Foundry and dnd5e: proves the logic and the options handed to dnd5e's browser, not the live browser). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users} from './foundry-mock.mjs';
import * as add from '../scripts/item-add.mjs';
import {focusAdd} from '../scripts/sheet.mjs';

function world({user = users.owner, steps = 0} = {}) {
  const notes = installGlobals({user});
  const docs = {}, log = {select: [], dropCreate: [], manager: []};
  class AdvancementManager { constructor() { this.steps = Array(steps).fill({}); } static forNewItem(a, d) { log.manager.push(d); return new this(); } async render() { return this; } }
  let picked = null;
  globalThis.dnd5e = {applications: {advancement: {AdvancementManager}, CompendiumBrowser: {async select(o) { log.select.push(o); return picked; }, async selectOne() { throw new Error('selectOne must not be used'); }}}};
  globalThis.CONFIG.Item = {typeLabels: {}, dataModels: {spell: {onDropCreate: (e, a, d) => log.dropCreate.push(d.name)}}};
  globalThis.fromUuid = async u => docs[u] ?? null;
  globalThis.Item = {implementation: {fromCompendium: d => ({_id: d.id, name: d.name, type: d.type, system: structuredClone(d.system)})}};
  globalThis.foundry = {...globalThis.foundry, utils: {randomID: () => 'rnd'}};
  const doc = (n, type = 'spell', extra = {}) => (docs[`Compendium.t.s.Item.${n}`] = {documentName: 'Item', uuid: `Compendium.t.s.Item.${n}`, id: n, name: `[TEST] ${n}`, type, system: {}, parent: null, ...extra});
  return {actor: makeActor(), notes, log, doc, pick: (...u) => { picked = u.length ? new Set(u) : null; }, uuid: n => `Compendium.t.s.Item.${n}`};
}
const created = a => a.calls.filter(c => c[0] === 'createEmbedded');

test('Browse opens dnd5e\'s browser in multi-select (min 1, max 50) and adds every pick through the single path', async () => {
  const w = world(); ['a', 'b', 'c'].forEach(n => w.doc(n)); w.pick(w.uuid('a'), w.uuid('b'), w.uuid('c'));
  const r = await add.browseAndAdd(w.actor, 'magic');
  assert.deepEqual(w.log.select[0].selection, {min: 1, max: add.BATCH_MAX}); assert.equal(add.BATCH_MAX, 50);
  assert.deepEqual([...w.log.select[0].filters.locked.types], ['spell']);
  assert.equal(r.ok, true); assert.equal(r.added, 3); assert.equal(created(w.actor).length, 3, 'one createEmbeddedDocuments per entry, as a single add does');
  assert.deepEqual(w.log.dropCreate, ['[TEST] a', '[TEST] b', '[TEST] c'], "dnd5e's per-spell onDropCreate ran for each, in order");
  assert.deepEqual(w.notes.filter(n => n[0] === 'info').map(n => n[1]), ['Added 3.'], 'one summary, not three notes');
});

test('one pick behaves exactly as before (its own note)', async () => {
  const w = world(); w.doc('a'); w.pick(w.uuid('a'));
  const r = await add.browseAndAdd(w.actor, 'magic');
  assert.equal(r.result, 'created'); assert.deepEqual(w.notes.at(-1), ['info', 'Added [TEST] a to [TEST] Hero.']);
});

test('duplicates: a spell already on the sheet is skipped and said so; the rest are added', async () => {
  const w = world(); w.doc('a'); w.doc('b');
  w.actor.items = {contents: [{type: 'spell', name: '[TEST] a', _stats: {compendiumSource: w.uuid('a')}}], get: () => null};
  const r = await add.addMany(w.actor, 'magic', [w.uuid('a'), w.uuid('b'), w.uuid('b')]);
  assert.equal(r.added, 1); assert.equal(r.skipped, 1); assert.equal(created(w.actor).length, 1);
  assert.equal(r.summary, 'Added 1, skipped 1 (already on the sheet).'); assert.deepEqual(w.notes.at(-1), ['info', r.summary]);
});

test('physical items stack, so a second of the same is added', async () => {
  const w = world(); w.doc('p', 'loot');
  w.actor.items = {contents: [{type: 'loot', _stats: {compendiumSource: w.uuid('p')}}], get: () => null};
  const r = await add.addMany(w.actor, 'inventory', [w.uuid('p')]);
  assert.equal(r.added, 1); assert.equal(r.skipped, 0);
});

test('a failure does not stop the others; the summary counts it and warns', async () => {
  const w = world(); w.doc('a'); w.doc('sword', 'weapon'); w.doc('c');
  const r = await add.addMany(w.actor, 'magic', [w.uuid('a'), w.uuid('sword'), w.uuid('gone'), w.uuid('c')]);
  assert.equal(r.ok, true); assert.equal(r.added, 2); assert.equal(r.failed, 2); assert.equal(created(w.actor).length, 2);
  assert.match(r.summary, /^Added 2, 2 could not be added\.$/); assert.equal(w.notes.at(-1)[0], 'warn');
  const all = await add.addMany(w.actor, 'magic', [w.uuid('gone')]);
  assert.equal(all.ok, false); assert.match(all.error, /1 could not be added/);
});

test('cap: more than the limit adds nothing', async () => {
  const w = world(); const ids = Array.from({length: 51}, (_, i) => { w.doc(`s${i}`); return w.uuid(`s${i}`); });
  const r = await add.addMany(w.actor, 'magic', ids);
  assert.equal(r.ok, false); assert.match(r.error, /at most 50.*Nothing was added/); assert.equal(created(w.actor).length, 0);
  assert.equal((await add.addMany(w.actor, 'magic', ids.slice(0, 50))).added, 50);
});

test('cancel adds nothing and says nothing', async () => {
  const w = world(); w.pick();
  assert.deepEqual(await add.browseAndAdd(w.actor, 'magic'), {ok: true, result: null});
  assert.equal(created(w.actor).length, 0); assert.equal(w.notes.length, 0);
  assert.deepEqual(await add.addMany(w.actor, 'magic', []), {ok: true, result: null});
});

test('permissions: an observer is refused before the browser opens and in addMany itself', async () => {
  const w = world({user: users.observer}); w.doc('a'); w.pick(w.uuid('a'));
  for (const r of [await add.browseAndAdd(w.actor, 'magic'), await add.addMany(w.actor, 'magic', [w.uuid('a'), w.uuid('a')])]) { assert.equal(r.ok, false); assert.match(r.error, /owner or the GM/); }
  assert.equal(w.log.select.length, 0); assert.equal(created(w.actor).length, 0);
});

test('permission lost mid-batch stops the batch', async () => {
  const w = world(); w.doc('a'); w.doc('b');
  const g = globalThis.fromUuid; let n = 0;
  globalThis.fromUuid = async u => { if (++n === 2) globalThis.game.user = users.observer; return g(u); };
  const r = await add.addMany(w.actor, 'magic', [w.uuid('a'), w.uuid('b')]);
  assert.equal(created(w.actor).length, 1); assert.equal(r.added, 1); assert.equal(r.failed, 1);
});

test('items with advancement steps open dnd5e\'s window and are counted as waiting', async () => {
  const w = world({steps: 1}); w.doc('f', 'feat', {system: {advancement: {x: {}}}}); w.doc('g', 'feat');
  globalThis.Hooks = {on: () => 1, off() {}};
  const r = await add.addMany(w.actor, 'features', [w.uuid('f'), w.uuid('g')], {sheet: {_renderChild: () => {}}});
  assert.equal(r.added, 1); assert.equal(r.pending, 1); assert.match(r.summary, /Added 1, 1 waiting on dnd5e's advancement window/);
});

test('a dnd5e with only selectOne still works for one pick', async () => {
  const w = world(); w.doc('a'); delete globalThis.dnd5e.applications.CompendiumBrowser.select;
  globalThis.dnd5e.applications.CompendiumBrowser.selectOne = async () => w.uuid('a');
  assert.equal((await add.browseAndAdd(w.actor, 'magic')).result, 'created');
});

test('focus returns to the tab\'s Add button after a multi-add', async () => {
  const w = world(); w.doc('a'); w.doc('b'); w.pick(w.uuid('a'), w.uuid('b')); let focused = 0;
  const sheet = {document: w.actor, element: {querySelector: sel => (sel === '[data-action="item-add"][data-tab="magic"]' ? {focus: () => focused++} : null)}};
  const r = await add.startAdd(w.actor, 'magic', {sheet, choose: async () => 'browse'});
  focusAdd(sheet, 'magic');   // what the item-add action does after startAdd resolves
  assert.equal(r.added, 2); assert.equal(focused, 1);
});
