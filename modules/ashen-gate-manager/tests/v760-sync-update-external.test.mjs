/** 0.76.0: Sync's "Also update existing locations, routes and shops" switch (Advanced, off by default).
 *  Off: Locations, Routes and Shops (Services, Merchant Lists) that Locations or Utilities already holds are never handed on again, whatever the
 *  hand-off ledger says; new ones are still created. On: today's behaviour. The executor enforces it from the plan, not from the UI. Mocked: proves the
 *  planner/executor logic, not the live Manager window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildSyncSet, planSync, nameIndex, SYNC_PHRASE} from '../scripts/sync.js';
import {executeSync, buildSyncBackup} from '../scripts/sync-apply.js';
import {syncView} from '../scripts/sync-view.js';

const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const base = {status: 'approved', version: '1.0.0', provenance: {sources: ['synthetic test data']}};
const loc = (id, name = `[TEST] ${id}`) => ({id, entity_type: 'Location', ...base, visibility: 'player', refs: [], name, location: {name}});
const route = (id, from, to) => ({id, entity_type: 'Route', ...base, visibility: 'gm', name: `[TEST] ${id}`,
  refs: [{relation: 'route_from', target_id: from, mode: 'required'}, {relation: 'route_to', target_id: to, mode: 'required'}],
  route: {from_location_id: from, to_location_id: to, distance_km: 30, leg_km: 10}});
const shops = JSON.parse(fs.readFileSync(new URL('../../../test-fixtures/shops/AG_Test_Shops.json', import.meta.url), 'utf8'));
const shopRec = id => shops.records.find(r => r.id === id);
const GM = {isGM: true};

const pack = {manifest: {schema_version: 'ag-foundry-import/0.2', package_id: 'AG-TEST-EXT', version: '1.0.0'}, records: [
  loc('LOC-OLD'), loc('LOC-NEW'), loc('LOC-OLD-B'), route('RTE-OLD', 'LOC-OLD', 'LOC-OLD-B'), route('RTE-NEW', 'LOC-OLD', 'LOC-NEW'),
  ...['ITEM-TEST-LEATHER-ARMOR', 'ITEM-TEST-WATERSKIN', 'ITEM-TEST-HIDE-BUNDLE'].map(shopRec),
  shopRec('SHOP-TEST-TANNER'), shopRec('SVC-TEST-COUNTING-HOUSE')]};

/** Mocked Locations / Utilities: they hold some ids already and record the mode each call used. */
function mocks() {
  const calls = [];
  const held = {loc: new Set(['LOC-OLD', 'LOC-OLD-B']), route: new Set(['RTE-OLD']), shop: new Set(['SHOP-TEST-TANNER'])};
  const importer = (kind, set) => async (records, {mode}) => {
    calls.push({kind, mode, ids: records.map(r => r.id)});
    const report = {created: [], updated: [], skipped: []};
    for (const r of records) {
      if (!set.has(r.id)) { set.add(r.id); report.created.push(r.id); }
      else if (mode === 'update') report.updated.push(r.id);
      else report.skipped.push({id: r.id, reason: 'already exists'});
    }
    return kind === 'shop' ? [...report.created.map(id => ({id, type: 'Shop', result: 'created'})), ...report.updated.map(id => ({id, type: 'Shop', result: 'updated'})), ...report.skipped.map(x => ({id: x.id, type: 'Shop', result: 'kept', reason: x.reason}))] : report;
  };
  return {calls, held, apis: {locations: {importLocations: importer('loc', held.loc)}, routes: {importRoutes: importer('route', held.route)}, shops: {importShops: importer('shop', held.shop)}}};
}
const plan = (m, {updateExternal, ledger = {}, overwriteEdited = false, payload = pack} = {}) => planSync(buildSyncSet([{filename: 'ext.json', kind: 'manager', payload}]),
  {docs: [], characterCount: 0, unflaggedNames: nameIndex([])},
  {includeDrafts: true, deleteUnscoped: false, overwriteEdited, retiredIds: new Set(), ledger, buildFlag: () => ({}), externalIds: new Set(), ...(updateExternal === undefined ? {} : {updateExternal}),
    sceneActorIds: new Set(), hotbarMacroIds: new Set(), isProtectedFolder: () => false, locationIds: new Set(m.held.loc), routeIds: new Set(m.held.route), shopIds: new Set(m.held.shop), heldFingerprint: () => null});
