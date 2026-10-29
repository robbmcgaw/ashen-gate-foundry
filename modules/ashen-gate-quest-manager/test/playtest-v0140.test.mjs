// 0.14.0 play-test fixes. Mocked Foundry with a tiny fake DOM: proves the logic and wiring, not the live Foundry UI.
import test from 'node:test';import assert from 'node:assert/strict';
import {MOD,isPlayerCharacter} from '../scripts/core.mjs';
import {overlayState,clampOpacity,clampPosition} from '../scripts/tracking.mjs';
import {captureView,restoreView,fieldSelector} from '../scripts/view-state.mjs';

// ---- fake DOM: just enough for the overlay and the view-state helpers ----
class El{
 constructor(attrs={},{tag='DIV',parent=null}={}){this.attrs={...attrs};this.tagName=tag;this.parent=parent;this.children=[];this.listeners={};this.style={props:{},setProperty(k,v){this.props[k]=v;}};
  this.classList=Object.assign([...(attrs.class??'').split(' ').filter(Boolean)],{add:()=>{},remove:()=>{}});this.scrollTop=0;this.scrollLeft=0;this.value=attrs.value??'';this.type=attrs.type??'';this.id=attrs.id??'';
  this.dataset=Object.fromEntries(Object.entries(attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5).replace(/-(\w)/g,(_,c)=>c.toUpperCase()),v]));}
 getAttribute(k){return k in this.attrs?this.attrs[k]:null;}
 setAttribute(k,v){this.attrs[k]=v;}
 addEventListener(ev,fn){(this.listeners[ev]??=[]).push(fn);}
 fire(ev,e={}){for(const fn of this.listeners[ev]??[])fn({target:this,...e});}
 closest(sel){let n=this;while(n){if(matches(n,sel))return n;n=n.parent;}return null;}
 contains(el){let n=el;while(n){if(n===this)return true;n=n.parent;}return false;}
 all(){return this.children.flatMap(c=>[c,...c.all()]);}
 querySelectorAll(sel){return this.all().filter(c=>sel.split(',').some(s=>matches(c,s.trim())));}
 querySelector(sel){return this.querySelectorAll(sel)[0]??null;}
 focus(){focused=this;}
 setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}
 dispatchEvent(e){this.fire(e.type);}
 remove(){if(overlay===this)overlay=null;}
}
let focused=null;
// Selectors used here: #id, .class, [attr], [attr="v"], [attr^="v"] and "A B" (descendant).
function matches(el,sel){
 if(sel.includes(','))return sel.split(',').some(x=>matches(el,x));
 sel=sel.trim();if(/^[a-z]+$/.test(sel))return el.tagName===sel.toUpperCase();
 const parts=sel.trim().split(/\s+/);if(parts.length>1){const last=parts.pop();if(!matches(el,last))return false;let n=el.parent;while(n){if(matches(n,parts.join(' ')))return true;n=n.parent;}return false;}
 return [...sel.matchAll(/#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:(\^?=)"([^"]*)")?\]/g)].every(([,id,cls,attr,op,v])=>id?el.id===id:cls?el.classList.includes(cls):op==='^='?String(el.getAttribute(attr)??'').startsWith(v):op?el.getAttribute(attr)===v:el.getAttribute(attr)!==null);
}
// Parses the start tags in an HTML string into a nested El tree (void tags don't nest).
function parse(html,root){
 const stack=[root];
 for(const m of html.matchAll(/<(\/?)([a-z]+)([^>]*)>/g)){
  const [,close,tag,rest]=m;if(close){stack.length>1&&stack.pop();continue;}
  const attrs=Object.fromEntries([...rest.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([,k,v])=>[k,v??'']));
  const el=new El(attrs,{tag:tag.toUpperCase(),parent:stack.at(-1)});stack.at(-1).children.push(el);
  if(!['input','i','br','img'].includes(tag))stack.push(el);
 }
}
class Host extends El{set innerHTML(h){this._html=h;this.children=[];parse(h,this);}get innerHTML(){return this._html;}}

// ---- mocked Foundry ----
const once=new Map(),hooks=new Map();
globalThis.Hooks={once:(e,fn)=>once.set(e,fn),on:(e,fn)=>hooks.set(e,[...(hooks.get(e)??[]),fn]),off:()=>{}};
const call=(e,...a)=>(hooks.get(e)??[]).forEach(fn=>fn(...a));
let lastApp;
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(){lastApp=this;}async render(){this.rendered=true;return this._renderHTML();}async close(){this.rendered=false;}}}}};
const settings={playerAccessEnabled:true,compendiumPackIds:'',openForPlayers:false},defs=new Map(),sets=[];
const gm={id:'gm',isGM:true},alice={id:'alice',isGM:false},bob={id:'bob',isGM:false};
for(const u of [gm,alice,bob]){u.flags={};u.getFlag=(m,k)=>m===MOD?structuredClone(u.flags[k]):undefined;u.setFlag=async(m,k,v)=>{assert.equal(m,MOD);u.flags[k]=structuredClone(v);};}
const view={id:'QUEST-TEST-LANTERN',entity_type:'Objective',objective_kind:'quest',name:'[TEST] Lantern',status:'Active',scope:'party',actorId:null,summary:'',objectives:[{key:'a',goal:'[TEST] Light it'}],locationIds:[]};
const view2={...view,id:'QUEST-TEST-BELL',name:'[TEST] Bell'};
const projection=v=>({id:`j-${v.id}`,getFlag:(m,k)=>m===MOD?{public:true,view:v}[k]:undefined,testUserPermission:()=>true});
const journal=[projection(view),projection(view2)];
const pc=(id,name,owner,extra={})=>({id,name,type:'character',flags:{},testUserPermission:u=>u.isGM||u.id===owner,...extra});
const actors=[pc('aria','[TEST] Aria','alice'),pc('wolf','[TEST] Wolf','alice',{type:'npc'}),pc('gmhero','[TEST] GM Hero','gm'),
 pc('ariaL3','[TEST] Aria - level 3','alice'),pc('bram','[TEST] Bram','bob')];actors.get=id=>actors.find(a=>a.id===id)??null;
