import test from 'node:test';
import assert from 'node:assert/strict';
import {SIDEBAR_MODULE_ID,SIDEBAR_ORDER,attachSkillTreesLauncher,orderedSidebarButtons} from '../scripts/sidebar-launcher.mjs';
class Node {
 constructor({className='',dataset={}}={}){this.className=className;this.dataset={...dataset};this.children=[];this.parentElement=null;this.attrs={};this._events={};
 this.classList={add:(...s)=>{this.className=[...new Set([...this.className.split(' ').filter(Boolean),...s])].join(' ');}};}
 matches(s){return s==='.directory-header'&&this.className==='directory-header';}
 append(v){v.remove();this.children.push(v);v.parentElement=this;}
 prepend(v){v.remove();this.children.unshift(v);v.parentElement=this;}
 remove(){if(this.parentElement){let index=this.parentElement.children.indexOf(this);if(index>=0)this.parentElement.children.splice(index,1);this.parentElement=null;}}
 setAttribute(n,v){this.attrs[n]=v;}
 addEventListener(n,fn){this._events[n]=fn;}
 querySelectorAll(selector){
 const all=this.children.flatMap(x=>[x,...x.querySelectorAll(selector)]);
 if(selector===':scope > button[data-ag-launch-order]')return this.children.filter(x=>x.dataset.agLaunchOrder!==undefined);
 if(selector==='[data-ag-sidebar-launchers="actors"]')return all.filter(x=>x.dataset.agSidebarLaunchers==='actors');
 if(selector==='[data-ag-module-launch="ashen-gate-skill-trees"]')return all.filter(x=>x.dataset.agModuleLaunch==='ashen-gate-skill-trees');
 if(selector==='button.agst-open-button')return all.filter(x=>x.className.split(' ').includes('agst-open-button'));
 return [];
 }
 querySelector(s){return this.querySelectorAll(s)[0]??null;}
}
globalThis.HTMLElement=Node;globalThis.document={createElement:()=>new Node()};
function fixture(){let header=new Node({className:'directory-header'}),unrelated=new Node({className:'search-control'});
 header.append(unrelated);return {header,unrelated,app:{element:header}};}
function addPeer(group,id,order){const n=new Node({className:'ag-sidebar-open-button',dataset:{agModuleLaunch:id,agLaunchOrder:String(order)}});group.append(n);return n;}

test('shared Actors group prepends before existing Foundry search controls; rank 30 and accessible name',()=>{
 const {app,header,unrelated}=fixture();let opens=0;
 assert.equal(attachSkillTreesLauncher(app,()=>opens++),true);
 const shelf=header.children[0];assert.equal(shelf.dataset.agSidebarLaunchers,'actors');
 const button=shelf.children[0];assert.equal(button.dataset.agLaunchOrder,'30');
 assert.equal(button.dataset.agModuleLaunch,SIDEBAR_MODULE_ID);assert.equal(SIDEBAR_ORDER,30);
 assert.equal(button.attrs['aria-label'],'Open Ashen Gate Skill Trees');
 assert.equal(header.children[1],unrelated);
 button._events.click({preventDefault(){}});assert.equal(opens,1);
});

test('coexists with Factions, Ledger, HQ, Quest and Utilities in exact order; idempotent repeated renders',()=>{
 const {header,app,unrelated}=fixture();attachSkillTreesLauncher(app,()=>{});
 const shelf=header.children[0];
 addPeer(shelf,'ashen-gate-headquarters',40);addPeer(shelf,'ashen-gate-factions',20);
 addPeer(shelf,'ashen-gate-utilities',60);addPeer(shelf,'ashen-gate-profession-ledger',10);
 addPeer(shelf,'ashen-gate-quest-manager',50);
 for(let n=0;n<3;n++)attachSkillTreesLauncher(app,()=>{});
 assert.deepEqual(shelf.children.map(c=>Number(c.dataset.agLaunchOrder)),[10,20,30,40,50,60]);
 assert.equal(shelf.children.filter(c=>c.dataset.agModuleLaunch===SIDEBAR_MODULE_ID).length,1);
 assert.equal(header.children[1],unrelated);
 assert.deepEqual(orderedSidebarButtons(shelf.children).map(c=>Number(c.dataset.agLaunchOrder)),[10,20,30,40,50,60]);
});

test('player access hide removes only Skill Trees; preserves peers and native Foundry controls',()=>{
 const {header,app,unrelated}=fixture();attachSkillTreesLauncher(app,()=>{});const shelf=header.children[0];
 const peer=addPeer(shelf,'ashen-gate-headquarters',40);
 attachSkillTreesLauncher(app,()=>{},{visible:false});
 assert.deepEqual(shelf.children,[peer]);assert.equal(header.children[1],unrelated);
 assert.equal(header.querySelectorAll('[data-ag-module-launch="ashen-gate-skill-trees"]').length,0);
 attachSkillTreesLauncher(app,()=>{},{visible:true});
 assert.deepEqual(shelf.children.map(x=>Number(x.dataset.agLaunchOrder)),[30,40]);
});
