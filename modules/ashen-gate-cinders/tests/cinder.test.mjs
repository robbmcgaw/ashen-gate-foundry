import test from 'node:test';import assert from 'node:assert/strict';
// Cinder instances, Push and Backfire (moved from Skill Trees 0.16.0). Pure rules (cinder.mjs) and the runtime with mocked Foundry globals
// and a stand-in Skill Trees (tests/fake-skill-trees.mjs): proves logic, ownership and permission checks, not the live Foundry UI.
import {validateDefinition,validateModifiers,normalizeModifier,blockModifiers,collectModifiers,availableModes,planPush,resolveBackfire,normalizeRegistry,createInstance,bindInstance,transferInstance,
  unbindInstance,planMigration,CINDER_WALLET_CAP,effectProblem,categoriesFor} from '../scripts/cinder.mjs';
import {defaultConfig,strainEffectBonus,validateConfig} from '../scripts/strain.mjs';

const fakeRoll=queue=>async formula=>{const total=queue.shift();if(total==null)throw Error(`unexpected roll ${formula}`);return {total,formula};};
const steady={powerId:'POWER-TEST-STEADY',name:'[TEST] Steady',power:{kind:'enhancement',modifiers:[
  {target:'backfire.chance',value:-10,stack:'steady',label:'[TEST] Steady Hands'},{target:'push.cost',value:-1,modes:['amplify'],label:'[TEST] Light Touch'}]}};
const steady2={powerId:'POWER-TEST-STEADY2',name:'[TEST] Steady 2',power:{kind:'enhancement',modifiers:[{target:'backfire.chance',value:-5,stack:'steady',label:'[TEST] Calm'}]}};
const table=(id,label,n,weight=1)=>({id,label,weight,entries:Array.from({length:n},(_,i)=>({id:`e${i+1}`,text:`[TEST] ${label} ${i+1}`}))});

test('definition check: power, enhancement, backfire table and the never-lethal rule',()=>{
  const power={id:'POWER-TEST-SPARK',entity_type:'Power',power:{schema:'ag-power/0.1',kind:'power',push_modes:[{id:'amplify',label:'[TEST] Amplify',strain_cost:2,effect:'[TEST]',requires:{powers:[]}}]}};
  assert.deepEqual(validateDefinition(power).errors,[]);
  const bad={id:'POWER-TEST-BAD',entity_type:'Power',power:{schema:'ag-power/0.1',kind:'power',push_modes:[{id:'amplify',label:'',strain_cost:0},{id:'amplify',label:'x',strain_cost:1}],modifiers:[{target:'hp',value:0}]}};
  const e=validateDefinition(bad).errors.join('\n');
  assert.match(e,/strain_cost/);assert.match(e,/duplicate mode/);assert.match(e,/target must be/);assert.match(e,/label/);
  const bf={id:'BF-TEST-BODY',entity_type:'BackfireTable',backfire:{schema:'ag-backfire/0.1',label:'[TEST] Body',entries:[
    {id:'jolt',text:'[TEST] jolt',effect:{status:'poisoned',rounds:1}},{id:'grave',text:'[TEST] grave',effect:{status:'dead',rounds:1}},
    {id:'nodur',text:'[TEST] x',effect:{status:'prone'}},{id:'hp',text:'[TEST] x',effect:{status:'prone',rounds:1,hp:-10}}]}};
  const be=validateDefinition(bf).errors.join('\n');
  assert.match(be,/"dead" is not allowed/);assert.match(be,/needs a duration/);assert.match(be,/hp is not allowed/);
  for(const s of ['dead','unconscious','exhaustion'])assert.match(effectProblem({status:s,rounds:1}),/not allowed/);
  assert.equal(effectProblem({status:'poisoned',minutes:10}),null);
  assert.deepEqual(validateDefinition({id:'MUT-TEST-EMBER',entity_type:'Mutation',cinder:{schema:'ag-cinder/0.1',backfire_categories:['BF-TEST-BODY']}}).errors,[]);
  assert.deepEqual(validateDefinition({id:'PERK-X',entity_type:'ProfessionPerk'}).errors,[],'other types have nothing to check');
});
test('modifiers: scoped, summed, same stack counts only the strongest; modes open by requirements',()=>{
  assert.deepEqual(collectModifiers([steady,steady2],'backfire.chance',{powerId:'POWER-TEST-SPARK',modeId:'amplify'}),{total:-10,used:[{label:'[TEST] Steady Hands',value:-10,from:'POWER-TEST-STEADY'}]});
  assert.equal(collectModifiers([steady],'push.cost',{powerId:'POWER-TEST-SPARK',modeId:'overreach'}).total,0,'mode-scoped');
  const def={power:{push_modes:[{id:'amplify'},{id:'overreach',requires:{powers:['POWER-TEST-REACH']}}]}};
  assert.deepEqual(availableModes(def,[]).map(m=>m.id),['amplify']);
  assert.deepEqual(availableModes(def,['POWER-TEST-REACH']).map(m=>m.id),['amplify','overreach']);
  assert.deepEqual(categoriesFor({cinder:{backfire_categories:['BF-A']}},{power:{}},{backfire_categories:[]}),['BF-A']);
  assert.deepEqual(categoriesFor({cinder:{backfire_categories:['BF-A']}},{power:{backfire_categories:['BF-B']}},{backfire_categories:['BF-C']}),['BF-C']);
});
test('ag-modifier/1: applies and requires, perk sources, the scope owner check for modifiers blocks (0.2.0)',()=>{
  // power.modifiers entries take the shared fields too; old top-level powers/modes still work.
  const power={id:'POWER-TEST-NEW',entity_type:'Power',power:{schema:'ag-power/0.1',kind:'enhancement',modifiers:[
    {target:'push.cost',value:-1,label:'[TEST] New',scope:'cinder',op:'add',applies:{powers:['POWER-TEST-SPARK'],modes:['amplify']},requires:{powers:['POWER-TEST-REACH']}}]}};
  assert.deepEqual(validateDefinition(power).errors,[]);
  const bad=structuredClone(power);Object.assign(bad.power.modifiers[0],{scope:'hq',op:'multiply',powers:['POWER-TEST-X'],requires:{perks:['PERK-TEST-A']}});bad.power.modifiers[0].applies.items=[];
  const e=validateDefinition(bad).errors.join('\n');
  for(const re of [/scope must be "cinder"/,/op must be "add"/,/applies only takes powers and modes/,/give powers once/,/requires only takes powers/])assert.match(e,re);
  // The check Manager calls for record-level blocks: entries arrive with their scope filled in.
  const ok=validateModifiers([{index:0,scope:'cinder',modifier:{target:'strain.recovery',value:1,label:'[TEST] Rest'}}],{recordId:'PERK-TEST-A'});
  assert.deepEqual(ok,{errors:[],warnings:[]});
  const v=validateModifiers([{index:1,scope:'cinder',modifier:{target:'push.bonus',value:200,label:''}}],{recordId:'ITEM-TEST-LENS'});
  assert.match(v.errors.join('\n'),/ITEM-TEST-LENS: modifiers\.list\[1\]: target must be one of/);assert.match(v.errors.join(),/-100 to 100/);assert.match(v.errors.join(),/label/);
  assert.match(v.warnings[0],/only while the item is attached to a Cinder socket/);
  // Normalised shape; block scope is the default; another scope or a bad entry is left out.
  assert.deepEqual(normalizeModifier({target:'push.cost',value:-1,label:'x',powers:['POWER-TEST-SPARK']}),{target:'push.cost',value:-1,label:'x',stack:null,powers:['POWER-TEST-SPARK'],modes:[],requires:[]});
  assert.deepEqual(blockModifiers({modifiers:{schema:'ag-modifiers/0.1',scope:'cinder',list:[{target:'push.cost',value:-1,label:'a'},{target:'push.cost',value:-2,label:'b',scope:'hq'},{target:'nope',value:1,label:'c'}]}}).map(m=>m.label),['a']);
  assert.deepEqual(blockModifiers({modifiers:{schema:'ag-modifiers/0.1',list:[{target:'push.cost',value:-1,label:'no scope'}]}}),[],'no scope on entry or block: not ours');
  // Perk sources join the powers' modifiers: same stack keeps only the largest, requires needs the power unlocked on this Cinder.
  const perk={sourceId:'PERK-TEST-GRIP',name:'[TEST] Grip',modifiers:blockModifiers({modifiers:{scope:'cinder',list:[
    {target:'backfire.chance',value:-20,stack:'steady',label:'[TEST] Grip calm'},{target:'push.cost',value:-1,label:'[TEST] Grip reach',requires:{powers:['POWER-TEST-REACH']}}]}})};
  const scope={powerId:'POWER-TEST-SPARK',modeId:'amplify',extra:[perk]};
  assert.deepEqual(collectModifiers([steady,steady2],'backfire.chance',scope),{total:-20,used:[{label:'[TEST] Grip calm',value:-20,from:'PERK-TEST-GRIP'}]});
  assert.equal(collectModifiers([steady],'push.cost',scope).total,-1,'Light Touch only: Grip reach needs POWER-TEST-REACH');
  assert.equal(collectModifiers([steady,{powerId:'POWER-TEST-REACH',power:{}}],'push.cost',scope).total,-2);
});
test('Push plan: cost never below 1, chance from Strain AFTER the gain, guaranteed at 10, modifiers cannot prevent it',()=>{
  const c=defaultConfig(),mode={id:'amplify',strain_cost:2};
  let p=planPush({strainValue:3,config:c,mode,unlocked:[steady],powerId:'POWER-TEST-SPARK'});
  assert.deepEqual([p.cost,p.after,p.chance],[1,4,15]);
  p=planPush({strainValue:0,config:c,mode:{id:'amplify',strain_cost:1},unlocked:[steady],powerId:'POWER-TEST-SPARK'});
  assert.equal(p.cost,1,'every Push gains at least 1 Strain');
  p=planPush({strainValue:9,config:c,mode,unlocked:[steady],powerId:'POWER-TEST-SPARK'});
  assert.deepEqual([p.after,p.chance,p.guaranteed],[10,100,true]);
  p=planPush({strainValue:12,config:c,mode,unlocked:[],powerId:'POWER-TEST-SPARK'});
  assert.deepEqual([p.after,p.chance],[14,100],'no cap at 10');
});
test('Backfire: two rolls (category, then effect); higher Strain pushes the effect roll toward the severe end',async()=>{
  const c=defaultConfig(),tables=[table('BF-A','Body',4),table('BF-B','Mind',3)];
  let r=await resolveBackfire({chance:15,tables,config:c,strain:4,roll:fakeRoll([16])});
  assert.equal(r.backfire,false);assert.equal(r.check.total,16);
  r=await resolveBackfire({chance:15,tables,config:c,strain:4,roll:fakeRoll([15,1,2])});
  assert.equal(r.backfire,true);assert.equal(r.category.id,'BF-A');assert.deepEqual([r.effectRoll.die,r.effectRoll.strainBonus,r.effectRoll.result],[2,0,2]);
  r=await resolveBackfire({chance:100,tables,config:c,strain:10,severity:-1,roll:fakeRoll([2,1])});
  assert.equal(r.check,null,'100% is automatic: no d100');assert.equal(r.category.id,'BF-B');
  assert.deepEqual([r.effectRoll.die,r.effectRoll.strainBonus,r.effectRoll.severity,r.effectRoll.result],[1,3,-1,3]);
  r=await resolveBackfire({chance:100,tables:[table('BF-A','Body',3)],config:c,strain:14,roll:fakeRoll([3])});
  assert.equal(r.effectRoll.result,3,'kept within the table');assert.equal(r.categoryRoll,null,'one category: no category roll');
  r=await resolveBackfire({chance:100,tables:[],config:c,strain:10,roll:fakeRoll([])});
  assert.equal(r.backfire,true);assert.match(r.note,/GM decides/);
  r=await resolveBackfire({chance:0,tables,config:c,strain:0,roll:fakeRoll([])});assert.equal(r.backfire,false);
  assert.deepEqual([4,5,6,7,8,9,10,11].map(v=>strainEffectBonus(c,v)),[0,1,1,2,2,3,3,4]);
  assert.equal(strainEffectBonus({...c,effect_roll:{strain_bonus:{enabled:false,from:5,per:2}}},10),0);
  assert.ok(validateConfig({schema:'ag-strain-config/0.1',effect_roll:{strain_bonus:{enabled:true,from:5,per:0}}}).errors.some(x=>/effect_roll/.test(x)));
  assert.deepEqual(validateConfig({schema:'ag-strain-config/0.1',effect_roll:{strain_bonus:{enabled:true,from:3,per:1}}}).config.effect_roll,{strain_bonus:{enabled:true,from:3,per:1}});
  const lethal={id:'BF-X',label:'x',entries:[{id:'a',text:'x',effect:{status:'dead',rounds:1}}]};
  r=await resolveBackfire({chance:100,tables:[lethal],config:c,strain:10,roll:fakeRoll([1])});
  assert.equal(r.entry.effect,null,'a forbidden effect is never handed on to be applied');
});
test('instances: one bearer, one of a kind per character, the limit, the starting point once per Cinder, transfer keeps progress',()=>{
  let reg=normalizeRegistry(null);
  ({registry:reg}=createInstance(reg,'MUT-TEST-EMBER',{instanceId:'cinst_AAAAAAAA1'}));
  ({registry:reg}=createInstance(reg,'MUT-TEST-EMBER',{instanceId:'cinst_AAAAAAAA2'}));
  ({registry:reg}=createInstance(reg,'MUT-TEST-OTHER',{instanceId:'cinst_AAAAAAAA3'}));
  assert.throws(()=>createInstance(reg,'POWER-TEST-X',{instanceId:'cinst_AAAAAAAA4'}),/MUT-/);
  let r=bindInstance(reg,'cinst_AAAAAAAA1','A',{max:1,initialPoints:1,at:1});reg=r.registry;
  assert.equal(r.initialAwarded,1);assert.equal(r.instance.progression.awarded,1);
  assert.throws(()=>bindInstance(reg,'cinst_AAAAAAAA1','B',{max:1}),/already bound/);
  assert.throws(()=>bindInstance(reg,'cinst_AAAAAAAA2','A',{max:2}),/already bears a Cinder of this kind/);
  assert.throws(()=>bindInstance(reg,'cinst_AAAAAAAA3','A',{max:1}),/limit is 1/);
  r=transferInstance(reg,'cinst_AAAAAAAA1','B',{max:1,at:2});reg=r.registry;
  assert.equal(r.instance.bearer.actorId,'B');assert.equal(r.instance.progression.awarded,1,'no new starting point on transfer');assert.equal(r.from,'A');
  r=unbindInstance(reg,'cinst_AAAAAAAA1');reg=r.registry;
  r=bindInstance(reg,'cinst_AAAAAAAA1','C',{max:1,initialPoints:1});
  assert.equal(r.initialAwarded,0,'re-binding later gives no second starting point');assert.equal(r.instance.progression.awarded,1);
  assert.equal(CINDER_WALLET_CAP,16);
  ({registry:reg}=createInstance(reg,'MUT-TEST-BIG',{instanceId:'cinst_AAAAAAAA5'}));
  assert.equal(bindInstance(reg,'cinst_AAAAAAAA5','D',{max:1,initialPoints:20}).initialAwarded,16,'starting points stay inside the 16-point wallet');
});
test('migration plan: per-character Cinder progress becomes Cinders; again finds nothing',()=>{
  const actors=[{actorId:'A',name:'[TEST] A',accounts:{'cinder:MUT-TEST-EMBER':{awarded:3,unlocks:['n1']},'tree:X':{awarded:2},'cinder:MUT-TEST-OTHER':{awarded:0,unlocks:[]}}}];
  let reg=normalizeRegistry(null);
  const rows=planMigration(reg,actors);
  assert.deepEqual(rows.map(r=>[r.actorId,r.definitionId,r.action]),[['A','MUT-TEST-EMBER','create']]);
  ({registry:reg}=createInstance(reg,'MUT-TEST-EMBER',{instanceId:'cinst_BBBBBBBB1'}));({registry:reg}=bindInstance(reg,'cinst_BBBBBBBB1','A',{max:1}));
  assert.equal(planMigration(reg,actors)[0].action,'skip');
});


