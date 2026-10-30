// 0.85.3: "Pull the scene navigation to the left" and the narrowed "typed text" check of the sidebar auto-collapse.
// Mocked DOM (the navigation reports its rect with our translate applied, like a browser). Proves logic, not the live V14 layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import {FakeDocument,fakeStorage} from '../../../scripts/kit-tests/fake-dom.mjs';
import {createControlsLayout,NAV_OFFSET_CLASS,NAV_GAP_PX,NAV_EDGE_PX,NAV_ATTR} from '../scripts/dock-controls.js';
import {applyPlayerDock} from '../scripts/player-dock.js';
import {PLAYER_SCREEN_FLAGS} from '../scripts/appearance.js';
import {hasTypedText,typedTextElement,describeElement} from '../scripts/sidebar-idle.js';

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

function env({isGM=false,state={},scale=1,navLeft=384,controlsRect=rect(8,48,200)}={}){
  const doc=richDoc(),ap=fixed({playerDock:true,playerDockCorner:'top-left',pullSceneNavigationLeft:true,...state});
  const user={isGM,id:'p1'},game={user,modules:new Map()};
  const ui={notifications:{warn:()=>{}},sidebar:{tabGroups:{primary:'chat'},expanded:true}};
  const layout=createControlsLayout({doc,win:{}});
  const ctl=add(doc,'aside',{id:'scene-controls'});ctl.getBoundingClientRect=controlsRect;
  const nav=add(doc,'nav',{id:'scene-navigation'});nav.offsetWidth=400/scale;
  nav.getBoundingClientRect=()=>{const sh=doc.body.classList.contains(NAV_OFFSET_CLASS)?(Number.parseInt(doc.vars.get('--agm-nav-shift')??'0',10)||0):0;return {left:navLeft+sh*scale,width:400,right:navLeft+sh*scale+400,height:40,top:16};};
  let dockRect=rect(80,176,260);
  const apply=()=>{const d=applyPlayerDock({game,doc,appearance:ap,getUi:()=>ui,peek:{tab:null,armed:false},memory:{},storage:fakeStorage(),layout,toggleConfig:async()=>true,configOpen:()=>false});if(d)d.getBoundingClientRect=(...a)=>dockRect(...a);layout.measure();return d;};
  return {doc,ap,layout,nav,ctl,apply,setDock:r=>{dockRect=r;layout.measure();},shift:()=>doc.vars.get('--agm-nav-shift'),cls:()=>doc.body.classList.contains(NAV_OFFSET_CLASS),attr:()=>doc.body.getAttribute(NAV_ATTR)};
}
const clean=e=>{assert.equal(e.cls(),false);assert.equal(e.shift(),undefined);assert.equal(e.attr(),null);assert.equal(e.nav.attrs.get('style')??null,null);};

test('setting: registered like the others (world, GM only, off by default, plain wording)',()=>{
  const f=PLAYER_SCREEN_FLAGS.find(x=>x.key==='pullSceneNavigationLeft');assert.ok(f);
  assert.equal(f.name,'Pull the scene navigation to the left');assert.doesNotMatch(`${f.name} ${f.hint}`,/\b(new|beta|alpha|preview)\b/i);
});
test('pull left, dock top-left: the bar goes to the dock column right edge + gap, at scale 1 and 2, with no feedback loop',()=>{
  for(const scale of [1,2]){
    const e=env({scale});e.apply();
    const want=Math.round((80+176+NAV_GAP_PX-384)/scale);
    for(let i=0;i<5;i++){e.layout.measure();assert.equal(e.shift(),`${want}px`,`scale ${scale} pass ${i}`);}
    assert.equal(e.attr(),String(want));assert.ok(want<0);
    // docked controls row wider than the dock: the wider edge wins
    const d=env({scale,state:{dockSceneControls:true}});d.ctl.getBoundingClientRect=rect(8,300,40);d.apply();
    assert.equal(d.shift(),`${Math.round((8+300+NAV_GAP_PX-384)/scale)}px`);
    d.setDock(rect(80,48,40));d.setDock(rect(80,48,40));   // minimized: the wider controls row still decides, stable
    assert.equal(d.shift(),`${Math.round((8+300+NAV_GAP_PX-384)/scale)}px`);
  }
});
test('pull left, other corners: beside the core scene controls; controls docked elsewhere or hidden: near the screen edge',()=>{
  const e=env({state:{playerDockCorner:'bottom-left'}});e.apply();
  assert.equal(e.shift(),`${8+48+NAV_GAP_PX-384}px`,'right edge of the scene controls column + gap');
  e.ap.set({playerDockCorner:'top-right'});e.apply();assert.equal(e.shift(),`${8+48+NAV_GAP_PX-384}px`,'target follows the corner change');
  e.ap.set({playerDockCorner:'top-left'});e.apply();assert.equal(e.shift(),`${80+176+NAV_GAP_PX-384}px`,'back beside the dock');
  const docked=env({state:{playerDockCorner:'bottom-right',dockSceneControls:true}});docked.apply();
  assert.equal(docked.shift(),`${NAV_EDGE_PX-384}px`,'controls moved under a dock in another corner: left edge + margin');
  const none=env({state:{playerDockCorner:'bottom-left'}});none.ctl.remove();none.apply();assert.equal(none.shift(),`${NAV_EDGE_PX-384}px`,'no controls: left edge + margin');
});
test('pull left without the dock: bar beside the scene controls; already left of the target is never pushed right at the screen edge',()=>{
  const e=env({state:{playerDock:false}});e.apply();assert.equal(e.shift(),`${8+48+NAV_GAP_PX-384}px`);
  e.ap.set({playerDock:true});e.apply();assert.equal(e.shift(),`${80+176+NAV_GAP_PX-384}px`);
  e.ap.set({playerDock:false});e.apply();assert.equal(e.shift(),`${8+48+NAV_GAP_PX-384}px`);
  const edge=env({state:{playerDockCorner:'bottom-left'},navLeft:2});edge.ctl.remove();edge.apply();clean(edge);
  const colliding=env({state:{playerDockCorner:'top-left'},navLeft:100});colliding.apply();
  assert.equal(colliding.shift(),`${80+176+NAV_GAP_PX-100}px`,'overlapping the dock still pushes it right');
});
test('setting off: only the collision nudge remains; GM and dock-off/hidden remove everything',()=>{
  const far=env({state:{pullSceneNavigationLeft:false}});far.apply();clean(far);
  const hit=env({state:{pullSceneNavigationLeft:false},navLeft:104});hit.apply();assert.equal(hit.shift(),`${80+176+NAV_GAP_PX-104}px`);
  hit.ap.set({pullSceneNavigationLeft:true,playerDockCorner:'top-right'});hit.apply();assert.ok(hit.cls());
  hit.ap.set({pullSceneNavigationLeft:false});hit.apply();clean(hit);
  const e=env();e.apply();assert.ok(e.cls());
  e.ap.set({pullSceneNavigationLeft:false});e.apply();clean(e);                       // switched off live
  e.ap.set({pullSceneNavigationLeft:true});e.apply();assert.ok(e.cls());
  e.ap.set({playerDock:false,pullSceneNavigationLeft:false});e.apply();clean(e);assert.equal(e.doc.vars.size,0);
  e.ap.set({playerDock:true,pullSceneNavigationLeft:true});e.apply();assert.ok(e.cls());
  e.layout.disable();clean(e);e.layout.disable();clean(e);
  const g=env({isGM:true});assert.equal(g.apply(),null);clean(g);assert.equal(g.doc.vars.size,0);
});

