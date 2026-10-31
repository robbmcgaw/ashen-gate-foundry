import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {MODULE_ID, exportedFields} from '../scripts/core.js';
import {sourceMetadata} from '../scripts/source-projection.mjs';
import {itemKeys, ITEM_FLAG} from '../scripts/actor-update.js';
import {EDITS_SCHEMA, EDIT_TYPES, scanWorldEdits, buildEditsFile, saveWorldEdits, previewHtml, summaryText} from '../scripts/world-edits.js';

const clone = v => structuredClone(v);
const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const forbidden = name => () => { throw new Error(`world write attempted: ${name}`); };

/** A world document stand-in. Every write path throws: the export must be read-only. */
class Doc {
  constructor(documentName, raw) { this.documentName = documentName; this.raw = clone(raw); this.raw._id ??= `${documentName[0]}${Math.random().toString(36).slice(2, 8)}`; }
  get id() { return this.raw._id; }
  get uuid() { return `${this.documentName}.${this.id}`; }
  get name() { return this.raw.name; }
  get type() { return this.raw.type; }
  get folder() { return null; }
  get flags() { return this.raw.flags; }
  getFlag(scope, key) { return clone(this.raw.flags?.[scope]?.[key]); }
  toObject() { return clone(this.raw); }
}
for (const m of ['update', 'setFlag', 'unsetFlag', 'delete', 'createEmbeddedDocuments', 'updateEmbeddedDocuments', 'deleteEmbeddedDocuments']) Doc.prototype[m] = forbidden(m);

const MANIFEST = {schema_version: 'ag-foundry-import/0.1', package_id: 'PKG-TEST', version: '1.2.0'};
const rec = (id, document_type, data, over = {}) => ({id, entity_type: document_type === 'Actor' ? 'NPC' : 'Item', status: 'approved', version: '1.0.0', visibility: 'player', refs: [], provenance: {source: 'test'}, foundry: {document_type, data}, ...over});
const flagged = (record, {strip = false} = {}) => {
  const raw = clone(record.foundry.data);
  const source = {...sourceMetadata(record, {manifest: MANIFEST}, record.refs ?? []), managedFields: exportedFields(record),
    pagesDefinition: record.foundry.document_type === 'JournalEntry' ? record.foundry.data.pages ?? [] : []};
  raw.flags = {...(raw.flags ?? {}), [MODULE_ID]: {source}};
  if (strip) delete raw.flags[MODULE_ID].source.managedFields;
  return new Doc(record.foundry.document_type, raw);
};
const item = (id, name, sys = {}) => rec(id, 'Item', {name, type: 'loot', img: 'icons/test/a.webp', system: {description: {value: `<p>${name} text</p>`}, quantity: 1, price: {value: 5}, ...sys}});
const npc = (id, name) => rec(id, 'Actor', {name, type: 'npc', img: 'icons/test/n.webp', prototypeToken: {disposition: -1, texture: {src: 'icons/test/n.webp'}},
  system: {abilities: {str: {value: 10}}, attributes: {ac: {flat: 12}, hp: {value: 20, max: 20, temp: 0}}, currency: {gp: 3}, details: {biography: {value: '<p>bio</p>'}}},
  items: [{name: 'Claw', type: 'weapon', system: {description: {value: 'Claw'}, quantity: 1, uses: {spent: 0}}}]}, {entity_type: 'NPC'});
const npcDoc = record => {
  const d = flagged(record);
  const keys = itemKeys(record.foundry.data.items);
  d.raw.items = record.foundry.data.items.map((it, i) => ({_id: `i${i}`, ...clone(it), flags: {[MODULE_ID]: {[ITEM_FLAG]: keys[i]}}}));
  return d;
};
const journal = (id, name, text) => rec(id, 'JournalEntry', {name, pages: [{name: 'P1', type: 'text', text: {content: text, format: 1}}]}, {entity_type: 'Journal'});
const table = (id, name) => rec(id, 'RollTable', {name, formula: '1d6', results: [{type: 'text', description: 'a', range: [1, 3], weight: 1}, {type: 'text', description: 'b', range: [4, 6], weight: 1}]}, {entity_type: 'Table'});
const macro = (id, name) => rec(id, 'Macro', {name, type: 'chat', command: 'ui.notifications.info(1)'}, {entity_type: 'Macro'});

