import test from 'node:test';
import assert from 'node:assert/strict';
import {relatedFor, relatedSection, withRelated, stripRelated, RELATED_MAX, STRUCTURAL_RELATIONS} from '../scripts/related-lists.mjs';
import {exportedFields, planRecord, getPath} from '../scripts/core.js';
import {incomingFields, diffFields} from '../scripts/sync.js';
import {resolveReference, referenceHtml, buildReferenceIndex, convertLegacyBlock, createReferenceLinks} from '../scripts/reference-links.mjs';
import {resolveRichText, stripReferenceBlock} from '../scripts/import-fidelity.js';

const M = 'ashen-gate-manager';
const ID_TEXT = /\b[A-Z]+(?:-[A-Z0-9_]+)+\b/;
const PLAYER = {id: 'p1', isGM: false}, GM = {id: 'gm', isGM: true};
const ref = (relation, target_id, mode = 'optional') => ({relation, target_id, mode});
function item(id, refs, {description = '<p>A [TEST] trinket.</p>', visibility = 'player', type = 'Item'} = {}) {
  return {id, entity_type: 'HandoutItem', status: 'approved', visibility, refs,
    foundry: {document_type: type, data: {name: '[TEST] ' + id, type: 'loot', system: {description: {value: description}}}}};
}
const lineIds = record => relatedFor(record).map(l => l.id);

test('0.69.0 rule: only people, handouts and quests qualify; gear, recipes, shops, locations do not', () => {
  const rec = item('ITEM-TEST-CHARM', [
    ref('requires_material', 'MAT-TEST-IRON'), ref('crafted_by', 'PROF-TEST-SMITH'), ref('starting_recipe', 'REC-TEST-CHARM'),
    ref('located_at', 'LOC-TEST-FERRY'), ref('related', 'SHOP-TEST-STALL'), ref('related', 'FAC-TEST-GUILD'), ref('related', 'CRE-TEST-RAT'),
    ref('related', 'NPC-TEST-WARDEN')]);
  assert.deepEqual(lineIds(rec), ['NPC-TEST-WARDEN']);
  for (const id of ['NPC-TEST-A', 'HANDOUT-TEST-A', 'ITEM-HANDOUT-TEST-B', 'QUEST-TEST-A', 'ORDER-TEST-A', 'CONTRACT-TEST-A'])
    assert.equal(relatedFor(item('ITEM-TEST-X', [ref('related', id)])).length, 1, id);
  for (const id of ['LOC-TEST-A', 'MAT-TEST-A', 'REC-TEST-A', 'SHOP-TEST-A', 'PROF-TEST-A', 'PERK-TEST-A', 'FAC-TEST-A', 'ROUTE-TEST-A', 'ITEM-TEST-A'])
    assert.equal(relatedFor(item('ITEM-TEST-X', [ref('related', id)])).length, 0, id);
});

test('0.69.0 rule: structural relations never qualify, other relations (including new ones) do', () => {
  for (const relation of STRUCTURAL_RELATIONS) assert.deepEqual(relatedFor(item('ITEM-TEST-X', [ref(relation, 'NPC-TEST-A')])), [], relation);
  for (const relation of ['related', 'offers_objective', 'associated_objective', 'fulfills_objective', 'found_with', 'created_by', 'something_new'])
    assert.equal(relatedFor(item('ITEM-TEST-X', [ref(relation, 'NPC-TEST-A')])).length, 1, relation);
  // Legacy shapes: a bare id, {id}, {type}.
  assert.deepEqual(lineIds(item('ITEM-TEST-X', ['NPC-TEST-A', {id: 'QUEST-TEST-A'}, {type: 'related', target_id: 'HANDOUT-TEST-A'}])), ['HANDOUT-TEST-A', 'NPC-TEST-A', 'QUEST-TEST-A']);
});

test('0.69.0 rule: not for journals, actors, GM-only records, records without refs, or malformed ids', () => {
  const refs = [ref('related', 'NPC-TEST-A')];
  assert.deepEqual(relatedFor(item('HANDOUT-TEST-J', refs, {type: 'JournalEntry'})), []);
  assert.deepEqual(relatedFor(item('NPC-TEST-B', refs, {type: 'Actor'})), []);
  assert.deepEqual(relatedFor(item('ITEM-TEST-X', refs, {visibility: 'gm'})), []);
  assert.deepEqual(relatedFor(item('ITEM-TEST-X', [])), []);
  assert.deepEqual(relatedFor({foundry: {document_type: 'Item'}}), []);
  assert.deepEqual(relatedFor(null), []);
  assert.deepEqual(lineIds(item('ITEM-TEST-X', [ref('related', 'npc-test-lower'), ref('related', 'NPC-'), ref('related', 'JournalEntry.abc'), ref('related', 7), null, 5])), []);
  assert.equal(relatedFor(item('ITEM-TEST-X', [ref('related', 'NPC-TEST-A')], {visibility: 'reveal_gated'})).length, 1);
});

