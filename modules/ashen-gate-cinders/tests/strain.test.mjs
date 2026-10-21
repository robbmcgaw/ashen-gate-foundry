import test from 'node:test';import assert from 'node:assert/strict';
// Strain (moved from Skill Trees 0.15.0). Pure rules (strain.mjs) and the api.strain door with mocked Foundry globals: proves logic, not the live UI.
import {DEFAULT_CONFIG,defaultConfig,validateConfig,normalizeConfig,bandFor,chanceFor,applyChange,normalizeState,restRecovery,summarize,STRAIN_SCOPE,STRAIN_HISTORY_LIMIT} from '../scripts/strain.mjs';

const SRC={module:'ashen-gate-test',kind:'hazard',ref:'LOC-TEST-PIT'};
const add=(state,amount,extra={})=>applyChange(state,null,{op:'add',amount,source:SRC,reason:'[TEST] hazard',...extra});

test('defaults: the spec schedule, neutral band names, no maximum, long rest 1',()=>{
  assert.deepEqual([...DEFAULT_CONFIG.backfire_schedule],[0,5,10,20,25,35,50,60,75,90,100]);
  assert.deepEqual(DEFAULT_CONFIG.bands.map(b=>b.label),['Band 0','Band 1','Band 2','Band 3','Band 4','Band 5','Band 6']);
  assert.equal(DEFAULT_CONFIG.hard_max,null);assert.deepEqual({...DEFAULT_CONFIG.rest_recovery},{long:1,short:0});
  assert.deepEqual(validateConfig(defaultConfig()).errors,[]);
});
test('bands and chance follow the schedule; 10 and above is 100%, not capped at 10',()=>{
  const c=defaultConfig();
  assert.deepEqual([0,1,2,3,4,5,6,7,8,9,10].map(v=>chanceFor(c,v)),[0,5,10,20,25,35,50,60,75,90,100]);
  assert.equal(chanceFor(c,14),100);assert.equal(bandFor(c,14).label,'Band 6');assert.equal(bandFor(c,2).label,'Band 1');
  assert.equal(chanceFor(c,4,-10),15,'modifiers add percentage points');
  assert.equal(chanceFor(c,10,-50),100,'modifiers cannot prevent the guarantee by default');
  assert.equal(chanceFor({...c,allow_prevention_at_guarantee:true},10,-50),50,'unless the config allows it');
  assert.equal(chanceFor(c,1,-50),0);
});
test('add / remove / set: source and reason required, remove stops at 0, history capped',()=>{
  let {state,result}=add({},3);assert.equal(state.value,3);assert.deepEqual([result.from,result.to,result.delta],[0,3,3]);
  assert.equal(state.history[0].source.kind,'hazard');assert.equal(state.history[0].reason,'[TEST] hazard');
  ({state,result}=applyChange(state,null,{op:'remove',amount:5,source:{module:'ashen-gate-test',kind:'consumable'},reason:'[TEST] tonic'}));
  assert.equal(state.value,0);assert.equal(result.delta,-3);
  const again=applyChange(state,null,{op:'remove',amount:1,source:SRC,reason:'x'});assert.equal(again.result.changed,false,'nothing to remove: no write');
  ({state}=applyChange(state,null,{op:'set',amount:12,source:{module:'ashen-gate-test',kind:'gm'},reason:'[TEST] GM set'}));assert.equal(state.value,12,'no cap at 10');
  assert.throws(()=>add(state,2,{source:null}),/source/);
  assert.throws(()=>add(state,2,{reason:' '}),/reason/);
  assert.throws(()=>add(state,0),/whole number/);assert.throws(()=>add(state,1.5),/whole number/);
  assert.throws(()=>applyChange(state,null,{op:'set',amount:-1,source:SRC,reason:'x'}),/0 or more/);
  assert.throws(()=>applyChange(state,null,{op:'drain',amount:1,source:SRC,reason:'x'}),/add, remove or set/);
  for(let i=0;i<40;i++)({state}=add(state,1));
  assert.equal(state.history.length,STRAIN_HISTORY_LIMIT);assert.equal(state.value,52);
});
test('the same opId twice changes nothing (no double charge)',()=>{
  let {state}=add({},2,{opId:'op-1'});
  const second=add(state,2,{opId:'op-1'});
  assert.equal(second.result.duplicate,true);assert.equal(second.state.value,2);assert.equal(second.state.history.length,1);
});
test('hard_max: excess is recorded as overflow, never silently lost',()=>{
  const c={...defaultConfig(),hard_max:12};
  const {state,result}=applyChange({value:11},c,{op:'add',amount:3,source:SRC,reason:'x'});
  assert.equal(state.value,12);assert.equal(result.overflow,2);assert.equal(state.history.at(-1).overflow,2);
  const over=applyChange({value:15},c,{op:'add',amount:1,source:SRC,reason:'x'});
  assert.equal(over.state.value,15,'a value already above a lowered maximum is not pushed down');assert.equal(over.result.overflow,1);
});
test('config check: gaps, overlaps, decreasing schedule, open band and unknown fields',()=>{
  const ok=validateConfig({schema:'ag-strain-config/0.1',bands:[{from:0,to:4,label:'[TEST] Calm'},{from:5,to:null,label:'[TEST] Frayed'}]});
  assert.deepEqual(ok.errors,[]);assert.equal(ok.config.backfire_schedule.length,11,'missing fields take the defaults');
  const bad=validateConfig({schema:'ag-strain-config/0.1',backfire_schedule:[0,50,20],bands:[{from:0,to:1,label:'A'},{from:3,to:null,label:''}],hard_max:0,rest_recovery:{long:-1,short:0},extra:1});
  assert.ok(bad.errors.some(e=>/not go down/.test(e)));assert.ok(bad.errors.some(e=>/from must be 2/.test(e)));
  assert.ok(bad.errors.some(e=>/label/.test(e)));assert.ok(bad.errors.some(e=>/hard_max/.test(e)));assert.ok(bad.errors.some(e=>/rest_recovery/.test(e)));
  assert.ok(bad.warnings.some(w=>/extra/.test(w)));assert.equal(bad.config,null);
  assert.ok(validateConfig({schema:'ag-strain-config/0.1',bands:[{from:0,to:9,label:'A'}]}).errors.some(e=>/open-ended/.test(e)));
  assert.ok(validateConfig({schema:'wrong'}).errors.length);
  assert.deepEqual(normalizeConfig({schema:'broken',bands:'x'}),defaultConfig(),'a broken stored config reads as the defaults');
});
test('rest recovery and display summary',()=>{
  const c=defaultConfig();
  assert.equal(restRecovery(c,'long'),1);assert.equal(restRecovery(c,'short'),0);assert.equal(restRecovery(c,'long',-5),0);
  assert.deepEqual(summarize(c,{value:10}),{value:10,band:{label:'Band 6',from:10,to:null},chance:100,guaranteed:true,normalUseBackfires:true,guaranteeAt:10,hardMax:null});
  assert.equal(summarize(c,{value:9}).normalUseBackfires,false);
  assert.deepEqual(normalizeState({value:-3,history:'x'}),{value:0,history:[]});
});

