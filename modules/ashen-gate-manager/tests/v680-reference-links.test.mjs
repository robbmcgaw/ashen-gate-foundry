import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReferenceIndex, candidateIds, resolveReference, referenceHtml, referenceToken, convertLegacyBlock, neutralLabel,
  createReferenceLinks, AGREF_PATTERN} from '../scripts/reference-links.mjs';
import {resolveRichText, buildUuidIndex, resolveRefCells} from '../scripts/import-fidelity.js';
import {markerTextMatches} from '../scripts/sync.js';
import {relationLabel} from '../scripts/labels.js';

const M = 'ashen-gate-manager';
const GM = {id: 'gm', isGM: true};
const PLAYER = {id: 'p1', isGM: false};
/** Synthetic world document. `observers` = user ids with Observer permission. */
function doc(documentName, id, name, {visibility = 'player', observers = [], refs = [], uuid} = {}) {
  return {documentName, name, uuid: uuid ?? `${documentName}.${id.replace(/[^A-Za-z0-9]/g, '')}`,
    flags: {[M]: {source: {sourceId: id, visibility, refs}}},
    testUserPermission: (user, level) => level === 'OBSERVER' && observers.includes(user.id),
    sheet: {rendered: 0, render() { this.rendered++; return this; }}};
}
const JOURNAL = doc('JournalEntry', 'HANDOUT-TEST-NOTICE', '[TEST] Lost ledger notice', {observers: ['p1']});
const TWIN = doc('Item', 'ITEM-HANDOUT-TEST-NOTICE', '[TEST] Lost ledger', {observers: ['p1']});
const NPC = doc('Actor', 'NPC-TEST-WARDEN', '[TEST] Warden Pell', {visibility: 'reveal_gated'});
const ID_TEXT = /\b[A-Z]+(?:-[A-Z0-9_]+)+\b/;

test('0.68.0: a handout reference goes to its Item twin first, then the journal, then plain text', () => {
  const index = buildReferenceIndex([JOURNAL, TWIN]);
  assert.deepEqual(candidateIds('HANDOUT-TEST-NOTICE', index.twins), ['ITEM-HANDOUT-TEST-NOTICE', 'HANDOUT-TEST-NOTICE']);
  for (const viewer of [GM, PLAYER]) {
    const r = resolveReference('HANDOUT-TEST-NOTICE', 'HANDOUT-TEST-NOTICE', {viewer, index});
    assert.equal(r.mode, 'sheet'); assert.equal(r.uuid, TWIN.uuid); assert.equal(r.name, '[TEST] Lost ledger'); assert.equal(r.documentName, 'Item');
  }
  // No twin in the world: the journal.
  const journalOnly = buildReferenceIndex([JOURNAL]);
  assert.equal(resolveReference('HANDOUT-TEST-NOTICE', '', {viewer: PLAYER, index: journalOnly}).uuid, JOURNAL.uuid);
  // Twin not shared with this player: the journal they can see.
  const hiddenTwin = doc('Item', 'ITEM-HANDOUT-TEST-NOTICE', '[TEST] Lost ledger', {observers: []});
  assert.equal(resolveReference('HANDOUT-TEST-NOTICE', '', {viewer: PLAYER, index: buildReferenceIndex([JOURNAL, hiddenTwin])}).uuid, JOURNAL.uuid);
  // Nothing in the world: plain text, neutral label, no id.
  const none = resolveReference('HANDOUT-TEST-NOTICE', 'HANDOUT-TEST-NOTICE', {viewer: GM, index: buildReferenceIndex([])});
  assert.deepEqual(none, {mode: 'text', name: 'Handout'});
});

test('0.68.0: a twin declared by also_available_as_journal is found even with another id', () => {
  const twin = doc('Item', 'ITEM-TEST-LEDGER-COPY', '[TEST] Ledger copy', {observers: ['p1'],
    refs: [{relation: 'also_available_as_journal', target_id: 'HANDOUT-TEST-NOTICE', mode: 'optional'}]});
  const index = buildReferenceIndex([JOURNAL, twin]);
  assert.equal(resolveReference('HANDOUT-TEST-NOTICE', '', {viewer: PLAYER, index}).uuid, twin.uuid);
});

