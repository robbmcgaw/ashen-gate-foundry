// Rewards R1 (0.14.0): item rewards may carry item_id and img in the source definition. Pure, no Foundry.
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeFaction,sourceDefinition} from '../scripts/core.mjs';
import {planImport,IMPORT_SCHEMA} from '../scripts/import.mjs';
const faction=(key,rewards=[])=>{const f=makeFaction({id:`FACTION-QA-${key}`,trackId:`RENOWN-QA-${key}`,name:`[TEST] ${key}`});
  f.rewards=rewards.map((r,i)=>({id:`rw-${key}-${i}`,key:`rw_${key}_${i}`,audience:'group',milestone_id:f.renown_track.milestones[0].id,name:`[TEST] Reward ${i}`,teaser:'',description:'',tags:[],behavior:'one_time',usage_limit:0,...r}));return f;};
const item={kind:'uuid',uuid:'Item.QA1'};

test('the reward allow-list accepts item_id and img, and both stay optional',()=>{
  const clean=sourceDefinition(faction('A',[{...item,item_id:'ITEM-TEST-RUSTED-BLADE',img:'icons/test.webp'},item,{kind:'custom'}]));
  assert.equal(clean.rewards[0].item_id,'ITEM-TEST-RUSTED-BLADE');
  assert.equal(clean.rewards[0].img,'icons/test.webp');
  assert.ok(!('item_id' in clean.rewards[1]));
});

test('the reward allow-list refuses a malformed item_id or a non-text img',()=>{
  for(const bad of ['item-test-lower','ITEM','',42,null])assert.throws(()=>sourceDefinition(faction('B',[{...item,item_id:bad}])),/item_id/);
  assert.throws(()=>sourceDefinition(faction('C',[{...item,img:7}])),/img/);
});

test('export/import round-trip with and without the new keys; older 0.3 files still import',()=>{
  const withKeys=sourceDefinition(faction('D',[{...item,item_id:'ITEM-TEST-HEALING-DRAUGHT',img:'icons/d.webp'}]));
  const without=sourceDefinition(faction('E',[item]));
  const file=JSON.parse(JSON.stringify({schema_version:IMPORT_SCHEMA,definitions:[withKeys,without]}));
  const plan=planImport(file);
  assert.deepEqual(plan.errors,[]);
  assert.deepEqual(plan.rows.map(r=>r.action),['new','new']);
  assert.deepEqual(sourceDefinition(file.definitions[0]).rewards[0],withKeys.rewards[0]);
  const old=planImport({schema_version:'ag-factions-source-export/0.3',definitions:[without]});
  assert.deepEqual(old.errors,[]);
  assert.ok(planImport({schema_version:IMPORT_SCHEMA,definitions:[{...withKeys,rewards:[{...withKeys.rewards[0],item_id:'bad id'}]}]}).errors.length);
});

