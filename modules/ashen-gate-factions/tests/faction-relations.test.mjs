/** Faction relations (0.22.0): model, maths parity with deities, allowlist, import and old data. Mocked, synthetic [TEST] data only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeFaction,sourceDefinition,validateFaction,upgradeFaction} from '../scripts/core.mjs';
import {makeDeity,knockOnDelta,knockOns,relationLabel,resonancePreview,DAMPING_DEFAULT,DAMPING_MAX,validDamping,validResonance} from '../scripts/deity.mjs';
import {factionKnockOns,visibleFactionRelations,visibleFactionHistory,validateFactionRelations} from '../scripts/faction-relations.mjs';
import {planImport,runImport,IMPORT_SCHEMA} from '../scripts/import.mjs';
import {definitionHash} from '../scripts/update.mjs';

const faction=(key,relations)=>{const f=makeFaction({id:`FACTION-QA-${key}`,trackId:`RENOWN-QA-${key}`,name:`[TEST] ${key}`});if(relations!==undefined)f.relations=relations;return f;};
const rel=(key,resonance)=>({faction_id:`FACTION-QA-${key}`,resonance});

test('maths and rounding match the deity relations for every resonance, gain and damping',()=>{
  const d=makeDeity({id:'DEITY-QA-A',trackId:'RENOWN-QA-DA',name:'[TEST] A'});
  for(const r of [0,0.1,0.25,0.4,0.5,0.6,0.7,0.9,1])for(const gain of [1,2,3,5,10,37])for(const damp of [0,0.25,0.5,0.95]){
    d.deity.relations=[{deity_id:'DEITY-QA-B',resonance:r}];
    const a=knockOns(d,gain,damp,new Map([['DEITY-QA-B','B']])),b=factionKnockOns(faction('A',[rel('B',r)]),gain,damp,new Map([['FACTION-QA-B','B']]));
    assert.equal(b[0]?.delta??0,a[0]?.delta??0,`r${r} g${gain} d${damp}`);
    assert.equal(b[0]?.delta??0,knockOnDelta(gain,r,damp));
  }
  assert.equal(factionKnockOns(faction('A',[rel('B',0)]),10,0.5)[0].delta,-5,'rival loses');
  assert.equal(factionKnockOns(faction('A',[rel('B',1)]),10,0.5)[0].delta,5,'ally gains');
  assert.deepEqual(factionKnockOns(faction('A',[rel('B',0.5)]),10,0.5),[],'neutral: nothing');
  assert.deepEqual(factionKnockOns(faction('A'),10,0.5),[],'no relations field: nothing');
  assert.equal(factionKnockOns(faction('A',[rel('B',0)]),-4,0.5).length,0,'a loss never spreads');
  assert.equal(relationLabel(0.1),'Dissonance');assert.equal(relationLabel(0.9),'Resonance');assert.equal(resonancePreview(0.8,0.5),'gain 10 → +3');
  assert.equal(DAMPING_DEFAULT,0.5);assert.equal(DAMPING_MAX,0.95);assert.ok(validDamping(0.95)&&!validDamping(1)&&validResonance(0)&&!validResonance(1.1));
});
test('validation: id, self, duplicate, resonance range, shape',()=>{
  assert.deepEqual(validateFaction(faction('A',[rel('B',0),rel('C',1)])),[]);
  assert.deepEqual(validateFaction(faction('A',[])),[]);
  assert.ok(validateFaction(faction('A',[rel('A',0)])).some(e=>e.includes('another faction')),'not itself');
  assert.ok(validateFaction(faction('A',[{faction_id:'nope',resonance:0}])).some(e=>e.includes('another faction')));
  assert.ok(validateFaction(faction('A',[{faction_id:'DEITY-QA-B',resonance:0}])).some(e=>e.includes('another faction')),'deities are not faction relations');
  assert.ok(validateFaction(faction('A',[rel('B',0),rel('B',1)])).some(e=>e.includes('Duplicate')));
  assert.ok(validateFaction(faction('A',[rel('B',1.5)])).some(e=>e.includes('resonance')));
  assert.ok(validateFaction(faction('A',[rel('B',-0.1)])).some(e=>e.includes('resonance')));
  assert.ok(validateFaction(faction('A',[{faction_id:'FACTION-QA-B'}])).some(e=>e.includes('resonance')));
  assert.ok(validateFactionRelations({id:'FACTION-QA-A',relations:'x'}).length);
});
test('allowlist: closed relation rows, round trip, deities refuse a top-level relations field',()=>{
  const f=faction('A',[rel('B',0.2)]),clean=sourceDefinition(f);
  assert.deepEqual(clean.relations,[rel('B',0.2)]);assert.deepEqual(sourceDefinition(clean),clean,'re-export is stable');
  assert.throws(()=>sourceDefinition(faction('A',[{...rel('B',0),ratio:1}])),/unclassified field ratio/);
  assert.throws(()=>sourceDefinition(faction('A',[{faction_id:'DEITY-QA-B',resonance:0}])),/FACTION- id required/);
  assert.throws(()=>sourceDefinition(faction('A',[rel('B',2)])),/0\.\.1/);
  assert.throws(()=>sourceDefinition(faction('A','x')),/invalid array/);
  const d=makeDeity({id:'DEITY-QA-A',trackId:'RENOWN-QA-DA',name:'[TEST] A'});d.relations=[rel('B',0)];
  assert.throws(()=>sourceDefinition(d),/unclassified field relations/);
});
test('old data without relations is unchanged: no field added, same hash, still valid',()=>{
  const f=faction('A');assert.ok(!('relations' in f));
  assert.ok(!('relations' in upgradeFaction(f)));assert.ok(!('relations' in sourceDefinition(f)));
  const h=definitionHash(f);assert.equal(definitionHash(upgradeFaction(f)),h);assert.deepEqual(validateFaction(f),[]);
  assert.notEqual(definitionHash(faction('A',[rel('B',0)])),h,'relations are part of the definition hash');
});
test('import: relations round-trip, bad rows block the file, update mode respects GM edits',async()=>{
  const file=defs=>({schema_version:IMPORT_SCHEMA,definitions:defs});
  const plan=planImport(file([sourceDefinition(faction('A',[rel('B',0.1)])),sourceDefinition(faction('B'))]));
  assert.deepEqual(plan.errors,[]);assert.deepEqual(plan.rows[0].definition.relations,[rel('B',0.1)]);assert.ok(!('relations' in plan.rows[1].definition));
  const created=[];await runImport(plan,{assertGM(){},createFaction:async d=>created.push(d),updateGroup:async()=>{},updatePersonal:async()=>{},findActor:()=>null,finish:async()=>{},eventId:()=>'RENOWN-EVT-X',now:()=>'2026-10-28T00:00:00Z'});
  assert.deepEqual(created[0].relations,[rel('B',0.1)]);
  const bad=planImport(file([{...sourceDefinition(faction('A')),relations:[{faction_id:'FACTION-QA-B',resonance:3}]}]));assert.ok(bad.errors.length);
  const worse=planImport(file([{...sourceDefinition(faction('A')),relations:[{faction_id:'FACTION-QA-A',resonance:0.3}]}]));assert.ok(worse.errors.some(e=>e.includes('another faction')),'self relation refused');
  // Default mode never touches a faction already in the world.
  const skip=planImport(file([sourceDefinition(faction('A',[rel('B',0)]))]),new Set(['FACTION-QA-A']));assert.equal(skip.rows[0].action,'skip');
  // Update mode: an untouched world definition receives the file's relations; one edited in the world is kept.
  const old=sourceDefinition(faction('A')),next=sourceDefinition(faction('A',[rel('B',0)]));
  const ex=(def,hash)=>new Map([['FACTION-QA-A',{definition:def,hash,legacy:false,states:{group:null,personal:[]}}]]);
  const upd=planImport(file([next]),new Set(),{mode:'update',existing:ex(old,definitionHash(old))});
  assert.equal(upd.rows[0].action,'update');assert.match(upd.rows[0].changes.summary,/relations/);
  const edited=sourceDefinition(faction('A',[rel('C',1)]));
  const kept=planImport(file([next]),new Set(),{mode:'update',existing:ex(edited,definitionHash(old))});
  assert.equal(kept.rows[0].action,'kept','a GM edit to relations is not overwritten by default');
  const forced=planImport(file([next]),new Set(),{mode:'update',overwriteEdited:true,existing:ex(edited,definitionHash(old))});assert.equal(forced.rows[0].action,'update');
});
test('player projection: relations only to known factions; history never names an unknown source',()=>{
  const a=faction('A',[rel('B',0),rel('C',1)]);
  assert.deepEqual(visibleFactionRelations(a,new Map([['FACTION-QA-B','[TEST] B']])),[{faction_id:'FACTION-QA-B',name:'[TEST] B',label:'Dissonance',isDissonant:true,isResonant:false}]);
  assert.deepEqual(visibleFactionRelations(a,new Map()),[]);assert.deepEqual(visibleFactionRelations(faction('A'),new Map([['FACTION-QA-B','B']])),[]);
  const ev=[{id:'E1',delta:-3,reason:'Dissonance with [TEST] Secret: deed',source_faction:'FACTION-QA-S',caused_by:'X'},{id:'E2',delta:3,reason:'Undo: Dissonance with [TEST] Secret: deed',source_faction:'FACTION-QA-S',reverses:'E1'},{id:'E3',delta:2,reason:'Resonance with [TEST] B: deed',source_faction:'FACTION-QA-B'},{id:'E4',delta:1,reason:'plain'}];
  const out=visibleFactionHistory(ev,new Map([['FACTION-QA-B','[TEST] B']]));
  assert.ok(!JSON.stringify(out.slice(0,2)).match(/Secret|FACTION-QA-S/));assert.equal(out[0].reason,'Renown shifted through a related faction');assert.match(out[1].reason,/^Undo: /);
  assert.deepEqual(out.slice(2),ev.slice(2),'known sources and plain lines pass through');
});
test('template: relations live inside the Profile draft form; GM Setup has its own damping; history has Undo',async()=>{
  const {readFileSync}=await import('node:fs'),t=readFileSync(new URL('../templates/dashboard.hbs',import.meta.url),'utf8');
  const profile=t.slice(t.indexOf('{{#if ../sub.profile}}'),t.indexOf('{{#if ../sub.visibility}}'));
  assert.match(profile,/data-agf-draft/);assert.match(profile,/agfFold key="faction-relations"/);assert.match(profile,/data-action="addFactionRelation"/);assert.match(profile,/data-action="removeFactionRelation"/);
  assert.doesNotMatch(profile,/data-action="(addRelation|removeRelation)"/,'faction rows never use the apply-at-once deity actions');
  assert.match(t,/name="faction-damping"[^>]*max="\{\{pantheonDampingMax\}\}"/);
  assert.match(t,/data-action="undoRenown" data-event="\{\{id\}\}" aria-label="Undo \{\{reason\}\}…"/);
});
