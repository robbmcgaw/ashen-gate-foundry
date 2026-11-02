/** 0.100.0: Allow ids again. Mocked Foundry: these prove the logic, the preview HTML and the wiring, not the live dialog or window. */
import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {MODULE_ID} from '../scripts/core.js';
import {buildSyncSet, planSync, SYNC_RETIRED_SETTING} from '../scripts/sync.js';
import {syncView} from '../scripts/sync-view.js';
import {SYNC_SUPERSEDED_SETTING, allowRetiredIds, noteSupersededIds, planAllowRetired, allowTitle, allowConfirmText, ALLOW_BUTTON, REFUSAL} from '../scripts/sync-retired.js';

const prov = {source: 'test'};
const rec = (id, name, over = {}) => ({id, entity_type: 'Recipe', status: 'approved', version: '1.0.0', visibility: 'player', refs: [], provenance: prov, ...over,
  foundry: {document_type: 'Item', data: {name, type: 'loot', system: {description: {value: `<p>${name}</p>`}}}}});
const pkg = records => ({manifest: {schema_version: 'ag-foundry-import/0.1', package_id: 'PKG-MAIN', version: '2.0.0'}, records});
const setOf = records => buildSyncSet([{filename: 'PKG-MAIN.json', kind: 'manager', payload: pkg(records)}]);
const emptyWorld = {docs: [], characterCount: 0, unflaggedNames: {}};
const ctx = (retired, extra = {}) => ({includeDrafts: true, retiredIds: new Set(retired), ledger: {}, buildFlag: () => ({}), externalIds: new Set(), sceneActorIds: new Set(), hotbarMacroIds: new Set(), isProtectedFolder: () => false, ...extra});
const view = (plan, extra = {}) => syncView({inputs: [{name: 'f.json', imports: [{filename: 'f.json', label: 'Manager package', records: 3, packageId: 'PKG-MAIN'}]}], skipped: [], fileButton: '', deleteUnscoped: false, overwriteEdited: false, replaceArt: false,
  isGM: true, plan, phrase: '', busy: false, progress: null, stopping: false, result: null, message: '', shown: {}, ...extra});

function mockGame({isGM = true, retired = [], superseded = []} = {}) {
  const store = new Map([[SYNC_RETIRED_SETTING, [...retired]], [SYNC_SUPERSEDED_SETTING, [...superseded]]]);
  const writes = [];
  return {user: {isGM}, writes, store, settings: {get: (m, k) => { assert.equal(m, MODULE_ID); return structuredClone(store.get(k)); }, set: async (m, k, v) => { writes.push([k, structuredClone(v)]); store.set(k, structuredClone(v)); }}};
}

const A = rec('REC-TEST-A', '[TEST] A'), B = rec('REC-TEST-B', '[TEST] B'), C = rec('REC-TEST-C', '[TEST] C');

test('a GM takes only the chosen ids off the retired list; the rest stay', async () => {
  const game = mockGame({retired: ['REC-TEST-A', 'REC-TEST-B', 'REC-TEST-OTHER']});
  const out = await allowRetiredIds(game, MODULE_ID, ['REC-TEST-A'], {set: setOf([A, B])});
  assert.deepEqual(out.allowed, ['REC-TEST-A']);
  assert.deepEqual(out.refused, []);
  assert.deepEqual(game.store.get(SYNC_RETIRED_SETTING), ['REC-TEST-B', 'REC-TEST-OTHER']);
  assert.deepEqual(game.writes.map(w => w[0]), [SYNC_RETIRED_SETTING], 'nothing else is written');
});

test('a non-GM is refused in the data layer and nothing is written', async () => {
  const game = mockGame({isGM: false, retired: ['REC-TEST-A']});
  await assert.rejects(allowRetiredIds(game, MODULE_ID, ['REC-TEST-A'], {set: setOf([A])}), /Only a GM/);
  assert.equal(game.writes.length, 0);
});

