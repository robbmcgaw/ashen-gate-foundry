/** Known vs Recruited (0.23.0): migration, player redaction, Recruit, award dialog, knock-ons, share, permissions. In-memory Foundry V14-shaped harness. NOT a browser test. Synthetic [TEST] data only. */
import assert from 'node:assert/strict';
import {makeFaction,sourceDefinition,makeGroupRecord,makePersonalRecord,adjustStanding,overlayCampaign,extractCampaignDiscovery,groupStateDefaults} from '../scripts/core.mjs';
import * as M from '../scripts/membership.mjs';
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
// ---- Pure model ----
{const f={discovery:{party:false,actors:['A1']}};
 test(JSON.stringify(M.resolveMembership({discovery:f.discovery},f.discovery))==='{"party":false,"actors":["A1"]}','no membership field: a copy of the discovery');
 test(JSON.stringify(M.resolveMembership({membership:{party:false,actors:[]}},f.discovery))==='{"party":false,"actors":[]}','a stored membership wins over discovery');
 test(JSON.stringify(M.resolveMembership(undefined,{party:false,actors:[]}))==='{"party":false,"actors":[]}','no state at all: nobody is a member');
 const g={discovery:{party:false,actors:[]},membership:{party:false,actors:[]}};
 M.setMember(g,{actorId:'A1',on:true});test(g.discovery.actors.includes('A1')&&M.isMember(g,'A1'),'recruiting also shows the faction');
 M.setMember(g,{actorId:'A1',on:false});test(g.discovery.actors.includes('A1')&&!M.isMember(g,'A1'),'removing from members keeps it Known');
 M.setMember(g,{actorId:'A1',on:true});M.setKnown(g,{actorId:'A1',on:false});test(!g.discovery.actors.includes('A1')&&!g.membership.actors.includes('A1')&&!M.isMember(g,'A1'),'hiding also removes the membership');
 M.setMember(g,{party:true,on:true});test(g.discovery.party&&M.isPartyMember(g)&&M.isMember(g,'ANY'),'recruiting the party recruits everyone');
 test(!M.isMember({discovery:{party:false,actors:[]},membership:{party:false,actors:['A9']}},'A9'),'membership without Known counts for nothing');
 test(M.scopeStatus({discovery:{party:false,actors:['A1']},membership:{party:false,actors:[]}},{actorId:'A1',who:'Ana'}).recruitLabel==='Recruit Ana','label: Recruit <name>');
 test(M.scopeStatus(g,{actorId:'A1',who:'Ana'}).recruitDisabled,'recruited with the party: the character button is disabled');
 let threw=false;try{M.setMember({discovery:{},membership:{}},{});}catch{threw=true;}test(threw,'a scope is required');
}
{const def=makeFaction({id:'FACTION-QA-P',trackId:'RENOWN-QA-P',name:'[TEST] P'});
 const o=overlayCampaign(sourceDefinition(def),{discovery:{party:false,actors:['A1']}});
 test(o.membership.actors.join()==='A1'&&!o.membership.party,'overlay: old state migrates by copy');
 test(!('membership' in sourceDefinition(o)),'sourceDefinition never carries membership');
 const o2=overlayCampaign(sourceDefinition(def),{discovery:{party:false,actors:['A1']},membership:{party:false,actors:[]}});
 test(o2.membership.actors.length===0&&extractCampaignDiscovery(o2).membership.actors.length===0,'overlay + extract keep an explicit membership');
 test(makeGroupRecord({factionId:'X'}).membership.party===false,'a new group record starts with nobody recruited');
 const d=groupStateDefaults({faction_id:'X',discovery:{party:true,actors:[]}});test(!('membership' in d.state),'groupStateDefaults leaves the migration to the module (needs the effective discovery)');
}
// ---- Runtime ----
const mk=key=>{const f=makeFaction({id:`FACTION-QA-${key}`,trackId:`RENOWN-QA-${key}`,name:`[TEST] ${key}`,leader:`[TEST] Leader ${key}`,public_role:`[TEST] Role ${key}`});
  f.entries=[{id:`info_${key}`,name:`[TEST] Lore ${key}`,text:'[TEST] public lore',link_mode:'preview',unlock:'manual',threshold:0,discovered_party:false,discovered_actors:[]}];
  f.rewards=[{id:`rw-${key}`,key:`rw_${key}`,audience:'individual',milestone_id:f.individual_track.milestones[0].id,name:'[TEST] Boon',teaser:'[TEST] Boon',description:'',kind:'custom',tags:[],behavior:'one_time',usage_limit:0}];
  if(key==='CONCORD')f.relations=[{faction_id:'FACTION-QA-KNOWN',resonance:1},{faction_id:'FACTION-QA-OLDMEMBER',resonance:1}];
  return f;};
