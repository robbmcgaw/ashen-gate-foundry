// 0.61.0 Items → Assets: Cinder stage art (0.62.0: set on the Cinder definition, no bearer needed; the old bound-Cinder path is the fallback). Synthetic data and a mocked Cinders API: proves the logic and the wiring in the source, not the live Forge UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseCinderStageName, groupCinderFiles, stageThresholds, stageCoverage, cinderChoices, planCinderArt, assignCinder, setCinderChoice,
  setAllCinderChoices, applyCinderArt, cindersApi, cinderCaps, cinderConflicts} from '../scripts/cinder-art.js';
import {planAssetLinks} from '../scripts/assets.js';

const GM = {isGM: true}, P = 'https://assets.test/u1/art/';
const f = name => ({name, path: `${P}${name}`});
const docs = [{sourceId: 'MUT-ECHO', name: 'Echo Cinder'}, {sourceId: 'MUT-EMBER', name: 'Ember'}, {sourceId: 'MUT-FROST', name: 'Frost'}, {sourceId: 'NPC-ECHO', name: 'Echo Vale'}];
const inst = (instanceId, definitionId) => ({instanceId, definitionId});
const CAPS = {canDefinition: true, canStages: true, canArt: true};
const OLD = {canDefinition: false, canStages: true, canArt: true};
// The Cinder definitions in the world; nobody has any of them unless a test says so. `defs` = {MUT-ID: {stages, world, bearers}}.
const pool = (defs = {}, extra = {}) => cinderChoices({docs, definitionOf: id => defs[id] ?? null, ...extra});
// Older Cinders: characters have Echo (i1) and Ember (i2).
const oldPool = (stages = {}) => pool({}, {instances: [inst('i1', 'MUT-ECHO'), inst('i2', 'MUT-EMBER')], stagesOf: id => stages[id] ?? null});
const five = c => [1, 2, 3, 4, 5].map(n => f(`${c}_Cinder_Stage_${n}.webp`));

test('file names: case, separators, stage1, extensions', () => {
  for (const n of ['Echo_Cinder_Stage_1.webp', 'echo-cinder-stage-1.PNG', 'Echo Cinder Stage 1.jpg', 'ECHO_cinder_stage1.webp', 'echo stage 1.jpeg'])
    assert.deepEqual(parseCinderStageName(n), {cinder: 'Echo', stage: 1, valid: true, name: n}, n);
  assert.equal(parseCinderStageName('Veil_Cinder_Stage_5.webp').cinder, 'Veil');
  assert.equal(parseCinderStageName('Echo_Cinder_Stage_7.webp').valid, false);
  for (const n of ['Echo_Cinder.webp', 'Oren_Vale.webp', 'Stage_1.webp', 'Echo_Frost_Stage_1.webp', 'Echo_Cinder_Stage_1.txt', 'Echoes_Stage_1.webp']) assert.equal(parseCinderStageName(n), null, n);
});

test('grouping per Cinder; duplicates keep the preferred extension; out-of-range stages are not used', () => {
  const {groups, rest} = groupCinderFiles([f('Echo_Cinder_Stage_1.png'), f('Echo_Cinder_Stage_1.webp'), f('echo_cinder_stage_2.webp'), f('Echo_Cinder_Stage_9.webp'), f('Gale_Cinder_Stage_1.webp'), f('Oren_Vale.webp')]);
  assert.deepEqual([...groups.keys()], ['Echo', 'Gale']);
  const echo = groups.get('Echo');
  assert.equal(echo.stages.get(1).name, 'Echo_Cinder_Stage_1.webp');
  assert.equal(echo.extras.length, 2);
  assert.deepEqual(rest.map(r => r.name), ['Oren_Vale.webp']);
});

test('thresholds: defaults trimmed, existing kept only for the same count', () => {
  assert.deepEqual(stageThresholds(5), [0, 3, 6, 10, 14]);
  assert.deepEqual(stageThresholds(3), [0, 3, 6]);
  assert.deepEqual(stageThresholds(3, [{art: 'a', at: 0}, {art: 'b', at: 2}, {art: 'c', at: 9}]), [0, 2, 9]);
  assert.deepEqual(stageThresholds(4, [{art: 'a', at: 0}, {art: 'b', at: 2}, {art: 'c', at: 9}]), [0, 3, 6, 10]);
  assert.deepEqual(stageThresholds(2, [{art: 'a', at: 1}, {art: 'b', at: 2}]), [0, 3]); // invalid existing (stage 1 not at 0)
  assert.deepEqual(stageCoverage([1, 2, 4]), {count: 3, top: 4, missing: [3], ok: false});
});

