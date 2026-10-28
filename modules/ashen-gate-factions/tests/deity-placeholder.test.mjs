/** Pantheon runtime check in an in-memory Foundry V14-shaped harness (copied from runtime-v04-smoke). NOT a browser test. */
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {makeFaction,sourceDefinition} from '../scripts/core.mjs';
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


makeDoc({name:'[TEST] Guild',ownership:{default:0},flags:{[ns]:{faction:sourceDefinition(makeFaction({id:'FACTION-QA-G',trackId:'RENOWN-QA-G',name:'[TEST] Guild'}))}}});
// 0.21.1: "Show undiscovered placeholder" for deities. Mocked harness; not the live Foundry UI. Synthetic [TEST] data only.
const sunDoc=deityDoc('SUN','[TEST] Sun Deity'),moonDoc=deityDoc('MOON','[TEST] Moon Deity',{tier:'lesser'}),hidDoc=deityDoc('HID','[TEST] Hidden Deity');
const guild=makeFaction({id:'FACTION-QA-G2',trackId:'RENOWN-QA-G2',name:'[TEST] Guild Two'});guild.discovery.placeholder=true;
makeDoc({name:'[TEST] Guild Two',ownership:{default:0},flags:{[ns]:{faction:sourceDefinition(guild)}}});
await import('../scripts/module.mjs');hooks.get('init')();hooks.get('ready')();
await new Promise(r=>setTimeout(r,30));
const view=uid=>journal.find(d=>d.getFlag(ns,'playerView')?.user_id===uid).getFlag(ns,'playerView');
const setDisc=async(doc,patch)=>{const f=structuredClone(doc.getFlag(ns,'faction'));f.discovery={...f.discovery,...patch};await doc.setFlag(ns,'faction',f);await mod.api.refreshPlayerViews();await new Promise(r=>setTimeout(r,30));};
const secrets=['Sun Deity','Moon Deity','Hidden Deity','DEITY-QA','sun.png','moon.png','hid.png','[TEST] Title','RENOWN-QA'];
const leaks=v=>secrets.filter(s=>JSON.stringify(v).includes(s));
const dashboard=mod.api.open(),root={dataset:{},listeners:{},addEventListener(t,fn){this.listeners[t]=fn;},contains(){return true;}};
dashboard.element=root;await dashboard._onRender({},{});
const pantheon=async()=>{root.listeners.click({target:{closest:s=>s==='button[data-agf-view]'?{dataset:{agfView:'pantheon'}}:null},preventDefault(){}});await new Promise(r=>setTimeout(r,0));return dashboard._prepareContext();};
const holders=uid=>view(uid).payload.deityPlaceholders;

test(holders('p1').length===0&&view('p1').payload.deities.length===0,'setting off everywhere: nothing for the player');

await setDisc(moonDoc,{placeholder:true});
test(holders('p1').length===1&&JSON.stringify(holders('p1')[0])===JSON.stringify({kind:'deity-placeholder',tier:'lesser',key:'lesser-1'}),'undiscovered + placeholder: one minimal record');
test(leaks(view('p1')).length===0,'no name/symbol/title/domain/id in the player view: '+leaks(view('p1')));
test(view('p1').payload.deities.length===0,'placeholder is not in payload.deities');
test(!JSON.stringify(view('p1')).includes('Hidden Deity')&&!JSON.stringify(view('p1')).includes('QA-HID'),'undiscovered without placeholder stays hidden');

game.user=p1;
let ctx=await pantheon();
let lesser=ctx.pantheon.groups.find(g=>g.tier==='lesser');
test(ctx.pantheon.groups.length===1&&lesser.tiles.length===0&&lesser.placeholders.length===1&&lesser.total===1,'player Pantheon: placeholder tile in the lesser group, counted');
test(mod.api.getDeities().length===0&&mod.api.getPantheon(actor1).length===0,'API lists no placeholders');
test(!JSON.stringify(ctx.pantheon).match(/Moon Deity|DEITY-QA/),'rendered context carries no identity');
game.user=gm;

// Major placeholder too, with a second lesser one: keys are per-tier ordinals.
await setDisc(sunDoc,{placeholder:true});await setDisc(hidDoc,{placeholder:true});
test(holders('p1').map(h=>h.key).join()==='major-1,lesser-1,major-2'||holders('p1').map(h=>h.tier+':'+h.key).sort().join()==='lesser:lesser-1,major:major-1,major:major-2','per-tier opaque keys');
test(leaks(view('p1')).length===0,'still no leak with three placeholders');

// Per-character discovery: A1 learns the Sun deity; p1 gets the real tile and loses that placeholder, p2 still sees it.
await setDisc(sunDoc,{actors:['A1']});
test(view('p1').payload.deities.map(d=>d.name).join()==='[TEST] Sun Deity'&&holders('p1').filter(h=>h.tier==='major').length===1,'per-actor discovery replaces the placeholder for that player');
test(view('p2').payload.deities.length===0&&holders('p2').filter(h=>h.tier==='major').length===2&&!JSON.stringify(view('p2')).includes('Sun Deity'),'other player keeps the placeholder and sees no details');
game.user=p1;ctx=await pantheon();
const major=ctx.pantheon.groups.find(g=>g.tier==='major');
test(major.tiles.length===1&&major.placeholders.length===1&&major.total===2,'real tile and placeholder side by side, total counts both');
test(mod.api.getPantheon(actor1).map(r=>r.id).join()==='DEITY-QA-SUN','getPantheon lists the known deity only');
game.user=gm;

// Party discovery: placeholder becomes the real tile for everyone.
await setDisc(moonDoc,{party:true});
test(view('p2').payload.deities.some(d=>d.name==='[TEST] Moon Deity')&&holders('p2').filter(h=>h.tier==='lesser').length===0&&holders('p2').filter(h=>h.tier==='major').length===2,'party-discovered deity is a real tile and its placeholder is gone; major placeholders remain');

// GM view unchanged: all real tiles, no placeholders.
ctx=await pantheon();
test(ctx.pantheon.groups.every(g=>g.placeholders.length===0)&&ctx.pantheon.count===3,'GM Pantheon lists every deity and no placeholders');

// Faction placeholders unchanged.
const fview=view('p1').payload;
test(fview.folders.some(f=>f.unknown_count>=1)&&!JSON.stringify(fview).includes('Guild Two'),'faction placeholder behaviour unchanged');

// Template: non-interactive tile with the accessible text, no data-action.
const tpl=readFileSync(new URL('../templates/dashboard.hbs',import.meta.url),'utf8');
const tile=tpl.match(/\{\{#each placeholders\}\}[\s\S]*?\{\{\/each\}\}/)[0];
test(!/<button|data-action|data-id|href|tabindex/.test(tile)&&/aria-label="Undiscovered deity\. Not yet known to your character\."/.test(tile)&&/Undiscovered deity/.test(tile)&&!/\{\{(name|id|symbol|title)\}\}/.test(tile),'placeholder tile markup is inert and labelled');
import('node:test').then(({default:t})=>t('deity placeholder checks',()=>assert.ok(checks>=17)));
