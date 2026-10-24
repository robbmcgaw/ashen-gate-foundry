// 0.22.0 GM Quests list group folds: wiring in the Quest Log window. Mocked Foundry and a fake DOM: proves the logic and wiring,
// not the live Foundry UI (look, focus ring, Enter/Space on a real <summary>: check those in Forge).
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MOD,initialState} from '../scripts/core.mjs';
import {El} from './helpers/fake-dom.mjs';

const once=new Map(),hooks=new Map();
globalThis.Hooks={once:(e,fn)=>once.set(e,fn),on:(e,fn)=>hooks.set(e,[...(hooks.get(e)??[]),fn]),off:()=>{}};
let lastApp;const dialogs=[];let answer='confirm';
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(){lastApp=this;}async render(){this.rendered=true;this.renders=(this.renders??0)+1;return this._renderHTML();}async close(){this.rendered=false;this.closed=true;return this;}},
 DialogV2:{wait:async o=>{dialogs.push(o);return o.buttons.find(b=>b.action===answer).callback();},prompt:async o=>{dialogs.push(o);}}}}};
const gm={id:'gm',isGM:true,flags:{}},alice={id:'alice',isGM:false,flags:{}};
for(const u of [gm,alice]){u.getFlag=(m,k)=>m===MOD?structuredClone(u.flags[k]):undefined;u.setFlag=async(m,k,v)=>{u.flags[k]=structuredClone(v);};}
const docs=[];let n=0;
const setPath=(o,path,v)=>{const ks=path.split('.');let t=o;for(const k of ks.slice(0,-1))t=t[k]??={};t[ks.at(-1)]=structuredClone(v);};
class Doc{constructor(d){this.id=`j${++n}`;this.name=d.name;this.flags=structuredClone(d.flags??{});this.ownership=d.ownership;this._stats={modifiedTime:n};this.pages=(d.pages??[]).map(p=>({...p,update:async()=>{}}));}
 getFlag(m,k){return structuredClone(this.flags?.[m]?.[k]);}
 async update(data){for(const [k,v] of Object.entries(data)){if(k.startsWith('flags.'))setPath(this,k,v);else this[k]=v;}return this;}
 async delete(){docs.splice(docs.indexOf(this),1);}
 testUserPermission(u){return u.isGM||this.ownership?.[u.id]>=2||this.ownership?.default>=2;}}
globalThis.JournalEntry={create:async(data)=>{const d=new Doc(data);docs.push(d);return d;}};
const actors=[{id:'aria',name:'[TEST] Aria',type:'character',flags:{},testUserPermission:u=>u.isGM||u.id==='alice'}];actors.get=id=>actors.find(a=>a.id===id)??null;
const settings={playerAccessEnabled:true,compendiumPackIds:'',openForPlayers:false};
const mod={active:true,api:null,version:'0.17.0'};const notes=[];
const locations={active:true,api:{getLocation:id=>({'LOC-TEST-MILL':{id,name:'[TEST] Old Mill'}})[id]??null,locationsForQuest:id=>id==='QUEST-TEST-MILL'?[{id:'LOC-TEST-MILL'}]:[]}};
const users=[gm,alice];
globalThis.document={querySelectorAll:()=>[],querySelector:()=>null};
globalThis.ui={actors:{element:null},notifications:{info:m=>notes.push(['info',m]),warn:m=>notes.push(['warn',m]),error:m=>notes.push(['error',m])}};
globalThis.game={user:gm,users,journal:docs,actors,folders:[],items:{contents:[]},packs:{get:()=>null},
 settings:{register:()=>{},get:(m,k)=>settings[k],set:async(m,k,v)=>{settings[k]=v;}},modules:{get:id=>id===MOD?mod:id==='ashen-gate-locations'?locations:null}};
{const m={};globalThis.localStorage={getItem:k=>m[k]??null,setItem:(k,v)=>{m[k]=String(v);},removeItem:k=>{delete m[k];}};}
const origError=console.error;console.error=()=>{};
await import('../scripts/main.mjs');
once.get('init')();once.get('ready')();
const store=await import('../scripts/store.mjs');
const {storeKey}=await import('../scripts/group-folds.mjs');
const src=(id,name)=>({id,entity_type:'Objective',objective_kind:'quest',status:'approved',version:'1',provenance:{sources:['[TEST]']},visibility:'player',refs:[],name,public_summary:'',source:{},objectives:[{key:'a',goal:'[TEST] goal',visibility:'player'}],locations:[],parameters:{},outcomes:{}});
const STATUS=['Available','Active','Completed'];
for(let i=0;i<14;i++)await store.saveRecord(src(`QUEST-TEST-F${i}`,`[TEST] Fold ${i}`),{state:{...initialState(src(`QUEST-TEST-F${i}`,'x')),status:STATUS[i%3],revealed:true}});
const content=new El();
const draw=async app=>{app._replaceHTML(await app._renderHTML(),content);return content;};
await mod.api.open();const app=lastApp;
const folds=()=>content.querySelectorAll('details.agq-gfold');
const openOf=()=>folds().map(f=>'open' in f.attrs);
const btn=a=>content.querySelector(`[data-action="${a}"]`);