test('0.69.0 rule: handouts first, then people, then quests; file order inside a group; one line per target', () => {
  const rec = item('ITEM-TEST-X', [ref('related', 'QUEST-TEST-1'), ref('related', 'NPC-TEST-1'), ref('offers_objective', 'ORDER-TEST-1'),
    ref('related', 'HANDOUT-TEST-1'), ref('related', 'NPC-TEST-2'), ref('related', 'NPC-TEST-1'), ref('related', 'ITEM-HANDOUT-TEST-1'), ref('related', 'ITEM-HANDOUT-TEST-2')]);
  assert.deepEqual(lineIds(rec), ['HANDOUT-TEST-1', 'HANDOUT-TEST-2', 'NPC-TEST-1', 'NPC-TEST-2', 'QUEST-TEST-1']);
  // The journal and its Item twin are one handout, written as the journal id (the resolver prefers the twin).
  assert.deepEqual(relatedFor(item('ITEM-TEST-X', [ref('related', 'ITEM-HANDOUT-TEST-9')])).map(l => [l.id, l.kind]), [['HANDOUT-TEST-9', 'handout']]);
});

test('0.69.0 rule: at most five lines, kept by order of importance', () => {
  const refs = [...Array.from({length: 4}, (_, i) => ref('related', `QUEST-TEST-${i}`)), ...Array.from({length: 4}, (_, i) => ref('related', `NPC-TEST-${i}`)), ref('related', 'HANDOUT-TEST-LAST')];
  const ids = lineIds(item('ITEM-TEST-X', refs));
  assert.equal(RELATED_MAX, 5);
  assert.deepEqual(ids, ['HANDOUT-TEST-LAST', 'NPC-TEST-0', 'NPC-TEST-1', 'NPC-TEST-2', 'NPC-TEST-3']);
});

test('0.69.0 rule: an Item never lists itself, its own journal, or the journal it is the twin of', () => {
  assert.deepEqual(lineIds(item('ITEM-HANDOUT-TEST-LEDGER', [ref('related', 'HANDOUT-TEST-LEDGER'), ref('related', 'ITEM-HANDOUT-TEST-LEDGER'), ref('also_available_as_journal', 'HANDOUT-TEST-LEDGER')])), []);
  assert.deepEqual(lineIds(item('ITEM-TEST-COPY', [ref('also_available_as_journal', 'HANDOUT-TEST-NOTICE'), ref('related', 'NPC-TEST-A')])), ['NPC-TEST-A']);
  assert.deepEqual(lineIds(item('ITEM-TEST-X', [ref('related', 'ITEM-TEST-X')])), []);
  // A different handout is still listed.
  assert.deepEqual(lineIds(item('ITEM-HANDOUT-TEST-LEDGER', [ref('related', 'HANDOUT-TEST-OTHER')])), ['HANDOUT-TEST-OTHER']);
});

test('0.69.0 section: delimited, deterministic, no ids in visible text', () => {
  const lines = relatedFor(item('ITEM-TEST-X', [ref('offers_objective', 'QUEST-TEST-A'), ref('related', 'NPC-TEST-A'), ref('related', 'HANDOUT-TEST-A'), ref('created_by', 'NPC-TEST-B')]));
  const html = relatedSection(lines);
  assert.match(html, /^<section class="ag-managed-links" data-ag-managed-links="1"><h4>Related<\/h4><ul>.*<\/ul><\/section>$/);
  assert.equal(relatedSection([]), '');
  assert.equal(html, relatedSection(lines));
  // What a reader without Manager sees (tokens replaced by their labels) has words only.
  const plain = html.replace(/@AGRef\[[^\]]+\]\{([^}]*)\}/g, '$1').replace(/<[^>]+>/g, ' ');
  assert.doesNotMatch(plain, ID_TEXT);
  assert.match(plain, /Offers: Quest/); assert.match(plain, /Made by: Person/); assert.match(plain, /Handout/);
  // The lead-in is plain English; an unknown relation gets none.
  assert.doesNotMatch(relatedSection(relatedFor(item('ITEM-TEST-X', [ref('some_new_relation', 'NPC-TEST-A')]))), /some|new_relation/);
});

