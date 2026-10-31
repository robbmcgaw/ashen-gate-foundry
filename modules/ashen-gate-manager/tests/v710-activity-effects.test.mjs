import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {activityEffectRefs, withoutActivityEffectRefs, resolveActivityEffects, activityLinksNeeded, activityEffectWarnings, unknownEffectWarning} from '../scripts/activity-effects.js';
import {exportedFields, MODULE_ID} from '../scripts/core.js';
import {effectCreateData, flagWarnings} from '../scripts/item-effects.js';
import {bindPackageLinks} from '../scripts/link-binding.js';
import {buildSyncSet, makeSnapshot, nameIndex, planSync} from '../scripts/sync.js';
import {sourceMetadata} from '../scripts/source-projection.mjs';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const EFF = {eff_id: 'EFF-TEST-RESIST', name: '[TEST] Resist', transfer: false, changes: [{key: 'system.traits.dr.value', type: 'add', value: 'poison'}]};
const activities = () => ({aaaaaaaaaaaaaaaa: {type: 'utility', name: 'Use', effects: [{eff_id: 'EFF-TEST-RESIST'}]}, bbbbbbbbbbbbbbbb: {type: 'attack', name: 'Hit'}, cccccccccccccccc: {type: 'save', name: 'Keep', effects: [{_id: 'keepme00000000id'}]}});
const record = (over = {}) => ({id: 'ITEM-TEST-PERK', entity_type: 'Item', status: 'approved', version: '1', visibility: 'player', refs: [], provenance: {source: 'test'},
  foundry: {document_type: 'Item', data: {name: '[TEST] Perk', type: 'feat', system: {description: {value: '<p>x</p>'}, activities: activities()}, effects: [structuredClone(EFF)]}}, ...over});
const live = (id = 'RANDOMeffect0001') => [{_id: id, name: '[TEST] Resist', flags: {[MODULE_ID]: {effect: {effId: 'EFF-TEST-RESIST'}}}}, {_id: 'handmade0000000i', name: 'Made in Foundry', flags: {}}];

test('0.71.0 an activity names its effect by eff_id and is rewritten to dnd5e\'s {_id} shape against the live effect', () => {
  const sys = record().foundry.data.system;
  assert.deepEqual(activityEffectRefs(sys).map(r => r.key), ['aaaaaaaaaaaaaaaa']);
  const r = resolveActivityEffects(sys, live());
  assert.deepEqual(r.updates, {'system.activities.aaaaaaaaaaaaaaaa.effects': [{_id: 'RANDOMeffect0001'}]});
  assert.equal(r.linked, 1); assert.deepEqual(r.unknown, []);
  // the optional level range is kept; eff_id is not
  const lvl = structuredClone(sys); lvl.activities.aaaaaaaaaaaaaaaa.effects = [{eff_id: 'EFF-TEST-RESIST', level: {min: 3}}];
  assert.deepEqual(resolveActivityEffects(lvl, live()).updates['system.activities.aaaaaaaaaaaaaaaa.effects'], [{_id: 'RANDOMeffect0001', level: {min: 3}}]);
  // activities without eff_id are never touched (neither bbbb nor the one already in dnd5e's form)
  assert.ok(!Object.keys(r.updates).some(k => /bbbb|cccc/.test(k)));
});

test('0.71.0 the raw link never reaches the Item, the baseline or the Sync comparison', () => {
  const rec = record(), sys = rec.foundry.data.system;
  const stripped = withoutActivityEffectRefs(sys);
  assert.equal('effects' in stripped.activities.aaaaaaaaaaaaaaaa, false, 'key removed, so a live link is neither compared nor blanked');
  assert.deepEqual(stripped.activities.cccccccccccccccc.effects, [{_id: 'keepme00000000id'}]);
  assert.equal(sys.activities.aaaaaaaaaaaaaaaa.effects[0].eff_id, 'EFF-TEST-RESIST', 'the record is not mutated');
  const fields = exportedFields(rec);
  assert.ok(!Object.keys(fields).some(k => k === 'system.activities.aaaaaaaaaaaaaaaa.effects'));
  assert.ok(Object.keys(fields).includes('system.activities.aaaaaaaaaaaaaaaa.name'));
  assert.equal(withoutActivityEffectRefs({description: {}}).description !== undefined, true);
});

