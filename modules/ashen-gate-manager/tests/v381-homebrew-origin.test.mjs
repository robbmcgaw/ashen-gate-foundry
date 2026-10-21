/** 0.38.1: Core 5.5e needs positive evidence; dnd5e's default source.rules on a hand-made Item is Homebrew. Mocked Foundry documents: proves logic, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {coreEvidence, isCoreSource, isSource2024, bookKey} from '../scripts/core-links.js';
import {originOf} from '../scripts/item-filters.js';
import {createOrganizer, factsOf, whyOf, DEFAULT_RULES, SCHEMA_SETTING, HISTORY_SETTING, FLAG_PROTECTED, FLAG_KEEP} from '../scripts/organize.js';

const M = 'ashen-gate-manager';
const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
// What dnd5e 6.0.6 SourceField gives a new Item made by hand: rules from the world's rules setting, revision 1, the rest empty.
const DEFAULT_SOURCE = {book: '', page: '', custom: '', license: '', revision: 1, rules: '2024'};
const handmade = (id, name, type = 'loot', extra = {}) => ({id, name, type, folder: null, flags: {}, system: {source: {...DEFAULT_SOURCE}}, _stats: {}, ...extra});

test('a hand-made Item with dnd5e default source is Homebrew everywhere', () => {
  const doc = handmade('H1', 'Note from the Mayor');
  const e = coreEvidence(doc);
  assert.equal(e.core, false);
  assert.match(e.reason, /no source book \(rules "2024" alone is dnd5e's default/);
  assert.equal(isCoreSource(doc), false);
  assert.equal(isSource2024(doc), false, 'never a Core Links candidate');
  assert.equal(originOf(doc), 'homebrew');
  assert.equal(factsOf(doc, 'Item').sourceTagged, false);
  // Same in a legacy-rules world (dnd5e defaults rules to "2014" there).
  const legacy = handmade('H2', 'Old Map', 'loot', {system: {source: {...DEFAULT_SOURCE, rules: '2014'}}});
  assert.equal(isCoreSource(legacy), false);
  assert.equal(originOf(legacy), 'homebrew');
  // A custom source is Homebrew and says so.
  assert.match(coreEvidence({system: {source: {...DEFAULT_SOURCE, custom: 'My table'}}}).reason, /custom source "My table"/);
});

test('positive evidence: Plutonium, a core book (codes or full titles), a dnd5e pack: strong', () => {
  const cases = [
    [{flags: {plutonium: {source: 'XPHB'}}, system: {source: {...DEFAULT_SOURCE}}}, '2024', /Plutonium import/],
    [{system: {source: {...DEFAULT_SOURCE, book: 'PHB 2024'}}}, '2024', /source book PHB 2024/],
    [{system: {source: {...DEFAULT_SOURCE, book: "Player's Handbook (2024)"}}}, '2024', /Player's Handbook \(2024\)/],
    [{system: {source: {...DEFAULT_SOURCE, book: "Dungeon Master's Guide", rules: '2014'}}}, '2014', /Dungeon Master's Guide/],
    [{system: {source: {...DEFAULT_SOURCE, book: 'SRD 5.1', rules: '2014'}}}, '2014', /SRD 5\.1/],
    [{system: {source: {...DEFAULT_SOURCE, book: 'SRD 5.2'}}}, '2024', /SRD 5\.2/]
  ];
  for (const [doc, edition, reason] of cases) {
    const e = coreEvidence(doc);
    assert.deepEqual([e.core, e.strong, e.edition], [true, true, edition], JSON.stringify(doc));
    assert.match(e.reason, reason);
  }
  assert.equal(bookKey("Monster Manual 2024"), 'MM24');
  assert.deepEqual([coreEvidence({system: {}}, 'dnd5e.equipment24').core, coreEvidence({system: {}}, 'dnd5e.equipment24').edition], [true, '2024']);
  assert.equal(originOf({system: {source: {...DEFAULT_SOURCE}}}, 'dnd5e.items'), 'core14');
});

test('weak evidence: copied from a dnd5e compendium, or a D&D Beyond import with no core book', () => {
  const copied = {system: {source: {...DEFAULT_SOURCE}}, _stats: {compendiumSource: 'Compendium.dnd5e.equipment24.Item.abc'}};
  assert.deepEqual((({core, strong, edition}) => [core, strong, edition])(coreEvidence(copied)), [true, false, '2024']);
  // A book dnd5e filled in from that compendium (prepared data only, empty in _source) is still weak.
  const filled = {...copied, _source: {system: {source: {...DEFAULT_SOURCE}}}, system: {source: {...DEFAULT_SOURCE, book: 'SRD 5.2'}}};
  assert.equal(coreEvidence(filled).strong, false);
  // A book the GM or an importer stored is strong.
  const stored = {_source: {system: {source: {book: 'XPHB'}}}, system: {source: {book: 'XPHB'}}};
  assert.equal(coreEvidence(stored).strong, true);
  const ddb = {flags: {ddbimporter: {id: 7}}, system: {source: {...DEFAULT_SOURCE}}};
  assert.deepEqual([coreEvidence(ddb).core, coreEvidence(ddb).strong], [true, false]);
  assert.equal(coreEvidence({flags: {ddbimporter: {dndbeyond: {homebrew: true}}}, system: {source: {...DEFAULT_SOURCE}}}).core, false, 'D&D Beyond homebrew');
  // A world copy of a non-dnd5e compendium entry is not core.
  assert.equal(coreEvidence({system: {source: {...DEFAULT_SOURCE}}, _stats: {compendiumSource: 'Compendium.world.handouts.Item.x'}}).core, false);
});

function world(items, folders = []) {
  const store = {[SCHEMA_SETTING]: [], [HISTORY_SETTING]: []};
  const game = {user: {isGM: true}, settings: {get: (ns, k) => structuredClone(store[k]), set: async (ns, k, v) => {store[k] = v;}},
    items: {contents: items}, actors: {contents: []}, journal: {contents: []}, folders: {contents: folders}, packs: {contents: []}};
  const api = createOrganizer({game,
    updateDocuments: async (name, updates) => {for (const u of updates) items.find(d => d.id === u._id).folder = u.folder;},
    createFolder: async d => ({id: `F-${d.name}`, ...d})});
  return {api, store};
}

test('Clean compendiums: handouts go to Homebrew; each move says why; weak Core moves are marked', async () => {
  const items = [handmade('H1', 'Note from the Mayor'), handmade('H2', 'Strange Key', 'loot', {system: {source: {...DEFAULT_SOURCE}}, folder: null}),
    {id: 'C1', name: 'Rope', type: 'loot', folder: null, flags: {}, system: {source: {...DEFAULT_SOURCE, book: 'PHB 2024'}}},
    {id: 'W1', name: 'Torch', type: 'loot', folder: null, flags: {}, system: {source: {...DEFAULT_SOURCE}}, _stats: {compendiumSource: 'Compendium.dnd5e.equipment24.Item.t'}}];
  const {api} = world(items);
  const out = await api.cleanPreview();
  const moves = Object.fromEntries(out.sources[0].parts.flatMap(p => p.moves).map(m => [m.name, m]));
  assert.equal(moves['Note from the Mayor'].to, 'Homebrew/Items/Loot');
  assert.match(moves['Note from the Mayor'].why, /^Homebrew: no source book/);
  assert.equal(moves['Note from the Mayor'].weak, false);
  assert.equal(moves['Strange Key'].to, 'Homebrew/Items/Loot');
  assert.deepEqual([moves.Rope.to, moves.Rope.why, moves.Rope.weak], ['Core 5.5e/Items/Loot', 'Core 5.5e: source book PHB 2024', false]);
  assert.deepEqual([moves.Torch.to, moves.Torch.weak], ['Core 5.5e/Items/Loot', true]);
  assert.match(moves.Torch.why, /copied from dnd5e compendium/);
});

test('Keep here and protected folders hold handouts; the UI pre-unticks weak moves and shows the reason', async () => {
  const mine = {id: 'FH', name: 'Handouts', type: 'Item', folder: null, flags: {[M]: {[FLAG_PROTECTED]: true}}};
  const items = [handmade('H1', 'Note from the Mayor', 'loot', {folder: 'FH'}),
    handmade('H2', 'Strange Key', 'loot', {flags: {[M]: {[FLAG_KEEP]: true}}})];
  const {api} = world(items, [mine]);
  const out = await api.cleanPreview();
  const part = out.sources[0].parts.find(p => p.documentName === 'Item');
  assert.equal(part.moves.length, 0);
  assert.deepEqual(part.skipped.map(s => s.reason).sort(), ['In protected folder Handouts', 'Keep my folder is set on this document']);
  const main = read('../scripts/main.js'), tpl = read('../templates/manager.hbs');
  assert.match(main, /this\.cleanUnticked=new Set\(out\.sources\.flatMap\(x=>x\.parts\.flatMap\(part=>part\.moves\.filter\(m=>m\.weak\)/);
  assert.match(tpl, /data-ag-clean-keep="\{\{keep\.id\}\}"/);
  assert.match(tpl, /\{\{why\}\}\{\{#if weak\}\} <span class="ag-badge ag-badge--warn">weak evidence, unticked/);
  assert.match(tpl, /\{\{why\}\}\{\{#if weak\}\} <span class="ag-badge ag-badge--warn">weak evidence: check it/);
});

test('whyOf: rules that do not depend on the source give their label', () => {
  const ag = DEFAULT_RULES.find(r => r.id === 'ag-item');
  assert.deepEqual(whyOf(ag, {}), {why: 'Other Ashen Gate items', weak: false});
});

test('Undo last organize restores a Clean run that moved handouts to Core 5.5e', async () => {
  // A 0.38.0-style run: the history entry Clean wrote, with the handout already moved.
  const items = [handmade('H1', 'Note from the Mayor', 'loot', {folder: 'F-Loot'})];
  const {api, store} = world(items, [{id: 'F-Loot', name: 'Loot', type: 'Item', folder: null, flags: {}}]);
  store[HISTORY_SETTING] = [{at: '2026-10-21T00:00:00Z', source: 'clean', types: ['Item'], mode: 'all',
    moves: [{source: 'world', documentName: 'Item', id: 'H1', name: 'Note from the Mayor', fromId: null, from: '(no folder)', toId: 'F-Loot', to: 'Core 5.5e/Items/Loot'}], createdFolders: []}];
  const undo = await api.undoLast();
  assert.equal(undo.restored, 1);
  assert.equal(items[0].folder, null);
});

test('docs and in-app text describe positive evidence', () => {
  const doc = read('../../../docs/organize-rules.md');
  assert.match(doc, /rules alone is not evidence/i);
  assert.match(read('../templates/manager.hbs'), /dnd5e gives every new item rules "2024"/);
});

test('version 0.38.1 is consistent', () => {
  const manifest = JSON.parse(read('../module.json'));
  assert.equal(manifest.version, '0.38.1');
  assert.match(manifest.download, /ashen-gate-manager-v0\.38\.1\/ashen-gate-manager\.zip$/);
  assert.match(read('../templates/manager.hbs'), /v0\.38\.1 Beta/);
  assert.match(read('../scripts/main.js'), /General Manager v0\.38\.1 Beta/);
  assert.match(read('../scripts/main.js'), /v0\.38\.1 ready/);
});
