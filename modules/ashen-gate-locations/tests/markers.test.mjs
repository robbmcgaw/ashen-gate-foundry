/** 1.3.0: marker states, opaque pin keys, private Save / explicit Publish, nesting, pin art, migration.
 *  Mocked Foundry: proves the data each client can read, not the live canvas. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry, gm, player, Journal, Scene} from './foundry-mock.mjs';
import {readAll, writeAll, readViews, placeNote, migrate} from '../scripts/store.mjs';
import {createApi} from '../scripts/api.mjs';
import {normalizeLocation, playerView, viewHtml, exportPackage, parseImport, importRecords, pinPresentation, notePatch, publishable, wouldCycle, PIN_KEY, PIN_DEFAULTS} from '../scripts/model.mjs';

const MOD = 'ashen-gate-locations';
const as = user => { game.user = user; };
const playerJournal = () => game.journal.find(j => j.getFlag(MOD, 'role') === 'player-view');
const gmJournal = () => game.journal.find(j => j.getFlag(MOD, 'role') === 'gm-data');
const SECRET = /SECRET/;   // every hidden/unidentified name, id, path and text below contains it

/** A parent with one child per state. Revealed ones are [TEST]; everything players must not read says SECRET. */
const world = () => [
  {id: 'LOC-TEST-TOWN', name: '[TEST] Town', state: 'revealed', sections: {related: true}, related: [{locationId: 'LOC-SECRET-VAULT'}]},
  {id: 'LOC-SECRET-VAULT', name: '[TEST] SECRET Vault', state: 'unidentified', parentLocationId: 'LOC-TEST-TOWN',
    unidentifiedLabel: '[TEST] Strange door', teaser: '[TEST] A draught from below.', description: 'SECRET desc', type: 'SECRET type', region: 'SECRET region',
    sections: {resources: true, notes: true}, resources: [{label: 'SECRET ore', materialId: 'MAT-SECRET'}], notes: [{title: 'SECRET note', text: 'x'}],
    pin: {img: 'pins/SECRET-vault.webp'}},
  {id: 'LOC-SECRET-CRYPT', name: '[TEST] SECRET Crypt', state: 'hidden', parentLocationId: 'LOC-SECRET-VAULT', description: 'SECRET', pin: {img: 'pins/SECRET.webp'}},
  {id: 'LOC-TEST-MILL', name: '[TEST] Mill', state: 'revealed', parentLocationId: 'LOC-TEST-TOWN'}
];

function apiFor({access = true} = {}) {
  const mod = {version: '1.3.0', active: true};
  mod.api = createApi({version: '1.3.0', isGM: () => game.user.isGM, playerAccessEnabled: () => access, setPlayerAccess: async () => {},
    readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}});
  return mod.api;
}

test('1.2.x records migrate on read: revealed -> Revealed (content stays published), else Hidden; re-runnable', () => {
  const shown = normalizeLocation({id: 'LOC-A', name: 'A', revealed: true, description: 'd'});
  const hidden = normalizeLocation({id: 'LOC-B', name: 'B', revealed: false});
  assert.deepEqual([shown.state, shown.revealed, hidden.state, hidden.revealed], ['revealed', true, 'hidden', false]);
  assert.equal(shown.published.description, 'd', 'players keep seeing what they saw in 1.2.x');
  assert.equal(hidden.published, null);
  assert.match(shown.pinKey, PIN_KEY);
  assert.deepEqual(normalizeLocation(normalizeLocation(shown)), shown);
  assert.equal(normalizeLocation({id: 'LOC-C', state: 'bogus', revealed: true}).state, 'revealed');
  assert.equal(normalizeLocation({id: 'LOC-C', state: 'unidentified', revealed: true}).state, 'unidentified', 'state wins over the old flag');
  const keys = new Set(Array.from({length: 50}, () => normalizeLocation({}).pinKey));
  assert.equal(keys.size, 50, 'pin keys are random');
});

test('Unidentified view is the label and teaser only; Hidden is nothing', () => {
  const all = world().map(normalizeLocation);
  const vault = playerView(all[1], all);
  assert.deepEqual(Object.keys(vault).sort(), ['key', 'name', 'state', 'teaser']);
  assert.deepEqual([vault.name, vault.state, vault.key], ['[TEST] Strange door', 'unidentified', all[1].pinKey]);
  assert.doesNotMatch(JSON.stringify(vault) + viewHtml(vault), SECRET);
  assert.equal(playerView(all[2], all), null);
  assert.equal(playerView({...all[1], unidentifiedLabel: '', published: undefined}, all, {label: '[TEST] Somewhere'}).name, '[TEST] Somewhere', 'world fallback label');
  assert.equal(playerView({...all[1], unidentifiedLabel: '', published: undefined}, all).name, 'Unknown location');
});

