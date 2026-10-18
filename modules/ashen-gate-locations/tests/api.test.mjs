import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createApi} from '../scripts/api.mjs';
import {parseImport, playerView} from '../scripts/model.mjs';

const sample = parseImport(JSON.parse(fs.readFileSync(new URL('../examples/test-locations.json', import.meta.url))), []).created;
sample[0].quests = [{key: 'q', questId: 'QUEST-TEST-ONE', visible: true}];
sample[0].sections.quests = true;
sample[0].resources[0].materialId = 'MAT-TEST-REED';
sample[1].quests = [{key: 'q', questId: 'QUEST-TEST-ONE', visible: true}];   // quests section hidden here

function setup({gm = false, access = true} = {}) {
  const state = {gm, access, stored: structuredClone(sample), opened: []};
  const api = createApi({
    version: '1.0.0', isGM: () => state.gm, playerAccessEnabled: () => state.access,
    setPlayerAccess: async v => { state.access = v; },
    readAll: () => { if (!state.gm) throw new Error('Only the GM can do that.'); return structuredClone(state.stored); },
    writeAll: async list => { state.stored = list; },
    readViews: () => state.stored.map(l => playerView(l, state.stored)).filter(Boolean),
    placeNote: async (loc, opts) => ({loc, opts}),
    open: () => state.opened.push('main'), openLocation: id => state.opened.push(id)
  });
  return {api, state};
}

test('players with access see only revealed, sanitized locations', () => {
  const {api} = setup();
  assert.deepEqual(api.listLocations().map(l => l.name), ['[TEST] Millbrook', '[TEST] Old Quarry']);
  assert.deepEqual(api.listLocations({revealedOnly: false}).length, 2, 'players cannot ask for unrevealed');
  assert.equal(api.getLocation('LOC-TEST-HIDDEN-CAVE'), null);
  const mill = api.getLocation('LOC-TEST-MILLBROOK');
  assert.equal(mill.revealed, undefined);
  assert.doesNotMatch(JSON.stringify(api.listLocations()), /GM secret|GM-only Herb|smuggler/);
  assert.deepEqual(api.resourcesAt('LOC-TEST-MILLBROOK').map(r => r.label), ['[TEST] Reed Bundle', '[TEST] River Clay']);
  assert.deepEqual(api.resourcesAt('LOC-TEST-ASH-WASTES'), []);
});

test('players without Player Access are refused by the API itself', () => {
  const {api, state} = setup({access: false});
  for (const call of [() => api.listLocations(), () => api.getLocation('LOC-TEST-MILLBROOK'), () => api.resourcesAt('LOC-TEST-MILLBROOK'),
    () => api.locationsWithMaterial('MAT-TEST-REED'), () => api.open(), () => api.openLocation('LOC-TEST-MILLBROOK')])
    assert.throws(call, /hidden from players/);
  assert.deepEqual(api.locationsForQuest('QUEST-TEST-ONE'), []);
  assert.deepEqual(state.opened, []);
});

test('players cannot write, import, export or place notes', async () => {
  const {api, state} = setup();
  const before = structuredClone(state.stored);
  await assert.rejects(() => api.createLocation('X'), /Only the GM/);
  await assert.rejects(() => api.saveLocation({id: 'LOC-TEST-MILLBROOK', name: 'Hacked'}), /Only the GM/);
  await assert.rejects(() => api.deleteLocation('LOC-TEST-MILLBROOK'), /Only the GM/);
  await assert.rejects(() => api.importPackage({}), /Only the GM/);
  await assert.rejects(() => api.playerAccess.setEnabled(false), /Only the GM/);
  assert.throws(() => api.exportPackage(), /Only the GM/);
  assert.throws(() => api.placeOnScene('LOC-TEST-MILLBROOK', {}), /Only the GM/);
  assert.deepEqual(state.stored, before);
});

test('GM sees everything; Player Access does not limit the GM', () => {
  const {api} = setup({gm: true, access: false});
  assert.equal(api.listLocations().length, 4);
  assert.equal(api.listLocations({revealedOnly: true}).length, 2);
  assert.equal(api.getLocation('LOC-TEST-HIDDEN-CAVE').description, 'Players must not see this until revealed.');
  assert.equal(api.resourcesAt('LOC-TEST-MILLBROOK').length, 3);
});

