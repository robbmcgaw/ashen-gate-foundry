import test from 'node:test';
import assert from 'node:assert/strict';
import {lookupWorldDefinition,readWorldDefinition} from '../scripts/definition-lookup.mjs';

const GM={id:'gm',isGM:true};
const PLAYER={id:'player',isGM:false};
const id='REC-ALCHEMY-FIELD-MEDIC-S-SALVE';
const makeDoc=({sourceId=id,entityType='Recipe',visibility='player',status='draft',archived=false,allowed=true,
  version='0.1.0',refs=[],definition=null}={})=>({
    id:`native-${sourceId}`,uuid:`Item.${sourceId}`,documentName:'Item',name:'Field Medic Salve',type:'loot',ownership:{default:0},
    flags:{'ashen-gate-manager':{lifecycle:{archived},source:{sourceId,entityType,visibility,status,version,
      provenance:{sources:['Tim AG-WORK-0002']},refs,definition:definition??{id:sourceId,entity_type:entityType,status,
        version,visibility,provenance:{sources:['Tim AG-WORK-0002']},refs,name:'Field Medic Salve',
        ingredients:[{material_id:'MAT-HERBALISM-APPRENTICE-COMMON',quantity:1}]}}}},
    testUserPermission:user=>{if(allowed==='throws')throw Error('denied permission callback');return allowed===true && user?.isGM!==undefined;}
});
const game=(docs=[],user=GM,users=[GM,PLAYER])=>({
  user,users:{contents:users},items:{contents:docs},actors:{contents:[]},journal:{contents:[]},tables:{contents:[]},macros:{contents:[]},
  modules:new Map([['ashen-gate-manager',{active:false}]])
});

test('AG-WORK-0013: callers cannot claim GM identity on a player lookup',()=>{
  const g=game([makeDoc({visibility:'gm'})],PLAYER);
  for(const opts of [{},{viewer:GM},{viewer:{isGM:true},publicForAll:true}]){
    assert.equal(lookupWorldDefinition(g,id,opts).status,'not_found');
  }
  assert.equal(g.user,PLAYER);
});
test('AG-WORK-0013: a player-provided publicForAll flag is not a permission bypass',()=>{
  const g=game([makeDoc({status:'approved',allowed:false})],PLAYER,[]);
  assert.equal(lookupWorldDefinition(g,id,{publicForAll:true}).status,'not_found');
  assert.equal(lookupWorldDefinition(g,id,{viewer:GM,publicForAll:true}).status,'not_found');
});
test('AG-WORK-0013: restricted duplicate, wrong type, stale and draft statuses are opaque to players',()=>{
  const hidden=makeDoc({visibility:'gm'});
  const g=game([hidden,makeDoc({visibility:'gm'})],PLAYER);
  assert.equal(lookupWorldDefinition(g,id).status,'not_found');
  g.items.contents=[makeDoc({status:'approved'})];
  assert.equal(lookupWorldDefinition(g,id,{entityType:'Material'}).status,'not_found');
  assert.equal(lookupWorldDefinition(g,id,{expectedVersion:'9.9.9'}).status,'not_found');
  g.items.contents=[makeDoc({status:'draft'})];
  assert.equal(lookupWorldDefinition(g,id,{approvedOnly:true}).status,'not_found');
  g.user=GM;
  assert.equal(lookupWorldDefinition(g,id,{approvedOnly:true}).status,'not_released');
  assert.equal(lookupWorldDefinition(g,id,{entityType:'Material'}).status,'wrong_type');
  assert.equal(lookupWorldDefinition(g,id,{expectedVersion:'9.9.9'}).status,'stale');
});
test('AG-WORK-0013: permission callback errors fail closed, no host identity also fails closed',()=>{
  const d=makeDoc({allowed:'throws',status:'approved'}),g=game([d],PLAYER);
  assert.doesNotThrow(()=>lookupWorldDefinition(g,id));
  assert.equal(lookupWorldDefinition(g,id).status,'not_found');
  assert.equal(lookupWorldDefinition({...g,user:null},id).status,'not_found');
  g.user=GM;
  assert.equal(lookupWorldDefinition(g,id,{publicForAll:true}).status,'not_visible');
});
test('AG-WORK-0013: Manager-disabled native world fallback respects archive, identity and zero writes',()=>{
  const d=makeDoc({status:'approved'}),g=game([d]);
  const original=structuredClone(d.flags);
  assert.equal(lookupWorldDefinition(g,id,{entityType:'Recipe'}).status,'ok');
  assert.deepEqual(d.flags,original);
  assert.equal(lookupWorldDefinition(g,'REC-UNRELATED').status,'not_found');
  d.flags['ashen-gate-manager'].lifecycle.archived=true;
  assert.equal(lookupWorldDefinition(g,id).status,'not_found');
  const surviving=makeDoc({status:'approved'});g.items.contents.push(surviving);
  assert.equal(lookupWorldDefinition(g,id,{entityType:'Recipe'}).document,surviving);
});
