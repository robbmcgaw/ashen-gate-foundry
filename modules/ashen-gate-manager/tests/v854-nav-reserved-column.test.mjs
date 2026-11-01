// 0.85.4: the scene navigation sits in #ui-left-column-2, after core's reserved #ui-left-column-1 (--control-columns). Mocked DOM
// mirroring Robb's V14 world (#ui-left > #ui-left-column-1 / #ui-left-column-2 > #scene-navigation, --control-columns: 8).
// Proves logic and the stylesheet text, not the live layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {FakeDocument,fakeStorage} from '../../../scripts/kit-tests/fake-dom.mjs';
import {createControlsLayout,CONTROLS_DOCKED_CLASS,NAV_OFFSET_CLASS,NAV_ATTR,NAV_PARENT_ATTR,NAV_GAP_PX,NAV_EDGE_PX} from '../scripts/dock-controls.js';
import {applyPlayerDock} from '../scripts/player-dock.js';

const css=fs.readFileSync(new URL('../styles/player-dock.css',import.meta.url),'utf8');
const log=fs.readFileSync(new URL('../CHANGELOG.md',import.meta.url),'utf8');
// core 14.367: column-1 width = n*32 + (n-1)*8, #ui-left padding 16, gap 16
const reserved=n=>n*32+(n-1)*8;
assert.equal(reserved(8),312);
const NATURAL_RESERVED=16+reserved(8)+16, NATURAL_COLLAPSED=16;

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
const fixed=state=>({getState:()=>state,subscribe:()=>()=>{},set:s=>Object.assign(state,s)});
const rect=(left,width,height=100)=>()=>({left,right:left+width,width,height,top:0,bottom:height});

function env({isGM=false,state={},scale=1}={}){
  const doc=richDoc(),ap=fixed({playerDock:true,playerDockCorner:'top-left',...state});
  const game={user:{isGM,id:'p1'},modules:new Map()};
  const ui={notifications:{warn:()=>{}},sidebar:{tabGroups:{primary:'chat'},expanded:true}};
  const layout=createControlsLayout({doc,win:{}});
  const left=add(doc,'section',{id:'ui-left'});
  const col1=add(doc,'div',{id:'ui-left-column-1'},left),col2=add(doc,'div',{id:'ui-left-column-2'},left);
  const ctl=add(doc,'nav',{id:'scene-controls'},col1);ctl.getBoundingClientRect=rect(8,150,32);
  const nav=add(doc,'nav',{id:'scene-navigation',class:'monks-navigation'},col2);nav.offsetWidth=200;
  // browser-like: the stylesheet collapses the reserved column only while body.agm-controls-docked; the translate is ours
  nav.getBoundingClientRect=()=>{
    const base=doc.body.classList.contains(CONTROLS_DOCKED_CLASS)?NATURAL_COLLAPSED:NATURAL_RESERVED;
    const sh=doc.body.classList.contains(NAV_OFFSET_CLASS)?(Number.parseInt(doc.vars.get('--agm-nav-shift')??'0',10)||0):0;
    const l=(base+sh)*scale;return {left:l,right:l+200*scale,width:200*scale,height:100,top:0,bottom:100};
  };
  const dock=rect(8,158,227);
  const apply=()=>{const d=applyPlayerDock({game,doc,appearance:ap,getUi:()=>ui,peek:{tab:null,armed:false},memory:{},storage:fakeStorage(),layout,toggleConfig:async()=>true,configOpen:()=>false});if(d)d.getBoundingClientRect=dock;layout.measure();return d;};
  return {doc,ap,layout,nav,ctl,col2,apply,dockRect:dock,
    natural:()=>nav.getBoundingClientRect().left,
    shift:()=>doc.vars.get('--agm-nav-shift'),attr:k=>doc.body.getAttribute(k),cls:c=>doc.body.classList.contains(c)};
}

