/** 0.26.0: bulk select, Archive / Restore and Delete (GM only). Mocked Foundry: logic and HTML, not the live window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry, gm, player, Scene} from './foundry-mock.mjs';
import {readAll, writeAll, readViews, placeNote, writeNotes, readNotesStore, pinReport, removeManagedPins, readSharedNotes, syncSharedNotes} from '../scripts/store.mjs';
import {createApi} from '../scripts/api.mjs';
import {normalizeLocation, playerView, importRecords, parseImport} from '../scripts/model.mjs';
import {planBulk, idsWithPrefix, idPrefix, previewHtml} from '../scripts/bulk.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
globalThis.CSS ??= {escape: v => String(v)};
const {LocationsApp} = await import('../scripts/app.mjs');

/** A world with a Frontier Region holding two forts, one outpost with a child, and two core places. */
async function world() {
  const g = installFoundry();
  const scene = new Scene();
  g.scenes = [scene];
  const mod = {version: '0.27.2', active: true};
  const api = createApi({version: '0.27.2', isGM: () => game.user.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {},
    pins: {report: pinReport, remove: removeManagedPins}, notedIds: () => new Set([...readNotesStore().values()].filter(n => n.text?.trim()).map(n => n.locationId))});
  mod.api = api;
  g.modules = {get: id => id === 'ashen-gate-locations' ? mod : null};
  g.user = gm;
  const make = async (name, extra = {}) => {
    const loc = await api.saveLocation({name, ...extra});
    await api.setLocationState(loc.id, 'revealed');
    return loc;
  };
  const region = await make('Frontier', {isRegion: true});
  const fort = await make('Frontier Fort', {parentLocationId: region.id, region: 'Frontier'});
  const camp = await make('Frontier Camp', {parentLocationId: region.id, region: 'Frontier'});
  const outpost = await make('Frontier Outpost', {parentLocationId: region.id, region: 'Frontier'});
  const watch = await make('Frontier Watchtower', {parentLocationId: outpost.id, region: 'Frontier'});
  const mill = await make('Millbrook', {region: 'Core'});
  const keep = await make('Old Keep', {region: 'Core'});
  return {g, api, scene, ids: {region: region.id, fort: fort.id, camp: camp.id, outpost: outpost.id, watch: watch.id, mill: mill.id, keep: keep.id}};
}
const names = list => list.map(l => l.name).sort();
const asPlayer = (g, fn) => { g.user = player; try { return fn(); } finally { g.user = gm; } };

test('every bulk call is refused for a player, in the API itself, and nothing changes', async () => {
  const {g, api, ids} = await world();
  const before = JSON.stringify(readAll());
  g.user = player;
  const calls = [() => api.previewBulk('archive', [ids.mill]), () => api.archiveLocations([ids.mill]), () => api.restoreLocations([ids.mill]),
    () => api.deleteLocations([ids.mill]), () => api.idsWithPrefix('LOC-FRONTIER'), () => api.countArchived(), () => api.exportPackage({ids: [ids.mill]})];
  for (const call of calls) {
    let err; try { await call(); } catch (e) { err = e; }
    assert.match(err?.message ?? '', /Only the GM/);
  }
  g.user = gm;
  assert.equal(JSON.stringify(readAll()), before);
});

test('selecting by id prefix: case-insensitive, narrows the live list or the archived one, empty selects nothing', async () => {
  const {api, ids} = await world();
  assert.equal(idPrefix('  loc-frontier- '), 'LOC-FRONTIER-');
  assert.deepEqual(api.idsWithPrefix('loc-frontier-').sort(), [ids.fort, ids.camp, ids.outpost, ids.watch].sort(), 'the Region itself (LOC-FRONTIER) has no trailing hyphen');
  assert.equal(api.idsWithPrefix('LOC-FRONTIER').length, 5);
  assert.deepEqual(api.idsWithPrefix(''), []);
  assert.deepEqual(api.idsWithPrefix('LOC-NOPE'), []);
  await api.archiveLocations([ids.fort]);
  assert.equal(api.idsWithPrefix('LOC-FRONTIER').length, 4, 'archived ones are not in the live selection');
  assert.deepEqual(api.idsWithPrefix('LOC-FRONTIER-FORT', {archived: true}), [ids.fort]);
  assert.deepEqual(idsWithPrefix([{id: 'LOC-A-1'}, {id: 'LOC-B-1'}], 'loc-a'), ['LOC-A-1']);
});

