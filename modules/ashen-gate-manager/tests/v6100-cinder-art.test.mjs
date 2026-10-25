// 0.61.0 Items → Assets: Cinder stage art. Synthetic data and a mocked Cinders API: proves the logic and the wiring in the source, not the live Forge UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseCinderStageName, groupCinderFiles, stageThresholds, stageCoverage, cinderChoices, planCinderArt, assignCinder, setCinderChoice,
  setAllCinderChoices, applyCinderArt, cindersApi, cinderConflicts} from '../scripts/cinder-art.js';
import {planAssetLinks} from '../scripts/assets.js';

const GM = {isGM: true}, P = 'https://assets.test/u1/art/';
const f = name => ({name, path: `${P}${name}`});
const docs = [{sourceId: 'MUT-ECHO', name: 'Echo Cinder'}, {sourceId: 'MUT-EMBER', name: 'Ember'}];
const inst = (instanceId, definitionId) => ({instanceId, definitionId});
const CAPS = {canStages: true, canArt: true};
const pool = (stages = {}) => cinderChoices({docs, instances: [inst('i1', 'MUT-ECHO'), inst('i2', 'MUT-EMBER')], stagesOf: id => stages[id] ?? null});
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

test('plan: one row per Cinder, stages in order, reason, old images shown, files removed from record matching', () => {
  const stages = {i1: {own: null, stages: [{art: 'old/1.webp', at: 0}, {art: 'old/2.webp', at: 4}]}};
  const files = [...five('Echo').reverse(), f('Oren_Vale.webp')];
  const {rows, rest} = planCinderArt(files, {user: GM, cinders: pool(stages), caps: CAPS});
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.reason, 'Matched Cinder name and stage number');
  assert.equal(r.cinderName, 'Echo Cinder');
  assert.deepEqual(r.to.map(t => t.stage), [1, 2, 3, 4, 5]);
  assert.deepEqual(r.to.map(t => t.at), [0, 3, 6, 10, 14]);
  assert.deepEqual(r.from.map(t => t.art), ['old/1.webp', 'old/2.webp']);
  assert.equal(r.checked, true);
  assert.deepEqual(rest.map(x => x.name), ['Oren_Vale.webp']);
  // the NPC matcher never sees the Cinder files
  const npc = {uuid: 'Actor.1', documentName: 'Actor', type: 'npc', name: 'Echo Vale', sourceId: 'NPC-ECHO', img: '', tokenImg: '', flags: {}};
  assert.equal(planAssetLinks([npc], rest).rows.every(x => !/Cinder_Stage/.test(x.fileName)), true);
  assert.equal(planAssetLinks([npc], files).rows.some(x => x.candidates.some(c => /Cinder_Stage/.test(c.label))), true); // proves the guard matters
});

test('plan: keeps existing unlocks-needed when the count matches; unchanged art starts on No', () => {
  const own = [{art: 'o/1', at: 0}, {art: 'o/2', at: 2}, {art: 'o/3', at: 9}];
  const {rows} = planCinderArt([1, 2, 3].map(n => f(`Echo_Cinder_Stage_${n}.webp`)), {user: GM, cinders: pool({i1: {own, stages: own}}), caps: CAPS});
  assert.deepEqual(rows[0].to.map(t => t.at), [0, 2, 9]);
  const same = rows[0].to.map((t, i) => ({art: t.art, at: t.at}));
  const again = planCinderArt([1, 2, 3].map(n => f(`Echo_Cinder_Stage_${n}.webp`)), {user: GM, cinders: pool({i1: {own: same, stages: same}}), caps: CAPS}).rows[0];
  assert.equal(again.unchanged, true);
  assert.equal(again.checked, false);
});

