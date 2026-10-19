import test from 'node:test';
import assert from 'node:assert/strict';
import {makeFaction,sourceDefinition} from '../scripts/core.mjs';
import {planImport,runImport,IMPORT_SCHEMA} from '../scripts/import.mjs';
const def=(key,name)=>sourceDefinition(makeFaction({id:`FACTION-QA-${key}`,trackId:`RENOWN-QA-${key}`,name}));
const file=(...defs)=>({schema_version:IMPORT_SCHEMA,definitions:defs});
const io=(calls,{gm=true}={})=>({assertGM:()=>{if(!gm)throw Error('GM authorization required.');},createFaction:async d=>calls.push(['create',d.id]),updateGroup:async id=>calls.push(['group',id]),updatePersonal:async id=>calls.push(['personal',id]),findActor:()=>null,finish:async id=>calls.push(['finish',id]),eventId:()=>'RENOWN-EVT-QA',now:()=>'2026-01-01T00:00:00Z'});
test('a definitions-only export file imports as-is and shows NEW or SKIP per faction',()=>{
  const plan=planImport(file(def('A','A [TEST]'),def('B','B [TEST]')),new Set(['FACTION-QA-B']));
  assert.deepEqual(plan.errors,[]);
  assert.deepEqual(plan.rows.map(r=>[r.id,r.action]),[['FACTION-QA-A','new'],['FACTION-QA-B','skip']]);
});
test('bad files are refused whole: wrong schema, unknown fields, duplicates, orphan or malformed starting_state',()=>{
  assert.ok(planImport({definitions:[]}).errors.length);
  assert.ok(planImport(file({...def('A','A'),renown_score:5})).errors[0].includes('unclassified'));
  assert.ok(planImport(file(def('A','A'),def('A','A'))).errors.some(e=>e.includes('duplicate')));
  assert.ok(planImport({...file(def('A','A')),starting_state:[{faction_id:'FACTION-QA-Z'}]}).errors.length);
  assert.ok(planImport({...file(def('A','A')),starting_state:[{faction_id:'FACTION-QA-A',group_renown:[{delta:0,reason:'x'}]}]}).errors.length);
});
test('runImport refuses non-GMs before any write and refuses a plan with errors',async()=>{
  const calls=[];
  await assert.rejects(runImport(planImport(file(def('A','A'))),io(calls,{gm:false})),/GM authorization/);
  await assert.rejects(runImport(planImport({}),io(calls)),/Import blocked/);
  assert.deepEqual(calls,[]);
});
test('only new factions are created; a skipped one gets no create, group or personal write',async()=>{
  const calls=[];
  const data={...file(def('A','A'),def('B','B')),starting_state:[{faction_id:'FACTION-QA-A',party_discovered:true,group_renown:[{delta:2,reason:'x'}]},{faction_id:'FACTION-QA-B',group_renown:[{delta:5,reason:'x'}]}]};
  const result=await runImport(planImport(data,new Set(['FACTION-QA-B'])),io(calls));
  assert.deepEqual(calls,[['create','FACTION-QA-A'],['group','FACTION-QA-A'],['finish','FACTION-QA-A']]);
  assert.deepEqual([result.added.length,result.skipped.length],[1,1]);
});
