/** 0.31.0 Publish all changes: mocked Foundry / in-memory store; logic and HTML only, not the live window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../scripts/api.mjs';
import {normalizeLocation, publishable, hasUnpublishedChanges} from '../scripts/model.mjs';
globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
globalThis.CSS ??= {escape: v => String(v)};
const {LocationsApp} = await import('../scripts/app.mjs');

/** A published-then-edited location (players see an older version), or a clean one. */
const rec = (id, state, {edited = false, archived = false} = {}) => {
  let l = normalizeLocation({id, name: `[TEST] ${id}`, state, revealed: state === 'revealed', archived});
  if (state !== 'hidden') l.published = publishable(l);
  if (edited) l = {...l, description: 'Edited after publish'};
  return l;
};
function boot({gm = true, list} = {}) {
  const store = {list: structuredClone(list ?? [
    rec('LOC-TEST-A', 'revealed', {edited: true}), rec('LOC-TEST-B', 'unidentified', {edited: true}),
    rec('LOC-TEST-C', 'hidden', {edited: true}), rec('LOC-TEST-D', 'revealed', {edited: true, archived: true}),
    rec('LOC-TEST-E', 'revealed')]), writes: 0};
  const api = createApi({version: '0.31.0', isGM: () => gm, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll: () => store.list, writeAll: async l => { store.writes++; store.list = structuredClone(l); }, readViews: () => [], placeNote: async () => ({}), open: () => {}, openLocation: () => {}});
  return {api, store};
}

test('publishes only shown, unarchived locations with unpublished changes, and returns count and ids only', async () => {
  const {api, store} = boot();
  const res = await api.publishAllLocations();
  assert.deepEqual(res, {published: 2, ids: ['LOC-TEST-A', 'LOC-TEST-B']});
  for (const id of ['LOC-TEST-A', 'LOC-TEST-B']) assert.equal(hasUnpublishedChanges(store.list.find(l => l.id === id)), false, id);
  assert.equal(store.list.find(l => l.id === 'LOC-TEST-A').published.description, 'Edited after publish');
});

test('hidden, archived and up-to-date locations are skipped and nothing but published changes', async () => {
  const {api, store} = boot();
  const before = structuredClone(store.list);
  await api.publishAllLocations();
  for (const id of ['LOC-TEST-C', 'LOC-TEST-D', 'LOC-TEST-E']) assert.deepEqual(store.list.find(l => l.id === id), before.find(l => l.id === id), id);
  assert.equal(store.list.find(l => l.id === 'LOC-TEST-C').published, null, 'hidden stays unpublished');
  for (const a of store.list) { const o = before.find(l => l.id === a.id); for (const k of ['state', 'revealed', 'active', 'audience', 'pinKey']) assert.deepEqual(a[k], o[k], `${a.id}.${k}`); }
});

test('a non-GM is rejected in the API and nothing is written', async () => {
  const {api, store} = boot({gm: false});
  await assert.rejects(() => api.publishAllLocations(), /Only the GM/);
  assert.equal(store.writes, 0);
});

test('re-running is idempotent: the second call publishes 0 and writes nothing', async () => {
  const {api, store} = boot();
  await api.publishAllLocations();
  assert.equal(store.writes, 1);
  assert.deepEqual(await api.publishAllLocations(), {published: 0, ids: []});
  assert.equal(store.writes, 1);
});

test('it is one write for any number of locations', async () => {
  const many = Array.from({length: 7}, (_, i) => rec(`LOC-TEST-M${i}`, 'revealed', {edited: true}));
  const {api, store} = boot({list: many});
  assert.equal((await api.publishAllLocations()).published, 7);
  assert.equal(store.writes, 1);
});

test('the API offers it; the button is disabled with a reason when nothing is waiting and counts when something is', () => {
  const {api} = boot(); assert.equal(typeof api.publishAllLocations, 'function');
  const P = LocationsApp.prototype;
  const self = {unpublishedCount: P.unpublishedCount};
  const none = P.publishAllHtml.call(self, [rec('LOC-TEST-E', 'revealed'), rec('LOC-TEST-C', 'hidden', {edited: true})]);
  assert.match(none, /<button [^>]*disabled/); assert.match(none, /Publish all changes…/); assert.match(none, /Nothing to publish/);
  const some = P.publishAllHtml.call(self, [rec('LOC-TEST-A', 'revealed', {edited: true}), rec('LOC-TEST-B', 'revealed', {edited: true})]);
  assert.doesNotMatch(some, /<button [^>]*disabled/); assert.match(some, /2 locations have saved changes/); assert.match(some, /data-action="publish-all"/);
});
