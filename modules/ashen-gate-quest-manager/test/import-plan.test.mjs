import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planQuestImport} from '../scripts/core.mjs';
const pack=JSON.parse(fs.readFileSync(new URL('../../../test-fixtures/playtest/AG_Playtest_Quests_0.6.0.json',import.meta.url),'utf8'));
test('new objectives are planned as new',()=>{
 const {errors,rows}=planQuestImport(pack);
 assert.deepEqual(errors,[]);assert.ok(rows.length>0);assert.ok(rows.every(r=>r.action==='new'));
});
test('existing objectives are skipped by default and updated only on request',()=>{
 const ids=new Set([pack.records[0].id]);
 const skip=planQuestImport(pack,ids).rows.find(r=>r.id===pack.records[0].id);
 assert.equal(skip.action,'skip');assert.match(skip.reason,/kept as is/);
 const update=planQuestImport(pack,ids,{mode:'update'}).rows.find(r=>r.id===pack.records[0].id);
 assert.equal(update.action,'update');assert.match(update.reason,/keeps its status/);
});
test('wrong shape and bad mode are reported, not thrown',()=>{
 assert.match(planQuestImport({nope:1}).errors[0],/records array/);
 assert.throws(()=>planQuestImport(pack,new Set(),{mode:'replace'}),/mode/);
});
