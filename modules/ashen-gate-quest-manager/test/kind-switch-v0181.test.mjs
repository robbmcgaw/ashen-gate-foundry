// 0.18.1 A new quest's Type change shows that Type's fields at once (Work Order domain), keeping typed edits.
// Mocked Foundry and a fake DOM: proves the logic and wiring, not the live Foundry UI.
import test from 'node:test';import assert from 'node:assert/strict';
import {MOD} from '../scripts/core.mjs';
import {El,doc} from './helpers/fake-dom.mjs';

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
const mod={active:true,api:null,version:'0.18.1'};
const notes=[];
globalThis.document={querySelectorAll:()=>[],querySelector:()=>null};
globalThis.ui={actors:{element:null},notifications:{info:m=>notes.push(['info',m]),warn:m=>notes.push(['warn',m]),error:m=>notes.push(['error',m])}};
globalThis.game={user:gm,users:[gm],journal:docs,actors,folders:[],items:{contents:[]},packs:{get:()=>null},
 settings:{register:()=>{},get:(m,k)=>settings[k],set:async(m,k,v)=>{settings[k]=v;}},modules:{get:id=>id===MOD?mod:null}};
const origError=console.error;console.error=()=>{};
await import('../scripts/main.mjs');
once.get('init')();once.get('ready')();
console.error=origError;
const source=id=>docs.find(d=>d.flags?.[MOD]?.source?.id===id)?.flags[MOD].source;

let app,content;
const draw=async()=>{app._replaceHTML(await app._renderHTML(),content);return content;};
const domainField=()=>content.querySelector('[data-kind-field="work_order"]');
// A new quest with a title and description typed in, then Type set to `kind` the way a GM picks it.
async function newDraft(){
 await mod.api.open();app=lastApp;app.tab='quests';content=new El();await draw();
 await app.action({dataset:{action:'new'}},content);await draw();
 content.querySelector('#ag-src-name').value='[TEST] Mend the bellows';content.querySelector('#ag-src-name').fire('input');
 content.querySelector('#ag-src-summary').value='[TEST] The forge needs air.';content.querySelector('#ag-src-summary').fire('input');
}
function pickType(kind){const sel=content.querySelector('#ag-src-kind');sel.focus();sel.value=kind;sel.fire('change');return sel;}

test('new quest: Work Order shows the domain list at once, before any save, with Crafting picked; edits, note and focus stay',async()=>{
 await newDraft();
 assert.equal(domainField()?.hidden,true,'a new Quest hides the domain');
 const children=content.children,sel=pickType('work_order');
 assert.equal(content.children,children,'changed in place, not redrawn');
 assert.equal(domainField().hidden,false);assert.equal(domainField().getAttribute('hidden'),null);
 const domain=content.querySelector('#ag-src-workdomain');
 assert.deepEqual(domain.querySelectorAll('option').map(o=>o.attrs.value),['crafting','production','creative']);
 assert.equal(domain.value,'crafting','defaults to Crafting, as a saved order does');
 domain.value='creative';domain.fire('change');assert.equal(domain.value,'creative','selectable before the first save');
 assert.equal(content.querySelector('#ag-src-name').value,'[TEST] Mend the bellows');
 assert.equal(content.querySelector('#ag-src-summary').value,'[TEST] The forge needs air.');
 assert.equal(content.querySelector('[data-source-status]').textContent,'Unsaved changes');assert.equal(app.unsavedSource,true);
 assert.equal(doc.focused,sel,'focus stays on Type');
 assert.equal(content.querySelector('#ag-src-id').value,'ORDER-TEST-MEND-THE-BELLOWS','the made ID follows the Type and the title');
 assert.equal(content.querySelector('#ag-src-id').getAttribute('readonly'),'','the GM does not type it');
 assert.equal(content.querySelector('details[data-section="basics"] .ag-fold__hint').textContent,'Order');
});
test('first save stores the picked domain; a defaulted one is stored as Crafting',async()=>{
 await newDraft();pickType('work_order');
 content.querySelector('#ag-src-id-custom').value='order-test-bellows';content.querySelector('.ag-src-obj-goal').value='[TEST] Patch the leather';
 content.querySelector('#ag-src-workdomain').value='production';
 await app.action({dataset:{action:'save-quest'}},content);
 assert.deepEqual(notes.filter(x=>x[0]==='error'),[]);
 const src=source('ORDER-TEST-BELLOWS');assert.equal(src.objective_kind,'work_order');assert.equal(src.work_order_domain,'production');
 assert.equal(src.name,'[TEST] Mend the bellows');assert.equal(src.public_summary,'[TEST] The forge needs air.');
 await newDraft();pickType('work_order');
 content.querySelector('.ag-src-obj-goal').value='[TEST] Dress the anvil';
 await app.action({dataset:{action:'save-quest'}},content);
 assert.deepEqual(notes.filter(x=>x[0]==='error'),[]);assert.equal(source('ORDER-TEST-MEND-THE-BELLOWS').work_order_domain,'crafting','the ID is made from the title, no typing');
});
test('switching back to Quest or to Contract hides the domain, keeps typed edits, saves no domain, and the made ID follows the Type',async()=>{
 await newDraft();
 pickType('work_order');
 assert.equal(content.querySelector('#ag-src-id').value,'ORDER-TEST-MEND-THE-BELLOWS-2','taken by the order saved above, so -2');
 pickType('quest');assert.equal(domainField().hidden,true);assert.equal(domainField().getAttribute('hidden'),'');
 assert.equal(content.querySelector('#ag-src-id').value,'QUEST-TEST-MEND-THE-BELLOWS');
 assert.equal(content.querySelector('#ag-src-name').value,'[TEST] Mend the bellows');
 pickType('contract');assert.equal(domainField().hidden,true);assert.equal(content.querySelector('#ag-src-id').value,'CONTRACT-TEST-MEND-THE-BELLOWS');
 assert.equal(content.querySelector('#ag-src-id-custom').getAttribute('placeholder'),'CONTRACT-MY-ID');
 content.querySelector('.ag-src-obj-goal').value='[TEST] Sign the terms';
 await app.action({dataset:{action:'save-quest'}},content);
 assert.deepEqual(notes.filter(x=>x[0]==='error'),[]);
 const src=source('CONTRACT-TEST-MEND-THE-BELLOWS');assert.equal(src.objective_kind,'contract');assert.equal('work_order_domain' in src,false);
});
test('a saved quest keeps its Type locked and shows no domain; a saved order shows its domain',async()=>{
 app.gmId='CONTRACT-TEST-MEND-THE-BELLOWS';await draw();
 assert.equal(content.querySelector('#ag-src-kind').disabled,true);assert.equal(domainField(),null);
 app.gmId='ORDER-TEST-BELLOWS';await draw();
 assert.equal(domainField().hidden,false);assert.equal(content.querySelector('#ag-src-workdomain').value,'production');
});