test('0.71.0 existing worlds: effects with random ids are found by effId; re-resolving is idempotent; a recreated effect re-points', () => {
  const sys = record().foundry.data.system;
  const first = resolveActivityEffects(sys, live('RANDOMeffect0001'));
  const liveSystem = {activities: {aaaaaaaaaaaaaaaa: {effects: [{_id: 'RANDOMeffect0001'}]}}};
  assert.deepEqual(resolveActivityEffects(sys, live('RANDOMeffect0001'), liveSystem).updates, {}, 'already linked: nothing to write');
  assert.deepEqual(resolveActivityEffects(sys, live('NEWrandomid00002'), liveSystem).updates, {'system.activities.aaaaaaaaaaaaaaaa.effects': [{_id: 'NEWrandomid00002'}]});
  assert.ok(first.linked === 1);
  // a hand-made effect with a look-alike name is never matched
  assert.deepEqual(resolveActivityEffects(sys, [{_id: 'x'.repeat(16), name: '[TEST] Resist', flags: {}}]).updates, {});
});

test('0.71.0 an unknown eff_id is reported, never dropped silently, and never blanks an existing link', () => {
  const sys = record().foundry.data.system; sys.activities.aaaaaaaaaaaaaaaa.effects = [{eff_id: 'EFF-NOPE'}];
  const r = resolveActivityEffects(sys, live(), {activities: {aaaaaaaaaaaaaaaa: {effects: [{_id: 'RANDOMeffect0001'}]}}});
  assert.deepEqual(r.unknown, [{activity: 'Use', effId: 'EFF-NOPE'}]);
  assert.deepEqual(r.updates, {}, 'the old link stays');
  assert.match(unknownEffectWarning('[TEST] Perk', r.unknown), /\[TEST\] Perk: 1 activity effect link\(s\) point at an effect this Item does not have \(Use: EFF-NOPE\)/);
  assert.equal(unknownEffectWarning('x', []), null);
  const rec = record(); rec.foundry.data.effects = []; 
  assert.match(activityEffectWarnings(rec)[0], /activity Use links to effect EFF-TEST-RESIST, which is not in this record's effects/);
  assert.ok(flagWarnings(rec).some(w => /EFF-TEST-RESIST/.test(w)));
  assert.deepEqual(activityEffectWarnings(record()), []);
});

function itemDoc(rec, {effectId = 'RANDOMeffect0001', linked = false} = {}) {
  const e = {...effectCreateData(rec.foundry.data.effects[0]), _id: effectId};
  const sys = structuredClone(withoutActivityEffectRefs(rec.foundry.data.system));
  if (linked) sys.activities.aaaaaaaaaaaaaaaa.effects = [{_id: effectId}];
  const raw = {_id: 'item1', name: rec.foundry.data.name, type: 'feat', system: sys, effects: [e],
    flags: {[MODULE_ID]: {source: {...sourceMetadata(rec, {manifest: {schema_version: 'ag-foundry-import/0.1', package_id: 'PKG-TEST', version: '1'}}, []), managedFields: exportedFields(rec)}}}};
  const doc = {id: 'item1', name: raw.name, documentName: 'Item', uuid: 'Item.item1', type: 'feat', raw, _source: raw, system: raw.system, effects: {contents: raw.effects.map(x => ({...x, toObject: () => x}))}, flags: raw.flags,
    getFlag(s, k) { return raw.flags?.[s]?.[k] ?? null; }, toObject() { return structuredClone(raw); }};
  return doc;
}

test('0.71.0 link binding writes the resolved links in a batch, with fresh bulk options, and a second run writes nothing', async () => {
  const rec = record(), doc = itemDoc(rec), seen = [], writes = [];
  const world = {moduleId: MODULE_ID, itemFlag: 'k', moduleRecord: () => null, documents: () => [doc], sourceFlag: d => d.getFlag(MODULE_ID, 'source'),
    async updateDocuments(name, updates, opts) { seen.push(opts); Object.assign(opts, {parent: null}); writes.push(...updates); for (const u of updates) for (const [k, v] of Object.entries(u)) if (k !== '_id') { const p = k.split('.'); let t = doc.raw; for (const q of p.slice(0, -1)) t = t[q] ??= {}; t[p.at(-1)] = v; } }};
  const run = () => bindPackageLinks({records: [rec], rows: [{id: rec.id, action: 'update', kind: 'Item'}], log: {results: [{id: rec.id, action: 'update', status: 'ok'}]}, world});
  await run();
  const link = writes.find(w => 'system.activities.aaaaaaaaaaaaaaaa.effects' in w);
  assert.deepEqual(link['system.activities.aaaaaaaaaaaaaaaa.effects'], [{_id: 'RANDOMeffect0001'}]);
  assert.ok(seen.every(o => o.agBulk === true && !Object.isFrozen(o)));
  const before = writes.length;
  await run();
  assert.equal(writes.length, before, 'idempotent: already linked, nothing more is written');
  // unknown eff_id: reported as a warning in the log, once per record
  const bad = record(); bad.foundry.data.system.activities.aaaaaaaaaaaaaaaa.effects = [{eff_id: 'EFF-NOPE'}, {eff_id: 'EFF-NOPE2'}];
  const log = {results: [{id: bad.id, action: 'update', status: 'ok'}]};
  await bindPackageLinks({records: [bad], rows: [{id: bad.id, action: 'update', kind: 'Item'}], log, world: {...world, documents: () => [itemDoc(record())]}});
  const warns = log.results.filter(r => r.action === 'activity-effect');
  assert.equal(warns.length, 1); assert.equal(warns[0].status, 'warning'); assert.match(warns[0].message, /2 activity effect link/);
});

test('0.71.0 Sync preview: a link-only change is a quiet refresh, and a linked item stays Unchanged', () => {
  const rec = record(), manifest = {schema_version: 'ag-foundry-import/0.1', package_id: 'PKG-TEST', version: '1'};
  const run = doc => {
    const set = buildSyncSet([{filename: 'p.json', kind: 'manager', payload: {manifest, records: [rec]}}]);
    const ctx = {includeDrafts: true, deleteUnscoped: false, overwriteEdited: false, retiredIds: new Set(), ledger: {}, externalIds: new Set(), sceneActorIds: new Set(), hotbarMacroIds: new Set(), isProtectedFolder: () => false,
      buildFlag: r => ({...sourceMetadata(r, {manifest}, []), managedFields: exportedFields(r)})};
    return planSync(set, {docs: [makeSnapshot(doc, ctx)], characterCount: 0, unflaggedNames: nameIndex([])}, ctx).rows.find(r => r.id === rec.id);
  };
  const linkedRow = run(itemDoc(rec, {linked: true}));
  assert.equal(linkedRow.group, 'untouched'); assert.equal(linkedRow.unchanged, true);
  const stale = run(itemDoc(rec, {linked: false}));
  assert.equal(stale.group, 'overwrite'); assert.equal(stale.metadataOnly, true); assert.match(stale.reason, /activity effect links/);
  assert.equal(activityLinksNeeded(rec, itemDoc(rec, {linked: true}).toObject()), false);
  assert.equal(activityLinksNeeded(rec, itemDoc(rec, {linked: false}).toObject()), true);
});

test('0.71.0 wiring: create strips the raw link, Import refreshes a stale link, version and docs', () => {
  const main = read('../scripts/main.js');
  assert.match(main, /data\.system=withoutActivityEffectRefs\(data\.system\)/);
  assert.match(main, /activityLinksNeeded\(record,matches\[0\]\.doc/);
  assert.equal(JSON.parse(read('../module.json')).version, '0.91.0');
  assert.match(read('../CHANGELOG.md'), /^## 0\.71\.0 /m); assert.match(read('../README.md'), /eff_id/);
});