test('0.68.0: players never get GM-only or unshared records, and never an id in the text or markup', () => {
  const gmOnly = doc('JournalEntry', 'HANDOUT-TEST-SECRET', '[TEST] Secret orders', {visibility: 'gm', observers: ['p1']});
  const unshared = doc('JournalEntry', 'HANDOUT-TEST-UNSHARED', '[TEST] Sealed letter', {observers: []});
  const index = buildReferenceIndex([gmOnly, unshared]);
  for (const id of ['HANDOUT-TEST-SECRET', 'HANDOUT-TEST-UNSHARED']) {
    const r = resolveReference(id, id, {viewer: PLAYER, index});
    assert.deepEqual(r, {mode: 'text', name: 'Handout'});
    const html = referenceHtml(r);
    assert.doesNotMatch(html, ID_TEXT); assert.doesNotMatch(html, /JournalEntry\./); assert.doesNotMatch(html, /Secret|Sealed/);
  }
  // The GM sees both, by name.
  assert.equal(resolveReference('HANDOUT-TEST-SECRET', '', {viewer: GM, index}).name, '[TEST] Secret orders');
  // An author-written name stays as plain text when the target is hidden (it was already in the text).
  assert.equal(resolveReference('HANDOUT-TEST-UNSHARED', 'the sealed letter', {viewer: PLAYER, index}).name, 'the sealed letter');
});

test('0.68.0: NPC references: GM opens the Actor; a player gets the Codex only when the NPC is revealed to them', () => {
  const index = buildReferenceIndex([NPC]);
  const gm = resolveReference('NPC-TEST-WARDEN', 'NPC-TEST-WARDEN', {viewer: GM, index});
  assert.deepEqual([gm.mode, gm.uuid, gm.name, gm.documentName], ['sheet', NPC.uuid, '[TEST] Warden Pell', 'Actor']);
  const revealed = resolveReference('NPC-TEST-WARDEN', '', {viewer: PLAYER, index, codex: new Map([['NPC-TEST-WARDEN', '[TEST] The Warden']])});
  assert.deepEqual(revealed, {mode: 'codex', npc: 'NPC-TEST-WARDEN', name: '[TEST] The Warden', icon: 'fa-solid fa-address-book'});
  const hidden = resolveReference('NPC-TEST-WARDEN', 'NPC-TEST-WARDEN', {viewer: PLAYER, index, codex: new Map()});
  assert.deepEqual(hidden, {mode: 'text', name: 'Person'});
  assert.doesNotMatch(referenceHtml(hidden), /Warden|NPC-|Actor\./);
  // Codex unavailable (not shared, no GM connected): same plain text.
  assert.equal(resolveReference('NPC-TEST-WARDEN', '', {viewer: PLAYER, index, codex: null}).mode, 'text');
  // A player who owns/observes the Actor itself may open its sheet.
  const owned = doc('Actor', 'NPC-TEST-WARDEN', '[TEST] Warden Pell', {observers: ['p1']});
  assert.equal(resolveReference('NPC-TEST-WARDEN', '', {viewer: PLAYER, index: buildReferenceIndex([owned])}).mode, 'sheet');
});

test('0.68.0: markup is our own link (no content-link class, no data-uuid) with the name and a type icon', () => {
  const index = buildReferenceIndex([JOURNAL, TWIN, NPC]);
  const item = referenceHtml(resolveReference('HANDOUT-TEST-NOTICE', '', {viewer: GM, index}));
  assert.match(item, /^<a href="#" class="agm-ref-link" data-ag-ref-open="sheet" data-ag-ref-uuid="Item\.[^"]+"/);
  assert.match(item, /<i class="fa-solid fa-suitcase" aria-hidden="true"><\/i> \[TEST\] Lost ledger<\/a>$/);
  assert.doesNotMatch(item, /content-link|data-uuid|data-link/);
  const actor = referenceHtml(resolveReference('NPC-TEST-WARDEN', '', {viewer: GM, index}));
  assert.match(actor, /fa-solid fa-user/);
  assert.equal(referenceToken('NPC-TEST-WARDEN', 'NPC-TEST-WARDEN'), '@AGRef[NPC-TEST-WARDEN]{Person}');
  assert.equal(referenceToken('LOC-TEST-QUAY', '[TEST] Quay'), '@AGRef[LOC-TEST-QUAY]{[TEST] Quay}'.replace('{[TEST] Quay}', '{TEST Quay}'));
  assert.equal(neutralLabel('ZZZ-UNKNOWN'), 'Related record');
  const m = [...'<p>See @AGRef[NPC-TEST-WARDEN]{the warden} and @AGRef[HANDOUT-TEST-NOTICE].</p>'.matchAll(AGREF_PATTERN)];
  assert.deepEqual(m.map(x => [x[1], x[2]]), [['NPC-TEST-WARDEN', 'the warden'], ['HANDOUT-TEST-NOTICE', undefined]]);
});

