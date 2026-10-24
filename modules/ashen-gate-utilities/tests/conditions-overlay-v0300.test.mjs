// 0.30.0: the overlay shows a card for every player character, a card can be selected, and the header Apply / the chip
// remove buttons go through the existing permission-checked path. Mocked Foundry globals: proves the logic and the markup,
// not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,overlayCards,overlayControlState,OVERLAY_OTHER_PC_REASON} from '../scripts/core.mjs';

const gm={id:'gm',name:'GM',isGM:true,active:true};
const alice={id:'alice',name:'Alice',isGM:false,active:true};
const bob={id:'bob',name:'Bob',isGM:false,active:true};
const mk=(id,name,owner,statuses=[],type='character')=>{const a={id,name,type,img:'',statuses:new Set(statuses),effects:[],items:[],toggled:[],getFlag:()=>null,
  testUserPermission:(u,level)=>u.isGM||u.id===owner||level==='LIMITED',
  toggleStatusEffect:async(s,{active})=>{a.toggled.push([s,active]);if(active)a.statuses.add(s);else a.statuses.delete(s);}};return a;};
const wren=mk('a1','[TEST] Wren','alice',['prone']), ash=mk('b1','[TEST] Ash','bob'), quill=mk('c1','[TEST] Quill','carol'), innkeeper=mk('i1','[TEST] Innkeeper',null);
const users=[gm,alice,bob,{id:'carol',name:'Carol',isGM:false,active:true}];users.get=id=>users.find(u=>u.id===id);
const actors=[wren,ash,quill,innkeeper];actors.get=id=>actors.find(a=>a.id===id);
const settings=new Map(),handlers={once:new Map(),on:new Map()},sent=[];let socketHandler=null;
globalThis.HTMLElement=class {};
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(o){this.options=o;this.rendered=false;this.renders=0;this.element={style:{props:{},setProperty(k,v){this.props[k]=v;}}};}async render(){this.rendered=true;this.renders++;return this;}async close(){this.rendered=false;this._onClose?.({});}}}}};
globalThis.game={user:gm,users,actors,modules:new Map([[ID,{id:ID,active:true}]]),tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,o)=>settings.set(`${ns}.${key}`,{value:o.default,onChange:o.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}},
 socket:{emit:(ch,msg)=>sent.push([ch,msg]),on:(ch,fn)=>{socketHandler=fn;}}};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[{id:'prone',name:'Prone'},{id:'blinded',name:'Blinded'},{id:'exhaustion',name:'Exhaustion'}]};
