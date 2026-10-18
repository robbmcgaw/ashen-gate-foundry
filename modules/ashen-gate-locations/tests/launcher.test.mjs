import test from 'node:test';
import assert from 'node:assert/strict';
import {mountLocationLauncher, LOCATION_LAUNCHER} from '../scripts/launcher.js';

class FakeElement {
  constructor(tag,cn='') {this.tag=tag;this.className=cn;this.children=[];this.dataset={};this.parentElement=null;this.onclick=null;this.attributes={};this.type=null;this.innerHTML='';}
  matchesSelector(selector){
    if(selector==='[data-ag-order]')return this.dataset.agOrder!==undefined;
    if(selector==='.directory-list')return this.className.includes('directory-list');
    if(selector==='.directory-header')return this.className.includes('directory-header');
    if(selector===':scope > .ag-sidebar-launchers')return this.className.includes('ag-sidebar-launchers');
    if(selector==='.ag-sidebar-launchers')return this.className.includes('ag-sidebar-launchers');
    if(selector==='.ag-sidebar-launch-group')return this.className.includes('ag-sidebar-launch-group');
    if(selector==='[data-ag-launch-group="items"]')return this.dataset.agLaunchGroup==='items';
    const moduleId=selector.match(/^\[data-ag-module="(.+)"\]$/);if(moduleId)return this.dataset.agModule===moduleId[1];
    return false;
  }
  querySelector(selector){for(const sel of selector.split(',')){for(const node of this.descendants()){if(node.matchesSelector(sel.trim()))return node;}}return null;}
  querySelectorAll(selector){return [...this.descendants()].filter(x=>selector.split(',').some(sel=>x.matchesSelector(sel.trim())));}
  *descendants(){for(const child of this.children){yield child;yield* child.descendants();}}
  setAttribute(key,val){this.attributes[key]=val;}
  remove(){if(!this.parentElement)return;this.parentElement.children=this.parentElement.children.filter(c=>c!==this);this.parentElement=null;}
  append(child){if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(x=>x!==child);this.children.push(child);child.parentElement=this;}
  prepend(child){if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(x=>x!==child);this.children.unshift(child);child.parentElement=this;}
  before(child){const p=this.parentElement;if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(x=>x!==child);const pos=p.children.indexOf(this);p.children.splice(pos,0,child);child.parentElement=p;}
  after(child){const p=this.parentElement;if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(x=>x!==child);const pos=p.children.indexOf(this);p.children.splice(pos+1,0,child);child.parentElement=p;}
}
globalThis.document={createElement:(tag)=>new FakeElement(tag)};
const makeRoot=()=>{const root=new FakeElement('section');root.append(new FakeElement('header','directory-header'));root.append(new FakeElement('ol','directory-list'));return root;};
test('only GM gets a Location Builder button above the Items list',()=>{
  const root=makeRoot();
  assert.equal(mountLocationLauncher(root,{isGM:false,onOpen:()=>{}}),false);
  assert.equal(root.children.length,2);
  assert.equal(mountLocationLauncher(root,{isGM:true,onOpen:()=>{}}),true);
  assert.equal(root.children[0].dataset.agLaunchGroup,'items');
  assert.equal(root.children[0].children[0].dataset.agModule,LOCATION_LAUNCHER.moduleId);
  assert.equal(root.children[1].className,'directory-header');
});
test('button remains idempotent and orderable alongside Manager; click invokes actual callback',async()=>{
  const root=makeRoot();let count=0;
  const open=()=>{count++;};
  mountLocationLauncher(root,{isGM:true,onOpen:open});
  const bar=root.children[0];
  const manager=new FakeElement('button');manager.dataset.agModule='ashen-gate-manager';manager.dataset.agOrder='10';bar.append(manager);
  mountLocationLauncher(root,{isGM:true,onOpen:open});
  assert.equal(bar.children.length,2);
  assert.deepEqual(bar.children.map(b=>b.dataset.agModule),['ashen-gate-manager','ashen-gate-locations']);
  bar.children[1].onclick({preventDefault(){}});await Promise.resolve();await Promise.resolve();
  assert.equal(count,1);
});

test('Manager-first legacy shelf joins one shared Items group before search without duplicate Locations',()=>{
 const root=makeRoot();const shelf=new FakeElement('div','ag-sidebar-launch-group');shelf.dataset.agLaunchGroup='items';
 const manager=new FakeElement('button','ag-sidebar-launch-button');manager.dataset.agLaunch='manager';shelf.append(manager);root.children[0].after(shelf);
 assert.equal(mountLocationLauncher(root,{isGM:true,onOpen:()=>{}}),true);
 assert.equal(root.children[0],shelf);
 assert.deepEqual(shelf.children.map(b=>b.dataset.agModule),['ashen-gate-manager','ashen-gate-locations']);
 assert.equal(manager.dataset.agOrder,'10');
 mountLocationLauncher(root,{isGM:true,onOpen:()=>{}});
 assert.equal(shelf.children.length,2);
});
test('separate legacy groups are consolidated and non-GM launcher is removed',()=>{
 const root=makeRoot();mountLocationLauncher(root,{isGM:true,onOpen:()=>{}});
 const extra=new FakeElement('div','ag-sidebar-launch-group');extra.dataset.agLaunchGroup='items';
 const manager=new FakeElement('button');manager.dataset.agLaunch='manager';extra.append(manager);root.children[1].after(extra);
 mountLocationLauncher(root,{isGM:true,onOpen:()=>{}});
 assert.equal(root.querySelectorAll('[data-ag-launch-group="items"]').length,1);
 assert.deepEqual(root.children[0].children.map(x=>x.dataset.agModule),['ashen-gate-manager','ashen-gate-locations']);
 mountLocationLauncher(root,{isGM:false,onOpen:()=>{}});
 assert.equal(root.querySelectorAll('[data-ag-module="ashen-gate-locations"]').length,0);
 assert.equal(root.querySelectorAll('[data-ag-module="ashen-gate-manager"]').length,1);
});
