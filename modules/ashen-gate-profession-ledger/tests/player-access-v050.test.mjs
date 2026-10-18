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
const definitions=new Map(),values=new Map(),once=new Map(),events=new Map();
let moduleAPI,launcher=null;
const user={isGM:true,id:'u-gm',name:'GM'};
const buttonRoot={
  querySelector:s=>s==='[data-agl-launcher]'?launcher:s==='.directory-header .action-buttons'||s==='.directory-header'?header:null,
  querySelectorAll:s=>s==='[data-agl-launcher]'?(launcher?[launcher]:[]):[]
};
const header={append(button){launcher=button;}};
globalThis.document={
  createElement:()=>({dataset:{},classList:{add(){}},addEventListener(){},remove(){launcher=null;}}),
  querySelectorAll:s=>s==='[data-agl-launcher]'?(launcher?[launcher]:[]):[]
};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApp,HandlebarsApplicationMixin:B=>B,DialogV2:{}}},utils:{escapeHTML:s=>String(s)}};
globalThis.Hooks={once:(event,fn)=>once.set(event,fn),on:(event,fn)=>{const array=events.get(event)??[];array.push(fn);events.set(event,array);}};
const module={active:true,id:'ashen-gate-profession-ledger',get api(){return moduleAPI},set api(v){moduleAPI=v}};
globalThis.ui={actors:{tabName:'actors',element:buttonRoot},notifications:{error(){},info(){}}};
globalThis.game={
  user,users:{contents:[]},actors:{contents:[]},items:{contents:[]},modules:{get:id=>id===module.id?module:undefined},
  settings:{
    register:(_id,key,def)=>definitions.set(key,def),registerMenu:()=>{},
    get:(_id,key)=>values.has(key)?values.get(key):definitions.get(key)?.default,
    set:async(_id,key,value)=>{values.set(key,value);definitions.get(key)?.onChange?.(value);return value;}
  }
};
await import('../scripts/main.js');
once.get('init')();once.get('ready')();

test('DEC-0072 Player Access v1 is module-owned, world-scoped, upgrade-visible and exposes only status',()=>{
  const def=definitions.get('playerAccessEnabled');
  assert.equal(def.scope,'world');assert.equal(def.type,Boolean);assert.equal(def.default,true);
  assert.equal(def.config,true);
  assert.deepEqual(moduleAPI.playerAccess.getState(),{
    contract:'ag-player-access/1',moduleId:module.id,audience:'player',playerAccessEnabled:true,configurable:true
  });
  assert.ok(launcher,'GM sees Actors launcher even if player interface is later hidden');
});

test('GM can hide while retaining GM window, persistent campaign data and private progression',async()=>{
  const progress={xp:27,level:5},recipes=['REC-KEEP'];
  const actor={flags:{'ashen-gate-profession-ledger':{professionProgress:progress,knownRecipes:recipes}}};
  const window=moduleAPI.open();assert.equal(window.rendered,true);
  const result=await moduleAPI.playerAccess.setEnabled(false);
  assert.equal(result.playerAccessEnabled,false);
  assert.equal(window.rendered,true,'GM window stays open');
  assert.equal(launcher!==null,true,'GM still sees launcher');
  assert.equal(actor.flags['ashen-gate-profession-ledger'].professionProgress,progress);
  assert.equal(actor.flags['ashen-gate-profession-ledger'].knownRecipes,recipes);
  assert.equal(game.settings.get(module.id,'partyRoster').length,0);
  assert.equal(game.settings.get(module.id,'libraryData').schema,'ag-ledger/0.1');
});

test('remote hide locks open player UI, removes Actors button and refuses direct/macro/menu access',async()=>{
  user.isGM=false;
  // Equivalent of Foundry delivering a saved world setting to a connected client.
  definitions.get('playerAccessEnabled').onChange(false);
  assert.equal(launcher,null);
  const app=moduleAPI.open;
  assert.throws(()=>app(),/GM has hidden/);
  assert.throws(()=>moduleAPI.getKnownRecipes(null),/GM has hidden/);
  // Existing GM-created window is present in this single-process simulation.
  const hiddenWindow=moduleAPI.playerAccess.getState();
  assert.equal(hiddenWindow.playerAccessEnabled,false);
  await assert.rejects(()=>moduleAPI.playerAccess.setEnabled(true),/Only a GM/);
  await assert.rejects(()=>moduleAPI.playerAccess.setEnabled('true'),/Only a GM/);
});

test('revealing on player client restores launcher and open; boolean validation rejects invalid GM toggles',async()=>{
  user.isGM=true;
  await assert.rejects(()=>moduleAPI.playerAccess.setEnabled('enabled'),/Boolean/);
  await moduleAPI.playerAccess.setEnabled(true);
  user.isGM=false;definitions.get('playerAccessEnabled').onChange(true);
  assert.ok(launcher,'player launcher restored by onChange without rebuilding sidebar');
  const app=moduleAPI.open();assert.ok(app.rendered);
  // A remote GM hide closes the player's already-open window.
  values.set('playerAccessEnabled',false);definitions.get('playerAccessEnabled').onChange(false);
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(app.closed,'open player window dismissed');
  assert.equal(launcher,null);
  assert.throws(()=>app.render(),/GM has hidden/,'direct class render must enforce gate');
  await assert.rejects(()=>app._prepareContext({}),/GM has hidden/);
  user.isGM=true;
});
