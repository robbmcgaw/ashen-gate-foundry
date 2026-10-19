import test from 'node:test';
import assert from 'node:assert/strict';
import {MODULE_ID, exportedFields} from '../scripts/core.js';
import {ITEM_FLAG, ACTOR_ITEMS_FLAG, itemKeys, matchActors, planActor, applyActorUpdate} from '../scripts/actor-update.js';

const GM = {isGM: true}, PLAYER = {isGM: false};
const setPath = (obj, path, value) => {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = value;
};

function record(over = {}) {
  return {id: 'ACT-TEST-WARDEN', entity_type: 'Actor', status: 'approved', version: '1.0.0', visibility: 'gm', refs: [], provenance: {source: 'test'},
    foundry: {document_type: 'Actor', data: {name: '[TEST] Warden', type: 'npc', img: 'icons/test/warden.webp',
      prototypeToken: {disposition: -1, texture: {src: 'icons/test/warden.webp'}},
      system: {attributes: {hp: {value: 20, max: 20}}, details: {biography: {value: '<p>[TEST] bio</p>'}}},
      items: [{name: '[TEST] Claw', type: 'weapon', system: {description: {value: 'Old claw'}, quantity: 1, uses: {spent: 0}}}],
      ...over}}};
}

// A world Actor as Manager created it from `rec`, then played: damaged, levelled, a condition, a player item, other modules' flags.
function worldActor(rec, extra = {}) {
  const data = structuredClone(rec.foundry.data);
  const keys = itemKeys(data.items);
  const raw = {_id: 'a1', ...data, folder: 'gm-folder', ownership: {default: 0, player1: 3},
    items: data.items.map((item, i) => ({_id: `i${i}`, ...item, flags: {[MODULE_ID]: {[ITEM_FLAG]: keys[i]}}})),
    effects: [{_id: 'e1', name: 'Poisoned', statuses: ['poisoned']}],
    flags: {[MODULE_ID]: {source: {sourceId: rec.id, managedFields: exportedFields(rec)}, [ACTOR_ITEMS_FLAG]: {version: 1}},
      'ashen-gate-profession-ledger': {progress: {xp: 5}}, 'ashen-gate-factions': {renown: 3}, 'ashen-gate-skill-trees': {spent: ['n1']}}};
  raw.system.attributes.hp.value = 7;
  raw.system.details.xp = {value: 900};
  raw.system.details.biography.value = '<p>GM notes</p>';
  raw.items[0].system.quantity = 3;
  raw.items[0].system.uses.spent = 2;
  raw.items.push({_id: 'p1', name: 'Rope', type: 'loot', system: {quantity: 1}, flags: {}});
  return mockDoc(Object.assign(raw, extra));
}

function mockDoc(raw) {
  const calls = [];
  return {raw, calls,
    toObject: () => structuredClone(raw),
    async update(patch) { calls.push(['update', patch]); for (const [p, v] of Object.entries(patch)) setPath(raw, p, structuredClone(v)); },
    async updateEmbeddedDocuments(type, list) {
      calls.push(['updateItems', list]);
      for (const {_id, ...patch} of list) { const item = raw.items.find(i => i._id === _id); for (const [p, v] of Object.entries(patch)) setPath(item, p, structuredClone(v)); }
    },
    async createEmbeddedDocuments(type, list) { calls.push(['createItems', list]); list.forEach((item, n) => raw.items.push({_id: `new${n}`, ...structuredClone(item)})); }};
}

const newSource = rec => ({sourceId: rec.id, managedFields: exportedFields(rec)});
async function run(rec, doc, opts = {updateExisting: true}) {
  const plan = planActor(rec, [doc.toObject()], opts);
  if (plan.action === 'update') await applyActorUpdate(doc, plan, {user: GM, source: newSource(rec)});
  return plan;
}

