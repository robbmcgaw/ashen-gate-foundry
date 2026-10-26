import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {planRefresh} from '../scripts/refresh.mjs';
// 0.33.3: Refresh can remove what it cannot identify. All data is synthetic ([TEST] names).
const hooks={};let api,journals=[],journalFails=false,confirmAnswer=true;
const ID='ashen-gate-profession-ledger';
const values={partyRoster:['dee'],libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]},checkMapping:{}};
const gm={id:'gm',isGM:true,name:'GM',active:true},alice={id:'u1',isGM:false,name:'Alice',active:true};
const users=[gm,alice];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
class FakeDialog{static async wait(){return confirmAnswer;}render(){return this;}}
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){this.rendered=true;return this;}},HandlebarsApplicationMixin:c=>c,DialogV2:FakeDialog}},utils:{escapeHTML:esc,randomID:()=>`id${Math.random().toString(36).slice(2,10)}`}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:()=>{}};
globalThis.ui={notifications:{info:()=>{},error:()=>{},warn:()=>{}}};
globalThis.JournalEntry={create:async data=>{if(journalFails)throw Error('[TEST] journal denied');const d={id:`j${journals.length+1}`,...structuredClone(data)};journals.push(d);return d;}};
const def=(id,type,extra={})=>({id,entity_type:type,version:'0.1.0',refs:[],...extra});
const src=(id,type,{definition=null}={})=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility:'player',status:'approved',version:'0.1.0',refs:[],...(definition?{definition}:{})}}});
const worldDoc=(id,name,flags,type='feat')=>({id,uuid:`Item.${id}`,name,img:'',type,flags,system:{description:{value:''}},testUserPermission:()=>true,
  toObject(){return {_id:this.id,name:this.name,type:this.type,flags:structuredClone(this.flags),system:structuredClone(this.system)};}});
const prof=(wid,id,name,access)=>worldDoc(wid,`${name} — Profession`,src(id,'Profession',{definition:def(id,'Profession',{name,...(access?{access}:{})})}));
const rec=(wid,id,name,prof,starting=true)=>worldDoc(wid,`Recipe: ${name}`,src(id,'Recipe',{definition:def(id,'Recipe',{name,profession_id:prof,tier:'apprentice',...(starting?{starting:true}:{}),ingredients:[{material_id:'MAT-TEST-LEAF',quantity:1}]})}),'loot');
const world=[
  prof('wherb','PROF-TG-HERBALISM','[TEST] Herbalism',{skillProficienciesAnyOf:['Nature']}),
  prof('wmine','PROF-TG-MINING','[TEST] Mining',{skillProficienciesAnyOf:['Athletics']}),
  prof('walch','PROF-TG-ALCHEMY','[TEST] Alchemy',{toolProficienciesAnyOf:['Herbalism Kit']}),
  prof('wcook','PROF-TG-COOKING','[TEST] Cooking',{skillProficienciesAnyOf:['Survival']}),
  rec('r1','REC-TEST-POULTICE','[TEST] Poultice','PROF-TG-HERBALISM'),
  rec('r2','REC-TEST-ORE','[TEST] Ore Sample','PROF-TG-MINING'),
  rec('r3','REC-TEST-SALVE','[TEST] Salve','PROF-TG-ALCHEMY'),
  rec('r4','REC-TEST-VEIN','[TEST] Vein Map','PROF-TG-MINING',false),
];
const held=(id,sourceId,name,grant)=>({id,name:`${name} — Profession`,type:'feat',system:{quantity:1},
  flags:{...src(sourceId,'Profession',{definition:def(sourceId,'Profession',{name})}),...(grant?{[ID]:{grant:{by:'assign',at:1}}}:{})},
  toObject(){return {_id:this.id,name:this.name,type:this.type,flags:structuredClone(this.flags)};}});