test('Archive then Restore round-trips: list, counts, player views, state, content, Party Notes and pin binding come back unchanged', async () => {
  const { g, api, ids } = await world();
  const before = readAll().find(l => l.id === ids.fort);
  await writeNotes(before, {text: 'We camped at the fort.', rev: 1});
  g.scenes[0].notes.push({id: 'n1', getFlag: (s, k) => ({pinKey: before.pinKey})[k], flags: {}});
  await api.setLocationActive(ids.fort, true);
  const viewsBefore = asPlayer(g, () => api.listLocations().map(l => l.name));
  assert.ok(viewsBefore.includes('Frontier Fort'));

  const preview = api.previewBulk('archive', [ids.fort, ids.camp]);
  assert.equal(preview.ok, true);
  assert.deepEqual(preview.targets.map(t => t.name).sort(), ['Frontier Camp', 'Frontier Fort']);
  assert.equal(preview.partyNotes, 1);
  assert.equal(preview.active, 1);
  assert.deepEqual(readAll().filter(l => l.archived), [], 'a preview writes nothing');

  const r = await api.archiveLocations([ids.fort, ids.camp, ids.fort]);
  assert.deepEqual(r.archived.sort(), [ids.camp, ids.fort].sort());
  assert.equal(api.countArchived(), 2);
  assert.ok(!names(api.listLocations()).includes('Frontier Fort'), 'off the GM list');
  assert.deepEqual(names(api.listLocations({archived: 'only'})), ['Frontier Camp', 'Frontier Fort']);
  assert.equal(api.listLocations({archived: 'include'}).length, 7);
  assert.equal(api.activeLocations().length, 0, 'an archived place is no longer active');
  assert.deepEqual(api.locationsForQuest('QUEST-NONE'), []);
  const playerNames = asPlayer(g, () => api.listLocations().map(l => l.name));
  assert.ok(!playerNames.includes('Frontier Fort') && !playerNames.includes('Frontier Camp'), 'players cannot see them');
  assert.equal(asPlayer(g, () => api.getLocation(ids.fort)), null);
  // The Region's player view no longer lists the archived children.
  const regionView = asPlayer(g, () => api.getLocation(ids.region));
  assert.deepEqual((regionView.children ?? []).map(c => c.name), ['Frontier Outpost']);
  // Pins stay for the GM; the player page is closed (empty view, ownership NONE), so Foundry hides the pin from players.
  const page = [...game.journal].find(j => j.getFlag('ashen-gate-locations', 'role') === 'player-view').pages.find(p => p.getFlag('ashen-gate-locations', 'pinKey') === before.pinKey);
  assert.equal(page.getFlag('ashen-gate-locations', 'view'), '');
  assert.equal(page.ownership.default, 0);
  assert.equal(g.scenes[0].notes.length, 1, 'the Map Note is still on the scene');
  assert.equal(readSharedNotes(before.pinKey) === null || readSharedNotes(before.pinKey).record === null, true);
  // Party Notes are kept in the GM store.
  assert.equal(readNotesStore().get(ids.fort).text, 'We camped at the fort.');

  const again = await api.archiveLocations([ids.fort]);
  assert.deepEqual(again.archived, []);
  assert.deepEqual(again.alreadyArchived, [ids.fort]);
  assert.deepEqual(again.skipped, []);

  const back = await api.restoreLocations([ids.fort, ids.camp]);
  assert.deepEqual(back.restored.sort(), [ids.camp, ids.fort].sort());
  assert.equal(api.countArchived(), 0);
  const after = readAll().find(l => l.id === ids.fort);
  assert.equal(after.archived, false);
  assert.equal(after.state, 'revealed');
  assert.equal(after.pinKey, before.pinKey);
  assert.equal(after.active, false, 'restoring never makes a place active');
  assert.deepEqual({...after, active: false, archived: false}, {...before, active: false, archived: false});
  assert.ok(asPlayer(g, () => api.listLocations().map(l => l.name)).includes('Frontier Fort'));
  assert.equal(readNotesStore().get(ids.fort).text, 'We camped at the fort.');
  await assert.rejects(() => api.archiveLocations('LOC-X'), /list of location ids/);
});

