import test from 'node:test';
import assert from 'node:assert/strict';
import {ITEM_DROP_CONTRACT, readDrop, resolveItemDrop, itemIdOf, worldItemById, itemRef, resolveRef, bundleOf, grantBundle, dragPayload}
  from '../scripts/ag-item-drop.mjs';

const MISSING = "That item no longer exists or you can't see it.";
let seq = 0;
const item = (id, {type = 'loot', container = null, quantity, flags = {}, parent = null, pack = null, folder = null, name} = {}) => {
  const data = {_id: id, name: name ?? `[TEST] ${id}`, img: `icons/${id}.webp`, type, folder, sort: 5, ownership: {default: 0},
    _stats: {x: 1}, flags, system: {container, ...(quantity == null ? {} : {quantity})}};
  return {documentName: 'Item', id, name: data.name, img: data.img, type, folder, flags, system: data.system, parent, pack,
    uuid: pack ? `Compendium.${pack}.Item.${id}` : parent ? `${parent.uuid}.Item.${id}` : `Item.${id}`,
    toObject: () => structuredClone(data)};
};
const src = (sourceId, extra = {}) => ({'ashen-gate-manager': {source: {sourceId, ...extra.source}, ...(extra.archived ? {lifecycle: {archived: true}} : {})}});
const setup = ({items = [], packs = {}, uuids = {}, fromDropData, getDragEventData} = {}) => {
  seq = 0;
  globalThis.game = {items: {contents: items}, packs: {get: id => packs[id]}};
  globalThis.foundry = {utils: {randomID: () => `NEW${++seq}`}, applications: {ux: {TextEditor: {implementation: {getDragEventData}}}}};
  globalThis.fromUuid = async uuid => uuids[uuid] ?? null;
  globalThis.Item = {implementation: {fromDropData: fromDropData ?? (async raw => uuids[raw.uuid] ?? null)}};
};
const pack = (id, docs) => {
  let loaded = 0;
  return {get loaded() { return loaded; },
    getIndex: async () => docs.map(d => ({_id: d.id, folder: d.folder, system: {container: d.system.container}})),
    getDocument: async i => { loaded++; return docs.find(d => d.id === i) ?? null; }};
};
const event = text => ({dataTransfer: {getData: t => (t === 'text/plain' ? text : '')}});

test('contract id', () => assert.equal(ITEM_DROP_CONTRACT, 'ag-item-drop/1'));

test('readDrop: getDragEventData, text/plain fallback, garbage -> {}', () => {
  setup({getDragEventData: () => ({type: 'Item', uuid: 'Item.a'})});
  assert.deepEqual(readDrop(event('')), {type: 'Item', uuid: 'Item.a'});
  setup({getDragEventData: () => { throw new Error('no'); }});
  assert.deepEqual(readDrop(event('{"type":"Item","uuid":"Item.b"}')), {type: 'Item', uuid: 'Item.b'});
  setup();
  assert.deepEqual(readDrop(event('{"type":"Item","uuid":"Item.c"}')), {type: 'Item', uuid: 'Item.c'});
  assert.deepEqual(readDrop(event('not json')), {});
  assert.deepEqual(readDrop(event('[1,2]')), {});
  assert.deepEqual(readDrop(null), {});
  delete globalThis.foundry;
  assert.deepEqual(readDrop({}), {});
});

test('resolveItemDrop: world, compendium and embedded Items are accepted', async () => {
  const actor = {documentName: 'Actor', uuid: 'Actor.pc'};
  const w = item('w'), c = item('c', {pack: 'world.gear'}), e = item('e', {parent: actor});
  setup({uuids: {[w.uuid]: w, [c.uuid]: c, [e.uuid]: e}});
  for (const doc of [w, c, e]) assert.deepEqual(await resolveItemDrop({type: 'Item', uuid: doc.uuid}), {ok: true, items: [doc], reason: ''});
  setup({uuids: {[w.uuid]: w}, fromDropData: async () => { throw new Error('bad'); }}); // falls back to fromUuid
  assert.equal((await resolveItemDrop({type: 'Item', uuid: w.uuid})).items[0], w);
});

