/** 0.20.0: routes retired. Hazards and linked roll tables on every location, the GM-only data layer around them, import /
 *  export, Route records skipped, and Developer Tools → Convert routes to locations (stored routes never changed).
 *  Mocked Foundry documents and a stand-in DialogV2: proves the logic and the markup, not the live Foundry window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installFoundry, gm, player} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {readAll, writeAll, readViews, placeNote, readStoredRoutes} from '../scripts/store.mjs';
import {MODULE_ID, normalizeLocation, normalizeHazards, normalizeRollTables, playerView, viewHtml, publishable, exportPackage, parseImport, importRecords,
  ROUTES_RETIRED, BLOCKS, TYPE_SUGGESTIONS} from '../scripts/model.mjs';
import {planRouteConversion} from '../scripts/route-convert.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
const {LocationsApp} = await import('../scripts/app.mjs');
globalThis.CSS ??= {escape: v => String(v)};
const sample = parseImport(JSON.parse(fs.readFileSync(new URL('../examples/test-locations.json', import.meta.url))), []).created;

const HAZARDS = [
  {id: 'hz-rockfall', name: '[TEST] Rockfall', note: '[TEST] Loose scree above the path.', shown: true, tableUuid: 'RollTable.tblRock'},
  {id: 'hz-secret', name: '[TEST] GM-only Ambush', note: '[TEST] GM secret: bandits wait here.', tableUuid: 'RollTable.tblAmbush'}
];
const TABLES = [{id: 'rt-weather', name: '[TEST] Weather', uuid: 'RollTable.tblWeather', shown: true}, {id: 'rt-gm', name: '[TEST] GM-only Encounters', uuid: 'RollTable.tblEnc'}];
/** A revealed [TEST] Route location with one shown and one GM-only entry of each kind, published. */
const road = (over = {}) => {
  const l = normalizeLocation({id: 'LOC-TEST-MILL-ROAD', name: '[TEST] Mill Road', type: 'Route', parentLocationId: 'LOC-TEST-MILLBROOK', state: 'revealed',
    hazards: HAZARDS, rollTables: TABLES, ...over});
  l.published = publishable(l);
  return l;
};
const GM_ONLY = /GM-only|GM secret|tblRock|tblAmbush|tblEnc|tableUuid/;

/** The real API over the mocked store, with a stored 0.19.0 route record and journey left in the GM Data Journal. */
async function world({routes = null, gmUser = true} = {}) {
  const g = installFoundry();
  const said = {info: [], warn: []};
  globalThis.ui = {notifications: {info: m => said.info.push(m), warn: m => said.warn.push(m), error: m => said.warn.push(m)}};
  g.settings = {get: () => undefined, set: async () => {}};
  g.tables = [{name: '[TEST] Old hazards', uuid: 'RollTable.tblOld'}];
  g.tables.getName = name => g.tables.find(t => t.name === name);
  g.user = gm;
  const drawn = [];
  const mod = {version: '0.20.0', active: true};
  mod.api = createApi({version: '0.20.0', isGM: () => game.user.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}, playerIds: () => ['p1'],
    tables: {draw: async uuid => { drawn.push(uuid); return {results: ['[TEST] result']}; }, uuidByName: name => g.tables.getName(name)?.uuid ?? ''},
    storedRoutes: readStoredRoutes});
  g.modules = {get: id => id === MODULE_ID ? mod : null};
  g.users = [gm, player];
  await writeAll([...sample, road()]);
  if (routes) {
    const doc = g.journal.find(j => j.getFlag(MODULE_ID, 'role') === 'gm-data');
    await doc.update({[`flags.${MODULE_ID}.routes`]: routes, [`flags.${MODULE_ID}.routeIds`]: routes.map(r => r.id),
      [`flags.${MODULE_ID}.travel`]: {journey: {journeyId: 'j1', routeId: routes[0]?.id, status: 'active'}, partyLocationId: '', history: []}});
  }
  if (!gmUser) g.user = player;
  return {api: mod.api, g, said, drawn};
}
const gmFlags = g => structuredClone(g.journal.find(j => j.getFlag(MODULE_ID, 'role') === 'gm-data').flags[MODULE_ID]);

