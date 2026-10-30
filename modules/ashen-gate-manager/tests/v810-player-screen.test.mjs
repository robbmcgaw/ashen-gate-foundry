// 0.82.0 clean player screen: scene control groups, collapsed start, player dock. Mocked Foundry: proves
// logic and wiring, not the live V14 sidebar, scene controls or dock placement.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FakeDocument} from '../../../scripts/kit-tests/fake-dom.mjs';
import {createAppearanceController,registerAppearanceSettings,PLAYER_SCREEN_FLAGS,DOCK_CORNER_KEY} from '../scripts/appearance.js';
import {readGmSetupForm,saveGmSetup} from '../scripts/gm-setup.js';
import {removeControlGroups,hideSceneControlsDom,leaveRemovedControl,refreshSceneControls,installSceneControlHider} from '../scripts/scene-controls.js';
import {KNOWN_TABS,applySidebarTabs,openSidebarTab,listTabIds} from '../scripts/sidebar-tabs.js';
import {presetPolicy} from '../scripts/sidebar-policy.js';
import {startSidebarCollapsed,collapseSidebar} from '../scripts/sidebar-collapse.js';
import {DOCK_ID,DOCK_SLOTS,DOCK_LAUNCHERS,listDockLaunchers,applyPlayerDock,installPlayerDock} from '../scripts/player-dock.js';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
function ctl({isGM=true,values={}}={}){
  const store=new Map(Object.entries(values)),writes=[];
  const c=createAppearanceController({currentUser:()=>({id:'u',isGM}),getSetting:k=>k==='worldSkin'?'ag-default':store.get(k),
    setSetting:async(k,v)=>{writes.push([k,v]);store.set(k,v);}});
  return {c,writes,store};
}
const fixed=state=>{const subs=new Set();return {getState:()=>state,subscribe:fn=>{subs.add(fn);return()=>subs.delete(fn);},fire:()=>subs.forEach(f=>f()),subs,set:s=>Object.assign(state,s)};};
const player={user:{isGM:false}},gm={user:{isGM:true}};

test('settings: hidden, restricted world values, off by default, plain wording; corner is a GM choice',()=>{
  const reg=[];registerAppearanceSettings({game:{settings:{register:(n,k,v)=>reg.push({k,v})}},namespace:'m'});
  assert.deepEqual(PLAYER_SCREEN_FLAGS.map(f=>f.state),['hideSceneTools','collapsePlayerSidebar','playerDock','hidePlayersList','dockSceneControls','pullSceneNavigationLeft']);
  for(const f of PLAYER_SCREEN_FLAGS){
    const s=reg.find(r=>r.k===f.key).v;
    assert.deepEqual([s.scope,s.config,s.restricted,s.type,s.default],['world',false,true,Boolean,false]);
    assert.doesNotMatch(`${s.name} ${s.hint}`,/\b(new|beta|alpha|preview)\b|[A-Z]{3,}-/i);
  }
  assert.deepEqual(PLAYER_SCREEN_FLAGS.map(f=>f.name),["Hide Region Controls and Journal Notes from players' scene controls",'Start players with the sidebar collapsed','Show the player dock','Hide the players list from players',"Move players' scene controls under the player dock",'Pull the scene navigation to the left']);
  const c=reg.find(r=>r.k===DOCK_CORNER_KEY).v;
  assert.deepEqual([c.scope,c.restricted,c.default],['world',true,'top-left']);assert.deepEqual(Object.keys(c.choices),['top-left','top-right','bottom-left','bottom-right']);
});

