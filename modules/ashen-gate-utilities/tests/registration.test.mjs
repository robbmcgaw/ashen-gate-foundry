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
test('registers module-owned settings',()=>{assert.equal(settings.size,17);assert.equal(settings.get(`${ID}.shopsEnabled`).value,false);assert.equal(settings.get(`${ID}.shopPurseVote`).value,'');assert.equal(settings.get(`${ID}.electrumEnabled`).value,false);assert.equal(settings.get(`${ID}.playerAccessEnabled`).value,false);});
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
 const html=await app._renderHTML();assert.ok(html.includes('>Rolls<'));assert.ok(!html.includes('Group Checks')&&!html.includes('Roll Requests'));assert.ok(!html.includes('GM Setup'));
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
test('an active Group Check shows in the one Rolls tab (old ids map there) and the GM gets no second start form',async()=>{
 game.user=gm;
 const s=createSession({id:'v2-session-b',name:'ONLY GROUP',kind:'group',actors:['pc01'],skills:['prc'],createdBy:'gm'});
 await game.settings.set(ID,'activeSession',s);
 const app=await game.modules.get(ID).api.open();
 for(const old of ['checks','rolls']){app.tab=old;const html=await app._renderHTML();assert.equal(app.tab,'rolls');assert.ok(html.includes('ONLY GROUP'));assert.ok(html.includes('Group Check'));assert.ok(!html.includes('Start Rolls'));assert.ok(html.includes('Another active interaction is in progress'));}
});
test('party stash stays hidden to players while the GM has it turned off, even with Observer permission',async()=>{
 const player=game.users.find(u=>u.id==='player');
 const stash={id:'stash',name:'SECRET STASH',type:'npc',getFlag:()=>true,items:[{name:'GM PRIVATE ITEM',system:{quantity:1}}],testUserPermission:()=>true};
 game.actors.push(stash);game.user=player;await game.settings.set(ID,'playerAccessEnabled',true);
 const app=await game.modules.get(ID).api.open();app.tab='inventory';
 const html=await app._renderHTML();assert.ok(html.includes('turned the party stash off'));assert.ok(!html.includes('GM PRIVATE ITEM'));assert.ok(!html.includes('Create Party Stash'));
 await assert.rejects(game.modules.get(ID).api.stash.open(),/turned the party stash off/);
 game.user=gm;
});
test('RollTables with document results are drawn with Foundry draw and linked',async()=>{
 let drew=0,opts=null;
 const t={id:'table1',name:'Document Results',results:[{type:'document'}],draw:async o=>{drew++;opts=o;return {results:[{type:'document',name:'Iron Key',documentUuid:'Compendium.world.keys.Item.abc'},{type:'text',name:'',description:'<p>Rust flakes</p>'}]};}};
 game.tables=[t];game.tables.get=id=>game.tables.find(x=>x.id===id);game.user=gm;
 const app=await game.modules.get(ID).api.open();app.tab='tables';
 await app.handle('table-roll',{disabled:false},{querySelector:q=>q==='#agu-table'?{value:'table1'}:null});
 assert.equal(drew,1);assert.equal(opts.displayChat,false);
 assert.equal(app.tableDraft,'@UUID[Compendium.world.keys.Item.abc]{Iron Key}\nRust flakes');
 const html=await app._renderHTML();assert.ok(html.includes('data-open-uuid="Compendium.world.keys.Item.abc"'));assert.ok(html.includes('Iron Key'));
});
test('finished Group Check persists for everyone until the GM clears it, and tallies to GM chat',async()=>{
 const chats=[];globalThis.ChatMessage={create:async m=>{chats.push(m);return m;},getSpeaker:()=>({})};
 const player=game.users.find(u=>u.id==='player');game.user=gm;game.users.get=id=>game.users.find(u=>u.id===id);
 await game.settings.set(ID,'activeSession',{});await game.settings.set(ID,'lastResult',{});
 globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[]};game.i18n={localize:x=>x};
 const s=createSession({id:'persist1',name:'Climb the Wall',kind:'group',actors:['pc01'],skills:['ath'],createdBy:'gm',dc:10});
 await game.settings.set(ID,'activeSession',s);
 const proof={id:'proof-p1',author:player,speaker:{actor:'pc01'},rolls:[{total:14}]};game.messages.set(proof.id,proof);
 handlers.on.get('createChatMessage')({id:'submit-p1',author:player,flags:{[ID]:{submission:{contract:'ag-utility-roll/0.1',sessionId:'persist1',actorId:'pc01',skill:'ath',total:14,proofMessageId:'proof-p1'}}}});
 await new Promise(r=>setTimeout(r,20));
 assert.deepEqual(game.settings.get(ID,'activeSession'),{});
 const kept=game.settings.get(ID,'lastResult');assert.equal(kept.name,'Climb the Wall');assert.deepEqual(kept.audit,[]);assert.equal(kept.slots[0].userId,null);
 assert.equal(chats.length,1);assert.deepEqual(chats[0].whisper,['gm']);assert.ok(chats[0].content.includes('Climb the Wall')&&chats[0].content.includes('Success')&&chats[0].content.includes('14'));
 // Players still see it, with no Clear control; the GM sees Clear Result.
 game.user=player;await game.settings.set(ID,'playerAccessEnabled',true);
 let app=await game.modules.get(ID).api.open();app.tab='checks';
 let html=await app._renderHTML();assert.ok(html.includes('Climb the Wall'));assert.ok(html.includes('Success'));assert.ok(!html.includes('Clear Result'));
 await assert.rejects(app.handle('clear-result',{disabled:false},{}),/GM only/);
 game.user=gm;app=await game.modules.get(ID).api.open();app.tab='checks';
 html=await app._renderHTML();assert.ok(html.includes('Clear Result'));
 await app.handle('clear-result',{disabled:false},{});
 assert.deepEqual(game.settings.get(ID,'lastResult'),{});
 html=await app._renderHTML();assert.ok(!html.includes('Climb the Wall'));
});
test('a Group Check tally that cannot reach chat warns the GM and still keeps the result',async()=>{
 const warns=[],origWarn=ui.notifications.warn,origConsole=console.warn;ui.notifications.warn=m=>warns.push(m);console.warn=()=>{};
 globalThis.ChatMessage={create:async()=>{throw Error('[TEST] chat refused');},getSpeaker:()=>({})};
 try{
  const player=game.users.find(u=>u.id==='player');game.user=gm;
  await game.settings.set(ID,'activeSession',{});await game.settings.set(ID,'lastResult',{});
  const s=createSession({id:'tally-fail',name:'[TEST] Ford the River',kind:'group',actors:['pc01'],skills:['ath'],createdBy:'gm',dc:10});
  await game.settings.set(ID,'activeSession',s);
  const proof={id:'proof-tf',author:player,speaker:{actor:'pc01'},rolls:[{total:12}]};game.messages.set(proof.id,proof);
  handlers.on.get('createChatMessage')({id:'submit-tf',author:player,flags:{[ID]:{submission:{contract:'ag-utility-roll/0.1',sessionId:'tally-fail',actorId:'pc01',skill:'ath',total:12,proofMessageId:'proof-tf'}}}});
  await new Promise(r=>setTimeout(r,20));
  assert.equal(game.settings.get(ID,'lastResult').name,'[TEST] Ford the River');
  assert.equal(warns.length,1);assert.match(warns[0],/\[TEST\] Ford the River.*\[TEST\] chat refused.*result is saved/);
 }finally{ui.notifications.warn=origWarn;console.warn=origConsole;}
});
test('unknown statuses are traced to their effect and the GM can remove them',async()=>{
 game.user=gm;globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[{id:'prone',name:'Prone'}]};game.i18n={localize:x=>x};globalThis.confirm=()=>true;
 const deleted=[];
 const effect={id:'fx1',name:'Mind Haze',statuses:new Set(['thinking']),origin:'Actor.pc01.Item.spell1',disabled:false,parent:null};
 const actor={id:'pc01',name:'PC',type:'character',statuses:new Set(['prone','thinking']),effects:[effect],items:[],testUserPermission:()=>true,getFlag:()=>null,deleteEmbeddedDocuments:async(t,ids)=>{deleted.push(...ids);effect.disabled=true;actor.statuses.delete('thinking');}};
 effect.parent=actor;
 game.actors=[actor];game.actors.get=id=>game.actors.find(a=>a.id===id);
 const app=await game.modules.get(ID).api.open();app.tab='conditions';app.actorId='pc01';
 const html=await app._renderHTML();
 assert.ok(html.includes('Custom'));assert.ok(html.includes('Mind Haze'));assert.ok(html.includes('data-status="thinking"'));assert.ok(html.includes('data-status="prone"'));
 await app.handle('remove-status',{disabled:false,dataset:{status:'thinking'}},{});
 assert.deepEqual(deleted,['fx1']);
});
test('player-facing pending roll is prominent in the Rolls tab under either old tab id',async()=>{
 const player=game.users.find(u=>u.id==='player');game.user=player;await game.settings.set(ID,'playerAccessEnabled',true);
 const session=createSession({id:'v2-request',name:'Party Perception',kind:'request',actors:['pc01'],skills:['prc'],createdBy:'gm'});
 await game.settings.set(ID,'activeSession',session);
 const app=await game.modules.get(ID).api.open();app.tab='rolls';
 let h=await app._renderHTML();assert.ok(h.includes('Your roll is requested'));assert.ok(h.includes('Roll Now'));
 app.tab='checks';h=await app._renderHTML();assert.ok(h.includes('Roll Now'));assert.ok(h.includes('Roll Request'));
 game.user=gm;
});

