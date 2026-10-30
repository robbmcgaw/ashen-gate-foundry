// 0.84.0 GM Setup > Player screen and the "Tabs players keep" checklist: policy, migration from the three old settings, live
// application for players (GM exempt), presets, no gap, Help and wiring. Mocked Foundry: proves logic and wiring, not the live V14 sidebar.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAppearanceController,registerAppearanceSettings,PLAYER_TABS_KEY,HIDE_JOURNALS_KEY,HIDE_COMPENDIUMS_KEY,CHAT_ONLY_KEY} from '../scripts/appearance.js';
import {CORE_TAB_IDS,EVERYTHING,cleanPolicy,parseStoredPolicy,serializePolicy,tabKept,isEverything,presetPolicy,presetOf,policyFromChecklist,policyFromLegacy,samePolicy,checklistRows,summarizeRows} from '../scripts/sidebar-policy.js';
import {applySidebarTabs,listTabIds,listExtraTabs,installSidebarTabHider,setTabHidden} from '../scripts/sidebar-tabs.js';
import {readGmSetupForm,saveGmSetup,readTabChecklist,applyTabPreset,describeTabChoice} from '../scripts/gm-setup.js';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const player={user:{isGM:false}},gm={user:{isGM:true}};
function world({isGM=true,values={}}={}){
  const store=new Map(Object.entries(values)),writes=[];
  const c=createAppearanceController({currentUser:()=>({id:'u',isGM}),getSetting:k=>k==='worldSkin'?'ag-default':store.get(k),
    setSetting:async(k,v)=>{writes.push([k,v]);store.set(k,v);}});
  return {c,store,writes};
}
const hiddenOf=(policy,ids=[...CORE_TAB_IDS,'modtab'])=>ids.filter(id=>!tabKept(policy,id));

// ---------- policy
test('policy: Chat is always kept, listed tabs follow the ticks, unlisted tabs follow "others"',()=>{
  assert.equal(tabKept(EVERYTHING,'anything'),true);
  const p=cleanPolicy({keep:['items'],hide:['chat','journal'],others:'hide'});
  assert.equal(tabKept(p,'chat'),true,'Chat cannot be hidden');assert.equal(tabKept(p,'journal'),false);assert.equal(tabKept(p,'items'),true);assert.equal(tabKept(p,'modtab'),false);
  assert.equal(tabKept(cleanPolicy({keep:['x'],hide:['x']}),'x'),false,'hide wins when an id is in both');
  assert.deepEqual(cleanPolicy(null),{keep:[],hide:[],others:'keep'});assert.deepEqual(cleanPolicy({others:'weird'}).others,'keep');
});
test('policy: stored text parses defensively; unset or broken means "not set"',()=>{
  for(const bad of [undefined,null,'','   ','{','[]','7','"x"'])assert.equal(parseStoredPolicy(bad),null,String(bad));
  const text=serializePolicy({keep:['chat','items'],hide:['journal'],others:'keep'});
  assert.deepEqual(parseStoredPolicy(text),{keep:['chat','items'],hide:['journal'],others:'keep'});
  assert.deepEqual(parseStoredPolicy(parseStoredPolicy(text)),parseStoredPolicy(text));
});
test('presets: Everything keeps every tab, Chat only keeps Chat and hides tabs added later',()=>{
  const all=presetPolicy('everything'),chat=presetPolicy('chat');
  assert.deepEqual(hiddenOf(all),[]);assert.ok(isEverything(all));assert.equal(presetOf(all),'everything');
  assert.deepEqual(hiddenOf(chat),[...CORE_TAB_IDS.filter(t=>t!=='chat'),'modtab']);assert.equal(presetOf(chat),'chat');assert.equal(chat.others,'hide');
  assert.equal(presetOf(policyFromChecklist(CORE_TAB_IDS,['chat','items'])),'custom');
  const listed=[...CORE_TAB_IDS,'modtab'];assert.deepEqual(hiddenOf(presetPolicy('chat',listed)),hiddenOf(chat));
  assert.equal(summarizeRows(checklistRows(all)),'Players keep: Everything.');assert.equal(summarizeRows(checklistRows(chat)),'Players keep: Chat only.');
  assert.equal(summarizeRows(checklistRows(policyFromChecklist(CORE_TAB_IDS,['items','actors']))),'Players keep 3 of 13 tabs.');
});
test('checklist rows: core tabs in sidebar order, then added tabs; Chat locked and kept; labels are plain words',()=>{
  const rows=checklistRows(presetPolicy('chat'),[{id:'modtab',label:'Quests'},{id:'items',label:'dup'},{id:'x',label:''}]);
  assert.deepEqual(rows.map(r=>r.id),[...CORE_TAB_IDS,'modtab','x']);
  assert.deepEqual(rows.filter(r=>r.kept).map(r=>r.id),['chat']);assert.equal(rows[0].locked,true);
  assert.deepEqual(['Chat','Combat','Scenes','Placeables','Actors','Items','Journals','Tables','Cards','Macros','Playlists','Compendiums','Settings'],rows.slice(0,13).map(r=>r.label));
  assert.equal(rows.at(-1).label,'Added tab');
  for(const r of rows)assert.doesNotMatch(`${r.label} ${r.note}`,/[a-z]+_[a-z]+|\b(alpha|beta|new)\b/i);
});