const mod={active:true,api:null,version:'0.14.0'};
let overlay=null;
globalThis.innerWidth=1200;globalThis.innerHeight=800;
const winListeners={};globalThis.addEventListener=(e,fn)=>(winListeners[e]??=new Set()).add(fn);globalThis.removeEventListener=(e,fn)=>winListeners[e]?.delete(fn);
globalThis.document={querySelectorAll:()=>[],querySelector:s=>s==='#ag-quest-objectives-overlay'?overlay:null,
 createElement:()=>{const el=new Host({});el.offsetWidth=320;el.offsetHeight=200;el.getBoundingClientRect=()=>({left:100,top:50,width:320,height:200});return el;},
 body:{append:el=>{overlay=el;}},get activeElement(){return focused;}};
const notes=[];
globalThis.ui={actors:{element:null},notifications:{info:m=>notes.push(m),warn:m=>notes.push(m),error:m=>notes.push(m)}};
globalThis.game={user:gm,users:[gm,alice,bob],journal,actors,folders:[],items:{contents:[]},packs:{get:()=>null},
 settings:{register:(m,k,d)=>defs.set(k,d),get:(m,k)=>settings[k],set:async(m,k,v)=>{sets.push([k,v]);settings[k]=v;}},modules:{get:id=>id===MOD?mod:null}};
const origError=console.error;console.error=()=>{};
const main=await import('../scripts/main.mjs');
once.get('init')();once.get('ready')();
console.error=origError;

