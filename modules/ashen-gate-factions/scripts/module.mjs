/** Renown (formerly Factions & Renown; id unchanged). Originally v0.6.0 Beta; Foundry V14 target. No mandatory companion module. */
import {MODULE_ID,SCHEMA_VERSION,TEST_FACTIONS_DEMO,UNKNOWN_FACTION,OTHER_FOLDER,makeFaction,upgradeFaction,groupStateDefaults,sourceDefinition,validateFaction,blankStanding,adjustStanding,progressFor,milestoneProjection,discoverable,projectedFolders,grantAutoKnowledge,secureEntryPreview,claimEligible,chooseOneEligible,rewardUnlocked,makeGroupRecord,makePersonalRecord,keyFor,overlayCampaign,extractCampaignDiscovery,fieldDisclosure,disclosedField,revealField,FIELD_KEYS,liveFolderKey,newFolderKey,removeFolder,deleteFolderText} from './core.mjs';
import {confirmDialog,confirmDanger,guardDirty,formDialog,promptText,infoDialog,esc,checklistDialog} from './ag-dialogs.mjs';
import {launcherRoot,mountLauncher} from './ag-launchers.mjs';
import {addObjectiveRef,removeObjectiveRef,objectiveRefs,auditObjectiveRefs,objectiveKind,objectiveRecords,objectiveName} from './objective-refs.mjs';
import {planImport,runImport,IMPORT_SCHEMA} from './import.mjs';
import {runSupersede} from './supersede.mjs';
import {definitionHash,replaceDelta} from './update.mjs';
import {isDeity,makeDeity,deityProfile,deityCard,visibleRelations,pantheonRows,DEITY_TEXT_KEYS,DEITY_TIERS,RESONANCE_NEUTRAL,DAMPING_DEFAULT,DAMPING_MAX,validResonance,validDamping,relationLabel,resonancePreview,knockOns,visibleHistory} from './deity.mjs';
import {factionKnockOns,visibleFactionRelations,visibleFactionHistory,FACTION_ID} from './faction-relations.mjs';
import {visibilityChip,chipBadge,orgRow,listOrgsTab,searchMatches,groupsFor,sortsFor,editorTabs,revealLabel,plural,unlockLabel,behaviorLabel,objectiveLabel,objectiveStatusLabel,linkModeAction,FACTION_TABS,DEITY_TABS,KINDS as ORG_KINDS,CHIPS as ORG_CHIPS,DEFAULT_VIEW as ORG_VIEW} from './orgs-tab.mjs';
import {standingView,markCurrent,paragraphHTML} from './standing-view.mjs';
import {getVow,canManageVow,swearVow,endVow,breakVow,migrateVows,ensureVowItems,attachVowToggle,VOW_BREAK_PENALTY} from './vow.mjs';
import {pickVowReward,buildVowItemData,expireVowEffects} from './vow-item.mjs';
import {windowSize,uiState,subTabs,tabPanelAttrs,bindTablist,bindSplitNav,bindFolds,fold,fileButton,bindFileButtons,linkButton,refPicker,pickerOptions,bindRefPickers} from './ag-html.mjs';
import {factionsFolder,backupsFolder,holdingFolder,migrateFolders,SETTING as FOLDER_SETTING} from './folder-nesting.mjs';
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
const getSnapshot=d=>d?.getFlag(MODULE_ID,'importSnapshot');
const getImportSource=d=>d?.getFlag(MODULE_ID,'importSource');
// Foundry's Journal folder is storage organization only, independent from the in-dashboard faction folders.
// Do not set player visibility on the Folder. Journal ownership controls actual document access.
// Documents file under Journal "Ashen Gate / Factions Data" (snapshots under "Ashen Gate / Backups"); see folder-nesting.mjs.
async function ensureStorageFolder(){
  assertGM();
  // A folder problem never stops saving data: the record is filed loose and the next migration moves it.
  return (await factionsFolder())??{id:null};
}
/** GM, once per world: files Renown's own loose or old-folder Journals and held reward Items under Ashen Gate. Leaves anything the GM moved. */
async function organizeModuleJournals(){
  assertGM();
  return migrateFolders();
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
/** The quests Quest Log lists to a GM, as picker records; null when Quest Log is off or cannot list them. */
function questRecords(){
  try{const m=game.modules.get('ashen-gate-quest-manager');if(!m?.active||typeof m.api?.listQuests!=='function')return null;return objectiveRecords(m.api.listQuests());}catch{return null;}
}
function objectivePickerHtml(){
  const records=questRecords();
  if(records===null)return '<p class="agf-hint">Ashen Gate | Quest Log is not active, so quests cannot be listed here. Turn it on to add a reference.</p>';
  return refPicker({id:'agf-objective-id',label:'Quest, work order or contract',options:pickerOptions(records,{gm:true}),none:null,placeholder:'Search quests by name…'});
}
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
// A definition leaving Renown (Export, getFactions, Manager's world export) never names a folder that is gone.
const withLiveFolder=f=>'folder_key' in f?{...f,folder_key:liveFolderKey(folderList(),f.folder_key)}:f;
/** 0.16.0, GM only: what deleting a folder would move. Deities have no folders, but any stored key is counted too. */
function folderMembers(key){const docs=key?defs().filter(d=>getFaction(d)?.folder_key===key):[];return {docs,factions:docs.filter(d=>!isDeity(getFaction(d))).length,deities:docs.filter(d=>isDeity(getFaction(d))).length};}
/**
 * 0.16.0, GM only: deletes a folder. Nothing in it is deleted: its factions (and deities) move to Other factions.
 * Members move first, so a delete that stops part way leaves the folder listing what is left and can simply be run
 * again. The key is retired, never reused. A key that is already gone is a harmless no-op ({deleted:false}).
 */
async function deleteFolder(key){
  assertGM();if(typeof key!=='string'||!key)throw TypeError('Folder key required.');
  const {docs,factions,deities}=folderMembers(key);
  for(const d of docs){const f=structuredClone(getFaction(d));f.folder_key='';await d.update({[`flags.${MODULE_ID}.faction`]:f});}
  const doc=game.journal.find(d=>getFolders(d)),{index,folder}=removeFolder(getFolders(doc),key);
  if(folder)await doc.setFlag(MODULE_ID,'folderIndex',index);
  if(folder||docs.length)await reproject();
  return {deleted:Boolean(folder),key,name:folder?.name??null,moved:{factions,deities}};
}
/**
 * 0.17.0, GM only, idempotent: `supersedes` for information entries. api.supersedeIds({OLD_ENTRY_ID: 'NEW_ENTRY_ID'}, {dryRun, definitions}).
 * Renames the entry in the stored definition and moves what the party learned (group knowledge) to the new id. Nothing else
 * changes (standings, claims, requests, rewards, tracks). dryRun writes nothing and reports `changed`. An old id that is not there is skipped.
 */
async function supersedeIds(map,options={}){
  return runSupersede(map,options,{
    assertGM,
    factions:()=>defs().map(d=>({docId:d.id,faction:getFaction(d)})),
    groups:()=>game.journal.filter(d=>getGroup(d)).map(d=>({docId:d.id,state:getGroup(d)})),
    writeGroup:async(docId,{set,remove})=>{
      const update={};
      for(const [id,value] of Object.entries(set))update[`flags.${MODULE_ID}.groupClaims.knowledge.${id}`]=value;
      for(const id of remove)update[`flags.${MODULE_ID}.groupClaims.knowledge.-=${id}`]=null;
      await game.journal.get(docId).update(update);
    },
    writeEntries:async(docId,entries)=>{
      // A rename the import itself asked for is not a GM edit: if the definition matched its last import, the record follows.
      const doc=game.journal.get(docId),stamp=getImportSource(doc),clean=stamp?.hash&&(()=>{try{return definitionHash(getFaction(doc))===stamp.hash;}catch{return false;}})();
      await doc.update({[`flags.${MODULE_ID}.faction.entries`]:entries});
      if(clean)await doc.setFlag(MODULE_ID,'importSource',{...stamp,hash:definitionHash(getFaction(doc))});
    },
    after:reproject
  });
}
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
  return{id:f.id,name:disclosedField(f,'name',actorIds,f.field_reveals)||UNKNOWN_FACTION,leader:disclosedField(f,'leader',actorIds,f.field_reveals),public_role:disclosedField(f,'public_role',actorIds,f.field_reveals),tags:[],folder_key:f.folder_key,canShare:!f.discovery.party&&f.discovery.sharing_enabled&&owned.length>0,
    group:{score:groupStanding.score,history:groupStanding.events,claims,uses,choices:group?.choices??{}},personal,entries:info,
    groupTrack:{milestones:scrubMilestones(milestoneProjection({faction:f,scope:'group',score:groupStanding.score,claims,requests:group?.requests??{},uses,choices:group?.choices??{}}),user,claims,actorIds)},
    individualTrack:{milestones:f.individual_track.milestones.map(m=>({id:m.id,name:m.name,threshold:m.threshold,selection_mode:m.selection_mode}))}};
}
const pantheonDamping=()=>{const v=Number(game.settings.get(MODULE_ID,'pantheonDamping'));return validDamping(v)?v:DAMPING_DEFAULT;};
const factionDamping=()=>{const v=Number(game.settings.get(MODULE_ID,'factionDamping'));return validDamping(v)?v:DAMPING_DEFAULT;};
/** GM-only write of one character's piety with one deity. `link` marks knock-ons ({caused_by, source_deity}) and
 * undo entries ({reverses, source_deity}) on the new history entry. Never spreads to other deities. */
const writeFavour=(deityId,actor,delta,reason,link={})=>writePersonal(deityId,actor,delta,reason,link,true);
/** GM-only write of one character's PERSONAL Renown with one faction (a knock-on or its undo). Same history shape as
 * writeFavour; the floor at 0 comes from adjustStanding and no claim, request or reward is ever touched. */
