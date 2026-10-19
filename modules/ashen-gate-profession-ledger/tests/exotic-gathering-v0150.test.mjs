import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {clampPercent,normalizeExotics,materialMeta,filterMaterials,exoticEligibility,resolveExotic,resolveGatherRewards,professionKeyFromId,nodeProfessionKey,defaultRoll} from '../scripts/exotic.mjs';
import {gatherOutcome,normalizeNode,DEFAULT_DC_BY_TIER} from '../scripts/gathering.mjs';
import {normalizeRecipe} from '../scripts/core.mjs';
import {requiredToolRef,craftCheckPlan,DEFAULT_GATHER_SKILLS} from '../scripts/checks.mjs';
// 0.15.0: Exotic gathering (shared reward resolver), DC defaults 10/12/15/18/20, required_tools.

const matDef=(id,name,{quality='Exotic',tierId='expert',prof='PROF-TG-HERBALISM',refs=null}={})=>({id,entity_type:'Material',version:'0.1.0',name,quality,tierId,
  source_profession_id:prof,refs:refs??(prof?[{relation:'gathered_by',target_id:prof,mode:'required'}]:[])});
const META={
  'MAT-TG-PHOENIX':materialMeta(matDef('MAT-TG-PHOENIX','[TEST] Phoenix Ash')),
  'MAT-TG-STAR':materialMeta(matDef('MAT-TG-STAR','[TEST] Star Moss',{tierId:'apprentice'})),
  'MAT-TG-DEEP':materialMeta(matDef('MAT-TG-DEEP','[TEST] Deep Ore',{prof:'PROF-TG-MINING',tierId:'apprentice'})),
  'MAT-TG-HIGH':materialMeta(matDef('MAT-TG-HIGH','[TEST] Master Bloom',{tierId:'master'})),
  'MAT-TG-FAKE':materialMeta(matDef('MAT-TG-FAKE','[TEST] Exotic-looking Weed',{quality:'Common',tierId:'apprentice'}))};
const metaOf=id=>META[id]??null;
const herbNode=(exotics,extra={})=>normalizeNode({id:'n',label:'[TEST] Patch',skill:'Herbalism',tier:3,materialId:'MAT-TG-HERB',rareMaterialId:'MAT-TG-RARE',quantity:2,exotics,...extra});
/** Scripted dice: returns the queued values in order and records every call. */
const dice=(...values)=>{const calls=[];const fn=faces=>{calls.push(faces);if(!values.length)throw Error('unexpected roll');return values.shift();};fn.calls=calls;return fn;};
const noRoll=()=>{throw Error('no roll may be made');};
const success=gatherOutcome(15,15),rare=gatherOutcome(20,15),fail=gatherOutcome(14,15);

test('discovery chance: whole percent 0–100, default 2, fractions round',()=>{
 assert.equal(clampPercent(undefined),2);assert.equal(clampPercent(''),2);assert.equal(clampPercent('x'),2);
 assert.equal(clampPercent(2.4),2);assert.equal(clampPercent(2.5),3);assert.equal(clampPercent(-5),0);assert.equal(clampPercent(150),100);assert.equal(clampPercent('7'),7);
});

test('probability boundaries: d100 01–02 finds at 2%, 03 does not; 0% never rolls; 100% always finds',()=>{
 const node=herbNode([{materialId:'MAT-TG-PHOENIX'}]);
 for(const r of [1,2])assert.equal(resolveExotic({node,outcome:success,percent:2,roll:dice(r),metaOf}).materialId,'MAT-TG-PHOENIX',`roll ${r}`);
 const miss=resolveExotic({node,outcome:success,percent:2,roll:dice(3),metaOf});
 assert.equal(miss.materialId,null);assert.equal(miss.roll,3);assert.equal(miss.target,2);assert.equal(miss.kind,'discovery');
 assert.equal(resolveExotic({node,outcome:success,percent:0,roll:noRoll,metaOf}).roll,null,'0% turns discovery off');
 assert.equal(resolveExotic({node,outcome:success,percent:100,roll:dice(100),metaOf}).materialId,'MAT-TG-PHOENIX');
 const d=dice(2);resolveExotic({node,outcome:success,roll:d,metaOf});assert.deepEqual(d.calls,[100],'default 2%, one d100');
});

