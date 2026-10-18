import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseImport,validateRegionHierarchy,playerHtml,emptyState,objectiveRefs} from '../scripts/model.js';
const fixture=JSON.parse(readFileSync(new URL('../fixtures/AG_Locations_Real_World_Fixture_v0.8.0.json',import.meta.url)));
const ids=['LOC-AGTEST-FRONTIER','LOC-AGTEST-VERGE','LOC-AGTEST-ROAD','LOC-AGTEST-MINE','LOC-AGTEST-VIEW','LOC-AGTEST-SEALED'];
test('real-record import fixture validates using module production parser, with six unique Location identities',()=>{
 assert.equal(parseImport(fixture),fixture);
 assert.deepEqual(fixture.locations.map(x=>x.id),ids);
 assert.equal(validateRegionHierarchy(fixture.locations).length,0);
 for(const record of fixture.locations)assert.equal(record.provenance.sources[0].includes('Synthetic TEST ONLY'),true);
});
test('synthetic fixture owns RES on LOC; exact typed Objective and location associations persist',()=>{
 const mine=fixture.locations.find(x=>x.id==='LOC-AGTEST-MINE');
 assert.deepEqual(mine.resources.map(r=>r.id),['RES-AGTEST-MINE-001']);
 assert.deepEqual(objectiveRefs(mine),[{relation:'associated_objective',target_id:'QUEST-AGTEST-SURVEY',mode:'required'}]);
 assert.equal(mine.refs.find(x=>x.relation==='related_location').target_id,'LOC-AGTEST-ROAD');
});
test('unrevealed fixture POI and GM-only notes never render in player publication',()=>{
 const road=fixture.locations.find(x=>x.id==='LOC-AGTEST-ROAD');
 const html=playerHtml(road,emptyState());
 assert.match(html,/weathered shelter/);
 assert.doesNotMatch(html,/sealed recess beneath the western post/);
 assert.doesNotMatch(html,/Sealed Recess/);
 const revealed=playerHtml(road,{revealed_resources:[],revealed_refs:[],revealed_pois:['poi-1']});
 assert.match(revealed,/Sealed Recess/);
 assert.doesNotMatch(revealed,/GM TEST SECRET/);
});
test('no fake Test Mode; reset script checks GM, marker and requires confirmation',()=>{
 const script=readFileSync(new URL('../fixtures/AG_Locations_Reset_Test_Fixture.js',import.meta.url),'utf8');
 assert.match(script,/game.user\?\.isGM/);
 assert.match(script,/Synthetic TEST ONLY/);
 assert.match(script,/DialogV2.confirm/);
 assert.match(script,/for\(const j of targets\)await j.delete\(\)/);
});
