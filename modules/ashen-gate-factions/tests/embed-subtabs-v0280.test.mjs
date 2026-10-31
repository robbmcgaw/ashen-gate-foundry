// 0.28.0: the Character Hub embed's Factions and Pantheon sub-tabs. Mocked Foundry and a mocked DOM (synthetic [TEST] data): proves markup, keys, memory, focus and permissions, not the live window.
import assert from 'node:assert/strict';
import {makeFaction,sourceDefinition,blankStanding,adjustStanding} from '../scripts/core.mjs';
import {makeDeity} from '../scripts/deity.mjs';
let checks=0;const test=(v,msg)=>{assert.ok(v,msg);checks++;};
const hooks=new Map(),socketHandlers=new Map();
globalThis.Hooks={on:(name,fn)=>hooks.set(name,fn),once:(name,fn)=>hooks.set(name,fn)};
globalThis.HTMLElement=class{};
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{NONE:0,OBSERVER:2,OWNER:3}};
class V2{async render(){this.rendered=true;return this;}async close(){this.rendered=false;this.closed=true;return this;}async _prepareContext(){return{};}async _onRender(){}}
let ctr=1;
globalThis.foundry={applications:{api:{ApplicationV2:V2,HandlebarsApplicationMixin:C=>C}},utils:{randomID:()=>String(ctr++).padStart(24,'A')}};
const journal=[];journal.get=id=>journal.find(d=>d.id===id);
const folders=[];let folderCreates=0;
globalThis.Folder={create:async data=>{folderCreates++;const f={id:'F'+folderCreates,name:data.name,type:data.type,flags:structuredClone(data.flags??{}),getFlag(mod,key){return this.flags[mod]?.[key]}};folders.push(f);return f;}};

let count=0;
function makeDoc(data){const doc={id:'J'+(++count),name:data.name,folder:data.folder??null,flags:structuredClone(data.flags??{}),ownership:structuredClone(data.ownership??{default:0}),
  getFlag(mod,key){return this.flags[mod]?.[key]},
  async setFlag(mod,key,val){this.flags[mod]??={};this.flags[mod][key]=structuredClone(val);return this;},
  async update(p){if(p.name!==undefined)this.name=p.name;if(p.folder!==undefined)this.folder=p.folder;if(p.ownership)this.ownership=structuredClone(p.ownership);for(const [key,val] of Object.entries(p)){if(!key.startsWith('flags.'))continue;const [,mod,flag]=key.split('.');this.flags[mod]??={};this.flags[mod][flag]=structuredClone(val);}return this;},
  testUserPermission(user,level){return Boolean(user.isGM||(this.ownership[user.id]??this.ownership.default)>=level);}
};journal.push(doc);return doc;}
globalThis.JournalEntry={create:async x=>makeDoc(x),updateDocuments:async rows=>{for(const row of rows){const doc=journal.get(row._id);assert.ok(doc,'update must reference existing Journal');await doc.update(row);}return rows;}};
const gm={id:'gm',name:'GM',isGM:true,active:true},p1={id:'p1',name:'Player One',isGM:false,active:true},p2={id:'p2',name:'Player Two',isGM:false,active:true};
const users=[gm,p1,p2];users.get=id=>users.find(x=>x.id===id);
const makeActor=(id,player)=>({id,name:id,type:'character',ownership:{[player.id]:3},items:[],testUserPermission(user,level){return user.isGM||this.ownership[user.id]>=level;},async createEmbeddedDocuments(type,arr){assert.equal(type,'Item');this.items.push(...arr.map(row=>({...row,getFlag:(mod,key)=>row.flags?.[mod]?.[key]})));return arr;}});
const actor1=makeActor('A1',p1),actor2=makeActor('A2',p2),actors=[actor1,actor2];actors.get=id=>actors.find(x=>x.id===id);
const settings={},settingSpecs={},notify=[];
const mod={api:null};
globalThis.game={user:gm,users,actors,journal,folders,modules:{get:()=>mod},settings:{register:(mod,key,v)=>{settings[key]=v.default;settingSpecs[key]=v;},get:(mod,key)=>settings[key],set:async(mod,key,v)=>settings[key]=v},socket:{on:(id,fn)=>socketHandlers.set(id,fn),emit:(id,p)=>socketHandlers.get(id)?.(p)}};
globalThis.ui={actors:{},notifications:{info:s=>notify.push(s),warn:s=>notify.push(s),error:s=>notify.push('ERROR '+s)}};
globalThis.fromUuid=async uuid=>uuid==='Item.Demo'?{documentName:'Item',name:'Demo Item',toObject:()=>({name:'Demo Item',type:'feat',flags:{}})}:null;
const ns='ashen-gate-factions';
function oldFaction(name,id,groupScore,shown){const f=makeFaction({id:`FACTION-${id}`,trackId:`RENOWN-${id}`,name});f.state={party:blankStanding(),individual:{}};if(groupScore){f.state.party=adjustStanding(f.state.party,{delta:groupScore,reason:'Earlier, before discovery',eventId:`RENOWN-EVT-${id}`,when:'2026-10-15T12:00:00'}).standing;}
  f.version='0.2.1';delete f.discovery;return makeDoc({name,ownership:{default:shown?2:0},flags:{[ns]:{faction:f}}});}
