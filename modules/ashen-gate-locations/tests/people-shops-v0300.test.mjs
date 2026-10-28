/** 0.30.0: "People here" (links to NPC Actors, suggestions from General Manager records) and "Shops here" / the player's Shops card
 *  (through Ashen Gate | Utilities' API). Mocked Foundry and a mocked Utilities: proves the logic and the markup, not the live windows. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry, gm, player} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {readAll, writeAll, readViews, placeNote} from '../scripts/store.mjs';
import {normalizeLocation, playerView, previewView, viewHtml, exportPackage, parseImport, importRecords, hasUnpublishedChanges, publishable, NPC_ID} from '../scripts/model.mjs';
import {placesOfSource, actorFacts, npcSuggestions, resolveLinked, relinkPlan, applyRelink, shopsApiState, shopsHere, shopsForPlayer, shownText} from '../scripts/people-shops.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
const {LocationsApp} = await import('../scripts/app.mjs');

const LOC = 'LOC-TEST-INN', KIDS = 'LOC-TEST-CELLAR';
const npc = (id, name, extra = {}) => ({documentName: 'Actor', type: 'npc', uuid: `Actor.${id}`, name, flags: {}, ...extra});
const managed = (id, name, source, extra = {}) => npc(id, name, {flags: {'ashen-gate-manager': {source: {sourceId: `NPC-TEST-${id.toUpperCase()}`, ...source}}}, ...extra});

/* ---------------- pure: the NPC matcher ---------------- */
test('placesOfSource: found_at and friends place an NPC, related only mentions the place, location_id counts, junk is ignored', () => {
  const places = placesOfSource({refs: [{relation: 'related', target_id: 'LOC-TEST-A'}, {relation: 'found_at', target_id: 'LOC-TEST-B', mode: 'optional'}, {relation: 'for_faction', target_id: 'FAC-TEST-X'},
    'LOC-TEST-C', {relation: 'found_at', target_id: 'not an id'}, {relation: 'related', target_id: 'LOC-TEST-B'}], definition: {location_id: 'LOC-TEST-D', refs: [{relation: 'based_at', target_id: 'LOC-TEST-E'}]}});
  assert.deepEqual(places.map(p => [p.locationId, p.relation, p.placed]), [['LOC-TEST-B', 'found_at', true], ['LOC-TEST-E', 'based_at', true], ['LOC-TEST-D', 'location_id', true],
    ['LOC-TEST-A', 'related', false], ['LOC-TEST-C', 'related', false]], 'placed first; B stays placed although it is also related');
  assert.deepEqual(placesOfSource(null), []);
  assert.deepEqual(placesOfSource({refs: 'nope', definition: 5}), []);
});

test('suggestions: only Manager NPCs whose record names this place, strongest first; linked, player, archived and backup Actors are left out', () => {
  const docs = [
    managed('mira', '[TEST] Mira', {refs: [{relation: 'found_at', target_id: LOC}]}),
    managed('bram', '[TEST] Bram', {refs: [{relation: 'related', target_id: LOC}]}),
    managed('away', '[TEST] Away', {refs: [{relation: 'found_at', target_id: 'LOC-TEST-ELSEWHERE'}]}),
    managed('done', '[TEST] Already', {refs: [{relation: 'found_at', target_id: LOC}]}),
    managed('hero', '[TEST] Hero', {refs: [{relation: 'found_at', target_id: LOC}]}, {type: 'character'}),
    managed('old', '[TEST] Archived', {refs: [{relation: 'found_at', target_id: LOC}]}, {flags: {'ashen-gate-manager': {source: {sourceId: 'NPC-TEST-OLD', refs: [{relation: 'found_at', target_id: LOC}]}, lifecycle: {archived: true}}}}),
    managed('bak', '[TEST] Backup', {refs: [{relation: 'found_at', target_id: LOC}]}, {flags: {'ashen-gate-manager': {source: {sourceId: 'NPC-TEST-BAK', refs: [{relation: 'found_at', target_id: LOC}]}}, 'ashen-gate-character-hub': {levelBackup: true}}}),
    npc('plain', '[TEST] Plain Actor'),
    managed('fromdef', '[TEST] Zed', {definition: {location_id: LOC}})
  ];
  const linked = [{uuid: 'Actor.done', sourceId: ''}];
  const out = npcSuggestions(docs, LOC, linked);
  assert.deepEqual(out.map(o => [o.name, o.placed]), [['[TEST] Mira', true], ['[TEST] Zed', true], ['[TEST] Bram', false]]);
  assert.equal(out[0].sourceId, 'NPC-TEST-MIRA');
  assert.deepEqual(npcSuggestions(docs, LOC, [...linked, {uuid: '', sourceId: 'NPC-TEST-MIRA'}]).map(o => o.name), ['[TEST] Zed', '[TEST] Bram'], 'linked by NPC id counts as linked');
  assert.deepEqual(npcSuggestions(docs, 'LOC-TEST-NOWHERE'), []);
  assert.deepEqual(npcSuggestions([], LOC), []);
  assert.equal(actorFacts(managed('x', 'X', {})).sourceId, 'NPC-TEST-X');
  assert.equal(actorFacts(npc('y', 'Y')).sourceId, '');
});

