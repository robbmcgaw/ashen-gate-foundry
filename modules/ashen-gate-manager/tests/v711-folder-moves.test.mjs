import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {moveManagerFolders, FOLDER_MOVES} from '../scripts/folders.js';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const doc = (id, sourceId) => ({id, name: id, flags: {'ashen-gate-manager': sourceId ? {source: {sourceId}} : {}}});
let n = 0;
const folder = (name, parent = null, contents = [], type = 'Actor') => ({id: `F${++n}`, name, type, folder: parent ? {id: parent} : null, contents});
function world(list) {
  const state = {list: [...list], moves: [], created: [], deleted: []};
  const run = (done = {}) => moveManagerFolders({folders: state.list, done,
    create: async data => { const f = {id: `N${++n}`, contents: [], ...data}; state.created.push(data); state.list.push(f); return f; },
    moveDocs: async (docs, folderId) => { state.moves.push({ids: docs.map(d => d.id), folderId}); for (const d of docs) for (const f of state.list) f.contents = (f.contents ?? []).filter(x => x !== d); state.list.find(f => f.id === folderId).contents.push(...docs); }});
  return {state, run};
}
const creatures = () => [doc('a', 'CRE-ONE'), doc('b', 'CRE-TWO')];

test('0.71.1 creatures move out of the old Draft folders into Ashen Gate/Bestiary, creating the path', async () => {
  const w = world([folder('Draft Frontier Creatures', null, creatures()), folder('Draft Ashen Additions', null, [doc('c', 'CRE-THREE')])]);
  const out = await w.run();
  assert.deepEqual(out.moved.map(m => [m.from, m.to, m.count]), [['Draft Frontier Creatures', 'Ashen Gate/Bestiary/Frontier Creatures', 2], ['Draft Ashen Additions', 'Ashen Gate/Bestiary/Ashen Additions', 1]]);
  assert.deepEqual(w.state.created.map(c => c.name), ['Ashen Gate', 'Bestiary', 'Frontier Creatures', 'Ashen Additions'], 'shared parents are created once');
  assert.deepEqual(out.done, {bestiaryFrontier: true, bestiaryAshen: true});
  assert.deepEqual(w.state.deleted, [], 'no folder is ever deleted');
  assert.equal(w.state.list.find(f => f.name === 'Draft Frontier Creatures').contents.length, 0, 'the old folder is left empty');
});

test('0.71.1 idempotent: a second run, and a run with the keys done, change nothing', async () => {
  const w = world([folder('Draft Frontier Creatures', null, creatures())]);
  const first = await w.run();
  const before = w.state.moves.length, madeBefore = w.state.created.length;
  const second = await w.run(first.done);
  assert.equal(second.moved.length, 0); assert.equal(w.state.moves.length, before); assert.equal(w.state.created.length, madeBefore);
  const third = await w.run({});   // even without the remembered keys there is nothing left to move
  assert.equal(third.moved.length, 0);
});

test('0.71.1 merges into a destination that already exists; nothing is duplicated', async () => {
  const root = folder('Ashen Gate'), best = folder('Bestiary', root.id), dest = folder('Frontier Creatures', best.id, [doc('z', 'CRE-OLD')]);
  const w = world([root, best, dest, folder('Draft Frontier Creatures', null, creatures())]);
  const out = await w.run();
  assert.equal(w.state.created.length, 0, 'every folder of the path already exists, so none is made');
  assert.deepEqual(dest.contents.map(d => d.id).sort(), ['a', 'b', 'z']);
  assert.equal(out.moved[0].count, 2);
});

test('0.71.1 only Manager-imported creatures move; a GM-renamed or nested folder is never touched', async () => {
  const mixed = folder('Draft Frontier Creatures', null, [doc('a', 'CRE-ONE'), doc('mine', null), doc('npc', 'NPC-X')]);
  const renamed = folder('My Frontier Monsters', null, creatures());
  const holder = folder('Somewhere'), nested = folder('Draft Ashen Additions', holder.id, [doc('d', 'CRE-NESTED')]);
  const itemFolder = folder('Draft Ashen Additions', null, [doc('i', 'CRE-ITEM')], 'Item');
  const w = world([mixed, renamed, holder, nested, itemFolder]);
  const out = await w.run();
  assert.deepEqual(w.state.moves.map(m => m.ids), [['a']], 'only the CRE- document of the exact old Actor folder at the top level');
  assert.deepEqual(mixed.contents.map(d => d.id).sort(), ['mine', 'npc']);
  assert.equal(renamed.contents.length, 2); assert.equal(nested.contents.length, 1); assert.equal(itemFolder.contents.length, 1);
  assert.equal(out.moved.length, 1);
});

test('0.71.1 a folder the move cannot finish is reported and retried, not marked done', async () => {
  const a = folder('Ashen Gate'), b = folder('Ashen Gate');   // two same-name siblings: ensureFolder refuses to guess
  const w = world([a, b, folder('Draft Frontier Creatures', null, creatures())]);
  const out = await w.run();
  assert.equal(out.moved.length, 0); assert.match(out.notes[0], /Draft Frontier Creatures \(Actor\) was not moved: Ambiguous Actor folder Ashen Gate/);
  assert.equal(out.done.bestiaryFrontier, undefined);
});

test('0.71.1 wiring: GM only, runs where the other folder renames run, bulk-safe, and the paths match the pack', () => {
  const main = read('../scripts/main.js');
  assert.match(main, /async function runFolderRenames\(\) \{\s*if\(!game\.user\?\.isGM\) return null;/);
  assert.match(main, /moveManagerFolders\(\{folders:game\.folders,done:out\.done/);
  assert.match(main, /Actor\.updateDocuments\(docs\.slice\(i,i\+25\)\.map\(d=>\(\{_id:d\.id,folder:folderId\}\)\),bulkWrite\(\)\)/);
  assert.match(main, /emitBulkFinished\('folders'\)/);
  assert.deepEqual(FOLDER_MOVES.map(m => m.to.join('/')), ['Ashen Gate/Bestiary/Frontier Creatures', 'Ashen Gate/Bestiary/Ashen Additions']);
  assert.doesNotMatch(read('../scripts/folders.js').slice(read('../scripts/folders.js').indexOf('FOLDER_MOVES')), /\.delete\(/);
});

test('0.71.1 version, CHANGELOG, README and Help', () => {
  assert.equal(JSON.parse(read('../module.json')).version, '0.86.0');
  assert.match(read('../CHANGELOG.md'), /^## 0\.71\.1 /m); assert.match(read('../README.md'), /Ashen Gate\/Bestiary/);
  assert.match(read('../scripts/main.js'), /Draft Frontier Creatures/);
});