// ---------- migration: every old combination -> the expected checklist
const COMBOS=[];for(const chat of [false,true])for(const journal of [false,true])for(const compendium of [false,true])COMBOS.push({chat,journal,compendium});
test('legacy mapping: all 8 old combinations give the expected hidden tabs',()=>{
  for(const {chat,journal,compendium} of COMBOS){
    const p=policyFromLegacy({chatOnlySidebar:chat,hideJournalsTab:journal,hideCompendiumsTab:compendium});
    const expected=chat?[...CORE_TAB_IDS.filter(t=>t!=='chat'),'modtab']:[journal&&'journal',compendium&&'compendium'].filter(Boolean);
    assert.deepEqual(hiddenOf(p).sort(),expected.sort(),JSON.stringify({chat,journal,compendium}));
    assert.equal(tabKept(p,'chat'),true);
  }
});
test('migration: GM client copies the old settings once, writes only the checklist, and repeating changes nothing',async()=>{
  for(const {chat,journal,compendium} of COMBOS){
    const values={[CHAT_ONLY_KEY]:chat,[HIDE_JOURNALS_KEY]:journal,[HIDE_COMPENDIUMS_KEY]:compendium};
    const w=world({values}),before=hiddenOf(w.c.getState().playerSidebarTabs);
    const expected=hiddenOf(policyFromLegacy({chatOnlySidebar:chat,hideJournalsTab:journal,hideCompendiumsTab:compendium}));
    assert.deepEqual(before,expected,'before migration the old keys are the fallback');assert.equal(w.c.getState().playerSidebarTabsSaved,false);
    const out=await w.c.migrateSidebarTabs();
    const anything=chat||journal||compendium;
    assert.equal(out.migrated,anything,JSON.stringify({chat,journal,compendium}));
    assert.deepEqual(w.writes.map(x=>x[0]),anything?[PLAYER_TABS_KEY]:[],'only the checklist is ever written');
    assert.deepEqual(hiddenOf(w.c.getState().playerSidebarTabs),expected,'same result after migration');
    assert.equal(w.c.getState().playerSidebarTabsSaved,anything);
    for(const k of Object.keys(values))assert.equal(w.store.get(k),values[k],'old key untouched');
    const again=await w.c.migrateSidebarTabs();assert.equal(again.migrated,false);assert.equal(w.writes.length,anything?1:0,'idempotent');
  }
});
test('migration: once the checklist is saved the old keys are ignored; players and bad stored text are handled',async()=>{
  const saved=serializePolicy(presetPolicy('everything'));
  const w=world({values:{[CHAT_ONLY_KEY]:true,[PLAYER_TABS_KEY]:saved}});
  assert.deepEqual(hiddenOf(w.c.getState().playerSidebarTabs),[],'saved checklist wins over a stale old key');
  assert.deepEqual(await w.c.migrateSidebarTabs(),{migrated:false,reason:'already-saved'});assert.deepEqual(w.writes,[]);
  const p=world({isGM:false,values:{[HIDE_JOURNALS_KEY]:true}});
  assert.deepEqual(hiddenOf(p.c.getState().playerSidebarTabs),['journal'],'a player reads the fallback and sees no change');
  assert.deepEqual(await p.c.migrateSidebarTabs(),{migrated:false,reason:'not-gm'});assert.deepEqual(p.writes,[]);
  const bad=world({values:{[PLAYER_TABS_KEY]:'{oops',[HIDE_COMPENDIUMS_KEY]:true}});
  assert.deepEqual(hiddenOf(bad.c.getState().playerSidebarTabs),['compendium'],'unreadable text counts as not set');
  assert.equal((await bad.c.migrateSidebarTabs()).migrated,true);assert.deepEqual(JSON.parse(bad.store.get(PLAYER_TABS_KEY)).hide,['compendium']);
});
test('controller: GM sets the checklist, players are refused in the data layer, changes notify live',async()=>{
  const g=world(),chat=presetPolicy('chat');
  await g.c.setPlayerSidebarTabs(chat);assert.deepEqual(g.writes.map(x=>x[0]),[PLAYER_TABS_KEY]);assert.equal(presetOf(g.c.getState().playerSidebarTabs),'chat');
  const p=world({isGM:false});await assert.rejects(()=>p.c.setPlayerSidebarTabs(chat),/Only GMs/);assert.deepEqual(p.writes,[]);
  const seen=[];p.c.subscribe(s=>seen.push(presetOf(s.playerSidebarTabs)));p.c.noteChange(PLAYER_TABS_KEY,serializePolicy(chat));assert.deepEqual(seen,['chat']);
  p.c.noteChange(PLAYER_TABS_KEY,undefined);assert.equal(presetOf(p.c.getState().playerSidebarTabs),'everything');
});
test('settings: the checklist is a hidden, restricted world string; the three old keys stay registered and hidden',()=>{
  const reg=[];registerAppearanceSettings({game:{settings:{register:(n,k,v)=>reg.push({k,v})}},namespace:'m'});
  const s=reg.find(r=>r.k===PLAYER_TABS_KEY).v;
  assert.deepEqual([s.scope,s.config,s.restricted,s.type,s.default],['world',false,true,String,'']);
  for(const key of [HIDE_JOURNALS_KEY,HIDE_COMPENDIUMS_KEY,CHAT_ONLY_KEY]){const o=reg.find(r=>r.k===key).v;assert.deepEqual([o.scope,o.config,o.type,o.default],['world',false,Boolean,false],key);}
  assert.doesNotMatch(`${s.name} ${s.hint}`,/\b(new|beta|alpha|preview)\b|playerSidebarTabs/i);
});