test('re-bind: a link whose Actor was re-imported (new uuid, same NPC id) is offered a re-link; an ambiguous or missing id is not', () => {
  const mira2 = managed('mira2', '[TEST] Mira', {refs: []}, {flags: {'ashen-gate-manager': {source: {sourceId: 'NPC-TEST-MIRA'}}}});
  const entries = [{key: 'a', uuid: 'Actor.gone', docType: 'Actor', sourceId: 'NPC-TEST-MIRA', label: 'Mira'}, {key: 'b', uuid: 'Actor.gone2', sourceId: '', label: 'No id'},
    {key: 'c', uuid: 'Actor.alive', sourceId: 'NPC-TEST-MIRA', label: 'Still there'}, {key: 'd', uuid: 'Actor.gone3', sourceId: 'NPC-TEST-MISSING', label: 'Missing'}];
  const exists = uuid => uuid === 'Actor.alive';
  const plan = relinkPlan(entries, [mira2], exists);
  assert.deepEqual(plan, [{key: 'a', uuid: 'Actor.mira2', docType: 'Actor', name: '[TEST] Mira'}]);
  const next = applyRelink(entries, plan);
  assert.equal(next[0].uuid, 'Actor.mira2'); assert.equal(entries[0].uuid, 'Actor.gone', 'the input is not changed'); assert.equal(next[0].label, 'Mira');
  assert.deepEqual(relinkPlan(entries, [mira2, managed('twin', 'Twin', {}, {flags: {'ashen-gate-manager': {source: {sourceId: 'NPC-TEST-MIRA'}}}})], exists), [], 'two Actors with the id: no guess');
  assert.equal(resolveLinked({uuid: 'Actor.mira2'}, [mira2]).rebound, false);
  assert.equal(resolveLinked({uuid: 'Actor.gone', sourceId: 'NPC-TEST-MIRA'}, [mira2]).rebound, true);
  assert.equal(resolveLinked({uuid: 'Actor.gone'}, [mira2]), null);
});

/* ---------------- model: the People section ---------------- */
const person = (o = {}) => ({key: 'p1', label: '[TEST] Mira', uuid: 'Actor.mira', docType: 'Actor', sourceId: 'NPC-TEST-MIRA', note: 'The clerk', ...o});
const inn = (o = {}) => normalizeLocation({id: LOC, name: '[TEST] Inn', state: 'revealed', sections: {npcs: true}, npcs: [person(), person({key: 'p2', label: '[TEST] Secret', uuid: 'Actor.secret', sourceId: 'NPC-TEST-SECRET', visible: true, note: ''})], ...o});

test('People entries are GM only by default (entry and section), keep the NPC id beside the uuid, and old data has none', () => {
  const loc = inn();
  assert.equal(loc.npcs[0].visible, false, 'a new link starts hidden');
  assert.equal(loc.npcs[1].visible, true);
  assert.equal(loc.npcs[0].sourceId, 'NPC-TEST-MIRA');
  assert.equal(normalizeLocation({id: LOC, name: 'x'}).sections.npcs, false);
  assert.deepEqual(normalizeLocation({id: LOC, name: 'x'}).npcs, [], 'a record from before 0.30.0 has no people');
  assert.deepEqual(normalizeLocation({id: LOC, name: 'x', npcs: [{key: 'k'}, {key: 'j', uuid: '', sourceId: 'not-an-id'}, 5, null]}).npcs, [], 'nothing to link to is dropped');
  const byId = normalizeLocation({id: LOC, name: 'x', npcs: [{key: 'k', sourceId: 'NPC-TEST-ONLY'}]}).npcs;
  assert.equal(byId.length, 1, 'a link kept by NPC id alone survives (it re-binds later)');
  assert.ok(NPC_ID.test('NPC-TEST-ONLY'));
  assert.equal(normalizeLocation(loc).npcs.length, 2, 'normalising twice changes nothing');
  assert.deepEqual(normalizeLocation(normalizeLocation(loc)).npcs, normalizeLocation(loc).npcs);
});

