/** 0.48.0 Artistry (Profession Ledger 0.28.0 shapes): creative professions, activity recipes and the "Any musical
 *  instrument" tool group import, preview, export and browse; craft recipes behave exactly as before; creative icon words.
 *  Synthetic [TEST] data; mocked Foundry globals: proves the logic, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../scripts/vendor/jszip.min.js';
import {validatePackage, planRecord} from '../scripts/core.js';
import {checkContractGraph} from '../scripts/contract.js';
import {compilePackage, dependencyOrder} from '../scripts/workflows.js';
import {sourceMetadata, readStoredDefinition} from '../scripts/source-projection.mjs';
import {buildWorldExport} from '../scripts/world-export.js';
import {readImportBundle} from '../scripts/zip-import.js';
import {createBrowse, detailOf} from '../scripts/browse.js';
import {professionFacts, professionCategory, recipeKind, isActivityRecipe, PROFESSION_CATEGORIES, RECIPE_KINDS} from '../scripts/profession-records.js';
import {createIconIndex, resolveIcon, recordIconInput, documentIconInput} from '../scripts/smart-icons.js';
import {ICON_CONCEPTS} from '../scripts/icon-keywords.js';
import {FAKE_ICONS} from './fixtures/smart-icons-fixture.mjs';

const M = 'ashen-gate-manager';
const SAMPLE = JSON.parse(readFileSync(new URL('../samples/AG_Artistry_v0.48.0_Test.json', import.meta.url), 'utf8'));
const clone = value => structuredClone(value);
const prov = {sources: ['[TEST] synthetic']};
const rec = (id, entity_type, extra = {}) => ({id, entity_type, status: 'approved', version: '1.0.0', provenance: prov, visibility: 'player',
  scope: 'generic_rules', refs: [], foundry: {document_type: 'Item', data: {name: `[TEST] ${id}`, type: 'loot', system: {description: {value: '<p>[TEST] synthetic</p>'}}}}, ...extra});
const pkg = records => ({manifest: {schema_version: 'ag-foundry-import/0.2', package_id: 'AG-TEST-ARTISTRY-V480', version: '1.0.0'}, records});
const need = (relation, target_id) => ({relation, target_id, mode: 'required'});
// A craft recipe exactly like the existing playtest content: profession, ingredients, result item.
const craftRecords = () => [
  rec('PROF-TEST-ALCHEMY', 'Profession', {name: '[TEST] Alchemy', profession_kind: 'crafting'}),
  rec('MAT-TEST-HERB', 'Material', {name: '[TEST] Herb'}),
  rec('ITEM-TEST-TONIC', 'Item', {name: '[TEST] Tonic', refs: [need('created_by', 'REC-TEST-TONIC')]}),
  rec('REC-TEST-TONIC', 'Recipe', {name: '[TEST] Tonic', tier: 'apprentice', effort: 'short', profession_id: 'PROF-TEST-ALCHEMY', result_item_id: 'ITEM-TEST-TONIC',
    ingredients: [{material_id: 'MAT-TEST-HERB', quantity: 2}],
    refs: [need('crafted_by', 'PROF-TEST-ALCHEMY'), need('produces', 'ITEM-TEST-TONIC'), need('requires_material', 'MAT-TEST-HERB')]})
];

test('0.48.0: recipe kind and profession category are read the same way as the Ledger', () => {
  assert.deepEqual(PROFESSION_CATEGORIES, ['crafting', 'gathering', 'creative']);
  assert.deepEqual(RECIPE_KINDS, ['craft', 'activity']);
  assert.equal(professionCategory({profession_kind: 'creative'}), 'creative');
  assert.equal(professionCategory({profession_kind: 'Gathering'}), 'gathering');
  assert.equal(professionCategory({category: 'creative'}), 'creative');
  assert.equal(professionCategory({category: 'Professions'}), null, '`category` counts only for "creative" (it is a common word)');
  assert.equal(recipeKind({entity_type: 'Recipe', kind: 'activity'}), 'activity');
  assert.equal(recipeKind({entity_type: 'Recipe', kind: ' Activity '}), 'activity');
  assert.equal(recipeKind({entity_type: 'Recipe'}), 'craft', 'no kind is a craft recipe');
  assert.equal(recipeKind({entity_type: 'Recipe', kind: 'something'}), 'craft');
  assert.equal(recipeKind({id: 'REC-TEST-X'}), 'craft');
  assert.equal(recipeKind({entity_type: 'Material', kind: 'activity'}), null);
  assert.equal(isActivityRecipe({entity_type: 'Item', kind: 'activity'}), false);

  const [prof, ballad, portrait] = SAMPLE.records;
  assert.deepEqual(professionFacts(prof), {label: 'Creative', fields: [['Profession category', 'Creative']], summary: 'Creative', chips: ['Creative'], searchText: ['Creative']});
  assert.deepEqual(professionFacts({id: 'PROF-TEST-X', entity_type: 'Profession', category: 'creative'}).summary, 'Creative');
  assert.equal(professionFacts(ballad).summary, 'Activity · Short effort · Apprentice');
  assert.deepEqual(professionFacts(ballad).fields, [['Recipe kind', 'Activity'], ['Effort', 'Short'], ['Tier', 'Apprentice'], ['Tools', 'Any musical instrument']]);
  assert.equal(professionFacts(portrait).summary, 'Activity · Long effort · Journeyman');
  assert.deepEqual(professionFacts(portrait).fields.at(-1), ['Tools', 'Painter\'s Supplies or Calligrapher\'s Supplies'], 'an activity\'s tools are alternatives');
  const craft = craftRecords()[3];
  assert.equal(professionFacts(craft).summary, 'Craft · Short effort · Apprentice');
  assert.equal(professionFacts({...craft, tier: 2, effort: 'extended'}).summary, 'Craft · Extended effort · Tier 2');
  assert.equal(professionFacts({entity_type: 'Profession', name: 'Old'}), null, 'a profession with no category gets no label');
  assert.equal(professionFacts(rec('MAT-TEST-HERB', 'Material')), null);
});

test('0.48.0: the [TEST] Artistry sample validates (strict 0.2 contract) with no errors, warnings or result-item notes', () => {
  assert.deepEqual(validatePackage(clone(SAMPLE)), []);
  const graph = checkContractGraph(SAMPLE.records);
  assert.deepEqual(graph, {errors: [], warnings: [], moduleLinks: []});
  const compiled = compilePackage(clone(SAMPLE));
  assert.deepEqual(dependencyOrder(compiled.records).order, ['PROF-ARTISTRY', 'REC-TEST-ARTISTRY-BALLAD', 'REC-TEST-ARTISTRY-PORTRAIT'], 'the profession comes first, as for any required link');
  // An activity with ingredients: [] and one with no ingredients field at all, neither with a result item or produces link.
  const [, ballad, portrait] = compiled.records;
  assert.deepEqual(ballad.ingredients, []);
  assert.equal(Object.hasOwn(portrait, 'ingredients'), false);
  for (const r of [ballad, portrait]) {
    assert.equal(r.kind, 'activity');
    assert.equal(r.result_item_id, undefined);
    assert.ok(!r.refs.some(x => x.relation === 'produces'));
    // It still projects as its recipe Item (the learnable item) like any recipe.
    assert.deepEqual(planRecord(r, []), {action: 'create', reason: 'New source ID.'});
    assert.equal(r.foundry.document_type, 'Item');
  }
  // `category: "creative"` instead of profession_kind, and the instrument group in every tool list: all accepted.
  const alt = clone(SAMPLE);
  delete alt.records[0].profession_kind;
  alt.records[0].category = 'creative';
  alt.records[1].required_tools = ['Musical instrument', 'music'];
  alt.records[0].access.toolProficienciesAnyOf = ['Any musical instrument', 'Musical instrument', 'music'];
  assert.deepEqual(validatePackage(alt), []);
  // The 0.1 package format accepts the same records.
  const legacy = clone(SAMPLE);
  legacy.manifest.schema_version = 'ag-foundry-import/0.1';
  for (const r of legacy.records) { r.visibility = 'player'; r.refs = r.refs.map(x => ({...x, mode: 'required'})); }
  assert.deepEqual(validatePackage(legacy), []);
});

test('0.48.0: craft recipes keep exactly the errors they had (regression)', () => {
  // A valid craft recipe still validates and orders profession, material and item before it.
  const ok = pkg(craftRecords());
  assert.deepEqual(validatePackage(clone(ok)), []);
  const order = dependencyOrder(ok.records).order;
  assert.ok(order.indexOf('PROF-TEST-ALCHEMY') < order.indexOf('REC-TEST-TONIC'));
  assert.ok(order.indexOf('MAT-TEST-HERB') < order.indexOf('REC-TEST-TONIC'));
  // Its result item missing from the file and the world: the same blocking error as 0.47.0.
  const noItem = pkg(craftRecords().filter(r => r.id !== 'ITEM-TEST-TONIC'));
  assert.deepEqual(validatePackage(noItem), ['REC-TEST-TONIC: unresolved required reference ITEM-TEST-TONIC.']);
  // A link to the wrong kind of record: same error.
  const wrong = pkg(craftRecords());
  wrong.records[3].refs.push({relation: 'requires_profession', target_id: 'MAT-TEST-HERB', mode: 'required'});
  assert.deepEqual(validatePackage(wrong), ['REC-TEST-TONIC: requires_profession expects Profession, but MAT-TEST-HERB is Material.']);
  // A malformed record: same field errors.
  const bad = pkg(craftRecords());
  delete bad.records[3].foundry.data.type;
  bad.records[3].refs[0] = {relation: 'crafted_by', target_id: 'PROF-TEST-ALCHEMY'};
  assert.deepEqual(validatePackage(bad), [
    'records[3].refs[0]: expected {relation,target_id,mode:required|optional}.',
    'records[3].foundry.data.type is required for Items.',
    'records[3].refs[0]: invalid typed reference {relation,target_id,mode}.']);
  // "activity" does not loosen the generic rules: an activity with a dangling required link is still an error.
  const dangling = clone(SAMPLE);
  dangling.records = dangling.records.slice(1);
  assert.match(validatePackage(dangling).join(' '), /unresolved required reference PROF-ARTISTRY/);
});

test('0.48.0: kind, access and the creative category round-trip through the source flag, the definitions reader and world export', () => {
  const compiled = compilePackage(clone(SAMPLE));
  const [prof, ballad] = compiled.records;
  const docs = compiled.records.map((r, i) => {
    const source = sourceMetadata(r, compiled, r.refs);
    return {documentName: 'Item', type: 'loot', name: r.foundry.data.name, uuid: `Item.art${i}`, folder: null, ownership: {default: 2}, system: {},
      flags: {[M]: {source}}, toObject() { return {system: this.system, flags: this.flags}; }};
  });
  // The stored definition is the whole record (without its Foundry projection), new fields included.
  const def = readStoredDefinition(docs[1].flags[M].source);
  assert.equal(def.kind, 'activity');
  assert.deepEqual(def.access, {skillProficienciesAnyOf: ['Performance']});
  assert.deepEqual(def.required_tools, ['Any musical instrument']);
  assert.deepEqual(def.ingredients, []);
  assert.equal(def.foundry, undefined);
  assert.equal(readStoredDefinition(docs[0].flags[M].source).profession_kind, 'creative');
  // World export carries them unchanged.
  const game = {user: {isGM: true}, world: {id: 'w', title: '[TEST] World'}, version: '14.367', system: {version: '6.0.6'},
    items: {contents: docs}, journal: {contents: []}, actors: {contents: []}, tables: {contents: []}, macros: {contents: []}, folders: {contents: []},
    modules: new Map(), settings: {get() {}, async set() {}}};
  const {file} = buildWorldExport(game, {now: new Date('2026-10-22T12:00:00Z')});
  const byId = new Map(file.world.map(r => [r.id, r.flags[M].source.definition]));
  assert.deepEqual(byId.get('REC-TEST-ARTISTRY-BALLAD'), JSON.parse(JSON.stringify({...ballad, foundry: undefined})));
  assert.deepEqual(byId.get('PROF-ARTISTRY').access, prof.access);
  assert.equal(byId.get('PROF-ARTISTRY').profession_kind, 'creative');
  assert.equal(Object.hasOwn(byId.get('REC-TEST-ARTISTRY-PORTRAIT'), 'ingredients'), false, 'a missing field is not invented');
  const alt = clone(SAMPLE);
  alt.records[0] = {...alt.records[0], category: 'creative'};
  assert.equal(sourceMetadata(alt.records[0], alt, []).definition.category, 'creative');
});

test('0.48.0: a ZIP bundle with the sample reads as one Manager package', async () => {
  const z = new globalThis.JSZip();
  z.file('artistry.json', JSON.stringify(SAMPLE));
  const bundle = await readImportBundle(await z.generateAsync({type: 'uint8array'}), globalThis.JSZip);
  assert.equal(bundle.files.length, 1);
  assert.deepEqual([bundle.files[0].kind, bundle.files[0].count, bundle.files[0].status], ['manager', 3, 'ok']);
});

test('0.48.0: Browse shows a recipe\'s kind and a profession\'s category as a chip and detail fields', () => {
  const doc = (id, name, source) => ({documentName: 'Item', id, uuid: `Item.${id}`, name, type: 'loot', system: {}, folder: null, _stats: {modifiedTime: 0},
    flags: {[M]: {source}}, toDragData() { return {}; }});
  const src = r => ({sourceId: r.id, entityType: r.entity_type, status: 'approved', visibility: 'player', refs: r.refs, definition: (({foundry, ...d}) => d)(r)});
  const [prof, ballad] = SAMPLE.records, craft = craftRecords()[3];
  const items = [doc('p', 'Artistry', src(prof)), doc('b', 'Ballad', src(ballad)), doc('c', 'Tonic', src(craft))];
  const game = {user: {isGM: true}, items: {contents: items}, actors: {contents: []}, journal: {contents: []},
    modules: {get: () => null, values: () => [].values()}, packs: {contents: []}};
  const idx = createBrowse({game}).getIndex();
  const entry = id => idx.find(e => e.id === id);
  assert.deepEqual(entry('PROF-ARTISTRY').chips, ['Creative']);
  assert.deepEqual(entry('REC-TEST-ARTISTRY-BALLAD').chips, ['Activity']);
  assert.deepEqual(entry('REC-TEST-TONIC').chips, ['Craft']);
  assert.equal(entry('REC-TEST-ARTISTRY-BALLAD').tier, 'apprentice');
  const fields = Object.fromEntries(detailOf(idx, entry('REC-TEST-ARTISTRY-BALLAD').key).fields.map(f => [f.label, f.value]));
  assert.equal(fields['Recipe kind'], 'Activity');
  assert.equal(fields.Effort, 'Short');
  assert.equal(Object.fromEntries(detailOf(idx, entry('PROF-ARTISTRY').key).fields.map(f => [f.label, f.value]))['Profession category'], 'Creative');
  assert.ok(entry('REC-TEST-ARTISTRY-BALLAD').hay.includes('activity'), 'searchable by "activity"');
});

test('0.48.0: smart icons know creative words; an activity recipe with no matching word falls back to the stage', () => {
  const byWord = new Map();
  for (const c of ICON_CONCEPTS) for (const w of c.words) byWord.set(w, [...(byWord.get(w) ?? []), c.id]);
  const expected = {music: 'music', instrument: 'music', lute: 'music', lyre: 'music', drum: 'music', song: 'music', performance: 'music',
    paint: 'painting', brush: 'painting', canvas: 'painting', art: 'painting', sculpt: 'sculpture', poem: 'writing', scroll: 'scroll',
    quill: 'scribe', book: 'book', play: 'theatre', mask: 'theatre', theatre: 'theatre'};
  for (const [word, concept] of Object.entries(expected)) assert.ok(byWord.get(word)?.includes(concept), `${word} → ${concept}`);
  assert.ok(!byWord.get('instrument').includes('tool'), 'an instrument is a musical one, not a hand tool');
  assert.ok(byWord.get('performance').includes('theatre'));

  const index = createIconIndex([...FAKE_ICONS, 'icons/tools/instruments/lute-gold-brown.webp', 'icons/tools/instruments/drum-hand-tan.webp',
    'icons/tools/scribal/brush-paint-red.webp', 'icons/tools/scribal/quill-feather-white.webp', 'icons/sundries/misc/mask-theater-comedy.webp',
    'icons/commodities/treasure/statue-gold.webp', 'icons/tools/hand/hammer-claw.webp']);
  const item = (id, name, extra = {}) => ({id, entity_type: 'Recipe', ...extra, foundry: {document_type: 'Item', data: {name, type: 'loot'}}});
  const cases = [['[TEST] Tavern Ballad', 'music', /tools\/instruments\//], ['[TEST] Lute', 'music', /lute/], ['[TEST] Musical Instrument', 'music', /tools\/instruments\//],
    ['[TEST] Oil Painting', 'painting', /brush-paint/], ['[TEST] Marble Sculpture', 'sculpture', /statue/], ['[TEST] Epic Poem', 'writing', /scroll|quill|book/],
    ['[TEST] Comedy Play', 'theatre', /mask-theater/]];
  for (const [name, concept, path] of cases) {
    const out = resolveIcon(recordIconInput(item('REC-TEST-ICON', name)), index);
    assert.equal(out?.concept, concept, name);
    assert.match(out.img, path, name);
  }
  // Kind: an activity recipe whose name says nothing gets the stage; a craft recipe keeps its old fallback (no change).
  const activity = resolveIcon(recordIconInput(item('REC-TEST-ZORBLAT', '[TEST] Zorblat', {kind: 'activity'})), index);
  assert.match(activity.reason, /^matched kind: theatre/);
  assert.match(activity.img, /mask-theater/);
  const craft = resolveIcon(recordIconInput(item('REC-TEST-ZORBLAT', '[TEST] Zorblat')), index);
  assert.doesNotMatch(craft.reason, /theatre/);
  const worldDoc = {documentName: 'Item', name: '[TEST] Zorblat', type: 'loot', system: {},
    flags: {[M]: {source: {sourceId: 'REC-TEST-ZORBLAT', entityType: 'Recipe', definition: {kind: 'activity'}}}}};
  assert.equal(documentIconInput(worldDoc).kinds[0], 'activity', 'Improve icons reads the same kind from a world Item');
  // The old matches are unchanged.
  assert.equal(resolveIcon(recordIconInput(item('MAT-TEST-X', '[TEST] Healing Draught')), index).concept, 'potion');
});

// ---- Import tab: preview labels and Apply (mocked Foundry, like the 0.47.0 import test) ----
function collection() {
  const contents = [];
  return {contents, get(id) { return contents.find(x => x.id === id); }, values() { return contents.values(); }, filter(fn) { return contents.filter(fn); }, find(fn) { return contents.find(fn); }};
}
function setPath(object, dotted, value) {
  const parts = dotted.split('.'); let cur = object;
  for (const part of parts.slice(0, -1)) cur = cur[part] ??= {};
  cur[parts.at(-1)] = structuredClone(value);
}
function makeDocument(documentName, data, index) {
  const doc = {...structuredClone(data), id: `agmock${index}`, documentName, uuid: `${documentName}.agmock${index}`};
  doc.getFlag = (ns, key) => doc.flags?.[ns]?.[key] ?? null;
  doc.setFlag = async (ns, key, value) => { doc.flags ??= {}; doc.flags[ns] ??= {}; doc.flags[ns][key] = structuredClone(value); };
  doc.unsetFlag = async (ns, key) => { if (doc.flags?.[ns]) delete doc.flags[ns][key]; };
  doc.update = async changes => { for (const [k, v] of Object.entries(changes)) setPath(doc, k, v); return doc; };
  doc.toObject = () => structuredClone(Object.fromEntries(Object.entries(doc).filter(([, v]) => typeof v !== 'function')));
  doc.testUserPermission = () => true;
  return doc;
}
const el = (dataset = {}) => ({dataset, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }});
function installMockFoundry() {
  const instances = []; let nextId = 0;
  const collections = {items: collection(), journal: collection(), actors: collection(), tables: collection(), macros: collection(), folders: collection()};
  const callbacks = {once: new Map(), on: new Map()};
  const actions = ['preview', 'select', 'apply'].map(agAction => el({agAction}));
  const fileInput = {files: [], value: '', listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }};
  const fileButton = {disabled: false, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }};
  const fileWrap = {dataset: {agFileKind: 'import'}, querySelector(s) { return s === '[data-ag-file-button]' ? fileButton : s === 'input[type="file"]' ? fileInput : null; }};
  const controls = {profile: Object.assign(el(), {value: 'session-safe'}), repick: el(), smart: el()};
  const root = {style: {setProperty() {}}, dataset: {}, classList: {add() {}, remove() {}, contains() { return false; }},
    querySelector(s) { return s === '[data-ag-profile]' ? controls.profile : s === '[data-ag-repick-icons]' ? controls.repick : s === '[data-ag-smart-icons]' ? controls.smart : null; },
    querySelectorAll(s) { return s === '[data-ag-action]' ? actions : s === '.ag-file' ? [fileWrap] : []; }};
  class ApplicationV2 { constructor() { instances.push(this); this.element = root; } async render() { this.rendered = true; return this; } async _onRender() {} }
  const byType = {Item: collections.items, JournalEntry: collections.journal, Actor: collections.actors, RollTable: collections.tables, Macro: collections.macros};
  for (const [type, target] of Object.entries(byType)) globalThis[type] = {create: async data => { const doc = makeDocument(type, data, ++nextId); target.contents.push(doc); return doc; }};
  globalThis.Folder = {create: async data => { const doc = {...structuredClone(data), id: `agfolder${collections.folders.contents.length + 1}`}; collections.folders.contents.push(doc); return doc; }};
  const settings = new Map();
  const managerModule = {id: M, api: null};
  globalThis.game = {user: {isGM: true, id: 'v480-gm'}, world: {id: 'v480-mock'}, modules: new Map([[M, managerModule]]), ...collections,
    settings: {menus: new Map(), register() {}, registerMenu(_n, key, value) { this.menus.set(key, value); }, get(_n, key) { return settings.get(key); }, async set(_n, key, value) { settings.set(key, structuredClone(value)); }}, packs: new Map()};
  globalThis.Hooks = {on: (n, fn) => callbacks.on.set(n, fn), off() {}, once: (n, fn) => callbacks.once.set(n, fn)};
  class FilePicker { render() { return this; } }
  FilePicker.browse = async () => { throw new Error('no icon library in this test'); };
  globalThis.foundry = {applications: {api: {ApplicationV2, HandlebarsApplicationMixin: Base => class extends Base {}, DialogV2: {confirm: async () => true}}, apps: {FilePicker: {implementation: FilePicker}}},
    utils: {deepClone: structuredClone, randomID: () => `ag-r${++nextId}`}};
  globalThis.CONST = {DOCUMENT_OWNERSHIP_LEVELS: {NONE: 0}};
  globalThis.ui = {notifications: {info() {}, error(message) { throw new Error(message); }}};
  globalThis.fetch = async () => ({ok: true, status: 200});
  globalThis.CSS ??= {escape: s => String(s).replace(/"/g, '\\"')};
  return {callbacks, collections, instances, managerModule, actions, fileInput, settings};
}
async function waitFor(predicate, message) {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 5)); }
  assert.fail(message);
}

test('0.48.0: Import preview labels Activity and Creative; Apply creates the recipe Items only (no result Items), definitions intact', async () => {
  const runtime = installMockFoundry();
  await import(`../scripts/main.js?v480=${Date.now()}${Math.random()}`);
  runtime.callbacks.once.get('init')?.();
  runtime.callbacks.once.get('ready')?.();
  await runtime.managerModule.api.open();
  const app = runtime.instances.at(-1);
  await app._onRender({}, {});
  const payload = {...clone(SAMPLE), records: [...clone(SAMPLE).records, ...craftRecords()]};
  const text = JSON.stringify(payload);
  runtime.fileInput.files = [{name: 'AG_Artistry_v0.48.0_Test.json', size: text.length, text: async () => text}];
  runtime.fileInput.value = 'AG_Artistry_v0.48.0_Test.json';
  await runtime.fileInput.listeners.change();
  await waitFor(() => app.preview.length === 7, 'preview');
  assert.deepEqual(app.errors, []);
  assert.ok(!app.warnings.some(w => /result|ingredient|unknown tool|instrument/i.test(w)), app.warnings.join(' | '));
  const row = id => app.preview.find(r => r.id === id);
  assert.deepEqual([row('PROF-ARTISTRY').kind, row('PROF-ARTISTRY').detail], ['Item', 'Creative']);
  assert.deepEqual([row('REC-TEST-ARTISTRY-BALLAD').kind, row('REC-TEST-ARTISTRY-BALLAD').detail], ['Item', 'Activity · Short effort · Apprentice']);
  assert.equal(row('REC-TEST-ARTISTRY-PORTRAIT').detail, 'Activity · Long effort · Journeyman');
  assert.equal(row('REC-TEST-TONIC').detail, 'Craft · Short effort · Apprentice');
  assert.equal(row('MAT-TEST-HERB').detail, '');
  for (const r of app.preview) assert.equal(r.action, 'create', `${r.id}: ${r.reason}`);

  const select = runtime.actions.find(a => a.dataset.agAction === 'select');
  const apply = runtime.actions.find(a => a.dataset.agAction === 'apply');
  await select.listeners.click({preventDefault() {}});
  await waitFor(() => app.selected.size === 7, 'select');
  await apply.listeners.click({preventDefault() {}});
  await waitFor(() => runtime.settings.has('importHistory') && !app.busy, 'import did not finish');
  assert.deepEqual(runtime.settings.get('importHistory').at(-1).results.filter(r => r.status === 'error'), []);
  const items = runtime.collections.items.contents;
  assert.equal(items.length, 7, 'one Item per record: no extra result Item for an activity');
  const docOf = id => items.find(d => d.flags?.[M]?.source?.sourceId === id);
  const ballad = docOf('REC-TEST-ARTISTRY-BALLAD').flags[M].source;
  assert.equal(ballad.definition.kind, 'activity');
  assert.deepEqual(ballad.definition.access, {skillProficienciesAnyOf: ['Performance']});
  assert.deepEqual(ballad.unresolvedRequiredRefs ?? [], []);
  assert.equal(docOf('PROF-ARTISTRY').flags[M].source.definition.profession_kind, 'creative');
  assert.equal(docOf('REC-TEST-TONIC').flags[M].source.definition.result_item_id, 'ITEM-TEST-TONIC');

  // Re-import of the same file: no new documents, nothing blocked; the same permanent ids are matched. (A record whose
  // description carries an AGREF marker shows as an update, as before 0.48.0: the world copy holds the resolved link.)
  runtime.fileInput.files = [{name: 'AG_Artistry_v0.48.0_Test.json', size: text.length, text: async () => text}];
  await runtime.fileInput.listeners.change();
  await waitFor(() => app.preview.length === 7 && app.preview.every(r => r.action !== 'create'), 'second preview');
  for (const r of app.preview) assert.ok(['unchanged', 'update'].includes(r.action), `${r.id}: ${r.action} ${r.reason}`);
  assert.equal(row('PROF-ARTISTRY').action, 'unchanged');
  assert.equal(runtime.collections.items.contents.length, 7);
});

test('0.49.0: re-importing the Artistry records with an effect note and recipe labels is a metadata refresh, ids unchanged', async () => {
  const runtime = installMockFoundry();
  await import(`../scripts/main.js?v490=${Date.now()}${Math.random()}`);
  runtime.callbacks.once.get('init')?.();
  runtime.callbacks.once.get('ready')?.();
  await runtime.managerModule.api.open();
  const app = runtime.instances.at(-1);
  await app._onRender({}, {});
  const load = async data => {
    const text = JSON.stringify(data);
    runtime.fileInput.files = [{name: 'AG_Artistry_Test.json', size: text.length, text: async () => text}];
    runtime.fileInput.value = 'AG_Artistry_Test.json';
    await runtime.fileInput.listeners.change();
  };
  await load(clone(SAMPLE));
  await waitFor(() => app.preview.length === 3 && app.preview.every(r => r.action === 'create'), 'first preview');
  await runtime.actions.find(a => a.dataset.agAction === 'select').listeners.click({preventDefault() {}});
  await waitFor(() => app.selected.size === 3, 'select');
  await runtime.actions.find(a => a.dataset.agAction === 'apply').listeners.click({preventDefault() {}});
  await waitFor(() => runtime.settings.has('importHistory') && !app.busy, 'import did not finish');

  const next = JSON.parse(readFileSync(new URL('../samples/AG_Artistry_v0.49.0_Test.json', import.meta.url), 'utf8'));
  await load(next);
  await waitFor(() => app.preview.length === 3 && app.preview.every(r => r.action !== 'create'), 'second preview');
  const row = id => app.preview.find(r => r.id === id);
  assert.deepEqual(app.errors, []);
  // Same as any new definition field: Foundry rule fields are untouched, the stored definition is refreshed.
  assert.equal(row('PROF-ARTISTRY').action, 'metadata', row('PROF-ARTISTRY').reason);
  assert.match(row('PROF-ARTISTRY').reason, /^Metadata refresh/);
  // (The ballad's description carries an AGREF marker, so it shows as an update anyway, as in the 0.48.0 re-import above.)
  assert.ok(['metadata', 'update'].includes(row('REC-TEST-ARTISTRY-BALLAD').action), row('REC-TEST-ARTISTRY-BALLAD').reason);
  assert.equal(row('PROF-ARTISTRY').detail, 'Creative · Recipe label: [TEST] Piece / [TEST] Pieces');
  assert.equal(row('REC-TEST-ARTISTRY-BALLAD').detail, 'Activity · Short effort · Apprentice · Effect note');
  assert.equal(row('REC-TEST-ARTISTRY-PORTRAIT').detail, 'Activity · Long effort · Journeyman');
  assert.equal(runtime.collections.items.contents.length, 3, 'the same permanent ids are matched: no new documents');
});