// ---------- applying to the sidebar
const el=(extra={})=>{const styles=new Map();return {hidden:false,dataset:{},style:{setProperty:(k,v,pr)=>styles.set(k,[v,pr]),removeProperty:k=>styles.delete(k)},styles,...extra};};
function sidebarDom(extra=[],{coreHidden=[]}={}){
  const ids=[...CORE_TAB_IDS,...extra],tabs={};
  for(const id of ids){
    const li=el({closest:s=>s==='#sidebar-tabs'?{}:null}),button=el({dataset:{tab:id},getAttribute:n=>n==='aria-label'?`Label ${id}`:null,closest:s=>s==='#sidebar-tabs li'?li:null});
    const panel=el({closest:()=>null});if(coreHidden.includes(id))li.hidden=true;
    tabs[id]={li,button,panel};
  }
  const attrs=new Map(),classes=new Set();
  const body={classList:{toggle:(c,on)=>on?classes.add(c):classes.delete(c)},setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k)};
  return {tabs,classes,attrs,doc:{body,querySelectorAll:sel=>{if(sel==='#sidebar-tabs [data-tab]')return ids.map(i=>tabs[i].button);const m=sel.match(/data-tab="(\w+)"/);return m&&tabs[m[1]]?[tabs[m[1]].button,tabs[m[1]].panel]:[];}}};
}
const hiddenTabs=d=>Object.entries(d.tabs).filter(([,t])=>t.li.hidden).map(([k])=>k);
const hiddenPanels=d=>Object.entries(d.tabs).filter(([,t])=>t.panel.hidden).map(([k])=>k);
const fixed=state=>{const subs=new Set();return {getState:()=>state,subscribe:fn=>{subs.add(fn);return()=>subs.delete(fn);},fire:()=>subs.forEach(f=>f()),set:s=>Object.assign(state,s)};};
function uiMock(active='combat'){const calls=[];const ui={calls,sidebar:{tabGroups:{primary:active},changeTab:(t,g)=>{calls.push(['changeTab',t,g]);ui.sidebar.tabGroups.primary=t;}}};return ui;}

