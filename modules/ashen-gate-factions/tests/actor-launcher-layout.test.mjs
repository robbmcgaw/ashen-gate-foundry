/** DOM-shaped placement smoke (not live Foundry verification). */
import assert from 'node:assert/strict';
import {attachActorLauncher,orderedLaunchButtons,SIDEBAR_BUTTON_ORDER} from '../scripts/sidebar-launcher.mjs';
class Node {
  constructor(tag='div'){this.tagName=tag;this.parentElement=null;this.children=[];this.dataset={};this.attrs={};this.listeners={};this.classNames=new Set();this.classList={add:(...c)=>c.forEach(v=>this.classNames.add(v))};this.title='';}
  setAttribute(k,v){this.attrs[k]=v;}
  append(child){if(child.parentElement){child.parentElement.children=child.parentElement.children.filter(x=>x!==child);}child.parentElement=this;this.children.push(child);}
  prepend(child){if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(x=>x!==child);child.parentElement=this;this.children.unshift(child);}
  addEventListener(type,fn){this.listeners[type]=fn;}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this);this.parentElement=null;}
  matches(sel){return sel==='.directory-header'&&this.classNames.has('directory-header');}
  querySelector(sel){if(sel===':scope > button[data-ag-launch-order]')return this.children.find(n=>n.tagName==='button'&&n.dataset.agLaunchOrder)??null;if(sel==='.directory-header')return this.walk().find(n=>n.classNames.has('directory-header'))??null;
    if(sel==='[data-ag-sidebar-launchers="actors"]')return this.walk().find(n=>n.dataset.agSidebarLaunchers==='actors')??null;
    if(sel==='[data-ag-module-launch="ashen-gate-factions"]')return this.walk().find(n=>n.dataset.agModuleLaunch==='ashen-gate-factions')??null;
    if(sel==='button.agf-open-button')return this.walk().find(n=>n.tagName==='button'&&n.classNames.has('agf-open-button'))??null;
    return null;
  }
  querySelectorAll(sel){if(sel===':scope > button[data-ag-launch-order]')return this.children.filter(n=>n.tagName==='button'&&n.dataset.agLaunchOrder);
    return [];
  }
  walk(){const results=[];for(const child of this.children){results.push(child,...child.walk());}return results;}
}
globalThis.HTMLElement=Node;
globalThis.document={createElement:tag=>new Node(tag)};
const root=new Node(),header=new Node();header.classNames.add('directory-header');root.append(header);
const actorList=new Node();actorList.classNames.add('directory-list');root.append(actorList);
let opened=0;
assert(attachActorLauncher(root,()=>opened++));
const shelf=header.children[0];
assert.equal(shelf.dataset.agSidebarLaunchers,'actors');
assert.equal(shelf.children.length,1);
const faction=shelf.children[0];
assert.equal(faction.dataset.agLaunchOrder,'20');
assert.equal(faction.dataset.agModuleLaunch,'ashen-gate-factions');
assert.equal(faction.attrs['aria-label'],'Open Factions & Renown');
let prevented=false;faction.listeners.click({preventDefault(){prevented=true;}});
assert.equal(opened,1);assert(prevented);
// Other independent modules opt into the same shelf; this module sorts only shared buttons.
for(const [id,order] of [['ashen-gate-headquarters',40],['ashen-gate-skill-trees',30],['ashen-gate-profession-ledger',10]]){const b=new Node('button');b.dataset.agModuleLaunch=id;b.dataset.agLaunchOrder=String(order);shelf.append(b);}
assert.deepEqual(orderedLaunchButtons(shelf.querySelectorAll(':scope > button[data-ag-launch-order]')).map(x=>x.dataset.agLaunchOrder),['10','20','30','40']);
assert(attachActorLauncher(root,()=>opened++));
assert.equal(shelf.children.length,4,'repeat renders do not duplicate faction buttons');
assert.deepEqual(shelf.children.map(x=>x.dataset.agModuleLaunch),['ashen-gate-profession-ledger','ashen-gate-factions','ashen-gate-skill-trees','ashen-gate-headquarters']);
assert.equal(SIDEBAR_BUTTON_ORDER.items['ashen-gate-manager'],10);
assert.equal(SIDEBAR_BUTTON_ORDER.items['ashen-gate-locations'],20);
assert.equal(root.children[1],actorList,'Actor list not moved');
assert(attachActorLauncher(root,()=>opened++,{visible:false}), 'hidden launcher update returns successfully');
assert.equal(shelf.children.length,3, 'hidden Player Access removes only the Factions button');
assert(!shelf.children.some(x=>x.dataset.agModuleLaunch==='ashen-gate-factions'));
assert.deepEqual(shelf.children.map(x=>x.dataset.agModuleLaunch),['ashen-gate-profession-ledger','ashen-gate-skill-trees','ashen-gate-headquarters'],'partner modules unchanged');
assert(attachActorLauncher(root,()=>opened++,{visible:true}));
assert.equal(shelf.children.length,4,'launcher restored after reveal');
assert.deepEqual(shelf.children.map(x=>x.dataset.agLaunchOrder),['10','20','30','40'],'correct placement after reveal');
assert(attachActorLauncher(root,()=>opened++,{visible:true}));
assert.equal(shelf.children.length,4,'no duplicates after second reveal');
assert.equal(attachActorLauncher(new Node(),()=>{}),false,'missing directory does not throw');
console.log('ACTORS SIDEBAR LAYOUT OK: placement, order, hide/reveal, idempotence, access labels, click, unchanged actor list.');
