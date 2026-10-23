// 0.28.1: the party purse is one card. Title with the GM's tools on its line; the coins centred; the Deposit/Take form
// (Character, Coin, Amount, then Deposit + Take together) centred below; a centred caption. The stash toolbar under it is a
// grid that keeps search + Take into on one line when wide. Mocked Foundry globals and a fake element, plus the CSS
// rules as text: proves the markup and the rules, not the live layout in Foundry (that was checked in headless Chromium).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ID} from '../scripts/core.mjs';

const handlers={once:new Map(),on:new Map()};const settings=new Map();
globalThis.HTMLElement=class {};
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(o){this.options=o;}async render(){return this;}async close(){}}}}};
const gm={id:'gm',name:'GM',isGM:true,active:true},alice={id:'alice',name:'Alice',isGM:false,active:true};
function mkActor(id,name,owner,flags={},system={}){const m=new Map();const a={id,name,type:owner?'character':'npc',documentName:'Actor',statuses:new Set(),effects:[],flags,system,
 getFlag:(ns,k)=>flags[ns]?.[k],testUserPermission:(u,level)=>u.isGM||u.id===owner||level==='LIMITED',update:async()=>{}};
 a.items={get:k=>m.get(k),get size(){return m.size;},[Symbol.iterator]:()=>m.values()};return a;}
const stash=mkActor('stash','Ashen Gate | Party Stash',null,{[ID]:{partyStash:true}},{currency:{cp:124,sp:5,ep:0,gp:1042,pp:3}});
const wren=mkActor('wren','[TEST] Wren','alice',{},{currency:{cp:0,sp:0,ep:0,gp:3,pp:0}});
const users=[gm,alice];users.get=id=>users.find(u=>u.id===id);
const actors=[stash,wren];actors.get=id=>actors.find(a=>a.id===id);
globalThis.fromUuid=async()=>null;globalThis.fromUuidSync=()=>null;
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{OBSERVER:2}};
globalThis.game={user:gm,users,actors,time:{worldTime:0},modules:new Map([[ID,{id:ID,active:true}]]),tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,o)=>settings.set(`${ns}.${key}`,{value:o.default,onChange:o.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,
  set:async(ns,key,v)=>{const s=settings.get(`${ns}.${key}`);s.value=v;s.onChange?.(v);}},
 socket:{emit:()=>{},on:()=>{}}};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[],Item:{typeLabels:{}}};
