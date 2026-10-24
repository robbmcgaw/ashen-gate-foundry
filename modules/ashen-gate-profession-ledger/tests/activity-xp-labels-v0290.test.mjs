// 0.29.0: suggested XP for activities (the whole 5 × 3 table), the activity effect note (normalizeRecipe, recipe detail,
// chat card), and per-profession recipe names (pure helpers, imported labels, draft built-in names, GM Setup editor, the
// public api.recipeLabel). Mocked Foundry: logic and markup only, not the live UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {normalizeRecipe,normalizeLibrary,effectNoteOf,EFFECT_NOTE_MAX} from '../scripts/core.mjs';
import {suggestActivityXP,TIERS} from '../scripts/progression.mjs';
import {DRAFT_RECIPE_LABEL_DEFAULTS,GENERIC_RECIPE_LABEL,cleanRecipeLabel,recipeLabelsOf,pluralLabel,caseLabel,resolveRecipeLabels,pickRecipeLabel,cleanLabelStore} from '../scripts/recipe-labels.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));

test('suggestActivityXP: max(1, ceil(tier × effort / 2)) over the whole 5 × 3 table',()=>{
  const expected={Apprentice:[1,1,2],Journeyman:[1,2,3],Expert:[2,3,5],Artisan:[2,4,6],Master:[3,5,8]};
  assert.deepEqual(TIERS,['Apprentice','Journeyman','Expert','Artisan','Master']);
  for(const [i,tier] of TIERS.entries())for(const [j,effort] of ['Short','Long','Extended'].entries()){
    const s=suggestActivityXP(tier,effort);
    assert.equal(s.xp,expected[tier][j],`${tier} ${effort}`);
    assert.equal(s.xp,Math.max(1,Math.ceil((i+1)*(j+1)/2)));
    assert.equal(suggestActivityXP(tier.toLowerCase(),effort.toLowerCase()).xp,s.xp,'case does not matter');
    assert.equal(suggestActivityXP(i+1,effort).xp,s.xp,'a tier number 1–5 works too');
  }
  assert.equal(suggestActivityXP('Apprentice','Short').xp,1);
  assert.equal(suggestActivityXP('Journeyman','Long').xp,2);
  assert.equal(suggestActivityXP('Master','Extended').xp,8);
});

test('suggestActivityXP: a missing or unknown tier is Apprentice, effort Short; the text says how in plain words',()=>{
  for(const [tier,effort] of [[null,null],[undefined,''],['Legendary','Forever'],[0,'x'],[6,{}],[true,1]]){
    const s=suggestActivityXP(tier,effort);
    assert.equal(s.xp,1);assert.equal(s.tier,'Apprentice');assert.equal(s.effort,'Short');assert.ok(s.tierAssumed&&s.effortAssumed);
  }
  assert.equal(suggestActivityXP('Master',null).xp,3,'Master, effort missing → Short');
  assert.equal(suggestActivityXP(null,'Extended').xp,2,'tier missing → Apprentice, Extended');
  assert.equal(suggestActivityXP('Journeyman','Long').text,'Suggested from the activity’s tier and effort: Journeyman and Long effort give 2 XP.');
  assert.equal(suggestActivityXP(null,'Long').text,'Suggested from the activity’s tier and effort: Apprentice and Long effort give 1 XP (no tier set, so Apprentice).');
  assert.equal(suggestActivityXP('Expert','Forever').text,'Suggested from the activity’s tier and effort: Expert and Short effort give 2 XP (effort not recognised, so Short).');
  assert.doesNotMatch(suggestActivityXP('Master','Extended').text,/REC-|PROF-|undefined|null/);
});

