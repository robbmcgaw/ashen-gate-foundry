import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const hooks={},settings={},menu={},errors=[];
const flags={};
const noGetFlag=()=>{throw Error('Flag scope \"ashen-gate\" is not valid or not currently active');};
const recipe={id:'recipe1',name:'Recipe: Hearth Tonic',type:'loot',uuid:'Item.recipe1',
 flags:{'ashen-gate-manager':{source:{sourceId:'REC-TEST-HERTH',entityType:'Recipe',status:'approved',visibility:'player'}},'ashen-gate':{entityId:'REC-TEST-HERTH'}},
 toObject(){return {id:this.id,name:this.name,flags:this.flags,recipe:{profession:'Alchemy',tier:'Apprentice',ingredients:[{materialId:'MAT-TEST-HERBS',quantity:1}]}};},
 getFlag:noGetFlag,testUserPermission:()=>true};
const material={id:'material1',name:'Herbs',type:'loot',uuid:'Item.material1',
 flags:{'ashen-gate-manager':{source:{sourceId:'MAT-TEST-HERBS',entityType:'Material',status:'approved',visibility:'player'}},'ashen-gate':{entityId:'MAT-TEST-HERBS'}},getFlag:noGetFlag,testUserPermission:()=>true};
const actor={id:'a',name:'Test PC',type:'character',hasPlayerOwner:true,flags:{'ashen-gate-skill-trees':{progress:{}}},
 items:[{id:'inv1',name:'Herbs',type:'loot',flags:{'ashen-gate':{entityId:'MAT-TEST-HERBS'}},system:{quantity:3}}],
 getFlag:noGetFlag,testUserPermission:()=>true};
const values={partyRoster:['a'],libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]}};
const apiMod={api:null};
globalThis.foundry={applications:{api:{ApplicationV2:class{
 async _prepareContext(){return {};}
 render(){return this;}
},HandlebarsApplicationMixin:Base=>Base,DialogV2:class{}}},utils:{escapeHTML:s=>String(s)}};
globalThis.Hooks={once:(n,fn)=>{hooks[n]=fn;},on:()=>{}};
globalThis.ui={actors:{tabName:'actors',element:{querySelector:()=>null}},notifications:{info:()=>{},error:e=>errors.push(e)}};
globalThis.game={settings:{register:(m,k,o)=>settings[k]=o,registerMenu:(m,k,o)=>menu[k]=o,get:(m,k)=>values[k]},
 modules:{get:()=>apiMod},user:{id:'gm',name:'GM',isGM:true},users:{contents:[{id:'p1',name:'Player',isGM:false}]},
 actors:{contents:[actor],get:id=>id==='a'?actor:null},items:{contents:[recipe,material]}};
const entry=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js');
await import(pathToFileURL(entry));hooks.init();hooks.ready();
const app=apiMod.api.open({view:'catalog'});
const recipeView=await app._prepareContext({});
assert.match(recipeView.html,/Hearth Tonic/);
assert.match(recipeView.html,/data-id="gm"/);
app.view="catalog";assert.match((await app._prepareContext({})).html,/a draft stays hidden until you approve it in General Manager/);
app.view='individual';const individual=await app._prepareContext({});
assert.match(individual.html,/Test PC/);
assert.match(individual.html,/Herbs/);
assert.equal(app.library.recipes.length,1);
assert.equal(app.library.materials.length,1);
assert.equal(errors.length,0);
console.log('PASS Foundry V14 invalid flag-scope regression: world Item scan and Actor progress render without getFlag calls');