// ---------- model ----------
test('hazards and roll tables normalise: ids kept, new entries GM only (shown false), empty or bad entries dropped', () => {
  const h = normalizeHazards([{id: 'a', name: '[TEST] A', tableUuid: 'RollTable.x'}, {name: '[TEST] B', shown: 'yes'}, {}, {id: 'a', note: '[TEST] dup id'}, {name: 'x', tableUuid: 'javascript:alert(1)'}]);
  assert.deepEqual(h.map(x => [x.name, x.shown, x.tableUuid]), [['[TEST] A', false, 'RollTable.x'], ['[TEST] B', false, ''], ['', false, ''], ['x', false, '']]);
  assert.equal(h[0].id, 'a');
  assert.notEqual(h[2].id, 'a', 'a repeated id gets a new one');
  assert.deepEqual(Object.keys(h[0]).sort(), ['id', 'name', 'note', 'shown', 'tableUuid']);
  const t = normalizeRollTables([{id: 't1', name: '[TEST] T', uuid: 'Compendium.world.tables.RollTable.abc', shown: true}, {name: 'no uuid'}]);
  assert.deepEqual(t, [{id: 't1', name: '[TEST] T', uuid: 'Compendium.world.tables.RollTable.abc', shown: true}]);
  const loc = normalizeLocation({id: 'LOC-TEST-X', name: '[TEST] X'});
  assert.deepEqual([loc.hazards, loc.rollTables, loc.convertedFromRoute], [[], [], '']);
  assert.ok(BLOCKS.some(b => b.key === 'hazards') && BLOCKS.some(b => b.key === 'rollTables'));
  assert.equal(TYPE_SUGGESTIONS[0], 'Route');
});

test('an existing location is not "changed" by the new fields (no false "Players see an older version")', () => {
  const old = {id: 'LOC-TEST-OLD', name: '[TEST] Old', state: 'revealed', layout: ['description', 'loot'], published: {name: '[TEST] Old', layout: ['description', 'loot']}};
  const l = normalizeLocation(old);
  assert.deepEqual(l.published.hazards, []);
  assert.equal(JSON.stringify(publishable(l)), JSON.stringify(l.published));
});

test('players get only shown hazards (name and note, never the table) and shown roll tables, and only once revealed and published', () => {
  const v = playerView(road(), [road()]);
  assert.deepEqual(v.hazards, [{id: 'hz-rockfall', name: '[TEST] Rockfall', note: '[TEST] Loose scree above the path.'}]);
  assert.deepEqual(v.rollTables, [{id: 'rt-weather', name: '[TEST] Weather', uuid: 'RollTable.tblWeather'}]);
  assert.ok(v.layout.includes('hazards') && v.layout.includes('rollTables'));
  assert.doesNotMatch(JSON.stringify(v) + viewHtml(v), GM_ONLY);
  assert.match(viewHtml(v), /<h2>Hazards<\/h2><ul><li>\[TEST\] Rockfall: \[TEST\] Loose scree above the path\.<\/li><\/ul>/);
  assert.equal(playerView(road({state: 'hidden'}), []), null, 'hidden: nothing');
  const unid = playerView(road({state: 'unidentified'}), []);
  assert.deepEqual(Object.keys(unid).sort(), ['key', 'name', 'state']);
  // Save is private: a hazard shown after the last Publish stays hidden until the next one.
  const l = road();
  l.hazards[1].shown = true;
  assert.doesNotMatch(JSON.stringify(playerView(l, [l])), /GM-only Ambush/);
  assert.match(JSON.stringify(playerView({...l, published: publishable(l)}, [l])), /GM-only Ambush/);
});

