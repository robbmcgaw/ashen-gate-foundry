// 0.37.0: Item records carry Active Effects. Mocked Foundry documents: proves the import logic, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MODULE_ID, validatePackage, exportedFields, planRecord} from '../scripts/core.js';
import {planItemEffects, applyItemEffects, effectCreateData, effectDefinition, normalizeMode, allowedItemFlags, flagWarnings, effectSummary, liveEffects, EFFECT_FLAG} from '../scripts/item-effects.js';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const GM = {isGM: true}, PLAYER = {isGM: false};
const walk = (over = {}) => ({eff_id: 'walk', name: '[TEST] Saddle: Walk speed', img: 'icons/svg/aura.svg', transfer: false,
  changes: [{key: 'system.attributes.movement.walk', mode: 'add', value: 10}], ...over});
const saddle = (effects = [walk()], data = {}) => ({id: 'ITEM-MOUNT-TEST-SADDLE', entity_type: 'Item', status: 'approved', version: '1.0.0',
  visibility: 'player', scope: 'generic_rules', refs: [], provenance: {sources: ['[TEST] synthetic']},
  foundry: {document_type: 'Item', data: {name: '[TEST] Riding Saddle', type: 'equipment',
    system: {description: {value: '<p>[TEST] A placeholder saddle.</p>'}}, effects,
    flags: {'ashen-gate-character-hub': {companion: {role: 'mount-gear'}}}, ...data}}});
const pkg = (records, schema = 'ag-foundry-import/0.2') => ({manifest: {schema_version: schema, package_id: 'AG-TEST-EFFECTS', version: '1.0.0'}, records});

// A world Item with an embedded effects collection that behaves like Foundry: create adds defaults, update expands dotted keys.
function mockItem(effects = []) {
  let n = 0;
  const list = [];
  const setPath = (o, path, v) => { const k = path.split('.'); let x = o; for (const p of k.slice(0, -1)) x = x[p] ??= {}; x[k.at(-1)] = v; };
  const store = raw => ({_id: raw._id ?? `e${++n}`, description: '', img: null, disabled: false, transfer: true, statuses: [],
    duration: {startTime: null, seconds: null, combat: null, rounds: null, turns: null}, ...structuredClone(raw),
    changes: (raw.changes ?? []).map(c => ({...c, value: String(c.value), priority: c.priority ?? null})), flags: structuredClone(raw.flags ?? {})});
  for (const e of effects) list.push(store(e));
  const item = {calls: [], effects: {contents: list.map(raw => ({toObject: () => structuredClone(raw), raw}))},
    async createEmbeddedDocuments(type, data) { item.calls.push(['create', type, data]); for (const d of data) { const raw = store(d); list.push(raw); item.effects.contents.push({toObject: () => structuredClone(raw), raw}); } },
    async updateEmbeddedDocuments(type, data) { item.calls.push(['update', type, data]); for (const {_id, ...u} of data) { const raw = list.find(r => r._id === _id); for (const [k, v] of Object.entries(u)) setPath(raw, k, structuredClone(v)); } },
    async deleteEmbeddedDocuments() { item.calls.push(['delete']); }
  };
  return item;
}
const rawOf = (item, effId) => item.effects.contents.map(e => e.raw).find(r => r.flags?.[MODULE_ID]?.[EFFECT_FLAG]?.effId === effId);

test('a mounted-gear Item with an effect validates (0.2 and 0.1); old files without effects are unchanged', () => {
  assert.deepEqual(validatePackage(pkg([saddle()])), []);
  assert.deepEqual(validatePackage(pkg([saddle()], 'ag-foundry-import/0.1')).filter(e => !/provenance|visibility/.test(e)), []);
  const plain = saddle(undefined, {});
  delete plain.foundry.data.effects; delete plain.foundry.data.flags;
  assert.deepEqual(validatePackage(pkg([plain])), []);
  assert.deepEqual(Object.keys(exportedFields(plain)).sort(), ['name', 'system.description.value']);
});

