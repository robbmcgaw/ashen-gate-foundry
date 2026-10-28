// 0.28.0 Show to Players, wired through main.mjs with mocked Foundry (no real sockets, windows or focus).
import test from 'node:test';import assert from 'node:assert/strict';
import {MOD} from '../scripts/core.mjs';

const once=new Map(),defs=new Map(),sets=[],written=[],handlers=new Map(),emitted=[],notes=[];
globalThis.Hooks={once:(e,fn)=>once.set(e,fn),on:()=>{},off:()=>{}};
let lastApp;
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(){lastApp=this;}async render(){this.rendered=true;return this._renderHTML();}async close(){this.rendered=false;}}}}};
const settings={playerAccessEnabled:true,compendiumPackIds:'',openForPlayers:false,showOpensWindow:true};
const gm={id:'gm',isGM:true,active:true},alice={id:'alice',isGM:false,active:true},bob={id:'bob',isGM:false,active:true};
const users=[gm,alice,bob];users.get=id=>users.find(u=>u.id===id);
const src={id:'QUEST-TEST-LANTERN',entity_type:'Objective',objective_kind:'quest',status:'approved',version:'0.1.0',provenance:{sources:['synthetic']},visibility:'reveal_gated',refs:[],name:'[TEST] Lantern',source:{},public_summary:'',objectives:[{key:'a',goal:'[TEST] Light it',visibility:'player'}],locations:[],parameters:{},outcomes:{}};
const st={status:'Active',scope:'party',actorId:null,revealed:true,objectiveReveal:[],progress:{},partyNotes:'',gmNotes:'',rewardRecorded:false};
const view={id:src.id,name:src.name,objective_kind:'quest',status:'Active',scope:'party',objectives:[{key:'a',goal:'[TEST] Light it'}],locationIds:[]};
const KEY='Qk9xZ2hLdWFtcDEx';
const flagDoc=(id,flags,perm)=>({id,getFlag:(m,k)=>m===MOD?flags[k]:undefined,testUserPermission:perm,update:async d=>{written.push(d);},delete:async()=>{written.push('delete');}});
const priv=flagDoc('PRIVATEDOC000001',{private:true,source:src,state:st},u=>u.isGM);
const pub=flagDoc(KEY,{public:true,view},u=>u.isGM||u.id==='alice');
const journal=[priv,pub];journal.get=id=>journal.find(j=>j.id===id);
globalThis.document={querySelectorAll:()=>[],querySelector:()=>null,activeElement:null};
globalThis.ui={actors:{element:null},notifications:{info:m=>notes.push(['info',m]),warn:m=>notes.push(['warn',m]),error:m=>notes.push(['error',m])}};
globalThis.game={user:gm,users,journal,actors:Object.assign([],{get:()=>null}),folders:[],items:{contents:[]},packs:{get:()=>null},
 socket:{on:(ch,fn)=>handlers.set(ch,fn),emit:(ch,msg,opts)=>emitted.push({ch,msg,opts})},
 settings:{register:(m,k,d)=>defs.set(k,d),get:(m,k)=>settings[k],set:async(m,k,v)=>{sets.push([k,v]);settings[k]=v;}},modules:{get:id=>id===MOD?mod:null}};
const mod={active:true,api:null};
const origError=console.error;console.error=()=>{};
await import('../scripts/main.mjs');
once.get('init')();once.get('ready')();
console.error=origError;

test('the setting is on by default, a world setting, and sits in GM Setup; it saves with Save Changes', async()=>{
 assert.equal(defs.get('showOpensWindow').default,true);assert.equal(defs.get('showOpensWindow').scope,'world');assert.equal(defs.get('showOpensWindow').config,false);
 await mod.api.open();lastApp.tab='setup';let html=await lastApp.render();
 assert.match(html,/id="ag-open-on-show" checked> Players' windows open automatically when the GM shows a quest/);
 sets.length=0;
 const form=on=>({querySelector:s=>s==='#ag-player-access'?{checked:true}:s==='#ag-compendium-packs'?{value:''}:s==='#ag-open-for-players'?{checked:false}:s==='#ag-open-on-show'?{checked:on}:null});
 await lastApp.action({dataset:{action:'save-setup'}},form(true));assert.deepEqual(sets,[],'unchanged means nothing written');
 await lastApp.action({dataset:{action:'save-setup'}},form(false));assert.deepEqual(sets,[['showOpensWindow',false]]);
 html=await lastApp.render();assert.doesNotMatch(html,/id="ag-open-on-show" checked/);
 await lastApp.action({dataset:{action:'save-setup'}},form(true));assert.equal(settings.showOpensWindow,true);
});
test('the GM editor has Show to Players beside Delete; a new unsaved quest has neither', async()=>{
 game.user=gm;await mod.api.open();lastApp.tab='quests';lastApp.gmId=src.id;
 const html=await lastApp.render();
 const head=html.slice(html.indexOf('agq-edit__head'),html.indexOf('</header>',html.indexOf('agq-edit__head')));
 assert.match(head,/data-action="show-to-players"[^>]*>[\s\S]*Show to Players[\s\S]*data-action="delete"/);
 lastApp.gmId=null;assert.doesNotMatch(await lastApp.render(),/data-action="show-to-players"/);
 game.user=alice;lastApp.tab='party';assert.doesNotMatch(await lastApp.render(),/show-to-players/,'players do not get the button');
 game.user=gm;
});
test('pressing it sends only the key, to the players who may see the quest, and writes nothing', async()=>{
 game.user=gm;await mod.api.open();lastApp.tab='quests';lastApp.gmId=src.id;lastApp.unsavedSource=false;
 emitted.length=0;notes.length=0;written.length=0;sets.length=0;
 await lastApp.action({dataset:{action:'show-to-players'}},null);
 assert.equal(emitted.length,1);
 assert.deepEqual(emitted[0],{ch:`module.${MOD}`,msg:{type:'show-quest',key:KEY},opts:{recipients:['alice']}});
 assert.deepEqual(notes,[['info','Shown to 1 player.']]);
 assert.deepEqual(written,[]);assert.deepEqual(sets,[]);
});
test('a player pressing it (or calling it) cannot broadcast', async()=>{
 game.user=alice;emitted.length=0;notes.length=0;
 await lastApp.action({dataset:{action:'show-to-players'}},null);
 assert.equal(emitted.length,0);assert.equal(notes.at(-1)[0],'error');game.user=gm;
});
test('the socket handler routes show messages to the receiver and journal messages elsewhere', async()=>{
 const handle=handlers.get(`module.${MOD}`);assert.equal(typeof handle,'function');
 lastApp.gmId=null;lastApp.tab='party';game.user=alice;await mod.api.open();lastApp.tab='journal';lastApp.selectedId=null;
 handle({type:'show-quest',key:KEY},'gm');await new Promise(r=>setTimeout(r,20));
 assert.equal(lastApp.selectedId,view.id,'the one Quest Log window switched to the quest');assert.equal(lastApp.tab,'party');
 // A player-sent message is ignored.
 lastApp.selectedId=null;handle({type:'show-quest',key:KEY},'bob');await new Promise(r=>setTimeout(r,20));
 assert.equal(lastApp.selectedId,null);
 // Player Bob cannot see the quest: nothing opens, no toast.
 game.user=bob;notes.length=0;handle({type:'show-quest',key:KEY},'gm');await new Promise(r=>setTimeout(r,20));
 assert.equal(lastApp.selectedId,null);assert.deepEqual(notes,[]);
 game.user=gm;
});
