import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {effectiveMapping,rollModeFor,professionKey,migrateCheckMapping,advantageToolsOf} from '../scripts/checks.mjs';
import {PROFESSION_KEYS,professionTitle,catalogCrosswalk,unmappedProfessions,qualifications,assignmentPlan} from '../scripts/assign.mjs';
// 0.16.0 (AG-F01): configurable profession crosswalk and GM-only profession assignment from proficiencies.
const hooks={},errors=[],infos=[];let api,confirmAnswer=true;
const values={partyRoster:['ana','bo'],libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]},checkMapping:{}};
const gm={id:'gm',isGM:true,name:'GM',active:true},alice={id:'u1',isGM:false,name:'Alice',active:true};
const users=[gm,alice];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
class FakeDialog{constructor(o){this.opts=o;}render(){return this;}static async wait(o){FakeDialog.last=o;return confirmAnswer;}}
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){this.rendered=true;return this;}},HandlebarsApplicationMixin:c=>c,DialogV2:FakeDialog}},utils:{escapeHTML:esc,randomID:()=>`id${Math.random().toString(36).slice(2,10)}`}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:()=>{}};
globalThis.ui={notifications:{info:m=>infos.push(String(m)),error:e=>errors.push(String(e)),warn:()=>{}}};
const src=(id,name,access)=>({'ashen-gate-manager':{source:{sourceId:id,entityType:'Profession',visibility:'player',status:'approved',version:'0.1.0',refs:[],
  definition:{id,entity_type:'Profession',version:'0.1.0',refs:[],name,...(access?{access}:{})}}}});
const profDoc=(id,sourceId,name,access=null)=>({id,uuid:`Item.${id}`,name:`${name} — Profession`,type:'feat',img:'',flags:src(sourceId,name,access),system:{description:{value:''}},
  ownership:{default:2},folder:'f1',sort:5,testUserPermission:()=>true,
  toObject(){return {_id:this.id,name:this.name,type:this.type,img:this.img,folder:this.folder,sort:this.sort,ownership:structuredClone(this.ownership),flags:structuredClone(this.flags),system:structuredClone(this.system)};}});
// [TEST] world: Herbalism with the catalog's access shape, Alchemy with any-of tools, Mining/Cooking without access.
const world=[
  profDoc('wherb','PROF-TG-HERBALISM','[TEST] Herbalism',{skillProficienciesAnyOf:['Nature'],advantageToolsAnyOf:['Herbalism Kit']}),
  profDoc('walch','PROF-TG-ALCHEMY','[TEST] Alchemy',{toolProficienciesAnyOf:["Alchemist's Supplies",'Herbalism Kit'],toolMustBePresent:true}),
  profDoc('wmine','PROF-TG-MINING','[TEST] Mining'),
  profDoc('wcook','PROF-TG-COOKING','[TEST] Cooking'),
  profDoc('wench','PROF-TG-ENCHANTING','[TEST] Enchanting',{}),
];
const makeActor=(id,name,{skills={},tools={},items=[]}={})=>{const inv=[...items];let n=0;
  const a={id,name,type:'character',hasPlayerOwner:true,items:inv,
    flags:{'ashen-gate-profession-ledger':{professionProgress:{professions:{'PROF-TG-ALCHEMY':{xp:42}}}}},
    system:{skills:Object.fromEntries(Object.entries(skills).map(([k,v])=>[k,{value:v,total:v*2}])),tools:Object.fromEntries(Object.entries(tools).map(([k,v])=>[k,{value:v,total:v*2}])),abilities:{int:{mod:1},wis:{mod:1}}},
    testUserPermission:(u)=>u.isGM||u.id==='u1',
    createEmbeddedDocuments:async(t,docs)=>{a.created=(a.created??0)+docs.length;const out=docs.map(d=>({...structuredClone(d),id:`${id}-n${n++}`}));inv.push(...out);return out;}};
  return a;};
