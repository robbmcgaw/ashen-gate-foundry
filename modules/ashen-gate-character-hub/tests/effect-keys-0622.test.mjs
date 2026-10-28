/** 0.62.2: companion-item effect keys read the same in dnd5e 5.x and 6.0 shape (mocked Foundry; logic only, not the live Hub). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEffectKey, toCurrentKey, toLegacyKey, systemUsesCurrentKeys, keyForWorld, effectKeyLabel, KEY_RULES} from '../scripts/effect-keys.mjs';
import {keyLabel, companionStats, itemGives} from '../scripts/companion-items.mjs';

const ABILITIES = {str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma'};
const SKILLS = {acr: 'Acrobatics', ani: 'Animal Handling', arc: 'Arcana', ath: 'Athletics', dec: 'Deception', his: 'History', ins: 'Insight', itm: 'Intimidation', inv: 'Investigation', med: 'Medicine', nat: 'Nature', prc: 'Perception', prf: 'Performance', per: 'Persuasion', rel: 'Religion', slt: 'Sleight of Hand', ste: 'Stealth', sur: 'Survival'};
const label = o => ({label: o});
globalThis.CONFIG = {DND5E: {abilities: Object.fromEntries(Object.entries(ABILITIES).map(([k, v]) => [k, label(v)])), skills: Object.fromEntries(Object.entries(SKILLS).map(([k, v]) => [k, label(v)]))}};

test('every ability: save and check, old and 6.0 key, read identically', () => {
  for (const a of Object.keys(ABILITIES)) {
    for (const [kind, word] of [['save', 'saves'], ['check', 'checks']]) {
      const old = `system.abilities.${a}.bonuses.${kind}`, cur = `system.abilities.${a}.${kind}.roll.bonus`;
      assert.equal(keyLabel(old), `${ABILITIES[a]} ${word}`);
      assert.equal(keyLabel(cur), keyLabel(old));
      assert.deepEqual(normalizeEffectKey(old), {kind, scope: 'ability', subject: a, legacy: true, currentKey: cur, legacyKey: old});
      assert.deepEqual(normalizeEffectKey(cur), {kind, scope: 'ability', subject: a, legacy: false, currentKey: cur, legacyKey: old});
    }
  }
});
test('every skill: check old and 6.0; passive never moved and is not legacy', () => {
  for (const s of Object.keys(SKILLS)) {
    const old = `system.skills.${s}.bonuses.check`, cur = `system.skills.${s}.roll.bonus`, pas = `system.skills.${s}.bonuses.passive`;
    assert.equal(keyLabel(old), SKILLS[s]);
    assert.equal(keyLabel(cur), SKILLS[s]);
    assert.equal(normalizeEffectKey(old).legacy, true);
    assert.equal(normalizeEffectKey(cur).legacy, false);
    assert.equal(keyLabel(pas), `${SKILLS[s]} (passive)`);
    assert.equal(normalizeEffectKey(pas).legacy, false);
    assert.equal(toCurrentKey(old), cur); assert.equal(toLegacyKey(cur), old); assert.equal(toCurrentKey(pas), pas);
  }
});
test('every rule: old and 6.0 labels match, and the pair converts both ways', () => {
  const fill = (t, s) => t.replace('{s}', s).replace('{w}', s);
  const samples = {ability: 'wis', skill: 'ste', tool: 'thief', attack: 'rwak', movement: 'fly', sense: 'darkvision', global: ''};
  for (const r of KEY_RULES) {
    const s = r.fixed ?? samples[r.scope], old = fill(r.legacy, s), cur = fill(r.current, s);
    assert.ok(effectKeyLabel(cur), `${cur} has a label`);
    assert.equal(effectKeyLabel(old), effectKeyLabel(cur), r.kind);
    assert.equal(toCurrentKey(old), cur); if (!r.fixed) assert.equal(toLegacyKey(cur), old);   // the speed alias is many-to-one
    assert.equal(normalizeEffectKey(cur).legacy, false); assert.equal(normalizeEffectKey(old).legacy, old !== cur);
    assert.equal(normalizeEffectKey(old).kind, normalizeEffectKey(cur).kind);
  }
});
test('the other moved keys label the same either way', () => {
  const pairs = [
    ['system.bonuses.abilities.save', 'system.rolls.ability.save.bonus', 'Saving throws'],
    ['system.bonuses.abilities.check', 'system.rolls.ability.check.bonus', 'Ability checks'],
    ['system.bonuses.abilities.skill', 'system.rolls.ability.skill.bonus', 'Skill checks'],
    ['system.bonuses.mwak.attack', 'system.rolls.attack.mwak.bonus', 'Melee weapon attack'],
    ['system.bonuses.rsak.damage', 'system.rolls.damage.rsak.bonus', 'Ranged spell damage'],
    ['system.attributes.init.bonus', 'system.attributes.init.roll.bonus', 'Initiative'],
    ['system.attributes.concentration.bonuses.save', 'system.attributes.concentration.roll.bonus', 'Concentration saves'],
    ['system.attributes.death.bonuses.save', 'system.attributes.death.roll.bonus', 'Death saves'],
    ['system.attributes.movement.walk', 'system.attributes.movement.speeds.walk', 'Walk speed'],
    ['system.attributes.movement.speed', 'system.attributes.movement.speeds.walk', 'Walk speed'],
    ['system.attributes.senses.darkvision', 'system.attributes.senses.ranges.darkvision', 'Darkvision']
  ];
  for (const [old, cur, text] of pairs) { assert.equal(keyLabel(old), text); assert.equal(keyLabel(cur), text); assert.equal(toCurrentKey(old), cur); assert.equal(normalizeEffectKey(old).legacy, true); assert.equal(normalizeEffectKey(cur).legacy, false); }
});
test('unknown and unmoved keys fall back as before', () => {
  assert.equal(keyLabel('system.custom.thing'), 'Custom thing');
  assert.equal(keyLabel('system.rolls.attack.mod.bonus'), 'Attack rolls');
  assert.equal(keyLabel('system.attributes.ac.bonus'), 'AC');
  assert.equal(keyLabel('system.attributes.movement.bonus'), 'Speed (all)');
  assert.equal(keyLabel('system.attributes.hp.bonuses.level'), 'Max HP');
  assert.equal(normalizeEffectKey('system.custom.thing'), null);
  assert.equal(normalizeEffectKey('system.abilities.zzz.save.roll.bonus').subject, 'zzz', 'an unlisted ability still reads (dnd5e allows custom abilities)');
  assert.equal(normalizeEffectKey('system.attributes.movement.bonus'), null);
  assert.equal(normalizeEffectKey('system.rolls.attack.zzz.bonus'), null);
  assert.equal(normalizeEffectKey(undefined), null);
  assert.equal(toCurrentKey('flags.x.y'), 'flags.x.y'); assert.equal(toLegacyKey('flags.x.y'), 'flags.x.y');
});
test('what an item gives reads the same with either key, and mixed keys sum into one line', () => {
  const item = keys => ({name: '[TEST] Charm', type: 'feat', effects: [{name: 'Fx', disabled: false, transfer: false, changes: keys.map(key => ({key, mode: 2, value: '1'}))}]});
  const a = itemGives(item(['system.abilities.dex.bonuses.save', 'system.skills.ste.bonuses.check']));
  const b = itemGives(item(['system.abilities.dex.save.roll.bonus', 'system.skills.ste.roll.bonus']));
  assert.equal(a, 'Dexterity saves +1; Stealth +1');
  assert.equal(b, a);
  const mixed = companionStats([item(['system.abilities.dex.bonuses.save']), item(['system.abilities.dex.save.roll.bonus'])]);
  assert.equal(mixed.lines.length, 1);
  assert.equal(mixed.lines[0].label, 'Dexterity saves');
  assert.equal(mixed.lines[0].total, 2);
});
test('system-version feature detection chooses which form to write', () => {
  assert.equal(systemUsesCurrentKeys('6.0.6'), true);
  assert.equal(systemUsesCurrentKeys('6.1.0'), true);
  assert.equal(systemUsesCurrentKeys('5.2.4'), false);
  assert.equal(systemUsesCurrentKeys('garbage'), false);
  assert.equal(systemUsesCurrentKeys(undefined), false);
  assert.equal(keyForWorld('system.abilities.dex.bonuses.save', '6.0.6'), 'system.abilities.dex.save.roll.bonus');
  assert.equal(keyForWorld('system.abilities.dex.save.roll.bonus', '5.2.4'), 'system.abilities.dex.bonuses.save');
  assert.equal(keyForWorld('system.attributes.ac.bonus', '5.2.4'), 'system.attributes.ac.bonus');
  globalThis.game = {system: {id: 'dnd5e', version: '6.0.6'}};
  assert.equal(systemUsesCurrentKeys(), true);
  globalThis.game = {system: {id: 'dnd5e', version: '5.1.0'}};
  assert.equal(systemUsesCurrentKeys(), false);
  delete globalThis.game;
});
