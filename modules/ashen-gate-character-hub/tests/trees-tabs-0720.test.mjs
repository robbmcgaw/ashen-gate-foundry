/**
 * 0.72.0: Skill Trees tab shell (Professions | Cinders), where Open Skill Trees goes, locked wording, Visual Arts sub-tab,
 * folding, tree visibility (feature-detected), the Features "Professions" header and table descriptions.
 * Mocked Foundry and stand-in partner APIs with synthetic data: this proves logic and markup, not the live Foundry UI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {PANELS, panelState, pickTreeTab, treeTabChoice, ashenGateTab} from '../scripts/partners.mjs';
import {createHubSheetClass, ACTIONS} from '../scripts/sheet.mjs';
import {openSkillTree} from '../scripts/cinders.mjs';
import {lockedNeed, treeVisibility, applyVisibility, cinderTreeSummary, cindersTabHtml} from '../scripts/tree-tabs.mjs';
import {plainText, summaryOf} from '../scripts/cards.mjs';

const node = (id, name, over = {}) => ({id, name, cost: 1, text: '', unlocked: false, available: false, reason: '', ...over});
const tree = (id, label, nodes, over = {}) => ({id, name: `[TEST] Artistry: ${label}`, label, profession: true, level: 4, earned: 4, spent: 3, available: 1,
  sourceRef: 'PROF-TEST-ART', wallet: 'profession:PROF-TEST-ART', treeSpent: 0, nodes, ...over});
const GROUPS = () => [
  {key: 'profession:PROF-TEST-ART', shared: true, name: '[TEST] Artistry', kind: 'profession', profession: true, level: 4, earned: 4, spent: 3, available: 1, trees: [
    tree('t-lit', 'Literary Arts', [node('l1', '[TEST] Scribe', {available: true}), node('l2', '[TEST] Phrasebook', {available: true})]),
    tree('t-vis', 'Visual Arts', [node('v1', '[TEST] Waymarks', {available: true}), node('v2', '[TEST] Pigments', {reason: 'Prerequisite required', requiresAll: ['v1']})])]},
  {key: 'profession:PROF-TEST-INS', shared: false, name: '[TEST] Inscription', kind: 'profession', profession: true, level: 2, earned: 2, spent: 1, available: 1, trees: [
    {id: 't-ins', name: '[TEST] Inscription', label: '[TEST] Inscription', profession: true, level: 2, earned: 2, spent: 1, available: 1, nodes: [node('i1', '[TEST] Rune', {unlocked: true})]}]},
  {key: 'tree:t-cinder', shared: false, name: '[TEST] Ember Tree', kind: 'cinder_milestone', profession: false, earned: 3, spent: 1, available: 2, trees: [
    {id: 't-cinder', name: '[TEST] Ember Tree', label: '[TEST] Ember Tree', profession: false, earned: 3, spent: 1, available: 2, nodes: [node('c1', '[TEST] Spark', {unlocked: true}), node('c2', '[TEST] Flare')]}]}];
const treesMod = (extra = {}, calls = []) => ({active: true, api: {listTrees: () => [], actorProgress: () => null, open: async o => { calls.push(o); return true; }, ...extra}});
const cindersMod = (list = [{instanceId: 'cinst_1', name: '[TEST] Ember', treeId: 't-cinder', powers: []}]) => ({active: true, api: {
  strain: {contract: 'ag-strain/1', get: () => ({value: 0, guaranteeAt: 10, band: {label: 'Calm'}, chance: 0})},
  cinder: {contract: 'ag-cinder/1', list: () => list}}});
const Sheet = () => createHubSheetClass(FakeActorSheetV2);
const text = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const treesHtml = (mods, actor = makeActor(), user = users.owner) => {
  installGlobals({user, modules: mods});
  const sheet = new (Sheet())({document: actor}); sheet.agTab = 'ashen-gate-skill-trees';
  return ashenGateTab({actor, sheet});
};

test('item 1: Open Skill Trees asks for the right tab; an older Skill Trees still gets today\'s call', async () => {
  const calls = [];
  installGlobals({user: users.owner, modules: {'ashen-gate-skill-trees': treesMod({}, calls), 'ashen-gate-cinders': cindersMod()}});
  const actor = makeActor(), sheet = new (Sheet())({document: actor});
  assert.equal((await ACTIONS['cinder-tree'](sheet, {dataset: {tree: 't-cinder'}})).ok, true);
  assert.equal((await ACTIONS['cinder-tree'](sheet, {dataset: {}})).ok, true);
  assert.equal((await ACTIONS['trees-open'](sheet, {dataset: {tab: 'professions'}})).ok, true);
  await PANELS.find(p => p.id === 'ashen-gate-skill-trees').open(treesMod({}, calls).api, actor);
  assert.deepEqual(calls, [{actorId: 'actor1', treeId: 't-cinder', tab: 'cinders'}, {actorId: 'actor1', tab: 'cinders'}, {actorId: 'actor1', tab: 'professions'}, {actorId: 'actor1', tab: 'professions'}]);
  // A Skill Trees that throws on the new field is asked again the old way.
  const seen = [];
  installGlobals({user: users.owner, modules: {'ashen-gate-skill-trees': treesMod({open: async o => { seen.push(o); if (o.tab) throw new Error('Unknown tab'); return true; }})}});
  assert.equal((await openSkillTree(actor, 't-x', {tab: 'cinders'})).ok, true);
  assert.deepEqual(seen, [{actorId: 'actor1', treeId: 't-x', tab: 'cinders'}, {actorId: 'actor1', treeId: 't-x'}]);
  assert.equal((await openSkillTree(actor, null)).ok, true);
  assert.deepEqual(seen.at(-1), {actorId: 'actor1'});
});

test('items 2 and 4: each sub-tab shows its own perks, found inside its own block even when the ids appear twice; every block folds', () => {
  treeTabChoice.clear();
  const html = treesHtml({'ashen-gate-skill-trees': treesMod({embed: {data: GROUPS}})}).replace(/\n/g, ' ');
  // Panel ids match the tab that controls them, one panel per tree, the Visual Arts panel holds only Visual Arts perks.
  const vis = html.match(/<div id="([^"]+)" role="tabpanel"[^>]*>(?:(?!<div id=)[\s\S])*?Waymarks[\s\S]*?<\/div>/)[0];
  assert.doesNotMatch(vis, /Scribe|Phrasebook/);
  assert.match(html, /data-tab="t-vis" aria-controls="([^"]+)"/);
  // Fold: both shared and single blocks have a section toggle with their own key, per character.
  const toggles = [...html.matchAll(/data-action="section-toggle" data-key="([^"]+)"/g)].map(m => m[1]);
  assert.equal(toggles.filter(k => k.startsWith('sttree:actor1:')).length, 3, 'Artistry, Inscription and the Ember tree each fold');
  assert.ok(toggles.some(k => k.includes('PROFTESTART')) || toggles.some(k => k.includes('profession')), 'the shared profession has its own key');
  // Two copies of the Hub (same ids): clicking a tab in copy B flips copy B's panels, not copy A's.
  const mkPanel = id => ({id, hidden: true, role: 'tabpanel'});
  const copyA = {lit: mkPanel('p-lit'), vis: mkPanel('p-vis')}, copyB = {lit: mkPanel('p-lit'), vis: mkPanel('p-vis')};
  const doc = {getElementById: id => copyA.lit.id === id ? copyA.lit : copyA.vis};   // document-wide lookup finds copy A first
  const mkTab = (ctl, controls) => { const a = {role: 'tab', 'aria-controls': controls, 'aria-selected': 'false'}; return {dataset: {tab: controls}, getAttribute: k => a[k] ?? null, setAttribute(k, v) { a[k] = v; }, closest: () => list}; };
  const tabs = [mkTab(0, 'p-lit'), mkTab(1, 'p-vis')];
  const list = {ownerDocument: doc, dataset: {stChoice: 'actor1|k'}, querySelectorAll: () => tabs, parentElement: {querySelectorAll: () => [copyB.lit, copyB.vis]}};
  assert.equal(pickTreeTab(tabs[1]), true);
  assert.deepEqual([copyB.lit.hidden, copyB.vis.hidden], [true, false], 'this copy shows Visual Arts');
  assert.equal(copyA.vis.hidden, true, 'the other copy is not touched');
  assert.equal(treeTabChoice.get('actor1|k'), 'p-vis');
});

test('item 3: locked perks say what they need, with no raw ids', () => {
  const t = tree('t', 'X', [node('a', '[TEST] Waymarks'), node('b', '[TEST] Compass')]);
  assert.equal(lockedNeed({reason: 'Prerequisite required', requiresAll: ['a']}, t), 'Needs [TEST] Waymarks');
  assert.equal(lockedNeed({reason: 'Prerequisite required', requiresAll: ['a', {name: '[TEST] Ink'}]}, t), 'Needs [TEST] Waymarks and [TEST] Ink');
  assert.equal(lockedNeed({reason: 'An alternative prerequisite is required', requiresAny: [['a', 'b']]}, t), 'Needs [TEST] Waymarks or [TEST] Compass');
  assert.equal(lockedNeed({reason: 'Needs [TEST] Tool proficiency'}, t), 'Needs [TEST] Tool proficiency', 'Skill Trees\' specific words are kept');
  assert.equal(lockedNeed({reason: 'Prerequisite required', requiresAll: ['zz-unknown-id']}, t), 'Needs an earlier perk in this tree', 'an unnamed id is never printed');
  assert.equal(lockedNeed({reason: 'Prerequisite required'}, t), 'Needs an earlier perk in this tree');
  assert.equal(lockedNeed({reason: ''}, {...t, access: 'Needs [TEST] Kit proficiency'}), 'Needs [TEST] Kit proficiency');
  treeTabChoice.clear();
  const w = text(treesHtml({'ashen-gate-skill-trees': treesMod({embed: {data: GROUPS}})}).replace(/\n/g, ' '));
  assert.match(w, /\[TEST\] Pigments Needs \[TEST\] Waymarks/);
  assert.doesNotMatch(w, /Prerequisite required|\bv1\b/);
});

test('item 5: Skill Trees tab has Professions and Cinders tabs for every role; empty state without a Cinder; no tree state copied', () => {
  for (const user of [users.owner, users.gm ?? users.owner]) {
    treeTabChoice.clear();
    const html = treesHtml({'ashen-gate-skill-trees': treesMod({embed: {data: GROUPS}}), 'ashen-gate-cinders': cindersMod()}, makeActor(), user);
    assert.match(html, /aria-label="Skill Trees sections"/);
    assert.match(html, />Professions<\/button><button[^>]*>Cinders<\/button>/);
    assert.match(html, /<ul class="agch-plist agch-stcinders"><li><strong>\[TEST\] Ember<\/strong> <span class="agch-muted">1 of 2 perks unlocked · 2 points to spend<\/span>[\s\S]*data-action="cinder-tree" data-tree="t-cinder"[^>]*>[\s\S]*Open Skill Trees…/);
    assert.doesNotMatch(text(html), /t-cinder|PROF-/, 'no raw ids in the text');
  }
  const none = treesHtml({'ashen-gate-skill-trees': treesMod({embed: {data: GROUPS}}), 'ashen-gate-cinders': cindersMod([])});
  assert.match(none, /Cinders<\/button>/, 'the tab is still there');
  assert.match(none, /No Cinder bound yet\./);
  const noCinders = treesHtml({'ashen-gate-skill-trees': treesMod({embed: {data: GROUPS}})});
  assert.match(noCinders, /No Cinder bound yet\./);
  // With Skill Trees' own embed the Professions tab holds its slot; the choice is kept per character.
  const emb = treesHtml({'ashen-gate-skill-trees': treesMod({embed: {modes: ['character'], mount: () => ({}), data: GROUPS}})});
  assert.match(emb, /data-agch-embed="ashen-gate-skill-trees"/);
  treeTabChoice.set('actor1|trees-section', 'cinders');
  assert.match(treesHtml({'ashen-gate-skill-trees': treesMod({embed: {data: GROUPS}})}), /data-tab="cinders" aria-controls="[^"]+" aria-selected="true"/);
  assert.equal(cinderTreeSummary(GROUPS(), 'nope'), '');
  assert.match(cindersTabHtml([{name: '[TEST] A', treeId: null}], [], () => '<b>btn</b>'), /\[TEST\] A<\/strong>  <b>btn<\/b>/);
  treeTabChoice.clear();
});

test('item 6: hidden trees are left out and the hint shown when Skill Trees offers a visibility call; unchanged without it', () => {
  treeTabChoice.clear();
  const vis = {treeVisibility: id => { assert.equal(id, 'actor1'); return {hiddenTreeIds: ['t-vis', 't-ins'], hint: '2 trees hidden until you have the tool proficiency'}; }};
  const w = text(treesHtml({'ashen-gate-skill-trees': treesMod({embed: {data: GROUPS}, ...vis})}).replace(/\n/g, ' '));
  assert.doesNotMatch(w, /Waymarks|Visual Arts|Inscription/);
  assert.match(w, /Literary Arts/);
  assert.match(w, /2 trees hidden until you have the tool proficiency/);
  const all = text(treesHtml({'ashen-gate-skill-trees': treesMod({embed: {data: GROUPS}})}).replace(/\n/g, ' '));
  assert.match(all, /Visual Arts/); assert.match(all, /Inscription/);
  assert.equal(treeVisibility({}, 'a'), null);
  assert.equal(treeVisibility({visibleTrees: () => { throw new Error('x'); }}, 'a'), null);
  assert.deepEqual([...treeVisibility({visibleTrees: () => ['t-lit']}, 'a').visible], ['t-lit']);
  assert.deepEqual([...treeVisibility({treeVisibility: () => [{id: 'x', visible: false}, {treeId: 'y'}]}, 'a').hidden], ['x']);
  assert.equal(applyVisibility(GROUPS(), null).length, 3);
  assert.equal(applyVisibility(GROUPS(), {hidden: new Set(['t-ins']), visible: null}).length, 2);
});

test('item 8: table descriptions keep rows and cells apart (no run-on text); still plain text only', () => {
  const html = '<table><thead><tr><th>Lumen</th><th>Daybreak</th></tr></thead><tbody><tr><td>Cinder Type</td><td>Signature power</td></tr><tr><td>Range</td><td>30 ft</td></tr></tbody></table><p>After.</p><script>x</script>';
  const t = plainText(html);
  assert.equal(t, 'Lumen | Daybreak\nCinder Type | Signature power\nRange | 30 ft\n\nAfter.\nx');
  assert.doesNotMatch(t, /DaybreakCinder|TypeSignature|</);
  assert.equal(summaryOf(t).summary, 'Lumen | Daybreak');
  assert.equal(plainText('<p>One</p><p>Two</p>'), 'One\nTwo', 'ordinary paragraphs unchanged');
});

test('item 7: Features has one collapsible Professions header around every profession section', async () => {
  const feat = (id, name, src = null) => ({id, name, type: 'feat', system: {type: {value: 'feat'}, activities: []}, ...(src ? {flags: {'ashen-gate-manager': {source: {sourceId: src}}}} : {})});
  installGlobals({user: users.owner, modules: {'ashen-gate-profession-ledger': {active: true, api: {getProfessions: () => [{professionId: 'PROF-TEST-HERB', name: '[TEST] Herbalism'}, {professionId: 'PROF-TEST-MINE', name: '[TEST] Mining'}]}}}});
  const actor = makeActor({items: [feat('f1', '[TEST] Second Wind'), feat('p1', '[TEST] Perk A', 'PROF-TEST-HERB'), feat('p2', '[TEST] Perk B', 'PROF-TEST-MINE')]});
  const {setListChoice} = await import('../scripts/organize.mjs');
  await setListChoice('features', 'group', 'origin');
  const s = new (Sheet())({document: actor}); s.tab = 'features';
  const html = await s._renderHTML();
  assert.equal((html.match(/class="agch-sec__title">Professions</g) ?? []).length, 1, 'one top-level Professions header');
  assert.equal((html.match(/data-sec-body="features:professions-all"/g) ?? []).length, 1);
  const parent = html.slice(html.indexOf('data-sec="features:professions-all"'));
  const inner = parent.slice(0, parent.indexOf('data-sec="features:origin-feat"') > 0 ? parent.indexOf('data-sec="features:origin-feat"') : undefined);
  assert.match(inner, /Professions: [\s\S]*Herbalism[\s\S]*Professions: [\s\S]*Mining/, 'both professions sit under it, labelled as before');
  assert.match(html, /data-sec="features:origin-(feat|other)"/, 'other groups stay outside');
  // The header folds like the others: its key is the usual section-toggle, saved in the collapsed-sections setting.
  const sheetRoot = {querySelectorAll: () => []};
  const {toggleSection, isCollapsed} = await import('../scripts/collapse.mjs');
  await toggleSection(sheetRoot, 'features:professions-all');
  assert.equal(isCollapsed('features:professions-all'), true);
  const again = new (Sheet())({document: actor}); again.tab = 'features';
  assert.match(await again._renderHTML(), /data-sec-body="features:professions-all" hidden/);
});