const makeActor=(id,name,{type='character',owner=true,backup=false}={})=>{
  const a={id,name,type,hasPlayerOwner:owner,items:[],flags:{},system:{skills:{},tools:{},abilities:{}},testUserPermission:u=>u.isGM,
    setFlag:async(s,k,v)=>{a.flags[s]??={};a.flags[s][k]=structuredClone(v);a.writes.push(k);},
    unsetFlag:async(s,k)=>{delete a.flags[s]?.[k];},
    createEmbeddedDocuments:async(t,docs)=>{const out=docs.map((d,i)=>({...structuredClone(d),id:`${id}-n${a.n++}`,toObject(){return structuredClone(this);}}));a.items.push(...out);a.creates+=docs.length;return out;},
    deleteEmbeddedDocuments:async(t,ids)=>{a.items=a.items.filter(i=>!ids.includes(i.id));a.deletes+=ids.length;},writes:[],n:0,creates:0,deletes:0};
  if(backup)a.flags['ashen-gate-character-hub']={levelBackup:{of:'dee'}};
  Object.defineProperty(a,'itemsList',{get:()=>a.items});
  return a;};
const dee=makeActor('dee','[TEST] Dee'),npc=makeActor('npc','[TEST] Goblin',{type:'npc',owner:false}),loner=makeActor('loner','[TEST] Hireling',{owner:false}),bak=makeActor('bak','[TEST] Dee - level 3',{backup:true});
const all=[dee,npc,loner,bak];
const ledgerModule={active:true,version:'0.35.1',set api(v){api=v},get api(){return api}};
globalThis.game={user:gm,users:{contents:users,get:id=>users.find(u=>u.id===id),get activeGM(){return gm;}},items:{contents:world,get:id=>world.find(x=>x.id===id)},
  actors:{contents:all,get:id=>all.find(a=>a.id===id)},socket:{emit:()=>{},on:()=>{}},journal:[],
  modules:{get:id=>id===ID?ledgerModule:null},settings:{register:()=>{},registerMenu:()=>{},get:(m,k)=>values[k],set:async(m,k,v)=>{values[k]=v;}}};
const entry=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js');
await import(pathToFileURL(entry));hooks.init();hooks.ready();
const names=a=>a.items.map(i=>i.name).sort();
const known=a=>a.flags[ID]?.knownRecipes??[];
// Dee after a swap: she held Herbalism + Mining (both from Assign). Now proficient in Nature and the Herbalism Kit, no longer Athletics.
const reset=({unmarkedCooking=false,miningXp=0,learned=false}={})=>{
  dee.items=[held('i-herb','PROF-TG-HERBALISM','[TEST] Herbalism',true),held('i-mine','PROF-TG-MINING','[TEST] Mining',true),
    {id:'i-sword',name:'[TEST] Hand-added Sword',type:'weapon',system:{quantity:1},flags:{}},
    {id:'i-craft',name:'[TEST] Crafted Tonic',type:'loot',system:{quantity:2},flags:{[ID]:{craftedFrom:'REC-TEST-POULTICE'}}}];
  if(unmarkedCooking)dee.items.push(held('i-cook','PROF-TG-COOKING','[TEST] Cooking',false));
  dee.flags={[ID]:{knownRecipes:['REC-TEST-POULTICE','REC-TEST-ORE',...(learned?['REC-TEST-VEIN']:[])],grantedRecipes:['REC-TEST-ORE']}};
  if(miningXp)dee.flags[ID].professionProgress={schema:'ag-profession-actor-progress/0.1',professions:{'PROF-TG-MINING':{xp:miningXp,selectedPerkIds:[]}}};
  dee.system.skills={nat:{value:1},ath:{value:0},sur:{value:0}};dee.system.tools={herb:{value:1}};
  dee.writes=[];dee.creates=0;dee.deletes=0;journals.length=0;journalFails=false;game.user=gm;
};
const kinds=(list,kind)=>list.filter(x=>x.kind===kind).map(x=>x.name).sort();
import {cantTellTokens,RECIPE_NON_TEXT} from '../scripts/refresh.mjs';
const perkItem=(id,name,prof,grant)=>({id,name,type:'feat',system:{quantity:1},
  flags:{...src('PERK-TEST-'+id,'ProfessionPerk',{definition:def('PERK-TEST-'+id,'ProfessionPerk',{name,signature:true,tier:'journeyman',profession_id:prof,point_cost:0})}),...(grant?{[ID]:{grant:{by:'perk',at:1}}}:{})},
  toObject(){return {_id:this.id,name:this.name,type:this.type,flags:structuredClone(this.flags)};}});
