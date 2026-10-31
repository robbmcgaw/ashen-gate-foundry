import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {planRecipeRefresh,missingRecipeCount} from '../scripts/recipe-refresh.mjs';
// 0.36.0: Refresh recipes. All data is synthetic ([TEST] names).
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
  rec('r5','REC-TEST-TEA','[TEST] Tea','PROF-TG-HERBALISM'),
  rec('r6','REC-TEST-LORE','[TEST] Herb Lore','PROF-TG-HERBALISM',false),
  (()=>{const d=rec('r7','REC-TEST-DRAFT','[TEST] Draft Salve','PROF-TG-HERBALISM',false);d.flags['ashen-gate-manager'].source.status='draft';return d;})(),
  (()=>{const d=rec('r8','REC-TEST-DRAFTSTART','[TEST] Draft Start','PROF-TG-HERBALISM');d.flags['ashen-gate-manager'].source.status='draft';return d;})(),
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
const ledgerModule={active:true,version:'0.41.1',set api(v){api=v},get api(){return api}};
globalThis.game={user:gm,users:{contents:users,get:id=>users.find(u=>u.id===id),get activeGM(){return gm;}},items:{contents:world,get:id=>world.find(x=>x.id===id)},
  actors:{contents:all,get:id=>all.find(a=>a.id===id)},socket:{emit:()=>{},on:()=>{}},journal:[],
  modules:{get:id=>id===ID?ledgerModule:null},settings:{register:()=>{},registerMenu:()=>{},get:(m,k)=>values[k],set:async(m,k,v)=>{values[k]=v;}}};
const entry=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js');
await import(pathToFileURL(entry));hooks.init();hooks.ready();
const names=a=>a.items.map(i=>i.name).sort();
const known=a=>a.flags[ID]?.knownRecipes??[];

const flagsOf=a=>a.flags[ID]??{};
dee.testUserPermission=()=>true;
// Dee holds Herbalism. Her recipes: a starting one, a learned one (she crafted from it), one for a profession she lost, a draft one, and three that no longer exist.
const reset=()=>{
  dee.items=[held('i-herb','PROF-TG-HERBALISM','[TEST] Herbalism',true),
    {id:'i-craft',name:'[TEST] Crafted Tonic',type:'loot',system:{quantity:2},flags:{[ID]:{craftedFrom:'REC-TEST-LORE'}}},{id:'i-sword',name:'[TEST] Sword',type:'weapon',system:{quantity:1},flags:{}}];
  dee.flags={[ID]:{knownRecipes:['REC-TEST-POULTICE','REC-TEST-LORE','REC-TEST-VEIN','REC-TEST-DRAFT','REC-GONE-ONE','old recipe',{x:1}],grantedRecipes:['REC-TEST-POULTICE'],
    professionProgress:{schema:'ag-profession-actor-progress/0.1',professions:{'PROF-TG-HERBALISM':{xp:5,selectedPerkIds:[]}}}}};
  dee.system.skills={nat:{value:1}};dee.system.tools={};dee.writes=[];dee.writeJournals=[];journals.length=0;journalFails=false;game.user=gm;
};
const origSet=dee.setFlag;dee.setFlag=async(s,k,v)=>{dee.writeJournals.push(journals.length);return origSet(s,k,v);};
const rows=p=>Object.fromEntries(p.rows.map(r=>[r.name,r]));
const app=api.open({view:'individual'});app.element={querySelector:()=>null,querySelectorAll:()=>[]};
const html=async(view='individual')=>{app.view=view;app.actorId='dee';return (await app._prepareContext({})).html;};

test('pure: groups, defaults and counts: only what no longer exists is pre-ticked; missing starting recipes are offered',()=>{
 const recipes=[{id:'REC-A',name:'A',professionId:'PROF-H',starting:true},{id:'REC-B',name:'B',professionId:'PROF-H'},{id:'REC-C',name:'C',professionId:'PROF-M'},{id:'REC-S',name:'S',professionId:'PROF-H',starting:true,status:'approved',sourceVisibility:'player'}];
 const held={ids:new Set(['PROF-H']),keys:new Set()};
 const plan=planRecipeRefresh({known:['REC-A','REC-B','REC-C','REC-X'],knownRaw:['REC-A','REC-B','REC-C','REC-X','legacy',7],recipes,held,actor:{id:'x',name:'X'}});
 const by=Object.fromEntries(plan.rows.map(r=>[r.token,r]));
 assert.deepEqual([by['REC-A'].group,by['REC-B'].group,by['REC-C'].group,by['REC-X'].group,by['legacy'].group,by['@non-text'].group],['starting','learned','unheld','gone','gone','gone']);
 assert.deepEqual(plan.rows.filter(r=>r.remove).map(r=>r.token).sort(),['@non-text','REC-X','legacy'],'only the ones that cannot work are pre-ticked');
 assert.deepEqual(plan.missing.map(m=>[m.recipeId,m.add]),[['REC-S',true]]);
 assert.equal(plan.counts.gone,3);assert.equal(plan.problems,true);
 assert.equal(plan.needsTypedConfirmation,false);
 assert.equal(missingRecipeCount({known:['REC-A','REC-X'],knownRaw:['REC-A','REC-X','legacy',7,8],recipes}),4);
});