/** A link element (or a child of one) as Foundry/MEJ would render it; `container` = the page it sits in. */
function clickOn(dataset, {container = 'monks-enhanced-journal', child = true} = {}) {
  const link = {dataset, container, closest: sel => sel.startsWith('a.agm-ref-link') ? link : null};
  const icon = {closest: sel => link.closest(sel)};
  const event = {target: child ? icon : link, prevented: 0, stopped: 0, preventDefault() { this.prevented++; }, stopPropagation() { this.stopped++; }};
  return event;
}
function runtime(user, docs, extra = {}) {
  const calls = {codex: [], notes: []};
  const api = createReferenceLinks({game: {user}, getDocs: () => docs,
    fromUuid: async uuid => docs.find(d => d.uuid === uuid) ?? null,
    openCodex: async id => { calls.codex.push(id); }, notify: t => calls.notes.push(t), ...extra});
  return {api, calls};
}

test('0.68.0: GM click on an NPC link inside a Monk\'s Enhanced Journal page renders the Actor sheet directly', async () => {
  const npc = doc('Actor', 'NPC-TEST-WARDEN', '[TEST] Warden Pell');
  const {api} = runtime(GM, [npc]);
  const event = clickOn({agRefOpen: 'sheet', agRefUuid: npc.uuid});
  const out = await api.onClick(event);
  assert.deepEqual(out, {opened: 'sheet', documentName: 'Actor'});
  assert.equal(npc.sheet.rendered, 1);
  assert.equal(event.prevented, 1); assert.equal(event.stopped, 1, 'MEJ / core handlers do not also act on it');
});

test('0.68.0: player click on a revealed NPC opens the Codex at that NPC; other links are left alone', async () => {
  const {api, calls} = runtime(PLAYER, []);
  assert.deepEqual(await api.onClick(clickOn({agRefOpen: 'codex', agRefNpc: 'NPC-TEST-WARDEN'})), {opened: 'codex', npc: 'NPC-TEST-WARDEN'});
  assert.deepEqual(calls.codex, ['NPC-TEST-WARDEN']);
  // A normal Foundry content link (not ours): untouched, default not prevented.
  const other = {target: {closest: () => null}, prevented: 0, preventDefault() { this.prevented++; }};
  assert.equal(await api.onClick(other), null); assert.equal(other.prevented, 0);
});

test('0.68.0: click re-checks permission and fails soft for a missing or hidden target', async () => {
  const hidden = doc('Actor', 'NPC-TEST-WARDEN', '[TEST] Warden Pell');
  const {api, calls} = runtime(PLAYER, [hidden]);
  assert.deepEqual(await api.onClick(clickOn({agRefOpen: 'sheet', agRefUuid: hidden.uuid})), {opened: null});
  assert.equal(hidden.sheet.rendered, 0);
  assert.deepEqual(await api.onClick(clickOn({agRefOpen: 'sheet', agRefUuid: 'Actor.gone'})), {opened: null});
  assert.equal(calls.notes.length, 2);
  const broken = runtime(GM, [], {fromUuid: async () => { throw new Error('boom'); }});
  const warn = console.warn; console.warn = () => {};
  try { assert.deepEqual(await broken.api.onClick(clickOn({agRefOpen: 'sheet', agRefUuid: 'Item.x'})), {opened: null}); }
  finally { console.warn = warn; }
});

test('0.68.0: resolve() asks the Codex once (cached) and only for NPC/creature ids; GM never asks', async () => {
  let asked = 0;
  const npc = doc('Actor', 'NPC-TEST-WARDEN', '[TEST] Warden Pell');
  const {api} = runtime(PLAYER, [npc, JOURNAL], {codexNames: async () => { asked++; return new Map([['NPC-TEST-WARDEN', '[TEST] Warden Pell']]); }});
  assert.equal((await api.resolve('NPC-TEST-WARDEN', '')).mode, 'codex');
  await api.resolve('NPC-TEST-WARDEN', ''); await api.resolve('HANDOUT-TEST-NOTICE', '');
  assert.equal(asked, 1);
  api.invalidateCodex(); await api.resolve('NPC-TEST-WARDEN', ''); assert.equal(asked, 2);
  const failing = runtime(PLAYER, [npc], {codexNames: async () => { throw new Error('no GM'); }});
  assert.deepEqual(await failing.api.resolve('NPC-TEST-WARDEN', 'NPC-TEST-WARDEN'), {mode: 'text', name: 'Person'});
  let gmAsked = 0;
  const gm = runtime(GM, [npc], {codexNames: async () => { gmAsked++; return new Map(); }});
  assert.equal((await gm.api.resolve('NPC-TEST-WARDEN', '')).mode, 'sheet'); assert.equal(gmAsked, 0);
  // The index is rebuilt after invalidate (a document was created or its permission changed).
  const docs = [];
  const live = runtime(GM, docs);
  assert.equal((await live.api.resolve('HANDOUT-TEST-NOTICE', '')).mode, 'text');
  docs.push(JOURNAL); live.api.invalidate();
  assert.equal((await live.api.resolve('HANDOUT-TEST-NOTICE', '')).mode, 'sheet');
});

