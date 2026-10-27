// 0.34.1: station-based activities treat access tools as check-only. (Harness from recipe-cards-v0320.)
// 0.32.0: recipe cards (Needs → Makes, effort, tool or station), item links with permissions, tier colours (rarity by tier).
// Mocked Foundry: logic and markup only, not the live UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {TIER_RARITY,tierRarity,tierBadge} from '../scripts/tier-style.mjs';
const hooks={},errors=[],opened=[];let api;
const values={partyRoster:['belwar'],libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]}};
const gm={id:'gm',isGM:true,name:'GM',active:true},alice={id:'u1',isGM:false,name:'Alice',active:true};
const users=[gm,alice];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){return this;}},HandlebarsApplicationMixin:c=>c,DialogV2:class{}}},utils:{escapeHTML:esc,randomID:()=>'idx'}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{}};
globalThis.ui={notifications:{info:()=>{},error:e=>errors.push(String(e))}};
const def=(id,type,extra={})=>({id,entity_type:type,version:'0.1.0',refs:[],...extra});
const src=(id,type,{visibility='player',status='approved',definition=null}={})=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility,status,version:'0.1.0',refs:[],...(definition?{definition}:{})}}});
// Documents the player may open (Observer) and ones they may not.
const worldDoc=(id,name,flags,observer)=>({id,uuid:`Item.${id}`,name,img:'',type:'loot',flags,system:{description:{value:''}},
  testUserPermission:(u)=>u.isGM||observer,sheet:{render:async()=>{opened.push(id);}},
  toObject(){return {_id:this.id,name:this.name,img:'',type:this.type,flags:structuredClone(this.flags),system:{description:{value:''}}};}});
const rec=(id,extra)=>def(id,'Recipe',{profession_id:'PROF-TEST-ALCHEMY',...extra});
const salve=rec('REC-TEST-SALVE',{name:'[TEST] Salve',result_item_id:'ITEM-TEST-SALVE',tier:'expert',effort:'long',workstation:'[TEST] Laboratory',rules_summary:'[TEST] Heals a little.',
  ingredients:[{material_id:'MAT-TEST-LEAF',quantity:2},{material_id:'MAT-TEST-RESIN',quantity:1},{material_id:'MAT-TEST-LOST',quantity:1}]});
const A=(extra)=>rec(extra.id,{kind:'activity',tier:'apprentice',effort:'short',ingredients:[],profession_id:'PROF-TEST-ALCHEMY',...extra});
const station=A({id:'REC-TEST-STATION',name:'[TEST] Station Piece',workstation:'[TEST] Rehearsal Stage',access:{toolProficienciesAnyOf:['disg','music']}});
const toolOnly=A({id:'REC-TEST-TOOLONLY',name:'[TEST] Tool Piece',required_tools:['Disguise Kit'],access:{toolProficienciesAnyOf:['disg','music']}});
const accessOnly=A({id:'REC-TEST-ACCESSONLY',name:'[TEST] Access Piece',access:{toolProficienciesAnyOf:['disg','music']}});
const neither=A({id:'REC-TEST-NEITHER',name:'[TEST] Bare Piece'});
const all=[station,toolOnly,accessOnly,neither];
const world=[...all.map(d=>worldDoc('w'+d.id,'Recipe: '+d.name,src(d.id,'Recipe',{definition:d}),true)),
 worldDoc('wprof00000000000','[TEST] Alchemy — Profession',src('PROF-TEST-ALCHEMY','Profession',{definition:def('PROF-TEST-ALCHEMY','Profession',{name:'[TEST] Alchemy'})}),true)];
world.get=id=>world.find(x=>x.id===id);
const belwar={id:'belwar',name:'[TEST] Belwar',type:'character',hasPlayerOwner:true,items:[{id:'bprof',name:'[TEST] Alchemy — Profession',type:'feat',system:{quantity:1,description:{value:''}},flags:src('PROF-TEST-ALCHEMY','Profession',{definition:def('PROF-TEST-ALCHEMY','Profession',{name:'[TEST] Alchemy'})})}],flags:{'ashen-gate-profession-ledger':{knownRecipes:all.map(d=>d.id)}},
  testUserPermission:(u,role)=>u.isGM||u.id==='u1'||role==='LIMITED'};
belwar.items.get=id=>belwar.items.find(i=>i.id===id)??null;
const moduleObj={active:true,version:'0.36.0',set api(v){api=v},get api(){return api}};
globalThis.game={user:alice,users:{contents:users,get:id=>users.find(u=>u.id===id)},items:{contents:world,get:world.get},actors:{contents:[belwar],get:id=>id==='belwar'?belwar:undefined},
  socket:{emit:()=>{},on:()=>{}},modules:{get:id=>id==='ashen-gate-profession-ledger'?moduleObj:undefined},
  settings:{register:()=>{},registerMenu:()=>{},get:(id,k)=>values[k],set:async(id,k,v)=>{values[k]=v;}}};
const {_test}=await import(pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js')));hooks.init();hooks.ready();
const app=api.open({view:'individual'});app.element={querySelector:()=>null,querySelectorAll:()=>[]};
const html=async view=>{app.view=view;app.actorId='belwar';return (await app._prepareContext({})).html;};
const card=(h,name)=>{const at=h.indexOf(`<strong>${name}</strong>`);assert.ok(at>=0,name);return h.slice(h.lastIndexOf('<article',at),h.indexOf('</article>',at));};

test('station + access tools: Station chip only, no Uses chip, no missing-tool warning (character carries nothing)',async()=>{
  const h=card(await html('individual'),'[TEST] Station Piece');
  assert.match(h,/<span class="agl-label agl-label--inline">Station<\/span> <span>\[TEST\] Rehearsal Stage<\/span>/);
  assert.doesNotMatch(h,/>Uses</);assert.doesNotMatch(h,/doesn’t have|None carried|has none|carries none/);
  assert.match(h,/data-action="complete-activity"/,'Complete activity is not blocked');
});
test('station + access tools in Party and Catalog (same shared card): Station only, no Uses',async()=>{
  for(const view of ['party','catalog']){const h=card(await html(view),'[TEST] Station Piece');
    assert.match(h,/>Station</);assert.doesNotMatch(h,/>Uses</,view);}
});
test('tool-only activity is unchanged: Uses chip with the tool, warning when none carried',async()=>{
  const h=card(await html('individual'),'[TEST] Tool Piece');
  assert.match(h,/>Uses<\/span> <span>[^<]*Disguise Kit/);assert.match(h,/doesn’t have|has none|carries none|None carried/);assert.doesNotMatch(h,/>Station</);
});
test('access tools without a station stay required alternatives (unchanged)',async()=>{
  const h=card(await html('individual'),'[TEST] Access Piece');
  assert.match(h,/>Uses<\/span>/);assert.match(h,/has none|carries none|None carried|doesn’t have/);
});
test('neither tool nor station: unchanged (the profession’s own tool, no Station chip)',async()=>{
  const h=card(await html('individual'),'[TEST] Bare Piece');
  assert.match(h,/>Uses<\/span> <span>Alchemist’s Supplies/);assert.doesNotMatch(h,/>Station</);
});
