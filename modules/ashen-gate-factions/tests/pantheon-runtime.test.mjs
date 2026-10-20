/** Pantheon runtime check in an in-memory Foundry V14-shaped harness (copied from runtime-v04-smoke). NOT a browser test. */
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
deityDoc('SUN','[TEST] Sun Deity',{relations:[{deity_id:'DEITY-QA-MOON',resonance:1}]});
deityDoc('MOON','[TEST] Moon Deity',{tier:'lesser'});
makeDoc({name:'[TEST] Guild',ownership:{default:0},flags:{[ns]:{faction:sourceDefinition(makeFaction({id:'FACTION-QA-G',trackId:'RENOWN-QA-G',name:'[TEST] Guild'}))}}});
await import('../scripts/module.mjs');hooks.get('init')();hooks.get('ready')();
await new Promise(r=>setTimeout(r,30));
const view=uid=>journal.find(d=>d.getFlag(ns,'playerView')?.user_id===uid).getFlag(ns,'playerView');
const sunGroup=()=>journal.find(d=>d.getFlag(ns,'groupClaims')?.faction_id==='DEITY-QA-SUN').getFlag(ns,'groupClaims');
test(mod.api.getFactions().every(f=>f.entity_type!=='Deity'),'getFactions lists factions only');
test(mod.api.getDeities().length===2,'GM getDeities lists every deity');
test(view('p1').payload.factions.every(f=>!f.id.startsWith('DEITY-')),'deities never appear as factions in a player view');
test(view('p1').payload.deities.length===0&&!JSON.stringify(view('p1')).includes('Sun Deity'),'unrevealed deities are absent from the player view');
const dashboard=mod.api.open(),actions=dashboard.constructor.DEFAULT_OPTIONS.actions;
const root={dataset:{},listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},contains(el){return Boolean(el?.dataset?.agfView);}};
dashboard.element=root;await dashboard._onRender({},{});
const clickView=async page=>{root.listeners.click({target:{closest:s=>s==='button[data-agf-view]'?{dataset:{agfView:page}}:null},preventDefault(){}});await new Promise(r=>setTimeout(r,0));return dashboard._prepareContext();};
let ctx=await clickView('pantheon');
test(ctx.tabPantheon&&ctx.pantheon.groups.map(g=>g.tier).join()==='major,lesser','GM Pantheon groups tiles by tier');
await actions.openDeity.call(dashboard,null,{dataset:{id:'DEITY-QA-SUN'}});
ctx=await dashboard._prepareContext();
test(ctx.pantheon.open?.card?.title==='[TEST] Title SUN'&&ctx.pantheon.open.gm,'GM opens the deity card with GM controls');
await actions.discovery.call(dashboard,null,{dataset:{mode:'actor'}});
let sun=view('p1').payload.deities.find(d=>d.id==='DEITY-QA-SUN');
test(Boolean(sun)&&sun.symbol==='assets/test/deities/sun.png','revealed to A1: p1 sees the card');
test(!view('p2').payload.deities.length,'p2 (no character knows it) sees nothing');
test(sun.relations.length===0&&!JSON.stringify(view('p1')).includes('Moon Deity'),'relation to an unrevealed deity is not leaked');
test(!('discovery' in sun)&&!('tags' in sun)&&!('deity' in sun),'player card carries no GM fields');
const award=(scope,delta,reason)=>({dataset:{scope},closest:()=>({querySelector:sel=>sel.includes('renown-delta')?{value:String(delta)}:{value:reason}})});
const moonA1=()=>journal.find(d=>d.getFlag(ns,'individual')?.faction_id==='DEITY-QA-MOON'&&d.getFlag(ns,'individual')?.actor_id==='A1')?.getFlag(ns,'individual');
// No DialogV2 in this harness, so the knock-on list falls back to one confirm() per item. First: GM cancels -> nothing at all is written.
globalThis.confirm=()=>false;
await actions.award.call(dashboard,null,award('individual',4,'[TEST] Offering'));
test(!moonA1()?.standing?.score,'unticked knock-on is not applied');
globalThis.confirm=()=>true;
await actions.award.call(dashboard,null,award('individual',4,'[TEST] Offering'));
sun=view('p1').payload.deities.find(d=>d.id==='DEITY-QA-SUN');
test(sun.personal.A1.score===8&&sun.personal.A1.rank==='Rank III','per-character favour and rank projected');
test(moonA1().standing.score===2,'ticked knock-on: full resonance at default damping 0.5 gives +2 for +4');
const moonEv=moonA1().standing.events.at(-1);
test(moonEv.source_deity==='DEITY-QA-SUN'&&moonEv.caused_by&&moonEv.reason.startsWith('Resonance with [TEST] Sun Deity'),'knock-on history names its cause');
test(sunGroup().standing.score===0,'knock-ons never touch group standing');
notify.length=0;await actions.award.call(dashboard,null,award('group',2,'[TEST] Group'));
test(sunGroup().standing.score===0&&notify.some(n=>n.includes('no group standing')),'a deity refuses group standing');
test(mod.api.getPantheon(actor1).map(r=>[r.id,r.score]).join()==='DEITY-QA-SUN,8','GM getPantheon reads one character');
// Undo the second offering: reversing entries for it and its knock-on; nothing deleted, no further spread.
const sunA1=()=>journal.find(d=>d.getFlag(ns,'individual')?.faction_id==='DEITY-QA-SUN'&&d.getFlag(ns,'individual')?.actor_id==='A1').getFlag(ns,'individual');
const gainId=sunA1().standing.events.at(-1).id,before=sunA1().standing.events.length;
await actions.undoFavour.call(dashboard,null,{dataset:{event:gainId}});
test(sunA1().standing.score===4&&moonA1().standing.score===0,'undo reverses the gain and its knock-on');
test(sunA1().standing.events.length===before+1&&sunA1().standing.events.at(-1).reverses===gainId,'undo is a new history entry');
notify.length=0;await actions.undoFavour.call(dashboard,null,{dataset:{event:gainId}});
test(sunA1().standing.score===4&&notify.some(n=>n.includes('already')),'an entry cannot be undone twice');
ctx=await dashboard._prepareContext();
test(ctx.pantheon.open.relations[0].preview==='gain 10 → +5'&&ctx.pantheon.open.history.find(h=>h.id===gainId)?.undone,'GM sees slider preview and undone mark');
await actions.openDeity.call(dashboard,null,{dataset:{id:'DEITY-QA-MOON'}});
await actions.discovery.call(dashboard,null,{dataset:{mode:'party'}});
sun=view('p1').payload.deities.find(d=>d.id==='DEITY-QA-SUN');
test(sun.relations.map(r=>`${r.name}:${r.label}`).join()==='[TEST] Moon Deity:Resonance','relation shows once both deities are revealed');
test(view('p2').payload.deities.map(d=>d.id).join()==='DEITY-QA-MOON','party reveal reaches every player; per-character reveal does not');
// Player-side reads: only owned characters, only from the projected view.
game.user=p1;
test(mod.api.getPantheon(actor1).map(r=>r.id).join()==='DEITY-QA-SUN,DEITY-QA-MOON','player reads their own character');
test(mod.api.getPantheon(actor2).length===0,'player cannot read another player\'s character');
test(mod.api.getDeities().every(d=>!('discovery' in d)),'player getDeities is the projected view');
ctx=await clickView('pantheon');
test(ctx.pantheon.groups.flatMap(g=>g.tiles).length===2,'player Pantheon shows the revealed deities');
game.user=gm;
// A forged group-audience request for a deity is refused in the GM handler.
const sunDef=mod.api.getDeities().find(d=>d.id==='DEITY-QA-SUN');
const rw={id:'rw-QA',key:'rw_qa',audience:'individual',milestone_id:sunDef.individual_track.milestones[1].id,name:'[TEST] Boon',teaser:'[TEST] Boon',description:'',kind:'custom',tags:[],behavior:'one_time',usage_limit:0};
const sunDoc=journal.find(d=>d.getFlag(ns,'faction')?.id==='DEITY-QA-SUN');await sunDoc.setFlag(ns,'faction',{...sunDoc.getFlag(ns,'faction'),rewards:[rw]});
notify.length=0;
game.socket.emit(`module.${ns}`,{type:'request',factionId:'DEITY-QA-SUN',audience:'group',rewardId:'rw-QA',userId:'p1',capability:view('p1').capability});
await new Promise(r=>setTimeout(r,30));
test(Object.keys(sunGroup().claims??{}).length===0&&notify.some(n=>n.includes('per character')),'group request for a deity rejected');
game.socket.emit(`module.${ns}`,{type:'request',factionId:'DEITY-QA-SUN',audience:'individual',actorId:'A1',rewardId:'rw-QA',userId:'p1',capability:view('p1').capability});
await new Promise(r=>setTimeout(r,30));
const a1=journal.find(d=>d.getFlag(ns,'individual')?.faction_id==='DEITY-QA-SUN'&&d.getFlag(ns,'individual')?.actor_id==='A1').getFlag(ns,'individual');
test(a1.claims['rw-QA']?.status==='pending','per-character claim on an unlocked deity reward is recorded');
import('node:test').then(({default:t})=>t('pantheon runtime checks',()=>assert.ok(checks>=20)));
