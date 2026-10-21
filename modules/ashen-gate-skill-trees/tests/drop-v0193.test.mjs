import test from 'node:test';import assert from 'node:assert/strict';

// 0.19.3 board drops read with the shared ag-item-drop/1 helper (mocked Foundry; the live drag needs Forge).
const MODULE='ashen-gate-skill-trees';
class FakeApplication{static DEFAULT_OPTIONS={};constructor(){}render(){return this;}async _prepareContext(){return {};}async _onRender(){}}
const oneTime=new Map(),notes={info:[],warn:[],error:[]};
let dragData=null;
globalThis.Hooks={once:(e,fn)=>oneTime.set(e,fn),on:()=>{}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{}},
  ux:{TextEditor:{implementation:{getDragEventData:()=>dragData??{}}}}},utils:{escapeHTML:x=>x,randomID:()=>'r'}};
const perk=(id,name,extra={})=>({documentName:'Item',type:'feat',name,uuid:`Item.${id}`,
  flags:{'ashen-gate-manager':{source:{sourceId:id,status:'approved',visibility:'player'}}},...extra});
const world=[perk('PERK-A','[TEST] Perk A'),perk('PERK-B','[TEST] Perk B'),
  {...perk('ITEM-SWORD','[TEST] Sword'),type:'weapon'}];
const byUuid=new Map([...world.map(i=>[i.uuid,i]),['Actor.x',{documentName:'Actor',uuid:'Actor.x'}],
  ['Compendium.p.Item.PERK-A',{...perk('PERK-A','[TEST] Perk A'),uuid:'Compendium.p.Item.PERK-A',pack:'p'}]]);
globalThis.fromUuid=async uuid=>byUuid.get(uuid)??null;
globalThis.Item={implementation:{fromDropData:async raw=>byUuid.get(raw.uuid)??null}};
globalThis.game={modules:new Map([[MODULE,{id:MODULE,active:true}]]),settings:{register:()=>{},registerMenu:()=>{},get:()=>undefined,set:async()=>{}},
  journal:{contents:[]},actors:{contents:[],get:()=>null},items:{contents:world},user:{isGM:true,id:'gm'},users:{contents:[]}};
globalThis.ui={actors:null,notifications:{info:m=>notes.info.push(m),warn:m=>notes.warn.push(m),error:m=>notes.error.push(m)}};
console.error=()=>{};
await import('../scripts/main.js');
oneTime.get('init')();oneTime.get('ready')();
const app=game.modules.get(MODULE).api.open();

let stored,saved;
const reset=()=>{
  stored={id:'TREE-T',name:'[TEST] Tree',status:'test',visibility:'gm',provider:{kind:'generic_points',maxPoints:5},nodes:[{id:'NODE-A',perkId:'PERK-A',x:0,y:0}]};
  saved=null;for(const k in notes)notes[k].length=0;dragData=null;
  Object.defineProperty(app,'storedTree',{get:()=>stored,configurable:true});
  Object.defineProperty(app,'tree',{get:()=>stored,configurable:true});
  app._saveEdited=async t=>{saved=t;stored=t;};
  app.render=()=>app;app.editMode=true;app.playerPreview=false;app.zoom=1;
  app.element={querySelector:()=>({getBoundingClientRect:()=>({left:0,top:0})})};
};
/** A drop event: `plain` goes in text/plain; `dragData` is what getDragEventData returns. */
const drop=(plain='')=>({preventDefault(){},clientX:400,clientY:300,dataTransfer:{getData:t=>t==='text/plain'?plain:''}});

test('a world perk dropped as plain JSON adds a node at the drop point, as before',async()=>{
  reset();
  await app._dropped(drop(JSON.stringify({type:'Item',uuid:'Item.PERK-B'})));
  assert.equal(saved.nodes.length,2);
  const n=saved.nodes[1];assert.equal(n.perkId,'PERK-B');assert.equal(n.perkUuid,'Item.PERK-B');
  assert.ok(Number.isFinite(n.x)&&Number.isFinite(n.y));
  assert.deepEqual(notes.warn,[]);assert.deepEqual(notes.error,[]);
});
test('a drop only getDragEventData can read (no JSON in text/plain) now works',async()=>{
  reset();dragData={type:'Item',uuid:'Item.PERK-B'};
  await app._dropped(drop(''));
  assert.equal(saved?.nodes.at(-1).perkId,'PERK-B');
});
test('folder, missing item and Actor drops warn with the standard text and save nothing',async()=>{
  for(const [data,text] of [[{type:'Folder',uuid:'Folder.f'},'Drop items one at a time.'],
    [{type:'Item',uuid:'Item.GONE'},"That item no longer exists or you can't see it."],
    [{type:'Actor',uuid:'Actor.x'},'Drop an item.']]){
    reset();await app._dropped(drop(JSON.stringify(data)));
    assert.equal(saved,null);assert.deepEqual(notes.warn,[`Perk drop: ${text}`]);assert.deepEqual(notes.error,[]);
  }
  reset();await app._dropped(drop('not json'));
  assert.equal(saved,null);assert.equal(notes.warn.length,1,'unreadable drop warns too');
});
test('the existing perk-node refusals are unchanged',async()=>{
  const cases=[[{type:'Item',uuid:'Item.ITEM-SWORD'},/Only perk Feature Items/],
    [{type:'Item',uuid:'Item.PERK-A'},/already on this tree/],
    [{type:'Item',uuid:'Compendium.p.Item.PERK-A'},/Missing, archived or duplicated perk binding/]];
  for(const [data,re] of cases){
    reset();if(re.source.startsWith('Missing'))stored.nodes=[];
    await app._dropped(drop(JSON.stringify(data)));
    assert.equal(saved,null);assert.equal(notes.error.length,1);assert.match(notes.error[0],re);
  }
});
test('players and preview mode still cannot drop',async()=>{
  reset();app.playerPreview=true;
  await app._dropped(drop(JSON.stringify({type:'Item',uuid:'Item.PERK-B'})));
  assert.equal(saved,null);
  reset();game.user.isGM=false;
  try{await app._dropped(drop(JSON.stringify({type:'Item',uuid:'Item.PERK-B'})));}finally{game.user.isGM=true;}
  assert.equal(saved,null);
  reset();game.user.isGM=false;
  try{await assert.rejects(()=>app._addPerkNode(world[1]),/GM editor only/);}finally{game.user.isGM=true;}
});
