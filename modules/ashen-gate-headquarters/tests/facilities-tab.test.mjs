import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {facilityRow,listFacilitiesTab,facilitiesPanel,plural,CONTENT_ACTIONS,CONTENT_FORMS,QUARTERS_ACTIONS,SETUP_ACTIONS,SETUP_FORMS,DEV_ACTIONS,CHIPS} from '../js/facilities-tab.mjs';
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
 assert.deepEqual(listFacilitiesTab(rows,{group:'definition'}).groups.map(g=>g.label),['Approved','Draft'],'definition statuses are labels, not tokens');
});
test('unlock / acquire controls follow state; inactive Guildhall disables them',()=>{
 const html=facilitiesPanel({},listFacilitiesTab(rows));
 assert.match(html,/data-action="unlock-facility" data-id="FAC-TEST-Forge"/);
 assert.match(html,/data-action="acquire" data-id="FAC-TEST-Library"/);
 const off=facilitiesPanel({},listFacilitiesTab(rows.map(r=>({...r,active:false}))),{active:false,importHtml:'<span data-test-import></span>'});
 assert.ok(!off.includes('data-action="acquire"')&&!off.includes('data-action="unlock-facility"'));
 assert.ok(off.includes('<span data-test-import></span>'),'the importer is available before activation');
});
test('HQ-02: GM Setup holds settings only; rank and rooms live with their content',()=>{
 const a=code.indexOf(' management(s){'),setup=code.slice(a,code.indexOf(' filterCatalog(',a));
 for(const x of [...CONTENT_ACTIONS,...QUARTERS_ACTIONS])assert.ok(!setup.includes(`data-action="${x}"`),`${x} must not be in GM Setup`);
 for(const x of CONTENT_FORMS)assert.ok(!setup.includes(`data-aghq-form="${x}"`));
 for(const x of SETUP_ACTIONS)assert.ok(setup.includes(`data-action="${x}"`),`${x} missing from GM Setup`);
 assert.ok(!/Guild Rank|Player rooms|data-rank/.test(setup),'no Guild Rank or Player rooms card in GM Setup');
 for(const x of SETUP_FORMS)assert.ok(code.includes('data-aghq-form="${SETUP_FORM}"')&&x==='setup',`${x} missing from GM Setup`);
 for(const x of DEV_ACTIONS)assert.ok(setup.includes(`data-action="${x}"`)&&setup.indexOf(`data-action="${x}"`)>setup.indexOf('ag-devtools'),`${x} must be in GM Setup Developer Tools`);
 // Facilities tab: unlock/acquire and Set rank on the Facilities sub-tab, the art form on Decorations.
 const guild={rank:1,used:0,slots:2,orders:2};
 const panel=facilitiesPanel({},listFacilitiesTab(rows),{guild})+facilitiesPanel({},listFacilitiesTab(rows),{guild,sub:'decorations'});
 for(const x of CONTENT_ACTIONS)assert.ok(panel.includes(`data-action="${x}"`),`${x} missing from Facilities`);
 for(const x of CONTENT_FORMS)assert.ok(panel.includes(`data-aghq-form="${x}"`),`${x} form missing from Facilities`);
 for(const x of [...SETUP_ACTIONS,...DEV_ACTIONS,...QUARTERS_ACTIONS])assert.ok(!panel.includes(`data-action="${x}"`));
 // Personal Quarters: Create missing player rooms is a GM-only toolbar action.
 const q=code.slice(code.indexOf(' quarters(s){'),code.indexOf(' roomTabs(rooms,current){'));
 for(const x of QUARTERS_ACTIONS)assert.match(q,new RegExp(`const addRooms=gm\\?\`<div class="ag-toolbar__end"><button type="button" class="ag-btn ag-btn--sm" data-action="${x}">`));
});
test('Facilities: guild rank row with Set rank…, and no rank row before activation',()=>{
 const html=facilitiesPanel({},listFacilitiesTab(rows),{guild:{rank:3,used:1,slots:4,orders:1}});
 assert.match(html,/<strong>Guild rank 3<\/strong> · 1\/4 shared facilities · 1 order per downtime/);
 assert.match(html,/<select data-rank>.*<option value="3" selected>3<\/option>/);
 assert.match(html,/data-action="set-rank">Set rank…<\/button>/);
 assert.ok(!facilitiesPanel({},listFacilitiesTab(rows),{active:false}).includes('data-rank'));
});
test('HQ-09: Facilities and Decorations are kit sub-tabs; the art form is not below the catalog',()=>{
 const fac=facilitiesPanel({},listFacilitiesTab(rows),{art:['worlds/test/a.webp']});
 assert.match(fac,/<div class="ag-tabs ag-tabs--sub" role="tablist" aria-label="Facilities sections">/);
 assert.match(fac,/role="tab" id="aghq-facilities-tab-facilities" data-tab="facilities" aria-controls="aghq-facilities-panel-facilities" aria-selected="true" tabindex="0">Facilities <span class="ag-tab__count">3<\/span>/);
 assert.match(fac,/data-tab="decorations"[^>]*aria-selected="false" tabindex="-1">Decorations <span class="ag-tab__count">1<\/span>/);
 assert.match(fac,/<section class="aghq-subpanel" id="aghq-facilities-panel-facilities" role="tabpanel" aria-labelledby="aghq-facilities-tab-facilities"/);
 assert.ok(!fac.includes('data-aghq-form="decoration"'),'no art form on the Facilities sub-tab');
 const dec=facilitiesPanel({},listFacilitiesTab(rows),{sub:'decorations',art:['worlds/test/a.webp']});
 assert.match(dec,/data-aghq-form="decoration"/);assert.match(dec,/<img src="worlds\/test\/a\.webp" alt="Decoration 1">/);
 assert.ok(!dec.includes('aghq-catalogrow'));
 assert.match(facilitiesPanel({},listFacilitiesTab(rows),{sub:'decorations',active:false}),/class="ag-empty".*Activate the Guildhall/);
 assert.match(facilitiesPanel({},listFacilitiesTab(rows),{sub:'nope'}),/aria-selected="true" tabindex="0">Facilities/,'unknown sub-tab falls back');
});
test('HQ-07: the second importer is demoted to a labelled Advanced fold, with Open General Manager when it can open',()=>{
 const html=facilitiesPanel({},listFacilitiesTab(rows),{importHtml:'<span data-test-import></span>',manager:true});
 assert.ok(!/ag-toolbar__end/.test(html.slice(html.indexOf('<div class="ag-toolbar">'),html.indexOf('ag-toolbar__count'))),'no importer in the toolbar');
 assert.match(html,/<details class="ag-fold" data-ag-fold-key="facility-import"><summary class="ag-fold__summary"><span class="ag-fold__title">Advanced: import here, or use General Manager<\/span><\/summary>.*<span data-test-import><\/span>.*data-action="open-manager"/s);
 assert.ok(!facilitiesPanel({},listFacilitiesTab(rows),{manager:false}).includes('open-manager'),'no Manager button when Manager is missing');
 assert.match(code,/importHtml:fileButton\(\{label:'Import facility definitions…',accept:'\.json,application\/json'/);
 assert.match(code,/bindFileButtons\(node,async\(\[file\]\)=>this\.importFile\(file\)\)/);
 assert.ok(!code.includes("document.createElement('input')"),'no display:none file input');
});
test('HQ-11/HQ-15: filters have visible labels; plurals are real words',()=>{
 const html=facilitiesPanel({},listFacilitiesTab(rows));
 for(const l of ['Status','Placement','Sort','Group'])assert.match(html,new RegExp(`<label class="ag-field ag-field--inline">${l} <select data-fac-filter=`));
 assert.ok(!/stage\(s\)|Hireling\(s\)/.test(html+code),'no lazy plurals');
 assert.match(html,/· 1 stage<\/span>/);
 assert.equal(plural(1,'facility','facilities'),'1 facility');assert.equal(plural(2,'stage'),'2 stages');assert.equal(plural(0,'order'),'0 orders');
});
test('Facilities tab is GM-only in the shell and the data layer still enforces GM',()=>{
 assert.match(code,/facilities\(s\)\{if\(!game\.user\.isGM\)return '';/);
 assert.match(code,/const GM_TABS=\['hirelings','facilities','manage'\];/);
 assert.match(code,/!game\.user\.isGM && GM_TABS\.includes\(this\.tab\)\)this\.tab='builder'/);
 assert.match(code,/GM_TABS\.includes\(tab\)&&!game\.user\.isGM/);
 assert.match(code,/Headquarters facility import is GM-only/);
 for(const k of ['importFacilities','previewFacilityImport'])assert.match(code,new RegExp(k));
});
test('manifest bumped',()=>{assert.equal(manifest.version,'0.14.1');assert.ok(manifest.download.includes('ashen-gate-headquarters-v0.14.1'));});