test('plan: set on the Cinder definition with nobody bearing it; stages in order, current image beside the new one, files removed from record matching', () => {
  const defs = {'MUT-ECHO': {stages: [{art: 'old/1.webp', at: 0}, {art: 'old/2.webp', at: 4}], world: null, bearers: 0}};
  const files = [...five('Echo').reverse(), f('Oren_Vale.webp')];
  const {rows, rest} = planCinderArt(files, {user: GM, cinders: pool(defs), caps: CAPS});
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.reason, 'Matched Cinder name and stage number');
  assert.equal(r.cinderName, 'Echo Cinder');
  assert.equal(r.definitionId, 'MUT-ECHO');
  assert.equal(r.mode, 'definition');
  assert.equal(r.problem, '');
  assert.deepEqual(r.instanceIds, []);
  assert.deepEqual(r.to.map(t => t.stage), [1, 2, 3, 4, 5]);
  assert.deepEqual(r.to.map(t => t.at), [0, 3, 6, 10, 14]);
  assert.deepEqual(r.from.map(t => t.art), ['old/1.webp', 'old/2.webp']);
  assert.equal(r.checked, true);
  assert.equal(r.where, 'Set on the Cinder itself, for every bearer');
  assert.doesNotMatch(JSON.stringify([r.problem, r.note, r.where]), /bound/i);
  assert.deepEqual(rest.map(x => x.name), ['Oren_Vale.webp']);
  // the NPC matcher never sees the Cinder files
  const npc = {uuid: 'Actor.1', documentName: 'Actor', type: 'npc', name: 'Echo Vale', sourceId: 'NPC-ECHO', img: '', tokenImg: '', flags: {}};
  assert.equal(planAssetLinks([npc], rest).rows.every(x => !/Cinder_Stage/.test(x.fileName)), true);
  assert.equal(planAssetLinks([npc], files).rows.some(x => x.candidates.some(c => /Cinder_Stage/.test(c.label))), true); // proves the guard matters
});

test('plan: all nine names match their definitions; only MUT-* records count as Cinders', () => {
  const names = ['Ember', 'Frost', 'Gale', 'Echo', 'Lumen', 'Root', 'Stone', 'Tide', 'Veil'];
  const nine = names.map(n => ({sourceId: `MUT-${n.toUpperCase()}`, name: n}));
  const cinders = cinderChoices({docs: [...nine, {sourceId: 'NPC-ECHO', name: 'Echo'}]});
  assert.equal(cinders.length, 9);
  const {rows} = planCinderArt(names.flatMap(n => [f(`${n}_Cinder_Stage_1.webp`), f(`${n}_Cinder_Stage_2.webp`)]), {user: GM, cinders, caps: CAPS});
  assert.deepEqual(rows.map(r => r.cinderName), names);
  assert.ok(rows.every(r => r.ready && r.mode === 'definition' && r.definitionId === `MUT-${r.word.toUpperCase()}`));
});

test('plan: keeps the Cinder\'s own unlocks-needed when the count matches; unchanged art starts on No', () => {
  const own = [{art: 'o/1', at: 0}, {art: 'o/2', at: 2}, {art: 'o/3', at: 9}];
  const three = [1, 2, 3].map(n => f(`Echo_Cinder_Stage_${n}.webp`));
  const {rows} = planCinderArt(three, {user: GM, cinders: pool({'MUT-ECHO': {stages: own, world: own}}), caps: CAPS});
  assert.deepEqual(rows[0].to.map(t => t.at), [0, 2, 9]);
  const same = rows[0].to.map(t => ({art: t.art, at: t.at}));
  const again = planCinderArt(three, {user: GM, cinders: pool({'MUT-ECHO': {stages: same, world: same}}), caps: CAPS}).rows[0];
  assert.equal(again.unchanged, true);
  assert.equal(again.checked, false);
  assert.match(again.note, /already uses these images/);
});

test('plan: characters with stages of their own are named, because those still win', () => {
  const own = [{art: 'o/1', at: 0}, {art: 'o/2', at: 2}];
  const cinders = pool({}, {instances: [inst('i1', 'MUT-ECHO'), inst('i3', 'MUT-ECHO')], stagesOf: id => (id === 'i1' ? {own, stages: own} : {own: null, stages: null})});
  const row = planCinderArt(five('Echo'), {user: GM, cinders, caps: CAPS}).rows[0];
  assert.equal(row.overriddenBy, 1);
  assert.match(row.note, /1 character has stages set on their own Cinder/);
  assert.equal(row.ready, true);
});

