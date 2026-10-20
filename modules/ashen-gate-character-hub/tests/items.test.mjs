/** Inventory, combat, magic, features, rests, the paper doll and attunement (mocked Foundry; logic only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {inventoryData, combatData, spellsData, featuresData, equipmentLayout, equipChoices, naturalSlot, attunementData} from '../scripts/items.mjs';
import * as ia from '../scripts/item-actions.mjs';
import {createHubSheetClass} from '../scripts/sheet.mjs';
import {MODULE_ID} from '../scripts/constants.mjs';

const act = type => [{activation: {type}}];
const ITEMS = () => [
  {id: 'sword', name: '[TEST] Longsword', type: 'weapon', sort: 1, system: {quantity: 1, equipped: true, activities: act('action')}},
  {id: 'bow', name: '[TEST] Shortbow', type: 'weapon', sort: 2, system: {quantity: 1, equipped: false, activities: act('action')}},
  {id: 'mail', name: '[TEST] Chain Mail', type: 'equipment', system: {quantity: 1, equipped: true, type: {value: 'heavy'}}},
  {id: 'shield', name: '[TEST] Shield', type: 'equipment', system: {quantity: 1, equipped: false, type: {value: 'shield'}}},
  {id: 'boots', name: '[TEST] Boots of Striding', type: 'equipment', system: {quantity: 1, equipped: false, type: {value: 'wondrous'}, attunement: 'required', attuned: false}},
  {id: 'ring', name: '[TEST] Ring of Warmth', type: 'equipment', system: {quantity: 1, equipped: true, type: {value: 'ring'}, attunement: 'required', attuned: true}},
  {id: 'cloak', name: '[TEST] Cloak', type: 'equipment', system: {quantity: 1, equipped: true, type: {value: 'wondrous'}, attunement: 'optional', attuned: false}},
  {id: 'stone', name: '[TEST] Odd Stone', type: 'equipment', system: {quantity: 1, equipped: true, type: {value: 'wondrous'}}},
  {id: 'potion', name: '[TEST] Healing Potion', type: 'consumable', system: {quantity: 3, activities: act('bonus'), uses: {max: 1, spent: 0, value: 1}}},
  {id: 'pack', name: '[TEST] Backpack', type: 'container', system: {quantity: 1}},
  {id: 'rope', name: '[TEST] Rope', type: 'loot', system: {quantity: 1, container: 'pack'}},
  {id: 'fire', name: '[TEST] Fire Bolt', type: 'spell', system: {level: 0, prepared: 0, canPrepare: false, activities: act('action')}},
  {id: 'shieldspell', name: '[TEST] Shield Spell', type: 'spell', system: {level: 1, prepared: 0, canPrepare: true, activities: act('reaction')}},
  {id: 'bless', name: '[TEST] Bless', type: 'spell', system: {level: 1, prepared: 2, canPrepare: true}},
  {id: 'surge', name: '[TEST] Action Surge', type: 'feat', system: {type: {value: 'class'}, activities: act('other'), uses: {max: 1, spent: 1, value: 0}}},
  {id: 'fighter', name: 'Fighter', type: 'class', system: {levels: 3, identifier: 'fighter'}}
];
const actorWith = (opts = {}) => makeActor({items: ITEMS(), system: {spells: {spell1: {value: 1, max: 2}, spell2: {value: 0, max: 1}, pact: {value: 0, max: 0, level: 0}}, attributes: {...makeActor().system.attributes, attunement: {max: 3}}}, ...opts});

test('inventory groups by category, nests container contents and reads currency/attunement', () => {
  installGlobals();
  const d = inventoryData(actorWith());
  assert.deepEqual(d.groups.map(g => g.type), ['weapon', 'equipment', 'consumable', 'container']);
  const pack = d.groups.find(g => g.type === 'container').items[0];
  assert.deepEqual(pack.contents.map(c => c.id), ['rope'], 'rope listed inside the backpack, not as loot');
  assert.deepEqual(d.currency.map(c => [c.key, c.value]), [['pp', 0], ['gp', 15], ['ep', 0], ['sp', 3], ['cp', 7]]);
  assert.deepEqual(d.attunement, {value: 1, max: 3});
});

test('combat: weapons equipped first, other usables grouped by activation; spells excluded', () => {
  installGlobals();
  const d = combatData(actorWith());
  assert.deepEqual(d.weapons.map(w => w.id), ['sword', 'bow']);
  assert.deepEqual(d.groups.map(g => [g.key, g.items.map(i => i.id)]), [['bonus', ['potion']], ['other', ['surge']]]);
});

test('magic: spells by level with slots; prepare only where dnd5e allows', () => {
  installGlobals();
  const d = spellsData(actorWith());
  assert.deepEqual(d.levels.map(l => [l.level, l.slots, l.spells.map(s => s.id)]), [[0, null, ['fire']], [1, {value: 1, max: 2}, ['bless', 'shieldspell']], [2, {value: 0, max: 1}, []]]);
  const bless = d.levels[1].spells[0];
  assert.equal(bless.always, true);
  assert.equal(d.pact, null);
});

test('features: identity items and feats by type', () => {
  installGlobals();
  const d = featuresData(actorWith());
  assert.deepEqual(d.identity.map(i => [i.id, i.detail]), [['fighter', 'Level 3']]);
  assert.deepEqual(d.groups.map(g => [g.key, g.items.map(i => i.id)]), [['class', ['surge']]]);
});

test('item use, rests and spell casting delegate to dnd5e with the event', async () => {
  installGlobals();
  const actor = actorWith(), event = {altKey: true};
  assert.equal((await ia.useItem(actor, 'potion', event)).ok, true);
  assert.deepEqual(actor.items.get('potion').calls[0], ['use', {event}]);
  await ia.rest(actor, 'short'); await ia.rest(actor, 'long');
  assert.deepEqual(actor.calls.map(c => c[0]), ['shortRest', 'longRest']);
  assert.equal((await ia.useItem(actor, 'gone')).ok, false);
});

test('quantity, currency and preparation write through one update each, with validation', async () => {
  installGlobals();
  const actor = actorWith();
  await ia.setQuantity(actor, 'potion', 2);
  assert.deepEqual(actor.items.get('potion').calls.at(-1), ['update', {'system.quantity': 2}]);
  assert.equal((await ia.setQuantity(actor, 'potion', -1)).ok, false);
  await ia.setCurrency(actor, 'gp', '20');
  assert.deepEqual(actor.calls.at(-1), ['update', {'system.currency.gp': 20}]);
  assert.equal((await ia.setCurrency(actor, 'zz', 1)).ok, false);
  await ia.togglePrepared(actor, 'shieldspell');
  assert.deepEqual(actor.items.get('shieldspell').calls.at(-1), ['update', {'system.prepared': 1}]);
  assert.match((await ia.togglePrepared(actor, 'bless')).error, /always prepared/);
  assert.match((await ia.togglePrepared(actor, 'fire')).error, /not a prepared spell/);
});

test('observers are refused for every item write, use and rest', async () => {
  installGlobals({user: users.observer});
  const actor = actorWith();
  const results = [await ia.useItem(actor, 'potion'), await ia.setQuantity(actor, 'potion', 1), await ia.setCurrency(actor, 'gp', 1),
    await ia.togglePrepared(actor, 'shieldspell'), await ia.rest(actor, 'long'), await ia.equipItem(actor, 'bow'), await ia.unequipItem(actor, 'sword'),
    await ia.setAttuned(actor, 'boots', true), await ia.setSlot(actor, 'stone', 'neck')];
  for (const r of results) assert.equal(r.ok, false);
  assert.equal(actor.calls.length, 0);
  assert.ok(actor.items.every(i => i.calls.length === 0));
  assert.equal((await ia.openItemSheet(actor, 'potion')).ok, true, 'observers may still open an item sheet to read it');
});

test('paper doll: natural slots, owner-assigned slot flag, collisions to Other', () => {
  installGlobals();
  const actor = actorWith();
  assert.equal(naturalSlot(actor.items.get('mail')), 'body');
  assert.equal(naturalSlot(actor.items.get('shield')), 'offhand');
  assert.equal(naturalSlot(actor.items.get('sword')), 'hand');
  assert.equal(naturalSlot(actor.items.get('ring')), 'ring');
  assert.equal(naturalSlot(actor.items.get('boots')), 'feet', 'name hint for unclassified wearables');
  assert.equal(naturalSlot(actor.items.get('cloak')), 'back');
  assert.equal(naturalSlot(actor.items.get('stone')), null);
  let l = equipmentLayout(actor);
  const at = id => l.slots.find(s => s.id === id).item?.id ?? null;
  assert.equal(at('body'), 'mail'); assert.equal(at('mainhand'), 'sword'); assert.equal(at('ring1'), 'ring'); assert.equal(at('back'), 'cloak');
  assert.deepEqual(l.other.map(o => o.id), ['stone'], 'unmapped equipped items go to Other');
  actor.items.get('stone').flags = {[MODULE_ID]: {slot: 'neck'}};
  l = equipmentLayout(actor);
  assert.equal(at('neck'), 'stone'); assert.equal(l.other.length, 0);
  actor.items.get('bow').system.equipped = true;
  l = equipmentLayout(actor);
  assert.equal(at('offhand'), 'bow', 'second weapon takes the off hand');
});

test('equip picker lists carried unequipped items that fit the box', () => {
  installGlobals();
  const actor = actorWith();
  assert.deepEqual(equipChoices(actor, 'offhand').map(i => i.id), ['shield', 'bow']);
  assert.deepEqual(equipChoices(actor, 'feet').map(i => i.id), ['boots']);
  assert.deepEqual(equipChoices(actor, 'body').map(i => i.id), []);
});

test('equip into a box writes equipped + slot flag in one update; unequip leaves attunement', async () => {
  installGlobals();
  const actor = actorWith();
  assert.equal((await ia.equipItem(actor, 'shield', {slot: 'offhand'})).ok, true);
  assert.deepEqual(actor.items.get('shield').calls, [['update', {'system.equipped': true, [`flags.${MODULE_ID}.slot`]: 'offhand'}]]);
  await ia.unequipItem(actor, 'ring');
  assert.deepEqual(actor.items.get('ring').calls, [['update', {'system.equipped': false}]]);
  assert.equal(actor.items.get('ring').system.attuned, true);
  assert.equal((await ia.equipItem(actor, 'shield', {slot: 'elbow'})).ok, false);
  await ia.setSlot(actor, 'stone', '');
  assert.deepEqual(actor.items.get('stone').calls, [['update', {[`flags.${MODULE_ID}.slot`]: null}]]);
});

test('attunement: free slot prompts Attune and equip / Equip without / Cancel', async () => {
  installGlobals();
  let actor = actorWith(), asked = null;
  await ia.equipItem(actor, 'boots', {ask: p => { asked = p; return 'attune'; }});
  assert.equal(asked.atLimit, false);
  assert.deepEqual(asked.buttons.map(b => b.action), ['cancel', 'equip', 'attune']);
  assert.match(asked.content, /1 of 3/);
  assert.deepEqual(actor.items.get('boots').calls, [['update', {'system.equipped': true, 'system.attuned': true}]], 'one update');
  actor = actorWith();
  await ia.equipItem(actor, 'boots', {ask: () => 'equip'});
  assert.deepEqual(actor.items.get('boots').calls, [['update', {'system.equipped': true}]]);
  actor = actorWith();
  const r = await ia.equipItem(actor, 'boots', {ask: () => 'cancel'});
  assert.equal(r.ok, false); assert.equal(r.error, null, 'cancel is silent');
  assert.equal(actor.items.get('boots').calls.length, 0);
});

test('attunement: at the limit, explains, lists attuned items with Unattune, then asks again', async () => {
  installGlobals();
  const actor = actorWith();
  actor.system.attributes.attunement.max = 1;
  const prompts = [];
  const answers = ['unattune:ring', 'attune'];
  await ia.equipItem(actor, 'boots', {ask: p => { prompts.push(p); return answers.shift(); }});
  assert.equal(prompts[0].atLimit, true);
  assert.match(prompts[0].content, /already attuned to 1 of 1/);
  assert.match(prompts[0].content, /Ring of Warmth/);
  assert.deepEqual(prompts[0].buttons.map(b => b.action), ['cancel', 'equip', 'unattune:ring']);
  assert.deepEqual(actor.items.get('ring').calls, [['update', {'system.attuned': false}]]);
  assert.equal(prompts[1].atLimit, false, 'the freed slot is offered next');
  assert.deepEqual(actor.items.get('boots').calls, [['update', {'system.equipped': true, 'system.attuned': true}]]);
  assert.equal(attunementData(actor).value, 1);
});

test('attunement: already attuned or optional items equip without a prompt', async () => {
  installGlobals();
  const actor = actorWith();
  actor.items.get('ring').system.equipped = false;
  const never = () => { throw new Error('should not ask'); };
  assert.equal((await ia.equipItem(actor, 'ring', {ask: never})).ok, true);
  actor.items.get('cloak').system.equipped = false;
  assert.equal((await ia.equipItem(actor, 'cloak', {ask: never})).ok, true);
});

test('attune toggle refuses at the limit and names attuned items; unattune always works', async () => {
  installGlobals();
  const actor = actorWith();
  actor.system.attributes.attunement.max = 1;
  const r = await ia.setAttuned(actor, 'boots', true);
  assert.equal(r.ok, false); assert.match(r.error, /1 of 1.*Ring of Warmth/);
  assert.equal((await ia.setAttuned(actor, 'ring', false)).ok, true);
  assert.equal((await ia.setAttuned(actor, 'stone', true)).ok, false, 'not attunable');
});

test('every tab renders for owner and observer; observer controls disabled except open-sheet buttons', async () => {
  installGlobals({user: users.owner});
  const Cls = createHubSheetClass(FakeActorSheetV2);
  const sheet = new Cls({document: actorWith()});
  for (const tab of ['combat', 'inventory', 'magic', 'features', 'rest']) {
    sheet.tab = tab;
    const html = await sheet._renderHTML();
    assert.doesNotMatch(html, /could not be drawn/, tab);
  }
  sheet.tab = 'inventory';
  const inv = await sheet._renderHTML();
  assert.match(inv, /Attuned 1 \/ 3/);
  assert.match(inv, /data-slot="body"[\s\S]*Chain Mail/);
  assert.match(inv, /data-edit="equip-slot" data-slot="feet"/);
  assert.match(inv, /Other equipped[\s\S]*Odd Stone/);
  installGlobals({user: users.observer});
  const view = new Cls({document: actorWith()}); view.tab = 'inventory';
  const vh = await view._renderHTML();
  assert.match(vh, /data-action="item-equip" data-id="bow" disabled/);
  assert.match(vh, /data-action="item-sheet" data-id="bow" data-ag-always/);
});

test('sheet dispatch wires item buttons and edits to the actions', async () => {
  installGlobals();
  const Cls = createHubSheetClass(FakeActorSheetV2);
  const actor = actorWith();
  const sheet = new Cls({document: actor});
  await sheet.dispatch('item-qty', {dataset: {id: 'potion', step: '-1'}}, {});
  assert.deepEqual(actor.items.get('potion').calls.at(-1), ['update', {'system.quantity': 2}]);
  await sheet._onHubChange({target: {dataset: {edit: 'currency', key: 'sp'}, value: '9'}});
  assert.deepEqual(actor.calls.at(-1), ['update', {'system.currency.sp': 9}]);
  await sheet.dispatch('rest', {dataset: {type: 'long'}}, {});
  assert.equal(actor.calls.at(-1)[0], 'longRest');
  await sheet.dispatch('item-sheet', {dataset: {id: 'sword'}}, {});
  assert.equal(actor.items.get('sword').calls.at(-1)[0], 'sheet');
});
