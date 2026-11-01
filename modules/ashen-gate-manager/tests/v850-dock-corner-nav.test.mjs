// 0.85.0: User Configuration is a true toggle; the dock corner always works (the removed 0.83.0 bottom-left stack no longer overrides it);
// the scene navigation is core's own unless the dock is top left. Mocked Foundry and DOM: proves logic and wiring, not the live V14 layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {FakeDocument,fakeStorage} from '../../../scripts/kit-tests/fake-dom.mjs';
import {registerAppearanceSettings,createAppearanceController,PLAYER_SCREEN_FLAGS,DOCK_CORNERS,MOVE_SCENE_NAV_KEY} from '../scripts/appearance.js';
import {createControlsLayout,toggleUserConfiguration,findUserConfiguration,userConfigurationOpen,shouldOffsetNavigation,CONTROLS_DOCKED_CLASS,NAV_OFFSET_CLASS,NAV_GAP_PX} from '../scripts/dock-controls.js';
import {applyPlayerDock,installPlayerDock,LIVE_HOOKS} from '../scripts/player-dock.js';

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
const rect=(left,width,height=100)=>()=>({left,right:left+width,width,height,top:0,bottom:height});

// ---- User Configuration toggle against a mock of foundry.applications (instances Map, UserConfig class, rendered, close)
function foundryMock(user){
  const instances=new Map();
  class UserConfig{
    constructor(o){this.document=o.document;this.rendered=false;this.id=`user-config-${o.document.id}-${UserConfig.n=(UserConfig.n??0)+1}`;this.closed=0;}
    async render(){this.rendered=true;instances.set(this.id,this);return this;}
    async close(){this.closed++;this.rendered=false;instances.delete(this.id);return this;}
  }
  return {foundryNs:{applications:{instances,sheets:{UserConfig}}},game:{user},instances,UserConfig};
}
test('user configuration: first press opens, second closes, X-close resets, and it reopens',async()=>{
  const user={id:'p1'};const m=foundryMock(user);const args={foundryNs:m.foundryNs,game:m.game,globals:{}};
  assert.equal(userConfigurationOpen(args),false);
  assert.equal(await toggleUserConfiguration(args),true);
  assert.equal(m.instances.size,1);assert.equal(userConfigurationOpen(args),true);
  const app=findUserConfiguration(args);
  assert.equal(await toggleUserConfiguration(args),true);assert.equal(app.closed,1,'second press calls the window\'s own close()');
  assert.equal(userConfigurationOpen(args),false);assert.equal(m.instances.size,0);
  await toggleUserConfiguration(args);const again=findUserConfiguration(args);assert.notEqual(again,app);
  await again.close();   // the window's own X
  assert.equal(userConfigurationOpen(args),false,'closing with X resets the state');
  await toggleUserConfiguration(args);assert.equal(userConfigurationOpen(args),true,'and the next press opens again');
  // another user's window, or one that is closing, is not ours
  const other=new m.UserConfig({document:{id:'p2'}});await other.render();
  const mine=findUserConfiguration(args);mine.rendered=false;
  assert.equal(findUserConfiguration(args),null);
  // missing registry or class: never throws
  assert.equal(findUserConfiguration({foundryNs:{},game:m.game}),null);assert.equal(findUserConfiguration({}),null);
});

