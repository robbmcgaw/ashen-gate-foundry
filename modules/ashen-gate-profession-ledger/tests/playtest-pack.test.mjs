import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePackage } from '../../ashen-gate-manager/scripts/core.js';
import { normalizeLibrary, sourceAvailableToPlayer } from '../scripts/core.mjs';
import { buildPack, packFileName, PACK_VERSION } from '../../../scripts/build-test-pack.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const file = path.join(root, 'test-fixtures/playtest', packFileName());
const pack = JSON.parse(fs.readFileSync(file, 'utf8'));
const old = ['PinnedChain_v0.1.1', 'Playtest_Approved_v0.1.0'].map(n =>
  JSON.parse(fs.readFileSync(path.join(root, `test-fixtures/professions/AG_Professions_${n}_ManagerImport.json`), 'utf8')));
const byType = t => pack.records.filter(r => r.entity_type === t);

test('committed playtest pack is up to date with scripts/build-test-pack.mjs', () => {
  assert.deepEqual(pack, buildPack());
  assert.equal(pack.manifest.version, PACK_VERSION);
});
test('pack has the promised contents', () => {
  assert.equal(byType('Profession').length, 3);
  assert.equal(byType('Material').length, 8);
  assert.equal(byType('Recipe').length, 8);
  assert.equal(byType('Item').length, 12, '8 crafted items + 4 ordinary stash items');
  assert.equal(byType('Location').length, 8);
  const given = byType('Recipe').filter(r => r.foundry.data.type === 'consumable');
  assert.equal(given.length, 3);
  for (const r of given) assert.match(r.foundry.data.name, /^Recipe: /);
});
test('ids and package id do not collide with the old pinned-chain fixtures', () => {
  const oldIds = new Set(old.flatMap(p => p.records.map(r => r.id)));
  for (const r of pack.records) assert.ok(!oldIds.has(r.id), r.id);
  for (const p of old) assert.notEqual(p.manifest.package_id, pack.manifest.package_id);
});
test('only deliberate gm/draft examples are non-player-approved; every recipe product resolves', () => {
  const exceptions = pack.records.filter(r => r.status !== 'approved' || r.visibility !== 'player').map(r => r.id).sort();
  assert.deepEqual(exceptions, ['ITEM-PT-DRAFT-DRAUGHT', 'JRN-PT-CHAPEL-GM-NOTES', 'MACRO-PT-LINK-TEST-DATA', 'MAT-PT-GM-ONLY-RESIN', 'PERK-PT-ALCH-MASTER-TOUCH', 'REC-PT-DRAFT-DRAUGHT']);
  const ids = new Set(pack.records.map(r => r.id));
  for (const r of byType('Recipe')) {
    assert.ok(ids.has(r.result_item_id), r.id);
    for (const ing of r.ingredients) assert.ok(ids.has(ing.material_id), `${r.id} -> ${ing.material_id}`);
  }
  for (const r of pack.records) assert.match(r.foundry?.data.name ?? r.name, /\[TEST\]/, r.id);
});
test("Manager's validatePackage accepts the pack with no errors", () => {
  assert.deepEqual(validatePackage(pack), []);
});
test("Ledger readers load the pack: recipes, ingredients and visibility", () => {
  const lib = normalizeLibrary(pack);
  assert.equal(lib.recipes.length, 8);
  assert.equal(lib.importSummary.unmappedRecipes, 0);
  // The gm material is skipped on import; recipes only use player materials.
  assert.equal(lib.materials.length, 7);
  assert.equal(lib.importSummary.skippedRestricted, 1);
  const matIds = new Set(lib.materials.map(m => m.id));
  for (const rec of lib.recipes) {
    assert.ok(rec.hasStructuredIngredients, rec.id);
    for (const ing of rec.ingredients) assert.ok(matIds.has(ing.materialId), `${rec.id} -> ${ing.materialId}`);
    assert.ok(rec.professionId.startsWith('PROF-PT-'));
  }
  const draft = lib.recipes.find(r => r.id === 'REC-PT-DRAFT-DRAUGHT');
  assert.equal(draft.status, 'draft');
  assert.equal(sourceAvailableToPlayer(draft), false);
  assert.equal(sourceAvailableToPlayer(lib.recipes.find(r => r.id === 'REC-PT-EMBER-SALVE')), true);
});
test('pack recipes carry a tool or a workstation for the 0.10.0 bench requirement', () => {
  const lib = normalizeLibrary(pack);
  const by = id => lib.recipes.find(r => r.id === id);
  assert.equal(by('REC-PT-EMBER-SALVE').tool, 'alchemist');
  assert.equal(by('REC-PT-IRON-HINGE-SET').tool, 'smith');
  assert.equal(by('REC-PT-GLASSBLOOM-ELIXIR').workstation, '[TEST] Alchemy Laboratory');
  assert.equal(by('REC-PT-GLASSBLOOM-ELIXIR').tool, null);
  assert.equal(by('REC-PT-MISTVEIL-TONIC').tool, null, 'no tool given: the profession default applies in the Ledger');
});
