import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {planRefresh} from '../scripts/refresh.mjs';
// 0.33.0: Assign → Refresh. All data is synthetic ([TEST] names).
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
const ledgerModule={active:true,version:'0.37.11',set api(v){api=v},get api(){return api}};
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

test('preview: Will add / keep / remove for a swapped profession, and nothing is written',async()=>{
  reset();
  const p=await api.refreshProfessions({actorId:'dee'});
  assert.equal(p.preview,true);
  assert.deepEqual(kinds(p.willAdd,'profession'),['[TEST] Alchemy'],'new proficiency qualifies for Alchemy');
  assert.deepEqual(kinds(p.willAdd,'recipe'),['[TEST] Salve'],'its starting recipe will be added');
  assert.deepEqual(kinds(p.willRemove,'profession'),['[TEST] Mining'],'lost proficiency: Mining goes');
  assert.deepEqual(kinds(p.willRemove,'recipe'),['[TEST] Ore Sample'],'Mining starting recipe goes with it');
  assert.deepEqual(kinds(p.willKeep,'profession'),['[TEST] Herbalism']);
  assert.deepEqual(kinds(p.willKeep,'recipe'),['[TEST] Poultice'],'a recipe of a kept profession is kept');
  assert.equal(p.blocked.length,0);assert.equal(p.needsTypedConfirmation,false);
  assert.equal(dee.writes.length+dee.creates+dee.deletes+journals.length,0,'preview writes nothing');
});

test('apply: snapshot first, removes only the proven grants, adds the new ones, hand-made items stay, second run is a no-op',async()=>{
  reset();
  const out=await api.refreshProfessions({actorId:'dee',preview:false});
  assert.equal(out.removed,2);assert.equal(out.added,2);
  assert.equal(journals.length,1);assert.equal(journals[0].flags[ID].role,'refresh-snapshot');
  assert.equal(journals[0].ownership.default,0,'GM-only Journal');
  assert.deepEqual(journals[0].flags[ID].snapshot.removedItems.map(i=>i.name),['[TEST] Mining — Profession']);
  assert.deepEqual(journals[0].flags[ID].snapshot.flagsBefore.knownRecipes,['REC-TEST-POULTICE','REC-TEST-ORE']);
  assert.deepEqual(names(dee),['[TEST] Alchemy — Profession','[TEST] Crafted Tonic','[TEST] Hand-added Sword','[TEST] Herbalism — Profession']);
  assert.deepEqual(known(dee).sort(),['REC-TEST-POULTICE','REC-TEST-SALVE']);
  const alch=dee.items.find(i=>/Alchemy/.test(i.name));
  assert.equal(alch.flags[ID].grant.by,'assign','the added feature records that Assign granted it');
  assert.ok(dee.flags[ID].grantedRecipes.includes('REC-TEST-SALVE'));assert.ok(!dee.flags[ID].grantedRecipes.includes('REC-TEST-ORE'));
  // Idempotent.
  dee.writes=[];dee.creates=0;dee.deletes=0;journals.length=0;
  const again=await api.refreshProfessions({actorId:'dee',preview:false});
  assert.equal(again.removed,0);assert.equal(again.added,0);
  assert.equal(dee.writes.length+dee.creates+dee.deletes+journals.length,0,'nothing written, no snapshot, on the second run');
});

test('an Item with no grant record is "Can\'t tell, left alone" until the GM ticks it',async()=>{
  reset({unmarkedCooking:true});
  const p=await api.refreshProfessions({actorId:'dee'});
  const c=p.cantTell.find(x=>x.name==='[TEST] Cooking');
  assert.ok(c&&c.optIn==='i-cook');assert.deepEqual(kinds(p.willRemove,'profession'),['[TEST] Mining']);
  await api.refreshProfessions({actorId:'dee',preview:false});
  assert.ok(names(dee).includes('[TEST] Cooking — Profession'),'left alone');
  reset({unmarkedCooking:true});
  const out=await api.refreshProfessions({actorId:'dee',preview:false,alsoRemove:['i-cook']});
  assert.equal(out.removed,3);assert.ok(!names(dee).includes('[TEST] Cooking — Profession'));
  assert.ok(names(dee).includes('[TEST] Hand-added Sword'));
});

