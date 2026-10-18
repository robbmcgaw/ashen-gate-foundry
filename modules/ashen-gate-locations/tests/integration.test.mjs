import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocation} from '../scripts/model.js';
import {
  createLocationProvider,createResolverConnections,checkObjectiveLinks,
  OBJECTIVE_CONSUMER_CONTRACT,RESOLVER_CONTRACT
} from '../scripts/integration.js';

const site=id=>createLocation(id);
const example=site('LOC-INTEGRATION-TEST');
example.name='Private Ruin';example.description.gm='Unrevealed chamber';
example.refs=[
  {relation:'associated_objective',target_id:'QUEST-EXAMPLE',mode:'required'},
  {relation:'offers_objective',target_id:'CONTRACT-EXAMPLE',mode:'optional'}
];

test('GM Location provider returns detached definitions and a stable domain binding, not mutable state',()=>{
 let gm=true;
 const provider=createLocationProvider({isGM:()=>gm,getLocations:()=>[{record:example,revision:8,state:{revealed_pois:['secret']}}]});
 const entries=provider.readEntries();
 assert.equal(entries.length,1);
 const e=entries[0];
 assert.deepEqual(e.binding,{kind:'domain',providerId:'ashen-gate-locations',recordKey:'LOC-INTEGRATION-TEST'});
 assert.equal(e.record.visibility,'gm');
 assert.equal(e.record.description.gm,'Unrevealed chamber');
 assert.equal(e.record.state,undefined,'mutable campaign reveal state is never exported');
 assert.equal(e.record.revision,undefined,'runtime revision is owner-owned, not canonical version');
 assert.equal(e.canRead({isGM:true}),true);
 assert.equal(e.canRead({isGM:false}),false);
 e.record.description.gm='MUTATED';assert.equal(example.description.gm,'Unrevealed chamber','detached copy');
 gm=false;
 assert.deepEqual(provider.readEntries(),[],'even direct client callback cannot read raw GM source');
 assert.equal(e.canRead({isGM:true}),false,'retained entries fail closed on player client');
});

test('registration feature-detects pinned prototype and releases its lease, no Manager dependency',()=>{
 const provider=createLocationProvider({getLocations:()=>[{record:example}],isGM:()=>true});
 const links=createResolverConnections(provider);
 let refreshes=0,unregistered=0,registrations=0,received;
 const resolver={contract:RESOLVER_CONTRACT,registerProvider:arg=>{registrations++;received=arg;return {unregister:()=>unregistered++}},refresh:()=>{refreshes++;return true}};
 assert.throws(()=>links.connect({contract:'made-up',registerProvider(){}}),/compatible/);
 const release=links.connect(resolver);
 assert.equal(links.connect(resolver),release,'no duplicate provider for same resolver');
 assert.equal(registrations,1);
 assert.equal(received.providerId,'ashen-gate-locations');
 assert.equal(received.readEntries()[0].record.id,'LOC-INTEGRATION-TEST');
 links.refresh();assert.equal(refreshes,1);
 release();release();assert.equal(unregistered,1);
 links.refresh();assert.equal(refreshes,1);
 assert.equal(links.count(),0);
});

test('Objective lookup uses owner API, exact logical Objective type and unchanged required/optional refs',async()=>{
 let gm=true;const calls=[];
 const consumer={contract:OBJECTIVE_CONSUMER_CONTRACT,resolveObjective:async (id,opts)=>{
  calls.push([id,opts]);return {status:id==='QUEST-EXAMPLE'?'ok':'not_found',binding:{id}};
 }};
 const modules={get:id=>id==='ashen-gate-quest-manager'?{active:true,api:{consumer}}:null};
 const r=await checkObjectiveLinks({records:[example],modules,isGM:()=>gm});
 assert.deepEqual(r.map(x=>x.status),['ok','not_found']);
 assert.deepEqual(r.map(x=>x.mode),['required','optional']);
 assert.deepEqual(calls,[['QUEST-EXAMPLE',{entityType:'Objective'}],['CONTRACT-EXAMPLE',{entityType:'Objective'}]]);
 assert.ok(!('binding' in r[0]),'never return Quest campaign/source payload');
 gm=false;await assert.rejects(()=>checkObjectiveLinks({records:[example],modules,isGM:()=>gm}),/Only the GM/);
});

test('Missing/disabled/incompatible Quest Manager is not mislabeled as missing Quest data',async()=>{
 const r1=await checkObjectiveLinks({records:[example],modules:{get:()=>undefined},isGM:()=>true});
 assert.deepEqual(r1.map(x=>x.status),['owner_unavailable','owner_unavailable']);
 const r2=await checkObjectiveLinks({records:[example],modules:{get:()=>({active:true,api:{consumer:{contract:'unsupported'}}})},isGM:()=>true});
 assert.deepEqual(r2.map(x=>x.status),['unsupported_contract','unsupported_contract']);
 assert.equal(example.refs[0].mode,'required','never alters Location refs');
});

test('Malformed Objective ID and owner exceptions are report-only, never guess or write',async()=>{
 const x=site('LOC-LINK-INVALID');x.refs=[
  {relation:'associated_objective',target_id:'MAT-NOT-AN-OBJECTIVE',mode:'required'},
  {relation:'offers_objective',target_id:'QUEST-VALID',mode:'optional'}
 ];
 const modules={get:()=>({active:true,api:{consumer:{contract:OBJECTIVE_CONSUMER_CONTRACT,resolveObjective:()=>{throw Error('GM secret');}}}})};
 const before=JSON.stringify(x);const r=await checkObjectiveLinks({records:[x],modules,isGM:()=>true});
 assert.deepEqual(r.map(x=>x.status),['invalid_id','owner_error']);
 assert.equal(JSON.stringify(x),before);
});

test('optional resolver failure cannot roll back a completed Location save',()=>{
 const owner=createLocationProvider({getLocations:()=>[{record:example}],isGM:()=>true});
 const connections=createResolverConnections(owner);
 const resolver={contract:RESOLVER_CONTRACT,registerProvider:()=>({unregister(){}}),refresh:()=>{throw Error('Resolver temporarily disposed');}};
 const release=connections.connect(resolver);
 const warn=console.warn;console.warn=()=>{};
 try {
  const result=connections.refresh();
  assert.equal(result.refreshed,0);
  assert.equal(result.errors.length,1);
 } finally {console.warn=warn;release();}
});
