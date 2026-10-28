// 0.28.0: Artistry, the first creative profession. The registry (14 originals unchanged, then Artistry), classify, the
// Creative professions group in GM Setup, the "Any musical instrument" tool group, Artistry's default qualifiers, activity
// recipes (kind "activity": no ingredients, no result item) with Complete activity and the GM's XP award, crafting unchanged,
// and api.meetsProficiency with its permissions. Mocked Foundry: logic and markup only, not the live UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {PROFESSION_NAMES,classify,normalizeLibrary,normalizeRecipe} from '../scripts/core.mjs';
import {BUILTIN_PROFESSIONS,PROFESSION_CATEGORIES,allProfessions,declaredCategory,noteProfession,clearNotedProfessions,professionKeysIn} from '../scripts/professions.mjs';
import {effectiveMapping,toolGroupMembers,toolGroupOf,toolLabel,toolQualifies,requiredToolRef,expandToolGroups,craftCheckPlan,DEFAULT_QUALIFY_TOOLS} from '../scripts/checks.mjs';
import {PROFESSION_KEYS,allProfessionKeys,professionTitle,qualifications,catalogCrosswalk,parseBaselineFile,meetsAccess,definitionProfessionKey} from '../scripts/assign.mjs';
import {GATHERING_PROFESSIONS,xpForLevel} from '../scripts/progression.mjs';
import {craftBlockers} from '../scripts/crafting.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const character=({skills={},tools={},items=[]}={})=>({id:'c',name:'[TEST] Character',items,
  system:{skills:Object.fromEntries(Object.entries(skills).map(([k,v])=>[k,{value:v,total:v?4:1}])),tools:Object.fromEntries(Object.entries(tools).map(([k,v])=>[k,{value:v,total:v?5:1}])),abilities:{cha:{mod:2}}}});

test('registry: the 14 original professions are unchanged (names, keys, categories, order); Artistry is the 15th, creative',()=>{
  const originals=['Alchemy','Blacksmithing','Cooking','Enchanting','Engineering','Inscription','Jewelcrafting','Leatherworking','Tailoring','Archaeology','Fishing','Herbalism','Hunting/Skinning','Mining'];
  assert.deepEqual(BUILTIN_PROFESSIONS.slice(0,14).map(p=>p.name),originals);
  assert.deepEqual(PROFESSION_NAMES,[...originals,'Artistry']);
  assert.deepEqual(BUILTIN_PROFESSIONS.filter(p=>p.category==='gathering').map(p=>p.name),[...GATHERING_PROFESSIONS],'gathering = the 5 gathering professions, as before');
  assert.equal(BUILTIN_PROFESSIONS.filter(p=>p.category==='crafting').length,9);
  assert.deepEqual({...BUILTIN_PROFESSIONS[14]},{name:'Artistry',key:'artistry',id:'PROF-ARTISTRY',category:'creative'});
  assert.equal(BUILTIN_PROFESSIONS.find(p=>p.name==='Hunting/Skinning').key,'huntingskinning');
  assert.deepEqual(PROFESSION_CATEGORIES,['crafting','gathering','creative']);
  assert.equal(PROFESSION_KEYS.at(-1),'artistry');assert.equal(professionTitle('artistry'),'Artistry');assert.equal(professionTitle('huntingskinning'),'Hunting');
});

test('classify recognises Artistry and the creative category on imported Profession records',()=>{
  assert.equal(classify({name:'Artistry'}),'Profession','by name, like the built-ins');
  assert.equal(classify({name:'[TEST] Song',flags:{'ashen-gate-manager':{source:{sourceId:'PROF-ARTISTRY'}}}}),'Profession','by PROF id');
  assert.equal(classify({name:'[TEST] Puppetry',category:'creative'}),'Profession','category creative');
  assert.equal(classify({name:'[TEST] Puppetry',flags:{'ashen-gate-manager':{source:{definition:{profession_kind:'creative'}}}}}),'Profession','profession_kind on the stored definition');
  assert.equal(declaredCategory({profession_kind:'gathering'}),'gathering');
  assert.equal(classify({name:'[TEST] Bag',category:'crafting'}),null,'a plain category word on another record is not a profession');
  assert.equal(classify({name:'[TEST] Herb',flags:{'ashen-gate-profession-ledger':{entityType:'Material'}}}),'Material','explicit types still win');
  assert.equal(classify({name:'Inscription'}),'Profession');
});

