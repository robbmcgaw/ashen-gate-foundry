// 0.26.0 UI cleanup (audit PL-02..PL-13): Gathering and GM Setup sub-tabs, request cards, the node editor in place of the
// list, the "GM: XP" fold, kit file buttons and danger confirmations. Mocked Foundry: logic and markup only, not the live UI.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
const hooks={},errors=[],values={partyRoster:['a'],playerAccessEnabled:true,libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]}};
let moduleApi=null;const prompts=[];let answer=false;
const gm={id:'gm',isGM:true,name:'GM',active:true},player={id:'u1',isGM:false,name:'Player',active:false};
const src=(id,type)=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility:'player',status:'approved',version:'0.1.0',refs:[],
  definition:{id,entity_type:type,name:'[TEST] Alchemy'}}}});
const prof={id:'p1',name:'[TEST] Alchemy — Profession',type:'feat',system:{quantity:1,description:{value:''}},flags:src('PROF-TEST-ALCHEMY','Profession')};
const actors=[{id:'a',name:'[TEST] Alpha',type:'character',hasPlayerOwner:true,items:[prof],flags:{},testUserPermission:(u,role)=>u.isGM||u.id==='u1'||role==='LIMITED'}];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
class FakeApp{constructor(options={}){this.options=options;}async _prepareContext(){return {};}render(){this.rendered=true;return this;}async close(){this.closed=true;return this;}}
globalThis.document={documentElement:{dataset:{}}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApp,HandlebarsApplicationMixin:x=>x,
  DialogV2:{wait:async opts=>{prompts.push(opts);const b=opts.buttons?.find(x=>x.action===(answer?'confirm':'cancel'));return b?.callback?.()??answer;},prompt:async opts=>{prompts.push(opts);}}}},utils:{escapeHTML:esc}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:()=>{}};
globalThis.ui={notifications:{info:()=>{},error:x=>errors.push(x)}};
const moduleObj={get api(){return moduleApi},set api(v){moduleApi=v},active:true,version:'0.37.12'};
globalThis.game={user:gm,users:{contents:[gm,player]},actors:{contents:actors,get:id=>actors.find(a=>a.id===id)},items:{contents:[]},
  modules:{get:id=>id==='ashen-gate-profession-ledger'?moduleObj:undefined},
  settings:{register:()=>{},registerMenu:()=>{},get:(id,key)=>values[key],set:async(id,key,v)=>{values[key]=v;}}};
const {_test}=await import(pathToFileURL(path.resolve(here,'../scripts/main.js')));hooks.init();hooks.ready();
const app=moduleApi.open({view:'gm'});
app.element={querySelectorAll:()=>[],querySelector:()=>null};
const html=async view=>{app.view=view;return (await app._prepareContext({})).html;};
const main=h=>h.slice(h.indexOf('<main'),h.indexOf('</main>'));
const request={requestId:'r1',requesterId:'u1',requesterName:'Player',actorId:'a',actorName:'[TEST] Alpha',helperIds:[],at:1,draft:false,
  node:{id:'n1',key:'loc|n1',label:'[TEST] Reed bank',skill:'Herbalism',tier:1,dc:12,materialId:'MAT-TEST-REED',quantity:2,rareQuantity:1,locationId:'loc',locationName:'[TEST] Marsh'}};