test('an id the saved superseded list names stays retired', async () => {
  const game = mockGame({retired: ['REC-TEST-A'], superseded: ['REC-TEST-A']});
  const out = await allowRetiredIds(game, MODULE_ID, ['REC-TEST-A'], {set: setOf([A])});
  assert.deepEqual(out.allowed, []);
  assert.deepEqual(out.refused, [{id: 'REC-TEST-A', reason: REFUSAL.superseded}]);
  assert.equal(game.writes.length, 0);
});

test('an id that a record in the package supersedes stays retired, even in older data with no superseded list', async () => {
  const game = mockGame({retired: ['REC-TEST-OLD', 'REC-TEST-B']});
  const out = await allowRetiredIds(game, MODULE_ID, ['REC-TEST-OLD', 'REC-TEST-B'], {set: setOf([rec('REC-TEST-NEW', '[TEST] New', {supersedes: ['REC-TEST-OLD']}), B])});
  assert.deepEqual(out.allowed, ['REC-TEST-B']);
  assert.deepEqual(out.refused.map(r => r.id), ['REC-TEST-OLD']);
  assert.deepEqual(game.store.get(SYNC_RETIRED_SETTING), ['REC-TEST-OLD']);
});

test('older data: an id the package does not carry, or with no preview open, is refused', async () => {
  const game = mockGame({retired: ['REC-TEST-A', 'REC-TEST-GONE']});
  let out = await allowRetiredIds(game, MODULE_ID, ['REC-TEST-GONE'], {set: setOf([A])});
  assert.deepEqual(out.refused, [{id: 'REC-TEST-GONE', reason: REFUSAL.notInPackage}]);
  out = await allowRetiredIds(game, MODULE_ID, ['REC-TEST-A'], {set: null});
  assert.equal(out.refused[0].reason, REFUSAL.notInPackage);
  assert.equal(game.writes.length, 0);
  await assert.rejects(allowRetiredIds(game, MODULE_ID, 'REC-TEST-A', {set: setOf([A])}), TypeError);
});

test('running it again is idempotent: the second call writes nothing', async () => {
  const game = mockGame({retired: ['REC-TEST-A', 'REC-TEST-B']});
  const set = setOf([A, B]);
  await allowRetiredIds(game, MODULE_ID, ['REC-TEST-A', 'REC-TEST-A'], {set});
  const again = await allowRetiredIds(game, MODULE_ID, ['REC-TEST-A'], {set});
  assert.deepEqual(again.allowed, []);
  assert.deepEqual(again.unchanged, ['REC-TEST-A']);
  assert.equal(game.writes.length, 1);
  assert.deepEqual(game.store.get(SYNC_RETIRED_SETTING), ['REC-TEST-B']);
});

test('noteSupersededIds adds old ids once and sorted, and does not rewrite when nothing is new', async () => {
  const game = mockGame();
  await noteSupersededIds(game, MODULE_ID, ['REC-TEST-Z', 'REC-TEST-Y']);
  await noteSupersededIds(game, MODULE_ID, ['REC-TEST-Y']);
  assert.deepEqual(game.store.get(SYNC_SUPERSEDED_SETTING), ['REC-TEST-Y', 'REC-TEST-Z']);
  assert.equal(game.writes.length, 1);
});

test('planAllowRetired reports invalid input', () => {
  assert.equal(planAllowRetired({ids: [''], retired: [], superseded: [], set: null}).refused[0].reason, REFUSAL.invalid);
});

test('the confirmation says what happens, names the count, and the button is Allow ids', () => {
  assert.equal(allowTitle(27), 'Allow 27 ids again?');
  assert.equal(allowTitle(1), 'Allow 1 id again?');
  assert.equal(ALLOW_BUTTON, 'Allow ids');
  const text = allowConfirmText(27);
  assert.match(text, /removed by an earlier Sync/);
  assert.match(text, /next Sync create the records again from the pack/);
  assert.match(text, /Nothing else changes/);
  const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  assert.match(main, /confirmDanger\(allowConfirmText\(ids\.length\),\{title:allowTitle\(ids\.length\),yes:ALLOW_BUTTON\}\)/, 'a danger confirm: Cancel is the default, never OK/Yes');
});

