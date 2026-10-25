// 0.60.15: companion.slot item flag. Mocked data only: proves the import/sync logic, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePackage, exportedFields, planRecord} from '../scripts/core.js';
import {allowedItemFlags, flagWarnings} from '../scripts/item-effects.js';
import {incomingFields, diffFields} from '../scripts/sync.js';

const HUB = 'ashen-gate-character-hub', ROLE = `flags.${HUB}.companion.role`, SLOT = `flags.${HUB}.companion.slot`;
const rec = (companion, id = 'ITEM-MOUNT-TEST-SADDLE') => ({id, entity_type: 'Item', status: 'approved', version: '1.0.0', visibility: 'player',
  scope: 'generic_rules', refs: [], provenance: {sources: ['[TEST] synthetic']},
  foundry: {document_type: 'Item', data: {name: '[TEST] Saddle', type: 'equipment', system: {description: {value: '<p>[TEST]</p>'}}, flags: {[HUB]: {companion}}}}});
const pkg = records => ({manifest: {schema_version: 'ag-foundry-import/0.2', package_id: 'AG-TEST-SLOT', version: '1.0.0'}, records});

test('valid slot per role is imported as a managed field', () => {
  for (const [role, slot] of [['mount-gear', 'saddle'], ['mount-gear', 'tack'], ['pet-clothing', 'head'], ['pet-clothing', 'body']]) {
    const r = rec({role, slot});
    assert.deepEqual(validatePackage(pkg([r])), []);
    assert.deepEqual(allowedItemFlags(r.foundry.data.flags), {[HUB]: {companion: {role, slot}}});
    assert.equal(exportedFields(r)[SLOT], slot);
    assert.deepEqual(flagWarnings(r), []);
  }
});

test('invalid, mismatched or role-less slot is dropped with a clear warning, never written, and is not a package error', () => {
  const cases = [
    [{role: 'mount-gear', slot: 'crown'}, /companion\.slot not imported: "crown" is not a slot \(use saddle, tack, head, body\)/],
    [{role: 'mount-gear', slot: 'head'}, /slot head goes only with companion\.role pet-clothing, but this item's role flag is "mount-gear"/],
    [{role: 'pet-clothing', slot: 'saddle'}, /slot saddle goes only with companion\.role mount-gear/],
    [{role: 'mount-perk', slot: 'saddle'}, /slot saddle goes only with companion\.role mount-gear/],
    [{slot: 'saddle'}, /role flag is missing/],
    [{role: 'wizard', slot: 'saddle'}, /role flag is missing/]
  ];
  for (const [companion, message] of cases) {
    const r = rec(companion);
    if (companion.role !== 'wizard') assert.deepEqual(validatePackage(pkg([r])), [], 'a bad slot never blocks the import');
    assert.match(flagWarnings(r).join(' '), message);
    assert.equal(allowedItemFlags(r.foundry.data.flags)[HUB]?.companion?.slot, undefined);
    assert.ok(!(SLOT in exportedFields(r)));
  }
  assert.equal(exportedFields(rec({role: 'mount-gear', slot: 'head'}))[ROLE], 'mount-gear', 'the role still imports');
});

test('create writes the slot; update adds it, keeps a GM edit, and a changed file value updates', () => {
  const r = rec({role: 'mount-gear', slot: 'saddle'});
  const fields = exportedFields(r);
  const doc = (live, baseline) => ({documentName: 'Item', type: 'equipment', flag: {managedFields: baseline}, get: p => live[p]});
  // Item imported before 0.60.15 (no slot in baseline or live): the slot is added.
  const old = rec({role: 'mount-gear'});
  const before = doc({...exportedFields(old)}, exportedFields(old));
  assert.deepEqual(planRecord(r, [before], false, false).patch, {[SLOT]: 'saddle'});
  // Unchanged re-import writes nothing.
  assert.equal(planRecord(r, [doc({...fields}, fields)], false, false).action, 'unchanged');
  // The GM changed the slot in Foundry: file unchanged, so the edit is kept.
  const edited = doc({...fields, [SLOT]: 'tack'}, fields);
  const kept = planRecord(r, [edited], false, false);
  assert.ok(!(SLOT in (kept.patch ?? {})), 'GM-edited slot not overwritten');
  // The file changed the slot and the GM did not: updated.
  const moved = rec({role: 'mount-gear', slot: 'tack'});
  assert.deepEqual(planRecord(moved, [doc({...fields}, fields)], false, false).patch, {[SLOT]: 'tack'});
});

test('Sync includes the slot in incoming fields and diffs, and the baseline map carries it', () => {
  const r = rec({role: 'pet-clothing', slot: 'head'}, 'ITEM-PET-TEST-HAT');
  const incoming = incomingFields(r);
  assert.equal(incoming[SLOT], 'head');
  assert.equal(incoming[ROLE], 'pet-clothing');
  const raw = {name: '[TEST] Saddle', flags: {[HUB]: {companion: {role: 'pet-clothing'}}}};
  const diff = diffFields(raw, incoming, {baseline: {...incoming, [SLOT]: undefined}});
  assert.ok(JSON.stringify(diff).includes('head'), 'a missing slot shows as a change');
  const same = diffFields({...raw, flags: {[HUB]: {companion: {role: 'pet-clothing', slot: 'head'}}}}, incoming, {baseline: incoming});
  assert.ok(!JSON.stringify(same).includes('companion.slot'), 'matching slot is not a change');
});