// ---------- API: enforced in the data layer ----------
test('API: players read shown entries of a revealed place only; hidden places, GM-only entries, rolling, export and conversion are refused', async () => {
  const {api, drawn} = await world({gmUser: false});
  assert.deepEqual(api.hazardsAt('LOC-TEST-MILL-ROAD').map(h => h.name), ['[TEST] Rockfall']);
  assert.deepEqual(api.rollTablesAt('LOC-TEST-MILL-ROAD').map(t => t.name), ['[TEST] Weather']);
  assert.doesNotMatch(JSON.stringify([api.hazardsAt('LOC-TEST-MILL-ROAD'), api.rollTablesAt('LOC-TEST-MILL-ROAD'), api.listLocations(), api.getLocation('LOC-TEST-MILL-ROAD')]), GM_ONLY);
  assert.deepEqual(api.hazardsAt('LOC-TEST-HIDDEN-CAVE'), [], 'a hidden place answers as unknown');
  assert.deepEqual(api.rollTablesAt('LOC-TEST-NOPE'), []);
  await assert.rejects(() => api.rollTable('RollTable.tblWeather'), /Only the GM/);
  assert.deepEqual(drawn, [], 'nothing rolled');
  assert.throws(() => api.exportPackage(), /Only the GM/);
  await assert.rejects(() => api.convertRoutes(), /Only the GM/);
  await assert.rejects(() => api.saveLocation({id: 'LOC-TEST-MILL-ROAD', name: 'x', hazards: []}), /Only the GM/);
});

test('API: the GM reads every entry, rolls a linked table to chat, and saving keeps ids', async () => {
  const {api, drawn} = await world();
  assert.deepEqual(api.hazardsAt('LOC-TEST-MILL-ROAD').map(h => [h.id, h.shown, h.tableUuid]), [['hz-rockfall', true, 'RollTable.tblRock'], ['hz-secret', false, 'RollTable.tblAmbush']]);
  assert.equal(api.rollTablesAt('LOC-TEST-MILL-ROAD').length, 2);
  assert.deepEqual(await api.rollTable('RollTable.tblWeather'), {results: ['[TEST] result']});
  assert.deepEqual(drawn, ['RollTable.tblWeather']);
  await assert.rejects(() => api.rollTable(''), /Choose a roll table/);
  const loc = api.getLocation('LOC-TEST-MILL-ROAD');
  loc.hazards[0].note = '[TEST] Changed';
  await api.saveLocation(loc);
  assert.deepEqual(api.hazardsAt('LOC-TEST-MILL-ROAD').map(h => [h.id, h.note]), [['hz-rockfall', '[TEST] Changed'], ['hz-secret', '[TEST] GM secret: bandits wait here.']]);
});

// ---------- import / export ----------
test('export carries hazards and rollTables with their ids; import (and update) keeps them; roll_tables is read too', () => {
  const pkg = exportPackage([road()]);
  const rec = pkg.records[0];
  assert.deepEqual(rec.location.hazards.map(h => h.id), ['hz-rockfall', 'hz-secret']);
  assert.deepEqual(rec.location.rollTables.map(t => t.id), ['rt-weather', 'rt-gm']);
  assert.ok(pkg.records.every(r => r.entity_type === 'Location'), 'no Route records');
  const back = parseImport(pkg, []).created[0];
  assert.deepEqual([back.hazards, back.rollTables], [road().hazards, road().rollTables]);
  const snake = parseImport({...pkg, records: [{...rec, location: {...rec.location, rollTables: undefined, roll_tables: [{id: 'rt-x', name: '[TEST] X', uuid: 'RollTable.x'}]}}]}, []);
  assert.deepEqual(snake.created[0].rollTables.map(t => t.id), ['rt-x']);
  // An update that leaves the new fields out keeps the world's (like loot and conditions).
  const {updated} = importRecords([{id: 'LOC-TEST-MILL-ROAD', entity_type: 'Location', location: {name: '[TEST] Mill Road v2'}}], [road()], {mode: 'update'});
  assert.deepEqual([updated[0].name, updated[0].hazards.length, updated[0].rollTables.length], ['[TEST] Mill Road v2', 2, 2]);
});

