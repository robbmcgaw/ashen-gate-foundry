// 0.28.0: each coin is one line: icon, full name, amount, no CP/SP/GP/PP abbreviation. (The purse layout itself moved in
// 0.28.1; see purse-card-v0281.test.mjs.)
// Mocked Foundry globals and a fake element: proves the markup, not the live layout in Foundry.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,coinBoxHTML,coinStripHTML} from '../scripts/core.mjs';

const handlers={once:new Map(),on:new Map()};const settings=new Map();
globalThis.HTMLElement=class {};
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(o){this.options=o;}async render(){return this;}async close(){}}}}};
const gm={id:'gm',name:'GM',isGM:true,active:true},alice={id:'alice',name:'Alice',isGM:false,active:true};
function mkActor(id,name,owner,flags={},system={}){const m=new Map();const a={id,name,type:owner?'character':'npc',documentName:'Actor',statuses:new Set(),effects:[],flags,system,
 getFlag:(ns,k)=>flags[ns]?.[k],testUserPermission:(u,level)=>u.isGM||u.id===owner||level==='LIMITED',update:async()=>{}};
 a.items={get:k=>m.get(k),get size(){return m.size;},[Symbol.iterator]:()=>m.values()};return a;}
const stash=mkActor('stash','Ashen Gate | Party Stash',null,{[ID]:{partyStash:true}},{currency:{cp:124,sp:5,ep:0,gp:1042,pp:3}});
const wren=mkActor('wren','[TEST] Wren','alice',{},{currency:{cp:0,sp:0,ep:0,gp:3,pp:0}});
const users=[gm,alice];users.get=id=>users.find(u=>u.id===id);
const actors=[stash,wren];actors.get=id=>actors.find(a=>a.id===id);
globalThis.fromUuid=async()=>null;globalThis.fromUuidSync=()=>null;
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{OBSERVER:2}};
globalThis.game={user:gm,users,actors,time:{worldTime:0},modules:new Map([[ID,{id:ID,active:true}]]),tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,o)=>settings.set(`${ns}.${key}`,{value:o.default,onChange:o.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,
  set:async(ns,key,v)=>{const s=settings.get(`${ns}.${key}`);s.value=v;s.onChange?.(v);}},
 socket:{emit:()=>{},on:()=>{}}};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[],Item:{typeLabels:{}}};
globalThis.ui={notifications:{info:()=>{},warn:()=>{},error:()=>{}}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>{if(!handlers.on.has(k))handlers.on.set(k,[]);handlers.on.get(k).push(fn);},off:()=>{}};
globalThis.document={querySelectorAll:()=>[],activeElement:null};
const origError=console.error;console.error=()=>{};
await import('../scripts/main.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api;
const set=(k,v)=>game.settings.set(ID,k,v);
const tick=()=>new Promise(r=>setTimeout(r,0));
function fakeElement(){const el={innerHTML:'',isConnected:true,classList:{add(){},remove(){}},addEventListener(){},contains:()=>true,querySelector:()=>null};return el;}
async function mounted(user){game.user=user;const el=fakeElement();const view=api.embed.mount(el,{actorId:'wren',mode:'stash'});await tick();return {html:el.innerHTML,view};}
/** The heading row of the purse: from its opening div to the coin strip. */
const headRow=html=>{const m=html.match(/<div class="agu-line agu-purse-head">([\s\S]*?)<div class="agu-coins">/);assert.ok(m,'purse heading row present');return m[1];};

test('one coin entry reads icon + full name + number, with no abbreviation, and names its icon',()=>{
 const box=coinBoxHTML('cp',124);
 assert.equal(box,'<div class="agu-coin agu-coin--cp" data-coin="cp" role="group" aria-label="Copper: 124"><span class="agu-coin__icon" role="img" aria-label="Copper coin">C</span><span class="agu-coin__label">Copper</span><strong class="agu-coin__value">124</strong></div>');
 assert.doesNotMatch(box,/<abbr|>cp<|\bCP\b/);
 assert.match(coinBoxHTML('ep',2,{off:true,note:'electrum is off'}),/aria-label="Electrum: 2 \(electrum is off\)"/);
});

test('coin strip: copper, silver, gold, platinum; electrum only when on (or still held)',()=>{
 const off=coinStripHTML({cp:124,sp:5,ep:0,gp:12,pp:3},false);
 assert.deepEqual([...off.matchAll(/class="agu-coin__label">([^<]+)</g)].map(m=>m[1]),['Copper','Silver','Gold','Platinum']);
 assert.doesNotMatch(off,/\b(CP|SP|EP|GP|PP|cp|sp|ep|gp|pp)</);
 const on=coinStripHTML({cp:0,sp:0,ep:0,gp:0,pp:0},true);
 assert.deepEqual([...on.matchAll(/class="agu-coin__label">([^<]+)</g)].map(m=>m[1]),['Copper','Silver','Electrum','Gold','Platinum']);
 for(const n of ['Copper','Silver','Electrum','Gold','Platinum'])assert.match(on,new RegExp(`role="img" aria-label="${n} coin"`));
});
console.error=origError;