test('an unknown profession imported with category creative joins the registry and the crosswalk without a code change',()=>{
  assert.equal(definitionProfessionKey('PROF-TEST-PUPPETRY','[TEST] Puppetry',null),null,'not without the creative category');
  assert.equal(definitionProfessionKey('PROF-TEST-PUPPETRY','[TEST] Puppetry','creative'),'puppetry');
  assert.deepEqual(professionKeysIn('creative'),['artistry','puppetry']);
  assert.ok(allProfessionKeys().includes('puppetry'));assert.equal(professionTitle('puppetry'),'Puppetry');
  assert.equal(classify({name:'Puppetry'}),'Profession');
  assert.ok(Array.isArray(effectiveMapping({}).qualifyTools.puppetry),'it gets a crosswalk row');
  assert.equal(noteProfession({name:'Alchemy',category:'creative'}),null,'a built-in is never re-registered');
  assert.equal(noteProfession({name:'[TEST] Weaving Songs',category:'crafting'}),null,'only creative professions are added at runtime');
  clearNotedProfessions();assert.deepEqual(professionKeysIn('creative'),['artistry']);
});

test('Artistry defaults: Performance, any musical instrument, Disguise Kit, Painter’s and Calligrapher’s Supplies; check skill Performance, no check tool',()=>{
  const map=effectiveMapping({});
  assert.deepEqual(map.qualifySkills.artistry,['prf']);
  assert.deepEqual(map.qualifyTools.artistry,['music','disg','painter','calligrapher']);
  assert.deepEqual(DEFAULT_QUALIFY_TOOLS.artistry,['music','disg','painter','calligrapher']);
  assert.equal(map.skills.artistry,'prf');assert.equal(map.tools.artistry,'');
  assert.deepEqual(map.advantageTools.artistry,[],'no advantage tools (gathering only)');
  assert.equal(map.origin.artistry.qualifyTools,'default');
  for(const k of ['alchemy','inscription','herbalism','fishing'])assert.deepEqual(effectiveMapping({}).qualifyTools[k],{alchemy:['alchemist'],inscription:['calligrapher'],herbalism:['herb'],fishing:[]}[k],`${k} unchanged`);
  const gm=effectiveMapping({qualifyTools:{artistry:['disg']},tools:{artistry:'disg'}});
  assert.deepEqual(gm.qualifyTools.artistry,['disg'],'the GM can change it');assert.equal(gm.origin.artistry.qualifyTools,'gm');
});

test('tool group "Any musical instrument": dnd5e config types when given, else the built-in instrument list',()=>{
  delete globalThis.CONFIG;
  assert.equal(toolLabel('music'),'Any musical instrument');
  assert.deepEqual(toolGroupMembers('music').sort(),['bagpipes','drum','dulcimer','flute','horn','lute','lyre','panflute','shawm','viol']);
  for(const n of ['Any musical instrument','Musical Instrument','music','any instrument'])assert.equal(toolGroupOf(n),'music',n);
  assert.equal(toolGroupOf('Disguise Kit'),null);
  assert.deepEqual(requiredToolRef('Any musical instrument'),{key:'music',uuid:null,name:'Any musical instrument'});
  // A fake dnd5e config: one entry says its type, one points at a compendium entry that says it, one is not an instrument.
  globalThis.CONFIG={DND5E:{tools:{hurdygurdy:{ability:'cha',type:'music'},ocarina:{ability:'cha',id:'Compendium.test.items.Item.oca'},disg:{ability:'cha',type:'game'},
    lute:{ability:'cha',id:'Compendium.test.items.Item.lute'}}}};
  globalThis.fromUuidSync=uuid=>uuid.endsWith('oca')?{system:{type:{value:'music'}}}:null;
  const members=toolGroupMembers('music');
  assert.ok(members.includes('hurdygurdy')&&members.includes('ocarina')&&members.includes('lute'));assert.ok(!members.includes('disg'));
  assert.equal(toolQualifies(character({tools:{hurdygurdy:1}}),'music'),true,'proficiency with an instrument from dnd5e’s config');
  assert.equal(toolQualifies(character({tools:{ocarina:1}}),'music'),true,'type read from the compendium index');
  assert.equal(toolQualifies(character({tools:{disg:1}}),'music'),false);
  assert.equal(toolQualifies(character({tools:{lute:0}}),'music'),false,'not proficient');
  assert.equal(toolQualifies(character({tools:{music:1}}),'music'),true,'proficiency with the whole category');
  delete globalThis.CONFIG;delete globalThis.fromUuidSync;
  assert.equal(toolQualifies(character({tools:{lyre:1}}),'music'),true,'fallback list without dnd5e');
});

test('qualification: a character with only Disguise Kit, or only Performance, or only a lute, qualifies for Artistry',()=>{
  const map=effectiveMapping({});
  const of=actor=>qualifications(actor,map).filter(q=>q.key==='artistry');
  assert.deepEqual(of(character({tools:{disg:1}})),[{key:'artistry',profession:'Artistry',reason:'Disguise Kit → Artistry'}]);
  assert.deepEqual(of(character({skills:{prf:1}})),[{key:'artistry',profession:'Artistry',reason:'Performance → Artistry'}]);
  assert.deepEqual(of(character({tools:{lute:1}})),[{key:'artistry',profession:'Artistry',reason:'Lute → Artistry'}],'the instrument that matched is named');
  assert.deepEqual(of(character({tools:{smith:1},skills:{ath:1}})),[],'nothing creative');
  const both=qualifications(character({tools:{calligrapher:1}}),map).map(q=>q.key);
  assert.deepEqual(both,['inscription','artistry'],'Calligrapher’s Supplies still gives Inscription, and now Artistry too');
});