test('more than 12 quests: groups start closed; the group of the selected quest starts open',async()=>{
 app.tab='quests';app.gmId=null;app.qv={...app.qv,group:'status',search:''};await draw(app);
 assert.equal(folds().length,3);assert.deepEqual(openOf(),[false,false,false]);
 app.gmId='QUEST-TEST-F1';await draw(app);  // F1 is Active
 assert.deepEqual(openOf(),[false,true,false]);
 assert.equal(btn('collapse-groups').disabled,false);assert.equal(btn('expand-groups').disabled,false);
});
test('opening a group saves it per user and group-by mode, and a redraw keeps it',async()=>{
 app.gmId=null;await draw(app);
 const first=folds()[0];first.open=true;first.fire('toggle');
 assert.equal(first.querySelector('summary').getAttribute('aria-expanded'),'true');
 assert.equal(app.ui.get(storeKey('status','Available')),true);
 await draw(app);assert.deepEqual(openOf(),[true,false,false]);
 app.qv.group='type';await draw(app);assert.ok(openOf().every(v=>!v),'another group-by mode starts from its own default');
 app.qv.group='status';
});
test('a toggle that only echoes the drawn state is not saved as a choice',async()=>{
 app.ui.set(storeKey('status','Completed'),undefined);app.gmId='QUEST-TEST-F2';await draw(app);  // F2 Completed, open by default
 const done=folds()[2];assert.equal('open' in done.attrs,true);done.fire('toggle');
 assert.equal(app.ui.get(storeKey('status','Completed')),undefined);
});
test('Collapse all and Expand all change every group without a redraw, and save',async()=>{
 app.gmId='QUEST-TEST-F1';await draw(app);const before=folds()[0];
 btn('expand-groups').fire('click');
 assert.ok(folds().every(f=>f.getAttribute('aria-expanded')===null&&f.querySelector('summary').getAttribute('aria-expanded')==='true'));
 assert.equal(btn('expand-groups').disabled,true);assert.equal(btn('collapse-groups').disabled,false);
 assert.equal(app.ui.get(storeKey('status','Active')),true);assert.equal(folds()[0],before,'no redraw');
 btn('collapse-groups').fire('click');
 assert.ok(folds().every(f=>f.querySelector('summary').getAttribute('aria-expanded')==='false'));
 assert.equal(app.ui.get(storeKey('status','Active')),false);assert.equal(btn('collapse-groups').disabled,true);
 await draw(app);assert.deepEqual(openOf(),[false,false,false],'saved close beats the selected-quest default');
});
test('a search opens the groups that match and saves nothing; clearing it brings the saved state back',async()=>{
 app.gmId=null;await draw(app);
 for(const g of ['Available','Active','Completed'])app.ui.set(storeKey('status',g),false);
 const search=content.querySelector('#ag-gm-search');search.value='Fold 4';search.fire('input');
 assert.ok(folds().length>=1&&folds().length<3);assert.ok(openOf().every(Boolean),'matches are never hidden in a closed group');
 assert.equal(btn('collapse-groups').disabled,true);assert.match(btn('collapse-groups').getAttribute('data-tooltip'),/search or filter/);
 assert.equal(app.ui.get(storeKey('status','Active')),false,'temporary open state is not saved');
 folds()[0].open=false;folds()[0].fire('toggle');assert.equal(app.ui.get(storeKey('status','Active')),false,'closing while filtering is not saved either');
 search.value='';search.fire('input');assert.equal(folds().length,3);assert.deepEqual(openOf(),[false,false,false]);
});
test('No grouping is a flat list with the fold buttons off; the editor beside the list still opens',async()=>{
 app.qv.group='none';app.gmId='QUEST-TEST-F4';await draw(app);
 assert.equal(folds().length,0);assert.equal(btn('collapse-groups').disabled,true);
 assert.ok(content.querySelector('.ag-split .ag-split__list'));assert.ok(content.querySelector('.ag-split .ag-split__detail'));
 assert.ok(content.querySelector('[data-qid="QUEST-TEST-F4"].is-selected'));
 app.qv.group='status';
});
test('focus on a group header: its selector is stable across redraws and carries no id',async()=>{
 app.gmId=null;await draw(app);
 const {fieldSelector}=await import('../scripts/view-state.mjs');
 const key=folds()[1].dataset.key;assert.match(key,/^grp-status-/);
 // The fake DOM has no classList[0], so give fieldSelector the same facts a real <summary> has.
 const summary={id:'',classList:['ag-fold__summary'],getAttribute:a=>a==='aria-expanded'?'false':null,closest:()=>({getAttribute:a=>a==='data-key'?key:null})};
 const sel=fieldSelector(summary);assert.equal(sel,`[data-key="${key}"] .ag-fold__summary`);
 await draw(app);assert.ok(content.querySelector(sel),'the same header is found after a redraw');
});
