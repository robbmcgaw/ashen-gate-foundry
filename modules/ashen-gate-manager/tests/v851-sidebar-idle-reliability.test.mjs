// 0.85.1: why the player sidebar auto-collapse never fired, and the fixes. Mocked DOM that mirrors the Foundry 14.367 structure:
// <aside id="sidebar"> > #sidebar-content(.expanded) > section#chat > .chat-form > prose-mirror#chat-message > .ProseMirror[contenteditable]
// (the chat box is NOT a textarea; V14 focuses it when the sidebar expands). Fake timers. Proves logic, not the live Forge sidebar.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FakeDocument} from '../../../scripts/kit-tests/fake-dom.mjs';
import {createSidebarIdleCollapse,installSidebarIdleCollapse,hasTypedText,hasOpenWindow,isShown} from '../scripts/sidebar-idle.js';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
function richDoc(){
  const doc=new FakeDocument();const set=new Set();
  doc.body.classList={add:c=>set.add(c),remove:c=>set.delete(c),toggle:(c,on)=>{on?set.add(c):set.delete(c);return on;},contains:c=>set.has(c),set};
  doc.querySelector=sel=>sel.startsWith('#')?doc.getElementById(sel.slice(1)):doc.body.querySelector(sel);
  return doc;
}
const add=(doc,tag,attrs={},parent=doc.body)=>{const el=doc.createElement(tag,attrs);parent.append(el);return el;};
function clock(){let now=0,seq=0,jobs=[];
  return {setTimer:(fn,ms)=>{const id=++seq;jobs.push({id,at:now+ms,fn});return id;},clearTimer:id=>{jobs=jobs.filter(j=>j.id!==id);},
    advance(ms){const end=now+ms;for(;;){const next=jobs.filter(j=>j.at<=end).sort((a,b)=>a.at-b.at)[0];if(!next)break;jobs=jobs.filter(j=>j!==next);now=next.at;next.fn();}now=end;},get pending(){return jobs.length;}};
}
function env({seconds=8,collapsed=false,tab='chat',dockMenu=()=>false,install=false}={}){
  const doc=richDoc(),ck=clock(),state={autoCollapseSeconds:seconds},calls=[];
  const ap={getState:()=>state,subscribe:()=>()=>{}};
  const sidebar=add(doc,'aside',{id:'sidebar'});
  const content=add(doc,'div',{id:'sidebar-content'},sidebar);
  const set=new Set(collapsed?[]:['expanded']);
  const chat=add(doc,'section',{id:'chat','data-tab':'chat'},content);
  const form=add(doc,'div',{class:'chat-form'},chat);
  const pm=add(doc,'prose-mirror',{id:'chat-message',name:'message'},form);
  const editor=add(doc,'div',{class:'editor-content ProseMirror',contenteditable:'true'},pm);
  const ui={sidebar:{get expanded(){return set.has('expanded');},tabGroups:{primary:tab},changeTab:t=>{ui.sidebar.tabGroups.primary=t;calls.push(['changeTab',t]);}}};
  const reg={};const hooks={on:(n,f)=>{reg[n]=f;return n;},off:()=>{}};
  const deps={game:{user:{isGM:false}},doc,getUi:()=>ui,appearance:ap,collapse:()=>{calls.push(['collapse']);set.delete('expanded');return true;},isDockMenuOpen:dockMenu,setTimer:ck.setTimer,clearTimer:ck.clearTimer};
  let idle,inst=null;
  if(install){inst=installSidebarIdleCollapse({hooks,...deps});idle=inst.idle;}else{idle=createSidebarIdleCollapse(deps);idle.bind();}
  const body=name=>doc.body.getAttribute(name);
  // V14 focuses the chat box itself when the sidebar expands (ChatLog#_toggleNotifications -> inputElement.focus()).
  const focusChat=()=>{doc.activeElement=editor;};
  return {doc,ck,sidebar,content,set,editor,ui,calls,idle,inst,hooks,reg,body,focusChat,state};
}
const leave=e=>e.sidebar.dispatch('pointerleave');