// ---- 1. no journal opens by itself ----
test('every Quest Log journal and reward item is created without opening its sheet',async()=>{
 const {saveRecord,updateState}=await import('../scripts/store.mjs');
 const made=[],docs=[];let n=0;
 class Doc{constructor(d){this.id=String(++n);this.name=d.name;this.flags=d.flags??{};this.ownership=d.ownership;this.pages=(d.pages??[]).map(p=>({...p,update:async()=>{}}));}
  getFlag(m,k){return this.flags?.[m]?.[k];}async update(){return this;}async delete(){docs.splice(docs.indexOf(this),1);}testUserPermission(u){return u.isGM||this.ownership?.[u.id]>=2||this.ownership?.default>=2;}}
 const saved={journal:game.journal};game.journal=docs;game.user=gm;
 globalThis.JournalEntry={create:async(data,options)=>{made.push(options);const d=new Doc(data);docs.push(d);return d;}};
 try{
  const src={id:'QUEST-TEST-QUIET',entity_type:'Objective',objective_kind:'quest',status:'draft',version:'0.1.0',provenance:{sources:['synthetic']},visibility:'player',refs:[],name:'[TEST] Quiet',source:{},public_summary:'',objectives:[{key:'a',goal:'A'}],locations:[],parameters:{},outcomes:{}};
  await saveRecord(src);await updateState(src.id,{status:'Active',revealed:true});await updateState(src.id,{status:'Completed'});
  assert.ok(made.length>=3,'GM record, projection and character notes were created');
  assert.ok(made.every(o=>o?.renderSheet===false),'renderSheet:false on every create');
 }finally{game.journal=saved.journal;delete globalThis.JournalEntry;}
});
test('a player client closes a Quest Log journal sheet that opens by itself right after the GM wrote it',()=>{
 game.user=alice;
 const j=journal[0];let closed=0;const sheet={document:j,close:()=>{closed++;}};
 call('updateJournalEntry',j,{},{},'gm');
 call('renderJournalEntrySheet',sheet,null,{},{isFirstRender:true});assert.equal(closed,1,'auto-opened sheet is closed');
 call('renderJournalEntrySheet',sheet,null,{},{isFirstRender:false});assert.equal(closed,1,'an already open sheet just refreshes');
 const page={documentName:'JournalEntryPage',parent:journal[1]};call('updateJournalEntryPage',page,{},{},'gm');
 call('renderJournalEntryPageSheet',{document:page,close:()=>{closed++;}},null,{},{isFirstRender:true});assert.equal(closed,2,'a page sheet too');
 const other={id:'j-other',getFlag:()=>undefined};call('updateJournalEntry',other,{},{},'gm');
 call('renderJournalEntrySheet',{document:other,close:()=>{closed++;}},null,{},{isFirstRender:true});assert.equal(closed,2,'other journals are left alone');
 game.user=gm;call('updateJournalEntry',j,{},{},'alice');call('renderJournalEntrySheet',sheet,null,{},{isFirstRender:true});assert.equal(closed,2,'never on the GM');
});
test('Open for players is an off-by-default GM Setup switch; on, a newly revealed quest opens the Quest Log, never a journal',async()=>{
 assert.equal(defs.get('openForPlayers').default,false);assert.equal(defs.get('openForPlayers').config,false);
 game.user=gm;await mod.api.open();lastApp.tab='setup';let html=await lastApp.render();
 assert.match(html,/id="ag-open-for-players" >/,'unchecked by default');
 sets.length=0;const form={querySelector:s=>s==='#ag-player-access'?{checked:true}:s==='#ag-compendium-packs'?{value:''}:s==='#ag-open-for-players'?{checked:true}:null};
 await lastApp.action({dataset:{action:'save-setup'}},form);assert.deepEqual(sets,[['openForPlayers',true]]);
 html=await lastApp.render();assert.match(html,/id="ag-open-for-players" checked/);
 // Player client (0.30.0): off, nothing happens; on, a newly revealed quest pops the tracker, once, and never the Quest Log window.
 game.user=alice;settings.openForPlayers=false;lastApp.tab='party';lastApp.selectedId=view.id;alice.flags.tracking={ids:[],visible:false};overlay=null;notes.length=0;
 const fresh={...view,id:'QUEST-TEST-NEW',name:'[TEST] New'},doc=projection(fresh);journal.push(doc);
 call('createJournalEntry',doc,{},'gm');await new Promise(r=>setTimeout(r,0));assert.equal(overlay,null);assert.equal(lastApp.selectedId,view.id);
 settings.openForPlayers=true;const doc2=projection({...fresh,id:'QUEST-TEST-NEWER'});journal.push(doc2);
 lastApp.rendered=false;
 call('createJournalEntry',doc2,{},'gm');await new Promise(r=>setTimeout(r,10));
 assert.equal(lastApp.rendered,false,'the main window was not opened');assert.equal(lastApp.selectedId,view.id,'and not switched to the quest');
 assert.ok(overlay,'the tracker popped');assert.match(overlay.innerHTML,/\[TEST\] New/);
 assert.deepEqual(alice.flags.tracking,{ids:['QUEST-TEST-NEWER'],visible:false},'nothing tracked before: the revealed quest is tracked; the saved on/off choice is untouched');
 assert.deepEqual(notes,[],'a quest the tracker now shows needs no extra toast');
 call('createJournalEntry',doc2,{},'gm');await new Promise(r=>setTimeout(r,0));assert.equal(alice.flags.tracking.ids.length,1,'only once');
 // Already tracking something visible: that choice stays, the tracker still pops, and the usual notification names the new quest.
 const doc3=projection({...fresh,id:'QUEST-TEST-THIRD',name:'[TEST] Third'});journal.push(doc3);overlay=null;
 call('createJournalEntry',doc3,{},'gm');await new Promise(r=>setTimeout(r,10));
 assert.deepEqual(alice.flags.tracking.ids,['QUEST-TEST-NEWER'],'existing tracking is not replaced');assert.ok(overlay);
 assert.equal(notes.length,1);assert.match(notes[0],/\[TEST\] Third/);
 journal.splice(journal.indexOf(doc3),1);
journal.splice(journal.indexOf(doc),1);journal.splice(journal.indexOf(doc2),1);settings.openForPlayers=false;game.user=gm;
});