// ---- Runtime: api.strain with mocked Foundry ----
class FakeApplication {static DEFAULT_OPTIONS={};render(){return this;}async _prepareContext(){return {};}}
const oneTime=new Map(),hooks=new Map(),called=[],saved=new Map();
globalThis.Hooks={once:(e,fn)=>oneTime.set(e,fn),on:(e,fn)=>hooks.set(e,[...(hooks.get(e)??[]),fn]),callAll:(e,data)=>called.push([e,data])};
const setProperty=(obj,path,value)=>{const keys=path.split('.');let o=obj;for(const k of keys.slice(0,-1))o=o[k]??={};o[keys.at(-1)]=value;};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{confirm:async()=>true}}},utils:{escapeHTML:x=>String(x),randomID:()=>'r'}};
const MOD='ashen-gate-cinders';
const gm={id:'gm',isGM:true,name:'GM'},owner={id:'u1',isGM:false,name:'Owner'},other={id:'u2',isGM:false,name:'Other'};
const updates=[];
const actorOf=id=>({id,name:`[TEST] ${id}`,type:'character',flags:{},items:[],
  get isOwner(){return game.user.isGM||game.user.id==='u1';},testUserPermission:(u,l)=>u.isGM||u.id==='u1',
  // Like Foundry: the update is applied, then updateActor fires on every client with the change.
  async update(data){updates.push(data);const diff={};for(const [k,v] of Object.entries(data)){setProperty(this,k,structuredClone(v));setProperty(diff,k,v);}
    for(const fn of hooks.get('updateActor')??[])fn(this,diff);return this;}});
