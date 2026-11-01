import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {checkTemplate,activityOf,activityLabel,skillText,nodeIdFromName,normalizeStore,saveTemplate,duplicateTemplate,removeTemplate,templateReferences,
  templateNode,resolveEntry,templatePlayerView,parseNodeFile,planNodeImport,applyNodeImport,exportNodes,migrateLocationNodes,NODE_SCHEMA} from '../scripts/nodes.mjs';
import {normalizeNode,gatherReward,gatherOutcome,pickTableEntry,nodeBlocker} from '../scripts/gathering.mjs';
import {exoticEligibility,materialMeta,nodeProfessionKeys} from '../scripts/exotic.mjs';
// 0.25.0: gathering node templates owned by the Ledger, draft materials for the GM, Hunting labels, no player settings menu.

const tpl=(extra={})=>({id:'NODE-TEST-REEDS',name:'[TEST] River Reeds',activity:'herbalism',tier:{min:1,max:2},
  materials:{common:[{materialId:'MAT-TG-HERB',quantity:2}],rare:[{materialId:'MAT-TG-RARE'}],exotic:[]},...extra});

test('template checks: permanent NODE id, activity (Skinning & Harvesting is Hunting), tier range, tables that add up to 100',()=>{
  const ok=checkTemplate(tpl());
  assert.deepEqual(ok.errors,[]);
  assert.deepEqual(ok.node.professions,['herbalism'],'the activity’s profession by default');
  assert.deepEqual(ok.node.tier,{min:1,max:2});assert.equal(ok.node.finite,true);assert.equal(ok.node.dcVisible,false);assert.equal(ok.node.dc,null);
  assert.equal(activityOf('Skinning & Harvesting'),'hunting');assert.equal(activityOf('Hunting/Skinning'),'hunting');assert.equal(activityOf('hunting'),'hunting');
  assert.equal(activityLabel('hunting'),'Hunting');
  assert.equal(skillText('Skinning & Harvesting'),'Hunting','node labels say Hunting');assert.equal(skillText('nat'),'Nature');assert.equal(skillText('[TEST] Odd'),'[TEST] Odd');
  const bad=r=>checkTemplate(tpl(r)).errors.join(' | ');
  assert.match(bad({id:'node-1'}),/permanent id of capitals/);
  assert.match(bad({name:''}),/name is required/);
  assert.match(bad({activity:'dancing'}),/activity "dancing" must be one of mining, herbalism, hunting, fishing, archaeology/);
  assert.match(bad({tier:{min:3,max:1}}),/tier min 3 is above max 1/);
  assert.match(bad({professions:['Alchemy']}),/not a gathering profession/);
  assert.match(bad({dc:99}),/dc must be a whole number 1–40/);
  assert.match(bad({check:{skill:'Juggling'}}),/not a dnd5e skill/);
  assert.match(bad({materials:{common:[{materialId:'MAT-A',chance:60},{materialId:'MAT-B',chance:30}]}}),/add up to 90, not 100/);
  assert.match(bad({materials:{common:[{materialId:'MAT-A'},{materialId:'MAT-B',chance:50}]}}),/every entry needs a chance/);
  assert.match(bad({materials:{common:[{materialId:'MAT-A',chance:50},{materialId:'MAT-A',chance:50}]}}),/listed twice/);
  assert.match(bad({materials:{common:[{materialId:'herb'}]}}),/not a valid material id/);
  assert.match(bad({materials:{common:[{materialId:'MAT-A'}],exotic:[{materialId:'MAT-X',mode:'designated'}]}}),/designated Exotic needs a chance/);
  assert.match(bad({materials:{rare:[{materialId:'MAT-A'}]}}),/rare table needs a common table/);
  const multi=checkTemplate(tpl({activity:'Hunting',professions:['Hunting','PROF-TG-HERBALISM'],check:{skill:'Survival',tool:'leatherworker'}}));
  assert.deepEqual(multi.errors,[]);assert.deepEqual(multi.node.professions,['huntingskinning','herbalism']);assert.deepEqual(multi.node.check,{skill:'sur',tool:'leatherworker'});
  assert.match(checkTemplate(tpl({materials:{common:[]}})).warnings[0],/award.*by hand/);
  assert.equal(nodeIdFromName('[TEST] River Reeds'),'NODE-TEST-RIVER-REEDS');
  assert.equal(nodeIdFromName('[TEST] River Reeds',new Set(['NODE-TEST-RIVER-REEDS'])),'NODE-TEST-RIVER-REEDS-2');
});

