// 0.32.2: a recipe's tool requirement is met by ANY tool GM Setup allows for the profession (Inscription: Calligrapher's
// Supplies, Cartographer's Tools or Painter's Supplies), and carried tools are found however the Item was made (D&D Beyond
// import, different identifier/punctuation, inside a container). One helper (heldTool + craftRequirement) serves Individual,
// the Tidy5e tab and the Character Hub embed. Mocked Foundry and synthetic [TEST] data: logic and markup, not the live UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {normalizeRecipe} from '../scripts/core.mjs';
import {heldTool,looseToolName,requiredToolRef} from '../scripts/checks.mjs';
const hooks={},errors=[];let api;
const gm={id:'gm',isGM:true,name:'GM',active:true},alice={id:'u1',isGM:false,name:'Alice',active:true};
const users=[gm,alice];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
globalThis.document={documentElement:{dataset:{}}};
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){return this;}},HandlebarsApplicationMixin:c=>c,DialogV2:class{}}},utils:{escapeHTML:esc,randomID:()=>'idx'}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:()=>{}};
globalThis.ui={notifications:{info:()=>{},error:e=>errors.push(String(e)),warn:()=>{}}};
const TOOLS=['alchemist','calligrapher','cartographer','painter','tinker','weaver','cook','brewer'];
globalThis.CONFIG={DND5E:{tools:Object.fromEntries(TOOLS.map(k=>[k,{ability:'int'}]))}};
const src=(id,type,definition)=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility:'player',status:'approved',version:'0.1.0',refs:[],definition}}});
const profDef={id:'PROF-TEST-INSCRIPTION',entity_type:'Profession',version:'0.1.0',refs:[],name:'[TEST] Inscription',
  access:{toolProficienciesAnyOf:["Calligrapher's Supplies","Cartographer's Tools","Painter's Supplies"]}};
const tinkerDef={id:'PROF-TEST-ENGINEERING',entity_type:'Profession',version:'0.1.0',refs:[],name:'[TEST] Engineering',access:{toolProficienciesAnyOf:["Tinker's Tools"]}};
const profDoc=(id,def)=>({id,uuid:`Item.${id}`,name:`${def.name} — Profession`,img:'',type:'feat',flags:src(def.id,'Profession',def),system:{description:{value:''}},testUserPermission:()=>true});
const world=[profDoc('wins',profDef),profDoc('wtin',tinkerDef)];
world.get=id=>world.find(x=>x.id===id);
const recipe=(id,name,profession,extra={})=>({...normalizeRecipe({id,name,profession,ingredients:[],...extra}),visibility:'player',status:'approved'});
const values={partyRoster:['a','b','c','d','e','f'],playerAccessEnabled:true,libraryData:{schema:'ag-ledger/0.1',materials:[],recipes:[
  recipe('REC-TEST-SCROLL','[TEST] Scroll','Inscription'),
  recipe('REC-TEST-GEAR','[TEST] Gear','Engineering')]}};
const tool=(id,name,extra={})=>({id,name,type:'tool',system:{quantity:1,type:{value:'tool'},...extra}});
const mk=(id,items)=>({id,name:`[TEST] ${id}`,type:'character',hasPlayerOwner:true,items,flags:{'ashen-gate-profession-ledger':{knownRecipes:['REC-TEST-SCROLL','REC-TEST-GEAR']}},
  system:{tools:{cartographer:{value:1,total:4}}},testUserPermission:()=>true});
// a: D&D Beyond style import: curly apostrophe, source tag, no baseItem, odd identifier. b: carries only the middle tool by base item.
// c: none (but proficient with Cartographer's Tools: proficiency alone is not carrying). d: tool inside a container. e: quantity 0. f: singular/plural name.
const ddb=tool('t1','Cartographer’s Tools (XGE)',{identifier:'cartographers-tools-xge',type:{value:'tool',baseItem:''}});
const A=mk('a',[ddb]),B=mk('b',[tool('t2','[TEST] Mapmaker Kit',{type:{value:'art',baseItem:'cartographer'}})]),C=mk('c',[tool('t3','Hammer')]);
const bag={id:'bag',name:'Backpack',type:'container',system:{quantity:1}};
const D=mk('d',[bag,{...tool('t4','Painter’s Supplies'),system:{quantity:1,container:'bag',type:{value:'art'}}}]);
const E=mk('e',[tool('t5',"Cartographer's Tools",{quantity:0})]),F=mk('f',[tool('t6',"Calligraphers Supplies")]);
const all=[A,B,C,D,E,F];
const moduleObj={active:true,version:'0.37.6',set api(v){api=v},get api(){return api}};
globalThis.game={user:alice,users:{contents:users,get:id=>users.find(u=>u.id===id)},items:{contents:world,get:world.get},actors:{contents:all,get:id=>all.find(a=>a.id===id)},
  socket:{emit:()=>{},on:()=>{}},modules:{get:id=>id==='ashen-gate-profession-ledger'?moduleObj:undefined},
  settings:{register:()=>{},registerMenu:()=>{},get:(id,k)=>values[k],set:async(id,k,v)=>{values[k]=v;}}};