test('PL-02: GM Gathering has Requests (n) · Gather · Gathering nodes, and opens on Requests when one waits',async()=>{
  let h=main(await html('gathering'));
  assert.match(h,/<div class="ag-tabs ag-tabs--sub" role="tablist" aria-label="Gathering">/);
  assert.match(h,/data-tab="requests"[^>]*aria-selected="false"[^>]*>Requests <span class="ag-tab__count">0<\/span>.*data-tab="start"[^>]*aria-selected="true"[^>]*>Gather<.*data-tab="nodes"[^>]*>Gathering nodes</s);
  assert.doesNotMatch(h,/Active checks/,'0.34.0: the open gather lives in Gather, not its own sub-tab');
  assert.match(h,/id="agl-gather-panel-requests"[^>]*hidden><div class="ag-empty"><p class="ag-empty__title">No gathering requests waiting\./,'empty Requests panel is still there');
  assert.match(h,/id="agl-gather-panel-start" role="tabpanel"[^>]*tabindex="0"><section class="ag-card agl-panel"><h2>Gather<\/h2>/);
  assert.match(h,/data-action="gather-start" disabled><i class="fa-solid fa-seedling" aria-hidden="true"><\/i> Start gather…</,'one primary: Start gather…');
  assert.doesNotMatch(h,/Lead gatherer|Helpers|data-gather-helper/,'no lead gatherer');
  // Short draft label, explanation as a field hint.
  assert.match(h,/data-gather-allow-draft aria-describedby="agl-allow-draft-hint" > Use draft materials anyway<\/label>\s*<p class="ag-field__hint" id="agl-allow-draft-hint">GM only:/);
  // A request waiting: entering the Gathering tab opens on Requests, with its count.
  _test.gatherRequests.set('r1',request);
  app.view='individual';await app._click('tab','gathering');
  h=main(await html('gathering'));
  assert.equal(app.gatherTab,'requests');
  assert.match(h,/data-tab="requests"[^>]*aria-selected="true"[^>]*>Requests <span class="ag-tab__count">1<\/span>/);
  assert.match(h,/id="agl-gather-panel-start"[^>]*hidden>/,'Gather no longer sits under the queue');
  _test.gatherRequests.clear();
});

test('PL-06: each request is a kit card; reason above, Decline (ghost) left, Approve (primary) right',async()=>{
  _test.gatherRequests.set('r1',request);app.gatherTab='requests';
  const h=main(await html('gathering'));
  assert.match(h,/<article class="ag-card ag-card--compact agl-request" data-request="r1">/);
  assert.doesNotMatch(h,/<ul class="agl-request-list">/);
  assert.match(h,/<label class="ag-field">Reason for declining \(optional, sent to the player\)<input[^>]*data-gather-decline-reason="r1"><\/label>\s*<div class="agl-editor-actions"><button type="button" class="ag-btn ag-btn--ghost" data-action="gather-decline" data-id="r1">.*Decline<\/button>\s*<button type="button" class="ag-btn ag-btn--primary" data-action="gather-approve" data-id="r1">/s);
  _test.gatherRequests.clear();app.gatherTab=null;
});

test('PL-04: GM Setup sub-tabs share one footer; every panel is rendered so a switch never drops a draft',async()=>{
  app.gmTab=null;
  const h=await html('gm');
  const m=main(h);
  for(const [id,label] of [['party','Party'],['tools','Tools and checks'],['gather','Gathering &amp; crafting'],['access','Player Access']])
    assert.match(m,new RegExp(`id="agl-gm-setup-tab-${id}" data-tab="${id}"[^>]*>${label}</button>`));
  assert.match(m,/id="agl-gm-setup-panel-party" role="tabpanel"[^>]*tabindex="0"><section class="ag-card agl-panel agl-roster">/,'Party first by default');
  for(const id of ['tools','gather','access'])assert.match(m,new RegExp(`id="agl-gm-setup-panel-${id}"[^>]*hidden>`));
  assert.match(m,/data-player-access/);assert.match(m,/data-exotic-chance/);assert.match(m,/data-core-award/);assert.match(m,/data-roster-actor="a"/);
  assert.equal((h.match(/data-action="roster-save"/g)??[]).length,1,'one Save Changes for all of them');
  assert.match(m,/<details class="ag-fold" data-ag-fold-key="baseline"><summary class="ag-fold__summary"><span class="ag-fold__title">Baseline file<\/span>/);
  assert.match(m,/<span class="ag-file" data-agl-file="baseline"><button type="button" class="ag-btn" data-ag-file-button>/,'keyboard-reachable file button');
  assert.doesNotMatch(h,/type="file"[^>]*\shidden[\s>]|id="agl-(xwalk-|node-)?file"/,'no display:none file inputs');
  // A remembered sub-tab is used next time.
  app.gmTab='access';assert.match(main(await html('gm')),/id="agl-gm-setup-panel-access" role="tabpanel"[^>]*tabindex="0"><section/);
  app.gmTab=null;
});

