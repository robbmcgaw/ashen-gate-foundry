import test from 'node:test';
import assert from 'node:assert/strict';
import {folderSegments,validateImportPresentation,iconFallback,chooseIcon,markerTargets,buildUuidIndex,resolveUuid,resolveRichText,resolveTypedRefs,stripReferenceBlock} from '../scripts/import-fidelity.js';
import {ensureFolder} from '../scripts/folders.js';
import {validatePackage} from '../scripts/core.js';
const r=(id,type='Item',folder_path='Ashen Gate/Professions/Recipes/Blacksmithing',text='')=>({id,entity_type:'Recipe',status:'draft',version:'0.1.0',provenance:{sources:['Synthetic contract fixture']},visibility:'gm',refs:[],foundry:{document_type:type,folder_path,data:type==='Item'?{name:id,type:'feat',system:{description:{value:text}}}:{name:id,pages:[{name:'Notes',type:'text',text:{content:text}}]}}});
function mockFolders(){
  const docs=[];
  const folders={get:id=>docs.find(x=>x.id===id),filter:fn=>docs.filter(fn),find:fn=>docs.find(fn)};
  const create=async data=>{const doc={...data,id:'folder'+(docs.length+1)};docs.push(doc);return doc;};
  return {docs,folders,create};
}
function doc(id,name=id,type='Item',uuid='Item.'+id.replaceAll('-','')){
  return {uuid,name,documentName:type,getFlag:(ns,k)=>ns==='ashen-gate-manager'&&k==='source'?{sourceId:id}:null};
}
test('folder paths are optional, nested, rooted, and cannot traverse or inject',()=>{
  assert.equal(folderSegments(),null);
  assert.deepEqual(folderSegments('Ashen Gate/Professions/Recipes/Blacksmithing'),['Ashen Gate','Professions','Recipes','Blacksmithing']);
  for(const bad of ['Other/Recipes','Ashen Gate//Materials','Ashen Gate/../Private','Ashen Gate/Items/','Ashen Gate/Bad\\Path','Ashen Gate/<script>'])assert.throws(()=>folderSegments(bad));
});
test('nested Item folders created once and reused without duplicated siblings',async()=>{
  const m=mockFolders();const report=[];const cache=new Map();const path='Ashen Gate/Professions/Recipes/Blacksmithing';
  const first=await ensureFolder('Item',path,{...m,cache,report:x=>report.push(x)});
  assert.equal(m.docs.length,4);assert.equal(first.folder,m.docs[2].id);
  const again=await ensureFolder('Item',path,{...m,cache,report:x=>report.push(x)});
  assert.equal(again.id,first.id);assert.equal(report.length,4);
  const second=await ensureFolder('Item','Ashen Gate/Professions/Recipes/Alchemy',{...m,cache,report:x=>report.push(x)});
  assert.equal(m.docs.length,5);assert.equal(second.folder,m.docs[2].id);
});
test('Items and Journal entries have separate folder trees with same names',async()=>{
  const m=mockFolders();const path='Ashen Gate/Professions';
  const a=await ensureFolder('Item',path,m),b=await ensureFolder('JournalEntry',path,m);
  assert.notEqual(a.id,b.id);assert.equal(m.docs.length,4);
  assert.ok(m.docs.filter(f=>f.name==='Ashen Gate').length===2);
});
test('folder creation failures and ambiguous existing siblings produce actionable errors',async()=>{
  const m=mockFolders();m.docs.push({id:'x',name:'Ashen Gate',folder:null,type:'Item'},{id:'y',name:'Ashen Gate',folder:null,type:'Item'});
  await assert.rejects(()=>ensureFolder('Item','Ashen Gate/X',m),/Ambiguous Item folder/);
  const m2=mockFolders();await assert.rejects(()=>ensureFolder('Item','Ashen Gate/X',{...m2,create:async()=>{throw new Error('depth exceeded')}}),/depth exceeded/);
});
test('icon fallback is shipped with module, author icon retained and missing 404 recovered',async()=>{
  const rec=r('REC-DEMO');
  assert.match(iconFallback(rec),/assets\/icons\/recipe.svg$/);
  assert.match(iconFallback({...rec,id:'MAT-ORE'}),/material.svg$/);
  assert.match(iconFallback({...rec,id:'PERK-ONE'}),/perk.svg$/);
  assert.deepEqual(await chooseIcon(rec),{img:iconFallback(rec),reason:'fallback'});
  rec.foundry.data.img='worlds/icons/custom.png';
  assert.equal((await chooseIcon(rec)).img,'worlds/icons/custom.png');
  assert.equal((await chooseIcon(rec,async()=>404)).reason,'missing-authored');
  assert.equal((await chooseIcon(rec,async()=>403)).reason,'authored');
});
test('stable source IDs bind to true per-world UUIDs independent of record order, preserving cycles',()=>{
  const ix=buildUuidIndex([doc('REC-DEMO'),doc('MAT-IRON'),doc('PROF-BLACKSMITH')]);
  const a=resolveTypedRefs([{relation:'requires_material',target_id:'MAT-IRON',mode:'required'}],ix);
  const b=resolveTypedRefs([{relation:'is_used_by',target_id:'REC-DEMO',mode:'required'}],ix);
  assert.equal(a.bindings[0].uuid,'Item.MATIRON');assert.equal(b.bindings[0].uuid,'Item.RECDEMO');
  assert.deepEqual(a.issues,[]);assert.deepEqual(b.issues,[]);
});
test('missing and ambiguous targets are explicit, optional misses warn but required misses error',()=>{
  const ix=buildUuidIndex([doc('MAT-IRON'),doc('MAT-IRON','Duplicate Material','JournalEntry','JournalEntry.duplicate')]);
  assert.equal(resolveUuid(ix,'MAT-IRON').status,'ambiguous');
  const bind=resolveTypedRefs([{relation:'requires_material',target_id:'MAT-IRON',mode:'required'},{relation:'look_up',target_id:'MAT-WATER',mode:'optional'}],ix);
  assert.deepEqual(bind.issues.map(i=>i.level),['error','warning']);
  assert.match(bind.issues[0].message,/ambiguous/);
});
test('AGREF works for Item descriptions and Journal pages, escapes the display label and tracks errors',()=>{
  const ix=buildUuidIndex([doc('MAT-IRON','Iron Ore'),doc('ITEM-DAGGER','Dagger')]);
  const html='<p>Use [[AGREF:MAT-IRON|Iron Ore]] and [[AGREF:ITEM-DAGGER|<script>]].</p>';
  const result=resolveRichText(html,ix);
  assert.match(result.text,/@UUID\[Item.MATIRON\]\{Iron Ore\}/);
  assert.doesNotMatch(result.text,/<script>/);assert.match(result.text,/&lt;script&gt;/);
  assert.equal(result.resolved.length,2);assert.deepEqual(result.issues,[]);
  assert.deepEqual(markerTargets(r('REC-DEMO','Item',undefined,html)),['MAT-IRON','ITEM-DAGGER']);
  assert.deepEqual(markerTargets(r('REC-DEMO','JournalEntry',undefined,html)),['MAT-IRON','ITEM-DAGGER']);
});
test('missing AGREF stays visible and causes a named error instead of a dead link',()=>{
  const html='<p>[[AGREF:MAT-MISSING|Missing]]</p>';const result=resolveRichText(html,new Map());
  assert.equal(result.text,html);assert.equal(result.issues[0].id,'MAT-MISSING');
  assert.equal(result.issues[0].level,'error');
});
test('markers inside HTML attributes or malformed placeholders are rejected before any writes',()=>{
  assert.match(validateImportPresentation(r('REC-DEMO','Item',undefined,'<a title="[[AGREF:MAT-IRON]]">hi</a>'))[0],/HTML tag/);
  assert.match(validateImportPresentation(r('REC-DEMO','Item',undefined,'[[AGREF:MAT-IRON'))[0],/invalid AGREF/);
});
test('0.54.2: the legacy References section is stripped exactly, idempotently, and nothing else',()=>{
  const block='\n<section class="ag-managed-links" data-ag-managed-links="1"><h4>References</h4><ul><li><span>also_available_as_journal:</span> @UUID[Item.X]{ITEM-HANDOUT-A}</li></ul></section>';
  const html='<p>Authored text.</p>';
  assert.equal(stripReferenceBlock(html+block),html);
  assert.equal(stripReferenceBlock(stripReferenceBlock(html+block)),html);
  assert.equal(stripReferenceBlock(html),html);
  assert.equal(stripReferenceBlock('<section class="mine"><h4>References</h4></section>'),'<section class="mine"><h4>References</h4></section>');
  assert.equal(stripReferenceBlock(undefined),undefined);
});
test('0.2 package with paths validates; path-less legacy projection still validates unchanged',()=>{
  const record=r('REC-DEMO');const p={manifest:{schema_version:'ag-foundry-import/0.2',package_id:'AG-DEMO',version:'0.1.0'},records:[record]};
  assert.deepEqual(validatePackage(p),[]);
  delete record.foundry.folder_path;assert.deepEqual(validatePackage(p),[]);
  record.foundry.folder_path='Ashen Gate/../Danger';assert.match(validatePackage(p).join(' '),/folder_path/);
});
