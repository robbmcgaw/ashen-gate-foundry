import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {detectSpecialistFile,specialistCount,specialistApi,describeUnrecognized,planSpecialist,filterSpecialist,applySpecialist} from '../scripts/specialist-handoff.js';
import {createAppearanceController} from '../scripts/appearance.js';

const fx=n=>JSON.parse(fs.readFileSync(new URL(`../../../test-fixtures/playtest/AG_Playtest_${n}_0.6.1.json`,import.meta.url),'utf8'));
const tpl=fs.readFileSync(new URL('../templates/manager.hbs',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../scripts/main.js',import.meta.url),'utf8');

test('the four playtest specialist files are recognised by shape',()=>{
  assert.equal(detectSpecialistFile(fx('Quests')),'quests');
  assert.equal(detectSpecialistFile(fx('SkillTrees')),'skill-trees');
  assert.equal(detectSpecialistFile(fx('HQ_Facilities')),'headquarters');
  assert.equal(detectSpecialistFile({records:fx('HQ_Facilities')}),'headquarters');
  assert.equal(detectSpecialistFile(fx('Factions')),'factions');
  assert.equal(specialistCount('headquarters',fx('HQ_Facilities')),fx('HQ_Facilities').length);
});
test('a Manager package is never taken for a specialist file',()=>{
  const pack=fx('Pack');
  assert.equal(detectSpecialistFile(pack),null);
  assert.equal(detectSpecialistFile({manifest:{},records:[{entity_type:'Objective'}],schema_version:'ag-quest-source/0.1'}),null);
});
test('unrecognised files get a plain description naming what they look like and who owns similar files',()=>{
  assert.match(describeUnrecognized([{entity_type:'Recipe'}]),/list of 1 item.*Recipe.*Headquarters/);
  assert.match(describeUnrecognized({foo:1,bar:2}),/top-level keys: foo, bar/);
  assert.match(describeUnrecognized({schema_version:'ag-source-records/0.1',records:[{entity_type:'Objective'}]}),/no manifest.*Quest Log/);
  assert.match(describeUnrecognized({records:[{entity_type:'Facility'}],schema_version:'x'}),/Headquarters/);
  assert.match(describeUnrecognized('x'),/string/);
});

const fakeGame=(spec,active=true,api={})=>({modules:{get:id=>id===spec?{active,api}:null}});
test('hand-off is feature-detected: missing, inactive or old modules give a skipped row, not a crash',()=>{
  assert.equal(specialistApi(fakeGame('ashen-gate-quest-manager',false,{previewQuestImport(){},importQuests(){}}),'quests'),null);
  assert.equal(specialistApi(fakeGame('ashen-gate-quest-manager',true,{}),'quests'),null);
  const plan=planSpecialist('quests',fx('Quests'),null);
  assert.equal(plan.rows[0].action,'skipped');assert.match(plan.rows[0].reason,/not active/);
});
test('preview maps module rows to Manager rows and passes skip/update mode',()=>{
  let seen;
  const api={previewQuestImport:(p,o)=>{seen=o;return {errors:[],rows:[{id:'Q1',name:'A',action:'new',reason:''},{id:'Q2',name:'B',action:'skip',reason:'Already in this world; kept as is.'},{id:'Q3',name:'C',action:'update',reason:'r'}]};},importQuests(){}};
  const plan=planSpecialist('quests',fx('Quests'),api,{updateExisting:true});
  assert.deepEqual(seen,{mode:'update'});
  assert.deepEqual(plan.rows.map(r=>r.action),['create','skipped','update']);
  const hq=planSpecialist('headquarters',fx('HQ_Facilities'),{previewFacilityImport:(p,o)=>{seen=o;return {errors:[],rows:[]};},importFacilities(){}});
  assert.equal(seen,undefined,'modules without update get no mode');
});
test('only the selected records are handed over, including Factions starting_state',()=>{
  const f=fx('Factions'),ids=[f.definitions[0].id];
  const out=filterSpecialist('factions',f,ids);
  assert.equal(out.definitions.length,1);
  assert.ok(out.starting_state.every(s=>s.faction_id===ids[0]));
  assert.equal(filterSpecialist('headquarters',fx('HQ_Facilities'),[fx('HQ_Facilities')[0].id]).length,1);
});
test('apply turns module reports (incl. Factions shape) into history results and survives a throwing module',async()=>{
  const q={previewQuestImport(){},importQuests:async()=>({created:['A'],updated:['B'],skipped:[{id:'C',reason:'kept'}],failed:[{id:'D',reason:'bad'}]})};
  const r=await applySpecialist('quests',fx('Quests'),q,{ids:['A','B','C','D']});
  assert.deepEqual(r.map(x=>`${x.id}:${x.status}:${x.action??''}`),['A:ok:create','B:ok:update','C:skipped:','D:error:create']);
  const f={previewFactionsImport(){},importFactions:async()=>({added:[{id:'F1',name:'x'}],skipped:[{id:'F2',name:'y',reason:'Already'}],missingActors:['Zed']})};
  const fr=await applySpecialist('factions',fx('Factions'),f,{ids:['F1','F2']});
  assert.equal(fr[0].id,'F1');assert.match(fr.at(-1).message,/Zed/);
  const bad={previewTreeImport(){},importTrees:async()=>{throw new Error('GM only');}};
  const br=await applySpecialist('skill-trees',fx('SkillTrees'),bad,{ids:['T']});
  assert.equal(br[0].status,'error');assert.match(br[0].message,/GM only/);
  assert.equal((await applySpecialist('quests',fx('Quests'),null,{ids:['A']}))[0].status,'skipped');
});

test('every load attempt clears the previous file banner; failures say the new file was not loaded',()=>{
  assert.match(main,/#clearLoaded\(`Reading \$\{f\.name\}…`\)/);
  assert.match(main,/was not loaded\. Nothing in your world changed\./);
  // 0.46.0: the kit fileButton clears its input after every pick (bindFileButtons), so the same file can be chosen again.
  assert.match(main,/bindFileButtons\(root,\(files,wrap\)=>this\.#pickFile\(wrap\.dataset\.agFileKind,files\[0\]\)\)/);
});
test('Manager UI: no Export or Player Access tab, export lives in Items (was Library), access on Modules',()=>{
  assert.doesNotMatch(tpl,/data-ag-tab="capture"|data-ag-tab="player-access"/);
  const lib=tpl.indexOf('\n  {{#if itemsActive}}'),modules=tpl.indexOf('\n  {{#if modulesActive}}');
  const dev=tpl.indexOf('{{{setupPanels.developer}}}'),adopt=tpl.indexOf('data-ag-action="capture-export"');
  assert.ok(dev>0&&adopt>dev,'tagged export (Adopt & tag) is in GM Setup → Developer Tools (0.46.0)');
  assert.ok(tpl.indexOf('data-ag-action="library-export"')>lib);
  assert.ok(tpl.indexOf('data-ag-action="player-access-hide-all"')>modules,'Hide all is on the Modules tab');
  assert.doesNotMatch(tpl,/appearanceActive/);
});

test('a player client that reads the old value inside onChange still gets the new skin',()=>{
  let stale='ag-default';
  const c=createAppearanceController({currentUser:()=>({id:'p'}),getSetting:k=>k==='worldSkin'?stale:'',setSetting:async()=>{},subscribeSettings:()=>()=>{}});
  const seen=[];c.subscribe(s=>seen.push(s.effective));
  c.noteChange('worldSkin','ag-slate');          // Foundry onChange(value) while game.settings.get is still stale
  assert.equal(c.getState().effective,'ag-slate');
  assert.deepEqual(seen,['ag-slate']);
  c.noteChange('userSkin','ag-ember','p');      // this user's own change
  assert.equal(c.getState().effective,'ag-ember');
  c.noteChange('userSkin','','p');
  assert.equal(c.getState().effective,'ag-slate');
});

test('0.54.1: another user\'s My Appearance change does not change this client',()=>{
  let mine='';
  const c=createAppearanceController({currentUser:()=>({id:'gm'}),getSetting:k=>k==='worldSkin'?'ag-default':mine,setSetting:async()=>{},subscribeSettings:()=>()=>{}});
  const seen=[];c.subscribe(s=>seen.push(s.effective));
  c.noteChange('userSkin','ag-ember','player1');   // a player saved My Appearance; Foundry calls onChange here too
  assert.equal(c.getState().effective,'ag-default');
  assert.deepEqual(seen,[],'no redraw for someone else\'s choice');
  c.noteChange('userSkin','ag-ember');              // no user id given: this client's own stored value is read, not the handed value
  assert.equal(c.getState().effective,'ag-default');
  mine='ag-slate';c.noteChange('userSkin','ag-ember');
  assert.equal(c.getState().effective,'ag-slate','reads its own stored value');
  c.noteChange('userSkin','ag-ember','gm');         // own change from another tab/device
  assert.equal(c.getState().effective,'ag-ember');
});

test('0.15: no Templates or Audit tab; samples under Import; Check library in Items (was Library); no bundled macros',()=>{
  assert.doesNotMatch(tpl,/data-ag-tab="templates"|data-ag-tab="audit"|templatesActive|auditActive/);
  for(const a of ['template-example','import-format-example','source-manifest-template'])assert.match(tpl,new RegExp(`data-ag-action="${a}"`));
  const lib=tpl.indexOf('\n  {{#if itemsActive}}'),mods=tpl.indexOf('\n  {{#if modulesActive}}');
  assert.ok(tpl.indexOf('data-ag-action="library-check"')>lib&&tpl.indexOf('data-ag-action="library-check"')<mods);
  assert.ok(tpl.indexOf('data-ag-action="template-example"')>tpl.indexOf('{{{setupPanels.developer}}}'),'samples sit in GM Setup → Developer Tools (0.46.0)');
  assert.deepEqual(JSON.parse(fs.readFileSync(new URL('../macros/manifest.json',import.meta.url),'utf8')).entries,[]);
});

test('0.16: no Macros tab or install/export UI; Macro documents still import from packages',()=>{
  assert.doesNotMatch(tpl,/data-ag-tab="macros"|macrosActive|data-ag-macro|macro-install|macro-export/);
  assert.doesNotMatch(main,/#installMacros|#exportMacros|ensureMacroRegistry|macro-install/);
  assert.match(main,/const cls = \{Item,JournalEntry,Actor,RollTable,Macro\}\[kind\]/);
  const pack=JSON.parse(fs.readFileSync(new URL('../../../test-fixtures/playtest/AG_Playtest_Pack_0.6.1.json',import.meta.url),'utf8'));
  assert.ok(pack.records.some(r=>r.foundry?.document_type==='Macro'),'playtest pack still carries its Macro');
});