test('rolling on a template: tier inside its range, weighted tables pick one bundle, several professions for Exotics',()=>{
  const t=checkTemplate(tpl({materials:{common:[{materialId:'MAT-TG-A',quantity:1,chance:70},{materialId:'MAT-TG-B',quantity:3,chance:30}],rare:[{materialId:'MAT-TG-R'}],exotic:[]}})).node;
  const node=normalizeNode(templateNode(t,{tier:2}));
  assert.equal(node.tier,2);assert.equal(node.dc,12,'tier default DC');assert.equal(node.templateId,'NODE-TEST-REEDS');assert.equal(node.materialId,'MAT-TG-A');
  assert.equal(normalizeNode(templateNode(t,{tier:5})).tier,1,'a tier outside the range falls back to the lowest');
  const faces=[];const roll=v=>f=>{faces.push(f);return v;};
  assert.deepEqual(gatherReward(node,gatherOutcome(12,12),{roll:roll(70)}),{materialId:'MAT-TG-A',quantity:1,rare:false,noRareFallback:false,tableRoll:{roll:70,faces:100}});
  assert.equal(gatherReward(node,gatherOutcome(12,12),{roll:roll(71)}).materialId,'MAT-TG-B');
  assert.deepEqual(faces,[100,100],'one d100 per table pick');
  assert.deepEqual(gatherReward(node,gatherOutcome(17,12),{roll:()=>{throw Error('no roll for a one-entry rare table');}}),{materialId:'MAT-TG-R',quantity:1,rare:true,noRareFallback:false});
  assert.throws(()=>pickTableEntry([{materialId:'MAT-A',chance:50},{materialId:'MAT-B',chance:50}],()=>0),/1–100/);
  // A template that lists Hunting and Herbalism: an Exotic of either profession is eligible.
  const both=normalizeNode(templateNode(checkTemplate(tpl({professions:['hunting','herbalism']})).node,{}));
  assert.deepEqual(nodeProfessionKeys(both),['huntingskinning','herbalism']);
  const meta=materialMeta({id:'MAT-TG-HIDE',entity_type:'Material',version:'0.1.0',name:'[TEST] Hide',quality:'Exotic',tierId:'apprentice',source_profession_id:'PROF-TG-HUNTING',refs:[]});
  assert.equal(exoticEligibility({materialId:'MAT-TG-HIDE',mode:'discovery'},both,meta).eligible,true);
});

test('store: save, duplicate, delete; ids are permanent (a deleted id is never reused); imports never overwrite a GM edit',()=>{
  let store=normalizeStore({});
  let r=saveTemplate(store,tpl(),{isNew:true,now:1});assert.equal(r.ok,true);store=r.store;
  assert.equal(store.nodes[0].meta.edited,true);
  assert.match(saveTemplate(store,tpl(),{isNew:true}).errors[0],/already uses that id/);
  const dup=duplicateTemplate(store,'NODE-TEST-REEDS',{now:2});store=dup.store;
  assert.equal(dup.node.id,'NODE-TEST-REEDS-COPY');assert.equal(dup.node.name,'[TEST] River Reeds (copy)');
  assert.equal(duplicateTemplate(store,'NODE-TEST-REEDS').node.id,'NODE-TEST-REEDS-COPY-2');
  store=removeTemplate(store,'NODE-TEST-REEDS-COPY');
  assert.deepEqual(store.retiredIds,['NODE-TEST-REEDS-COPY']);
  assert.match(saveTemplate(store,tpl({id:'NODE-TEST-REEDS-COPY'}),{isNew:true}).errors[0],/deleted node; ids are never reused/);
  // Import: new id added, GM-edited one kept, retired skipped, nothing removed.
  const file={schema:NODE_SCHEMA,nodes:[tpl({name:'[TEST] Changed'}),tpl({id:'NODE-TEST-NEW',name:'[TEST] New'}),tpl({id:'NODE-TEST-REEDS-COPY'})]};
  const plan=planNodeImport(store,file);
  assert.equal(plan.ok,true);
  assert.deepEqual([plan.add.map(n=>n.id),plan.keep.map(n=>n.id),plan.retired.map(n=>n.id),plan.update.length],[['NODE-TEST-NEW'],['NODE-TEST-REEDS'],['NODE-TEST-REEDS-COPY'],0]);
  store=applyNodeImport(store,plan,{now:3});
  assert.equal(store.nodes.find(n=>n.id==='NODE-TEST-REEDS').name,'[TEST] River Reeds','the GM edit stays');
  assert.equal(store.nodes.find(n=>n.id==='NODE-TEST-NEW').meta.origin,'import');
  // Re-import a changed file: an imported, unedited template is updated.
  const again=planNodeImport(store,{schema:NODE_SCHEMA,nodes:[tpl({id:'NODE-TEST-NEW',name:'[TEST] New v2'})]});
  assert.deepEqual(again.update.map(n=>n.id),['NODE-TEST-NEW']);
  store=applyNodeImport(store,again);assert.equal(store.nodes.find(n=>n.id==='NODE-TEST-NEW').name,'[TEST] New v2');
  assert.equal(store.nodes.length,2,'import never removes a template');
  assert.equal(planNodeImport(store,{schema:'x',nodes:[]}).ok,false);
  assert.match(parseNodeFile({schema:NODE_SCHEMA,nodes:[tpl(),tpl()]}).errors.join(' '),/used twice in this file/);
  const exported=exportNodes(store,{now:new Date('2026-10-22T00:00:00Z')});
  assert.equal(exported.schema,NODE_SCHEMA);assert.equal(exported.nodes[0].meta,undefined,'no store metadata in a file');
  assert.deepEqual(parseNodeFile(exported).errors,[],'an export imports cleanly');
});

