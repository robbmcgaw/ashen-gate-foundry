import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {
  normalizeLibrary,normalizeRecipe,sourceVisibility,sourceAvailableToPlayer,
  classify,listMaterials,planRecipe,DEMO_LIBRARY
} from '../scripts/core.mjs';
const testPackage=JSON.parse(readFileSync(new URL('../data/manager-v02-ledger-smoke.json',import.meta.url),'utf8'));
const copy=()=>structuredClone(testPackage);

test('Manager v0.2 package becomes a player-visible Ledger catalog without changing the source',()=>{
  const original=JSON.stringify(testPackage),result=normalizeLibrary(testPackage);
  assert.equal(JSON.stringify(testPackage),original,'read-only input');
  assert.equal(result.schema,'ag-ledger/0.1');
  assert.equal(result.sourceSchema,'ag-foundry-import/0.2');
  assert.equal(result.recipes.length,1);
  assert.equal(result.materials.length,1);
  assert.equal(result.recipes[0].id,'REC-DEMO-INTEROP-TEA');
  assert.equal(result.recipes[0].profession,'Herbalism');
  assert.equal(result.recipes[0].hasStructuredIngredients,true);
  assert.equal(result.recipes[0].ingredients[0].quantity,2);
  assert.equal(result.importSummary.skippedRestricted,2);
  assert.doesNotMatch(JSON.stringify(result),/SECRET TEST/i);
});

test('Manager v0.2 imports canonical recipe definitions even when no Foundry projection exists',()=>{
  const p=copy(), recipe=p.records.find(r=>r.entity_type==='Recipe'&&r.visibility==='player');
  delete recipe.foundry;
  recipe.name='Canonical Tea';
  const result=normalizeLibrary(p);
  assert.equal(result.recipes[0].name,'Canonical Tea');
  assert.equal(result.recipes[0].hasStructuredIngredients,true);
});

test('Required references to restricted records quarantine player recipe',()=>{
  const p=copy();
  const rec=p.records.find(r=>r.id==='REC-DEMO-INTEROP-TEA');
  rec.refs=[{relation:'requires_material',target_id:'MAT-DEMO-HIDDEN-HERB',mode:'required'}];
  const result=normalizeLibrary(p);
  assert.equal(result.recipes.length,0);
  assert.equal(result.importSummary.skippedRestricted,3);
  assert.doesNotMatch(JSON.stringify(result),/SECRET TEST/i);
});

test('Manager v0.2 rejects malformed envelope, wrong refs, ID types and ingredient quantities',()=>{
  let p=copy();p.records[0].provenance={source:'legacy'};assert.throws(()=>normalizeLibrary(p),/Invalid Manager/);
  p=copy();p.records[1].refs[0].mode='hard_requirement';assert.throws(()=>normalizeLibrary(p),/typed ref/);
  p=copy();p.records[1].recipe.ingredients[0].materialId='RES-DEMO-SITE';assert.throws(()=>normalizeLibrary(p),/non-MAT/);
  p=copy();p.records[1].recipe.ingredients[0].quantity=0;assert.throws(()=>normalizeLibrary(p),/quantity/);
});

test('No ingredient definitions are never treated as free crafts',()=>{
  const p=copy(), rec=p.records.find(r=>r.id==='REC-DEMO-INTEROP-TEA');
  delete rec.recipe;
  const result=normalizeLibrary(p);
  assert.equal(result.importSummary.unmappedRecipes,1);
  assert.equal(result.recipes[0].hasStructuredIngredients,false);
  const plan=planRecipe(result.recipes[0],[]);
  assert.equal(plan.unsupported,true);
  rec.recipe={ingredients:[]};
  assert.equal(normalizeLibrary(p).recipes[0].hasStructuredIngredients,false);
});

test('Permanent MAT ID takes precedence over duplicate display name; other source types never act as materials',()=>{
  const items=[
    {id:'one',name:'Demo Herbs',system:{quantity:50},flags:{'ashen-gate-manager':{source:{sourceId:'MAT-ANOTHER',entityType:'Material'}}}},
    {id:'two',name:'Demo Herbs',system:{quantity:1},flags:{'ashen-gate-manager':{source:{sourceId:'MAT-DEMO-HERBS',entityType:'Material'}}}},
    {id:'three',name:'Demo Herbs',system:{quantity:200},flags:{'ashen-gate-manager':{source:{sourceId:'REC-SOMETHING',entityType:'Recipe'}}}}
  ];
  const a={id:'a',name:'Test',items};
  const mats=listMaterials([a],DEMO_LIBRARY.materials);
  assert.equal(mats.find(m=>m.id==='MAT-DEMO-HERBS').total,1);
  assert.equal(mats.find(m=>m.id==='MAT-ANOTHER').total,50);
  assert.equal(mats.find(m=>m.id==='REC-SOMETHING'),undefined);
  const plan=planRecipe(DEMO_LIBRARY.recipes[0],[a],DEMO_LIBRARY.materials);
  assert.equal(plan.ready,false);
  assert.equal(plan.requirements[0].available,1,'no name-based fallback for other tagged material IDs');
});

