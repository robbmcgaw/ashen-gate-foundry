/** 0.16.1: Renown shows no canonical ids in normal views. NOT a browser test: it renders what can be rendered in
 * node (embed HTML, labels, rows, messages, notifications) and scans the template source for id fields printed as
 * text or in a title/tooltip/aria-label/placeholder. Ids may remain in data-* wiring and in GM Details folds. */
import assert from 'node:assert/strict';
import nodeTest from 'node:test';
import {readFileSync} from 'node:fs';
import {assertNoIds,visibleText} from '../../../scripts/test-helpers/no-ids.mjs';
import {makeFaction,blankStanding,adjustStanding} from '../scripts/core.mjs';
import {orgRow,objectiveLabel,objectiveStatusLabel} from '../scripts/orgs-tab.mjs';
import {knockOns} from '../scripts/deity.mjs';
import {makeDeity,validateDeityParts} from '../scripts/deity.mjs';
import {validateObjectiveRef,checkObjectiveRefs,objectiveKind} from '../scripts/objective-refs.mjs';
import {planImport,IMPORT_SCHEMA} from '../scripts/import.mjs';

const hooks=new Map();
globalThis.Hooks={on:(n,fn)=>hooks.set(n,fn),once:(n,fn)=>hooks.set(n,fn)};
globalThis.HTMLElement=class{};
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{NONE:0,OBSERVER:2,OWNER:3}};
class V2{async render(){return this;}async close(){return this;}async _prepareContext(){return{};}async _onRender(){}}
let ctr=1;
globalThis.foundry={applications:{api:{ApplicationV2:V2,HandlebarsApplicationMixin:C=>C}},utils:{randomID:()=>String(ctr++).padStart(24,'A')}};
const journal=[];journal.get=id=>journal.find(d=>d.id===id);
globalThis.Folder={create:async d=>({id:'F1',name:d.name,type:d.type,flags:structuredClone(d.flags??{}),getFlag(m,k){return this.flags[m]?.[k]}})};
let count=0;
function makeDoc(data){const doc={id:'J'+(++count),name:data.name,folder:data.folder??null,flags:structuredClone(data.flags??{}),ownership:structuredClone(data.ownership??{default:0}),
  getFlag(m,k){return this.flags[m]?.[k]},async setFlag(m,k,v){this.flags[m]??={};this.flags[m][k]=structuredClone(v);return this;},
  async update(p){for(const [key,val] of Object.entries(p)){if(!key.startsWith('flags.'))continue;const [,m,f]=key.split('.');this.flags[m]??={};this.flags[m][f]=structuredClone(val);}return this;},
  testUserPermission(u,l){return Boolean(u.isGM||(this.ownership[u.id]??this.ownership.default)>=l);}};journal.push(doc);return doc;}
globalThis.JournalEntry={create:async x=>makeDoc(x),updateDocuments:async rows=>rows};
const gm={id:'gm',name:'GM',isGM:true,active:true},p1={id:'p1',name:'Player One',isGM:false,active:true};
const users=[gm,p1];users.get=id=>users.find(x=>x.id===id);
const actor1={id:'A1',name:'[TEST] Hero',type:'character',ownership:{p1:3},items:[],testUserPermission(u,l){return u.isGM||this.ownership[u.id]>=l;}};
const actors=[actor1];actors.get=id=>actors.find(x=>x.id===id);
const settings={},notify=[],mod={api:null,version:'9.9.9'};
globalThis.game={user:gm,users,actors,journal,folders:[],modules:{get:()=>mod},settings:{register:(m,k,v)=>{settings[k]=v.default;},get:(m,k)=>settings[k],set:async(m,k,v)=>settings[k]=v},socket:{on(){},emit(){}}};
globalThis.ui={actors:{},notifications:{info:s=>notify.push(s),warn:s=>notify.push(s),error:s=>notify.push('ERROR '+s)}};
const ns='ashen-gate-factions';
const guild=makeFaction({id:'FACTION-NOID-G',trackId:'RENOWN-NOID-G',name:'[TEST] Guild'});
guild.state={party:adjustStanding(blankStanding(),{delta:4,reason:'[TEST] deed',eventId:'RENOWN-EVT-1',when:'2026-01-01T00:00:00Z'}).standing,individual:{}};
guild.discovery={party:true,actors:[],placeholder:false,sharing_enabled:false};
makeDoc({name:guild.name,ownership:{default:2},flags:{[ns]:{faction:guild}}});
await import('../scripts/module.mjs');hooks.get('init')();hooks.get('ready')();
await new Promise(r=>setTimeout(r,30));