test('a Route record no longer fails the file: it is skipped with a clear message and the locations still import', async () => {
  const route = {id: 'RTE-TEST-A-B', entity_type: 'Route', status: 'approved', version: '1.0.0', name: '[TEST] Road', route: {from_location_id: 'LOC-TEST-A', to_location_id: 'LOC-TEST-B', distance_km: 3}};
  const loc = {id: 'LOC-TEST-A', entity_type: 'Location', name: '[TEST] A', location: {name: '[TEST] A'}};
  const pkg = {manifest: {schema_version: 'ag-foundry-import/0.2', package_id: 'AG-TEST', version: '1.0.0'}, records: [route, loc]};
  const {api, g} = await world();
  const r = await api.importPackage(pkg);
  assert.deepEqual([r.created, r.errors, r.retired], [['LOC-TEST-A'], [], [{id: 'RTE-TEST-A-B', reason: ROUTES_RETIRED}]]);
  assert.equal(ROUTES_RETIRED, 'Routes are retired; make a location with type Route instead.');
  const m = await api.importLocations([route, {...loc, id: 'LOC-TEST-B', location: {name: '[TEST] B'}}]);
  assert.deepEqual(m.created, ['LOC-TEST-B']);
  assert.deepEqual(m.skipped, [{id: 'RTE-TEST-A-B', reason: ROUTES_RETIRED}]);
  assert.equal(gmFlags(g).routes, undefined, 'no route stored');
});

// ---------- saved data and conversion ----------
const OLD = [
  {id: 'RTE-TEST-MILL-QUARRY', viewKey: 'abcdefabcdef1234', name: '[TEST] Quarry Track', fromId: 'LOC-TEST-OLD-QUARRY', toId: 'LOC-TEST-MILLBROOK', distanceKm: 12, terrain: 'Moor',
    hazardTable: {uuid: 'RollTable.tblQuarry', name: '[TEST] Quarry hazards'}, hazardBase: 10, state: 'known', notes: '[TEST] GM note: the bridge is out.'},
  {id: 'RTE-TEST-MILL-ASH', fromId: 'LOC-TEST-MILLBROOK', toId: 'LOC-TEST-ASH-WASTES', distanceKm: 5, hazardTable: {name: '[TEST] Old hazards'}},
  {id: 'RTE-TEST-GONE-MILL', name: '[TEST] Lost Path', fromId: 'LOC-TEST-GONE', toId: 'LOC-TEST-MILLBROOK', distanceKm: 3},
  {id: 'RTE-TEST-MILL-ASH-2', name: '[TEST] Fog Path', fromId: 'LOC-TEST-MILLBROOK', toId: 'LOC-TEST-ASH-WASTES', distanceKm: 2, hazardTable: {name: '[TEST] Missing table'}}
];

test('saving locations never touches the stored routes, route ids or journey', async () => {
  const {api, g} = await world({routes: OLD});
  const before = gmFlags(g);
  await api.saveLocation({...api.getLocation('LOC-TEST-MILLBROOK'), description: '[TEST] changed'});
  await api.setLocationState('LOC-TEST-MILLBROOK', 'revealed');
  const after = gmFlags(g);
  assert.deepEqual([after.routes, after.routeIds, after.travel], [before.routes, before.routeIds, before.travel]);
  assert.deepEqual(readStoredRoutes(), OLD);
});

