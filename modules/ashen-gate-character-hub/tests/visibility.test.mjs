/** Player visibility: GM toggles, partner Player Access auto-hide, enforcement in the action layer (mocked Foundry; logic only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import * as v from '../scripts/visibility.mjs';
import * as c from '../scripts/companions.mjs';
import * as ia from '../scripts/item-actions.mjs';
import {visibleTabs} from '../scripts/views.mjs';
import {agPanelsFor, ashenGateTab, depositToParty, partyStashUsable} from '../scripts/partners.mjs';
import {canEdit} from '../scripts/actions.mjs';
import {createHubSheetClass} from '../scripts/sheet.mjs';
import {createApi, isPartnerSetting} from '../scripts/main.mjs';

const ITEMS = () => [
  {id: 'horse', name: '[TEST] Horse', type: 'loot'},
  {id: 'sword', name: '[TEST] Longsword', type: 'weapon', system: {quantity: 1, equipped: true}},
  {id: 'shield', name: '[TEST] Shield', type: 'equipment', system: {quantity: 1, equipped: true, type: {value: 'shield'}}}
];
const access = on => ({getState: () => ({contract: 'ag-player-access/1', playerAccessEnabled: on})});
/** Every partner active with the given Player Access; Utilities also has a stash that is on. */
function partners(on = true) {
  const mods = {};
  for (const p of v.PARTS.filter(x => x.partner)) mods[p.partner] = {active: true, api: {playerAccess: access(on), open() {}}};
  mods['ashen-gate-utilities'].api.stash = {isEnabled: () => true, deposit: async () => 'Stashed.'};
  mods['ashen-gate-utilities'].api.purse = {totals: () => ({gp: 1})};
  mods['ashen-gate-factions'].api.getFactions = () => [{name: '[TEST] Lantern Guild'}];
  return mods;
}
const sheetFor = (actor, tab) => { const Cls = createHubSheetClass(FakeActorSheetV2); const s = new Cls({document: actor}); s.tab = tab; return s; };

test('default: nothing stored, every part shown; setting is a GM-only world setting with default {}', () => {
  installGlobals({modules: partners()});
  assert.ok(Object.values(v.readVisibility()).every(x => x === true));
  for (const p of v.PARTS) assert.equal(v.hiddenReason(p.key), null, p.key);
  const reg = [];
  v.registerVisibilitySetting({register: (...a) => reg.push(a)});
  assert.deepEqual(reg.map(([, key, o]) => [key, o.scope, o.config, o.default]), [['playerVisibility', 'world', false, {}]]);
  assert.deepEqual(visibleTabs(users.owner).map(t => t.id), ['overview', 'combat', 'inventory', 'magic', 'features', 'ashen-gate', 'companions', 'journey']);
});

test('only the GM can change toggles; unknown parts and non-booleans are refused; presets just set the toggles', async () => {
  installGlobals({user: users.owner, modules: partners()});
  assert.match((await v.setVisibility({combat: false})).error, /Only the GM/);
  assert.match((await v.applyPreset('core')).error, /Only the GM/);
  assert.equal(game.settings.store.playerVisibility, undefined, 'nothing written');
  installGlobals({user: users.gm, modules: partners()});
  assert.match((await v.setVisibility({nope: false})).error, /Unknown/);
  assert.match((await v.setVisibility({combat: 'no'})).error, /true or false/);
  assert.equal((await v.setVisibility({combat: false})).ok, true);
  assert.equal(game.settings.store.playerVisibility.combat, false);
  await v.applyPreset('core');
  const core = game.settings.store.playerVisibility;
  assert.equal(core.overview && core.rest && core.equipment, true);
  assert.equal(core.renown || core.quests || core.partyStash || core.companions, false);
  await v.applyPreset('everything');
  assert.ok(Object.values(game.settings.store.playerVisibility).every(x => x === true));
});