test('Player inventory hides source-restricted materials despite Actor Observer permissions',()=>{
  const hidden={id:'hidden',name:'Secret Ore',system:{quantity:100},flags:{'ashen-gate-manager':{source:{sourceId:'MAT-HIDDEN',entityType:'Material',visibility:'gm'}}}};
  const reveal={id:'reveal',name:'Unrevealed Ore',system:{quantity:100},flags:{'ashen-gate-manager':{source:{sourceId:'MAT-REVEAL',entityType:'Material',visibility:'reveal_gated'}}}};
  const ordinary={id:'public',name:'Demo Herbs',system:{quantity:3},flags:{'ashen-gate-manager':{source:{sourceId:'MAT-DEMO-HERBS',entityType:'Material',visibility:'player'}}}};
  const a={id:'pc',name:'PC',items:[hidden,reveal,ordinary]};
  assert.equal(sourceVisibility(hidden),'gm');
  assert.equal(sourceAvailableToPlayer(hidden),false);
  assert.equal(sourceAvailableToPlayer(reveal),false);
  assert.equal(sourceAvailableToPlayer(ordinary),true);
  assert.equal(listMaterials([a],DEMO_LIBRARY.materials,{includeRestricted:false}).length,1);
  assert.equal(listMaterials([a],DEMO_LIBRARY.materials,{includeRestricted:true}).length,3);
  assert.equal(classify(reveal),'Material');
  assert.equal(planRecipe(normalizeRecipe({id:'REC-HIDDEN',name:'Restricted',ingredients:[{materialId:'MAT-HIDDEN',quantity:1}]}),[a],[],{includeRestricted:false}).ready,false);
});

test('Old ag-ledger/0.1 catalog still imports, except non-player entries',()=>{
  const pkg={schema:'ag-ledger/0.1',recipes:[{id:'REC-PUBLIC',name:'Public',visibility:'player',ingredients:[{materialId:'MAT-PUBLIC',quantity:2}]},
    {id:'REC-PRIVATE',name:'Private',visibility:'gm'}],materials:[{id:'MAT-PUBLIC',name:'Public',visibility:'player'},{id:'MAT-PRIVATE',name:'Secret',visibility:'reveal_gated'}]};
  const r=normalizeLibrary(pkg);
  assert.equal(r.recipes.length,1);assert.equal(r.materials.length,1);assert.equal(r.importSummary.skippedRestricted,2);
});

test('Profession-only Manager files cannot accidentally empty the Ledger catalog',()=>{
  const p={manifest:{schema_version:'ag-foundry-import/0.2',package_id:'TIM-CANDIDATE',version:'1.0.0'},records:[{id:'PROF-EXAMPLE',entity_type:'Profession',visibility:'player'}]};
  assert.throws(()=>normalizeLibrary(p),/No Recipe or Material/);
});

test('Entirely hidden Manager libraries do not replace the existing public catalog',()=>{
  const p=copy();p.records=p.records.filter(r=>r.visibility!=='player');
  assert.throws(()=>normalizeLibrary(p),/No player-visible/);
});

test('Legacy Ledger catalog does not expose ingredients referencing hidden material records',()=>{
  const pkg={schema:'ag-ledger/0.1',recipes:[
    {id:'REC-REF-SECRET',name:'Would reveal hidden material',ingredients:[{materialId:'MAT-SECRET',name:'secret reagent',quantity:1}]}
  ],materials:[{id:'MAT-SECRET',name:'Secret Material',visibility:'gm'}]};
  const normalized=normalizeLibrary(pkg);
  assert.equal(normalized.recipes.length,0);
  assert.equal(normalized.importSummary.skippedRestricted,2);
  assert.doesNotMatch(JSON.stringify(normalized),/secret reagent|Secret Material/i);
});