test('Convert routes to locations: preview writes nothing; Apply makes Route locations with new LOC ids; re-running converts nothing twice', async () => {
  const {api, g} = await world({routes: OLD});
  const count = () => api.listLocations().length;
  const n = count();
  const plan = await api.convertRoutes();
  assert.equal(count(), n, 'preview writes nothing');
  assert.equal(plan.total, 4);
  assert.deepEqual(plan.convert.map(c => [c.routeId, c.name, c.parentId]), [
    ['RTE-TEST-MILL-QUARRY', '[TEST] Quarry Track', 'LOC-TEST-MILLBROOK'],   // start's parent
    ['RTE-TEST-MILL-ASH', '[TEST] Millbrook – [TEST] Ash Wastes', 'LOC-TEST-MILLBROOK'],   // start at top level: inside the start
    ['RTE-TEST-MILL-ASH-2', '[TEST] Fog Path', 'LOC-TEST-MILLBROOK']]);
  assert.deepEqual(plan.skipped, [{routeId: 'RTE-TEST-GONE-MILL', name: '[TEST] Lost Path', reason: 'Its start location LOC-TEST-GONE no longer exists.'}]);
  assert.deepEqual(plan.convert[2].notes, ['Hazard table "[TEST] Missing table" was not found, so it is not linked.']);
  const r = await api.convertRoutes({apply: true});
  assert.equal(r.applied, true);
  const made = api.listLocations().filter(l => l.convertedFromRoute);
  assert.equal(made.length, 3);
  for (const l of made) {
    assert.match(l.id, /^LOC-/);
    assert.doesNotMatch(l.id, /RTE/);
    assert.deepEqual([l.type, l.state, l.published], ['Route', 'hidden', null]);
  }
  const q = made.find(l => l.convertedFromRoute === 'RTE-TEST-MILL-QUARRY');
  assert.equal(q.id, 'LOC-TEST-QUARRY-TRACK');
  assert.equal(q.description, 'Moor · 12 km');
  assert.deepEqual(q.rollTables.map(t => [t.name, t.uuid, t.shown]), [['[TEST] Quarry hazards', 'RollTable.tblQuarry', false]]);
  assert.deepEqual(q.hazards.map(h => [h.name, h.note, h.tableUuid, h.shown]), [['[TEST] Quarry hazards', '[TEST] GM note: the bridge is out.', 'RollTable.tblQuarry', false]]);
  const ash = made.find(l => l.convertedFromRoute === 'RTE-TEST-MILL-ASH');
  assert.equal(ash.rollTables[0].uuid, 'RollTable.tblOld', 'a table stored by name is found by name');
  assert.deepEqual(readStoredRoutes(), OLD, 'stored routes unchanged');
  assert.equal(gmFlags(g).travel.journey.journeyId, 'j1', 'the old journey is untouched');
  // Players see nothing of it: every converted location starts Hidden.
  game.user = player;
  assert.doesNotMatch(JSON.stringify(api.listLocations({includeUnidentified: true})), /Quarry Track|bridge is out|tblQuarry/);
  game.user = gm;
  const again = await api.convertRoutes({apply: true});
  assert.deepEqual([again.convert, again.applied, again.done.length], [[], false, 3]);
  assert.equal(api.listLocations().filter(l => l.convertedFromRoute).length, 3, 'nothing converted twice');
  // Saving a converted location keeps its convertedFromRoute (the editor never shows it).
  const {convertedFromRoute, ...rest} = q;
  await api.saveLocation(rest);
  assert.equal(api.getLocation(q.id).convertedFromRoute, 'RTE-TEST-MILL-QUARRY');
});

test('planRouteConversion is pure and skips what does not convert cleanly', () => {
  const plan = planRouteConversion([{id: 'bad'}, null, {id: 'RTE-TEST-X', fromId: 'LOC-A'}], [{id: 'LOC-A', name: '[TEST] A', parentLocationId: ''}]);
  assert.deepEqual(plan.skipped.map(s => s.reason), ['It has no RTE id.', 'It has no RTE id.', 'It has no name and its end location no longer exists.']);
  assert.equal(planRouteConversion(undefined, []).total, 0);
});

// ---------- UI (markup only) ----------
const gmApp = () => { const app = new LocationsApp(); app.element = null; app.render = async () => {}; return app; };

