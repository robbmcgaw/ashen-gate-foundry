/** In-memory Foundry V14-shaped test. It is NOT a Foundry browser runtime test. */
import assert from 'node:assert/strict';
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
await import('../scripts/module.mjs');hooks.get('init')();
test(settings.playerAccessEnabled===true,'existing player-facing access stays enabled after upgrade');
test(settingSpecs.playerAccessEnabled.scope==='world'&&settingSpecs.playerAccessEnabled.restricted===true,'module owns a restricted world setting');
test(settingSpecs.playerAccessEnabled.config===true&&typeof settingSpecs.playerAccessEnabled.onChange==='function','local GM Module Settings control and live-change callback registered');
hooks.get('ready')();
await new Promise(r=>setTimeout(r,30));
const groupIron=journal.find(d=>d.getFlag(ns,'groupClaims')?.faction_id==='FACTION-IRON');
const groupSecret=journal.find(d=>d.getFlag(ns,'groupClaims')?.faction_id==='FACTION-SECRET');
const view1=journal.find(d=>d.getFlag(ns,'playerView')?.user_id==='p1'),view2=journal.find(d=>d.getFlag(ns,'playerView')?.user_id==='p2');
const store=folders.find(f=>f.getFlag(ns,'storageFolder')===true);
test(store?.type==='JournalEntry','dedicated JournalEntry storage folder created');
test(folderCreates===1,'dedicated folder created once');
test(journal.filter(d=>d.getFlag(ns,'faction')||d.getFlag(ns,'groupClaims')||d.getFlag(ns,'individual')||d.getFlag(ns,'folderIndex')||d.getFlag(ns,'playerView')).every(d=>d.folder===store.id),'all existing and new module Journals moved to storage folder');
test(unrelated.folder==='MY-GM-FOLDER','unrelated Journal folder unchanged');
test(groupIron===claimsOld,'old group state doc reused');
test(groupIron.getFlag(ns,'groupClaims').standing.score===4,'previous group standing migrated');
test(groupIron.getFlag(ns,'groupClaims').standing.events.length===1,'previous history migrated');
test(groupIron.ownership.default===0,'old group claims no longer publicly readable');
test(oldPublic.ownership.default===0,'old public faction definition now GM only');
test(!('state' in oldPublic.getFlag(ns,'faction')),'reusable faction definition excludes score');
test(Boolean(view1&&view2),'one filtered view per player');
test(view1.ownership.p1===2&&view1.ownership.p2===undefined,'view is visible only to its player');
test(view1.getFlag(ns,'playerView').payload.factions.some(f=>f.id==='FACTION-IRON'),'previously public faction is discovered');
test(!JSON.stringify(view1.getFlag(ns,'playerView')).includes('Secret Court'),'undiscovered faction identity hidden');
const actions=mod.api.open().constructor.DEFAULT_OPTIONS.actions,dashboard=mod.api.open();
await dashboard._prepareContext();
// Verify real delegated tab-click path (rather than calling action methods directly).
const root={dataset:{},listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},contains(el){return Boolean(el?.dataset?.agfView);}};
dashboard.element=root;
await dashboard._onRender({},{});
test(Boolean(root.listeners.click),'real click listener attached to application shell');
async function clickView(page){
  const button={dataset:{agfView:page}};let prevented=false;
  root.listeners.click({target:{closest:selector=>selector==='button[data-agf-view]'?button:null},preventDefault(){prevented=true;}});
  await new Promise(resolve=>setTimeout(resolve,0));
  return{context:await dashboard._prepareContext(),prevented};
}
let viewResult=await clickView('player');
test(viewResult.context.tabPlayer&&!viewResult.context.tabGroup&&viewResult.prevented,'clicking Player opens player view');
viewResult=await clickView('orgs');
test(viewResult.context.tabOrgs&&!viewResult.context.tabPlayer&&!viewResult.context.tabSetup,'clicking Organizations opens GM content view');
viewResult=await clickView('setup');
test(viewResult.context.tabSetup&&!viewResult.context.tabOrgs,'clicking GM Setup opens settings view');
viewResult=await clickView('group');
test(viewResult.context.tabGroup&&!viewResult.context.tabOrgs&&!viewResult.context.tabSetup,'clicking Group restores group view');
// Client-level authorization remains strict if a forged GM button is present.
game.user=p1;await clickView('player');viewResult=await clickView('orgs');
test(viewResult.context.tabPlayer&&!viewResult.context.tabOrgs,'player cannot select Organizations even with forged button');
viewResult=await clickView('setup');
test(viewResult.context.tabPlayer&&!viewResult.context.tabSetup,'player cannot select GM Setup even with forged button');
game.user=gm;await clickView('group');
// Shell event wiring survives a later render (listeners attach once).
await dashboard._onRender({},{});test(root.listeners.click!==undefined,'tab delegation remains active');