test('catalog and baseline file: "Any musical instrument" resolves to the group for Artistry',()=>{
  const cat=catalogCrosswalk([{sourceId:'PROF-ARTISTRY',name:'Artistry',access:{toolProficienciesAnyOf:['Any musical instrument','Disguise Kit','Excavator’s Lute'],skillProficienciesAnyOf:['Performance']}}]);
  assert.deepEqual(cat.catalog.artistry.qualifyTools,['music','disg']);assert.deepEqual(cat.catalog.artistry.qualifySkills,['prf']);
  assert.deepEqual(cat.unresolved.map(u=>u.name),['Excavator’s Lute']);
  const file=parseBaselineFile({professions:{Artistry:{qualifyTools:['Musical instrument',"Painter's Supplies"]}}});
  assert.equal(file.ok,true);assert.deepEqual(file.baseline.artistry.qualifyTools,['music','painter']);assert.deepEqual(file.unknownProfessions,[]);
});

test('meetsAccess: tool names, groups and skills, as the crosswalk resolves them',()=>{
  const lute=character({tools:{lute:1}}),actor=character({skills:{prf:1},tools:{disg:1}});
  assert.deepEqual(meetsAccess(lute,{toolProficienciesAnyOf:['Any musical instrument']}),{ok:true,matched:['Any musical instrument']});
  assert.deepEqual(meetsAccess(lute,{toolProficienciesAnyOf:["Painter's Supplies"],skillProficienciesAnyOf:['Performance']}),{ok:false,matched:[]});
  assert.deepEqual(meetsAccess(actor,{toolProficienciesAnyOf:['Disguise Kit','music'],skillProficienciesAnyOf:['prf','History']}),{ok:true,matched:['Disguise Kit','prf']});
  assert.deepEqual(meetsAccess(actor,{}),{ok:true,matched:[]},'an empty list asks for nothing');
  assert.deepEqual(meetsAccess(actor,{toolProficienciesAnyOf:['Unknown Kit']}),{ok:false,matched:[]});
});

test('activity recipes: normalised with kind "activity", imported with no ingredients and no result item; craft recipes unchanged',()=>{
  const rec=(id,extra)=>({id,entity_type:'Recipe',status:'approved',version:'1.0.0',visibility:'player',scope:'generic_rules',provenance:{sources:['[TEST]']},refs:[],name:id,...extra});
  const pkg={manifest:{schema_version:'ag-foundry-import/0.2'},records:[
    rec('REC-TEST-BALLAD',{kind:'activity',profession_id:'PROF-ARTISTRY',tier:'apprentice',effort:'short',ingredients:[],required_tools:['Any musical instrument']}),
    rec('REC-TEST-SKETCH',{kind:'activity',profession_id:'PROF-ARTISTRY',tier:'journeyman',effort:'long'}),
    rec('REC-TEST-SALVE',{profession_id:'PROF-ALCHEMY',result_item_id:'ITEM-TEST-SALVE',tier:'apprentice',effort:'short',ingredients:[{material_id:'MAT-TEST-HERB',quantity:2}]})]};
  const lib=normalizeLibrary(pkg);
  const by=id=>lib.recipes.find(r=>r.id===id);
  assert.equal(by('REC-TEST-BALLAD').kind,'activity');assert.equal(by('REC-TEST-BALLAD').resultItemId,null);assert.deepEqual(by('REC-TEST-BALLAD').ingredients,[]);
  assert.equal(by('REC-TEST-SKETCH').kind,'activity');assert.equal(by('REC-TEST-SKETCH').effort,'long');
  assert.equal(by('REC-TEST-SALVE').kind,'craft','no kind → craft, as before');assert.equal(by('REC-TEST-SALVE').hasStructuredIngredients,true);
  assert.equal(lib.importSummary.unmappedRecipes,0,'activities are not counted as recipes missing their ingredients');
  assert.throws(()=>normalizeLibrary({...pkg,records:[rec('REC-TEST-BAD',{ingredients:[{material_id:'MAT-TEST-HERB',quantity:0}]})]}),/invalid ingredient/,'invalid craft recipes are still rejected');
  assert.equal(normalizeRecipe({id:'REC-TEST-OLD',name:'Old',recipe:{kind:'activity'}}).kind,'activity','legacy envelope');
  assert.equal(normalizeRecipe({id:'REC-TEST-X',name:'X',kind:'performance'}).kind,'craft','unknown kinds are crafts');
  // Blockers: no ingredient or result-item blockers for an activity; the known-recipe and level rules stay.
  const activity=by('REC-TEST-BALLAD'),crafter={name:'[TEST] Bard'};
  assert.deepEqual(craftBlockers({recipe:activity,crafter,knownIds:['REC-TEST-BALLAD'],result:null}),[]);
  assert.deepEqual(craftBlockers({recipe:activity,crafter,knownIds:[],result:null}),['[TEST] Bard has not learned this recipe.']);
  assert.equal(craftBlockers({recipe:{...by('REC-TEST-SALVE'),hasStructuredIngredients:false},crafter,knownIds:['REC-TEST-SALVE'],result:null}).length,2,'craft blockers unchanged');
});

