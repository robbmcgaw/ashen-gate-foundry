/** 0.18.0 Renown import update mode. In-memory Foundry V14-shaped test (mocked globals): proves logic, not the live Foundry UI.
 * Synthetic ids and [TEST] names only: this repository is public. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeFaction,sourceDefinition} from '../scripts/core.mjs';
import {makeDeity} from '../scripts/deity.mjs';
import {planImport,runImport,IMPORT_SCHEMA} from '../scripts/import.mjs';
import {definitionHash,diffDefinitions,droppedState,replaceDelta} from '../scripts/update.mjs';

const hooks=new Map();
globalThis.Hooks={on:(n,f)=>hooks.set(n,f),once:(n,f)=>hooks.set(n,f)};
globalThis.HTMLElement=class{};
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{NONE:0,OBSERVER:2,OWNER:3}};
class V2{async render(){return this;}async close(){return this;}async _prepareContext(){return{};}async _onRender(){}}
let ctr=1;
globalThis.foundry={applications:{api:{ApplicationV2:V2,HandlebarsApplicationMixin:C=>C,DialogV2:{wait:async()=>null}}},utils:{randomID:()=>String(ctr++).padStart(24,'A')}};
const journal=[];journal.get=id=>journal.find(d=>d.id===id);
const folders=[];
globalThis.Folder={create:async d=>{const f={id:'F'+(folders.length+1),name:d.name,type:d.type,flags:structuredClone(d.flags??{}),getFlag(m,k){return this.flags[m]?.[k];}};folders.push(f);return f;}};
const isObj=v=>v&&typeof v==='object'&&!Array.isArray(v);
function merge(t,s){for(const [k,v] of Object.entries(s)){if(k.startsWith('-=')){delete t[k.slice(2)];continue;}if(isObj(v)&&isObj(t[k]))merge(t[k],v);else t[k]=structuredClone(v);}return t;}
let count=0,failCreate=null;
function makeDoc(data){const doc={id:'J'+(++count),name:data.name,folder:data.folder??null,flags:structuredClone(data.flags??{}),ownership:structuredClone(data.ownership??{default:0}),
  getFlag(m,k){return this.flags[m]?.[k];},
  async setFlag(m,k,v){this.flags[m]??={};this.flags[m][k]=isObj(v)&&isObj(this.flags[m][k])?merge(this.flags[m][k],structuredClone(v)):structuredClone(v);return this;},
  async update(p){if(p.name!==undefined)this.name=p.name;if(p.ownership)this.ownership=structuredClone(p.ownership);
    for(const [key,val] of Object.entries(p)){if(!key.startsWith('flags.'))continue;const [,m,...rest]=key.split('.');this.flags[m]??={};
      let t=this.flags[m];while(rest.length>1){t=t[rest.shift()]??={};}const last=rest[0];
      if(last.startsWith('-='))delete t[last.slice(2)];else if(isObj(val)&&isObj(t[last]))merge(t[last],val);else t[last]=structuredClone(val);}return this;},
  testUserPermission(u,l){return Boolean(u.isGM||(this.ownership[u.id]??this.ownership.default)>=l);}};journal.push(doc);return doc;}
globalThis.JournalEntry={create:async x=>{if(failCreate&&x.flags?.['ashen-gate-factions']?.importSnapshot)throw Error(failCreate);return makeDoc(x);},updateDocuments:async rows=>{for(const r of rows)await journal.get(r._id).update(r);return rows;}};
const gm={id:'gm',name:'GM',isGM:true,active:true},p1={id:'p1',name:'Player One',isGM:false,active:true};
const users=[gm,p1];users.get=id=>users.find(x=>x.id===id);
const actors=[{id:'A1',name:'[TEST] Hero',type:'character',ownership:{p1:3},items:[],testUserPermission(u,l){return u.isGM||this.ownership[u.id]>=l;}}];actors.get=id=>actors.find(x=>x.id===id);
const settings={},mod={api:null,version:'0.18.0',active:true};
globalThis.game={user:gm,users,actors,journal,folders,modules:{get:()=>mod},settings:{register:(m,k,v)=>{settings[k]=v.default;},get:(m,k)=>settings[k],set:async(m,k,v)=>settings[k]=v},socket:{on(){},emit(){}}};
globalThis.ui={actors:{},notifications:{info(){},warn(){},error(){}}};
const ns='ashen-gate-factions';

const entry=(id,name,extra={})=>({id,name,text:`${name} text`,link_mode:'preview',unlock:'manual',...extra});
const reward=(id,ms,aud='group',extra={})=>({id,key:id.toLowerCase(),name:`[TEST] ${id}`,kind:'custom',behavior:'one_time',audience:aud,milestone_id:ms,description:'',teaser:'',tags:[],usage_limit:0,...extra});
function faction(key,{entries=[],rewards=[],name=`[TEST] Guild ${key}`}={}){
  const f=makeFaction({id:`FACTION-QA-${key}`,trackId:`RENOWN-QA-${key}`,name});f.entries=entries;f.rewards=rewards;return sourceDefinition(f);
}
const deity=(key,name=`[TEST] Deity ${key}`)=>sourceDefinition(makeDeity({id:`DEITY-QA-${key}`,trackId:`RENOWN-QA-${key}`,name}));
const file=(...defs)=>({schema_version:IMPORT_SCHEMA,definitions:defs});

// ---- the old world: two factions and a deity with real campaign state ----
const oldA=faction('A',{entries:[entry('E-KEEP','Keep'),entry('E-GONE','Gone')],rewards:[reward('R-KEEP','RENOWN-QA-A-M2'),reward('R-GONE','RENOWN-QA-A-M3'),reward('R-CHOOSE1','RENOWN-QA-A-M2')]});
oldA.renown_track.milestones[1].selection_mode='choose_one';
const oldD=deity('SUN');
const docA=makeDoc({name:oldA.name,flags:{[ns]:{faction:oldA}}}),docB=makeDoc({name:'[TEST] Guild B',flags:{[ns]:{faction:faction('B')}}}),docD=makeDoc({name:oldD.name,flags:{[ns]:{faction:oldD}}});
await import('../scripts/module.mjs');hooks.get('init')();hooks.get('ready')();
await new Promise(r=>setTimeout(r,30));
const groupOf=id=>journal.find(d=>d.getFlag(ns,'groupClaims')?.faction_id===id);
const stateA=groupOf('FACTION-QA-A');
await stateA.setFlag(ns,'groupClaims',{...stateA.getFlag(ns,'groupClaims'),
  standing:{opening_score:0,score:4,events:[{id:'RENOWN-EVT-1',sequence:1,delta:4,reason:'[TEST] earned',occurred_at:'t',previous_score:0,score_after:4}]},
  claims:{'R-KEEP':{status:'claimed',milestone_id:'RENOWN-QA-A-M2'},'R-GONE':{status:'claimed',milestone_id:'RENOWN-QA-A-M3'}},
  requests:{'REQ-1':{reward_id:'R-GONE',status:'requested'}},uses:{'R-KEEP':{consumed:2,reset_count:1}},choices:{'RENOWN-QA-A-M2':'R-CHOOSE1'},
  discovery:{party:true,actors:['A1']},knowledge:{'E-KEEP':{party:true,actors:['A1']},'E-GONE':{party:true,actors:[]}}});
const stateOf=id=>structuredClone(groupOf(id).getFlag(ns,'groupClaims'));
const stateBefore=JSON.stringify(stateOf('FACTION-QA-A'));
const stored=id=>journal.find(d=>d.getFlag(ns,'faction')?.id===id);

// ---- the new package: A rebalanced, one new entry/reward, one dropped; B identical; deity rewritten; C is new ----
const newA=faction('A',{name:'[TEST] Guild A (renamed)',entries:[entry('E-KEEP','Keep',{text:'rewritten'}),entry('E-NEW','Fresh')],rewards:[reward('R-KEEP','RENOWN-QA-A-M2',undefined,{description:'new text'}),reward('R-CHOOSE1','RENOWN-QA-A-M2'),reward('R-NEW','RENOWN-QA-A-M4')]});
newA.renown_track.milestones[1].selection_mode='choose_one';newA.renown_track.milestones[2].threshold=7;newA.individual_track.milestones[1].benefit='[TEST] better benefit';
const newD=deity('SUN','[TEST] Deity SUN (rebalanced)');newD.tags=['rebalanced'];
const pkg=()=>file(newA,faction('B'),newD,faction('C'));

test('default call is skip and changes nothing for existing records (old callers)',async()=>{
  const before=JSON.stringify(journal.map(d=>d.flags));
  const prev=mod.api.previewFactionsImport(pkg());
  assert.deepEqual(prev.rows.map(r=>r.action),['skip','skip','skip','new']);
  const res=await mod.api.importFactions(pkg(),{});
  assert.deepEqual([res.added.length,res.updated.length,res.skipped.length],[1,0,3]);
  assert.equal(stored('FACTION-QA-A').getFlag(ns,'faction').name,'[TEST] Guild A');
  assert.throws(()=>mod.api.previewFactionsImport(pkg(),{mode:'replace'}),/mode must be skip or update/);
  // remove the one added faction again so the update tests start from the same world
  const c=stored('FACTION-QA-C');journal.splice(journal.indexOf(c),1);const cg=groupOf('FACTION-QA-C');journal.splice(journal.indexOf(cg),1);
  void before;
});

test('API exposes the import contract for Manager to feature-detect',()=>{
  assert.deepEqual([...mod.api.importOptions.modes],['skip','update']);assert.equal(mod.api.importOptions.contract,'ag-renown-import/1');
});

test('preview in update mode: Create / Update (with what changes) / Unchanged, and writes nothing',()=>{
  const before=JSON.stringify(journal.map(d=>d.flags));
  const prev=mod.api.previewFactionsImport(pkg(),{mode:'update'});
  assert.deepEqual(prev.errors,[]);
  const by=Object.fromEntries(prev.rows.map(r=>[r.id,r]));
  assert.equal(by['FACTION-QA-A'].action,'update');
  const c=by['FACTION-QA-A'].changes;
  assert.deepEqual(c.fields,['name']);
  assert.deepEqual([c.milestones.changed.length,c.rewards.added.length,c.rewards.removed.length,c.rewards.changed.length,c.entries.added.length,c.entries.removed.length,c.entries.changed.length],[2,1,1,1,1,1,1]);
  assert.match(by['FACTION-QA-A'].reason,/rewards 1 added, 1 removed, 1 changed/);
  assert.deepEqual(by['FACTION-QA-A'].no_longer_defined.sort(),['entry E-GONE','reward R-GONE']);
  assert.equal(by['FACTION-QA-B'].action,'unchanged');
  assert.equal(by['DEITY-QA-SUN'].action,'update');assert.deepEqual(by['DEITY-QA-SUN'].changes.fields,['name','tags']);
  assert.equal(by['FACTION-QA-C'].action,'new');
  assert.equal(JSON.stringify(journal.map(d=>d.flags)),before,'preview writes nothing');
});

test('players are refused in preview and import (data layer)',async()=>{
  game.user=p1;
  try{
    assert.throws(()=>mod.api.previewFactionsImport(pkg(),{mode:'update'}),/GM authorization/);
    await assert.rejects(mod.api.importFactions(pkg(),{mode:'update'}),/GM authorization/);
  }finally{game.user=gm;}
  assert.equal(stored('FACTION-QA-A').getFlag(ns,'faction').name,'[TEST] Guild A');
});

test('a snapshot that cannot be saved aborts before any write',async()=>{
  const before=JSON.stringify(journal.map(d=>d.flags)),n=journal.length;
  failCreate='disk full';
  try{await assert.rejects(mod.api.importFactions(pkg(),{mode:'update'}),/Import stopped before changing anything.*disk full/);}finally{failCreate=null;}
  assert.equal(JSON.stringify(journal.map(d=>d.flags)),before);assert.equal(journal.length,n,'not even the new faction was created');
});

let result;
test('update rewrites definitions, saves a snapshot first, and keeps every piece of campaign state',async()=>{
  result=await mod.api.importFactions(pkg(),{mode:'update'});
  assert.deepEqual(result.failed,[]);
  assert.deepEqual([result.added.length,result.updated.length,result.unchanged.length],[1,2,1]);
  assert.equal(result.snapshot.count,2);
  const snap=journal.find(d=>d.getFlag(ns,'importSnapshot'));
  assert.ok(snap);assert.equal(snap.ownership.default,0,'GM only');
  assert.deepEqual(snap.getFlag(ns,'importSnapshot').definitions.map(d=>d.id),['FACTION-QA-A','DEITY-QA-SUN']);
  assert.equal(snap.getFlag(ns,'importSnapshot').definitions[0].name,'[TEST] Guild A','the snapshot holds the OLD definition');
  const a=stored('FACTION-QA-A').getFlag(ns,'faction');
  assert.equal(a.name,'[TEST] Guild A (renamed)');assert.equal(stored('FACTION-QA-A').name,'[TEST] Guild A (renamed)');
  assert.deepEqual(a.rewards.map(r=>r.id),['R-KEEP','R-CHOOSE1','R-NEW']);assert.deepEqual(a.entries.map(e=>e.id),['E-KEEP','E-NEW']);
  assert.equal(a.renown_track.milestones[2].threshold,7);assert.equal(a.individual_track.milestones[1].benefit,'[TEST] better benefit');
  assert.equal(stored('DEITY-QA-SUN').getFlag(ns,'faction').tags[0],'rebalanced');
  // campaign state: standings, claims, requests, uses, choices, discovery and knowledge are untouched (dropped ids stay, too)
  const after=stateOf('FACTION-QA-A'),was=JSON.parse(stateBefore);
  for(const k of ['standing','claims','requests','uses','choices','discovery'])assert.deepEqual(after[k],was[k],k);
  assert.deepEqual(after.knowledge['E-KEEP'],was.knowledge['E-KEEP']);
  assert.deepEqual(after.knowledge['E-GONE'],was.knowledge['E-GONE'],'knowledge of a dropped entry is kept');
  assert.deepEqual(after.knowledge['E-NEW'],{party:false,actors:[]},'a new entry starts empty');
  // reported as no longer defined
  assert.ok(result.notes.some(n=>n.includes('reward R-GONE')&&n.includes('no longer defined')));
  assert.ok(result.notes.some(n=>n.includes('entry E-GONE')));
  assert.equal(stored('FACTION-QA-C')?.getFlag(ns,'faction').name,'[TEST] Guild C');
});

test('idempotent: the same package a second time changes nothing and takes no new snapshot',async()=>{
  const snaps=journal.filter(d=>d.getFlag(ns,'importSnapshot')).length,flags=JSON.stringify(journal.map(d=>d.flags));
  const prev=mod.api.previewFactionsImport(pkg(),{mode:'update'});
  assert.deepEqual(prev.rows.map(r=>r.action),['unchanged','unchanged','unchanged','unchanged']);
  const res=await mod.api.importFactions(pkg(),{mode:'update'});
  assert.deepEqual([res.added.length,res.updated.length,res.unchanged.length,res.snapshot],[0,0,4,null]);
  assert.equal(journal.filter(d=>d.getFlag(ns,'importSnapshot')).length,snaps);
  assert.equal(JSON.stringify(journal.map(d=>d.flags)),flags);
});

test('a definition the GM edited after the last import is kept unless Also overwrite faction edits is on',async()=>{
  const doc=stored('FACTION-QA-B'),f=structuredClone(doc.getFlag(ns,'faction'));f.public_role='[TEST] GM wrote this';
  await doc.update({[`flags.${ns}.faction`]:f});
  const changed=faction('B');changed.public_role='[TEST] package text';changed.tags=['x'];
  const p=file(changed);
  const prev=mod.api.previewFactionsImport(p,{mode:'update'});
  assert.equal(prev.rows[0].action,'kept');assert.match(prev.rows[0].reason,/Edited in this world/);
  const kept=await mod.api.importFactions(p,{mode:'update'});
  assert.deepEqual([kept.updated.length,kept.keptEdited.length],[0,1]);assert.equal(doc.getFlag(ns,'faction').public_role,'[TEST] GM wrote this');
  const over=mod.api.previewFactionsImport(p,{mode:'update',overwriteEdited:true});
  assert.equal(over.rows[0].action,'update');assert.match(over.rows[0].reason,/Your edits to it are replaced/);
  const done=await mod.api.importFactions(p,{mode:'update',overwriteEdited:true});
  assert.equal(done.updated.length,1);assert.equal(doc.getFlag(ns,'faction').public_role,'[TEST] package text');
});

test('a world with no import record (older Renown) updates, and says edits cannot be told apart',async()=>{
  const d=makeDoc({name:'[TEST] Guild Z',flags:{[ns]:{faction:faction('Z')}}});await new Promise(r=>setTimeout(r,5));
  await mod.api.refreshPlayerViews();
  const g=faction('Z');g.tags=['new'];
  const prev=mod.api.previewFactionsImport(file(g),{mode:'update'});
  assert.equal(prev.rows[0].action,'update');assert.match(prev.rows[0].reason,/No earlier import is recorded/);
  await mod.api.importFactions(file(g),{mode:'update'});
  assert.deepEqual(d.getFlag(ns,'faction').tags,['new']);
});

test('supersedes still works: the renamed entry is moved first, then update does not call that an edit',async()=>{
  const doc=stored('FACTION-QA-A'),before=stateOf('FACTION-QA-A');
  const next=structuredClone(newA);next.entries=[entry('E-KEEP2','Keep renamed',{supersedes:['E-KEEP']}),entry('E-NEW','Fresh')];
  const res=await mod.api.supersedeIds({'E-KEEP':'E-KEEP2'},{definitions:[next]});
  assert.equal(res.changed,1);
  assert.deepEqual(stateOf('FACTION-QA-A').knowledge['E-KEEP2'],before.knowledge['E-KEEP']);
  assert.equal('E-KEEP' in stateOf('FACTION-QA-A').knowledge,false);
  const prev=mod.api.previewFactionsImport(file(next),{mode:'update'});
  assert.equal(prev.rows[0].action,'unchanged',`got ${prev.rows[0].action}: ${prev.rows[0].reason}`);
  assert.deepEqual(doc.getFlag(ns,'faction').entries.map(e=>e.id),['E-KEEP2','E-NEW']);
});

test('a definition still carrying old campaign data is kept, never rewritten',()=>{
  const legacy=faction('L');legacy.entries=[entry('E-1','One')];legacy.entries[0].discovered_party=true;
  const d=makeDoc({name:'[TEST] Guild L',flags:{[ns]:{faction:legacy}}});
  const prev=mod.api.previewFactionsImport(file(faction('L')),{mode:'update'});
  assert.equal(prev.rows[0].action,'kept');assert.match(prev.rows[0].reason,/older Renown/);
  journal.splice(journal.indexOf(d),1);
});

test('pure helpers: hash ignores folder and key order; diff and dropped state are exact; strict validation stays',()=>{
  const a=faction('H'),b=structuredClone(a);b.folder_key='FOLDER-1';
  assert.equal(definitionHash(a),definitionHash(b));
  assert.equal(diffDefinitions(a,b).changed,false);
  assert.deepEqual(replaceDelta({a:1,b:{c:1,d:2}},{a:1,b:{c:1}}),{a:1,b:{c:1,'-=d':null}});
  assert.deepEqual(droppedState(oldA,newA,{group:stateOf('FACTION-QA-A'),personal:[]}).map(x=>`${x.kind}:${x.id}`).sort(),['entry:E-GONE','reward:R-GONE']);
  assert.ok(planImport(file({...faction('H'),renown_score:5}),new Set(),{mode:'update'}).errors[0].includes('unclassified'));
  assert.ok(planImport(file({...faction('H'),provenance:{sources:['x'],decision_refs:[],extra:1}}),new Set(),{mode:'update'}).errors.length);
});

test('runImport with a plan that has no snapshot support refuses to update',async()=>{
  const ex=new Map([['FACTION-QA-H',{definition:faction('H'),hash:null,legacy:false,states:{}}]]);
  const g=faction('H');g.tags=['t'];
  const plan=planImport(file(g),new Set(),{mode:'update',existing:ex});
  assert.equal(plan.rows[0].action,'update');
  const calls=[];
  await assert.rejects(runImport(plan,{assertGM(){},updateFaction:async()=>calls.push('write')}),/snapshot/);
  assert.deepEqual(calls,[]);
});