// ---- Runtime with mocked Foundry and a stand-in Skill Trees 0.17.0 ----
import {fakeSkillTrees} from './fake-skill-trees.mjs';
class FakeApplication {static DEFAULT_OPTIONS={};render(){return this;}async _prepareContext(){return {};}}
const oneTime=new Map(),hooks=new Map(),called=[],saved=new Map(),socketHandlers=[],emitted=[],messages=[],rolls=[];
const Hooks_={once:(e,fn)=>oneTime.set(e,fn),on:(e,fn)=>hooks.set(e,[...(hooks.get(e)??[]),fn]),callAll:(e,d)=>{called.push([e,d]);for(const fn of hooks.get(e)??[])fn(d);}};
globalThis.Hooks=Hooks_;
let counter=0;
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{confirm:async()=>true}}},utils:{escapeHTML:x=>String(x),randomID:()=>`R${String(++counter).padStart(15,'0')}`}};
globalThis.Roll=class{constructor(f){this.formula=f;}async evaluate(){const t=rolls.shift();if(t==null)throw Error(`unexpected roll ${this.formula}`);this.total=t;return this;}};
globalThis.ChatMessage={create:async d=>{messages.push(d);return d;},getSpeaker:({actor})=>({actor:actor.id})};
globalThis.CONFIG={statusEffects:[{id:'poisoned',name:'Poisoned',img:'poisoned.svg'}]};
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{NONE:0}};
const MOD='ashen-gate-cinders',DEF='MUT-TEST-EMBER';
const node=(id,perkId,x)=>({id,perkId,x,y:100,requiresAll:[],requiresAny:[],excludes:[],status:'approved',visibility:'player',display:'shown'});
const tree={id:'TEST-EMBER-TREE',name:'[TEST] Ember',sourceRef:DEF,provider:{kind:'cinder_milestone',maxPoints:16},
  nodes:[node('NODE1','POWER-TEST-SPARK',100),node('NODE2','POWER-TEST-STEADY',300),node('NODE3','POWER-TEST-REACH',500)]};
const legacyTree={id:'TEST-LEGACY-TREE',name:'[TEST] Legacy',sourceRef:'MUT-TEST-LEGACY',provider:{kind:'cinder_milestone',maxPoints:13},nodes:[]};
const source=(sourceId,entityType,definition)=>({'ashen-gate-manager':{source:{sourceId,entityType,status:'approved',visibility:'player',definition:{id:sourceId,entity_type:entityType,point_cost:1,...definition}}}});
const worldItem=(id,sourceId,name,entityType,definition)=>({id,uuid:`Item.${id}`,documentName:'Item',type:'feat',name,img:null,ownership:{default:2},system:{description:{value:''}},
  testUserPermission:()=>true,flags:source(sourceId,entityType,definition),
  toObject(){return structuredClone({_id:this.id,name:this.name,type:this.type,img:this.img,system:this.system,flags:this.flags});}});
const bfJournal=(id,sourceId,label,entries)=>({id,uuid:`JournalEntry.${id}`,documentName:'JournalEntry',name:label,ownership:{default:0},testUserPermission:u=>u.isGM,
  flags:{'ashen-gate-manager':{source:{sourceId,entityType:'BackfireTable',status:'approved',visibility:'gm',definition:{id:sourceId,entity_type:'BackfireTable',backfire:{schema:'ag-backfire/0.1',label,entries}}}}}});
