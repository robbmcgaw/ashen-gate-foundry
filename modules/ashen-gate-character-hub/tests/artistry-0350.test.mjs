/**
 * 0.35.0: Artistry (Profession Ledger 0.28.0, Skill Trees 0.21.0). The Professions box shows a creative profession like
 * the others; a profession with several skill trees is one entry with one shared points line and sub-tabs per tree.
 * Mocked Foundry and partner APIs: proves the markup and data reads, not the live Foundry UI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users} from './foundry-mock.mjs';
import {PANELS, panelState, pickTreeTab, treeTabChoice} from '../scripts/partners.mjs';
import {professionsBox, professionIcon} from '../scripts/views.mjs';
import {ACTIONS} from '../scripts/sheet.mjs';
import {VERSION} from '../scripts/constants.mjs';

const LEDGER = {active: true, api: {getProfessions: () => [
  {professionId: 'PROF-TEST-HERB', name: '[TEST] Herbalism', level: 3, xp: 20, xpToNext: 1, tier: 'Apprentice', unspentPerkChoices: 0},
  {professionId: 'PROF-ARTISTRY', name: '[TEST] Artistry', level: 4, xp: 30, xpToNext: 5, tier: 'Journeyman', unspentPerkChoices: 0}]}};

const node = (id, name, over = {}) => ({id, name, cost: 1, text: '', unlocked: false, available: false, reason: '', ...over});
const NEEDS = 'Needs Calligrapher\'s Supplies or Performance proficiency';
const tree = (id, label, treeSpent, nodes, over = {}) => ({id, name: `[TEST] Artistry: ${label}`, label, profession: true, level: 4, earned: 4, spent: 3,
  available: 1, sourceRef: 'PROF-ARTISTRY', wallet: 'profession:PROF-ARTISTRY', treeSpent, nodes, ...over});
/** Skill Trees 0.21.0 embed.data: Artistry is one shared group of four trees; Cinders is a group of one. */
const GROUPS = () => [
  {key: 'profession:PROF-ARTISTRY', shared: true, name: '[TEST] Artistry', sourceRef: 'PROF-ARTISTRY', kind: 'profession', profession: true,
    level: 4, earned: 4, spent: 3, available: 1, trees: [
      tree('tree-art-lit', 'Literary Arts', 0, [node('l1', '[TEST] Quill', {reason: NEEDS})], {access: NEEDS}),
      tree('tree-art-music', 'Music', 2, [node('m1', '[TEST] Ballad', {unlocked: true}), node('m2', '[TEST] Encore', {unlocked: true}), node('m3', '[TEST] Chorus', {available: true})]),
      tree('tree-art-perf', 'Performance', 1, [node('p1', '[TEST] Bow', {unlocked: true}), node('p2', '[TEST] Spotlight', {reason: 'Needs profession level 5 (now 4)'})]),
      tree('tree-art-vis', 'Visual Arts', 0, [node('v1', '[TEST] Sketch')])]},
  {key: 'tree:tree-cinder', shared: false, name: '[TEST] Cinders', kind: 'generic_points', profession: false, level: null, earned: 2, spent: 1, available: 1,
    trees: [{id: 'tree-cinder', name: '[TEST] Cinders', label: '[TEST] Cinders', profession: false, level: null, earned: 2, spent: 1, available: 1,
      nodes: [node('c1', '[TEST] Ember', {unlocked: true})]}]},
  {key: 'tree:tree-idle', shared: false, name: '[TEST] Idle', kind: 'generic_points', profession: false, level: null, earned: 0, spent: 0, available: 0,
    trees: [{id: 'tree-idle', name: '[TEST] Idle', label: '[TEST] Idle', profession: false, earned: 0, spent: 0, available: 0, nodes: [node('i1', '[TEST] Nothing')]}]}
];
const treesApi = (extra = {}) => ({active: true, api: {listTrees: () => [], actorProgress: () => null, open: () => {}, ...extra}});
const summary = (mods, actor = makeActor()) => { installGlobals({user: users.owner, modules: mods}); return panelState(PANELS.find(p => p.id === 'ashen-gate-skill-trees'), actor); };
const text = html => html.replace(/<[^>]*>/g, ' ').replace(/&#39;/g, "'").replace(/\s+/g, ' ');
const count = (s, re) => (s.match(re) ?? []).length;

test('version is 0.35.0', () => assert.equal(VERSION, '0.35.0'));

test('Professions box: Artistry shows like the others, "Name - Tier - Level n", with its own icon', () => {
  installGlobals({user: users.owner, modules: {'ashen-gate-profession-ledger': LEDGER}});
  const box = professionsBox(makeActor());
  assert.match(box, /fa-leaf agch-profbox__icon[^>]*><\/i><span class="agch-profbox__name">\[TEST\] Herbalism - Apprentice - Level 3</);
  assert.match(box, /fa-palette agch-profbox__icon[^>]*><\/i><span class="agch-profbox__name">\[TEST\] Artistry - Journeyman - Level 4</);
  assert.doesNotMatch(text(box), /PROF-/, 'no raw ids');
  for (const name of ['Painting', 'Music', 'Performance']) assert.equal(professionIcon({name}), 'fa-solid fa-palette');
  assert.equal(professionIcon({name: 'Mining'}), 'fa-solid fa-person-digging', 'existing icons unchanged');
});

test('Skill Trees summary (embed.data): a shared profession is one entry, one points line, sub-tabs per tree', () => {
  treeTabChoice.clear();
  const s = summary({'ashen-gate-skill-trees': treesApi({embed: {data: () => GROUPS()}})});
  assert.equal(s.state, 'ok');
  const html = s.html, words = text(html);
  assert.equal(count(words, /\[TEST\] Artistry/g), 1, 'one Artistry entry');
  assert.equal(count(html, /to spend/g), 2, 'one points badge per wallet: Artistry once, Cinders once');
  assert.match(words, /\[TEST\] Artistry 1 point to spend 3 of 4 points spent · level 4/);
  assert.match(words, /One pool of points shared by 4 trees: Literary Arts 0 · Music 2 · Performance 1 · Visual Arts 0/);
  assert.match(html, /class="ag-tabs ag-tabs--sub agch-sttabs" role="tablist" data-st-choice="actor1\|profession:PROF-ARTISTRY" aria-label="\[TEST\] Artistry trees"/);
  assert.equal(count(html, /role="tab" data-action="st-tree-tab" data-ag-always /g), 4, 'four keyboard tabs (kit sub-tabs)');
  assert.equal(count(html, /role="tabpanel"/g), 4);
  assert.equal(count(html, /role="tabpanel"[^>]*hidden/g), 3, 'one panel shown');
  assert.match(html, /data-tab="tree-art-music" aria-controls="[^"]+" aria-selected="true"/, 'opens on the tree with a perk available now');
  assert.match(words, /2 perks: \[TEST\] Ballad, \[TEST\] Encore · available now: \[TEST\] Chorus/);
  assert.match(words, /Cinders 1 point to spend 1 of 2 points spent 1 perk: \[TEST\] Ember/);
  assert.doesNotMatch(words, /Idle/, 'a tree with nothing yet is left out, as before');
  assert.doesNotMatch(words, /PROF-|tree-art|profession:/, 'no raw ids in the text');
});

test('locked reasons from Skill Trees are shown as given; the Hub adds no gate of its own', () => {
  treeTabChoice.clear();
  const html = summary({'ashen-gate-skill-trees': treesApi({embed: {data: () => GROUPS()}})}).html;
  assert.match(text(html), /\[TEST\] Quill Needs Calligrapher's Supplies or Performance proficiency/);
  assert.match(text(html), /\[TEST\] Spotlight Needs profession level 5 \(now 4\)/);
  assert.match(html, /<details class="agch-stlocked"><summary>Locked \(1\)<\/summary>/);
  assert.match(text(html), /No perks yet Locked \(1\) \[TEST\] Sketch/, 'no "0 perks"');
  assert.match(text(html), /available now: \[TEST\] Chorus/, 'an available perk is listed as available');
  assert.doesNotMatch(html, /<li>\[TEST\] Chorus/, 'and not under Locked');
});

test('the picked tree tab is kept for the next render; clicking a tab shows its panel without a re-render', () => {
  treeTabChoice.clear();
  const panels = new Map(), tabs = [];
  const el = (attrs, extra = {}) => ({attrs, hidden: false, dataset: {}, getAttribute: k => attrs[k] ?? null, setAttribute(k, v) { attrs[k] = v; }, ...extra});
  const list = el({role: 'tablist'}, {querySelectorAll: () => tabs, ownerDocument: {getElementById: id => panels.get(id) ?? null}});
  list.dataset.stChoice = 'actor1|profession:PROF-ARTISTRY';
  for (const id of ['tree-art-music', 'tree-art-perf']) {
    const t = el({role: 'tab', 'aria-controls': `p-${id}`, 'aria-selected': 'false'}, {closest: () => list});
    t.dataset.tab = id; tabs.push(t); panels.set(`p-${id}`, el({}));
  }
  assert.equal(ACTIONS['st-tree-tab']({render: () => assert.fail('no re-render')}, tabs[1]), true);
  assert.equal(tabs[1].attrs['aria-selected'], 'true'); assert.equal(tabs[1].attrs.tabindex, '0');
  assert.equal(tabs[0].attrs['aria-selected'], 'false'); assert.equal(tabs[0].attrs.tabindex, '-1');
  assert.equal(panels.get('p-tree-art-perf').hidden, false); assert.equal(panels.get('p-tree-art-music').hidden, true);
  assert.equal(pickTreeTab({closest: () => null}), false);
  const html = summary({'ashen-gate-skill-trees': treesApi({embed: {data: () => GROUPS()}})}).html;
  assert.match(html, /data-tab="tree-art-perf" aria-controls="[^"]+" aria-selected="true"/, 'the choice survives a re-render');
});

test('older Skill Trees (pointsSummary with a shared wallet, no embed.data): the wallet\'s points show once', () => {
  const nodes = [{id: 'n1', name: '[TEST] Ballad'}];
  const trees = [{id: 'a', name: '[TEST] Music', provider: {kind: 'profession'}, sourceRef: 'PROF-ARTISTRY', nodes},
    {id: 'b', name: '[TEST] Performance', provider: {kind: 'profession'}, sourceRef: 'PROF-ARTISTRY', nodes: []},
    {id: 'c', name: '[TEST] Herbalism', provider: {kind: 'profession'}, sourceRef: 'PROF-TEST-HERB', nodes: []}];
  const shared = {kind: 'profession', level: 4, earned: 4, spent: 1, available: 3, sourceRef: 'PROF-ARTISTRY', wallet: 'profession:PROF-ARTISTRY'};
  const html = summary({'ashen-gate-skill-trees': treesApi({listTrees: () => trees, actorProgress: (a, id) => ({awarded: 0, unlocks: id === 'a' ? ['n1'] : []}),
    pointsSummary: () => [{treeId: 'a', ...shared}, {treeId: 'b', ...shared}, {treeId: 'c', kind: 'profession', level: 2, earned: 2, spent: 0, available: 2}]})}).html;
  assert.equal(count(html, /to spend/g), 2, 'Artistry once, Herbalism once');
  assert.match(text(html), /\[TEST\] Music 3 points to spend 1 of 4 spent/);
  assert.match(text(html), /\[TEST\] Performance Shares points with \[TEST\] Music/);
});

test('without embed.data or wallets the summary is unchanged (single trees each carry their own points)', () => {
  const trees = [{id: 'a', name: '[TEST] Smithing', provider: {kind: 'profession'}, sourceRef: 'PROF-TEST-SMITH', nodes: []},
    {id: 'b', name: '[TEST] Herbalism', provider: {kind: 'profession'}, sourceRef: 'PROF-TEST-HERB', nodes: []}];
  const html = summary({'ashen-gate-skill-trees': treesApi({listTrees: () => trees, actorProgress: () => ({awarded: 0, unlocks: []}),
    pointsSummary: () => [{treeId: 'a', kind: 'profession', level: 2, earned: 2, spent: 1, available: 1}, {treeId: 'b', kind: 'profession', level: 3, earned: 3, spent: 0, available: 3}]})}).html;
  assert.equal(count(html, /to spend/g), 2);
  assert.doesNotMatch(html, /Shares points|role="tablist"/);
});

test('a refusal from embed.data is reported like any partner refusal, never a broken sheet', () => {
  const orig = console.warn; console.warn = () => {};
  try {
    const s = summary({'ashen-gate-skill-trees': treesApi({embed: {data: () => { throw new Error('The GM has hidden Skill Trees.'); }}})});
    assert.equal(s.state, 'error');
    assert.match(s.html, /Not available to you right now|Unavailable right now/);
  } finally { console.warn = orig; }
});
