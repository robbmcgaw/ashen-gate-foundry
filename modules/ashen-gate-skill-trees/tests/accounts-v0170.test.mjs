import test from 'node:test';import assert from 'node:assert/strict';
// 0.17.0: api.accounts (ag-tree-accounts/1) and the progress hooks, for partner modules such as Ashen Gate | Cinders.
// Mocked Foundry: proves the contract and its permission checks, not the live UI.
class FakeApplication {static DEFAULT_OPTIONS={};render(){return this;}async _prepareContext(){return {};}}
const oneTime=new Map(),hooks=new Map(),called=[],saved=new Map();
globalThis.Hooks={once:(e,fn)=>oneTime.set(e,fn),on:(e,fn)=>hooks.set(e,[...(hooks.get(e)??[]),fn]),
  callAll:(e,d)=>{called.push([e,structuredClone(d)]);for(const fn of hooks.get(e)??[])fn(d);}};
let n=0;
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{confirm:async()=>true}}},utils:{escapeHTML:x=>String(x),randomID:()=>`r${++n}`}};
const MOD='ashen-gate-skill-trees';
const node=(id,perkId)=>({id,perkId,x:100,y:100,requiresAll:[],requiresAny:[],excludes:[],status:'approved',visibility:'player',display:'shown'});
const tree={id:'TEST-EMBER-TREE',name:'[TEST] Ember',description:'',status:'approved',visibility:'player',sourceRef:'MUT-TEST-EMBER',provider:{kind:'cinder_milestone',maxPoints:16},
  nodes:[node('EMBER-SPARK','POWER-TEST-SPARK'),node('EMBER-STEADY','POWER-TEST-STEADY')]};
const legacy={schema:'ag-cinder-instances/1',instances:[{instanceId:'cinst_LEGACY0001',definitionId:'MUT-TEST-EMBER'}]};
const journal={flags:{[MOD]:{privateStore:true,payload:{schema:'ag-skill-trees/0.3',trees:[tree]},cinders:legacy}},async setFlag(m,k,v){this.flags[m][k]=structuredClone(v);}};
const perk=(id,sourceId,name)=>({id,uuid:`Item.${id}`,documentName:'Item',type:'feat',name,img:null,ownership:{default:2},system:{description:{value:''}},testUserPermission:()=>true,
  flags:{'ashen-gate-manager':{source:{sourceId,entityType:'Power',status:'approved',visibility:'player',definition:{id:sourceId,point_cost:1}}}},
  toObject(){return structuredClone({_id:this.id,name:this.name,type:this.type,img:this.img,system:this.system,flags:this.flags});}});
const gm={id:'gm',isGM:true},owner={id:'u1',isGM:false},other={id:'u2',isGM:false};
function makeActor(id){
  const actor={id,name:`[TEST] ${id}`,type:'character',flags:{},items:[],
    get isOwner(){return game.user.isGM||game.user.id==='u1';},testUserPermission:(u)=>u.isGM||u.id==='u1',
    async setFlag(m,k,v){this.flags[m]??={};this.flags[m][k]=structuredClone(v);},
    async createEmbeddedDocuments(_t,data){const docs=data.map(d=>{const doc={...structuredClone(d),id:`EMB${++n}`,async delete(){actor.items=actor.items.filter(x=>x!==doc);}};return doc;});actor.items.push(...docs);return docs;}};
  return actor;
}
const A=makeActor('A');A.flags[MOD]={cinders:[{instanceId:'cinst_LEGACY0001',definitionId:'MUT-TEST-EMBER'}]};
globalThis.game={modules:new Map([[MOD,{id:MOD,active:true}]]),
  settings:{register:(_m,k,o)=>{if(o?.default!==undefined&&!saved.has(k))saved.set(k,o.default);},registerMenu:()=>{},get:(_m,k)=>saved.has(k)?saved.get(k):(k==='playerAccessEnabled'?true:undefined),set:async(_m,k,v)=>{saved.set(k,v);return v;}},
  journal:{contents:[journal]},items:{contents:[perk('W1','POWER-TEST-SPARK','[TEST] Spark'),perk('W2','POWER-TEST-STEADY','[TEST] Steady')]},tables:{contents:[]},macros:{contents:[]},
  actors:{contents:[A],get(id){return this.contents.find(a=>a.id===id)??null;}},
  user:gm,users:{contents:[gm,owner,other],get:id=>[gm,owner,other].find(u=>u.id===id),activeGM:gm},socket:{on:()=>{},emit:()=>{}}};
globalThis.ui={actors:null,notifications:{info:()=>{},error:()=>{},warn:()=>{}}};
await import('../scripts/main.js');
saved.set('strainConfig',{schema:'ag-strain-config/0.1',bands:[{from:0,to:null,label:'[TEST] Calm'}]});
oneTime.get('init')();oneTime.get('ready')();
const api=game.modules.get(MOD).api,acc=api.accounts;