test('effect note: effect_note or effectNote, plain text up to 400 characters, kept through normalizeRecipe and import',()=>{
  const base={id:'REC-TEST-SONG',entity_type:'Recipe',version:'0.1.0',refs:[],name:'[TEST] Song',kind:'activity',profession_id:'PROF-ARTISTRY',tier:'Journeyman',effort:'Long'};
  const r=normalizeRecipe({...base,sourceDefinition:{...base,effect_note:'  [TEST] Allies   gain a boon. '}});
  assert.equal(r.effectNote,'[TEST] Allies gain a boon.');
  assert.equal(r.sourceDefinition.effect_note,'  [TEST] Allies   gain a boon. ','the definition is kept as authored');
  assert.equal(normalizeRecipe({...base,sourceDefinition:{...base,effectNote:'[TEST] camel'}}).effectNote,'[TEST] camel');
  assert.equal(normalizeRecipe({...base,sourceDefinition:{...base}}).effectNote,null,'no note');
  for(const bad of [42,{text:'x'},['x'],true,'   '])assert.equal(normalizeRecipe({...base,sourceDefinition:{...base,effect_note:bad}}).effectNote,null,`ignored: ${JSON.stringify(bad)}`);
  const long='[TEST] '+'a'.repeat(600);
  const cut=normalizeRecipe({...base,sourceDefinition:{...base,effect_note:long}}).effectNote;
  assert.equal(cut.length,EFFECT_NOTE_MAX);assert.ok(cut.endsWith('…'));
  assert.equal(effectNoteOf(null,{effect_note:'[TEST] second source'}),'[TEST] second source');
  assert.equal(normalizeRecipe(r).effectNote,r.effectNote,'a normalized recipe normalizes to the same note');
  const pkg={schema:'ag-ledger/0.1',materials:[],recipes:[{id:'REC-TEST-SONG',name:'[TEST] Song',visibility:'player',status:'approved',kind:'activity',effect_note:'[TEST] boon'}]};
  assert.equal(normalizeLibrary(pkg).recipes[0].effectNote,'[TEST] boon');
});

test('recipe labels (pure): clean 1–30 characters, plural, case, layers, the draft defaults and the saved store',()=>{
  assert.deepEqual(GENERIC_RECIPE_LABEL,{singular:'Recipe',plural:'Recipes'});
  assert.deepEqual(Object.keys(DRAFT_RECIPE_LABEL_DEFAULTS).sort(),['alchemy','artistry','blacksmithing']);
  assert.equal(cleanRecipeLabel('  Formula  '),'Formula');assert.equal(cleanRecipeLabel('a'.repeat(30)),'a'.repeat(30));
  for(const bad of ['','  ','a'.repeat(31),7,null,{},['x']])assert.equal(cleanRecipeLabel(bad),null);
  assert.deepEqual(recipeLabelsOf({recipeLabel:'Formula'}),{singular:'Formula',plural:null});
  assert.equal(recipeLabelsOf({recipeLabel:'x'.repeat(40)}),null,'an over-long label is ignored');
  assert.equal(recipeLabelsOf(null),null);
  assert.deepEqual(['Formula','Glass','Box','Story','Day','Patch'].map(pluralLabel),['Formulas','Glasses','Boxes','Stories','Days','Patches']);
  assert.equal(caseLabel('Formula',false),'formula');assert.equal(caseLabel('formula'),'Formula');assert.equal(caseLabel('DIY plan',false),'DIY plan');
  assert.deepEqual(resolveRecipeLabels([]),{singular:'Recipe',plural:'Recipes',layer:0});
  const draft=DRAFT_RECIPE_LABEL_DEFAULTS.alchemy;
  assert.equal(resolveRecipeLabels([null,null,draft]).singular,'Formula');
  assert.deepEqual(resolveRecipeLabels([null,{singular:'Tincture',plural:null},draft]).plural,'Tinctures','an imported singular makes its own plural, not the default’s');
  assert.equal(resolveRecipeLabels([{singular:'Brew'},{singular:'Tincture',plural:'Tinctures'},draft]).plural,'Brews','the GM layer wins');
  assert.deepEqual(resolveRecipeLabels([{plural:'Formulae'},null,draft]),{singular:'Formula',plural:'Formulae',layer:0},'a plural only changes the plural');
  assert.deepEqual(resolveRecipeLabels([{plural:'Scores'}]),{singular:'Score',plural:'Scores',layer:0},'a plural alone also gives the singular');
  assert.equal(pickRecipeLabel({singular:'Formula',plural:'Formulas'},{plural:true,capitalize:false}),'formulas');
  assert.deepEqual(cleanLabelStore({alchemy:{singular:' Brew ',plural:''},'bad key':{singular:'x'},cooking:'Dish',mining:{singular:'x'.repeat(31)}}),{alchemy:{singular:'Brew'}});
  assert.deepEqual(cleanLabelStore(['x']),{});
});

