/** 0.53.1 ZIP import order: locale-independent, honours an order list, resolves a shared prefix by dependency. Mocked: proves logic, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import '../scripts/vendor/jszip.min.js';
import {readImportBundle, sortBundleFiles, importOrderHint} from '../scripts/zip-import.js';

const JSZip = globalThis.JSZip;
const rec = (id, extra = {}) => ({id, entity_type: 'Item', status: 'approved', foundry: {document_type: 'Item', data: {name: `[TEST] ${id}`, type: 'loot'}}, ...extra});
const pack = (id, ids, extra = {}) => ({manifest: {schema_version: 'ag-foundry-import/0.2', package_id: id, version: '1.0.0'}, records: ids.map(i => rec(i, extra))});
async function zipOf(entries) {
  const z = new JSZip();
  for (const [name, value] of Object.entries(entries)) z.file(name, JSON.stringify(value), {createFolders: false});
  return z.generateAsync({type: 'uint8array'});
}
const names = async entries => (await readImportBundle(await zipOf(entries), JSZip)).files.map(f => f.filename);

// Same shape as the supplement's two L18_25 files: "Act_One" sorts before "Artistry" alphabetically, but it names materials
// defined in the L04A file and must come after the files it builds on.
const ZIP = {
  'L18_25_AG_Act_One_City_v0.1.0_ManagerImport.json': pack('AG-TEST-ACT', ['ITEM-TEST-ACT'], {ingredient: 'MAT-TEST-HERB'}),
  'L18_25_AG_Artistry_Perks_v1.0_ManagerImport.json': pack('AG-TEST-ART', ['PERK-TEST-ART']),
  'L04A_01_Materials_ManagerImport.json': pack('AG-TEST-MAT', ['MAT-TEST-HERB']),
  'L18b_29_Trees_ManagerImport.json': pack('AG-TEST-TREES', ['ITEM-TEST-TREES'])
};

test('files sharing a prefix import in dependency order, not alphabetical order', async () => {
  assert.deepEqual(await names(ZIP), ['L04A_01_Materials_ManagerImport.json', 'L18_25_AG_Artistry_Perks_v1.0_ManagerImport.json', 'L18_25_AG_Act_One_City_v0.1.0_ManagerImport.json', 'L18b_29_Trees_ManagerImport.json']);
});

test('the order list in the ZIP wins, and is listed as used rather than as an unknown file', async () => {
  const hint = {schema: 'ag-alpha-manifest/1', ordered_files: ['x/L04A_01_Materials_ManagerImport.json', 'x/L18b_29_Trees_ManagerImport.json', 'x/L18_25_AG_Act_One_City_v0.1.0_ManagerImport.json', 'x/L18_25_AG_Artistry_Perks_v1.0_ManagerImport.json']};
  const b = await readImportBundle(await zipOf({...ZIP, 'MANIFEST.json': hint}), JSZip);
  assert.deepEqual(b.files.map(f => f.filename), hint.ordered_files.map(f => f.split('/').at(-1)));
  assert.deepEqual(b.skipped.map(s => s.filename), ['MANIFEST.json']);
  assert.match(b.skipped[0].reason, /order/i);
});

test('importOrderHint ignores JSON that is not an order list', () => {
  assert.equal(importOrderHint({ordered_files: ['a.json']}), null);
  assert.equal(importOrderHint({schema: 'other/1', ordered_files: ['a.json']}), null);
  assert.deepEqual(importOrderHint({schema: 'ag-alpha-manifest/1', ordered_files: ['d/a.json', 3]}), ['a.json']);
});

test('the sort uses plain code-unit order, never localeCompare, and numbers prefixes (L2 before L10)', () => {
  const lc = String.prototype.localeCompare;
  String.prototype.localeCompare = () => { throw new Error('locale-dependent comparison used'); };
  try {
    const f = n => ({filename: n, kind: 'manager', count: 1, payload: {records: [{id: `ITEM-${n}`}]}});
    const sorted = sortBundleFiles([f('b.json'), f('L10_x.json'), f('L2_x.json'), f('B.json'), f('a.json'), f('ä.json')]).map(x => x.filename);
    assert.deepEqual(sorted, ['L2_x.json', 'L10_x.json', 'B.json', 'a.json', 'b.json', 'ä.json']);
  } finally { String.prototype.localeCompare = lc; }
});
