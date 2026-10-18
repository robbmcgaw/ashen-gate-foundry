import test from 'node:test';
import assert from 'node:assert/strict';

const callbacks={};globalThis.Hooks={once(name,fn){callbacks[name]=fn;},on(name,fn){callbacks[name]=fn;}};
const moduleObj={};
const world=[];
const folderRecords=[];
let folderSequence=0;
globalThis.Folder=class {static async create(data){const folder={id:`F${++folderSequence}`,name:data.name,type:data.type,folder:data.folder};folderRecords.push(folder);return folder;}};
const get=id=>world.find(x=>x.id===id)??null;
let sequence=0;
class FakeApp {
  constructor(options={}){this.options=options;this.rendered=false;}
  async render(){this.rendered=true;return this;}
  static *instances(){}
}
globalThis.foundry={applications:{api:{ApplicationV2:FakeApp,DialogV2:{
  confirm:async()=>true,input:async options=>options?.window?.title==='Register a Map'?{id:'MAP-TEST-FRONTIER',name:'Test Frontier'}:{id:'LOC-TEST-SITE'},wait:async()=> 'keep_world'
}}}};
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{NONE:0},JOURNAL_ENTRY_PAGE_FORMATS:{HTML:1}};
const tileNames=['fosstryn_approaches','western_grasslands','forest_verge','deepwood_fringe','eastern_foothills','riverlands','outer_grass_sea'];
const tiles=tileNames.map((name,i)=>({id:`T${i+1}`,texture:{src:`worlds/test/overlays/${name}.png`},hidden:false}));
tiles.push({id:'BACKGROUND',texture:{src:'worlds/test/Fosstryn_Frontier_Clean_v1.png'},hidden:false});
const mockScene={id:'SC1',name:'Fosstryn Frontier',tiles:{contents:tiles},view:async()=>true,updateEmbeddedDocuments:async(type,updates)=>{
 assert.equal(type,'Tile');for(const data of updates){const tile=tiles.find(x=>x.id===data._id);if(!tile)throw new Error('unknown Tile');tile.hidden=data.hidden;}
 return updates;
}};
globalThis.game={user:{isGM:true},journal:{filter:fn=>world.filter(fn),get},folders:{contents:folderRecords},scenes:{contents:[mockScene],get:id=>id==='SC1'?mockScene:null},settings:{registerMenu:()=>{}},modules:{get:()=>moduleObj}};
globalThis.ui={notifications:{info:()=>{},warn:()=>{},error:()=>{}}};
class FakePage {
  constructor(data){this.id=`P${++sequence}`;this.name=data.name;this.type=data.type;this.text=data.text;this.flags=data.flags??{};}
  getFlag(mod,key){return this.flags?.[mod]?.[key]}
}
class FakeJournal {
  constructor(data){this.id=`J${++sequence}`;this.name=data.name;this.flags=data.flags??{};this.ownership=data.ownership;this.folder=data.folder??null;this.pages=[];this.sheet={render:()=>{}};}
  getFlag(mod,key){return this.flags?.[mod]?.[key]}
  async update(data){for(const [key,v] of Object.entries(data)){
    if(key.startsWith('flags.')){let [,mod,...rest]=key.split('.');this.flags[mod]??={};let node=this.flags[mod];for(let i=0;i<rest.length-1;i++){node[rest[i]]??={};node=node[rest[i]];}node[rest.at(-1)]=v;}
    else this[key]=v;
  }return this;}
  async createEmbeddedDocuments(type,pages){const created=pages.map(x=>new FakePage(x));this.pages.push(...created);return created;}
  async updateEmbeddedDocuments(type,records){for(const data of records){const p=this.pages.find(x=>x.id===data._id);Object.assign(p,data);}return records;}
  static async create(data){const j=new FakeJournal(data);world.push(j);return j;}
}
globalThis.JournalEntry=FakeJournal;
await import('../scripts/main.js');callbacks.init();callbacks.ready();

