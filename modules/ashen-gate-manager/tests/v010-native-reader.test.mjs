import test from 'node:test';
import assert from 'node:assert/strict';
import {createManagerDefinitionReader,READER_CONTRACT} from '../scripts/native-definition-reader.mjs';
import {projectedReferences,checkContractGraph} from '../scripts/contract.js';
const gm={id:'GM',isGM:true};const player={id:'P1',isGM:false};
const source=(id,additional={})=>({sourceId:id,entityType:'Recipe',status:'draft',version:'0.3.2',visibility:'player',
 provenance:{sources:['Tim v0.3.2']},refs:[],scope:'generic_rules',...additional});
const mockDoc=(id,extra={},docType='Item')=>({id:id.toLowerCase(),documentName:docType,uuid:`${docType}.${id.replaceAll('-','')}`,
 name:id,flags:{'ashen-gate-manager':{source:source(id)}},testUserPermission:()=>true,...extra});
function harness(docs=[],user=gm){
 const handlers=new Map();let next=0;const hooks={on:(name,cb)=>{const key=++next;handlers.set(key,{name,cb});return key;},off:(name,key)=>{handlers.delete(key);}};
 const game={user,items:{contents:docs},actors:{contents:[]},journal:{contents:[]},tables:{contents:[]},macros:{contents:[]},packs:new Map()};
 const reader=createManagerDefinitionReader({game,hooks});
 const trigger=(name,doc)=>{for(const {name:n,cb} of handlers.values())if(n===name)cb(doc);};
 return {reader,game,trigger,handlers};
}
test('shared prototype wire is read-only, has an exact source-to-UUID binding, works without world writes',()=>{
 const doc=mockDoc('REC-APPLE');const {reader}=harness([doc]);
 assert.equal(reader.contract,READER_CONTRACT);
 assert.equal(reader.resolve('REC-APPLE',{entityType:'Recipe'}).binding.uuid,'Item.RECAPPLE');
 assert.equal(reader.getState().readOnly,true);
 assert.deepEqual(reader.list().map(x=>x.id),['REC-APPLE']);
 assert.equal(reader.create,undefined);assert.equal(reader.set,undefined);
});
test('all five native world document types are eligible without indexing embedded Actor items',()=>{
 const all=['Item','Actor','JournalEntry','RollTable','Macro'].map((k,i)=>mockDoc('ITEM-'+k.toUpperCase(),{},k));
 const {reader,game}=harness([]);
 Object.assign(game,{items:{contents:[all[0]]},actors:{contents:[all[1],{...all[1],id:'embedded',uuid:'Actor.fake',parent:{id:'p'}}]},journal:{contents:[all[2]]},tables:{contents:[all[3]]},macros:{contents:[all[4]]}});
 assert.equal(reader.list().length,5);
});
test('archive lifecycle separate from status; active and archived never conflict',()=>{
 const a=mockDoc('REC-ALPHA'),b=mockDoc('REC-ALPHA');b.flags['ashen-gate-manager'].lifecycle={archived:true};
 const {reader}=harness([a,b]);assert.equal(reader.resolve('REC-ALPHA').status,'ok');
 a.flags['ashen-gate-manager'].lifecycle={archived:true};reader.refresh();assert.equal(reader.resolve('REC-ALPHA').status,'not_found');
});
test('active duplicates never get silently preferred for GM or player',()=>{
 const one=mockDoc('REC-ALPHA'),two=mockDoc('REC-ALPHA');
 const {reader,game}=harness([one,two]);assert.equal(reader.resolve('REC-ALPHA').status,'conflict');
 game.user=player;assert.deepEqual(reader.resolve('REC-ALPHA'),{status:'not_found'});
});
test('deny hidden, retired, incorrect type, stale and unauthorized documents without revealing metadata',()=>{
 const doc=mockDoc('REC-SECRET');doc.flags['ashen-gate-manager'].source.visibility='gm';
 const {reader,game}=harness([doc],player);assert.deepEqual(reader.resolve('REC-SECRET',{entityType:'Wrong',expectedVersion:'99'}),{status:'not_found'});
 assert.equal(reader.audit().status,'forbidden');game.user=gm;
 assert.equal(reader.resolve('REC-SECRET',{entityType:'Wrong'}).status,'type_mismatch');
 assert.equal(reader.resolve('REC-SECRET',{expectedVersion:'99'}).status,'stale');
 doc.flags['ashen-gate-manager'].source.status='superseded';reader.refresh();assert.equal(reader.resolve('REC-SECRET').status,'inactive');
});
test('player permission is evaluated live and reveal-gated never leaks through documents',()=>{
 let permission=true;const doc=mockDoc('REC-ACCESS',{testUserPermission:()=>permission});
 const {reader,game}=harness([doc],player);assert.equal(reader.resolve('REC-ACCESS').status,'ok');
 permission=false;assert.equal(reader.resolve('REC-ACCESS').status,'not_found');permission=true;
 doc.flags['ashen-gate-manager'].source.visibility='reveal_gated';reader.refresh();assert.equal(reader.resolve('REC-ACCESS').status,'not_found');
 game.user=gm;assert.equal(reader.resolve('REC-ACCESS').status,'ok');
});
test('world lifecycle events refresh the derived index, and disposal removes hooks',()=>{
 const doc=mockDoc('REC-LIVE');const {reader,game,trigger,handlers}=harness([doc]);
 assert.equal(handlers.size,15);assert.equal(reader.resolve('REC-LIVE').status,'ok');
 doc.flags['ashen-gate-manager'].lifecycle={archived:true};trigger('updateItem',doc);
 assert.equal(reader.resolve('REC-LIVE').status,'not_found');
 reader.dispose();assert.equal(handlers.size,0);assert.equal(reader.resolve('REC-LIVE').status,'not_found');
});
test('typed missing references remain immutable through projection and visible to GM audits',()=>{
 const optional={relation:'requires_material',target_id:'MAT-NOT-YET',mode:'optional'};
 const required={relation:'requires_profession',target_id:'PROF-NOT-YET',mode:'required'};
 const refs=[required,optional];const persisted=projectedReferences(refs,[]);
 assert.deepEqual(persisted,refs);assert.notEqual(persisted,refs);
 const doc=mockDoc('REC-TEST');doc.flags['ashen-gate-manager'].source.refs=persisted;
 const {reader}=harness([doc]);const out=reader.audit();
 assert.equal(out.status,'ok');assert.equal(out.missing.length,2);
 assert.equal(out.missing.find(x=>x.to==='MAT-NOT-YET').mode,'optional');
 assert.equal(out.missing.find(x=>x.to==='PROF-NOT-YET').mode,'required');
});
test('malformed source metadata rejected from index, not silently fabricated',()=>{
 const doc=mockDoc('REC-BAD');delete doc.flags['ashen-gate-manager'].source.version;
 const {reader}=harness([doc]);assert.equal(reader.resolve('REC-BAD').status,'not_found');
 assert.equal(reader.audit().worldDiagnostics[0].code,'invalid_metadata');
});
test('compendium explicit load, duplicate diagnostics, failed load does not replace current pack registry',async()=>{
 const world=mockDoc('REC-SHARED');const packDoc=mockDoc('REC-SHARED',{uuid:'Compendium.ashens.items.Item.one'});
 const {reader,game}=harness([world]);
 game.packs.set('ashen.items',{getDocuments:async()=>[packDoc],testUserPermission:()=>true});
 assert.equal((await reader.loadCompendiums(['ashen.items'])).documents,1);
 assert.equal(reader.resolve('REC-SHARED').status,'ok');
 assert.equal(reader.audit().worldOverrides.length,1);
 await assert.rejects(reader.loadCompendiums(['missing']),/unavailable/);
 assert.equal(reader.resolve('REC-SHARED').status,'ok');
 assert.equal(reader.audit().worldOverrides.length,1);
 await reader.loadCompendiums([]);assert.equal(reader.resolve('REC-SHARED').status,'ok');
});
test('GM-only pack reader rejects player and hides pack without document permission',async()=>{
 const doc=mockDoc('REC-REMOTE',{uuid:'Compendium.ashen.items.Item.one',testUserPermission:()=>false});
 const {reader,game}=harness([]);
 game.packs.set('ashen.items',{getDocuments:async()=>[doc],testUserPermission:()=>true});
 await reader.loadCompendiums(['ashen.items']);game.user=player;
 assert.equal(reader.resolve('REC-REMOTE').status,'not_found');
 await assert.rejects(reader.loadCompendiums([]),/Only the GM/);
});
test('canonical source graph warning does not remove missing optional from source',()=>{
 const rec={id:'REC-DEMO',entity_type:'Recipe',refs:[{relation:'requires_material',target_id:'MAT-FUTURE',mode:'optional'}]};
 const graph=checkContractGraph([rec]);assert.equal(graph.errors.length,0);
 assert.match(graph.warnings.join(' '),/preserved/);
 assert.deepEqual(projectedReferences(rec.refs,new Set()),rec.refs);
});
test('Archie latest provider registry: lease, readSource and permission-safe player view',()=>{
 const {reader,game}=harness([]);
 const sourceRow={id:'LOC-DEF',entity_type:'Location',status:'draft',version:'0.1.0',provenance:{sources:['Dave']},visibility:'player',refs:[],privateNotes:'GM only'};
 const lease=reader.registerProvider({providerId:'ashen-gate-locations',readEntries:()=>[{record:sourceRow,
  binding:{kind:'domain',providerId:'ashen-gate-locations',recordKey:'LOC-DEF'},canRead:()=>false}]});
 assert.equal(reader.resolve('LOC-DEF').binding.kind,'domain');
 const raw=reader.readSource('LOC-DEF');assert.equal(raw.record.privateNotes,'GM only');
 raw.record.privateNotes='tamper';assert.equal(reader.readSource('LOC-DEF').record.privateNotes,'GM only');
 game.user=player;assert.equal(reader.resolve('LOC-DEF').status,'not_found');
 assert.equal(reader.readSource('LOC-DEF').status,'not_found');
 game.user=gm;assert.equal(lease.unregister(),true);assert.equal(reader.resolve('LOC-DEF').status,'not_found');
});
test('Archie latest provider failure blocks partial source lookup and can recover',()=>{
 const {reader}=harness([mockDoc('REC-LOCAL')]);
 const lease=reader.registerProvider({providerId:'ashen-gate-bad',readEntries:()=>{throw Error('failed')}});
 assert.equal(reader.resolve('REC-LOCAL').status,'not_found');
 assert.equal(reader.audit().worldDiagnostics[0].code,'provider_failure');
 lease.unregister();assert.equal(reader.resolve('REC-LOCAL').status,'ok');
});
test('new compendium refresh clears stale bindings before reload',async()=>{
 const doc=mockDoc('REC-SLOW',{uuid:'Compendium.ag.pack.Item.item'});
 const {reader,game}=harness([]);let complete;
 game.packs.set('ag.pack',{getDocuments:async()=>[doc],testUserPermission:()=>true});
 await reader.loadCompendiums(['ag.pack']);assert.equal(reader.resolve('REC-SLOW').status,'ok');
 game.packs.set('ag.pack',{getDocuments:()=>new Promise(resolve=>{complete=resolve;}),testUserPermission:()=>true});
 const waiting=reader.refreshCompendiums();
 assert.equal(reader.resolve('REC-SLOW').status,'not_found');
 complete([]);assert.equal((await waiting).status,'ok');
 assert.equal(reader.resolve('REC-SLOW').status,'not_found');
});
