/** Portable Renown model (factions and deities). No Foundry runtime required. */
import {checkObjectiveRefs} from './objective-refs.mjs';
import {isDeity,deityProfile,unusedGroupTrack,validateDeityParts} from './deity.mjs';
import {assertReusableFactionSource,assertPrivateFieldReveals,assertNoUnclassifiedLegacyRefKeys} from './source-allowlist.mjs';
export const MODULE_ID='ashen-gate-factions';
export const SCHEMA_VERSION='0.3.0';
export const REWARD_BEHAVIORS=['one_time','repeatable_service','passive'];
const ref=(relation,target_id)=>({relation,target_id,mode:'required'});
const startingMilestones=[['Unproven',0,'Access to public faction opportunities.'],['Recognized',3,'A recognized contact and an introductory faction service.'],['Trusted',6,'Eligibility for a modest, negotiated noncombat favor.'],['Proven',10,'Eligibility for significant commissions and expedition sponsorship.'],['Esteemed',15,'Eligibility to pursue an earned, lasting faction alliance.']];
export const RECOVERED_GUILDS_DRAFT=Object.freeze([
  {name:'The Far Lanterns',leader:'Nessa Vale',public_role:'Scouting, maps, recovery work, and knowledge of the country beyond the walls',initial_benefit:'Consult known route notes and ask a scout about a familiar route.'},
  {name:'The Gilt Compact',leader:'Director Odran Kell',public_role:'Trade security, procurement, and negotiated contracts',initial_benefit:'Ask a broker to find an ordinary buyer, supplier, or material at a quoted price.'},
  {name:'The Hearthward Company',leader:'Captain Branna Holt',public_role:'Rescue, local protection, and support for those harmed by dangerous work',initial_benefit:'Arrange basic temporary shelter or an introduction to a local care provider.'},
  {name:'The Iron March',leader:'Marshal Edra Voss',public_role:'Reliable escort, disciplined defense, and contracts that hold under pressure',initial_benefit:'Access supervised practice space and introductions to available guards.'}
]);
export const blankStanding=()=>({opening_score:0,score:0,events:[]});
/** Fills missing group-state keys; `changed` is false when the stored state already had them all (so no write is needed). */
export function groupStateDefaults(stored,legacyStanding){
  const state=structuredClone(stored??{});
  state.standing??=legacyStanding??blankStanding();state.requests??={};state.uses??={};state.claims??={};state.choices??={};
  return {state,changed:stored==null||JSON.stringify(state)!==JSON.stringify(stored)};
}
export const keyFor=s=>String(s??'').toLowerCase().replace(/[^a-z0-9_-]+/g,'_').replace(/^[_-]+/,'').slice(0,90)||'entry';
const provenance=(x,fallback)=>({sources:Array.isArray(x?.sources)?x.sources:[x?.source||fallback].filter(Boolean),decision_refs:x?.decision_refs??x?.decisionRefs??[]});
export function makeFaction({id,trackId,name,leader='',public_role='',source='New GM draft',initialBenefit=null}){
  if(!id||!trackId)throw Error('Faction and Renown IDs required.');
  const track=(id,personal)=>({id,entity_type:'RenownTrack',status:'draft',version:SCHEMA_VERSION,provenance:{sources:['Five-rank playtest proposal'],decision_refs:['DEC-0029']},visibility:'player',refs:[ref('for_faction',id===trackId?id:id.split('-IND')[0])],default_scope:personal?'individual':'group',milestones:startingMilestones.map(([name,threshold,benefit],i)=>({id:`${id}-M${i+1}`,key:`milestone_${i+1}`,name,threshold,benefit:personal?'':i===1&&initialBenefit?initialBenefit:benefit,selection_mode:'all'}))});
  const a=track(trackId,false),b=track(`${trackId}-IND`,true);a.refs=[ref('for_faction',id)];b.refs=[ref('for_faction',id)];
  return {id,entity_type:'Faction',status:'draft',version:SCHEMA_VERSION,provenance:{sources:[source],decision_refs:['DEC-0028']},visibility:'reveal_gated',refs:[],name,leader,public_role,folder_key:'',tags:[],discovery:{party:false,actors:[],placeholder:false,sharing_enabled:true},entries:[],renown_track:a,individual_track:b,rewards:[]};
}
/** Campaign-owned field disclosure. Legacy mode preserves every already-discovered field.
 * Selective mode can reveal each field to the party or individual Actors independently.
 * No disclosure settings appear in player projections or definition exports. */
