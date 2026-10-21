import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {planCraft,executeCraft,ConsentBroker,resultItemData,craftBlockers} from '../scripts/crafting.mjs';
// 0.9.0: Individual crafting bench, player learning, owner consent for shared materials, visible XP, Tidy5e tab.
const hooks={},errors=[],infos=[],chats=[],sent=[],dialogs=[];let api;
const values={partyRoster:['belwar','tarra'],libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]}};
const gm={id:'gm',isGM:true,name:'GM',active:true},alice={id:'u1',isGM:false,name:'Alice',active:true},bob={id:'u2',isGM:false,name:'Bob',active:true};
const users=[gm,alice,bob];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
let confirmAnswer=true;
class FakeDialog{constructor(opts){this.opts=opts;dialogs.push(this);}render(){this.rendered=true;return this;}async close(){this.closed=true;}
  static async wait(){return confirmAnswer;}
  click(action){this.opts.buttons.find(b=>b.action===action).callback();}}
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){this.rendered=true;return this;}},HandlebarsApplicationMixin:c=>c,DialogV2:FakeDialog}},utils:{escapeHTML:esc,randomID:()=>`id${Math.random().toString(36).slice(2,10)}`}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{}};
globalThis.ui={notifications:{info:m=>infos.push(String(m)),error:e=>errors.push(String(e))}};
globalThis.ChatMessage={create:async x=>{chats.push(x);return x;},getSpeaker:({actor}={})=>({alias:actor?.name})};
const def=(id,type,extra={})=>({id,entity_type:type,version:'0.1.0',refs:[],...extra});
const src=(id,type,{visibility='player',status='approved',definition=null}={})=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility,status,version:'0.1.0',refs:[],...(definition?{definition}:{})}}});
const worldDoc=(id,name,flags,img='')=>({id,uuid:`Item.${id}`,name,img,type:'loot',flags,system:{description:{value:''}},testUserPermission:u=>u.isGM,
  toObject(){return {_id:this.id,name:this.name,img:this.img,type:this.type,folder:'f1',ownership:{default:0},flags:structuredClone(this.flags),system:{description:{value:'[TEST] result'}}};}});
const salve=def('REC-TEST-SALVE','Recipe',{name:'[TEST] Salve',profession_id:'PROF-TEST-ALCHEMY',result_item_id:'ITEM-TEST-SALVE',tier:'apprentice',effort:'short',additional_gp:20,
  rules_summary:'[TEST] Heals a little.',ingredients:[{material_id:'MAT-TEST-LEAF',quantity:2}]});
const tea=def('REC-TEST-TEA','Recipe',{name:'[TEST] Tea',profession_id:'PROF-TEST-ALCHEMY',result_item_id:'ITEM-TEST-TEA',tier:'journeyman',ingredients:[{material_id:'MAT-TEST-LEAF',quantity:1}]});
const world=[
 worldDoc('wsalve','Recipe: [TEST] Salve',src('REC-TEST-SALVE','Recipe',{definition:salve})),
 worldDoc('wtea','Recipe: [TEST] Tea',src('REC-TEST-TEA','Recipe',{definition:tea})),
 worldDoc('wdraft','Recipe: [TEST] Draft Brew',src('REC-TEST-DRAFT','Recipe',{status:'draft',definition:def('REC-TEST-DRAFT','Recipe',{name:'[TEST] Draft Brew',ingredients:[{material_id:'MAT-TEST-LEAF',quantity:1}]})})),
 worldDoc('wleaf','[TEST] Leaf',src('MAT-TEST-LEAF','Material',{definition:def('MAT-TEST-LEAF','Material',{name:'[TEST] Leaf'})})),
 worldDoc('witem','[TEST] Salve',src('ITEM-TEST-SALVE','Item',{definition:def('ITEM-TEST-SALVE','Item',{name:'[TEST] Salve'})}),'icons/salve.webp'),
 worldDoc('wtea2','[TEST] Tea',src('ITEM-TEST-TEA','Item',{definition:def('ITEM-TEST-TEA','Item',{name:'[TEST] Tea'})})),
 worldDoc('wprof','[TEST] Alchemy — Profession',src('PROF-TEST-ALCHEMY','Profession',{definition:def('PROF-TEST-ALCHEMY','Profession',{name:'[TEST] Alchemy'})})),
];
world.get=id=>world.find(x=>x.id===id);
const held=(id,name,flags,qty=1,extra={})=>({id,name,type:'loot',system:{quantity:qty,description:{value:'<p>Feature text</p>'}},flags,...extra,toObject(){return {_id:this.id,name:this.name,type:this.type,system:structuredClone(this.system),flags:structuredClone(this.flags)};}});
let failCreate=false;
const makeActor=(id,name,ownerId,items,known=[])=>{const inv=[...items];inv.get=i=>inv.find(x=>x.id===i);let n=0;
 const a={id,name,type:'character',hasPlayerOwner:true,items:inv,flags:{'ashen-gate-profession-ledger':{knownRecipes:known}},
  testUserPermission:(u,role)=>u.isGM||u.id===ownerId||role==='LIMITED',
  setFlag:async(scope,key,v)=>{a.flags[scope]??={};a.flags[scope][key]=structuredClone(v);},
  updateEmbeddedDocuments:async(t,ups)=>{for(const u of ups){const it=inv.get(u._id);for(const [k,v] of Object.entries(u))if(k!=='_id'){const parts=k.split('.');let o=it;while(parts.length>1)o=o[parts.shift()];o[parts[0]]=v;}}return ups;},
  deleteEmbeddedDocuments:async(t,ids)=>{for(const i of ids)inv.splice(inv.findIndex(x=>x.id===i),1);return ids;},
  createEmbeddedDocuments:async(t,docs,opts={})=>{if(failCreate&&!opts.keepId)throw Error('disk full');const out=docs.map(d=>held(opts.keepId?d._id:`${id}-new${n++}`,d.name,d.flags,d.system?.quantity??1));inv.push(...out);return out;}};
 return a;};