test('api is independent and exposes library + editor without Manager',()=>{
  assert.equal(typeof moduleObj.api.openEditor,'function');
  assert.equal(typeof moduleObj.api.openLibrary,'function');
  const access=moduleObj.api.playerAccess;
  assert.equal(access.contract,'ag-player-access/1');
  assert.deepEqual(access.getState(),{contract:'ag-player-access/1',moduleId:'ashen-gate-locations',audience:'gm-only',playerAccessEnabled:false,configurable:false});
  assert.equal(access.setEnabled,undefined,'no toggle is exposed that could reveal the GM editor');
});
test('world save / preview / publish creates separate protected projection and preserves custom pages',async()=>{
  const editor=await moduleObj.api.openEditor('LOC-TEST-SITE');
  editor.draft.name='Mock Ruin';editor.draft.description.player='Visible description';editor.draft.description.gm='TOP SECRET PASSWORD';
  editor.draft.points_of_interest=[{key:'poi-1',title:'Hidden Door',description:'Find the door',reference:''}];
  await editor.action('save');assert.equal(world.length,1);
  const source=world[0];assert.equal(source.ownership.default,0);
  assert.ok(folderRecords.find(f=>f.id===source.folder&&f.name==='Source Records'),'source Journal is filed on first creation');
  assert.equal(source.getFlag('ashen-gate-locations','revision'),1);
  assert.equal(source.getFlag('ashen-gate-locations','record').description.gm,'TOP SECRET PASSWORD');
  await editor.action('preview');await editor.action('publish');assert.equal(world.length,2);
  const projected=world[1];assert.equal(projected.ownership.default,0);
  assert.ok(folderRecords.find(f=>f.id===projected.folder&&f.name==='Published Journals'),'published Journal is filed');
  assert.ok(projected.pages[0].text.content.includes('Visible description'));
  assert.ok(!projected.pages[0].text.content.includes('TOP SECRET PASSWORD'));
  assert.ok(!projected.pages[0].text.content.includes('Hidden Door'));
  const custom=new FakePage({name:'My Encounter Notes',type:'text',text:{content:'KEEP ME'},flags:{}});projected.pages.push(custom);
  editor.draft.description.player='Edited visible description';
  await editor.action('save');assert.equal(source.getFlag('ashen-gate-locations','revision'),2);
  assert.equal(projected.pages[0].text.content.includes('Edited visible description'),false);
  await editor.action('preview');await editor.action('publish');
  assert.ok(projected.pages[0].text.content.includes('Edited visible description'));
  assert.equal(projected.pages[1],custom);assert.equal(projected.pages[1].text.content,'KEEP ME');
  editor.reveal.revealed_pois=['poi-1'];await editor.action('save');await editor.action('preview');await editor.action('publish');
  assert.ok(projected.pages[0].text.content.includes('Hidden Door'));
  assert.ok(!projected.pages[0].text.content.includes('TOP SECRET PASSWORD'));
  assert.equal(projected.pages.length,2);
});

test('registered Map saves as protected world Journal; seven PNGs hide/show without touching background',async()=>{
 const region=await moduleObj.api.openEditor('LOC-TEST-FRONTIER');region.draft.name='Fosstryn Frontier';region.draft.kind='region';await region.action('save');
 const manager=await moduleObj.api.openMaps();
 await manager.action('new-map');
 manager.draft.scene_id='SC1';manager.draft.region_id='LOC-TEST-FRONTIER';
 await manager.action('frontier-preset');
 assert.equal(manager.draft.overlays.length,7);
 await manager.action('save-map');
 const registry=world.find(j=>j.getFlag('ashen-gate-locations','role')==='map_registry');
 assert.ok(registry,'A world Journal owns the map registry');
 assert.ok(folderRecords.find(f=>f.id===registry.folder&&f.name==='Map Registry'),'registry Journal is filed');
 assert.equal(registry.ownership.default,0,'players cannot read the GM registry Journal');
 assert.equal(registry.getFlag('ashen-gate-locations','map_registry').revision,1);
 assert.equal(registry.getFlag('ashen-gate-locations','map_registry').maps.length,1);
 await manager.action('hide-all');
 assert.equal(tiles.filter(t=>t.id!=='BACKGROUND' && t.hidden).length,7);
 assert.equal(tiles.find(t=>t.id==='BACKGROUND').hidden,false);
 await manager.action('show-all');
 assert.equal(tiles.filter(t=>t.hidden).length,0);
 await manager.action('toggle-overlay',{dataset:{key:'forest_verge'}});
 assert.equal(tiles.find(t=>t.id==='T3').hidden,true);
 assert.equal(tiles.find(t=>t.id==='T2').hidden,false);
 const before=tiles.map(t=>t.hidden);
 manager.draft.name='Unsaved name';
 await assert.rejects(()=>manager.action('hide-all'),/Save Map configuration/);
 assert.deepEqual(tiles.map(t=>t.hidden),before);
});
test('new Map UI is permission-protected independently of launcher visibility',async()=>{
 game.user.isGM=false;
 assert.throws(()=>moduleObj.api.openMaps(),/Only the GM/);
 game.user.isGM=true;
 const manager=await moduleObj.api.openMaps();
 game.user.isGM=false;
 await assert.rejects(()=>manager.action('hide-all'),/Only the GM/);
 game.user.isGM=true;
});
test('saving a Region cannot introduce a circular parent relation',async()=>{
 const child=await moduleObj.api.openEditor('LOC-TEST-CHILD');
 child.draft.name='Subregion';child.draft.kind='region';
 child.draft.refs=[{relation:'belongs_to_region',target_id:'LOC-TEST-FRONTIER',mode:'optional'}];
 await child.action('save');
 const parent=await moduleObj.api.openEditor('LOC-TEST-FRONTIER');
 parent.draft.refs=[{relation:'belongs_to_region',target_id:'LOC-TEST-CHILD',mode:'optional'}];
 await assert.rejects(()=>parent.action('save'),/Circular Region hierarchy/);
});