test('real cause 1: an empty chat box that Foundry focused no longer holds the sidebar open; nothing is blurred',()=>{
  const e=env();e.focusChat();e.sidebar.dispatch('pointerenter');leave(e);
  e.ck.advance(7999);assert.deepEqual(e.calls,[]);e.ck.advance(1);assert.deepEqual(e.calls.map(c=>c[0]),['collapse']);
  assert.equal(e.doc.activeElement,e.editor,'focus is left as it was');
  // the same without any pointer event at all (pointer already away when it was expanded)
  const f=env();f.focusChat();f.idle.arm();f.ck.advance(8000);assert.equal(f.calls[0][0],'collapse');
});
test('typed text keeps it open (V14 chat is a contenteditable, not a textarea); it collapses once the box is empty',()=>{
  const e=env();e.focusChat();e.idle.arm();e.editor.textContent='half a mess';
  assert.equal(hasTypedText(e.sidebar),true);
  e.ck.advance(80000);assert.deepEqual(e.calls,[]);assert.equal(e.body('data-agm-idle-busy'),'text:prose-mirror#chat-message');
  e.editor.textContent='';assert.equal(hasTypedText(e.sidebar),false);
  e.ck.advance(8000);assert.equal(e.calls[0][0],'collapse');assert.equal(e.body('data-agm-idle-busy'),null);
  const blank=env();blank.editor.textContent=' ​ ';assert.equal(hasTypedText(blank.sidebar),false);
  const off=env();off.editor.setAttribute('contenteditable','false');off.editor.textContent='x';assert.equal(hasTypedText(off.sidebar),false,'a read-only editor is not typing');
  const ta=env();const t=add(ta.doc,'textarea',{},ta.sidebar);t.value='old-style box';assert.equal(hasTypedText(ta.sidebar),true,'textareas still count');
});
test('always-present or hidden empty containers do not block; a shown one does',()=>{
  const e=env();
  add(e.doc,'nav',{id:'context-menu'});                       // empty shell, no entries
  add(e.doc,'div',{class:'context-menu'});                    // empty
  add(e.doc,'dialog',{class:'application dialog'});           // never opened (no open attribute)
  const hidden=add(e.doc,'div',{class:'application dialog'});hidden.hidden=true;
  assert.equal(hasOpenWindow(e.doc),false);
  e.idle.arm();e.ck.advance(8000);assert.equal(e.calls[0][0],'collapse');
  assert.equal(e.body('data-agm-idle-busy'),null);
  // each is blocking once it is really open
  for(const [label,make] of [
    ['menu with entries',d=>{const m=add(d,'nav',{id:'context-menu'});add(d,'li',{class:'context-item'},m);}],
    ['open dialog',d=>add(d,'dialog',{open:''})],
    ['shown application dialog',d=>add(d,'div',{class:'application dialog'})],
    ['Configure Settings',d=>add(d,'div',{id:'settings-config'})],
    ['Manage Modules',d=>add(d,'div',{id:'module-management'})],
    ['Controls',d=>add(d,'div',{id:'controls-config'})],
    ['User Configuration',d=>add(d,'div',{class:'application user-config'})]
  ]){
    const w=env();make(w.doc);w.idle.arm();w.ck.advance(30000);assert.deepEqual(w.calls,[],label);assert.equal(w.body('data-agm-idle-busy'),'window',label);
  }
  assert.equal(isShown(null),false);
  const cv=add(e.doc,'div');cv.checkVisibility=()=>false;assert.equal(isShown(cv),false,'display:none via checkVisibility');
});
test('real cause 3: expanding by clicking a tab (no render) arms the count through the collapseSidebar hook; collapsing cancels it',()=>{
  const e=env({collapsed:true,install:true});
  assert.equal(e.idle.pending,false,'collapsed: nothing counts');
  // core: class toggled, then Hooks.callAll('collapseSidebar', sidebar, collapsed=false)
  e.set.add('expanded');e.focusChat();e.reg.collapseSidebar(e.ui.sidebar,false);
  assert.equal(e.idle.pending,true);assert.equal(e.body('data-agm-idle-armed'),'8');
  e.ck.advance(8000);assert.deepEqual(e.calls.map(c=>c[0]),['collapse'],'collapsed with the empty focused chat box and the pointer away');
  assert.equal(e.body('data-agm-idle-armed'),null);
  // collapsing by hand cancels the count and clears the markers
  const f=env({collapsed:true,install:true});f.set.add('expanded');f.reg.collapseSidebar(f.ui.sidebar,false);assert.equal(f.idle.pending,true);
  f.set.delete('expanded');f.reg.collapseSidebar(f.ui.sidebar,true);assert.equal(f.idle.pending,false);assert.equal(f.body('data-agm-idle-armed'),null);assert.equal(f.body('data-agm-idle-busy'),null);
  // switching to Settings re-arms
  const g=env({install:true});g.idle.cancel();assert.equal(g.idle.pending,false);g.ui.sidebar.tabGroups.primary='settings';g.reg.changeSidebarTab({});assert.equal(g.idle.pending,true);
  assert.deepEqual(Object.keys(g.reg).sort(),['changeSidebarTab','collapseSidebar','renderSidebar']);
  g.inst.stop();assert.equal(g.idle.pending,false);assert.equal(g.body('data-agm-idle-armed'),null);
});
test('expanding while the pointer sits over the sidebar still counts once it leaves',()=>{
  const e=env({collapsed:true,install:true});e.sidebar.dispatch('pointerenter');
  e.set.add('expanded');e.reg.collapseSidebar(e.ui.sidebar,false);e.ck.advance(30000);assert.deepEqual(e.calls,[],'over it');assert.equal(e.body('data-agm-idle-busy'),'pointer');
  leave(e);e.ck.advance(8000);assert.equal(e.calls[0][0],'collapse');
});
test('real cause 4: a stuck pointerenter flag recovers, because :hover is asked when the count ends',()=>{
  const e=env();let hover=true;const real=e.sidebar.matches.bind(e.sidebar);
  e.sidebar.matches=sel=>sel===':hover'?hover:real(sel);
  e.sidebar.dispatch('pointerenter');e.ck.advance(40000);assert.deepEqual(e.calls,[]);assert.equal(e.body('data-agm-idle-busy'),'pointer','really hovered');
  hover=false;                                        // pointer left with no pointerleave (re-render under it, or it left the window)
  e.ck.advance(8000);assert.equal(e.calls[0][0],'collapse');
  // and a DOM that cannot answer :hover falls back to the enter/leave flag
  const f=env();f.sidebar.dispatch('pointerenter');f.ck.advance(40000);assert.deepEqual(f.calls,[]);leave(f);f.ck.advance(8000);assert.equal(f.calls[0][0],'collapse');
});
test('busy reasons are recorded on the body and cleared; the armed delay is shown while counting',()=>{
  let dock=false;const e=env({dockMenu:()=>dock});e.idle.arm();
  assert.equal(e.body('data-agm-idle-armed'),'8');
  const select=add(e.doc,'select',{},e.sidebar);e.doc.activeElement=select;e.ck.advance(8000);assert.equal(e.body('data-agm-idle-busy'),'focus');assert.equal(e.body('data-agm-idle-armed'),'8','re-armed');
  e.doc.activeElement=null;dock=true;e.ck.advance(8000);assert.equal(e.body('data-agm-idle-busy'),'dock-menu');
  dock=false;const w=add(e.doc,'dialog',{open:''});e.ck.advance(8000);assert.equal(e.body('data-agm-idle-busy'),'window');w.remove();
  e.editor.textContent='typing';e.ck.advance(8000);assert.equal(e.body('data-agm-idle-busy'),'text:prose-mirror#chat-message');
  const real=e.sidebar.matches.bind(e.sidebar);let hov=false;e.sidebar.matches=sel=>sel===':hover'?hov:real(sel);
  e.editor.textContent='';hov=true;e.ck.advance(8000);assert.equal(e.body('data-agm-idle-busy'),'pointer');
  hov=false;assert.deepEqual(e.calls,[]);e.ck.advance(8000);
  assert.equal(e.calls[0][0],'collapse');assert.equal(e.body('data-agm-idle-busy'),null);assert.equal(e.body('data-agm-idle-armed'),null);
  e.idle.dispose();
});
test('other early exits: unknown expanded state, a tab other than Chat/Settings, GM, off',()=>{
  const e=env();e.ui.sidebar.tabGroups.primary='journal';assert.equal(e.idle.arm(),false);
  const u=env();const idle=createSidebarIdleCollapse({game:{user:{isGM:false}},doc:u.doc,getUi:()=>({sidebar:{tabGroups:{primary:'chat'}}}),appearance:{getState:()=>({autoCollapseSeconds:8})},collapse:()=>true,setTimer:u.ck.setTimer,clearTimer:u.ck.clearTimer});
  assert.equal(idle.arm(),false,'unknown state does nothing');
  const off=env({seconds:0});assert.equal(off.idle.arm(),false);assert.equal(off.body('data-agm-idle-armed'),null);
});
test('wiring: 0.85.1, changelog names the cause, 0.x, no core wrapping, no status labels',()=>{
  const man=JSON.parse(read('../module.json')),log=read('../CHANGELOG.md');
  assert.equal(man.version,'0.85.3');assert.ok(man.download.endsWith('/ashen-gate-manager-v0.85.3/ashen-gate-manager.zip'));assert.match(man.version,/^0\./);
  assert.match(log,/^## 0\.85\.1 /m);assert.match(log.split('## 0.85.0')[0],/prose-mirror/);assert.doesNotMatch(log.split('## 0.85.0')[0],/\b(Alpha|Beta|Preview)\b/);
  const src=read('../scripts/sidebar-idle.js').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
  assert.doesNotMatch(src,/\.prototype|libWrapper|Object\.defineProperty|setFlag|updateDocuments|settings\.set|new Proxy|\.blur\(/);
});