const leaf=(id,qty)=>held(id,'[TEST] Leaf',src('MAT-TEST-LEAF','Material',{status:'draft'}),qty);
const belwar=makeActor('belwar','[TEST] Belwar','u1',[
 leaf('bleaf',1),
 held('bprof','[TEST] Alchemy — Profession',src('PROF-TEST-ALCHEMY','Profession',{definition:def('PROF-TEST-ALCHEMY','Profession',{name:'[TEST] Alchemy'})}),1,{type:'feat'}),
 held('bdraft','Recipe: [TEST] Draft Brew',src('REC-TEST-DRAFT','Recipe',{status:'draft'})),
 held('bsecret','[TEST] Secret Ore',src('MAT-TEST-SECRET','Material',{visibility:'gm'}),5),
 held('btea','Recipe: [TEST] Tea',src('REC-TEST-TEA','Recipe'),2)],['REC-TEST-SALVE']);
const tarra=makeActor('tarra','[TEST] Tarra','u2',[leaf('tleaf',3)]);
const all=[belwar,tarra];
const moduleObj={active:true,version:'0.9.0',set api(v){api=v},get api(){return api}};
globalThis.game={user:alice,users:{contents:users,get:id=>users.find(u=>u.id===id),get activeGM(){return gm;}},items:{contents:world,get:world.get},
 actors:{contents:all,get:id=>all.find(a=>a.id===id)},socket:{emit:(name,msg)=>sent.push({name,msg}),on:()=>{}},
 modules:{get:id=>id==='ashen-gate-profession-ledger'?moduleObj:undefined},
 settings:{register:()=>{},registerMenu:()=>{},get:(id,k)=>values[k],set:async(id,k,v)=>{values[k]=v;}}};
const entry=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js');
const {_test}=await import(pathToFileURL(entry));hooks.init();hooks.ready();
const app=api.open({view:'individual'});
const html=async view=>{app.view=view;return (await app._prepareContext({})).html;};
const text=h=>h.replace(/<[^>]*>/g,' ');
const flush=()=>new Promise(r=>setImmediate(r));
const qty=(actor,id)=>actor.items.get(id)?.system.quantity;
const nextSent=type=>{const i=sent.findIndex(s=>s.msg.type===type);return i<0?null:sent.splice(i,1)[0].msg;};