test('GM-only contract, rendering and action entrypoints reject non-GM even with retained window',async()=>{
  const lib=await moduleObj.api.openLibrary();
  const editor=await moduleObj.api.openEditor('LOC-TEST-SITE');
  game.user.isGM=false;
  assert.throws(()=>moduleObj.api.open(),/Only the GM/);
  assert.throws(()=>moduleObj.api.openLibrary(),/Only the GM/);
  assert.throws(()=>moduleObj.api.openEditor('LOC-TEST-SITE'),/Only the GM/);
  assert.throws(()=>moduleObj.api.openMaps(),/Only the GM/);
  await assert.rejects(()=>lib._renderHTML(),/Only the GM/);
  await assert.rejects(()=>editor._renderHTML(),/Only the GM/);
  await assert.rejects(()=>lib.action('clear-filters'),/Only the GM/);
  await assert.rejects(()=>editor.action('preview'),/Only the GM/);
  assert.equal(moduleObj.api.playerAccess.getState().configurable,false);
  game.user.isGM=true;
});

test('Clear Filters resets query, Region, level and gathering tier without touching persisted records',async()=>{
 const lib=await moduleObj.api.openLibrary();
 lib.query='Ruin';lib.regionFilter='LOC-TEST-FRONTIER';lib.tierFilter='expert';lib.levelFilter='12';
 await lib.action('clear-filters');
 assert.equal(lib.query,'');assert.equal(lib.regionFilter,'');assert.equal(lib.tierFilter,'');assert.equal(lib.levelFilter,'');
});

test('new Journals reuse typed nested folders without duplicate creation',async()=>{
 const before=folderRecords.length;
 const one=await moduleObj.api.openEditor('LOC-TEST-SECOND');
 one.draft.name='Second Site';await one.action('save');
 assert.equal(folderRecords.length,before,'reused all folder levels');
 const first=world.find(j=>j.getFlag('ashen-gate-locations','record')?.id==='LOC-TEST-SITE');
 const second=world.find(j=>j.getFlag('ashen-gate-locations','record')?.id==='LOC-TEST-SECOND');
 assert.equal(first.folder,second.folder);
});

test('domain-scoped Location read API is GM-only and returns copies, not mutable state handles',async()=>{
  const r=await moduleObj.api.openEditor('LOC-TEST-OBJECTIVE-REFS');
  r.draft.name='Objective Link Test';
  r.draft.refs=[
    {relation:'associated_objective',target_id:'QUEST-ALPHA',mode:'required'},
    {relation:'offers_objective',target_id:'ORDER-BETA',mode:'optional'}
  ];
  await r.action('save');
  const original=moduleObj.api.getLocationSource('LOC-TEST-OBJECTIVE-REFS');
  assert.equal(original.record.refs[0].mode,'required');
  assert.deepEqual(moduleObj.api.getLocationObjectiveRefs('LOC-TEST-OBJECTIVE-REFS').map(x=>x.target_id),['QUEST-ALPHA','ORDER-BETA']);
  const refs=moduleObj.api.getLocationObjectiveRefs('LOC-TEST-OBJECTIVE-REFS');
  refs[0].target_id='QUEST-MUTATED';
  assert.equal(moduleObj.api.getLocationObjectiveRefs('LOC-TEST-OBJECTIVE-REFS')[0].target_id,'QUEST-ALPHA');
  original.record.name='MUTATED';
  assert.equal(moduleObj.api.getLocationSource('LOC-TEST-OBJECTIVE-REFS').record.name,'Objective Link Test');
  game.user.isGM=false;
  assert.throws(()=>moduleObj.api.getLocationSource('LOC-TEST-OBJECTIVE-REFS'),/Only the GM/);
  assert.throws(()=>moduleObj.api.getLocationObjectiveRefs('LOC-TEST-OBJECTIVE-REFS'),/Only the GM/);
  game.user.isGM=true;
});

