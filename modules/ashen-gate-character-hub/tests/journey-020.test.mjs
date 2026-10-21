/** 0.20.0 Journey (alpha): idempotent automatic entries, GM notes, hidden entries kept off the player's Actor (mocked Foundry; logic only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import * as j from '../scripts/journey.mjs';
import {createHubSheetClass, ACTIONS, EDITS} from '../scripts/sheet.mjs';
import {MODULE_ID} from '../scripts/constants.mjs';

/** A world with the GM-only store as a fake JournalEntry collection, and active users. */
function world({user = users.gm, gmActive = true, modules = {}, settings = {}} = {}) {
  installGlobals({user, modules, settings});
  const journals = [];
  globalThis.JournalEntry = {create: async data => { const doc = {...data, flags: structuredClone(data.flags), calls: [], async update(diff) { doc.calls.push(diff); for (const [path, v] of Object.entries(diff)) { const ks = path.split('.'); let o = doc; for (const k of ks.slice(0, -1)) o = o[k] ??= {}; o[ks.at(-1)] = v; } return doc; }}; journals.push(doc); return doc; }};
  game.journal = journals;
  game.users = [{...users.gm, active: gmActive}, {...users.owner, active: true}, {...users.observer, active: true}];
  game.users.get = id => game.users.find(u => u.id === id);
  return journals;
}
const hero = (level = 3) => { const a = makeActor(); a.system.details.level = level; return a; };
const visible = actor => actor.flags[MODULE_ID]?.journey?.entries ?? [];

test('level-ups: first sight only remembers the level (no back-fill); later levels get one entry each, never twice', async () => {
  world();
  const actor = hero(3);
  await j.recordLevel(actor);
  assert.deepEqual(visible(actor), []); assert.equal(actor.flags[MODULE_ID].journey.seen.level, 3);
  actor.system.details.level = 5;
  await j.recordLevel(actor);
  assert.deepEqual(visible(actor).map(e => [e.id, e.type, e.text.split(' (')[0]]), [['level-5', 'level', 'Reached level 5'], ['level-4', 'level', 'Reached level 4']]);
  const n = actor.calls.length;
  await j.recordLevel(actor);
  assert.equal(actor.calls.length, n, 're-fire: nothing written');
  actor.flags[MODULE_ID].journey.seen.level = 4;
  await j.appendAuto(actor, j.levelEntries(actor).entries, {level: 5});
  assert.equal(visible(actor).filter(e => e.id === 'level-5').length, 1, 'idempotent by entry id');
});

test('one writer per character: the first active GM, else the first active owner', () => {
  world({user: users.owner, gmActive: true});
  assert.equal(j.isWriterFor(hero()), false);
  world({user: users.owner, gmActive: false});
  assert.equal(j.isWriterFor(hero()), true);
  world({user: users.observer, gmActive: false});
  assert.equal(j.isWriterFor(hero()), false);
});

test('Renown: personal and party ranks and deities from the public API as the player sees them; first look remembers only', async () => {
  const faction = score => ({id: 'FAC-TEST', name: '[TEST] Lantern Guild', personal: {actor1: {score, history: [{id: `RENOWN-EVT-${score}`}]}}, individualTrack: {milestones: [{id: 'M1', name: 'Unproven', threshold: 0}, {id: 'M2', name: 'Trusted', threshold: 10}]},
    group: {score: 0, history: []}, groupTrack: {milestones: [{id: 'G1', name: 'Strangers', threshold: 0}]}});
  let current = faction(5), deity = {id: 'DEITY-TEST', name: '[TEST] Ember Mother', rank: 'Noticed', score: 1};
  const api = {getFactions: () => [current], getPantheon: () => [deity]};
  world({user: users.owner, modules: {'ashen-gate-factions': {active: true, api}}});
  const actor = hero();
  game.actors = [actor];
  await j.recordRenown();
  assert.deepEqual(visible(actor), [], 'first look: nothing recorded');
  current = faction(12); deity = {...deity, rank: 'Favoured', score: 4};
  await j.recordRenown();
  assert.deepEqual(visible(actor).map(e => e.text).sort(), ['Reached Favoured with [TEST] Ember Mother', 'Reached Trusted with [TEST] Lantern Guild']);
  await j.recordRenown();
  assert.equal(visible(actor).length, 2, 'no duplicates on re-fire');
  world({user: users.gm, modules: {'ashen-gate-factions': {active: true, api}}});
  assert.equal(await j.recordRenown(), null, 'the GM can\'t read standings through the public API; players record their own');
});

