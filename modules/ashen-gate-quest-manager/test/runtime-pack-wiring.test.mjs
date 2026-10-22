import test from 'node:test';
import assert from 'node:assert/strict';
import {MOD} from '../scripts/core.mjs';
const readyCallbacks=new Map(),handlers=new Map(),registered=new Map();
globalThis.Hooks={once:(e,fn)=>readyCallbacks.set(e,fn),on:(e,fn)=>{handlers.set(e,fn);return fn;},off:(e)=>handlers.delete(e)};
globalThis.foundry={applications:{api:{ApplicationV2:class{}}}};
const gm={id:'gm',isGM:true},user={id:'p',isGM:false};
const source={sourceId:'CONTRACT-PACK',entityType:'Objective',status:'approved',sourceVersion:'0.1.0',
  provenance:{sources:['fixture']},visibility:'gm',refs:[],definition:{objective_kind:'contract'}};
const packDoc={uuid:'Compendium.world.contracts.D1',name:'Unknown name',flags:{'ashen-gate-manager':{source}},testUserPermission:()=>true};
const pack={getDocuments:async()=>[packDoc],testUserPermission:()=>true};
const quest={active:true,api:null};
const actors=[];actors.get=()=>null;
globalThis.game={user:gm,actors,journal:[],items:[],tables:[],macros:[],packs:new Map([['world.contracts',pack]]),users:[gm,user],
  modules:{get:id=>id===MOD?quest:null},
  settings:{register:(_module,key,config)=>registered.set(key,config),get:(_module,key)=>key==='compendiumPackIds'?'world.contracts':false,set:async()=>true}};
globalThis.document={querySelectorAll:()=>[]};
globalThis.ui={actors:{element:null},notifications:{info(){},error(){}}};
await import('../scripts/main.mjs?runtime-pack-wire');
readyCallbacks.get('init')();readyCallbacks.get('ready')();
test('standalone Quest v0.3.1 manifest-facing API loads configured pack via bundled pin',async()=>{
 assert.equal(quest.api.version,'0.15.0');
 assert.equal(registered.get('compendiumPackIds').scope,'world');
 const res=await quest.api.consumer.refreshCompendiums();assert.equal(res.status,'ok');
 const r=quest.api.consumer.resolveObjective('CONTRACT-PACK',{entityType:'Objective'});
 assert.equal(r.status,'ok');assert.equal(r.binding.uuid,packDoc.uuid);
});
test('GM API pack refresh is denied to player',async()=>{
 game.user=user;
 await assert.rejects(()=>quest.api.consumer.refreshCompendiums(),/GM permission/);
 assert.throws(()=>quest.api.consumer.getDefinitionReaderStatus(),/GM permission/);
 assert.deepEqual(quest.api.consumer.resolveObjective('CONTRACT-PACK'),{status:'not_found'});
 assert.throws(()=>quest.api.getGMSource('CONTRACT-PACK'),/GM permission/);
});