const adapterFor = (m, p, over = {}) => ({async backup(plan) { buildSyncBackup(plan); }, async replan() { return p; }, async create(row) { return {id: row.id, documentName: 'Item', update: async () => {}, getFlag: () => null, toObject: () => ({})}; },
  docFor: () => null, buildFlag: () => ({}), async bindLinks() {}, apis: m.apis, async retire() {}, async saveLedger(e) { m.saved = e; }, ...over});
const ext = (p, kind) => p.rows.filter(r => r.external && r.kind === kind);

test('switch off (the default): existing locations, routes and shops are kept; new ones are still created', () => {
  const m = mocks();
  for (const p of [plan(m), plan(m, {updateExternal: false})]) {
    assert.equal(p.ok, true, p.errors.join('; '));
    assert.equal(p.updateExternal, false);
    for (const [kind, old, fresh] of [['Location', 'LOC-OLD', 'LOC-NEW'], ['Route', 'RTE-OLD', 'RTE-NEW'], ['Shop', 'SHOP-TEST-TANNER', null], ['Service', null, 'SVC-TEST-COUNTING-HOUSE']]) {
      if (old) { const r = ext(p, kind).find(x => x.id === old); assert.equal(r.group, 'untouched', `${old} kept`); assert.equal(r.keptSwitchOff, true); assert.match(r.reason, /Kept: update switch off/); }
      if (fresh) assert.equal(ext(p, kind).find(x => x.id === fresh).group, 'create', `${fresh} created`);
    }
    assert.equal(p.counts.keptSwitch, 4); // LOC-OLD, LOC-OLD-B, RTE-OLD, SHOP-TEST-TANNER
    assert.ok(!p.rows.some(r => r.external && r.group === 'overwrite'));
  }
});

test('switch off: a run creates the new ones, calls Locations and Utilities without update mode and never touches the existing', async () => {
  const m = mocks();
  const p = plan(m, {updateExternal: false});
  const out = await executeSync(p, adapterFor(m, p), {user: GM, confirmation: SYNC_PHRASE});
  assert.ok(m.calls.length > 0);
  assert.ok(m.calls.every(c => c.mode !== 'update'), JSON.stringify(m.calls));
  const existing = ['LOC-OLD', 'LOC-OLD-B', 'RTE-OLD', 'SHOP-TEST-TANNER'];
  assert.ok(m.calls.every(c => !c.ids.some(id => existing.includes(id))), 'existing ids are not even sent');
  assert.ok(m.held.loc.has('LOC-NEW') && m.held.route.has('RTE-NEW') && m.held.shop.has('SVC-TEST-COUNTING-HOUSE'), 'new ones created');
  assert.equal(out.counts.failed, 0, JSON.stringify(out.log.filter(l => l.status === 'error')));
  assert.ok(!out.log.some(l => l.action === 'update' && ['LOC-OLD', 'RTE-OLD', 'SHOP-TEST-TANNER'].includes(l.id)));
});

test('switch on: today\'s behaviour (existing records are handed on in update mode, the first time included)', async () => {
  const m = mocks();
  const p = plan(m, {updateExternal: true});
  assert.equal(p.updateExternal, true);
  for (const id of ['LOC-OLD', 'LOC-OLD-B']) { const r = ext(p, 'Location').find(x => x.id === id); assert.equal(r.group, 'overwrite'); assert.equal(r.first, undefined); assert.match(r.reason, /No earlier import is recorded/); }
  assert.equal(ext(p, 'Route').find(x => x.id === 'RTE-OLD').group, 'overwrite');
  assert.equal(ext(p, 'Shop').find(x => x.id === 'SHOP-TEST-TANNER').group, 'overwrite');
  assert.equal(p.counts.keptSwitch ?? 0, 0);
  await executeSync(p, adapterFor(m, p), {user: GM, confirmation: SYNC_PHRASE});
  assert.ok(m.calls.every(c => c.mode === 'update'), JSON.stringify(m.calls));
  assert.ok(m.calls.find(c => c.kind === 'loc').ids.includes('LOC-OLD'));
});