const held=(sourceId,name)=>({id:`h-${sourceId}`,name:`${name} — Profession`,type:'feat',flags:src(sourceId,name)});
// Ana: Nature + Herbalism Kit proficiency, already has Alchemy. Bo: Smith's tools + Cook's utensils. Cy: nothing.
const ana=makeActor('ana','[TEST] Ana',{skills:{nat:1},tools:{herb:1},items:[held('PROF-TG-ALCHEMY','[TEST] Alchemy')]});
const bo=makeActor('bo','[TEST] Bo',{tools:{mason:1,cook:1}});
const cy=makeActor('cy','[TEST] Cy',{skills:{ath:1}});
const all=[ana,bo,cy];
const ledgerModule={active:true,set api(v){api=v},get api(){return api}};
globalThis.game={user:gm,users:{contents:users,get:id=>users.find(u=>u.id===id),get activeGM(){return gm;}},items:{contents:world,get:id=>world.find(x=>x.id===id)},
  actors:{contents:all,get:id=>all.find(a=>a.id===id)},socket:{emit:()=>{},on:()=>{}},
  modules:{get:id=>id==='ashen-gate-profession-ledger'?ledgerModule:null},settings:{register:()=>{},registerMenu:()=>{},get:(m,k)=>values[k],set:async(m,k,v)=>{values[k]=v;}}};
const entry=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js');
await import(pathToFileURL(entry));hooks.init();hooks.ready();
const app=api.open({view:'assign'});
const html=async view=>{app.view=view;return (await app._prepareContext({})).html;};

test('crosswalk defaults cover all 14 professions; Fishing is accessed by Survival, no built-in items (0.22.0)',()=>{
  const map=effectiveMapping({});
  assert.equal(PROFESSION_KEYS.length,14);
  for(const k of PROFESSION_KEYS)for(const l of ['qualifySkills','qualifyTools','advantageTools'])assert.ok(Array.isArray(map[l][k]),`${k} ${l}`);
  assert.deepEqual(map.qualifyTools.alchemy,['alchemist']);assert.deepEqual(map.qualifySkills.enchanting,['arc']);
  assert.deepEqual(map.qualifySkills.huntingskinning,['sur']);assert.deepEqual(map.qualifyTools.mining,['mason']);
  assert.deepEqual(map.advantageTools.herbalism,[],'no advantage tools by default');
  assert.deepEqual(map.qualifySkills.fishing,['sur']);assert.deepEqual(map.qualifyTools.fishing,[]);assert.deepEqual(map.items.fishing,[]);
  assert.equal(map.skills.fishing,'sur','Survival is also the Fishing gather check by default');
  assert.deepEqual(unmappedProfessions(map),[]);
});

test('catalog-derived defaults: access lists replace built-in ones; empty access keeps the default; unknown names are reported',()=>{
  const {catalog,unresolved}=catalogCrosswalk([
    {sourceId:'PROF-TG-HERBALISM',name:'[TEST] Herbalism',access:{skillProficienciesAnyOf:['Nature'],advantageToolsAnyOf:['Herbalism Kit']}},
    {sourceId:'PROF-TG-ALCHEMY',name:'[TEST] Alchemy',access:{toolProficienciesAnyOf:["Alchemist's Supplies",'Herbalism Kit']}},
    {sourceId:'PROF-TG-ENCHANTING',name:'[TEST] Enchanting',access:{}},
    {sourceId:'PROF-TG-MINING',name:'[TEST] Mining',access:{toolProficienciesAnyOf:['[TEST] Pickaxe']}}]);
  const map=effectiveMapping({},{catalog});
  assert.deepEqual(map.qualifySkills.herbalism,['nat']);assert.deepEqual(map.qualifyTools.herbalism,[],'the kit only gives advantage in the catalog');
  assert.deepEqual(map.advantageTools.herbalism,['herb']);assert.equal(map.origin.herbalism.qualifySkills,'catalog');
  assert.deepEqual(map.qualifyTools.alchemy,['alchemist','herb']);
  assert.deepEqual(map.qualifySkills.enchanting,['arc'],'{} access keeps the Arcana default');assert.equal(map.origin.enchanting.qualifySkills,'default');
  assert.deepEqual(unresolved,[{sourceId:'PROF-TG-MINING',profession:'Mining',field:'toolProficienciesAnyOf',name:'[TEST] Pickaxe'}]);
  assert.deepEqual(map.qualifyTools.mining,[],'an unknown tool is not guessed');
  assert.deepEqual(catalogCrosswalk([{name:'Alchemy',access:{toolProficienciesAnyOf:['Smith’s Tools']}},{name:'Alchemy',access:{toolProficienciesAnyOf:['Tinker’s Tools']}}]).conflicts,['Alchemy']);
});

