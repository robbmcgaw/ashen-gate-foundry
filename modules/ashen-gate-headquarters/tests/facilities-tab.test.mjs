import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {facilityRow,listFacilitiesTab,facilitiesPanel,CONTENT_ACTIONS,CONTENT_FORMS,SETUP_ACTIONS,SETUP_FORMS,CHIPS} from '../js/facilities-tab.mjs';
const code=readFileSync(new URL('../js/main.mjs',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('../module.json',import.meta.url),'utf8'));
const def=(n,extra={})=>({id:`FAC-TEST-${n}`,name:`[TEST] ${n}`,status:'draft',version:'0.1.0',scope:'generic_rules',placements:['shared'],stages:[{key:'s1'}],...extra});
const rows=[facilityRow(def('Forge')),facilityRow(def('Library',{placements:['personal'],status:'approved'}),{unlocked:true}),facilityRow(def('Hall'),{unlocked:true,owned:2,installed:1})];
test('GM list shows every definition with a status chip',()=>{
 const v=listFacilitiesTab(rows);assert.equal(v.total,3);assert.equal(v.shown,3);
 assert.deepEqual(v.groups.map(g=>g.label),CHIPS);
 assert.deepEqual(rows.map(r=>r.chip),['Locked','Unlocked','Acquired']);
});
test('search, filters, sort and group',()=>{
 assert.equal(listFacilitiesTab(rows,{search:'library'}).shown,1);
 assert.equal(listFacilitiesTab(rows,{status:'Acquired'}).shown,1);
 assert.equal(listFacilitiesTab(rows,{placement:'personal'}).shown,1);
 assert.equal(listFacilitiesTab(rows,{search:'nope'}).groups.length,0);
 assert.deepEqual(listFacilitiesTab(rows,{group:'none',sort:'owned'}).groups[0].rows.map(r=>r.owned),[2,0,0]);
 assert.deepEqual(listFacilitiesTab(rows,{group:'definition'}).groups.map(g=>g.label),['approved','draft']);
});
test('unlock / acquire controls follow state; inactive Guildhall disables them',()=>{
 const html=facilitiesPanel({},listFacilitiesTab(rows));
 assert.match(html,/data-action="unlock-facility" data-id="FAC-TEST-Forge"/);
 assert.match(html,/data-action="acquire" data-id="FAC-TEST-Library"/);
 const off=facilitiesPanel({},listFacilitiesTab(rows.map(r=>({...r,active:false}))),{active:false});
 assert.ok(!off.includes('data-action="acquire"')&&!off.includes('data-action="unlock-facility"'));
 assert.match(off,/data-action="import-defs"/);
});
test('GM Setup panel holds settings only; the Facilities tab holds the content actions',()=>{
 const a=code.indexOf(' management(s){'),setup=code.slice(a,code.indexOf(' filterCatalog(',a));
 for(const x of CONTENT_ACTIONS)assert.ok(!setup.includes(`data-action="${x}"`),`${x} must not be in GM Setup`);
 for(const x of CONTENT_FORMS)assert.ok(!setup.includes(`data-aghq-form="${x}"`));
 for(const x of SETUP_ACTIONS)assert.ok(setup.includes(`data-action="${x}"`),`${x} missing from GM Setup`);
 for(const x of SETUP_FORMS)assert.ok(setup.includes(`data-aghq-form="${x}"`),`${x} missing from GM Setup`);
 const panel=facilitiesPanel({},listFacilitiesTab(rows));
 for(const x of CONTENT_ACTIONS)assert.ok(panel.includes(`data-action="${x}"`),`${x} missing from Facilities`);
 for(const x of SETUP_ACTIONS)assert.ok(!panel.includes(`data-action="${x}"`));
});
test('Facilities tab is GM-only in the shell and the data layer still enforces GM',()=>{
 assert.match(code,/facilities\(s\)\{if\(!game\.user\.isGM\)return '';/);
 assert.match(code,/!game\.user\.isGM && \['manage','facilities'\]\.includes\(this\.tab\)\)this\.tab='builder'/);
 assert.match(code,/\['manage','facilities'\]\.includes\(tab\)&&!game\.user\.isGM/);
 assert.match(code,/Headquarters facility import is GM-only/);
 for(const k of ['importFacilities','previewFacilityImport'])assert.match(code,new RegExp(k));
});
test('manifest bumped',()=>{assert.equal(manifest.version,'0.9.0');assert.ok(manifest.download.includes('ashen-gate-headquarters-v0.9.0'));});