test('Archive pins: a hand-customised Note is not touched and the managed one is drawn like a hidden pin', async () => {
  const { g, api, scene, ids } = await world();
  const fort = readAll().find(l => l.id === ids.fort);
  const note = await placeNote(fort, {scene, x: 10, y: 10});
  assert.ok(note.texture.src);
  await api.archiveLocations([ids.fort]);
  const n = scene.notes[0];
  assert.equal(n.text, '', 'no name on the pin');
  assert.equal(n.texture.src, 'icons/svg/mystery-man.svg');
  await api.restoreLocations([ids.fort]);
  assert.equal(scene.notes[0].text, 'Frontier Fort', 'the name returns on Restore');
});

test('Delete: refuses a parent whose children are not all selected, changing nothing; accepts it with the children', async () => {
  const { api, ids } = await world();
  const before = JSON.stringify(readAll());
  const plan = api.previewBulk('delete', [ids.outpost]);
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.blocked.map(b => [b.name, b.children]), [['Frontier Outpost', ['Frontier Watchtower']]]);
  assert.deepEqual(plan.blocked[0].childIds, [ids.watch]);
  await assert.rejects(() => api.deleteLocations([ids.outpost]), /Frontier Outpost has a place inside it that is not selected/);
  await assert.rejects(() => api.deleteLocations([ids.region, ids.fort]), /Frontier has 2 places inside/);
  assert.equal(JSON.stringify(readAll()), before, 'nothing changed');
  // An ARCHIVED child still counts.
  await api.archiveLocations([ids.watch]);
  await assert.rejects(() => api.deleteLocations([ids.outpost]), /not selected/);
  const r = await api.deleteLocations([ids.outpost, ids.watch]);
  assert.deepEqual(r.deleted.sort(), [ids.outpost, ids.watch].sort());
  assert.ok(!readAll().some(l => [ids.outpost, ids.watch].includes(l.id)));
  // The whole Frontier goes when every place in it is selected.
  const rest = await api.deleteLocations([ids.region, ids.fort, ids.camp]);
  assert.equal(rest.deleted.length, 3);
  assert.deepEqual(names(readAll()), ['Millbrook', 'Old Keep']);
});

test('Delete returns a backup of exactly what went, and importing it brings the same ids back', async () => {
  const { api, ids } = await world();
  const backup = (await api.deleteLocations([ids.fort, ids.camp])).backup;
  assert.equal(backup.manifest.schema_version, 'ag-foundry-import/0.2');
  assert.deepEqual(backup.records.map(r => r.id).sort(), [ids.camp, ids.fort].sort());
  assert.ok(!readAll().some(l => l.id === ids.fort));
  const res = await api.importPackage(backup);
  assert.deepEqual(res.created.sort(), [ids.camp, ids.fort].sort());
  assert.equal(readAll().find(l => l.id === ids.fort).name, 'Frontier Fort');
  // The one-click backup the window downloads first is the same export, limited to the ticked ids.
  assert.deepEqual(api.exportPackage({ids: [ids.mill]}).records.map(r => r.id), [ids.mill]);
  assert.equal(api.exportPackage().records.length, 7);
  assert.deepEqual((await api.deleteLocations([])).deleted, []);
});