test('PL-11: Apply baseline is the primary action of its preview; Cancel left',async()=>{
  app.baselinePreview={fileName:'[TEST] baseline.json',data:{},result:{ok:true,errors:[],unknownProfessions:[],unresolved:[],changes:[]}};
  const h=main(await html('gm'));
  assert.match(h,/<div class="agl-editor-actions"><button type="button" class="ag-btn ag-btn--ghost" data-action="xwalk-cancel">Cancel<\/button><button type="button" class="ag-btn ag-btn--primary" data-action="xwalk-apply">/);
  app.baselinePreview=null;
});

test('PL-13: Cancel discards GM Setup drafts and stays on GM Setup; the discard question defaults to Keep editing',async()=>{
  app.view='gm';app.accessDraft=false;answer=true;prompts.length=0;
  await app._click('gm-cancel');
  assert.equal(app.view,'gm');assert.equal(app.accessDraft,null);
  assert.equal(prompts[0].window.title,'Discard unsaved changes?');
  assert.deepEqual(prompts[0].buttons.map(b=>[b.label,b.default]),[['Keep editing',true],['Discard changes',false]]);
  answer=false;
});

test('PL-07/PL-08: one "GM: XP" fold per profession card (Award / Adjust switch, history); the XP meter has a name',async()=>{
  const h=main(await html('individual'));
  assert.match(h,/<span class="ag-meter__track" role="progressbar" aria-label="\[TEST\] Alchemy XP" aria-valuemin="0" aria-valuemax="100"/);
  assert.doesNotMatch(h,/agl-xpbar|agl-xp-adjust/);
  assert.equal((h.match(/<span class="ag-fold__title">GM: XP<\/span>/g)??[]).length,1);
  assert.match(h,/<div class="ag-segmented" role="radiogroup" aria-label="\[TEST\] Alchemy XP change"><button type="button" role="radio" aria-checked="true" data-action="xp-mode" data-mode="award"/);
  assert.match(h,/data-xp-pane="award">.*data-action="award-xp"/s);assert.match(h,/data-xp-pane="adjust" hidden>.*data-action="adjust-xp"/s);
  game.user=player;
  const p=main(await html('individual'));
  assert.doesNotMatch(p,/GM: XP|data-action="award-xp"|data-action="adjust-xp"/,'players never get the GM controls');
  assert.match(p,/role="progressbar" aria-label="\[TEST\] Alchemy XP"/);
  game.user=gm;
});

test('PL-07: the Award / Adjust switch only flips the panes in its own card (no save, no re-render)',()=>{
  const el=(data,extra={})=>({dataset:data,attrs:{},hidden:false,setAttribute(k,v){this.attrs[k]=v;},...extra});
  const award=el({action:'xp-mode',mode:'award',key:'a:PROF-TEST-ALCHEMY'}),adjust=el({action:'xp-mode',mode:'adjust',key:'a:PROF-TEST-ALCHEMY'});
  const paneA=el({xpPane:'award'}),paneB=el({xpPane:'adjust'});paneB.hidden=true;
  const fold={querySelectorAll:s=>s.includes('xp-mode')?[award,adjust]:[paneA,paneB]};
  adjust.closest=()=>fold;
  const before=app.rendered;app.rendered=false;
  _test.xpModeClick(adjust);
  assert.equal(adjust.attrs['aria-checked'],'true');assert.equal(award.attrs['aria-checked'],'false');
  assert.equal(paneA.hidden,true);assert.equal(paneB.hidden,false);assert.equal(app.rendered,false);
  assert.equal(_test.xpModeClick({dataset:{action:'award-xp'}}),false,'other actions pass through');
  app.rendered=before;
});

