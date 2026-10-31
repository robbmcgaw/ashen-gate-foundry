/** 0.91.0: the custom source label "Ashen Gate" on Items Manager creates. Mocked Foundry data only (synthetic [TEST] names): proves the rules, not the live UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SOURCE_LABEL, SOURCE_PATH, withSourceLabel, withSourceLabelFields, adoptedSystem, planSourceLabel, applySourceLabel, sourceLabelSummary, isBlank} from '../scripts/source-label.js';
import {writeOverwrite, recreateItem} from '../scripts/sync-apply.js';
import {applyActorUpdate} from '../scripts/actor-update.js';
import {createCoreLinks, adoptDiff, LINK_FLAG, SOURCES_SETTING, LINK_HISTORY_SETTING} from '../scripts/core-links.js';

const M = 'ashen-gate-manager';
const GM = {isGM: true}, PLAYER = {isGM: false};
const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const setPath = (o, path, v) => { const k = path.split('.'), last = k.pop(); k.reduce((x, y) => (isObj(x[y]) ? x[y] : (x[y] = {})), o)[last] = v; };
/** A world Item stand-in: dotted update keys are expanded like Foundry does. */
function mkItem(id, {custom, flagged = true, parent = null, system = {}} = {}) {
  const raw = {_id: id, name: `[TEST] ${id}`, type: 'loot', img: 'icons/x.webp', system: structuredClone({description: {value: `<p>${id}</p>`}, ...system}), flags: {}};
  if (custom !== undefined) setPath(raw.system, 'source.custom', custom);
  if (flagged) raw.flags[M] = {source: {sourceId: `ITEM-TEST-${id}`, entityType: 'Item'}};
  const doc = {documentName: 'Item', id, parent, raw, system: raw.system, flags: raw.flags, writes: [],
    getFlag: (s, k) => raw.flags[s]?.[k], toObject: () => structuredClone(raw),
    async update(data) { doc.writes.push(structuredClone(data)); for (const [k, v] of Object.entries(data)) setPath(raw, k, structuredClone(v)); return doc; }};
  return doc;
}
const sourceOf = d => d.raw.flags[M]?.source;

test('label on create: filled when the source is missing or empty, input is not changed', () => {
  const none = {name: '[TEST] Rope', type: 'loot'};
  assert.equal(withSourceLabel(none).system.source.custom, SOURCE_LABEL);
  assert.equal(none.system, undefined, 'input untouched');
  for (const empty of [undefined, null, '', '   ']) assert.equal(withSourceLabel({system: {source: {custom: empty, book: ''}}}).system.source.custom, SOURCE_LABEL, JSON.stringify(empty));
  const kept = withSourceLabel({system: {price: {value: 5}, description: {value: '<p>x</p>'}, source: {book: 'PHB\'24', rules: '2024', revision: 1}}});
  assert.deepEqual(kept.system.source, {book: "PHB'24", rules: '2024', revision: 1, custom: SOURCE_LABEL}, 'book, rules, revision untouched');
  assert.equal(kept.system.price.value, 5); assert.equal(kept.system.description.value, '<p>x</p>');
});

test('label on create: a non-empty value is never overwritten', () => {
  assert.equal(withSourceLabel({system: {source: {custom: 'Robb homebrew'}}}).system.source.custom, 'Robb homebrew');
  assert.equal(withSourceLabel({system: {source: {custom: 'Ashen Gate'}}}).system.source.custom, 'Ashen Gate');
});

