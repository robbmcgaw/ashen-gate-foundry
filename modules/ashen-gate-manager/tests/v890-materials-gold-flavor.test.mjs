/** 0.89.0: Materials visible to players, and the recipe additional_gp_flavor field. Mocked Foundry data only: proves the rules, not the live UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initialOwnership, releasable, playerVisible, setItemsPolicy, LEVEL, BASELINE_FLAG, MODULE_ID} from '../scripts/release.js';
import {planMaterialVisibility, applyMaterialVisibility, materialDecision, materialSummary} from '../scripts/material-visibility.js';
import {recipeGoldFlavorProblems, goldFlavorText, GOLD_FLAVOR_MAX} from '../scripts/recipe-definitions.js';
import {validatePackage} from '../scripts/core.js';
import {professionFacts} from '../scripts/profession-records.js';

const GM = {isGM: true}, PLAYER = {isGM: false};
const rec = (entity_type, id, over = {}) => ({status: 'approved', visibility: 'player', entity_type, id, ...over});
const src = (entityType, sourceId, over = {}) => ({status: 'approved', visibility: 'player', entityType, sourceId, ...over});
const item = (id, source, {def = 0, own = {}, flags = {}} = {}) => ({documentName: 'Item', id, uuid: `Item.${id}`, name: id, ownership: {default: def, ...own}, flags, source});
const sourceOf = d => d.source;
const rules = record => initialOwnership({status: record.status, visibility: record.visibility, entityType: record.entity_type, sourceId: record.id}, 'Item', LEVEL);

test('create: only an approved, player-visible Material starts Observer, even under the GM-only Items policy', () => {
  setItemsPolicy('gm');
  assert.equal(rules(rec('Material', 'MAT-TEST-ASH')), LEVEL.OBSERVER);
  assert.equal(rules(rec('Material', 'MAT-TEST-ASH', {entity_type: undefined})), LEVEL.OBSERVER, 'a MAT-* id counts');
  assert.equal(rules(rec('Material', 'MAT-TEST-ASH', {status: 'draft'})), LEVEL.NONE);
  assert.equal(rules(rec('Material', 'MAT-TEST-ASH', {status: 'example_only'})), LEVEL.NONE);
  assert.equal(rules(rec('Material', 'MAT-TEST-ASH', {visibility: 'gm'})), LEVEL.NONE);
  assert.equal(rules(rec('Material', 'MAT-TEST-ASH', {visibility: 'reveal_gated'})), LEVEL.NONE);
  assert.equal(rules(rec('Recipe', 'REC-TEST-A')), LEVEL.NONE);
  assert.equal(rules(rec('Item', 'ITEM-TEST-A')), LEVEL.NONE);
  assert.equal(rules(rec('Profession', 'PROF-TEST-A')), LEVEL.NONE);
  assert.equal(initialOwnership({status: 'approved', visibility: 'player', entityType: 'Material', sourceId: 'MAT-X'}, 'RollTable', LEVEL), LEVEL.NONE, 'Tables are never released');
  setItemsPolicy('player');
  assert.equal(rules(rec('Material', 'MAT-TEST-ASH')), LEVEL.OBSERVER);
  assert.equal(rules(rec('Material', 'MAT-TEST-ASH', {visibility: 'gm'})), LEVEL.NONE);
  setItemsPolicy('gm');
});

test('re-import and Sync: only a plain None default is raised, never lowered; per-user entries and other Items are left alone', () => {
  setItemsPolicy('gm');
  const mat = src('Material', 'MAT-TEST-ASH');
  assert.equal(releasable(item('a', mat), mat, LEVEL), true);
  assert.equal(releasable(item('a', mat, {def: 3}), mat, LEVEL), false, 'a higher default is never touched, so never lowered');
  assert.equal(releasable(item('a', mat, {def: 2}), mat, LEVEL), false);
  assert.equal(releasable(item('a', mat, {flags: {[MODULE_ID]: {[BASELINE_FLAG]: 2}}}), mat, LEVEL), false, 'lowered by the GM on purpose');
  assert.equal(releasable(item('a', mat, {flags: {[MODULE_ID]: {lifecycle: {archived: true}}}}), mat, LEVEL), false);
  assert.equal(releasable(item('a', src('Material', 'MAT-X', {status: 'draft'})), src('Material', 'MAT-X', {status: 'draft'}), LEVEL), false);
  assert.equal(releasable(item('a', src('Material', 'MAT-X', {visibility: 'gm'})), src('Material', 'MAT-X', {visibility: 'gm'}), LEVEL), false);
  assert.equal(releasable(item('a', src('Recipe', 'REC-X')), src('Recipe', 'REC-X'), LEVEL), false);
  assert.equal(playerVisible(src('Recipe', 'REC-X'), 'Item'), false);
  setItemsPolicy('gm');
});

const world = () => [
  item('m1', src('Material', 'MAT-TEST-ASH')),
  item('m2', src('Material', 'MAT-TEST-VIAL'), {own: {u1: 3}}),
  item('m3', src('Material', 'MAT-TEST-OLD'), {def: 2}),
  item('m4', src('Material', 'MAT-TEST-TOP'), {def: 3}),
  item('m5', src('Material', 'MAT-TEST-DRAFT', {status: 'draft'})),
  item('m6', src('Material', 'MAT-TEST-GM', {visibility: 'gm'})),
  item('m7', src('Material', 'MAT-TEST-ARCH'), {flags: {[MODULE_ID]: {lifecycle: {archived: true}}}}),
  item('m8', src('Material', 'MAT-TEST-HIDDEN'), {flags: {[MODULE_ID]: {[BASELINE_FLAG]: 2}}}),
  item('r1', src('Recipe', 'REC-TEST-A')),
  item('i1', src('Item', 'ITEM-TEST-A')),
  {documentName: 'JournalEntry', id: 'j1', ownership: {default: 0}, flags: {}, source: src('Material', 'MAT-TEST-J')}
];

test('maintenance: counts, skip reasons, writes only ownership.default plus the baseline flag, idempotent', async () => {
  const docs = world();
  const plan = planMaterialVisibility(docs, sourceOf, {user: GM});
  assert.equal(plan.total, 2);
  assert.equal(plan.alreadyVisible, 2);
  assert.equal(plan.materials, 8, 'recipes, other Items and Journals are not counted');
  assert.deepEqual(plan.skipped.map(s => [s.key, s.count]), [['draft', 1], ['gm', 1], ['archived', 1], ['onPurpose', 1]]);
  assert.equal(plan.skippedTotal, 4);
  assert.match(materialSummary(plan), /^To make visible: 2, already visible: 2, skipped: 4 \(1 not approved/);
  const writes = [];
  const out = await applyMaterialVisibility(plan, {user: GM, sourceOf, write: async u => writes.push(...u), yieldToUI: async () => {}});
  assert.equal(out.changed, 2);
  assert.deepEqual(writes, [
    {_id: 'm1', 'ownership.default': 2, [`flags.${MODULE_ID}.${BASELINE_FLAG}`]: 2},
    {_id: 'm2', 'ownership.default': 2, [`flags.${MODULE_ID}.${BASELINE_FLAG}`]: 2}]);
  for (const w of writes) assert.deepEqual(Object.keys(w).sort(), ['_id', `flags.${MODULE_ID}.${BASELINE_FLAG}`, 'ownership.default'].sort(), 'no per-user ownership path is written');
  // Apply the writes to the stand-ins, then run again: nothing changes.
  for (const w of writes) { const d = docs.find(x => x.id === w._id); d.ownership.default = w['ownership.default']; }
  assert.equal(docs.find(d => d.id === 'm2').ownership.u1, 3, 'a per-user entry is kept');
  const again = planMaterialVisibility(docs, sourceOf, {user: GM});
  assert.equal(again.total, 0); assert.equal(again.alreadyVisible, 4);
  const writes2 = [];
  const out2 = await applyMaterialVisibility(again, {user: GM, sourceOf, write: async u => writes2.push(...u), yieldToUI: async () => {}});
  assert.equal(out2.changed, 0); assert.deepEqual(writes2, []); assert.match(out2.message, /^Nothing to change/);
  // never lowers: nothing in either run wrote a level below Observer.
  assert.ok([...writes, ...writes2].every(w => w['ownership.default'] === 2));
});

test('maintenance: refused for a non-GM (plan and apply), and an Item changed after the preview is skipped', async () => {
  assert.throws(() => planMaterialVisibility(world(), sourceOf, {user: PLAYER}), /Only a GM/);
  assert.throws(() => planMaterialVisibility(world(), sourceOf, {}), /Only a GM/);
  const plan = planMaterialVisibility(world(), sourceOf, {user: GM});
  const writes = [];
  await assert.rejects(applyMaterialVisibility(plan, {user: PLAYER, sourceOf, write: async u => writes.push(...u)}), /Only a GM/);
  await assert.rejects(applyMaterialVisibility(plan, {sourceOf, write: async u => writes.push(...u)}), /Only a GM/);
  assert.deepEqual(writes, []);
  plan.targets[0].ownership.default = 3; // the GM raised it after the preview
  const out = await applyMaterialVisibility(plan, {user: GM, sourceOf, write: async u => writes.push(...u), yieldToUI: async () => {}});
  assert.equal(out.changed, 1); assert.equal(out.changedSincePreview, 1); assert.deepEqual(writes.map(w => w._id), ['m2']);
  assert.equal(materialDecision(item('x', src('Material', 'MAT-X'), {def: 3}), src('Material', 'MAT-X'), LEVEL), 'visible');
});

test('maintenance: large worlds are written in chunks of 50 and Cancel stops between chunks', async () => {
  const docs = Array.from({length: 120}, (_, i) => item(`m${i}`, src('Material', `MAT-TEST-${i}`)));
  const plan = planMaterialVisibility(docs, sourceOf, {user: GM});
  const sizes = [];
  const ctl = new AbortController();
  const out = await applyMaterialVisibility(plan, {user: GM, sourceOf, signal: ctl.signal, write: async u => { sizes.push(u.length); ctl.abort(); }, yieldToUI: async () => {}});
  assert.deepEqual(sizes, [50]); assert.equal(out.cancelled, true); assert.equal(out.changed, 50);
});

// ---- recipe additional_gp_flavor ----
const recipe = over => ({id: 'REC-TEST-SALVE', entity_type: 'Recipe', additional_gp: 75, ...over});
const problems = over => recipeGoldFlavorProblems(recipe(over)).join('\n');

test('gold flavour: accepted for a recipe with additional_gp above 0', () => {
  for (const ok of ['ash and vials', 'a', "smith's tools, oil", 'fine-grade ash', 'x'.repeat(GOLD_FLAVOR_MAX), 'tier 2 reagents'])
    assert.deepEqual(recipeGoldFlavorProblems(recipe({additional_gp_flavor: ok})), [], ok);
  assert.deepEqual(recipeGoldFlavorProblems(recipe({additional_gp: 0.5, additional_gp_flavor: 'ash'})), []);
  assert.equal(goldFlavorText(recipe({additional_gp_flavor: 'ash and vials'})), '75 gp (ash and vials)');
});
test('gold flavour: absent is fine, with or without additional_gp, and other records are not checked', () => {
  assert.deepEqual(recipeGoldFlavorProblems(recipe({})), []);
  assert.deepEqual(recipeGoldFlavorProblems({id: 'REC-TEST-B', entity_type: 'Recipe'}), []);
  assert.deepEqual(recipeGoldFlavorProblems(recipe({additional_gp_flavor: undefined})), []);
  assert.deepEqual(recipeGoldFlavorProblems({id: 'ITEM-TEST-A', entity_type: 'Item', additional_gp_flavor: '<b>x</b>'}), []);
  assert.equal(goldFlavorText(recipe({})), null);
});
test('gold flavour: refused with additional_gp 0, absent, negative or not a number', () => {
  for (const gp of [0, -5, '75', null, NaN]) assert.match(problems({additional_gp: gp, additional_gp_flavor: 'ash'}), /only valid when additional_gp is above 0/, String(gp));
  const noGp = recipe({additional_gp_flavor: 'ash'}); delete noGp.additional_gp;
  assert.match(recipeGoldFlavorProblems(noGp).join(), /only valid when additional_gp is above 0/);
  assert.equal(goldFlavorText(recipe({additional_gp: 0, additional_gp_flavor: 'ash'})), null);
});
test('gold flavour: refused with markup, too long, empty, odd characters, wrong type', () => {
  for (const bad of ['<b>ash</b>', 'ash &amp; vials', '[[AGREF:MAT-X|ash]]', 'ash <3', 'a "quote"', 'ash.', 'ash; vials', 'ash/vials', 'Ash', 'ashÉ', 'cendre é', 'two\nlines', 'tab\tbed', '`code`', '*bold*'])
    assert.match(problems({additional_gp_flavor: bad}), /may only use lower-case letters/, JSON.stringify(bad));
  for (const bad of [' ash', 'ash ', ' '])
    assert.match(problems({additional_gp_flavor: bad}), /may only use lower-case letters/, JSON.stringify(bad));
  assert.match(problems({additional_gp_flavor: 'x'.repeat(GOLD_FLAVOR_MAX + 1)}), /41 characters; the most is 40/);
  assert.match(problems({additional_gp_flavor: ''}), /is empty/);
  for (const bad of [5, null, true, ['ash'], {a: 1}]) assert.match(problems({additional_gp_flavor: bad}), /must be text/, JSON.stringify(bad));
});
test('gold flavour: validatePackage refuses it, accepts it, stores the definition exactly as written, and the preview shows it read-only', () => {
  const fixture = JSON.parse(fs.readFileSync(new URL('../../../test-fixtures/recipe-gold-flavor/AG_Test_Recipe_Gold_Flavor.json', import.meta.url), 'utf8'));
  assert.deepEqual(validatePackage(fixture), []);
  const withFlavor = fixture.records.find(r => r.entity_type === 'Recipe');
  assert.equal(withFlavor.additional_gp_flavor, 'ash and vials');
  assert.deepEqual(professionFacts(withFlavor).fields.find(([k]) => k === 'Additional gold'), ['Additional gold', '75 gp (ash and vials)']);
  const without = {...withFlavor}; delete without.additional_gp_flavor;
  assert.equal(professionFacts(without).fields.find(([k]) => k === 'Additional gold'), undefined);
  const bad = structuredClone(fixture); bad.records.find(r => r.entity_type === 'Recipe').additional_gp = 0;
  assert.ok(validatePackage(bad).some(e => /additional_gp_flavor is only valid when additional_gp is above 0/.test(e)));
  const before = structuredClone(withFlavor);
  validatePackage(fixture);
  assert.deepEqual(withFlavor, before, 'validation never rewrites the record');
});

test('wiring and version', () => {
  const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  assert.match(main, /sourceId:record\.id\},kind/);
  assert.match(main, /case "matvis-run"/);
  assert.match(main, /title:'Make materials visible to players\?'/);
  assert.match(main, /Materials are visible to players \(0\.89\.0\)/);
  const tpl = fs.readFileSync(new URL('../templates/manager.hbs', import.meta.url), 'utf8');
  assert.match(tpl, /Make materials visible to players…/);
  const m = JSON.parse(fs.readFileSync(new URL('../module.json', import.meta.url), 'utf8'));
  assert.equal(m.version, '0.93.0'); assert.ok(m.download.endsWith('/ashen-gate-manager-v0.93.0/ashen-gate-manager.zip')); assert.match(m.version, /^0\./);
  assert.match(fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'), /\n## 0\.90\.0 /);
});