test('GM overrides win over catalog and defaults; explicit [] means none; old single-value settings still work',()=>{
  const catalog={herbalism:{qualifySkills:['nat'],qualifyTools:[],advantageTools:['herb']}};
  const map=effectiveMapping({tools:{mining:'smith',arcana:'jeweler'},skills:{fishing:'sur'},qualifySkills:{herbalism:['nat','sur']},qualifyTools:{alchemy:[]},advantageTools:{fishing:['herb','<bad>']}},{catalog});
  assert.deepEqual(map.qualifySkills.herbalism,['nat','sur']);assert.equal(map.origin.herbalism.qualifySkills,'gm');
  assert.deepEqual(map.advantageTools.herbalism,['herb'],'catalog advantage still shown when the GM set nothing');
  assert.deepEqual(map.qualifyTools.alchemy,[],'explicit empty');
  assert.deepEqual(map.qualifyTools.mining,['smith'],'a single saved check tool seeds the qualifying list');
  assert.deepEqual(map.qualifySkills.fishing,['sur']);assert.equal(map.tools.enchanting,'jeweler','old name still read');
  assert.deepEqual(map.advantageTools.fishing,['herb'],'invalid entries dropped');
  assert.equal(effectiveMapping({tools:{alchemy:''}}).tools.alchemy,'');assert.deepEqual(effectiveMapping({tools:{alchemy:''}}).qualifyTools.alchemy,[]);
  assert.deepEqual(effectiveMapping({}).gm,{qualifySkills:{},qualifyTools:{},advantageTools:{},items:{},advantageItems:{}});
});

test('advantage tools: only GM-configured ones change the roll; proficiency or carrying counts',()=>{
  const actor={system:{skills:{nat:{value:1}},tools:{herb:{value:1}},abilities:{}},items:[]};
  assert.equal(rollModeFor(actor,{kind:'skill',key:'nat'}).mode,0,'unconfigured: as before');
  assert.deepEqual(rollModeFor(actor,{kind:'skill',key:'nat'},{advantageTools:['herb']}),{mode:1,sources:['Advantage: Herbalism Kit']});
  const carrier={system:{skills:{},tools:{},abilities:{}},items:[{type:'tool',name:'Kit',system:{type:{baseItem:'herb'}}}]};
  assert.equal(rollModeFor(carrier,{kind:'skill',key:'nat'},{advantageTools:['herb']}).mode,1);
  assert.equal(rollModeFor(carrier,{kind:'skill',key:'nat'},{advantageTools:['smith']}).mode,0);
});

test('proposals come with a plain reason, from proficiencies only',()=>{
  const map=effectiveMapping({});
  assert.deepEqual(qualifications(ana,map).map(q=>q.reason),['Herbalism Kit + Nature → Herbalism']);
  assert.deepEqual(qualifications(bo,map).map(q=>q.reason),['Cook’s Utensils → Cooking','Mason’s Tools → Mining']);
  assert.deepEqual(qualifications(cy,map),[]);
  const items=new Map([['herbalism',[{sourceId:'PROF-X-HERBALISM',name:'H'}]]]);
  const rows=assignmentPlan([ana],map,{professionItems:items,heldKeys:()=>new Set(),heldIds:()=>new Set(['PROF-X-HERBALISM'])});
  assert.equal(rows[0].status,'has');
});

