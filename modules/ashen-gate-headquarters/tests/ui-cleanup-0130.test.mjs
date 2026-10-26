// 0.13.0 UI cleanup (audit HQ-01…HQ-15): keyboard board, GM Setup settings only, unsaved-edit guard, Hirelings toolbar,
// plain labels, Facilities sub-tabs. Mocked Foundry globals; proves the wiring and markup, not the live window or its look.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyState,applyOperation,freeSpot} from '../js/logic.mjs';
import {assertNoIds} from '../../../scripts/test-helpers/no-ids.mjs';
import {guildhallRecords,locationPickRecords,defaultCampaignKey} from '../js/activation-links.mjs';
import {rosterGroups,stationLabels,employmentLabel,perkStatus,localDate} from '../js/hirelings-tab.mjs';

const hooks={once:{},on:{}};
const warnings=[],writes=[],infos=[];
let dialog=null,answer='cancel';
const gm={id:'gm',isGM:true,active:true,name:'GM'};
const player={id:'p1',isGM:false,active:true,name:'[TEST] Player'};
const AT=Date.UTC(2026,9,1,12,0,0);
const step=(s,op,p={},now)=>applyOperation(s,gm,op,p,now);
let state=step(emptyState(),'activate',{hq_ref:'HQ-TEST-001',location_ref:'LOC-TEST-001',campaign_key:'test',guild_key:'primary'});
state=step(state,'load_demo');state=step(state,'unlock_facility',{facility_ref:'FAC-DEMO-FORGE'});
state=step(state,'acquire',{facility_ref:'FAC-DEMO-FORGE',key:'copy_a'});
state=step(state,'acquire',{facility_ref:'FAC-DEMO-FORGE',key:'copy_b'});
state=step(state,'lock');
state=step(state,'install',{room_key:'common',key:'copy_a',x:0,y:0});
state=step(state,'add_rooms',{users:[{id:'p1'}]});
state=step(state,'register_hireling',{hireling_ref:'HIRE-TEST-ADA'});
state=step(state,'register_hireling',{hireling_ref:'HIRE-TEST-BEN'});
state=step(state,'assign_staff',{hireling_ref:'HIRE-TEST-ADA',installation_key:'copy_a'});
state=step(state,'depart_hireling',{hireling_ref:'HIRE-TEST-BEN',status:'retired',confirm:true},AT);
const hire=(id,name)=>({name,img:null,uuid:`Item.${id}`,flags:{'ashen-gate-manager':{source:{sourceId:id,entityType:'Hireling',visibility:'gm'}}}});
const settings=new Map([['ashen-gate-headquarters.playerAccessEnabled',true],['ashen-gate-headquarters.state',state]]);
const vault={id:'vault',ownership:{default:0},flags:{},update:async d=>{writes.push({vault:d});}};
let closed=0;
globalThis.foundry={applications:{api:{
  ApplicationV2:class{constructor(o){this.options=o;}render(){}close(){closed++;}},
  HandlebarsApplicationMixin:B=>class extends B{},
  DialogV2:{wait:async o=>{dialog=o;return o.buttons.find(b=>b.action===answer).callback();},prompt:async o=>{dialog=o;}}
}}};
globalThis.Hooks={once:(k,f)=>{hooks.once[k]=f;},on:(k,f)=>{(hooks.on[k]??=[]).push(f);return k;},off:()=>{}};
globalThis.ui={notifications:{warn:m=>warnings.push(m),info:m=>infos.push(m),error:m=>warnings.push(m)}};
globalThis.document={querySelectorAll:()=>[]};
let menu;
const mod={id:'ashen-gate-headquarters',version:'0.15.1'};
globalThis.game={user:gm,users:Object.assign(new Map([['gm',gm],['p1',player]]),{activeGM:gm}),modules:{get:()=>mod},
  settings:{register:()=>{},registerMenu:(_m,_k,o)=>{menu=o;},get:(m,k)=>structuredClone(settings.get(`${m}.${k}`)),set:async(m,k,v)=>{writes.push({[k]:v});settings.set(`${m}.${k}`,v);}},
  keybindings:{register:()=>{}},journal:{contents:[],get:()=>null},items:{contents:[hire('HIRE-TEST-ADA','[TEST] Ada'),hire('HIRE-TEST-BEN','[TEST] Ben'),hire('HIRE-TEST-CAL','[TEST] Cal')]},actors:{contents:[]}};