// ---- 2. overlay: move, remove, fade ----
test('overlay prefs: opacity 0-100 (default 100), position only when both numbers, kept on screen',()=>{
 assert.deepEqual(overlayState(null),{opacity:100});
 assert.deepEqual(overlayState({opacity:0,left:10.4,top:'x'}),{opacity:0});
 assert.deepEqual(overlayState({opacity:250,left:10.4,top:20.6}),{opacity:100,left:10,top:21});
 assert.equal(clampOpacity(-5),0);assert.equal(clampOpacity('40'),40);assert.equal(clampOpacity(null),100);assert.equal(clampOpacity('nope'),100);
 assert.deepEqual(clampPosition({left:-50,top:900},{width:300,height:200},{width:1000,height:800}),{left:0,top:600});
 assert.deepEqual(clampPosition({left:950,top:10},{width:300,height:200},{width:1000,height:800}),{left:700,top:10});
 assert.deepEqual(clampPosition({left:50,top:50},{width:1300,height:900},{width:1000,height:800}),{left:0,top:0},'bigger than the screen sits at 0,0');
});
test('overlay: a remove button per tracked quest, a background slider, and drag saves a clamped place for this user only',async()=>{
 game.user=alice;alice.flags={};
 await mod.api.tracking.set({ids:[view.id,view2.id],visible:true});
 assert.ok(overlay,'overlay shown');
 const untrack=overlay.querySelectorAll('[data-untrack]');
 assert.deepEqual(untrack.map(b=>b.dataset.untrack),[view.id,view2.id]);
 assert.match(overlay.innerHTML,/aria-label="Stop tracking \[TEST\] Lantern"/);
 const slider=overlay.querySelector('[data-overlay-opacity]');
 assert.equal(slider.getAttribute('min'),'0');assert.equal(slider.getAttribute('max'),'100');assert.equal(slider.getAttribute('value'),'100');
 assert.ok(overlay.querySelector('.agq-tracker__head').querySelector('[data-overlay-opacity]'),'the slider sits in the header');
 // Fade: live while dragging the slider, saved on release, only the background variable changes.
 slider.value='30';slider.fire('input');assert.equal(overlay.style.props['--agq-tracker-alpha'],'30%');
 slider.fire('change');await new Promise(r=>setTimeout(r,0));assert.equal(alice.flags.overlay.opacity,30);
 // Remove one quest from the tracker.
 untrack[0].fire('click');await new Promise(r=>setTimeout(r,0));
 assert.deepEqual(alice.flags.tracking.ids,[view2.id]);
 assert.deepEqual(overlay.querySelectorAll('[data-untrack]').map(b=>b.dataset.untrack),[view2.id]);
 // Drag the header past the right/bottom edges: the place is clamped and saved.
 const head=overlay.querySelector('.agq-tracker__head');
 head.fire('pointerdown',{button:0,clientX:110,clientY:60,preventDefault(){}});
 for(const fn of winListeners.pointermove)fn({clientX:5000,clientY:5000});
 assert.equal(overlay.style.left,'880px');assert.equal(overlay.style.top,'600px');assert.equal(overlay.style.right,'auto');
 for(const fn of [...winListeners.pointerup])fn({});await new Promise(r=>setTimeout(r,0));
 assert.deepEqual(alice.flags.overlay,{opacity:30,left:880,top:600});
 assert.equal(winListeners.pointermove.size,0,'drag listeners removed');
 assert.equal(bob.flags.overlay,undefined,'another user is unaffected');
 // A redraw (or a smaller screen) puts it back where it was, kept on screen; the fade is re-applied.
 globalThis.innerWidth=800;await mod.api.tracking.set({visible:true});
 assert.equal(overlay.style.left,'480px');assert.equal(overlay.style.props['--agq-tracker-alpha'],'30%');
 globalThis.innerWidth=1200;
 // Pressing a header button never starts a drag.
 head.fire('pointerdown',{button:0,clientX:0,clientY:0,target:{closest:()=>({})},preventDefault(){}});
 assert.equal(winListeners.pointermove.size,0);
 game.user=gm;
});

