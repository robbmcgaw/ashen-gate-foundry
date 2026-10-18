import test from 'node:test';
import assert from 'node:assert/strict';
test('GM Items sidebar launcher appears once and opens API; other sidebars and players do not receive it',async()=>{
 const hooks=new Map(),onces=new Map();
 class App{async render(){return this}async _prepareContext(){return {}}async _onRender(){}}
 globalThis.foundry={applications:{api:{ApplicationV2:App,HandlebarsApplicationMixin:C=>C,DialogV2:{confirm:async()=>true}}}};
 globalThis.Hooks={once:(name,fn)=>onces.set(name,fn),on:(name,fn)=>hooks.set(name,fn)};
 const mod={active:true};let opens=0;
 globalThis.game={user:{isGM:true},modules:new Map([['ashen-gate-manager',mod]]),settings:{register(){},registerMenu(){}}};
 globalThis.HTMLElement=class{};
 class Fake extends HTMLElement {constructor(type='div'){super();this.type=type;this.children=[];this.listeners=new Map();this.dataset={};this.classList={contains:c=>this.type==='header'&&c==='directory-header'};}
 querySelector(sel){if(sel==='.directory-header')return this.header??null;if(sel==='[data-ag-launch="manager"]')return this.button??null;return null}
 append(x){this.children.push(x)} prepend(x){this.children.unshift(x)} after(x){this.placed=x;this.parent.button=x.children[0]}
 addEventListener(event,handler){this.listeners.set(event,handler)} }
 globalThis.document={createElement:t=>new Fake(t)};
 await import('../scripts/main.js');onces.get('init')();onces.get('ready')();mod.api.open=()=>++opens;
 const root=new Fake();root.header=new Fake('header');root.header.parent=root;
 hooks.get('renderItemDirectory')({tabName:'items'},root);
 assert.equal(root.button.dataset.agLaunch,'manager');assert.match(root.button.innerHTML,/General Manager/);
 hooks.get('renderItemDirectory')({tabName:'items'},root);assert.equal(root.header.placed.children.length,1);
 root.button.listeners.get('click')();assert.equal(opens,1);
 const actors=new Fake();actors.header=new Fake('header');actors.header.parent=actors;
 hooks.get('renderSidebarTab')({tabName:'actors'},actors);assert.equal(actors.button,undefined);
 game.user.isGM=false;const other=new Fake();other.header=new Fake('header');other.header.parent=other;
 hooks.get('renderItemDirectory')({tabName:'items'},other);assert.equal(other.button,undefined);
});