const seedDef=(key)=>makeDoc({name:`[TEST] ${key}`,ownership:{default:0},flags:{[ns]:{faction:sourceDefinition(mk(key))}}});
const seedState=(key,{discovery,membership,groupScore=0,personal={}})=>{
  const rec=makeGroupRecord({factionId:`FACTION-QA-${key}`});delete rec.membership;if(membership)rec.membership=membership;rec.discovery=discovery;
  if(groupScore)rec.standing=adjustStanding(rec.standing,{delta:groupScore,reason:'[TEST] old deed',eventId:`RENOWN-EVT-G${key}`,when:'2026-01-01T00:00:00.000Z'}).standing;
  makeDoc({name:`state ${key}`,ownership:{default:0},flags:{[ns]:{groupClaims:rec}}});
  for(const [actorId,pts] of Object.entries(personal)){const p=makePersonalRecord({factionId:`FACTION-QA-${key}`,actorId});p.standing=adjustStanding(p.standing,{delta:pts,reason:'[TEST] old deed',eventId:`RENOWN-EVT-P${key}${actorId}`,when:'2026-01-01T00:00:00.000Z'}).standing;makeDoc({name:`personal ${key}${actorId}`,ownership:{default:0},flags:{[ns]:{individual:p}}});}
};
// Old world (no membership field anywhere): OLDPARTY revealed to the party with standing, OLDCHAR to A1 only with standing, OLDNONE to nobody.
for(const k of ['OLDPARTY','OLDCHAR','OLDNONE','OLDMEMBER'])seedDef(k);
seedState('OLDPARTY',{discovery:{party:true,actors:[]},groupScore:7,personal:{A1:3}});
seedState('OLDCHAR',{discovery:{party:false,actors:['A1']},groupScore:2,personal:{A1:4}});
seedState('OLDNONE',{discovery:{party:false,actors:[]},groupScore:5});
seedState('OLDMEMBER',{discovery:{party:false,actors:['A1']},membership:{party:false,actors:['A1']},personal:{A1:1}});
for(const k of ['CONCORD','NEW','KNOWN','SHARE','FRESH'])seedDef(k);
await import('../scripts/module.mjs');hooks.get('init')();
// Snapshot what a player saw BEFORE the update (the old module's rule: Known = recruit).
hooks.get('ready')();
await new Promise(r=>setTimeout(r,60));
const st=key=>journal.find(d=>d.getFlag(ns,'groupClaims')?.faction_id===`FACTION-QA-${key}`);
const state=key=>st(key).getFlag(ns,'groupClaims');
const view=uid=>journal.find(d=>d.getFlag(ns,'playerView')?.user_id===uid).getFlag(ns,'playerView');
const fx=(uid,key)=>view(uid).payload.factions.find(f=>f.id===`FACTION-QA-${key}`);
// Migration: copy of discovery; explicit membership is left alone.
test(JSON.stringify(state('OLDPARTY').membership)==='{"party":true,"actors":[]}','migration: party-revealed becomes party-recruited');
test(JSON.stringify(state('OLDCHAR').membership)==='{"party":false,"actors":["A1"]}','migration: character-revealed becomes character-recruited');
test(JSON.stringify(state('OLDNONE').membership)==='{"party":false,"actors":[]}','migration: unrevealed stays unrevealed and not recruited');
test(state('OLDMEMBER').membership.actors.join()==='A1','migration leaves an existing membership as is');
test(JSON.stringify(state('NEW').membership)==='{"party":false,"actors":[]}','a world faction with no state starts with nobody recruited');
// Old-world behaviour unchanged: the players still see exactly their standing.
test(fx('p1','OLDPARTY').group.score===7&&fx('p1','OLDPARTY').personal.A1.score===3&&fx('p2','OLDPARTY').group.score===7&&fx('p2','OLDPARTY').personal.A2.score===0,'old world: party-revealed faction shows standing as before');
test(fx('p1','OLDCHAR').group.score===2&&fx('p1','OLDCHAR').personal.A1.score===4&&!fx('p2','OLDCHAR'),'old world: character-revealed faction shows standing to its owner only');
test(!fx('p1','OLDNONE')&&!fx('p2','OLDNONE'),'old world: unrevealed stays hidden');
// Re-run is a no-op (no writes, same data).
const before=JSON.stringify(journal.map(d=>d.flags));let writes=0;const orig=[];
for(const d of journal){const sf=d.setFlag.bind(d);d.setFlag=async(...a)=>{writes++;return sf(...a);};orig.push([d,sf]);}
hooks.get('ready')();await new Promise(r=>setTimeout(r,60));
const strip=j=>JSON.parse(j).map(f=>{const g=structuredClone(f);if(g[ns]?.playerView)delete g[ns].playerView.payload;if(g[ns]?.folderIndex)delete g[ns].folderIndex;return g;});
test(JSON.stringify(strip(before))===JSON.stringify(strip(JSON.stringify(journal.map(d=>d.flags)))),'migration re-run changes no stored data');
test(!journal.filter(d=>d.getFlag(ns,'groupClaims')).some(d=>d.getFlag(ns,'groupClaims').membership===undefined),'every group state has a membership field after migration');
const dashboard=mod.api.open(),actions=dashboard.constructor.DEFAULT_OPTIONS.actions;await dashboard._prepareContext();
const choose=async(key,actorId)=>{dashboard.focus({factionId:`FACTION-QA-${key}`,actorId});return dashboard._prepareContext();};
const act=async(name,key,actorId,mode)=>{await choose(key,actorId);await actions[name].call(dashboard,null,{dataset:{mode}});};
const award=(scope,delta,reason)=>({dataset:{scope},closest:()=>({querySelector:sel=>sel.includes('renown-delta')?{value:String(delta)}:{value:reason}})});
const pers=(key,actor)=>journal.find(d=>d.getFlag(ns,'individual')?.faction_id===`FACTION-QA-${key}`&&d.getFlag(ns,'individual')?.actor_id===actor)?.getFlag(ns,'individual');
const score=(key,actor)=>pers(key,actor)?.standing?.score??0;
const gscore=key=>state(key).standing.score;
const asked=[];globalThis.confirm=msg=>{asked.push(String(msg));return true;};

