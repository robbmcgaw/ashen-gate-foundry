import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,resolveNow,skipRoll,acceptRoll,summary,cancelSession,projectSession} from '../scripts/core.mjs';
const create=(kind='group')=>createSession({id:'AG-TEST-CHECK-1',name:'Test Crossing',kind,actors:['AG-PC-1','AG-PC-2'],skills:['ath','acr','prc'],rollsPerActor:kind==='group'?2:1,dc:15,createdBy:'AG-GM'});

test('new group starts with four real contribution slots and no recorded result',()=>{
 const s=create(),p=summary(s);assert.equal(p.totalSlots,4);assert.equal(p.result,'pending');assert.equal(s.status,'active');
});
test('explicit End & Record skips pending slots with audit trail',()=>{
 const s=create();acceptRoll(s,{actorId:'AG-PC-1',skill:'ath',total:18,userId:'AG-PLAYER-1',proofMessageId:'native-msg-1'});
 resolveNow(s,{userId:'AG-GM',at:12345});
 assert.equal(s.status,'completed');assert.equal(summary(s).result,'success');assert.equal(summary(s).accepted,1);assert.equal(summary(s).skipped,3);
 assert.equal(s.audit.filter(x=>x.type==='skip').length,3);assert.equal(s.audit.find(x=>x.type==='resolve-now').pendingClosed,3);
 assert.equal(s.closedAt,12345);
});
test('early completion with no submitted rolls creates No Result',()=>{
 const s=create();resolveNow(s,{userId:'AG-GM'});assert.equal(summary(s).result,'no-result');assert.equal(summary(s).average,null);
});
test('End & Record is not available to an already finished or cancelled session',()=>{
 const s=create();resolveNow(s,{userId:'AG-GM'});assert.throws(()=>resolveNow(s,{userId:'AG-GM'}),/active/);
 const t=create('request');cancelSession(t,{userId:'AG-GM'});assert.throws(()=>resolveNow(t,{userId:'AG-GM'}),/active/);
});
test('second group and roll request do not inherit slots from first',()=>{
 const old=create();resolveNow(old,{userId:'AG-GM'});
 const next=createSession({id:'AG-TEST-CHECK-2',kind:'request',name:'Test Perception',actors:['AG-PC-1','AG-PC-2'],skills:['prc'],createdBy:'AG-GM'});
 assert.equal(next.status,'active');assert.equal(next.slots.length,2);assert.equal(summary(next).accepted,0);assert.equal(next.kind,'request');
 assert.equal(summary(old).skipped,4);
});
test('duplicate roll evidence is rejected even when user retries',()=>{
 const s=create();const f={actorId:'AG-PC-1',skill:'ath',total:15,userId:'AG-PLAYER-1',proofMessageId:'native-msg-1'};
 acceptRoll(s,f);assert.throws(()=>acceptRoll(s,{...f,skill:'prc'}),/already used/);
});
test('each Group Check Actor uses distinct skills but other Actor can repeat',()=>{
 const s=create();acceptRoll(s,{actorId:'AG-PC-1',skill:'ath',total:12,userId:'u1',proofMessageId:'a'});
 assert.throws(()=>acceptRoll(s,{actorId:'AG-PC-1',skill:'ath',total:20,userId:'u1',proofMessageId:'b'}),/cannot repeat/i);
 acceptRoll(s,{actorId:'AG-PC-2',skill:'ath',total:16,userId:'u2',proofMessageId:'c'});
 assert.equal(summary(s).accepted,2);
});
test('skipping and averaging still use only accepted native totals',()=>{
 const s=create();acceptRoll(s,{actorId:'AG-PC-1',skill:'ath',total:11,userId:'u1',proofMessageId:'a'});
 acceptRoll(s,{actorId:'AG-PC-2',skill:'ath',total:20,userId:'u2',proofMessageId:'b'});
 skipRoll(s,{actorId:'AG-PC-1',userId:'AG-GM'});resolveNow(s,{userId:'AG-GM'});
 assert.equal(summary(s).average,15.5);assert.equal(summary(s).result,'success');
});
test('public session projection strips native proof message references',()=>{
 const s=create('request');acceptRoll(s,{actorId:'AG-PC-1',skill:'ath',total:15,userId:'u1',proofMessageId:'SECRET-CHAT-REF'});
 const projected=projectSession(s,{userId:'u2',isGM:false,ownedActorIds:['AG-PC-2']});
 assert.equal(projected.slots[0].proofMessageId,null);assert.equal(projected.audit.length,0);
});
test('the pure engine does not grant authorization: a GM identity is needed to end early',()=>{
 assert.throws(()=>resolveNow(create(),{userId:''}),/identity/);
});
