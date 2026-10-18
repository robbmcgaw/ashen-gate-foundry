import assert from 'node:assert/strict';
import test from 'node:test';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
const hooks={};const moduleObj={api:null};const options={};
const items=[
  {id:'pub1',uuid:'Item.pub1',name:'Recipe: Public Tea',type:'loot',system:{quantity:1},
    flags:{'ashen-gate-manager':{source:{sourceId:'REC-PUBLIC-TEA',entityType:'Recipe',visibility:'player',status:'approved'}}},
    testUserPermission:()=>true,
    toObject(){return {id:this.id,name:this.name,type:this.type,system:this.system,flags:this.flags};}},
  {id:'secret1',uuid:'Item.secret1',name:'Recipe: Secret Tea',type:'loot',system:{quantity:1},
    flags:{'ashen-gate-manager':{source:{sourceId:'REC-SECRET-TEA',entityType:'Recipe',visibility:'gm',status:'draft'}}},
    testUserPermission:()=>true,
    toObject(){return {id:this.id,name:this.name,type:this.type,system:this.system,flags:this.flags};}},
  {id:'reveal1',uuid:'Item.reveal1',name:'Recipe: Gate Tea',type:'loot',system:{quantity:1},
    flags:{'ashen-gate-manager':{source:{sourceId:'REC-GATE-TEA',entityType:'Recipe',visibility:'reveal_gated',status:'draft'}}},
    testUserPermission:()=>true,
    toObject(){return {id:this.id,name:this.name,type:this.type,system:this.system,flags:this.flags};}},
];
const actor={id:'pc1',name:'Player Character',type:'character',hasPlayerOwner:true,
  items:[{id:'prof-new',name:'Tim Test Profession',type:'feat',system:{quantity:1},flags:{'ashen-gate-manager':{source:{entityType:'Profession',sourceId:'PROF-TIM-TEST',visibility:'player'}}}},
    {id:'mh',name:'Secret Ore',type:'loot',system:{quantity:100},flags:{'ashen-gate-manager':{source:{entityType:'Material',sourceId:'MAT-SECRET-ORE',visibility:'gm'}}}},
    {id:'mp',name:'Public Ore',type:'loot',system:{quantity:2},flags:{'ashen-gate-manager':{source:{entityType:'Material',sourceId:'MAT-PUBLIC-ORE',visibility:'player'}}}}],
  testUserPermission:()=>true};
const player={id:'player',name:'Player',isGM:false,active:true};
const gm={id:'gm',name:'GM',isGM:true,active:true};
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){this.rendered=true;return this;}},HandlebarsApplicationMixin:C=>C,DialogV2:class{}}},utils:{escapeHTML:esc}};
globalThis.Hooks={once:(name,fn)=>hooks[name]=fn,on:()=>{}};
globalThis.ui={notifications:{info:()=>{},error:()=>{}}};
const values={libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]},partyRoster:['pc1']};
globalThis.game={user:gm,users:{contents:[gm,player]},items:{contents:items},actors:{contents:[actor],get:(id)=>id==='pc1'?actor:null},settings:{register:(id,key,value)=>options[key]=value,registerMenu:()=>{},get:(id,key)=>values[key]},modules:{get:()=>moduleObj}};
const filename=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js');
await import(pathToFileURL(filename));hooks.init();hooks.ready();

test('GM sees flagged hidden world records with explicit restricted badges',async()=>{
  const app=moduleObj.api.open({view:'catalog'});
  const html=(await app._prepareContext({})).html;
  assert.match(html,/Recipe:|Secret Tea/);
  assert.match(html,/Draft — hidden from players/);
  assert.match(html,/2 of 3 recipes are draft or GM-only and hidden from players/);
  assert.match(html,/GM-only source/);
  assert.match(html,/Reveal gated/);
});

test('player view does not reveal GM or reveal-gated Items even when Foundry Observer permission is true',async()=>{
  game.user=player;
  const app=moduleObj.api.open({view:'catalog'});
  let html=(await app._prepareContext({})).html;
  assert.equal(app.view,'recipes','player is redirected from the GM-only catalog');
  assert.doesNotMatch(html,/Public Tea/,'players never browse the catalog');
  assert.match(html,/No recipe items in Player Character’s inventory/);
  assert.doesNotMatch(html,/Secret Tea|Gate Tea|REC-SECRET-TEA|REC-GATE-TEA/);
  assert.doesNotMatch(html,/data-action="manager"/);
  app.view='materials';
  html=(await app._prepareContext({})).html;
  assert.match(html,/Public Ore/);
  assert.doesNotMatch(html,/Secret Ore|MAT-SECRET-ORE/);
  app.view='individual';
  html=(await app._prepareContext({})).html;
  assert.match(html,/Public Ore/);
  assert.match(html,/Tim Test Profession/,'unrecognized but correctly tagged Professions remain visible without invented XP');
  assert.doesNotMatch(html,/Secret Ore/);
});
