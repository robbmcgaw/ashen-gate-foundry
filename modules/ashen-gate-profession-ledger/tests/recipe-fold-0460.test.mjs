// 0.46.0: Known-recipes cards fold (start collapsed, remembered per character and user); profession headers are left-aligned.
// Mocked Foundry and a tiny fake DOM: logic and markup only, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {skillKeyOf,skillProficiency} from '../scripts/checks.mjs';
import {cleanDescription,resolveEnrichers,snapshotItem,readRecipePreviews} from '../scripts/result-preview.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const hooks={},opened=[],dialogs=[];let api;
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)};
const gm={id:'gm',isGM:true,name:'GM',active:true},alice={id:'u1',isGM:false,name:'Alice',active:true};
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){return this;}},HandlebarsApplicationMixin:c=>c,
  DialogV2:{prompt:async o=>{dialogs.push(o);}}}},utils:{escapeHTML:esc,randomID:()=>'idx'}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{}};
globalThis.ui={notifications:{info:()=>{},error:()=>{}}};
const def=(id,type,extra={})=>({id,entity_type:type,version:'0.1.0',refs:[],...extra});
const src=(id,type,{visibility='player',status='approved',definition=null}={})=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility,status,version:'0.1.0',refs:[],...(definition?{definition}:{})}}});
const worldDoc=(id,name,flags,observer)=>({id,uuid:`Item.${id}`,name,img:'',type:'loot',flags,system:{description:{value:''}},
  testUserPermission:(u)=>u.isGM||observer,sheet:{render:async()=>{opened.push(id);}},
  toObject(){return {_id:this.id,name:this.name,img:'',type:this.type,flags:structuredClone(this.flags),system:{description:{value:''}}};}});
const rec=(id,extra)=>def(id,'Recipe',{profession_id:'PROF-TEST-ALCHEMY',...extra});
const salve=rec('REC-TEST-SALVE',{name:'[TEST] Salve',result_item_id:'ITEM-TEST-SALVE',tier:'expert',effort:'long',workstation:'[TEST] Laboratory',
  ingredients:[{material_id:'MAT-TEST-LEAF',quantity:2},{material_id:'MAT-TEST-RESIN',quantity:1}]});
const world=[
 worldDoc('wsalve0000000000','Recipe: [TEST] Salve',src('REC-TEST-SALVE','Recipe',{definition:salve}),true),
 worldDoc('wleaf00000000000','[TEST] Leaf',src('MAT-TEST-LEAF','Material',{definition:def('MAT-TEST-LEAF','Material',{name:'[TEST] Leaf'})}),true),
 worldDoc('wresin0000000000','[TEST] Resin',src('MAT-TEST-RESIN','Material',{definition:def('MAT-TEST-RESIN','Material',{name:'[TEST] Resin'})}),false),
 worldDoc('wvial00000000000','[TEST] Salve Vial',src('ITEM-TEST-SALVE','Item',{definition:def('ITEM-TEST-SALVE','Item',{name:'[TEST] Salve Vial'})}),false),
 worldDoc('wprof00000000000','[TEST] Alchemy — Profession',src('PROF-TEST-ALCHEMY','Profession',{definition:def('PROF-TEST-ALCHEMY','Profession',{name:'[TEST] Alchemy'})}),true)];
world.get=id=>world.find(x=>x.id===id);
const previews={schema:'ag-result-previews/0.1',recipes:{'REC-TEST-SALVE':{
  result:{name:'[TEST] Salve Vial',img:'',type:'Consumable',text:'x',html:'<h3>Effects</h3><table><tr><th>Roll</th><th>Result</th></tr><tr><td>1</td><td>Fine</td></tr></table><p>Recipe: @UUID[Item.kkzdAWEiAHChoSd9]{Braided Metal Bracelet}</p>',price:'5 gp',uuid:'Item.wvial00000000000'},
  ingredients:[{name:'[TEST] Leaf',img:'',type:'Material',text:'',price:'',quantity:2},{name:'[TEST] Resin',img:'',type:'Material',text:'Sticky. @UUID[Item.abcdefghijklmnop]',price:'',quantity:1,uuid:'Item.wresin0000000000'}],tools:'',workstation:'[TEST] Laboratory'}}};