const items=[
  worldItem('W0',DEF,'[TEST] Ember Cinder','Mutation',{cinder:{schema:'ag-cinder/0.1',backfire_categories:['BF-TEST-BODY','BF-TEST-MIND']}}),
  worldItem('W9','MUT-TEST-LEGACY','[TEST] Legacy Cinder','Mutation',{}),
  worldItem('W1','POWER-TEST-SPARK','[TEST] Spark','Power',{power:{schema:'ag-power/0.1',kind:'power',standard:{summary:'[TEST] normal'},
    push_modes:[{id:'amplify',label:'[TEST] Amplify',strain_cost:2,effect:'[TEST] bigger'},{id:'overreach',label:'[TEST] Overreach',strain_cost:3,requires:{powers:['POWER-TEST-REACH']}}]}}),
  worldItem('W2','POWER-TEST-STEADY','[TEST] Steady','Power',{power:{schema:'ag-power/0.1',kind:'enhancement',modifiers:steady.power.modifiers}}),
  worldItem('W3','POWER-TEST-REACH','[TEST] Reach','Power',{power:{schema:'ag-power/0.1',kind:'enhancement',modifiers:[{target:'strain.recovery',value:1,label:'[TEST] Deep Rest'}]}})];
const tables=[bfJournal('J1','BF-TEST-BODY','[TEST] Body',[{id:'jolt',text:'[TEST] A jolt.',effect:{status:'poisoned',rounds:1}},{id:'ache',text:'[TEST] An ache.'},{id:'scar',text:'[TEST] A scar.'}]),
  bfJournal('J2','BF-TEST-MIND','[TEST] Mind',[{id:'whisper',text:'[TEST] A whisper.'},{id:'omen',text:'[TEST] An omen.'}])];
const setPath=(obj,path,value)=>{const k=path.split('.');let o=obj;for(const p of k.slice(0,-1))o=o[p]??={};o[k.at(-1)]=structuredClone(value);};
const gm={id:'gm',isGM:true,name:'GM'},alice={id:'u1',isGM:false,name:'Alice'},bob={id:'u2',isGM:false,name:'Bob'};
function makeActor(id,ownerId){
  const actor={id,name:`[TEST] ${id}`,type:'character',flags:{},items:[],effects:[],system:{attributes:{hp:{value:20}}},
    get isOwner(){return game.user.isGM||game.user.id===ownerId;},testUserPermission:(u)=>u.isGM||u.id===ownerId,
    async update(data){const diff={};for(const [k,v] of Object.entries(data)){setPath(this,k,v);setPath(diff,k,v);}for(const fn of hooks.get('updateActor')??[])fn(this,diff);return this;},
    async setFlag(m,k,v){this.flags[m]??={};this.flags[m][k]=structuredClone(v);},
    async createEmbeddedDocuments(type,data){
      if(type==='ActiveEffect'){const docs=data.map(d=>({...structuredClone(d),id:`AE${++counter}`}));actor.effects.push(...docs);return docs;}
      const docs=data.map(d=>{const doc={...structuredClone(d),id:`EMB${++counter}`,parent:actor,actor,documentName:'Item',async delete(){actor.items=actor.items.filter(x=>x!==doc);},
        async setFlag(m,k,v){this.flags??={};this.flags[m]??={};this.flags[m][k]=structuredClone(v);}};return doc;});
      actor.items.push(...docs);return docs;}};
  actor.items.get=function(id){return actor.items.find(i=>i.id===id);};
  return actor;
}
// items.get must survive the filter in delete(): keep it on every array the actor holds.
const withGet=a=>{const fix=()=>{if(!a.items.get)a.items.get=id=>a.items.find(i=>i.id===id);};const orig=a.createEmbeddedDocuments;a.createEmbeddedDocuments=async(...x)=>{fix();const r=await orig(...x);fix();return r;};
  return new Proxy(a,{get(t,p){if(p==='items')fix();return t[p];}});};
const A=withGet(makeActor('A','u1')),B=withGet(makeActor('B','u2')),C=withGet(makeActor('C','u2'));
const st=fakeSkillTrees({trees:[tree,legacyTree],worldItem:id=>items.find(i=>i.flags['ashen-gate-manager'].source.sourceId===id),hooks:Hooks_});
st.seed(C,legacyTree.id,{awarded:2,unlocks:[],grants:[{key:'old',amount:2}]});
const treesModule={id:'ashen-gate-skill-trees',active:true,api:st.api};
globalThis.game={modules:new Map([[MOD,{id:MOD,active:true}],['ashen-gate-skill-trees',treesModule]]),i18n:{localize:x=>x},
  settings:{register:(_m,k,o)=>{if(o?.default!==undefined&&!saved.has(k))saved.set(k,o.default);},registerMenu:()=>{},get:(_m,k)=>saved.get(k),set:async(_m,k,v)=>{saved.set(k,v);return v;}},
  journal:{contents:[...tables]},items:{contents:items},tables:{contents:[]},macros:{contents:[]},
  actors:{contents:[A,B,C],get(id){return this.contents.find(a=>a.id===id)??null;}},
  user:gm,users:{contents:[gm,alice,bob],get:id=>[gm,alice,bob].find(u=>u.id===id),activeGM:gm},
  socket:{on:(_n,fn)=>socketHandlers.push(fn),emit:(_n,msg)=>emitted.push(msg)}};
globalThis.JournalEntry={create:async data=>{const d={...structuredClone(data),documentName:'JournalEntry',async setFlag(m,k,v){this.flags[m][k]=structuredClone(v);}};game.journal.contents.push(d);return d;}};
globalThis.ui={actors:null,notifications:{info:()=>{},error:()=>{},warn:()=>{}}};
saved.set('strainChip',false); // the Strain chip (0.8.0) has its own tests; keep these effect lists to Backfire effects
await import('../scripts/main.mjs');
oneTime.get('init')();oneTime.get('ready')();
await new Promise(r=>setTimeout(r,5)); // the deferred Skill Trees check and adopt
const api=game.modules.get(MOD).api,cinder=api.cinder,strain=api.strain;
const wallet=a=>st.api.accounts.account(a,tree.id);
const powersOn=a=>a.items.map(i=>i.flags['ashen-gate-skill-trees']?.grant?.perkId).filter(Boolean).sort();
const gmSet=async(a,n)=>strain.set(a,n,{source:{module:'ashen-gate-test',kind:'gm'},reason:'[TEST] set'});
const fire=async(e,...args)=>{for(const fn of hooks.get(e)??[])await fn(...args);};
const settle=()=>new Promise(r=>setTimeout(r,5));
let ember;