test('0.68.0: an older import\'s References section becomes a Related list of name-based links (idempotent)', () => {
  const legacy = '<p>Body</p>\n<section class="ag-managed-links" data-ag-managed-links="1"><h4>References</h4><ul>'
    + '<li><span>related:</span> @UUID[Actor.abc]{NPC-TEST-WARDEN}</li>'
    + '<li><span>related:</span> @UUID[JournalEntry.def]{HANDOUT-TEST-NOTICE}</li>'
    + '<li><span>requires_material:</span> @UUID[Item.ghi]{MAT-TEST-ORE}</li></ul></section>';
  const out = convertLegacyBlock(legacy, relationLabel);
  assert.equal(out, '<p>Body</p>\n<section class="ag-managed-links" data-ag-managed-links="1"><h4>Related</h4><ul>'
    + '<li>@AGRef[NPC-TEST-WARDEN]{Person}</li><li>@AGRef[HANDOUT-TEST-NOTICE]{Handout}</li>'
    + '<li>Requires material: @AGRef[MAT-TEST-ORE]{Material}</li></ul></section>');
  assert.equal(convertLegacyBlock(out, relationLabel), out);
  const plain = '<p>@UUID[Actor.abc]{NPC-TEST-WARDEN} outside the section is not ours to change</p>';
  assert.equal(convertLegacyBlock(plain, relationLabel), plain);
  assert.doesNotMatch(out.replace(/@AGRef\[[^\]]*\]/g, ''), ID_TEXT);
});

test('0.68.0: import writes @AGRef for Actors and handout journals, @UUID for everything else; Sync still sees it as unchanged', () => {
  const index = buildUuidIndex([NPC, JOURNAL, doc('Item', 'MAT-TEST-ORE', '[TEST] Ore')].map(d => ({...d, getFlag: (m, k) => d.flags[m]?.[k]})));
  const html = '<p>Ask [[AGREF:NPC-TEST-WARDEN]] about [[AGREF:HANDOUT-TEST-NOTICE|the notice]] and [[AGREF:MAT-TEST-ORE]].</p>';
  const {text, issues} = resolveRichText(html, index);
  assert.deepEqual(issues, []);
  assert.equal(text, '<p>Ask @AGRef[NPC-TEST-WARDEN]{[TEST] Warden Pell}'.replace('{[TEST] Warden Pell}', '{TEST Warden Pell}')
    + ' about @AGRef[HANDOUT-TEST-NOTICE]{the notice} and @UUID[Item.MATTESTORE]{TEST Ore}.</p>');
  assert.equal(markerTextMatches(text, html, new Map([['Item.MATTESTORE', 'MAT-TEST-ORE']])), true);
  assert.equal(markerTextMatches(text.replace('NPC-TEST-WARDEN', 'NPC-TEST-OTHER'), html, new Map([['Item.MATTESTORE', 'MAT-TEST-ORE']])), false);
  // A related-record cell to an NPC is an @AGRef too.
  const cell = resolveRefCells('<td data-ag-ref="related">Warden</td>', [{target_id: 'NPC-TEST-WARDEN', uuid: NPC.uuid, relation: 'related'}],
    {nameOf: () => '[TEST] Warden Pell', canLink: () => true});
  assert.equal(cell, '<td data-ag-ref="related">@AGRef[NPC-TEST-WARDEN]{Warden}</td>');
  assert.equal(resolveRefCells(cell, [{target_id: 'NPC-TEST-WARDEN', uuid: NPC.uuid, relation: 'related'}], {nameOf: () => '', canLink: () => true}), cell);
});
