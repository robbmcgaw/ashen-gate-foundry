// 0.24.0 UI pass: Player Access saves with Save Changes (D4), Comfortable window size, kit parts and tooltips.
import assert from 'node:assert/strict';
import test from 'node:test';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
const hooks={},errors=[],values={partyRoster:['a'],playerAccessEnabled:true,libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]}};
const writes=[];let moduleApi=null;const prompts=[];let answer=false;
const gm={id:'gm',isGM:true,name:'GM'},player={id:'u1',isGM:false,name:'Player'};
const actors=[{id:'a',name:'[TEST] Alpha',type:'character',hasPlayerOwner:true,items:[],testUserPermission:()=>true}];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
class FakeApp{constructor(options={}){this.options=options;}async _prepareContext(){return {};}render(){this.rendered=true;return this;}}
globalThis.document={documentElement:{dataset:{agSize:'comfortable'}}};
globalThis.innerWidth=4000;globalThis.innerHeight=4000;
globalThis.foundry={applications:{api:{ApplicationV2:FakeApp,HandlebarsApplicationMixin:x=>x,
  DialogV2:{wait:async opts=>{prompts.push(opts);const b=opts.buttons?.find(x=>x.action===(answer?'confirm':'cancel'));return b?.callback?.()??answer;},prompt:async opts=>{prompts.push(opts);}}}},utils:{escapeHTML:esc}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:()=>{}};
globalThis.ui={notifications:{info:()=>{},error:x=>errors.push(x)}};
const moduleObj={get api(){return moduleApi},set api(v){moduleApi=v},active:true,version:'0.35.2'};
globalThis.game={user:gm,users:{contents:[gm,player]},actors:{contents:actors,get:id=>actors.find(a=>a.id===id)},items:{contents:[]},
  modules:{get:id=>id==='ashen-gate-profession-ledger'?moduleObj:undefined},
  settings:{register:()=>{},registerMenu:()=>{},get:(id,key)=>values[key],set:async(id,key,v)=>{writes.push(key);values[key]=v;}}};
const entry=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js');
await import(pathToFileURL(entry));hooks.init();hooks.ready();
const app=moduleApi.open({view:'gm'});
const saveButton={disabled:true},status={textContent:''};
app.element={querySelectorAll:()=>[],querySelector:s=>s==='[data-action="roster-save"]'?saveButton:s==='[data-agl-roster-status]'?status:null};
const html=async view=>{app.view=view;return (await app._prepareContext({})).html;};
/** The change listener _onRender would attach, fed one checkbox event. */
const tick=checked=>{app.accessDraft=checked;app._syncRosterActions();};

test('Comfortable size: the Ledger window opens 1.2× its Compact default',()=>{
  assert.deepEqual(app.options.position,{width:1416,height:960});
});

test('D4: Player Access is a GM Setup checkbox, not a toggle button that saves at once',async()=>{
  const h=await html('gm');
  assert.match(h,/<input type="checkbox" data-player-access checked> Players can open the Profession Ledger/);
  assert.doesNotMatch(h,/toggle-player-access|Hide from players|Show to players/);
  assert.match(h,/Saved with <b>Save Changes<\/b>/);
});

test('D4: unticking changes nothing until Save Changes; Save Changes writes the same setting key',async()=>{
  writes.length=0;
  tick(false);
  assert.equal(values.playerAccessEnabled,true,'not saved on change');assert.deepEqual(writes,[]);
  assert.equal(saveButton.disabled,false);assert.equal(status.textContent,'Unsaved Player Access change');
  assert.match(await html('gm'),/data-player-access >/,'the draft stays unticked on a re-draw');
  await app._click('roster-save');
  assert.equal(values.playerAccessEnabled,false);assert.deepEqual(writes,['playerAccessEnabled'],'only Player Access is written');
  assert.equal(app.accessDraft,null);assert.equal(app.accessDirty,false);
  assert.match(app.notice,/Player Access off/);
  values.playerAccessEnabled=true;
});

test('D4: Cancel asks first; Keep editing keeps the draft, Discard restores the saved value without writing',async()=>{
  writes.length=0;app.view='gm';tick(false);
  answer=false;prompts.length=0;
  await app._click('gm-cancel');
  assert.equal(prompts.length,1);assert.deepEqual(prompts[0].buttons.map(b=>b.label),['Keep editing','Discard changes']);
  assert.equal(app.view,'gm');assert.equal(app.accessDraft,false,'Keep editing keeps the change');
  answer=true;
  await app._click('gm-cancel');
  assert.equal(app.view,'gm','0.26.0 (PL-13): Cancel discards and stays on GM Setup');assert.equal(app.accessDraft,null);
  assert.equal(values.playerAccessEnabled,true);assert.deepEqual(writes,[],'nothing saved');
  assert.match(await html('gm'),/data-player-access checked/);
  answer=false;
});

test('D4: a player can never write Player Access through Save Changes',async()=>{
  game.user=player;app.accessDraft=false;
  await app._click('roster-save');
  assert.equal(values.playerAccessEnabled,true);assert.ok(errors.some(e=>/GM only/.test(e)));
  game.user=gm;app.accessDraft=null;
});

test('kit parts: tooltips instead of title=, a visible reason on the disabled Manager button, tables and segmented control',async()=>{
  for(const view of ['individual','party','catalog','gathering','assign','gm'])assert.doesNotMatch(await html(view),/\stitle="/,`${view}: no title= hover text`);
  const cat=await html('catalog');
  // 0.26.0 (PL-05): the Manager shortcut sits at the end of the toolbar; the GM notice says why it is disabled.
  assert.match(cat,/<div class="ag-toolbar__end"><button type="button" class="ag-btn ag-btn--sm" data-action="manager" disabled><i class="fa-solid fa-up-right-from-square" aria-hidden="true"><\/i> Open General Manager<\/button><\/div>/);
  assert.match(cat,/<b>General Manager is not installed or enabled\.<\/b>/);
  const gmHtml=await html('gm');
  assert.match(gmHtml,/<div class="ag-table-wrap agl-map-wrap"><table class="ag-table agl-map">/);
  assert.match(gmHtml,/<tr class="agl-map-group"><th colspan="4" scope="colgroup">Crafting professions/);
  assert.match(gmHtml,/class="ag-btn ag-btn--ghost" data-action="gm-cancel">Cancel<\/button><span class="ag-footer__status"[^>]*>[^<]*<\/span><button type="button" class="ag-btn ag-btn--primary" data-action="roster-save"/,'Cancel left, status, Save Changes right');
  assert.equal((gmHtml.match(/ag-btn--primary/g)??[]).length,1,'one primary in GM Setup');
  const party=await html('party');
  assert.match(party,/<div class="ag-segmented" role="radiogroup" aria-label="Sort recipes">\s*<button type="button" role="radio" aria-checked="true" data-action="party-sort" data-id="player">By player/);
  assert.match(party,/<label class="ag-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"><\/i><input type="search" data-agl-search/);
  app.partySort='player';
});

test('Assign: no characters to check is an empty state under the table, not a table row',async()=>{
  app.assignState={target:'party',preview:{actors:[],rows:[],unmapped:[],conflicts:[],unresolved:[]},selected:new Set()};
  const h=await html('assign');
  assert.doesNotMatch(h,/colspan="4">No characters/);
  assert.match(h,/<div class="ag-empty"><p class="ag-empty__title">No characters to check\.<\/p>/);
});
