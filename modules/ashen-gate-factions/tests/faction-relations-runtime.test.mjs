/** Faction relations runtime (0.22.0) in the in-memory Foundry V14-shaped harness (from pantheon-runtime). NOT a browser test. */
import assert from 'node:assert/strict';
import {makeFaction,sourceDefinition} from '../scripts/core.mjs';
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
const makeActor=(id,player)=>({id,name:id,type:'character',ownership:{[player.id]:3},items:[],testUserPermission(user,level){return user.isGM||this.ownership[user.id]>=level;},async createEmbeddedDocuments(type,arr){this.items.push(...arr);return arr;}});
const actor1=makeActor('A1',p1),actor2=makeActor('A2',p2),actors=[actor1,actor2];actors.get=id=>actors.find(x=>x.id===id);
const settings={},notify=[];
const mod={api:null};
globalThis.game={user:gm,users,actors,journal,folders,modules:{get:()=>mod},settings:{register:(m,key,v)=>{settings[key]=v.default;},get:(m,key)=>settings[key],set:async(m,key,v)=>settings[key]=v},socket:{on:(id,fn)=>socketHandlers.set(id,fn),emit:(id,p)=>socketHandlers.get(id)?.(p)}};
globalThis.ui={actors:{},notifications:{info:s=>notify.push(s),warn:s=>notify.push(s),error:s=>notify.push('ERROR '+s)}};
globalThis.fromUuid=async()=>null;
const ns='ashen-gate-factions';
const fdoc=(key,relations)=>{const f=makeFaction({id:`FACTION-QA-${key}`,trackId:`RENOWN-QA-${key}`,name:`[TEST] ${key}`});if(relations)f.relations=relations;
  return makeDoc({name:f.name,ownership:{default:0},flags:{[ns]:{faction:sourceDefinition(f)}}});};
