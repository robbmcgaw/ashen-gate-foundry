// 0.26.0 UI cleanup: the window's tabs (six for the GM, no Roll Tables for players), Rolls → Current / History with a
// Start Rolls fold, the GM stash line (no On/Off toggle outside GM Setup), the vote prompt's purpose, GM Setup's unsaved
// edits guarded on tab switch, Help by topic, and the module's ui-parts helpers. Mocked Foundry globals: proves the
// markup and the logic, not the live Foundry window, focus or keyboard.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,createSession} from '../scripts/core.mjs';
import {button,emptyState,rowHTML,rowsHTML,focusKey,restoreFocus} from '../scripts/ui-parts.mjs';

const handlers={once:new Map(),on:new Map()};
let seen=[],answer='cancel';
globalThis.HTMLElement=class {};
globalThis.foundry={applications:{api:{
 ApplicationV2:class{constructor(options={}){this.options=options;this.rendered=false;this.renders=0;}async render(){this.rendered=true;this.renders++;return this;}async close(){this.rendered=false;return this;}},
 DialogV2:{prompt:async o=>{seen.push(o);},wait:async o=>{seen.push(o);return o.buttons.find(b=>b.action===answer).callback();}}
}}};
const gm={id:'gm',name:'GM',isGM:true,active:true};
const alice={id:'alice',name:'Alice',isGM:false,active:true};
const settings=new Map();
const flags=new Map();
const stash={id:'stash',name:'Ashen Gate | Party Stash',type:'npc',items:Object.assign([],{size:0}),system:{currency:{cp:0,sp:0,ep:0,gp:5,pp:0}},getFlag:(ns,k)=>flags.get(`stash.${ns}.${k}`),testUserPermission:()=>true,update:async()=>{}};
const actors=[];actors.get=id=>actors.find(a=>a.id===id);actors.find=Array.prototype.find.bind(actors);
const users=[gm,alice];users.get=id=>users.find(u=>u.id===id);
const modules=new Map([[ID,{id:ID,version:'9.9.9-test',api:{},active:true}]]);
globalThis.game={user:gm,users,actors,tables:[],messages:new Map(),i18n:{localize:x=>x},modules,
 settings:{register:(ns,key,opts)=>settings.set(`${ns}.${key}`,{value:opts.default,onChange:opts.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}}};
globalThis.CONFIG={DND5E:{skills:{acr:{label:'Acrobatics'},ath:{label:'Athletics'}}},statusEffects:[]};
globalThis.ui={actors:null,notifications:{info:()=>{},warn:()=>{},error:()=>{}}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>{handlers.on.set(k,fn);return 1;},off:()=>{},callAll:()=>{}};
globalThis.ChatMessage={create:async m=>m,getSpeaker:()=>({})};
const main=await import('../scripts/main.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=()=>game.modules.get(ID).api;
const as=async(user,fn)=>{const was=game.user;game.user=user;try{return await fn();}finally{game.user=was;}};
const render=(tab,user=gm,setup=()=>{})=>as(user,async()=>{const app=await api().open();app.tab=tab;setup(app);return {app,html:await app._renderHTML()};});

test('tabs: six for the GM (GM tabs last); players get no Roll Tables tab, and the old History tab opens Rolls → History',async()=>{
 const {html}=await render('setup');
 assert.deepEqual([...html.matchAll(/role="tab" id="agu-tab-([a-z]+)"/g)].map(m=>m[1]),['rolls','inventory','shops','conditions','tables','setup']);
 assert.doesNotMatch(html,/<p>Group challenges|ag-header__title"><h1>[^<]*<span[^>]*>[^<]*<\/span>[^<]*<\/h1><p>/,'no subtitle');
 await game.settings.set(ID,'playerAccessEnabled',true);
 const player=(await render('tables',alice)).html;
 assert.doesNotMatch(player,/data-tab="tables"|RollTable Messenger/);assert.match(player,/aria-labelledby="agu-tab-rolls"/,'falls back to Rolls');
 const {app,html:hist}=await render('history');
 assert.equal(app.tab,'rolls');assert.equal(app.rollsSub,'history');
 assert.match(hist,/role="tab" id="agu-rolls-tab-history" data-tab="history"[^>]*aria-selected="true"/);
 assert.match(hist,/No finished checks yet/);
});
test('Rolls (GM): Current / History sub-tabs; Start Rolls is a fold, open while idle; skills are toggle chips; no footer filler',async()=>{
 const {html}=await render('rolls',gm,app=>{app.rollsSub='current';});
 assert.match(html,/aria-label="Rolls sections"><button type="button" role="tab" id="agu-rolls-tab-current"[^>]*aria-selected="true"[^>]*>Current<\/button>/);
 assert.match(html,/<div class="agu-start" data-start-rolls><details class="ag-fold" open><summary class="ag-fold__summary"><span class="ag-fold__title">Start Rolls<\/span>/);
 assert.match(html,/<div class="ag-chip-group agu-skill-chips" role="group" aria-labelledby="agu-skill-label"><button type="button" class="ag-chip agu-skill" data-skill="acr" aria-pressed="true">Acrobatics<\/button>/);
 assert.doesNotMatch(html,/<footer|Native permissions apply/,'no footer without a form to save');
 const player=(await render('rolls',alice)).html;
 assert.doesNotMatch(player,/Rolls sections|Start Rolls/);
});
test('Rolls: a finished result closes the Start Rolls fold; a running check shows End & Record (primary) and Cancel Session (ghost)',async()=>{
 const done=createSession({id:'r1',name:'[TEST] Done',kind:'group',actors:['pc1'],skills:['ath'],createdBy:'gm',dc:10});
 await game.settings.set(ID,'lastResult',{...done,status:'completed'});
 const res=(await render('rolls',gm,app=>{app.rollsSub='current';app.startOpen=undefined;})).html;
 assert.match(res,/<details class="ag-fold"><summary class="ag-fold__summary"><span class="ag-fold__title">Start Rolls/);
 await game.settings.set(ID,'lastResult',{});
 await game.settings.set(ID,'activeSession',createSession({id:'r2',name:'[TEST] Climb',kind:'group',actors:['pc1'],skills:['ath'],createdBy:'gm',dc:10}));
 const run=(await render('rolls')).html;
 assert.match(run,/<div class="agu-actions agu-session-actions"><button type="button" class="ag-btn ag-btn--ghost" data-action="cancel"[^>]*>Cancel Session<\/button><button type="button" class="ag-btn ag-btn--primary" data-action="resolve"[^>]*>End &amp; Record<\/button>/);
 assert.doesNotMatch(run,/data-start-rolls/);assert.match(run,/<ul class="ag-rows">/,'participants are kit rows');
 await game.settings.set(ID,'activeSession',{});
});
test('Party Inventory (GM): one toolbar line, a read-only On/Off badge linking to GM Setup, no toggle; the link switches tab',async()=>{
 let {html}=await render('inventory');
 assert.match(html,/<div class="ag-toolbar agu-stash-bar"><div class="ag-toolbar__end"><button[^>]*data-action="gold-award"/);
 assert.match(html,/<p class="ag-empty__title">No party stash yet<\/p>[\s\S]*data-action="create-stash"/);
 flags.set(`stash.${ID}.partyStash`,true);actors.push(stash);
 try{
  const r=await render('inventory');html=r.html;
  assert.match(html,/<div class="ag-toolbar agu-stash-bar"><span class="agu-stash-bar__name"><strong>Ashen Gate \| Party Stash<\/strong> · 0 items<\/span><span class="ag-badge "><i class="fa-solid fa-eye-slash" aria-hidden="true"><\/i> Off for players<\/span><button type="button" class="ag-link" data-action="goto-tab" data-tab="setup">Change in GM Setup<\/button><div class="ag-toolbar__end"><button[^>]*data-action="gold-award"/);
  assert.doesNotMatch(html,/toggle-stash|Turn On for Players|NPC Actor kept by Utilities/);
  await r.app.handle('goto-tab',{disabled:false,dataset:{tab:'setup'}},{});
  assert.equal(r.app.tab,'setup');
 }finally{actors.length=0;flags.clear();}
});
test('GM Setup: unsaved edits are guarded on a tab switch (Keep editing is the default); Discard switches',async()=>{
 const {app}=await render('setup');
 app.setupGuard.markDirty();assert.equal(app.setupStatus,'Unsaved changes');
 seen=[];answer='cancel';await app.selectTab('rolls');
 assert.equal(app.tab,'setup','Keep editing stays');
 assert.equal(seen[0].window.title,'Discard unsaved changes?');assert.deepEqual(seen[0].buttons.map(b=>[b.label,b.default]),[['Keep editing',true],['Discard changes',false]]);
 answer='confirm';await app.selectTab('rolls');assert.equal(app.tab,'rolls');assert.equal(app.setupGuard.dirty,false);
});
test('vote prompt: title and buttons name what is approved (purchase, coins, item)',()=>{
 assert.deepEqual(main.votePromptText({purpose:'shop'}),{title:'Party purse: approve purchase?',deny:'Deny purchase',allow:'Allow purchase'});
 assert.deepEqual(main.votePromptText({purpose:'coins'}),{title:'Party purse: approve take-out?',deny:'Deny take-out',allow:'Allow take-out'});
 assert.deepEqual(main.votePromptText({}),{title:'Party stash: approve take-out?',deny:'Deny take-out',allow:'Allow take-out'});
});
test('Help is grouped by topic and carries the explanations that left the working screens',async()=>{
 const app=await api().open();seen=[];await app.handle('help',{disabled:false},{});
 const html=seen[0].content;
 for(const h of ['Rolls','Party Inventory','Shops','Roll Tables','Conditions','GM Setup'])assert.match(html,new RegExp(`<h3>${h}</h3>`));
 assert.match(html,/NPC Actor kept by Utilities/);assert.match(html,/Applies now/);assert.match(html,/Automatic duration, exhaustion and concentration/);
});
test('ui-parts: one button helper (kit kinds only), one empty state, kit rows',()=>{
 assert.equal(button('x','Go',{kind:'ghost sm bogus',ic:'fa-plus',attrs:'data-a="1"'}),'<button type="button" class="ag-btn ag-btn--ghost ag-btn--sm" data-action="x" data-a="1"><i class="fa-solid fa-plus" aria-hidden="true"></i> Go</button>');
 assert.equal(button('x','<b>',{disabled:true,cls:'agu-y'}),'<button type="button" class="ag-btn agu-y" data-action="x" disabled >&lt;b&gt;</button>');
 assert.equal(emptyState('None','Do this.',{icon:'fa-box'}),'<div class="ag-empty"><i class="fa-solid fa-box" aria-hidden="true"></i><p class="ag-empty__title">None</p><p class="ag-empty__text">Do this.</p></div>');
 assert.equal(rowsHTML([rowHTML({title:'T',meta:'M',end:'E'})]),'<ul class="ag-rows"><li class="ag-row"><div class="ag-row__main"><span class="ag-row__title">T</span><span class="ag-row__meta">M</span></div><div class="ag-row__end">E</div></li></ul>');
});
test('focus survives a re-render: a control is found again by its id or its data-* attributes',()=>{
 const el=(tag,attrs)=>({tagName:tag,id:attrs.id??'',attributes:Object.entries(attrs).filter(([k])=>k!=='id').map(([name,value])=>({name,value})),getAttribute(n){return attrs[n]??null;},focus(){this.focused=true;}});
 assert.equal(focusKey(el('INPUT',{id:'agu-stash-search'})),'#agu-stash-search');
 assert.equal(focusKey(el('BUTTON',{'data-action':'purse-undo','data-entry':'e"1','data-tooltip':'x'})),'button[data-action="purse-undo"][data-entry="e\\"1"]','tooltips are not part of the key');
 assert.equal(focusKey(el('BUTTON',{})),null);
 const target=el('BUTTON',{});const root={querySelector:q=>q==='#a'?target:null};
 assert.equal(restoreFocus(root,'#a'),true);assert.equal(target.focused,true);
 assert.equal(restoreFocus(root,'#gone'),false);assert.equal(restoreFocus(root,null),false);
});
