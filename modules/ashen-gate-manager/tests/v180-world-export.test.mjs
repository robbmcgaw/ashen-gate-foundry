/** World export logic (0.18.0). Proves logic with mocked Foundry globals, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWorldExport, saveWorldExport, diffRecords, contentHash, sortKeys, stripPlayState, isTagged, EXPORT_SCHEMA, SNAPSHOT_SETTING} from '../scripts/world-export.js';

const M = 'ashen-gate-manager';
const mkDoc = (documentName, sourceId, name, extra = {}) => ({documentName, type: extra.type ?? 'loot', name, uuid: `${documentName}.x${sourceId}`,
  folder: extra.folder ?? null, ownership: {default: extra.access ?? 0}, system: extra.system ?? {price: 1},
  flags: {[M]: {source: {sourceId, visibility: 'gm'}}, 'ashen-gate-profession-ledger': {progress: 'SECRET-PLAY'}}, ...(extra.raw ?? {}),
  toObject() { return {system: this.system, flags: this.flags}; }});
const coll = list => ({contents: list});
function world({gm = true, items = [], modules = {}, snapshot = null} = {}) {
  const store = new Map(snapshot ? [[`${M}.${SNAPSHOT_SETTING}`, snapshot]] : []);
  return {user: {isGM: gm}, world: {id: 'w1', title: '[TEST] World'}, version: '14.367', system: {version: '6.0.6'},
    items: coll(items), journal: coll([]), actors: coll([]), tables: coll([]), macros: coll([]), folders: coll([]),
    modules: new Map(Object.entries(modules)),
    settings: {get: (m, k) => store.get(`${m}.${k}`), set: async (m, k, v) => { store.set(`${m}.${k}`, v); }, _store: store}};
}
const fixedNow = new Date('2026-10-19T12:00:00Z');

test('tagging: only docs with a Manager sourceId are exported, with permanent id and uuid as hint only', () => {
  const g = world({items: [mkDoc('Item', 'MAT-TEST-1', '[TEST] Ore'), {...mkDoc('Item', 'X', 'Untagged'), flags: {}}]});
  assert.equal(isTagged(g.items.contents[1]), false);
  const {file} = buildWorldExport(g, {now: fixedNow});
  assert.equal(file.world.length, 1);
  assert.equal(file.world[0].id, 'MAT-TEST-1');
  assert.match(file.world[0].uuid, /^Item\./);
  assert.equal(file.world[0].access, 'gm');
  assert.equal(file.header.schema, EXPORT_SCHEMA);
  assert.equal(file.header.versions.dnd5e, '6.0.6');
});

test('modules: missing, inactive and old modules are listed as not available; present ones export definitions', () => {
  const loc = {id: 'LOC-TEST-1', name: '[TEST] Hill', resources: [{key: 'a', exhausted: true, available: false, label: 'Ore'}], sceneUuids: ['Scene.z']};
  const g = world({modules: {
    'ashen-gate-locations': {active: true, version: '1.6.0', api: {listLocations: () => [loc]}},
    'ashen-gate-quest-manager': {active: true, version: '0.6.0', api: {}},
    'ashen-gate-factions': {active: false, version: '0.7.2', api: {getFactions: () => []}},
    'ashen-gate-headquarters': {active: true, version: '0.7.1', api: {exportState: () => ({catalog: [{id: 'FAC-1', name: '[TEST] Forge'}], inventory: [{key: 'owned'}]})}}}});
  const {file} = buildWorldExport(g, {now: fixedNow});
  assert.equal(file.modules.locations.status, 'ok');
  assert.equal(file.modules.quests.status, 'not available');
  assert.equal(file.modules.factions.reason, 'module is not active');
  assert.equal(file.modules.skill_trees.reason, 'module is not installed');
  assert.deepEqual(file.modules.headquarters.records.map(r => r.id), ['FAC-1']);
  assert.equal(file.modules.profession_ledger.records.length, 0);
});

test('no play state leaks: ledger flags, exhausted/available, scene bindings, inventory, actor sheets', () => {
  const pc = mkDoc('Actor', 'ACT-PC', '[TEST] PC', {type: 'character', system: {attributes: {hp: 99}}});
  const g = world({items: [mkDoc('Item', 'MAT-1', '[TEST] Ore')], modules: {
    'ashen-gate-locations': {active: true, api: {listLocations: () => [{id: 'LOC-1', name: 'x', resources: [{key: 'a', exhausted: true, available: false, label: 'Ore'}], loot: [{status: 'taken', label: 'Gem'}], sceneUuids: ['Scene.z']}]}},
    'ashen-gate-headquarters': {active: true, api: {exportState: () => ({catalog: [{id: 'F', name: 'F'}], inventory: [{key: 'PLAYSTATE'}], personnel: 'PLAYSTATE'})}}}});
  g.actors = coll([pc]);
  const text = JSON.stringify(buildWorldExport(g, {now: fixedNow}).file);
  for (const leak of ['SECRET-PLAY', 'PLAYSTATE', 'exhausted', 'Scene.z', '"hp"', '"taken"']) assert.equal(text.includes(leak), false, leak);
  assert.ok(text.includes('actor play state'));
  assert.deepEqual(stripPlayState({a: {lock: 1, keep: 2}}), {a: {keep: 2}});
});

test('hash and diff: new, changed, removed; first run is all new; unchanged is quiet', () => {
  const a = {key: 'world/Item/A', hash: contentHash({n: 1}), name: 'A', section: 'world'};
  const b = {key: 'world/Item/B', hash: contentHash({n: 2}), name: 'B', section: 'world'};
  assert.equal(contentHash({x: 1, y: 2}), contentHash({y: 2, x: 1}));
  assert.notEqual(contentHash({n: 1}), contentHash({n: 2}));
  const first = diffRecords([a, b], null);
  assert.equal(first.firstRun, true);
  assert.deepEqual(first.new, ['world/Item/A', 'world/Item/B']);
  const snap = {records: {'world/Item/A': {hash: a.hash, name: 'A', section: 'world'}, 'world/Item/B': {hash: 'old', name: 'B', section: 'world'}, 'world/Item/C': {hash: 'c', name: 'C', section: 'world'}}};
  const d = diffRecords([a, b], snap);
  assert.deepEqual([d.new, d.changed, d.removed], [[], ['world/Item/B'], ['world/Item/C']]);
  assert.equal(d.removedInfo[0].name, 'C');
});

test('changed mode: first run exports everything; later only changes plus removed list; snapshot saved after the file', async () => {
  const items = [mkDoc('Item', 'MAT-1', '[TEST] Ore'), mkDoc('Item', 'MAT-2', '[TEST] Iron')];
  const g = world({items});
  const saved = [];
  const first = await saveWorldExport(g, {mode: 'changed', save: (n, f) => saved.push([n, f]), now: fixedNow});
  assert.equal(first.file.world.length, 2);
  assert.equal(first.file.header.note.startsWith('First export'), true);
  assert.equal(saved[0][0], 'AG_World_Export_2026-10-19.json');
  items[0].name = '[TEST] Ore II'; items.splice(1, 1);
  const second = await saveWorldExport(g, {mode: 'changed', save: (n, f) => saved.push([n, f]), now: fixedNow});
  assert.deepEqual(second.file.world.map(r => r.id), ['MAT-1']);
  assert.deepEqual(second.file.removed.map(r => r.id), ['MAT-2']);
  assert.equal(second.filename, 'AG_World_Export_2026-10-19_changed.json');
  assert.match(second.summary, /1 changed, 1 removed|0 new, 1 changed, 1 removed/);
  // A failed save must not advance the snapshot.
  const before = g.settings.get(M, SNAPSHOT_SETTING);
  items.push(mkDoc('Item', 'MAT-9', 'New'));
  await assert.rejects(saveWorldExport(g, {mode: 'everything', save: () => { throw new Error('disk'); }, now: fixedNow}), /disk/);
  assert.equal(g.settings.get(M, SNAPSHOT_SETTING), before);
});

test('GM-only is enforced in the handler, not just hidden', async () => {
  const g = world({gm: false, items: [mkDoc('Item', 'MAT-1', 'x')]});
  assert.throws(() => buildWorldExport(g), /Only the GM/);
  let saved = false;
  await assert.rejects(saveWorldExport(g, {mode: 'everything', save: () => { saved = true; }}), /Only the GM/);
  assert.equal(saved, false);
  assert.equal(g.settings.get(M, SNAPSHOT_SETTING), undefined);
});

test('stable ordering: input order and key order do not change the file', () => {
  const docs = [mkDoc('Item', 'MAT-B', 'B'), mkDoc('Item', 'MAT-A', 'A')];
  const one = JSON.stringify(buildWorldExport(world({items: docs}), {now: fixedNow}).file);
  const two = JSON.stringify(buildWorldExport(world({items: [...docs].reverse()}), {now: fixedNow}).file);
  assert.equal(one, two);
  assert.deepEqual(buildWorldExport(world({items: docs}), {now: fixedNow}).file.world.map(r => r.id), ['MAT-A', 'MAT-B']);
  assert.equal(JSON.stringify(sortKeys({b: 1, a: {d: 1, c: 2}})), '{"a":{"c":2,"d":1},"b":1}');
});