test('a part turned off is gone for players and badged for the GM', async () => {
  const actor = makeActor({items: ITEMS()});
  installGlobals({user: users.owner, modules: partners(), settings: {playerVisibility: {combat: false, companions: false}}});
  assert.ok(!visibleTabs().some(t => t.id === 'combat' || t.id === 'companions'));
  let html = await sheetFor(actor, 'combat')._renderHTML();
  assert.doesNotMatch(html, /data-tab="combat"|data-tab="companions"|Hidden from players/);
  assert.match(html, /aria-label="Overview"/, 'falls back to the first shown tab');
  installGlobals({user: users.gm, modules: partners(), settings: {playerVisibility: {combat: false}}});
  html = await sheetFor(actor, 'combat')._renderHTML();
  assert.match(html, /data-tab="combat"[^>]*is-hidden/);
  assert.match(html, /Combat <span class="ag-badge ag-badge--warn agch-hidden"[^>]*><i class="fa-solid fa-eye-slash"[^>]*><\/i> Hidden from players: turned off in GM Setup/);
});

test('a partner with Player Access off, inactive, or refusing: its sub-tab vanishes for players; the GM sees why', () => {
  const actor = makeActor();
  const mods = partners();
  mods['ashen-gate-factions'].api.playerAccess = access(false);
  mods['ashen-gate-quest-manager'].active = false;
  mods['ashen-gate-locations'].api.playerAccess = {getState: () => { throw new Error('nope'); }};
  installGlobals({user: users.owner, modules: mods});
  assert.deepEqual(agPanelsFor().map(p => p.tab), ['Professions', 'Perks', 'Cinders', 'Base']);
  const html = ashenGateTab({actor, sheet: {agTab: 'ashen-gate-factions'}});
  assert.doesNotMatch(html, /Renown|Quests|Locations|Not available|Not installed/);
  installGlobals({user: users.gm, modules: mods});
  assert.equal(agPanelsFor().length, 7);
  assert.equal(v.hiddenReason('renown'), 'Renown Player Access is off');
  assert.equal(v.hiddenReason('quests'), 'Quest Log is not active');
  assert.equal(v.hiddenReason('locations'), 'Locations refuses player access');
  assert.match(ashenGateTab({actor, sheet: {agTab: 'ashen-gate-factions'}}), /Hidden from players: Renown Player Access is off/);
});

