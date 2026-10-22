/** 0.44.3: the post-apply link pass asks the owning module's public API before calling a link missing.
 * Logic only (mocked game.modules and APIs, no Foundry runtime); the History/results panel is checked in Forge. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveTypedRefs, buildUuidIndex} from '../scripts/import-fidelity.js';
import {moduleRecordLookup} from '../scripts/module-records.js';
import {ownerModuleFor, checkContractGraph} from '../scripts/contract.js';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const opt=target_id=>({relation:'related_to',target_id,mode:'optional'});
const req=target_id=>({relation:'related_to',target_id,mode:'required'});
const mod=(api,active=true)=>({active,api});
const world=(mods)=>({modules:new Map(Object.entries(mods))});
const fullWorld=()=>world({
  'ashen-gate-locations':mod({listLocations:()=>[{id:'LOC-TEST-PLACE'}],listRoutes:()=>[{id:'RTE-TEST-ROAD'}]}),
  'ashen-gate-factions':mod({getFactions:()=>[{id:'FACTION-TEST-GUILD',renown_track:{id:'RENOWN-TEST-GUILD'},individual_track:{id:'RENOWN-TEST-GUILD-IND'}}],getDeities:()=>[{id:'DEITY-TEST-SUN'}]}),
  'ashen-gate-quest-manager':mod({listQuests:()=>[{id:'QUEST-TEST-ONE'},{id:'ORDER-TEST-TWO'}],assignments:{list:()=>[{id:'ASSIGN-TEST-A'}]}}),
  'ashen-gate-headquarters':mod({getState:()=>({catalog:[{id:'FAC-TEST-FORGE'}]})}),
  'ashen-gate-utilities':mod({shops:{importShops:()=>{},list:()=>[{id:'SHOP-TEST-STALL'}]}})
});
const empty=buildUuidIndex([]);

test('0.44.3: links to records that exist in the owning module resolve by id, not "missing"',()=>{
  const ids=['LOC-TEST-PLACE','RTE-TEST-ROAD','FACTION-TEST-GUILD','RENOWN-TEST-GUILD','RENOWN-TEST-GUILD-IND','DEITY-TEST-SUN','QUEST-TEST-ONE','ORDER-TEST-TWO','ASSIGN-TEST-A','FAC-TEST-FORGE','SHOP-TEST-STALL'];
  const r=resolveTypedRefs(ids.map(opt),empty,[],moduleRecordLookup(fullWorld()));
  assert.deepEqual(r.issues,[]);
  assert.deepEqual(r.bindings,[],'no UUID binding is invented for another module\'s record');
  assert.deepEqual(r.moduleLinks.map(l=>l.target_id),ids);
  assert.equal(r.moduleLinks[0].module,'Locations');
  assert.equal(r.moduleLinks.at(-1).module,'Utilities');
  // Required links to existing records resolve too.
  assert.deepEqual(resolveTypedRefs([req('LOC-TEST-PLACE')],empty,[],moduleRecordLookup(fullWorld())).issues,[]);
});

test('0.44.3: a record the owning module has not imported yet is informational; truly unowned ids stay missing',()=>{
  const r=resolveTypedRefs([opt('LOC-TEST-LATER'),opt('SHOP-TEST-LATER'),opt('ZZZ-TEST-NONE')],empty,[],moduleRecordLookup(fullWorld()));
  assert.deepEqual(r.issues.map(i=>[i.level,i.message]),[
    ['info','Optional link LOC-TEST-LATER: will link when Locations imports it.'],
    ['info','Optional link SHOP-TEST-LATER: will link when Utilities imports it.'],
    ['warning','Optional link ZZZ-TEST-NONE: missing.']
  ]);
  assert.deepEqual(r.moduleLinks,[]);
  const required=resolveTypedRefs([req('QUEST-TEST-LATER')],empty,[],moduleRecordLookup(fullWorld()));
  assert.equal(required.issues[0].level,'error');
  assert.match(required.issues[0].message,/Quest Log record not found; import it in Quest Log first/);
});

test('0.44.3: an inactive or absent owning module is never read and is named in the note',()=>{
  let read=false;
  const g=world({'ashen-gate-factions':mod({getFactions:()=>{read=true;return [{id:'FACTION-TEST-GUILD'}];}},false)});
  const r=resolveTypedRefs([opt('FACTION-TEST-GUILD'),opt('LOC-TEST-PLACE')],empty,[],moduleRecordLookup(g));
  assert.equal(read,false);
  assert.deepEqual(r.issues.map(i=>i.message),[
    'Optional link FACTION-TEST-GUILD: will link when Renown imports it. Renown is not active in this world.',
    'Optional link LOC-TEST-PLACE: will link when Locations imports it. Locations is not active in this world.'
  ]);
});

test('0.44.3: an API that throws or lacks the read call does not break the pass; each module is read once',()=>{
  let calls=0;
  const g=world({
    'ashen-gate-locations':mod({listLocations:()=>{calls++;throw new Error('GM only');}}),
    'ashen-gate-quest-manager':mod({})
  });
  const lookup=moduleRecordLookup(g);
  const r=resolveTypedRefs([opt('LOC-TEST-A'),opt('LOC-TEST-B'),opt('QUEST-TEST-ONE')],empty,[],lookup);
  assert.equal(calls,1);
  assert.deepEqual(r.issues.map(i=>i.level),['info','info','info']);
});

test('0.44.3: Manager-owned links keep their old behaviour, and a Manager UUID still wins',()=>{
  const doc={uuid:'Item.abc123',name:'Ore',documentName:'Item',flags:{'ashen-gate-manager':{source:{sourceId:'MAT-TEST-ORE'}}}};
  const r=resolveTypedRefs([opt('MAT-TEST-ORE'),opt('MAT-TEST-GONE')],buildUuidIndex([doc]),[],moduleRecordLookup(fullWorld()));
  assert.equal(r.bindings[0].uuid,'Item.abc123');
  assert.deepEqual(r.issues.map(i=>[i.level,i.message]),[['warning','Optional link MAT-TEST-GONE: missing.']]);
  // Without a lookup (older callers) nothing changes.
  assert.deepEqual(resolveTypedRefs([opt('LOC-TEST-PLACE')],empty).issues.map(i=>i.message),['Optional link LOC-TEST-PLACE: missing.']);
});

test('0.44.3: SHOP- is owned by Utilities and informational in the preview too',()=>{
  assert.equal(ownerModuleFor('SHOP-TEST-STALL').moduleId,'ashen-gate-utilities');
  const g=checkContractGraph([{id:'MAT-TEST-LINKER',entity_type:'Material',scope:'generic_rules',refs:[opt('SHOP-TEST-STALL')]}]);
  assert.deepEqual(g.warnings,[]);
  assert.deepEqual(g.moduleLinks,['MAT-TEST-LINKER: links to Utilities record SHOP-TEST-STALL (imported separately).']);
});

test('0.44.3: apply pass uses the lookup, logs notes, and keeps pending ids as unresolved optional refs',()=>{
  const main=read('../scripts/main.js');
  assert.match(main,/const moduleRecord=moduleRecordLookup\(game\);/);
  assert.match(main,/resolveTypedRefs\(record\.refs,uuidIndex,\[\],moduleRecord\)/);
  assert.match(main,/issue\.level==='info'\?'note'/);
  assert.match(main,/unresolvedOptionalRefs`\]=issues\.filter\(i=>i\.level==='warning'\|\|i\.level==='info'\)/);
  // The lookup comes after Locations/Routes/Shops are handed off in the same run.
  assert.ok(main.indexOf('applyShops(shopRows')<main.indexOf('moduleRecordLookup(game)'));
  // Feature-detected through public APIs only.
  assert.doesNotMatch(read('../scripts/module-records.js'),/settings\.get|game\.journal|getFlag/);
});
