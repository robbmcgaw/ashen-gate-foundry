/** 0.52.0: Browse search finds activity recipes, creative professions and a profession's word for a recipe; smart icons
 *  ignore id-like and short words, map creative words to real core art and fall back to the generic icon when nothing
 *  fits well. Synthetic [TEST] data; mocked Foundry: proves the logic, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createBrowse} from '../scripts/browse.js';
import {compilePackage} from '../scripts/workflows.js';
import {sourceMetadata} from '../scripts/source-projection.mjs';
import {createIconIndex, resolveIcon, recordIconInput, documentIconInput, tokenize, pickRecordIcon, chooseImportIcon,
  existingIconDecision, NO_CONFIDENT_MATCH} from '../scripts/smart-icons.js';
import {ICON_CONCEPTS, SHORT_WORDS} from '../scripts/icon-keywords.js';
import {scanIconDocuments} from '../scripts/icon-improve.js';
import {iconFallback} from '../scripts/import-fidelity.js';
import {CORE_ICONS} from './fixtures/core-icons-fixture.mjs';

const M = 'ashen-gate-manager';
const SAMPLE = JSON.parse(readFileSync(new URL('../samples/AG_Artistry_v0.49.0_Test.json', import.meta.url), 'utf8'));

// ---------- Browse search ----------
/** World Items with the source flag exactly as import writes it (compiled sample, sourceMetadata), not a hand-made one. */
function artistryWorld() {
  const pkg = compilePackage(structuredClone(SAMPLE));
  const base = {status: 'approved', version: '0.1.0', visibility: 'player', scope: 'generic_rules', provenance: {sources: ['[TEST] synthetic']}};
  const extra = [
    {...base, id: 'PROF-TEST-MINSTRELSY', entity_type: 'Profession', name: '[TEST] Minstrelsy', profession_kind: 'creative',
      recipeLabel: '[TEST] Composition', recipeLabelPlural: '[TEST] Compositions', refs: [],
      foundry: {document_type: 'Item', data: {name: '[TEST] Minstrelsy', type: 'feat', system: {description: {value: '<p>[TEST] Synthetic.</p>'}}}}},
    {...base, id: 'REC-TEST-MINSTRELSY-AIR', entity_type: 'Recipe', name: '[TEST] Drinking Air', kind: 'activity', profession_id: 'PROF-TEST-MINSTRELSY',
      tier: 'apprentice', effort: 'short', ingredients: [], refs: [{relation: 'requires_profession', target_id: 'PROF-TEST-MINSTRELSY', mode: 'required'}],
      foundry: {document_type: 'Item', data: {name: 'Recipe: [TEST] Drinking Air', type: 'loot', system: {description: {value: '<p>[TEST] Synthetic.</p>'}}}}},
    {...base, id: 'PROF-TEST-SMITHING', entity_type: 'Profession', name: '[TEST] Smithing', profession_kind: 'crafting', refs: [],
      foundry: {document_type: 'Item', data: {name: '[TEST] Smithing', type: 'feat', system: {description: {value: '<p>[TEST] Synthetic.</p>'}}}}},
    {...base, id: 'REC-TEST-SMITHING-NAIL', entity_type: 'Recipe', name: '[TEST] Iron Nail', kind: 'craft', profession_id: 'PROF-TEST-SMITHING',
      tier: 'apprentice', ingredients: [{material_id: 'MAT-TEST-IRON', quantity: 1}], refs: [{relation: 'requires_profession', target_id: 'PROF-TEST-SMITHING', mode: 'required'}],
      foundry: {document_type: 'Item', data: {name: 'Recipe: [TEST] Iron Nail', type: 'loot', system: {description: {value: '<p>[TEST] Synthetic craft.</p>'}}}}},
  ];
  const items = [...pkg.records, ...extra].map((r, i) => ({documentName: 'Item', id: `i${i}`, uuid: `Item.i${i}`, name: r.foundry.data.name,
    type: r.foundry.data.type, system: r.foundry.data.system ?? {}, folder: null, _stats: {modifiedTime: 0},
    flags: {[M]: {source: sourceMetadata(r, pkg, r.refs)}}, toDragData() { return {}; }}));
  const game = {user: {isGM: true}, items: {contents: items}, actors: {contents: []}, journal: {contents: []},
    modules: {get: () => null, values: () => [].values()}, packs: {contents: []}};
  return createBrowse({game});
}
const ids = (svc, query) => svc.search({query, group: 'none'}).groups.flatMap(g => g.rows.map(r => r.id)).sort();

