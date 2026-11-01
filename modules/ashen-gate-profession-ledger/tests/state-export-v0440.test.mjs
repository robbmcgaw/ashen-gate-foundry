// 0.44.0 api.exportState(): professions, recipes, favourites, roster and gathering node templates as plain JSON, GM only.
// Mocked Foundry; synthetic [TEST] data only; proves logic, not the live UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {buildStateExport,STATE_EXPORT_SCHEMA} from '../scripts/state-export.mjs';
let hooks={},api,writes=0;
const ID='ashen-gate-profession-ledger';
const values={partyRoster:['zed','gone'],playerAccessEnabled:true,libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]}};
const gm={id:'gm',isGM:true,name:'GM'},owner={id:'u1',isGM:false,name:'Owner'};
globalThis.foundry={applications:{api:{ApplicationV2:class{render(){return this;}},HandlebarsApplicationMixin:c=>c,DialogV2:{wait:async()=>true}}},utils:{escapeHTML:s=>String(s)}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:()=>{}};
globalThis.ui={notifications:{info:()=>{},error:()=>{}}};
const source=(id,type,name)=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility:'player',status:'approved',definition:{name}}}});
const items=(...xs)=>Object.assign(xs,{get:id=>xs.find(x=>x.id===id)});
const actorOf=(id,name,inv,flags={},type='character')=>({id,name,type,items:inv,flags:{[ID]:flags},testUserPermission:(u)=>u.isGM,setFlag(){writes++;throw Error('write attempted');}});
const herb={id:'p1',name:'Herbalism',type:'feat',system:{quantity:1},flags:source('PROF-TEST-HERBALISM','Profession','[TEST] Herbalism')};
const mining={id:'p2',name:'Mining',type:'feat',system:{quantity:1},flags:source('PROF-TEST-MINING','Profession','[TEST] Mining')};
const progress={schema:'ag-profession-actor-progress/0.1',professions:{'PROF-TEST-HERBALISM':{xp:5,selectedPerkIds:['PERK-TEST-B','PERK-TEST-A'],history:[{kind:'award',at:1},{kind:'award',at:2}]}}};
const zed=actorOf('zed','[TEST] Zed',items(mining,herb),{professionProgress:progress,knownRecipes:['REC-TEST-B','REC-TEST-A','REC-TEST-A'],favorites:{professions:['PROF-TEST-MINING'],recipes:['REC-TEST-A']}});
const amy=actorOf('amy','[TEST] Amy',items(),{knownRecipes:['REC-TEST-C']});
const idle=actorOf('idle','[TEST] Idle',items());
const npc=actorOf('npc','[TEST] Npc',items(herb),{},'npc');
const backup=actorOf('bak','[TEST] Backup',items(herb),{});backup.flags['ashen-gate-character-hub']={levelBackup:{sourceActorId:'zed',level:3}};
const nodeFlag={schema:'ag-gathering-nodes/1',nodes:[
  {id:'NODE-TEST-REEDS',name:'[TEST] River Reeds',activity:'herbalism',tier:{min:1,max:2},note:'GM note',materials:{common:[{materialId:'MAT-TEST-HERB',quantity:2}],rare:[],exotic:[]},meta:{origin:'gm',edited:true,createdAt:111,updatedAt:222}},
  {id:'NODE-TEST-ORE',name:'[TEST] Ore Seam',activity:'mining',tier:{min:1,max:1},materials:{common:[{materialId:'MAT-TEST-ORE',quantity:1}],rare:[],exotic:[]},meta:{origin:'import',edited:false,createdAt:333,updatedAt:444}}],
  retiredIds:['NODE-TEST-OLD'],migrated:[],migrations:[],migrationVersion:0};
const gmDoc={id:'gmdata',getFlag:(m,k)=>m===ID?(k==='role'?'gm-data':k==='gatheringNodes'?nodeFlag:undefined):undefined,update(){writes++;throw Error('write attempted');}};
const moduleObj={active:true};
globalThis.game={user:gm,actors:{contents:[zed,idle,amy,npc,backup],get:id=>[zed,idle,amy,npc,backup].find(a=>a.id===id)},users:{contents:[gm,owner]},items:items(),journal:[gmDoc],
 modules:{get:id=>id===ID?moduleObj:undefined},
 settings:{register:()=>{},registerMenu:()=>{},get:(id,key)=>values[key],set:async()=>{writes++;}}};
