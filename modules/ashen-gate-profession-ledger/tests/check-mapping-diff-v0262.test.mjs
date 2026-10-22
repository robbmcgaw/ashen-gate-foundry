// 0.26.2: GM Setup → Tools and checks stores only what the GM changed (the difference from the built-in defaults);
// everything else keeps coming from the defaults. Migration (checkMappingVersion 2) drops saved cells equal to today's
// default from older full tables and keeps every other saved value. Mocked Foundry: logic only, not the live UI.
import assert from 'node:assert/strict';
import test from 'node:test';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {compactCheckMapping,effectiveMapping,DEFAULT_PROFESSION_TOOLS,DEFAULT_GATHER_SKILLS} from '../scripts/checks.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const tick=()=>new Promise(r=>setTimeout(r,5));

// An old world: Save (before 0.26.2) wrote every profession's tool and skill; the GM really chose two of them.
const fullOld={tools:{...DEFAULT_PROFESSION_TOOLS,mining:'smith'},skills:{...DEFAULT_GATHER_SKILLS,herbalism:'sur'},
  qualifySkills:{herbalism:['sur']},qualifyTools:{mining:['smith']},advantageTools:{},items:{},note:'[TEST] kept'};
const hooks={},errors=[];
const values={partyRoster:[],playerAccessEnabled:true,libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]},checkMapping:structuredClone(fullOld),checkMappingVersion:1};
const gm={id:'gm',isGM:true,name:'GM',active:true};
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
class FakeApp{constructor(o={}){this.options=o;}async _prepareContext(){return {};}render(){this.rendered=true;return this;}async close(){return this;}}
globalThis.document={documentElement:{dataset:{}}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApp,HandlebarsApplicationMixin:x=>x,DialogV2:{wait:async()=>true,prompt:async()=>{}}}},utils:{escapeHTML:esc}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:()=>{}};
globalThis.ui={notifications:{info:()=>{},error:e=>errors.push(e)}};
let moduleApi=null;const mod={active:true,version:'0.26.2',get api(){return moduleApi},set api(v){moduleApi=v}};
globalThis.game={user:gm,users:{contents:[gm],get:()=>gm,activeGM:gm},items:{contents:[]},actors:{contents:[],get:()=>null},socket:{emit(){},on(){}},
  modules:{get:id=>id==='ashen-gate-profession-ledger'?mod:undefined},
  settings:{register(){},registerMenu(){},get:(i,k)=>values[k],set:async(i,k,v)=>{values[k]=structuredClone(v);}}};
await import(pathToFileURL(path.resolve(here,'../scripts/main.js')));hooks.init();hooks.ready();
await tick();

test('compactCheckMapping keeps only cells that differ from the defaults; everything else is untouched; re-runnable',()=>{
  const out=compactCheckMapping(fullOld);
  assert.deepEqual(out.tools,{mining:'smith'});assert.deepEqual(out.skills,{herbalism:'sur'});
  assert.deepEqual(out.qualifySkills,fullOld.qualifySkills,'crosswalk lists are the GM\'s own and stay');
  assert.equal(out.note,'[TEST] kept','unknown keys stay');
  assert.deepEqual(effectiveMapping(out),effectiveMapping(fullOld),'what the checks use does not change');
  assert.deepEqual(compactCheckMapping(out),out,'a second run changes nothing');
  // An explicit "none" that differs from a default stays; a custom profession stays; invalid entries are not discarded.
  const odd={tools:{alchemy:'',homebrew:'smith',mining:42},skills:{fishing:''}};
  assert.deepEqual(compactCheckMapping(odd),odd);
  // An old alias beside its current key: neither is dropped, so the one that wins today still wins.
  const both={tools:{skinning:'smith',huntingskinning:'leatherworker'}};
  assert.deepEqual(compactCheckMapping(both),both);
  assert.deepEqual(compactCheckMapping({tools:{skinning:'leatherworker'}}).tools,{},'a lone alias equal to the default is dropped');
  assert.deepEqual(compactCheckMapping({}),{});assert.deepEqual(compactCheckMapping(null),{});
});

test('migration (version 2): an old full table loses only its default cells; the GM\'s choices and lists stay',()=>{
  assert.equal(values.checkMappingVersion,2);
  assert.deepEqual(values.checkMapping.tools,{mining:'smith'});assert.deepEqual(values.checkMapping.skills,{herbalism:'sur'});
  assert.deepEqual(values.checkMapping.qualifyTools,{mining:['smith']});assert.equal(values.checkMapping.note,'[TEST] kept');
});

test('Save after changing ONE cell stores only that cell (from an empty mapping)',async()=>{
  values.checkMapping={};
  const app=moduleApi.open({view:'gm'});app.view='gm';
  app.element={querySelector:()=>null,querySelectorAll:()=>[]};app.rosterDraft=new Set(values.partyRoster);
  await app._prepareContext({});
  app._rememberMapDraft({dataset:{mapCell:'qualifyTools',mapProf:'alchemy'},value:'herb'});
  assert.equal(app.mapDirty,true);
  await app._click('roster-save');
  assert.deepEqual(values.checkMapping.tools,{alchemy:'herb'});
  assert.deepEqual(values.checkMapping.skills,{},'no skill was changed');
  assert.deepEqual(values.checkMapping.qualifyTools,{alchemy:['herb']});
  assert.deepEqual(values.checkMapping.qualifySkills,{});assert.deepEqual(values.checkMapping.advantageTools,{});
  assert.equal(effectiveMapping(values.checkMapping).tools.blacksmithing,'smith','the other professions still follow the defaults');
  assert.equal(app.mapDirty,false,'nothing left unsaved');
  // Picking the default again puts the cell back to "follow the default".
  app._rememberMapDraft({dataset:{mapCell:'qualifyTools',mapProf:'alchemy'},value:'alchemist'});
  await app._click('roster-save');
  assert.deepEqual(values.checkMapping.tools,{});
  assert.deepEqual(errors,[]);
});
