// 0.27.1: Space on a focused Utilities control pressed Foundry's pause keybinding instead of the button, and focus fell to
// the page after Choose Actor… and Add item…. A tiny mocked DOM (bubbling with stopPropagation, the browser's default
// activation: Enter clicks a button on keydown, Space on keyup unless the keydown was cancelled, Space types in a field)
// and a window-level stand-in for Foundry's Space → pause binding, which cancels the key as Foundry does. A modal dialog
// makes the rest of the page refuse focus until it has finished closing. Mocked: proves the logic, not live Foundry.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID} from '../scripts/core.mjs';
import {refocusSoon,guardKeys,stopActivationKeys} from '../scripts/ui-parts.mjs';

// ---- Mocked DOM ----
class El{
 constructor(doc,tag,attrs={},parent=null){this.doc=doc;this.tagName=tag.toUpperCase();this.attrs=new Map(Object.entries(attrs));this.kids=[];this.parentElement=null;this.listeners={};this.disabled=false;this.value='';this.clicks=0;this.innerHTML='';if(parent)parent.append(this);}
 append(...k){for(const c of k){c.parentElement=this;this.kids.push(c);}return this;}
 remove(){const p=this.parentElement;if(p)p.kids=p.kids.filter(k=>k!==this);this.parentElement=null;if(this.doc.activeElement===this||this.contains(this.doc.activeElement))this.doc.activeElement=this.doc.body;}
 get id(){return this.attrs.get('id')??'';}
 get attributes(){return [...this.attrs].map(([name,value])=>({name,value}));}
 get dataset(){return Object.fromEntries([...this.attrs].filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v]));}
 get classList(){const self=this;return {contains:c=>(self.attrs.get('class')??'').split(/\s+/).includes(c),add(){},remove(){}};}
 get isConnected(){let e=this;while(e.parentElement)e=e.parentElement;return e===this.doc.body;}
 getAttribute(k){return this.attrs.has(k)?this.attrs.get(k):null;}
 setAttribute(k,v){this.attrs.set(k,String(v));}
 addEventListener(t,fn,o){if(o?.signal?.aborted)return;(this.listeners[t]??=[]).push(fn);}
 removeEventListener(t,fn){this.listeners[t]=(this.listeners[t]??[]).filter(f=>f!==fn);}
 matches(sel){return sel.split(',').some(s=>matchOne(this,s.trim()));}
 closest(sel){for(let e=this;e;e=e.parentElement)if(e.matches(sel))return e;return null;}
 contains(x){for(let e=x;e;e=e.parentElement)if(e===this)return true;return false;}
 *all(){for(const k of this.kids){yield k;yield* k.all();}}
 querySelectorAll(sel){return [...this.all()].filter(e=>e.matches(sel));}
 querySelector(sel){return this.querySelectorAll(sel)[0]??null;}
 /** Focus is refused while disabled, detached, or outside an open modal dialog (the page behind it is inert). */
 focus(){const d=this.doc;if(this.disabled||!this.isConnected||(d.modal&&!d.modal.contains(this)))return;d.activeElement=this;}
}
function matchOne(el,sel){
 const parts=sel.match(/^[a-z]+|\.[\w-]+|\[[^\]]+\]/gi)??[];
 if(parts.join('')!==sel)throw Error(`mock DOM cannot match "${sel}"`);
 return parts.every(p=>{
  if(p.startsWith('.'))return el.classList.contains(p.slice(1));
  if(p.startsWith('[')){const [,n,v]=p.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/)??[];return v===undefined?el.attrs.has(n):el.getAttribute(n)===v;}
  return el.tagName===p.toUpperCase();
 });
}
const doc={activeElement:null,modal:null,paused:false,windowListeners:{}};
doc.body=new El(doc,'body');doc.activeElement=doc.body;
// Foundry's Space → pause binding: on the window, it toggles the pause and cancels the key.
doc.windowListeners.keydown=[ev=>{if(ev.key===' '){doc.paused=!doc.paused;ev.preventDefault();}}];
/** Bubbles from the target to the window, honouring stopPropagation; returns the event. */
function dispatch(target,type,props={}){
 const ev={type,target,defaultPrevented:false,propagationStopped:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.propagationStopped=true;},...props};
 for(let e=target;e&&!ev.propagationStopped;e=e.parentElement)for(const fn of [...(e.listeners[type]??[])])fn(ev);
 if(!ev.propagationStopped)for(const fn of doc.windowListeners[type]??[])fn(ev);
 return ev;
}
const click=el=>{el.clicks++;return dispatch(el,'click');};
/** The browser's part of one key press on the focused element. */
function press(el,key){
 const down=dispatch(el,'keydown',{key,code:key===' '?'Space':key});
 const isButton=el.tagName==='BUTTON'||el.getAttribute('role')==='tab';
 if(!down.defaultPrevented){
  if(key==='Enter'&&isButton&&!el.disabled)click(el);
  if(key===' '&&(el.tagName==='INPUT'||el.tagName==='TEXTAREA'))el.value+=' ';
 }
 const up=dispatch(el,'keyup',{key,code:key===' '?'Space':key});
 if(key===' '&&isButton&&!down.defaultPrevented&&!up.defaultPrevented&&!el.disabled)click(el);
 return {down,up};
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// ---- Mocked Foundry (as in keyboard-add-v0270) ----
const handlers={once:new Map(),on:new Map()};const settings=new Map();const sent=[];
globalThis.HTMLElement=class {};
let nextId=0;const freshId=()=>`id${String(++nextId).padStart(14,'0')}`;
// The kit's dialogs run on DialogV2: each one is modal while open and still closing for 30 ms after it resolves; the
// browser then hands focus back to the button that opened it, which is disabled or gone, so it lands on the page.
const dialogs=[];let answers=[];
function modal(o){
 const opener=doc.activeElement,win=new El(doc,'dialog',{class:'application dialog ag-app ag-dialog'},doc.body),field=new El(doc,'select',{name:'pick'},win);
 doc.modal=win;field.focus();dialogs.push(o);
 return ()=>{setTimeout(()=>{win.remove();doc.modal=null;opener.focus?.();if(doc.activeElement===field||!doc.activeElement?.isConnected)doc.activeElement=doc.body;},30);};
}
const DialogV2={
 wait:async o=>{const close=modal(o);await sleep(1);const a=answers.shift();close();if(a===null||a===undefined)return o.buttons[0].callback();return o.buttons.at(-1).callback(null,{form:{elements:[{name:'pick',value:a}]}});},
 prompt:async o=>{const close=modal(o);await sleep(1);close();return null;}
};
globalThis.foundry={utils:{randomID:freshId},applications:{api:{DialogV2,ApplicationV2:class{constructor(o){this.options=o;this.rendered=false;}async render(){this.rendered=true;return this;}async close(){this.rendered=false;}}}}};
const gm={id:'gm',name:'GM',isGM:true,active:true};
const docs=new Map();
function mkItems(actor){const m=new Map();return {get:id=>m.get(id),get size(){return m.size;},get contents(){return [...m.values()];},[Symbol.iterator]:()=>m.values(),
 add(data){const id=data._id??freshId();const item={...structuredClone(data),id,documentName:'Item',parent:actor,toObject(){const {id:_i,documentName:_d,parent:_p,uuid:_u,toObject:_t,...rest}=this;return structuredClone({...rest,_id:this.id});}};
  item.uuid=actor?`Actor.${actor.id}.Item.${id}`:`Item.${id}`;m.set(id,item);docs.set(item.uuid,item);return item;},
 remove(id){const i=m.get(id);m.delete(id);if(i)docs.delete(i.uuid);return i;}};}
function mkActor(id,name,owner,{flags={},type}={}){const a={id,name,uuid:`Actor.${id}`,img:`${id}.webp`,type:type??(owner?'character':'npc'),documentName:'Actor',statuses:new Set(),effects:[],flags,
 getFlag:(ns,k)=>flags[ns]?.[k],testUserPermission:u=>u.isGM||u.id===owner,update:async()=>{},
 async createEmbeddedDocuments(t,list,o={}){return list.map(d=>a.items.add(o.keepId?d:{...d,_id:undefined}));},
 async deleteEmbeddedDocuments(t,ids){return ids.map(i=>a.items.remove(i));}};a.items=mkItems(a);docs.set(a.uuid,a);return a;}
const stash=mkActor('stash','Party Stash',null,{flags:{[ID]:{partyStash:true}}});
const pcA=mkActor('pcA','[TEST] Wren','alice'),brin=mkActor('brin','[TEST] Brin Tallow',null,{type:'npc'});
pcA.items.add({name:'[TEST] Torch',type:'loot',system:{quantity:1}});
const users=[gm];users.get=id=>users.find(u=>u.id===id);
const actors=[stash,pcA,brin];actors.get=id=>actors.find(a=>a.id===id);
const worldItems=mkItems(null);worldItems.add({name:'[TEST] Lantern',type:'loot',system:{quantity:1}});
globalThis.fromUuid=async u=>docs.get(u)??null;globalThis.fromUuidSync=u=>docs.get(u)??null;
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{OBSERVER:2}};
globalThis.game={user:gm,users,actors,items:worldItems,folders:[],journal:[],time:{worldTime:0},modules:new Map([[ID,{id:ID,active:true}]]),tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,o)=>settings.set(`${ns}.${key}`,{value:o.default,onChange:o.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}},
 socket:{emit:(ch,msg)=>sent.push(msg),on:()=>{}}};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[],Item:{typeLabels:{loot:'Loot'}}};