// ---- typed text (mock V14 sidebar)
function sidebar(){
  const doc=richDoc();const sb=add(doc,'aside',{id:'sidebar'});
  const chat=add(doc,'section',{id:'chat'},sb);const form=add(doc,'div',{class:'chat-form'},chat);
  const controls=add(doc,'div',{id:'chat-controls'},form);
  const tray=add(doc,'div',{class:'dice-tray'},controls);
  const mod=add(doc,'input',{type:'number',class:'dice-modifier'},tray);mod.value='0';
  const roll=add(doc,'input',{type:'text',class:'roll-formula'},tray);roll.value='1d20';
  const modeInput=add(doc,'input',{type:'text'},controls);modeInput.value='publicroll';
  const hidden=add(doc,'input',{type:'hidden',name:'x'},form);hidden.value='abc';
  const num=add(doc,'input',{type:'number'},sb);num.value='5';
  const ro=add(doc,'input',{type:'text',readonly:''},sb);ro.value='frozen';
  const pm=add(doc,'prose-mirror',{id:'chat-message'},form);pm.value='<p></p>';
  const ed=add(doc,'div',{class:'ProseMirror',contenteditable:'true'},pm);
  const para=add(doc,'p',{},ed);para.textContent='';
  const ph=add(doc,'p',{class:'placeholder','data-placeholder':'Chat message...'},ed);ph.textContent='';
  return {doc,sb,pm,ed,para,hidden,num,mod,search:null};
}
test('typed text: tray number, tray formula, hidden, number, read-only, empty paragraph and placeholder do NOT count',()=>{
  const s=sidebar();assert.equal(hasTypedText(s.sb),false);assert.equal(typedTextElement(s.sb),null);
  s.ed.textContent=' ​  ';assert.equal(hasTypedText(s.sb),false,'zero-width and nbsp are empty');
});
test('typed text: a real message counts and is named; clearing releases it',()=>{
  const s=sidebar();s.ed.textContent='I search the room';
  assert.equal(hasTypedText(s.sb),true);assert.equal(describeElement(typedTextElement(s.sb)),'prose-mirror#chat-message');
  s.ed.textContent='';assert.equal(hasTypedText(s.sb),false);
  s.ed.setAttribute('contenteditable','false');s.ed.textContent='x';assert.equal(hasTypedText(s.sb),false,'a read-only editor is not typing');
});
test('typed text: a genuine search field outside the tray counts, a disabled one does not',()=>{
  const s=sidebar();const q=add(s.doc,'input',{type:'search',id:'chat-search'},s.sb);q.value='';assert.equal(hasTypedText(s.sb),false);
  q.value='orc';assert.equal(describeElement(typedTextElement(s.sb)),'input#chat-search');
  q.setAttribute('disabled','');assert.equal(hasTypedText(s.sb),false);
});
