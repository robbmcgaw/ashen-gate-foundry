// The player-facing Appearance button opens General Manager's My Appearance view, and only
// appears when Manager is active and offers that view. Proves rendered markup, not live Foundry.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID} from '../scripts/core.mjs';
const handlers={once:new Map(),on:new Map()};
globalThis.HTMLElement=class {};
globalThis.foundry={applications:{api:{ApplicationV2:class{async render(){return this;}}}}};
const settings=new Map();
const modules=new Map();
const player={id:'player',isGM:false,active:true};
globalThis.game={user:player,modules,actors:Object.assign([],{find:()=>null,get:()=>null}),users:[],
  i18n:{localize:k=>k},
  settings:{register:(ns,key,opts)=>settings.set(`${ns}.${key}`,opts.default),get:(ns,key)=>settings.get(`${ns}.${key}`),set:async(ns,key,v)=>settings.set(`${ns}.${key}`,v)}};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[]};
globalThis.ui={notifications:{info:()=>{},warn:()=>{},error:()=>{}}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>handlers.on.set(k,fn),off:()=>{}};
modules.set(ID,{active:true});
await import('../scripts/main.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
await game.settings.set(ID,'playerAccessEnabled',true);
const render=async()=>{const app=await game.modules.get(ID).api.open();return app._renderHTML();};

test('no Appearance button without General Manager',async()=>{
  modules.delete('ashen-gate-manager');
  assert.doesNotMatch(await render(),/data-open-appearance/);
});
test('no Appearance button when Manager is installed but inactive, or lacks My Appearance',async()=>{
  modules.set('ashen-gate-manager',{active:false,api:{appearance:{openMyAppearance:()=>{}}}});
  assert.doesNotMatch(await render(),/data-open-appearance/);
  modules.set('ashen-gate-manager',{active:true,api:{appearance:{}}});
  assert.doesNotMatch(await render(),/data-open-appearance/);
});
test('players see the Appearance button when Manager offers My Appearance',async()=>{
  modules.set('ashen-gate-manager',{active:true,api:{appearance:{openMyAppearance:()=>{}}}});
  const html=await render();
  assert.match(html,/data-open-appearance/);
  assert.match(html,/class="ag-header agu-header"/);
  assert.match(html,/class="ag-tabs agu-tabs"/);
});
