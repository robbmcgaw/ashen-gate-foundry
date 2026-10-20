/** ZIP bundles with several import files (0.23.0). Proves reader/planning logic with the bundled JSZip, not native Foundry UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../scripts/vendor/jszip.min.js';
import {readImportZip, readImportBundle, planBundleImport, bundleSummary, withoutDuplicates, MAX_BUNDLE_FILES} from '../scripts/zip-import.js';
import {applySpecialist} from '../scripts/specialist-handoff.js';
import {buildImportReport} from '../scripts/import-result.js';

const JSZip = globalThis.JSZip;
const rec = id => ({id, entity_type: 'Item', status: 'approved', foundry: {document_type: 'Item', data: {name: `[TEST] ${id}`, type: 'loot'}}});
const pack = (id, ids) => ({manifest: {schema_version: 'ag-foundry-import/0.2', package_id: id, version: '1.0.0'}, records: ids.map(rec)});
const quests = {schema_version: 'ag-quest-source/0.1', records: [{id: 'QST-T1', entity_type: 'Objective', name: '[TEST] Q1'}, {id: 'QST-T2', entity_type: 'Objective', name: '[TEST] Q2'}]};
const trees = {schema: 'ag-skill-trees/0.1', trees: [{id: 'TREE-T1', name: '[TEST] Tree'}]};
const facilities = [{id: 'FAC-T1', entity_type: 'Facility'}, {id: 'FAC-T2', entity_type: 'Facility'}, {id: 'FAC-T3', entity_type: 'Facility'}];
const factions = {schema_version: 'ag-factions-definitions/0.1', definitions: [{id: 'FCT-T1'}, {id: 'FCT-T2'}]};

async function zipOf(entries) {
  const z = new JSZip();
  for (const [name, value] of Object.entries(entries)) z.file(name, typeof value === 'string' || value instanceof Uint8Array ? value : JSON.stringify(value), {createFolders: false});
  return z.generateAsync({type: 'uint8array', compression: 'DEFLATE'});
}
const catalog = () => zipOf({'factions.json': factions, 'quests.json': quests, 'hq/facilities.json': facilities,
  'trees.json': trees, 'main.json': pack('AG-TEST-MAIN', ['ITEM-T1', 'ITEM-T2']), 'notes.json': {hello: 'world'},
  'art/a.png': Uint8Array.from([1]), 'portraits/b.png': Uint8Array.from([2])});

test('multi-file ZIP lists every importable kind with counts, in import order, and skips other JSON by name', async () => {
  const b = await readImportBundle(await catalog(), JSZip);
  assert.deepEqual(b.files.map(f => [f.filename, f.kind, f.count, f.status]), [
    ['main.json', 'manager', 2, 'ok'], ['quests.json', 'quests', 2, 'ok'], ['trees.json', 'skill-trees', 1, 'ok'],
    ['hq/facilities.json', 'headquarters', 3, 'ok'], ['factions.json', 'factions', 2, 'ok']]);
  assert.deepEqual(b.skipped.map(s => s.filename), ['notes.json']);
  assert.equal(b.assets.size, 2);
  assert.match(bundleSummary(b), /5 import file\(s\) found, 5 can be imported; skipped \(not an import file\): notes\.json/);
});

test('selection: only ticked, error-free files are planned, Manager first; GM gate enforced', async () => {
  const b = await readImportBundle(await catalog(), JSZip);
  const all = b.files.map(f => f.filename);
  assert.throws(() => planBundleImport(b, all, {isGM: false}), /Only a GM/);
  assert.throws(() => planBundleImport(b, all), /Only a GM/);
  const plan = planBundleImport(b, ['factions.json', 'main.json', 'trees.json'], {isGM: true});
  assert.deepEqual(plan.map(p => p.kind), ['manager', 'skill-trees', 'factions']);
  assert.deepEqual(planBundleImport(b, [], {isGM: true}), []);
});

test('files with errors are listed but never planned; one bad file does not hide the others', async () => {
  const b = await readImportBundle(await zipOf({'main.json': pack('AG-TEST-MAIN', ['ITEM-T1']), 'broken.json': '{not json',
    'empty.json': pack('AG-TEST-EMPTY', []), 'quests.json': quests}), JSZip);
  const byName = Object.fromEntries(b.files.map(f => [f.filename, f]));
  assert.equal(byName['broken.json'].status, 'error'); assert.match(byName['broken.json'].notice, /Not valid JSON/);
  assert.equal(byName['empty.json'].status, 'error');
  const plan = planBundleImport(b, b.files.map(f => f.filename), {isGM: true});
  assert.deepEqual(plan.map(p => p.filename), ['main.json', 'quests.json']);
});

test('per-file results: each planned file gets its own report, one failing file is shown without hiding the rest', async () => {
  const b = await readImportBundle(await catalog(), JSZip);
  const plan = planBundleImport(b, ['quests.json', 'trees.json'], {isGM: true});
  const apis = {
    quests: {importQuests: async p => ({created: p.records.map(r => r.id)})},
    'skill-trees': {importTrees: async () => { throw new Error('Initialize GM Storage first.'); }}
  };
  const reports = [];
  for (const file of plan) {
    const results = await applySpecialist(file.kind, file.payload, apis[file.kind], {ids: file.kind === 'quests' ? ['QST-T1', 'QST-T2'] : ['TREE-T1']});
    reports.push(buildImportReport({file: file.filename, results}));
  }
  assert.deepEqual(reports.map(r => [r.file, r.tone]), [['quests.json', 'ok'], ['trees.json', 'error']]);
  assert.match(reports[1].sections[0].lines[0].fix, /Initialize GM Storage/);
});

test('duplicate ids across files are reported and left out of the later file; duplicate art basenames are not uploaded', async () => {
  const b = await readImportBundle(await zipOf({'a.json': pack('AG-TEST-A', ['ITEM-T1', 'ITEM-T2']), 'b.json': pack('AG-TEST-B', ['ITEM-T2', 'ITEM-T3']),
    'c.json': pack('AG-TEST-C', ['ITEM-T1']), 'x/p.png': Uint8Array.from([1]), 'y/p.png': Uint8Array.from([2]), 'y/q.png': Uint8Array.from([3])}), JSZip);
  const [a, bb, c] = b.files;
  assert.equal(a.status, 'ok'); assert.equal(bb.status, 'warning'); assert.deepEqual(bb.duplicateIds, ['ITEM-T2']);
  assert.match(bb.notice, /left out \(not overwritten\): ITEM-T2/);
  assert.deepEqual(withoutDuplicates(bb).records.map(r => r.id), ['ITEM-T3']);
  assert.equal(c.status, 'error');
  assert.deepEqual(planBundleImport(b, ['a.json', 'b.json', 'c.json'], {isGM: true}).map(p => p.payload.records.length), [2, 1]);
  assert.deepEqual([...b.assets.keys()], ['q.png']); assert.deepEqual(b.duplicateArt, ['p.png']);
});

test('safety limits still apply to bundles: unsafe paths, file count, expanded size, too many import files', async () => {
  await assert.rejects(readImportBundle(await zipOf({'/abs.json': quests}), JSZip), /Unsafe ZIP entry path/);
  const many = {}; for (let i = 0; i < 501; i++) many[`f${i}.txt`] = 'x';
  await assert.rejects(readImportBundle(await zipOf(many), JSZip), /more than 500 files/);
  await assert.rejects(readImportBundle(await zipOf({'bomb.json': new Uint8Array(26_000_000)}), JSZip), /exceed safety limits/);
  const lots = {}; for (let i = 0; i <= MAX_BUNDLE_FILES; i++) lots[`q${i}.json`] = quests;
  await assert.rejects(readImportBundle(await zipOf(lots), JSZip), new RegExp(`limit is ${MAX_BUNDLE_FILES}.*No world changes`));
});

test('single-projection ZIP behaves as before; non-importable ZIP keeps the existing clear error', async () => {
  const single = await zipOf({'projection.json': pack('AG-TEST-ONE', ['ITEM-T1']), 'canonical.json': {manifest: {schema_version: 'ag-source-package/0.1'}, records: []}, 'p.png': Uint8Array.from([1])});
  const old = await readImportZip(single, JSZip);
  assert.equal(old.filename, 'projection.json'); assert.equal(old.assets.size, 1);
  const b = await readImportBundle(single, JSZip);
  assert.deepEqual(b.files.map(f => f.kind), ['manager']);
  const none = await zipOf({'canonical.json': {manifest: {schema_version: 'ag-source-package/0.1'}}, 'p.png': Uint8Array.from([1])});
  await assert.rejects(readImportZip(none, JSZip), /no ag-foundry-import/);
  assert.equal((await readImportBundle(none, JSZip)).files.length, 0);
  await assert.rejects(readImportZip(await zipOf({'a.json': pack('A', ['X']), 'b.json': pack('B', ['Y'])}), JSZip), /contains 2 Manager import projections/);
});

test('Import tab wiring: multi-file ZIPs use the contents list; single-package ZIPs keep readImportZip; Apply advances only after confirmation', () => {
  const main = readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  const hbs = readFileSync(new URL('../templates/manager.hbs', import.meta.url), 'utf8');
  assert.match(main, /importable\.length>1 \|\| importable\[0\]\?\.kind && importable\[0\]\.kind!=='manager'/);
  assert.match(main, /const result=await readImportZip\(buffer\)/);
  assert.match(main, /planBundleImport\(bundle,bundle\.picked,\{isGM:Boolean\(game\.user\?\.isGM\)\}\)/);
  assert.equal((main.match(/this\.applyRan=true;\n    this\.busy=true;/g) ?? []).length, 2);
  assert.match(main, /bundle\.outcome\.set\(next\.filename,'Needs attention'\);\n      return this\.#zipNext\(\);/);
  for (const action of ['zip-start', 'zip-skip', 'zip-cancel']) assert.match(hbs, new RegExp(`data-ag-action="${action}"`));
  assert.match(hbs, /data-ag-zip-pick="\{\{filename\}\}"/);
});
