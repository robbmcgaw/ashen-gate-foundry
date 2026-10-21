/** 1.17.4: Character Hub level-up backups (flags['ashen-gate-character-hub'].levelBackup) are never watch candidates or targets.
 *  Mocked Foundry documents: proves the helper, the API's watch validation and the players' watch names, not the live tracker. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry, Scene} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {isLevelBackup} from '../scripts/model.mjs';
import {readAll, writeAll, readViews, placeNote, players, readRoutes, writeRoutes, readRouteViews, usedRouteIds, defaultLegKm,
  readTravel, writeTravel, readJourneyView} from '../scripts/store.mjs';

class Users extends Map { [Symbol.iterator]() { return this.values(); } }
const ava = {id: 'a1', name: '[TEST] Ava', type: 'character', flags: {}};
const backup = {id: 'b1', name: '[TEST] Ava - level 3', type: 'character', flags: {'ashen-gate-character-hub': {levelBackup: {level: 3, sourceId: 'a1'}}}};

async function world({characters} = {}) {
  const g = installFoundry();
  const users = new Users([['gm', {id: 'gm', name: '[TEST] GM', isGM: true, active: true}], ['p1', {id: 'p1', name: '[TEST] Player', isGM: false, active: true}]]);
  g.users = users;
  g.user = users.get('gm');
  g.scenes = [new Scene()];
  g.settings = {get: () => undefined, set: async () => {}};
  g.actors = new Map([[ava.id, ava], [backup.id, backup]]);
  const api = createApi({version: '1.17.4', isGM: () => true, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}, playerIds: () => players().map(x => x.id),
    routes: {readAll: readRoutes, writeAll: writeRoutes, readViews: readRouteViews, usedIds: usedRouteIds, defaultLegKm},
    travel: {read: readTravel, write: writeTravel, readView: readJourneyView, drawHazard: async () => ({text: '[TEST] Hazard'}),
      chat: {gm: async () => {}, public: async () => {}}, rng: () => 0.99, now: () => 1000},
    ...(characters ? {characters} : {})});
  g.modules = {get: id => id === 'ashen-gate-locations' ? {version: '1.17.4', active: true, api} : null};
  const harbor = await api.saveLocation({name: '[TEST] Harbor'});
  const mill = await api.saveLocation({name: '[TEST] Mill'});
  const r = await api.saveRoute({fromId: harbor.id, toId: mill.id, name: '[TEST] Road', distanceKm: 20, legKm: 5, hazardBase: 25});
  await api.startJourney(r.id);
  return {api};
}

test('isLevelBackup: only a truthy Character Hub levelBackup flag; safe when absent', () => {
  assert.equal(isLevelBackup(backup), true);
  assert.equal(isLevelBackup(ava), false);
  assert.equal(isLevelBackup({type: 'character'}), false);
  assert.equal(isLevelBackup({flags: {'ashen-gate-character-hub': {levelBackup: null}}}), false);
  assert.equal(isLevelBackup(null), false);
  assert.equal(isLevelBackup(undefined), false);
});

test('no Primary Party: every character Actor but a backup can go on watch; a backup is refused', async () => {
  const {api} = await world();
  await assert.rejects(() => api.travel.setBehaviours({watch: {first: ['b1']}}), /Only player characters can go on watch.*b1/);
  const out = await api.travel.setBehaviours({watch: {first: ['a1']}});
  assert.deepEqual(out.watch.first, ['a1'], 'a normal character is unaffected');
});

test('a backup listed as a candidate (e.g. in the Primary Party) is still refused', async () => {
  const {api} = await world({characters: () => [{id: 'a1', name: ava.name}, {id: 'b1', name: backup.name}]});
  await assert.rejects(() => api.travel.setBehaviours({watch: {second: ['a1', 'b1']}}), /Not one: b1/);
  assert.deepEqual((await api.travel.setBehaviours({watch: {second: ['a1']}})).watch.second, ['a1']);
});
