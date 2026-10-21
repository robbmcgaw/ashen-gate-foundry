/** Browse (0.24.0). Proves logic with mocked Foundry and partner APIs, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowse, searchIndex, parseQuery, fold, mergeEntries, compendiumEntries, dragDataOf} from '../scripts/browse.js';
import {bodyHtml, toolbarHtml, DEFAULT_STATE} from '../scripts/browse-view.js';

const M = 'ashen-gate-manager';
const coll = list => ({contents: list});
const folder = (name, parent = null) => ({name, folder: parent});

function doc(kind, id, name, {source = null, type = 'loot', system = {}, folder: f = null, modified = 0, pages} = {}) {
  const writes = [];
  const d = {documentName: kind, id, uuid: `${kind}.${id}`, name, type, system, folder: f, _stats: {modifiedTime: modified},
    flags: source ? {[M]: {source}} : {}, ...(pages ? {pages: coll(pages)} : {}),
    sheet: {rendered: [], render(opts) { this.rendered.push(opts); return Promise.resolve(); }},
    toDragData() { return {type: kind, uuid: this.uuid}; },
    update: () => writes.push('update'), delete: () => writes.push('delete'), setFlag: () => writes.push('setFlag')};
  d.writes = writes;
  return d;
}
const src = (sourceId, entityType, extra = {}) => ({sourceId, entityType, status: 'approved', visibility: 'player', packageId: 'PKG-TEST', refs: [], ...extra});

function world({gm = true, partners = true, packs = []} = {}) {
  const ag = folder('Ashen Gate — Imported Items');
  const herb = doc('Item', 'i1', '[TEST] Silverleaf Herb', {source: src('MAT-HERB-SILVERLEAF', 'Material', {definition: {tier: 1, quality: 'Common', profession_id: 'PROF-PT-HERBALISM', tags: ['herb', 'reagent'], description: 'A pale <b>leaf</b> found near rivers.'}}), folder: folder('Herbs', ag), modified: 30});
  const rare = doc('Item', 'i2', '[TEST] Ember Moss', {source: src('MAT-HERB-EMBER', 'Material', {status: 'draft', visibility: 'gm', definition: {tier: 2, quality: 'Rare', profession_id: 'PROF-PT-HERBALISM'}}), modified: 10});
  const recipe = doc('Item', 'i3', '[TEST] Healing Draught', {source: src('REC-HEAL-DRAUGHT', 'Recipe', {refs: [{target_id: 'MAT-HERB-SILVERLEAF', relation: 'ingredient'}], definition: {tier: 1, profession_id: 'PROF-PT-ALCHEMY'}}), modified: 20});
  const sword = doc('Item', 'i4', 'Longsword', {type: 'weapon', system: {rarity: 'common', description: {value: '<p>A plain blade.</p>'}}, modified: 40});
  const npc = doc('Actor', 'a1', 'Hérold the Guard', {type: 'npc'});
  const page = {documentName: 'JournalEntryPage', id: 'p1', uuid: 'JournalEntry.j1.JournalEntryPage.p1', name: 'Herb lore page', type: 'text', text: {content: '<p>Notes</p>'}};
  const journal = doc('JournalEntry', 'j1', '[TEST] Field Guide', {pages: [page]});
  page.parent = journal;
  const calls = [];
  const modules = new Map([[M, {id: M, active: true, api: {}}]]);
  if (partners) {
    modules.set('ashen-gate-locations', {id: 'ashen-gate-locations', active: true, version: '1.8.1', api: {
      listLocations: () => [{id: 'LOC-TEST-TOWN', name: 'Testford', state: 'revealed', resources: [{materialId: 'MAT-HERB-SILVERLEAF'}]}],
      openLocation: id => { calls.push(['openLocation', id]); }}});
    modules.set('ashen-gate-quest-manager', {id: 'ashen-gate-quest-manager', active: true, version: '0.7.2', api: {
      listQuests: () => [{id: 'QUEST-TEST-HERBS', name: 'Gather Herbs', status: 'Active', kind: 'quest', definitionStatus: 'approved'}],
      getGMSource: id => ({id, name: 'Gather Herbs', visibility: 'reveal_gated', status: 'approved', objectives: [{materialId: 'MAT-HERB-EMBER'}]}),
      openObjective: id => { calls.push(['openObjective', id]); return {status: 'opened'}; }}});
    modules.set('ashen-gate-skill-trees', {id: 'ashen-gate-skill-trees', active: true, version: '0.12.0', api: {
      listTrees: () => [{id: 'TREE-TEST-HERB', name: 'Herbalism Tree', nodes: [{id: 'n1', name: 'Green Thumb', perkId: 'PERK-TEST-GREEN'}]}],
      open: opts => { calls.push(['openTree', opts]); }}});
    modules.set('ashen-gate-factions', {id: 'ashen-gate-factions', active: true, version: '0.8.0', api: {
      getFactions: () => [{id: 'FACTION-TEST-GUILD', name: 'Test Guild', visibility: 'player'}]}});
    modules.set('ashen-gate-headquarters', {id: 'ashen-gate-headquarters', active: true, version: '0.7.0', api: {
      exportState: () => ({catalog: [{id: 'FAC-TEST-GARDEN', name: 'Herb Garden', tier: 1}]}), open: () => { calls.push(['openHQ']); }}});
    modules.set('ashen-gate-profession-ledger', {id: 'ashen-gate-profession-ledger', active: true, version: '0.9.0', api: {
      exotic: {materials: opts => { calls.push(['materials', opts]); return [{id: 'MAT-HERB-SILVERLEAF', name: 'Silverleaf', quality: 'Common', tier: 1, professions: ['herbalism']},
        {id: 'MAT-TEST-STARDUST', name: 'Stardust', quality: 'Exotic', tier: 3, professions: ['enchanting'], available: false}]; }}}});
  }
  const game = {user: {isGM: gm}, items: coll([herb, rare, recipe, sword]), actors: coll([npc]), journal: coll([journal]),
    modules: {get: id => modules.get(id), values: () => modules.values()}, packs: coll(packs)};
  return {game, calls, docs: {herb, rare, recipe, sword, npc, journal, page}};
}

function hooks() {
  const on = new Map();
  let n = 0;
  return {on: (name, fn) => { on.set(name, fn); return ++n; }, off: name => on.delete(name), fire: name => on.get(name)?.(), names: () => [...on.keys()]};
}

function pack(collection, label, entries, {type = 'Item', pkg = 'dnd5e', locked = true} = {}) {
  const asked = [];
  return {collection, documentName: type, locked, visible: true, metadata: {label, packageName: pkg, type}, asked,
    folders: {get: id => id === 'f1' ? {name: 'Weapons'} : null},
    getIndex: async opts => { asked.push(opts); return coll(entries.map(e => ({uuid: `Compendium.${collection}.${type}.${e._id}`, ...e}))); },
    getDocument: () => { throw new Error('full documents must not load'); }};
}

test('index merges world, partner and ledger sources and never writes', () => {
  const {game, docs} = world();
  const svc = createBrowse({game});
  const idx = svc.getIndex();
  const kinds = new Set(idx.map(e => e.kind));
  for (const k of ['Item', 'Actor', 'JournalEntry', 'JournalEntryPage', 'Location', 'Quest', 'Tree', 'Perk', 'Faction', 'Facility', 'Material']) assert.ok(kinds.has(k), k);
  // Ledger's MAT-HERB-SILVERLEAF is the same record as the world Item: one row, both places listed.
  const herb = idx.filter(e => e.id === 'MAT-HERB-SILVERLEAF');
  assert.equal(herb.length, 1);
  assert.equal(herb[0].uuid, 'Item.i1');
  assert.deepEqual(herb[0].sources, ['World', 'Profession Ledger']);
  const star = idx.find(e => e.id === 'MAT-TEST-STARDUST');
  assert.equal(star.unlinked, true);
  assert.equal(idx.find(e => e.id === 'LOC-TEST-TOWN').unlinked, true);
  assert.equal(herb[0].unlinked, false);
  for (const d of Object.values(docs)) assert.deepEqual(d.writes ?? [], []);
});

test('a missing or inactive partner just contributes nothing', () => {
  const {game} = world({partners: false});
  const idx = createBrowse({game}).getIndex();
  assert.ok(idx.length >= 6);
  assert.ok(idx.every(e => ['Item', 'Actor', 'JournalEntry', 'JournalEntryPage'].includes(e.kind)));
  const w = world();
  w.game.modules.get('ashen-gate-locations').active = false;
  w.game.modules.get('ashen-gate-factions').api = {};
  const idx2 = createBrowse({game: w.game}).getIndex();
  assert.ok(!idx2.some(e => e.kind === 'Location' || e.kind === 'Faction'));
  assert.ok(idx2.some(e => e.kind === 'Quest'));
});

test('search: case and accent insensitive, words AND, prefixes', () => {
  const {game} = world();
  const svc = createBrowse({game});
  const names = r => r.groups.flatMap(g => g.rows.map(e => e.name)).sort();
  assert.ok(names(svc.search({query: 'HERB'})).includes('[TEST] Silverleaf Herb'));
  assert.deepEqual(names(svc.search({query: 'herold'})), ['Hérold the Guard']);
  assert.deepEqual(names(svc.search({query: 'pale rivers'})), ['[TEST] Silverleaf Herb']); // description text
  assert.deepEqual(names(svc.search({query: 'id:mat-herb', scope: 'ag', group: 'none'})), ['[TEST] Ember Moss', '[TEST] Silverleaf Herb']);
  assert.deepEqual(names(svc.search({query: 'tag:reagent'})), ['[TEST] Silverleaf Herb']);
  assert.deepEqual(names(svc.search({query: 'status:draft'})), ['[TEST] Ember Moss']);
  assert.deepEqual(names(svc.search({query: 'id:MAT- tier:2'})), ['[TEST] Ember Moss']);
  assert.deepEqual(parseQuery('id:MAT-HERB  Héron'), [{field: 'id', value: 'mat-herb'}, {field: null, value: 'heron'}]);
  assert.equal(fold('Éclair'), 'eclair');
});

test('scope, facets with counts, combined filters, managed/unlinked and Clear', () => {
  const {game} = world();
  const svc = createBrowse({game});
  const all = svc.search({});
  assert.equal(all.scopes.all, all.scopes.ag + all.scopes.nonag);
  const nonag = svc.search({scope: 'nonag', group: 'none'});
  assert.deepEqual(nonag.groups[0].rows.map(e => e.name).sort(), ['Herb lore page', 'Hérold the Guard', 'Longsword', '[TEST] Field Guide'].sort());
  const r = svc.search({scope: 'ag', filters: {kind: 'Item'}});
  assert.equal(r.total, 3);
  // Kind counts ignore the kind filter itself, so other kinds stay pickable.
  assert.ok(r.facets.kind.find(o => o.value === 'Location').count === 1);
  assert.equal(r.facets.kind.find(o => o.value === 'Item').selected, true);
  assert.deepEqual(r.facets.quality.map(o => [o.value, o.count]), [['Common', 1], ['Rare', 1]]);
  const both = svc.search({filters: {kind: 'Item', tier: '1', profession: 'PROF-PT-HERBALISM'}});
  assert.equal(both.total, 1);
  assert.equal(both.activeFilters, 3);
  assert.equal(svc.search({filters: {quality: 'Rare', visibility: 'gm'}}).total, 1);
  assert.equal(svc.search({managedOnly: true}).total, 3);
  assert.ok(svc.search({unlinkedOnly: true}).groups.flatMap(g => g.rows).every(e => e.unlinked));
  const html = bodyHtml({...DEFAULT_STATE, filters: {kind: 'Item'}}, r, null, {});
  assert.match(html, /Clear \(1\)/);
  assert.match(html, /Ashen Gate \(\d+\)/);
  assert.match(html, /Non-Ashen Gate \(4\)/);
  assert.match(toolbarHtml(DEFAULT_STATE), /id:MAT-HERB/);
});

test('sort and group', () => {
  const {game} = world();
  const svc = createBrowse({game});
  const items = svc.search({scope: 'all', filters: {kind: 'Item'}, sort: 'changed', group: 'none'}).groups[0].rows.map(e => e.name);
  assert.deepEqual(items, ['Longsword', '[TEST] Silverleaf Herb', '[TEST] Healing Draught', '[TEST] Ember Moss']);
  const byName = svc.search({filters: {kind: 'Item'}, sort: 'name', group: 'none'}).groups[0].rows.map(e => e.name);
  assert.deepEqual(byName, [...byName].sort((a, b) => a.localeCompare(b)));
  const grouped = svc.search({group: 'kind'});
  const labels = grouped.groups.map(g => g.label);
  assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b)));
  assert.equal(grouped.groups.find(g => g.label === 'Item').total, 4);
  assert.equal(svc.search({group: 'owner'}).groups.some(g => g.label === 'Locations'), true);
});

test('2000+ records: index and search stay fast, paging limits rendered rows', () => {
  const {game} = world();
  const many = Array.from({length: 2400}, (_, i) => doc('Item', `x${i}`, `Gen Material ${i}`, {source: src(`MAT-GEN-${String(i).padStart(4, '0')}`, 'Material',
    {definition: {tier: 1 + (i % 4), quality: ['Common', 'Rare', 'Exotic'][i % 3], profession_id: `PROF-${i % 14}`, tags: ['gen']}})}));
  game.items = coll([...game.items.contents, ...many]);
  const svc = createBrowse({game});
  let t = performance.now();
  svc.getIndex();
  const buildMs = performance.now() - t;
  t = performance.now();
  for (const q of ['gen', 'id:MAT-GEN-01', 'material 23', 'tag:gen']) svc.search({query: q, filters: {tier: '2'}, group: 'tier'});
  const searchMs = (performance.now() - t) / 4;
  assert.ok(buildMs < 1500, `build ${buildMs}ms`);
  assert.ok(searchMs < 200, `search ${searchMs}ms`);
  const r = svc.search({query: 'id:MAT-GEN'});
  assert.equal(r.total, 2400);
  assert.equal(r.groups.reduce((n, g) => n + g.rows.length, 0), 100);
  const last = svc.search({query: 'id:MAT-GEN', page: 99});
  assert.equal(last.page, 23);
  assert.equal(last.to, 2400);
  const html = bodyHtml(DEFAULT_STATE, r, null, {});
  assert.equal((html.match(/class="agbrowse-row"/g) ?? []).length, 100);
});

test('index rebuilds after document hooks (debounced) and on Refresh', async () => {
  const {game} = world();
  const h = hooks();
  const svc = createBrowse({game, hooks: h, debounceMs: 5});
  assert.ok(h.names().includes('createItem') && h.names().includes('updateJournalEntryPage') && h.names().includes('deleteActor'));
  assert.equal(svc.search({query: 'newcomer'}).total, 0);
  let notified = 0;
  svc.subscribe(() => notified++);
  game.items = coll([...game.items.contents, doc('Item', 'n1', 'Newcomer Blade')]);
  h.fire('createItem'); h.fire('updateItem'); h.fire('createItem');
  assert.equal(svc.search({query: 'newcomer'}).total, 1);
  await new Promise(r => setTimeout(r, 20));
  assert.equal(notified, 1); // three hooks, one debounced repaint
  game.actors = coll([]);
  assert.equal(svc.search({query: 'herold'}).total, 1); // not invalidated yet
  await svc.refresh();
  assert.equal(svc.search({query: 'herold'}).total, 0);
  svc.dispose();
  assert.deepEqual(h.names(), []);
});

test('GM gate: every API call refuses players', async () => {
  const {game} = world({gm: false});
  const svc = createBrowse({game});
  for (const call of [() => svc.getIndex(), () => svc.search({}), () => svc.detail('Item.i1'), () => svc.status(), () => svc.dragData('Item.i1')])
    assert.throws(call, /Only the GM/);
  await assert.rejects(svc.open('Item.i1'), /Only the GM/);
  await assert.rejects(svc.loadCompendiums(), /Only the GM/);
  await assert.rejects(svc.refresh(), /Only the GM/);
});

test('open actions are feature-detected', async () => {
  const {game, calls, docs} = world();
  const svc = createBrowse({game});
  assert.deepEqual(await svc.open('Item.i4'), {ok: true});
  assert.deepEqual(docs.sword.sheet.rendered, [{force: true}]);
  await svc.open('JournalEntry.j1.JournalEntryPage.p1');
  assert.deepEqual(docs.journal.sheet.rendered, [{force: true, pageId: 'p1'}]);
  assert.equal((await svc.open('ashen-gate-locations/LOC-TEST-TOWN')).ok, true);
  assert.equal((await svc.open('ashen-gate-quest-manager/QUEST-TEST-HERBS')).ok, true);
  assert.equal((await svc.open('ashen-gate-skill-trees/TREE-TEST-HERB/n1')).ok, true);
  const hq = await svc.open('ashen-gate-headquarters/FAC-TEST-GARDEN');
  assert.equal(hq.ok, true); assert.match(hq.message, /no open-at-record API/);
  const fac = await svc.open('ashen-gate-factions/FACTION-TEST-GUILD');
  assert.equal(fac.ok, false); assert.match(fac.message, /Open it in Renown/);
  // Merged world + Ledger row: Open goes to the Ledger only if it can open; Sheet always opens the Item.
  const herb = await svc.open('Item.i1');
  assert.equal(herb.ok, false); assert.match(herb.message, /Profession Ledger/);
  assert.deepEqual(await svc.open('Item.i1', {prefer: 'sheet'}), {ok: true});
  assert.deepEqual(calls.filter(c => c[0] !== 'materials'), [['openLocation', 'LOC-TEST-TOWN'], ['openObjective', 'QUEST-TEST-HERBS'], ['openTree', {treeId: 'TREE-TEST-HERB'}], ['openHQ']]);
  assert.match((await svc.open('nope')).message, /Refresh/);
});

test('drag data matches the sidebar payload; partner-only rows are not draggable', () => {
  const {game} = world();
  const svc = createBrowse({game});
  assert.deepEqual(svc.dragData('Item.i1'), {type: 'Item', uuid: 'Item.i1'});
  assert.deepEqual(svc.dragData('Actor.a1'), {type: 'Actor', uuid: 'Actor.a1'});
  assert.equal(svc.dragData('ashen-gate-locations/LOC-TEST-TOWN'), null);
  assert.deepEqual(dragDataOf({draggable: true, uuid: 'Compendium.dnd5e.items.Item.x', kind: 'Item'}), {type: 'Item', uuid: 'Compendium.dnd5e.items.Item.x'});
  const r = svc.search({query: 'silverleaf'});
  const html = bodyHtml(DEFAULT_STATE, r, null, {});
  assert.match(html, /data-ag-browse-key="Item.i1" draggable="true"/);
  assert.doesNotMatch(bodyHtml(DEFAULT_STATE, svc.search({query: 'testford'}), null, {}), /draggable/);
});

test('details list fields and related records both ways', () => {
  const {game} = world();
  const svc = createBrowse({game});
  const d = svc.detail('Item.i1');
  assert.ok(d.fields.some(f => f.label === 'Found in' && f.value === 'World • Profession Ledger'));
  assert.ok(d.outgoing.some(r => r.id === 'PROF-PT-HERBALISM' && r.key === null));
  const incoming = d.incoming.map(r => r.id).sort();
  assert.deepEqual(incoming, ['LOC-TEST-TOWN', 'REC-HEAL-DRAUGHT']);
  const html = bodyHtml(DEFAULT_STATE, svc.search({}), d, {});
  assert.match(html, /Named by \(2\)/);
  assert.match(html, /not in the index/);
});

test('compendiums: index only, lazy, provenance, deduped against world', async () => {
  const p1 = pack('dnd5e.items', 'Items (SRD)', [{_id: 'c1', name: 'Longbow', type: 'weapon', folder: 'f1', system: {rarity: 'common'}},
    {_id: 'c2', name: 'Silverleaf copy', type: 'loot', flags: {[M]: {source: src('MAT-HERB-SILVERLEAF', 'Material')}}}]);
  const p2 = pack('world.ag-stage', 'AG Staging', [{_id: 'c3', name: 'Staged Rune', type: 'loot', flags: {[M]: {source: src('MAT-TEST-RUNE', 'Material')}}}], {pkg: 'world', locked: false});
  const scenes = pack('dnd5e.scenes', 'Scenes', [{_id: 's1', name: 'Map'}], {type: 'Scene'});
  const hidden = {...pack('x.secret', 'Secret', [{_id: 'z', name: 'Hidden'}]), visible: false};
  const {game} = world({packs: [p1, p2, scenes, hidden]});
  const fromUuid = async uuid => ({uuid, sheet: {render: () => Promise.resolve()}});
  const svc = createBrowse({game, fromUuid});
  assert.equal(svc.search({query: 'longbow'}).total, 0); // not loaded until asked
  assert.equal(p1.asked.length, 0);
  await svc.loadCompendiums();
  assert.ok(p1.asked[0].fields.includes(`flags.${M}.source`));
  assert.equal(scenes.asked.length, 0);
  const bow = svc.search({query: 'longbow'}).groups[0].rows[0];
  assert.equal(bow.provenance, 'Compendium: Items (SRD)');
  assert.equal(bow.folder, 'Items (SRD)/Weapons');
  assert.equal(bow.owner, 'dnd5e');
  assert.equal(bow.ag, false);
  assert.deepEqual(svc.dragData(bow.key), {type: 'Item', uuid: 'Compendium.dnd5e.items.Item.c1'});
  assert.deepEqual(await svc.open(bow.key), {ok: true});
  // Same id as the world Item: merged into it, never a second row.
  const silver = svc.getIndex().filter(e => e.id === 'MAT-HERB-SILVERLEAF');
  assert.equal(silver.length, 1);
  assert.ok(silver[0].sources.includes('Compendium: Items (SRD)'));
  const rune = svc.search({query: 'id:MAT-TEST-RUNE', scope: 'ag'});
  assert.equal(rune.total, 1);
  assert.equal(svc.search({query: 'hidden'}).total, 0);
  assert.equal(svc.status().compendiums, true);
});

test('mergeEntries dedupes by uuid too', async () => {
  const a = {key: 'k1', id: null, uuid: 'Item.1', sources: ['World'], provenance: 'World', refIds: [], hay: 'a'};
  const b = {key: 'k2', id: null, uuid: 'Item.1', sources: ['X'], provenance: 'X', refIds: [], hay: 'b'};
  const out = mergeEntries([a], [b]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].sources, ['World', 'X']);
  assert.equal(typeof compendiumEntries, 'function');
  assert.equal(searchIndex([], {}).total, 0);
});

test('Browse is Items → All items (0.36.0) and a GM-gated API; GM Setup is untouched', async () => {
  const fs = await import('node:fs');
  const template = fs.readFileSync(new URL('../templates/manager.hbs', import.meta.url), 'utf8');
  const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  assert.match(template, /data-ag-tab="items"/);
  assert.match(template, /\{\{#if itemsAll\}\}\s*<div class="agbrowse" data-ag-browse><\/div>/);
  assert.match(main, /browse:\(\(\{getIndex,search,detail,refresh,loadCompendiums,status,dragData,open\}\)/);
  assert.match(main, /dataTransfer\.setData\('text\/plain',JSON\.stringify\(data\)\)/);
});