test('every Ashen Gate part hidden: no Ashen Gate tab for players; everything hidden leaves only the character', async () => {
  const actor = makeActor();
  installGlobals({user: users.owner, modules: partners(false)});
  assert.ok(!visibleTabs().some(t => t.id === 'ashen-gate'));
  const all = Object.fromEntries(v.PARTS.map(p => [p.key, false]));
  installGlobals({user: users.owner, modules: partners(), settings: {playerVisibility: all}});
  assert.deepEqual(visibleTabs().map(t => t.id), []);
  const html = await sheetFor(actor, 'overview')._renderHTML();
  assert.match(html, /hasn't shared any other sections yet/);
  assert.match(html, /agch-char/, 'the character column stays');
});

test('paper doll and rest buttons hidden for players (AC moves to a tile); the GM still has them with a badge', async () => {
  const actor = makeActor({items: ITEMS()});
  installGlobals({user: users.owner, modules: partners(), settings: {playerVisibility: {equipment: false, rest: false}}});
  let html = await sheetFor(actor, 'overview')._renderHTML();
  assert.doesNotMatch(html, /agch-doll|data-action="rest"/);
  assert.match(html, /agch-tiles--4[\s\S]*Armor Class/);
  installGlobals({user: users.gm, modules: partners(), settings: {playerVisibility: {equipment: false, rest: false}}});
  html = await sheetFor(actor, 'overview')._renderHTML();
  assert.match(html, /Hidden from players: turned off in GM Setup[\s\S]*agch-doll/);
  assert.match(html, /data-action="rest"[^>]*hidden from players/);
});

test('enforced in the action layer: companions, slot overrides, rests and stash moves refuse players while hidden', async () => {
  const hidden = {companions: false, equipment: false, rest: false, partyStash: false};
  installGlobals({user: users.owner, modules: partners(), settings: {playerVisibility: hidden, petCap: 2}});
  const actor = makeActor({items: ITEMS()});
  for (const r of [await c.addCompanion(actor, 'horse', 'mount'), await ia.rest(actor, 'long'), await ia.setSlot(actor, 'sword', 'offhand'),
    await ia.swapSlots(actor, 'sword', 'mainhand', 'shield', 'offhand'), await ia.equipItem(actor, 'sword', {slot: 'mainhand'}),
    await depositToParty(actor, 'sword', canEdit)]) assert.match(r.error, /The GM hasn't shared/);
  assert.deepEqual(actor.calls, [], 'nothing written, no rest taken');
  assert.equal(partyStashUsable(), false);
  assert.equal((await ia.equipItem(actor, 'shield')).ok, true, 'plain equip (Inventory) still works');
  // A hidden partner (Player Access off) blocks the stash move the same way.
  const mods = partners(); mods['ashen-gate-utilities'].api.playerAccess = access(false);
  installGlobals({user: users.owner, modules: mods});
  assert.match((await depositToParty(actor, 'sword', canEdit)).error, /The GM hasn't shared/);
  // The GM is never blocked.
  installGlobals({user: users.gm, modules: partners(), settings: {playerVisibility: hidden, petCap: 2}});
  assert.equal((await c.addCompanion(actor, 'horse', 'mount')).ok, true);
  assert.equal((await ia.rest(actor, 'short')).ok, true);
  assert.equal((await ia.setSlot(actor, 'sword', 'offhand')).ok, true);
});

test('GM Setup lists every part with presets; checkbox and preset buttons write the setting; players are refused', async () => {
  const actor = makeActor();
  const mods = partners(); mods['ashen-gate-factions'].api.playerAccess = access(false);
  installGlobals({user: users.gm, modules: mods, actors: [actor]});
  const sheet = sheetFor(actor, 'gm-setup');
  const html = await sheet._renderHTML();
  assert.match(html, /Player visibility/);
  for (const p of v.PARTS) assert.match(html, new RegExp(`data-edit="part-visibility" data-part="${p.key}" checked`));
  assert.match(html, /data-action="visibility-preset" data-preset="core"/);
  assert.match(html, /Ashen Gate: Renown \(and Pantheon\)<\/label><span class="ag-badge ag-badge--warn">[\s\S]*?Hidden from players: Renown Player Access is off/);
  await sheet._onHubChange({target: {dataset: {edit: 'part-visibility', part: 'magic'}, checked: false}});
  assert.equal(game.settings.store.playerVisibility.magic, false);
  await sheet.dispatch('visibility-preset', {dataset: {preset: 'everything'}}, {});
  assert.equal(game.settings.store.playerVisibility.magic, true);
  installGlobals({user: users.owner, modules: mods});
  const r = await sheet._onHubChange({target: {dataset: {edit: 'part-visibility', part: 'magic'}, checked: false}});
  assert.equal(r.ok, false);
});

test('public API and live refresh: playerVisibility reads, GM-only writes; partner setting changes are recognised by key', async () => {
  installGlobals({user: users.owner, modules: partners(), settings: {playerVisibility: {quests: false}}});
  const api = createApi().playerVisibility;
  assert.equal(api.parts().length, v.PARTS.length);
  assert.equal(api.get().quests, false);
  assert.equal(api.isShown('quests'), false);
  assert.equal(api.isShown('overview'), true);
  assert.equal(api.canSee('quests'), false);
  assert.equal(api.hiddenReason('quests'), 'turned off in GM Setup');
  assert.equal((await api.set({quests: true})).ok, false);
  assert.equal(isPartnerSetting({key: 'ashen-gate-factions.playerAccessEnabled'}), true);
  assert.equal(isPartnerSetting({key: 'ashen-gate-utilities.stashEnabled'}), true);
  assert.equal(isPartnerSetting({key: 'core.time'}), false);
});
