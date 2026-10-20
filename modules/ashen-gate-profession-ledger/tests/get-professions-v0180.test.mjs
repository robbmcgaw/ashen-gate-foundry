// 0.18.0: api.getProfessions(actor), read-only, owner or GM. Logic only, mocked Foundry.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
let hooks={},api;
const values={partyRoster:[],playerAccessEnabled:true,libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]}};
const gm={id:'gm',isGM:true,name:'GM'},owner={id:'u1',isGM:false,name:'Owner'},other={id:'u2',isGM:false,name:'Other'};
globalThis.foundry={applications:{api:{ApplicationV2:class{render(){return this;}},HandlebarsApplicationMixin:c=>c,DialogV2:{confirm:async()=>true}}},utils:{escapeHTML:s=>String(s)}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:()=>{}};
globalThis.ui={notifications:{info:()=>{},error:()=>{}}};
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

test('owner gets every player-visible profession with level, XP and XP to next; untracked is level 1',()=>{
 game.user=owner;
 assert.deepEqual(api.getProfessions(hero),[
  {professionId:'PROF-TEST-HERBALISM',name:'Herbalism',level:2,xp:5,xpToNext:8,maxLevel:16,tier:'Apprentice',unspentPerkChoices:2},
  {professionId:'PROF-TEST-MINING',name:'Mining',level:1,xp:0,xpToNext:5,maxLevel:16,tier:'Apprentice',unspentPerkChoices:0}]);
 const row=api.getProfessions(hero)[0];
 assert.equal('history' in row||'selectedPerkIds' in row,false,'never history or perk ids');
});
test('GM also sees GM-only professions',()=>{
 game.user=gm;
 assert.deepEqual(api.getProfessions(hero).map(p=>p.professionId),['PROF-TEST-SECRET','PROF-TEST-HERBALISM','PROF-TEST-MINING']);
});
test('a player who does not own the Actor is refused',()=>{
 game.user=other;
 assert.throws(()=>api.getProfessions(hero),/Actor access denied/);
});
test('Player Access off refuses players, not the GM',()=>{
 values.playerAccessEnabled=false;
 try{game.user=owner;assert.throws(()=>api.getProfessions(hero),/hidden/);game.user=gm;assert.equal(api.getProfessions(hero).length,3);}
 finally{values.playerAccessEnabled=true;}
});
test('no professions → []; no Actor → error',()=>{
 game.user=owner;
 assert.deepEqual(api.getProfessions(empty),[]);
 assert.throws(()=>api.getProfessions(null),/No Actor/);
});
test('max level reports xpToNext null',()=>{
 game.user=gm;
 const max=actorOf('max',items(herb),{'ashen-gate-profession-ledger':{professionProgress:{schema:'ag-profession-actor-progress/0.1',professions:{'PROF-TEST-HERBALISM':{xp:9999,selectedPerkIds:[]}}}}});
 const [p]=api.getProfessions(max);
 assert.equal(p.level,16);assert.equal(p.xpToNext,null);
});
