import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {startingRecipePlan,isStartingRecipe} from '../scripts/assign.mjs';
import {normalizeRecipe} from '../scripts/core.mjs';
// 0.30.0: Assign → Starting recipes. The GM grants `starting: true` recipes of each player character's professions as known recipes.
const hooks={},errors=[],infos=[],writes=[];let api,confirmAnswer=true,failFor=null;
const values={partyRoster:['ana','bo','cy','npc','loner'],libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]},checkMapping:{}};
const gm={id:'gm',isGM:true,name:'GM',active:true},alice={id:'u1',isGM:false,name:'Alice',active:true};
const users=[gm,alice];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
class FakeDialog{constructor(o){this.opts=o;}render(){return this;}static async wait(o){FakeDialog.last=o;return confirmAnswer;}}
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){this.rendered=true;return this;}},HandlebarsApplicationMixin:c=>c,DialogV2:FakeDialog}},utils:{escapeHTML:esc,randomID:()=>`id${Math.random().toString(36).slice(2,10)}`}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:()=>{}};
globalThis.ui={notifications:{info:m=>infos.push(String(m)),error:e=>errors.push(String(e)),warn:()=>{}}};
const def=(id,type,extra={})=>({id,entity_type:type,version:'0.1.0',refs:[],...extra});
const src=(id,type,{visibility='player',status='approved',definition=null}={})=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility,status,version:'0.1.0',refs:[],...(definition?{definition}:{})}}});
const worldDoc=(id,name,flags)=>({id,uuid:`Item.${id}`,name,img:'',type:'loot',flags,system:{description:{value:''}},testUserPermission:u=>u.isGM,
  toObject(){return {_id:this.id,name:this.name,type:this.type,flags:structuredClone(this.flags),system:structuredClone(this.system)};}});
const recipe=(wid,id,name,prof,{starting=true,status='approved',visibility='player'}={})=>worldDoc(wid,`Recipe: ${name}`,src(id,'Recipe',{status,visibility,
  definition:def(id,'Recipe',{name,profession_id:prof,tier:'apprentice',...(starting?{starting:true}:{}),ingredients:[{material_id:'MAT-TEST-LEAF',quantity:1}]})}));
const world=[
  recipe('w1','REC-TEST-SALVE','[TEST] Salve','PROF-TEST-ALCHEMY'),
  recipe('w2','REC-TEST-TEA','[TEST] Tea','PROF-TEST-ALCHEMY'),
  recipe('w3','REC-TEST-BOMB','[TEST] Bomb','PROF-TEST-ALCHEMY',{starting:false}),
  recipe('w4','REC-TEST-DRAFT','[TEST] Draft Brew','PROF-TEST-ALCHEMY',{status:'draft'}),
  recipe('w5','REC-TEST-SECRET','[TEST] Secret Tonic','PROF-TEST-ALCHEMY',{visibility:'gm'}),
  recipe('w6','REC-TEST-POULTICE','[TEST] Poultice','PROF-TG-HERBALISM'),
  recipe('w7','REC-TEST-NAIL','[TEST] Nail','PROF-TG-BLACKSMITHING'),
  worldDoc('wprof','[TEST] Alchemy — Profession',src('PROF-TEST-ALCHEMY','Profession',{definition:def('PROF-TEST-ALCHEMY','Profession',{name:'[TEST] Alchemy'})})),
];
const held=(id,name,flags,qty=1,type='loot')=>({id,name,type,system:{quantity:qty,description:{value:''}},flags});
const makeActor=(id,name,{type='character',owner=true,items=[],known=[],backup=false}={})=>{const inv=[...items];inv.get=i=>inv.find(x=>x.id===i);
  const a={id,name,type,hasPlayerOwner:owner,items:inv,
    flags:{'ashen-gate-profession-ledger':{knownRecipes:[...known]},...(backup?{'ashen-gate-character-hub':{levelBackup:{of:'ana'}}}:{})},
    testUserPermission:(u)=>u.isGM||u.id==='u1',
    setFlag:async(scope,key,v)=>{if(failFor===id)throw Error('[TEST] disk full');writes.push({id,key,v:structuredClone(v)});a.flags[scope]??={};a.flags[scope][key]=structuredClone(v);},
    createEmbeddedDocuments:async()=>{throw Error('no Items may be created');},deleteEmbeddedDocuments:async()=>{throw Error('no Items may be deleted');},
    updateEmbeddedDocuments:async()=>{throw Error('no Items may be changed');}};
  return a;};