function world({gm = true, docs = []} = {}) {
  const by = name => ({contents: docs.filter(d => d.documentName === name)});
  return {user: {isGM: gm}, world: {id: 'test-world'}, modules: {get: id => id === MODULE_ID ? {version: '0.77.0'} : null},
    items: by('Item'), journal: by('JournalEntry'), actors: by('Actor'), tables: by('RollTable'), macros: by('Macro')};
}
const snapshotOf = docs => JSON.stringify(docs.map(d => d.raw));
const only = (scan, id) => scan.records.find(r => r.id === id);

test('an Item whose description was edited is listed with its changed field; an untouched Item is not', () => {
  const a = flagged(item('MAT-ROPE', 'Hemp Rope [TEST]')), b = flagged(item('MAT-OIL', 'Lamp Oil [TEST]'));
  a.raw.system.description.value = '<p>Stronger rope.</p>';
  const scan = scanWorldEdits(world({docs: [a, b]}));
  assert.deepEqual(scan.records.map(r => r.id), ['MAT-ROPE']);
  const r = scan.records[0];
  assert.deepEqual(r.changed_fields, ['foundry.data.system.description.value']);
  assert.equal(r.record.foundry.data.system.description.value, '<p>Stronger rope.</p>');
  assert.equal(r.record.foundry.data.name, 'Hemp Rope [TEST]');
  assert.equal(r.record.foundry.data.type, 'loot');
  assert.equal(r.record.id, 'MAT-ROPE');
  assert.equal(r.record.foundry.document_type, 'Item');
  assert.equal(r.source_package, 'PKG-TEST');
  assert.equal(scan.counts.Item.managed, 2); assert.equal(scan.counts.Item.edited, 1); assert.equal(scan.counts.Item.unchanged, 1);
});

test('a renamed NPC is listed with name; unedited fields come from the import, not the world', () => {
  const d = npcDoc(npc('NPC-ORIN', 'Orin [TEST]'));
  d.raw.name = 'Orin the Wary [TEST]';
  const scan = scanWorldEdits(world({docs: [d]}));
  const r = only(scan, 'NPC-ORIN');
  assert.deepEqual(r.changed_fields, ['foundry.data.name']);
  assert.equal(r.entity_type, 'NPC'); assert.equal(r.document_type, 'Actor');
  assert.equal(r.record.foundry.data.name, 'Orin the Wary [TEST]');
  assert.equal(r.record.foundry.data.type, 'npc');
  assert.equal(r.record.foundry.data.system.abilities.str.value, 10);
  assert.equal(r.record.foundry.data.items[0].name, 'Claw');
});

test('play state is never an edit and never leaks: HP, currency, resources, biography, quantities, ownership, folder, art', () => {
  const d = npcDoc(npc('NPC-PLAY', 'Play [TEST]'));
  d.raw.system.attributes.hp.value = 3; d.raw.system.attributes.hp.temp = 5; d.raw.system.currency.gp = 900;
  d.raw.system.details.biography.value = '<p>GM notes</p>';
  d.raw.system.spells = {spell1: {value: 0, spent: 2}};
  d.raw.items[0].system.uses.spent = 4; d.raw.items[0].system.quantity = 7;
  d.raw.img = 'icons/test/my-art.webp'; d.raw.prototypeToken.texture.src = 'icons/test/my-token.webp';
  d.raw.ownership = {default: 0, abc: 3}; d.raw.folder = 'FOLDER1'; d.raw.sort = 99; d.raw._stats = {modifiedTime: 1};
  const i = flagged(item('MAT-Q', 'Qty [TEST]')); i.raw.ownership = {default: 2}; i.raw.img = 'icons/test/other.webp';
  const scan = scanWorldEdits(world({docs: [d, i]}), {includeUnchanged: true});
  assert.deepEqual(scan.records.map(r => r.changed_fields), [[], []]);
  const data = only(scan, 'NPC-PLAY').record.foundry.data;
  assert.equal(data.system.attributes.hp.value, 20); assert.equal(data.system.currency.gp, 3);
  assert.equal(data.system.details.biography.value, '<p>bio</p>');
  assert.equal(data.img, 'icons/test/n.webp'); assert.equal(data.prototypeToken.texture.src, 'icons/test/n.webp');
  const text = JSON.stringify(scan.records);
  for (const leak of ['ownership', 'FOLDER1', '_stats', '"sort"', '_id', 'uuid', 'my-art', 'my-token', 'GM notes', '900']) assert.ok(!text.includes(leak), `leaked ${leak}`);
  assert.equal(only(scan, 'MAT-Q').record.foundry.data.img, 'icons/test/a.webp');
});

