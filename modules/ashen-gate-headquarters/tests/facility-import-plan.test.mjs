import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planFacilityImport} from '../js/logic.mjs';
const list=JSON.parse(fs.readFileSync(new URL('../../../test-fixtures/playtest/AG_Playtest_HQ_Facilities_0.6.1.json',import.meta.url),'utf8'));
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
import {emptyState,applyOperation,facilities} from '../js/logic.mjs';
test('facility definitions import before the Guildhall is activated, and activate nothing',()=>{
 const gm={id:'gm',isGM:true};
 const s=applyOperation(emptyState(),gm,'import_definitions',{definitions:list});
 assert.equal(s.active,false);assert.equal(s.catalog.length,list.length);assert.equal(s.inventory.length,0);
 assert.throws(()=>applyOperation(s,gm,'import_definitions',{definitions:[list[0]]}),/Duplicate/);
 assert.throws(()=>applyOperation(emptyState(),{id:'p',isGM:false},'import_definitions',{definitions:list}),/GM/i);
 assert.throws(()=>applyOperation(emptyState(),gm,'load_demo'),/activate the Guildhall first/);
 assert.equal(facilities(s).size,list.length);
});