test('a failed check never rolls or finds an Exotic',()=>{
 const node=herbNode([{materialId:'MAT-TG-PHOENIX'},{materialId:'MAT-TG-STAR',mode:'designated',chance:100}]);
 const out=resolveGatherRewards({node,outcome:fail,percent:100,roll:noRoll,metaOf});
 assert.deepEqual(out.awards,[]);assert.equal(out.exotic.roll,null);
});

test('eligibility: Exotic quality from the definition, gathering profession, tier not above the node',()=>{
 const node=herbNode([]);
 const why=id=>exoticEligibility({materialId:id,mode:'discovery'},node,metaOf(id));
 assert.equal(why('MAT-TG-PHOENIX').eligible,true,'expert (3) at a tier 3 node');
 assert.equal(why('MAT-TG-STAR').eligible,true,'apprentice (1) at a tier 3 node');
 assert.match(why('MAT-TG-HIGH').reason,/Tier 5 is above the node’s tier 3/);
 assert.match(why('MAT-TG-DEEP').reason,/another profession/);
 assert.match(why('MAT-TG-FAKE').reason,/Common, not Exotic/,'never inferred from the name');
 assert.match(why('MAT-TG-NOPE').reason,/Not an imported/);
 assert.match(exoticEligibility({materialId:'MAT-TG-PHOENIX',mode:'discovery'},herbNode([],{skill:'nat'}),META['MAT-TG-PHOENIX']).reason,/not a gathering profession/);
 assert.match(exoticEligibility({materialId:'MAT-TG-PHOENIX',mode:'discovery'},herbNode([],{tier:2}),META['MAT-TG-PHOENIX']).reason,/above/);
 assert.equal(nodeProfessionKey({skill:'Skinning & Harvesting'}),'huntingskinning');
 assert.equal(professionKeyFromId('PROF-PT-HERBALISM'),'herbalism');assert.equal(professionKeyFromId('PROF-HUNTING-SKINNING'),'huntingskinning');
 const noProf=materialMeta(matDef('MAT-TG-ODD','[TEST] Odd',{prof:null}));
 assert.match(exoticEligibility({materialId:'MAT-TG-ODD',mode:'discovery'},node,noProf).reason,/names no gathering profession/);
});

test('empty candidate pools: no candidates, none eligible, or none imported means no roll',()=>{
 for(const exotics of [[],[{materialId:'MAT-TG-HIGH'},{materialId:'MAT-TG-DEEP'}],[{materialId:'MAT-TG-NOPE'}]]){
  const out=resolveExotic({node:herbNode(exotics),outcome:success,percent:100,roll:noRoll,metaOf});
  assert.equal(out.roll,null);assert.equal(out.materialId,null);assert.equal(out.skipped.length,exotics.length);
 }
 assert.equal(resolveGatherRewards({node:herbNode([]),outcome:success,roll:noRoll,metaOf}).awards.length,1,'the normal bundle still comes');
});

test('rare plus Exotic: success by 5+ gives the Rare bundle and the Exotic, never the Common one as well',()=>{
 const out=resolveGatherRewards({node:herbNode([{materialId:'MAT-TG-PHOENIX'}]),outcome:rare,roll:dice(1),metaOf});
 assert.deepEqual(out.awards,[{materialId:'MAT-TG-RARE',quantity:1,kind:'rare'},{materialId:'MAT-TG-PHOENIX',quantity:1,kind:'exotic'}]);
 const common=resolveGatherRewards({node:herbNode([{materialId:'MAT-TG-PHOENIX'}]),outcome:success,roll:dice(2),metaOf});
 assert.deepEqual(common.awards.map(a=>a.kind),['common','exotic']);
});