// Dee keeps Herbalism; her old recipes: one the catalog has, two it does not, one legacy non-REC string, one non-text entry.
const resetOld=()=>{
  reset();
  dee.items=[held('i-herb','PROF-TG-HERBALISM','[TEST] Herbalism',true),{id:'i-sword',name:'[TEST] Hand-added Sword',type:'weapon',system:{quantity:1},flags:{}}];
  dee.flags={[ID]:{knownRecipes:['REC-TEST-POULTICE','REC-OLD-ONE','REC-OLD-TWO','old recipe',{x:1}],grantedRecipes:['REC-OLD-ONE','REC-TEST-POULTICE']}};
};
const recipeRows=p=>p.cantTell.filter(c=>c.kind==='recipe');

test('every unidentifiable recipe is a Can\'t-tell row with a tick; legacy strings and non-text entries are listed too; no raw ids shown',async()=>{
  resetOld();
  const p=await api.refreshProfessions({actorId:'dee'});
  const rows=recipeRows(p);
  assert.equal(rows.length,4);
  assert.deepEqual(rows.map(r=>r.optInRecipe),['REC-OLD-ONE','REC-OLD-TWO','old recipe',RECIPE_NON_TEXT]);
  assert.ok(rows.every(r=>!/REC-|old recipe/.test(r.name)),'names carry no ids');
  assert.deepEqual(rows.slice(0,3).map(r=>r.name),['Unrecognised recipe 1','Unrecognised recipe 2','Unrecognised recipe 3']);
  assert.equal(p.willRemove.length,0,'unticked: nothing planned');
  assert.deepEqual(kinds(p.willKeep,'recipe'),['[TEST] Poultice']);
});

test('nothing unticked is touched: applying with no ticks writes no recipe change',async()=>{
  resetOld();
  await api.refreshProfessions({actorId:'dee',preview:false});
  assert.deepEqual(known(dee),['REC-TEST-POULTICE','REC-OLD-ONE','REC-OLD-TWO','old recipe',{x:1},'REC-TEST-SALVE'],'only the normal Assign add path ran');
  assert.equal(dee.deletes,0);
});

test('tick and untick: a ticked recipe goes into willRemove with the reason and stays listed so it can be unticked',async()=>{
  resetOld();
  let p=await api.refreshProfessions({actorId:'dee',alsoRemoveRecipes:['REC-OLD-TWO']});
  assert.deepEqual(p.willRemove.map(r=>r.recipeId),['REC-OLD-TWO']);
  assert.match(p.willRemove[0].why,/^Ticked by you: not in the recipe catalog/);
  assert.equal(recipeRows(p).find(r=>r.optInRecipe==='REC-OLD-TWO').ticked,true);
  assert.equal(p.counts.remove,1);assert.equal(p.counts.ticked,1);assert.equal(p.needsTypedConfirmation,false);
  p=await api.refreshProfessions({actorId:'dee',alsoRemoveRecipes:[]});
  assert.equal(p.willRemove.length,0);
  // A catalog recipe cannot be removed this way.
  p=await api.refreshProfessions({actorId:'dee',alsoRemoveRecipes:['REC-TEST-POULTICE']});
  assert.equal(p.willRemove.length,0);
});

test('select all: cantTellTokens lists every row; applying removes exactly those, flag ids and grantedRecipes included, snapshot keeps the previous flags',async()=>{
  resetOld();
  const p=await api.refreshProfessions({actorId:'dee'});
  const t=cantTellTokens(p);
  assert.deepEqual(t.recipes,['REC-OLD-ONE','REC-OLD-TWO','old recipe',RECIPE_NON_TEXT]);
  const out=await api.refreshProfessions({actorId:'dee',preview:false,alsoRemove:t.items,alsoRemoveRecipes:t.recipes});
  assert.equal(out.removed,4);
  assert.deepEqual(known(dee),['REC-TEST-POULTICE','REC-TEST-SALVE']);
  assert.deepEqual(dee.flags[ID].grantedRecipes.filter(x=>x!=='REC-TEST-SALVE'),['REC-TEST-POULTICE']);
  assert.deepEqual(names(dee),['[TEST] Alchemy — Profession','[TEST] Hand-added Sword','[TEST] Herbalism — Profession'],'only Assign\'s normal add ran');
  const snap=journals[0].flags[ID].snapshot;
  assert.deepEqual(snap.flagsBefore.knownRecipes,['REC-TEST-POULTICE','REC-OLD-ONE','REC-OLD-TWO','old recipe',{x:1}]);
  assert.deepEqual(snap.flagsBefore.grantedRecipes,['REC-OLD-ONE','REC-TEST-POULTICE']);
  assert.equal(snap.plan.removed.filter(r=>r.kind==='recipe').length,4);
  assert.ok(snap.plan.removed.every(r=>/^Ticked by you/.test(r.why)));
  // Re-run lists nothing further to remove.
  const again=await api.refreshProfessions({actorId:'dee'});
  assert.equal(recipeRows(again).length,0);
});

