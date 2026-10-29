// 0.28.0 Show to Players. Mocked Foundry only: this proves the logic and the wiring (who may send, who accepts, what is
// on the wire, what is written), not the live Foundry socket, windows or focus behaviour.
import test from 'node:test';import assert from 'node:assert/strict';
import {MOD} from '../scripts/core.mjs';
import {createShowToPlayers,showQuestFlow,planShowReveal,SHOW_SOCKET_TYPE,SHOW_MIN_GAP_MS} from '../scripts/show-to-players.mjs';

const gm={id:'gm',isGM:true,active:true},alice={id:'alice',isGM:false,active:true},bob={id:'bob',isGM:false,active:true},carl={id:'carl',isGM:false,active:false};
const users=[gm,alice,bob,carl];users.get=id=>users.find(u=>u.id===id);
const KEY='AbCdEfGh12345678';
const view={id:'QUEST-TEST-LANTERN',name:'[TEST] Lantern',objective_kind:'quest',status:'Active',scope:'party',objectives:[{key:'a',goal:'[TEST] Light it'}]};

// A little world: one clock, one wire, one player client per user.
function world({observers=['alice','bob'],access=true,autoOpen=true,busy=false,docs=null}={}){
 const log={emitted:[],opened:[],notes:[],writes:0};let t=100000;
 const doc={id:KEY,getFlag:(m,k)=>m===MOD?({public:true,view})[k]:undefined,testUserPermission:u=>u.isGM||observers.includes(u.id),update:async()=>{log.writes++;},delete:async()=>{log.writes++;}};
 const state={access,autoOpen,busy,doc,journal:docs??[doc],visible:[{document:doc,view}],now:()=>t,advance:ms=>{t+=ms;}};
 const make=me=>createShowToPlayers({moduleId:MOD,user:()=>me,users:()=>users,socket:{emit:(ch,msg,opts)=>log.emitted.push({ch,msg,opts,from:me.id})},
  access:()=>state.access,now:state.now,sleep:async()=>{},projection:id=>id===view.id?state.doc:null,
  visibleViews:()=>me.isGM||state.doc.testUserPermission(me,'OBSERVER')?state.visible:[],journalDoc:k=>state.journal.find(d=>d.id===k)??null,
  autoOpen:()=>state.autoOpen,busy:()=>state.busy,openQuest:async id=>{log.opened.push([me.id,id]);},notify:m=>log.notes.push([me.id,m])});
 return {state,log,make,gmSide:make(gm),playerSide:u=>make(u)};
}

