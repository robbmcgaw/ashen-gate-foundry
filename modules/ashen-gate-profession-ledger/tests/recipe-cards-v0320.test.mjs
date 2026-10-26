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
  testUserPermission:(u,role)=>u.isGM||u.id==='u1'||role==='LIMITED'};
belwar.items.get=id=>belwar.items.find(i=>i.id===id)??null;
const moduleObj={active:true,version:'0.33.1',set api(v){api=v},get api(){return api}};
globalThis.game={user:alice,users:{contents:users,get:id=>users.find(u=>u.id===id)},items:{contents:world,get:world.get},actors:{contents:[belwar],get:id=>id==='belwar'?belwar:undefined},
  socket:{emit:()=>{},on:()=>{}},modules:{get:id=>id==='ashen-gate-profession-ledger'?moduleObj:undefined},
  settings:{register:()=>{},registerMenu:()=>{},get:(id,k)=>values[k],set:async(id,k,v)=>{values[k]=v;}}};
const {_test}=await import(pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js')));hooks.init();hooks.ready();
const app=api.open({view:'individual'});app.element={querySelector:()=>null,querySelectorAll:()=>[]};
const html=async view=>{app.view=view;app.actorId='belwar';return (await app._prepareContext({})).html;};
const card=(h,name)=>{const at=h.indexOf(`<strong>${name}</strong>`);return h.slice(h.lastIndexOf('<article',at),h.indexOf('</article>',at));};
const visible=h=>h.replace(/<[^>]*>/g,' ');

test('tier colours: rarity by tier (Apprentice common, Journeyman uncommon, Artisan rare, Expert very rare, Master legendary)',()=>{
  assert.deepEqual({...TIER_RARITY},{apprentice:'common',journeyman:'uncommon',artisan:'rare',expert:'veryRare',master:'legendary'});
  assert.equal(tierRarity('Expert'),'veryRare');assert.equal(tierRarity(' master '),'legendary');assert.equal(tierRarity('Mythic'),null);assert.equal(tierRarity(null),null);
  assert.equal(tierBadge('Artisan',esc),'<span class="ag-rarity-badge agl-tier" data-rarity="rare">Artisan</span>','the tier name is the badge text');
  assert.equal(tierBadge('Mythic',esc),'<span class="agl-tier">Mythic</span>','unknown tier: plain text, no colour');
  assert.equal(tierBadge('',esc),'');
});

test('standard recipe card: header badges, Needs → Makes, effort, station, summary, no raw ids (player)',async()=>{
  const h=card(await html('individual'),'[TEST] Salve');
  assert.match(h,/<span class="agl-recipe-badges">.*data-rarity="veryRare">Expert<\/span>.*Long effort<\/span><\/span>/s,'tier badge in the kit rarity colour, effort badge');
  assert.match(h,/<span class="agl-label">Needs<\/span><ul class="agl-ings">/);assert.match(h,/<span class="agl-label">Makes<\/span>/);
  assert.ok(h.indexOf('Needs')<h.indexOf('Makes')&&h.indexOf('Makes')<h.indexOf('Station')&&h.indexOf('Station')<h.indexOf('Heals a little'),'Needs, Makes, Station, then the summary');
  assert.match(h,/<span class="agl-qty">2 ×<\/span>/);
  assert.match(h,/<span class="agl-label agl-label--inline">Station<\/span>/,'a workstation recipe names no tool');
  assert.match(h,/<span class="agl-label agl-label--inline">Station<\/span> <span>\[TEST\] Laboratory<\/span>/);
  assert.doesNotMatch(h,/(REC|MAT|ITEM|PROF)-TEST/,'no internal ids in the card’s text or tooltips');
  assert.doesNotMatch(h.replace(/data-id="[^"]*"/g,''),/(REC|MAT|ITEM|PROF)-/,'none in the markup either (apart from the action buttons’ own data-id)');
});

test('item links: a player gets a real button for items they may open, plain text with a tooltip for the rest',async()=>{
  const h=card(await html('individual'),'[TEST] Salve');
  assert.match(h,/<button type="button" class="ag-link agl-item-link" data-action="open-item" data-uuid="Item\.wleaf00000000000" data-ctx="[a-z0-9]+" [^>]*>\[TEST\] Leaf<\/button>/,'material the player may see');
  // Result: the player has Observer permission on it.
  assert.match(h,/data-uuid="Item\.@@wsalve0000000000item@@"[^>]*>\[TEST\] Salve Vial<\/button>/);
  // Resin: released but the player has no Observer permission; Lost: not in the world at all.
  assert.doesNotMatch(h,/wresin0000000000/);assert.match(h,/<span class="agl-item-plain" data-tooltip="Your GM hasn’t released this item to you yet\."[^>]*>\[TEST\] Resin<\/span>/);
  assert.doesNotMatch(h,/data-uuid="[^"]*"[^>]*>Test Lost/);assert.doesNotMatch(visible(h),/not imported|GM:/,'no GM hint for a player');
});

test('item links: the GM sees links for any imported item and a GM-only hint for an item that is not imported',async()=>{
  game.user=gm;
  const h=card(await html('catalog'),'[TEST] Salve');
  assert.match(h,/data-uuid="Item\.wresin0000000000"[^>]*>\[TEST\] Resin<\/button>/,'the GM can open everything imported');
  assert.match(h,/<span class="agl-item-plain">Test Lost<\/span> <small class="agl-sub">GM: not imported yet<\/small>/);
  assert.doesNotMatch(visible(h),/(REC|MAT|ITEM|PROF)-TEST/,'the GM sees no raw ids either');
  game.user=alice;
});

test('clicking an item link opens the sheet; permission is checked again at click time',async()=>{
  opened.length=0;errors.length=0;
  const btn=uuid=>({dataset:{action:'open-item',uuid}});
  assert.equal(_test.itemLinkClick({dataset:{action:'craft'}}),false,'other actions are left alone');
  assert.equal(_test.itemLinkClick(btn('Item.wleaf00000000000')),true);await new Promise(r=>setImmediate(r));
  assert.deepEqual(opened,['wleaf00000000000']);
  await _test.openItemLink('Item.wresin0000000000');assert.deepEqual(opened,['wleaf00000000000'],'a player cannot open an item they have no Observer permission on, even with the uuid');
  await _test.openItemLink('Item.wprof00000000000');assert.deepEqual(opened,['wleaf00000000000'],'only the requested entity types: a Profession record is not an item link target for a Material/Item lookup');
  await _test.openItemLink('Actor.belwar');await _test.openItemLink('Item.nope');assert.equal(opened.length,1,'garbage uuids open nothing');
  assert.ok(errors.length>=3);
  game.user=gm;await _test.openItemLink('Item.wresin0000000000');assert.deepEqual(opened,['wleaf00000000000','wresin0000000000'],'the GM can');game.user=alice;
});

test('activity card: Uses / Station / Effect in the same style, no Needs or Makes',async()=>{
  const h=card(await html('individual'),'[TEST] Courtyard Jest');
  assert.match(h,/<span class="ag-badge">Activity<\/span>.*data-rarity="common">Apprentice<\/span>.*Short effort/s);
  assert.match(h,/<span class="agl-label agl-label--inline">Uses<\/span> <span>Disguise Kit<\/span>/);
  assert.match(h,/<span class="agl-label agl-label--inline">Station<\/span> <span>\[TEST\] rehearsal<\/span>/);
  assert.match(h,/<p class="agl-recipe-effect"><span class="agl-label">Effect<\/span> \[TEST\] The crowd warms to you\./);
  assert.doesNotMatch(h,/>Needs<|>Makes</);
});

test('the Professions box and the Party tab use the tier colours too; the tier text is always there',async()=>{
  const ind=await html('individual');
  assert.match(ind,/<span class="ag-meter__label"><span class="ag-rarity-badge agl-tier" data-rarity="[a-zA-Z]+">[A-Za-z]+<\/span><\/span>/);
  const party=await html('party');
  assert.match(party,/data-rarity="veryRare">Expert<\/span>/);
});