test('modes accept Foundry numbers and readable names', () => {
  assert.deepEqual(['custom', 'multiply', 'add', 'downgrade', 'upgrade', 'override', ' ADD '].map(normalizeMode), [0, 1, 2, 3, 4, 5, 2]);
  assert.deepEqual([0, 5, 2].map(normalizeMode), [0, 5, 2]);
  for (const bad of [6, -1, 2.5, '2', 'plus', null, undefined, true]) assert.equal(normalizeMode(bad), null);
  const def = effectDefinition(walk());
  assert.deepEqual(def.changes, [{key: 'system.attributes.movement.walk', mode: 2, value: '10', priority: null}]);
  assert.equal(def.transfer, false);
});

test('bad effects are rejected: modes, keys, values, ids, unknown fields, macros, limits, flag values', () => {
  const errorsFor = effects => validatePackage(pkg([saddle(effects)])).join(' | ');
  const cases = [
    [[walk({changes: [{key: 'system.attributes.ac.bonus', mode: 'plus', value: 1}]})], /mode "plus" is not a mode/],
    [[walk({changes: [{key: 'system.attributes.ac.bonus', mode: 9, value: 1}]})], /mode 9 is not a mode/],
    [[walk({changes: [{key: '', mode: 'add', value: 1}]})], /key is required/],
    [[walk({changes: [{key: 'system attributes', mode: 'add', value: 1}]})], /not a dotted data path/],
    [[walk({changes: [{key: 'system.attributes.ac.bonus', mode: 'add', value: true}]})], /value must be a string or a number/],
    [[walk({changes: [{key: 'system.attributes.ac.bonus', mode: 'add', value: {n: 1}}]})], /value must be a string or a number/],
    [[walk({changes: [{key: 'macro.execute', mode: 'custom', value: 'x'}]})], /may not run macros/],
    [[walk({changes: [{key: 'flags.midi-qol.onUseMacroName', mode: 'custom', value: 'x'}]})], /may not run macros/],
    [[walk({changes: [{key: 'flags.core.statusId', mode: 'override', value: 'dead'}]})], /change core flags/],
    [[walk({changes: [{key: 'system.details.notes', mode: 'override', value: '<script>x</script>'}]})], /macros and scripts are not allowed/],
    [[walk({eff_id: undefined})], /eff_id is required/],
    [[walk(), walk()], /duplicate walk/],
    [[walk({origin: 'Actor.x'})], /unsupported keys: origin/],
    [[walk({transfer: undefined})], /transfer is required/],
    [[walk({duration: {seconds: 60, combat: 'x'}})], /duration.combat is not supported/],
    [[walk({statuses: ['Prone!']})], /statuses must be/],
    [[walk({description: '<p onclick="x()">hi</p>'})], /scripts, event attributes/],
    [Array.from({length: 21}, (_, i) => walk({eff_id: `e${i}`})), /at most 20 effects/],
    [[walk({changes: Array.from({length: 31}, () => ({key: 'system.attributes.ac.bonus', mode: 2, value: 1}))})], /at most 30 changes/],
    ['not a list', /effects must be an array/]
  ];
  for (const [effects, pattern] of cases) assert.match(errorsFor(effects), pattern);
  const badRole = saddle();
  badRole.foundry.data.flags['ashen-gate-character-hub'].companion.role = 'wizard';
  assert.match(validatePackage(pkg([badRole])).join(' '), /companion.role must be one of/);
});

test('only allow-listed flags pass; others are dropped with a preview warning', () => {
  const rec = saddle([walk({flags: {'some-module': {x: 1}}})]);
  rec.foundry.data.flags.core = {statusId: 'dead'};
  rec.foundry.data.flags['ashen-gate-manager'] = {source: {sourceId: 'ITEM-OTHER'}};
  rec.foundry.data.flags['ashen-gate-character-hub'].companions = [];
  assert.deepEqual(validatePackage(pkg([rec])), []);
  assert.deepEqual(allowedItemFlags(rec.foundry.data.flags), {'ashen-gate-character-hub': {companion: {role: 'mount-gear'}}});
  const warnings = flagWarnings(rec).join(' ');
  assert.match(warnings, /flags not imported .*core\.statusId/);
  assert.match(warnings, /ashen-gate-manager\.source\.sourceId/);
  assert.match(warnings, /effect walk flags are not imported/);
  assert.deepEqual(effectCreateData(rec.foundry.data.effects[0]).flags, {[MODULE_ID]: {[EFFECT_FLAG]: {effId: 'walk', baseline: JSON.stringify(effectDefinition(walk()))}}});
  // The role flag is a managed field like name and system; effects are not item fields.
  const fields = exportedFields(rec);
  assert.equal(fields['flags.ashen-gate-character-hub.companion.role'], 'mount-gear');
  assert.ok(!Object.keys(fields).some(k => k.startsWith('effects') || k.startsWith('flags.core') || k.startsWith('flags.ashen-gate-manager')));
});

