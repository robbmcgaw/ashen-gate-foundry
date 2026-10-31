// 0.27.0 api.exportState(): all Renown play state as plain JSON, GM only. Mocked Foundry; synthetic [TEST] data only; proves logic, not the live UI.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {makeFaction,makeGroupRecord,makePersonalRecord,adjustStanding} from '../scripts/core.mjs';
import {makeDeity} from '../scripts/deity.mjs';
import {buildStateExport,STATE_EXPORT_SCHEMA} from '../scripts/state-export.mjs';
const hooks=new Map();
globalThis.Hooks={on:(n,f)=>hooks.set(n,f),once:(n,f)=>hooks.set(n,f)};
globalThis.HTMLElement=class{};
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{NONE:0,OBSERVER:2,OWNER:3}};
class V2{async render(){return this;}async close(){return this;}async _prepareContext(){return{};}async _onRender(){}}
let ctr=1;
globalThis.foundry={applications:{api:{ApplicationV2:V2,HandlebarsApplicationMixin:C=>C}},utils:{randomID:()=>String(ctr++).padStart(24,'A')}};
const ns='ashen-gate-factions';
const journal=[];journal.get=id=>journal.find(d=>d.id===id);
const folders=[];
globalThis.Folder={create:async data=>{const f={id:'F'+(folders.length+1),name:data.name,type:data.type,folder:data.folder??null,flags:{},getFlag(){return null;}};folders.push(f);return f;}};
const doc=(name,flags)=>{const d={id:'J'+(journal.length+1),name,folder:null,flags,ownership:{default:0},getFlag(m,k){return this.flags[m]?.[k];},async setFlag(m,k,v){this.flags[m]??={};this.flags[m][k]=structuredClone(v);return this;},async update(){return this;},testUserPermission(u){return u.isGM;}};journal.push(d);return d;};
globalThis.JournalEntry={create:async x=>doc(x.name,x.flags??{}),updateDocuments:async()=>[]};

const faction=makeFaction({id:'FACTION-TEST-A',trackId:'RENOWN-TEST-A',name:'[TEST] Guild A'});
const deity=makeDeity({id:'DEITY-TEST-A',trackId:'RENOWN-TEST-A-D',name:'[TEST] God A'});
doc('[TEST] Guild A',{[ns]:{faction}});
doc('[TEST] God A',{[ns]:{faction:deity}});
const standing=(score,why)=>adjustStanding({opening_score:0,score:0,events:[]},{delta:score,reason:why,eventId:'RENOWN-EVT-TEST-1',when:'2026-01-01T00:00:00.000Z'}).standing;
const group=makeGroupRecord({factionId:'FACTION-TEST-A',standing:standing(4,'[TEST] group deed')});
group.membership={party:true,actors:['ACT1']};group.discovery={party:true,actors:['ACT1']};
group.claims={'REWARD-TEST':{status:'claimed',reward_id:'REWARD-TEST',milestone_id:'M'}};group.requests={R1:{reward_id:'REWARD-TEST',status:'requested'}};group.uses={'REWARD-TEST':{consumed:1}};group.choices={M:'REWARD-TEST'};
group.knowledge={'ENTRY-1':{party:true,actors:['ACT1']}};group.field_reveals={mode:'selective',fields:{name:{party:true,actors:['ACT1']},leader:{party:false,actors:[]},public_role:{party:false,actors:[]}}};
doc('Faction State • group',{[ns]:{groupClaims:group}});
const personal=makePersonalRecord({factionId:'FACTION-TEST-A',actorId:'ACT1'});personal.standing=standing(7,'[TEST] personal deed');
doc('Faction State • ACT1 / A',{[ns]:{individual:personal}});
const piety=makePersonalRecord({factionId:'DEITY-TEST-A',actorId:'ACT1'});piety.standing=standing(3,'[TEST] piety');
doc('Faction State • ACT1 / God',{[ns]:{individual:piety}});
const gone=makePersonalRecord({factionId:'FACTION-TEST-A',actorId:'ACT-GONE'});
doc('Faction State • gone',{[ns]:{individual:gone}});
const mkActor=(id,name,flags={})=>({id,name,type:'character',flags:{[ns]:flags},getFlag(m,k){return this.flags[m]?.[k];},testUserPermission(){return false;}});
const actors=[mkActor('ACT1','[TEST] Hero',{vow:{deity_id:'DEITY-TEST-A',sworn_at:'2026-01-02T00:00:00.000Z'},vowLog:[{at:'2026-01-02T00:00:00.000Z',event:'sworn',deity_id:'DEITY-TEST-A'}]}),mkActor('ACT2','[TEST] Idle')];
actors.get=id=>actors.find(a=>a.id===id)??null;
const gm={id:'gm',name:'GM',isGM:true,active:true},p1={id:'p1',name:'P1',isGM:false,active:true};
const users=[gm,p1];users.get=id=>users.find(x=>x.id===id);
const mod={api:null};
globalThis.game={user:gm,users,actors,journal,folders,modules:{get:()=>mod},settings:{register:()=>{},get:(m,k)=>k==='playerAccessEnabled'?true:'',set:async()=>true},socket:{on:()=>{},emit:()=>{}}};
globalThis.ui={actors:{},notifications:{info:()=>{},warn:()=>{},error:()=>{}}};
await import('../scripts/module.mjs');hooks.get('init')();hooks.get('ready')();
await new Promise(r=>setTimeout(r,30));