test('apply: players lose exactly the unticked tabs, button wrapper and panel, so no gap is left; GM keeps everything',()=>{
  const d=sidebarDom(['modtab']),ui=uiMock('journal'),ap=fixed({playerSidebarTabs:policyFromChecklist([...CORE_TAB_IDS,'modtab'],['chat','combat','actors','items','settings'])});
  const hidden=applySidebarTabs({game:player,doc:d.doc,ui,appearance:ap,peek:{}});
  assert.deepEqual(hidden.sort(),['cards','compendium','journal','macros','modtab','placeables','playlists','scenes','tables'].sort());
  assert.deepEqual(hiddenTabs(d).sort(),hidden.sort(),'the <li> wrapper of each hidden tab is hidden, not just the button');
  assert.deepEqual(hiddenPanels(d).sort(),hidden.sort());
  assert.equal(d.tabs.journal.li.styles.get('display')[1],'important');assert.equal(d.tabs.combat.li.styles.has('display'),false);
  assert.deepEqual(ui.calls,[['changeTab','chat','primary']],'a player on a hidden tab is moved to Chat');
  assert.equal(d.attrs.get('data-agm-tabs-hidden').split(' ').sort().join(' '),[...hidden].sort().join(' '));assert.equal(d.classes.has('agm-chat-only-sidebar'),false);
  const d2=sidebarDom(['modtab']);applySidebarTabs({game:gm,doc:d2.doc,ui:uiMock(),appearance:ap,peek:{}});assert.deepEqual(hiddenTabs(d2),[],'GM exempt');assert.equal(d2.attrs.has('data-agm-tabs-hidden'),false);
});
test('apply: live change restores exactly what was hidden, is idempotent, and the Chat-only preset also hides added tabs',()=>{
  const d=sidebarDom(['modtab']),ui=uiMock('chat'),ap=fixed({playerSidebarTabs:presetPolicy('chat')}),peek={tab:null,armed:false};
  applySidebarTabs({game:player,doc:d.doc,ui,appearance:ap,peek});
  assert.deepEqual(hiddenTabs(d).sort(),[...CORE_TAB_IDS.filter(t=>t!=='chat'),'modtab'].sort());assert.ok(d.classes.has('agm-chat-only-sidebar'));
  const snap=JSON.stringify(hiddenTabs(d));applySidebarTabs({game:player,doc:d.doc,ui,appearance:ap,peek});assert.equal(JSON.stringify(hiddenTabs(d)),snap);
  ap.set({playerSidebarTabs:presetPolicy('everything')});applySidebarTabs({game:player,doc:d.doc,ui,appearance:ap,peek});
  assert.deepEqual(hiddenTabs(d),[]);assert.deepEqual(hiddenPanels(d),[]);assert.equal(d.classes.has('agm-chat-only-sidebar'),false);assert.equal(d.attrs.has('data-agm-tabs-hidden'),false);
  ap.set({playerSidebarTabs:policyFromChecklist(CORE_TAB_IDS,CORE_TAB_IDS.filter(t=>t!=='journal'&&t!=='compendium'))});applySidebarTabs({game:player,doc:d.doc,ui,appearance:ap,peek});
  assert.deepEqual(hiddenTabs(d),['journal','compendium'],'Journals and Compendiums are just two boxes in the list');
});
test('apply: a tab Foundry had hidden stays hidden after the setting is switched off; no state at all means nothing hidden',()=>{
  const d=sidebarDom([],{coreHidden:['macros']}),ap=fixed({playerSidebarTabs:presetPolicy('chat')});
  applySidebarTabs({game:player,doc:d.doc,ui:uiMock('chat'),appearance:ap,peek:{}});
  ap.set({playerSidebarTabs:presetPolicy('everything')});applySidebarTabs({game:player,doc:d.doc,ui:uiMock('chat'),appearance:ap,peek:{}});
  assert.deepEqual(hiddenTabs(d),['macros'],"Foundry's own hidden tab is put back as it was");assert.equal(d.tabs.macros.li.styles.has('display'),false);
  const d3=sidebarDom();assert.deepEqual(applySidebarTabs({game:player,doc:d3.doc,ui:uiMock(),appearance:fixed({}),peek:{}}),[]);
  assert.deepEqual(applySidebarTabs({game:player,doc:d3.doc,ui:uiMock(),appearance:undefined,peek:{}}),[]);
});
test('apply: the dock can peek a hidden tab (Combat or Settings) without bringing the others back',()=>{
  const d=sidebarDom(),ui=uiMock('settings'),ap=fixed({playerSidebarTabs:policyFromChecklist(CORE_TAB_IDS,['chat'])}),peek={tab:'settings',armed:false};
  applySidebarTabs({game:player,doc:d.doc,ui,appearance:ap,peek});
  assert.equal(d.tabs.settings.li.hidden,true,'button hidden');assert.equal(d.tabs.settings.panel.hidden,false,'panel shown while peeked');assert.deepEqual(ui.calls,[]);
  ui.sidebar.tabGroups.primary='chat';applySidebarTabs({game:player,doc:d.doc,ui,appearance:ap,peek});assert.equal(d.tabs.settings.panel.hidden,true);
});
test('installer: applies on load, on setting change and on every sidebar tab render (renderAbstractSidebarTab), and stops',()=>{
  const d=sidebarDom(),ap=fixed({playerSidebarTabs:presetPolicy('chat')}),reg=[];
  const hooks={on:(n,f)=>{reg.push([n,f]);return reg.length;},off:(n,id)=>{reg[id-1]=null;}};
  const stop=installSidebarTabHider({game:player,hooks,doc:d.doc,getUi:()=>uiMock('chat'),appearance:ap});
  assert.ok(hiddenTabs(d).length>0,'applied on load');
  for(const name of ['ready','renderSidebar','renderAbstractSidebarTab','changeSidebarTab'])assert.ok(reg.some(r=>r&&r[0]===name),name);
  ap.set({playerSidebarTabs:presetPolicy('everything')});ap.fire();assert.deepEqual(hiddenTabs(d),[]);
  stop();assert.ok(reg.every(r=>r===null));
});
test('added tabs are found from the sidebar buttons, with their own name',()=>{
  const d=sidebarDom(['modtab']);
  assert.ok(listTabIds(d.doc).includes('modtab'));assert.deepEqual(listExtraTabs(d.doc),[{id:'modtab',label:'Label modtab'}]);
  assert.deepEqual(listExtraTabs(undefined),[]);
});