test('an embedded package Item of an NPC that was edited is a changed field (play state on it is not)', () => {
  const d = npcDoc(npc('NPC-CLAW', 'Claw Owner [TEST]'));
  d.raw.items[0].system.description.value = 'Sharper claw';
  d.raw.items[0].system.quantity = 3;
  const r = only(scanWorldEdits(world({docs: [d]})), 'NPC-CLAW');
  assert.deepEqual(r.changed_fields, ['foundry.data.items[0].system.description.value']);
  assert.equal(r.record.foundry.data.items[0].system.description.value, 'Sharper claw');
  assert.equal(r.record.foundry.data.items[0].system.quantity, 1);
});

test('Player characters are skipped entirely and counted; groups too', () => {
  const pc = new Doc('Actor', {name: 'Hero', type: 'character', flags: {[MODULE_ID]: {source: {sourceId: 'PC-1', managedFields: {name: 'Hero'}}}}});
  const grp = new Doc('Actor', {name: 'Party', type: 'group'});
  const ok = npcDoc(npc('NPC-A', 'A [TEST]'));
  ok.raw.name = 'A2 [TEST]';
  const scan = scanWorldEdits(world({docs: [pc, grp, ok]}), {includeUnchanged: true, includeWorldOnly: true});
  assert.deepEqual(scan.records.map(r => r.id), ['NPC-A']);
  assert.equal(scan.worldOnly.length, 0);
  assert.equal(scan.skipped.characters, 1);
  assert.match(previewHtml(scan), /1 player character left out/);
});

test('Journal page, Roll Table result and Macro edits are found', () => {
  const j = flagged(journal('JRN-1', 'Notes [TEST]', '<p>old</p>'));
  j.raw.pages = [{_id: 'p1', name: 'P1', type: 'text', sort: 1, text: {content: '<p>new</p>', format: 1}}];
  const t = flagged(table('TBL-1', 'Loot [TEST]'));
  t.raw.results = [{_id: 'r1', type: 'text', name: '', description: 'a', range: [1, 3], weight: 1, drawn: true}, {_id: 'r2', type: 'text', name: '', description: 'B changed', range: [4, 6], weight: 1, drawn: false}];
  const same = flagged(table('TBL-2', 'Same [TEST]'));
  same.raw.results = same.raw.results.map((r, n) => ({...r, _id: `x${n}`, drawn: true, name: ''}));
  const m = flagged(macro('MAC-1', 'Ping [TEST]'));
  m.raw.command = 'ui.notifications.info(2)';
  const m2 = flagged(macro('MAC-2', 'Crlf [TEST]')); m2.raw.command = 'ui.notifications.info(1)'.replace('(', '(');
  const scan = scanWorldEdits(world({docs: [j, t, same, m, m2]}));
  assert.deepEqual(scan.records.map(r => [r.id, r.changed_fields]), [
    ['JRN-1', ['foundry.data.pages[0].text.content']], ['MAC-1', ['foundry.data.command']], ['TBL-1', ['foundry.data.results[1].description']]]);
  assert.equal(only(scan, 'JRN-1').record.foundry.data.pages[0].text.content, '<p>new</p>');
  assert.equal(only(scan, 'TBL-1').record.foundry.data.results[1].description, 'B changed');
  assert.equal(only(scan, 'TBL-1').record.foundry.data.results[0].description, 'a');
  assert.equal(only(scan, 'MAC-1').record.foundry.data.command, 'ui.notifications.info(2)');
});

test('a Manager-made effect that was edited is a changed field of its Item', () => {
  const base = {name: 'Glow', disabled: false, transfer: true, changes: [{key: 'system.attributes.ac.bonus', type: 'add', value: '1', priority: null}]};
  const d = flagged(item('ITM-FX', 'Ring [TEST]'));
  d.raw.effects = [{_id: 'e1', name: 'Glow', disabled: false, transfer: true, changes: [{key: 'system.attributes.ac.bonus', type: 'add', value: '2', priority: null}],
    flags: {[MODULE_ID]: {effect: {effId: 'glow', baseline: JSON.stringify(base)}}}}];
  const r = only(scanWorldEdits(world({docs: [d]})), 'ITM-FX');
  assert.deepEqual(r.changed_fields, ['foundry.data.effects[0].changes']);
  assert.equal(r.record.foundry.data.effects[0].eff_id, 'glow');
  assert.equal(r.record.foundry.data.effects[0].changes[0].value, '2');
});

