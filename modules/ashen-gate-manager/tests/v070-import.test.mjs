import test from 'node:test';
import assert from 'node:assert/strict';
import '../scripts/vendor/jszip.min.js';
import {readImportZip,adaptRecordArtwork,uploadMatchingArt,referencedArtwork} from '../scripts/zip-import.js';
import {validatePackage,planRecord} from '../scripts/core.js';
import {ensureFolder} from '../scripts/folders.js';
import {resolveUuid,buildUuidIndex,iconFallback} from '../scripts/import-fidelity.js';
// Use the JSZip dependency actually shipped with this Foundry module.
const JSZip=globalThis.JSZip;
if(typeof JSZip!=='function')throw new Error('Bundled JSZip failed to load');
const mk=(id,kind,data)=>({id,entity_type:kind,status:'draft',version:'0.1.0',provenance:{sources:['Synthetic test fixture (not approved)']},visibility:'gm',refs:[],scope:'setting_adapter',foundry:{document_type:kind,folder_path:`Ashen Gate/Tests/${kind}`,data}});
const actor=mk('ACTOR-TEST-001','NPC',{name:'Synthetic Defender',type:'npc',img:'worlds/sample/synthetic.png',system:{attributes:{hp:{value:15,max:15}}},prototypeToken:{name:'Synthetic Defender',texture:{src:'worlds/sample/synthetic.png'},actorLink:false},items:[{name:'Synthetic Strike',type:'feat',system:{description:{value:'<p>Sample.</p>'},activities:{a:{type:'attack'}}}}],flags:{world:{test:'yes'}}});
actor.foundry.document_type='Actor';
const table=mk('TABLE-TEST-001','RollTable',{name:'Synthetic Loot Table',formula:'1d2',results:[{type:'text',text:'Nothing',range:[1,1],weight:1},{type:'text',text:'Something',range:[2,2],weight:1}]});
const macro=mk('MACRO-TEST-001','Macro',{name:'Synthetic safe Macro',type:'script',scope:'global',command:'globalThis.__AG_TEST = true;'});
const packageJson={manifest:{schema_version:'ag-foundry-import/0.2',package_id:'AG-V070-TEST',version:'0.7.0'},records:[actor,table,macro]};
test('New Actor, RollTable and Macro validate as ag-foundry-import/0.2 without changing existing Items/Journals',()=>{
  assert.deepEqual(validatePackage(packageJson),[]);
  assert.deepEqual(packageJson.records.map(r=>planRecord(r,[],false,true).action),['create','create','create']);
  assert.equal(planRecord(actor,[{documentName:'Actor'}],false,true).action,'blocked');
  assert.equal(iconFallback(actor).endsWith('actor.svg'),true);
});
test('Actor preserves source embedded Item and token values; only uploaded image path can be adapted',()=>{
  const changed=adaptRecordArtwork(actor,new Map([['synthetic.png','worlds/test/ashen-gate-imports/synthetic.png']]));
  assert.equal(changed.foundry.data.img,'worlds/test/ashen-gate-imports/synthetic.png');
  assert.equal(changed.foundry.data.prototypeToken.texture.src,'worlds/test/ashen-gate-imports/synthetic.png');
  assert.equal(changed.foundry.data.items[0].system.activities.a.type,'attack');
  assert.equal(actor.foundry.data.img,'worlds/sample/synthetic.png');
});
test('Actor, RollTable, Macro references resolve through their real world UUIDs',()=>{
  const docs=['Actor','RollTable','Macro'].map((type,i)=>({documentName:type,name:type,uuid:`${type}.abc${i+1}`,getFlag:()=>({sourceId:packageJson.records[i].id})}));
  const index=buildUuidIndex(docs);
  assert.equal(resolveUuid(index,'ACTOR-TEST-001').uuid,'Actor.abc1');
  assert.equal(resolveUuid(index,'TABLE-TEST-001').uuid,'RollTable.abc2');
  assert.equal(resolveUuid(index,'MACRO-TEST-001').uuid,'Macro.abc3');
});
test('New folder type Actor can be nested without mixing Journal folders',async()=>{
  const existing=[];
  const folders={get:id=>existing.find(f=>f.id===id),filter:fn=>existing.filter(fn)};
  const create=async data=>{const doc={...data,id:`f${existing.length+1}`};existing.push(doc);return doc;};
  await ensureFolder('Actor','Ashen Gate/Session 01/Combat NPCs',{folders,create});
  await ensureFolder('JournalEntry','Ashen Gate/Session 01/Combat NPCs',{folders,create});
  assert.equal(existing.length,6);
});
test('ZIP imports only the single manager projection, not canonical source or script-macro JSON',async()=>{
  const z=new JSZip();z.file('projection.json',JSON.stringify(packageJson));z.file('canonical.json',JSON.stringify({manifest:{schema_version:'ag-source-package/0.1'},records:[]}));
  z.file('Macro.json',JSON.stringify({name:'Do Not Execute',type:'script',command:'danger'}));z.file('Portraits/synthetic.png',Uint8Array.from([1,2,3]));
  const result=await readImportZip(await z.generateAsync({type:'uint8array'}),JSZip);
  assert.equal(result.filename,'projection.json');assert.equal(result.pkg.records.length,3);
  assert.equal(result.assets.size,1);
});
test('ZIP errors on zero/multiple projection documents and path traversal',async()=>{
  const no=new JSZip();no.file('only-source.json',JSON.stringify({manifest:{schema_version:'ag-source-package/0.1'},records:[]}));
  await assert.rejects(async()=>readImportZip(await no.generateAsync({type:'uint8array'}),JSZip),/no ag-foundry-import/);
  const twice=new JSZip();twice.file('first.json',JSON.stringify(packageJson));twice.file('second.json',JSON.stringify(packageJson));
  await assert.rejects(async()=>readImportZip(await twice.generateAsync({type:'uint8array'}),JSZip),/contains 2 Manager import projections/);
  const traversal=new JSZip();traversal.file('/bad.json',JSON.stringify(packageJson),{createFolders:false});
  await assert.rejects(async()=>readImportZip(await traversal.generateAsync({type:'uint8array'}),JSZip),/Unsafe ZIP entry path/);
});
test('ZIP artwork uploader uploads only referenced assets, returns paths, preserves author JSON',async()=>{
  const calls=[],asset={entry:{async:async()=>Uint8Array.from([5,6,7])}};
  const fake={createDirectory:async(_source,path)=>calls.push(['mkdir',path]), upload:async(_source,path,file)=>{calls.push(['upload',path,file.name]);return{path:`${path}/${file.name}`};}};
  const base='worlds/test-world/ashen-gate-imports/ag-v070-test';
  const map=await uploadMatchingArt(new Map([['synthetic.png',asset],['unused.png',asset]]),[actor],base,()=>{},fake);
  assert.equal(calls.filter(x=>x[0]==='upload').length,1);
  assert.equal(map.get('synthetic.png'),`${base}/synthetic.png`);
  assert.equal(actor.foundry.data.img,'worlds/sample/synthetic.png');
  assert.deepEqual([...referencedArtwork([actor])],['synthetic.png']);
});
test('Missing content and invalid actor fields are rejected in preview',()=>{
  const invalid=structuredClone(packageJson);
  invalid.records[0].foundry.data.items='not an array';
  assert.match(validatePackage(invalid).join(' '),/Actor items must be an array/);
  invalid.records[0].foundry.data.items=[];invalid.records[0].foundry.data.type='scene';
  assert.match(validatePackage(invalid).join(' '),/only npc or character Actors/);
  invalid.records[0].foundry.data.type='npc';invalid.records.push({...invalid.records[0],id:'ACTOR-TEST-001'});
  assert.match(validatePackage(invalid).join(' '),/duplicate ID/);
});
