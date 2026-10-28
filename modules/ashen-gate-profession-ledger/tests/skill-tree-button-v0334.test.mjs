// 0.33.4: Open skill tree… on a profession card. (Header from card-header-v0261.) Mocked Foundry: markup and handler only.
// 0.26.1: profession card header markup (name + one nowrap badge group). Mocked Foundry: markup only; the layout itself
// was checked in Chromium at 220/300/420px card widths, Compact and Comfortable.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
const hooks={},values={partyRoster:['a'],playerAccessEnabled:true,libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]}};
let moduleApi=null;const opened=[],errs=[];let trees={active:true,api:{open:o=>opened.push(o),listTreesForProfession:ref=>ref==='PROF-TEST-GEM'?[{id:'TREE-GEM'}]:[]}};
const gm={id:'gm',isGM:true,name:'GM',active:true},player={id:'u1',isGM:false,name:'Player',active:true};
const prof={id:'p1',name:'[TEST] Gemcutting — Profession',type:'feat',system:{quantity:1,description:{value:''}},
  flags:{'ashen-gate-manager':{source:{sourceId:'PROF-TEST-GEM',entityType:'Profession',visibility:'player',status:'draft',version:'0.1.0',refs:[],
    definition:{id:'PROF-TEST-GEM',entity_type:'Profession',name:'[TEST] Gemcutting'}}}}};
const actor={id:'a',name:'[TEST] Alpha',type:'character',hasPlayerOwner:true,items:[prof],flags:{},testUserPermission:()=>true};
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
class FakeApp{constructor(options={}){this.options=options;}async _prepareContext(){return {};}render(){return this;}async close(){return this;}}
globalThis.document={documentElement:{dataset:{}}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApp,HandlebarsApplicationMixin:x=>x,DialogV2:{}}},utils:{escapeHTML:esc}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:()=>{}};
globalThis.ui={notifications:{info:()=>{},error:e=>errs.push(String(e))}};
const moduleObj={get api(){return moduleApi},set api(v){moduleApi=v},active:true,version:'0.37.5'};
globalThis.game={user:gm,users:{contents:[gm,player]},actors:{contents:[actor],get:id=>id==='a'?actor:null},items:{contents:[]},
  modules:{get:id=>id==='ashen-gate-profession-ledger'?moduleObj:id==='ashen-gate-skill-trees'?trees:undefined},
  settings:{register:()=>{},registerMenu:()=>{},get:(id,key)=>values[key],set:async(id,key,v)=>{values[key]=v;}}};
const {_test}=await import(pathToFileURL(path.resolve(here,'../scripts/main.js')));hooks.init();hooks.ready();
const sheet=()=>{const target={innerHTML:'',dataset:{},matches:()=>true,addEventListener(){},querySelectorAll:()=>[],querySelector:()=>null};
  _test.renderSheetTab({tabContentsElement:target,app:{actor}});return target.innerHTML;};
const btn=(id='PROF-TEST-GEM',a='a')=>({dataset:{action:'skilltree',id,actor:a}});
const reset=()=>{opened.length=0;errs.length=0;game.user=gm;actor.testUserPermission=()=>true;trees={active:true,api:{open:o=>opened.push(o),listTreesForProfession:ref=>ref==='PROF-TEST-GEM'?[{id:'TREE-GEM'}]:[]}};};
test('skill tree button renders for a held profession when Skill Trees is active',()=>{
  reset();const h=sheet();
  assert.match(h,/<button type="button" class="ag-btn ag-btn--sm" data-action="skilltree" data-id="PROF-TEST-GEM" data-actor="a"><i [^>]*><\/i> Open skill tree…<\/button>/);
});
test('skill tree button is absent when Skill Trees is missing, inactive or has no open API',()=>{
  reset();trees=undefined;assert.ok(!sheet().includes('data-action="skilltree"'));
  trees={active:false,api:{open(){}}};assert.ok(!sheet().includes('data-action="skilltree"'));
  trees={active:true,api:{}};assert.ok(!sheet().includes('data-action="skilltree"'));
  reset();
});
test('skill tree button is hidden from a user who does not own the character, and the handler refuses them too',()=>{
  reset();game.user=player;actor.testUserPermission=()=>false;
  assert.ok(!sheet().includes('data-action="skilltree"'));
  assert.equal(_test.skillTreeClick(btn()),true);
  assert.equal(opened.length,0,'nothing opened');assert.match(errs.join(),/your own character/);
  reset();
});
test('owner player may open; the call carries actorId and the tree id; unheld profession is refused',()=>{
  reset();game.user=player;actor.testUserPermission=(u,r)=>r==='OWNER';
  assert.ok(sheet().includes('data-action="skilltree"'));
  _test.skillTreeClick(btn());
  assert.deepEqual(opened,[{actorId:'a',treeId:'TREE-GEM'}]);
  _test.skillTreeClick(btn('PROF-TEST-OTHER'));assert.equal(opened.length,1);assert.match(errs.join(),/doesn’t have this profession/);
  assert.equal(_test.skillTreeClick({dataset:{action:'other'}}),false);
  reset();
});
test('GM may open it for any character; a missing Skill Trees API says so instead of throwing',()=>{
  reset();actor.testUserPermission=()=>false;
  _test.skillTreeClick(btn());assert.equal(opened.length,1);
  trees=undefined;assert.doesNotThrow(()=>_test.skillTreeClick(btn()));assert.match(errs.join(),/Skill Trees is not enabled/);
  reset();
});
