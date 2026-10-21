/** Companions: one mount, GM-capped pets, perks, GM-only caps (mocked Foundry; logic only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, makeItem, users, FakeActorSheetV2} from './foundry-mock.mjs';
import * as c from '../scripts/companions.mjs';
import {createHubSheetClass} from '../scripts/sheet.mjs';
import {MODULE_ID} from '../scripts/constants.mjs';

const ITEMS = () => ['horse', 'pony', 'cat', 'owl', 'rat', 'saddle', 'collar'].map(id => ({id, name: `[TEST] ${id}`, type: id === 'saddle' || id === 'collar' ? 'feat' : 'loot', system: {description: {value: `<p>${id} text</p>`}}}));
const stored = actor => actor.flags[MODULE_ID]?.companions ?? [];

test('default pet cap is 0; GM overrides per character: number, none, unlimited, back to default', async () => {
  installGlobals({user: users.gm});
  const actor = makeActor();
  assert.equal(c.petCapFor(actor), 0);
  await c.setDefaultPetCap(3); assert.equal(c.petCapFor(actor), 3);
  await c.setPetCapOverride(actor.id, 'none'); assert.equal(c.petCapFor(actor), 0);
  await c.setPetCapOverride(actor.id, 'unlimited'); assert.equal(c.petCapFor(actor), Infinity);
  await c.setPetCapOverride(actor.id, '1'); assert.equal(c.petCapFor(actor), 1);
  await c.setPetCapOverride(actor.id, ''); assert.equal(c.petCapFor(actor), 3);
  assert.equal((await c.setPetCapOverride(actor.id, '-2')).ok, false);
});

test('only the GM can change caps', async () => {
  installGlobals({user: users.owner});
  assert.match((await c.setDefaultPetCap(9)).error, /Only the GM/);
  assert.match((await c.setPetCapOverride('actor1', 'unlimited')).error, /Only the GM/);
  assert.deepEqual(game.settings.store, {}, 'nothing written');
});

test('one mount per character', async () => {
  installGlobals();
  const actor = makeActor({items: ITEMS()});
  assert.equal((await c.addCompanion(actor, 'horse', 'mount')).ok, true);
  const r = await c.addCompanion(actor, 'pony', 'mount');
  assert.equal(r.ok, false); assert.match(r.error, /already has a mount/);
  assert.equal(stored(actor).filter(e => e.kind === 'mount').length, 1);
});

test('pets up to the cap; the add function refuses beyond it (data layer)', async () => {
  installGlobals({settings: {petCap: 2, petCapOverrides: {}}});
  const actor = makeActor({items: ITEMS()});
  assert.equal((await c.addCompanion(actor, 'cat', 'pet')).ok, true);
  assert.equal((await c.addCompanion(actor, 'owl', 'pet')).ok, true);
  const r = await c.addCompanion(actor, 'rat', 'pet');
  assert.equal(r.ok, false); assert.match(r.error, /2 of 2 pets/);
  game.settings.store.petCapOverrides = {actor1: 'none'};
  assert.match((await c.addCompanion(actor, 'rat', 'pet')).error, /can't have pets/);
  game.settings.store.petCapOverrides = {actor1: 'unlimited'};
  assert.equal((await c.addCompanion(actor, 'rat', 'pet')).ok, true);
  assert.deepEqual(stored(actor).map(e => [e.kind, e.itemId]), [['pet', 'cat'], ['pet', 'owl'], ['pet', 'rat']]);
});

test('a lowered cap never removes pets; it shows over-limit', async () => {
  installGlobals({settings: {petCap: 2}});
  const actor = makeActor({items: ITEMS()});
  await c.addCompanion(actor, 'cat', 'pet'); await c.addCompanion(actor, 'owl', 'pet');
  game.settings.store.petCap = 1;
  const d = c.companionsData(actor);
  assert.equal(d.pets.length, 2); assert.equal(d.overCap, true);
});

test('the same item cannot be two companions; unknown items refused', async () => {
  installGlobals({settings: {petCap: 2}});
  const actor = makeActor({items: ITEMS()});
  await c.addCompanion(actor, 'cat', 'pet');
  assert.match((await c.addCompanion(actor, 'cat', 'pet')).error, /already a companion/);
  assert.equal((await c.addCompanion(actor, 'ghost', 'pet')).ok, false);
  assert.equal((await c.addCompanion(actor, 'owl', 'dragon')).ok, false);
});

test('perk attach/detach, reorder and remove write one Actor update each; the item stays', async () => {
  installGlobals({settings: {petCap: 2}});
  const actor = makeActor({items: ITEMS()});
  await c.addCompanion(actor, 'horse', 'mount');
  await c.addCompanion(actor, 'cat', 'pet'); await c.addCompanion(actor, 'owl', 'pet');
  const [mount, cat, owl] = stored(actor);
  actor.calls.length = 0;
  await c.attachPerk(actor, mount.id, 'saddle');
  assert.deepEqual(stored(actor)[0].perkItemIds, ['saddle']);
  assert.match((await c.attachPerk(actor, cat.id, 'saddle')).error, /already a companion or attached perk/);
  await c.moveCompanion(actor, owl.id, -1);
  assert.deepEqual(stored(actor).map(e => e.itemId), ['horse', 'owl', 'cat']);
  await c.detachPerk(actor, mount.id, 'saddle');
  assert.deepEqual(stored(actor)[0].perkItemIds, []);
  await c.removeCompanion(actor, cat.id);
  assert.deepEqual(stored(actor).map(e => e.itemId), ['horse', 'owl']);
  assert.equal(actor.calls.length, 4);
  assert.ok(actor.calls.every(([k, diff]) => k === 'update' && Object.keys(diff).join() === `flags.${MODULE_ID}.companions`));
  assert.ok(actor.items.get('cat'), 'removing a companion keeps its Item');
});

test('observers cannot change companions', async () => {
  installGlobals({user: users.observer});
  const actor = makeActor({items: ITEMS()});
  for (const r of [await c.addCompanion(actor, 'cat', 'pet'), await c.removeCompanion(actor, 'x'), await c.moveCompanion(actor, 'x', 1), await c.attachPerk(actor, 'x', 'saddle'), await c.detachPerk(actor, 'x', 'saddle'),
    await c.addDroppedCompanion(actor, makeItem({id: 'w', name: 'w', type: 'loot'}, null), 'pet')]) assert.equal(r.ok, false);
  assert.equal(actor.calls.length, 0);
});

test('dropping an outside Item makes one embedded copy, then lists it; cap is checked before copying', async () => {
  installGlobals({settings: {petCap: 2}});
  const actor = makeActor({items: ITEMS()});
  const outside = {...makeItem({id: 'world-wolf', name: '[TEST] Wolf', type: 'loot'}, null), toObject: () => ({_id: 'world-wolf', name: '[TEST] Wolf', type: 'loot'})};
  const r = await c.addDroppedCompanion(actor, outside, 'pet');
  assert.equal(r.ok, true);
  const create = actor.calls.find(x => x[0] === 'createEmbedded');
  assert.notEqual(create[2][0]._id, 'world-wolf', 'no id reuse (a fresh id, created with keepId)');
  assert.equal(stored(actor)[0].itemId, actor.items.at(-1).id);
  await c.addCompanion(actor, 'cat', 'pet');
  actor.calls.length = 0;
  const full = await c.addDroppedCompanion(actor, outside, 'pet');
  assert.equal(full.ok, false);
  assert.equal(actor.calls.length, 0, 'nothing copied when over the cap');
  const own = await c.addDroppedCompanion(actor, actor.items.get('horse'), 'mount');
  assert.equal(own.ok, true); assert.equal(actor.calls.filter(x => x[0] === 'createEmbedded').length, 0, 'own items are not copied');
  assert.equal((await c.attachDroppedPerk(actor, stored(actor).at(-1).id, actor.items.get('saddle'))).ok, true);
});

test('deleted items drop out of the list on read', () => {
  installGlobals();
  const actor = makeActor({items: ITEMS()});
  actor.flags[MODULE_ID] = {companions: [{id: 'a', kind: 'pet', itemId: 'gone', perkItemIds: []}, {id: 'b', kind: 'pet', itemId: 'cat', perkItemIds: ['gone']}, {kind: 'bogus'}]};
  const d = c.companionsData(actor);
  assert.deepEqual(d.pets.map(p => p.itemId), ['cat']);
  assert.deepEqual(d.pets[0].perks, []);
});

test('Companions tab renders for owner and observer; GM Setup only for the GM', async () => {
  installGlobals({user: users.owner, settings: {petCap: 2}});
  const Cls = createHubSheetClass(FakeActorSheetV2);
  const actor = makeActor({items: ITEMS()});
  await c.addCompanion(actor, 'horse', 'mount'); await c.attachPerk(actor, stored(actor)[0].id, 'saddle');
  const sheet = new Cls({document: actor}); sheet.tab = 'companions';
  let html = await sheet._renderHTML();
  assert.match(html, /Mount <span class="ag-badge">1 \/ 1<\/span>/);
  assert.match(html, /\[TEST\] horse[\s\S]*horse text[\s\S]*\[TEST\] saddle/);
  assert.match(html, /Pets <span class="ag-badge">0 \/ 2<\/span>/);
  assert.match(html, /data-drop-companion="pet"/);
  assert.doesNotMatch(html, /data-drop-companion="mount"/, 'no add zone once a mount exists');
  assert.doesNotMatch(html, /GM Setup|pet-cap-override/);
  sheet.tab = 'gm-setup';
  assert.doesNotMatch(await sheet._renderHTML(), /Pets per character/, 'players fall back to the first tab');
  installGlobals({user: users.gm, actors: [actor], settings: {petCap: 2}});
  const gmSheet = new Cls({document: actor}); gmSheet.tab = 'gm-setup';
  html = await gmSheet._renderHTML();
  assert.match(html, /Pets per character/);
  assert.match(html, /data-edit="pet-cap-override" data-actor="actor1"/);
  installGlobals({user: users.observer, settings: {petCap: 2}});
  const view = new Cls({document: actor}); view.tab = 'companions';
  html = await view._renderHTML();
  assert.doesNotMatch(html, /data-drop-companion/);
  assert.match(html, /data-action="companion-remove"[^>]*disabled/);
});

test('sheet wiring: selects add and attach, GM cap select writes the setting', async () => {
  installGlobals({user: users.gm, settings: {petCap: 2}});
  const Cls = createHubSheetClass(FakeActorSheetV2);
  const actor = makeActor({items: ITEMS()});
  const sheet = new Cls({document: actor});
  await sheet._onHubChange({target: {dataset: {edit: 'companion-add', kind: 'pet'}, value: 'cat'}});
  await sheet._onHubChange({target: {dataset: {edit: 'companion-attach', entry: stored(actor)[0].id}, value: 'collar'}});
  assert.deepEqual(stored(actor)[0], {...stored(actor)[0], itemId: 'cat', perkItemIds: ['collar']});
  await sheet._onHubChange({target: {dataset: {edit: 'pet-cap-override', actor: 'actor1'}, value: 'unlimited'}});
  assert.deepEqual(game.settings.store.petCapOverrides, {actor1: 'unlimited'});
});

test('settings are registered as GM-only world settings with default 0', () => {
  const reg = [];
  c.registerCompanionSettings({register: (...a) => reg.push(a)});
  assert.deepEqual(reg.map(([, key, o]) => [key, o.scope, o.default]), [['petCap', 'world', 0], ['petCapOverrides', 'world', {}]]);
});

test('with the shipped default no pet can be added; a saved world limit is kept', async () => {
  installGlobals();
  const actor = makeActor({items: ITEMS()});
  assert.match((await c.addCompanion(actor, 'cat', 'pet')).error, /can't have pets/);
  assert.equal((await c.addCompanion(actor, 'horse', 'mount')).ok, true, 'one mount is still allowed');
  game.settings.store.petCap = 2;
  assert.equal(c.petCapFor(actor), 2);
  assert.equal((await c.addCompanion(actor, 'cat', 'pet')).ok, true);
});

test('pet slot sources (hook for a later skill tree) add to the limit; none/unlimited still win', async () => {
  installGlobals();
  const actor = makeActor({items: ITEMS()});
  assert.equal(c.registerPetSlotSource('test', a => a.id === 'actor1' ? 1 : 0).ok, true);
  try {
    assert.equal(c.petCapFor(actor), 1);
    game.settings.store.petCapOverrides = {actor1: 2}; assert.equal(c.petCapFor(actor), 3);
    game.settings.store.petCapOverrides = {actor1: 'none'}; assert.equal(c.petCapFor(actor), 0);
    game.settings.store.petCapOverrides = {actor1: 'unlimited'}; assert.equal(c.petCapFor(actor), Infinity);
    c.registerPetSlotSource('broken', () => { throw new Error('x'); });
    game.settings.store.petCapOverrides = {}; assert.equal(c.petCapFor(actor), 1, 'a throwing source grants nothing');
    assert.equal(c.registerPetSlotSource('', () => 1).ok, false);
  } finally { c.unregisterPetSlotSource('test'); c.unregisterPetSlotSource('broken'); }
  assert.equal(c.petCapFor(actor), 0);
});