test('controller: defaults off, GM sets each, players are refused in the data layer, corner validated',async()=>{
  const g=ctl();const st=g.c.getState();
  assert.deepEqual([st.hideSceneTools,st.collapsePlayerSidebar,st.playerDock,st.playerDockCorner],[false,false,false,'top-left']);
  for(const f of PLAYER_SCREEN_FLAGS){await g.c[f.setter](true);assert.equal(g.c.getState()[f.state],true);}
  await g.c.setPlayerDockCorner('bottom-left');assert.equal(g.c.getState().playerDockCorner,'bottom-left');
  await assert.rejects(()=>g.c.setPlayerDockCorner('middle'),/Unknown/);
  const p=ctl({isGM:false});
  for(const f of PLAYER_SCREEN_FLAGS)await assert.rejects(()=>p.c[f.setter](true),/Only GMs/);
  await assert.rejects(()=>p.c.setPlayerDockCorner('top-right'),/Only GMs/);assert.deepEqual(p.writes,[]);
  const seen=[];p.c.subscribe(s=>seen.push(s.hideSceneTools));p.c.noteChange('hidePlayerSceneTools',true);assert.deepEqual(seen,[true]);
  p.c.noteChange(DOCK_CORNER_KEY,'top-right');assert.equal(p.c.getState().playerDockCorner,'top-right');
  assert.equal(ctl({values:{[DOCK_CORNER_KEY]:'bogus'}}).c.getState().playerDockCorner,'top-left');
});

test('GM Setup form reads the new controls and saves only what changed',async()=>{
  const boxes=Object.fromEntries(PLAYER_SCREEN_FLAGS.map(f=>[f.state,{checked:f.state!=='playerDock'}]));
  const root={querySelector:s=>{const m=s.match(/data-ag-setup-screen="(\w+)"/);if(m)return boxes[m[1]];return s==='[data-ag-setup-dock-corner]:checked'?{value:'top-right'}:null;},querySelectorAll:()=>[]};
  const v=readGmSetupForm(root);
  assert.deepEqual([v.hideSceneTools,v.collapsePlayerSidebar,v.playerDock,v.playerDockCorner],[true,true,false,'top-right']);
  const g=ctl();
  const out=await saveGmSetup(v,{game:gm,moduleId:'m',codexAccessKey:'k',appearance:g.c});
  assert.equal(out.ok,true);assert.equal(g.writes.length,6);
  g.writes.length=0;await saveGmSetup(v,{game:gm,moduleId:'m',codexAccessKey:'k',appearance:g.c});assert.deepEqual(g.writes,[],'idempotent');
  assert.equal(readGmSetupForm({querySelector:()=>null,querySelectorAll:()=>[]}).hideSceneTools,undefined);
  await assert.rejects(()=>saveGmSetup(v,{game:player,moduleId:'m',codexAccessKey:'k',appearance:g.c}),/Only the GM/);
});

