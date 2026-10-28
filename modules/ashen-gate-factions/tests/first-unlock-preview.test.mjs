/** First unlock only (0.24.0, now the 'Hide locked ranks' mode of 0.25.0): a Known-only faction and an unsworn deity send the player the first tier and nothing later. In-memory Foundry V14-shaped harness. NOT a browser test. Synthetic [TEST] data only. */
import assert from 'node:assert/strict';
import {makeFaction,sourceDefinition,makeGroupRecord,makePersonalRecord,adjustStanding,overlayCampaign,extractCampaignDiscovery,groupStateDefaults} from '../scripts/core.mjs';
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
// ---- Seed: distinctive later-tier strings, so a leak is found by text search ----
const LATER=['[TEST] Tier Two','[TEST] Tier Three','[TEST] Tier Four','[TEST] Tier Five'];
const TIER=['[TEST] Tier One',...LATER];
const LATER_REWARDS=['[TEST] Later Boon','[TEST] Later Teaser'];
const names=(f)=>{f.individual_track.milestones.forEach((m,i)=>{m.name=TIER[i];});f.renown_track.milestones.forEach((m,i)=>{m.name=i?`[TEST] Group ${LATER[i-1]}`:'[TEST] Group Tier One';});};
const reward=(f,id,idx,scope,extra={})=>f.rewards.push({id,key:id.toLowerCase(),audience:scope,milestone_id:(scope==='group'?f.renown_track:f.individual_track).milestones[idx].id,name:`[TEST] Reward ${id}`,teaser:`[TEST] Teaser ${id}`,description:`[TEST] Secret text ${id}`,kind:'custom',tags:[],behavior:'one_time',usage_limit:0,...extra});
const mkFaction=key=>{const f=makeFaction({id:`FACTION-QA-${key}`,trackId:`RENOWN-QA-${key}`,name:`[TEST] ${key}`,leader:'[TEST] Leader',public_role:'[TEST] Role'});names(f);
  reward(f,`RW-${key}-I1`,0,'individual');reward(f,`RW-${key}-I2`,1,'individual',{name:LATER_REWARDS[0],teaser:LATER_REWARDS[1]});reward(f,`RW-${key}-G1`,0,'group');reward(f,`RW-${key}-G2`,1,'group',{name:LATER_REWARDS[0]});return f;};
const seedFaction=(key,{discovery,membership,personal={},groupScore=0})=>{
  makeDoc({name:`[TEST] ${key}`,ownership:{default:0},flags:{[ns]:{faction:sourceDefinition(mkFaction(key))}}});
  const rec=makeGroupRecord({factionId:`FACTION-QA-${key}`});rec.discovery=discovery;rec.membership=membership;
  if(groupScore)rec.standing=adjustStanding(rec.standing,{delta:groupScore,reason:'[TEST] deed',eventId:`RENOWN-EVT-G${key}`,when:'2026-01-01T00:00:00.000Z'}).standing;
  makeDoc({name:`state ${key}`,ownership:{default:0},flags:{[ns]:{groupClaims:rec}}});
  for(const [actorId,pts] of Object.entries(personal)){const p=makePersonalRecord({factionId:`FACTION-QA-${key}`,actorId});p.standing=adjustStanding(p.standing,{delta:pts,reason:'[TEST] deed',eventId:`RENOWN-EVT-P${key}${actorId.toUpperCase()}`,when:'2026-01-01T00:00:00.000Z'}).standing;makeDoc({name:`personal ${key}${actorId}`,ownership:{default:0},flags:{[ns]:{individual:p}}});}
};
seedFaction('KNOWN',{discovery:{party:false,actors:['A1']},membership:{party:false,actors:[]}});          // Known only (p1's A1)
seedFaction('RECRUITED',{discovery:{party:false,actors:['A1','A1b']},membership:{party:false,actors:['A1','A1b']},personal:{A1:3,A1b:3},groupScore:3});   // both of p1's characters recruited
seedFaction('MIXED',{discovery:{party:false,actors:['A1','A1b']},membership:{party:false,actors:['A1']},personal:{A1:3},groupScore:3});                    // A1 recruited, A1b only Known
seedFaction('PARTY',{discovery:{party:true,actors:[]},membership:{party:true,actors:[]},personal:{A1:3},groupScore:3});                                      // whole party recruited
// Deity: discovered to the party. A1 is sworn to it, A1b and A2 are not. Scores are high enough to have passed tier 2.
const sun=makeDeity({id:'DEITY-QA-SUN',trackId:'RENOWN-QA-SUN',name:'[TEST] Sun Deity'});names(sun);
reward(sun,'RW-SUN-1',0,'individual',{behavior:'passive'});reward(sun,'RW-SUN-2',1,'individual',{name:LATER_REWARDS[0],teaser:LATER_REWARDS[1]});
makeDoc({name:'[TEST] Sun Deity',ownership:{default:0},flags:{[ns]:{faction:sourceDefinition(sun)}}});
{const rec=makeGroupRecord({factionId:'DEITY-QA-SUN'});rec.discovery={party:true,actors:[],placeholder:false,sharing_enabled:true};makeDoc({name:'state sun',ownership:{default:0},flags:{[ns]:{groupClaims:rec}}});
 for(const id of ['A1','A1b','A2']){const p=makePersonalRecord({factionId:'DEITY-QA-SUN',actorId:id});p.standing=adjustStanding(p.standing,{delta:4,reason:'[TEST] offering',eventId:`RENOWN-EVT-S${id.toUpperCase()}`,when:'2026-01-01T00:00:00.000Z'}).standing;makeDoc({name:`personal sun ${id}`,ownership:{default:0},flags:{[ns]:{individual:p}}});}}
