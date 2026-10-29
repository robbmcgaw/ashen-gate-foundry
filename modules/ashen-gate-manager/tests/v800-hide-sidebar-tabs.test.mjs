// 0.80.0 Hide the Journals tab / 0.80.0 Hide the Compendiums tab and close the gap: world settings (GM only, off by default);
// the hide logic runs for players only and hides the tab's whole wrapper. Mocked Foundry: proves logic and wiring, not the live V14 sidebar DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAppearanceController,registerAppearanceSettings,HIDE_JOURNALS_KEY,DEFAULT_HIDE_JOURNALS,HIDE_COMPENDIUMS_KEY,DEFAULT_HIDE_COMPENDIUMS} from '../scripts/appearance.js';
import {readGmSetupForm,saveGmSetup} from '../scripts/gm-setup.js';
import {SIDEBAR_TABS,tabElements,shouldHideTab,setTabHidden,leaveTabs,applySidebarTabs,installSidebarTabHider} from '../scripts/sidebar-tabs.js';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
function ctl({isGM=true,values={}}={}){
  const store=new Map(Object.entries(values)),writes=[];
  const c=createAppearanceController({currentUser:()=>({id:'u',isGM}),
    getSetting:k=>k==='worldSkin'?'ag-default':store.get(k),
    setSetting:async(k,v)=>{writes.push([k,v]);store.set(k,v);}});
  return {c,writes};
}
const el=(extra={})=>{const styles=new Map();return {hidden:false,dataset:{},style:{setProperty:(k,v,p)=>styles.set(k,[v,p]),removeProperty:k=>styles.delete(k)},styles,...extra};};
/** A tab column: each tab is <li> wrapper > button, plus a panel; `bare` tabs have a button with no <li>. */
function dom({bare=[]}={}){
  const tabs={};
  for(const id of ['chat','journal','compendium']){
    const li=el(),button=el(),panel=el();
    button.closest=sel=>bare.includes(id)?null:(sel==='#sidebar-tabs li'?li:null);
    tabs[id]={li,button,panel,all:[button,panel]};
  }
  const classes=new Set();
  const doc={body:{classList:{toggle:(c,on)=>on?classes.add(c):classes.delete(c)}},
    querySelectorAll:sel=>{doc.last=sel;const m=sel.match(/data-tab="(\w+)"/);return m?tabs[m[1]].all:[];}};
  panel_closest(tabs);
  return {doc,tabs,classes};
}
function panel_closest(tabs){for(const t of Object.values(tabs))t.panel.closest=()=>null;}

test('settings are hidden, restricted world Booleans, off by default, with plain wording',()=>{
  const reg=[];registerAppearanceSettings({game:{settings:{register:(n,k,v)=>reg.push({k,v})}},namespace:'m'});
  for(const [key,def,name] of [[HIDE_JOURNALS_KEY,DEFAULT_HIDE_JOURNALS,'Hide the Journals tab from players'],[HIDE_COMPENDIUMS_KEY,DEFAULT_HIDE_COMPENDIUMS,'Hide the Compendiums tab from players']]){
    const s=reg.find(r=>r.k===key).v;
    assert.equal(def,false);
    assert.deepEqual([s.scope,s.config,s.restricted,s.type,s.default,s.name],['world',false,true,Boolean,false,name]);
    assert.doesNotMatch(`${s.name} ${s.hint}`,/\b(new|beta|alpha|preview)\b|hide(Journals|Compendiums)Tab|[A-Z]{3,}-/i);
  }
  assert.equal(HIDE_JOURNALS_KEY,'hideJournalsTab');assert.equal(HIDE_COMPENDIUMS_KEY,'hideCompendiumsTab');
});

test('controller: unset is off, GM sets each, a player is refused in the data layer, changes notify',async()=>{
  assert.equal(ctl().c.getState().hideCompendiumsTab,false);
  const g=ctl();await g.c.setHideCompendiumsTab(true);await g.c.setHideJournalsTab(true);
  assert.deepEqual(g.writes,[[HIDE_COMPENDIUMS_KEY,true],[HIDE_JOURNALS_KEY,true]]);
  const p=ctl({isGM:false});
  await assert.rejects(()=>p.c.setHideCompendiumsTab(true),/Only GMs/);await assert.rejects(()=>p.c.setHideJournalsTab(true),/Only GMs/);assert.deepEqual(p.writes,[]);
  const seen=[];p.c.subscribe(s=>seen.push(s.hideCompendiumsTab));p.c.noteChange(HIDE_COMPENDIUMS_KEY,true);
  assert.deepEqual(seen,[true]);assert.equal(p.c.getState().hideCompendiumsTab,true);
});

