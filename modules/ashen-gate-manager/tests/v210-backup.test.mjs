/** Back up before play (0.21.0). Proves logic with mocked Foundry globals, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBackup, saveBackup, buildWorldExport, SNAPSHOT_SETTING} from '../scripts/world-export.js';

const M = 'ashen-gate-manager';
const writes = [];
const trap = name => async () => { writes.push(name); };
const mkDoc = (sourceId, name) => ({documentName: 'Item', type: 'loot', name, uuid: `Item.${sourceId}`, folder: null, ownership: {default: 0},
  system: {price: 1}, flags: {[M]: {source: {sourceId, visibility: 'gm'}}}, update: trap('update'), delete: trap('delete'), setFlag: trap('setFlag'),
  toObject() { return {system: this.system, flags: this.flags}; }});
const coll = list => ({contents: list});
function world({gm = true, snapshot} = {}) {
  const store = new Map([[`${M}.${SNAPSHOT_SETTING}`, snapshot]]);
  let snapshotReads = 0;
  return {user: {isGM: gm}, world: {id: 'w1', title: '[TEST] World'}, version: '14.367', system: {version: '6.0.6'},
    items: coll([mkDoc('MAT-TEST-1', '[TEST] Ore'), mkDoc('MAT-TEST-2', '[TEST] Iron')]), journal: coll([]), actors: coll([]), tables: coll([]), macros: coll([]), folders: coll([]),
    modules: new Map([['ashen-gate-locations', {active: true, version: '1.8.1', api: {listLocations: () => [{id: 'LOC-TEST-1', name: '[TEST] Hill'}], saveLocation: trap('saveLocation')}}]]),
    settings: {get: (m, k) => { snapshotReads++; return store.get(`${m}.${k}`); }, set: async (m, k, v) => { writes.push(`settings.set ${k}`); store.set(`${m}.${k}`, v); }},
    get snapshotReads() { return snapshotReads; }, store};
}
const now = new Date('2026-10-19T18:00:00Z');

test('backup holds everything (same records as an everything export), dated filename, backup purpose', () => {
  const old = {records: {'world/Item/MAT-TEST-1': {hash: 'x', section: 'world'}}};
  const g = world({snapshot: old});
  const out = buildBackup(g, {now});
  assert.equal(out.filename, 'AG_Backup_2026-10-19.json');
  assert.equal(out.file.header.purpose, 'backup');
  assert.equal(out.file.header.mode, 'everything');
  const full = buildWorldExport(g, {mode: 'everything', now}).file;
  assert.deepEqual(out.file.world, full.world);
  assert.deepEqual(out.file.modules, full.modules);
  assert.deepEqual(out.file.world.map(r => r.id), ['MAT-TEST-1', 'MAT-TEST-2']);
  assert.match(out.summary, /^Ashen Gate backup — \[TEST\] World, 2026-10-19\n/);
  assert.match(out.summary, /\nlocations: 1 records\n/);
  assert.match(out.summary, /\nworld: 2 records/);
  assert.match(out.summary, /\nfactions: not available/);
});

test('backup never touches the "changed since last export" snapshot and writes nothing', () => {
  writes.length = 0;
  const old = {records: {'world/Item/MAT-TEST-1': {hash: 'x', section: 'world'}}};
  const g = world({snapshot: old});
  const saved = [];
  saveBackup(g, {save: (name, file) => saved.push([name, file]), now});
  assert.equal(saved.length, 1);
  assert.equal(saved[0][0], 'AG_Backup_2026-10-19.json');
  assert.equal(g.store.get(`${M}.${SNAPSHOT_SETTING}`), old);
  assert.equal(g.snapshotReads, 0);
  assert.deepEqual(writes, []);
});

test('GM gate is enforced in the function: a player gets an error and nothing is saved', () => {
  const g = world({gm: false});
  let saved = false;
  assert.throws(() => saveBackup(g, {save: () => { saved = true; }, now}), /Only the GM/);
  assert.throws(() => buildBackup(g, {now}), /Only the GM/);
  assert.equal(saved, false);
});