test('children: revealed by name, unidentified by label, hidden not at all', () => {
  const all = world().map(normalizeLocation);
  const town = playerView(all[0], all);
  assert.deepEqual(town.children.map(c => c.name), ['[TEST] Mill', '[TEST] Strange door']);
  assert.equal('id' in town.children[1], false, 'an unidentified child has no LOC id');
  assert.deepEqual(town.related ?? [], [], 'related links skip unidentified places');
  assert.doesNotMatch(JSON.stringify(town) + viewHtml(town), SECRET);
  assert.deepEqual(playerView(all[3], all).parent, {id: 'LOC-TEST-TOWN', key: all[0].pinKey, name: '[TEST] Town'});
});

test('everything a player client can read (player journal, notes) carries no hidden name, id or content', async () => {
  installFoundry();
  const scene = new Scene();
  game.scenes.push(scene);
  const stored = await writeAll(world());
  for (const loc of stored) await placeNote(loc, {scene, x: 1, y: 1});
  const pages = playerJournal().pages;
  const byKey = key => pages.find(p => p.getFlag(MOD, 'pinKey') === key);
  const [, vault, crypt] = stored;
  for (const loc of [vault, crypt]) {
    const note = scene.notes.find(n => n.flags[MOD].pinKey === loc.pinKey);
    assert.doesNotMatch(JSON.stringify(byKey(loc.pinKey)) + JSON.stringify(note), SECRET, loc.id);
    assert.deepEqual(Object.keys(note.flags[MOD]).sort(), ['pin', 'pinKey']);
    assert.equal(note.texture.src, PIN_DEFAULTS.unidentifiedImg, 'the revealed pin art is not on the note');
  }
  assert.equal(scene.notes.find(n => n.flags[MOD].pinKey === vault.pinKey).text, '[TEST] Strange door');
  assert.equal(scene.notes.find(n => n.flags[MOD].pinKey === crypt.pinKey).text, '');
  assert.equal(byKey(crypt.pinKey).ownership.default, 0, 'Foundry hides the hidden pin from players');
  assert.equal(byKey(vault.pinKey).ownership.default, -1, 'players can see and click the unidentified pin');
  // Revealed pages say nothing about hidden/unidentified places either.
  assert.doesNotMatch(JSON.stringify(pages), SECRET);
});

test('player API: unidentified only by pinKey, never by LOC id; Ledger-facing lists stay revealed-only', async () => {
  installFoundry();
  const stored = await writeAll(world());
  const api = apiFor();
  const vault = stored[1];
  as(player);
  assert.equal(api.getLocation('LOC-SECRET-VAULT'), null, 'same answer as for a hidden or unknown id');
  assert.equal(api.getLocation('LOC-SECRET-CRYPT'), null);
  assert.equal(api.getLocation(undefined), null);
  assert.equal(api.getLocation(vault.pinKey).name, '[TEST] Strange door');
  assert.equal(api.getLocation(stored[2].pinKey), null, 'a hidden pin key gives nothing');
  assert.deepEqual(api.listLocations().map(l => l.name), ['[TEST] Mill', '[TEST] Town']);
  assert.deepEqual(api.listLocations({includeUnidentified: true}).map(l => l.name), ['[TEST] Mill', '[TEST] Strange door', '[TEST] Town']);
  assert.deepEqual(api.resourcesAt(vault.pinKey), []);
  assert.deepEqual(api.nodesForMaterial('MAT-SECRET'), []);
  assert.deepEqual(api.childrenOf('LOC-TEST-TOWN').map(c => c.name), ['[TEST] Mill', '[TEST] Strange door']);
  assert.doesNotMatch(JSON.stringify([api.listLocations({includeUnidentified: true}), api.childrenOf('LOC-TEST-TOWN')]), SECRET);
  for (const call of [() => api.setLocationState('LOC-SECRET-VAULT', 'revealed'), () => api.publishLocation('LOC-TEST-TOWN')])
    await assert.rejects(call, /Only the GM/);
  for (const call of [() => api.previewLocation({id: 'LOC-SECRET-VAULT'}), () => api.hasUnpublishedChanges('LOC-SECRET-VAULT')])
    assert.throws(call, /Only the GM/);
  as(gm);
  assert.equal(readAll().find(l => l.id === 'LOC-SECRET-VAULT').state, 'unidentified', 'nothing changed');
});

