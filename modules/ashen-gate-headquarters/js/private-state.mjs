/**
 * Headquarters private-state persistence. The world setting `state` is a PUBLIC
 * projection only: Foundry world settings are synchronized to every client.
 * The complete campaign state resides on a JournalEntry with NO player rights.
 * This is additive to aghq-state/0.1; the schema/room/installation keys do not change.
 *
 * A first GM login migrates the old world-setting snapshot: commit private first,
 * then replace the public setting. Failure never deletes the original or vault.
 */
import {emptyState,FORMAT,MODULE_ID} from './logic.mjs';
import {PERSONNEL_FORMAT} from './hirelings.mjs';

export const VAULT_POINTER='privateStateDocumentId';
export const VAULT_FLAG='privateCampaignState';
export const VAULT_MARKER='headquartersPrivateVault';
export const VAULT_TITLE='Ashen Gate | Headquarters — Private Campaign State';
const clone=x=>structuredClone(x);
const gmOnly=(user)=>{if(!user?.isGM)throw Error('GM-only Headquarters private state access denied.');};

/** Redact ALL roster data and identifying staff references from every player-synced copy.
 * No per-player roster whitelist exists in v0.5.2. Don't use source visibility as
 * a promise that the HIRE-* membership/Working/departure state is public.
 */
export function projectPublicState(full){
 if(!full||full.format!==FORMAT)throw Error('Unrecognized Headquarters save; refusing private-state projection.');
 // Explicit allowlist prevents later GM-only fields from falling through a
 // whole-record clone when the domain state gains new private properties.
 const allowed=['format','active','core','config','catalog','inventory','personal_layouts','editor_lease','state_revision'];
 const pub=Object.fromEntries(allowed.filter(key=>Object.hasOwn(full,key)).map(key=>[key,clone(full[key])]));
 pub.personnel={format:PERSONNEL_FORMAT,hirelings:[]};
 for(const site of pub.core?.headquarters_states||[]){
  site.staffing_slots=(site.staffing_slots||[]).map(slot=>({
   key:slot.key,room_key:slot.room_key,
   ...(slot.installation_key?{installation_key:slot.installation_key}:{}),
   occupant_hireling_ref:null
  }));
 }
 return pub;
}

export function isPublicProjectionSafe(data){
 if(!data||data.format!==FORMAT)return false;
 if(!data.personnel||data.personnel.format!==PERSONNEL_FORMAT||!Array.isArray(data.personnel.hirelings)||data.personnel.hirelings.length>0)return false;
 if(Object.keys(data).some(key=>!['format','active','core','config','catalog','inventory','personal_layouts','editor_lease','state_revision','personnel'].includes(key)))return false;
 return !(data.core?.headquarters_states||[]).some(hq=>(hq.staffing_slots||[]).some(s=>s.occupant_hireling_ref!==null));
}

export function requirePrivateVaultPermissions(doc,users){
 if(!doc)throw Error('Headquarters private vault is missing; no public-state fallback allowed.');
 const own=doc.ownership??{};
 if(Number(own.default??0)>0)throw Error('Private vault has public document permissions. Restrict it before continuing.');
 for(const [id,level] of Object.entries(own)){
  if(id==='default')continue;
  if(Number(level)>0&&!users?.get?.(id)?.isGM)throw Error('Private vault grants a non-GM document permission; revoke it before continuing.');
 }
 return true;
}

export function createPrivateStateStore({game,JournalEntryClass,settings=game?.settings}={}){
 if(!game || !settings || !JournalEntryClass)throw TypeError('Missing Foundry private-state dependencies.');
 let authoritative=null;
 let document=null;
 let initialized=false;
 const getPublic=()=>projectPublicState(settings.get(MODULE_ID,'state')??emptyState());
 const isReady=()=>initialized;
 function read(){
  if(!game.user?.isGM)return getPublic();
  if(!initialized||!authoritative)throw Error('Private Headquarters state is not loaded; GM must complete migration first.');
  requirePrivateVaultPermissions(document,game.users);
  return clone(authoritative);
 }
 async function save(full){
  gmOnly(game.user);
  if(!initialized||!document)throw Error('Private Headquarters state not initialized.');
  requirePrivateVaultPermissions(document,game.users);
  if(full?.format!==FORMAT)throw Error('Refusing to persist an unknown Headquarters state format.');
  const owned=clone(full);
  // Save private record first. Public setting failure is recoverable on GM login.
  await document.update({[`flags.${MODULE_ID}.${VAULT_FLAG}`]:owned});
  authoritative=owned;
  await settings.set(MODULE_ID,'state',projectPublicState(owned));
  return {state_revision:owned.state_revision};
 }
 async function initialize(){
  gmOnly(game.user);
  if(initialized)return {migrated:false};
  let pointer=String(settings.get(MODULE_ID,VAULT_POINTER)||'');
  const docs=game.journal?.contents ?? [];
  const matches=docs.filter(doc=>doc.flags?.[MODULE_ID]?.[VAULT_MARKER]===true);
  if(matches.length>1)throw Error('Multiple Headquarters private vaults found; GM must reconcile before proceeding.');
  let target=pointer?game.journal?.get?.(pointer):matches[0]??null;
  if(pointer&&!target)throw Error('Private Headquarters vault pointer exists but vault is inaccessible/missing; no legacy fallback.');
  if(!pointer&&matches.length===1){target=matches[0];pointer=target.id;}
  if(target){
   requirePrivateVaultPermissions(target,game.users);
   const full=target.getFlag?.(MODULE_ID,VAULT_FLAG)??target.flags?.[MODULE_ID]?.[VAULT_FLAG];
   if(!full||full.format!==FORMAT)throw Error('Headquarters private vault is empty or incompatible; refusing destructive recovery.');
   authoritative=clone(full);document=target;
   if(settings.get(MODULE_ID,VAULT_POINTER)!==pointer)await settings.set(MODULE_ID,VAULT_POINTER,pointer);
   initialized=true;
   // Repair interrupted migration or a stale public snapshot. Never restore
   // private state to the world setting, even transiently.
   const publicValue=projectPublicState(authoritative);
   if(JSON.stringify(settings.get(MODULE_ID,'state'))!==JSON.stringify(publicValue))await settings.set(MODULE_ID,'state',publicValue);
   return {migrated:false,reconciled:true};
  }
  const old=settings.get(MODULE_ID,'state')??emptyState();
  if(old.format!==FORMAT)throw Error('Unsupported legacy Headquarters save; state not changed.');
  // A restricted Journal is a server-authorized store. Do not set non-GM rights.
  const created=await JournalEntryClass.create({name:VAULT_TITLE,ownership:{default:0},flags:{[MODULE_ID]:{[VAULT_MARKER]:true,[VAULT_FLAG]:clone(old)}}},{renderSheet:false});
  if(!created?.id)throw Error('Could not create Headquarters private vault; legacy state retained.');
  requirePrivateVaultPermissions(created,game.users);
  document=created;authoritative=clone(old);
  // Saving pointer BEFORE redaction permits recovery if the second write fails.
  await settings.set(MODULE_ID,VAULT_POINTER,created.id);
  initialized=true;
  await settings.set(MODULE_ID,'state',projectPublicState(old));
  return {migrated:true,reconciled:true};
 }
 return Object.freeze({read,save,initialize,isReady,publicRead:getPublic});
}
