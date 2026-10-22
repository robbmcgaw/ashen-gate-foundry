/** 0.44.1: a file chosen (or any Import option changed) while an import is running is ignored; the import always finishes or fails cleanly.
 *  Mocked Foundry: proves the handler logic, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const managerId='ashen-gate-manager';
const packagePath=fileURLToPath(new URL('../../../test-fixtures/professions/AG_Professions_PinnedChain_v0.1.1_ManagerImport.json',import.meta.url));

function collection(){
  const contents=[];
  return {contents,get(id){return contents.find(x=>x.id===id);},values(){return contents.values();},filter(fn){return contents.filter(fn);}};
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
function installMockFoundry(){
  const instances=[];let nextId=0;
  const collections={items:collection(),journal:collection(),actors:collection(),tables:collection(),macros:collection(),folders:collection()};
  const callbacks={once:new Map(),on:new Map()};
  const actionElements=['preview','select','apply'].map(agAction=>({dataset:{agAction},listeners:{},addEventListener(type,listener){this.listeners[type]=listener;}}));
  // 0.46.0: the Import picker is the kit fileButton (.ag-file); the Development profile is the one drafts control.
  const fileInput={files:[],value:'',listeners:{},addEventListener(type,listener){this.listeners[type]=listener;}};
  const fileButton={disabled:false,listeners:{},addEventListener(type,listener){this.listeners[type]=listener;}};
  const fileWrap={dataset:{agFileKind:'import'},querySelector(selector){return selector==='[data-ag-file-button]'?fileButton:selector==='input[type="file"]'?fileInput:null;}};
  const draftToggle={value:'session-safe',listeners:{},addEventListener(type,listener){this.listeners[type]=listener;}};
  const root={style:{setProperty(){}},dataset:{},classList:{add(){},remove(){},contains(){return false;}},
    querySelector(selector){if(selector==='[data-ag-profile]')return draftToggle;return null;},
    querySelectorAll(selector){return selector==='[data-ag-action]'?actionElements:selector==='.ag-file'?[fileWrap]:[];}};
  class ApplicationV2{constructor(){instances.push(this);this.element=root;}async render(){return this;}async _onRender(){}}
  const byType={Item:collections.items,JournalEntry:collections.journal,Actor:collections.actors,RollTable:collections.tables,Macro:collections.macros};
  for(const [type,target] of Object.entries(byType))globalThis[type]={create:async data=>{const doc=makeDocument(type,data,++nextId);target.contents.push(doc);return doc;}};
  globalThis.Folder={create:async data=>{const doc={...structuredClone(data),id:`agfolder${collections.folders.contents.length+1}`};collections.folders.contents.push(doc);return doc;}};
  const settings=new Map();
  const managerModule={id:managerId,api:null};
  globalThis.game={user:{isGM:true,id:'v441-gm'},world:{id:'v441-mock'},modules:new Map([[managerId,managerModule]]),...collections,
    settings:{menus:new Map(),register(){},registerMenu(_namespace,key,value){this.menus.set(key,value);},get(_namespace,key){return settings.get(key);},async set(_namespace,key,value){settings.set(key,structuredClone(value));}},packs:new Map()};
  globalThis.Hooks={on:(name,fn)=>callbacks.on.set(name,fn),off(){},once:(name,fn)=>callbacks.once.set(name,fn)};
  globalThis.foundry={applications:{api:{ApplicationV2,HandlebarsApplicationMixin:Base=>class extends Base{},DialogV2:{confirm:async()=>true}}},
    utils:{deepClone:structuredClone,randomID:()=>`ag-r${++nextId}`}};
  globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{NONE:0}};
  globalThis.ui={notifications:{info(){},error(message){throw new Error(message);}}};
  globalThis.fetch=async()=>({ok:true,status:200});
  return {callbacks,collections,instances,managerModule,actionElements,fileInput,draftToggle,settings};
}
/** Picks a file through the kit file button's hidden input, like a GM choosing one. */
async function pick(runtime,file){runtime.fileInput.files=[file];runtime.fileInput.value=file.name;await runtime.fileInput.listeners.change();}
async function waitFor(predicate,message){
  for(let attempt=0;attempt<100;attempt++){
    if(predicate())return;
    await new Promise(resolve=>setTimeout(resolve,5));
  }
  assert.fail(message);
}


