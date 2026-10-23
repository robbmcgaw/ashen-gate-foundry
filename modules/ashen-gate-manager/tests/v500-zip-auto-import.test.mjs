/** 0.50.0: ZIP "Import everything without stopping". Mocked Foundry (like 0.44.1's import test) and the bundled JSZip:
 *  proves the queue, selection and apply logic, not the live Forge UI. Synthetic [TEST] data only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../scripts/vendor/jszip.min.js';
import {autoSelect, autoFileCounts} from '../scripts/zip-import.js';

const managerId='ashen-gate-manager', questId='ashen-gate-quest-manager';
const JSZip=globalThis.JSZip;
const item=(id,name=`[TEST] ${id}`,extra={})=>({id,entity_type:'Item',status:'approved',version:'0.1.0',visibility:'gm',provenance:{sources:['[TEST] synthetic']},refs:[],name,foundry:{document_type:'Item',data:{name,type:'loot',...extra}}});
const pack=(id,records)=>({manifest:{schema_version:'ag-foundry-import/0.2',package_id:id,version:'0.1.0'},records});
const quests=ids=>({schema_version:'ag-quest-source/0.1',records:ids.map(id=>({id,entity_type:'Objective',name:`[TEST] ${id}`}))});

function collection(){
  const contents=[];
  return {contents,get(id){return contents.find(x=>x.id===id);},values(){return contents.values();},filter(fn){return contents.filter(fn);},find(fn){return contents.find(fn);},some(fn){return contents.some(fn);},map(fn){return contents.map(fn);}};
}
function setPath(object,dottedPath,value){
  const parts=dottedPath.split('.');let current=object;
  for(const part of parts.slice(0,-1))current=current[part]??={};
  current[parts.at(-1)]=structuredClone(value);
}
function makeDocument(documentName,data,index){
  const doc={...structuredClone(data),id:`agmock${index}`,documentName,uuid:`${documentName}.agmock${index}`};
  doc.getFlag=(namespace,key)=>doc.flags?.[namespace]?.[key]??null;
  doc.setFlag=async(namespace,key,value)=>{doc.flags??={};doc.flags[namespace]??={};doc.flags[namespace][key]=structuredClone(value);};
  doc.unsetFlag=async(namespace,key)=>{if(doc.flags?.[namespace])delete doc.flags[namespace][key];};
  doc.get=dottedPath=>dottedPath.split('.').reduce((value,key)=>value?.[key],doc);
  doc.update=async changes=>{for(const [key,value] of Object.entries(changes))setPath(doc,key,value);return doc;};
  doc.toObject=()=>structuredClone(Object.fromEntries(Object.entries(doc).filter(([,value])=>typeof value!=='function')));
  doc.testUserPermission=()=>true;
  return doc;
}
const el=(dataset={})=>({dataset,disabled:false,checked:false,value:'',textContent:'',listeners:{},addEventListener(type,listener){this.listeners[type]=listener;}});

/** Quest Log stand-in: QST-BAD makes its preview fail validation; quests already stored preview as updates (mode update) or kept. */
function questApi(stored){
  const calls=[];
  return {calls,
    previewQuestImport(input,{mode}={}){
      if(input.records.some(r=>r.id==='QST-BAD'))return {errors:['[TEST] quest QST-BAD has no objective text.'],rows:[]};
      return {errors:[],rows:input.records.map(r=>({id:r.id,name:r.name,action:!stored.has(r.id)?'new':mode==='update'?'update':'skip',reason:'Already in Quest Log; kept.'}))};
    },
    async importQuests(input,{mode}={}){
      calls.push({ids:input.records.map(r=>r.id),mode});
      const created=input.records.filter(r=>!stored.has(r.id)).map(r=>r.id), updated=input.records.filter(r=>stored.has(r.id)).map(r=>r.id);
      for(const id of created)stored.add(id);
      return {created,updated};
    }};
}