test('a recipe that no longer exists, a legacy string and a non-text entry are listed and pre-ticked; no row ever shows a raw id',async()=>{
 reset();
 const p=await api.refreshRecipes({actorId:'dee'});
 assert.equal(p.preview,true);
 const r=rows(p);
 for(const name of ['Unrecognised recipe 1','Unrecognised recipe 2']){assert.equal(r[name].group,'gone');assert.equal(r[name].remove,true);}
 const nonText=p.rows.find(x=>x.token==='@non-text');assert.equal(nonText.remove,true);assert.match(nonText.name,/Unrecognised recipe entries \(1\)/);
 assert.ok(p.rows.every(x=>!/REC-|old recipe/.test(x.name)),'names carry no ids');
 assert.deepEqual(['[TEST] Poultice','[TEST] Herb Lore','[TEST] Vein Map','[TEST] Draft Salve'].map(n=>[r[n].group,r[n].remove]),[['starting',false],['learned',false],['unheld',false],['draft',false]]);
 assert.match(r['[TEST] Draft Salve'].why,/Draft: not released to players/,'unreleased: a reason');
 assert.deepEqual(p.missing.map(m=>[m.name,m.status,m.add]),[['[TEST] Draft Start','unreleased',false],['[TEST] Tea','new',true]],'a missing starting recipe is pre-ticked; an unreleased one is skipped with its reason');
 assert.match(p.missing[0].reason,/not released to players/);
});

test('Apply: snapshot first, then the flags; removes what is ticked, adds the missing starting recipe, touches nothing else; idempotent',async()=>{
 reset();
 const items=dee.items.map(i=>i.id),progress=structuredClone(flagsOf(dee).professionProgress);
 const out=await api.refreshRecipes({actorId:'dee',preview:false});
 assert.deepEqual([out.removed,out.added],[3,1]);
 assert.equal(journals.length,1);assert.equal(journals[0].flags[ID].snapshot.flagsBefore.knownRecipes.length,7,'the snapshot has the flags as they were');
 assert.ok(dee.writeJournals.every(n=>n>=1),'the snapshot was saved before any flag was written');
 assert.deepEqual(flagsOf(dee).knownRecipes.sort(),['REC-TEST-DRAFT','REC-TEST-LORE','REC-TEST-POULTICE','REC-TEST-TEA','REC-TEST-VEIN'],'learned, draft and lost-profession recipes stay; the Tea is added');
 assert.ok(flagsOf(dee).grantedRecipes.includes('REC-TEST-TEA'));
 assert.deepEqual(dee.items.map(i=>i.id),items,'crafted items, gear and professions are untouched');assert.deepEqual(flagsOf(dee).professionProgress,progress,'XP is untouched');
 const again=await api.refreshRecipes({actorId:'dee',preview:false});
 assert.deepEqual([again.removed,again.added,again.snapshot],[0,0,null]);assert.equal(journals.length,1,'a second run saves no snapshot and changes nothing');
 assert.equal((await api.refreshRecipes({actorId:'dee'})).problems,false);
});