test('crafting core: own materials first, verify before write, roll back on failure',async()=>{
 const recipe={id:'REC-X',name:'X',hasStructuredIngredients:true,ingredients:[{materialId:'MAT-TEST-LEAF',name:'Leaf',quantity:2}]};
 const a=makeActor('a','A','u1',[leaf('l1',1)]),b=makeActor('b','B','u2',[leaf('l2',5)]);
 const plan=planCraft(recipe,a,[b]);
 assert.equal(plan.ready,true);assert.equal(plan.ownReady,false);
 assert.deepEqual(plan.allocations.map(x=>[x.actorId,x.quantity]),[['a',1],['b',1]],'crafter’s own Items are used first');
 const actorOf=id=>({a,b})[id];
 await assert.rejects(()=>executeCraft({crafter:a,recipe,allocations:plan.allocations,resultData:{name:'X'},resultId:'ITEM-X',actorOf,canWrite:x=>x===a}),/not granted/);
 assert.equal(qty(a,'l1'),1);assert.equal(qty(b,'l2'),5,'nothing written when a contributor was not approved');
 failCreate=true;
 await assert.rejects(()=>executeCraft({crafter:a,recipe,allocations:plan.allocations,resultData:{name:'X'},resultId:'ITEM-X',actorOf,canWrite:()=>true}),/materials were restored/);
 failCreate=false;
 assert.equal(qty(a,'l1'),1,'deleted stack recreated');assert.equal(qty(b,'l2'),5,'decrement reversed');
 const out=await executeCraft({crafter:a,recipe,allocations:plan.allocations,resultData:{name:'X',flags:src('ITEM-X','Item'),system:{quantity:1}},resultId:'ITEM-X',actorOf,canWrite:()=>true});
 assert.equal(a.items.get('l1'),undefined);assert.equal(qty(b,'l2'),4);assert.equal(out.created.name,'X');
 b.items.get('l2').system.quantity=0;
 assert.equal(planCraft(recipe,a,[b]).ready,false);
 const data=resultItemData(world.get('witem'),{recipeId:'REC-TEST-SALVE',resultId:'ITEM-TEST-SALVE'});
 assert.equal(data._id,undefined);assert.equal(data.folder,undefined);assert.equal(data.system.quantity,1);
 assert.equal(data.flags['ashen-gate-profession-ledger'].craftedFrom,'REC-TEST-SALVE');
 assert.deepEqual(craftBlockers({recipe:{...recipe,id:'REC-Y'},crafter:a,knownIds:[],result:{}}),['A has not learned this recipe.']);
});

test('consent broker: only addressed owners count, any decline or timeout cancels',async()=>{
 const out=[];let timer;let i=0;
 const broker=new ConsentBroker({send:m=>out.push(m),newId:()=>`c${i++}`,setTimer:f=>(timer=f),clearTimer:()=>{}});
 const asked=broker.ask({requestId:'r1',requester:'Alice',crafterName:'B',recipeName:'Salve',requests:[{actorId:'t',actorName:'Tarra',approverIds:['u2'],rows:[]},{actorId:'v',actorName:'Vex',approverIds:['u3'],rows:[]}]});
 assert.equal(out.filter(m=>m.type==='consent-request').length,2);
 assert.equal(broker.deliver({type:'consent-response',requestId:'r1',consentId:'c0',approved:true},'u1'),false,'a non-owner cannot answer');
 broker.deliver({type:'consent-response',requestId:'r1',consentId:'c0',approved:true},'u2');
 broker.deliver({type:'consent-response',requestId:'r1',consentId:'c1',approved:false},'u3');
 assert.deepEqual(await asked,{approved:false,declinedBy:'Vex',reason:'Vex\'s owner declined'});
 assert.equal(out.at(-1).type,'consent-closed');
 const slow=broker.ask({requestId:'r2',requester:'A',crafterName:'B',recipeName:'S',requests:[{actorId:'t',actorName:'Tarra',approverIds:['u2'],rows:[]}]});
 timer();assert.equal((await slow).approved,false);
});

test('player Individual view: own materials, professions with XP, known recipes with Craft; no IDs or draft noise',async()=>{
 const h=await html('individual');
 assert.match(h,/\[TEST\] Belwar/);
 assert.match(h,/\[TEST\] Leaf<\/span><\/span><span class="ag-row__end">(<span class="ag-rarity-badge"[^>]*>[^<]*<\/span>)?<b>× 1/,'a draft-status material the character holds is shown');
 assert.doesNotMatch(h,/Secret Ore/,'GM-only materials stay hidden');
 assert.match(h,/<strong>\[TEST\] Alchemy<\/strong>/);assert.match(h,/Level 1/);assert.match(h,/0 XP · 5 XP to level 2/);
 assert.match(h,/XP is stored on \[TEST\] Belwar by the Profession Ledger/);
 assert.match(h,/data-folder="testalchemy"/,'known recipes foldered by profession');
 assert.match(h,/\[TEST\] Salve/);assert.match(h,/also costs 20 gp \(not deducted automatically\)/);
 assert.match(h,/data-action="craft" data-id="REC-TEST-SALVE"/);assert.match(h,/Craft — ask the party/,'Belwar has 1 of 2 leaves; Tarra has more');
 assert.match(h,/data-action="learn-recipe" data-id="belwar:btea"/,'recipe items have a Learn button');
 assert.doesNotMatch(h,/Draft Brew/,'draft recipe items are not shown to players');
 assert.doesNotMatch(text(h),/(REC|MAT|PROF|ITEM)-TEST-/,'no raw IDs for players');
 assert.doesNotMatch(h,/data-action="award-xp"/);
 assert.doesNotMatch(h,/data-id="gm"/);
});

