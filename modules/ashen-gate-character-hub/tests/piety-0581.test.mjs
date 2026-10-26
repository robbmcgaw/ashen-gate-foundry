/** 0.58.1: deity rank changes are Piety entries; old deity entries saved as Renown read Piety (mocked Foundry; logic only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users} from './foundry-mock.mjs';
import * as j from '../scripts/journey.mjs';

const api = rank => ({getFactions: () => [], getPantheon: () => [{id: 'DEITY-X', name: 'The Test Deity', rank, score: 5}]});

test('a deity rank change is recorded as a piety entry, a faction one stays renown', () => {
  installGlobals({user: users.owner});
  const actor = makeActor();
  const first = j.renownEntries(actor, api('Novice'), {seen: {}});
  assert.deepEqual(first.entries, [], 'first look only remembers');
  const next = j.renownEntries(actor, api('Devout'), {seen: first.seen});
  assert.equal(next.entries.length, 1);
  assert.equal(next.entries[0].type, 'piety');
  assert.match(next.entries[0].id, /^piety-/);
  assert.equal(j.TYPES.piety, 'Piety');
  const f = {getPantheon: () => [], getFactions: rank => [{id: 'FAC-X', name: 'The Test Guild', personal: {[actor.id]: {score: rank, history: []}}, individualTrack: {milestones: [{id: 'a', name: 'Known', threshold: 0}, {id: 'b', name: 'Trusted', threshold: 5}]}}]};
  const a = j.renownEntries(actor, {getPantheon: () => [], getFactions: () => f.getFactions(0)}, {seen: {}});
  const b = j.renownEntries(actor, {getPantheon: () => [], getFactions: () => f.getFactions(6)}, {seen: a.seen});
  assert.equal(b.entries[0]?.type, 'renown');
});

test('entries saved before 0.58.1 for a deity read Piety; faction ones stay Renown; piety entries survive cleaning', () => {
  assert.equal(j.displayType({type: 'renown', data: {key: 'DEITY-X:deity'}}), 'piety');
  assert.equal(j.displayType({type: 'renown', data: {key: 'FAC-X:me'}}), 'renown');
  assert.equal(j.displayType({type: 'renown'}), 'renown');
  assert.equal(j.displayType({type: 'piety'}), 'piety');
  installGlobals({user: users.owner});
  const actor = makeActor();
  actor.flags['ashen-gate-character-hub'] = {journey: {v: 1, entries: [{id: 'piety-x', type: 'piety', text: 'Reached Devout with The Test Deity', at: 1}], seen: {}}};
  assert.equal(j.readJourney(actor).entries[0].type, 'piety');
});