test('GM sends only an opaque key, to connected players who may see the quest', async()=>{
 const w=world({observers:['alice']});
 const res=await w.gmSide.send(view.id);
 assert.deepEqual(res,{status:'sent',count:1});
 assert.equal(w.log.emitted.length,1);
 const [e]=w.log.emitted;
 assert.equal(e.ch,`module.${MOD}`);
 assert.deepEqual(e.msg,{type:SHOW_SOCKET_TYPE,key:KEY},'the whole message is a type and a key');
 assert.deepEqual(e.opts,{recipients:['alice']},'per-player visibility: bob cannot see it, carl is not connected, the GM is not a recipient');
 const wire=JSON.stringify(e.msg);
 for(const secret of [view.id,view.name,'Light it','objectives','reward','notes'])assert.ok(!wire.includes(secret),`${secret} stays off the wire`);
 assert.equal(w.log.writes,0,'nothing is written to world data');
});
test('a player cannot broadcast', async()=>{
 const w=world();
 await assert.rejects(()=>w.playerSide(alice).send(view.id),/GM permission/);
 assert.equal(w.log.emitted.length,0);
});
test('a forged show message from a player is ignored by every receiver', async()=>{
 const w=world();
 const bobClient=w.playerSide(bob);
 assert.equal(await bobClient.onSocket({type:SHOW_SOCKET_TYPE,key:KEY},'alice'),true,'recognised as a show message');
 assert.deepEqual(w.log.opened,[]);assert.deepEqual(w.log.notes,[],'no toast either');
 assert.equal(await bobClient.onSocket({type:SHOW_SOCKET_TYPE,key:KEY},'nobody'),true);
 assert.deepEqual(w.log.opened,[]);
});
test('players receive the GM message and open the quest', async()=>{
 const w=world();
 assert.equal(await w.playerSide(alice).onSocket({type:SHOW_SOCKET_TYPE,key:KEY},'gm'),true);
 assert.deepEqual(w.log.opened,[['alice',view.id]]);assert.deepEqual(w.log.notes,[]);
 assert.equal(await w.playerSide(alice).onSocket({type:'journal-request'},'gm'),false,'other message types are left to the Game Journal');
});
test('GM clients open nothing, even for another GM message', async()=>{
 const w=world();const gm2={id:'gm2',isGM:true,active:true};users.push(gm2);
 try{await w.make(gm2).onSocket({type:SHOW_SOCKET_TYPE,key:KEY},'gm');await w.gmSide.onSocket({type:SHOW_SOCKET_TYPE,key:KEY},'gm2');}finally{users.pop();}
 assert.deepEqual(w.log.opened,[]);
});
test('recipients that fail the visibility check open nothing and show no error', async()=>{
 const w=world({observers:['alice']});
 await w.playerSide(bob).onSocket({type:SHOW_SOCKET_TYPE,key:KEY},'gm');           // no OBSERVER permission
 assert.deepEqual([w.log.opened,w.log.notes],[[],[]]);
 w.state.visible=[];await w.playerSide(alice).onSocket({type:SHOW_SOCKET_TYPE,key:KEY},'gm'); // Quest Log's own list says no
 assert.deepEqual([w.log.opened,w.log.notes],[[],[]]);
 w.state.visible=[{document:w.state.doc,view}];w.state.access=false;w.state.advance(5000);
 await w.playerSide(alice).onSocket({type:SHOW_SOCKET_TYPE,key:KEY},'gm');          // Player Access is off
 assert.deepEqual([w.log.opened,w.log.notes],[[],[]]);
 w.state.access=true;w.state.advance(5000);
 await w.playerSide(alice).onSocket({type:SHOW_SOCKET_TYPE,key:'0000000000000000'},'gm'); // key that is no document
 await w.playerSide(alice).onSocket({type:SHOW_SOCKET_TYPE,key:{$ne:1}},'gm');w.state.advance(5000);
 await w.playerSide(alice).onSocket({type:SHOW_SOCKET_TYPE,key:'../../x'},'gm');
 assert.deepEqual([w.log.opened,w.log.notes],[[],[]]);
 const notPublic={...w.state.doc,id:'ZZZZZZZZZZZZZZZZ',getFlag:(m,k)=>m===MOD&&k==='private'?true:undefined,testUserPermission:()=>true};
 w.state.journal.push(notPublic);w.state.advance(5000);
 await w.playerSide(alice).onSocket({type:SHOW_SOCKET_TYPE,key:'ZZZZZZZZZZZZZZZZ'},'gm'); // a GM-only quest source is never a show target
 assert.deepEqual([w.log.opened,w.log.notes],[[],[]]);
});
test('a view that has not reached the player yet is waited for, a few times', async()=>{
 const w=world();const present=w.state.journal.slice();w.state.journal.length=0;let sleeps=0;
 const client=createShowToPlayers({moduleId:MOD,user:()=>alice,users:()=>users,socket:{emit(){}},access:()=>true,now:w.state.now,
  sleep:async()=>{if(++sleeps===2)w.state.journal.push(...present);},projection:()=>null,visibleViews:()=>w.state.visible,journalDoc:k=>w.state.journal.find(d=>d.id===k)??null,
  autoOpen:()=>true,busy:()=>false,openQuest:async id=>{w.log.opened.push([alice.id,id]);},notify:()=>{}});
 await client.onSocket({type:SHOW_SOCKET_TYPE,key:KEY},'gm');
 assert.deepEqual(w.log.opened,[['alice',view.id]]);assert.equal(sleeps,2);
});
test('the player window switches to the quest (one window, opened by id) and repeated messages are rate limited', async()=>{
 const w=world();const c=w.playerSide(alice);
 await c.onSocket({type:SHOW_SOCKET_TYPE,key:KEY},'gm');
 await c.onSocket({type:SHOW_SOCKET_TYPE,key:KEY},'gm');
 assert.equal(w.log.opened.length,1,'a second message inside the gap does nothing');
 w.state.advance(SHOW_MIN_GAP_MS);await c.onSocket({type:SHOW_SOCKET_TYPE,key:KEY},'gm');
 assert.equal(w.log.opened.length,2,'allowed again after the gap');
 // GM side too.
 const g=world();assert.equal((await g.gmSide.send(view.id)).status,'sent');
 assert.equal((await g.gmSide.send(view.id)).status,'rate_limited');assert.equal(g.log.emitted.length,1);
 g.state.advance(SHOW_MIN_GAP_MS);assert.equal((await g.gmSide.send(view.id)).status,'sent');
});
test('auto-open off, or the player typing in the Quest Log: a notification only, no window change', async()=>{
 const off=world({autoOpen:false});await off.playerSide(alice).onSocket({type:SHOW_SOCKET_TYPE,key:KEY},'gm');
 assert.deepEqual(off.log.opened,[]);assert.equal(off.log.notes.length,1);assert.match(off.log.notes[0][1],/\[TEST\] Lantern/);
 const typing=world({busy:true});await typing.playerSide(alice).onSocket({type:SHOW_SOCKET_TYPE,key:KEY},'gm');
 assert.deepEqual(typing.log.opened,[]);assert.equal(typing.log.notes.length,1);
});
test('nothing is sent when Player Access is off, the quest is unpublished, or nobody connected may see it', async()=>{
 assert.equal((await world({access:false}).gmSide.send(view.id)).status,'player_access_off');
 assert.equal((await world().gmSide.send('QUEST-NOT-PUBLISHED')).status,'not_visible');
 const none=world({observers:[]});assert.deepEqual(await none.gmSide.send(view.id),{status:'no_recipients',count:0});assert.equal(none.log.emitted.length,0);
});

