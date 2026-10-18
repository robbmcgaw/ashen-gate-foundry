import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuestDefinitionReader,parsePackIds} from '../scripts/pinned-runtime.mjs';
import {createObjectiveConsumer} from '../scripts/resolver-consumer.mjs';
import {validateEnvelope} from '../scripts/vendor/archie-resolver/contracts.mjs';
import {initialState,publicView,validSource} from '../scripts/core.mjs';
const gm={id:'gm',isGM:true};
const alice={id:'alice',isGM:false};
const bob={id:'bob',isGM:false};
const meta=(id='QUEST-PACK',extra={})=>({sourceId:id,entityType:'Objective',status:'approved',sourceVersion:'1.0.0',
 provenance:{sources:['synthetic:test']},visibility:'player',refs:[],
 definition:{objective_kind:id.startsWith('ORDER-')?'work_order':id.startsWith('CONTRACT-')?'contract':'quest'},...extra});
function doc(id='QUEST-PACK',{uuid='Compendium.world.objectives.P1',archive=false,fields={}}={}) {
 return {id:uuid,name:'Display name never used',uuid,pack:uuid.startsWith('Compendium.')?'world.objectives':undefined,
 flags:{'ashen-gate-manager':{source:meta(id,fields),lifecycle:{archived:archive}}},
 testUserPermission:(user)=>user.id==='alice'||user.isGM};
}
function setup({world=[],pack=[],otherPacks={},gmActive=true,packPermissions=true}={}) {
 const handlers=new Map();
 const hooks={on(name,fn){const arr=handlers.get(name)||[];arr.push(fn);handlers.set(name,arr);return fn;},
  off(name,fn){handlers.set(name,(handlers.get(name)||[]).filter(x=>x!==fn));},
  call(name,...args){for(const fn of handlers.get(name)||[])fn(...args);}};
 const packs=new Map();
 packs.set('world.objectives',{getDocuments:async()=>pack,testUserPermission:()=>packPermissions});
 for(const [id,docs] of Object.entries(otherPacks))packs.set(id,{getDocuments:async()=>docs,testUserPermission:()=>true});
 const game={user:gmActive?gm:alice,journal:world,items:[],actors:[],tables:[],macros:[],packs};
 const reader=gmActive?createQuestDefinitionReader({game,hooks,packIds:['world.objectives',...Object.keys(otherPacks)]}):null;
 const consumer=createObjectiveConsumer({game,localSource:()=>null,visibleProjection:()=>null,
  managerApi:()=>null,definitionResolver:()=>reader?.reader,
  packDocumentByUuid:uuid=>reader?.packDocumentByUuid(uuid)});
 return {game,reader,consumer,hooks,packs};
}
const resolve=(e,id='QUEST-PACK',opts={})=>e.consumer.resolveObjective(id,{entityType:'Objective',...opts});
test('configured pack-only Objective resolves by exact source ID with Manager disabled',async()=>{
 const e=setup({pack:[doc()]});assert.equal((await e.reader.refreshCompendiums()).status,'ok');
 assert.deepEqual(resolve(e).binding,{id:'QUEST-PACK',entityType:'Objective',kind:'native',uuid:'Compendium.world.objectives.P1',version:'1.0.0'});
 assert.equal(resolve(e,'QUEST-DISPLAY-NAME').status,'not_found');
 e.reader.dispose();
});
test('same pack-only binding with Manager enabled does not change pinned choice',async()=>{
 const e=setup({pack:[doc()]});await e.reader.refreshCompendiums();
 const c=createObjectiveConsumer({game:e.game,localSource:()=>null,visibleProjection:()=>null,
  managerApi:()=>({contract:e.reader.reader.contract,resolve:()=>({status:'conflict'})}),
  definitionResolver:()=>e.reader.reader,packDocumentByUuid:e.reader.packDocumentByUuid});
 assert.equal(c.resolveObjective('QUEST-PACK').status,'ok');e.reader.dispose();
});
test('DEC-0078: one world document overrides same-ID pack, never uses display name',async()=>{
 const world=doc('QUEST-PACK',{uuid:'JournalEntry.WORLD'}),e=setup({world:[world],pack:[doc()]});
 await e.reader.refreshCompendiums();assert.equal(resolve(e).binding.uuid,'JournalEntry.WORLD');
 const audit=e.reader.reader.audit();assert.equal(audit.worldOverrides.length,1);e.reader.dispose();
});
test('two same-tier world copies conflict; no arbitrary winner',async()=>{
 const e=setup({world:[doc('QUEST-PACK',{uuid:'JournalEntry.A'}),doc('QUEST-PACK',{uuid:'Item.B'})],pack:[doc()]});
 await e.reader.refreshCompendiums();assert.equal(resolve(e).status,'conflict');e.reader.dispose();
});
test('two active pack copies with no world override conflict',async()=>{
 const e=setup({pack:[doc(),doc('QUEST-PACK',{uuid:'Compendium.world.objectives.P2'})]});
 await e.reader.refreshCompendiums();assert.equal(resolve(e).status,'conflict');e.reader.dispose();
});
test('mixed native logical types conflict, even with world match',async()=>{
 const e=setup({world:[doc('QUEST-PACK',{uuid:'JournalEntry.W'})],pack:[doc('QUEST-PACK',{fields:{entityType:'Faction'}})]});
 await e.reader.refreshCompendiums();assert.equal(resolve(e).status,'conflict');e.reader.dispose();
});
test('archived world is excluded; active pack-only survives',async()=>{
 const e=setup({world:[doc('QUEST-PACK',{uuid:'JournalEntry.OLD',archive:true})],pack:[doc()]});
 await e.reader.refreshCompendiums();assert.equal(resolve(e).binding.uuid,'Compendium.world.objectives.P1');e.reader.dispose();
});
test('archived pack is excluded; active world document survives',async()=>{
 const e=setup({world:[doc('QUEST-PACK',{uuid:'JournalEntry.W'})],pack:[doc('QUEST-PACK',{archive:true})]});
 await e.reader.refreshCompendiums();assert.equal(resolve(e).binding.uuid,'JournalEntry.W');e.reader.dispose();
});
test('archived pack-only Objective returns not_found without fallback',async()=>{
 const e=setup({pack:[doc('QUEST-PACK',{archive:true})]});
 await e.reader.refreshCompendiums();assert.equal(resolve(e).status,'not_found');e.reader.dispose();
});
test('invalid pack envelope and malformed references fail closed',async()=>{
 const e=setup({pack:[doc('QUEST-PACK',{fields:{refs:[{relation:'located_at',target_id:'BAD',mode:'optional'}]}})]});
 await e.reader.refreshCompendiums();assert.equal(resolve(e).status,'not_found');e.reader.dispose();
});
test('wrong Objective kind in pack is rejected after resolver binding',async()=>{
 const e=setup({pack:[doc('QUEST-PACK',{fields:{definition:{objective_kind:'contract'}}})]});
 await e.reader.refreshCompendiums();assert.equal(resolve(e).status,'type_mismatch');e.reader.dispose();
});
test('GM-only pack reader cannot initialize as player',()=>{
 assert.throws(()=>createQuestDefinitionReader({game:{user:alice},hooks:{on(){},off(){}}}),/GM-only/);
});
test('pack-only hidden Objective never visible to player direct consumer API',async()=>{
 const e=setup({pack:[doc('QUEST-PACK',{fields:{visibility:'gm'}})]});await e.reader.refreshCompendiums();
 e.game.user=alice;assert.deepEqual(resolve(e),{status:'not_found'});e.reader.dispose();
});
test('player direct API cannot read even OBSERVER-permitted pack without Quest projection',async()=>{
 const e=setup({pack:[doc()]});await e.reader.refreshCompendiums();e.game.user=alice;
 assert.deepEqual(resolve(e),{status:'not_found'});
 assert.equal(e.reader.reader.readSource('QUEST-PACK',{entityType:'Objective'}).status,'not_found');e.reader.dispose();
});
test('revealed and owner-authorized Quest projection remains only player view',async()=>{
 const e=setup({pack:[doc()]});await e.reader.refreshCompendiums();e.game.user=alice;
 const view={id:'QUEST-PACK',entity_type:'Objective',objective_kind:'quest',status:'Available',objectives:[{key:'reveal',goal:'safe'}],scope:'individual',actorId:'ACTOR-1'};
 const c=createObjectiveConsumer({game:e.game,localSource:()=>{throw Error('Raw source called for player');},
  visibleProjection:id=>id==='QUEST-PACK'?{view}:null,
  definitionResolver:()=>{throw Error('Never read pinned resolver for player');},playerAccessEnabled:()=>true});
 assert.equal(c.resolveObjective('QUEST-PACK').view.objectives[0].goal,'safe');
 view.objectives[0].goal='changed';assert.equal(c.resolveObjective('QUEST-PACK').view.objectives[0].goal,'changed');
 e.reader.dispose();
});
test('individual reveal permission and secret filters stay with Quest publicView',()=>{
 const source=validSource({id:'QUEST-SAFE',entity_type:'Objective',objective_kind:'quest',status:'approved',version:'1',
  provenance:{sources:['synthetic']},visibility:'reveal_gated',refs:[],name:'Safe',source:{},
  objectives:[{key:'public',goal:'Allowed'},{key:'secret',goal:'Secret',visibility:'gm'},
   {key:'later',goal:'Later',visibility:'reveal_gated'}],locations:[],parameters:{},outcomes:{}});
 const state=initialState(source,{scope:'individual',actorId:'a'});
 assert.equal(publicView(source,state),null);
 state.status='Available';state.revealed=true;
 assert.deepEqual(publicView(source,state).objectives.map(x=>x.key),['public']);
 state.objectiveReveal=['later'];assert.deepEqual(publicView(source,state).objectives.map(x=>x.key),['public','later']);
});
test('player cannot spoof source type, version, or viewer to enumerate pack',async()=>{
 const e=setup({pack:[doc()]});await e.reader.refreshCompendiums();e.game.user=bob;
 assert.deepEqual(resolve(e,'QUEST-PACK',{entityType:'Faction',viewer:gm}),{status:'not_found'});
 assert.deepEqual(e.reader.reader.readSource('QUEST-PACK'),{status:'not_found'});e.reader.dispose();
});
test('pack kind snapshot cleared on failed refresh, no stale binding escapes',async()=>{
 const e=setup({pack:[doc()]});await e.reader.refreshCompendiums();assert.equal(resolve(e).status,'ok');
 e.packs.set('world.objectives',{getDocuments:async()=>{throw new Error('pack offline');}});
 assert.equal((await e.reader.refreshCompendiums()).status,'unavailable');
 assert.notEqual(resolve(e).status,'ok');e.reader.dispose();
});
test('pin detects world source update when Foundry hook invalidates snapshot',async()=>{
 const x=doc('QUEST-PACK',{uuid:'JournalEntry.W'}),e=setup({world:[x]});
 await e.reader.refreshCompendiums();assert.equal(resolve(e).status,'ok');
 x.flags['ashen-gate-manager'].lifecycle.archived=true;e.hooks.call('updateJournalEntry',x);
 assert.equal(resolve(e).status,'not_found');e.reader.dispose();
});
test('source envelope cannot use campaign_state; independent Assignment scope remains unchanged',()=>{
 const r={id:'QUEST-X',entity_type:'Objective',status:'draft',version:'0.1.0',provenance:{sources:['test']},visibility:'gm',refs:[],scope:'campaign_state'};
 assert.ok(validateEnvelope(r).includes('campaign_state_not_definition'));
});
test('configuration rejects duplicate and malformed pack IDs',()=>{
 assert.deepEqual(parsePackIds('world.objectives, world.other'),['world.objectives','world.other']);
 assert.throws(()=>parsePackIds('world.objectives world.objectives'),/Duplicate/);
 assert.throws(()=>parsePackIds('a bad-id'),/pack IDs/);
});
test('unique world overrides multiple same-type pack sources without ambiguity',async()=>{
 const e=setup({world:[doc('QUEST-PACK',{uuid:'JournalEntry.W'})],
  pack:[doc(),doc('QUEST-PACK',{uuid:'Compendium.world.objectives.P2'})]});
 await e.reader.refreshCompendiums();assert.equal(resolve(e).binding.uuid,'JournalEntry.W');e.reader.dispose();
});
test('optional unresolved refs remain visible in GM validation, required missing refs fail',async()=>{
 const optional={relation:'references_location',target_id:'LOC-NOT-INSTALLED',mode:'optional'};
 const e=setup({pack:[doc('QUEST-PACK',{fields:{refs:[optional]}})]});await e.reader.refreshCompendiums();
 const c=e.reader.reader.validateReferences();assert.equal(c.status,'ok');assert.equal(c.optionalGaps.length,1);
 assert.equal(resolve(e).status,'ok');e.reader.dispose();
 const f=setup({pack:[doc('QUEST-PACK',{fields:{refs:[{...optional,mode:'required'}]}})]});
 await f.reader.refreshCompendiums();const failed=f.reader.reader.validateReferences();
 assert.equal(failed.status,'failed');assert.equal(failed.requiredFailures.length,1);f.reader.dispose();
});