test('designated source: its own chance and condition replace the generic roll; still one d100',()=>{
 const node=herbNode([{materialId:'MAT-TG-STAR'},{materialId:'MAT-TG-PHOENIX',mode:'designated',chance:25}]);
 let d=dice(25);let out=resolveExotic({node,outcome:success,percent:100,roll:d,metaOf});
 assert.equal(out.kind,'designated');assert.equal(out.materialId,'MAT-TG-PHOENIX');assert.deepEqual(d.calls,[100]);
 d=dice(26);out=resolveExotic({node,outcome:success,percent:100,roll:d,metaOf});
 assert.equal(out.materialId,null,'100% discovery is not rolled as well');assert.deepEqual(d.calls,[100]);
 // Success-by-5+ only: a plain success makes no roll at all.
 const onRare=herbNode([{materialId:'MAT-TG-PHOENIX',mode:'designated',chance:100,condition:'rare'},{materialId:'MAT-TG-STAR'}]);
 assert.equal(resolveExotic({node:onRare,outcome:success,percent:100,roll:noRoll,metaOf}).kind,'designated');
 assert.equal(resolveExotic({node:onRare,outcome:rare,roll:dice(100),metaOf}).materialId,'MAT-TG-PHOENIX');
 // Several designated candidates share the d100 in the GM's order.
 const two=herbNode([{materialId:'MAT-TG-PHOENIX',mode:'designated',chance:10},{materialId:'MAT-TG-STAR',mode:'designated',chance:5}]);
 assert.equal(resolveExotic({node:two,outcome:success,roll:dice(10),metaOf}).materialId,'MAT-TG-PHOENIX');
 assert.equal(resolveExotic({node:two,outcome:success,roll:dice(15),metaOf}).materialId,'MAT-TG-STAR');
 assert.equal(resolveExotic({node:two,outcome:success,roll:dice(16),metaOf}).materialId,null);
 // A designated source with no chance never awards (and is not assumed to always give its Exotic).
 const unset=herbNode([{materialId:'MAT-TG-PHOENIX',mode:'designated'}]);
 assert.equal(normalizeExotics(unset.exotics)[0].chance,null);
 out=resolveExotic({node:unset,outcome:rare,percent:100,roll:noRoll,metaOf});
 assert.equal(out.materialId,null);assert.match(out.skipped[0].reason,/no chance set/);
});

test('discovery with several candidates: one discovery roll, then a pick',()=>{
 const node=herbNode([{materialId:'MAT-TG-PHOENIX'},{materialId:'MAT-TG-STAR'}]);
 const d=dice(1,2);assert.equal(resolveExotic({node,outcome:success,roll:d,metaOf}).materialId,'MAT-TG-STAR');assert.deepEqual(d.calls,[100,2]);
});

test('repeated gathering: 100 successes over d100 01–100 find exactly two Exotics at 2%',()=>{
 const node=herbNode([{materialId:'MAT-TG-PHOENIX'}]);let found=0;
 for(let r=1;r<=100;r++)found+=resolveGatherRewards({node,outcome:success,roll:dice(r),metaOf}).awards.filter(a=>a.kind==='exotic').length;
 assert.equal(found,2);
 for(let i=0;i<500;i++){const v=defaultRoll(100);assert.ok(Number.isInteger(v)&&v>=1&&v<=100);}
});

test('candidate lists and selectors: valid ids once; filter by rarity, profession and tier',()=>{
 assert.deepEqual(normalizeExotics([{materialId:'MAT-TG-PHOENIX'},{materialId:'MAT-TG-PHOENIX',mode:'designated'},{materialId:'bad'},null,{materialId:'MAT-TG-STAR',mode:'designated',chance:'150'}]),
  [{materialId:'MAT-TG-PHOENIX',mode:'discovery'},{materialId:'MAT-TG-STAR',mode:'designated',chance:null,condition:'success'}]);
 const metas=Object.values(META);
 assert.deepEqual(filterMaterials(metas,{quality:'Exotic'}).map(m=>m.id),['MAT-TG-DEEP','MAT-TG-STAR','MAT-TG-PHOENIX','MAT-TG-HIGH']);
 assert.deepEqual(filterMaterials(metas,{quality:'Exotic',profession:'herbalism',maxTier:3}).map(m=>m.id),['MAT-TG-STAR','MAT-TG-PHOENIX']);
 assert.deepEqual(filterMaterials(metas,{quality:'Exotic',tier:5}).map(m=>m.id),['MAT-TG-HIGH']);
 assert.deepEqual(filterMaterials(metas,{quality:'Exotic',query:'phoenix'}).map(m=>m.id),['MAT-TG-PHOENIX']);
 assert.deepEqual(filterMaterials(metas,{quality:'Common'}).map(m=>m.id),['MAT-TG-FAKE']);
 assert.equal(materialMeta({id:'REC-TG-X',entity_type:'Recipe'}),null,'only Material definitions');
 assert.equal(materialMeta(null),null);
});

