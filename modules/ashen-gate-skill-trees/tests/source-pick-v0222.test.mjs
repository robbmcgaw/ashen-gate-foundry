// 0.22.2 Create tree: the profession or mutation is picked by name, not pasted as an id. Pure logic and markup (mocked): the dialog wiring needs a check in Forge.
import test from 'node:test';import assert from 'node:assert/strict';
import {sourceRecords,missingSourceMessage,SOURCE_KINDS} from '../scripts/source-pick.mjs';
import {validateTree} from '../scripts/engine.mjs';
import {refPicker,pickerOptions} from '../scripts/ag-html.mjs';
import {assertNoIds} from '../../../scripts/test-helpers/no-ids.mjs';

const doc=(name,sourceId,entityType,extra={},flags={})=>({name,flags:{'ashen-gate-manager':{source:{sourceId,entityType,status:'approved',...extra},...flags}}});
const DOCS=[doc('[TEST] Alchemy','PROF-TEST-ALCHEMY','Profession'),doc('[TEST] Smithing','PROF-TEST-SMITH','Profession',{status:'draft'}),
 doc('[TEST] Old','PROF-TEST-OLD','Profession',{status:'retired'}),doc('[TEST] Archived','PROF-TEST-ARCH','Profession',{},{lifecycle:{archived:true}}),
 doc('[TEST] Ember','MUT-TEST-EMBER','Mutation'),doc('[TEST] Alchemy copy','PROF-TEST-ALCHEMY','Profession'),doc('[TEST] A perk','PERK-TEST-A','ProfessionPerk'),{name:'plain',flags:{}}];

test('sourceRecords lists the active Profession records for a profession tree, once each, and Mutations for a Cinder tree',()=>{
  assert.deepEqual(sourceRecords(DOCS,'profession').map(r=>[r.value,r.label,r.hint]),[['PROF-TEST-ALCHEMY','[TEST] Alchemy',''],['PROF-TEST-SMITH','[TEST] Smithing','draft']]);
  assert.deepEqual(sourceRecords(DOCS,'cinder_milestone').map(r=>[r.value,r.label]),[['MUT-TEST-EMBER','[TEST] Ember']]);
  assert.deepEqual(sourceRecords(DOCS,'generic_points'),[]);assert.deepEqual(sourceRecords(null,'profession'),[]);
});
test('the picker shows names, no ids; an empty list explains what to import',()=>{
  const html=refPicker({id:'agst-src-profession',label:'Profession this tree is for',options:pickerOptions(sourceRecords(DOCS,'profession'),{gm:true}),none:null});
  assert.match(html,/data-label="\[TEST\] Alchemy"/);assertNoIds(html,'the Create tree profession picker');
  const empty=refPicker({id:'x',label:'Mutation this tree is for',options:[],none:null,hint:SOURCE_KINDS.cinder_milestone.none});
  assert.match(empty,/No Mutation records found\. Import them in General Manager first\./);
});
test('a tree that needs a link and has none gets a plain sentence; stored links still validate',()=>{
  assert.equal(missingSourceMessage('profession'),'Choose the profession this tree is for.');
  assert.equal(missingSourceMessage('cinder_milestone'),'Choose the mutation this tree is for.');
  assert.equal(missingSourceMessage('generic_points'),'');
  const ok=validateTree({id:'LOCAL-TREE-X',name:'[TEST]',sourceRef:'PROF-TEST-ALCHEMY',provider:{kind:'profession'},status:'draft',visibility:'gm',nodes:[]});
  assert.deepEqual(ok.errors,[],'ids saved by older versions are unchanged');
});
