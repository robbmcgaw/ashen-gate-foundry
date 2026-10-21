/** 0.44.0: Shop, Service and MerchantList records through Manager's import (shopping brief 6). Routed to Utilities'
 *  api.shops.importShops after the package's Items, feature-detected ("Needs Utilities 0.21.0" otherwise); preview rows
 *  like Routes; drafts, blocked statuses, keep vs update. Utilities' real import rules run over an in-memory store;
 *  mirrors #preview / #apply in main.js and proves the logic, not the live Manager window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validatePackage} from '../scripts/core.js';
import {dependencyOrder} from '../scripts/workflows.js';
import {isShopRecord, shopsApi, shopIds, planShop, shopsNote, applyShops, NEEDS_UTILITIES} from '../scripts/shop-handoff.js';
import {planShopImport, shopImportRecords, importItemRefs} from '../../ashen-gate-utilities/scripts/core.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('../../../test-fixtures/shops/AG_Test_Shops.json', import.meta.url), 'utf8'));
/** Utilities' shops API over memory: its own planner, items found among `worldItems` by permanent id. */
function utilities(worldItems) {
  const state = {shops: [], services: [], lists: [], calls: []};
  let n = 0;
  const api = {
    list: () => state.shops, services: {list: () => state.services}, merchants: {list: () => state.lists},
    async importShops(input, {mode = 'create'} = {}) {
      const {records} = shopImportRecords(input);
      state.calls.push({ids: records.map(r => r.id), mode, itemsAtCall: worldItems.map(i => i.id)});
      const items = new Map(importItemRefs(records).flatMap(k => { const it = worldItems.find(i => `id:${i.id}` === k); return it ? [[k, {data: {name: it.name, type: 'loot', system: {quantity: 1, price: {value: 1, denomination: 'gp'}}}, contents: []}]] : []; }));
      const {results, writes} = planShopImport(records, {mode, ...state, retiredIds: [], items, randomId: () => `r${++n}`});
      for (const [k, list] of Object.entries(writes)) for (const w of list) state[k] = [...state[k].filter(x => x.id !== w.id), w];
      return results;
    }
  };
  return {api, state};
}
const gameWith = api => ({modules: {get: id => id === 'ashen-gate-utilities' ? {active: true, api: {shops: api}} : null}});

/** #preview for the shop rows. */
const preview = (p, api, opts = {}) => {
  const ids = shopIds(api);
  return dependencyOrder(p.records).order.map(id => p.records.find(r => r.id === id)).filter(isShopRecord).map(r => ({id: r.id, kind: r.entity_type, ...planShop(r, {existingIds: ids, ...opts})}));
};
/** #apply: documents first (the Items), then the shop records in one call. */
async function apply(p, api, rows, world, opts = {}) {
  for (const r of p.records.filter(r => r.entity_type === 'Item')) if (!world.some(i => i.id === r.id)) world.push({id: r.id, name: r.foundry.data.name});
  return applyShops(rows.filter(r => ['create', 'update'].includes(r.action)).map(r => p.records.find(x => x.id === r.id)), api, opts);
}

