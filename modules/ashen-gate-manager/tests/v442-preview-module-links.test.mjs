/** 0.44.2: in the import preview, absent links to records another Ashen Gate module owns are informational, not warnings.
 * Logic only (mocked records, no Foundry runtime); the live preview box is checked in Forge. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkContractGraph, ownerModuleFor} from '../scripts/contract.js';
import {validatePackage} from '../scripts/core.js';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const rec=(refs)=>({id:'MAT-TEST-LINKER',entity_type:'Material',scope:'generic_rules',refs});
const opt=target_id=>({relation:'related_to',target_id,mode:'optional'});

test('0.44.2: id prefixes map to the owning module; Manager-imported ids map to none',()=>{
  assert.equal(ownerModuleFor('LOC-TEST-PLACE').label,'Locations');
  assert.equal(ownerModuleFor('RTE-TEST-ROAD').label,'Locations');
  assert.equal(ownerModuleFor('FACTION-TEST-GUILD').label,'Renown');
  assert.equal(ownerModuleFor('DEITY-TEST-SUN').label,'Renown');
  assert.equal(ownerModuleFor('QUEST-TEST-ONE').label,'Quest Log');
  assert.equal(ownerModuleFor('FAC-TEST-FORGE').label,'Headquarters');
  for (const id of ['MAT-TEST-ORE','PROF-TEST-SMITH','REC-TEST-BLADE','PERK-TEST-EDGE','ITEM-TEST-X','ZZZ-TEST-NONE',null])
    assert.equal(ownerModuleFor(id),null,String(id));
});

test('0.44.2: absent optional links to other modules are moduleLinks, not warnings; unowned ids still warn',()=>{
  const g=checkContractGraph([rec([opt('LOC-TEST-PLACE'),opt('FACTION-TEST-GUILD'),opt('ZZZ-TEST-NONE')])]);
  assert.deepEqual(g.errors,[]);
  assert.equal(g.warnings.length,1);
  assert.match(g.warnings[0],/ZZZ-TEST-NONE absent/);
  assert.deepEqual(g.moduleLinks,[
    'MAT-TEST-LINKER: links to Locations record LOC-TEST-PLACE (imported separately).',
    'MAT-TEST-LINKER: links to Renown record FACTION-TEST-GUILD (imported separately).'
  ]);
  assert.doesNotMatch(g.moduleLinks.join(' '),/missing|absent/i);
});

test('0.44.2: owning module is feature-detected only through the callback for wording',()=>{
  const seen=[];
  const g=checkContractGraph([rec([opt('DEITY-TEST-SUN'),opt('QUEST-TEST-ONE')])],new Map(),id=>{seen.push(id);return id==='ashen-gate-quest-manager';});
  assert.deepEqual(seen,['ashen-gate-factions','ashen-gate-quest-manager']);
  assert.equal(g.moduleLinks[0],'MAT-TEST-LINKER: links to Renown record DEITY-TEST-SUN (imported separately). Renown is not active in this world.');
  assert.equal(g.moduleLinks[1],'MAT-TEST-LINKER: links to Quest Log record QUEST-TEST-ONE (imported separately).');
});

test('0.44.2: a link that resolves (in package or world) is neither a warning nor a module link',()=>{
  const g=checkContractGraph([rec([opt('LOC-TEST-PLACE')])],new Map([['LOC-TEST-PLACE',{entityType:'Location'}]]));
  assert.deepEqual([g.errors,g.warnings,g.moduleLinks],[[],[],[]]);
});

test('0.44.2: required links to another module still block, with the owning module named',()=>{
  const g=checkContractGraph([rec([{relation:'related_to',target_id:'FACTION-TEST-GUILD',mode:'required'},{relation:'related_to',target_id:'ZZZ-TEST-NONE',mode:'required'}])]);
  assert.equal(g.errors.length,2);
  assert.match(g.errors[0],/unresolved required reference FACTION-TEST-GUILD\. It is a Renown record \(imported separately\): import it in Renown first/);
  assert.equal(g.errors[1],'MAT-TEST-LINKER: unresolved required reference ZZZ-TEST-NONE.');
  assert.deepEqual(g.moduleLinks,[]);
});

test('0.44.2: preview keeps module links out of warnings and shows them in an info box; report exports them',()=>{
  const main=read('../scripts/main.js'), hbs=read('../templates/manager.hbs');
  assert.match(main,/this\.moduleLinks\.push\(\.\.\.graphNotes\.moduleLinks\)/);
  assert.match(main,/game\.modules\?\.get\?\.\(id\)\?\.active/);
  assert.match(main,/module_links:this\.moduleLinks/);
  // 0.45.0: shown in the Import tab's bottom message drawer (Module links).
  assert.match(hbs,/\{\{#if drawer\.links\}\}<div class="ag-notice ag-notice--info" role="status">.*Links to other Ashen Gate modules.*\{\{#each moduleLinks\}\}/);
});

test('0.44.2: legacy validation names the owning module on a required link too',()=>{
  const pkg=structuredClone(JSON.parse(read('../samples/demo-package.json')));pkg.records[1].refs=['LOC-TEST-GONE'];
  const errors=validatePackage(pkg,new Map());
  assert.ok(errors.some(e=>/unresolved required reference LOC-TEST-GONE\. It is a Locations record/.test(e)),errors.join('\n'));
});