test('DC defaults 10/12/15/18/20; an explicit node DC wins',()=>{
 assert.deepEqual(DEFAULT_DC_BY_TIER,{1:10,2:12,3:15,4:18,5:20});
 assert.equal(normalizeNode({id:'a',tier:5,materialId:'MAT-TG-HERB'}).dc,20);
 assert.equal(normalizeNode({id:'b',tier:5,dc:14,materialId:'MAT-TG-HERB'}).dc,14);
});

test('required_tools: every listed tool is needed; names map to dnd5e tool keys; Enchanting still defaults to Arcana',()=>{
 const r=normalizeRecipe({flags:{'ashen-gate-manager':{source:{sourceId:'REC-TG-BENCH',definition:{id:'REC-TG-BENCH',entity_type:'Recipe',version:'1',name:'[TEST] Bench',
  required_tools:["Carpenter's Tools",'Smith’s Tools'],ingredients:[{material_id:'MAT-TG-HERB',quantity:1}]}}}}});
 assert.deepEqual(r.tools,["Carpenter's Tools",'Smith’s Tools']);assert.equal(r.tool,null);
 assert.deepEqual(requiredToolRef("Carpenter's Tools"),{key:'carpenter',uuid:null,name:"Carpenter's Tools"});
 assert.deepEqual(requiredToolRef('[TEST] Odd Kit'),{key:null,uuid:null,name:'[TEST] Odd Kit'});
 assert.equal(normalizeRecipe({id:'REC-TG-OLD',recipe:{ingredients:[{materialId:'MAT-TG-HERB',quantity:1}],tool:'alchemist'}}).tool,'alchemist','single-tool fields still read');
 const actor={items:[{type:'tool',name:'Smith’s Tools',system:{type:{baseItem:'smith'}}}],system:{tools:{}}};
 const plan=craftCheckPlan(actor,{tools:[requiredToolRef("Carpenter's Tools"),requiredToolRef('Smith’s Tools')],skill:null});
 assert.deepEqual(plan.options.map(o=>o.key),['carpenter','smith']);assert.equal(plan.selected.key,'smith','a carried tool is preselected');
 assert.equal(DEFAULT_GATHER_SKILLS.enchanting,'arc');
});

/* ---- Mocked Foundry: the Ledger's real gathering flow ---------------------------------------- */
const hooks={},errors=[],chats=[],sent=[];let api;
const values={partyRoster:['belwar'],libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]}};
const gm={id:'gm',isGM:true,name:'GM',active:true},alice={id:'u1',isGM:false,name:'Alice',active:true};
const users=[gm,alice];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
class FakeDialog{constructor(o){this.opts=o;}render(){return this;}async close(){}static async confirm(o){FakeDialog.last=o;return true;}}
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){this.rendered=true;return this;}},HandlebarsApplicationMixin:c=>c,DialogV2:FakeDialog}},utils:{escapeHTML:esc,randomID:()=>`id${Math.random().toString(36).slice(2,10)}`}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:()=>{}};
globalThis.ui={notifications:{info:()=>{},error:e=>errors.push(String(e))}};
globalThis.ChatMessage={create:async x=>{const m={id:`m${chats.length}`,...structuredClone(x),update:async()=>{}};chats.push(m);return m;},getSpeaker:({actor}={})=>({alias:actor?.name})};
const src=(id,type,definition,visibility='player')=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility,status:'approved',version:'0.1.0',refs:definition?.refs??[],definition}}});
const worldDoc=(id,name,flags)=>({id,uuid:`Item.${id}`,name,img:'',type:'loot',flags,system:{},testUserPermission:u=>u.isGM||flags['ashen-gate-manager'].source.visibility==='player',
  toObject(){return {_id:this.id,name:this.name,img:'',type:'loot',flags:structuredClone(this.flags),system:{}};}});
