import test from 'node:test';
import assert from 'node:assert/strict';
import {createObjectiveConsumer} from '../scripts/resolver-consumer.mjs';
import {validSource} from '../scripts/core.mjs';
const BASE=()=>({sourceId:'QUEST-PINNED',entityType:'Objective',status:'approved',sourceVersion:'1.0.0',provenance:{sources:['synthetic']},visibility:'player',refs:[],definition:{objective_kind:'quest'}});
const DOC=(source)=>({uuid:'JournalEntry.PINNED',flags:{'ashen-gate-manager':{source}}});
function owner({sources=[],manager=null,gm=true,view=null,access=true}={}) {
  const game={user:{isGM:gm},journal:sources.map(DOC),items:[],actors:[],tables:[],macros:[]};
  return createObjectiveConsumer({game,localSource:()=>null,visibleProjection:()=>view?{view}:null,playerAccessEnabled:()=>access,managerApi:()=>manager});
}
test('baseline: valid native exact typed Objective works with Manager unavailable',()=>{
  assert.equal(owner({sources:[BASE()]}).resolveObjective('QUEST-PINNED',{entityType:'Objective'}).status,'ok');
});
test('pinned resolver requires valid typed refs; malformed native refs cannot resolve',()=>{
  const s=BASE();s.refs=[{relation:'issued_by',target_id:'not-an-id',mode:'required'}];
  assert.notEqual(owner({sources:[s]}).resolveObjective('QUEST-PINNED').status,'ok');
});
test('pinned resolver requires provenance.sources strings; malformed native provenance cannot resolve',()=>{
  const s=BASE();s.provenance={sources:[123]};
  assert.notEqual(owner({sources:[s]}).resolveObjective('QUEST-PINNED').status,'ok');
});
test('pinned resolver rejects canonical scope unknown to envelope',()=>{
  const s=BASE();s.scope='invalid_scope';
  assert.notEqual(owner({sources:[s]}).resolveObjective('QUEST-PINNED').status,'ok');
});
test('player direct API remains opaque with Manager secret and no published view',()=>{
  const s=BASE();s.visibility='gm';
  assert.deepEqual(owner({sources:[s],gm:false}).resolveObjective('QUEST-PINNED'),{status:'not_found'});
});
test('player access hidden remains opaque with an otherwise valid published view',()=>{
  const view={id:'QUEST-PINNED',entity_type:'Objective',objective_kind:'quest'};
  assert.deepEqual(owner({gm:false,view,access:false}).resolveObjective('QUEST-PINNED'),{status:'not_found'});
});
test('without an injected or bundled pinned reader, a bare fake Manager resolver does not grant pack visibility',()=>{
  const resolver={contract:'ag-definition-resolver/0.1-prototype',resolve:()=>({status:'ok',binding:{id:'QUEST-PINNED',entityType:'Objective',kind:'native',uuid:'Compendium.world.quest.J123',version:'1.0.0'}})};
  assert.equal(owner({manager:resolver}).resolveObjective('QUEST-PINNED').status,'not_found');
});

test('canonical campaign-state scope cannot masquerade as native Objective definition',()=>{
  const s=BASE();s.scope='campaign_state';
  assert.notEqual(owner({sources:[s]}).resolveObjective('QUEST-PINNED').status,'ok');
});
test('Quest-owned source import rejects campaign-state scope and untyped reference payloads',()=>{
  const s={id:'QUEST-PINNED',entity_type:'Objective',objective_kind:'quest',status:'draft',version:'0.1.0',
    provenance:{sources:['synthetic']},visibility:'player',refs:[],name:'Synthetic test',source:{},
    objectives:[{key:'first',goal:'First task'}],locations:[],parameters:{},outcomes:{}};
  assert.equal(validSource(s).id,'QUEST-PINNED');
  assert.throws(()=>validSource({...s,scope:'campaign_state'}),/scope/);
  assert.throws(()=>validSource({...s,refs:[{relation:'located_at',target_id:'LOC-SYNTHETIC',mode:'optional',fake_uuid:'World.Item'}]}),/typed reference/);
  assert.throws(()=>validSource({...s,provenance:{sources:[44]}}),/provenance/);
});
