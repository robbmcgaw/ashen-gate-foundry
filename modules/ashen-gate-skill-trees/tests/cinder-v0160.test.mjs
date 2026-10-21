import test from 'node:test';import assert from 'node:assert/strict';
// 0.16.0: Cinder instances, Push and Backfire. Pure rules (cinder.mjs) and the runtime with mocked Foundry globals:
// proves logic, ownership and permission checks, not the live Foundry UI.
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

// ---- Runtime with mocked Foundry ----
class FakeApplication {static DEFAULT_OPTIONS={};render(){return this;}async _prepareContext(){return {};}}
const oneTime=new Map(),hooks=new Map(),called=[],saved=new Map(),socketHandlers=[],emitted=[],messages=[],rolls=[];
globalThis.Hooks={once:(e,fn)=>oneTime.set(e,fn),on:(e,fn)=>hooks.set(e,[...(hooks.get(e)??[]),fn]),callAll:(e,d)=>called.push([e,d])};
let counter=0;
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{confirm:async()=>true}}},utils:{escapeHTML:x=>String(x),randomID:()=>`R${String(++counter).padStart(15,'0')}`}};
globalThis.Roll=class{constructor(f){this.formula=f;}async evaluate(){const t=rolls.shift();if(t==null)throw Error(`unexpected roll ${this.formula}`);this.total=t;return this;}};
globalThis.ChatMessage={create:async d=>{messages.push(d);return d;},getSpeaker:({actor})=>({actor:actor.id})};
globalThis.CONFIG={statusEffects:[{id:'poisoned',name:'Poisoned',img:'poisoned.svg'}]};
const MOD='ashen-gate-skill-trees',DEF='MUT-TEST-EMBER';
const node=(id,perkId,x,extra={})=>({id,perkId,x,y:100,requiresAll:[],requiresAny:[],excludes:[],status:'approved',visibility:'player',display:'shown',...extra});
const tree={id:'TEST-EMBER-TREE',name:'[TEST] Ember',description:'',status:'approved',visibility:'player',sourceRef:DEF,provider:{kind:'cinder_milestone',maxPoints:13},
  nodes:[node('NODE1','POWER-TEST-SPARK',100),node('NODE2','POWER-TEST-STEADY',300),node('NODE3','POWER-TEST-REACH',500)]};
const journal={documentName:'JournalEntry',flags:{[MOD]:{privateStore:true,payload:{schema:'ag-skill-trees/0.3',trees:[tree]}}},async setFlag(m,k,v){this.flags[m][k]=structuredClone(v);}};
const source=(sourceId,entityType,definition)=>({'ashen-gate-manager':{source:{sourceId,entityType,status:'approved',visibility:'player',definition:{id:sourceId,entity_type:entityType,point_cost:1,...definition}}}});
const worldItem=(id,sourceId,name,entityType,definition)=>({id,uuid:`Item.${id}`,documentName:'Item',type:'feat',name,img:null,ownership:{default:2},system:{description:{value:''}},
  testUserPermission:()=>true,flags:source(sourceId,entityType,definition),
  toObject(){return structuredClone({_id:this.id,name:this.name,type:this.type,img:this.img,system:this.system,flags:this.flags});}});
const bfJournal=(id,sourceId,label,entries)=>({id,uuid:`JournalEntry.${id}`,documentName:'JournalEntry',name:label,ownership:{default:0},testUserPermission:u=>u.isGM,
  flags:{'ashen-gate-manager':{source:{sourceId,entityType:'BackfireTable',status:'approved',visibility:'gm',definition:{id:sourceId,entity_type:'BackfireTable',backfire:{schema:'ag-backfire/0.1',label,entries}}}}}});
