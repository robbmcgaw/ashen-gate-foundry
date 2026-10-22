/**
 * 0.36.0: Profession Ledger 0.29.0's per-profession recipe word (api.recipeLabel, feature-detected) and activity effect notes.
 * Mocked Foundry and partner APIs: proves the markup and data reads, not the live Foundry UI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, makeItem, users} from './foundry-mock.mjs';
import {PANELS, panelState, knownProfessions, recipeLabelOf, recipeCountText} from '../scripts/partners.mjs';
import {professionsBox} from '../scripts/views.mjs';
import {itemRow, effectNoteOf, EFFECT_NOTE_MAX, inventoryData} from '../scripts/items.mjs';
import {cardHtml} from '../scripts/cards.mjs';

const WORDS = {'PROF-TEST-ALCH': ['Formula', 'Formulas'], 'PROF-ARTISTRY': ['Composition', 'Compositions']};
const recipeLabel = (prof, {plural = false, capitalize = true} = {}) => {
  const w = (WORDS[prof] ?? ['Recipe', 'Recipes'])[plural ? 1 : 0];
  return capitalize ? w : w.toLowerCase();
};
const PROFS = [
  {professionId: 'PROF-TEST-ALCH', name: '[TEST] Alchemy', level: 3, xp: 20, xpToNext: 5, tier: 'Apprentice', unspentPerkChoices: 0},
  {professionId: 'PROF-ARTISTRY', name: '[TEST] Artistry', level: 2, xp: 8, xpToNext: 4, tier: 'Apprentice', unspentPerkChoices: 0},
  {professionId: 'PROF-TEST-UNKNOWN', name: '[TEST] Oddcraft', level: 1, xp: 0, xpToNext: 3, tier: 'Apprentice', unspentPerkChoices: 0}];
const KNOWN = ['REC-TEST-A1', 'REC-TEST-A2', 'REC-TEST-A3', 'REC-TEST-ART1', 'REC-TEST-LOST'];
const recDef = (id, prof, extra = {}) => ({flags: {'ashen-gate-manager': {source: {sourceId: id, entityType: 'Recipe', definition: {id, entity_type: 'Recipe', profession_id: prof, ...extra}}}}});
const worldItems = [recDef('REC-TEST-A1', 'PROF-TEST-ALCH'), recDef('REC-TEST-A2', 'PROF-TEST-ALCH'), recDef('REC-TEST-A3', 'PROF-TEST-ALCH'), recDef('REC-TEST-OTHER', 'PROF-TEST-ALCH')];
const ledger = (extra = {}) => ({active: true, api: {getProfessions: () => PROFS, getKnownRecipes: () => KNOWN, getProfessionProgress: () => null, open: () => {}, ...extra}});
const actorWith = () => makeActor({items: [{id: 'i1', name: '[TEST] Ballad', type: 'loot', ...recDef('REC-TEST-ART1', 'PROF-ARTISTRY', {kind: 'activity'})}]});
const setup = (api, user = users.owner) => { installGlobals({user, modules: {'ashen-gate-profession-ledger': api}}); globalThis.game.items = {contents: worldItems}; };
const panel = actor => panelState(PANELS.find(p => p.id === 'ashen-gate-profession-ledger'), actor).html;
const text = html => html.replace(/<[^>]*>/g, ' ').replace(/&#39;/g, "'").replace(/\s+/g, ' ');


test('Professions panel: per-profession count in its own word; the total stays generic', () => {
  setup(ledger({recipeLabel}));
  const words = text(panel(actorWith()));
  assert.match(words, /\[TEST\] Alchemy Level 3 20 XP · 5 XP to level 4 · 3 formulas/);
  assert.match(words, /\[TEST\] Artistry Level 2 8 XP · 4 XP to level 3 · 1 composition\b/, 'singular for one');
  assert.match(words, /\[TEST\] Oddcraft Level 1 0 XP · 3 XP to level 2 · 0 recipes/, 'unknown profession: generic word');
  assert.match(words, /5 known recipes/, 'total over mixed professions is generic (unplaced ids still count here)');
  assert.doesNotMatch(words, /REC-|PROF-|Formulas|known formulas/, 'no raw ids, lower case inside the line');
});

test('Professions panel without recipeLabel: unchanged', () => {
  setup(ledger());
  const words = text(panel(actorWith()));
  assert.match(words, /\[TEST\] Alchemy Level 3 20 XP · 5 XP to level 4 /);
  assert.doesNotMatch(words, /formula|composition|· \d+ recipes/i);
  assert.match(words, /5 known recipes/);
});

test('Professions panel: recipeLabel present but known list refused, no counts and no crash', () => {
  setup(ledger({recipeLabel, getKnownRecipes: () => { throw new Error('denied'); }}));
  const words = text(panel(actorWith()));
  assert.match(words, /\[TEST\] Alchemy Level 3/);
  assert.doesNotMatch(words, /formula|known recipe/i);
});

test('recipeLabelOf: feature-detected, unknown and failing labels', () => {
  assert.equal(recipeLabelOf({}, 'PROF-TEST-ALCH'), null);
  assert.deepEqual(recipeLabelOf({recipeLabel}, 'PROF-TEST-ALCH'), {singular: 'Formula', plural: 'Formulas'});
  assert.deepEqual(recipeLabelOf({recipeLabel}, null), {singular: 'Recipe', plural: 'Recipes'});
  assert.equal(recipeLabelOf({recipeLabel: () => { throw new Error('x'); }}, 'PROF-X'), null);
  assert.equal(recipeCountText(2, {singular: 'Formula', plural: 'Formulas'}), '2 formulas');
  assert.equal(recipeCountText(1, {singular: 'DIY plan', plural: 'DIY plans'}), '1 DIY plan', 'all-caps start kept');
});

test('knownProfessions carries recipeLabel and counts; the Professions box shows no recipe word', () => {
  setup(ledger({recipeLabel}));
  const rows = knownProfessions(actorWith());
  assert.deepEqual(rows.map(r => [r.recipeLabel?.plural, r.recipes, r.recipeCount]),
    [['Formulas', 3, '3 formulas'], ['Compositions', 1, '1 composition'], ['Recipes', 0, '0 recipes']]);
  assert.doesNotMatch(text(professionsBox(actorWith())), /formula|composition|recipe/i);
  setup(ledger());
  assert.deepEqual(knownProfessions(actorWith())[0], {id: 'PROF-TEST-ALCH', name: '[TEST] Alchemy', level: 3, tier: 'Apprentice'}, 'old Ledger: rows unchanged');
});

const recItem = (id, extra, system = {}) => makeItem({id: 'it-' + id, name: '[TEST] Song', type: 'loot', system, ...recDef(id, 'PROF-ARTISTRY', extra)});

test('effect note: activity recipes only, effect_note or effectNote, cut to 400', () => {
  assert.equal(effectNoteOf(recItem('REC-TEST-S', {kind: 'activity', effect_note: '  Inspires   the  crowd. '})), 'Inspires the crowd.');
  assert.equal(effectNoteOf(recItem('REC-TEST-C', {kind: 'activity', effectNote: 'Camel case'})), 'Camel case');
  assert.equal(effectNoteOf(recItem('REC-TEST-K', {kind: 'craft', effect_note: 'No'})), null, 'craft: never');
  assert.equal(effectNoteOf(recItem('REC-TEST-N', {effect_note: 'No'})), null, 'no kind is a craft');
  assert.equal(effectNoteOf(recItem('REC-TEST-E', {kind: 'activity'})), null, 'absent');
  assert.equal(effectNoteOf(recItem('REC-TEST-B', {kind: 'activity', effect_note: '   '})), null, 'blank');
  assert.equal(effectNoteOf(recItem('REC-TEST-T', {kind: 'activity', effect_note: 42})), null, 'not text');
  assert.equal(effectNoteOf(makeItem({id: 'x', name: '[TEST] Sword', type: 'weapon', flags: {'ashen-gate-manager': {source: {sourceId: 'ITEM-TEST', definition: {kind: 'activity', effect_note: 'No'}}}}})), null, 'not a recipe');
  const long = effectNoteOf(recItem('REC-TEST-L', {kind: 'activity', effect_note: 'word '.repeat(200)}));
  assert.equal(long.length, EFFECT_NOTE_MAX);
  assert.ok(long.endsWith('…'));
});

test('effect note in the item row: badge with tooltip, text in the row, escaped', () => {
  installGlobals({user: users.owner});
  const plain = itemRow(recItem('REC-TEST-P', {kind: 'activity', effect_note: 'Allies gain <b>advantage</b> once.'}));
  assert.equal(plain.summary, 'Effect (the GM decides): Allies gain <b>advantage</b> once.');
  const html = cardHtml(plain, []);
  assert.match(html, /class="ag-badge ag-badge--accent agch-effect-badge" data-tooltip="Effect \(the GM decides\): Allies gain &lt;b&gt;advantage&lt;\/b&gt; once\."/);
  assert.match(html, /aria-hidden="true"><\/i> Effect<\/span>/, 'visible text label, icon hidden');
  assert.doesNotMatch(html, /<b>/, 'never HTML from the note');
  assert.doesNotMatch(text(html), /REC-/, 'no raw ids');

  const described = itemRow(recItem('REC-TEST-D', {kind: 'activity', effect_note: 'A boon.'}, {description: {value: '<p>[TEST] A song.</p>'}}));
  assert.equal(described.summary, '[TEST] A song.');
  assert.equal(described.more, true, 'the note is under More');
  assert.match(described.details, /\[TEST\] A song\.\n\nEffect \(the GM decides\): A boon\./);
  assert.match(cardHtml(described, []), /data-action="item-more"/);

  const craft = itemRow(recItem('REC-TEST-K', {kind: 'craft', effect_note: 'No'}));
  assert.equal(craft.effectNote, null);
  assert.doesNotMatch(cardHtml(craft, []), /agch-effect-badge|Effect/);
});

test('effect note shows in the Inventory data the Hub lists', () => {
  installGlobals({user: users.owner});
  const actor = makeActor({items: [{id: 'r1', name: '[TEST] Ballad', type: 'loot', ...recDef('REC-TEST-R', 'PROF-ARTISTRY', {kind: 'activity', effect_note: 'Rallies the party.'})}]});
  const row = inventoryData(actor).groups.flatMap(g => g.items).find(r => r.id === 'r1');
  assert.equal(row.effectNote, 'Rallies the party.');
});
