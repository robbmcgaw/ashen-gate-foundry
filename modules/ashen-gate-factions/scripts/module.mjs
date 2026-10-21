/** Renown (formerly Factions & Renown; id unchanged). Originally v0.6.0 Beta; Foundry V14 target. No mandatory companion module. */
import {MODULE_ID,SCHEMA_VERSION,RECOVERED_GUILDS_DRAFT,makeFaction,upgradeFaction,groupStateDefaults,sourceDefinition,validateFaction,blankStanding,adjustStanding,progressFor,milestoneProjection,discoverable,projectedFolders,grantAutoKnowledge,secureEntryPreview,claimEligible,chooseOneEligible,rewardUnlocked,makeGroupRecord,makePersonalRecord,keyFor,overlayCampaign,extractCampaignDiscovery,fieldDisclosure,disclosedField,revealField,FIELD_KEYS} from './core.mjs';
import {confirmDialog,formDialog,promptText,infoDialog,esc,checklistDialog} from './ag-dialogs.mjs';
import {launcherRoot,mountLauncher} from './ag-launchers.mjs';
import {addObjectiveRef,removeObjectiveRef,objectiveRefs,auditObjectiveRefs} from './objective-refs.mjs';
import {planImport,runImport,IMPORT_SCHEMA} from './import.mjs';
import {isDeity,makeDeity,deityProfile,deityCard,visibleRelations,pantheonRows,DEITY_TEXT_KEYS,DEITY_TIERS,RESONANCE_NEUTRAL,DAMPING_DEFAULT,DAMPING_MAX,validResonance,validDamping,relationLabel,resonancePreview,knockOns,visibleHistory} from './deity.mjs';
import {visibilityChip,chipBadge,orgRow,listOrgsTab,CHIPS as ORG_CHIPS,SORTS as ORG_SORTS,GROUPS as ORG_GROUPS,DEFAULT_VIEW as ORG_VIEW} from './orgs-tab.mjs';
import {standingView,markCurrent} from './standing-view.mjs';
import {windowSize} from './ag-html.mjs';
import {readDrop,resolveItemDrop,itemIdOf,worldItemById,grantBundle,bundleOf} from './ag-item-drop.mjs';
const {ApplicationV2,HandlebarsApplicationMixin}=foundry.applications.api;
const OBS=CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,NONE=CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,OWNER=CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
const rid=()=>foundry.utils.randomID(24).toUpperCase().replace(/[^A-Z0-9]/g,'');
const idPair=()=>{const x=rid();return{id:`FACTION-${x}`,trackId:`RENOWN-${x}`};};
const deityIdPair=()=>{const x=rid();return{id:`DEITY-${x}`,trackId:`RENOWN-${x}`};};
const assertGM=()=>{if(!game.user?.isGM)throw Error('GM authorization required.');};
// DEC-0072 — the Factions module owns its own world-scoped UI access switch.
// Default true preserves the previous player-facing behavior for upgraded worlds.
const PLAYER_ACCESS_CONTRACT='ag-player-access/1';
const playerAccessEnabled=()=>game.settings.get(MODULE_ID,'playerAccessEnabled')===true;
const playerMayOpen=()=>Boolean(game.user?.isGM||playerAccessEnabled());
function requirePlayerAccess(){
  if(!playerMayOpen())throw Error('Renown is hidden from players. Ask your GM to enable Player Access.');
}
const playerAccessState=()=>({contract:PLAYER_ACCESS_CONTRACT,moduleId:MODULE_ID,audience:'player',playerAccessEnabled:playerAccessEnabled(),configurable:true});
async function setPlayerAccess(enabled){
  assertGM();
  if(typeof enabled!=='boolean')throw TypeError('Player Access requires a Boolean value.');
  await game.settings.set(MODULE_ID,'playerAccessEnabled',enabled);
  await applyPlayerAccess(enabled);
  return playerAccessState();
}

const SOCKET=`module.${MODULE_ID}`;
const pendingReplies=new Map();
const getFaction=d=>d?.getFlag(MODULE_ID,'faction');
const getGroup=d=>d?.getFlag(MODULE_ID,'groupClaims');
const getPersonal=d=>d?.getFlag(MODULE_ID,'individual');
const getView=d=>d?.getFlag(MODULE_ID,'playerView');
const getFolders=d=>d?.getFlag(MODULE_ID,'folderIndex');
// Foundry's Journal folder is storage organization only, independent from the in-dashboard faction folders.
// Do not set player visibility on the Folder. Journal ownership controls actual document access.
const STORAGE_FOLDER_NAME='Ashen Gate — Factions Data';
const isModuleJournal=d=>Boolean(getFaction(d)||getGroup(d)||getPersonal(d)||getView(d)||getFolders(d));
async function ensureStorageFolder(){
  assertGM();
  let folder=game.folders.find(d=>d.type==='JournalEntry'&&d.getFlag(MODULE_ID,'storageFolder')===true);
  if(folder)return folder;
  folder=await Folder.create({name:STORAGE_FOLDER_NAME,type:'JournalEntry',sorting:'a',flags:{[MODULE_ID]:{storageFolder:true}}});
  if(!folder)throw Error('Could not create faction storage folder.');
  return folder;
}
async function organizeModuleJournals(){
  assertGM();
  const folder=await ensureStorageFolder();
  const updates=game.journal.filter(isModuleJournal).filter(d=>d.folder?.id!==folder.id&&d.folder!==folder.id).map(d=>({_id:d.id,folder:folder.id}));
  if(updates.length)await JournalEntry.updateDocuments(updates);
  return updates.length;
}

const defs=()=>game.journal.filter(d=>getFaction(d));
// Deities share the faction storage and machinery; the faction views and APIs list factions only.
const factionDefs=()=>defs().filter(d=>!isDeity(getFaction(d)));
const deityDefs=()=>defs().filter(d=>isDeity(getFaction(d)));
const definition=id=>defs().find(d=>getFaction(d)?.id===id);
const groupDoc=id=>game.journal.find(d=>getGroup(d)?.faction_id===id);
const loadDef=d=>d?overlayCampaign(getFaction(d),getGroup(groupDoc(getFaction(d)?.id))):null;
const personalDoc=(id,actor)=>game.journal.find(d=>{const s=getPersonal(d);return s?.faction_id===id&&s?.actor_id===actor;});
const activeGM=()=>game.users.find(u=>u.active&&u.isGM);
const canActor=(user,actor)=>Boolean(user?.isGM||actor?.testUserPermission(user,OWNER));
const assignedActors=()=>game.actors.filter(a=>a.type==='character'&&game.users.some(u=>!u.isGM&&(u.character?.id===a.id||a.testUserPermission(u,OWNER))));
const accessibleActors=(user=game.user)=>assignedActors().filter(a=>canActor(user,a)).sort((a,b)=>a.name.localeCompare(b.name));
const ownedActorIds=user=>accessibleActors(user).map(a=>a.id);
// Former UI document_type is not part of approved reusable reward source.
// Infer Item identity from the canonical Foundry UUID without widening source data.
const linkedItem=r=>r?.kind==='uuid'&&(r?.document_type==='Item'||String(r?.uuid??'').split('.').at(-2)==='Item');
const groupLabel=()=>game.settings.get(MODULE_ID,'groupNameEnabled')&&game.settings.get(MODULE_ID,'groupName')?.trim()?`${game.settings.get(MODULE_ID,'groupName').trim()} Renown`:'Group Renown';
const moduleVersion=()=>game.modules?.get?.(MODULE_ID)?.version??'';
const notifyError=e=>{console.error(`[${MODULE_ID}]`,e);ui.notifications?.error(`Renown: ${e.message??e}`);};
const nameValue=(root,key)=>String(root.querySelector(`[name="${key}"]`)?.value??'').trim();
const selectedValue=(root,key)=>String(root.querySelector(`[name="${key}"]`)?.value??'');
const jsonDownload=(data,file)=>{const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download=file;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);};
async function saveDef(doc,record){
  assertGM();const clean=sourceDefinition(record),f=upgradeFaction(record),faults=validateFaction(clean);
  if(faults.length)throw Error(faults.join(' '));
  const campaign=extractCampaignDiscovery(f),group=await ensureGroup(doc),state=structuredClone(getGroup(group));
  state.discovery=campaign.discovery;state.knowledge=campaign.knowledge;state.field_reveals=campaign.field_reveals;
  // Maintain mutable discovery only in the faction-owned campaign record.
  await group.setFlag(MODULE_ID,'groupClaims',state);
  await doc.update({name:clean.name,[`flags.${MODULE_ID}.faction`]:clean});
  return clean;
}
async function ensureGroup(doc){assertGM();const id=getFaction(doc).id;let target=groupDoc(id);if(target)return target;return JournalEntry.create({name:`Faction State • ${getFaction(doc).name} (Group)`,folder:(await ensureStorageFolder()).id,ownership:{default:NONE},flags:{[MODULE_ID]:{groupClaims:makeGroupRecord({factionId:id,standing:getFaction(doc)?.state?.party??blankStanding()})}}});}
async function ensurePersonal(doc,actor){assertGM();let target=personalDoc(getFaction(doc).id,actor.id);if(target)return target;return JournalEntry.create({name:`Faction State • ${actor.name} / ${getFaction(doc).name}`,folder:(await ensureStorageFolder()).id,ownership:{default:NONE},flags:{[MODULE_ID]:{individual:makePersonalRecord({factionId:getFaction(doc).id,actorId:actor.id})}}});}
async function folderRecord(){assertGM();let doc=game.journal.find(d=>getFolders(d));if(!doc)doc=await JournalEntry.create({name:'Factions • GM Folder Catalog',folder:(await ensureStorageFolder()).id,ownership:{default:NONE},flags:{[MODULE_ID]:{folderIndex:{version:SCHEMA_VERSION,folders:[]}}}});return doc;}
const folderList=()=>game.journal.find(d=>getFolders(d))?.getFlag(MODULE_ID,'folderIndex')?.folders??[];
const userViewDoc=user=>game.journal.find(d=>getView(d)?.user_id===user.id);
async function ensureView(user){assertGM();if(user.isGM)throw Error('Only players receive filtered views.');let doc=userViewDoc(user);if(doc)return doc;const secret=rid()+rid();return JournalEntry.create({name:`Factions • Player View • ${user.name}`,folder:(await ensureStorageFolder()).id,ownership:{default:NONE,[user.id]:OBS},flags:{[MODULE_ID]:{playerView:{user_id:user.id,capability:secret,payload:{folders:[],factions:[]}}}}});}
function nativeReadableUuid(uuid,user){
  if(!uuid||typeof uuid!=='string')return false;
  if(user?.isGM)return true;
  const collections=[game.items,game.journal,game.actors,game.tables];
  for(const coll of collections){if(!coll)continue;const d=coll.find?.(d=>d.uuid===uuid);
    if(d)return Boolean(d.testUserPermission?.(user,OBS));
  }
  // Compendiums/embedded documents need explicit Foundry permission checks on open;
  // do not copy their UUID into a player-accessible Journal speculatively.
  return false;
}
function grantedItemUuid(claim,user,actorIds){
  const actorId=claim?.delivered_to;
  if(!claim?.request_id||!actorIds?.includes(actorId))return null;
  const actor=game.actors.get(actorId);
  if(!actor||!canActor(user,actor))return null;
  return actor.items?.find?.(item=>item.getFlag?.(MODULE_ID,'claimId')===claim.request_id)?.uuid??null;
}
function scrubMilestones(milestones,user,claims={},actorIds=[]){return milestones.map(m=>({...m,rewards:(m.rewards??[]).map(r=>{
  const grantedUuid=grantedItemUuid(claims[r.id],user,actorIds);
  // Player payloads carry no permanent item ids or reward pictures (0.14.0).
  const {item_id,img,...rest}=r,safe={...rest,grantedUuid,canViewGranted:Boolean(grantedUuid)};
  if(!r.uuid||nativeReadableUuid(r.uuid,user))return safe;
  return {...safe,uuid:null,canView:false,documentAccessRequired:true};
})}));}
function maskedFaction(f,group,personals,actorIds,user){
  const owned=actorIds.filter(id=>f.discovery.party||f.discovery.actors.includes(id));
  const personal=Object.fromEntries(owned.map(actorId=>{const s=personals.get(actorId)??{standing:blankStanding(),claims:{},requests:{},uses:{},choices:{}};return[actorId,{score:s.standing.score,history:s.standing.events,claims:s.claims,requests:s.requests,uses:s.uses,choices:s.choices,milestones:scrubMilestones(milestoneProjection({faction:f,scope:'individual',score:s.standing.score,claims:s.claims,requests:s.requests,uses:s.uses,choices:s.choices}),user,s.claims,actorIds)}];}));
  const info=f.entries.map(e=>secureEntryPreview(e,{actorIds})).filter(Boolean).map(e=>e.uuid&&!nativeReadableUuid(e.uuid,user)?{...e,uuid:null,documentAccessRequired:true}:e);
  const membership=Boolean(f.discovery.party||owned.length);
  if(!membership)return null;
  const groupStanding=group?.standing??blankStanding(),claims=group?.claims??{},uses=group?.uses??{};
  return{id:f.id,name:disclosedField(f,'name',actorIds,f.field_reveals)||'Unknown Organization',leader:disclosedField(f,'leader',actorIds,f.field_reveals),public_role:disclosedField(f,'public_role',actorIds,f.field_reveals),tags:[],folder_key:f.folder_key,canShare:!f.discovery.party&&f.discovery.sharing_enabled&&owned.length>0,
    group:{score:groupStanding.score,history:groupStanding.events,claims,uses,choices:group?.choices??{}},personal,entries:info,
    groupTrack:{milestones:scrubMilestones(milestoneProjection({faction:f,scope:'group',score:groupStanding.score,claims,requests:group?.requests??{},uses,choices:group?.choices??{}}),user,claims,actorIds)},
    individualTrack:{milestones:f.individual_track.milestones.map(m=>({id:m.id,name:m.name,threshold:m.threshold,selection_mode:m.selection_mode}))}};
}
const pantheonDamping=()=>{const v=Number(game.settings.get(MODULE_ID,'pantheonDamping'));return validDamping(v)?v:DAMPING_DEFAULT;};
/** GM-only write of one character's favour with one deity. `link` marks knock-ons ({caused_by, source_deity}) and
 * undo entries ({reverses, source_deity}) on the new history entry. Never spreads to other deities. */