test('Skill Trees 0.17.0 is detected; the Cinders journal is this module\'s own',async()=>{
  assert.equal(api.status().status,'ok');
  game.user=gm;ember=await cinder.create(DEF);
  const store=game.journal.contents.find(d=>d.flags?.[MOD]?.gmRecords);assert.ok(store,'own GM-only Journal');assert.equal(store.ownership.default,0);
});
test('bind: starting point, progress written to the bearer\'s tree through Skill Trees, pointer in this module\'s flags',async()=>{
  game.user=gm;
  const r=await cinder.bind(ember.instanceId,A);
  assert.equal(r.initialAwarded,1);assert.equal(wallet(A).awarded,1);
  assert.deepEqual(A.flags[MOD].cinders.map(p=>[p.instanceId,p.definitionId,p.name]),[[ember.instanceId,DEF,'[TEST] Ember Cinder']]);
  assert.equal(A.flags['ashen-gate-skill-trees'],undefined,'never writes Skill Trees flags itself');
});
test('progress on the bearer\'s tree goes onto the Cinder; a non-bearer is refused by Skill Trees\' check hook',async()=>{
  game.user=gm;
  await st.api.grantPoints(A,tree.id,1,'[TEST] m1');await st.api.grantPoints(A,tree.id,1,'[TEST] m2');
  await st.api.unlock(A,tree.id,'NODE1');await st.api.unlock(A,tree.id,'NODE2');await settle();
  const inst=cinder.instances().find(i=>i.instanceId===ember.instanceId);
  assert.equal(inst.progression.awarded,3);assert.deepEqual(inst.progression.unlocks,['NODE1','NODE2']);
  assert.deepEqual(powersOn(A),['POWER-TEST-SPARK','POWER-TEST-STEADY']);
  await assert.rejects(st.api.grantPoints(B,tree.id,1,'[TEST] nope'),/does not bear this Cinder/);
  await assert.rejects(st.api.unlock(B,tree.id,'NODE1'),/does not bear this Cinder/);
});
test('list and preview: modes, cost with modifiers, chance from post-gain Strain; owners only',async()=>{
  game.user=gm;await gmSet(A,3);
  const [c]=cinder.list(A);
  assert.equal(c.name,'[TEST] Ember Cinder');assert.deepEqual(c.powers.map(p=>p.powerId),['POWER-TEST-SPARK']);assert.deepEqual(c.enhancements.map(p=>p.powerId),['POWER-TEST-STEADY']);
  assert.deepEqual(c.powers[0].modes.map(m=>[m.id,m.cost,m.after,m.chance]),[['amplify',1,4,15]]);
  game.user=alice;assert.equal(cinder.previewPush(A,ember.instanceId,'POWER-TEST-SPARK','amplify').chance,15);
  saved.set('playerAccessEnabled',false);try{assert.throws(()=>cinder.list(A),/hidden/);assert.equal(strain.get(A).value,3,'Strain stays readable for the Hub');}finally{saved.set('playerAccessEnabled',true);}
  game.user=bob;assert.throws(()=>cinder.list(A),/Actor access denied/);
  game.user=gm;
});
test('Push: Strain gained first, Backfire from post-gain Strain, two rolls, chat card, effect',async()=>{
  game.user=gm;messages.length=0;
  rolls.push(10,1,1);
  const r=await cinder.push(A,'POWER-TEST-SPARK','amplify');
  assert.deepEqual([r.strain.from,r.strain.to,r.backfire.backfire,r.backfire.category.id,r.backfire.entry.id,r.effectApplied],[3,4,true,'BF-TEST-BODY','jolt',true]);
  assert.deepEqual(A.effects.map(e=>[e.statuses[0],e.duration.rounds,e.flags[MOD].backfire.opId]),[['poisoned',1,r.opId]]);
  const last=strain.history(A).at(-1);assert.deepEqual([last.source.module,last.source.kind,last.source.ref,last.opId],[MOD,'push','POWER-TEST-SPARK',r.opId]);
  assert.match(messages[0].content,/Backfire!/);assert.match(messages[0].content,/agc-chat/);
  rolls.push(99);const quiet=await cinder.push(A,'POWER-TEST-SPARK','amplify');assert.equal(quiet.backfire.backfire,false);assert.equal(strain.get(A).value,5);
});
test('a failed Strain write means no Push: no effect, no chat card',async()=>{
  game.user=gm;const before=messages.length,effects=A.effects.length,orig=A.update;
  A.update=async()=>{throw Error('[TEST] write failed');};rolls.push(1,1,1);
  try{await assert.rejects(cinder.push(A,'POWER-TEST-SPARK','amplify'),/write failed/);}finally{A.update=orig;rolls.length=0;}
  assert.equal(messages.length,before);assert.equal(A.effects.length,effects);
});
test('Strain 10: guaranteed, Strain pushes the effect roll worse, never lethal; normal use backfires without Strain',async()=>{
  game.user=gm;await gmSet(A,9);rolls.push(2,1);
  const r=await cinder.push(A,'POWER-TEST-SPARK','amplify');
  assert.equal(r.backfire.check,null);assert.deepEqual([r.backfire.effectRoll.strainBonus,r.backfire.effectRoll.result],[3,2]);
  assert.equal(A.system.attributes.hp.value,20);assert.ok(A.effects.every(e=>!['dead','unconscious','exhaustion'].includes(e.statuses[0])));
  const spark=A.items.find(i=>i.flags['ashen-gate-skill-trees']?.grant?.perkId==='POWER-TEST-SPARK'),before=messages.length;
  rolls.push(1,1);await fire('dnd5e.postUseActivity',{item:spark});
  assert.equal(messages.length,before+1);assert.equal(strain.get(A).value,10,'no Strain added');
  await gmSet(A,9);await fire('dnd5e.postUseActivity',{item:spark});assert.equal(messages.length,before+1,'below 10: nothing');
});
test('a player Push is relayed to the GM client, which re-checks ownership',async()=>{
  game.user=gm;await gmSet(A,0);
  game.user=alice;emitted.length=0;const pending=cinder.push(A,'POWER-TEST-SPARK','amplify');const msg=emitted.at(-1);assert.equal(msg.type,'cinder-push');
  game.user=gm;rolls.push(99);for(const h of socketHandlers)await h(msg,'u1');
  const reply=emitted.at(-1);assert.equal(reply.ok,true,reply.message);
  game.user=alice;for(const h of socketHandlers)await h(reply,'gm');assert.equal((await pending).backfire,false);
  game.user=gm;for(const h of socketHandlers)await h({...msg,requestId:'x2'},'u2');assert.match(emitted.at(-1).message,/do not own/);
});
test('players cannot run GM operations or read the registry',async()=>{
  for(const u of [alice,bob]){game.user=u;
    await assert.rejects(cinder.create(DEF),/GM only/);await assert.rejects(cinder.bind(ember.instanceId,B),/GM only/);
    await assert.rejects(cinder.transfer(ember.instanceId,B),/GM only/);await assert.rejects(cinder.unbind(ember.instanceId),/GM only/);
    assert.throws(()=>cinder.instances(),/GM only/);await assert.rejects(cinder.migrate(),/GM only/);}
  game.user=gm;
});
test('transfer: progress and powers move to B without duplicates; Strain and conditions stay with A; no new starting point',async()=>{
  game.user=gm;const aStrain=strain.get(A).value,aEffects=A.effects.length;
  await cinder.transfer(ember.instanceId,B);await settle();
  const inst=cinder.instances().find(i=>i.instanceId===ember.instanceId);
  assert.deepEqual([inst.bearer.actorId,inst.progression.awarded],['B',3]);assert.deepEqual(inst.progression.unlocks,['NODE1','NODE2']);
  assert.deepEqual(powersOn(B),['POWER-TEST-SPARK','POWER-TEST-STEADY']);assert.deepEqual(powersOn(A),[]);
  assert.deepEqual(wallet(B).unlocks,['NODE1','NODE2']);assert.deepEqual(wallet(A).unlocks,[]);assert.equal(A.flags[MOD].cinders.length,0);
  assert.equal(strain.get(A).value,aStrain);assert.equal(strain.get(B).value,0);assert.equal(A.effects.length,aEffects);
  await cinder.repair();assert.deepEqual(powersOn(B),['POWER-TEST-SPARK','POWER-TEST-STEADY']);assert.deepEqual(cinder.report(),[]);
});
test('duplicate simultaneous ownership is rejected',async()=>{
  game.user=gm;const second=await cinder.create(DEF);
  await assert.rejects(cinder.bind(second.instanceId,B),/already bears a Cinder of this kind/);
  await assert.rejects(cinder.transfer(ember.instanceId,B),/already bears this Cinder/);
  await assert.rejects(cinder.bind(ember.instanceId,C),/already bound/);
});
test('rest recovery adds strain.recovery modifiers from the bearer\'s powers; a perk opens a Push mode',async()=>{
  game.user=gm;await st.api.grantPoints(B,tree.id,1,'[TEST] m3');await st.api.unlock(B,tree.id,'NODE3');await settle();
  await gmSet(B,5);await fire('createChatMessage',{id:'rest1',type:'rest',system:{type:'long'},speaker:{actor:'B'},author:bob});
  assert.equal(strain.get(B).value,3);
  assert.deepEqual(cinder.list(B)[0].powers[0].modes.map(m=>m.id),['amplify','overreach']);
});
test('perk modifiers (PERK-* Items with a modifiers block) change Push, Backfire chance and rest; items wait for sockets; api.modifiers (0.2.0)',async()=>{
  game.user=gm;await gmSet(B,3);
  const perkDef={modifiers:{schema:'ag-modifiers/0.1',scope:'cinder',list:[
    {target:'push.cost',value:-1,label:'[TEST] Grip reach',applies:{modes:['overreach']}},
    {target:'backfire.chance',value:-20,stack:'steady',label:'[TEST] Grip calm'},
    {target:'strain.recovery',value:1,label:'[TEST] Grip rest',requires:{powers:['POWER-TEST-REACH']}}]}};
  const perkItem=id=>({id,name:'[TEST] Steady Grip',type:'feat',flags:source('PERK-TEST-GRIP','ProfessionPerk',perkDef)});
  const lens={id:'LENS1',name:'[TEST] Ember Lens',type:'loot',flags:source('ITEM-TEST-EMBER-LENS','Item',{modifiers:{schema:'ag-modifiers/0.1',scope:'cinder',list:[{target:'push.cost',value:-5,label:'[TEST] Lens'}]}})};
  const before=cinder.list(B)[0].powers[0].modes.map(m=>[m.id,m.cost,m.chance]);
  B.items.push(perkItem('PERK1'),perkItem('PERK2'),lens);
  try{
    const modes=cinder.list(B)[0].powers[0].modes;
    assert.deepEqual(modes.map(m=>[m.id,m.cost]),[['amplify',before[0][1]],['overreach',before[1][1]-1]],'the copy of the same perk counts once; the loose item does nothing');
    const amp=modes[0];assert.equal(amp.chance,before[0][2]-10,'Grip calm -20 replaces Steady Hands -10 in the steady stack');
    assert.ok(amp.modifiers.some(m=>m.from==='PERK-TEST-GRIP'&&m.label==='[TEST] Grip calm'));assert.ok(!amp.modifiers.some(m=>m.label==='[TEST] Steady Hands'));
    rolls.push(99);const r=await cinder.push(B,'POWER-TEST-SPARK','overreach');assert.equal(r.plan.cost,before[1][1]-1,'the GM client counts the perk too');
    await gmSet(B,5);await fire('createChatMessage',{id:'rest2',type:'rest',system:{type:'long'},speaker:{actor:'B'},author:bob});
    assert.equal(strain.get(B).value,2,'1 base + Deep Rest 1 + Grip rest 1 (counted once)');
    // The scope owner API.
    assert.equal(api.modifiers.contract,'ag-modifier/1');assert.equal(api.modifiers.scope,'cinder');assert.deepEqual(api.modifiers.targets,['push.cost','backfire.chance','backfire.severity','strain.recovery','sockets.count']);
    assert.deepEqual(api.modifiers.validate([{index:0,scope:'cinder',modifier:{target:'push.cost',value:-1,label:'x'}}],{recordId:'PERK-TEST-A'}).errors,[]);
    assert.deepEqual(api.modifiers.forActor(B).map(m=>[m.sourceId,m.target,m.value]),[['PERK-TEST-GRIP','push.cost',-1],['PERK-TEST-GRIP','backfire.chance',-20],['PERK-TEST-GRIP','strain.recovery',1]]);
    game.user=bob;assert.equal(api.modifiers.forActor(B).length,3,'the owner reads their own');
    saved.set('playerAccessEnabled',false);try{assert.throws(()=>api.modifiers.forActor(B),/hidden/);}finally{saved.set('playerAccessEnabled',true);}
    game.user=alice;assert.throws(()=>api.modifiers.forActor(B),/Actor access denied/);
  }finally{game.user=gm;B.items.splice(B.items.findIndex(i=>i.id==='PERK1'),3);}
  await gmSet(B,3);
  assert.deepEqual(cinder.list(B)[0].powers[0].modes.map(m=>[m.id,m.cost,m.chance]),before,'removing the perk removes its modifiers');
});
test('sockets (0.3.0): attach / detach / swap on the GM client, player relay and lock, capacity drop keeps items, drop target, check and repair',async()=>{
  game.user=gm;const sock=api.sockets,id=ember.instanceId;
  const mods=list=>({modifiers:{schema:'ag-modifiers/0.1',scope:'cinder',list}});
  const gear=(iid,sourceId,list,extra={})=>({id:iid,name:`[TEST] ${sourceId}`,type:'loot',flags:source(sourceId,'Item',list?mods(list):{}),...extra,
    async setFlag(m,k,v){this.flags[m]??={};this.flags[m][k]=structuredClone(v);}});
  const L1=gear('L1','ITEM-TEST-LENS',[{target:'push.cost',value:-1,label:'[TEST] Lens',applies:{modes:['overreach']}}]);
  const L2=gear('L2','ITEM-TEST-SOCKET',[{target:'sockets.count',value:1,label:'[TEST] Extra socket'}]);
  const L3=gear('L3','ITEM-TEST-CALM',[{target:'backfire.chance',value:-1,label:'[TEST] Calm'}]),L4=gear('L4','ITEM-TEST-REST',[{target:'strain.recovery',value:1,label:'[TEST] Rest'}]);
  const L5=gear('L5','ITEM-TEST-SPARE',[{target:'push.cost',value:-1,label:'[TEST] Spare'}]),plainItem=gear('P1','ITEM-TEST-PLAIN',null);
  B.items.push(L1,L2,L3,L4,L5,plainItem);
  const overreach=()=>cinder.list(B)[0].powers[0].modes.find(m=>m.id==='overreach').cost,base=overreach();
  let h=sock.slots(B,id);assert.deepEqual([h.capacity,h.free,h.slots.length,h.locked],[3,3,0,false],'default 3 sockets');
  assert.deepEqual(sock.socketable(B).map(x=>x.itemId).sort(),['L1','L2','L3','L4','L5'],'only ITEM-* with cinder modifiers fit');
  assert.deepEqual(sock.canAttach(B,id,'P1').reasons,['[TEST] ITEM-TEST-PLAIN has no Cinder modifiers, so it does not fit a socket']);
  await assert.rejects(sock.attach(B,id,'P1'),/does not fit a socket/);
  // GM attaches: the Push preview and the GM-side Push count it; the item is marked; the bearer's copy is updated.
  assert.deepEqual(await sock.attach(B,id,'L1'),{changed:true,slot:0});
  assert.equal(overreach(),base-1);assert.deepEqual(L1.flags[MOD].attachedTo,{instanceId:id,slot:0});
  assert.deepEqual(B.flags[MOD].cinders[0].sockets.attached,[{slot:0,itemId:'L1',sourceId:'ITEM-TEST-LENS'}]);
  rolls.push(99);assert.equal((await cinder.push(B,'POWER-TEST-SPARK','overreach')).plan.cost,base-1);await gmSet(B,3);
  // A repeated opId does nothing; an item adding a socket raises the capacity.
  await sock.attach(B,id,'L2',{opId:'sock:test-1'});assert.deepEqual(await sock.attach(B,id,'L3',{opId:'sock:test-1'}),{changed:false,duplicate:true,slot:null});
  h=sock.slots(B,id);assert.deepEqual([h.capacity,h.free],[4,2]);
  await sock.attach(B,id,'L3');await sock.attach(B,id,'L4');
  await assert.rejects(sock.attach(B,id,'L5'),/All 4 sockets are in use/);
  // Fewer sockets: extras stay attached but inactive (nothing deleted); removing one lets the next one count.
  await sock.setCount(id,1);h=sock.slots(B,id);
  assert.deepEqual([h.capacity,h.slots.map(x=>[x.itemId,x.active])],[1,[['L1',true],['L2',false],['L3',false],['L4',false]]]);
  assert.ok(['L1','L2','L3','L4'].every(i=>B.items.get(i)),'nothing deleted');
  await sock.detach(B,id,0);assert.equal(L1.flags[MOD].attachedTo,null);
  h=sock.slots(B,id);assert.deepEqual([h.capacity,h.slots.map(x=>[x.itemId,x.active])],[2,[['L2',true],['L3',true],['L4',false]]],'L2 is active again and adds its socket');
  assert.equal(overreach(),base,'a detached item no longer counts');
  await sock.setCount(id,null);assert.equal(sock.slots(B,id).capacity,4);
  // Swap keeps the socket; the old item comes out.
  await sock.swap(B,id,3,'L1');assert.deepEqual(sock.slots(B,id).slots.map(x=>[x.slot,x.itemId]),[[1,'L2'],[2,'L3'],[3,'L1']]);assert.equal(L4.flags[MOD].attachedTo,null);
  // The owner's request goes to the GM client, which re-checks; the GM lock and Player Access are enforced there.
  game.user=bob;emitted.length=0;const pending=sock.detach(B,id,3);const msg=emitted.at(-1);assert.equal(msg.type,'cinder-socket');
  game.user=gm;for(const fn of socketHandlers)await fn(msg,'u2');const reply=emitted.at(-1);assert.equal(reply.ok,true,reply.message);
  game.user=bob;for(const fn of socketHandlers)await fn(reply,'gm');assert.equal((await pending).changed,true);
  game.user=gm;for(const fn of socketHandlers)await fn({...msg,requestId:'s2',op:{kind:'attach',itemId:'L4'}},'u1');assert.match(emitted.at(-1).message,/do not own/,'Alice is not the owner');
  await sock.setLocked(id,true);
  game.user=bob;await assert.rejects(sock.attach(B,id,'L4'),/locked/);assert.equal(sock.slots(B,id).canEdit,false);
  game.user=gm;for(const fn of socketHandlers)await fn({...msg,requestId:'s3',op:{kind:'attach',itemId:'L4'}},'u2');assert.match(emitted.at(-1).message,/locked/,'a forged request is refused on the GM client too');
  await sock.attach(B,id,'L4');assert.ok(sock.slots(B,id).slots.some(x=>x.itemId==='L4'),'the GM is not locked out');
  await sock.setLocked(id,false);
  saved.set('playerAccessEnabled',false);game.user=bob;try{assert.throws(()=>sock.hosts(B),/hidden/);await assert.rejects(sock.detach(B,id,1),/hidden/);}finally{saved.set('playerAccessEnabled',true);game.user=gm;}
  game.user=alice;assert.throws(()=>sock.hosts(B),/Actor access denied/);game.user=gm;
  // Drop target: a world Item is copied to the bearer and attached.
  await sock.detach(B,id,0).catch(()=>{});await sock.detach(B,id,2);
  const world=worldItem('W7','ITEM-TEST-DROPPED','[TEST] Dropped Lens','Item',mods([{target:'push.cost',value:-1,label:'[TEST] Dropped'}]));
  const r=await sock.attachDropped(id,world);assert.ok(r.created);assert.equal(B.items.get(r.created).name,'[TEST] Dropped Lens');
  assert.ok(sock.slots(B,id).slots.some(x=>x.itemId===r.created));
  await assert.rejects(sock.attachDropped(id,worldItem('W8','ITEM-TEST-NONE','[TEST] None','Item',{})),/does not fit/);
  assert.equal(B.items.filter(i=>i.name==='[TEST] None').length,0,'nothing copied when it does not fit');
  // Check and repair: a lost marker and an item that left the bearer.
  assert.deepEqual(cinder.report(),[]);
  L2.flags[MOD].attachedTo=null;B.items.splice(B.items.indexOf(B.items.get(r.created)),1);
  const rows=cinder.report().map(x=>x.text).join('\n');assert.match(rows,/not marked as attached/);assert.match(rows,/no longer on/);
  const done=await cinder.repair();assert.ok(done.some(x=>/emptied 1 socket/.test(x)),done.join());assert.deepEqual(cinder.report(),[]);
  assert.deepEqual(L2.flags[MOD].attachedTo,{instanceId:id,slot:1});
});
test('rehook (0.7.0): a character whose Actor data was replaced in place is re-linked from the records; records unchanged; GM only',async()=>{
  game.user=gm;const id=ember.instanceId;
  const recordBefore=JSON.stringify(cinder.instances()),pointersBefore=JSON.stringify(B.flags[MOD].cinders),powersBefore=powersOn(B),walletBefore=JSON.stringify(wallet(B));
  const markers=()=>B.items.filter(i=>!i.flags?.['ashen-gate-skill-trees']?.grant).map(i=>[i.id,i.flags?.[MOD]?.attachedTo??null]),markersBefore=JSON.stringify(markers());
  assert.ok(markers().some(([,m])=>m),'B has socketed items');
  // What a restore from an older copy leaves behind: an old pointer list, old tree progress, old item markers.
  B.flags[MOD].cinders=[{instanceId:'cinst_old',definitionId:DEF,name:'[TEST] old',sockets:{attached:[]},art:null}];
  // Written straight onto the Actor like a restore does (no Skill Trees call, so no progress hook onto the record).
  st.seed(B,tree.id,{awarded:0,unlocks:[],grants:[]});for(const i of B.items.filter(i=>i.flags?.['ashen-gate-skill-trees']?.grant))B.items.splice(B.items.indexOf(i),1);
  const socketed=B.items.find(i=>i.flags?.[MOD]?.attachedTo);socketed.flags[MOD].attachedTo=null;
  const loose=B.items.find(i=>!i.flags?.[MOD]?.attachedTo&&i.setFlag);loose.flags[MOD]??={};loose.flags[MOD].attachedTo={instanceId:'cinst_old',slot:9};
  assert.ok(cinder.report().length>0,'Check sees the mismatch');
  game.user=bob;await assert.rejects(cinder.rehook(B),/GM only/);game.user=gm;
  const r=await cinder.rehook(B);
  assert.deepEqual(r.instances,[id]);assert.ok(r.done.length>0);
  assert.equal(JSON.stringify(B.flags[MOD].cinders),pointersBefore,'bearer link back, stale one gone');
  assert.deepEqual(powersOn(B),powersBefore);assert.equal(JSON.stringify(wallet(B)),walletBefore,'tree progress from the Cinder');
  assert.equal(JSON.stringify(markers()),markersBefore,'socket markers from the record');
  assert.equal(JSON.stringify(cinder.instances()),recordBefore,'the records are the truth and are not changed');
  assert.deepEqual(cinder.report(),[]);
  assert.deepEqual((await cinder.rehook(B)).done,[],'re-runnable: nothing left to do');
  assert.ok(called.some(([e,d])=>e==='ashenGateCinder.changed'&&d.kind==='rehook'&&d.actorId==='B'));
  // A character that bears nothing (e.g. one restored from a copy made while it bore a Cinder) loses the stale link.
  C.flags[MOD]??={};C.flags[MOD].cinders=[{instanceId:id,definitionId:DEF,name:'[TEST] stale',sockets:{attached:[]},art:null}];
  assert.deepEqual((await cinder.rehook(C)).instances,[]);assert.deepEqual(C.flags[MOD].cinders,[]);
  assert.equal(cinder.instances().find(i=>i.instanceId===id).bearer.actorId,'B','still borne by B');
});
// 0.6.0: the Cinder sheet. The orb's art (GM only, API-enforced), the new list fields, and the sheet's socket wiring through api.sockets.
test('art (0.6.0): only the GM sets it (rejected in the API), saved on the record, copied to the bearer, hook; null goes back to the default orb',async()=>{
  const id=ember.instanceId,path='ashen-gate/cinders/[TEST]-ember.webp';
  for(const u of [alice,bob]){game.user=u;await assert.rejects(cinder.setArt(id,path),/GM only/);}
  game.user=gm;assert.equal(cinder.instances().find(i=>i.instanceId===id).art,null,'records saved before 0.6.0 read as no art');
  called.length=0;
  assert.deepEqual(await cinder.setArt(id,path),{changed:true,art:path});
  assert.equal(cinder.instances().find(i=>i.instanceId===id).art,path,'on the GM record');
  assert.equal(B.flags[MOD].cinders.find(p=>p.instanceId===id).art,path,'copied to the bearer\'s pointer');
  assert.deepEqual(called.find(([e])=>e==='ashenGateCinder.changed')[1],{kind:'art',instanceId:id,definitionId:DEF,actorId:'B',art:path});
  assert.deepEqual(await cinder.setArt(id,path),{changed:false,art:path},'same path: nothing written');
  game.user=bob;assert.equal(cinder.list(B)[0].art,path,'the owner reads it from the pointer');
  game.user=gm;
  for(const bad of ['javascript:alert(1)','data:image/png;base64,AAAA','a"b.webp','<x>.png',42])await assert.rejects(cinder.setArt(id,bad),/Choose an image file/);
  assert.equal((await cinder.setArt(id,'https://assets.forge-vtt.com/x/ashen-gate/cinders/e.png')).changed,true);
  // Check and Repair keep the bearer's copy in step.
  B.flags[MOD].cinders=B.flags[MOD].cinders.map(p=>p.instanceId===id?{...p,art:null}:p);
  assert.match(cinder.report().map(r=>r.text).join('\n'),/copy of this Cinder's art differs/);
  assert.ok((await cinder.repair()).some(x=>/art copy updated/.test(x)));assert.deepEqual(cinder.report(),[]);
  assert.deepEqual(await cinder.setArt(id,null),{changed:true,art:null});
  assert.equal(B.flags[MOD].cinders.find(p=>p.instanceId===id).art,null);assert.equal(cinder.list(B)[0].art,null);
  await assert.rejects(cinder.setArt('cinst_NOPE0000',null),/Unknown Cinder/);
});
test('list (0.6.0): art, unspent points and the tree id for the owner; bearerSince only for the GM',async()=>{
  game.user=gm;const id=ember.instanceId,w=st.api.accounts.account(B,tree.id);
  let [c]=cinder.list(B);
  assert.equal(c.treeId,tree.id);assert.equal(c.unspent,w.awarded-w.unlocks.length,'awarded minus the cost of the unlocked nodes');
  assert.equal(c.bearerSince,cinder.instances().find(i=>i.instanceId===id).bearer.since);assert.ok(c.bearerSince>0);
  game.user=bob;[c]=cinder.list(B);
  assert.equal(c.treeId,tree.id);assert.equal(c.unspent,w.awarded-w.unlocks.length);assert.equal(c.art,null);
  assert.equal('bearerSince' in c,false,'never sent to players');
  // Skill Trees without a points read: the sheet says "not available", nothing breaks.
  const ps=st.api.pointsSummary;delete st.api.pointsSummary;try{[c]=cinder.list(B);assert.deepEqual([c.treeId,c.unspent],[tree.id,null]);}finally{st.api.pointsSummary=ps;}
  game.user=gm;
});
test('sheet (0.6.0): orbit from api.sockets (+1 extra, inactive off the orbit, locked read-only), drag and drop, socket menu, Push confirm',async()=>{
  const {sheetView}=await import('../scripts/main.mjs');
  game.user=gm;const sock=api.sockets,id=ember.instanceId,strainBefore=strain.get(B).value;
  for(const s of sock.slots(B,id).slots)await sock.detach(B,id,s.slot);
  const mods={modifiers:{schema:'ag-modifiers/0.1',scope:'cinder',list:[{target:'backfire.chance',value:-1,label:'[TEST] Calm'}]}};
  const gear=n=>{const it={id:`G${n}`,uuid:`Actor.B.Item.G${n}`,parent:B,name:`[TEST] Gem ${n}`,type:'loot',flags:source(`ITEM-TEST-GEM${n}`,'Item',mods),
    async setFlag(m,k,v){this.flags[m]??={};this.flags[m][k]=structuredClone(v);}};B.items.push(it);return it;};
  const g1=gear(1),g2=gear(2),g3=gear(3),g4=gear(4);
  await sock.setCount(id,2);await sock.attach(B,id,g1.id);
  const view=()=>{const [c]=cinder.list(B);return sheetView(B,c,sock.slots(B,id),{fits:sock.socketable(B),perks:api.modifiers.forActor(B),strainState:strain.get(B),gm:game.user.isGM,uuidOf:i=>B.items.get(i)?.uuid});};
  let v=view();
  assert.deepEqual(v.sockets.map(s=>[s.empty,s.extra,s.name??null]),[[false,false,'[TEST] Gem 1'],[true,false,null]],'2 sockets: one filled, one free');
  assert.equal(v.sockets[1].slot,1,'a free socket carries the slot an attach uses');
  assert.ok(v.spare.some(f=>f.itemId==='G2'&&f.uuid==='Actor.B.Item.G2'),'items that fit can be dragged (Foundry Item drag data)');
  assert.ok(v.gm&&v.gm.bearer===B.name,'GM binding card');
  // Owner drags an item from the bearer's inventory onto the free socket: attach through api.sockets, re-checked on the GM client.
  globalThis.foundry.utils.fromUuid=async uuid=>B.items.find(i=>i.uuid===uuid)??null;
  const app=api.open({actorId:'B'});app.actorId='B';
  const drop=item=>({dataTransfer:{getData:()=>JSON.stringify({type:'Item',uuid:item.uuid})}});
  const relay=async()=>{const msg=emitted.at(-1);game.user=gm;for(const fn of socketHandlers)await fn(msg,'u2');const reply=emitted.at(-1);game.user=bob;for(const fn of socketHandlers)await fn(reply,'gm');return reply;};
  game.user=bob;emitted.length=0;let pending=app._drop(drop(g2),id,'1',false);await settle();
  assert.deepEqual([emitted.at(-1).type,emitted.at(-1).op.kind,emitted.at(-1).op.slot,emitted.at(-1).op.itemId],['cinder-socket','attach',1,'G2']);
  assert.equal((await relay()).ok,true);await pending;
  game.user=gm;assert.deepEqual(sock.slots(B,id).slots.map(x=>[x.slot,x.itemId]),[[0,'G1'],[1,'G2']]);
  // Dropped on a filled socket: swap.
  game.user=bob;emitted.length=0;pending=app._drop(drop(g3),id,'0',true);await settle();
  assert.deepEqual([emitted.at(-1).op.kind,emitted.at(-1).op.slot,emitted.at(-1).op.itemId],['swap',0,'G3']);await relay();await pending;
  game.user=gm;assert.deepEqual(sock.slots(B,id).slots.map(x=>[x.slot,x.itemId]),[[0,'G3'],[1,'G2']]);
  // A player cannot drop an item that is not on the bearer (world Items are the GM's attachDropped).
  game.user=bob;emitted.length=0;const world=worldItem('W6','ITEM-TEST-WORLD','[TEST] World Gem','Item',mods);
  globalThis.foundry.utils.fromUuid=async()=>world;await app._drop(drop(world),id,'1',true);assert.equal(emitted.length,0,'nothing sent');
  globalThis.foundry.utils.fromUuid=async uuid=>B.items.find(i=>i.uuid===uuid)??null;
  // A perk adds a socket: the extra position is tagged +1; with fewer sockets the extra item is inactive and off the orbit.
  game.user=gm;await sock.setCount(id,3);await sock.attach(B,id,g4.id);await sock.setCount(id,2);
  v=view();assert.deepEqual([v.sockets.length,v.inactive.map(x=>x.itemId)],[2,['G4']]);
  const perk={id:'PK1',name:'[TEST] Wide Setting',type:'feat',flags:source('PERK-TEST-WIDE','ProfessionPerk',{modifiers:{schema:'ag-modifiers/0.1',scope:'cinder',list:[{target:'sockets.count',value:1,label:'[TEST] Wide'}]}})};
  B.items.push(perk);v=view();
  assert.deepEqual(v.sockets.map(s=>[s.itemId,s.extra]),[['G3',false],['G2',false],['G4',true]],'third socket comes from the perk: +1');
  assert.ok(v.rows.some(r=>r.kind==='Perk'&&r.name==='[TEST] Wide Setting'&&/sockets \+1/.test(r.text)),'perks and their modifiers are listed');
  B.items.splice(B.items.indexOf(perk),1);
  // Locked: the owner sees the sockets read-only; the GM can still edit.
  await sock.setLocked(id,true);game.user=bob;v=view();
  assert.equal(v.canEdit,false);assert.ok(v.sockets.every(s=>!s.canEdit));assert.equal(v.gm,null,'no GM card for players');
  game.user=gm;v=view();assert.equal(v.canEdit,true);await sock.setLocked(id,false);
  // Socket menu on a filled socket: Swap or Detach (Detach asks again, red).
  const dialogs=foundry.applications.api,before=dialogs.DialogV2,picks=['detach','confirm'],seen=[];
  dialogs.DialogV2={wait:async o=>{seen.push(o);const want=picks.shift(),b=o.buttons.find(x=>x.action===want);if(!b)throw Error(`no button ${want} in ${o.buttons.map(x=>x.action)}`);return b.callback();}};
  try{
    await app._socketMenu(id,1,false);
    assert.deepEqual(seen[0].buttons.map(b=>b.label),['Cancel','Swap item…','Detach item']);assert.ok(seen[1].classes.includes('ag-dialog--danger'));
    assert.ok(!sock.slots(B,id).slots.some(x=>x.slot===1),'detached');
    // Push confirm: Cancel left, Push right; red when the Backfire is guaranteed.
    await gmSet(B,10);seen.length=0;picks.push('cancel');
    await app._push(id,'POWER-TEST-SPARK','amplify');
    assert.deepEqual(seen[0].buttons.map(b=>b.label),['Cancel','Push']);assert.ok(seen[0].classes.includes('ag-dialog--danger'));
    await gmSet(B,0);seen.length=0;picks.push('cancel');await app._push(id,'POWER-TEST-SPARK','amplify');assert.ok(!seen[0].classes.includes('ag-dialog--danger'));
  }finally{dialogs.DialogV2=before;await gmSet(B,strainBefore);}
  await sock.setCount(id,null);for(const s of sock.slots(B,id).slots)await sock.detach(B,id,s.slot);
  for(const g of [g1,g2,g3,g4])B.items.splice(B.items.indexOf(g),1);
});
// 0.5.0: the window's Unbind asks first ("Unbind Cinder", red); Cancel leaves the Cinder bound. Manage toolbar counts Cinders.
test('Manage: Unbind is a danger confirm and Cancel changes nothing; toolbar count and New Cinder stay enabled with definitions',async()=>{
  game.user=gm;
  const dialogs=foundry.applications.api,before=dialogs.DialogV2;
  const app=api.open();app.tab='manage';
  const ctx=await app._prepareContext({});
  assert.equal(ctx.manage.count,cinder.instances().length);assert.ok(ctx.manage.definitions>0,'New Cinder is enabled: a MUT-* definition exists');
  let seen;dialogs.DialogV2={wait:async o=>{seen=o;return o.buttons.find(b=>b.action==='cancel').callback();}};
  await app._act({dataset:{act:'cinder-unbind',instance:ember.instanceId}});
  assert.deepEqual(seen.buttons.map(b=>b.label),['Cancel','Unbind Cinder']);assert.ok(seen.classes.includes('ag-dialog--danger'));
  assert.equal(cinder.instances().find(i=>i.instanceId===ember.instanceId).status,'bound','Cancel leaves the Cinder bound');
  dialogs.DialogV2=before;app.tab='cinders';
});
// 0.9.0: default art on the MUT-* definition (cinder.art), copied to new Cinders, and the fallback when a Cinder has no art of its own.
test('definition art (0.9.0): checked like the GM\'s art; new Cinders copy it; no own art falls back to it, also for players; Reset keeps working',async()=>{
  const ok=validateDefinition({id:'MUT-TEST-EMBER',entity_type:'Mutation',cinder:{schema:'ag-cinder/0.1',art:'ashen-gate/cinders/test-ember.webp'}});
  assert.deepEqual(ok.errors,[]);
  for(const bad of ['javascript:alert(1)','a"b.png',42,''])
    assert.match(validateDefinition({id:'MUT-TEST-EMBER',entity_type:'Mutation',cinder:{schema:'ag-cinder/0.1',art:bad}}).errors.join(),/cinder\.art must be an image path/,String(bad));
  game.user=gm;
  const def=items[0].flags['ashen-gate-manager'].source,KIND='ashen-gate/cinders/test-ember.webp';
  def.definition.cinder.art=KIND;
  try{
    assert.equal((await cinder.create(DEF)).art,KIND,'a new Cinder starts with its definition\'s art');
    assert.equal((await cinder.create(DEF,{art:'ashen-gate/cinders/test-other.png'})).art,'ashen-gate/cinders/test-other.png','unless the GM chooses another');
    await assert.rejects(cinder.create(DEF,{art:'javascript:x'}),/Choose an image file/);
    const id=ember.instanceId;
    assert.match(cinder.report().map(r=>r.text).join('\n'),/copy of this Cinder's art differs/,'a bearer copy without the definition art is reported');
    await cinder.repair();
    await cinder.setArt(id,'ashen-gate/cinders/test-own.png');
    let [c]=cinder.list(B);assert.deepEqual([c.art,c.ownArt,c.artSource],['ashen-gate/cinders/test-own.png','ashen-gate/cinders/test-own.png','cinder']);
    await cinder.setArt(id,null);
    [c]=cinder.list(B);assert.deepEqual([c.art,c.ownArt,c.defaultArt,c.artSource],[KIND,null,KIND,'definition'],'Reset: the definition\'s art, not the plain orb');
    assert.equal(B.flags[MOD].cinders.find(p=>p.instanceId===id).defaultArt,KIND,'copied to the bearer\'s pointer');
    def.visibility='gm';game.user=bob;
    try{[c]=cinder.list(B);assert.equal(c.art,KIND,'a player who cannot see the MUT-* record still gets the art from the pointer');}finally{def.visibility='player';game.user=gm;}
    const {sheetView}=await import('../scripts/main.mjs');
    const view=sheetView(B,c,null,{strainState:strain.get(B),gm:true});
    assert.deepEqual([view.image,view.art.src,view.gm.hasArt,view.tone],[true,KIND,false,view.tone],'drawn as art; no own art, so no Reset button');
    assert.deepEqual(cinder.report(),[]);
  }finally{delete def.definition.cinder.art;}
  assert.match(cinder.report().map(r=>r.text).join('\n'),/art differs/,'definition art removed: the bearer copy is stale');
  await cinder.repair();assert.equal('defaultArt' in B.flags[MOD].cinders.find(p=>p.instanceId===ember.instanceId),false);
  const [c]=cinder.list(B);assert.deepEqual([c.art,c.artSource],[null,null],'no art anywhere: the default orb');
});
// 0.12.0: art stages. Definition stages (cinder.artStages) or this Cinder's own, picked by the bearer's unlocked-node count; the GM can hold or set a stage.
test('art stages (0.12.0): the definition check names each problem; the current stage follows the unlocks; Hold / Set / Auto are GM-only in the API; players only get the current image',async()=>{
  const img=n=>`ashen-gate/cinders/[TEST]-stage-${n}.webp`;
  const good=[0,1,2,100].map((at,i)=>({art:img(i+1),at}));
  const check=artStages=>validateDefinition({id:'MUT-TEST-EMBER',entity_type:'Mutation',cinder:{schema:'ag-cinder/0.1',artStages}}).errors.join('\n');
  assert.equal(check(good),'');
  assert.match(check('x'),/cinder\.artStages must be a list of 2 to 5 stages/);
  assert.match(check([good[0]]),/needs 2 to 5 stages \(found 1\)/);
  assert.match(check([...good,...good]),/needs 2 to 5 stages \(found 8\)/);
  assert.match(check([{art:img(1),at:1},good[1]]),/artStages\[0\]\.at: stage 1 applies from the bind/);
  assert.match(check([good[0],{art:'javascript:x',at:3}]),/artStages\[1\]\.art: stage 2 needs an image path/);
  assert.match(check([good[0],{art:img(2),at:-1}]),/artStages\[1\]\.at: stage 2 "unlocks needed" must be a whole number/);
  assert.match(check([good[0],{art:img(2),at:2},{art:img(3),at:2}]),/artStages\[2\]\.at: stage 3 needs more unlocks than stage 2 \(2\)/);
  assert.match(check([good[0],{art:img(2),at:1,extra:1}]),/stage 2 only takes art and at/);
  game.user=gm;
  const id=ember.instanceId,inst=()=>cinder.instances().find(i=>i.instanceId===id),ptr=()=>B.flags[MOD].cinders.find(p=>p.instanceId===id);
  const def=items[0].flags['ashen-gate-manager'].source;
  const unlocked=()=>inst().progression.unlocks.length;
  assert.ok(unlocked()>=3,'the earlier tests left the bearer with three nodes');
  assert.equal(cinder.stages(id).state,null,'no stages anywhere: the orb is the plain art, as before');
  // Definition stages: stage 4 needs 100 nodes, so with three unlocked the Cinder is at stage 3 (at 2).
  def.definition.cinder.artStages=good;
  const full=wallet(B).unlocks.slice();
  try{
    await cinder.repair();
    assert.deepEqual([ptr().stageArt,ptr().stage,'stageHeld' in ptr()],[img(3),3,false],'copied to the bearer\'s pointer: the current image only');
    assert.equal(JSON.stringify(ptr()).includes(img(4)),false,'the other stages and their numbers never reach the player copy');
    game.user=bob;let [c]=cinder.list(B);assert.deepEqual([c.art,c.artSource,c.stage],[img(3),'stage',{number:3,held:false}]);game.user=gm;
    // Live: the bearer's unlock count drops to one node (stage 2), then returns (stage 3). The pointer follows through Skill Trees' hook.
    await st.api.accounts.setAccount(B,tree.id,{...wallet(B),unlocks:full.slice(0,1)});await settle();
    assert.deepEqual([ptr().stageArt,ptr().stage],[img(2),2],'one node: stage 2');
    await st.api.accounts.setAccount(B,tree.id,{...wallet(B),unlocks:[]});await settle();
    assert.deepEqual([ptr().stageArt,ptr().stage],[img(1),1],'no node: stage 1, from the bind');
    await st.api.accounts.setAccount(B,tree.id,{...wallet(B),unlocks:full});await settle();
    assert.equal(ptr().stage,3);
    // Hold / Set / Auto: the GM only, validated in the data layer.
    for(const u of [alice,bob]){game.user=u;await assert.rejects(cinder.setStageHold(id,1),/GM only/);await assert.rejects(cinder.setArtStages(id,good),/GM only/);await assert.rejects(()=>Promise.resolve().then(()=>cinder.stages(id)),/GM only/);}
    game.user=gm;called.length=0;
    assert.deepEqual(await cinder.setStageHold(id,3),{changed:true,hold:3},'Hold: the current stage');
    assert.deepEqual(called.find(([e])=>e==='ashenGateCinder.changed')[1],{kind:'stage',instanceId:id,definitionId:DEF,actorId:'B',hold:3});
    assert.deepEqual(await cinder.setStageHold(id,3),{changed:false,hold:3});
    await st.api.accounts.setAccount(B,tree.id,{...wallet(B),unlocks:full.slice(0,1)});await settle();
    assert.deepEqual([ptr().stageArt,ptr().stage,ptr().stageHeld],[img(3),3,true],'held: unlocks no longer move it');
    assert.equal(cinder.stages(id).state.auto,1);
    assert.deepEqual(await cinder.setStageHold(id,1),{changed:true,hold:1},'Set: another stage');assert.equal(ptr().stageArt,img(1));
    for(const bad of [0,6,2.5,'2',-1])await assert.rejects(cinder.setStageHold(id,bad),/Choose a stage from 1 to 5/);
    await assert.rejects(cinder.setStageHold(id,5),/This Cinder has 4 stages/);
    await assert.rejects(cinder.setStageHold('cinst_NOPE0000',1),/Unknown Cinder/);
    game.user=bob;[c]=cinder.list(B);assert.equal(c.art,img(1),'the owner sees the held stage on the orb');game.user=gm;
    assert.deepEqual(await cinder.setStageHold(id,null),{changed:true,hold:null},'Auto again');
    assert.deepEqual([ptr().stage,'stageHeld' in ptr()],[2,false]);
    // The GM's own picture still pins the orb (Change art…); Reset gives the stages back.
    await cinder.setArt(id,'ashen-gate/cinders/[TEST]-pinned.webp');game.user=bob;[c]=cinder.list(B);assert.deepEqual([c.art,c.artSource],['ashen-gate/cinders/[TEST]-pinned.webp','cinder']);game.user=gm;
    await cinder.setArt(id,null);
    // Per-Cinder stages override the definition's; invalid ones are refused with the specific message and nothing is written.
    const own=[{art:img(7),at:0},{art:img(8),at:1}];
    await assert.rejects(cinder.setArtStages(id,[{art:img(7),at:0}]),/needs 2 to 5 stages \(found 1\)/);
    await assert.rejects(cinder.setArtStages(id,[{art:img(7),at:0},{art:'a"b',at:1}]),/stage 2 needs an image path/);
    assert.equal(inst().artStages,null);
    await cinder.setStageHold(id,4);
    assert.deepEqual(await cinder.setArtStages(id,own),{changed:true,stages:own});
    assert.equal(inst().stageHold,null,'a hold past the new last stage is dropped');
    assert.deepEqual([ptr().stageArt,ptr().stage],[img(8),2],'own stages: one node unlocked reaches stage 2');
    assert.deepEqual(await cinder.setArtStages(id,own),{changed:false,stages:own});
    assert.deepEqual(cinder.stages(id).own,own);
    assert.equal(cinder.stages(id).definition.length,4);
    assert.deepEqual(await cinder.setArtStages(id,null),{changed:true,stages:null},'back to the definition\'s');
    assert.deepEqual(cinder.report(),[]);
    // Check notices a stale copy, Repair fixes it.
    B.flags[MOD].cinders=B.flags[MOD].cinders.map(p=>p.instanceId===id?{...p,stageArt:img(1),stage:1}:p);
    assert.match(cinder.report().map(r=>r.text).join('\n'),/copy of this Cinder's art differs/);
    assert.ok((await cinder.repair()).some(x=>/art copy updated/.test(x)));assert.deepEqual(cinder.report(),[]);
    // Sheet: the GM's Binding card row.
    const {sheetView}=await import('../scripts/main.mjs');
    const view=sheetView(B,cinder.list(B)[0],null,{strainState:strain.get(B),gm:true,stages:cinder.stages(id)});
    assert.match(view.gm.stage.text,/Stage 2 of 4, automatic/);assert.deepEqual(view.gm.stage.options.map(o=>o.value),[1,2,3,4]);
    assert.equal(sheetView(B,cinder.list(B)[0],null,{strainState:strain.get(B),gm:false,stages:cinder.stages(id)}).gm,null,'players get no stage controls or numbers');
  }finally{
    await st.api.accounts.setAccount(B,tree.id,{...wallet(B),unlocks:full});await settle();
    delete def.definition.cinder.artStages;game.user=gm;
  }
  await cinder.repair();assert.equal('stageArt' in ptr(),false,'definition stages removed: the copy is cleaned up');
});
test('unbind keeps the Cinder\'s progress; a deleted bearer leaves it lost',async()=>{
  game.user=gm;await cinder.unbind(ember.instanceId);await settle();
  let inst=cinder.instances().find(i=>i.instanceId===ember.instanceId);
  assert.equal(inst.status,'unbound');assert.deepEqual(inst.progression.unlocks,['NODE1','NODE2','NODE3']);assert.deepEqual(powersOn(B),[]);
  assert.deepEqual(inst.sockets.attached,[],'socket items are detached');assert.ok(B.items.every(i=>!i.flags?.[MOD]?.attachedTo),'and unmarked');assert.ok(B.items.get('L2'),'they stay with the old bearer');
  await cinder.bind(ember.instanceId,A);await settle();
  assert.equal(cinder.instances().find(i=>i.instanceId===ember.instanceId).progression.awarded,4,'no second starting point');
  game.actors.contents=game.actors.contents.filter(x=>x!==A);await fire('deleteActor',A);
  inst=cinder.instances().find(i=>i.instanceId===ember.instanceId);assert.equal(inst.status,'lost');assert.equal(inst.lastBearer,'A');
});
test('migration: Cinder tree progress without a Cinder becomes a bound Cinder once; no starting point',async()=>{
  game.user=gm;
  const dry=await cinder.migrate({dryRun:true});assert.deepEqual(dry.filter(r=>r.action==='create').map(r=>[r.actorId,r.definitionId]),[['C','MUT-TEST-LEGACY']]);
  await cinder.migrate({dryRun:false});
  const made=cinder.instances().find(i=>i.definitionId==='MUT-TEST-LEGACY');
  assert.deepEqual([made.bearer.actorId,made.progression.awarded,made.migratedFrom.actorId],['C',2,'C']);
  assert.equal((await cinder.migrate({dryRun:true})).filter(r=>r.action==='create').length,0);
});
test('adopt: records, bearer links and the Strain config that Skill Trees 0.15/0.16 saved are taken over once; nothing in Skill Trees changes',async()=>{
  game.user=gm;
  st.api.legacy={registry:{schema:'ag-cinder-instances/1',instances:[{instanceId:'cinst_OLDOLDOLD1',definitionId:DEF,status:'unbound',progression:{awarded:2,unlocks:[]}}]},
    settings:{strainConfig:{schema:'ag-strain-config/0.1',bands:[{from:0,to:null,label:'[TEST] Old Calm'}]},maxCindersPerActor:null,initialCinderPoints:null},
    pointers:[{actorId:'C',pointers:[{instanceId:'cinst_OLDOLDOLD1',definitionId:DEF,name:'[TEST] Ember Cinder'}]}]};
  saved.set('strainConfig',null);
  const done=await api.adoptLegacy();
  assert.deepEqual(done,['Strain config','1 Cinder record','1 bearer link']);
  assert.ok(cinder.instances().some(i=>i.instanceId==='cinst_OLDOLDOLD1'));assert.equal(strain.config().bands[0].label,'[TEST] Old Calm');
  assert.deepEqual(await api.adoptLegacy(),[],'safe to run again');
});
test('next to an older Skill Trees (0.15/0.16 with its own api.strain) Cinders stays off with a clear message',async()=>{
  game.user=gm;const real=treesModule.api;treesModule.api={strain:{},cinder:{}};
  try{
    assert.equal(api.status().status,'old');
    assert.throws(()=>strain.get(B),/Update Ashen Gate \| Skill Trees to 0\.17\.0/);
    await assert.rejects(strain.add(B,1,{source:{module:'x',kind:'y'},reason:'z'}),/Update Ashen Gate \| Skill Trees/);
    await assert.rejects(cinder.create(DEF),/Update Ashen Gate \| Skill Trees/);
    await fire('createChatMessage',{id:'rest9',type:'rest',system:{type:'long'},speaker:{actor:'B'},author:bob});
  }finally{treesModule.api=real;}
  assert.equal(strain.get(B).value,3,'the rest above did nothing while Cinders was off');
});
test('without Skill Trees: Strain still works, Cinder operations say what is missing',async()=>{
  game.user=gm;treesModule.active=false;
  try{
    assert.equal(api.status().status,'missing');
    await strain.add(B,1,{source:{module:'ashen-gate-test',kind:'hazard'},reason:'[TEST] hazard'});assert.equal(strain.get(B).value,4);
    await assert.rejects(cinder.push(B,'POWER-TEST-SPARK','amplify'),/Skill Trees is not active/);
    assert.match(cinder.report()[0].text,/Skill Trees is not active/);
  }finally{treesModule.active=true;}
});
