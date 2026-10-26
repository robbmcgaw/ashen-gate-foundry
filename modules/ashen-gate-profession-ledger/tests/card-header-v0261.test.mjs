// 0.26.1: profession card header markup (name + one nowrap badge group). Mocked Foundry: markup only; the layout itself
// was checked in Chromium at 220/300/420px card widths, Compact and Comfortable.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
const hooks={},values={partyRoster:['a'],playerAccessEnabled:true,libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]}};
let moduleApi=null;
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
globalThis.ui={notifications:{info:()=>{},error:()=>{}}};
const moduleObj={get api(){return moduleApi},set api(v){moduleApi=v},active:true,version:'0.33.3'};
globalThis.game={user:gm,users:{contents:[gm,player]},actors:{contents:[actor],get:id=>id==='a'?actor:null},items:{contents:[]},
  modules:{get:id=>id==='ashen-gate-profession-ledger'?moduleObj:undefined},
  settings:{register:()=>{},registerMenu:()=>{},get:(id,key)=>values[key],set:async(id,key,v)=>{values[key]=v;}}};
const {_test}=await import(pathToFileURL(path.resolve(here,'../scripts/main.js')));hooks.init();hooks.ready();
const sheet=()=>{const target={innerHTML:'',dataset:{},matches:()=>true,addEventListener(){},querySelectorAll:()=>[],querySelector:()=>null};
  _test.renderSheetTab({tabContentsElement:target,app:{actor}});return target.innerHTML;};

test('card header: the name carries its full text as a tooltip; Level and Draft sit in one badge group',()=>{
  game.user=gm;
  assert.match(sheet(),/<div class="agl-prof-head"><strong class="agl-prof-name" data-tooltip="\[TEST\] Gemcutting">\[TEST\] Gemcutting<\/strong><span class="agl-prof-badges"><span class="ag-badge ag-badge--ok">Level 1<\/span><span class="ag-badge ag-badge--warn">Draft<\/span><\/span><\/div>/);
});
test('card header: players still see no Draft badge',()=>{
  game.user=player;
  const h=sheet();game.user=gm;
  assert.match(h,/<span class="agl-prof-badges"><span class="ag-badge ag-badge--ok">Level 1<\/span><\/span>/);
  assert.doesNotMatch(h,/>Draft</);
});
test('card header CSS: the name ellipsises, the badge group never wraps and drops as a whole',()=>{
  const css=fs.readFileSync(path.resolve(here,'../styles/ledger.css'),'utf8');
  assert.match(css,/\.agl-prof-name\{[^}]*min-width:0|\.agl-prof-name\{[^}]*min-width:min\(/);
  assert.match(css,/\.agl-prof-name\{[^}]*text-overflow:ellipsis[^}]*white-space:nowrap/);
  assert.match(css,/\.agl-prof-badges\{[^}]*flex:none[^}]*margin-left:auto[^}]*white-space:nowrap/);
  assert.match(css,/\.agl-prof-head\{[^}]*flex-wrap:wrap/);
});
