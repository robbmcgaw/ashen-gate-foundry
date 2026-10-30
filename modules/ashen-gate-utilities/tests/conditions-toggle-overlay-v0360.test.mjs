// 0.36.0: api.conditions.isOverlayOpen / toggleOverlay. Mocked Foundry globals: proves the logic, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID} from '../scripts/core.mjs';

const gm={id:'gm',name:'GM',isGM:true,active:true};
const alice={id:'alice',name:'Alice',isGM:false,active:true};
const users=[gm,alice];users.get=id=>users.find(u=>u.id===id);
const actors=[];actors.get=()=>undefined;
const settings=new Map(),handlers={once:new Map(),on:new Map()};
globalThis.HTMLElement=class {};
globalThis.document={querySelectorAll:()=>[],activeElement:null};
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(o){this.options=o;this.rendered=false;this.element={style:{setProperty(){}}};}async render(){this.rendered=true;return this;}async close(){this.rendered=false;this._onClose?.({});}}}}};
globalThis.game={user:gm,users,actors,modules:new Map([[ID,{id:ID,active:true}]]),tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,o)=>settings.set(`${ns}.${key}`,{value:o.default,onChange:o.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}},
 socket:{emit:()=>{},on:()=>{}}};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[]};
globalThis.ui={notifications:{info:()=>{},warn:()=>{},error:()=>{}}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>handlers.on.set(k,fn),off:()=>{},callAll:()=>{}};
await import('../scripts/main.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api.conditions;
const settle=()=>new Promise(r=>setTimeout(r,5));

await game.settings.set(ID,'playerAccessEnabled',true);

test('closed -> toggle opens; open -> toggle closes; state tracked throughout',async()=>{
 game.user=gm;assert.equal(api.isOverlayOpen(),false);
 const w=await api.toggleOverlay();await settle();
 assert.equal(w.rendered,true);assert.equal(api.isOverlayOpen(),true);assert.equal(game.settings.get(ID,'overlayOpen'),true);
 assert.equal(await api.toggleOverlay(),false);await settle();
 assert.equal(w.rendered,false);assert.equal(api.isOverlayOpen(),false);assert.equal(game.settings.get(ID,'overlayOpen'),false);
 const again=await api.toggleOverlay();await settle();assert.equal(again.rendered,true);assert.equal(api.isOverlayOpen(),true);
 await api.toggleOverlay();await settle();assert.equal(api.isOverlayOpen(),false);
});
test('isOverlayOpen follows openOverlay, closeOverlay and the window\'s own close button',async()=>{
 game.user=gm;
 const w=await api.openOverlay();await settle();assert.equal(api.isOverlayOpen(),true);
 await api.closeOverlay();await settle();assert.equal(api.isOverlayOpen(),false);
 const w2=await api.openOverlay();await settle();assert.equal(api.isOverlayOpen(),true);
 await w2.close();await settle();assert.equal(api.isOverlayOpen(),false,'own X');
 assert.equal(game.settings.get(ID,'overlayOpen'),false);
 const w3=await api.toggleOverlay();await settle();assert.equal(w3.rendered,true,'toggle opens after the X');
 await api.toggleOverlay();await settle();
});
test('idempotent: repeated open / close do not throw and keep the state',async()=>{
 game.user=gm;
 await api.openOverlay();await api.openOverlay();await settle();assert.equal(api.isOverlayOpen(),true);
 await api.closeOverlay();await api.closeOverlay();await settle();assert.equal(api.isOverlayOpen(),false);
});
test('permissions: a hidden player cannot open it through toggle and sees false',async()=>{
 game.user=gm;await game.settings.set(ID,'playerAccessEnabled',false);
 game.user=alice;assert.equal(api.isOverlayOpen(),false);
 await assert.rejects(()=>api.toggleOverlay(),/hidden by the GM/);
 assert.equal(game.settings.get(ID,'overlayOpen'),false,'a refused toggle leaves the setting alone');
 assert.equal(api.isOverlayOpen(),false);
 await assert.rejects(()=>api.openOverlay(),/hidden by the GM/,'openOverlay unchanged');
 await game.settings.set(ID,'overlayOpen',false);
 game.user=gm;await game.settings.set(ID,'playerAccessEnabled',true);
 game.user=alice;const w=await api.toggleOverlay();await settle();assert.equal(w.rendered,true);assert.equal(api.isOverlayOpen(),true);
 await api.toggleOverlay();await settle();assert.equal(api.isOverlayOpen(),false);
});
test('isOverlayOpen is false for a user who lost access while the window was still open',async()=>{
 game.user=gm;await api.openOverlay();await settle();
 game.user=alice;await game.settings.set(ID,'playerAccessEnabled',false);
 assert.equal(api.isOverlayOpen(),false);
 game.user=gm;await game.settings.set(ID,'playerAccessEnabled',true);await api.closeOverlay();await settle();
});
test('isOverlayOpen never throws, even when game or its settings are unavailable',()=>{
 const g=globalThis.game;try{globalThis.game=undefined;assert.equal(api.isOverlayOpen(),false);globalThis.game={user:gm,settings:{get(){throw Error('not ready');}}};assert.equal(api.isOverlayOpen(),false);}finally{globalThis.game=g;}
});