test('GM create generates the ID from the name; save keeps it on rename', async () => {
  const {api, state} = setup({gm: true});
  const made = await api.createLocation('[TEST] Old Quarry');
  assert.equal(made.id, 'LOC-TEST-OLD-QUARRY-2');
  const fresh = await api.saveLocation({name: 'Brand New', id: ''});
  assert.equal(fresh.id, 'LOC-BRAND-NEW');
  await api.saveLocation({...fresh, name: 'Renamed'});
  assert.equal(state.stored.find(l => l.id === 'LOC-BRAND-NEW').name, 'Renamed');
  await api.deleteLocation('LOC-BRAND-NEW');
  assert.equal(state.stored.some(l => l.id === 'LOC-BRAND-NEW'), false);
});

test('import adds new locations and keeps existing ones', async () => {
  const {api, state} = setup({gm: true});
  state.stored[0].name = 'GM edited';
  const r = await api.importPackage(JSON.parse(fs.readFileSync(new URL('../examples/test-locations.json', import.meta.url))));
  assert.deepEqual(r.created, []);
  assert.equal(r.skipped.length, 4);
  assert.equal(state.stored[0].name, 'GM edited');
});

test('Ledger and Quest helpers respect visibility', () => {
  assert.deepEqual(setup().api.locationsWithMaterial('MAT-TEST-REED'), [{id: 'LOC-TEST-MILLBROOK', name: '[TEST] Millbrook', available: true}]);
  assert.deepEqual(setup().api.locationsForQuest('QUEST-TEST-ONE'), [{id: 'LOC-TEST-MILLBROOK', name: '[TEST] Millbrook'}]);
  assert.deepEqual(setup({gm: true}).api.locationsForQuest('QUEST-TEST-ONE').map(l => l.id), ['LOC-TEST-MILLBROOK', 'LOC-TEST-OLD-QUARRY']);
});

test('ag-player-access/1 capability', async () => {
  const {api, state} = setup({gm: true});
  assert.deepEqual(api.playerAccess.getState(), {contract: 'ag-player-access/1', moduleId: 'ashen-gate-locations', audience: 'player', playerAccessEnabled: true, configurable: true});
  await api.playerAccess.setEnabled(false);
  assert.equal(state.access, false);
  await assert.rejects(() => api.playerAccess.setEnabled('no'), /Boolean/);
});

test('nodesForMaterial and resourcesAt carry node fields with player sanitizing', async () => {
  const {api, state} = setup({gm: true});
  const mill = state.stored.find(l => l.id === 'LOC-TEST-MILLBROOK');
  Object.assign(mill.resources[0], {skill: 'Herbalism', tier: 2, dc: 12, rareMaterialId: 'MAT-TEST-RARE-REED'});
  const gmNodes = api.nodesForMaterial('MAT-TEST-REED');
  assert.deepEqual(gmNodes.map(n => [n.locationId, n.matches, n.dc, n.visible]), [['LOC-TEST-MILLBROOK', 'common', 12, true]]);
  assert.equal(api.nodesForMaterial('MAT-TEST-RARE-REED')[0].matches, 'rare');
  state.gm = false;
  const [node] = api.nodesForMaterial('MAT-TEST-REED');
  assert.deepEqual([node.skill, node.tier, 'dc' in node, 'visible' in node], ['Herbalism', 2, false, false]);
  assert.equal(api.resourcesAt('LOC-TEST-MILLBROOK').some(n => 'dc' in n), false);
  assert.deepEqual(api.nodesForMaterial('MAT-NOPE'), []);
  state.access = false;
  assert.throws(() => api.nodesForMaterial('MAT-TEST-REED'), /hidden from players/);
});