await import('../scripts/module.mjs');hooks.get('init')();
test(settings.lockedRanks==='flavor','the 0.25.0 setting defaults to flavor-only');settings.lockedRanks='hide';settings.lockedRanksMigrated=true;// this file covers the 0.24.0 behaviour, now the 'hide' mode
hooks.get('ready')();await new Promise(r=>setTimeout(r,80));
const settle=()=>new Promise(r=>setTimeout(r,60));
const view=uid=>journal.find(d=>d.getFlag(ns,'playerView')?.user_id===uid).getFlag(ns,'playerView');
const fx=(uid,key)=>view(uid).payload.factions.find(f=>f.id===`FACTION-QA-${key}`);
const dx=uid=>view(uid).payload.deities.find(d=>d.id==='DEITY-QA-SUN');
const hasLater=obj=>{const raw=JSON.stringify(obj);return [...LATER,...LATER.map(n=>`[TEST] Group ${n}`),...LATER_REWARDS,'RW-KNOWN-I2','RW-KNOWN-G2','RW-SUN-2','Secret text RW-MIXED-I2'].filter(s=>raw.includes(s));};
const dashboard=mod.api.open(),actions=dashboard.constructor.DEFAULT_OPTIONS.actions;await dashboard._prepareContext();

// ---- A. Faction, Known only: the first unlock of each track, locked, and nothing else ----
{const p=fx('p1','KNOWN');
 test(p.member===false&&p.group===null&&Object.keys(p.personal).length===0,'Known: still no group or personal standing');
 test(p.groupTrack.preview===true&&p.individualTrack.preview===true,'Known: both tracks are marked as previews');
 test(p.individualTrack.milestones.length===1&&p.groupTrack.milestones.length===1,'Known: exactly one milestone per track');
 const m=p.individualTrack.milestones[0],g=p.groupTrack.milestones[0];
 test(m.name==='[TEST] Tier One'&&m.threshold===0&&g.name==='[TEST] Group Tier One','Known: it is the first (lowest threshold) milestone of each track');
 test(m.unlocksWhenRecruited===true&&m.unlocksText==='Unlocks when recruited'&&m.unlocked===false,'Known: marked Unlocks when recruited (text) and locked');
 test(m.rewards.length===1&&m.rewards[0].name==='[TEST] Reward RW-KNOWN-I1'&&m.rewards[0].canClaim===false&&m.rewards[0].locked===true,'Known: the first reward is listed and not claimable');
 test(m.rewards[0].description==='[TEST] Teaser RW-KNOWN-I1'&&!JSON.stringify(p).includes('Secret text'),'Known: locked reward text is the teaser only (existing visibility rules)');
 test(m.benefit===''&&m.rewards[0].uuid==null,'Known: no benefit text and no document link while locked');
 test(hasLater(p).length===0,`Known: no later tier name or reward anywhere in the player payload (${hasLater(p)})`);
 test(!/"claims"|"history"|"requests"|"uses"/.test(JSON.stringify(p)),'Known: no claims, history or requests keys');
 test(!fx('p2','KNOWN'),'another player sees nothing');
 // the whole player view, stringified
 test(!JSON.stringify(view('p1').payload).includes('RW-KNOWN-I2')&&!JSON.stringify(view('p1').payload).includes('RW-KNOWN-G2'),'Known: the later rewards of a Known-only faction are absent from the whole player view');
}
// ---- B. Faction, recruited: full as today ----
{const p=fx('p1','RECRUITED');
 test(p.member===true&&p.individualTrack.preview!==true&&p.individualTrack.milestones.length===5&&p.groupTrack.milestones.length===5,'Recruited: the full ladder, as today');
 test(p.personal.A1.milestones.length===5&&p.personal.A1b.milestones.length===5,'Recruited: each character has the full personal milestones');
 const q=fx('p1','PARTY');test(q.individualTrack.milestones.length===5&&q.groupTrack.milestones.length===5,'Party recruited: full');
}
// ---- C. Faction, two characters (A1 recruited, A1b only Known) ----
{const p=fx('p1','MIXED');
 test(p.personal.A1&&!p.personal.A1b,'Mixed: only the recruited character has personal standing');
 test(p.personal.A1.milestones.length===5,'Mixed: A1 sees the full ladder');
 test(p.individualTrack.preview===true&&p.individualTrack.milestones.length===1,'Mixed: the shared track is the one-tier preview, so A1b gets no later tier');
 test(hasLater(p.individualTrack).length===0,'Mixed: the shared individual track carries no later tier (they appear only inside the recruited character\'s own entry)');
 game.user=p1;
 dashboard.focus({factionId:'FACTION-QA-MIXED',actorId:'A1b',tab:'player'});let ctx=await dashboard._prepareContext();
 test(ctx.detail.personalMember===false&&ctx.detail.individualMs.length===0&&ctx.detail.individualPreview.length===1&&ctx.detail.individualPreview[0].unlocksWhenRecruited,'Mixed: A1b (selected) sees the preview only');
 dashboard.focus({factionId:'FACTION-QA-MIXED',actorId:'A1',tab:'player'});ctx=await dashboard._prepareContext();
 test(ctx.detail.personalMember===true&&ctx.detail.individualMs.length===5&&ctx.detail.individualPreview.length===0,'Mixed: A1 (selected) sees the full ladder and no preview');
 dashboard.focus({factionId:'FACTION-QA-KNOWN',actorId:'A1',tab:'group'});ctx=await dashboard._prepareContext();
 test(ctx.detail.groupMember===false&&ctx.detail.groupMs.length===0&&ctx.detail.groupPreview.length===1&&ctx.detail.groupPreview[0].rewards[0].canClaim===false,'Known: the Group tab context carries the one-tier preview, not claimable');
 dashboard.focus({factionId:'FACTION-QA-KNOWN',actorId:'A1',tab:'player'});ctx=await dashboard._prepareContext();
 test(ctx.detail.individualMs.length===0&&ctx.detail.individualPreview.length===1,'Known: the Character tab shows the preview only');
 game.user=gm;
}
// ---- D. Deities, per character ----
{const s=dx('p1');
 test(s.personal.A1.limited===false&&s.personal.A1.milestones.length===5,'Sworn character (A1): the full ladder');
 test(s.personal.A1b.limited===true&&s.personal.A1b.milestones.length===1&&s.personal.A1b.milestones[0].name==='[TEST] Tier One','Unsworn character (A1b): tier one only');
 test(s.personal.A1b.rank==='[TEST] Tier One'&&s.personal.A1b.next===null&&s.personal.A1b.remaining===0,'Unsworn: rank, next and remaining do not name a later tier although the score is past it');
 test(s.ladder.length===1,'Shared ladder is tier one only while any of the player\'s characters is unsworn');
 const raw=JSON.stringify({...s,personal:{A1b:s.personal.A1b}});
 test(hasLater(JSON.parse(raw)).length===0,`Unsworn A1b: no later tier text anywhere in what is addressed to them (${hasLater(JSON.parse(raw))})`);
 const t=dx('p2');test(t.personal.A2.limited===true&&t.personal.A2.milestones.length===1&&t.ladder.length===1&&hasLater(t).length===0,'Another player\'s unsworn character: tier one only, ladder one row, no leak');
 test(hasLater({...view('p2').payload,factions:[]}).length===0,'p2 deities and placeholders carry no later tier text (the recruited faction is excluded)');
 game.user=p1;
 dashboard.focus({deityId:'DEITY-QA-SUN',actorId:'A1b',tab:'pantheon'});let ctx=await dashboard._prepareContext();
 test(ctx.pantheon.open.limited===true&&ctx.pantheon.open.milestones.length===1,'Pantheon, A1b selected: one tier, limited');
 test(ctx.pantheon.open.milestones[0].unlocked===true&&ctx.pantheon.open.milestones[0].rewards.length===1,'Pantheon: tier one is shown fully (unlocked, its reward)');
 dashboard.focus({deityId:'DEITY-QA-SUN',actorId:'A1',tab:'pantheon'});ctx=await dashboard._prepareContext();
 test(ctx.pantheon.open.limited===false&&ctx.pantheon.open.milestones.length===5,'Pantheon, A1 selected (sworn): full ladder');
 game.user=gm;
}
// Vow toggle on tier one stays for the unsworn character
{game.user=p1;dashboard.focus({deityId:'DEITY-QA-SUN',actorId:'A1b',tab:'pantheon'});const ctx=await dashboard._prepareContext();
 test(ctx.pantheon.open.milestones[0].vowToggle?.show===true&&ctx.pantheon.open.milestones[0].vowToggle.sworn===false,'Unsworn: the Vow toggle is on the first tier');game.user=gm;}