export const FIELD_KEYS=Object.freeze(['name','leader','public_role']);
export function fieldDisclosure(input){
  const x=input&&typeof input==='object'?input:{};
  return {mode:x.mode==='selective'?'selective':'legacy',fields:Object.fromEntries(FIELD_KEYS.map(key=>[key,{party:Boolean(x.fields?.[key]?.party),actors:Array.isArray(x.fields?.[key]?.actors)?[...x.fields[key].actors]:[]}]))};
}
export function disclosedField(f,key,actorIds=[],groupFields=null){
  const disclosure=fieldDisclosure(groupFields);
  if(disclosure.mode==='legacy')return f[key]??'';
  const rule=disclosure.fields[key];
  return rule.party||actorIds.some(id=>rule.actors.includes(id))?f[key]??'':'';
}
export function revealField(input,key,{party=false,actorId=null,visible=true}={}){
  if(!FIELD_KEYS.includes(key))throw Error('Invalid faction information field.');
  const next=fieldDisclosure(input);next.mode='selective';
  if(party)next.fields[key].party=Boolean(visible);
  else if(actorId){const actors=new Set(next.fields[key].actors);if(visible)actors.add(actorId);else actors.delete(actorId);next.fields[key].actors=[...actors];}
  else throw Error('Party or Actor disclosure scope required.');
  return next;
}
/** Compatible with v0.1/v0.2.1. Historical mutable state is kept temporarily for migration only. */
export function upgradeFaction(input){
  const f=structuredClone(input);
  // A deity's source omits the group track; it gets an internal, never-scored copy of its own ladder.
  if(isDeity(f)&&!f.renown_track&&f.individual_track?.id)f.renown_track=unusedGroupTrack(f.individual_track);
  if(!f?.id||!f?.renown_track?.id)throw Error('Unrecognized faction record.');
  const fresh=makeFaction({id:f.id,trackId:f.renown_track.id,name:f.name,leader:f.leader,public_role:f.public_role});
  f.provenance=provenance(f.provenance,'Legacy faction import');
  f.refs=(f.refs??[]).map(r=>r.relation?{relation:r.relation,target_id:r.target_id,mode:r.mode??'optional'}:{relation:r.relation_type??'related_to',target_id:r.target_id,mode:'optional'});
  f.individual_track??=fresh.individual_track;
  for(const track of [f.renown_track,f.individual_track]){
    track.provenance=provenance(track.provenance,'Legacy Renown track');
    track.refs=(track.refs??fresh.individual_track.refs).map(r=>r.relation?{relation:r.relation,target_id:r.target_id,mode:r.mode??'required'}:{relation:r.relation_type??'for_faction',target_id:r.target_id,mode:'required'});
    track.milestones??=fresh.individual_track.milestones;
    track.milestones.forEach((m,i)=>{m.key??=`milestone_${i+1}`;m.selection_mode??='all';});track.version=SCHEMA_VERSION;
  }
  f.rewards??=[];f.rewards.forEach(r=>{r.key??=keyFor(r.id);r.behavior??='one_time';r.teaser??=r.name;r.tags??=[];r.usage_limit??=0;});
  f.folder_key??='';f.tags??=[];f.entries??=[];f.discovery??={party:false,actors:[],placeholder:false,sharing_enabled:true};
  f.discovery={party:false,actors:[],placeholder:false,sharing_enabled:true,...f.discovery};
  f.discovery.actors??=[];f.version=SCHEMA_VERSION;
  if(isDeity(f)){f.leader??='';f.public_role??='';f.folder_key='';f.deity=deityProfile(f.deity);}
  return f;
}
/** Reusable definition projection: never serialize any mutable discovery or Renown state. */
export function sourceDefinition(input){
  assertNoUnclassifiedLegacyRefKeys(input);
  const f=upgradeFaction(input);delete f.state;delete f.field_reveals;
  f.discovery={placeholder:Boolean(f.discovery.placeholder),sharing_enabled:f.discovery.sharing_enabled!==false};
  f.entries=f.entries.map(e=>{const a=structuredClone(e);delete a.discovered_party;delete a.discovered_actors;if(a.uuid==null)delete a.uuid;return a;});
  // Legacy UI-only Foundry document type is derivable from its typed UUID.
  // It is NOT an approved reusable reward source field.
  f.rewards=f.rewards.map(r=>{const a=structuredClone(r);delete a.document_type;return a;});
  // Deities export only their own fields: no leader/description, folders or group track.
  if(isDeity(f)){delete f.leader;delete f.public_role;delete f.folder_key;delete f.renown_track;}
  // Fail closed on every unclassified key (including nested reward claims).
  // Known legacy disclosure is stripped above; arbitrary extras are never silently dropped.
  return assertReusableFactionSource(f);
}
/** Overlay campaign-scoped discoveries without changing reusable definition identities. */
export function overlayCampaign(input,state){
  const f=upgradeFaction(input);f.discovery.party=Boolean(state?.discovery?.party??f.discovery.party);
  f.discovery.actors=[...(state?.discovery?.actors??f.discovery.actors??[])];
  f.field_reveals=fieldDisclosure(state?.field_reveals);
  for(const e of f.entries){const k=state?.knowledge?.[e.id];e.discovered_party=Boolean(k?.party??e.discovered_party);e.discovered_actors=[...(k?.actors??e.discovered_actors??[])];}
  return f;
}
export function extractCampaignDiscovery(input){
  const f=upgradeFaction(input),knowledge={};for(const e of f.entries)knowledge[e.id]={party:Boolean(e.discovered_party),actors:[...(e.discovered_actors??[])]};
  return {discovery:{party:Boolean(f.discovery.party),actors:[...f.discovery.actors]},knowledge,field_reveals:assertPrivateFieldReveals(fieldDisclosure(f.field_reveals))};
}
export function validateStanding(s){
  if(!s||!Number.isSafeInteger(s.opening_score)||s.opening_score<0||!Number.isSafeInteger(s.score)||s.score<0||!Array.isArray(s.events))return ['Invalid Renown standing.'];
  const e=[],seen=new Set();let current=s.opening_score;
  s.events.forEach((v,i)=>{if(!v.id||seen.has(v.id))e.push('Duplicate or absent event ID.');seen.add(v.id);if(v.sequence!==i+1)e.push('Event order error.');if(!Number.isSafeInteger(v.delta)||v.delta===0)e.push('Invalid event delta.');if(!v.reason?.trim())e.push('Event reason required.');if(v.previous_score!==current)e.push('Incorrect event previous_score.');current=Math.max(0,current+v.delta);if(v.score_after!==current)e.push('Incorrect event score_after.');});
  if(current!==s.score)e.push('Score does not match event history.');return e;
}
export function validateFaction(raw){let f;try{f=upgradeFaction(raw)}catch(e){return [e.message]};const errors=[];
  if(isDeity(f)){if(!f.name?.trim())errors.push('Deity name required.');errors.push(...validateDeityParts(f));}
  else if(!/^FACTION-[A-Z0-9-]+$/.test(f.id)||f.entity_type!=='Faction'||!f.name?.trim())errors.push('Faction identity invalid.');
  if(!Array.isArray(f.refs)||!Array.isArray(f.provenance?.sources))errors.push('Invalid shared metadata.');
  for(const track of [f.renown_track,f.individual_track]){
    if(!/^RENOWN-[A-Z0-9-]+$/.test(track.id))errors.push('Invalid Renown track ID.');
    if(track.milestones.length!==5)errors.push('Exactly five milestone rows required.');let prev=-1;
    track.milestones.forEach((m,i)=>{if(!m.name?.trim()||!Number.isSafeInteger(m.threshold)||m.threshold<=prev||(i===0&&m.threshold!==0))errors.push('Invalid milestone thresholds.');prev=m.threshold;if(!['all','choose_one'].includes(m.selection_mode))errors.push('Invalid milestone selection mode.');});
  }
  if(f.state?.party)errors.push(...validateStanding(f.state.party));
  if(!Array.isArray(f.tags)||!Array.isArray(f.entries)||!Array.isArray(f.discovery.actors))errors.push('Invalid metadata collections.');
  const seen=new Set(),mids=new Set([...f.renown_track.milestones,...f.individual_track.milestones].map(m=>m.id));
  for(const r of f.rewards){if(!r.id||seen.has(r.id))errors.push('Duplicate reward ID.');seen.add(r.id);if(!mids.has(r.milestone_id)||!['group','individual'].includes(r.audience))errors.push('Invalid reward milestone.');if(!r.name?.trim()||!['custom','uuid'].includes(r.kind)||!REWARD_BEHAVIORS.includes(r.behavior))errors.push('Invalid reward type or behavior.');if(r.kind==='uuid'&&!r.uuid)errors.push('Linked reward requires a document.');if(!Array.isArray(r.tags)||!Number.isSafeInteger(r.usage_limit)||r.usage_limit<0)errors.push('Invalid reward tags or usage limit.');}
  const eids=new Set();for(const entry of f.entries){if(!entry.id||eids.has(entry.id))errors.push('Duplicate information entry ID.');eids.add(entry.id);if(!entry.name?.trim()||!['manual','group_renown','individual_renown'].includes(entry.unlock)||!['preview','document'].includes(entry.link_mode))errors.push('Invalid information entry.');}
  errors.push(...checkObjectiveRefs(f));
  return errors;
}
export const progressFor=(track,score)=>{const index=track.milestones.reduce((i,m,k)=>score>=m.threshold?k:i,0),next=track.milestones[index+1]??null;return{score,index,rank:track.milestones[index],next,remaining:next?Math.max(0,next.threshold-score):0,percent:next?Math.round(100*(score-track.milestones[index].threshold)/(next.threshold-track.milestones[index].threshold)):100};};
export const getProgress=(f,standing=null)=>progressFor(upgradeFaction(f).renown_track,standing?.score??f.state?.party?.score??0);
export function adjustStanding(old,{delta,reason,eventId,when,dedupeKey=null}){const errors=validateStanding(old);if(errors.length)throw Error(errors.join(' '));if(!Number.isSafeInteger(delta)||delta===0||Math.abs(delta)>1000)throw Error('Delta must be nonzero between -1000 and 1000.');if(!reason?.trim()||reason.trim().length>400)throw Error('Reason required, 400 characters maximum.');if(!/^RENOWN-EVT-[A-Z0-9-]+$/.test(eventId??''))throw Error('Invalid event ID.');if(dedupeKey&&old.events.some(e=>e.dedupe_key===dedupeKey))return{standing:old,applied:false,before:old.score,after:old.score};const before=old.score,after=Math.max(0,before+delta);if(before===after)return{standing:old,applied:false,before,after};const standing=structuredClone(old);standing.score=after;standing.events.push({id:eventId,sequence:standing.events.length+1,delta:after-before,reason:reason.trim(),occurred_at:when,dedupe_key:dedupeKey,previous_score:before,score_after:after});if(validateStanding(standing).length)throw Error('Invalid history state.');return{standing,applied:true,before,after};}
export function applyRenown(f,args){const faction=upgradeFaction(f);const outcome=adjustStanding(faction.state?.party??blankStanding(),args);faction.state??={};faction.state.party=outcome.standing;return{...outcome,faction,crossed:faction.renown_track.milestones.filter(m=>outcome.before<m.threshold&&outcome.after>=m.threshold)};}
export function makeGroupRecord({factionId,standing=blankStanding()}){return{id:`${factionId}-GROUP`,entity_type:'CampaignState',scope:'campaign_state',version:SCHEMA_VERSION,faction_id:factionId,standing,claims:{},requests:{},uses:{},choices:{}};}
export function makePersonalRecord({factionId,actorId}){return{id:`${factionId}-ACTOR-${keyFor(actorId)}`,entity_type:'CampaignState',scope:'campaign_state',version:SCHEMA_VERSION,faction_id:factionId,actor_id:actorId,standing:blankStanding(),claims:{},requests:{},uses:{},choices:{}};}
export function rewardUnlocked(reward,faction,score){const f=upgradeFaction(faction),track=reward.audience==='group'?f.renown_track:f.individual_track;const m=track.milestones.find(x=>x.id===reward.milestone_id);return Boolean(m&&score>=m.threshold);}
export function claimEligible({reward,faction,score,claims={},requests={},uses={}}){
  if(!rewardUnlocked(reward,faction,score)||reward.behavior==='passive')return false;
  const status=claims?.[reward.id]?.status;
  if(reward.behavior==='one_time'&&['pending','approved','claimed'].includes(status))return false;
  if(reward.behavior==='repeatable_service'){
    if(Object.values(requests).some(r=>r.reward_id===reward.id&&['requested','approved'].includes(r.status)))return false;
    if(reward.usage_limit&&((uses[reward.id]?.consumed??0)>=reward.usage_limit))return false;
  }
  return true;
}
export function chooseOneEligible({faction,reward,claims={},choices={}}){
  const f=upgradeFaction(faction),track=reward.audience==='group'?f.renown_track:f.individual_track;
  const milestone=track.milestones.find(m=>m.id===reward.milestone_id);
  if(!milestone||milestone.selection_mode!=='choose_one')return true;
  if(Object.prototype.hasOwnProperty.call(choices,milestone.id))return choices[milestone.id]===null||choices[milestone.id]===reward.id;
  return !Object.values(claims).some(c=>c.milestone_id===milestone.id&&c.reward_id!==reward.id&&['approved','claimed','fulfilled'].includes(c.status));
}
export function discoverable({discovery,actorIds=[]}){return Boolean(discovery?.party||actorIds.some(id=>discovery?.actors?.includes(id)));}
export function projectedFolders({folders,factions,actorIds=[],gm=false}){
  const effective=[...folders,{key:'',name:'Other Factions'}].map(folder=>{
    const members=factions.filter(f=>(f.folder_key||'')===folder.key);
    const shown=members.filter(f=>gm||discoverable({discovery:f.discovery,actorIds}));
    const placeholders=gm?[]:members.filter(f=>!discoverable({discovery:f.discovery,actorIds})&&f.discovery.placeholder).map(()=>({unknown:true,name:'Undiscovered Faction'}));
    return {key:folder.key,name:gm||shown.length?folder.name:'Unknown Organization',known:shown,unknown:placeholders,show:gm?true:shown.length+placeholders.length>0,hasKnown:Boolean(shown.length)};
  });return effective.filter(f=>f.show);
}
export function milestoneProjection({faction,scope,score,claims={},requests={},uses={},choices={},gm=false}){
  const f=upgradeFaction(faction),track=scope==='group'?f.renown_track:f.individual_track;
  return track.milestones.map((m,i)=>({...m,order:i+1,unlocked:score>=m.threshold,benefit:gm||score>=m.threshold?m.benefit:'',
    rewards:f.rewards.filter(r=>r.audience===scope&&r.milestone_id===m.id).map(r=>{
      const unlocked=score>=m.threshold,full=gm||unlocked;
      const activeRequest=Object.values(requests).find(q=>q.reward_id===r.id&&['requested','approved'].includes(q.status));
      const safe={...r,description:full?r.description??'':r.teaser??'',uuid:full?r.uuid:null,canView:full&&r.kind==='uuid',unlocked,locked:!unlocked};
      safe.canClaim=unlocked&&claimEligible({reward:r,faction:f,score,claims,requests,uses})&&chooseOneEligible({faction:f,reward:r,claims,choices});
      safe.passive=r.behavior==='passive';safe.repeatable=r.behavior==='repeatable_service';
      safe.isClaimed=claims[r.id]?.status==='claimed';safe.isPending=claims[r.id]?.status==='pending'||activeRequest?.status==='requested';
      safe.isApproved=claims[r.id]?.status==='approved'||activeRequest?.status==='approved';
      safe.isDenied=claims[r.id]?.status==='denied';safe.usesLeft=r.usage_limit?Math.max(0,r.usage_limit-(uses[r.id]?.consumed??0)):null;
      return safe;
    })
  }));
}
export function grantAutoKnowledge(f,scope,actorId,score){const next=upgradeFaction(f),changed=[];for(const item of next.entries){if(item.unlock!==(scope==='group'?'group_renown':'individual_renown')||score<(item.threshold??0))continue;item.discovered_party??=false;item.discovered_actors??=[];if(scope==='group'&&!item.discovered_party){item.discovered_party=true;changed.push(item.id);}else if(scope==='individual'&&actorId&&!item.discovered_actors.includes(actorId)){item.discovered_actors.push(actorId);changed.push(item.id);}}return{faction:next,changed};}
export function secureEntryPreview(item,{actorIds=[],isGM=false}){if(isGM||item.discovered_party||actorIds.some(id=>item.discovered_actors?.includes(id)))return{id:item.id,name:item.name,text:item.text??'',uuid:item.link_mode==='document'?item.uuid??null:null,link_mode:item.link_mode,discovered:true};return null;}