test('0.69.0 withRelated: appended at the end, replaced not duplicated, removed when empty, idempotent', () => {
  const lines = relatedFor(item('ITEM-TEST-X', [ref('related', 'NPC-TEST-A')]));
  const body = '<h3>Table</h3><p>Effect &amp; Rules</p><p>Outcomes and limits</p>';
  const once = withRelated(body, lines);
  assert.ok(once.startsWith(body)); assert.ok(once.endsWith('</section>'));
  assert.equal(withRelated(once, lines), once);
  assert.equal(withRelated(withRelated(once, lines), lines), once);
  assert.equal((once.match(/data-ag-managed-links/g) ?? []).length, 1);
  assert.equal(withRelated(once, []), body);
  assert.equal(stripRelated(once), body);
  const other = relatedFor(item('ITEM-TEST-X', [ref('related', 'NPC-TEST-B')]));
  assert.equal((withRelated(once, other).match(/<section/g) ?? []).length, 1);
  assert.match(withRelated(once, other), /NPC-TEST-B/); assert.doesNotMatch(withRelated(once, other), /NPC-TEST-A/);
  assert.equal(withRelated(undefined, lines), undefined);
  // The older import's remover understands the same section.
  assert.equal(stripReferenceBlock(once), body);
});

test('0.69.0 import fields: only a qualifying Item gets the section; other records are unchanged', () => {
  const qualifying = item('ITEM-TEST-X', [ref('related', 'NPC-TEST-A')]);
  const gear = item('ITEM-TEST-G', [ref('requires_material', 'MAT-TEST-IRON')]);
  assert.match(exportedFields(qualifying)['system.description.value'], /^<p>A \[TEST\] trinket\.<\/p>\n<section class="ag-managed-links"/);
  assert.equal(exportedFields(gear)['system.description.value'], '<p>A [TEST] trinket.</p>');
  assert.equal(incomingFields(qualifying)['system.description.value'], exportedFields(qualifying)['system.description.value']);
  const noDescription = item('ITEM-TEST-N', [ref('related', 'NPC-TEST-A')]); delete noDescription.foundry.data.system.description;
  assert.equal(exportedFields(noDescription)['system.description.value'], undefined);
  const journal = item('HANDOUT-TEST-J', [ref('related', 'NPC-TEST-A')], {type: 'JournalEntry'});
  assert.deepEqual(exportedFields(journal), {name: '[TEST] HANDOUT-TEST-J'});
  // The source record is never mutated.
  assert.equal(qualifying.foundry.data.system.description.value, '<p>A [TEST] trinket.</p>');
});

/** A matched Item as planRecord sees it: live values + the baseline flag. */
function matched(live, baseline) {
  return [{documentName: 'Item', type: 'loot', flag: {managedFields: baseline}, coreLink: null, get: path => getPath({name: baseline.name, system: {description: {value: live}}}, path)}];
}
const importedState = record => { const fields = exportedFields(record); return {fields, matched: description => matched(description, fields)}; };

test('0.69.0 import plan: running the same import twice changes nothing (idempotent)', () => {
  const rec = item('ITEM-TEST-X', [ref('related', 'NPC-TEST-A'), ref('related', 'HANDOUT-TEST-A')]);
  const {fields, matched: m} = importedState(rec);
  const live = fields['system.description.value'];
  assert.equal(planRecord(rec, m(live)).action, 'unchanged');
  // What resolvePackageLinks writes for a description with no markers or cells equals the imported text, byte for byte.
  const final1 = withRelated(stripReferenceBlock(resolveRichText(rec.foundry.data.system.description.value, new Map()).text), relatedFor(rec));
  const final2 = withRelated(final1, relatedFor(rec));
  assert.equal(final1, live); assert.equal(final2, final1);
});

test('0.69.0 import plan: an Item whose description the GM edited is kept (not touched)', () => {
  const rec = item('ITEM-TEST-X', [ref('related', 'NPC-TEST-A')]);
  const {fields, matched: m} = importedState(rec);
  const edited = fields['system.description.value'] + '<p>My table note.</p>';
  assert.equal(planRecord(rec, m(edited)).action, 'local');
  // A new list in the package (another NPC) with a GM-edited description is a conflict the GM resolves, never a silent overwrite.
  const changed = item('ITEM-TEST-X', [ref('related', 'NPC-TEST-B')]);
  assert.equal(planRecord(changed, m(edited)).action, 'conflict');
});

