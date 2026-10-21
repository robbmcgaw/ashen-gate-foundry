// 0.14.1 dialogs sweep: Help opens with one Close button, destructive confirms are labelled and red, no test wording in the window.
// Mocked Foundry globals; proves the wiring, not the live DialogV2 window.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,VERSION} from '../scripts/core.mjs';

const handlers={once:new Map(),on:new Map()};
let seen=null,answer='cancel';
globalThis.HTMLElement=class {};
globalThis.foundry={applications:{api:{
 ApplicationV2:class{constructor(){this.rendered=false;}async render(){this.rendered=true;return this;}async close(){this.rendered=false;}},
 DialogV2:{prompt:async o=>{seen=o;},wait:async o=>{seen=o;return o.buttons.find(b=>b.action===answer).callback();}}
}}};
const gm={id:'gm',name:'GM',isGM:true,active:true};
const settings=new Map();
const actors=[];actors.get=id=>actors.find(a=>a.id===id);
const users=[gm];users.get=id=>users.find(u=>u.id===id);
globalThis.game={user:gm,users,actors,tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,opts)=>settings.set(`${ns}.${key}`,{value:opts.default,onChange:opts.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}},
 modules:new Map([[ID,{id:ID,api:{},active:true}]])};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[]};
globalThis.ui={actors:null,notifications:{info:()=>{},warn:()=>{},error:()=>{}}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>{handlers.on.set(k,fn);return 1;},off:()=>{}};
globalThis.ChatMessage={create:async m=>m,getSpeaker:()=>({})};
await import('../scripts/main.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=()=>game.modules.get(ID).api;

test('Help opens through infoDialog with one Close button in the Ashen Gate dialog look',async()=>{
 const app=await api().open();seen=null;
 await app.handle('help',{disabled:false},{});
 assert.equal(seen.ok.label,'Close');assert.ok(seen.classes.includes('ag-app')&&seen.classes.includes('ag-dialog'));
 assert.equal(seen.window.title,'Utilities Help');
});
test('Clear stash history asks first (red, labelled) and Cancel keeps the history',async()=>{
 const app=await api().open();
 const before=[{at:1,kind:'test'}];await game.settings.set(ID,'stashHistory',before);
 answer='cancel';seen=null;
 await app.handle('stash-history-clear',{disabled:false},{});
 assert.deepEqual(seen.buttons.map(b=>b.label),['Cancel','Clear history']);
 assert.ok(seen.classes.includes('ag-dialog--danger'));assert.equal(seen.window.title,'Clear stash history?');
 assert.deepEqual(game.settings.get(ID,'stashHistory'),before);
});
test('the window shows only the version, no acceptance footer, and the plain empty state',async()=>{
 const app=await api().open();const html=await app._renderHTML();
 assert.ok(html.includes(`>v${VERSION}</span>`));
 for(const s of ['acceptance pending','Alpha','disposable'])assert.ok(!html.includes(s),s);
 assert.ok(html.includes('Add at least two characters to start a check.'));
});
