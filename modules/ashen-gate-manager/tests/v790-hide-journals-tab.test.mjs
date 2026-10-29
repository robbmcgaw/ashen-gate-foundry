// 0.79.0 Hide the Journals tab from players: world setting (GM only, off by default); the hide logic runs for players only.
// Mocked Foundry: proves logic and wiring, not the live V14 sidebar DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAppearanceController,registerAppearanceSettings,HIDE_JOURNALS_KEY,DEFAULT_HIDE_JOURNALS} from '../scripts/appearance.js';
import {readGmSetupForm,saveGmSetup} from '../scripts/gm-setup.js';
import {journalTabElements,shouldHideJournalTab,setJournalTabHidden,leaveJournalTab,applyJournalTabSetting,installJournalTabHider,HIDDEN_CLASS} from '../scripts/journal-tab.js';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
function ctl({isGM=true,value}={}){
  const store=new Map(value===undefined?[]:[[HIDE_JOURNALS_KEY,value]]),writes=[];
  const c=createAppearanceController({currentUser:()=>({id:'u',isGM}),
    getSetting:k=>k==='worldSkin'?'ag-default':store.get(k),
    setSetting:async(k,v)=>{writes.push([k,v]);store.set(k,v);}});
  return {c,writes};
}
function dom(){
  const mk=(tab)=>({hidden:false,dataset:{},tab});
  const button=mk('journal'),panel=mk('journal'),chat=mk('chat');
  const classes=new Set();
  const doc={body:{classList:{toggle:(c,on)=>on?classes.add(c):classes.delete(c)}},
    querySelectorAll:sel=>{doc.last=sel;return [button,panel];}};
  return {doc,button,panel,chat,classes};
}

test('setting is a hidden, restricted world Boolean, off by default, with plain wording',()=>{
  const reg=[];registerAppearanceSettings({game:{settings:{register:(n,k,v)=>reg.push({k,v})}},namespace:'m'});
  const s=reg.find(r=>r.k===HIDE_JOURNALS_KEY).v;
  assert.equal(HIDE_JOURNALS_KEY,'hideJournalsTab');assert.equal(DEFAULT_HIDE_JOURNALS,false);
  assert.equal(s.scope,'world');assert.equal(s.config,false);assert.equal(s.restricted,true);assert.equal(s.type,Boolean);assert.equal(s.default,false);
  assert.match(s.name,/^Hide the Journals tab from players$/);
  assert.doesNotMatch(`${s.name} ${s.hint}`,/\b(new|beta|alpha|preview)\b|hideJournalsTab|[A-Z]{3,}-/i);
  const seen=[];registerAppearanceSettings({game:{settings:{register:(n,k,v)=>{if(k===HIDE_JOURNALS_KEY)v.onChange(true);}}},namespace:'m',onSettingChange:(k,v)=>seen.push([k,v])});
  assert.deepEqual(seen,[[HIDE_JOURNALS_KEY,true]]);
});

test('controller: unset reads as off, GM can set it, a player is refused in the data layer, changes notify',async()=>{
  assert.equal(ctl().c.getState().hideJournalsTab,false);
  const g=ctl();await g.c.setHideJournalsTab(true);assert.deepEqual(g.writes,[[HIDE_JOURNALS_KEY,true]]);assert.equal(g.c.getState().hideJournalsTab,true);
  const p=ctl({isGM:false});await assert.rejects(()=>p.c.setHideJournalsTab(true),/Only GMs/);assert.deepEqual(p.writes,[]);
  const seen=[];p.c.subscribe(s=>seen.push(s.hideJournalsTab));p.c.noteChange(HIDE_JOURNALS_KEY,true);
  assert.deepEqual(seen,[true]);assert.equal(p.c.getState().hideJournalsTab,true);
});

test('shouldHideJournalTab: players only, and only while the setting is on',()=>{
  assert.equal(shouldHideJournalTab({isGM:false,setting:true}),true);
  assert.equal(shouldHideJournalTab({isGM:false,setting:false}),false);
  assert.equal(shouldHideJournalTab({isGM:true,setting:true}),false,'the GM always sees everything');
  assert.equal(shouldHideJournalTab({isGM:false,setting:undefined}),false);
});