test('numbers: 8 reserved columns are 312px, so the bar starts at 344px without the fix',()=>{
  assert.equal(NATURAL_RESERVED,344);assert.equal(NATURAL_COLLAPSED,16);
});
test('stylesheet: collapses column-1 and --control-columns only under body.agm-controls-docked, !important over the inline value',()=>{
  const block=css.slice(css.indexOf('/* ---- 0.85.4 ---- */'));
  assert.match(block,/body\.agm-controls-docked #ui-left \{ --control-columns: 0 !important; column-gap: 0 !important; \}/);
  assert.match(block,/body\.agm-controls-docked #ui-left #ui-left-column-1 \{[^}]*width: 0 !important;/);
  const sels=[...block.matchAll(/^([^\n{/*]+)\{/gm)].map(m=>m[1].trim());
  assert.ok(sels.length>=2&&sels.every(s=>s.startsWith('body.agm-controls-docked ')),'every new rule is scoped to docked controls');
  assert.doesNotMatch(block,/#scene-controls[^-]/,'the controls themselves and their flyouts are not touched');
});
test('diagnostic: data-agm-nav-parent names the parent id (column-2), pull-left works with the bar in column-2',()=>{
  const e=env({state:{pullSceneNavigationLeft:true,dockSceneControls:true}});e.apply();
  assert.equal(e.attr(NAV_PARENT_ATTR),'ui-left-column-2');
  // docked => collapsed column: natural left 16, dock column right edge 8+158(=166 wider than controls 158) + gap
  const want=Math.max(8+158,8+150)+NAV_GAP_PX-NATURAL_COLLAPSED;
  assert.equal(e.shift(),`${want}px`);assert.equal(e.attr(NAV_ATTR),String(want));
  assert.equal(e.natural(),166+NAV_GAP_PX,'bar sits right beside the dock column');
  for(let i=0;i<5;i++){e.layout.measure();assert.equal(e.shift(),`${want}px`,'no feedback loop');}
});
test('docked controls, dock bottom-left, pull on: bar lands at the screen edge margin, not hundreds of px in; scale 1 and 0.8',()=>{
  for(const scale of [1,0.8]){
    const e=env({scale,state:{playerDockCorner:'bottom-left',pullSceneNavigationLeft:true,dockSceneControls:true}});e.apply();
    assert.equal(e.natural(),NAV_EDGE_PX,`scale ${scale}`);
    const off=env({scale,state:{playerDockCorner:'bottom-left',pullSceneNavigationLeft:false,dockSceneControls:true}});off.apply();
    assert.equal(off.shift(),undefined);assert.equal(off.natural(),NATURAL_COLLAPSED*scale,'collapsed column alone puts it 16px in');
    assert.ok(off.natural()<NATURAL_RESERVED*scale/10*2);
  }
});
test('not docked: the reserved column is left alone (class off), and the pull still reaches the controls column',()=>{
  const e=env({state:{playerDockCorner:'bottom-left',pullSceneNavigationLeft:true}});e.apply();
  assert.equal(e.cls(CONTROLS_DOCKED_CLASS),false);
  assert.equal(e.natural(),8+150+NAV_GAP_PX,'pulled to just right of core scene controls');
});
test('cleanup: undocked, dock off, corner change and GM restore everything, including the parent diagnostic',()=>{
  const e=env({state:{pullSceneNavigationLeft:true,dockSceneControls:true}});e.apply();
  assert.ok(e.cls(CONTROLS_DOCKED_CLASS));
  e.ap.set({dockSceneControls:false});e.apply();
  assert.equal(e.cls(CONTROLS_DOCKED_CLASS),false);assert.equal(e.natural(),8+158+NAV_GAP_PX,'reserved column back; bar placed beside the dock');
  e.ap.set({playerDockCorner:'top-right',dockSceneControls:true});e.apply();
  assert.equal(e.attr('data-agm-dock-corner'),'top-right');
  e.ap.set({playerDock:false,pullSceneNavigationLeft:false,dockSceneControls:true});e.apply();
  assert.equal(e.cls(CONTROLS_DOCKED_CLASS),false);assert.equal(e.cls(NAV_OFFSET_CLASS),false);
  assert.equal(e.attr(NAV_ATTR),null);assert.equal(e.attr(NAV_PARENT_ATTR),null);assert.equal(e.doc.vars.size,0);
  const g=env({isGM:true,state:{pullSceneNavigationLeft:true,dockSceneControls:true}});g.apply();
  assert.equal(g.cls(CONTROLS_DOCKED_CLASS),false);assert.equal(g.attr(NAV_PARENT_ATTR),null);assert.equal(g.doc.vars.size,0);
  assert.equal(g.natural(),NATURAL_RESERVED,'GM keeps core layout');
});
test('wiring: 0.85.4, changelog names the real cause, 0.x, no status wording',()=>{
  const man=JSON.parse(fs.readFileSync(new URL('../module.json',import.meta.url),'utf8'));
  assert.equal(man.version,'0.97.0');assert.ok(man.download.endsWith('/ashen-gate-manager-v0.97.0/ashen-gate-manager.zip'));assert.match(man.version,/^0\./);
  assert.match(log,/^## 0\.85\.4 /m);
  const entry=log.slice(log.indexOf('## 0.85.4'),log.indexOf('## 0.85.3'));
  assert.match(entry,/--control-columns/);assert.doesNotMatch(entry,/\b(alpha|beta|preview)\b/i);
});
