import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlayerIntentBridge,REQUEST_PATH} from '../js/player-intent-bridge.mjs';
import {previewPermanentVacancies,clearVerifiedDepartures} from '../js/staffing-reconciliation.mjs';
import {inspectFacilityRef} from '../js/source-resolver-adapter.mjs';
function env(){
 const gm={id:'gm',isGM:true,active:true};const owner={id:'alice',isGM:false,active:true};const outsider={id:'mallory',isGM:false,active:true};
 const users=new Map([[gm.id,gm],[owner.id,owner],[outsider.id,outsider]]);
 const game={user:gm,users:{activeGM:gm,get:(id)=>users.get(id)}};let listener;
 const hooks={on:(_key,fn)=>(listener=fn,'hook1'),off:()=>{listener=undefined}};
 const actor={id:'act1',testUserPermission:(u,level)=>u.id==='alice'&&level==='OWNER',update:async data=>{return data;}};
 let enabled=true, commits=[],processed=new Set(),receipts=[];
 const bridge=createPlayerIntentBridge({game,hooks,playerAccessEnabled:()=>enabled,isGuildMember:(u,a)=>a.id==='act1'&&u.id==='alice',alreadyProcessed:id=>processed.has(id),apply:async data=>{processed.add(data.requestId);commits.push(data);},recordReceipt:async data=>{receipts.push(data);},now:()=>100000,maxAgeMs:60000});
 const mk=(id='abcdeFGHijkl34',op='move')=>({id,op,payload:{key:'x',x:3,y:4,room_key:'common'},createdMs:99999});
 const send=async(intent,id='alice')=>{await listener(actor,{flags:{'ashen-gate-headquarters':{playerEditRequest:intent}}},{},id);await bridge.idle();};
 return {gm,owner,outsider,game,actor,bridge,mk,send,commits,processed,receipts,setEnabled:x=>enabled=x};
}
test('authenticated hook user identity drives principal, not claimed payload sender',async()=>{const t=env();const p=t.mk();p.payload.from='gm';await t.send(p,'alice');assert.equal(t.commits.length,1);assert.equal(t.commits[0].user.id,'alice');t.bridge.dispose();});
test('forged sender cannot use other player Actor',async()=>{const t=env();await t.send(t.mk(),'mallory');assert.equal(t.commits.length,0);assert.match(t.receipts[0].error,/ownership/);t.bridge.dispose();});
test('hidden Player Access rejects edits without touching world state',async()=>{const t=env();t.setEnabled(false);await t.send(t.mk());assert.equal(t.commits.length,0);assert.match(t.receipts[0].error,/hidden/);t.bridge.dispose();});
test('denies a GM-only operation sent by player',async()=>{const t=env();await t.send(t.mk('abcdeFGHijkl34','set_rank'));assert.equal(t.commits.length,0);t.bridge.dispose();});
test('rejects replay by GM-owned durable request ledger',async()=>{const t=env();await t.send(t.mk());await t.send(t.mk());assert.equal(t.commits.length,1);t.bridge.dispose();});
test('rejects stale requests and oversize',async()=>{const t=env();let p=t.mk();p.createdMs=10;await t.send(p);assert.equal(t.commits.length,0);p=t.mk();p.payload.large='a'.repeat(10000);await t.send(p);assert.equal(t.commits.length,0);t.bridge.dispose();});
test('client submission uses Actor.update with proper path; player must own Actor',async()=>{const t=env();t.game.user=t.owner;const r=await t.bridge.submit(t.actor,t.mk());assert.ok(r[REQUEST_PATH]);t.game.user=t.outsider;await assert.rejects(()=>t.bridge.submit(t.actor,t.mk()),/own/);t.bridge.dispose();});
const snapshot=()=>({headquarters_states:[{hq_ref:'HQ-DEMO',shared_revision:0,staffing_slots:[{key:'a',occupant_hireling_ref:'HIRE-ABC'},{key:'b',occupant_hireling_ref:'HIRE-DEF'}]}]});
test('Working off does not vacate staffing',()=>{const c=previewPermanentVacancies(snapshot(),[{hirelingRef:'HIRE-ABC',status:'working_off',verified:true}],{isGM:true});assert.equal(c.length,0);});
test('temporary absence does not vacate staffing',()=>{const c=previewPermanentVacancies(snapshot(),[{hirelingRef:'HIRE-ABC',status:'temporarily_away',verified:true}],{isGM:true});assert.equal(c.length,0);});
test('permanent death clears only exact occupancy; preserves source state',()=>{const state=snapshot();const c=previewPermanentVacancies(state,[{hirelingRef:'HIRE-ABC',status:'deceased',verified:true}],{isGM:true});const {next,cleared}=clearVerifiedDepartures(state,c);assert.equal(cleared,1);assert.equal(next.headquarters_states[0].staffing_slots[0].occupant_hireling_ref,null);assert.equal(next.headquarters_states[0].staffing_slots[1].occupant_hireling_ref,'HIRE-DEF');assert.equal(state.headquarters_states[0].staffing_slots[0].occupant_hireling_ref,'HIRE-ABC');});
test('unverified snapshot cannot evict; non-GM cannot reconcile',()=>{assert.deepEqual(previewPermanentVacancies(snapshot(),[{hirelingRef:'HIRE-ABC',status:'deceased',verified:false}],{isGM:true}),[]);assert.throws(()=>previewPermanentVacancies(snapshot(),[],{isGM:false}),/GM/);});
test('stale occupancy preview cannot evict replacement',()=>{const state=snapshot();const c=previewPermanentVacancies(state,[{hirelingRef:'HIRE-ABC',status:'departed',verified:true}],{isGM:true});state.headquarters_states[0].staffing_slots[0].occupant_hireling_ref='HIRE-DEF';const x=clearVerifiedDepartures(state,c);assert.equal(x.cleared,0);});
test('resolver optional, handles missing/archived/not_found/conflict and errors',async()=>{assert.equal((await inspectFacilityRef('FAC-DEMO',undefined)).status,'unavailable');assert.equal((await inspectFacilityRef('FAC-DEMO',()=>({status:'not_found'}))).status,'not_found');assert.equal((await inspectFacilityRef('FAC-DEMO',()=>({status:'conflict'}))).status,'conflict');assert.equal((await inspectFacilityRef('FAC-DEMO',()=>{throw Error('missing');})).status,'unavailable');assert.equal((await inspectFacilityRef('bad',()=>({status:'ok'}))).status,'invalid_id');});
import {createHQAuthoritativeWriter} from '../js/hq-authoritative-writer.mjs';
test('GM writer persists operation and replay receipt in one world-state write',async()=>{
 let state={state_revision:4,core:{headquarters_states:[{shared_revision:8,rooms:[]}]}};
 let saves=0;
 const writer=createHQAuthoritativeWriter({readState:()=>state,saveState:async n=>{saves++;state=n;},now:()=>10000,
   applyOperation:(s,user,op,payload)=>({...s,state_revision:s.state_revision+1,updated_by:user.id,updated_op:op})});
 const ctx={user:{id:'alice',isGM:false},operation:'move',payload:{expected_shared_revision:8},requestId:'nonceabcdefghij01'};
 await writer.apply(ctx);
 assert.equal(saves,1);assert.equal(state.updated_by,'alice');assert.equal(state.processed_player_requests[0].id,ctx.requestId);
 assert.equal(await writer.alreadyProcessed(ctx.requestId),true);
 const retry=await writer.apply(ctx);assert.equal(retry.duplicate,true);assert.equal(saves,1);
});
test('GM writer rejects outdated layout revision without persisting',async()=>{
 let saves=0;const state={core:{headquarters_states:[{shared_revision:3,rooms:[]}]}};
 const w=createHQAuthoritativeWriter({readState:()=>state,saveState:()=>saves++,applyOperation:s=>s});
 await assert.rejects(()=>w.apply({user:{id:'p',isGM:false},operation:'move',payload:{expected_shared_revision:2},requestId:'nonceabcdefghij03'}),/changed/);
 assert.equal(saves,0);
});