globalThis.ui={notifications:{info:()=>{},warn:()=>{},error:()=>{}}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>handlers.on.set(k,fn),off:()=>{},callAll:()=>{}};
await import('../scripts/main.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api.conditions;
await game.settings.set(ID,'playerAccessEnabled',true);
const reset=()=>{wren.statuses=new Set(['prone']);ash.statuses=new Set();quill.statuses=new Set();innkeeper.statuses=new Set();for(const a of actors)a.toggled.length=0;sent.length=0;};
const lastReceipt=()=>sent.filter(([,m])=>m.type==='receipt').at(-1)?.[1];
const deliver=async msg=>{const was=game.user;game.user=gm;await socketHandler(msg,msg.userId);await new Promise(r=>setTimeout(r,5));game.user=was;};
const open=async user=>{game.user=user;const o=await api.openOverlay();o.selectedId=null;o.statusPick=null;return o;};
const disabledSelect=html=>/<select id="agu-ov-status"[^>]*\sdisabled/.test(html);
const disabledApply=html=>/<button[^>]*data-ov-apply[^>]*>/.exec(html)[0].includes(' disabled');

test('model: a card for every player character, empty ones included; a non-player character only when it has a condition',()=>{
 reset();
 const ids=c=>c.map(x=>x.actorId);
 assert.deepEqual(ids(overlayCards([wren,ash,quill,innkeeper],{users})),['a1','b1','c1']);
 innkeeper.statuses.add('prone');
 assert.deepEqual(ids(overlayCards([wren,ash,quill,innkeeper],{users})),['a1','b1','c1','i1']);
 assert.deepEqual(overlayCards([ash],{users})[0].conditions,[]);
 innkeeper.statuses.clear();
});
test('markup: every player character is a button card with aria-pressed; empty cards say No conditions; chips for the rest',async()=>{
 reset();const o=await open(alice);const html=await o._renderHTML();
 for(const n of ['[TEST] Wren','[TEST] Ash','[TEST] Quill'])assert.ok(html.includes(`<span class="agu-ov-name">${n}</span>`),`${n} shown`);
 assert.ok(!html.includes('Innkeeper'),'a character nobody plays and without conditions is not a card');
 assert.equal((html.match(/<button type="button" class="agu-ov-pick" data-ov-select data-actor="[^"]+" aria-pressed="false">/g)||[]).length,3);
 assert.equal((html.match(/<p class="agu-ov-none">No conditions<\/p>/g)||[]).length,2,'Ash and Quill are empty');
 assert.match(html,/<li class="agu-ov-chip"><span>Prone<\/span><button[^>]*data-ov-remove[^>]*data-status="prone"/);
 assert.ok(!html.includes('aria-pressed="true"'),'nothing selected yet');
 assert.match(html,/Select a character to change its conditions/);
 assert.ok(disabledSelect(html)&&disabledApply(html),'controls wait for a selection');
 await api.closeOverlay();
});
test('selection: click selects one card (aria-pressed, selected class), click again clears; the click is wired on the card button',async()=>{
 reset();const o=await open(alice);
 await o.selectCard('a1');let html=await o._renderHTML();
 assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);
 assert.match(html,/class="agu-ov-card is-selected"><button[^>]*data-actor="a1" aria-pressed="true"/);
 assert.match(html,/Changing conditions for \[TEST\] Wren\./);
 await o.selectCard('b1');html=await o._renderHTML();
 assert.match(html,/data-actor="b1" aria-pressed="true"/);assert.match(html,/data-actor="a1" aria-pressed="false"/);
 await o.selectCard('b1');html=await o._renderHTML();assert.ok(!html.includes('aria-pressed="true"'),'second click clears');
 assert.ok(o.renders>=3,'selecting re-renders');
 const btn={dataset:{actor:'c1'},listeners:{},addEventListener(e,f){this.listeners[e]=f;}};
 const content={innerHTML:'',querySelector:()=>null,querySelectorAll:s=>s==='[data-ov-select]'?[btn]:[],contains:()=>false,addEventListener(){}};
 o._replaceHTML(html,content);btn.listeners.click();assert.equal(o.selectedId,'c1');
 await api.closeOverlay();
});
test('controls by role: GM and controller can use them on any player character; an ordinary player only on her own',async()=>{
 reset();game.user=gm;await api.setController('bob',true);
 const state=async(user,id)=>{const o=await open(user);await o.selectCard(id);const html=await o._renderHTML();await api.closeOverlay();return html;};
 for(const [who,id] of [[gm,'a1'],[gm,'b1'],[gm,'c1'],[bob,'a1'],[bob,'c1'],[alice,'a1']]){
  const h=await state(who,id);assert.ok(!disabledSelect(h),`${who.id} on ${id}: select enabled`);assert.ok(!disabledApply(h),`${who.id} on ${id}: Apply enabled`);
 }
 for(const id of ['b1','c1']){
  const h=await state(alice,id);assert.ok(disabledSelect(h)&&disabledApply(h),`alice on ${id}: both disabled`);
  assert.ok(h.includes(OVERLAY_OTHER_PC_REASON.replace("'",'&#39;'))||h.includes(OVERLAY_OTHER_PC_REASON),'the reason is shown');
  assert.match(h,/id="agu-ov-target"[^>]*role="status"/);assert.match(h,/aria-describedby="agu-ov-target"/,'controls point at the reason');
  assert.ok(h.includes(`data-actor="${id}" aria-pressed="true"`),'the card still selects');
 }
 const o=await open(alice);await o.selectCard('a1');o.statusPick='prone';const h=await o._renderHTML();
 assert.ok(!disabledSelect(h)&&disabledApply(h),'Apply is off when the pick is already on the character');assert.match(h,/already has that condition/);
 await api.closeOverlay();
 assert.equal(overlayControlState({actor:ash,user:alice,users}).enabled,false);
 assert.equal(overlayControlState({actor:ash,user:alice,controllers:{alice:true},users}).enabled,true);
 assert.equal(overlayControlState({actor:wren,user:alice,playerAccess:false,users}).enabled,false);
 assert.equal(overlayControlState({actor:null,user:gm,users}).enabled,false);
 game.user=gm;await api.setController('bob',false);
});
test('the select offers the shared list (api.choices), Exhaustion included, one option selected',async()=>{
 reset();const o=await open(gm);const html=await o._renderHTML();
 const ids=[...html.matchAll(/<option value="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(ids,api.choices().map(c=>c.id));assert.ok(ids.includes('exhaustion'));
 assert.equal((html.match(/<option [^>]*selected/g)||[]).length,1);
 await api.closeOverlay();
});
test('GM applies from the header: the existing apply path runs on the GM client',async()=>{
 reset();const o=await open(gm);await o.selectCard('b1');o.statusPick='blinded';
 await o.applySelected();assert.deepEqual(ash.toggled,[['blinded',true]]);
 o.statusPick='exhaustion';await o.applySelected();assert.ok(ash.statuses.has('exhaustion'),'Exhaustion applies like the tracker');
 await api.closeOverlay();
});
test('a condition controller applies to and removes from another player\'s character; the GM client re-checks',async()=>{
 reset();game.user=gm;await api.setController('bob',true);
 const o=await open(bob);await o.selectCard('a1');o.statusPick='blinded';
 const pending=o.applySelected();const [,req]=sent.at(-1);
 assert.equal(req.type,'apply-status');assert.equal(req.userId,'bob');assert.equal(req.actorId,'a1');assert.deepEqual(wren.toggled,[],'the player client writes nothing');
 await deliver(req);assert.equal(lastReceipt().ok,true);assert.deepEqual(wren.toggled,[['blinded',true]]);
 game.user=bob;await socketHandler(lastReceipt(),'gm');assert.match(await pending,/Applied Blinded to \[TEST\] Wren/);
 const html=await o._renderHTML();assert.match(html,/data-ov-remove data-actor="a1" data-status="blinded"/,'chip remove shown to the controller');
 const removal=api.remove('a1','blinded');const [,rm]=sent.at(-1);assert.equal(rm.type,'remove-status');
 await deliver(rm);assert.equal(lastReceipt().ok,true);assert.ok(!wren.statuses.has('blinded'));
 game.user=bob;await socketHandler(lastReceipt(),'gm');await removal;
 await api.closeOverlay();game.user=gm;await api.setController('bob',false);
});
test('an ordinary player: own character goes to the GM; another player\'s is refused before anything is sent, and the GM client refuses a forged request',async()=>{
 reset();const o=await open(alice);
 await o.selectCard('a1');o.statusPick='blinded';
 const pending=o.applySelected();const [,req]=sent.at(-1);assert.equal(req.actorId,'a1');
 await deliver(req);game.user=alice;await socketHandler(lastReceipt(),'gm');await pending;assert.ok(wren.statuses.has('blinded'));
 const before=sent.length;
 await o.selectCard('b1');o.statusPick='prone';
 await assert.rejects(o.applySelected(),/another player's character/);
 assert.equal(sent.length,before,'nothing was sent for the refused apply');assert.deepEqual(ash.toggled,[]);
 const html=await o._renderHTML();assert.ok(!html.includes('data-ov-remove data-actor="b1"'));
 await deliver({type:'apply-status',requestId:'forged',userId:'alice',actorId:'b1',statusId:'prone'});
 assert.equal(lastReceipt().ok,false);assert.match(lastReceipt().message,/another player's character/);assert.deepEqual(ash.toggled,[]);
 await api.closeOverlay();game.user=gm;
});
test('Player Access off: the overlay is refused for players, as before; the GM keeps it',async()=>{
 reset();game.user=gm;await game.settings.set(ID,'playerAccessEnabled',false);
 game.user=alice;await assert.rejects(api.openOverlay(),/hidden/);
 const g=await open(gm);assert.ok((await g._renderHTML()).includes('data-ov-select'));await api.closeOverlay();
 await game.settings.set(ID,'playerAccessEnabled',true);game.user=gm;
});