const alchemy=()=>held('p-alch','[TEST] Alchemy — Profession',src('PROF-TEST-ALCHEMY','Profession'),1,'feat');
// Ana: tagged Alchemy, knows Tea, holds a Salve recipe item (never used up). Bo: an untagged "Herbalism" feature (matched by key).
const ana=makeActor('ana','[TEST] Ana',{items:[alchemy(),held('r-salve','Recipe: [TEST] Salve',src('REC-TEST-SALVE','Recipe'),2)],known:['REC-TEST-TEA']});
const bo=makeActor('bo','[TEST] Bo',{items:[held('p-herb','Herbalism',{},1,'feat')]});
const cy=makeActor('cy','[TEST] Cy');
const npc=makeActor('npc','[TEST] Goblin',{type:'npc',owner:false,items:[alchemy()]});
const loner=makeActor('loner','[TEST] Hireling',{owner:false,items:[alchemy()]});
const backup=makeActor('bak','[TEST] Ana - level 3',{items:[alchemy()],backup:true});
const all=[ana,bo,cy,npc,loner,backup];
const ledgerModule={active:true,version:'0.43.0',set api(v){api=v},get api(){return api}};
globalThis.game={user:gm,users:{contents:users,get:id=>users.find(u=>u.id===id),get activeGM(){return gm;}},items:{contents:world,get:id=>world.find(x=>x.id===id)},
  actors:{contents:all,get:id=>all.find(a=>a.id===id)},socket:{emit:()=>{},on:()=>{}},
  modules:{get:id=>id==='ashen-gate-profession-ledger'?ledgerModule:null},settings:{register:()=>{},registerMenu:()=>{},get:(m,k)=>values[k],set:async(m,k,v)=>{values[k]=v;}}};
const entry=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js');
await import(pathToFileURL(entry));hooks.init();hooks.ready();
const known=a=>a.flags['ashen-gate-profession-ledger'].knownRecipes;
const reset=()=>{ana.flags['ashen-gate-profession-ledger'].knownRecipes=['REC-TEST-TEA'];bo.flags['ashen-gate-profession-ledger'].knownRecipes=[];writes.length=0;failFor=null;};
const statusOf=(p,actorId,recipeId)=>p.rows.find(r=>r.actorId===actorId&&r.recipeId===recipeId)?.status;

test('normalized recipes carry `starting`; the pure plan matches professions by PROF id or key',()=>{
  assert.equal(normalizeRecipe({id:'REC-TEST-A',name:'A',starting:true}).starting,true);
  assert.equal(normalizeRecipe({id:'REC-TEST-B',name:'B'}).starting,false);
  assert.equal(isStartingRecipe({starting:'yes'}),false,'only true counts');
  const rows=startingRecipePlan([{id:'x',name:'X'}],[{id:'REC-TEST-A',name:'A',starting:true,professionId:'PROF-TG-MINING'},{id:'REC-TEST-B',name:'B',starting:true,professionId:'PROF-TG-COOKING'}],
    {heldProfessions:()=>({ids:new Set(),keys:new Set(['mining'])}),known:()=>[],unreleased:()=>''});
  assert.deepEqual(rows.map(r=>[r.recipeId,r.status]),[['REC-TEST-A','new']]);
});

