import test from 'node:test';
import assert from 'node:assert/strict';
import {createManagerDefinitionReader} from '../scripts/native-definition-reader.mjs';

function setup({isRevealed,canRead=true}={}) {
  const user={id:'player',isGM:false};
  const doc={
    id:'doc-gated',uuid:'Item.MAT-GATED',name:'Gated Material',documentName:'Item',
    flags:{'ashen-gate-manager':{
      source:{
        sourceId:'MAT-GATED',entityType:'Material',status:'approved',sourceVersion:'1.0.0',
        provenance:{sources:['focused regression']},visibility:'reveal_gated',refs:[]
      },
      lifecycle:{archived:false}
    }},
    testUserPermission:()=>canRead
  };
  const game={user,items:{contents:[doc]},actors:{contents:[]},journal:{contents:[]},tables:{contents:[]},macros:{contents:[]},packs:new Map()};
  const reader=createManagerDefinitionReader({game,isRevealed});
  return {reader,doc};
}

test('Manager reveal policy allows a permitted player when the owning policy reveals the record',()=>{
  const {reader}=setup({isRevealed:()=>true});
  assert.equal(reader.resolve('MAT-GATED',{entityType:'Material'}).status,'ok');
});

test('Manager reveal policy blocks hidden or unreadable records and fails closed on policy errors',()=>{
  assert.equal(setup({isRevealed:()=>false}).reader.resolve('MAT-GATED').status,'not_found');
  assert.equal(setup({isRevealed:()=>true,canRead:false}).reader.resolve('MAT-GATED').status,'not_found');
  assert.equal(setup({isRevealed:()=>{throw new Error('policy unavailable');}}).reader.resolve('MAT-GATED').status,'not_found');
});