globalThis.JournalEntry={create:async d=>Object.assign(vault,d,{id:'vault'})};
await import('../js/main.mjs');
hooks.once.init();
await hooks.once.ready();
const code=readFileSync(new URL('../js/main.mjs',import.meta.url),'utf8');
const app=()=>{const a=new menu.type();clearInterval(a.leaseTimer);a.render=()=>{a.rendered=(a.rendered??0)+1;};return a;};
const read=()=>game.modules.get().api.getState();
const reset=()=>{writes.length=0;warnings.length=0;infos.length=0;dialog=null;};
const click=async(a,dataset,root={querySelector:()=>null})=>{reset();const btn={dataset};
  await a.click({target:{closest:sel=>sel==='button'?btn:null},preventDefault(){}},root);};
globalThis.FormData=class{constructor(form){this.v=form.values;}get(k){return k in this.v?this.v[k]:null;}entries(){return Object.entries(this.v);}};
const submit=async(a,name,values)=>{reset();const form={dataset:{aghqForm:name},values};await a.submit({target:{closest:()=>form},preventDefault(){}});};
const placement=key=>read().core.headquarters_states[0].installations.find(i=>i.key===key)?.placement;

test('HQ-03: leaving GM Setup with unsaved edits asks first; Keep editing is the default and stays put',async()=>{
  const a=app();a.tab='manage';a.setupGuard.markDirty();
  answer='cancel';await click(a,{tab:'benefits'});
  assert.equal(dialog.window.title,'Discard unsaved changes?');
  assert.deepEqual(dialog.buttons.map(b=>b.label),['Keep editing','Discard changes']);
  assert.ok(dialog.buttons[0].default&&!dialog.buttons[1].default,'Keep editing is the default');
  assert.equal(a.tab,'manage');assert.equal(a.setupGuard.dirty,true);
  answer='confirm';await click(a,{tab:'benefits'});
  assert.equal(a.tab,'benefits');assert.equal(a.setupGuard.dirty,false);
});

test('HQ-03: close and a saved-state re-render never discard unsaved GM Setup edits silently',async()=>{
  const a=app();a.tab='manage';a.setupGuard.markDirty();closed=0;
  a.refresh();assert.equal(a.rendered??0,0,'no re-render while dirty');
  answer='cancel';assert.equal(await a.close(),a);assert.equal(closed,0,'kept open');
  answer='confirm';await a.close();assert.equal(closed,1);
  const b=app();b.tab='builder';b.refresh();assert.equal(b.rendered,1,'other tabs re-render as before');
});

test('HQ-03: Cancel discards drafts and stays on GM Setup; clean tabs switch without asking',async()=>{
  const a=app();a.tab='manage';a.setupGuard.markDirty();
  await click(a,{action:'cancel-setup'});
  assert.equal(a.setupGuard.dirty,false);assert.equal(a.tab,'manage');assert.equal(dialog,null);
  await click(a,{tab:'quarters'});assert.equal(dialog,null);assert.equal(a.tab,'quarters');
});

test('HQ-02: Set rank asks "Set Guild Rank to N?" and Cancel writes nothing',async()=>{
  const a=app();a.tab='facilities';const root={querySelector:sel=>sel==='[data-rank]'?{value:'3'}:null};
  answer='cancel';await click(a,{action:'set-rank'},root);
  assert.equal(dialog.window.title,'Set Guild Rank to 3?');
  assert.deepEqual(dialog.buttons.map(b=>b.label),['Cancel','Set rank 3']);
  assert.equal(read().core.guild_state.rank,1);assert.equal(writes.length,0);
  answer='confirm';await click(a,{action:'set-rank'},root);
  assert.equal(read().core.guild_state.rank,3);
  await click(a,{action:'set-rank'},root);assert.equal(dialog,null,'same rank: no dialog');assert.match(infos[0],/already rank 3/);
});

