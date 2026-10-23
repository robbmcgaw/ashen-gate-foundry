import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {effectiveMapping,rollModeFor,advantageToolsOf,compactCheckMapping} from '../scripts/checks.mjs';
import {catalogCrosswalk,qualifications,parseBaselineFile} from '../scripts/assign.mjs';
// 0.27.0: GM Setup → Tools and checks cells are multi-selects; the imported Profession content (catalog layer) is shown
// in the table and its gathering advantage tools are applied to gathering checks. Mocked Foundry and dnd5e 6 tool config
// (keys with no labels, as CONFIG.DND5E.tools has them): logic only, not the live UI.
const hooks={},errors=[];let api;
const values={partyRoster:[],libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]},checkMapping:{},checkMappingVersion:2};
const gm={id:'gm',isGM:true,name:'GM',active:true},alice={id:'u1',isGM:false,name:'Alice',active:true};
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){this.rendered=true;return this;}},HandlebarsApplicationMixin:c=>c,DialogV2:{wait:async()=>true}}},utils:{escapeHTML:esc,randomID:()=>'id1'}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:()=>{}};
globalThis.ui={notifications:{info:()=>{},error:e=>errors.push(String(e)),warn:()=>{}}};
const DND5E_TOOLS=['alchemist','brewer','calligrapher','carpenter','cartographer','cobbler','cook','glassblower','jeweler','leatherworker','mason','painter','potter','smith','tinker','weaver','woodcarver','disg','forg','herb','navg','pois','thief'];
globalThis.CONFIG={DND5E:{tools:Object.fromEntries(DND5E_TOOLS.map(k=>[k,{ability:'int',id:`Compendium.dnd5e.items.Item.${k}`}]))}};
// The shipped content's access lists, with its exact (straight-apostrophe) dnd5e tool names. [TEST] ids and names only.
const CONTENT={
  Alchemy:{toolProficienciesAnyOf:["Alchemist's Supplies",'Herbalism Kit']},
  Blacksmithing:{toolProficienciesAnyOf:["Smith's Tools","Mason's Tools"]},
  Cooking:{toolProficienciesAnyOf:["Brewer's Supplies","Cook's Utensils"]},
  Inscription:{toolProficienciesAnyOf:["Calligrapher's Supplies","Cartographer's Tools","Painter's Supplies"]},
  Leatherworking:{toolProficienciesAnyOf:["Leatherworker's Tools","Cobbler's Tools"]},
  Tailoring:{toolProficienciesAnyOf:["Weaver's Tools"]},
  Enchanting:{skillProficienciesAnyOf:['Arcana'],toolProficienciesAnyOf:["Carpenter's Tools","Potter's Tools","Woodcarver's Tools"]},
  Engineering:{toolProficienciesAnyOf:["Tinker's Tools"]},
  Jewelcrafting:{toolProficienciesAnyOf:["Jeweler's Tools","Glassblower's Tools"]},
  Herbalism:{skillProficienciesAnyOf:['Nature'],advantageToolsAnyOf:['Herbalism Kit']},
  Hunting:{skillProficienciesAnyOf:['Survival'],advantageToolsAnyOf:["Leatherworker's Tools"]},
  Mining:{skillProficienciesAnyOf:['Athletics'],advantageToolsAnyOf:["Mason's Tools"]},
  Archaeology:{skillProficienciesAnyOf:['History'],advantageToolsAnyOf:["Excavator's Tools"]},
  Fishing:{skillProficienciesAnyOf:['Survival'],advantageToolsAnyOf:['Fishing Rod']},
};
const src=(id,name,access)=>({'ashen-gate-manager':{source:{sourceId:id,entityType:'Profession',visibility:'player',status:'approved',version:'0.1.0',refs:[],
  definition:{id,entity_type:'Profession',version:'0.1.0',refs:[],name,access}}}});
const world=Object.entries(CONTENT).map(([name,access])=>{const id=`PROF-${name.toUpperCase()}`;
  return {id:`w${name}`,uuid:`Item.w${name}`,name:`[TEST] ${name} — Profession`,type:'feat',img:'',flags:src(id,`[TEST] ${name}`,access),system:{description:{value:''}},testUserPermission:()=>true};});