test('shouldHideTab: players only, and only while the setting is on',()=>{
  assert.equal(shouldHideTab({isGM:false,setting:true}),true);
  assert.equal(shouldHideTab({isGM:false,setting:false}),false);
  assert.equal(shouldHideTab({isGM:true,setting:true}),false,'the GM always sees everything');
  assert.equal(shouldHideTab({isGM:false,setting:undefined}),false);
});

test('the DOM selector lives in one function and stays inside the sidebar',()=>{
  const d=dom();tabElements(d.doc,'compendium');assert.equal(d.doc.last,'#sidebar [data-tab="compendium"], #sidebar #compendium');
  tabElements(d.doc,'journal');assert.equal(d.doc.last,'#sidebar [data-tab="journal"], #sidebar #journal');
  const src=read('../scripts/sidebar-tabs.js').replace(/\/\*[\s\S]*?\*\//g,'');
  assert.equal((src.match(/querySelector/g)||[]).length,1);
  assert.equal((src.match(/#sidebar/g)||[]).length,3,'selectors only inside tabElements');
});

test('hiding removes the wrapper slot, not only the button: <li> is display:none and the button inside need not be',()=>{
  const d=dom();const t=d.tabs.compendium;
  assert.equal(setTabHidden(d.doc,'compendium',true),2);
  assert.equal(t.li.hidden,true);assert.deepEqual(t.li.styles.get('display'),['none','important'],'wrapper takes no space (no gap, margin or separator spacing)');
  assert.equal(t.panel.hidden,true);
  assert.equal(d.tabs.journal.li.hidden,false);assert.equal(d.tabs.chat.li.hidden,false,'other tabs untouched');
  assert.ok(d.classes.has(SIDEBAR_TABS.compendium.bodyClass));
  setTabHidden(d.doc,'compendium',false);
  assert.equal(t.li.hidden,false);assert.equal(t.li.styles.has('display'),false);assert.equal(t.panel.hidden,false);assert.ok(!d.classes.has('agm-hide-compendiums'));
});

test('robust to the wrapper being the button itself (no <li>) : the button is hidden with display:none',()=>{
  const d=dom({bare:['journal']});
  setTabHidden(d.doc,'journal',true);
  const b=d.tabs.journal.button;assert.equal(b.hidden,true);assert.deepEqual(b.styles.get('display'),['none','important']);
  assert.equal(d.tabs.journal.li.hidden,false,'nothing else is touched');
  setTabHidden(d.doc,'journal',false);assert.equal(b.hidden,false);assert.equal(b.styles.has('display'),false);
});

test('only what we hid is restored',()=>{
  const d=dom();d.tabs.journal.li.hidden=true; // hidden by something else
  setTabHidden(d.doc,'journal',false);assert.equal(d.tabs.journal.li.hidden,true);
});

test('leaves a hidden tab for Chat when it was open; other tabs are left alone',()=>{
  const calls=[];const ui=a=>({sidebar:{tabGroups:{primary:a},changeTab:(...x)=>calls.push(x)}});
  assert.equal(leaveTabs(ui('compendium'),['compendium']),true);assert.deepEqual(calls,[['chat','primary']]);
  assert.equal(leaveTabs(ui('journal'),['journal','compendium']),true);
  assert.equal(leaveTabs(ui('actors'),['journal','compendium']),false);assert.equal(calls.length,2);
  assert.equal(leaveTabs(ui('compendium'),['journal']),false,'a tab that is not hidden stays');
  assert.equal(leaveTabs({},['journal']),false);
});

test('player: each setting hides only its own tab; both off or GM: nothing hidden',()=>{
  const calls=[];const ui={sidebar:{tabGroups:{primary:'compendium'},changeTab:(...a)=>calls.push(a)}};
  const run=(isGM,values)=>{const d=dom();calls.length=0;const ids=applySidebarTabs({game:{user:{isGM}},doc:d.doc,ui,appearance:ctl({isGM,values}).c});return {ids,d,calls:[...calls]};};
  let x=run(false,{[HIDE_COMPENDIUMS_KEY]:true});assert.deepEqual(x.ids,['compendium']);assert.equal(x.d.tabs.compendium.li.hidden,true);assert.equal(x.d.tabs.journal.li.hidden,false);assert.deepEqual(x.calls,[['chat','primary']]);
  x=run(false,{[HIDE_JOURNALS_KEY]:true});assert.deepEqual(x.ids,['journal']);assert.equal(x.d.tabs.compendium.li.hidden,false);assert.deepEqual(x.calls,[],'open tab is not a hidden one');
  x=run(false,{[HIDE_JOURNALS_KEY]:true,[HIDE_COMPENDIUMS_KEY]:true});assert.deepEqual(x.ids,['journal','compendium']);
  x=run(true,{[HIDE_JOURNALS_KEY]:true,[HIDE_COMPENDIUMS_KEY]:true});assert.deepEqual(x.ids,[]);assert.equal(x.d.tabs.journal.li.hidden,false);assert.deepEqual(x.calls,[]);
  x=run(false,{});assert.deepEqual(x.ids,[],'default off');
});

test('install: applies on load, re-applies on hooks, live on a setting change, and stops cleanly',()=>{
  const d=dom();const on=new Map(),off=[];let n=0;
  const hooks={on:(name,fn)=>{on.set(name,fn);return ++n;},off:(name,id)=>off.push([name,id])};
  const g=ctl({isGM:false});
  const stop=installSidebarTabHider({game:{user:{isGM:false}},hooks,doc:d.doc,getUi:()=>({}),appearance:g.c});
  assert.equal(d.tabs.compendium.li.hidden,false);
  for(const h of ['ready','renderSidebar','renderJournalDirectory','renderCompendiumDirectory'])assert.ok(on.has(h),h);
  g.c.noteChange(HIDE_COMPENDIUMS_KEY,true);assert.equal(d.tabs.compendium.li.hidden,true,'live on change');
  d.tabs.compendium.li.hidden=false;d.tabs.compendium.li.dataset={};d.tabs.compendium.li.styles.clear();
  on.get('renderSidebar')();assert.equal(d.tabs.compendium.li.hidden,true,'a sidebar render replaced the tab');
  g.c.noteChange(HIDE_COMPENDIUMS_KEY,false);assert.equal(d.tabs.compendium.li.hidden,false);
  stop();assert.equal(off.length,on.size);
});

test('GM Setup: form reads each box, GM saves only when changed, a player is refused',async()=>{
  const form=(j,c)=>({querySelector:s=>s==='[data-ag-setup-hide-journals]'?j:s==='[data-ag-setup-hide-compendiums]'?c:null,querySelectorAll:()=>[]});
  const r=readGmSetupForm(form({checked:true},{checked:false}));assert.equal(r.hideJournalsTab,true);assert.equal(r.hideCompendiumsTab,false);
  assert.equal(readGmSetupForm(form(null,null)).hideCompendiumsTab,undefined);
  const mk=(isGM,cur)=>{const w=[];return {w,ctx:{game:{user:{isGM},settings:{get:()=>false}},moduleId:'m',codexAccessKey:'k',
    appearance:{listSkins:()=>[],getState:()=>({hideCompendiumsTab:cur,worldDefault:'ag-default'}),setHideCompendiumsTab:async v=>w.push(v)}}};};
  let t=mk(true,false);const out=await saveGmSetup({hideCompendiumsTab:true},t.ctx);assert.deepEqual(t.w,[true]);assert.match(out.message,/Compendiums tab hidden from players/);
  t=mk(true,true);await saveGmSetup({hideCompendiumsTab:true},t.ctx);assert.deepEqual(t.w,[]);
  t=mk(false,false);await assert.rejects(()=>saveGmSetup({hideCompendiumsTab:true},t.ctx),/Only the GM/);assert.deepEqual(t.w,[]);
});

test('wiring, placement, Help, visual only, version',()=>{
  const tpl=read('../templates/manager.hbs'),main=read('../scripts/main.js'),src=read('../scripts/sidebar-tabs.js').replace(/\/\*[\s\S]*?\*\//g,'');
  assert.match(tpl,/aria-label="Sidebar"[\s\S]*data-ag-setup-hide-journals \{\{#if hideJournalsTab\}\}checked\{\{\/if\}\}> Hide the Journals tab from players/);
  assert.match(tpl,/data-ag-setup-hide-compendiums \{\{#if hideCompendiumsTab\}\}checked\{\{\/if\}\}> Hide the Compendiums tab from players/);
  assert.match(main,/installSidebarTabHider\(\{game,hooks:Hooks,doc:document/);
  assert.match(main,/hideCompendiumsTab: this\.tab === "setup" \? Boolean\(this\.setupDraft\?\.hideCompendiumsTab \?\? /);
  assert.match(main,/<em>Hide the Compendiums tab from players<\/em>/);
  assert.doesNotMatch(src,/ownership|permission|setFlag|update\(|updateDocuments|settings\.set/);
  const m=JSON.parse(read('../module.json'));assert.equal(m.version,'0.80.0');assert.ok(m.download.endsWith('/ashen-gate-manager-v0.80.0/ashen-gate-manager.zip'));
});