test('PL-09: "Open <name>’s view" is in the folder body, not inside <summary>',async()=>{
  app.partySort='player';
  const h=main(await html('party'));
  assert.match(h,/<\/summary>\s*<div class="agl-folder-body"><div class="ag-btn-group agl-folder-actions"><button[^>]*data-action="open-individual"/);
  assert.doesNotMatch(h,/<summary>[^]*?data-action="open-individual"[^]*?<\/summary>/);
});

test('PL-10: top tabs have ids and aria-controls; the panel is labelled by the current tab',async()=>{
  const h=await html('catalog');
  assert.match(h,/id="agl-tab-catalog" aria-controls="agl-panel"[^>]*aria-selected="true" tabindex="0">Recipe Catalog/);
  assert.match(h,/id="agl-tab-party" aria-controls="agl-panel"[^>]*tabindex="-1">/);
  assert.match(h,/<main class="agl-main" id="agl-panel" role="tabpanel" aria-labelledby="agl-tab-catalog"/);
});

test('PL-03: the node editor opens in place of the list, asks before Cancel drops edits, and returns to the list',async()=>{
  await html('nodes');
  const main0={scrollTop:420};
  app.element={querySelector:s=>s==='.agl-main'?main0:null,querySelectorAll:()=>[]};
  await app._click('node-new');
  assert.ok(app.nodeDraft);assert.equal(app._returnTo,null,'the editor starts at its top (a new screen)');assert.equal(app._screen(),'nodes:editor');
  const h=await html('nodes');
  assert.match(h,/<div class="ag-toolbar agl-toolbar"><button type="button" class="ag-link" data-action="node-cancel"><i class="fa-solid fa-arrow-left" aria-hidden="true"><\/i> All nodes<\/button><\/div>/);
  assert.doesNotMatch(h,/data-action="node-new"/,'no list (and no list toolbar) while editing');
  // Unsaved edits: Cancel asks, Keep editing keeps the draft.
  app.nodeGuard.markDirty();answer=false;prompts.length=0;
  await app._click('node-cancel');
  assert.ok(app.nodeDraft,'Keep editing keeps the editor');assert.equal(prompts.length,1);
  assert.deepEqual(prompts[0].buttons.map(b=>[b.label,b.default]),[['Keep editing',true],['Discard changes',false]]);
  // Discard: back to the list where it was, focus on New node.
  answer=true;await app._click('node-cancel');
  assert.equal(app.nodeDraft,null);assert.equal(app.nodeGuard.dirty,false);
  assert.deepEqual(app._returnTo,{screen:'nodes:list',top:420,focus:'[data-action="node-new"]'},'the list scroll position and focus come back (0.26.2: see node-editor-return-v0262)');
  answer=false;app.element={querySelectorAll:()=>[],querySelector:()=>null};app._returnTo=null;
});

test('PL-03: closing the window over unsaved node edits asks first',async()=>{
  app.nodeDraft={isNew:true,errors:[],data:{}};app.nodeGuard.markDirty();answer=false;app.closed=false;
  await app.close();
  assert.equal(app.closed,false,'Keep editing keeps the window open');
  answer=true;await app.close();assert.equal(app.closed,true);
  app.nodeDraft=null;answer=false;
});

test('Danger confirmations make Cancel the default: delete node, undo XP award',()=>{
  const code=fs.readFileSync(path.resolve(here,'../scripts/main.js'),'utf8');
  assert.match(code,/confirmDanger\(lines\.join\('\\n'\),\{title:`Delete \$\{t\.name\}\?`,yes:'Delete node'\}\)/);
  assert.match(code,/confirmDanger\(`Take back/);
  assert.doesNotMatch(code,/danger:true/,'no confirmDialog(…, {danger:true}) left');
});

test('PL-12: an unavailable gathering spot is muted by colour on its title only, not by opacity',()=>{
  const css=fs.readFileSync(path.resolve(here,'../styles/ledger.css'),'utf8');
  assert.doesNotMatch(css,/\.agl-node\.is-off\{[^}]*opacity/);
  assert.match(css,/\.agl-node\.is-off strong\{color:var\(--ag-muted\)\}/);
});