async function writeFavour(deityId,actor,delta,reason,link={}){
  assertGM();const doc=definition(deityId),f=doc&&loadDef(doc);if(!isDeity(f))throw Error('Deity not found.');
  const stateDoc=await ensurePersonal(doc,actor),state=structuredClone(getPersonal(stateDoc));
  const result=adjustStanding(state.standing,{delta,reason:String(reason).slice(0,400),eventId:`RENOWN-EVT-${rid()}`,when:new Date().toISOString()});
  if(!result.applied)return result;
  Object.assign(result.standing.events.at(-1),link);state.standing=result.standing;await stateDoc.setFlag(MODULE_ID,'individual',state);
  const learned=grantAutoKnowledge(f,'individual',actor.id,result.standing.score);if(learned.changed.length)await saveDef(doc,learned.faction);
  return result;
}
/** One player's view of one deity: card, relations to deities they can see, and standing for each of their characters
 * that knows the deity. Per-character only: there is no group score. Null when none of their characters knows it. */
function maskedDeity(f,personals,actorIds,user,visibleNames){
  const owned=actorIds.filter(id=>f.discovery.party||f.discovery.actors.includes(id));
  if(!f.discovery.party&&!owned.length)return null;
  const personal=Object.fromEntries(owned.map(actorId=>{const s=personals.get(actorId)??{standing:blankStanding(),claims:{},requests:{},uses:{},choices:{}},p=progressFor(f.individual_track,s.standing.score);
    return[actorId,{score:s.standing.score,rank:p.rank.name,next:p.next?{name:p.next.name,threshold:p.next.threshold}:null,remaining:p.remaining,percent:p.percent,history:visibleHistory(s.standing.events,visibleNames),claims:s.claims,requests:s.requests,uses:s.uses,choices:s.choices,
      milestones:scrubMilestones(milestoneProjection({faction:f,scope:'individual',score:s.standing.score,claims:s.claims,requests:s.requests,uses:s.uses,choices:s.choices}),user,s.claims,actorIds)}];}));
  const entries=f.entries.map(e=>secureEntryPreview(e,{actorIds})).filter(Boolean).map(e=>e.uuid&&!nativeReadableUuid(e.uuid,user)?{...e,uuid:null,documentAccessRequired:true}:e);
  return{...deityCard(f),kind:'deity',canShare:!f.discovery.party&&f.discovery.sharing_enabled&&owned.length>0,relations:visibleRelations(f,visibleNames),personal,entries,
    ladder:f.individual_track.milestones.map(m=>({id:m.id,name:m.name,threshold:m.threshold,selection_mode:m.selection_mode}))};
}
function buildDeityPayload(user,actorIds){
  const all=deityDefs().map(d=>loadDef(d)),seen=all.filter(f=>discoverable({discovery:f.discovery,actorIds}));
  const names=new Map(seen.map(f=>[f.id,f.name]));
  return seen.map(f=>{
    const people=new Map(game.journal.filter(d=>getPersonal(d)?.faction_id===f.id).map(d=>[getPersonal(d).actor_id,getPersonal(d)]));
    return maskedDeity(f,people,actorIds,user,names);
  }).filter(Boolean);
}
function buildPlayerPayload(user){
  const factions=factionDefs().map(d=>loadDef(d)),actorIds=ownedActorIds(user),groups=new Map(game.journal.filter(d=>getGroup(d)).map(d=>[getGroup(d).faction_id,getGroup(d)]));
  const visibleFactions=factions.map(f=>{
    const people=new Map(game.journal.filter(d=>getPersonal(d)?.faction_id===f.id).map(d=>[getPersonal(d).actor_id,getPersonal(d)]));
    return maskedFaction(f,groups.get(f.id),people,actorIds,user);
  }).filter(Boolean);
  const safeLabels=new Map(visibleFactions.map(f=>[f.id,f.name]));
  const shown=projectedFolders({folders:folderList(),factions,actorIds}).map(folder=>({key:folder.key,
    name:folder.known.some(f=>safeLabels.get(f.id)!=='Unknown Organization')?folder.name:'Unknown Organization',
    known:folder.known.map(f=>f.id),unknown_count:folder.unknown.length}));
  return{version:SCHEMA_VERSION,groupLabel:groupLabel(),folders:shown,factions:visibleFactions,deities:buildDeityPayload(user,actorIds)};
}
async function projectAll(){assertGM();if(activeGM()?.id!==game.user.id)return;for(const user of game.users.filter(u=>!u.isGM)){const doc=await ensureView(user),record=structuredClone(getView(doc));record.payload=buildPlayerPayload(user);const ownership={default:NONE,[user.id]:OBS};await doc.update({ownership,[`flags.${MODULE_ID}.playerView`]:record});}
  game.socket.emit(`module.${MODULE_ID}`,{type:'refresh'});
}
let projecting=false;
async function reproject(){if(!game.user.isGM||activeGM()?.id!==game.user.id||projecting)return;projecting=true;try{await projectAll()}catch(e){notifyError(e)}finally{projecting=false;}}
async function migrate(){assertGM();await folderRecord();for(const doc of defs()){
  const original=getFaction(doc),legacy=Boolean(original?.state?.party||!original?.discovery);
  let f=upgradeFaction(original);if(legacy&&doc.ownership.default>=OBS)f.discovery.party=true;
  const group=await ensureGroup(doc),{state,changed}=groupStateDefaults(getGroup(group),original.state?.party);if(changed)await group.setFlag(MODULE_ID,'groupClaims',state);
  if(legacy)await saveDef(doc,f);
  // Definitions and internal state are never player-accessible; projection journals supply filtered data.
  if(doc.ownership.default!==NONE||Object.entries(doc.ownership).some(([u,v])=>u!=='default'&&v!==NONE))await doc.update({ownership:Object.fromEntries([['default',NONE],...Object.keys(doc.ownership).filter(u=>u!=='default').map(u=>[u,NONE])])});
  if(group.ownership.default!==NONE||Object.entries(group.ownership).some(([u,v])=>u!=='default'&&v!==NONE))await group.update({ownership:Object.fromEntries([['default',NONE],...Object.keys(group.ownership).filter(u=>u!=='default').map(u=>[u,NONE])])});
}
  for(const doc of game.journal.filter(d=>getPersonal(d))){if(doc.ownership.default!==NONE||Object.entries(doc.ownership).some(([u,v])=>u!=='default'&&v!==NONE))await doc.update({ownership:Object.fromEntries([['default',NONE],...Object.keys(doc.ownership).filter(u=>u!=='default').map(u=>[u,NONE])])});}
  await projectAll();
  // Move every existing module-owned Journal, including migrated legacy records, without touching unrelated Journals.
  await organizeModuleJournals();
}
async function saveChange(doc,f){
  // A newly authored entry may already meet established Renown thresholds.
  // Knowledge is recorded once and retained if the standing later falls.
  let next=upgradeFaction(f);const group=getGroup(groupDoc(next.id));
  next=grantAutoKnowledge(next,'group',null,group?.standing?.score??0).faction;
  for(const d of game.journal.filter(j=>getPersonal(j)?.faction_id===next.id)){
    const state=getPersonal(d);next=grantAutoKnowledge(next,'individual',state.actor_id,state.standing?.score??0).faction;
  }
  await saveDef(doc,next);await reproject();
}
// GM-only import (additive). Every write goes through runImport's io, whose first call is assertGM.
const importIO=()=>({
  assertGM,
  createFaction:async clean=>{const d=await JournalEntry.create({name:clean.name,folder:(await ensureStorageFolder()).id,ownership:{default:NONE},flags:{[MODULE_ID]:{faction:clean}}});await ensureGroup(d);},
  updateGroup:async(id,fn)=>{const g=groupDoc(id);await g.setFlag(MODULE_ID,'groupClaims',fn(structuredClone(getGroup(g))));},
  updatePersonal:async(id,actor,fn)=>{const d=await ensurePersonal(definition(id),game.actors.get(actor.id));await d.setFlag(MODULE_ID,'individual',fn(structuredClone(getPersonal(d))));},
  findActor:name=>{const a=game.actors.find(a=>a.type==='character'&&a.name===name);return a?{id:a.id,name:a.name}:null;},
  finish:async id=>{const d=definition(id);await saveChange(d,loadDef(d));},
  eventId:()=>`RENOWN-EVT-${rid()}`,
  now:()=>new Date().toISOString()
});
const planFactionsImport=data=>{assertGM();return planImport(data,new Set(defs().map(d=>getFaction(d).id)));};
async function importFactions(data){assertGM();return runImport(planFactionsImport(data),importIO());}
const previewFactionsImport=data=>{const {errors,rows}=planFactionsImport(data);return {errors,rows:rows.map(({id,name,kind,action,reason})=>({id,name,kind,action,reason}))};};
const findKnownUser=(id,user)=>buildPlayerPayload(user).factions.find(x=>x.id===id);
function requestAuthorized(msg){if(!playerAccessEnabled())throw Error('Renown player interface is hidden.');const user=game.users.get(msg.userId),vdoc=user&&userViewDoc(user),v=getView(vdoc);if(!user?.active||user.isGM||!v||v.capability!==msg.capability||!vdoc.testUserPermission(user,OBS))throw Error('Invalid requester authentication.');return user;}
function sendClientAction(message){
  if(!activeGM())throw Error('An online GM is required to process Renown requests.');
  if(!game.socket?.emit)throw Error('Renown socket is unavailable.');
  const requestId=`action_${rid()}`;pendingReplies.set(requestId,{when:Date.now(),type:message.type});
  game.socket.emit(SOCKET,{...message,requestId});
  // Reconnecting/reloading clears pending UI notice, not campaign requests.
  return requestId;
}
function clientReceipt(msg){
  if(msg?.type!=='receipt'||msg.userId!==game.user?.id||!pendingReplies.has(msg.requestId))return;
  pendingReplies.delete(msg.requestId);
  if(msg.ok)ui.notifications.info(msg.message??'Renown action completed.');
  else ui.notifications.error('Renown request was not accepted. Ask the GM to check their notifications.');
}
const inFlight=new Set();
async function incoming(msg){if(!['share','request'].includes(msg?.type)||!game.user.isGM||activeGM()?.id!==game.user.id)return;let accepted=false;const requestLock=[msg?.type,msg?.factionId,msg?.audience,msg?.actorId,msg?.rewardId,msg?.userId].join('/');if(inFlight.has(requestLock))return;inFlight.add(requestLock);try{
  const user=requestAuthorized(msg),fdoc=definition(msg.factionId);if(!fdoc)throw Error('Faction missing.');const f=loadDef(fdoc),actorIds=ownedActorIds(user);if(!discoverable({discovery:f.discovery,actorIds}))throw Error(`${isDeity(f)?'Deity':'Faction'} undiscovered for this player.`);
  if(msg.type==='share'){
    if(!f.discovery.sharing_enabled)throw Error('Faction sharing disabled.');if(f.discovery.party)return;
    f.discovery.party=true;
    // Sharing copies only profile fields this character has actually learned.
    if(f.field_reveals?.mode==='selective')for(const key of FIELD_KEYS){
      const rule=f.field_reveals.fields[key];
      if(actorIds.some(id=>rule.actors.includes(id)))rule.party=true;
    }
    for(const entry of f.entries){if(entry.discovered_actors?.some(a=>actorIds.includes(a)))entry.discovered_party=true;}
    await saveChange(fdoc,f);ui.notifications.info(`${user.name} shared ${f.name} with the party.`);accepted=true;return;
  }
  if(msg.type!=='request')return;
  const audience=msg.audience,actor=audience==='individual'?game.actors.get(msg.actorId):null;
  if(!['group','individual'].includes(audience)||audience==='individual'&&(!actor||!canActor(user,actor)))throw Error('Invalid character or scope.');
  if(isDeity(f)&&audience!=='individual')throw Error('Deity rewards are per character.');
  if(audience==='individual'&&!f.discovery.party&&!f.discovery.actors.includes(actor.id))throw Error('Character has not discovered the faction.');
  const reward=f.rewards.find(r=>r.id===msg.rewardId&&r.audience===audience);if(!reward)throw Error('Reward not found.');
  const stateDoc=audience==='group'?await ensureGroup(fdoc):await ensurePersonal(fdoc,actor),key=audience==='group'?'groupClaims':'individual',state=structuredClone(stateDoc.getFlag(MODULE_ID,key));
  const score=state.standing.score;
  if(!claimEligible({reward,faction:f,score,claims:state.claims,requests:state.requests,uses:state.uses})||!chooseOneEligible({faction:f,reward,claims:state.claims,choices:state.choices}))throw Error('Reward not available for request.');
  state.requests??={};state.uses??={};state.claims??={};state.choices??={};
  if(reward.behavior==='repeatable_service'){
    if(Object.values(state.requests).some(r=>r.reward_id===reward.id&&['requested','approved'].includes(r.status)))return;
    const key=`req_${keyFor(rid())}`;state.requests[key]={key,reward_id:reward.id,milestone_id:reward.milestone_id,status:'requested',requested_by:user.id,usage_charged:false,requested_at:new Date().toISOString()};
  }else{
    if(state.claims[reward.id]&&['pending','approved','claimed'].includes(state.claims[reward.id].status))return;
    state.claims[reward.id]={request_id:`AGF-CLAIM-${rid()}`,status:'pending',reward_id:reward.id,milestone_id:reward.milestone_id,requester_id:user.id,requested_at:new Date().toISOString()};
  }
  await stateDoc.setFlag(MODULE_ID,key,state);await reproject();ui.notifications.info(`${user.name} requested ${reward.name}.`);accepted=true;
}catch(e){notifyError(e)}finally{inFlight.delete(requestLock);if(msg?.requestId&&msg?.userId)game.socket?.emit(SOCKET,{type:'receipt',userId:msg.userId,requestId:msg.requestId,ok:accepted,message:msg.type==='share'?'Discovery shared with party.':'Renown request received by GM.'});}}
/* ---- 0.14.0: item rewards follow the shared item-drop standard (ag-item-drop/1). ---- */
const HOLDING_FOLDER_NAME='Ashen Gate Rewards (Renown)';
const missingItemText=reward=>`The reward item is missing (${reward.name}). Fix the reward, then approve again.`;
async function loadDoc(uuid){if(typeof uuid!=='string'||!uuid)return null;try{return (await fromUuid(uuid))??null;}catch{return null;}}
// An item reward points at an Item uuid or carries a permanent id. Older rewards may link a Journal: those grant nothing.
const isItemReward=r=>r?.kind==='uuid'&&(linkedItem(r)||Boolean(r.item_id));
/** The Item behind a reward: the permanent id first, then the uuid. Null when neither resolves to an Item. */
async function rewardSource(reward){
  const byId=worldItemById(reward?.item_id);if(byId)return byId;
  const doc=await loadDoc(reward?.uuid);return doc?.documentName==='Item'?doc:null;
}
/** What the reward editor shows for one reward: picture, permanent id, and whether the item is missing. */
async function rewardLook(reward){
  if(reward?.kind!=='uuid')return {isItemReward:false};
  const source=await rewardSource(reward);
  if(!source&&!isItemReward(reward)&&await loadDoc(reward.uuid))return {isItemReward:false};
  return {isItemReward:true,rowImg:reward.img||source?.img||null,rowItemId:reward.item_id??null,rowMissing:!source};
}
async function rewardLooks(rewards=[]){return new Map(await Promise.all(rewards.map(async r=>[r.id,await rewardLook(r)])));}
const holdingFolder=()=>game.folders?.find?.(d=>d.type==='Item'&&d.getFlag?.(MODULE_ID,'store')==='reward-holding')??null;
async function ensureHoldingFolder(){
  assertGM();let folder=holdingFolder();if(folder)return folder;
  folder=await Folder.create({name:HOLDING_FOLDER_NAME,type:'Item',sorting:'a',flags:{[MODULE_ID]:{store:'reward-holding'}}});
  if(!folder)throw Error('Could not create the reward holding folder.');
  return folder;
}
const ItemClass=()=>Item.implementation??Item;
async function deleteWorldItems(ids){if(ids.length)await ItemClass().deleteDocuments(ids);}
/** D2: an Item dropped from an Actor is copied to a GM-only world Item (contents included), so the reward survives
 * the Actor or token being deleted. The dropped Item is never changed. */
