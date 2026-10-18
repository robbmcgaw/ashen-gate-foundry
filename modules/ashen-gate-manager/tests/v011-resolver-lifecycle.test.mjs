import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePackage} from '../scripts/core.js';
import {sourceMetadata,canonicalDefinition,readStoredDefinition} from '../scripts/source-projection.mjs';
import {createManagerDefinitionReader} from '../scripts/native-definition-reader.mjs';
import {projectedReferences} from '../scripts/contract.js';
const NS='ashen-gate-manager';
const gm={id:'gm',isGM:true},player={id:'p',isGM:false};
const manifest={schema_version:'ag-foundry-import/0.2',package_id:'AG-RESOLVER-SYNTHETIC',version:'0.1.0'};
const mk=(id,type,document_type,data,extra={})=>({id,entity_type:type,status:'approved',version:'0.1.0',
 provenance:{sources:['synthetic regression'],decision_refs:['DEC-0080']},visibility:'gm',refs:[],scope:'setting_adapter',
 foundry:{document_type,folder_path:`Ashen Gate/Tests/${document_type}`,data},...extra});
const mat=mk('MAT-IRON','Material','Item',{name:'Synthetic Iron',type:'loot',system:{quantity:1}}, {tier:2});
const rec=mk('REC-IRON','Recipe','Item',{name:'Synthetic Iron Recipe',type:'loot',system:{description:{value:'Recipe'}}},
 {requirements:{materials:[{material_id:'MAT-IRON',quantity:3}],profession_id:'PROF-BLACKSMITHING'},
 refs:[{relation:'requires_material',target_id:'MAT-IRON',mode:'required'},
 {relation:'related_material',target_id:'MAT-FUTURE',mode:'optional'}]});
const perk=mk('PERK-IRON','ProfessionPerk','Item',{name:'Synthetic Iron Perk',type:'feat',system:{}},
 {effects_summary:{price_reduction:10}});
const npc=mk('ACTOR-SYNTHETIC','NPC','Actor',{name:'Synthetic Guard',type:'npc',
 system:{attributes:{hp:{value:8,max:8}}},prototypeToken:{name:'Guard',actorLink:false},
 items:[{name:'Spear',type:'weapon',system:{damage:{base:'1d6'}}}]});