test('players get only visible people of a revealed location, with the GM-written name and note: no NPC id, no hidden entry', () => {
  const loc = inn();
  const view = playerView(loc, [loc]);
  assert.deepEqual(view.npcs, [{label: '[TEST] Secret', uuid: 'Actor.secret', docType: 'Actor', note: ''}], 'only the entry whose eye is on');
  assert.deepEqual(view.layout.filter(k => k === 'npcs'), ['npcs']);
  const text = JSON.stringify(view);
  for (const leak of ['NPC-TEST', 'sourceId', 'Mira', 'The clerk']) assert.equal(text.includes(leak), false, leak);
  const off = inn({sections: {npcs: false}});
  assert.equal(playerView(off, [off]).npcs, undefined, 'the section switch hides all of them');
  const hiddenLoc = inn({state: 'hidden', published: null});
  assert.equal(playerView(hiddenLoc, [hiddenLoc]), null, 'a hidden location gives a player nothing');
  const unident = inn({state: 'unidentified'});
  assert.equal(JSON.stringify(playerView(unident, [unident])).includes('Secret'), false);
  const arch = inn({archived: true});
  assert.equal(playerView(arch, [arch]), null);
  assert.equal(JSON.stringify(previewView(inn({sections: {npcs: true}}), [], 'revealed')).includes('NPC-TEST'), false);
});

test('Publish rules: people are part of the published content, so an edit shows as unpublished until Publish', () => {
  const loc = inn();
  assert.equal(hasUnpublishedChanges(loc), false);
  const edited = {...loc, npcs: loc.npcs.map(n => ({...n, visible: true}))};
  assert.equal(hasUnpublishedChanges(edited), true);
  assert.equal(playerView(edited, [edited]).npcs.length, 1, 'players still see the published version');
  const published = {...edited, published: publishable(edited)};
  assert.equal(playerView(published, [published]).npcs.length, 2);
  const old = normalizeLocation({id: LOC, name: 'Old', state: 'revealed', published: {name: 'Old'}});
  assert.equal(hasUnpublishedChanges(old), false, 'content published before 0.30.0 is not flagged');
});

test('the Journal page lists visible people by name only: no link, no id', () => {
  const loc = inn({npcs: [person({visible: true, note: 'The clerk'})]});
  const html = viewHtml(playerView(loc, [loc]));
  assert.match(html, /<h2>People<\/h2><ul><li>\[TEST\] Mira: The clerk<\/li><\/ul>/);
  assert.doesNotMatch(html, /NPC-TEST|Actor\.mira|href/);
});

test('export / import round trip keeps people and their NPC ids; an update that leaves them out keeps the world\'s; additive import never clears them', () => {
  const loc = inn();
  const pkg = JSON.parse(JSON.stringify(exportPackage([loc])));
  const [copy] = parseImport(pkg, []).created;
  assert.deepEqual(copy.npcs, loc.npcs);
  assert.equal(copy.sections.npcs, true);
  assert.equal(copy.npcs[0].visible, false, 'hidden stays hidden');
  // An update from a package that has no people (an older export or a hand-written record) leaves the world's alone.
  const rec = JSON.parse(JSON.stringify(exportPackage([loc]).records[0]));
  delete rec.location.npcs; delete rec.location.sections.npcs; rec.location.description = 'changed';
  const r = importRecords([rec], [loc], {mode: 'update'});
  assert.equal(r.updated[0].description, 'changed');
  assert.deepEqual(r.updated[0].npcs, loc.npcs);
  assert.equal(r.updated[0].sections.npcs, true);
  // A package that carries a different list replaces it.
  const rec2 = JSON.parse(JSON.stringify(exportPackage([loc]).records[0])); rec2.location.npcs = [person({key: 'z', uuid: 'Actor.new', sourceId: 'NPC-TEST-NEW', label: '[TEST] New'})];
  assert.deepEqual(importRecords([rec2], [loc], {mode: 'update'}).updated[0].npcs.map(n => n.label), ['[TEST] New']);
  // 'skip' leaves the existing one untouched.
  assert.equal(importRecords([rec2], [loc], {mode: 'skip'}).skipped.length, 1);
  assert.equal(JSON.stringify(parseImport({manifest: pkg.manifest, records: [{...pkg.records[0], location: {...pkg.records[0].location, npcs: 'junk'}}]}, []).created[0].npcs), '[]');
});

