// 0.38.0: the overlay lists the viewer's own character(s) first and has a Self / Party switch (display only). Mocked Foundry
// globals: proves ordering, filtering, persistence, markup and wiring, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID} from '../scripts/core.mjs';
import {isOwnCharacter, orderOwnFirst, overlayActors, hasOwnCharacter, effectiveScope, keepSelection, normalizeScope, OVERLAY_DEFAULT_WIDTH, OVERLAY_DEFAULT_HEIGHT} from '../scripts/overlay-scope.mjs';
import {pickerDoc} from './picker-dom.mjs';

const gm={id:'gm',name:'GM',isGM:true,active:true};
const alice={id:'alice',name:'Alice',isGM:false,active:true};
const bob={id:'bob',name:'Bob',isGM:false,active:true};
const carol={id:'carol',name:'Carol',isGM:false,active:true};
const mk=(id,name,owners,statuses=[],extra={})=>{const a={id,name,type:'character',img:'',statuses:new Set(statuses),effects:[],items:[],toggled:[],getFlag:()=>null,
  testUserPermission:(u,level)=>u.isGM||owners.includes(u.id)||level==='LIMITED',
  toggleStatusEffect:async(s,{active})=>{a.toggled.push([s,active]);if(active)a.statuses.add(s);else a.statuses.delete(s);},...extra};return a;};
const ash=mk('b1','[TEST] Ash',['bob']), moss=mk('d1','[TEST] Moss',['alice']), quill=mk('c1','[TEST] Quill',['carol']), wren=mk('a1','[TEST] Wren',['alice']);
const backup=mk('z1','[TEST] Wren - level 2',['alice'],[],{flags:{'ashen-gate-character-hub':{levelBackup:true}}});
const users=[gm,alice,bob,carol];users.get=id=>users.find(u=>u.id===id);
const actors=[ash,moss,quill,wren,backup];actors.get=id=>actors.find(a=>a.id===id);
const settings=new Map(),handlers={once:new Map(),on:new Map()};
globalThis.HTMLElement=class {};
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(o){this.options=o;this.rendered=false;this.element={style:{setProperty(){}}};}async render(){this.rendered=true;return this;}async close(){this.rendered=false;this._onClose?.({});}}}}};
globalThis.game={user:gm,users,actors,modules:new Map([[ID,{id:ID,active:true}]]),tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,o)=>settings.set(`${ns}.${key}`,{value:o.default,onChange:o.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}},
 socket:{emit:()=>{},on:()=>{}}};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[{id:'prone',name:'Prone'},{id:'blinded',name:'Blinded'}]};