test('switch on keeps the ledger rules: Unchanged stays unchanged, an edit in the module is kept unless overwriteEdited', () => {
  const m = mocks();
  const first = plan(m, {updateExternal: true});
  const row = ext(first, 'Location').find(x => x.id === 'LOC-OLD');
  const ledger = {'AG-TEST-EXT': {'LOC-OLD': {kind: 'Location', module: 'Locations', name: row.name, fp: row.fp, held: 'h1'}}};
  assert.equal(ext(plan(m, {updateExternal: true, ledger}), 'Location').find(x => x.id === 'LOC-OLD').unchanged, true);
});

test('ledger "first" case with the switch off: no earlier hand-off recorded, still not overwritten', async () => {
  const m = mocks();
  const p = plan(m, {updateExternal: false, ledger: {}});
  const r = ext(p, 'Location').find(x => x.id === 'LOC-OLD');
  assert.equal(r.group, 'untouched'); assert.equal(r.keptSwitchOff, true); assert.equal(r.first, undefined);
  await executeSync(p, adapterFor(m, p), {user: GM, confirmation: SYNC_PHRASE});
  assert.ok(!m.saved?.some(e => e.id === 'LOC-OLD'), 'nothing is remembered as handed over for a kept record');
  // overwriteEdited does not turn the switch on either
  assert.equal(ext(plan(m, {updateExternal: false, overwriteEdited: true}), 'Location').find(x => x.id === 'LOC-OLD').group, 'untouched');
});

test('the executor refuses a forged update row when the switch is off (plan flag off, or live setting off)', async () => {
  for (const mode of ['plan', 'live', 'planAbsent']) {
    const m = mocks();
    const p = plan(m, {updateExternal: true}); // honest plan with update rows...
    if (mode === 'plan') p.updateExternal = false;
    if (mode === 'planAbsent') delete p.updateExternal;
    const out = await executeSync(p, adapterFor(m, p, mode === 'live' ? {updateExternal: false} : {}), {user: GM, confirmation: SYNC_PHRASE});
    assert.ok(m.calls.every(c => c.mode !== 'update'), `${mode}: ${JSON.stringify(m.calls)}`);
    for (const id of ['LOC-OLD', 'LOC-OLD-B', 'RTE-OLD', 'SHOP-TEST-TANNER']) {
      assert.ok(out.log.some(l => l.id === id && l.status === 'skipped' && /update switch off/.test(l.message)), `${mode}: ${id} refused`);
      assert.ok(!m.calls.some(c => c.ids.includes(id)), `${mode}: ${id} not sent`);
    }
    assert.ok(m.held.loc.has('LOC-NEW'), `${mode}: new ones still created`);
  }
});

test('specialist hand-offs (their own update mode) are not changed by the switch', async () => {
  const calls = [];
  const trees = {schema: 'ag-skill-trees/1', trees: [{id: 'TREE-TEST-A', name: '[TEST] Tree A', nodes: []}]};
  const api = {previewTreeImport: () => ({rows: [{id: 'TREE-TEST-A', name: 'A', action: 'update', reason: 'Replaces the layout.'}]}), importTrees: async (p, o) => { calls.push(o); return {}; }};
  const m = mocks();
  const set = buildSyncSet([{filename: 'ext.json', kind: 'manager', payload: pack}, {filename: 'trees.json', kind: 'skill-trees', payload: trees}]);
  const p = planSync(set, {docs: [], characterCount: 0, unflaggedNames: nameIndex([])}, {includeDrafts: true, deleteUnscoped: false, overwriteEdited: false, retiredIds: new Set(), ledger: {}, buildFlag: () => ({}), externalIds: new Set(), updateExternal: false,
    sceneActorIds: new Set(), hotbarMacroIds: new Set(), isProtectedFolder: () => false, locationIds: new Set(m.held.loc), routeIds: new Set(m.held.route), shopIds: new Set(m.held.shop), specialistApi: k => k === 'skill-trees' ? api : null, heldFingerprint: () => null});
  const tree = p.rows.find(r => r.id === 'TREE-TEST-A');
  assert.equal(tree.group, 'overwrite', 'the specialist file still updates');
  assert.ok(!tree.keptSwitchOff);
});