function dockEnv({isGM=false,state={},cfg=null}={}){
  const doc=richDoc(),ap=fixed({playerDock:true,playerDockCorner:'top-left',...state}),hooks=new Map();
  const ui={notifications:{warn:()=>{}},sidebar:{tabGroups:{primary:'chat'},expanded:true}};
  const user={isGM,id:'p1'};const m=foundryMock(user);
  const game={user,modules:new Map()};
  const layout=createControlsLayout({doc,win:{}});
  const args={foundryNs:m.foundryNs,game,globals:{}};
  const apply=()=>applyPlayerDock({game,doc,appearance:ap,getUi:()=>ui,peek:{tab:null,armed:false},memory:{},storage:fakeStorage(),layout,
    toggleConfig:()=>toggleUserConfiguration(args),configOpen:()=>userConfigurationOpen(args)});
  return {doc,ap,ui,game,layout,m,args,apply};
}
test('dock button: User Configuration is a toggle with aria-pressed from the real window state',async()=>{
  const e=dockEnv();const dock=e.apply();await settle();
  const b=dock.querySelector('[data-agm-dock="user-config"]');
  assert.equal(b.tagName,'BUTTON');assert.equal(b.getAttribute('aria-pressed'),'false');assert.ok(b.getAttribute('data-tooltip'));
  b.click();await settle();assert.equal(b.getAttribute('aria-pressed'),'true');assert.equal(e.m.instances.size,1);
  b.click();await settle();assert.equal(b.getAttribute('aria-pressed'),'false');assert.equal(e.m.instances.size,0);
  b.click();await settle();assert.equal(b.getAttribute('aria-pressed'),'true');
  await findUserConfiguration(e.args).close();   // X: the closeUserConfig hook re-reads the state
  await dock.agmSyncPressed();assert.equal(b.getAttribute('aria-pressed'),'false');
  assert.ok(LIVE_HOOKS.includes('renderUserConfig')&&LIVE_HOOKS.includes('closeUserConfig'),'render/close hooks resync the button');
});
test('dock hooks: closeUserConfig / renderUserConfig refresh the pressed state without a click',async()=>{
  const e=dockEnv();const reg=new Map();globalThis.foundry=e.m.foundryNs;
  const hooks={on:(n,f)=>{reg.set(n,f);return n;},off:()=>{}};
  const stop=installPlayerDock({game:e.game,hooks,doc:e.doc,getUi:()=>e.ui,appearance:e.ap,layout:e.layout});
  await settle();const b=e.doc.getElementById('agm-player-dock').querySelector('[data-agm-dock="user-config"]');
  await toggleUserConfiguration(e.args);reg.get('renderUserConfig')();await settle();assert.equal(b.getAttribute('aria-pressed'),'true');
  await findUserConfiguration(e.args).close();reg.get('closeUserConfig')();await settle();assert.equal(b.getAttribute('aria-pressed'),'false');
  stop();delete globalThis.foundry;
});

// ---- dock corner: every corner works, with and without docked controls, minimized, and with the removed key ignored
const CORNERS=['top-left','top-right','bottom-left','bottom-right'];
function controls(doc){return add(doc,'aside',{id:'scene-controls'});}
test('dock corner: every corner is applied to the dock and to the body, with controls docked or not, whatever moveSceneNavigation says',()=>{
  assert.deepEqual(Object.keys(DOCK_CORNERS),CORNERS);
  for(const stale of [true,false,undefined])for(const dockControls of [false,true])for(const corner of CORNERS){
    const e=dockEnv({state:{playerDockCorner:corner,dockSceneControls:dockControls,moveSceneNavigation:stale}});controls(e.doc);
    const dock=e.apply();
    assert.equal(dock.getAttribute('data-corner'),corner,`${corner} dock`);
    assert.equal(e.doc.body.getAttribute('data-agm-dock-corner'),corner,`${corner} body`);
    assert.equal(e.doc.body.classList.contains(CONTROLS_DOCKED_CLASS),dockControls);
    assert.equal(e.doc.body.classList.contains(NAV_OFFSET_CLASS),false,`${corner} nav offset`);
    assert.equal(e.doc.body.classList.contains('agm-nav-bottom'),false);
    // minimized: the corner stays
    dock.agmSetMinimized(true);assert.equal(e.doc.body.getAttribute('data-agm-dock-corner'),corner);assert.equal(dock.getAttribute('data-corner'),corner);
  }
});
test('dock corner: changing the corner live moves the whole group; turning the dock off clears everything', ()=>{
  const e=dockEnv({state:{dockSceneControls:true}});controls(e.doc);const dock=e.apply();
  for(const corner of ['top-right','bottom-left','bottom-right','top-left','bottom-left']){
    e.ap.set({playerDockCorner:corner});e.apply();
    assert.equal(dock.getAttribute('data-corner'),corner);assert.equal(e.doc.body.getAttribute('data-agm-dock-corner'),corner);
    assert.equal(e.doc.body.classList.contains(NAV_OFFSET_CLASS),false);
  }
  e.ap.set({playerDock:false});e.apply();
  assert.equal(e.doc.body.getAttribute('data-agm-dock-corner'),null);assert.equal(e.doc.body.classList.contains(NAV_OFFSET_CLASS),false);
  assert.equal(e.doc.body.classList.contains(CONTROLS_DOCKED_CLASS),false);assert.equal(e.doc.vars.size,0);
});
test('dock corner: GM is never affected', ()=>{
  const e=dockEnv({isGM:true,state:{playerDockCorner:'top-left',dockSceneControls:true}});controls(e.doc);add(e.doc,'nav',{id:'scene-navigation'});
  assert.equal(e.apply(),null);assert.equal(e.doc.body.getAttribute('data-agm-dock-corner'),null);assert.equal(e.doc.body.classList.contains(NAV_OFFSET_CLASS),false);assert.equal(e.doc.vars.size,0);
});