test('player learns from their own inventory; learning another player’s item is refused',async()=>{
 await app._click('learn-recipe','belwar:btea',{actor:'belwar'});
 assert.deepEqual(belwar.flags['ashen-gate-profession-ledger'].knownRecipes,['REC-TEST-SALVE','REC-TEST-TEA']);
 assert.equal(qty(belwar,'btea'),1);
 tarra.items.push(held('tsalve','Recipe: [TEST] Salve',src('REC-TEST-SALVE','Recipe')));
 await assert.rejects(()=>api.learnRecipe(tarra,tarra.items.get('tsalve')),/OWNER/);
 await app._click('learn-recipe','belwar:bdraft',{actor:'belwar'});
 assert.ok(errors.some(e=>e.includes('not released')));assert.ok(belwar.items.get('bdraft'));
});

test('tier is enforced only from tracked progress; unknown recipes cannot be crafted',async()=>{
 belwar.flags['ashen-gate-profession-ledger'].professionProgress={schema:'ag-profession-actor-progress/0.1',professions:{'PROF-TEST-ALCHEMY':{xp:0,selectedPerkIds:[]}}};
 const h=await html('individual');
 assert.match(h,/Needs Journeyman \(profession level 4\); \[TEST\] Belwar is level 1/);
 await assert.rejects(()=>api.craft(belwar,'REC-TEST-TEA'),/level 4/);
 await assert.rejects(()=>api.craft(belwar,'REC-TEST-DRAFT'),/not learned/);
 await assert.rejects(()=>api.craft(tarra,'REC-TEST-SALVE'),/own that character/);
});

test('craft with another player’s materials: popup on the owner’s screen, decline cancels, allow crafts',async()=>{
 // Decline.
 sent.length=0;
 let outcome=api.craft(belwar,'REC-TEST-SALVE');await flush();
 const request=nextSent('craft-request');assert.ok(request,'player asks the GM client');
 game.user=gm;const orchestration=_test.onSocket(request,'u1');await flush();
 const ask=nextSent('consent-request');assert.deepEqual(ask.toUserIds,['u2'],'only Tarra’s owner is asked');
 assert.deepEqual(ask.rows,[{name:'[TEST] Leaf',quantity:1}]);
 game.user=bob;void _test.onSocket(ask,'gm');await flush();
 const popup=dialogs.at(-1);assert.match(popup.opts.content,/\[TEST\] Tarra/);popup.click('decline');await flush();
 const answer=nextSent('consent-response');assert.equal(answer.approved,false);
 game.user=gm;await _test.onSocket(answer,'u2');await orchestration;
 const fail=nextSent('craft-result');assert.equal(fail.ok,false);assert.match(fail.message,/declined\. Nothing was used/);
 game.user=alice;await _test.onSocket(fail,'gm');
 assert.equal((await outcome).ok,false);
 assert.equal(qty(belwar,'bleaf'),1);assert.equal(qty(tarra,'tleaf'),3,'decline uses nothing');
 // Allow.
 outcome=api.craft(belwar,'REC-TEST-SALVE');await flush();
 const request2=nextSent('craft-request');
 game.user=gm;const orchestration2=_test.onSocket(request2,'u1');await flush();
 const ask2=nextSent('consent-request');
 game.user=alice;await _test.onSocket(ask2,'gm');assert.equal(dialogs.filter(d=>!d.closed).at(-1),popup,'non-addressed players get no popup');
 game.user=bob;void _test.onSocket(ask2,'gm');await flush();dialogs.at(-1).click('allow');await flush();
 const yes=nextSent('consent-response');assert.equal(yes.approved,true);
 game.user=gm;await _test.onSocket({...yes,userId:'u1'},'u1');assert.equal(qty(tarra,'tleaf'),3,'forged answer from a non-owner ignored');
 await _test.onSocket(yes,'u2');await orchestration2;
 const ok=nextSent('craft-result');assert.equal(ok.ok,true,ok.message);
 game.user=alice;await _test.onSocket(ok,'gm');assert.equal((await outcome).ok,true);
 assert.equal(belwar.items.get('bleaf'),undefined);assert.equal(qty(tarra,'tleaf'),2);
 const made=belwar.items.find(i=>i.name==='[TEST] Salve');assert.ok(made,'result Item from the ITEM-* world definition');
 assert.equal(made.flags['ashen-gate-profession-ledger'].craftedFrom,'REC-TEST-SALVE');
 const card=chats.at(-1);assert.match(card.content,/\[TEST\] Belwar crafted \[TEST\] Salve/);assert.match(card.content,/from \[TEST\] Tarra/);
});