test('plan problems: gap, no such Cinder, no Cinders, single image, non-GM', () => {
  const gap = planCinderArt([f('Echo_Cinder_Stage_1.webp'), f('Echo_Cinder_Stage_2.webp'), f('Echo_Cinder_Stage_4.webp')], {user: GM, cinders: pool(), caps: CAPS}).rows[0];
  assert.match(gap.problem, /Stage 3 is missing/);
  assert.equal(gap.ready, false);
  const none = planCinderArt(five('Gale'), {user: GM, cinders: pool(), caps: CAPS}).rows[0];
  assert.match(none.problem, /No Cinder named Gale is in this world/);
  assert.doesNotMatch(none.problem, /bound/i);
  assert.equal(setCinderChoice(none, 'yes'), false);
  const absent = planCinderArt(five('Echo'), {user: GM, cinders: [], caps: null}).rows[0];
  assert.match(absent.problem, /not active/);
  const one = planCinderArt([f('Echo_Cinder_Stage_1.webp')], {user: GM, cinders: pool(), caps: CAPS}).rows[0];
  assert.match(one.problem, /needs 2 to 5 stages/);
  assert.equal(one.ready, false);
  const player = planCinderArt(five('Echo'), {user: {isGM: false}, cinders: pool(), caps: CAPS});
  assert.equal(player.rows.length, 0);
  assert.equal(player.rest.length, 5);
});

test('Different… moves the same files to another Cinder', () => {
  const cinders = pool();
  const row = planCinderArt(five('Echo'), {user: GM, cinders, caps: CAPS}).rows[0];
  assert.ok(assignCinder(row, 'MUT-EMBER', cinders, CAPS));
  assert.equal(row.cinderName, 'Ember');
  assert.equal(row.definitionId, 'MUT-EMBER');
  assert.equal(row.reason, 'You chose this Cinder');
  assert.equal(assignCinder(row, 'MUT-NOPE', cinders, CAPS), null);
  const second = planCinderArt(five('Ember'), {user: GM, cinders, caps: CAPS}).rows[0];
  assert.equal(cinderConflicts([row, second]).size, 2);
  assert.equal(setAllCinderChoices([row, second], 'no'), 2);
  assert.equal(setCinderChoice(row, 'yes'), true);
});

const mockApi = (calls, over = {}) => ({canDefinition: true, canStages: true, canArt: true, canRead: true, cinder: {
  instances: () => [inst('i1', 'MUT-ECHO'), inst('i2', 'MUT-EMBER')],
  stages: () => ({own: null, stages: null}),
  getDefinitionArtStages: () => ({world: null, stages: null}),
  setDefinitionArtStages: async (id, list) => { calls.push(['definition', id, list]); },
  setArtStages: async (id, list) => { calls.push(['stages', id, list]); },
  setArt: async (id, path) => { calls.push(['art', id, path]); }, ...over}});

test('apply: GM only, API feature-detected, nothing written otherwise', async () => {
  const row = planCinderArt(five('Echo'), {user: GM, cinders: pool(), caps: CAPS}).rows[0];
  const calls = [];
  const denied = await applyCinderArt([row], {user: {isGM: false}, api: mockApi(calls)});
  assert.equal(denied.ok, false); assert.equal(calls.length, 0);
  const missing = await applyCinderArt([row], {user: GM, api: null});
  assert.equal(missing.ok, false); assert.match(missing.message, /not active/); assert.equal(calls.length, 0);
  const untouched = await applyCinderArt([{...row, checked: false}], {user: GM, api: mockApi(calls)});
  assert.equal(calls.length, 0); assert.equal(untouched.applied.length, 0);
  const lost = await applyCinderArt([row], {user: GM, api: {...mockApi(calls), canDefinition: false}});
  assert.equal(calls.length, 0); assert.equal(lost.skipped.length, 1);
});

test('apply: one setDefinitionArtStages call per Cinder with the permanent id, 2–5 {art, at}, stage 1 at 0, no instances needed', async () => {
  const calls = [];
  const row = planCinderArt(five('Echo'), {user: GM, cinders: pool(), caps: CAPS}).rows[0];
  const out = await applyCinderArt([row], {user: GM, api: mockApi(calls, {instances: () => []})});
  assert.equal(out.ok, true);
  assert.deepEqual(out.applied, [{name: 'Echo Cinder', count: 1}]);
  assert.deepEqual(calls, [['definition', 'MUT-ECHO', [0, 3, 6, 10, 14].map((at, i) => ({art: `${P}Echo_Cinder_Stage_${i + 1}.webp`, at}))]]);
});

