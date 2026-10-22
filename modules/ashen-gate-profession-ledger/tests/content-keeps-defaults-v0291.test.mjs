import test from 'node:test';
import assert from 'node:assert/strict';
import {effectiveMapping,compactCheckMapping,advantageToolsOf,advantageItemsOf} from '../scripts/checks.mjs';
import {catalogCrosswalk,parseBaselineFile} from '../scripts/assign.mjs';
// 0.29.1: imported Profession content only sets the crosswalk lists it actually gives. Pure logic, mocked (no dnd5e config:
// the built-in tool keys only); it does not prove the live GM Setup table.

// Synthetic record shaped like an imported Archaeology profession: access lists, no advantage field.
const archaeology=(access={})=>({sourceId:'PROF-TG-ARCHAEOLOGY',name:'[TEST] Archaeology',
  access:{toolProficienciesAnyOf:['Cartographer’s Tools','[TEST] Trowel'],skillProficienciesAnyOf:['History','Investigation'],...access}});

test('content with access lists but no advantage field keeps the Calligrapher’s Supplies default',()=>{
  const {catalog,unresolved}=catalogCrosswalk([archaeology()]);
  assert.equal(Object.hasOwn(catalog.archaeology,'advantageTools'),false,'no advantage list is made up');
  assert.deepEqual(catalog.archaeology.qualifyTools,['cartographer']);assert.deepEqual(catalog.archaeology.qualifySkills,['his','inv']);
  assert.deepEqual(unresolved.map(u=>u.name),['[TEST] Trowel'],'unknown names are still reported');
  const map=effectiveMapping({},{catalog});
  assert.deepEqual(map.advantageTools.archaeology,['calligrapher']);assert.equal(map.origin.archaeology.advantageTools,'default');
  assert.deepEqual(advantageToolsOf(map,'archaeology'),['calligrapher'],'the gathering check uses it');
  assert.equal(map.origin.archaeology.qualifyTools,'catalog');assert.equal(map.origin.archaeology.qualifySkills,'catalog');
});

test('an explicit [] still means none; resolvable advantage tools in the content win; all-unknown names keep the default',()=>{
  let map=effectiveMapping({},{catalog:catalogCrosswalk([archaeology({advantageToolsAnyOf:[]})]).catalog});
  assert.deepEqual(map.advantageTools.archaeology,[]);assert.equal(map.origin.archaeology.advantageTools,'catalog');
  map=effectiveMapping({},{catalog:catalogCrosswalk([archaeology({advantageToolsAnyOf:['Cartographer’s Tools']})]).catalog});
  assert.deepEqual(map.advantageTools.archaeology,['cartographer']);assert.equal(map.origin.archaeology.advantageTools,'catalog');
  map=effectiveMapping({},{catalog:catalogCrosswalk([archaeology({advantageToolsAnyOf:['[TEST] Brush']})]).catalog});
  assert.deepEqual(map.advantageTools.archaeology,['calligrapher'],'0.27.0 rule unchanged');assert.equal(map.origin.archaeology.advantageTools,'default');
});

test('GM edits and the baseline file still win over content and defaults',()=>{
  const {catalog}=catalogCrosswalk([archaeology({advantageToolsAnyOf:['Cartographer’s Tools']})]);
  let map=effectiveMapping({advantageTools:{archaeology:['herb']}},{catalog});
  assert.deepEqual(map.advantageTools.archaeology,['herb']);assert.equal(map.origin.archaeology.advantageTools,'gm');
  const file=parseBaselineFile({professions:{Archaeology:{advantageTools:['Navigator’s Tools']}}});
  assert.equal(file.ok,true);
  map=effectiveMapping({},{catalog,baseline:file.baseline});
  assert.deepEqual(map.advantageTools.archaeology,['navg']);assert.equal(map.origin.archaeology.advantageTools,'baseline');
  map=effectiveMapping({advantageTools:{archaeology:[]}},{catalog,baseline:file.baseline});
  assert.deepEqual(map.advantageTools.archaeology,[],'a GM [] means none');assert.equal(map.origin.archaeology.advantageTools,'gm');
});

test('qualify lists the content leaves out keep their defaults',()=>{
  const {catalog}=catalogCrosswalk([
    {sourceId:'PROF-TG-FISHING',name:'[TEST] Fishing',access:{toolProficienciesAnyOf:['Navigator’s Tools']}},
    {sourceId:'PROF-TG-MINING',name:'[TEST] Mining',access:{skillProficienciesAnyOf:['Athletics']}},
    {sourceId:'PROF-TG-ALCHEMY',name:'[TEST] Alchemy',access:{skillProficienciesAnyOf:[],advantageToolsAnyOf:['Herbalism Kit']}}]);
  const map=effectiveMapping({},{catalog});
  assert.deepEqual(map.qualifySkills.fishing,['sur'],'Survival still qualifies for Fishing');assert.equal(map.origin.fishing.qualifySkills,'default');
  assert.deepEqual(map.qualifyTools.fishing,['navg']);
  assert.deepEqual(map.qualifyTools.mining,['mason'],'Mason’s Tools still qualify for Mining');assert.equal(map.origin.mining.qualifyTools,'default');
  assert.deepEqual(map.qualifySkills.mining,['ath']);
  assert.deepEqual(map.qualifySkills.alchemy,[],'an explicit [] means none');assert.equal(map.origin.alchemy.qualifySkills,'catalog');
  assert.deepEqual(map.qualifyTools.alchemy,['alchemist']);assert.equal(map.origin.alchemy.qualifyTools,'default');
});

test('Fishing’s carried Fishing Tackle default is intact when content gives no items; itemsAnyOf unchanged',()=>{
  let map=effectiveMapping({},{catalog:catalogCrosswalk([{sourceId:'PROF-TG-FISHING',name:'[TEST] Fishing',access:{skillProficienciesAnyOf:['Nature']}}]).catalog});
  assert.deepEqual(map.advantageItems.fishing,['Fishing Tackle']);assert.equal(map.origin.fishing.advantageItems,'default');
  assert.deepEqual(advantageItemsOf(map,'fishing'),['Fishing Tackle']);
  assert.deepEqual(map.items.fishing,[]);assert.equal(map.origin.fishing.items,'default');
  const {catalog}=catalogCrosswalk([{sourceId:'PROF-TG-FISHING',name:'[TEST] Fishing',access:{itemsAnyOf:['[TEST] Rod']}}]);
  assert.deepEqual(catalog.fishing,{items:['[TEST] Rod']},'only the items list is set');
  map=effectiveMapping({},{catalog});
  assert.deepEqual(map.items.fishing,['[TEST] Rod']);assert.deepEqual(map.qualifySkills.fishing,['sur']);assert.deepEqual(map.advantageItems.fishing,['Fishing Tackle']);
});

test('conflicts are still reported; the GM setting’s compact save is unchanged',()=>{
  const r=catalogCrosswalk([archaeology(),{sourceId:'PROF-TG2-ARCHAEOLOGY',name:'[TEST] Archaeology',access:{skillProficienciesAnyOf:['History']}}]);
  assert.deepEqual(r.conflicts,['Archaeology']);assert.equal(r.catalog.archaeology,undefined);
  assert.deepEqual(catalogCrosswalk([archaeology(),archaeology()]).conflicts,[],'identical records agree');
  const stored={tools:{mining:'mason',alchemy:'smith'},advantageTools:{archaeology:['herb']}};
  assert.deepEqual(compactCheckMapping(stored),{tools:{alchemy:'smith'},advantageTools:{archaeology:['herb']}});
});
