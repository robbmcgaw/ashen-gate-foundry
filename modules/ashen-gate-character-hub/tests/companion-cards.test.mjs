/** 0.12.0 companions: Actor mounts/pets, player text, gear/perks/clothing by role, stats from effects, old data (mocked Foundry; logic only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, makeItem, users, FakeActorSheetV2} from './foundry-mock.mjs';
import * as c from '../scripts/companions.mjs';
import {companionRole, routeForRole, companionStats, keyLabel, changeText, itemGives} from '../scripts/companion-items.mjs';
import {createHubSheetClass, EDITS, ACTIONS} from '../scripts/sheet.mjs';
import {MODULE_ID} from '../scripts/constants.mjs';

const MGR = 'ashen-gate-manager';
const fx = (name, changes, extra = {}) => ({name, changes, disabled: false, transfer: false, ...extra});
const ITEMS = () => [
  {id: 'saddle', name: '[TEST] Riding Saddle', type: 'equipment', flags: {[MGR]: {source: {sourceId: 'ITEM-MOUNT-TEST-SADDLE'}}}, effects: [fx('Saddle', [{key: 'system.attributes.movement.walk', mode: 2, value: '10'}])]},
  {id: 'barding', name: '[TEST] Leather Barding', type: 'equipment', flags: {[MODULE_ID]: {companion: {role: 'mount-gear'}}}, system: {armor: {value: 11}}, effects: [fx('Barding', [{key: 'system.attributes.ac.bonus', mode: 2, value: '1'}])]},
  {id: 'sure', name: '[TEST] Surefooted', type: 'feat', flags: {[MGR]: {source: {sourceId: 'PERK-MOUNT-TEST-SUREFOOTED'}}}, effects: [fx('Sure', [{key: 'system.attributes.ac.bonus', mode: 2, value: '1'}, {key: 'system.abilities.dex.bonuses.save', mode: 5, value: '2'}])]},
  {id: 'off', name: '[TEST] Unused Charm', type: 'feat', flags: {[MGR]: {source: {sourceId: 'PERK-MOUNT-TEST-OFF'}}}, effects: [fx('Off', [{key: 'system.attributes.ac.bonus', mode: 2, value: '5'}], {disabled: true})]},
  {id: 'hat', name: '[TEST] Tiny Hat', type: 'equipment', flags: {[MGR]: {source: {sourceId: 'ITEM-PET-TEST-HAT'}}}},
  {id: 'scarf', name: '[TEST] Scarf', type: 'loot'},
  {id: 'boots', name: '[TEST] Paw Boots', type: 'equipment', flags: {[MODULE_ID]: {companion: {role: 'pet-clothing'}}}},
  {id: 'coat', name: '[TEST] Coat', type: 'loot'},
  {id: 'loyal', name: '[TEST] Loyal', type: 'feat', flags: {[MGR]: {source: {sourceId: 'PERK-PET-TEST-LOYAL'}}}},
  {id: 'cat', name: '[TEST] Cat', type: 'loot'}
];
/** A world Actor that can be linked as a mount or pet. */
function worldActor(id, {perms = {}} = {}) {
  return {documentName: 'Actor', id, uuid: `Actor.${id}`, name: `[TEST] ${id}`, img: `${id}.webp`, type: 'npc', calls: [],
    system: {attributes: {ac: {value: 12}, hp: {value: 19, max: 19}, movement: {speeds: {walk: 60}, units: 'ft'}}, details: {biography: {value: '<p>A [TEST] steed.</p>'}}},
    testUserPermission: (u, level) => u.isGM || ({NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3}[perms[u.id] ?? 'NONE'] >= {NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3}[level]),
    sheet: {render: o => { worlds.renders.push([id, o]); }}};
}
const worlds = {renders: []};
function setup({user = users.owner, settings = {petCap: 2}, actors = []} = {}) {
  installGlobals({user, settings});
  const map = new Map(actors.map(a => [a.uuid, a]));
  globalThis.fromUuidSync = uuid => map.get(uuid) ?? null;
  const actor = makeActor({items: ITEMS()});
  for (const d of ITEMS()) actor.items.get(d.id).effects = d.effects ?? [];
  return actor;
}
const stored = actor => actor.flags[MODULE_ID]?.companions ?? [];