test('0.7.3: a roll that cannot be counted is reported to the player, not dropped silently',async()=>{
 game.user=gm;const chats=[];globalThis.ChatMessage={create:async m=>{chats.push(m);return m;},getSpeaker:()=>({})};
 try{
  const player={id:'p73',name:'P73',isGM:false,active:true};game.users.push(player);
  const actor={id:'pc73',name:'[TEST] PC73',type:'character',testUserPermission:u=>u.id==='p73',statuses:new Set(),items:[],getFlag:()=>null};game.actors.push(actor);
  await game.settings.set(ID,'activeSession',{});
  const proof={id:'proof73',author:player,speaker:{actor:actor.id},rolls:[{total:12}]};game.messages.set(proof.id,proof);
  handlers.on.get('createChatMessage')({id:'submit73',author:player,flags:{[ID]:{submission:{contract:'ag-utility-roll/0.1',sessionId:'gone',actorId:actor.id,skill:'prc',total:12,proofMessageId:'proof73'}}}});
  await new Promise(r=>setTimeout(r,15));
  assert.equal(chats.length,1);
  assert.match(chats[0].content,/Roll not counted for \[TEST\] PC73: That check has already ended/);
  assert.ok(chats[0].whisper.includes('p73')&&chats[0].whisper.includes('gm'),'whispered to the player and the GM only');
 }finally{delete globalThis.ChatMessage;}
});