test('Save is private; Publish and state changes are explicit', async () => {
  installFoundry();
  await writeAll(world());
  const api = apiFor();
  const town = api.getLocation('LOC-TEST-TOWN');
  await api.saveLocation({...town, description: 'draft words', state: 'hidden', published: null});
  assert.equal(api.getLocation('LOC-TEST-TOWN').state, 'revealed', 'saveLocation cannot change state');
  assert.equal(api.hasUnpublishedChanges('LOC-TEST-TOWN'), true);
  assert.doesNotMatch(JSON.stringify(playerJournal()), /draft words/);
  assert.equal(api.previewLocation(api.getLocation('LOC-TEST-TOWN')).description, 'draft words', 'the GM can preview it');
  assert.doesNotMatch(JSON.stringify(playerJournal()), /draft words/, 'preview writes nothing');
  await api.publishLocation('LOC-TEST-TOWN');
  assert.match(JSON.stringify(playerJournal()), /draft words/);
  await api.saveLocation({...api.getLocation('LOC-TEST-TOWN'), description: 'second draft'});
  assert.doesNotMatch(JSON.stringify(playerJournal()), /second draft/, 'editing a published location stays private');
  as(player);
  assert.equal(api.getLocation('LOC-TEST-TOWN').description, 'draft words');
  as(gm);
  const fresh = await api.saveLocation({name: '[TEST] New', revealed: true, state: 'revealed'});
  assert.deepEqual([fresh.state, fresh.published], ['hidden', null], 'new locations start hidden');
  await assert.rejects(() => api.publishLocation(fresh.id), /hidden/);
  await api.setLocationState(fresh.id, 'unidentified');
  as(player);
  assert.equal(api.getLocation(fresh.pinKey).name, 'Unknown location');
  as(gm);
  await api.setLocationState('LOC-TEST-TOWN', 'hidden');
  assert.doesNotMatch(JSON.stringify(playerJournal()), /draft words|\[TEST\] Town/, 'Hide withdraws at once');
  await assert.rejects(() => api.setLocationState('LOC-TEST-TOWN', 'visible'), /Unknown state/);
});

test('parents: one parent, any depth, loops rejected', async () => {
  const parents = new Map([['LOC-B', 'LOC-A'], ['LOC-C', 'LOC-B']]);
  assert.equal(wouldCycle('LOC-A', 'LOC-C', parents), true);
  assert.equal(wouldCycle('LOC-D', 'LOC-C', parents), false);
  assert.equal(normalizeLocation({id: 'LOC-A', parentLocationId: 'LOC-A'}).parentLocationId, '', 'not inside itself');
  assert.equal(normalizeLocation({id: 'LOC-A', parentLocationId: 'Town'}).parentLocationId, '', 'exact LOC-* refs only');
  installFoundry();
  await writeAll(world());
  const api = apiFor();
  await assert.rejects(() => api.saveLocation({...api.getLocation('LOC-TEST-TOWN'), parentLocationId: 'LOC-SECRET-CRYPT'}), /already inside it/);
  const ok = await api.saveLocation({...api.getLocation('LOC-TEST-MILL'), parentLocationId: 'LOC-SECRET-CRYPT'});
  assert.equal(ok.parentLocationId, 'LOC-SECRET-CRYPT', 'four levels deep is fine');
  const r = importRecords([{id: 'LOC-TEST-TOWN', entity_type: 'Location', location: {name: 'T', parentLocationId: 'LOC-TEST-MILL'}}], readAll(), {mode: 'update'});
  assert.deepEqual(r.updated, []);
  assert.match(r.skipped[0].reason, /inside itself/);
  const pkg = {manifest: {schema_version: 'ag-foundry-import/0.2'}, records: [
    {id: 'LOC-X', entity_type: 'Location', location: {parentLocationId: 'LOC-Y'}}, {id: 'LOC-Y', entity_type: 'Location', location: {parentLocationId: 'LOC-X'}}]};
  const p = parseImport(pkg, []);
  assert.deepEqual([p.created.map(l => l.id), p.errors.length], [['LOC-X'], 1]);
});