const all=[mat,rec,perk,npc];
const pkg={manifest,records:all};
function runtime(){
 const docs=[];let next=0;const callbacks=new Map();const hooks={on:(n,f)=>{const id=++next;callbacks.set(id,[n,f]);return id;},off:(_,id)=>callbacks.delete(id)};
 const game={user:gm,items:{get contents(){return docs.filter(x=>x.documentName==='Item')}},actors:{get contents(){return docs.filter(x=>x.documentName==='Actor')}},journal:{contents:[]},tables:{contents:[]},macros:{contents:[]},packs:new Map()};
 const reader=createManagerDefinitionReader({game,hooks});
 function updateEvent(n,doc){for(const [name,fn] of callbacks.values()) if(name===n)fn(doc);}
 function project(rec){const data=sourceMetadata(rec,pkg,projectedReferences(rec.refs,[]));const name=rec.foundry.data.name,kind=rec.foundry.document_type;
   const doc={id:`doc${++next}`,uuid:`${kind}.doc${next}`,name,documentName:kind,
     flags:{[NS]:{source:data,lifecycle:{archived:false}}},
     system:structuredClone(rec.foundry.data.system??{}),items:{contents:structuredClone(rec.foundry.data.items??[])},
     testUserPermission:()=>true};
   docs.push(doc);updateEvent('create'+kind,doc);return doc;
 }
 function archive(doc,enabled){doc.flags[NS].lifecycle.archived=enabled;updateEvent('update'+doc.documentName,doc);}
 function reimport(doc,rec){doc.flags[NS].source=sourceMetadata(rec,pkg,rec.refs);updateEvent('update'+doc.documentName,doc);}
 return {docs,game,reader,project,archive,reimport};
}
test('validated source package has MAT / REC / PERK / NPC with typed permanent IDs',()=>{
 assert.deepEqual(validatePackage(pkg),[]);
 assert.equal(npc.entity_type,'NPC');assert.equal(npc.foundry.document_type,'Actor');
 assert.deepEqual(all.map(x=>x.foundry.folder_path),['Ashen Gate/Tests/Item','Ashen Gate/Tests/Item','Ashen Gate/Tests/Item','Ashen Gate/Tests/Actor']);
});
test('reject ACTOR logical type; never silently convert canonical identity',()=>{
 const bad=structuredClone(pkg);bad.records[3].entity_type='Actor';
 assert.match(validatePackage(bad).join(' '),/entity_type NPC/);
 assert.equal(npc.id,'ACTOR-SYNTHETIC');
});
test('complete source projection preserves all author fields without the Foundry writer fields',()=>{
 const m=sourceMetadata(rec,pkg,rec.refs);
 assert.equal(m.entityType,'Recipe');assert.equal(m.version,'0.1.0');assert.equal(m.sourceVersion,'0.1.0');
 assert.deepEqual(m.definition.requirements,rec.requirements);
 assert.deepEqual(m.definition.refs,rec.refs);assert.deepEqual(m.provenance,rec.provenance);
 assert.equal(m.definition.foundry,undefined);
 const returned=readStoredDefinition(m);returned.requirements.materials[0].quantity=999;
 assert.equal(m.definition.requirements.materials[0].quantity,3);
 assert.equal(canonicalDefinition(npc).foundry,undefined);
});
test('clean import resolves all native definitions and keeps recipe/actor content',()=>{
 const env=runtime();for(const rec of all)env.project(rec);
 assert.equal(env.reader.resolve('REC-IRON',{entityType:'Recipe'}).status,'ok');
 assert.equal(env.reader.resolve('ACTOR-SYNTHETIC',{entityType:'NPC'}).binding.entityType,'NPC');
 assert.equal(env.reader.resolve('ACTOR-SYNTHETIC',{entityType:'Actor'}).status,'type_mismatch');
 assert.deepEqual(env.docs.at(-1).items.contents,npc.foundry.data.items);
 assert.deepEqual(env.reader.readSource('REC-IRON').record.requirements,rec.requirements);
 const refs=env.reader.validateReferences();assert.equal(refs.status,'ok');
 assert.deepEqual(refs.optionalGaps.map(x=>x.to),['MAT-FUTURE']);
});
test('campaign-state records are rejected as definitions while an absent scope remains valid',()=>{
 const env=runtime();
 const campaignState=env.project({...rec,id:'REC-STATE',scope:'campaign_state'});
 assert.deepEqual(env.reader.resolve('REC-STATE',{entityType:'Recipe'}),{status:'not_found'});
 assert.ok(env.reader.audit().worldDiagnostics.some(x=>x.uuid===campaignState.uuid&&x.code==='invalid_metadata'));
 const definition=env.project({...mat,id:'MAT-UNSCOPED',scope:null});
 assert.equal(definition.flags['ashen-gate-manager'].source.scope,null);
 assert.equal(env.reader.resolve('MAT-UNSCOPED',{entityType:'Material'}).status,'ok');
});
test('required missing reference fails integration validation without deleting authored link',()=>{
 const env=runtime();env.project(rec);
 const report=env.reader.validateReferences();
 assert.equal(report.status,'failed');
 assert.deepEqual(report.requiredFailures.map(x=>x.to),['MAT-IRON']);
 assert.deepEqual(report.optionalGaps.map(x=>x.to),['MAT-FUTURE']);
 assert.deepEqual(env.reader.readSource('REC-IRON').record.refs,rec.refs);
});
test('archive restore excludes and restores native source but never changes source status',()=>{
 const env=runtime(),doc=env.project(mat);assert.equal(env.reader.resolve(mat.id).status,'ok');
 env.archive(doc,true);assert.equal(env.reader.resolve(mat.id).status,'not_found');
 assert.equal(doc.flags[NS].source.status,'approved');
 env.archive(doc,false);assert.equal(env.reader.resolve(mat.id).status,'ok');
});
test('reimport metadata refresh preserves source revision and new recipe fields',()=>{
 const env=runtime(),doc=env.project(rec),revision=structuredClone(rec);
 revision.version='0.1.1';revision.requirements.materials[0].quantity=5;
 env.reimport(doc,revision);
 assert.equal(env.reader.readSource('REC-IRON').record.version,'0.1.1');
 assert.equal(env.reader.readSource('REC-IRON').record.requirements.materials[0].quantity,5);
 assert.equal(env.reader.resolve('REC-IRON',{expectedVersion:'0.1.0'}).status,'stale');
});
test('unique world beats same-type pack; duplicate world is conflict',async()=>{
 const env=runtime(),world=env.project(mat);
 const pack={id:'pack',uuid:'Compendium.ag.test.Item.abc',name:mat.foundry.data.name,flags:{[NS]:{source:sourceMetadata(mat,pkg,[])}} ,testUserPermission:()=>true};
 env.game.packs.set('ag.test',{getDocuments:async()=>[pack],testUserPermission:()=>true});
 await env.reader.loadCompendiums(['ag.test']);
 assert.equal(env.reader.resolve('MAT-IRON').binding.uuid,world.uuid);
 assert.equal(env.reader.audit().worldOverrides.length,1);
 env.project(mat);assert.equal(env.reader.resolve('MAT-IRON').status,'conflict');
 env.game.user=player;assert.deepEqual(env.reader.resolve('MAT-IRON'),{status:'not_found'});
});
test('unreadable world override never falls through to visible compendium',async()=>{
 const env=runtime(),world=env.project({...mat,visibility:'player'});
 world.testUserPermission=()=>false;
 const pack={id:'pack',uuid:'Compendium.ag.test.Item.abc',name:'Public copy',
 flags:{[NS]:{source:sourceMetadata({...mat,visibility:'player'},pkg,[])}},testUserPermission:()=>true};
 env.game.packs.set('ag.test',{getDocuments:async()=>[pack],testUserPermission:()=>true});
 await env.reader.loadCompendiums(['ag.test']);env.game.user=player;
 assert.deepEqual(env.reader.resolve('MAT-IRON'),{status:'not_found'});
 assert.equal(env.reader.readSource('MAT-IRON').status,'not_found');
 assert.equal(env.reader.validateReferences().status,'forbidden');
 assert.equal(env.reader.audit().status,'forbidden');
});
test('GM-only NPC source not disclosed to player even with native permission',()=>{
 const env=runtime();env.project(npc);env.game.user=player;
 assert.deepEqual(env.reader.resolve(npc.id),{status:'not_found'});
 assert.deepEqual(env.reader.list(),[]);
 assert.equal(env.reader.readSource(npc.id).status,'not_found');
});
test('Manager-independent consumer: persisted source binds from native world data alone',()=>{
 const env=runtime();env.project(mat);const persisted=env.docs[0];env.reader.dispose();
 // The source flag and full definition are stored ON native Item; no Manager
 // world setting, cache, player XP, roster or extra canonical database required.
 assert.deepEqual(persisted.flags[NS].source.definition,canonicalDefinition(mat));
 const standalone=createManagerDefinitionReader({game:env.game});
 assert.equal(standalone.resolve(mat.id,{entityType:'Material'}).status,'ok');
 standalone.dispose();
});
