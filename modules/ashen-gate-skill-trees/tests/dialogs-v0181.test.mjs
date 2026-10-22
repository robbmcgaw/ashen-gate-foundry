import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// 0.18.1: Help and confirmations go through the shared ag-dialogs.mjs helper (mocked DialogV2).
class FakeApplication{static DEFAULT_OPTIONS={};render(){return this;}async _prepareContext(){return {};}async _onRender(){}}
const oneTime=new Map(),writes=[];
globalThis.Hooks={once:(e,fn)=>oneTime.set(e,fn),on:()=>{}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{}}},utils:{escapeHTML:x=>x,randomID:()=>'r'}};
globalThis.game={modules:new Map([['ashen-gate-skill-trees',{id:'ashen-gate-skill-trees',active:true}]]),settings:{
  register:()=>{},registerMenu:()=>{},
  get:(_m,key)=>({treeData:{schema:'ag-skill-trees/0.1',trees:[{id:'OLD',name:'[TEST] Old tree'}]},publicTreesV2:{schema:'ag-skill-trees/0.2',trees:[]}})[key],
  set:async(_m,key,value)=>{writes.push(key);return value;}
},journal:{contents:[]},actors:{contents:[],get:()=>null},items:{contents:[]},user:{isGM:true},users:{contents:[]}};
globalThis.ui={actors:null,notifications:{info:()=>{},error:()=>{}}};
await import('../scripts/main.js');
oneTime.get('init')();oneTime.get('ready')();
const app=game.modules.get('ashen-gate-skill-trees').api.open();

test('Help opens through infoDialog with one Close button and the kit classes',async()=>{
  let seen;foundry.applications.api.DialogV2={prompt:async o=>{seen=o;}};
  await app._help();
  assert.equal(seen.ok.label,'Close');
  assert.ok(seen.classes.includes('ag-app')&&seen.classes.includes('ag-dialog'));
  assert.equal(seen.window.title,'Skill Trees help');
});

test('Clearing the legacy setting is a danger confirm; Cancel writes nothing',async()=>{
  let seen;foundry.applications.api.DialogV2={wait:async o=>{seen=o;return o.buttons.find(b=>b.action==='cancel').callback();}};
  writes.length=0;
  await app._legacyClear();
  assert.deepEqual(seen.buttons.map(b=>b.label),['Cancel','Back up and clear']);
  assert.ok(seen.classes.includes('ag-dialog--danger'));
  assert.equal(seen.window.title,'Clear the legacy public setting?');
  assert.deepEqual(seen.buttons.map(b=>Boolean(b.default)),[true,false],'Cancel is the default');
  assert.deepEqual(writes,[]);
});

test('destructive confirms carry a verb label and danger; no Yes/No or DialogV2.confirm left',async()=>{
  const src=await fs.readFile(new URL('../scripts/main.js',import.meta.url),'utf8');
  // 0.20.0: removals and resets use the kit's confirmDanger (red action, Cancel is the default button).
  for(const yes of ['Reset tree','Remove node','Refund points','Remove test records','Undo change','Back up and clear'])
    assert.match(src,new RegExp(`await confirmDanger\\([^;]*yes:'${yes}'\\}\\)`),yes);
  assert.doesNotMatch(src,/danger:true/,'no confirmDialog danger left: its action would be the default');
  assert.match(src,/yes:'Unlock perk'\}/);
  assert.doesNotMatch(src,/DialogV2\.(confirm|prompt)\(/);
  const tpl=await fs.readFile(new URL('../templates/tree.hbs',import.meta.url),'utf8');
  assert.doesNotMatch(tpl,/Alpha release|add demo trees/);
});