// ---- scene navigation
test('navigation: offset only for a player with the dock top left',()=>{
  assert.equal(shouldOffsetNavigation({isGM:false,corner:'top-left',dockShown:true}),true);
  for(const c of ['top-right','bottom-left','bottom-right'])assert.equal(shouldOffsetNavigation({isGM:false,corner:c,dockShown:true}),false,c);
  assert.equal(shouldOffsetNavigation({isGM:true,corner:'top-left',dockShown:true}),false);
  assert.equal(shouldOffsetNavigation({isGM:false,corner:'top-left',dockShown:false}),false);
});
// 0.85.3: collision-based. The mock navigation reports its rect with our translate applied (as a browser would), so any
// feedback from measuring the shifted position would show up as drift.
const NAV_ATTR='data-agm-nav-shift';
function navMock(e,{left,width=400,scale=1,cls}){
  const nav=add(e.doc,'nav',{id:'scene-navigation'});nav.offsetWidth=width/scale;
  nav.getBoundingClientRect=()=>{const on=e.doc.body.classList.contains(NAV_OFFSET_CLASS);const sh=on?(Number.parseInt(e.doc.vars.get('--agm-nav-shift')??'0',10)||0):0;return {left:left+sh*scale,width,right:left+width,height:40,top:16};};
  return nav;
}
const navOurs=(e,nav)=>({cls:e.doc.body.classList.contains(NAV_OFFSET_CLASS),v:e.doc.vars.has('--agm-nav-shift'),attr:e.doc.body.getAttribute(NAV_ATTR),inline:nav.attrs?.get?.('style')??null});
const nothing=(e,nav)=>{const o=navOurs(e,nav);assert.deepEqual(o,{cls:false,v:false,attr:null,inline:null});};
test('navigation: far from the dock (core natural ~20% of the screen, or centred like Monk\'s) gets no shift at all',()=>{
  const e=dockEnv({state:{playerDockCorner:'top-left'}});const nav=navMock(e,{left:384});
  const dock=e.apply();dock.getBoundingClientRect=rect(80,176,260);e.layout.measure();
  nothing(e,nav);assert.equal(e.doc.vars.get('--agm-dock-w'),'176px');
});
test('navigation: overlapping the dock gets the minimal shift; recomputing is stable (no feedback)',()=>{
  const e=dockEnv({state:{playerDockCorner:'top-left'}});const nav=navMock(e,{left:104,width:200});
  const dock=e.apply();dock.getBoundingClientRect=rect(80,176,260);
  const want=80+176+NAV_GAP_PX-104;
  for(let i=0;i<5;i++){e.layout.measure();assert.equal(e.doc.vars.get('--agm-nav-shift'),`${want}px`,`pass ${i}`);}
  assert.equal(e.doc.body.getAttribute(NAV_ATTR),String(want));assert.equal(e.doc.body.classList.contains(NAV_OFFSET_CLASS),true);
  assert.equal(nav.attrs?.get?.('style')??null,null,'nothing set on the navigation element itself');
  dock.getBoundingClientRect=rect(80,48,40);e.layout.measure();   // minimized: recomputed, smaller
  assert.equal(e.doc.vars.get('--agm-nav-shift'),`${80+48+NAV_GAP_PX-104}px`);
  dock.getBoundingClientRect=rect(10,48,40);e.layout.measure();   // no longer overlapping: removed
  nothing(e,nav);
  dock.getBoundingClientRect=rect(80,176,260);e.layout.measure();assert.equal(e.doc.vars.get('--agm-nav-shift'),`${want}px`);
});
test('navigation: transformed #ui-middle (interface scale 2) and a non-zero natural left: shift is in local px, minimal',()=>{
  const e=dockEnv({state:{playerDockCorner:'top-left',dockSceneControls:true}});
  const c=controls(e.doc);c.getBoundingClientRect=rect(8,300,40);
  const nav=navMock(e,{left:208,width:400,scale:2});
  const dock=e.apply();dock.getBoundingClientRect=rect(8,170,200);
  for(let i=0;i<3;i++){e.layout.measure();assert.equal(e.doc.vars.get('--agm-nav-shift'),`${Math.ceil((8+300+NAV_GAP_PX-208)/2)}px`);}
  assert.equal(e.doc.vars.get('--agm-dock-w'),'300px');void nav;
});
test('navigation: class, variable and attribute are removed on every corner change, dock off, hidden and GM',()=>{
  for(const to of ['top-right','bottom-left','bottom-right']){
    const e=dockEnv({state:{playerDockCorner:'top-left'}});const nav=navMock(e,{left:104,width:200});
    const dock=e.apply();dock.getBoundingClientRect=rect(80,176,260);e.layout.measure();assert.equal(e.doc.body.classList.contains(NAV_OFFSET_CLASS),true);
    e.ap.set({playerDockCorner:to});e.apply();e.layout.measure();nothing(e,nav);
    e.ap.set({playerDockCorner:'top-left'});const d2=e.apply();d2.getBoundingClientRect=rect(80,176,260);e.layout.measure();assert.equal(e.doc.body.classList.contains(NAV_OFFSET_CLASS),true,'back on');
  }
  const e=dockEnv({state:{playerDockCorner:'top-left'}});const nav=navMock(e,{left:104,width:200});
  const dock=e.apply();dock.getBoundingClientRect=rect(80,176,260);e.layout.measure();
  e.ap.set({playerDock:false});e.apply();nothing(e,nav);assert.equal(e.doc.vars.size,0);
  e.ap.set({playerDock:true});const d3=e.apply();d3.getBoundingClientRect=rect(80,176,260);e.layout.measure();assert.equal(e.doc.body.classList.contains(NAV_OFFSET_CLASS),true);
  e.layout.disable();nothing(e,nav);e.layout.disable();nothing(e,nav);   // idempotent
  const g=dockEnv({isGM:true,state:{playerDockCorner:'top-left'}});const gn=navMock(g,{left:10,width:200});
  assert.equal(g.apply(),null);nothing(g,gn);
});
test('navigation: no navigation element, or no layout numbers, never throws and sets nothing',()=>{
  const e=dockEnv();e.apply();e.layout.measure();assert.equal(e.doc.vars.has('--agm-nav-shift'),false);assert.equal(e.doc.body.classList.contains(NAV_OFFSET_CLASS),false);
  const e2=dockEnv();const nav=add(e2.doc,'nav',{id:'scene-navigation'});nav.getBoundingClientRect=()=>{throw new Error('x');};e2.apply();nothing(e2,nav);
});

