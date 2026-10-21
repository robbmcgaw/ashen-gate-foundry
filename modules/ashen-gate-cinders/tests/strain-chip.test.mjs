import test from 'node:test';import assert from 'node:assert/strict';
// Strain chip (0.8.0): pure planning and the GM-client sync with mocked Foundry globals. Proves logic, not the live token UI.
import {STRAIN_CHIP_ICONS,chipStatuses,chipFor,planChip,isChipEffect,CHIP_OPTION} from '../scripts/strain-chip.mjs';
import {defaultConfig} from '../scripts/strain.mjs';

test('one status per Strain band, hidden from the Token HUD, icons from the constants table',()=>{
  const s=chipStatuses(defaultConfig());
  assert.deepEqual(s.map(x=>x.id),['ag-strain-0','ag-strain-1','ag-strain-2','ag-strain-3','ag-strain-4','ag-strain-5','ag-strain-6']);
  assert.equal(s[3].name,'Strain: Band 3');assert.ok(s.every(x=>x.hud===false));
  assert.deepEqual(s.map(x=>x.img),[...STRAIN_CHIP_ICONS]);
  const many={...defaultConfig(),bands:Array.from({length:9},(_,i)=>({from:i,to:i===8?null:i,label:`[TEST] B${i}`}))};
  assert.equal(chipStatuses(many)[8].img,STRAIN_CHIP_ICONS.at(-1),'bands past the table use the last icon');
});
test('chipFor: none at 0, band from the config thresholds, name shows the level',()=>{
  const c=defaultConfig();
  assert.equal(chipFor(c,0),null);assert.equal(chipFor(c,-1),null);
  assert.deepEqual(chipFor(c,6),{statusId:'ag-strain-3',name:'Strain 6/10 (Band 3)',img:STRAIN_CHIP_ICONS[3]});
  assert.equal(chipFor(c,1).statusId,'ag-strain-1');assert.equal(chipFor(c,9).statusId,'ag-strain-5');
  assert.equal(chipFor(c,14).name,'Strain 14/10 (Band 6)');
  const wide={...c,bands:[{from:0,to:4,label:'[TEST] Calm'},{from:5,to:null,label:'[TEST] Frayed'}]};
  assert.equal(chipFor(wide,3).name,'Strain 3/10 ([TEST] Calm)','Strain above 0 in the first band still shows');
});
test('planChip: create, move band, remove extras and at 0; other effects never touched',()=>{
  const want=chipFor(defaultConfig(),6),other={id:'x',statuses:new Set(['poisoned']),name:'Poisoned'};
  assert.deepEqual(planChip([other],want),{create:[{name:want.name,img:want.img,statuses:['ag-strain-3']}],update:[],remove:[]});
  const old={id:'c1',statuses:new Set(['ag-strain-2']),name:'Strain 4/10 (Band 2)',img:STRAIN_CHIP_ICONS[2]};
  assert.deepEqual(planChip([other,old],want).update,[{_id:'c1',name:want.name,img:want.img,statuses:['ag-strain-3'],disabled:false}]);
  const same={id:'c2',statuses:new Set(['ag-strain-3']),name:want.name,img:want.img};
  assert.deepEqual(planChip([old,same,other],want),{create:[],update:[],remove:['c1']},'keeps the one already right');
  assert.deepEqual(planChip([other,old,same],null),{create:[],update:[],remove:['c1','c2']});
  assert.ok(!isChipEffect(other));assert.ok(isChipEffect({statuses:['ag-strain-0']}));
});

