// 0.11.1 dialogs sweep: remove decoration and unassign hireling ask first (danger, verb label); Cancel writes nothing.
// Mocked Foundry globals; proves the wiring, not the live DialogV2 window.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyState,applyOperation} from '../js/logic.mjs';

const hooks={once:{},on:{}};
const warnings=[],writes=[];
let dialog=null,answer='cancel';
const gm={id:'gm',isGM:true,active:true,name:'GM'};
const active=applyOperation(emptyState(),gm,'activate',{hq_ref:'HQ-TEST-001',location_ref:'LOC-TEST-001',campaign_key:'test',guild_key:'primary'});
const settings=new Map([['ashen-gate-headquarters.playerAccessEnabled',true],['ashen-gate-headquarters.state',active]]);
const vault={id:'vault',ownership:{default:0},flags:{},update:async d=>{writes.push(d);}};
globalThis.foundry={applications:{api:{
  ApplicationV2:class{constructor(o){this.options=o;}render(){}close(){}},
  HandlebarsApplicationMixin:B=>class extends B{},
  DialogV2:{wait:async o=>{dialog=o;return o.buttons.find(b=>b.action===answer).callback();},prompt:async o=>{dialog=o;}}
}}};
globalThis.Hooks={once:(k,f)=>{hooks.once[k]=f;},on:(k,f)=>{(hooks.on[k]??=[]).push(f);return k;},off:()=>{}};
globalThis.ui={notifications:{warn:m=>warnings.push(m),info:()=>{},error:m=>warnings.push(m)}};
globalThis.document={querySelectorAll:()=>[]};
let menuClass;
const mod={id:'ashen-gate-headquarters',version:'0.13.0'};
globalThis.game={user:gm,users:Object.assign(new Map([['gm',gm]]),{activeGM:gm}),modules:{get:()=>mod},
  settings:{register:()=>{},registerMenu:(_m,_k,o)=>{menuClass=o.type;},get:(m,k)=>settings.get(`${m}.${k}`),set:async(m,k,v)=>{writes.push({[k]:v});settings.set(`${m}.${k}`,v);}},
  keybindings:{register:()=>{}},journal:{contents:[],get:()=>null},items:{contents:[]},actors:{contents:[]}};
globalThis.JournalEntry={create:async d=>Object.assign(vault,d,{id:'vault'})};
await import('../js/main.mjs');
hooks.once.init();
await hooks.once.ready();

const click=async(action,dataset={})=>{
  const app=new menuClass();clearInterval(app.leaseTimer);
  const btn={dataset:{action,...dataset}};
  writes.length=0;warnings.length=0;dialog=null;
  await app.click({target:{closest:sel=>sel==='button'?btn:null},preventDefault(){}},{querySelector:()=>null});
};

for(const [action,data,label] of [['remove-decor',{},'Remove decoration'],['unassign-hireling',{hireRef:'HIRE-TEST-ONE'},'Unassign this hireling']]){
  test(`${action}: confirm is danger with a verb label; Cancel writes nothing`,async()=>{
    answer='cancel';await click(action,data);
    assert.ok(dialog,'a confirm opened');
    assert.ok(dialog.classes.includes('ag-dialog--danger'));
    assert.deepEqual(dialog.buttons.map(b=>b.label),['Cancel',label]);
    assert.match(dialog.window.title,/\?$/);
    assert.equal(writes.length,0);assert.equal(warnings.length,0,'request never ran');
    answer='confirm';await click(action,data);
    assert.ok(warnings.length+writes.length>0,'the confirmed action reaches the request path');
  });
}

test('player-visible wording: no revision numbers, (test default), Alpha header or Management tab',()=>{
  const code=readFileSync(new URL('../js/main.mjs',import.meta.url),'utf8');
  for(const s of ['Shared revision','(test default)','· Alpha</span>','Management tab',' · revision ${'])assert.ok(!code.includes(s),s);
  for(const s of ['This Alpha','in this Alpha','No Foundry V14 live verification','disposable test world'])assert.ok(!code.includes(s),s);
  assert.ok(!readFileSync(new URL('../js/facilities-tab.mjs',import.meta.url),'utf8').includes('activated in GM Setup'));
});

test('Help opens as a dialog with one Close button and the kit classes; the tab stays put',async()=>{
  const app=new menuClass();clearInterval(app.leaseTimer);
  const btn={dataset:{action:'help'}};dialog=null;
  await app.click({target:{closest:sel=>sel==='button'?btn:null},preventDefault(){}},{querySelector:()=>null});
  assert.equal(dialog.ok.label,'Close');
  assert.ok(dialog.classes.includes('ag-app')&&dialog.classes.includes('ag-dialog'));
  assert.equal(dialog.window.title,'Headquarters help');
  assert.match(dialog.content,/Guildhall Builder/);
  assert.equal(app.tab,'builder');
});
