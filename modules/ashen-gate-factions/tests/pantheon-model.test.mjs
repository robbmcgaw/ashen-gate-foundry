import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceDefinition,validateFaction,upgradeFaction,milestoneProjection} from '../scripts/core.mjs';
import {makeDeity,deityCard,visibleRelations,pantheonRows} from '../scripts/deity.mjs';
import {planImport,runImport,IMPORT_SCHEMA} from '../scripts/import.mjs';

const deity=(key,name,extra={})=>{const d=makeDeity({id:`DEITY-QA-${key}`,trackId:`RENOWN-QA-${key}`,name});Object.assign(d.deity,extra);return d;};
const source=(key,name,extra)=>sourceDefinition(deity(key,name,extra));
const EXAMPLE={symbol:'assets/test/deities/example.png',title:'[EXAMPLE] The Lantern',domain:'Light',tier:'lesser',blurb:'A synthetic test deity.',portfolio:'Lamps',teachings:'Keep the lamp lit.',followers:'Lamplighters',practices:'Evening vigil',saying:{text:'[EXAMPLE] Light the way.',attribution:'[EXAMPLE] Lamplighter'}};

test('a new deity is valid, per-character only and exports only its own fields',()=>{
  const d=deity('A','[TEST] Deity A',EXAMPLE);
  assert.deepEqual(validateFaction(d),[]);
  const clean=sourceDefinition(d);
  for(const key of ['leader','public_role','folder_key','renown_track','state'])assert.ok(!(key in clean),`${key} not exported`);
  assert.equal(clean.entity_type,'Deity');assert.equal(clean.deity.tier,'lesser');assert.equal(clean.individual_track.milestones.length,5);
  assert.deepEqual(validateFaction(clean),[],'exported source re-validates');
  const back=upgradeFaction(clean);assert.ok(back.renown_track.id.endsWith('-GROUP'),'internal group track rebuilt on load');
});
test('deity rank titles are its own ladder and rewards follow the same milestone rules as factions',()=>{
  const d=deity('A','[TEST] A');d.individual_track.milestones[1].name='[TEST] Acolyte';
  d.rewards.push({id:'rw-QA1',key:'rw_qa1',audience:'individual',milestone_id:d.individual_track.milestones[1].id,name:'[TEST] Blessing',teaser:'?',kind:'custom',tags:[],behavior:'one_time',usage_limit:0});
  assert.deepEqual(validateFaction(d),[]);
  const ms=milestoneProjection({faction:d,scope:'individual',score:3});
  assert.equal(ms[1].name,'[TEST] Acolyte');assert.equal(ms[1].rewards[0].canClaim,true);
  const locked=milestoneProjection({faction:d,scope:'individual',score:2});assert.equal(locked[1].rewards[0].canClaim,false);
});
test('deity checks: id, tier, symbol, relations, group rewards and group-unlocked lore are refused',()=>{
  assert.ok(validateFaction({...deity('A','A'),id:'FACTION-QA-A'}).length,'deity id must be DEITY-');
  assert.ok(validateFaction(deity('A','A',{tier:'demigod'})).some(e=>e.includes('tier')));
  assert.ok(validateFaction(deity('A','A',{symbol:'javascript:alert(1)'})).some(e=>e.includes('symbol')));
  assert.ok(validateFaction(deity('A','A',{relations:[{deity_id:'DEITY-QA-A',type:'rival'}]})).some(e=>e.includes('relation')),'no relation to itself');
  assert.ok(validateFaction(deity('A','A',{relations:[{deity_id:'DEITY-QA-B',type:'enemy'}]})).some(e=>e.includes('rival or ally')));
  assert.ok(validateFaction(deity('A','A',{relations:[{deity_id:'DEITY-QA-B',type:'ally'},{deity_id:'DEITY-QA-B',type:'rival'}]})).some(e=>e.includes('Duplicate')));
  const g=deity('A','A');g.rewards.push({id:'rw-G',key:'g',audience:'group',milestone_id:g.renown_track.milestones[0].id,name:'G',kind:'custom',tags:[],behavior:'passive',usage_limit:0});
  assert.ok(validateFaction(g).some(e=>e.includes('per character')));
  const l=deity('A','A');l.entries.push({id:'i1',name:'Lore',unlock:'group_renown',link_mode:'preview',threshold:1});
  assert.ok(validateFaction(l).some(e=>e.includes('group Renown')));
});
test('the deity source boundary is closed: unknown keys anywhere are refused, not dropped',()=>{
  assert.throws(()=>sourceDefinition({...deity('A','A'),favour:3}),/unclassified field favour/);
  const d=deity('A','A');d.deity.secret_name='x';assert.throws(()=>sourceDefinition(d),/unclassified field secret_name/);
  const r=deity('A','A');r.deity.relations=[{deity_id:'DEITY-QA-B',type:'ally',ratio:0.5}];assert.throws(()=>sourceDefinition(r),/unclassified field ratio/);
});
test('player card and relations only expose what the viewer may see',()=>{
  const a=deity('A','[TEST] A',{...EXAMPLE,relations:[{deity_id:'DEITY-QA-B',type:'rival'},{deity_id:'DEITY-QA-C',type:'ally'}]});
  const card=deityCard(a);
  assert.equal(card.saying.attribution,'[EXAMPLE] Lamplighter');assert.equal(card.tierLabel,'Lesser');
  assert.ok(!('discovery' in card)&&!('tags' in card)&&!('relations' in card));
  assert.deepEqual(visibleRelations(a,new Map([['DEITY-QA-C','[TEST] C']])).map(r=>[r.deity_id,r.type]),[['DEITY-QA-C','ally']],'unrevealed rival is not listed');
  assert.deepEqual(deityCard(card),card,'a projected card reads back unchanged');
});
test('pantheonRows lists only deities with standing for the character, major first',()=>{
  const rows=pantheonRows([deity('B','[TEST] B'),deity('A','[TEST] A',{tier:'lesser'}),deity('C','[TEST] C')],d=>d.id==='DEITY-QA-C'?null:{score:3,rank:'Rank II'});
  assert.deepEqual(rows.map(r=>[r.id,r.tier,r.rank]),[['DEITY-QA-B','major','Rank II'],['DEITY-QA-A','lesser','Rank II']]);
});
test('import: deities need the 0.4 schema, 0.3 faction files still import, and deities take no group Renown',async()=>{
  assert.equal(IMPORT_SCHEMA,'ag-factions-source-export/0.4');
  const ok=planImport({schema_version:IMPORT_SCHEMA,definitions:[source('A','[TEST] A',EXAMPLE)]});
  assert.deepEqual(ok.errors,[]);assert.equal(ok.rows[0].kind,'deity');
  assert.ok(planImport({schema_version:'ag-factions-source-export/0.3',definitions:[source('A','A')]}).errors.some(e=>e.includes('0.4')));
  assert.ok(planImport({schema_version:IMPORT_SCHEMA,definitions:[source('A','A')],starting_state:[{faction_id:'DEITY-QA-A',group_renown:[{delta:1,reason:'x'}]}]}).errors.some(e=>e.includes('no group Renown')));
  const calls=[];const io={assertGM(){},createFaction:async d=>calls.push(['create',d.id]),updateGroup:async id=>calls.push(['group',id]),updatePersonal:async(id,a)=>calls.push(['personal',id,a.id]),findActor:n=>n==='[TEST] Hero'?{id:'A1',name:n}:null,finish:async()=>{},eventId:()=>'RENOWN-EVT-QA',now:()=>'2026-01-01T00:00:00Z'};
  const plan=planImport({schema_version:IMPORT_SCHEMA,definitions:[source('A','A'),source('B','B')],starting_state:[{faction_id:'DEITY-QA-A',actors:[{name:'[TEST] Hero',discovered:true,renown:[{delta:4,reason:'[TEST] Offering'}]}]}]},new Set(['DEITY-QA-B']));
  assert.deepEqual(plan.errors,[]);
  await runImport(plan,io);
  assert.deepEqual(calls,[['create','DEITY-QA-A'],['group','DEITY-QA-A'],['personal','DEITY-QA-A','A1']],'existing deity B untouched; new A gets per-character state only');
});