await actions.select.call(dashboard,null,{dataset:{id:'FACTION-SECRET'}});
// Award additional Group Renown to an undiscovered organization.
const award=(scope,delta,reason)=>({dataset:{scope},closest:()=>({querySelector:sel=>sel.includes('renown-delta')?{value:String(delta)}:{value:reason}})});
await actions.award.call(dashboard,null,award('group',2,'Secret negotiation'));
test(groupSecret.getFlag(ns,'groupClaims').standing.score===9,'undiscovered faction tracks Renown');
test(!JSON.stringify(view1.getFlag(ns,'playerView').payload).includes('Secret negotiation'),'undiscovered history is hidden');
await actions.discovery.call(dashboard,null,{dataset:{mode:'party'}});
let v1=view1.getFlag(ns,'playerView').payload.factions.find(f=>f.id==='FACTION-SECRET');
test(v1?.group?.score===9,'score revealed after discovery');
test(v1?.group?.history?.length===2,'prior Renown events revealed after discovery');
// Reveal another faction to just one Actor, then share it to the whole party.
const individual=oldFaction('Masked Fellowship','MASK',0,false);
await actions.select.call(dashboard,null,{dataset:{id:'FACTION-MASK'}});
await actions.discovery.call(dashboard,null,{dataset:{mode:'actor'}});
test(view1.getFlag(ns,'playerView').payload.factions.some(f=>f.id==='FACTION-MASK'),'individual discovery visible to owner');
test(!view2.getFlag(ns,'playerView').payload.factions.some(f=>f.id==='FACTION-MASK'),'individual discovery hidden from other player');
const playerAuth=view1.getFlag(ns,'playerView');
game.socket.emit(`module.${ns}`,{type:'share',factionId:'FACTION-MASK',userId:'p1',capability:playerAuth.capability});
await new Promise(r=>setTimeout(r,30));
test(view2.getFlag(ns,'playerView').payload.factions.some(f=>f.id==='FACTION-MASK'),'share with party reveals faction');
// Personal Renown remains private, and doesn't mutate Group standing.
await actions.select.call(dashboard,null,{dataset:{id:'FACTION-IRON'}});
await actions.award.call(dashboard,null,award('individual',3,'Saved a faction officer'));
const personal=journal.find(d=>d.getFlag(ns,'individual')?.actor_id==='A1');
test(personal.getFlag(ns,'individual').standing.score===3,'personal score increased');
test(personal.folder===store.id,'newly created personal-state Journal stored inside folder');
test(groupIron.getFlag(ns,'groupClaims').standing.score===4,'group score unchanged by individual action');
test(!JSON.stringify(view2.getFlag(ns,'playerView').payload).includes('Saved a faction officer'),'private individual history not leaked');
// An old faction remains group-visible and source state stays GM-only.
const source=oldPublic.getFlag(ns,'faction');
test(!JSON.stringify(source).includes('Saved a faction officer'),'personal state never stored in definition');