const notes=[];globalThis.ui={notifications:{info:m=>notes.push(['info',m]),warn:m=>notes.push(['warn',m]),error:m=>notes.push(['error',m])}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>handlers.on.set(k,fn),off:()=>{},callAll:()=>{}};
globalThis.ChatMessage={create:async m=>m,getSpeaker:()=>({})};
await import('../scripts/main.mjs');
const shopsMod=await import('../scripts/shops.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api;
await game.settings.set(ID,'playerAccessEnabled',true);await game.settings.set(ID,'stashEnabled',true);
globalThis.document=doc;

/**
 * The Utilities window with fake content: _replaceHTML (which installs the key guard) runs on every render, then the
 * render puts in fresh buttons, as a real re-render does, each clicking through the window's own handle.
 */
async function windowWith(buttons){
 const app=await api.stash.open();app.tab='inventory';app.stashTab='items';
 const content=new El(doc,'section',{class:'window-content'},doc.body);
 const build=()=>{for(const k of [...content.kids])k.remove();
  for(const [action,label] of buttons){const b=new El(doc,'button',{type:'button',class:'ag-btn ag-btn--sm','data-action':action},content);b.label=label;b.addEventListener('click',()=>{app.handle(action,b,content).catch(e=>notes.push(['error',e.message]));});}
  const input=new El(doc,'input',{type:'search',id:'agu-stash-search'},content);const tab=new El(doc,'button',{type:'button',role:'tab','data-tab':'items'},content);const plain=new El(doc,'div',{class:'agu-note'},content);
  return {input,tab,plain};};
 app.render=async()=>{app._replaceHTML('',content);return app;};
 app._replaceHTML('',content);
 const btn=action=>content.querySelector(`button[data-action="${action}"]`);
 return {app,content,btn,extras:()=>({input:content.querySelector('input'),tab:content.querySelector('[role="tab"]'),plain:content.querySelector('div')}),build};
}
// The real bind() needs the real HTML; here it only has to not throw, and the buttons are put in by hand after it.
const realBind=Object.getPrototypeOf(await api.stash.open()).bind;
let currentBuild=null;
Object.getPrototypeOf(await api.stash.open()).bind=function(root){try{realBind.call(this,root);}catch{}currentBuild?.();};
async function setup(buttons){const w=await windowWith(buttons);currentBuild=w.build;w.build();return w;}
const reset=()=>{dialogs.length=0;answers=[];notes.length=0;doc.paused=false;};
const BUTTONS=[['stash-add','Add to stash…'],['shop-add-item','Add item…'],['shop-merchant-pick','Choose Actor…'],['help','Help']];
const shopReady=app=>{app.shopDraft=shopsMod.draftFrom(null);app.shopDirty=false;};

test('without the guard the stand-in shows the bug: Space on a button pauses and the button never clicks',()=>{
 reset();const root=new El(doc,'div',{},doc.body),b=new El(doc,'button',{type:'button'},root);b.focus();
 press(b,' ');assert.equal(doc.paused,true);assert.equal(b.clicks,0);root.remove();
});
test('Space and Enter on Add to stash…, Add item…, Choose Actor… (and a tab, a select) press it once and never reach the pause binding',async()=>{
 const {app,btn,extras}=await setup(BUTTONS);
 for(const [action] of BUTTONS.slice(0,3))for(const key of [' ','Enter']){
  reset();shopReady(app);answers=[null,null];const b=btn(action);b.focus();
  const {down,up}=press(b,key);
  assert.equal(down.propagationStopped,true,`${action} ${JSON.stringify(key)} keydown stays in the window`);
  assert.equal(up.propagationStopped,true,'and so does its keyup');
  assert.equal(down.defaultPrevented,false,'the browser still presses the button');
  assert.equal(b.clicks,1,`${action} pressed once by ${JSON.stringify(key)}`);
  assert.equal(doc.paused,false,'the game is not paused');
  await sleep(120);
  assert.equal(dialogs.length,1,`${action}: its picker opened once`);
 }
 const {tab}=extras();reset();tab.focus();press(tab,' ');assert.equal(tab.clicks,1);assert.equal(doc.paused,false);
 const sel=new El(doc,'select',{id:'agu-stash-target'},btn('stash-add').parentElement);sel.focus();reset();
 assert.equal(press(sel,' ').down.propagationStopped,true);assert.equal(doc.paused,false);sel.remove();
});
test('Space in a text field still types a space (not swallowed) and does not pause; other keys and plain text pass through',async()=>{
 const {extras}=await setup(BUTTONS);const {input,plain}=extras();
 reset();input.focus();const {down}=press(input,' ');press(input,' ');
 assert.equal(input.value,'  ','two spaces typed');assert.equal(down.defaultPrevented,false);assert.equal(doc.paused,false);
 reset();const a=dispatch(input,'keydown',{key:'a'});assert.equal(a.propagationStopped,false,'only Space and Enter are held back');
 reset();plain.focus();press(plain,' ');assert.equal(doc.paused,true,'outside a control (no focus on a Utilities control) Foundry\'s Space still pauses');
});
test('the guard is installed once per window, however often it re-renders, and only for its own controls',async()=>{
 const {app,content}=await setup(BUTTONS);
 await app.render();await app.render();
 assert.equal(content.listeners.keydown.length,1);assert.equal(content.listeners.keyup.length,1);
 assert.equal(guardKeys(content),false,'a second guard is refused');
 const other=new El(doc,'button',{type:'button'},doc.body);
 assert.equal(stopActivationKeys(content,{key:' ',target:other,stopPropagation(){throw Error('not ours');}}),false,'a control outside the window is left alone');
 other.remove();
});
test('the Party stash embed holds Space/Enter on its controls too',async()=>{
 reset();answers=[null];const el=new El(doc,'div',{},doc.body);
 const m=api.embed.mount(el,{});await sleep(5);
 const b=new El(doc,'button',{type:'button','data-action':'stash-add'},el);b.focus();
 const {down}=press(b,' ');assert.equal(down.propagationStopped,true);assert.equal(doc.paused,false);
 await sleep(150);assert.equal(dialogs.length,1,'it pressed Add to stash… once');
 m.unmount();el.remove();
});
for(const outcome of ['confirm','cancel']){
 test(`focus returns to the button after its dialog closes (${outcome}), even when the view re-rendered`,async()=>{
  const {app,btn}=await setup(BUTTONS);
  const pick={'stash-add':['pcA',pcA.items.contents[0]?.uuid],'shop-add-item':['world',worldItems.contents[0].uuid],'shop-merchant-pick':[brin.uuid],'help':[]};
  for(const [action] of BUTTONS){
   reset();shopReady(app);answers=outcome==='confirm'?[...pick[action]]:[null];
   const before=btn(action);before.focus();press(before,'Enter');
   await sleep(200);
   const now=btn(action);
   assert.equal(doc.modal,null,'the dialog is gone');
   assert.equal(doc.activeElement,now,`${action} (${outcome}): focus is back on its button, not the page`);
   assert.equal(notes.filter(n=>n[0]==='error').length,0,JSON.stringify(notes));
  }
 });
}
test('Choose Actor… confirm sets the merchant and Add item… adds the line (the focus fix changes no result)',async()=>{
 const {app,btn}=await setup(BUTTONS);
 reset();shopReady(app);answers=[brin.uuid];btn('shop-merchant-pick').focus();press(btn('shop-merchant-pick'),' ');await sleep(150);
 assert.equal(app.shopDraft.merchant.name,'[TEST] Brin Tallow');
 reset();answers=['world',worldItems.contents[0].uuid];btn('shop-add-item').focus();press(btn('shop-add-item'),' ');await sleep(150);
 assert.deepEqual(app.shopDraft.lines.map(l=>l.item.name),['[TEST] Lantern']);
 app.shopDraft=null;
});
test('refocusSoon never takes focus back once the user has moved on, and gives up when the control is gone',async()=>{
 const root=new El(doc,'div',{},doc.body),b=new El(doc,'button',{type:'button','data-action':'x'},root),other=new El(doc,'input',{},doc.body);
 const win=new El(doc,'dialog',{class:'ag-dialog'},doc.body);doc.modal=win;doc.activeElement=win;
 refocusSoon(root,['button[data-action="x"]'],{every:10});
 other.focus();// refused: the modal is still open
 doc.modal=null;win.remove();other.focus();// the user clicks into another field as the dialog closes
 await sleep(60);assert.equal(doc.activeElement,other,'focus stays where the user put it');
 doc.activeElement=doc.body;refocusSoon(root,['button[data-action="gone"]'],{every:10});await sleep(30);
 assert.equal(doc.activeElement,doc.body,'nothing to focus: left alone');
 doc.modal=new El(doc,'dialog',{class:'ag-dialog'},doc.body);refocusSoon(root,['button[data-action="x"]'],{every:10,tries:3});await sleep(60);
 assert.notEqual(doc.activeElement,b,'a dialog that stays open: it stops after a few tries');
 doc.modal.remove();doc.modal=null;root.remove();other.remove();
});