test('0.52.0: Browse search "activity" lists every activity recipe and no craft recipe', () => {
  const svc = artistryWorld();
  assert.deepEqual(ids(svc, 'activity'), ['REC-TEST-ARTISTRY-BALLAD', 'REC-TEST-ARTISTRY-PORTRAIT', 'REC-TEST-MINSTRELSY-AIR']);
  assert.deepEqual(ids(svc, 'Activity'), ids(svc, 'activity'), 'any case');
  assert.ok(!ids(svc, 'activity').includes('REC-TEST-SMITHING-NAIL'), 'a craft recipe is not an activity');
  assert.ok(ids(svc, 'craft').includes('REC-TEST-SMITHING-NAIL'), '"craft" finds the craft recipe');
  assert.ok(!ids(svc, 'craft').some(id => id.startsWith('REC-TEST-ARTISTRY')), 'and not the activities');
  // Every chip a row shows is searchable: each Activity-chip row is found by "activity".
  const shown = svc.getIndex().filter(e => e.chips.includes('Activity')).map(e => e.id).sort();
  assert.deepEqual(shown, ids(svc, 'activity'));
  assert.deepEqual(ids(svc, 'boon'), ['REC-TEST-ARTISTRY-BALLAD'], 'the effect note is still searchable (0.49.0)');
});

test('0.52.0: Browse search "creative" lists the creative professions, not crafting ones or their recipes', () => {
  const svc = artistryWorld();
  assert.deepEqual(ids(svc, 'creative'), ['PROF-ARTISTRY', 'PROF-TEST-MINSTRELSY']);
  assert.deepEqual(ids(svc, 'crafting'), ['PROF-TEST-SMITHING']);
});

test('0.52.0: a profession\'s word for a recipe finds the profession and its recipes', () => {
  const svc = artistryWorld();
  assert.deepEqual(ids(svc, 'composition'), ['PROF-TEST-MINSTRELSY', 'REC-TEST-MINSTRELSY-AIR']);
  assert.deepEqual(ids(svc, 'compositions'), ['PROF-TEST-MINSTRELSY', 'REC-TEST-MINSTRELSY-AIR']);
  assert.deepEqual(ids(svc, 'piece'), ['PROF-ARTISTRY', 'REC-TEST-ARTISTRY-BALLAD', 'REC-TEST-ARTISTRY-PORTRAIT']);
  // Two words must both match (as before): only the Minstrelsy activity is both.
  assert.deepEqual(ids(svc, 'composition activity'), ['REC-TEST-MINSTRELSY-AIR']);
  assert.deepEqual(ids(svc, 'composition nail'), []);
});

// ---------- Smart icons ----------
const index = createIconIndex(CORE_ICONS);
const CREATIVE = ['music', 'painting', 'sculpture', 'writing', 'theatre', 'scribe', 'scroll', 'book'];
const concept = id => ICON_CONCEPTS.find(c => c.id === id);
const inFolder = (hint, path) => `/${path.slice(0, path.lastIndexOf('/'))}/`.includes(`/${hint}/`);

