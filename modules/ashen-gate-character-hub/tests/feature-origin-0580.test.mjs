/**
 * 0.58.0 Features: Group → Origin and Sort → Uses remaining. Mocked Foundry and mocked partner APIs: this proves the grouping
 * logic and the markup, not the live Forge UI or the real partner modules.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass, EDITS} from '../scripts/sheet.mjs';
import {featureOrigins, originGroups, originDefault, hasPartnerOrigin} from '../scripts/feature-origin.mjs';
import {featuresData} from '../scripts/items.mjs';
import {listChoice, sortRows, ORGANIZE} from '../scripts/organize.mjs';

const Hub = createHubSheetClass(FakeActorSheetV2);
const L = 'ashen-gate-profession-ledger', T = 'ashen-gate-skill-trees', C = 'ashen-gate-cinders', M = 'ashen-gate-manager';
const feat = (id, name, extra = {}) => ({id, name, type: 'feat', system: {type: {value: 'feat'}, ...(extra.system ?? {})}, flags: extra.flags ?? {}});
const man = (sourceId, definition = {}) => ({[M]: {source: {sourceId, definition}}});
const ITEMS = () => [
  {id: 'fighter', name: '[TEST] Fighter', type: 'class', system: {levels: 3}},
  {id: 'elf', name: '[TEST] Elf', type: 'race', system: {}},
  feat('sw', '[TEST] Second Wind', {system: {type: {value: 'class'}, uses: {max: 2, spent: 2}}, flags: {dnd5e: {advancementOrigin: 'fighter'}}}),
  feat('fey', '[TEST] Fey Ancestry', {system: {type: {value: 'race'}}, flags: {dnd5e: {advancementOrigin: 'elf'}}}),
  feat('alert', '[TEST] Alert', {system: {type: {value: 'feat'}}}),
  feat('herb', '[TEST] Herbalism', {flags: man('PROF-HERBALISM')}),
  feat('perk1', '[TEST] Green Thumb', {system: {uses: {max: 3, spent: 1}}, flags: {[T]: {grant: {perkId: 'PERK-A', treeId: 'tree-herb', nodeId: 'n1'}}}}),
  feat('perk2', '[TEST] Deft Hands', {flags: {[T]: {grant: {perkId: 'PERK-B', treeId: 'tree-smith', nodeId: 'n2'}}}}),
  feat('sig', '[TEST] Keen Eye', {flags: {[L]: {grant: {by: 'signature', at: 1}}, ...man('PERK-SIG', {profession_id: 'PROF-HERBALISM'})}}),
  feat('ember', '[TEST] Ember Sight', {}),
  feat('emberp', '[TEST] Flare', {flags: {[T]: {grant: {perkId: 'PERK-C', treeId: 'tree-ember', nodeId: 'n3'}}}}),
  feat('misc', '[TEST] Odd Gift', {system: {type: {value: 'supernaturalGift'}}})
];
const actorWith = () => { const a = makeActor({items: ITEMS()}); for (const i of a.items) if (i.type === 'class') i.system.levels = 3; return a; };
const trees = [{treeId: 'tree-herb', name: 'Herbalism', kind: 'profession'}, {treeId: 'tree-smith', name: 'Smithing', kind: 'profession'}, {treeId: 'tree-ember', name: 'Ember tree', kind: 'cinder_milestone'}];
const mods = ({ledger = true, st = true, cinders = true} = {}) => ({
  ...(ledger ? {[L]: {active: true, api: {getProfessions: () => [{professionId: 'PROF-HERBALISM', name: 'Herbalism', level: 2}, {professionId: 'PROF-SMITHING', name: 'Smithing', level: 1}]}}} : {}),
  ...(st ? {[T]: {active: true, api: {actorProgress: () => [], pointsSummary: () => trees, listTrees: () => [{id: 'tree-herb', provider: {kind: 'profession'}, sourceRef: 'PROF-HERBALISM'}, {id: 'tree-smith', provider: {kind: 'profession'}, sourceRef: 'PROF-SMITHING'}],
    accounts: {contract: 'ag-tree-accounts/1', grants: () => ['perk1', 'perk2', 'emberp'].map(itemId => ({itemId, treeId: {perk1: 'tree-herb', perk2: 'tree-smith', emberp: 'tree-ember'}[itemId]}))}}}} : {}),
  ...(cinders ? {[C]: {active: true, api: {strain: {contract: 'ag-strain/1', get: () => ({value: 1, guaranteeAt: 10})}, cinder: {contract: 'ag-cinder/1', list: () => [{instanceId: 'ci1', name: 'Ember', treeId: 'tree-ember', signature: {active: {itemId: 'ember'}, passive: null}}]}}}} : {})
});
const rowsOf = actor => featuresData(actor).groups.flatMap(g => g.items);
const groupsFor = (opts, sort = 'name') => { installGlobals({modules: mods(opts)}); const a = actorWith(), rows = rowsOf(a); return originGroups(sortRows(rows, sort), featureOrigins(a, rows)); };
const names = g => g.items.map(r => r.id);
const render = async (settings = {}, opts = {}, tab = 'features') => { installGlobals({modules: mods(opts), settings}); const s = new Hub({document: actorWith()}); s.tab = tab; s.menu = `filters:${tab}`; return s._renderHTML(); };

test('origin sections, in order, with professions per profession and Cinder powers per Cinder', () => {
  const g = groupsFor();
  assert.deepEqual(g.map(x => x.label), ['Class and Subclass', 'Species and Background', 'Feats', 'Professions: Herbalism', 'Professions: Smithing', 'Cinder powers: Ember', 'Everything else']);
  assert.deepEqual(g.map(names), [['sw'], ['fey'], ['alert'], ['perk1', 'herb', 'sig'], ['perk2'], ['ember', 'emberp'], ['misc']]);
});
test('without partner modules profession and Cinder items fall into the dnd5e groups and nothing breaks', () => {
  const g = groupsFor({ledger: false, st: false, cinders: false});
  assert.ok(!g.some(x => /Professions|Cinder/.test(x.label)));
  const by = Object.fromEntries(g.map(x => [x.label, names(x).sort()]));
  assert.deepEqual(by['Feats'], ['alert', 'ember', 'emberp', 'herb', 'perk1', 'perk2', 'sig']);
  assert.deepEqual(by['Everything else'], ['misc']);
  installGlobals({modules: mods({ledger: false, st: false, cinders: false})});
  const a = actorWith();
  assert.equal(hasPartnerOrigin(featureOrigins(a, rowsOf(a))), false);
  assert.equal(originDefault(a), 'type');
});
test('each partner is independent: Ledger flag alone, Skill Trees alone, Cinders alone', () => {
  let g = groupsFor({ledger: false, st: false, cinders: true});
  assert.deepEqual(g.find(x => x.label === 'Cinder powers: Ember').items.map(r => r.id), ['ember']);
  assert.ok(!g.some(x => x.label.startsWith('Professions')));
  g = groupsFor({ledger: false, st: true, cinders: false});
  assert.deepEqual(g.find(x => x.label === 'Professions: Herbalism').items.map(r => r.id), ['perk1']);   // name from the tree row; the Ledger's flag-only item has no names
  assert.ok(g.some(x => x.label === 'Cinder powers: Ember tree'));                                      // no Cinders: the tree's own name
  g = groupsFor({ledger: true, st: false, cinders: false});
  assert.deepEqual(g.find(x => x.label === 'Professions: Herbalism').items.map(r => r.id).sort(), ['herb', 'sig']);
});
test('two trees whose sourceRef cannot be read are not merged: matched to the Ledger by name, else kept apart', () => {
  const m = mods(); m[T].api.listTrees = () => [];
  installGlobals({modules: m});
  let a = actorWith(), rows = rowsOf(a), g = originGroups(sortRows(rows, 'name'), featureOrigins(a, rows));
  assert.deepEqual(g.filter(x => x.section === 'profession').map(x => [x.label, names(x)]), [['Professions: Herbalism', ['perk1', 'herb', 'sig']], ['Professions: Smithing', ['perk2']]]);
  delete m[L]; installGlobals({modules: m});
  a = actorWith(); rows = rowsOf(a); g = originGroups(sortRows(rows, 'name'), featureOrigins(a, rows));
  assert.deepEqual(g.filter(x => x.section === 'profession').map(x => [x.label, names(x)]), [['Professions: Herbalism', ['perk1']], ['Professions: Smithing', ['perk2']]]);
});
test('a failing or refusing partner is ignored', () => {
  const m = mods(); m[T].api.accounts.grants = () => { throw new Error('Actor access denied'); }; m[C].api.cinder.list = () => { throw new Error('no'); }; m[L].api.getProfessions = () => { throw new Error('no'); };
  installGlobals({modules: m});
  const a = actorWith(), o = featureOrigins(a, rowsOf(a));
  assert.equal(o.get('perk1').section, 'feat');
  assert.equal(o.get('herb').label, '[TEST] Herbalism');   // the Ledger is active: the PROF item names itself
});
test('empty groups are hidden and the tab shows only the sections that have features', async () => {
  const html = await render();
  for (const label of ['Class and Subclass', 'Species and Background', 'Feats', 'Professions: Herbalism', 'Cinder powers: Ember', 'Everything else']) assert.match(html, new RegExp(label.replace(':', ':')));
  const a = makeActor({items: [feat('alert', '[TEST] Alert')]});
  installGlobals({modules: mods()});
  const rows = rowsOf(a), g = originGroups(rows, featureOrigins(a, rows));
  assert.deepEqual(g.map(x => x.label), ['Feats']);
});
test('default group: Origin only for a character with profession or Cinder features; a saved choice wins', async () => {
  let html = await render();
  assert.match(html, /<option value="origin" selected>Origin<\/option>/);
  assert.match(html, /Professions: Herbalism/);
  html = await render({listSort: {features: {group: 'type', sort: 'name'}}});
  assert.match(html, /<option value="type" selected>/); assert.doesNotMatch(html, /Professions: Herbalism/);
  html = await render({}, {ledger: false, st: false, cinders: false});
  assert.match(html, /<option value="type" selected>/); assert.doesNotMatch(html, /Class and Subclass/);
  installGlobals({modules: mods()});
  assert.equal(originDefault(actorWith()), 'origin');
});
test('sort modes: name, type, action type, has uses first, uses remaining', () => {
  assert.deepEqual(ORGANIZE.features.sorts.map(([k]) => k), ['name', 'type', 'action', 'uses', 'remaining']);
  const rows = [{id: 'a', name: 'A', uses: null}, {id: 'b', name: 'B', uses: {value: 0, max: 2}}, {id: 'c', name: 'C', uses: {value: 1, max: 3}}, {id: 'd', name: 'D', uses: {value: 3, max: 3}}, {id: 'e', name: 'E', uses: null, actType: 'bonus'}];
  assert.deepEqual(sortRows(rows, 'remaining').map(r => r.id), ['d', 'c', 'b', 'a', 'e']);
  assert.deepEqual(sortRows(rows, 'name').map(r => r.id), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(sortRows([{id: 'p', name: 'A'}, {id: 'r', name: 'B', actType: 'reaction'}, {id: 'x', name: 'C', actType: 'action'}, {id: 'y', name: 'D', actType: 'bonus'}], 'action').map(r => r.id), ['x', 'y', 'r', 'p']);
  const g = groupsFor({}, 'remaining').find(x => x.label === 'Professions: Herbalism');
  assert.deepEqual(names(g), ['perk1', 'herb', 'sig']);   // inside a profession the chosen sort applies
});
test('persistence: the choice is a per-user client setting; changing Sort keeps the effective Origin group', async () => {
  const reg = []; const {registerListSortSetting} = await import('../scripts/organize.mjs');
  registerListSortSetting({register: (m, k, d) => reg.push([k, d])});
  assert.equal(reg[0][1].scope, 'client');
  installGlobals({modules: mods()});
  const a = actorWith(), s = new Hub({document: a}); s.render = () => {};
  const r = await EDITS['list-sort'](s, {dataset: {tab: 'features', field: 'sort'}, value: 'remaining'});
  assert.equal(r.ok, true);
  assert.deepEqual(game.settings.store.listSort.features, {group: 'origin', sort: 'remaining'});
  assert.deepEqual(listChoice('features'), {group: 'origin', sort: 'remaining'});
  await EDITS['list-sort'](s, {dataset: {tab: 'features', field: 'group'}, value: 'none'});
  assert.deepEqual(listChoice('features'), {group: 'none', sort: 'remaining'});
  installGlobals({modules: mods({ledger: false, st: false, cinders: false})});
  const plain = new Hub({document: actorWith()}); plain.render = () => {};
  await EDITS['list-sort'](plain, {dataset: {tab: 'features', field: 'sort'}, value: 'name'});
  assert.deepEqual(game.settings.store.listSort.features, {group: 'type', sort: 'name'});
});
test('markup: the Group and Sort selects are labelled, rows keep the compact system', async () => {
  const html = await render({}, {}, 'features');
  assert.match(html, /aria-label="Group"/); assert.match(html, /aria-label="Sort"/);
  assert.match(html, /<option value="remaining">Uses remaining<\/option>/);
  assert.match(html, /agch-crows agch-crows--features/);
});