const v2 = () => {
  const rec = record({name: '[TEST] Warden Captain', img: 'icons/test/captain.webp', prototypeToken: {disposition: 0, texture: {src: 'icons/test/captain.webp'}}});
  rec.foundry.data.items[0].system.description.value = 'New claw';
  rec.foundry.data.items[0].system.quantity = 1;
  rec.foundry.data.items.push({name: '[TEST] Roar', type: 'feat', system: {description: {value: 'Roar'}}});
  rec.foundry.data.system.attributes.hp = {value: 40, max: 40};
  rec.foundry.data.flags = {'ashen-gate-factions': {renown: 0}};
  return rec;
};

test('default off: an existing Actor is listed SKIPPED and nothing is written', async () => {
  const doc = worldActor(record());
  const before = structuredClone(doc.raw);
  const plan = await run(v2(), doc, {});
  assert.equal(plan.action, 'skipped');
  assert.match(plan.reason, /Update existing actors/);
  assert.deepEqual(doc.calls, []);
  assert.deepEqual(doc.raw, before);
});

test('opt-in: owned fields update and the preview lists exactly which fields change', async () => {
  const doc = worldActor(record());
  const plan = await run(v2(), doc);
  assert.equal(plan.action, 'update');
  assert.deepEqual(plan.changes, [
    'name: "[TEST] Warden" → "[TEST] Warden Captain"',
    'img: "icons/test/warden.webp" → "icons/test/captain.webp"',
    'prototypeToken.disposition: -1 → 0',
    'prototypeToken.texture.src: "icons/test/warden.webp" → "icons/test/captain.webp"',
    'update item "[TEST] Claw": system.description.value',
    'add item "[TEST] Roar"'
  ]);
  assert.equal(doc.raw.name, '[TEST] Warden Captain');
  assert.equal(doc.raw.img, 'icons/test/captain.webp');
  assert.equal(doc.raw.prototypeToken.disposition, 0);
  assert.equal(doc.raw.items.find(i => i._id === 'i0').system.description.value, 'New claw');
  const roar = doc.raw.items.find(i => i.name === '[TEST] Roar');
  assert.equal(roar.flags[MODULE_ID][ITEM_FLAG], 'feat:[TEST] Roar');
});

test('play state, player items, notes, folder, ownership and other modules\' flags are preserved', async () => {
  const doc = worldActor(record());
  await run(v2(), doc);
  const r = doc.raw;
  assert.equal(r.system.attributes.hp.value, 7, 'current HP kept (system is never written)');
  assert.equal(r.system.attributes.hp.max, 20, 'system values are not package-owned');
  assert.deepEqual(r.system.details.xp, {value: 900});
  assert.equal(r.system.details.biography.value, '<p>GM notes</p>');
  assert.deepEqual(r.effects, [{_id: 'e1', name: 'Poisoned', statuses: ['poisoned']}]);
  assert.equal(r.folder, 'gm-folder');
  assert.deepEqual(r.ownership, {default: 0, player1: 3});
  assert.deepEqual(r.flags['ashen-gate-profession-ledger'], {progress: {xp: 5}});
  assert.deepEqual(r.flags['ashen-gate-factions'], {renown: 3}, 'package flags never overwrite another module');
  assert.deepEqual(r.flags['ashen-gate-skill-trees'], {spent: ['n1']});
  const claw = r.items.find(i => i._id === 'i0');
  assert.equal(claw.system.quantity, 3);
  assert.equal(claw.system.uses.spent, 2);
  assert.deepEqual(r.items.find(i => i._id === 'p1'), {_id: 'p1', name: 'Rope', type: 'loot', system: {quantity: 1}, flags: {}});
  const written = doc.calls.filter(([kind]) => kind === 'update').flatMap(([, p]) => Object.keys(p));
  assert.ok(!written.some(k => /^(system|effects|folder|ownership)\b|flags\.ashen-gate-(?!manager)/.test(k)), written.join(', '));
});

