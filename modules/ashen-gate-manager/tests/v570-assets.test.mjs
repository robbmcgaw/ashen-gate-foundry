/** 0.57.0 Items → Assets: browsing, upload batching and conflicts, folder creation, id-named linking (preview, apply,
 *  the skip-edited rule, no Actors) and the missing-art list. Synthetic [TEST] records and a mocked FilePicker: this
 *  proves the logic, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  assetSources, defaultSource, listFolder, scanFolders, filterEntries, crumbs, parentPath, createFolder, folderNameProblem,
  triageUploads, uploadFiles, matchFilesToIds, imageState, planAssetLinks, applyAssetLinks, missingArtRows, missingState,
  baseName, samePath, MANAGE_ON_FORGE_URL
} from '../scripts/assets.js';
import {ITEM_VIEWS} from '../scripts/item-filters.js';

const M = 'ashen-gate-manager';
const GM = {isGM: true}, PLAYER = {isGM: false};
const file = name => ({name});

/** A tree of folders → {dirs, files}; paths come back the way The Forge returns them (absolute URLs for files). */
function mockPicker(tree, {prefix = 'https://assets.test/u1/'} = {}) {
  const calls = {browse: [], upload: [], createDirectory: []};
  let inFlight = 0, maxInFlight = 0;
  const picker = {
    calls,
    get maxInFlight() { return maxInFlight; },
    async browse(source, target) {
      calls.browse.push({source, target});
      const node = tree[target.replace(/^\/+|\/+$/g, '')];
      if (!node) throw new Error(`no such folder ${target}`);
      return {target, dirs: (node.dirs ?? []).map(d => `${prefix}${target ? `${target}/` : ''}${d}`), files: (node.files ?? []).map(f => `${prefix}${target ? `${target}/` : ''}${f}`)};
    },
    async upload(source, target, fileObj, body, options) {
      calls.upload.push({source, target, name: fileObj.name, options});
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(r => setTimeout(r, 2));
      inFlight--;
      if (fileObj.name.startsWith('boom')) throw new Error('quota exceeded');
      if (fileObj.name.startsWith('refused')) return false;
      return {status: 'success', path: `${prefix}${target}/${fileObj.name}`};
    },
    async createDirectory(source, target) { calls.createDirectory.push({source, target}); return {}; }
  };
  return picker;
}