test('a learned recipe the character has progress with needs the character’s name typed; unticked, nothing is asked',async()=>{
 reset();
 const p=await api.refreshRecipes({actorId:'dee',remove:['REC-TEST-LORE']});
 assert.equal(rows(p)['[TEST] Herb Lore'].needsConfirm,true,'she crafted from it and has XP');assert.equal(p.needsTypedConfirmation,true);
 await assert.rejects(()=>api.refreshRecipes({actorId:'dee',preview:false,remove:['REC-TEST-LORE']}),/needs the character's name typed to confirm \(\[TEST\] Dee\)/);
 assert.equal(journals.length,0,'nothing was saved or changed');
 await api.refreshRecipes({actorId:'dee',preview:false,remove:['REC-TEST-LORE'],add:[],confirmName:'[TEST] Dee'});
 assert.ok(!flagsOf(dee).knownRecipes.includes('REC-TEST-LORE'));assert.ok(flagsOf(dee).knownRecipes.includes('REC-GONE-ONE'),'only what was ticked was removed');
 assert.equal(dee.items.some(i=>i.id==='i-craft'),true,'the crafted item stays');
 reset();const plain=await api.refreshRecipes({actorId:'dee'});assert.equal(plain.needsTypedConfirmation,false,'the defaults never need a typed confirmation');
 await assert.rejects(()=>api.refreshRecipes({actorId:'dee',preview:false,remove:['REC-NOT-LISTED']}),/no longer listed/);
});

test('if the snapshot cannot be saved nothing is changed',async()=>{
 reset();journalFails=true;const before=structuredClone(dee.flags);
 await assert.rejects(()=>api.refreshRecipes({actorId:'dee',preview:false}),/the snapshot could not be saved/);
 assert.deepEqual(dee.flags,before);assert.deepEqual(dee.writes,[]);journalFails=false;
});

test('GM only in the data layer; NPCs, unowned characters and level backups are refused',async()=>{
 reset();game.user=alice;
 await assert.rejects(()=>api.refreshRecipes({actorId:'dee'}),/Only the GM can refresh recipes/);await assert.rejects(()=>api.refreshRecipes({actorId:'dee',preview:false}),/Only the GM/);
 await assert.rejects(()=>api.refreshRecipes({party:true}),/Only the GM/);
 game.user=gm;
 for(const id of ['npc','loner','bak'])await assert.rejects(()=>api.refreshRecipes({actorId:id}),/not a player character|Character not found|level backup/);
});

test('whole party: only characters with a problem are listed; each has its own ticks; one needing confirmation is reported, not forced',async()=>{
 reset();
 const eve=makeActor('eve','[TEST] Eve');eve.items=[held('e-herb','PROF-TG-HERBALISM','[TEST] Herbalism',true)];eve.flags={[ID]:{knownRecipes:['REC-TEST-POULTICE','REC-TEST-TEA'],grantedRecipes:[]}};
 const clean=makeActor('fay','[TEST] Fay');clean.items=[held('f-herb','PROF-TG-HERBALISM','[TEST] Herbalism',true)];clean.flags={[ID]:{knownRecipes:['REC-TEST-POULTICE','REC-TEST-TEA'],grantedRecipes:[]}};
 // Fay is clean (nothing missing, nothing gone); Eve lacks nothing either, so only Dee has a problem until Eve gains a dead entry.
 all.push(eve,clean);values.partyRoster=['dee','eve','fay'];
 try{
  let p=await api.refreshRecipes({party:true});
  assert.deepEqual(p.characters.map(c=>c.actor.name),['[TEST] Dee'],'no problem, not listed');
  eve.flags[ID].knownRecipes.push('REC-GONE-TWO');
  p=await api.refreshRecipes({party:true});assert.deepEqual(p.characters.map(c=>c.actor.name),['[TEST] Dee','[TEST] Eve']);
  const out=await api.refreshRecipes({party:true,preview:false,selections:[{actorId:'dee'},{actorId:'eve',remove:['REC-GONE-TWO'],add:[]},{actorId:'dee',remove:['REC-TEST-LORE']}]});
  assert.equal(out.results[0].removed,3);assert.equal(out.results[1].removed,1);assert.match(out.results[2].error,/already|typed to confirm/,'a second pass on Dee asks for confirmation, it is not forced');
  assert.ok(!flagsOf(eve).knownRecipes.includes('REC-GONE-TWO'));
 }finally{all.splice(all.indexOf(eve),1);all.splice(all.indexOf(clean),1);values.partyRoster=['dee'];}
});

test('Individual tab: everyone sees “N recipes no longer exist”; only the GM gets Refresh recipes…; the view opens in place with a footer Cancel and primary',async()=>{
 reset();
 game.user=alice;let h=await html();
 assert.match(h,/2 recipes no longer exist/,'a player’s catalog hides unreleased recipes, so only entries that cannot be recipes are counted');assert.doesNotMatch(h,/Refresh recipes…|rr-open/,'players see no GM control');
 game.user=gm;h=await html();
 assert.match(h,/3 recipes no longer exist/);assert.match(h,/data-action="rr-open" data-id="dee"><i[^>]*><\/i> Refresh recipes…/);
 await app._click('rr-open','dee');h=await html();
 assert.match(h,/<h2 id="agl-rr-h">Refresh recipes: \[TEST\] Dee<\/h2>/);assert.match(h,/Not in the catalog any more <span class="ag-badge">3/);assert.match(h,/Missing starting recipes/);
 assert.match(h,/data-rr-remove="REC-GONE-ONE" checked/);assert.match(h,/data-rr-remove="REC-TEST-LORE" >/);
 assert.match(h,/<footer class="ag-footer"><button[^>]*data-action="rr-cancel">Cancel<\/button>.*data-action="rr-apply" >.*Refresh recipes<\/button><\/footer>/s,'Cancel left, one primary right');
 // Ticking a learned recipe with progress asks for the name; the button stays off until it is typed.
 app._recipeRefreshReady();
 const tick={matches:s=>s.includes('data-rr-remove'),dataset:{rrRemove:'REC-TEST-LORE'},checked:true};
 app.element={querySelector:()=>null,querySelectorAll:()=>[]};
 app.recipeRefresh.remove.add('REC-TEST-LORE');app._recipeRefreshReplan();
 assert.equal(app._recipeRefreshReady(),false);app.recipeRefresh.confirm='[TEST] Dee';assert.equal(app._recipeRefreshReady(),true);
 h=await html();assert.match(h,/Type <b>\[TEST\] Dee<\/b> to confirm/);
 await app._click('rr-apply');
 assert.equal(app.recipeRefresh,null);assert.ok(!flagsOf(dee).knownRecipes.includes('REC-TEST-LORE'));assert.ok(!flagsOf(dee).knownRecipes.includes('REC-GONE-ONE'));
 h=await html();assert.doesNotMatch(h,/recipes? no longer exist?/);
 // Party tab: the GM has the button.
 const party=await html('party');assert.match(party,/data-action="rr-open" data-id="party"[^>]*>.*Refresh recipes for the whole party…/s);
 game.user=alice;assert.doesNotMatch(await html('party'),/rr-open/);game.user=gm;
 game.user=alice;await app._click('rr-open','dee');assert.equal(app.recipeRefresh,null,'a player cannot open it');game.user=gm;
});

/* ---- 0.37.12: replaced starters ----------------------------------------------------------------------- */
test('pure, Blacksmithing worked example: 4 old + 4 new starters; the 4 demoted ones are pre-ticked unless crafted with; learned ones never',()=>{
 const smith={ids:new Set(['PROF-B']),keys:new Set()};
 const old=['Iron Caltrops','Iron Pitons','Riveted Field Brace','Silvered Blade'],fresh=['Trail Spikes','Edge Whetstone','Riveted Shield Fittings','Reinforced Buckle'];
 const recipes=[...old.map((n,i)=>({id:`REC-O${i}`,name:n,professionId:'PROF-B',starting:false})),...fresh.map((n,i)=>({id:`REC-N${i}`,name:n,professionId:'PROF-B',starting:true,status:'approved',sourceVisibility:'player'})),
  {id:'REC-LEARNED',name:'Hand-learned Hinge',professionId:'PROF-B',starting:false}];
 const known=[...old.map((_,i)=>`REC-O${i}`),...fresh.map((_,i)=>`REC-N${i}`),'REC-LEARNED'];
 const plan=planRecipeRefresh({known,grantedRecipes:[...old.map((_,i)=>`REC-O${i}`),...fresh.map((_,i)=>`REC-N${i}`)],recipes,held:smith,actor:{id:'a',name:'A'}});
 const by=Object.fromEntries(plan.rows.map(r=>[r.name,r]));
 assert.deepEqual(old.map(n=>[by[n].group,by[n].remove]),old.map(()=>['replaced',true]),'the four old starters: Replaced, pre-ticked');
 assert.deepEqual(fresh.map(n=>[by[n].group,by[n].remove]),fresh.map(()=>['starting',false]),'the four new ones stay');
 assert.deepEqual([by['Hand-learned Hinge'].group,by['Hand-learned Hinge'].remove],['learned',false],'a learned recipe is never pre-ticked');
 assert.match(by['Iron Caltrops'].why,/^Replaced starting recipe: it is no longer a starter\. Untick it if you want the character to keep it\.$/);
 assert.ok(plan.rows.every(r=>!/REC-/.test(r.name+r.why)));assert.equal(plan.needsTypedConfirmation,false);assert.equal(plan.problems,true);assert.equal(plan.counts.replaced,4);
 // One who crafted Iron Caltrops: that one stays, with its reason; ticking it needs the typed name.
 const crafter=planRecipeRefresh({known,grantedRecipes:old.map((_,i)=>`REC-O${i}`),recipes,held:smith,crafted:[{recipeId:'REC-O0'}],actor:{id:'a',name:'A'}});
 const c0=crafter.rows.find(r=>r.name==='Iron Caltrops');
 assert.deepEqual([c0.group,c0.remove,c0.needsConfirm],['replaced',false,true]);assert.match(c0.why,/has crafted with it, so it stays unless you tick it/);
 assert.equal(crafter.rows.filter(r=>r.group==='replaced'&&r.remove).length,3);assert.equal(crafter.needsTypedConfirmation,false,'the defaults never need the name');
 assert.equal(planRecipeRefresh({known,grantedRecipes:['REC-O0'],recipes,held:smith,crafted:[{recipeId:'REC-O0'}],remove:['REC-O0'],actor:{id:'a',name:'A'}}).needsTypedConfirmation,true,'ticked by hand: the name');
 // A starter the character was never recorded as granted (older grants, learned by hand) is simply Learned.
 assert.equal(planRecipeRefresh({known:['REC-O1'],grantedRecipes:[],recipes,held:smith,actor:{id:'a',name:'A'}}).rows[0].group,'learned');
});

test('Refresh recipes swaps starters: preview pre-ticks the demoted ones, Apply removes them (and their granted record), adds the new ones; snapshot first; idempotent; party agrees',async()=>{
 reset();
 // Dee was granted Lore as a starter; the pack demoted it. Poultice stays a starter; Tea is a new starter she lacks.
 dee.items=dee.items.filter(i=>i.id!=='i-craft');
 dee.flags[ID].knownRecipes=['REC-TEST-POULTICE','REC-TEST-LORE'];dee.flags[ID].grantedRecipes=['REC-TEST-POULTICE','REC-TEST-LORE'];
 const p=await api.refreshRecipes({actorId:'dee'});
 const r=rows(p);
 assert.deepEqual([r['[TEST] Herb Lore'].group,r['[TEST] Herb Lore'].remove],['replaced',true]);assert.deepEqual([r['[TEST] Poultice'].group,r['[TEST] Poultice'].remove],['starting',false]);
 assert.deepEqual(p.missing.filter(m=>m.add).map(m=>m.name),['[TEST] Tea']);assert.equal(p.needsTypedConfirmation,false);
 const party=await api.refreshRecipes({party:true});assert.deepEqual(party.characters.map(c=>c.actor.name),['[TEST] Dee'],'the party view lists a character whose only problem is a replaced starter');
 await api.refreshRecipes({party:true,preview:false});
 assert.equal(journals.length,1,'snapshot first');
 assert.deepEqual(flagsOf(dee).knownRecipes.sort(),['REC-TEST-POULTICE','REC-TEST-TEA']);assert.ok(!flagsOf(dee).grantedRecipes.includes('REC-TEST-LORE'),'its granted record goes with it');
 const again=await api.refreshRecipes({actorId:'dee',preview:false});assert.deepEqual([again.removed,again.added],[0,0]);assert.equal(journals.length,1);
 // The same through the single-character API with a crafter: nothing is removed for the crafted one.
 reset();dee.flags[ID].knownRecipes=['REC-TEST-LORE'];dee.flags[ID].grantedRecipes=['REC-TEST-LORE'];
 const kept=await api.refreshRecipes({actorId:'dee'});const lore=rows(kept)['[TEST] Herb Lore'];
 assert.deepEqual([lore.group,lore.remove,lore.needsConfirm],['replaced',false,true],'crafted with it (i-craft): stays');
 game.user=alice;await assert.rejects(()=>api.refreshRecipes({actorId:'dee',preview:false}),/Only the GM/);game.user=gm;
});

test('party view: a character carrying 4 replaced Blacksmithing starters is listed with them pre-ticked, never “No problems found”; the Individual badge counts them',async()=>{
 reset();
 const smith=prof('wsmith','PROF-TG-SMITH','[TEST] Blacksmithing',{skillProficienciesAnyOf:['Athletics']});
 const olds=['Trail Spikes','Riveted Fittings','Reinforced Buckle','Edge Whetstone'].map((n,i)=>rec(`so${i}`,`REC-TEST-OLD${i}`,`[TEST] ${n}`,'PROF-TG-SMITH',false));
 const news=['Hinge Pin','Rivet Set','Chain Link','Strap Ring'].map((n,i)=>rec(`sn${i}`,`REC-TEST-NEW${i}`,`[TEST] ${n}`,'PROF-TG-SMITH',true));
 const added=[smith,...olds,...news];world.push(...added);
 const gus=makeActor('gus','[TEST] Gus');gus.items=[held('g-smith','PROF-TG-SMITH','[TEST] Blacksmithing',true)];
 gus.flags={[ID]:{knownRecipes:olds.map((_,i)=>`REC-TEST-OLD${i}`),grantedRecipes:olds.map((_,i)=>`REC-TEST-OLD${i}`)}};
 all.push(gus);values.partyRoster=['gus'];
 const prevActor=app.actorId;
 try{
  const p=await api.refreshRecipes({party:true});
  assert.deepEqual(p.characters.map(c=>c.actor.name),['[TEST] Gus']);
  assert.equal(p.characters[0].rows.filter(r=>r.group==='replaced'&&r.remove).length,4);
  await app._click('rr-open','party');app.view='party';
  const h=(await app._prepareContext({})).html;
  assert.doesNotMatch(h,/No problems found/);
  assert.match(h,/<h3>\[TEST\] Gus <span class="ag-badge">8<\/span>/,'4 replaced to remove + 4 new starters to add');
  assert.equal((h.match(/data-rr-remove="REC-TEST-OLD\d" data-rr-actor="gus" checked/g)||[]).length,4,'the replaced starters are pre-ticked');
  assert.equal((h.match(/data-rr-add="REC-TEST-NEW\d" data-rr-actor="gus" checked/g)||[]).length,4);
  assert.match(h,/Replaced starting recipe: it is no longer a starter\./);
  app.recipeRefresh=null;app.actorId='gus';app.view='individual';
  const ind=(await app._prepareContext({})).html;assert.match(ind,/4 replaced starting recipes/);
  await api.refreshRecipes({party:true,preview:false});
  const after=await api.refreshRecipes({party:true});assert.equal(after.characters.length,0);
  await app._click('rr-open','party');app.view='party';
  const e=(await app._prepareContext({})).html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  assert.match(e,/No problems found\./);
 }finally{
  for(const d of added)world.splice(world.indexOf(d),1);all.splice(all.indexOf(gus),1);values.partyRoster=['dee'];app.recipeRefresh=null;app.actorId=prevActor;
 }
});

test('Assign: Replace or remove starting recipes… opens Refresh recipes with the chosen target, the hint explains it, and Cancel returns to Assign',async()=>{
 reset();
 const h=await html('assign');
 assert.match(h,/data-action="rr-open" data-id="party" data-from="assign">.*Replace or remove starting recipes…/s);
 assert.match(h,/Granting only <b>adds<\/b>/);assert.match(h,/Refresh professions…/);assert.doesNotMatch(h,/>\s*Refresh…\s*</);
 await app._click('rr-open','dee',{from:'assign'});
 assert.equal(app.recipeRefresh.from,'assign');assert.equal(app.recipeRefresh.actorId,'dee');
 await app._click('rr-cancel');assert.equal(app.recipeRefresh,null);
 game.user=alice;assert.doesNotMatch(await html('assign'),/Replace or remove starting recipes/);game.user=gm;
});

/* ---- 0.37.12: pack marker former_starting ------------------------------------------------------------- */
test('pure: former_starting pre-ticks replaced starters that were never recorded as granted; no marker, no pre-tick; older data behaves as before',()=>{
 const smith={ids:new Set(['PROF-B']),keys:new Set()};
 const old=[0,1,2,3].map(i=>({id:`REC-O${i}`,name:`Old ${i}`,professionId:'PROF-B',starting:false,formerStarting:true}));
 const fresh=[0,1,2,3].map(i=>({id:`REC-N${i}`,name:`New ${i}`,professionId:'PROF-B',starting:true,status:'approved',sourceVisibility:'player'}));
 const learned={id:'REC-L',name:'Learned',professionId:'PROF-B',starting:false};
 const recipes=[...old,...fresh,learned],known=recipes.map(r=>r.id);
 const plan=planRecipeRefresh({known,grantedRecipes:[],recipes,held:smith,actor:{id:'a',name:'A'}});
 const by=Object.fromEntries(plan.rows.map(r=>[r.name,r]));
 assert.deepEqual(old.map(r=>[by[r.name].group,by[r.name].remove]),old.map(()=>['replaced',true]));
 assert.deepEqual([by.Learned.group,by.Learned.remove],['learned',false]);
 assert.deepEqual([plan.counts.replaced,plan.counts.remove,plan.problems],[4,4,true]);
 assert.equal(by['Old 0'].why,'Replaced starting recipe: it is no longer a starter. Untick it if you want the character to keep it.');
 // Crafted with one: it stays unticked, with the typed-name rule.
 const c=planRecipeRefresh({known,recipes,held:smith,crafted:[{recipeId:'REC-O2'}],actor:{id:'a',name:'A'}});
 const o2=c.rows.find(r=>r.name==='Old 2');assert.deepEqual([o2.group,o2.remove,o2.needsConfirm],['replaced',false,true]);assert.equal(c.counts.remove,3);
 // Older data without the field: learned, as before.
 const plain=recipes.map(({formerStarting,...r})=>r);
 assert.ok(planRecipeRefresh({known,recipes:plain,held:smith,actor:{id:'a',name:'A'}}).rows.filter(r=>r.name.startsWith('Old')).every(r=>r.group==='learned'&&!r.remove));
 // A recipe that is starting never counts as former.
 assert.equal(planRecipeRefresh({known:['REC-X'],recipes:[{id:'REC-X',name:'X',professionId:'PROF-B',starting:true,formerStarting:true,status:'approved',sourceVisibility:'player'}],held:smith,actor:{id:'a',name:'A'}}).rows[0].group,'starting');
});

test('party view and grant with the pack marker (Robb’s numbers: 4 new + extras, none recorded as granted)',async()=>{
 reset();
 const mk=(wid,id,name,starting,former)=>{const d=rec(wid,id,name,'PROF-TG-SMITH2',starting);if(former)d.flags['ashen-gate-manager'].source.definition.former_starting=true;return d;};
 const smith=prof('wsm2','PROF-TG-SMITH2','[TEST] Smithing Two',{skillProficienciesAnyOf:['Athletics']});
 const olds=[0,1,2,3].map(i=>mk(`fo${i}`,`REC-TEST-FO${i}`,`[TEST] Former ${i}`,false,true));
 const news=[0,1,2,3].map(i=>mk(`fn${i}`,`REC-TEST-FN${i}`,`[TEST] Current ${i}`,true,false));
 const plainLearned=mk('fl','REC-TEST-FL','[TEST] Trainer Recipe',false,false);
 const added=[smith,...olds,...news,plainLearned];world.push(...added);
 const mkChar=(id,n,crafted)=>{const a=makeActor(id,n);a.items=[held(`${id}-s`,'PROF-TG-SMITH2','[TEST] Smithing Two',true),...(crafted?[{id:`${id}-c`,name:'[TEST] Made',type:'loot',system:{quantity:1},flags:{[ID]:{craftedFrom:'REC-TEST-FO1'}}}]:[])];
  a.flags={[ID]:{knownRecipes:[...news,...olds,plainLearned].map(d=>d.flags['ashen-gate-manager'].source.sourceId),grantedRecipes:[]}};return a;};
 const ann=mkChar('ann','[TEST] Ann',false),bo=mkChar('bo','[TEST] Bo',true);
 all.push(ann,bo);values.partyRoster=['ann','bo'];
 try{
  const p=await api.refreshRecipes({party:true});
  assert.deepEqual(p.characters.map(c=>c.actor.name),['[TEST] Ann','[TEST] Bo']);
  const a=p.characters[0],b=p.characters[1];
  assert.equal(a.rows.filter(r=>r.group==='replaced'&&r.remove).length,4);assert.equal(b.rows.filter(r=>r.group==='replaced'&&r.remove).length,3,'Bo crafted with Former 1: unticked');
  assert.ok(a.rows.find(r=>r.name==='[TEST] Trainer Recipe').remove===false);
  assert.equal((await api.refreshRecipes({actorId:'ann'})).counts.replaced,4);
  // The grant never re-adds a former starter.
  const g=await api.grantStartingRecipes({actorIds:['ann']});assert.ok(JSON.stringify(g).indexOf('Former')<0);
  await app._click('rr-open','party');app.view='party';
  const h=(await app._prepareContext({})).html;assert.doesNotMatch(h,/No problems found/);
  assert.equal((h.match(/data-rr-remove="REC-TEST-FO\d" data-rr-actor="ann" checked/g)||[]).length,4);
  assert.equal((h.match(/data-rr-remove="REC-TEST-FO1" data-rr-actor="bo" checked/g)||[]).length,0);
  app.recipeRefresh=null;app.actorId='ann';app.view='individual';
  assert.match((await app._prepareContext({})).html,/4 replaced starting recipes/);
  await api.refreshRecipes({party:true,preview:false,selections:[{actorId:'ann'}]});
  assert.equal(flagsOf(ann).knownRecipes.length,5,'4 current + the trainer recipe');
  assert.equal((await api.refreshRecipes({actorId:'ann'})).counts.replaced,0);
 }finally{
  for(const d of added)world.splice(world.indexOf(d),1);all.splice(all.indexOf(ann),1);all.splice(all.indexOf(bo),1);values.partyRoster=['dee'];app.recipeRefresh=null;app.actorId='dee';
 }
});

/* ---- 0.37.12: the marker through the full Manager flag shape, and the pack check -------------------------- */
test('regression: a recipe stored exactly as Manager writes it (full source flag with definition, sourceVersion, provenance, refs) reaches the planner as replaced; the pack check line reports the marker',async()=>{
 reset();
 const managerDoc=(wid,id,name,extra)=>{const definition={id,entity_type:'Recipe',status:'approved',version:'0.3.7',visibility:'player',scope:'generic_rules',provenance:{source:'[TEST]'},name,
   refs:[{relation:'crafted_by',target_id:'PROF-TG-SMITH3',mode:'optional'}],profession_id:'PROF-TG-SMITH3',tier:'apprentice',starting:false,ingredients:[{material_id:'MAT-TEST-LEAF',quantity:1}],...extra};
  return {id:wid,uuid:`Item.${wid}`,name:`Recipe: ${name}`,img:'',type:'loot',ownership:{default:2},system:{description:{value:''}},testUserPermission:()=>true,
   flags:{'ashen-gate-manager':{source:{sourceId:id,entityType:'Recipe',status:'approved',visibility:'player',version:'0.3.7',sourceVersion:'0.3.7',provenance:{source:'[TEST]'},refs:structuredClone(definition.refs),scope:'generic_rules',schemaVersion:'ag-foundry-import/0.2',packageId:'AG-TEST',packageVersion:'1.0.0',definition,managedFields:{},pagesDefinition:[]}}},
   toObject(){return {_id:this.id,name:this.name,type:this.type,flags:structuredClone(this.flags),system:structuredClone(this.system)};}};};
 const added=[prof('wsm3','PROF-TG-SMITH3','[TEST] Smithing Three',{skillProficienciesAnyOf:['Athletics']}),managerDoc('mo1','REC-TEST-MO1','[TEST] Old One',{former_starting:true}),managerDoc('mo2','REC-TEST-MO2','[TEST] Unmarked',{}),managerDoc('mn1','REC-TEST-MN1','[TEST] Current',{starting:true})];
 world.push(...added);
 const cat=makeActor('cat','[TEST] Cat');cat.items=[held('c-s','PROF-TG-SMITH3','[TEST] Smithing Three',true)];cat.flags={[ID]:{knownRecipes:['REC-TEST-MO1','REC-TEST-MO2','REC-TEST-MN1'],grantedRecipes:[]}};
 all.push(cat);values.partyRoster=['cat'];
 try{
  const r=rows(await api.refreshRecipes({actorId:'cat'}));
  assert.deepEqual([r['[TEST] Old One'].group,r['[TEST] Old One'].remove],['replaced',true]);
  assert.deepEqual([r['[TEST] Unmarked'].group,r['[TEST] Unmarked'].remove],['learned',false]);
  assert.equal(r['[TEST] Current'].group,'starting');
  app.actorId='cat';await app._click('rr-open','cat');
  assert.match((await app._prepareContext({})).html,/Pack check: 1 recipe is marked as former starters in this world \(.*Smithing Three: 1 starting, 1 former/);
  assert.doesNotMatch((await app._prepareContext({})).html.match(/Pack check[^<]*/)[0],/PROF-/,'no raw ids');
  // Without the marker anywhere, the line says how to fix it.
  for(const d of added)if(d.flags['ashen-gate-manager'].source.definition.former_starting)delete d.flags['ashen-gate-manager'].source.definition.former_starting;
  app.recipeRefresh=null;await app._click('rr-open','cat');
  assert.match((await app._prepareContext({})).html,/Pack check: no recipe in this world carries the former-starter marker/);
 }finally{
  for(const d of added)world.splice(world.indexOf(d),1);all.splice(all.indexOf(cat),1);values.partyRoster=['dee'];app.recipeRefresh=null;app.actorId='dee';
 }
});