test('editor Content sub-tab: Hazards and Roll Tables cards with Add hazard…, Open table / Roll for the GM; Type suggests Route', async () => {
  await world();
  const app = gmApp();
  app.select('LOC-TEST-MILL-ROAD');
  const html = await app._renderHTML();
  const content = html.slice(html.indexOf('id="agl-editor-panel-content"'), html.indexOf('id="agl-editor-panel-visibility"'));
  assert.match(content, /<section class="ag-card agl-section" data-block="hazards" data-drop="hazards">[\s\S]*<h3>Hazards<\/h3>/);
  assert.match(content, /data-block="rollTables" data-drop="rollTables">[\s\S]*<h3>Roll Tables<\/h3>/);
  assert.match(content, /data-action="add-hazard"><i class="fa-solid fa-plus" aria-hidden="true"><\/i><span>Add hazard…<\/span>/);
  assert.match(content, /data-action="open-doc" data-uuid="RollTable\.tblRock"[^>]*><i[^>]*><\/i><span>Open table<\/span>/);
  assert.match(content, /data-action="roll-table" data-uuid="RollTable\.tblRock"/);
  assert.match(content, /data-action="remove-hazard" data-id="hz-secret" aria-label="Remove \[TEST\] GM-only Ambush"/);
  assert.match(content, /data-toggle="hazards\.hz-secret\.shown"/);
  assert.match(content, /<input id="agl-type" type="text" list="agl-types"[^>]*>[\s\S]*<datalist id="agl-types"><option value="Route">/);
  assert.doesNotMatch(html, /data-tab="routes"|route-|Travel tracker|journey/i);
});

test('editor: eye toggles set shown; Remove asks "Remove <name>?" (danger, Cancel default) and only then drops the entry', async () => {
  await world();
  const app = gmApp();
  app.select('LOC-TEST-MILL-ROAD');
  app.setPath('hazards.hz-secret.shown', true);
  assert.equal(app.draft.hazards[1].shown, true);
  assert.equal(app.dirty, true);
  const seen = [];
  foundry.applications.api.DialogV2 = {wait: async o => { seen.push(o); return 'cancel'; }};
  await app.onAction({dataset: {action: 'remove-hazard', id: 'hz-rockfall'}});
  assert.equal(seen[0].window.title, 'Remove [TEST] Rockfall?');
  assert.deepEqual(seen[0].buttons.map(b => [b.label, !!b.default]), [['Cancel', true], ['Remove hazard', false]]);
  assert.equal(app.draft.hazards.length, 2, 'Cancel keeps it');
  foundry.applications.api.DialogV2 = {wait: async o => o.buttons.find(b => b.label === 'Remove hazard').callback?.() ?? 'yes'};
  await app.onAction({dataset: {action: 'remove-hazard', id: 'hz-rockfall'}});
  assert.deepEqual(app.draft.hazards.map(h => h.id), ['hz-secret']);
});

test('player viewer shows the shown hazard and roll table; GM Setup offers Convert only while stored routes exist', async () => {
  const {g} = await world({gmUser: false});
  g.user = player;
  const p = new LocationsApp(); p.render = async () => {};
  p.select('LOC-TEST-MILL-ROAD');
  const html = await p._renderHTML();
  assert.match(html, /<h3>Hazards<\/h3>[\s\S]*\[TEST\] Rockfall/);
  assert.match(html, /<h3>Roll Tables<\/h3>[\s\S]*\[TEST\] Weather/);
  assert.doesNotMatch(html, GM_ONLY);
  assert.doesNotMatch(html, /roll-table|add-hazard/);
  // GM Setup
  g.user = gm;
  const plain = gmApp(); plain.tab = 'setup';
  assert.doesNotMatch(await plain._renderHTML(), /convert-routes/);
  const {g: g2} = await world({routes: OLD});
  g2.user = gm;
  const app = gmApp(); app.tab = 'setup';
  const setup = await app._renderHTML();
  assert.match(setup, /<details class="ag-devtools">[\s\S]*This world still holds 4 stored route\(s\)[\s\S]*data-action="convert-routes"[\s\S]*Convert routes to locations…[\s\S]*<\/details>/);
});