const world=[
 worldDoc('wherb','[TEST] Herb',src('MAT-TG-HERB','Material',matDef('MAT-TG-HERB','[TEST] Herb',{quality:'Common',tierId:'apprentice'}))),
 worldDoc('wrare','[TEST] Rare Herb',src('MAT-TG-RARE','Material',matDef('MAT-TG-RARE','[TEST] Rare Herb',{quality:'Rare',tierId:'apprentice'}))),
 worldDoc('wphoenix','[TEST] Phoenix Ash',src('MAT-TG-PHOENIX','Material',matDef('MAT-TG-PHOENIX','[TEST] Phoenix Ash'))),
 worldDoc('wstar','[TEST] Star Moss',src('MAT-TG-STAR','Material',matDef('MAT-TG-STAR','[TEST] Star Moss',{tierId:'apprentice'}))),
 worldDoc('wdeep','[TEST] Deep Ore',src('MAT-TG-DEEP','Material',matDef('MAT-TG-DEEP','[TEST] Deep Ore',{prof:'PROF-TG-MINING',tierId:'apprentice'}))),
 worldDoc('wgm','[TEST] Secret Exotic',src('MAT-TG-SECRETX','Material',matDef('MAT-TG-SECRETX','[TEST] Secret Exotic',{tierId:'apprentice'}),'gm')),
 worldDoc('wprof','[TEST] Herbalism — Profession',src('PROF-TG-HERBALISM','Profession',{id:'PROF-TG-HERBALISM',entity_type:'Profession',version:'0.1.0',refs:[],name:'[TEST] Herbalism'}))];
const held=(id,name,flags,qty)=>({id,name,type:'loot',system:{quantity:qty},flags,toObject(){return {_id:id,name,type:'loot',system:structuredClone(this.system),flags:structuredClone(flags)};}});
const inv=[];inv.get=i=>inv.find(x=>x.id===i);let made=0;
const belwar={id:'belwar',name:'[TEST] Belwar',type:'character',hasPlayerOwner:true,items:inv,flags:{},system:{skills:{nat:{total:3,value:1}},tools:{},abilities:{int:{mod:1}}},
 testUserPermission:(u,role)=>u.isGM||u.id==='u1'||role==='LIMITED',
 updateEmbeddedDocuments:async(t,ups)=>{for(const u of ups)inv.get(u._id).system.quantity=u['system.quantity'];return ups;},
 createEmbeddedDocuments:async(t,docs)=>{const out=docs.map(d=>held(`new${made++}`,d.name,d.flags,d.system.quantity));inv.push(...out);return out;}};
const qty=id=>inv.filter(i=>(i.flags?.['ashen-gate-manager']?.source?.sourceId??i.flags?.['ashen-gate-profession-ledger']?.sourceId)===id).reduce((n,i)=>n+i.system.quantity,0);
const locs=[{id:'LOC-TG-GROVE',name:'[TEST] Grove',revealed:true,resources:[
 {id:'g1',label:'[TEST] Ash tree',skill:'Herbalism',tier:3,dcVisible:true,materialId:'MAT-TG-HERB',rareMaterialId:'MAT-TG-RARE',quantity:2,finite:false,visible:true,
  exotics:[{materialId:'MAT-TG-PHOENIX',mode:'discovery'}]},
 {id:'g2',label:'[TEST] Star pool',skill:'Herbalism',tier:1,materialId:'MAT-TG-HERB',finite:false,visible:true,
  exotics:[{materialId:'MAT-TG-STAR',mode:'designated',chance:50,condition:'success'}]}]}];