test('HQ-02: the Facilities tab shows the guild row; GM Setup has no rank or rooms card',()=>{
  const a=app();a.tab='facilities';const html=a.page(read());
  assert.match(html,/<strong>Guild rank 3<\/strong>/);assert.match(html,/data-action="set-rank">Set rank…/);
  a.tab='manage';const setup=a.page(read());
  for(const x of ['data-rank','set-rank','add-rooms','Player rooms'])assert.ok(!setup.includes(x),x);
});

test('HQ-02/HQ-12: Personal Quarters toolbar has Create missing player rooms (GM); rooms you can edit say so to screen readers',()=>{
  const a=app();a.tab='quarters';const html=a.page(read());
  assert.match(html,/<div class="ag-toolbar aghq-roomtabs">.*<div class="ag-toolbar__end"><button type="button" class="ag-btn ag-btn--sm" data-action="add-rooms">.*Create missing player rooms<\/button>/);
  assert.match(html,/<i class="fa-solid fa-pen" aria-hidden="true"><\/i><span class="ag-sr-only">\(you can edit\)<\/span>/);
  assert.match(html,/role="tab" id="aghq-room-room_p1" aria-controls="aghq-room-panel"/);
  assert.match(html,/id="aghq-room-panel" role="tabpanel" aria-labelledby="aghq-room-room_p1"/);
});

test('HQ-02: Create missing player rooms reports what it did',async()=>{
  const a=app();a.tab='quarters';await click(a,{action:'add-rooms'});
  assert.equal(warnings.length,0,warnings.join());assert.match(infos[0],/Every player already has a room/);
});

