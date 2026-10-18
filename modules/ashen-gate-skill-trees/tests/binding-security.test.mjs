import test from 'node:test';
import assert from 'node:assert/strict';
import {lookupWorldDefinition} from '../scripts/definition-lookup.mjs';
const GM={id:'gm',isGM:true},P={id:'p',isGM:false};
const src=(id,type='Material',extra={})=>({sourceId:id,entityType:type,status:'approved',visibility:'player',...extra});
const item=(id,options={})=>({id:'world-'+Math.random(),documentName:'Item',type:'loot',name:id,ownership:{default:2},
  flags:{'ashen-gate-manager':{source:src(id,options.type??'Material',options.source),lifecycle:{archived:options.archived??false}}},
  testUserPermission:(u)=>u.isGM||!options.denied, ...options.doc});
const game=(items=[],users=[P])=>({items:{contents:items},journal:{contents:[]},actors:{contents:[]},tables:{contents:[]},macros:{contents:[]},users:{contents:users},user:GM});
test('active source canonical lookup without Manager module',()=>{
 const d=item('MAT-TEST');const g=game([d]);assert.equal(lookupWorldDefinition(g,'MAT-TEST',{entityType:'Material',publicForAll:true}).document,d);
});
test('reject missing or invalid identity: never fall back to name or UUID',()=>{
 const d=item('MAT-REAL');d.name='MAT-IMPERSONATOR';const g=game([d]);
 assert.equal(lookupWorldDefinition(g,'MAT-IMPERSONATOR').status,'not_found');
 assert.equal(lookupWorldDefinition(g,'bad').status,'invalid');
});
test('archived-only sources do not resolve; active plus archived resolves active',()=>{
 const a=item('MAT-TEST',{archived:true});const b=item('MAT-TEST');
 assert.equal(lookupWorldDefinition(game([a]),'MAT-TEST').status,'not_found');
 assert.equal(lookupWorldDefinition(game([a,b]),'MAT-TEST').document,b);
});
test('active duplicates and cross-type conflicts fail closed',()=>{
 const a=item('MAT-TEST'),b=item('MAT-TEST');
 assert.equal(lookupWorldDefinition(game([a,b]),'MAT-TEST').status,'conflict');
 const x=item('MAT-TEST',{type:'Material'}),y=item('MAT-TEST',{type:'Recipe'});
 assert.equal(lookupWorldDefinition(game([x,y]),'MAT-TEST',{entityType:'Material'}).status,'conflict');
});
test('unapproved or hidden/unrevealed sources cannot be published',()=>{
 for(const source of [{status:'draft'},{visibility:'gm'},{visibility:'reveal_gated'},{visibility:undefined}]){
  const d=item('MAT-TEST',{source});const r=lookupWorldDefinition(game([d]),'MAT-TEST',{publicForAll:true,approvedOnly:true});
  assert.notEqual(r.status,'ok');
 }
});
test('source metadata alone is not Foundry permission: one denied player fails all-player projection',()=>{
 const denied=item('MAT-TEST',{denied:true});
 assert.equal(lookupWorldDefinition(game([denied]),'MAT-TEST',{publicForAll:true}).status,'not_visible');
 const playerGame=game([denied]);playerGame.user=P;
 assert.equal(lookupWorldDefinition(playerGame,'MAT-TEST').status,'not_found');
});
test('empty player roster requires public default ownership for shared projection',()=>{
 const d=item('MAT-TEST',{doc:{ownership:{default:0}}});
 assert.equal(lookupWorldDefinition(game([d],[]),'MAT-TEST',{publicForAll:true}).status,'not_visible');
});
test('read-only lookup never mutates a document or creates any state',()=>{
 let called=false;const d=item('MAT-TEST',{doc:{setFlag:()=>{called=true;throw Error('write');}}});
 lookupWorldDefinition(game([d]),'MAT-TEST',{publicForAll:true});assert.equal(called,false);
});
