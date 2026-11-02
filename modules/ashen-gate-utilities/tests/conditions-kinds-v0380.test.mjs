// 0.38.0: the condition list drops duplicates (display only), and groups under fixed kind headers. Pure logic; no Foundry.
import test from 'node:test';
import assert from 'node:assert/strict';
import {dedupeConditionRows, nearDuplicateRows, statusSource, similarIcon, conditionKind, groupConditionChoices, CONDITION_KINDS, KIND_MAP, normKey} from '../scripts/condition-kinds.mjs';
import {sharedConditionChoices, analyzeConditionChoices} from '../scripts/core.mjs';

const row = (id, label, img = '', source = statusSource(id), extra = {}) => ({id, label, img, source, ...extra});
const ids = rows => rows.map(r => r.id);

test('same status id appears once; the better source wins, then the earlier row', () => {
  const {kept, removed} = dedupeConditionRows([row('x', 'X', '', 'other'), row('x', 'X', '', 'dnd5e'), row('x', 'X', '', 'dnd5e')]);
  assert.equal(kept.length, 1); assert.equal(kept[0].source, 'dnd5e');
  assert.deepEqual(removed.map(r => r.reason), ['same id', 'same id']);
});
test('same label (case, spacing, accents ignored) with the same or a similar icon is one condition; dnd5e beats core beats other', () => {
  const rows = [row('conc-mod', 'concentrating ', 'modules/x/concentrating.svg', 'other'), row('concentrating', 'Concentrating', 'systems/dnd5e/icons/svg/statuses/concentrating.svg', 'dnd5e'), row('conc-core', ' CONCENTRATING', 'icons/svg/aura.svg', 'core')];
  const {kept, removed} = dedupeConditionRows(rows);
  assert.deepEqual(ids(kept), ['concentrating']);
  assert.deepEqual(removed.map(r => [r.id, r.keptId]), [['conc-mod', 'concentrating'], ['conc-core', 'concentrating']]);
  const core = dedupeConditionRows([row('a', 'Burning', 'icons/svg/fire.svg', 'other'), row('burning', 'Burning', 'other/folder/fire.svg', 'core')]);
  assert.deepEqual(ids(core.kept), ['burning'], 'same file name in another folder is a similar icon; core beats other');
});
test('same label but a clearly different icon, group or riders is kept: they may apply different rules', () => {
  assert.equal(dedupeConditionRows([row('a', 'Shaken', 'icons/a.svg'), row('b', 'Shaken', 'icons/b.svg')]).kept.length, 2);
  assert.equal(dedupeConditionRows([row('a', 'Cover', 'i/c.svg', 'other', {exclusiveGroup: 'cover'}), row('b', 'Cover', 'i/c.svg', 'other')]).kept.length, 2);
  assert.equal(dedupeConditionRows([row('a', 'Down', 'i/d.svg', 'other', {riders: ['prone']}), row('b', 'Down', 'i/d.svg', 'other', {riders: []})]).kept.length, 2);
});
test('different labels are never merged: Exhausted and Exhaustion stay, and are reported as a similar pair', () => {
  const rows = [row('exhaustion', 'Exhaustion', 'a/ex.svg'), row('exhausted', 'Exhausted', 'b/ex2.svg', 'other'), row('prone', 'Prone')];
  const {kept} = dedupeConditionRows(rows);
  assert.equal(kept.length, 3);
  const near = nearDuplicateRows(kept);
  assert.deepEqual(near.map(n => [n.a.id, n.b.id, n.why]), [['exhaustion', 'exhausted', 'similar names']]);
  assert.deepEqual(near[0].b, {id: 'exhausted', label: 'Exhausted', source: 'other'});
});
test('sources: dnd5e ids, core ids, and ids this build registers itself', () => {
  assert.equal(statusSource('prone'), 'dnd5e'); assert.equal(statusSource('sleep'), 'core'); assert.equal(statusSource('agm-vex'), 'other');
  assert.equal(statusSource('newthing', {systemIds: ['newthing']}), 'dnd5e');
  assert.ok(similarIcon('', 'x.svg') && similarIcon('a/x.svg?v=2', 'b/X.png') && !similarIcon('a/x.svg', 'a/y.svg'));
});
test('sharedConditionChoices drops the duplicate, keeps the shape and the sort, and never touches the registry', () => {
  const registry = {
    concentrating: {id: 'concentrating', name: 'Concentrating', img: 'systems/dnd5e/icons/svg/statuses/concentrating.svg'},
    'mod-conc': {id: 'mod-conc', name: 'Concentrating', img: 'modules/m/concentrating.svg'},
    exhaustion: {id: 'exhaustion', name: 'Exhaustion', img: 'a/exhaustion.svg'},
    exhausted: {id: 'exhausted', name: 'Exhausted', img: 'b/tired.svg'},
    prone: {id: 'prone', name: 'Prone', img: 'p.svg'},
  };
  const before = JSON.stringify(registry);
  const entries = Object.values(registry);
  const label = id => registry[id].name, list = sharedConditionChoices(entries, {registry, label});
  assert.deepEqual(ids(list), ['concentrating', 'exhausted', 'exhaustion', 'prone']);
  assert.deepEqual(Object.keys(list[0]).sort(), ['custom', 'id', 'img', 'label']);
  assert.equal(JSON.stringify(registry), before);
  const r = analyzeConditionChoices(entries, {registry, label});
  assert.deepEqual(r.removed.map(x => [x.id, x.source, x.keptId]), [['mod-conc', 'other', 'concentrating']]);
  assert.equal(r.near.length, 1);
  const custom = sharedConditionChoices(entries, {registry, label, icons: {concentrating: 'my/own.png'}});
  assert.equal(custom[0].img, 'my/own.png', 'the GM\'s custom icon still shows on the kept one');
});