// New reveal: Known only. The player gets the card and information, nothing about standing.
await act('discovery','NEW','A1','actor');
test(state('NEW').discovery.actors.join()==='A1'&&state('NEW').membership.actors.length===0,'a new reveal adds to discovery only');
let p=fx('p1','NEW');
test(p&&p.name==='[TEST] NEW'&&p.leader==='[TEST] Leader NEW'&&p.public_role==='[TEST] Role NEW','Known: name, leader and description are shown');
test(p.status==='Known (not recruited)'&&p.member===false,'Known: the status text says Known (not recruited)');
test(p.group===null&&p.groupTrack===null&&p.individualTrack===null&&Object.keys(p.personal).length===0,'Known: no group, track or personal data in the payload');
const raw=JSON.stringify(p);
test(!/score|rank|milestone|history|claims|threshold|rw-NEW|Boon|requests/i.test(raw),'Known: nothing about score, rank, milestones, history, claims or rewards is serialised');
test(p.entries.length===0,'Known: information entries stay hidden until they are shown');
await choose('NEW','A1');const ek=state('NEW');
await actions.showEntry.call(dashboard,null,{dataset:{entry:'info_NEW',mode:'actor'}});
test(fx('p1','NEW').entries.map(e=>e.name).join()==='[TEST] Lore NEW','Known: an information entry shown to the character appears');
test(view('p1').payload.folders.some(f=>f.known.includes('FACTION-QA-NEW')),'Known: the faction is listed in its folder');
test(!fx('p2','NEW'),'another player sees nothing');
let ctx;game.user=p1;ctx=await dashboard._prepareContext();game.user=gm;
// Player template context for the Known faction.
game.user=p1;dashboard.focus({factionId:'FACTION-QA-NEW',actorId:'A1',tab:'player'});ctx=await dashboard._prepareContext();
test(ctx.detail.personalMember===false&&ctx.detail.recruitedHere===false&&ctx.detail.status==='Known (not recruited)'&&ctx.detail.individualMs.length===0,'Known: the player context has no ranks and says Known (not recruited)');
dashboard.focus({factionId:'FACTION-QA-NEW',actorId:'A1',tab:'group'});ctx=await dashboard._prepareContext();
test(ctx.detail.groupMember===false&&ctx.detail.groupMs.length===0&&ctx.detail.entries.length===1,'Known: the group tab shows information and no standing');
game.user=gm;
// Known-only claims are refused in the GM handler.
game.socket.emit(`module.${ns}`,{type:'request',factionId:'FACTION-QA-NEW',audience:'individual',actorId:'A1',rewardId:'rw-NEW',userId:'p1',capability:view('p1').capability});
await new Promise(r=>setTimeout(r,30));
test(!pers('NEW','A1')?.claims?.['rw-NEW']&&notify.some(n=>n.includes('not recruited')),'Known: a forged reward request is refused');
// Share: knowledge only.
await act('discovery','SHARE','A1','actor');
game.socket.emit(`module.${ns}`,{type:'share',factionId:'FACTION-QA-SHARE',userId:'p1',capability:view('p1').capability});
await new Promise(r=>setTimeout(r,30));
test(state('SHARE').discovery.party===true&&state('SHARE').membership.party===false&&state('SHARE').membership.actors.length===0,'share: the party now knows, nobody is recruited');
test(fx('p2','SHARE')&&fx('p2','SHARE').group===null&&fx('p2','SHARE').status==='Known (not recruited)'&&fx('p2','SHARE').canShare===false,'share: the other player gets the information card only');
// Recruit: everything appears, as in an older world.
await act('membership','NEW','A1','actor');
test(state('NEW').membership.actors.join()==='A1','Recruit adds the character to membership');
p=fx('p1','NEW');
test(p.member===true&&p.status==='Recruited'&&p.personal.A1.score===0&&p.group.score===0&&p.groupTrack.milestones.length===5&&p.individualTrack.milestones.length===5,'Recruit: ranks, tracks and standing appear');
// Remove from members: confirmation, hidden, data kept.
await act('discovery','OLDCHAR','A1','actor');
test(asked.some(m=>m.includes('removed from its members')&&m.includes('stored record')),'hiding a recruit asks first and says what happens');
test(!fx('p1','OLDCHAR')&&score('OLDCHAR','A1')===4&&gscore('OLDCHAR')===2&&state('OLDCHAR').membership.actors.length===0,'hiding removes the membership but keeps the stored standing');
await act('discovery','OLDCHAR','A1','actor');
test(fx('p1','OLDCHAR').status==='Known (not recruited)'&&fx('p1','OLDCHAR').group===null,'showing again is Known only: the old recruit is not restored');
await act('membership','OLDCHAR','A1','actor');
test(fx('p1','OLDCHAR').personal.A1.score===4&&fx('p1','OLDCHAR').group.score===2,'recruiting again brings the kept standing back');
asked.length=0;await act('membership','OLDCHAR','A1','actor');
test(asked.length===1&&asked[0].includes('Nothing is deleted'),'Remove from members asks, saying nothing is deleted');
test(!fx('p1','OLDCHAR').personal?.A1&&fx('p1','OLDCHAR').status==='Known (not recruited)'&&score('OLDCHAR','A1')===4,'Remove from members hides standing, keeps Known, keeps data');
await act('membership','OLDCHAR','A1','actor');
globalThis.confirm=()=>false;await act('membership','OLDCHAR','A1','actor');
test(state('OLDCHAR').membership.actors.join()==='A1','declining the Remove confirmation changes nothing');
globalThis.confirm=msg=>{asked.push(String(msg));return true;};
// Party vs personal.
await act('membership','FRESH','A2','actor');
test(fx('p2','FRESH').personal.A2&&fx('p2','FRESH').group&&!fx('p1','FRESH'),'a recruited character sees its own standing and the group card; others see nothing');
await act('discovery','FRESH','A1','actor');
test(fx('p1','FRESH').group===null&&fx('p1','FRESH').status==='Known (not recruited)','a second character who is only Known stays info-only');
await act('membership','FRESH','A1','party');
test(state('FRESH').membership.party&&state('FRESH').discovery.party&&fx('p1','FRESH').group&&fx('p1','FRESH').personal.A1,'Recruit party also shows the faction and recruits every character');
dashboard.focus({factionId:'FACTION-QA-FRESH',actorId:'A1',tab:'player'});let c2=await dashboard._prepareContext();test(c2.gmMembership.mode==='actor'&&c2.gmMembership.memberChip==='Recruited: A1'&&c2.gmMembership.disabled===true,'GM button for a character recruited with the party is disabled');
// Award dialog.
globalThis.confirm=()=>false;
await act('discovery','KNOWN','A1','actor');
await choose('KNOWN','A1');await actions.award.call(dashboard,null,award('individual',3,'[TEST] deed'));
test(score('KNOWN','A1')===0&&!state('KNOWN').membership.actors.length,'award to a not-recruited character: unticking cancels it, nothing recorded');
globalThis.confirm=msg=>{asked.push(String(msg));return true;};asked.length=0;
await actions.award.call(dashboard,null,award('individual',3,'[TEST] deed'));
test(score('KNOWN','A1')===3&&state('KNOWN').membership.actors.join()==='A1','award with the Recruit tick: recruited and recorded');
test(asked.some(m=>m.includes('Recruit A1 now')||m.includes('Not recruited')),'the dialog is "Not recruited: recruiting now" with a Recruit <name> now tick');
asked.length=0;await actions.award.call(dashboard,null,award('individual',1,'[TEST] again'));
test(score('KNOWN','A1')===4&&!asked.some(m=>m.includes('Recruit A1 now')),'a recruited character is not asked again');
globalThis.confirm=()=>false;await choose('OLDNONE','A1');
await actions.award.call(dashboard,null,award('group',2,'[TEST] group deed'));
test(gscore('OLDNONE')===5,'group award with nobody recruited: unticking cancels it');
globalThis.confirm=()=>true;await actions.award.call(dashboard,null,award('group',2,'[TEST] group deed'));
test(gscore('OLDNONE')===7&&state('OLDNONE').membership.party&&state('OLDNONE').discovery.party,'group award recruits the party with the tick, keeping the new membership (not overwritten by the award)');
asked.length=0;await choose('OLDCHAR','A1');await actions.award.call(dashboard,null,award('group',1,'[TEST] g'));
test(gscore('OLDCHAR')===3,'group award where a character is recruited does not prompt (older worlds unchanged)');
// Knock-ons: Concord relates to KNOWN (Known only for A2) and OLDMEMBER (member).
await act('membership','CONCORD','A1','actor');
await act('discovery','KNOWN','A2','actor');
await act('membership','CONCORD','A2','actor');await act('discovery','OLDMEMBER','A2','actor');
globalThis.confirm=()=>true;
await choose('CONCORD','A2');
await actions.award.call(dashboard,null,award('individual',10,'[TEST] Concord deed'));
test(score('CONCORD','A2')===10,'(setup) A2 recruited into Concord');
test(!pers('KNOWN','A2')&&!pers('OLDMEMBER','A2'),'knock-on: factions A2 only knows of get no standing and no record');
await choose('CONCORD','A1');await actions.award.call(dashboard,null,award('individual',10,'[TEST] Concord deed'));
test(score('OLDMEMBER','A1')===1+5,'knock-on: a faction A1 is recruited into moves');
test(score('KNOWN','A1')===4+5,'knock-on: the second related faction A1 is recruited into moves too');
// GM-only mutation in the data layer.
game.user=p1;notify.length=0;
const before2=JSON.stringify(state('NEW'));
await actions.membership.call(dashboard,null,{dataset:{mode:'actor'}});
test(notify.some(n=>n.includes('GM authorization'))&&JSON.stringify(state('NEW'))===before2,'a player cannot Recruit through the window');
let denied=0;for(const args of [['FACTION-QA-NEW',{actorId:'A1',on:true}],['FACTION-QA-NEW',{party:true,on:true}]]){try{await mod.api.setMembership(...args);}catch(e){if(/GM authorization/.test(e.message))denied++;}}
test(denied===2&&JSON.stringify(state('NEW'))===before2,'api.setMembership is GM only');
game.user=gm;
// api.setMembership
const r=await mod.api.setMembership('FACTION-QA-NEW',{actorId:'A1',on:false});
test(r.member===false&&r.known===true&&fx('p1','NEW').member===false&&fx('p1','NEW').group===null,'api.setMembership removes a character from members and keeps them Known');
await mod.api.setMembership('FACTION-QA-NEW',{actorId:'A2',on:true});
test(state('NEW').membership.actors.includes('A2')&&state('NEW').discovery.actors.includes('A2'),'api.setMembership recruits and shows');
for(const bad of [{},{party:true,actorId:'A1'},{actorId:'NOPE',on:true},{party:true,on:'yes'}]){let t=false;try{await mod.api.setMembership('FACTION-QA-NEW',bad);}catch{t=true;}test(t,`api.setMembership rejects ${JSON.stringify(bad)}`);}
let t2=false;try{await mod.api.setMembership('FACTION-QA-MISSING',{party:true,on:true});}catch{t2=true;}test(t2,'api.setMembership rejects an unknown faction');
// Player getFactions reflects the split.
game.user=p1;const gf=mod.api.getFactions().find(f=>f.id==='FACTION-QA-SHARE');
test(gf.group===null&&gf.status==='Known (not recruited)','player getFactions reflects Known (not recruited)');
test(!JSON.stringify(mod.api.getFactions().filter(f=>f.member===false)).match(/score|rank|milestone|history|claims/i),'player getFactions has no standing for Known factions');
game.user=gm;
// GM list chips: text.
const g=M.recruitChip({discovery:{party:false,actors:['A1']},membership:{party:false,actors:['A1']}});
test(g==='Recruited: characters'&&M.recruitChip({discovery:{party:true,actors:[]},membership:{party:true,actors:[]}})==='Recruited: party'&&M.recruitChip({discovery:{party:true,actors:[]},membership:{party:false,actors:[]}})==='Not recruited','recruit chips carry text');
ctx=await (async()=>{dashboard.focus({factionId:'FACTION-QA-NEW'});dashboard.element=undefined;return dashboard._prepareContext();})();
// Embed: Known-only shows the status, not zeros.
const el={classList:{add(){},remove(){}},addEventListener(){},innerHTML:'',isConnected:true};
game.user=p1;const emb=mod.api.embed.mount(el,{actorId:'A1'});
test(el.innerHTML.includes('Known (not recruited)'),'embed: a Known-only faction shows its status instead of a zero score');
emb.unmount();game.user=gm;
// Deities keep their behaviour: no membership concept in their payload.
test(!('member' in (view('p1').payload.deities[0]??{})),'deities are untouched');
import('node:test').then(({default:t})=>t('known vs recruited runtime checks',()=>assert.ok(checks>=60,String(checks))));