test('0.69.0 import plan: a record that gains a list updates an unedited Item; one that loses it removes the list', () => {
  const plain = item('ITEM-TEST-X', []);
  const before = importedState(plain);
  const gains = item('ITEM-TEST-X', [ref('related', 'NPC-TEST-A')]);
  const plan = planRecord(gains, before.matched(plain.foundry.data.system.description.value));
  assert.equal(plan.action, 'update');
  assert.match(plan.patch['system.description.value'], /@AGRef\[NPC-TEST-A\]\{Person\}/);
  // Loses it (the ref was removed or no longer qualifies): the unedited section is taken out again.
  const had = importedState(gains);
  const lost = planRecord(plain, had.matched(had.fields['system.description.value']));
  assert.equal(lost.action, 'update');
  assert.equal(lost.patch['system.description.value'], '<p>A [TEST] trinket.</p>');
  const nowGear = item('ITEM-TEST-X', [ref('requires_material', 'MAT-TEST-IRON')]);
  assert.equal(planRecord(nowGear, had.matched(had.fields['system.description.value'])).patch['system.description.value'], '<p>A [TEST] trinket.</p>');
});

test('0.69.0 import plan: a list converted by 0.68.0 is replaced by the current rule, or removed when it no longer qualifies', () => {
  const legacyHtml = '<p>A [TEST] trinket.</p>\n<section class="ag-managed-links" data-ag-managed-links="1"><h4>References</h4><ul><li><span>related: </span>@UUID[Item.abc]{LOC-TEST-FERRY}</li><li><span>requires_material: </span>@UUID[Item.def]{MAT-TEST-IRON}</li></ul></section>';
  const converted = convertLegacyBlock(legacyHtml);
  assert.match(converted, /@AGRef\[LOC-TEST-FERRY\]\{Location\}/);
  const baseline = {name: '[TEST] ITEM-TEST-X', 'system.description.value': converted};
  const qualifying = item('ITEM-TEST-X', [ref('related', 'NPC-TEST-A')]);
  const plan = planRecord(qualifying, matched(converted, baseline));
  assert.equal(plan.action, 'update');
  assert.doesNotMatch(plan.patch['system.description.value'], /LOC-TEST-FERRY|MAT-TEST-IRON/);
  const clutter = item('ITEM-TEST-X', [ref('related', 'LOC-TEST-FERRY'), ref('requires_material', 'MAT-TEST-IRON')]);
  assert.equal(planRecord(clutter, matched(converted, baseline)).patch['system.description.value'], '<p>A [TEST] trinket.</p>');
  // The converted list on an Item the GM edited is not touched.
  const keptEdit = planRecord(clutter, matched(converted + '<p>Mine</p>', baseline));
  assert.equal(keptEdit.action, 'conflict'); assert.equal(keptEdit.patch, undefined);
});

test('0.69.0 the conversion of older lists leaves a current Related list alone', () => {
  const html = withRelated('<p>x</p>', relatedFor(item('ITEM-TEST-X', [ref('related', 'NPC-TEST-A'), ref('offers_objective', 'QUEST-TEST-A')])));
  assert.equal(convertLegacyBlock(html), html);
});

test('0.69.0 Sync: the preview reports no change for an Item that already has its list, and one change when the list is missing', () => {
  const rec = item('ITEM-TEST-X', [ref('related', 'NPC-TEST-A'), ref('related', 'QUEST-TEST-A')]);
  const fields = incomingFields(rec);
  const raw = {name: '[TEST] ITEM-TEST-X', system: {description: {value: fields['system.description.value']}}};
  const baseline = {...fields};
  assert.deepEqual(diffFields(raw, fields, {baseline}).changes, []);
  const second = diffFields(raw, incomingFields(structuredClone(rec)), {baseline});
  assert.deepEqual(second.changes, []);
  // Missing list: exactly one change, on the description, and it is not a GM edit.
  const bare = {name: raw.name, system: {description: {value: rec.foundry.data.system.description.value}}};
  const d = diffFields(bare, fields, {baseline: {...fields, 'system.description.value': rec.foundry.data.system.description.value}});
  assert.deepEqual(d.changes.map(c => [c.path, c.gmEdited]), [['system.description.value', false]]);
  // Not a qualifying record: nothing to add.
  const gear = item('ITEM-TEST-G', [ref('requires_material', 'MAT-TEST-IRON')]);
  const gearRaw = {name: '[TEST] ITEM-TEST-G', system: {description: {value: gear.foundry.data.system.description.value}}};
  assert.deepEqual(diffFields(gearRaw, incomingFields(gear), {baseline: incomingFields(gear)}).changes, []);
});