test('links to other Manager records go back to [[AGREF:ID|label]] markers; the generated Related list is dropped', () => {
  const target = npcDoc(npc('NPC-TARGET', 'Target [TEST]'));
  const d = flagged(item('ITM-LINK', 'Letter [TEST]', {description: {value: '<p>Original.</p>'}}));
  d.raw.system.description.value = `<p>Ask @UUID[${target.uuid}]{Target &amp; Co} about it.</p>\n<section class="ag-managed-links" data-ag-managed-links="1"><ul><li>x</li></ul></section>`;
  const r = only(scanWorldEdits(world({docs: [d, target]})), 'ITM-LINK');
  assert.deepEqual(r.changed_fields, ['foundry.data.system.description.value']);
  assert.equal(r.record.foundry.data.system.description.value, '<p>Ask [[AGREF:NPC-TARGET|Target & Co]] about it.</p>');
});

test('an unedited description that holds a resolved link is not an edit', () => {
  const target = npcDoc(npc('NPC-T2', 'T2 [TEST]'));
  const d = flagged(item('ITM-OK', 'Note [TEST]', {description: {value: '<p>See [[AGREF:NPC-T2|Two]] now.</p>'}}));
  d.raw.system.description.value = `<p>See @UUID[${target.uuid}]{Two} now.</p>`;
  assert.deepEqual(scanWorldEdits(world({docs: [d, target]})).records, []);
});

test('options: include unchanged, include world-only, and type selection', () => {
  const a = flagged(item('MAT-A', 'A [TEST]')), b = flagged(item('MAT-B', 'B [TEST]')); a.raw.name = 'A2 [TEST]';
  const mine = new Doc('Item', {name: 'Hand Made [TEST]', type: 'loot', system: {description: {value: '<p>mine</p>'}}});
  const jr = new Doc('JournalEntry', {name: 'My Notes [TEST]', pages: [{name: 'p', type: 'text', text: {content: '<p>t</p>'}, sort: 1}]});
  const w = world({docs: [a, b, mine, jr]});
  const basic = scanWorldEdits(w);
  assert.deepEqual(basic.records.map(r => r.id), ['MAT-A']); assert.deepEqual(basic.worldOnly, []);
  assert.equal(basic.counts.Item.worldOnly, 1);
  const withUnchanged = scanWorldEdits(w, {includeUnchanged: true});
  assert.deepEqual(withUnchanged.records.map(r => [r.id, r.changed_fields.length]), [['MAT-A', 1], ['MAT-B', 0]]);
  const withWorld = scanWorldEdits(w, {includeWorldOnly: true});
  assert.deepEqual(withWorld.records.map(r => r.id), ['MAT-A']);
  assert.equal(withWorld.worldOnly.length, 2);
  const hand = withWorld.worldOnly.find(x => x.name === 'Hand Made [TEST]');
  assert.deepEqual(hand, {entity_type: 'Item', document_type: 'Item', type: 'loot', name: 'Hand Made [TEST]', data: {name: 'Hand Made [TEST]', type: 'loot', description: '<p>mine</p>'}});
  assert.deepEqual(withWorld.worldOnly.find(x => x.document_type === 'JournalEntry').data.pages, [{name: 'p', text: '<p>t</p>'}]);
  const journalsOnly = scanWorldEdits(w, {types: ['JournalEntry'], includeWorldOnly: true});
  assert.deepEqual(journalsOnly.types, ['JournalEntry']); assert.equal(journalsOnly.records.length, 0); assert.equal(journalsOnly.worldOnly.length, 1);
  assert.equal(journalsOnly.counts.Item, undefined);
});

test('a document with no import baseline counts as edited and says why; unmanaged documents never appear in records', () => {
  const d = flagged(item('MAT-OLD', 'Old [TEST]'), {strip: true});
  const mine = new Doc('Item', {name: 'Mine [TEST]', type: 'loot'});
  const scan = scanWorldEdits(world({docs: [d, mine]}));
  assert.deepEqual(scan.records.map(r => [r.id, r.changed_fields]), [['MAT-OLD', ['(no import baseline)']]]);
});