// ---- 3. scroll and focus survive a redraw ----
test('view-state: each marked panel keeps its scroll; the focused field keeps focus and caret; text only when asked',()=>{
 const root=new Host({});root.innerHTML='<aside data-ag-scroll="gm-list"></aside><section data-ag-scroll="gm-edit:QUEST-A"><input id="ag-src-name" value="Old"><div data-key="first"><input class="ag-src-obj-goal" value="x"></div></section>';
 const memo={};root.querySelector('[data-ag-scroll="gm-list"]').scrollTop=420;root.querySelector('[data-ag-scroll="gm-edit:QUEST-A"]').scrollTop=900;
 const name=root.querySelector('#ag-src-name');name.value='Draft title';name.focus();name.selectionStart=3;name.selectionEnd=5;
 const focus=captureView(root,memo);
 assert.deepEqual(memo,{'gm-list':{top:420,left:0},'gm-edit:QUEST-A':{top:900,left:0}});
 assert.equal(focus.selector,'#ag-src-name');
 root.innerHTML='<aside data-ag-scroll="gm-list"></aside><section data-ag-scroll="gm-edit:QUEST-A"><input id="ag-src-name" value="Old"></section>';focused=null;
 restoreView(root,memo,focus);
 assert.equal(root.querySelector('[data-ag-scroll="gm-list"]').scrollTop,420);assert.equal(root.querySelector('[data-ag-scroll="gm-edit:QUEST-A"]').scrollTop,900);
 assert.equal(focused,root.querySelector('#ag-src-name'));assert.equal(focused.selectionStart,3);assert.equal(focused.value,'Old','text is not put back by default');
 restoreView(root,memo,focus,{keepText:true});assert.equal(root.querySelector('#ag-src-name').value,'Draft title');
 const row=new El({'data-key':'first'});const input=new El({class:'ag-src-obj-goal'},{tag:'INPUT',parent:row});
 assert.equal(fieldSelector(input),'[data-key="first"] .ag-src-obj-goal');
 assert.equal(fieldSelector(new El({},{tag:'BUTTON'})),null);
});
test('Quest Log window: saving and picking a quest keep the list and editor scroll; Cancel does not restore typed text',async()=>{
 game.user=gm;await mod.api.open();const app=lastApp;app.tab='party';app.selectedId=view.id;
 const content=new Host({});
 app._replaceHTML(await app._renderHTML(),content);
 const list=()=>content.querySelector('[data-ag-scroll="list:party"]'),read=()=>content.querySelector('[data-ag-scroll^="read:party"]');
 assert.ok(list()&&read(),'player list and reading pane are marked');
 list().scrollTop=333;read().scrollTop=222;
 app._replaceHTML(await app._renderHTML(),content);
 assert.equal(list().scrollTop,333);assert.equal(read().scrollTop,222);
 // Another quest: the list keeps its place, the reading pane starts that quest at its own place (top the first time).
 app.selectedId=view2.id;app._replaceHTML(await app._renderHTML(),content);
 assert.equal(list().scrollTop,333);assert.equal(read().scrollTop,0);
 app.selectedId=view.id;app._replaceHTML(await app._renderHTML(),content);assert.equal(read().scrollTop,222,'back to the first quest: its place');
 // Focus: the search box keeps focus through a redraw; its text comes back only for a redraw someone else caused.
 const search=content.querySelector('#ag-quest-search');search.value='lan';search.focus();
 app.externalRender=true;app._replaceHTML(await app._renderHTML(),content);
 assert.equal(focused,content.querySelector('#ag-quest-search'));assert.equal(focused.value,'lan');
 content.querySelector('#ag-quest-search').value='typed';content.querySelector('#ag-quest-search').focus();
 app._replaceHTML(await app._renderHTML(),content);assert.notEqual(content.querySelector('#ag-quest-search').value,'typed','own action: markup wins');
 focused=null;
});

