import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {effectiveMapping,carriedItem} from '../scripts/checks.mjs';
import {catalogCrosswalk,qualifications,parseBaselineFile,baselineChanges,exportCrosswalk} from '../scripts/assign.mjs';
// 0.20.0: crosswalk items (carried core items qualify) and the GM's baseline file layer. Mocked Foundry; logic only.
const hooks={},errors=[],infos=[];let api,confirmAnswer=true;
const values={partyRoster:['ana','bo'],libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]},checkMapping:{},crosswalkBaseline:{}};
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
  profDoc('wfish','PROF-TG-FISHING','[TEST] Fishing'),
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
const tackle={id:'tk',name:'fishing tackle',type:'loot',uuid:'Actor.bo.Item.tk',system:{quantity:1},_stats:{compendiumSource:'Compendium.dnd5e.equipment24.Item.tackle'}};
const bo=makeActor('bo','[TEST] Bo',{tools:{mason:1,cook:1},items:[tackle]});
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


const FILE={professions:{Fishing:{qualifySkills:['Survival'],items:['Fishing Tackle','Compendium.dnd5e.equipment24.Item.net']},
  herbalism:{advantageTools:['Herbalism Kit'],qualifyTools:['herb','[TEST] Sickle']},Juggling:{items:['Ball']}}};

test('carried items: name any case, core uuid, Manager core link; quantity 0 is not carried',()=>{
  assert.equal(carriedItem(bo,'Fishing Tackle')?.id,'tk');
  assert.equal(carriedItem(bo,'Compendium.dnd5e.equipment24.Item.tackle')?.id,'tk');
  assert.equal(carriedItem(cy,'Fishing Tackle'),null);
  const linked={items:[{name:'[TEST] Net',system:{quantity:2},flags:{'ashen-gate-manager':{coreLink:{uuid:'Compendium.dnd5e.equipment24.Item.net'}}}}]};
  assert.equal(carriedItem(linked,'Compendium.dnd5e.equipment24.Item.net')?.name,'[TEST] Net');
  assert.equal(carriedItem({items:[{name:'Fishing Tackle',system:{quantity:0}}]},'Fishing Tackle'),null);
});

test('Assign: a legacy items list still qualifies by carrying (0.22.0: none built in, Fishing is accessed by Survival)',()=>{
  assert.deepEqual(qualifications(bo,effectiveMapping({})).map(q=>q.profession),['Cooking','Mining'],'no built-in Fishing Tackle');
  values.checkMapping={items:{fishing:['Fishing Tackle']}};
  const map=effectiveMapping(values.checkMapping);
  assert.deepEqual(qualifications(bo,map).map(q=>q.reason),['Cook’s Utensils → Cooking','fishing tackle (carried) → Fishing','Mason’s Tools → Mining']);
  const p=api.assign.preview();
  const row=p.rows.find(r=>r.profession==='Fishing');
  assert.deepEqual([row.actorName,row.reason,row.status,row.sourceId],['[TEST] Bo','fishing tackle (carried) → Fishing','propose','PROF-TG-FISHING']);
  assert.ok(!p.rows.some(r=>r.actorName==='[TEST] Ana'&&r.profession==='Fishing'));
  values.checkMapping={};
});

test('catalog itemsAnyOf is additive; a catalog row without it has no items (0.22.0)',()=>{
  const {catalog}=catalogCrosswalk([{name:'Fishing',access:{skillProficienciesAnyOf:['Nature']}},{name:'Cooking',access:{itemsAnyOf:['[TEST] Pan','[test] pan']}}]);
  const map=effectiveMapping({},{catalog});
  assert.deepEqual(map.items.fishing,[]);assert.equal(map.origin.fishing.items,'default');
  assert.deepEqual(map.items.cooking,['[TEST] Pan']);assert.equal(map.origin.cooking.items,'catalog');
});

test('baseline file: parses names or ids, reports unknowns, layers above the catalog and below GM edits',()=>{
  const r=parseBaselineFile(FILE);
  assert.equal(r.ok,true);
  assert.deepEqual(r.baseline.fishing,{qualifySkills:['sur'],items:['Fishing Tackle','Compendium.dnd5e.equipment24.Item.net']});
  assert.deepEqual(r.baseline.herbalism,{advantageTools:['herb'],qualifyTools:['herb']});
  assert.deepEqual(r.unresolved,[{profession:'Herbalism',list:'qualifyTools',name:'[TEST] Sickle'}]);
  assert.deepEqual(r.unknownProfessions,['Juggling']);
  const catalog={herbalism:{qualifySkills:['nat'],qualifyTools:['alchemist'],advantageTools:[]}};
  const m=effectiveMapping({qualifyTools:{herbalism:['smith']}},{catalog,baseline:r.baseline});
  assert.deepEqual([m.qualifyTools.herbalism,m.origin.herbalism.qualifyTools],[['smith'],'gm'],'GM edit wins');
  assert.deepEqual([m.advantageTools.herbalism,m.origin.herbalism.advantageTools],[['herb'],'baseline'],'file beats catalog');
  assert.deepEqual([m.qualifySkills.herbalism,m.origin.herbalism.qualifySkills],[['nat'],'catalog'],'a list the file leaves out falls through');
  assert.deepEqual([m.qualifySkills.fishing,m.origin.fishing.qualifySkills],[['sur'],'baseline']);
  assert.equal(parseBaselineFile({}).ok,false);
  assert.match(parseBaselineFile({professions:{Fishing:{items:'Fishing Tackle'}}}).errors[0],/items must be a list/);
});