function installMockFoundry(){
  const instances=[];let nextId=0;
  const collections={items:collection(),journal:collection(),actors:collection(),tables:collection(),macros:collection(),folders:collection()};
  const callbacks={once:new Map(),on:new Map()};
  const actions=Object.fromEntries(['preview','select','apply','zip-start','zip-skip','zip-cancel'].map(a=>[a,el({agAction:a})]));
  const fileInput={files:[],value:'',listeners:{},addEventListener(type,listener){this.listeners[type]=listener;}};
  const fileButton=el();
  const fileWrap={dataset:{agFileKind:'import'},querySelector(selector){return selector==='[data-ag-file-button]'?fileButton:selector==='input[type="file"]'?fileInput:null;}};
  const controls={'[data-ag-profile]':el(),'[data-ag-zip-auto]':el(),'[data-ag-zip-auto-updates]':el(),'[data-ag-zip-stop]':el(),'[data-ag-zip-progress]':el()};
  const root={style:{setProperty(){}},dataset:{},classList:{add(){},remove(){},contains(){return false;}},
    querySelector(selector){return controls[selector]??null;},
    querySelectorAll(selector){return selector==='[data-ag-action]'?Object.values(actions):selector==='.ag-file'?[fileWrap]:[];}};
  class ApplicationV2{constructor(){instances.push(this);this.element=root;}async render(){return this;}async _onRender(){}}
  const byType={Item:collections.items,JournalEntry:collections.journal,Actor:collections.actors,RollTable:collections.tables,Macro:collections.macros};
  for(const [type,target] of Object.entries(byType))globalThis[type]={create:async data=>{const doc=makeDocument(type,data,++nextId);target.contents.push(doc);return doc;}};
  globalThis.Folder={create:async data=>{const doc={...structuredClone(data),id:`agfolder${collections.folders.contents.length+1}`};collections.folders.contents.push(doc);return doc;}};
  const settings=new Map(), downloads=[], dialogs=[];
  const managerModule={id:managerId,api:null};
  const stored=new Set(), quest=questApi(stored);
  globalThis.game={user:{isGM:true,id:'v500-gm'},world:{id:'v500-mock'},
    modules:new Map([[managerId,managerModule],[questId,{id:questId,active:true,api:quest}]]),...collections,
    settings:{menus:new Map(),register(){},registerMenu(_namespace,key,value){this.menus.set(key,value);},get(_namespace,key){return settings.get(key);},async set(_namespace,key,value){settings.set(key,structuredClone(value));}},packs:new Map()};
  globalThis.Hooks={on:(name,fn)=>callbacks.on.set(name,fn),off(){},once:(name,fn)=>callbacks.once.set(name,fn)};
  globalThis.foundry={applications:{api:{ApplicationV2,HandlebarsApplicationMixin:Base=>class extends Base{},DialogV2:{confirm:async options=>{dialogs.push(options.window?.title);return true;}}}},
    utils:{deepClone:structuredClone,randomID:()=>`ag-r${++nextId}`,saveDataToFile:(_content,_type,name)=>downloads.push(name)}};
  globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{NONE:0}};
  globalThis.ui={notifications:{info(){},warn(){},error(){}}};
  globalThis.fetch=async()=>({ok:true,status:200});
  return {callbacks,collections,instances,managerModule,actions,controls,fileInput,settings,downloads,dialogs,stored,quest};
}
async function waitFor(predicate,message){
  for(let attempt=0;attempt<200;attempt++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}
  assert.fail(message);
}
async function zipFile(name,entries){
  const z=new JSZip();
  for(const [file,value] of Object.entries(entries))z.file(file,JSON.stringify(value),{createFolders:false});
  const bytes=await z.generateAsync({type:'uint8array'});
  return {name,size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
}
async function openApp(){
  const runtime=installMockFoundry();
  await import(`../scripts/main.js?v500=${Date.now()}${Math.random()}`);
  runtime.callbacks.once.get('init')?.();
  runtime.callbacks.once.get('ready')?.();
  await runtime.managerModule.api.open();
  const app=runtime.instances.at(-1);
  await app._onRender({},{});
  const click=name=>runtime.actions[name].listeners.click({preventDefault(){}});
  const check=(selector,checked)=>runtime.controls[selector].listeners.change({target:{checked}});
  const pick=async file=>{runtime.fileInput.files=[file];runtime.fileInput.value=file.name;await runtime.fileInput.listeners.change();};
  return {runtime,app,click,check,pick};
}
const history=runtime=>runtime.settings.get('importHistory')??[];
const settled=app=>!app.busy&&!app.zipBundle?.autoRunning;

test('0.50.0 pure: auto mode ticks new records and metadata refreshes; updates and icon fills only with the updates box', () => {
  const rows=[{id:'A',action:'create'},{id:'B',action:'metadata'},{id:'C',action:'update',name:'[TEST] C'},{id:'D',action:'icon',name:'[TEST] D'},
    {id:'E',action:'unchanged'},{id:'F',action:'blocked'},{id:'G',action:'conflict'},{id:'H',action:'skipped',reason:'Unapproved record; enable Include drafts to test.'},{id:'I',action:'local'}];
  const off=autoSelect(rows);
  assert.deepEqual(off.selected,['A','B']);
  // 0.52.2: Blocked and Conflict rows need the GM's decision (listed with their reason), never counted as skipped.
  assert.deepEqual(off.needsDecision.map(r=>r.id),['C','D','F','G']);
  const on=autoSelect(rows,{updates:true});
  assert.deepEqual(on.selected,['A','B','C','D'],'blocked, conflict, excluded and unchanged rows are never ticked');
  assert.deepEqual(on.needsDecision.map(r=>r.id),['F','G']);
  const results=[{id:'A',action:'create',status:'ok'},{id:'B',action:'metadata',status:'ok'}];
  const summary=autoFileCounts(rows,off.selected,results);
  assert.deepEqual(summary.counts,{created:1,updated:0,unchanged:3,needsDecision:4,skipped:1,failed:0});
  assert.equal(summary.toneLabel,'Done with notes');
  assert.equal(autoFileCounts([{id:'A',action:'create'}],['A'],[{id:'A',action:'create',status:'error',message:'x'}]).toneLabel,'Needs attention');
  assert.equal(autoFileCounts([{id:'A',action:'create'}],['A'],[{id:'A',action:'create',status:'ok'}]).toneLabel,'Done');
});

test('0.50.0: auto mode is off for every new ZIP, and the updates box needs it', async () => {
  const {runtime,app,check,pick}=await openApp();
  const zip=await zipFile('[TEST]-bundle.zip',{'main.json':pack('AG-TEST-MAIN',[item('ITEM-TA1')]),'quests.json':quests(['QST-TA1'])});
  await pick(zip);
  assert.equal(app.zipBundle.auto,false);assert.equal(app.zipBundle.autoUpdates,false);
  await check('[data-ag-zip-auto-updates]',true);
  assert.equal(app.zipBundle.autoUpdates,false,'the updates box does nothing while auto mode is off');
  await check('[data-ag-zip-auto]',true);await check('[data-ag-zip-auto-updates]',true);
  assert.equal(app.zipBundle.auto,true);assert.equal(app.zipBundle.autoUpdates,true);
  await check('[data-ag-zip-auto]',false);
  assert.equal(app.zipBundle.autoUpdates,false,'turning auto off also turns the updates box off');
  await check('[data-ag-zip-auto]',true);
  await pick(zip);
  assert.equal(app.zipBundle.auto,false,'a newly chosen ZIP starts with auto mode off');
  assert.equal(runtime.collections.items.contents.length,0,'nothing imported');
  const hbs=fs.readFileSync(new URL('../templates/manager.hbs',import.meta.url),'utf8');
  assert.match(hbs,/data-ag-zip-auto \{\{#if zipBundle\.auto\}\}checked\{\{\/if\}\}/);
  assert.match(hbs,/data-ag-zip-auto-updates[^>]*\{\{#unless zipBundle\.auto\}\}disabled/);
  assert.match(hbs,/role="status" aria-live="polite" data-ag-zip-progress/);
});

test('0.50.0: auto mode with only new records imports every file in order with no confirmation, one history entry per file', async () => {
  const {runtime,app,click,check,pick}=await openApp();
  await pick(await zipFile('[TEST]-new.zip',{'quests.json':quests(['QST-TB1','QST-TB2']),'main.json':pack('AG-TEST-NEW',[item('ITEM-TB1'),item('ITEM-TB2')])}));
  await check('[data-ag-zip-auto]',true);
  await click('zip-start');
  await waitFor(()=>settled(app)&&!app.zipBundle.queue,'auto run did not finish');
  assert.deepEqual(runtime.dialogs,[],'no confirmation dialogs');
  assert.deepEqual(runtime.collections.items.contents.map(d=>d.name).sort(),['[TEST] ITEM-TB1','[TEST] ITEM-TB2']);
  assert.deepEqual([...runtime.stored].sort(),['QST-TB1','QST-TB2']);
  assert.deepEqual(history(runtime).map(h=>h.packageId),['AG-TEST-NEW','Quest Log file'],'Manager package first, then Quest Log');
  const s=app.zipBundle.summary;
  assert.deepEqual(s.get('main.json').counts,{created:2,updated:0,unchanged:0,needsDecision:0,skipped:0,failed:0});
  assert.deepEqual(s.get('quests.json').counts,{created:2,updated:0,unchanged:0,needsDecision:0,skipped:0,failed:0});
  assert.deepEqual(['main.json','quests.json'].map(f=>app.zipBundle.outcome.get(f)),['Done','Done']);
  assert.match(app.message,/ZIP import finished/);
});

test('0.50.0: updates are withheld and listed as needing a decision; with the updates box on they apply after a backup', async () => {
  const {runtime,app,click,check,pick}=await openApp();
  const first=await zipFile('[TEST]-v1.zip',{'main.json':pack('AG-TEST-UPD',[item('ITEM-TC1',undefined,{system:{price:{value:1}}}),item('ITEM-TC2')]),'quests.json':quests(['QST-TC1'])});
  await pick(first);await check('[data-ag-zip-auto]',true);await click('zip-start');
  await waitFor(()=>settled(app)&&!app.zipBundle.queue,'first run did not finish');
  const second=()=>zipFile('[TEST]-v2.zip',{'main.json':pack('AG-TEST-UPD',[item('ITEM-TC1',undefined,{system:{price:{value:5}}}),item('ITEM-TC2'),item('ITEM-TC3')]),'quests.json':quests(['QST-TC1','QST-TC2'])});
  await pick(await second());await check('[data-ag-zip-auto]',true);await click('zip-start');
  await waitFor(()=>settled(app)&&!app.zipBundle.queue,'second run did not finish');
  const priced=()=>runtime.collections.items.contents.find(d=>d.name==='[TEST] ITEM-TC1').system.price.value;
  assert.equal(priced(),1,'the existing Item is not changed');
  assert.equal(runtime.collections.items.contents.length,3,'the new Item is created');
  const main=app.zipBundle.summary.get('main.json');
  assert.deepEqual(main.counts,{created:1,updated:0,unchanged:1,needsDecision:1,skipped:0,failed:0});
  assert.deepEqual(main.needsDecision,['[TEST] ITEM-TC1']);
  assert.equal(app.zipBundle.outcome.get('main.json'),'Done with notes');
  assert.deepEqual(app.zipBundle.summary.get('quests.json').counts,{created:1,updated:0,unchanged:1,needsDecision:0,skipped:0,failed:0},'Quest Log keeps quests it already has');
  assert.equal(runtime.downloads.length,0,'no backup when nothing is updated');
  await pick(await second());await check('[data-ag-zip-auto]',true);await check('[data-ag-zip-auto-updates]',true);await click('zip-start');
  await waitFor(()=>settled(app)&&!app.zipBundle.queue,'third run did not finish');
  assert.equal(priced(),5,'the update is applied');
  assert.deepEqual(app.zipBundle.summary.get('main.json').counts,{created:0,updated:1,unchanged:2,needsDecision:0,skipped:0,failed:0});
  assert.equal(runtime.downloads.filter(n=>/before-import/.test(n)).length,1,'the usual backup downloads before the update');
  assert.deepEqual(runtime.dialogs,[]);
});

test('0.50.0: a file with errors pauses the run; Skip this file goes on with the rest', async () => {
  const {runtime,app,click,check,pick}=await openApp();
  await pick(await zipFile('[TEST]-pause.zip',{'main.json':pack('AG-TEST-P',[item('ITEM-TD1')]),'quests.json':quests(['QST-BAD']),'trees.json':{schema:'ag-skill-trees/0.1',trees:[{id:'TREE-TD1',name:'[TEST] Tree'}]}}));
  await check('[data-ag-zip-auto]',true);await click('zip-start');
  await waitFor(()=>settled(app)&&app.zipBundle.paused,'run did not pause');
  assert.equal(app.zipBundle.paused.filename,'quests.json');
  assert.equal(app.zipBundle.outcome.get('main.json'),'Done');
  assert.equal(app.zipBundle.outcome.get('quests.json'),'Needs attention');
  assert.equal(app.zipBundle.queue.length,1,'the rest waits');
  assert.match(app.message,/Paused at file 2 of 3: quests\.json/);
  assert.equal(app.importReports[0].toneLabel,'Needs attention');
  await click('zip-skip');
  await waitFor(()=>settled(app)&&!app.zipBundle.queue,'run did not finish after Skip');
  assert.equal(app.zipBundle.outcome.get('quests.json'),'Skipped by GM');
  // Skill Trees is not installed here: listed with its reason, no pause.
  assert.equal(app.zipBundle.outcome.get('trees.json'),'Nothing to import');
  assert.match(app.zipBundle.summary.get('trees.json').note,/Skill Trees is not active/);
  assert.equal(runtime.collections.items.contents.length,1);
});

test('0.50.0: Stop ZIP import works while a file is importing and ends the rest after it', async () => {
  const {runtime,app,click,check,pick}=await openApp();
  await pick(await zipFile('[TEST]-stop.zip',{'a.json':pack('AG-TEST-SA',[item('ITEM-TE1'),item('ITEM-TE2')]),'b.json':pack('AG-TEST-SB',[item('ITEM-TE3')]),'quests.json':quests(['QST-TE1'])}));
  await check('[data-ag-zip-auto]',true);
  const real=globalThis.Item.create;let release,calls=0;const gate=new Promise(r=>{release=r;});
  globalThis.Item.create=async data=>{if(++calls===2)await gate;return real(data);};
  void click('zip-start');
  await waitFor(()=>calls===2,'first file did not start writing');
  assert.equal(app.zipBundle.autoRunning,true);
  await click('zip-cancel');
  assert.equal(app.zipBundle.stopRequested,false,'data-ag-action buttons are ignored while it runs');
  runtime.controls['[data-ag-zip-stop]'].listeners.click({preventDefault(){},currentTarget:runtime.controls['[data-ag-zip-stop]']});
  assert.equal(app.zipBundle.stopRequested,true);
  release();
  await waitFor(()=>settled(app)&&!app.zipBundle.queue,'run did not stop');
  assert.equal(app.zipBundle.outcome.get('a.json'),'Done','the file being imported finishes');
  assert.equal(app.zipBundle.outcome.get('b.json'),'Not imported');
  assert.equal(app.zipBundle.outcome.get('quests.json'),'Not imported');
  assert.equal(runtime.collections.items.contents.length,2);assert.equal(runtime.stored.size,0);
  assert.match(app.message,/rest of the ZIP was not imported/);
});

test('0.50.0: with auto mode off the ZIP still stops at each file for the GM to Apply (manual path unchanged)', async () => {
  const {runtime,app,click,pick}=await openApp();
  await pick(await zipFile('[TEST]-manual.zip',{'main.json':pack('AG-TEST-M',[item('ITEM-TF1')]),'quests.json':quests(['QST-TF1'])}));
  await click('zip-start');
  assert.equal(app.zipBundle.current,'main.json');assert.equal(app.zipBundle.outcome.get('main.json'),'In preview');
  assert.equal(app.selected.size,0,'nothing is ticked for the GM');
  assert.equal(runtime.collections.items.contents.length,0);
  await click('select');await click('apply');
  await waitFor(()=>!app.busy&&app.zipBundle.current==='quests.json','Apply did not move on to the next file');
  assert.deepEqual(runtime.dialogs,['Apply this import to the world?'],'the usual confirmation is asked');
  assert.equal(app.selected.size,0,'the next file is not ticked for the GM either');
  await click('select');await click('apply');
  await waitFor(()=>!app.busy&&app.zipBundle.queue===null,'manual run did not finish');
  assert.equal(runtime.dialogs.length,2);
  assert.deepEqual([...app.zipBundle.summary.keys()],[],'no auto summary');
  assert.equal(runtime.collections.items.contents.length,1);assert.equal(runtime.stored.size,1);
  const main=fs.readFileSync(new URL('../scripts/main.js',import.meta.url),'utf8');
  assert.match(main,/const decision = auto \|\| await confirmDialog\(/);
  assert.match(main,/if \(actorUpdates\.length && !auto\)/);
  assert.match(main,/case "apply": \{\n        this\.applyRan=false;\n        await this\.#apply\(\);/);
});

test('0.50.0: a failed apply pauses the run with the file\'s counts; Stop ZIP import then ends the rest', async () => {
  const {runtime,app,check,click,pick}=await openApp();
  await pick(await zipFile('[TEST]-fail.zip',{'main.json':pack('AG-TEST-F',[item('ITEM-TG1'),item('ITEM-TG2')]),'quests.json':quests(['QST-TG1'])}));
  await check('[data-ag-zip-auto]',true);
  const real=globalThis.Item.create;
  globalThis.Item.create=async data=>{if(data.name==='[TEST] ITEM-TG2')throw new Error('[TEST] disk full');return real(data);};
  await click('zip-start');
  await waitFor(()=>settled(app)&&app.zipBundle.paused,'run did not pause on the failed apply');
  assert.deepEqual(app.zipBundle.summary.get('main.json').counts,{created:1,updated:0,unchanged:0,needsDecision:0,skipped:0,failed:1});
  assert.equal(app.zipBundle.outcome.get('main.json'),'Needs attention');
  assert.match(app.message,/1 record\(s\) failed to import/);
  runtime.controls['[data-ag-zip-stop]'].listeners.click({preventDefault(){},currentTarget:runtime.controls['[data-ag-zip-stop]']});
  await waitFor(()=>!app.zipBundle.queue,'Stop did not end the paused run');
  assert.equal(app.zipBundle.outcome.get('quests.json'),'Not imported');
  assert.equal(app.zipBundle.outcome.get('main.json'),'Needs attention','the paused file keeps its result');
  assert.equal(runtime.stored.size,0);
});
