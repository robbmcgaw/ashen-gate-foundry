/** Locked ranks as flavor-only cards (0.25.0): payload no-leak, flavor and fallback, per-character gods, Known vs Recruited, setting modes, claims, schema. In-memory Foundry V14-shaped harness. NOT a browser test. Synthetic [TEST] data only. */
import assert from 'node:assert/strict';
import {makeFaction,sourceDefinition,makeGroupRecord,makePersonalRecord,adjustStanding,overlayCampaign,extractCampaignDiscovery,groupStateDefaults} from '../scripts/core.mjs';
import {makeDeity} from '../scripts/deity.mjs';
import {lockedMilestone,flavorOf,modeFromLegacyHide,GENERIC_RANK_FLAVOR,GENERIC_TIER_FLAVOR,LOCKED_MODES} from '../scripts/tier-preview.mjs';
import {planImport} from '../scripts/import.mjs';
import {readFileSync} from 'node:fs';
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
// ---- Seed: every rank carries distinctive strings, so a leak is found by text search ----
const FLAV=[null,'[TEST] Flavor One','[TEST] Flavor Two','[TEST] Flavor Three',null];   // rank 5 has no flavor: the neutral fallback shows
const decorate=f=>{const k=f.id.split('-').pop();f.individual_track.milestones.forEach((m,i)=>{m.name=`[TEST] ${k} Rank Name ${i}`;m.benefit=`[TEST] ${k} Benefit I${i}`;if(FLAV[i])m.flavor=FLAV[i];});
  f.renown_track.milestones.forEach((m,i)=>{m.name=`[TEST] ${k} Group Rank Name ${i}`;m.benefit=f.entity_type==='Deity'?'':`[TEST] ${k} Benefit G${i}`;if(FLAV[i])m.flavor=`[TEST] Group ${FLAV[i].slice(7)}`;});};
const reward=(f,id,idx,scope,extra={})=>f.rewards.push({id,key:id.toLowerCase(),audience:scope,milestone_id:(scope==='group'?f.renown_track:f.individual_track).milestones[idx].id,name:`[TEST] Reward ${id}`,teaser:`[TEST] Teaser ${id}`,description:`[TEST] Secret text ${id}`,kind:'custom',tags:[],behavior:'one_time',usage_limit:0,...extra});
const mkFaction=key=>{const f=makeFaction({id:`FACTION-QA-${key}`,trackId:`RENOWN-QA-${key}`,name:`[TEST] ${key}`,leader:'[TEST] Leader',public_role:'[TEST] Role'});decorate(f);
  for(let i=0;i<5;i++){reward(f,`RW-${key}-I${i}`,i,'individual');reward(f,`RW-${key}-G${i}`,i,'group');}return f;};
const seedFaction=(key,{discovery,membership,personal={},groupScore=0})=>{
  makeDoc({name:`[TEST] ${key}`,ownership:{default:0},flags:{[ns]:{faction:sourceDefinition(mkFaction(key))}}});
  const rec=makeGroupRecord({factionId:`FACTION-QA-${key}`});rec.discovery=discovery;rec.membership=membership;
  if(groupScore)rec.standing=adjustStanding(rec.standing,{delta:groupScore,reason:'[TEST] deed',eventId:`RENOWN-EVT-G${key}`,when:'2026-01-01T00:00:00.000Z'}).standing;
  makeDoc({name:`state ${key}`,ownership:{default:0},flags:{[ns]:{groupClaims:rec}}});
  for(const [actorId,pts] of Object.entries(personal)){const p=makePersonalRecord({factionId:`FACTION-QA-${key}`,actorId});if(pts)p.standing=adjustStanding(p.standing,{delta:pts,reason:'[TEST] deed',eventId:`RENOWN-EVT-P${key}${actorId.toUpperCase()}`,when:'2026-01-01T00:00:00.000Z'}).standing;makeDoc({name:`personal ${key}${actorId}`,ownership:{default:0},flags:{[ns]:{individual:p}}});}
};
seedFaction('KNOWN',{discovery:{party:false,actors:['A1']},membership:{party:false,actors:[]}});
seedFaction('RECRUITED',{discovery:{party:false,actors:['A1','A1b']},membership:{party:false,actors:['A1','A1b']},personal:{A1:3,A1b:0},groupScore:3});   // A1 has reached rank 2 (3 points); A1b rank 1; party 3
seedFaction('MIXED',{discovery:{party:false,actors:['A1','A1b']},membership:{party:false,actors:['A1']},personal:{A1:3},groupScore:3});
const sun=makeDeity({id:'DEITY-QA-SUN',trackId:'RENOWN-QA-SUN',name:'[TEST] Sun Deity'});decorate(sun);
for(let i=0;i<5;i++)reward(sun,`RW-SUN-I${i}`,i,'individual');
makeDoc({name:'[TEST] Sun Deity',ownership:{default:0},flags:{[ns]:{faction:sourceDefinition(sun)}}});
{const rec=makeGroupRecord({factionId:'DEITY-QA-SUN'});rec.discovery={party:true,actors:[],placeholder:false,sharing_enabled:true};makeDoc({name:'state sun',ownership:{default:0},flags:{[ns]:{groupClaims:rec}}});
 for(const id of ['A1','A1b','A2']){const p=makePersonalRecord({factionId:'DEITY-QA-SUN',actorId:id});p.standing=adjustStanding(p.standing,{delta:4,reason:'[TEST] offering',eventId:`RENOWN-EVT-S${id.toUpperCase()}`,when:'2026-01-01T00:00:00.000Z'}).standing;makeDoc({name:`personal sun ${id}`,ownership:{default:0},flags:{[ns]:{individual:p}}});}}