const locationsFixture=()=>[
  {id:'LOC-TG-FORD',name:'[TEST] Ford',resources:[
    {id:'k1',label:'[TEST] Reed bed',skill:'Herbalism',tier:1,dc:10,dcVisible:true,materialId:'MAT-TG-HERB',quantity:2,rareMaterialId:'MAT-TG-RARE',rareQuantity:1,finite:true,exhausted:true,available:true,visible:true,note:'[TEST] by the water',exotics:[{materialId:'MAT-TG-PHOENIX',mode:'designated',chance:5,condition:'rare'}]},
    {id:'k2',label:'[TEST] Carcass',skill:'Skinning & Harvesting',tier:2,dc:12,materialId:'',finite:true,visible:true},
    {id:'NODE-TEST-KEEP',label:'[TEST] Kept id',skill:'Mining',tier:3,dc:15,materialId:'MAT-TG-ORE',finite:false}]},
  {id:'LOC-TG-HILL',name:'[TEST] Hill',resources:[
    {id:'k1',label:'[TEST] Reed bed',skill:'Herbalism',tier:1,dc:10,dcVisible:true,materialId:'MAT-TG-HERB',quantity:2,rareMaterialId:'MAT-TG-RARE',rareQuantity:1,finite:true,exhausted:false,visible:false,note:'[TEST] by the water',exotics:[{materialId:'MAT-TG-PHOENIX',mode:'designated',chance:5,condition:'rare'}]},
    {id:'k5',label:'[TEST] Odd spot',skill:'[TEST] Whistling',tier:1,materialId:'MAT-TG-HERB'},
    {id:'k6',nodeId:'NODE-TEST-REEDS',tier:2}]}];

test('migration: Location nodes become templates without losing data; re-runnable; Locations untouched; backup kept',()=>{
  const locs=locationsFixture(),before=structuredClone(locs);
  const out=migrateLocationNodes(normalizeStore({}),locs,{now:5,by:'GM',locationsVersion:'1.17.4'});
  assert.deepEqual(locs,before,'Location records are never changed');
  assert.deepEqual(out.created.sort(),['NODE-TEST-CARCASS','NODE-TEST-KEEP','NODE-TEST-ODD-SPOT','NODE-TEST-REED-BED']);
  assert.equal(out.linked,1,'the identical Reed bed at the Hill links to the same template');
  assert.equal(out.skipped,1,'an entry that already refers to a template is not copied');
  const reed=out.store.nodes.find(n=>n.id==='NODE-TEST-REED-BED');
  assert.deepEqual({activity:reed.activity,tier:reed.tier,dc:reed.dc,dcVisible:reed.dcVisible,finite:reed.finite,note:reed.note,materials:reed.materials},
    {activity:'herbalism',tier:{min:1,max:1},dc:10,dcVisible:true,finite:true,note:'[TEST] by the water',
     materials:{common:[{materialId:'MAT-TG-HERB',quantity:2,chance:null}],rare:[{materialId:'MAT-TG-RARE',quantity:1,chance:null}],exotic:[{materialId:'MAT-TG-PHOENIX',mode:'designated',chance:5,condition:'rare'}]}});
  assert.deepEqual(reed.meta.legacy.map(l=>`${l.locationId}|${l.key}`),['LOC-TG-FORD|k1','LOC-TG-HILL|k1']);
  assert.equal(out.store.nodes.find(n=>n.id==='NODE-TEST-CARCASS').activity,'hunting','Skinning & Harvesting becomes Hunting');
  assert.equal(out.store.nodes.find(n=>n.id==='NODE-TEST-KEEP').finite,false,'an existing NODE id is kept');
  const odd=out.store.nodes.find(n=>n.id==='NODE-TEST-ODD-SPOT');
  assert.equal(odd.activity,'');assert.match(odd.note,/Skill in Locations: \[TEST\] Whistling/,'an unknown skill is kept in the note');assert.match(odd.problems[0],/no activity/);
  assert.equal(out.backup.length,5);assert.deepEqual(out.backup[0].entry,before[0].resources[0],'the backup is the original entry, play state included');
  assert.equal(out.store.migrations.length,1);assert.equal(out.store.migrationVersion,1);
  // Re-run: nothing new. After deleting a template, a re-run does not bring it back.
  const again=migrateLocationNodes(out.store,locs,{now:6});
  assert.deepEqual([again.created,again.linked,again.store.migrations.length],[[],0,1]);
  const gone=removeTemplate(out.store,'NODE-TEST-CARCASS');
  assert.deepEqual(migrateLocationNodes(gone,locs).created,[]);
  // A new Location entry is copied by the next run.
  locs[0].resources.push({id:'k9',label:'[TEST] New vein',skill:'Mining',tier:2,materialId:'MAT-TG-ORE'});
  assert.deepEqual(migrateLocationNodes(gone,locs).created,['NODE-TEST-NEW-VEIN']);
  // References: a Location entry pointing at a template, and the entries it was copied from.
  const refs=templateReferences('NODE-TEST-REED-BED',{locations:locs,store:out.store});
  assert.deepEqual(refs.map(r=>[r.locationId,r.key,r.kind]),[['LOC-TG-FORD','k1','copied-from'],['LOC-TG-HILL','k1','copied-from']]);
  assert.deepEqual(templateReferences('NODE-TEST-REEDS',{locations:locs,store:out.store}).map(r=>[r.locationId,r.kind]),[['LOC-TG-HILL','reference']]);
});

