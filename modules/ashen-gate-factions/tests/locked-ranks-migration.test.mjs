/** Locked ranks migration (0.25.0): a world whose GM turned the 0.24.0 switch OFF keeps seeing everything; the choice is carried over once and never overwrites a later pick. In-memory harness. NOT a browser test. */
import assert from 'node:assert/strict';
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
const ns='ashen-gate-factions';
const makeActor=(id,player,flags={})=>({id,name:id,type:'character',ownership:{[player.id]:3},items:[],flags:{[ns]:{...flags}},getFlag(m,k){return this.flags[m]?.[k]},async setFlag(m,k,v){(this.flags[m]??={})[k]=structuredClone(v);},async unsetFlag(m,k){delete this.flags[m]?.[k];},
  testUserPermission(user,level){return user.isGM||this.ownership[user.id]>=(typeof level==='string'?3:level);},async createEmbeddedDocuments(type,arr){this.items.push(...arr.map(row=>({...row,getFlag:(mod,key)=>row.flags?.[mod]?.[key]})));return arr;}});
// A1 and A1b belong to p1 (A1 has sworn a Vow to the Sun, A1b has not); A2 belongs to p2.
const actor1=makeActor('A1',p1,{vow:{deity_id:'DEITY-QA-SUN',sworn_at:'2026-10-01T00:00:00.000Z'}}),actor1b=makeActor('A1b',p1),actor2=makeActor('A2',p2),actors=[actor1,actor1b,actor2];actors.get=id=>actors.find(x=>x.id===id);
const settings={},notify=[];
const mod={api:null};
globalThis.game={user:gm,users,actors,journal,folders,modules:{get:()=>mod},settings:{register:(m,key,v)=>{settings[key]=v.default;},get:(m,key)=>settings[key],set:async(m,key,v)=>settings[key]=v},socket:{on:(id,fn)=>socketHandlers.set(id,fn),emit:(id,p)=>socketHandlers.get(id)?.(p)}};
globalThis.ui={actors:{},notifications:{info:s=>notify.push(s),warn:s=>notify.push(s),error:s=>notify.push('ERROR '+s)}};
globalThis.fromUuid=async()=>null;
await import('../scripts/module.mjs');hooks.get('init')();
settings.hideLaterTiers=false;   // the GM had turned "Hide later tiers until recruited or sworn" OFF in 0.24.0
test(settings.lockedRanksMigrated===false,'not migrated before the world opens');
hooks.get('ready')();await new Promise(r=>setTimeout(r,80));
test(settings.lockedRanks==='all'&&settings.lockedRanksMigrated===true,'old OFF becomes "Show everything" and is marked migrated');
// A later pick is never overwritten, and a second GM session does not migrate again.
settings.lockedRanks='hide';hooks.get('ready')();await new Promise(r=>setTimeout(r,80));
test(settings.lockedRanks==='hide','a second start does not overwrite the GM\'s later choice');
console.log(`locked-ranks-migration: ${checks} checks passed`);