test('check plan: a group tool becomes the instruments the character has; access skills are offered too',()=>{
  const bard=character({tools:{lute:1,flute:0},skills:{prf:1},items:[{type:'tool',name:'Flute',system:{type:{value:'music',baseItem:'flute'}}}]});
  const refs=expandToolGroups(bard,[requiredToolRef('Any musical instrument'),requiredToolRef('Disguise Kit')]);
  assert.deepEqual(refs.map(r=>r.key),['lute','flute','disg']);
  assert.deepEqual(expandToolGroups(character(),[requiredToolRef('Any musical instrument')]).map(r=>r.key),['music'],'nothing to play: the group stays (shown as missing)');
  const plan=craftCheckPlan(bard,{tools:refs,skill:'prf',skills:['prf','dec']});
  assert.deepEqual(plan.options.map(o=>`${o.kind}:${o.key}`),['tool:lute','tool:flute','tool:disg','skill:prf','skill:dec']);
  assert.equal(plan.choice,'tool:lute','the instrument the character is proficient with');
  assert.deepEqual(craftCheckPlan(bard,{tools:[{key:'smith',uuid:null,name:null}],skill:'arc'}).options.map(o=>o.key),['smith','arc'],'craft plans unchanged');
});

// ---- Ledger window, Complete activity, XP award, craft regression, api.meetsProficiency (mocked Foundry) ----
const hooks={},errors=[],chats=[],rolls=[],xpHooks=[];let api;
const values={partyRoster:['bard','smith'],playerAccessEnabled:true,libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]}};
const gm={id:'gm',isGM:true,name:'GM',active:true},alice={id:'u1',isGM:false,name:'Alice',active:true},bob={id:'u2',isGM:false,name:'Bob',active:true};
const users=[gm,alice,bob];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const dialogs=[];
class FakeDialog{constructor(o){this.opts=o;}render(){return this;}async close(){}static async wait(opts){dialogs.push(opts);return true;}}
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){this.rendered=true;return this;}},HandlebarsApplicationMixin:c=>c,DialogV2:FakeDialog}},utils:{escapeHTML:esc,randomID:()=>`id${Math.random().toString(36).slice(2,10)}`}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:(name,data)=>xpHooks.push({name,data})};
globalThis.ui={notifications:{info:()=>{},error:e=>errors.push(String(e))}};
globalThis.ChatMessage={create:async x=>{const m={id:`m${chats.length}`,...structuredClone(x),update:async u=>{for(const [k,v] of Object.entries(u)){const parts=k.split('.');let o=m;while(parts.length>1)o=o[parts.shift()];o[parts[0]]=v;}}};chats.push(m);return m;},getSpeaker:({actor}={})=>({alias:actor?.name})};
const src=(id,type,{visibility='player',status='approved',definition=null}={})=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility,status,version:'0.1.0',refs:[],...(definition?{definition}:{})}}});
const def=(id,type,extra={})=>({id,entity_type:type,version:'0.1.0',refs:[],...extra});
const worldDoc=(id,name,flags)=>({id,uuid:`Item.${id}`,name,img:'',type:'loot',flags,system:{description:{value:''}},testUserPermission:u=>u.isGM||flags['ashen-gate-manager'].source.visibility==='player',
  toObject(){return {_id:this.id,name:this.name,img:this.img,type:this.type,flags:structuredClone(this.flags),system:{description:{value:''}}};}});
