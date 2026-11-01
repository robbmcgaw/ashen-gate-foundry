// 0.16.0 api.exportState(): the GM's Headquarters state as plain JSON (ag-headquarters-state-export/0.1), GM only.
// MOCKED Foundry globals and a mocked private vault; synthetic [TEST] data only; proves logic, not the live Forge UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,applyOperation,site} from '../js/logic.mjs';
import {buildStateExport,STATE_EXPORT_SCHEMA} from '../js/state-export.mjs';

const hooks={once:{},on:{}};
const gm={id:'gm',isGM:true,active:true,name:'GM'};
const player={id:'p1',isGM:false,active:true,name:'[TEST] Player'};
const p0={id:'p0',isGM:false,active:true,name:'[TEST] Alpha'};
let s=applyOperation(emptyState(),gm,'activate',{hq_ref:'HQ-TEST-001',location_ref:'LOC-TEST-001',campaign_key:'test',guild_key:'primary'});
s=applyOperation(s,gm,'load_demo');
s=applyOperation(s,gm,'unlock_facility',{facility_ref:'FAC-DEMO-STUDY'});
s=applyOperation(s,gm,'unlock_facility',{facility_ref:'FAC-DEMO-FORGE'});
s=applyOperation(s,gm,'acquire',{facility_ref:'FAC-DEMO-FORGE',key:'forge_copy'});
s=applyOperation(s,gm,'acquire',{facility_ref:'FAC-DEMO-STUDY',key:'study_copy'});
s=applyOperation(s,gm,'add_rooms',{users:[player,p0]});
s=applyOperation(s,gm,'lock');
s=applyOperation(s,gm,'install',{key:'study_copy',room_key:'common',x:8,y:2});
s=applyOperation(s,gm,'install',{key:'forge_copy',room_key:'common',x:1,y:1});
s.personnel={format:'aghq-personnel/0.1',hirelings:[
  {hireling_ref:'HIRE-TEST-B',working:false,employment_status:'active',gm_notes:'[TEST] note',history:[{at:'2026',event:'private_note',text:'[TEST] entry'}]},
  {hireling_ref:'HIRE-TEST-A',working:true,employment_status:'active',history:[]}]};
s.editor_lease={user_id:'gm',until:9999999999999};
s.processed_player_requests=[{id:'nonce-secret',timestamp:100,gm_user_id:'gm'}];
const settings=new Map([['ashen-gate-headquarters.playerAccessEnabled',true],['ashen-gate-headquarters.state',s],['ashen-gate-headquarters.privateStateDocumentId','']]);
let writes=0;
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(o){this.options=o;}render(){}close(){}},HandlebarsApplicationMixin:B=>class extends B{},DialogV2:{wait:async()=>null,prompt:async()=>{}}}}};
globalThis.Hooks={once:(k,f)=>{hooks.once[k]=f;},on:(k,f)=>{(hooks.on[k]??=[]).push(f);return k;},off:()=>{}};
globalThis.ui={notifications:{warn:()=>{},info:()=>{},error:()=>{}}};
globalThis.document={querySelectorAll:()=>[]};
const mod={id:'ashen-gate-headquarters',version:'0.17.0'};
const journals=[];
globalThis.game={user:gm,users:Object.assign(new Map([['gm',gm],['p1',player],['p0',p0]]),{activeGM:gm}),modules:{get:()=>mod},
 settings:{register:()=>{},registerMenu:()=>{},get:(m,k)=>settings.get(`${m}.${k}`),set:async(m,k,v)=>{settings.set(`${m}.${k}`,v);}},
 keybindings:{register:()=>{}},journal:{get contents(){return journals;},get:id=>journals.find(j=>j.id===id)},items:{contents:[]},actors:{contents:[]}};
globalThis.JournalEntry={create:async d=>{const doc={id:'vault1',ownership:d.ownership,flags:structuredClone(d.flags),getFlag:(ns,k)=>doc.flags[ns]?.[k],update:async patch=>{for(const[k,v]of Object.entries(patch)){const[,ns,key]=k.split('.');doc.flags[ns][key]=structuredClone(v);}}};journals.push(doc);return doc;}};
console.warn=()=>{};
await import('../js/main.mjs');
hooks.once.init();await hooks.once.ready();await new Promise(r=>setTimeout(r,5));
const api=mod.api;