test('Location editor preserves required Objective ref mode across text-field edits and save',async()=>{
  const editor=await moduleObj.api.openEditor('LOC-TEST-REF-MODES');
  editor.draft.name='Reference Mode Editing';
  editor.draft.refs=[
    {relation:'associated_objective',target_id:'QUEST-KEPT',mode:'required'},
    {relation:'offers_objective',target_id:'ORDER-OPTIONAL',mode:'optional'}
  ];
  editor.consume({dataset:{refs:'associated_objective'},value:'QUEST-KEPT, CONTRACT-NEW'});
  editor.consume({dataset:{refMode:'offers_objective',refId:'ORDER-OPTIONAL'},value:'required'});
  assert.equal(editor.draft.refs.find(x=>x.target_id==='QUEST-KEPT').mode,'required');
  assert.equal(editor.draft.refs.find(x=>x.target_id==='CONTRACT-NEW').mode,'optional');
  assert.equal(editor.draft.refs.find(x=>x.target_id==='ORDER-OPTIONAL').mode,'required');
  await editor.action('save');
  const after=moduleObj.api.getLocationObjectiveRefs('LOC-TEST-REF-MODES');
  assert.equal(after.find(x=>x.target_id==='QUEST-KEPT').mode,'required');
  assert.equal(after.find(x=>x.target_id==='ORDER-OPTIONAL').mode,'required');
  assert.equal(moduleObj.api.getLocationSource('LOC-TEST-REF-MODES').revision,1);
});

test('Locations resolver provider is GM-restricted and exposes no campaign state',async()=>{
 const api=moduleObj.api;
 assert.equal(api.locationResolver.contract,'ag-locations-provider/0.1-alpha');
 const entry=api.locationResolver.readEntries().find(x=>x.record.id==='LOC-TEST-SITE');
 assert.ok(entry,'Saved Location has a domain binding');
 assert.deepEqual(entry.binding,{kind:'domain',providerId:'ashen-gate-locations',recordKey:'LOC-TEST-SITE'});
 assert.equal(entry.record.resources instanceof Array,true);
 assert.equal(entry.record.state,undefined);
 assert.equal(entry.canRead({isGM:true}),true);
 assert.equal(entry.canRead({isGM:false}),false);
 assert.ok(api.getLocationSource('LOC-TEST-SITE').revision>=1,'owner API retains explicit world revision');
 game.user.isGM=false;
 assert.deepEqual(api.locationResolver.readEntries(),[]);
 assert.equal(entry.canRead({isGM:true}),false);
 assert.throws(()=>api.locationResolver.registerWith({}),/Only the GM/);
 await assert.rejects(()=>api.checkObjectiveLinks(),/Only the GM/);
 game.user.isGM=true;
});

test('Registered resolver refreshes when a Location save changes source; lease can be removed',async()=>{
 let refreshes=0,unregistered=0,entryReader;
 const resolver={contract:'ag-definition-resolver/0.1-prototype',
  registerProvider:({providerId,readEntries})=>{
   assert.equal(providerId,'ashen-gate-locations');entryReader=readEntries;return {unregister:()=>unregistered++};
  },refresh:()=>{refreshes++;return true;}
 };
 const release=moduleObj.api.locationResolver.registerWith(resolver);
 assert.ok(entryReader().find(x=>x.record.id==='LOC-TEST-SITE'));
 const editor=await moduleObj.api.openEditor('LOC-INTEGRATION-FRESH');
 editor.draft.name='New linkage source';await editor.action('save');
 assert.ok(refreshes>0,'registered resolver invalidated by source change');
 assert.ok(entryReader().some(x=>x.record.id==='LOC-INTEGRATION-FRESH'));
 release();
 const saved=refreshes;
 editor.draft.description.gm='Hidden change';await editor.action('save');
 assert.equal(refreshes,saved,'lease release stops unnecessary notifications');
 assert.equal(unregistered,1);
});

test('GM-only Objective checker supports unavailable and Eli consumer without modifying records',async()=>{
 const originalGet=game.modules.get;
 const editor=await moduleObj.api.openEditor('LOC-INTEGRATION-FRESH');
 editor.draft.refs=[{relation:'offers_objective',target_id:'QUEST-LINK-ONE',mode:'required'}];
 await editor.action('save');
 const noOwner=await moduleObj.api.checkObjectiveLinks('LOC-INTEGRATION-FRESH');
 assert.deepEqual(noOwner.map(r=>r.status),['owner_unavailable']);
 game.modules.get=id=>id==='ashen-gate-quest-manager'?{active:true,api:{consumer:{contract:'ag-objective-consumer/0.2-alpha',resolveObjective:(id,{entityType})=>{assert.equal(entityType,'Objective');return {status:'ok',binding:{id}};}}}}:originalGet(id);
 try {
  const resolved=await moduleObj.api.checkObjectiveLinks('LOC-INTEGRATION-FRESH');
  assert.deepEqual(resolved.map(r=>r.status),['ok']);
  assert.equal(resolved[0].mode,'required');
  assert.equal(moduleObj.api.getLocationSource('LOC-INTEGRATION-FRESH').record.refs[0].mode,'required');
 } finally {game.modules.get=originalGet;}
});