test('grouping: fixed order, A to Z inside, empty groups hidden, headers are labels only', () => {
  const c = id => ({id, label: id[0].toUpperCase() + id.slice(1), img: ''});
  const g = groupConditionChoices([c('prone'), c('blinded'), c('stunned'), c('poisoned'), c('raging'), c('incapacitated'), c('grappled'), c('zzunknown')]);
  assert.deepEqual(g.map(x => x.label), ['Incapacitating', 'Movement restricting', 'Sensory and mental', 'Debilitating', 'Buffs and stances', 'Other']);
  assert.deepEqual(g[0].items.map(x => x.id), ['incapacitated', 'stunned']);
  assert.deepEqual(g[1].items.map(x => x.id), ['grappled', 'prone']);
  assert.deepEqual(groupConditionChoices([c('prone')]).map(x => x.key), ['movement'], 'empty groups are hidden');
  assert.deepEqual(groupConditionChoices([]), []);
  assert.deepEqual(CONDITION_KINDS.map(k => k.key), ['incapacitating', 'movement', 'sensory', 'debilitating', 'buffs', 'other']);
});
test('every kind named in the brief lands where it was asked; id first, then label; unknown goes to Other', () => {
  const want = {incapacitating: ['Incapacitated', 'Paralyzed', 'Stunned', 'Unconscious', 'Petrified', 'Dead', 'Dying'], movement: ['Grappled', 'Restrained', 'Prone', 'Slowed', 'Falling', 'Burrowing', 'Flying', 'Ethereal'],
    sensory: ['Blinded', 'Deafened', 'Charmed', 'Frightened', 'Confused', 'Distracted', 'Invisible', 'Concentrating', 'Silenced'], debilitating: ['Poisoned', 'Bleeding', 'Burning', 'Diseased', 'Exhausted', 'Exhaustion', 'Cursed', 'Dehydration', 'Weakened', 'Bane'],
    buffs: ['Blessed', 'Hasted', 'Dodging', 'Disengage', 'Hiding', 'Raging', 'Inspired', 'Bardic Inspiration']};
  for (const [kind, names] of Object.entries(want)) for (const n of names) assert.equal(conditionKind({id: 'zz-' + n, label: n}), kind, n);
  assert.equal(conditionKind({id: 'paralysis', label: 'Whatever'}), 'incapacitating', 'id wins over the label');
  assert.equal(conditionKind({id: 'prone', label: 'Blinded'}), 'movement', 'id is matched before the label');
  assert.equal(conditionKind({id: 'mystery', label: 'Mystery'}), 'other');
  assert.equal(conditionKind(null), 'other');
  assert.equal(normKey('Bardic  Inspiration!'), 'bardicinspiration');
  assert.ok(Object.keys(KIND_MAP).every(k => CONDITION_KINDS.some(x => x.key === k)));
});