/* ---------------- shops through a mocked Utilities ---------------- */
function utilities({shops = [], old = false, fail = false, extra = {}} = {}) {
  const calls = [], me = {isGM: true};
  const state = shops.map(s => ({kind: 'shop', merchant: 'A', presented: false, mode: null, count: 0, locationId: LOC, ...s}));
  const api = {
    list: () => [], open: async id => { calls.push(['open', id]); },
    present: async (id, opt) => { if (!game.user.isGM) throw new Error('GM only.'); calls.push(['present', id, opt]); const s = state.find(x => x.id === id); Object.assign(s, {presented: true, mode: opt.mode, count: opt.userIds?.length ?? 0}); },
    stopShowing: async id => { if (!game.user.isGM) throw new Error('GM only.'); calls.push(['stop', id]); Object.assign(state.find(x => x.id === id), {presented: false, mode: null, count: 0}); },
    forMe: () => { if (fail) throw new Error('The GM has turned shops off.'); return state.filter(s => s.presented && (s.mode === 'all' || (s.userIds ?? []).includes(game.user.id))).map(s => ({id: s.id, name: s.name, merchant: {name: s.merchant}, kind: s.kind, ...(s.placeKey ? {placeKey: s.placeKey} : {})})); },
    ...extra
  };
  if (!old) api.atPlace = (id, {includeChildren} = {}) => { if (!game.user.isGM) throw new Error('GM only.'); if (fail) throw new Error('boom');
    return state.filter(s => s.locationId === id || (includeChildren && s.locationId === KIDS)).map(({id, name, merchant, kind, presented, mode, count}) => ({id, name, merchant, kind, presented, mode, count})); };
  return {mod: {active: true, api: {shops: api}}, calls, state, me};
}
let access = true;
async function world({util, locs = []} = {}) {
  const game = installFoundry();
  const mod = {version: '0.30.0', active: true};
  mod.api = createApi({version: '0.30.0', isGM: () => game.user.isGM, playerAccessEnabled: () => access, setPlayerAccess: async v => { access = v; },
    readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}});
  const docs = new Map();
  globalThis.fromUuidSync = uuid => docs.get(uuid) ?? null;
  globalThis.fromUuid = async uuid => docs.get(uuid) ?? null;
  game.actors = [];
  game.journal = game.journal ?? [];
  game.users = [{id: 'gm', name: 'GM', isGM: true}, {id: 'p1', name: 'Pat', isGM: false}, {id: 'p2', name: 'Quinn', isGM: false}];
  game.modules = {get: id => id === 'ashen-gate-locations' ? mod : id === 'ashen-gate-utilities' ? util : null};
  game.ui = undefined;
  globalThis.ui = {notifications: {info() {}, warn() {}, error() {}}};
  await writeAll(locs);
  return {game, docs};
}
const innRecord = () => inn({id: LOC, npcs: [person({visible: true, uuid: 'Actor.mira'}), person({key: 'p2', label: '[TEST] Secret', uuid: 'Actor.secret', sourceId: 'NPC-TEST-SECRET', visible: false})]});
const ownedBy = (uuid, name, level) => ({uuid, name, documentName: 'Actor', testUserPermission: (u, need) => u.isGM || level >= ({LIMITED: 1, OBSERVER: 2, OWNER: 3})[need]});