const writeRenown=(factionId,actor,delta,reason,link={})=>writePersonal(factionId,actor,delta,reason,link,false);
async function writePersonal(deityId,actor,delta,reason,link,wantDeity){
  assertGM();const doc=definition(deityId),f=doc&&loadDef(doc);if(!f||isDeity(f)!==wantDeity)throw Error(wantDeity?'Deity not found.':'Faction not found.');
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
  // 0.22.0: relations and knock-on history lines name only factions this player already knows by name.
  const knownNames=new Map(visibleFactions.filter(x=>x.name!==UNKNOWN_FACTION).map(x=>[x.id,x.name])),byId=new Map(factions.map(f=>[f.id,f]));
  for(const x of visibleFactions){x.relations=visibleFactionRelations(byId.get(x.id),knownNames);for(const p of Object.values(x.personal))p.history=visibleFactionHistory(p.history,knownNames);}
  const shown=projectedFolders({folders:folderList(),factions,actorIds}).map(folder=>({key:folder.key,
    name:folder.known.some(f=>safeLabels.get(f.id)!==UNKNOWN_FACTION)?folder.name:UNKNOWN_FACTION,
    known:folder.known.map(f=>f.id),unknown_count:folder.unknown.length}));
  return{version:SCHEMA_VERSION,groupLabel:groupLabel(),folders:shown,factions:visibleFactions,deities:buildDeityPayload(user,actorIds)};
}
async function projectAll(){assertGM();if(activeGM()?.id!==game.user.id)return;for(const user of game.users.filter(u=>!u.isGM)){const doc=await ensureView(user),record=structuredClone(getView(doc));record.payload=buildPlayerPayload(user);const ownership={default:NONE,[user.id]:OBS};await doc.update({ownership,[`flags.${MODULE_ID}.playerView`]:record});}
  game.socket.emit(`module.${MODULE_ID}`,{type:'refresh'});
}
let projecting=false;
async function reproject(){if(!game.user.isGM||activeGM()?.id!==game.user.id||projecting)return;projecting=true;try{await projectAll()}catch(e){notifyError(e)}finally{projecting=false;}}
async function migrate(){assertGM();await folderRecord();const vowActors=game.actors?.contents??[...(game.actors??[])];await migrateVows(vowActors,MODULE_ID);await ensureVowItems(vowActors,MODULE_ID,vowItemData);for(const doc of defs()){
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
// GM-only import. Default mode 'skip' only adds; mode 'update' rewrites existing definitions and keeps campaign state (update.mjs).
// Every write goes through runImport's io, whose first call is assertGM.
const stampFor=hash=>({hash,module_version:moduleVersion(),at:new Date().toISOString()});
const importIO=()=>({
  assertGM,
  createFaction:async clean=>{clean=withLiveFolder(clean);const d=await JournalEntry.create({name:clean.name,folder:(await ensureStorageFolder()).id,ownership:{default:NONE},flags:{[MODULE_ID]:{faction:clean,importSource:stampFor(definitionHash(clean))}}});await ensureGroup(d);},
  updateGroup:async(id,fn)=>{const g=groupDoc(id);await g.setFlag(MODULE_ID,'groupClaims',fn(structuredClone(getGroup(g))));},
  updatePersonal:async(id,actor,fn)=>{const d=await ensurePersonal(definition(id),game.actors.get(actor.id));await d.setFlag(MODULE_ID,'individual',fn(structuredClone(getPersonal(d))));},
  findActor:name=>{const a=game.actors.find(a=>a.type==='character'&&a.name===name);return a?{id:a.id,name:a.name}:null;},
  finish:async id=>{const d=definition(id);await saveChange(d,loadDef(d));},
  eventId:()=>`RENOWN-EVT-${rid()}`,
  now:()=>new Date().toISOString(),
  // Update mode. The snapshot is a GM-only Journal in the Renown data folder, read back before anything is overwritten.
  saveSnapshot:async(records,meta)=>{
    const data={schema:'ag-renown-snapshot/1',created_at:new Date().toISOString(),module_version:moduleVersion(),reason:meta?.reason??'',
      note:'Definitions as they were before an import replaced them. Campaign state is not rewritten by an import and is not included.',definitions:records.map(r=>structuredClone(r.definition))};
    const doc=await JournalEntry.create({name:`Renown Snapshot • ${data.created_at.slice(0,19).replace('T',' ')} • ${records.length} definition${records.length===1?'':'s'}`,folder:(await backupsFolder())?.id??null,ownership:{default:NONE},
      flags:{[MODULE_ID]:{importSnapshot:data}},pages:[{name:'Snapshot (JSON)',type:'text',text:{format:1,content:`<pre>${esc(JSON.stringify(data,null,2))}</pre>`}}]});
    const back=getSnapshot(doc);
    if(!doc?.id||back?.definitions?.length!==records.length)throw Error('the snapshot did not read back');
    return {id:doc.id,name:doc.name};
  },
  updateFaction:async(id,clean,hash)=>{
    const d=definition(id),old=getFaction(d);let next=withLiveFolder(clean);
    // The folder is the GM's own organization: keep it unless the file names a folder that exists here.
    if(!isDeity(next)&&!next.folder_key&&old?.folder_key)next={...next,folder_key:old.folder_key};
    await d.update({name:next.name,[`flags.${MODULE_ID}.faction`]:replaceDelta(old,next),[`flags.${MODULE_ID}.importSource`]:stampFor(hash)});
  },
  stampImport:async(id,hash)=>{await definition(id).setFlag(MODULE_ID,'importSource',stampFor(hash));},
  finishUpdate:async id=>{
    // Only ever ADDS knowledge (entries whose threshold the party already meets); knowledge of ids the file dropped stays.
    const d=definition(id),gdoc=groupDoc(id)??await ensureGroup(d);let next=loadDef(d);const group=getGroup(gdoc);
    next=grantAutoKnowledge(next,'group',null,group?.standing?.score??0).faction;
    for(const j of game.journal.filter(j=>getPersonal(j)?.faction_id===id)){const s=getPersonal(j);next=grantAutoKnowledge(next,'individual',s.actor_id,s.standing?.score??0).faction;}
    const state=structuredClone(group);state.knowledge={...(state.knowledge??{}),...extractCampaignDiscovery(next).knowledge};
    if(JSON.stringify(state.knowledge)!==JSON.stringify(group.knowledge??{}))await gdoc.setFlag(MODULE_ID,'groupClaims',state);
  },
  after:reproject
});
function importOptions(options){
  const o=options==null?{}:options;
  if(typeof o!=='object'||Array.isArray(o))throw new TypeError('Import options must be an object.');
  const mode=o.mode??'skip';
  if(!['skip','update'].includes(mode))throw new TypeError('mode must be skip or update.');
  return {mode,overwriteEdited:o.overwriteEdited===true};
}
const legacyInside=raw=>Boolean(raw?.state?.party||raw?.field_reveals||raw?.discovery?.party||raw?.discovery?.actors?.length||(raw?.entries??[]).some(e=>e.discovered_party||e.discovered_actors?.length));
const existingForImport=()=>new Map(defs().map(d=>{
  const raw=getFaction(d),id=raw.id;
  return [id,{definition:structuredClone(raw),hash:getImportSource(d)?.hash??null,legacy:legacyInside(raw),
    states:{group:getGroup(groupDoc(id))??null,personal:game.journal.map(getPersonal).filter(s=>s?.faction_id===id)}}];
}));
const planFactionsImport=(data,options)=>{assertGM();const o=importOptions(options);return planImport(data,new Set(defs().map(d=>getFaction(d).id)),o.mode==='update'?{...o,existing:existingForImport()}:{});};
async function importFactions(data,options){assertGM();return runImport(planFactionsImport(data,options),importIO());}
const previewFactionsImport=(data,options)=>{const {errors,rows}=planFactionsImport(data,options);return {errors,rows:rows.map(({id,name,kind,action,reason,changes,edited,dropped})=>({id,name,kind,action,reason,...(changes?{changes}:{}),...(edited?{edited:true}:{}),...(dropped?.length?{no_longer_defined:dropped.map(x=>`${x.kind} ${x.id}`)}:{})}))};};
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
    if(!f.discovery.sharing_enabled)throw Error('Faction sharing disabled.');if(f.discovery.party){accepted=true;return;}
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
  // The same claim or request is already waiting (a double click, two players, a retry): the ask is already in, so answer accepted. The GM was notified the first time and is not told again.
  if(reward.behavior==='repeatable_service'?Object.values(state.requests??{}).some(r=>r.reward_id===reward.id&&['requested','approved'].includes(r.status)):['pending','approved'].includes(state.claims?.[reward.id]?.status)){accepted=true;return;}
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
async function ensureHoldingFolder(){
  assertGM();
  return (await holdingFolder())??{id:null};
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
const PAGES=['group','player','pantheon','orgs','requests','setup'],GM_PAGES=['orgs','requests','setup'];
const FACTION_TAB_IDS=FACTION_TABS.map(t=>t.id),DEITY_TAB_IDS=DEITY_TABS.map(t=>t.id);
// Actions that keep the window as it is, or that submit the draft being edited, skip the unsaved-edits question.
// Every other action re-renders the window, so it first asks before throwing typed edits away (FR-02).
const UNGUARDED=new Set(['help','copyId','exportAll','openLinked','pickSymbol','claim','share','cancelEdit','save','saveFieldReveals','saveDeity','saveSetup','addEntry','addReward','addObjective','addRelation','addFactionRelation','removeFactionRelation','createFolder']);
// data-* keys that identify a control again after a re-render, so focus can go back to it (§9.6).
const FOCUS_KEYS=['action','agfView','tab','id','entry','reward','mode','key','doc','target','milestone','audience','goto','event','resonanceTarget','orgsFilter'];
const attrValue=v=>String(v).replace(/["\\]/g,'\\$&');
function focusSelector(el){
  if(!el?.tagName)return null;const ds=el.dataset??{},tag=el.tagName.toLowerCase();
  const keys=FOCUS_KEYS.filter(k=>ds[k]!==undefined);
  if(keys.length)return tag+keys.map(k=>`[data-${k.replace(/[A-Z]/g,c=>`-${c.toLowerCase()}`)}="${attrValue(ds[k])}"]`).join('');
  return el.name?`${tag}[name="${attrValue(el.name)}"]`:null;
}
/** Shows only roster rows whose search text matches, without re-rendering (so unsaved edits beside the list stay). */
function filterRoster(root,q){
  const rows=[...root?.querySelectorAll?.('.agf-roster [data-agf-search]')??[]];
  let shown=0;for(const row of rows){const ok=searchMatches(row.dataset.agfSearch,q);row.hidden=!ok;if(ok)shown++;}
  for(const group of root?.querySelectorAll?.('.agf-roster [data-agf-group]')??[])group.hidden=![...group.querySelectorAll('[data-agf-search]')].some(r=>!r.hidden);
  const count=root?.querySelector?.('[data-agf-count]'),total=Number(count?.dataset?.total??rows.length);
  if(count)count.textContent=`${shown} of ${total}`;
  const none=root?.querySelector?.('[data-agf-nomatch]');if(none)none.hidden=!(total>0&&shown===0);
  return shown;
}
class Dashboard extends HandlebarsApplicationMixin(ApplicationV2){
  static DEFAULT_OPTIONS={id:'ashen-gate-factions-window',classes:['ag-app','ashen-gate-factions'],window:{title:'Ashen Gate | Renown',icon:'fa-solid fa-shield-halved',resizable:true},position:{width:980,height:760},actions:{help:Dashboard.help,saveSetup:Dashboard.saveSetup,cancelEdit:Dashboard.cancelEdit,checkRewardIds:Dashboard.checkRewardIds,fillRewardIds:Dashboard.fillRewardIds,clearOrgFilters:Dashboard.clearOrgFilters,openDeity:Dashboard.openDeity,editDeity:Dashboard.editDeity,openRecord:Dashboard.openRecord,goto:Dashboard.goto,toggleFolders:Dashboard.toggleFolders,createDeity:Dashboard.createDeity,saveDeity:Dashboard.saveDeity,pickSymbol:Dashboard.pickSymbol,addRelation:Dashboard.addRelation,removeRelation:Dashboard.removeRelation,undoFavour:Dashboard.undoFavour,undoRenown:Dashboard.undoRenown,addFactionRelation:Dashboard.addFactionRelation,removeFactionRelation:Dashboard.removeFactionRelation,toggleVow:Dashboard.toggleVow,breakVow:Dashboard.breakVow,select:Dashboard.select,create:Dashboard.create,seed:Dashboard.seed,save:Dashboard.save,award:Dashboard.award,createFolder:Dashboard.createFolder,saveFolder:Dashboard.saveFolder,deleteFolder:Dashboard.deleteFolder,discovery:Dashboard.discovery,share:Dashboard.share,addEntry:Dashboard.addEntry,showEntry:Dashboard.showEntry,claim:Dashboard.claim,resolveRequest:Dashboard.resolveRequest,resetUsage:Dashboard.resetUsage,addReward:Dashboard.addReward,editReward:Dashboard.editReward,removeReward:Dashboard.removeReward,openLinked:Dashboard.openLinked,resetChoice:Dashboard.resetChoice,saveFieldReveals:Dashboard.saveFieldReveals,addObjective:Dashboard.addObjective,removeObjective:Dashboard.removeObjective,copyId:Dashboard.copyId,exportAll:Dashboard.exportAll}};
  static PARTS={main:{template:`modules/${MODULE_ID}/templates/dashboard.hbs`}};
  /** Compact size by default; Comfortable (General Manager → My Appearance) opens it 1.2x larger. An explicit position still wins. */
  constructor(options={}){
    super({...options,position:{...windowSize(Dashboard.DEFAULT_OPTIONS.position),...options.position}});
    this.#ui=uiState(MODULE_ID);
    this.#subTab={faction:this.#ui.get('factionTab','profile',FACTION_TAB_IDS),deity:this.#ui.get('deityTab','profile',DEITY_TAB_IDS)};
    this.#guard=guardDirty({status:()=>this.element?.querySelector?.('.agf-editor__footer .ag-footer__status, .agf-setup-footer .ag-footer__status')});
  }
  #tab='group';#orgsView={...ORG_VIEW};#selected=null;#deity=null;#editDeity=null;#actor=null;#lastView=null;#backfill=null;
  #foldersOpen=false;#subTab;#ui;#guard;
  // Actions shared by factions and deities act on: the open deity in Pantheon, the deity or faction open in the
  // Factions tab editor, else the selected faction (Group and Character).
  get #cur(){if(this.#tab==='pantheon')return this.#deity;if(this.#tab==='orgs'&&this.#orgsView.kind==='deity')return this.#editDeity;return this.#selected;}
  get #kind(){return this.#orgsView.kind==='deity'?'deity':'faction';}
  /** True while a draft form (profile, visibility, GM Setup, an add form) has typed edits that are not saved. */
  get isDirty(){return this.#guard.dirty;}
  /** Resolves true when nothing is unsaved, or when the GM chooses Discard changes (FR-02). */
  okToLeave(){return this.#guard.confirm();}
  /** Re-render for outside changes (a player request, another GM's edit). Skipped while edits are unsaved: Save Changes or Cancel redraws with the latest data. */
  refresh(){if(this.#guard.dirty)return;void this.render({force:true}).catch(notifyError);}
  async close(options){if(!(await this.okToLeave()))return this;return super.close(options);}
  async render(options={}){
    const el=this.element,viewKey=`${this.#tab}:${this.#cur}:${this.#tab==='orgs'?`${this.#kind}:${this.#subTab[this.#kind]}:${this.#foldersOpen}`:''}`,same=this.#lastView===viewKey;
    const scrolls=same?new Map([...el?.querySelectorAll?.('[data-agf-scroll]')??[]].map(x=>[x.dataset.agfScroll,x.scrollTop])):null;
    const opened=same?[...el?.querySelectorAll?.('details[data-agf-section]')??[]].filter(x=>x.open).map(x=>x.dataset.agfSection):null;
    // Focus goes back to the same control after the re-render (§9.6); the search box keeps its caret.
    const active=el?.ownerDocument?.activeElement,focus=active&&el?.contains?.(active)?focusSelector(active):null,caret=active?.matches?.('[data-orgs-filter="search"]')?active.selectionStart??null:null;
    const result=await super.render(options);const root=this.element;
    if(scrolls)for(const x of root?.querySelectorAll?.('[data-agf-scroll]')??[]){const top=scrolls.get(x.dataset.agfScroll);if(Number.isFinite(top))x.scrollTop=top;}
    if(opened)for(const x of root?.querySelectorAll?.('details[data-agf-section]')??[])x.open=opened.includes(x.dataset.agfSection);
    if(focus){const target=root?.querySelector?.(focus);if(target){target.focus?.({preventScroll:true});if(caret!==null)target.setSelectionRange?.(caret,caret);}}
    this.#lastView=viewKey;return result;
  }
  #gmData(){const list=factionDefs().map(d=>loadDef(d));const folders=projectedFolders({folders:folderList(),factions:list,gm:true}).map(x=>({key:x.key,name:x.name,known:x.known.map(f=>f.id),unknown_count:0}));return{version:SCHEMA_VERSION,groupLabel:groupLabel(),folders,factions:list};}
  #source(){if(game.user.isGM){const f=this.#gmData();return f;}const view=getView(userViewDoc(game.user));return view?.payload??{groupLabel:groupLabel(),folders:[],factions:[]};}
  #actorIds(){return accessibleActors().map(a=>a.id);}
  async _prepareContext(options){requirePlayerAccess();const ctx=await super._prepareContext(options),isGM=game.user.isGM,data=this.#source(),actorChoices=accessibleActors();
    if(!actorChoices.some(a=>a.id===this.#actor))this.#actor=actorChoices[0]?.id??null;
    const known=data.factions;
    if(!known.some(f=>f.id===this.#selected))this.#selected=known[0]?.id??null;
    const f=known.find(f=>f.id===this.#selected);
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
    const detail=f?{id:f.id,name:f.name,leader:f.leader,public_role:f.public_role,tags:f.tags??[],score:groupScore,rank:gf?progressFor(gf.renown_track,groupScore).rank.name:rankOf(groupMs,groupScore),individualScore:actorScore,individualRank:gf?progressFor(gf.individual_track,actorScore).rank.name:rankOf(individualMs,actorScore),groupMs:decorateTrack(groupMs,groupScore,GROUP_TRACK),individualMs:decorateTrack(individualMs,actorScore,PERSONAL_TRACK),groupView:standingView(groupMs,groupScore),individualView:standingView(individualMs,actorScore),entries:knownEntries,canShare:!isGM&&f.canShare,groupEvents:[...groupEvents].reverse().slice(0,35).map(event),personalEvents:(()=>{const undone=new Set(personalEvents.map(e=>e.reverses).filter(Boolean));return[...personalEvents].reverse().slice(0,35).map(e=>({...event(e),canUndo:isGM&&!e.reverses&&!undone.has(e.id),undone:undone.has(e.id)}));})(),relations:gf?visibleFactionRelations(gf,new Map(known.map(x=>[x.id,x.name]))):f?.relations??[],folder_key:gf?.folder_key??f.folder_key,discovery:gf?.discovery??null,rewards:gf?.rewards??[],trackGroup:gf?.renown_track,trackPersonal:gf?.individual_track}:null;
    const factionMap=new Map(known.map(f=>[f.id,f.name]));const folders=(data.folders??[]).map(folder=>({...folder,factions:folder.known.map(id=>({id,name:factionMap.get(id),selected:id===this.#selected})),unknown:Array.from({length:folder.unknown_count??0},(_,i)=>({index:i})),count:folder.known.length+(folder.unknown_count??0)}));
    if(!isGM&&GM_PAGES.includes(this.#tab))this.#tab='group';
    const actorName=actorChoices.find(a=>a.id===this.#actor)?.name??'selected character';
    const tabOrgs=isGM&&this.#tab==='orgs',kind=this.#kind;
    const editingFaction=tabOrgs&&kind==='faction'&&!this.#foldersOpen&&gf;
    const looks=editingFaction?await rewardLooks(gf.rewards):null;
    const pantheon=this.#tab==='pantheon'?this.#pantheonContext(isGM):null;
    const orgsView=this.#orgsView,orgs=tabOrgs?this.#orgsList(orgsView):{total:0,shown:0,groups:[]};
    const opt=(items,v)=>items.map(x=>{const [value,label]=Array.isArray(x)?x:[x,x];return{value,label,selected:value===v};});
    const orgsOptions={kind:opt(ORG_KINDS,kind),status:opt([['all','All'],...ORG_CHIPS],orgsView.status),sort:opt(sortsFor(kind),orgsView.sort),group:opt(groupsFor(kind),orgsView.group)};
    const deityEditor=tabOrgs&&kind==='deity'&&!this.#foldersOpen?await this.#deityEditor(this.#editDeity,actorName):null;
    const gmQueue=editingFaction?this.#queue(gf):[];
    const allRequests=isGM?this.#allQueues():[];
    const editorRecord=editingFaction?{name:gf.name,queue:gmQueue}:deityEditor;
    let editor=null;
    if(editorRecord){const {tabs,selected}=editorTabs(kind,this.#subTab[kind],editorRecord.queue.length),label=kind==='deity'?'Deity':'Faction';
      editor={isFaction:kind==='faction',isDeity:kind==='deity',kindLabel:label,name:editorRecord.name,tabsHtml:subTabs({group:'agf-editor',label:`${label} sections`,tabs,selected}).replace(/ aria-controls="[^"]*"(?=[^>]*aria-selected="false")/g,''),panelAttrs:tabPanelAttrs('agf-editor',selected),sub:{[selected]:true},
        saveAction:selected==='profile'?(kind==='deity'?'saveDeity':'save'):selected==='visibility'?'saveFieldReveals':null};}
    const gmDiscovery=editingFaction?{chip:visibilityChip(gf),badgeClass:chipBadge(visibilityChip(gf)),partyLabel:revealLabel(gf.discovery.party,'party'),actorLabel:revealLabel(Boolean(this.#actor&&gf.discovery.actors.includes(this.#actor)),actorName)}:null;
    const groupLevelChoices=editingFaction?groupChoices:null;
    return {...ctx,isGM,version:moduleVersion(),actorName,showFolders:['group','player'].includes(this.#tab),hasFolders:folderList().length>0,detail,folders,hasData:Boolean(detail),pantheon,
      tabPantheon:this.#tab==='pantheon',tabGroup:this.#tab==='group',tabPlayer:this.#tab==='player',tabOrgs,tabRequests:isGM&&this.#tab==='requests',tabSetup:isGM&&this.#tab==='setup',showHeader:Boolean(detail)&&['group','player'].includes(this.#tab),
      orgs,orgsView,orgsOptions,foldersOpen:tabOrgs&&this.#foldersOpen,folderRows:tabOrgs&&this.#foldersOpen?this.#folderRows():[],otherFolder:OTHER_FOLDER,unknownName:UNKNOWN_FACTION,editor,deityEditor,
      importButton:tabOrgs?fileButton({label:'Import…',accept:'.json,application/json',className:'ag-btn ag-btn--sm'}):'',
      gotoSetup:linkButton('GM Setup',{data:{action:'goto',goto:'setup'}}),gotoDeities:linkButton('Factions tab',{data:{action:'editDeity'}}),
      requestCount:allRequests.reduce((n,g)=>n+g.queue.length,0),allRequests,
      groupLabel:groupLabel(),actorChoices:actorChoices.map(a=>({id:a.id,name:a.name,selected:a.id===this.#actor})),actorId:this.#actor,gmQueue,gmDiscovery,
      foldersForSelect:[{key:'',name:OTHER_FOLDER,selected:!detail?.folder_key},...folderList().map(q=>({...q,selected:detail?.folder_key===q.key}))],groupName:game.settings.get(MODULE_ID,'groupName'),groupNameEnabled:game.settings.get(MODULE_ID,'groupNameEnabled'),pantheonDamping:pantheonDamping(),factionDamping:factionDamping(),pantheonDampingMax:DAMPING_MAX,playerAccessEnabled:playerAccessEnabled(),hasActiveGM:Boolean(activeGM()),
      gmKnown:editingFaction?{...gf,tags:(gf.tags??[]).join(', ')}:gf,...(editingFaction?this.#factionRelationRows(gf):{gmRelations:[],gmRelationOptions:[]}),gmEntries:editingFaction?entryRows(gf.entries,this.#actor,actorName,'Renown'):[],
      gmObjectiveRefs:editingFaction?auditObjectiveRefs(gf,game.modules.get('ashen-gate-quest-manager')).map(r=>({...r,kindLabel:objectiveKind(r.target_id),name:objectiveName(r.target_id,questRecords()),label:objectiveLabel(r.relation,r.mode),status:objectiveStatusLabel(r.status)})):[],
      objectivePicker:editingFaction?objectivePickerHtml():'',
      gmGroupLevels:editingFaction?editorLevels(gf.renown_track,gf.rewards,'group',looks,groupLevelChoices).map(m=>({...m,groupTitle:`Group: ${m.name}`})):[],gmPersonalLevels:editingFaction?editorLevels(gf.individual_track,gf.rewards,'individual',looks,personalChoices).map(m=>({...m,personalTitle:`Individual: ${m.name}`})):[],
      serviceRewards:editingFaction?gf.rewards.filter(r=>r.behavior==='repeatable_service').map(r=>({...r,resetLabel:r.audience==='group'?`Reset group uses of ${r.name}…`:`Reset uses of ${r.name} for ${actorName}…`})):[],
      shareEnabled:gf?.discovery?.sharing_enabled,fieldSelective:gf?.field_reveals?.mode==='selective',gmFieldReveals:editingFaction?FIELD_KEYS.map(key=>({key,label:key==='public_role'?'Description':key==='leader'?'Leader':'Name',party:Boolean(gf.field_reveals?.fields?.[key]?.party),actor:Boolean(gf.field_reveals?.fields?.[key]?.actors?.includes(this.#actor))})):[],
      backfill:isGM&&this.#tab==='setup'?backfillView(this.#backfill):null,canEdit:!!gf,refreshNeeded:!isGM&&!userViewDoc(game.user)};
  }
  /** Faction editor: saved relations with their slider preview, and the factions still open to add. */
  #factionRelationRows(gf){
    const all=factionDefs().map(d=>upgradeFaction(loadDef(d))),names=new Map(all.map(x=>[x.id,x.name])),rel=Array.isArray(gf.relations)?gf.relations:[];
    return{gmRelations:rel.map(r=>{const label=relationLabel(r.resonance);return{...r,name:names.get(r.faction_id)??'Missing faction',label,preview:resonancePreview(r.resonance,factionDamping())};}),
      gmRelationOptions:all.filter(x=>x.id!==gf.id&&!rel.some(r=>r.faction_id===x.id)).map(x=>({id:x.id,name:x.name}))};
  }
  /** Pantheon tab (the view for everyone): symbol tiles grouped by tier and, when a deity is open, its card and this
   * character's standing. The GM also adjusts piety and undoes changes here; deity authoring is in the Factions tab.
   * Players only ever read their projected view (revealed deities only); the GM reads the definitions. */
  #pantheonContext(isGM){
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
    const vow=actor?getVow(actor,MODULE_ID):null,vowName=vow?(list.find(d=>d.id===vow.deity_id)?.name??null):null;
    base.vow=vowName?{name:vowName,deityId:vow.deity_id}:null;
    // The Seeker card (first rank) carries the Vow toggle once the character has reached it. The GM also gets Break Vow.
    const vowInfo=deityId=>({show:Boolean(actor&&canManageVow(game.user,actor)),sworn:vow?.deity_id===deityId,canBreak:Boolean(isGM&&vow?.deity_id===deityId),deityId});
    const withVowCard=attachVowToggle;
    const event=e=>({...e,displayDelta:e.delta>0?`+${e.delta}`:`${e.delta}`});
    if(!isGM){
      const mine=x.personal?.[actorId];
      const ms=mine?.milestones??[],score=mine?.score??0;
      return{...base,open:{card:deityCard(x),known:Boolean(mine),score,rank:mine?.rank??'',view:standingView(ms,score),
        milestones:withVowCard(decorateTrack(ms,score,FAVOUR_TRACK),vowInfo(x.id)),history:[...(mine?.history??[])].reverse().slice(0,35).map(event),relations:x.relations??[],entries:x.entries??[],canShare:Boolean(x.canShare)}};
    }
    const st=gmState(x.id),score=st?.standing?.score??0,p=progressFor(x.individual_track,score),names=new Map(list.map(d=>[d.id,d.name]));
    const ms=milestoneProjection({faction:x,scope:'individual',score,claims:st?.claims??{},requests:st?.requests??{},uses:st?.uses??{},choices:st?.choices??{},gm:true});
    return{...base,open:{card:deityCard(x),known:true,score,rank:p.rank.name,view:standingView(ms,score),milestones:withVowCard(decorateTrack(ms,score,FAVOUR_TRACK),vowInfo(x.id)),awardTitle:`Adjust piety for ${actorName||'the selected character'}`,
      history:(()=>{const ev=st?.standing?.events??[],undone=new Set(ev.map(e=>e.reverses).filter(Boolean));return[...ev].reverse().slice(0,35).map(e=>({...event(e),canUndo:!e.reverses&&!undone.has(e.id),undone:undone.has(e.id)}));})(),
      relations:visibleRelations(x,names),
      entries:x.entries.map(e=>({...e,discovered:Boolean(e.discovered_party||e.discovered_actors?.includes(actorId))}))}};
  }
  /** Factions tab, Deities: the editor for one deity (FR-04), with the same sub-tab layout as a faction. GM only. */
  async #deityEditor(id,actorName){
    const list=deityDefs().map(d=>upgradeFaction(loadDef(d)));
    if(!list.some(x=>x.id===id))this.#editDeity=id=list.slice().sort((a,b)=>a.name.localeCompare(b.name))[0]?.id??null;
    const x=list.find(d=>d.id===id);if(!x)return null;
    const actorId=this.#actor,st=actorId?getPersonal(personalDoc(x.id,actorId)):null,profile=deityProfile(x.deity),names=new Map(list.map(d=>[d.id,d.name]));
    const actorKnows=discoverable({discovery:x.discovery,actorIds:actorId?[actorId]:[]}),who=actorName||'the selected character';
    return {id:x.id,name:x.name,tags:(x.tags??[]).join(', '),profile,isMajor:profile.tier==='major',isLesser:profile.tier==='lesser',discovery:x.discovery,
      chip:visibilityChip(x),badgeClass:chipBadge(visibilityChip(x)),partyLabel:revealLabel(x.discovery.party,'party'),actorLabel:revealLabel(actorKnows,who),
      levels:editorLevels(x.individual_track,x.rewards,null,await rewardLooks(x.rewards),st?.choices),
      relations:profile.relations.map(r=>{const label=relationLabel(r.resonance);return{...r,name:names.get(r.deity_id)??'Missing deity',label,preview:resonancePreview(r.resonance,pantheonDamping())};}),
      relationOptions:list.filter(d=>d.id!==x.id&&!profile.relations.some(r=>r.deity_id===d.id)).map(d=>({id:d.id,name:d.name})),damping:pantheonDamping(),
      entries:entryRows(x.entries,actorId,who,'piety'),
      queue:this.#queue(x),serviceRewards:x.rewards.filter(r=>r.behavior==='repeatable_service').map(r=>({...r,audience:'individual',resetLabel:`Reset uses of ${r.name} for ${who}…`}))};
  }
  /** GM roster rows (Factions tab): every faction, or every deity, hidden or not. The search hides rows in place. */
  #orgsList(view){
    const kind=view.kind==='deity'?'deity':'faction',folders=new Map(folderList().map(x=>[x.key,x.name]));
    const rows=kind==='deity'
      ?deityDefs().map(d=>{const f=upgradeFaction(loadDef(d)),c=deityCard(f);return{...orgRow({faction:f,folderName:`${c.tierLabel} deities`}),isDeity:true,meta:[c.title,`${c.tierLabel} deity`].filter(Boolean).join(' · ')};})
      :factionDefs().map(d=>{const f=upgradeFaction(loadDef(d)),state=getGroup(groupDoc(f.id))??makeGroupRecord({factionId:f.id}),score=state?.standing?.score??state?.score??0;
        const r=orgRow({faction:f,score,rank:progressFor(f.renown_track,score).rank.name,folderName:folders.get(f.folder_key)});
        return {...r,meta:[r.leader,r.folder,r.characters?`Known to ${plural(r.characters,'character')}`:'',r.objectives?plural(r.objectives,'linked objective'):'',r.placeholder?'Placeholder shown':'',r.selective?'Selective fields':''].filter(Boolean).join(' · ')};});
    const list=listOrgsTab(rows,{...view,search:''}),current=kind==='deity'?this.#editDeity:this.#selected;
    let shown=0;
    for(const g of list.groups){for(const r of g.rows){r.selected=r.id===current;r.hidden=!searchMatches(r.search,view.search);if(!r.hidden)shown++;}g.hidden=g.rows.every(r=>r.hidden);}
    const label=kind==='deity'?'Deities':'Factions';
    return {...list,shown,noMatch:list.total>0&&shown===0,isFaction:kind==='faction',kindLabel:label,searchLabel:`Search ${label.toLowerCase()}`,
      emptyTitle:kind==='deity'?'No deities yet':'No factions yet',emptyText:kind==='deity'?'Create one with New deity, or import a file.':'Create one with New faction, or import a file.'};
  }
  #folderRows(){const factions=factionDefs().map(d=>getFaction(d));return folderList().map(x=>({key:x.key,name:x.name,countText:plural(factions.filter(f=>f.folder_key===x.key).length,'faction')}));}
  #queue(f){return game.journal.filter(d=>getGroup(d)?.faction_id===f.id||getPersonal(d)?.faction_id===f.id).flatMap(doc=>{const group=getGroup(doc),state=group??getPersonal(doc),audience=group?'group':'individual',actor=state.actor_id?game.actors.get(state.actor_id):null;
    const ones=Object.entries(state.claims??{}).filter(([_,r])=>['pending','approved'].includes(r.status)).map(([key,c])=>({docId:doc.id,requestKey:key,reward:f.rewards.find(r=>r.id===key)?.name??'Removed reward',actor:actor?.name??'Group',status:c.status,claim:true,approved:c.status==='approved',pending:c.status==='pending',isItem:f.rewards.some(r=>r.id===key&&linkedItem(r)&&audience==='group')}));
    const services=Object.entries(state.requests??{}).filter(([_,r])=>['requested','approved'].includes(r.status)).map(([key,c])=>({docId:doc.id,requestKey:key,reward:f.rewards.find(r=>r.id===c.reward_id)?.name??'Removed reward',actor:actor?.name??'Group',status:c.status,service:true,pending:c.status==='requested',approved:c.status==='approved'}));return[...ones,...services];});}
  /** Requests tab (FR-03): every open claim and service request, grouped by faction or deity. GM only. */
  #allQueues(){
    return defs().map(d=>upgradeFaction(loadDef(d))).map(f=>({f,queue:this.#queue(f)})).filter(x=>x.queue.length)
      .sort((a,b)=>a.f.name.localeCompare(b.f.name))
      .map(({f,queue})=>{const kind=isDeity(f)?'deity':'faction';return{id:f.id,name:f.name,kind,kindLabel:kind==='deity'?'Deity':'Faction',queue,
        openLink:linkButton(`Open ${f.name}`,{data:{action:'openRecord',id:f.id,kind}})};});
  }
  async _onRender(context,options){requirePlayerAccess();await super._onRender(context,options);const root=this.element;
    // Every render redraws saved values, so nothing typed is pending any more; then watch the new draft forms.
    this.#guard.markClean();
    for(const form of root?.querySelectorAll?.('[data-agf-draft]')??[])this.#guard.watch(form);
    for(const list of root?.querySelectorAll?.('.ag-tabs')??[])bindTablist(list);
    bindFolds(root,this.#ui);bindRefPickers(root);
    bindSplitNav(root,{create:'[data-action="create"], [data-action="createDeity"]'}); // stacked: scroll to the detail, Back to list
    bindFileButtons(root,([file])=>this.importFile(file));
    if(root.dataset.agfBound)return;root.dataset.agfBound='yes';
    // V14 manages [data-tab] controls itself. Use a unique attribute and a DOM click
    // listener on the stable app frame to keep the top-level views independent.
    root.addEventListener('click',e=>{
      if(!playerMayOpen())return;
      const tab=e.target?.closest?.('button[data-agf-view]');
      if(tab&&root.contains(tab)){
        const page=tab.dataset.agfView;
        if(!PAGES.includes(page)||(GM_PAGES.includes(page)&&!game.user.isGM))return;
        e.preventDefault();
        if(this.#tab===page)return;
        void this.#leaveThen(()=>{this.#tab=page;this.#foldersOpen=false;});
        return;
      }
      // Editor sub-tabs (Profile, Visibility, …): ask before unsaved edits are lost, then remember the choice.
      const sub=e.target?.closest?.('.ag-tabs--sub [data-tab]');
      if(sub&&root.contains(sub)&&game.user.isGM){
        e.preventDefault();const kind=this.#kind,ids=kind==='deity'?DEITY_TAB_IDS:FACTION_TAB_IDS,id=sub.dataset.tab;
        if(!ids.includes(id)||this.#subTab[kind]===id)return;
        void this.#leaveThen(()=>{this.#subTab[kind]=id;this.#ui.set(kind==='deity'?'deityTab':'factionTab',id);});
      }
    });
    // A missing holy-symbol file falls back to the built-in glyph.
    root.addEventListener('error',e=>{const img=e.target;if(img?.matches?.('img.agf-symbol-img'))img.closest('.agf-symbol')?.classList.add('is-missing');},true);
    root.addEventListener('input',e=>{
      // Search filters the roster in place as you type (no re-render, so an open editor keeps its typed edits).
      const box=e.target?.closest?.('[data-orgs-filter="search"]');
      if(box&&game.user.isGM){this.#orgsView.search=box.value;filterRoster(root,box.value);return;}
      // Resonance slider: live preview while dragging, saved when released.
      const el=e.target?.closest?.('[data-resonance-target],[name=relation-resonance],[data-resonance-draft],[name=faction-relation-new]');if(!el)return;const out=el.closest('[data-resonance-row]')?.querySelector('[data-resonance-preview]'),damp=el.closest('[data-faction-relations]')?factionDamping():pantheonDamping();if(out)out.textContent=`${relationLabel(Number(el.value))} · ${resonancePreview(Number(el.value),damp)}`;});
    root.addEventListener('change',e=>{
      const slider=e.target?.closest?.('[data-resonance-target]');if(slider&&game.user.isGM){void this.setResonance(slider.dataset.resonanceTarget,slider.value);return;}
      // The add-relation slider names the deity it is for (FR-14).
      const pick=e.target?.closest?.('[name=relation-deity]');if(pick){const range=pick.closest('[data-resonance-row]')?.querySelector('[name=relation-resonance]');if(range)range.setAttribute('aria-label',`Resonance with ${pick.selectedOptions?.[0]?.textContent??'the chosen deity'}`);return;}
      const fpick=e.target?.closest?.('[name=faction-relation-pick]');if(fpick){const range=fpick.closest('[data-resonance-row]')?.querySelector('[name=faction-relation-new]');if(range)range.setAttribute('aria-label',`Resonance with ${fpick.selectedOptions?.[0]?.textContent??'the chosen faction'}`);return;}
      const flt=e.target?.closest?.('[data-orgs-filter]');
      if(flt&&game.user.isGM){const key=flt.dataset.orgsFilter;if(key==='search')return;const value=flt.value,before=this.#orgsView[key];
        void this.#leaveThen(()=>{this.#orgsView[key]=value;if(key==='kind'){this.#foldersOpen=false;const v={...ORG_VIEW,kind:value,search:this.#orgsView.search};this.#orgsView=v;}},()=>{flt.value=before;});return;}
      if(e.target?.matches?.('[name=actor-id]')){const a=accessibleActors().find(a=>a.id===e.target.value);if(a){const before=this.#actor;void this.#leaveThen(()=>{this.#actor=a.id;},()=>{e.target.value=before??'';});}}
    });
    root.addEventListener('dragstart',e=>{const el=e.target.closest('[data-faction-drag]');if(!game.user.isGM||!el)return;e.dataTransfer.setData('text/ashen-gate-faction',el.dataset.factionDrag);e.dataTransfer.effectAllowed='move';});
    root.addEventListener('dragover',e=>{if(game.user.isGM&&e.target.closest('[data-folder-drop], [data-reward-drop], [data-entry-drop]'))e.preventDefault();});
    root.addEventListener('drop',async e=>{try{if(!game.user.isGM)return;const folder=e.target.closest('[data-folder-drop]');if(folder){const id=e.dataTransfer.getData('text/ashen-gate-faction');if(!id)return;e.preventDefault();const doc=definition(id),f=loadDef(doc);f.folder_key=liveFolderKey(folderList(),folder.dataset.folderDrop);await saveChange(doc,f);await this.render({force:true});return;}
      const rewardZone=e.target.closest('[data-reward-drop]'),entryZone=e.target.closest('[data-entry-drop]');if(!rewardZone&&!entryZone)return;e.preventDefault();const drag=readDrop(e),doc=definition(this.#cur);if(!doc)throw Error('Choose a faction or deity first.');
      if(!(await this.okToLeave()))return;
      // D13: reward zones take Items only (world, compendium or from an Actor); journals and other documents go to the info list.
      if(rewardZone){const found=await resolveItemDrop(drag);if(!found.ok){if(found.reason==='Drop an item.')ui.notifications.warn('Rewards take items. Drop journals and other documents on the info list.');else ui.notifications.warn(found.reason);return;}
        const fields=await itemRewardFields(found.items[0]),f=loadDef(doc);f.rewards.push({id:`rw-${rid()}`,key:keyFor('rw_'+rid()),audience:rewardZone.dataset.audience,milestone_id:rewardZone.dataset.milestone,description:'',tags:[],behavior:'one_time',usage_limit:0,...fields});
        try{await saveChange(doc,f);}catch(err){const copy=await loadDoc(fields.uuid);if(isHoldingCopy(copy)&&copy.uuid!==found.items[0].uuid)await deleteWorldItems((await bundleOf(copy)).map(i=>i.id));throw err;}await this.render({force:true});return;}
      let uuid=drag?.uuid;if(!uuid&&drag?.id&&drag?.type)uuid=`${drag.type}.${drag.id}`;if(!uuid)throw Error('Drop a Foundry document with a UUID.');const linked=await fromUuid(uuid);if(!linked)throw Error('Document not found.');const f=loadDef(doc);{f.entries.push({id:`info_${keyFor(rid())}`,name:linked.name,text:'',uuid,link_mode:'document',unlock:'manual',threshold:0,discovered_party:false,discovered_actors:[]});}await saveChange(doc,f);await this.render({force:true});
    }catch(err){notifyError(err)}});
  }
  /** Runs `change` and re-renders once unsaved edits are saved or discarded; `undo` runs when the GM keeps editing. */
  async #leaveThen(change,undo=null){try{if(!(await this.okToLeave())){undo?.();return;}change();await this.render({force:true});}catch(e){notifyError(e)}}
  static async select(e,t){if(this.#tab==='orgs'&&this.#kind==='deity')this.#editDeity=t.dataset.id;else this.#selected=t.dataset.id;this.#foldersOpen=false;await this.render({force:true});}
  /** 0.10.0: open on one faction (and the Character view for one character), for the embed's Open button. */
  focus({factionId=null,deityId=null,actorId=null,tab=null}={}){if(factionId)this.#selected=factionId;if(deityId)this.#deity=deityId;if(actorId)this.#actor=actorId;if(['player','group','pantheon'].includes(tab))this.#tab=tab;}
  static async openDeity(e,t){this.#deity=t.dataset.id||null;await this.render({force:true});}
  /** Pantheon → Edit deity, or a link to the deity list: the deity editor in the Factions tab (GM only). */
  static async editDeity(e,t){assertGM();this.#tab='orgs';this.#foldersOpen=false;if(this.#orgsView.kind!=='deity')this.#orgsView={...ORG_VIEW,kind:'deity'};if(t?.dataset?.id)this.#editDeity=t.dataset.id;await this.render({force:true});}
  /** Requests tab → Open <name>: that faction's or deity's Requests sub-tab. */
  static async openRecord(e,t){assertGM();const kind=t.dataset.kind==='deity'?'deity':'faction';this.#tab='orgs';this.#foldersOpen=false;if(this.#orgsView.kind!==kind)this.#orgsView={...ORG_VIEW,kind};
    if(kind==='deity')this.#editDeity=t.dataset.id;else this.#selected=t.dataset.id;this.#subTab[kind]='requests';await this.render({force:true});}
  /** In-text links ("in GM Setup") switch the top-level view. */
  static async goto(e,t){const page=t.dataset.goto;if(!PAGES.includes(page)||(GM_PAGES.includes(page)&&!game.user.isGM))return;this.#tab=page;this.#foldersOpen=false;await this.render({force:true});}
  static async toggleFolders(){assertGM();this.#foldersOpen=!this.#foldersOpen;await this.render({force:true});}
  static async createDeity(){try{assertGM();const typed=await promptText('New deity','Deity name');if(typed===null)return;const name=typed.trim();if(!name||name.length>120)throw Error('Deity name required (up to 120 characters).');const f=makeDeity({...deityIdPair(),name});const doc=await JournalEntry.create({name,folder:(await ensureStorageFolder()).id,ownership:{default:NONE},flags:{[MODULE_ID]:{faction:sourceDefinition(f)}}});await ensureGroup(doc);this.#editDeity=f.id;if(this.#orgsView.kind!=='deity')this.#orgsView={...ORG_VIEW,kind:'deity'};this.#subTab.deity='profile';await reproject();await this.render({force:true});}catch(e){notifyError(e)}}
  static async saveDeity(){try{assertGM();const doc=definition(this.#cur),f=doc&&loadDef(doc);if(!isDeity(f))throw Error('Open a deity first.');const root=this.element.querySelector('[data-deity-editor]');if(!root)throw Error('Deity editor not found.');
    f.name=nameValue(root,'deity-name');const d=deityProfile(f.deity);d.symbol=nameValue(root,'deity-symbol');for(const k of DEITY_TEXT_KEYS)d[k]=String(root.querySelector(`[name="deity-${k}"]`)?.value??'').trim();d.tier=selectedValue(root,'deity-tier');d.saying={text:nameValue(root,'deity-saying-text'),attribution:nameValue(root,'deity-saying-attribution')};f.deity=d;
    f.tags=nameValue(root,'deity-tags').split(',').map(s=>s.trim()).filter(Boolean);
    const rows=[...root.querySelectorAll('[data-milestone-row="individual"]')];if(rows.length!==5)throw Error('Five rank rows expected.');f.individual_track.milestones=rows.map((row,i)=>({...f.individual_track.milestones[i],name:String(row.querySelector('[data-field=name]')?.value??'').trim(),threshold:Number(row.querySelector('[data-field=threshold]')?.value),benefit:String(row.querySelector('[data-field=benefit]')?.value??''),selection_mode:row.querySelector('[data-field=selection]')?.value??'all'}));
    await saveChange(doc,f);this.#guard.markClean();await this.render({force:true});ui.notifications.info('Deity saved.');}catch(e){notifyError(e)}}
  static async pickSymbol(){try{assertGM();const input=this.element.querySelector('[name=deity-symbol]');const FP=foundry.applications?.apps?.FilePicker?.implementation??globalThis.FilePicker;if(!input||!FP)throw Error('File picker unavailable; type the image path.');new FP({type:'image',current:input.value,callback:path=>{input.value=path;this.#guard.markDirty();}}).render(true);}catch(e){notifyError(e)}}
  static async addRelation(){try{assertGM();const doc=definition(this.#cur),f=doc&&loadDef(doc);if(!isDeity(f))throw Error('Open a deity first.');const target=selectedValue(this.element,'relation-deity'),resonance=Number(selectedValue(this.element,'relation-resonance')||RESONANCE_NEUTRAL);if(target===f.id||!isDeity(getFaction(definition(target))))throw Error('Choose another deity.');if(!validResonance(resonance))throw Error('Resonance must be between 0 and 1.');const d=deityProfile(f.deity);if(d.relations.some(r=>r.deity_id===target))throw Error('That relation already exists.');d.relations.push({deity_id:target,resonance});f.deity=d;await saveChange(doc,f);await this.render({force:true});}catch(e){notifyError(e)}}
  /** GM slider: one direction (this deity -> target), 0 Dissonance … 0.5 neutral … 1 Resonance. */
  async setResonance(target,value){try{assertGM();const doc=definition(this.#cur),f=doc&&loadDef(doc);if(!isDeity(f))throw Error('Open a deity first.');const v=Number(value);if(!validResonance(v))throw Error('Resonance must be between 0 and 1.');const d=deityProfile(f.deity),r=d.relations.find(x=>x.deity_id===target);if(!r)throw Error('Relation not found.');r.resonance=v;f.deity=d;await saveChange(doc,f);await this.render({force:true});}catch(e){notifyError(e)}}
  /** Undo adds reversing entries (nothing is deleted): the chosen entry and, for a gain, the knock-ons it caused. Undo entries never spread. */
  /** Seeker card: swear or end the Vow to this god. One Vow per character: swearing here ends a Vow to another god. */
  static async toggleVow(e,t){try{
    const actor=game.actors.get(this.#actor),deityId=t?.dataset?.deity||this.#deity;if(!actor)throw Error('Select a character.');
    const names=id=>getVowGodName(id),cur=getVow(actor,MODULE_ID);
    if(cur?.deity_id===deityId){await endVow({moduleId:MODULE_ID,actor,user:game.user});ui.notifications.info(`Your Vow to ${names(deityId)} has ended.`);}
    else{
      if(cur&&!await confirmDialog(`Swear a Vow to ${names(deityId)}? This ends your Vow to ${names(cur.deity_id)}.`,{title:`Swear a Vow to ${names(deityId)}?`,yes:'Swear Vow'}))return;
      await swearVow({moduleId:MODULE_ID,actor,user:game.user,deityId,unlocked:vowUnlocked(actor,deityId),itemData:vowItemData(actor,deityId)});ui.notifications.info(`You swore a Vow to ${names(deityId)}.`);
    }
    refreshEmbeds();await this.render({force:true});
  }catch(err){notifyError(err)}}
  /** GM only: the Vow was broken on purpose. Takes the penalty with that god and ends the Vow. */
  static async breakVow(e,t){try{
    assertGM();const actor=game.actors.get(this.#actor),cur=getVow(actor,MODULE_ID);if(!actor||!cur)throw Error('No Vow is sworn.');
    const name=getVowGodName(cur.deity_id),score=getPersonal(personalDoc(cur.deity_id,actor.id))?.standing?.score??0;
    if(!await confirmDanger(`Break ${actor.name}'s Vow to ${name}? This ends the Vow and takes ${Math.min(VOW_BREAK_PENALTY,score)} piety with ${name}. The history records it.`,{title:'Break Vow?',yes:'Break Vow'}))return;
    await breakVow({moduleId:MODULE_ID,actor,user:game.user,score,writePiety:(id,delta,reason)=>writeFavour(id,actor,delta,reason)});
    refreshEmbeds();await this.render({force:true});
  }catch(err){notifyError(err)}}
  static async undoFavour(e,t){try{assertGM();const actor=game.actors.get(this.#actor);if(!actor)throw Error('Select a character.');const id=t.dataset.event,own=getPersonal(personalDoc(this.#deity,actor.id)),ev=own?.standing?.events?.find(x=>x.id===id);if(!ev)throw Error('History entry not found.');
    const reversed=events=>new Set(events.map(x=>x.reverses).filter(Boolean));if(ev.reverses||reversed(own.standing.events).has(ev.id))throw Error('That entry is already an undo or has been undone.');
    const linked=deityDefs().map(d=>getFaction(d).id).filter(id=>id!==this.#deity).flatMap(did=>{const evs=getPersonal(personalDoc(did,actor.id))?.standing?.events??[],done=reversed(evs);return evs.filter(x=>x.caused_by===ev.id&&!done.has(x.id)).map(x=>({deityId:did,ev:x}));});
    const name=id=>getFaction(definition(id))?.name??'another deity',sign=n=>n>0?`+${n}`:`${n}`;
    if(!await confirmDialog(`Undo "${ev.reason}" (${sign(ev.delta)}) for ${actor.name}?${linked.length?` This also undoes ${linked.map(l=>`${name(l.deityId)} ${sign(l.ev.delta)}`).join(', ')}.`:''} History keeps both entries.`,{title:'Undo this piety change?',yes:'Undo change'}))return;
    for(const row of [{deityId:this.#deity,ev},...linked])await writeFavour(row.deityId,actor,-row.ev.delta,`Undo: ${row.ev.reason}`,{reverses:row.ev.id,...(row.ev.source_deity?{source_deity:row.ev.source_deity}:{})});
    await reproject();await this.render({force:true});}catch(e){notifyError(e)}}
  static async removeRelation(e,t){try{assertGM();const doc=definition(this.#cur),f=doc&&loadDef(doc);if(!isDeity(f))throw Error('Open a deity first.');const d=deityProfile(f.deity),r=d.relations.find(x=>x.deity_id===t.dataset.target);if(!r)throw Error('Relation not found.');const other=getFaction(definition(r.deity_id))?.name??'the missing deity';if(!await confirmDanger(`Gains with ${f.name} stop moving ${other}. Standing is not changed.`,{title:`Remove the relation to ${other}?`,yes:'Remove relation'}))return;d.relations=d.relations.filter(x=>x!==r);f.deity=d;await saveChange(doc,f);await this.render({force:true});}catch(e){notifyError(e)}}
  /** The knock-ons a personal gain with `f` would cause for `actor`: related factions only, and only ones the character
   * already knows (party-discovered or discovered by that character). `skipped` counts the ones left out. Pure read. */
  #factionKnockOns(f,actor,gain){
    const all=factionDefs().map(d=>upgradeFaction(loadDef(d))),names=new Map(all.map(x=>[x.id,x.name]));
    const rows=factionKnockOns(f,gain,factionDamping(),names).filter(k=>all.some(x=>x.id===k.faction_id));
    const known=rows.filter(k=>discoverable({discovery:all.find(x=>x.id===k.faction_id).discovery,actorIds:[actor.id]}));
    return{rows:known,skipped:rows.length-known.length};
  }
  /** Undo for a PERSONAL Renown entry (GM): adds reversing entries for it and for any knock-ons it caused; nothing is
   * deleted, an entry can only be undone once, and undo entries never spread. Claims and rewards are not touched. */
  static async undoRenown(e,t){try{assertGM();const actor=game.actors.get(this.#actor);if(!actor)throw Error('Select a character.');const id=t.dataset.event,own=getPersonal(personalDoc(this.#cur,actor.id)),ev=own?.standing?.events?.find(x=>x.id===id);if(!ev)throw Error('History entry not found.');
    const reversed=events=>new Set(events.map(x=>x.reverses).filter(Boolean));if(ev.reverses||reversed(own.standing.events).has(ev.id))throw Error('That entry is already an undo or has been undone.');
    const linked=factionDefs().map(d=>getFaction(d).id).filter(fid=>fid!==this.#cur).flatMap(fid=>{const evs=getPersonal(personalDoc(fid,actor.id))?.standing?.events??[],done=reversed(evs);return evs.filter(x=>x.caused_by===ev.id&&!done.has(x.id)).map(x=>({factionId:fid,ev:x}));});
    const name=fid=>getFaction(definition(fid))?.name??'another faction',sign=n=>n>0?`+${n}`:`${n}`;
    if(!await confirmDialog(`Undo "${ev.reason}" (${sign(ev.delta)}) for ${actor.name}?${linked.length?` This also undoes ${linked.map(l=>`${name(l.factionId)} ${sign(l.ev.delta)}`).join(', ')}.`:''} History keeps both entries.`,{title:'Undo this Renown change?',yes:'Undo change'}))return;
    for(const row of [{factionId:this.#cur,ev},...linked])await writeRenown(row.factionId,actor,-row.ev.delta,`Undo: ${row.ev.reason}`,{reverses:row.ev.id,...(row.ev.source_faction?{source_faction:row.ev.source_faction}:{})});
    await reproject();await this.render({force:true});}catch(err){notifyError(err)}}
  /** Faction editor, Related factions: edits stay in the form until Save Changes (nothing is written here). */
  static async addFactionRelation(){try{assertGM();const root=this.element.querySelector('[data-faction-relations]');if(!root)throw Error('Open a faction first.');const pick=root.querySelector('[name=faction-relation-pick]'),id=String(pick?.value??''),opt=pick?.selectedOptions?.[0];if(!id||!opt)return;
    const resonance=Number(root.querySelector('[name=faction-relation-new]')?.value??RESONANCE_NEUTRAL);if(!validResonance(resonance)||!FACTION_ID.test(id))throw Error('Choose a faction and a resonance between 0 and 1.');
    if(root.querySelector(`[data-relation-faction="${attrValue(id)}"]`))throw Error('That relation already exists.');
    const name=opt.textContent;opt.remove();
    const row=document.createElement('li');row.className='ag-row agf-resonance';row.dataset.resonanceRow='';row.dataset.relationFaction=id;row.dataset.relationName=name;
    row.innerHTML=`<span class="ag-row__main"><span class="ag-row__title">${esc(name)}</span><span class="ag-row__meta" data-resonance-preview aria-live="polite">${esc(relationLabel(resonance))} · ${esc(resonancePreview(resonance,factionDamping()))}</span></span><span class="agf-resonance__slider"><span class="agf-hint" aria-hidden="true">Dissonance</span><input type="range" min="0" max="1" step="0.05" value="${resonance}" data-resonance-draft aria-label="Resonance with ${esc(name)}"><span class="agf-hint" aria-hidden="true">Resonance</span></span><span class="ag-row__end"><button type="button" class="ag-btn ag-btn--sm ag-btn--danger" data-action="removeFactionRelation" data-target="${esc(id)}" aria-label="Remove relation to ${esc(name)}">Remove</button></span>`;
    (root.querySelector('[data-relation-list]')).append(row);root.querySelector('[data-relation-empty]')?.setAttribute('hidden','');
    if(!pick.options.length)root.querySelector('[data-relation-add]')?.setAttribute('hidden','');
    this.#guard.markDirty();}catch(err){notifyError(err)}}
  static async removeFactionRelation(e,t){try{assertGM();const root=this.element.querySelector('[data-faction-relations]'),row=t.closest?.('[data-relation-faction]');if(!root||!row)return;const pick=root.querySelector('[name=faction-relation-pick]'),id=row.dataset.relationFaction;
    if(pick&&!pick.querySelector(`option[value="${attrValue(id)}"]`)){const o=document.createElement('option');o.value=id;o.textContent=row.dataset.relationName||'Missing faction';pick.append(o);root.querySelector('[data-relation-add]')?.removeAttribute('hidden');}
    row.remove();if(!root.querySelector('[data-relation-faction]'))root.querySelector('[data-relation-empty]')?.removeAttribute('hidden');
    this.#guard.markDirty();}catch(err){notifyError(err)}}
  static async create(){try{assertGM();const typed=await promptText('New faction','Faction name');if(typed===null)return;const name=typed.trim();if(!name||name.length>120)throw Error('Faction name required (up to 120 characters).');const f=makeFaction({...idPair(),name});const doc=await JournalEntry.create({name,folder:(await ensureStorageFolder()).id,ownership:{default:NONE},flags:{[MODULE_ID]:{faction:f}}});await ensureGroup(doc);this.#selected=f.id;this.#foldersOpen=false;this.#subTab.faction='profile';await reproject();await this.render({force:true});}catch(e){notifyError(e)}}
  static async help(){const gm=game.user?.isGM;infoDialog('Renown Help',`<p><strong>Renown</strong> tracks the factions your party has met and the Renown the group and each character have earned with them.</p><h3>Group and Character</h3><ul><li><strong>Group</strong> shows the party's standing with the faction picked on the left, its milestones and what has been discovered.</li><li><strong>Character</strong> shows one character's personal Renown, information and rewards.${gm?'':' Use <em>Share with party</em> to share what you have discovered.'}</li></ul><h3>Pantheon</h3><p>The deities your character knows, each with its holy symbol, its card and that character's piety. Piety is per character, never shared by the group. <strong>Vows:</strong> you hold one Vow at a time, to any god. Swear it aloud with a minute of prayer once you reach that god's Seeker rank; spending it strengthens one gift from that god and uses it up. Breaking it on purpose costs piety, and only the GM rules whether it was broken. On the first rank card of a god you have reached, <em>Swear Vow</em> records your Vow and adds a <em>Vow of the god</em> feature to your character: use <em>Invoke your Vow</em> before the roll it names to add the god's bonus die to that roll (swearing to another god ends the old Vow and replaces the feature).${gm?' The GM can use <em>Break Vow…</em> to end it and take the piety penalty.':''} Open a deity to see its ranks, rewards, lore and related deities (Resonance or Dissonance).${gm?' As GM you adjust piety and undo changes here; <em>Edit deity</em> opens it in the Factions tab.':''}</p>${gm?'<h3>Factions (GM)</h3><p>Every faction, or every deity (pick with <em>Show</em>), in the list on the left. Search filters as you type. Pick one to edit it on the right: <em>Profile</em> (name, folder and ranks), <em>Visibility</em> (reveal to the party or one character, placeholder, sharing, fields), <em>Information</em> or <em>Lore</em>, <em>Rewards</em>, <em>Requests</em>, and <em>Links</em> (factions) or <em>Relations</em> (deities). Profile and Visibility save with <em>Save Changes</em> at the bottom right; the other sections apply at once. Reward descriptions and rank benefits keep the line breaks you type (Edit… on a reward has a multi-line box). If you leave with unsaved edits, Renown asks first. <em>Manage folders</em> (add, rename or delete folders; deleting one moves its factions to Other factions, nothing is deleted), <em>Import…</em> (when the file has records already here you can also <em>update</em> them: definitions are rewritten from the file; Renown, claims, requests, choices, discovery and what the party learned are kept; a snapshot of the old definitions is saved first), Export and <em>New faction</em> or <em>New deity</em> are on the right of the toolbar.</p><p>Each related deity has a slider from Dissonance to Resonance: a gain with this deity then moves that one too (scaled by the damping in GM Setup), and you confirm each change before it applies. The holy symbol is an image path (Browse opens the Assets Library); a missing image shows a plain sun glyph.</p><h3>Related factions (GM)</h3><p>In the <em>Profile</em> of a faction, <em>Related factions</em> has a slider per faction from Dissonance (rival) to Resonance (ally); it saves with <em>Save Changes</em>. When you add <strong>personal</strong> Renown for a character with that faction, you confirm what each related faction the character already knows would change (scaled by the faction damping in GM Setup, never below 0, never chained). Group Renown is not affected. <em>Undo…</em> on a personal history line also undoes its related changes.</p><h3>Requests (GM)</h3><p>Every open claim and service request from every faction and deity, with the number waiting on the tab.</p><h3>GM Setup</h3><p>The settings: Player access (hides the player window without deleting any progress), Pantheon damping, Faction knock-on damping and the group name. Change them, then press <em>Save Changes</em> once. Developer Tools at the bottom fill in permanent item ids and load [TEST] demo factions.</p><p>Removing an entry, reward, relation or objective reference, denying a request, resetting service charges or clearing a milestone choice always asks you to confirm first.</p>':'<p>Rewards your character can claim are requested here and confirmed by the GM.</p>'}`)}
  static async seed(){try{assertGM();if(!await confirmDialog('Adds four synthetic [TEST] factions for trying Renown out. Existing names are skipped.',{title:'Add four [TEST] factions?',yes:'Add factions'}))return;let count=0;for(const g of TEST_FACTIONS_DEMO){if(defs().some(d=>getFaction(d).name.toLowerCase()===g.name.toLowerCase()))continue;const f=makeFaction({...idPair(),...g,initialBenefit:g.initial_benefit,source:'Synthetic [TEST] demo data'});const d=await JournalEntry.create({name:f.name,folder:(await ensureStorageFolder()).id,ownership:{default:NONE},flags:{[MODULE_ID]:{faction:f}}});await ensureGroup(d);count++;}await reproject();ui.notifications.info(`${plural(count,'[TEST] faction')} added.`);await this.render({force:true});}catch(e){notifyError(e)}}
  /** Profile sub-tab: name, leader, description, folder, tags and both rank tracks. Discovery is on Visibility. */
  static async save(){try{assertGM();const doc=definition(this.#selected);if(!doc)throw Error('Select a faction first.');const f=loadDef(doc),root=this.element;f.name=nameValue(root,'faction-name');f.leader=nameValue(root,'faction-leader');f.public_role=nameValue(root,'faction-role');f.folder_key=liveFolderKey(folderList(),selectedValue(root,'faction-folder'));f.tags=nameValue(root,'faction-tags').split(',').map(s=>s.trim()).filter(Boolean);
    {const rel=[...root.querySelectorAll('[data-faction-relations] [data-relation-faction]')].map(r=>({faction_id:r.dataset.relationFaction,resonance:Number(r.querySelector('[data-resonance-draft]')?.value)}));if(rel.length||Array.isArray(f.relations))f.relations=rel;}
    for(const [scope,track] of [['group',f.renown_track],['individual',f.individual_track]]){const rows=[...root.querySelectorAll(`[data-milestone-row="${scope}"]`)];if(rows.length!==5)throw Error('Five milestone rows expected.');track.milestones=rows.map((row,i)=>({...track.milestones[i],name:String(row.querySelector('[data-field=name]')?.value??'').trim(),threshold:Number(row.querySelector('[data-field=threshold]')?.value),benefit:String(row.querySelector('[data-field=benefit]')?.value??''),selection_mode:row.querySelector('[data-field=selection]')?.value??'all'}));}
    await saveChange(doc,f);this.#guard.markClean();await this.render({force:true});ui.notifications.info('Faction saved.');}catch(e){notifyError(e)}}
  /** Visibility sub-tab (factions and deities): placeholder and sharing, plus field reveals for a faction. One Save
   * Changes (FR-05). A control that is not on the page is left as it was. */
  static async saveFieldReveals(){try{
    assertGM();const doc=definition(this.#cur);if(!doc)throw Error('Select a faction or deity first.');
    const f=loadDef(doc),root=this.element,box=name=>root.querySelector(`[name=${name}]`);
    if(box('discovery-placeholder'))f.discovery.placeholder=Boolean(box('discovery-placeholder').checked);
    if(box('sharing-enabled'))f.discovery.sharing_enabled=Boolean(box('sharing-enabled').checked);
    if(!isDeity(f)&&box('field-selective')){
      const selective=Boolean(box('field-selective').checked);let d=fieldDisclosure(f.field_reveals);d.mode=selective?'selective':'legacy';
      if(selective)for(const key of FIELD_KEYS){
        d.fields[key].party=Boolean(root.querySelector(`[name=field-party-${key}]`)?.checked);
        const actor=this.#actor;if(actor){const actors=new Set(d.fields[key].actors);
          if(root.querySelector(`[name=field-actor-${key}]`)?.checked)actors.add(actor);else actors.delete(actor);
          d.fields[key].actors=[...actors];}
      }
      f.field_reveals=d;
    }
    await saveChange(doc,f);this.#guard.markClean();await this.render({force:true});
    ui.notifications.info(isDeity(f)?'Deity visibility saved.':'Faction visibility saved.');
  }catch(e){notifyError(e)}}
  /** D4: GM Setup saves Player Access, damping and the group name together, only on Save Changes. Nothing is written
   * until every value is valid. Player Access goes through setPlayerAccess (same key, same launcher refresh). */
  static async saveSetup(){try{
    assertGM();const root=this.element.querySelector('[data-setup-form]')??this.element;
    const access=Boolean(root.querySelector('[name=player-access-enabled]')?.checked);
    const damping=Number(selectedValue(root,'pantheon-damping'));if(!validDamping(damping))throw Error(`Damping must be from 0 to ${DAMPING_MAX}.`);
    const fdamping=Number(selectedValue(root,'faction-damping'));if(!validDamping(fdamping))throw Error(`Faction damping must be from 0 to ${DAMPING_MAX}.`);
    const name=nameValue(root,'group-name');if(name.length>100)throw Error('Group name is too long (100 characters at most).');
    const named=Boolean(root.querySelector('[name=group-name-enabled]')?.checked);
    const labelChanged=name!==game.settings.get(MODULE_ID,'groupName')||named!==game.settings.get(MODULE_ID,'groupNameEnabled');
    if(damping!==pantheonDamping())await game.settings.set(MODULE_ID,'pantheonDamping',damping);
    if(fdamping!==factionDamping())await game.settings.set(MODULE_ID,'factionDamping',fdamping);
    if(labelChanged){await game.settings.set(MODULE_ID,'groupName',name);await game.settings.set(MODULE_ID,'groupNameEnabled',named);}
    if(access!==playerAccessEnabled())await setPlayerAccess(access);
    if(labelChanged)await reproject();
    this.#guard.markClean();ui.notifications.info('Renown settings saved.');await this.render({force:true});
  }catch(e){notifyError(e)}}
  /** Cancel in an editor footer: drop unsaved edits by drawing the saved values again (same tab, same record). */
  static async cancelEdit(){this.#guard.markClean();await this.render({force:true});}
  /** Developer Tools → Fill in permanent item ids: Check rewards is a dry run; Fill in ids asks first, then writes. */
  static async checkRewardIds(){try{assertGM();this.#backfill=await backfillItemIds({dryRun:true});await this.render({force:true});}catch(e){notifyError(e)}}
  static async fillRewardIds(){try{assertGM();const plan=await backfillItemIds({dryRun:true});this.#backfill=plan;
    if(!plan.fill.length){ui.notifications.info('Renown: no reward needs a permanent item id.');await this.render({force:true});return;}
    const n=plan.fill.length;if(!await confirmDialog(`Fill in the permanent item id of ${plural(n,'item reward')}? Links, claims and rewards that already have an id are not changed.`,{title:'Fill in permanent item ids?',yes:'Fill in ids'})){await this.render({force:true});return;}
    const done=await backfillItemIds({dryRun:false});this.#backfill={...await backfillItemIds({dryRun:true}),written:done.written};
    ui.notifications.info(`Renown: filled in ${plural(done.written,'permanent item id')}.`);await this.render({force:true});}catch(e){notifyError(e)}}
  static async clearOrgFilters(){this.#orgsView={...ORG_VIEW,kind:this.#kind};await this.render({force:true});}
  static async award(e,t){try{assertGM();const doc=definition(this.#cur),f=loadDef(doc),scope=t.dataset.scope,zone=t.closest('[data-award-scope]');if(!zone||!['group','individual'].includes(scope))throw Error('Invalid Renown award scope.');if(isDeity(f)&&scope!=='individual')throw Error('Deities have no group standing; award a character.');const delta=Number(zone.querySelector('[name=renown-delta]')?.value),reason=nameValue(zone,'renown-reason'),args={delta,reason,eventId:`RENOWN-EVT-${rid()}`,when:new Date().toISOString()};
    const actor=scope==='individual'?game.actors.get(this.#actor):null;if(scope==='individual'&&!actor)throw Error('Select a character.');const stateDoc=scope==='group'?await ensureGroup(doc):await ensurePersonal(doc,actor),key=scope==='group'?'groupClaims':'individual',state=structuredClone(stateDoc.getFlag(MODULE_ID,key)),result=adjustStanding(state.standing,args);if(!result.applied)return ui.notifications.warn('No change applied.');
    // Pantheon: a gain spreads to related deities only after the GM confirms each knock-on (all ticked by default).
    let chosen=[];
    if(isDeity(f)&&result.after>result.before){
      const names=new Map(deityDefs().map(d=>[getFaction(d).id,getFaction(d).name])),ko=knockOns(f,result.after-result.before,pantheonDamping(),names).filter(k=>definition(k.deity_id));
      if(ko.length){const picked=await checklistDialog('Related deities',`${actor.name} gains ${result.after-result.before} piety with ${f.name}. Also apply these? Untick any you do not want.`,ko.map(k=>({key:k.deity_id,label:`${k.name}: ${k.delta>0?'+':''}${k.delta} (${k.label})`,checked:true})),{ok:'Apply'});
        if(picked===null)return;chosen=ko.filter(k=>picked.includes(k.deity_id));}
    }
    // Renown: a PERSONAL gain with a faction spreads to related factions the character already knows, after the GM confirms each.
    let chosenFactions=[];
    if(!isDeity(f)&&scope==='individual'&&result.after>result.before){
      const ko=this.#factionKnockOns(f,actor,result.after-result.before);
      if(ko.rows.length){const picked=await checklistDialog('Related factions',`${actor.name} gains ${result.after-result.before} Renown with ${f.name}. Also apply these? Untick any you do not want.${ko.skipped?` ${plural(ko.skipped,'related faction')} this character has not met ${ko.skipped===1?'is':'are'} left out.`:''}`,ko.rows.map(k=>({key:k.faction_id,label:`${k.name}: ${k.delta>0?'+':''}${k.delta} (${k.label})`,checked:true})),{ok:'Apply'});
        if(picked===null)return;chosenFactions=ko.rows.filter(k=>picked.includes(k.faction_id));}
    }
    state.standing=result.standing;await stateDoc.setFlag(MODULE_ID,key,state);
    for(const k of chosenFactions)await writeRenown(k.faction_id,actor,k.delta,`${k.label} with ${f.name}: ${reason}`,{caused_by:args.eventId,source_faction:f.id});
    for(const k of chosen)await writeFavour(k.deity_id,actor,k.delta,`${k.label} with ${f.name}: ${reason}`,{caused_by:args.eventId,source_deity:f.id});
    const learned=grantAutoKnowledge(f,scope,actor?.id,result.standing.score);if(learned.changed.length)await saveDef(doc,learned.faction);
    await reproject();await this.render({force:true});ui.notifications.info(`${scope==='group'?'Group':actor.name} ${isDeity(f)?'Piety':'Renown'}: ${result.before} → ${result.after}${chosen.length?` (+${plural(chosen.length,'related deity','related deities')})`:''}${chosenFactions.length?` (+${plural(chosenFactions.length,'related faction')})`:''}`);
  }catch(e){notifyError(e)}}
  static async createFolder(){try{assertGM();const name=nameValue(this.element,'new-folder-name');if(!name||name.length>100)throw Error('Folder name required (max 100 characters).');const doc=await folderRecord(),entry=structuredClone(getFolders(doc));entry.folders.push({key:newFolderKey(entry,()=>`folder_${keyFor(rid())}`),name});await doc.setFlag(MODULE_ID,'folderIndex',entry);await reproject();await this.render({force:true});}catch(e){notifyError(e)}}
  static async saveFolder(e,t){try{assertGM();const d=await folderRecord(),rec=structuredClone(getFolders(d)),folder=rec.folders.find(x=>x.key===t.dataset.key);if(!folder)throw Error('Folder not found.');const name=await promptText(`Rename ${folder.name}`,'Folder name',folder.name,{ok:'Rename folder'});if(name===null)return;if(!name.trim()||name.trim().length>100)throw Error('Invalid name.');folder.name=name.trim();await d.setFlag(MODULE_ID,'folderIndex',rec);await reproject();await this.render({force:true});}catch(e){notifyError(e)}}
  /** Delete folder… (0.16.0): confirm, then move its members to Other factions. Focus goes to the next row's Delete, else the new-folder name. */
  static async deleteFolder(e,t){try{assertGM();const key=t.dataset.key,folder=folderList().find(x=>x.key===key);if(!folder)return this.render({force:true});
    const {factions,deities}=folderMembers(key),text=deleteFolderText({name:folder.name,factions,deities});
    if(!(await confirmDanger(text.message,{title:text.title,yes:text.yes})))return;
    const at=folderList().findIndex(x=>x.key===key);await deleteFolder(key);await this.render({force:true});
    const left=[...this.element?.querySelectorAll?.('[data-action="deleteFolder"]')??[]];
    (left[Math.min(at,left.length-1)]??this.element?.querySelector?.('[name="new-folder-name"]'))?.focus?.();
  }catch(e){notifyError(e)}}
  static async discovery(e,t){try{assertGM();const doc=definition(this.#cur),f=loadDef(doc);const action=t.dataset.mode;
    if(action==='party')f.discovery.party=!f.discovery.party;
    else if(action==='actor'){const actor=game.actors.get(this.#actor);if(!actor)throw Error('Select an assigned character.');const arr=f.discovery.actors;f.discovery.actors=arr.includes(actor.id)?arr.filter(i=>i!==actor.id):[...arr,actor.id];}
    else throw Error('Unknown discovery action.');await saveChange(doc,f);await this.render({force:true});}catch(e){notifyError(e)}}
  static async share(){try{requirePlayerAccess();if(game.user.isGM)throw Error('GM can reveal factions directly.');const view=getView(userViewDoc(game.user));if(!view)throw Error('No player discovery record available.');const known=viewEntry(view,this.#cur);if(!known?.canShare)throw Error('You cannot share this entry.');if(!await confirmDialog(`Share everything you have discovered about ${known.name} with the party? Personal Renown and rewards stay private.`,{title:'Share with party',yes:'Share with party'}))return;const request={type:'share',factionId:known.id,userId:game.user.id,capability:view.capability};sendClientAction(request);ui.notifications.info('Sharing discovery with party; awaiting GM confirmation...');}catch(e){notifyError(e)}}
  /** Add only the typed, reusable source reference; do not resolve/reveal a Quest. */
  static async addObjective(){try{
    assertGM();const doc=definition(this.#selected);if(!doc)throw Error('Choose a faction first.');
    const f=loadDef(doc),root=this.element;
    const ref={relation:selectedValue(root,'objective-relation'),target_id:String(root.querySelector('#agf-objective-id')?.value??'').trim(),mode:selectedValue(root,'objective-mode')};
    const next=addObjectiveRef(f,ref);
    await saveChange(doc,next);await this.render({force:true});
    ui.notifications.info('Objective reference saved. Quest visibility and progress were not changed.');
  }catch(e){notifyError(e)}}
  /** GM only: copies an id from a Details fold to the clipboard; the id itself is never shown in a normal view. */
  static async copyId(e,t){try{assertGM();const text=String(t.dataset.copy??'');if(!text)return;if(game.clipboard?.copyPlainText)await game.clipboard.copyPlainText(text);else await navigator.clipboard.writeText(text);ui.notifications.info('Renown: id copied.');}catch(err){notifyError(err)}}
  static async removeObjective(e,t){try{
    assertGM();const doc=definition(this.#selected);if(!doc)throw Error('Choose a faction first.');
    const ref={relation:t.dataset.relation,target_id:t.dataset.objective,mode:t.dataset.mode};
    if(!await confirmDanger(`${loadDef(doc).name} no longer lists it. Quest progress is not changed.`,{title:`Remove this ${objectiveKind(ref.target_id).toLowerCase()} reference?`,yes:'Remove reference'}))return;
    await saveChange(doc,removeObjectiveRef(loadDef(doc),ref));await this.render({force:true});
  }catch(e){notifyError(e)}}
  static async addEntry(e,t){try{assertGM();const zone=t.closest('[data-info-editor]'),doc=definition(this.#cur),f=loadDef(doc),name=nameValue(zone,'info-name');if(!name)throw Error('Entry needs a title.');f.entries.push({id:`info_${keyFor(rid())}`,name,text:nameValue(zone,'info-text'),link_mode:'preview',unlock:zone.querySelector('[name=info-unlock]')?.value??'manual',threshold:Number(zone.querySelector('[name=info-threshold]')?.value??0),discovered_party:false,discovered_actors:[]});await saveChange(doc,f);await this.render({force:true});}catch(e){notifyError(e)}}
  static async showEntry(e,t){try{assertGM();const doc=definition(this.#cur),f=loadDef(doc),entry=f.entries.find(r=>r.id===t.dataset.entry);if(!entry)throw Error('Entry not found.');const action=t.dataset.mode;if(action==='party')entry.discovered_party=!entry.discovered_party;else if(action==='actor'){const actor=game.actors.get(this.#actor);if(!actor)throw Error('Select character first.');entry.discovered_actors??=[];entry.discovered_actors=entry.discovered_actors.includes(actor.id)?entry.discovered_actors.filter(i=>i!==actor.id):[...entry.discovered_actors,actor.id];}else if(action==='mode'){entry.link_mode=entry.link_mode==='preview'?'document':'preview';}else if(action==='edit'){const txt=await promptText('Edit information',`Information for ${entry.name}:`,entry.text??'',{multiline:true});if(txt===null)return;entry.text=txt;}else if(action==='remove'){if(!await confirmDanger(`Players lose this entry from ${f.name}. This is not undone.`,{title:`Remove ${entry.name}?`,yes:'Remove entry'}))return;f.entries=f.entries.filter(x=>x.id!==entry.id);}await saveChange(doc,f);await this.render({force:true});}catch(e){notifyError(e)}}
  static async addReward(e,t){try{assertGM();const zone=t.closest('[data-reward-drop]'),doc=definition(this.#cur),f=loadDef(doc),name=nameValue(zone,'reward-name');if(!name)throw Error('Reward name required.');f.rewards.push({id:`rw-${rid()}`,key:keyFor('rw_'+rid()),audience:zone.dataset.audience,milestone_id:zone.dataset.milestone,name,teaser:name,description:nameValue(zone,'reward-description'),kind:'custom',tags:[],behavior:zone.querySelector('[name=reward-behavior]')?.value??'one_time',usage_limit:Number(zone.querySelector('[name=reward-limit]')?.value??0)});await saveChange(doc,f);await this.render({force:true});}catch(e){notifyError(e)}}
  static async editReward(e,t){try{assertGM();const doc=definition(this.#cur),f=loadDef(doc),reward=f.rewards.find(r=>r.id===t.dataset.reward);if(!reward)throw Error('Reward not found.');const v=await formDialog(`Edit ${reward.name}`,[{name:'name',label:'Reward name',value:reward.name},{name:'teaser',label:'Locked reward teaser',value:reward.teaser??reward.name},{name:'description',label:'Unlocked description',value:reward.description??'',type:'textarea'},{name:'tags',label:'Tags (comma separated)',value:(reward.tags??[]).join(', ')},{name:'behavior',label:'Behavior',value:reward.behavior??'one_time',type:'select',options:[{value:'one_time',label:'One time'},{value:'repeatable_service',label:'Repeatable service'},{value:'passive',label:'Passive'}]},{name:'usage_limit',label:'Usage limit (0 = unlimited)',value:reward.usage_limit??0,type:'number'}],{ok:'Save Changes'});if(v===null)return;const {name,teaser,description,tags,behavior}=v;if(!['one_time','repeatable_service','passive'].includes(behavior))throw Error('Invalid reward behavior.');const limit=Number(v.usage_limit);if(!Number.isSafeInteger(limit)||limit<0)throw Error('Invalid usage limit.');Object.assign(reward,{name:name.trim(),teaser,description,tags:tags.split(',').map(s=>s.trim()).filter(Boolean),behavior,usage_limit:limit});await fillRewardItemId(reward);await saveChange(doc,f);await this.render({force:true});}catch(e){notifyError(e)}}
  static async removeReward(e,t){try{assertGM();const doc=definition(this.#cur),f=loadDef(doc),id=t.dataset.reward;if(game.journal.some(d=>{const state=getGroup(d)??getPersonal(d);return state&&(state.claims?.[id]||Object.values(state.requests??{}).some(r=>r.reward_id===id))}))throw Error('Reward has recorded claims or requests; do not delete its identity.');const reward=f.rewards.find(r=>r.id===id),held=reward?.kind==='uuid'?await loadDoc(reward.uuid):null,holding=isHoldingCopy(held)?held:null;if(!await confirmDanger(`Players can no longer claim it from ${f.name}.${holding?' Its GM-only holding copy in the Items sidebar is deleted too.':''} This is not undone.`,{title:`Remove ${reward?.name??'this reward'}?`,yes:'Remove reward'}))return;f.rewards=f.rewards.filter(r=>r.id!==id);await saveChange(doc,f);if(holding&&!defs().some(d=>(getFaction(d)?.rewards??[]).some(r=>r.uuid===holding.uuid)))await deleteWorldItems((await bundleOf(holding)).map(i=>i.id));await this.render({force:true});}catch(e){notifyError(e)}}
  static async claim(e,t){try{requirePlayerAccess();if(game.user.isGM){ui.notifications.warn('Test claims as a player.');return;}const view=getView(userViewDoc(game.user)),f=viewEntry(view,this.#cur);if(!f||!activeGM())throw Error('Entry or online GM unavailable.');const audience=t.dataset.audience,actor=audience==='individual'?game.actors.get(this.#actor):null;if(audience==='individual'&&!actor)throw Error('Choose your assigned character.');const msg={type:'request',factionId:f.id,actorId:actor?.id??null,rewardId:t.dataset.reward,audience,userId:game.user.id,capability:view.capability};sendClientAction(msg);ui.notifications.info('Request sent; awaiting GM confirmation...');}catch(e){notifyError(e)}}
  static async resolveRequest(e,t){try{assertGM();const doc=game.journal.get(t.dataset.doc),group=Boolean(getGroup(doc)),key=group?'groupClaims':'individual',state=structuredClone(doc?.getFlag(MODULE_ID,key)),fdoc=definition(state?.faction_id),f=loadDef(fdoc),action=t.dataset.mode;const one=Boolean(t.dataset.claim),id=t.dataset.key;
    if(!state||!fdoc)throw Error('Request record missing.');const record=one?state.claims?.[id]:state.requests?.[id],reward=f.rewards.find(r=>r.id===(one?id:record?.reward_id));if(!record||!reward)throw Error('Request no longer exists.');
    if(action==='deny'){if(!['pending','requested','approved'].includes(record.status))throw Error('Cannot deny completed request.');
      const who=state.actor_id?game.actors.get(state.actor_id)?.name??'this character':'the group';
      if(!await confirmDanger(`Deny the request for "${reward.name}" from ${who}? The player is not told why, and this is not undone.`,{title:`Deny ${reward.name}?`,yes:'Deny request'}))return;
      record.status='denied';record.usage_charged=false;}
    else if(action==='approve'){
      if(!['pending','requested'].includes(record.status))throw Error('Request already reviewed.');if(!rewardUnlocked(reward,f,state.standing.score))throw Error(`${isDeity(f)?'Piety':'Renown'} no longer qualifies.`);if(!chooseOneEligible({faction:f,reward,claims:state.claims,choices:state.choices}))throw Error('Another Choose One reward already confirmed.');
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
  static async resetUsage(e,t){try{assertGM();const doc=definition(this.#cur),f=loadDef(doc),aud=t.dataset.audience,actor=aud==='individual'?game.actors.get(this.#actor):null,store=aud==='group'?await ensureGroup(doc):actor?await ensurePersonal(doc,actor):null;if(!store)throw Error('No selected character.');const key=aud==='group'?'groupClaims':'individual',state=structuredClone(store.getFlag(MODULE_ID,key)),reward=f.rewards.find(r=>r.id===t.dataset.reward);if(reward?.behavior!=='repeatable_service')throw Error('Not a service.');if(!await confirmDanger(`The used charges go back to zero${actor?` for ${actor.name}`:''}. Fulfilled request history stays.`,{title:`Reset the charges of ${reward.name}?`,yes:'Reset charges'}))return;state.uses??={};const old=state.uses[reward.id]??{consumed:0,reset_count:0};state.uses[reward.id]={consumed:0,reset_count:old.reset_count+1};await store.setFlag(MODULE_ID,key,state);await reproject();await this.render({force:true});}catch(e){notifyError(e)}}
  static async resetChoice(e,t){try{assertGM();const fdoc=definition(this.#cur),f=loadDef(fdoc),audience=t.dataset.audience,actor=audience==='individual'?game.actors.get(this.#actor):null,doc=audience==='group'?await ensureGroup(fdoc):actor?await ensurePersonal(fdoc,actor):null;if(!doc)throw Error('Choose an assigned character first.');const key=audience==='group'?'groupClaims':'individual',state=structuredClone(doc.getFlag(MODULE_ID,key));const level=(audience==='group'?f.renown_track:f.individual_track).milestones.find(m=>m.id===t.dataset.milestone);if(!await confirmDanger('Another reward can then be chosen. Items or benefits already granted are not removed.',{title:`Clear the choice for ${level?.name??'this milestone'}?`,yes:'Clear choice'}))return;state.choices??={};state.choices[t.dataset.milestone]=null;await doc.setFlag(MODULE_ID,key,state);await reproject();await this.render({force:true});}catch(e){notifyError(e)}}
  static async openLinked(e,t){try{requirePlayerAccess();const uuid=t.dataset.uuid;if(!uuid)throw Error('No document link.');const doc=await fromUuid(uuid);if(!doc||!(doc.testUserPermission?.(game.user,OBS)||(doc.parent?.documentName==='Actor'&&doc.parent.testUserPermission?.(game.user,OWNER))))throw Error('Document access is not permitted.');doc.sheet.render(true);}catch(e){notifyError(e)}}
  /** Factions tab → Import… (a keyboard-reachable file button, kit fileButton). */
  async importFile(file){
    if(!file)return;
    try{
      assertGM();
      if(file.size>2_000_000)throw Error('File too large (over 2 MB).');
      let data;try{data=JSON.parse(await file.text());}catch{throw Error('That file is not valid JSON.');}
      const first=previewFactionsImport(data);
      if(first.errors.length)throw Error(first.errors.slice(0,5).join(' | '));
      let options={mode:'skip',overwriteEdited:false};
      if(first.rows.some(r=>r.action==='skip')){
        if(!(await this.okToLeave()))return;
        const v=await formDialog('Import options',[
          {name:'update',type:'checkbox',label:'Update the factions and deities already here',checked:false,hint:'Rewrites their definitions from the file (text, ranks, rewards, entries, relations). Renown, claims, requests, choices, discovery and what the party learned are kept. A snapshot of each definition is saved first.'},
          {name:'overwrite',type:'checkbox',label:'Also overwrite faction edits',checked:false,hint:'Only matters when you changed a definition here after its last import. Off: those are kept as they are.'}],{ok:'Preview…'});
        if(!v)return;
        if(v.update)options={mode:'update',overwriteEdited:Boolean(v.overwrite)};
      }
      const {errors,rows}=previewFactionsImport(data,options);
      if(errors.length)throw Error(errors.slice(0,5).join(' | '));
      const todo=rows.filter(r=>r.action==='new'||r.action==='update').length;
      const label={new:'New',update:'Update',unchanged:'Unchanged',kept:'Kept: edited',skip:'Already here'};
      const list=rows.map(r=>`${label[r.action]??r.action} · ${r.kind==='deity'?'Deity':'Faction'} · ${r.name}${r.action==='update'||r.action==='kept'?` — ${r.changes?.summary||r.reason}`:''}`).join('\n');
      if(!todo){ui.notifications.info(options.mode==='update'?'Nothing to import: everything in that file matches this world or is kept as edited.':'Nothing to import: every faction and deity in that file is already in this world.');return;}
      if(!(await this.okToLeave()))return;
      const updating=rows.filter(r=>r.action==='update').length;
      const ok=await confirmDialog(`${updating?`Add ${todo-updating} and update ${updating}`:`Add ${todo}`} of ${rows.length} entries from ${file.name}?\n${list}\n${updating?'Updating rewrites the definition only. Renown, claims, requests, choices, discovery and what the party learned are kept. A snapshot of the old definitions is saved first, and import stops if it cannot be saved.':'Existing factions and deities, their Renown and discovery are never changed.'}`,{title:'Import these definitions?',yes:'Import'});
      if(!ok)return;
      const result=await importFactions(data,options);
      if(result.snapshot?.id){try{jsonDownload(getSnapshot(game.journal.get(result.snapshot.id)),'AG_Renown_Snapshot.json');}catch{/* the world copy is the guaranteed one */}}
      ui.notifications.info(`Renown imported: ${result.added.length} added, ${result.updated.length} updated, ${result.skipped.length} kept as they were${result.failed.length?`, ${result.failed.length} failed`:''}.${result.notes.length?` ${result.notes.length} note(s): ${result.notes.slice(0,2).join(' ')}`:''}${result.missingActors.length?` No character named: ${result.missingActors.join(', ')} (import the Manager pack first); their personal Renown was skipped.`:''}`);
      await this.render({force:true});
    }catch(e){notifyError(e)}
  }
  static async exportAll(){try{assertGM();jsonDownload({schema_version:IMPORT_SCHEMA,definitions:defs().map(d=>withLiveFolder(sourceDefinition(getFaction(d)))),note:'Excludes all mutable campaign state and user discovery state.'},'AG_Factions_Definitions.json');}catch(e){notifyError(e)}}
}
// FR-02: every action that re-renders asks first when typed edits are unsaved (the submit actions save them instead).
for(const [name,fn] of Object.entries(Dashboard.DEFAULT_OPTIONS.actions)){
  if(UNGUARDED.has(name))continue;
  Dashboard.DEFAULT_OPTIONS.actions[name]=async function(event,target){if(!(await this.okToLeave()))return;return fn.call(this,event,target);};
}
/** One character's standing with every deity that character knows. Players: only characters they own, from their
 * projected view, so nothing unrevealed is ever read. GM: from the definitions. Returns [] when nothing is visible. */
/** Build data for the Vow feature Item from the god's Seeker reward (`vow_benefit`), or null when the god has none yet. Read defensively.
 * GM reads definitions; a player reads the Seeker card their view already carries (vow_benefit is only sent once the rank is reached). */
function vowItemData(actor,deityId){
  try{
    let rewards,first=null,card;
    if(game.user.isGM){const d=deityDefs().map(x=>upgradeFaction(loadDef(x))).find(x=>x.id===deityId);if(!d)return null;rewards=d.rewards;first=d.individual_track.milestones[0]?.id??null;card=deityCard(d);}
    else{const x=(getView(userViewDoc(game.user))?.payload?.deities??[]).find(g=>g.id===deityId);if(!x)return null;rewards=x.personal?.[actor.id]?.milestones?.[0]?.rewards;card=deityCard(x);}
    const pick=pickVowReward(rewards,first);if(!pick)return null;
    return buildVowItemData({deityId,godName:card.name,symbol:card.symbol??'',...pick,moduleId:MODULE_ID,newId:()=>foundry.utils.randomID(16)});
  }catch(err){console.warn(`${MODULE_ID} | Vow item data unavailable`,err);return null;}
}
/** A god's name for Vow wording, from the same source the viewer already reads (definitions for the GM, the projected view for players). */
const getVowGodName=id=>{const d=game.user.isGM?deityDefs().map(x=>getFaction(x)).find(x=>x?.id===id):(getView(userViewDoc(game.user))?.payload?.deities??[]).find(x=>x.id===id);return d?.name??'that god';};
/** Whether this character has reached the god's first rank (the Seeker rank). Permission-checked data, not the button. */
function vowUnlocked(actor,deityId){
  const row=pantheonFor(actor).find(g=>g.id===deityId);if(!row)return false;
  const list=game.user.isGM?deityDefs().map(d=>upgradeFaction(loadDef(d))):(getView(userViewDoc(game.user))?.payload?.deities??[]);
  const f=list.find(x=>x.id===deityId),first=(f?.individual_track?.milestones??f?.ladder??[])[0];
  return Boolean(first&&row.score>=first.threshold);
}
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
// `choices` (milestone id → chosen reward) shows Clear choice only on a Choose one level with a recorded choice (FR-11).
const editorLevels=(track,rewards,audience=null,looks=null,choices=null)=>track.milestones.map((m,i)=>({...m,order:i+1,rewards:rewards.filter(r=>(!audience||r.audience===audience)&&r.milestone_id===m.id).map(r=>({...r,behaviorText:behaviorLabel(r.behavior),...(looks?.get(r.id)??{})})),isAll:m.selection_mode==='all',isOne:m.selection_mode==='choose_one',hasChoice:m.selection_mode==='choose_one'&&Boolean(choices?.[m.id])}));
/** GM entry rows (Information, Lore): unlock in words, who knows it as badges (FR-07), and the button labels. */
const entryRows=(entries=[],actorId,who,unit)=>entries.map(e=>{
  const party=Boolean(e.discovered_party),mine=Boolean(actorId&&e.discovered_actors?.includes(actorId)),others=(e.discovered_actors??[]).filter(id=>id!==actorId).length;
  const badges=[party&&{label:'Party',cls:'ag-badge--ok'},mine&&{label:who,cls:'ag-badge--accent'},!party&&!mine&&others&&{label:`Known to ${plural(others,'other character')}`,cls:''},!party&&!mine&&!others&&{label:'Hidden',cls:''}].filter(Boolean);
  return {...e,unlockText:unlockLabel(e.unlock,e.threshold,unit),badges,partyLabel:revealLabel(party,'party'),actorLabel:revealLabel(mine,who),linkLabel:linkModeAction(e.link_mode)};});
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
const embedVow=(actor,gods)=>{const v=actor?getVow(actor,MODULE_ID):null,g=v&&gods.find(x=>x.id===v.deity_id);return g?`<p class="agf-embed__vow">Vow: ${esc(g.name)}</p>`:'';};
function embedHTML(ctrl){
  if(!playerMayOpen())return '<div class="ag-empty">The GM has hidden Renown.</div>';
  const actor=ctrl.actorId?game.actors.get(ctrl.actorId):null,rows=standingRows(ctrl.actorId);
  // 0.11.0: this character's piety with each deity they know (same permission path as api.getPantheon).
  const gods=actor?pantheonFor(actor):[];
  if(!rows.length&&!gods.length)return '<div class="ag-empty">No factions or deities known yet.</div>';
  const signed=n=>n>0?`+${n}`:String(n);
  const cell=(label,s)=>s?`<div class="agf-embed__cell"><small>${esc(label)}</small><strong>${esc(s.rank)}</strong><span class="agf-embed__score">${signed(s.score)}</span>${s.next?`<span class="agf-embed__next">Next: ${esc(s.next.name)} at ${s.next.threshold}</span>`:'<span class="agf-embed__next">Top rank</span>'}</div>`:'';
  const hidden=!game.user.isGM&&actor&&rows.every(r=>!r.personal);
  return `<div class="agf-embed__body">${rows.map(r=>`<section class="agf-embed__row" data-faction="${esc(r.id)}"><header><strong>${esc(r.name||UNKNOWN_FACTION)}</strong>
      <button type="button" class="ag-btn ag-btn--sm" data-agf-embed="open" data-faction="${esc(r.id)}" data-tooltip="Open in Renown" data-tooltip-class="ag-tooltip">Open</button></header>
      <div class="agf-embed__cells">${cell(groupLabel(),r.group)}${cell(actor?.name??'Character',r.personal)}</div></section>`).join('')}
    ${hidden?`<p class="agf-embed__note">${esc(actor.name)}'s own standing shows to their owner.</p>`:''}${gods.length?`<h3 class="agf-embed__heading">Pantheon</h3>${embedVow(actor,gods)}${gods.map(g=>`<section class="agf-embed__row agf-embed__deity" data-deity="${esc(g.id)}"><header><span class="agf-symbol agf-symbol--small">${g.symbol?`<img class="agf-symbol-img" src="${esc(g.symbol)}" alt="">`:''}<i class="fa-solid fa-sun agf-symbol-glyph" aria-hidden="true"></i></span><strong>${esc(g.name)}</strong>${g.title?` <small>${esc(g.title)}</small>`:''}
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
  // An open window with unsaved edits is only brought forward; re-rendering it would drop the typed edits.
  if(dashboard.rendered&&dashboard.isDirty){dashboard.bringToFront?.();return dashboard;}
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
  // {{#agfFold key title count hint open}}…{{/agfFold}}: the kit's fold() around template content (kit 2.2).
  globalThis.Handlebars?.registerHelper?.('agfParas',(text,cls)=>new Handlebars.SafeString(paragraphHTML(text,typeof cls==='string'?cls:undefined)));
  globalThis.Handlebars?.registerHelper?.('agfFold',function(options){const h=options.hash??{};return new Handlebars.SafeString(fold({key:h.key,title:h.title,count:h.count,hint:h.hint,open:Boolean(h.open),body:options.fn(this)}));});
  // 1 once Renown has filed its own documents under Ashen Gate (folder-nesting.mjs); config:false.
  game.settings.register(MODULE_ID,FOLDER_SETTING,{name:'Renown: folder nesting',scope:'world',config:false,type:String,default:''});
  game.settings.register(MODULE_ID,'groupName',{name:'Group display name',scope:'world',config:false,type:String,default:''});
  game.settings.register(MODULE_ID,'factionDamping',{name:'Faction knock-on damping',scope:'world',config:false,type:Number,default:DAMPING_DEFAULT});
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
    getFactions:()=>{requirePlayerAccess();return game.user.isGM?factionDefs().map(d=>withLiveFolder(sourceDefinition(getFaction(d)))):getView(userViewDoc(game.user))?.payload.factions??[];},
    validateFaction,
    // Pantheon read API. Players get only deities revealed to one of their characters (their projected view).
    getDeities:()=>{requirePlayerAccess();return game.user.isGM?deityDefs().map(d=>sourceDefinition(getFaction(d))):structuredClone(getView(userViewDoc(game.user))?.payload?.deities??[]);},
    getPantheon:actor=>pantheonFor(actor),
    // GM-only read: what a personal gain of `gain` with a faction would knock on to its related factions (nothing is applied; discovery is not checked).
    getFactionKnockOns:(factionId,gain)=>{assertGM();const doc=definition(factionId),f=doc&&loadDef(doc);if(!f||isDeity(f))throw Error('Faction not found.');const names=new Map(factionDefs().map(d=>[getFaction(d).id,getFaction(d).name]));return factionKnockOns(f,Number(gain),factionDamping(),names);},
    // GM-only, additive: adds factions that are not in the world yet (see scripts/import.mjs). Existing factions are never changed.
    // 0.18.0: options {mode:'skip'|'update', overwriteEdited:false}. Default 'skip' is unchanged. 'update' rewrites the definitions
    // of records already here (after saving a snapshot) and keeps all campaign state. See scripts/update.mjs.
    previewFactionsImport:(data,options)=>previewFactionsImport(data,options),
    importFactions:(data,options)=>importFactions(data,options),
    importOptions:Object.freeze({contract:'ag-renown-import/1',modes:Object.freeze(['skip','update']),overwriteEdited:true}),
    // 0.16.0, GM only: delete a folder by key; its factions move to Other factions and are never deleted.
    deleteFolder:key=>deleteFolder(key),
    // 0.17.0, GM only: move saved entry ids to the ids that supersede them (see scripts/supersede.mjs).
    supersedeIds:(map,options)=>supersedeIds(map,options),
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
    else if(msg?.type==='refresh'&&dashboard?.rendered&&playerMayOpen())dashboard.refresh();
  });
  // 0.18.2: a Manager bulk write (options.agBulk) wakes nothing; one refresh follows ashenGate.bulkFinished.
  const isBulk=(...a)=>a.some(x=>x&&typeof x==='object'&&x.agBulk===true);
  Hooks.on('ashenGate.bulkFinished',()=>{refreshEmbeds();if(dashboard?.rendered&&playerMayOpen())dashboard.refresh();});
  for(const hook of ['updateJournalEntry','createJournalEntry','deleteJournalEntry'])Hooks.on(hook,(doc,...rest)=>{
    if(isBulk(...rest))return;
    refreshEmbeds();
    if(dashboard?.rendered&&playerMayOpen())dashboard.refresh();
  });
  // dnd5e 6.0.6 has no roll-based expiry, so the applied Vow effect ends here once a matching roll is made.
  const vowRoll=(actor,roll)=>{if(actor&&canActor(game.user,actor))void expireVowEffects(actor,MODULE_ID,roll).catch(notifyError);};
  Hooks.on('dnd5e.rollSkill',(rolls,d)=>vowRoll(d?.subject,{kind:'skill',key:d?.skill}));
  Hooks.on('dnd5e.rollToolCheck',(rolls,d)=>vowRoll(d?.subject,{kind:'tool',key:d?.tool}));
  Hooks.on('dnd5e.rollAbilityCheck',(rolls,d)=>vowRoll(d?.subject,{kind:'check',key:d?.ability}));
  Hooks.on('dnd5e.rollSavingThrow',(rolls,d)=>vowRoll(d?.subject,{kind:'save',key:d?.ability}));
  Hooks.on('dnd5e.rollAttack',(rolls,d)=>vowRoll(d?.subject?.actor,{kind:'attack',key:''}));
  Hooks.on('updateActor',(actor,change)=>{if(change?.flags?.[MODULE_ID]&&('vow' in change.flags[MODULE_ID]||'-=vow' in change.flags[MODULE_ID])){refreshEmbeds();if(dashboard?.rendered&&playerMayOpen())dashboard.refresh();}});
  Hooks.on('updateSetting',setting=>{
    refreshEmbeds();
    if(setting?.key===`${MODULE_ID}.playerAccessEnabled`){
      accessSettingChanged(setting);
      return; // Do not rerender a freshly restricted player window.
    }
    if(dashboard?.rendered&&playerMayOpen())dashboard.refresh();
  });
  if(game.user.isGM&&activeGM()?.id===game.user.id)void migrate().catch(notifyError);
  console.info(`[${MODULE_ID}] v${moduleVersion()}; Actors launcher; Player Access ${playerAccessEnabled()?'enabled':'hidden'}; GM-only definitions + filtered player views.`);
});