test('craft from own materials runs locally and stacks onto an existing result Item',async()=>{
 game.user=alice;belwar.items.push(leaf('bleaf2',4));
 await app._click('craft','REC-TEST-SALVE',{actor:'belwar'});
 assert.equal(qty(belwar,'bleaf2'),2);
 assert.equal(belwar.items.filter(i=>i.name==='[TEST] Salve').length,1);
 assert.equal(belwar.items.find(i=>i.name==='[TEST] Salve').system.quantity,2);
 assert.match(app.notice,/crafted \[TEST\] Salve/);
});

test('GM awards XP with visible feedback, sheet mirror and a whisper; can open any party member',async()=>{
 game.user=gm;app.actorId='belwar';
 app.element={querySelector:s=>s==='[data-xp-input="PROF-TEST-ALCHEMY"]'?{value:'7'}:null,querySelectorAll:()=>[]};
 await app._click('award-xp','PROF-TEST-ALCHEMY',{actor:'belwar'});
 assert.equal(api.getProfessionProgress(belwar,'PROF-TEST-ALCHEMY').xp,7);
 assert.match(app.notice,/\+7 \[TEST\] Alchemy XP → 7 XP, level 2 \(level up!\)/);
 assert.match(belwar.items.get('bprof').system.description.value,/^<p class="agl-progress-mirror"><strong>Profession Ledger:<\/strong> Level 2 \(Apprentice\) · 7 XP · 6 XP to level 3<\/p><p>Feature text<\/p>/);
 assert.deepEqual(chats.at(-1).whisper.sort(),['gm','u1']);
 const h=await html('individual');
 assert.match(h,/\+7 XP/);assert.match(h,/agl-flash/);assert.match(h,/data-agl-actor/);
 assert.match(h,/\[TEST\] Belwar’s player learns this/);
 await app._click('award-xp','PROF-TEST-ALCHEMY',{actor:'belwar'});
 assert.equal((belwar.items.get('bprof').system.description.value.match(/agl-progress-mirror/g)??[]).length,1,'mirror replaced, not duplicated');
 await app._click('open-individual','tarra');assert.equal(app.actor.id,'tarra');
});

test('Party tab by player and by profession; catalog shows drafts only to the GM',async()=>{
 game.user=alice;
 let h=await html('party');
 assert.match(h,/Party materials/);assert.match(h,/\[TEST\] Tarra 2/);
 assert.match(h,/data-folder="actor-belwar"/);assert.match(h,/data-folder="actor-tarra"/);
 app.partySort='profession';h=await html('party');assert.match(h,/data-folder="testalchemy"/);assert.match(h,/Known by \[TEST\] Belwar/);
 h=await html('catalog');
 assert.match(h,/\[TEST\] Salve/);assert.doesNotMatch(text(h),/Draft Brew|(REC|MAT|ITEM)-TEST-/);
 game.user=gm;h=await html('catalog');
 assert.match(h,/Draft Brew/);assert.match(h,/Draft — hidden from players/);assert.match(h,/REC-TEST-DRAFT/);
 assert.match(h,/1 of 3 recipes is draft or GM-only/);
});

test('Tidy5e Professions tab is feature-detected and renders the crafting panel',async()=>{
 assert.equal(_test.registerTidyTab(undefined),false);assert.equal(_test.registerTidyTab({}),false);
 const tabs=[];
 class HtmlTab{constructor(o){Object.assign(this,o);}}
 assert.equal(_test.registerTidyTab({registerCharacterTab:t=>tabs.push(t),models:{HtmlTab}}),true);
 assert.equal(tabs[0].title,'Professions');assert.equal(tabs[0].enabled(),true);
 game.user=alice;
 const el={dataset:{},innerHTML:'',matches:s=>s==='[data-agl-sheet-tab]',addEventListener:()=>{},querySelector:()=>null};
 tabs[0].onRender({app:{actor:belwar},tabContentsElement:el});
 assert.match(el.innerHTML,/Professions/);assert.match(el.innerHTML,/Known recipes/);assert.match(el.innerHTML,/data-action="craft"/);
 assert.match(el.innerHTML,/Level 3/);assert.doesNotMatch(text(el.innerHTML),/(REC|MAT|PROF|ITEM)-TEST-/);
});