test('feature detection: no Utilities, an older Utilities without atPlace, and a current one', () => {
  installFoundry();
  const none = {get: () => null};
  assert.equal(shopsApiState(none).state, 'inactive');
  assert.deepEqual(shopsHere(none, LOC), {state: 'inactive', rows: []});
  assert.equal(shopsApiState({get: () => ({active: false, api: {shops: {present() {}}}})}).state, 'inactive', 'installed but not active');
  assert.equal(shopsApiState({get: () => ({active: true, api: {}})}).state, 'inactive');
  const oldU = utilities({old: true, shops: [{id: 'SHOP-A', name: '[TEST] A', placeKey: 'k'}]});
  assert.equal(shopsApiState({get: () => oldU.mod}).state, 'old');
  assert.deepEqual(shopsHere({get: () => oldU.mod}, LOC), {state: 'old', rows: []});
  const cur = utilities({shops: [{id: 'SHOP-A', name: '[TEST] A'}]});
  const mods = {get: () => cur.mod};
  assert.equal(shopsApiState(mods).state, 'ok');
  assert.deepEqual(shopsHere(mods, LOC).rows.map(r => [r.id, r.shown]), [['SHOP-A', 'Not shown to players']]);
  assert.deepEqual(shopsHere(mods, 'not an id'), {state: 'ok', rows: []});
  const bad = utilities({fail: true, shops: [{id: 'SHOP-A', name: 'A'}]});
  assert.equal(shopsHere({get: () => bad.mod}, LOC).state, 'error', 'a failing Utilities never throws into Locations');
  assert.equal(shownText({presented: true, mode: 'users', count: 2}), 'Shown to 2 players');
  assert.equal(shownText({presented: true, mode: 'users', count: 1}), 'Shown to 1 player');
  assert.equal(shownText({presented: true, mode: 'all'}), 'Shown to all players');
});

test('GM editor: Shops here lists the shops, Present… / Open, Stop showing only while shown, and says so when Utilities is missing or old', async () => {
  const util = utilities({shops: [{id: 'SHOP-A', name: '[TEST] Anvil'}, {id: 'SHOP-B', name: '[TEST] Bell', presented: true, mode: 'users', count: 2}, {id: 'SHOP-K', name: '[TEST] Cellar Stall', locationId: KIDS}]});
  await world({util: util.mod, locs: [innRecord()]});
  const app = new LocationsApp();
  app.select(LOC);
  const html = await app._renderHTML();
  assert.match(html, /data-shops-here="1"/);
  assert.match(html, /\[TEST\] Anvil/); assert.match(html, /\[TEST\] Bell/);
  assert.doesNotMatch(html, /Cellar Stall/, 'places inside are only listed on request');
  assert.match(html, /Not shown to players/); assert.match(html, /Shown to 2 players/);
  assert.equal((html.match(/data-action="present-shop"/g) ?? []).length, 2);
  assert.equal((html.match(/data-action="stop-shop"/g) ?? []).length, 1, 'Stop showing only for the shown shop');
  assert.equal((html.match(/data-action="open-shop"/g) ?? []).length, 1, 'Open (the shop as players see it) only while it is shown, as in Utilities');
  app.shopsChildren = true;
  assert.match(await app._renderHTML(), /Cellar Stall/);
  app.shopsChildren = false;
  // No Utilities.
  await world({util: null, locs: [innRecord()]});
  const a2 = new LocationsApp(); a2.select(LOC);
  const h2 = await a2._renderHTML();
  assert.match(h2, /Activate Ashen Gate \| Utilities/); assert.doesNotMatch(h2, /data-action="present-shop"/);
  // Older Utilities without atPlace.
  await world({util: utilities({old: true}).mod, locs: [innRecord()]});
  const a3 = new LocationsApp(); a3.select(LOC);
  assert.match(await a3._renderHTML(), /Update Ashen Gate \| Utilities/);
});

test('Present… calls Utilities (All / Chosen players), Stop showing asks first, and only the GM can use either', async () => {
  const util = utilities({shops: [{id: 'SHOP-A', name: '[TEST] Anvil'}]});
  await world({util: util.mod, locs: [innRecord()]});
  const dialogs = [];
  globalThis.foundry.applications.api.DialogV2 = {
    wait: async opts => { dialogs.push(opts); return opts.window.title.startsWith('Present') ? {mode: 'users', users: ['p2']} : opts.buttons.some(b => b.action === 'confirm') ? true : null; },
    confirm: async opts => { dialogs.push(opts); return true; }
  };
  const app = new LocationsApp(); app.select(LOC); app.render = async () => {};
  await app.presentShop('SHOP-A');
  assert.deepEqual(util.calls.at(-1), ['present', 'SHOP-A', {mode: 'users', userIds: ['p2']}]);
  assert.equal(util.state[0].presented, true);
  assert.match(dialogs[0].window.title, /Present \[TEST\] Anvil/);
  await app.stopShop('SHOP-A');
  assert.equal(util.state[0].presented, false, 'reflects Stop showing');
  // A player's client: the editor handlers refuse, and Utilities refuses too.
  game.user = player;
  util.calls.length = 0;
  const p = new LocationsApp(); p.draft = null; p.render = async () => {};
  await p.presentShop('SHOP-A'); await p.stopShop('SHOP-A');
  assert.deepEqual(util.calls, [], 'a player cannot present or stop');
  await p.onAction({dataset: {action: 'present-shop', id: 'SHOP-A'}});
  assert.deepEqual(util.calls, [], 'the editor actions are GM only');
  await assert.rejects(() => util.mod.api.shops.present('SHOP-A', {mode: 'all'}), /GM only/, 'and the Utilities API itself enforces it');
  game.user = gm;
});

