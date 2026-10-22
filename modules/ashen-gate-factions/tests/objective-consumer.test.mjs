import test from 'node:test';
import assert from 'node:assert/strict';
import {auditObjectiveRefs} from '../scripts/objective-refs.mjs';
const refs=[{relation:'offers_objective',target_id:'QUEST-PUBLISHED',mode:'optional'},
 {relation:'associated_objective',target_id:'ORDER-MISSING',mode:'required'},
 {relation:'offers_objective',target_id:'CONTRACT-CONFLICT',mode:'optional'}];
const faction={refs};
const mod=()=>({active:true,api:{contract:'ag-objectives/0.1-alpha',consumer:{
  contract:'ag-objective-consumer/0.2-alpha',resolveObjective(id,opts){
    assert.deepEqual(opts,{entityType:'Objective'});
    if(id==='QUEST-PUBLISHED')return {status:'ok',binding:{id,entityType:'Objective',kind:'native',uuid:'JournalEntry.demo'}};
    if(id==='ORDER-MISSING')return {status:'not_found'};
    return {status:'conflict'};
  }}}});
test('GM-only diagnostic uses the owner consumer with exact logical Objective type',()=>{
 const result=auditObjectiveRefs(faction,mod());
 assert.deepEqual(result.map(x=>x.status),['resolved','not_found','conflict']);
 assert.equal(result[0].target_id,'QUEST-PUBLISHED');
 assert.equal(result[0].uuid,undefined); // never return native pointer
});
test('optional Quest Manager absent, disabled, incompatible, or broken => no guessed binding',()=>{
 for(const provider of [undefined,{active:false,api:mod().api},{active:true,api:{}},{active:true,api:{...mod().api,consumer:{contract:'wrong',resolveObjective(){return {status:'ok'}}}}}])
  assert.deepEqual(auditObjectiveRefs(faction,provider).map(x=>x.status),['unverified','unverified','unverified']);
 assert.deepEqual(auditObjectiveRefs(faction,{active:true,api:{contract:'ag-objectives/0.1-alpha',consumer:{contract:'ag-objective-consumer/0.2-alpha',resolveObjective(){throw Error('not available')}}}}).map(x=>x.status),['unavailable','unavailable','unavailable']);
});
test('response mismatches, malformed refs and promise-like owner results fail closed',()=>{
 const bad={active:true,api:{contract:'ag-objectives/0.1-alpha',consumer:{contract:'ag-objective-consumer/0.2-alpha',resolveObjective(){return {status:'ok',binding:{id:'QUEST-OTHER',entityType:'Objective'}}}}}};
 assert.deepEqual(auditObjectiveRefs(faction,bad).map(x=>x.status),['unavailable','unavailable','unavailable']);
 const invalid=auditObjectiveRefs({refs:[{relation:'offers_objective',target_id:'JournalEntry.abc',mode:'optional'}]},mod());
 assert.equal(invalid[0].status,'invalid_ref');
});
test('player projection remains devoid of Objective refs or diagnostic data',async()=>{
 const {readFileSync}=await import('node:fs');
 const src=readFileSync(new URL('../scripts/module.mjs',import.meta.url),'utf8');
 const masked=src.slice(src.indexOf('function maskedFaction('),src.indexOf('function buildPlayerPayload('));
 assert.doesNotMatch(masked,/refs\s*:/);
 assert.doesNotMatch(masked,/auditObjectiveRefs\(/);
 assert.match(src,/auditObjectiveRefs:\(factionId\)=>\{assertGM\(\)/);
 assert.match(src,/gmObjectiveRefs:editingFaction\?auditObjectiveRefs\(/);
});
