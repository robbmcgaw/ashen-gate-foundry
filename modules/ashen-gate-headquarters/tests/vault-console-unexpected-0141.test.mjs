// 0.14.1 console noise (HQ vault missing). MOCKED Foundry globals: proves the console wiring, not the live Forge console.
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
const mod={id:'ashen-gate-headquarters',version:'0.15.1'};
const journals=[];
globalThis.game={user:gm,users:Object.assign(new Map([['gm',gm],['p1',player]]),{activeGM:gm}),modules:{get:()=>mod},
 settings:{register:()=>{},registerMenu:()=>{},get:(m,k)=>settings.get(`${m}.${k}`),set:async(m,k,v)=>{settings.set(`${m}.${k}`,v);}},
 keybindings:{register:()=>{}},journal:{get contents(){return journals;},get:id=>journals.find(j=>j.id===id)},items:{contents:[]},actors:{contents:[]}};
globalThis.JournalEntry={create:async d=>{const doc={id:'new1',...d,getFlag:(ns,k)=>doc.flags[ns]?.[k],update:async()=>{}};journals.push(doc);return doc;}};

const logs={warn:[],error:[]};
console.warn=(...a)=>logs.warn.push(a);
console.error=(...a)=>logs.error.push(a);
await import('../js/main.mjs');
hooks.once.init();
const tick=()=>new Promise(r=>setTimeout(r,0));

test('an unexpected failure is still a console error with the red toast',async()=>{
 Object.defineProperty(game.journal,'contents',{get(){throw new Error('boom');}});
 await hooks.once.ready();await tick();
 assert.equal(logs.error.length,1);
 assert.equal(logs.error[0][1].message,'boom');
 assert.equal(logs.warn.length,0);
 assert.equal(toasts.filter(t=>t[0]==='error').length,1);
 assert.equal(dialogs.length,0);
});