test('player card: only shops presented to this player at this place, with Open shop; nothing when none; never an unshown shop', async () => {
  const util = utilities({shops: [{id: 'SHOP-A', name: '[TEST] Anvil', placeKey: ''}, {id: 'SHOP-B', name: '[TEST] Bell', placeKey: ''}, {id: 'SHOP-C', name: '[TEST] Elsewhere Stall', placeKey: 'otherkey00001'}, {id: 'SHOP-HIDDEN', name: '[TEST] Secret Fence', placeKey: ''}]});
  await world({util: util.mod, locs: [innRecord()]});
  const key = readAll().find(l => l.id === LOC).pinKey;
  for (const s of util.state) if (!s.placeKey || s.placeKey === '') s.placeKey = key;
  util.state[2].placeKey = 'otherkey00001';
  game.user = player;
  const app = new LocationsApp(); app.select(LOC);
  let html = await app._renderHTML();
  assert.doesNotMatch(html, /Open shop|data-shops-card|Anvil|Bell/, 'nothing presented: no card, no hint that shops exist');
  Object.assign(util.state[0], {presented: true, mode: 'all'});
  Object.assign(util.state[1], {presented: true, mode: 'users', userIds: ['p2']});    // shown to Quinn, not to this player
  Object.assign(util.state[2], {presented: true, mode: 'all'});                       // shown, but at another place
  html = await app._renderHTML();
  assert.match(html, /data-shops-card="1"/); assert.match(html, /\[TEST\] Anvil/); assert.match(html, /data-action="open-shop" data-id="SHOP-A"/);
  assert.doesNotMatch(html, /Bell|Elsewhere Stall|Secret Fence|SHOP-HIDDEN|SHOP-B|SHOP-C/, 'not presented to this player, or not here');
  assert.doesNotMatch(html, /Present…|Stop showing|Shops here/);
  // Stop showing: gone.
  util.state[0].presented = false;
  assert.doesNotMatch(await app._renderHTML(), /Open shop|data-shops-card/);
  // Opening goes through Utilities' own API.
  util.state[0].presented = true;
  await app.onAction({dataset: {action: 'open-shop', id: 'SHOP-A'}});
  assert.deepEqual(util.calls.at(-1), ['open', 'SHOP-A']);
  game.user = gm;
});