const ballad=def('REC-TEST-BALLAD','Recipe',{name:'[TEST] Ballad',kind:'activity',profession_id:'PROF-TEST-ARTISTRY',tier:'apprentice',effort:'short',ingredients:[],required_tools:['Any musical instrument'],access:{skillProficienciesAnyOf:['Performance']}});
const opus=def('REC-TEST-OPUS','Recipe',{name:'[TEST] Opus',kind:'activity',profession_id:'PROF-TEST-ARTISTRY',tier:'expert',effort:'extended'});
const salve=def('REC-TEST-SALVE','Recipe',{name:'[TEST] Salve',profession_id:'PROF-TEST-ALCHEMY',result_item_id:'ITEM-TEST-SALVE',tier:'apprentice',effort:'short',ingredients:[{material_id:'MAT-TEST-HERB',quantity:1}]});
const world=[
  worldDoc('wherb','[TEST] Herb',src('MAT-TEST-HERB','Material',{definition:def('MAT-TEST-HERB','Material',{name:'[TEST] Herb'})})),
  worldDoc('wballad','Recipe: [TEST] Ballad',src('REC-TEST-BALLAD','Recipe',{definition:ballad})),
  worldDoc('wopus','Recipe: [TEST] Opus',src('REC-TEST-OPUS','Recipe',{definition:opus})),
  worldDoc('wsalve','Recipe: [TEST] Salve',src('REC-TEST-SALVE','Recipe',{definition:salve})),
  worldDoc('wsalveitem','[TEST] Salve',src('ITEM-TEST-SALVE','Item',{definition:def('ITEM-TEST-SALVE','Item',{name:'[TEST] Salve'})})),
  worldDoc('wart','[TEST] Artistry — Profession',src('PROF-TEST-ARTISTRY','Profession',{definition:def('PROF-TEST-ARTISTRY','Profession',{name:'[TEST] Artistry',profession_kind:'creative'})})),
  worldDoc('walch','[TEST] Alchemy — Profession',src('PROF-TEST-ALCHEMY','Profession',{definition:def('PROF-TEST-ALCHEMY','Profession',{name:'[TEST] Alchemy'})}))];
world.get=id=>world.find(x=>x.id===id);
const held=(id,name,flags,qty=1,extra={})=>({id,name,type:'loot',system:{quantity:qty,description:{value:''}},flags,...extra,toObject(){return {_id:this.id,name:this.name,type:this.type,system:structuredClone(this.system),flags:structuredClone(this.flags)};}});
const profItem=(id,name,prof)=>held(id,`${name} — Profession`,src(prof,'Profession',{definition:def(prof,'Profession',{name})}),1,{type:'feat'});
const makeActor=(id,name,ownerId,items,known,system)=>{const inv=[...items];inv.get=i=>inv.find(x=>x.id===i);let n=0;
  const a={id,name,type:'character',hasPlayerOwner:true,items:inv,flags:{'ashen-gate-profession-ledger':{knownRecipes:known}},system,
    testUserPermission:(u,role)=>u.isGM||u.id===ownerId||(role==='LIMITED'||role==='OBSERVER')&&id==='bard'&&u.id==='u2',
    setFlag:async(scope,key,v)=>{a.flags[scope]??={};a.flags[scope][key]=structuredClone(v);},
    updateEmbeddedDocuments:async(t,ups)=>{for(const u of ups){const it=inv.get(u._id);for(const [k,v] of Object.entries(u))if(k!=='_id'){const parts=k.split('.');let o=it;while(parts.length>1)o=o[parts.shift()];o[parts[0]]=v;}}return ups;},
    deleteEmbeddedDocuments:async(t,ids)=>{for(const i of ids)inv.splice(inv.findIndex(x=>x.id===i),1);return ids;},
    createEmbeddedDocuments:async(t,docs)=>{const out=docs.map(d=>held(`${id}-new${n++}`,d.name,d.flags,d.system?.quantity??1));inv.push(...out);return out;},
    rollSkill:async cfg=>{rolls.push({actor:id,skill:cfg.skill});return [{total:12}];},
    rollToolCheck:async cfg=>{rolls.push({actor:id,tool:cfg.tool});return [{total:15}];}};
  return a;};
const bard=makeActor('bard','[TEST] Bard','u1',[profItem('bart','[TEST] Artistry','PROF-TEST-ARTISTRY')],['REC-TEST-BALLAD','REC-TEST-OPUS'],
  {skills:{prf:{value:1,total:6}},tools:{lute:{value:1,total:5}},abilities:{cha:{mod:3}}});
const smith=makeActor('smith','[TEST] Smith','u2',[profItem('salch','[TEST] Alchemy','PROF-TEST-ALCHEMY'),held('sherb','[TEST] Herb',src('MAT-TEST-HERB','Material'),2)],['REC-TEST-SALVE'],
  {skills:{},tools:{alchemist:{value:1,total:4}},abilities:{int:{mod:2}}});
const actors=[bard,smith];
const mod={active:true,version:'0.37.8',get api(){return api},set api(v){api=v}};
globalThis.game={user:gm,users:{contents:users,get:id=>users.find(u=>u.id===id)},items:{contents:world,get:world.get},actors:{contents:actors,get:id=>actors.find(a=>a.id===id)},
  socket:{emit(){},on(){}},modules:{get:id=>id==='ashen-gate-profession-ledger'?mod:undefined},
  settings:{register(){},registerMenu(){},get:(i,k)=>values[k],set:async(i,k,v)=>{values[k]=v;}}};