const skills={arc:{value:1},med:{value:2},his:{value:0.5},nat:{value:0}};
const belwar={id:'belwar',name:'[TEST] Belwar',type:'character',hasPlayerOwner:true,system:{skills},items:[{id:'bprof',name:'[TEST] Alchemy — Profession',type:'feat',system:{quantity:1,description:{value:''}},flags:src('PROF-TEST-ALCHEMY','Profession',{definition:def('PROF-TEST-ALCHEMY','Profession',{name:'[TEST] Alchemy'})})}],
  flags:{'ashen-gate-profession-ledger':{knownRecipes:['REC-TEST-SALVE'],recipePreviews:previews}},testUserPermission:(u,role)=>u.isGM||u.id==='u1'||role==='LIMITED'};
belwar.items.get=id=>belwar.items.find(i=>i.id===id)??null;
const moduleObj={active:true,version:'0.46.0',set api(v){api=v},get api(){return api}};
const values={partyRoster:['belwar'],libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]}};
globalThis.game={user:alice,users:{contents:[gm,alice],get:id=>[gm,alice].find(u=>u.id===id)},items:{contents:world,get:world.get},actors:{contents:[belwar],get:id=>id==='belwar'?belwar:undefined},
  socket:{emit:()=>{},on:()=>{}},modules:{get:id=>id==='ashen-gate-profession-ledger'?moduleObj:undefined},
  settings:{register:()=>{},registerMenu:()=>{},get:(id,k)=>values[k],set:async(id,k,v)=>{values[k]=v;}}};
globalThis.fromUuidSync=uuid=>world.find(d=>d.uuid===uuid)??null;
const {_test}=await import(pathToFileURL(path.resolve(here,'../scripts/main.js')));hooks.init();hooks.ready();
const app=api.open({view:'individual'});app.element={querySelector:()=>null,querySelectorAll:()=>[]};
const html=async()=>{app.view='individual';app.actorId='belwar';return (await app._prepareContext({})).html;};
const visible=h=>h.replace(/<[^>]*>/g,' ');
const css=fs.readFileSync(path.resolve(here,'../styles/ledger.css'),'utf8');


function cardDom(key){
  const attrs={'aria-expanded':'false'};const classes=new Set(['is-collapsed']);
  const full={hidden:true};
  const btn={dataset:{action:'recipe-toggle'},getAttribute:k=>attrs[k]??null,setAttribute:(k,v)=>{attrs[k]=v;}};
  const card={dataset:{recipeCard:key,storedOpen:'0'},classList:{toggle:(c,on)=>on?classes.add(c):classes.delete(c)},querySelector:sel=>sel.includes('recipe-toggle')?btn:sel.includes('agl-recipe-full')?full:null};
  btn.closest=sel=>sel==='[data-recipe-card]'?card:null;
  return {btn,card,full,attrs,classes};
}
const cardHtml=async()=>{const h=await html();const i=h.indexOf('<article class="ag-card agl-recipe-row agl-recipe-card');return h.slice(i,h.indexOf('</article>',i)+10);};

test('every Known-recipes card starts collapsed: a real expand button (aria-expanded=false), body hidden',async()=>{
  memory.clear();
  const c=await cardHtml();
  assert.match(c,/class="ag-card agl-recipe-row agl-recipe-card is-collapsed"/);
  const m=/<button type="button" class="agl-recipe-toggle" data-action="recipe-toggle" aria-expanded="false" aria-controls="(agl-rc-[a-z0-9-]+)">/.exec(c);
  assert.ok(m,'a button with aria-expanded and aria-controls');
  assert.match(c,new RegExp(`<div class="agl-recipe-full" id="${m[1]}" hidden>`),'the body it controls is hidden');
  assert.match(c,/<strong>\[TEST\] Salve<\/strong><\/button>/,'the name is the button label');
  assert.doesNotMatch(c,/<summary[^>]*>[^]*recipe-toggle/,'the expand control is not inside a summary');
  assert.doesNotMatch(c,/<button[^>]*>(?:(?!<\/button>)[^])*<button/,'no button inside another button');
});

test('collapsed card still shows the star, the tags and the main action; Uses line, Details, Effect and cost live in the folded body',async()=>{
  memory.clear();
  const c=await cardHtml();
  const full=c.indexOf('<div class="agl-recipe-full"');
  const head=c.slice(0,full),rest=c.slice(full);
  assert.match(head,/data-action="fav-recipe"/,'star');
  assert.match(head,/ag-badge/,'tier tag');assert.match(head,/Long effort/,'effort tag');
  assert.match(head,/class="agl-recipe-actions">[^]*<button type="button" class="ag-btn"[^>]*>[^]*Craft/,'the primary action is in the head, outside the folded body');
  assert.ok(head.indexOf('data-action="fav-recipe"')<head.indexOf('data-action="recipe-toggle"'),'the star is a sibling of the expand button, not inside it');
  assert.match(rest,/<details class="agl-recipe-more"/,'Details fold is inside the body');
  assert.match(rest,/agl-recipe-station/,'the tool or station line is inside the body');
});

