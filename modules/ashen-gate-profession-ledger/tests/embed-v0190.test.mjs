// 0.19.0: api.embed.mount(element, {actorId, mode}). Mocked Foundry and a fake element: proves gates and routing, not the live UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
let hooks={},api;
const values={partyRoster:[],playerAccessEnabled:true,libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]}};
const gm={id:'gm',isGM:true,name:'GM'},owner={id:'u1',isGM:false,name:'Owner'},other={id:'u2',isGM:false,name:'Other'};
globalThis.foundry={applications:{api:{ApplicationV2:class{render(){return this;}},HandlebarsApplicationMixin:c=>c,DialogV2:{wait:async()=>true}}},utils:{escapeHTML:s=>String(s)}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:()=>{}};
const notes=[];globalThis.ui={notifications:{info:m=>notes.push(['info',m]),error:m=>notes.push(['error',m]),warn:m=>notes.push(['warn',m])}};
const source=(id,type,visibility='player',status='approved',name)=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility,status,...(name?{definition:{name}}:{})}}});
const items=(...xs)=>Object.assign(xs,{get:id=>xs.find(x=>x.id===id)});
const actorOf=(id,inv,flags={})=>({id,name:id,type:'character',items:inv,flags,testUserPermission:(u,role)=>u.isGM||(u.id==='u1'&&['OBSERVER','OWNER'].includes(role))});
const herb={id:'p1',name:'Herbalism',type:'feat',system:{quantity:1},flags:source('PROF-TEST-HERBALISM','Profession')};
const mining={id:'p2',name:'Mining',type:'feat',system:{quantity:1},flags:source('PROF-TEST-MINING','Profession')};
const secret={id:'p3',name:'[TEST] Secret Craft',type:'feat',system:{quantity:1},flags:source('PROF-TEST-SECRET','Profession','gm')};
const progress={schema:'ag-profession-actor-progress/0.1',professions:{'PROF-TEST-HERBALISM':{xp:5,selectedPerkIds:[],history:[{kind:'award'}]}}};
const hero=actorOf('hero',items(mining,herb,secret),{'ashen-gate-profession-ledger':{professionProgress:progress}});
const empty=actorOf('empty',items());
const moduleObj={active:true};
globalThis.game={user:gm,actors:{contents:[hero,empty],get:id=>[hero,empty].find(a=>a.id===id)},users:{contents:[gm,owner,other]},items:items(),
 modules:{get:id=>id==='ashen-gate-profession-ledger'?moduleObj:undefined},
 settings:{register:()=>{},registerMenu:()=>{},get:(id,key)=>values[key],set:async(id,key,v)=>{values[key]=v;return v;}}};
await import(pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js')));hooks.init();hooks.ready();api=moduleObj.api;


console.error=()=>{};
function fakeElement(){
 const listeners=[];
 const el={innerHTML:'',isConnected:true,classes:new Set(),listeners,
  classList:{add:c=>el.classes.add(c),remove:c=>el.classes.delete(c)},
  addEventListener(type,fn,{signal}={}){const l={type,fn};listeners.push(l);signal?.addEventListener('abort',()=>listeners.splice(listeners.indexOf(l),1));},
  contains:()=>true,querySelector:()=>null,
  async fire(type,target){for(const l of listeners.filter(x=>x.type===type))await l.fn({target,stopPropagation(){},preventDefault(){}});}};
 return el;
}
const button=(action,data={})=>{const b={dataset:{action,...data},disabled:false};b.closest=sel=>sel==='[data-action]'?b:null;return b;};

test('owner: mounts the Individual panel for that character; unmount cleans up',()=>{
 game.user=owner;
 const el=fakeElement();const view=api.embed.mount(el,{actorId:'hero',mode:'individual'});
 assert.ok(el.classes.has('agl-embed'));
 assert.match(el.innerHTML,/agl-character agl-on-sheet/);
 assert.match(el.innerHTML,/Herbalism/);assert.match(el.innerHTML,/Mining/);
 assert.doesNotMatch(el.innerHTML,/Secret Craft/,'GM-only professions stay hidden from players');
 assert.equal(typeof view.refresh,'function');
 view.unmount();assert.equal(el.innerHTML,'');assert.equal(el.listeners.length,0);assert.equal(el.classes.size,0);
});
test('GM sees GM-only professions in the embed',()=>{
 game.user=gm;
 const el=fakeElement();api.embed.mount(el,{actorId:'hero'}).unmount;
 assert.match(el.innerHTML,/Secret Craft/);
});
test('a non-owner player gets only a note, and an action is refused in the handler too',async()=>{
 game.user=other;notes.length=0;
 const el=fakeElement();const view=api.embed.mount(el,{actorId:'hero'});
 assert.match(el.innerHTML,/Only hero's owner and the GM/);assert.doesNotMatch(el.innerHTML,/Herbalism/);
 await el.fire('click',button('award-xp',{id:'PROF-TEST-HERBALISM'}));
 assert.ok(notes.some(([k,m])=>k==='error'&&/Only hero's owner/.test(m)),JSON.stringify(notes));
 view.unmount();
});
test('Player Access off: players see the hidden note and refresh follows the setting',()=>{
 game.user=owner;
 const el=fakeElement();const view=api.embed.mount(el,{actorId:'hero'});
 values.playerAccessEnabled=false;
 try{view.refresh();assert.match(el.innerHTML,/hidden the Profession Ledger/);assert.doesNotMatch(el.innerHTML,/Herbalism/);}
 finally{values.playerAccessEnabled=true;}
 view.refresh();assert.match(el.innerHTML,/Herbalism/);
 view.unmount();
});
test('GM-only XP award through the embed is still refused for the owner (performAction checks)',async()=>{
 game.user=owner;notes.length=0;
 const el=fakeElement();const view=api.embed.mount(el,{actorId:'hero'});
 await el.fire('click',button('award-xp',{id:'PROF-TEST-HERBALISM'}));
 assert.ok(notes.some(([k])=>k==='error'),'refused: '+JSON.stringify(notes));
 assert.equal(hero.flags['ashen-gate-profession-ledger'].professionProgress.professions['PROF-TEST-HERBALISM'].xp,5,'XP unchanged');
 view.unmount();
});
test('detached element unmounts itself; bad arguments throw',()=>{
 game.user=owner;
 const el=fakeElement();const view=api.embed.mount(el,{actorId:'hero'});
 el.isConnected=false;view.refresh();assert.equal(el.listeners.length,0);
 assert.throws(()=>api.embed.mount(null,{actorId:'hero'}),/DOM element/);
 assert.throws(()=>api.embed.mount(fakeElement(),{actorId:'hero',mode:'party'}),/Unknown embed mode/);
 assert.deepEqual(api.embed.modes,['individual']);
});