// ---- Ledger window, chat card, api (mocked Foundry) ----
const hooks={},errors=[],chats=[],rolls=[],xpHooks=[];let api;
const values={partyRoster:['bard','smith'],playerAccessEnabled:true,libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]},recipeLabels:{}};
const gm={id:'gm',isGM:true,name:'GM',active:true},alice={id:'u1',isGM:false,name:'Alice',active:true},bob={id:'u2',isGM:false,name:'Bob',active:true};
const users=[gm,alice,bob];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const dialogs=[];
class FakeDialog{constructor(o){this.opts=o;}render(){return this;}async close(){}static async wait(opts){dialogs.push(opts);return true;}}
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){this.rendered=true;return this;}},HandlebarsApplicationMixin:c=>c,DialogV2:FakeDialog}},utils:{escapeHTML:esc,randomID:()=>`id${Math.random().toString(36).slice(2,10)}`}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:(name,data)=>xpHooks.push({name,data})};
globalThis.ui={notifications:{info:()=>{},error:e=>errors.push(String(e))}};
globalThis.ChatMessage={create:async x=>{const m={id:`m${chats.length}`,...structuredClone(x)};chats.push(m);return m;},getSpeaker:({actor}={})=>({alias:actor?.name})};
const src=(id,type,{visibility='player',status='approved',definition=null}={})=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility,status,version:'0.1.0',refs:[],...(definition?{definition}:{})}}});
const def=(id,type,extra={})=>({id,entity_type:type,version:'0.1.0',refs:[],...extra});
const worldDoc=(id,name,flags)=>({id,uuid:`Item.${id}`,name,img:'',type:'loot',flags,system:{description:{value:''}},testUserPermission:u=>u.isGM||flags['ashen-gate-manager'].source.visibility==='player',
  toObject(){return {_id:this.id,name:this.name,img:this.img,type:this.type,flags:structuredClone(this.flags),system:{description:{value:''}}};}});
const ballad=def('REC-TEST-BALLAD','Recipe',{name:'[TEST] Ballad',kind:'activity',profession_id:'PROF-TEST-ARTISTRY',tier:'journeyman',effort:'long',ingredients:[],
  effect_note:'[TEST] Listeners gain a small boon until dawn.',access:{skillProficienciesAnyOf:['Performance']}});
const salve=def('REC-TEST-SALVE','Recipe',{name:'[TEST] Salve',profession_id:'PROF-TEST-ALCHEMY',result_item_id:'ITEM-TEST-SALVE',tier:'apprentice',effort:'short',ingredients:[{material_id:'MAT-TEST-HERB',quantity:1}]});
const alchemyDef=def('PROF-TEST-ALCHEMY','Profession',{name:'[TEST] Alchemy',recipeLabel:'Tincture'});
const world=[
  worldDoc('wherb','[TEST] Herb',src('MAT-TEST-HERB','Material',{definition:def('MAT-TEST-HERB','Material',{name:'[TEST] Herb'})})),
  worldDoc('wballad','Recipe: [TEST] Ballad',src('REC-TEST-BALLAD','Recipe',{definition:ballad})),
  worldDoc('wsalve','Recipe: [TEST] Salve',src('REC-TEST-SALVE','Recipe',{definition:salve})),
  worldDoc('wsalveitem','[TEST] Salve',src('ITEM-TEST-SALVE','Item',{definition:def('ITEM-TEST-SALVE','Item',{name:'[TEST] Salve'})})),
  worldDoc('wart','[TEST] Artistry — Profession',src('PROF-TEST-ARTISTRY','Profession',{definition:def('PROF-TEST-ARTISTRY','Profession',{name:'[TEST] Artistry',profession_kind:'creative'})})),
  // GM-only world record: a player reads Alchemy's label from the profession feature on their character instead.
  worldDoc('walch','[TEST] Alchemy — Profession',src('PROF-TEST-ALCHEMY','Profession',{visibility:'gm',definition:alchemyDef}))];