const deityDoc=(key,name,extra={})=>{const d=makeDeity({id:`DEITY-QA-${key}`,trackId:`RENOWN-QA-${key}`,name});Object.assign(d.deity,{title:`[TEST] Title ${key}`,symbol:`assets/test/deities/${key.toLowerCase()}.png`,saying:{text:'[TEST] saying',attribution:'[TEST] source'}},extra);return makeDoc({name,ownership:{default:0},flags:{[ns]:{faction:sourceDefinition(d)}}});};
deityDoc('SUN','[TEST] Sun Deity',{relations:[{deity_id:'DEITY-QA-MOON',resonance:1}]});
deityDoc('MOON','[TEST] Moon Deity',{tier:'lesser'});
makeDoc({name:'[TEST] Guild',ownership:{default:0},flags:{[ns]:{faction:sourceDefinition(makeFaction({id:'FACTION-QA-G',trackId:'RENOWN-QA-G',name:'[TEST] Guild'}))}}});
await import('../scripts/module.mjs');hooks.get('init')();settings.lockedRanks='all';settings.lockedRanksMigrated=true;/* show everything; the other modes are covered by locked-ranks.test.mjs and first-unlock-preview.test.mjs */hooks.get('ready')();
await new Promise(r=>setTimeout(r,30));
const view=uid=>journal.find(d=>d.getFlag(ns,'playerView')?.user_id===uid).getFlag(ns,'playerView');
const sunGroup=()=>journal.find(d=>d.getFlag(ns,'groupClaims')?.faction_id==='DEITY-QA-SUN').getFlag(ns,'groupClaims');
import nodeTest from 'node:test';
import {FakeDocument,FakeElement,fakeStorage} from '../../../scripts/kit-tests/fake-dom.mjs';
const storage=fakeStorage();globalThis.localStorage=storage;
const dashboard=mod.api.open({actorId:'A1',deityId:'DEITY-QA-SUN',tab:'pantheon'}),actions=dashboard.constructor.DEFAULT_OPTIONS.actions;
const root={dataset:{},listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},contains(el){return Boolean(el?.dataset?.agfView);}};
dashboard.element=root;await dashboard._onRender({},{});await dashboard._prepareContext();
// A discovered faction (visible to players) and a deity known only to A1.
oldFaction('[TEST] Iron March','IRON',4,true);oldFaction('[TEST] Secret Court','SECRET',7,false);
mod.api.refreshPlayerViews?.();
await actions.openDeity.call(dashboard,null,{dataset:{id:'DEITY-QA-SUN'}});
await actions.discovery.call(dashboard,null,{dataset:{mode:'actor'}});
await new Promise(r=>setTimeout(r,30));
mod.api.refreshPlayerViews?.();await new Promise(r=>setTimeout(r,30));

