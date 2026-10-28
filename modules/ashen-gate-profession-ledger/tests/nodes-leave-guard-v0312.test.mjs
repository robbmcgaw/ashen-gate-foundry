// 0.31.2: leaving Gathering nodes by a tab or sub-tab asks about an edited node and an unapplied import preview, and
// notifications escape names. Mocked Foundry: logic and markup only, not the live UI.
import assert from 'node:assert/strict';
import test from 'node:test';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
const hooks={},infos=[],errors=[],prompts=[];let api,answer=false;
const values={partyRoster:['a1'],playerAccessEnabled:true,libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]},checkMapping:{}};
const gm={id:'gm',isGM:true,name:'GM',active:true};
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
class FakeApp{constructor(o={}){this.options=o;}async _prepareContext(){return {};}render(){this.rendered=true;return this;}async close(){return this;}}
globalThis.document={documentElement:{dataset:{}}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApp,HandlebarsApplicationMixin:c=>c,
  DialogV2:{wait:async o=>{prompts.push(o);const b=o.buttons?.find(x=>x.action===(answer?'confirm':'cancel'));return b?.callback?.()??answer;},prompt:async()=>{}}}},utils:{escapeHTML:esc,randomID:()=>`id${Math.random().toString(36).slice(2,10)}`}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:()=>{}};
globalThis.ui={notifications:{info:m=>infos.push(String(m)),error:m=>errors.push(String(m)),warn:()=>{}}};
const journal={id:'j1',flags:{'ashen-gate-profession-ledger':{role:'gm-data'}},getFlag(m,k){return this.flags[m]?.[k];},async update(u){for(const [k,v] of Object.entries(u)){const [,m,key]=k.split('.');this.flags[m]??={};this.flags[m][key]=v;}}};
const actor={id:'a1',name:'[TEST] Alpha',type:'character',hasPlayerOwner:true,items:[],flags:{},testUserPermission:()=>true};
actor.items.get=()=>undefined;
const moduleObj={get api(){return api},set api(v){api=v},active:true,version:'0.37.11'};
globalThis.game={user:gm,users:{contents:[gm],get:()=>gm,get activeGM(){return gm;}},items:{contents:[]},journal:[journal],actors:{contents:[actor],get:()=>actor},socket:{emit:()=>{},on:()=>{}},
  modules:{get:id=>id==='ashen-gate-profession-ledger'?moduleObj:undefined},settings:{register:()=>{},registerMenu:()=>{},get:(m,k)=>values[k],set:async(m,k,v)=>{values[k]=v;}}};
await import(pathToFileURL(path.resolve(here,'../scripts/main.js')));hooks.init();hooks.ready();
const app=api.open({view:'nodes'});app.element={querySelectorAll:()=>[],querySelector:()=>null};
const reset=()=>{app.view='nodes';app.nodeDraft=null;app.nodeImport=null;app.nodeGuard.markClean();prompts.length=0;answer=false;infos.length=0;errors.length=0;};
const draft={isNew:true,errors:[],data:{id:'',name:'[TEST] Reeds',activity:'herbalism',professions:[],tierMin:'1',tierMax:'1',checkSkill:'',checkTool:'',dc:'',dcVisible:false,finite:true,note:'',common:[],rare:[],exotic:[]}};
const importPlan=()=>({ok:true,errors:[],warnings:[],add:[{id:'NODE-TEST-A',name:'[TEST] A'}],update:[],keep:[],unchanged:[],retired:[]});

for(const [label,go] of [['a top-level tab',()=>app._click('tab','party')],['a Gathering sub-tab',()=>app._click('gather-tab','start')]]){
  test(`edited node + ${label}: asks first; Keep editing changes nothing`,async()=>{
    reset();app.nodeDraft=structuredClone(draft);app.nodeGuard.markDirty();
    await go();
    assert.equal(prompts.length,1);assert.match(prompts[0].window.title,/Discard unsaved changes\?/);
    assert.equal(app.view,'nodes');assert.ok(app.nodeDraft,'the draft is kept');assert.equal(app.nodeGuard.dirty,true);
  });
  test(`edited node + ${label}: Discard changes leaves and drops the draft`,async()=>{
    reset();app.nodeDraft=structuredClone(draft);app.nodeGuard.markDirty();answer=true;
    await go();
    assert.notEqual(app.view,'nodes');assert.equal(app.nodeDraft,null);assert.equal(app.nodeGuard.dirty,false);
  });
  test(`unapplied import preview + ${label}: asks first`,async()=>{
    reset();app.nodeImport={fileName:'x.json',data:{},plan:importPlan()};
    await go();
    assert.equal(prompts.length,1);assert.match(prompts[0].window.title,/Discard this import preview\?/);
    assert.equal(app.view,'nodes');assert.ok(app.nodeImport);
    answer=true;await go();
    assert.notEqual(app.view,'nodes');assert.equal(app.nodeImport,null);
  });
  test(`clean editor or nothing pending + ${label}: no question`,async()=>{
    reset();app.nodeDraft=structuredClone(draft);
    await go();
    assert.equal(prompts.length,0);assert.notEqual(app.view,'nodes');
    reset();await go();assert.equal(prompts.length,0);assert.notEqual(app.view,'nodes');
  });
}

for(const [label,go] of [['a top-level tab',()=>app._click('tab','party')],['a Gathering sub-tab',()=>app._click('gather-tab','start')]]){
  test(`0.31.3: edited node AND import preview + ${label}: one question; Keep leaves both untouched`,async()=>{
    reset();app.nodeDraft=structuredClone(draft);app.nodeGuard.markDirty();app.nodeImport={fileName:'x.json',data:{},plan:importPlan()};
    await go();
    assert.equal(prompts.length,1,'asked once, not twice');assert.match(prompts[0].window.title,/Discard unsaved changes\?/);
    assert.equal(app.view,'nodes');assert.ok(app.nodeDraft,'the draft is still there');assert.ok(app.nodeImport,'the preview is still there');assert.equal(app.nodeGuard.dirty,true);
    answer=true;await go();
    assert.equal(prompts.length,2);assert.notEqual(app.view,'nodes');assert.equal(app.nodeDraft,null);assert.equal(app.nodeImport,null);assert.equal(app.nodeGuard.dirty,false);
  });
}

test('moving between Gathering sub-tabs and into the nodes never asks',async()=>{
  reset();app.view='gathering';
  await app._click('gather-tab','nodes');assert.equal(app.view,'nodes');
  await app._click('tab','nodes');assert.equal(prompts.length,0);
});

test('notifications escape names',async()=>{
  reset();
  const saved=Object.getOwnPropertyDescriptor(game.actors,'contents');
  Object.defineProperty(game.actors,'contents',{configurable:true,get(){throw Error('<img src=x onerror=1> "Mal" failed');}});
  try{await app._click('open-individual','a1');}finally{Object.defineProperty(game.actors,'contents',saved);}
  assert.ok(errors.length>=1);assert.ok(errors.every(e=>!/<img/.test(e)),errors.join('|'));assert.match(errors[0],/&lt;img src=x onerror=1&gt;/);
});