// ---- the GM's flow: confirmation before any reveal ----
const entry=(src={},st={})=>({source:{id:view.id,entity_type:'Objective',objective_kind:'quest',status:'approved',version:'0.1.0',provenance:{sources:['synthetic']},visibility:'reveal_gated',refs:[],name:'[TEST] Lantern',source:{},public_summary:'',objectives:[{key:'a',goal:'x',visibility:'player'}],locations:[],parameters:{},outcomes:{},...src},
 state:{status:'Hidden',scope:'party',actorId:null,revealed:false,objectiveReveal:[],progress:{},partyNotes:'',gmNotes:'',rewardRecorded:false,...st}});
function flow(e,{ok=true,dirty=false,sendStatus='sent'}={}){
 const calls={confirm:[],info:[],update:[],send:[],notes:[]};
 return {calls,deps:{entries:()=>[e],confirm:async(m,o)=>{calls.confirm.push([m,o]);return ok;},info:async(t,m)=>{calls.info.push([t,m]);},
  updateState:async(id,p)=>{calls.update.push([id,p]);},send:async id=>{calls.send.push(id);return sendStatus==='sent'?{status:'sent',count:2}:{status:sendStatus};},
  sleep:async()=>{},dirty:()=>dirty,notify:(m,k)=>calls.notes.push([m,k])}};
}
test('a visible quest is shown straight away and the GM hears how many players', async()=>{
 const f=flow(entry({},{status:'Active',revealed:true}));
 assert.equal((await showQuestFlow(view.id,f.deps)).status,'sent');
 assert.deepEqual(f.calls.confirm,[]);assert.deepEqual(f.calls.update,[]);assert.deepEqual(f.calls.notes,[['Shown to 2 players.','info']]);
});
test('a hidden quest asks "Reveal it, then show it?" and reveals nothing unless the GM agrees', async()=>{
 const no=flow(entry(),{ok:false});
 assert.equal((await showQuestFlow(view.id,no.deps)).status,'cancelled');
 assert.equal(no.calls.confirm[0][1].title,'Reveal it, then show it?');assert.equal(no.calls.confirm[0][1].yes,'Reveal and show','a labelled button, not OK/Yes');
 assert.deepEqual(no.calls.update,[]);assert.deepEqual(no.calls.send,[]);
 const yes=flow(entry());
 assert.equal((await showQuestFlow(view.id,yes.deps)).status,'sent');
 assert.deepEqual(yes.calls.update,[[view.id,{revealed:true,status:'Available'}]]);assert.match(yes.calls.confirm[0][0],/Hidden to Available/);
 assert.deepEqual(yes.calls.send,[view.id],'sent after the reveal');
 await assert.rejects(()=>showQuestFlow(view.id,flow(entry(),{dirty:true}).deps),/Save or cancel/);
});
test('drafts and GM-only definitions are refused, never revealed', async()=>{
 for(const e of [entry({status:'draft'}),entry({visibility:'gm'},{status:'Available'})]){
  const f=flow(e);assert.equal((await showQuestFlow(view.id,f.deps)).status,'refused');
  assert.equal(f.calls.info.length,1);assert.deepEqual(f.calls.update,[]);assert.deepEqual(f.calls.send,[]);assert.deepEqual(f.calls.confirm,[]);
 }
 assert.ok(planShowReveal(entry({status:'draft'}).source,entry().state).refuse);
 assert.deepEqual(planShowReveal(entry().source,entry({}, {status:'Active',revealed:true}).state),{visible:true});
 assert.deepEqual(planShowReveal(entry({visibility:'player'}).source,entry({}, {status:'Hidden'}).state).patch,{status:'Available'});
});
test('GM notifications for nobody connected, Player Access off and repeats', async()=>{
 for(const [s,re] of [['no_recipients',/No connected player/],['player_access_off',/hidden from players/],['rate_limited',/moment ago/],['not_visible',/cannot see/]]){
  const f=flow(entry({},{status:'Active',revealed:true}),{sendStatus:s});await showQuestFlow(view.id,f.deps);assert.match(f.calls.notes[0][0],re);
 }
});

