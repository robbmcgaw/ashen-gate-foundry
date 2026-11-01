/** 0.95.0: Release items in use. Mocked Foundry data only: proves the rules, not the live window, a real Ledger/Cinders world or a player's Skill Trees tab. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LEVEL, BASELINE_FLAG, MODULE_ID} from '../scripts/release.js';
import {gatherInUseFacts, planInUseRelease, applyInUseRelease, tierRank, readTierOrder, powerRequirement, inUseLines, DEFAULT_TIER_ORDER, CHUNK} from '../scripts/in-use-release.js';

const GM = {isGM: true}, PLAYER = {isGM: false};
const sourceOf = d => d.source;
let n = 0;
const item = (id, entityType, def = {}, {own = 0, status = 'approved', visibility = 'player', flags = {}, parent = null, perUser = {}} = {}) =>
  ({documentName: 'Item', id: `doc${++n}`, name: id, parent, ownership: {default: own, ...perUser}, flags, source: {sourceId: id, entityType, status, visibility, definition: {id, ...def}}});
const perk = (id, prof, tier, o) => item(id, 'ProfessionPerk', {profession_id: prof, tier}, o);
const mat = (id, o) => item(id, 'Material', {}, o);
const out = (id, recipe, o) => item(id, 'Item', {created_by_recipe_id: recipe}, o);
const rec = (id, prof, tier, mats, result, o) => item(id, 'Recipe', {profession_id: prof, tier, ingredients: mats.map(m => ({materialId: m, quantity: 1})), result_item_id: result}, o);
const power = (id, req, o) => item(id, 'Power', req === null ? {} : {tier_requirement: req}, o);

const world = () => [
  // Alchemy: Apprentice + Journeyman perks/recipes, an Expert one above the tier
  perk('PERK-A1', 'PROF-ALCH', 'apprentice'), perk('PERK-A2', 'PROF-ALCH', 'journeyman'), perk('PERK-A3', 'PROF-ALCH', 'expert'),
  perk('PERK-DRAFT', 'PROF-ALCH', 'apprentice', {status: 'draft'}), perk('PERK-NOTIER', 'PROF-ALCH', null),
  perk('PERK-GM', 'PROF-ALCH', 'apprentice', {visibility: 'gm'}), perk('PERK-REV', 'PROF-ALCH', 'apprentice', {visibility: 'reveal_gated'}),
  rec('REC-1', 'PROF-ALCH', 'apprentice', ['MAT-1', 'MAT-2'], 'ITEM-1'), rec('REC-2', 'PROF-ALCH', 'expert', ['MAT-3'], 'ITEM-2'),
  rec('REC-3', 'PROF-ALCH', 'journeyman', ['MAT-1', 'MAT-GONE'], null),
  mat('MAT-1'), mat('MAT-2', {own: 2}), mat('MAT-3'), out('ITEM-1', 'REC-1'), out('ITEM-2', 'REC-2'), out('ITEM-3', 'REC-3'),
  // Mining: nobody holds it
  perk('PERK-M1', 'PROF-MINE', 'apprentice'), rec('REC-M', 'PROF-MINE', 'apprentice', ['MAT-M'], null), mat('MAT-M'),
  // Cinder EMBER
  item('MUT-EMBER', 'Mutation', {cinder: {bearer_items: {active: 'POWER-EMBER-SIG', passive: 'POWER-EMBER-PAS'}}}, {own: 0}),
  power('POWER-EMBER-SIG', null), power('POWER-EMBER-PAS', null),
  power('POWER-EMBER-01', 1), power('POWER-EMBER-02', 2), power('POWER-EMBER-03', 3), power('POWER-EMBER-04', 4), power('POWER-EMBER-05', 5), power('POWER-EMBER-06', 6),
  power('POWER-EMBER-01-P', null), power('POWER-EMBER-01-M', null), power('POWER-EMBER-03-P', null),
  // Cinder nobody bears
  power('POWER-ASH-01', 1), power('POWER-ASH-SIG', null),
  // Items on Actors and non-Ashen-Gate items
  perk('PERK-A1', 'PROF-ALCH', 'apprentice', {parent: {id: 'actor'}}),
  {documentName: 'Item', id: 'plain', name: 'Plain', ownership: {default: 0}, flags: {}, source: null}
];
const facts = (over = {}) => ({tierOrder: [...DEFAULT_TIER_ORDER], ledger: {ok: true}, cinders: {ok: true}, trees: {ok: true},
  characters: [{actorId: 'a1', name: 'Quest', professions: [{professionId: 'PROF-ALCH', name: 'Alchemy', tier: 'Journeyman', level: 4}],
    cinders: [{definitionId: 'MUT-EMBER', name: 'Ember', earned: 2, unlocked: ['POWER-EMBER-01'], unlockedEnhancements: [], signature: []}]}], ...over});
const byDoc = (docs, id) => docs.find(d => d.source?.sourceId === id && !d.parent);

test('tiers: order, names, numbers, Ledger order when exposed, tier_requirement', () => {
  assert.equal(tierRank('Apprentice'), 0); assert.equal(tierRank('Journeyman (level 4)'), 1); assert.equal(tierRank('master'), 4);
  assert.equal(tierRank(2), 1); assert.equal(tierRank('3'), 2); assert.equal(tierRank('mystery'), null); assert.equal(tierRank(null), null); assert.equal(tierRank(9), null);
  assert.deepEqual(readTierOrder({tiers: () => ['A', 'B', 'C']}), ['a', 'b', 'c']);
  assert.deepEqual(readTierOrder({tierOrder: () => [{id: 'x'}, {id: 'y'}]}), ['x', 'y']);
  assert.deepEqual(readTierOrder({tiers: () => { throw new Error('no'); }}), [...DEFAULT_TIER_ORDER]);
  assert.deepEqual(readTierOrder({}), [...DEFAULT_TIER_ORDER]);
  assert.equal(tierRank('b', ['a', 'b', 'c']), 1);
  assert.equal(powerRequirement({tier_requirement: 3}), 3); assert.equal(powerRequirement({tier_requirement: 'Tier 4'}), 4);
  assert.equal(powerRequirement({}), null); assert.equal(powerRequirement({tier_requirement: 'high'}), null);
});

test('eligibility and tier ceiling: current tier and below only, approved + player only, nobody-used professions untouched', () => {
  const docs = world();
  const plan = planInUseRelease(docs, sourceOf, facts({cinders: {skipped: 'x'}}), {user: GM});
  const ids = new Set(plan.targets.map(d => d.source.sourceId));
  for (const id of ['PERK-A1', 'PERK-A2', 'REC-1', 'REC-3', 'MAT-1', 'ITEM-1', 'ITEM-3']) assert.ok(ids.has(id), id);
  for (const id of ['PERK-A3', 'REC-2', 'MAT-3', 'ITEM-2']) assert.ok(!ids.has(id), `above the tier: ${id}`);
  for (const id of ['PERK-DRAFT', 'PERK-GM', 'PERK-REV', 'PERK-NOTIER', 'PERK-M1', 'REC-M', 'MAT-M']) assert.ok(!ids.has(id), id);
  assert.ok(!plan.targets.includes(docs.find(d => d.parent)), 'Items on Actors are never touched');
  assert.ok(!plan.targets.some(d => d.id === 'plain'));
  assert.ok(!ids.has('MAT-2'), 'already readable (Observer default) is not a change');
  const reasons = Object.fromEntries(plan.skipped.map(s => [s.key, s.count]));
  assert.deepEqual(reasons, {draft: 1, gm: 2, noTier: 1, missing: 1});
  assert.equal(plan.alreadyVisible, 1);
});

test('per-character grouping, counts only what changes, shared Items counted once', () => {
  const docs = world();
  const f = facts({cinders: {skipped: 'x'}});
  f.characters.push({actorId: 'a2', name: 'Bree', professions: [{professionId: 'PROF-ALCH', name: 'Alchemy', tier: 'Apprentice', level: 1}], cinders: null});
  const plan = planInUseRelease(docs, sourceOf, f, {user: GM});
  assert.equal(plan.groups.length, 1, 'the second character reaches only Items the first already claimed');
  const g = plan.groups[0];
  assert.equal(g.character, 'Quest'); assert.equal(g.label, 'Alchemy (Journeyman)');
  assert.deepEqual(g.counts, {perks: 2, recipes: 2, materials: 1, outputs: 2});
  assert.equal(plan.total, 7); assert.equal(g.total, 7);
  assert.equal(inUseLines(plan)[0], 'Quest — Alchemy (Journeyman): 2 perks, 2 recipes, 1 material, 2 output items');
  // Bree alone at Apprentice
  const solo = planInUseRelease(docs, sourceOf, {...f, characters: [f.characters[1]]}, {user: GM});
  assert.deepEqual(solo.groups[0].counts, {perks: 1, recipes: 1, materials: 1, outputs: 1});
  assert.equal(solo.groups[0].label, 'Alchemy (Apprentice)');
});

test('Cinders: signature, tier_requirement against earned points, enhancements only for unlocked powers, unused Cinder untouched', () => {
  const docs = world();
  const f = facts({ledger: {skipped: 'x'}});
  const plan = planInUseRelease(docs, sourceOf, f, {user: GM});
  const ids = plan.targets.map(d => d.source.sourceId).sort();
  assert.deepEqual(ids, ['POWER-EMBER-01', 'POWER-EMBER-01-M', 'POWER-EMBER-01-P', 'POWER-EMBER-02', 'POWER-EMBER-PAS', 'POWER-EMBER-SIG']);
  assert.deepEqual(plan.groups[0].counts, {signature: 2, powers: 2, enhancements: 2});
  assert.equal(plan.groups[0].label, 'Ember (2 points earned)');
  // earned 4: up to 04; the enhancement of unlocked 03 only once 03 is unlocked
  f.characters[0].cinders[0].earned = 4;
  f.characters[0].cinders[0].unlocked = ['POWER-EMBER-01', 'POWER-EMBER-03'];
  const p2 = planInUseRelease(docs, sourceOf, f, {user: GM});
  assert.deepEqual(p2.targets.map(d => d.source.sourceId).filter(i => /EMBER-0\d/.test(i)).sort(), ['POWER-EMBER-01', 'POWER-EMBER-01-M', 'POWER-EMBER-01-P', 'POWER-EMBER-02', 'POWER-EMBER-03', 'POWER-EMBER-03-P', 'POWER-EMBER-04']);
  // the Cinder nobody bears stays GM-only
  assert.ok(!p2.targets.some(d => /ASH/.test(d.source.sourceId)));
});

test('Cinders: points unreadable gives only unlocked powers and the next one', () => {
  const docs = world();
  const f = facts({ledger: {skipped: 'x'}, trees: {skipped: 'Skill Trees is not active in this world'}});
  f.characters[0].cinders[0].earned = null;
  const plan = planInUseRelease(docs, sourceOf, f, {user: GM});
  assert.deepEqual(plan.targets.map(d => d.source.sourceId).filter(i => /EMBER-0\d$/.test(i)).sort(), ['POWER-EMBER-01', 'POWER-EMBER-02']);
  assert.ok(plan.notes.some(t => /Skill Trees/.test(t) && /next one/.test(t)));
  // a power with no requirement while points are known: only if it is the next
  const d2 = [...world().filter(d => d.source?.sourceId !== 'POWER-EMBER-02'), power('POWER-EMBER-02', null)];
  const f2 = facts({ledger: {skipped: 'x'}}); f2.characters[0].cinders[0].earned = 6; f2.characters[0].cinders[0].unlocked = [];
  const p2 = planInUseRelease(d2, sourceOf, f2, {user: GM});
  const core = p2.targets.map(d => d.source.sourceId).filter(i => /EMBER-0\d$/.test(i)).sort();
  assert.deepEqual(core, ['POWER-EMBER-01', 'POWER-EMBER-02', 'POWER-EMBER-03', 'POWER-EMBER-04', 'POWER-EMBER-05', 'POWER-EMBER-06']);
});

test('absent modules are skipped with a plain note; perks need Skill Trees too', () => {
  const docs = world();
  const none = planInUseRelease(docs, sourceOf, {tierOrder: DEFAULT_TIER_ORDER, ledger: {skipped: 'Profession Ledger is not installed'}, cinders: {skipped: 'Cinders is not active in this world'}, trees: {skipped: 'Skill Trees is not installed'}, characters: facts().characters}, {user: GM});
  assert.equal(none.total, 0); assert.equal(none.notes.length, 2, 'one plain note per skipped part');
  assert.ok(none.notes.every(t => !/undefined/.test(t)));
  const noTrees = planInUseRelease(docs, sourceOf, facts({cinders: {skipped: 'x'}, trees: {skipped: 'Skill Trees is not active in this world'}}), {user: GM});
  assert.equal(noTrees.groups[0].counts.perks, undefined); assert.equal(noTrees.groups[0].counts.recipes, 2);
  const unreadable = planInUseRelease(docs, sourceOf, facts({cinders: {skipped: 'x'}, characters: [{actorId: 'a1', name: 'Quest', professions: null, cinders: null}]}), {user: GM});
  assert.ok(unreadable.notes.some(t => /Quest: professions could not be read/.test(t)));
  const badTier = planInUseRelease(docs, sourceOf, facts({cinders: {skipped: 'x'}, characters: [{actorId: 'a1', name: 'Quest', professions: [{professionId: 'PROF-ALCH', name: 'Alchemy', tier: 'Mystery'}], cinders: []}]}), {user: GM});
  assert.equal(badTier.total, 0); assert.ok(badTier.notes.some(t => /no readable tier/.test(t)));
});

test('raises only, never lowers; hidden-on-purpose and per-user entries left alone; baseline written; idempotent', async () => {
  const docs = world();
  byDoc(docs, 'PERK-A1').ownership.default = 3;
  byDoc(docs, 'PERK-A2').flags = {[MODULE_ID]: {[BASELINE_FLAG]: 2}};
  byDoc(docs, 'REC-1').ownership.u1 = 3;
  byDoc(docs, 'REC-3').flags = {[MODULE_ID]: {lifecycle: {archived: true}}};
  const f = facts({cinders: {skipped: 'x'}});
  const plan = planInUseRelease(docs, sourceOf, f, {user: GM});
  const ids = plan.targets.map(d => d.source.sourceId);
  assert.ok(!ids.includes('PERK-A1') && !ids.includes('PERK-A2') && !ids.includes('REC-3'));
  assert.ok(ids.includes('REC-1'));
  const writes = [];
  const res = await applyInUseRelease(plan, {user: GM, sourceOf, write: async u => { writes.push(...u); for (const x of u) { const d = docs.find(y => y.id === x._id); d.ownership.default = x['ownership.default']; d.flags = {[MODULE_ID]: {[BASELINE_FLAG]: x[`flags.${MODULE_ID}.${BASELINE_FLAG}`]}}; } }, yieldToUI: async () => {}});
  assert.equal(res.changed, plan.total);
  for (const w of writes) { assert.deepEqual(Object.keys(w).sort(), ['_id', 'flags.ashen-gate-manager.ownershipBaseline', 'ownership.default'].sort()); assert.equal(w['ownership.default'], LEVEL.OBSERVER); assert.equal(w[`flags.${MODULE_ID}.${BASELINE_FLAG}`], LEVEL.OBSERVER); }
  assert.equal(byDoc(docs, 'PERK-A1').ownership.default, 3, 'never lowered');
  assert.equal(byDoc(docs, 'REC-1').ownership.u1, 3, 'per-user entry kept');
  // re-run: nothing more
  const again = planInUseRelease(docs, sourceOf, f, {user: GM});
  assert.equal(again.total, 0);
  const res2 = await applyInUseRelease(again, {user: GM, sourceOf, write: async () => assert.fail('no write'), yieldToUI: async () => {}});
  assert.equal(res2.changed, 0); assert.match(res2.message, /^Nothing to change\./);
  // tier-up releases only the new tier
  f.characters[0].professions[0].tier = 'Expert';
  const up = planInUseRelease(docs, sourceOf, f, {user: GM});
  assert.deepEqual(up.targets.map(d => d.source.sourceId).sort(), ['MAT-3', 'PERK-A3', 'REC-2'].concat(['ITEM-2']).sort());
});

test('GM only in plan, apply and fact gathering', async () => {
  assert.throws(() => planInUseRelease(world(), sourceOf, facts(), {user: PLAYER}), /Only a GM/);
  assert.throws(() => planInUseRelease(world(), sourceOf, facts(), {}), /Only a GM/);
  const plan = planInUseRelease(world(), sourceOf, facts(), {user: GM});
  await assert.rejects(applyInUseRelease(plan, {user: PLAYER, sourceOf, write: async () => assert.fail('no write')}), /Only a GM/);
  assert.throws(() => gatherInUseFacts({user: PLAYER, actors: [], modules: new Map()}), /Only a GM/);
});

test('apply: chunked, cancel stops between chunks, changed-since-preview left alone, cancel-before-apply writes nothing', async () => {
  const many = Array.from({length: CHUNK * 2 + 5}, (_, i) => perk(`PERK-B${i}`, 'PROF-ALCH', 'apprentice'));
  const plan = planInUseRelease(many, sourceOf, facts({cinders: {skipped: 'x'}}), {user: GM});
  assert.equal(plan.total, many.length);
  const sizes = [];
  const r = await applyInUseRelease(plan, {user: GM, sourceOf, write: async u => sizes.push(u.length), yieldToUI: async () => {}});
  assert.deepEqual(sizes, [CHUNK, CHUNK, 5]); assert.equal(r.changed, many.length);
  const ctl = new AbortController(), seen = [];
  const r2 = await applyInUseRelease(plan, {user: GM, sourceOf, signal: ctl.signal, write: async u => { seen.push(u.length); ctl.abort(); }, yieldToUI: async () => {}});
  assert.deepEqual(seen, [CHUNK]); assert.equal(r2.cancelled, true); assert.match(r2.message, /^Stopped after 50 of/);
  const pre = planInUseRelease(many, sourceOf, facts({cinders: {skipped: 'x'}}), {user: GM}); // plan only: nothing is written by planning
  assert.ok(many.every(d => d.ownership.default === 0 && d.flags[MODULE_ID] === undefined));
  many[0].ownership.default = 2; // changed after the preview
  const r3 = await applyInUseRelease(pre, {user: GM, sourceOf, write: async () => {}, yieldToUI: async () => {}});
  assert.equal(r3.changedSincePreview, 1); assert.match(r3.message, /1 changed since the preview/);
});

test('gatherInUseFacts: owners only, public apis only, feature-detected', () => {
  const calls = [];
  const actors = [
    {id: 'a', type: 'character', name: 'Quest', ownership: {default: 0, u1: 3}},
    {id: 'b', type: 'character', name: 'GM pc', ownership: {default: 0, gm: 3}},
    {id: 'c', type: 'character', name: 'Nobody', ownership: {default: 3}},
    {id: 'd', type: 'npc', name: 'Npc', ownership: {u1: 3}}
  ];
  const users = new Map([['u1', {isGM: false, name: 'P'}], ['gm', {isGM: true, name: 'G'}]]);
  const game = {user: GM, users, actors: {contents: actors}, modules: new Map([
    ['ashen-gate-profession-ledger', {active: true, api: {tiers: () => ['apprentice', 'journeyman'], getProfessions: a => { calls.push(['prof', a.id]); return [{professionId: 'PROF-X', name: 'X', tier: 'Journeyman', level: 4}]; }}}],
    ['ashen-gate-cinders', {active: true, api: {cinder: {list: a => [{definitionId: 'MUT-E', name: 'E', treeId: 't1', powers: [{powerId: 'POWER-E-01'}], enhancements: [{powerId: 'POWER-E-01-P'}], signature: {active: {powerId: 'S'}, passive: null}}]}}}],
    ['ashen-gate-skill-trees', {active: true, api: {pointsSummary: () => [{treeId: 't1', earned: 3}]}}]
  ])};
  game.modules.get = function (k) { return Map.prototype.get.call(this, k); };
  const f = gatherInUseFacts(game);
  assert.deepEqual(calls, [['prof', 'a']]);
  assert.deepEqual(f.tierOrder, ['apprentice', 'journeyman']);
  assert.equal(f.characters.length, 1);
  assert.deepEqual(f.characters[0].professions, [{professionId: 'PROF-X', name: 'X', tier: 'Journeyman', level: 4}]);
  assert.deepEqual(f.characters[0].cinders, [{definitionId: 'MUT-E', name: 'E', earned: 3, unlocked: ['POWER-E-01'], unlockedEnhancements: ['POWER-E-01-P'], signature: ['S']}]);
  // absent / inactive / old modules
  const g2 = {...game, modules: new Map([['ashen-gate-profession-ledger', {active: false, api: {}}], ['ashen-gate-cinders', {active: true, api: {}}]])};
  const f2 = gatherInUseFacts(g2);
  assert.match(f2.ledger.skipped, /not active/); assert.match(f2.cinders.skipped, /has no cinder\.list/); assert.match(f2.trees.skipped, /not installed/);
  assert.equal(f2.characters[0].professions, null);
  // a failing call gives null for that character only
  const g3 = {...game, modules: new Map([['ashen-gate-profession-ledger', {active: true, api: {getProfessions: () => { throw new Error('denied'); }}}]])};
  assert.equal(gatherInUseFacts(g3).characters[0].professions, null);
});

test('wiring: button, GM check, labelled confirmation, no chat, version and docs', () => {
  const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
  const main = read('../scripts/main.js'), tpl = read('../templates/manager.hbs'), logic = read('../scripts/in-use-release.js');
  assert.match(main, /case "inuse-run"/);
  assert.match(main, /async #inUseReleaseAction/);
  assert.match(main, /Only the GM can change who can read Items\./);
  assert.match(main, /yes:`Release \$\{plan\.total\} item/);
  const action = main.split('async #inUseReleaseAction')[1].split('/** 0.91.0')[0];
  assert.doesNotMatch(action, /ChatMessage/);
  const code = logic.split('// ---------- Facts')[0] + logic.split('// ---------- Plan')[1];
  assert.doesNotMatch(code.replace(/\/\*[\s\S]*?\*\//g, ''), /ChatMessage|ui\.notifications|\bgame\.|globalThis\./, 'planning and writing stay free of Foundry globals; facts take the game as an argument');
  assert.match(tpl, /data-ag-action="inuse-run"[^>]*>[\s\S]*Release items in use…/);
  assert.match(main, /Release items in use \(0\.95\.0\)/);
  const m = JSON.parse(read('../module.json'));
  assert.equal(m.version, '0.96.0'); assert.ok(m.download.endsWith('/ashen-gate-manager-v0.96.0/ashen-gate-manager.zip')); assert.match(m.version, /^0\./);
  assert.match(read('../CHANGELOG.md'), /^## 0\.95\.0 /m);
  assert.match(read('../README.md'), /Release items in use/);
});
