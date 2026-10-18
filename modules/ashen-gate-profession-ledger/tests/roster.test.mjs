import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const once={}, events={}, settings={}, values={partyRoster:['a','hidden'],libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]}};
const players=[{id:'u1',name:'First Player',isGM:false},{id:'u2',name:'Second Player',isGM:false}];
const gm={id:'gm',name:'GM',isGM:true};let api,opens=0;
const actor=(id,name,viewers,hasPlayerOwner=true)=>({
  id,name,type:'character',hasPlayerOwner,items:[],ownership:{},
  testUserPermission:(u,level)=>viewers.includes(u.id),getFlag:()=>null
});
const alpha=actor('a','Alpha',['u1','u2']);
const hidden=actor('hidden','Secret NPC-typed PC',[]);
const outside=actor('outside','Outside Party',['u1','u2']);
const actors=[alpha,hidden,outside];
const moduleObj={set api(value){api=value;},get api(){return api;}};
globalThis.foundry={applications:{api:{ApplicationV2:class{
  render(){this.rendered=true;return this;}
},HandlebarsApplicationMixin:App=>App,DialogV2:class{}}},utils:{escapeHTML:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')}};
globalThis.ui={notifications:{info:()=>{},error:()=>{}}};
globalThis.Hooks={once:(n,fn)=>once[n]=fn,on:(n,fn)=>(events[n]??=[]).push(fn)};
globalThis.game={settings:{register:(m,k,opts)=>settings[k]=opts,registerMenu:()=>{},get:(m,k)=>values[k],set:async(m,k,value)=>{values[k]=value;settings[k]?.onChange?.();}},
 modules:{get:()=>moduleObj},user:gm,items:{contents:[]},actors:{contents:actors,get:id=>actors.find(a=>a.id===id)},users:{contents:players,filter:fn=>players.filter(fn)}};
const entry=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js');
await import(pathToFileURL(entry));once.init();once.ready();
const app=api.open({view:'party'});
assert.deepEqual(app.actors.map(x=>x.id),['a','hidden'],'GM sees only selected roster');
assert.ok(app._party(app.actors,app.library).includes('2'),'GM party view uses two selected Actors');
assert.match(app._roster(),/Outside Party/,'GM can inspect non-rostered characters to select');
assert.match(app._roster(),/All players/);
assert.match(app._roster(),/GM only/);
assert.doesNotMatch(app._roster(),/Guest secret in player view/);
const individual=app._individual(alpha);
assert.match(individual,/agl-individual-content/);
assert.match(individual,/agl-actor-strip/);
assert.doesNotMatch(individual,/Outside Party/);
app.element={querySelectorAll:selector=>selector==='[data-roster-actor]:checked'?[{dataset:{rosterActor:'a'}}]:[]};
await app._click('roster-save');
assert.deepEqual(values.partyRoster,['a']);
assert.deepEqual(app.actors.map(x=>x.id),['a']);
// A regular player may see only roster members they have observer access to.
game.user=players[0];values.partyRoster=['a','hidden'];
assert.deepEqual(app.actors.map(x=>x.id),['a']);
assert.doesNotMatch(app._individual(alpha),/Secret NPC-typed PC/);
assert.equal(app._tabs().includes('Party Roster'),false,'roster controls hidden for players');
assert.match(app._roster(),/GM-only/,'roster view refuses players even if forced');
await app._click('roster-save');
assert.deepEqual(values.partyRoster,['a','hidden'],'player cannot mutate world roster');
// Actor directory hook registration and idempotent injection, both GM and player.
let launcher=null;let click;
const header={append:x=>{launcher=x;}};
const root={querySelector:selector=>selector==='[data-agl-launcher]'?launcher:header};
globalThis.document={createElement:()=>({classList:{add:()=>{}},dataset:{},addEventListener:(name,fn)=>{if(name==='click')click=fn;}})};
const directory={tabName:'actors'};
assert.equal(typeof events.renderActorDirectory?.[0],'function');
events.renderActorDirectory[0](directory,root);
assert.equal(launcher.dataset.aglLauncher,'true');
const oldLauncher=launcher;
events.renderActorDirectory[0](directory,root);
assert.equal(launcher,oldLauncher,'no duplicate launchers after re-render');
moduleObj.api.open=()=>{opens++;};
click({preventDefault:()=>{},stopPropagation:()=>{}});
assert.equal(opens,1,'sidebar button opens Ledger API');
console.log('PASS GM-managed roster, player-safe selection, visibility badges and sidebar launcher');
