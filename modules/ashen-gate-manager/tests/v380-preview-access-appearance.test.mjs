/** 0.38.0: item preview, Player Access on the Modules tab, Appearance dropdown. Mocked Foundry globals: proves logic and markup, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createBrowse, FACETS} from '../scripts/browse.js';
import {bodyHtml, DEFAULT_STATE} from '../scripts/browse-view.js';
import {previewFacts, previewHtml, loadItemPreview, itemTooltipAttrs, folderPathOf} from '../scripts/item-preview.js';
import {moduleCards, accessBadge} from '../scripts/module-cards.js';
import {resolveTab} from '../scripts/item-filters.js';

const M = 'ashen-gate-manager';
const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const tpl = read('../templates/manager.hbs');
const main = read('../scripts/main.js');
const css = read('../styles/manager.css');
const coll = list => ({contents: list, get: id => list.find(x => x.id === id)});

// ---- Item preview ----
const outer = {id: 'F1', name: '[TEST] Gear', folder: null}, inner = {id: 'F2', name: 'Swords', folder: outer};
const worldItem = {documentName: 'Item', id: 'w1', uuid: 'Item.w1', name: '[TEST] Ash Blade', type: 'weapon', folder: inner, _stats: {},
  system: {rarity: 'veryRare', type: {value: 'martialM'}, source: {book: 'XDMG', page: 210, rules: '2024'}, price: {value: 500, denomination: 'gp'},
    weight: {value: 3, units: 'lb'}, attunement: 'required'},
  flags: {[M]: {source: {sourceId: 'ITEM-TEST-ASH', entityType: 'Item', definition: {core_ref: {name: 'Longsword', source: 'PHB 2024'}}}}},
  richTooltip: async () => ({content: '<section class="item-card">[TEST] card</section>', classes: ['dnd5e2', 'dnd5e-tooltip', 'item-tooltip']})};

test('preview facts: where the item lives, full folder path and key attributes', () => {
  assert.equal(folderPathOf(inner), '[TEST] Gear/Swords');
  const f = Object.fromEntries(previewFacts({kind: 'Item', uuid: 'Item.w1'}, worldItem).map(r => [r.label, r.value]));
  assert.equal(f['Lives in'], 'World (Items sidebar)');
  assert.equal(f['Folder path'], '[TEST] Gear/Swords');
  assert.equal(f.UUID, 'Item.w1');
  assert.equal(f.Type, 'weapon · martialM');
  assert.equal(f.Rarity, 'Very rare');
  assert.equal(f.Source, 'XDMG · p. 210 · 2024 rules');
  assert.equal(f.Origin, 'Ashen Gate');
  assert.equal(f.core_ref, 'Longsword · PHB 2024');
  assert.equal(f['Ashen Gate id'], 'ITEM-TEST-ASH');
  assert.equal(f.Price, '500 gp');
  assert.equal(f.Weight, '3 lb');
  assert.equal(f.Attunement, 'Required');
});

test('preview facts: compendium entry names the pack and its folder path; empty attributes are left out', () => {
  const pf = {id: 'PF', name: 'Gems', folder: {id: 'PR', name: 'Treasure', folder: null}};
  const doc = {documentName: 'Item', uuid: 'Compendium.world.loot.Item.p1', name: '[TEST] Ruby', type: 'loot', folder: pf, system: {rarity: 'legendary'}, flags: {}};
  const f = Object.fromEntries(previewFacts({kind: 'Item', pack: 'Loot', packId: 'world.loot', locked: true}, doc).map(r => [r.label, r.value]));
  assert.equal(f['Lives in'], 'Compendium: Loot (world.loot) · locked');
  assert.equal(f['Folder path'], 'Loot/Treasure/Gems');
  assert.equal(f.Origin, 'Homebrew');
  for (const k of ['Price', 'Weight', 'Attunement', 'core_ref', 'Ashen Gate id']) assert.ok(!(k in f), k);
});

test('preview: GM-only, uses dnd5e richTooltip, card first and facts below; non-Items give null', async () => {
  const gm = {user: {isGM: true}};
  await assert.rejects(loadItemPreview({game: {user: {isGM: false}}, entry: {kind: 'Item', uuid: 'Item.w1'}, doc: worldItem}), /Only the GM/);
  const p = await loadItemPreview({game: gm, entry: {kind: 'Item', uuid: 'Item.w1'}, doc: worldItem});
  const html = previewHtml(p);
  assert.ok(html.indexOf('[TEST] card') < html.indexOf('agpreview-facts'), 'item card above the facts');
  assert.match(html, /agpreview-card dnd5e2 dnd5e-tooltip item-tooltip/);
  assert.equal(await loadItemPreview({game: gm, entry: {kind: 'Actor', uuid: 'Actor.a'}}), null);
  const plain = await loadItemPreview({game: gm, entry: {kind: 'Item', uuid: 'Item.x', name: '[TEST] Plain'}, doc: {documentName: 'Item', name: '[TEST] Plain', system: {}, flags: {}}});
  assert.equal(plain.card, null);
  assert.match(previewHtml(plain), /not a dnd5e item/);
});

test('preview of a compendium entry loads that one document by uuid, never the whole pack', async () => {
  const pf = {id: 'PF', name: 'Gems', folder: null};
  let indexCalls = 0, documentsCalls = 0;
  const loaded = [];
  const pack = {collection: 'world.loot', documentName: 'Item', metadata: {label: 'Loot', packageName: 'world'}, folders: coll([pf]),
    getIndex: async () => { indexCalls++; return [{_id: 'p1', name: '[TEST] Ruby', type: 'loot', folder: 'PF', system: {rarity: 'legendary'}}]; },
    getDocuments: async () => { documentsCalls++; return []; }};
  const game = {user: {isGM: true}, items: coll([]), actors: coll([]), journal: coll([]), packs: coll([pack]), modules: {get: () => null}};
  const svc = createBrowse({game, debounceMs: 0, fromUuid: async uuid => { loaded.push(uuid);
    return {documentName: 'Item', uuid, name: '[TEST] Ruby', type: 'loot', folder: pf, system: {rarity: 'legendary'}, flags: {},
      richTooltip: async () => ({content: '<p>[TEST] ruby card</p>', classes: ['item-tooltip']})}; }});
  await svc.loadCompendiums();
  const p = await svc.preview('Compendium.world.loot.Item.p1');
  assert.deepEqual(loaded, ['Compendium.world.loot.Item.p1']);
  assert.equal(indexCalls, 1);
  assert.equal(documentsCalls, 0, 'no full pack load');
  assert.match(previewHtml(p), /\[TEST\] ruby card/);
  assert.match(previewHtml(p), /Loot\/Gems/);
  game.user.isGM = false;
  await assert.rejects(svc.preview('Compendium.world.loot.Item.p1'), /Only the GM/);
});

test('All items: selecting an Item shows the preview slot; Item names carry dnd5e tooltip markup', () => {
  const e = {key: 'Item.w1', uuid: 'Item.w1', name: '[TEST] Ash Blade', kind: 'Item', kinds: ['Item'], sources: ['World'], tags: [], refIds: [], chips: [], extraFields: []};
  const result = {scopes: {all: 1, ag: 1, nonag: 0}, facets: Object.fromEntries(FACETS.map(f => [f, []])), groups: [{label: '', rows: [e]}], total: 1, from: 1, to: 1, page: 0, pages: 1, activeFilters: 0};
  const html = bodyHtml({...DEFAULT_STATE, filters: {}}, result, {entry: e, fields: [], outgoing: [], incoming: []}, {});
  assert.match(html, /data-ag-item-preview="Item\.w1"/);
  assert.match(html, /data-tooltip-html="&lt;section class=&quot;loading&quot; data-uuid=&quot;Item\.w1&quot;/);
  assert.match(html, /data-tooltip-class="item-tooltip"/);
  assert.equal(itemTooltipAttrs(null), '');
  assert.match(itemTooltipAttrs('Item."x'), /Item\.&amp;quot;x/, 'uuid escaped twice (inside the attribute html)');
  assert.match(main, /this\.#fillItemPreview\(body\)/);
  assert.match(tpl, /libraryDetail\.isItem.*data-ag-item-preview="\{\{libraryDetail\.uuid\}\}"/);
  assert.match(tpl, /aglib-row__main[^>]*\{\{\{tooltip\}\}\}/);
});

// ---- Player Access on the Modules tab ----
const launchers = [{id: 'ashen-gate-skill-trees', title: 'Skill Trees', version: '1.0.0', state: 'Ready', canOpen: true, role: 'r'},
  {id: 'ashen-gate-quest-manager', title: 'Quest Log', version: '1.0.0', state: 'Ready', canOpen: true, role: 'r'}];
const access = [{id: 'ashen-gate-skill-trees', title: 'Skill Trees', state: 'Visible', canToggle: true, playerAccessEnabled: true, reason: 'ok'},
  {id: 'ashen-gate-quest-manager', title: 'Quest Log', state: 'Unsupported', canToggle: false, playerAccessEnabled: null, reason: 'This version does not publish ag-player-access/1.'},
  {id: 'ashen-gate-locations', title: 'Locations', state: 'Not installed', canToggle: false, reason: 'Not installed in this world.'}];

test('module cards join launchers with live Player Access; missing expected modules still get a card', () => {
  const cards = moduleCards(launchers, access);
  const by = id => cards.find(c => c.id === id);
  assert.deepEqual([by('ashen-gate-skill-trees').badge.label, by('ashen-gate-skill-trees').canToggle, by('ashen-gate-skill-trees').playerAccessEnabled], ['Visible to players', true, true]);
  assert.deepEqual([by('ashen-gate-quest-manager').canToggle, by('ashen-gate-quest-manager').canOpen], [false, true]);
  assert.deepEqual([by('ashen-gate-locations').badge.label, by('ashen-gate-locations').canOpen], ['Not installed', false]);
  assert.equal(accessBadge('Hidden').label, 'Hidden from players');
  assert.ok(!cards.some(c => c.id === M));
});

test('Modules tab has Reveal / Hide per card plus Refresh and Hide all; Appearance has none of it', () => {
  const mods = tpl.slice(tpl.indexOf('\n  {{#if modulesActive}}'), tpl.indexOf('\n  {{#if scenesActive}}'));
  for (const s of ['data-ag-action="player-access-refresh"', 'data-ag-action="player-access-hide-all"', 'data-ag-player-access-enabled="true"',
    'data-ag-player-access-enabled="false"', 'Reveal to players', 'Hide from players', 'data-ag-module-open="{{id}}"', '{{badge.label}}'])
    assert.ok(mods.includes(s), s);
  assert.ok(mods.indexOf('player-access-hide-all') < mods.indexOf('{{#each moduleCards}}'), 'Refresh / Hide all at the top');
  const pop = tpl.slice(tpl.indexOf('data-ag-appearance-pop'), tpl.indexOf('</header>'));
  assert.doesNotMatch(pop, /player-access/);
  assert.doesNotMatch(tpl, /agmanager-access-compact/);
  // Same safeguards as before: GM check and click-time recheck in the handler, confirmation before Hide all.
  assert.match(main, /if\(!game\.user\?\.isGM\) throw new Error\('Only GMs can change Player Access\.'\);/);
  assert.match(main, /changePlayerAccess\(mod,enabled,\{isGM:game\.user\.isGM\}\)/);
  assert.match(main, /title:'Hide all player windows\?',yes:'Hide all',danger:true/);
  assert.match(main, /playerAccess:\{contract:"ag-player-access\/1"/);
});

// ---- Appearance dropdown ----
test('Appearance is a header dropdown, not a tab; the old tab id opens it on the previous tab', () => {
  assert.doesNotMatch(tpl, /data-ag-tab="appearance"/);
  const header = tpl.slice(0, tpl.indexOf('</header>'));
  for (const s of ['data-ag-appearance-toggle', 'aria-haspopup="dialog"', 'aria-expanded=', 'data-ag-skin-picker="world"', 'ag-skin-card', 'ag-swatch',
    'data-ag-action="appearance-save-world"', 'data-ag-action="appearance-my-appearance"', 'Effective on your screen', '{{appearanceMessage}}'])
    assert.ok(header.includes(s), s);
  assert.ok(header.indexOf('data-ag-appearance-menu') < header.indexOf('data-ag-action="help"'), 'next to Help');
  assert.deepEqual(resolveTab('appearance'), {tab: 'import', view: 'all', appearance: true});
  assert.deepEqual(resolveTab('appearance', {previous: 'modules'}), {tab: 'modules', view: 'all', appearance: true});
  assert.deepEqual(resolveTab('appearance', {previous: 'library', librarySection: 'codex'}), {tab: 'items', view: 'codex', appearance: true});
  assert.match(main, /if\(resolved\.appearance\)this\.appearanceOpen=true;/);
  // Outside click, Escape, focus handling, listener removed on re-render and close.
  assert.match(main, /event\.key==='Escape'/);
  assert.match(main, /document\.addEventListener\('pointerdown',outside,true\)/);
  assert.match(main, /this\.appearanceOff\?\.\(\);this\.appearanceOff=null;this\.appearanceOpen=false;/);
  assert.match(css, /\.agmanager-appearance-pop\{position:absolute;[^}]*width:min\(560px,calc\(100vw - 32px\)\)/);
});

test('Help and GM Setup point to the new places', () => {
  assert.match(main, /<strong>Appearance<\/strong> \(top bar, next to Help\)/);
  assert.match(main, /Reveal to players<\/strong> \/ <strong>Hide from players/);
  const setup = tpl.slice(tpl.indexOf('\n  {{#if setupActive}}'), tpl.indexOf('\n  {{#if historyActive}}'));
  assert.match(setup, /<strong>Appearance<\/strong> dropdown at the top/);
  assert.match(setup, /<strong>Modules<\/strong> tab/);
});