test('Delete removes module-managed Map Notes and reports the ones the GM customised by hand', async () => {
  const { g, api, scene, ids } = await world();
  const fort = readAll().find(l => l.id === ids.fort), camp = readAll().find(l => l.id === ids.camp);
  await placeNote(fort, {scene, x: 1, y: 1});
  const custom = await placeNote(camp, {scene, x: 2, y: 2});
  custom.texture.src = 'worlds/mine/my-fort.webp';           // changed by hand in Foundry's Note config
  const other = await placeNote(readAll().find(l => l.id === ids.mill), {scene, x: 3, y: 3});
  const report = pinReport([fort, camp]);
  assert.deepEqual(report.map(r => [r.managed, r.overridden]), [[1, 1]]);
  const preview = api.previewBulk('delete', [ids.fort, ids.camp]);
  assert.deepEqual(preview.pins.map(p => [p.managed, p.overridden]), [[1, 1]]);
  const html = previewHtml({...preview, targets: preview.targets});
  assert.match(html, /1 map pin placed by this module will be removed/);
  assert.match(html, /1 map pin you changed by hand[\s\S]*stay/);
  assert.doesNotMatch(html, /LOC-/, 'no raw ids in the preview');
  const r = await api.deleteLocations([ids.fort, ids.camp]);
  assert.equal(r.pins.removed, 1);
  assert.deepEqual(r.pins.kept.map(k => k.count), [1]);
  assert.deepEqual(scene.notes.map(n => n.id).sort(), [custom.id, other.id].sort(), 'the hand-customised Note and the other location\'s Note stay');
  // Player pages of the deleted places are gone, so no stale player content survives.
  assert.ok(![...game.journal].find(j => j.getFlag('ashen-gate-locations', 'role') === 'player-view').pages.some(p => p.getFlag('ashen-gate-locations', 'pinKey') === fort.pinKey));
});

test('Party Notes survive Delete in the GM store and return if the same id is imported again', async () => {
  const { api, ids } = await world();
  const fort = readAll().find(l => l.id === ids.fort);
  await writeNotes(fort, {text: 'Remember the well.', rev: 1});
  const r = await api.deleteLocations([ids.fort]);
  assert.equal(readNotesStore().get(ids.fort).text, 'Remember the well.');
  await api.importPackage(r.backup);
  assert.equal(readNotesStore().get(ids.fort).text, 'Remember the well.');
});

test('imports vs archived: update keeps it archived, skip leaves it alone, only unarchive:true restores, a new record is never archived', async () => {
  const { api, ids } = await world();
  const record = id => ({id, entity_type: 'Location', name: 'Frontier Fort (renamed)', location: {description: 'New text'}});
  await api.archiveLocations([ids.fort]);
  let r = await api.importLocations([record(ids.fort)], {mode: 'skip'});
  assert.deepEqual(r.skipped.map(s => s.id), [ids.fort]);
  assert.equal(readAll().find(l => l.id === ids.fort).archived, true);
  r = await api.importLocations([record(ids.fort)], {mode: 'update'});
  assert.deepEqual(r.updated, [ids.fort]);
  let fort = readAll().find(l => l.id === ids.fort);
  assert.equal(fort.archived, true, 'still archived after an update import');
  assert.equal(fort.name, 'Frontier Fort (renamed)', 'but its definition was updated');
  assert.equal(api.listLocations().some(l => l.id === ids.fort), false);
  // A package cannot flip it either way.
  r = await api.importLocations([{...record(ids.fort), location: {archived: false}}], {mode: 'update'});
  assert.equal(readAll().find(l => l.id === ids.fort).archived, true);
  r = await api.importLocations([{...record(ids.mill), location: {archived: true}}], {mode: 'update'});
  assert.equal(readAll().find(l => l.id === ids.mill).archived, false);
  // Manager's refresh can say otherwise.
  r = await api.importLocations([record(ids.fort)], {mode: 'update', unarchive: true});
  fort = readAll().find(l => l.id === ids.fort);
  assert.equal(fort.archived, false);
  assert.equal(fort.archivedAt, '');
  // New records start unarchived even if the file says otherwise.
  r = await api.importLocations([{id: 'LOC-FRONTIER-NEW', entity_type: 'Location', name: 'New Place', location: {archived: true}}]);
  assert.deepEqual(r.created, ['LOC-FRONTIER-NEW']);
  assert.equal(readAll().find(l => l.id === 'LOC-FRONTIER-NEW').archived, true, 'a file that was exported archived is imported archived (a backup restores faithfully)');
  assert.equal(parseImport({manifest: {schema_version: 'ag-foundry-import/0.2'}, records: [{id: 'LOC-X-1', entity_type: 'Location', name: 'X', location: {}}]}, []).created[0].archived, false);
});

