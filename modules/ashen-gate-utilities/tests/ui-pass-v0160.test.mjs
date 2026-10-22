// 0.16.0 UI pass: header order, kit buttons and tabs, tooltips, labels, empty states, GM Setup footer and D4
// (Player Access saves only with Save Changes). Mocked Foundry globals; proves the markup and wiring, not the live look.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ID} from '../scripts/core.mjs';

const handlers={once:new Map(),on:new Map()};
let seen=null,answer='cancel';
globalThis.HTMLElement=class {};
globalThis.foundry={applications:{api:{
 ApplicationV2:class{constructor(options={}){this.options=options;this.rendered=false;this.renders=0;}async render(){this.rendered=true;this.renders++;return this;}async close(){this.rendered=false;}},
 DialogV2:{prompt:async o=>{seen=o;},wait:async o=>{seen=o;return o.buttons.find(b=>b.action===answer).callback();}}
}}};
const gm={id:'gm',name:'GM',isGM:true,active:true};
const alice={id:'alice',name:'Alice',isGM:false,active:true};
const settings=new Map();
const actors=[];actors.get=id=>actors.find(a=>a.id===id);actors.find=Array.prototype.find.bind(actors);
const users=[gm,alice];users.get=id=>users.find(u=>u.id===id);
const modules=new Map([[ID,{id:ID,version:'9.9.9-test',api:{},active:true}]]);
globalThis.game={user:gm,users,actors,tables:[],messages:new Map(),i18n:{localize:x=>x},modules,
 settings:{register:(ns,key,opts)=>settings.set(`${ns}.${key}`,{value:opts.default,onChange:opts.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}}};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[]};