test('an unidentified signature perk Item is deleted only when ticked, kept in the snapshot, and needs the typed name',async()=>{
  resetOld();
  dee.items.push(held('i-mine','PROF-TG-MINING','[TEST] Mining',true),perkItem('perkA','[TEST] Old Perk','PROF-TG-MINING',false));
  dee.flags[ID].knownRecipes=['REC-TEST-POULTICE'];
  const rp=['mining'];
  let p=await api.refreshProfessions({actorId:'dee',removeProgress:rp});
  const row=p.cantTell.find(c=>c.kind==='perk');
  assert.ok(row&&row.optIn==='perkA');
  assert.deepEqual(kinds(p.willRemove,'perk'),[]);
  p=await api.refreshProfessions({actorId:'dee',removeProgress:rp,alsoRemove:['perkA']});
  assert.deepEqual(kinds(p.willRemove,'perk'),['[TEST] Old Perk']);assert.match(p.willRemove.find(r=>r.kind==='perk').why,/^Ticked by you/);
  assert.equal(p.needsTypedConfirmation,true);
  await assert.rejects(()=>api.refreshProfessions({actorId:'dee',preview:false,removeProgress:rp,alsoRemove:['perkA']}),/name typed/);
  assert.ok(names(dee).includes('[TEST] Old Perk'));
  await api.refreshProfessions({actorId:'dee',preview:false,removeProgress:rp,alsoRemove:['perkA'],confirmName:'[TEST] Dee'});
  assert.ok(!names(dee).includes('[TEST] Old Perk'));assert.ok(names(dee).includes('[TEST] Hand-added Sword'));
  assert.deepEqual(journals[0].flags[ID].snapshot.removedItems.map(i=>i.name).sort(),['[TEST] Mining — Profession','[TEST] Old Perk']);
});

test('permission gate: players cannot remove recipes through the API',async()=>{
  resetOld();game.user=alice;
  await assert.rejects(()=>api.refreshProfessions({actorId:'dee',preview:false,alsoRemoveRecipes:['REC-OLD-ONE']}),/GM/);
  game.user=gm;assert.deepEqual(known(dee).length,5);assert.equal(journals.length,0);
});

test('the preview shows tick boxes and a Select all control, with no raw ids; selecting all ticks every row',async()=>{
  resetOld();
  const app=api.open({view:'assign'});app.assignState.target='dee';
  app.refreshState={actorId:'dee',preview:null,removeProgress:new Set(),alsoRemove:new Set(),alsoRemoveRecipes:new Set()};app._refreshReplan();
  let view=(await app._prepareContext({})).html;
  assert.equal((view.match(/data-refresh-also-recipe=/g)??[]).length,4);
  assert.match(view,/Select all that I can’t identify/);
  assert.doesNotMatch(view.replace(/<[^>]*>/g,' '),/REC-OLD|old recipe/,'no raw ids in the visible text');
  await app._click('refresh-select-cant','all',{});
  assert.equal(app.refreshState.alsoRemoveRecipes.size,4);
  view=(await app._prepareContext({})).html;
  assert.match(view,/Clear all that I can’t identify/);assert.equal((view.match(/data-refresh-also-recipe="[^"]*" checked/g)??[]).length,4);
  assert.match(view,/Ticked by you: not in the recipe catalog/);
  await app._click('refresh-select-cant','none',{});
  assert.equal(app.refreshState.alsoRemoveRecipes.size,0);
});
