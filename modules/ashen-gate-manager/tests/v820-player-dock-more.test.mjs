// 0.82.0 player dock additions: players list, scene controls under the dock, auto-collapse, Quest Tracker / Conditions /
// User Configuration buttons, minimize. Mocked Foundry and DOM: proves logic and wiring, not the live V14 layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FakeDocument,fakeStorage} from '../../../scripts/kit-tests/fake-dom.mjs';
import {createAppearanceController,registerAppearanceSettings,PLAYER_SCREEN_FLAGS,AUTO_COLLAPSE_KEY,DEFAULT_AUTO_COLLAPSE_SECONDS,cleanAutoCollapse} from '../scripts/appearance.js';
import {readGmSetupForm,saveGmSetup} from '../scripts/gm-setup.js';
import {applyPlayersList,createControlsLayout,openUserConfiguration,shouldDockControls,shouldHidePlayersList,PLAYERS_LIST_CLASS,CONTROLS_DOCKED_CLASS} from '../scripts/dock-controls.js';
import {createSidebarIdleCollapse,installSidebarIdleCollapse,hasTypedText} from '../scripts/sidebar-idle.js';
import {DOCK_ID,DOCK_SLOTS,listDockExtras,toggleQuestTracker,openConditions,applyPlayerDock,readDockMinimized,writeDockMinimized,installPlayerDock} from '../scripts/player-dock.js';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));

// ---- mocked DOM helpers
function richDoc(){
  const doc=new FakeDocument();
  const set=new Set();
  doc.body.classList={add:c=>set.add(c),remove:c=>set.delete(c),toggle:(c,on)=>{on?set.add(c):set.delete(c);return on;},contains:c=>set.has(c),set};
  const vars=new Map();
  doc.documentElement={style:{setProperty:(k,v)=>vars.set(k,v),removeProperty:k=>vars.delete(k)}};
  doc.vars=vars;
  doc.querySelector=sel=>sel.startsWith('#')?doc.getElementById(sel.slice(1)):doc.body.querySelector(sel);
  return doc;
}
const add=(doc,tag,attrs={},parent=doc.body)=>{const el=doc.createElement(tag,attrs);parent.append(el);return el;};
function ctl({isGM=true,values={}}={}){
  const store=new Map(Object.entries(values)),writes=[];
  const c=createAppearanceController({currentUser:()=>({id:'u',isGM}),getSetting:k=>k==='worldSkin'?'ag-default':store.get(k),
    setSetting:async(k,v)=>{writes.push([k,v]);store.set(k,v);}});
  return {c,writes,store};
}
const fixed=state=>{const subs=new Set();return {getState:()=>state,subscribe:fn=>{subs.add(fn);return()=>subs.delete(fn);},fire:()=>subs.forEach(f=>f()),subs,set:s=>Object.assign(state,s)};};
const access=on=>({contract:'ag-player-access/1',getState:()=>({contract:'ag-player-access/1',audience:'player',playerAccessEnabled:on})});
const mod=(active,api)=>({active,api});