test('GM preview for the party: catalog crosswalk, "already has", missing Items; nothing changes',async()=>{
  const before=JSON.stringify(all.map(a=>a.items.length));
  const p=api.assign.preview();
  assert.deepEqual(p.actors.map(a=>a.name),['[TEST] Ana','[TEST] Bo']);
  const view=p.rows.map(r=>[r.actorName,r.profession,r.reason,r.status]);
  assert.deepEqual(view,[
    ['[TEST] Ana','Alchemy','Herbalism Kit → Alchemy','has'],
    ['[TEST] Ana','Herbalism','Nature → Herbalism','propose'],
    ['[TEST] Bo','Cooking','Cook’s Utensils → Cooking','propose'],
    ['[TEST] Bo','Mining','Mason’s Tools → Mining','propose']]);
  assert.equal(JSON.stringify(all.map(a=>a.items.length)),before);
  const h=await html('assign');assert.match(h,/data-action="assign-preview"/);
});

test('GM confirms one, then bulk; re-running adds nothing; XP untouched; no duplicates',async()=>{
  const xpBefore=JSON.stringify(ana.flags);
  await app._click('assign-preview');
  const herb=app.assignState.preview.rows.find(r=>r.profession==='Herbalism');
  app.assignState.selected=new Set([herb.id]);
  await app._click('assign-apply','selected');
  assert.equal(ana.created,1);assert.equal(bo.created,undefined,'only the selected one');
  const added=ana.items.at(-1);
  assert.equal(added.flags['ashen-gate-manager'].source.sourceId,'PROF-TG-HERBALISM','the imported Item, unchanged format');
  assert.equal(added._id,undefined);assert.equal(added.folder,undefined);
  assert.equal(JSON.stringify(ana.flags),xpBefore,'XP/progression untouched');
  assert.match(FakeDialog.last.content,/XP, levels, Skill Tree perks and existing Items are not changed/);
  await app._click('assign-apply','all');
  assert.equal(bo.created,2);
  const again=await api.assign.apply();
  assert.deepEqual(again.added,[],'idempotent');
  assert.ok(api.assign.preview().rows.every(r=>r.status==='has'));
  assert.equal(ana.items.filter(i=>i.flags?.['ashen-gate-manager']?.source?.sourceId==='PROF-TG-HERBALISM').length,1);
});

test('a single character, and a declined confirmation adds nothing',async()=>{
  const p=api.assign.preview({actorIds:['cy']});assert.deepEqual(p.rows,[]);assert.deepEqual(p.actors.map(a=>a.id),['cy']);
  cy.system.tools.cook={value:1};
  app.assignState={target:'cy',preview:null,selected:new Set()};
  await app._click('assign-preview');confirmAnswer=false;await app._click('assign-apply','all');
  assert.equal(cy.created,undefined);confirmAnswer=true;delete cy.system.tools.cook;
});

test('GM gate: players are refused in the API, and do not see the Assign tab',async()=>{
  game.user=alice;
  try{
    assert.throws(()=>api.assign.preview(),/Only the GM/);
    await assert.rejects(api.assign.apply(),/Only the GM/);
    const h=(await app._prepareContext({})).html;
    assert.doesNotMatch(h,/data-id="assign"/);assert.notEqual(app.view,'assign');
  }finally{game.user=gm;}
});