// Swearing re-projects (GM client), Break Vow re-hides
{actor1b.flags[ns].vow={deity_id:'DEITY-QA-SUN',sworn_at:'2026-10-02T00:00:00.000Z'};hooks.get('updateActor')(actor1b,{flags:{[ns]:{vow:actor1b.flags[ns].vow}}});await settle();
 test(dx('p1').personal.A1b.limited===false&&dx('p1').personal.A1b.milestones.length===5&&dx('p1').ladder.length===5,'After A1b swears a Vow to this god: the full ladder, and the shared ladder is full');
 // a Vow to a different god does not unlock this one
 actor1b.flags[ns].vow={deity_id:'DEITY-QA-OTHER',sworn_at:'2026-10-02T00:00:00.000Z'};hooks.get('updateActor')(actor1b,{flags:{[ns]:{vow:actor1b.flags[ns].vow}}});await settle();
 test(dx('p1').personal.A1b.limited===true,'A Vow to a different god keeps this god limited');
 actor1b.flags[ns].vow={deity_id:'DEITY-QA-SUN',sworn_at:'x'};hooks.get('updateActor')(actor1b,{flags:{[ns]:{vow:actor1b.flags[ns].vow}}});await settle();
 delete actor1b.flags[ns].vow;hooks.get('updateActor')(actor1b,{flags:{[ns]:{'-=vow':null}}});await settle();   // GM breaks the Vow
 test(dx('p1').personal.A1b.limited===true&&dx('p1').personal.A1b.milestones.length===1&&hasLater(dx('p1').personal.A1b).length===0,'Break Vow: later tiers are hidden again');
 test(journal.some(d=>d.getFlag(ns,'individual')?.actor_id==='A1b'&&d.getFlag(ns,'individual')?.faction_id==='DEITY-QA-SUN'&&d.getFlag(ns,'individual').standing.score===4),'Break Vow by hiding does not touch the stored score');
}
// ---- E. API for players ----
{game.user=p1;
 const f=mod.api.getFactions(),d=mod.api.getDeities(),pa=mod.api.getPantheon(actor1b),pb=mod.api.getPantheon(actor1);
 test(hasLater(f.filter(x=>x.id==='FACTION-QA-KNOWN')).length===0,'API getFactions: Known-only has no later tier');
 test(hasLater(d.map(x=>({...x,personal:{A1b:x.personal.A1b}}))).length===0&&d[0].personal.A1b.milestones.length===1,'API getDeities: unsworn character has tier one only');
 test(pa[0].limited===true&&pa[0].rank==='[TEST] Tier One'&&pa[0].next===null&&hasLater(pa).length===0,'API getPantheon: unsworn row is clamped to tier one');
 test(pb[0].limited===false&&pb[0].rank==='[TEST] Tier Two'||pb[0].limited===false,'API getPantheon: sworn row is as today');
 game.user=gm;
 test(mod.api.getDeities().length===1&&mod.api.getFactions().length===4,'GM API is unchanged');
}
// ---- F. Embed ----
{const el={classList:{add(){},remove(){}},addEventListener(){},innerHTML:'',isConnected:true};
 game.user=p1;const emb=mod.api.embed.mount(el,{actorId:'A1b'});
 const sect=id=>el.innerHTML.split('<section').find(x=>x.includes(id))??'';
 test(sect('data-faction="FACTION-QA-KNOWN"').includes('Known (not recruited)')&&hasLater(sect('data-faction="FACTION-QA-KNOWN"')).length===0,'Embed: Known-only faction shows its status and no later tier');
 test(hasLater(sect('data-deity="DEITY-QA-SUN"')).length===0,'Embed: the unsworn deity row names no later tier');
 test(el.innerHTML.includes('More tiers unlock when you swear a vow.')&&!el.innerHTML.includes('Top rank'),'Embed: an unsworn deity says more tiers unlock with a vow, not "Top rank"');
 emb.unmount();game.user=gm;
}
// ---- G. GM view unchanged ----
{const ctx=await (async()=>{dashboard.focus({deityId:'DEITY-QA-SUN',actorId:'A1b',tab:'pantheon'});return dashboard._prepareContext();})();
 test(ctx.pantheon.open.milestones.length===5&&!ctx.pantheon.open.limited,'GM: the whole ladder');
 dashboard.focus({factionId:'FACTION-QA-KNOWN',actorId:'A1',tab:'player'});const c2=await dashboard._prepareContext();
 test(c2.detail.individualMs.length===5&&c2.detail.groupMs.length===5&&c2.detail.individualPreview.length===0,'GM: full tracks on a Known-only faction, no preview');
}
// ---- H. Claims ----
const cap=uid=>view(uid).capability;
const request=(key,actorId,rewardId,audience='individual',deity=false)=>{notify.length=0;game.socket.emit(`module.${ns}`,{type:'request',factionId:deity?key:`FACTION-QA-${key}`,audience,actorId,rewardId,userId:'p1',capability:cap('p1')});};
const claims=(id,actorId)=>journal.find(d=>d.getFlag(ns,'individual')?.faction_id===id&&d.getFlag(ns,'individual')?.actor_id===actorId)?.getFlag(ns,'individual')?.claims??{};
{request('KNOWN','A1','RW-KNOWN-I1');await settle();
 test(!claims('FACTION-QA-KNOWN','A1')['RW-KNOWN-I1']&&notify.some(n=>n.includes('not recruited')),'Claim: the previewed first-tier reward of a Known-only faction is refused');
 request('MIXED','A1b','RW-MIXED-I1');await settle();
 test(!claims('FACTION-QA-MIXED','A1b')['RW-MIXED-I1']&&notify.some(n=>n.includes('not recruited')),'Claim: an unrecruited character cannot claim');
 // deity: A1b is not sworn (flag removed), A1 is sworn
 request('DEITY-QA-SUN','A1b','RW-SUN-2','individual',true);await settle();
 test(!claims('DEITY-QA-SUN','A1b')['RW-SUN-2']&&notify.some(n=>n.includes('Swear a Vow')),'Claim: a later-tier reward of a god is refused for an unsworn character');
 request('DEITY-QA-SUN','A1','RW-SUN-2','individual',true);await settle();
 test(!notify.some(n=>n.includes('Swear a Vow')),'Claim: the sworn character is not stopped by the Vow rule');
}
// ---- I. Setting OFF restores 0.23.0 ----
{game.settings.set(ns,'lockedRanks','all');hooks.get('updateSetting')({key:`${ns}.lockedRanks`});await settle();
 const p=fx('p1','KNOWN');test(p.group===null&&p.groupTrack.preview===true&&p.groupTrack.milestones.length===5,'Show everything: a Known-only faction shows every rank as a locked teaser (no standing)');
 const s=dx('p1');test(s.personal.A1b.milestones.length===5&&s.personal.A1b.limited===false&&s.ladder.length===5&&s.personal.A1b.rank!=='[TEST] Tier One','OFF: an unsworn deity shows the whole ladder, as in 0.23.0');
 test(fx('p1','MIXED').individualTrack.preview!==true&&fx('p1','MIXED').individualTrack.milestones.length===5,'Show everything: recruited factions send the full shared track, as in 0.23.0');
 request('DEITY-QA-SUN','A1b','RW-SUN-2','individual',true);await settle();
 test(!notify.some(n=>n.includes('Swear a Vow')),'OFF: the Vow rule on claims is not applied');
 game.settings.set(ns,'lockedRanks','hide');hooks.get('updateSetting')({key:`${ns}.lockedRanks`});await settle();
 test(fx('p1','KNOWN').groupTrack.preview===true&&dx('p1').personal.A1b.limited===true,'ON again: previews return');
}
console.log(`first-unlock-preview: ${checks} checks passed`);