const actor=(id,{tools={},items=[]}={})=>({id,name:`[TEST] ${id}`,type:'character',hasPlayerOwner:true,items,flags:{},testUserPermission:()=>true,
  system:{skills:{nat:{value:1,total:3},sur:{value:1,total:3},ath:{value:1,total:3}},tools:Object.fromEntries(Object.entries(tools).map(([k,v])=>[k,{value:v,total:v*2}])),abilities:{int:{mod:1}}}});
const kitCarrier=actor('carrier',{items:[{id:'k',name:'Herbalism Kit',type:'tool',system:{quantity:1,type:{baseItem:'herb'}}}]});
const leather=actor('leather',{tools:{leatherworker:1}}),mason=actor('mason',{tools:{mason:1}}),plain=actor('plain');
const all=[kitCarrier,leather,mason,plain];
const ledgerModule={active:true,version:'0.31.2',set api(v){api=v},get api(){return api}};
globalThis.game={user:gm,users:{contents:[gm,alice],get:id=>[gm,alice].find(u=>u.id===id),get activeGM(){return gm;}},items:{contents:world,get:id=>world.find(x=>x.id===id)},
  actors:{contents:all,get:id=>all.find(a=>a.id===id)},socket:{emit:()=>{},on:()=>{}},
  modules:{get:id=>id==='ashen-gate-profession-ledger'?ledgerModule:null},settings:{register:()=>{},registerMenu:()=>{},get:(m,k)=>values[k],set:async(m,k,v)=>{values[k]=structuredClone(v);}}};
