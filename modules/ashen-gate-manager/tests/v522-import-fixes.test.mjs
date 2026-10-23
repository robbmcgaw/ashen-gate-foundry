/** 0.52.2: folder paths deeper than Foundry's 4 levels collapse into level 4; a re-import reads a baseline Foundry
 *  expanded (nested) the same as a flat one, so it plans Update instead of "Source removed system"; ZIP auto mode lists
 *  Blocked / Conflict rows under Needs your decision; Browse "activity" finds activity recipes, not crafted items whose
 *  text mentions a dnd5e activity. Synthetic [TEST] data; mocked Foundry: proves the logic, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ensureFolder, collapseSegments, foundryFolderSegments, folderDestination, FOLDER_MAX_DEPTH} from '../scripts/folders.js';
import {planRecord, exportedFields, baselineFields} from '../scripts/core.js';
import {autoSelect, autoFileCounts, decisionText} from '../scripts/zip-import.js';
import {createBrowse} from '../scripts/browse.js';
import {compilePackage} from '../scripts/workflows.js';
import {sourceMetadata} from '../scripts/source-projection.mjs';

const M = 'ashen-gate-manager';

// ---------- Folder depth ----------
/** Folders like Foundry's: creating one deeper than 4 levels throws Foundry's own message. */
function foundryFolders() {
  const docs = [];
  const depth = id => { let n = 0; for (let f = docs.find(x => x.id === id); f; f = docs.find(x => x.id === f.folder)) n++; return n; };
  const folders = {get: id => docs.find(x => x.id === id), filter: fn => docs.filter(fn), find: fn => docs.find(fn)};
  const create = async data => {
    if (depth(data.folder) + 1 > 4) throw new Error('You may not nest Folders more than 4 levels deep.');
    const doc = {...data, id: `f${docs.length + 1}`}; docs.push(doc); return doc;
  };
  return {docs, folders, create};
}
const pathOf = (docs, folder) => { const names = []; for (let f = folder; f; f = docs.find(x => x.id === f.folder)) names.unshift(f.name); return names.join('/'); };

test('0.52.2: a 5-level folder path files into "Music - Compositions" at level 4 instead of failing', async () => {
  const m = foundryFolders();
  const path = 'Ashen Gate/Professions/Artistry/Music/Compositions';
  const folder = await ensureFolder('Item', path, m);
  assert.equal(folder.name, 'Music - Compositions');
  assert.equal(pathOf(m.docs, folder), 'Ashen Gate/Professions/Artistry/Music - Compositions');
  assert.equal(m.docs.length, 4);
  assert.deepEqual(folderDestination(path), {path: 'Ashen Gate/Professions/Artistry/Music - Compositions', collapsed: true});
  assert.equal(FOLDER_MAX_DEPTH, 4);
});

test('0.52.2: a 6-level path joins every level past the 3rd; a 4-level path is unchanged', async () => {
  assert.deepEqual(foundryFolderSegments('Ashen Gate/Perks/Artistry/Music/Compositions/Ballads'),
    ['Ashen Gate', 'Perks', 'Artistry', 'Music - Compositions - Ballads']);
  assert.deepEqual(collapseSegments(['A', 'B', 'C', 'D']), ['A', 'B', 'C', 'D']);
  const m = foundryFolders();
  const six = await ensureFolder('Item', 'Ashen Gate/Perks/Artistry/Music/Compositions/Ballads', m);
  assert.equal(pathOf(m.docs, six), 'Ashen Gate/Perks/Artistry/Music - Compositions - Ballads');
  const four = await ensureFolder('Item', 'Ashen Gate/Professions/Recipes/Alchemy', m);
  assert.equal(pathOf(m.docs, four), 'Ashen Gate/Professions/Recipes/Alchemy');
  assert.deepEqual(folderDestination('Ashen Gate/Professions/Recipes/Alchemy'), {path: 'Ashen Gate/Professions/Recipes/Alchemy', collapsed: false});
  assert.equal(folderDestination(''), null);
});

test('0.52.2: re-importing the same deep paths finds the same folders (no duplicates), for every folder type', async () => {
  const m = foundryFolders();
  const paths = ['Ashen Gate/Professions/Artistry/Music/Compositions', 'Ashen Gate/Professions/Artistry/Music/Compositions/Ballads'];
  const first = [];
  for (const type of ['Item', 'JournalEntry', 'Actor', 'RollTable']) for (const p of paths) first.push(await ensureFolder(type, p, m));
  const count = m.docs.length;
  assert.equal(count, 4 * 5, 'four types, three shared levels plus two collapsed level-4 folders each');
  // A later import run: new cache, same world folders.
  const again = [];
  for (const type of ['Item', 'JournalEntry', 'Actor', 'RollTable']) for (const p of paths) again.push(await ensureFolder(type, p, {...m, cache: new Map()}));
  assert.equal(m.docs.length, count, 'no new folders');
  assert.deepEqual(again.map(f => f.id), first.map(f => f.id));
  assert.ok(m.docs.every(f => !/Compositions$/.test(f.name) || f.name.includes(' - ')), 'no 5th-level Compositions folder');
});

