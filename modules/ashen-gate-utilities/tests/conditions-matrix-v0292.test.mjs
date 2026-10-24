// 0.29.2: who may change conditions on whom, through api.conditions.canChangeActor (the call the Character Hub uses for
// unlinked tokens) and canApply / canRemove. Mocked Foundry globals: proves the logic, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,isPlayerCharacter} from '../scripts/core.mjs';

const gm={id:'gm',name:'GM',isGM:true,active:true};
const alice={id:'alice',name:'Alice',isGM:false,active:true};
const bob={id:'bob',name:'Bob',isGM:false,active:true};
const mk=(id,name,type,owner,statuses=[])=>{const a={id,name,type,statuses:new Set(statuses),effects:[],items:[],toggled:[],getFlag:()=>null,
  testUserPermission:(u,level)=>u.isGM||u.id===owner||level==='LIMITED',
  toggleStatusEffect:async(s,{active})=>{a.toggled.push([s,active]);if(active)a.statuses.add(s);else a.statuses.delete(s);}};return a;};
const wren=mk('a1','Wren','character','alice',['prone']), ash=mk('b1','Ash','character','bob'), goblin=mk('n1','Goblin','npc',null,['blinded']);
const token=mk('tok','Wolf (token)','npc',null);   // an unlinked token's Actor: not in game.actors
const users=[gm,alice,bob];users.get=id=>users.find(u=>u.id===id);
const actors=[wren,ash,goblin];actors.get=id=>actors.find(a=>a.id===id);
const settings=new Map();const handlers={once:new Map(),on:new Map()};
globalThis.HTMLElement=class {};
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(o){this.options=o;}async render(){return this;}async close(){}}}}};
globalThis.game={user:gm,users,actors,modules:new Map([[ID,{id:ID,active:true}]]),tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,o)=>settings.set(`${ns}.${key}`,{value:o.default,onChange:o.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}},
 socket:{emit:()=>{},on:()=>{}}};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[{id:'prone',name:'Prone'},{id:'blinded',name:'Blinded'},{id:'exhaustion',name:'Exhaustion'}]};
globalThis.ui={notifications:{info:()=>{},warn:()=>{},error:()=>{}}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>handlers.on.set(k,fn),off:()=>{},callAll:()=>{}};
await import('../scripts/main.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api.conditions;
const access=async on=>{game.user=gm;await game.settings.set(ID,'playerAccessEnabled',on);};

test('player character = a Character a player owns; monsters, NPCs and unowned Characters are not',()=>{
 assert.equal(isPlayerCharacter(wren,[...users]),true);
 assert.equal(isPlayerCharacter(goblin,[...users]),false);
 assert.equal(isPlayerCharacter(mk('x','Innkeeper','character',null),[gm]),false,'a Character nobody plays');
 assert.equal(api.isPlayerCharacter(wren),true);
});
test('permission matrix (apply): GM everything; player: own PC, linked NPC, unlinked token; not another PC; nothing with Player Access off',async()=>{
 await access(true);
 const can=(user,actor,status='exhaustion')=>{game.user=user;return api.canChangeActor(actor,status,true,user.id);};
 assert.equal(can(gm,wren),true);assert.equal(can(gm,ash),true);assert.equal(can(gm,token),true);
 assert.equal(can(alice,wren,'blinded'),true,'own character');
 assert.equal(can(alice,ash,'blinded'),false,'another player\'s character refused');
 assert.equal(can(alice,goblin,'prone'),true,'linked NPC');
 assert.equal(can(alice,token,'prone'),true,'unlinked monster token (not in the world list)');
 assert.equal(can(alice,wren,'nonsense'),false,'native statuses only');
 await access(false);
 assert.equal(can(alice,wren,'blinded'),false,'Player Access off: refused, even on her own character');
 assert.equal(can(alice,token,'prone'),false);
 assert.equal(can(gm,ash),true,'the GM is never held by Player Access');
 game.user=alice;assert.equal(api.canApply('a1','blinded'),false,'canApply follows Player Access too');
 await access(true);
});
test('permission matrix (remove) and the world-actor API calls agree with it',async()=>{
 await access(true);game.user=alice;
 assert.equal(api.canRemove('a1','prone'),true,'own');
 assert.equal(api.canRemove('b1','blinded'),false);
 assert.equal(api.canRemove('n1','blinded'),true,'linked NPC');
 assert.equal(api.canApply('n1','prone'),true);
 assert.equal(api.canChangeActor(token,'blinded',false,'alice'),false,'it does not have it');
 game.user=gm;
});
test('Exhaustion stays on the shared list and can be applied like any native condition',async()=>{
 await access(true);
 assert.ok(api.choices().some(c=>c.id==='exhaustion'));
 game.user=alice;assert.equal(api.canApply('a1','exhaustion'),true);
 game.user=gm;
});
