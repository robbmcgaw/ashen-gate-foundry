// 0.16.3 Renown's "Related quests and contracts" picks the quest by name; nobody pastes an id. Mocked Foundry: logic and markup only.
import test from 'node:test';import assert from 'node:assert/strict';
import {objectiveRecords,objectiveName,validateObjectiveRef,addObjectiveRef,objectiveRefs} from '../scripts/objective-refs.mjs';
import {pickerOptions,refPicker} from '../scripts/ag-html.mjs';
import {assertNoIds} from '../../../scripts/test-helpers/no-ids.mjs';

const LIST=[{id:'QUEST-TEST-A',name:'[TEST] Find the key',kind:'quest',status:'Active'},{id:'ORDER-TEST-B',name:'[TEST] Mend the bellows',kind:'work_order',status:'Hidden'},
 {id:'CONTRACT-TEST-C',name:'[TEST] Escort',kind:'contract',status:'Available'},{id:'NOT-AN-OBJECTIVE',name:'[TEST] Junk',kind:'quest'},{id:'QUEST-TEST-D',name:'  ',kind:'quest'}];

test('objectiveRecords keeps quests, work orders and contracts with a name, grouped by kind',()=>{
  const recs=objectiveRecords(LIST);
  assert.deepEqual(recs.map(r=>[r.label,r.group,r.hint]),[['[TEST] Find the key','Quest','Active'],['[TEST] Mend the bellows','Work order','Hidden'],['[TEST] Escort','Contract','Available']]);
  assert.deepEqual(objectiveRecords(null),[]);
});
test('the picker lists names by group, has no None (a reference needs a target) and shows no id',()=>{
  const html=refPicker({id:'agf-objective-id',label:'Quest, work order or contract',options:pickerOptions(objectiveRecords(LIST),{gm:true}),none:null});
  assert.match(html,/data-label="\[TEST\] Escort"/);assert.ok(!html.includes('data-value=""'));
  assert.match(html,/ag-picker__group" data-group="Work order"/);
  assertNoIds(html,'the Renown quest picker');
});
test('a saved reference reads as the quest name; a deleted one says Missing; Quest Log off says the name is unavailable; never the id',()=>{
  const recs=objectiveRecords(LIST);
  assert.equal(objectiveName('ORDER-TEST-B',recs),'[TEST] Mend the bellows');
  assert.equal(objectiveName('QUEST-TEST-GONE',recs),'Missing: a quest that no longer exists');
  assert.equal(objectiveName('CONTRACT-TEST-GONE',recs),'Missing: a contract that no longer exists');
  assert.equal(objectiveName('QUEST-TEST-A',null),'Quest (name unavailable)');
  for(const t of [objectiveName('QUEST-TEST-GONE',recs),objectiveName('QUEST-TEST-A',null)])assertNoIds(t,'reference name');
});
test('ids already stored on factions still validate, list and remove; an empty choice is refused in plain words',()=>{
  const f={refs:[{relation:'offers_objective',target_id:'QUEST-TEST-A',mode:'optional'}]};
  assert.deepEqual(objectiveRefs(f).map(r=>r.target_id),['QUEST-TEST-A']);
  assert.equal(validateObjectiveRef(f.refs[0]).target_id,'QUEST-TEST-A');
  const next=addObjectiveRef(f,{relation:'associated_objective',target_id:'ORDER-TEST-B',mode:'required'});
  assert.equal(objectiveRefs(next).length,2);
  assert.throws(()=>validateObjectiveRef({relation:'offers_objective',target_id:'',mode:'optional'}),/Choose a quest, work order or contract from the list/);
});
