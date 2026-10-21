// 0.22.2: Character Hub level backups ("<Name> - level X", flag ashen-gate-character-hub.levelBackup) are never listed
// as party characters and never accepted as a target for rolls, gold, the purse, the stash or shops.
// Mocked Foundry globals: proves the logic, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,isLevelBackup,LEVEL_BACKUP_REFUSAL} from '../scripts/core.mjs';

const HUB='ashen-gate-character-hub';
test('isLevelBackup reads the Hub flag only, safe when absent',()=>{
 for(const a of [null,undefined,{},{flags:{}},{flags:{[HUB]:{}}},{flags:{[HUB]:{levelBackup:null}}}])assert.equal(isLevelBackup(a),false);
 assert.equal(isLevelBackup({flags:{[HUB]:{levelBackup:{sourceId:'pcA',levelBefore:3}}}}),true);
});

const handlers={once:new Map(),on:new Map()};const settings=new Map();const updates=[];
globalThis.HTMLElement=class {};
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(o){this.options=o;this.rendered=false;}async render(){this.rendered=true;return this;}async close(){this.rendered=false;}}}}};
const gm={id:'gm',name:'GM',isGM:true,active:true},alice={id:'alice',name:'Alice',isGM:false,active:true};
function mkItems(list=[]){const m=new Map(list.map(i=>[i.id,i]));return {get:id=>m.get(id),get size(){return m.size;},[Symbol.iterator]:()=>m.values()};}
function mkActor(id,name,owner,flags={},items=[]){const a={id,name,type:owner===undefined?'npc':'character',documentName:'Actor',statuses:new Set(),effects:[],flags,
 system:{currency:{cp:0,sp:0,ep:0,gp:10,pp:0},hp:{value:7}},ownership:{},items:mkItems(items),getFlag:(ns,k)=>flags[ns]?.[k],testUserPermission:(u,level)=>u.isGM||u.id===owner||level==='LIMITED',
 update:async d=>{updates.push({id,d});for(const [k,v] of Object.entries(d)){const path=k.split('.'),last=path.pop();path.reduce((o,p)=>o[p],a)[last]=v;}}};return a;}
const stashItem={id:'it1',name:'[TEST] Rope',type:'loot',system:{quantity:1}};
const stash=mkActor('stash','Ashen Gate | Party Stash',undefined,{[ID]:{partyStash:true}},[stashItem]);
const wren=mkActor('pcA','[TEST] Wren','alice');
// The copy keeps the source's owner here so the filter is what excludes it (real copies are GM-only too).
const copy=mkActor('pcA2','[TEST] Wren - level 3','alice',{[HUB]:{levelBackup:{sourceId:'pcA',sourceName:'[TEST] Wren',levelBefore:3,opId:'op1'}}});
const users=[gm,alice];users.get=id=>users.find(u=>u.id===id);
const actors=[stash,wren,copy];actors.get=id=>actors.find(a=>a.id===id);
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{OBSERVER:2}};
globalThis.ChatMessage={create:async d=>d,getSpeaker:()=>({})};
globalThis.game={user:gm,users,actors,time:{worldTime:50},modules:new Map([[ID,{id:ID,active:true}]]),tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,o)=>settings.set(`${ns}.${key}`,{value:o.default,onChange:o.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}},
 socket:{emit:()=>{},on:()=>{}}};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[],Item:{typeLabels:{loot:'Loot'}}};
globalThis.ui={notifications:{info:()=>{},warn:()=>{},error:()=>{}}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>handlers.on.set(k,fn),off:()=>{}};
await import('../scripts/main.mjs');
const {owns}=await import('../scripts/shop-buy.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api;
const refused=new RegExp(LEVEL_BACKUP_REFUSAL.replace(/\./g,'\\.'));

test('lists: the copy is not a party character, the source is',async()=>{
 game.actors.party={name:'[TEST] Party',system:{members:[{actor:wren},{actor:copy}]}};
 assert.deepEqual(api.gold.defaultRecipients().actorIds,['pcA'],'Primary Party members skip the copy');
 delete game.actors.party;
 assert.deepEqual(api.gold.defaultRecipients().actorIds,['pcA'],'characters of connected players skip the copy');
 const {prefill}=await api.rolls.open({skills:['ath'],actorIds:['pcA','pcA2']});
 assert.deepEqual(prefill.actorIds,['pcA'],'roll prefill drops the copy');
});
test('gold: a copy is refused, nothing is paid; the source is paid',async()=>{
 updates.length=0;
 await assert.rejects(api.awardGold({amount:5,actorIds:['pcA','pcA2']}),refused);
 assert.equal(updates.length,0);assert.equal(copy.system.currency.gp,10);
 const {failed}=await api.awardGold({amount:5,actorIds:['pcA']});assert.deepEqual(failed,[]);assert.equal(wren.system.currency.gp,15);
});
test('purse, stash, conditions: a copy is refused as the target, for the GM too',async()=>{
 await api.stash.setEnabled(true);updates.length=0;
 await assert.rejects(api.purse.deposit({actorId:'pcA2',coin:'gp',amount:1}),refused);
 await assert.rejects(api.purse.take({actorId:'pcA2',coin:'gp',amount:1}),refused);
 await assert.rejects(api.stash.withdraw('it1','pcA2'),refused);
 await assert.rejects(api.conditions.setUnlocked('pcA2',true),refused);
 assert.equal(updates.length,0);assert.ok(stash.items.get('it1'),'the stash item stays put');
 await game.settings.set(ID,'playerAccessEnabled',true);game.user=alice;
 await assert.rejects(api.purse.deposit({actorId:'pcA2',coin:'gp',amount:1}),/own/);
 game.user=gm;
 await api.conditions.setUnlocked('pcA',true);assert.equal(api.conditions.isUnlocked('pcA'),true);
});
test('shops: a copy is never a buyer, payer, seller or service customer',()=>{
 assert.equal(owns(copy,gm),false);assert.equal(owns(copy,alice),false);
 assert.equal(owns(wren,gm),true);assert.equal(owns(wren,alice),true);
});