const items=[
  worldItem('W0',DEF,'[TEST] Ember Cinder','Mutation',{cinder:{schema:'ag-cinder/0.1',backfire_categories:['BF-TEST-BODY','BF-TEST-MIND']}}),
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
    get isOwner(){return game.user.isGM||game.user.id===ownerId;},testUserPermission:(u,l)=>u.isGM||u.id===ownerId,
    async update(data){const diff={};for(const [k,v] of Object.entries(data)){setPath(this,k,v);setPath(diff,k,v);}for(const fn of hooks.get('updateActor')??[])fn(this,diff);return this;},
    async setFlag(m,k,v){this.flags[m]??={};this.flags[m][k]=structuredClone(v);},
    async createEmbeddedDocuments(type,data){
      if(type==='ActiveEffect'){const docs=data.map(d=>({...structuredClone(d),id:`AE${++counter}`}));actor.effects.push(...docs);return docs;}
      const docs=data.map(d=>{const doc={...structuredClone(d),id:`EMB${++counter}`,parent:actor,actor,async delete(){actor.items=actor.items.filter(x=>x!==doc);}};return doc;});
      actor.items.push(...docs);return docs;}};
  return actor;
}
const A=makeActor('A','u1'),B=makeActor('B','u2'),C=makeActor('C','u2');
C.flags[MOD]={progressV2:{'cinder:MUT-TEST-LEGACY':{awarded:2,unlocks:[],grants:[{key:'old',amount:2}]}}};
globalThis.game={modules:new Map([[MOD,{id:MOD,active:true}]]),i18n:{localize:x=>x},
  settings:{register:()=>{},registerMenu:()=>{},get:(_m,k)=>saved.has(k)?saved.get(k):({playerAccessEnabled:true,maxCindersPerActor:1,initialCinderPoints:1})[k],set:async(_m,k,v)=>{saved.set(k,v);return v;}},
  journal:{contents:[journal,...tables]},items:{contents:items},tables:{contents:[]},macros:{contents:[]},
  actors:{contents:[A,B,C],get(id){return this.contents.find(a=>a.id===id)??null;}},
  user:gm,users:{contents:[gm,alice,bob],get:id=>[gm,alice,bob].find(u=>u.id===id),activeGM:gm},
  socket:{on:(_n,fn)=>socketHandlers.push(fn),emit:(_n,msg)=>emitted.push(msg)}};
globalThis.ui={actors:null,notifications:{info:()=>{},error:()=>{},warn:()=>{}}};
await import('../scripts/main.js');
oneTime.get('init')();oneTime.get('ready')();
const api=game.modules.get(MOD).api,cinder=api.cinder,strain=api.strain;
const wallet=a=>a.flags[MOD]?.progressV2?.[`cinder:${DEF}`];
const powersOn=a=>a.items.map(i=>i.flags[MOD]?.grant?.perkId).filter(Boolean).sort();
const gmSet=async(a,n)=>strain.set(a,n,{source:{module:'ashen-gate-test',kind:'gm'},reason:'[TEST] set'});
const fire=async(e,...args)=>{for(const fn of hooks.get(e)??[])await fn(...args);};
let ember;