// ---------- settings
test('settings: players list and scene controls are off by default, GM only, world scope; auto-collapse defaults to 8',async()=>{
  const reg=[];registerAppearanceSettings({game:{settings:{register:(n,k,v)=>reg.push({k,v})}},namespace:'m'});
  for(const key of ['hidePlayersList','dockSceneControls']){
    const s=reg.find(r=>r.k===key).v;assert.deepEqual([s.scope,s.config,s.restricted,s.type,s.default],['world',false,true,Boolean,false]);
    assert.doesNotMatch(`${s.name} ${s.hint}`,/\b(new|beta|alpha|preview)\b/i);
  }
  const a=reg.find(r=>r.k===AUTO_COLLAPSE_KEY).v;
  assert.deepEqual([a.scope,a.config,a.restricted,a.type,a.default],['world',false,true,Number,8]);
  assert.equal(DEFAULT_AUTO_COLLAPSE_SECONDS,8);assert.match(a.name,/Auto-collapse chat and Settings after \(seconds\)/);
  assert.deepEqual(PLAYER_SCREEN_FLAGS.slice(-3,-1).map(f=>f.state),['hidePlayersList','dockSceneControls']);
  const g=ctl();const st=g.c.getState();
  assert.deepEqual([st.hidePlayersList,st.dockSceneControls,st.autoCollapseSeconds],[false,false,8]);
  await g.c.setHidePlayersList(true);await g.c.setDockSceneControls(true);await g.c.setAutoCollapseSeconds(0);
  assert.deepEqual([g.c.getState().hidePlayersList,g.c.getState().dockSceneControls,g.c.getState().autoCollapseSeconds],[true,true,0]);
  await g.c.setAutoCollapseSeconds(9999);assert.equal(g.c.getState().autoCollapseSeconds,600);
  await assert.rejects(()=>g.c.setAutoCollapseSeconds(-1),/0 or more/);await assert.rejects(()=>g.c.setAutoCollapseSeconds('x'),/0 or more/);
  const p=ctl({isGM:false});
  await assert.rejects(()=>p.c.setHidePlayersList(true),/Only GMs/);await assert.rejects(()=>p.c.setDockSceneControls(true),/Only GMs/);await assert.rejects(()=>p.c.setAutoCollapseSeconds(3),/Only GMs/);
  assert.deepEqual(p.writes,[]);
  assert.equal(ctl({values:{[AUTO_COLLAPSE_KEY]:'junk'}}).c.getState().autoCollapseSeconds,8);
  p.c.noteChange(AUTO_COLLAPSE_KEY,12);assert.equal(p.c.getState().autoCollapseSeconds,12);
  assert.equal(cleanAutoCollapse(2.6),3);
});
test('GM Setup form reads and saves the seconds and the two switches; blank leaves it alone',async()=>{
  const boxes={hidePlayersList:{checked:true},dockSceneControls:{checked:true}};
  const mk=val=>({querySelector:s=>{const m=s.match(/data-ag-setup-screen="(\w+)"/);if(m)return boxes[m[1]]??null;return s==='[data-ag-setup-autocollapse]'?{value:val}:null;},querySelectorAll:()=>[]});
  const v=readGmSetupForm(mk('15'));assert.deepEqual([v.hidePlayersList,v.dockSceneControls,v.autoCollapseSeconds],[true,true,15]);
  assert.equal(readGmSetupForm(mk('')).autoCollapseSeconds,undefined);assert.equal(readGmSetupForm(mk('abc')).autoCollapseSeconds,undefined);
  const g=ctl();await saveGmSetup(v,{game:{user:{isGM:true}},moduleId:'m',codexAccessKey:'k',appearance:g.c});
  assert.deepEqual(g.writes.map(w=>w[0]).sort(),['autoCollapseSeconds','dockSceneControls','hidePlayersList']);
  g.writes.length=0;await saveGmSetup(v,{game:{user:{isGM:true}},moduleId:'m',codexAccessKey:'k',appearance:g.c});assert.deepEqual(g.writes,[]);
  await assert.rejects(()=>saveGmSetup(v,{game:{user:{isGM:false}},moduleId:'m',codexAccessKey:'k',appearance:g.c}),/Only the GM/);
});

