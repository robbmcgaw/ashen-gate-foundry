/** Items tab (0.36.0). Proves logic and markup with mocked Foundry globals, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {originOf, rarityKey, sharedMatch, activeFilterCount, resolveTab, folderChain, itemFacts, ITEM_VIEWS, DEFAULT_FILTERS} from '../scripts/item-filters.js';
import {createBrowse, searchIndex, filterEntries, PAGE_SIZE} from '../scripts/browse.js';
import {bodyHtml, DEFAULT_STATE} from '../scripts/browse-view.js';
import {createOrganizer, describePreview, SCHEMA_SETTING, HISTORY_SETTING} from '../scripts/organize.js';

const M = 'ashen-gate-manager';
const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const tpl = read('../templates/manager.hbs');
const main = read('../scripts/main.js');
const css = read('../styles/manager.css');

// ---- Origin, rarity and the shared filters ----
test('origin comes from importer flags and system.source, never from names', () => {
  assert.equal(originOf({flags: {[M]: {source: {sourceId: 'MAT-TEST-A'}}}, system: {source: {rules: '2024'}}}), 'ag', 'Ashen Gate wins');
  assert.equal(originOf({flags: {ddbimporter: {id: 1}}}), 'ddb');
  assert.equal(originOf({flags: {plutonium: {page: 'items.html'}}, system: {source: {book: 'XPHB'}}}), 'ddb');
  assert.equal(originOf({system: {source: {rules: '2024'}}}), 'homebrew', '0.38.1: dnd5e default rules alone');
  assert.equal(originOf({system: {source: {rules: '2024', book: 'XPHB'}}}), 'core24');
  assert.equal(originOf({system: {source: {book: "DMG'24"}}}), 'core24');
  assert.equal(originOf({system: {source: {book: 'SRD 5.1'}}}), 'core14');
  assert.equal(originOf({system: {source: {rules: '2014'}}}), 'homebrew', '0.38.1: legacy-world default rules alone');
  assert.equal(originOf({system: {source: {rules: '2014', book: 'PHB'}}}), 'core14');
  assert.equal(originOf({system: {}}, 'dnd5e.equipment24'), 'core24', 'dnd5e 2024 pack');
  assert.equal(originOf({system: {}}, 'dnd5e.items'), 'core14', 'dnd5e legacy SRD pack');
  assert.equal(originOf({system: {source: {book: 'My Homebrew'}}}), 'homebrew');
  assert.equal(originOf({}), 'homebrew');
});

test('rarity keys follow dnd5e; the colours are shared CSS variables', () => {
  assert.equal(rarityKey('veryRare'), 'veryrare');
  assert.equal(rarityKey('Very Rare'), 'veryrare');
  assert.equal(rarityKey('legendary'), 'legendary');
  assert.equal(rarityKey('Fine'), null);
  assert.equal(rarityKey(''), null);
  // Kit 2: the hues are kit tokens in ag-ui.css (Common grey); Manager no longer defines them, only maps its classes.
  const kit = fs.readFileSync(new URL('../styles/ag-ui.css', import.meta.url), 'utf8');
  for (const [k, colour] of [['common', '#b9b4aa'], ['uncommon', '#3fbf5a'], ['rare', '#3d8bfd'], ['very-rare', '#a35ce6'], ['legendary', '#ff8c1a'], ['artifact', '#e5383b']])
    assert.ok(kit.includes(`--ag-rarity-${k}: ${colour};`), k);
  assert.doesNotMatch(css, /--ag-rarity-[a-z-]+:#/, 'Manager CSS no longer declares the hues');
  assert.match(css, /\.ag-rarity--veryrare\{--ag-rarity-color:var\(--ag-rarity-very-rare\)\}/, 'veryrare markup keeps its colour');
});

test('folder chain walks objects or ids up to the root', () => {
  const root = {id: 'R', name: 'Root', folder: null}, sub = {id: 'S', name: 'Sub', folder: root};
  assert.deepEqual(folderChain(sub), ['S', 'R']);
  const byId = new Map([['S', {id: 'S', folder: 'R'}], ['R', {id: 'R', folder: null}]]);
  assert.deepEqual(folderChain('S', id => byId.get(id)), ['S', 'R']);
  assert.deepEqual(folderChain(null), []);
});

test('sharedMatch: every filter narrows; all off passes everything; records with no source pass only All sources', () => {
  const e = {source: 'world', docType: 'weapon', origin: 'ddb', rarity: 'rare', folderIds: ['S', 'R'], coreRef: false};
  assert.ok(sharedMatch(e, DEFAULT_FILTERS));
  assert.ok(sharedMatch(e, {source: 'world', type: 'weapon', origin: 'ddb', rarity: 'rare', folder: 'R'}));
  for (const f of [{source: 'dnd5e.items'}, {type: 'spell'}, {origin: 'ag'}, {rarity: 'common'}, {folder: 'X'}, {coreRef: true}])
    assert.equal(sharedMatch(e, f), false, JSON.stringify(f));
  assert.ok(sharedMatch({source: null}, {source: 'all'}));
  assert.equal(sharedMatch({source: null}, {source: 'world'}), false);
  assert.equal(activeFilterCount(DEFAULT_FILTERS), 0);
  assert.equal(activeFilterCount({...DEFAULT_FILTERS, query: 'bow', origin: 'ddb', coreRef: true}), 3);
});

test('old tab ids open the matching rail entry; other tabs are unchanged', () => {
  assert.deepEqual(resolveTab('browse'), {tab: 'items', view: 'all'});
  assert.deepEqual(resolveTab('library'), {tab: 'items', view: 'records'});
  assert.deepEqual(resolveTab('library', {librarySection: 'codex'}), {tab: 'items', view: 'codex'});
  assert.deepEqual(resolveTab('library', {librarySection: 'check'}), {tab: 'items', view: 'checks'});
  assert.deepEqual(resolveTab('organize'), {tab: 'items', view: 'folders'});
  assert.deepEqual(resolveTab('corelinks'), {tab: 'items', view: 'corelinks'});
  assert.deepEqual(resolveTab('items', {view: 'nonsense'}), {tab: 'items', view: 'all'});
  assert.deepEqual(resolveTab('scenes', {view: 'folders'}), {tab: 'scenes', view: 'folders'});
  assert.deepEqual(ITEM_VIEWS.slice(0, 5).map(v => v.id), ['all', 'records', 'folders', 'corelinks', 'checks']);
});

// ---- Browse index with the shared filters ----
const coll = list => ({contents: list, get: id => list.find(x => x.id === id)});
function itemDoc(id, name, {type = 'loot', system = {}, flags = {}, folder = null} = {}) {
  return {documentName: 'Item', id, uuid: `Item.${id}`, name, type, system, flags, folder, _stats: {}};
}
function browseWorld(items, packs = []) {
  const game = {user: {isGM: true}, items: coll(items), actors: coll([]), journal: coll([]), packs: coll(packs), modules: {get: () => null}};
  return {game, svc: createBrowse({game, debounceMs: 0})};
}

test('Browse entries carry source, origin, rarity, folder chain and core_ref; search honours the shared filters', async () => {
  const ddbFolder = {id: 'FD', name: 'DDB', folder: null}, sub = {id: 'FS', name: 'Swords', folder: ddbFolder};
  const items = [
    itemDoc('a', '[TEST] DDB Blade', {type: 'weapon', system: {rarity: 'rare'}, flags: {ddbimporter: {id: 9}}, folder: sub}),
    itemDoc('b', '[TEST] DDB Cloak', {type: 'equipment', system: {rarity: 'veryRare'}, flags: {ddbimporter: {id: 10}}, folder: ddbFolder}),
    itemDoc('c', '[TEST] Core Potion', {type: 'consumable', system: {rarity: 'common', source: {rules: '2024', book: 'XDMG'}}}),
    itemDoc('d', '[TEST] AG Tonic', {type: 'consumable', flags: {[M]: {source: {sourceId: 'ITEM-TEST-TONIC', entityType: 'Item', definition: {core_ref: {name: 'Potion of Healing'}}}}}})
  ];
  const pack = {collection: 'world.loot', documentName: 'Item', metadata: {label: 'Loot', packageName: 'world'}, folders: coll([{id: 'PF', name: 'Gems', folder: null}]),
    getIndex: async ({fields}) => {
      assert.ok(fields.includes('system.source') && fields.includes('flags.plutonium') && fields.includes('flags.ddbimporter'), 'index asks for origin fields');
      return [{_id: 'p1', name: '[TEST] Ruby', type: 'loot', folder: 'PF', system: {rarity: 'legendary'}}];
    }};
  const {svc} = browseWorld(items, [pack]);
  const byName = name => svc.getIndex().find(e => e.name === name);
  assert.deepEqual([byName('[TEST] DDB Blade').origin, byName('[TEST] DDB Blade').rarity, byName('[TEST] DDB Blade').folderIds], ['ddb', 'rare', ['FS', 'FD']]);
  assert.equal(byName('[TEST] DDB Cloak').rarity, 'veryrare');
  assert.equal(byName('[TEST] Core Potion').origin, 'core24');
  assert.equal(byName('[TEST] AG Tonic').coreRef, true);
  assert.equal(byName('[TEST] AG Tonic').docId, 'd');

  const names = shared => searchIndex(svc.getIndex(), {shared, group: 'none'}).groups.flatMap(g => g.rows.map(r => r.name)).sort();
  assert.deepEqual(names({origin: 'ddb'}), ['[TEST] DDB Blade', '[TEST] DDB Cloak']);
  assert.deepEqual(names({folder: 'FD'}), ['[TEST] DDB Blade', '[TEST] DDB Cloak'], 'folder includes sub-folders');
  assert.deepEqual(names({folder: 'FS'}), ['[TEST] DDB Blade']);
  assert.deepEqual(names({rarity: 'veryrare'}), ['[TEST] DDB Cloak']);
  assert.deepEqual(names({coreRef: true}), ['[TEST] AG Tonic']);
  assert.deepEqual(names({type: 'consumable', origin: 'core24'}), ['[TEST] Core Potion']);

  await svc.loadCompendiums();
  const ruby = byName('[TEST] Ruby');
  assert.deepEqual([ruby.source, ruby.origin, ruby.rarity, ruby.folderIds, ruby.docId], ['world.loot', 'homebrew', 'legendary', ['PF'], 'p1']);
  assert.deepEqual(names({source: 'world.loot'}), ['[TEST] Ruby']);
  assert.equal(names({source: 'world'}).includes('[TEST] Ruby'), false);
  // Unpaged selection = same filters plus the search text.
  assert.deepEqual(filterEntries(svc.getIndex(), {query: 'blade', shared: {origin: 'ddb'}}).map(e => e.docId), ['a']);
  const html = bodyHtml(DEFAULT_STATE, searchIndex(svc.getIndex(), {shared: {rarity: 'legendary'}}), null, {});
  assert.match(html, /class="ag-rarity ag-rarity--legendary"><i aria-hidden="true"><\/i>Legendary/);
});

test('a world with 2500 items: one page of 100 rows, filtered quickly', () => {
  const items = Array.from({length: 2500}, (_, n) => itemDoc(`i${n}`, `[TEST] Item ${n}`, {type: n % 2 ? 'weapon' : 'loot',
    system: {rarity: ['common', 'rare'][n % 2]}, flags: n % 5 ? {} : {ddbimporter: {id: n}}}));
  const {svc} = browseWorld(items);
  const t0 = performance.now();
  const r = svc.search({shared: {origin: 'ddb'}, group: 'none'});
  const ms = performance.now() - t0;
  assert.equal(r.total, 500);
  assert.equal(r.groups.flatMap(g => g.rows).length, PAGE_SIZE, 'only one page is drawn');
  assert.equal(r.pages, 5);
  assert.ok(ms < 2000, `index + search took ${ms} ms`);
  assert.equal(filterEntries(svc.getIndex(), {shared: {origin: 'ddb', type: 'loot'}}).length, 250);
});

// ---- Organize: this selection or folder ----
function orgWorld({items = [], folders = [], gm = true} = {}) {
  const store = {[SCHEMA_SETTING]: [], [HISTORY_SETTING]: []};
  const writes = [];
  const game = {user: {isGM: gm}, settings: {get: (ns, k) => structuredClone(store[k]), set: async (ns, k, v) => {store[k] = v;}},
    items: {contents: items}, actors: {contents: []}, journal: {contents: []}, folders: {contents: folders}, packs: {contents: []}};
  const api = createOrganizer({game, updateDocuments: async (name, updates) => {writes.push(...updates); for (const u of updates) items.find(i => i.id === u._id).folder = u.folder;},
    createFolder: async d => {const f = {id: `F-${d.name}`, ...d}; return f;}});
  return {api, store, writes};
}
const userFolder = {id: 'FU', name: 'My stuff', type: 'Item', folder: null, flags: {}};
const userSub = {id: 'FUS', name: 'Swords', type: 'Item', folder: 'FU', flags: {}};
const loose = () => [
  {id: 'A', name: '[TEST] A', type: 'weapon', folder: 'FU', flags: {ddbimporter: {id: 1}}, system: {}},
  {id: 'B', name: '[TEST] B', type: 'weapon', folder: 'FUS', flags: {ddbimporter: {id: 2}}, system: {}},
  {id: 'C', name: '[TEST] C', type: 'weapon', folder: null, flags: {}, system: {}},
  {id: 'D', name: '[TEST] D', type: 'loot', folder: null, flags: {}, system: {}}];

test('Organize ids: Preview and Apply touch only the selection; history notes it; Undo puts it back', async () => {
  const items = loose();
  const {api, store, writes} = orgWorld({items, folders: [userFolder, userSub]});
  const whole = await api.preview({source: 'world', types: ['Item'], mode: 'all'});
  assert.equal(whole.totals.moves, 4);
  const sel = await api.preview({source: 'world', types: ['Item'], mode: 'all', ids: ['A', 'C']});
  assert.deepEqual(sel.parts[0].moves.map(m => m.id).sort(), ['A', 'C']);
  assert.deepEqual(sel.ids, ['A', 'C']);
  assert.match(describePreview(sel, 'the selection in the world sidebar'), /^Preview: 2 of 2 document\(s\) in the selection in the world sidebar would move/);
  const out = await api.apply({source: 'world', types: ['Item'], mode: 'all', ids: ['A', 'C']});
  assert.equal(out.moved, 2);
  assert.deepEqual(writes.map(w => w._id).sort(), ['A', 'C']);
  assert.deepEqual(store[HISTORY_SETTING][0].narrowed, {count: 2, folderId: null});
  assert.equal(items.find(i => i.id === 'B').folder, 'FUS', 'unselected document untouched');
  const undo = await api.undoLast();
  assert.equal(undo.restored, 2);
  assert.equal(items.find(i => i.id === 'A').folder, 'FU');
});

test('Organize folderId: that folder and its sub-folders only; protected folders and Keep here still skip; bad folder refused', async () => {
  const {api} = orgWorld({items: loose(), folders: [userFolder, userSub]});
  const f = await api.preview({source: 'world', types: ['Item'], mode: 'all', folderId: 'FU'});
  assert.deepEqual(f.parts[0].moves.map(m => m.id).sort(), ['A', 'B']);
  const misfiled = await api.preview({source: 'world', types: ['Item'], folderId: 'FU'});
  assert.equal(misfiled.totals.moves, 0, 'default move mode still leaves your own folders alone');
  const prot = orgWorld({items: loose(), folders: [{...userFolder, flags: {[M]: {organizeProtected: true}}}, userSub]});
  const p = await prot.api.preview({source: 'world', types: ['Item'], mode: 'all', folderId: 'FU'});
  assert.equal(p.totals.moves, 0);
  assert.equal(p.totals.skipped, 2);
  const kept = loose(); kept[0].flags[M] = {keepFolder: true};
  assert.deepEqual((await orgWorld({items: kept, folders: [userFolder, userSub]}).api.preview({source: 'world', types: ['Item'], mode: 'all', ids: ['A', 'B']})).parts[0].moves.map(m => m.id), ['B']);
  const bad = await api.preview({source: 'world', types: ['Item'], folderId: 'NOPE'});
  assert.equal(bad.ok, false);
  assert.equal((await api.apply({source: 'world', types: ['Item'], folderId: 'NOPE'})).ok, false);
  assert.equal((await api.preview({source: 'world', types: ['Item'], ids: 'A'})).ok, false, 'ids must be a list');
});

test('a narrowed run files crafted items by their recipe tier exactly like a full run', async () => {
  // Not [TEST]-named: the default rules file [TEST] records under Playtest before tier rules apply.
  const recipe = {id: 'R1', name: 'Sample Recipe', type: 'loot', folder: null, system: {}, flags: {[M]: {source: {sourceId: 'REC-TEST-1', entityType: 'Recipe', definition: {tier: 'tier-2'}}}}};
  const crafted = {id: 'K1', name: 'Sample Crafted', type: 'loot', folder: null, system: {}, flags: {[M]: {source: {sourceId: 'ITEM-TEST-K', entityType: 'Item', definition: {created_by_recipe_id: 'REC-TEST-1'}}}}};
  const {api} = orgWorld({items: [recipe, crafted]});
  const full = (await api.preview({source: 'world', types: ['Item']})).parts[0].moves.find(m => m.id === 'K1').to;
  const only = (await api.preview({source: 'world', types: ['Item'], ids: ['K1']})).parts[0].moves;
  assert.deepEqual(only.map(m => [m.id, m.to]), [['K1', full]]);
  assert.match(full, /Tier 2\/Crafted Items$/);
});

test('players are refused by Organize and Browse before anything is read', async () => {
  const {api} = orgWorld({items: loose(), gm: false});
  assert.equal((await api.preview({ids: ['A']})).ok, false);
  assert.equal((await api.apply({folderId: 'FU'})).ok, false);
  const {svc} = browseWorld([]);
  const game = {user: {isGM: false}, items: coll([]), actors: coll([]), journal: coll([]), packs: coll([])};
  assert.throws(() => createBrowse({game}).search({shared: {origin: 'ddb'}}), /Only the GM/);
  assert.ok(svc);
});

// ---- Clean compendiums ----
function cleanWorld({gm = true, packs = [], items = loose(), folders = [userFolder, userSub]} = {}) {
  const store = {[SCHEMA_SETTING]: [], [HISTORY_SETTING]: []};
  const calls = [];
  const game = {user: {isGM: gm}, settings: {get: (ns, k) => structuredClone(store[k]), set: async (ns, k, v) => {store[k] = v;}},
    items: {contents: items}, actors: {contents: []}, journal: {contents: []}, folders: {contents: folders}, packs: {contents: packs}};
  const docsOf = opts => opts.pack ? packs.find(p => p.collection === opts.pack).docs : items;
  const api = createOrganizer({game,
    updateDocuments: async (name, updates, opts) => {calls.push({name, n: updates.length, pack: opts.pack ?? null});
      for (const u of updates) docsOf(opts).find(d => (d._id ?? d.id) === u._id).folder = u.folder;},
    createFolder: async (d, opts) => {const f = {id: `F-${d.name}-${opts.pack ?? 'w'}`, ...d}; return f;}});
  return {api, store, calls};
}
function mkPack(collection, {packageType = 'world', locked = false, docs = []} = {}) {
  return {collection, documentName: 'Item', locked, metadata: {packageType, label: collection}, folders: {contents: []}, docs,
    index: {size: docs.length}, getIndex: async () => docs.map(d => ({...d}))};
}

test('Clean compendiums: one preview over the world and every writable compendium; locked and module packs listed as skipped', async () => {
  const ddb = mkPack('world.ddb', {docs: [{_id: 'P1', name: 'DDB Sword', type: 'weapon', folder: null, flags: {ddbimporter: {id: 1}}, system: {}}]});
  const locked = mkPack('world.locked', {locked: true, docs: [{_id: 'L1', name: 'Locked thing', type: 'loot', folder: null, flags: {}, system: {}}]});
  const sys = mkPack('dnd5e.items', {packageType: 'system', docs: [{_id: 'S1', name: 'SRD Dagger', type: 'weapon', folder: null, flags: {}, system: {}}]});
  const progress = [];
  const {api} = cleanWorld({packs: [ddb, locked, sys]});
  const out = await api.cleanPreview({onProgress: p => progress.push(p)});
  assert.equal(out.ok, true);
  assert.deepEqual(out.sources.map(s => [s.key, s.writable, s.locked]),
    [['world', true, false], ['pack:world.ddb', true, false], ['pack:world.locked', false, true], ['pack:dnd5e.items', false, false]]);
  assert.equal(out.totals.moves, 5, '4 world items (own folders included) + 1 DDB pack item');
  assert.match(out.sources[2].reason, /locked/);
  assert.match(out.sources[3].reason, /inspect-only/);
  assert.deepEqual(progress.at(-1), {done: 4, total: 4, label: ''});
  assert.equal(progress.length, 5);
});

test('Clean compendiums: Commit moves only ticked moves, in batches, across places; one Undo puts it all back', async () => {
  const many = Array.from({length: 600}, (_, n) => ({_id: `P${n}`, name: `Pack item ${n}`, type: 'weapon', folder: null, flags: {}, system: {}}));
  const pack = mkPack('world.big', {docs: many});
  const items = loose();
  const {api, store, calls} = cleanWorld({packs: [pack], items});
  const prev = await api.cleanPreview();
  const keys = prev.sources.flatMap(s => s.parts.flatMap(p => p.moves.map(m => api.moveKey(s.key, p.documentName, m.id))));
  assert.equal(keys.length, 604);
  const ticked = keys.filter(k => k !== 'world|Item|A');
  const progress = [];
  const out = await api.cleanApply({moves: ticked, onProgress: p => progress.push(p.done)});
  assert.equal(out.moved, 603);
  assert.equal(items.find(i => i.id === 'A').folder, 'FU', 'unticked move left alone');
  assert.ok(calls.every(c => c.n <= 250), 'batches of at most 250');
  assert.deepEqual(calls.filter(c => c.pack === 'world.big').map(c => c.n), [250, 250, 100]);
  assert.equal(progress.at(-1), 603, 'progress ends at the number written');
  assert.equal(store[HISTORY_SETTING][0].source, 'clean');
  const backup = api.cleanBackupOf(prev, ['world|Item|C', 'pack:world.big|Item|P0']);
  assert.deepEqual(backup.documents.map(d => [d.source, d.id]), [['world', 'C'], ['pack:world.big', 'P0']]);
  const undo = await api.undoLast();
  assert.equal(undo.restored, 603);
  assert.equal(pack.docs[0].folder, null);
  assert.equal(items.find(i => i.id === 'B').folder, 'FUS');
});

test('Clean compendiums never moves protected folders, skips moves that changed since preview, and refuses players', async () => {
  const items = loose();
  const {api} = cleanWorld({items, folders: [{...userFolder, flags: {[M]: {organizeProtected: true}}}, userSub]});
  const prev = await api.cleanPreview();
  const ids = prev.sources[0].parts.find(p => p.documentName === 'Item').moves.map(m => m.id).sort();
  assert.deepEqual(ids, ['C', 'D'], 'A and B sit in a protected folder (B via its parent)');
  // Ticking a key for a protected document does nothing.
  const out = await api.cleanApply({moves: ['world|Item|A', 'world|Item|C']});
  assert.equal(out.moved, 1);
  assert.match(out.message, /1 ticked document\(s\) changed since the preview/);
  assert.equal(items.find(i => i.id === 'A').folder, 'FU');
  const player = cleanWorld({gm: false});
  assert.equal((await player.api.cleanPreview()).ok, false);
  assert.equal((await player.api.cleanApply({moves: ['world|Item|C']})).ok, false);
  assert.equal((await api.cleanApply({moves: 'world|Item|C'})).ok, false);
});

test('Clean compendiums button: exact name, preview with ticks, labelled Commit, backup and Cancel', () => {
  const org = tpl.slice(tpl.indexOf('{{#if organizeActive}}'), tpl.indexOf('{{#if coreLinksActive}}'));
  assert.match(org, /data-ag-action="clean-scan"><i class="fa-solid fa-broom" aria-hidden="true"><\/i> Clean compendiums<\/button>/);
  for (const h of ['data-ag-clean-move="{{key}}"', 'data-ag-clean-part="{{partKey}}"', 'data-ag-action="clean-commit"', 'data-ag-action="clean-backup"', 'data-ag-action="clean-cancel"', 'data-ag-clean-status', 'Skipped compendiums'])
    assert.ok(org.includes(h), h);
  assert.ok(org.indexOf('data-ag-action="clean-cancel"') < org.indexOf('data-ag-action="clean-commit"'), 'Cancel left, Commit right');
  assert.match(main, /yes:\{label:`Commit \$\{keys\.length\} move\(s\)`\}/);
  assert.match(main, /Locked, skipped\. Unlock it in the Compendium sidebar/);
});

// ---- Markup and wiring ----
test('top bar: Items replaces Browse, Library, Organize and Core Links; the rail and shared filters are there', () => {
  const nav = tpl.slice(tpl.indexOf('<nav class="ag-tabs'), tpl.indexOf('</nav>'));
  assert.match(nav, /data-ag-tab="items"/);
  for (const old of ['browse', 'library', 'organize', 'corelinks']) assert.doesNotMatch(nav, new RegExp(`data-ag-tab="${old}"`), old);
  const items = tpl.slice(tpl.indexOf('\n  {{#if itemsActive}}'), tpl.indexOf('\n  {{#if modulesActive}}'));
  assert.match(items, /data-ag-items-view="\{\{id\}\}"/);
  for (const f of ['source', 'type', 'origin', 'rarity', 'folder']) assert.ok(items.includes(`data-ag-items-filter="${f}"`), f);
  for (const h of ['data-ag-items-query', 'data-ag-items-coreref', 'data-ag-items-clear', 'data-ag-browse>'])
    assert.ok(items.includes(h), h);
  // Every rail view lives inside the Items tab.
  for (const flag of ['itemsAll', 'libraryRecordsActive', 'organizeActive', 'coreLinksActive', 'libraryCheckActive', 'libraryExportActive', 'libraryAdoptActive', 'libraryCodexActive'])
    assert.ok(items.includes(`{{#if ${flag}}}`), flag);
});

test('Organize keeps preview, backup, undo, protected folders, Keep here and confirmation; gains the selection scope', () => {
  const org = tpl.slice(tpl.indexOf('{{#if organizeActive}}'), tpl.indexOf('{{#if coreLinksActive}}'));
  for (const a of ['org-preview', 'org-backup', 'org-apply', 'org-undo', 'org-clear', 'org-schema-edit', 'org-schema-reset'])
    assert.ok(org.includes(`data-ag-action="${a}"`), a);
  for (const h of ['data-ag-org-protect', 'data-ag-org-unprotect', 'data-ag-org-keep', 'value="selection" data-ag-org-scope', 'value="all" data-ag-org-scope'])
    assert.ok(org.includes(h), h);
  assert.match(main, /yes:\{label:'Apply organize'\}/);
  assert.match(main, /yes:\{label:'Undo last organize'\}/);
  assert.match(main, /const planned=\{source:p\.source,types:p\.types,mode:p\.mode,ids:p\.ids,folderId:p\.folderId\};\s*const out=await api\.apply\(planned\);/,
    'Apply runs exactly what was previewed');
  // Housekeeping moved to Checks, next to Check library.
  const checks = tpl.slice(tpl.indexOf('{{#if libraryCheckActive}}'), tpl.indexOf('{{#if libraryExportActive}}'));
  assert.ok(checks.includes('data-ag-action="library-check"') && checks.includes('data-ag-action="org-housekeeping"'));
  assert.doesNotMatch(org, /org-housekeeping/);
});

test('Core links: Apply and backup use only ticked rows the filters show; Apply stays opt-in and confirmed', () => {
  const cl = tpl.slice(tpl.indexOf('{{#if coreLinksActive}}'), tpl.indexOf('\n  {{#if modulesActive}}'));
  for (const a of ['cl-scan', 'cl-backup', 'cl-apply', 'cl-undo', 'cl-clear']) assert.ok(cl.includes(`data-ag-action="${a}"`), a);
  assert.match(cl, /hidden by the filters above/);
  assert.match(main, /const ids=new Set\(this\.#coreLinkChosen\(\)\);/);
  assert.match(main, /api\.backupOf\(this\.clPreview,ids\)/);
  assert.match(main, /yes:\{label:'Link core items'\}/);
});

test('public API names are unchanged and stay GM-gated; Codex open goes to Items → NPC Codex', () => {
  assert.match(main, /coreLinks:\(\(\{preview,apply,undoLast,history,describeSources,saveSources\}\)/);
  assert.match(main, /organize:\(\(\{listSources,preview,apply,undoLast,history,getSchema,saveSchema,resetSchema,setFolderProtected,setKeepFolder,housekeeping,cleanPreview,cleanApply\}\)/,
    'existing names kept; Clean compendiums adds two');
  assert.match(main, /browse:\(\(\{getIndex,search,detail,refresh,loadCompendiums,status,dragData,open\}\)/);
  assert.match(main, /Object\.assign\(activeApp,\{tab:'items',itemsView:'codex',codexFocus:id\}\)/);
  assert.match(main, /if\(!game\.user\?\.isGM\)throw new Error\('Only GMs can open the General Manager\.'\)/);
});