test('export/import round-trips the new fields; update import keeps state, published content, pin key and exhausted nodes', () => {
  const all = world().map(normalizeLocation);
  all[1].sceneUuids = ['Scene.abc123'];
  const pkg = exportPackage(all);
  assert.deepEqual(parseImport(pkg, []).created, all);
  assert.equal(pkg.records[1].location.revealed, false, 'older Locations versions still read revealed');
  const vault = {...all[1], resources: [{...all[1].resources[0], exhausted: true}]};
  const incoming = {id: 'LOC-SECRET-VAULT', entity_type: 'Location', location: {name: '[TEST] Renamed', state: 'revealed', description: 'new',
    resources: [{id: vault.resources[0].key, label: 'ore'}]}};
  const {updated: [u]} = importRecords([incoming], [vault], {mode: 'update'});
  assert.deepEqual([u.state, u.pinKey, u.published, u.resources[0].exhausted], ['unidentified', vault.pinKey, vault.published, true]);
  assert.deepEqual([u.parentLocationId, u.unidentifiedLabel, u.teaser, u.pin, u.sceneUuids],
    [vault.parentLocationId, vault.unidentifiedLabel, vault.teaser, vault.pin, vault.sceneUuids], 'fields a package leaves out are kept');
  assert.equal(u.description, 'new');
  assert.deepEqual(importRecords([{...incoming, location: {...incoming.location, teaser: ''}}], [vault], {mode: 'update'}).updated[0].teaser, '', 'a field the package sets is applied');
});

test('pins: state changes update managed art and label, keep GM per-Note overrides, ignore native notes', async () => {
  installFoundry();
  game.settings = {get: (m, k) => ({unidentifiedLabel: '[TEST] ???', unknownPinImage: 'assets/[TEST]-unknown.webp'})[k]};
  const scene = new Scene();
  game.scenes.push(scene);
  const api = apiFor();
  const stored = await writeAll(world());
  const [town] = stored;
  await api.saveLocation({...town, pin: {img: 'assets/[TEST]-town.webp', unidentifiedImg: '', size: 64}});
  await api.publishLocation(town.id);
  const a = await placeNote(town, {scene, x: 0, y: 0});
  const b = await placeNote(town, {scene, x: 5, y: 5});
  const native = (await scene.createEmbeddedDocuments('Note', [{text: 'GM note', texture: {src: 'icons/svg/book.svg'}, iconSize: 40}]))[0];
  assert.deepEqual([a.text, a.texture.src, a.iconSize], ['[TEST] Town', 'assets/[TEST]-town.webp', 64]);
  Object.assign(b, {texture: {src: 'assets/[TEST]-custom.webp'}, iconSize: 90});   // GM edits this Note in Foundry
  await api.setLocationState(town.id, 'unidentified');
  assert.deepEqual([a.text, a.texture.src, a.iconSize], ['[TEST] ???', 'assets/[TEST]-unknown.webp', 64], 'world defaults');
  assert.deepEqual([b.text, b.texture.src, b.iconSize], ['[TEST] ???', 'assets/[TEST]-custom.webp', 90], 'override kept, label still managed');
  await api.setLocationState(town.id, 'hidden');
  assert.equal(a.text, '');
  await api.importLocations([{id: town.id, entity_type: 'Location', location: {name: '[TEST] Town'}}], {mode: 'update'});
  await api.setLocationState(town.id, 'revealed');
  assert.deepEqual([a.texture.src, b.texture.src, b.iconSize], ['assets/[TEST]-town.webp', 'assets/[TEST]-custom.webp', 90], 'import kept pin art and the override');
  assert.deepEqual([native.text, native.texture.src, native.iconSize, native.flags], ['GM note', 'icons/svg/book.svg', 40, undefined]);
  delete game.settings;
});

test('notePatch: 1.2.x notes with the old default icon are managed; custom ones are overrides', () => {
  const pres = {text: 'L', src: 'new.webp', size: 48};
  const old = {text: 'Name', texture: {src: 'icons/svg/castle.svg'}, iconSize: 48, flags: {[MOD]: {locationId: 'LOC-X'}}};
  assert.deepEqual(notePatch(old, 'k'.repeat(16), pres), {text: 'L', texture: {src: 'new.webp'},
    flags: {[MOD]: {pinKey: 'k'.repeat(16), pin: {src: 'new.webp', size: 48}, locationId: null}}});
  const custom = {text: 'L', texture: {src: 'mine.webp'}, iconSize: 48, flags: {[MOD]: {locationId: 'LOC-X'}}};
  assert.equal(notePatch(custom, 'k'.repeat(16), pres).texture, undefined);
  const settled = {text: 'L', texture: {src: 'new.webp'}, iconSize: 48, flags: {[MOD]: {pinKey: 'k'.repeat(16), pin: {src: 'new.webp', size: 48}}}};
  assert.equal(notePatch(settled, 'k'.repeat(16), pres), null);
  assert.deepEqual(pinPresentation({id: 'LOC-A', name: 'A', state: 'hidden', pin: {img: 'secret.webp'}}), {text: '', src: PIN_DEFAULTS.unidentifiedImg, size: 48});
});