test('player card: nothing for a place the player cannot see, an unidentified place, shops off, or no / older Utilities', async () => {
  const util = utilities({shops: [{id: 'SHOP-A', name: '[TEST] Anvil', presented: true, mode: 'all'}]});
  const hidden = inn({id: 'LOC-TEST-HIDDEN-INN', state: 'hidden', published: null, name: '[TEST] Hidden Inn'});
  const unid = inn({id: 'LOC-TEST-UNKNOWN-INN', state: 'unidentified', name: '[TEST] Unknown Inn'});
  const selected = inn({id: 'LOC-TEST-PRIVATE-INN', name: '[TEST] Private Inn', audience: {mode: 'selected', userIds: ['p2'], sharing: false}});
  await world({util: util.mod, locs: [hidden, unid, selected]});
  const all = readAll();
  const keyOf = id => all.find(l => l.id === id).pinKey;
  game.user = player;
  const app = new LocationsApp();
  for (const id of ['LOC-TEST-HIDDEN-INN', 'LOC-TEST-UNKNOWN-INN', 'LOC-TEST-PRIVATE-INN']) {
    util.state[0].placeKey = keyOf(id);          // Utilities would put this key on the shop; the place still gives the player nothing
    for (const ref of [id, keyOf(id)]) { app.select(ref); const h = await app._renderHTML(); assert.doesNotMatch(h, /Open shop|data-shops-card|Anvil/, id); }
  }
  util.state[0].placeKey = 'abc';
  // The same shop key on a location the player cannot see still lists nothing: the view is null.
  assert.deepEqual(shopsForPlayer({get: () => util.mod}, null), []);
  assert.deepEqual(shopsForPlayer({get: () => util.mod}, {state: 'unidentified', key: 'abc'}), []);
  assert.deepEqual(shopsForPlayer({get: () => util.mod}, {state: 'revealed', key: 'abc'}).map(s => s.id), ['SHOP-A']);
  assert.deepEqual(shopsForPlayer({get: () => util.mod}, {state: 'revealed', key: ''}), []);
  // Shops switched off for players (forMe throws): nothing, no error.
  const off = utilities({fail: true, shops: [{id: 'SHOP-A', name: 'A', presented: true, mode: 'all', placeKey: 'abc'}]});
  assert.deepEqual(shopsForPlayer({get: () => off.mod}, {state: 'revealed', key: 'abc'}), []);
  // No Utilities, and an older one that sends no place key.
  assert.deepEqual(shopsForPlayer({get: () => null}, {state: 'revealed', key: 'abc'}), []);
  const older = utilities({old: true, shops: [{id: 'SHOP-A', name: 'A', presented: true, mode: 'all'}]});
  assert.deepEqual(shopsForPlayer({get: () => older.mod}, {state: 'revealed', key: 'abc'}), []);
  game.user = gm;
});

test('player card: People shows visible entries, with an Open link only where Foundry lets the player open it', async () => {
  await world({util: null, locs: [innRecord()]});
  globalThis.fromUuidSync = uuid => ({'Actor.mira': ownedBy('Actor.mira', '[TEST] Mira', 2), 'Actor.secret': ownedBy('Actor.secret', '[TEST] Secret', 0)})[uuid] ?? null;
  const loc = readAll().find(l => l.id === LOC);
  loc.npcs[1].visible = true;           // a second visible person the player may not open
  loc.npcs[1].label = '[TEST] Stranger';
  loc.published = publishable(loc);
  await writeAll(readAll().map(l => l.id === LOC ? loc : l));
  game.user = player;
  const app = new LocationsApp(); app.select(LOC);
  const html = await app._renderHTML();
  assert.match(html, /<h3>People<\/h3>/);
  assert.match(html, /data-action="open-doc" data-uuid="Actor\.mira"[^>]*>[^<]*(?:<[^>]+>)*\[TEST\] Mira/, 'a link where the player may open it');
  assert.match(html, /\[TEST\] Stranger/);
  assert.doesNotMatch(html, /data-uuid="Actor\.secret"/, 'no link without permission: the name alone');
  assert.doesNotMatch(html, /NPC-TEST|Add note|data-toggle|Visible to/);
  game.user = gm;
});