/* A mocked host: innerHTML is parsed into FakeElements for the parts the embed binds (tablist, tabs, panels, Open buttons). */
function host(){
  const doc=new FakeDocument(),el=doc.createElement('div');doc.body.append(el);el.isConnected=true;el.classes=new Set();
  el.classList={add:c=>el.classes.add(c),remove:c=>el.classes.delete(c),contains:c=>el.classes.has(c)};
  let html='';
  Object.defineProperty(el,'innerHTML',{get:()=>html,set(v){
    html=v;el.children=[];
    const attrsOf=s=>Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2].replace(/&amp;/g,'&')]));
    const list=html.match(/<div class="ag-tabs ag-tabs--sub"[^>]*>/);
    if(list){const l=doc.createElement('div',{class:'ag-tabs ag-tabs--sub',role:'tablist'});el.append(l);
      for(const m of html.matchAll(/<button type="button" role="tab"([^>]*)>/g))l.append(doc.createElement('button',attrsOf(m[1])));}
    for(const m of html.matchAll(/<div class="agf-embed__body" ([^>]*)>/g)){const a=attrsOf(m[1]);const p=doc.createElement('div',{class:'agf-embed__body',...a});if(/\shidden(?:\s|$|>)/.test(m[1]))p.setAttribute('hidden','');el.append(p);}
    for(const m of html.matchAll(/<button type="button" class="ag-btn ag-btn--sm" data-agf-embed="([^"]+)"([^>]*)>/g))el.append(doc.createElement('button',{'data-agf-embed':m[1],...attrsOf(m[2])}));
  },configurable:true});
  el.addEventListener=function(type,fn,{signal}={}){FakeElement.prototype.addEventListener.call(this,type,fn);signal?.addEventListener('abort',()=>this.removeEventListener(type,fn));};
  return {el,doc};
}
const tabs=el=>el.querySelectorAll('[role="tab"]'),selectedTab=el=>tabs(el).find(t=>t.getAttribute('aria-selected')==='true')?.dataset.tab;
const panelHidden=(el,id)=>el.querySelector(`[id="agf-embed-panel-${id}"]`)?.getAttribute('hidden')!==null;
const textBetween=(html,id)=>{const m=html.match(new RegExp(`id="agf-embed-panel-${id}"[\\s\\S]*?(?=<div class="agf-embed__body"|$)`));return m?m[0]:'';};

