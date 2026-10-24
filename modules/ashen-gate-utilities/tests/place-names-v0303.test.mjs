// 0.30.3 A shop, service or merchant list whose place Locations no longer has says so; it never prints the id. Mocked: logic and markup only.
import test from 'node:test';import assert from 'node:assert/strict';
import {shopPlace,MISSING_PLACE,UNKNOWN_PLACE} from '../scripts/core.mjs';
import {settlementOptionLabel} from '../scripts/shops.mjs';
import {assertNoIds} from '../../../scripts/test-helpers/no-ids.mjs';

const locs=new Map([['LOC-TEST-A',{id:'LOC-TEST-A',name:'[TEST] Ashford'}],['LOC-TEST-NONAME',{id:'LOC-TEST-NONAME',name:' '}]]);

test('a saved place that is gone reads Missing; with no places listed (Locations off) the name is unavailable; neither shows the id',()=>{
  const gone=shopPlace({locationId:'LOC-TEST-GONE'},locs);
  assert.deepEqual(gone,{place:MISSING_PLACE,city:MISSING_PLACE});assertNoIds(gone.place,'place');
  const off=shopPlace({locationId:'LOC-TEST-GONE'},new Map());
  assert.deepEqual(off,{place:UNKNOWN_PLACE,city:UNKNOWN_PLACE});assertNoIds(off.city,'city');
  assert.equal(shopPlace({locationId:'LOC-TEST-NONAME'},locs).place,MISSING_PLACE,'a place with no name is not named by its id');
});
test('places that still exist, and typed settlements, are unchanged (existing stored ids still resolve)',()=>{
  assert.deepEqual(shopPlace({locationId:'LOC-TEST-A'},locs),{place:'[TEST] Ashford',city:'[TEST] Ashford'});
  assert.deepEqual(shopPlace({settlement:'[TEST] Hamlet'},locs),{place:'[TEST] Hamlet',city:'[TEST] Hamlet'});
});
test('the Settlement select labels a saved non-settlement by name and a deleted place as Missing, never by id',()=>{
  assert.equal(settlementOptionLabel({name:'[TEST] Old Road'}),'[TEST] Old Road (not a settlement)');
  const gone=settlementOptionLabel(undefined);
  assert.match(gone,/^Missing: a place that no longer exists/);assertNoIds(gone,'settlement option');
});
