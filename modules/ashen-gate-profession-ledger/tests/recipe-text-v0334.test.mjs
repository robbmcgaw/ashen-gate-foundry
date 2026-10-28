// 0.33.4: each fact once on a recipe card. Mocked Foundry: logic and markup only, not the live UI. Synthetic [TEST] data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {recipeTexts,normalizeText} from '../scripts/recipe-text.mjs';
const hooks={};let api;
const gm={id:'gm',isGM:true,name:'GM',active:true},alice={id:'u1',isGM:false,name:'Alice',active:true};
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){return this;}},HandlebarsApplicationMixin:c=>c,DialogV2:class{}}},utils:{escapeHTML:esc,randomID:()=>'idx'}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{}};
globalThis.ui={notifications:{info:()=>{},error:()=>{}}};
const EFFECT="[TEST] Crowd draw: make a Charisma (Performance) check. One ally has Advantage. Earn coin: the tips cover a Poor lifestyle.";
const def=(id,type,extra={})=>({id,entity_type:type,version:'0.1.0',refs:[],...extra});
const rec=(id,extra)=>def(id,'Recipe',{profession_id:'PROF-TEST-ART',kind:'activity',tier:'apprentice',effort:'short',ingredients:[],required_tools:['Disguise Kit'],...extra});
const defs=[
 rec('REC-TEST-SAME',{name:'[TEST] Same',description:EFFECT,effect_note:EFFECT}),
 rec('REC-TEST-CONTAINS',{name:'[TEST] Contains',description:`[TEST] Contains is an apprentice performance composition made through short effort. ${EFFECT} Without it you can still bluff.`,effect_note:EFFECT}),
 rec('REC-TEST-FLAVOUR',{name:'[TEST] Flavour',description:'[TEST] A fiddle tune that carries across the square.',effect_note:EFFECT}),
 rec('REC-TEST-PLAIN',{name:'[TEST] Plain',description:'',effect_note:EFFECT})];
const src=(d)=>({'ashen-gate-manager':{source:{sourceId:d.id,entityType:'Recipe',visibility:'player',status:'approved',version:'0.1.0',refs:[],definition:d}}});
const world=defs.map(d=>({id:`w${d.id}`,uuid:`Item.${d.id}`,name:d.name,img:'',type:'loot',flags:src(d),system:{description:{value:''}},testUserPermission:()=>true,sheet:{render:async()=>{}},
  toObject(){return {_id:this.id,name:this.name,img:'',type:this.type,flags:structuredClone(this.flags),system:{description:{value:''}}};}}));
world.get=id=>world.find(x=>x.id===id);
const values={partyRoster:['belwar','cara'],libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]}};
const mk=(id,name,known)=>({id,name,type:'character',hasPlayerOwner:true,items:Object.assign([],{get:()=>null}),flags:{'ashen-gate-profession-ledger':{knownRecipes:known}},testUserPermission:()=>true});
const belwar=mk('belwar','[TEST] Belwar',defs.map(d=>d.id)),cara=mk('cara','[TEST] Cara',['REC-TEST-SAME']);
const moduleObj={active:true,version:'0.37.12',set api(v){api=v},get api(){return api}};
globalThis.game={user:gm,users:{contents:[gm,alice],get:id=>[gm,alice].find(u=>u.id===id)},items:{contents:world,get:world.get},actors:{contents:[belwar,cara],get:id=>[belwar,cara].find(a=>a.id===id)},
  socket:{emit:()=>{},on:()=>{}},modules:{get:id=>id==='ashen-gate-profession-ledger'?moduleObj:undefined},
  settings:{register:()=>{},registerMenu:()=>{},get:(id,k)=>values[k],set:async()=>{}}};
