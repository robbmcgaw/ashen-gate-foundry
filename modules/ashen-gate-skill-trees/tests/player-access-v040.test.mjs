import test from 'node:test';
import assert from 'node:assert/strict';

class FakeApp {
  static DEFAULT_OPTIONS={};
  constructor(){this.rendered=false;this.closed=false;}
  render(){this.rendered=true;this.closed=false;return this;}
  async close(){this.rendered=false;this.closed=true;}
  async _prepareContext(){return {};}
  async _onRender(){}
}
class FakeElement {
  constructor(){this.children=[];this.attrs={};this.listeners={};this.dataset={};this.className='';this.parentElement=null;
    this.classList={add:(...parts)=>{this.className=[...new Set([...this.className.split(' ').filter(Boolean),...parts])].join(' ');}};}
  matches(selector){return selector==='.directory-header' && this===sidebar;}
  querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
  querySelectorAll(selector){
    const all=this.children.flatMap(c=>[c,...c.querySelectorAll(selector)]);
    if(selector==='.directory-header')return this===sidebar?[this]:[];
    if(selector==='.agst-open-button'||selector==='button.agst-open-button')return all.filter(el=>el.className.split(' ').includes('agst-open-button'));
    if(selector==='[data-ag-module-launch="ashen-gate-skill-trees"]')return all.filter(el=>el.dataset.agModuleLaunch==='ashen-gate-skill-trees');
    if(selector==='[data-ag-sidebar-launchers="actors"]')return all.filter(el=>el.dataset.agSidebarLaunchers==='actors');
    if(selector===':scope > button[data-ag-launch-order]')return this.children.filter(el=>el.dataset.agLaunchOrder!==undefined);
    return [];
  }
  prepend(el){this._reparent(el);this.children.unshift(el);el.parentElement=this;}
  append(el){this._reparent(el);this.children.push(el);el.parentElement=this;}
  _reparent(el){el.parentElement?.children.splice(el.parentElement.children.indexOf(el),1);}
  setAttribute(name,value){this.attrs[name]=value;}
  addEventListener(name,fn){this.listeners[name]=fn;}
  remove(){if(this.parentElement){const i=this.parentElement.children.indexOf(this);if(i>=0)this.parentElement.children.splice(i,1);this.parentElement=null;}}
}
globalThis.HTMLElement=FakeElement;
const sidebar=new FakeElement();
globalThis.document={createElement:()=>new FakeElement(),querySelectorAll:s=>s==='.agst-open-button'||s==='[data-ag-module-launch="ashen-gate-skill-trees"]'?sidebar.querySelectorAll(s):[]};
const defs=new Map(),values=new Map(),once=new Map(),events=new Map();
const user={id:'gm',isGM:true};
const MODULE='ashen-gate-skill-trees';
const mod={id:MODULE,active:true};
globalThis.Hooks={once:(name,fn)=>once.set(name,fn),on:(name,fn)=>events.set(name,[...(events.get(name)??[]),fn])};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApp,HandlebarsApplicationMixin:B=>B,DialogV2:{}}},utils:{escapeHTML:s=>String(s)}};
globalThis.ui={actors:{tabName:'actors',rendered:true,element:sidebar},notifications:{error(){},info(){}}};
globalThis.game={user,users:{contents:[]},modules:new Map([[MODULE,mod]]),journal:{contents:[]},actors:{contents:[],get:()=>null},items:{contents:[]},settings:{
  register:(_id,key,def)=>defs.set(key,def),registerMenu:()=>{},
  get:(_id,key)=>values.has(key)?values.get(key):defs.get(key)?.default,
  set:async(_id,key,val)=>{values.set(key,val);defs.get(key)?.onChange?.(val);return val;}
}};
await import('../scripts/main.js');once.get('init')();once.get('ready')();

test('Skill Trees exposes Player Access v1 and retains backwards-compatible access',()=>{
  const def=defs.get('playerAccessEnabled');
  assert.equal(def.default,true);assert.equal(def.scope,'world');assert.equal(def.type,Boolean);
  assert.deepEqual(mod.api.playerAccess.getState(),{
    contract:'ag-player-access/1',moduleId:MODULE,audience:'player',playerAccessEnabled:true,configurable:true
  });
  assert.equal(sidebar.querySelectorAll('.agst-open-button').length,1);
});

test('GM hide leaves GM UI open and never rewrites tree/Actor progression',async()=>{
  const progress={tree1:{awarded:11,unlocks:['POWER-KEEP']}},publicTrees={schema:'ag-skill-trees/0.2',trees:[]};
  const actor={flags:{[MODULE]:{progressV2:progress}}};
  values.set('publicTreesV2',publicTrees);
  const gmWindow=mod.api.open();
  const state=await mod.api.playerAccess.setEnabled(false);
  assert.equal(state.playerAccessEnabled,false);
  assert.equal(gmWindow.rendered,true);
  assert.equal(sidebar.querySelectorAll('.agst-open-button').length,1);
  assert.equal(actor.flags[MODULE].progressV2,progress);
  assert.equal(game.settings.get(MODULE,'publicTreesV2'),publicTrees);
});

test('hidden player denies open/listTrees/actorProgress, removes launcher, and rejects write bypass',async()=>{
  user.isGM=false;defs.get('playerAccessEnabled').onChange(false);
  assert.equal(sidebar.querySelectorAll('.agst-open-button').length,0);
  assert.throws(()=>mod.api.open(),/GM has hidden/);
  assert.throws(()=>mod.api.listTrees(),/GM has hidden/);
  assert.throws(()=>mod.api.actorProgress(null,'NO-TREE'),/GM has hidden/);
  await assert.rejects(()=>mod.api.playerAccess.setEnabled(true),/Only a GM/);
});

test('reveal restores launcher; open player window closes on live hide, and GM setter validates input',async()=>{
  user.isGM=true;
  await assert.rejects(()=>mod.api.playerAccess.setEnabled('true'),/Boolean/);
  await mod.api.playerAccess.setEnabled(true);
  user.isGM=false;defs.get('playerAccessEnabled').onChange(true);
  assert.equal(sidebar.querySelectorAll('.agst-open-button').length,1);
  const app=mod.api.open();assert.equal(app.rendered,true);
  values.set('playerAccessEnabled',false);defs.get('playerAccessEnabled').onChange(false);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(app.closed,true);
  assert.equal(sidebar.querySelectorAll('.agst-open-button').length,0);
  assert.throws(()=>app.render(),/GM has hidden/);
  await assert.rejects(()=>app._prepareContext({}),/GM has hidden/);
  user.isGM=true;
});
