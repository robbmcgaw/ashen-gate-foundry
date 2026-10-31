import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {QA_FIXTURE,QA_TREES,qaTreeLayouts,qaSourceItems,qaActorData,isQaDocument,qaCleanupBlockers} from '../scripts/qa-fixtures.mjs';
import {SCHEMA,validatePackage,publicTree} from '../scripts/engine.mjs';
const moduleJson=JSON.parse(readFileSync(new URL('../module.json',import.meta.url),'utf8'));
const template=readFileSync(new URL('../templates/tree.hbs',import.meta.url),'utf8');
const source=readFileSync(new URL('../scripts/main.js',import.meta.url),'utf8');

test('v0.6.0 QA creates real native Actor and feat Item payloads with synthetic provenance',()=>{
 const trees=qaTreeLayouts(), items=qaSourceItems(),actor=qaActorData();
 assert.equal(moduleJson.version,'0.24.4');
 assert.equal(validatePackage({schema:SCHEMA,trees}).errors.length,0);
 assert.equal(trees.length,3);assert.equal(items.length,2);
 assert.equal(actor.type,'character');assert.ok(isQaDocument(actor));
 for(const item of items){
  assert.equal(item.type,'feat');assert.ok(isQaDocument(item));
  const src=item.flags['ashen-gate-manager'].source;
  assert.equal(src.definition.id,src.sourceId);assert.equal(src.definition.entity_type,src.entityType);
  assert.equal(src.status,'draft');assert.equal(src.visibility,'gm');
  assert.deepEqual(src.refs,[]);assert.ok(src.provenance.sources.length);
  assert.ok(item.name.includes('[AG QA]'));
 }
});

test('QA fixture public projection is test-labelled, excludes hidden node and profession tree',()=>{
 const trees=qaTreeLayouts();const pub=trees.map(publicTree).filter(Boolean);
 assert.deepEqual(pub.map(t=>t.id).sort(),[QA_TREES.cinder,QA_TREES.generic].sort());
 const cinder=pub.find(t=>t.id===QA_TREES.cinder);
 assert.equal(cinder.nodes.some(n=>n.name==='QA GM-only Source'),false);
 assert.equal(pub.every(t=>t.status==='test'),true);
});

test('QA cleanup refuses removal while an unrelated Actor holds fixture tree progress',()=>{
 const marker=qaActorData(),prod={name:'Existing campaign Actor',flags:{'ashen-gate-skill-trees':{
  progressV2:{['tree:'+QA_TREES.generic]:{awarded:2,unlocks:[]}}
 }}};
 const blockers=qaCleanupBlockers(qaTreeLayouts(),[marker,prod]);
 assert.equal(blockers.length,1);assert.match(blockers[0],/Existing campaign Actor/);
 assert.deepEqual(qaCleanupBlockers(qaTreeLayouts(),[marker]),[]);
 assert.equal(isQaDocument(prod),false);
});

test('GM-only QA path replaces old Add Demo Trees and uses native Foundry document creation/deletion',()=>{
 assert.match(template,/data-act="qa-install"/);
 assert.match(template,/data-act="qa-reset"/);
 assert.doesNotMatch(template,/data-act="seed"/);
 assert.match(source,/await Actor\.create\(qaActorData\(\)\)/);
 assert.match(source,/await Item\.create\(data\)/);
 assert.match(source,/await saveTrees\(\[\.\.\.existing,\.\.\.layouts\]\)/);
 assert.match(source,/qaCleanupBlockers\(qaTrees,actors\)/);
 assert.match(source,/await doc\.delete\(\)/);
});

test('Unlock runs through the GM-side path; profession points stay with the Ledger',()=>{
 assert.match(source,/async function unlockNode\(/);
 assert.match(source,/if\(!game\.user\.isGM\)throw Error\('GM only: unlocks run on the GM client'\)/);
 assert.match(source,/provider\.kind==='profession'\)throw Error\('Profession XP\/points belong to the Ledger'/);
});
test('shipped JSON QA fixture exactly matches the native seed source (no disconnected display mock)',()=>{
 const fixture=JSON.parse(readFileSync(new URL('../data/qa-fixture-v060.json',import.meta.url),'utf8'));
 assert.equal(fixture.status,'synthetic_test_only_not_canon');
 assert.deepEqual(fixture.expected_native_actor,qaActorData());
 assert.deepEqual(fixture.expected_native_items,qaSourceItems());
 assert.deepEqual(fixture.expected_layouts,qaTreeLayouts());
});
