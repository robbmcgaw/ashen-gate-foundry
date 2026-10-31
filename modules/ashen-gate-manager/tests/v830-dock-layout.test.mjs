// 0.83.0 player dock layout (the bottom-left stack was reverted in 0.85.0, see v850-dock-corner-nav.test.mjs): token controls row, minimize beside the portrait, pill buttons, button order,
// Quest Tracker / Conditions gates (live, both directions), toggles. Mocked Foundry and DOM: proves logic and wiring, not the live V14 layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FakeDocument,fakeStorage} from '../../../scripts/kit-tests/fake-dom.mjs';
import {registerAppearanceSettings,PLAYER_SCREEN_FLAGS} from '../scripts/appearance.js';
import {createControlsLayout,applyControlsFilter,classifyTool,sceneNavigationElement,CONTROLS_CLEAN_CLASS,CONTROLS_DOCKED_CLASS} from '../scripts/dock-controls.js';
import {DOCK_ID,DOCK_SLOTS,applyPlayerDock,installPlayerDock,evaluateDockExtras,listDockExtras,listDockLaunchers,toggleConditions,conditionsOpen} from '../scripts/player-dock.js';
import {openSidebarTab,closeSidebarTab,isSidebarTabOpen} from '../scripts/sidebar-tabs.js';
import {createSidebarIdleCollapse} from '../scripts/sidebar-idle.js';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));
const settle=async()=>{for(let i=0;i<6;i++)await tick();};

function richDoc(){
  const doc=new FakeDocument(),set=new Set(),vars=new Map();
  doc.body.classList={add:c=>set.add(c),remove:c=>set.delete(c),toggle:(c,on)=>{on?set.add(c):set.delete(c);return on;},contains:c=>set.has(c),set};
  doc.documentElement={style:{setProperty:(k,v)=>vars.set(k,v),removeProperty:k=>vars.delete(k)}};
  doc.vars=vars;
  doc.querySelector=sel=>sel.startsWith('#')?doc.getElementById(sel.slice(1)):doc.body.querySelector(sel);
  doc.querySelectorAll=sel=>doc.body.querySelectorAll(sel);
  return doc;
}
const add=(doc,tag,attrs={},parent=doc.body)=>{const el=doc.createElement(tag,attrs);parent.append(el);return el;};
const fixed=state=>{const subs=new Set();return {getState:()=>state,subscribe:fn=>{subs.add(fn);return()=>subs.delete(fn);},fire:()=>subs.forEach(f=>f()),set:s=>Object.assign(state,s)};};
const access=on=>({contract:'ag-player-access/1',getState:()=>({contract:'ag-player-access/1',audience:'player',playerAccessEnabled:typeof on==='function'?on():on})});

// ---- scene controls DOM like V14 14.367: #scene-controls > menu#scene-controls-controls (group buttons) + menu#scene-controls-tools
function controlsDom(doc,{tools=['select','target','ruler','unconstrainedMovement','findToken','weird'],active='tokens',groups=['tokens','regions','notes']}={}){
  const root=add(doc,'aside',{id:'scene-controls'});
  const gm=add(doc,'menu',{id:'scene-controls-controls'},root),tm=add(doc,'menu',{id:'scene-controls-tools'},root);
  const out={root,gm,tm,groupLis:[],toolLis:{}};
  for(const g of groups){const li=add(doc,'li',{},gm);add(doc,'button',{class:'control ui-control layer icon','data-control':g,'aria-pressed':String(g===active)},li);out.groupLis.push(li);}
  for(const t of tools){const li=add(doc,'li',{},tm);add(doc,'button',{class:`control ui-control tool icon ${t==='findToken'?'fa-solid fa-crosshairs':'fa-solid fa-x'}`,'data-tool':t,'aria-label':t==='findToken'?'Find My Token':t},li);out.toolLis[t]=li;}
  return out;
}

