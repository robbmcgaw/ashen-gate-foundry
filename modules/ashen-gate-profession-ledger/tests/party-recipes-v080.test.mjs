import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
// #5: players get one Recipes tab (party knowledge + found recipe items), never the full catalog.
const hooks={},errors=[];let api;
const values={partyRoster:['belwar','tarra','hidden'],libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]}};
const gm={id:'gm',isGM:true,name:'GM',active:true},player={id:'u1',isGM:false,name:'Player',active:true};
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){this.rendered=true;return this;}},HandlebarsApplicationMixin:c=>c,DialogV2:{confirm:async()=>true}}},utils:{escapeHTML:esc}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{}};
globalThis.ui={notifications:{info:()=>{},error:e=>errors.push(String(e))}};
const def=(id,type,extra={})=>({id,entity_type:type,version:'0.1.0',refs:[],...extra});
const src=(id,type,{visibility='player',status='approved',definition=null}={})=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility,status,version:'0.1.0',refs:[],...(definition?{definition}:{})}}});
// World definitions: default ownership NONE for players (Manager's current behaviour).
const worldDoc=(id,name,flags)=>({id,uuid:`Item.${id}`,name,type:'loot',flags,system:{},testUserPermission:u=>u.isGM,toObject(){return {id:this.id,name:this.name,type:this.type,flags:structuredClone(this.flags),system:{}};}});
const salveDef=def('REC-TEST-SALVE','Recipe',{name:'[TEST] Salve',profession_id:'PROF-ALCHEMY',tier:'Apprentice',ingredients:[{material_id:'MAT-TEST-LEAF',quantity:2}]});
const world=[
 worldDoc('wsalve','Recipe: [TEST] Salve',src('REC-TEST-SALVE','Recipe',{definition:salveDef})),
 worldDoc('wdraft','Recipe: [TEST] Draft Brew',src('REC-TEST-DRAFT','Recipe',{status:'draft',definition:def('REC-TEST-DRAFT','Recipe',{name:'[TEST] Draft Brew',ingredients:[{material_id:'MAT-TEST-LEAF',quantity:1}]})})),
 worldDoc('wcat','Recipe: [TEST] Catalog Only',src('REC-TEST-CATALOG','Recipe',{definition:def('REC-TEST-CATALOG','Recipe',{name:'[TEST] Catalog Only',ingredients:[{material_id:'MAT-TEST-LEAF',quantity:1}]})})),
 worldDoc('wleaf','[TEST] Leaf',src('MAT-TEST-LEAF','Material',{definition:def('MAT-TEST-LEAF','Material',{name:'[TEST] Leaf'})})),
];
world.get=id=>world.find(x=>x.id===id);
const held=(id,name,flags,qty=1)=>({id,name,type:'loot',system:{quantity:qty},flags});
const makeActor=(id,name,perm,items,known=[])=>{const inv=[...items];inv.get=i=>inv.find(x=>x.id===i);
 const a={id,name,type:'character',hasPlayerOwner:true,items:inv,flags:{'ashen-gate-profession-ledger':{knownRecipes:known}},testUserPermission:(u,role)=>u.isGM||perm(role),
  setFlag:async(scope,key,v)=>{a.flags[scope]??={};a.flags[scope][key]=v;},
  updateEmbeddedDocuments:async(t,ups)=>{for(const u of ups)inv.get(u._id).system.quantity=u['system.quantity'];},
  deleteEmbeddedDocuments:async(t,ids)=>{for(const i of ids)inv.splice(inv.findIndex(x=>x.id===i),1);}};return a;};
const belwar=makeActor('belwar','[TEST] Belwar',()=>true,[
 held('crafted',"[TEST] Salve",src('ITEM-TEST-SALVE','Item')),
 held('draftrec','Recipe: [TEST] Draft Brew',src('REC-TEST-DRAFT','Recipe',{status:'draft'}))]);
const tarra=makeActor('tarra','[TEST] Tarra',role=>role==='LIMITED',[held('veil','Recipe: [TEST] Veil',src('REC-TEST-VEIL','Recipe'))],['REC-TEST-SALVE']);
const hidden=makeActor('hidden','[TEST] Hidden',()=>false,[held('sec','Recipe: [TEST] Secret',src('REC-TEST-SECRET','Recipe'))],['REC-TEST-SECRET']);
const all=[belwar,tarra,hidden];
const moduleObj={active:true,set api(v){api=v},get api(){return api}};
globalThis.game={user:player,users:{contents:[gm,player]},items:{contents:world,get:world.get},actors:{contents:all,get:id=>all.find(a=>a.id===id)},
 modules:{get:id=>id==='ashen-gate-profession-ledger'?moduleObj:undefined},
 settings:{register:()=>{},registerMenu:()=>{},get:(id,k)=>values[k],set:async(id,k,v)=>{values[k]=v;}}};