test('a Location entry that refers to a template: template check and materials, place play state; a deleted template never breaks it',()=>{
  const t=checkTemplate(tpl({dc:14,dcVisible:true,finite:false})).node;
  const n=normalizeNode(resolveEntry({id:'k6',nodeId:'NODE-TEST-REEDS',tier:2,exhausted:true,visible:true,finite:true},id=>id===t.id?t:null),{locationId:'LOC-TG-HILL'});
  assert.deepEqual([n.label,n.tier,n.dc,n.materialId,n.rareMaterialId,n.quantity,n.finite,n.exhausted,n.templateId],['[TEST] River Reeds',2,14,'MAT-TG-HERB','MAT-TG-RARE',2,true,true,'NODE-TEST-REEDS']);
  const missing=normalizeNode(resolveEntry({id:'k7',nodeId:'NODE-TEST-GONE',label:'[TEST] Place',tier:1},()=>null),{locationId:'LOC-TG-HILL'});
  assert.equal(missing.gatherable,false);assert.equal(missing.label,'[TEST] Place');
  assert.match(nodeBlocker(missing),/The gathering node this place uses no longer exists: pick another node for it in Locations/);
  assert.doesNotMatch(nodeBlocker(missing,{forPlayer:true}),/NODE-/,'players never see ids');
  const pv=templatePlayerView(checkTemplate(tpl({dc:14,materials:{common:[{materialId:'MAT-TG-HERB'}],exotic:[{materialId:'MAT-TG-X'}]}})).node);
  assert.equal(pv.dc,undefined,'no DC unless shown');assert.equal(JSON.stringify(pv).includes('MAT-TG-X'),false,'no Exotic candidates');
});

/* ---- Mocked Foundry: GM-only store, Gathering tab, draft materials, migration on ready ---- */
const hooks={},errors=[],infos=[],chats=[],sent=[];let api,confirmAnswer=true,lastConfirm=null;
const values={partyRoster:['belwar'],libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]},exoticChance:2};
const gm={id:'gm',isGM:true,name:'GM',active:true},alice={id:'u1',isGM:false,name:'Alice',active:true};
const users=[gm,alice];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
class FakeDialog{constructor(o){this.opts=o;}render(){return this;}close(){}static async wait(o){lastConfirm=o;return confirmAnswer;}}
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){this.rendered=true;return this;}},HandlebarsApplicationMixin:c=>c,DialogV2:FakeDialog}},utils:{escapeHTML:esc,randomID:()=>`id${Math.random().toString(36).slice(2,10)}`}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:()=>{}};
globalThis.ui={notifications:{info:m=>infos.push(String(m)),error:e=>errors.push(String(e))}};
globalThis.ChatMessage={create:async x=>{chats.push(structuredClone(x));return x;},getSpeaker:({actor}={})=>({alias:actor?.name})};
const src=(id,type,{visibility='player',status='approved',definition=null}={})=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility,status,version:'0.1.0',refs:[],...(definition?{definition}:{})}}});
const matDef=(id,name,quality='Common',tierId='apprentice')=>({id,entity_type:'Material',version:'0.1.0',refs:[{relation:'gathered_by',target_id:'PROF-TG-HERBALISM',mode:'required'}],name,quality,tierId,source_profession_id:'PROF-TG-HERBALISM'});
const worldDoc=(id,name,flags)=>({id,uuid:`Item.${id}`,name,img:'',type:'loot',flags,system:{description:{value:''}},testUserPermission:u=>u.isGM||flags['ashen-gate-manager'].source.visibility==='player',
  toObject(){return {_id:this.id,name:this.name,img:this.img,type:this.type,flags:structuredClone(this.flags),system:{description:{value:''}}};}});
const world=[
  worldDoc('wherb','[TEST] Herb',src('MAT-TG-HERB','Material',{definition:matDef('MAT-TG-HERB','[TEST] Herb')})),
  worldDoc('wrare','[TEST] Rare Herb',src('MAT-TG-RARE','Material',{definition:matDef('MAT-TG-RARE','[TEST] Rare Herb','Rare')})),
  worldDoc('wford','[TEST] Ford Fish',src('MAT-TG-FISH','Material',{status:'draft',definition:matDef('MAT-TG-FISH','[TEST] Ford Fish')})),
  worldDoc('wexo','[TEST] Draft Pearl',src('MAT-TG-PEARL','Material',{status:'draft',definition:matDef('MAT-TG-PEARL','[TEST] Draft Pearl','Exotic')}))];
const held=(id,name,flags,qty=1,extra={})=>({id,name,type:'loot',system:{quantity:qty,description:{value:''}},flags,...extra});
const inv=[held('bprof','[TEST] Herbalism — Profession',src('PROF-TG-HERBALISM','Profession',{definition:{id:'PROF-TG-HERBALISM',entity_type:'Profession',version:'0.1.0',refs:[],name:'[TEST] Herbalism'}}),1,{type:'feat'})];
inv.get=i=>inv.find(x=>x.id===i);let made=0;
const belwar={id:'belwar',name:'[TEST] Belwar',type:'character',hasPlayerOwner:true,items:inv,flags:{},
  system:{skills:{nat:{total:3},sur:{total:5}},tools:{},abilities:{wis:{mod:2},int:{mod:0}}},testUserPermission:(u,role)=>u.isGM||u.id==='u1'||role==='LIMITED',
  setFlag:async()=>{},updateEmbeddedDocuments:async(t,ups)=>{for(const u of ups)inv.get(u._id).system.quantity=u['system.quantity'];return ups;},
  createEmbeddedDocuments:async(t,docs)=>{const out=docs.map(d=>held(`new${made++}`,d.name,d.flags,d.system?.quantity??1));inv.push(...out);return out;}};
