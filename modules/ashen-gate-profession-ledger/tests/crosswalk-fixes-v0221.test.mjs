import test from 'node:test';
import assert from 'node:assert/strict';
import {effectiveMapping,advantageToolsOf} from '../scripts/checks.mjs';
import {catalogCrosswalk,parseBaselineFile,exportCrosswalk,definitionProfessionKey} from '../scripts/assign.mjs';
// 0.22.1 crosswalk fixes. Pure logic, mocked dnd5e tool list (none: the built-in tool keys only).

test('export writes only GM and baseline lists as overrides; catalog advantage tools stay catalog after a round trip',()=>{
  const {catalog}=catalogCrosswalk([{sourceId:'PROF-TG-HERBALISM',name:'[TEST] Herbalism',access:{skillProficienciesAnyOf:['Nature'],advantageToolsAnyOf:['Herbalism Kit']}}]);
  const map=effectiveMapping({qualifyTools:{mining:['smith']}},{catalog,baseline:{fishing:{qualifySkills:['nat']}}});
  assert.deepEqual(advantageToolsOf(effectiveMapping({},{baseline:null}),'herbalism'),[],'checks never use catalog advantage tools');
  const out=exportCrosswalk(map,{exportedAt:'x',version:'0.22.1'});
  assert.equal(out.professions.herbalism.advantageTools,undefined,'catalog list is not exported as an override');
  assert.equal(out.professions.herbalism.qualifySkills,undefined);
  assert.equal(out.professions.alchemy.qualifyTools,undefined,'built-in list is not exported as an override');
  assert.deepEqual(out.professions.mining.qualifyTools,['smith'],'GM list is');
  assert.deepEqual(out.professions.fishing.qualifySkills,['nat'],'baseline list is');
  assert.deepEqual(out.professions.herbalism.inEffect.advantageTools,['herb'],'the table in effect is still shown');
  assert.deepEqual(out.professions.herbalism.origin,{qualifySkills:'catalog',qualifyTools:'catalog',advantageTools:'catalog',items:'default',advantageItems:'default'});
  const back=parseBaselineFile(out);
  assert.equal(back.ok,true);
  assert.equal(back.baseline.herbalism.advantageTools,undefined);
  const again=effectiveMapping({},{catalog,baseline:back.baseline});
  assert.equal(again.origin.herbalism.advantageTools,'catalog');
  assert.deepEqual(advantageToolsOf(effectiveMapping({},{baseline:back.baseline}),'herbalism'),[],'re-import does not turn on catalog advantage tools');
  assert.deepEqual(again.qualifyTools.mining,['smith']);assert.equal(again.origin.mining.qualifyTools,'baseline');
});

test('catalog tool names and keys are checked against dnd5e and reported, never guessed',()=>{
  const r=catalogCrosswalk([{name:'Herbalism',access:{toolProficienciesAnyOf:['herb','sickle','Herbalism Kit'],advantageToolsAnyOf:['herbalismkit']}}]);
  assert.deepEqual(r.catalog.herbalism.qualifyTools,['herb']);
  assert.equal(r.catalog.herbalism.advantageTools,undefined,'0.27.0: only unmatched advantage names set nothing, so the built-in default applies');
  assert.deepEqual(r.unresolved.map(u=>[u.field,u.name]),[['toolProficienciesAnyOf','sickle'],['advantageToolsAnyOf','herbalismkit']]);
  assert.deepEqual(parseBaselineFile({professions:{herbalism:{qualifyTools:['sickle','herb']}}}).unresolved.map(u=>u.name),['sickle'],'same rule as the baseline file');
});

test('catalog and Assign match a definition the same way: PROF id first, then name',()=>{
  assert.equal(definitionProfessionKey('PROF-TG-HERBALISM','[TEST] Wildcraft'),'herbalism');
  assert.equal(definitionProfessionKey('PROF-ALCHEMY','Alchemy'),'alchemy');
  assert.equal(definitionProfessionKey('PROF-HUNTING-SKINNING','x'),'huntingskinning');
  assert.equal(definitionProfessionKey('PROF-TG-ARCANA','x'),'enchanting');
  assert.equal(definitionProfessionKey('PROF-DEMO-001','[TEST] Cooking'),'cooking','id names no profession: the name is used');
  assert.equal(definitionProfessionKey(null,'Hunting & Skinning'),'huntingskinning');
  assert.equal(definitionProfessionKey('PROF-TEST-SECRET','[TEST] Secret'),null);
  const {catalog}=catalogCrosswalk([{sourceId:'PROF-TG-COOKING',name:'[TEST] Camp Kitchen',access:{toolProficienciesAnyOf:['Brewer’s Supplies']}}]);
  assert.deepEqual(catalog.cooking?.qualifyTools,['brewer'],'access block of a definition matched by id is used');
});
