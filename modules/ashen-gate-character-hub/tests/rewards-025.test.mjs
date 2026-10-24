/** 0.25.0 rewards H1: Journey records item rewards per grant; companion drops use ag-item-drop/1 (mocked Foundry; logic only, not the live UI). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, makeItem, users, FakeActorSheetV2} from './foundry-mock.mjs';
import * as j from '../scripts/journey.mjs';
import * as c from '../scripts/companions.mjs';
import {createHubSheetClass} from '../scripts/sheet.mjs';
import {MODULE_ID} from '../scripts/constants.mjs';

function world({user = users.gm} = {}) {
  const notes = installGlobals({user});
  const journals = [];
  globalThis.JournalEntry = {create: async data => { const doc = {...data, flags: structuredClone(data.flags), async update(diff) { for (const [path, v] of Object.entries(diff)) { const ks = path.split('.'); let o = doc; for (const k of ks.slice(0, -1)) o = o[k] ??= {}; o[ks.at(-1)] = v; } return doc; }}; journals.push(doc); return doc; }};
  game.journal = journals;
  game.users = [{...users.gm, active: true}, {...users.owner, active: true}];
  return notes;
}
const visible = actor => actor.flags[MODULE_ID]?.journey?.entries ?? [];
const ITEMS = [{name: '[TEST] Healing Draught', img: 'icons/draught.webp', quantity: 2, itemId: 'ITEM-TEST-HEALING-DRAUGHT'}, {name: '[TEST] Rusted Blade', img: 'icons/blade.webp'}];

test('recordReward: the old call keeps its entry id and text', async () => {
  world();
  const actor = makeActor();
  await j.recordReward(actor, {questId: 'QUEST-TEST-A', questName: '[TEST] Find the Mill', coins: {gp: 50}});
  assert.equal(visible(actor)[0].id, 'reward-QUEST-TEST-A');
  assert.equal(visible(actor)[0].text, 'Reward for "[TEST] Find the Mill": 50 gp');
  assert.deepEqual(visible(actor)[0].data, {questId: 'QUEST-TEST-A', grantId: null, coins: {gp: 50}, items: []});
});

test('recordReward: items list names and quantities (quantity only above 1), coins after; data keeps the items', async () => {
  world();
  const actor = makeActor();
  assert.equal((await j.recordReward(actor, {questId: 'QUEST-TEST-A', questName: '[TEST] Find the Mill', items: ITEMS, coins: {gp: 10, sp: 0}, grantId: 'g1'})).ok, true);
  const e = visible(actor)[0];
  assert.equal(e.id, 'reward-QUEST-TEST-A-g1');
  assert.equal(e.text, 'Reward for "[TEST] Find the Mill": 2 × [TEST] Healing Draught, [TEST] Rusted Blade, 10 gp');
  assert.deepEqual(e.data.items, [{...ITEMS[0]}, {name: '[TEST] Rusted Blade', img: 'icons/blade.webp', quantity: 1, itemId: null}]);
  assert.equal(e.data.grantId, 'g1');
});

test('recordReward: two grantIds give two entries, the same grantId twice gives one, a bad grantId is refused', async () => {
  world();
  const actor = makeActor();
  await j.recordReward(actor, {questId: 'QUEST-TEST-A', items: ITEMS, grantId: 'g1'});
  await j.recordReward(actor, {questId: 'QUEST-TEST-A', items: ITEMS, grantId: 'g1'});
  assert.equal(visible(actor).length, 1);
  await j.recordReward(actor, {questId: 'QUEST-TEST-A', items: ITEMS, grantId: 'g2'});
  assert.deepEqual(visible(actor).map(e => e.id).sort(), ['reward-QUEST-TEST-A-g1', 'reward-QUEST-TEST-A-g2']);
  assert.equal((await j.recordReward(actor, {questId: 'QUEST-TEST-A', grantId: 'bad id!'})).ok, false);
  assert.equal(visible(actor).length, 2);
});

test('recordReward: bad items are cleaned (no name, bad quantity, bad id, non-string img, over 50)', () => {
  const many = Array.from({length: 60}, (_, n) => ({name: `[TEST] Coin ${n}`}));
  assert.equal(j.cleanRewardItems(many).length, 50);
  assert.deepEqual(j.cleanRewardItems(null), []);
  assert.deepEqual(j.cleanRewardItems([null, 'x', {name: '  '}, {name: 7}, {name: `  ${'a'.repeat(200)}  `, quantity: 0, itemId: 'not-an-id', img: 5}, {name: 'B', quantity: 2.5}, {name: 'C', quantity: '3', itemId: 'ITEM-TEST-C', extra: 'dropped'}]),
    [{name: 'a'.repeat(120), img: null, quantity: 1, itemId: null}, {name: 'B', img: null, quantity: 1, itemId: null}, {name: 'C', img: null, quantity: 3, itemId: 'ITEM-TEST-C'}]);
});

test('recordReward: players are refused in the API', async () => {
  world({user: users.owner});
  const actor = makeActor();
  assert.equal((await j.recordReward(actor, {questId: 'QUEST-TEST-A', items: ITEMS, grantId: 'g1'})).ok, false);
  assert.equal(actor.calls.length, 0);
});

test('Journey render: item pictures with alt and data-tooltip; no ids or hidden entries in the player view', async () => {
  world();
  const actor = makeActor();
  await j.recordReward(actor, {questId: 'QUEST-TEST-A', questName: '[TEST] Find the Mill', items: ITEMS, grantId: 'g1'});
  await j.recordReward(actor, {questId: 'QUEST-TEST-B', questName: '[TEST] Secret', items: [{name: '[TEST] Hidden Gem', itemId: 'ITEM-TEST-GEM'}], grantId: 'g1'});
  await j.setHidden(actor, 'reward-QUEST-TEST-B-g1', true);
  const Cls = createHubSheetClass(FakeActorSheetV2);
  const gmSheet = new Cls({document: actor}); gmSheet.tab = 'journey';
  const gmHtml = await gmSheet._renderHTML();
  assert.match(gmHtml, /\[TEST\] Hidden Gem/, 'the GM sees the hidden reward');
  world({user: users.owner});
  game.journal = [];
  const sheet = new Cls({document: actor}); sheet.tab = 'journey';
  const html = await sheet._renderHTML();
  assert.match(html, /<span class="agch-journey__items"><img src="icons\/draught.webp" alt="\[TEST\] Healing Draught" data-tooltip="2 × \[TEST\] Healing Draught"><img src="icons\/blade.webp" alt="\[TEST\] Rusted Blade" data-tooltip="\[TEST\] Rusted Blade"><\/span>/);
  assert.doesNotMatch(html, /ITEM-TEST|Hidden Gem|QUEST-TEST-B/);
  assert.doesNotMatch(html, /\stitle="[^"]*Healing/);
});

// ---------- Companion drops ----------

const dropEvent = (zone, data) => ({target: {closest: sel => sel === '[data-drop-companion]' ? zone : null}, preventDefault() {}, stopPropagation() {},
  dataTransfer: {getData: () => JSON.stringify(data)}});
function dropWorld(actor, docs) {
  const notes = installGlobals({user: users.gm, settings: {petCap: 2}});
  globalThis.Item = {implementation: {fromDropData: async d => docs[d.uuid] ?? null}};
  globalThis.Actor = {implementation: {fromDropData: async d => docs[d.uuid] ?? null}};
  globalThis.fromUuid = async uuid => docs[uuid] ?? null;
  return notes;
}
const cleanup = () => { delete globalThis.Item; delete globalThis.Actor; delete globalThis.fromUuid; };
const worldItem = (id, extra = {}) => ({...makeItem({id, name: `[TEST] ${id}`, type: 'loot', ...extra}, null), uuid: `Item.${id}`, toObject() { return {_id: id, name: `[TEST] ${id}`, type: 'loot', system: {...(extra.system ?? {})}, flags: {}}; }});

test('companion drop: an Actor on the pet box links and activates it; an Item on a socket is copied and socketed', async () => {
  const actor = makeActor();
  const wolf = worldItem('wolf', {system: {quantity: 1}});
  const steed = {documentName: 'Actor', id: 'steed', uuid: 'Actor.steed', name: '[TEST] Steed', testUserPermission: () => true};
  dropWorld(actor, {'Item.wolf': wolf, 'Actor.steed': steed});
  const sheet = new (createHubSheetClass(FakeActorSheetV2))({document: actor});
  assert.equal((await sheet._onCompanionDrop(dropEvent({dataset: {dropCompanion: 'box', kind: 'pet'}}, {type: 'Actor', uuid: 'Actor.steed'}))).ok, true);
  assert.equal(actor.flags[MODULE_ID].companionSlots.activePet, 'Actor.steed');
  assert.equal((await sheet._onCompanionDrop(dropEvent({dataset: {dropCompanion: 'socket', kind: 'pet', socket: 'body'}}, {type: 'Item', uuid: 'Item.wolf'}))).ok, true);
  const create = actor.calls.find(x => x[0] === 'createEmbedded');
  assert.equal(create[2].length, 1); assert.notEqual(create[2][0]._id, 'wolf', 'a fresh id');
  assert.equal(actor.flags[MODULE_ID].companionSlots.gear.steed.body, create[2][0]._id);
  assert.equal(wolf.calls.length, 0, 'the source is never changed');
  cleanup();
});

test('companion drop: a folder, a non-Item and a missing item each show the shared warning and copy nothing', async () => {
  const actor = makeActor();
  const notes = dropWorld(actor, {});
  const sheet = new (createHubSheetClass(FakeActorSheetV2))({document: actor});
  await sheet._onCompanionDrop(dropEvent({dataset: {dropCompanion: 'box', kind: 'mount'}}, {type: 'Folder', uuid: 'Folder.f1'}));
  await sheet._onCompanionDrop(dropEvent({dataset: {dropCompanion: 'box', kind: 'pet'}}, {type: 'Item', uuid: 'Item.gone'}));
  await sheet._onCompanionDrop(dropEvent({dataset: {dropCompanion: 'box', kind: 'pet'}}, {type: 'JournalEntry', uuid: 'JournalEntry.j'}));
  assert.deepEqual(notes, [['warn', 'Drop items one at a time.'], ['warn', "That item no longer exists or you can't see it."], ['warn', 'Drop an item.']]);
  assert.equal(actor.calls.length, 0);
  cleanup();
});

test('companion drop: a container brings its contents in one create with keepId; the root arrives loose', async () => {
  const actor = makeActor();
  const bag = worldItem('bag', {type: 'container', system: {quantity: 1, container: 'other'}});
  bag.type = 'container';
  const rope = worldItem('rope', {system: {container: 'bag', quantity: 3}});
  dropWorld(actor, {'Item.bag': bag});
  game.items = {contents: [bag, rope]};
  const opts = [], create = actor.createEmbeddedDocuments; actor.createEmbeddedDocuments = (t, rows, o) => { opts.push(o); return create(t, rows, o); };
  const steed = {documentName: 'Actor', id: 'steed', uuid: 'Actor.steed', name: '[TEST] Steed', testUserPermission: () => true};
  assert.equal((await c.addActorCompanion(actor, steed, 'pet')).ok, true);
  actor.calls.length = 0;
  const r = await c.socketDroppedGear(actor, 'pet', 'head', bag);
  assert.equal(r.ok, true);
  const creates = actor.calls.filter(x => x[0] === 'createEmbedded');
  assert.equal(creates.length, 1); assert.deepEqual(opts, [{keepId: true}]);
  const [root, inside] = creates[0][2];
  assert.equal(root.system.container, null); assert.equal(inside.system.container, root._id); assert.equal(inside.system.quantity, 3);
  assert.equal(actor.flags[MODULE_ID].companionSlots.gear.steed.head, root._id);
  cleanup();
});
