import assert from 'node:assert/strict';
import {SCHEMA,PROFESSION_NAMES,norm,normalizeLibrary,normalizeRecipe,professionFromTreeName,demoSnapshot,DEMO_LIBRARY,
  classify,inventory,listMaterials,planRecipe,quantity,agSourceId} from '../scripts/core.mjs';
const t=(desc,fn)=>{fn(); console.log('PASS '+desc);};
t('14 current profession names with Arcana',()=>{assert.equal(PROFESSION_NAMES.length,14);assert.ok(PROFESSION_NAMES.includes('Arcana'));});
t('prototype tree title maps back to profession',()=>{assert.equal(professionFromTreeName('Alchemy · Prototype'),'Alchemy');assert.equal(professionFromTreeName('Enchanting · Prototype'),'Arcana');});
t('material classification uses permanent id',()=>{assert.equal(classify(demoSnapshot()[0].items[0]),'Material');});
t('Item quantities integer nonnegative',()=>{assert.equal(quantity({system:{quantity:4}}),4);assert.equal(quantity({system:{quantity:-2}}),0);});
t('snapshot shares materials across Actors',()=>{const m=listMaterials(demoSnapshot(),DEMO_LIBRARY.materials);assert.equal(m.find(x=>x.name==='Demo Herbs').total,6);assert.equal(m.find(x=>x.name==='Demo Vial').total,6);});
t('ready recipe pulls from two actors',()=>{const p=planRecipe(DEMO_LIBRARY.recipes[0],demoSnapshot(),DEMO_LIBRARY.materials);assert.equal(p.ready,true);assert.equal(p.allocations.filter(x=>x.name==='Demo Herbs').length,2);assert.equal(p.allocations.reduce((n,x)=>n+x.quantity,0),6);});
t('unavailable ingredients reported without mutations',()=>{const actors=demoSnapshot();const before=JSON.stringify(actors);const p=planRecipe(DEMO_LIBRARY.recipes[1],actors,DEMO_LIBRARY.materials);assert.equal(p.ready,false);assert.equal(p.missing[0].missing,3);assert.equal(JSON.stringify(actors),before);});
t('unmapped recipe blocks planner',()=>{const p=planRecipe(normalizeRecipe({id:'REC-TEST-1',name:'Test'}),demoSnapshot());assert.equal(p.unsupported,true);});
t('JSON library schema',()=>{const pkg=normalizeLibrary({schema:SCHEMA,recipes:[{id:'REC-TEST-1',name:'Test',visibility:'player',ingredients:[{materialId:'MAT-TEST-1',name:'Test',quantity:2}]}],materials:[{id:'MAT-TEST-1',name:'Test',visibility:'player'}]});assert.equal(pkg.recipes[0].ingredients.length,1);});
t('manager import format accepted and restricted excluded',()=>{const p=normalizeLibrary({manifest:{schema_version:'ag-foundry-import/0.1'},records:[{id:'REC-TEST-2',entity_type:'Recipe',visibility:'player',foundry:{data:{name:'Recipe: Test'}}},{id:'REC-SECRET',entity_type:'Recipe',visibility:'gm',foundry:{data:{name:'Secret'}}}]});assert.equal(p.recipes.length,1);});
t('invalid IDs rejected',()=>{assert.throws(()=>normalizeLibrary({schema:SCHEMA,recipes:[{id:'bad id',name:'Bad',visibility:'player'}],materials:[]}));});
t('duplicate IDs rejected',()=>{assert.throws(()=>normalizeLibrary({schema:SCHEMA,recipes:[{id:'REC-TEST-1',name:'A',visibility:'player'},{id:'REC-TEST-1',name:'B',visibility:'player'}],materials:[]}));});
t('material matching uses ID first and name fallback',()=>{const p=planRecipe(DEMO_LIBRARY.recipes[0],demoSnapshot(),DEMO_LIBRARY.materials);assert.equal(p.requirements[0].required,4);});

t('Archie alternate typed MAT entity ID is recognized without mutating Item',()=>{const it={id:'itA',name:'Test Copper',type:'loot',system:{quantity:3},flags:{'ashen-gate':{entityId:'MAT-TEST-COPPER'}}};assert.equal(agSourceId(it),'MAT-TEST-COPPER');assert.equal(classify(it),'Material');const a={id:'pc',name:'Tester',items:[it]};assert.equal(listMaterials([a]).at(0).total,3);});