test('plan problems: gap, no bound Cinder, no Cinders, single image, non-GM', () => {
  const gap = planCinderArt([f('Echo_Cinder_Stage_1.webp'), f('Echo_Cinder_Stage_2.webp'), f('Echo_Cinder_Stage_4.webp')], {user: GM, cinders: pool(), caps: CAPS}).rows[0];
  assert.match(gap.problem, /Stage 3 is missing/);
  assert.equal(gap.ready, false);
  const none = planCinderArt(five('Frost'), {user: GM, cinders: pool(), caps: CAPS}).rows[0];
  assert.match(none.problem, /No Cinder named Frost/);
  assert.equal(setCinderChoice(none, 'yes'), false);
  const absent = planCinderArt(five('Echo'), {user: GM, cinders: [], caps: null}).rows[0];
  assert.match(absent.problem, /not active/);
  const one = planCinderArt([f('Echo_Cinder_Stage_1.webp')], {user: GM, cinders: pool(), caps: CAPS}).rows[0];
  assert.equal(one.mode, 'art');
  assert.equal(one.ready, true);
  const noArt = planCinderArt([f('Echo_Cinder_Stage_1.webp')], {user: GM, cinders: pool(), caps: {canStages: true, canArt: false}}).rows[0];
  assert.match(noArt.problem, /cannot set a single image/);
  const player = planCinderArt(five('Echo'), {user: {isGM: false}, cinders: pool(), caps: CAPS});
  assert.equal(player.rows.length, 0);
});

test('Different… moves the same files to another Cinder', () => {
  const cinders = pool();
  const row = planCinderArt(five('Echo'), {user: GM, cinders, caps: CAPS}).rows[0];
  assert.ok(assignCinder(row, 'MUT-EMBER', cinders, CAPS));
  assert.equal(row.cinderName, 'Ember');
  assert.equal(row.reason, 'You chose this Cinder');
  assert.equal(assignCinder(row, 'MUT-NOPE', cinders, CAPS), null);
  const second = planCinderArt(five('Ember'), {user: GM, cinders, caps: CAPS}).rows[0];
  assert.equal(cinderConflicts([row, second]).size, 2);
  assert.equal(setAllCinderChoices([row, second], 'no'), 2);
});

const mockApi = (calls, over = {}) => ({canStages: true, canArt: true, canRead: true, cinder: {
  instances: () => [inst('i1', 'MUT-ECHO'), inst('i2', 'MUT-EMBER')],
  stages: () => ({own: null, stages: null}),
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
});

test('apply: setArtStages gets 2–5 {art, at} with stage 1 at 0; single image uses setArt', async () => {
  const calls = [];
  const row = planCinderArt(five('Echo'), {user: GM, cinders: pool(), caps: CAPS}).rows[0];
  const out = await applyCinderArt([row], {user: GM, api: mockApi(calls)});
  assert.equal(out.ok, true);
  assert.deepEqual(calls, [['stages', 'i1', [0, 3, 6, 10, 14].map((at, i) => ({art: `${P}Echo_Cinder_Stage_${i + 1}.webp`, at}))]]);
  const calls2 = [];
  const one = planCinderArt([f('Ember_Cinder_Stage_1.webp')], {user: GM, cinders: pool(), caps: CAPS}).rows[0];
  await applyCinderArt([one], {user: GM, api: mockApi(calls2)});
  assert.deepEqual(calls2, [['art', 'i2', `${P}Ember_Cinder_Stage_1.webp`]]);
});

test('apply: a Cinder no longer bound is skipped; a failing write is reported', async () => {
  const row = planCinderArt(five('Echo'), {user: GM, cinders: pool(), caps: CAPS}).rows[0];
  const gone = await applyCinderArt([row], {user: GM, api: mockApi([], {instances: () => []})});
  assert.equal(gone.skipped.length, 1);
  const bad = await applyCinderArt([row], {user: GM, api: mockApi([], {setArtStages: async () => { throw Error('Unknown Cinder'); }})});
  assert.equal(bad.ok, false); assert.match(bad.message, /Unknown Cinder/);
});

test('cindersApi feature-detects', () => {
  assert.equal(cindersApi({}), null);
  const g = api => ({game: {modules: {get: () => ({active: true, api: {cinder: api}})}}});
  assert.equal(cindersApi(g({})).canStages, false);
  assert.equal(cindersApi(g({instances() {}, setArtStages() {}})).canStages, true);
});

test('source wiring: the drop and scan paths plan Cinder art first, Link writes only through applyCinderArt', () => {
  const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  assert.equal((main.match(/planAssetLinks\(/g) ?? []).length, 1); // only inside #planLinks
  assert.match(main, /planCinderArt\(files/);
  assert.match(main, /applyCinderArt\(cinderRows/);
  assert.doesNotMatch(main, /setArtStages/);
});