// ---------- settings
test('controls filter: group buttons hidden, only the four tools stay, unknown tools hidden and reported, restored when off',()=>{
  const doc=richDoc(),c=controlsDom(doc);
  const r=applyControlsFilter({doc,on:true});
  assert.equal(r.clean,true);assert.equal(doc.body.classList.contains(CONTROLS_CLEAN_CLASS),true);
  assert.deepEqual(r.kept.sort(),['findToken','ruler','select','target']);
  assert.deepEqual(r.hidden.sort(),['unconstrainedMovement','weird']);
  assert.equal(doc.body.getAttribute('data-agm-tools-hidden'),'unconstrainedMovement weird');
  for(const li of c.groupLis)assert.equal(li.hidden,true,'group button hidden');
  for(const t of ['select','target','ruler','findToken'])assert.equal(c.toolLis[t].hidden,false,t);
  for(const t of ['unconstrainedMovement','weird'])assert.equal(c.toolLis[t].hidden,true,t);
  assert.equal(c.toolLis.select.querySelector('button').getAttribute('data-agm-keep'),'1');
  assert.equal(c.toolLis.select.children[0].parentElement,c.toolLis.select,'never re-parented');
  applyControlsFilter({doc,on:false});
  assert.equal(doc.body.classList.contains(CONTROLS_CLEAN_CLASS),false);
  for(const li of [...c.groupLis,...Object.values(c.toolLis)])assert.equal(li.hidden,false);
  assert.equal(doc.body.getAttribute('data-agm-tools-hidden'),null);
});
test('controls filter: leaves a non-token group alone, never throws on a missing DOM, classifies defensively',()=>{
  const doc=richDoc();const c=controlsDom(doc,{tools:['select','clear','snap'],active:'regions'});
  const r=applyControlsFilter({doc,on:true});assert.equal(r.clean,false);assert.equal(doc.body.classList.contains(CONTROLS_CLEAN_CLASS),false);
  assert.equal(c.groupLis[0].hidden,false);assert.equal(c.toolLis.clear.hidden,false);
  assert.equal(applyControlsFilter({doc:{},on:true}).clean,false);assert.equal(applyControlsFilter({doc:null,on:false}).clean,false);
  assert.equal(classifyTool({name:'select'}),'keep');assert.equal(classifyTool({name:'ruler'}),'keep');assert.equal(classifyTool({name:'target'}),'keep');
  assert.equal(classifyTool({name:'x',label:'Find My Token'}),'keep');assert.equal(classifyTool({name:'locateToken'}),'keep');
  assert.equal(classifyTool({name:'x',icon:'fa-solid fa-crosshairs'}),'keep');
  assert.equal(classifyTool({name:'unconstrainedMovement',icon:'fa-ghost'}),'hide');assert.equal(classifyTool({}),'hide');
});