// ---- the removed setting
test('removed setting: gone from GM Setup, flags and state; key stays registered hidden; old worlds with it true behave normally',async()=>{
  assert.equal(PLAYER_SCREEN_FLAGS.some(f=>f.key===MOVE_SCENE_NAV_KEY||f.state==='moveSceneNavigation'),false);
  assert.doesNotMatch(read('../templates/manager.hbs'),/moveSceneNavigation|Move the scene navigation/);
  assert.doesNotMatch(read('../scripts/main.js'),/<em>Move the scene navigation|moveSceneNavigation/);
  const reg=[];registerAppearanceSettings({game:{settings:{register:(n,k,v)=>reg.push({k,v})}},namespace:'m'});
  const s=reg.find(r=>r.k==='moveSceneNavigation').v;assert.deepEqual([s.scope,s.config,s.restricted,s.default],['world',false,true,false]);
  const store=new Map([['moveSceneNavigation',true],['playerDockCorner','top-right'],['playerDock',true]]);
  const c=createAppearanceController({currentUser:()=>({id:'p',isGM:false}),getSetting:k=>store.get(k),setSetting:async(k,v)=>store.set(k,v),subscribeSettings:()=>()=>{}});
  const st=c.getState();assert.equal(st.moveSceneNavigation,undefined);assert.equal(st.playerDockCorner,'top-right');
  c.noteChange('moveSceneNavigation',true);assert.equal(c.getState().playerDockCorner,'top-right');
  const e=dockEnv({state:{playerDockCorner:'top-right',moveSceneNavigation:true}});controls(e.doc);
  const dock=e.apply();assert.equal(dock.getAttribute('data-corner'),'top-right');assert.equal(e.doc.body.classList.contains(NAV_OFFSET_CLASS),false);
});
test('no leftover references to the bottom-left stack in scripts, styles or templates',()=>{
  const files=['../styles/player-dock.css','../scripts/dock-controls.js','../scripts/player-dock.js','../scripts/appearance.js','../templates/manager.hbs'];
  for(const f of files){
    const src=read(f).replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
    assert.doesNotMatch(src,/agm-nav-bottom|--agm-nav-h|--agm-stack-|--agm-nav-width|NAV_BOTTOM|shouldStackBottom|Move the scene navigation/,f);
  }
});

