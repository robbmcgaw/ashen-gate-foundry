import assert from 'node:assert/strict';
import test from 'node:test';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
const hooks={},errors=[],values={partyRoster:['a'],libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]}};
let moduleApi=null;let prompts=[],renderCount=0;
const gm={id:'gm',isGM:true,name:'GM'},player={id:'u1',isGM:false,name:'Player'};
const actors=[{id:'a',name:'Alpha',type:'character',hasPlayerOwner:true,items:[],testUserPermission:()=>true},
 {id:'b',name:'Bravo',type:'character',hasPlayerOwner:true,items:[],testUserPermission:()=>false}];
const aDict={contents:actors,get:id=>actors.find(a=>a.id===id)};
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){renderCount++;this.rendered=true;return this;}},HandlebarsApplicationMixin:x=>x,DialogV2:{confirm:async(opts)=>{prompts.push(opts);return false;}}}},utils:{escapeHTML:esc}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{}};
globalThis.ui={notifications:{info:()=>{},error:x=>errors.push(x)}};
const moduleObj={get api(){return moduleApi},set api(v){moduleApi=v},active:true};
globalThis.game={user:gm,users:{contents:[gm,player]},actors:aDict,items:{contents:[]},modules:{get:id=>id==='ashen-gate-profession-ledger'?moduleObj:undefined},settings:{register:()=>{},registerMenu:()=>{},get:(id,key)=>values[key],set:async(id,key,v)=>values[key]=v}};
const entry=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js');
await import(pathToFileURL(entry));hooks.init();hooks.ready();
const app=moduleApi.open({view:'gm'});
const twoInputs=[{dataset:{rosterActor:'a'},checked:true},{dataset:{rosterActor:'b'},checked:false}];
const saveButton={disabled:true};const stateText={textContent:''};
app.element={querySelectorAll:s=>s==='[data-roster-actor]'||s==='[data-roster-actor]:checked'?twoInputs.filter(x=>s==='[data-roster-actor]'||x.checked):[],
 querySelector:s=>s==='[data-action="roster-save"]'?saveButton:s==='[data-agl-roster-status]'?stateText:null};

test('GM Setup owns roster, access and tool mapping only; standard header/footer',async()=>{
 const html=(await app._prepareContext({})).html;
 assert.match(html,/Ashen Gate \| <strong>Profession Ledger/);
 assert.match(html,/v0\.23\.0/);
 assert.match(html,/data-id="gm"/);
 assert.match(html,/data-action="help"/);
 assert.match(html,/data-action="roster-save"/);
 assert.doesNotMatch(html,/data-action="demo"/);
 assert.doesNotMatch(html,/Developer Tools — experimental/);
 assert.match(html,/data-action="roster-save"/);
 assert.doesNotMatch((await (app.view='party',app._prepareContext({}))).html,/data-action="demo"|data-action="import"|data-action="manager"/);
});

test('Recipe Catalog tab: GM gets Catalog tools (import, Manager), players do not',async()=>{
 app.view='catalog';
 let html=(await app._prepareContext({})).html;
 assert.match(html,/Catalog tools/);
 assert.match(html,/data-action="import"/);
 assert.match(html,/data-action="manager" disabled/,'Missing optional Manager has truthful disabled button');
 game.user=player;app.view='catalog';
 html=(await app._prepareContext({})).html;
 assert.doesNotMatch(html,/Catalog tools|data-action="import"|data-action="manager"|data-id="gm"/);
 game.user=gm;
});

test('editing roster is explicit; cancelled navigation retains changes',async()=>{
 app.view='gm';twoInputs[1].checked=true;app._rememberRosterDraft();
 assert.equal(app.rosterDirty,true);
 assert.equal(saveButton.disabled,false);
 assert.equal(stateText.textContent,'Unsaved party changes');
 await app._click('tab','party');
 assert.equal(app.view,'gm');
 assert.equal(app.rosterDirty,true);
 assert.equal(prompts.length,1);
 assert.deepEqual(values.partyRoster,['a']);
 assert.match(prompts[0].window.title,/Discard/);
});

test('confirmed roster save preserves world IDs and leaves other catalog state alone',async()=>{
 twoInputs[1].checked=true;
 await app._click('roster-save');
 assert.deepEqual(values.partyRoster,['a','b']);
 assert.equal(app.rosterDirty,false);
 assert.deepEqual(values.libraryData.recipes,[]);
 assert.equal(app.view,'gm');
});

test('navigation back from GM Setup does not discard saved roster; Help returns to prior view',async()=>{
 await app._click('tab','catalog');assert.equal(app.view,'catalog');
 await app._click('help');assert.equal(app.view,'help');
 assert.match((await app._prepareContext({})).html,/Profession Ledger Help/);
 await app._click('help-back');assert.equal(app.view,'catalog');
});

test('player cannot force GM Setup through UI or public API, and never sees secret controls',async()=>{
 game.user=player;
 moduleApi.open({view:'gm',demo:true});
 assert.equal(app.view,'individual');assert.equal(app.demo,false);
 const playerHtml=(await app._prepareContext({})).html;
 assert.doesNotMatch(playerHtml,/data-id="gm"|data-action="import"|Developer Tools|data-action="roster-save"/);
 await app._click('tab','gm');assert.equal(app.view,'individual');
 app.view='roster';assert.doesNotMatch((await app._prepareContext({})).html,/data-roster-actor/);
 assert.ok(errors.some(e=>String(e).includes('GM only')));
});
