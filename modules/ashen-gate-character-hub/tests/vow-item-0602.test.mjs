/** 0.60.2: Renown's Vow Item (flags.ashen-gate-factions.vowItem) is managed by Renown: not deletable by players, GM with a warning, grouped under Pantheon. Mocked Foundry. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users} from './foundry-mock.mjs';
import {deletePlan, deleteRowItem, openRowMenu} from '../scripts/row-delete.mjs';
import {featureOrigins, originGroups, originDefault} from '../scripts/feature-origin.mjs';
import {featuresData} from '../scripts/items.mjs';

const vow = {id: 'vow', name: 'Vow of Maren', type: 'feat', system: {type: {value: 'feat'}, uses: {max: 1, spent: 0}}, flags: {'ashen-gate-factions': {vowItem: {deityId: 'DEITY-MAREN', rewardId: 'r1'}}}};
const setup = (user, modules = {}) => { installGlobals({user, modules}); const a = makeActor({items: [vow, {id: 'alert', name: 'Alert', type: 'feat', system: {type: {value: 'feat'}}}]}); a.deleted = []; a.deleteEmbeddedDocuments = async (t, ids) => { a.deleted.push(...ids); }; for (const i of a.items) i.parent = a; return a; };

test('players cannot delete a Vow Item; the GM can, with a warning; nothing is deleted for a player', async () => {
  const p = setup(users.owner), plan = deletePlan(p, p.items.get('vow'), users.owner);
  assert.equal(plan.action, 'blocked'); assert.equal(plan.managed, 'renown'); assert.equal(plan.error, 'Managed by Renown: end your Vow in Pantheon.');
  assert.equal((await deleteRowItem(p, 'vow', {confirm: async () => true, user: users.owner})).ok, false); assert.deepEqual(p.deleted, []);
  const g = setup(users.gm), gp = deletePlan(g, g.items.get('vow'), users.gm), log = [];
  assert.equal(gp.action, 'delete'); assert.match(gp.warn, /Renown recreates it if the Vow is still sworn/);
  assert.equal((await deleteRowItem(g, 'vow', {confirm: async (m) => { log.push(m); return true; }, user: users.gm})).ok, true);
  assert.match(log[0], /Renown recreates it/); assert.deepEqual(g.deleted, ['vow']);
  assert.equal(deletePlan(p, p.items.get('alert'), users.owner).action, 'delete', 'ordinary feats are unaffected');
});
test('Features Origin: a Pantheon section per deity, found by the flag alone (no Renown module); default group turns to Origin', () => {
  const a = setup(users.owner);
  const rows = featuresData(a).groups.flatMap(g => g.items), groups = originGroups(rows, featureOrigins(a, rows));
  assert.deepEqual(groups.map(g => [g.label, g.items.map(r => r.id)]), [['Feats', ['alert']], ['Pantheon: Vow of Maren', ['vow']]]);
  assert.equal(originDefault(a), 'origin');
});
// A minimal DOM for the menu entries.
function menuFor(actor, modules, user) {
  installGlobals({user, modules});
  const made = {};
  const doc = {createElement: () => made.menu = {style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, querySelectorAll: () => [], remove() {}, set innerHTML(v) { made.html = v; }, offsetWidth: 100, offsetHeight: 50}};
  const content = {getBoundingClientRect: () => ({left: 0, top: 0, width: 400, height: 400}), appendChild() {}};
  const li = {dataset: {itemId: 'vow'}, ownerDocument: {...doc, activeElement: null}, closest: () => content, contains: () => false, getBoundingClientRect: () => ({left: 0, bottom: 0}), querySelector: () => null};
  openRowMenu({document: actor, element: content}, li, {act() {}});
  return made.html;
}
test('the menu shows Delete… disabled with the reason and Open Pantheon… only when Renown can open it', () => {
  const p = setup(users.owner);
  const withApi = menuFor(p, {'ashen-gate-factions': {active: true, api: {open: () => {}}}}, users.owner);
  assert.match(withApi, /data-rowmenu="pantheon"[^>]*>Open Pantheon…/); assert.match(withApi, /data-rowmenu="delete"[^>]*aria-disabled="true"/); assert.match(withApi, /Managed by Renown: end your Vow in Pantheon\./);
  const without = menuFor(setup(users.owner), {}, users.owner);
  assert.doesNotMatch(without, /Open Pantheon/); assert.match(without, /Managed by Renown/);
});
