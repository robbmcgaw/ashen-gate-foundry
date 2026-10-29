// 0.28.0 Show to Players, wired through main.mjs with mocked Foundry (no real sockets, windows or focus).
import test from 'node:test';import assert from 'node:assert/strict';
import {MOD} from '../scripts/core.mjs';
import {El} from './helpers/fake-dom.mjs';

const once=new Map(),defs=new Map(),sets=[],written=[],handlers=new Map(),emitted=[],notes=[];
globalThis.Hooks={once:(e,fn)=>once.set(e,fn),on:()=>{},off:()=>{}};
let lastApp;
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(){lastApp=this;}async render(){this.rendered=true;return this._renderHTML();}async close(){this.rendered=false;}}}}};
const settings={playerAccessEnabled:true,compendiumPackIds:'',openForPlayers:false,showOpensWindow:true};
const gm={id:'gm',isGM:true,active:true},alice={id:'alice',isGM:false,active:true},bob={id:'bob',isGM:false,active:true};
const users=[gm,alice,bob];users.get=id=>users.find(u=>u.id===id);
const src={id:'QUEST-TEST-LANTERN',entity_type:'Objective',objective_kind:'quest',status:'approved',version:'0.1.0',provenance:{sources:['synthetic']},visibility:'reveal_gated',refs:[],name:'[TEST] Lantern',source:{},public_summary:'',objectives:[{key:'a',goal:'[TEST] Light it',visibility:'player'}],locations:[],parameters:{},outcomes:{}};
const st={status:'Active',scope:'party',actorId:null,revealed:true,objectiveReveal:[],progress:{},partyNotes:'',gmNotes:'',rewardRecorded:false};
const view={id:src.id,name:src.name,objective_kind:'quest',status:'Active',scope:'party',objectives:[{key:'a',goal:'[TEST] Light it'}],locationIds:[]};
const KEY='Qk9xZ2hLdWFtcDEx';
const flagDoc=(id,flags,perm)=>({id,getFlag:(m,k)=>m===MOD?flags[k]:undefined,testUserPermission:perm,update:async d=>{written.push(d);},delete:async()=>{written.push('delete');}});
const priv=flagDoc('PRIVATEDOC000001',{private:true,source:src,state:st},u=>u.isGM);
const pub=flagDoc(KEY,{public:true,view},u=>u.isGM||u.id==='alice');
const journal=[priv,pub];journal.get=id=>journal.find(j=>j.id===id);
let overlay=null;
for(const u of [gm,alice,bob]){u.flags={};u.getFlag=(m,k)=>m===MOD?structuredClone(u.flags[k]):undefined;u.setFlag=async(m,k,v)=>{u.flags[k]=structuredClone(v);};}
globalThis.document={querySelectorAll:()=>[],querySelector:s=>s==='#ag-quest-objectives-overlay'?overlay:null,activeElement:null,
 createElement:()=>{const el=new El({},{tag:'ASIDE'});el.remove=()=>{if(overlay===el)overlay=null;};return el;},body:{append:el=>{overlay=el;}}};
globalThis.ui={actors:{element:null},notifications:{info:m=>notes.push(['info',m]),warn:m=>notes.push(['warn',m]),error:m=>notes.push(['error',m])}};
globalThis.game={user:gm,users,journal,actors:Object.assign([],{get:()=>null}),folders:[],items:{contents:[]},packs:{get:()=>null},
 socket:{on:(ch,fn)=>handlers.set(ch,fn),emit:(ch,msg,opts)=>emitted.push({ch,msg,opts})},
 settings:{register:(m,k,d)=>defs.set(k,d),get:(m,k)=>settings[k],set:async(m,k,v)=>{sets.push([k,v]);settings[k]=v;}},modules:{get:id=>id===MOD?mod:null}};
const mod={active:true,api:null};
const origError=console.error;console.error=()=>{};
await import('../scripts/main.mjs');
once.get('init')();once.get('ready')();
console.error=origError;