// ---------- GM Setup form: presets, summary, save
function formDom(ids=CORE_TAB_IDS,ticked=ids){
  const boxes=ids.map(id=>({dataset:{agSetupTab:id},checked:ticked.includes(id)||id==='chat',disabled:id==='chat'}));
  return {boxes,querySelectorAll:s=>s==='[data-ag-setup-tab]'?boxes:[],querySelector:()=>null};
}
test('presets only change the form: Keep Chat only unticks everything but Chat, Keep everything ticks all, summary follows',()=>{
  const f=formDom();
  assert.equal(describeTabChoice(f),'Players keep: Everything.');
  applyTabPreset(f,'chat');assert.deepEqual(f.boxes.filter(b=>b.checked).map(b=>b.dataset.agSetupTab),['chat']);assert.equal(describeTabChoice(f),'Players keep: Chat only.');
  assert.equal(presetOf(readTabChecklist(f)),'chat');assert.equal(readTabChecklist(f).others,'hide');
  f.boxes.find(b=>b.dataset.agSetupTab==='items').checked=true;assert.equal(describeTabChoice(f),'Players keep 2 of 13 tabs.');
  applyTabPreset(f,'everything');assert.equal(f.boxes.every(b=>b.checked),true);assert.equal(describeTabChoice(f),'Players keep: Everything.');
  assert.equal(readTabChecklist({querySelectorAll:()=>[]}),null);assert.equal(describeTabChoice({querySelectorAll:()=>[]}),'');
});
test('form: readGmSetupForm returns the checklist; a form without it leaves the setting alone',()=>{
  const f=formDom([...CORE_TAB_IDS,'modtab'],['chat','items']);
  const v=readGmSetupForm(f);assert.deepEqual(hiddenOf(v.playerSidebarTabs).sort(),[...CORE_TAB_IDS.filter(t=>!['chat','items'].includes(t)),'modtab'].sort());
  assert.equal(tabKept(v.playerSidebarTabs,'items'),true);assert.equal(readGmSetupForm({querySelector:()=>null,querySelectorAll:()=>[]}).playerSidebarTabs,undefined);
});
test('save: writes the checklist only when the choice changed; GM only; plain wording',async()=>{
  const mk=(isGM,values={})=>{const w=world({isGM,values});return {...w,ctx:{game:{user:{isGM},settings:{get:()=>false}},moduleId:'m',codexAccessKey:'k',appearance:w.c}};};
  let t=mk(true);let out=await saveGmSetup({playerSidebarTabs:presetPolicy('chat')},t.ctx);
  assert.deepEqual(t.writes.map(x=>x[0]),[PLAYER_TABS_KEY]);assert.match(out.message,/players keep only the Chat tab/);
  await saveGmSetup({playerSidebarTabs:presetPolicy('chat')},t.ctx);assert.equal(t.writes.length,1,'unchanged: no second write');
  out=await saveGmSetup({playerSidebarTabs:presetPolicy('everything')},t.ctx);assert.equal(t.writes.length,2);assert.match(out.message,/players keep every sidebar tab/);
  t=mk(true);out=await saveGmSetup({playerSidebarTabs:presetPolicy('everything')},t.ctx);assert.deepEqual(t.writes,[],'Everything over an unset checklist is no change');
  t=mk(true,{[HIDE_JOURNALS_KEY]:true});await saveGmSetup({playerSidebarTabs:policyFromLegacy({hideJournalsTab:true})},t.ctx);
  assert.equal(t.writes.length,1,'same as the old setting but not yet saved: saved once, which completes the migration');assert.equal(t.c.getState().playerSidebarTabsSaved,true);
  t=mk(false);await assert.rejects(()=>saveGmSetup({playerSidebarTabs:presetPolicy('chat')},t.ctx),/Only the GM/);assert.deepEqual(t.writes,[]);
  assert.equal(samePolicy(policyFromLegacy({}),EVERYTHING),true);
});

