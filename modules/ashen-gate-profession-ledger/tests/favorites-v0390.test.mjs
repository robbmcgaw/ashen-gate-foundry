// 0.39.0: favorite recipes and professions. Mocked Foundry: storage, permissions, ordering and markup only, not the live UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {cleanFavorites,favoritesOf,planFavorite,favoritesFirst,filterFavorites,FAVORITES_MAX} from '../scripts/favorites.mjs';
const hooks={},errors=[],opened=[];let api;
const values={partyRoster:['belwar'],libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]}};
const gm={id:'gm',isGM:true,name:'GM',active:true},alice={id:'u1',isGM:false,name:'Alice',active:true};
const bob={id:'u2',isGM:false,name:'Bob',active:true};
const users=[gm,alice,bob];
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
const jest=rec('REC-TEST-JEST',{name:'[TEST] Courtyard Jest',kind:'activity',tier:'apprentice',effort:'short',ingredients:[],required_tools:['Disguise Kit'],workstation:'[TEST] rehearsal',effect_note:'[TEST] The crowd warms to you.'});
const world=[
 worldDoc('wsalve0000000000','Recipe: [TEST] Salve',src('REC-TEST-SALVE','Recipe',{definition:salve}),true),
 worldDoc('wjest00000000000','Recipe: [TEST] Jest',src('REC-TEST-JEST','Recipe',{definition:jest}),true),
 worldDoc('wleaf00000000000','[TEST] Leaf',src('MAT-TEST-LEAF','Material',{definition:def('MAT-TEST-LEAF','Material',{name:'[TEST] Leaf'})}),true),
 worldDoc('wresin0000000000','[TEST] Resin',src('MAT-TEST-RESIN','Material',{definition:def('MAT-TEST-RESIN','Material',{name:'[TEST] Resin'})}),false),
 worldDoc('@@wsalve0000000000item@@','[TEST] Salve Vial',src('ITEM-TEST-SALVE','Item',{definition:def('ITEM-TEST-SALVE','Item',{name:'[TEST] Salve Vial'})}),true),
 worldDoc('wprof00000000000','[TEST] Alchemy — Profession',src('PROF-TEST-ALCHEMY','Profession',{definition:def('PROF-TEST-ALCHEMY','Profession',{name:'[TEST] Alchemy'})}),true)];
world.get=id=>world.find(x=>x.id===id);
const belwar={id:'belwar',name:'[TEST] Belwar',type:'character',hasPlayerOwner:true,items:[{id:'bprof',name:'[TEST] Alchemy — Profession',type:'feat',system:{quantity:1,description:{value:''}},flags:src('PROF-TEST-ALCHEMY','Profession',{definition:def('PROF-TEST-ALCHEMY','Profession',{name:'[TEST] Alchemy'})})}],flags:{'ashen-gate-profession-ledger':{knownRecipes:['REC-TEST-SALVE','REC-TEST-JEST']}},
  testUserPermission:(u,role)=>u.isGM||u.id==='u1'||(u.id==='u2'&&['LIMITED','OBSERVER'].includes(role)),
  async setFlag(scope,key,val){this.flags[scope]??={};this.flags[scope][key]=structuredClone(val);this.writes=(this.writes??0)+1;}};
const herbsDef=def('PROF-TEST-HERBS','Profession',{name:'[TEST] Herbalism'});
belwar.items.push({id:'bprof2',name:'[TEST] Herbalism — Profession',type:'feat',system:{quantity:1,description:{value:''}},flags:src('PROF-TEST-HERBS','Profession',{definition:herbsDef})});
belwar.items.get=id=>belwar.items.find(i=>i.id===id)??null;
const moduleObj={active:true,version:'0.41.1',set api(v){api=v},get api(){return api}};
globalThis.game={user:alice,users:{contents:users,get:id=>users.find(u=>u.id===id)},items:{contents:world,get:world.get},actors:{contents:[belwar],get:id=>id==='belwar'?belwar:undefined},
  socket:{emit:()=>{},on:()=>{}},modules:{get:id=>id==='ashen-gate-profession-ledger'?moduleObj:undefined},
  settings:{register:()=>{},registerMenu:()=>{},get:(id,k)=>values[k],set:async(id,k,v)=>{values[k]=v;}}};
