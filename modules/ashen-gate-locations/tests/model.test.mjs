import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeLocationId, newLocation, normalizeLocation, playerView, viewHtml, parseImport, exportPackage, resourcesOf, materialIdOf} from '../scripts/model.mjs';

const sample = JSON.parse(fs.readFileSync(new URL('../examples/test-locations.json', import.meta.url)));

test('ID is generated from the name, unique, and survives renaming', () => {
  assert.equal(makeLocationId('[TEST] Old Quarry'), 'LOC-TEST-OLD-QUARRY');
  assert.equal(makeLocationId('Café du Nord!'), 'LOC-CAFE-DU-NORD');
  assert.equal(makeLocationId('', []), 'LOC-LOCATION');
  assert.equal(makeLocationId('Quarry', ['LOC-QUARRY', 'LOC-QUARRY-2']), 'LOC-QUARRY-3');
  const loc = newLocation('Quarry', []);
  const renamed = normalizeLocation({...loc, name: 'Something Else'});
  assert.equal(renamed.id, 'LOC-QUARRY');
});

test('normalize fills defaults and drops junk', () => {
  const loc = normalizeLocation({id: 'LOC-A', name: ' A ', threat: 'apocalyptic', img: 'javascript:alert(1)',
    resources: [{label: 'Ore', materialId: 'not-a-mat'}, {}, 'junk'], related: [{locationId: 'LOC-A'}], quests: [{questId: 'bad'}], extra: 1});
  assert.equal(loc.name, 'A');
  assert.equal(loc.threat, 'normal');
  assert.equal(loc.img, '');
  assert.equal(loc.revealed, false);
  assert.deepEqual(loc.resources.map(r => [r.label, r.materialId, r.available, r.visible]), [['Ore', '', true, true]]);
  assert.deepEqual(loc.related, [], 'a location cannot relate to itself');
  assert.deepEqual(loc.quests, []);
  assert.equal(loc.extra, undefined);
  assert.equal(loc.sections.resources, false, 'sections start hidden from players');
});

test('unrevealed locations have no player view at all', () => {
  assert.equal(playerView({id: 'LOC-X', name: 'Secret', revealed: false}), null);
});

test('player view omits hidden fields, hidden sections and hidden entries', () => {
  const loc = {id: 'LOC-X', name: 'Town', revealed: true, type: 'Town', region: 'North', description: 'GM-SECRET-DESC', threat: 'deadly',
    show: {description: false},
    sections: {resources: true, factions: false, notes: true, quests: true},
    resources: [{label: 'Ore', available: false}, {label: 'GM-SECRET-RES', visible: false}],
    factions: [{label: 'GM-SECRET-FACTION'}],
    quests: [{questId: 'QUEST-ONE'}, {questId: 'QUEST-TWO', visible: false}],
    notes: [{title: 'Public', text: 'hello'}, {title: 'GM-SECRET-NOTE', text: 'x', visible: false}]};
  const view = playerView(loc, [loc]);
  assert.deepEqual(Object.keys(view).sort(), ['id', 'name', 'notes', 'quests', 'region', 'resources', 'threat', 'type']);
  assert.deepEqual(view.resources, [{label: 'Ore', materialId: '', uuid: '', available: false, note: ''}]);
  assert.deepEqual(view.quests, ['QUEST-ONE']);
  assert.equal(view.notes.length, 1);
  assert.doesNotMatch(JSON.stringify(view) + viewHtml(view), /GM-SECRET/);
});

test('related links only point at revealed locations', () => {
  const a = {id: 'LOC-A', name: 'A', revealed: true, sections: {related: true}, related: [{locationId: 'LOC-B'}, {locationId: 'LOC-C'}, {locationId: 'LOC-GONE'}]};
  const b = {id: 'LOC-B', name: 'B', revealed: true};
  const c = {id: 'LOC-C', name: 'Hidden C', revealed: false};
  assert.deepEqual(playerView(a, [a, b, c]).related, [{id: 'LOC-B', name: 'B'}]);
});

test('player HTML escapes markup', () => {
  const html = viewHtml(playerView({id: 'LOC-A', name: '<script>x</script>', revealed: true, description: '<img onerror=1>'}));
  assert.doesNotMatch(html, /<script>|<img onerror/);
});

test('sample [TEST] data: player views never contain GM-only content', () => {
  const {created} = parseImport(sample, []);
  assert.equal(created.length, 4);
  const views = created.map(l => playerView(l, created)).filter(Boolean);
  assert.deepEqual(views.map(v => v.name), ['[TEST] Millbrook', '[TEST] Old Quarry']);
  const text = JSON.stringify(views) + views.map(viewHtml).join('');
  assert.doesNotMatch(text, /GM-only Herb|GM secret|smuggler|Hidden Cave|Ash Wastes|Players must not see/);
  assert.equal(views[1].description, undefined, 'Old Quarry hides its description');
});

test('import skips non-location records and keeps existing locations untouched', () => {
  const pkg = {manifest: {schema_version: 'ag-foundry-import/0.2'}, records: [
    {id: 'MAT-ORE', entity_type: 'Material'},
    {id: 'LOC-OLD', entity_type: 'Location', location: {name: 'Overwrite me'}},
    {id: 'LOC-NEW', entity_type: 'Location', name: 'New Place'},
    {id: 'bad id', entity_type: 'Location'}]};
  const r = parseImport(pkg, ['LOC-OLD']);
  assert.deepEqual(r.created.map(l => [l.id, l.name]), [['LOC-NEW', 'New Place']]);
  assert.deepEqual(r.skipped, ['LOC-OLD']);
  assert.equal(r.errors.length, 1);
  assert.throws(() => parseImport({manifest: {schema_version: 'x'}, records: []}), /schema_version/);
  assert.throws(() => parseImport(null), /import package/);
});

test('export round-trips through import', () => {
  const {created} = parseImport(sample, []);
  const pkg = exportPackage(created);
  assert.equal(pkg.manifest.schema_version, 'ag-foundry-import/0.2');
  for (const rec of pkg.records) {
    assert.equal(rec.entity_type, 'Location');
    assert.ok(Array.isArray(rec.refs) && rec.provenance.sources.length && ['player', 'reveal_gated'].includes(rec.visibility));
  }
  assert.deepEqual(parseImport(pkg, []).created, created);
});

test('resources: GM sees all with visibility, player gets the view list', () => {
  const loc = normalizeLocation({id: 'LOC-A', name: 'A', revealed: true, sections: {resources: true},
    resources: [{label: 'Ore', materialId: 'MAT-ORE'}, {label: 'Secret', visible: false}]});
  assert.equal(resourcesOf(loc, {gm: true}).length, 2);
  assert.deepEqual(resourcesOf(playerView(loc)).map(r => r.label), ['Ore']);
  assert.deepEqual(resourcesOf(null), []);
});

test('material id comes from Ashen Gate item flags', () => {
  assert.equal(materialIdOf({flags: {'ashen-gate-manager': {source: {sourceId: 'MAT-IRON-ORE'}}}}), 'MAT-IRON-ORE');
  assert.equal(materialIdOf({flags: {'ashen-gate-profession-ledger': {sourceId: 'MAT-REED'}}}), 'MAT-REED');
  assert.equal(materialIdOf({flags: {'ashen-gate-manager': {source: {sourceId: 'REC-X'}}}}), '');
  assert.equal(materialIdOf({}), '');
});