test('toggle button opens and closes in place, and sets aria-expanded; non-card actions are left alone',async()=>{
  memory.clear();
  const d=cardDom('belwar.rabc');
  assert.equal(_test.recipeToggleClick({dataset:{action:'craft'}}),false);
  assert.equal(_test.recipeToggleClick(d.btn),true);
  assert.equal(d.attrs['aria-expanded'],'true');assert.equal(d.full.hidden,false);assert.ok(!d.classes.has('is-collapsed'));assert.equal(d.card.dataset.storedOpen,'1');
  _test.recipeToggleClick(d.btn);
  assert.equal(d.attrs['aria-expanded'],'false');assert.equal(d.full.hidden,true);assert.ok(d.classes.has('is-collapsed'));
});

test('open state is remembered per character and per user; a recipe with no stored state is collapsed',async()=>{
  memory.clear();
  const d=cardDom('belwar.rsalve');
  assert.equal(_test.recipeCardOpen('belwar','REC-TEST-SALVE'),false,'default collapsed');
  const key=/data-recipe-card="([^"]+)"/.exec(await cardHtml())[1];
  const d2=cardDom(key);_test.recipeToggleClick(d2.btn);
  assert.equal(_test.recipeCardOpen('belwar','REC-TEST-SALVE'),true,'remembered');
  assert.equal(_test.recipeCardOpen('someone-else','REC-TEST-SALVE'),false,'another character is unaffected');
  assert.match(await cardHtml(),/agl-recipe-card"[^>]*data-stored-open="1"/,'a re-render (star, refresh) draws it open again');
  assert.match(await cardHtml(),/aria-expanded="true"/);
  const stored=[...memory.entries()].find(([k])=>k.includes(':profession-ledger')||k.includes('ashen-gate-profession-ledger'));
  assert.ok(stored&&stored[0].endsWith(':u1'),'stored in the per-user ui store');
  const raw=JSON.parse(stored[1]);
  assert.deepEqual(Object.keys(raw.recipeCardsOpen),[key],'only open cards are stored; no raw recipe id');
  assert.doesNotMatch(stored[1],/REC-TEST/);
  _test.recipeToggleClick(d2.btn);assert.equal(_test.recipeCardOpen('belwar','REC-TEST-SALVE'),false,'closing forgets it');
  void d;
});

test('keyboard: the toggle is a native button (Enter and Space fire click) with visible focus styling; reduced motion is respected',async()=>{
  const c=await cardHtml();
  assert.match(c,/<button type="button" class="agl-recipe-toggle"/);
  assert.doesNotMatch(c,/tabindex="-1"/);
  assert.match(css,/\.agl-recipe-toggle:focus-visible\{outline:2px solid var\(--ag-focus\)/);
  assert.match(css,/prefers-reduced-motion:reduce\)\{\.agl-recipe-chev\{transition:none\}/);
  assert.match(css,/\.agl-recipe-full\[hidden\]\{display:none\}/,'the hidden attribute wins over the flex layout');
});

test('profession group headers are left-aligned (title left, count chip beside it)',async()=>{
  const rule=/\.agl-group__toggle\{([^}]*)\}/.exec(css)[1];
  assert.match(rule,/justify-content:flex-start/);assert.match(rule,/text-align:start/);
  const h=await html();
  assert.match(h,/<button type="button" class="agl-group__toggle"[^>]*><i class="fa-solid fa-chevron-down agl-group__chev" aria-hidden="true"><\/i><strong>\[TEST\] Alchemy<\/strong> <span class="ag-badge">1 /);
});

test('opening a recipe via the favorites list (fav-jump) opens its folded card too',async()=>{
  memory.clear();
  const d=cardDom('belwar.rjump');d.btn.closest=sel=>sel==='[data-recipe-card]'?d.card:null;
  _test.applyRecipeCard(d.card,true);
  assert.equal(d.full.hidden,false);assert.equal(d.attrs['aria-expanded'],'true');
});