globalThis.ui={notifications:{info:()=>{},warn:()=>{},error:()=>{}}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>handlers.on.set(k,fn),off:()=>{},callAll:()=>{}};
await import('../scripts/main.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api.conditions;
await game.settings.set(ID,'playerAccessEnabled',true);
const names=html=>[...html.matchAll(/<span class="agu-ov-name">([^<]+)<\/span>/g)].map(m=>m[1].replace('[TEST] ',''));
const open=async(user,scope='party')=>{game.user=user;await game.settings.set(ID,'overlayScope',scope);const o=await api.openOverlay();o.selectedId=null;o.statusPick=null;return o;};
const applyOff=html=>/<button[^>]*data-ov-apply[^>]*>/.exec(html)[0].includes(' disabled');
const ids=l=>l.map(a=>a.id);

test('ordering: the assigned character first, then the other owned ones, then the rest in their existing order', () => {
  const list=[ash,moss,quill,wren];
  assert.deepEqual(ids(orderOwnFirst(list,{...alice,character:wren})),['a1','d1','b1','c1'],'assigned Wren, then Moss, then the rest');
  assert.deepEqual(ids(orderOwnFirst(list,alice)),['d1','a1','b1','c1'],'no assigned character: owned ones in list order');
  assert.deepEqual(ids(orderOwnFirst(list,bob)),['b1','d1','c1','a1']);
  assert.deepEqual(ids(orderOwnFirst(list,{id:'dan',isGM:false,testUserPermission:undefined})),ids(list),'owns nothing: unchanged');
  assert.deepEqual(ids(list),['b1','d1','c1','a1'],'the input is not mutated');
});
test('GM: no reordering, unless the GM has an assigned character; a GM never "owns" everything', () => {
  const list=[ash,moss,quill,wren];
  assert.deepEqual(ids(orderOwnFirst(list,gm)),ids(list));
  assert.deepEqual(ids(orderOwnFirst(list,{...gm,character:quill})),['c1','b1','d1','a1']);
  assert.equal(hasOwnCharacter(list,gm),false);assert.equal(hasOwnCharacter(list,{...gm,character:quill}),true);
  assert.equal(isOwnCharacter(backup,alice),false,'a level backup copy is never "mine"');
  assert.equal(isOwnCharacter({...ash,type:'npc'},bob),false);
});
test('scope: Party keeps everyone (own first); Self keeps only own characters; Self with none falls back to Party; junk is Party', () => {
  const list=[ash,moss,quill,wren];
  assert.deepEqual(ids(overlayActors(list,alice,'party')),['d1','a1','b1','c1']);
  assert.deepEqual(ids(overlayActors(list,alice,'self')),['d1','a1']);
  assert.deepEqual(ids(overlayActors(list,gm,'self')),ids(list),'a GM without a character cannot be in Self');
  assert.equal(effectiveScope('self',list,gm),'party');assert.equal(effectiveScope('self',list,alice),'self');
  assert.equal(normalizeScope('banana'),'party');assert.equal(normalizeScope(undefined),'party');assert.equal(normalizeScope('self'),'self');
});
test('selection: a pick outside Self falls back to the first own card; Party leaves it alone', () => {
  assert.equal(keepSelection('b1',['d1','a1'],'self'),'d1');
  assert.equal(keepSelection('a1',['d1','a1'],'self'),'a1');
  assert.equal(keepSelection('b1',['d1','a1','b1'],'party'),'b1');
  assert.equal(keepSelection(null,['d1'],'self'),null);
});
test('the overlay\'s default size constants are unchanged (240 wide, auto height)', async () => {
  assert.equal(OVERLAY_DEFAULT_WIDTH,240);assert.equal(OVERLAY_DEFAULT_HEIGHT,'auto');
  const o=await open(gm);assert.equal(o.options?.position?.width??o.constructor.DEFAULT_OPTIONS?.position?.width,240);
  assert.equal(o.constructor.DEFAULT_OPTIONS.position.height,'auto');await api.closeOverlay();
});

test('player view: own characters come first in the cards; the switch is shown, a small icon button with aria-pressed, a label and a tooltip', async () => {
  game.user={...alice,character:wren};const o=await open(game.user);const html=await o._renderHTML();
  assert.deepEqual(names(html),['Wren','Moss','Ash','Quill']);
  const btn=/<button[^>]*id="agu-ov-scope"[^>]*>/.exec(html)?.[0];assert.ok(btn,'toggle rendered');
  assert.match(btn,/aria-pressed="false"/);assert.match(btn,/aria-label="Show only my character"/);assert.match(btn,/data-tooltip="Show only my character"/);
  assert.match(btn,/class="ag-btn ag-btn--icon ag-btn--sm agu-ov-scope"/);
  assert.match(html,/<div class="agu-ov-top">\s*<button[^>]*agu-ov-scope[\s\S]*?<label class="agu-ov-fade"/,'in the existing top row beside the fade slider, not a new row');
  assert.ok(!html.includes('[TEST] Wren - level 2'));await api.closeOverlay();
});
test('Self: only own characters, the switch reads pressed and offers the whole party; the choice is saved per browser and restored on open', async () => {
  const me={...alice,character:wren};const o=await open(me,'party');
  o.element=null;await game.settings.set(ID,'overlayScope','self');
  const html=await o._renderHTML();assert.deepEqual(names(html),['Wren','Moss']);
  const btn=/<button[^>]*id="agu-ov-scope"[^>]*>/.exec(html)[0];
  assert.match(btn,/aria-pressed="true"/);assert.match(btn,/aria-label="Show the whole party"/);
  await api.closeOverlay();
  const again=await api.openOverlay();assert.deepEqual(names(await again._renderHTML()),['Wren','Moss'],'restored when it opens again');
  await game.settings.set(ID,'overlayScope','party');assert.deepEqual(names(await again._renderHTML()),['Wren','Moss','Ash','Quill'],'Party shows every character again, own ones still first');
  await api.closeOverlay();
});
test('clicking the switch saves the other scope and re-renders; focus returns to the same control (it keeps its id)', async () => {
  game.user={...alice,character:wren};const o=await open(game.user,'party');
  const click={fn:null};const el={getAttribute:k=>k==='aria-pressed'?'false':null,addEventListener:(t,fn)=>{if(t==='click')click.fn=fn;}};
  const content={querySelector:s=>s==='#agu-ov-scope'?el:null,querySelectorAll:()=>[],contains:()=>false,set innerHTML(v){this._h=v;}};
  const before=o.renders??0;void before;
  let renders=0;const orig=o.render.bind(o);o.render=async()=>{renders++;return orig();};
  o._replaceHTML(await o._renderHTML(),content);
  assert.ok(click.fn,'wired');click.fn();await new Promise(r=>setTimeout(r,5));
  assert.equal(game.settings.get(ID,'overlayScope'),'self');assert.equal(renders,1);
  assert.match(await o._renderHTML(),/id="agu-ov-scope"/,'the control is still there with the same id for focus restore');
  await api.closeOverlay();
});
test('no switch for a user with no character of their own (GM without one, or a player who owns none)', async () => {
  let o=await open(gm,'self');let html=await o._renderHTML();
  assert.ok(!html.includes('agu-ov-scope'));assert.deepEqual(names(html),['Ash','Moss','Quill','Wren'],'GM: Self is ignored, existing order');await api.closeOverlay();
  const dan={id:'dan',name:'Dan',isGM:false,active:true};users.push(dan);
  o=await open(dan,'self');html=await o._renderHTML();assert.ok(!html.includes('agu-ov-scope'));await api.closeOverlay();users.pop();
  const gmc={...gm,character:quill};o=await open(gmc,'party');html=await o._renderHTML();
  assert.match(html,/id="agu-ov-scope"/,'a GM with an assigned character gets it');assert.equal(names(html)[0],'Quill');await api.closeOverlay();
});
test('Self hides nothing about permissions: other players\' cards are only hidden from view; Apply still follows the existing rules', async () => {
  const me={...alice,character:wren};const o=await open(me,'self');
  await o.selectCard('d1');let html=await o._renderHTML();
  assert.match(html,/data-actor="d1" aria-pressed="true"/);assert.ok(!applyOff(html),'own character: Apply enabled');
  o.selectedId='b1';html=await o._renderHTML();assert.equal(o.selectedId,'a1','Bob\'s card is not listed in Self, so the pick falls back to the first own card');
  await game.settings.set(ID,'overlayScope','party');o.selectedId='b1';html=await o._renderHTML();
  assert.equal(o.selectedId,'b1');assert.ok(applyOff(html),'another player\'s character is still refused in Party');
  await assert.rejects(()=>api.apply('b1','prone'),/./,'the API refuses it too, as before');
  await api.closeOverlay();
});
test('the Conditions overlay picker is the same control as the card, with the old ids; the setting is a client setting', async () => {
  const o=await open(gm);const html=await o._renderHTML();
  assert.match(html,/<button[^>]*id="agu-ov-status"[^>]*role="combobox"[^>]*disabled/,'GM has no card picked yet: disabled as the select was');
  assert.match(html,/<img class="agu-status-icon agu-combo__icon" id="agu-ov-icon"/);
  assert.equal(settings.has(`${ID}.overlayScope`),true);
  await o.selectCard('d1');assert.ok(!/<button[^>]*id="agu-ov-status"[^>]*disabled/.test(await o._renderHTML()));
  assert.equal(typeof pickerDoc,'function');
  await api.closeOverlay();
});
