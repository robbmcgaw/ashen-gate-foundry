/** 0.48.0 Companions: Mount box and up to three Pet boxes, slot-classified gear, v2 data and migration, pet slot settings, labels (mocked Foundry; logic only, not the live UI). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installGlobals, makeActor, makeItem, users, FakeActorSheetV2} from './foundry-mock.mjs';
import * as c from '../scripts/companions.mjs';
import {companionSlot, companionRole, routeForRole, companionStats, keyLabel, changeText, itemGives} from '../scripts/companion-items.mjs';
import {createHubSheetClass, EDITS, ACTIONS, removeCompanionAsk} from '../scripts/sheet.mjs';
import {MODULE_ID} from '../scripts/constants.mjs';
import {gmSetupTab} from '../scripts/companion-views.mjs';

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
  {id: 'sadl', name: '[TEST] Classified Saddle', type: 'equipment', flags: {[MODULE_ID]: {companion: {role: 'mount-gear', slot: 'saddle'}}}},
  {id: 'tackA', name: '[TEST] Classified Tack A', type: 'loot', flags: {[MODULE_ID]: {companion: {role: 'mount-gear', slot: 'tack'}}}},
  {id: 'tackB', name: '[TEST] Classified Tack B', type: 'loot', flags: {[MODULE_ID]: {companion: {role: 'mount-gear', slot: 'tack'}}}},
  {id: 'hatH', name: '[TEST] Classified Hat', type: 'equipment', flags: {[MODULE_ID]: {companion: {role: 'pet-clothing', slot: 'head'}}}},
  {id: 'hatH2', name: '[TEST] Second Hat', type: 'equipment', flags: {[MODULE_ID]: {companion: {role: 'pet-clothing', slot: 'head'}}}},
  {id: 'vest', name: '[TEST] Classified Vest', type: 'equipment', flags: {[MODULE_ID]: {companion: {role: 'pet-clothing', slot: 'body'}}}},
  {id: 'oddA', name: '[TEST] Mismatched Slot', type: 'loot', flags: {[MODULE_ID]: {companion: {role: 'mount-gear', slot: 'head'}}}},
  {id: 'oddB', name: '[TEST] Unmarked With Slot', type: 'loot', flags: {[MODULE_ID]: {companion: {slot: 'saddle'}}}},
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
  assert.deepEqual([s.mounts, s.pets, s.activeMount, s.activePets], [['Actor.horse', 'Actor.pony'], ['Actor.cat', 'Actor.owl'], 'Actor.pony', ['Actor.cat', 'Actor.owl', null]]);
  const b = c.companionBoxes(actor);
  assert.deepEqual([b.mount.active.name, b.mount.others.map(e => e.name)], ['[TEST] pony', ['[TEST] horse']]);
  assert.equal(b.pets.length, 3); assert.equal(b.pets[0].sockets.length, 2); assert.equal(b.mount.sockets.length, 5);
  assert.deepEqual(b.pets[0].sockets.map(x => x.label), ['Head', 'Body']);
  assert.deepEqual(b.mount.sockets.map(x => x.label), ['Saddle', 'Tack', 'Tack', 'Tack', 'Tack']);
  assert.deepEqual(b.mount.sockets.map(x => x.key), ['saddle', 'tack1', 'tack2', 'tack3', 'tack4']);
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
  await c.socketGear(actor, 'mount', 'saddle', 'saddle'); await c.socketGear(actor, 'mount', 'tack1', 'barding'); await c.attachPerk(actor, 'mount', 'sure');
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
  assert.deepEqual(slots(actor).gear.horse, {saddle: 'saddle', tack1: 'barding'}, 'clearing the active one keeps the gear');
});

test('sockets: one item per socket, one socket per item, right kind only, nothing without an active companion', async () => {
  const {actor} = setup();
  assert.match((await c.socketGear(actor, 'pet', 'head', 'hat')).error, /Choose a pet for pet box 1 first/);
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
  assert.equal((await c.socketGear(actor, 'mount', 'tack4', 'bow')).ok, true);
  await c.activateCompanion(actor, 'pet', 'Actor.cat');
  assert.match((await c.socketGear(actor, 'mount', 'tack1', 'hat')).error, /pet clothing/);
  // gear used on another companion cannot be reused
  await c.addActorCompanion(actor, world('owl', {perms: shared}), 'pet');
  assert.match((await c.socketGear(actor, 'pet', 'head', 'hat', 1)).error, /already in a Head socket of another companion/);
  // clear
  assert.equal((await c.clearSocket(actor, 'pet', 'head')).ok, true);
  assert.equal(slots(actor).gear.cat.head, undefined); assert.equal(slots(actor).gear.cat.body, 'scarf');
  assert.equal((await c.socketGear(actor, 'pet', 'head', 'hat')).ok, true, 'free again');
  assert.equal(c.companionBoxes(actor).pet.sockets[0].item.id, 'hat');
});

test('every socket of a mount can be filled; a sixth item finds no free socket', async () => {
  const {actor} = setup();
  await c.addActorCompanion(actor, world('horse', {perms: shared}), 'mount');
  for (const id of ['saddle', 'barding', 'scarf', 'bow', 'bell']) assert.equal((await c.socketDroppedGear(actor, 'mount', null, actor.items.get(id))).ok, true, id);
  assert.deepEqual(Object.keys(slots(actor).gear.horse), ['saddle', 'tack1', 'tack2', 'tack3', 'tack4']);
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
  assert.deepEqual([slots(actor).pets, slots(actor).activePets, slots(actor).gear], [[], [null, null, null], {}]);
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
  assert.equal(c.companionBoxes(actor).mount.active.name, 'Thunder', 'the name typed before 0.47.0 shows'); assert.equal(actor.calls.length, 0);
  assert.deepEqual(await c.migrateCompanionSlots(actor), {ok: true, migrated: true});
  const s = slots(actor);
  assert.deepEqual([s.version, s.activeMount, s.activePets, s.mounts, s.pets], [2, 'Actor.horse', ['Actor.cat', null, null], ['Actor.horse', 'Actor.pony'], ['Actor.cat', 'Actor.owl']]);
  assert.deepEqual(s.gear.horse, {saddle: 'saddle', tack1: 'barding', tack2: 'scarf', tack3: 'bow', tack4: 'bell'}, 'a sixth gear item has no socket and stays loose');
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
  assert.equal(c.companionBoxes(actor).mount.active.name, 'Thunder');
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
  assert.deepEqual(d.pets.map(p => [p.actorUuid, p.active]), [['Actor.cat', true], ['Actor.owl', true]]);
  assert.equal(c.petCapFor(actor), Infinity); assert.equal(d.petCap, 3); assert.equal(c.petSlotsFor(actor), 3);
  assert.deepEqual(c.registerPetSlotSource('skill-tree', () => 5), {ok: true}); assert.equal(c.petSlotsFor(actor), 3, 'extras are clamped to 3'); assert.equal(c.unregisterPetSlotSource('skill-tree'), true); assert.equal(c.unregisterPetSlotSource('skill-tree'), false);
  assert.equal(c.registerPetSlotSource('', null).ok, false);
  assert.deepEqual([game.settings.store.petCap, game.settings.store.petCapOverrides], [2, {actor1: 'none'}]);
  const registered = []; c.registerCompanionSettings({register: (m, k, o) => registered.push([k, o.config])});
  assert.deepEqual(registered, [['petCap', false], ['petCapOverrides', false], ['petSlots', false], ['petSlotOverrides', false]], 'old keys kept, new keys added, all hidden');
});

test('Companions tab: mount box and three pet boxes (mount first, larger), art, name, stats strip, dropdown, sockets, no raw ids', async () => {
  const horse = world('horse', {perms: shared}), pony = world('pony', {perms: shared}), cat = world('cat', {perms: shared});
  const {actor} = setup({others: [horse, pony, cat, OWL()]});
  await c.addActorCompanion(actor, horse, 'mount'); await c.addActorCompanion(actor, pony, 'mount'); await c.addActorCompanion(actor, cat, 'pet');
  await c.activateCompanion(actor, 'mount', 'Actor.horse');
  await c.socketGear(actor, 'mount', 'saddle', 'barding'); await c.attachPerk(actor, 'mount', 'sure'); await c.socketGear(actor, 'pet', 'head', 'hat');
  const sheet = new (createHubSheetClass(FakeActorSheetV2))({document: actor}); sheet.tab = 'companions';
  const html = await sheet._renderHTML();
  assert.ok(html.indexOf('agch-cbox--mount') < html.indexOf('agch-cbox--pet'), 'mount first (stacks first on a narrow window)');
  assert.equal((html.match(/<section class="ag-card agch-cbox /g) ?? []).length, 4, 'mount + three pet boxes');
  assert.match(html, /agch-companion__art agch-companion__art--small"><img src="horse.webp"/);
  assert.match(html, /agch-cbox__name">\[TEST\] horse</);
  assert.match(html, /agch-cbox__stats">[\s\S]*AC<\/span> 12[\s\S]*HP<\/span> 19 \/ 19[\s\S]*Speed<\/span> 60 ft/);
  assert.match(html, /data-edit="companion-active" data-kind="mount"[^>]*>[\s\S]*<option value="Actor.horse" selected>\[TEST\] horse \(Mount\)<\/option><option value="Actor.pony">\[TEST\] pony \(Mount\)<\/option>/, 'swap list holds the other mount');
  assert.equal((html.match(/class="agch-socketbox /g) ?? []).length, 7, '5 + 2 sockets');
  assert.match(html, /Saddle<\/span>[\s\S]*\[TEST\] Leather Barding \(Fine\)[\s\S]*AC \+1|Armor AC 11/, 'tier shown with the name; each bonus listed on the row');
  assert.match(html, /aria-label="Add gear to the Tack 1 socket"/, 'keyboard route for empty sockets');
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

// ---------- 0.48.0: slot classification ----------

test('slot flag: valid only with its matching role; mismatched or unmarked slots are ignored (unclassified)', () => {
  const {actor} = setup(), it = id => actor.items.get(id);
  assert.deepEqual(['sadl', 'tackA', 'hatH', 'vest', 'saddle', 'hat', 'oddA', 'oddB', 'scarf'].map(id => companionSlot(it(id))), ['saddle', 'tack', 'head', 'body', null, null, null, null, null]);
});

test('fit rules: classified gear only in its socket type; unclassified gear in any socket of its kind; wrong socket refused in plain words', async () => {
  const {actor} = setup();
  await c.addActorCompanion(actor, world('horse', {perms: shared}), 'mount'); await c.addActorCompanion(actor, world('cat', {perms: shared}), 'pet');
  assert.match((await c.socketGear(actor, 'mount', 'tack1', 'sadl')).error, /Classified Saddle is a Saddle item, so it can't go in a Tack socket\. Try a Saddle socket\./);
  assert.match((await c.socketGear(actor, 'mount', 'saddle', 'tackA')).error, /is a Tack item, so it can't go in a Saddle socket/);
  assert.match((await c.socketGear(actor, 'pet', 'body', 'hatH')).error, /is a Head item, so it can't go in a Body socket/);
  assert.match((await c.socketGear(actor, 'pet', 'head', 'vest')).error, /is a Body item/);
  assert.equal((await c.socketGear(actor, 'mount', 'saddle', 'sadl')).ok, true);
  assert.equal((await c.socketGear(actor, 'mount', 'tack3', 'tackA')).ok, true);
  assert.equal((await c.socketGear(actor, 'pet', 'head', 'hatH')).ok, true);
  assert.equal((await c.socketGear(actor, 'pet', 'body', 'vest')).ok, true);
  // unclassified (older data) keeps today's behaviour, including a mismatched slot flag and a slot without a role
  assert.equal((await c.socketGear(actor, 'mount', 'tack1', 'oddA')).ok, true);
  assert.equal((await c.socketGear(actor, 'mount', 'tack2', 'oddB')).ok, true);
  assert.equal((await c.clearSocket(actor, 'mount', 'saddle')).ok, true);
  assert.equal((await c.socketGear(actor, 'mount', 'saddle', 'barding')).ok, true, 'unclassified fits the Saddle too');
  // kind still enforced
  assert.match((await c.socketGear(actor, 'pet', 'head', 'sadl')).error, /mount gear, not for a pet/);
});

test('dropped on the box: first free socket of its type; classified items skip other types; none free is explained', async () => {
  const {actor} = setup();
  await c.addActorCompanion(actor, world('horse', {perms: shared}), 'mount'); await c.addActorCompanion(actor, world('cat', {perms: shared}), 'pet');
  await c.dropOnBox(actor, 'mount', actor.items.get('saddle'));   // unclassified takes the Saddle (first free)
  assert.equal((await c.dropOnBox(actor, 'mount', actor.items.get('sadl'))).error.includes('No free Saddle socket for'), true, 'the one Saddle is taken');
  assert.equal((await c.dropOnBox(actor, 'mount', actor.items.get('tackA'))).ok, true);
  assert.deepEqual(slots(actor).gear.horse, {saddle: 'saddle', tack1: 'tackA'});
  assert.equal((await c.dropOnBox(actor, 'pet', actor.items.get('vest'))).ok, true);
  assert.deepEqual(slots(actor).gear.cat, {body: 'vest'}, 'a Body item skips Head');
  assert.equal((await c.dropOnBox(actor, 'pet', actor.items.get('hatH'))).ok, true);
  assert.match((await c.dropOnBox(actor, 'pet', actor.items.get('hatH2'))).error, /No free Head socket for \[TEST\] Second Hat/);
  assert.match((await c.socketDroppedGear(actor, 'pet', 'body', actor.items.get('hatH2'), 0)).error, /Head item, so it can't go in a Body socket/);
});

test('gear choices for a socket list only items that fit it', async () => {
  const {actor} = setup();
  const names = (kind, key) => c.gearChoices(actor, kind, c.SOCKETS[kind].find(x => x.key === key)).map(x => x.item.id);
  assert.ok(names('mount', 'saddle').includes('sadl') && !names('mount', 'saddle').includes('tackA') && names('mount', 'saddle').includes('barding'));
  assert.ok(names('mount', 'tack1').includes('tackA') && !names('mount', 'tack1').includes('sadl'));
  assert.ok(names('pet', 'head').includes('hatH') && !names('pet', 'head').includes('vest') && names('pet', 'head').includes('scarf'));
});

// ---------- 0.48.0: three pets ----------

const linked = async (actor, ...ids) => { for (const id of ids) await c.addActorCompanion(actor, world(id, {perms: shared}), 'pet'); };

test('up to three pets are active at once; no pet is active in two boxes; a fourth is linked but not active', async () => {
  const {actor} = setup({others: [CAT(), OWL(), world('fox', {perms: shared}), world('rat', {perms: shared})]});
  await linked(actor, 'cat', 'owl', 'fox');
  assert.deepEqual(slots(actor).activePets, ['Actor.cat', 'Actor.owl', 'Actor.fox']);
  const r = await c.addActorCompanion(actor, world('rat', {perms: shared}), 'pet');
  assert.deepEqual([r.ok, r.activated], [true, false]);
  assert.deepEqual([slots(actor).pets.length, slots(actor).activePets], [4, ['Actor.cat', 'Actor.owl', 'Actor.fox']]);
  assert.match((await c.activateCompanion(actor, 'pet', 'Actor.cat', 1)).error, /already active in pet box 1/);
  assert.equal((await c.activateCompanion(actor, 'pet', 'Actor.rat', 2)).ok, true, 'swapping a box replaces its pet');
  assert.deepEqual(slots(actor).activePets, ['Actor.cat', 'Actor.owl', 'Actor.rat']);
  assert.match((await c.activateCompanion(actor, 'pet', 'Actor.rat', 3)).error, /no pet box 4/);
  const b = c.companionBoxes(actor);
  assert.deepEqual(b.pets.map(x => x.active.name), ['[TEST] cat', '[TEST] owl', '[TEST] rat']);
  assert.deepEqual(b.pets.map(x => x.others.map(e => e.name)), [['[TEST] fox'], ['[TEST] fox'], ['[TEST] fox']], 'dropdowns list linked pets not active in any box');
  assert.equal((await c.activateCompanion(actor, 'pet', null, 1)).ok, true);
  assert.equal(c.companionBoxes(actor).pets[0].others.length, 2, 'a cleared box frees its pet');
  assert.equal(slots(actor).pets.includes('Actor.owl'), true, 'clearing keeps the link');
});

test('each pet box has its own Head and Body; gear stays with its pet; a drop goes to the box it landed on', async () => {
  const {actor} = setup();
  await linked(actor, 'cat', 'owl');
  assert.equal((await c.socketGear(actor, 'pet', 'head', 'hatH', 0)).ok, true);
  assert.equal((await c.socketGear(actor, 'pet', 'head', 'hatH2', 1)).ok, true, 'same socket name, other pet');
  assert.deepEqual([slots(actor).gear.cat, slots(actor).gear.owl], [{head: 'hatH'}, {head: 'hatH2'}]);
  assert.equal((await c.socketDroppedGear(actor, 'pet', null, actor.items.get('vest'), 1)).ok, true);
  assert.deepEqual(slots(actor).gear.owl, {head: 'hatH2', body: 'vest'});
  // no box named: the first active pet with a free fitting socket
  assert.equal((await c.dropOnBox(actor, 'pet', actor.items.get('scarf'))).ok, true);
  assert.deepEqual(slots(actor).gear.cat, {head: 'hatH', body: 'scarf'});
  assert.match((await c.socketGear(actor, 'pet', 'body', 'bow', 2)).error, /Choose a pet for pet box 3 first/);
  assert.equal((await c.clearSocket(actor, 'pet', 'head', 1)).ok, true);
  assert.equal(slots(actor).gear.owl.head, undefined);
  assert.equal((await c.attachPerk(actor, 'pet', 'loyal', 1)).ok, true); assert.deepEqual(slots(actor).perks.owl, ['loyal']);
  assert.equal((await c.detachPerk(actor, 'pet', 'loyal', 1)).ok, true);
  assert.equal((await c.dropOnBox(actor, 'pet', actor.items.get('loyal'), 1)).ok, true); assert.deepEqual(slots(actor).perks.owl, ['loyal']);
});

// ---------- 0.48.0: pet slot count and settings ----------

test('pet slots: default 3, per-character override, partner extras, clamped to 0 to 3; old petCap keys are ignored', () => {
  const {actor} = setup({settings: {petCap: 1, petCapOverrides: {actor1: 0}}});
  assert.equal(c.petSlotsFor(actor), 3, 'petCap and petCapOverrides are ignored');
  installGlobals({settings: {petSlots: 1}}); assert.equal(c.petSlotsFor(actor), 1);
  installGlobals({settings: {petSlots: 1, petSlotOverrides: {actor1: 2}}}); assert.equal(c.petSlotsFor(actor), 2);
  installGlobals({settings: {petSlots: 9, petSlotOverrides: {actor1: 'x'}}}); assert.equal(c.petSlotsFor(actor), 3);
  installGlobals({settings: {petSlots: 0}}); assert.equal(c.petSlotsFor(actor), 0);
  c.registerPetSlotSource('t', () => 2); assert.equal(c.petSlotsFor(actor), 2);
  c.registerPetSlotSource('t2', () => { throw new Error('[TEST] broken partner'); }); assert.equal(c.petSlotsFor(actor), 2, 'a throwing hook is ignored');
  installGlobals({settings: {petSlots: 2}}); assert.equal(c.petSlotsFor(actor), 3, 'total clamped to 3');
  c.unregisterPetSlotSource('t'); c.unregisterPetSlotSource('t2');
});

test('limits are enforced in the data layer; lowering the count never removes anything', async () => {
  const {actor} = setup({settings: {petSlots: 2}});
  await linked(actor, 'cat', 'owl');
  const fox = world('fox', {perms: shared});
  assert.deepEqual([(await c.addActorCompanion(actor, fox, 'pet')).activated, slots(actor).activePets], [false, ['Actor.cat', 'Actor.owl', null]], 'third is linked, not active');
  assert.match((await c.activateCompanion(actor, 'pet', 'Actor.fox', 2)).error, /2 pet slots, so pet box 3 can't be filled/);
  assert.match((await c.addActorCompanion(actor, fox, 'pet', 2)).error, /can't be filled/);
  assert.match((await c.dropOnBox(actor, 'pet', world('bat', {perms: shared}), 2)).error, /can't be filled/);
  assert.equal(c.companionBoxes(actor).pets.length, 2, 'two boxes shown');
  // lower to 1: the second pet stays shown; only clearing is allowed on it
  installGlobals({settings: {petSlots: 1}}); globalThis.fromUuidSync = u => ({'Actor.cat': CAT(), 'Actor.owl': OWL(), 'Actor.fox': fox})[u] ?? null;
  assert.deepEqual(c.companionBoxes(actor).pets.map(x => x.active?.name), ['[TEST] cat', '[TEST] owl']);
  assert.match((await c.activateCompanion(actor, 'pet', 'Actor.fox', 1)).error, /can't be filled/);
  assert.equal((await c.activateCompanion(actor, 'pet', null, 1)).ok, true);
  assert.equal(c.companionBoxes(actor).pets.length, 1, 'the cleared extra box is hidden');
  assert.equal(slots(actor).pets.length, 3, 'nothing was unlinked');
  installGlobals({settings: {petSlots: 0}}); globalThis.fromUuidSync = u => u === 'Actor.cat' ? CAT() : null;
  assert.equal(c.companionBoxes(actor).pets.length, 1, 'an assigned pet stays shown at 0 slots');
  await c.activateCompanion(actor, 'pet', null, 0);
  assert.equal(c.companionBoxes(actor).pets.length, 0);
  assert.equal(c.companionsData(actor).petCap, 0);
});

test('GM-only pet slot settings: validated, saved, cleared; players refused', async () => {
  const {actor} = setup({user: users.gm});
  assert.equal((await c.setDefaultPetSlots('2')).ok, true); assert.equal(game.settings.store.petSlots, 2);
  assert.equal((await c.setDefaultPetSlots(4)).ok, false); assert.equal((await c.setDefaultPetSlots('1.5')).ok, false); assert.equal((await c.setDefaultPetSlots('')).ok, false);
  assert.equal(game.settings.store.petSlots, 2);
  assert.equal((await c.setPetSlotOverride('actor1', '0')).ok, true); assert.deepEqual(game.settings.store.petSlotOverrides, {actor1: 0});
  assert.equal(c.petSlotsFor(actor), 0);
  assert.equal((await c.setPetSlotOverride('actor1', '7')).ok, false);
  assert.equal((await c.setPetSlotOverride('actor1', '')).ok, true); assert.deepEqual(game.settings.store.petSlotOverrides, {}); assert.equal(c.petSlotsFor(actor), 2);
  installGlobals({user: users.owner, settings: {petSlots: 2}});
  assert.match((await c.setDefaultPetSlots(1)).error, /Only the GM/); assert.match((await c.setPetSlotOverride('actor1', 1)).error, /Only the GM/);
  assert.equal(game.settings.store.petSlots, 2);
});

test('GM Setup shows the pet slots card (default and one select per character); edits go through the data layer', async () => {
  const {actor} = setup({user: users.gm, settings: {petSlots: 3}});
  installGlobals({user: users.gm, settings: {petSlots: 3}, actors: [actor]});
  const html = gmSetupTab();
  assert.match(html, /data-edit="pet-slots-default"[^>]*value="3"|value="3"[^>]*data-edit="pet-slots-default"/);
  assert.match(html, /data-edit="pet-slot-override" data-actor="actor1"/); assert.match(html, /Default \(3\)/);
  const sheet = new (createHubSheetClass(FakeActorSheetV2))({document: actor});
  await EDITS['pet-slots-default'](sheet, {value: '1'}); assert.equal(game.settings.store.petSlots, 1);
  await EDITS['pet-slot-override'](sheet, {dataset: {actor: 'actor1'}, value: '2'}); assert.deepEqual(game.settings.store.petSlotOverrides, {actor1: 2});
  installGlobals({user: users.owner, settings: {petSlots: 3}});
  assert.equal((await EDITS['pet-slots-default'](sheet, {value: '0'})).ok, false); assert.equal(game.settings.store.petSlots, 3);
});

// ---------- 0.48.0: data version 2 and migration ----------

test('migration v1 to v2: activePet becomes activePets[0], Other sockets become Tack, nothing deleted, re-run is a no-op', async () => {
  const {actor} = setup({user: users.gm});
  const v1 = {version: 1, activePet: 'Actor.owl', activeMount: 'Actor.horse', pets: ['Actor.cat', 'Actor.owl'], mounts: ['Actor.horse'],
    gear: {horse: {saddle: 'saddle', other1: 'barding', other3: 'bow'}, owl: {head: 'hat'}}, perks: {horse: ['sure'], cat: ['loyal']}};
  actor.flags[MODULE_ID] = {companionSlots: structuredClone(v1)};
  // reading shows it as v2 without writing
  let b = c.companionBoxes(actor);
  assert.deepEqual([b.pets[0].active.name, b.mount.sockets.map(x => x.item?.id ?? null)], ['[TEST] owl', ['saddle', 'barding', null, 'bow', null]]); assert.equal(actor.calls.length, 0);
  assert.deepEqual(await c.migrateCompanionSlots(actor), {ok: true, migrated: true});
  const s = slots(actor);
  assert.deepEqual([s.version, s.activePets, s.activeMount, s.pets, s.mounts], [2, ['Actor.owl', null, null], 'Actor.horse', ['Actor.cat', 'Actor.owl'], ['Actor.horse']]);
  assert.deepEqual(s.gear, {horse: {saddle: 'saddle', tack1: 'barding', tack3: 'bow'}, owl: {head: 'hat'}});
  assert.deepEqual(s.perks, {horse: ['sure'], cat: ['loyal']});
  assert.equal('activePet' in s, false);
  const calls = actor.calls.length;
  assert.deepEqual(await c.migrateCompanionSlots(actor), {ok: true, migrated: false}); assert.equal(actor.calls.length, calls);
  assert.deepEqual(await c.migrateAllCompanionSlots([actor]), {ok: true, migrated: 0});
  // an unmigrated v1 character is upgraded by its next change, losing nothing
  const other = setup({}).actor; other.flags[MODULE_ID] = {companionSlots: structuredClone(v1)};
  await c.socketGear(other, 'pet', 'body', 'scarf', 0);
  assert.deepEqual([slots(other).version, slots(other).gear.owl, slots(other).gear.horse.tack1], [2, {head: 'hat', body: 'scarf'}, 'barding']);
});

test('v2 reads clean: duplicates across boxes dropped, unlinked pets ignored, extra boxes beyond three ignored', () => {
  const {actor} = setup();
  actor.flags[MODULE_ID] = {companionSlots: {version: 2, activePets: ['Actor.cat', 'Actor.cat', 'Actor.nope', 'Actor.owl', 'Actor.owl'], activeMount: 'Actor.cat', pets: ['Actor.cat', 'Actor.owl'], mounts: ['Actor.horse'], gear: {}, perks: {}}};
  const s = c.readSlots(actor);
  assert.deepEqual([s.activePets, s.activeMount], [['Actor.cat', null, null], null]);
  actor.flags[MODULE_ID].companionSlots.activePets = [null, 'Actor.owl', 'Actor.cat'];
  assert.deepEqual(c.readSlots(actor).activePets, [null, 'Actor.owl', 'Actor.cat']);
});

// ---------- 0.48.0: the player's own name and description ----------

test('labels: stored on the character, plain text, limits, fallback to the Actor name, shown in boxes and the API', async () => {
  const {actor} = setup();
  await linked(actor, 'cat', 'owl'); await c.addActorCompanion(actor, world('horse', {perms: shared}), 'mount');
  const long = 'x'.repeat(200), r = await c.setCompanionLabel(actor, 'Actor.cat', {name: `  <b>Biscuit</b>${'y'.repeat(80)}`, description: `<script>alert(1)</script>Loves ${long}${long}${long}`});
  assert.equal(r.ok, true);
  const l = slots(actor).labels.cat;
  assert.equal(l.name.length, 60); assert.ok(l.name.startsWith('Biscuit')); assert.doesNotMatch(l.name + l.description, /[<>]/);
  assert.equal(l.description.length <= 500, true);
  let b = c.companionBoxes(actor);
  assert.deepEqual([b.pets[0].active.name, b.pets[0].active.actorName, b.pets[1].active.name], [l.name, '[TEST] cat', '[TEST] owl']);
  assert.equal(b.pets[0].active.description, l.description);
  const api = c.companionsData(actor).pets.find(p => p.actorUuid === 'Actor.cat');
  assert.deepEqual([api.name, api.actorName, api.description], [l.name, '[TEST] cat', l.description]);
  assert.equal((await c.setCompanionLabel(actor, 'Actor.cat', {name: '', description: 'Only text'})).ok, true);
  assert.equal(c.companionBoxes(actor).pets[0].active.name, '[TEST] cat', 'an empty name falls back to the Actor name');
  assert.equal((await c.setCompanionLabel(actor, 'Actor.cat', {name: '', description: ''})).ok, true);
  assert.equal(slots(actor).labels.cat, undefined, 'empty label removed');
  await c.setCompanionLabel(actor, 'Actor.horse', {name: 'Storm'});
  assert.equal(c.companionBoxes(actor).mount.active.name, 'Storm');
  assert.match((await c.setCompanionLabel(actor, 'Actor.nope', {name: 'x'})).error, /no longer listed/);
  await c.removeCompanion(actor, 'mount', 'Actor.horse'); assert.equal(slots(actor).labels.horse, undefined, 'removing forgets the label');
  assert.equal(world('cat').calls.length, 0);
});

test('labels: owners and the GM only, and not while the part is hidden; observers and backups refused', async () => {
  const {actor} = setup({user: users.observer});
  assert.match((await c.setCompanionLabel(actor, 'Actor.cat', {name: 'x'})).error, /don't own/);
  installGlobals({user: users.owner}); globalThis.fromUuidSync = u => u === 'Actor.cat' ? CAT() : null;
  await linked(actor, 'cat');
  installGlobals({user: users.owner, settings: {playerVisibility: {companions: false}}});
  assert.match((await c.setCompanionLabel(actor, 'Actor.cat', {name: 'x'})).error, /hasn't shared/);
  installGlobals({user: users.gm, settings: {playerVisibility: {companions: false}}});
  assert.equal((await c.setCompanionLabel(actor, 'Actor.cat', {name: 'GM name'})).ok, true);
  const backup = Object.assign(makeActor(), {flags: {[MODULE_ID]: {levelBackup: {sourceId: 'x', levelBefore: 1}}}});
  assert.match((await c.setCompanionLabel(backup, 'Actor.cat', {name: 'x'})).error, /level backup/);
});

test('migration carries names and descriptions typed before 0.47.0 into labels (re-runnable; old flag untouched); v1 data picks them up too', async () => {
  const {actor} = setup({user: users.gm});
  const old = [{id: 'a', kind: 'pet', actorUuid: 'Actor.cat', name: 'Biscuit', description: 'A <i>very</i> good cat', perkItemIds: [], gearItemIds: [], clothing: []},
    {id: 'b', kind: 'mount', actorUuid: 'Actor.horse', name: '', description: '', perkItemIds: [], gearItemIds: [], clothing: []}];
  actor.flags[MODULE_ID] = {companions: structuredClone(old)};
  await c.migrateCompanionSlots(actor);
  assert.deepEqual(slots(actor).labels, {cat: {name: 'Biscuit', description: 'A very good cat'}});
  assert.equal(JSON.stringify(actor.flags[MODULE_ID].companions), JSON.stringify(old));
  assert.deepEqual(await c.migrateCompanionSlots(actor), {ok: true, migrated: false});
  // a v1 flag written by 0.47.0 next to the old list
  const v1 = setup({user: users.gm}).actor;
  v1.flags[MODULE_ID] = {companions: structuredClone(old), companionSlots: {version: 1, activePet: 'Actor.cat', activeMount: null, pets: ['Actor.cat'], mounts: ['Actor.horse'], gear: {}, perks: {}}};
  assert.equal(c.companionBoxes(v1).pets[0].active.name, 'Biscuit', 'shown before migration');
  await c.migrateCompanionSlots(v1);
  assert.deepEqual([slots(v1).version, slots(v1).labels], [2, {cat: {name: 'Biscuit', description: 'A very good cat'}}]);
  // a label already set is never overwritten by the old text
  const keep = setup({user: users.gm}).actor;
  keep.flags[MODULE_ID] = {companions: structuredClone(old), companionSlots: {version: 2, activePets: ['Actor.cat', null, null], activeMount: null, pets: ['Actor.cat'], mounts: [], gear: {}, perks: {}, labels: {cat: {name: 'Mine', description: ''}}}};
  assert.equal(c.companionBoxes(keep).pets[0].active.name, 'Mine');
});

// ---------- 0.48.0: the tab ----------

test('Companions tab: three pet boxes with their own sockets, dropdown choices, narrow-window order, socket labels, label editor, no raw ids', async () => {
  const horse = world('horse', {perms: shared}), cat = world('cat', {perms: shared}), owl = world('owl', {perms: shared}), fox = world('fox', {perms: shared});
  const {actor} = setup({others: [horse, cat, owl, fox]});
  await c.addActorCompanion(actor, horse, 'mount'); await linked(actor, 'cat', 'owl', 'fox');
  await c.activateCompanion(actor, 'pet', null, 2);
  await c.socketGear(actor, 'pet', 'head', 'hatH', 0); await c.socketGear(actor, 'pet', 'body', 'vest', 1);
  await c.setCompanionLabel(actor, 'Actor.cat', {name: 'Biscuit', description: 'Sleeps on the saddle.'});
  const sheet = new (createHubSheetClass(FakeActorSheetV2))({document: actor}); sheet.tab = 'companions';
  let html = await sheet._renderHTML();
  assert.ok(html.indexOf('agch-cbox--mount') < html.indexOf('agch-cbox--pet'), 'mount first');
  assert.equal((html.match(/agch-cbox--pet"/g) ?? []).length, 3, 'three pet boxes');
  assert.match(html, /aria-label="Pet 1"[\s\S]*aria-label="Pet 2"[\s\S]*aria-label="Pet 3"/);
  for (const n of [0, 1, 2]) assert.match(html, new RegExp(`data-drop-companion="box" data-kind="pet" data-slot="${n}"`));
  assert.match(html, /data-drop-companion="socket" data-kind="pet" data-slot="1" data-socket="head"/, 'each pet box has its own sockets');
  assert.match(html, /agch-cbox__name">Biscuit</); assert.match(html, /agch-cbox__real">\[TEST\] cat</); assert.match(html, /agch-cbox__desc">Sleeps on the saddle\./);
  const pet3 = html.slice(html.indexOf('aria-label="Pet 3"'));
  assert.match(pet3, /Choose a pet…/, 'the empty box offers a choice');
  assert.match(pet3, /<option value="Actor.fox">\[TEST\] fox \(Pet\)<\/option>/);
  assert.doesNotMatch(pet3.slice(0, pet3.indexOf('</section>')), /Actor\.cat|Actor\.owl/, 'pets active in other boxes are not offered');
  const sockets = html.match(/<span class="agch-socketbox__label">(Saddle|Tack|Head|Body)<\/span>/g).map(x => x.replace(/<[^>]+>/g, ''));
  assert.deepEqual(sockets, ['Saddle', 'Tack', 'Tack', 'Tack', 'Tack', 'Head', 'Body', 'Head', 'Body']);
  assert.match(html, /aria-label="Add gear to the Tack 2 socket"/);
  assert.doesNotMatch(html.slice(html.indexOf('data-socket="saddle"')).split('</li>')[0], /Classified Hat/);
  assert.match(html, /data-edit="companion-gear" data-kind="pet" data-slot="0" data-socket="body"/);
  assert.doesNotMatch(html.replace(/<[^>]+>/g, ' '), /Actor\.(horse|cat|owl|fox)|ITEM-|PERK-/, 'no raw ids in the visible text');
  // dropdown edit uses the pet box
  await EDITS['companion-active'](sheet, {dataset: {kind: 'pet', slot: '2'}, value: 'Actor.fox'});
  assert.deepEqual(slots(actor).activePets, ['Actor.cat', 'Actor.owl', 'Actor.fox']);
  assert.equal((await EDITS['companion-active'](sheet, {dataset: {kind: 'pet', slot: '2'}, value: 'Actor.cat'})).ok, false, 'a duplicate is refused');
  await EDITS['companion-gear'](sheet, {dataset: {kind: 'pet', slot: '2', socket: 'head'}, value: 'hatH2'});
  assert.equal(slots(actor).gear.fox.head, 'hatH2');
  await ACTIONS['companion-unsocket'](sheet, {dataset: {kind: 'pet', slot: '2', socket: 'head'}});
  assert.equal(slots(actor).gear.fox, undefined);
  // editing the name: draft kept on the window, Save writes, Cancel asks when changed
  await ACTIONS['companion-label-edit'](sheet, {dataset: {uuid: 'Actor.owl'}});
  html = await sheet._renderHTML();
  assert.match(html, /data-label-form[\s\S]*data-field="name"[\s\S]*Save changes/); assert.match(html, /placeholder="\[TEST\] owl"/);
  await EDITS['companion-label-field'](sheet, {dataset: {field: 'name'}, value: 'Hoots'});
  await EDITS['companion-label-field'](sheet, {dataset: {field: 'description'}, value: 'Night watch.'});
  html = await sheet._renderHTML(); assert.match(html, /value="Hoots"/); assert.match(html, /Unsaved changes/, 'typed text survives a redraw');
  assert.equal((await ACTIONS['companion-label-save'](sheet, {})).ok, true);
  assert.deepEqual(slots(actor).labels.owl, {name: 'Hoots', description: 'Night watch.'}); assert.equal(sheet.labelEdit, null);
  // observers get no editor and no edit button
  installGlobals({user: users.observer}); globalThis.fromUuidSync = u => ({'Actor.cat': world('cat', {perms: shared}), 'Actor.owl': world('owl', {perms: shared}), 'Actor.fox': world('fox', {perms: shared}), 'Actor.horse': world('horse', {perms: shared})})[u] ?? null;
  const obs = new (createHubSheetClass(FakeActorSheetV2))({document: actor}); obs.tab = 'companions'; obs.labelEdit = {uuid: 'Actor.owl', name: 'x', description: ''};
  const oh = await obs._renderHTML();
  assert.doesNotMatch(oh, /data-label-form|companion-label-edit/); assert.match(oh, /agch-cbox__name">Hoots</);
});

test('Companions tab with fewer pet slots: hides empty extra boxes, keeps assigned ones; zero slots explains itself', async () => {
  const cat = world('cat', {perms: shared}), owl = world('owl', {perms: shared});
  const {actor} = setup({settings: {petSlots: 1}, others: [cat, owl]});
  await linked(actor, 'cat');
  let sheet = new (createHubSheetClass(FakeActorSheetV2))({document: actor}); sheet.tab = 'companions';
  let html = await sheet._renderHTML();
  assert.equal((html.match(/agch-cbox--pet"/g) ?? []).length, 1); assert.doesNotMatch(html, /aria-label="Pet 1"/, 'a single box is not numbered');
  installGlobals({settings: {petSlots: 0}}); globalThis.fromUuidSync = u => u === 'Actor.cat' ? world('cat', {perms: shared}) : null;
  html = await sheet._renderHTML(); assert.equal((html.match(/agch-cbox--pet"/g) ?? []).length, 1, 'the assigned pet stays');
  await c.activateCompanion(actor, 'pet', null, 0);
  html = await sheet._renderHTML(); assert.match(html, /No pet slots/); assert.doesNotMatch(html, /agch-cbox--pet"/);
});
