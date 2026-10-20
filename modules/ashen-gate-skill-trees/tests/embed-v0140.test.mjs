import test from 'node:test';import assert from 'node:assert/strict';
// 0.14.0: api.embed.mount(element, {actorId, mode}). Mocked Foundry, a stand-in Ledger and a fake element: proves gates, rendering and the Unlock route, not the live UI.
class FakeApplication {static DEFAULT_OPTIONS={};render(){return this;}async _prepareContext(){return {};}}
const oneTime=new Map(),saved=new Map(),emitted=[],notes=[];let socketFn=null;
globalThis.Hooks={once:(e,fn)=>oneTime.set(e,fn),on:()=>{}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{confirm:async()=>true}}},utils:{escapeHTML:x=>String(x),randomID:()=>'r'}};
const MOD='ashen-gate-skill-trees',PROF='PROF-TP-HERB';
const node=(id,cost=1)=>({id,perkId:`PERK-TP-${id}`,cost,x:0,y:0,requiresAll:[],requiresAny:[],excludes:[],status:'approved',visibility:'player',display:'shown'});
const prof={id:'TP-PROF',name:'[TEST] Herbalism Tree',description:'',status:'approved',visibility:'player',sourceRef:PROF,provider:{kind:'profession',maxPoints:null},nodes:[node('P1'),node('P2')]};
const generic={id:'TP-GEN',name:'[TEST] Generic Tree',description:'',status:'approved',visibility:'player',provider:{kind:'generic_points',maxPoints:10},nodes:[node('G1',2)]};
const journal={flags:{[MOD]:{privateStore:true,payload:{schema:'ag-skill-trees/0.3',trees:[prof,generic]}}},async setFlag(m,k,v){this.flags[m][k]=v;}};
const perk=(id,cost)=>({id:`W${id}`,uuid:`Item.W${id}`,documentName:'Item',type:'feat',name:`[TEST] Perk ${id}`,img:null,ownership:{default:2},
  system:{description:{value:''}},testUserPermission:()=>true,toObject(){return {name:this.name,type:'feat',system:{},flags:structuredClone(this.flags)};},
  flags:{'ashen-gate-manager':{source:{sourceId:`PERK-TP-${id}`,entityType:'ProfessionPerk',status:'approved',visibility:'player',definition:{id:`PERK-TP-${id}`,point_cost:cost}}}}});
const gm={id:'gm',isGM:true,name:'GM'},owner={id:'u1',isGM:false,name:'Owner'},other={id:'u2',isGM:false,name:'Other'};
const actorOf=(id,progressV2)=>({id,name:`[TEST] ${id}`,type:'character',flags:progressV2?{[MOD]:{progressV2}}:{},items:[],
  async setFlag(m,k,v){this.flags[m]??={};this.flags[m][k]=structuredClone(v);},async createEmbeddedDocuments(t,rows){const made=rows.map((r,i)=>({...r,id:`new${i}`,async delete(){}}));this.items.push(...made);return made;},
  get isOwner(){return game.user.isGM||game.user.id==='u1';},testUserPermission:(u,l)=>u.isGM||u.id==='u1'});
const hero=actorOf('hero',{'tree:TP-PROF':{unlocks:['P1'],history:[]},'tree:TP-GEN':{awarded:5,unlocks:['G1'],history:[]}});
const blank=actorOf('blank');
const ledger={active:true,api:{progression:{contract:'ag-ledger-progression/1',level:(a,p)=>p===PROF&&a.id==='hero'?{profId:p,xp:5,level:3,tier:'Apprentice'}:null}}};
globalThis.game={modules:new Map([[MOD,{id:MOD,active:true}],['ashen-gate-profession-ledger',ledger]]),
  settings:{register:()=>{},registerMenu:()=>{},get:(_m,k)=>saved.get(k)??(k==='playerAccessEnabled'?true:undefined),set:async(_m,k,v)=>{saved.set(k,v);return v;}},
  journal:{contents:[journal]},items:{contents:[perk('P1',1),perk('P2',1),perk('G1',2)]},actors:{contents:[hero,blank],get(id){return this.contents.find(a=>a.id===id)??null;}},
  user:gm,users:{contents:[gm,owner,other],get:id=>[gm,owner,other].find(u=>u.id===id),activeGM:gm},socket:{on:(n,fn)=>{socketFn=fn;},emit:(n,m)=>emitted.push(m)}};
globalThis.ui={actors:null,notifications:{info:m=>notes.push(['info',m]),error:m=>notes.push(['error',m])}};
await import('../scripts/main.js');
oneTime.get('init')();oneTime.get('ready')();
const api=game.modules.get(MOD).api;

const tick=()=>new Promise(r=>setTimeout(r,0));
function fakeElement(){
  const listeners=[];
  const el={innerHTML:'',isConnected:true,classes:new Set(),listeners,
    classList:{add:c=>el.classes.add(c),remove:c=>el.classes.delete(c)},
    addEventListener(type,fn,{signal}={}){const l={type,fn};listeners.push(l);signal?.addEventListener('abort',()=>listeners.splice(listeners.indexOf(l),1));},
    contains:()=>true,
    async fire(type,target){for(const l of listeners.filter(x=>x.type===type))await l.fn({target,stopPropagation(){},preventDefault(){}});}};
  return el;
}
const btn=(data)=>{const b={dataset:data,disabled:false,isConnected:true};b.closest=sel=>sel==='[data-agst-embed]'?b:null;return b;};