test('saved entries from before 0.12.0 read unchanged; normalising is safe to repeat', () => {
  const old = {id: 'a', kind: 'mount', itemId: 'cat', perkItemIds: ['sure', 'sure', 7]};
  const once = c.cleanEntry(old), twice = c.cleanEntry(once);
  assert.deepEqual(once, {id: 'a', kind: 'mount', itemId: 'cat', actorUuid: null, name: '', description: '', perkItemIds: ['sure'], gearItemIds: [], clothing: []});
  assert.deepEqual(twice, once, 'idempotent');
  assert.deepEqual(c.cleanEntry({kind: 'pet', itemId: 'cat'}).clothing, [null, null, null]);
  assert.equal(c.cleanEntry({kind: 'pet'}), null); assert.equal(c.cleanEntry({kind: 'dragon', itemId: 'x'}), null);
  const actor = setup();
  actor.flags[MODULE_ID] = {companions: [old, {id: 'b', kind: 'pet', actorUuid: 'Actor.gone'}]};
  const d = c.companionsData(actor);
  assert.equal(d.mount.item.id, 'cat'); assert.deepEqual(d.mount.perks.map(p => p.id), ['sure']);
  assert.equal(d.pets[0].missing, true, 'a gone Actor stays listed (so it can be removed), marked missing');
});

test('roles: Hub flag first, then the permanent id prefix; unmarked items go by type', () => {
  const actor = setup(), it = id => actor.items.get(id);
  assert.deepEqual(['saddle', 'barding', 'sure', 'hat', 'boots', 'loyal', 'scarf'].map(id => companionRole(it(id))), ['mount-gear', 'mount-gear', 'mount-perk', 'pet-clothing', 'pet-clothing', 'pet-perk', null]);
  assert.deepEqual(routeForRole(it('saddle'), 'mount'), {ok: true, list: 'gear'});
  assert.match(routeForRole(it('saddle'), 'pet').error, /mount gear, not for a pet/);
  assert.deepEqual(routeForRole(it('scarf'), 'pet'), {ok: true, list: 'clothing'}, 'unmarked non-feature on a pet is clothing');
  assert.deepEqual(routeForRole(it('cat'), 'mount'), {ok: true, list: 'gear'});
  assert.deepEqual(routeForRole(makeItem({id: 'f', name: 'f', type: 'feat'}), 'pet'), {ok: true, list: 'perk'});
  assert.match(routeForRole(it('loyal'), 'pet', 'clothing').error, /not pet clothing/);
});