// The Item.create gate lets the test hold the import part way through its writes.
function holdItemCreates(){
  const real=globalThis.Item.create;let release;const gate=new Promise(r=>{release=r;});let calls=0;
  globalThis.Item.create=async data=>{if(++calls===2)await gate;return real(data);};
  return {release,calls:()=>calls};
}
async function loadedApp(){
  const runtime=installMockFoundry();
  await import(`../scripts/main.js?v441=${Date.now()}${Math.random()}`);
  runtime.callbacks.once.get('init')?.();
  runtime.callbacks.once.get('ready')?.();
  await runtime.managerModule.api.open();
  const app=runtime.instances.at(-1);
  await app._onRender({},{});
  runtime.draftToggle.value='development';
  await runtime.draftToggle.listeners.change({target:runtime.draftToggle});
  const text=fs.readFileSync(packagePath,'utf8');
  const file={name:path.basename(packagePath),size:Buffer.byteLength(text),text:async()=>text};
  await pick(runtime,file);
  assert.deepEqual(app.errors,[]);
  await runtime.actionElements.find(el=>el.dataset.agAction==='select').listeners.click({preventDefault(){}});
  await waitFor(()=>app.selected.size===9,'select did not pick all records');
  return {runtime,app,file};
}

test('0.44.1: choosing a file (another one, or the same name again) while an import runs is ignored and the import finishes',async()=>{
  const {runtime,app,file}=await loadedApp();
  const hold=holdItemCreates();
  const pkg=app.pkg,preview=app.preview,selected=[...app.selected];
  void runtime.actionElements.find(el=>el.dataset.agAction==='apply').listeners.click({preventDefault(){}});
  await waitFor(()=>hold.calls()===2,'import did not reach its second write');
  assert.equal(app.busy,true);
  const other={name:'AG_Other_Import.json',size:20,text:async()=>'{"records":[]}'};
  await pick(runtime,other);
  assert.equal(runtime.fileInput.value,'','the picker is reset so the same file can be chosen again later');
  await pick(runtime,file);
  await runtime.draftToggle.listeners.change({target:{value:'session-safe'}});
  assert.equal(app.pkg,pkg,'loaded package kept');assert.equal(app.preview,preview,'preview kept');
  assert.deepEqual([...app.selected],selected,'selection kept');assert.equal(app.includeDrafts,true,'drafts toggle ignored while busy');
  hold.release();
  await waitFor(()=>runtime.settings.has('importHistory')&&!app.busy,'import did not finish');
  const results=runtime.settings.get('importHistory').at(-1).results;
  assert.equal(results.some(r=>r.action==='import-aborted'),false,JSON.stringify(results.filter(r=>r.status==='error')));
  assert.deepEqual(results.filter(r=>r.status==='error'),[]);
  assert.equal(results.filter(r=>r.action==='create'&&r.status==='ok').length,9);
  assert.doesNotMatch(app.message,/aborted/i);
  // After the import, choosing a file works again.
  await pick(runtime,file);
  assert.equal(app.busy,false);assert.ok(app.pkg&&app.pkg!==pkg,'a new load replaces the package once the import is done');
});

test('0.44.1: every Import control that reloads or re-previews is guarded by busy and disabled in the template',()=>{
  const main=fs.readFileSync(new URL('../scripts/main.js',import.meta.url),'utf8');
  // 0.46.0: the file picker is the kit fileButton (disabled while busy, and #importFile checks busy); drafts follow the profile.
  assert.match(main,/import: fileButton\(\{[^)]*disabled:this\.busy/);
  assert.match(main,/async #importFile\(f\) \{[\s\S]{0,200}if \(!f \|\| this\.busy\) return;/);
  assert.doesNotMatch(main,/\[data-ag-drafts\]/);
  for(const sel of ['data-ag-upload-assets','data-ag-profile','data-ag-update-existing','data-ag-update-actors','data-ag-zip-pick','data-ag-select']){
    const at=main.indexOf(`[${sel}]`);assert.ok(at>0,sel);
    assert.match(main.slice(at,at+320),/this\.busy/,`${sel} handler checks busy`);
  }
  const hbs=fs.readFileSync(new URL('../templates/manager.hbs',import.meta.url),'utf8');
  for(const sel of ['data-ag-upload-assets','data-ag-profile','data-ag-update-existing','data-ag-update-actors','data-ag-zip-pick','data-ag-select']){
    for(const line of hbs.split('\n').filter(l=>l.includes(`${sel} `)||l.includes(`${sel}=`)||l.includes(`${sel}>`)))
      assert.match(line,/\{\{#if (@root\.)?busy\}\}disabled/,`${sel} is disabled while busy`);
  }
});