test('quests: GM API; first look remembers; Completed once per quest, individual to its character, party to player characters', async () => {
  let quests = [{id: 'QUEST-TEST-A', name: '[TEST] Find the Mill', status: 'Active', kind: 'quest'}, {id: 'QUEST-TEST-B', name: '[TEST] My Errand', status: 'Active', kind: 'quest'}];
  const states = {'QUEST-TEST-A': {scope: 'party'}, 'QUEST-TEST-B': {scope: 'individual', actorId: 'actor1'}};
  const api = {listQuests: () => quests, getGMState: id => states[id]};
  world({modules: {'ashen-gate-quest-manager': {active: true, api}}});
  const actor = hero(), other = {...hero(), id: 'actor2', flags: {}, calls: []}; other.update = actor.update.bind(other);
  game.actors = Object.assign([actor], {get: id => id === 'actor1' ? actor : null});
  await j.recordQuests();
  assert.deepEqual(visible(actor), []);
  assert.deepEqual(game.settings.store.journeyQuestSeen, {'QUEST-TEST-A': 'Active', 'QUEST-TEST-B': 'Active'});
  quests = quests.map(q => ({...q, status: 'Completed'}));
  await j.recordQuests();
  assert.deepEqual(visible(actor).map(e => e.id).sort(), ['quest-QUEST-TEST-A', 'quest-QUEST-TEST-B']);
  await j.recordQuests();
  assert.equal(visible(actor).length, 2, 'once only');
  world({user: users.owner, modules: {'ashen-gate-quest-manager': {active: true, api}}});
  assert.equal(await j.recordQuests(), null, 'only the GM client records quests');
});

test('rewards: GM-only entry point for the coming rewards build; idempotent per quest; nothing else records currency', async () => {
  world();
  const actor = hero();
  assert.equal((await j.recordReward(actor, {questId: 'QUEST-TEST-A', questName: '[TEST] Find the Mill', coins: {gp: 50, sp: 0}})).ok, true);
  assert.equal(visible(actor)[0].text, 'Reward for "[TEST] Find the Mill": 50 gp');
  await j.recordReward(actor, {questId: 'QUEST-TEST-A', coins: {gp: 50}});
  assert.equal(visible(actor).length, 1);
  world({user: users.owner});
  assert.equal((await j.recordReward(actor, {questId: 'Q2', coins: {gp: 1}})).ok, false);
});

test('GM notes, edit, hide and show: hidden entries move to the GM-only store and never stay on the player\'s Actor', async () => {
  const journals = world();
  const actor = hero();
  const note = (await j.addManual(actor, {text: '[TEST] Saved the miller', date: '2026-10-23'})).result;
  assert.equal(visible(actor)[0].text, '[TEST] Saved the miller'); assert.equal(visible(actor)[0].date, '2026-10-23');
  assert.equal((await j.addManual(actor, {text: 'x', date: '23/10/2026'})).ok, false, 'dates as YYYY-MM-DD');
  await j.editEntry(actor, note.id, {text: '[TEST] Saved the miller and his cat'});
  assert.equal(visible(actor)[0].text, '[TEST] Saved the miller and his cat');
  await j.setHidden(actor, note.id, true);
  assert.deepEqual(visible(actor), [], 'gone from the Actor the player receives');
  assert.equal(journals.length, 1); assert.deepEqual(journals[0].ownership, {default: 0}, 'GM-only store');
  assert.equal(journals[0].flags[MODULE_ID].journeyHidden.actor1[0].id, note.id);
  assert.deepEqual(j.journeyFor(actor).map(e => [e.id, e.hidden]), [[note.id, true]], 'the GM still sees it');
  const secret = (await j.addManual(actor, {text: '[TEST] GM secret', hidden: true})).result;
  assert.equal(visible(actor).some(e => e.id === secret.id), false, 'added straight to the GM store');
  await j.setHidden(actor, note.id, false);
  assert.deepEqual(visible(actor).map(e => e.id), [note.id]);
  assert.equal((await j.deleteEntry(actor, 'level-4')).ok, false, 'automatic entries are hidden, not deleted');
  await j.deleteEntry(actor, secret.id);
  assert.equal(j.journeyFor(actor).some(e => e.id === secret.id), false);
});