test('GM creates a Cinder and binds it: starting point, mirror on the bearer, hook',async()=>{
  game.user=gm;
  ember=await cinder.create(DEF);
  assert.match(ember.instanceId,/^cinst_/);assert.equal(ember.status,'unbound');
  const r=await cinder.bind(ember.instanceId,A);
  assert.equal(r.initialAwarded,1);assert.equal(wallet(A).awarded,1);
  assert.deepEqual(A.flags[MOD].cinders.map(p=>[p.instanceId,p.definitionId,p.name]),[[ember.instanceId,DEF,'[TEST] Ember Cinder']]);
  assert.ok(called.some(([e,d])=>e==='ashenGateCinder.changed'&&d.kind==='bind'&&d.actorId==='A'));
});
test('progress on the bearer goes onto the Cinder; a non-bearer cannot gain points or unlocks on that tree',async()=>{
  game.user=gm;
  await api.grantPoints(A,tree.id,1,'[TEST] milestone 1');await api.grantPoints(A,tree.id,1,'[TEST] milestone 2');
  await api.unlock(A,tree.id,'NODE1');await api.unlock(A,tree.id,'NODE2');
  const inst=cinder.instances().find(i=>i.instanceId===ember.instanceId);
  assert.equal(inst.progression.awarded,3);assert.deepEqual(inst.progression.unlocks,['NODE1','NODE2']);
  assert.deepEqual(powersOn(A),['POWER-TEST-SPARK','POWER-TEST-STEADY']);
  await assert.rejects(api.grantPoints(B,tree.id,1,'[TEST] nope'),/does not bear this Cinder/);
  await assert.rejects(api.unlock(B,tree.id,'NODE1'),/does not bear this Cinder/);
});
test('list and preview: modes, cost with modifiers, chance from post-gain Strain',async()=>{
  game.user=gm;await gmSet(A,3);
  const [c]=cinder.list(A);
  assert.equal(c.name,'[TEST] Ember Cinder');assert.deepEqual(c.powers.map(p=>p.powerId),['POWER-TEST-SPARK'],'enhancements are not pushed');
  assert.deepEqual(c.powers[0].modes.map(m=>[m.id,m.cost,m.after,m.chance]),[['amplify',1,4,15]],'overreach needs Reach');
  game.user=alice;assert.equal(cinder.previewPush(A,ember.instanceId,'POWER-TEST-SPARK','amplify').chance,15,'the owner can preview');
  game.user=bob;assert.throws(()=>cinder.list(A),/Actor access denied/);
  game.user=gm;
});
test('Push: Strain always gained first, Backfire rolled from post-gain Strain, consequence to chat, effect applied',async()=>{
  game.user=gm;messages.length=0;
  rolls.push(10,1,1); // d100 10 ≤ 15 → Backfire; category 1 → Body; effect 1 (+0 Strain) → jolt
  const r=await cinder.push(A,'POWER-TEST-SPARK','amplify');
  assert.equal(r.strain.from,3);assert.equal(r.strain.to,4);assert.equal(r.backfire.backfire,true);
  assert.equal(r.backfire.category.id,'BF-TEST-BODY');assert.equal(r.backfire.entry.id,'jolt');assert.equal(r.effectApplied,true);
  assert.deepEqual(A.effects.map(e=>[e.statuses[0],e.duration.rounds,e.flags[MOD].backfire.opId]),[['poisoned',1,r.opId]]);
  const last=strain.history(A).at(-1);assert.equal(last.source.kind,'push');assert.equal(last.source.ref,'POWER-TEST-SPARK');assert.equal(last.opId,r.opId);
  assert.equal(messages.length,1);assert.match(messages[0].content,/Backfire!/);assert.match(messages[0].content,/A jolt/);assert.match(messages[0].content,/Strain 3 → <strong>4<\/strong>/);
  rolls.push(99);const quiet=await cinder.push(A,'POWER-TEST-SPARK','amplify');
  assert.equal(quiet.backfire.backfire,false);assert.equal(strain.get(A).value,5);assert.match(messages.at(-1).content,/No Backfire/);
});
test('a failed Strain write means the Push did not happen: no effect, no chat card',async()=>{
  game.user=gm;const before=messages.length,effects=A.effects.length;
  const original=A.update;A.update=async()=>{throw Error('[TEST] write failed');};
  rolls.push(1,1,1);
  try{await assert.rejects(cinder.push(A,'POWER-TEST-SPARK','amplify'),/write failed/);}finally{A.update=original;rolls.length=0;}
  assert.equal(messages.length,before);assert.equal(A.effects.length,effects);assert.equal(strain.get(A).value,5);
});
test('Strain 10: guaranteed Backfire, Strain pushes the effect roll worse, and it never kills or removes the character',async()=>{
  game.user=gm;await gmSet(A,9);
  rolls.push(2,1); // automatic (no d100); category 2 → Mind (2 entries); effect 1 + 3 (Strain 10) → kept at 2
  const r=await cinder.push(A,'POWER-TEST-SPARK','amplify');
  assert.equal(r.plan.chance,100);assert.equal(r.backfire.check,null);
  assert.deepEqual([r.backfire.effectRoll.die,r.backfire.effectRoll.strainBonus,r.backfire.effectRoll.result],[1,3,2]);
  assert.equal(r.backfire.entry.id,'omen');assert.match(messages.at(-1).content,/GM adjudicates/);
  assert.equal(A.system.attributes.hp.value,20);assert.ok(game.actors.get('A'),'still in the world');
  assert.ok(A.effects.every(e=>!['dead','unconscious','exhaustion'].includes(e.statuses[0])));
  assert.equal(cinder.instances().find(i=>i.instanceId===ember.instanceId).bearer.actorId,'A','still bears the Cinder');
});
test('normal use: no Strain; at 10 or more it backfires automatically, below 10 nothing happens',async()=>{
  game.user=gm;const spark=A.items.find(i=>i.flags[MOD].grant.perkId==='POWER-TEST-SPARK');
  const before=messages.length,value=strain.get(A).value;assert.ok(value>=10);
  rolls.push(1,1);await fire('dnd5e.postUseActivity',{item:spark});
  assert.equal(messages.length,before+1);assert.match(messages.at(-1).content,/every use of a Cinder power backfires/);assert.equal(strain.get(A).value,value,'no Strain added');
  await gmSet(A,9);await fire('dnd5e.postUseActivity',{item:spark});assert.equal(messages.length,before+1,'below 10: nothing');
});
test('a player Push is relayed to the GM client, which re-checks ownership',async()=>{
  game.user=gm;await gmSet(A,0);
  game.user=alice;emitted.length=0;
  const pending=cinder.push(A,'POWER-TEST-SPARK','amplify');
  const msg=emitted.at(-1);assert.equal(msg.type,'cinder-push');
  game.user=gm;rolls.push(99);for(const h of socketHandlers)await h(msg,'u1');
  const reply=emitted.at(-1);assert.equal(reply.type,'cinder-result');assert.equal(reply.ok,true,reply.message);
  game.user=alice;for(const h of socketHandlers)await h(reply,'gm');
  assert.equal((await pending).backfire,false);
  game.user=gm;for(const h of socketHandlers)await h({...msg,requestId:'x2'},'u2');
  assert.equal(emitted.at(-1).ok,false);assert.match(emitted.at(-1).message,/do not own/);
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
  await cinder.transfer(ember.instanceId,B);
  const inst=cinder.instances().find(i=>i.instanceId===ember.instanceId);
  assert.equal(inst.bearer.actorId,'B');assert.equal(inst.progression.awarded,3);assert.deepEqual(inst.progression.unlocks,['NODE1','NODE2']);
  assert.deepEqual(powersOn(B),['POWER-TEST-SPARK','POWER-TEST-STEADY']);assert.deepEqual(powersOn(A),[]);
  assert.deepEqual(wallet(B).unlocks,['NODE1','NODE2']);assert.deepEqual(wallet(A).unlocks??[],[]);assert.equal(A.flags[MOD].cinders.length,0);
  assert.equal(strain.get(A).value,aStrain);assert.equal(strain.get(B).value,0);assert.equal(A.effects.length,aEffects);
  await cinder.repair();assert.deepEqual(powersOn(B),['POWER-TEST-SPARK','POWER-TEST-STEADY'],'repair does not duplicate');
  assert.deepEqual(cinder.report(),[]);
});
test('duplicate simultaneous ownership is rejected',async()=>{
  game.user=gm;const second=await cinder.create(DEF);
  await assert.rejects(cinder.bind(second.instanceId,B),/already bears a Cinder of this kind/);
  await assert.rejects(cinder.transfer(ember.instanceId,B),/already bears this Cinder/);
  await assert.rejects(cinder.bind(ember.instanceId,C),/already bound/);
});
test('rest recovery adds strain.recovery modifiers from the bearer’s powers',async()=>{
  game.user=gm;await api.grantPoints(B,tree.id,1,'[TEST] milestone 3');await api.unlock(B,tree.id,'NODE3');
  await gmSet(B,5);await fire('createChatMessage',{id:'rest1',type:'rest',system:{type:'long'},speaker:{actor:'B'},author:bob});
  assert.equal(strain.get(B).value,3,'long rest 1 + Deep Rest 1');
  assert.deepEqual(cinder.list(B)[0].powers[0].modes.map(m=>m.id),['amplify','overreach'],'Reach opened a Push mode');
});
test('unbind keeps the Cinder’s progress; a deleted bearer leaves the Cinder lost, not gone',async()=>{
  game.user=gm;await cinder.unbind(ember.instanceId);
  let inst=cinder.instances().find(i=>i.instanceId===ember.instanceId);
  assert.equal(inst.status,'unbound');assert.deepEqual(inst.progression.unlocks,['NODE1','NODE2','NODE3']);assert.deepEqual(powersOn(B),[]);
  await cinder.bind(ember.instanceId,A);
  assert.equal(cinder.instances().find(i=>i.instanceId===ember.instanceId).progression.awarded,4,'no second starting point');
  game.actors.contents=game.actors.contents.filter(x=>x!==A);await fire('deleteActor',A);
  assert.equal(planMigration(normalizeRegistry({instances:cinder.instances()}),[{actorId:'A',accounts:A.flags[MOD].progressV2}]).filter(r=>r.action==='create').length,0,'a lost Cinder\'s old copy is not migrated again');
  inst=cinder.instances().find(i=>i.instanceId===ember.instanceId);
  assert.equal(inst.status,'lost');assert.equal(inst.lastBearer,'A');assert.equal(inst.progression.unlocks.length,3);
});
test('migration: older per-character progress becomes a bound Cinder once; no starting point; tree reimport changes no Cinder',async()=>{
  game.user=gm;
  const dry=await cinder.migrate({dryRun:true});assert.deepEqual(dry.filter(r=>r.action==='create').map(r=>[r.actorId,r.definitionId]),[['C','MUT-TEST-LEGACY']]);
  await cinder.migrate({dryRun:false});
  const made=cinder.instances().find(i=>i.definitionId==='MUT-TEST-LEGACY');
  assert.equal(made.bearer.actorId,'C');assert.equal(made.progression.awarded,2);assert.equal(made.migratedFrom.actorId,'C');
  assert.equal((await cinder.migrate({dryRun:true})).filter(r=>r.action==='create').length,0,'safe to run again');
  const snapshot=JSON.stringify(cinder.instances());
  const r=await api.importTrees({schema:'ag-skill-trees/0.3',trees:[tree]},{mode:'update'});
  assert.equal(r.failed.length,0);assert.equal(JSON.stringify(cinder.instances()),snapshot,'reimport leaves Cinders alone');
});