// ---------- scene controls
test('scene controls: groups removed from an object or an array, other groups kept',()=>{
  const o={tokens:{},regions:{},notes:{},walls:{}};assert.deepEqual(removeControlGroups(o).sort(),['notes','regions']);assert.deepEqual(Object.keys(o),['tokens','walls']);
  const a=[{name:'token'},{name:'regions'},{name:'notes'}];removeControlGroups(a);assert.deepEqual(a.map(x=>x.name),['token']);
  assert.deepEqual(removeControlGroups(undefined),[]);removeControlGroups(null);removeControlGroups(5);
});
function controlsDom(){
  const mk=name=>{const li={hidden:false,dataset:{},style:{setProperty(){li.shown=false;},removeProperty(){li.shown=true;}}};const b={closest:s=>s==='li'?li:null};return {name,li,b};};
  const items=['tokens','regions','notes'].map(mk);
  return {items,doc:{querySelectorAll:sel=>{assert.match(sel,/^#scene-controls \[data-control="regions"\], #scene-controls \[data-control="notes"\]$/);return items.filter(i=>i.name!=='tokens').map(i=>i.b);}}};
}
test('scene controls: DOM fallback hides then restores exactly what it hid, idempotently',()=>{
  const d=controlsDom();
  assert.equal(hideSceneControlsDom(d.doc,true),2);hideSceneControlsDom(d.doc,true);
  assert.deepEqual(d.items.map(i=>i.li.hidden),[false,true,true]);
  hideSceneControlsDom(d.doc,false);assert.deepEqual(d.items.map(i=>i.li.hidden),[false,false,false]);
  assert.equal(hideSceneControlsDom(d.doc,false),0);assert.equal(hideSceneControlsDom(undefined,true),0);
});
test('scene controls: open removed group falls back to tokens; missing APIs never throw',()=>{
  const calls=[];
  const ui={controls:{control:{name:'notes'},controls:{tokens:{},notes:{}},activate:o=>calls.push(o)}};
  assert.equal(leaveRemovedControl(ui),true);assert.deepEqual(calls,[{control:'tokens'}]);
  assert.equal(leaveRemovedControl({controls:{control:{name:'tokens'},activate:()=>assert.fail()}}),false);
  assert.equal(leaveRemovedControl({controls:{control:{name:'notes'}}}),false);assert.equal(leaveRemovedControl(undefined),false);
  const old={controls:{activeControl:'notes',controls:[{name:'token'}],activate:o=>calls.push(o)}};leaveRemovedControl(old);assert.deepEqual(calls[1],{control:'token'});
  assert.equal(refreshSceneControls({}),false);assert.equal(refreshSceneControls({controls:{render:()=>{}}}),true);
  assert.equal(refreshSceneControls({controls:{initialize:()=>{throw new Error('x');}}}),false);
});
function hooksMock(){const reg=[];return {reg,on:(n,f)=>{reg.push([n,f]);return reg.length;},off:(n,id)=>{reg[id-1]=null;},fire:(n,...a)=>reg.filter(Boolean).filter(r=>r[0]===n).forEach(r=>r[1](...a))};}
test('scene controls: hook is inert until attached, players only, live on change, idempotent',()=>{
  const d=controlsDom(),h=hooksMock();let rebuilt=0;
  const ui={controls:{initialize:()=>rebuilt++}};
  const hider=installSceneControlHider({game:player,hooks:h,doc:d.doc,getUi:()=>ui});
  const ctrls={tokens:{},regions:{},notes:{}};h.fire('getSceneControlButtons',ctrls);assert.deepEqual(Object.keys(ctrls),['tokens','regions','notes'],'off until attached');
  const ap=fixed({hideSceneTools:true});hider.attach(ap);
  assert.deepEqual(d.items.map(i=>i.li.hidden),[false,true,true]);assert.equal(rebuilt,1);
  h.fire('getSceneControlButtons',ctrls);assert.deepEqual(Object.keys(ctrls),['tokens']);
  hider.apply();hider.apply();assert.equal(rebuilt,1,'no rebuild when nothing changed');
  ap.set({hideSceneTools:false});ap.fire();assert.deepEqual(d.items.map(i=>i.li.hidden),[false,false,false]);assert.equal(rebuilt,2);
  h.fire('getSceneControlButtons',{regions:1});
  const g=installSceneControlHider({game:gm,hooks:hooksMock(),doc:controlsDom().doc,getUi:()=>ui});
  const gh=g;const c2={regions:1};gh.attach(fixed({hideSceneTools:true}));assert.equal(c2.regions,1);
  hider.stop();assert.ok(h.reg.every(r=>r===null));
});

// ---------- sidebar
function sidebarDom(extra=[]){
  const ids=[...KNOWN_TABS,...extra],tabs={};
  for(const id of ids){
    const li={hidden:false,dataset:{},style:{setProperty(){},removeProperty(){}},closest:s=>s==='#sidebar-tabs'?{}:null};
    const button={dataset:{tab:id},closest:s=>s==='#sidebar-tabs li'?li:null};
    const panel={hidden:false,dataset:{},style:{setProperty(){},removeProperty(){}},closest:()=>null};
    tabs[id]={li,button,panel};
  }
  const classes=new Set();
  return {tabs,classes,doc:{body:{classList:{toggle:(c,on)=>on?classes.add(c):classes.delete(c)}},
    querySelectorAll:sel=>{if(sel==='#sidebar-tabs [data-tab]')return ids.map(i=>tabs[i].button);const m=sel.match(/data-tab="(\w+)"/);return m&&tabs[m[1]]?[tabs[m[1]].button,tabs[m[1]].panel]:[];}}};
}
const hiddenTabs=d=>Object.entries(d.tabs).filter(([,t])=>t.li.hidden).map(([k])=>k);
const hiddenPanels=d=>Object.entries(d.tabs).filter(([,t])=>t.panel.hidden).map(([k])=>k);
function uiMock(active='combat'){const calls=[];const ui={calls,sidebar:{tabGroups:{primary:active},changeTab:(t,g)=>{calls.push(['changeTab',t,g]);ui.sidebar.tabGroups.primary=t;},expand:()=>calls.push(['expand'])}};return ui;}

test('openSidebarTab: peek shows the panel only, until another tab is chosen; pop-out preferred for Combat',()=>{
  const d=sidebarDom(),ui=uiMock('chat'),ap=fixed({playerSidebarTabs:presetPolicy('chat')}),peek={tab:null,armed:false};
  applySidebarTabs({game:player,doc:d.doc,ui,appearance:ap,peek});
  const reapply=()=>applySidebarTabs({game:player,doc:d.doc,ui,appearance:ap,peek});
  assert.equal(openSidebarTab('settings',{ui,peek,prefer:'tab',reapply}),'tab');
  assert.deepEqual(ui.calls,[['expand'],['changeTab','settings','primary']]);
  assert.equal(d.tabs.settings.li.hidden,true,'button stays hidden');assert.equal(d.tabs.settings.panel.hidden,false,'panel is shown');
  assert.equal(ui.sidebar.tabGroups.primary,'settings','not bounced back to Chat');
  reapply();assert.equal(d.tabs.settings.panel.hidden,false,'stable across renders');
  ui.sidebar.changeTab('chat','primary');reapply();assert.equal(d.tabs.settings.panel.hidden,true,'hidden again after the player leaves');
  // pop-out route
  const pops=[];const ui2={combat:{renderPopout:()=>pops.push(1)},sidebar:ui.sidebar};
  assert.equal(openSidebarTab('combat',{ui:ui2,peek,prefer:'popout'}),'popout');assert.equal(pops.length,1);
  assert.equal(openSidebarTab('combat',{ui:{sidebar:ui.sidebar},peek,prefer:'popout'}),'tab','falls back to the tab');
  assert.equal(openSidebarTab('combat',{ui:{},peek}),false);assert.equal(openSidebarTab('combat',{ui:undefined,peek}),false);
  assert.equal(openSidebarTab('combat',{ui:{combat:{renderPopout:()=>{throw new Error('x');}}},peek,prefer:'popout'}),false);
});

// ---------- collapse
test('collapse: once, players only, own toggling untouched, falls back, waits for the first render',()=>{
  const calls=[];const ui={sidebar:{collapse:()=>calls.push('collapse'),rendered:true}};
  const on=fixed({collapsePlayerSidebar:true});
  const s=startSidebarCollapsed({game:player,hooks:hooksMock(),getUi:()=>ui,appearance:on});
  assert.equal(s.run(),true);assert.equal(s.run(),false);assert.equal(s.run(),false);assert.deepEqual(calls,['collapse'],'never closed again');assert.equal(s.done,true);
  assert.equal(startSidebarCollapsed({game:gm,hooks:hooksMock(),getUi:()=>ui,appearance:on}).run(),false);
  assert.equal(startSidebarCollapsed({game:player,hooks:hooksMock(),getUi:()=>ui,appearance:fixed({collapsePlayerSidebar:false})}).run(),false);assert.equal(calls.length,1);
  const t=[];assert.equal(collapseSidebar({sidebar:{toggleExpanded:v=>t.push(v)}}),true);assert.deepEqual(t,[false]);
  assert.equal(collapseSidebar({}),false);assert.equal(collapseSidebar(undefined),false);assert.equal(collapseSidebar({sidebar:{collapse:()=>{throw new Error('x');}}}),false);
  const h=[];const late={sidebar:{rendered:false,collapse:()=>calls.push('late')}};
  const w=startSidebarCollapsed({game:player,hooks:{once:(n,f)=>{h.push([n,f]);}},getUi:()=>late,appearance:on});
  assert.equal(w.run(),false);w.run();assert.equal(h.length,1);late.sidebar.rendered=true;h[0][1]();assert.deepEqual(calls.slice(1),['late']);
});

// ---------- dock
const mod=(active,api)=>({active,api});
const access=(on,extra={})=>({contract:'ag-player-access/1',getState:()=>({contract:'ag-player-access/1',moduleId:'x',audience:'player',playerAccessEnabled:on,configurable:true,...extra}),setEnabled(){}});
test('dock launchers: only active modules with open() and Player Access on; absent ones skipped; GM-only audience skipped',async()=>{
  const opened=[];
  const m=new Map([
    ['ashen-gate-quest-manager',mod(true,{open:()=>opened.push('quest'),playerAccess:access(true)})],
    ['ashen-gate-factions',mod(true,{open:()=>{},playerAccess:access(false)})],
    ['ashen-gate-locations',mod(false,{open:()=>{},playerAccess:access(true)})],
    ['ashen-gate-skill-trees',mod(true,{playerAccess:access(true)})],
    ['ashen-gate-headquarters',mod(true,{open:()=>{},playerAccess:{contract:'other',getState:()=>({})}})],
    ['ashen-gate-cinders',mod(true,{open:()=>{},playerAccess:{contract:'ag-player-access/1',getState:()=>{throw new Error('boom');}}})],
    ['ashen-gate-profession-ledger',mod(true,{open:()=>{},playerAccess:{...access(true),getState:async()=>({contract:'ag-player-access/1',audience:'gm-only',playerAccessEnabled:true})}})],
    ['ashen-gate-utilities',mod(true,{open:()=>opened.push('utilities'),playerAccess:{...access(true),getState:async()=>({contract:'ag-player-access/1',audience:'player',playerAccessEnabled:true})}})]
  ]);
  const list=await listDockLaunchers({modules:m});
  assert.deepEqual(list.map(x=>x.label),['Quest Log','Utilities']);
  await list[0].open();assert.deepEqual(opened,['quest']);
  assert.deepEqual(await listDockLaunchers({modules:new Map()}),[]);assert.deepEqual(await listDockLaunchers({modules:undefined}),[]);
  const loose=await listDockLaunchers({modules:m,isGM:true});assert.ok(loose.length>list.length);
  assert.deepEqual(DOCK_LAUNCHERS.map(l=>l.id).filter(id=>!id.startsWith('ashen-gate-')),[]);
});

function dockEnv({isGM=false,state={playerDock:true,playerDockCorner:'top-left'},modules=new Map()}={}){
  const doc=new FakeDocument(),ap=fixed(state),notes=[];
  const ui=uiMock('chat');ui.notifications={warn:m=>notes.push(m)};
  const game={user:{isGM},modules};
  return {doc,ap,ui,game,notes,apply:()=>applyPlayerDock({game,doc,appearance:ap,getUi:()=>ui,peek:{tab:null,armed:false}})};
}
test('dock: hidden for GM and when off, drawn for players, live corner change, idempotent, reserved empty portrait slot',()=>{
  const g=dockEnv({isGM:true});assert.equal(g.apply(),null);assert.equal(g.doc.getElementById(DOCK_ID),null);
  const off=dockEnv({state:{playerDock:false}});assert.equal(off.apply(),null);
  const e=dockEnv();const d1=e.apply(),d2=e.apply();assert.equal(d1,d2);assert.equal(e.doc.body.children.length,1);
  assert.equal(d1.getAttribute('data-corner'),'top-left');e.ap.set({playerDockCorner:'bottom-left'});e.apply();assert.equal(d1.getAttribute('data-corner'),'bottom-left');
  const slots=d1.querySelectorAll('[data-agm-dock-slot]').map(s=>s.dataset.agmDockSlot);assert.deepEqual(slots,DOCK_SLOTS.map(s=>s.id));
  assert.equal(d1.querySelector('[data-agm-dock-slot="portrait"]').children.length,0,'portrait slot reserved and empty');
  e.ap.set({playerDock:false});e.apply();assert.equal(e.doc.getElementById(DOCK_ID),null);
});
test('dock: buttons are real buttons with tooltips; Combat and Settings open their tabs; failures notify',()=>{
  const e=dockEnv();const dock=e.apply();
  const btns=dock.querySelectorAll('button');assert.equal(btns.length,7);
  for(const b of btns){assert.equal(b.getAttribute('type'),'button');assert.ok(b.getAttribute('data-tooltip')||b.getAttribute('aria-label'));if(b.getAttribute('data-agm-dock')!=='minimize')assert.ok(b.querySelector('span').textContent);}
  dock.querySelector('[data-agm-dock="settings"]').click();assert.deepEqual(e.ui.calls.at(-1),['changeTab','settings','primary']);
  const pops=[];e.ui.combat={renderPopout:()=>pops.push(1)};dock.querySelector('[data-agm-dock="combat"]').click();assert.equal(pops.length,1);
  const bare=dockEnv();bare.ui.sidebar=undefined;bare.apply().querySelector('[data-agm-dock="combat"]').click();assert.equal(bare.notes.length,1);
});
test('dock menu: lists permitted windows, keyboard moves, Escape closes and returns focus, outside click closes',async()=>{
  const opened=[];
  const e=dockEnv({modules:new Map([['ashen-gate-quest-manager',mod(true,{open:()=>opened.push('q'),playerAccess:access(true)})],['ashen-gate-locations',mod(true,{open:()=>opened.push('l'),playerAccess:access(true)})]])});
  const dock=e.apply();const trigger=dock.querySelector('[data-agm-dock="ashen-gate"]'),menu=dock.querySelector('[role="menu"]');
  assert.equal(trigger.getAttribute('aria-haspopup'),'menu');assert.equal(trigger.getAttribute('aria-expanded'),'false');assert.equal(menu.hidden,true);
  trigger.click();await new Promise(r=>setTimeout(r,0));
  assert.equal(menu.hidden,false);assert.equal(trigger.getAttribute('aria-expanded'),'true');
  const items=menu.querySelectorAll('[role="menuitem"]');assert.deepEqual(items.map(i=>i.querySelector('span').textContent),['Quest Log','Locations']);
  assert.equal(e.doc.activeElement,items[0]);
  menu.dispatch('keydown',{key:'ArrowDown'});assert.equal(e.doc.activeElement,items[1]);
  menu.dispatch('keydown',{key:'ArrowDown'});assert.equal(e.doc.activeElement,items[0],'wraps');
  menu.dispatch('keydown',{key:'End'});assert.equal(e.doc.activeElement,items[1]);menu.dispatch('keydown',{key:'Home'});assert.equal(e.doc.activeElement,items[0]);
  const esc=items[1].dispatch('keydown',{key:'Escape',stopPropagation(){this.stopped=true;}});
  assert.equal(menu.hidden,true);assert.equal(esc.defaultPrevented,true);assert.equal(e.doc.activeElement,trigger,'focus returns to the invoker');assert.equal(trigger.getAttribute('aria-expanded'),'false');
  const noEsc=trigger.dispatch('keydown',{key:'Escape'});assert.equal(noEsc.defaultPrevented,false,'Escape is left to Foundry when no menu is open');
  trigger.click();await new Promise(r=>setTimeout(r,0));
  menu.querySelectorAll('[role="menuitem"]')[1].click();assert.deepEqual(opened,['l']);assert.equal(menu.hidden,true);assert.equal(e.doc.activeElement,trigger);
  trigger.click();await new Promise(r=>setTimeout(r,0));trigger.click();assert.equal(menu.hidden,true,'toggles');
});
test('dock menu: empty state, failing open notifies, outside click closes (installed dock)',async()=>{
  const e=dockEnv({modules:new Map([['ashen-gate-quest-manager',mod(true,{open:()=>{throw new Error('Hidden by the GM');},playerAccess:access(true)})]])});
  const clicks=[];e.doc.addEventListener=(t,f)=>clicks.push(f);e.doc.removeEventListener=()=>{};
  const stop=installPlayerDock({game:e.game,hooks:hooksMock(),doc:e.doc,getUi:()=>e.ui,appearance:e.ap});
  const dock=e.doc.getElementById(DOCK_ID),trigger=dock.querySelector('[data-agm-dock="ashen-gate"]'),menu=dock.querySelector('[role="menu"]');
  trigger.click();await new Promise(r=>setTimeout(r,0));menu.querySelector('[role="menuitem"]').click();await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(e.notes,['Hidden by the GM']);
  const e2=dockEnv();const d2=e2.apply();d2.querySelector('[data-agm-dock="ashen-gate"]').click();await new Promise(r=>setTimeout(r,0));
  assert.match(d2.querySelector('[role="menuitem"]').textContent,/No windows available/);
  trigger.click();await new Promise(r=>setTimeout(r,0));assert.equal(menu.hidden,false);
  clicks[0]({target:e.doc.body});assert.equal(menu.hidden,true);
  e.ap.set({playerDock:false});e.ap.fire();assert.equal(e.doc.getElementById(DOCK_ID),null);
  stop();
});

// ---------- wiring
test('wiring: settings in GM Setup > Player screen, Help, stylesheet, no core overrides, no unguarded core calls',()=>{
  const tpl=read('../templates/manager.hbs'),main=read('../scripts/main.js'),man=JSON.parse(read('../module.json'));
  assert.match(tpl,/aria-label="Scene controls and navigation"[\s\S]*data-ag-setup-screen="hideSceneTools"[\s\S]*aria-label="Player dock"[\s\S]*data-ag-setup-screen="playerDock"[\s\S]*data-ag-setup-dock-corner[\s\S]*aria-label="Collapse"[\s\S]*data-ag-setup-screen="collapsePlayerSidebar"/);
  for(const f of PLAYER_SCREEN_FLAGS)assert.ok(tpl.includes(f.name.replace("'","'")),f.name);
  assert.match(main,/installSceneControlHider\(\{game:\{get user\(\)/);assert.match(main,/sceneControlHider\?\.attach\(appearanceController\)/);
  assert.match(main,/startSidebarCollapsed\(/);assert.match(main,/installPlayerDock\(\{game,hooks:Hooks/);
  assert.match(main,/<em>Show the player dock<\/em>/);
  assert.ok(man.styles.includes('styles/player-dock.css'));
  assert.ok(man.version==='0.88.0'&&man.download.endsWith('/ashen-gate-manager-v0.88.0/ashen-gate-manager.zip'));
  for(const f of ['scene-controls','sidebar-collapse','player-dock','sidebar-tabs']){
    const src=read(`../scripts/${f}.js`).replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
    assert.doesNotMatch(src,/\.prototype|libWrapper|Object\.defineProperty|ownership|setFlag|updateDocuments|settings\.set/,f);
  }
  const css=read('../styles/player-dock.css');assert.match(css,/prefers-reduced-motion/);assert.match(css,/:focus-visible/);
});