test('HQ-01: placed facilities are buttons with a name, size and pressed state; the inspector has Move buttons',()=>{
  const a=app();a.selectedCopy='copy_a';const html=a.page(read());
  assert.match(html,/<button type="button" class="aghq-tile selected" data-installed="copy_a" aria-pressed="true" aria-label="Demo Forge, 4×3, rotated 0°" draggable="true"/);
  for(const [dir,label] of [['left','Move left'],['up','Move up'],['right','Move right'],['down','Move down']])
    assert.match(html,new RegExp(`data-action="nudge" data-dir="${dir}" aria-label="${label}" data-tooltip="${label}"`));
  assert.match(html,/data-action="place" data-key="copy_b" aria-label="Place Demo Forge">/,'Place is the keyboard alternative to dragging a copy');
  assert.ok(!/<div class="aghq-tile/.test(html),'no div tiles');
});

test('HQ-01: Move nudges a piece one square; at the edge it says so and writes nothing',async()=>{
  const a=app();a.selectedCopy='copy_a';
  await click(a,{action:'nudge',dir:'right'});
  assert.equal(warnings.length,0,warnings.join());assert.deepEqual([placement('copy_a').x,placement('copy_a').y],[1,0]);
  await click(a,{action:'nudge',dir:'up'});
  assert.match(warnings[0],/already at the edge/);assert.equal(writes.length,0);
});

test('HQ-01: Place installs a copy in the first free space and selects it',async()=>{
  const a=app();a.tab='builder';
  await click(a,{action:'place',key:'copy_b'});
  assert.equal(warnings.length,0,warnings.join());
  assert.deepEqual([placement('copy_b').x,placement('copy_b').y],[5,0]);
  assert.equal(a.selectedCopy,'copy_b');assert.equal(a.focusAfter,'button[data-installed="copy_b"]');
});

test('freeSpot: first fit row by row, null when nothing fits; it never writes',()=>{
  const s=read();const before=JSON.stringify(s);
  assert.deepEqual(freeSpot(s,'common',4,3),{x:9,y:0});
  assert.deepEqual(freeSpot(s,'common',24,15),{x:0,y:3});
  assert.equal(freeSpot(s,'common',25,1),null);
  assert.equal(freeSpot(s,'no_room',1,1),null);
  assert.equal(JSON.stringify(s),before);
});

test('HQ-01: decoration art is a button that adds it to the room; placed decorations are buttons',async()=>{
  // Add the art through the real op so the GM library holds it.
  const a=app();await a.submit({target:{closest:()=>({dataset:{aghqForm:'decoration'},values:{art:'worlds/test/rug.webp'}})},preventDefault(){}});
  a.tab='quarters';a.selectedRoom='room_p1';
  let html=a.page(read());
  assert.match(html,/<button type="button" class="aghq-decoration-card" data-decor-art="worlds\/test\/rug\.webp" draggable="true" aria-label="Add decoration 1 to this room"/);
  reset();const btn={dataset:{decorArt:'worlds/test/rug.webp'}};
  await a.click({target:{closest:sel=>sel==='button'?btn:null},preventDefault(){}},{querySelector:()=>null});
  assert.equal(warnings.length,0,warnings.join());
  const deco=read().personal_layouts.room_p1.decorations[0];
  assert.deepEqual([deco.x,deco.y,deco.width,deco.height],[0,0,2,2]);
  assert.equal(a.selectedCopy,deco.key);
  html=a.page(read());
  assert.match(html,new RegExp(`<button type="button" class="aghq-decoration selected" data-decoration="${deco.key}" aria-pressed="true" aria-label="Decoration 1, 2×2, rotated 0°"`));
  assert.match(html,/data-action="nudge" data-dir="down"/);
  await click(a,{action:'nudge',dir:'down'});
  assert.equal(read().personal_layouts.room_p1.decorations[0].y,1);
});

test('HQ-04/HQ-05: Hirelings toolbar, groups, labelled Working, plain statuses, local dates, facility names only',()=>{
  const a=app();a.tab='hirelings';const html=a.page(read());
  assert.match(html,/<div class="ag-toolbar"><label class="ag-search">.*data-hire-search.*<select data-hire-filter="status">.*<span class="ag-toolbar__count" data-hire-count>2 of 2 hirelings<\/span><form class="ag-toolbar__end" data-aghq-form="add-hireling">.*<option value="HIRE-TEST-CAL">\[TEST\] Cal<\/option>.*Add to roster<\/button><\/form><\/div>/s);
  const active=html.indexOf('>Active (1)</h4>'),departed=html.indexOf('>Departed (1)</h4>');
  assert.ok(active>0&&departed>active,'grouped Active then Departed');
  assert.match(html,/<label class="ag-field ag-field--inline aghq-working"><input type="checkbox" data-hire-working data-hire-ref="HIRE-TEST-ADA" checked> Working<\/label>/);
  assert.match(html,/Stationed at Demo Forge #1/);assert.match(html,/<option value="copy_b" >Demo Forge #2<\/option>/);
  assert.match(html,/<span class="ag-badge ag-badge--warn">Retired<\/span>/);
  assert.match(html,/Permanent departure · Retired<\/span><span class="ag-row__meta">[^<]+<\/span>/);
  assert.ok(html.includes(localDate(new Date(AT).toISOString())),'history date is local');
  for(const raw of ['Working ON','Working OFF','2026-10-01T12','(copy_','>retired<','>active<','toggle'])assert.ok(!html.includes(raw),raw);
  assert.match(html,/<details class="ag-fold" data-ag-fold-key="hire-depart-HIRE-TEST-ADA"><summary class="ag-fold__summary"><span class="ag-fold__title">Permanent departure<\/span>/);
  assert.ok(!html.includes('hire-depart-HIRE-TEST-BEN'),'no departure form for someone who already left');
  assert.match(html,/<span class="ag-portrait"><span class="ag-portrait__initials">/);
  a.hv.status='departed';const only=a.hirelings(read());
  assert.ok(!only.includes('>Active (')&&only.includes('>Departed (1)'));
});

test('HQ-04: Working applies at once from its checkbox (GM)',async()=>{
  const a=app();reset();
  await a.setWorking({checked:false,dataset:{hireRef:'HIRE-TEST-ADA'}});
  assert.equal(read().personnel.hirelings.find(h=>h.hireling_ref==='HIRE-TEST-ADA').working,false);
  await a.setWorking({checked:true,dataset:{hireRef:'HIRE-TEST-ADA'}});
  assert.equal(read().personnel.hirelings.find(h=>h.hireling_ref==='HIRE-TEST-ADA').working,true);
});

test('permanent departure asks with a named title, Cancel is the default and writes nothing',async()=>{
  const a=app();
  answer='cancel';await submit(a,'depart-hireling',{hireling_ref:'HIRE-TEST-ADA',status:'deceased'});
  assert.equal(dialog.window.title,'Mark [TEST] Ada as deceased?');
  assert.deepEqual(dialog.buttons.map(b=>b.label),['Cancel','Record departure']);
  assert.ok(dialog.buttons[0].default);assert.ok(dialog.classes.includes('ag-dialog--danger'));
  assert.equal(writes.length,0);
});

test('hirelings-tab helpers: labels, station names, grouping',()=>{
  assert.equal(employmentLabel('departed'),'Permanently departed');assert.equal(employmentLabel('on_leave'),'On leave');
  assert.deepEqual(perkStatus('nonstacking'),{label:"Doesn't stack",tone:'warn'});
  assert.deepEqual([...stationLabels([{key:'a',name:'Forge'},{key:'b',name:'Study'}]).values()],['Forge','Study'],'no #n without duplicates');
  const rows=[{hireling_ref:'H1',name:'[TEST] Zed',employment_status:'active'},{hireling_ref:'H2',name:'[TEST] Amy',employment_status:'active'},{hireling_ref:'H3',name:'[TEST] Bo',employment_status:'deceased'}];
  const v=rosterGroups(rows);assert.deepEqual(v.groups.map(g=>[g.label,g.rows.map(r=>r.hireling_ref)]),[['Active',['H2','H1']],['Departed',['H3']]]);
  assert.equal(rosterGroups(rows,{search:'amy'}).shown,1);assert.equal(rosterGroups(rows,{status:'departed'}).groups.length,1);
  assert.equal(localDate('not a date'),'');
});

test('HQ-06: players have no Hirelings tab and cannot switch to it',async()=>{
  const s=read();game.user=player;
  try{const a=app();assert.ok(!a.page(s).includes('data-tab="hirelings"'));
    a.tab='hirelings';assert.ok(!a.page(s).includes('aria-labelledby="aghq-tab-hirelings"'),'falls back to Guildhall Builder');
    await click(a,{tab:'hirelings'});assert.match(warnings[0],/GM permissions/);}
  finally{game.user=gm;}
});

test('HQ-08 (0.14.0): activation picks the Guildhall and Location by name; the keys are filled in under Advanced',()=>{
  const realGet=game.modules.get;
  const partners={'ashen-gate-manager':{active:true,api:{definitions:{list:()=>[{id:'HQ-TEST-HALL',entityType:'Headquarters',title:'[TEST] Ash Hall'},{id:'FAC-TEST-FORGE',entityType:'Facility',title:'[TEST] Forge'}]}}},
    'ashen-gate-locations':{active:true,api:{listLocations:()=>[{id:'LOC-TEST-ASH',name:'[TEST] Ashford',region:'[TEST] Marches',type:'Town'}]}}};
  game.modules.get=id=>partners[id]??realGet(id);
  try{
    const html=app().activation(emptyState(),true);
    assert.match(html,/id="aghq-hq-ref-text"/);assert.match(html,/data-label="\[TEST\] Ash Hall"/);assert.ok(!html.includes('[TEST] Forge'),'only Guildhall records');
    assert.match(html,/data-label="\[TEST\] Ashford"/);
    assert.ok(!/name="(hq_ref|location_ref)"/.test(html),'no id boxes');
    assert.match(html,/Advanced: keys/);assert.match(html,/<input name="guild_key" value="primary" required>/);assert.match(html,/<input name="campaign_key" value="[a-z0-9_-]+" required>/);
    assertNoIds(html,'the activation form');
  }finally{game.modules.get=realGet;}
});
test('HQ-08 (0.14.0): activation says why a list is empty when General Manager or Locations is off, and shows no ids',()=>{
  const html=app().activation(emptyState(),true);
  assert.match(html,/General Manager is not active/);assert.match(html,/Locations is not active/);assert.ok(!/ag-picker/.test(html));
  assertNoIds(html,'the activation form without partners');
});

test('HQ-10: only Guildhall Builder shows the editing lease; other tabs say Auto-saved',()=>{
  const a=app();
  for(const tab of ['quarters','benefits','hirelings','facilities']){a.tab=tab;const html=a.page(read());
    assert.match(html,/<footer class="ag-footer"><span class="ag-footer__status" role="status">Auto-saved<\/span><\/footer>/,tab);}
  a.tab='builder';assert.match(a.page(read()),/role="status">Auto-saved · Editor: GM<\/span>/);
});

test('HQ-14: Help is plain language, names the new places and shows GM topics to the GM only',()=>{
  const a=app();const h=a.help();
  for(const s of ['Create missing player rooms','Set the guild rank','Hirelings (GM)','Keyboard'])assert.ok(h.includes(s),s);
  for(const s of ['from GM Setup','HIRE/HPERK','Hirelings v1','personnel state'])assert.ok(!h.includes(s),s);
  game.user=player;try{const p=a.help();assert.ok(!p.includes('(GM)')&&!p.includes('Create missing'));}finally{game.user=gm;}
});

test('kit 2.2 adoption: tabs, folds, sub-tab memory, file button, guard and danger confirmations',()=>{
  for(const s of ['bindTablist(node)','bindFolds(node,this.ui)','uiState(MODULE_ID)','guardDirty(','bindFileButtons(node'])assert.ok(code.includes(s),s);
  assert.ok(!/confirmDialog\([^;]*danger:true/.test(code),'removals use confirmDanger');
  assert.equal((code.match(/confirmDanger\(/g)??[]).length,4,'uninstall, remove decoration, unassign, departure');
});

test('activation lists: Guildhall records only, Locations by region, null when a list is unavailable, keys from the world',()=>{
  assert.deepEqual(guildhallRecords([{id:'HQ-A',title:'  '},{id:'HQ-B',title:'[TEST] B'},{id:'LOC-X',title:'no'},null]).map(r=>[r.value,r.label]),[['HQ-A','Unnamed Guildhall'],['HQ-B','[TEST] B']]);
  assert.equal(guildhallRecords(null),null);assert.equal(locationPickRecords(undefined),null);
  assert.deepEqual(locationPickRecords([{id:'LOC-A',name:'[TEST] A',region:'[TEST] R',type:'Town'},{id:'bad',name:'x'},{id:'LOC-REG',name:'[TEST] Reg',isRegion:true}]).map(r=>[r.label,r.group,r.hint]),[['[TEST] A','[TEST] R','Town'],['[TEST] Reg','Regions','Region']]);
  assert.equal(defaultCampaignKey({id:'My World_2!'}),'my-world_2');assert.equal(defaultCampaignKey({}),'campaign');
  const s=applyOperation(emptyState(),gm,'activate',{hq_ref:'HQ-A',location_ref:'LOC-A',campaign_key:defaultCampaignKey({id:'my-world'}),guild_key:'primary'});
  assert.equal(s.active,true,'ids stored under the hood as before');
  assert.throws(()=>applyOperation(emptyState(),gm,'activate',{hq_ref:'',location_ref:'',campaign_key:'c',guild_key:'primary'}),/Choose a Guildhall record and a Location from the lists/);
});
