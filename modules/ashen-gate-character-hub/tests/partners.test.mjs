/** Ashen Gate panels with each partner missing, present or erroring (mocked Foundry; logic only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {PANELS, panelState, partnersTab, openPartner} from '../scripts/partners.mjs';
import {createHubSheetClass} from '../scripts/sheet.mjs';

const calls = [];
function partners() {
  calls.length = 0;
  return {
    'ashen-gate-profession-ledger': {active: true, api: {
      getProfessionProgress: (actor, id) => id === 'PROF-TEST-SMITH' ? {id, xp: 120, level: 2, unspentPerkChoices: 1} : null,
      getKnownRecipes: () => [{id: 'REC-TEST-1'}, {id: 'REC-TEST-2'}],
      open: o => calls.push(['ledger.open', o])}},
    'ashen-gate-skill-trees': {active: true, api: {
      listTrees: () => [{id: 'tree-smith', name: '[TEST] Smithing', provider: {kind: 'profession'}, sourceRef: 'PROF-TEST-SMITH', nodes: [{id: 'n1', name: '[TEST] Hammer Time'}]},
        {id: 'tree-herb', name: '[TEST] Herbalism', provider: {kind: 'profession'}, sourceRef: 'PROF-TEST-HERB', nodes: []},
        {id: 'tree-cinder', name: '[TEST] Cinders', provider: {kind: 'generic'}, nodes: [{id: 'c1', name: '[TEST] Ember'}]}],
      actorProgress: (actor, treeId) => treeId === 'tree-smith' ? {awarded: 0, unlocks: ['n1']} : treeId === 'tree-cinder' ? {awarded: 2, unlocks: ['c1']} : {awarded: 0, unlocks: []},
      open: o => calls.push(['trees.open', o])}},
    'ashen-gate-factions': {active: true, api: {
      getFactions: () => [{id: 'FAC-TEST', name: '[TEST] Lantern Guild', group: {score: 3}, personal: {actor1: {score: -1}}}],
      open: () => calls.push(['factions.open'])}},
    'ashen-gate-quest-manager': {active: true, api: {
      listVisible: () => [
        {id: 'Q-PARTY', name: '[TEST] Party Quest', status: 'Active', scope: 'party', objectives: [{goal: 'Find the mill', complete: false}, {goal: 'Done bit', complete: true}]},
        {id: 'Q-MINE', name: '[TEST] My Quest', status: 'Active', scope: 'individual', actorId: 'actor1', objectives: []},
        {id: 'Q-OTHER', name: '[TEST] Someone Else', status: 'Active', scope: 'individual', actorId: 'actor2', objectives: []},
        {id: 'Q-DONE', name: '[TEST] Finished', status: 'Completed', scope: 'party', objectives: []}],
      tracking: {getState: () => ({ids: ['Q-MINE']})},
      openObjective: id => calls.push(['quest.openObjective', id]), open: () => calls.push(['quest.open'])}},
    'ashen-gate-locations': {active: true, api: {
      listLocations: o => { calls.push(['loc.list', o]); return [{id: 'LOC-TEST-MILL', name: '[TEST] Millbrook', region: '[TEST] Vale'}]; },
      openLocation: ref => calls.push(['loc.openLocation', ref]), open: () => calls.push(['loc.open'])}},
    'ashen-gate-headquarters': {active: true, api: {open: () => calls.push(['hq.open']), getState: () => { throw new Error('GM only'); }}},
    'ashen-gate-utilities': {active: true, api: {purse: {totals: () => ({pp: 0, gp: 42, ep: 0, sp: 5, cp: 0})}, stash: {open: () => calls.push(['stash.open'])}, open: () => calls.push(['util.open'])}}
  };
}
const state = id => panelState(PANELS.find(p => p.id === id), makeActor());

test('every panel shows "not installed" when its module is missing, and the tab still renders', () => {
  installGlobals({modules: {}});
  for (const p of PANELS) assert.equal(panelState(p, makeActor()).state, 'missing', p.id);
  const html = partnersTab({actor: makeActor()});
  assert.equal((html.match(/data-state="missing"/g) ?? []).length, PANELS.length);
  assert.doesNotMatch(html, /data-action="partner-open"/, 'no Open button for a missing module');
});

test('inactive modules count as missing even if an api object lingers', () => {
  installGlobals({modules: {'ashen-gate-factions': {active: false, api: {getFactions: () => [{name: 'x'}]}}}});
  assert.equal(state('ashen-gate-factions').state, 'missing');
});

test('present partners: summaries come only from their public APIs', () => {
  installGlobals({user: users.owner, modules: partners()});
  const ledger = state('ashen-gate-profession-ledger').html;
  assert.match(ledger, /\[TEST\] Smithing.*Level 2.*120 XP.*1 perk to choose/s);
  assert.doesNotMatch(ledger, /Herbalism/, 'professions the character lacks are left out');
  assert.match(ledger, /2 known recipes/);
  const trees = state('ashen-gate-skill-trees').html;
  assert.match(trees, /Smithing.*Hammer Time/s);
  assert.match(trees, /Cinders.*2 points awarded.*Ember/s);
  const fac = state('ashen-gate-factions').html;
  assert.match(fac, /Lantern Guild.*Party \+3.*\[TEST\] Hero -1/s);
  const quests = state('ashen-gate-quest-manager').html;
  assert.match(quests, /\[TEST\] My Quest.*Tracked/s);
  assert.match(quests, /Party Quest[\s\S]*Find the mill/);
  assert.doesNotMatch(quests, /Done bit/, 'completed objectives hidden');
  assert.doesNotMatch(quests, /Someone Else/, 'another character\'s personal quest is left out');
  assert.doesNotMatch(quests, /Finished/, 'completed quests left out');
  assert.match(state('ashen-gate-locations').html, /Millbrook/);
  assert.match(state('ashen-gate-headquarters').html, /Open Headquarters to see details/);
  assert.match(state('ashen-gate-utilities').html, /42 gp, 5 sp/);
});

test('a GM sees only revealed locations in the hub', () => {
  installGlobals({user: users.gm, modules: partners()});
  state('ashen-gate-locations');
  assert.deepEqual(calls.at(-1), ['loc.list', {revealedOnly: true}]);
});

test('an erroring partner shows "unavailable" and never breaks the sheet', async () => {
  const mods = partners();
  mods['ashen-gate-factions'].api.getFactions = () => { throw new Error('Factions & Renown is hidden from players'); };
  mods['ashen-gate-quest-manager'].api.listVisible = () => { throw new TypeError('boom'); };
  installGlobals({user: users.owner, modules: mods});
  const orig = console.warn; console.warn = () => {};
  assert.equal(state('ashen-gate-factions').state, 'error');
  assert.match(state('ashen-gate-factions').html, /Not available to you right now/);
  assert.match(state('ashen-gate-quest-manager').html, /Unavailable right now/);
  assert.doesNotMatch(state('ashen-gate-quest-manager').html, /boom/, 'raw errors stay in the console');
  const Cls = createHubSheetClass(FakeActorSheetV2);
  const sheet = new Cls({document: makeActor()}); sheet.tab = 'ashen-gate';
  const html = await sheet._renderHTML();
  console.warn = orig;
  assert.doesNotMatch(html, /could not be drawn/);
  assert.match(html, /Lantern|Factions &amp; Renown/);
});

test('the Hub never writes to partner modules or the Actor while summarising', () => {
  installGlobals({user: users.owner, modules: partners()});
  const actor = makeActor();
  partnersTab({actor});
  assert.equal(actor.calls.length, 0);
  assert.deepEqual(actor.flags, {}, 'no mirrored progress on the Actor');
  assert.ok(calls.every(c => c[0] === 'loc.list'), 'only read calls were made');
});

test('Open buttons deep-link to the owning module with the character or record', async () => {
  installGlobals({user: users.owner, modules: partners()});
  const actor = makeActor();
  await openPartner(actor, 'ashen-gate-profession-ledger');
  await openPartner(actor, 'ashen-gate-skill-trees');
  await openPartner(actor, 'ashen-gate-quest-manager', 'Q-MINE');
  await openPartner(actor, 'ashen-gate-locations', 'LOC-TEST-MILL');
  await openPartner(actor, 'ashen-gate-utilities');
  assert.deepEqual(calls, [['ledger.open', {actorId: 'actor1', view: 'individual'}], ['trees.open', {actorId: 'actor1'}],
    ['quest.openObjective', 'Q-MINE'], ['loc.openLocation', 'LOC-TEST-MILL'], ['stash.open']]);
  installGlobals({modules: {}});
  assert.equal((await openPartner(actor, 'ashen-gate-factions')).ok, false);
});

/** 0.5.0: partners with the newer read APIs (Ledger 0.18, Skill Trees 0.13, Headquarters 0.9, Utilities 0.11). */
function newerPartners() {
  const mods = partners();
  Object.assign(mods['ashen-gate-profession-ledger'].api, {getProfessions: () => [
    {professionId: 'PROF-TEST-HERB', name: '[TEST] Herbalism', level: 3, xp: 20, xpToNext: 1, maxLevel: 16, tier: 'Apprentice', unspentPerkChoices: 0},
    {professionId: 'PROF-TEST-MINE', name: '[TEST] Mining', level: 16, xp: 465, xpToNext: null, maxLevel: 16, tier: 'Master', unspentPerkChoices: 2}]});
  mods['ashen-gate-skill-trees'].api.pointsSummary = () => [
    {treeId: 'tree-smith', name: '[TEST] Smithing', kind: 'profession', level: 2, earned: 2, spent: 1, available: 1},
    {treeId: 'tree-herb', name: '[TEST] Herbalism', kind: 'profession', level: 3, earned: 3, spent: 0, available: 3},
    {treeId: 'tree-cinder', name: '[TEST] Cinders', kind: 'generic_points', level: null, earned: 2, spent: 1, available: 1}];
  mods['ashen-gate-headquarters'].api.playerView = () => ({active: true, guildhall: {name: '[TEST] Lantern Hall', rank: 2},
    facilities: [{key: 'k1', facilityId: 'FAC-TEST-DESK', name: '[TEST] Desk', stage: 'Basic', room: 'personal', roomOwner: 'Owner', benefits: []},
      {key: 'k2', facilityId: 'FAC-TEST-FORGE', name: '[TEST] Forge', stage: 'Expanded', room: 'shared', roomOwner: null, benefits: []}],
    hirelings: [], hirelingsPublished: false});
  mods['ashen-gate-utilities'].api.stash.listItems = () => Array.from({length: 10}, (_, i) => ({id: `i${i}`, name: `[TEST] Item ${i}`, quantity: i === 0 ? 3 : 1}));
  return mods;
}