test('baseline changes list only the rows the file changes, and mark where a GM edit still wins',()=>{
  const {baseline}=parseBaselineFile(FILE);
  const map=effectiveMapping({qualifySkills:{fishing:['nat']}});
  const rows=baselineChanges(null,baseline,map);
  assert.deepEqual(rows.map(c=>[c.key,c.list,c.gmWins]).sort(),[['fishing','items',false],['fishing','qualifySkills',true],['herbalism','advantageTools',false],['herbalism','qualifyTools',false]]);
  assert.deepEqual(baselineChanges(baseline,baseline,map),[]);
});

test('GM imports a baseline file: preview writes nothing, Apply stores it, checks and Assign use it; export round-trips',async()=>{
  const before=JSON.stringify(values);
  const p=api.crosswalk.previewBaseline(FILE);
  assert.equal(JSON.stringify(values),before,'preview writes nothing');
  assert.ok(p.changes.length>0);
  app.element={querySelector:()=>null,querySelectorAll:()=>[]};
  app.baselinePreview={fileName:'[TEST] baseline.json',data:FILE,result:p};
  let h=await html('gm');
  assert.match(h,/Preview: \[TEST\] baseline\.json/);assert.match(h,/data-action="xwalk-apply"/);assert.match(h,/“Juggling” is not a profession/);
  assert.doesNotMatch(h,/data-map-items/,'0.22.0: no items column');
  await app._click('xwalk-apply');
  assert.equal(values.crosswalkBaseline.fileName,'[TEST] baseline.json');
  assert.deepEqual(values.crosswalkBaseline.professions.fishing.qualifySkills,['sur']);
  assert.equal(app.baselinePreview,null);
  h=await html('gm');assert.match(h,/data-map-cell="advantageTools" data-map-prof="herbalism"[^>]*>\s*<option value="" >None<\/option>[\s\S]*?<option value="herb" selected>/,'file advantage tool shown');assert.match(h,/Baseline file<\/b>: \[TEST\] baseline\.json/);
  const out=api.crosswalk.exportTable();
  assert.equal(out.schema,'ag-ledger-crosswalk/1');
  assert.deepEqual(out.professions.fishing.items,['Fishing Tackle','Compendium.dnd5e.equipment24.Item.net']);
  assert.equal(out.professions.fishing.origin.qualifySkills,'baseline');
  const back=parseBaselineFile(out);
  assert.equal(back.ok,true);assert.deepEqual(back.unknownProfessions,[]);
  assert.deepEqual(effectiveMapping({},{baseline:back.baseline}).qualifySkills.fishing,['sur'],'export reads back as a baseline');
  values.crosswalkBaseline={};
});

test('legacy GM items are kept by edits and Reset (no items UI); bad files never apply',async()=>{
  values.checkMapping={items:{fishing:['Fishing Tackle','[TEST] Rod']}};
  app.mapDraft=null;app.element={querySelector:()=>null,querySelectorAll:()=>[]};app.rosterDraft=new Set(values.partyRoster);
  app._rememberMapDraft({dataset:{mapCell:'qualifyTools',mapProf:'fishing'},value:'navg'});
  await app._click('roster-save');
  assert.deepEqual(values.checkMapping.items,{fishing:['Fishing Tackle','[TEST] Rod']});
  assert.equal(effectiveMapping(values.checkMapping).origin.fishing.items,'gm');
  await app._click('map-reset','fishing');await app._click('roster-save');
  assert.deepEqual(values.checkMapping.qualifyTools,{});assert.deepEqual(values.checkMapping.items,{fishing:['Fishing Tackle','[TEST] Rod']},'Reset leaves the legacy list');
  values.checkMapping={};
  await assert.rejects(api.crosswalk.applyBaseline({professions:[]}),/not applied/);
  assert.deepEqual(values.crosswalkBaseline,{});
});

test('players cannot preview, apply or export the crosswalk (API refuses)',async()=>{
  game.user=alice;
  try{
    assert.throws(()=>api.crosswalk.previewBaseline(FILE),/Only the GM/);
    await assert.rejects(api.crosswalk.applyBaseline(FILE),/Only the GM/);
    assert.throws(()=>api.crosswalk.exportTable(),/Only the GM/);
    assert.deepEqual(values.crosswalkBaseline,{});
  }finally{game.user=gm;}
});
