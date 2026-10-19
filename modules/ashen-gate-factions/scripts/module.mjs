/** Factions & Renown v0.6.0 Beta; Foundry V14 target. No mandatory companion module. */
import {MODULE_ID,SCHEMA_VERSION,RECOVERED_GUILDS_DRAFT,makeFaction,upgradeFaction,sourceDefinition,validateFaction,blankStanding,adjustStanding,progressFor,milestoneProjection,discoverable,projectedFolders,grantAutoKnowledge,secureEntryPreview,claimEligible,chooseOneEligible,rewardUnlocked,makeGroupRecord,makePersonalRecord,keyFor,overlayCampaign,extractCampaignDiscovery,fieldDisclosure,disclosedField,revealField,FIELD_KEYS} from './core.mjs';
import {launcherRoot,mountLauncher} from './ag-launchers.mjs';
import {addObjectiveRef,removeObjectiveRef,objectiveRefs,auditObjectiveRefs} from './objective-refs.mjs';
import {planImport,runImport} from './import.mjs';
import {orgRow,listOrgsTab,CHIPS as ORG_CHIPS,SORTS as ORG_SORTS,GROUPS as ORG_GROUPS,DEFAULT_VIEW as ORG_VIEW} from './orgs-tab.mjs';
const {ApplicationV2,HandlebarsApplicationMixin}=foundry.applications.api;
const OBS=CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,NONE=CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,OWNER=CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
const rid=()=>foundry.utils.randomID(24).toUpperCase().replace(/[^A-Z0-9]/g,'');
const idPair=()=>{const x=rid();return{id:`FACTION-${x}`,trackId:`RENOWN-${x}`};};
const assertGM=()=>{if(!game.user?.isGM)throw Error('GM authorization required.');};
// DEC-0072 — the Factions module owns its own world-scoped UI access switch.
// Default true preserves the previous player-facing behavior for upgraded worlds.
const PLAYER_ACCESS_CONTRACT='ag-player-access/1';
const playerAccessEnabled=()=>game.settings.get(MODULE_ID,'playerAccessEnabled')===true;
const playerMayOpen=()=>Boolean(game.user?.isGM||playerAccessEnabled());
function requirePlayerAccess(){
  if(!playerMayOpen())throw Error('Factions & Renown is hidden from players. Ask your GM to enable Player Access.');
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
const BUILD_VERSION='0.8.0';
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
const notifyError=e=>{console.error(`[${MODULE_ID}]`,e);ui.notifications?.error(`Factions: ${e.message??e}`);};
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
  const safe={...r,grantedUuid,canViewGranted:Boolean(grantedUuid)};
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
function buildPlayerPayload(user){
  const factions=defs().map(d=>loadDef(d)),actorIds=ownedActorIds(user),groups=new Map(game.journal.filter(d=>getGroup(d)).map(d=>[getGroup(d).faction_id,getGroup(d)]));
  const visibleFactions=factions.map(f=>{
    const people=new Map(game.journal.filter(d=>getPersonal(d)?.faction_id===f.id).map(d=>[getPersonal(d).actor_id,getPersonal(d)]));
    return maskedFaction(f,groups.get(f.id),people,actorIds,user);
  }).filter(Boolean);
  const safeLabels=new Map(visibleFactions.map(f=>[f.id,f.name]));
  const shown=projectedFolders({folders:folderList(),factions,actorIds}).map(folder=>({key:folder.key,
    name:folder.known.some(f=>safeLabels.get(f.id)!=='Unknown Organization')?folder.name:'Unknown Organization',
    known:folder.known.map(f=>f.id),unknown_count:folder.unknown.length}));
  return{version:SCHEMA_VERSION,groupLabel:groupLabel(),folders:shown,factions:visibleFactions};
}
async function projectAll(){assertGM();if(activeGM()?.id!==game.user.id)return;for(const user of game.users.filter(u=>!u.isGM)){const doc=await ensureView(user),record=structuredClone(getView(doc));record.payload=buildPlayerPayload(user);const ownership={default:NONE,[user.id]:OBS};await doc.update({ownership,[`flags.${MODULE_ID}.playerView`]:record});}
  game.socket.emit(`module.${MODULE_ID}`,{type:'refresh'});
}
let projecting=false;
async function reproject(){if(!game.user.isGM||activeGM()?.id!==game.user.id||projecting)return;projecting=true;try{await projectAll()}catch(e){notifyError(e)}finally{projecting=false;}}
async function migrate(){assertGM();await folderRecord();for(const doc of defs()){
  const original=getFaction(doc),legacy=Boolean(original?.state?.party||!original?.discovery);
  let f=upgradeFaction(original);if(legacy&&doc.ownership.default>=OBS)f.discovery.party=true;
  const group=await ensureGroup(doc),state=structuredClone(getGroup(group));state.standing??=original.state?.party??blankStanding();state.requests??={};state.uses??={};state.claims??={};state.choices??={};await group.setFlag(MODULE_ID,'groupClaims',state);
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
const previewFactionsImport=data=>{const {errors,rows}=planFactionsImport(data);return {errors,rows:rows.map(({id,name,action,reason})=>({id,name,action,reason}))};};
const findKnownUser=(id,user)=>buildPlayerPayload(user).factions.find(x=>x.id===id);
function requestAuthorized(msg){if(!playerAccessEnabled())throw Error('Factions player interface is hidden.');const user=game.users.get(msg.userId),vdoc=user&&userViewDoc(user),v=getView(vdoc);if(!user?.active||user.isGM||!v||v.capability!==msg.capability||!vdoc.testUserPermission(user,OBS))throw Error('Invalid requester authentication.');return user;}
function sendClientAction(message){
  if(!activeGM())throw Error('An online GM is required to process Faction requests.');
  if(!game.socket?.emit)throw Error('Factions socket is unavailable.');
  const requestId=`action_${rid()}`;pendingReplies.set(requestId,{when:Date.now(),type:message.type});
  game.socket.emit(SOCKET,{...message,requestId});
  // Reconnecting/reloading clears pending UI notice, not campaign requests.
  return requestId;
}
function clientReceipt(msg){
  if(msg?.type!=='receipt'||msg.userId!==game.user?.id||!pendingReplies.has(msg.requestId))return;
  pendingReplies.delete(msg.requestId);
  if(msg.ok)ui.notifications.info(msg.message??'Faction action completed.');
  else ui.notifications.error('Faction request was not accepted. Ask the GM to check their notifications.');
}
const inFlight=new Set();
async function incoming(msg){if(!['share','request'].includes(msg?.type)||!game.user.isGM||activeGM()?.id!==game.user.id)return;let accepted=false;const requestLock=[msg?.type,msg?.factionId,msg?.audience,msg?.actorId,msg?.rewardId,msg?.userId].join('/');if(inFlight.has(requestLock))return;inFlight.add(requestLock);try{
  const user=requestAuthorized(msg),fdoc=definition(msg.factionId);if(!fdoc)throw Error('Faction missing.');const f=loadDef(fdoc),actorIds=ownedActorIds(user);if(!discoverable({discovery:f.discovery,actorIds}))throw Error('Faction undiscovered for this player.');
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
}catch(e){notifyError(e)}finally{inFlight.delete(requestLock);if(msg?.requestId&&msg?.userId)game.socket?.emit(SOCKET,{type:'receipt',userId:msg.userId,requestId:msg.requestId,ok:accepted,message:msg.type==='share'?'Discovery shared with party.':'Faction request received by GM.'});}}
async function grantItem(actor,reward,claim,faction){const source=await fromUuid(reward.uuid);if(!source||source.documentName!=='Item')throw Error('Item source unavailable.');if(actor.items.some(i=>i.getFlag(MODULE_ID,'claimId')===claim.request_id))return;const data=source.toObject();delete data._id;delete data.folder;data.flags??={};data.flags[MODULE_ID]={...(data.flags[MODULE_ID]??{}),claimId:claim.request_id,rewardId:reward.id,factionId:faction.id};await actor.createEmbeddedDocuments('Item',[data]);}
class Dashboard extends HandlebarsApplicationMixin(ApplicationV2){
  static DEFAULT_OPTIONS={id:'ashen-gate-factions-window',classes:['ag-app','ashen-gate-factions'],window:{title:'Ashen Gate | Factions & Renown',icon:'fa-solid fa-shield-halved',resizable:true},position:{width:1180,height:800},actions:{savePlayerAccess:Dashboard.savePlayerAccess,select:Dashboard.select,create:Dashboard.create,seed:Dashboard.seed,save:Dashboard.save,award:Dashboard.award,saveGroupLabel:Dashboard.saveGroupLabel,createFolder:Dashboard.createFolder,saveFolder:Dashboard.saveFolder,discovery:Dashboard.discovery,share:Dashboard.share,addEntry:Dashboard.addEntry,showEntry:Dashboard.showEntry,claim:Dashboard.claim,resolveRequest:Dashboard.resolveRequest,resetUsage:Dashboard.resetUsage,addReward:Dashboard.addReward,editReward:Dashboard.editReward,removeReward:Dashboard.removeReward,openLinked:Dashboard.openLinked,resetChoice:Dashboard.resetChoice,saveFieldReveals:Dashboard.saveFieldReveals,addObjective:Dashboard.addObjective,removeObjective:Dashboard.removeObjective,exportAll:Dashboard.exportAll,importJson:Dashboard.importJson}};
  static PARTS={main:{template:`modules/${MODULE_ID}/templates/dashboard.hbs`}};
  #tab='group';#orgsView={...ORG_VIEW};#selected=null;#actor=null;#lastView=null;
  async render(options={}){
    const previous=this.element?.querySelector?.('.agf-main');
    const viewKey=`${this.#tab}:${this.#selected}`;
    const scroll=previous&&this.#lastView===viewKey&&Number.isFinite(previous.scrollTop)?previous.scrollTop:null;
    const opened=previous&&this.#lastView===viewKey?[...previous.querySelectorAll?.('details[data-agf-section]')??[]].filter(el=>el.open).map(el=>el.dataset.agfSection):null;
    const result=await super.render(options);const root=this.element?.querySelector?.('.agf-main');
    if(root&&scroll!==null){root.scrollTop=scroll;if(opened){for(const el of root.querySelectorAll?.('details[data-agf-section]')??[])el.open=opened.includes(el.dataset.agfSection);}}
    this.#lastView=viewKey;return result;
  }
  #gmData(){const list=defs().map(d=>loadDef(d));const folders=projectedFolders({folders:folderList(),factions:list,gm:true}).map(x=>({key:x.key,name:x.name,known:x.known.map(f=>f.id),unknown_count:0}));return{version:SCHEMA_VERSION,groupLabel:groupLabel(),folders,factions:list};}
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
    const detail=f?{id:f.id,name:f.name,leader:f.leader,public_role:f.public_role,tags:f.tags??[],score:groupScore,rank:gf?progressFor(gf.renown_track,groupScore).rank.name:rankOf(groupMs,groupScore),individualScore:actorScore,individualRank:gf?progressFor(gf.individual_track,actorScore).rank.name:rankOf(individualMs,actorScore),groupMs,individualMs,entries:knownEntries,canShare:!isGM&&f.canShare,groupEvents:[...groupEvents].reverse().slice(0,35).map(event),personalEvents:[...personalEvents].reverse().slice(0,35).map(event),folder_key:gf?.folder_key??f.folder_key,discovery:gf?.discovery??null,rewards:gf?.rewards??[],trackGroup:gf?.renown_track,trackPersonal:gf?.individual_track}:null;
    const factionMap=new Map(known.map(f=>[f.id,f.name]));const folders=(data.folders??[]).map(folder=>({...folder,factions:folder.known.map(id=>({id,name:factionMap.get(id),selected:id===this.#selected})),unknown:Array.from({length:folder.unknown_count??0},(_,i)=>({index:i}))}));
    const requestRows=isGM&&gf?this.#queue(gf):[];
    if(!isGM&&['orgs','setup'].includes(this.#tab))this.#tab='group';
    const orgsView=this.#orgsView,orgs=isGM?this.#orgsList(orgsView):{total:0,shown:0,groups:[]};
    for(const g of orgs.groups)for(const r of g.rows){r.selected=r.id===this.#selected;r.chipKey=r.chip.toLowerCase().replace(/[^a-z]+/g,'-');}
    const opt=(items,v)=>items.map(x=>{const [value,label]=Array.isArray(x)?x:[x,x];return{value,label,selected:value===v};});
    const orgsOptions={status:opt([['all','All'],...ORG_CHIPS],orgsView.status),sort:opt(ORG_SORTS,orgsView.sort),group:opt(ORG_GROUPS,orgsView.group)};
    return {...ctx,isGM,detail,folders,hasData:Boolean(detail),tabGroup:this.#tab==='group',tabPlayer:this.#tab==='player',tabOrgs:isGM&&this.#tab==='orgs',tabSetup:isGM&&this.#tab==='setup',showHeader:Boolean(detail)&&!(isGM&&this.#tab==='setup'),orgs,orgsView,orgsOptions,groupLabel:groupLabel(),actorChoices:actorChoices.map(a=>({id:a.id,name:a.name,selected:a.id===this.#actor})),actorId:this.#actor,gmQueue:requestRows,foldersForSelect:[{key:'',name:'Other Factions',selected:!detail?.folder_key},...folderList().map(q=>({...q,selected:detail?.folder_key===q.key}))],groupName:game.settings.get(MODULE_ID,'groupName'),groupNameEnabled:game.settings.get(MODULE_ID,'groupNameEnabled'),playerAccessEnabled:playerAccessEnabled(),hasActiveGM:Boolean(activeGM()),gmKnown:gf,gmObjectiveRefs:gf?auditObjectiveRefs(gf,game.modules.get('ashen-gate-quest-manager')):[],gmGroupLevels:gf?.renown_track.milestones.map(m=>({...m,rewards:gf.rewards.filter(r=>r.audience==='group'&&r.milestone_id===m.id),isAll:m.selection_mode==='all',isOne:m.selection_mode==='choose_one'}))??[],gmPersonalLevels:gf?.individual_track.milestones.map(m=>({...m,rewards:gf.rewards.filter(r=>r.audience==='individual'&&r.milestone_id===m.id),isAll:m.selection_mode==='all',isOne:m.selection_mode==='choose_one'}))??[],serviceRewards:gf?.rewards.filter(r=>r.behavior==='repeatable_service')??[],shareEnabled:gf?.discovery?.sharing_enabled,fieldSelective:gf?.field_reveals?.mode==='selective',gmFieldReveals:gf?FIELD_KEYS.map(key=>({key,label:key==='public_role'?'Description':key==='leader'?'Leader':'Name',party:Boolean(gf.field_reveals?.fields?.[key]?.party),actor:Boolean(gf.field_reveals?.fields?.[key]?.actors?.includes(this.#actor))})):[],canEdit:!!gf,refreshNeeded:!isGM&&!userViewDoc(game.user)};
  }
  /** GM roster rows: every faction, hidden or not, with its group Renown. */
  #orgsList(view){const folders=new Map(folderList().map(x=>[x.key,x.name]));
    const rows=defs().map(d=>{const f=upgradeFaction(loadDef(d)),state=getGroup(groupDoc(f.id))??makeGroupRecord({factionId:f.id}),score=state?.standing?.score??state?.score??0;
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
      if(!['group','player','orgs','setup'].includes(page)||(['orgs','setup'].includes(page)&&!game.user.isGM))return;
      e.preventDefault();
      if(this.#tab===page)return;
      this.#tab=page;
      void this.render({force:true}).catch(notifyError);
    });
    root.addEventListener('change',e=>{const flt=e.target.closest?.('[data-orgs-filter]');if(flt&&game.user.isGM){this.#orgsView[flt.dataset.orgsFilter]=flt.value;void this.render({force:true});return;}if(e.target.matches('[name=faction-import-file]')){void this.importFile(e.target);return;}if(e.target.matches('[name=actor-id]')){const a=accessibleActors().find(a=>a.id===e.target.value);if(a){this.#actor=a.id;void this.render({force:true});}}});
    root.addEventListener('dragstart',e=>{const el=e.target.closest('[data-faction-drag]');if(!game.user.isGM||!el)return;e.dataTransfer.setData('text/ashen-gate-faction',el.dataset.factionDrag);e.dataTransfer.effectAllowed='move';});
    root.addEventListener('dragover',e=>{if(game.user.isGM&&e.target.closest('[data-folder-drop], [data-reward-drop], [data-entry-drop]'))e.preventDefault();});
    root.addEventListener('drop',async e=>{try{if(!game.user.isGM)return;const folder=e.target.closest('[data-folder-drop]');if(folder){const id=e.dataTransfer.getData('text/ashen-gate-faction');if(!id)return;e.preventDefault();const doc=definition(id),f=loadDef(doc);f.folder_key=folder.dataset.folderDrop;await saveChange(doc,f);await this.render({force:true});return;}
      const rewardZone=e.target.closest('[data-reward-drop]'),entryZone=e.target.closest('[data-entry-drop]');if(!rewardZone&&!entryZone)return;e.preventDefault();let drag;try{drag=TextEditor.getDragEventData(e)}catch{drag=JSON.parse(e.dataTransfer.getData('text/plain'))}let uuid=drag?.uuid;if(!uuid&&drag?.id&&drag?.type)uuid=`${drag.type}.${drag.id}`;if(!uuid)throw Error('Drop a Foundry document with a UUID.');const linked=await fromUuid(uuid);if(!linked)throw Error('Document not found.');const doc=definition(this.#selected),f=loadDef(doc);if(rewardZone){f.rewards.push({id:`rw-${rid()}`,key:keyFor('rw_'+rid()),audience:rewardZone.dataset.audience,milestone_id:rewardZone.dataset.milestone,name:linked.name,teaser:linked.name,kind:'uuid',uuid,description:'',tags:[],behavior:'one_time',usage_limit:0});}else{f.entries.push({id:`info_${keyFor(rid())}`,name:linked.name,text:'',uuid,link_mode:'document',unlock:'manual',threshold:0,discovered_party:false,discovered_actors:[]});}await saveChange(doc,f);await this.render({force:true});
    }catch(err){notifyError(err)}});
  }
  static async select(e,t){this.#selected=t.dataset.id;await this.render({force:true});}
  static async create(){try{assertGM();const name=nameValue(this.element,'new-faction-name');if(!name||name.length>120)throw Error('Faction name required (up to 120 characters).');const f=makeFaction({...idPair(),name});const doc=await JournalEntry.create({name,folder:(await ensureStorageFolder()).id,ownership:{default:NONE},flags:{[MODULE_ID]:{faction:f}}});await ensureGroup(doc);this.#selected=f.id;await reproject();await this.render({force:true});}catch(e){notifyError(e)}}
  static async seed(){try{assertGM();if(!window.confirm('Add four unapproved example guilds? Existing names are skipped.'))return;let count=0;for(const g of RECOVERED_GUILDS_DRAFT){if(defs().some(d=>getFaction(d).name.toLowerCase()===g.name.toLowerCase()))continue;const f=makeFaction({...idPair(),...g,initialBenefit:g.initial_benefit,source:'Recovered Fosstryn journal drafts; not canonical'});const d=await JournalEntry.create({name:f.name,folder:(await ensureStorageFolder()).id,ownership:{default:NONE},flags:{[MODULE_ID]:{faction:f}}});await ensureGroup(d);count++;}await reproject();ui.notifications.info(`${count} example guilds added.`);await this.render({force:true});}catch(e){notifyError(e)}}
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
  static async savePlayerAccess(){try{
    assertGM();
    const checked=Boolean(this.element.querySelector('[name=player-access-enabled]')?.checked);
    await setPlayerAccess(checked);
    ui.notifications.info(`Factions player interface ${checked?'visible':'hidden'}.`);
    await this.render({force:true});
  }catch(e){notifyError(e)}}
  static async saveGroupLabel(){try{assertGM();const name=nameValue(this.element,'group-name');if(name.length>100)throw Error('Name too long.');await game.settings.set(MODULE_ID,'groupName',name);await game.settings.set(MODULE_ID,'groupNameEnabled',Boolean(this.element.querySelector('[name=group-name-enabled]')?.checked));await reproject();await this.render({force:true});}catch(e){notifyError(e)}}
  static async award(e,t){try{assertGM();const doc=definition(this.#selected),f=loadDef(doc),scope=t.dataset.scope,zone=t.closest('[data-award-scope]');if(!zone||!['group','individual'].includes(scope))throw Error('Invalid Renown award scope.');const delta=Number(zone.querySelector('[name=renown-delta]')?.value),reason=nameValue(zone,'renown-reason'),args={delta,reason,eventId:`RENOWN-EVT-${rid()}`,when:new Date().toISOString()};
    const actor=scope==='individual'?game.actors.get(this.#actor):null;if(scope==='individual'&&!actor)throw Error('Select a character.');const stateDoc=scope==='group'?await ensureGroup(doc):await ensurePersonal(doc,actor),key=scope==='group'?'groupClaims':'individual',state=structuredClone(stateDoc.getFlag(MODULE_ID,key)),result=adjustStanding(state.standing,args);if(!result.applied)return ui.notifications.warn('No change applied.');state.standing=result.standing;await stateDoc.setFlag(MODULE_ID,key,state);
    const learned=grantAutoKnowledge(f,scope,actor?.id,result.standing.score);if(learned.changed.length)await saveDef(doc,learned.faction);
    await reproject();await this.render({force:true});ui.notifications.info(`${scope==='group'?'Group':actor.name} Renown: ${result.before} → ${result.after}`);
  }catch(e){notifyError(e)}}
  static async createFolder(){try{assertGM();const name=nameValue(this.element,'new-folder-name');if(!name||name.length>100)throw Error('Folder name required (max 100 characters).');const doc=await folderRecord(),entry=structuredClone(getFolders(doc));entry.folders.push({key:`folder_${keyFor(rid())}`,name});await doc.setFlag(MODULE_ID,'folderIndex',entry);await reproject();await this.render({force:true});}catch(e){notifyError(e)}}
  static async saveFolder(e,t){try{assertGM();const d=await folderRecord(),rec=structuredClone(getFolders(d)),folder=rec.folders.find(x=>x.key===t.dataset.key);if(!folder)throw Error('Folder not found.');const name=window.prompt('Folder name:',folder.name);if(name===null)return;if(!name.trim()||name.trim().length>100)throw Error('Invalid name.');folder.name=name.trim();await d.setFlag(MODULE_ID,'folderIndex',rec);await reproject();await this.render({force:true});}catch(e){notifyError(e)}}
  static async discovery(e,t){try{assertGM();const doc=definition(this.#selected),f=loadDef(doc);const action=t.dataset.mode;
    if(action==='party')f.discovery.party=!f.discovery.party;
    else if(action==='actor'){const actor=game.actors.get(this.#actor);if(!actor)throw Error('Select an assigned character.');const arr=f.discovery.actors;f.discovery.actors=arr.includes(actor.id)?arr.filter(i=>i!==actor.id):[...arr,actor.id];}
    else throw Error('Unknown discovery action.');await saveChange(doc,f);await this.render({force:true});}catch(e){notifyError(e)}}
  static async share(){try{requirePlayerAccess();if(game.user.isGM)throw Error('GM can reveal factions directly.');const view=getView(userViewDoc(game.user));if(!view)throw Error('No player discovery record available.');const known=view.payload.factions.find(f=>f.id===this.#selected);if(!known?.canShare)throw Error('You cannot share this faction.');if(!window.confirm(`Share everything you have discovered about ${known.name} with the party? Personal Renown and rewards stay private.`))return;const request={type:'share',factionId:known.id,userId:game.user.id,capability:view.capability};sendClientAction(request);ui.notifications.info('Sharing discovery with party; awaiting GM confirmation...');}catch(e){notifyError(e)}}
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
    if(!window.confirm(`Remove ${ref.relation} → ${ref.target_id} from this faction? This will not change Quest progress.`))return;
    await saveChange(doc,removeObjectiveRef(loadDef(doc),ref));await this.render({force:true});
  }catch(e){notifyError(e)}}
  static async addEntry(e,t){try{assertGM();const zone=t.closest('[data-info-editor]'),doc=definition(this.#selected),f=loadDef(doc),name=nameValue(zone,'info-name');if(!name)throw Error('Entry needs a title.');f.entries.push({id:`info_${keyFor(rid())}`,name,text:nameValue(zone,'info-text'),link_mode:'preview',unlock:zone.querySelector('[name=info-unlock]')?.value??'manual',threshold:Number(zone.querySelector('[name=info-threshold]')?.value??0),discovered_party:false,discovered_actors:[]});await saveChange(doc,f);await this.render({force:true});}catch(e){notifyError(e)}}
  static async showEntry(e,t){try{assertGM();const doc=definition(this.#selected),f=loadDef(doc),entry=f.entries.find(r=>r.id===t.dataset.entry);if(!entry)throw Error('Entry not found.');const action=t.dataset.mode;if(action==='party')entry.discovered_party=!entry.discovered_party;else if(action==='actor'){const actor=game.actors.get(this.#actor);if(!actor)throw Error('Select character first.');entry.discovered_actors??=[];entry.discovered_actors=entry.discovered_actors.includes(actor.id)?entry.discovered_actors.filter(i=>i!==actor.id):[...entry.discovered_actors,actor.id];}else if(action==='mode'){entry.link_mode=entry.link_mode==='preview'?'document':'preview';}else if(action==='edit'){const txt=window.prompt(`Information for ${entry.name}:`,entry.text??'');if(txt===null)return;entry.text=txt;}else if(action==='remove'){if(!window.confirm('Remove this information entry?'))return;f.entries=f.entries.filter(x=>x.id!==entry.id);}await saveChange(doc,f);await this.render({force:true});}catch(e){notifyError(e)}}
  static async addReward(e,t){try{assertGM();const zone=t.closest('[data-reward-drop]'),doc=definition(this.#selected),f=loadDef(doc),name=nameValue(zone,'reward-name');if(!name)throw Error('Reward name required.');f.rewards.push({id:`rw-${rid()}`,key:keyFor('rw_'+rid()),audience:zone.dataset.audience,milestone_id:zone.dataset.milestone,name,teaser:name,description:nameValue(zone,'reward-description'),kind:'custom',tags:[],behavior:zone.querySelector('[name=reward-behavior]')?.value??'one_time',usage_limit:Number(zone.querySelector('[name=reward-limit]')?.value??0)});await saveChange(doc,f);await this.render({force:true});}catch(e){notifyError(e)}}
  static async editReward(e,t){try{assertGM();const doc=definition(this.#selected),f=loadDef(doc),reward=f.rewards.find(r=>r.id===t.dataset.reward);if(!reward)throw Error('Reward not found.');const name=window.prompt('Reward name:',reward.name);if(name===null)return;const teaser=window.prompt('Locked reward teaser:',reward.teaser??reward.name);if(teaser===null)return;const description=window.prompt('Unlocked description:',reward.description??'');if(description===null)return;const tags=window.prompt('Tags (comma separated):',(reward.tags??[]).join(', '));if(tags===null)return;const behavior=window.prompt('Behavior: one_time, repeatable_service, passive',reward.behavior??'one_time');if(behavior===null)return;if(!['one_time','repeatable_service','passive'].includes(behavior))throw Error('Invalid reward behavior.');const limit=Number(window.prompt('Usage limit (0 = unlimited):',reward.usage_limit??0));if(!Number.isSafeInteger(limit)||limit<0)throw Error('Invalid usage limit.');Object.assign(reward,{name:name.trim(),teaser,description,tags:tags.split(',').map(s=>s.trim()).filter(Boolean),behavior,usage_limit:limit});await saveChange(doc,f);await this.render({force:true});}catch(e){notifyError(e)}}
  static async removeReward(e,t){try{assertGM();const doc=definition(this.#selected),f=loadDef(doc),id=t.dataset.reward;if(game.journal.some(d=>{const state=getGroup(d)??getPersonal(d);return state&&(state.claims?.[id]||Object.values(state.requests??{}).some(r=>r.reward_id===id))}))throw Error('Reward has recorded claims or requests; do not delete its identity.');if(!window.confirm('Remove this reward?'))return;f.rewards=f.rewards.filter(r=>r.id!==id);await saveChange(doc,f);await this.render({force:true});}catch(e){notifyError(e)}}
  static async claim(e,t){try{requirePlayerAccess();if(game.user.isGM){ui.notifications.warn('Test claims as a player.');return;}const view=getView(userViewDoc(game.user)),f=view?.payload.factions.find(x=>x.id===this.#selected);if(!f||!activeGM())throw Error('Faction or online GM unavailable.');const audience=t.dataset.audience,actor=audience==='individual'?game.actors.get(this.#actor):null;if(audience==='individual'&&!actor)throw Error('Choose your assigned character.');const msg={type:'request',factionId:f.id,actorId:actor?.id??null,rewardId:t.dataset.reward,audience,userId:game.user.id,capability:view.capability};sendClientAction(msg);ui.notifications.info('Request sent; awaiting GM confirmation...');}catch(e){notifyError(e)}}
  static async resolveRequest(e,t){try{assertGM();const doc=game.journal.get(t.dataset.doc),group=Boolean(getGroup(doc)),key=group?'groupClaims':'individual',state=structuredClone(doc?.getFlag(MODULE_ID,key)),fdoc=definition(state?.faction_id),f=loadDef(fdoc),action=t.dataset.mode;const one=Boolean(t.dataset.claim),id=t.dataset.key;
    if(!state||!fdoc)throw Error('Request record missing.');const record=one?state.claims?.[id]:state.requests?.[id],reward=f.rewards.find(r=>r.id===(one?id:record?.reward_id));if(!record||!reward)throw Error('Request no longer exists.');
    if(action==='deny'){if(!['pending','requested','approved'].includes(record.status))throw Error('Cannot deny completed request.');record.status='denied';record.usage_charged=false;}
    else if(action==='approve'){
      if(!['pending','requested'].includes(record.status))throw Error('Request already reviewed.');if(!rewardUnlocked(reward,f,state.standing.score))throw Error('Renown no longer qualifies.');if(!chooseOneEligible({faction:f,reward,claims:state.claims,choices:state.choices}))throw Error('Another Choose One reward already confirmed.');
      record.status='approved';record.gm_confirmed_by=game.user.id;state.choices??={};const milestone=(reward.audience==='group'?f.renown_track:f.individual_track).milestones.find(m=>m.id===reward.milestone_id);if(milestone?.selection_mode==='choose_one')state.choices[milestone.id]=reward.id;
      if(one&&reward.kind==='uuid'){
        const item=await fromUuid(reward.uuid);let recipient=group?game.actors.get(this.element.querySelector(`[name="recipient-${id}"]`)?.value):game.actors.get(state.actor_id);
        if(item?.documentName==='Item'&&recipient){if(!group||assignedActors().some(a=>a.id===recipient.id)){await grantItem(recipient,reward,record,f);record.status='claimed';record.delivered_to=recipient.id;}else throw Error('Recipient is not an assigned player character.');}
      }
    }else if(action==='fulfill'){
      if(!['approved'].includes(record.status))throw Error('Only approved requests can be fulfilled.');
      if(one){record.status='claimed';record.delivered_at=new Date().toISOString();}
      else{const remaining=reward.usage_limit?reward.usage_limit-(state.uses?.[reward.id]?.consumed??0):Infinity;if(remaining<=0)throw Error('Usage limit exhausted.');record.status='fulfilled';record.usage_charged=true;record.fulfilled_at=new Date().toISOString();state.uses??={};const counter=state.uses[reward.id]??{consumed:0,reset_count:0};counter.consumed++;state.uses[reward.id]=counter;}
    }else throw Error('Invalid request action.');
    await doc.setFlag(MODULE_ID,key,state);await reproject();await this.render({force:true});
  }catch(e){notifyError(e)}}
  static async resetUsage(e,t){try{assertGM();const doc=definition(this.#selected),f=loadDef(doc),aud=t.dataset.audience,actor=aud==='individual'?game.actors.get(this.#actor):null,store=aud==='group'?await ensureGroup(doc):actor?await ensurePersonal(doc,actor):null;if(!store)throw Error('No selected character.');const key=aud==='group'?'groupClaims':'individual',state=structuredClone(store.getFlag(MODULE_ID,key)),reward=f.rewards.find(r=>r.id===t.dataset.reward);if(reward?.behavior!=='repeatable_service')throw Error('Not a service.');if(!window.confirm('Reset used service charges? Fulfilled request history will remain.'))return;state.uses??={};const old=state.uses[reward.id]??{consumed:0,reset_count:0};state.uses[reward.id]={consumed:0,reset_count:old.reset_count+1};await store.setFlag(MODULE_ID,key,state);await reproject();await this.render({force:true});}catch(e){notifyError(e)}}
  static async resetChoice(e,t){try{assertGM();const fdoc=definition(this.#selected),audience=t.dataset.audience,actor=audience==='individual'?game.actors.get(this.#actor):null,doc=audience==='group'?await ensureGroup(fdoc):actor?await ensurePersonal(fdoc,actor):null;if(!doc)throw Error('Choose an assigned character first.');const key=audience==='group'?'groupClaims':'individual',state=structuredClone(doc.getFlag(MODULE_ID,key));if(!window.confirm('Clear this milestone choice? Previously granted Items or permanent benefits will NOT be removed.'))return;state.choices??={};state.choices[t.dataset.milestone]=null;await doc.setFlag(MODULE_ID,key,state);await reproject();await this.render({force:true});}catch(e){notifyError(e)}}
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
      const esc=v=>String(v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
      const fresh=rows.filter(r=>r.action==='new').length;
      const list=rows.map(r=>`<div>${r.action==='new'?'NEW':'SKIP (already here)'} · ${esc(r.name)}</div>`).join('');
      if(!fresh){ui.notifications.info('Nothing to import: every faction in that file is already in this world.');return;}
      const ok=await foundry.applications.api.DialogV2.confirm({window:{title:'Import factions'},content:`<p>Add <strong>${fresh}</strong> of ${rows.length} factions from ${esc(file.name)}?</p>${list}<p>Existing factions, their Renown and discovery are never changed.</p>`,modal:true,rejectClose:false});
      if(!ok)return;
      const result=await importFactions(data);
      ui.notifications.info(`Factions imported: ${result.added.length} added, ${result.skipped.length} kept as they were.${result.missingActors.length?` No character named: ${result.missingActors.join(', ')} (import the Manager pack first); their personal Renown was skipped.`:''}`);
      await this.render({force:true});
    }catch(e){notifyError(e)}
  }
  static async exportAll(){try{assertGM();jsonDownload({schema_version:'ag-factions-source-export/0.3',definitions:defs().map(d=>sourceDefinition(getFaction(d))),note:'Excludes all mutable campaign state and user discovery state.'},'AG_Factions_Definitions_v0.6.0.json');}catch(e){notifyError(e)}}
}
function rankOf(ms,score){return[...ms].reverse().find(m=>score>=m.threshold)?.name??'Unproven';}
let dashboard=null;
const openDashboard=()=>{
  requirePlayerAccess();
  dashboard??=new Dashboard();
  dashboard.render({force:true});
  return dashboard;
};
function attachLauncher(app,html,visible=playerMayOpen()){
  return mountLauncher(launcherRoot(app,html),{moduleId:MODULE_ID,label:'Renown',title:'Factions & Renown',icon:'fa-solid fa-shield-halved',onClick:openDashboard,visible});
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
  game.settings.register(MODULE_ID,'groupNameEnabled',{name:'Custom group name enabled',scope:'world',config:false,type:Boolean,default:false});
  game.settings.register(MODULE_ID,'playerAccessEnabled',{
    name:'Factions & Renown — Player Access',
    hint:'Show or hide the Factions interface for players. This does not change Renown, claims, character abilities, or document permissions.',
    scope:'world',config:true,type:Boolean,default:true,restricted:true,
    onChange:enabled=>{void applyPlayerAccess(enabled===true);}
  });
});
Hooks.once('ready',()=>{
  const mod=game.modules.get(MODULE_ID);
  if(mod)mod.api=Object.freeze({
    open:openDashboard,
    getFactions:()=>{requirePlayerAccess();return game.user.isGM?defs().map(d=>sourceDefinition(getFaction(d))):getView(userViewDoc(game.user))?.payload.factions??[];},
    validateFaction,
    // GM-only, additive: adds factions that are not in the world yet (see scripts/import.mjs). Existing factions are never changed.
    previewFactionsImport:data=>previewFactionsImport(data),
    importFactions:data=>importFactions(data),
    // Optional read-only GM source relationship API. It never resolves or reveals Quest state.
    refreshPlayerViews:async()=>{assertGM();await reproject();return {status:'requested'};},
    getObjectiveRefs:(factionId)=>{assertGM();const doc=definition(factionId);if(!doc)throw Error('Faction not found.');return structuredClone(objectiveRefs(getFaction(doc)));},
    // GM-only diagnostic: Quest owns Objective kind, adoption and reveal, not Factions.
    auditObjectiveRefs:(factionId)=>{assertGM();const doc=definition(factionId);if(!doc)throw Error('Faction not found.');return structuredClone(auditObjectiveRefs(getFaction(doc),game.modules.get('ashen-gate-quest-manager')));},
    playerAccess:Object.freeze({contract:PLAYER_ACCESS_CONTRACT,getState:playerAccessState,setEnabled:setPlayerAccess})
  });
  attachLauncher(ui.actors);
  game.socket.on(SOCKET,msg=>{
    if(msg?.type==='receipt')clientReceipt(msg);
    else if(['request','share'].includes(msg?.type))void incoming(msg);
    else if(msg?.type==='refresh'&&dashboard?.rendered&&playerMayOpen())void dashboard.render({force:true});
  });
  for(const hook of ['updateJournalEntry','createJournalEntry','deleteJournalEntry'])Hooks.on(hook,()=>{
    if(dashboard?.rendered&&playerMayOpen())void dashboard.render({force:true});
  });
  Hooks.on('updateSetting',setting=>{
    if(setting?.key===`${MODULE_ID}.playerAccessEnabled`){
      accessSettingChanged(setting);
      return; // Do not rerender a freshly restricted player window.
    }
    if(dashboard?.rendered&&playerMayOpen())void dashboard.render({force:true});
  });
  if(game.user.isGM&&activeGM()?.id===game.user.id)void migrate().catch(notifyError);
  console.info(`[${MODULE_ID}] v${BUILD_VERSION}; Actors launcher; Player Access ${playerAccessEnabled()?'enabled':'hidden'}; GM-only definitions + filtered player views.`);
});