test('the file has the documented schema and nothing else', () => {
  const a = flagged(item('MAT-A', 'A [TEST]')); a.raw.name = 'A2 [TEST]';
  const w = world({docs: [a]});
  const {file, filename} = buildEditsFile(w, scanWorldEdits(w), {now: new Date('2026-10-28T12:00:00Z')});
  assert.deepEqual(Object.keys(file), ['schema', 'created', 'world', 'manager_version', 'records', 'world_only']);
  assert.equal(file.schema, EDITS_SCHEMA); assert.equal(file.schema, 'ag-world-edits/0.1');
  assert.equal(file.created, '2026-10-28T12:00:00.000Z'); assert.equal(file.world, 'test-world'); assert.equal(file.manager_version, '0.77.0');
  assert.deepEqual(file.world_only, []);
  assert.deepEqual(Object.keys(file.records[0]), ['entity_type', 'document_type', 'id', 'name', 'source_package', 'source_package_version', 'changed_fields', 'record']);
  assert.equal(filename, 'AG_World_Edits_2026-10-28.json');
  JSON.parse(JSON.stringify(file));
});

test('GM only: a player is refused by the data layer for scan, build and save', () => {
  const w = world({gm: false, docs: [flagged(item('MAT-A', 'A [TEST]'))]});
  assert.throws(() => scanWorldEdits(w), /Only the GM/);
  const gm = world({docs: []});
  const scan = scanWorldEdits(gm);
  assert.throws(() => buildEditsFile(w, scan), /Only the GM/);
  let saved = 0;
  assert.throws(() => saveWorldEdits(w, {}, {save: () => saved++}), /Only the GM/);
  assert.equal(saved, 0);
  assert.throws(() => scanWorldEdits({user: null}), /Only the GM/);
});

test('read-only: scanning and saving writes nothing to any document and the saved file is plain JSON', () => {
  const docs = [flagged(item('MAT-A', 'A [TEST]')), npcDoc(npc('NPC-B', 'B [TEST]')), flagged(journal('JRN-C', 'C [TEST]', '<p>c</p>')), flagged(table('TBL-D', 'D [TEST]')), flagged(macro('MAC-E', 'E [TEST]')),
    new Doc('Item', {name: 'Free [TEST]', type: 'loot'})];
  docs[0].raw.name = 'Edited [TEST]';
  const before = snapshotOf(docs);
  const saved = [];
  const out = saveWorldEdits(world({docs}), {includeUnchanged: true, includeWorldOnly: true}, {save: (n, v) => saved.push([n, v]), now: new Date('2026-10-28T00:00:00Z')});
  assert.equal(saved.length, 1);
  assert.equal(saved[0][1].records.length, 5); assert.equal(saved[0][1].world_only.length, 1);
  assert.equal(snapshotOf(docs), before);
  assert.equal(out.scan.editedCount, 1);
});

test('preview lists edited records with their changed field names; copy summary has names only', () => {
  const a = flagged(item('MAT-A', 'Rope [TEST]')); a.raw.system.description.value = '<p>x</p>';
  const d = npcDoc(npc('NPC-B', 'Orin [TEST]')); d.raw.name = 'Orin 2 [TEST]';
  const scan = scanWorldEdits(world({docs: [a, d]}));
  const html = previewHtml(scan);
  assert.match(html, /Nothing is changed in your world/);
  assert.match(html, /Rope \[TEST\]/); assert.match(html, /<code>foundry\.data\.system\.description\.value<\/code>/); assert.match(html, /<code>foundry\.data\.name<\/code>/);
  assert.match(html, /2 edited records/);
  const text = summaryText(scan);
  assert.match(text, /Edited records: 2/); assert.match(text, /Items \(1\): Rope \[TEST\]/); assert.match(text, /NPC Actors \(1\): Orin 2 \[TEST\]/);
  assert.ok(!/MAT-A|NPC-B|system\./.test(text), 'names only');
  assert.match(previewHtml(scanWorldEdits(world({docs: []}))), /No edited records/);
});

test('wiring: button, handler, API, versions and docs', () => {
  const tpl = read('../templates/manager.hbs'), main = read('../scripts/main.js');
  assert.match(tpl, /data-ag-action="world-edits-export"[^>]*>.*Export edited records…/s);
  assert.match(main, /case "world-edits-export"/);
  assert.match(main, /exportEdits:options=>saveWorldEdits\(game,options,\{save:downloadJson\}\)/);
  assert.equal(JSON.parse(read('../module.json')).version, '0.91.0');
  assert.ok(JSON.parse(read('../module.json')).download.endsWith('/ashen-gate-manager-v0.91.0/ashen-gate-manager.zip'));
  assert.ok(fs.existsSync(new URL('../../../docs/world-edits-export.md', import.meta.url)));
  assert.match(read('../CHANGELOG.md'), /^## 0\.77\.0/m);
  assert.match(read('../README.md'), /Export edited records/);
  assert.deepEqual([...EDIT_TYPES], ['Item', 'JournalEntry', 'Actor', 'RollTable', 'Macro']);
});