world.get=id=>world.find(x=>x.id===id);
const held=(id,name,flags,qty=1,extra={})=>({id,name,type:'loot',system:{quantity:qty,description:{value:''}},flags,...extra,toObject(){return {_id:this.id,name:this.name,type:this.type,system:structuredClone(this.system),flags:structuredClone(this.flags)};}});
const profItem=(id,name,prof,extra={})=>held(id,`${name} — Profession`,src(prof,'Profession',{definition:def(prof,'Profession',{name,...extra})}),1,{type:'feat'});
const makeActor=(id,name,ownerId,items,known,system)=>{const inv=[...items];inv.get=i=>inv.find(x=>x.id===i);
  return {id,name,type:'character',hasPlayerOwner:true,items:inv,flags:{'ashen-gate-profession-ledger':{knownRecipes:known}},system,
    testUserPermission:(u,role)=>u.isGM||u.id===ownerId,
    updateEmbeddedDocuments:async(t,ups)=>{for(const u of ups){const it=inv.get(u._id);for(const [k,v] of Object.entries(u))if(k!=='_id'){const parts=k.split('.');let o=it;while(parts.length>1)o=o[parts.shift()];o[parts[0]]=v;}}return ups;},
    deleteEmbeddedDocuments:async(t,ids)=>{for(const i of ids)inv.splice(inv.findIndex(x=>x.id===i),1);return ids;},
    createEmbeddedDocuments:async(t,docs)=>{const out=docs.map((d,n)=>held(`${id}-new${inv.length+n}`,d.name,d.flags,d.system?.quantity??1));inv.push(...out);return out;},
    rollSkill:async cfg=>{rolls.push({actor:id,skill:cfg.skill});return [{total:12}];},
    rollToolCheck:async cfg=>{rolls.push({actor:id,tool:cfg.tool});return [{total:15}];}};};
const bard=makeActor('bard','[TEST] Bard','u1',[profItem('bart','[TEST] Artistry','PROF-TEST-ARTISTRY')],['REC-TEST-BALLAD'],
  {skills:{prf:{value:1,total:6}},tools:{},abilities:{cha:{mod:3}}});
const smith=makeActor('smith','[TEST] Smith','u2',[profItem('salch','[TEST] Alchemy','PROF-TEST-ALCHEMY',{recipeLabel:'Tincture'}),held('sherb','[TEST] Herb',src('MAT-TEST-HERB','Material'),2)],['REC-TEST-SALVE'],
  {skills:{},tools:{alchemist:{value:1,total:4}},abilities:{int:{mod:2}}});
const actors=[bard,smith];
const mod={active:true,version:'0.32.2',get api(){return api},set api(v){api=v}};
globalThis.game={user:gm,users:{contents:users,get:id=>users.find(u=>u.id===id)},items:{contents:world,get:world.get},actors:{contents:actors,get:id=>actors.find(a=>a.id===id)},
  socket:{emit(){},on(){}},modules:{get:id=>id==='ashen-gate-profession-ledger'?mod:undefined},
  settings:{register(){},registerMenu(){},get:(i,k)=>values[k],set:async(i,k,v)=>{values[k]=v;}}};
await import(pathToFileURL(path.resolve(here,'../scripts/main.js')));hooks.init();hooks.ready();
const {_test}=await import(pathToFileURL(path.resolve(here,'../scripts/main.js')));
const app=api.open({view:'gm'});
app.element={querySelector:()=>null,querySelectorAll:()=>[]};
const html=async view=>{app.view=view;return (await app._prepareContext({})).html;};
const rowOf=(h,name)=>h.slice(h.lastIndexOf('<article',h.indexOf(name)),h.indexOf('</article>',h.indexOf(name)));
const fakeSlot=()=>{const slot={innerHTML:'',querySelector:()=>null};return {slot,html:{querySelector:sel=>sel==='[data-agl-xp]'?slot:null}};};