test('preview writes nothing and lists only player characters, with New / Already known / not released',async()=>{
  reset();
  const p=await api.grantStartingRecipes();
  assert.equal(p.preview,true);
  assert.equal(writes.length,0,'preview writes nothing');
  assert.deepEqual(p.actors.map(a=>a.name),['[TEST] Ana','[TEST] Bo','[TEST] Cy'],'no NPC, no unowned character, no level backup');
  assert.equal(p.actors.find(a=>a.id==='cy').hasProfession,false);
  assert.equal(statusOf(p,'ana','REC-TEST-SALVE'),'new');
  assert.equal(statusOf(p,'ana','REC-TEST-TEA'),'known');
  assert.equal(statusOf(p,'ana','REC-TEST-BOMB'),undefined,'not a starting recipe');
  assert.equal(statusOf(p,'ana','REC-TEST-NAIL'),undefined,'not her profession');
  assert.equal(statusOf(p,'ana','REC-TEST-DRAFT'),'unreleased');
  assert.match(p.rows.find(r=>r.recipeId==='REC-TEST-DRAFT').reason,/^Draft: not released to players/);
  assert.match(p.rows.find(r=>r.recipeId==='REC-TEST-SECRET').reason,/^GM-only: not released to players/);
  assert.equal(statusOf(p,'bo','REC-TEST-POULTICE'),'new','an untagged Herbalism feature matches by profession');
  assert.equal(p.rows.find(r=>r.recipeId==='REC-TEST-SALVE').recipeName,'[TEST] Salve');
  assert.equal(p.rows.find(r=>r.recipeId==='REC-TEST-SALVE').profession,'[TEST] Alchemy');
});

test('commit grants only starting recipes of each character’s professions, uses no Item, and is idempotent',async()=>{
  reset();
  const out=await api.grantStartingRecipes({preview:false});
  assert.deepEqual(known(ana),['REC-TEST-TEA','REC-TEST-SALVE'],'appended; draft, GM-only and non-starting recipes are not granted');
  assert.deepEqual(known(bo),['REC-TEST-POULTICE']);
  assert.equal(ana.items.get('r-salve').system.quantity,2,'the recipe item is not used up');
  assert.deepEqual(out.granted.map(g=>[g.actorName,g.recipes.map(r=>r.name)]),[['[TEST] Ana',['[TEST] Salve']],['[TEST] Bo',['[TEST] Poultice']]]);
  assert.deepEqual(writes.map(w=>w.key),['knownRecipes','grantedRecipes','knownRecipes','grantedRecipes'],'the normal known-recipes flag, then the 0.33.0 record of what the grant added (for Refresh)');
  writes.length=0;
  const again=await api.grantStartingRecipes({preview:false});
  assert.deepEqual(again.granted,[],'second run grants nothing new');
  assert.equal(writes.length,0,'and writes nothing');
  assert.deepEqual(known(ana),['REC-TEST-TEA','REC-TEST-SALVE'],'never duplicates or removes');
});

test('rowIds and actorIds limit the grant; a later profession is picked up by pressing again',async()=>{
  reset();
  const out=await api.grantStartingRecipes({preview:false,actorIds:['bo']});
  assert.deepEqual(out.granted.map(g=>g.actorId),['bo']);assert.deepEqual(known(ana),['REC-TEST-TEA']);
  reset();
  await api.grantStartingRecipes({preview:false,rowIds:['bo:REC-TEST-POULTICE']});
  assert.deepEqual(known(ana),['REC-TEST-TEA']);assert.deepEqual(known(bo),['REC-TEST-POULTICE']);
  cy.items.push(alchemy());
  try{const p=await api.grantStartingRecipes({actorIds:['cy']});assert.equal(statusOf(p,'cy','REC-TEST-SALVE'),'new');}
  finally{cy.items.splice(0);}
});