test('the Refused section offers Allow for a GM, keeps a fold key, and hides the buttons from anyone else', () => {
  const records = [A, B, rec('REC-TEST-NEW', '[TEST] New', {supersedes: ['REC-TEST-OLD']}), rec('REC-TEST-OLD2', '[TEST] Old2')];
  const set = setOf(records);
  const plan = planSync(set, emptyWorld, ctx(['REC-TEST-A', 'REC-TEST-B', 'REC-TEST-NEW']));
  assert.equal(plan.counts.refused, 3);
  const rows = Object.fromEntries(plan.rows.filter(r => r.retired).map(r => [r.id, r.allowable]));
  assert.deepEqual(rows, {'REC-TEST-A': true, 'REC-TEST-B': true, 'REC-TEST-NEW': true});
  const html = view(plan);
  assert.match(html, /<details class="ag-fold" data-ag-fold-key="sync-refused" open>/);
  assert.match(html, /data-ag-sync-allow="all"[^>]*>Allow these ids again…<\/button>/);
  assert.match(html, /data-ag-sync-allow="REC-TEST-A"[^>]*>Allow again…/);
  assert.match(html, /Allows the 3 ids below/);
  const player = view(plan, {isGM: false});
  assert.doesNotMatch(player, /data-ag-sync-allow/);
});

test('a row whose id is on the saved superseded list is marked not allowable and shows why', () => {
  const plan = planSync(setOf([A]), emptyWorld, ctx(['REC-TEST-A'], {supersededIds: new Set(['REC-TEST-A'])}));
  const row = plan.rows.find(r => r.id === 'REC-TEST-A');
  assert.equal(row.retired, true);
  assert.equal(row.allowable, false);
  const html = view(plan);
  assert.doesNotMatch(html, /data-ag-sync-allow/);
  assert.match(html, /stays retired\./);
});

test('after allowing, the next preview creates the record', async () => {
  const game = mockGame({retired: ['REC-TEST-A', 'REC-TEST-B']});
  const set = setOf([A, B, C]);
  const before = planSync(set, emptyWorld, ctx(game.store.get(SYNC_RETIRED_SETTING)));
  assert.equal(before.counts.refused, 2);
  await allowRetiredIds(game, MODULE_ID, ['REC-TEST-A', 'REC-TEST-B'], {set});
  const after = planSync(set, emptyWorld, ctx(game.store.get(SYNC_RETIRED_SETTING)));
  assert.equal(after.counts.refused, 0);
  assert.equal(after.counts.create, 3);
});

test('the wiring: GM check, preview re-run (scroll pane and Refused fold kept), focus, API, setting, hooks', () => {
  const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  assert.match(main, /async #syncAllow\(which\) \{[\s\S]*?game\.user\?\.isGM[\s\S]*?await this\.#syncPreview\(\)/);
  assert.match(main, /this\.focusAfterRender='\[data-ag-sync-allow\], \[data-ag-sync-run\]'/);
  assert.match(main, /scrollable: \[".agm-pane"/);
  assert.match(main, /sync:\{allowRetiredIds:ids=>allowRetiredIds\(game,MODULE_ID,ids,\{set:activeApp\?\.sync\?\.set\?\?null\}\)\}/);
  assert.match(main, /register\(MODULE_ID,SYNC_SUPERSEDED_SETTING,\{[^}]*type:Array,default:\[\]\}/);
  assert.equal((main.match(/await noteSupersededIds\(game,MODULE_ID,Object\.keys\(map\)\)/g) ?? []).length, 2, 'both supersedes rebind sites record the old ids');
  assert.match(main, /<strong>Allow ids again<\/strong>/);
  const view = fs.readFileSync(new URL('../scripts/sync-view.js', import.meta.url), 'utf8');
  assert.doesNotMatch(view, /\b(Alpha|Beta)\b/);
});

test('0.101.0 version', () => {
  const m = JSON.parse(fs.readFileSync(new URL('../module.json', import.meta.url), 'utf8'));
  assert.equal(m.version, '0.101.0'); assert.ok(m.download.endsWith('/ashen-gate-manager-v0.101.0/ashen-gate-manager.zip')); assert.match(m.version, /^0\./);
  assert.match(fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'), /^## 0\.101\.0 /);
});