await import(pathToFileURL(path.resolve(here,'../scripts/main.js')));hooks.init();hooks.ready();
const {_test}=await import(pathToFileURL(path.resolve(here,'../scripts/main.js')));
const app=api.open({view:'gm'});
app.element={querySelector:()=>null,querySelectorAll:()=>[]};
const html=async view=>{app.view=view;return (await app._prepareContext({})).html;};

test('GM Setup Tools and checks: a third group "Creative professions" with Artistry and its defaults, after crafting and gathering',async()=>{
  game.user=gm;
  const h=await html('gm');
  const crafting=h.indexOf('>Crafting professions<'),gathering=h.indexOf('>Gathering professions<'),creative=h.indexOf('>Creative professions<');
  assert.ok(crafting>0&&gathering>crafting&&creative>gathering,'three groups in order');
  const row=h.slice(h.indexOf('<tr data-map-row="artistry">'),h.indexOf('</tr>',h.indexOf('<tr data-map-row="artistry">')));
  assert.ok(h.indexOf('data-map-row="artistry"')>creative,'Artistry is in the creative group');
  assert.match(row,/data-map-list="qualifySkills"[\s\S]*?agl-mpick__value">Performance<\/span>[\s\S]*?Default/);
  assert.match(row,/data-map-list="qualifyTools"[\s\S]*?agl-mpick__value">Any musical instrument, Disguise Kit, Painter’s Supplies, Calligrapher’s Supplies<\/span>[\s\S]*?Default/);
  assert.match(row,/value="music" checked> Any musical instrument/,'the group is one choice in the list');
  assert.match(row,/<td><span class="agl-sub">—<\/span><\/td>/,'no tool for advantage (gathering only)');
  assert.match(row,/data-action="map-reset"[^>]*hidden/,'nothing changed from the defaults');
  // Unticking the group saves only that difference; the check tool is never the group.
  app.mapDraft=null;app._setMapCell('qualifyTools','artistry',['disg','music']);
  assert.deepEqual(app.mapDraft.qualifyTools.artistry,['music','disg']);assert.equal(app.mapDraft.tools.artistry,'disg','check tool: first real tool');
  app.mapDraft=null;app._setMapCell('qualifyTools','artistry',['music','disg','painter','calligrapher']);
  assert.equal(app.mapDraft.qualifyTools.artistry,undefined,'ticking the defaults back stores nothing');app.mapDraft=null;
});

test('Individual view: an activity shows Complete activity (no Needs/Makes); a craft recipe still shows Craft',async()=>{
  game.user=alice;app.actorId='bard';
  const h=await html('individual');
  const row=h.slice(h.lastIndexOf('<article',h.indexOf('[TEST] Ballad')),h.indexOf('</article>',h.indexOf('[TEST] Ballad')));
  assert.match(row,/data-action="complete-activity" data-id="REC-TEST-BALLAD" data-actor="bard"><i class="fa-solid fa-masks-theater" aria-hidden="true"><\/i> Complete activity<\/button>/);
  assert.match(row,/Activity<\/span>.*Apprentice<\/span>.*Short effort/s);
  assert.doesNotMatch(row,/Needs|Makes|No ingredient list/);
  assert.match(row,/Any musical instrument<\/span> <span class="ag-badge ag-badge--ok">Ready<\/span>/);
  assert.match(h,/data-action="complete-activity" data-id="REC-TEST-OPUS"/,'an activity naming no tool rolls the profession’s skill');
  game.user=bob;app.actorId='smith';
  assert.match(await html('individual'),/data-action="craft" data-id="REC-TEST-SALVE"/);
  game.user=gm;
});

test('Complete activity: rolls the check like Craft, posts a card with the GM’s XP award, creates and uses nothing',async()=>{
  game.user=alice;
  const items=bard.items.length;
  const out=await _test.performAction('complete-activity',{id:'REC-TEST-BALLAD',actorId:'bard'});
  assert.deepEqual(out,{ok:true,message:'[TEST] Bard completed [TEST] Ballad.'});
  assert.equal(bard.items.length,items,'no Item created');
  assert.deepEqual(rolls.at(-1),{actor:'bard',tool:'lute'},'rolled the instrument the bard plays');
  assert.match(dialogs.at(-1).window.title,/Complete \[TEST\] Ballad\?/);
  assert.match(dialogs.at(-1).content,/<select name="check">[\s\S]*Lute \(tool\) \+5[\s\S]*Performance \+6/,'same check pick as Craft');
  const card=chats.at(-1);
  assert.match(card.content,/\[TEST\] Bard completed \[TEST\] Ballad<\/strong><span>\[TEST\] Artistry · Apprentice · Short effort<\/span>/);
  assert.match(card.content,/Lute check:<\/strong> 15/);
  assert.deepEqual({...card.flags['ashen-gate-profession-ledger'].xp},{kind:'activity',actorId:'bard',actorName:'[TEST] Bard',professionId:'PROF-TEST-ARTISTRY',professionName:'[TEST] Artistry',suggested:1,suggestedBasis:'Suggested from the activity’s tier and effort: Apprentice and Short effort give 1 XP.',awarded:null},
    'the XP flag a craft card carries, plus the suggested amount (0.29.0: Apprentice, Short effort: 1 XP) and how it was worked out');
  assert.deepEqual(xpHooks.filter(h=>h.name==='ashenGateLedger.xpOpportunity').at(-1).data.effort,'short','the effort travels with the XP opportunity');
  assert.equal(bard.flags['ashen-gate-profession-ledger'].professionProgress,undefined,'no XP until the GM awards it');
  await assert.rejects(()=>_test.awardXpFromCard(card,2),/Only the GM/);
  game.user=gm;
  await _test.awardXpFromCard(card,2);
  assert.equal(api.getProfessionProgress(bard,'PROF-TEST-ARTISTRY').xp,2);
  await assert.rejects(()=>_test.awardXpFromCard(card,2),/already awarded/);
  // Tier rules are the same as recipes: an Expert activity needs profession level 7.
  game.user=alice;await assert.rejects(()=>_test.performAction('complete-activity',{id:'REC-TEST-OPUS',actorId:'bard'}),/Needs Expert \(profession level 7\); \[TEST\] Bard is level 1\./);
  game.user=gm;await api.adjustProfessionXP(bard,'PROF-TEST-ARTISTRY',{set:xpForLevel(7)});
  // Extended effort, no tool named: the profession's check skill (Performance) is rolled.
  game.user=alice;await _test.performAction('complete-activity',{id:'REC-TEST-OPUS',actorId:'bard'});
  assert.deepEqual(rolls.at(-1),{actor:'bard',skill:'prf'});assert.match(chats.at(-1).content,/Expert · Extended effort/);
  game.user=gm;
});

test('Complete activity refusals: not owned, not learned, a craft recipe; Craft refuses an activity',async()=>{
  game.user=bob;
  await assert.rejects(()=>_test.performAction('complete-activity',{id:'REC-TEST-BALLAD',actorId:'bard'}),/own that character/);
  await assert.rejects(()=>_test.performAction('complete-activity',{id:'REC-TEST-BALLAD',actorId:'smith'}),/has not learned/);
  await assert.rejects(()=>_test.performAction('complete-activity',{id:'REC-TEST-SALVE',actorId:'smith'}),/crafted, not completed/);
  game.user=alice;
  await assert.rejects(()=>_test.performAction('craft',{id:'REC-TEST-BALLAD',actorId:'bard'}),/is an activity: use Complete activity/);
  game.user=gm;
});

test('craft regression: crafting still uses the ingredients, makes the item and posts a craft card',async()=>{
  game.user=bob;
  const before=smith.items.find(i=>i.id==='sherb').system.quantity;
  const out=await _test.performAction('craft',{id:'REC-TEST-SALVE',actorId:'smith'});
  assert.equal(out.ok,true);assert.match(out.message,/crafted \[TEST\] Salve/);
  assert.equal(smith.items.find(i=>i.id==='sherb').system.quantity,before-1);
  assert.ok(smith.items.some(i=>i.name==='[TEST] Salve'),'item created');
  assert.equal(chats.at(-1).flags['ashen-gate-profession-ledger'].xp.kind,'craft');
  assert.deepEqual(rolls.at(-1),{actor:'smith',tool:'alchemist'});
  game.user=gm;
});

test('api.meetsProficiency: GM or anyone who can see the character; not tied to Player Access; access shape checked',()=>{
  const access={toolProficienciesAnyOf:['Any musical instrument']};
  game.user=gm;assert.deepEqual(api.meetsProficiency('bard',access),{ok:true,matched:['Any musical instrument']});
  game.user=alice;assert.deepEqual(api.meetsProficiency(bard,{skillProficienciesAnyOf:['Performance','History']}),{ok:true,matched:['Performance']},'owner; an Actor works too');
  game.user=bob;assert.deepEqual(api.meetsProficiency('bard',{toolProficienciesAnyOf:['Disguise Kit']}),{ok:false,matched:[]},'observer');
  game.user=alice;assert.throws(()=>api.meetsProficiency('smith',access),/Actor access denied/,'no permission on that character');
  assert.throws(()=>api.meetsProficiency('nobody',access),/No Actor/);
  assert.throws(()=>api.meetsProficiency('bard',['Lute']),/Access must be/);
  values.playerAccessEnabled=false;assert.equal(api.meetsProficiency('bard',access).ok,true,'works with Ledger Player Access off');values.playerAccessEnabled=true;
  game.user=gm;
  assert.deepEqual(api.professions().map(p=>p.category).filter((c,i,a)=>a.indexOf(c)===i),['crafting','gathering','creative']);
  assert.deepEqual(errors,[]);
});

/* ---- 0.37.6: Complete activity needs the tool (tool-based compositions only) ---------------------------------- */
test('Complete activity is disabled and refused without the tool; owned tool or proficiency enables it; instrument group; station compositions and Craft are not blocked',async()=>{
  const mk=(wid,id,name,extra)=>worldDoc(wid,`Recipe: ${name}`,src(id,'Recipe',{definition:def(id,'Recipe',{name,kind:'activity',profession_id:'PROF-TEST-ARTISTRY',tier:'apprentice',effort:'short',ingredients:[],access:{skillProficienciesAnyOf:['Performance']},...extra})}));
  const added=[mk('wl','REC-TEST-LETTER','[TEST] Letter Home',{required_tools:['Calligrapher’s Supplies']}),mk('wa','REC-TEST-ANTHEM','[TEST] Anthem',{required_tools:['Any musical instrument']}),
    mk('ws','REC-TEST-STAGE','[TEST] Stage Piece',{workstation:'Rehearsal stage',required_tools:['Calligrapher’s Supplies']})];
  world.push(...added);
  const scribe=makeActor('scribe','[TEST] Scribe','u1',[profItem('sart','[TEST] Artistry','PROF-TEST-ARTISTRY')],['REC-TEST-LETTER','REC-TEST-ANTHEM','REC-TEST-STAGE'],{skills:{prf:{value:1,total:6}},tools:{},abilities:{cha:{mod:3}}});
  actors.push(scribe);values.partyRoster=['scribe','smith'];
  const card=async id=>{app.actorId='scribe';const h=await html('individual');const at=h.indexOf(id);return h.slice(h.lastIndexOf('<article',at),h.indexOf('</article>',at));};
  try{
    game.user=alice;
    // Missing: a real disabled button, the reason as visible text, linked by aria-describedby; the existing badge stays.
    let row=await card('Letter Home');
    assert.match(row,/<button type="button" class="ag-btn" disabled aria-describedby="(agl-need-[a-z0-9]+)"><i[^>]*><\/i> Complete activity<\/button><span class="agl-reason" id="\1">Needs Calligrapher’s Supplies<\/span>/);
    assert.doesNotMatch(row,/data-action="complete-activity"/);assert.match(row,/doesn’t have this/);
    const before=chats.length;
    await assert.rejects(()=>_test.performAction('complete-activity',{id:'REC-TEST-LETTER',actorId:'scribe'}),/Needs Calligrapher’s Supplies \(\[TEST\] Scribe doesn’t have it\)\./);
    await assert.rejects(()=>api.completeActivity(scribe,'REC-TEST-LETTER',{confirm:false}),/Needs Calligrapher’s Supplies/);
    assert.equal(chats.length,before,'no card, no roll');
    // The GM is blocked the same way (there is no GM override).
    game.user=gm;await assert.rejects(()=>_test.performAction('complete-activity',{id:'REC-TEST-LETTER',actorId:'scribe'}),/Needs Calligrapher’s Supplies/);game.user=alice;
    // Instrument group: any one instrument, said as a list.
    row=await card('Anthem');assert.match(row,/disabled aria-describedby[\s\S]*?class="agl-reason" id="[^"]+">Needs one of: Any musical instrument|Needs Any musical instrument/);
    // Owned tool Item enables it, and it works.
    scribe.items.push(held('scal','Calligrapher’s Supplies',{},1,{type:'tool'}));
    row=await card('Letter Home');assert.match(row,/data-action="complete-activity" data-id="REC-TEST-LETTER" data-actor="scribe"/);assert.doesNotMatch(row,/Needs Calligrapher/);
    await _test.performAction('complete-activity',{id:'REC-TEST-LETTER',actorId:'scribe'});assert.match(chats.at(-1).content,/Letter Home/);
    // Tool proficiency counts too (the same test as the “doesn’t have this” badge); a group is met by any instrument.
    scribe.system.tools={lute:{value:1,total:5}};
    row=await card('Anthem');assert.match(row,/data-action="complete-activity" data-id="REC-TEST-ANTHEM"/);
    // Station composition: the tool is a check choice and never blocks.
    scribe.items.pop();scribe.system.tools={};
    row=await card('Stage Piece');assert.match(row,/data-action="complete-activity" data-id="REC-TEST-STAGE"/);
    await _test.performAction('complete-activity',{id:'REC-TEST-STAGE',actorId:'scribe'});
    // Ordinary Craft with a missing tool still only warns (unchanged).
    game.user=bob;app.actorId='smith';smith.system.tools={};
    assert.match(await html('individual'),/data-action="craft" data-id="REC-TEST-SALVE"/,'Craft stays enabled without the Alchemist tool');
  }finally{
    for(const d of added)world.splice(world.indexOf(d),1);actors.splice(actors.indexOf(scribe),1);values.partyRoster=['bard','smith'];smith.system.tools={alchemist:{value:1,total:4}};game.user=gm;
  }
});
