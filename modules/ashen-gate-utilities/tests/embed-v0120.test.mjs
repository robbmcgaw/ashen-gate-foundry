// 0.12.0: api.embed.mount(element, {actorId, mode}). Mocked Foundry globals and a fake element:
// proves the gates, rendering and action routing, not the live UI inside another module's window.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID} from '../scripts/core.mjs';

const handlers={once:new Map(),on:new Map()};const settings=new Map();const notes=[];const sent=[];
globalThis.HTMLElement=class {};
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(o){this.options=o;}async render(){return this;}async close(){}}}}};
const gm={id:'gm',name:'GM',isGM:true,active:true},alice={id:'alice',name:'Alice',isGM:false,active:true};
const docs=new Map();
function mkItems(actor){const m=new Map();return {get:id=>m.get(id),get size(){return m.size;},[Symbol.iterator]:()=>m.values(),
 add(data){const item={...structuredClone(data),id:data._id??`i${docs.size+1}`,documentName:'Item',parent:actor,sheet:{render:()=>notes.push(['sheet',data.name])},
  toObject(){return {_id:this.id,name:this.name,type:this.type,system:structuredClone(this.system)};},async delete(){m.delete(this.id);docs.delete(this.uuid);}};
  item.uuid=`Actor.${actor.id}.Item.${item.id}`;m.set(item.id,item);docs.set(item.uuid,item);return item;}};}
function mkActor(id,name,owner,flags={},system={}){const a={id,name,type:owner?'character':'npc',documentName:'Actor',statuses:new Set(),effects:[],flags,system,
 getFlag:(ns,k)=>flags[ns]?.[k],testUserPermission:(u,level)=>u.isGM||u.id===owner||level==='LIMITED',
 createEmbeddedDocuments:async(t,list)=>list.map(d=>a.items.add(d)),update:async d=>{a.lastUpdate=d;}};a.items=mkItems(a);return a;}
const stash=mkActor('stash','Ashen Gate | Party Stash',null,{[ID]:{partyStash:true}},{currency:{cp:0,sp:5,ep:0,gp:42,pp:0}});
const wren=mkActor('wren','[TEST] Wren','alice',{},{currency:{cp:0,sp:0,ep:0,gp:3,pp:0}}),ash=mkActor('ash','[TEST] Ash','bob',{},{currency:{cp:0,sp:0,ep:0,gp:0,pp:0}});
stash.items.add({_id:'rope',name:'[TEST] Rope',type:'loot',img:'rope.webp',system:{quantity:2}});
stash.items.add({_id:'dagger',name:'[TEST] Dagger',type:'weapon',img:'dagger.webp',system:{quantity:1}});
const users=[gm,alice];users.get=id=>users.find(u=>u.id===id);
const actors=[stash,wren,ash];actors.get=id=>actors.find(a=>a.id===id);
globalThis.fromUuid=async u=>docs.get(u)??null;globalThis.fromUuidSync=u=>docs.get(u)??null;
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{OBSERVER:2}};
globalThis.game={user:gm,users,actors,time:{worldTime:0},modules:new Map([[ID,{id:ID,active:true}]]),tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,o)=>settings.set(`${ns}.${key}`,{value:o.default,onChange:o.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,
  set:async(ns,key,v)=>{const s=settings.get(`${ns}.${key}`);s.value=v;s.onChange?.(v);}},
 socket:{emit:(...a)=>sent.push(a),on:()=>{}}};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[],Item:{typeLabels:{loot:'Loot',weapon:'Weapon'}}};