test('import creates the effect, then re-import is idempotent (no writes)', async () => {
  const item = mockItem();
  const first = planItemEffects(saddle().foundry.data.effects, liveEffects(item));
  assert.deepEqual(first.rows.map(r => r.action), ['create']);
  assert.equal(effectSummary(first), 'Effects: 1 new.');
  assert.deepEqual(await applyItemEffects(item, first, {user: GM}), {created: 1, updated: 0});
  const raw = rawOf(item, 'walk');
  assert.equal(raw.transfer, false);
  assert.deepEqual(raw.changes, [{key: 'system.attributes.movement.walk', mode: 2, value: '10', priority: null}]);
  const again = planItemEffects(saddle().foundry.data.effects, liveEffects(item));
  assert.equal(again.writes, 0);
  assert.deepEqual(again.rows.map(r => [r.action, r.reason]), [['kept', 'Already matches the file.']]);
  const calls = item.calls.length;
  await applyItemEffects(item, again, {user: GM});
  assert.equal(item.calls.length, calls, 'nothing written on an unchanged re-import');
});

test('a file change updates field-wise; a GM edit is kept; both changed keeps the effect', async () => {
  const item = mockItem();
  await applyItemEffects(item, planItemEffects([walk()], []), {user: GM});
  // GM edits the value in Foundry.
  rawOf(item, 'walk').changes[0].value = '15';
  let plan = planItemEffects([walk()], liveEffects(item));
  assert.equal(plan.writes, 0);
  assert.match(plan.rows[0].reason, /Keeps your edits to changes/);
  // The file renames the effect: name updates, the GM's value stays.
  plan = planItemEffects([walk({name: '[TEST] Saddle: Walk +10'})], liveEffects(item));
  assert.deepEqual(plan.rows.map(r => r.action), ['update']);
  assert.match(plan.rows[0].reason, /^name from the file; keeps your edits to changes/);
  await applyItemEffects(item, plan, {user: GM});
  assert.equal(rawOf(item, 'walk').name, '[TEST] Saddle: Walk +10');
  assert.equal(rawOf(item, 'walk').changes[0].value, '15');
  assert.equal(planItemEffects([walk({name: '[TEST] Saddle: Walk +10'})], liveEffects(item)).writes, 0, 'idempotent after the update');
  // The file also changes the value the GM edited: conflict, the whole effect is kept.
  plan = planItemEffects([walk({name: '[TEST] Saddle: Walk +10', changes: [{key: 'system.attributes.movement.walk', mode: 'add', value: 20}]})], liveEffects(item));
  assert.equal(plan.writes, 0);
  assert.match(plan.rows[0].reason, /Edited in Foundry and changed in the file \(changes\)/);
  // A file change to a field the GM did not edit (disabled) applies.
  rawOf(item, 'walk').changes[0].value = '10';
  plan = planItemEffects([walk({name: '[TEST] Saddle: Walk +10', disabled: true})], liveEffects(item));
  assert.deepEqual(Object.keys(plan.update[0]).sort(), ['_id', 'disabled', `flags.${MODULE_ID}.${EFFECT_FLAG}.baseline`]);
});