const embedOf=user=>{game.user=user;let html='';const el={innerHTML:'',isConnected:true,classList:{add(){},remove(){}},addEventListener(){},contains:()=>true};mod.api.embed.mount(el,{actorId:'A1',mode:'character'});html=el.innerHTML;game.user=gm;return html;};

nodeTest('embed (GM and player) shows names, never ids',()=>{
  for(const [who,u] of [['GM',gm],['player',p1]]){const html=embedOf(u);assert.match(html,/\[TEST\] Guild/);assertNoIds(html,`Renown embed for ${who}`);}
});
nodeTest('roster rows, labels and messages show display names, not ids',()=>{
  const f=makeFaction({id:'FACTION-NOID-X',trackId:'RENOWN-NOID-X',name:''});
  const row=orgRow({faction:f});
  assert.equal(row.name,'Unnamed faction');assertNoIds(row.name,'unnamed roster row');
  assert.ok(row.search.includes(f.id.toLowerCase()),'search may still match the id');
  const names=new Map();const sun=makeDeity({id:'DEITY-NOID-SUN',trackId:'RENOWN-NOID-SUN',name:'[TEST] Sun'});
  sun.deity.relations=[{deity_id:'DEITY-NOID-GONE',resonance:1}];
  assert.equal(knockOns(sun,10,0.5,names)[0].name,'Unknown deity');
  for(const msg of validateDeityParts(sun))assertNoIds(msg,'deity validation message');
  const bad={...sun,deity:{...sun.deity,relations:[{deity_id:'nope',resonance:1},{deity_id:'DEITY-NOID-GONE',resonance:1},{deity_id:'DEITY-NOID-GONE',resonance:1}]}};
  for(const msg of validateDeityParts(bad))assertNoIds(msg,'deity relation message');
  assert.throws(()=>validateObjectiveRef({relation:'associated_objective',target_id:'bad',mode:'optional'}),e=>{assertNoIds(e.message,'objective id error');return true;});
  const ref={relation:'associated_objective',target_id:'QUEST-NOID-ONE',mode:'optional'};
  for(const msg of checkObjectiveRefs({refs:[ref,ref]}))assertNoIds(msg,'duplicate objective message');
  assert.equal(objectiveKind('QUEST-NOID-ONE'),'Quest');assert.equal(objectiveKind('ORDER-NOID-ONE'),'Work order');assert.equal(objectiveKind('CONTRACT-NOID-ONE'),'Contract');
  assertNoIds(`${objectiveKind(ref.target_id)} ${objectiveLabel(ref.relation,ref.mode)} ${objectiveStatusLabel('unverified')}`,'objective row text');
});
nodeTest('import errors name the record, not its id',()=>{
  const def=makeFaction({id:'FACTION-NOID-I',trackId:'RENOWN-NOID-I',name:'[TEST] Imported'});
  const data={schema_version:IMPORT_SCHEMA,definitions:[def,def],starting_state:[{faction_id:'FACTION-NOID-ORPHAN'},{faction_id:'FACTION-NOID-ORPHAN'}]};
  const {errors}=planImport(data);
  assert.ok(errors.length>0);for(const e of errors)assertNoIds(e,'import error');
});
nodeTest('dashboard template prints no id field as text, title, tooltip, aria-label or placeholder',()=>{
  const raw=readFileSync(new URL('../templates/dashboard.hbs',import.meta.url),'utf8');
  // GM-only Details folds (id plus Copy id) are the one allowed place.
  const folds=raw.match(/<details class="agf-details">[\s\S]*?<\/details>/g)??[];
  assert.ok(folds.length>=2,'Details folds exist for the GM');
  for(const fold of folds)assert.match(fold,/Copy id/);
  const open=raw.indexOf('{{#if isGM}}');assert.ok(open>0);
  const stripped=raw.replace(/<details class="agf-details">[\s\S]*?<\/details>/g,'');
  const shown=visibleText(stripped);
  const hits=[...shown.matchAll(/\{\{[^#/>!^@][^}]*\}\}/g)].map(m=>m[0]).filter(t=>/\b(\w*_id|itemId|rowItemId|uuid|docId|factionId|deityId|key|requestKey)\b|\bid\b/.test(t));
  assert.deepEqual(hits,[],'id fields shown to users');
  assert.doesNotMatch(shown,/\b(QUEST|ORDER|CONTRACT|REC|ITEM|FACTION|DEITY|RENOWN)-/,'literal id prefixes in the template text');
  assertNoIds(shown,'dashboard template text');
});
