/** 0.32.0: the GM-only Beasts block. Mocked Foundry: proves the data layer and the markup, not the live window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry, player} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {readAll, writeAll, readViews, placeNote, pageData} from '../scripts/store.mjs';
import {normalizeLocation, playerView, previewView, viewHtml, exportPackage, parseImport, importRecords, hasUnpublishedChanges, publishable, stripGmOnly, BLOCKS, GM_ONLY_BLOCKS, normalizeLayout} from '../scripts/model.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
const {LocationsApp} = await import('../scripts/app.mjs');

const beast = (extra = {}) => ({key: 'b1', label: '[TEST] Ash Wolf', uuid: 'Actor.wolf', docType: 'Actor', sourceId: 'NPC-TEST-WOLF', note: 'Hunts at dusk', ...extra});
const base = (extra = {}) => ({id: 'LOC-TEST-GLADE', name: '[TEST] Glade', description: 'Quiet.', beasts: [beast()], ...extra});

function boot() {
  const game = installFoundry();
  const mod = {version: '0.32.0', active: true};
  mod.api = createApi({version: '0.32.0', isGM: () => game.user.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}});
  game.modules = {get: id => id === 'ashen-gate-locations' ? mod : null};
  game.users = [{id: 'gm', name: 'GM', isGM: true}, {id: 'p1', name: 'Pat', isGM: false}];
  return {game, api: mod.api};
}

test('normalise: same entry shape as People, hidden by default, section off by default, re-runnable', () => {
  const loc = normalizeLocation(base());
  assert.deepEqual(Object.keys(loc.beasts[0]), ['key', 'visible', 'label', 'uuid', 'docType', 'sourceId', 'note']);
  assert.equal(loc.beasts[0].visible, false, 'visible defaults to false');
  assert.equal(loc.sections.beasts, false, 'sections.beasts defaults to false');
  assert.deepEqual(normalizeLocation(loc), loc, 're-normalising changes nothing');
  assert.deepEqual(normalizeLocation({id: 'LOC-TEST-X'}).beasts, []);
  assert.deepEqual(normalizeLocation(base({beasts: [{label: 'no link'}, 'junk', null, beast({sourceId: 'bad id'})]})).beasts.map(b => b.sourceId), [''], 'entries need a uuid or a sourceId; a bad sourceId is dropped');
  assert.equal(normalizeLocation(base({sections: {beasts: true}})).sections.beasts, true, 'the GM may turn the switch on; it still never reaches players (below)');
  assert.ok(BLOCKS.some(b => b.key === 'beasts'));
  assert.ok(normalizeLayout([]).includes('beasts'), 'layout gets the beasts key like other blocks');
  assert.deepEqual([...GM_ONLY_BLOCKS], ['beasts']);
});

test('GM only: never in the published copy, the player view, its HTML, the page flag or the page data, whatever visible / sections say', () => {
  boot();
  const loud = base({state: 'revealed', sections: {beasts: true, npcs: true}, beasts: [beast({visible: true})]});
  const loc = normalizeLocation(loud);
  assert.equal('beasts' in publishable(loc), false);
  assert.equal('beasts' in publishable(loc).sections, false);
  assert.equal('beasts' in loc.published, false, 'the stored published copy has none');
  assert.equal('beasts' in loc.published.sections, false);
  for (const view of [playerView(loc), previewView(loc, [loc], 'revealed')]) {
    assert.equal('beasts' in view, false);
    assert.doesNotMatch(JSON.stringify(view), /Ash Wolf|Actor\.wolf|NPC-TEST-WOLF|Hunts at dusk|beasts/);
    assert.doesNotMatch(viewHtml(view), /Ash Wolf|Beasts|Hunts at dusk/);
  }
  const page = pageData(loc, [loc], {label: '', unknownImg: ''});
  assert.doesNotMatch(JSON.stringify(page), /Ash Wolf|Actor\.wolf|NPC-TEST-WOLF|Hunts at dusk/);
  assert.equal(playerView({...loc, state: 'unidentified'}).beasts, undefined);
});

test('editing Beasts is not an unpublished change (players never see it) and does not touch the published copy', () => {
  const loc = normalizeLocation(base({state: 'revealed'}));
  assert.equal(hasUnpublishedChanges(loc), false);
  const more = {...loc, beasts: [...loc.beasts, beast({key: 'b2', label: 'Another', uuid: 'Actor.other', sourceId: ''})], sections: {...loc.sections, beasts: true}};
  assert.equal(hasUnpublishedChanges(more), false);
  assert.deepEqual(normalizeLocation(more).published, loc.published);
});

test('a player client strips a GM-only block from any view it reads, even a stored page flag that carries one', () => {
  const dirty = {id: 'LOC-X', key: 'k', state: 'revealed', name: 'X', beasts: [beast()], sections: {beasts: true, npcs: true}, layout: ['description', 'beasts', 'npcs']};
  const clean = stripGmOnly(dirty);
  assert.equal('beasts' in clean, false);
  assert.deepEqual(clean.sections, {npcs: true});
  assert.deepEqual(clean.layout, ['description', 'npcs']);
  assert.ok('beasts' in dirty, 'the input is not changed');
  assert.equal(stripGmOnly(null), null);
});

test('API: players never get beasts (views, lists, children); the GM does; saving needs the GM', async () => {
  const { game, api } = boot();
  const saved = await api.saveLocation(base());
  assert.equal(saved.beasts.length, 1);
  await api.setLocationState(saved.id, 'revealed');
  // Plant a hostile page flag: a player client must still not hold it.
  const journal = [...game.journal].find(j => j.getFlag('ashen-gate-locations', 'role') === 'player-view');
  const page = [...journal.pages][0];
  await page.update({'flags.ashen-gate-locations.view': JSON.stringify({id: saved.id, key: saved.pinKey, state: 'revealed', name: 'Glade', beasts: [beast()], sections: {beasts: true}})});
  assert.equal(api.getLocation(saved.id).beasts.length, 1, 'the GM reads them');
  assert.equal(api.listLocations({})[0].beasts.length, 1);
  game.user = player;
  assert.equal(readViews().some(v => 'beasts' in v || JSON.stringify(v).includes('Ash Wolf')), false);
  for (const out of [api.getLocation(saved.id), api.listLocations({}), api.listLocations({includeUnidentified: true}), api.getLocation(saved.pinKey)])
    assert.doesNotMatch(JSON.stringify(out), /Ash Wolf|NPC-TEST-WOLF|beasts/);
  await assert.rejects(() => api.saveLocation(base({beasts: []})), /Only the GM/);
  assert.throws(() => api.exportPackage(), /Only the GM/, 'the export (which carries beasts) is GM only');
  await assert.rejects(async () => api.importLocations([]), /Only the GM/);
});

test('export / import / Manager update round trip keeps beasts; an update without them keeps the world value', () => {
  const loc = normalizeLocation(base({state: 'revealed', sections: {beasts: true}, beasts: [beast({note: 'x'})]}));
  const pkg = exportPackage([loc]);
  assert.equal(pkg.records[0].location.beasts[0].uuid, 'Actor.wolf');
  assert.equal(pkg.records[0].location.sections.beasts, true);
  const back = parseImport(pkg, []).created[0];
  assert.deepEqual(back.beasts, loc.beasts); assert.equal(back.sections.beasts, true);
  assert.ok(back.published && !('beasts' in back.published), 'the imported published copy has none');
  // Manager hands records as {entity_type:'Location', id, location:{...}}; a record author writes beasts and sections.beasts.
  const rec = {entity_type: 'Location', id: 'LOC-TEST-DEN', name: '[TEST] Den', location: {beasts: [{label: 'Bear', uuid: 'Actor.bear'}], sections: {beasts: true}}};
  const made = importRecords([rec], []).created[0];
  assert.equal(made.beasts[0].uuid, 'Actor.bear'); assert.equal(made.beasts[0].visible, false); assert.equal(made.sections.beasts, true);
  const world = normalizeLocation({...made, beasts: [...made.beasts, beast({key: 'extra', uuid: 'Actor.extra', sourceId: ''})], sections: {...made.sections, beasts: false}});
  const noBeasts = {entity_type: 'Location', id: 'LOC-TEST-DEN', name: '[TEST] Den 2', location: {}};
  const kept = importRecords([noBeasts], [world], {mode: 'update'}).updated[0];
  assert.equal(kept.beasts.length, 2, 'additive: a record that leaves beasts out keeps the world list');
  assert.equal(kept.sections.beasts, false, '... and the world switch');
  const replaced = importRecords([{...rec, location: {beasts: [], sections: {beasts: false}}}], [world], {mode: 'update'}).updated[0];
  assert.deepEqual(replaced.beasts, [], 'an explicit empty list replaces it');
});

test('editor: a Beasts block with the hint, the Actor picker, no eye and no player switch; drop links an Actor; a Journal is refused', async () => {
  const { game } = boot();
  const wolf = {documentName: 'Actor', type: 'npc', uuid: 'Actor.wolf', name: '[TEST] Ash Wolf', flags: {}}, bear = {documentName: 'Actor', type: 'npc', uuid: 'Actor.bear', name: '[TEST] Bear', flags: {}};
  game.actors = [wolf, bear];
  const docs = new Map([[wolf.uuid, wolf], [bear.uuid, bear], ['JournalEntry.j', {documentName: 'JournalEntry', uuid: 'JournalEntry.j', name: 'J'}]]);
  globalThis.fromUuidSync = u => docs.get(u) ?? null; globalThis.fromUuid = async u => docs.get(u) ?? null;
  const warned = []; globalThis.ui = {notifications: {info() {}, warn: m => warned.push(m), error() {}}};
  await writeAll([normalizeLocation(base({beasts: [beast()]}))]);
  const app = new LocationsApp(); app.render = async () => {};
  app.select('LOC-TEST-GLADE');
  let html = await app._renderHTML();
  const block = html.slice(html.indexOf('data-block="beasts"'), html.indexOf('data-block="quests"'));
  assert.match(block, /Beasts/);
  assert.match(block, /GM only\. Creatures that may roam here; players never see this list\./);
  assert.match(block, /data-action="add-beast"/); assert.match(block, /id="agl-add-beasts"/);
  assert.match(block, /\[TEST\] Bear/, 'unlinked creature Actors are offered');
  assert.doesNotMatch(block, /data-toggle=/, 'no eye and no Show section to players switch');
  assert.match(block, /data-drop="beasts"/);
  assert.match(html, /data-block="beasts"[\s\S]*data-block="npcs"|data-block="npcs"[\s\S]*data-block="beasts"/);
  await app.onDrop('beasts', {type: 'Actor', uuid: 'Actor.bear'});
  assert.deepEqual(app.draft.beasts.map(b => [b.uuid, b.visible, b.docType]), [['Actor.wolf', false, 'Actor'], ['Actor.bear', false, 'Actor']]);
  await app.onDrop('beasts', {type: 'Actor', uuid: 'Actor.bear'});
  assert.equal(app.draft.beasts.length, 2, 'the same Actor is not linked twice');
  await app.onDrop('beasts', {type: 'JournalEntry', uuid: 'JournalEntry.j'});
  assert.equal(app.draft.beasts.length, 2); assert.match(warned.at(-1), /creature Actor/);
  assert.equal(app.draft.npcs.length, 0, 'People are untouched');
  html = await app._renderHTML();
  assert.match(html, /\[TEST\] Bear/);
});