// ---- 4. pickers list player characters only ----
test('isPlayerCharacter: a character a player owns; never an NPC, a GM-only actor or a "- level X" backup',()=>{
 const users=game.users;
 assert.deepEqual(actors.filter(a=>isPlayerCharacter(a,users)).map(a=>a.id),['aria','bram']);
 assert.equal(isPlayerCharacter(pc('x','[TEST] X','alice',{flags:{'ashen-gate-character-hub':{levelBackup:{fromLevel:1}}}}),users),false);
 assert.equal(isPlayerCharacter(null,users),false);
 assert.deepEqual(actors.filter(a=>isPlayerCharacter(a,[alice])).map(a=>a.id),['aria'],'a player sees their own');
});
test('individual-character picker, player character selector and party reward recipients use the same rule',async()=>{
 const {partyActors}=await import('../scripts/rewards.mjs');
 assert.deepEqual(partyActors({scope:'party'}).map(a=>a.id),['aria','bram']);
 game.user=gm;await mod.api.open();const app=lastApp;
 const select=(h,id)=>{const at=h.indexOf(`<select id="${id}"`);return h.slice(at,h.indexOf('</select>',at));};
 app.tab='individual';let html=await app.render();
 assert.deepEqual([...select(html,'ag-actor').matchAll(/value="(\w+)"/g)].map(m=>m[1]),['aria','bram']);
 game.user=bob;app.actorId=null;html=await app.render();
 assert.deepEqual([...select(html,'ag-actor').matchAll(/value="(\w+)"/g)].map(m=>m[1]),['bram']);
 game.user=gm;
});

// ---- 5. nothing for players in Configure Settings ----
test('no Quest Log setting is client-visible, and a player\'s Settings window drops any Quest Log entry',()=>{
 for(const [key,def] of defs)assert.equal(def.config,false,`${key} is not shown in Configure Settings`);
 const build=()=>{const root=new Host({});root.innerHTML=`<nav><button data-tab="core"></button><button data-tab="${MOD}"></button></nav><section data-tab="core"></section><section data-tab="${MOD}" data-category="${MOD}"><div data-setting-id="${MOD}.playerAccessEnabled"></div></section>`;
  for(const el of root.all())el.remove=()=>{el.parent.children.splice(el.parent.children.indexOf(el),1);};return root;};
 game.user=alice;let root=build();call('renderSettingsConfig',{element:root},root,{});
 assert.equal(root.querySelectorAll(main.PLAYER_SETTINGS_SELECTOR).length,0);assert.equal(root.querySelectorAll('[data-tab="core"]').length,2,'core is untouched');
 game.user=gm;root=build();call('renderSettingsConfig',{element:root},root,{});
 assert.equal(root.querySelectorAll(`[data-tab="${MOD}"]`).length,2,'the GM sees everything');
});
