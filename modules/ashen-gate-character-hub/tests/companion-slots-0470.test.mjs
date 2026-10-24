/** 0.47.0 Companions: Pet and Mount boxes, linked Actors, one active of each, sockets, migration (mocked Foundry; logic only, not the live UI). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installGlobals, makeActor, makeItem, users, FakeActorSheetV2} from './foundry-mock.mjs';
import * as c from '../scripts/companions.mjs';
import {companionRole, routeForRole, companionStats, keyLabel, changeText, itemGives} from '../scripts/companion-items.mjs';
import {createHubSheetClass, EDITS, ACTIONS, removeCompanionAsk} from '../scripts/sheet.mjs';
import {MODULE_ID} from '../scripts/constants.mjs';

const MGR = 'ashen-gate-manager';
const fx = (name, changes, extra = {}) => ({name, changes, disabled: false, transfer: false, ...extra});
const ITEMS = () => [
  {id: 'saddle', name: '[TEST] Riding Saddle', type: 'equipment', flags: {[MGR]: {source: {sourceId: 'ITEM-MOUNT-TEST-SADDLE'}}}, effects: [fx('Saddle', [{key: 'system.attributes.movement.walk', mode: 2, value: '10'}])]},
  {id: 'barding', name: '[TEST] Leather Barding', type: 'equipment', flags: {[MODULE_ID]: {companion: {role: 'mount-gear', tier: 'Fine'}}}, system: {armor: {value: 11}}, effects: [fx('Barding', [{key: 'system.attributes.ac.bonus', mode: 2, value: '1'}])]},
  {id: 'sure', name: '[TEST] Surefooted', type: 'feat', flags: {[MGR]: {source: {sourceId: 'PERK-MOUNT-TEST-SUREFOOTED'}}}, effects: [fx('Sure', [{key: 'system.attributes.ac.bonus', mode: 2, value: '1'}, {key: 'system.abilities.dex.bonuses.save', mode: 5, value: '2'}])]},
  {id: 'off', name: '[TEST] Unused Charm', type: 'feat', flags: {[MGR]: {source: {sourceId: 'PERK-MOUNT-TEST-OFF'}}}, effects: [fx('Off', [{key: 'system.attributes.ac.bonus', mode: 2, value: '5'}], {disabled: true})]},
  {id: 'hat', name: '[TEST] Tiny Hat', type: 'equipment', flags: {[MGR]: {source: {sourceId: 'ITEM-PET-TEST-HAT'}}}},
  {id: 'boots', name: '[TEST] Paw Boots', type: 'equipment', flags: {[MODULE_ID]: {companion: {role: 'pet-clothing'}}}},
  {id: 'scarf', name: '[TEST] Scarf', type: 'loot'},
  {id: 'bow', name: '[TEST] Bow Tie', type: 'loot'},
  {id: 'loyal', name: '[TEST] Loyal', type: 'feat', flags: {[MGR]: {source: {sourceId: 'PERK-PET-TEST-LOYAL'}}}},
  {id: 'bell', name: '[TEST] Bell', type: 'loot'}, {id: 'rope', name: '[TEST] Rope', type: 'loot'}, {id: 'cloak', name: '[TEST] Cloak', type: 'loot'}, {id: 'shoe', name: '[TEST] Horseshoe', type: 'loot'}
];
function world(id, {perms = {}, type = 'npc'} = {}) {
  return {documentName: 'Actor', id, uuid: `Actor.${id}`, name: `[TEST] ${id}`, img: `${id}.webp`, type, calls: [],
    system: {attributes: {ac: {value: 12}, hp: {value: 19, max: 19}, movement: {speeds: {walk: 60}, units: 'ft'}}},
    testUserPermission: (u, level) => u.isGM || ({NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3}[perms[u.id] ?? 'NONE'] >= {NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3}[level]),
    sheet: {render: o => { renders.push([id, o]); }}};
}
const renders = [];
const shared = {owner: 'OBSERVER', observer: 'OBSERVER'};
const HORSE = () => world('horse', {perms: shared}), PONY = () => world('pony', {perms: shared}), CAT = () => world('cat', {perms: shared}), OWL = () => world('owl', {perms: shared});
function setup({user = users.owner, settings = {}, others = [HORSE(), PONY(), CAT(), OWL()]} = {}) {
  installGlobals({user, settings});
  const map = new Map(others.map(a => [a.uuid, a]));
  globalThis.fromUuidSync = uuid => map.get(uuid) ?? null;
  const actor = makeActor({items: ITEMS()});
  for (const d of ITEMS()) actor.items.get(d.id).effects = d.effects ?? [];
  return {actor, map, get: id => map.get(`Actor.${id}`)};
}
const slots = actor => actor.flags[MODULE_ID]?.companionSlots;

test('roles: Hub flag first, then the permanent id prefix; unmarked items go by type (contract unchanged)', () => {
  const {actor} = setup(), it = id => actor.items.get(id);
  assert.deepEqual(['saddle', 'barding', 'sure', 'hat', 'boots', 'loyal', 'scarf'].map(id => companionRole(it(id))), ['mount-gear', 'mount-gear', 'mount-perk', 'pet-clothing', 'pet-clothing', 'pet-perk', null]);
  assert.deepEqual(routeForRole(it('saddle'), 'mount'), {ok: true, list: 'gear'});
  assert.match(routeForRole(it('saddle'), 'pet').error, /mount gear, not for a pet/);
  assert.deepEqual(routeForRole(it('scarf'), 'pet'), {ok: true, list: 'clothing'});
  assert.deepEqual(routeForRole(it('scarf'), 'mount'), {ok: true, list: 'gear'});
});

test('stats come only from the items\' own effects and armour; disabled skipped; transfer warned', () => {
  const {actor} = setup(), it = id => actor.items.get(id);
  const {lines, warnings} = companionStats([it('saddle'), it('barding'), it('sure'), it('off')], {owner: actor});
  const line = l => lines.find(x => x.label === l);
  assert.equal(line('AC').total, 2); assert.deepEqual(line('Walk speed').parts.map(p => p.text), ['+10']);
  assert.deepEqual(line('Armor AC').parts.map(p => p.text), ['11']);
  assert.ok(!lines.some(l => l.parts.some(p => p.source === '[TEST] Unused Charm')));
  it('saddle').effects[0].transfer = true;
  assert.match(companionStats([it('saddle')], {owner: actor}).warnings[0], /also applies to \[TEST\] Hero/);
  assert.equal(keyLabel('system.custom.thing'), 'system.custom.thing');
  assert.deepEqual([changeText(1, '2'), changeText(4, '15'), changeText(2, '-1')], ['×2', 'at least 15', '−1']);
  assert.equal(itemGives(it('sure')), 'AC +1; Dexterity saves = 2');
});

test('link Actors as mounts and pets: many of each, the newest becomes active, one active per kind', async () => {
  const {actor} = setup();
  assert.equal((await c.addActorCompanion(actor, world('horse', {perms: shared}), 'mount')).ok, true);
  assert.equal((await c.addActorCompanion(actor, world('pony', {perms: shared}), 'mount')).ok, true);
  assert.equal((await c.addActorCompanion(actor, world('cat', {perms: shared}), 'pet')).ok, true);
  assert.equal((await c.addActorCompanion(actor, world('owl', {perms: shared}), 'pet')).ok, true);
  const s = slots(actor);
  assert.deepEqual([s.mounts, s.pets, s.activeMount, s.activePet], [['Actor.horse', 'Actor.pony'], ['Actor.cat', 'Actor.owl'], 'Actor.pony', 'Actor.owl']);
  const b = c.companionBoxes(actor);
  assert.deepEqual([b.mount.active.name, b.mount.others.map(e => e.name)], ['[TEST] pony', ['[TEST] horse']]);
  assert.equal(b.pet.sockets.length, 2); assert.equal(b.mount.sockets.length, 5);
  assert.deepEqual(b.pet.sockets.map(x => x.label), ['Head', 'Body']);
  assert.deepEqual(b.mount.sockets.map(x => x.label), ['Saddle', 'Other 1', 'Other 2', 'Other 3', 'Other 4']);
});

test('link rules: Observer needed, world only, not itself or a backup, no mount-and-pet, unlinked cannot be activated', async () => {
  const secret = world('secret'), packed = Object.assign(world('pk', {perms: shared}), {pack: 'x.y', uuid: 'Compendium.x.y.Actor.pk'});
  const {actor} = setup({others: [secret]});
  assert.match((await c.addActorCompanion(actor, secret, 'pet')).error, /can't see/);
  assert.match((await c.addActorCompanion(actor, packed, 'pet')).error, /Import .* into the world first/);
  assert.match((await c.addActorCompanion(actor, actor, 'pet')).error, /own companion/);
  assert.match((await c.addActorCompanion(actor, makeItem({id: 'i', name: 'i', type: 'loot'}), 'pet')).error, /Drop an Actor/);
  await c.addActorCompanion(actor, world('cat', {perms: shared}), 'pet');
  assert.match((await c.addActorCompanion(actor, world('cat', {perms: shared}), 'mount')).error, /already linked as a pet/);
  assert.match((await c.activateCompanion(actor, 'pet', 'Actor.nope')).error, /not linked/);
  assert.equal((await c.addActorCompanion(actor, secret, 'pet')).ok, false);
  installGlobals({user: users.gm}); // the GM may link any Actor
  assert.equal((await c.addActorCompanion(actor, secret, 'pet')).ok, true);
});

test('swap via activateCompanion; None clears; a swap keeps each companion\'s gear and perks', async () => {
  const {actor} = setup();
  for (const [id, k] of [['horse', 'mount'], ['pony', 'mount']]) await c.addActorCompanion(actor, world(id, {perms: shared}), k);
  assert.equal((await c.activateCompanion(actor, 'mount', 'Actor.horse')).ok, true);
  await c.socketGear(actor, 'mount', 'saddle', 'saddle'); await c.socketGear(actor, 'mount', 'other1', 'barding'); await c.attachPerk(actor, 'mount', 'sure');
  await c.activateCompanion(actor, 'mount', 'Actor.pony');
  let m = c.companionBoxes(actor).mount;
  assert.deepEqual(m.sockets.map(x => x.item), [null, null, null, null, null], 'pony has its own, empty sockets');
  assert.deepEqual(m.perks, []);
  await c.socketGear(actor, 'mount', 'saddle', 'shoe');
  await c.activateCompanion(actor, 'mount', 'Actor.horse');
  m = c.companionBoxes(actor).mount;
  assert.deepEqual(m.sockets.map(x => x.item?.id ?? null), ['saddle', 'barding', null, null, null], 'switching back shows the gear still there');
  assert.deepEqual(m.perks.map(p => p.id), ['sure']);
  assert.equal(slots(actor).gear.pony.saddle, 'shoe');
  await c.activateCompanion(actor, 'mount', null);
  assert.equal(slots(actor).activeMount, null);
  assert.deepEqual(slots(actor).gear.horse, {saddle: 'saddle', other1: 'barding'}, 'clearing the active one keeps the gear');
});

test('sockets: one item per socket, one socket per item, right kind only, nothing without an active companion', async () => {
  const {actor} = setup();
  assert.match((await c.socketGear(actor, 'pet', 'head', 'hat')).error, /Choose a pet first/);
  await c.addActorCompanion(actor, world('cat', {perms: shared}), 'pet'); await c.addActorCompanion(actor, world('horse', {perms: shared}), 'mount');
  assert.equal((await c.socketGear(actor, 'pet', 'head', 'hat')).ok, true);
  assert.match((await c.socketGear(actor, 'pet', 'body', 'hat')).error, /already in a Head socket/, 'an item sits in one socket');
  assert.match((await c.socketGear(actor, 'pet', 'head', 'boots')).error, /Head socket is taken by \[TEST\] Tiny Hat/);
  assert.match((await c.socketGear(actor, 'pet', 'tail', 'boots')).error, /no tail socket/);
  assert.match((await c.socketGear(actor, 'pet', 'body', 'saddle')).error, /mount gear, not for a pet/);
  assert.match((await c.socketGear(actor, 'mount', 'saddle', 'hat')).error, /pet clothing, not for a mount/);
  assert.match((await c.socketGear(actor, 'pet', 'body', 'loyal')).error, /cannot go in a socket|not pet clothing/);
  assert.match((await c.socketGear(actor, 'pet', 'body', 'ghost')).error, /not on this character/);
  assert.equal((await c.socketGear(actor, 'pet', 'body', 'scarf')).ok, true, 'unmarked gear fits any socket (the data names no slot)');
  assert.equal((await c.socketGear(actor, 'mount', 'other4', 'bow')).ok, true);
  await c.activateCompanion(actor, 'pet', 'Actor.cat');
  assert.match((await c.socketGear(actor, 'mount', 'other1', 'hat')).error, /pet clothing/);
  // gear used on another companion cannot be reused
  await c.addActorCompanion(actor, world('owl', {perms: shared}), 'pet');
  assert.match((await c.socketGear(actor, 'pet', 'head', 'hat')).error, /already in a Head socket of another companion/);
  // clear
  await c.activateCompanion(actor, 'pet', 'Actor.cat');
  assert.equal((await c.clearSocket(actor, 'pet', 'head')).ok, true);
  assert.equal(slots(actor).gear.cat.head, undefined); assert.equal(slots(actor).gear.cat.body, 'scarf');
  assert.equal((await c.socketGear(actor, 'pet', 'head', 'hat')).ok, true, 'free again');
  assert.equal(c.companionBoxes(actor).pet.sockets[0].item.id, 'hat');
});

test('every socket of a mount can be filled; a sixth item finds no free socket', async () => {
  const {actor} = setup();
  await c.addActorCompanion(actor, world('horse', {perms: shared}), 'mount');
  for (const id of ['saddle', 'barding', 'scarf', 'bow', 'bell']) assert.equal((await c.socketDroppedGear(actor, 'mount', null, actor.items.get(id))).ok, true, id);
  assert.deepEqual(Object.keys(slots(actor).gear.horse), ['saddle', 'other1', 'other2', 'other3', 'other4']);
  assert.match((await c.socketDroppedGear(actor, 'mount', null, actor.items.get('rope'))).error, /No free mount socket/);
  assert.equal(actor.calls.filter(x => x[0] === 'createEmbedded').length, 0, 'items already on the character are not copied');
});

test('perks: attach, detach, wrong kind refused, only for the active companion', async () => {
  const {actor} = setup();
  assert.match((await c.attachPerk(actor, 'mount', 'sure')).error, /Choose a mount first/);
  await c.addActorCompanion(actor, world('horse', {perms: shared}), 'mount'); await c.addActorCompanion(actor, world('cat', {perms: shared}), 'pet');
  assert.equal((await c.attachPerk(actor, 'mount', 'sure')).ok, true);
  assert.match((await c.attachPerk(actor, 'pet', 'sure')).error, /mount perk, not for a pet/);
  assert.match((await c.attachPerk(actor, 'mount', 'sure')).error, /already on a companion/);
  assert.equal((await c.attachPerk(actor, 'pet', 'loyal')).ok, true);
  assert.equal((await c.detachPerk(actor, 'mount', 'sure')).ok, true);
  assert.equal(slots(actor).perks.horse, undefined); assert.deepEqual(slots(actor).perks.cat, ['loyal']);
});

test('drops on a box: Actor links, perk goes to the perk list, gear to the first free socket, other-kind items refused', async () => {
  const {actor} = setup();
  assert.match((await c.dropOnBox(actor, 'pet', actor.items.get('hat'))).error, /Choose a pet first/);
  assert.equal((await c.dropOnBox(actor, 'pet', world('cat', {perms: shared}))).ok, true);
  assert.equal((await c.dropOnBox(actor, 'pet', actor.items.get('hat'))).ok, true);
  assert.equal(slots(actor).gear.cat.head, 'hat');
  assert.equal((await c.dropOnBox(actor, 'pet', actor.items.get('loyal'))).ok, true);
  assert.deepEqual(slots(actor).perks.cat, ['loyal']);
  assert.match((await c.dropOnBox(actor, 'pet', actor.items.get('saddle'))).error, /mount gear, not for a pet/);
  assert.match((await c.dropOnBox(actor, 'pet', {documentName: 'JournalEntry'})).error, /Actor or an item/);
});

test('removing a companion forgets its sockets (items stay); the Actor is untouched', async () => {
  const {actor} = setup(), cat = world('cat', {perms: shared});
  await c.addActorCompanion(actor, cat, 'pet'); await c.socketGear(actor, 'pet', 'head', 'hat');
  assert.equal((await c.removeCompanion(actor, 'pet', 'Actor.cat')).ok, true);
  assert.deepEqual([slots(actor).pets, slots(actor).activePet, slots(actor).gear], [[], null, {}]);
  assert.ok(actor.items.get('hat'), 'the item stays'); assert.equal(cat.calls.length, 0);
  assert.match((await c.removeCompanion(actor, 'pet', 'Actor.cat')).error, /no longer listed/);
});

test('deleted gear frees its socket; a missing or unshared Actor stays listed and shows nothing', async () => {
  const hidden = world('cat', {perms: {}}), {actor} = setup({others: [hidden]});
  installGlobals({user: users.gm}); await c.addActorCompanion(actor, hidden, 'pet'); await c.socketGear(actor, 'pet', 'head', 'hat');
  actor.items.splice(actor.items.findIndex(i => i.id === 'hat'), 1);
  assert.equal(c.companionBoxes(actor).pet.sockets[0].item, null);
  await c.socketGear(actor, 'pet', 'body', 'scarf'); assert.equal(slots(actor).gear.cat.head, undefined, 'dead ids are pruned on the next write');
  installGlobals({user: users.owner});
  const e = c.companionBoxes(actor).pet.active;
  assert.deepEqual([e.denied, e.actor, e.name], [true, null, 'Companion (not shared)']);
  globalThis.fromUuidSync = () => null;
  assert.deepEqual([c.companionBoxes(actor).pet.active.missing, c.companionBoxes(actor).pet.active.name], [true, 'Missing companion']);
});

test('migration: Actor entries become the new flag (first mount / first pet active, gear in order); old flag untouched; re-run is a no-op', async () => {
  const {actor} = setup({user: users.gm});
  const old = [
    {id: 'a', kind: 'mount', actorUuid: 'Actor.horse', name: 'Thunder', perkItemIds: ['sure'], gearItemIds: ['saddle', 'barding', 'scarf', 'bow', 'bell', 'rope'], clothing: []},
    {id: 'b', kind: 'mount', actorUuid: 'Actor.pony', perkItemIds: [], gearItemIds: ['shoe'], clothing: []},
    {id: 'c', kind: 'pet', actorUuid: 'Actor.cat', perkItemIds: ['loyal'], gearItemIds: [], clothing: ['hat', null, 'boots']},
    {id: 'd', kind: 'pet', actorUuid: 'Actor.owl', perkItemIds: [], gearItemIds: [], clothing: []},
    {id: 'e', kind: 'pet', itemId: 'cloak', perkItemIds: [], gearItemIds: [], clothing: []}
  ];
  actor.flags[MODULE_ID] = {companions: structuredClone(old)};
  const before = JSON.stringify(actor.flags[MODULE_ID].companions);
  // reading derives it in memory without writing
  assert.equal(c.companionBoxes(actor).mount.active.name, '[TEST] horse'); assert.equal(actor.calls.length, 0);
  assert.deepEqual(await c.migrateCompanionSlots(actor), {ok: true, migrated: true});
  const s = slots(actor);
  assert.deepEqual([s.version, s.activeMount, s.activePet, s.mounts, s.pets], [1, 'Actor.horse', 'Actor.cat', ['Actor.horse', 'Actor.pony'], ['Actor.cat', 'Actor.owl']]);
  assert.deepEqual(s.gear.horse, {saddle: 'saddle', other1: 'barding', other2: 'scarf', other3: 'bow', other4: 'bell'}, 'a sixth gear item has no socket and stays loose');
  assert.deepEqual(s.gear.pony, {saddle: 'shoe'});
  assert.deepEqual(s.gear.cat, {head: 'hat', body: 'boots'});
  assert.deepEqual([s.perks.horse, s.perks.cat], [['sure'], ['loyal']]);
  assert.equal(JSON.stringify(actor.flags[MODULE_ID].companions), before, 'old flag untouched');
  const calls = actor.calls.length;
  assert.deepEqual(await c.migrateCompanionSlots(actor), {ok: true, migrated: false});
  assert.equal(actor.calls.length, calls, 'second run writes nothing');
  assert.deepEqual(c.legacyItemCompanions(actor).map(e => [e.kind, e.item.id]), [['pet', 'cloak']], 'the Item companion is kept, read only');
  // reading prefers the new flag over later edits to the old one
  actor.flags[MODULE_ID].companions = [];
  assert.equal(c.companionBoxes(actor).mount.active.name, '[TEST] horse');
});

test('migration of every character: GM only, skips characters without the old list and level backups', async () => {
  const {actor} = setup({user: users.gm});
  actor.flags[MODULE_ID] = {companions: [{id: 'a', kind: 'pet', actorUuid: 'Actor.cat', perkItemIds: [], gearItemIds: [], clothing: []}]};
  const plain = makeActor(); plain.id = 'p2'; const backup = makeActor(); backup.id = 'bk'; backup.flags[MODULE_ID] = {levelBackup: {sourceId: 'actor1', levelBefore: 2}, companions: actor.flags[MODULE_ID].companions};
  assert.deepEqual(await c.migrateAllCompanionSlots([actor, plain, backup]), {ok: true, migrated: 1});
  assert.deepEqual([plain.calls.length, backup.calls.length], [0, 0]);
  assert.deepEqual(await c.migrateAllCompanionSlots([actor, plain, backup]), {ok: true, migrated: 0}, 're-runnable');
  installGlobals({user: users.owner});
  assert.equal((await c.migrateAllCompanionSlots([plain])).ok, false);
});

test('first write after an unmigrated read persists the derived data (no loss)', async () => {
  const {actor} = setup();
  actor.flags[MODULE_ID] = {companions: [{id: 'a', kind: 'pet', actorUuid: 'Actor.cat', perkItemIds: [], gearItemIds: [], clothing: ['hat']}]};
  await c.socketGear(actor, 'pet', 'body', 'scarf');
  assert.deepEqual(slots(actor).gear.cat, {head: 'hat', body: 'scarf'});
});

test('permissions are enforced in the data layer: observers, hidden part, backups; GM and owners allowed', async () => {
  const {actor} = setup({user: users.observer});
  const cat = world('cat', {perms: shared});
  for (const r of [await c.addActorCompanion(actor, cat, 'pet'), await c.activateCompanion(actor, 'pet', null), await c.socketGear(actor, 'pet', 'head', 'hat'),
    await c.socketDroppedGear(actor, 'pet', 'head', actor.items.get('hat')), await c.clearSocket(actor, 'pet', 'head'), await c.attachPerk(actor, 'pet', 'loyal'),
    await c.detachPerk(actor, 'pet', 'loyal'), await c.removeCompanion(actor, 'pet', 'Actor.cat'), await c.dropOnBox(actor, 'pet', cat)]) assert.match(r.error, /don't own/);
  assert.deepEqual(actor.calls, []);
  installGlobals({user: users.owner, settings: {playerVisibility: {companions: false}}});
  assert.match((await c.addActorCompanion(actor, cat, 'pet')).error, /hasn't shared/);
  assert.match((await c.socketGear(actor, 'pet', 'head', 'hat')).error, /hasn't shared/);
  assert.deepEqual(actor.calls, []);
  installGlobals({user: users.gm, settings: {playerVisibility: {companions: false}}});
  assert.equal((await c.addActorCompanion(actor, cat, 'pet')).ok, true, 'the GM is never blocked');
  const backup = Object.assign(makeActor(), {flags: {[MODULE_ID]: {levelBackup: {sourceId: 'x', levelBefore: 1}}}});
  assert.equal((await c.activateCompanion(backup, 'pet', null)).error, 'That is a level backup copy, not a playable character.');
});

test('API compatibility: companionsData shape, petCapFor is unlimited, registerPetSlotSource is a harmless no-op, settings untouched', async () => {
  const {actor} = setup({settings: {petCap: 2, petCapOverrides: {actor1: 'none'}}});
  await c.addActorCompanion(actor, world('horse', {perms: shared}), 'mount'); await c.addActorCompanion(actor, world('cat', {perms: shared}), 'pet'); await c.addActorCompanion(actor, world('owl', {perms: shared}), 'pet');
  await c.attachPerk(actor, 'mount', 'sure');
  const d = c.companionsData(actor);
  assert.equal(d.mount.actorUuid, 'Actor.horse'); assert.deepEqual(d.mount.perkItemIds, ['sure']);
  assert.deepEqual(d.pets.map(p => [p.actorUuid, p.active]), [['Actor.cat', false], ['Actor.owl', true]]);
  assert.equal(c.petCapFor(actor), Infinity); assert.equal(d.cap, Infinity);
  assert.deepEqual(c.registerPetSlotSource('skill-tree', () => 5), {ok: true}); assert.equal(c.petCapFor(actor), Infinity); assert.equal(c.unregisterPetSlotSource('skill-tree'), false);
  assert.equal(c.registerPetSlotSource('', null).ok, false);
  assert.deepEqual([game.settings.store.petCap, game.settings.store.petCapOverrides], [2, {actor1: 'none'}]);
  const registered = []; c.registerCompanionSettings({register: (m, k, o) => registered.push([k, o.config])});
  assert.deepEqual(registered, [['petCap', false], ['petCapOverrides', false]], 'kept, hidden');
});

test('Companions tab: two boxes (mount first, larger), art, name, stats strip, dropdown, sockets, no raw ids', async () => {
  const horse = world('horse', {perms: shared}), pony = world('pony', {perms: shared}), cat = world('cat', {perms: shared});
  const {actor} = setup({others: [horse, pony, cat, OWL()]});
  await c.addActorCompanion(actor, horse, 'mount'); await c.addActorCompanion(actor, pony, 'mount'); await c.addActorCompanion(actor, cat, 'pet');
  await c.activateCompanion(actor, 'mount', 'Actor.horse');
  await c.socketGear(actor, 'mount', 'saddle', 'barding'); await c.attachPerk(actor, 'mount', 'sure'); await c.socketGear(actor, 'pet', 'head', 'hat');
  const sheet = new (createHubSheetClass(FakeActorSheetV2))({document: actor}); sheet.tab = 'companions';
  const html = await sheet._renderHTML();
  assert.ok(html.indexOf('agch-cbox--mount') < html.indexOf('agch-cbox--pet'), 'mount first (stacks first on a narrow window)');
  assert.equal((html.match(/<section class="ag-card agch-cbox /g) ?? []).length, 2, 'exactly two boxes');
  assert.match(html, /agch-companion__art agch-companion__art--small"><img src="horse.webp"/);
  assert.match(html, /agch-cbox__name">\[TEST\] horse</);
  assert.match(html, /agch-cbox__stats">[\s\S]*AC<\/span> 12[\s\S]*HP<\/span> 19 \/ 19[\s\S]*Speed<\/span> 60 ft/);
  assert.match(html, /data-edit="companion-active" data-kind="mount"[^>]*>[\s\S]*<option value="Actor.horse" selected>\[TEST\] horse<\/option><option value="Actor.pony">\[TEST\] pony<\/option>/, 'swap list holds the other mount');
  assert.equal((html.match(/class="agch-socketbox /g) ?? []).length, 7, '5 + 2 sockets');
  assert.match(html, /Saddle<\/span>[\s\S]*\[TEST\] Leather Barding \(Fine\)[\s\S]*AC \+1|Armor AC 11/, 'tier shown with the name; each bonus listed on the row');
  assert.match(html, /aria-label="Add gear to the Other 1 socket"/, 'keyboard route for empty sockets');
  assert.match(html, /data-drop-companion="box" data-kind="mount"[\s\S]*data-drop-companion="socket" data-kind="mount" data-socket="saddle"/);
  assert.match(html, /<dt>AC<\/dt><dd><strong>\+2<\/strong>/, 'stats box: gear and perk bonuses');
  assert.match(html, /data-action="companion-open"[^>]*data-uuid="Actor.horse"/);
  const visible = html.replace(/<[^>]+>/g, ' ');
  assert.doesNotMatch(visible, /Actor\.horse|ITEM-|PERK-|companionSlots/, 'no raw ids in the visible text');
  await EDITS['companion-active'](sheet, {dataset: {kind: 'mount'}, value: 'Actor.pony'});
  assert.equal(slots(actor).activeMount, 'Actor.pony');
  await ACTIONS['companion-open'](sheet, {dataset: {uuid: 'Actor.pony'}});
  assert.deepEqual(renders.at(-1), ['pony', {force: true}]);
  await EDITS['companion-gear'](sheet, {dataset: {kind: 'mount', socket: 'saddle'}, value: 'shoe'});
  assert.equal(slots(actor).gear.pony.saddle, 'shoe');
  await ACTIONS['companion-unsocket'](sheet, {dataset: {kind: 'mount', socket: 'saddle'}});
  assert.equal(slots(actor).gear.pony, undefined);
  assert.equal((await removeCompanionAsk(sheet, 'mount', 'Actor.pony', async () => true)).ok, true);
  assert.deepEqual(slots(actor).mounts, ['Actor.horse']);
});

test('Companions tab empty states, observer view, not-shared Actor, older companions fold', async () => {
  const {actor} = setup();
  const sheet = new (createHubSheetClass(FakeActorSheetV2))({document: actor}); sheet.tab = 'companions';
  let html = await sheet._renderHTML();
  assert.match(html, /Drop a pet Actor here or choose one\./); assert.match(html, /Drop a mount Actor here or choose one\./);
  assert.match(html, /Find a pet Actor by name/);
  actor.flags[MODULE_ID] = {companions: [{id: 'e', kind: 'pet', itemId: 'cloak', name: 'Old Cloak', perkItemIds: [], gearItemIds: [], clothing: []}]};
  html = await sheet._renderHTML();
  assert.match(html, /Older companions[\s\S]*Old Cloak/); assert.match(html, /not deleted/);
  // observer: no drop zones, selects disabled
  await c.addActorCompanion(actor, world('cat', {perms: shared}), 'pet');
  installGlobals({user: users.observer}); globalThis.fromUuidSync = u => u === 'Actor.cat' ? world('cat', {perms: shared}) : null;
  const obs = new (createHubSheetClass(FakeActorSheetV2))({document: actor}); obs.tab = 'companions';
  const oh = await obs._renderHTML();
  assert.doesNotMatch(oh, /data-drop-companion/); assert.match(oh, /data-edit="companion-active"[^>]*disabled/);
  // not shared any more: nothing from the Actor shows
  globalThis.fromUuidSync = u => u === 'Actor.cat' ? world('cat', {perms: {}}) : null;
  const dh = await obs._renderHTML();
  assert.match(dh, /not shared with you any more/); assert.doesNotMatch(dh, /cat\.webp|agch-cbox__stats|Open sheet/);
});

test('no deprecated Foundry accessors in the new code', () => {
  for (const f of ['companions.mjs', 'companion-views.mjs']) {
    const src = fs.readFileSync(new URL(`../scripts/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /\b(getFlag|setFlag|renderTemplate|mergeObject|new Dialog\(|\.entity\b|game\.data\b|TextEditor\.enrich)/, f);
  }
});