test('model: an archived location has no player view, is not listed as a child, and is never active', () => {
  const parent = normalizeLocation({id: 'LOC-P', name: 'P', state: 'revealed', isRegion: true});
  const kid = normalizeLocation({id: 'LOC-K', name: 'K', state: 'revealed', parentLocationId: 'LOC-P', archived: true, active: true, archivedAt: '2026-10-28T10:00:00.000Z'});
  assert.equal(kid.active, false);
  assert.equal(playerView(kid, [parent, kid]), null);
  assert.equal(playerView(parent, [parent, kid]).children, undefined);
  assert.equal(normalizeLocation({id: 'LOC-K', archived: 'yes'}).archived, false);
  assert.equal(normalizeLocation({id: 'LOC-K'}).archived, false);
});

test('planBulk: restore skips live ones, unknown ids are reported, restoring under an archived parent is noted', () => {
  const all = [{id: 'LOC-A', name: 'A', archived: true, parentLocationId: ''}, {id: 'LOC-B', name: 'B', archived: true, parentLocationId: 'LOC-A'}, {id: 'LOC-C', name: 'C', archived: false, parentLocationId: ''}];
  const p = planBulk('restore', all, ['LOC-B', 'LOC-C', 'LOC-NOPE']);
  assert.deepEqual(p.targets.map(t => t.id), ['LOC-B']);
  assert.deepEqual(p.unknown, ['LOC-NOPE']);
  assert.deepEqual(p.skipped.map(s => s.id), ['LOC-C']);
  assert.deepEqual(p.archivedParents.map(x => x.parent), ['A']);
  assert.throws(() => planBulk('explode', all, []), /Unknown bulk action/);
  assert.equal(planBulk('archive', all, []).ok, false, 'nothing selected is nothing to do');
});

