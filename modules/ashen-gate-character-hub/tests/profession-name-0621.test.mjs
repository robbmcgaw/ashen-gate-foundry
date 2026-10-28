/**
 * 0.62.1 Features: a profession's name reads without " — Profession" (heading and rows). Mocked Foundry and mocked partner APIs:
 * this proves the logic and the markup, not the live Forge UI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass, applyFilter} from '../scripts/sheet.mjs';
import {featureOrigins, originGroups} from '../scripts/feature-origin.mjs';
import {featuresData} from '../scripts/items.mjs';
import {sortRows} from '../scripts/organize.mjs';
import {displayProfessionName as dn, professionRow} from '../scripts/profession-name.mjs';
import {activeHidden} from '../scripts/hidden-groups.mjs';

const L = 'ashen-gate-profession-ledger', M = 'ashen-gate-manager';
const feat = (id, name, flags = {}) => ({id, name, type: 'feat', system: {type: {value: 'feat'}}, flags});
const man = sourceId => ({[M]: {source: {sourceId, definition: {}}}});
const mods = () => ({[L]: {active: true, api: {getProfessions: () => [{professionId: 'PROF-ART', name: '[TEST] Artistry — Profession'}, {professionId: 'PROF-ARCH', name: 'Archaeology'}]}}});
const make = () => {
  const a = makeActor({perms: undefined, items: [feat('alert', '[TEST] Alert'), feat('art', '[TEST] Artistry — Profession', man('PROF-ART')), feat('arch', 'Archaeology - Profession', man('PROF-ARCH')), feat('plain', 'Mapmaking', man('PROF-ARCH')), feat('odd', 'Not A Profession — Profession')]});
  for (const i of a.items) i.parent = a;
  return a;
};
const rowsOf = a => featuresData(a).groups.flatMap(g => g.items);
const Hub = createHubSheetClass(FakeActorSheetV2);

test('displayProfessionName: strips the suffix in em dash, en dash and hyphen forms; keeps [TEST]; leaves other names alone', () => {
  assert.equal(dn('Archaeology — Profession'), 'Archaeology');
  assert.equal(dn('Archaeology - Profession'), 'Archaeology');
  assert.equal(dn('Archaeology – profession'), 'Archaeology');
  assert.equal(dn('[TEST] Artistry — Profession'), '[TEST] Artistry');
  assert.equal(dn('Archaeology'), 'Archaeology');
  assert.equal(dn('Profession'), 'Profession');
  assert.equal(dn('— Profession'), '— Profession', 'never reduced to nothing');
  assert.equal(dn('Professional Guide'), 'Professional Guide');
  assert.equal(dn('Self-Profession Rites'), 'Self-Profession Rites');
  assert.equal(dn(undefined), '');
});
test('professionRow: only rows of a profession group change, and keep the full name for search', () => {
  const r = {id: 'x', name: 'Archaeology — Profession'};
  assert.deepEqual(professionRow(r, {section: 'profession'}), {id: 'x', name: 'Archaeology', fullName: 'Archaeology — Profession'});
  assert.equal(professionRow(r, {section: 'feat'}), r);
  assert.equal(professionRow({id: 'y', name: 'Mapmaking'}, {section: 'profession'}).fullName, undefined);
});
test('Origin headings read "Professions: Archaeology" and keys do not change', () => {
  installGlobals({users, user: users.owner, modules: mods()});
  const a = make(), rows = rowsOf(a), g = originGroups(sortRows(rows, 'name'), featureOrigins(a, rows));
  assert.deepEqual(g.filter(x => x.section === 'profession').map(x => [x.label, x.key]), [['Professions: [TEST] Artistry', 'profession-PROF-ART'], ['Professions: Archaeology', 'profession-PROF-ARCH']]);
});
test('a hidden-group key stored by 0.62.0 still hides the same group', () => {
  installGlobals({user: users.owner, modules: mods()});
  const a = make(); a.flags = {'ashen-gate-character-hub': {hiddenFeatureGroups: ['profession-PROF-ARCH']}};
  const rows = rowsOf(a), g = originGroups(rows, featureOrigins(a, rows));
  assert.deepEqual([...activeHidden(a, g)], ['profession-PROF-ARCH']);
});
test('the Features tab shows short names in headings and rows; a non-profession item keeps its name; sort order is by the short name', async () => {
  installGlobals({user: users.owner, modules: mods()});
  const s = new Hub({document: make()}); s.tab = 'features';
  const html = await s._renderHTML();
  assert.match(html, /Professions: Archaeology</); assert.match(html, /Professions: \[TEST\] Artistry</);
  assert.doesNotMatch(html, /Professions: [^<]*Profession</);
  assert.match(html, />Archaeology<\/button>/); assert.match(html, />\[TEST\] Artistry<\/button>/);
  assert.match(html, />Not A Profession — Profession<\/button>/, 'an item outside the profession groups is untouched');
  assert.ok(html.indexOf('>Archaeology</button>') < html.indexOf('>Mapmaking</button>'), 'rows in a group sort by the short name');
  assert.match(html, /data-fullname="\[TEST\] Artistry — Profession"/);
});
test('search finds a profession row by its short name or its full name', () => {
  installGlobals({user: users.owner});
  const li = (name, full) => ({hidden: false, querySelector: () => ({textContent: name}), getAttribute: n => n === 'data-fullname' ? full : null});
  const a = li('Archaeology', 'Archaeology — Profession'), b = li('Alert', null);
  const root = {querySelectorAll: sel => sel.includes('.agch-sec') || sel.includes('agch-contents') ? [] : [a, b]};
  for (const q of ['archaeology', 'ARCHAEOLOGY — profession', 'profession']) { applyFilter(root, q); assert.deepEqual([a.hidden, b.hidden], [false, true], q); }
});