// ---- Runtime with mocked Foundry ----
class FakeApplication {static DEFAULT_OPTIONS={};constructor(options={}){this.options=options;}render(){return this;}async _prepareContext(){return {};}}
const registered=new Map(),oneTime=new Map(),hooks=new Map(),saved=new Map(),warnings=[];
const on=(e,fn)=>hooks.set(e,[...(hooks.get(e)??[]),fn]);
const call=(e,...a)=>(hooks.get(e)??[]).map(fn=>fn(...a));
globalThis.Hooks={once:(e,fn)=>oneTime.set(e,fn),on,callAll:call};
const setProperty=(obj,path,value)=>{const keys=path.split('.');let o=obj;for(const k of keys.slice(0,-1))o=o[k]??={};o[keys.at(-1)]=value;};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{confirm:async()=>true}}},utils:{escapeHTML:x=>String(x),randomID:()=>'r'}};
globalThis.CONFIG={statusEffects:[{id:'poisoned',name:'Poisoned',img:'poisoned.svg'}]};
const MOD='ashen-gate-cinders';
const gm={id:'gm',isGM:true},gm2={id:'gm2',isGM:true},owner={id:'u1',isGM:false};
let counter=0;const writes=[];
// Like Foundry: each embedded write runs the pre-hooks on this client first; a false return skips that document.
const actorOf=(id,extra={})=>{const a={id,name:`[TEST] ${id}`,type:'character',flags:{},items:[],effects:[],...extra,
  get isOwner(){return game.user.isGM||game.user.id==='u1';},testUserPermission:(u)=>u.isGM||u.id==='u1',
  async update(data){const diff={};for(const [k,v] of Object.entries(data)){setProperty(this,k,structuredClone(v));setProperty(diff,k,v);}call('updateActor',this,diff);return this;},
  async createEmbeddedDocuments(_t,rows,opts={}){const made=[];for(const r of rows){const doc={...structuredClone(r),id:`AE${++counter}`,statuses:new Set(r.statuses??[])};
    if(call('preCreateActiveEffect',doc,r,opts,game.user.id).includes(false))continue;this.effects.push(doc);made.push(doc);writes.push(['create',id,doc.name]);}return made;},
  async updateEmbeddedDocuments(_t,rows,opts={}){for(const r of rows){const doc=this.effects.find(e=>e.id===r._id);if(!doc||call('preUpdateActiveEffect',doc,r,opts,game.user.id).includes(false))continue;
    Object.assign(doc,structuredClone(r),{statuses:new Set(r.statuses??doc.statuses)});writes.push(['update',id,doc.name]);}},
  async deleteEmbeddedDocuments(_t,ids,opts={}){for(const x of ids){const doc=this.effects.find(e=>e.id===x);if(!doc||call('preDeleteActiveEffect',doc,opts,game.user.id).includes(false))continue;
    this.effects.splice(this.effects.indexOf(doc),1);writes.push(['delete',id,doc.name]);}}};return a;};
const hero=actorOf('hero'),quiet=actorOf('quiet');
quiet.effects.push({id:'P1',name:'Poisoned',statuses:new Set(['poisoned'])});
const hub={id:'ashen-gate-character-hub',active:true,api:{playerVisibility:{isShown:key=>!(key==='strain'&&saved.get('hubHidesStrain'))}}};
globalThis.game={modules:new Map([[MOD,{id:MOD,active:true}],[hub.id,hub]]),i18n:{localize:x=>x},journal:{contents:[]},items:{contents:[]},
  // Like Foundry: set() runs the setting's onChange.
  settings:{register:(_m,k,o)=>{registered.set(k,o);if(o?.default!==undefined&&!saved.has(k))saved.set(k,o.default);},registerMenu:()=>{},get:(_m,k)=>saved.get(k),
    set:async(_m,k,v)=>{saved.set(k,v);registered.get(k)?.onChange?.(v);return v;}},
  actors:{contents:[hero,quiet],get(id){return this.contents.find(a=>a.id===id)??null;}},
  user:gm,users:{contents:[gm,gm2,owner],activeGM:gm},socket:{on:()=>{},emit:()=>{}}};
globalThis.ui={actors:null,notifications:{info:()=>{},error:()=>{},warn:m=>warnings.push(m)}};
await import('../scripts/main.mjs');
oneTime.get('init')();oneTime.get('setup')();oneTime.get('ready')();
await new Promise(r=>setTimeout(r,5));
const strain=game.modules.get(MOD).api.strain;
const settle=()=>new Promise(r=>setTimeout(r,5));
const chips=a=>a.effects.filter(isChipEffect);
const src={source:{module:'ashen-gate-test',kind:'hazard'},reason:'[TEST] hazard'};