const {_test}=await import(pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js')));hooks.init();hooks.ready();
const app=api.open({view:'individual'});app.element={querySelector:()=>null,querySelectorAll:()=>[]};
const html=async view=>{app.view=view;app.actorId='belwar';return (await app._prepareContext({})).html;};
const card=(h,name)=>{const at=h.indexOf(`<strong>${name}</strong>`);return h.slice(h.lastIndexOf('<article',at),h.indexOf('</article>',at));};

const F='ashen-gate-profession-ledger';
const flag=()=>belwar.flags[F].favorites;
const visible=h=>h.replace(/<[^>]*>/g,' ');
const reset=()=>{delete belwar.flags[F].favorites;belwar.flags[F].knownRecipes=['REC-TEST-SALVE','REC-TEST-JEST'];belwar.writes=0;game.user=alice;};

test('cleanFavorites: always {professions, recipes}; malformed, wrong-prefix and duplicate ids are ignored',()=>{
  assert.deepEqual(cleanFavorites(undefined),{professions:[],recipes:[]});
  for(const bad of [null,5,'x',[],{professions:'PROF-A',recipes:{}}])assert.deepEqual(cleanFavorites(bad),{professions:[],recipes:[]});
  assert.deepEqual(cleanFavorites({professions:['PROF-A','PROF-A','REC-A',7,null,'prof-b'],recipes:['REC-1','PROF-X','REC-1','REC-2']}),{professions:['PROF-A'],recipes:['REC-1','REC-2']});
  assert.deepEqual(favoritesOf({flags:{[F]:{favorites:'junk'}}}),{professions:[],recipes:[]});
  assert.deepEqual(favoritesOf(null),{professions:[],recipes:[]});
  assert.equal(cleanFavorites({recipes:Array.from({length:FAVORITES_MAX+20},(_,i)=>`REC-${i}`)}).recipes.length,FAVORITES_MAX);
});

test('planFavorite: add and remove; new stars must be allowed; stale ids are pruned; no-op writes nothing',()=>{
  const valid={professions:new Set(['PROF-A']),recipes:new Set(['REC-1','REC-2'])};
  let p=planFavorite(undefined,{kind:'recipe',id:'REC-1',on:true},valid);
  assert.deepEqual(p.next,{professions:[],recipes:['REC-1']});assert.equal(p.changed,true);
  p=planFavorite(p.next,{kind:'recipe',id:'REC-1',on:true},valid);assert.equal(p.changed,false,'already starred');
  p=planFavorite({professions:[],recipes:['REC-1','REC-GONE']},{kind:'recipe',id:'REC-2',on:true},valid);
  assert.deepEqual(p.next.recipes,['REC-1','REC-2'],'the stale REC-GONE is dropped when a change is written');
  assert.throws(()=>planFavorite(undefined,{kind:'recipe',id:'REC-9',on:true},valid),/knows/);
  assert.throws(()=>planFavorite(undefined,{kind:'profession',id:'PROF-Z',on:true},valid),/has/);
  assert.throws(()=>planFavorite(undefined,{kind:'recipe',id:'PROF-A',on:true},valid),/not a recipe id/);
  assert.throws(()=>planFavorite(undefined,{kind:'other',id:'REC-1',on:true},valid));
  assert.throws(()=>planFavorite(undefined,{kind:'recipe',id:'REC-1',on:'yes'},valid));
  p=planFavorite({professions:[],recipes:['REC-1']},{kind:'recipe',id:'REC-1',on:false},valid);
  assert.deepEqual(p.next.recipes,[]);assert.equal(p.changed,true);
  p=planFavorite(undefined,{kind:'recipe',id:'REC-1',on:false},valid);assert.equal(p.changed,false,'nothing stored, nothing to remove: no write');
  p=planFavorite({professions:[],recipes:['REC-GONE']},{kind:'recipe',id:'REC-GONE',on:false},valid);assert.equal(p.changed,true);
  const canAdd={professions:valid.professions,recipes:new Set(['REC-1'])};
  assert.throws(()=>planFavorite(undefined,{kind:'recipe',id:'REC-2',on:true},valid,canAdd),'a known recipe the user cannot read cannot be newly starred');
  assert.equal(planFavorite({professions:[],recipes:['REC-2']},{kind:'recipe',id:'REC-1',on:true},valid,canAdd).next.recipes.includes('REC-2'),true,'but an existing star on it is kept while it still exists');
});

test('sorting and filter: favorites first, otherwise the original order; Favorites only keeps just the starred',()=>{
  const items=['a','b','c','d'].map(id=>({id}));
  assert.deepEqual(favoritesFirst(items,['c','a'],x=>x.id).map(x=>x.id),['a','c','b','d']);
  assert.deepEqual(favoritesFirst(items,[],x=>x.id).map(x=>x.id),['a','b','c','d']);
  assert.deepEqual(items.map(x=>x.id),['a','b','c','d'],'input not changed');
  assert.deepEqual(filterFavorites(items,['b','d'],true,x=>x.id).map(x=>x.id),['b','d']);
  assert.equal(filterFavorites(items,['b'],false,x=>x.id).length,4);
});

test('api.setFavorite: an owner stars a recipe and a profession; stored per character; nothing else is touched',async()=>{
  reset();belwar.flags[F].professionProgress={marker:1};
  const out=await api.setFavorite(belwar,{kind:'recipe',id:'REC-TEST-JEST',on:true});
  assert.deepEqual(out.favorites,{professions:[],recipes:['REC-TEST-JEST']});
  await api.setFavorite(belwar,{kind:'profession',id:'PROF-TEST-HERBS',on:true});
  assert.deepEqual(flag(),{professions:['PROF-TEST-HERBS'],recipes:['REC-TEST-JEST']});
  assert.deepEqual(belwar.flags[F].knownRecipes,['REC-TEST-SALVE','REC-TEST-JEST']);assert.deepEqual(belwar.flags[F].professionProgress,{marker:1});
  assert.deepEqual(api.getFavorites(belwar),{professions:['PROF-TEST-HERBS'],recipes:['REC-TEST-JEST']});
  const again=await api.setFavorite(belwar,{kind:'recipe',id:'REC-TEST-JEST',on:true});assert.equal(again.changed,false);
  await api.setFavorite(belwar,{kind:'recipe',id:'REC-TEST-JEST',on:false});assert.deepEqual(flag().recipes,[]);
});

test('api.setFavorite: other players are refused in the data layer; the GM may; observers can read',async()=>{
  reset();
  game.user=bob;
  await assert.rejects(api.setFavorite(belwar,{kind:'recipe',id:'REC-TEST-SALVE',on:true}),/OWNER permission/);
  assert.equal(belwar.writes,0);assert.equal(flag(),undefined);
  assert.deepEqual(api.getFavorites(belwar),{professions:[],recipes:[]},'an observer can read');
  game.user=gm;
  await api.setFavorite(belwar,{kind:'recipe',id:'REC-TEST-SALVE',on:true});
  assert.deepEqual(flag().recipes,['REC-TEST-SALVE']);
  game.user=bob;
  await assert.rejects(api.setFavorite(belwar,{kind:'recipe',id:'REC-TEST-SALVE',on:false}),/OWNER permission/);
  assert.deepEqual(flag().recipes,['REC-TEST-SALVE']);
  await assert.rejects(api.setFavorite(null,{kind:'recipe',id:'REC-TEST-SALVE',on:true}));
  game.user=alice;
  const stranger={...belwar,testUserPermission:()=>false};
  assert.throws(()=>api.getFavorites(stranger),/denied/);
});

test('api.setFavorite: only known, readable recipes and held professions can be starred (nothing is revealed)',async()=>{
  reset();
  await assert.rejects(api.setFavorite(belwar,{kind:'recipe',id:'REC-TEST-UNKNOWN',on:true}),/knows/);
  belwar.flags[F].knownRecipes.push('REC-TEST-NOWORLD');
  await assert.rejects(api.setFavorite(belwar,{kind:'recipe',id:'REC-TEST-NOWORLD',on:true}),/knows/,'known but the player cannot read it');
  await assert.rejects(api.setFavorite(belwar,{kind:'profession',id:'PROF-TEST-SMITH',on:true}),/has/);
  await assert.rejects(api.setFavorite(belwar,{kind:'recipe',id:'not an id',on:true}),/not a recipe id/);
  assert.equal(belwar.writes,0);
});

test('stale and malformed stored favorites never error: ignored on read, dropped on the next change',async()=>{
  reset();
  for(const junk of ['text',42,[],{recipes:'REC-TEST-SALVE'},{professions:[1],recipes:[null,'REC-TEST-GONE']}]){
    belwar.flags[F].favorites=junk;
    assert.deepEqual(api.getFavorites(belwar),{professions:[],recipes:[]});
    assert.doesNotThrow(()=>favoritesOf(belwar));
    assert.match(await html('individual'),/Known recipes/);
  }
  belwar.flags[F].favorites={professions:['PROF-TEST-OLD'],recipes:['REC-TEST-GONE','REC-TEST-SALVE']};
  assert.deepEqual(api.getFavorites(belwar),{professions:[],recipes:['REC-TEST-SALVE']});
  await api.setFavorite(belwar,{kind:'profession',id:'PROF-TEST-ALCHEMY',on:true});
  assert.deepEqual(flag(),{professions:['PROF-TEST-ALCHEMY'],recipes:['REC-TEST-SALVE']},'stale ids gone, valid ones kept');
});

test('favorites survive the recipe being forgotten and relearned only while the id stays known (stable ids)',async()=>{
  reset();await api.setFavorite(belwar,{kind:'recipe',id:'REC-TEST-SALVE',on:true});
  belwar.flags[F].knownRecipes=['REC-TEST-JEST'];
  assert.deepEqual(api.getFavorites(belwar).recipes,[]);
  belwar.flags[F].knownRecipes=['REC-TEST-JEST','REC-TEST-SALVE'];
  assert.deepEqual(api.getFavorites(belwar).recipes,['REC-TEST-SALVE'],'same id, same star (nothing was written in between)');
});

test('two quick clicks on one character are applied one after the other',async()=>{
  reset();
  await Promise.all([api.setFavorite(belwar,{kind:'recipe',id:'REC-TEST-SALVE',on:true}),api.setFavorite(belwar,{kind:'recipe',id:'REC-TEST-JEST',on:true})]);
  assert.deepEqual([...flag().recipes].sort(),['REC-TEST-JEST','REC-TEST-SALVE']);
});


test('markup: star buttons are real buttons with a stable label, aria-pressed, tooltip, filled or outline icon and hidden text',async()=>{
  reset();await api.setFavorite(belwar,{kind:'recipe',id:'REC-TEST-JEST',on:true});
  const h=await html('individual');
  const jest=card(h,'[TEST] Courtyard Jest'),salve=card(h,'[TEST] Salve');
  assert.match(jest,/<button type="button" class="[^"]*agl-fav is-on[^"]*" data-action="fav-recipe" data-id="REC-TEST-JEST" data-actor="belwar" aria-pressed="true" aria-label="Favorite recipe: \[TEST\] Courtyard Jest" data-tooltip="Remove from favorites"[^>]*><i class="fa-solid fa-star" aria-hidden="true"><\/i><span class="ag-sr-only">Favorite<\/span><\/button>/);
  assert.match(salve,/data-action="fav-recipe"[^>]*aria-pressed="false" aria-label="Favorite recipe: \[TEST\] Salve" data-tooltip="Add to favorites"[^>]*><i class="fa-regular fa-star" aria-hidden="true"><\/i><span class="ag-sr-only">Not a favorite<\/span>/);
  assert.match(h,/data-action="fav-profession" data-id="PROF-TEST-ALCHEMY" data-actor="belwar" aria-pressed="false" aria-label="Favorite profession: \[TEST\] Alchemy"/);
});

test('markup: favorite recipes sort first, favorite professions first, and the sidebar lists the starred recipes',async()=>{
  reset();
  let h=await html('individual');
  const order=x=>[...x.matchAll(/<article class="ag-card agl-recipe-row"[^>]*>\s*<div class="agl-recipe-head">\s*<div class="agl-recipe-title"><button[^>]*data-action="fav-recipe" data-id="([^"]+)"/g)].map(m=>m[1]);
  const before=order(h);
  assert.match(h,/Favorite recipes <span class="ag-badge">0<\/span>/);assert.match(h,/Star a recipe under Known recipes/);
  await api.setFavorite(belwar,{kind:'recipe',id:before[1],on:true});
  h=await html('individual');
  assert.deepEqual(order(h),[before[1],before[0]],'the starred recipe moves up, the rest keep their order');
  const side=h.slice(h.indexOf('agl-favs'),h.indexOf('<h3>Materials'));
  assert.match(side,/Favorite recipes <span class="ag-badge">1<\/span>/);
  assert.match(side,new RegExp(`<button type="button" class="ag-link" data-action="fav-jump" data-id="${before[1]}"`));
  assert.match(side,/data-action="fav-recipe"[^>]*data-where="side"[^>]*aria-pressed="true"/,'the sidebar star removes it');
  const profOrder=x=>[...x.matchAll(/data-action="fav-profession" data-id="([^"]+)"/g)].map(m=>m[1]);
  const p0=profOrder(h);assert.equal(p0.length,2);
  await api.setFavorite(belwar,{kind:'profession',id:p0[1],on:true});
  h=await html('individual');
  assert.deepEqual(profOrder(h),[p0[1],p0[0]],'the starred profession is pinned to the top');
});

test('markup: Favorites only (n) is a pressed-state chip and filters the Known recipes list; search and grouping stay',async()=>{
  reset();await api.setFavorite(belwar,{kind:'recipe',id:'REC-TEST-JEST',on:true});
  app.favOnly=false;let h=await html('individual');
  assert.match(h,/<button type="button" class="ag-chip" data-action="fav-only" aria-pressed="false"[^>]*>Favorites only \(1\)<\/button>/);
  assert.match(h,/data-recipe-search/);assert.equal([...h.matchAll(/<article class="ag-card agl-recipe-row"/g)].length,2);
  app.favOnly=true;h=await html('individual');
  assert.match(h,/data-action="fav-only" aria-pressed="true"/);
  assert.equal([...h.matchAll(/<article class="ag-card agl-recipe-row"/g)].length,1);assert.match(card(h,'[TEST] Courtyard Jest'),/Courtyard Jest/);
  assert.match(h,/class="agl-folder"/,'still grouped by profession');
  await api.setFavorite(belwar,{kind:'recipe',id:'REC-TEST-JEST',on:false});
  h=await html('individual');assert.match(visible(h),/No favorite recipes yet/);
  app.favOnly=false;
});

test('markup: a viewer who does not own the character gets no star buttons, and the GM does',async()=>{
  reset();
  game.user=bob;let h=await html('individual');
  assert.doesNotMatch(h,/data-action="fav-/);assert.doesNotMatch(h,/agl-favs/);
  game.user=gm;h=await html('individual');assert.match(h,/data-action="fav-recipe"/);
  game.user=alice;
});

test('UI wiring: the click handlers for fav-recipe, fav-profession, fav-only and fav-jump are in the window, the sheet tab and the embed',async()=>{
  const fs=await import('node:fs');
  const code=fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js'),'utf8');
  assert.match(code,/action==='fav-only'/);assert.match(code,/action==='fav-recipe'\|\|action==='fav-profession'/);assert.match(code,/action==='fav-jump'/);
  assert.equal([...code.matchAll(/favoriteClick\(/g)].length>=4,true,'defined once, used by the window, the sheet tab and the embed');
  assert.equal([...code.matchAll(/favJumpClick\(b\)/g)].length,2,'sheet tab and embed');
  assert.match(code,/captureFocus\(target\)[\s\S]{0,200}restoreFocus\(target,kept\)/,'sheet tab keeps focus on the same control');
  // The click path itself: a toggle button toggles the stored flag.
  reset();
  const click=()=>_test.favoriteClick({dataset:{action:'fav-recipe',id:'REC-TEST-SALVE',actor:'belwar'}});
  assert.equal(await click(),true);assert.deepEqual(flag().recipes,['REC-TEST-SALVE'],'first click stars');
  assert.equal(await click(),true);assert.deepEqual(flag().recipes,[],'second click un-stars');
  assert.equal(await _test.favoriteClick({dataset:{action:'craft'}}),false);
  game.user=bob;await assert.rejects(click(),/OWNER permission/);game.user=alice;
});
