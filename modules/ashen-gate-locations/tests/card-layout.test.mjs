/** 1.4.0: reorderable card, custom details, Loot & Rewards, Region conditions.
 *  Mocked Foundry: proves the data and the HTML the window builds, not how Foundry lays it out or how drag feels. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry, gm, player} from './foundry-mock.mjs';
import {readAll, writeAll, readViews, placeNote} from '../scripts/store.mjs';
import {createApi} from '../scripts/api.mjs';
import {normalizeLocation, normalizeLayout, reorder, playerView, viewHtml, publishable, effectiveConditions, exportPackage, importRecords, parseImport,
  hasUnpublishedChanges, BLOCKS} from '../scripts/model.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
const {LocationsApp} = await import('../scripts/app.mjs');

const as = user => { game.user = user; };
globalThis.CSS ??= {escape: v => String(v)};
const clone = x => structuredClone(x);
const SECRET = /SECRET/;
const loc = (id, extra = {}) => normalizeLocation({id, name: `[TEST] ${id}`, state: 'revealed', ...extra});
const published = l => ({...l, published: publishable(l)});
const DEFAULT_KEYS = BLOCKS.map(b => b.key);

function boot() {
  const g = installFoundry();
  const mod = {version: '1.4.0', active: true};
  mod.api = createApi({version: '1.4.0', isGM: () => game.user.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}});
  g.modules = {get: id => id === 'ashen-gate-locations' ? mod : null};
  return mod.api;
}
function appFor(draft) {
  const app = new LocationsApp();
  app.draft = draft; app.dirty = false;
  app.render = async () => {};
  return app;
}

// ---------- layout ----------

test('layout: defaults, unknown keys dropped, missing keys appended, order kept', () => {
  assert.deepEqual(normalizeLocation({id: 'LOC-A'}).layout, DEFAULT_KEYS);
  const l = normalizeLocation({id: 'LOC-A', details: [{key: 'd1', title: 'Pit'}], layout: ['loot', 'bogus', 'detail:d1', 'loot', 'detail:gone', 'description']});
  assert.deepEqual(l.layout.slice(0, 3), ['loot', 'detail:d1', 'description']);
  assert.equal(new Set(l.layout).size, l.layout.length, 'each key once');
  assert.ok(DEFAULT_KEYS.every(k => l.layout.includes(k)), 'every built-in block is still there');
  assert.ok(!l.layout.includes('bogus') && !l.layout.includes('detail:gone'));
  assert.deepEqual(normalizeLocation(l).layout, l.layout, 're-runnable');
});

test('reorder moves one item by step or next to another, never mutates, no-ops return the same list', () => {
  const list = ['a', 'b', 'c', 'd'], id = x => x;
  assert.deepEqual(reorder(list, id, 'c', {by: -1}), ['a', 'c', 'b', 'd']);
  assert.deepEqual(reorder(list, id, 'a', {by: 1}), ['b', 'a', 'c', 'd']);
  assert.deepEqual(reorder(list, id, 'a', {after: 'c'}), ['b', 'c', 'a', 'd']);
  assert.deepEqual(reorder(list, id, 'd', {before: 'b'}), ['a', 'd', 'b', 'c']);
  assert.equal(reorder(list, id, 'a', {by: -1}), list, 'already first');
  assert.equal(reorder(list, id, 'zz', {by: 1}), list);
  assert.deepEqual(list, ['a', 'b', 'c', 'd']);
});

test('reordering entries changes order only: keys, refs and play state stay put', () => {
  const l = loc('LOC-A', {resources: [{key: 'n1', label: 'One', materialId: 'MAT-A', tier: 3, dc: 14, finite: true, exhausted: true}, {key: 'n2', label: 'Two', materialId: 'MAT-B'}]});
  const moved = normalizeLocation({...l, resources: reorder(l.resources, e => e.key, 'n2', {by: -1})});
  assert.deepEqual(moved.resources.map(n => n.key), ['n2', 'n1']);
  assert.deepEqual(moved.resources.find(n => n.key === 'n1'), l.resources.find(n => n.key === 'n1'));
});

test('layout is saved privately and reaches players only on Publish, in the published order', async () => {
  const api = boot();
  const created = await api.saveLocation({name: '[TEST] Card', description: 'hello', sections: {loot: true}, loot: [{key: 'l1', label: 'Coins'}]});
  await api.setLocationState(created.id, 'revealed');
  as(player);
  assert.deepEqual((await api.getLocation(created.id)).layout, ['description', 'loot']);
  as(gm);
  await api.saveLocation({...created, layout: ['loot', 'description']});
  assert.deepEqual(readAll()[0].layout.slice(0, 2), ['loot', 'description'], 'saved');
  assert.ok(api.hasUnpublishedChanges(created.id), 'a reorder counts as an unpublished change');
  as(player);
  assert.deepEqual((await api.getLocation(created.id)).layout, ['description', 'loot'], 'players still see the old order');
  as(gm);
  await api.publishLocation(created.id);
  as(player);
  assert.deepEqual((await api.getLocation(created.id)).layout, ['loot', 'description']);
});

// ---------- custom details ----------

test('custom details: local keys, per-block reveal, nothing about hidden ones reaches players', () => {
  const l = published(loc('LOC-A', {details: [
    {key: 'a1', title: 'Shown', text: 'visible text', visible: true},
    {key: 'b2', title: 'SECRET title', text: 'SECRET text', visible: false},
    {key: 'c3', title: '', text: '', uuid: ''}]}));
  assert.deepEqual(l.details.map(d => d.key), ['a1', 'b2'], 'empty block dropped; keys kept');
  const view = playerView(l, [l]);
  assert.deepEqual(view.details.map(d => d.title), ['Shown']);
  assert.ok(view.layout.includes('detail:a1') && !view.layout.includes('detail:b2'));
  assert.doesNotMatch(JSON.stringify(view) + viewHtml(view), SECRET, 'no title, text or count of the unrevealed block');
});

test('custom details accept a native document link and drop unsafe uuids', () => {
  const l = loc('LOC-A', {details: [{key: 'k', title: 'Map', uuid: 'JournalEntry.abc123', docType: 'JournalEntry'}, {key: 'z', title: 'Bad', uuid: 'x"><script>'}]});
  assert.equal(l.details[0].uuid, 'JournalEntry.abc123');
  assert.equal(l.details[1].uuid, '');
});

// ---------- loot ----------

test('loot: status is manual and defaults to available; unrevealed entries and the section toggle are honoured', () => {
  const l = published(loc('LOC-A', {sections: {loot: true}, loot: [
    {key: 'a', label: 'Silver key', status: 'taken'},
    {key: 'b', label: 'Coins', status: 'nonsense'},
    {key: 'c', label: 'SECRET hoard', status: 'discovered', visible: false}]}));
  assert.deepEqual(l.loot.map(e => e.status), ['taken', 'available', 'discovered']);
  const view = playerView(l, [l]);
  assert.deepEqual(view.loot.map(e => [e.label, e.status]), [['Silver key', 'taken'], ['Coins', 'available']]);
  assert.doesNotMatch(JSON.stringify(view) + viewHtml(view), SECRET);
  const off = published({...l, sections: {...l.sections, loot: false}});
  assert.equal(playerView(off, [off]).loot, undefined, 'section off: no block, no title, no count');
  assert.doesNotMatch(viewHtml(playerView(off, [off])), /Loot/);
});

test('loot: the player view carries only GM-approved text; nothing is read from the linked document', () => {
  const l = published(loc('LOC-A', {sections: {loot: true}, loot: [{key: 'i', label: 'A strange blade', text: 'Cold to the touch', img: 'icons/x.webp', uuid: 'Item.SECRETITEM', docType: 'Item'}]}));
  const view = playerView(l, [l]);
  assert.deepEqual(Object.keys(view.loot[0]).sort(), ['docType', 'img', 'label', 'status', 'text', 'uuid']);
  assert.doesNotMatch(viewHtml(view), /SECRETITEM|Item\./, 'the Journal page never links the document');
});

test('one Item can be linked from many locations', async () => {
  const api = boot();
  for (const name of ['One', 'Two', 'Three']) await api.saveLocation({name: `[TEST] ${name}`, sections: {loot: true}, loot: [{label: 'Shared blade', uuid: 'Item.sharedblade01', docType: 'Item'}]});
  assert.equal(readAll().filter(x => x.loot[0]?.uuid === 'Item.sharedblade01').length, 3);
});

test('dropping an Item into Loot only adds a link: no Item or Actor document is created, changed or given', async () => {
  const api = boot();
  const calls = [];
  const spy = name => (...a) => { calls.push([name, ...a]); return Promise.resolve([]); };
  const actor = {id: 'actor1', createEmbeddedDocuments: spy('actor.createEmbeddedDocuments'), update: spy('actor.update'), items: []};
  const item = {uuid: 'Item.blade00000001', documentName: 'Item', name: 'Dawnblade', img: 'icons/blade.webp', update: spy('item.update')};
  globalThis.Item = {create: spy('Item.create'), createDocuments: spy('Item.createDocuments')};
  globalThis.Actor = {create: spy('Actor.create')};
  game.actors = [actor];
  globalThis.fromUuid = async () => item;
  globalThis.ui = {notifications: {warn() {}, info() {}}};
  const saved = await api.saveLocation({name: '[TEST] Vault'});
  const app = appFor(clone(saved));
  await app.onDrop('loot', {type: 'Item', uuid: item.uuid});
  assert.equal(app.draft.loot.length, 1);
  assert.deepEqual([app.draft.loot[0].uuid, app.draft.loot[0].label, app.draft.loot[0].status], ['Item.blade00000001', 'Dawnblade', 'available']);
  await api.saveLocation(normalizeLocation(app.draft));
  assert.equal(readAll()[0].loot.length, 1);
  assert.deepEqual(calls, [], 'no create/update call on any Item or Actor');
});

test('dropping a non-Item into Loot is refused', async () => {
  boot();
  const warned = [];
  globalThis.fromUuid = async () => ({uuid: 'Actor.x', documentName: 'Actor', name: 'Bob'});
  globalThis.ui = {notifications: {warn: m => warned.push(m), info() {}}};
  const app = appFor(normalizeLocation({id: 'LOC-A'}));
  await app.onDrop('loot', {type: 'Actor', uuid: 'Actor.x'});
  assert.equal(app.draft.loot.length, 0);
  assert.equal(warned.length, 1);
});

test('player viewer: a linked Item opens only if Foundry permissions allow; otherwise just the approved title/text/image', async () => {
  const api = boot();
  const l = await api.saveLocation({name: '[TEST] Vault', sections: {loot: true},
    loot: [{key: 'i', label: 'Dawnblade', text: 'Pale and bright', img: 'icons/blade.webp', uuid: 'Item.blade00000001', docType: 'Item'}, {key: 't', label: '12 gold'}]});
  await api.setLocationState(l.id, 'revealed');
  as(player);
  const app = new LocationsApp();
  const view = await api.getLocation(l.id);
  globalThis.fromUuidSync = () => ({testUserPermission: () => false, name: 'SECRET real name'});
  const denied = app.viewerHtml(view);
  assert.match(denied, /Dawnblade/); assert.match(denied, /Pale and bright/); assert.match(denied, /icons\/blade\.webp/); assert.match(denied, /12 gold/);
  assert.doesNotMatch(denied, /data-action="open-doc"|SECRET real name/, 'no link without permission');
  globalThis.fromUuidSync = () => ({testUserPermission: (u, level) => level === 'LIMITED'});
  assert.match(app.viewerHtml(view), /data-action="open-doc" data-uuid="Item\.blade00000001"/, 'link when the player may open it');
  globalThis.fromUuidSync = () => ({});   // a compendium index entry has no permission method
  assert.doesNotMatch(app.viewerHtml(view), /data-action="open-doc"/);
  as(gm);
  const packed = await api.saveLocation({...l, loot: [{key: 'c', label: 'Pack item', uuid: 'Compendium.world.loot.Item.abc', docType: 'Item'}]});
  await api.publishLocation(packed.id);
  as(player);
  const packView = await api.getLocation(packed.id);
  game.packs = new Map([['world.loot', {visible: false}]]);
  assert.doesNotMatch(app.viewerHtml(packView), /data-action="open-doc"/, 'pack the player cannot see');
  game.packs = new Map([['world.loot', {visible: true}]]);
  assert.match(app.viewerHtml(packView), /data-action="open-doc" data-uuid="Compendium\.world\.loot\.Item\.abc"/);
});

// ---------- Regions ----------

const tree = () => {
  const region = published(loc('LOC-REGION', {name: '[TEST] Marsh', isRegion: true, sections: {conditions: true}, conditions: [
    {key: 'fog', label: 'Dense fog', text: 'Heavily obscured beyond 30 ft'}, {key: 'cold', label: 'Cold', text: 'Short rests need a fire'}, {key: 'priv', label: 'SECRET sink', text: 'x', visible: false}]}));
  const plain = published(loc('LOC-PLAIN', {name: '[TEST] Plain', parentLocationId: 'LOC-REGION', conditions: [{key: 'own', label: 'Plain thing'}], sections: {conditions: true}}));
  const deep = published(loc('LOC-DEEP', {name: '[TEST] Deep', parentLocationId: 'LOC-PLAIN', sections: {conditions: true, resources: true, loot: true, quests: true},
    resources: [{key: 'r', label: 'Reeds', materialId: 'MAT-REED'}], quests: [{questId: 'QUEST-X'}], loot: [{label: 'Coins'}]}));
  return {region, plain, deep, all: [region, plain, deep]};
};

test('Region conditions pass to descendants at any depth, with the source named for the GM; nothing else is inherited', () => {
  const {region, deep, plain, all} = tree();
  assert.deepEqual(effectiveConditions(deep, all).map(c => [c.label, c.source?.name]), [['Dense fog', '[TEST] Marsh'], ['Cold', '[TEST] Marsh'], ['SECRET sink', '[TEST] Marsh']]);
  assert.deepEqual(effectiveConditions(plain, all).map(c => c.label), ['Dense fog', 'Cold', 'SECRET sink', 'Plain thing'], 'inherited first, then its own');
  assert.deepEqual(effectiveConditions(normalizeLocation({...deep, parentLocationId: ''}), all), [], 'no parent: nothing');
  const notRegion = published({...region, isRegion: false});
  assert.deepEqual(effectiveConditions(deep, [notRegion, plain, deep]), [], 'a non-Region parent passes nothing');
  // Only conditions travel: the child's other blocks are its own.
  const view = playerView(deep, all);
  assert.deepEqual([view.resources.length, view.quests, view.loot.map(l => l.label)], [1, ['QUEST-X'], ['Coins']]);
  assert.equal(playerView(plain, all).resources, undefined, 'the Region\'s resources/loot/quests never reach a child');
});

test('a child can turn off or change an inherited condition without editing the Region', () => {
  const {region, plain, deep, all} = tree();
  const before = JSON.stringify(region);
  const edited = normalizeLocation({...deep, conditionOverrides: [
    {from: 'LOC-REGION', conditionKey: 'fog', disabled: true},
    {from: 'LOC-REGION', conditionKey: 'cold', label: 'Mild', text: 'Fine with a cloak'},
    {from: 'LOC-REGION', conditionKey: 'ghost'}]});   // empty override: dropped
  assert.equal(edited.conditionOverrides.length, 2);
  const list = effectiveConditions(edited, [region, plain, edited]);
  const fog = list.find(c => c.key === 'fog'), cold = list.find(c => c.key === 'cold');
  assert.deepEqual([fog.disabled, cold.label, cold.text, cold.overridden, cold.original.label], [true, 'Mild', 'Fine with a cloak', true, 'Cold']);
  assert.equal(JSON.stringify(region), before, 'the Region is untouched');
  const pub = published(edited);
  assert.deepEqual(playerView(pub, [region, plain, pub]).conditions, [{label: 'Mild', text: 'Fine with a cloak'}], 'fog off here; the hidden entry is never shown');
  assert.deepEqual(playerView(plain, all).conditions.map(c => c.label), ['Dense fog', 'Cold', 'Plain thing'], 'a sibling is not affected');
});

test('players: inherited conditions never name or depend on an unrevealed Region', () => {
  const {region, plain, deep} = tree();
  const hidden = {...region, state: 'hidden', revealed: false};
  assert.equal(playerView(deep, [hidden, plain, deep]).conditions, undefined, 'hidden Region: nothing passes to players');
  const unid = {...region, state: 'unidentified', revealed: false};
  const v = playerView(plain, [unid, plain, deep]);
  assert.deepEqual(v.conditions.map(c => c.label), ['Dense fog', 'Cold', 'Plain thing'], 'an unidentified Region still passes its shown conditions');
  assert.doesNotMatch(JSON.stringify(v) + viewHtml(v), /Marsh|LOC-REGION/);
  const reparented = {...plain, parentLocationId: ''};   // saved but not published
  assert.equal(playerView(reparented, [region, reparented]).conditions.length, 3, 'the published parent still applies');
  const sectionOff = {...region, published: {...region.published, sections: {...region.published.sections, conditions: false}}};
  assert.deepEqual(playerView(plain, [sectionOff, plain]).conditions.map(c => c.label), ['Plain thing']);
  const childOff = published({...plain, sections: {...plain.sections, conditions: false}});
  assert.equal(playerView(childOff, [region, childOff]).conditions, undefined);
});

test('a parent loop cannot hang condition lookup', () => {
  const a = loc('LOC-A', {isRegion: true, parentLocationId: 'LOC-B', conditions: [{label: 'x'}]}), b = loc('LOC-B', {isRegion: true, parentLocationId: 'LOC-A'});
  assert.ok(Array.isArray(effectiveConditions(a, [a, b])));
});

// ---------- sanitized player view ----------

test('player view and API never leak GM-only blocks, scenes, unrevealed details/loot, or an unrevealed Region', async () => {
  const api = boot();
  const region = await api.saveLocation({name: '[TEST] SECRET Region', isRegion: true, sections: {conditions: true}, conditions: [{key: 'c', label: 'Fog'}]});
  const child = await api.saveLocation({name: '[TEST] Child', parentLocationId: region.id, sceneUuids: ['Scene.SECRETSCENE'], sections: {loot: true, conditions: true},
    details: [{key: 'g', title: 'SECRET GM notes', text: 'SECRET', visible: false}], loot: [{key: 'x', label: 'SECRET stash', visible: false}, {key: 'y', label: 'Public coin'}]});
  await api.setLocationState(child.id, 'revealed');
  as(player);
  const list = api.listLocations({includeUnidentified: true});
  const text = JSON.stringify(list) + list.map(viewHtml).join('') + JSON.stringify(readViews());
  assert.doesNotMatch(text, SECRET);
  assert.doesNotMatch(text, /sceneUuids|Scene\./);
  const v = list.find(x => x.name === '[TEST] Child');
  assert.deepEqual(v.loot.map(l => l.label), ['Public coin']);
  assert.equal(v.conditions, undefined, 'hidden Region passes nothing');
  assert.equal(v.details, undefined);
  await assert.rejects(() => api.saveLocation({name: 'x'}), /Only the GM/);
  assert.doesNotMatch(new LocationsApp().viewerHtml(v), /SECRET|data-bind|data-drag|Add Detail|Linked Scenes/);
});

// ---------- imports ----------

test('import round trip keeps the new fields; an older package keeps the world\'s; state/published/exhausted survive', () => {
  const l = published(loc('LOC-A', {
    isRegion: true, sections: {conditions: true, loot: true}, conditions: [{key: 'fog', label: 'Fog'}],
    loot: [{key: 'l1', label: 'Blade', uuid: 'Item.abc', docType: 'Item', status: 'discovered', text: 'x', img: 'a.webp'}],
    details: [{key: 'd1', title: 'Detail', text: 't', visible: true}], layout: ['detail:d1', 'loot'],
    conditionOverrides: [{from: 'LOC-REGION', conditionKey: 'fog', disabled: true}],
    resources: [{key: 'n1', label: 'Ore', materialId: 'MAT-ORE', finite: true, exhausted: true}]}));
  const fresh = parseImport(JSON.parse(JSON.stringify(exportPackage([l]))), []).created[0];
  for (const k of ['isRegion', 'conditions', 'loot', 'details', 'layout', 'conditionOverrides', 'sections']) assert.deepEqual(fresh[k], l[k], `${k} round-trips`);
  // Update from an older definition that has none of the new fields: the world's values stay.
  const old = {id: 'LOC-A', entity_type: 'Location', name: 'Renamed', location: {name: 'Renamed', description: 'new text', sections: {notes: true}, resources: [{key: 'n1', label: 'Ore', materialId: 'MAT-ORE', finite: true}]}};
  const u = importRecords([old], [l], {mode: 'update'}).updated[0];
  assert.equal(u.description, 'new text');
  for (const k of ['isRegion', 'conditions', 'loot', 'details', 'layout', 'conditionOverrides']) assert.deepEqual(u[k], l[k], `${k} kept`);
  assert.deepEqual([u.sections.loot, u.sections.conditions, u.sections.notes], [true, true, true]);
  assert.equal(u.state, 'revealed'); assert.deepEqual(u.published, l.published, 'players keep the old content until Publish');
  assert.equal(u.resources.find(n => n.key === 'n1').exhausted, true, 'exhausted nodes stay exhausted');
  assert.ok(hasUnpublishedChanges(u));
  // An update that does carry new fields applies them, but never state.
  const r2 = importRecords([{...old, location: {...old.location, loot: [{key: 'z', label: 'New'}], layout: ['loot']}}], [l], {mode: 'update'}).updated[0];
  assert.deepEqual(r2.loot.map(e => e.key), ['z']);
  assert.equal(r2.pinKey, l.pinKey);
});

test('1.3.0 records load unchanged: default layout, empty new fields, no false "unpublished" flag', () => {
  const old = {id: 'LOC-OLD', name: 'Old', state: 'revealed', description: 'd', sections: {notes: true}, notes: [{title: 'N', text: 't'}]};
  const a = normalizeLocation(old);
  assert.deepEqual([a.isRegion, a.conditions, a.loot, a.details, a.conditionOverrides], [false, [], [], [], []]);
  assert.equal(hasUnpublishedChanges(a), false);
  const v = playerView(a, [a]);
  assert.equal(v.description, 'd'); assert.equal(v.notes.length, 1);
  assert.match(viewHtml(v), /<h2>N<\/h2>/);
});

// ---------- the window ----------

test('GM editor: grips and arrows on every block and entry; Add Detail; Region switch; loot hint; inherited sources', async () => {
  const api = boot();
  // 1.8.0: a Region passes conditions down only with its switch on.
  const region = await api.saveLocation({name: '[TEST] Marsh', isRegion: true, passConditions: true, sections: {conditions: true}, conditions: [{key: 'fog', label: 'Dense fog', text: 'obscured'}]});
  const child = await api.saveLocation({name: '[TEST] Hut', parentLocationId: region.id, details: [{key: 'dd', title: 'Hidden cellar', text: 'x'}],
    resources: [{key: 'r1', label: 'Reeds'}, {key: 'r2', label: 'Rushes'}], sections: {resources: true, loot: true}, loot: [{key: 'l', label: 'Coins'}]});
  const app = new LocationsApp();
  app.select(child.id);
  const html = await app._renderHTML();
  // 0.19.0: Linked Scenes is a GM-only card on the Visibility & map sub-tab, not a reorderable block.
  for (const k of DEFAULT_KEYS.filter(k => k !== 'scenes')) assert.ok(html.includes(`data-block="${k}"`), k);
  assert.ok(!html.includes('data-block="scenes"') && html.includes('<h3>Linked Scenes</h3>'));
  assert.ok(html.includes('data-block="detail:dd"'));
  assert.match(html, /data-action="move-block" data-key="loot" data-dir="-1"/);
  assert.match(html, /data-drag-block="detail:dd"/);
  assert.match(html, /data-action="move-entry" data-section="resources" data-key="r1" data-dir="1"/);
  assert.match(html, /data-drag-entry="resources:r2"/);
  assert.match(html, /data-action="move-entry" data-section="loot" data-key="l"/);
  assert.match(html, /data-action="add-detail"/);
  assert.match(html, /data-toggle="isRegion"/);
  assert.match(html, /data-block="loot" data-drop="loot"/, "Items can be dropped on Loot");
  assert.match(html, /from \[TEST\] Marsh/, 'GM sees where the condition comes from');
  assert.match(html, /data-action="cond-off"/);
  assert.match(html, /data-toggle="details\.dd\.visible"/, 'block reveal toggle');
  assert.match(html, /data-toggle="loot\.l\.visible"/, 'entry reveal toggle');
});

test('window: moving blocks and entries edits order only, marks the draft unsaved, and Save keeps it', async () => {
  const api = boot();
  const saved = await api.saveLocation({name: '[TEST] Hut', resources: [{key: 'r1', label: 'A', materialId: 'MAT-A', tier: 3}, {key: 'r2', label: 'B'}]});
  const app = new LocationsApp();
  app.select(saved.id);
  app.render = async () => {};
  assert.equal(app.dirty, false);
  await app.moveBlock('loot', {before: 'description'});
  await app.moveEntry('resources', 'r2', {by: -1});
  assert.equal(app.dirty, true);
  assert.equal(app.draft.layout[0], 'loot');
  assert.deepEqual(app.draft.resources.map(r => r.key), ['r2', 'r1']);
  await api.saveLocation(normalizeLocation(app.draft));
  assert.equal(readAll()[0].layout[0], 'loot');
  assert.deepEqual(readAll()[0].resources.map(r => [r.key, r.materialId, r.tier]), [['r2', '', 1], ['r1', 'MAT-A', 3]]);
});

test('window: Add Detail starts unrevealed and lands last; a condition override is created once, on demand', async () => {
  const api = boot();
  const saved = await api.saveLocation({name: '[TEST] Hut'});
  const app = new LocationsApp();
  app.select(saved.id);
  app.render = async () => {};
  app.element = {querySelector: () => null};
  await app.onAction({dataset: {action: 'add-detail'}});
  const d = app.draft.details[0];
  assert.equal(d.visible, false);
  assert.equal(app.draft.layout.at(-1), `detail:${d.key}`);
  const o = app.override('LOC-REGION', 'fog');
  assert.equal(app.override('LOC-REGION', 'fog'), o);
  assert.equal(app.draft.conditionOverrides.length, 1);
});

test('player window shows published blocks in the GM order and no editing controls', async () => {
  const api = boot();
  const s = await api.saveLocation({name: '[TEST] Hut', description: 'Roof', sections: {resources: true, loot: true}, resources: [{label: 'Reeds'}], loot: [{label: 'Coins'}],
    layout: ['loot', 'resources', 'description']});
  await api.setLocationState(s.id, 'revealed');
  as(player);
  const out = new LocationsApp().viewerHtml(await api.getLocation(s.id));
  assert.ok(out.indexOf('Coins') < out.indexOf('Reeds') && out.indexOf('Reeds') < out.indexOf('Roof'), 'loot, resources, description');
  assert.doesNotMatch(out, /data-drag|move-block|data-toggle/);
});

test('0.30.0: Description is hidden from players until revealed, published and its eye is open; first block by default', async () => {
  const {playerView, normalizeLocation} = await import('../scripts/model.mjs');
  const base = {id: 'LOC-TEST-DESC', name: '[TEST] Hollow', description: 'Cold stone and dripping water.', sections: {loot: true}, loot: [{key: 'l1', label: 'Coins'}]};
  assert.equal(playerView({...base, state: 'hidden'}), null, 'hidden: nothing');
  const un = playerView({...base, state: 'unidentified'});
  assert.equal(un.description, undefined, 'unidentified: no description');
  const open = playerView({...base, state: 'revealed'});
  assert.equal(open.description, 'Cold stone and dripping water.');
  assert.equal(open.layout[0], 'description', 'first block by default');
  const closed = playerView({...base, state: 'revealed', show: {description: false}});
  assert.equal(closed.description, undefined, 'eye closed: omitted');
  assert.ok(!closed.layout.includes('description'));
  assert.ok(!JSON.stringify(closed).includes('Cold stone'));
  // Unpublished edits stay private: players keep the published text.
  const loc = normalizeLocation({...base, state: 'revealed'});
  const edited = {...loc, description: 'SECRET DRAFT'};
  assert.equal(playerView(edited).description, 'Cold stone and dripping water.');
});