test('exportState has exactly schema_version, factions and personal, and no timestamp or definition text',()=>{
  assert.equal(typeof mod.api.exportState,'function');
  const out=mod.api.exportState();
  assert.deepEqual(Object.keys(out),['schema_version','factions','personal']);
  assert.equal(out.schema_version,'ag-factions-state-export/0.1');assert.equal(STATE_EXPORT_SCHEMA,out.schema_version);
  assert.equal('exportedAt' in out,false);
  assert.doesNotThrow(()=>JSON.parse(JSON.stringify(out)));
  assert.deepEqual(out.factions.map(f=>f.id),['DEITY-TEST-A','FACTION-TEST-A']);
  const text=JSON.stringify(out);
  for(const k of ['milestones','"rewards"','"entries"','"refs"','"provenance"','"tags"'])assert.equal(text.includes(k),false,k);
});
test('faction group state: standing, rank position, claims, requests, uses, choices, reveals, membership, with actor names',()=>{
  const f=mod.api.exportState().factions.find(x=>x.id==='FACTION-TEST-A');
  assert.equal(f.kind,'faction');assert.equal(f.name,'[TEST] Guild A');assert.equal(f.renown_track_id,'RENOWN-TEST-A');assert.equal(f.individual_track_id,'RENOWN-TEST-A-IND');
  assert.equal(f.group.standing.score,4);assert.equal(f.group.standing.events.length,1);
  assert.equal(f.group.progress.rank,'Recognized');assert.equal(f.group.progress.rank_index,1);assert.equal(f.group.progress.next_rank,'Trusted');assert.equal(f.group.progress.remaining,2);
  assert.equal(f.group.claims['REWARD-TEST'].status,'claimed');assert.equal(f.group.requests.R1.status,'requested');assert.equal(f.group.uses['REWARD-TEST'].consumed,1);assert.equal(f.group.choices.M,'REWARD-TEST');
  assert.deepEqual(f.group.membership,{party:true,actors:['ACT1']});assert.deepEqual(f.group.discovery,{party:true,actors:['ACT1']});
  assert.deepEqual(f.group.knowledge['ENTRY-1'],{party:true,actors:['ACT1']});assert.equal(f.group.field_reveals.fields.name.party,true);
  assert.deepEqual(f.group.actor_names,{ACT1:'[TEST] Hero'});
  for(const k of ['id','entity_type','scope','version','faction_id'])assert.equal(k in f.group,false,`${k} is not repeated inside group`);
});
test('characters: Vow, Vow log, personal standing and deity piety sit beside actor id and name; a missing actor has a null name',()=>{
  const out=mod.api.exportState();
  const hero=out.personal.find(p=>p.actor_id==='ACT1');
  assert.equal(hero.actor_name,'[TEST] Hero');
  assert.deepEqual(hero.vow,{deity_id:'DEITY-TEST-A',sworn_at:'2026-01-02T00:00:00.000Z',deity_name:'[TEST] God A'});
  assert.equal(hero.vow_log.length,1);
  assert.deepEqual(hero.factions.map(x=>x.faction_id),['DEITY-TEST-A','FACTION-TEST-A']);
  const g=hero.factions.find(x=>x.faction_id==='FACTION-TEST-A'),d=hero.factions.find(x=>x.faction_id==='DEITY-TEST-A');
  assert.equal(g.standing.score,7);assert.equal(g.progress.rank,'Trusted');assert.equal(g.kind,'faction');assert.equal(g.faction_name,'[TEST] Guild A');
  assert.equal(d.kind,'deity');assert.equal(d.standing.score,3);assert.equal(d.progress.rank_index,1);
  assert.equal(out.personal.some(p=>p.actor_id==='ACT2'),false,'a character with no state and no Vow is not listed');
  assert.equal(out.personal.find(p=>p.actor_id==='ACT-GONE').actor_name,null);
});
test('exportState is refused for players, in the api and in the builder',()=>{
  game.user=p1;
  assert.throws(()=>mod.api.exportState(),/GM authorization required/);
  game.user=gm;
  assert.throws(()=>buildStateExport({isGM:false}),/GM authorization required/);
  assert.throws(()=>buildStateExport({isGM:'yes'}),/GM authorization required/);
});
test('exportState writes nothing and the same state gives the same bytes',()=>{
  const before=JSON.stringify(journal.map(d=>d.flags));
  const a=JSON.stringify(mod.api.exportState()),b=JSON.stringify(mod.api.exportState());
  assert.equal(a,b);assert.equal(JSON.stringify(journal.map(d=>d.flags)),before);
});
test('wiring: shipped since 0.27.0 and the api and README list it',()=>{
  const m=JSON.parse(fs.readFileSync(new URL('../module.json',import.meta.url),'utf8'));
  assert.equal(m.version,'0.28.0');assert.ok(m.download.endsWith('/ashen-gate-factions-v0.28.0/ashen-gate-factions.zip'));
  assert.match(fs.readFileSync(new URL('../README.md',import.meta.url),'utf8'),/exportState\(\)/);
  assert.match(fs.readFileSync(new URL('../CHANGELOG.md',import.meta.url),'utf8'),/^## 0\.27\.0/m);
});
