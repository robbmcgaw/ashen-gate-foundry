// 0.28.0: the party stash embed (Character Hub → Inventory → Party stash) puts Character / Coin / Amount / Deposit / Take
// in the "Party purse" heading row, and each coin is one line: icon, full name, amount, no CP/SP/GP/PP abbreviation.
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

test('GM embed: Character, Coin, Amount, Deposit and Take sit in the Party purse heading row; coins below it',async()=>{
 await set('stashEnabled',true);await set('electrumEnabled',false);
 const {html,view}=await mounted(gm);const row=headRow(html);
 assert.match(row,/^<h3>Party purse<\/h3><div class="agu-purse-move">/);
 for(const re of [/<label class="ag-field agu-purse-who">Character<select id="agu-purse-actor">/,/<label class="ag-field">Coin<select id="agu-purse-coin">/,
  /<label class="ag-field">Amount<input type="number" id="agu-purse-amount"/,/data-action="purse-deposit"[^>]*>[\s\S]*?Deposit/,/data-action="purse-take"[^>]*>[\s\S]*?Take/])assert.match(row,re);
 assert.match(row,/<div class="agu-actions">[^]*purse-deposit[^]*purse-take[^]*<\/div><\/div>/,'Deposit and Take stay together');
 assert.match(row,/Adjust Purse/,'GM tools stay at the end of the row');
 assert.equal((html.match(/id="agu-purse-amount"/g)??[]).length,1,'one form, not a second copy below');
 assert.match(html,/<option value="gp" selected>Gold<\/option>/,'Coin select shows the full name');
 assert.doesNotMatch(html,/<option value="ep"/,'no electrum while it is off');
 assert.deepEqual([...html.matchAll(/class="agu-coin__label">([^<]+)</g)].map(m=>m[1]),['Copper','Silver','Gold','Platinum']);
 assert.match(html,/aria-label="Gold: 1042"[^]*?<strong class="agu-coin__value">1042<\/strong>/,'number formatting unchanged');
 view.unmount();
 await set('electrumEnabled',true);
 const on=await mounted(gm);
 assert.match(on.html,/<option value="ep"\s*>Electrum<\/option>/);assert.match(on.html,/class="agu-coin__label">Electrum</);
 on.view.unmount();await set('electrumEnabled',false);
});

test('player embed: same row with their own character, no GM tools',async()=>{
 await set('playerAccessEnabled',true);await set('stashEnabled',true);
 const {html,view}=await mounted(alice);const row=headRow(html);
 assert.match(row,/<option value="wren" selected>\[TEST\] Wren \(3 gp\)<\/option>/);
 assert.match(row,/purse-deposit[^]*purse-take/);assert.doesNotMatch(row,/Adjust Purse/);
 view.unmount();console.error=origError;
});