// ---------- wiring
test('wiring: Player screen sub-tab with five labelled groups, old switches gone, Help, changelog, version',()=>{
  const tpl=read('../templates/manager.hbs'),main=read('../scripts/main.js'),man=JSON.parse(read('../module.json')),log=read('../CHANGELOG.md');
  assert.match(main,/const SETUP_TABS=\[\{id:'general',label:'General'\},\{id:'screen',label:'Player screen'\},/);
  const panel=tpl.slice(tpl.indexOf('{{{setupPanels.screen}}}'),tpl.indexOf('{{{setupPanels.sources}}}'));
  const order=['aria-label="Sidebar tabs"','data-ag-setup-tab="{{id}}"','data-ag-tab-preset="everything"','data-ag-tab-preset="chat"','aria-label="Directory filters"','data-ag-setup-handouts-only','data-ag-setup-players-only','aria-label="Scene controls and navigation"','data-ag-setup-screen="hideSceneTools"','data-ag-setup-screen="dockSceneControls"','aria-label="Player dock"','data-ag-setup-screen="playerDock"','data-ag-setup-dock-corner','data-ag-setup-screen="hidePlayersList"','aria-label="Collapse"','data-ag-setup-screen="collapsePlayerSidebar"','data-ag-setup-autocollapse'].map(x=>panel.indexOf(x));
  assert.ok(order.every(i=>i>=0),'every control is in the Player screen panel');assert.deepEqual([...order].sort((a,b)=>a-b),order,'in the five groups, in order');
  assert.doesNotMatch(tpl,/data-ag-setup-hide-journals|data-ag-setup-hide-compendiums|data-ag-setup-screen="chatOnlySidebar"|aria-label="Sidebar"/);
  assert.doesNotMatch(panel,/<details/,'no folds: nothing nested');
  assert.match(panel,/<button type="button" class="ag-btn ag-btn--sm" data-ag-tab-preset="everything">Keep everything<\/button>/);
  assert.match(panel,/role="status"/);assert.doesNotMatch(panel,/\b(Alpha|Beta|Preview)\b|\bNew\b/);
  assert.match(main,/<strong>Sidebar tabs<\/strong> is one checklist, <em>Tabs players keep<\/em>/);assert.match(main,/<em>Keep Chat only<\/em>/);assert.match(main,/<strong>Collapse<\/strong>/);
  assert.doesNotMatch(main,/<em>Hide the Journals tab from players<\/em>/);
  assert.match(main,/migrateSidebarTabs/);
  assert.equal(man.version,'0.85.1');assert.ok(man.download.endsWith('/ashen-gate-manager-v0.85.1/ashen-gate-manager.zip'));assert.match(log,/^## 0\.85\.0 /m);assert.match(log,/^## 0\.84\.1 /m);assert.match(log,/^## 0\.84\.0 /m);
  assert.match(log,/Why the Journals and Compendiums switches seemed to do nothing/);assert.match(log,/playerSidebarTabs/);assert.match(log,/Show players only the Chat tab\* on: Chat kept/);
  const src=read('../scripts/sidebar-tabs.js').replace(/\/\*[\s\S]*?\*\//g,'')+read('../scripts/sidebar-policy.js').replace(/\/\*[\s\S]*?\*\//g,'');
  assert.doesNotMatch(src,/ownership|permission|setFlag|update\(|updateDocuments|settings\.set/);
  assert.equal(setTabHidden(sidebarDom().doc,'nothing',true),0);
});