globalThis.ui={notifications:{info:()=>{},warn:()=>{},error:()=>{}}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>{if(!handlers.on.has(k))handlers.on.set(k,[]);handlers.on.get(k).push(fn);},off:()=>{}};
globalThis.document={querySelectorAll:()=>[],activeElement:null};
const origError=console.error;console.error=()=>{};
await import('../scripts/main.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api;
const set=(k,v)=>game.settings.set(ID,k,v);
const tick=()=>new Promise(r=>setTimeout(r,0));
function fakeElement(){const el={innerHTML:'',isConnected:true,classList:{add(){},remove(){}},addEventListener(){},contains:()=>true,querySelector:()=>null};return el;}
async function mounted(user){game.user=user;const el=fakeElement();const view=api.embed.mount(el,{actorId:'wren',mode:'stash'});await tick();return {html:el.innerHTML,view};}

const purseOf=html=>{const m=html.match(/<section class="agu-purse" aria-label="Party purse">([\s\S]*?)<\/section>/);assert.ok(m,'purse card present');return m[1];};
const css=readFileSync(new URL('../styles/utilities.css',import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
/** The body of the first @container block whose condition matches `cond`. */
function containerBlock(cond){const at=css.indexOf(`@container ${cond} {`);assert.ok(at>=0,`@container ${cond} present`);let d=0,i=css.indexOf('{',at);const start=i+1;for(;i<css.length;i++){if(css[i]==='{')d++;else if(css[i]==='}'&&--d===0)break;}return css.slice(start,i);}

test('GM embed: title, centred coins, then the form, then Adjust Purse and the caption, in that order',async()=>{
 await set('stashEnabled',true);await set('electrumEnabled',false);
 const {html,view}=await mounted(gm);const p=purseOf(html);
 const at=s=>{const i=p.indexOf(s);assert.ok(i>=0,`${s} present`);return i;};
 assert.ok(p.startsWith('<h3 class="agu-purse__title">Party purse</h3><div class="agu-coins">'),'title, then the coin row');
 assert.ok(at('class="agu-coins"')<at('class="agu-purse-move"')&&at('class="agu-purse-move"')<at('class="agu-purse-tools"')&&at('class="agu-purse-tools"')<at('class="agu-note agu-purse-caption"'));
 assert.match(p,/<div class="agu-purse-move" role="group" aria-label="Deposit or take coins"><label class="ag-field agu-purse-who">Character<select id="agu-purse-actor">[\s\S]*?<\/select><\/label><label class="ag-field agu-purse-coin">Coin<select id="agu-purse-coin">[\s\S]*?<\/select><\/label><label class="ag-field agu-purse-amount">Amount<input type="number" id="agu-purse-amount" min="1" step="1" value="" inputmode="numeric"><\/label><div class="agu-actions agu-purse-buttons"><button[^>]*data-action="purse-deposit" data-purse-move="deposit">Deposit<\/button><button[^>]*data-action="purse-take" data-purse-move="take">Take<\/button><\/div><\/div>/,'Deposit and Take adjacent, last in the form');
 // Tab order follows the markup: Character, Coin, Amount, Deposit, Take, then Adjust Purse.
 assert.deepEqual([...p.matchAll(/id="(agu-purse-\w+)"|data-action="(purse-[\w-]+)"/g)].map(m=>m[1]??m[2]),['agu-purse-actor','agu-purse-coin','agu-purse-amount','purse-deposit','purse-take','purse-adjust']);
 assert.match(p,/<div class="agu-purse-tools"><button[^>]*data-action="purse-adjust"[^>]*>Adjust Purse<\/button><\/div>/);
 assert.match(p,/<p class="agu-note agu-purse-caption">Coin vote: (on|off) \(change it in GM Setup\)\.<\/p>$/);
 assert.deepEqual([...p.matchAll(/<option value="(\w+)"\s*(?:selected)?>(Copper|Silver|Gold|Platinum|Electrum)</g)].map(m=>m[2]),['Copper','Silver','Gold','Platinum'],'Coin select shows full names');
 assert.equal((html.match(/id="agu-purse-amount"/g)??[]).length,1,'one form');
 assert.doesNotMatch(html,/agu-purse-head|class="agu-line/,'no loose heading row any more');
 view.unmount();
 await set('electrumEnabled',true);
 const on=await mounted(gm);assert.match(purseOf(on.html),/<option value="ep"\s*>Electrum<\/option>/);on.view.unmount();await set('electrumEnabled',false);
 stash.system.currency.ep=4;
 const stranded=await mounted(gm);assert.match(purseOf(stranded.html),/<div class="agu-purse-tools"><button[^>]*data-action="purse-convert"[^>]*>Convert electrum to silver\/gold<\/button><button[^>]*data-action="purse-adjust"/,'Convert sits beside Adjust Purse');
 stranded.view.unmount();stash.system.currency.ep=0;
});

test('player embed: the same card with their own character, no GM tools, their note as the caption',async()=>{
 await set('playerAccessEnabled',true);await set('stashEnabled',true);
 const {html,view}=await mounted(alice);const p=purseOf(html);
 assert.match(p,/<option value="wren" selected>\[TEST\] Wren \(3 gp\)<\/option>/);
 assert.doesNotMatch(p,/agu-purse-tools|Adjust Purse/);
 assert.match(p,/<\/div><\/div><p class="agu-note agu-purse-caption">Deposit moves coins from your character to the purse[^<]*<\/p>$/);
 view.unmount();
});

test('stash toolbar: search, Take into, count and Add to stash… keep their ids, in a grid the CSS lays out',async()=>{
 const {html,view}=await mounted(gm);
 assert.match(html,/<div class="ag-toolbar agu-stash-tools"><label class="ag-search">[\s\S]*?id="agu-stash-search"[\s\S]*?<div class="ag-toolbar__filters"><label class="ag-field ag-field--inline agu-take-into">Take into<select id="agu-stash-target">[\s\S]*?<span class="ag-toolbar__count">[^<]*<\/span><div class="ag-toolbar__end"><button[^>]*data-action="stash-add"/);
 view.unmount();
});

test('CSS: the embed and the purse are size containers; no viewport media queries for the layout',()=>{
 assert.match(css,/\.agu-embed \{[^}]*container-type:inline-size;/);
 assert.match(css,/\.ag-utilities \.agu-purse \{display:flex;flex-wrap:wrap;[^}]*container:agu-purse\/inline-size;/);
 assert.doesNotMatch(css,/@media[^{]*width/);
 // Title line: the title never wraps and grows; the GM tools follow it (dropping under it, left-aligned, only when they can't fit).
 assert.match(css,/\.agu-purse > \.agu-purse__title \{order:1;flex:1 0 auto;white-space:nowrap;\}/);
 assert.match(css,/\.agu-purse > \.agu-purse-tools \{order:2;flex:0 1 auto;[^}]*justify-content:flex-start;/);
 assert.match(css,/\.agu-purse > \.agu-coins \{order:3;justify-content:center;\}/);
 assert.match(css,/\.agu-purse > \.agu-purse-move \{order:5;\}/);
 assert.match(css,/\.agu-purse > \.agu-purse-caption \{order:6;text-align:center;/);
 // Medium (the default): Character on its own line, then Coin, Amount and the two buttons, centred.
 assert.match(css,/\.agu-purse-move \{display:grid;grid-template-columns:repeat\(3,max-content\);justify-content:center;align-items:end;/);
 assert.match(css,/\.agu-purse-move > \.agu-purse-who \{grid-column:1 \/ -1;\}/);
 assert.match(css,/\.agu-purse-move \.agu-purse-buttons \{display:grid;grid-template-columns:1fr 1fr;/,'Deposit and Take always equal width');
 assert.match(css,/\.agu-purse-move :is\(select,input,\.ag-btn\) \{box-sizing:border-box;height:var\(--ag-control-h\) !important;min-height:var\(--ag-control-h\);/,'one control height');
 assert.match(css,/#agu-purse-amount \{width:calc\(9ch \+ 2 \* var\(--ag-space-3\)\);\}/,'room for 6 digits');
});

test('CSS: wide and narrow purse forms and the toolbar layouts are container queries',()=>{
 const wide=containerBlock('agu-purse (min-width:33rem)');
 assert.match(wide,/\.agu-purse-move \{grid-template-columns:minmax\(8.5rem,16rem\) repeat\(3,max-content\);\}/,'one line');
 assert.match(wide,/\.agu-purse-who \{grid-column:auto;\}/);
 const narrow=containerBlock('agu-purse (max-width:24.99rem)');
 assert.match(narrow,/\.agu-purse-move \{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);justify-content:stretch;\}/,'Coin and Amount side by side');
 assert.match(narrow,/\.agu-purse-buttons \{grid-column:1 \/ -1;\}/,'Deposit and Take share the last line');
 assert.match(css,/\.agu-stash-tools \{display:grid;[^}]*grid-template-areas:"search search search" "take count add";/);
 assert.match(containerBlock('(min-width:36rem)'),/\.agu-stash-tools \{[^}]*grid-template-areas:"search take count add";\}/);
 assert.match(containerBlock('(max-width:23.99rem)'),/\.agu-stash-tools \{[^}]*grid-template-areas:"search search" "take take" "count add";\}/);
 assert.match(css,/\.agu-stash-tools > \.ag-toolbar__end \{grid-area:add;margin:0;justify-self:end;\}/,'Add to stash… ends its line');
 console.error=origError;
});