test('every creation path is wired: createRecord (Items and Actor items), Sync overwrite, Actor update, re-import', () => {
  const main = read('../scripts/main.js');
  assert.match(main, /if \(kind==='Item'\) data\.system=withSourceLabel\(data\)\.system;/);
  assert.match(main, /data\.items=\(data\.items\?\?\[\]\)\.map\(\(item,i\)=>\(\{\.\.\.withSourceLabel\(item\),/);
  assert.match(main, /if\(record\.foundry\?\.document_type==='Item'\) Object\.assign\(update,withSourceLabelFields\(doc,update\)\)/);
  assert.match(main, /case "srclabel-run"/);
  assert.match(main, /Set Ashen Gate source label|Ashen Gate source label \(0\.91\.0\)/);
  assert.match(read('../templates/manager.hbs'), /Set Ashen Gate source label…/);
});

test('Sync / re-import fields: an empty label is filled, a non-empty one is kept, other fields pass through', () => {
  const empty = mkItem('a', {custom: ''}), set = mkItem('b', {custom: 'Robb homebrew'}), unset = mkItem('c');
  assert.deepEqual(withSourceLabelFields(empty, {name: 'N'}), {name: 'N', [SOURCE_PATH]: SOURCE_LABEL});
  assert.deepEqual(withSourceLabelFields(unset, {name: 'N'}), {name: 'N', [SOURCE_PATH]: SOURCE_LABEL});
  assert.deepEqual(withSourceLabelFields(set, {name: 'N'}), {name: 'N'});
  // a package field with text wins; an empty package field does not blank the label
  assert.deepEqual(withSourceLabelFields(set, {[SOURCE_PATH]: 'From package'}), {[SOURCE_PATH]: 'From package'});
  assert.deepEqual(withSourceLabelFields(set, {[SOURCE_PATH]: ''}), {[SOURCE_PATH]: SOURCE_LABEL}, 'a package that writes an empty label gets the Ashen Gate one');
  assert.deepEqual(withSourceLabelFields(empty, {'system.source': {}}), {'system.source': {custom: SOURCE_LABEL}});
  assert.deepEqual(withSourceLabelFields(set, {'system.source': {}}), {'system.source': {}});
  // embedded Items and other documents are never changed
  assert.deepEqual(withSourceLabelFields(mkItem('d', {custom: '', parent: {id: 'actor'}}), {name: 'N'}), {name: 'N'});
  assert.deepEqual(withSourceLabelFields({documentName: 'JournalEntry'}, {name: 'N'}), {name: 'N'});
});

test('Sync overwrite fills an empty label, keeps a typed one, and writes nothing else new', async () => {
  const flag = {sourceId: 'ITEM-TEST-a'};
  const empty = mkItem('a', {custom: ''});
  await writeOverwrite(empty, {id: 'ITEM-TEST-a', ops: {fields: {name: '[TEST] Renamed'}}}, {user: GM, flag});
  assert.equal(empty.raw.system.source.custom, SOURCE_LABEL);
  assert.equal(empty.raw.name, '[TEST] Renamed');
  assert.equal(empty.raw.system.description.value, '<p>a</p>', 'description untouched');
  const typed = mkItem('b', {custom: 'Robb homebrew'});
  await writeOverwrite(typed, {id: 'ITEM-TEST-b', ops: {fields: {name: '[TEST] Renamed'}}}, {user: GM, flag: {sourceId: 'ITEM-TEST-b'}});
  assert.equal(typed.raw.system.source.custom, 'Robb homebrew');
  assert.ok(typed.writes.every(w => !(SOURCE_PATH in w)), 'no label key was even sent');
  // running it again changes nothing
  await writeOverwrite(empty, {id: 'ITEM-TEST-a', ops: {fields: {name: '[TEST] Renamed'}}}, {user: GM, flag});
  assert.equal(empty.raw.system.source.custom, SOURCE_LABEL);
  assert.ok(!(SOURCE_PATH in empty.writes.at(-1)));
});

test('Sync recreate: the new Item keeps a label the GM set on the old one', async () => {
  const old = mkItem('old', {custom: 'Robb homebrew'});
  old.delete = async () => {};
  const fresh = mkItem('fresh', {custom: SOURCE_LABEL});
  fresh.delete = async () => {};
  const out = await recreateItem(old, {id: 'ITEM-TEST-old'}, {user: GM, adapter: {create: async () => fresh}});
  assert.equal(out.raw.system.source.custom, 'Robb homebrew');
  const old2 = mkItem('old2', {custom: ''}); old2.delete = async () => {};
  const fresh2 = mkItem('fresh2', {custom: SOURCE_LABEL}); fresh2.delete = async () => {};
  const out2 = await recreateItem(old2, {id: 'ITEM-TEST-old2'}, {user: GM, adapter: {create: async () => fresh2}});
  assert.equal(out2.raw.system.source.custom, SOURCE_LABEL);
});

test('Items created on an Actor by an Actor update get the label when empty', async () => {
  const created = [];
  const actor = {getFlag: () => ({}), update: async () => {}, updateEmbeddedDocuments: async () => {}, createEmbeddedDocuments: async (kind, data) => created.push(...data)};
  const plan = {action: 'update', patch: {fields: {}, items: {adopt: [], update: [], create: [{name: '[TEST] Club', type: 'weapon', system: {}}, {name: '[TEST] Sling', type: 'weapon', system: {source: {custom: 'Mine'}}}]}}};
  await applyActorUpdate(actor, plan, {user: GM, source: {sourceId: 'NPC-TEST-A'}});
  assert.deepEqual(created.map(i => i.system.source.custom), [SOURCE_LABEL, 'Mine']);
});

// ---- Core links adopt ----
function coreItem(id, name, system) {
  return {id, _id: id, name, type: 'loot', img: `icons/core-${id}.webp`, uuid: `Item.${id}`, system, flags: {plutonium: {source: 'XPHB'}}, folder: null,
    toObject() { return structuredClone({_id: this.id, name: this.name, type: this.type, img: this.img, system: this.system, flags: this.flags}); }, getFlag: () => undefined};
}
function agWorldItem(id, name, system) {
  return {id, _id: id, name, type: 'loot', img: 'icons/ag.webp', system, uuid: `Item.${id}`, folder: null,
    flags: {[M]: {source: {sourceId: `ITEM-TEST-${id}`, entityType: 'Item', definition: {core_ref: {name: 'Rope'}}}}},
    toObject() { return structuredClone({_id: this.id, name: this.name, type: this.type, img: this.img, system: this.system, flags: this.flags}); },
    getFlag(s, k) { return this.flags[s]?.[k]; }, async unsetFlag(s, k) { delete this.flags[s]?.[k]; }};
}
function coreWorld(items) {
  const store = {[SOURCES_SETTING]: {}, [LINK_HISTORY_SETTING]: []};
  const game = {user: {isGM: true}, items: {contents: items, get: id => items.find(i => i.id === id)}, folders: {contents: []}, packs: {contents: []},
    settings: {get: (n, k) => structuredClone(store[k]), set: async (n, k, v) => { store[k] = structuredClone(v); }}};
  const api = createCoreLinks({game,
    loadCore: async uuid => items.find(x => x.uuid === uuid)?.toObject() ?? null,
    update: async (doc, data, options) => { for (const [k, v] of Object.entries(data)) options?.recursive === false ? doc[k] = structuredClone(v) : setPath(doc, k, structuredClone(v)); }});
  return {api};
}
const CORE_SYS = () => ({quantity: 1, rarity: '', description: {value: '<p>Core Rope</p>'}, source: {book: "PHB'24", page: '', license: '', custom: '', rules: '2024', revision: 1}});

test('Core links adopt keeps a non-empty custom label and still replaces description and book (unchanged behaviour)', async () => {
  const ag = agWorldItem('a1', '[TEST] Rope', {quantity: 1, description: {value: '<p>AG text</p>'}, source: {custom: 'Ashen Gate', book: '', rules: '2024', revision: 1}});
  const {api} = coreWorld([coreItem('c1', 'Rope', CORE_SYS()), ag]);
  const prevSystem = structuredClone(ag.system);
  const out = await api.apply({ids: ['a1']});
  assert.equal(out.adopted, 1);
  assert.equal(ag.system.source.custom, 'Ashen Gate', 'label preserved');
  assert.equal(ag.system.source.book, "PHB'24", 'the core item brings its book');
  assert.equal(ag.system.description.value, '<p>Core Rope</p>', 'adopt still replaces the description (reported, not changed here)');
  const undo = await api.undoLast();
  assert.equal(undo.restored, 1);
  assert.deepEqual(ag.system, prevSystem, 'undo restores the old system, label included');
});

test('Core links adopt: a typed label is kept; an empty one gets Ashen Gate; the adopt preview shows the same result', async () => {
  const typed = agWorldItem('a2', '[TEST] Rope', {quantity: 1, source: {custom: 'Robb homebrew'}});
  await coreWorld([coreItem('c2', 'Rope', CORE_SYS()), typed]).api.apply({ids: ['a2']});
  assert.equal(typed.system.source.custom, 'Robb homebrew');
  const bare = agWorldItem('a3', '[TEST] Rope', {quantity: 1, description: {value: '<p>AG</p>'}});
  await coreWorld([coreItem('c3', 'Rope', CORE_SYS()), bare]).api.apply({ids: ['a3']});
  assert.equal(bare.system.source.custom, SOURCE_LABEL);
  const diff = adoptDiff({system: {source: {custom: 'Ashen Gate'}}}, {system: CORE_SYS()});
  assert.ok(!diff.some(d => d.path === 'system.source.custom'), 'the label is not listed as a change');
  assert.deepEqual(adoptedSystem({source: {custom: 'Mine'}}, {source: {custom: 'Core label'}}).source.custom, 'Mine');
  assert.equal(adoptedSystem(undefined, undefined).source.custom, SOURCE_LABEL);
});

test('Core links link-only never writes system, so it never touches the label', async () => {
  const ag = agWorldItem('a4', '[TEST] Rope', {quantity: 1, source: {custom: ''}});
  const {api} = coreWorld([coreItem('c4', 'Rope', CORE_SYS()), ag]);
  await api.apply({ids: ['a4'], linkOnly: ['a4']});
  assert.equal(ag.system.source.custom, '');
});

// ---- maintenance action ----
const world = () => [
  mkItem('m1', {custom: ''}), mkItem('m2'), mkItem('m3', {custom: '  '}),
  mkItem('k1', {custom: 'Ashen Gate'}), mkItem('k2', {custom: 'Robb homebrew'}),
  mkItem('plain', {flagged: false}), mkItem('plain2', {flagged: false, custom: ''}),
  mkItem('emb', {custom: '', parent: {id: 'actor'}}),
  {documentName: 'JournalEntry', id: 'j1', raw: {flags: {[M]: {source: {sourceId: 'JRN-TEST'}}}}, flags: {}}
];

test('maintenance: preview counts only Manager-imported world Items with an empty label; nothing is written', () => {
  const docs = world();
  const plan = planSourceLabel(docs, sourceOf, {user: GM});
  assert.deepEqual([plan.total, plan.alreadyLabelled, plan.items], [3, 2, 5]);
  assert.deepEqual(plan.targets.map(d => d.id), ['m1', 'm2', 'm3']);
  assert.ok(docs.every(d => !d.writes?.length));
  assert.equal(sourceLabelSummary(plan), 'To label: 3, already labelled (kept as they are): 2.');
});

test('maintenance: apply writes only system.source.custom, only on empty labels, and is idempotent', async () => {
  const docs = world();
  const writes = [];
  const write = async updates => { writes.push(...updates); for (const u of updates) { const d = docs.find(x => x.id === u._id); setPath(d.raw, SOURCE_PATH, u[SOURCE_PATH]); } };
  const plan = planSourceLabel(docs, sourceOf, {user: GM});
  const out = await applySourceLabel(plan, {user: GM, sourceOf, write, yieldToUI: async () => {}});
  assert.equal(out.changed, 3);
  assert.deepEqual(writes, ['m1', 'm2', 'm3'].map(_id => ({_id, [SOURCE_PATH]: SOURCE_LABEL})), 'the label is the only field written');
  const get = id => docs.find(d => d.id === id).raw.system.source?.custom;
  assert.deepEqual(['m1', 'm2', 'm3', 'k1', 'k2'].map(get), ['Ashen Gate', 'Ashen Gate', 'Ashen Gate', 'Ashen Gate', 'Robb homebrew']);
  assert.equal(get('plain'), undefined, 'a non-Ashen-Gate Item is untouched');
  assert.equal(get('plain2'), '', 'so is a non-Ashen-Gate Item with an empty label');
  assert.equal(get('emb'), '', 'and an Item on a sheet');
  assert.match(out.message, /^Labelled: 3, already labelled/);
  const again = planSourceLabel(docs, sourceOf, {user: GM});
  assert.equal(again.total, 0);
  const writes2 = [];
  const out2 = await applySourceLabel(again, {user: GM, sourceOf, write: async u => writes2.push(...u), yieldToUI: async () => {}});
  assert.equal(out2.changed, 0); assert.deepEqual(writes2, []); assert.match(out2.message, /^Nothing to change/);
});

test('maintenance: GM only in plan and apply; an Item labelled after the preview is left alone; chunks of 50; Cancel stops between chunks', async () => {
  assert.throws(() => planSourceLabel(world(), sourceOf, {user: PLAYER}), /Only a GM/);
  assert.throws(() => planSourceLabel(world(), sourceOf, {}), /Only a GM/);
  const docs = world();
  const plan = planSourceLabel(docs, sourceOf, {user: GM});
  const writes = [];
  await assert.rejects(applySourceLabel(plan, {user: PLAYER, sourceOf, write: async u => writes.push(...u)}), /Only a GM/);
  await assert.rejects(applySourceLabel(plan, {sourceOf, write: async u => writes.push(...u)}), /Only a GM/);
  assert.deepEqual(writes, []);
  setPath(docs[0].raw, SOURCE_PATH, 'Typed after the preview');
  const out = await applySourceLabel(plan, {user: GM, sourceOf, write: async u => writes.push(...u), yieldToUI: async () => {}});
  assert.equal(out.changed, 2); assert.equal(out.changedSincePreview, 1); assert.deepEqual(writes.map(w => w._id), ['m2', 'm3']);
  const many = Array.from({length: 120}, (_, i) => mkItem(`b${i}`, {custom: ''}));
  const sizes = [], ctl = new AbortController();
  const big = await applySourceLabel(planSourceLabel(many, sourceOf, {user: GM}), {user: GM, sourceOf, signal: ctl.signal, write: async u => { sizes.push(u.length); ctl.abort(); }, yieldToUI: async () => {}});
  assert.deepEqual(sizes, [50]); assert.equal(big.cancelled, true); assert.equal(big.changed, 50);
  assert.equal(isBlank('  '), true);
});

test('release.js and Organize never write the label: nothing else sets system.source.custom', () => {
  for (const f of ['release.js', 'organize.js', 'item-visibility.js', 'bulk.js']) assert.ok(!/source\.custom/.test(read(`../scripts/${f}`)), f);
});

test('version 0.93.0 or later, 0.x only, changelog entry', () => {
  const m = JSON.parse(read('../module.json'));
  assert.equal(m.version, '0.93.0'); assert.ok(m.download.endsWith('/ashen-gate-manager-v0.93.0/ashen-gate-manager.zip')); assert.match(m.version, /^0\./);
  assert.match(read('../CHANGELOG.md'), /^## 0\.91\.0 /m);
});
