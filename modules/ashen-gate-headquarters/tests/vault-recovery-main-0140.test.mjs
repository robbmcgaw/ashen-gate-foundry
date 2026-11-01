// 0.14.0 wiring in main.mjs: one recovery dialog instead of the red toast, the not-ready warning once per session,
// players unaffected. Mocked Foundry globals; proves the wiring, not the live Forge windows.
import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,applyOperation} from '../js/logic.mjs';

const hooks={once:{},on:{}};
const toasts=[],dialogs=[];
const gm={id:'gm',isGM:true,active:true,name:'GM'};
const player={id:'p1',isGM:false,active:true,name:'P'};
const active=applyOperation(emptyState(),gm,'activate',{hq_ref:'HQ-TEST-001',location_ref:'LOC-TEST-001',campaign_key:'test',guild_key:'primary'});
const settings=new Map([['ashen-gate-headquarters.playerAccessEnabled',true],['ashen-gate-headquarters.state',active],['ashen-gate-headquarters.privateStateDocumentId','gone']]);
let answers=[];
globalThis.foundry={applications:{api:{
 ApplicationV2:class{constructor(o){this.options=o;}render(){}close(){}},
 HandlebarsApplicationMixin:B=>class extends B{},
 DialogV2:{wait:async o=>{dialogs.push(o);const a=answers.shift();if(a===undefined||a===null)return null;if(typeof a==='object')return a.form;const b=o.buttons.find(x=>x.action===a);return b?b.callback():null;},prompt:async()=>{}}
}}};
globalThis.Hooks={once:(k,f)=>{hooks.once[k]=f;},on:(k,f)=>{(hooks.on[k]??=[]).push(f);return k;},off:()=>{}};
globalThis.ui={notifications:{warn:m=>toasts.push(['warn',m]),info:m=>toasts.push(['info',m]),error:m=>toasts.push(['error',m])}};
globalThis.document={querySelectorAll:()=>[]};
const mod={id:'ashen-gate-headquarters',version:'0.16.0'};
const journals=[];
globalThis.game={user:gm,users:Object.assign(new Map([['gm',gm],['p1',player]]),{activeGM:gm}),modules:{get:()=>mod},
 settings:{register:()=>{},registerMenu:()=>{},get:(m,k)=>settings.get(`${m}.${k}`),set:async(m,k,v)=>{settings.set(`${m}.${k}`,v);}},
 keybindings:{register:()=>{}},journal:{get contents(){return journals;},get:id=>journals.find(j=>j.id===id)},items:{contents:[]},actors:{contents:[]}};
globalThis.JournalEntry={create:async d=>{const doc={id:'new1',...d,getFlag:(ns,k)=>doc.flags[ns]?.[k],update:async()=>{}};journals.push(doc);return doc;}};
await import('../js/main.mjs');
hooks.once.init();
const api=()=>game.modules.get('ashen-gate-headquarters').api;
const tick=()=>new Promise(r=>setTimeout(r,0));

test('GM start with a missing vault: one dialog, no red toast, then the warning shows once however often Headquarters is opened',async()=>{
 await hooks.once.ready();await tick();
 assert.equal(toasts.filter(t=>t[0]==='error').length,0,'no red toast');
 assert.equal(dialogs.length,1,'one dialog');
 assert.equal(dialogs[0].window.title,'Headquarters private vault');
 assert.deepEqual(dialogs[0].buttons.map(b=>b.label),['Cancel','Look again','Start a new private vault…']);
 // Cancelled (answer null): opening Headquarters re-offers the dialog, but never stacks toasts.
 for(let i=0;i<4;i++){assert.equal(api().open(),null);await tick();}
 assert.equal(dialogs.length,5,'one dialog per open, each closed first');
 assert.equal(toasts.filter(t=>/not ready/.test(t[1])).length,0,'recoverable problem: no repeated toasts');
});

test('wrong phrase through the real dialogs creates nothing; the right phrase creates one restricted vault and Headquarters opens',async()=>{
 answers=["start-new",{form:{phrase:"nope"}},null];
 api().open();await tick();await tick();
 assert.equal(journals.length,0,'wrong phrase, no vault');
 const revision=settings.get('ashen-gate-headquarters.state').state_revision;
 answers=['start-new',{form:{phrase:'NEW VAULT'}}];
 api().open();await tick();await tick();
assert.equal(journals.length,1);assert.equal(journals[0].ownership.default,0);
 assert.equal(settings.get('ashen-gate-headquarters.privateStateDocumentId'),'new1');
 assert.equal(settings.get('ashen-gate-headquarters.state').state_revision,revision+1);
 assert.ok(toasts.some(t=>t[0]==='info'&&/new private vault/.test(t[1])));
const app=api().open();assert.ok(app,'Headquarters now opens for the GM');clearInterval(app.leaseTimer);
});

test('players: no dialog, no toast from recovery; public behaviour unchanged',async()=>{
 game.user=player;const n=dialogs.length,t=toasts.length;
 try{const app=api().open();if(app)clearInterval(app.leaseTimer);await tick();}catch{}
 assert.equal(dialogs.length,n);
 assert.equal(toasts.slice(t).filter(x=>/vault|not ready/i.test(x[1])).length,0);
 game.user=gm;
});
