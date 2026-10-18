import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePackage} from '../scripts/core.js';
import {dependencyOrder} from '../scripts/workflows.js';
import {selectionIssues,finalReferenceResolution} from '../scripts/contract.js';

function testPackage(size=558,cyclePairs=54) {
  const records=Array.from({length:size},(_,i)=>({
    id:`MAT-SYN-${String(i+1).padStart(4,'0')}`,entity_type:'Material',status:'draft',
    version:'0.1.0',scope:'generic_rules',provenance:{sources:['v042 synthetic regression']},visibility:'gm',
    refs:[],foundry:{document_type:'Item',data:{name:`Synthetic Material ${i+1}`,type:'loot',system:{description:{value:'<p>Synthetic test only</p>'}}}}
  }));
  for (let i=0;i<cyclePairs;i++) {
    const a=records[i*2],b=records[i*2+1];
    a.refs=[{relation:'test_relationship',target_id:b.id,mode:'required'}];
    b.refs=[{relation:'test_relationship',target_id:a.id,mode:'required'}];
  }
  return {manifest:{schema_version:'ag-foundry-import/0.2',package_id:'MAT-SYNTHETIC-558',version:'0.1.0'},records};
}

test('558 synthetic source records with 54 reciprocal cycles are valid with all required IDs selected',()=>{
  const pack=testPackage();
  assert.deepEqual(validatePackage(pack),[]);
  assert.equal(dependencyOrder(pack.records).cycles.length,54);
  const ids=pack.records.map(r=>r.id);
  assert.deepEqual(selectionIssues(pack.records,ids,[]),[]);
  // Disallow partial import where a required member of a cycle is not selected or existing.
  assert.equal(selectionIssues(pack.records,[pack.records[0].id],[]).length,1);
  assert.deepEqual(selectionIssues(pack.records,[pack.records[0].id],[pack.records[1].id]),[]);
});

test('final pass preserves reciprocal ID links and reports failed required documents',()=>{
  const pack=testPackage(2,1);
  const [a,b]=pack.records;
  assert.deepEqual(finalReferenceResolution(a.refs,[a.id,b.id]).resolved,a.refs);
  assert.deepEqual(finalReferenceResolution(b.refs,[a.id,b.id]).resolved,b.refs);
  const failing=finalReferenceResolution(a.refs,[a.id]);
  assert.deepEqual(failing.resolved,[]);
  assert.deepEqual(failing.missingRequired,[b.id]);
});