const qty=id=>inv.filter(i=>i.flags?.['ashen-gate-manager']?.source?.sourceId===id||i.flags?.['ashen-gate-profession-ledger']?.sourceId===id).reduce((n,i)=>n+i.system.quantity,0);
// Locations stand-in (1.17.x GM shape): the Ford's nodes are inline; the Hill has one entry that refers to a template.
const locs=[{id:'LOC-TG-FORD',name:'[TEST] Ford Shallows',revealed:true,resources:[
  {id:'f1',label:'[TEST] Shallows',skill:'Fishing',tier:1,dc:10,dcVisible:true,materialId:'MAT-TG-FISH',quantity:1,finite:false,visible:true,available:true},
  {id:'f2',label:'[TEST] Bank game',skill:'Skinning & Harvesting',tier:1,dc:10,dcVisible:true,materialId:'MAT-TG-HERB',finite:false,visible:true,available:true}]},
  {id:'LOC-TG-HILL',name:'[TEST] Hill',revealed:true,resources:[{id:'h1',nodeId:'NODE-TEST-BANK-GAME',tier:1,visible:true,available:true}]}];
const locApi={listLocations:()=>structuredClone(locs),resourcesAt:id=>structuredClone(locs.find(l=>l.id===id)?.resources??[]),markNodeExhausted:async()=>{}};
// Journal stand-in: a GM-only JournalEntry carrying the node store flag.
const journals=[];
const setPath=(o,k,v)=>{const parts=k.split('.');while(parts.length>1){const p=parts.shift();o[p]??={};o=o[p];}o[parts[0]]=v;};
const makeJournal=data=>{const j={...structuredClone(data),getFlag:(scope,key)=>j.flags?.[scope]?.[key],update:async u=>{for(const [k,v] of Object.entries(u))setPath(j,k,structuredClone(v));}};return j;};
globalThis.JournalEntry={create:async data=>{if(!game.user.isGM)throw Error('players cannot create');const j=makeJournal(data);journals.push(j);return j;}};
const ledgerModule={active:true,version:'0.45.0',set api(v){api=v},get api(){return api}};
const modules={'ashen-gate-profession-ledger':ledgerModule,'ashen-gate-locations':{active:true,version:'1.17.4',api:locApi}};
globalThis.game={user:gm,users:{contents:users,get:id=>users.find(u=>u.id===id),get activeGM(){return gm;}},items:{contents:world,get:id=>world.find(x=>x.id===id)},
  actors:{contents:[belwar],get:id=>id==='belwar'?belwar:null},journal:journals,socket:{emit:(n,m)=>sent.push(m),on:()=>{}},
  modules:{get:id=>modules[id]},settings:{register:()=>{},registerMenu:()=>{},get:(id,k)=>values[k],set:async(id,k,v)=>{values[k]=v;}}};
const entry=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js');
const {_test}=await import(pathToFileURL(entry));hooks.init();hooks.ready();
await new Promise(r=>setTimeout(r,5));await _test.nodeWrites();
const app=api.open({view:'gathering'});
const html=async view=>{app.view=view;return (await app._prepareContext({})).html;};

test('ready: the active GM copies Location nodes into templates once, into a GM-only Journal; Locations untouched; a backup note',async()=>{
  assert.equal(journals.length,1);
  const j=journals[0];
  assert.equal(j.name,'Profession Ledger (GM Data)');assert.equal(j.ownership.default,0,'players have no permission on it');
  const store=_test.readNodeStore();
  assert.deepEqual(store.nodes.map(n=>n.id),['NODE-TEST-BANK-GAME','NODE-TEST-SHALLOWS']);
  assert.equal(store.nodes.find(n=>n.id==='NODE-TEST-BANK-GAME').activity,'hunting');
  assert.equal(locs[0].resources[0].materialId,'MAT-TG-FISH','Locations data is not rewritten');
  assert.equal(store.migrations[0].backup.length,2);assert.equal(store.migrations[0].locationsVersion,'1.17.4');
  const note=chats.find(c=>/copied 2 Location gathering nodes/.test(c.content));
  assert.ok(note);assert.deepEqual(note.whisper,['gm']);assert.match(note.content,/backed up in the Journal “Profession Ledger \(GM Data\)”/);
  // Running again (button or a later ready) adds nothing.
  await _test.autoMigrateNodes();assert.equal(_test.readNodeStore().migrations.length,1);
  assert.deepEqual(await _test.copyLocationNodes(),{created:[],linked:0,skipped:3});
});

