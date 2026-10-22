// 0.51.0: Work Orders accept the creative domain (Artistry commissions). Pure validator: proves logic, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatePackage} from '../scripts/core.js';
const fixture=JSON.parse(readFileSync(new URL('../samples/archie-contract-v02.json',import.meta.url),'utf8'));
// The fixture's Objective turned into a synthetic Work Order.
const withOrder=domain=>{const p=structuredClone(fixture);const o=p.records[2];
  o.objective_kind='work_order';o.id='ORDER-TEST-PORTRAIT';o.name='[TEST] Paint a portrait';
  if(domain===undefined)delete o.work_order_domain;else o.work_order_domain=domain;return p;};
const MESSAGE='work_order_domain: Work Order requires a crafting, production or creative domain.';

test('0.51.0: a creative Work Order validates; crafting and production are unchanged',()=>{
  for(const d of ['creative','crafting','production'])assert.deepEqual(validatePackage(withOrder(d)).filter(e=>/work_order_domain/.test(e)),[],d);
});
test('0.51.0: an unknown or missing domain is still rejected, with the new wording',()=>{
  for(const d of ['combat','survey','Creative',undefined]){
    const errors=validatePackage(withOrder(d)).join(' | ');
    assert.ok(errors.includes(MESSAGE),`${d}: ${errors}`);
  }
});
