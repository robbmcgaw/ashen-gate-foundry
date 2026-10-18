/** AG-WORK-0011 source→Manager v0.11.1→native mock→Ledger regression.
 * Fixture is Tim's pinned GitHub main source, status DRAFT, not newly approved rules.
 * Not a live Foundry import. No XP/known recipe writes or Perk progression.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {sourceMetadata} from './fixtures/manager-v0.11.1-source-projection.mjs';
import {normalizeRecipe, normalizeLibrary, classify, sourceAvailableToPlayer} from '../scripts/core.mjs';
import {lookupWorldDefinition, readWorldDefinition} from '../scripts/definition-lookup.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/AG_WORK_0002_Material_Recipe_Item.json',import.meta.url)));
const byType=type=>fixture.records.find(x=>x.entity_type===type);
const RECORDS=fixture.records;
const pkg={manifest:{schema_version:'ag-foundry-import/0.2',package_id:'AG-WORK-0002-ROUNDTRIP-TEST',version:'0.1.0'},
  records:RECORDS.map(record=>({...structuredClone(record),foundry:{document_type:'Item',
    folder_path:`Ashen Gate/Professions/${record.entity_type==='Material'?'Materials':record.entity_type==='Recipe'?'Recipes':'Equipment'}`,
    data:{name:record.name,type:'loot'}}}))};
const GM={isGM:true,id:'gm'},PLAYER={isGM:false,id:'player'};
const project=record=>{
  const source=sourceMetadata(record,pkg,record.refs);
  return {id:`mock-${record.id}`,uuid:`Item.mock-${record.id}`,name:record.name,documentName:'Item',type:'loot',
    flags:{'ashen-gate-manager':{source,lifecycle:{archived:false}}},
    testUserPermission:()=>true,toObject(){return structuredClone({id:this.id,name:this.name,type:this.type,flags:this.flags,system:{}});}};
};
const docs=pkg.records.map(project);
const game={user:GM,items:{contents:docs},journal:{contents:[]},actors:{contents:[]},tables:{contents:[]},macros:{contents:[]},users:{contents:[GM,PLAYER]},settings:{get:()=>null}};

test('Pinned fixture exact (id, entity_type) source chain retained',()=>{
  assert.deepEqual(RECORDS.map(x=>x.id),fixture.chain_ids);
  assert.deepEqual(RECORDS.map(x=>x.entity_type),['Material','Recipe','Item']);
  assert.ok(RECORDS.every(x=>x.refs.every(r=>r.mode==='required')));
  assert.equal(RECORDS.flatMap(x=>x.refs.filter(r=>r.mode==='optional')).length,0);
});

test('Manager v0.11.1 creates exact immutable structured definition and refs for all three',()=>{
  for(let i=0;i<docs.length;i++){
    const flag=docs[i].flags['ashen-gate-manager'].source,expected=RECORDS[i];
    assert.equal(flag.sourceId,expected.id);
    assert.equal(flag.entityType,expected.entity_type);
    assert.deepEqual(flag.refs,expected.refs);
    assert.deepEqual(flag.definition,expected);
  }
});

test('Ledger native Item lookup returns full canonical Material, Recipe and resulting Item by typed ID',()=>{
  for(const source of RECORDS){
    const result=readWorldDefinition(game,source.id,{entityType:source.entity_type,viewer:GM});
    assert.equal(result.status,'ok');
    assert.deepEqual(result.definition,source);
    assert.deepEqual(result.definition.refs,source.refs);
  }
});

test('Ledger reads structured recipe ingredients, tier, effort, profession ID, output ID and original refs',()=>{
  const doc=docs[1],source=RECORDS[1];
  const match=readWorldDefinition(game,source.id,{entityType:'Recipe',viewer:GM});
  const out=normalizeRecipe({...doc.toObject(),id:source.id,uuid:doc.uuid,sourceDefinition:match.definition});
  assert.equal(out.hasStructuredIngredients,true);
  assert.deepEqual(out.ingredients,[{materialId:'MAT-HERBALISM-APPRENTICE-COMMON',name:'MAT-HERBALISM-APPRENTICE-COMMON',quantity:1}]);
  assert.equal(out.professionId,'PROF-ALCHEMY');
  assert.equal(out.resultItemId,fixture.chain_ids[2]);
  assert.equal(out.tier,source.tier);
  assert.equal(out.effort,source.effort);
  assert.deepEqual(out.refs,source.refs);
  assert.deepEqual(out.sourceDefinition,source);
});

test('Ledger Manager-format source package import preserves complete structured Material and Recipe definitions',()=>{
  const original=structuredClone(pkg);
  const lib=normalizeLibrary(pkg);
  assert.deepEqual(pkg,original,'definition import cannot change source');
  assert.equal(lib.recipes.length,1);assert.equal(lib.materials.length,1);
  const rec=lib.recipes[0],mat=lib.materials[0];
  assert.equal(rec.hasStructuredIngredients,true);
  assert.equal(rec.ingredients[0].quantity,1);
  assert.equal(rec.professionId,'PROF-ALCHEMY');
  assert.equal(rec.resultItemId,fixture.chain_ids[2]);
  assert.equal(rec.tier,'apprentice');assert.equal(rec.effort,'short');
  assert.deepEqual(rec.refs,byType('Recipe').refs);
  assert.deepEqual(rec.sourceDefinition,byType('Recipe'));
  assert.equal(mat.id,fixture.chain_ids[0]);
  assert.deepEqual(mat.sourceDefinition,byType('Material'));
  assert.deepEqual(mat.refs,byType('Material').refs);
  for(const [key,value] of Object.entries(byType('Material'))){
    if(key==='foundry')continue;
    assert.deepEqual(mat[key],value,`Material source field ${key} retained`);
  }
});

test('Ledger catalog prefers native source definitions to stale world-setting summaries',()=>{
  const src=readFileSync(new URL('../scripts/main.js',import.meta.url),'utf8');
  const start=src.indexOf('function catalog(){'),end=src.indexOf('\n/** Profession rows for a character',start);
  assert.ok(start>=0&&end>start);
  const catalogFn=src.slice(start,end);
  game.settings.get=()=>({source:'legacy',recipes:[{id:fixture.chain_ids[1],name:'Stale',visibility:'player'}],
    materials:[{id:fixture.chain_ids[0],name:'Stale',visibility:'player'}]});
  const sandbox={game,ID:'ashen-gate-profession-ledger',lookupWorldDefinition,readWorldDefinition,
    normalizeRecipe,sourceAvailableToPlayer,classify};
  const result=vm.runInNewContext(`${catalogFn}\ncatalog()`,sandbox);
  const recipe=result.recipes.find(x=>x.id===fixture.chain_ids[1]);
  const material=result.materials.find(x=>x.id===fixture.chain_ids[0]);
  assert.equal(result.recipes.length,1);assert.equal(result.materials.length,1);
  assert.equal(recipe.name,byType('Recipe').name);
  assert.equal(recipe.hasStructuredIngredients,true);
  assert.deepEqual(recipe.sourceDefinition,byType('Recipe'));
  assert.deepEqual(material.sourceDefinition,byType('Material'));
});

test('Identity/ref mismatch fails closed without substituting description or UUID',()=>{
  const bad=project(pkg.records[1]);
  bad.flags['ashen-gate-manager'].source.definition={...bad.flags['ashen-gate-manager'].source.definition,refs:[]};
  const broken={...game,items:{contents:[bad]}};
  assert.equal(readWorldDefinition(broken,fixture.chain_ids[1],{entityType:'Recipe',viewer:GM}).status,'invalid_definition');
  assert.equal(readWorldDefinition(broken,fixture.chain_ids[1],{entityType:'Material',viewer:GM}).status,'wrong_type');
  assert.equal(readWorldDefinition(broken,fixture.chain_ids[0],{entityType:'Material',viewer:GM}).status,'not_found');
  const old=project(pkg.records[1]);delete old.flags['ashen-gate-manager'].source.definition;
  assert.equal(readWorldDefinition({...game,items:{contents:[old]}},fixture.chain_ids[1],{entityType:'Recipe',viewer:GM}).status,'missing_definition');
});

test('Archived/duplicate and unapproved player documents cannot reveal the pinned source',()=>{
  const archival=project(pkg.records[1]);archival.flags['ashen-gate-manager'].lifecycle.archived=true;
  assert.equal(readWorldDefinition({...game,items:{contents:[archival]}},fixture.chain_ids[1],{entityType:'Recipe',viewer:GM}).status,'not_found');
  assert.equal(readWorldDefinition({...game,items:{contents:[project(pkg.records[1]),project(pkg.records[1])]}},fixture.chain_ids[1],{entityType:'Recipe',viewer:GM}).status,'conflict');
  assert.equal(readWorldDefinition(game,fixture.chain_ids[1],{entityType:'Recipe',viewer:PLAYER,approvedOnly:true}).status,'not_released');
});

test('The pinned three-record fixture cannot validate the two external PROF-* references',()=>{
  const provided=new Set(RECORDS.map(x=>x.id));
  const missing=[...new Set(RECORDS.flatMap(x=>x.refs).filter(x=>!provided.has(x.target_id)).map(x=>x.target_id))].sort();
  assert.deepEqual(missing,['PROF-ALCHEMY','PROF-HERBALISM']);
});