// Locations stand-in: as 1.9.0 does, a player copy has no hidden nodes, no DC unless shown and never `exotics`.
const locApi={listLocations:()=>structuredClone(locs),
 resourcesAt:id=>{const l=locs.find(x=>x.id===id);return structuredClone(game.user.isGM?l.resources:l.resources.map(({exotics,visible,dcVisible,...r})=>r));},
 markNodeExhausted:async()=>{}};
const ledgerModule={active:true,set api(v){api=v},get api(){return api}};
const modules={'ashen-gate-profession-ledger':ledgerModule,'ashen-gate-locations':{active:true,api:locApi}};
globalThis.game={user:gm,users:{contents:users,get:id=>users.find(u=>u.id===id),get activeGM(){return gm;}},items:{contents:world,get:id=>world.find(x=>x.id===id)},
 actors:{contents:[belwar],get:id=>id==='belwar'?belwar:null},socket:{emit:(name,msg)=>sent.push(msg),on:()=>{}},
 modules:{get:id=>modules[id]},settings:{register:()=>{},registerMenu:()=>{},get:(id,k)=>values[k],set:async(id,k,v)=>{values[k]=v;}}};
const entry=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js');
const {_test}=await import(pathToFileURL(entry));hooks.init();hooks.ready();
const app=api.open({view:'gathering'});
const html=async view=>{app.view=view;return (await app._prepareContext({})).html;};
const nodeAt=id=>_test.gatherLocations().locations[0].nodes.find(n=>n.id===id);

test('Location node: success gives the Common bundle plus the Exotic, on one card with one XP opportunity; Exotics stack',async()=>{
 game.user=gm;
 _test.setExoticRoll(dice(2));
 let s=await _test.startGather({node:nodeAt('g1'),leadId:'belwar'});
 assert.equal(s.node.dc,15,'tier 3 default DC');
 const before=chats.length;
 let out=await _test.resolveGather(s.id,{total:16,choice:'skill:nat'});
 assert.deepEqual(out.awards.map(a=>a.kind),['common','exotic']);
 assert.equal(chats.length,before+1,'one chat card');
 const card=chats.at(-1);
 assert.match(card.content,/gathered 2 × \[TEST\] Herb and 1 × \[TEST\] Phoenix Ash/);assert.match(card.content,/Exotic find:<\/strong> 1 × \[TEST\] Phoenix Ash/);
 assert.equal(card.flags['ashen-gate-profession-ledger'].xp.kind,'gather','one XP opportunity on the one card');
 assert.equal(qty('MAT-TG-HERB'),2);assert.equal(qty('MAT-TG-PHOENIX'),1);
 // Success by 5+ again: Rare instead of Common, and the Exotic stacks onto the one held.
 _test.setExoticRoll(dice(1));
 s=await _test.startGather({node:nodeAt('g1'),leadId:'belwar'});
 out=await _test.resolveGather(s.id,{total:20,choice:'skill:nat'});
 assert.deepEqual(out.awards.map(a=>a.kind),['rare','exotic']);
 assert.equal(qty('MAT-TG-HERB'),2,'no Common as well');assert.equal(qty('MAT-TG-RARE'),1);assert.equal(qty('MAT-TG-PHOENIX'),2);
 assert.equal(inv.filter(i=>i.name==='[TEST] Phoenix Ash').length,1,'stacked, not duplicated');
 // A miss: the card names no Exotic, roll or candidate; the GM's note has the d100.
 _test.setExoticRoll(dice(3));
 s=await _test.startGather({node:nodeAt('g1'),leadId:'belwar'});
 out=await _test.resolveGather(s.id,{total:15,choice:'skill:nat'});
 assert.equal(out.exoticAward,null);assert.doesNotMatch(chats.at(-1).content,/Exotic|Phoenix|d100/);
 assert.match(await html('gathering'),/Exotic d100 3 vs 2 \(discovery\)/);
 // A failure never rolls.
 _test.setExoticRoll(noRoll);
 s=await api.gathering.start({node:{label:'[TEST] Star pool copy',skill:'Herbalism',tier:1,materialId:'MAT-TG-HERB',exotics:[{materialId:'MAT-TG-STAR',mode:'designated',chance:100}]},leadId:'belwar'});
 out=await _test.resolveGather(s.id,{total:2,choice:'skill:nat'});
 assert.equal(out.outcome.result,'fail');assert.equal(out.exotic.roll,null);
});