globalThis.ui={actors:null,notifications:{info:()=>{},warn:()=>{},error:()=>{}}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>{handlers.on.set(k,fn);return 1;},off:()=>{}};
globalThis.ChatMessage={create:async m=>m,getSpeaker:()=>({})};
await import('../scripts/main.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=()=>game.modules.get(ID).api;
const src=fs.readFileSync(new URL('../scripts/main.mjs',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../styles/utilities.css',import.meta.url),'utf8');
/** A fake window root: GM Setup checkboxes by id. */
const setupRoot=checked=>({querySelector:q=>{const id=q.replace(/^#/,'');return id in checked?{checked:checked[id]}:null;}});
const tabHtml=async(tab,user=gm)=>{game.user=user;try{const app=await api().open();app.tab=tab;if(tab==='rolls')app.rollsSub='current';return await app._renderHTML();}finally{game.user=gm;}};

test('header: brand title, then Appearance, version (from module.json at runtime), Help last',async()=>{
 modules.set('ashen-gate-manager',{active:true,api:{appearance:{openMyAppearance:()=>{}}}});
 try{
  const html=await tabHtml('rolls');
  assert.match(html,/<h1><span class="ag-header__brand">Ashen Gate<\/span> \| Utilities<\/h1>/);
  const meta=html.slice(html.indexOf('ag-header__meta'),html.indexOf('</header>'));
  const order=['data-open-appearance','class="ag-version">v9.9.9-test<','data-action="help"'].map(s=>meta.indexOf(s));
  assert.ok(order.every(i=>i>=0)&&order[0]<order[1]&&order[1]<order[2],String(order));
  assert.doesNotMatch(css,/agu-header \.ag-header__meta button/,'no header button shrink override');
 }finally{modules.delete('ashen-gate-manager');}
});
test('tabs: role="tab" with aria-selected, icons hidden from screen readers, GM tabs marked .ag-tab--gm (0.26.0: six tabs; History is Rolls → History, Roll Tables is GM only)',async()=>{
 const html=await tabHtml('setup');
 assert.match(html,/<nav class="ag-tabs ag-tabs--scroll agu-tabs" role="tablist"/);
 const tabs=[...html.matchAll(/<button type="button" role="tab" id="agu-tab-([a-z]+)" data-tab="\1" aria-controls="agu-main-panel" aria-selected="(true|false)" tabindex="(?:0|-1)" class="([^"]*)"><i class="fa-solid [a-z0-9-]+" aria-hidden="true"><\/i>/g)];
 assert.deepEqual(tabs.map(t=>t[1]),['rolls','inventory','shops','conditions','tables','setup']);
 assert.deepEqual(tabs.filter(t=>t[3].includes('ag-tab--gm')).map(t=>t[1]),['shops','tables','setup']);
 assert.match(html,/<main class="agu-main" id="agu-main-panel" role="tabpanel" aria-labelledby="agu-tab-setup">/);
 assert.deepEqual(tabs.filter(t=>t[2]==='true').map(t=>t[1]),['setup']);
 await game.settings.set(ID,'playerAccessEnabled',true);
 const player=await tabHtml('rolls',{...alice});
 assert.doesNotMatch(player,/ag-tab--gm|data-tab="setup"|data-tab="shops"|data-tab="tables"/,'0.26.0: no Roll Tables tab for players');
});
test('buttons use kit classes only; Award Gold is one button everywhere; no title= tooltips',async()=>{
 await game.settings.set(ID,'playerAccessEnabled',true);
 for(const tab of ['rolls','inventory','shops','tables','conditions','history','setup']){
  const html=await tabHtml(tab);
  for(const [,cls] of html.matchAll(/<button type="button" class="([^"]*)" data-action=/g)){
   assert.match(cls,/^(ag-btn( ag-btn--(primary|danger|ghost|sm))*( agu-[a-z-]+)?|ag-link)$/,`${tab}: ${cls}`);
  }
  assert.doesNotMatch(html,/\stitle=/,`${tab} has a title= attribute`);
  assert.ok((html.match(/ag-btn--primary/g)??[]).length<=1,`${tab}: at most one primary`);
 }
 assert.equal((src.match(/btn\('gold-award'/g)??[]).length,1,'every Award Gold goes through awardGoldBtn()');
 assert.doesNotMatch(src,/<button\b[^>]*\stitle=/,'no button title= in the source');
 assert.match(src,/class="agu-ov-x"[^>]*\$\{tip\(`Remove[^>]*aria-label="Remove/,'overlay remove button: tooltip and aria-label');
 assert.doesNotMatch(src,/×<\/button>/,'no Unicode glyph icons');
});
test('labels: every label is a kit field; no global label rule; empty states have a title',async()=>{
 assert.doesNotMatch(css,/\.ag-utilities label\s*\{/);
 for(const tab of ['rolls','tables','conditions','history','setup']){
  const html=await tabHtml(tab);
  for(const [tag] of html.matchAll(/<label\b[^>]*>/g))assert.match(tag,/class="ag-field/,`${tab}: ${tag}`);
  for(const [block] of html.matchAll(/<div class="ag-empty">.*?<\/div>/g))assert.match(block,/<p class="ag-empty__title">[^<]+<\/p>/,`${tab}: ${block}`);
 }
 const rolls=await tabHtml('rolls');assert.match(rolls,/<p class="ag-field__hint">No characters yet\. Add at least two characters to start a check\.<\/p>/,'0.26.0: a hint inside the form, not a whole-pane empty state');
 const player=await tabHtml('rolls',{...alice});assert.doesNotMatch(player,/Start Rolls|GM Setup/);
});
test('GM Setup: settings only, Cancel bottom-left and Save Changes bottom-right in the footer',async()=>{
 const html=await tabHtml('setup');
 const main=html.slice(html.indexOf('<main'),html.indexOf('</main>'));
 assert.doesNotMatch(main,/data-action=/,'no buttons inside GM Setup itself');
 const footer=html.slice(html.indexOf('<footer'),html.indexOf('</footer>'));
 const order=['data-action="setup-cancel"','class="ag-footer__status"','data-action="save-access"'].map(s=>footer.indexOf(s));
 assert.ok(order.every(i=>i>=0)&&order[0]<order[1]&&order[1]<order[2],String(order));
 assert.match(footer,/class="ag-btn ag-btn--ghost" data-action="setup-cancel"/);
 assert.match(footer,/class="ag-btn ag-btn--primary" data-action="save-access"/);
 const other=await tabHtml('rolls');assert.doesNotMatch(other,/save-access|setup-cancel/);
});
test('D4: Player Access saves only with Save Changes; ticking the box or Cancel changes nothing',async()=>{
 await game.settings.set(ID,'playerAccessEnabled',false);
 const app=await api().open();app.tab='setup';
 const html=await app._renderHTML();
 assert.match(html,/<input id="agu-access" type="checkbox" data-setup-field >Player Access<\/label>/);
 // Ticking the box is only a form change: nothing is written until Save Changes.
 assert.equal(game.settings.get(ID,'playerAccessEnabled'),false);
 const before=app.renders;
 await app.handle('setup-cancel',{disabled:false},setupRoot({'agu-access':true}));
 assert.equal(game.settings.get(ID,'playerAccessEnabled'),false,'Cancel discards');
 assert.equal(app.renders,before+1,'Cancel re-renders the saved values');
 await app.handle('save-access',{disabled:false},setupRoot({'agu-access':true}));
 assert.equal(game.settings.get(ID,'playerAccessEnabled'),true,'Save Changes writes it');
 assert.equal(app.setupStatus,'Saved');
 await app.handle('save-access',{disabled:false},setupRoot({'agu-access':false}));
 assert.equal(game.settings.get(ID,'playerAccessEnabled'),false,'same setting key, both ways');
 game.user={...alice};try{await assert.rejects(app.handle('save-access',{disabled:false},setupRoot({'agu-access':true})),/GM only/);}finally{game.user=gm;}
 assert.equal(game.settings.get(ID,'playerAccessEnabled'),false,'players cannot save GM Setup');
});
test('Cancel Session asks first, labelled, and Cancel keeps the check running',async()=>{
 const {createSession}=await import('../scripts/core.mjs');
 const s=createSession({id:'ui-c',name:'[TEST] Climb',kind:'group',actors:['pc1'],skills:['ath'],createdBy:'gm',dc:10});
 await game.settings.set(ID,'activeSession',s);
 const app=await api().open();answer='cancel';seen=null;
 await app.handle('cancel',{disabled:false,dataset:{}},{});
 assert.deepEqual(seen.buttons.map(b=>b.label),['Keep going','Cancel interaction']);
 assert.equal(game.settings.get(ID,'activeSession').status,'active');
 await game.settings.set(ID,'activeSession',{});
});
test('CSS: tokens only, container queries, one roll-large rule; 0.26.0: kit rows and tables, no hand-rolled copies',()=>{
 const code=css.replace(/\/\*[\s\S]*?\*\//g,'');
 assert.doesNotMatch(code,/font-size\s*:\s*[\d.]+(px|rem|em)/);
 assert.doesNotMatch(code,/@media[^{]*width/);
 assert.doesNotMatch(code,/var\(--ag-(bg|panel)\)/);
 assert.equal((code.match(/\.agu-roll-large\s*\{/g)??[]).length,1);
 assert.doesNotMatch(code,/\.agu-(participant|history|stash-grid|stash-head|subtabs|shop-subtabs)\b/,'UT-12/13: rows and tables come from the kit');
 assert.match(code,/@container \(max-width:35rem\)/,'stash keeps its container query');
});