await import(pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js')));hooks.init();hooks.ready();
const app=api.open({view:'party'});app.element={querySelector:()=>null,querySelectorAll:()=>[]};
const html=async(view,actorId)=>{app.view=view;app.actorId=actorId;return (await app._prepareContext({})).html;};
const card=(h,name)=>{const at=h.indexOf(`<strong>${name}</strong>`);assert.ok(at>=0,`card ${name} present`);return h.slice(h.lastIndexOf('<article',at),h.indexOf('</article>',at));};
const text=h=>h.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
const count=(h,s)=>h.split(s).length-1;

test('recipeTexts: identical text is shown once, as the effect',()=>{
  assert.deepEqual(recipeTexts({name:'X',description:EFFECT,effect:EFFECT}),{summary:null,effect:EFFECT});
  assert.deepEqual(recipeTexts({name:'X',description:`  ${EFFECT.toUpperCase()}`,effect:EFFECT}).summary,null,'case and spacing do not matter');
});
test('recipeTexts: description containing the effect and a badge-restating lead keeps only the distinct rest',()=>{
  const r=recipeTexts({name:'A Jest',tier:'Apprentice',effort:'short',description:`A Jest is an apprentice performance composition made through short effort. ${EFFECT} Without it you can still bluff.`,effect:EFFECT});
  assert.equal(r.summary,'Without it you can still bluff.');assert.equal(r.effect,EFFECT);
});
test('recipeTexts: a lead sentence that adds something is kept; distinct flavour is kept; effect contained in nothing stays',()=>{
  assert.equal(recipeTexts({name:'A Jest',tier:'Apprentice',effort:'short',description:'A Jest is a fiddle tune that carries across the square.',effect:null}).summary,'A Jest is a fiddle tune that carries across the square.');
  assert.deepEqual(recipeTexts({name:'X',description:'A fiddle tune.',effect:EFFECT}),{summary:'A fiddle tune.',effect:EFFECT});
  assert.equal(recipeTexts({name:'X',description:'Part one. Part two.',effect:'Part one. Part two. And more.'}).summary,null,'summary contained in the effect is dropped');
  assert.equal(normalizeText("GM’s  DC!"),'gms dc');
});

test('Party card: the effect text appears once, chips unchanged, Known by visible, body folded under Details',async()=>{
  const h=card(await html('party'),'[TEST] Contains');
  assert.equal(count(text(h),'Crowd draw'),1,'effect sentence once');
  assert.equal(count(text(h),'made through short effort'),0,'badge-restating sentence gone');
  assert.match(h,/<span class="agl-recipe-badges"><span class="ag-badge[^"]*">Activity<\/span>.*data-rarity="common">Apprentice<\/span>.*Short effort<\/span><\/span>/s,'chips: Activity, Apprentice, Short effort');
  assert.match(h,/<details class="agl-recipe-more"><summary>Details<\/summary>/);
  const after=h.slice(h.indexOf('</details>'));
  assert.match(after,/Known by [^<]*Belwar/,'Known by is outside the fold');
  assert.ok(!/decides at the table/.test(h),'no GM note in a list card');
  assert.match(h,/Without it you can still bluff/,'distinct trailing text kept');
});
test('Party card: identical description and effect shows once; no summary paragraph',async()=>{
  const h=card(await html('party'),'[TEST] Same');
  assert.equal(count(text(h),'Crowd draw'),1);assert.ok(!h.includes('agl-recipe-summary'));
  assert.match(h,/Known by [^<]*Belwar/,'Known by present');
});
test('Party card: distinct flavour text is shown as the summary, effect separately',async()=>{
  const h=card(await html('party'),'[TEST] Flavour');
  assert.match(h,/<p class="agl-recipe-summary">\[TEST\] A fiddle tune/);assert.match(h,/<p class="agl-recipe-effect"><span class="agl-label">Effect<\/span> \[TEST\] Crowd draw/);
  assert.equal(card(await html('party'),'[TEST] Plain').includes('agl-recipe-summary'),false,'no description: no summary line');
});
test('Individual card: open by default (foldable), effect once, GM note present where Complete activity exists',async()=>{
  const h=card(await html('individual','belwar'),'[TEST] Contains');
  assert.match(h,/<details class="agl-recipe-more" data-recipe-details="r[a-z0-9]+" data-stored-open="1" open>/,'0.37.2: folds like the Party card, open by default');assert.equal(count(text(h),'Crowd draw'),1);
  assert.equal(count(h,'decides at the table'),1);
});
test('Catalog card shares the folded card',async()=>{
  const h=card(await html('catalog'),'[TEST] Same');
  assert.match(h,/<details class="agl-recipe-more">/);assert.equal(count(text(h),'Crowd draw'),1);
});