test('GM editor: People section with suggestions (Link <name>), drop, manual picker, re-link and a hidden-by-default eye', async () => {
  await world({util: null, locs: [normalizeLocation({id: LOC, name: '[TEST] Inn', state: 'revealed', npcs: [person({uuid: 'Actor.gone', visible: false})], sections: {npcs: false}})]});
  const mira2 = managed('mira2', '[TEST] Mira', {refs: [{relation: 'found_at', target_id: LOC}]}, {flags: {'ashen-gate-manager': {source: {sourceId: 'NPC-TEST-MIRA'}}}});
  const bram = managed('bram', '[TEST] Bram', {refs: [{relation: 'found_at', target_id: LOC}]});
  const loose = npc('loose', '[TEST] Loose NPC');
  game.actors = [mira2, bram, loose, {...npc('pc', '[TEST] Hero'), type: 'character'}];
  const docs = new Map([...game.actors.map(a => [a.uuid, a])]);
  globalThis.fromUuidSync = u => docs.get(u) ?? null; globalThis.fromUuid = async u => docs.get(u) ?? null;
  const app = new LocationsApp(); app.select(LOC); app.render = async () => {};
  let html = await app._renderHTML();
  assert.match(html, /data-block="npcs"/); assert.match(html, /data-drop="npcs"/);
  assert.match(html, /data-action="link-npc" data-uuid="Actor\.bram"[^>]*>(?:<[^>]+>)*<span>Link \[TEST\] Bram/, 'one-click Link <name>');
  assert.doesNotMatch(html, /Link \[TEST\] Mira/, 'already linked by its NPC id');
  assert.match(html, /Its record places it here/);
  assert.match(html, /data-action="relink-npc"/); assert.match(html, /Re-link to \[TEST\] Mira/);
  assert.match(html, /<option value="Actor\.loose">\[TEST\] Loose NPC<\/option>/); assert.doesNotMatch(html, /<option value="Actor\.pc"/);
  assert.match(html, /data-bind="npcs\.p1\.label"/); assert.match(html, /data-toggle="npcs\.p1\.visible"/); assert.doesNotMatch(html, /data-toggle="npcs\.p1\.visible" checked/, 'hidden by default');
  await app.onAction({dataset: {action: 'relink-npc', key: 'p1'}});
  assert.equal(app.draft.npcs[0].uuid, 'Actor.mira2');
  await app.onAction({dataset: {action: 'link-npc', uuid: 'Actor.bram'}});
  const added = app.draft.npcs.at(-1);
  assert.deepEqual([added.uuid, added.sourceId, added.visible, added.label, added.docType], ['Actor.bram', 'NPC-TEST-BRAM', false, '[TEST] Bram', 'Actor']);
  await app.onDrop('npcs', {type: 'Actor', uuid: 'Actor.loose'});
  assert.equal(app.draft.npcs.at(-1).uuid, 'Actor.loose'); assert.equal(app.draft.npcs.at(-1).sourceId, '');
  const count = app.draft.npcs.length;
  await app.onDrop('npcs', {type: 'Actor', uuid: 'Actor.loose'});
  assert.equal(app.draft.npcs.length, count, 'dropping the same person twice links once');
  docs.set('Item.x', {uuid: 'Item.x', name: 'Sword', documentName: 'Item'});
  await app.onDrop('npcs', {type: 'Item', uuid: 'Item.x'});
  assert.equal(app.draft.npcs.length, count, 'an Item is not a person');
  html = await app._renderHTML();
  assert.doesNotMatch(html, /Link \[TEST\] Bram/, 'a linked suggestion disappears');
  // Saved and published through the API: the round trip keeps the NPC id and the hidden flag.
  const saved = await game.modules.get('ashen-gate-locations').api.saveLocation(app.draft);
  assert.equal(saved.npcs.find(n => n.uuid === 'Actor.bram').sourceId, 'NPC-TEST-BRAM');
});

test('archive / delete / restore keep the people, and an archived location shows players nothing', async () => {
  await world({util: null, locs: [innRecord()]});
  const api = game.modules.get('ashen-gate-locations').api;
  await api.archiveLocations([LOC]);
  assert.equal(readAll().find(l => l.id === LOC).npcs.length, 2, 'archiving keeps every link');
  game.user = player;
  assert.equal(readViews().find(v => v.id === LOC), undefined);
  game.user = gm;
  await api.restoreLocations([LOC]);
  assert.equal(readAll().find(l => l.id === LOC).npcs.length, 2);
  assert.equal(readAll().find(l => l.id === LOC).npcs[0].sourceId, 'NPC-TEST-MIRA');
});

test('no leak: the player\'s data and window never carry a hidden person, an NPC id, a LOC id or an unshown shop', async () => {
  const util = utilities({shops: [{id: 'SHOP-A', name: '[TEST] Anvil', presented: true, mode: 'all'}, {id: 'SHOP-SECRET', name: '[TEST] Smuggler Den'}]});
  await world({util: util.mod, locs: [innRecord()]});
  util.state[0].placeKey = readAll().find(l => l.id === LOC).pinKey;
  game.user = player;
  const text = JSON.stringify(readViews()) + await new LocationsApp()._renderHTML();
  for (const leak of ['NPC-TEST', 'Secret', 'Smuggler', 'SHOP-SECRET', 'sourceId']) assert.equal(text.includes(leak), false, leak);
  const app = new LocationsApp(); app.select(LOC);
  const html = await app._renderHTML();
  for (const leak of ['NPC-TEST', 'sourceId', 'Smuggler', 'SHOP-SECRET', 'LOC-TEST-INN', 'Actor.secret']) assert.equal(html.includes(leak), false, leak);
  game.user = gm;
});