test('markNodeExhausted is GM-only, validates, and restores', async () => {
  const {api, state} = setup({gm: true});
  const nodeId = api.resourcesAt('LOC-TEST-MILLBROOK')[0].id;
  const used = await api.markNodeExhausted('LOC-TEST-MILLBROOK', nodeId);
  assert.equal(used.exhausted, true);
  assert.equal(state.stored.find(l => l.id === 'LOC-TEST-MILLBROOK').resources[0].exhausted, true);
  assert.equal((await api.markNodeExhausted('LOC-TEST-MILLBROOK', nodeId, false)).exhausted, false);
  await assert.rejects(() => api.markNodeExhausted('LOC-NOPE', nodeId), /No location/);
  await assert.rejects(() => api.markNodeExhausted('LOC-TEST-MILLBROOK', 'nope'), /No gathering node/);
  await assert.rejects(() => api.markNodeExhausted('LOC-TEST-MILLBROOK', nodeId, 'yes'), /true or false/);
  state.stored.find(l => l.id === 'LOC-TEST-MILLBROOK').resources[0].finite = false;
  await assert.rejects(() => api.markNodeExhausted('LOC-TEST-MILLBROOK', nodeId), /not finite/);
  state.gm = false;
  await assert.rejects(() => api.markNodeExhausted('LOC-TEST-MILLBROOK', nodeId), /Only the GM/);
  assert.deepEqual(api.GATHERING.dcByTier[5], 15);
});

const pack = () => JSON.parse(fs.readFileSync(new URL('../examples/test-locations.json', import.meta.url)));
const locRecords = () => pack().records.filter(r => r.entity_type === 'Location');

test('importLocations is GM-only and writes nothing for a player', async () => {
  const {api, state} = setup();
  const before = structuredClone(state.stored);
  await assert.rejects(() => api.importLocations(locRecords()), /Only the GM/);
  assert.deepEqual(state.stored, before);
});

test('importLocations creates new ids, reports skips with reasons and leaves existing ones alone', async () => {
  const {api, state} = setup({gm: true});
  state.stored[0].name = 'GM edited';
  const fresh = {...locRecords()[0], id: 'LOC-TEST-BRAND-NEW', name: '[TEST] Brand New', location: {name: '[TEST] Brand New'}};
  const r = await api.importLocations([...locRecords(), fresh, {id: 'ITEM-X', entity_type: 'Item'}, {id: 'bad id', entity_type: 'Location'}]);
  assert.deepEqual(r.created, ['LOC-TEST-BRAND-NEW']);
  assert.deepEqual(r.updated, []);
  assert.equal(r.skipped.length, 4 + 2);
  assert.ok(r.skipped.every(s => s.id && s.reason));
  assert.equal(state.stored[0].name, 'GM edited');
  assert.ok(state.stored.some(l => l.id === 'LOC-TEST-BRAND-NEW'));
});

test('importLocations update mode replaces the definition but keeps revealed and exhausted state', async () => {
  const {api, state} = setup({gm: true});
  const rec = locRecords().find(r => r.id === 'LOC-TEST-MILLBROOK');
  const stored = state.stored.find(l => l.id === 'LOC-TEST-MILLBROOK');
  stored.revealed = true;
  stored.resources[0].finite = true; stored.resources[0].exhausted = true;
  const nodeKey = stored.resources[0].key;
  rec.location = {...rec.location, revealed: false, description: 'Updated text',
    resources: [{id: nodeKey, label: 'Renamed node', finite: true, materialId: 'MAT-TEST-REED'}]};
  const r = await api.importLocations([rec], {mode: 'update'});
  assert.deepEqual(r.updated, ['LOC-TEST-MILLBROOK']);
  const after = state.stored.find(l => l.id === 'LOC-TEST-MILLBROOK');
  assert.equal(after.description, 'Updated text');
  assert.equal(after.resources[0].label, 'Renamed node');
  assert.equal(after.revealed, true);
  assert.equal(after.resources[0].exhausted, true);
  assert.equal(state.stored.length, sample.length);
});

test('importLocations rejects an unknown mode and non-arrays', async () => {
  const {api} = setup({gm: true});
  await assert.rejects(() => api.importLocations(locRecords(), {mode: 'overwrite'}), /Unknown import mode/);
  await assert.rejects(() => api.importLocations({}), /array/);
});
