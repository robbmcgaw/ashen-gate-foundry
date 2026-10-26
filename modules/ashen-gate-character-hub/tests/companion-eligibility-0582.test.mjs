/** 0.58.2: utility Actors (the Utilities party stash, loot, vehicle, group) can never be a pet or mount, in the data layer. Mocked Foundry: logic and markup only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import * as c from '../scripts/companions.mjs';
import {createHubSheetClass} from '../scripts/sheet.mjs';
import {MODULE_ID} from '../scripts/constants.mjs';

const LV = {NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3};
const other = {id: 'other', name: 'Other', isGM: false};
function npc(id, {perms = {owner: 'OWNER'}, size = 'med', type = 'npc', stash = false, flag = null, name = null} = {}) {
  const flags = {};
  if (stash) flags['ashen-gate-utilities'] = {partyStash: true};
  if (flag) flags[MODULE_ID] = {companionType: flag};
  const a = {documentName: 'Actor', id, uuid: `Actor.${id}`, name: name ?? `[TEST] ${id}`, img: `${id}.webp`, type, flags, calls: [],
    system: {traits: {size}, attributes: {ac: {value: 10}, hp: {value: 0, max: 0}}},
    testUserPermission: (u, level) => u.isGM || (LV[perms[u.id] ?? 'NONE'] >= LV[level]),
    async update(diff) { a.calls.push(diff); for (const [k, v] of Object.entries(diff)) { const keys = k.split('.'); let o = a; for (const x of keys.slice(0, -2)) o = o[x] ??= {}; const [scope, last] = keys.slice(-2); if (last.startsWith('-=')) delete o[scope]?.[last.slice(2)]; else (o[scope] ??= {})[last] = v; } return a; },
    sheet: {render() {}}};
  return a;
}
function setup({user = users.owner, actors = []} = {}) {
  installGlobals({user, actors});
  globalThis.game.users = [users.gm, users.owner, users.observer, other];
  globalThis.fromUuidSync = uuid => actors.find(a => a.uuid === uuid) ?? null;
  return {hero: makeActor({})};
}
const STASH = () => npc('stash', {name: 'Ashen Gate | Party Stash', stash: true});

test('the stash is detected by Utilities\' partyStash flag and is not a companion of any kind', () => {
  const s = STASH();
  assert.equal(c.notACreature(s), 'the party stash');
  assert.equal(c.companionKindOf(s).kind, 'none'); assert.equal(c.companionKindOf(s).source, 'utility');
  assert.match(c.companionKindOf(s).label, /Can't be a companion/);
  assert.equal(c.companionKindOf(npc('wolf')).kind, 'pet');
  for (const type of ['loot', 'vehicle', 'group']) assert.equal(c.companionKindOf(npc('x', {type})).source, 'utility');
  assert.equal(c.companionKindOf(npc('x', {flag: 'pet', stash: true})).source, 'gm', 'the GM flag overrides');
});
test('not auto-listed for a player owner, nor for a GM viewer; the real pet still is', () => {
  const stash = npc('stash', {stash: true}), cat = npc('cat', {size: 'tiny'});
  let {hero} = setup({actors: [stash, cat]});
  assert.deepEqual(c.eligibleCompanions(hero, 'pet').map(e => e.uuid), ['Actor.cat']);
  assert.deepEqual(c.eligibleCompanions(hero, 'mount').map(e => e.uuid), []);
  ({hero} = setup({user: users.gm, actors: [stash, cat]}));
  assert.ok(!c.eligibleCompanions(hero, 'pet', users.gm).some(e => e.uuid === 'Actor.stash'));
  assert.ok(!c.linkableActors(hero, 'pet').some(a => a.id === 'stash'), 'not in the link list');
});
test('typed-name find, drop and dropdown link are refused with a clear message, for a player and for the GM', async () => {
  const stash = STASH();
  for (const user of [users.owner, users.gm]) {
    const {hero} = setup({user, actors: [stash]});
    const found = c.findLinkableActor(hero, 'Party Stash');
    assert.equal(found.ok, false); assert.match(found.error, /No Actor/);
    for (const kind of ['pet', 'mount']) {
      const r = await c.addActorCompanion(hero, stash, kind);   // a drop
      assert.equal(r.ok, false); assert.match(r.error, /party stash, not a creature, so it can't be a/);
    }
    const viaMenu = await c.activateCompanion(hero, 'pet', stash.uuid);
    assert.equal(viaMenu.ok, false);
    assert.equal(hero.calls.length, 0, 'nothing was saved');
  }
  assert.match((await c.addActorCompanion(setup({user: users.gm, actors: [stash]}).hero, stash, 'pet')).error, /GM Setup/);
});
test('the GM can still force it with the companion type flag', async () => {
  const stash = npc('stash', {stash: true, flag: 'pet'});
  const {hero} = setup({user: users.gm, actors: [stash]});
  const r = await c.addActorCompanion(hero, stash, 'pet');
  assert.equal(r.ok, true);
  assert.equal(c.findLinkableActor(hero, 'stash').ok, false, 'already linked now');
});
test('an already linked stash shows Can\'t be a companion with Remove, and Remove works; saved data is untouched until then', async () => {
  const stash = npc('stash', {stash: true, flag: 'pet'});
  const {hero} = setup({user: users.owner, actors: [stash]});
  globalThis.game.user = users.gm;
  assert.equal((await c.addActorCompanion(hero, stash, 'pet')).ok, true);
  globalThis.game.user = users.owner;
  delete stash.flags[MODULE_ID];   // the GM clears the flag: it is a plain stash again
  const before = JSON.stringify(hero.flags[MODULE_ID]);
  const box = c.companionBoxes(hero).pets[0];
  assert.equal(box.active.ineligible, true); assert.equal(box.active.notOwned, false);
  assert.equal(JSON.stringify(hero.flags[MODULE_ID]), before);
  const Hub = createHubSheetClass(FakeActorSheetV2), sheet = new Hub({document: hero}); sheet.tab = 'companions';
  const html = await sheet._renderHTML();
  assert.match(html, /Can't be a companion\.<\/strong>/); assert.match(html, /data-action="companion-remove"/);
  assert.doesNotMatch(html, /No longer owned/);
  const r = await c.removeCompanion(hero, 'pet', stash.uuid);
  assert.equal(r.ok, true); assert.equal(c.companionBoxes(hero).pets[0].active, null);
  assert.equal(stash.calls.length, 0, 'the Actor itself is never changed');
});
test('copy: the active select says what it does, with None, and a one-line hint sits under each heading', async () => {
  const cat = npc('cat', {size: 'tiny'}), {hero} = setup({actors: [cat]});
  const Hub = createHubSheetClass(FakeActorSheetV2), sheet = new Hub({document: hero}); sheet.tab = 'companions';
  let html = await sheet._renderHTML();
  assert.match(html, /Active pet: choose which linked pet to manage/); assert.match(html, /agch-cbox__what/);
  await c.activateCompanion(hero, 'pet', cat.uuid);
  html = await sheet._renderHTML();
  assert.match(html, /<option value="">None<\/option>/);
});

// ---------- Gear and perk sources (0.58.2) ----------
const role = r => ({[MODULE_ID]: {companion: {role: r}}});
const RAW = [{key: 'system.rolls.attack.mod.bonus', mode: 2, value: '1'}, {key: 'system.rolls.damage.mod.bonus', mode: 2, value: '1'}];
const GEAR_ITEMS = () => [
  {id: 'amulet', name: '[TEST] My Amulet', type: 'equipment', system: {equipped: true, attuned: true}},
  {id: 'sword', name: '[TEST] Longsword', type: 'weapon', system: {equipped: false}},
  {id: 'pack', name: '[TEST] Backpack', type: 'container'},
  {id: 'plate', name: '[TEST] Plate', type: 'equipment', system: {equipped: false}},
  {id: 'hat', name: '[TEST] Pet Hat', type: 'equipment', flags: role('pet-clothing')},
  {id: 'vest', name: '[TEST] Pet Vest', type: 'equipment', flags: {[MODULE_ID]: {companion: {role: 'pet-clothing', slot: 'body'}}}},
  {id: 'worn', name: '[TEST] Worn Pet Hat', type: 'equipment', flags: role('pet-clothing'), system: {equipped: true}},
  {id: 'saddle', name: '[TEST] Saddle', type: 'equipment', flags: role('mount-gear')},
  {id: 'skilled', name: '[TEST] Skilled', type: 'feat', system: {type: {value: 'feat'}}},
  {id: 'prof', name: '[TEST] Green Thumb', type: 'feat', flags: {'ashen-gate-skill-trees': {grant: {treeId: 't'}}}},
  {id: 'loyal', name: '[TEST] Loyal', type: 'feat', flags: role('pet-perk')},
  {id: 'swift', name: '[TEST] Swift', type: 'feat', flags: role('mount-perk')}
];
function gearSetup() {
  installGlobals({user: users.owner, actors: []});
  globalThis.game.users = [users.gm, users.owner, users.observer, other];
  const cat = npc('cat', {size: 'tiny'}); globalThis.fromUuidSync = u => u === cat.uuid ? cat : null;
  const hero = makeActor({items: GEAR_ITEMS()});
  for (const d of GEAR_ITEMS()) { const i = hero.items.get(d.id); i.effects = []; }
  return {hero, cat};
}
test('socket pickers offer only companion gear for that kind: not the character\'s own, equipped, container or other-kind items', async () => {
  const {hero, cat} = gearSetup();
  globalThis.game.user = users.gm; await c.addActorCompanion(hero, cat, 'pet'); globalThis.game.user = users.owner;
  const ids = (kind, sock) => c.gearChoices(hero, kind, sock).map(x => x.item.id).sort();
  assert.deepEqual(ids('pet'), ['hat', 'vest']);
  assert.deepEqual(ids('pet', {key: 'head', type: 'head', label: 'Head'}), ['hat']);
  assert.deepEqual(ids('mount'), ['saddle']);
  assert.equal((await c.socketGear(hero, 'pet', 'head', 'hat')).ok, true);
  assert.deepEqual(ids('pet'), ['vest'], 'one item is offered once');
});
test('assigning is enforced in the handler with a clear message', async () => {
  const {hero, cat} = gearSetup();
  globalThis.game.user = users.gm; await c.addActorCompanion(hero, cat, 'pet'); globalThis.game.user = users.owner;
  const err = async id => (await c.socketGear(hero, 'pet', 'head', id)).error;
  assert.match(await err('amulet'), /not companion gear/);
  assert.match(await err('sword'), /not companion gear/); assert.match(await err('pack'), /not companion gear/); assert.match(await err('plate'), /not companion gear/);
  assert.match(await err('worn'), /equipped or attuned by .*Unequip it first/);
  assert.match(await err('saddle'), /mount gear, not for a pet/);
  assert.equal(hero.flags[MODULE_ID]?.companionSlots?.gear?.cat, undefined, 'nothing saved');
  assert.match((await c.dropOnBox(hero, 'pet', hero.items.get('amulet'))).error, /not companion gear|not a companion perk/);
});
test('assigned gear that the character later equips stays visible with a note and Remove; nothing is dropped', async () => {
  const {hero, cat} = gearSetup();
  globalThis.game.user = users.gm; await c.addActorCompanion(hero, cat, 'pet'); globalThis.game.user = users.owner;
  await c.socketGear(hero, 'pet', 'head', 'hat');
  hero.items.get('hat').system.equipped = true;
  const sock = c.companionBoxes(hero).pets[0].sockets.find(x => x.key === 'head');
  assert.equal(sock.item.id, 'hat'); assert.match(sock.problem, /equipped or attuned/);
  const Hub = createHubSheetClass(FakeActorSheetV2), sheet = new Hub({document: hero}); sheet.tab = 'companions';
  const html = await sheet._renderHTML();
  assert.match(html, /data-socket-problem/); assert.match(html, /data-action="companion-unsocket"/);
  assert.equal(hero.flags[MODULE_ID].companionSlots.gear.cat.head, 'hat');
});
test('perks: only marked companion perks of the right kind; the character\'s own feats and profession perks never', async () => {
  const {hero, cat} = gearSetup();
  globalThis.game.user = users.gm; await c.addActorCompanion(hero, cat, 'pet'); globalThis.game.user = users.owner;
  assert.deepEqual(c.perkChoices(hero, 'pet').map(i => i.id), ['loyal']);
  assert.deepEqual(c.perkChoices(hero, 'mount').map(i => i.id), ['swift']);
  for (const id of ['skilled', 'prof']) assert.match((await c.attachPerk(hero, 'pet', id)).error, /not a companion perk/);
  assert.match((await c.attachPerk(hero, 'pet', 'swift')).error, /mount perk, not for a pet|not for a pet/);
  assert.match((await c.dropOnBox(hero, 'pet', hero.items.get('skilled'))).error, /not a companion perk/);
  assert.equal((await c.attachPerk(hero, 'pet', 'loyal')).ok, true);
  assert.deepEqual(c.perkChoices(hero, 'pet').map(i => i.id), [], 'not offered twice');
  hero.items.get('loyal').system.equipped = true;
  const box = c.companionBoxes(hero).pets[0];
  assert.match(box.perkProblems.loyal, /equipped or attuned/); assert.deepEqual(box.perks.map(i => i.id), ['loyal']);
  const Hub = createHubSheetClass(FakeActorSheetV2), sheet = new Hub({document: hero}); sheet.tab = 'companions';
  const html = await sheet._renderHTML();
  assert.match(html, /data-perk-problem/); assert.match(html, /data-action="companion-detach"/);
});
test('raw Active Effect keys are never shown: a human summary, or nothing', async () => {
  const {itemGives, keyLabel} = await import('../scripts/companion-items.mjs');
  const item = {name: 'Ring', type: 'equipment', effects: [{name: 'x', changes: RAW, disabled: false}]};
  const text = itemGives(item);
  assert.doesNotMatch(text, /system\./); assert.match(text, /Attack rolls \+1; Damage rolls \+1/);
  assert.equal(keyLabel('flags.some.odd_key'), 'Some odd key');
});