// Migration, default branch: a world that never touched the 0.24.0 switch ends on the new default.
await import('../scripts/module.mjs');hooks.get('init')();
test(settings.lockedRanks==='flavor'&&settings.lockedRanksMigrated===false&&settings.hideLaterTiers===true,'before ready: defaults (flavor, not yet migrated, old switch default ON)');
hooks.get('ready')();await new Promise(r=>setTimeout(r,80));
test(settings.lockedRanks==='flavor'&&settings.lockedRanksMigrated===true,'migration: an untouched world gets flavor-only and is marked migrated');
const settle=()=>new Promise(r=>setTimeout(r,60));
const view=uid=>journal.find(d=>d.getFlag(ns,'playerView')?.user_id===uid).getFlag(ns,'playerView');
const fx=(uid,key)=>view(uid).payload.factions.find(f=>f.id===`FACTION-QA-${key}`);
const dx=uid=>view(uid).payload.deities.find(d=>d.id==='DEITY-QA-SUN');
/** Strings that belong to ranks with index >= from (names, benefits, every reward name / teaser / description / id). */
const secrets=(key,from)=>{const out=[];for(let i=from;i<5;i++){out.push(`${key} Rank Name ${i}`,`${key} Group Rank Name ${i}`,`${key} Benefit I${i}`,`${key} Benefit G${i}`);for(const k of [key]){for(const s of ['I','G'])out.push(`Reward RW-${k}-${s}${i}`,`Teaser RW-${k}-${s}${i}`,`Secret text RW-${k}-${s}${i}`,`RW-${k}-${s}${i}`);}}return out;};
const leaks=(obj,key,from)=>{const raw=JSON.stringify(obj);return secrets(key,from).filter(s=>raw.includes(s));};
const LOCKED_KEYS=['benefit','flavor','id','lockedCard','locked','name','order','rewards','threshold','unlocked'].sort();
const dashboard=mod.api.open();await dashboard._prepareContext();
const template=readFileSync(new URL('../templates/dashboard.hbs',import.meta.url),'utf8');

// ---- A. Unit: the locked card shape, flavor and fallback ----
{const m={id:'M',key:'milestone_3',name:'[TEST] Secret',threshold:6,benefit:'[TEST] Secret benefit',selection_mode:'choose_one',flavor:'  [TEST] A distant light.  '};
 const c=lockedMilestone(m,3);
 test(JSON.stringify(Object.keys(c).sort())===JSON.stringify(LOCKED_KEYS),'locked card has exactly the closed key set');
 test(c.name==='Rank 3'&&c.threshold===6&&c.order===3&&c.flavor==='[TEST] A distant light.'&&c.benefit===''&&c.rewards.length===0&&c.unlocked===false,'locked card: generic label, threshold, trimmed flavor, no benefit or rewards');
 test(!JSON.stringify(c).includes('Secret'),'locked card carries no name or benefit text');
 test(lockedMilestone({...m,flavor:undefined},3).flavor===GENERIC_RANK_FLAVOR&&lockedMilestone({...m,flavor:'   '},3).flavor===GENERIC_RANK_FLAVOR,'no flavor (or blank): the neutral rank line');
 test(lockedMilestone({...m,flavor:undefined},3,{deity:true}).flavor===GENERIC_TIER_FLAVOR&&lockedMilestone(m,2,{deity:true}).name==='Tier 2','a god: "Tier n" and the neutral tier line');
 test(GENERIC_RANK_FLAVOR==='A further rank, earned through renown.'&&GENERIC_TIER_FLAVOR==='A further tier, opened by a sworn Vow.','neutral lines are the approved wording');
 test(flavorOf({flavor:42})===GENERIC_RANK_FLAVOR,'a non-string flavor falls back');
 test(modeFromLegacyHide(false)==='all'&&modeFromLegacyHide(true)==='flavor'&&modeFromLegacyHide(undefined)==='flavor'&&LOCKED_MODES.join()==='flavor,hide,all','legacy switch: OFF -> all, ON or unset -> flavor');
}