test('the setting is on by default, a world setting, and sits in GM Setup; it saves with Save Changes', async()=>{
 assert.equal(defs.get('showOpensWindow').default,true);assert.equal(defs.get('showOpensWindow').scope,'world');assert.equal(defs.get('showOpensWindow').config,false);
 await mod.api.open();lastApp.tab='setup';let html=await lastApp.render();
 assert.match(html,/id="ag-open-on-show" checked> Players' tracker opens automatically when the GM shows a quest/);
 sets.length=0;
 const form=on=>({querySelector:s=>s==='#ag-player-access'?{checked:true}:s==='#ag-compendium-packs'?{value:''}:s==='#ag-open-for-players'?{checked:false}:s==='#ag-open-on-show'?{checked:on}:null});
 await lastApp.action({dataset:{action:'save-setup'}},form(true));assert.deepEqual(sets,[],'unchanged means nothing written');
 await lastApp.action({dataset:{action:'save-setup'}},form(false));assert.deepEqual(sets,[['showOpensWindow',false]]);
 html=await lastApp.render();assert.doesNotMatch(html,/id="ag-open-on-show" checked/);
 await lastApp.action({dataset:{action:'save-setup'}},form(true));assert.equal(settings.showOpensWindow,true);
});
test('the GM editor has Show to Players beside Delete; a new unsaved quest has neither', async()=>{
 game.user=gm;await mod.api.open();lastApp.tab='quests';lastApp.gmId=src.id;
 const html=await lastApp.render();
 const head=html.slice(html.indexOf('agq-edit__head'),html.indexOf('</header>',html.indexOf('agq-edit__head')));
 assert.match(head,/data-action="show-to-players"[^>]*>[\s\S]*Show to Players[\s\S]*data-action="delete"/);
 lastApp.gmId=null;assert.doesNotMatch(await lastApp.render(),/data-action="show-to-players"/);
 game.user=alice;lastApp.tab='party';assert.doesNotMatch(await lastApp.render(),/show-to-players/,'players do not get the button');
 game.user=gm;
});
test('pressing it sends only the key, to the players who may see the quest, and writes nothing', async()=>{
 game.user=gm;await mod.api.open();lastApp.tab='quests';lastApp.gmId=src.id;lastApp.unsavedSource=false;
 emitted.length=0;notes.length=0;written.length=0;sets.length=0;
 await lastApp.action({dataset:{action:'show-to-players'}},null);
 assert.equal(emitted.length,1);
 assert.deepEqual(emitted[0],{ch:`module.${MOD}`,msg:{type:'show-quest',key:KEY},opts:{recipients:['alice']}});
 assert.deepEqual(notes,[['info','Shown to 1 player.']]);
 assert.deepEqual(written,[]);assert.deepEqual(sets,[]);
});
test('a player pressing it (or calling it) cannot broadcast', async()=>{
 game.user=alice;emitted.length=0;notes.length=0;
 await lastApp.action({dataset:{action:'show-to-players'}},null);
 assert.equal(emitted.length,0);assert.equal(notes.at(-1)[0],'error');game.user=gm;
});
test('the socket handler routes show messages to the receiver and journal messages elsewhere', async()=>{
 const handle=handlers.get(`module.${MOD}`);assert.equal(typeof handle,'function');
 lastApp.gmId=null;lastApp.tab='party';game.user=alice;await mod.api.open();lastApp.tab='journal';lastApp.selectedId=null;
 handle({type:'show-quest',key:KEY},'gm');await new Promise(r=>setTimeout(r,20));
 assert.equal(lastApp.selectedId,null,'0.30.0: the open Quest Log is not switched to the quest');assert.ok(overlay,'the tracker popped instead');
 // A player-sent message is ignored.
 overlay=null;handle({type:'show-quest',key:KEY},'bob');await new Promise(r=>setTimeout(r,20));
 assert.equal(overlay,null);
 // Player Bob cannot see the quest: nothing opens, no toast.
 game.user=bob;notes.length=0;handle({type:'show-quest',key:KEY},'gm');await new Promise(r=>setTimeout(r,20));
 assert.equal(overlay,null);assert.deepEqual(notes,[]);
 game.user=gm;
});

// ---- 0.30.0: a reveal / Show pops the tracker, not the Quest Log ----
const later=(ms=20)=>new Promise(r=>setTimeout(r,ms));
const show=async(who='alice')=>{game.user=game.users.get(who);notes.length=0;emitted.length=0;lastShown+=2000;handlers.get(`module.${MOD}`)({type:'show-quest',key:KEY},'gm');await later();};
let lastShown=0;
const realNow=Date.now;
test('reveal on a player client never opens the Quest Log; it pops and brings forward the tracker and tracks the quest when nothing else is tracked', async()=>{
 Date.now=()=>realNow()+(lastShown+=5000);
 try{
  alice.flags.tracking=undefined;overlay=null;lastApp.rendered=false;
  await show();
  assert.equal(lastApp.rendered,false,'main window not opened');
  assert.ok(overlay);assert.match(overlay.innerHTML,/\[TEST\] Lantern/);
  assert.deepEqual(alice.flags.tracking,{ids:[src.id],visible:false},'tracked for this player only; saved on/off choice untouched');
  assert.deepEqual(notes,[]);
  // An already open Quest Log is refreshed, not focused or switched.
  await mod.api.open();lastApp.selectedId=null;lastApp.tab='journal';overlay=null;
  await show();assert.equal(lastApp.selectedId,null);assert.equal(lastApp.tab,'journal');assert.ok(overlay);
 }finally{Date.now=realNow;}
});
test('the tracker header has one Open Quest Log icon button with aria-label and tooltip; it opens the main UI', async()=>{
 const btn=overlay.querySelector('[data-open-log]');
 assert.ok(btn);assert.equal(btn.getAttribute('aria-label'),'Open Quest Log');assert.equal(btn.getAttribute('data-tooltip'),'Open Quest Log');
 assert.ok(overlay.querySelector('.agq-tracker__head').querySelector('[data-open-log]'),'in the header');
 assert.equal(overlay.querySelectorAll('.agq-tracker__head [data-open-log]').length,1);
 game.user=alice;lastApp.rendered=false;btn.fire('click');await later(5);
 assert.equal(lastApp.rendered,true);
});
test('a player who tracks nothing visible and a revealed quest with no revealed objective: notification only, no tracker, no main window', async()=>{
 Date.now=()=>realNow()+(lastShown+=5000);
 try{
  const saved=view.objectives;view.objectives=[];alice.flags.tracking={ids:[],visible:false};overlay=null;await mod.api.open();lastApp.rendered=false;
  await show();
  assert.equal(overlay,null);assert.equal(lastApp.rendered,false);assert.deepEqual(alice.flags.tracking,{ids:[],visible:false});
  assert.equal(notes.length,1);assert.match(notes[0][1],/\[TEST\] Lantern/);
  view.objectives=saved;
 }finally{Date.now=realNow;}
});
test('permission: a player who may not see the quest gets no tracker, no tracking change and no toast', async()=>{
 Date.now=()=>realNow()+(lastShown+=5000);
 try{bob.flags.tracking=undefined;overlay=null;await show('bob');assert.equal(overlay,null);assert.equal(bob.flags.tracking,undefined);assert.deepEqual(notes,[]);}
 finally{Date.now=realNow;}
});
test('a player who already tracks a visible quest keeps that choice; the tracker pops and the usual notification names the quest', async()=>{
 Date.now=()=>realNow()+(lastShown+=5000);
 try{
  const other={...view,id:'QUEST-TEST-OTHER',name:'[TEST] Other'};journal.push(flagDoc('OtherView0000001',{public:true,view:other},u=>u.isGM||u.id==='alice'));
  alice.flags.tracking={ids:['QUEST-TEST-OTHER'],visible:true};overlay=null;
  await show();
  assert.deepEqual(alice.flags.tracking,{ids:['QUEST-TEST-OTHER'],visible:true});assert.ok(overlay);assert.match(overlay.innerHTML,/\[TEST\] Other/);
  assert.equal(notes.length,1);assert.match(notes[0][1],/Your GM shared a quest: \[TEST\] Lantern/);
 }finally{Date.now=realNow;journal.pop();}
});

// ---- 0.30.0: Hide from players / Reveal to players on the Party and Individual rows ----
test('GM rows carry a Hide from players button (text + icon, tooltip names what is kept); players get none', async()=>{
 game.user=gm;await mod.api.open();lastApp.tab='party';
 let html=await lastApp.render();
 assert.match(html,/<button[^>]*id="agq-vis-QUEST-TEST-LANTERN"[^>]*data-action="hide-from-players"[^>]*data-tooltip="Hide this quest from all players\. Status, progress and notes are kept"[^>]*><i class="fa-solid fa-eye-slash" aria-hidden="true"><\/i> Hide from players<\/button>/);
 game.user=alice;html=await lastApp.render();assert.doesNotMatch(html,/hide-from-players|reveal-to-players|agq-vis-/);
 game.user=gm;
});
test('hiding from the row writes only revealed:false, keeps status/progress/notes, removes the player projection, and keeps focus on the same button', async()=>{
 game.user=gm;await mod.api.open();lastApp.tab='party';lastApp.unsavedSource=false;
 let state=structuredClone(st);Object.assign(state,{progress:{a:'complete'},partyNotes:'[TEST] note',objectiveReveal:['a']});
 priv.getFlag=(m,k)=>m===MOD?{private:true,source:src,state}[k]:undefined;
 priv.update=async d=>{written.push(d);const k=Object.keys(d)[0];if(k.endsWith('.state'))state=d[k];};
 const pubIdx=journal.indexOf(pub);pub.delete=async()=>{written.push('delete');journal.splice(journal.indexOf(pub),1);};
 await lastApp.render();written.length=0;notes.length=0;
 await lastApp.action({dataset:{action:'hide-from-players',id:src.id}},null);
 const upd=written.find(w=>typeof w==='object');
 assert.equal(state.revealed,false);assert.equal(state.status,'Active');assert.deepEqual(state.progress,{a:'complete'});assert.equal(state.partyNotes,'[TEST] note');assert.deepEqual(state.objectiveReveal,['a']);
 assert.ok(upd);assert.ok(written.includes('delete'),'the player-facing projection was removed');
 game.user=alice;assert.deepEqual(mod.api.listVisible().map(v=>v.id),[],'gone from the player API');
 alice.flags.tracking={ids:[src.id],visible:true};assert.deepEqual(mod.api.tracking.get(),[],'a player who tracked it now tracks nothing visible: the tracker drops it without error');
 assert.equal(overlay&&overlay.innerHTML.includes('[TEST] Lantern'),false,'a tracker no longer lists it');
 game.user=gm;
 const html=await lastApp.render();
 assert.match(html,/id="agq-vis-QUEST-TEST-LANTERN"[^>]*data-action="reveal-to-players"[^>]*>[\s\S]*Reveal to players/);
 assert.match(html,/Hidden from players/);
 assert.deepEqual(notes.at(-1),['info','[TEST] Lantern is hidden from players. Reveal to players brings it back as it was.']);
 // un-hide restores: the same state fields flip back (status unchanged).
 const {planShowReveal}=await import('../scripts/show-to-players.mjs');
 const plan=planShowReveal(src,state);assert.deepEqual(plan.patch,{revealed:true});
 journal.splice(pubIdx,0,pub);
});
test('a player cannot hide or reveal (data layer refuses), and nothing is written', async()=>{
 game.user=alice;written.length=0;notes.length=0;
 await lastApp.action({dataset:{action:'hide-from-players',id:src.id}},null);
 await lastApp.action({dataset:{action:'reveal-to-players',id:src.id}},null);
 assert.deepEqual(written,[]);assert.equal(notes.filter(n=>n[0]==='error').length,2);
 assert.throws(()=>mod.api.setGMState(src.id,{revealed:false}),/GM permission/);
 game.user=gm;
});