test('0.52.2: the renamed Cinder folder still applies before the depth limit', () => {
  assert.deepEqual(foundryFolderSegments('Ashen Gate/Cinders/Powers/Ember/Minor/Sparks'), ['Ashen Gate', 'Cinders', 'Cinder - Powers', 'Ember - Minor - Sparks']);
});

// ---------- Re-import baseline ----------
/** Foundry's expandObject: dotted keys become nested objects, at every depth (as Document#update does). */
function expand(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const value = v && typeof v === 'object' && !Array.isArray(v) ? expand(v) : v;
    const parts = k.split('.'); let t = out;
    for (const p of parts.slice(0, -1)) t = t[p] = t[p] && typeof t[p] === 'object' ? t[p] : {};
    const last = parts.at(-1);
    t[last] = value && typeof value === 'object' && !Array.isArray(value) && t[last] && typeof t[last] === 'object' ? {...t[last], ...value} : value;
  }
  return out;
}
const item = (desc, price = 5) => ({id: 'ITEM-TEST-LUTE', entity_type: 'Item', status: 'approved', version: '0.1.0', visibility: 'player', refs: [],
  foundry: {document_type: 'Item', data: {name: '[TEST] Lute', type: 'loot', img: 'icons/x.webp', system: {description: {value: desc}, price: {value: price}}}}});
/** A matched document as the planner sees it: live values plus the source flag with the given baseline. */
const wrapped = (live, managedFields) => ({documentName: 'Item', type: 'loot', flag: {sourceId: 'ITEM-TEST-LUTE', managedFields},
  get: p => p.split('.').reduce((v, k) => v?.[k], live)});

test('0.52.2: a baseline Foundry stored nested plans Update, not "Source removed system"', () => {
  const old = item('<p>[TEST] Old note.</p>');
  const live = {name: '[TEST] Lute', img: 'icons/x.webp', system: {description: {value: '<p>[TEST] Old note.</p>'}, price: {value: 5}}};
  const nested = expand(exportedFields(old));
  assert.ok(nested.system && !('system.description.value' in nested), 'what Foundry keeps after an update');
  const plan = planRecord(item('<p>[TEST] New note.</p>'), [wrapped(live, nested)]);
  assert.equal(plan.action, 'update', plan.reason);
  assert.deepEqual(plan.patch, {'system.description.value': '<p>[TEST] New note.</p>'});
  assert.equal(planRecord(old, [wrapped(live, nested)]).action, 'unchanged');
});

test('0.52.2: a baseline holding both flat (create) and nested (later update) keys reads the nested one', () => {
  const flat = exportedFields(item('<p>[TEST] Raw.</p>'));
  const both = {...flat, ...expand({'system.description.value': '<p>[TEST] Linked.</p>'})};
  assert.equal(baselineFields(both)['system.description.value'], '<p>[TEST] Linked.</p>');
  assert.equal(baselineFields(both)['system.price.value'], 5);
  assert.deepEqual(baselineFields(flat), flat, 'a flat baseline is unchanged');
  assert.deepEqual(baselineFields({name: 'x', system: {}}), {name: 'x', system: {}}, 'an empty object stays a leaf');
});

test('0.52.2: a GM edit the source also changed is a Conflict; a field really removed is still Blocked', () => {
  const nested = expand(exportedFields(item('<p>[TEST] Old.</p>')));
  const edited = {name: '[TEST] Lute', img: 'icons/x.webp', system: {description: {value: '<p>[TEST] GM text.</p>'}, price: {value: 5}}};
  assert.equal(planRecord(item('<p>[TEST] New.</p>'), [wrapped(edited, nested)]).action, 'conflict');
  const removed = item('<p>[TEST] Old.</p>'); delete removed.foundry.data.system.price;
  const plan = planRecord(removed, [wrapped({...edited, system: {description: {value: '<p>[TEST] Old.</p>'}, price: {value: 5}}}, nested)]);
  assert.equal(plan.action, 'blocked');
  assert.match(plan.reason, /Source removed system\.price\.value/);
});

