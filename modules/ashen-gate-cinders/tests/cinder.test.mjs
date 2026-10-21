import test from 'node:test';import assert from 'node:assert/strict';
// Cinder instances, Push and Backfire (moved from Skill Trees 0.16.0). Pure rules (cinder.mjs) and the runtime with mocked Foundry globals
// and a stand-in Skill Trees (tests/fake-skill-trees.mjs): proves logic, ownership and permission checks, not the live Foundry UI.
import {validateDefinition,collectModifiers,availableModes,planPush,resolveBackfire,normalizeRegistry,createInstance,bindInstance,transferInstance,
  unbindInstance,planMigration,effectProblem,categoriesFor} from '../scripts/cinder.mjs';
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
const tree={id:'TEST-EMBER-TREE',name:'[TEST] Ember',sourceRef:DEF,provider:{kind:'cinder_milestone',maxPoints:13},
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
      const docs=data.map(d=>{const doc={...structuredClone(d),id:`EMB${++counter}`,parent:actor,actor,async delete(){actor.items=actor.items.filter(x=>x!==doc);}};return doc;});
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
test('unbind keeps the Cinder\'s progress; a deleted bearer leaves it lost',async()=>{
  game.user=gm;await cinder.unbind(ember.instanceId);await settle();
  let inst=cinder.instances().find(i=>i.instanceId===ember.instanceId);
  assert.equal(inst.status,'unbound');assert.deepEqual(inst.progression.unlocks,['NODE1','NODE2','NODE3']);assert.deepEqual(powersOn(B),[]);
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