test('0.69.0 reading: players see names or neutral words, never ids, in every mode', () => {
  const doc = (documentName, id, name, {visibility = 'player', observers = []} = {}) => ({documentName, name, uuid: `${documentName}.${id}`.replace(/-/g, ''),
    flags: {[M]: {source: {sourceId: id, visibility}}}, testUserPermission: (u, l) => l === 'OBSERVER' && observers.includes(u.id)});
  const journal = doc('JournalEntry', 'HANDOUT-TEST-A', '[TEST] Notice', {observers: ['p1']});
  const hiddenNpc = doc('Actor', 'NPC-TEST-HIDDEN', '[TEST] Secret Person', {visibility: 'gm'});
  const index = buildReferenceIndex([journal, hiddenNpc]);
  const quest = id => (id === 'QUEST-TEST-OPEN' ? '[TEST] Open quest' : null);
  const cases = [['HANDOUT-TEST-A', 'Handout'], ['NPC-TEST-HIDDEN', 'Person'], ['QUEST-TEST-OPEN', 'Quest'], ['QUEST-TEST-SECRET', 'Quest'], ['ORDER-TEST-X', 'Order'], ['CONTRACT-TEST-X', 'Contract']];
  for (const [id, word] of cases) {
    const r = resolveReference(id, word, {viewer: PLAYER, index, codex: new Map(), quest});
    const html = referenceHtml(r);
    if (r.mode === 'quest') { assert.equal(r.name, '[TEST] Open quest'); assert.match(html, /Open \[TEST\] Open quest in the Quest Log/); }
    else if (id === 'HANDOUT-TEST-A') assert.equal(r.name, '[TEST] Notice');
    else assert.deepEqual(r, {mode: 'text', name: word});
    const visible = html.replace(/<[^>]*>/g, ' ').replace(/data-[a-z-]+="[^"]*"/g, '');
    if (r.mode !== 'quest' && r.mode !== 'sheet') assert.doesNotMatch(html, ID_TEXT, id);
    assert.doesNotMatch(visible, ID_TEXT, id);
    assert.doesNotMatch(html, /Secret Person/);
  }
  // A hidden quest is neutral text with no quest id anywhere in the markup.
  assert.doesNotMatch(referenceHtml(resolveReference('QUEST-TEST-SECRET', 'Quest', {viewer: PLAYER, index, quest})), /QUEST-|data-/);
  // Without the Quest Log nothing resolves, and nothing throws.
  assert.deepEqual(resolveReference('QUEST-TEST-OPEN', 'Quest', {viewer: GM, index}), {mode: 'text', name: 'Quest'});
  assert.deepEqual(resolveReference('QUEST-TEST-OPEN', 'Quest', {viewer: GM, index, quest: () => { throw new Error('x'); }}), {mode: 'text', name: 'Quest'});
});

test('0.69.0 quest links: click re-checks the Quest Log for that person, opens it, never throws', async () => {
  const opened = [], notes = [];
  let visible = true;
  const api = createReferenceLinks({game: {user: PLAYER}, getDocs: () => [], questName: id => (visible ? '[TEST] Open quest' : null),
    openQuest: async id => { opened.push(id); }, notify: t => notes.push(t)});
  const r = await api.resolve('QUEST-TEST-OPEN', 'Quest');
  assert.equal(r.mode, 'quest');
  const link = {dataset: {agRefOpen: 'quest', agRefQuest: 'QUEST-TEST-OPEN'}};
  const event = {target: {closest: () => link}, preventDefault() {}, stopPropagation() {}};
  assert.deepEqual(await api.onClick(event), {opened: 'quest', quest: 'QUEST-TEST-OPEN'});
  assert.deepEqual(opened, ['QUEST-TEST-OPEN']);
  visible = false;
  assert.deepEqual(await api.onClick(event), {opened: null});
  assert.deepEqual(opened, ['QUEST-TEST-OPEN']);
  assert.match(notes.at(-1), /not available/);
});