// ---------- layout class and CSS variables
function dockEnv({isGM=false,state={},modules=new Map(),storage=fakeStorage(),ui=null}={}){
  const doc=richDoc(),ap=fixed({playerDock:true,playerDockCorner:'top-left',...state}),notes=[];
  ui??={notifications:{warn:m=>notes.push(m)},sidebar:{tabGroups:{primary:'chat'},expanded:true}};
  const game={user:{isGM,id:'p1'},modules};
  const layout=createControlsLayout({doc,win:{}});
  const timers=[];
  return {doc,ap,ui,game,notes,storage,layout,timers,
    apply:(extra={})=>applyPlayerDock({game,doc,appearance:ap,getUi:()=>ui,peek:{tab:null,armed:false},memory:{},storage,layout,toggleConfig:()=>true,setTimer:(fn,ms)=>{timers.push([fn,ms]);return timers.length;},clearTimer:()=>{},...extra})};
}
test('CSS: row layout, offsets are variables, reduced motion, no re-parenting code',()=>{
  const css=read('../styles/player-dock.css');
  assert.match(css,/--agm-controls-h/);
  assert.match(css,/body\.agm-controls-clean #scene-controls-controls[\s\S]*display: none/);assert.match(css,/#scene-controls-tools[\s\S]*flex-direction: row/);
  assert.match(css,/prefers-reduced-motion/);assert.match(css,/\.agm-dock__head/);assert.doesNotMatch(css,/agm-dock__link/);
  const src=read('../scripts/dock-controls.js').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
  assert.doesNotMatch(src,/appendChild|\.append\(|insertBefore|replaceWith|prepend\(|\.remove\(\)/,'never re-parents or removes core DOM');
});

// ---------- dock structure
test('dock: minimize shares the top row with the portrait slot; alone and right-aligned without a portrait; handle stays when minimized',()=>{
  const e=dockEnv();const dock=e.apply();
  const head=dock.children[0],slot=dock.querySelector('[data-agm-dock-slot="portrait"]'),toggle=dock.querySelector('[data-agm-dock="minimize"]');
  assert.equal(head.className,'agm-dock__head');assert.equal(slot.parentElement,head);assert.equal(toggle.parentElement,head);
  assert.equal(head.children[0],slot);assert.equal(head.children[1],toggle);assert.equal(slot.tagName,'SPAN');assert.equal(slot.children.length,0,'empty-safe');
  // a Hub-like portrait lands in the same row
  const hub=add(e.doc,'span',{'data-agch-dock-portrait':'1'},slot);assert.equal(hub.parentElement.parentElement,head);
  toggle.click();assert.equal(slot.hidden,true);assert.equal(dock.contains(toggle),true);assert.equal(dock.querySelector(`[id="${DOCK_ID}-body"]`).hidden,true);
  toggle.click();assert.equal(slot.hidden,false);
  assert.match(read('../styles/player-dock.css'),/\.agm-dock__toggle \{[^}]*margin-left: auto/);
});
test('dock: User Configuration uses the shared pill component; button order is Combat, Conditions, Quest Log, User Settings, Foundry Settings, Ashen Gate',async()=>{
  const mods=new Map([['ashen-gate-quest-manager',{active:true,api:{tracking:{getState:async()=>({visible:false}),set:async()=>{}},playerAccess:access(true)}}],
    ['ashen-gate-utilities',{active:true,api:{conditions:{openOverlay:async()=>{}},playerAccess:access(true)}}]]);
  const e=dockEnv({modules:mods});const dock=e.apply();await settle();
  const btns=dock.querySelectorAll('button').filter(b=>b.getAttribute('data-agm-dock')&&b.getAttribute('data-agm-dock')!=='minimize').map(b=>b.getAttribute('data-agm-dock'));
  assert.deepEqual(btns,['combat','conditions','quest-tracker','user-config','settings','ashen-gate']);
  assert.deepEqual(DOCK_SLOTS.map(s=>s.id),['portrait','combat','conditions','quest-tracker','user-config','settings','ashen-gate']);
  const classes=Object.fromEntries(['combat','settings','user-config','ashen-gate'].map(a=>[a,dock.querySelector(`[data-agm-dock="${a}"]`).className]));
  assert.equal(classes['user-config'],classes.combat);assert.equal(classes.combat,classes.settings);assert.match(classes['user-config'],/ag-btn agm-dock__btn/);
  const uc=dock.querySelector('[data-agm-dock="user-config"]');assert.equal(uc.tagName,'BUTTON');assert.ok(uc.querySelector('i'));assert.match(uc.querySelector('span').textContent,/^User Settings$/);
  const labels=dock.querySelectorAll('button').filter(b=>b.getAttribute('data-agm-dock')&&b.getAttribute('data-agm-dock')!=='minimize').map(b=>b.querySelector('span').textContent);
  assert.deepEqual(labels,['Combat','Conditions','Quest Log','User Settings','Foundry Settings','Ashen Gate']);
  // modules unavailable: their buttons stay hidden
  const none=dockEnv();const d2=none.apply();await settle();
  assert.equal(d2.querySelector('[data-agm-dock="quest-tracker"]').hidden,true);assert.equal(d2.querySelector('[data-agm-dock="conditions"]').hidden,true);
});

// ---------- Quest Tracker gate: the failure, then the fix
test('Quest Tracker gate: API published after the dock was built (Quest Log sets it in its own ready hook) - reproduced and fixed',async()=>{
  const mod={active:true,api:undefined};const modules=new Map([['ashen-gate-quest-manager',mod]]);
  // the gate as it was evaluated at build time: module active, no api yet -> hidden (this was the whole of the old behaviour)
  const early=await evaluateDockExtras({modules});assert.equal(early.ids.has('quest-tracker'),false);assert.equal(early.waiting,true,'tells the dock to look again');
  const e=dockEnv({modules});const dock=e.apply();await settle();
  const quest=dock.querySelector('[data-agm-dock="quest-tracker"]');assert.equal(quest.hidden,true);
  // Quest Log's real API shape (modules/ashen-gate-quest-manager/scripts/main.mjs): tracking.get/getState/set + playerAccess
  mod.api={contract:'ag-objectives/0.1-alpha',open(){},tracking:{get:()=>[],getState:()=>({visible:false}),set:async()=>{}},playerAccess:access(true)};
  assert.ok(e.timers.length>=1,'a bounded retry was scheduled');
  e.timers.at(-1)[0]();await settle();
  assert.equal(quest.hidden,false,'appears once the api exists, with no sidebar render and no reload');
  // retries are bounded
  const never=dockEnv({modules:new Map([['ashen-gate-quest-manager',{active:true,api:undefined}]])});never.apply();await settle();
  for(let i=0;i<20&&never.timers.length;i++){const [fn]=never.timers.shift();fn();await settle();}
  assert.ok(never.timers.length<=1);
});
test('live Player Access: off -> on adds the buttons, on -> off removes them (and the menu), by setting hook alone, no re-render',async()=>{
  let questOn=false,utilOn=false;
  const open=[];
  const modules=new Map([
    ['ashen-gate-quest-manager',{active:true,api:{open:()=>open.push('q'),tracking:{getState:()=>({visible:false}),set:async()=>{}},playerAccess:access(()=>questOn)}}],
    ['ashen-gate-utilities',{active:true,api:{open:()=>open.push('u'),conditions:{openOverlay:async()=>{}},playerAccess:access(()=>utilOn)}}]]);
  const e=dockEnv({modules});
  const handlers={};const hooks={on:(n,f)=>{(handlers[n]??=[]).push(f);return handlers[n].length;},off:()=>{}};
  const stop=installPlayerDock({game:e.game,hooks,doc:e.doc,getUi:()=>e.ui,appearance:e.ap,layout:e.layout,setTimer:()=>0,clearTimer:()=>{}});
  await settle();
  const dock=e.doc.getElementById(DOCK_ID);const q=dock.querySelector('[data-agm-dock="quest-tracker"]'),c=dock.querySelector('[data-agm-dock="conditions"]');
  assert.deepEqual([q.hidden,c.hidden],[true,true]);
  for(const name of ['ready','updateSetting','createSetting','deleteSetting'])assert.ok(handlers[name]?.length,name);
  // open the Ashen Gate menu while access is off: nothing listed
  dock.querySelector('[data-agm-dock="ashen-gate"]').click();await settle();
  const menuItems=()=>dock.querySelectorAll('[role="menuitem"]').map(i=>i.getAttribute('data-agm-launcher')??'none');
  assert.deepEqual(menuItems(),['none']);
  // GM turns Player Access on: the player client gets updateSetting
  questOn=true;utilOn=true;
  for(const f of handlers.updateSetting)f({key:'ashen-gate-quest-manager.playerAccessEnabled'});await settle();
  assert.deepEqual([q.hidden,c.hidden],[false,false]);
  assert.deepEqual(menuItems().sort(),['ashen-gate-quest-manager','ashen-gate-utilities'],'the open menu picked them up too');
  // an unrelated setting does not matter, a non-ag one is ignored
  let reads=0;modules.get('ashen-gate-utilities').api.playerAccess.getState=()=>{reads++;return access(true).getState();};
  for(const f of handlers.updateSetting)f({key:'core.something'});await settle();assert.equal(reads,0);
  // GM turns it off: buttons and menu entries go, no re-render
  questOn=false;utilOn=false;modules.get('ashen-gate-utilities').api.playerAccess.getState=access(()=>utilOn).getState;
  for(const f of handlers.updateSetting)f({key:'ashen-gate-utilities.playerAccessEnabled'});await settle();
  assert.deepEqual([q.hidden,c.hidden],[true,true]);assert.deepEqual(menuItems(),['none']);
  assert.equal(q.parentElement.hidden,true,'the slot goes too');
  // ready also re-checks, and nothing is cached: flip back via ready
  questOn=true;for(const f of handlers.ready)f();await settle();assert.equal(q.hidden,false);
  questOn=false;for(const f of handlers.createSetting)f({key:'ashen-gate-quest-manager.playerAccessEnabled'});await settle();assert.equal(q.hidden,true);
  stop();
});
test('Ashen Gate menu reads the current state each time it opens',async()=>{
  let on=true;const modules=new Map([['ashen-gate-quest-manager',{active:true,api:{open(){},playerAccess:access(()=>on)}}]]);
  assert.equal((await listDockLaunchers({modules})).length,1);on=false;assert.equal((await listDockLaunchers({modules})).length,0);
  assert.equal((await listDockExtras({modules,table:[]})).size,0);
});

// ---------- Conditions toggle
test('Conditions: toggleOverlay when Utilities has it (second press closes), openOverlay fallback, aria-pressed from isOverlayOpen',async()=>{
  let openState=false;const calls=[];
  const newer=new Map([['ashen-gate-utilities',{active:true,api:{conditions:{toggleOverlay:async()=>{calls.push('toggle');openState=!openState;},openOverlay:async()=>calls.push('open'),isOverlayOpen:()=>openState},playerAccess:access(true)}}]]);
  const e=dockEnv({modules:newer});const dock=e.apply();await settle();const c=dock.querySelector('[data-agm-dock="conditions"]');
  assert.equal(c.hidden,false);assert.equal(c.getAttribute('aria-pressed'),'false');
  c.click();await settle();assert.equal(c.getAttribute('aria-pressed'),'true');c.click();await settle();assert.equal(c.getAttribute('aria-pressed'),'false');
  assert.deepEqual(calls,['toggle','toggle']);
  const older=new Map([['ashen-gate-utilities',{active:true,api:{conditions:{openOverlay:async()=>calls.push('open')},playerAccess:access(true)}}]]);
  calls.length=0;assert.equal(await toggleConditions({modules:older}),true);assert.deepEqual(calls,['open']);
  assert.equal(await conditionsOpen({modules:older}),false);assert.equal(await toggleConditions({modules:new Map()}),false);
  const e2=dockEnv({modules:older});const d2=e2.apply();await settle();assert.equal(d2.querySelector('[data-agm-dock="conditions"]').hidden,false);
  assert.equal(d2.querySelector('[data-agm-dock="conditions"]').getAttribute('aria-pressed'),'false');
});

// ---------- Combat / Settings toggles
function sidebarEnv({expanded=true,tab='chat'}={}){
  const calls=[];
  const popout={rendered:false,close:async()=>{popout.rendered=false;calls.push('popout.close');}};
  const ui={notifications:{warn:()=>{}},sidebar:{expanded,tabGroups:{primary:tab},
    changeTab:t=>{ui.sidebar.tabGroups.primary=t;calls.push(`tab:${t}`);},expand:()=>{ui.sidebar.expanded=true;calls.push('expand');},collapse:()=>{ui.sidebar.expanded=false;calls.push('collapse');}},
    combat:{popout:undefined,renderPopout:()=>{popout.rendered=true;ui.combat.popout=popout;calls.push('popout.open');}}};
  return {ui,calls,popout};
}
test('Combat: first press opens the pop-out, second closes it; aria-pressed follows the real state',async()=>{
  const s=sidebarEnv({expanded:false});const e=dockEnv({ui:s.ui});const dock=e.apply();const b=dock.querySelector('[data-agm-dock="combat"]');
  assert.equal(b.getAttribute('aria-pressed'),'false');
  b.click();await settle();assert.deepEqual(s.calls,['popout.open']);assert.equal(b.getAttribute('aria-pressed'),'true');
  b.click();await settle();assert.deepEqual(s.calls,['popout.open','popout.close']);assert.equal(b.getAttribute('aria-pressed'),'false');
  // closed by the player's own X: the next sync reads the real state
  s.ui.combat.renderPopout();dock.agmSyncPressed();await settle();assert.equal(b.getAttribute('aria-pressed'),'true');s.popout.rendered=false;dock.agmRefresh();await settle();assert.equal(b.getAttribute('aria-pressed'),'false');
});
test('Combat without a pop-out: opens in the sidebar, second press restores the previous tab and the collapsed state',async()=>{
  const s=sidebarEnv({expanded:false,tab:'chat'});delete s.ui.combat;
  const mem={};const peek={tab:null,armed:false};
  assert.equal(openSidebarTab('combat',{ui:s.ui,peek,prefer:'popout',memory:mem}),'tab');assert.equal(isSidebarTabOpen('combat',{ui:s.ui}),true);
  assert.equal(closeSidebarTab('combat',{ui:s.ui,peek,memory:mem}),'tab');
  assert.deepEqual(s.calls,['expand','tab:combat','tab:chat','collapse']);assert.equal(peek.tab,null);assert.equal(isSidebarTabOpen('combat',{ui:s.ui}),false);
  // opened while already expanded: goes back but stays expanded
  const t=sidebarEnv({expanded:true,tab:'journal'});delete t.ui.combat;const m2={};
  openSidebarTab('combat',{ui:t.ui,peek,prefer:'popout',memory:m2});closeSidebarTab('combat',{ui:t.ui,peek,memory:m2});assert.equal(t.ui.sidebar.tabGroups.primary,'journal');assert.equal(t.ui.sidebar.expanded,true);
  assert.equal(closeSidebarTab('combat',{ui:t.ui,peek,memory:{}}),false,'not open: nothing to do');
  assert.equal(closeSidebarTab('combat',{ui:{},peek,memory:{}}),false);
});
test('Settings: second press returns to Chat, re-collapses, and stops the auto-collapse count',async()=>{
  const s=sidebarEnv({expanded:false});
  let armed=0,cancelled=0;
  const e=dockEnv({ui:s.ui});const dock=e.apply({idle:{arm:()=>armed++,cancel:()=>cancelled++}});const b=dock.querySelector('[data-agm-dock="settings"]');
  b.click();await settle();assert.equal(armed,1);assert.equal(s.ui.sidebar.tabGroups.primary,'settings');assert.equal(b.getAttribute('aria-pressed'),'true');
  b.click();await settle();
  assert.equal(s.ui.sidebar.tabGroups.primary,'chat');assert.equal(s.ui.sidebar.expanded,false);assert.equal(cancelled,1);assert.equal(b.getAttribute('aria-pressed'),'false');
  assert.deepEqual(s.calls,['expand','tab:settings','tab:chat','collapse']);
});
test('auto-collapse timer is really cleared by cancel()',()=>{
  let id=0;const live=new Set();const doc=richDoc();add(doc,'section',{id:'sidebar'});
  const ui={sidebar:{expanded:true,tabGroups:{primary:'settings'},changeTab(){}}};
  const idle=createSidebarIdleCollapse({game:{user:{isGM:false}},doc,getUi:()=>ui,appearance:{getState:()=>({autoCollapseSeconds:8})},collapse:()=>true,setTimer:()=>{live.add(++id);return id;},clearTimer:i=>live.delete(i)});
  idle.arm();assert.equal(idle.pending,true);idle.cancel();assert.equal(idle.pending,false);assert.equal(live.size,0);
});

// ---------- wiring
test('wiring: version 0.85.3, changelog, Help, no status wording, GM never affected',()=>{
  const man=JSON.parse(read('../module.json')),log=read('../CHANGELOG.md'),main=read('../scripts/main.js');
  assert.equal(man.version,'0.91.0');assert.ok(man.download.endsWith('/ashen-gate-manager-v0.91.0/ashen-gate-manager.zip'));assert.match(log,/\n## 0\.83\.0 /);assert.match(man.version,/^0\./);
  assert.match(main,/Combat, Conditions, Quest Log, User Settings, Foundry Settings, Ashen Gate/);
  const gm=dockEnv({isGM:true,state:{dockSceneControls:true}});controlsDom(gm.doc);gm.apply();
  assert.equal(gm.doc.body.classList.contains(CONTROLS_CLEAN_CLASS),false);
  for(const f of ['dock-controls','player-dock','sidebar-tabs']){
    const src=read(`../scripts/${f}.js`).replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
    assert.doesNotMatch(src,/libWrapper|Object\.defineProperty|setFlag|updateDocuments|settings\.set|new Proxy/,f);
  }
  assert.doesNotMatch(log.split('## 0.82.0')[0],/\b(Alpha|Beta|Preview)\b/);
});