// ---- 0.30.0 Hide / Reveal as a pair ----
import {planHide,hideFlow,revealFlow} from '../scripts/show-to-players.mjs';
const src={id:'QUEST-TEST-LANTERN',entity_type:'Objective',objective_kind:'quest',status:'approved',version:'0.1.0',provenance:{sources:['synthetic']},visibility:'reveal_gated',refs:[],name:'[TEST] Lantern',source:{},public_summary:'',objectives:[{key:'a',goal:'[TEST] Light it',visibility:'player'}],locations:[],parameters:{},outcomes:{}};
const state={status:'Active',scope:'party',actorId:null,revealed:false,objectiveReveal:[],progress:{},partyNotes:'',gmNotes:'',rewardRecorded:false};
test('hide keeps the quest: reveal-gated only clears revealed; a player-visible one goes Hidden and remembers its status; reveal puts it back', async()=>{
 const gated={...src,visibility:'reveal_gated'},open={...src,visibility:'player'};
 const sActive={...state,status:'Active',revealed:true};
 assert.deepEqual(planHide(gated,sActive).patch,{revealed:false});
 const h=planHide(open,sActive).patch;assert.deepEqual(h,{revealed:false,status:'Hidden',statusBeforeHide:'Active'});
 assert.deepEqual(planHide(gated,{...sActive,revealed:false}),{noop:true});
 const back=planShowReveal(open,{...sActive,...h});
 assert.equal(back.patch.status,'Active');assert.equal(back.patch.statusBeforeHide,null);
 assert.equal(planShowReveal(open,{...sActive,status:'Hidden'}).patch.status,'Available','no memory: Available as before');
});
test('hideFlow updates through updateState (GM-only there) and says so; a dirty editor is refused; reveal needs no confirmation', async()=>{
 const calls=[],say=[];
 const e={source:{...src,visibility:'reveal_gated'},state:{...state,revealed:true,status:'Active'}};
 const deps={entries:()=>[e],updateState:async(id,p)=>calls.push([id,p]),notify:(m)=>say.push(m),dirty:()=>false};
 assert.deepEqual(await hideFlow(src.id,deps),{status:'hidden'});assert.deepEqual(calls,[[src.id,{revealed:false}]]);
 await assert.rejects(()=>hideFlow(src.id,{...deps,dirty:()=>true}),/Save or cancel/);
 const hiddenEntry={source:e.source,state:{...e.state,revealed:false}};
 let asked=0;const d2={entries:()=>[hiddenEntry],updateState:async(id,p)=>calls.push([id,p]),send:async()=>({status:'sent',count:2}),sleep:async()=>{},notify:m=>say.push(m),dirty:()=>false,confirm:async()=>{asked++;return false;},info:async()=>{}};
 calls.length=0;assert.equal((await revealFlow(src.id,d2)).status,'sent');assert.equal(asked,0);assert.deepEqual(calls,[[src.id,{revealed:true}]]);
});