// ---------- ZIP auto mode ----------
test('0.52.2: auto mode lists Blocked and Conflict rows by name and reason under Needs your decision', () => {
  const rows = [{id: 'A', name: '[TEST] A', action: 'create'}, {id: 'B', name: '[TEST] B', action: 'update'},
    {id: 'C', name: '[TEST] C', action: 'blocked', reason: 'Unmanaged existing document has same name; rename or resolve manually.'},
    {id: 'D', name: '[TEST] D', action: 'blocked', reason: 'Unmanaged existing document has same name; rename or resolve manually.'},
    {id: 'E', name: '[TEST] E', action: 'conflict', reason: 'Both source and Foundry edited: name.'},
    {id: 'F', name: '[TEST] F', action: 'skipped', reason: 'Unapproved record; enable Include drafts to test.'}];
  const on = autoSelect(rows, {updates: true});
  assert.deepEqual(on.selected, ['A', 'B']);
  assert.deepEqual(on.needsDecision.map(r => r.id), ['C', 'D', 'E']);
  assert.equal(decisionText(on.needsDecision),
    'Blocked (Unmanaged existing document has same name; rename or resolve manually.): [TEST] C, [TEST] D; Conflict (Both source and Foundry edited: name.): [TEST] E');
  assert.equal(decisionText(autoSelect(rows).needsDecision).split('; ')[0], '[TEST] B', 'updates are listed by name first when the updates box is off');
  const counts = autoFileCounts(rows, on.selected, [{id: 'A', action: 'create', status: 'ok'}, {id: 'B', action: 'update', status: 'ok'}]).counts;
  assert.deepEqual(counts, {created: 1, updated: 1, unchanged: 0, needsDecision: 3, skipped: 1, failed: 0});
});

// ---------- Browse "activity" ----------
const SAMPLE = JSON.parse(readFileSync(new URL('../samples/AG_Artistry_v0.49.0_Test.json', import.meta.url), 'utf8'));
function world() {
  const pkg = compilePackage(structuredClone(SAMPLE));
  const base = {status: 'approved', version: '0.1.0', visibility: 'player', scope: 'generic_rules', provenance: {sources: ['[TEST] synthetic']}, refs: []};
  const gmText = '<h3>GM Adjudication</h3><p>The written effect is authoritative until a corresponding tested dnd5e activity is configured.</p>';
  const extra = [
    {...base, id: 'ITEM-TEST-COOKING-BROTH', entity_type: 'Item', name: '[TEST] Broth',
      foundry: {document_type: 'Item', data: {name: '[TEST] Broth', type: 'consumable', system: {description: {value: gmText}}}}},
    {...base, id: 'ITEM-TEST-SMITH-EDGE', entity_type: 'Item', name: '[TEST] Edge', summary: 'Crafted edge; its activity is set up by the GM.',
      foundry: {document_type: 'Item', data: {name: '[TEST] Edge', type: 'weapon', system: {description: {value: gmText}}}}},
    {...base, id: 'ITEM-TEST-ACTIVITY-BOARD', entity_type: 'Item', name: '[TEST] Activity Board',
      foundry: {document_type: 'Item', data: {name: '[TEST] Activity Board', type: 'loot', system: {description: {value: '<p>[TEST]</p>'}}}}}
  ];
  const items = [...pkg.records, ...extra].map((r, i) => ({documentName: 'Item', id: `i${i}`, uuid: `Item.i${i}`, name: r.foundry.data.name,
    type: r.foundry.data.type, system: r.foundry.data.system ?? {}, folder: null, _stats: {modifiedTime: 0},
    flags: {[M]: {source: sourceMetadata(r, pkg, r.refs)}}, toDragData() { return {}; }}));
  // A world Item no import made, whose description mentions an activity.
  items.push({documentName: 'Item', id: 'w1', uuid: 'Item.w1', name: '[TEST] Homebrew Stew', type: 'consumable', folder: null, _stats: {modifiedTime: 0},
    system: {description: {value: gmText}}, flags: {}, toDragData() { return {}; }});
  const game = {user: {isGM: true}, items: {contents: items}, actors: {contents: []}, journal: {contents: []},
    modules: {get: () => null, values: () => [].values()}, packs: {contents: []}};
  return createBrowse({game});
}
const ids = (svc, query) => svc.search({query, group: 'none'}).groups.flatMap(g => g.rows.map(r => r.id ?? r.name)).sort();

test('0.52.2: Browse "activity" finds activity recipes, not crafted items whose text mentions a dnd5e activity', () => {
  const svc = world();
  assert.deepEqual(ids(svc, 'activity'), ['ITEM-TEST-ACTIVITY-BOARD', 'REC-TEST-ARTISTRY-BALLAD', 'REC-TEST-ARTISTRY-PORTRAIT'],
    'activity recipes, plus a name with the word');
  assert.deepEqual(ids(svc, 'activities'), ['REC-TEST-ARTISTRY-BALLAD', 'REC-TEST-ARTISTRY-PORTRAIT']);
  assert.deepEqual(ids(svc, 'ACTIVITY'), ids(svc, 'activity'));
  // Other words still search the description, so the crafted items are findable by their text.
  assert.ok(ids(svc, 'adjudication').includes('ITEM-TEST-COOKING-BROTH'));
  assert.ok(ids(svc, 'adjudication').includes('[TEST] Homebrew Stew'));
});
