import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatePackage,planRecord} from '../scripts/core.js';
import {checkContractGraph,checkLegacyCrosswalk,projectedReferences,selectionIssues} from '../scripts/contract.js';
import {dependencyOrder,normalizeRef} from '../scripts/workflows.js';
const fixture=JSON.parse(readFileSync(new URL('../samples/archie-contract-v02.json',import.meta.url),'utf8'));
const copy=()=>structuredClone(fixture);
const find=(pkg,id)=>pkg.records.find(x=>x.id===id);

test('Archie v0.2 fixture validates typed refs, ResourceOpportunity, Objective, and Mutation',()=>{
  assert.deepEqual(validatePackage(fixture),[]);
  assert.equal(fixture.records[2].objective_kind,'contract');
  assert.equal(normalizeRef(fixture.records[2].refs[0]).optional,false);
  assert.equal(checkContractGraph(fixture.records).warnings.length,0);
});
test('invalid typed modes and missing provenance source arrays are rejected',()=>{
  const bad=copy();bad.records[2].refs[0].mode='hard_requirement';
  assert.match(validatePackage(bad).join(' '),/refs\[0\]/);
  const bad2=copy(); bad2.records[0].provenance={source:'legacy'};
  assert.match(validatePackage(bad2).join(' '),/provenance.sources/);
});
test('new contract rejects wrong Objective prefix and unapproved production Work Order domains',()=>{
  const p=copy();p.records[2].objective_kind='work_order';
  assert.match(validatePackage(p).join(' '),/wrong prefix/);
  p.records[2].id='ORDER-DEMO-CRAFT';p.records[2].work_order_domain='survey';
  assert.match(validatePackage(p).join(' '),/work_order_domain/);
});
test('reference target-type mismatch and definition to campaign-state link are invalid',()=>{
  const p=copy();find(p,'CONTRACT-DEMO-CRAFT').refs[0].target_id='MAT-DEMO-METAL';
  assert.match(validatePackage(p).join(' '),/expects Location/);
  const q=copy();q.records[0].refs=[{relation:'associated_state',target_id:'ASSIGN-DEMO-SCOPED',mode:'required'}];
  assert.match(validatePackage(q).join(' '),/may not reference campaign state/);
});
test('optional missing refs get warnings and survive in canonical source flags',()=>{
  // 0.44.2: FACTION- now belongs to Renown and is informational; an id no module owns is still a warning.
  const p=copy();p.records[0].refs=[{relation:'some_future_system',target_id:'ZZZ-NOT-INSTALLED',mode:'optional'}];
  assert.deepEqual(validatePackage(p),[]);
  assert.match(checkContractGraph(p.records).warnings.join(' '),/ZZZ-NOT-INSTALLED/);
  assert.deepEqual(projectedReferences(p.records[0].refs,[]),p.records[0].refs);
});
test('partial selected import refuses absent dependencies but accepts Location-owned RES',()=>{
  assert.ok(selectionIssues(fixture.records,['CONTRACT-DEMO-CRAFT'],[]).length>0);
  assert.deepEqual(selectionIssues(fixture.records,['MAT-DEMO-METAL','LOC-DEMO-FORGE','CONTRACT-DEMO-CRAFT'],[]),[]);
  assert.deepEqual(selectionIssues(fixture.records,['CONTRACT-DEMO-CRAFT'],['MAT-DEMO-METAL','LOC-DEMO-FORGE','RES-DEMO-METAL']),[]);
});
test('nonimportable campaign state and unmapped source records remain review-only',()=>{
  assert.equal(planRecord(fixture.records[4],[],false,true).action,'blocked');
  const p=copy(); delete p.records[3].foundry;
  assert.deepEqual(validatePackage(p),[]);
  assert.equal(planRecord(p.records[3],[],false,true).action,'blocked');
});
test('legacy source-qualified crosswalk is validated but not used to overwrite IDs',()=>{
  const p=copy();p.legacy_crosswalk=[{source_ref:'old-package',legacy_id:'ACT-FOO',canonical_id:'ACTOR-FOO',reason:'namespace_collision',review_status:'reviewed'}];
  assert.deepEqual(validatePackage(p),[]);
  const bad=copy();bad.legacy_crosswalk=[{source_ref:'',legacy_id:'FOO',canonical_id:'UNKNOWN',reason:'guessed',review_status:'approved'}];
  assert.match(validatePackage(bad).join(' '),/crosswalk/);
});
test('new dependency order interprets mode required and optional correctly',()=>{
 const res=dependencyOrder(fixture.records);
 assert.equal(res.cycles.length,0);
 assert.ok(res.order.indexOf('LOC-DEMO-FORGE') < res.order.indexOf('CONTRACT-DEMO-CRAFT'));
});

test('required reciprocal typed ID links are valid, provided all targets are selected',()=>{
 const p=copy();
 const a=find(p,'MAT-DEMO-METAL');
 const b=find(p,'LOC-DEMO-FORGE');
 a.refs=[{relation:'produced_at',target_id:b.id,mode:'required'}];
 b.refs=[{relation:'provides_material',target_id:a.id,mode:'required'}];
 assert.deepEqual(validatePackage(p),[]);
 assert.ok(dependencyOrder(p.records).cycles.length >= 1);
 assert.deepEqual(selectionIssues(p.records,[a.id,b.id],[]),[]);
 assert.ok(selectionIssues(p.records,[a.id],[]).length >= 1);
});

test('second-pass reference finalization supports cycles but flags missing required targets',async()=>{
 const {finalReferenceResolution}=await import('../scripts/contract.js');
 const a={relation:'paired',target_id:'MAT-TEST-B',mode:'required'};
 const b={relation:'missing_optional',target_id:'FACTION-ABSENT',mode:'optional'};
 const c={relation:'missing_required',target_id:'MAT-FAILED',mode:'required'};
 const all=finalReferenceResolution([a,b,c],['MAT-TEST-A','MAT-TEST-B']);
 assert.deepEqual(all.resolved,[a]);
 assert.deepEqual(all.missingRequired,['MAT-FAILED']);
 assert.deepEqual(finalReferenceResolution([a,b],['MAT-TEST-B']).missingRequired,[]);
});