test('Complete activity: the GM’s award is prefilled with the suggested XP and says how; the card shows the effect note',async()=>{
  game.user=alice;
  await _test.performAction('complete-activity',{id:'REC-TEST-BALLAD',actorId:'bard'});
  const card=chats.at(-1),xp=card.flags['ashen-gate-profession-ledger'].xp;
  assert.equal(xp.suggested,2,'Journeyman, Long effort: 2 XP');
  assert.equal(xp.suggestedBasis,'Suggested from the activity’s tier and effort: Journeyman and Long effort give 2 XP.');
  assert.equal(xpHooks.at(-1).data.suggested,2,'the XP opportunity carries the suggestion');
  assert.match(card.content,/<strong>Effect:<\/strong> \[TEST\] Listeners gain a small boon until dawn\. \(the GM decides at the table\)/);
  // The GM's award prompt: prefilled and explained; still an editable number.
  game.user=gm;
  let {slot,html:dom}=fakeSlot();_test.decorateChatCard(card,dom);
  assert.match(slot.innerHTML,/<input type="number" min="1" max="1000" step="1" value="2" data-agl-xp-points>/);
  assert.match(slot.innerHTML,/Suggested: 2 XP\. Suggested from the activity’s tier and effort: Journeyman and Long effort give 2 XP\. You can change it before awarding\. GM only\./);
  game.user=alice;({slot,html:dom}=fakeSlot());_test.decorateChatCard(card,dom);
  assert.equal(slot.innerHTML,'','players see no award prompt');
  game.user=gm;
});

test('craft XP unchanged: a craft card has no suggested amount and no explanation',async()=>{
  game.user=bob;
  await _test.performAction('craft',{id:'REC-TEST-SALVE',actorId:'smith'});
  const xp=chats.at(-1).flags['ashen-gate-profession-ledger'].xp;
  assert.equal(xp.kind,'craft');assert.equal(xp.suggested,null);assert.equal('suggestedBasis' in xp,false);
  game.user=gm;
  const {slot,html:dom}=fakeSlot();_test.decorateChatCard(chats.at(-1),dom);
  assert.match(slot.innerHTML,/value="1" data-agl-xp-points>[\s\S]*<p class="agl-chat-note">GM only\.<\/p>/);
});

test('recipe detail: an activity shows its effect note; profession folders use the profession’s recipe name',async()=>{
  game.user=alice;app.actorId='bard';
  let h=await html('individual');
  assert.match(rowOf(h,'[TEST] Ballad'),/<span class="agl-label">Effect<\/span> \[TEST\] Listeners gain a small boon until dawn\./);
  assert.match(h,/<strong>\[TEST\] Artistry<\/strong> <span class="ag-badge">1 composition<\/span>/,'Artistry: the draft built-in name');
  assert.match(h,/<h3>Known recipes <span class="ag-badge">1<\/span><\/h3>/,'the mixed list keeps the generic word');
  game.user=bob;app.actorId='smith';
  h=await html('individual');
  assert.match(h,/<strong>Test Alchemy<\/strong> <span class="ag-badge">1 tincture<\/span>/,'the imported recipeLabel beats the draft "Formula", read from the character’s feature (the GM-only world record is not readable)');
  assert.match(rowOf(h,'[TEST] Salve'),/data-recipe-search="[^"]*tincture/,'searching for the word finds the recipe');
  game.user=gm;
  h=await html('catalog');
  assert.match(h,/1 tincture<\/span>[\s\S]*1 composition<\/span>|1 composition<\/span>[\s\S]*1 tincture<\/span>/);
  assert.match(h,/>Recipe Catalog</,'the tab keeps its name');
});