test('the vault was set up and the API is present and feature-detectable',()=>{assert.equal(journals.length,1);assert.equal(typeof api.exportState,'function');});
test('shape: schema_version first, exact top-level keys; no timestamps; plain JSON',()=>{
  game.user=gm;const out=api.exportState();
  assert.deepEqual(Object.keys(out),['schema_version','format','active','state_revision','guild','config','headquarters','inventory','personal_layouts','facilities','hirelings']);
  assert.equal(out.schema_version,'ag-headquarters-state-export/0.1');assert.equal(STATE_EXPORT_SCHEMA,out.schema_version);
  assert.equal('exportedAt' in out,false);
  const text=JSON.stringify(out);
  for(const k of ['editor_lease','processed_player_requests','nonce-secret','"stages"','Informational demonstration only'])assert.equal(text.includes(k),false,k);
  assert.deepEqual(JSON.parse(text),out);
});
test('content: guild, config, rooms with owner names, installations, inventory, layouts, facility summary, hirelings sorted',()=>{
  game.user=gm;const out=api.exportState();
  assert.equal(out.guild.rank,1);assert.deepEqual(out.guild.unlocked_facility_refs,['FAC-DEMO-FORGE','FAC-DEMO-STUDY']);
  assert.equal(out.config.name,'Guildhall');assert.equal(out.config.rank_rules.length,5);
  const hq=out.headquarters[0];assert.equal(hq.hq_ref,'HQ-TEST-001');
  assert.deepEqual(hq.rooms.map(r=>r.key),[...hq.rooms.map(r=>r.key)].sort());
  assert.deepEqual(hq.rooms.find(r=>r.key==='room_p1').owner_user_name,'[TEST] Player');assert.equal(hq.rooms.find(r=>r.key==='common').owner_user_name,null);
  assert.deepEqual(hq.installations.map(i=>i.key),['forge_copy','study_copy']);assert.deepEqual(hq.installations[0].placement.x,1);
  assert.deepEqual(hq.staffing_slots.map(x=>x.key),[...hq.staffing_slots.map(x=>x.key)].sort());assert.equal(hq.staffing_slots.length>0,true);
  assert.deepEqual(out.inventory.map(i=>i.key),['forge_copy','study_copy']);
  assert.deepEqual(out.personal_layouts.map(l=>l.room_key),['room_p0','room_p1']);
  assert.deepEqual(out.facilities.map(f=>f.id),['FAC-DEMO-DESK','FAC-DEMO-FORGE','FAC-DEMO-STUDY']);
  assert.deepEqual(Object.keys(out.facilities[0]),['id','name','category','status','version']);
  assert.deepEqual(out.hirelings.map(h=>h.hireling_ref),['HIRE-TEST-A','HIRE-TEST-B']);
  assert.equal(out.hirelings[1].gm_notes,'[TEST] note');
});
test('GM only: the API and the builder both refuse a player',()=>{
  game.user=player;assert.throws(()=>api.exportState(),/GM-only/);
  assert.throws(()=>buildStateExport({isGM:false,state:s}),/GM authorization/);assert.throws(()=>buildStateExport({state:s}),/GM authorization/);
  game.user=gm;
});
test('stable and writes nothing: two runs equal, input order does not matter, the stored state is not changed',()=>{
  game.user=gm;const vault=JSON.stringify(journals[0].flags),before=JSON.stringify([...settings]);
  const a=api.exportState(),b=api.exportState();assert.deepEqual(a,b);
  const shuffled=structuredClone(s);shuffled.inventory.reverse();shuffled.personnel.hirelings.reverse();site(shuffled).installations.reverse();site(shuffled).rooms.reverse();shuffled.core.guild_state.unlocked_facility_refs.reverse();
  assert.deepEqual(buildStateExport({isGM:true,state:shuffled,userNames:{p1:'[TEST] Player',p0:'[TEST] Alpha'}}),a);
  assert.equal(JSON.stringify(journals[0].flags),vault);assert.equal(JSON.stringify([...settings]),before);
});
test('absent data gives empty arrays, not errors',()=>{
  const empty={schema_version:STATE_EXPORT_SCHEMA,format:null,active:false,state_revision:0,guild:null,config:null,headquarters:[],inventory:[],personal_layouts:[],facilities:[],hirelings:[]};
  assert.deepEqual(buildStateExport({isGM:true}),empty);
  const fresh=buildStateExport({isGM:true,state:emptyState()});
  assert.deepEqual([fresh.active,fresh.guild,fresh.headquarters,fresh.inventory,fresh.personal_layouts,fresh.facilities,fresh.hirelings],[false,null,[],[],[],[],[]]);
});
