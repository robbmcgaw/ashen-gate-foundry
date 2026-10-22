// 0.18.0 Creative Work Orders (Artistry commissions). Mocked Foundry and a fake DOM: proves the logic and wiring, not the live Foundry UI.
import test from 'node:test';import assert from 'node:assert/strict';
import {MOD,validSource,planQuestImport,exportPackage,WORK_ORDER_DOMAINS,WORK_ORDER_DOMAIN_ERROR} from '../scripts/core.mjs';
import {SUBVIEWS} from '../scripts/quests-tab.mjs';
import {El} from './helpers/fake-dom.mjs';

const order=(o={})=>({id:'ORDER-TEST-BALLAD',entity_type:'Objective',objective_kind:'work_order',status:'approved',version:'1.0.0',provenance:{sources:['[TEST] synthetic']},visibility:'player',refs:[],
 name:'[TEST] Compose a ballad',public_summary:'[TEST] A commission',source:{description:'[TEST] patron'},objectives:[{key:'compose',goal:'[TEST] Compose the ballad'}],locations:[],parameters:{},outcomes:{},work_order_domain:'creative',...o});

test('Work Order domains: creative is accepted, crafting and production unchanged, unknown or missing rejected with one message',()=>{
 assert.deepEqual(WORK_ORDER_DOMAINS,[['crafting','Crafting'],['production','Production'],['creative','Creative']]);
 for(const d of ['creative','crafting','production'])assert.equal(validSource(order({work_order_domain:d})).work_order_domain,d);
 assert.equal(WORK_ORDER_DOMAIN_ERROR,'Work Order requires a crafting, production or creative domain.');
 for(const d of ['combat','Creative','',undefined])assert.throws(()=>validSource(order({work_order_domain:d})),{message:WORK_ORDER_DOMAIN_ERROR});
 const none=order();delete none.work_order_domain;assert.throws(()=>validSource(none),/^Error: Work Order requires/);
});
test('a creative order imports and exports with its domain kept',()=>{
 const plan=planQuestImport({schema_version:'ag-quest-source/0.1',records:[order()]});
 assert.deepEqual(plan.errors,[]);
 assert.equal(exportPackage([order()]).records[0].work_order_domain,'creative');
 assert.match(planQuestImport({schema_version:'ag-quest-source/0.1',records:[order({work_order_domain:'combat'})]}).errors.join(' '),/Work Order requires a crafting, production or creative domain\./);
 assert.equal(SUBVIEWS.find(v=>v.key==='orders').hint,'Work orders (crafting, production or creative)');
});

// ---------- the quest editor, mocked Foundry ----------
const once=new Map(),hooks=new Map();
globalThis.Hooks={once:(e,fn)=>once.set(e,fn),on:(e,fn)=>hooks.set(e,[...(hooks.get(e)??[]),fn]),off:()=>{}};
let lastApp;
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(){lastApp=this;}async render(){this.rendered=true;return this._renderHTML();}async close(){this.rendered=false;}},
 DialogV2:{wait:async o=>o.buttons.find(b=>b.action==='confirm')?.callback(),prompt:async()=>{}}}}};
const gm={id:'gm',isGM:true,flags:{}};
gm.getFlag=(m,k)=>m===MOD?structuredClone(gm.flags[k]):undefined;gm.setFlag=async(m,k,v)=>{gm.flags[k]=structuredClone(v);};
const docs=[];let n=0,clock=1_700_000_000_000;
const setPath=(o,path,v)=>{const ks=path.split('.');let t=o;for(const k of ks.slice(0,-1))t=t[k]??={};t[ks.at(-1)]=structuredClone(v);};
class Doc{constructor(d){this.id=`j${++n}`;this.name=d.name;this.flags=structuredClone(d.flags??{});this.ownership=d.ownership;this._stats={modifiedTime:++clock};this.pages=(d.pages??[]).map(p=>({...p,update:async()=>{}}));}
 getFlag(m,k){return structuredClone(this.flags?.[m]?.[k]);}
 async update(data){for(const [k,v] of Object.entries(data)){if(k.startsWith('flags.'))setPath(this,k,v);else this[k]=v;}this._stats.modifiedTime=++clock;return this;}
 async delete(){docs.splice(docs.indexOf(this),1);}
 testUserPermission(u){return u.isGM;}}
globalThis.JournalEntry={create:async(data)=>{const d=new Doc(data);docs.push(d);return d;}};
const actors=[];actors.get=()=>null;
const settings={playerAccessEnabled:true,compendiumPackIds:'',openForPlayers:false};
const mod={active:true,api:null,version:'0.18.0'};
globalThis.document={querySelectorAll:()=>[],querySelector:()=>null};
globalThis.ui={actors:{element:null},notifications:{info:()=>{},warn:()=>{},error:()=>{}}};
globalThis.game={user:gm,users:[gm],journal:docs,actors,folders:[],items:{contents:[]},packs:{get:()=>null},
 settings:{register:()=>{},get:(m,k)=>settings[k],set:async(m,k,v)=>{settings[k]=v;}},modules:{get:id=>id===MOD?mod:null}};
const origError=console.error;console.error=()=>{};
await import('../scripts/main.mjs');
once.get('init')();once.get('ready')();
const store=await import('../scripts/store.mjs');
await store.saveRecord(order());
await store.saveRecord(order({id:'ORDER-TEST-HINGE',name:'[TEST] Hinge order',work_order_domain:'crafting'}));
console.error=origError;

test('editor: the Work order domain select offers Creative in plain words and shows a creative order as Creative',async()=>{
 await mod.api.open();const app=lastApp;app.tab='quests';
 const content=new El();const draw=async()=>{app._replaceHTML(await app._renderHTML(),content);return content;};
 app.gmId='ORDER-TEST-BALLAD';await draw();
 assert.match(content.innerHTML,/<option value="work_order" selected>Work Order \(crafting, production or creative\)<\/option>/);
 const select=content.innerHTML.match(/<select id="ag-src-workdomain">(.*?)<\/select>/)[1];
 assert.equal(select,'<option value="crafting" >Crafting</option><option value="production" >Production</option><option value="creative" selected>Creative</option>');
 app.gmId='ORDER-TEST-HINGE';await draw();
 assert.match(content.innerHTML,/<option value="crafting" selected>Crafting<\/option>/,'crafting is unchanged');
 assert.doesNotMatch(content.innerHTML,/>creative</,'the raw token is never shown');
});