test('archive and rename keep working with the switch off (Manager 0.74/0.75)', () => {
  const m = mocks();
  const ledger = {'AG-TEST-EXT': {'LOC-GONE': {kind: 'Location', module: 'Locations', name: 'Gone', fp: 'x'}}};
  m.held.loc.add('LOC-GONE');
  const p = planSync(buildSyncSet([{filename: 'ext.json', kind: 'manager', payload: pack}]), {docs: [], characterCount: 0, unflaggedNames: nameIndex([])},
    {includeDrafts: true, deleteUnscoped: false, overwriteEdited: false, archiveMissing: true, partnerArchive: () => true, retiredIds: new Set(), ledger, buildFlag: () => ({}), externalIds: new Set(), updateExternal: false,
      sceneActorIds: new Set(), hotbarMacroIds: new Set(), isProtectedFolder: () => false, locationIds: new Set(m.held.loc), routeIds: new Set(m.held.route), shopIds: new Set(m.held.shop), moduleHas: () => true, heldFingerprint: () => null});
  assert.equal(p.ok, true, p.errors.join('; '));
  assert.equal(p.rows.find(r => r.id === 'LOC-GONE')?.group, 'archive', 'archive of a record the package dropped is unaffected');
  assert.equal(ext(p, 'Location').find(r => r.id === 'LOC-OLD').keptSwitchOff, true);
  assert.equal(ext(p, 'Location').find(r => r.id === 'LOC-NEW').group, 'create');
});

test('preview wording: one-line mode note, the Kept group with count and explanation, and the Advanced switch', () => {
  const m = mocks();
  const state = (u, extra = {}) => ({on: true, inputs: [{}], files: [], skipped: [], updateExternal: u, isGM: true, plan: plan(m, {updateExternal: u}), phrase: '', fileButton: '', ...extra});
  let html;
  try { html = syncView(state(false)); } catch (e) { assert.fail(`renderSync: ${e.message}`); }
  assert.match(html, /data-ag-sync-update-external/);
  assert.doesNotMatch(html, /data-ag-sync-update-external checked/);
  assert.match(html, /Also update existing locations, routes and shops/);
  assert.match(html, /Locations and Utilities:<\/strong> Also update existing locations, routes and shops is off, so existing ones are kept and only new ones are created/);
  assert.match(html, /Kept: update switch off/);
  assert.match(html, /Turn on Also update existing locations, routes and shops to replace their definitions; reveal and play state is always kept/);
  assert.match(html, /4<\/strong> kept: update switch off/);
  const on = syncView(state(true));
  assert.match(on, /data-ag-sync-update-external checked/);
  assert.match(on, /is on, so existing ones are replaced/);
  assert.doesNotMatch(on, /<summary[^>]*>[^<]*Kept: update switch off/);
});

test('wiring, Help, README, CHANGELOG, version', () => {
  const main = read('../scripts/main.js'), apply = read('../scripts/sync-apply.js');
  assert.match(main, /updateActors:false, archiveMissing:false, updateExternal:false, phrase:''/);
  assert.match(main, /this\.sync\.updateExternal=Boolean\(event\.target\.checked\)&&Boolean\(game\.user\?\.isGM\)/);
  assert.match(main, /updateExternal:Boolean\(this\.sync\.updateExternal&&game\.user\?\.isGM\)/);
  assert.match(apply, /updateExisting: updateExternal/);
  assert.doesNotMatch(apply, /apply(Locations|Routes|Shops)\([^\n]*updateExisting: true/);
  assert.match(main, /Where the update switches live/);
  assert.match(main, /Quest Log and Renown/);
  const m = JSON.parse(read('../module.json'));
  assert.equal(m.version, '0.100.0'); assert.ok(m.download.endsWith('/ashen-gate-manager-v0.100.0/ashen-gate-manager.zip'));
  assert.match(read('../CHANGELOG.md'), /^## 0\.76\.0 /m);
  assert.match(read('../README.md'), /Also update existing locations, routes and shops/);
});