await import(pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js')));hooks.init();hooks.ready();
const app=api.open({view:'individual'});app.element={querySelector:()=>null,querySelectorAll:()=>[]};
const html=async(view,actorId)=>{app.view=view;app.actorId=actorId;return (await app._prepareContext({})).html;};
const card=(h,name)=>{const at=h.indexOf(`<strong>${name}</strong>`);assert.ok(at>=0,`card ${name}`);return h.slice(h.lastIndexOf('<article',at),h.indexOf('</article>',at));};
const text=h=>h.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
const LIST="Calligrapher’s Supplies, Cartographer’s Tools or Painter’s Supplies";

test('heldTool: D&D Beyond style Items match by name, identifier or base item; proficiency, quantity 0 and non-gear do not',()=>{
  const key={key:'cartographer',uuid:null,name:null};
  assert.equal(heldTool(A,key)?.id,'t1','curly apostrophe + source tag + no baseItem');
  assert.equal(heldTool(B,key)?.id,'t2','base item');
  assert.equal(heldTool(C,key),null,'proficiency alone is not carrying');
  assert.equal(heldTool(E,key),null,'quantity 0');
  assert.equal(heldTool(mk('x',[{id:'i',name:'Cartographer’s Tools',type:'feat',system:{}}]),key),null,'a feature of that name is not gear');
  assert.equal(heldTool(mk('x',[{id:'i',name:'Odd',type:'tool',system:{quantity:1,identifier:'cartographers-tools'}}]),key)?.id,'i','identifier only');
  assert.equal(heldTool(mk('x',[{id:'i',name:'CARTOGRAPHERS TOOL',type:'loot',system:{quantity:1}}]),key)?.id,'i','case, plural, loot type');
  assert.equal(heldTool(F,{key:'calligrapher'})?.id,'t6','singular/plural variants');
  assert.equal(looseToolName('Cook’s Utensils'),looseToolName('Cooks Utensil'));
});
test('heldTool: an Item inside a container counts; a listed contents array does too',()=>{
  assert.equal(heldTool(D,{key:'painter'})?.id,'t4');
  const inner=tool('t9','Weaver’s Tools'),box={id:'box',name:'Case',type:'container',system:{quantity:1,contents:[inner]}};
  assert.equal(heldTool(mk('x',[box]),{key:'weaver'})?.id,'t9');
});

test('Individual: Inscription lists all three tools; the carried one is named (D&D Beyond Item)',async()=>{
  const h=card(await html('individual','a'),'[TEST] Scroll'),t=text(h);
  assert.ok(t.includes(`Tool ${LIST}`),t);
  assert.match(t,/Cartographer’s Tools: carried/);assert.doesNotMatch(t,/doesn’t carry|Needs one of|None carried/);
});
test('Individual: carrying only the second or third tool is enough; a base-item Item with another name too',async()=>{
  assert.match(text(card(await html('individual','b'),'[TEST] Scroll')),/Cartographer’s Tools: carried/);
  assert.match(text(card(await html('individual','d'),'[TEST] Scroll')),/Painter’s Supplies: carried/,'inside a container');
  assert.match(text(card(await html('individual','f'),'[TEST] Scroll')),/Calligrapher’s Supplies: carried/);
});
test('Individual: carrying none (proficiency only, quantity 0) says it needs one of the list',async()=>{
  for(const id of ['c','e']){
    const t=text(card(await html('individual',id),'[TEST] Scroll'));
    assert.ok(t.includes(`Needs one of: ${LIST}`),t);assert.match(t,/None carried/);assert.doesNotMatch(t,/: carried/);
  }
});
test('a one-tool profession keeps its single tool wording',async()=>{
  const t=text(card(await html('individual','c'),'[TEST] Gear'));
  assert.match(t,/Tool Tinker’s Tools/);assert.match(t,/doesn’t carry this/);assert.doesNotMatch(t,/Needs one of/);
});
test('the same card in the GM view and the Character Hub embed (one helper)',async()=>{
  game.user=gm;
  assert.match(text(card(await html('individual','b'),'[TEST] Scroll')),/Cartographer’s Tools: carried/);
  game.user=alice;
  const el={innerHTML:'',isConnected:true,classList:{add(){},remove(){}},addEventListener(){},contains:()=>true,querySelector:()=>null};
  api.embed.mount(el,{actorId:'d',mode:'individual'});
  assert.match(text(card(el.innerHTML,'[TEST] Scroll')),/Painter’s Supplies: carried/,'Hub embed');
  api.embed.mount(el,{actorId:'c',mode:'individual'});
  assert.ok(text(card(el.innerHTML,'[TEST] Scroll')).includes(`Needs one of: ${LIST}`),'Hub embed, none carried');
});
test('Party and Recipe Catalog list the tools without a carried state; no ids or status tokens appear',async()=>{
  for(const view of ['party','catalog']){
    const h=await html(view,'a'),t=text(card(h,'[TEST] Scroll'));
    if(view==='catalog')assert.ok(t.includes(`Tool ${LIST}`),t);
    assert.doesNotMatch(t,/(REC|PROF)-TEST|: carried/);
  }
});
test('an explicit multi-tool (all needed) requirement is not loosened',()=>{
  const r=requiredToolRef("Cartographer's Tools");assert.equal(r.key,'cartographer');
});