// ---- B. Faction, Known only (default mode): first rank in full, every later rank a flavor-only card ----
{const p=fx('p1','KNOWN');
 test(p.group===null&&Object.keys(p.personal).length===0&&p.member===false,'Known: still no standing');
 for(const [track,label] of [[p.individualTrack,'individual'],[p.groupTrack,'group']]){
  test(track.preview===true&&track.milestones.length===5,`Known ${label}: all five ranks are sent`);
  const [first,...rest]=track.milestones;
  test(first.unlocksWhenRecruited===true&&first.unlocksText==='Unlocks when recruited'&&first.rewards.length===1&&first.rewards[0].canClaim===false&&first.rewards[0].locked===true&&!first.lockedCard,`Known ${label}: the first rank is the 0.24.0 preview (full name, teaser, not claimable)`);
  test(rest.every(m=>m.lockedCard===true&&JSON.stringify(Object.keys(m).sort())===JSON.stringify(LOCKED_KEYS)&&m.rewards.length===0&&m.benefit===''),`Known ${label}: ranks 2 to 5 are closed locked cards with no rewards`);
  test(rest.map(m=>m.order).join()==='2,3,4,5'&&rest.map(m=>m.threshold).join()==='3,6,10,15'&&rest[0].name==='Rank 2','Known: rank number and threshold are shown');
 }
 test(p.individualTrack.milestones[1].flavor==='[TEST] Flavor One'&&p.individualTrack.milestones[2].flavor==='[TEST] Flavor Two'&&p.individualTrack.milestones[4].flavor===GENERIC_RANK_FLAVOR,'Known: flavor text shows, the neutral line fills a rank without one');
 test(p.groupTrack.milestones[1].flavor==='[TEST] Group Flavor One','Known: the group track carries its own flavor');
 test(leaks(p,'KNOWN',1).length===0,`Known: NO name, benefit, reward, teaser or description of ranks 2 to 5 in the stringified payload (${leaks(p,'KNOWN',1)})`);
 test(leaks(view('p1').payload,'KNOWN',1).filter(x=>x.includes('RW-KNOWN-')).length===0,'Known: no later reward of this faction anywhere in the whole player view');
 test(!fx('p2','KNOWN'),'another player sees nothing');
}
// ---- C. Faction, recruited: unlocked ranks in full, the rest locked, per character ----
{const p=fx('p1','RECRUITED');
 const a1=p.personal.A1.milestones,a1b=p.personal.A1b.milestones;
 test(a1.length===5&&a1.slice(0,2).every(m=>m.unlocked&&!m.lockedCard)&&a1[0].name==='[TEST] RECRUITED Rank Name 0'&&a1[1].name==='[TEST] RECRUITED Rank Name 1'&&a1[1].benefit==='[TEST] RECRUITED Benefit I1','Recruited A1 (3 points): ranks 1 and 2 are in full');
 test(a1.slice(2).every(m=>m.lockedCard===true&&m.rewards.length===0)&&a1[2].name==='Rank 3'&&a1[2].flavor==='[TEST] Flavor Two','Recruited A1: ranks 3 to 5 are flavor-only locked cards');
 test(a1b[0].unlocked&&a1b.slice(1).every(m=>m.lockedCard===true),'Recruited A1b (0 points): only rank 1 is in full');
 test(a1[1].rewards[0].description.includes('Secret text'),'Recruited A1: an unlocked reward shows its full text');
 test(p.groupTrack.milestones.slice(0,2).every(m=>!m.lockedCard)&&p.groupTrack.milestones.slice(2).every(m=>m.lockedCard===true)&&p.groupTrack.milestones[2].name==='Rank 3','Group track (3 points): ranks 1-2 in full, 3-5 locked');
 test(leaks(p.personal.A1,'RECRUITED',2).length===0&&leaks(p.groupTrack,'RECRUITED',2).length===0,`Recruited: ranks 3-5 absent from A1's data and the group track (${leaks(p,'RECRUITED',2)})`);
 test(leaks(p.personal.A1b,'RECRUITED',1).length===0,'Recruited: ranks 2-5 absent from A1b\'s personal data');
 const sh=p.individualTrack.milestones;
 test(p.individualTrack.preview!==true&&sh.length===5&&sh[1].name==='[TEST] RECRUITED Rank Name 1'&&sh.slice(2).every(m=>m.lockedCard===true),'Shared individual list: names only what one of the player\'s characters has reached');
 test(leaks(sh,'RECRUITED',2).length===0,'Shared individual list: no locked rank name');
 test(p.individualPreview===undefined,'Everyone recruited: no separate preview');
}
// ---- D. Two characters, one only Known ----
{const p=fx('p1','MIXED');
 test(p.personal.A1&&!p.personal.A1b&&p.individualPreview.preview===true&&p.individualPreview.milestones.length===5,'Mixed: A1b gets its own five-rank preview');
 test(leaks(p.individualPreview,'MIXED',1).length===0&&p.individualPreview.milestones[0].unlocksWhenRecruited===true,'Mixed: the preview is the first rank plus flavor-only cards, nothing of ranks 2-5');
 test(leaks(p.individualTrack,'MIXED',2).length===0&&p.individualTrack.milestones[1].name==='[TEST] MIXED Rank Name 1','Mixed: the shared list still names what A1 reached (Hub journey keeps working)');
 game.user=p1;
 dashboard.focus({factionId:'FACTION-QA-MIXED',actorId:'A1b',tab:'player'});let ctx=await dashboard._prepareContext();
 test(ctx.detail.individualMs.length===0&&ctx.detail.individualPreview.length===5&&ctx.detail.individualPreview.slice(1).every(m=>m.lockedCard),'Mixed window, A1b: preview of five, four of them locked cards');
 dashboard.focus({factionId:'FACTION-QA-MIXED',actorId:'A1',tab:'player'});ctx=await dashboard._prepareContext();
 test(ctx.detail.individualMs.length===5&&ctx.detail.individualPreview.length===0&&ctx.detail.individualMs.filter(m=>m.lockedCard).length===3,'Mixed window, A1: own ladder, ranks 3-5 locked');
 dashboard.focus({factionId:'FACTION-QA-KNOWN',actorId:'A1',tab:'group'});ctx=await dashboard._prepareContext();
 test(ctx.detail.groupMs.length===0&&ctx.detail.groupPreview.length===5&&ctx.detail.groupPreview[0].rewards[0].canClaim===false&&ctx.detail.groupPreview.slice(1).every(m=>m.lockedCard&&!m.rewards.length),'Known window: five cards, none claimable');
 game.user=gm;
}
// ---- E. Deities, per character ----
{const s=dx('p1'),a1=s.personal.A1,a1b=s.personal.A1b;
 test(a1.limited===false&&a1.milestones.length===5&&a1.milestones.slice(0,2).every(m=>!m.lockedCard&&m.unlocked)&&a1.milestones.slice(2).every(m=>m.lockedCard===true),'Sworn A1 (4 piety): tiers 1-2 in full, 3-5 locked');
 test(a1.next.name==='Tier 3'&&a1.next.threshold===6&&a1.rank==='[TEST] SUN Rank Name 1','Sworn A1: next is the generic "Tier 3" at its threshold, the current rank keeps its name');
 test(leaks(a1,'SUN',2).length===0,`Sworn A1: tiers 3-5 absent (${leaks(a1,'SUN',2)})`);
 test(a1b.limited===true&&a1b.milestones.length===5&&!a1b.milestones[0].lockedCard&&a1b.milestones.slice(1).every(m=>m.lockedCard===true),'Unsworn A1b (same piety): tier 1 in full, tiers 2-5 locked');
 test(a1b.rank==='[TEST] SUN Rank Name 0'&&a1b.next===null&&a1b.remaining===0&&a1b.percent===0,'Unsworn A1b: rank, next and remaining are clamped to tier 1');
 test(leaks(a1b,'SUN',1).length===0,`Unsworn A1b: tiers 2-5 absent although the piety passed tier 2 (${leaks(a1b,'SUN',1)})`);
 test(a1b.milestones[1].name==='Tier 2'&&a1b.milestones[1].flavor==='[TEST] Flavor One'&&a1b.milestones[4].flavor===GENERIC_TIER_FLAVOR,'Unsworn A1b: flavor shows; the neutral tier line fills a tier without one');
 test(s.ladder.length===5&&s.ladder[1].name==='[TEST] SUN Rank Name 1'&&s.ladder.slice(2).every(m=>m.lockedCard)&&leaks(s.ladder,'SUN',2).length===0,'Shared ladder names only the tiers a sworn character reached');
 const t=dx('p2');
 test(t.personal.A2.limited===true&&t.personal.A2.milestones.slice(1).every(m=>m.lockedCard)&&t.ladder.slice(1).every(m=>m.lockedCard),'Another player, unsworn: tier 1 only in full');
 test(leaks(t,'SUN',1).length===0,'Another player, unsworn: no tier 2-5 text anywhere in the god\'s payload');
 test(leaks(view('p2').payload.deities,'SUN',1).length===0,'... nor in the player\'s deities list');
 game.user=p1;
 dashboard.focus({deityId:'DEITY-QA-SUN',actorId:'A1b',tab:'pantheon'});let ctx=await dashboard._prepareContext();
 const open=ctx.pantheon.open;
 test(open.limited===true&&open.milestones.length===5&&open.milestones[0].unlocked&&open.milestones[0].vowToggle?.show===true&&open.milestones.slice(1).every(m=>m.lockedCard),'Pantheon window, A1b: Vow toggle on tier 1, four locked cards');
 test(open.view.next===null&&open.view.steps.filter(x=>x.done).length===1&&open.milestones.filter(m=>m.isActive).length===1&&open.milestones[0].isActive,'Pantheon window, A1b: the meter and the current marker stay on tier 1');
 dashboard.focus({deityId:'DEITY-QA-SUN',actorId:'A1',tab:'pantheon'});ctx=await dashboard._prepareContext();
 test(ctx.pantheon.open.milestones.filter(m=>m.lockedCard).length===3&&ctx.pantheon.open.view.next.name==='Tier 3','Pantheon window, A1 (sworn): three locked cards and the meter points at "Tier 3"');
 game.user=gm;
}
// swearing and breaking a Vow re-projects
{actor1b.flags[ns].vow={deity_id:'DEITY-QA-SUN',sworn_at:'2026-10-02T00:00:00.000Z'};hooks.get('updateActor')(actor1b,{flags:{[ns]:{vow:actor1b.flags[ns].vow}}});await settle();
 test(dx('p1').personal.A1b.limited===false&&dx('p1').personal.A1b.milestones.filter(m=>!m.lockedCard).length===2,'A1b swears a Vow: tiers 1-2 open (the piety reached them)');
 delete actor1b.flags[ns].vow;hooks.get('updateActor')(actor1b,{flags:{[ns]:{'-=vow':null}}});await settle();
 test(dx('p1').personal.A1b.limited===true&&leaks(dx('p1').personal.A1b,'SUN',1).length===0,'The Vow is broken: tiers 2-5 are locked again');
}
// ---- F. API and embed ----
{game.user=p1;
 const f=mod.api.getFactions(),d=mod.api.getDeities(),pa=mod.api.getPantheon(actor1b),pb=mod.api.getPantheon(actor1);
 test(leaks(f.find(x=>x.id==='FACTION-QA-KNOWN'),'KNOWN',1).length===0,'API getFactions: Known-only has no rank 2-5 text');
 test(leaks(f.find(x=>x.id==='FACTION-QA-RECRUITED').groupTrack,'RECRUITED',2).length===0,'API getFactions: recruited group track has no rank 3-5 text');
 test(leaks(d.map(x=>x.personal.A1b),'SUN',1).length===0&&d[0].personal.A1b.milestones.length===5,'API getDeities: unsworn character has locked cards only after tier 1');
 test(pa[0].limited===true&&pa[0].rank==='[TEST] SUN Rank Name 0'&&pa[0].next===null&&leaks(pa,'SUN',1).length===0,'API getPantheon: unsworn row is clamped');
 test(pb[0].limited===false&&pb[0].next.name==='Tier 3'&&pb[0].next.threshold===6&&leaks(pb,'SUN',2).length===0,'API getPantheon: sworn row points at the generic "Tier 3"');
 game.user=gm;
 const gmf=mod.api.getFactions().find(x=>x.id==='FACTION-QA-KNOWN');
 test(mod.api.getDeities().length===1&&gmf.individual_track.milestones[3].name==='[TEST] KNOWN Rank Name 3'&&gmf.individual_track.milestones[3].flavor===FLAV[3],'GM API is unchanged and carries the flavor');
 const el={classList:{add(){},remove(){}},addEventListener(){},innerHTML:'',isConnected:true};
 game.user=p1;const emb=mod.api.embed.mount(el,{actorId:'A1b'});
 test(leaks(el.innerHTML,'SUN',1).length===0&&leaks(el.innerHTML,'KNOWN',1).length===0&&leaks(el.innerHTML,'RECRUITED',2).length===0&&el.innerHTML.includes('Next: Rank 2 at 3'),'Embed, A1b: no locked rank name, next rank is generic');
 test(el.innerHTML.includes('More tiers unlock when you swear a vow.'),'Embed: an unsworn god still says more tiers unlock with a vow');
 emb.unmount();
 const el2={classList:{add(){},remove(){}},addEventListener(){},innerHTML:'',isConnected:true};
 const emb2=mod.api.embed.mount(el2,{actorId:'A1'});
 test(leaks(el2.innerHTML,'SUN',2).length===0&&el2.innerHTML.includes('Next: Tier 3 at 6'),'Embed, sworn A1: next tier is "Tier 3 at 6", no real name');
 emb2.unmount();game.user=gm;
}
// ---- G. GM view unchanged ----
{dashboard.focus({deityId:'DEITY-QA-SUN',actorId:'A1b',tab:'pantheon'});const ctx=await dashboard._prepareContext();
 test(ctx.pantheon.open.milestones.length===5&&ctx.pantheon.open.milestones.every(m=>!m.lockedCard)&&ctx.pantheon.open.milestones[3].name==='[TEST] SUN Rank Name 3'&&!ctx.pantheon.open.limited,'GM: the whole god ladder, real names');
 dashboard.focus({factionId:'FACTION-QA-KNOWN',actorId:'A1',tab:'player'});const c2=await dashboard._prepareContext();
 test(c2.detail.individualMs.length===5&&c2.detail.individualMs.every(m=>!m.lockedCard)&&c2.detail.individualPreview.length===0,'GM: full faction ladder, no locked cards');
}
// ---- H. Template: a locked card is visibly locked (icon plus text), has no claim control ----
{const block=template.slice(template.indexOf('{{#*inline "agfMilestones"}}'),template.indexOf('{{#*inline "agfAward"}}')),locked=block.slice(block.indexOf('{{#if lockedCard}}'),block.indexOf('{{else}}<article'));
 test(/fa-lock/.test(locked)&&/Locked/.test(locked)&&/\{\{flavor\}\}/.test(locked),'Template: locked card has a lock icon, the word Locked and the flavor');
 test(!/data-action/.test(locked)&&!/agfReward/.test(locked)&&!/\{\{benefit/.test(locked),'Template: locked card has no buttons, rewards or benefit');
 test(/name="locked-ranks"/.test(template)&&!/hide-later-tiers/.test(template),'Template: GM Setup has the one locked-ranks select');
}
// ---- I. Claims ----
const cap=uid=>view(uid).capability;
const request=(key,actorId,rewardId,audience='individual',deity=false)=>{notify.length=0;game.socket.emit(`module.${ns}`,{type:'request',factionId:deity?key:`FACTION-QA-${key}`,audience,actorId,rewardId,userId:'p1',capability:cap('p1')});};
const claims=(id,actorId)=>journal.find(d=>d.getFlag(ns,'individual')?.faction_id===id&&d.getFlag(ns,'individual')?.actor_id===actorId)?.getFlag(ns,'individual')?.claims??{};
{request('RECRUITED','A1','RW-RECRUITED-I2');await settle();
 test(!claims('FACTION-QA-RECRUITED','A1')['RW-RECRUITED-I2']&&notify.some(n=>n.includes('not available')),'Claim: a reward on a locked rank is refused (score not reached)');
 request('RECRUITED','A1','RW-RECRUITED-I1');await settle();
 test(claims('FACTION-QA-RECRUITED','A1')['RW-RECRUITED-I1']?.status==='pending','Claim: a reward on an unlocked rank still works');
 request('RECRUITED','A1','RW-RECRUITED-G2','group');await settle();
 test(!notify.every(n=>!n.includes('not available')),'Claim: a locked group reward is refused');
 request('KNOWN','A1','RW-KNOWN-I0');await settle();
 test(!claims('FACTION-QA-KNOWN','A1')['RW-KNOWN-I0']&&notify.some(n=>n.includes('not recruited')),'Claim: nothing on a Known-only faction');
 request('DEITY-QA-SUN','A1b','RW-SUN-I1','individual',true);await settle();
 test(!claims('DEITY-QA-SUN','A1b')['RW-SUN-I1']&&notify.some(n=>n.includes('Swear a Vow')),'Claim: a later tier of a god is refused without a Vow');
 request('DEITY-QA-SUN','A1','RW-SUN-I2','individual',true);await settle();
 test(!claims('DEITY-QA-SUN','A1')['RW-SUN-I2']&&notify.some(n=>n.includes('not available')),'Claim: a sworn character still cannot claim a tier the piety has not reached');
 request('DEITY-QA-SUN','A1','RW-SUN-I1','individual',true);await settle();
 test(claims('DEITY-QA-SUN','A1')['RW-SUN-I1']?.status==='pending','Claim: a sworn character can claim a reached tier');
}
// ---- J. Setting modes ----
const setMode=async m=>{game.settings.set(ns,'lockedRanks',m);hooks.get('updateSetting')({key:`${ns}.lockedRanks`});await settle();};
{await setMode('hide');
 const k=fx('p1','KNOWN');test(k.individualTrack.milestones.length===1&&k.groupTrack.milestones.length===1&&!k.individualTrack.milestones.some(m=>m.lockedCard),'Hide: a Known-only faction gets the first rank alone (0.24.0)');
 test(leaks(k,'KNOWN',1).length===0,'Hide: nothing of ranks 2-5');
 const r=fx('p1','RECRUITED');test(r.personal.A1.milestones.length===5&&r.personal.A1.milestones.every(m=>!m.lockedCard)&&r.personal.A1.milestones[4].name==='[TEST] RECRUITED Rank Name 4','Hide: a recruited faction is as in 0.24.0 (locked ranks keep name and teaser)');
 const m=fx('p1','MIXED');test(m.individualTrack.preview===true&&m.individualTrack.milestones.length===1&&m.individualPreview===undefined,'Hide: a mixed faction gets the one-rank preview as the shared list (0.24.0)');
 const s=dx('p1');test(s.personal.A1b.milestones.length===1&&s.personal.A1b.limited===true&&s.ladder.length===1,'Hide: an unsworn god gives tier 1 only (0.24.0)');
 request('DEITY-QA-SUN','A1b','RW-SUN-I1','individual',true);await settle();
 test(notify.some(n=>n.includes('Swear a Vow')),'Hide: the Vow rule on claims applies');
 await setMode('all');
 const k2=fx('p1','KNOWN');test(k2.individualTrack.milestones.length===5&&k2.individualTrack.milestones.every(m=>!m.lockedCard)&&k2.individualTrack.milestones[3].name==='[TEST] KNOWN Rank Name 3'&&k2.group===null,'Show everything: a Known-only faction lists every rank as a teaser, still no standing');
 const s2=dx('p1');test(s2.personal.A1b.milestones.length===5&&s2.personal.A1b.milestones.every(m=>!m.lockedCard)&&s2.personal.A1b.limited===false&&s2.ladder.every(m=>!m.lockedCard),'Show everything: the whole god ladder, as before 0.24.0');
 test(JSON.stringify(s2.personal.A1b.milestones.flatMap(m=>m.rewards.map(r=>r.description))).includes('Secret text')===true&&!JSON.stringify(s2.personal.A1b.milestones[4].rewards).includes('Secret text'),'Show everything: locked rewards still show teasers only (never the full text)');
 request('DEITY-QA-SUN','A1b','RW-SUN-I1','individual',true);await settle();
 test(!notify.some(n=>n.includes('Swear a Vow')),'Show everything: the Vow rule on claims is not applied');
 await setMode('flavor');
 test(fx('p1','KNOWN').individualTrack.milestones[1].lockedCard===true&&dx('p1').personal.A1b.milestones[1].lockedCard===true,'Back to flavor-only: locked cards return');
 await setMode('nonsense');
 test(fx('p1','KNOWN').individualTrack.milestones[1].lockedCard===true,'An unknown stored value is treated as the default');
 await setMode('flavor');
}
// ---- K. GM Setup saves the select; migration of the old switch ----
{const values={'player-access-enabled':true,'group-name-enabled':false,'group-name':'','pantheon-damping':'0.5','faction-damping':'0.5','locked-ranks':'hide'};
 const form={querySelector:sel=>{const k=sel.match(/name="?([\w-]+)/)?.[1];return k in values?{value:String(values[k]),checked:values[k]===true}:null;}};
 dashboard.element={querySelector:sel=>sel==='[data-setup-form]'?form:null};
 await dashboard.constructor.DEFAULT_OPTIONS.actions.saveSetup.call(dashboard);
 test(settings.lockedRanks==='hide','GM Setup: Save Changes writes the chosen mode');
 values['locked-ranks']='bogus';notify.length=0;await dashboard.constructor.DEFAULT_OPTIONS.actions.saveSetup.call(dashboard);
 test(settings.lockedRanks==='hide'&&notify.some(n=>n.includes('Choose how players see locked ranks')),'GM Setup: an invalid mode is refused and nothing changes');
 values['locked-ranks']='flavor';await dashboard.constructor.DEFAULT_OPTIONS.actions.saveSetup.call(dashboard);
 test(settings.lockedRanks==='flavor','GM Setup: back to the default');
}
// ---- L. Schema: flavor validates, survives export and import, old records still work ----
{const f=makeFaction({id:'FACTION-FLAV',trackId:'RENOWN-FLAV',name:'[TEST] Flavor Guild'});
 f.renown_track.milestones[2].flavor='[TEST] A banner seen from far off.';f.individual_track.milestones[1].flavor='[TEST] A quiet word at the door.';
 const clean=sourceDefinition(f);
 test(clean.renown_track.milestones[2].flavor==='[TEST] A banner seen from far off.'&&clean.individual_track.milestones[1].flavor==='[TEST] A quiet word at the door.','sourceDefinition keeps flavor on group and individual milestones');
 test(!('flavor' in clean.renown_track.milestones[0]),'a milestone without flavor gets no flavor field (old records are not rewritten)');
 const file={schema_version:'ag-factions-source-export/0.4',definitions:[clean,sourceDefinition(sun)]};
 const plan=planImport(file);
 test(plan.errors.length===0&&plan.rows.length===2,`import: a file with flavor validates (${plan.errors})`);
 test(plan.rows[0].definition.renown_track.milestones[2].flavor==='[TEST] A banner seen from far off.'&&plan.rows[1].definition.individual_track.milestones[1].flavor==='[TEST] Flavor One','import: flavor survives the round trip (faction and deity)');
 const again=planImport({schema_version:'ag-factions-source-export/0.4',definitions:plan.rows.map(r=>sourceDefinition(r.definition))});
 test(again.errors.length===0&&JSON.stringify(again.rows[0].definition)===JSON.stringify(plan.rows[0].definition),'export then import again: identical definition');
 const old=sourceDefinition(makeFaction({id:'FACTION-OLD',trackId:'RENOWN-OLD',name:'[TEST] No Flavor'}));
 test(planImport({schema_version:'ag-factions-source-export/0.4',definitions:[old]}).errors.length===0,'a definition without flavor still validates');
 const long=structuredClone(clean);long.renown_track.milestones[0].flavor='x'.repeat(401);
 test(planImport({schema_version:'ag-factions-source-export/0.4',definitions:[long]}).errors.some(e=>e.includes('flavor')),'flavor over 400 characters is refused');
 const bad=structuredClone(clean);bad.individual_track.milestones[0].flavor=7;
 test(planImport({schema_version:'ag-factions-source-export/0.4',definitions:[bad]}).errors.some(e=>e.includes('flavor')),'a non-string flavor is refused');
 const typo=structuredClone(clean);typo.individual_track.milestones[0].flavour='x';
 test(planImport({schema_version:'ag-factions-source-export/0.4',definitions:[typo]}).errors.some(e=>e.includes('flavour')),'other unknown milestone fields are still refused');
 const edited=structuredClone(clean);edited.renown_track.milestones[2].flavor='[TEST] Different.';
 const up=planImport({schema_version:'ag-factions-source-export/0.4',definitions:[edited]},new Set([clean.id]));
 test(up.rows[0].action==='skip','import (add mode): an existing faction is still skipped whole');
}
console.log(`locked-ranks: ${checks} checks passed`);