const entry=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js');
await import(pathToFileURL(entry));hooks.init();hooks.ready();
const app=api.open({view:'learning'});
const html=async view=>{app.view=view;return (await app._prepareContext({})).html;};

test('player Recipes tab: party knowledge with ingredients, found items, no catalog',async()=>{
 const h=await html('recipes');
 assert.equal(app.view,'recipes');
 assert.doesNotMatch(h,/data-id="catalog"|data-id="learning"/,'no GM recipe tabs for players');
 assert.match(h,/Known by the party \(1\)/);
 assert.match(h,/\[TEST\] Salve/);
 assert.match(h,/Known by <b>\[TEST\] Tarra<\/b>/);
 assert.match(h,/\[TEST\] Leaf<\/span><b>× 2/,'ingredient name resolved from approved player-visible Material');
 assert.doesNotMatch(h,/data-action="plan-recipe"/,'player owns no character that knows it');
 assert.match(h,/Recipe: \[TEST\] Veil/);assert.match(h,/Held by \[TEST\] Tarra/);
 assert.match(h,/Only \[TEST\] Tarra’s owner can learn it/);
 assert.doesNotMatch(h,/tarra:veil/,'no Learn button for an Actor the player does not own');
 assert.match(h,/fa-scroll agl-recipe-mark/);assert.match(h,/Recipe item/);
 assert.match(h,/\[TEST\] Belwar holds <b>Recipe: \[TEST\] Draft Brew<\/b>, which the GM hasn’t released/);
 assert.doesNotMatch(h,/Catalog Only|REC-TEST-CATALOG|\[TEST\] Hidden|REC-TEST-SECRET|Draft — hidden/);
});

test('player planner lists only party-known recipes',async()=>{
 const h=await html('planner');
 assert.match(h,/\[TEST\] Salve/);
 assert.doesNotMatch(h,/Catalog Only|Draft Brew/);
});

test('learning is enforced in the data layer: OWNER, released item, consumes one',async()=>{
 await app._click('learn-recipe','tarra:veil');
 assert.ok(errors.some(e=>e.includes('OWNER')));assert.ok(tarra.items.get('veil'));
 await app._click('learn-recipe','belwar:draftrec');
 assert.ok(errors.some(e=>e.includes('not released')));assert.ok(belwar.items.get('draftrec'));
 assert.deepEqual(belwar.flags['ashen-gate-profession-ledger'].knownRecipes,[]);
 belwar.items.push(held('salverec','Recipe: [TEST] Salve',src('REC-TEST-SALVE','Recipe'),2));
 await app._click('learn-recipe','belwar:salverec');
 assert.deepEqual(belwar.flags['ashen-gate-profession-ledger'].knownRecipes,['REC-TEST-SALVE']);
 assert.equal(belwar.items.get('salverec').system.quantity,1);
 const h=await html('recipes');
 assert.match(h,/Known by <b>\[TEST\] Belwar, \[TEST\] Tarra<\/b>/);
 assert.match(h,/data-action="plan-recipe" data-id="REC-TEST-SALVE"/);
 await app._click('plan-recipe','REC-TEST-SALVE');
 assert.equal(app.view,'planner');assert.equal(app.actorId,'belwar');assert.equal(app.recipeId,'REC-TEST-SALVE');
});

test('player cannot open GM recipe views through tabs or the API',async()=>{
 app.view='recipes';await app._click('tab','catalog');assert.equal(app.view,'recipes');
 api.open({view:'catalog'});assert.equal(app.view,'recipes');
 assert.match(await html('catalog'),/Known by the party/);assert.equal(app.view,'recipes');
});

test('GM sees the player view with hidden counts, plus the full catalog with drafts marked',async()=>{
 game.user=gm;
 let h=await html('recipes');
 assert.match(h,/This is what players see/);
 assert.match(h,/1 recipe is draft or GM-only and hidden from players/);
 assert.match(h,/1 recipe item is draft or GM-only and hidden from players:<\/b> Recipe: \[TEST\] Draft Brew \(\[TEST\] Belwar\)/);
 assert.match(h,/data-id="catalog"/);assert.match(h,/data-id="learning"/);
 h=await html('catalog');
 assert.match(h,/Catalog Only/);assert.match(h,/Draft Brew/);assert.match(h,/Draft — hidden from players/);
 assert.match(h,/1 of 3 recipes is draft|1 of 3 recipes are draft/);
});