const main=await import(pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js')));hooks.init();hooks.ready();
const {_test}=main;
const app=api.open({view:'gm'});
const html=async()=>{app.view='gm';return (await app._prepareContext({})).html;};
const defs=()=>Object.entries(CONTENT).map(([name,access])=>({sourceId:`PROF-${name.toUpperCase()}`,name:`[TEST] ${name}`,access}));
const cellOf=(h,list,k)=>{const i=h.indexOf(`data-map-list="${list}" data-map-prof="${k}"`);assert.ok(i>0,`${list} ${k} cell`);return h.slice(i,h.indexOf('</div></div>',i));};
const valueOf=(h,list,k)=>cellOf(h,list,k).match(/<span class="agl-mpick__value">([^<]*)<\/span>/)[1];

test('the content\'s exact dnd5e tool names resolve to tool keys (dnd5e 6 config, no labels); unmatched names are reported',()=>{
  const {catalog,unresolved}=catalogCrosswalk(defs());
  assert.deepEqual(catalog.alchemy.qualifyTools,['alchemist','herb']);assert.deepEqual(catalog.blacksmithing.qualifyTools,['smith','mason']);
  assert.deepEqual(catalog.cooking.qualifyTools,['brewer','cook']);assert.deepEqual(catalog.inscription.qualifyTools,['calligrapher','cartographer','painter']);
  assert.deepEqual(catalog.leatherworking.qualifyTools,['leatherworker','cobbler']);assert.deepEqual(catalog.tailoring.qualifyTools,['weaver']);
  assert.deepEqual(catalog.enchanting.qualifyTools,['carpenter','potter','woodcarver']);assert.deepEqual(catalog.engineering.qualifyTools,['tinker']);
  assert.deepEqual(catalog.jewelcrafting.qualifyTools,['jeweler','glassblower']);
  assert.deepEqual(catalog.herbalism.advantageTools,['herb']);assert.deepEqual(catalog.huntingskinning.advantageTools,['leatherworker']);
  assert.deepEqual(catalog.mining.advantageTools,['mason']);
  assert.equal(catalog.archaeology.advantageTools,undefined,'only unmatched names: the content sets no list');assert.equal(catalog.fishing.advantageTools,undefined);
  assert.deepEqual(unresolved.map(u=>[u.profession,u.name]),[['Archaeology',"Excavator's Tools"],['Fishing','Fishing Rod']]);
});

test('Root cause (complaint 2): gathering checks get the content\'s advantage tools (Herbalism, Hunting, Mining); crafting still gets none',()=>{
  assert.deepEqual(_test.advantageToolsFor('Herbalism'),['herb']);assert.deepEqual(_test.advantageToolsFor('Hunting'),['leatherworker']);
  assert.deepEqual(_test.advantageToolsFor('Skinning & Harvesting'),['leatherworker']);assert.deepEqual(_test.advantageToolsFor('Mining'),['mason']);
  assert.deepEqual(_test.advantageToolsFor('Archaeology'),['calligrapher'],'built-in default (GM decision)');assert.deepEqual(_test.advantageToolsFor('Fishing'),[]);
  assert.deepEqual(_test.advantageItemsFor('Fishing'),['Fishing Tackle']);assert.deepEqual(_test.advantageItemsFor('Herbalism'),[]);
  assert.deepEqual(_test.advantageToolsFor('Alchemy'),[],'crafting: none');
  const herb=_test.gatherCheckPlan(kitCarrier,{skill:'Herbalism'});assert.deepEqual(herb.advantageTools,['herb']);
  let r=rollModeFor(kitCarrier,{kind:'skill',key:'nat'},{advantageTools:herb.advantageTools});
  assert.equal(r.mode,1);assert.deepEqual(r.sources,['Advantage: Herbalism Kit'],'carrying the kit');
  const hunt=_test.gatherCheckPlan(leather,{skill:'Hunting'});assert.deepEqual(hunt.advantageTools,['leatherworker']);
  r=rollModeFor(leather,{kind:'skill',key:'sur'},{advantageTools:hunt.advantageTools});assert.equal(r.mode,1);assert.deepEqual(r.sources,['Advantage: Leatherworker’s Tools'],'proficiency');
  const mine=_test.gatherCheckPlan(mason,{skill:'Mining'});assert.deepEqual(mine.advantageTools,['mason']);
  assert.equal(rollModeFor(mason,{kind:'tool',key:'mason'},{advantageTools:mine.advantageTools}).mode,1);
  assert.equal(rollModeFor(plain,{kind:'skill',key:'ath'},{advantageTools:mine.advantageTools}).mode,0,'no tool, no advantage');
  // A GM edit still wins over the content.
  values.checkMapping={advantageTools:{mining:[]}};
  assert.deepEqual(_test.advantageToolsFor('Mining'),[]);
  values.checkMapping={};
});

test('GM Setup shows the effective values from content, where they come from, the gathering advantage summary and unmatched names',async()=>{
  app.mapDraft=null;const h=await html();
  assert.equal(valueOf(h,'qualifyTools','alchemy'),'Alchemist’s Supplies, Herbalism Kit');
  assert.equal(valueOf(h,'qualifyTools','blacksmithing'),'Smith’s Tools, Mason’s Tools');
  assert.equal(valueOf(h,'qualifyTools','cooking'),'Cook’s Utensils, Brewer’s Supplies','the check tool (Cook’s Utensils, the default) is first');
  assert.equal(valueOf(h,'qualifyTools','inscription'),'Calligrapher’s Supplies, Cartographer’s Tools, Painter’s Supplies');
  assert.equal(valueOf(h,'qualifyTools','enchanting'),'Carpenter’s Tools, Potter’s Tools, Woodcarver’s Tools');
  assert.match(cellOf(h,'qualifyTools','enchanting'),/From content · Check rolls no tool/,'Enchanting has no default check tool (it crafts with Arcana)');
  assert.equal(valueOf(h,'advantageTools','herbalism'),'Herbalism Kit');assert.equal(valueOf(h,'advantageTools','huntingskinning'),'Leatherworker’s Tools');
  assert.equal(valueOf(h,'advantageTools','mining'),'Mason’s Tools');
  for(const k of ['herbalism','huntingskinning','mining'])assert.match(cellOf(h,'advantageTools',k),/agl-mpick__origin">From content</);
  assert.match(h,/Gathering advantage: Archaeology \(Calligrapher’s Supplies\); Fishing \(Fishing Tackle, carried\); Herbalism \(Herbalism Kit\); Hunting \(Leatherworker’s Tools\); Mining \(Mason’s Tools\)\./);
  assert.equal(valueOf(h,'advantageTools','archaeology'),'Calligrapher’s Supplies');assert.match(cellOf(h,'advantageTools','archaeology'),/agl-mpick__origin">Default<[\s\S]*Not matched: Excavator's Tools/);
  assert.equal(valueOf(h,'advantageTools','fishing'),'Fishing Tackle (carried)');
  assert.match(cellOf(h,'advantageTools','fishing'),/agl-mpick__origin">Carried gear: Default<[\s\S]*Not matched: Fishing Rod[\s\S]*Tick the tool it means[\s\S]*<legend>Carried gear \(advantage while carried\)<\/legend>[\s\S]*data-map-cell="advantageItems" data-map-prof="fishing" value="Fishing Tackle" checked>[\s\S]*data-map-item-input[\s\S]*data-action="map-add-item" data-id="fishing">Add/);
  assert.match(cellOf(h,'qualifySkills','fishing'),/agl-mpick__origin">From content</);
  // Keyboard-reachable control: a button with aria-expanded/controls, a labelled group of checkboxes, Clear and Done.
  const c=cellOf(h,'qualifyTools','alchemy');
  assert.match(c,/<button type="button" class="agl-mpick__toggle" data-action="map-pick" aria-expanded="false" aria-controls="agl-mp-alchemy-qualifyTools" aria-label="Alchemy tool to access: Alchemist’s Supplies, Herbalism Kit"/);
  assert.match(c,/id="agl-mp-alchemy-qualifyTools" role="group" aria-label="Alchemy tool to access" hidden>/);
  assert.match(c,/value="alchemist" checked>[\s\S]*value="herb" checked>[\s\S]*value="brewer" >/,'ticked first, then the rest');
  assert.match(c,/data-action="map-clear" data-id="alchemy" data-list="qualifyTools">Clear \(None\)<\/button>/);assert.match(c,/data-action="map-pick-done">Done/);
  assert.match(c,/The first one is the tool the check rolls/);
  assert.doesNotMatch(h,/Several|<select data-map-cell/);
  assert.match(h,/<tr data-map-row="alchemy">[\s\S]*?data-action="map-reset" data-id="alchemy" aria-label="Reset Alchemy to default" hidden/,'nothing to reset yet');
});

test('multi-value edits: save stores the whole list only when it differs; the first value is the check; reset and round trip',async()=>{
  app.mapDraft=null;app.rosterDraft=new Set();app.element={querySelector:()=>null,querySelectorAll:()=>[]};
  app._setMapCell('qualifyTools','alchemy',['alchemist','herb']);assert.equal(app.mapDirty,false,'same as the content');
  app._setMapCell('qualifyTools','alchemy',['herb','alchemist','pois']);
  assert.deepEqual(app.mapDraft.qualifyTools.alchemy,['alchemist','herb','pois'],'existing order kept, the new one last');assert.equal(app.mapDraft.tools.alchemy,'alchemist');
  app._setMapCell('advantageTools','archaeology',['mason']);app._setMapCell('advantageTools','herbalism',['herb','alchemist']);
  app._setMapCell('qualifySkills','enchanting',['arc','his']);
  assert.equal(app.setupStatus,'Unsaved tool and check changes');
  await app._click('roster-save');
  assert.deepEqual(values.checkMapping.qualifyTools,{alchemy:['alchemist','herb','pois']});
  assert.deepEqual(values.checkMapping.advantageTools,{archaeology:['mason'],herbalism:['herb','alchemist']});
  assert.deepEqual(values.checkMapping.qualifySkills,{enchanting:['arc','his']});
  assert.deepEqual(values.checkMapping.tools,{},'check tools equal to the defaults are not stored');assert.deepEqual(values.checkMapping.skills,{});
  assert.deepEqual(compactCheckMapping(values.checkMapping),values.checkMapping,'already compact');
  assert.deepEqual(_test.advantageToolsFor('Archaeology'),['mason'],'the GM’s mapping of an unmatched name applies');
  assert.deepEqual(_test.advantageToolsFor('Herbalism'),['herb','alchemist']);
  // Rendered after save: every stored value shows, marked as the GM's.
  app.mapDraft=null;let h=await html();
  assert.equal(valueOf(h,'qualifyTools','alchemy'),'Alchemist’s Supplies, Herbalism Kit, Poisoner’s Kit');assert.match(cellOf(h,'qualifyTools','alchemy'),/Set by GM/);
  assert.doesNotMatch(cellOf(h,'advantageTools','archaeology'),/Not matched/,'mapped by the GM: no longer listed');
  assert.match(h,/data-action="map-reset" data-id="alchemy" aria-label="Reset Alchemy to default" (?!hidden)/,'Reset to default offered');
  // Unticking the check tool: the next one becomes the check.
  app._setMapCell('qualifyTools','alchemy',['herb','pois']);assert.equal(app.mapDraft.tools.alchemy,'herb');
  await app._click('roster-save');assert.deepEqual(values.checkMapping.tools,{alchemy:'herb'});
  // Ticking back to exactly what the content gives drops the GM list; the check goes back with the order.
  app._setMapCell('advantageTools','herbalism',['herb']);await app._click('roster-save');
  assert.equal(values.checkMapping.advantageTools.herbalism,undefined);
  // Reset to default removes the row's entries; the content applies again.
  await app._click('map-reset','alchemy');await app._click('map-reset','archaeology');await app._click('map-reset','enchanting');await app._click('roster-save');
  assert.deepEqual(values.checkMapping,{tools:{},skills:{},qualifySkills:{},qualifyTools:{},advantageTools:{},items:{},advantageItems:{}});
  h=await html();assert.equal(valueOf(h,'qualifyTools','alchemy'),'Alchemist’s Supplies, Herbalism Kit');assert.match(cellOf(h,'qualifyTools','alchemy'),/From content/);
  assert.deepEqual(errors,[]);
});

test('a stored list of several from an older version shows all of it and is never changed by an unrelated edit',async()=>{
  const old={tools:{mining:'smith'},qualifyTools:{mining:['smith','mason','tinker']},advantageTools:{herbalism:['herb','navg']},items:{fishing:['[TEST] Rod']},note:'[TEST] kept'};
  values.checkMapping=structuredClone(old);app.mapDraft=null;
  const h=await html();
  assert.equal(valueOf(h,'qualifyTools','mining'),'Smith’s Tools, Mason’s Tools, Tinker’s Tools');
  assert.equal(valueOf(h,'advantageTools','herbalism'),'Herbalism Kit, Navigator’s Tools');
  app._setMapCell('qualifySkills','cooking',['sur']);await app._click('roster-save');
  assert.deepEqual(values.checkMapping.qualifyTools,old.qualifyTools);assert.deepEqual(values.checkMapping.advantageTools,old.advantageTools);
  assert.deepEqual(values.checkMapping.items,old.items);assert.equal(values.checkMapping.note,'[TEST] kept');assert.equal(values.checkMapping.tools.mining,'smith');
  values.checkMapping={};app.mapDraft=null;
});

test('players: no catalog, no table; the API refuses GM Setup edits',async()=>{
  game.user=alice;
  try{assert.deepEqual(effectiveMapping({}).advantageTools.herbalism,[]);
    const h=(await app._prepareContext({})).html;assert.doesNotMatch(h,/data-map-picker/);
    await app._click('map-clear','alchemy',{list:'qualifyTools'});assert.ok(errors.some(e=>/GM only/.test(e)));errors.length=0;
  }finally{game.user=gm;}
});

// 0.27.0 (GM decision): Archaeology's built-in advantage tool is Calligrapher's Supplies; Fishing's is carrying Fishing Tackle.
const gear=(name,{qty=1,identifier=null,type='loot'}={})=>({id:`g-${name}`,name,type,system:{quantity:qty,...(identifier?{identifier}:{})}});
test('carried gear gives advantage on Fishing checks: name (any case) or dnd5e identifier; quantity 0 or no item gives none',()=>{
  const plan=_test.gatherCheckPlan(actor('angler'),{skill:'Fishing'});assert.deepEqual(plan.advantageItems,['Fishing Tackle']);
  const opts={advantageTools:plan.advantageTools,advantageItems:plan.advantageItems},check={kind:'skill',key:'sur'};
  let r=rollModeFor(actor('a1',{items:[gear('fishing tackle')]}),check,opts);
  assert.equal(r.mode,1);assert.deepEqual(r.sources,['Advantage: fishing tackle'],'named as the character’s item');
  r=rollModeFor(actor('a2',{items:[gear('[TEST] Angler’s kit',{identifier:'fishing-tackle'})]}),check,opts);assert.equal(r.mode,1,'dnd5e identifier');
  assert.equal(rollModeFor(actor('a3',{items:[gear('Fishing Tackle',{qty:0})]}),check,opts).mode,0,'quantity 0 is not carried');
  assert.equal(rollModeFor(plain,check,opts).mode,0,'no tackle, no advantage');
  assert.equal(rollModeFor(actor('a4',{items:[gear('Fishing Rod')]}),check,opts).mode,0,'another item does not count');
  // Archaeology: Calligrapher's Supplies by proficiency.
  const dig=_test.gatherCheckPlan(actor('d'),{skill:'Archaeology'});assert.deepEqual(dig.advantageTools,['calligrapher']);
  assert.deepEqual(rollModeFor(actor('d2',{tools:{calligrapher:1}}),{kind:'skill',key:'his'},{advantageTools:dig.advantageTools}).sources,['Advantage: Calligrapher’s Supplies']);
  // Crafting professions never get carried-gear advantage, even when a list is saved for them.
  values.checkMapping={advantageItems:{alchemy:['Fishing Tackle']}};assert.deepEqual(_test.advantageItemsFor('Alchemy'),[]);values.checkMapping={};
});

test('qualifying by carried items is unchanged: carrying Fishing Tackle does not qualify for Fishing by itself',()=>{
  const map=effectiveMapping({});
  assert.deepEqual(map.items.fishing,[]);assert.deepEqual(map.advantageItems.fishing,['Fishing Tackle']);
  const who=actor('q',{items:[gear('Fishing Tackle')]});who.system.skills={};
  assert.equal(qualifications(who,map).some(q=>q.key==='fishing'),false);
  assert.equal(qualifications(who,effectiveMapping({items:{fishing:['Fishing Tackle']}})).some(q=>q.key==='fishing'),true,'a saved items list still qualifies, as before');
});

test('GM Setup: carried gear is edited in the Tool for Advantage cell; saved only when it differs; Clear and Reset',async()=>{
  values.checkMapping={};app.mapDraft=null;app.rosterDraft=new Set();app.element={querySelector:()=>null,querySelectorAll:()=>[]};
  app._setMapCell('advantageItems','fishing',['Fishing Tackle','[TEST] Lucky Lure']);
  await app._click('roster-save');assert.deepEqual(values.checkMapping.advantageItems,{fishing:['Fishing Tackle','[TEST] Lucky Lure']});
  app.mapDraft=null;let h=await html();
  assert.equal(valueOf(h,'advantageTools','fishing'),'Fishing Tackle (carried), [TEST] Lucky Lure (carried)');assert.match(cellOf(h,'advantageTools','fishing'),/Carried gear: Set by GM/);
  assert.deepEqual(_test.advantageItemsFor('Fishing'),['Fishing Tackle','[TEST] Lucky Lure']);
  app._setMapCell('advantageItems','fishing',['fishing tackle']);await app._click('roster-save');
  assert.equal(values.checkMapping.advantageItems.fishing,undefined,'back to the default (any case): nothing stored');
  await app._click('map-clear','fishing',{list:'advantageTools'});await app._click('roster-save');
  assert.deepEqual(values.checkMapping.advantageItems,{fishing:[]},'Clear means none');assert.deepEqual(_test.advantageItemsFor('Fishing'),[]);
  app.mapDraft=null;h=await html();assert.equal(valueOf(h,'advantageTools','fishing'),'None');
  await app._click('map-reset','fishing');await app._click('roster-save');
  assert.deepEqual(values.checkMapping.advantageItems,{});assert.deepEqual(_test.advantageItemsFor('Fishing'),['Fishing Tackle']);
  // Archaeology's default tool can be cleared too.
  app._setMapCell('advantageTools','archaeology',[]);await app._click('roster-save');
  assert.deepEqual(values.checkMapping.advantageTools,{archaeology:[]});assert.deepEqual(_test.advantageToolsFor('Archaeology'),[]);
  values.checkMapping={};app.mapDraft=null;assert.deepEqual(errors,[]);
});

test('a baseline file can set carried gear for advantage (names kept as written)',()=>{
  const r=parseBaselineFile({professions:{Fishing:{advantageItems:['[TEST] Net','[test] net']}}});
  assert.equal(r.ok,true);assert.deepEqual(r.baseline.fishing.advantageItems,['[TEST] Net']);
  assert.deepEqual(effectiveMapping({},{baseline:r.baseline}).advantageItems.fishing,['[TEST] Net']);
});