// ---------- Sources, paths ----------
test('Forge Assets Library is the default source on The Forge; the data folder is always there', () => {
  assert.deepEqual(assetSources({}).map(s => s.id), ['data']);
  assert.deepEqual(assetSources({ForgeVTT: {usingTheForge: true}}).map(s => s.id), ['forgevtt', 'data']);
  assert.equal(defaultSource({ForgeVTT: {usingTheForge: true}}), 'forgevtt');
  assert.equal(defaultSource({}), 'data');
  assert.match(MANAGE_ON_FORGE_URL, /^https:\/\/forge-vtt\.com\//);
});

test('path helpers', () => {
  assert.equal(baseName('https://assets.test/u1/assets/npc/NPC%20OREN.webp?v=2'), 'NPC OREN.webp');
  assert.equal(parentPath('assets/npc'), 'assets');
  assert.equal(parentPath('assets'), '');
  assert.deepEqual(crumbs('assets/npc', 'Library').map(c => c.target), ['', 'assets', 'assets/npc']);
  assert.ok(samePath('/assets/npc/A.webp', 'assets/npc/A.webp?x=1'));
  assert.ok(!samePath('', ''));
  assert.deepEqual(filterEntries([{name: 'NPC-OREN.webp'}, {name: 'LOC-GATE.webp'}], 'oren npc').map(e => e.name), ['NPC-OREN.webp']);
});

// ---------- Browsing ----------
test('listFolder normalises Forge URLs, keeps only images, builds folder targets from the folder being viewed', async () => {
  const picker = mockPicker({'assets': {dirs: ['npc', 'loc'], files: ['readme.txt', 'b.png', 'A.webp']}});
  const out = await listFolder(picker, {source: 'forgevtt', target: 'assets', user: GM});
  assert.equal(out.ok, true);
  assert.deepEqual(out.dirs, [{name: 'loc', target: 'assets/loc'}, {name: 'npc', target: 'assets/npc'}]);
  assert.deepEqual(out.files.map(f => f.name), ['A.webp', 'b.png']);
  assert.equal(out.files[0].path, 'https://assets.test/u1/assets/A.webp'); // exactly what the source returned
  assert.deepEqual(picker.calls.browse, [{source: 'forgevtt', target: 'assets'}]);
});

test('listFolder reports a failure instead of throwing, and refuses non-GMs without browsing', async () => {
  const picker = mockPicker({});
  const bad = await listFolder(picker, {source: 'data', target: 'nope', user: GM});
  assert.equal(bad.ok, false); assert.match(bad.message, /Could not open this folder/);
  const denied = await listFolder(picker, {source: 'data', target: '', user: PLAYER});
  assert.equal(denied.ok, false); assert.match(denied.message, /Only a GM/);
  assert.equal(picker.calls.browse.length, 1);
  assert.equal((await listFolder(null, {source: 'data', user: GM})).ok, false);
});

test('scanFolders walks sub-folders within the caps and refuses non-GMs', async () => {
  const picker = mockPicker({'': {dirs: ['assets']}, 'assets': {dirs: ['npc'], files: ['LOC-X.webp']}, 'assets/npc': {files: ['NPC-OREN.webp']}});
  const out = await scanFolders(picker, {source: 'forgevtt', target: '', user: GM});
  assert.deepEqual(out.files.map(f => f.name).sort(), ['LOC-X.webp', 'NPC-OREN.webp']);
  assert.equal(out.complete, true);
  const shallow = await scanFolders(picker, {source: 'forgevtt', target: '', user: GM, limits: {maxDepth: 0, maxRequests: 50, concurrency: 1}});
  assert.equal(shallow.complete, false); // there were folders it did not open
  const denied = await scanFolders(mockPicker({}), {source: 'data', user: PLAYER});
  assert.equal(denied.ok, false);
});

// ---------- Create folder ----------
test('createFolder validates the name, is GM only and creates under the viewed folder', async () => {
  for (const bad of ['', ' x', 'a/b', '..', '.hidden', 'x'.repeat(65), 'a\\b']) assert.notEqual(folderNameProblem(bad), '', bad);
  assert.equal(folderNameProblem('Session 03_art-v2'), '');
  const picker = mockPicker({});
  const ok = await createFolder(picker, {source: 'forgevtt', parent: 'assets', name: 'npc', user: GM});
  assert.equal(ok.ok, true);
  assert.deepEqual(picker.calls.createDirectory, [{source: 'forgevtt', target: 'assets/npc'}]);
  assert.equal((await createFolder(picker, {source: 'forgevtt', name: '../x', user: GM})).ok, false);
  assert.equal((await createFolder(picker, {source: 'forgevtt', name: 'ok', user: PLAYER})).ok, false);
  assert.equal(picker.calls.createDirectory.length, 1);
  const failing = {createDirectory: async () => { throw new Error('exists'); }};
  const fail = await createFolder(failing, {source: 'data', name: 'dup', user: GM});
  assert.equal(fail.ok, false); assert.match(fail.message, /exists/);
});

// ---------- Upload ----------
test('triageUploads accepts images only and drops duplicates and path-like names', () => {
  const {accepted, rejected} = triageUploads([file('a.webp'), file('A.WEBP'), file('notes.txt'), file('x/y.png'), file('.hidden.png'), file('b.PNG')]);
  assert.deepEqual(accepted.map(f => f.name), ['a.webp', 'b.PNG']);
  assert.equal(rejected.length, 4);
});

test('uploadFiles runs at most three at a time, in order, with a result per file', async () => {
  const picker = mockPicker({});
  const names = Array.from({length: 8}, (_, i) => `NPC-${i}.webp`);
  const seen = [];
  const out = await uploadFiles([...names.map(file), file('readme.txt')], {picker, source: 'forgevtt', target: 'assets/npc', user: GM, onProgress: p => seen.push(p.done)});
  assert.ok(picker.maxInFlight <= 3 && picker.maxInFlight > 1, `in flight ${picker.maxInFlight}`);
  assert.deepEqual(picker.calls.upload.map(c => c.name), names);
  assert.ok(picker.calls.upload.every(c => c.source === 'forgevtt' && c.target === 'assets/npc' && c.options.notify === false));
  assert.equal(out.results.filter(r => r.status === 'uploaded').length, 8);
  assert.equal(out.results.find(r => r.name === 'readme.txt').status, 'rejected');
  assert.equal(out.ok, false); // one file was not an image
  assert.equal(seen.at(-1), 9);
});

test('a failed or refused upload is reported for that file only', async () => {
  const picker = mockPicker({});
  const out = await uploadFiles([file('boom.png'), file('refused.png'), file('fine.png')], {picker, source: 'data', target: 'assets', user: GM});
  const by = Object.fromEntries(out.results.map(r => [r.name, r]));
  assert.equal(by['boom.png'].status, 'failed'); assert.match(by['boom.png'].message, /quota/);
  assert.equal(by['refused.png'].status, 'failed');
  assert.equal(by['fine.png'].status, 'uploaded');
});

test('existing files are only touched after asking: skip keeps them, overwrite replaces, cancel uploads nothing', async () => {
  const run = async answer => {
    const picker = mockPicker({});
    const asked = [];
    const out = await uploadFiles([file('keep.webp'), file('new.webp')], {picker, source: 'data', target: 'assets', user: GM, existing: ['KEEP.webp'], decide: async names => { asked.push(names); return answer; }});
    return {picker, asked, out};
  };
  const skip = await run('skip');
  assert.deepEqual(skip.asked, [['keep.webp']]);
  assert.deepEqual(skip.picker.calls.upload.map(c => c.name), ['new.webp']);
  assert.equal(skip.out.results.find(r => r.name === 'keep.webp').status, 'skipped');
  const over = await run('overwrite');
  assert.deepEqual(over.picker.calls.upload.map(c => c.name), ['keep.webp', 'new.webp']);
  assert.equal(over.out.results.find(r => r.name === 'keep.webp').status, 'replaced');
  const cancel = await run(null);
  assert.equal(cancel.picker.calls.upload.length, 0);
  assert.equal(cancel.out.cancelled, true);
  // No clash: never asks.
  let asked = false;
  await uploadFiles([file('x.webp')], {picker: mockPicker({}), source: 'data', user: GM, existing: [], decide: async () => { asked = true; return 'skip'; }});
  assert.equal(asked, false);
});

test('Stop leaves the files not yet started untouched and says so', async () => {
  const picker = mockPicker({});
  const ctl = new AbortController();
  const out = await uploadFiles(Array.from({length: 6}, (_, i) => file(`f${i}.png`)), {picker, source: 'data', target: 'a', user: GM, concurrency: 1, signal: ctl.signal, onProgress: p => { if (p.done >= 2) ctl.abort(); }});
  assert.ok(picker.calls.upload.length < 6);
  assert.ok(out.results.some(r => r.status === 'not started'));
  assert.equal(out.cancelled, true);
});

test('uploadFiles is GM only: a player upload never reaches the picker', async () => {
  const picker = mockPicker({});
  const out = await uploadFiles([file('a.png')], {picker, source: 'data', target: 'a', user: PLAYER});
  assert.equal(out.ok, false);
  assert.equal(picker.calls.upload.length, 0);
});

// ---------- Matching and linking ----------
test('matchFilesToIds matches the whole name without extension, any case, and prefers webp then the shorter path', () => {
  const files = [
    {name: 'NPC-TEST-OREN.png', path: 'p/NPC-TEST-OREN.png'}, {name: 'npc-test-oren.webp', path: 'p/sub/npc-test-oren.webp'},
    {name: 'NPC-TEST-OREN-2.webp', path: 'p/NPC-TEST-OREN-2.webp'}, {name: 'notes.txt', path: 'p/notes.txt'}];
  const m = matchFilesToIds(files, ['NPC-TEST-OREN', 'NPC-TEST-NONE']);
  assert.equal(m.size, 1);
  const hit = m.get('npc-test-oren');
  assert.equal(hit.file.name, 'npc-test-oren.webp');
  assert.deepEqual(hit.others.map(o => o.name), ['NPC-TEST-OREN.png']);
});

test('imageState tells a default, a Manager pick, an earlier link, the import image and an edit apart', () => {
  assert.equal(imageState({img: ''}), 'default');
  assert.equal(imageState({img: 'icons/svg/item-bag.svg'}), 'default');
  assert.equal(imageState({img: 'icons/x.webp', flags: {iconSource: 'smart', iconPath: 'icons/x.webp'}}), 'smart');
  assert.equal(imageState({img: 'assets/a.webp', flags: {iconSource: 'authored', iconPath: 'assets/a.webp'}}), 'ours');
  assert.equal(imageState({img: 'assets/a.webp', baselineImg: 'assets/a.webp'}), 'imported');
  assert.equal(imageState({img: 'assets/mine.webp', baselineImg: 'assets/a.webp'}), 'edited');
  assert.equal(imageState({img: 'assets/mine.webp'}), 'edited');
});

const doc = (documentName, sourceId, name, img, extra = {}) => ({uuid: `${documentName}.${sourceId}`, documentName, type: 'loot', name, sourceId, img, flags: {}, ...extra});
const FILES = ['MAT-TEST-A', 'MAT-TEST-B', 'MAT-TEST-C', 'MAT-TEST-D', 'NPC-TEST-OREN', 'TBL-TEST-X', 'JRN-TEST-Y', 'MAT-TEST-SAME'].map(id => ({name: `${id}.webp`, path: `https://assets.test/u1/assets/${id}.webp`}));

test('planAssetLinks previews file → record, ticks only default/placeholder rows, and lists an Actor as a link row', () => {
  const docs = [
    doc('Item', 'MAT-TEST-A', '[TEST] Default', 'icons/svg/item-bag.svg'),
    doc('Item', 'MAT-TEST-B', '[TEST] Edited', 'worlds/w/mine.webp', {baselineImg: 'icons/svg/item-bag.svg'}),
    doc('Item', 'MAT-TEST-C', '[TEST] Imported', 'assets/c-old.webp', {baselineImg: 'assets/c-old.webp'}),
    doc('Item', 'MAT-TEST-D', '[TEST] Blank', ''),
    doc('Actor', 'NPC-TEST-OREN', '[TEST] Oren', 'icons/svg/mystery-man.svg'),
    doc('RollTable', 'TBL-TEST-X', '[TEST] Table', 'icons/svg/d20-grey.svg'),
    doc('JournalEntry', 'JRN-TEST-Y', '[TEST] Journal without image field', undefined),
    doc('Item', 'MAT-TEST-SAME', '[TEST] Already linked', 'https://assets.test/u1/assets/MAT-TEST-SAME.webp'),
    doc('Item', 'MAT-TEST-NOFILE', '[TEST] No file', '')
  ];
  const plan = planAssetLinks(docs, FILES);
  const by = Object.fromEntries(plan.rows.map(r => [r.uuid.split('.')[1], r]));
  assert.deepEqual(Object.keys(by).sort(), ['MAT-TEST-A', 'MAT-TEST-B', 'MAT-TEST-C', 'MAT-TEST-D', 'NPC-TEST-OREN', 'TBL-TEST-X']);
  assert.equal(by['NPC-TEST-OREN'].checked, true);
  assert.equal(by['MAT-TEST-A'].checked, true);
  assert.equal(by['MAT-TEST-D'].checked, true);
  assert.equal(by['TBL-TEST-X'].checked, true);
  assert.equal(by['MAT-TEST-B'].checked, false); assert.equal(by['MAT-TEST-B'].state, 'edited');
  assert.equal(by['MAT-TEST-C'].checked, false); assert.equal(by['MAT-TEST-C'].state, 'imported');
  assert.equal(by['MAT-TEST-A'].from, 'icons/svg/item-bag.svg');
  assert.equal(by['MAT-TEST-A'].to, 'https://assets.test/u1/assets/MAT-TEST-A.webp');
  assert.equal(by['MAT-TEST-A'].fileName, 'MAT-TEST-A.webp');
  assert.equal(plan.unmatched, 1);
});

function worldFor(docs) {
  const written = [];
  const live = new Map(docs.map(d => [d.uuid, {...d, id: d.uuid.replace('.', '_')}]));
  return {
    written,
    getDoc: uuid => live.get(uuid) ?? null,
    updateMany: async (documentName, updates) => { written.push({documentName, updates}); },
    live
  };
}

test('applyAssetLinks writes only img and Manager icon flags, and only for ticked rows', async () => {
  const docs = [doc('Item', 'MAT-TEST-A', '[TEST] A', ''), doc('Item', 'MAT-TEST-B', '[TEST] B', 'worlds/w/mine.webp'), doc('RollTable', 'TBL-TEST-X', '[TEST] T', 'icons/svg/d20-grey.svg')];
  const plan = planAssetLinks(docs, FILES);
  const w = worldFor(docs);
  const out = await applyAssetLinks(plan.rows, {user: GM, moduleId: M, getDoc: w.getDoc, updateMany: w.updateMany});
  assert.equal(out.applied.length, 2); // B (edited) was not ticked
  const items = w.written.find(x => x.documentName === 'Item').updates;
  assert.equal(items.length, 1);
  assert.deepEqual(Object.keys(items[0]).sort(), ['_id', 'flags.ashen-gate-manager.iconPath', 'flags.ashen-gate-manager.iconSource', 'img']);
  assert.equal(items[0].img, 'https://assets.test/u1/assets/MAT-TEST-A.webp');
  assert.ok(w.written.some(x => x.documentName === 'RollTable'));
  assert.ok(!JSON.stringify(w.written).includes('system'));
});

test('an edited image is replaced only when the GM ticks it', async () => {
  const docs = [doc('Item', 'MAT-TEST-B', '[TEST] B', 'worlds/w/mine.webp', {baselineImg: 'icons/svg/item-bag.svg'})];
  const plan = planAssetLinks(docs, FILES);
  assert.equal(plan.rows[0].checked, false);
  const untouched = worldFor(docs);
  await applyAssetLinks(plan.rows, {user: GM, moduleId: M, getDoc: untouched.getDoc, updateMany: untouched.updateMany});
  assert.equal(untouched.written.length, 0);
  plan.rows[0].checked = true;
  const ticked = worldFor(docs);
  const out = await applyAssetLinks(plan.rows, {user: GM, moduleId: M, getDoc: ticked.getDoc, updateMany: ticked.updateMany});
  assert.equal(out.applied.length, 1);
  assert.equal(ticked.written[0].updates[0].img, plan.rows[0].to);
});

test('a record whose image changed since the preview, or is gone, is skipped', async () => {
  const docs = [doc('Item', 'MAT-TEST-A', '[TEST] A', ''), doc('Item', 'MAT-TEST-D', '[TEST] D', '')];
  const plan = planAssetLinks(docs, FILES);
  const w = worldFor(docs);
  w.live.get('Item.MAT-TEST-A').img = 'worlds/w/set-meanwhile.webp';
  w.live.delete('Item.MAT-TEST-D');
  const out = await applyAssetLinks(plan.rows, {user: GM, moduleId: M, getDoc: w.getDoc, updateMany: w.updateMany});
  assert.equal(out.applied.length, 0);
  assert.deepEqual(out.skipped.map(s => s.why).sort(), ['its image changed since the preview', 'no longer in the world']);
  assert.equal(w.written.length, 0);
});

test('applyAssetLinks is GM only: a player changes nothing', async () => {
  const docs = [doc('Item', 'MAT-TEST-A', '[TEST] A', '')];
  const plan = planAssetLinks(docs, FILES);
  const w = worldFor(docs);
  const out = await applyAssetLinks(plan.rows, {user: PLAYER, moduleId: M, getDoc: w.getDoc, updateMany: w.updateMany});
  assert.equal(out.ok, false);
  assert.equal(w.written.length, 0);
});

test('a write error is reported and the rows count as skipped, not applied', async () => {
  const docs = [doc('Item', 'MAT-TEST-A', '[TEST] A', '')];
  const plan = planAssetLinks(docs, FILES);
  const w = worldFor(docs);
  const out = await applyAssetLinks(plan.rows, {user: GM, moduleId: M, getDoc: w.getDoc, updateMany: async () => { throw new Error('locked'); }});
  assert.equal(out.applied.length, 0); assert.equal(out.errors.length, 1);
  assert.match(out.message, /locked/);
});

// ---------- Missing art ----------
test('missingArtRows lists records with no or a generic image, filters, and shows names with the file name to make', () => {
  assert.equal(missingState(''), 'none');
  assert.equal(missingState('icons/svg/mystery-man.svg'), 'generic');
  assert.equal(missingState('systems/dnd5e/icons/svg/items/loot.svg'), 'generic');
  assert.equal(missingState('modules/ashen-gate-manager/assets/icons/material.svg'), 'generic');
  assert.equal(missingState('worlds/w/real.webp'), null);
  const docs = [
    doc('Item', 'MAT-TEST-A', '[TEST] Iron Nails', ''), doc('Item', 'MAT-TEST-B', '[TEST] Real Art', 'worlds/w/real.webp'),
    doc('Actor', 'NPC-TEST-OREN', '[TEST] Oren', 'icons/svg/mystery-man.svg'), doc('JournalEntry', 'JRN-TEST-Y', '[TEST] Note', undefined),
    doc('RollTable', 'TBL-TEST-X', '[TEST] Table', 'icons/svg/d20-grey.svg'), {...doc('Item', '', 'Not Manager', ''), sourceId: ''}];
  const all = missingArtRows(docs);
  assert.deepEqual(all.map(r => r.name), ['[TEST] Oren', '[TEST] Iron Nails', '[TEST] Table']);
  assert.equal(all.find(r => r.name === '[TEST] Oren').fileName, 'NPC-TEST-OREN.webp');
  assert.equal(all.find(r => r.name === '[TEST] Oren').linkable, true);
  assert.deepEqual(missingArtRows(docs, {kind: 'Item'}).map(r => r.name), ['[TEST] Iron Nails']);
  assert.deepEqual(missingArtRows(docs, {state: 'none'}).map(r => r.name), ['[TEST] Iron Nails']);
  assert.deepEqual(missingArtRows(docs, {state: 'generic'}).map(r => r.name), ['[TEST] Oren', '[TEST] Table']);
  assert.deepEqual(missingArtRows(docs, {query: 'nails'}).map(r => r.name), ['[TEST] Iron Nails']);
  const waiting = missingArtRows(docs, {foundNames: new Set(['mat-test-a'])});
  assert.equal(waiting.find(r => r.name === '[TEST] Iron Nails').fileWaiting, true);
  assert.equal(waiting.find(r => r.name === '[TEST] Oren').fileWaiting, false);
  assert.ok(all.every(r => !('sourceId' in r) && !('id' in r)));
});

// ---------- Wiring ----------
const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
const hbs = fs.readFileSync(new URL('../templates/manager.hbs', import.meta.url), 'utf8');

test('Assets is an Items sub-tab, and every asset action in the window checks the GM first', () => {
  assert.ok(ITEM_VIEWS.some(v => v.id === 'assets' && v.label === 'Assets'));
  assert.equal(ITEM_VIEWS.find(v => v.id === 'assets').filters, false);
  for (const fn of ['async #assetsAction(name)', 'async #assetsStage(files)', 'async #assetsStageAction(name,el)', 'async #assetsUploadStaged()', 'async #assetsUpload(files,', 'async #assetsNoMatchAction(name,el)']) {
    const at = main.indexOf(fn);
    assert.ok(at > 0, fn);
    assert.match(main.slice(at, at + 160), /if\(!game\.user\?\.isGM\)throw new Error\('Only a GM can manage assets\.'\)/);
  }
  assert.match(main, /_prepareContext[\s\S]{0,200}Only GMs can open the General Manager/);
});

test('the Assets template offers a keyboard file button, Manage on Forge, no delete/rename/move controls and no raw-id column', () => {
  const at = hbs.indexOf('{{#if assetsActive}}');
  const block = hbs.slice(at, hbs.indexOf('{{#if libraryExportActive}}', at));
  assert.match(block, /\{\{\{assets\.chooseFiles\}\}\}/);
  assert.match(block, /Manage on Forge…/);
  assert.match(block, /data-ag-assets-drop/);
  assert.doesNotMatch(block, /data-ag-action="assets-(delete|rename|move)/);
  assert.doesNotMatch(block, /\{\{sourceId\}\}|\{\{id\}\}/);
  assert.match(block, /aria-label="Copy path of \{\{name\}\}"/);
});
