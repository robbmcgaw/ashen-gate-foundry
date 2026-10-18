import test from 'node:test';
import assert from 'node:assert/strict';
import {captureItemData,buildCapturePackage,normalizeCaptureFlag} from '../scripts/capture.js';
const testItem = (id,captureId='AGCAP-AbcDEF12')=>({
  id, uuid:`Item.${id}`,
  capture:{captureId,entityType:'ProfessionPerk',reviewStatus:'approved',taggedAt:'2026-10-14T00:00:00.000Z'},
  source:{sourceId:'PERK-EXAMPLE',packageId:'AG-PROFESSIONS'},
  raw:{_id:id,name:'Test Perk',type:'feat',img:'icons/test.webp',system:{description:{value:'<p>Original HTML</p>'},advancement:[]},effects:[{_id:'effect1',label:'Buff'}],flags:{'ashen-gate-manager':{capture:{secret:'x'}},otherModule:{useful:true}},ownership:{default:3},folder:'secret-folder',_stats:{lastModifiedBy:'private'}}
});
test('tag flags have stable capture IDs, never promote approval',()=>{
  let v=normalizeCaptureFlag(testItem('xyz').capture);
  assert.equal(v.reviewStatus,'unreviewed');
  assert.equal(v.captureId,'AGCAP-AbcDEF12');
  assert.equal(normalizeCaptureFlag({captureId:'ITEM-LIVE'}),null);
});
test('export contains content and module flags but not owner IDs, document IDs or manager tags',()=>{
  const data=captureItemData(testItem('xyz').raw);
  assert.equal(data.system.description.value,'<p>Original HTML</p>');
  assert.equal(data.effects[0].label,'Buff');
  assert.equal(data.flags.otherModule.useful,true);
  assert.ok(!('_id' in data));
  assert.ok(!('ownership' in data));
  assert.ok(!('folder' in data));
  assert.ok(!('_stats' in data));
  assert.ok(!('ashen-gate-manager' in data.flags));
});
test('buildCapturePackage excludes untagged records and creates unreviewed source candidates',()=>{
  const tagged=testItem('xyz');
  const other={...testItem('abc'),capture:null};
  const pkg=buildCapturePackage([tagged,other],{exportedAt:'2026-10-14T00:00:00.000Z',worldId:'sample'});
  assert.equal(pkg.records.length,1);
  assert.equal(pkg.manifest.record_count,1);
  assert.equal(pkg.records[0].review_status,'unreviewed');
  assert.equal(pkg.records[0].source.existing_ashen_gate_id,'PERK-EXAMPLE');
  assert.equal(pkg.manifest.schema_version,'ag-foundry-capture/0.2');
});
test('duplicate capture tags block exporting ambiguous candidates',()=>{
  assert.throws(()=>buildCapturePackage([testItem('a'),testItem('b')]),/Duplicate capture ID/);
});
test('capture export does not mutate original Item source',()=>{
  const before=structuredClone(testItem('xyz').raw);
  captureItemData(before);
  assert.ok('ashen-gate-manager' in before.flags);
  assert.equal(before.ownership.default,3);
});