test('resolveItemDrop: refusals carry player-safe text', async () => {
  const actor = {documentName: 'Actor', uuid: 'Actor.x'};
  setup({uuids: {'Actor.x': actor}});
  assert.deepEqual(await resolveItemDrop({type: 'Actor', uuid: 'Actor.x'}), {ok: false, items: [], reason: 'Drop an item.'});
  assert.equal((await resolveItemDrop({type: 'JournalEntry', uuid: 'JournalEntry.j'})).reason, 'Drop an item.');
  assert.equal((await resolveItemDrop({type: 'Item', uuid: 'Actor.x'})).reason, 'Drop an item.'); // uuid is not an Item
  assert.equal((await resolveItemDrop({type: 'Folder', uuid: 'Folder.f'})).reason, 'Drop items one at a time.');
  assert.equal((await resolveItemDrop({type: 'Item', uuid: 'Item.gone'})).reason, MISSING);
  assert.equal((await resolveItemDrop({})).reason, MISSING);
  assert.equal((await resolveItemDrop(undefined)).ok, false);
});

test('resolveItemDrop: a folder with {folders:true} expands nested, skips non-Items and respects maxFolder', async () => {
  const sub = {id: 'sub'}, folder = {documentName: 'Folder', type: 'Item', id: 'top', uuid: 'Folder.top', getSubfolders: () => [sub]};
  const a = item('a', {folder: 'top'}), b = item('b', {folder: 'sub'}), out = item('out', {folder: 'else'});
  const notItem = {documentName: 'Actor', id: 'z', folder: 'top'};
  setup({items: [a, notItem, out, b], uuids: {'Folder.top': folder}});
  assert.deepEqual((await resolveItemDrop({type: 'Folder', uuid: 'Folder.top'}, {folders: true})).items, [a, b]);
  assert.deepEqual((await resolveItemDrop({type: 'Folder', uuid: 'Folder.top'}, {folders: true, maxFolder: 1})).items, [a]);
  // Compendium folder: contents come from the pack.
  const pa = item('pa', {pack: 'world.gear', folder: 'pf'}), pb = item('pb', {pack: 'world.gear', folder: 'other'});
  const pfolder = {documentName: 'Folder', type: 'Item', id: 'pf', pack: 'world.gear', uuid: 'Compendium.world.gear.Folder.pf'};
  setup({packs: {'world.gear': pack('world.gear', [pa, pb])}, uuids: {[pfolder.uuid]: pfolder}});
  assert.deepEqual((await resolveItemDrop({type: 'Folder', uuid: pfolder.uuid}, {folders: true})).items, [pa]);
  // A folder of Actors is not a folder of items.
  setup({uuids: {'Folder.act': {documentName: 'Folder', type: 'Actor', id: 'act'}}});
  assert.equal((await resolveItemDrop({type: 'Folder', uuid: 'Folder.act'}, {folders: true})).reason, 'Drop an item.');
  assert.equal((await resolveItemDrop({type: 'Folder', uuid: 'Folder.gone'}, {folders: true})).reason, MISSING);
});

test('itemIdOf: Manager, then Ledger, then legacy; bad ids -> null', () => {
  const all = {...src('ITEM-A'), 'ashen-gate-profession-ledger': {sourceId: 'ITEM-B'}, 'ashen-gate': {sourceId: 'ITEM-C'}};
  assert.equal(itemIdOf({flags: all}), 'ITEM-A');
  assert.equal(itemIdOf({flags: {'ashen-gate-profession-ledger': {sourceId: 'ITEM-B'}, 'ashen-gate': {sourceId: 'ITEM-C'}}}), 'ITEM-B');
  assert.equal(itemIdOf({flags: {'ashen-gate': {sourceId: 'MAT-IRON-1'}}}), 'MAT-IRON-1');
  assert.equal(itemIdOf({flags: src('item-lower')}), null);
  assert.equal(itemIdOf({flags: src('NODASH')}), null);
  assert.equal(itemIdOf({}), null);
  assert.equal(itemIdOf(null), null);
});