test('ad-hoc and Location gathering give the same results for the same rolls',async()=>{
 game.user=gm;
 const results=[];
 const starts={location:()=>_test.startGather({node:nodeAt('g1'),leadId:'belwar'}),
  adhoc:()=>api.gathering.start({node:{label:'[TEST] Ad-hoc ash',skill:'Herbalism',tier:3,materialId:'MAT-TG-HERB',rareMaterialId:'MAT-TG-RARE',quantity:2,exotics:[{materialId:'MAT-TG-PHOENIX'}]},leadId:'belwar'})};
 for(const start of [starts.location,starts.adhoc])for(const [total,r] of [[16,2],[16,3],[21,1]]){
  _test.setExoticRoll(dice(r));
  const s=await start();
  const out=await _test.resolveGather(s.id,{total,choice:'skill:nat'});
  results.push(out.awards.map(a=>`${a.kind}:${a.materialId}:${a.quantity}`).join(','));
 }
 assert.deepEqual(results.slice(0,3),results.slice(3));
 assert.deepEqual(results.slice(0,3),['common:MAT-TG-HERB:2,exotic:MAT-TG-PHOENIX:1','common:MAT-TG-HERB:2','rare:MAT-TG-RARE:1,exotic:MAT-TG-PHOENIX:1']);
});

test('designated source at a location uses its chance, not the 2% roll',async()=>{
 game.user=gm;
 for(const [r,found] of [[50,'MAT-TG-STAR'],[51,null]]){
  const d=dice(r);_test.setExoticRoll(d);
  const s=await _test.startGather({node:nodeAt('g2'),leadId:'belwar'});
  const out=await _test.resolveGather(s.id,{total:12,choice:'skill:nat'});
  assert.equal(out.exotic.kind,'designated');assert.equal(out.exotic.materialId,found);assert.deepEqual(d.calls,[100]);
 }
});

test('missing or GM-only Exotic definitions fail safely: skipped, the normal bundle still given',async()=>{
 game.user=gm;
 _test.setExoticRoll(noRoll);
 const s=await api.gathering.start({node:{label:'x',skill:'Herbalism',tier:3,materialId:'MAT-TG-HERB',exotics:[{materialId:'MAT-TG-SECRETX'},{materialId:'MAT-TG-GONE'}]},leadId:'belwar'});
 const out=await _test.resolveGather(s.id,{total:30,choice:'skill:nat'});
 assert.equal(out.award.name,'[TEST] Herb');assert.equal(out.exotic.roll,null);
 assert.deepEqual(out.exotic.skipped.map(x=>x.materialId),['MAT-TG-SECRETX','MAT-TG-GONE']);
});

test('players never get Exotic candidates: node list, roll prompt, Gathering tab and API',async()=>{
 game.user=gm;sent.length=0;
 const s=await _test.startGather({node:nodeAt('g1'),leadId:'belwar'});
 const prompt=sent.find(m=>m.type==='gather-roll');
 assert.ok(prompt);assert.doesNotMatch(JSON.stringify(prompt),/PHOENIX|Phoenix|exotic/i);
 _test.cancelGather(s.id);
 game.user=alice;
 const nodes=_test.gatherLocations().locations[0].nodes;
 assert.ok(nodes.every(n=>n.exotics.length===0));
 locApi.resourcesAt=(orig=>id=>orig(id).map(r=>({...r,exotics:[{materialId:'MAT-TG-PHOENIX'}]})))(locApi.resourcesAt);
 assert.ok(_test.gatherLocations().locations[0].nodes.every(n=>n.exotics.length===0),'stripped even if a partner sent them');
 const h=await html('gathering');
 assert.doesNotMatch(h,/Phoenix|Exotic|Star Moss/);
 assert.throws(()=>api.gathering.exotic.materials(),/Only the GM/);assert.throws(()=>api.gathering.exotic.eligibility({}),/Only the GM/);
 game.user=gm;
});