nodeTest('two kit sub-tabs, Factions then Pantheon, with panels wired',()=>{
  game.user=gm;storage.map.clear();
  const {el}=host();const v=mod.api.embed.mount(el,{actorId:'A1'});
  assert.match(el.innerHTML,/class="ag-tabs ag-tabs--sub" role="tablist" aria-label="Renown sections"/);
  assert.deepEqual(tabs(el).map(t=>t.dataset.tab),['factions','pantheon']);
  assert.equal(selectedTab(el),'factions','Factions is the default');
  assert.equal(panelHidden(el,'factions'),false);assert.equal(panelHidden(el,'pantheon'),true);
  assert.match(el.innerHTML,/>\s*Factions<\/button>/);assert.match(el.innerHTML,/>\s*Pantheon<\/button>/);
  assert.doesNotMatch(el.innerHTML,/agf-embed__heading/,'no mixed scroll heading any more');
  v.unmount();
});
nodeTest('arrow keys, Home and End move focus between the tabs; Enter or click opens one',()=>{
  game.user=gm;storage.map.clear();
  const {el,doc}=host();const v=mod.api.embed.mount(el,{actorId:'A1'});
  const [f,p]=tabs(el);f.focus();
  const list=el.querySelector('[role="tablist"]');
  list.dispatch('keydown',{key:'ArrowRight',target:f});assert.equal(doc.activeElement,tabs(el)[1]);
  assert.equal(selectedTab(el),'factions','arrows move focus only (manual activation)');
  list.dispatch('keydown',{key:'ArrowRight',target:tabs(el)[1]});assert.equal(doc.activeElement,tabs(el)[0],'wraps');
  list.dispatch('keydown',{key:'End',target:tabs(el)[0]});assert.equal(doc.activeElement,tabs(el)[1]);
  list.dispatch('keydown',{key:'Home',target:tabs(el)[1]});assert.equal(doc.activeElement,tabs(el)[0]);
  assert.equal(tabs(el)[0].getAttribute('tabindex'),'0');assert.equal(tabs(el)[1].getAttribute('tabindex'),'-1');
  tabs(el)[1].click();
  assert.equal(selectedTab(el),'pantheon');assert.equal(panelHidden(el,'pantheon'),false);assert.equal(panelHidden(el,'factions'),true);
  v.unmount();
});
nodeTest('focus stays on the same tab after the re-render a click causes, and after refresh()',()=>{
  game.user=gm;storage.map.clear();
  const {el,doc}=host();const v=mod.api.embed.mount(el,{actorId:'A1'});
  const p=tabs(el)[1];p.focus();p.click();
  assert.equal(doc.activeElement?.dataset.tab,'pantheon');assert.equal(doc.activeElement.getAttribute('role'),'tab');assert.notEqual(doc.activeElement,p,'a new element took the focus');
  v.refresh();assert.equal(doc.activeElement?.dataset.tab,'pantheon','refresh keeps focus on the tab');
  // An Open button keeps focus too.
  const open=el.querySelector('[data-agf-embed="open-deity"]');assert.ok(open,'the deity Open button is there');open.focus();
  v.refresh();assert.equal(doc.activeElement?.getAttribute('data-agf-embed'),'open-deity');assert.equal(doc.activeElement.dataset.deity,open.dataset.deity);
  // Focus elsewhere on the page is never pulled in.
  const outside=doc.createElement('button');doc.body.append(outside);outside.focus();v.refresh();assert.equal(doc.activeElement,outside);
  v.unmount();
});
nodeTest('the last tab used is remembered per user, on this device',()=>{
  storage.map.clear();
  game.user=p1;let {el}=host();let v=mod.api.embed.mount(el,{actorId:'A1'});
  tabs(el)[1].click();assert.equal(selectedTab(el),'pantheon');v.unmount();
  ({el}=host());v=mod.api.embed.mount(el,{actorId:'A1'});assert.equal(selectedTab(el),'pantheon','p1 reopens on Pantheon');v.unmount();
  game.user=gm;({el}=host());v=mod.api.embed.mount(el,{actorId:'A1'});assert.equal(selectedTab(el),'factions','another user is not affected');v.unmount();
  assert.ok([...storage.map.keys()].some(k=>k.endsWith(':p1')));
  // A stale or hostile stored value falls back to Factions.
  storage.map.set([...storage.map.keys()].find(k=>k.endsWith(':p1')),JSON.stringify({tab:'nope'}));
  game.user=p1;({el}=host());v=mod.api.embed.mount(el,{actorId:'A1'});assert.equal(selectedTab(el),'factions');v.unmount();
});
nodeTest('works without any storage (blocked or private window)',()=>{
  const saved=globalThis.localStorage;
  Object.defineProperty(globalThis,'localStorage',{get(){throw new Error('blocked');},configurable:true});
  try{game.user=p1;const {el}=host();const v=mod.api.embed.mount(el,{actorId:'A1'});tabs(el)[1].click();assert.equal(selectedTab(el),'pantheon','still switches for this session');v.unmount();}
  finally{Object.defineProperty(globalThis,'localStorage',{value:saved,writable:true,configurable:true});}
});
nodeTest('empty states: both tabs stay; no actor means no deities, nothing known means no factions',()=>{
  game.user=gm;storage.map.clear();
  let {el}=host();let v=mod.api.embed.mount(el,{});// no character: the Pantheon rule gives nothing
  assert.deepEqual(tabs(el).map(t=>t.dataset.tab),['factions','pantheon']);
  assert.match(textBetween(el.innerHTML,'pantheon'),/No deities known yet\./);
  assert.doesNotMatch(textBetween(el.innerHTML,'factions'),/No deities known yet/);
  v.unmount();
  game.user=p2;({el}=host());v=mod.api.embed.mount(el,{actorId:'A2'});// p2 has revealed nothing
  assert.deepEqual(tabs(el).map(t=>t.dataset.tab),['factions','pantheon'],'same tabs every time for a role');
  assert.match(textBetween(el.innerHTML,'pantheon'),/No deities known yet\./);
  assert.doesNotMatch(el.innerHTML,/Sun Deity|Moon Deity/);
  v.unmount();
});
nodeTest('empty Factions state when the user may see none; the Pantheon tab is still there',()=>{
  game.user=p2;storage.map.clear();const {el}=host();const v=mod.api.embed.mount(el,{actorId:'A2'});
  assert.deepEqual((view=>view.payload.factions)(journal.find(d=>d.getFlag(ns,'playerView')?.user_id==='p2').getFlag(ns,'playerView')),[],'p2 holds no faction');
  assert.match(textBetween(el.innerHTML,'factions'),/No factions known yet\./);
  assert.deepEqual(tabs(el).map(t=>t.dataset.tab),['factions','pantheon']);
  v.unmount();
});
nodeTest('permissions unchanged: player sees only revealed deities for a character they own; GM sees everything',()=>{
  game.user=p1;storage.map.clear();
  let {el}=host();let v=mod.api.embed.mount(el,{actorId:'A1'});
  const known=mod.api.getPantheon(actor1).map(r=>r.name);
  assert.ok(known.length>0,'the player knows at least one deity');
  for(const n of ['[TEST] Sun Deity','[TEST] Moon Deity'])assert.equal(el.innerHTML.includes(n),known.includes(n),n);
  assert.match(el.innerHTML,/data-agf-embed="open-deity"/);
  v.unmount();
  // Another player's character: nothing, even though the player is looking at the same embed.
  ({el}=host());v=mod.api.embed.mount(el,{actorId:'A2'});
  assert.deepEqual(mod.api.getPantheon(actor2),[]);assert.match(el.innerHTML,/No deities known yet\./);
  assert.doesNotMatch(el.innerHTML,/Sun Deity/);v.unmount();
  // The player never sees the hidden Secret faction; the GM does.
  ({el}=host());v=mod.api.embed.mount(el,{actorId:'A1'});assert.doesNotMatch(el.innerHTML,/Secret Court/);v.unmount();
  game.user=gm;({el}=host());v=mod.api.embed.mount(el,{actorId:'A1'});assert.match(el.innerHTML,/Secret Court/,'the GM sees the hidden faction');
  for(const n of ['[TEST] Guild','[TEST] Iron March'])assert.match(el.innerHTML,new RegExp(n.replace(/[[\]]/g,'\\$&')));
  assert.match(el.innerHTML,/Sun Deity/);v.unmount();
});
nodeTest('Player Access off still shows the single notice, no tabs',()=>{
  game.user=p1;settings.playerAccessEnabled=false;
  try{const {el}=host();const v=mod.api.embed.mount(el,{actorId:'A1'});assert.match(el.innerHTML,/hidden Renown/);assert.doesNotMatch(el.innerHTML,/role="tab"/);v.unmount();}
  finally{settings.playerAccessEnabled=true;}
});
nodeTest('Open buttons, ranks, next milestone and the Vow line are kept',()=>{
  game.user=gm;storage.map.clear();
  const {el}=host();const v=mod.api.embed.mount(el,{actorId:'A1'});
  assert.match(textBetween(el.innerHTML,'factions'),/data-agf-embed="open" data-faction="[^"]+"/);
  assert.match(el.innerHTML,/Next: |Top rank/);
  assert.match(textBetween(el.innerHTML,'pantheon'),/data-agf-embed="open-deity"/);
  v.unmount();
});
nodeTest('unmount removes every listener and clears the host',()=>{
  game.user=gm;const {el}=host();const v=mod.api.embed.mount(el,{actorId:'A1'});
  v.unmount();assert.equal(el.innerHTML,'');assert.equal((el.listeners.click??[]).length,0);
});
nodeTest('CSS: embed boxes use the kit box radius, never the pill radius',async()=>{
  const fs=await import('node:fs');const css=fs.readFileSync(new URL('../styles/module.css',import.meta.url),'utf8');
  const lines=css.split('\n').filter(l=>l.includes('.agf-embed'));
  assert.ok(lines.length>5);
  for(const l of lines)assert.doesNotMatch(l,/radius-control|999px/,l);
  assert.match(lines.join('\n'),/\.agf-embed \.ag-empty\{border-radius:var\(--ag-radius\)\}/);
  assert.match(lines.join('\n'),/\.agf-embed__row\{[^}]*border-radius:var\(--ag-radius\)/);
});