const rel=(key,resonance)=>({faction_id:`FACTION-QA-${key}`,resonance});
const CONCORD=fdoc('CONCORD',[rel('BRIGHTWORK',0),rel('WARDENS',1),rel('DEEPFOLK',0),rel('NEUTRAL',0.5)]);
fdoc('BRIGHTWORK');fdoc('WARDENS');fdoc('DEEPFOLK');fdoc('NEUTRAL');
const BRIGHT_DEF=journal.find(d=>d.getFlag(ns,'faction')?.id==='FACTION-QA-BRIGHTWORK');
await import('../scripts/module.mjs');hooks.get('init')();hooks.get('ready')();
await new Promise(r=>setTimeout(r,30));
const view=uid=>journal.find(d=>d.getFlag(ns,'playerView')?.user_id===uid).getFlag(ns,'playerView');
const dashboard=mod.api.open(),actions=dashboard.constructor.DEFAULT_OPTIONS.actions;
await dashboard._prepareContext();
const choose=async(factionId,actorId)=>{dashboard.focus({factionId,actorId});await dashboard._prepareContext();};
const reveal=async(factionId,actorId)=>{await choose(factionId,actorId);await actions.discovery.call(dashboard,null,{dataset:{mode:'actor'}});};
const award=(scope,delta,reason)=>({dataset:{scope},closest:()=>({querySelector:sel=>sel.includes('renown-delta')?{value:String(delta)}:{value:reason}})});
const pers=(key,actor)=>journal.find(d=>d.getFlag(ns,'individual')?.faction_id===`FACTION-QA-${key}`&&d.getFlag(ns,'individual')?.actor_id===actor)?.getFlag(ns,'individual');
const score=(key,actor)=>pers(key,actor)?.standing?.score??0;
const group=key=>journal.find(d=>d.getFlag(ns,'groupClaims')?.faction_id===`FACTION-QA-${key}`).getFlag(ns,'groupClaims').standing.score;
const give=async(key,actorId,scope,delta,reason='[TEST] deed')=>{await choose(`FACTION-QA-${key}`,actorId);await actions.award.call(dashboard,null,award(scope,delta,reason));};
// A1 knows Concord, Brightwork, Wardens, Neutral. Deepfolk is not discovered by anyone.
for(const k of ['CONCORD','BRIGHTWORK','WARDENS','NEUTRAL'])await reveal(`FACTION-QA-${k}`,'A1');
// A2 knows only Brightwork.
await reveal('FACTION-QA-BRIGHTWORK','A2');
// The rival starts with standing and a claimed reward (claims must survive a knock-on down to 0).
globalThis.confirm=()=>true;
await give('BRIGHTWORK','A1','individual',8);test(score('BRIGHTWORK','A1')===8,'plain award, Brightwork has no relations: no knock-ons');
const bd=journal.find(d=>d.getFlag(ns,'individual')?.faction_id==='FACTION-QA-BRIGHTWORK'&&d.getFlag(ns,'individual')?.actor_id==='A1');
await bd.setFlag(ns,'individual',{...bd.getFlag(ns,'individual'),claims:{'rw-QA':{status:'claimed',reward_id:'rw-QA'}}});
test(mod.api.getFactionKnockOns('FACTION-QA-CONCORD',10).map(k=>`${k.faction_id}:${k.delta}`).join()==='FACTION-QA-BRIGHTWORK:-5,FACTION-QA-WARDENS:5,FACTION-QA-DEEPFOLK:-5','API preview lists the knock-ons (GM sees undiscovered too)');
// GM unticks everything: the source applies, nothing else moves.
globalThis.confirm=()=>false;
await give('CONCORD','A1','individual',4);
test(score('CONCORD','A1')===4&&score('BRIGHTWORK','A1')===8&&score('WARDENS','A1')===0,'all rows unticked: only the source changes');
// Confirmed: rival -5, ally +5 (damping 0.5), undiscovered Deepfolk and neutral Neutral untouched, no record created for Deepfolk.
globalThis.confirm=()=>true;
await give('CONCORD','A1','individual',10,'[TEST] Escorted a caravan');
test(score('CONCORD','A1')===14,'source +10');
test(score('BRIGHTWORK','A1')===3,'rival loses 5 (gain 10 x -1 x 0.5)');
test(score('WARDENS','A1')===5,'ally gains 5');
test(!pers('DEEPFOLK','A1')&&score('NEUTRAL','A1')===0,'undiscovered faction gets no standing and no record; neutral relation does nothing');
const ev=pers('BRIGHTWORK','A1').standing.events.at(-1),src=pers('CONCORD','A1').standing.events.at(-1);
test(ev.source_faction==='FACTION-QA-CONCORD'&&ev.caused_by===src.id&&ev.delta===-5&&ev.reason==='Dissonance with [TEST] CONCORD: [TEST] Escorted a caravan','history line names its cause and links back');
test(pers('WARDENS','A1').standing.events.at(-1).reason.startsWith('Resonance with [TEST] CONCORD'),'ally line says Resonance');
test(group('CONCORD')===0&&group('BRIGHTWORK')===0&&group('WARDENS')===0,'group standing untouched by a personal award');
// Group scope: no knock-ons at all, no dialog.
let asked=0;globalThis.confirm=()=>{asked++;return true;};
await give('CONCORD','A1','group',6);
test(group('CONCORD')===6&&group('BRIGHTWORK')===0&&group('WARDENS')===0&&score('BRIGHTWORK','A1')===3&&asked===0,'group Renown never spreads and never asks');
// Removal does not spread (only gains do, as with deities).
globalThis.confirm=()=>true;
await give('CONCORD','A1','individual',-3);
test(score('CONCORD','A1')===11&&score('BRIGHTWORK','A1')===3&&score('WARDENS','A1')===5,'removing personal Renown spreads nowhere');
// Floor at zero and claims kept: +40 makes the rival lose 20 but it only had 3.
await give('CONCORD','A1','individual',40);
test(score('BRIGHTWORK','A1')===0,'floor: the rival never goes below 0');
test(pers('BRIGHTWORK','A1').standing.events.at(-1).delta===-3,'the recorded change is the real one (-3)');
test(pers('BRIGHTWORK','A1').claims['rw-QA']?.status==='claimed','a claimed reward stays claimed');
await give('CONCORD','A1','individual',10);
test(pers('BRIGHTWORK','A1').standing.events.filter(e=>e.source_faction).length===2,'a knock-on onto a rival already at 0 writes nothing (floor)');
test(score('WARDENS','A1')===5+20+5,'ally kept gaining');
// Knock-ons never chain: give Wardens a relation to Brightwork afterwards and gain with Concord again.
const w=journal.find(d=>d.getFlag(ns,'faction')?.id==='FACTION-QA-WARDENS');await w.setFlag(ns,'faction',{...w.getFlag(ns,'faction'),relations:[rel('BRIGHTWORK',1)]});
const bBefore=score('BRIGHTWORK','A1');await give('CONCORD','A1','individual',10);
test(score('BRIGHTWORK','A1')===bBefore,'no chaining: a knock-on on Wardens does not spread to Brightwork');
await w.setFlag(ns,'faction',{...w.getFlag(ns,'faction'),relations:undefined});delete w.flags[ns].faction.relations;
// Damping is its own world setting.
test(settings.factionDamping===0.5&&settings.pantheonDamping===0.5,'factionDamping registered with the deity default');
settings.factionDamping=0.25;
const wardBefore=score('WARDENS','A1');await give('CONCORD','A1','individual',10);
test(score('WARDENS','A1')===wardBefore+2,'damping 0.25: ally gets floor(10 x 1 x 0.25) = 2');
settings.factionDamping=0.5;settings.pantheonDamping=0.9;
const wb=score('WARDENS','A1');await give('CONCORD','A1','individual',10);
test(score('WARDENS','A1')===wb+5,'the pantheon setting does not affect factions');settings.pantheonDamping=0.5;
// Undo: the source and its knock-ons, once, nothing deleted.
await give('BRIGHTWORK','A1','individual',9);
const concordNow=score('CONCORD','A1'),wardNow=score('WARDENS','A1'),brightNow=score('BRIGHTWORK','A1');
await give('CONCORD','A1','individual',10,'[TEST] Undo me');
test(score('BRIGHTWORK','A1')===brightNow-5&&score('WARDENS','A1')===wardNow+5,'(setup) knock-ons applied');
const srcId=pers('CONCORD','A1').standing.events.at(-1).id,lenC=pers('CONCORD','A1').standing.events.length;
await choose('FACTION-QA-CONCORD','A1');
await actions.undoRenown.call(dashboard,null,{dataset:{event:srcId}});
test(score('CONCORD','A1')===concordNow&&score('BRIGHTWORK','A1')===brightNow&&score('WARDENS','A1')===wardNow,'undoing the source undoes its knock-ons');
const bu=pers('BRIGHTWORK','A1').standing.events.at(-1);
test(bu.reverses&&bu.source_faction==='FACTION-QA-CONCORD'&&bu.delta===5&&bu.reason.startsWith('Undo: '),'undo entry is reverses-compatible');
test(pers('CONCORD','A1').standing.events.length===lenC+1,'undo is a new history entry; nothing deleted');
notify.length=0;await actions.undoRenown.call(dashboard,null,{dataset:{event:srcId}});
test(score('CONCORD','A1')===concordNow&&notify.some(n=>n.includes('already')),'an entry can be undone once');
const ctx=await dashboard._prepareContext();
test(ctx.detail.personalEvents.find(e=>e.id===srcId)?.undone===true&&ctx.detail.personalEvents.some(e=>e.canUndo),'GM sees Undone marks and Undo on live entries');
// Player redaction. A2 knows only Brightwork and never met Concord: a Concord award reaches Brightwork without naming Concord.
await give('BRIGHTWORK','A2','individual',8);
await give('CONCORD','A2','individual',10,'[TEST] Secret deed');
test(score('BRIGHTWORK','A2')===3&&!pers('WARDENS','A2'),'knock-on reaches the one faction A2 knows; unknown Wardens gets nothing');
const v2=view('p2').payload,json2=JSON.stringify(v2);
test(v2.factions.map(f=>f.id).join()==='FACTION-QA-BRIGHTWORK','p2 sees only the faction A2 knows');
test(!json2.includes('CONCORD')&&!json2.includes('Secret deed')&&!json2.includes('source_faction'),'p2 view never names the unseen source faction or its reason text');
test(v2.factions[0].personal.A2.history.at(-1).reason==='Renown shifted through a related faction','p2 sees a neutral history line');
// p1 relations: only factions A1 knows, by label, never the number or unknown names.
const v1=view('p1').payload,c1=v1.factions.find(f=>f.id==='FACTION-QA-CONCORD');
test(c1.relations.map(r=>`${r.name}:${r.label}`).sort().join()==='[TEST] BRIGHTWORK:Dissonance,[TEST] NEUTRAL:Neutral,[TEST] WARDENS:Resonance','p1 sees relations to known factions only; undiscovered Deepfolk is hidden');
test(!JSON.stringify(v1).includes('DEEPFOLK')&&!JSON.stringify(c1.relations).includes('resonance'),'unknown faction and raw resonance never reach the player');
test(v1.factions.find(f=>f.id==='FACTION-QA-BRIGHTWORK').personal.A1.history.some(h=>h.source_faction==='FACTION-QA-CONCORD'),'a known source keeps its link for the owner');
// Permissions are enforced in the data layer.
game.user=p1;notify.length=0;
await actions.award.call(dashboard,null,award('individual',5,'[TEST] forged'));
test(score('CONCORD','A1')===concordNow,'a player award changes nothing');
test(notify.some(n=>n.includes('GM authorization')),'a player cannot award');
for(const name of ['undoRenown','addFactionRelation','removeFactionRelation']){notify.length=0;await actions[name].call(dashboard,null,{dataset:{event:srcId},closest:()=>null});test(notify.some(n=>n.includes('GM authorization')),`${name} is GM only`);}
test((()=>{try{mod.api.getFactionKnockOns('FACTION-QA-CONCORD',10);return false;}catch(e){return /GM authorization/.test(e.message);}})(),'API knock-on read is GM only');
test(mod.api.getFactions().find(f=>f.id==='FACTION-QA-CONCORD').relations.every(r=>!('resonance' in r)),'player getFactions is the projected view (no raw resonance)');
game.user=gm;
// Editor: relations are a draft. The add/remove actions only touch the form; Save Changes writes them.
const src0=JSON.stringify(CONCORD.getFlag(ns,'faction').relations);
await choose('FACTION-QA-CONCORD','A1');
await dashboard._prepareContext();
test(JSON.stringify(CONCORD.getFlag(ns,'faction').relations)===src0,'opening the editor writes nothing');
// Save Changes reads the form rows (the draft). Fake editor root: milestone rows from the saved ladder, relation rows as typed.
const fakeRoot=(defn,rows)=>{const row=m=>({querySelector:sel=>({'[data-field=name]':{value:m.name},'[data-field=threshold]':{value:m.threshold},'[data-field=benefit]':{value:m.benefit},'[data-field=selection]':{value:m.selection_mode}}[sel]??null)});
  const names={'faction-name':defn.name,'faction-leader':'','faction-role':'','faction-folder':'','faction-tags':''};
  return{querySelector:sel=>{const k=sel.match(/name="([\w-]+)"/)?.[1];return k in names?{value:names[k]}:null;},
    querySelectorAll:sel=>sel.includes('data-relation-faction')?rows.map(([id,v])=>({dataset:{relationFaction:id},querySelector:()=>({value:String(v)})})):sel.includes('"group"')?defn.renown_track.milestones.map(row):sel.includes('"individual"')?defn.individual_track.milestones.map(row):[]};};