test('setup registers the band statuses once in CONFIG.statusEffects, beside the native ones',()=>{
  oneTime.get('setup')();
  const ids=CONFIG.statusEffects.map(s=>s.id);
  assert.deepEqual(ids,['poisoned','ag-strain-0','ag-strain-1','ag-strain-2','ag-strain-3','ag-strain-4','ag-strain-5','ag-strain-6']);
  assert.equal(saved.get('strainChip'),true,'Show Strain chip on tokens defaults on');
});
test('GM: Strain change keeps exactly one chip for the band; same effect moves band; 0 removes it; other effects untouched',async()=>{
  game.user=gm;
  await strain.add(hero,2,src);await settle();
  assert.deepEqual(chips(hero).map(e=>[[...e.statuses][0],e.name]),[['ag-strain-1','Strain 2/10 (Band 1)']]);
  assert.deepEqual(chips(hero)[0].changes,undefined,'display only: no changes');
  const id=chips(hero)[0].id;
  await strain.add(hero,4,src);await settle();
  assert.deepEqual(chips(hero).map(e=>[e.id,[...e.statuses][0],e.name]),[[id,'ag-strain-3','Strain 6/10 (Band 3)']]);
  assert.equal(hero.flags['ashen-gate-strain'].state.value,6,'Strain stays the Actor value');
  writes.length=0;
  for(const fn of hooks.get('updateActor'))fn(hero,{flags:{}});await settle();
  assert.deepEqual(writes,[],'re-running the sync writes nothing');
  await strain.set(hero,0,{source:{module:'ashen-gate-test',kind:'gm'},reason:'[TEST] clear'});await settle();
  assert.equal(chips(hero).length,0);
  assert.deepEqual(quiet.effects.map(e=>e.id),['P1'],'an Actor with no Strain gets no chip; its own effects stay');
});
test('only the active GM client writes chips',async()=>{
  game.users.activeGM=gm2;game.user=gm;
  await hero.update({'flags.ashen-gate-strain.state':{value:3,history:[]}});await settle();
  assert.equal(chips(hero).length,0,'not the active GM: no write');
  game.user=owner;await hero.update({'flags.x':1});await settle();assert.equal(chips(hero).length,0);
  game.user=gm;game.users.activeGM=gm;
  for(const fn of hooks.get('updateActor'))fn(hero,{flags:{}});await settle();
  assert.equal(chips(hero)[0].name,'Strain 3/10 (Band 2)');
});
test('chip writes not made by the sync are refused for players and the GM; other effects pass',async()=>{
  const chip=chips(hero)[0];warnings.length=0;
  game.user=owner;
  await hero.deleteEmbeddedDocuments('ActiveEffect',[chip.id]);
  await hero.updateEmbeddedDocuments('ActiveEffect',[{_id:chip.id,name:'Strain 0/10'}]);
  await hero.createEmbeddedDocuments('ActiveEffect',[{name:'Strain: Band 6',statuses:['ag-strain-6']}]);
  game.user=gm;await hero.deleteEmbeddedDocuments('ActiveEffect',[chip.id]);
  assert.deepEqual(chips(hero).map(e=>[e.id,e.name]),[[chip.id,'Strain 3/10 (Band 2)']]);
  assert.equal(warnings.length,1,'four refusals, one notice');assert.match(warnings[0],/Change Strain in Ashen Gate \| Cinders/);
  await hero.createEmbeddedDocuments('ActiveEffect',[{name:'Poisoned',statuses:['poisoned']}]);
  const p=hero.effects.find(e=>e.statuses.has('poisoned'));assert.ok(p);
  game.user=owner;await hero.updateEmbeddedDocuments('ActiveEffect',[{_id:p.id,statuses:['ag-strain-0']}]);
  assert.ok(hero.effects.find(e=>e.id===p.id).statuses.has('poisoned'),'turning another effect into a chip is refused');
  await hero.deleteEmbeddedDocuments('ActiveEffect',[p.id]);assert.ok(!hero.effects.includes(p),'ordinary effects are not guarded');
  game.user=gm;
  assert.notEqual(call('preDeleteActiveEffect',chip,{[CHIP_OPTION]:true},'gm')[0],false,'the sync itself passes');
});
test('setting off removes every chip, on brings them back; Hub hiding the Strain bar removes them too',async()=>{
  game.user=gm;
  await strain.set(quiet,9,{source:{module:'ashen-gate-test',kind:'gm'},reason:'[TEST] set'});await settle();
  assert.equal(chips(quiet)[0].name,'Strain 9/10 (Band 5)');
  await game.settings.set(MOD,'strainChip',false);await settle();
  assert.equal(chips(hero).length+chips(quiet).length,0);
  await game.settings.set(MOD,'strainChip',true);await settle();
  assert.equal(chips(hero).length,1);assert.equal(chips(quiet).length,1);
  saved.set('hubHidesStrain',true);call('updateSetting',{key:'ashen-gate-character-hub.playerVisibility'});await settle();
  assert.equal(chips(hero).length+chips(quiet).length,0,'Strain hidden from players: no chip for anyone');
  saved.set('hubHidesStrain',false);call('updateSetting',{key:'ashen-gate-character-hub.playerVisibility'});await settle();
  assert.equal(chips(hero).length,1);
  hub.active=false;await game.settings.set(MOD,'strainChip',true);await settle();assert.equal(chips(hero).length,1,'without Character Hub chips follow the Cinders setting only');hub.active=true;
});
test('a new Actor copied with a chip but no Strain (a level backup) loses the chip',async()=>{
  game.user=gm;
  const copy=actorOf('copy',{flags:{'ashen-gate-character-hub':{levelBackup:{}}}});
  copy.effects.push({id:'C1',name:'Strain 3/10 (Band 2)',statuses:new Set(['ag-strain-2'])},{id:'C2',name:'Poisoned',statuses:new Set(['poisoned'])});
  game.actors.contents.push(copy);
  call('createActor',copy);await settle();
  assert.deepEqual(copy.effects.map(e=>e.id),['C2']);
});
test('a new Strain config re-registers the statuses and renames the chips',async()=>{
  game.user=gm;
  await strain.importConfig({schema:'ag-strain-config/0.1',bands:[{from:0,to:4,label:'[TEST] Calm'},{from:5,to:null,label:'[TEST] Frayed'}]});
  await settle();
  assert.deepEqual(CONFIG.statusEffects.map(s=>s.id),['poisoned','ag-strain-0','ag-strain-1']);
  assert.equal(chips(hero)[0].name,'Strain 3/10 ([TEST] Calm)');assert.equal(chips(quiet)[0].name,'Strain 9/10 ([TEST] Frayed)');
});