// ---- CSS and wiring
test('CSS: the navigation rule exists only under body.agm-nav-offset and uses the measured shift; bottom-right corner; no reserved top gap',()=>{
  const css=read('../styles/player-dock.css');
  assert.match(css,/body\.agm-nav-offset #scene-navigation[\s\S]*?translate: var\(--agm-nav-shift, 0px\) 0/);
  assert.doesNotMatch(css,/#(scene-)?navigation[^{}]*\{[^}]*\b(left|margin|position)\b/);
  const navRules=css.match(/[^{}]*#scene-navigation[^{}]*\{[^}]*\}/g)??[];
  assert.ok(navRules.length>0);for(const r of navRules)assert.match(r,/agm-nav-offset/,'every navigation rule is behind the offset class');
  assert.match(css,/\.agm-dock\[data-corner="bottom-right"\]/);
  assert.doesNotMatch(css,/--agm-dock-top: 3\.75rem/);
});
test('wiring: version 0.85.3, changelog, Help, wording, 0.x',()=>{
  const man=JSON.parse(read('../module.json')),log=read('../CHANGELOG.md'),main=read('../scripts/main.js');
  assert.equal(man.version,'0.98.0');assert.ok(man.download.endsWith('/ashen-gate-manager-v0.98.0/ashen-gate-manager.zip'));assert.match(man.version,/^0\./);
  assert.match(log,/^## 0\.85\.0 /m);assert.doesNotMatch(log.split('## 0.84.1')[0],/\b(Alpha|Beta|Preview)\b/);
  assert.match(main,/Quest Log, User Settings and Foundry Settings open on the first press and close on the second/);
  assert.match(main,/bottom right/);assert.match(main,/slid to the right of the dock/);
  const doc=read('../scripts/dock-controls.js').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
  assert.doesNotMatch(doc,/libWrapper|Object\.defineProperty|setFlag|settings\.set|new Proxy|appendChild|insertBefore|replaceWith/);
});