test('GM Setup table (0.27.0): one multi-select per cell, crafting and gathering groups, saved additively over the old shape',async()=>{
  app.mapDraft=null;
  const h=await html('gm');
  assert.match(h,/<table class="ag-table agl-map"><thead><tr><th scope="col">Profession<\/th><th scope="col">Skill to Access<\/th><th scope="col">Tool to Access<\/th><th scope="col">Tool for Advantage<\/th>/);
  assert.ok(h.indexOf('Crafting professions')<h.indexOf('>Alchemy<')&&h.indexOf('>Tailoring<')<h.indexOf('Gathering professions')&&h.indexOf('Gathering professions')<h.indexOf('>Archaeology<'));
  assert.match(h,/<th scope="row"><span class="agl-map-prof">Hunting<\/span>/);assert.doesNotMatch(h,/Hunting\/Skinning|<small class="agl-sub">gathering/);
  assert.doesNotMatch(h,/Qualifying items|data-map-items|Several \(|<select data-map-cell/);
  assert.match(h,/data-map-list="advantageTools" data-map-prof="herbalism"/);assert.doesNotMatch(h,/data-map-list="advantageTools" data-map-prof="alchemy"/,'crafting rows show a dash');
  assert.match(h,/data-map-list="qualifySkills" data-map-prof="fishing">[\s\S]*?aria-label="Fishing skill to access: Survival"[\s\S]*?value="sur" checked>/);
  app.element={querySelector:()=>null,querySelectorAll:()=>[]};app.rosterDraft=new Set(values.partyRoster);
  app._setMapCell('qualifySkills','herbalism',['nat']);
  assert.equal(app.mapDirty,false,'ticking what is shown is not an edit');
  app._setMapCell('advantageTools','herbalism',['herb']);
  assert.equal(app.mapDirty,false,'the content already gives Herbalism Kit: not an edit');
  app._setMapCell('qualifySkills','fishing',['nat']);
  app._setMapCell('qualifyTools','mining',['smith']);
  assert.equal(app.mapDirty,true);
  await app._click('roster-save');
  assert.deepEqual(values.checkMapping.advantageTools,{},'equal to the content: nothing stored');
  assert.deepEqual(values.checkMapping.qualifySkills,{fishing:['nat']});assert.equal(values.checkMapping.skills.fishing,'nat','the gather check follows');
  assert.deepEqual(values.checkMapping.qualifyTools,{mining:['smith']});assert.equal(values.checkMapping.tools.mining,'smith','the check tool follows');
  // 0.26.2: only the changed cells are stored; untouched professions keep coming from the built-in defaults.
  assert.deepEqual(values.checkMapping.tools,{mining:'smith'});assert.deepEqual(values.checkMapping.skills,{fishing:'nat'});
  assert.equal(effectiveMapping(values.checkMapping).tools.alchemy,'alchemist','defaults still apply');
  assert.deepEqual(unmappedProfessions(effectiveMapping(values.checkMapping)),[]);
  await app._click('map-reset','fishing');await app._click('map-reset','mining');await app._click('roster-save');
  assert.deepEqual(values.checkMapping.qualifySkills,{});assert.deepEqual(values.checkMapping.qualifyTools,{});
  assert.deepEqual(values.checkMapping.skills,{});assert.deepEqual(values.checkMapping.tools,{},'Reset goes back to the default (nothing stored)');
  assert.equal(effectiveMapping(values.checkMapping).skills.fishing,'sur');assert.equal(effectiveMapping(values.checkMapping).tools.mining,'mason');
  assert.deepEqual(effectiveMapping(values.checkMapping).qualifySkills.fishing,['sur']);
});

test('GM Setup table (0.27.0): a saved list of several shows every value and is kept until that cell changes; a crafting skill sets no craft check',async()=>{
  values.checkMapping={...values.checkMapping,qualifyTools:{cooking:['cook','brewer']},items:{cooking:['[TEST] Pan']}};
  app.mapDraft=null;
  const h=await html('gm');
  assert.match(h,/data-map-list="qualifyTools" data-map-prof="cooking">[\s\S]*?aria-label="Cooking tool to access: Cook’s Utensils, Brewer’s Supplies"[\s\S]*?<span class="agl-mpick__value">Cook’s Utensils, Brewer’s Supplies<\/span>[\s\S]*?Set by GM/);
  assert.doesNotMatch(h,/Several|__several__/);
  app._setMapCell('qualifySkills','cooking',['arc']);
  await app._click('roster-save');
  assert.deepEqual(values.checkMapping.qualifyTools.cooking,['cook','brewer'],'untouched cell kept');
  assert.deepEqual(values.checkMapping.qualifySkills.cooking,['arc']);assert.equal(values.checkMapping.skills.cooking,undefined,'no craft check skill added');
  assert.deepEqual(values.checkMapping.items,{cooking:['[TEST] Pan']},'legacy items kept');
  app._setMapCell('qualifyTools','cooking',['brewer']);assert.equal(app.mapDraft.tools.cooking,'brewer','unticking the check tool: the next one rolls');
  app._setMapCell('qualifyTools','cooking',['brewer','cook']);
  assert.equal(app.mapDirty,false,'ticking back the saved list restores it (and its check)');assert.equal(app.mapDraft.tools.cooking,'cook');
  app._setMapCell('qualifyTools','cooking',[]);
  await app._click('roster-save');
  assert.deepEqual(values.checkMapping.qualifyTools.cooking,[]);assert.equal(values.checkMapping.tools.cooking,'');
  values.checkMapping={};app.mapDraft=null;
});

test('0.22.0: Hunting/Skinning is shown as Hunting; keys and name matching are unchanged',()=>{
  assert.equal(professionTitle('huntingskinning'),'Hunting');assert.equal(professionTitle('fishing'),'Fishing');
  for(const n of ['Hunting','Hunting/Skinning','Hunting & Skinning','Skinning & Harvesting'])assert.equal(professionKey(n),'huntingskinning');
  assert.ok(PROFESSION_KEYS.includes('huntingskinning'));
});

test('0.22.0 migration: a saved Fishing check skill of "" (the old default) becomes Survival; nothing else changes; re-runnable',()=>{
  const old={tools:{alchemy:'herb'},skills:{fishing:'',mining:'',herbalism:'med'},qualifyTools:{alchemy:['herb']},items:{cooking:['[TEST] Pan']}};
  const next=migrateCheckMapping(old);
  assert.deepEqual(next,{...old,skills:{fishing:'sur',mining:'',herbalism:'med'}});assert.equal(old.skills.fishing,'','input not mutated');
  assert.equal(migrateCheckMapping(next),null,'running again changes nothing');
  assert.equal(migrateCheckMapping({skills:{fishing:'nat'}}),null,'a GM choice is kept');
  assert.equal(migrateCheckMapping({}),null);assert.equal(migrateCheckMapping(null),null);
  assert.equal(effectiveMapping(next).skills.fishing,'sur');assert.deepEqual(effectiveMapping(next).qualifySkills.fishing,['sur']);
});

test('0.22.0: advantage tools apply to gathering professions only; a crafting profession with some configured gets none',()=>{
  const map=effectiveMapping({advantageTools:{alchemy:['herb'],herbalism:['herb']}},{baseline:{cooking:{advantageTools:['cook']}}});
  assert.deepEqual(map.advantageTools.alchemy,['herb'],'saved data is kept');
  assert.deepEqual(advantageToolsOf(map,'alchemy'),[]);assert.deepEqual(advantageToolsOf(map,'cooking'),[],'baseline file too');
  assert.deepEqual(advantageToolsOf(map,'herbalism'),['herb']);
  const actor={system:{skills:{},tools:{herb:{value:1},alchemist:{value:1}},abilities:{}},items:[]};
  assert.equal(rollModeFor(actor,{kind:'tool',key:'alchemist'},{advantageTools:advantageToolsOf(map,'alchemy')}).mode,0,'no advantage on a craft check');
});
