import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLocation,replaceRelationRefs,objectiveRefs,auditLocationRefs,validateLocation,refKey} from '../scripts/model.js';
const p = id => createLocation(id);
test('editing IDs preserves required typed-reference mode without demotion',()=>{
  const r=p('LOC-REF-TEST');r.refs=[
    {relation:'associated_objective',target_id:'QUEST-ALPHA',mode:'required'},
    {relation:'associated_objective',target_id:'ORDER-OLD',mode:'optional'},
    {relation:'faction_present',target_id:'FACTION-TEST',mode:'required'}
  ];
  replaceRelationRefs(r,'associated_objective',['QUEST-ALPHA','CONTRACT-BETA','QUEST-ALPHA']);
  assert.deepEqual(objectiveRefs(r),[
    {relation:'associated_objective',target_id:'QUEST-ALPHA',mode:'required'},
    {relation:'associated_objective',target_id:'CONTRACT-BETA',mode:'optional'}
  ]);
  assert.deepEqual(r.refs.find(x=>x.relation==='faction_present'),{relation:'faction_present',target_id:'FACTION-TEST',mode:'required'});
  assert.deepEqual(validateLocation(r),[]);
});
test('offered Objectives are independent from associated Objectives and not executed',()=>{
 const r=p('LOC-REF-TEST');r.refs=[
  {relation:'associated_objective',target_id:'QUEST-ONE',mode:'required'},
  {relation:'offers_objective',target_id:'CONTRACT-TWO',mode:'optional'}
 ];
 const before=JSON.stringify(r);
 const refs=objectiveRefs(r);
 refs[0].mode='optional';
 assert.equal(r.refs[0].mode,'required','reader returns a copy');
 assert.equal(JSON.stringify(r),before);
 assert.equal(refKey(r.refs[1]),'offers_objective::CONTRACT-TWO');
 assert.deepEqual(auditLocationRefs([r]),[]);
});
test('local audit does not report optional/uninstalled remote Owner data as missing',()=>{
 const r=p('LOC-AUDIT');r.refs=[
  {relation:'belongs_to_region',target_id:'LOC-NOT-IMPORTED',mode:'required'},
  {relation:'associated_objective',target_id:'QUEST-IN-OTHER-MODULE',mode:'required'},
  {relation:'offers_objective',target_id:'MAT-WRONG',mode:'optional'},
  {relation:'available_facility',target_id:'FAC-NOT-IMPORTED',mode:'optional'}
 ];
 const issues=auditLocationRefs([r]);
 assert.deepEqual(issues.map(i=>i.reason),['local_location_not_found','invalid_objective_id']);
 assert.equal(issues[0].mode,'required');
});
test('UI keeps optional and required as explicit editable modes and themes use semantic tokens',()=>{
 const main=readFileSync(new URL('../scripts/main.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../styles/locations.css',import.meta.url),'utf8');
 assert.match(main,/data-ref-mode/);assert.match(main,/offers_objective/);
 assert.match(main,/getLocationObjectiveRefs/);
 for(const token of ['--ag-bg','--ag-panel','--ag-text','--ag-muted','--ag-border','--ag-accent','--ag-danger','--ag-focus']) assert.ok(css.includes(`var(${token},`),token);
 assert.ok(!css.includes('.ag-locations-app{--ag-border:'),'theme overrides must remain possible');
});
