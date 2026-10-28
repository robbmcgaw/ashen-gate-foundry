/** 0.24.1 Active locations: mocked Foundry; logic only. These tests do not run the real hooks, journals or window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installFoundry, gm, player} from './foundry-mock.mjs';
import {readAll, writeAll, readViews, placeNote} from '../scripts/store.mjs';
import {createApi} from '../scripts/api.mjs';
import {playerView, normalizeLocation, hasUnpublishedChanges} from '../scripts/model.mjs';
import {createActiveWatcher, ACTIVE_HOOK} from '../scripts/active.mjs';
import {applyFilters, emptyFilters, filterOptions} from '../scripts/list-filter.mjs';
globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
const {LocationsApp} = await import('../scripts/app.mjs');
globalThis.CSS ??= {escape: v => String(v)};

function boot(user = gm) {
  const g = installFoundry();
  const mod = {version: '0.29.0', active: true};
  mod.api = createApi({version: '0.29.0', isGM: () => game.user.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {}, readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}});
  g.modules = {get: id => id === 'ashen-gate-locations' ? mod : null};
  game.user = gm;
  return {api: mod.api, g, as: u => { game.user = u; return mod.api; }};
}
async function seed(api) {
  const mk = async (name, state) => { const l = await api.createLocation(name); if (state) await api.setLocationState(l.id, state); return (await api.getLocation(l.id)); };
  return {hid: await mk('[TEST] Hidden Hold'), unid: await mk('[TEST] Strange Place', 'unidentified'), rev: await mk('[TEST] Open Town', 'revealed'), rev2: await mk('[TEST] Old Road', 'revealed')};
}

test('new and existing locations read Not active; defaulting needs no migration', async () => {
  const {api} = boot(); const l = await seed(api);
  for (const x of Object.values(l)) assert.equal(x.active, false);
  assert.equal(normalizeLocation({id: 'LOC-x', name: 'x', state: 'revealed'}).active, false);
  assert.equal(normalizeLocation({id: 'LOC-x', name: 'x', state: 'hidden', active: true}).active, false, 'a hidden place is never active');
});

test('the GM toggles; many can be active; it applies at once with no Publish and is not published content', async () => {
  const {api} = boot(); const l = await seed(api);
  await api.setLocationActive(l.rev.id, true); await api.setLocationActive(l.rev2.pinKey, true);   // by id or pin key
  assert.deepEqual(api.activeLocations().map(a => a.name), ['[TEST] Old Road', '[TEST] Open Town']);
  assert.deepEqual(Object.keys(api.activeLocations()[0]), ['id', 'key', 'name', 'state']);
  assert.equal(api.isLocationActive(l.rev.id), true); assert.equal(api.isLocationActive(l.unid.id), false);
  const rec = await api.getLocation(l.rev.id);
  assert.equal(hasUnpublishedChanges(rec), false, 'Active is not draft content');
  assert.equal(JSON.stringify(rec.published).includes('"active"'), false);
  await api.setLocationActive(l.rev.id, false); assert.equal(api.isLocationActive(l.rev.id), false);
  assert.equal((await api.saveLocation({...(await api.getLocation(l.rev2.id)), name: '[TEST] Old Road 2', active: false})).active, true, 'Save Changes does not change Active');
});

test('players cannot set it; bad input and hidden places are refused; making a place hidden clears it', async () => {
  const {api, as} = boot(); const l = await seed(api);
  await assert.rejects(() => as(player).setLocationActive(l.rev.id, true), /Only the GM/);
  as(gm);
  await assert.rejects(() => api.setLocationActive(l.hid.id, true), /hidden/);
  await assert.rejects(() => api.setLocationActive(l.rev.id, 'yes'), /true or false/);
  await assert.rejects(() => api.setLocationActive('LOC-nope', true), /No location/);
  await api.setLocationActive(l.rev.id, true); await api.setLocationState(l.rev.id, 'hidden');
  assert.equal(api.isLocationActive(l.rev.id), false);
  await api.setLocationState(l.rev.id, 'revealed'); assert.equal(api.isLocationActive(l.rev.id), false, 'it does not come back by itself');
});

test('players see only visible active places; unidentified shows only its label; hidden never appears', async () => {
  const {api, as} = boot(); const l = await seed(api);
  await api.setLocationActive(l.rev.id, true); await api.setLocationActive(l.unid.id, true);
  const p = as(player);
  const list = p.activeLocations();
  assert.deepEqual(list.map(x => x.name), ['[TEST] Open Town', 'Unknown place'].sort((a, b) => a.localeCompare(b)).map(n => n === 'Unknown place' ? list.find(x => x.state === 'unidentified').name : n));
  const unid = list.find(x => x.state === 'unidentified');
  assert.deepEqual(Object.keys(unid).sort(), ['key', 'name', 'state']);
  assert.doesNotMatch(JSON.stringify(list), /Strange Place|Hidden Hold|LOC-.*Strange/);
  assert.equal(p.isLocationActive(l.hid.pinKey), false); assert.equal(p.isLocationActive(l.unid.pinKey), true);
  assert.ok(!('id' in unid));
  as(gm);
});

test('Selected-players audience: only the selected players see it as active', async () => {
  const {api, as, g} = boot(); const l = await seed(api);
  class Users extends Map { [Symbol.iterator]() { return this.values(); } }
  g.users = new Users([['gm', gm], ['p1', player], ['p2', {id: 'p2', isGM: false, active: true}]]);
  await api.setAudience(l.rev.id, {mode: 'selected', userIds: ['p2']}); await api.setLocationActive(l.rev.id, true);
  assert.deepEqual(as(player).activeLocations(), []);   // p1 is not selected
  assert.equal(as(player).isLocationActive(l.rev.pinKey), false);
  as(gm); await api.setAudience(l.rev.id, {mode: 'selected', userIds: ['p1']});
  assert.deepEqual(as(player).activeLocations().map(a => a.name), ['[TEST] Open Town']);
  as(gm);
});

test('the player view carries active only when true, and a hidden view does not exist', () => {
  const base = {id: 'LOC-TEST-A', name: 'A', state: 'revealed'};
  assert.equal('active' in playerView({...base, active: false}), false);
  assert.equal(playerView({...base, active: true}).active, true);
  assert.equal(playerView({...base, state: 'unidentified', active: true}).active, true);
  assert.equal(playerView({...base, state: 'hidden', active: true}), null);
});

test('the hook: fires on a change, not at start-up, with keys/added/removed; players are told, the GM is not', () => {
  for (const isGM of [false, true]) {
    let rows = [{key: 'k1', name: 'Open Town'}]; const fired = [], told = [];
    const w = createActiveWatcher({read: () => rows, isGM: () => isGM, fire: (n, p) => fired.push([n, p]), notify: t => told.push(t)});
    assert.equal(w.check(), null); assert.equal(fired.length, 0, 'first read is the baseline');
    assert.equal(w.check(), null);
    rows = [{key: 'k1', name: 'Open Town'}, {key: 'k2', name: 'Old Road'}]; w.check();
    assert.deepEqual(fired[0], [ACTIVE_HOOK, {keys: ['k1', 'k2'], added: ['k2'], removed: []}]);
    assert.deepEqual(told, isGM ? [] : ['The party is now at Old Road.']);
    rows = [{key: 'k2', name: 'Old Road'}]; w.check();
    assert.deepEqual(fired[1][1], {keys: ['k2'], added: [], removed: ['k1']}); assert.equal(told.length, isGM ? 0 : 1, 'no notice when one is removed');
  }
  assert.equal(ACTIVE_HOOK, 'ashen-gate-locations.activeChanged');
  const t = createActiveWatcher({read: () => { throw new Error('no access'); }, isGM: () => false, fire() { throw new Error('x'); }, notify() {}});
  assert.doesNotThrow(() => t.check());
});

test('the list: Active badge and filter on the GM side, Here now and active-first on the player side', async () => {
  const {api, as} = boot(); const l = await seed(api);
  await api.setLocationActive(l.rev2.id, true);
  const app = new LocationsApp();
  const row = app.rowButton({...(await api.getLocation(l.rev2.id))});
  assert.match(row, /agl-active[^]*?Active</); assert.doesNotMatch(app.rowButton(await api.getLocation(l.rev.id)), /agl-active/);
  const rows = api.listLocations();
  const f = {...emptyFilters(), status: 'active'};
  assert.deepEqual(applyFilters(rows, f).map(r => r.name), ['[TEST] Old Road']);
  assert.equal(filterOptions(rows, emptyFilters()).status.find(o => o.value === 'active').count, 1);
  const p = as(player); const papp = new LocationsApp(); const plist = papp.list();
  assert.equal(plist[0].name, '[TEST] Old Road');
  assert.match(papp.rowButton(plist[0]), /Here now/);
  as(gm);
});

test('editor head: a real button with aria-pressed and a visible text state; GM Setup untouched', () => {
  const src = fs.readFileSync(new URL('../scripts/app.mjs', import.meta.url), 'utf8');
  assert.match(src, /data-action="toggle-active" aria-pressed="\$\{d\.active === true\}"[^]*?\$\{d\.active \? 'Active' : 'Not active'\}/);
  assert.match(src, /Reveal and make active\?/); assert.match(src, /case 'toggle-active'/);
});

test('turning Active on writes only the one location record (nothing else)', async () => {
  const {api, g} = boot(); const l = await seed(api);
  const before = JSON.stringify(g.scenes ?? []);
  const rec0 = await api.getLocation(l.rev.id);
  await api.setLocationActive(l.rev.id, true);
  const rec1 = await api.getLocation(l.rev.id); const others = await api.getLocation(l.rev2.id);
  assert.deepEqual({...rec1, active: false}, {...rec0, active: false}); assert.equal(others.active, false);
  assert.equal(JSON.stringify(g.scenes ?? []), before);
});