test('GM-only in the data layer: players cannot read, write, import or roll templates; no Nodes tab for them',async()=>{
  game.user=alice;
  const t=api.gathering.templates;
  for(const call of [()=>t.list(),()=>t.get('NODE-TEST-SHALLOWS'),()=>t.export(),()=>t.preview({}),()=>t.references('NODE-TEST-SHALLOWS'),()=>t.check({})])assert.throws(call,/Only the GM/);
  for(const call of [()=>t.create(tpl()),()=>t.remove('NODE-TEST-SHALLOWS'),()=>t.import({}),()=>t.copyFromLocations(),()=>api.gathering.start({templateId:'NODE-TEST-SHALLOWS',leadId:'belwar'})])await assert.rejects(async()=>call(),/Only the GM/);
  assert.throws(()=>_test.readNodeStore(),/Only the GM/);
  const h=await html('gathering');
  assert.doesNotMatch(h,/data-id="nodes"/,'no Gathering Nodes tab');for(const leak of [/NODE-/,/Draft/i,/Ford Fish/,/use anyway/i,/Gathering Nodes/])assert.doesNotMatch(h,leak,'no template, draft material or GM tool leaks');
  await app._click('tab','nodes');assert.notEqual(app.view,'nodes');
  game.user=gm;
});

test('Robb A: a draft material is listed for the GM (marked), refused with a named reason, and awarded with “use anyway”',async()=>{
  game.user=gm;
  // Location node at Ford Shallows with a draft material: the reason says draft, not "not in the world".
  app.gather.source='location';app.gather.nodeRef='LOC-TG-FORD|f1';app.gather.allowDraft=false;
  let h=await html('gathering');
  assert.match(h,/Material “Tg Fish” is draft\/unreleased \(status: draft\): approve it in General Manager, or tick “Use draft materials anyway”/);
  assert.match(h,/data-action="gather-start" disabled/);
  const node=_test.gatherLocations().locations.find(l=>l.id==='LOC-TG-FORD').nodes.find(n=>n.id==='f1');
  await assert.rejects(()=>_test.startRound({node,leadId:'belwar'}),/is draft\/unreleased/);
  // Ad-hoc gather: its pool is the imported materials of the chosen professions and tiers; a draft one is in it only when the GM allows drafts.
  app.gather.source='adhoc';Object.assign(app.gather,{professions:['herbalism'],tiers:[1],dc:'',label:''});
  h=await html('gathering');
  assert.match(h,/Use draft materials anyway/);assert.doesNotMatch(h,/data-gather-adhoc|Common material/);
  _test.setExoticRoll(()=>1);values.exoticChance=100;
  let plain=await _test.startRound({node:app._selectedNode(),professions:['herbalism'],tiers:[1]});
  _test.recordRoll(plain.id,{actorId:'belwar',total:12});
  assert.deepEqual(_test.revealRound(plain.id).rows[0].drops.map(d=>d.materialId),['MAT-TG-HERB'],'no draft material and no draft Exotic without “use anyway”');
  _test.cancelRound(plain.id);
  // Use anyway: the draft common material and the draft Exotic are given.
  const round=await _test.startRound({node:app._selectedNode(),professions:['herbalism'],tiers:[1],allowDraft:true});
  _test.recordRoll(round.id,{actorId:'belwar',total:12});
  const out=_test.revealRound(round.id);
  assert.deepEqual(out.rows[0].drops.map(a=>a.materialId),['MAT-TG-FISH','MAT-TG-PEARL']);
  const playerView=_test.roundView(_test.openRound(),{players:true});
  assert.ok(playerView.rows[0].drops.every(d=>d.hidden),'players are not shown unreleased materials before the GM gives them');
  assert.doesNotMatch(JSON.stringify(playerView),/Ford Fish|Draft Pearl/,'…nor their names in the reel');
  assert.ok(_test.roundView(_test.openRound(),{players:false}).rows[0].drops.every(d=>!d.hidden),'the GM sees them');
  await _test.giveRound(round.id);
  assert.equal(qty('MAT-TG-FISH'),1);assert.equal(qty('MAT-TG-PEARL'),1);
  values.exoticChance=2;
  // A material that is not imported at all still says so, and "use anyway" does not cover it.
  await assert.rejects(()=>api.gathering.start({node:{label:'x',skill:'Herbalism',tier:1,materialId:'MAT-TG-GONE'},leadId:'belwar',allowDraft:true}),/“Tg Gone” is not imported in this world/);
  assert.equal(_test.materialState('MAT-TG-GONE').state,'missing');assert.equal(_test.materialState('MAT-TG-FISH').state,'draft');
});

test('player request on a draft-material node waits for the GM, who approves it with the draft material',async()=>{
  game.user=gm;_test.resetGatherRequests();
  const out=await _test.handleGatherRequest({type:'gather-request',requestId:'rq1',requesterId:'u1',actorId:'belwar',locationId:'LOC-TG-FORD',nodeId:'f1'},'u1');
  assert.equal(out.status,'queued');assert.doesNotMatch(out.message,/MAT-|draft/i,'the player is not told about drafts');
  app.gather.source='location';let h=await html('gathering');
  assert.match(h,/is draft\/unreleased.*Approve gives it anyway/s);assert.match(h,/data-draft="1"[^>]*>.*Approve \(use draft material\)/s);
  assert.equal(api.gathering.requests()[0].draftMaterial,true);
  await assert.rejects(()=>_test.approveGatherRequest('rq1'),/draft\/unreleased/,'a plain approve still names the draft');
  // The spot is Fishing: only a character who holds Fishing is asked to roll.
  await assert.rejects(()=>_test.approveGatherRequest('rq1',{allowDraft:true}),/No party character holds any of the chosen professions \(Fishing\)/);
  inv.push(held('bfish','[TEST] Fishing — Profession',src('PROF-TG-FISHING','Profession',{definition:{id:'PROF-TG-FISHING',entity_type:'Profession',version:'0.1.0',refs:[],name:'[TEST] Fishing'}}),1,{type:'feat'}));
  const s=await _test.approveGatherRequest('rq1',{allowDraft:true});
  assert.equal(s.allowDraft,true);_test.cancelRound(s.id);
  inv.splice(inv.findIndex(i=>i.id==='bfish'),1);
});