test('all or nothing: a failed character puts back the ones already granted',async()=>{
  reset();failFor='bo';
  await assert.rejects(api.grantStartingRecipes({preview:false}),/not granted: \[TEST\] Bo could not be updated.*Nothing was changed/);
  assert.deepEqual(known(ana),['REC-TEST-TEA'],'Ana rolled back');assert.deepEqual(known(bo),[]);
  reset();
});

test('refused in the data layer: players, NPCs, unowned characters and level backups',async()=>{
  reset();
  await assert.rejects(api.grantStartingRecipes({actorIds:['npc']}),/not a player character/);
  await assert.rejects(api.grantStartingRecipes({preview:false,actorIds:['loner']}),/not a player character/);
  await assert.rejects(api.grantStartingRecipes({preview:false,actorIds:['bak']}),/level backup/);
  game.user=alice;
  try{
    await assert.rejects(api.grantStartingRecipes(),/Only the GM can grant starting recipes/);
    await assert.rejects(api.grantStartingRecipes({preview:false,actorIds:['ana']}),/Only the GM can grant starting recipes/);
  }finally{game.user=gm;}
  assert.equal(writes.length,0);
});

test('the Learn rule is unchanged: the GM still cannot learn a recipe item for a player-owned character',async()=>{
  reset();
  await assert.rejects(api.learnRecipe(ana,ana.items.get('r-salve')),/player learns this recipe/);
  assert.equal(writes.length,0);
});

test('Assign has Professions and Starting recipes sub-tabs; the grant previews, confirms and shows the result',async()=>{
  reset();
  const app=api.open({view:'assign'});app.view='assign';
  let html=(await app._prepareContext({})).html;
  assert.match(html,/role="tab" id="agl-assign-tab-professions"[^>]*>Professions</);
  assert.match(html,/role="tab" id="agl-assign-tab-recipes"[^>]*>Starting recipes</);
  assert.match(html,/<h2>Grant starting recipes<\/h2>/);
  assert.match(html,/data-grant-target><option value="party" selected>Whole party \(3\)<\/option>/,'player characters only');
  app.grantState.preview=await api.grantStartingRecipes();app.grantState.selected=new Set(['ana:REC-TEST-SALVE']);
  html=(await app._prepareContext({})).html;
  assert.match(html,/\[TEST\] Ana <span class="agl-sub">— 1 recipe to grant, 1 already known<\/span>/);
  assert.match(html,/\[TEST\] Cy <span class="agl-sub">— no profession yet<\/span>/);
  assert.match(html,/Will grant/);assert.match(html,/Already known/);assert.match(html,/Not granted.*Draft: not released to players/s);
  assert.match(html,/data-action="grant-apply" data-id="selected" >Grant selected…<\/button>/);
  assert.match(html,/class="ag-btn ag-btn--primary" data-action="grant-apply" data-id="all" >Grant all new \(2\)…<\/button>/);
  assert.doesNotMatch(html,/\b(Alpha|Beta|Preview build|New!)\b/);
  game.user=alice;
  try{app.view='assign';const p=(await app._prepareContext({})).html;assert.doesNotMatch(p,/Grant starting recipes/,'players never see it');}
  finally{game.user=gm;}
});

test('buttons: Preview selects the new rows; a declined confirmation grants nothing; Grant shows what each character got',async()=>{
  reset();
  const app=api.open({view:'assign'});app.view='assign';app.grantState={target:'party',preview:null,selected:new Set(),result:null};
  await app._click('grant-preview');
  assert.deepEqual([...app.grantState.selected].sort(),['ana:REC-TEST-SALVE','bo:REC-TEST-POULTICE']);
  assert.equal(writes.length,0);
  confirmAnswer=false;await app._click('grant-apply','all');confirmAnswer=true;
  assert.equal(writes.length,0,'declined: nothing granted');
  app.grantState.selected=new Set(['bo:REC-TEST-POULTICE']);
  await app._click('grant-apply','selected');
  assert.match(FakeDialog.last.content,/\[TEST\] Bo: \[TEST\] Poultice/);assert.match(FakeDialog.last.content,/No recipe item is needed or used up/);
  assert.deepEqual(known(bo),['REC-TEST-POULTICE']);assert.deepEqual(known(ana),['REC-TEST-TEA']);
  assert.equal(app.notice,'Granted 1 starting recipe to 1 character.');
  const html=(await app._prepareContext({})).html;
  assert.match(html,/<h3>Granted<\/h3><ul><li><b>\[TEST\] Bo<\/b> \(1\): \[TEST\] Poultice<\/li><\/ul>/);
  assert.match(html,/\[TEST\] Bo <span class="agl-sub">— nothing to grant, 1 already known<\/span>/,'the preview is refreshed');
  reset();
});