globalThis.ui={notifications:{info:m=>notes.push(['info',m]),warn:m=>notes.push(['warn',m]),error:m=>notes.push(['error',m])}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>{if(!handlers.on.has(k))handlers.on.set(k,[]);handlers.on.get(k).push(fn);},off:()=>{}};
globalThis.document={querySelectorAll:()=>[],activeElement:null};
const origError=console.error;console.error=()=>{};
await import('../scripts/main.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api;
const set=(k,v)=>game.settings.set(ID,k,v);
const tick=()=>new Promise(r=>setTimeout(r,0));

/** Just enough of a DOM element: listeners (with AbortSignal), innerHTML, classList, and querySelector by id from the HTML. */
function fakeElement(){
 const listeners=[];
 const el={innerHTML:'',isConnected:true,classes:new Set(),listeners,
  classList:{add:(...c)=>c.forEach(x=>el.classes.add(x)),remove:(...c)=>c.forEach(x=>el.classes.delete(x))},
  addEventListener(type,fn,{signal}={}){const l={type,fn};listeners.push(l);signal?.addEventListener('abort',()=>listeners.splice(listeners.indexOf(l),1));},
  contains:()=>true,
  querySelector(sel){const id=sel.startsWith('#')?sel.slice(1):null;if(!id)return null;
   const m=el.innerHTML.match(new RegExp(`id="${id}"[^>]*`));if(!m)return null;
   const sel2=el.innerHTML.slice(el.innerHTML.indexOf(`id="${id}"`)).match(/<option value="([^"]*)" selected>/);
   return {id,value:el.values?.[id]??(sel2?sel2[1]:(m[0].match(/value="([^"]*)"/)?.[1]??''))};},
  fire(type,target){for(const l of listeners.filter(x=>x.type===type))l.fn({target,stopPropagation(){},preventDefault(){}});}};
 return el;
}
const button=(action,data={})=>{const b={dataset:{action,...data},disabled:false};b.closest=sel=>sel==='[data-action]'?b:null;return b;};

test('GM: mounts the purse and items, adds the style classes, preselects the character',async()=>{
 game.user=gm;await set('stashEnabled',false);
 const el=fakeElement();const view=api.embed.mount(el,{actorId:'ash',mode:'stash'});await tick();
 assert.deepEqual([...el.classes].sort(),['ag-utilities','agu-embed']);
 assert.match(el.innerHTML,/Party purse/);assert.match(el.innerHTML,/\[TEST\] Rope/);assert.match(el.innerHTML,/\[TEST\] Dagger/);
 assert.match(el.innerHTML,/id="agu-stash-target"><option value="ash" selected>|<option value="ash" selected>\[TEST\] Ash/,'GM sees the stash even while it is off for players');
 assert.match(el.innerHTML,/Adjust Purse/);
 assert.equal(typeof view.refresh,'function');view.unmount();
 assert.equal(el.innerHTML,'');assert.equal(el.listeners.length,0,'listeners removed');assert.equal(el.classes.size,0);
});

test('players: hidden or stash off shows only a note (no items); allowed when both are on, owned character preselected',async()=>{
 game.user=alice;await set('playerAccessEnabled',false);await set('stashEnabled',true);
 const el=fakeElement();const view=api.embed.mount(el,{actorId:'wren'});await tick();
 assert.match(el.innerHTML,/hidden by the GM/);assert.doesNotMatch(el.innerHTML,/Rope|purse/i);
 await set('playerAccessEnabled',true);await set('stashEnabled',false);await tick();
 assert.match(el.innerHTML,/turned the party stash off/,'refreshes itself when the settings change');assert.doesNotMatch(el.innerHTML,/Rope/);
 await set('stashEnabled',true);await tick();
 assert.match(el.innerHTML,/\[TEST\] Rope/);
 assert.match(el.innerHTML,/<option value="wren" selected>/);
 assert.doesNotMatch(el.innerHTML,/value="ash"/,'players only get their own characters');
 assert.doesNotMatch(el.innerHTML,/Adjust Purse/,'no GM controls for players');
 view.unmount();
});

test('a player Take is gated in the action, not just the button: refused while the stash is off',async()=>{
 game.user=alice;await set('playerAccessEnabled',true);await set('stashEnabled',true);
 const el=fakeElement();const view=api.embed.mount(el,{actorId:'wren'});await tick();
 await set('stashEnabled',false);notes.length=0;sent.length=0;
 el.fire('click',button('stash-take',{item:'rope'}));await tick();await tick();
 assert.ok(notes.some(([k,m])=>k==='error'&&/turned the party stash off/.test(m)),JSON.stringify(notes));
 assert.equal(sent.length,0,'nothing sent to the GM client');
 view.unmount();
});

test('only stash actions run from the embed; window-only actions (history clear, stash toggle) are ignored',async()=>{
 game.user=gm;await set('stashEnabled',true);
 const el=fakeElement();const view=api.embed.mount(el,{actorId:'wren'});await tick();
 el.fire('click',button('toggle-stash'));await tick();
 assert.equal(game.settings.get(ID,'stashEnabled'),true,'toggle-stash ignored');
 view.unmount();
});

test('GM Take moves the item into the preselected character through the normal withdraw',async()=>{
 game.user=gm;await set('stashEnabled',true);
 const el=fakeElement();const view=api.embed.mount(el,{actorId:'wren'});await tick();
 el.fire('click',button('stash-take',{item:'dagger'}));
 for(let i=0;i<10;i++)await tick();
 assert.equal(stash.items.get('dagger'),undefined,'left the stash');
 assert.ok([...wren.items].some(i=>i.name==='[TEST] Dagger'),'arrived on Wren');
 assert.doesNotMatch(el.innerHTML,/\[TEST\] Dagger/,'embed refreshed');
 view.unmount();
});

test('open item, search and an element that left the page',async()=>{
 game.user=gm;await set('stashEnabled',true);
 const el=fakeElement();api.embed.mount(el,{});await tick();
 notes.length=0;
 const opener={dataset:{openItem:'rope'},closest:sel=>sel==='[data-open-item]'?opener:null};
 el.fire('click',opener);
 assert.deepEqual(notes,[['sheet','[TEST] Rope']]);
 el.fire('input',{id:'agu-stash-search',value:'zzz'});await tick();
 assert.match(el.innerHTML,/No items match/);
 el.isConnected=false;
 await set('stashEnabled',true);await tick();
 assert.equal(el.listeners.length,0,'unmounted itself once detached');
});

test('bad arguments throw clearly',()=>{
 assert.throws(()=>api.embed.mount(null),/DOM element/);
 assert.throws(()=>api.embed.mount(fakeElement(),{mode:'history'}),/Unknown embed mode/);
 assert.deepEqual(api.embed.modes,['stash']);
 console.error=origError;
});