test('the DOM selector lives in one function and stays inside the sidebar',()=>{
  const d=dom();journalTabElements(d.doc);assert.match(d.doc.last,/^#sidebar \[data-tab="journal"\], #sidebar #journal$/);
  const src=read('../scripts/journal-tab.js').replace(/\/\*[\s\S]*?\*\//g,'');
  assert.equal((src.match(/querySelector/g)||[]).length,1);
});

test('hides and restores only what it hid; the body class follows',()=>{
  const d=dom();d.panel.hidden=false;
  assert.equal(setJournalTabHidden(d.doc,true),2);
  assert.equal(d.button.hidden,true);assert.equal(d.panel.hidden,true);assert.ok(d.classes.has(HIDDEN_CLASS));
  setJournalTabHidden(d.doc,false);
  assert.equal(d.button.hidden,false);assert.equal(d.panel.hidden,false);assert.ok(!d.classes.has(HIDDEN_CLASS));
  const other=dom();other.button.hidden=true; // hidden by something else: never un-hidden by us
  setJournalTabHidden(other.doc,false);assert.equal(other.button.hidden,true);
});

test('leaves the Journals tab for Chat when it was open; leaves other tabs alone',()=>{
  const calls=[];
  const ui=active=>({sidebar:{tabGroups:{primary:active},changeTab:(...a)=>calls.push(a)}});
  assert.equal(leaveJournalTab(ui('journal')),true);assert.deepEqual(calls,[['chat','primary']]);
  assert.equal(leaveJournalTab(ui('actors')),false);assert.equal(calls.length,1);
  assert.equal(leaveJournalTab({}),false,'no sidebar API: nothing thrown');
});

test('player with setting on: hidden and moved off Journals; GM with setting on: untouched; setting off: untouched',()=>{
  const calls=[];const ui={sidebar:{tabGroups:{primary:'journal'},changeTab:(...a)=>calls.push(a)}};
  const run=(isGM,hide)=>{const d=dom();const c=ctl({isGM,value:hide}).c;calls.length=0;
    const r=applyJournalTabSetting({game:{user:{isGM}},doc:d.doc,ui,appearance:c});return {r,d,calls:[...calls]};};
  let x=run(false,true);assert.equal(x.r,true);assert.equal(x.d.button.hidden,true);assert.deepEqual(x.calls,[['chat','primary']]);
  x=run(true,true);assert.equal(x.r,false);assert.equal(x.d.button.hidden,false);assert.deepEqual(x.calls,[]);
  x=run(false,false);assert.equal(x.r,false);assert.equal(x.d.button.hidden,false);assert.deepEqual(x.calls,[]);
  x=run(false,undefined);assert.equal(x.r,false,'default off');
});

test('install: applies on load, re-applies on hooks and live on a setting change, and stops cleanly',()=>{
  const d=dom();const on=new Map(),off=[];let n=0;
  const hooks={on:(name,fn)=>{on.set(name,fn);return ++n;},off:(name,id)=>off.push([name,id])};
  const g=ctl({isGM:false});
  const stop=installJournalTabHider({game:{user:{isGM:false}},hooks,doc:d.doc,getUi:()=>({}),appearance:g.c});
  assert.equal(d.button.hidden,false);
  for(const h of ['ready','renderSidebar','renderJournalDirectory'])assert.ok(on.has(h),h);
  g.c.noteChange(HIDE_JOURNALS_KEY,true);assert.equal(d.button.hidden,true,'live on change');
  d.button.hidden=false;delete d.button.dataset.agmJournalHidden;on.get('renderSidebar')();assert.equal(d.button.hidden,true,'a sidebar render replaced the button');
  g.c.noteChange(HIDE_JOURNALS_KEY,false);assert.equal(d.button.hidden,false);
  stop();assert.equal(off.length,on.size);
});

test('GM Setup: form reads the box, GM saves only when changed, a player is refused, no document is touched',async()=>{
  const box=checked=>({checked});const form=b=>({querySelector:s=>s==='[data-ag-setup-hide-journals]'?b:null,querySelectorAll:()=>[]});
  assert.equal(readGmSetupForm(form(box(true))).hideJournalsTab,true);
  assert.equal(readGmSetupForm(form(null)).hideJournalsTab,undefined);
  const mk=(isGM,cur)=>{const w=[];return {w,ctx:{game:{user:{isGM},settings:{get:()=>false}},moduleId:'m',codexAccessKey:'k',
    appearance:{listSkins:()=>[],getState:()=>({hideJournalsTab:cur,worldDefault:'ag-default'}),setHideJournalsTab:async v=>w.push(v)}}};};
  let t=mk(true,false);const out=await saveGmSetup({hideJournalsTab:true},t.ctx);assert.deepEqual(t.w,[true]);assert.match(out.message,/Journals tab hidden from players/);
  t=mk(true,true);await saveGmSetup({hideJournalsTab:true},t.ctx);assert.deepEqual(t.w,[]);
  t=mk(false,false);await assert.rejects(()=>saveGmSetup({hideJournalsTab:true},t.ctx),/Only the GM/);assert.deepEqual(t.w,[]);
});

test('wiring, placement, copy and no migration or permission writes',()=>{
  const tpl=read('../templates/manager.hbs'),main=read('../scripts/main.js'),src=read('../scripts/journal-tab.js').replace(/\/\*[\s\S]*?\*\//g,'');
  assert.match(tpl,/aria-label="Sidebar"[\s\S]*data-ag-setup-hide-journals \{\{#if hideJournalsTab\}\}checked\{\{\/if\}\}> Hide the Journals tab from players/);
  assert.match(main,/installJournalTabHider\(\{game,hooks:Hooks,doc:document/);
  assert.match(main,/hideJournalsTab: this\.tab === "setup" \? Boolean\(this\.setupDraft\?\.hideJournalsTab \?\? /);
  assert.match(main,/<em>Hide the Journals tab from players<\/em>/,'Help describes it');
  assert.doesNotMatch(src,/ownership|permission|setFlag|update\(|updateDocuments|settings\.set/,'visual only');
  assert.doesNotMatch(main,/hideJournalsTab[^\n]*migrat/i);
  const m=JSON.parse(read('../module.json'));assert.equal(m.version,'0.79.0');assert.ok(m.download.endsWith('/ashen-gate-manager-v0.79.0/ashen-gate-manager.zip'));
});
