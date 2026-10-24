import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {compilePackage} from '../scripts/workflows.js';
import {canonicalDefinition} from '../scripts/source-projection.mjs';
import {assertNoMachineText} from '../../../scripts/test-helpers/no-ids.mjs';

const managerId='ashen-gate-manager';
const fixturePath=fileURLToPath(new URL('../../../test-fixtures/professions/AG_WORK_0002_Material_Recipe_Item.json',import.meta.url));
const packagePath=fileURLToPath(new URL('../../../test-fixtures/professions/AG_Professions_PinnedChain_v0.1.1_ManagerImport.json',import.meta.url));
const managerManifestPath=fileURLToPath(new URL('../module.json',import.meta.url));
const ledgerManifestPath=fileURLToPath(new URL('../../ashen-gate-profession-ledger/module.json',import.meta.url));
const ledgerLookupUrl=new URL('../../ashen-gate-profession-ledger/scripts/definition-lookup.mjs',import.meta.url);

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
  // 0.46.0: the Import file picker is the kit fileButton (.ag-file wrapper) and the Development profile includes drafts.
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
  globalThis.game={user:{isGM:true,id:'ag-work-0002-gm'},world:{id:'ag-work-0002-mock'},modules:new Map([[managerId,managerModule]]),...collections,
    settings:{menus:new Map(),register(){},registerMenu(_namespace,key,value){this.menus.set(key,value);},get(_namespace,key){return settings.get(key);},async set(_namespace,key,value){settings.set(key,structuredClone(value));}},packs:new Map()};
  globalThis.Hooks={on:(name,fn)=>callbacks.on.set(name,fn),off(){},once:(name,fn)=>callbacks.once.set(name,fn)};
  globalThis.foundry={applications:{api:{ApplicationV2,HandlebarsApplicationMixin:Base=>class extends Base{},DialogV2:{confirm:async()=>true}}},
    utils:{deepClone:structuredClone,randomID:()=>`ag-r${++nextId}`}};
  globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{NONE:0}};
  globalThis.ui={notifications:{info(){},error(message){throw new Error(message);}}};
  globalThis.fetch=async()=>({ok:true,status:200});
  return {callbacks,collections,instances,managerModule,actionElements,fileInput,draftToggle,settings};
}
async function waitFor(predicate,message){
  for(let attempt=0;attempt<100;attempt++){
    if(predicate())return;
    await new Promise(resolve=>setTimeout(resolve,5));
  }
  assert.fail(message);
}