test('progress rail: XP keeps the profession until the progress box is ticked and the name typed',async()=>{
  reset({miningXp:12});
  const p=await api.refreshProfessions({actorId:'dee'});
  assert.deepEqual(p.blocked.map(b=>[b.key,b.message]),[['mining','This character has progress in [TEST] Mining']]);
  assert.deepEqual(kinds(p.willRemove,'profession'),[]);
  const out=await api.refreshProfessions({actorId:'dee',preview:false});
  assert.equal(out.removed,0);assert.ok(names(dee).includes('[TEST] Mining — Profession'),'refused to remove without the tick');
  assert.ok(known(dee).includes('REC-TEST-ORE'));assert.equal(journals.length,0);
  assert.equal(dee.flags[ID].professionProgress.professions['PROF-TG-MINING'].xp,12);
  const ticked=await api.refreshProfessions({actorId:'dee',removeProgress:['mining']});
  assert.equal(ticked.needsTypedConfirmation,true);
  assert.ok(ticked.willRemove.some(r=>r.kind==='progress'));
  await assert.rejects(api.refreshProfessions({actorId:'dee',preview:false,removeProgress:['mining']}),/name typed/);
  await assert.rejects(api.refreshProfessions({actorId:'dee',preview:false,removeProgress:['mining'],confirmName:'wrong'}),/name typed/);
  assert.ok(names(dee).includes('[TEST] Mining — Profession'));
  await api.refreshProfessions({actorId:'dee',preview:false,removeProgress:['mining'],confirmName:'[TEST] Dee'});
  assert.ok(!names(dee).includes('[TEST] Mining — Profession'));
  assert.equal(dee.flags[ID].professionProgress.professions['PROF-TG-MINING'],undefined);
  assert.equal(journals[0].flags[ID].snapshot.flagsBefore.professionProgress.professions['PROF-TG-MINING'].xp,12,'the progress is in the snapshot');
  assert.ok(names(dee).includes('[TEST] Crafted Tonic'),'crafted items are never removed');
});

test('a learned recipe beyond the starting ones counts as progress',async()=>{
  reset({learned:true});
  const p=await api.refreshProfessions({actorId:'dee'});
  assert.equal(p.blocked[0]?.key,'mining');assert.match(p.blocked[0].reasons.join(' '),/1 learned recipe/);
});

test('if the snapshot cannot be saved, nothing is changed',async()=>{
  reset();journalFails=true;
  await assert.rejects(api.refreshProfessions({actorId:'dee',preview:false}),/snapshot could not be saved/);
  assert.equal(dee.writes.length+dee.creates+dee.deletes,0);
  assert.ok(names(dee).includes('[TEST] Mining — Profession'));assert.deepEqual(known(dee),['REC-TEST-POULTICE','REC-TEST-ORE']);
});

test('GM only; NPCs, unowned characters and level backups are refused',async()=>{
  reset();
  await assert.rejects(api.refreshProfessions({actorId:'npc'}),/not a player character/);
  await assert.rejects(api.refreshProfessions({actorId:'loner',preview:false}),/not a player character/);
  await assert.rejects(api.refreshProfessions({actorId:'bak'}),/level backup/);
  await assert.rejects(api.refreshProfessions({actorId:'nobody'}),/not found/);
  game.user=alice;
  try{
    await assert.rejects(api.refreshProfessions({actorId:'dee'}),/Only the GM/);
    await assert.rejects(api.refreshProfessions({actorId:'dee',preview:false}),/Only the GM/);
  }finally{game.user=gm;}
  assert.equal(dee.writes.length+dee.creates+dee.deletes+journals.length,0);
});

test('the Assign tab offers Refresh… to the GM beside Preview, with one primary in the preview',async()=>{
  reset();
  const app=api.open({view:'assign'});
  app.assignState.target='dee';
  const html=(await app._prepareContext({})).html;
  assert.match(html,/data-action="refresh-preview"/);
  app.refreshState={actorId:'dee',preview:null,removeProgress:new Set(),alsoRemove:new Set()};app._refreshReplan();
  const view=(await app._prepareContext({})).html;
  assert.match(view,/Will add \(/);assert.match(view,/Will keep \(/);assert.match(view,/Will remove \(/);assert.match(view,/Can’t tell, left alone/);
  assert.equal((view.match(/ag-btn--primary/g)??[]).length,1);
  assert.match(view,/Refresh \[TEST\] Dee…/);
});

test('pure plan: shared starting recipe of a kept profession is not removed',()=>{
  const recipes=[{id:'REC-TEST-A',name:'A',professionId:'PROF-TG-MINING',starting:true},{id:'REC-TEST-B',name:'B',professionId:'PROF-TG-HERBALISM',starting:true}];
  const p=planRefresh({qualifying:[{key:'herbalism',profession:'Herbalism',reason:''}],defsByKey:new Map(),
    held:[{itemId:'1',name:'Mining',key:'mining',sourceId:'PROF-TG-MINING',granted:true},{itemId:'2',name:'Herbalism',key:'herbalism',sourceId:'PROF-TG-HERBALISM',granted:true}],
    known:['REC-TEST-A','REC-TEST-B'],recipes});
  assert.deepEqual(p.willRemove.map(r=>r.name).sort(),['A','Mining']);
  assert.deepEqual(p.willKeep.map(r=>r.name).sort(),['B','Herbalism']);
});