test('permissions in the data layer: players read only their own visible entries and can\'t add, edit, hide or delete', async () => {
  world();
  const actor = hero();
  const shown = (await j.addManual(actor, {text: '[TEST] Shown'})).result;
  await j.addManual(actor, {text: '[TEST] Hidden', hidden: true});
  world({user: users.owner});
  assert.deepEqual(j.journeyFor(actor).map(e => e.text), ['[TEST] Shown'], 'the owner gets visible entries only');
  for (const r of [await j.addManual(actor, {text: 'x'}), await j.editEntry(actor, shown.id, {text: 'y'}), await j.setHidden(actor, shown.id, true), await j.deleteEntry(actor, shown.id)]) assert.equal(r.ok, false);
  world({user: users.observer});
  assert.deepEqual(j.journeyFor(actor), [], 'not your character: nothing');
  assert.equal((await j.appendAuto(actor, [{id: 'level-9', type: 'level', text: 'x'}])).ok, false);
  world({user: users.owner});
  const r = await j.appendAuto(actor, [{id: 'manual-sneaky', type: 'manual', text: 'x'}, {id: 'level-9', type: 'level', text: 'Reached level 9'}]);
  assert.deepEqual(r.result, ['level-9'], 'the recorders only append automatic entries');
});

test('Journey tab: alpha badge; players see their list; the GM gets the picker, add form, hide/show/edit/delete controls', async () => {
  world();
  const actor = hero(), Cls = createHubSheetClass(FakeActorSheetV2);
  game.actors = Object.assign([actor], {get: () => actor});
  await j.addManual(actor, {text: '[TEST] Shown'});
  await j.addManual(actor, {text: '[TEST] Hidden', hidden: true});
  const gmSheet = new Cls({document: actor}); gmSheet.tab = 'journey';
  let html = await gmSheet._renderHTML();
  assert.match(html, /New · alpha/);
  assert.match(html, /data-edit="journey-actor"/); assert.match(html, /data-journey-form="add"/);
  assert.match(html, /\[TEST\] Hidden <span class="ag-badge ag-badge--warn">[\s\S]*Hidden from player/);
  assert.match(html, /data-action="journey-show"/); assert.match(html, /data-action="journey-hide"/); assert.match(html, /data-action="journey-delete"/);
  gmSheet.journeyEdit = visible(actor)[0].id;
  assert.match(await gmSheet._renderHTML(), /data-journey-form="edit"[\s\S]*data-action="journey-cancel"[\s\S]*data-action="journey-save"/, 'Cancel left, Save right');
  world({user: users.owner});
  game.actors = Object.assign([actor], {get: () => actor});
  const mine = new Cls({document: actor}); mine.tab = 'journey';
  html = await mine._renderHTML();
  assert.match(html, /\[TEST\] Shown/); assert.doesNotMatch(html, /\[TEST\] Hidden|journey-add|journey-hide|journey-actor/);
  const r = await ACTIONS['journey-hide'](mine, {dataset: {id: visible(actor)[0].id}});
  assert.equal(r.ok, false, 'refused in the action, not only hidden');
  await EDITS['journey-actor'](mine, {value: 'other'});
  assert.equal(mine.journeyActorId, null, 'players can\'t switch to another character\'s journey');
});

test('order does not depend on the clock: entries made in one batch share a time, so a millisecond tick never reorders them (0.20.1)', async () => {
  world();
  const realNow = Date.now;
  let t = 1_700_000_000_000;
  Date.now = () => (t += 7);   // every call is later, as on a busy machine
  try {
    const actor = hero(3);
    await j.recordLevel(actor);
    actor.system.details.level = 6;
    await j.recordLevel(actor);
    assert.deepEqual(visible(actor).map(e => e.id), ['level-6', 'level-5', 'level-4'], 'highest level first, whatever the clock does');
    assert.equal(new Set(visible(actor).map(e => e.at)).size, 1, 'one time for the batch');
    const {entries} = j.renownEntries(actor, {getFactions: () => []}, {seen: {}});
    assert.deepEqual(entries, []);
  } finally { Date.now = realNow; }
});