test('Strain and Cinders are no longer in Skill Trees',()=>{
  assert.equal(api.strain,undefined);assert.equal(api.cinder,undefined);
  assert.equal(acc.contract,'ag-tree-accounts/1');
});
test('treeBySource finds a tree by its source id (GM only)',()=>{
  game.user=gm;
  const t=acc.treeBySource('MUT-TEST-EMBER',{kind:'cinder_milestone'});
  assert.equal(t.id,'TEST-EMBER-TREE');assert.equal(t.nodes[0].name,'[TEST] Spark','resolved from the world perk');
  assert.equal(acc.treeBySource('MUT-TEST-NONE'),null);assert.equal(acc.treeBySource('MUT-TEST-EMBER',{kind:'profession'}),null);
  game.user=owner;assert.throws(()=>acc.treeBySource('MUT-TEST-EMBER'),/GM only/);game.user=gm;
});
test('setAccount writes the account, gives and removes perk Items to match, and fires the progress hook',async()=>{
  game.user=gm;called.length=0;
  let r=await acc.setAccount(A,tree.id,{awarded:3,unlocks:['EMBER-SPARK','EMBER-STEADY'],grants:[{key:'initial',amount:1}]});
  assert.deepEqual(r.given.sort(),['[TEST] Spark','[TEST] Steady']);
  assert.deepEqual(acc.account(A,tree.id).unlocks,['EMBER-SPARK','EMBER-STEADY']);
  const hook=called.find(([e])=>e==='ashenGateSkillTrees.progressChanged')[1];
  assert.deepEqual([hook.actorId,hook.treeId,hook.sourceRef,hook.kind,hook.wallet,hook.account.awarded],['A',tree.id,'MUT-TEST-EMBER','cinder_milestone','cinder:MUT-TEST-EMBER',3]);
  r=await acc.setAccount(A,tree.id,{awarded:3,unlocks:['EMBER-SPARK','EMBER-STEADY']});
  assert.deepEqual(r.given,[],'existing Items are reused, never duplicated');assert.equal(A.items.length,2);
  r=await acc.setAccount(A,tree.id,{awarded:0,unlocks:[]});
  assert.deepEqual(r.removed.sort(),['[TEST] Spark','[TEST] Steady']);assert.equal(A.items.length,0);
  await assert.rejects(acc.setAccount(A,tree.id,{unlocks:['NOT-A-NODE']}),/not on/);
  game.user=owner;await assert.rejects(acc.setAccount(A,tree.id,{}),/GM only/);assert.throws(()=>acc.account(A,tree.id),/GM only/);game.user=gm;
});
test('grants lists the perk Items a tree gave (GM or owner)',async()=>{
  game.user=gm;await acc.setAccount(A,tree.id,{awarded:1,unlocks:['EMBER-SPARK']});
  game.user=owner;assert.deepEqual(acc.grants(A).map(g=>[g.perkId,g.treeId,g.nodeId,g.wallet]),[['POWER-TEST-SPARK',tree.id,'EMBER-SPARK','cinder:MUT-TEST-EMBER']]);
  game.user=other;assert.throws(()=>acc.grants(A),/Actor access denied/);game.user=gm;
});
test('a partner can veto points and unlocks through the check hook; without a veto they work',async()=>{
  game.user=gm;
  const veto=check=>{if(check.sourceRef==='MUT-TEST-EMBER'&&check.actorId==='A')check.blocked='[TEST] not the bearer';};
  hooks.set('ashenGateSkillTrees.checkProgress',[veto]);
  await assert.rejects(api.grantPoints(A,tree.id,1,'[TEST] m1'),/not the bearer/);
  await assert.rejects(api.unlock(A,tree.id,'EMBER-STEADY'),/not the bearer/);
  hooks.delete('ashenGateSkillTrees.checkProgress');
  await api.grantPoints(A,tree.id,1,'[TEST] m1');assert.equal(acc.account(A,tree.id).awarded,2);
});
test('legacyData returns what 0.15.0/0.16.0 left (GM only, read-only)',()=>{
  game.user=gm;
  const d=acc.legacyData();
  assert.deepEqual(d.registry,legacy);assert.equal(d.settings.strainConfig.bands[0].label,'[TEST] Calm');assert.equal(d.settings.maxCindersPerActor,null);
  assert.deepEqual(d.pointers,[{actorId:'A',pointers:[{instanceId:'cinst_LEGACY0001',definitionId:'MUT-TEST-EMBER'}]}]);
  d.registry.instances.length=0;assert.equal(journal.flags[MOD].cinders.instances.length,1,'a copy: nothing is changed');
  game.user=owner;assert.throws(()=>acc.legacyData(),/GM only/);game.user=gm;
});