test('hand-made effects are untouched, missing ones are never deleted, new ones are added', async () => {
  const item = mockItem([{_id: 'hand', name: 'GM blessing', changes: [{key: 'system.attributes.ac.bonus', mode: 2, value: '1'}]}]);
  await applyItemEffects(item, planItemEffects([walk(), walk({eff_id: 'trot', name: '[TEST] Trot'})], liveEffects(item)), {user: GM});
  const before = structuredClone(item.effects.contents.find(e => e.raw._id === 'hand').raw);
  // The new file drops "trot" and adds "ac".
  const ac = walk({eff_id: 'ac', name: '[TEST] Saddle: AC', changes: [{key: 'system.attributes.ac.bonus', mode: 'add', value: 1}]});
  const plan = planItemEffects([walk(), ac], liveEffects(item));
  assert.deepEqual(plan.rows.map(r => [r.effId, r.action]), [['walk', 'kept'], ['ac', 'create'], ['trot', 'kept'], [null, 'handmade']]);
  assert.match(plan.rows[2].reason, /never deletes/);
  assert.equal(effectSummary(plan), 'Effects: 1 new, 2 kept, 1 made in Foundry (untouched).');
  await applyItemEffects(item, plan, {user: GM});
  assert.ok(!item.calls.some(c => c[0] === 'delete'));
  assert.ok(!item.calls.some(c => c[0] === 'update' && c[2].some(u => u._id === 'hand')));
  assert.deepEqual(item.effects.contents.find(e => e.raw._id === 'hand').raw, before);
  assert.equal(item.effects.contents.length, 4);
  // Two effects claiming one id are left alone rather than guessed between.
  rawOf(item, 'ac').flags[MODULE_ID][EFFECT_FLAG].effId = 'walk';
  assert.match(planItemEffects([walk()], liveEffects(item)).rows[0].reason, /share walk/);
});

test('players are refused in the data layer; nothing is written', async () => {
  const item = mockItem();
  const plan = planItemEffects([walk()], []);
  await assert.rejects(applyItemEffects(item, plan, {user: PLAYER}), /Only the GM/);
  await assert.rejects(applyItemEffects(item, plan, {user: null}), /Only the GM/);
  assert.equal(item.calls.length, 0);
  const main = read('../scripts/main.js');
  assert.match(main, /if \(!game\.user\.isGM\) throw new Error\("Only a GM may import content\."\);/);
  assert.match(main, /applyItemEffects\(doc,current\.effects,\{user:game\.user\}\)/);
});

test('Manager wires effects into preview, create and update', () => {
  const main = read('../scripts/main.js'), tpl = read('../templates/manager.hbs');
  assert.match(main, /data\.effects=record\.foundry\.data\.effects\.map\(effectCreateData\)/);
  assert.match(main, /kind==='Item'\?allowedItemFlags\(data\.flags\)/);
  assert.match(main, /return \{plan:withItemEffects\(record,plan,matches\)/);
  assert.match(main, /canonical\(current\.effects\?\.rows \?\? \[\]\) !== canonical\(row\.effects\?\.rows \?\? \[\]\)/);
  assert.match(main, /this\.warnings\.push\(\.\.\.flagWarnings\(record\)\)/);
  assert.match(tpl, /\{\{#each effectRows\}\}/);
  // Effects alone do not block or conflict an Item update.
  const rec = saddle();
  const doc = {documentName: 'Item', type: 'equipment', flag: {managedFields: exportedFields(rec)}, get: p => exportedFields(rec)[p]};
  assert.equal(planRecord(rec, [doc], false, false).action, 'unchanged');
  // An Item imported before 0.37.0 whose GM set the same Hub role by hand: adopted, not blocked; a different role is not overwritten.
  const old = structuredClone(rec); delete old.foundry.data.flags;
  const live = {...exportedFields(rec)};
  const before = {documentName: 'Item', type: 'equipment', flag: {managedFields: exportedFields(old)}, get: p => live[p]};
  assert.equal(planRecord(rec, [before], false, false).action, 'unchanged');
  live['flags.ashen-gate-character-hub.companion.role'] = 'pet-clothing';
  assert.equal(planRecord(rec, [before], false, false).action, 'blocked');
  delete live['flags.ashen-gate-character-hub.companion.role'];
  assert.deepEqual(planRecord(rec, [before], false, false).patch, {'flags.ashen-gate-character-hub.companion.role': 'mount-gear'});
});

test('version 0.37.0 is consistent', () => {
  const manifest = JSON.parse(read('../module.json'));
  assert.equal(manifest.version, '0.37.0');
  assert.match(manifest.download, /ashen-gate-manager-v0\.37\.0\/ashen-gate-manager\.zip$/);
  assert.match(read('../templates/manager.hbs'), /v0\.37\.0 Beta/);
  assert.match(read('../scripts/main.js'), /General Manager v0\.37\.0 Beta/);
  assert.match(read('../scripts/main.js'), /v0\.37\.0 ready/);
});