test('the synthetic package validates in Manager (shop records are not Foundry documents)', () => {
  assert.deepEqual(validatePackage(fixture, new Map()), []);
  assert.deepEqual(fixture.records.filter(isShopRecord).map(r => r.entity_type), ['Shop', 'Service', 'MerchantList']);
});
test('without Utilities 0.21.0 (or with an older Utilities) the records are reported, never break the import', async () => {
  for (const game of [{modules: {get: () => null}}, gameWith({list: () => []}), {modules: {get: () => ({active: false, api: {shops: {importShops() {}}}})}}])
    assert.equal(shopsApi(game), null);
  assert.equal(shopsNote(fixture.records, null), `3 shop, service or merchant list records skipped: ${NEEDS_UTILITIES}`);
  assert.deepEqual(preview(fixture, null, {includeDrafts: true}).map(r => [r.action, r.reason]), Array(3).fill(['skipped', NEEDS_UTILITIES]));
  assert.deepEqual((await applyShops(fixture.records.filter(isShopRecord), null)).map(r => r.status), ['skipped', 'skipped', 'skipped']);
});
test('preview: drafts need Include drafts, retired is blocked, new records are created after the Items', () => {
  const {api} = utilities([]);
  assert.ok(shopsApi(gameWith(api)));
  assert.equal(shopsNote(fixture.records, api), null);
  assert.deepEqual(preview(fixture, api).map(r => r.action), ['skipped', 'skipped', 'skipped'], 'the fixture is draft');
  assert.deepEqual(preview(fixture, api, {includeDrafts: true}).map(r => [r.kind, r.action]), [['Shop', 'create'], ['Service', 'create'], ['MerchantList', 'create']]);
  assert.match(preview(fixture, api, {includeDrafts: true})[0].reason, /imported through Utilities after the Items/);
  const retired = {...fixture, records: fixture.records.map(r => r.entity_type === 'Shop' ? {...r, status: 'retired'} : r)};
  assert.equal(preview(retired, api, {includeDrafts: true})[0].action, 'blocked');
});
test('apply: Items exist before Utilities is called, one call, results in the log; again: kept; Update on: updated', async () => {
  const world = [], {api, state} = utilities(world);
  const rows = preview(fixture, api, {includeDrafts: true});
  const log = await apply(fixture, api, rows, world);
  assert.deepEqual(state.calls[0].itemsAtCall, ['ITEM-TEST-LEATHER-ARMOR', 'ITEM-TEST-WATERSKIN', 'ITEM-TEST-HIDE-BUNDLE'], 'the package\'s Items are created first');
  assert.deepEqual(state.calls.map(c => [c.ids.length, c.mode]), [[3, 'create']]);
  assert.deepEqual(log.map(r => [r.id, r.kind, r.action, r.status]), [['SHOP-TEST-TANNER', 'Shop', 'create', 'ok'], ['SVC-TEST-COUNTING-HOUSE', 'Service', 'create', 'ok'], ['MLIST-TEST-TESTFORD', 'MerchantList', 'create', 'ok']]);
  assert.deepEqual([state.shops[0].lines.length, state.lists[0].visible], [3, false]);
  const again = preview(fixture, api, {includeDrafts: true});
  assert.deepEqual(again.map(r => r.action), ['skipped', 'skipped', 'skipped']);
  assert.match(again[0].reason, /Shop already exists; kept unchanged\. Turn on "Update existing locations, routes and shops"/);
  const up = preview(fixture, api, {includeDrafts: true, updateExisting: true});
  assert.deepEqual(up.map(r => r.action), ['update', 'update', 'update']);
  const log2 = await apply(fixture, api, up, world, {updateExisting: true});
  assert.deepEqual([state.calls[1].mode, log2.map(r => r.action)], ['update', ['update', 'update', 'update']]);
});
test('a missing item line and a refused record come back with their reasons', async () => {
  const world = [], {api} = utilities(world);
  const p = structuredClone(fixture);
  p.records = p.records.filter(r => r.id !== 'ITEM-TEST-WATERSKIN');
  p.records.find(r => r.entity_type === 'Service').service.type = 'tailor';
  const log = await apply(p, api, preview(p, api, {includeDrafts: true}), world);
  assert.deepEqual([log[0].status, log[0].message], ['ok', 'item ITEM-TEST-WATERSKIN: Item not found in this world.']);
  assert.deepEqual([log[1].status, log[1].message], ['error', 'Unknown service type: tailor.']);
  const boom = await applyShops([fixture.records[3]], {importShops: async () => { throw Error('GM only.'); }});
  assert.deepEqual([boom[0].status, boom[0].message], ['error', 'GM only.']);
});