test('world migration from 1.2.x: pages and notes lose locationId, gain pinKey; second run writes nothing', async () => {
  installFoundry();
  const scene = new Scene();
  game.scenes.push(scene);
  // A 1.2.x world: records without state/pinKey, pages and notes flagged with the LOC id.
  const old = [{id: 'LOC-SECRET-LAIR', name: '[TEST] SECRET Lair', revealed: false}, {id: 'LOC-TEST-INN', name: '[TEST] Inn', revealed: true, description: 'warm'}];
  game.journal.push(new Journal({name: 'Locations (GM Data)', ownership: {default: 0}, flags: {[MOD]: {role: 'gm-data', locations: old}}}));
  const pj = new Journal({name: 'Locations (Player View)', ownership: {default: 2}, flags: {[MOD]: {role: 'player-view'}}});
  game.journal.push(pj);
  const [lairPage, innPage] = await pj.createEmbeddedDocuments('JournalEntryPage', [
    {name: 'Unrevealed location', ownership: {default: 0}, flags: {[MOD]: {locationId: 'LOC-SECRET-LAIR', view: ''}}},
    {name: '[TEST] Inn', ownership: {default: -1}, flags: {[MOD]: {locationId: 'LOC-TEST-INN', view: '{"id":"LOC-TEST-INN","name":"[TEST] Inn"}'}}}]);
  const [lairNote, , nativeNote] = await scene.createEmbeddedDocuments('Note', [
    {entryId: pj.id, pageId: lairPage.id, text: '', texture: {src: 'icons/svg/castle.svg'}, iconSize: 48, flags: {[MOD]: {locationId: 'LOC-SECRET-LAIR'}}},
    {entryId: pj.id, pageId: innPage.id, text: '[TEST] Inn', texture: {src: 'icons/svg/castle.svg'}, iconSize: 48, flags: {[MOD]: {locationId: 'LOC-TEST-INN'}}},
    {text: 'native', texture: {src: 'icons/svg/book.svg'}, iconSize: 48}]);
  const {inheritance, unsettled, ...first} = await migrate();
  assert.deepEqual(first, {records: 2, pages: 2, notes: 2});
  assert.deepEqual(inheritance, [], 'no Region was passing conditions');
  const [inn, lair] = readAll();
  assert.deepEqual([inn.state, lair.state], ['revealed', 'hidden']);
  assert.equal(pj.pages.length, 2, 'pages updated in place, so existing notes keep working');
  assert.equal(lairPage.getFlag(MOD, 'pinKey'), lair.pinKey);
  assert.equal(lairNote.pageId, lairPage.id);
  assert.equal(lairNote.getFlag(MOD, 'pinKey'), lair.pinKey);
  assert.equal(lairNote.getFlag(MOD, 'locationId'), null);
  assert.doesNotMatch(JSON.stringify([pj, lairNote]), /SECRET|LOC-SECRET/);
  assert.match(JSON.parse(innPage.getFlag(MOD, 'view')).description, /warm/, 'revealed content is still shown');
  assert.equal(nativeNote.flags, undefined);
  const writes = scene.updates;
  assert.deepEqual(await migrate(), {records: 0, pages: 0, notes: 0, unsettled: 0, inheritance: []});
  assert.equal(scene.updates, writes, 're-running changes nothing');
  assert.equal(gmJournal().getFlag(MOD, 'locations').length, 2);
});

test('the published snapshot is exactly the authored content', () => {
  const loc = normalizeLocation(world()[1]);
  assert.deepEqual(Object.keys(publishable(loc)).includes('sceneUuids'), false, 'linked scenes are GM-only');
  assert.deepEqual(['pinKey', 'state', 'published', 'revealed', 'id'].filter(k => k in publishable(loc)), []);
});