const saved=key=>journal.find(d=>d.getFlag(ns,'faction')?.id===`FACTION-QA-${key}`).getFlag(ns,'faction');
await choose('FACTION-QA-NEUTRAL','A1');dashboard.element=fakeRoot(saved('NEUTRAL'),[]);await actions.save.call(dashboard);
test(!('relations' in saved('NEUTRAL')),'saving a faction that never had relations does not add the field');
await choose('FACTION-QA-CONCORD','A1');dashboard.element=fakeRoot(saved('CONCORD'),[['FACTION-QA-BRIGHTWORK',0.2],['FACTION-QA-WARDENS',0.9]]);await actions.save.call(dashboard);
test(JSON.stringify(saved('CONCORD').relations)===JSON.stringify([rel('BRIGHTWORK',0.2),rel('WARDENS',0.9)]),'Save Changes writes the edited relations (removed rows are gone)');
notify.length=0;dashboard.element=fakeRoot(saved('CONCORD'),[['FACTION-QA-BRIGHTWORK',7]]);await actions.save.call(dashboard);
test(notify.some(n=>n.startsWith('ERROR'))&&saved('CONCORD').relations.length===2,'an invalid resonance blocks the save and keeps the old relations');
notify.length=0;dashboard.element=fakeRoot(saved('CONCORD'),[['FACTION-QA-CONCORD',0.2]]);await actions.save.call(dashboard);
test(notify.some(n=>n.startsWith('ERROR'))&&saved('CONCORD').relations.length===2,'a relation to itself is refused');
dashboard.element=fakeRoot(saved('CONCORD'),[]);await actions.save.call(dashboard);
test(Array.isArray(saved('CONCORD').relations)&&saved('CONCORD').relations.length===0,'removing every row saves an empty list');
const code=(await import('node:fs')).readFileSync(new URL('../scripts/module.mjs',import.meta.url),'utf8');
const addBody=code.slice(code.indexOf('static async addFactionRelation'),code.indexOf('static async removeFactionRelation')),remBody=code.slice(code.indexOf('static async removeFactionRelation'),code.indexOf('static async create()'));
test(!/saveChange|setFlag|\.update\(/.test(addBody+remBody)&&/markDirty/.test(addBody+remBody),'add/remove relation never save; they mark the form dirty');
import('node:test').then(({default:t})=>t('faction relations runtime checks',()=>assert.ok(checks>=40)));