test('newer partner APIs are used when present', () => {
  installGlobals({user: users.owner, modules: newerPartners()});
  const ledger = state('ashen-gate-profession-ledger').html;
  assert.match(ledger, /\[TEST\] Herbalism.*Level 3.*20 XP · 1 XP to level 4/s);
  assert.match(ledger, /\[TEST\] Mining.*Level 16.*maximum level.*2 perks to choose/s);
  assert.doesNotMatch(ledger, /Smithing/, 'the Ledger list replaces the Skill Trees lookup');
  assert.match(ledger, /2 known recipes/);
  const trees = state('ashen-gate-skill-trees').html;
  assert.match(trees, /Smithing.*1 point to spend.*1 of 2 spent.*Hammer Time/s);
  assert.match(trees, /Herbalism.*3 points to spend/s, 'a tree with earned points shows even with no perks yet');
  assert.match(trees, /Cinders.*1 point to spend.*1 of 2 spent/s);
  assert.doesNotMatch(trees, /awarded/);
  const hq = state('ashen-gate-headquarters').html;
  assert.match(hq, /Lantern Hall · Rank 2/);
  assert.match(hq, /\[TEST\] Desk.*Personal/s);
  assert.match(hq, /\[TEST\] Forge.*Guildhall.*Expanded/s);
  assert.match(hq, /Hirelings are managed by the GM/);
  const util = state('ashen-gate-utilities').html;
  assert.match(util, /42 gp, 5 sp/);
  assert.match(util, /\[TEST\] Item 0.*×3/s);
  assert.match(util, /\[TEST\] Item 7/);
  assert.doesNotMatch(util, /\[TEST\] Item 8/);
  assert.match(util, /and 2 more/);
});