test('AG-WORK-0002 pinned source survives Manager import and Ledger read-only lookup',async()=>{
  const managerManifest=JSON.parse(fs.readFileSync(managerManifestPath,'utf8'));
  const ledgerManifest=JSON.parse(fs.readFileSync(ledgerManifestPath,'utf8'));
  assert.match(managerManifest.version,/^\d+\.\d+\.\d+$/);
  assert.match(ledgerManifest.version,/^\d+\.\d+\.\d+$/);
  const sourcePackage=JSON.parse(fs.readFileSync(packagePath,'utf8'));
  const fixture=JSON.parse(fs.readFileSync(fixturePath,'utf8'));
  assert.equal(sourcePackage.manifest.version,'0.1.1');
  const runtime=installMockFoundry();
  await import(`../scripts/main.js?ag-work-0002=${Date.now()}`);
  runtime.callbacks.once.get('init')?.();
  runtime.callbacks.once.get('ready')?.();
  assert.equal(runtime.managerModule.api?.definitions?.contract,'ag-definition-resolver/0.1-prototype');
  await runtime.managerModule.api.open();
  const app=runtime.instances.at(-1);
  await app._onRender({},{});
  runtime.draftToggle.value='development';
  await runtime.draftToggle.listeners.change({target:runtime.draftToggle});

  const projectionFile={name:path.basename(packagePath),size:Buffer.byteLength(JSON.stringify(sourcePackage)),text:async()=>JSON.stringify(sourcePackage)};
  runtime.fileInput.files=[projectionFile];
  await runtime.fileInput.listeners.change();
  assert.deepEqual(app.errors,[],`Manager validation errors: ${app.errors.join('; ')}`);
  assert.equal(app.preview.length,9);
  await runtime.actionElements.find(element=>element.dataset.agAction==='select').listeners.click({preventDefault(){}});
  await new Promise(resolve=>setTimeout(resolve,25));
  await waitFor(()=>app.selected.size===9,'Manager Select action did not select all eligible records.');
  await runtime.actionElements.find(element=>element.dataset.agAction==='apply').listeners.click({preventDefault(){}});
  await waitFor(()=>runtime.settings.has('importHistory'),'Manager Apply did not write import history.');

  const history=runtime.settings.get('importHistory').at(-1);
  const errors=history.results.filter(row=>row.status==='error');
  assert.deepEqual(errors,[],`Manager import errors: ${JSON.stringify(errors)}`);
  assert.equal(history.results.filter(row=>row.action==='create'&&row.status==='ok').length,9);
  assert.equal(history.results.filter(row=>row.action==='uuid-bind'&&row.status==='ok').reduce((sum,row)=>sum+(row.bindings??0),0),16);

  const documents=Object.values(runtime.collections).filter(value=>value?.contents).flatMap(value=>value.contents)
    .filter(document=>document?.getFlag?.(managerId,'source'));
  assert.equal(documents.length,9);
  const sourceById=new Map(app.pkg.records.map(record=>[record.id,record]));
  for(const record of app.pkg.records){
    const document=documents.find(candidate=>candidate.getFlag(managerId,'source')?.sourceId===record.id);
    assert.ok(document,`Imported native document missing ${record.id}`);
    const source=document.getFlag(managerId,'source');
    assert.equal(source.sourceId,record.id,`${record.id} canonical ID`);
    assert.equal(source.entityType,record.entity_type,`${record.id} logical entity type`);
    assert.deepEqual(source.definition,canonicalDefinition(record),`${record.id} structured canonical definition`);
    assert.deepEqual(source.refs,record.refs,`${record.id} typed source refs`);
    assert.deepEqual(source.provenance,record.provenance,`${record.id} provenance`);
    assert.deepEqual(source.unresolvedRequiredRefs,[],`${record.id} unresolved required refs`);
    assert.deepEqual(source.unresolvedOptionalRefs,[],`${record.id} unresolved optional refs`);
    assert.equal(document.type,record.foundry.data.type,`${record.id} Foundry Item subtype`);
    for(const binding of source.resolvedUuidRefs){
      assert.ok(documents.some(candidate=>candidate.uuid===binding.uuid),`${record.id} stale UUID binding ${binding.uuid}`);
    }
  }

  for(const expected of fixture.records){
    assert.ok(sourceById.has(expected.id),`Pinned projection omitted fixture record ${expected.id}`);
    const document=documents.find(candidate=>candidate.getFlag(managerId,'source')?.sourceId===expected.id);
    assert.deepEqual(document.getFlag(managerId,'source').definition,expected,`Pinned fixture data changed for ${expected.id}`);
  }
  assert.ok(fixture.records.every(record=>record.refs.every(ref=>ref.mode==='required')),
    'Pinned three-record source fixture is expected to contain only required refs.');

  // Invoke the exact read-only lookup helper shipped with Ledger v0.6.1.
  const {readWorldDefinition}=await import(ledgerLookupUrl.href);
  const ledgerIds=['MAT-HERBALISM-APPRENTICE-COMMON','REC-ALCHEMY-FIELD-MEDIC-S-SALVE',
    'ITEM-ALCHEMY-FIELD-MEDIC-S-SALVE','PROF-ALCHEMY','PROF-HERBALISM'];
  for(const id of ledgerIds){
    const result=readWorldDefinition(game,id,{viewer:game.user});
    assert.equal(result.status,'ok',`Ledger v0.6.1 lookup failed for ${id}: ${result.status}`);
    assert.deepEqual(result.definition,canonicalDefinition(sourceById.get(id)),`Ledger returned altered definition ${id}`);
  }
});

test('0.54.2: import writes no References list into descriptions; re-import removes a legacy one only from unedited documents',async()=>{
  const sourcePackage=JSON.parse(fs.readFileSync(packagePath,'utf8'));
  const runtime=installMockFoundry();
  globalThis.foundry.utils.saveDataToFile=()=>{};
  await import(`../scripts/main.js?ag-no-refs=${Date.now()}`);
  runtime.callbacks.once.get('init')?.();
  runtime.callbacks.once.get('ready')?.();
  await runtime.managerModule.api.open();
  const app=runtime.instances.at(-1);
  await app._onRender({},{});
  runtime.draftToggle.value='development';
  await runtime.draftToggle.listeners.change({target:runtime.draftToggle});
  const load=async()=>{
    runtime.fileInput.files=[{name:path.basename(packagePath),size:Buffer.byteLength(JSON.stringify(sourcePackage)),text:async()=>JSON.stringify(sourcePackage)}];
    await runtime.fileInput.listeners.change();
    await runtime.actionElements.find(e=>e.dataset.agAction==='select').listeners.click({preventDefault(){}});
    await new Promise(r=>setTimeout(r,25));
  };
  const apply=async n=>{
    await runtime.actionElements.find(e=>e.dataset.agAction==='apply').listeners.click({preventDefault(){}});
    await waitFor(()=>(runtime.settings.get('importHistory')?.length??0)>=n,'import did not finish');
  };
  await load();await apply(1);
  const items=()=>runtime.collections.items.contents.filter(d=>d.getFlag(managerId,'source')&&d.get('system.description.value')!==undefined);
  assert.ok(items().length>0);
  for(const d of items()){
    const html=d.get('system.description.value');
    assert.ok(!/ag-managed-links/.test(html),`${d.name}: no References section is written`);
    assertNoMachineText(html,`description of ${d.name}`);
  }
  // Simulate worlds imported before 0.54.2: a legacy section in an unedited document, and in an edited one.
  const block='\n<section class="ag-managed-links" data-ag-managed-links="1"><h4>References</h4><ul><li><span>also_available_as_journal:</span> @UUID[Item.X]{ITEM-HANDOUT-A}</li></ul></section>';
  const [clean,edited]=items();
  for(const d of [clean,edited]){
    const legacy=d.get('system.description.value')+block;
    await d.update({'system.description.value':legacy});
    const flag=d.getFlag(managerId,'source');
    await d.setFlag(managerId,'source',{...flag,managedFields:{...flag.managedFields,'system.description.value':legacy}});
  }
  const editedText=edited.get('system.description.value')+'<p>GM note.</p>';
  await edited.update({'system.description.value':editedText});
  await load();await apply(2);
  assert.ok(!/ag-managed-links/.test(clean.get('system.description.value')),'unedited document is cleaned');
  assert.equal(edited.get('system.description.value'),editedText,'edited document is left alone');
  await load();await apply(3);
  assert.equal(edited.get('system.description.value'),editedText,'still untouched on a further re-import');
});