await import(pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js')));hooks.init();hooks.ready();api=moduleObj.api;

test('shape: schema_version, roster, characters, gathering_nodes only; no timestamps; plain JSON',()=>{
  game.user=gm;const out=api.exportState();
  assert.deepEqual(Object.keys(out),['schema_version','roster','characters','gathering_nodes']);
  assert.equal(out.schema_version,'ag-ledger-state-export/0.1');assert.equal(STATE_EXPORT_SCHEMA,out.schema_version);
  assert.equal('exportedAt' in out,false);
  const text=JSON.stringify(out);for(const k of ['createdAt','updatedAt','exportedAt','"at"','111','222'])assert.equal(text.includes(k),false,k);
  assert.deepEqual(JSON.parse(text),out);
});
test('characters: professions with level, xp, tier and perk ids; recipes; favourites; sorted; NPC, backup and empty characters left out',()=>{
  game.user=gm;const {characters}=api.exportState();
  assert.deepEqual(characters.map(c=>c.actor_name),['[TEST] Amy','[TEST] Zed']);
  const z=characters[1];assert.equal(z.actor_id,'zed');
  assert.deepEqual(z.professions.map(p=>p.profession_id),['PROF-TEST-HERBALISM','PROF-TEST-MINING']);
  assert.deepEqual(z.professions[0],{profession_id:'PROF-TEST-HERBALISM',name:'[TEST] Herbalism',level:2,xp:5,tier:'Apprentice',tracked:true,selected_perk_ids:['PERK-TEST-A','PERK-TEST-B'],unspent_perk_choices:0,history_length:2});
  assert.deepEqual([z.professions[1].level,z.professions[1].xp,z.professions[1].tracked,z.professions[1].history_length],[1,0,false,0]);
  assert.deepEqual(z.known_recipe_ids,['REC-TEST-A','REC-TEST-B']);
  assert.deepEqual(z.favorites,{professions:['PROF-TEST-MINING'],recipes:['REC-TEST-A']});
  assert.deepEqual(characters[0].professions,[]);assert.deepEqual(characters[0].known_recipe_ids,['REC-TEST-C']);
});
test('roster selection keeps ids, with names where the character still exists',()=>{
  game.user=gm;assert.deepEqual(api.exportState().roster,[{actor_id:'gone',actor_name:null},{actor_id:'zed',actor_name:'[TEST] Zed'}]);
});
test('gathering nodes: the GM-edited templates, sorted by id, with origin and edited; retired ids',()=>{
  game.user=gm;const {gathering_nodes:g}=api.exportState();
  assert.deepEqual(g.templates.map(t=>t.id),['NODE-TEST-ORE','NODE-TEST-REEDS']);
  const r=g.templates[1];assert.equal(r.name,'[TEST] River Reeds');assert.equal(r.activity,'herbalism');assert.deepEqual(r.tier,{min:1,max:2});assert.equal(r.note,'GM note');
  assert.deepEqual([r.origin,r.edited,g.templates[0].origin,g.templates[0].edited],['gm',true,'import',false]);
  assert.deepEqual(r.materials.common,[{materialId:'MAT-TEST-HERB',quantity:2,chance:null}]);
  assert.deepEqual(g.retired_ids,['NODE-TEST-OLD']);
});
test('GM only: API and builder both refuse a player',()=>{
  game.user=owner;assert.throws(()=>api.exportState(),/Only the GM/);
  assert.throws(()=>buildStateExport({isGM:false}),/GM authorization/);assert.throws(()=>buildStateExport({}),/GM authorization/);
  game.user=gm;
});
test('stable and writes nothing: two runs equal, input order does not matter',async()=>{
  game.user=gm;await new Promise(r=>setTimeout(r,20));const before=writes;const a=api.exportState();assert.deepEqual(api.exportState(),a);
  game.actors.contents.reverse();nodeFlag.nodes.reverse();values.partyRoster.reverse();
  try{assert.deepEqual(api.exportState(),a);}finally{game.actors.contents.reverse();nodeFlag.nodes.reverse();values.partyRoster.reverse();}
  assert.equal(writes,before,'no setting, flag or journal write');
});
test('absent data gives empty arrays, not errors',()=>{
  assert.deepEqual(buildStateExport({isGM:true}),{schema_version:STATE_EXPORT_SCHEMA,roster:[],characters:[],gathering_nodes:{templates:[],retired_ids:[]}});
  game.user=gm;const saved=[game.journal.splice(0),values.partyRoster,game.actors.contents.splice(0)];values.partyRoster=[];
  try{assert.deepEqual(api.exportState(),{schema_version:STATE_EXPORT_SCHEMA,roster:[],characters:[],gathering_nodes:{templates:[],retired_ids:[]}});}
  finally{game.journal.push(...saved[0]);values.partyRoster=saved[1];game.actors.contents.push(...saved[2]);}
});
test('feature-detect: exportState is a function on the api',()=>{assert.equal(typeof api.exportState,'function');});
