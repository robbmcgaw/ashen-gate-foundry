/** 0.60.0 Delete from a list row: permission and protections are decided in the data layer; the confirmation names the item and Cancel is the default. Mocked Foundry; the menu itself is checked in a real browser. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users} from './foundry-mock.mjs';
import {deletePlan, deleteRowItem, neighbourRowId, rowOf} from '../scripts/row-delete.mjs';
import {MODULE_ID} from '../scripts/constants.mjs';

const ITEMS = () => [
  {id: 'rope', name: '[TEST] Rope', type: 'loot'},
  {id: 'bless', name: '[TEST] Bless', type: 'spell'},
  {id: 'alert', name: '[TEST] Alert', type: 'feat', flags: {dnd5e: {advancementOrigin: 'fighter'}}},
  {id: 'fighter', name: '[TEST] Fighter', type: 'class'},
  {id: 'elf', name: '[TEST] Elf', type: 'race'},
  {id: 'perk', name: '[TEST] Green Thumb', type: 'feat', flags: {'ashen-gate-skill-trees': {grant: {treeId: 't'}}}},
  {id: 'herb', name: '[TEST] Herbalism', type: 'feat', flags: {'ashen-gate-profession-ledger': {grant: {by: 'assign'}}}},
  {id: 'ember', name: '[TEST] Ember Sight', type: 'feat'},
  {id: 'hat', name: '[TEST] Pet Hat', type: 'equipment', flags: {[MODULE_ID]: {companion: {role: 'pet-clothing'}}}},
  {id: 'bag', name: '[TEST] Bag', type: 'container'}
];
function setup(user = users.owner) {
  installGlobals({user, modules: {'ashen-gate-cinders': {active: true, api: {cinder: {contract: 'ag-cinder/1', list: () => [{instanceId: 'c1', name: 'Ember', signature: {active: {itemId: 'ember'}}}]}, sockets: {contract: 'ag-sockets/1', hosts: () => []}}}}});
  const actor = makeActor({items: ITEMS()}); actor.deleted = [];
  actor.deleteEmbeddedDocuments = async (t, ids) => { actor.deleted.push(...ids); };
  actor.flags[MODULE_ID] = {companionSlots: {version: 2, pets: ['Actor.cat'], mounts: [], activePets: ['Actor.cat', null, null], activeMount: null, gear: {cat: {head: 'hat'}}, perks: {}, labels: {}}};
  for (const i of actor.items) i.parent = actor;
  return actor;
}
const confirmWith = (answer, log = []) => async (msg, o) => { log.push([msg, o]); return answer; };

test('an owner deletes an ordinary item, spell or feat after a labelled confirmation; nothing happens on Cancel', async () => {
  const a = setup(), log = [];
  for (const id of ['rope', 'bless']) {
    assert.equal((await deleteRowItem(a, id, {confirm: confirmWith(false, log)})).result, null);
  }
  assert.deepEqual(a.deleted, [], 'Cancel deletes nothing');
  assert.equal(log[0][1].title, 'Delete [TEST] Rope?'); assert.equal(log[0][1].yes, 'Delete [TEST] Rope'); assert.match(log[0][0], /removes it from the character sheet/);
  const r = await deleteRowItem(a, 'rope', {confirm: confirmWith(true)});
  assert.deepEqual([r.ok, r.result, a.deleted], [true, 'rope', ['rope']]);
  assert.equal((await deleteRowItem(a, 'bless', {confirm: confirmWith(true)})).ok, true);
});
test('the real confirmation is a danger confirmation: Cancel is the default button', async () => {
  const dialogs = [];
  globalThis.foundry = {applications: {api: {DialogV2: {wait: async o => { dialogs.push(o); return false; }}}}};
  const a = setup(); await deleteRowItem(a, 'rope');
  delete globalThis.foundry;
  const btns = dialogs[0].buttons;
  assert.deepEqual(btns.map(b => [b.action, b.default]), [['cancel', true], ['confirm', false]]); assert.equal(btns[1].label, 'Delete [TEST] Rope');
});
test('permission is enforced in the handler: an observer and an item that is not on the character are refused', async () => {
  const a = setup(users.observer);
  const r = await deleteRowItem(a, 'rope', {confirm: confirmWith(true)});
  assert.equal(r.ok, false); assert.match(r.error, /don't own/); assert.deepEqual(a.deleted, []);
  const o = setup(); assert.match((await deleteRowItem(o, 'nope', {confirm: confirmWith(true)})).error, /no longer on this character/);
  const other = makeActor({items: [{id: 'x', name: 'X', type: 'loot'}]}); other.id = 'actor2';
  assert.equal(deletePlan(o, other.items.get('x')).action, 'blocked', 'an item of another actor');
});
test('Skill Trees perk copies are never hard-deleted, not even by the GM; the way out is offered', async () => {
  for (const user of [users.owner, users.gm]) {
    const a = setup(user), p = deletePlan(a, a.items.get('perk'), user);
    assert.equal(p.action, 'blocked'); assert.equal(p.managed, 'trees'); assert.match(p.error, /managed by Skill Trees.*refunding/);
    assert.equal((await deleteRowItem(a, 'perk', {confirm: confirmWith(true), user})).ok, false); assert.deepEqual(a.deleted, []);
  }
});
test('Ledger features, Cinder power items and companion gear: refused for players, allowed (with a warning) for the GM', async () => {
  for (const [id, re] of [['herb', /Profession Ledger/], ['ember', /managed by Cinders/], ['hat', /assigned to a companion/]]) {
    const a = setup(), plan = deletePlan(a, a.items.get(id), users.owner);
    assert.equal(plan.action, 'blocked', id); assert.match(plan.error, re);
    assert.equal((await deleteRowItem(a, id, {confirm: confirmWith(true), user: users.owner})).ok, false); assert.deepEqual(a.deleted, []);
    const g = setup(users.gm), log = [], gp = deletePlan(g, g.items.get(id), users.gm);
    assert.equal(gp.action, 'delete'); assert.match(gp.warn, re);
    assert.equal((await deleteRowItem(g, id, {confirm: confirmWith(true, log), user: users.gm})).ok, true); assert.deepEqual(g.deleted, [id]); assert.match(log[0][0], re);
  }
});
test('class, species: GM only through dnd5e\'s own dialog; advancement-granted features get a warning; containers use dnd5e\'s dialog', async () => {
  const a = setup();
  for (const id of ['fighter', 'elf']) assert.match(deletePlan(a, a.items.get(id), users.owner).error, /Only the GM/);
  const g = setup(users.gm); let asked = 0; g.items.get('fighter').deleteDialog = async () => { asked++; };
  assert.equal(deletePlan(g, g.items.get('fighter'), users.gm).action, 'dnd5e');
  await deleteRowItem(g, 'fighter', {user: users.gm}); assert.equal(asked, 1); assert.deepEqual(g.deleted, [], 'dnd5e does the deleting');
  const log = []; await deleteRowItem(a, 'alert', {confirm: confirmWith(false, log)}); assert.match(log[0][0], /granted by advancement/);
  a.items.get('bag').deleteDialog = async () => {}; assert.equal(deletePlan(a, a.items.get('bag'), users.owner).action, 'dnd5e');
});
test('rowOf / neighbourRowId: rows only inside the Hub body, never in a partner embed; focus goes to the next row, else the previous', () => {
  const li = (id, parent) => ({dataset: {itemId: id}, parentElement: parent, closest: s => s === '.agch-body' ? {} : null});
  const ul = {}; const rows = ['a', 'b', 'c'].map(id => li(id, ul)); ul.querySelectorAll = () => rows;
  assert.equal(neighbourRowId(rows[1]), 'c'); assert.equal(neighbourRowId(rows[2]), 'b'); const only = li('z', null); only.parentElement = {querySelectorAll: () => [only]}; assert.equal(neighbourRowId(only), null, 'the last row has no neighbour');
  const target = {closest: s => s === 'li[data-item-id]' ? rows[0] : null};
  assert.equal(rowOf(target), rows[0]);
  assert.equal(rowOf({closest: s => s.includes('.agch-embed') ? {} : rows[0]}), null);
});