test('GM ad-hoc editor: Exotic picker filters by profession, tier and rarity; adding sets eligibility only',async()=>{
 game.user=gm;app.gather.source='adhoc';Object.assign(app.gather.adhoc,{skill:'Herbalism',tier:'1',materialId:'MAT-TG-HERB',exotics:[]});
 let h=await html('gathering');
 assert.match(h,/Exotic candidates \(optional, GM only\)/);
 const pick=h.slice(h.indexOf('agl-exotic-filters'));
 assert.match(pick,/\[TEST\] Star Moss/);assert.doesNotMatch(pick,/Phoenix Ash/,'tier 3 is above a tier 1 node');
 assert.doesNotMatch(pick,/Deep Ore/,'Mining Exotic at a Herbalism node');assert.doesNotMatch(pick,/Rare Herb|>\[TEST\] Herb</,'only Exotic quality');
 app.gather.pick.tier='any';h=await html('gathering');assert.match(h.slice(h.indexOf('agl-exotic-filters')),/Phoenix Ash/);
 await app._click('adhoc-exotic-add','MAT-TG-PHOENIX');
 assert.deepEqual(app.gather.adhoc.exotics,[{materialId:'MAT-TG-PHOENIX',mode:'discovery'}]);
 h=await html('gathering');assert.match(h,/Tier 3 is above the node’s tier 1/);
 await app._click('adhoc-exotic-remove','MAT-TG-PHOENIX');assert.deepEqual(app.gather.adhoc.exotics,[]);
 assert.deepEqual(api.gathering.exotic.materials({profession:'Herbalism',maxTier:1}).map(m=>m.id),['MAT-TG-STAR']);
 assert.deepEqual(api.gathering.exotic.eligibility({skill:'Herbalism',tier:1,exotics:[{materialId:'MAT-TG-PHOENIX'}]}).map(r=>[r.materialId,r.eligible]),[['MAT-TG-PHOENIX',false]]);
 assert.equal(api.gathering.exotic.percent(),2);assert.deepEqual(api.gathering.exotic.defaultDcByTier,{1:10,2:12,3:15,4:18,5:20});
 app.gather.source='location';
});

test('GM Setup: discovery chance is a setting, saved with Save Changes and clamped',async()=>{
 game.user=gm;
 const h=await html('gm');assert.match(h,/Exotic discovery/);assert.match(h,/data-exotic-chance value="2"/);
 app.exoticDraft='250';app.element={querySelectorAll:()=>[],querySelector:()=>null};
 assert.equal(app.exoticDirty,true);
 await app._click('roster-save');
 assert.equal(values.exoticChance,100);assert.equal(values.partyRoster.length,1,'party left as it was');
 assert.equal(api.gathering.exotic.percent(),100);
 values.exoticChance=2;
});

test('recipe row: a required_tools recipe names every missing tool; a carried one is not listed',async()=>{
 game.user=gm;
 const bench={id:'REC-TG-BENCH',entity_type:'Recipe',version:'0.1.0',refs:[],name:'[TEST] Bench',profession_id:'PROF-TG-HERBALISM',result_item_id:'ITEM-TG-BENCH',tier:'apprentice',
  required_tools:["Carpenter's Tools",'Smith’s Tools'],ingredients:[{material_id:'MAT-TG-HERB',quantity:1}]};
 world.push(worldDoc('wbench','Recipe: [TEST] Bench',src('REC-TG-BENCH','Recipe',bench)));
 belwar.flags['ashen-gate-profession-ledger']={knownRecipes:['REC-TG-BENCH']};
 inv.push({id:'tsmith',name:'Smith’s Tools',type:'tool',system:{quantity:1,type:{baseItem:'smith'}},flags:{}});
 app.actorId='belwar';
 const h=await html('individual');
 const row=h.slice(h.indexOf('<strong>[TEST] Bench</strong>'));
 assert.match(row,/Carpenter's Tools \+ Smith’s Tools/);assert.match(row,/doesn’t carry Carpenter's Tools</);
});
