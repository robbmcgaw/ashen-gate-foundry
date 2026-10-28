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
const moduleObj={active:true,version:'0.38.0',set api(v){api=v},get api(){return api}};
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
  assert.ok(h.indexOf('Station')<h.indexOf('Needs')&&h.indexOf('Needs')<h.indexOf('Makes')&&h.indexOf('Makes')<h.indexOf('Heals a little'),'0.37.2: the tool or station line stays above the folding details; inside them Needs, Makes, then the summary');
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

/* ---- 0.37.2: Individual recipe cards fold their details like the Party's ---------------------------------- */
const memory=new Map();let writes=0;globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>{writes++;memory.set(k,String(v));},removeItem:k=>memory.delete(k)};
const RD=_test.recipeDetails;
const fakeDetails=(name,open=true)=>{const key=RD.key(name);return {dataset:{recipeDetails:key,storedOpen:'1'},open,key};};

test('Individual card: the head, the tool or station line (with its warning) and the status stay visible; the rest folds; open by default for players and GMs',async()=>{
 RD.reset();memory.clear();
 for(const user of ['player','gm']){
  if(user==='gm')game.user=gm;
  const jest=card(await html('individual'),'[TEST] Courtyard Jest');
  const at=jest.indexOf('<details class="agl-recipe-more" data-recipe-details=');
  assert.ok(at>0,`${user}: folds`);assert.match(jest.slice(at,at+160),/data-stored-open="1" open>/,'open by default: the first view is unchanged');
  const outside=jest.slice(0,at);
  assert.match(outside,/<strong>\[TEST\] Courtyard Jest<\/strong>/,'title stays');assert.match(outside,/Activity|Apprentice|effort/,'badges stay');
  assert.match(outside,/agl-recipe-station/,'the tool or station line stays visible when the details are collapsed');
  assert.match(outside,/agl-recipe-station[^]*ag-badge/,'the tool state badge (Ready / missing) is part of the visible line, so a missing-tool warning is never folded away');
  assert.ok(!jest.slice(at).includes('class="agl-recipe-station"'),'and it is not repeated inside');
 }
 game.user=alice;
 const salve=card(await html('individual'),'[TEST] Salve');
 assert.ok(salve.indexOf('Laboratory')<salve.indexOf('<details'),'the station is above the fold');assert.ok(salve.indexOf('Needs')>salve.indexOf('<details'),'Needs → Makes and the text are inside it');
});

test('search matches words inside the details (ingredients, summary) and opens a collapsed match; clearing it puts back what was remembered',async()=>{
 const h=await html('individual');
 const search=name=>h.match(new RegExp(`<article class="ag-card agl-recipe-row" data-recipe-search="([^"]*)">[^]*?<strong>${name.replace(/[[\]]/g,'\\$&')}</strong>`))[1];
 const salve=search('[TEST] Salve');
 assert.match(salve,/leaf/,'an ingredient name');assert.match(salve,/heals a little/,'the summary text');assert.match(salve,/laboratory/,'the station');
 const d1=fakeDetails('a',false),d2=fakeDetails('b',false);d2.dataset.storedOpen='0';
 const rows=[{hidden:false,dataset:{recipeSearch:'salve leaf'},querySelector:()=>d1},{hidden:false,dataset:{recipeSearch:'sword'},querySelector:()=>d2}];
 const root={querySelectorAll:s=>s==='[data-recipe-search]'?rows:[],querySelector:()=>null};
 const app2=api.open({view:'individual'});app2.element=root;
 app2.query='leaf';app2._applySearch();
 assert.deepEqual([rows[0].hidden,rows[1].hidden],[false,true]);assert.equal(d1.open,true,'the matching card opens even though it was collapsed');
 d1.open=false;d1.dataset.storedOpen='0';app2.query='';app2._applySearch();assert.equal(d1.open,false,'cleared: back to what was remembered');
 d2.open=true;d2.dataset.storedOpen='1';app2.query='';app2._applySearch();assert.equal(d2.open,true);
});

test('Expand all / Collapse all (Known recipes header) and single toggles: in place, remembered per recipe, one coalesced write, no re-render',async()=>{
 RD.reset();memory.clear();writes=0;
 const h=await html('individual');
 assert.match(h,/data-action="details-expand"><i[^>]*><\/i> Expand all<\/button><button type="button" class="ag-btn ag-btn--sm" data-action="details-collapse">/,'in the Known recipes header');
 const app2=api.open({view:'individual'});let renders=0;app2.render=()=>{renders++;return app2;};
 const list=[fakeDetails('r1'),fakeDetails('r2'),fakeDetails('r3')];
 app2.element={querySelectorAll:s=>s==='details[data-recipe-details]'?list:[],querySelector:()=>null};
 await app2._click('details-collapse');
 assert.ok(list.every(d=>d.open===false&&d.dataset.storedOpen==='0'));assert.equal(RD.isOpen('r1'),false);assert.equal(renders,0,'no re-render');assert.equal(writes,0,'nothing written per click');
 await new Promise(r=>setTimeout(r,260));assert.equal(writes,1,'one write for the whole burst');
 assert.match(memory.get([...memory.keys()][0]),/"recipeDetails":\{/,'in the per-user store');
 await app2._click('details-expand');assert.ok(list.every(d=>d.open===true));assert.equal(RD.isOpen('r1'),true,'open is the default, so nothing is stored for it');
 // The remembered state is what a later render uses.
 RD.reset();memory.clear();
 const keyed=(await html('individual')).match(/data-recipe-details="(r[a-z0-9]+)"/)[1];
 assert.ok(keyed);RD.flush();
 game.user=alice;
});

test('the sheet tab and players’ markup never carry a raw recipe id for the remembered state',async()=>{
 const h=await html('individual');
 assert.ok([...h.matchAll(/data-recipe-details="([^"]*)"/g)].every(m=>/^r[a-z0-9]+$/.test(m[1])));
});