test('a GM edit to a field the package did not change is kept', async () => {
  const doc = worldActor(record());
  doc.raw.name = '[TEST] Renamed by GM';
  const rec = record();
  rec.foundry.data.prototypeToken.disposition = 1;
  const plan = await run(rec, doc);
  assert.deepEqual(plan.changes, ['prototypeToken.disposition: -1 → 1']);
  assert.equal(doc.raw.name, '[TEST] Renamed by GM');
});

test('missing actor is created', () => {
  const plan = planActor(record(), [], {updateExisting: true});
  assert.equal(plan.action, 'create');
});

test('matching is by canonical id only: a same-name Actor with another id is never updated', () => {
  const other = worldActor(record());
  other.raw.flags[MODULE_ID].source.sourceId = 'ACT-TEST-OTHER';
  const unmanaged = mockDoc({_id: 'u', name: '[TEST] Warden', type: 'npc', flags: {}});
  assert.deepEqual(matchActors(record(), [other, unmanaged]), []);
  assert.equal(planActor(record(), [], {updateExisting: true}).action, 'create');
  const blocked = planActor(record(), [], {updateExisting: true, sameNameUnmanaged: true});
  assert.equal(blocked.action, 'blocked', 'an unflagged same-name Actor blocks, never adopts');
  assert.deepEqual(other.calls, []);
  assert.deepEqual(matchActors(record(), [other, worldActor(record())]).length, 1);
});

test('re-runnable: the second run changes nothing', async () => {
  const doc = worldActor(record());
  await run(v2(), doc);
  const snapshot = structuredClone(doc.raw), calls = doc.calls.length;
  const again = await run(v2(), doc);
  assert.equal(again.action, 'unchanged');
  assert.equal(doc.calls.length, calls);
  assert.deepEqual(doc.raw, snapshot);
});

test('Actors imported before 0.19.0 (unmarked items) adopt their package item once, not player copies', async () => {
  const doc = worldActor(record());
  delete doc.raw.flags[MODULE_ID][ACTOR_ITEMS_FLAG];
  delete doc.raw.items[0].flags[MODULE_ID];
  const plan = await run(v2(), doc);
  assert.deepEqual(plan.patch.items.adopt, [{_id: 'i0', key: 'weapon:[TEST] Claw'}]);
  assert.equal(doc.raw.items.find(i => i._id === 'i0').flags[MODULE_ID][ITEM_FLAG], 'weapon:[TEST] Claw');
  assert.equal(doc.raw.flags[MODULE_ID][ACTOR_ITEMS_FLAG].version, 1);
  assert.equal((await run(v2(), doc)).action, 'unchanged');

  const twice = worldActor(record());
  delete twice.raw.flags[MODULE_ID][ACTOR_ITEMS_FLAG];
  delete twice.raw.items[0].flags[MODULE_ID];
  twice.raw.items.push({...structuredClone(twice.raw.items[0]), _id: 'dup'});
  const ambiguous = planActor(v2(), [twice.toObject()], {updateExisting: true});
  assert.ok(!ambiguous.patch.items.update.length && !ambiguous.patch.items.adopt.length);
  assert.match(ambiguous.reason, /2 unmarked copies/);
});

test('GM only: applying is rejected for a player in the data layer', async () => {
  const doc = worldActor(record());
  const plan = planActor(v2(), [doc.toObject()], {updateExisting: true});
  await assert.rejects(applyActorUpdate(doc, plan, {user: PLAYER, source: newSource(v2())}), /Only a GM/);
  assert.deepEqual(doc.calls, []);
});

test('two Actors with one id, a type change or no baseline are blocked', () => {
  const a = worldActor(record()).toObject();
  assert.equal(planActor(record(), [a, a], {updateExisting: true}).action, 'blocked');
  const rec = record({type: 'character'});
  assert.equal(planActor(rec, [a], {updateExisting: true}).action, 'blocked');
  delete a.flags[MODULE_ID].source.managedFields;
  assert.equal(planActor(v2(), [a], {updateExisting: true}).action, 'blocked');
});