test('Robb B: Skinning & Harvesting nodes read Hunting for the GM and players',async()=>{
  game.user=gm;app.gather.source='location';app.gather.nodeRef='';
  let h=await html('gathering');
  assert.match(h,/Tier 1 · Hunting · \[TEST\] Bank game/,'0.37.0: tier, profession, name');assert.doesNotMatch(h,/Skinning &amp; Harvesting|Skinning & Harvesting/);
  game.user=alice;h=await html('gathering');
  assert.match(h,/\[TEST\] Bank game<\/strong> <small>Hunting · Tier 1/);assert.doesNotMatch(h,/Skinning/);
  game.user=gm;
});

test('Robb C: Gathering Nodes tab: create, edit, duplicate, delete (warns about Locations), import and export',async()=>{
  game.user=gm;app.element={querySelector:()=>null,querySelectorAll:()=>[]};
  let h=await html('nodes');
  assert.match(h,/data-id="gathering" class="active" aria-selected="true"/,'0.31.1: Gathering stays the selected top tab on the nodes');
  assert.match(h,/id="agl-gather-tab-nodes" data-tab="nodes"[^>]*aria-selected="true"[^>]*>Gathering nodes</,'…with Gathering nodes the selected sub-tab');
  assert.doesNotMatch(h,/data-id="nodes"/,'…and no seventh top-level tab');
  assert.match(h,/Copied 2 Location gathering nodes|2 Location gathering nodes copied into templates/);
  assert.match(h,/backed up in the Journal “Profession Ledger \(GM Data\)”/);
  assert.match(h,/<summary>.*<strong>Tier \d · [A-Za-z]+<\/strong>/s,'0.37.0: grouped by tier, lowest first');
  assert.match(h,/class="ag-toolbar__end">.*data-action="node-new"/s,'create action on the right');
  const setup=await html('gm');assert.doesNotMatch(setup.slice(setup.indexOf('<main')),/Gathering Nodes|node-new|NODE-/,'GM Setup stays settings-only');
  // New node through the editor.
  await app._click('node-new');
  Object.assign(app.nodeDraft.data,{name:'[TEST] Pebble run',activity:'mining',tierMin:'2',tierMax:'3',checkTool:'mason',
    common:[{materialId:'MAT-TG-HERB',quantity:'2',chance:'60'},{materialId:'MAT-TG-FISH',quantity:'1',chance:'30'}]});
  await app._click('node-save');
  assert.match(errors.at(-1),/Node not saved: .*add up to 90, not 100/);assert.ok(app.nodeDraft,'the editor stays open with the reason');
  h=await html('nodes');assert.match(h,/role="alert">.*add up to 90, not 100/s);
  // 0.33.0 A new node has no id box to fill: the id is made from the name; "Advanced: set id" is optional.
  assert.match(h,/Advanced: set id \(optional\)<input data-node-field="id"/);assert.doesNotMatch(h,/Id \(permanent\)/);assert.doesNotMatch(h,/<label class="ag-field">Permanent id/);
  // 0.26.0 (PL-03): the editor replaces the list (with a way back); Cancel and Save Changes sit in the window footer.
  assert.match(h,/<footer class="ag-footer"><button[^>]*data-action="node-cancel">Cancel<\/button><span class="ag-footer__status" role="status" data-agl-node-status>[^<]*<\/span><button[^>]*ag-btn--primary" data-action="node-save"/,'Cancel left, Save Changes right, in the footer');
  assert.match(h,/data-action="node-cancel"><i class="fa-solid fa-arrow-left" aria-hidden="true"><\/i> All nodes<\/button>/,'back to the list');
  assert.doesNotMatch(h,/data-action="node-edit"/,'the list is not rendered under or over the editor');
  for(const title of ['Basics','Check','Materials'])assert.match(h,new RegExp(`<details class="ag-fold" data-ag-fold-key="node-[a-z]+" open><summary class="ag-fold__summary"><span class="ag-fold__title">${title}<`));
  assert.match(h,/<details class="ag-fold" data-ag-fold-key="node-test"><summary/,'Node test starts closed');
  assert.match(h,/Node test<\/span>.*\[TEST\] Ford Fish.*Draft/s,'the node test names the draft material');
  app.nodeDraft.data.common[1].chance='40';
  await app._click('node-save');
  let t=api.gathering.templates.get('NODE-TEST-PEBBLE-RUN');
  // Renaming a saved node never changes its id; the editor shows it read-only, with no Advanced box.
  await app._click('node-edit','NODE-TEST-PEBBLE-RUN');
  h=await html('nodes');assert.match(h,/<label class="ag-field">Permanent id<input value="NODE-TEST-PEBBLE-RUN" readonly/);assert.doesNotMatch(h,/Advanced: set id/);
  app.nodeDraft.data.name='[TEST] Pebble run renamed';await app._click('node-save');
  assert.equal(api.gathering.templates.get('NODE-TEST-PEBBLE-RUN').name,'[TEST] Pebble run renamed');assert.ok(!api.gathering.templates.get('NODE-TEST-PEBBLE-RUN-RENAMED'));
  await app._click('node-edit','NODE-TEST-PEBBLE-RUN');app.nodeDraft.data.name='[TEST] Pebble run';await app._click('node-save');
  app.nodeDraft=null;
  assert.deepEqual([t.activity,t.tier,t.check,t.materials.common.length,t.meta.edited],['mining',{min:2,max:3},{tool:'mason'},2,true]);
  // Roll on the template from anywhere: tier picked in its range, table pick, check tool from the template.
  app.gather.source='template';app.gather.templateId='NODE-TEST-PEBBLE-RUN';app.gather.templateTier='3';app.gather.allowDraft=true;app.view='gathering';
  h=await html('gathering');assert.match(h,/<option value="3" selected>3 · Expert<\/option>/);assert.match(h,/aria-checked="true" data-action="gather-source" data-id="template"/);
  _test.setExoticRoll(()=>61);
  const s=await _test.startRound({node:app._selectedNode(),professions:['herbalism'],allowDraft:true});
  assert.equal(s.node.tier,3);assert.equal(s.rollers[0].plan.toolKey,'mason');assert.equal(s.node.finite,false,'a template roll never exhausts anything');
  _test.recordRoll(s.id,{actorId:'belwar',total:16});
  const out=_test.revealRound(s.id);
  assert.equal(out.rows[0].drops[0].materialId,'MAT-TG-FISH','one d100 picks from the weighted table: 61 is in the 40% band');
  await _test.giveRound(s.id);
  // Duplicate, then delete the copy.
  await app._click('node-duplicate','NODE-TEST-PEBBLE-RUN');
  assert.equal(app.nodeDraft.data.id,'NODE-TEST-PEBBLE-RUN-COPY');app.nodeDraft=null;
  confirmAnswer=false;await app._click('node-delete','NODE-TEST-PEBBLE-RUN-COPY');
  assert.ok(api.gathering.templates.get('NODE-TEST-PEBBLE-RUN-COPY'),'Cancel keeps it');
  confirmAnswer=true;await app._click('node-delete','NODE-TEST-PEBBLE-RUN-COPY');
  assert.equal(api.gathering.templates.get('NODE-TEST-PEBBLE-RUN-COPY'),null);
  assert.ok(lastConfirm.classes.includes('ag-dialog--danger'),'a labelled destructive confirmation');
  // Deleting a template a Location points to: warned, then the Location entry still renders with a reason.
  assert.deepEqual(api.gathering.templates.references('NODE-TEST-BANK-GAME').map(r=>[r.locationId,r.kind]),[['LOC-TG-HILL','reference'],['LOC-TG-FORD','copied-from']]);
  await app._click('node-delete','NODE-TEST-BANK-GAME');
  assert.match(lastConfirm.content,/1 Location entry points to this node: \[TEST\] Hill\. They are not changed or removed/);
  assert.match(lastConfirm.content,/copied from 1 Location entry \(\[TEST\] Ford Shallows\)/);
  const hill=_test.gatherLocations().locations.find(l=>l.id==='LOC-TG-HILL');
  assert.equal(hill.nodes.length,1);assert.match(hill.nodes[0].blocked,/The gathering node this place uses no longer exists/);
  assert.equal(locs[1].resources[0].nodeId,'NODE-TEST-BANK-GAME','the Location record is untouched');
  await assert.rejects(()=>api.gathering.templates.create(tpl({id:'NODE-TEST-BANK-GAME',name:'[TEST] Reuse'})),/never reused/);
  // Import preview then apply; export.
  const file={schema:NODE_SCHEMA,nodes:[tpl(),tpl({id:'NODE-TEST-PEBBLE-RUN',name:'[TEST] Overwrite?'})]};
  app.nodeImport={fileName:'x.gathering-nodes.json',data:file,plan:api.gathering.templates.preview(file)};
  h=await html('nodes');assert.match(h,/New: 1.*\[TEST\] River Reeds/s);assert.match(h,/Kept \(edited here; your edit stays\): 1/);
  await app._click('node-import-apply');
  assert.ok(api.gathering.templates.get('NODE-TEST-REEDS'));assert.equal(api.gathering.templates.get('NODE-TEST-PEBBLE-RUN').name,'[TEST] Pebble run');
  const exported=api.gathering.templates.export();assert.equal(exported.schema,NODE_SCHEMA);assert.ok(exported.nodes.some(n=>n.id==='NODE-TEST-REEDS'));
  // A Location entry that points to an existing template gathers with the template's materials.
  locs[1].resources.push({id:'h2',nodeId:'NODE-TEST-REEDS',tier:2,visible:true,available:true});
  const ref=_test.gatherLocations().locations.find(l=>l.id==='LOC-TG-HILL').nodes.find(n=>n.id==='h2');
  assert.deepEqual([ref.materialId,ref.tier,ref.dc,ref.templateId,ref.blocked],['MAT-TG-HERB',2,12,'NODE-TEST-REEDS','']);
  locs[1].resources.pop();
});