test('apply: the Cinder\'s own numbers are re-read at write time; a failing write is reported; stages of their own are mentioned', async () => {
  const own = [{art: 'o/1', at: 0}, {art: 'o/2', at: 2}, {art: 'o/3', at: 9}];
  const three = [1, 2, 3].map(n => f(`Echo_Cinder_Stage_${n}.webp`));
  const calls = [];
  const cinders = pool({}, {instances: [inst('i1', 'MUT-ECHO')], stagesOf: () => ({own, stages: own})});
  const row = planCinderArt(three, {user: GM, cinders, caps: CAPS}).rows[0];
  const out = await applyCinderArt([row], {user: GM, api: mockApi(calls, {getDefinitionArtStages: () => ({world: own, stages: own})})});
  assert.deepEqual(calls[0][2].map(s => s.at), [0, 2, 9]);
  assert.match(out.message, /1 character\(s\) have stages of their own/);
  const bad = await applyCinderArt([row], {user: GM, api: mockApi([], {setDefinitionArtStages: async () => { throw Error('Unknown Cinder'); }})});
  assert.equal(bad.ok, false); assert.match(bad.message, /Unknown Cinder/);
});

test('fallback: an older Cinders (no definition call) still sets the Cinders characters have; nobody has it = a clear problem', async () => {
  const calls = [];
  const row = planCinderArt(five('Echo'), {user: GM, cinders: oldPool(), caps: OLD}).rows[0];
  assert.equal(row.mode, 'stages');
  assert.deepEqual(row.instanceIds, ['i1']);
  const out = await applyCinderArt([row], {user: GM, api: mockApi(calls, {})});
  assert.equal(out.ok, true);
  assert.deepEqual(calls, [['stages', 'i1', [0, 3, 6, 10, 14].map((at, i) => ({art: `${P}Echo_Cinder_Stage_${i + 1}.webp`, at}))]]);
  const calls2 = [];
  const one = planCinderArt([f('Ember_Cinder_Stage_1.webp')], {user: GM, cinders: oldPool(), caps: OLD}).rows[0];
  assert.equal(one.mode, 'art');
  await applyCinderArt([one], {user: GM, api: mockApi(calls2)});
  assert.deepEqual(calls2, [['art', 'i2', `${P}Ember_Cinder_Stage_1.webp`]]);
  const nobody = planCinderArt(five('Frost'), {user: GM, cinders: oldPool(), caps: OLD}).rows[0];
  assert.match(nobody.problem, /Update Cinders to set it on the Cinder itself/);
  assert.equal(nobody.ready, false);
  const gone = await applyCinderArt([row], {user: GM, api: mockApi([], {instances: () => []})});
  assert.equal(gone.skipped.length, 1);
});

test('cindersApi feature-detects', () => {
  assert.equal(cindersApi({}), null);
  const g = api => ({game: {modules: {get: () => ({active: true, api: {cinder: api}})}}});
  assert.equal(cindersApi(g({})).canStages, false);
  assert.equal(cindersApi(g({})).canDefinition, false);
  assert.equal(cindersApi(g({instances() {}, setArtStages() {}})).canStages, true);
  assert.equal(cindersApi(g({setDefinitionArtStages() {}})).canDefinition, false, 'needs the read call too');
  assert.equal(cindersApi(g({setDefinitionArtStages() {}, getDefinitionArtStages() {}})).canDefinition, true);
  assert.equal(cinderCaps(null), null);
  assert.deepEqual(cinderCaps(cindersApi(g({setDefinitionArtStages() {}, getDefinitionArtStages() {}}))), {canDefinition: true, canStages: false, canArt: false});
});

test('source wiring: the drop and scan paths plan Cinder art first, Link writes only through applyCinderArt', () => {
  const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  assert.equal((main.match(/planAssetLinks\(/g) ?? []).length, 1); // only inside #planLinks
  assert.match(main, /planCinderArt\(files/);
  assert.match(main, /applyCinderArt\(cinderRows/);
  assert.doesNotMatch(main, /setArtStages|setDefinitionArtStages/);
  assert.match(main, /definitionOf:api\.canDefinition/);
  const tpl = fs.readFileSync(new URL('../templates/manager.hbs', import.meta.url), 'utf8');
  assert.doesNotMatch(tpl.slice(tpl.indexOf('Cinder art stages'), tpl.indexOf('assets.linkOverflow')), /[Bb]ound/);
});
