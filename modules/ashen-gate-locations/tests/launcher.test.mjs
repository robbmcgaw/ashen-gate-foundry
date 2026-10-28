import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
    if(selector==='[data-ag-launch-group="scenes"]')return this.dataset.agLaunchGroup==='scenes';
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
test('only GM gets a Locations button above the Scenes list',()=>{
  const root=makeRoot();
  assert.equal(mountLocationLauncher(root,{isGM:false,onOpen:()=>{}}),false);
  assert.equal(root.children.length,2);
  assert.equal(mountLocationLauncher(root,{isGM:true,onOpen:()=>{}}),true);
  assert.equal(LOCATION_LAUNCHER.tab,'scenes');
  assert.equal(root.children[0].dataset.agLaunchGroup,'scenes');
  assert.equal(root.children[0].children[0].dataset.agModule,LOCATION_LAUNCHER.moduleId);
  assert.equal(root.children[1].className,'directory-header');
});
test('mount is idempotent on re-render and click invokes the callback',async()=>{
  const root=makeRoot();let count=0;
  const open=()=>{count++;};
  mountLocationLauncher(root,{isGM:true,onOpen:open});
  mountLocationLauncher(root,{isGM:true,onOpen:open});
  assert.equal(root.querySelectorAll('[data-ag-launch-group="scenes"]').length,1);
  const bar=root.children[0];
  assert.equal(bar.children.length,1);
  bar.children[0].onclick({preventDefault(){}});await Promise.resolve();await Promise.resolve();
  assert.equal(count,1);
});
test('non-GM never gets a button and a stale one is removed; Items directory is not a mount target',()=>{
  const root=makeRoot();mountLocationLauncher(root,{isGM:true,onOpen:()=>{}});
  assert.equal(root.querySelectorAll('[data-ag-module="ashen-gate-locations"]').length,1);
  assert.equal(mountLocationLauncher(root,{isGM:false,onOpen:()=>{}}),false);
  assert.equal(root.querySelectorAll('[data-ag-module="ashen-gate-locations"]').length,0);
  assert.equal(mountLocationLauncher(root,{isGM:true}),false);// no callback, no button
  const hooks=readFileSync(new URL('../scripts/main.mjs',import.meta.url),'utf8');
  assert.match(hooks,/Hooks\.on\('renderSceneDirectory'[\s\S]*?mountLocationLauncher/);
  assert.doesNotMatch(hooks,/renderItemDirectory/);
});