test('newer APIs: empty, unavailable and refused cases', () => {
  const mods = newerPartners();
  mods['ashen-gate-profession-ledger'].api.getProfessions = () => [];
  mods['ashen-gate-skill-trees'].api.pointsSummary = () => [{treeId: 'tree-smith', kind: 'profession', level: null, earned: null, spent: 1, available: null}];
  mods['ashen-gate-headquarters'].api.playerView = () => ({active: false, guildhall: null, facilities: [], hirelings: [], hirelingsPublished: false});
  mods['ashen-gate-utilities'].api.stash.listItems = () => { throw new Error('The GM has turned the party stash off.'); };
  installGlobals({user: users.owner, modules: mods});
  assert.match(state('ashen-gate-profession-ledger').html, /No professions yet/);
  const trees = state('ashen-gate-skill-trees').html;
  assert.match(trees, /Smithing/);
  assert.doesNotMatch(trees, /to spend/, 'no points badge while the Ledger is unavailable');
  assert.match(state('ashen-gate-headquarters').html, /Guildhall isn't open yet/);
  const util = state('ashen-gate-utilities').html;
  assert.match(util, /42 gp/);
  assert.doesNotMatch(util, /stash is empty|turned the party stash off/, 'a refused stash list is left out quietly');
  mods['ashen-gate-utilities'].api.stash.listItems = () => [];
  assert.match(state('ashen-gate-utilities').html, /The stash is empty/);
  mods['ashen-gate-profession-ledger'].api.getProfessions = () => { throw new Error('Actor access denied'); };
  const orig = console.warn; console.warn = () => {};
  try { assert.match(state('ashen-gate-profession-ledger').html, /Not available to you right now/); } finally { console.warn = orig; }
});