test('0.60.3: a data-ag-ref cell becomes a content link, re-import is idempotent, unmarked refs append nothing, edits are kept', async () => {
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const rec = id => pkg.records.find(r => r.id === id);
  const add = (id, html) => { rec(id).foundry.data.system.description.value += html; };
  add('ITEM-ALCHEMY-FIELD-MEDIC-S-SALVE', '<table><tr><th>Recipe</th><td data-ag-ref="created_by">Field Medic\'s Salve recipe</td></tr></table>');
  add('MAT-HERBALISM-APPRENTICE-COMMON', '<table><tr><th>Gathered by</th><td data-ag-ref="gathered_by">Herbalism</td></tr></table>');
  const runtime = installMockFoundry();
  globalThis.foundry.utils.saveDataToFile = () => {};
  await import(`../scripts/main.js?ag-ref-cells=${Date.now()}`);
  runtime.callbacks.once.get('init')?.();
  runtime.callbacks.once.get('ready')?.();
  await runtime.managerModule.api.open();
  const app = runtime.instances.at(-1);
  await app._onRender({}, {});
  runtime.draftToggle.value = 'development';
  await runtime.draftToggle.listeners.change({ target: runtime.draftToggle });
  const load = async () => {
    runtime.fileInput.files = [{ name: 'p.json', size: 1, text: async () => JSON.stringify(pkg) }];
    await runtime.fileInput.listeners.change();
    await runtime.actionElements.find(e => e.dataset.agAction === 'select').listeners.click({ preventDefault() {} });
    await new Promise(r => setTimeout(r, 25));
  };
  const apply = async n => {
    await runtime.actionElements.find(e => e.dataset.agAction === 'apply').listeners.click({ preventDefault() {} });
    await waitFor(() => (runtime.settings.get('importHistory')?.length ?? 0) >= n, 'import did not finish');
  };
  const byId = id => runtime.collections.items.contents.find(d => d.getFlag(managerId, 'source')?.sourceId === id);
  const desc = id => byId(id).get('system.description.value');
  await load(); await apply(1);
  const recipe = byId('REC-ALCHEMY-FIELD-MEDIC-S-SALVE'), prof = byId('PROF-HERBALISM');
  assert.ok(desc('ITEM-ALCHEMY-FIELD-MEDIC-S-SALVE').includes(`<td data-ag-ref="created_by">@UUID[${recipe.uuid}]{Field Medic's Salve recipe}</td>`));
  assert.ok(desc('MAT-HERBALISM-APPRENTICE-COMMON').includes(`<td data-ag-ref="gathered_by">@UUID[${prof.uuid}]{Herbalism}</td>`));
  // A record with refs but no marker gets nothing appended.
  assert.ok(!desc('ITEM-ALCHEMY-VEILSMOKE-PHIAL').includes('data-ag-ref'));
  for (const id of ['ITEM-ALCHEMY-FIELD-MEDIC-S-SALVE', 'MAT-HERBALISM-APPRENTICE-COMMON', 'ITEM-ALCHEMY-VEILSMOKE-PHIAL']) {
    assert.ok(!/ag-managed-links/.test(desc(id)));
    assertNoMachineText(desc(id).replace(/@UUID\[[^\]]*\]/g, ''), `description of ${id}`);
  }
  // Idempotent: the same description after another import.
  const first = desc('ITEM-ALCHEMY-FIELD-MEDIC-S-SALVE');
  await load(); await apply(2);
  assert.equal(desc('ITEM-ALCHEMY-FIELD-MEDIC-S-SALVE'), first);
  assert.equal((desc('ITEM-ALCHEMY-FIELD-MEDIC-S-SALVE').match(/@UUID/g) ?? []).length, (first.match(/@UUID/g) ?? []).length);
  // An edited description is not touched.
  const item = byId('MAT-HERBALISM-APPRENTICE-COMMON');
  const edited = desc('MAT-HERBALISM-APPRENTICE-COMMON') + '<p>GM note.</p>';
  await item.update({ 'system.description.value': edited });
  await load(); await apply(3);
  assert.equal(desc('MAT-HERBALISM-APPRENTICE-COMMON'), edited);
});