const hero=actorOf('hero'),villain=actorOf('villain');
globalThis.game={modules:new Map([[MOD,{id:MOD,active:true}]]),i18n:{localize:x=>x},journal:{contents:[]},
  settings:{register:()=>{},registerMenu:()=>{},get:(_m,k)=>saved.has(k)?saved.get(k):(k==='playerAccessEnabled'?true:undefined),set:async(_m,k,v)=>{saved.set(k,v);return v;}},
  items:{contents:[]},actors:{contents:[hero,villain],get(id){return this.contents.find(a=>a.id===id)??null;}},
  user:gm,users:{contents:[gm,owner,other],get:id=>[gm,owner,other].find(u=>u.id===id),activeGM:gm},socket:{on:()=>{},emit:()=>{}}};
globalThis.ui={actors:null,notifications:{info:()=>{},error:()=>{}}};
await import('../scripts/main.mjs');
oneTime.get('init')();oneTime.get('ready')();
const strain=game.modules.get(MOD).api.strain;
const restMessage=(id,type,author=owner,actorId='hero')=>({id,type:'rest',system:{type},speaker:{actor:actorId},author});
const fire=async(event,...args)=>{for(const fn of hooks.get(event)??[])await fn(...args);};

test('api.strain: contract, GM writes into its own flag scope with one update, hook fires',async()=>{
  game.user=gm;updates.length=0;called.length=0;
  assert.equal(strain.contract,'ag-strain/1');assert.equal(strain.scope,STRAIN_SCOPE);
  const r=await strain.add(hero,4,{source:{module:'ashen-gate-test',kind:'crafting',ref:'REC-TEST-1'},reason:'[TEST] mishap',opId:'op-a'});
  assert.deepEqual([r.from,r.to],[0,4]);
  assert.equal(updates.length,1);assert.deepEqual(Object.keys(updates[0]),['flags.ashen-gate-strain.state'],'the same own scope as Skill Trees 0.15.0 used: no data change');
  assert.equal(hero.flags['ashen-gate-strain'].state.value,4);assert.equal(hero.flags[MOD],undefined);assert.equal(hero.flags['ashen-gate-skill-trees'],undefined);
  assert.deepEqual(called.at(-1),['ashenGateStrain.changed',{actorId:'hero',from:0,to:4,source:{module:'ashen-gate-test',kind:'crafting',ref:'REC-TEST-1'},opId:'op-a'}]);
  await strain.add(hero,4,{source:{module:'ashen-gate-test',kind:'crafting'},reason:'[TEST] retry',opId:'op-a'});
  assert.equal(strain.get(hero).value,4,'retry with the same opId does not charge twice');assert.equal(updates.length,1);
});
test('api.strain: owner reads, others refused; players can never write',async()=>{
  game.user=owner;
  assert.equal(strain.get(hero).value,4);assert.equal(strain.get(hero).band.label,'Band 2');assert.equal(strain.get(hero).chance,25);
  assert.equal(strain.history(hero).length,1);
  await assert.rejects(strain.add(hero,1,{source:{module:'ashen-gate-test',kind:'hazard'},reason:'x'}),/GM only/);
  await assert.rejects(strain.set(hero,0,{source:{module:'ashen-gate-test',kind:'gm'},reason:'x'}),/GM only/);
  game.user=other;assert.throws(()=>strain.get(hero),/Actor access denied/);assert.throws(()=>strain.history(hero),/Actor access denied/);
  game.user=gm;
});
test('two quick adds both count (one change at a time per character)',async()=>{
  game.user=gm;
  await Promise.all([strain.add(villain,2,{source:{module:'ashen-gate-test',kind:'hazard'},reason:'a'}),strain.add(villain,3,{source:{module:'ashen-gate-test',kind:'hazard'},reason:'b'})]);
  assert.equal(strain.get(villain).value,5);
});
test('long rest removes 1 once per rest message; short rest 0; foreign author ignored',async()=>{
  game.user=gm;
  await fire('createChatMessage',restMessage('m1','long'));
  assert.equal(strain.get(hero).value,3);
  const last=strain.history(hero).at(-1);assert.equal(last.source.kind,'rest_long');assert.equal(last.reason,'Long rest');
  await fire('createChatMessage',restMessage('m1','long'));assert.equal(strain.get(hero).value,3,'same message twice: once');
  await fire('createChatMessage',restMessage('m2','short'));assert.equal(strain.get(hero).value,3,'short rest recovers 0 by default');
  await fire('createChatMessage',restMessage('m3','long',other));assert.equal(strain.get(hero).value,3,'author does not own the character');
  await fire('createChatMessage',{id:'m4',type:'base',system:{},speaker:{actor:'hero'},author:owner});assert.equal(strain.get(hero).value,3);
  game.user=owner;await fire('createChatMessage',restMessage('m5','long'));game.user=gm;
  assert.equal(strain.get(hero).value,3,'only the GM client applies recovery');
});
test('config import: preview, import, skip identical, reject bad, reset; GM only; never touches character Strain',async()=>{
  game.user=gm;
  const file={schema:'ag-strain-config/0.1',bands:[{from:0,to:4,label:'[TEST] Calm'},{from:5,to:null,label:'[TEST] Frayed'}],rest_recovery:{long:2,short:1}};
  assert.equal(strain.previewConfigImport(file).rows[0].action,'update');
  const r=await strain.importConfig(file);assert.deepEqual(r.updated,['STRAIN-CONFIG']);
  assert.equal(strain.get(hero).band.label,'[TEST] Calm');assert.equal(strain.get(hero).value,3);
  assert.equal(strain.previewConfigImport(file).rows[0].action,'skip');
  assert.equal((await strain.importConfig(file)).skipped.length,1);
  const bad=await strain.importConfig({schema:'ag-strain-config/0.1',backfire_schedule:[50,10]});assert.equal(bad.failed.length,1);
  assert.equal(strain.config().rest_recovery.long,2,'a failed import leaves the config alone');
  game.user=owner;assert.throws(()=>strain.previewConfigImport(file),/GM only/);await assert.rejects(strain.importConfig(file),/GM only/);
  assert.equal(strain.config().bands[0].label,'[TEST] Calm','players can read the config for display');
  game.user=gm;await strain.resetConfig();assert.equal(strain.config().bands[0].label,'Band 0');
});
test('Strain bar: fills to the guarantee point, then shows how far past it', async () => {
  const {strainBar} = await import('../scripts/main.mjs');
  const base = {band: {label: 'Band 3'}, chance: 35, guaranteed: false, normalUseBackfires: false, guaranteeAt: 10};
  assert.deepEqual([strainBar({...base, value: 5}).fill, strainBar({...base, value: 5}).label, strainBar({...base, value: 5}).over], [50, '5 / 10', 0]);
  const over = strainBar({...base, value: 13});
  assert.deepEqual([over.fill, over.label, over.over], [100, '13 / 10+', 3]);
  assert.equal(game.modules.get(MOD).api.status().status, 'missing', 'Skill Trees is not in this test world; Strain works anyway');
});

