import test from 'node:test';import assert from 'node:assert/strict';
// 0.13.0: api.pointsSummary(actor). Mocked Foundry + a stand-in Profession Ledger; logic only.
class FakeApplication {static DEFAULT_OPTIONS={};render(){return this;}async _prepareContext(){return {};}}
const oneTime=new Map(),saved=new Map();
globalThis.Hooks={once:(e,fn)=>oneTime.set(e,fn),on:()=>{}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{confirm:async()=>true}}},utils:{escapeHTML:x=>String(x),randomID:()=>'r'}};
const MOD='ashen-gate-skill-trees',PROF='PROF-TP-HERB';
const node=(id,cost=1)=>({id,perkId:`PERK-TP-${id}`,cost,x:0,y:0,requiresAll:[],requiresAny:[],excludes:[],status:'approved',visibility:'player',display:'shown'});
const prof={id:'TP-PROF',name:'[TEST] Herbalism Tree',description:'',status:'approved',visibility:'player',sourceRef:PROF,provider:{kind:'profession',maxPoints:null},nodes:[node('P1'),node('P2')]};
const generic={id:'TP-GEN',name:'[TEST] Generic Tree',description:'',status:'approved',visibility:'player',provider:{kind:'generic_points',maxPoints:10},nodes:[node('G1',2)]};
const journal={flags:{[MOD]:{privateStore:true,payload:{schema:'ag-skill-trees/0.3',trees:[prof,generic]}}},async setFlag(m,k,v){this.flags[m][k]=v;}};
const perk=(id,cost)=>({id:`W${id}`,uuid:`Item.W${id}`,documentName:'Item',type:'feat',name:`[TEST] Perk ${id}`,img:null,ownership:{default:2},
  system:{description:{value:''}},testUserPermission:()=>true,
  flags:{'ashen-gate-manager':{source:{sourceId:`PERK-TP-${id}`,entityType:'ProfessionPerk',status:'approved',visibility:'player',definition:{id:`PERK-TP-${id}`,point_cost:cost}}}}});
const gm={id:'gm',isGM:true,name:'GM'},owner={id:'u1',isGM:false,name:'Owner'},other={id:'u2',isGM:false,name:'Other'};
const actorOf=(id,progressV2)=>({id,name:`[TEST] ${id}`,type:'character',flags:progressV2?{[MOD]:{progressV2}}:{},items:[],
  get isOwner(){return game.user.isGM||game.user.id==='u1';},testUserPermission:(u,l)=>u.isGM||u.id==='u1'});
const hero=actorOf('hero',{'tree:TP-PROF':{unlocks:['P1'],history:[]},'tree:TP-GEN':{awarded:5,unlocks:['G1'],history:[]}});
const blank=actorOf('blank');
const ledger={active:true,api:{progression:{contract:'ag-ledger-progression/1',level:(a,p)=>p===PROF&&a.id==='hero'?{profId:p,xp:5,level:3,tier:'Apprentice'}:null}}};
globalThis.game={modules:new Map([[MOD,{id:MOD,active:true}],['ashen-gate-profession-ledger',ledger]]),
  settings:{register:()=>{},registerMenu:()=>{},get:(_m,k)=>saved.get(k)??(k==='playerAccessEnabled'?true:undefined),set:async(_m,k,v)=>{saved.set(k,v);return v;}},
  journal:{contents:[journal]},items:{contents:[perk('P1',1),perk('P2',1),perk('G1',2)]},actors:{contents:[hero,blank],get(id){return this.contents.find(a=>a.id===id)??null;}},
  user:gm,users:{contents:[gm,owner,other],get:id=>[gm,owner,other].find(u=>u.id===id),activeGM:gm},socket:{on:()=>{},emit:()=>{}}};
globalThis.ui={actors:null,notifications:{info:()=>{},error:()=>{}}};
await import('../scripts/main.js');
oneTime.get('init')();oneTime.get('ready')();
const api=game.modules.get(MOD).api;

test('GM: profession points from the Ledger level, other trees from awards',()=>{
  game.user=gm;
  assert.deepEqual(api.pointsSummary(hero),[
    {treeId:'TP-PROF',name:'[TEST] Herbalism Tree',kind:'profession',level:3,earned:3,spent:1,available:2},
    {treeId:'TP-GEN',name:'[TEST] Generic Tree',kind:'generic_points',level:null,earned:5,spent:2,available:3}]);
});
test('owner sees published trees only; same numbers',async()=>{
  game.user=gm;await api.publish();
  game.user=owner;
  assert.deepEqual(api.pointsSummary(hero).map(r=>[r.treeId,r.earned,r.spent,r.available]),[['TP-PROF',3,1,2],['TP-GEN',5,2,3]]);
});
test('a player who does not own the Actor is refused; Player Access off refuses the owner',()=>{
  game.user=other;assert.throws(()=>api.pointsSummary(hero),/Actor access denied/);
  saved.set('playerAccessEnabled',false);
  try{game.user=owner;assert.throws(()=>api.pointsSummary(hero),/hidden/);game.user=gm;assert.equal(api.pointsSummary(hero).length,2);}
  finally{saved.set('playerAccessEnabled',true);}
});
test('no data: zeros for a fresh character, level 0 without the profession; no Actor → error',()=>{
  game.user=owner;
  assert.deepEqual(api.pointsSummary(blank),[
    {treeId:'TP-PROF',name:'[TEST] Herbalism Tree',kind:'profession',level:0,earned:0,spent:0,available:0},
    {treeId:'TP-GEN',name:'[TEST] Generic Tree',kind:'generic_points',level:null,earned:0,spent:0,available:0}]);
  assert.throws(()=>api.pointsSummary(null),/No Actor/);
});
test('Ledger unavailable: profession earned/available are null, spent still counted',()=>{
  game.user=gm;ledger.active=false;
  try{const [p]=api.pointsSummary(hero);assert.equal(p.level,null);assert.equal(p.earned,null);assert.equal(p.available,null);assert.equal(p.spent,1);}
  finally{ledger.active=true;}
});