test('worldItemById: one active match only', () => {
  const one = item('one', {flags: src('ITEM-ONE')});
  const dupA = item('d1', {flags: src('ITEM-DUP')}), dupB = item('d2', {flags: src('ITEM-DUP')});
  const retired = item('r', {flags: src('ITEM-OLD', {source: {status: 'retired'}})});
  const superseded = item('s', {flags: src('ITEM-OLD', {source: {status: 'superseded'}})});
  const archived = item('x', {flags: src('ITEM-OLD', {archived: true})});
  const live = item('l', {flags: src('ITEM-OLD', {source: {status: 'approved'}})});
  setup({items: [one, dupA, dupB, retired, superseded, archived, live]});
  assert.equal(worldItemById('ITEM-ONE'), one);
  assert.equal(worldItemById('ITEM-NONE'), null);
  assert.equal(worldItemById('ITEM-DUP'), null);
  assert.equal(worldItemById('ITEM-OLD'), live);
  assert.equal(worldItemById('bad'), null);
});

test('resolveRef: id wins over uuid; uuid fallback; conflict; missing', async () => {
  const bound = item('bound', {flags: src('ITEM-B')}), other = item('other');
  const d1 = item('d1', {flags: src('ITEM-DUP')}), d2 = item('d2', {flags: src('ITEM-DUP')});
  setup({items: [bound, other, d1, d2], uuids: {[other.uuid]: other, 'Actor.a': {documentName: 'Actor'}}});
  assert.deepEqual(await resolveRef({itemId: 'ITEM-B', uuid: other.uuid}), {status: 'ok', item: bound});
  assert.deepEqual(await resolveRef({itemId: 'ITEM-GONE', uuid: other.uuid}), {status: 'ok', item: other});
  assert.deepEqual(await resolveRef({itemId: null, uuid: other.uuid}), {status: 'ok', item: other});
  assert.deepEqual(await resolveRef({itemId: 'ITEM-DUP', uuid: other.uuid}), {status: 'conflict'});
  assert.deepEqual(await resolveRef({itemId: 'ITEM-GONE', uuid: 'Item.gone'}), {status: 'missing'});
  assert.deepEqual(await resolveRef({uuid: 'Actor.a'}), {status: 'missing'});
  assert.deepEqual(await resolveRef(null), {status: 'missing'});
});

const nested = opts => {
  const bag = item('bag', {type: 'container', quantity: 1, flags: {...src('ITEM-BAG'), mine: {keep: 1}}, ...opts});
  const pouch = item('pouch', {type: 'container', container: 'bag', quantity: 2, ...opts});
  const coin = item('coin', {container: 'pouch', quantity: 7, ...opts});
  const rope = item('rope', {container: 'bag', quantity: 1, ...opts});
  const loose = item('loose', {quantity: 1, ...opts});
  return {bag, pouch, coin, rope, loose, all: [loose, coin, bag, rope, pouch]};
};

function checkGrant({data, contents}, {bag}) {
  assert.equal(contents, 3);
  assert.deepEqual(data.map(d => d.name), ['[TEST] bag', '[TEST] rope', '[TEST] pouch', '[TEST] coin']);
  assert.deepEqual(data.map(d => d._id), ['NEW1', 'NEW2', 'NEW3', 'NEW4']); // fresh ids
  assert.equal(data[0].system.container, null); // root cleared
  assert.equal(data[1].system.container, 'NEW1'); // rope -> new bag
  assert.equal(data[2].system.container, 'NEW1'); // pouch -> new bag
  assert.equal(data[3].system.container, 'NEW3'); // coin -> new pouch
  assert.deepEqual(data.map(d => d.system.quantity), [3, 1, 2, 7]); // root only
  for (const d of data) {
    assert.deepEqual(d.flags.mine.tag, 'Q-1');
    for (const k of ['folder', 'sort', 'ownership', '_stats']) assert.equal(k in d, false);
  }
  assert.equal(data[0].flags.mine.keep, 1); // existing scope flags kept
  assert.equal(data[0].flags['ashen-gate-manager'].source.sourceId, 'ITEM-BAG');
  assert.equal(bag.toObject()._id, 'bag'); // source untouched
  assert.equal(bag.system.quantity, 1);
  assert.equal(bag.flags.mine.tag, undefined);
}

