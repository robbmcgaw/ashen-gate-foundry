/** 0.62.3: musical instrument tools count as trinkets (mocked Foundry; logic only, not the live Hub). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor} from './foundry-mock.mjs';
import {isMusicalInstrument, naturalSlot, equipmentLayout, equipChoices} from '../scripts/items.mjs';
import {MODULE_ID} from '../scripts/constants.mjs';

const tool = (id, kind, equipped = false, extra = {}) => ({id, name: `[TEST] ${id}`, type: 'tool', ...extra, system: {quantity: 1, equipped, type: {value: kind, baseItem: ''}}});
const trinketItem = (id, equipped = false) => ({id, name: `[TEST] ${id}`, type: 'equipment', system: {quantity: 1, equipped, type: {value: 'trinket'}}});
const make = items => makeActor({items});
const at = (l, id) => l.slots.find(s => s.id === id).item?.id ?? null;

test('isMusicalInstrument: tool with type music only', () => {
  installGlobals();
  assert.equal(isMusicalInstrument(tool('lute', 'music')), true);
  assert.equal(isMusicalInstrument(tool('smith', 'art')), false);
  assert.equal(isMusicalInstrument(tool('dice', 'game')), false);
  assert.equal(isMusicalInstrument({type: 'equipment', system: {type: {value: 'music'}}}), false);
  assert.equal(isMusicalInstrument({type: 'tool', system: {}}), false);
  assert.equal(isMusicalInstrument(null), false);
});

test('a music tool qualifies as a trinket; other tools do not', () => {
  installGlobals();
  const actor = make([tool('lute', 'music'), tool('smith', 'art'), tool('dice', 'game'), tool('plain', '')]);
  assert.equal(naturalSlot(actor.items.get('lute')), 'trinket');
  for (const id of ['smith', 'dice', 'plain']) assert.equal(naturalSlot(actor.items.get(id)), null);
  assert.deepEqual(equipChoices(actor, 'trinket').map(i => i.id), ['lute']);
  assert.deepEqual(equipChoices(actor, 'trinket3').map(i => i.id), ['lute']);
  for (const slot of ['neck', 'head', 'ring1', 'mainhand', 'offhand', 'body', 'waist']) assert.deepEqual(equipChoices(actor, slot).map(i => i.id), [], `not offered for ${slot}`);
});

test('equipped music tool sits in a trinket box; other equipped tools stay in Other', () => {
  installGlobals();
  const actor = make([tool('lute', 'music', true), tool('smith', 'art', true)]);
  const l = equipmentLayout(actor);
  assert.equal(at(l, 'trinket'), 'lute');
  assert.deepEqual(l.other.map(o => o.id), ['smith']);
});

test('existing trinket qualifiers are unchanged', () => {
  installGlobals();
  const actor = make([trinketItem('charm'), trinketItem('charm2', true), tool('lute', 'music', true),
    {id: 'stone', name: '[TEST] Odd Stone', type: 'equipment', system: {quantity: 1, equipped: false, type: {value: 'wondrous'}}}]);
  assert.equal(naturalSlot(actor.items.get('charm')), 'trinket');
  assert.equal(naturalSlot(actor.items.get('stone')), null);
  assert.deepEqual(equipChoices(actor, 'trinket').map(i => i.id).sort(), ['charm', 'stone']);
  const l = equipmentLayout(actor);
  assert.deepEqual(['trinket', 'trinket2', 'trinket3'].map(s => at(l, s)).sort(), ['charm2', 'lute', null]);
});

test('items already in another slot behave as before', () => {
  installGlobals();
  const actor = make([tool('lute', 'music', true, {flags: {[MODULE_ID]: {slot: 'neck'}}}), trinketItem('charm', true)]);
  const l = equipmentLayout(actor);
  assert.equal(at(l, 'neck'), 'lute', 'owner-assigned slot wins');
  assert.equal(at(l, 'trinket'), 'charm');
  assert.equal(l.other.length, 0);
  const full = make([trinketItem('a', true), trinketItem('b', true), trinketItem('c', true), tool('lute', 'music', true)]);
  assert.deepEqual(equipmentLayout(full).other.map(o => o.id), ['lute'], 'all three trinket boxes taken: instrument goes to Other');
  const worn = make([tool('lute', 'music', true), tool('lute2', 'music', false)]);
  assert.deepEqual(equipChoices(worn, 'trinket').map(i => i.id), ['lute2'], 'equipped instruments are not offered again');
});
