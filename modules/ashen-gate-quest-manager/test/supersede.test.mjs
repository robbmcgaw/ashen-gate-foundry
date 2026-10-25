import test from 'node:test';import assert from 'node:assert/strict';
import {planSupersede,runSupersede} from '../scripts/supersede.mjs';
// Synthetic ids only (public repo).
const quest=(id,refs,linkNames)=>({id,source:{id,name:id,refs},state:{status:'Active',progress:{done:1},...(linkNames?{linkNames}:{})}});
const ref=(relation,target_id,mode='optional')=>({relation,target_id,mode});
const records=()=>[quest('QUEST-TEST-A',[ref('quest_giver','NPC-TEST-OLD'),ref('issuing_faction','FACTION-TEST-G')],{'NPC-TEST-OLD':'Old Person','LOC-TEST-X':'Place'}),quest('QUEST-TEST-B',[ref('issuing_faction','FACTION-TEST-G')]),quest('QUEST-TEST-C',[ref('quest_giver','NPC-TEST-OLD'),ref('quest_giver','NPC-TEST-NEW')])];
const MAP={'NPC-TEST-OLD':'NPC-TEST-NEW'};
function io(gm=true){const rows=records(),saved=[];return {saved,rows,assertGM:()=>{if(!gm)throw new Error('GM permission required.');},records:()=>rows,save:async(id,source,state)=>{saved.push(id);const r=rows.find(x=>x.id===id);r.source=source;r.state=state;}};}
test('refs and remembered link names move to the new id; progress and other refs stay; duplicates collapse',async()=>{
  const w=io();const res=await runSupersede(MAP,{},w);
  assert.equal(res.changed,2);assert.deepEqual(w.saved.sort(),['QUEST-TEST-A','QUEST-TEST-C']);
  const a=w.rows[0];
  assert.equal(a.source.refs[0].target_id,'NPC-TEST-NEW');assert.equal(a.source.refs[1].target_id,'FACTION-TEST-G');
  assert.deepEqual(a.state.linkNames,{'NPC-TEST-NEW':'Old Person','LOC-TEST-X':'Place'});assert.deepEqual(a.state.progress,{done:1});
  assert.equal(w.rows[2].source.refs.length,1,'two refs to the same target collapse');
});
test('idempotent; dry run writes nothing; an id that is absent does nothing',async()=>{
  const w=io();await runSupersede(MAP,{},w);const n=w.saved.length;
  assert.equal((await runSupersede(MAP,{},w)).changed,0);assert.equal(w.saved.length,n);
  const d=io();assert.equal((await runSupersede(MAP,{dryRun:true},d)).changed,2);assert.equal(d.saved.length,0);
  assert.equal((await runSupersede({'NPC-TEST-MISSING':'NPC-TEST-X'},{},io())).changed,0);
});
test('GM only and input checked; Quest Log record ids are not re-keyed',async()=>{
  await assert.rejects(()=>runSupersede(MAP,{},io(false)),/GM permission/);
  await assert.rejects(()=>runSupersede(null,{},io()),/object/);await assert.rejects(()=>runSupersede({a:'a'},{},io()),/two different/);
  const plan=planSupersede({'QUEST-TEST-A':'QUEST-TEST-Z'},records());
  assert.equal(plan.changed,0);assert.match(plan.notes[0],/not re-keyed/);
});