async function createHoldingCopy(item){
  assertGM();const folder=await ensureHoldingFolder();
  const {data}=await grantBundle(item,{quantity:item.system?.quantity??1,scope:MODULE_ID,tag:{holding:{from:item.parent?.uuid??null,at:new Date().toISOString()}}});
  for(const row of data){row.folder=folder.id;row.ownership={default:NONE};}
  let made=[];
  try{made=(await ItemClass().createDocuments(data,{keepId:true}))??[];if(made.length!==data.length)throw Error('The holding copy was not fully created.');}
  catch(e){await deleteWorldItems(data.map(d=>d._id).filter(id=>game.items?.get?.(id)));throw e;}
  return made[0];
}
const isHoldingCopy=doc=>Boolean(doc?.documentName==='Item'&&!doc.parent&&!doc.pack&&doc.getFlag?.(MODULE_ID,'holding'));
/** The reward record for a dropped Item: world and compendium Items are linked, Actor Items get a holding copy. */
async function itemRewardFields(item){
  assertGM();const embedded=item.parent?.documentName==='Actor';
  const stored=embedded?await createHoldingCopy(item):item,itemId=itemIdOf(item);
  return {name:item.name,teaser:item.name,kind:'uuid',uuid:stored.uuid,...(itemId?{item_id:itemId}:{}),...(item.img?{img:item.img}:{})};
}
/** GM-only grant of one item reward: the Item and its contents in one create call; rolled back if it fails part-way.
 * An Item already tagged with this claim on the Actor means it was granted: nothing is created again. */
async function grantItem(actor,reward,claim,faction,source=null){
  assertGM();
  if(actor.items.some(i=>i.getFlag(MODULE_ID,'claimId')===claim.request_id))return {created:0,skipped:true};
  source??=await rewardSource(reward);if(!source)throw Error(missingItemText(reward));
  const {data}=await grantBundle(source,{quantity:source.system?.quantity??1,scope:MODULE_ID,tag:{claimId:claim.request_id,rewardId:reward.id,factionId:faction.id}});
  for(const row of data)delete row.flags?.[MODULE_ID]?.holding;
  let made=[];
  try{made=(await actor.createEmbeddedDocuments('Item',data,{keepId:true}))??[];if(made.length!==data.length)throw Error('The reward item was not fully created.');}
  catch(e){const ids=new Set(data.map(d=>d._id)),left=[...actor.items].map(i=>i.id??i._id).filter(id=>ids.has(id));if(left.length)await actor.deleteEmbeddedDocuments('Item',left);throw e;}
  return {created:made.length,skipped:false};
}
/** Saving a reward fills its own empty item_id (and picture) from the Item it links, when that Item has one. */
async function fillRewardItemId(reward){
  if(reward?.kind!=='uuid'||reward.item_id)return reward;
  const item=await loadDoc(reward.uuid);if(item?.documentName!=='Item')return reward;
  const itemId=itemIdOf(item);if(itemId)reward.item_id=itemId;if(!reward.img&&item.img)reward.img=item.img;
  return reward;
}
/** Design §7: fill in the permanent item id of item rewards that lack one. Dry run by default. Never overwrites an
 * item_id, never changes a uuid and never touches claims; re-running changes nothing. GM only. */
