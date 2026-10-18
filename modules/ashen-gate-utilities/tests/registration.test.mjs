import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,VERSION} from '../scripts/core.mjs';
const handlers={once:new Map(),on:new Map()};
globalThis.HTMLElement=class {};
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(){this.rendered=false;}async render(){this.rendered=true;return this;}async close(){this.rendered=false;}}}}};
const gm={id:'gm',isGM:true,active:true};
const settings=new Map();
globalThis.game={user:gm,settings:{register:(namespace,key,opts)=>settings.set(`${namespace}.${key}`,{value:opts.default,onChange:opts.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}},modules:new Map([[ID,{id:ID,api:{},active:true}]]),actors:[],tables:[],users:[],messages:new Map()};
globalThis.ui={actors:null,notifications:{info:()=>{},error:()=>{}}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>{handlers.on.set(k,fn);return 123;},off:()=>{}};
await import('../scripts/main.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
test('registers three module-owned world settings',()=>{assert.equal(settings.size,3);assert.equal(settings.get(`${ID}.playerAccessEnabled`).value,false);});
test('publishes working and versioned public Open API',()=>{const api=game.modules.get(ID).api;assert.equal(api.version,VERSION);assert.equal(typeof api.open,'function');});
test('Player Access conforms to ag-player-access/1',()=>{const s=game.modules.get(ID).api.playerAccess.getState();assert.deepEqual(s,{contract:'ag-player-access/1',moduleId:ID,audience:'player',playerAccessEnabled:false,configurable:true});});
test('Player Access rejects unauthorized user writes',async()=>{const api=game.modules.get(ID).api.playerAccess;game.user={id:'player',isGM:false};await assert.rejects(api.setEnabled(true),/GM only/);game.user=gm;assert.equal(game.settings.get(ID,'playerAccessEnabled'),false);});
test('Player Access only accepts booleans and persists',async()=>{const api=game.modules.get(ID).api.playerAccess;await assert.rejects(api.setEnabled('yes'),/Boolean required/);await api.setEnabled(true);assert.equal(api.getState().playerAccessEnabled,true);await api.setEnabled(false);});
test('player cannot open when hidden',async()=>{game.user={id:'player',isGM:false};await assert.rejects(game.modules.get(ID).api.open(),/hidden/);game.user=gm;});
test('GM can open while player access hidden',async()=>{const app=await game.modules.get(ID).api.open();assert.equal(app.rendered,true);});
test('registers Actor sidebar hooks and chat evidence consumer',()=>{assert.equal(typeof handlers.on.get('renderActorDirectory'),'function');assert.equal(typeof handlers.on.get('createChatMessage'),'function');});

import {createSession} from '../scripts/core.mjs';
test('GM accepts server-authored native chat roll evidence and rejects a replay',async()=>{
 const player={id:'player',name:'Player',isGM:false,active:true};game.users=[gm,player];game.users.get=id=>game.users.find(u=>u.id===id);
 const actor={id:'pc01',name:'PC',type:'character',testUserPermission:u=>u.id==='player',statuses:new Set(),items:[],getFlag:()=>null};
 game.actors=[actor];game.actors.get=id=>game.actors.find(a=>a.id===id);game.actors.find=Array.prototype.find;
 game.messages=new Map();game.user=gm;
 const s=createSession({id:'s1',name:'Test',createdBy:'gm',kind:'group',actors:[actor.id],skills:['prc'],dc:15});await game.settings.set(ID,'activeSession',s);
 const proof={id:'proof1',author:player,speaker:{actor:actor.id},rolls:[{total:17}]};game.messages.set(proof.id,proof);
 const submission={id:'submit1',author:player,flags:{[ID]:{submission:{contract:'ag-utility-roll/0.1',sessionId:s.id,actorId:actor.id,skill:'prc',total:17,proofMessageId:'proof1'}}}};
 handlers.on.get('createChatMessage')(submission);
 await new Promise(r=>setTimeout(r,15));
 assert.deepEqual(game.settings.get(ID,'activeSession'),{});
 assert.equal(game.settings.get(ID,'history').length,1);
 assert.equal(game.settings.get(ID,'history')[0].slots[0].total,17);
 handlers.on.get('createChatMessage')(submission);await new Promise(r=>setTimeout(r,10));
 assert.equal(game.settings.get(ID,'history').length,1);
});
test('unauthorized Actor submission cannot change session',async()=>{
 const intruder={id:'intruder',isGM:false,active:true};game.users.push(intruder);
 const s=createSession({id:'s2',name:'Test 2',createdBy:'gm',actors:['pc01'],skills:['ath']});await game.settings.set(ID,'activeSession',s);
 const proof={id:'proof2',author:intruder,speaker:{actor:'pc01'},rolls:[{total:20}]};game.messages.set(proof.id,proof);
 handlers.on.get('createChatMessage')({id:'submit2',author:intruder,flags:{[ID]:{submission:{contract:'ag-utility-roll/0.1',sessionId:'s2',actorId:'pc01',skill:'ath',total:20,proofMessageId:'proof2'}}}});
 await new Promise(r=>setTimeout(r,10));assert.equal(game.settings.get(ID,'activeSession').slots[0].status,'pending');
});
test('GM-only tools are not rendered for a player',async()=>{
 const user=game.users.find(u=>u.id==='player');game.user=user;await game.settings.set(ID,'playerAccessEnabled',true);
 const app=await game.modules.get(ID).api.open();
 globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[]};game.i18n={localize:x=>x};
 const html=await app._renderHTML();assert.ok(html.includes('Group Checks'));assert.ok(!html.includes('GM Setup'));
 game.user=gm;
});

test('ended sessions archive and do not block the next valid character selection',async()=>{
 game.user=gm;
 globalThis.confirm=()=>true;
 const s=createSession({id:'v2-session-a',name:'First Group',kind:'group',actors:['pc01'],skills:['ath'],createdBy:'gm',dc:15});
 await game.settings.set(ID,'activeSession',s);
 const app=await game.modules.get(ID).api.open();app.tab='checks';
 await app.handle('resolve',{disabled:false},{querySelector:()=>null});
 assert.deepEqual(game.settings.get(ID,'activeSession'),{});
 assert.equal(game.settings.get(ID,'history')[0].id,'v2-session-a');
 const root={
  querySelectorAll(q){if(q.includes('participant'))return[{value:'pc01'}];if(q.includes('skill'))return[{value:'prc'}];return[];},
  querySelector(q){const values={'#agu-title':{value:'Second Group'},'#agu-dc':{value:'15'},'#agu-roll-count':{value:'1'}};return values[q]??null;}
 };
 await app.handle('start',{disabled:false},root);
 assert.equal(game.settings.get(ID,'activeSession').name,'Second Group');
 assert.equal(game.settings.get(ID,'activeSession').slots.length,1);
});
test('completed Group Check never appears in Roll Requests as a live request',async()=>{
 game.user=gm;
 const s=createSession({id:'v2-session-b',name:'ONLY GROUP',kind:'group',actors:['pc01'],skills:['prc'],createdBy:'gm'});
 await game.settings.set(ID,'activeSession',s);
 const app=await game.modules.get(ID).api.open();app.tab='rolls';
 const html=await app._renderHTML();assert.ok(html.includes('Roll Request is currently active')===false);assert.ok(html.includes('Group Check is currently active'));assert.ok(html.includes('No Roll Request active'));
 assert.ok(!html.includes('Roll Now'));
});
test('party stash remains hidden to players even when Actor observer permission exists',async()=>{
 const player=game.users.find(u=>u.id==='player');
 const stash={id:'stash',name:'SECRET STASH',type:'npc',getFlag:()=>true,items:[{name:'GM PRIVATE ITEM',system:{quantity:1}}],testUserPermission:()=>true};
 game.actors.push(stash);game.user=player;await game.settings.set(ID,'playerAccessEnabled',true);
 const app=await game.modules.get(ID).api.open();app.tab='inventory';
 const html=await app._renderHTML();assert.ok(html.includes('Observer permission'));assert.ok(!html.includes('GM PRIVATE ITEM'));assert.ok(!html.includes('Create GM-only Party Stash'));
 game.user=gm;
});
test('RollTables with document results are rejected before invoking roll',async()=>{
 let rolled=0;const t={id:'table1',name:'Document Results',results:[{type:1}],roll:async()=>{rolled++;}};
 game.tables=[t];game.tables.get=id=>game.tables.find(x=>x.id===id);game.user=gm;
 const app=await game.modules.get(ID).api.open();app.tab='tables';
 await assert.rejects(app.handle('table-roll',{disabled:false},{querySelector:q=>q==='#agu-table'?{value:'table1'}:null}),/document\/compendium/);
 assert.equal(rolled,0);
});
test('player-facing pending roll is prominent and group/roll request states differ',async()=>{
 const player=game.users.find(u=>u.id==='player');game.user=player;await game.settings.set(ID,'playerAccessEnabled',true);
 const session=createSession({id:'v2-request',name:'Party Perception',kind:'request',actors:['pc01'],skills:['prc'],createdBy:'gm'});
 await game.settings.set(ID,'activeSession',session);
 const app=await game.modules.get(ID).api.open();app.tab='rolls';
 let h=await app._renderHTML();assert.ok(h.includes('Your roll is requested'));assert.ok(h.includes('Roll Now'));
 app.tab='checks';h=await app._renderHTML();assert.ok(h.includes('No Group Check active'));assert.ok(!h.includes('Roll Now'));
 game.user=gm;
});