test('0.31.0: a malformed or unknown rowIds is rejected, never widened to every row (grant and assign)',async()=>{
  for(const bad of ['bo:REC-TEST-POULTICE',{0:'bo:REC-TEST-POULTICE'},42,true]){
    reset();
    await assert.rejects(api.grantStartingRecipes({preview:false,rowIds:bad}),/rowIds must be a list/);
    assert.equal(writes.length,0);assert.deepEqual(known(bo),[]);assert.deepEqual(known(ana),['REC-TEST-TEA']);
    await assert.rejects(api.assign.apply({rowIds:bad}),/rowIds must be a list/);
  }
  reset();
  for(const bad of [['nobody:REC-TEST-SALVE'],['bo:REC-TEST-POULTICE','bo:REC-NOPE'],[7],[{}],[null]]){
    await assert.rejects(api.grantStartingRecipes({preview:false,rowIds:bad}),/Unknown row id/,JSON.stringify(bad));
    await assert.rejects(api.assign.apply({rowIds:bad}),/Unknown row id/);
  }
  assert.equal(writes.length,0,'a rejected call writes nothing, not even the valid ids beside the bad one');
  assert.deepEqual(known(bo),[]);
});

test('0.31.0: no rowIds (or null) still means every new row; an empty list means none; a known but already-known row is skipped',async()=>{
  reset();
  await api.grantStartingRecipes({preview:false,rowIds:[]});
  assert.equal(writes.length,0);
  await api.grantStartingRecipes({preview:false,rowIds:['ana:REC-TEST-TEA']});
  assert.equal(writes.length,0,'a row that is already known grants nothing');
  await api.grantStartingRecipes({preview:false,rowIds:null});
  assert.deepEqual(known(bo),['REC-TEST-POULTICE']);
});

test('0.31.4: a granted starting recipe reads as known in Individual, Party and Catalog, never "Not found by the party yet"',async()=>{
  reset();
  await api.grantStartingRecipes({preview:false});
  values.libraryData={schema:'ag-ledger/0.1',recipes:[],materials:[]};
  const render=async(view,actorId)=>{const app=api.open({view,actorId});app.view=view;if(actorId)app.actorId=actorId;return (await app._prepareContext({})).html;};
  const rowOf=(html,name)=>{const i=html.indexOf(name);assert.ok(i>=0,`${name} is listed`);return html.slice(i,html.indexOf('</article>',i));};
  for(const view of ['individual','party','catalog']){
    const html=await render(view,'ana');
    const salve=rowOf(html,'[TEST] Salve');
    assert.match(salve,/Known by \[TEST\] Ana/,`${view}: granted starting recipe shows Known by`);
    assert.doesNotMatch(salve.split('[TEST] Tea')[0],/Not found by the party yet/,`${view}: no "not found" on a starting recipe`);
  }
  // a recipe nobody knows or holds is still "not found" in the GM catalog
  const catalog=await render('catalog');
  assert.match(rowOf(catalog,'[TEST] Bomb'),/Not found by the party yet/);
  // Individual view of a character whose recipes were learned (not granted) agrees
  const ind=await render('individual','ana');
  assert.match(rowOf(ind,'[TEST] Tea'),/Known by \[TEST\] Ana/);
});