// AG-WORK-0009 GM-only typed Objective authoring, independent of campaign state.
await actions.select.call(dashboard,null,{dataset:{id:'FACTION-IRON'}});
const scoreBeforeRef=groupIron.getFlag(ns,'groupClaims').standing.score;
const queryValues={'agf-objective-id':'QUEST-HIDDEN-001','objective-relation':'offers_objective','objective-mode':'optional'};
dashboard.element={querySelector:selector=>({value:queryValues[selector.match(/\[name=[\"']?([^\"'\]]+)/)?.[1]??selector.match(/^#(.+)$/)?.[1]]??''})};
await actions.addObjective.call(dashboard);
const authorRefs=oldPublic.getFlag(ns,'faction').refs;
test(authorRefs.some(x=>x.target_id==='QUEST-HIDDEN-001'&&x.relation==='offers_objective'&&x.mode==='optional'),'GM picked Objective reference persisted');
test(groupIron.getFlag(ns,'groupClaims').standing.score===scoreBeforeRef,'Objective authoring did not alter Group Renown');
test(!JSON.stringify(view1.getFlag(ns,'playerView')).includes('QUEST-HIDDEN-001'),'Objective ID withheld from player projection');
test(mod.api.getObjectiveRefs('FACTION-IRON').length===1,'GM can read canonical refs via read-only API');
game.user=p1;
assert.throws(()=>mod.api.getObjectiveRefs('FACTION-IRON'),/GM authorization required/);checks++;
game.user=gm;
globalThis.window={confirm:()=>true,prompt:()=>null};
await actions.removeObjective.call(dashboard,null,{dataset:{relation:'offers_objective',objective:'QUEST-HIDDEN-001',mode:'optional'}});
test(oldPublic.getFlag(ns,'faction').refs.every(r=>r.target_id!=='QUEST-HIDDEN-001'),'GM can remove reference without deleting quest');
test(groupIron.getFlag(ns,'groupClaims').standing.score===scoreBeforeRef,'removing Objective reference leaves standing untouched');

// Group reward requests: GM confirms one-time claims, repeatable services charge on fulfillment.
globalThis.window={confirm:()=>true,prompt:()=>null};
const milestone=oldPublic.getFlag(ns,'faction').renown_track.milestones[0].id;
const zone=(name,behavior,limit=0)=>({dataset:{audience:'group',milestone},querySelector:sel=>{if(sel.includes('reward-name'))return{value:name};if(sel.includes('reward-description'))return{value:'Test reward'};if(sel.includes('reward-behavior'))return{value:behavior};if(sel.includes('reward-limit'))return{value:String(limit)};return null;}});
await actions.addReward.call(dashboard,null,{closest:()=>zone('Test Service','repeatable_service',1)});
await actions.addReward.call(dashboard,null,{closest:()=>zone('Test Gift','one_time',0)});
let allRewards=oldPublic.getFlag(ns,'faction').rewards;
const service=allRewards.find(x=>x.name==='Test Service'),gift=allRewards.find(x=>x.name==='Test Gift');
test(Boolean(service&&gift),'GM created rewards on old migrated faction');
const auth=view1.getFlag(ns,'playerView');
const send=(rewardId,actorId=null,audience='group',userId='p1',capability=auth.capability)=>game.socket.emit(`module.${ns}`,{type:'request',factionId:'FACTION-IRON',rewardId,actorId,audience,userId,capability});
const tick=()=>new Promise(r=>setTimeout(r,15));
send(gift.id);await tick();
let status=groupIron.getFlag(ns,'groupClaims');
test(status.claims[gift.id]?.status==='pending','one-time claim pending');
await actions.resolveRequest.call(dashboard,null,{dataset:{doc:groupIron.id,key:gift.id,claim:'1',mode:'approve'}});
test(groupIron.getFlag(ns,'groupClaims').claims[gift.id].status==='approved','GM approved claim');
await actions.resolveRequest.call(dashboard,null,{dataset:{doc:groupIron.id,key:gift.id,claim:'1',mode:'fulfill'}});
test(groupIron.getFlag(ns,'groupClaims').claims[gift.id].status==='claimed','GM marked one-time claim delivered');
send(gift.id);await tick();
test(Object.keys(groupIron.getFlag(ns,'groupClaims').claims).length===1,'one-time claim not repeated');
send(service.id);await tick();
status=groupIron.getFlag(ns,'groupClaims');const [req1]=Object.keys(status.requests);
test(status.requests[req1]?.status==='requested','repeatable service requested');
test(!status.requests[req1].usage_charged,'not charged on request');
await actions.resolveRequest.call(dashboard,null,{dataset:{doc:groupIron.id,key:req1,claim:'',mode:'approve'}});
test(!groupIron.getFlag(ns,'groupClaims').requests[req1].usage_charged,'not charged on approval');
await actions.resolveRequest.call(dashboard,null,{dataset:{doc:groupIron.id,key:req1,claim:'',mode:'fulfill'}});
test(groupIron.getFlag(ns,'groupClaims').requests[req1].status==='fulfilled','service fulfilled');
test(groupIron.getFlag(ns,'groupClaims').uses[service.id].consumed===1,'service charged on fulfillment');
send(service.id);await tick();
test(Object.keys(groupIron.getFlag(ns,'groupClaims').requests).length===1,'usage limit blocks extra request');
await actions.resetUsage.call(dashboard,null,{dataset:{audience:'group',reward:service.id}});
test(groupIron.getFlag(ns,'groupClaims').uses[service.id].consumed===0,'manual reset restores service');
send(service.id);await tick();
test(Object.keys(groupIron.getFlag(ns,'groupClaims').requests).length===2,'service can be requested after GM reset');
// An Item grant is idempotent when a save is interrupted after Actor mutation.
await actions.addReward.call(dashboard,null,{closest:()=>zone('Test Item','one_time')});
const item=oldPublic.getFlag(ns,'faction').rewards.find(x=>x.name==='Test Item');item.kind='uuid';item.uuid='Item.Demo';item.document_type='Item';
send(item.id);await tick();
dashboard.element={querySelector:()=>({value:actor1.id})};
await actions.resolveRequest.call(dashboard,null,{dataset:{doc:groupIron.id,key:item.id,claim:'1',mode:'approve'}});
test(actor1.items.length===1,'linked Item delivered to GM-selected recipient');
const interrupted=structuredClone(groupIron.getFlag(ns,'groupClaims'));interrupted.claims[item.id].status='pending';await groupIron.setFlag(ns,'groupClaims',interrupted);
await actions.resolveRequest.call(dashboard,null,{dataset:{doc:groupIron.id,key:item.id,claim:'1',mode:'approve'}});
test(actor1.items.length===1,'repeat grant prevented on interrupted approval retry');
// A player cannot request a different player's personal reward via forged Actor ID.
await actions.addReward.call(dashboard,null,{closest:()=>({...zone('Private Training','one_time'),dataset:{audience:'individual',milestone:oldPublic.getFlag(ns,'faction').individual_track.milestones[0].id}})});
const personalReward=oldPublic.getFlag(ns,'faction').rewards.find(x=>x.name==='Private Training');
send(personalReward.id,actor2.id,'individual');await tick();
test(!journal.some(d=>d.getFlag(ns,'individual')?.actor_id==='A2'&&d.getFlag(ns,'individual').claims[personalReward.id]),'unauthorized personal claim rejected');

// DEC-0072 public contract: status only, GM-only world setting, no campaign writes.
const api=mod.api.playerAccess;
test(api.contract==='ag-player-access/1','advertises correct contract');
test(JSON.stringify(api.getState())===JSON.stringify({contract:'ag-player-access/1',moduleId:ns,audience:'player',playerAccessEnabled:true,configurable:true}), 'status contains only documented fields');
const beforeGate=JSON.stringify({factions:oldPublic.getFlag(ns,'faction'),group:groupIron.getFlag(ns,'groupClaims'),individual:personal.getFlag(ns,'individual')});
await assert.rejects(()=>api.setEnabled('false'),/Boolean/, 'must reject non-boolean settings');checks++;
await api.setEnabled(false);
test(api.getState().playerAccessEnabled===false,'GM hides player interface via public API');
// The GM Setup page offers an independent local route even with Manager disabled.
const setupContext=await dashboard._prepareContext();
test(setupContext.playerAccessEnabled===false,'GM Setup reflects current Hidden status');
test(JSON.stringify({factions:oldPublic.getFlag(ns,'faction'),group:groupIron.getFlag(ns,'groupClaims'),individual:personal.getFlag(ns,'individual')})===beforeGate,'hiding UI does not change Renown, claims or characters');
test(mod.api.open()===dashboard,'GM still opens Factions while player interface Hidden');
// Simulate the player client reacting to the synchronized Foundry world-setting hook.
game.user=p1;
hooks.get('updateSetting')({key:`${ns}.playerAccessEnabled`,value:false});
await new Promise(r=>setTimeout(r,0));
test(dashboard.closed===true&&!dashboard.rendered,'already-open player window closed when setting Hidden');
assert.throws(()=>mod.api.open(),/hidden from players/);checks++;
assert.throws(()=>mod.api.getFactions(),/hidden from players/);checks++;
await assert.rejects(()=>dashboard._prepareContext(),/hidden from players/);checks++;
await assert.rejects(()=>api.setEnabled(true),/GM authorization required/);checks++;
test(api.getState().playerAccessEnabled===false,'non-GM cannot change authoritative Player Access setting');
// A player cannot bypass the gate via a request macro after hiding the UI.
game.user=gm;
const beforeHiddenRequest=Object.keys(groupIron.getFlag(ns,'groupClaims').requests).length;
send(service.id);await tick();
test(Object.keys(groupIron.getFlag(ns,'groupClaims').requests).length===beforeHiddenRequest,'GM rejects requests while player UI hidden');
await api.setEnabled(true);
game.user=p1;
hooks.get('updateSetting')({key:`${ns}.playerAccessEnabled`,value:true});
test(api.getState().playerAccessEnabled===true,'reveal reflected to player client');
settingSpecs.playerAccessEnabled.onChange(true);
test(Boolean(mod.api.open()),'player can reopen after reveal');
test(mod.api.getFactions().some(f=>f.id==='FACTION-IRON'),'player sees previously discovered factions after reveal');
test(JSON.stringify({factions:oldPublic.getFlag(ns,'faction'),group:groupIron.getFlag(ns,'groupClaims'),individual:personal.getFlag(ns,'individual')})===beforeGate,'reveal does not alter campaign state');
game.user=gm;
console.log(`FACTIONS V0.4 PLAYER ACCESS IN-MEMORY RUNTIME OK: ${checks} assertions.`);
