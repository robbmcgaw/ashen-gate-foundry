import test from 'node:test';import assert from 'node:assert/strict';
// Cinder sockets (0.3.0): pure rules. Proves capacity, the inactive-over-capacity rule, attach / detach / swap and opId repeats;
// not the live Foundry UI.
import {normalizeSockets,socketPlan,applySocketOp,socketMirror,withoutItem,emptied,MAX_SOCKETS} from '../scripts/sockets.mjs';
import {normalizeInstance,createInstance,bindInstance,transferInstance,unbindInstance} from '../scripts/cinder.mjs';

const att=(slot,itemId)=>({slot,itemId,sourceId:`ITEM-TEST-${itemId}`,by:'gm',at:1});

test('saved records without sockets read as empty, default count, unlocked; bad entries are dropped',()=>{
  assert.deepEqual(normalizeSockets(undefined),{attached:[],locked:false,count:null,ops:[]});
  assert.deepEqual(normalizeInstance({instanceId:'cinst_AAAAAAAA',definitionId:'MUT-TEST-A'}).sockets,{attached:[],locked:false,count:null,ops:[]});
  const s=normalizeSockets({attached:[att(2,'B'),att(0,'A'),att(0,'C'),att(1,'A'),{slot:MAX_SOCKETS,itemId:'D'},{slot:1}],locked:true,count:99});
  assert.deepEqual(s.attached.map(a=>[a.slot,a.itemId]),[[0,'A'],[2,'B']],'sorted; duplicate slot or item and out-of-range slots dropped');
  assert.equal(s.locked,true);assert.equal(s.count,MAX_SOCKETS);
  assert.deepEqual(socketMirror(s),{attached:[{slot:0,itemId:'A',sourceId:'ITEM-TEST-A'},{slot:2,itemId:'B',sourceId:'ITEM-TEST-B'}],locked:true,count:MAX_SOCKETS},'no user ids in the copy');
});

test('capacity: setting or the Cinder\'s own count, plus host and item bonuses; extras stay attached but inactive, in slot order',()=>{
  const s=normalizeSockets({attached:[att(0,'A'),att(1,'B'),att(2,'C')]});
  let p=socketPlan(s,{setting:3});assert.deepEqual([p.capacity,p.free,p.slots.map(x=>x.active)],[3,0,[true,true,true]]);
  p=socketPlan({...s,count:2},{setting:3});assert.deepEqual([p.base,p.capacity,p.slots.map(x=>x.active)],[2,2,[true,true,false]],'count drops: C inactive, nothing removed');
  p=socketPlan({...s,count:2},{setting:3,hostBonus:1});assert.equal(p.capacity,3,'a perk adds a socket');
  // An item that adds a socket counts only while it is active before item bonuses.
  const bonus=ids=>ids.includes('B')?1:0;
  assert.equal(socketPlan({...s,count:2},{itemBonus:bonus}).capacity,3);
  assert.equal(socketPlan({...s,count:1},{itemBonus:bonus}).capacity,1,'B is not active, so it adds nothing');
  // Removing one lets the next item become active.
  const after=withoutItem({...s,count:2},'A');assert.deepEqual(socketPlan(after,{}).slots.map(x=>[x.itemId,x.active]),[['B',true],['C',true]]);
  // A missing item reads as empty.
  p=socketPlan(s,{setting:3,present:id=>id!=='B'});assert.deepEqual([p.slots.map(x=>x.itemId),p.free,p.missing],[['A','C'],1,1]);
  assert.equal(socketPlan(s,{setting:3,hostBonus:-10}).capacity,0,'never below 0');
  assert.equal(socketPlan(s,{setting:3,hostBonus:100}).capacity,MAX_SOCKETS);
});

test('attach, detach, swap; full, empty and repeated operations',()=>{
  let s=normalizeSockets({});const plan=x=>socketPlan(x,{setting:2});
  let r=applySocketOp(s,{kind:'attach',itemId:'A',sourceId:'ITEM-TEST-A',by:'u1',at:5,opId:'op1'},plan(s));
  assert.deepEqual([r.changed,r.slot,r.sockets.attached[0].by],[true,0,'u1']);s=r.sockets;
  assert.deepEqual(applySocketOp(s,{kind:'attach',itemId:'Z',opId:'op1'},plan(s)),{sockets:s,changed:false,duplicate:true,slot:null},'same opId: nothing happens');
  assert.throws(()=>applySocketOp(s,{kind:'attach',itemId:'A'},plan(s)),/already in a socket/);
  s=applySocketOp(s,{kind:'attach',itemId:'B'},plan(s)).sockets;
  assert.throws(()=>applySocketOp(s,{kind:'attach',itemId:'C'},plan(s)),/All 2 sockets are in use/);
  assert.throws(()=>applySocketOp(s,{kind:'attach',itemId:'C'},socketPlan(s,{setting:0})),/no sockets|in use/);
  r=applySocketOp(s,{kind:'swap',slot:1,itemId:'C'},plan(s));assert.deepEqual([r.removed.itemId,r.sockets.attached.map(a=>a.itemId)],['B',['A','C']]);s=r.sockets;
  r=applySocketOp(s,{kind:'swap',slot:1,itemId:'A'},plan(s));assert.deepEqual(r.sockets.attached.map(a=>[a.slot,a.itemId]),[[1,'A']],'an item already in another socket moves');
  assert.throws(()=>applySocketOp(s,{kind:'swap',slot:5,itemId:'D'},plan(s)),/empty; use Attach/);
  r=applySocketOp(s,{kind:'detach',slot:0},plan(s));assert.deepEqual([r.removed.itemId,r.sockets.attached.length],['A',1]);
  assert.throws(()=>applySocketOp(s,{kind:'detach',slot:7},plan(s)),/empty/);
  assert.throws(()=>applySocketOp(s,{kind:'detach',slot:-1},plan(s)),/does not exist/);
  assert.throws(()=>applySocketOp(s,{kind:'melt',slot:0},plan(s)),/Unknown/);
});

test('transfer and unbind detach every socket item (they stay with the old bearer); lock and count are kept',()=>{
  let {registry}=createInstance({schema:'ag-cinder-instances/1',instances:[]},'MUT-TEST-A',{instanceId:'cinst_AAAAAAAA'});
  ({registry}=bindInstance(registry,'cinst_AAAAAAAA','A1'));
  registry.instances[0].sockets={attached:[att(0,'X')],locked:true,count:2,ops:[]};
  const t=transferInstance(registry,'cinst_AAAAAAAA','A2');
  assert.deepEqual([t.instance.sockets.attached,t.instance.sockets.locked,t.instance.sockets.count,t.detached.map(a=>a.itemId)],[[],true,2,['X']]);
  const u=unbindInstance(registry,'cinst_AAAAAAAA');assert.deepEqual([u.instance.sockets.attached,u.detached.length],[[],1]);
  assert.deepEqual(emptied({attached:[att(0,'X')],locked:false,count:null,ops:['o']}),{attached:[],locked:false,count:null,ops:['o']});
});