test('mount Actor: linked by UUID (never copied or changed); permission, world-only, self and duplicate checks', async () => {
  const steed = worldActor('steed', {perms: {owner: 'OBSERVER'}}), secret = worldActor('secret');
  let actor = setup({actors: [steed, secret]});
  assert.match((await c.addDroppedCompanion(actor, secret, 'mount')).error, /can't see/, 'players need Observer');
  assert.match((await c.addDroppedCompanion(actor, {...steed, uuid: 'Compendium.x.Actor.steed', pack: 'x'}, 'mount')).error, /Import/);
  assert.match((await c.addDroppedCompanion(actor, actor, 'mount')).error, /own companion/);
  const r = await c.addDroppedCompanion(actor, steed, 'mount');
  assert.equal(r.ok, true);
  assert.equal(stored(actor)[0].actorUuid, 'Actor.steed'); assert.equal(stored(actor)[0].itemId, null);
  assert.equal(actor.calls.filter(x => x[0] === 'createEmbedded').length, 0, 'no copy of the Actor');
  assert.equal(steed.calls.length, 0, 'the mount Actor is untouched');
  assert.match((await c.addDroppedCompanion(actor, steed, 'pet')).error, /already a companion/);
  installGlobals({user: users.gm, settings: {petCap: 2}}); globalThis.fromUuidSync = u => u === 'Actor.secret' ? secret : null;
  actor = makeActor({items: ITEMS()});
  assert.equal((await c.addDroppedCompanion(actor, secret, 'pet')).ok, true, 'the GM can link any world Actor');
  installGlobals({user: users.owner, settings: {petCap: 0}});
  assert.match((await c.addActorCompanion(makeActor(), steed, 'pet')).error, /can't have pets/, 'pet cap from 0.9.0 still applies');
});

test('gear, perks and three clothing slots go where the item\'s role says; wrong kind refused; detach keeps the Item', async () => {
  const actor = setup();
  await c.addCompanion(actor, 'cat', 'pet');
  const steedItem = makeItem({id: 'horse', name: '[TEST] Horse', type: 'loot'}, actor); actor.items.push(steedItem);
  await c.addCompanion(actor, 'horse', 'mount');
  const [pet, mount] = stored(actor).map(e => e.id);
  assert.equal((await c.attachExtra(actor, mount, 'saddle')).result, 'gear');
  assert.equal((await c.attachExtra(actor, mount, 'sure')).result, 'perk');
  assert.match((await c.attachExtra(actor, mount, 'hat')).error, /pet clothing, not for a mount/);
  assert.match((await c.attachExtra(actor, pet, 'barding')).error, /mount gear, not for a pet/);
  assert.equal((await c.attachExtra(actor, pet, 'hat', {slot: 1, list: 'clothing'})).ok, true);
  assert.match((await c.attachExtra(actor, pet, 'boots', {slot: 1, list: 'clothing'})).error, /slot is taken/);
  await c.attachExtra(actor, pet, 'boots'); await c.attachExtra(actor, pet, 'scarf');
  assert.deepEqual(stored(actor)[0].clothing, ['boots', 'hat', 'scarf']);
  assert.match((await c.attachExtra(actor, pet, 'coat', {list: 'clothing'})).error, /no free clothing slot/);
  assert.match((await c.attachExtra(actor, pet, 'saddle')).error, /already on a companion/);
  assert.equal((await c.attachPerk(actor, pet, 'loyal')).ok, true);
  await c.detachExtra(actor, pet, 'hat');
  assert.match((await c.attachPerk(actor, mount, 'hat')).error, /pet clothing, not for a mount/, 'the old perk select checks roles too');
  assert.deepEqual(stored(actor)[0].clothing, ['boots', null, 'scarf']);
  await c.detachExtra(actor, mount, 'saddle');
  assert.deepEqual(stored(actor)[1].gearItemIds, []);
  assert.ok(actor.items.get('hat') && actor.items.get('saddle'), 'Items stay on the character');
  assert.ok(!c.freeItemsFor(actor, 'mount').some(i => i.id === 'sure'), 'attached items are not offered again');
  assert.ok(c.freeItemsFor(actor, 'pet', 'clothing').some(i => i.id === 'hat'));
  assert.ok(!c.freeItemsFor(actor, 'pet').some(i => i.id === 'saddle'), 'mount gear is not offered to pets');
});

test('player text: name and description, trimmed and length-capped; owner only, part must be shown', async () => {
  const actor = setup();
  await c.addCompanion(actor, 'cat', 'pet');
  const id = stored(actor)[0].id;
  assert.equal((await c.setCompanionText(actor, id, 'name', '  Whiskers  ')).result, 'Whiskers');
  await c.setCompanionText(actor, id, 'description', 'x'.repeat(c.DESC_MAX + 50));
  assert.equal(stored(actor)[0].description.length, c.DESC_MAX);
  assert.equal(c.companionsData(actor).pets[0].displayName, 'Whiskers');
  assert.equal((await c.setCompanionText(actor, id, 'gm', 'x')).ok, false);
  installGlobals({user: users.observer});
  assert.equal((await c.setCompanionText(actor, id, 'name', 'Mine')).ok, false);
  installGlobals({user: users.owner, settings: {playerVisibility: {companions: false}}});
  assert.equal((await c.setCompanionText(actor, id, 'name', 'Hidden')).ok, false, 'refused while the GM hides Companions');
});

test('stats come only from the items\' own effects and armour; disabled skipped; transfer warned', () => {
  const actor = setup(), it = id => actor.items.get(id);
  const {lines, warnings} = companionStats([it('saddle'), it('barding'), it('sure'), it('off')], {owner: actor});
  const line = l => lines.find(x => x.label === l);
  assert.deepEqual(line('AC').parts.map(p => [p.text, p.source]), [['+1', '[TEST] Leather Barding'], ['+1', '[TEST] Surefooted']]);
  assert.equal(line('AC').total, 2, 'plain additions are summed');
  assert.deepEqual(line('Walk speed').parts.map(p => p.text), ['+10']);
  assert.deepEqual(line('Armor AC').parts.map(p => p.text), ['11']);
  assert.equal(line('Dexterity saves').parts[0].text, '= 2'); assert.equal(line('Dexterity saves').total, null);
  assert.ok(!lines.some(l => l.parts.some(p => p.source === '[TEST] Unused Charm')), 'disabled effects skipped');
  assert.deepEqual(warnings, []);
  it('saddle').effects[0].transfer = true;
  assert.match(companionStats([it('saddle')], {owner: actor}).warnings[0], /also applies to \[TEST\] Hero/);
  assert.equal(keyLabel('system.custom.thing'), 'system.custom.thing', 'unknown keys show as they are');
  assert.deepEqual([changeText(1, '2'), changeText(4, '15'), changeText(2, '-1')], ['×2', 'at least 15', '−1']);
  assert.equal(itemGives(it('sure')), 'AC +1; Dexterity saves = 2');
});

test('Companions tab: mount card with art, name and description boxes, stats, gear/perk card rows; pet clothing slots', async () => {
  const steed = worldActor('steed', {perms: {owner: 'OBSERVER'}});
  const actor = setup({actors: [steed]});
  await c.addDroppedCompanion(actor, steed, 'mount'); await c.addCompanion(actor, 'cat', 'pet');
  const [mount, pet] = stored(actor).map(e => e.id);
  await c.attachExtra(actor, mount, 'barding'); await c.attachExtra(actor, mount, 'sure'); await c.attachExtra(actor, pet, 'hat');
  const sheet = new (createHubSheetClass(FakeActorSheetV2))({document: actor}); sheet.tab = 'companions';
  const html = await sheet._renderHTML();
  assert.match(html, /agch-companion__art"><img src="steed.webp"/);
  assert.match(html, /data-edit="companion-name" data-entry="[^"]+" value="" maxlength="80" placeholder="\[TEST\] steed"/);
  assert.match(html, /data-edit="companion-desc"[^>]*placeholder="A \[TEST\] steed\."/, 'the Actor\'s own text until the player writes theirs');
  assert.match(html, /\[TEST\] steed's sheet:<\/span> AC 12 · HP 19 \/ 19 · (Speed|Walk) 60 ft/);
  assert.match(html, /<dt>AC<\/dt><dd><strong>\+2<\/strong>/);
  assert.match(html, /<ul class="ag-list agch-cards"[\s\S]*<span>Kind<\/span><span>Gives<\/span>[\s\S]*\[TEST\] Leather Barding[\s\S]*Mount gear[\s\S]*data-action="companion-unattach"/, 'card rows from 0.11.0');
  assert.match(html, /data-drop-companion="extra"/);
  assert.equal((html.match(/class="agch-clothing__slot/g) ?? []).length, 3, 'three clothing slots');
  assert.match(html, /data-action="item-sheet" data-id="hat"[^>]*aria-label="Clothing 2: \[TEST\] Tiny Hat"|aria-label="Clothing 1: \[TEST\] Tiny Hat"/);
  assert.match(html, /data-drop-companion="clothing" data-entry="[^"]+" data-slot="1"/);
  await EDITS['companion-name'](sheet, {dataset: {entry: mount}, value: 'Thunder'});
  assert.equal(stored(actor)[0].name, 'Thunder');
  await ACTIONS['companion-open'](sheet, {dataset: {entry: mount}});
  assert.deepEqual(worlds.renders.at(-1), ['steed', {force: true}]);
  installGlobals({user: users.observer, settings: {petCap: 2}}); globalThis.fromUuidSync = u => u === steed.uuid ? steed : null;
  const obs = new (createHubSheetClass(FakeActorSheetV2))({document: actor}); obs.tab = 'companions';
  const oh = await obs._renderHTML();
  assert.doesNotMatch(oh, /data-drop-companion/);
  assert.match(oh, /data-edit="companion-name"[^>]*disabled/);
  assert.doesNotMatch(oh, /steed's sheet/, 'no base stats when the viewer cannot see the mount Actor');
});
