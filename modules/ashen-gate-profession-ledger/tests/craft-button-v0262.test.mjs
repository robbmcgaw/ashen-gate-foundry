// 0.26.2: a known recipe always says why it can't be crafted. Craft is in a character's Known recipes (Individual tab,
// sheet tab, Character Hub embed). A blocked recipe shows the Craft button disabled beside the reason; a recipe item
// already learned points to Known recipes, or says the recipe isn't released; Catalog and Party say where to craft.
// Crafting rules are unchanged. Mocked Foundry: logic and markup only, not the live UI.
import assert from 'node:assert/strict';
import test from 'node:test';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {normalizeRecipe} from '../scripts/core.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const hooks={},errors=[];let api=null;
// Stored catalog rows are kept in their normalised shape (as the Ledger import writes them).
const recipe=(id,name,extra={})=>({...normalizeRecipe({id,name,profession:'Alchemy',ingredients:[{materialId:'MAT-TEST-HERB',name:'[TEST] Herb',quantity:2}],...extra}),visibility:'player',status:'approved'});
const values={partyRoster:['a','b'],playerAccessEnabled:true,libraryData:{schema:'ag-ledger/0.1',materials:[],recipes:[
  recipe('REC-TEST-NORESULT','[TEST] No Result',{recipe:{result_item_id:'ITEM-TEST-MISSING',ingredients:[{materialId:'MAT-TEST-HERB',name:'[TEST] Herb',quantity:2}]}}),
  recipe('REC-TEST-NOLIST','[TEST] No List',{ingredients:[],result_item_id:'ITEM-TEST-TONIC'})]}};
const gm={id:'gm',isGM:true,name:'GM',active:true},player={id:'u1',isGM:false,name:'Player',active:true};
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
globalThis.document={documentElement:{dataset:{}}};
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){this.rendered=true;return this;}},HandlebarsApplicationMixin:c=>c,DialogV2:{wait:async()=>true}}},utils:{escapeHTML:esc}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:()=>{}};
globalThis.ui={notifications:{info:()=>{},error:e=>errors.push(e)}};
const src=(id,type)=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility:'player',status:'approved'}}});
// A recipe item the runner already learned, with one copy left; no world record of the recipe (not released).
const leftover={id:'ri',name:'Recipe: [TEST] Unreleased',type:'loot',system:{quantity:1},flags:src('REC-TEST-UNRELEASED','Recipe')};
const inv=[leftover];
const mk=(id,name,items,known)=>({id,name,type:'character',hasPlayerOwner:true,items,flags:{'ashen-gate-profession-ledger':{knownRecipes:known}},
  testUserPermission:(u,role)=>u.isGM||(id==='a'&&u.id==='u1')||role==='LIMITED'});
const runner=mk('a','[TEST] Runner',inv,['REC-TEST-NORESULT','REC-TEST-NOLIST','REC-TEST-UNRELEASED']),other=mk('b','[TEST] Other',[],['REC-TEST-NOLIST']);
const all=[runner,other];
const mod={active:true,version:'0.26.2',get api(){return api},set api(v){api=v}};
globalThis.game={user:player,users:{contents:[gm,player],get:id=>[gm,player].find(u=>u.id===id)},items:{contents:[]},actors:{contents:all,get:id=>all.find(a=>a.id===id)},
  socket:{emit(){},on(){}},modules:{get:id=>id==='ashen-gate-profession-ledger'?mod:undefined},
  settings:{register(){},registerMenu(){},get:(i,k)=>values[k],set:async(i,k,v)=>{values[k]=v;}}};
await import(pathToFileURL(path.resolve(here,'../scripts/main.js')));hooks.init();hooks.ready();
const app=api.open({view:'individual',actorId:'a'});
app.element={querySelector:()=>null,querySelectorAll:()=>[]};
const html=async view=>{app.view=view;return (await app._prepareContext({})).html;};
const row=(h,name)=>{const i=h.indexOf(name);assert.ok(i>=0,`no row ${name}`);return h.slice(h.lastIndexOf('<article',i),h.indexOf('</article>',i));};

test('a known recipe that is blocked shows Craft disabled with the reason',async()=>{
  const h=await html('individual');
  assert.match(row(h,'[TEST] No Result'),/<button type="button" class="ag-btn" disabled><i class="fa-solid fa-hammer" aria-hidden="true"><\/i> Craft<\/button><span class="agl-reason">The item this recipe makes is not in this world yet\./);
  assert.match(row(h,'[TEST] No List'),/disabled>.*Craft<\/button><span class="agl-reason">This recipe has no ingredient list yet\. Ask your GM\./s);
});

test('missing materials still read "Missing …" beside a disabled Craft (unchanged)',async()=>{
  values.libraryData.recipes.push(recipe('REC-TEST-HERBS','[TEST] Herb Tonic',{recipe:{result_item_id:'ITEM-TEST-TONIC',ingredients:[{materialId:'MAT-TEST-HERB',name:'[TEST] Herb',quantity:2}]}}));runner.flags['ashen-gate-profession-ledger'].knownRecipes.push('REC-TEST-HERBS');
  // Give it a result item the player may see, so only materials are missing.
  game.items.contents.push({id:'res',uuid:'Item.res',name:'[TEST] Tonic',flags:src('ITEM-TEST-TONIC','Item'),testUserPermission:()=>true});
  const h=await html('individual');
  assert.match(row(h,'[TEST] Herb Tonic'),/disabled>.*Craft<\/button><span class="agl-reason">Missing 2 × \[TEST\] Herb<\/span>/s);
});

test('a learned recipe the player can\'t read: the leftover recipe item says why there is no Craft, and so does Known recipes',async()=>{
  const h=await html('individual');
  assert.match(h,/Already known<\/span><span class="agl-reason">Can’t be crafted yet: your GM hasn’t released this recipe<\/span>/);
  assert.match(h,/1 known recipe is not available right now: your GM hasn’t released it in this world yet, so it can’t be crafted\./);
  assert.doesNotMatch(h,/REC-TEST-UNRELEASED/,'no raw ids');
});

test('Recipe Catalog and Party say where to craft; a player gets "Open <name>’s view" for their own character only',async()=>{
  assert.match(await html('catalog'),/Recipes your party has found or learned, by profession\. Craft and learn from the Individual tab\./);
  app.partySort='player';
  const h=await html('party');
  assert.match(h,/data-action="open-individual" data-id="a">Open \[TEST\] Runner’s view/);
  assert.doesNotMatch(h,/data-action="open-individual" data-id="b"/,'not for a character the player does not own');
  assert.deepEqual(errors,[]);
});
