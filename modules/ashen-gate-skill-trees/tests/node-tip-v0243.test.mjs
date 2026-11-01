import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {bindNodeTip} from '../scripts/node-tip.mjs';
import {tooltipModel} from '../scripts/layout.mjs';
// 0.24.3: the corner card follows the pointer / keyboard focus and never persists. Mocked DOM events: proves the logic, not the live Foundry window.
const el=(cls,id,parent=null,focusVisible=true)=>({dataset:id?{id}:{},parent,matches:q=>q===':focus-visible'&&focusVisible,
  closest(sel){for(let n=this;n;n=n.parent){if(sel==='.agst-node'&&n.dataset.id)return n;if(sel==='.agst-tip'&&n.isTip)return n;}return null;}});
function rig({pinned=null,provider='cinder_milestone'}={}){
  const board=new EventTarget(),root=new EventTarget();
  const shown=[];let pin=pinned;
  const model=tooltipModel({id:'N1',name:'[TEST] Power',cost:1,unlocked:false,eligible:true,description:'[TEST] text'});
  const ctl=bindNodeTip(board,{root,show:id=>shown.push(id),pinned:()=>pin,unpin:()=>{pin=null;}});
  const fire=(t,type,props={})=>{const e=new Event(type,{bubbles:true,cancelable:true});for(const [k,v] of Object.entries(props))Object.defineProperty(e,k,{value:v});t.dispatchEvent(e);return e;};
  const a=el('n','N1'),aIcon=el('i',null,a),b=el('n','N2'),gap=el('svg',null),tip=Object.assign(el('tip',null),{isTip:true});
  return {board,root,shown,ctl,fire,a,aIcon,b,gap,tip,model,provider,get last(){return shown.at(-1);},setPin:v=>{pin=v;}};
}
test('pointer over a node shows it; leaving to empty space hides it (nothing selected)',()=>{
  const r=rig();
  r.fire(r.board,'pointerover',{target:r.a,pointerType:'mouse'});assert.equal(r.last,'N1');
  r.fire(r.board,'pointerout',{target:r.a,relatedTarget:r.gap,pointerType:'mouse'});assert.equal(r.last,null);
});
test('hover moves from one node to another and back to nothing',()=>{
  const r=rig();
  r.fire(r.board,'pointerover',{target:r.a,pointerType:'mouse'});
  r.fire(r.board,'pointerout',{target:r.a,relatedTarget:r.b,pointerType:'mouse'});
  r.fire(r.board,'pointerover',{target:r.b,pointerType:'mouse'});assert.equal(r.last,'N2');
  r.fire(r.board,'pointerout',{target:r.b,relatedTarget:null,pointerType:'mouse'});assert.equal(r.last,null);
});
test('moving between parts of the same node does not flicker the card off',()=>{
  const r=rig();
  r.fire(r.board,'pointerover',{target:r.a,pointerType:'mouse'});const n=r.shown.length;
  r.fire(r.board,'pointerout',{target:r.a,relatedTarget:r.aIcon,pointerType:'mouse'});
  assert.equal(r.shown.length,n);assert.equal(r.last,'N1');
});
test('pointer leaving the whole canvas hides the card even when no node pointerout arrives',()=>{
  const r=rig();
  r.fire(r.board,'pointerover',{target:r.a,pointerType:'mouse'});
  r.fire(r.board,'pointerleave',{});assert.equal(r.last,null);
});
test('keyboard focus shows, blur hides; Escape dismisses and keeps focus where it is',()=>{
  const r=rig();
  r.fire(r.board,'focusin',{target:r.a});assert.equal(r.last,'N1');
  r.fire(r.board,'focusout',{target:r.a});assert.equal(r.last,null);
  r.fire(r.board,'focusin',{target:r.b});assert.equal(r.last,'N2');
  const e=r.fire(r.root,'keydown',{key:'Escape',target:r.b});assert.equal(r.last,null);assert.equal(r.ctl.state().focus,null);
});
test('click focus (not :focus-visible) does not keep the card up after the pointer leaves',()=>{
  const r=rig(),clicked=el('n','N1',null,false);
  r.fire(r.board,'pointerover',{target:clicked,pointerType:'mouse'});
  r.fire(r.board,'focusin',{target:clicked});
  r.fire(r.board,'pointerout',{target:clicked,relatedTarget:null,pointerType:'mouse'});assert.equal(r.last,null);
});
test('Cinder tree: a selected (not pinned) power is not shown after the pointer leaves; a deliberately pinned one is, until Escape',()=>{
  const r=rig();assert.equal(r.model.name,'[TEST] Power');
  r.fire(r.board,'pointerover',{target:r.b,pointerType:'mouse'});
  r.fire(r.board,'pointerout',{target:r.b,relatedTarget:null,pointerType:'mouse'});assert.equal(r.last,null);
  r.setPin('N1');
  r.fire(r.board,'pointerover',{target:r.b,pointerType:'mouse'});assert.equal(r.last,'N2');
  r.fire(r.board,'pointerout',{target:r.b,relatedTarget:null,pointerType:'mouse'});assert.equal(r.last,'N1','pinned card is the resting card');
  r.fire(r.root,'keydown',{key:'Escape',target:r.gap});assert.equal(r.last,null);
});
test('scroll, wheel, pan (pointerdown on empty space) and drag start hide the hover card',()=>{
  const r=rig();
  const over=()=>r.fire(r.board,'pointerover',{target:r.a,pointerType:'mouse'});
  over();r.fire(r.root,'scroll',{});assert.equal(r.last,null);
  over();r.fire(r.root,'wheel',{});assert.equal(r.last,null);
  over();r.fire(r.root,'pointerdown',{target:r.gap});assert.equal(r.last,null);
  over();r.ctl.dismiss();assert.equal(r.last,null);
  over();r.fire(r.board,'dragstart',{});assert.equal(r.last,null);
});
test('touch: a tap shows it and it stays; a tap on empty space dismisses it',()=>{
  const r=rig();
  r.fire(r.board,'pointerover',{target:r.a,pointerType:'touch'});assert.equal(r.last,'N1');
  r.fire(r.board,'pointerout',{target:r.a,relatedTarget:null,pointerType:'touch'});assert.equal(r.last,'N1');
  r.fire(r.root,'pointerdown',{target:r.tip});assert.equal(r.last,'N1','tapping the card itself keeps it');
  r.fire(r.root,'pointerdown',{target:r.gap});assert.equal(r.last,null);
});
test('a re-render (new bind, aborted listeners) starts clean and old listeners are gone',()=>{
  const board=new EventTarget(),shown=[],ac=new AbortController();
  bindNodeTip(board,{show:id=>shown.push(id),signal:ac.signal});
  const over=new Event('pointerover');Object.defineProperty(over,'target',{value:el('n','N1')});
  board.dispatchEvent(over);assert.equal(shown.at(-1),'N1');
  ac.abort();const n=shown.length;board.dispatchEvent(new Event('pointerover'));assert.equal(shown.length,n);
});
test('wiring: main.js uses the controller, no longer falls back to the selected node on leave, and hides on close, re-render and drag',async()=>{
  const src=await fs.readFile(new URL('../scripts/main.js',import.meta.url),'utf8');
  assert.match(src,/bindNodeTip\(board/);
  assert.doesNotMatch(src,/pointerout',e=>\{if\(nodeOf\(e\)\)this\._showTip\(this\.nodeId\)/);
  assert.doesNotMatch(src,/this\._showTip\(this\.nodeId\)/);
  assert.match(src,/this\._showTip\(null\)/);
  assert.doesNotMatch(src,/_pinnedId|\._pinned\b/,'0.27.0: nothing is pinned; the card follows hover and keyboard focus only');
  assert.match(src,/async close\(options\)\{[^]*_tipCtl\?\.dismiss\(\)/);
  assert.match(src,/moved=true;this\._tipCtl\?\.dismiss\(\)/);
});