test('api.recipeLabel: name or PROF id, plural and capitalize; unknown professions say Recipe; GM edits win',async()=>{
  game.user=alice;
  assert.equal(typeof api.recipeLabel,'function');
  assert.equal(api.recipeLabel('Artistry'),'Composition');
  assert.equal(api.recipeLabel('PROF-TEST-ARTISTRY',{plural:true}),'Compositions');
  assert.equal(api.recipeLabel('Blacksmithing',{capitalize:false}),'blueprint');
  assert.equal(api.recipeLabel('Alchemy',{plural:true,capitalize:false}),'tinctures');
  assert.equal(api.recipeLabel('Cooking'),'Recipe');assert.equal(api.recipeLabel('Cooking',{plural:true}),'Recipes');
  assert.equal(api.recipeLabel(''),'Recipe');assert.equal(api.recipeLabel('[TEST] Nonsense'),'Recipe');assert.equal(api.recipeLabel(null),'Recipe');
  values.recipeLabels={cooking:{singular:'Dish'},alchemy:{plural:'Tincturae'}};
  assert.equal(api.recipeLabel('Cooking',{plural:true}),'Dishes');
  assert.equal(api.recipeLabel('Alchemy'),'Tincture');assert.equal(api.recipeLabel('Alchemy',{plural:true}),'Tincturae');
  values.recipeLabels={};
  game.user=gm;
});

test('GM Setup → Tools and checks → Recipe names: one row per profession, defaults in grey, saved with Save Changes',async()=>{
  game.user=gm;app.labelDraft=null;
  let h=await html('gm');
  const section=h.slice(h.indexOf('agl-recipe-names'),h.indexOf('</section>',h.indexOf('agl-recipe-names')));
  assert.match(section,/<h2>Recipe names<\/h2>/);
  assert.ok(h.indexOf('agl-recipe-names')>h.indexOf('<h2>Tools and checks</h2>'),'in the Tools and checks sub-tab, after the table');
  assert.match(section,/<tr data-label-row="alchemy"><th scope="row">Alchemy<\/th><td><input type="text" maxlength="30" data-label-key="alchemy" data-label-field="singular" value="" placeholder="Tincture" aria-label="Alchemy: singular \(for example Formula\)">/);
  assert.match(section,/data-label-from="alchemy">From content</);
  assert.match(section,/data-label-key="blacksmithing" data-label-field="plural" value="" placeholder="Blueprints"[\s\S]*?Built-in name \(draft\)/);
  assert.match(section,/data-label-key="cooking" data-label-field="singular" value="" placeholder="Recipe"[\s\S]*?data-label-from="cooking">Default</);
  assert.match(section,/data-label-row="artistry"/);
  assert.doesNotMatch(section,/PROF-|REC-/,'no raw ids');
  assert.equal(app.setupDirty,false);
  // Typing keeps the draft (no re-render); typing back the default is not a change.
  app._rememberLabelDraft({dataset:{labelKey:'cooking',labelField:'singular'},value:'Dish'});
  assert.equal(app.labelDirty,true);assert.equal(app.setupStatus,'Unsaved recipe name changes');
  app._rememberLabelDraft({dataset:{labelKey:'nonsense',labelField:'singular'},value:'X'});
  assert.equal(app.labelDraft.nonsense,undefined,'only real professions');
  app._rememberLabelDraft({dataset:{labelKey:'alchemy',labelField:'singular'},value:'Tincture'});
  h=await html('gm');
  assert.match(h,/data-label-key="cooking" data-label-field="singular" value="Dish"/,'a re-render keeps what was typed');
  await app._click('roster-save','');
  assert.deepEqual(values.recipeLabels,{cooking:{singular:'Dish'}},'only real changes are stored');
  assert.equal(app.labelDraft,null);
  assert.equal(api.recipeLabel('Cooking',{plural:true}),'Dishes');
  h=await html('gm');
  assert.match(h,/data-label-key="cooking" data-label-field="singular" value="Dish" placeholder="Recipe"[\s\S]*?data-label-from="cooking">Set by GM</);
  // Clearing the box goes back to the default; Cancel drops a draft.
  app._rememberLabelDraft({dataset:{labelKey:'cooking',labelField:'singular'},value:''});
  await app._click('roster-save','');
  assert.deepEqual(values.recipeLabels,{});
  app._rememberLabelDraft({dataset:{labelKey:'mining',labelField:'singular'},value:'Claim'});
  app._clearSetupDrafts();assert.equal(app.setupDirty,false);
  game.user=alice;app._rememberLabelDraft({dataset:{labelKey:'mining',labelField:'singular'},value:'Claim'});
  assert.equal(app.labelDraft,null,'players cannot edit');
  game.user=gm;
  assert.deepEqual(errors,[]);
});