test('GM: trees with points or perks, available perks with Unlock, unlocked chips, locked with reasons',()=>{
  game.user=gm;
  const el=fakeElement();const view=api.embed.mount(el,{actorId:'hero',mode:'character'});
  assert.ok(el.classes.has('agst-embed'));
  assert.match(el.innerHTML,/\[TEST\] Herbalism Tree[\s\S]*2 points to spend[\s\S]*1 of 3 spent · level 3/);
  assert.match(el.innerHTML,/data-agst-embed="unlock" data-tree="TP-PROF" data-node="P2"/);
  assert.match(el.innerHTML,/Unlocked<\/h4><ul class="agst-embed__chips"><li[^>]*>\[TEST\] Perk P1/);
  assert.match(el.innerHTML,/\[TEST\] Generic Tree[\s\S]*3 points to spend/);
  assert.match(el.innerHTML,/data-agst-embed="open" data-tree="TP-PROF"/);
  view.unmount();assert.equal(el.innerHTML,'');assert.equal(el.listeners.length,0);
});

test('a non-owner player sees only a note; Player Access off hides it from the owner',async()=>{
  game.user=gm;await api.publish();
  game.user=other;
  const el=fakeElement();const view=api.embed.mount(el,{actorId:'hero'});
  assert.match(el.innerHTML,/Only \[TEST\] hero's owner and the GM/);
  assert.doesNotMatch(el.innerHTML,/Herbalism/);
  game.user=owner;saved.set('playerAccessEnabled',false);
  try{view.refresh();assert.match(el.innerHTML,/hidden Skill Trees/);}finally{saved.set('playerAccessEnabled',true);}
  view.refresh();assert.match(el.innerHTML,/Herbalism/);
  view.unmount();
});

test('GM Unlock from the embed spends points, adds the perk Item and refreshes',async()=>{
  game.user=gm;notes.length=0;
  const el=fakeElement();const view=api.embed.mount(el,{actorId:'hero'});
  await el.fire('click',btn({agstEmbed:'unlock',tree:'TP-PROF',node:'P2'}));
  assert.deepEqual(hero.flags[MOD].progressV2['tree:TP-PROF'].unlocks,['P1','P2']);
  assert.ok(hero.items.some(i=>i.name==='[TEST] Perk P2'),'perk Item added');
  assert.ok(notes.some(([k,m])=>k==='info'&&/P2 unlocked and added/.test(m)),JSON.stringify(notes));
  assert.doesNotMatch(el.innerHTML,/data-node="P2"/,'no longer available');
  view.unmount();
});

test('owner Unlock goes to the GM client as the existing request; refused for a non-owner before any request',async()=>{
  game.user=owner;notes.length=0;emitted.length=0;
  hero.flags[MOD].progressV2['tree:TP-GEN'].awarded=9;
  game.user=gm;generic.nodes.push(node('G2',1));await api.publish();
  game.items.contents.push(perk('G2',1));await api.publish();
  game.user=owner;
  const el=fakeElement();const view=api.embed.mount(el,{actorId:'hero'});
  assert.match(el.innerHTML,/data-node="G2"/);
  const pending=el.fire('click',btn({agstEmbed:'unlock',tree:'TP-GEN',node:'G2'}));
  await tick();await tick();
  const req=emitted.find(m=>m.type==='unlock-request');
  assert.ok(req,'request sent');assert.equal(req.actorId,'hero');assert.equal(req.nodeId,'G2');
  socketFn({type:'unlock-result',requestId:req.requestId,userId:'u1',ok:true,message:'[TEST] Perk G2 unlocked for [TEST] hero.'},'gm');
  await pending;
  assert.ok(notes.some(([k,m])=>k==='info'&&/G2 unlocked/.test(m)),JSON.stringify(notes));
  view.unmount();
  game.user=other;notes.length=0;emitted.length=0;
  const el2=fakeElement();const v2=api.embed.mount(el2,{actorId:'hero'});
  await el2.fire('click',btn({agstEmbed:'unlock',tree:'TP-GEN',node:'G2'}));
  assert.equal(emitted.length,0,'nothing sent');
  assert.ok(notes.some(([k,m])=>k==='error'&&/owner/.test(m)));
  v2.unmount();
});

test('detached element unmounts itself; bad arguments throw',()=>{
  game.user=gm;
  const el=fakeElement();const view=api.embed.mount(el,{actorId:'hero'});
  el.isConnected=false;view.refresh();assert.equal(el.listeners.length,0);
  assert.throws(()=>api.embed.mount(null,{actorId:'hero'}),/DOM element/);
  assert.throws(()=>api.embed.mount(fakeElement(),{actorId:'hero',mode:'graph'}),/Unknown embed mode/);
  assert.deepEqual(api.embed.modes,['character']);
});
