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
  assert.equal(byType('Profession').length, 4);
  assert.equal(byType('Material').length, 10);
  assert.equal(byType('Recipe').length, 12);
  assert.equal(byType('Item').length, 16, '12 crafted items + 4 ordinary stash items');
  assert.equal(byType('Location').length, 8);
  const given = byType('Recipe').filter(r => r.foundry.data.type === 'consumable');
  assert.equal(given.length, 4);
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
  assert.equal(lib.recipes.length, 12);
  assert.equal(lib.importSummary.unmappedRecipes, 0);
  // The gm material is skipped on import; recipes only use player materials.
  assert.equal(lib.materials.length, 9);
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
test('Enchanting: profession, recipes (Arcana-only, Jeweler\'s, Woodcarver\'s) and a character holding it all resolve', () => {
  const lib = normalizeLibrary(pack);
  const by = id => lib.recipes.find(r => r.id === id);
  const prof = byType('Profession').find(r => r.id === 'PROF-PT-ENCHANTING');
  assert.equal(prof.name, '[TEST] Enchanting');
  assert.deepEqual(byType('Profession').filter(r => /arcana/i.test(r.name)), [], 'Arcana is a skill, not a profession');
  const rec = Object.fromEntries(byType('Recipe').filter(r => r.profession_id === 'PROF-PT-ENCHANTING').map(r => [r.id, r]));
  assert.deepEqual(Object.keys(rec).sort(), ['REC-PT-CARVED-WARD-TOTEM', 'REC-PT-GEMSET-PENDANT', 'REC-PT-JEWELED-WARD-RING', 'REC-PT-WARDING-CHARM']);
  assert.equal(by('REC-PT-WARDING-CHARM').tool, null, 'no tool: Enchanting rolls the Arcana skill');
  assert.equal(by('REC-PT-JEWELED-WARD-RING').tool, 'jeweler');
  assert.equal(by('REC-PT-GEMSET-PENDANT').tool, 'jeweler');
  assert.equal(by('REC-PT-CARVED-WARD-TOTEM').tool, 'woodcarver');
  for (const r of Object.values(rec)) assert.ok(r.id.startsWith('REC-PT-') && r.result_item_id.startsWith('ITEM-PT-'));
  const belwar = byType('PlayerCharacter').find(r => r.id === 'PC-PT-BELWAR').foundry.data;
  const ids = belwar.items.map(i => i.flags?.['ashen-gate-manager']?.source?.sourceId).filter(Boolean);
  assert.ok(ids.includes('PROF-PT-ENCHANTING'));
  assert.ok(belwar.items.some(i => i.type === 'tool' && i.system.type.baseItem === 'jeweler'), 'holds Jeweler\'s Tools');
  assert.ok(!belwar.items.some(i => i.type === 'tool' && i.system.type.baseItem === 'woodcarver'), 'no Woodcarver\'s Tools, to show the warning');
  assert.deepEqual(belwar.flags['ashen-gate-profession-ledger'].knownRecipes, ['REC-PT-WARDING-CHARM', 'REC-PT-JEWELED-WARD-RING']);
  const known = new Set(pack.records.map(r => r.id));
  for (const id of ids) assert.ok(known.has(id), `${id} resolves`);
});
test('the link macro also sets the Ledger party to the three test characters, only when it is empty', () => {
  const macro = pack.records.find(r => r.id === 'MACRO-PT-LINK-TEST-DATA').foundry.data.command;
  assert.match(macro, /"characters": \[\s*"\[TEST\] Belwar",\s*"\[TEST\] Kessa",\s*"\[TEST\] Orin"\s*\]/);
  assert.match(macro, /partyRoster/);assert.match(macro, /left as is/);
});
