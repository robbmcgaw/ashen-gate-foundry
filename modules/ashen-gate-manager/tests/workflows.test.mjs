import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeDefaults,compilePackage,dependencyOrder,normalizeRef,localEdits,planLifecycle,
  buildSourceReplacementPatch,checkMacroUpdate,classifySnapshot
} from '../scripts/workflows.js';
const baseRecord=(id='ITEM-TEST')=>({id,entity_type:'Item',status:'draft',version:'0.1',
  provenance:{source:'test'},visibility:'gm',refs:[],
  foundry:{document_type:'Item',data:{name:'Test Item',type:'loot',system:{description:{value:'from source'}}}}});
const pkg=(records,templates=[])=>({manifest:{schema_version:'ag-foundry-import/0.1',package_id:'PACKAGE-TEST',version:'0.1'},records,templates});

test('deep defaults preserve per-record overrides and source is never mutated',()=>{
  const orig=pkg([{...baseRecord(),template_ref:'MAT-DEFAULT',foundry:{data:{name:'Ore',system:{description:{value:'Unique'}}}}}],
  [{id:'MAT-DEFAULT',version:'0.1',document_type:'Item',defaults:{type:'loot',img:'icons/svg/item-bag.svg',system:{description:{value:'Default'},quantity:1}}}]);
  const frozen=JSON.stringify(orig);
  const compiled=compilePackage(orig);
  assert.equal(compiled.records[0].foundry.data.system.description.value,'Unique');
  assert.equal(compiled.records[0].foundry.data.system.quantity,1);
  assert.equal(compiled.records[0]._ag_template_version,'0.1');
  assert.equal(JSON.stringify(orig),frozen);
});
test('template collisions, unknown templates and executable extra fields are rejected',()=>{
  const p=pkg([baseRecord()],[{id:'bad',document_type:'Item',defaults:{command:'alert(1)'}}]);
  assert.throws(()=>compilePackage(p),/unsupported default fields/);
  const missing=pkg([{...baseRecord(),template_ref:'missing'}]);
  assert.throws(()=>compilePackage(missing),/not found/);
});
test('dependency order imports requirements before dependent records and reports cycles',()=>{
  const a=baseRecord('ITEM-A'),b=baseRecord('ITEM-B'),c=baseRecord('ITEM-C');
  a.refs=[{relation:'uses',target_id:'ITEM-B',mode:'hard_requirement'}];
  b.refs=[{relation:'uses',target_id:'ITEM-C',mode:'hard_requirement'}];
  assert.deepEqual(dependencyOrder([a,b,c]).order,['ITEM-C','ITEM-B','ITEM-A']);
  c.refs=[{relation:'uses',target_id:'ITEM-A',mode:'hard_requirement'}];
  assert.equal(dependencyOrder([a,b,c]).cycles.length,1);
});
test('legacy and canonical typed reference shapes normalize consistently',()=>{
  assert.equal(normalizeRef({relation:'uses',target_id:'MAT-IRON',mode:'optional_integration'}).optional,true);
  assert.equal(normalizeRef({id:'MAT-IRON',optional:true}).id,'MAT-IRON');
  assert.equal(normalizeRef('MAT-IRON').optional,false);
});
test('archiving, deletion and restoration plan enforce managed/archive/dependency conditions',()=>{
  assert.equal(planLifecycle({managed:false,kind:'Item',action:'archive'}).allowed,false);
  assert.equal(planLifecycle({managed:true,kind:'Item',action:'archive'}).allowed,true);
  assert.equal(planLifecycle({managed:true,kind:'Item',action:'delete',archived:false}).allowed,false);
  assert.equal(planLifecycle({managed:true,kind:'Item',action:'delete',archived:true,dependentIds:['REC-IRON']}).allowed,false);
  assert.equal(planLifecycle({managed:true,kind:'Item',action:'delete',archived:true,embeddedCount:1}).allowed,false);
  assert.equal(planLifecycle({managed:true,kind:'Item',action:'delete',archived:true}).allowed,true);
  assert.equal(planLifecycle({managed:true,kind:'JournalEntry',action:'restore',archived:true}).allowed,true);
});
test('source replacement updates only managed Items and protects untracked fields',()=>{
  const rec=baseRecord();
  const doc={type:'loot',flag:{managedFields:{name:'Test Item','system.description.value':'previous'}},
    get:key=>({'name':'Locally edited','system.description.value':'local'}[key])};
  assert.equal(buildSourceReplacementPatch(rec,doc).action,'conflict');
  const plan=buildSourceReplacementPatch(rec,doc,{allowLocalEdits:true});
  assert.equal(plan.action,'replace');
  assert.equal(plan.patch.name,'Test Item');
  assert.equal(plan.patch['system.description.value'],'from source');
  assert.equal(buildSourceReplacementPatch({...rec,foundry:{document_type:'JournalEntry',data:{name:'X'}}},doc,{allowLocalEdits:true}).action,'blocked');
});
test('managed macros are idempotent and local code edits block overwrite',()=>{
  const incoming={command:'console.log(2)'};
  assert.equal(checkMacroUpdate(null,incoming).action,'install');
  assert.equal(checkMacroUpdate({command:'console.log(1)',flag:{lastCommand:'console.log(1)'}},incoming).action,'update');
  assert.equal(checkMacroUpdate({command:'console.log(3)',flag:{lastCommand:'console.log(1)'}},incoming).action,'conflict');
  assert.equal(checkMacroUpdate({command:'console.log(2)',flag:{lastCommand:'console.log(1)'}},incoming).action,'unchanged');
});
test('local changes are reconstructable for export review',()=>{
  const document={getFlag:()=>({managedFields:{name:'Original','system.description.value':'Old'}}),
    name:'Edited',system:{description:{value:'Old'}}};
  const diffs=localEdits(document);
  assert.equal(diffs.length,1);
  assert.equal(diffs[0].path,'name');
});
test('snapshot validation distinguishes recovery snapshot from canonical import package',()=>{
  assert.deepEqual(classifySnapshot({schema_version:'ag-foundry-snapshot/0.3',documents:[{}]}),{documents:1,valid:true});
  assert.throws(()=>classifySnapshot({records:[{}]}),/Not a valid/);
});