test('bundleOf + grantBundle: nested container on an Actor', async () => {
  const actor = {documentName: 'Actor', uuid: 'Actor.pc'};
  const n = nested({parent: actor});
  actor.items = n.all;
  setup({items: [item('coin', {container: 'pouch'})]}); // world items are never read for an embedded bag
  assert.deepEqual((await bundleOf(n.bag)).map(d => d.id), ['bag', 'rope', 'pouch', 'coin']);
  checkGrant(await grantBundle(n.bag, {quantity: 3, scope: 'mine', tag: {tag: 'Q-1'}}), n);
  const ref = await itemRef(n.bag);
  assert.deepEqual(ref, {schema: 'ag-item-ref/1', uuid: 'Actor.pc.Item.bag', itemId: 'ITEM-BAG', name: '[TEST] bag', img: 'icons/bag.webp',
    type: 'container', quantity: 1, sourceKind: 'embedded', packId: null, parentUuid: 'Actor.pc', contents: 3});
});

test('bundleOf + grantBundle: in the world', async () => {
  const n = nested();
  setup({items: n.all});
  checkGrant(await grantBundle(n.bag, {quantity: 3, scope: 'mine', tag: {tag: 'Q-1'}}), n);
  assert.deepEqual((await bundleOf(n.loose)).map(d => d.id), ['loose']);
  assert.equal((await itemRef(n.bag)).sourceKind, 'world');
});

test('bundleOf + grantBundle: in a compendium, contents come from the pack', async () => {
  const n = nested({pack: 'world.gear'});
  const p = pack('world.gear', n.all);
  setup({items: [item('coin', {container: 'pouch'})], packs: {'world.gear': p}}); // a world "coin" must not leak in
  checkGrant(await grantBundle(n.bag, {quantity: 3, scope: 'mine', tag: {tag: 'Q-1'}}), n);
  const ref = await itemRef(n.bag, {quantity: 2});
  assert.equal(ref.sourceKind, 'compendium');
  assert.equal(ref.packId, 'world.gear');
  assert.equal(ref.parentUuid, null);
  assert.equal(ref.contents, 3);
  const before = p.loaded;
  assert.deepEqual((await bundleOf(n.loose)).map(d => d.id), ['loose']);
  assert.equal(p.loaded, before); // a non-container never loads the pack
});

test('grantBundle: a single item, default quantity, no scope', async () => {
  const sword = item('sword', {type: 'weapon', quantity: 2});
  setup({items: [sword]});
  const {data, contents} = await grantBundle(sword);
  assert.equal(contents, 0);
  assert.equal(data[0].system.quantity, 2);
  assert.equal(data[0]._id, 'NEW1');
});

test('itemRef: quantity is a whole number >= 1', async () => {
  setup();
  const potion = item('p', {quantity: 4});
  assert.equal((await itemRef(potion)).quantity, 4);
  assert.equal((await itemRef(potion, {quantity: 2.7})).quantity, 2);
  assert.equal((await itemRef(potion, {quantity: 0})).quantity, 1);
  assert.equal((await itemRef(potion, {quantity: 'x'})).quantity, 1);
  assert.equal((await itemRef(item('q'))).quantity, 1);
  assert.equal((await itemRef(potion)).itemId, null);
});

test('dragPayload shape', () => {
  const ref = {schema: 'ag-item-ref/1', uuid: 'Item.a'};
  assert.deepEqual(dragPayload(ref), {type: 'Item', uuid: 'Item.a', agItemRef: ref});
  assert.deepEqual(dragPayload(ref, {from: 'quest'}), {type: 'Item', uuid: 'Item.a', agItemRef: ref, from: 'quest'});
});