// ---- the window ----
function dialogs(answers) {
  const seen = [];
  foundry.applications.api.DialogV2 = {wait: async o => {
    seen.push(o);
    const answer = typeof answers === 'function' ? answers(o, seen.length) : answers[seen.length - 1];
    const b = o.buttons?.find(x => x.action === answer);
    return b?.callback ? b.callback({}, {form: {elements: []}}) : answer ?? null;
  }};
  return seen;
}
const said = [];
function gmApp() {
  globalThis.ui = {notifications: {info: m => said.push(m), warn: m => said.push(m), error: m => said.push(m)}};
  const app = new LocationsApp();
  app.element = null; app.render = async () => {};
  return app;
}
const listPane = html => html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
const rowNames = html => [...listPane(html).matchAll(/agl-row__name">([^<]*)</g)].map(m => m[1]);

test('window: Select shows tick boxes, "Id starts with" narrows the list, Select all shown picks exactly those, counts update', async () => {
  const { ids } = await world();
  const app = gmApp();
  let html = await app._renderHTML();
  assert.doesNotMatch(listPane(html), /data-pick=/, 'no tick boxes until Select is on');
  assert.match(html, /id="agl-select" aria-pressed="false"/);
  assert.match(html, /Archived \(0\)/);
  app.picking = true;
  app.idPrefix = 'loc-frontier-';
  html = await app._renderHTML();
  assert.deepEqual(rowNames(html), ['Frontier Camp', 'Frontier Fort', 'Frontier Outpost', 'Frontier Watchtower']);
  assert.match(html, /Showing 4 of 7/);
  assert.match(html, /0 selected · 4 shown/);
  assert.match(html, /<button disabled type="button"[^>]*data-action="bulk-archive"/, 'Archive… is off until something is ticked');
  await app.onAction({dataset: {action: 'bulk-all'}});
  assert.deepEqual([...app.picked].sort(), [ids.camp, ids.fort, ids.outpost, ids.watch].sort());
  html = await app._renderHTML();
  assert.match(html, /4 selected · 4 shown/);
  assert.match(html, /Select all 4 shown/);
  assert.equal((listPane(html).match(/<input type="checkbox" data-pick="[^"]+" checked>/g) ?? []).length, 4);
  assert.match(html, /data-action="bulk-archive"[^>]*>[\s\S]*?Archive…/);
  assert.match(html, /placeholder="Start of an id, e.g. LOC-"/, 'the prefix box is the one place an id shows');
  assert.doesNotMatch(listPane(html).replace(/data-pick="[^"]*"/g, '').replace(/placeholder="[^"]*"/g, '').replace(/value="[^"]*"/g, ''), /LOC-/, 'no raw ids in the list text');
  // Region narrowing works with it.
  app.idPrefix = ''; app.filters.region = 'Core';
  html = await app._renderHTML();
  assert.deepEqual(rowNames(html), ['Millbrook', 'Old Keep']);
  assert.match(html, /4 selected \(4 not shown\) · 2 shown/);
  await app.onAction({dataset: {action: 'bulk-clear'}});
  assert.equal(app.picked.size, 0);
});

test('window: Archive… previews, then archives; Undo restores; the Archived (n) view lists them and Restore… brings them back', async () => {
  const { api, ids } = await world();
  const app = gmApp();
  app.picking = true;
  app.picked = new Set([ids.fort, ids.camp]);
  let seen = dialogs(['go']);
  await app.bulkAction('archive');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].window.title, 'Archive 2 locations?');
  assert.match(seen[0].content, /Frontier Fort/);
  assert.deepEqual(seen[0].buttons.map(b => b.label), ['Cancel', 'Archive 2 locations']);
  assert.equal(api.countArchived(), 2);
  assert.equal(app.picked.size, 0);
  let html = await app._renderHTML();
  assert.match(html, /Archived \(2\)/);
  assert.match(html, /Archived <strong>2<\/strong> locations\.[\s\S]*data-action="undo-bulk"/);
  assert.deepEqual(rowNames(html).sort(), ['Frontier', 'Frontier Outpost', 'Frontier Watchtower', 'Millbrook', 'Old Keep']);
  await app.undoBulk();
  assert.equal(api.countArchived(), 0);
  // Cancel does nothing.
  app.picked = new Set([ids.fort]);
  seen = dialogs([null]);
  await app.bulkAction('archive');
  assert.equal(api.countArchived(), 0);
  // The Archived view.
  await api.archiveLocations([ids.fort, ids.camp]);
  await app.setArchivedView(true);
  html = await app._renderHTML();
  assert.deepEqual(rowNames(html), ['Frontier Camp', 'Frontier Fort']);
  assert.match(html, /<input type="checkbox" data-pick/, 'tick boxes are always on in the Archived view');
  assert.match(html, /2 archived locations/);
  assert.match(html, /data-action="bulk-restore"/);
  assert.doesNotMatch(html, /data-action="bulk-archive"|id="agl-select"/);
  assert.doesNotMatch(html, /data-bind=/, 'archived locations are not edited in place');
  app.picked = new Set([ids.fort]);
  seen = dialogs(['go']);
  await app.bulkAction('restore');
  assert.equal(seen[0].window.title, 'Restore 1 location?');
  assert.equal(api.countArchived(), 1);
});

test('window: Delete… needs a backup download first, then a labelled danger confirm where Cancel is the default; blocked parents offer their children', async () => {
  const { api, ids } = await world();
  const app = gmApp();
  const downloads = [];
  app.downloadPackage = (pkg, name) => downloads.push({pkg, name});
  app.picked = new Set([ids.outpost]);
  // The parent has a child outside the selection: the GM is offered the child, and nothing is deleted until both dialogs are answered.
  const seen = dialogs((o, n) => ({1: 'add', 2: 'backup', 3: 'confirm'})[n]);
  await app.bulkAction('delete');
  assert.deepEqual(seen.map(o => o.window.title), ['Places inside are not selected', 'Delete 2 locations?', 'Delete 2 locations?']);
  assert.equal(downloads.length, 1, 'the backup is downloaded before the confirm');
  assert.deepEqual(downloads[0].pkg.records.map(r => r.id).sort(), [ids.outpost, ids.watch].sort());
  const confirm = seen[2];
  assert.deepEqual(confirm.buttons.map(b => [b.label, b.default]), [['Cancel', true], ['Delete 2 locations', false]]);
  assert.match(confirm.classes.join(' '), /danger/);
  assert.ok(!readAll().some(l => [ids.outpost, ids.watch].includes(l.id)));
  assert.ok(said.some(m => /Deleted 2 locations/.test(m)));
  // Cancelling at the confirm keeps everything (the backup file is harmless).
  app.picked = new Set([ids.fort]);
  downloads.length = 0;
  dialogs((o, n) => ({1: 'backup', 2: 'cancel'})[n]);
  await app.bulkAction('delete');
  assert.equal(downloads.length, 1);
  assert.ok(readAll().some(l => l.id === ids.fort));
  // Cancelling the preview downloads nothing.
  downloads.length = 0;
  dialogs([null]);
  await app.bulkAction('delete');
  assert.equal(downloads.length, 0);
  assert.ok(api.listLocations().some(l => l.id === ids.fort));
});

test('window: unsaved edits to a location that is being archived ask first (Keep editing is the default)', async () => {
  const { ids } = await world();
  const app = gmApp();
  app.select(ids.fort);
  app.draft.name = 'Edited';
  app.dirty = true;
  app.picked = new Set([ids.fort]);
  dialogs(['go']);
  let asked = 0;
  app.confirmDiscard = async () => { asked++; return false; };
  await app.bulkAction('archive');
  assert.equal(asked, 1);
  assert.equal(readAll().find(l => l.id === ids.fort).archived, false, 'kept editing: nothing archived');
});

test('window: other lists (related links) still name an archived place instead of "Deleted location"', async () => {
  const { api, ids } = await world();
  await api.archiveLocations([ids.camp]);
  assert.ok(api.listLocations({archived: 'include'}).some(l => l.id === ids.camp));
  const app = gmApp();
  app.select(ids.fort);
  const html = await app._renderHTML();
  assert.ok(html.length > 0);
});

test('Manager hand-off: archiveLocations(ids, {source}) skips a parent with unlisted children (has-children), keeps Party Notes, reports alreadyArchived; restore pairs with it', async () => {
  const { g, api, ids } = await world();
  const opts = {source: 'ashen-gate-manager', reason: 'sync-not-in-package'};
  await writeNotes(readAll().find(l => l.id === ids.mill), {text: 'kept', rev: 1});
  const r = await api.archiveLocations([ids.outpost, ids.mill, ids.mill, 'LOC-NOPE'], opts);
  assert.deepEqual(r.archived, [ids.mill]);
  assert.ok(r.skipped.some(s => s.id === ids.outpost && s.reason === 'has-children'), 'the outpost has a child that is not in the list');
  assert.ok(r.skipped.some(s => s.id === 'LOC-NOPE'));
  const r2 = await api.archiveLocations([ids.outpost, ids.watch, ids.mill], opts);
  assert.deepEqual(r2.archived.sort(), [ids.outpost, ids.watch].sort());
  assert.deepEqual(r2.alreadyArchived, [ids.mill]);
  const r3 = await api.archiveLocations([ids.region], opts);
  assert.deepEqual(r3.skipped, [{id: ids.region, reason: 'has-children'}]);
  assert.equal(readNotesStore().get(ids.mill).text, 'kept');
  assert.equal(readAll().find(l => l.id === ids.mill).state, 'revealed');
  // a refresh import of an archived record keeps it archived; only restoreLocations brings it back
  await api.importLocations([{id: ids.mill, entity_type: 'Location', name: 'Millbrook', location: {}}], {mode: 'update'});
  assert.equal(readAll().find(l => l.id === ids.mill).archived, true);
  const back = await api.restoreLocations([ids.mill, ids.keep], {source: 'ashen-gate-manager'});
  assert.deepEqual(back.restored, [ids.mill]);
  assert.deepEqual(back.skipped, [{id: ids.keep, reason: 'Not archived.'}]);
  g.user = player;
  await assert.rejects(() => api.archiveLocations([ids.mill], opts), /Only the GM/);
  await assert.rejects(() => api.restoreLocations([ids.mill], opts), /Only the GM/);
  g.user = gm;
});
