import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planFacilityImport} from '../js/logic.mjs';
const list=JSON.parse(fs.readFileSync(new URL('../../../test-fixtures/playtest/AG_Playtest_HQ_Facilities_0.5.2.json',import.meta.url),'utf8'));
test('a list or a records object plans new facilities',()=>{
 for(const payload of [list,{records:list}]){
  const {errors,rows}=planFacilityImport(payload);
  assert.deepEqual(errors,[]);assert.equal(rows.length,list.length);assert.ok(rows.every(r=>r.action==='new'));
 }
});
test('facilities already in the catalog are skipped and kept',()=>{
 const {rows}=planFacilityImport(list,new Set([list[0].id]));
 assert.equal(rows[0].action,'skip');assert.match(rows[0].reason,/kept as is/);assert.ok(rows.slice(1).every(r=>r.action==='new'));
});
test('bad shape, duplicates and invalid definitions are reported',()=>{
 assert.ok(planFacilityImport({nope:1}).errors.length);
 assert.match(planFacilityImport([list[0],list[0]]).errors[0],/duplicate/);
 assert.ok(planFacilityImport([{id:'x'}]).errors.length);
});