// 0.4.1: Help and confirmations go through the shared ag-dialogs.mjs helper (mocked DialogV2).
test('Help opens through infoDialog with one Close button; Reset to defaults is a danger confirm and Cancel changes nothing',async()=>{
  game.user=gm;
  const api=foundry.applications.api,before=api.DialogV2;
  const app=game.modules.get(MOD).api.open();
  let seen;api.DialogV2={prompt:async o=>{seen=o;}};
  await app._act({dataset:{act:'help'}});
  assert.equal(seen.ok.label,'Close');assert.ok(seen.classes.includes('ag-app'));assert.equal(seen.window.title,'Cinders help');
  saved.set('strainConfig',{marker:'[TEST] kept'});
  api.DialogV2={wait:async o=>{seen=o;return o.buttons.find(b=>b.action==='cancel').callback();}};
  await app._act({dataset:{act:'strain-reset'}});
  assert.deepEqual(seen.buttons.map(b=>b.label),['Cancel','Reset to defaults']);
  assert.ok(seen.classes.includes('ag-dialog--danger'));assert.equal(seen.window.title,'Reset Strain settings?');
  assert.deepEqual(saved.get('strainConfig'),{marker:'[TEST] kept'},'Cancel leaves the Strain config alone');
  saved.delete('strainConfig');api.DialogV2=before;
});
test('Unbind and Detach are labelled danger confirms; no DialogV2.confirm or .input left',async()=>{
  const src=await (await import('node:fs/promises')).readFile(new URL('../scripts/main.mjs',import.meta.url),'utf8');
  assert.match(src,/yes:'Unbind Cinder',danger:true/);assert.match(src,/yes:'Detach item',danger:true/);
  assert.match(src,/title:`Push \$\{pv\.powerName\}\?`,yes:'Push'/);
  assert.doesNotMatch(src,/DialogV2\.(confirm|prompt|input)\(/);
});