async function backfillItemIds({dryRun=true}={}){
  assertGM();const report={dryRun:dryRun!==false,fill:[],noId:[],missing:[],written:0};
  for(const doc of defs()){
    const stored=getFaction(doc),changes=new Map();
    for(const r of stored?.rewards??[]){
      if(r.kind!=='uuid'||r.item_id)continue;
      const row={factionId:stored.id,faction:stored.name,rewardId:r.id,reward:r.name},found=await loadDoc(r.uuid);
      if(!found){report.missing.push(row);continue;}
      if(found.documentName!=='Item')continue;
      const itemId=itemIdOf(found);
      if(!itemId){report.noId.push(row);continue;}
      report.fill.push({...row,itemId});changes.set(r.id,itemId);
    }
    if(report.dryRun||!changes.size)continue;
    const next=structuredClone(stored);for(const r of next.rewards)if(changes.has(r.id)&&!r.item_id)r.item_id=changes.get(r.id);
    const clean=sourceDefinition(next),faults=validateFaction(clean);if(faults.length)throw Error(faults.join(' '));
    await doc.update({[`flags.${MODULE_ID}.faction`]:clean});report.written+=changes.size;
  }
  if(report.written)await reproject();
  return report;
}
const SEARCH_DELAY=200;
class Dashboard extends HandlebarsApplicationMixin(ApplicationV2){
  static DEFAULT_OPTIONS={id:'ashen-gate-factions-window',classes:['ag-app','ashen-gate-factions'],window:{title:'Ashen Gate | Renown',icon:'fa-solid fa-shield-halved',resizable:true},position:{width:1180,height:800},actions:{help:Dashboard.help,saveSetup:Dashboard.saveSetup,cancelEdit:Dashboard.cancelEdit,checkRewardIds:Dashboard.checkRewardIds,fillRewardIds:Dashboard.fillRewardIds,clearOrgFilters:Dashboard.clearOrgFilters,openDeity:Dashboard.openDeity,createDeity:Dashboard.createDeity,saveDeity:Dashboard.saveDeity,pickSymbol:Dashboard.pickSymbol,addRelation:Dashboard.addRelation,removeRelation:Dashboard.removeRelation,undoFavour:Dashboard.undoFavour,select:Dashboard.select,create:Dashboard.create,seed:Dashboard.seed,save:Dashboard.save,award:Dashboard.award,createFolder:Dashboard.createFolder,saveFolder:Dashboard.saveFolder,discovery:Dashboard.discovery,share:Dashboard.share,addEntry:Dashboard.addEntry,showEntry:Dashboard.showEntry,claim:Dashboard.claim,resolveRequest:Dashboard.resolveRequest,resetUsage:Dashboard.resetUsage,addReward:Dashboard.addReward,editReward:Dashboard.editReward,removeReward:Dashboard.removeReward,openLinked:Dashboard.openLinked,resetChoice:Dashboard.resetChoice,saveFieldReveals:Dashboard.saveFieldReveals,addObjective:Dashboard.addObjective,removeObjective:Dashboard.removeObjective,exportAll:Dashboard.exportAll,importJson:Dashboard.importJson}};
  static PARTS={main:{template:`modules/${MODULE_ID}/templates/dashboard.hbs`}};
  /** Compact size by default; Comfortable (General Manager → My Appearance) opens it 1.2x larger. An explicit position still wins. */
  constructor(options={}){super({...options,position:{...windowSize(Dashboard.DEFAULT_OPTIONS.position),...options.position}});}
  #tab='group';#searchTimer=null;#orgsView={...ORG_VIEW};#selected=null;#deity=null;#actor=null;#lastView=null;#backfill=null;
  // Actions shared by factions and deities act on the open deity in the Pantheon tab, else the selected faction.
  get #cur(){return this.#tab==='pantheon'?this.#deity:this.#selected;}
  async render(options={}){
    const previous=this.element?.querySelector?.('.agf-main');
    const viewKey=`${this.#tab}:${this.#cur}`;
    const scroll=previous&&this.#lastView===viewKey&&Number.isFinite(previous.scrollTop)?previous.scrollTop:null;
    const opened=previous&&this.#lastView===viewKey?[...previous.querySelectorAll?.('details[data-agf-section]')??[]].filter(el=>el.open).map(el=>el.dataset.agfSection):null;
    // Search filters as you type, so keep the caret in the search box across the re-render.
    const active=this.element?.ownerDocument?.activeElement,typing=active?.matches?.('[data-orgs-filter="search"]')?{at:active.selectionStart??null}:null;
    const result=await super.render(options);const root=this.element?.querySelector?.('.agf-main');
    if(root&&scroll!==null){root.scrollTop=scroll;if(opened){for(const el of root.querySelectorAll?.('details[data-agf-section]')??[])el.open=opened.includes(el.dataset.agfSection);}}
    if(typing){const box=this.element?.querySelector?.('[data-orgs-filter="search"]');if(box){box.focus?.();if(typing.at!==null)box.setSelectionRange?.(typing.at,typing.at);}}
    this.#lastView=viewKey;return result;
  }
  #gmData(){const list=factionDefs().map(d=>loadDef(d));const folders=projectedFolders({folders:folderList(),factions:list,gm:true}).map(x=>({key:x.key,name:x.name,known:x.known.map(f=>f.id),unknown_count:0}));return{version:SCHEMA_VERSION,groupLabel:groupLabel(),folders,factions:list};}
  #source(){if(game.user.isGM){const f=this.#gmData();return f;}const view=getView(userViewDoc(game.user));return view?.payload??{groupLabel:groupLabel(),folders:[],factions:[]};}
  #actorIds(){return accessibleActors().map(a=>a.id);}
  async _prepareContext(options){requirePlayerAccess();const ctx=await super._prepareContext(options),isGM=game.user.isGM,data=this.#source(),actorChoices=accessibleActors();
    if(!actorChoices.some(a=>a.id===this.#actor))this.#actor=actorChoices[0]?.id??null;
    const known=data.factions;
    if(!known.some(f=>f.id===this.#selected))this.#selected=known[0]?.id??null;
    const f=known.find(f=>f.id===this.#selected),sourceDoc=isGM&&f?definition(f.id):null;
    const gf=f&&isGM?upgradeFaction(f):null;
    const groupState=gf?getGroup(groupDoc(f.id))??makeGroupRecord({factionId:f.id}):f?.group;
    const personalState=gf?(this.#actor?getPersonal(personalDoc(f.id,this.#actor)):null):f?.personal?.[this.#actor];
    const actorScore=personalState?.standing?.score??personalState?.score??0,groupScore=groupState?.standing?.score??groupState?.score??0;
    const groupClaims=groupState?.claims??{},groupUses=groupState?.uses??{},groupRequests=groupState?.requests??{},groupChoices=groupState?.choices??{};const personalClaims=personalState?.claims??{},personalUses=personalState?.uses??{},personalRequests=personalState?.requests??{},personalChoices=personalState?.choices??{};
    const groupMs=gf?milestoneProjection({faction:gf,scope:'group',score:groupScore,claims:groupClaims,requests:groupRequests,uses:groupUses,choices:groupChoices,gm:isGM}):f?.groupTrack?.milestones??[];
    const individualMs=gf?milestoneProjection({faction:gf,scope:'individual',score:actorScore,claims:personalClaims,requests:personalRequests,uses:personalUses,choices:personalChoices,gm:isGM}):personalState?.milestones??[];
    const event=(e)=>({...e,displayDelta:e.delta>0?`+${e.delta}`:`${e.delta}`});
    const knownEntries=gf?gf.entries.filter(e=>e.discovered_party||this.#actorIds().some(id=>e.discovered_actors?.includes(id))).map(e=>secureEntryPreview(e,{isGM:true})):f?.entries??[];
    const groupEvents=groupState?.standing?.events??groupState?.history??[];
    const personalEvents=personalState?.standing?.events??personalState?.history??[];
    const detail=f?{id:f.id,name:f.name,leader:f.leader,public_role:f.public_role,tags:f.tags??[],score:groupScore,rank:gf?progressFor(gf.renown_track,groupScore).rank.name:rankOf(groupMs,groupScore),individualScore:actorScore,individualRank:gf?progressFor(gf.individual_track,actorScore).rank.name:rankOf(individualMs,actorScore),groupMs:decorateTrack(groupMs,groupScore,GROUP_TRACK),individualMs:decorateTrack(individualMs,actorScore,PERSONAL_TRACK),groupView:standingView(groupMs,groupScore),individualView:standingView(individualMs,actorScore),entries:knownEntries,canShare:!isGM&&f.canShare,groupEvents:[...groupEvents].reverse().slice(0,35).map(event),personalEvents:[...personalEvents].reverse().slice(0,35).map(event),folder_key:gf?.folder_key??f.folder_key,discovery:gf?.discovery??null,rewards:gf?.rewards??[],trackGroup:gf?.renown_track,trackPersonal:gf?.individual_track}:null;
    const factionMap=new Map(known.map(f=>[f.id,f.name]));const folders=(data.folders??[]).map(folder=>({...folder,factions:folder.known.map(id=>({id,name:factionMap.get(id),selected:id===this.#selected})),unknown:Array.from({length:folder.unknown_count??0},(_,i)=>({index:i})),count:folder.known.length+(folder.unknown_count??0)}));
    const requestRows=isGM&&gf?this.#queue(gf):[];
    if(!isGM&&['orgs','setup'].includes(this.#tab))this.#tab='group';
    const looks=gf?await rewardLooks(gf.rewards):null,openDeity=isGM&&this.#tab==='pantheon'&&this.#deity?definition(this.#deity):null;
    const pantheon=this.#tab==='pantheon'?this.#pantheonContext(isGM,openDeity?await rewardLooks(loadDef(openDeity)?.rewards):null):null;
    const orgsView=this.#orgsView,orgs=isGM?this.#orgsList(orgsView):{total:0,shown:0,groups:[]};
    for(const g of orgs.groups)for(const r of g.rows){r.selected=r.id===this.#selected;r.chipKey=r.chip.toLowerCase().replace(/[^a-z]+/g,'-');}
    const opt=(items,v)=>items.map(x=>{const [value,label]=Array.isArray(x)?x:[x,x];return{value,label,selected:value===v};});
    const orgsOptions={status:opt([['all','All'],...ORG_CHIPS],orgsView.status),sort:opt(ORG_SORTS,orgsView.sort),group:opt(ORG_GROUPS,orgsView.group)};
    const actorName=actorChoices.find(a=>a.id===this.#actor)?.name??'selected character';
    return {...ctx,isGM,version:moduleVersion(),actorName,showFolders:['group','player'].includes(this.#tab)||(isGM&&this.#tab==='orgs'),hasFolders:folderList().length>0,detail,folders,hasData:Boolean(detail),pantheon,tabPantheon:this.#tab==='pantheon',tabGroup:this.#tab==='group',tabPlayer:this.#tab==='player',tabOrgs:isGM&&this.#tab==='orgs',tabSetup:isGM&&this.#tab==='setup',showHeader:Boolean(detail)&&['group','player'].includes(this.#tab),orgs,orgsView,orgsOptions,groupLabel:groupLabel(),actorChoices:actorChoices.map(a=>({id:a.id,name:a.name,selected:a.id===this.#actor})),actorId:this.#actor,gmQueue:requestRows,foldersForSelect:[{key:'',name:'Other Factions',selected:!detail?.folder_key},...folderList().map(q=>({...q,selected:detail?.folder_key===q.key}))],groupName:game.settings.get(MODULE_ID,'groupName'),groupNameEnabled:game.settings.get(MODULE_ID,'groupNameEnabled'),pantheonDamping:pantheonDamping(),pantheonDampingMax:DAMPING_MAX,playerAccessEnabled:playerAccessEnabled(),hasActiveGM:Boolean(activeGM()),gmKnown:gf,gmObjectiveRefs:gf?auditObjectiveRefs(gf,game.modules.get('ashen-gate-quest-manager')):[],gmGroupLevels:gf?editorLevels(gf.renown_track,gf.rewards,'group',looks).map(m=>({...m,groupTitle:`Group: ${m.name}`})):[],gmPersonalLevels:gf?editorLevels(gf.individual_track,gf.rewards,'individual',looks).map(m=>({...m,personalTitle:`Individual: ${m.name}`})):[],serviceRewards:gf?.rewards.filter(r=>r.behavior==='repeatable_service').map(r=>({...r,resetLabel:r.audience==='group'?'Reset group uses':`Reset uses for ${actorName}`}))??[],shareEnabled:gf?.discovery?.sharing_enabled,fieldSelective:gf?.field_reveals?.mode==='selective',gmFieldReveals:gf?FIELD_KEYS.map(key=>({key,label:key==='public_role'?'Description':key==='leader'?'Leader':'Name',party:Boolean(gf.field_reveals?.fields?.[key]?.party),actor:Boolean(gf.field_reveals?.fields?.[key]?.actors?.includes(this.#actor))})):[],backfill:isGM&&this.#tab==='setup'?backfillView(this.#backfill):null,canEdit:!!gf,refreshNeeded:!isGM&&!userViewDoc(game.user)};
  }
  /** Pantheon tab: symbol tiles grouped by tier and, when a deity is open, its card and this character's standing.
   * Players only ever read their projected view (revealed deities only); the GM reads the definitions. */
  #pantheonContext(isGM,looks=null){
    const actorId=this.#actor,actor=actorId?game.actors.get(actorId):null;
    const list=isGM?deityDefs().map(d=>upgradeFaction(loadDef(d))):(getView(userViewDoc(game.user))?.payload?.deities??[]);
    if(this.#deity&&!list.some(x=>x.id===this.#deity))this.#deity=null;
    const gmState=id=>actorId?getPersonal(personalDoc(id,actorId)):null;
    const tiles=list.map(x=>{
      if(isGM){const score=gmState(x.id)?.standing?.score??0;return{...deityCard(x),score,rank:progressFor(x.individual_track,score).rank.name,chip:visibilityChip(x),badgeClass:chipBadge(visibilityChip(x)),known:discoverable({discovery:x.discovery,actorIds:actorId?[actorId]:[]}),selected:x.id===this.#deity};}
      const mine=x.personal?.[actorId];return{...deityCard(x),score:mine?.score??null,rank:mine?.rank??'',known:Boolean(mine),selected:x.id===this.#deity};
    }).sort((a,b)=>a.name.localeCompare(b.name));
    const groups=DEITY_TIERS.map(t=>({tier:t,label:t==='major'?'Major deities':'Lesser deities',tiles:tiles.filter(x=>x.tier===t)})).filter(g=>g.tiles.length);
    const actorName=actor?.name??'',base={groups,count:tiles.length,actorName,open:null};
    const x=list.find(d=>d.id===this.#deity);if(!x)return base;
    const event=e=>({...e,displayDelta:e.delta>0?`+${e.delta}`:`${e.delta}`});
    if(!isGM){
      const mine=x.personal?.[actorId];
      const ms=mine?.milestones??[],score=mine?.score??0;
      return{...base,open:{card:deityCard(x),known:Boolean(mine),score,rank:mine?.rank??'',view:standingView(ms,score),
        milestones:decorateTrack(ms,score,FAVOUR_TRACK),history:[...(mine?.history??[])].reverse().slice(0,35).map(event),relations:x.relations??[],entries:x.entries??[],canShare:Boolean(x.canShare)}};
    }
    const st=gmState(x.id),score=st?.standing?.score??0,p=progressFor(x.individual_track,score),names=new Map(list.map(d=>[d.id,d.name]));
    const ms=milestoneProjection({faction:x,scope:'individual',score,claims:st?.claims??{},requests:st?.requests??{},uses:st?.uses??{},choices:st?.choices??{},gm:true});
    const profile=deityProfile(x.deity);
    return{...base,open:{card:deityCard(x),known:true,score,rank:p.rank.name,view:standingView(ms,score),milestones:decorateTrack(ms,score,FAVOUR_TRACK),awardTitle:`Adjust favour for ${actorName||'the selected character'}`,
      history:(()=>{const ev=st?.standing?.events??[],undone=new Set(ev.map(e=>e.reverses).filter(Boolean));return[...ev].reverse().slice(0,35).map(e=>({...event(e),canUndo:!e.reverses&&!undone.has(e.id),undone:undone.has(e.id)}));})(),
      relations:profile.relations.map(r=>{const label=relationLabel(r.resonance);return{...r,name:names.get(r.deity_id)??`${r.deity_id} (missing)`,label,isDissonant:label==='Dissonance',isResonant:label==='Resonance',preview:resonancePreview(r.resonance,pantheonDamping())};}),
      damping:pantheonDamping(),
      entries:x.entries.map(e=>({...e,discovered:Boolean(e.discovered_party||e.discovered_actors?.includes(actorId))})),
      gm:{id:x.id,name:x.name,tags:(x.tags??[]).join(', '),profile,isMajor:profile.tier==='major',isLesser:profile.tier==='lesser',discovery:x.discovery,chip:visibilityChip(x),badgeClass:chipBadge(visibilityChip(x)),actorKnows:discoverable({discovery:x.discovery,actorIds:actorId?[actorId]:[]}),
        levels:editorLevels(x.individual_track,x.rewards,null,looks),
        relationOptions:list.filter(d=>d.id!==x.id&&!profile.relations.some(r=>r.deity_id===d.id)).map(d=>({id:d.id,name:d.name})),
        queue:this.#queue(x),serviceRewards:x.rewards.filter(r=>r.behavior==='repeatable_service').map(r=>({...r,audience:'individual',resetLabel:`Reset uses for ${actorName||'the selected character'}`}))}}};
  }
  /** GM roster rows: every faction, hidden or not, with its group Renown. */
  #orgsList(view){const folders=new Map(folderList().map(x=>[x.key,x.name]));
    const rows=factionDefs().map(d=>{const f=upgradeFaction(loadDef(d)),state=getGroup(groupDoc(f.id))??makeGroupRecord({factionId:f.id}),score=state?.standing?.score??state?.score??0;
      return orgRow({faction:f,score,rank:progressFor(f.renown_track,score).rank.name,folderName:folders.get(f.folder_key)});});
    return listOrgsTab(rows,view);}
  #queue(f){return game.journal.filter(d=>getGroup(d)?.faction_id===f.id||getPersonal(d)?.faction_id===f.id).flatMap(doc=>{const group=getGroup(doc),state=group??getPersonal(doc),audience=group?'group':'individual',actor=state.actor_id?game.actors.get(state.actor_id):null;
    const ones=Object.entries(state.claims??{}).filter(([_,r])=>['pending','approved'].includes(r.status)).map(([key,c])=>({docId:doc.id,requestKey:key,reward:f.rewards.find(r=>r.id===key)?.name??key,actor:actor?.name??'Group',status:c.status,claim:true,approved:c.status==='approved',pending:c.status==='pending',isItem:f.rewards.some(r=>r.id===key&&linkedItem(r)&&audience==='group')}));
    const services=Object.entries(state.requests??{}).filter(([_,r])=>['requested','approved'].includes(r.status)).map(([key,c])=>({docId:doc.id,requestKey:key,reward:f.rewards.find(r=>r.id===c.reward_id)?.name??c.reward_id,actor:actor?.name??'Group',status:c.status,service:true,pending:c.status==='requested',approved:c.status==='approved'}));return[...ones,...services];});}
  async _onRender(context,options){requirePlayerAccess();await super._onRender(context,options);const root=this.element;if(root.dataset.agfBound)return;root.dataset.agfBound='yes';
    // V14 manages [data-tab] controls itself. Use a unique attribute and a DOM click
    // listener on the stable app frame to keep our three full-page views independent.
    root.addEventListener('click',e=>{
      if(!playerMayOpen())return;
      const tab=e.target?.closest?.('button[data-agf-view]');
      if(!tab||!root.contains(tab))return;
      const page=tab.dataset.agfView;
      if(!['group','player','pantheon','orgs','setup'].includes(page)||(['orgs','setup'].includes(page)&&!game.user.isGM))return;
      e.preventDefault();
      if(this.#tab===page)return;
      this.#tab=page;
      void this.render({force:true}).catch(notifyError);
    });
    // A missing holy-symbol file falls back to the built-in glyph.
    root.addEventListener('error',e=>{const img=e.target;if(img?.matches?.('img.agf-symbol-img'))img.closest('.agf-symbol')?.classList.add('is-missing');},true);
    // Resonance slider: live preview while dragging, saved when released.
    root.addEventListener('input',e=>{
      const box=e.target?.closest?.('[data-orgs-filter="search"]');
      if(box&&game.user.isGM){clearTimeout(this.#searchTimer);const value=box.value;this.#searchTimer=setTimeout(()=>{this.#orgsView.search=value;void this.render({force:true});},SEARCH_DELAY);return;}
      const el=e.target?.closest?.('[data-resonance-target],[name=relation-resonance]');if(!el)return;const out=el.closest('[data-resonance-row]')?.querySelector('[data-resonance-preview]');if(out)out.textContent=`${relationLabel(Number(el.value))} · ${resonancePreview(Number(el.value),pantheonDamping())}`;});
    root.addEventListener('change',e=>{const slider=e.target?.closest?.('[data-resonance-target]');if(slider&&game.user.isGM){void this.setResonance(slider.dataset.resonanceTarget,slider.value);return;}const flt=e.target.closest?.('[data-orgs-filter]');if(flt&&game.user.isGM){if(flt.dataset.orgsFilter==='search')return;this.#orgsView[flt.dataset.orgsFilter]=flt.value;void this.render({force:true});return;}if(e.target.matches('[name=faction-import-file]')){void this.importFile(e.target);return;}if(e.target.matches('[name=actor-id]')){const a=accessibleActors().find(a=>a.id===e.target.value);if(a){this.#actor=a.id;void this.render({force:true});}}});
    root.addEventListener('dragstart',e=>{const el=e.target.closest('[data-faction-drag]');if(!game.user.isGM||!el)return;e.dataTransfer.setData('text/ashen-gate-faction',el.dataset.factionDrag);e.dataTransfer.effectAllowed='move';});
    root.addEventListener('dragover',e=>{if(game.user.isGM&&e.target.closest('[data-folder-drop], [data-reward-drop], [data-entry-drop]'))e.preventDefault();});
    root.addEventListener('drop',async e=>{try{if(!game.user.isGM)return;const folder=e.target.closest('[data-folder-drop]');if(folder){const id=e.dataTransfer.getData('text/ashen-gate-faction');if(!id)return;e.preventDefault();const doc=definition(id),f=loadDef(doc);f.folder_key=folder.dataset.folderDrop;await saveChange(doc,f);await this.render({force:true});return;}
      const rewardZone=e.target.closest('[data-reward-drop]'),entryZone=e.target.closest('[data-entry-drop]');if(!rewardZone&&!entryZone)return;e.preventDefault();const drag=readDrop(e),doc=definition(this.#cur);if(!doc)throw Error('Choose a faction or deity first.');
      // D13: reward zones take Items only (world, compendium or from an Actor); journals and other documents go to the info list.
      if(rewardZone){const found=await resolveItemDrop(drag);if(!found.ok){if(found.reason==='Drop an item.')ui.notifications.warn('Rewards take items. Drop journals and other documents on the info list.');else ui.notifications.warn(found.reason);return;}
        const fields=await itemRewardFields(found.items[0]),f=loadDef(doc);f.rewards.push({id:`rw-${rid()}`,key:keyFor('rw_'+rid()),audience:rewardZone.dataset.audience,milestone_id:rewardZone.dataset.milestone,description:'',tags:[],behavior:'one_time',usage_limit:0,...fields});
        try{await saveChange(doc,f);}catch(err){const copy=await loadDoc(fields.uuid);if(isHoldingCopy(copy)&&copy.uuid!==found.items[0].uuid)await deleteWorldItems((await bundleOf(copy)).map(i=>i.id));throw err;}await this.render({force:true});return;}
      let uuid=drag?.uuid;if(!uuid&&drag?.id&&drag?.type)uuid=`${drag.type}.${drag.id}`;if(!uuid)throw Error('Drop a Foundry document with a UUID.');const linked=await fromUuid(uuid);if(!linked)throw Error('Document not found.');const f=loadDef(doc);{f.entries.push({id:`info_${keyFor(rid())}`,name:linked.name,text:'',uuid,link_mode:'document',unlock:'manual',threshold:0,discovered_party:false,discovered_actors:[]});}await saveChange(doc,f);await this.render({force:true});
    }catch(err){notifyError(err)}});
  }
  static async select(e,t){this.#selected=t.dataset.id;await this.render({force:true});}
  /** 0.10.0: open on one faction (and the Player view for one character), for the embed's Open button. */
  focus({factionId=null,deityId=null,actorId=null,tab=null}={}){if(factionId)this.#selected=factionId;if(deityId)this.#deity=deityId;if(actorId)this.#actor=actorId;if(['player','group','pantheon'].includes(tab))this.#tab=tab;}
  static async openDeity(e,t){this.#deity=t.dataset.id||null;await this.render({force:true});}
  static async createDeity(){try{assertGM();const typed=await promptText('New deity','Deity name');if(typed===null)return;const name=typed.trim();if(!name||name.length>120)throw Error('Deity name required (up to 120 characters).');const f=makeDeity({...deityIdPair(),name});const doc=await JournalEntry.create({name,folder:(await ensureStorageFolder()).id,ownership:{default:NONE},flags:{[MODULE_ID]:{faction:sourceDefinition(f)}}});await ensureGroup(doc);this.#deity=f.id;await reproject();await this.render({force:true});}catch(e){notifyError(e)}}
  static async saveDeity(){try{assertGM();const doc=definition(this.#deity),f=doc&&loadDef(doc);if(!isDeity(f))throw Error('Open a deity first.');const root=this.element.querySelector('[data-deity-editor]');if(!root)throw Error('Deity editor not found.');
    f.name=nameValue(root,'deity-name');const d=deityProfile(f.deity);d.symbol=nameValue(root,'deity-symbol');for(const k of DEITY_TEXT_KEYS)d[k]=String(root.querySelector(`[name="deity-${k}"]`)?.value??'').trim();d.tier=selectedValue(root,'deity-tier');d.saying={text:nameValue(root,'deity-saying-text'),attribution:nameValue(root,'deity-saying-attribution')};f.deity=d;
    f.tags=nameValue(root,'deity-tags').split(',').map(s=>s.trim()).filter(Boolean);f.discovery.placeholder=Boolean(root.querySelector('[name=deity-placeholder]')?.checked);f.discovery.sharing_enabled=Boolean(root.querySelector('[name=deity-sharing]')?.checked);
    const rows=[...root.querySelectorAll('[data-milestone-row="individual"]')];if(rows.length!==5)throw Error('Five rank rows expected.');f.individual_track.milestones=rows.map((row,i)=>({...f.individual_track.milestones[i],name:String(row.querySelector('[data-field=name]')?.value??'').trim(),threshold:Number(row.querySelector('[data-field=threshold]')?.value),benefit:String(row.querySelector('[data-field=benefit]')?.value??''),selection_mode:row.querySelector('[data-field=selection]')?.value??'all'}));
    await saveChange(doc,f);await this.render({force:true});ui.notifications.info('Deity saved.');}catch(e){notifyError(e)}}
  static async pickSymbol(){try{assertGM();const input=this.element.querySelector('[name=deity-symbol]');const FP=foundry.applications?.apps?.FilePicker?.implementation??globalThis.FilePicker;if(!input||!FP)throw Error('File picker unavailable; type the image path.');new FP({type:'image',current:input.value,callback:path=>{input.value=path;}}).render(true);}catch(e){notifyError(e)}}
  static async addRelation(){try{assertGM();const doc=definition(this.#deity),f=doc&&loadDef(doc);if(!isDeity(f))throw Error('Open a deity first.');const target=selectedValue(this.element,'relation-deity'),resonance=Number(selectedValue(this.element,'relation-resonance')||RESONANCE_NEUTRAL);if(target===f.id||!isDeity(getFaction(definition(target))))throw Error('Choose another deity.');if(!validResonance(resonance))throw Error('Resonance must be between 0 and 1.');const d=deityProfile(f.deity);if(d.relations.some(r=>r.deity_id===target))throw Error('That relation already exists.');d.relations.push({deity_id:target,resonance});f.deity=d;await saveChange(doc,f);await this.render({force:true});}catch(e){notifyError(e)}}
  /** GM slider: one direction (this deity -> target), 0 Dissonance … 0.5 neutral … 1 Resonance. */
  async setResonance(target,value){try{assertGM();const doc=definition(this.#deity),f=doc&&loadDef(doc);if(!isDeity(f))throw Error('Open a deity first.');const v=Number(value);if(!validResonance(v))throw Error('Resonance must be between 0 and 1.');const d=deityProfile(f.deity),r=d.relations.find(x=>x.deity_id===target);if(!r)throw Error('Relation not found.');r.resonance=v;f.deity=d;await saveChange(doc,f);await this.render({force:true});}catch(e){notifyError(e)}}
  /** Undo adds reversing entries (nothing is deleted): the chosen entry and, for a gain, the knock-ons it caused. Undo entries never spread. */
  static async undoFavour(e,t){try{assertGM();const actor=game.actors.get(this.#actor);if(!actor)throw Error('Select a character.');const id=t.dataset.event,own=getPersonal(personalDoc(this.#deity,actor.id)),ev=own?.standing?.events?.find(x=>x.id===id);if(!ev)throw Error('History entry not found.');
    const reversed=events=>new Set(events.map(x=>x.reverses).filter(Boolean));if(ev.reverses||reversed(own.standing.events).has(ev.id))throw Error('That entry is already an undo or has been undone.');
    const linked=deityDefs().map(d=>getFaction(d).id).filter(id=>id!==this.#deity).flatMap(did=>{const evs=getPersonal(personalDoc(did,actor.id))?.standing?.events??[],done=reversed(evs);return evs.filter(x=>x.caused_by===ev.id&&!done.has(x.id)).map(x=>({deityId:did,ev:x}));});
    const name=id=>getFaction(definition(id))?.name??id,sign=n=>n>0?`+${n}`:`${n}`;
    if(!await confirmDialog(`Undo "${ev.reason}" (${sign(ev.delta)}) for ${actor.name}?${linked.length?` This also undoes ${linked.map(l=>`${name(l.deityId)} ${sign(l.ev.delta)}`).join(', ')}.`:''} History keeps both entries.`,{title:'Undo this favour change?',yes:'Undo change'}))return;
    for(const row of [{deityId:this.#deity,ev},...linked])await writeFavour(row.deityId,actor,-row.ev.delta,`Undo: ${row.ev.reason}`,{reverses:row.ev.id,...(row.ev.source_deity?{source_deity:row.ev.source_deity}:{})});
    await reproject();await this.render({force:true});}catch(e){notifyError(e)}}
  static async removeRelation(e,t){try{assertGM();const doc=definition(this.#deity),f=doc&&loadDef(doc);if(!isDeity(f))throw Error('Open a deity first.');const d=deityProfile(f.deity),r=d.relations.find(x=>x.deity_id===t.dataset.target);if(!r)throw Error('Relation not found.');if(!await confirmDialog(`Remove the relation to ${getFaction(definition(r.deity_id))?.name??r.deity_id}? Standing is not changed.`,{title:'Remove this relation?',yes:'Remove relation',danger:true}))return;d.relations=d.relations.filter(x=>x!==r);f.deity=d;await saveChange(doc,f);await this.render({force:true});}catch(e){notifyError(e)}}
  static async create(){try{assertGM();const typed=await promptText('New faction','Faction name');if(typed===null)return;const name=typed.trim();if(!name||name.length>120)throw Error('Faction name required (up to 120 characters).');const f=makeFaction({...idPair(),name});const doc=await JournalEntry.create({name,folder:(await ensureStorageFolder()).id,ownership:{default:NONE},flags:{[MODULE_ID]:{faction:f}}});await ensureGroup(doc);this.#selected=f.id;await reproject();await this.render({force:true});}catch(e){notifyError(e)}}
  static async help(){const gm=game.user?.isGM;infoDialog('Renown Help',`<p><strong>Renown</strong> tracks the organizations your party has met and the Renown the group and each character have earned with them. Pick an organization on the left.</p><ul><li><strong>Group</strong> shows the party's standing with the selected organization, its milestones and what has been discovered.</li><li><strong>Player</strong> shows one character's personal Renown, information and rewards.${gm?'':' You can use <em>Share with Party</em> to share what you have discovered.'}</li><li><strong>Pantheon</strong> shows the deities your character knows, each with its holy symbol, its card and that character's favour. Favour is per character, never shared by the group. Open a deity to see its ranks, rewards, lore and related deities (Resonance or Dissonance).${gm?' As GM you can create deities, edit the card and rank titles, reveal a deity to the party or one character, adjust favour and manage rewards there. Each related deity has a slider from Dissonance to Resonance: a gain with this deity then moves that one too (scaled by the damping in GM Setup), and you confirm each change before it applies. Undo on a history entry reverses it and the changes it caused. The holy symbol is an image path (Browse opens the Assets Library); a missing image shows a plain sun glyph.':''}</li>${gm?'<li><strong>Organizations</strong> lists every organization. Search filters as you type; <em>New faction</em>, Import and Export are on the right of the toolbar. Below the list you edit the selected faction, its information entries, rewards, requests and folders.</li><li><strong>GM Setup</strong> holds the settings: Player Access (hides the player window without deleting any progress), Pantheon damping and the group name. Change them, then press <em>Save Changes</em> once. Developer Tools at the bottom loads demo guilds.</li>':''}</ul>${gm?'<p>Removing an entry, reward or objective reference, resetting service charges or clearing a milestone choice always asks you to confirm first.</p>':'<p>Rewards your character can claim are requested here and confirmed by the GM.</p>'}`)}
  static async seed(){try{assertGM();if(!await confirmDialog('Add four unapproved example guilds? Existing names are skipped.',{title:'Add four example guilds?',yes:'Add guilds'}))return;let count=0;for(const g of RECOVERED_GUILDS_DRAFT){if(defs().some(d=>getFaction(d).name.toLowerCase()===g.name.toLowerCase()))continue;const f=makeFaction({...idPair(),...g,initialBenefit:g.initial_benefit,source:'Recovered Fosstryn journal drafts; not canonical'});const d=await JournalEntry.create({name:f.name,folder:(await ensureStorageFolder()).id,ownership:{default:NONE},flags:{[MODULE_ID]:{faction:f}}});await ensureGroup(d);count++;}await reproject();ui.notifications.info(`${count} example guilds added.`);await this.render({force:true});}catch(e){notifyError(e)}}
  static async save(){try{assertGM();const doc=definition(this.#selected),f=loadDef(doc),root=this.element;f.name=nameValue(root,'faction-name');f.leader=nameValue(root,'faction-leader');f.public_role=nameValue(root,'faction-role');f.folder_key=selectedValue(root,'faction-folder');f.tags=nameValue(root,'faction-tags').split(',').map(s=>s.trim()).filter(Boolean);f.discovery.placeholder=Boolean(root.querySelector('[name=discovery-placeholder]')?.checked);f.discovery.sharing_enabled=Boolean(root.querySelector('[name=sharing-enabled]')?.checked);
    for(const [scope,track] of [['group',f.renown_track],['individual',f.individual_track]]){const rows=[...root.querySelectorAll(`[data-milestone-row="${scope}"]`)];if(rows.length!==5)throw Error('Five milestone rows expected.');track.milestones=rows.map((row,i)=>({...track.milestones[i],name:String(row.querySelector('[data-field=name]')?.value??'').trim(),threshold:Number(row.querySelector('[data-field=threshold]')?.value),benefit:String(row.querySelector('[data-field=benefit]')?.value??''),selection_mode:row.querySelector('[data-field=selection]')?.value??'all'}));}
    await saveChange(doc,f);await this.render({force:true});ui.notifications.info('Faction setup saved.');}catch(e){notifyError(e)}}
  static async saveFieldReveals(){try{
    assertGM();const doc=definition(this.#selected);if(!doc)throw Error('Select a faction first.');
    const f=loadDef(doc),root=this.element,selective=Boolean(root.querySelector('[name=field-selective]')?.checked);
    let d=fieldDisclosure(f.field_reveals);d.mode=selective?'selective':'legacy';
    if(selective)for(const key of FIELD_KEYS){
      d.fields[key].party=Boolean(root.querySelector(`[name=field-party-${key}]`)?.checked);
      const actor=this.#actor;if(actor){const actors=new Set(d.fields[key].actors);
        if(root.querySelector(`[name=field-actor-${key}]`)?.checked)actors.add(actor);else actors.delete(actor);
        d.fields[key].actors=[...actors];}
    }
    f.field_reveals=d;await saveChange(doc,f);await this.render({force:true});
    ui.notifications.info('Faction field visibility saved.');
  }catch(e){notifyError(e)}}
  /** D4: GM Setup saves Player Access, damping and the group name together, only on Save Changes. Nothing is written
   * until every value is valid. Player Access goes through setPlayerAccess (same key, same launcher refresh). */
  static async saveSetup(){try{
    assertGM();const root=this.element.querySelector('[data-setup-form]')??this.element;
    const access=Boolean(root.querySelector('[name=player-access-enabled]')?.checked);
    const damping=Number(selectedValue(root,'pantheon-damping'));if(!validDamping(damping))throw Error(`Damping must be from 0 to ${DAMPING_MAX}.`);
    const name=nameValue(root,'group-name');if(name.length>100)throw Error('Group name is too long (100 characters at most).');
    const named=Boolean(root.querySelector('[name=group-name-enabled]')?.checked);
    const labelChanged=name!==game.settings.get(MODULE_ID,'groupName')||named!==game.settings.get(MODULE_ID,'groupNameEnabled');
    if(damping!==pantheonDamping())await game.settings.set(MODULE_ID,'pantheonDamping',damping);
    if(labelChanged){await game.settings.set(MODULE_ID,'groupName',name);await game.settings.set(MODULE_ID,'groupNameEnabled',named);}
    if(access!==playerAccessEnabled())await setPlayerAccess(access);
    if(labelChanged)await reproject();
    ui.notifications.info('Renown settings saved.');await this.render({force:true});
  }catch(e){notifyError(e)}}
  /** Cancel in an editor footer: drop unsaved edits by drawing the saved values again. */
  static async cancelEdit(){await this.render({force:true});}
  /** GM Setup → Fill in permanent item ids: Check rewards is a dry run; Fill in ids asks first, then writes. */
  static async checkRewardIds(){try{assertGM();this.#backfill=await backfillItemIds({dryRun:true});await this.render({force:true});}catch(e){notifyError(e)}}
  static async fillRewardIds(){try{assertGM();const plan=await backfillItemIds({dryRun:true});this.#backfill=plan;
    if(!plan.fill.length){ui.notifications.info('Renown: no reward needs a permanent item id.');await this.render({force:true});return;}
    const n=plan.fill.length;if(!await confirmDialog(`Fill in the permanent item id of ${n} item reward${n===1?'':'s'}? Links, claims and rewards that already have an id are not changed.`,{title:'Fill in permanent item ids?',yes:'Fill in ids'})){await this.render({force:true});return;}
    const done=await backfillItemIds({dryRun:false});this.#backfill={...await backfillItemIds({dryRun:true}),written:done.written};
    ui.notifications.info(`Renown: filled in ${done.written} permanent item id${done.written===1?'':'s'}.`);await this.render({force:true});}catch(e){notifyError(e)}}
  static async clearOrgFilters(){this.#orgsView={...ORG_VIEW};await this.render({force:true});}
  static async award(e,t){try{assertGM();const doc=definition(this.#cur),f=loadDef(doc),scope=t.dataset.scope,zone=t.closest('[data-award-scope]');if(!zone||!['group','individual'].includes(scope))throw Error('Invalid Renown award scope.');if(isDeity(f)&&scope!=='individual')throw Error('Deities have no group standing; award a character.');const delta=Number(zone.querySelector('[name=renown-delta]')?.value),reason=nameValue(zone,'renown-reason'),args={delta,reason,eventId:`RENOWN-EVT-${rid()}`,when:new Date().toISOString()};
    const actor=scope==='individual'?game.actors.get(this.#actor):null;if(scope==='individual'&&!actor)throw Error('Select a character.');const stateDoc=scope==='group'?await ensureGroup(doc):await ensurePersonal(doc,actor),key=scope==='group'?'groupClaims':'individual',state=structuredClone(stateDoc.getFlag(MODULE_ID,key)),result=adjustStanding(state.standing,args);if(!result.applied)return ui.notifications.warn('No change applied.');
    // Pantheon: a gain spreads to related deities only after the GM confirms each knock-on (all ticked by default).
    let chosen=[];
    if(isDeity(f)&&result.after>result.before){
      const names=new Map(deityDefs().map(d=>[getFaction(d).id,getFaction(d).name])),ko=knockOns(f,result.after-result.before,pantheonDamping(),names).filter(k=>definition(k.deity_id));
      if(ko.length){const picked=await checklistDialog('Related deities',`${actor.name} gains ${result.after-result.before} favour with ${f.name}. Also apply these? Untick any you do not want.`,ko.map(k=>({key:k.deity_id,label:`${k.name}: ${k.delta>0?'+':''}${k.delta} (${k.label})`,checked:true})),{ok:'Apply'});
        if(picked===null)return;chosen=ko.filter(k=>picked.includes(k.deity_id));}
    }
    state.standing=result.standing;await stateDoc.setFlag(MODULE_ID,key,state);
    for(const k of chosen)await writeFavour(k.deity_id,actor,k.delta,`${k.label} with ${f.name}: ${reason}`,{caused_by:args.eventId,source_deity:f.id});
    const learned=grantAutoKnowledge(f,scope,actor?.id,result.standing.score);if(learned.changed.length)await saveDef(doc,learned.faction);
    await reproject();await this.render({force:true});ui.notifications.info(`${scope==='group'?'Group':actor.name} Renown: ${result.before} → ${result.after}${chosen.length?` (+${chosen.length} related ${chosen.length===1?'deity':'deities'})`:''}`);
  }catch(e){notifyError(e)}}
  static async createFolder(){try{assertGM();const name=nameValue(this.element,'new-folder-name');if(!name||name.length>100)throw Error('Folder name required (max 100 characters).');const doc=await folderRecord(),entry=structuredClone(getFolders(doc));entry.folders.push({key:`folder_${keyFor(rid())}`,name});await doc.setFlag(MODULE_ID,'folderIndex',entry);await reproject();await this.render({force:true});}catch(e){notifyError(e)}}
  static async saveFolder(e,t){try{assertGM();const d=await folderRecord(),rec=structuredClone(getFolders(d)),folder=rec.folders.find(x=>x.key===t.dataset.key);if(!folder)throw Error('Folder not found.');const name=await promptText('Rename folder','Folder name:',folder.name);if(name===null)return;if(!name.trim()||name.trim().length>100)throw Error('Invalid name.');folder.name=name.trim();await d.setFlag(MODULE_ID,'folderIndex',rec);await reproject();await this.render({force:true});}catch(e){notifyError(e)}}
  static async discovery(e,t){try{assertGM();const doc=definition(this.#cur),f=loadDef(doc);const action=t.dataset.mode;
    if(action==='party')f.discovery.party=!f.discovery.party;
    else if(action==='actor'){const actor=game.actors.get(this.#actor);if(!actor)throw Error('Select an assigned character.');const arr=f.discovery.actors;f.discovery.actors=arr.includes(actor.id)?arr.filter(i=>i!==actor.id):[...arr,actor.id];}
    else throw Error('Unknown discovery action.');await saveChange(doc,f);await this.render({force:true});}catch(e){notifyError(e)}}
  static async share(){try{requirePlayerAccess();if(game.user.isGM)throw Error('GM can reveal factions directly.');const view=getView(userViewDoc(game.user));if(!view)throw Error('No player discovery record available.');const known=viewEntry(view,this.#cur);if(!known?.canShare)throw Error('You cannot share this entry.');if(!await confirmDialog(`Share everything you have discovered about ${known.name} with the party? Personal Renown and rewards stay private.`,{title:'Share with party',yes:'Share with party'}))return;const request={type:'share',factionId:known.id,userId:game.user.id,capability:view.capability};sendClientAction(request);ui.notifications.info('Sharing discovery with party; awaiting GM confirmation...');}catch(e){notifyError(e)}}
  /** Add only the typed, reusable source reference; do not resolve/reveal a Quest. */
  static async addObjective(){try{
    assertGM();const doc=definition(this.#selected);if(!doc)throw Error('Choose a faction first.');
    const f=loadDef(doc),root=this.element;
    const ref={relation:selectedValue(root,'objective-relation'),target_id:nameValue(root,'objective-id'),mode:selectedValue(root,'objective-mode')};
    const next=addObjectiveRef(f,ref);
    await saveChange(doc,next);await this.render({force:true});
    ui.notifications.info('Objective reference saved. Quest visibility and progress were not changed.');
  }catch(e){notifyError(e)}}
  static async removeObjective(e,t){try{
    assertGM();const doc=definition(this.#selected);if(!doc)throw Error('Choose a faction first.');
    const ref={relation:t.dataset.relation,target_id:t.dataset.objective,mode:t.dataset.mode};
    if(!await confirmDialog(`Remove ${ref.relation} → ${ref.target_id} from ${loadDef(doc).name}? Quest progress is not changed.`,{title:'Remove this objective reference?',yes:'Remove reference',danger:true}))return;
    await saveChange(doc,removeObjectiveRef(loadDef(doc),ref));await this.render({force:true});
  }catch(e){notifyError(e)}}
  static async addEntry(e,t){try{assertGM();const zone=t.closest('[data-info-editor]'),doc=definition(this.#cur),f=loadDef(doc),name=nameValue(zone,'info-name');if(!name)throw Error('Entry needs a title.');f.entries.push({id:`info_${keyFor(rid())}`,name,text:nameValue(zone,'info-text'),link_mode:'preview',unlock:zone.querySelector('[name=info-unlock]')?.value??'manual',threshold:Number(zone.querySelector('[name=info-threshold]')?.value??0),discovered_party:false,discovered_actors:[]});await saveChange(doc,f);await this.render({force:true});}catch(e){notifyError(e)}}
  static async showEntry(e,t){try{assertGM();const doc=definition(this.#cur),f=loadDef(doc),entry=f.entries.find(r=>r.id===t.dataset.entry);if(!entry)throw Error('Entry not found.');const action=t.dataset.mode;if(action==='party')entry.discovered_party=!entry.discovered_party;else if(action==='actor'){const actor=game.actors.get(this.#actor);if(!actor)throw Error('Select character first.');entry.discovered_actors??=[];entry.discovered_actors=entry.discovered_actors.includes(actor.id)?entry.discovered_actors.filter(i=>i!==actor.id):[...entry.discovered_actors,actor.id];}else if(action==='mode'){entry.link_mode=entry.link_mode==='preview'?'document':'preview';}else if(action==='edit'){const txt=await promptText('Edit information',`Information for ${entry.name}:`,entry.text??'',{multiline:true});if(txt===null)return;entry.text=txt;}else if(action==='remove'){if(!await confirmDialog(`Remove "${entry.name}" from ${f.name}? This is not undone.`,{title:'Remove this entry?',yes:'Remove entry',danger:true}))return;f.entries=f.entries.filter(x=>x.id!==entry.id);}await saveChange(doc,f);await this.render({force:true});}catch(e){notifyError(e)}}
  static async addReward(e,t){try{assertGM();const zone=t.closest('[data-reward-drop]'),doc=definition(this.#cur),f=loadDef(doc),name=nameValue(zone,'reward-name');if(!name)throw Error('Reward name required.');f.rewards.push({id:`rw-${rid()}`,key:keyFor('rw_'+rid()),audience:zone.dataset.audience,milestone_id:zone.dataset.milestone,name,teaser:name,description:nameValue(zone,'reward-description'),kind:'custom',tags:[],behavior:zone.querySelector('[name=reward-behavior]')?.value??'one_time',usage_limit:Number(zone.querySelector('[name=reward-limit]')?.value??0)});await saveChange(doc,f);await this.render({force:true});}catch(e){notifyError(e)}}
  static async editReward(e,t){try{assertGM();const doc=definition(this.#cur),f=loadDef(doc),reward=f.rewards.find(r=>r.id===t.dataset.reward);if(!reward)throw Error('Reward not found.');const v=await formDialog('Edit reward',[{name:'name',label:'Reward name',value:reward.name},{name:'teaser',label:'Locked reward teaser',value:reward.teaser??reward.name},{name:'description',label:'Unlocked description',value:reward.description??'',type:'textarea'},{name:'tags',label:'Tags (comma separated)',value:(reward.tags??[]).join(', ')},{name:'behavior',label:'Behavior',value:reward.behavior??'one_time',type:'select',options:[{value:'one_time',label:'One time'},{value:'repeatable_service',label:'Repeatable service'},{value:'passive',label:'Passive'}]},{name:'usage_limit',label:'Usage limit (0 = unlimited)',value:reward.usage_limit??0,type:'number'}]);if(v===null)return;const {name,teaser,description,tags,behavior}=v;if(!['one_time','repeatable_service','passive'].includes(behavior))throw Error('Invalid reward behavior.');const limit=Number(v.usage_limit);if(!Number.isSafeInteger(limit)||limit<0)throw Error('Invalid usage limit.');Object.assign(reward,{name:name.trim(),teaser,description,tags:tags.split(',').map(s=>s.trim()).filter(Boolean),behavior,usage_limit:limit});await fillRewardItemId(reward);await saveChange(doc,f);await this.render({force:true});}catch(e){notifyError(e)}}
  static async removeReward(e,t){try{assertGM();const doc=definition(this.#cur),f=loadDef(doc),id=t.dataset.reward;if(game.journal.some(d=>{const state=getGroup(d)??getPersonal(d);return state&&(state.claims?.[id]||Object.values(state.requests??{}).some(r=>r.reward_id===id))}))throw Error('Reward has recorded claims or requests; do not delete its identity.');const reward=f.rewards.find(r=>r.id===id),held=reward?.kind==='uuid'?await loadDoc(reward.uuid):null,holding=isHoldingCopy(held)?held:null;if(!await confirmDialog(`Remove "${reward?.name??'this reward'}" from ${f.name}?${holding?' Its GM-only holding copy in the Items sidebar is deleted too.':''} This is not undone.`,{title:'Remove this reward?',yes:'Remove reward',danger:true}))return;f.rewards=f.rewards.filter(r=>r.id!==id);await saveChange(doc,f);if(holding&&!defs().some(d=>(getFaction(d)?.rewards??[]).some(r=>r.uuid===holding.uuid)))await deleteWorldItems((await bundleOf(holding)).map(i=>i.id));await this.render({force:true});}catch(e){notifyError(e)}}
  static async claim(e,t){try{requirePlayerAccess();if(game.user.isGM){ui.notifications.warn('Test claims as a player.');return;}const view=getView(userViewDoc(game.user)),f=viewEntry(view,this.#cur);if(!f||!activeGM())throw Error('Entry or online GM unavailable.');const audience=t.dataset.audience,actor=audience==='individual'?game.actors.get(this.#actor):null;if(audience==='individual'&&!actor)throw Error('Choose your assigned character.');const msg={type:'request',factionId:f.id,actorId:actor?.id??null,rewardId:t.dataset.reward,audience,userId:game.user.id,capability:view.capability};sendClientAction(msg);ui.notifications.info('Request sent; awaiting GM confirmation...');}catch(e){notifyError(e)}}
  static async resolveRequest(e,t){try{assertGM();const doc=game.journal.get(t.dataset.doc),group=Boolean(getGroup(doc)),key=group?'groupClaims':'individual',state=structuredClone(doc?.getFlag(MODULE_ID,key)),fdoc=definition(state?.faction_id),f=loadDef(fdoc),action=t.dataset.mode;const one=Boolean(t.dataset.claim),id=t.dataset.key;
    if(!state||!fdoc)throw Error('Request record missing.');const record=one?state.claims?.[id]:state.requests?.[id],reward=f.rewards.find(r=>r.id===(one?id:record?.reward_id));if(!record||!reward)throw Error('Request no longer exists.');
    if(action==='deny'){if(!['pending','requested','approved'].includes(record.status))throw Error('Cannot deny completed request.');
      const who=state.actor_id?game.actors.get(state.actor_id)?.name??'this character':'the group';
      if(!await confirmDialog(`Deny the request for "${reward.name}" from ${who}? The player is not told why, and this is not undone.`,{title:'Deny this request?',yes:'Deny request',danger:true}))return;
      record.status='denied';record.usage_charged=false;}
    else if(action==='approve'){
      if(!['pending','requested'].includes(record.status))throw Error('Request already reviewed.');if(!rewardUnlocked(reward,f,state.standing.score))throw Error('Renown no longer qualifies.');if(!chooseOneEligible({faction:f,reward,claims:state.claims,choices:state.choices}))throw Error('Another Choose One reward already confirmed.');
      record.status='approved';record.gm_confirmed_by=game.user.id;state.choices??={};const milestone=(reward.audience==='group'?f.renown_track:f.individual_track).milestones.find(m=>m.id===reward.milestone_id);if(milestone?.selection_mode==='choose_one')state.choices[milestone.id]=reward.id;
      if(one&&reward.kind==='uuid'){
        const recipient=group?game.actors.get(this.element.querySelector(`[name="recipient-${id}"]`)?.value):game.actors.get(state.actor_id);
        // A missing item keeps the request pending (nothing is written) so the GM can fix the reward and approve again.
        if(recipient&&isItemReward(reward)){if(group&&!assignedActors().some(a=>a.id===recipient.id))throw Error('Recipient is not an assigned player character.');
          const source=await rewardSource(reward);if(!source){ui.notifications.error(`Renown: ${missingItemText(reward)}`);return;}
          await grantItem(recipient,reward,record,f,source);record.status='claimed';record.delivered_to=recipient.id;}
      }
    }else if(action==='fulfill'){
      if(!['approved'].includes(record.status))throw Error('Only approved requests can be fulfilled.');
      if(one){record.status='claimed';record.delivered_at=new Date().toISOString();}
      else{const remaining=reward.usage_limit?reward.usage_limit-(state.uses?.[reward.id]?.consumed??0):Infinity;if(remaining<=0)throw Error('Usage limit exhausted.');record.status='fulfilled';record.usage_charged=true;record.fulfilled_at=new Date().toISOString();state.uses??={};const counter=state.uses[reward.id]??{consumed:0,reset_count:0};counter.consumed++;state.uses[reward.id]=counter;}
    }else throw Error('Invalid request action.');
    await doc.setFlag(MODULE_ID,key,state);await reproject();await this.render({force:true});
  }catch(e){notifyError(e)}}
  static async resetUsage(e,t){try{assertGM();const doc=definition(this.#cur),f=loadDef(doc),aud=t.dataset.audience,actor=aud==='individual'?game.actors.get(this.#actor):null,store=aud==='group'?await ensureGroup(doc):actor?await ensurePersonal(doc,actor):null;if(!store)throw Error('No selected character.');const key=aud==='group'?'groupClaims':'individual',state=structuredClone(store.getFlag(MODULE_ID,key)),reward=f.rewards.find(r=>r.id===t.dataset.reward);if(reward?.behavior!=='repeatable_service')throw Error('Not a service.');if(!await confirmDialog(`Reset the used charges of "${reward.name}"? Fulfilled request history stays.`,{title:'Reset service charges?',yes:'Reset charges',danger:true}))return;state.uses??={};const old=state.uses[reward.id]??{consumed:0,reset_count:0};state.uses[reward.id]={consumed:0,reset_count:old.reset_count+1};await store.setFlag(MODULE_ID,key,state);await reproject();await this.render({force:true});}catch(e){notifyError(e)}}
  static async resetChoice(e,t){try{assertGM();const fdoc=definition(this.#cur),audience=t.dataset.audience,actor=audience==='individual'?game.actors.get(this.#actor):null,doc=audience==='group'?await ensureGroup(fdoc):actor?await ensurePersonal(fdoc,actor):null;if(!doc)throw Error('Choose an assigned character first.');const key=audience==='group'?'groupClaims':'individual',state=structuredClone(doc.getFlag(MODULE_ID,key));if(!await confirmDialog('Clear this milestone choice so another reward can be chosen? Items or benefits already granted are not removed.',{title:'Clear this milestone choice?',yes:'Clear choice',danger:true}))return;state.choices??={};state.choices[t.dataset.milestone]=null;await doc.setFlag(MODULE_ID,key,state);await reproject();await this.render({force:true});}catch(e){notifyError(e)}}
  static async openLinked(e,t){try{requirePlayerAccess();const uuid=t.dataset.uuid;if(!uuid)throw Error('No document link.');const doc=await fromUuid(uuid);if(!doc||!(doc.testUserPermission?.(game.user,OBS)||(doc.parent?.documentName==='Actor'&&doc.parent.testUserPermission?.(game.user,OWNER))))throw Error('Document access is not permitted.');doc.sheet.render(true);}catch(e){notifyError(e)}}
  static importJson(){try{assertGM();this.element.querySelector('[name=faction-import-file]')?.click();}catch(e){notifyError(e)}}
  async importFile(input){
    const file=input.files?.[0];input.value='';if(!file)return;
    try{
      assertGM();
      if(file.size>2_000_000)throw Error('File too large (over 2 MB).');
      let data;try{data=JSON.parse(await file.text());}catch{throw Error('That file is not valid JSON.');}
      const {errors,rows}=previewFactionsImport(data);
      if(errors.length)throw Error(errors.slice(0,5).join(' | '));
      const fresh=rows.filter(r=>r.action==='new').length;
      const list=rows.map(r=>`${r.action==='new'?'New':'Already here'} · ${r.kind==='deity'?'Deity':'Faction'} · ${r.name}`).join('\n');
      if(!fresh){ui.notifications.info('Nothing to import: every faction and deity in that file is already in this world.');return;}
      const ok=await confirmDialog(`Add ${fresh} of ${rows.length} entries from ${file.name}?\n${list}\nExisting factions and deities, their Renown and discovery are never changed.`,{title:'Import these definitions?',yes:'Import'});
      if(!ok)return;
      const result=await importFactions(data);
      ui.notifications.info(`Renown imported: ${result.added.length} added, ${result.skipped.length} kept as they were.${result.missingActors.length?` No character named: ${result.missingActors.join(', ')} (import the Manager pack first); their personal Renown was skipped.`:''}`);
      await this.render({force:true});
    }catch(e){notifyError(e)}
  }
  static async exportAll(){try{assertGM();jsonDownload({schema_version:IMPORT_SCHEMA,definitions:defs().map(d=>sourceDefinition(getFaction(d))),note:'Excludes all mutable campaign state and user discovery state.'},'AG_Factions_Definitions.json');}catch(e){notifyError(e)}}
}
/** One character's standing with every deity that character knows. Players: only characters they own, from their
 * projected view, so nothing unrevealed is ever read. GM: from the definitions. Returns [] when nothing is visible. */
function pantheonFor(actorOrId){
  requirePlayerAccess();const actor=typeof actorOrId==='string'?game.actors.get(actorOrId):actorOrId;
  if(!actor?.id)return [];
  if(!game.user.isGM){
    if(!canActor(game.user,actor))return [];
    const list=getView(userViewDoc(game.user))?.payload?.deities??[];
    return pantheonRows(list,x=>x.personal?.[actor.id]??null);
  }
  const list=deityDefs().map(d=>loadDef(d)).filter(f=>discoverable({discovery:f.discovery,actorIds:[actor.id]}));
  return pantheonRows(list,f=>{const score=getPersonal(personalDoc(f.id,actor.id))?.standing?.score??0,p=progressFor(f.individual_track,score);return{score,rank:p.rank.name,next:p.next?{name:p.next.name,threshold:p.next.threshold}:null,remaining:p.remaining,percent:p.percent};});
}
const viewEntry=(view,id)=>[...(view?.payload?.factions??[]),...(view?.payload?.deities??[])].find(x=>x.id===id);
/** GM Setup backfill card: the last Check rewards result, grouped (null before the first check). */
const backfillView=r=>{if(!r)return null;const row=x=>({...x,label:`${x.faction} · ${x.reward}`});
  const n=r.written??0;
  return {checked:true,written:n,writtenText:`Filled in ${n} permanent item id${n===1?'':'s'}.`,fill:r.fill.map(row),noId:r.noId.map(row),missing:r.missing.map(row),empty:!r.fill.length&&!r.noId.length&&!r.missing.length};};
/** Milestone cards for the template: current milestone marked, rewards carrying their claim wording. */
const decorateTrack=(ms,score,{audience,claimLabel,passiveLabel})=>markCurrent(ms,score).map(m=>({...m,rewards:(m.rewards??[]).map(r=>({...r,audience,claimLabel,passiveLabel}))}));
const GROUP_TRACK={audience:'group',claimLabel:'Claim for group',passiveLabel:'Available privilege'},PERSONAL_TRACK={audience:'individual',claimLabel:'Claim reward',passiveLabel:'Available privilege'},FAVOUR_TRACK={audience:'individual',claimLabel:'Claim reward',passiveLabel:'Available blessing'};
// `looks` (reward id → rewardLook) adds the item picture, permanent id and Missing badge in the GM reward editor.
const editorLevels=(track,rewards,audience=null,looks=null)=>track.milestones.map((m,i)=>({...m,order:i+1,rewards:rewards.filter(r=>(!audience||r.audience===audience)&&r.milestone_id===m.id).map(r=>({...r,...(looks?.get(r.id)??{})})),isAll:m.selection_mode==='all',isOne:m.selection_mode==='choose_one'}));
function rankOf(ms,score){return[...ms].reverse().find(m=>score>=m.threshold)?.name??'Unproven';}
/* ---- 0.10.0: embed API. A partner module (Character Hub) mounts a compact, read-only standing list for one character:
   each faction this user may see, with party and this character's rank and score, the next milestone, and Open.
   Built from the same sources as the dashboard: GM state for the GM, the user's own filtered player view for players.
   Claims, requests and GM awards stay in the Factions window. ---- */
const EMBED_MODES=new Set(['character']);
const embeds=new Set();
const nextOf=(ms,score)=>[...ms].sort((a,b)=>a.threshold-b.threshold).find(m=>m.threshold>score)??null;
/** Rows for the embed. `personal` is null when this user may not see that character's standing (not theirs). */
function standingRows(actorId){
  if(game.user.isGM){
    return factionDefs().map(d=>{const f=upgradeFaction(loadDef(d)),g=getGroup(groupDoc(f.id))??makeGroupRecord({factionId:f.id}),p=actorId?getPersonal(personalDoc(f.id,actorId)):null;
      const gs=g?.standing?.score??0,ps=p?.standing?.score??0;
      return {id:f.id,name:f.name,group:{score:gs,rank:progressFor(f.renown_track,gs).rank.name,next:nextOf(f.renown_track.milestones,gs)},
        personal:actorId?{score:ps,rank:progressFor(f.individual_track,ps).rank.name,next:nextOf(f.individual_track.milestones,ps)}:null};});
  }
  const view=getView(userViewDoc(game.user))?.payload;
  return (view?.factions??[]).map(f=>{const gms=f.groupTrack?.milestones??[],gs=f.group?.score??0,mine=f.personal?.[actorId];
    const pms=mine?.milestones??f.individualTrack?.milestones??[],ps=mine?.score??0;
    return {id:f.id,name:f.name,group:{score:gs,rank:rankOf(gms,gs),next:nextOf(gms,gs)},personal:mine?{score:ps,rank:rankOf(pms,ps),next:nextOf(pms,ps)}:null};});
}
function embedHTML(ctrl){
  if(!playerMayOpen())return '<div class="ag-empty">The GM has hidden Renown.</div>';
  const actor=ctrl.actorId?game.actors.get(ctrl.actorId):null,rows=standingRows(ctrl.actorId);
  // 0.11.0: this character's favour with each deity they know (same permission path as api.getPantheon).
  const gods=actor?pantheonFor(actor):[];
  if(!rows.length&&!gods.length)return '<div class="ag-empty">No organizations or deities known yet.</div>';
  const signed=n=>n>0?`+${n}`:String(n);
  const cell=(label,s)=>s?`<div class="agf-embed__cell"><small>${esc(label)}</small><strong>${esc(s.rank)}</strong><span class="agf-embed__score">${signed(s.score)}</span>${s.next?`<span class="agf-embed__next">Next: ${esc(s.next.name)} at ${s.next.threshold}</span>`:'<span class="agf-embed__next">Top rank</span>'}</div>`:'';
  const hidden=!game.user.isGM&&actor&&rows.every(r=>!r.personal);
  return `<div class="agf-embed__body">${rows.map(r=>`<section class="agf-embed__row" data-faction="${esc(r.id)}"><header><strong>${esc(r.name||'Unknown Organization')}</strong>
      <button type="button" class="ag-btn ag-btn--sm" data-agf-embed="open" data-faction="${esc(r.id)}" data-tooltip="Open in Renown" data-tooltip-class="ag-tooltip">Open</button></header>
      <div class="agf-embed__cells">${cell(groupLabel(),r.group)}${cell(actor?.name??'Character',r.personal)}</div></section>`).join('')}
    ${hidden?`<p class="agf-embed__note">${esc(actor.name)}'s own standing shows to their owner.</p>`:''}${gods.length?`<h3 class="agf-embed__heading">Pantheon</h3>${gods.map(g=>`<section class="agf-embed__row agf-embed__deity" data-deity="${esc(g.id)}"><header><span class="agf-symbol agf-symbol--small">${g.symbol?`<img class="agf-symbol-img" src="${esc(g.symbol)}" alt="">`:''}<i class="fa-solid fa-sun agf-symbol-glyph" aria-hidden="true"></i></span><strong>${esc(g.name)}</strong>${g.title?` <small>${esc(g.title)}</small>`:''}
      <button type="button" class="ag-btn ag-btn--sm" data-agf-embed="open-deity" data-deity="${esc(g.id)}" data-tooltip="Open in Renown" data-tooltip-class="ag-tooltip">Open</button></header>
      <div class="agf-embed__cells">${cell(`${g.tierLabel} deity`,{score:g.score,rank:g.rank,next:g.next})}</div></section>`).join('')}`:''}</div>`;
}
/** api.embed.mount(element, {actorId, mode:'character'}) → {unmount, refresh}. Read-only. */
function mountEmbed(element,{actorId=null,mode='character'}={}){
  if(!element||typeof element.addEventListener!=='function')throw TypeError('mount needs a DOM element.');
  if(!EMBED_MODES.has(mode))throw Error(`Unknown embed mode "${mode}". Supported: ${[...EMBED_MODES].join(', ')}.`);
  const abort=new AbortController(),ctrl={actorId:actorId?String(actorId):null,mounted:true};
  element.classList?.add('agf-embed');
  ctrl.render=()=>{if(!ctrl.mounted)return;if(element.isConnected===false){ctrl.unmount();return;}element.innerHTML=embedHTML(ctrl);};
  ctrl.unmount=()=>{if(!ctrl.mounted)return;ctrl.mounted=false;abort.abort();embeds.delete(ctrl);element.innerHTML='';element.classList?.remove('agf-embed');};
  // A missing holy-symbol image falls back to the glyph (error events do not bubble, so listen in capture).
  element.addEventListener('error',e=>{if(e.target?.matches?.('img.agf-symbol-img'))e.target.closest('.agf-symbol')?.classList.add('is-missing');},{capture:true,signal:abort.signal});
  element.addEventListener('click',e=>{
    const d=e.target?.closest?.('[data-agf-embed="open-deity"]');
    if(d&&element.contains(d)){e.preventDefault?.();e.stopPropagation?.();try{openDashboard({deityId:d.dataset.deity,actorId:ctrl.actorId,tab:'pantheon'});}catch(err){notifyError(err);}return;}
    const b=e.target?.closest?.('[data-agf-embed="open"]');if(!b||!element.contains(b))return;
    e.preventDefault?.();e.stopPropagation?.();
    try{openDashboard({factionId:b.dataset.faction,actorId:ctrl.actorId,tab:ctrl.actorId?'player':'group'});}catch(err){notifyError(err);}
  },{signal:abort.signal});
  embeds.add(ctrl);ctrl.render();
  return {unmount:ctrl.unmount,refresh:()=>ctrl.render()};
}
const refreshEmbeds=()=>{for(const e of [...embeds])e.render();};
let dashboard=null;
const openDashboard=(options={})=>{
  requirePlayerAccess();
  dashboard??=new Dashboard();
  if(options&&typeof options==='object')dashboard.focus(options);
  dashboard.render({force:true});
  return dashboard;
};
function attachLauncher(app,html,visible=playerMayOpen()){
  return mountLauncher(launcherRoot(app,html),{moduleId:MODULE_ID,label:'Renown',title:'Renown',icon:'fa-solid fa-shield-halved',onClick:openDashboard,visible});
}
// Called after a world setting change and from the GM API. No campaign-state writes.
async function applyPlayerAccess(enabled=playerAccessEnabled()){
  attachLauncher(ui.actors,null,game.user.isGM||enabled);
  if(!game.user.isGM&&!enabled&&dashboard?.rendered){
    try{await dashboard.close({animate:false});}catch(e){console.error(`[${MODULE_ID}] Failed to close player interface`,e);}
  }
}
function accessSettingChanged(setting){
  if(setting?.key!==`${MODULE_ID}.playerAccessEnabled`)return;
  // A world setting's update hook is synchronized on connected clients.
  // Use the changed value to avoid a cache-timing race with game.settings.get.
  const value=setting.value===true||setting.value==='true';
  void applyPlayerAccess(value);
}
Hooks.on('renderActorDirectory',(app,html)=>attachLauncher(app,html));
Hooks.once('init',()=>{
  game.settings.register(MODULE_ID,'groupName',{name:'Group display name',scope:'world',config:false,type:String,default:''});
  game.settings.register(MODULE_ID,'pantheonDamping',{name:'Pantheon knock-on damping',scope:'world',config:false,type:Number,default:DAMPING_DEFAULT});
  game.settings.register(MODULE_ID,'groupNameEnabled',{name:'Custom group name enabled',scope:'world',config:false,type:Boolean,default:false});
  game.settings.register(MODULE_ID,'playerAccessEnabled',{
    name:'Renown — Player Access',
    hint:'Show or hide the Renown interface for players. This does not change Renown, claims, character abilities, or document permissions.',
    scope:'world',config:true,type:Boolean,default:true,restricted:true,
    onChange:enabled=>{void applyPlayerAccess(enabled===true);}
  });
});
Hooks.once('ready',()=>{
  const mod=game.modules.get(MODULE_ID);
  if(mod)mod.api=Object.freeze({
    open:openDashboard,
    embed:Object.freeze({contract:'ag-factions-embed/1',modes:Object.freeze([...EMBED_MODES]),mount:mountEmbed}),
    getFactions:()=>{requirePlayerAccess();return game.user.isGM?factionDefs().map(d=>sourceDefinition(getFaction(d))):getView(userViewDoc(game.user))?.payload.factions??[];},
    validateFaction,
    // Pantheon read API. Players get only deities revealed to one of their characters (their projected view).
    getDeities:()=>{requirePlayerAccess();return game.user.isGM?deityDefs().map(d=>sourceDefinition(getFaction(d))):structuredClone(getView(userViewDoc(game.user))?.payload?.deities??[]);},
    getPantheon:actor=>pantheonFor(actor),
    // GM-only, additive: adds factions that are not in the world yet (see scripts/import.mjs). Existing factions are never changed.
    previewFactionsImport:data=>previewFactionsImport(data),
    importFactions:data=>importFactions(data),
    // Optional read-only GM source relationship API. It never resolves or reveals Quest state.
    refreshPlayerViews:async()=>{assertGM();await reproject();return {status:'requested'};},
    getObjectiveRefs:(factionId)=>{assertGM();const doc=definition(factionId);if(!doc)throw Error('Faction not found.');return structuredClone(objectiveRefs(getFaction(doc)));},
    // GM-only diagnostic: Quest owns Objective kind, adoption and reveal, not Factions.
    auditObjectiveRefs:(factionId)=>{assertGM();const doc=definition(factionId);if(!doc)throw Error('Faction not found.');return structuredClone(auditObjectiveRefs(getFaction(doc),game.modules.get('ashen-gate-quest-manager')));},
    playerAccess:Object.freeze({contract:PLAYER_ACCESS_CONTRACT,getState:playerAccessState,setEnabled:setPlayerAccess}),
    // 0.14.0, GM only: fill in permanent item ids of item rewards (dry run unless {dryRun:false}).
    rewards:Object.freeze({contract:'ag-renown-rewards/1',backfillItemIds:options=>backfillItemIds(options)})
  });
  attachLauncher(ui.actors);
  game.socket.on(SOCKET,msg=>{
    if(msg?.type==='receipt')clientReceipt(msg);
    else if(['request','share'].includes(msg?.type))void incoming(msg);
    else if(msg?.type==='refresh'&&dashboard?.rendered&&playerMayOpen())void dashboard.render({force:true});
  });
  for(const hook of ['updateJournalEntry','createJournalEntry','deleteJournalEntry'])Hooks.on(hook,()=>{
    refreshEmbeds();
    if(dashboard?.rendered&&playerMayOpen())void dashboard.render({force:true});
  });
  Hooks.on('updateSetting',setting=>{
    refreshEmbeds();
    if(setting?.key===`${MODULE_ID}.playerAccessEnabled`){
      accessSettingChanged(setting);
      return; // Do not rerender a freshly restricted player window.
    }
    if(dashboard?.rendered&&playerMayOpen())void dashboard.render({force:true});
  });
  if(game.user.isGM&&activeGM()?.id===game.user.id)void migrate().catch(notifyError);
  console.info(`[${MODULE_ID}] v${moduleVersion()}; Actors launcher; Player Access ${playerAccessEnabled()?'enabled':'hidden'}; GM-only definitions + filtered player views.`);
});