test('0.52.0: every creative keyword folder (and file-name hint) exists in Foundry core icons', () => {
  for (const id of CREATIVE) {
    const c = concept(id);
    for (const hint of c.folders) assert.ok(CORE_ICONS.some(p => inFolder(hint, p)), `${id}: ${hint} has core art`);
    assert.ok(CORE_ICONS.some(p => c.folders.some(h => inFolder(h, p)) && (c.names ?? []).some(n => p.split('/').pop().split(/[^a-z]+/).includes(n))),
      `${id}: a file-name hint matches a file in its folders`);
  }
  // Every other folder hint is in the core sample too, apart from two the sample cannot confirm (they find nothing if absent).
  const missing = [...new Set(ICON_CONCEPTS.flatMap(c => c.folders))].filter(h => !CORE_ICONS.some(p => inFolder(h, p))).sort();
  assert.deepEqual(missing, ['consumables/herbs', 'consumables/vegetable']);
  assert.ok(!CORE_ICONS.some(p => /^icons\/svg\//.test(p)), 'no placeholder art in the sample');
});

test('0.52.0: words: id-like chunks, digits, [TEST] tags and short words are ignored; whole words only', () => {
  assert.deepEqual(tokenize('LIT-01'), []);
  assert.deepEqual(tokenize('MUS-01'), []);
  assert.deepEqual(tokenize('[TEST] MUS-CORE Lute'), ['lute']);
  assert.deepEqual(tokenize('[TEST] The Iron Caltrops x2'), ['iron', 'caltrops']);
  assert.deepEqual(tokenize('Sword+1'), ['sword']);
  assert.deepEqual(tokenize('[TEST] Lit Wick of Mus'), ['wick']);
  assert.deepEqual(tokenize('Axe, Bow, Orb and Ale'), ['axe', 'bow', 'orb', 'ale']);
  assert.deepEqual(tokenize('Potion-of-Healing'), ['potion', 'healing']);
  for (const w of SHORT_WORDS) assert.ok(w.length < 4 && ICON_CONCEPTS.some(c => c.words.includes(w)), `${w} is a short keyword`);
  // A keyword never matches as the start of a longer word.
  for (const name of ['[TEST] Lutenist', '[TEST] Pipeline', '[TEST] Playwright', '[TEST] Artful Dodger'])
    assert.equal(resolveIcon({seed: name, name, tags: []}, index), null, name);
});

// [name, expected concept or 'fallback', path the pick must match]
const TABLE = [
  // Good matches the live runner saw stay good.
  ['[TEST] Iron Caltrops', 'trap', /^icons\/environment\/traps\//],
  ['[TEST] Healing Draught', 'potion', /^icons\/consumables\/potions\//],
  ['[TEST] Oak Shield', 'shield', /^icons\/equipment\/shield\//],
  ['[TEST] Lute', 'music', /^icons\/tools\/instruments\/lute-/],
  ['[TEST] Longsword', 'sword', /^icons\/weapons\/swords\//],
  ['[TEST] Steel Dagger', 'dagger', /^icons\/weapons\/daggers\//],
  ['[TEST] Battle Axe', 'axe', /^icons\/weapons\/axes\//],
  ['[TEST] Short Bow', 'bow', /^icons\/weapons\/bows\//],
  ['[TEST] Brass Lantern', 'light', /^icons\/sundries\/lights\/lantern-/],
  ['[TEST] Mug of Ale', 'drink', /^icons\/consumables\/drinks\//],
  ['[TEST] Ancient Scroll', 'scroll', /^icons\/sundries\/scrolls\//],
  ['[TEST] Worn Tome', 'book', /^icons\/sundries\/books\//],
  ['[TEST] Scrollwork Box', 'chest', /^icons\/containers\//],
  // Ambiguous: a fitting concept, never a random one.
  ['[TEST] Theatre Mask', 'theatre', /^icons\/(equipment\/head|commodities\/treasure)\/mask-/],
  ['[TEST] Masked Performance', /^(music|theatre)$/, /^icons\/(tools\/instruments|equipment\/head|commodities\/treasure)\//],
  ['[TEST] Artisan Guild', 'trade', /^icons\/skills\/trades\/(smithing|construction|woodcutting|farming)-/],
  // Id-like names get no pick.
  ['LIT-01', 'fallback'], ['MUS-01', 'fallback'], ['MAT-HERB-01', 'fallback'], ['REC-TEST-ARTISTRY-BALLAD', 'fallback'], ['x2', 'fallback'],
  // Tagged or meaningless names get no pick.
  ['[TEST]', 'fallback'], ['[TEST] Zorblat', 'fallback'], ['[TEST] Lit Wick', 'fallback'], ['[TEST] Mus', 'fallback'], ['[TEST] Lutenist', 'fallback'],
  // Creative work.
  ['[TEST] Artistry', 'painting', /^icons\/tools\/hand\/brush-paint-/],
  ['[TEST] Artistry — Profession', 'painting', /^icons\/tools\/hand\/brush-paint-/],
  ['Recipe: [TEST] Quick Portrait', 'painting', /^icons\/tools\/hand\/brush-paint-/],
  ['[TEST] Oil Painting', 'painting', /^icons\/tools\/hand\/brush-paint-/],
  ['[TEST] Canvas Study', 'painting', /^icons\/tools\/hand\/brush-paint-/],
  ['Recipe: [TEST] Tavern Ballad', 'music', /^icons\/tools\/instruments\//],
  ['[TEST] Song of the Sea', 'music', /^icons\/tools\/instruments\//],
  ['[TEST] Lyre', 'music', /^icons\/tools\/instruments\//],
  ['[TEST] Musical Instrument', 'music', /^icons\/tools\/instruments\//],
  ['[TEST] Epic Poem', 'writing', /^icons\/(sundries\/(scrolls|books)|tools\/scribal)\//],
  ['[TEST] Book of Verse', 'writing', /^icons\/(sundries\/(scrolls|books)|tools\/scribal)\//],
  ['[TEST] Literary Salon', 'writing', /^icons\/(sundries\/(scrolls|books)|tools\/scribal)\//],
  ['[TEST] Goose Quill', 'scribe', /^icons\/tools\/scribal\/ink-quill/],
  ['[TEST] Comedy Play', 'theatre', /^icons\/(equipment\/head|commodities\/treasure)\/mask-/],
  ['[TEST] Marble Sculpture', 'sculpture', /^icons\/commodities\/(treasure|stone)\//],
];

test('0.52.0: table of names: good, ambiguous, id-like, tagged and creative', () => {
  assert.ok(TABLE.length >= 30);
  for (const [name, want, path] of TABLE) {
    const out = resolveIcon({seed: `X-${name}`, name, tags: []}, index);
    if (want === 'fallback') { assert.equal(out, null, name); continue; }
    assert.ok(out, name);
    if (want instanceof RegExp) assert.match(out.concept, want, name); else assert.equal(out.concept, want, name);
    assert.match(out.img, path, `${name}: ${out.img}`);
    assert.ok(['high', 'medium'].includes(out.confidence), `${name} is a confident pick`);
  }
});

test('0.52.0: no confident match uses the generic icon and says so; authored icons, the GM\'s choice and re-import rules are unchanged', async () => {
  const rec = (id, name, extra = {}) => ({id, entity_type: 'Recipe', foundry: {document_type: 'Item', data: {name, type: 'loot', ...extra}}});
  const noMatch = rec('REC-TEST-LIT-01', 'LIT-01');
  assert.deepEqual(pickRecordIcon(noMatch, {index}), {img: iconFallback(noMatch), reason: NO_CONFIDENT_MATCH, source: 'fallback'});
  assert.equal(iconFallback(noMatch), 'modules/ashen-gate-manager/assets/icons/recipe.svg', 'the recipe type\'s generic icon');
  assert.deepEqual(pickRecordIcon(noMatch, {index: null}), {img: iconFallback(noMatch), reason: 'fallback', source: 'fallback'}, 'no library: as before');
  // The kind alone (activity) no longer picks the stage.
  assert.equal(pickRecordIcon({...rec('REC-TEST-ZORBLAT', '[TEST] Zorblat'), kind: 'activity'}, {index}).reason, NO_CONFIDENT_MATCH);
  // A set img is always kept, however loose its name.
  assert.equal(pickRecordIcon(rec('REC-TEST-LIT-01', 'LIT-01', {img: 'icons/sundries/lights/candle-lit-angelic.webp'}), {index}), null);
  assert.deepEqual(await chooseImportIcon(rec('REC-TEST-LIT-01', 'LIT-01', {img: 'icons/sundries/lights/candle-lit-angelic.webp'}), {index}),
    {img: 'icons/sundries/lights/candle-lit-angelic.webp', reason: 'authored', source: 'authored'});
  // The GM's per-row Change… choice wins over everything, and Apply writes the preview's pick.
  assert.deepEqual(pickRecordIcon(noMatch, {index, override: 'icons/tools/hand/brush-paint-brown-tan.webp'}),
    {img: 'icons/tools/hand/brush-paint-brown-tan.webp', reason: 'chosen in the preview', source: 'authored'});
  const planned = pickRecordIcon(noMatch, {index});
  assert.deepEqual(await chooseImportIcon(noMatch, {index, planned}), planned);
  // Re-import: an icon the GM set in Foundry is never replaced.
  assert.deepEqual(existingIconDecision({recordImg: '', docImg: 'icons/tools/hand/brush-paint-brown-tan.webp', flags: {}}), {fill: false, why: 'set in Foundry'});
  // Improve icons: a placeholder with no confident match is listed unticked, with that reason.
  const doc = {uuid: 'Item.l', id: 'l', documentName: 'Item', name: 'LIT-01', type: 'loot', img: 'icons/svg/item-bag.svg', flags: {}};
  const [row] = scanIconDocuments([doc], index);
  assert.equal(row.img, null); assert.equal(row.checked, false); assert.equal(row.reason, 'No confident match; use Change…');
  assert.equal(resolveIcon(documentIconInput({...doc, name: '[TEST] Quick Portrait'}), index).concept, 'painting');
  assert.equal(resolveIcon(recordIconInput(rec('REC-TEST-P', 'Recipe: [TEST] Quick Portrait')), index).concept, 'painting');
});
