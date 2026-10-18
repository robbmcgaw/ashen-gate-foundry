import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compilePackage,dependencyOrder} from '../scripts/workflows.js';
import {validatePackage,planRecord,exportedFields,getPath} from '../scripts/core.js';

const demo=JSON.parse(await readFile(new URL('../samples/demo-package.json',import.meta.url),'utf8'));
test('legacy v0.2 packages still validate and can be planned',()=>{
  const copy=compilePackage(demo);
  assert.deepEqual(validatePackage(copy),[]);
  assert.equal(copy.records.length,3);
  assert.equal(dependencyOrder(copy.records).order.length,3);
});
test('typed cross-system refs validate without unresolved optional references',()=>{
  const copy=compilePackage(demo);
  copy.records[0].refs=[{relation:'generated_from',target_id:'PERK-OTHER',mode:'optional_integration'}];
  assert.deepEqual(validatePackage(copy),[]);
  copy.records[0].refs=[{relation:'generated_from',target_id:'PERK-OTHER',mode:'hard_requirement'}];
  assert.ok(validatePackage(copy).some(e=>e.includes('PERK-OTHER')));
});
test('new managed fields are safe only when existing document has no live value',()=>{
  const item={id:'ITEM-RECORD',entity_type:'Item',status:'approved',version:'2',provenance:{source:'test'},visibility:'gm',refs:[],foundry:{document_type:'Item',data:{name:'Doc',type:'loot',system:{description:{value:'a'}}}}};
  const wrap={documentName:'Item',type:'loot',flag:{managedFields:{name:'Doc'}},get:path=>({'name':'Doc','system.description.value':undefined}[path])};
  assert.equal(planRecord(item,[wrap],false,false).action,'update');
  assert.deepEqual(exportedFields(item),{name:'Doc','system.description.value':'a'});
});