// ---------- players list
test('players list: hidden only for a player with the setting on; live; idempotent; GM never',()=>{
  const doc=richDoc();
  assert.equal(shouldHidePlayersList({isGM:false,setting:true}),true);assert.equal(shouldHidePlayersList({isGM:true,setting:true}),false);
  applyPlayersList({game:{user:{isGM:false}},doc,state:{hidePlayersList:true}});applyPlayersList({game:{user:{isGM:false}},doc,state:{hidePlayersList:true}});
  assert.equal(doc.body.classList.contains(PLAYERS_LIST_CLASS),true);
  applyPlayersList({game:{user:{isGM:false}},doc,state:{hidePlayersList:false}});assert.equal(doc.body.classList.contains(PLAYERS_LIST_CLASS),false);
  applyPlayersList({game:{user:{isGM:true}},doc,state:{hidePlayersList:true}});assert.equal(doc.body.classList.contains(PLAYERS_LIST_CLASS),false);
  assert.equal(applyPlayersList({game:{user:{isGM:false}},doc:{},state:{hidePlayersList:true}}),false,'no body: no throw');
  const css=read('../styles/player-dock.css');assert.match(css,/body\.agm-hide-players #players\s*\{\s*display:\s*none/);
});

// ---------- user configuration
test('User Configuration opener: V2 sheet, legacy class, none; never throws',()=>{
  const calls=[];const user={id:'p'};
  class V2{constructor(o){calls.push(['v2',o.document]);}render(o){calls.push(['render',o]);}}
  assert.equal(openUserConfiguration({foundryNs:{applications:{sheets:{UserConfig:V2}}},game:{user},globals:{}}),true);
  assert.deepEqual(calls,[['v2',user],['render',{force:true}]]);
  calls.length=0;class Old{constructor(u){calls.push(['old',u]);}render(f){calls.push(['render',f]);}}
  assert.equal(openUserConfiguration({foundryNs:{},game:{user},globals:{UserConfig:Old}}),true);assert.deepEqual(calls,[['old',user],['render',true]]);
  assert.equal(openUserConfiguration({foundryNs:{},game:{user},globals:{}}),false);
  assert.equal(openUserConfiguration({foundryNs:{},game:{},globals:{}}),false);
  class Boom{constructor(){throw new Error('x');}}
  assert.equal(openUserConfiguration({foundryNs:{applications:{sheets:{UserConfig:Boom}}},game:{user},globals:{}}),false);
});

// ---------- dock env
function dockEnv({isGM=false,state={},modules=new Map(),storage=fakeStorage(),openConfig=()=>true}={}){
  const doc=richDoc(),ap=fixed({playerDock:true,playerDockCorner:'top-left',...state}),notes=[];
  const ui={notifications:{warn:m=>notes.push(m)},sidebar:{tabGroups:{primary:'chat'}}};
  const game={user:{isGM,id:'p1'},modules};
  const layout=createControlsLayout({doc,win:{}});
  return {doc,ap,ui,game,notes,storage,layout,apply:()=>applyPlayerDock({game,doc,appearance:ap,getUi:()=>ui,peek:{tab:null,armed:false},storage,layout,openConfig})};
}

test('dock: User Configuration link is always there, is a button, and calls the opener; slot contract is stable',()=>{
  const opened=[];const e=dockEnv({openConfig:a=>{opened.push(a.game.user.id);return true;}});
  const dock=e.apply();const link=dock.querySelector('[data-agm-dock="user-config"]');
  assert.equal(link.tagName,'BUTTON');assert.match(link.querySelector('span').textContent,/User Configuration/);link.click();assert.deepEqual(opened,['p1']);
  const bad=dockEnv({openConfig:()=>false});const d2=bad.apply();d2.querySelector('[data-agm-dock="user-config"]').click();
  return tick().then(()=>{assert.equal(bad.notes.length,1);
    const slots=dock.querySelectorAll('[data-agm-dock-slot]').map(s=>s.dataset.agmDockSlot);
    assert.deepEqual(slots,['portrait','combat','settings','conditions','quest-tracker','user-config','ashen-gate']);
    assert.deepEqual(DOCK_SLOTS.map(s=>s.id),slots);
    const portrait=dock.querySelector('[data-agm-dock-slot="portrait"]');assert.equal(portrait.tagName,'SPAN');assert.equal(portrait.children.length,0);
    assert.equal(portrait.parentElement.className,'agm-dock__head');assert.equal(portrait.parentElement.parentElement,dock);
  });
});

// ---------- scene controls under the dock
test('controls relocation: class, corner and measured sizes while on; removed when off; GM and no-dock do nothing',()=>{
  assert.equal(shouldDockControls({isGM:false,setting:true,dockShown:true}),true);
  assert.equal(shouldDockControls({isGM:true,setting:true,dockShown:true}),false);
  assert.equal(shouldDockControls({isGM:false,setting:true,dockShown:false}),false);
  const e=dockEnv({state:{dockSceneControls:true,playerDockCorner:'bottom-left'}});
  const controls=add(e.doc,'div',{id:'scene-controls'});
  let observed=0;
  e.layout=createControlsLayout({doc:e.doc,win:{ResizeObserver:class{constructor(f){this.f=f;}observe(){observed++;}disconnect(){observed=0;}}}});
  const run=()=>applyPlayerDock({game:e.game,doc:e.doc,appearance:e.ap,getUi:()=>e.ui,peek:{tab:null,armed:false},storage:e.storage,layout:e.layout});
  const dock=run();
  assert.equal(e.doc.body.classList.contains(CONTROLS_DOCKED_CLASS),true);assert.equal(e.doc.body.getAttribute('data-agm-dock-corner'),'bottom-left');
  assert.equal(observed,2);assert.ok(e.doc.vars.has('--agm-dock-h')&&e.doc.vars.has('--agm-controls-h'));
  assert.equal(controls.parentElement,e.doc.body,'the controls element is not re-parented');
  assert.equal(run(),dock,'idempotent');
  e.ap.set({playerDockCorner:'top-right'});run();assert.equal(e.doc.body.getAttribute('data-agm-dock-corner'),'top-right');
  e.ap.set({dockSceneControls:false});run();
  assert.equal(e.doc.body.classList.contains(CONTROLS_DOCKED_CLASS),false);assert.equal(e.doc.vars.size,0);assert.equal(e.doc.body.getAttribute('data-agm-dock-corner'),null);
  e.ap.set({dockSceneControls:true});run();e.ap.set({playerDock:false});run();
  assert.equal(e.doc.body.classList.contains(CONTROLS_DOCKED_CLASS),false,'no dock, nothing moves');
  const gm=dockEnv({isGM:true,state:{dockSceneControls:true}});gm.apply();assert.equal(gm.doc.body.classList.contains(CONTROLS_DOCKED_CLASS),false);
  const css=read('../styles/player-dock.css');
  assert.match(css,/body\.agm-controls-docked #scene-controls/);assert.match(css,/position:\s*fixed !important/);
  assert.doesNotMatch(read('../scripts/dock-controls.js').replace(/\/\*[\s\S]*?\*\//g,''),/appendChild|\.append\(|insertBefore|replaceWith|prepend\(/,'never re-parents core DOM');
});
test('controls layout survives missing ResizeObserver and layout errors',()=>{
  const doc=richDoc();const dock=add(doc,'div');
  const l=createControlsLayout({doc,win:{}});assert.equal(l.enable({dock,corner:'top-left'}),true);assert.equal(l.measure(),true);assert.equal(l.disable(),true);assert.equal(l.disable(),false);
  assert.equal(createControlsLayout({doc:{},win:{}}).enable({dock:null}),true);
});

// ---------- new buttons gated by module and api
test('Quest Tracker and Conditions: shown only when module active, api present and Player Access on',async()=>{
  const calls=[];
  const quest=access=>mod(true,{tracking:{getState:async()=>({visible:false}),set:async p=>calls.push(['set',p])},playerAccess:access});
  const util=access=>mod(true,{conditions:{openOverlay:async()=>calls.push(['overlay'])},playerAccess:access});
  const both=new Map([['ashen-gate-quest-manager',quest(access(true))],['ashen-gate-utilities',util(access(true))]]);
  assert.deepEqual([...await listDockExtras({modules:both})].sort(),['conditions','quest-tracker']);
  for(const [name,m] of [
    ['access off',new Map([['ashen-gate-quest-manager',quest(access(false))],['ashen-gate-utilities',util(access(false))]])],
    ['inactive',new Map([['ashen-gate-quest-manager',mod(false,quest(access(true)).api)],['ashen-gate-utilities',mod(false,util(access(true)).api)]])],
    ['no api function',new Map([['ashen-gate-quest-manager',mod(true,{tracking:{},playerAccess:access(true)})],['ashen-gate-utilities',mod(true,{conditions:{},playerAccess:access(true)})]])],
    ['no contract',new Map([['ashen-gate-quest-manager',quest({contract:'x',getState:()=>({})})],['ashen-gate-utilities',util(undefined)]])],
    ['throws',new Map([['ashen-gate-quest-manager',quest({contract:'ag-player-access/1',getState:()=>{throw new Error('boom');}})]])],
    ['none',new Map()]
  ]) assert.equal((await listDockExtras({modules:m})).size,0,name);
  assert.equal((await listDockExtras({modules:undefined})).size,0);
  // in the dock
  const e=dockEnv({modules:both});const dock=e.apply();await tick();await tick();
  const q=dock.querySelector('[data-agm-dock="quest-tracker"]'),c=dock.querySelector('[data-agm-dock="conditions"]');
  assert.equal(q.hidden,false);assert.equal(c.hidden,false);
  q.click();await tick();await tick();c.click();await tick();assert.deepEqual(calls,[['set',{visible:true}],['overlay']]);
  const none=dockEnv({modules:new Map()});const d2=none.apply();await tick();
  assert.equal(d2.querySelector('[data-agm-dock="quest-tracker"]').hidden,true);assert.equal(d2.querySelector('[data-agm-dock="conditions"]').hidden,true);
  // access turned off later: the next apply hides them
  const flip={on:true};const m2=new Map([['ashen-gate-quest-manager',quest({contract:'ag-player-access/1',getState:()=>({contract:'ag-player-access/1',audience:'player',playerAccessEnabled:flip.on})})]]);
  const e3=dockEnv({modules:m2});const d3=e3.apply();await tick();await tick();assert.equal(d3.querySelector('[data-agm-dock="quest-tracker"]').hidden,false);
  flip.on=false;e3.apply();await tick();await tick();assert.equal(d3.querySelector('[data-agm-dock="quest-tracker"]').hidden,true);
});
test('Quest Tracker toggles the visible flag; Conditions opens the overlay; missing api returns false',async()=>{
  const sets=[];let visible=true;
  const m=new Map([['ashen-gate-quest-manager',mod(true,{tracking:{getState:()=>({visible}),set:async p=>sets.push(p)}})]]);
  assert.equal(await toggleQuestTracker({modules:m}),true);assert.deepEqual(sets,[{visible:false}]);
  assert.equal(await toggleQuestTracker({modules:new Map()}),false);assert.equal(await openConditions({modules:new Map()}),false);
  await assert.rejects(()=>toggleQuestTracker({modules:new Map([['ashen-gate-quest-manager',mod(true,{tracking:{getState:()=>{throw new Error('hidden');},set(){}}})]])}),/hidden/);
});

// ---------- minimize
test('minimize: a keyboard-reachable button folds the dock to a handle, restores, and is remembered per user',()=>{
  const storage=fakeStorage();const e=dockEnv({storage});const dock=e.apply();
  const toggle=dock.querySelector('[data-agm-dock="minimize"]'),body=dock.querySelector(`[id="${DOCK_ID}-body"]`);
  assert.equal(toggle.tagName,'BUTTON');assert.equal(toggle.getAttribute('type'),'button');assert.ok(toggle.getAttribute('aria-label'));assert.ok(toggle.getAttribute('data-tooltip'));
  assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(body.hidden,false);assert.equal(dock.getAttribute('data-minimized'),'false');
  toggle.click();
  assert.equal(body.hidden,true);assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(dock.getAttribute('data-minimized'),'true');
  assert.equal(toggle.getAttribute('aria-label'),'Show the player dock');assert.equal(dock.contains(toggle),true,'handle stays');
  assert.equal(readDockMinimized(storage,'p1'),true);assert.equal(readDockMinimized(storage,'other'),false,'per user');
  // reload: a fresh dock starts minimized
  const e2=dockEnv({storage});const d2=e2.apply();assert.equal(d2.getAttribute('data-minimized'),'true');assert.equal(d2.querySelector(`[id="${DOCK_ID}-body"]`).hidden,true);
  d2.querySelector('[data-agm-dock="minimize"]').click();assert.equal(readDockMinimized(storage,'p1'),false);assert.equal(storage.map.size,0);
  // closes the Ashen Gate menu when minimizing
  assert.equal(typeof dock.agmSetMinimized,'function');
});
test('minimize: storage failures never throw',()=>{
  const bad={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');},removeItem(){throw new Error('blocked');}};
  assert.equal(readDockMinimized(bad,'u'),false);assert.equal(writeDockMinimized(bad,'u',true),false);assert.equal(readDockMinimized(null,'u'),false);
  const e=dockEnv({storage:bad});const dock=e.apply();dock.querySelector('[data-agm-dock="minimize"]').click();assert.equal(dock.getAttribute('data-minimized'),'true');
});

// ---------- auto-collapse
function clock(){let now=0,seq=0,jobs=[];
  return {setTimer:(fn,ms)=>{const id=++seq;jobs.push({id,at:now+ms,fn});return id;},clearTimer:id=>{jobs=jobs.filter(j=>j.id!==id);},
    advance(ms){const end=now+ms;for(;;){const next=jobs.filter(j=>j.at<=end).sort((a,b)=>a.at-b.at)[0];if(!next)break;jobs=jobs.filter(j=>j!==next);now=next.at;next.fn();}now=end;},get pending(){return jobs.length;}};
}
function idleEnv({isGM=false,seconds=8,tab='chat',collapsed=false}={}){
  const doc=richDoc(),ck=clock(),ap=fixed({autoCollapseSeconds:seconds});
  const sidebar=add(doc,'section',{id:'sidebar'});
  const set=new Set(collapsed?['collapsed']:[]);sidebar.classList={contains:c=>set.has(c),set};
  const field=add(doc,'textarea',{},sidebar);
  const ui={sidebar:{tabGroups:{primary:tab},changeTab:(t)=>{ui.sidebar.tabGroups.primary=t;calls.push(['changeTab',t]);}}};
  const calls=[];
  const idle=createSidebarIdleCollapse({game:{user:{isGM}},doc,getUi:()=>ui,appearance:ap,collapse:()=>{calls.push(['collapse']);set.add('collapsed');return true;},setTimer:ck.setTimer,clearTimer:ck.clearTimer,onCollapsed:()=>calls.push(['reapply'])});
  idle.bind();
  return {doc,ck,ap,sidebar,field,ui,calls,idle,set};
}
test('auto-collapse: collapses after N seconds idle, not before',()=>{
  const e=idleEnv({seconds:8});e.idle.arm();
  e.ck.advance(7999);assert.deepEqual(e.calls,[]);e.ck.advance(1);assert.deepEqual(e.calls,[['collapse'],['reapply']]);
  assert.equal(e.idle.pending,false);
});
test('auto-collapse: any activity resets the timer',()=>{
  const e=idleEnv({seconds:8});e.idle.arm();
  e.ck.advance(6000);e.sidebar.dispatch('keydown',{key:'a'});e.ck.advance(6000);assert.deepEqual(e.calls,[],'reset at 6s');
  e.sidebar.dispatch('pointermove');e.ck.advance(7999);assert.deepEqual(e.calls,[]);e.ck.advance(1);assert.equal(e.calls[0][0],'collapse');
});
test('auto-collapse: paused while the pointer is over it; counts again after it leaves',()=>{
  const e=idleEnv();e.idle.arm();e.sidebar.dispatch('pointerenter');
  e.ck.advance(60000);assert.deepEqual(e.calls,[]);assert.equal(e.idle.pending,false);
  e.sidebar.dispatch('pointerleave');e.ck.advance(7999);assert.deepEqual(e.calls,[]);e.ck.advance(1);assert.equal(e.calls[0][0],'collapse');
});
test('auto-collapse: never while text is typed, the cursor is in a field, or a dialog / menu is open',()=>{
  const e=idleEnv();e.idle.arm();e.field.value='half a message';
  e.ck.advance(80000);assert.deepEqual(e.calls,[],'text in the chat box');assert.equal(hasTypedText(e.sidebar),true);
  e.field.value='  ';e.doc.activeElement=e.field;e.ck.advance(80000);assert.deepEqual(e.calls,[],'focus in the empty chat box');
  e.doc.activeElement=null;
  const dialog=add(e.doc,'dialog',{open:''});e.ck.advance(80000);assert.deepEqual(e.calls,[],'dialog open');dialog.remove();
  const menu=add(e.doc,'div',{class:'context-menu'});e.ck.advance(80000);assert.deepEqual(e.calls,[],'context menu open');menu.remove();
  let dockMenu=true;const e2=idleEnv();
  const idle2=createSidebarIdleCollapse({game:{user:{isGM:false}},doc:e2.doc,getUi:()=>e2.ui,appearance:e2.ap,collapse:()=>{e2.calls.push(['collapse']);return true;},isDockMenuOpen:()=>dockMenu,setTimer:e2.ck.setTimer,clearTimer:e2.ck.clearTimer});
  idle2.arm();e2.ck.advance(30000);assert.deepEqual(e2.calls,[],'dock menu open');dockMenu=false;e2.ck.advance(8000);assert.equal(e2.calls[0][0],'collapse','collapses once it is closed');
  // after the blockers go, the original collapses on its next wait
  e.ck.advance(8000);assert.equal(e.calls[0][0],'collapse');
});
test('auto-collapse: a focused button does not hold the sidebar open',()=>{
  const e=idleEnv();const button=add(e.doc,'button',{},e.sidebar);e.doc.activeElement=button;e.idle.arm();e.ck.advance(8000);assert.equal(e.calls[0][0],'collapse');
});
test('auto-collapse: off at 0, never for the GM, never when already collapsed or on another tab; Settings goes back to Chat first',()=>{
  const off=idleEnv({seconds:0});assert.equal(off.idle.arm(),false);off.ck.advance(99999);assert.deepEqual(off.calls,[]);
  const gm=idleEnv({isGM:true});assert.equal(gm.idle.arm(),false);gm.ck.advance(99999);assert.deepEqual(gm.calls,[]);
  const closed=idleEnv({collapsed:true});assert.equal(closed.idle.arm(),false);
  const other=idleEnv({tab:'journal'});assert.equal(other.idle.arm(),false);
  const settings=idleEnv({tab:'settings'});settings.idle.arm();settings.ck.advance(8000);
  assert.deepEqual(settings.calls.map(c=>c[0]),['changeTab','collapse','reapply']);assert.equal(settings.ui.sidebar.tabGroups.primary,'chat');
  const live=idleEnv();live.idle.arm();live.ap.set({autoCollapseSeconds:0});live.idle.refresh();assert.equal(live.idle.pending,false,'turning it off cancels the pending collapse');
  live.ap.set({autoCollapseSeconds:2});live.idle.refresh();live.ck.advance(2000);assert.equal(live.calls[0][0],'collapse');
});
test('auto-collapse: installs on the render hook and setting changes; dispose clears; the dock arms it when Settings opens',()=>{
  const e=idleEnv();const reg=[];const hooks={on:(n,f)=>{reg.push([n,f]);return reg.length;},off:()=>{}};
  const inst=installSidebarIdleCollapse({hooks,game:{user:{isGM:false}},doc:e.doc,getUi:()=>e.ui,appearance:e.ap,collapse:()=>{e.calls.push(['collapse']);return true;},setTimer:e.ck.setTimer,clearTimer:e.ck.clearTimer});
  assert.equal(inst.idle.pending,true,'armed at install when the sidebar is open');
  assert.equal(reg[0][0],'renderSidebar');assert.equal(e.ap.subs.size,1);
  inst.stop();assert.equal(inst.idle.pending,false);assert.equal(e.ap.subs.size,0);
  let armed=0;const d=dockEnv();const dock=applyPlayerDock({game:d.game,doc:d.doc,appearance:d.ap,getUi:()=>d.ui,peek:{tab:null,armed:false},storage:d.storage,layout:d.layout,idle:{arm:()=>armed++}});
  d.ui.sidebar.changeTab=()=>{};dock.querySelector('[data-agm-dock="settings"]').click();assert.equal(armed,1);
});

// ---------- wiring
test('wiring: GM Setup field and Help, hooks, no wrapping of core methods, version 0.83.0, no status labels',()=>{
  const tpl=read('../templates/manager.hbs'),main=read('../scripts/main.js'),man=JSON.parse(read('../module.json')),log=read('../CHANGELOG.md');
  assert.match(tpl,/aria-label="Scene controls and navigation"[\s\S]*data-ag-setup-screen="dockSceneControls"[\s\S]*data-ag-setup-screen="hidePlayersList"[\s\S]*data-ag-setup-autocollapse/);
  assert.match(tpl,/Auto-collapse chat and Settings after \(seconds\)/);
  assert.match(main,/installSidebarIdleCollapse\(/);assert.match(main,/<em>Auto-collapse chat and Settings after \(seconds\)<\/em>/);
  assert.match(main,/<em>Hide the players list from players<\/em>/);assert.match(main,/<em>Quest Tracker<\/em>/);
  assert.equal(man.version,'0.84.0');assert.ok(man.download.endsWith('/ashen-gate-manager-v0.84.0/ashen-gate-manager.zip'));assert.match(log,/\n## 0\.83\.0 /);
  for(const f of ['dock-controls','sidebar-idle','player-dock']){
    const src=read(`../scripts/${f}.js`).replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
    assert.doesNotMatch(src,/\.prototype|libWrapper|Object\.defineProperty|ownership|setFlag|updateDocuments|settings\.set|new Proxy/,f);
  }
  const css=read('../styles/player-dock.css');assert.match(css,/prefers-reduced-motion/);assert.match(css,/agm-dock__toggle:focus-visible/);
});
test('installPlayerDock hooks both renders and cleans up (controls released)',()=>{
  const e=dockEnv({state:{dockSceneControls:true}});const reg=[];const off=[];
  const stop=installPlayerDock({game:e.game,hooks:{on:(n,f)=>{reg.push(n);return reg.length;},off:(n)=>off.push(n)},doc:e.doc,getUi:()=>e.ui,appearance:e.ap,layout:e.layout});
  assert.deepEqual(reg.slice(0,2),['renderSidebar','renderSceneControls']);assert.equal(e.doc.body.classList.contains(CONTROLS_DOCKED_CLASS),true);
  stop();assert.deepEqual(off.slice(0,2),['renderSidebar','renderSceneControls']);assert.equal(e.doc.body.classList.contains(CONTROLS_DOCKED_CLASS),false);assert.equal(e.doc.getElementById(DOCK_ID),null);
});
