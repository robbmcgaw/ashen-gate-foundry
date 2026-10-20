/** 0.9.0: api.embed.mount. In-memory Foundry V14-shaped data and a fake element: proves gates and data sources, not the live UI. */
import assert from 'node:assert/strict';
import nodeTest from 'node:test';
import {makeFaction,blankStanding,adjustStanding} from '../scripts/core.mjs';
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
const oldPublic=oldFaction('Iron March','IRON',4,true),oldHidden=oldFaction('Secret Court','SECRET',7,false);
const unrelated=makeDoc({name:'Unrelated adventure notes',folder:'MY-GM-FOLDER',ownership:{default:2}});
// v0.2.1 claim state had no standing and could be observed by players.
const claimsOld=makeDoc({name:'Group Claims',ownership:{default:2},flags:{[ns]:{groupClaims:{faction_id:'FACTION-IRON',claims:{}}}}});
await import('../scripts/module.mjs');hooks.get('init')();hooks.get('ready')();
await new Promise(r=>setTimeout(r,30));
const api=mod.api;
function fakeElement(){
  const listeners=[];
  const el={innerHTML:'',isConnected:true,classes:new Set(),listeners,
    classList:{add:c=>el.classes.add(c),remove:c=>el.classes.delete(c)},
    addEventListener(type,fn,{signal}={}){const l={type,fn};listeners.push(l);signal?.addEventListener('abort',()=>listeners.splice(listeners.indexOf(l),1));},
    contains:()=>true,fire(type,target){for(const l of listeners.filter(x=>x.type===type))l.fn({target,stopPropagation(){},preventDefault(){}});}};
  return el;
}
nodeTest('GM: every faction with party and character rank, score and next milestone',()=>{
  game.user=gm;
  const el=fakeElement();const view=api.embed.mount(el,{actorId:'A1',mode:'character'});
  assert.ok(el.classes.has('agf-embed'));
  assert.match(el.innerHTML,/Iron March[\s\S]*\+4[\s\S]*Next: /);
  assert.match(el.innerHTML,/Secret Court/,'GM sees hidden factions');
  assert.match(el.innerHTML,/<small>A1<\/small>/);
  assert.match(el.innerHTML,/data-agf-embed="open" data-faction="FACTION-IRON"/);
  view.unmount();assert.equal(el.innerHTML,'');assert.equal(el.listeners.length,0);
});
nodeTest('player: only their own filtered view; never factions the view does not hold',()=>{
  game.user=p1;
  const el=fakeElement();const view=api.embed.mount(el,{actorId:'A1'});
  const v=journal.find(d=>d.getFlag(ns,'playerView')?.user_id==='p1').getFlag(ns,'playerView').payload.factions.map(f=>f.name);
  for(const name of ['Iron March','Secret Court'])assert.equal(el.innerHTML.includes(name),v.includes(name),name);
  assert.doesNotMatch(el.innerHTML,/Secret Court/,'unrevealed faction never shown');
  assert.match(el.innerHTML,/Iron March[\s\S]*<small>A1<\/small>/,'the discovered faction with their own standing');
  view.unmount();
});
nodeTest('player looking at another player\'s character gets no personal standing',()=>{
  game.user=p1;
  const el=fakeElement();api.embed.mount(el,{actorId:'A2'});
  assert.doesNotMatch(el.innerHTML,/<small>A2<\/small>/);
});
nodeTest('Player Access off hides it from players; Open goes to the dashboard on that faction',async()=>{
  game.user=p1;settings.playerAccessEnabled=false;
  const el=fakeElement();const view=api.embed.mount(el,{actorId:'A1'});
  assert.match(el.innerHTML,/hidden Renown/);
  settings.playerAccessEnabled=true;view.refresh();
  game.user=gm;view.refresh();
  const b={dataset:{agfEmbed:'open',faction:'FACTION-IRON'}};b.closest=sel=>sel==='[data-agf-embed="open"]'?b:null;
  el.fire('click',b);
  await new Promise(r=>setTimeout(r,10));
  view.unmount();
});
nodeTest('bad arguments throw; modes listed',()=>{
  assert.throws(()=>api.embed.mount(null),/DOM element/);
  assert.throws(()=>api.embed.mount(fakeElement(),{mode:'claims'}),/Unknown embed mode/);
  assert.deepEqual([...api.embed.modes],['character']);
});
