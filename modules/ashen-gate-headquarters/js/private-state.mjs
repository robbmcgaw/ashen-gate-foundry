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
/** The words a GM types to confirm starting a new private vault from the public copy. */
export const NEW_VAULT_PHRASE='NEW VAULT';
/** Problems the GM can resolve from the recovery dialog. Each error from initialize() carries one `code`. */
export const RECOVERABLE_CODES=Object.freeze(['vault-missing','vault-multiple','vault-incompatible']);
const vaultError=(message,code)=>Object.assign(Error(message),{code});
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
 let lastFailure=null;
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
 async function adopt(target,full,pointer){
  authoritative=clone(full);document=target;
  if(settings.get(MODULE_ID,VAULT_POINTER)!==pointer)await settings.set(MODULE_ID,VAULT_POINTER,pointer);
  initialized=true;lastFailure=null;
  // Repair interrupted migration or a stale public snapshot. Never restore
  // private state to the world setting, even transiently.
  const publicValue=projectPublicState(authoritative);
  if(JSON.stringify(settings.get(MODULE_ID,'state'))!==JSON.stringify(publicValue))await settings.set(MODULE_ID,'state',publicValue);
  return {migrated:false,reconciled:true};
 }
 const vaultJournals=()=>(game.journal?.contents ?? []).filter(doc=>doc.flags?.[MODULE_ID]?.[VAULT_MARKER]===true);
 /** What is wrong, worked out fresh from the world. Read-only; never changes anything. */
 function diagnose(){
  gmOnly(game.user);
  if(initialized)return {problem:'none',recoverable:false,candidates:[],canLookAgain:false,canPick:false,canStartNew:false};
  const matches=vaultJournals();
  const pointer=String(settings.get(MODULE_ID,VAULT_POINTER)||'');
  const candidates=matches.map((doc,i)=>({token:doc.id,name:String(doc.name||'Private vault'),folder:doc.folder?.name?String(doc.folder.name):'',revision:Number(doc.flags?.[MODULE_ID]?.[VAULT_FLAG]?.state_revision??0),valid:doc.flags?.[MODULE_ID]?.[VAULT_FLAG]?.format===FORMAT,number:i+1}));
  let problem='unknown';
  if(!lastFailure)problem='none';
  else if(matches.length>1)problem='multiple';
  else if(pointer&&!game.journal?.get?.(pointer))problem='missing';
  else if(lastFailure==='vault-incompatible')problem='incompatible';
  const missing=problem==='missing';
  return {problem,recoverable:['missing','multiple','incompatible'].includes(problem),candidates,
   canLookAgain:problem!=='unknown'&&problem!=='none',
   // Picking is offered only when exactly one marked Journal exists; two or more stay blocked until the GM tidies them in Foundry.
   canPick:missing&&matches.length===1,
   // A new vault is offered only when the old pointer is dead and no marked Journal exists anywhere, so it can never create a second vault.
   canStartNew:missing&&matches.length===0};
 }
 /** Look again: retry normally (the Journal may have been restored); else, if exactly one vault Journal exists, point to it. */
 async function rescan(){
  gmOnly(game.user);
  if(initialized)return {migrated:false};
  try{return await initialize();}
  catch(error){
   if(error?.code!=='vault-missing')throw error;
   const matches=vaultJournals();
   if(matches.length===1)return relinkToVault(matches[0].id);
   throw vaultError('No private vault Journal was found.','vault-missing');
  }
 }
 /** Point Headquarters at one chosen vault Journal. Refuses unless it carries the marker, is the only one, is readable and has no player rights. */
 async function relinkToVault(journalId){
  gmOnly(game.user);
  if(initialized)throw Error('The private vault is already loaded.');
  const matches=vaultJournals();
  if(matches.length>1)throw vaultError('More than one private vault Journal exists. Tidy them in the Journals sidebar first; nothing is chosen automatically.','vault-multiple');
  const target=matches.find(doc=>doc.id===journalId);
  if(!target)throw vaultError('That Journal is not a Headquarters private vault.','vault-missing');
  requirePrivateVaultPermissions(target,game.users);
  const full=target.getFlag?.(MODULE_ID,VAULT_FLAG)??target.flags?.[MODULE_ID]?.[VAULT_FLAG];
  if(!full||full.format!==FORMAT)throw vaultError('That vault Journal is empty or in a format this version cannot read, so it was not used.','vault-incompatible');
  return adopt(target,full,target.id);
 }
 /**
  * Start a new private vault from the public copy. Needs the typed phrase. Private-only details (hireling roster and notes,
  * private history) are NOT recoverable this way. Creates one restricted Journal (default 0), points to it, bumps state_revision.
  * Deletes nothing.
  */
 async function startNewVault({confirmation}={}){
  gmOnly(game.user);
  if(initialized)throw Error('The private vault is already loaded.');
  if(String(confirmation??'').trim().toUpperCase()!==NEW_VAULT_PHRASE)throw Error(`Type ${NEW_VAULT_PHRASE} to confirm. Nothing was changed.`);
  const d=diagnose();
  if(!d.canStartNew)throw vaultError('A new vault can only be started when the old one is gone and no other vault Journal exists. Nothing was changed.',lastFailure||'vault-missing');
  const pub=settings.get(MODULE_ID,'state');
  if(!pub||pub.format!==FORMAT)throw Error('The public Guildhall copy is missing or unreadable, so a new vault cannot be built. Nothing was changed.');
  const next=projectPublicState(pub);
  next.state_revision=(Number.isFinite(pub.state_revision)?pub.state_revision:0)+1;
  const created=await JournalEntryClass.create({name:VAULT_TITLE,ownership:{default:0},flags:{[MODULE_ID]:{[VAULT_MARKER]:true,[VAULT_FLAG]:clone(next)}}},{renderSheet:false});
  if(!created?.id)throw Error('Could not create the new private vault. Nothing was changed.');
  requirePrivateVaultPermissions(created,game.users);
  document=created;authoritative=clone(next);
  // Pointer first, so a failed public write is repaired on the next GM login.
  await settings.set(MODULE_ID,VAULT_POINTER,created.id);
  initialized=true;lastFailure=null;
  await settings.set(MODULE_ID,'state',projectPublicState(next));
  return {migrated:false,created:true,state_revision:next.state_revision};
 }
 async function initialize(){
  try{return await initializeInner();}
  catch(error){lastFailure=error?.code??'other';throw error;}
 }
 async function initializeInner(){
  gmOnly(game.user);
  if(initialized)return {migrated:false};
  let pointer=String(settings.get(MODULE_ID,VAULT_POINTER)||'');
  const docs=game.journal?.contents ?? [];
  const matches=docs.filter(doc=>doc.flags?.[MODULE_ID]?.[VAULT_MARKER]===true);
  if(matches.length>1)throw vaultError('Multiple Headquarters private vaults found; GM must reconcile before proceeding.','vault-multiple');
  let target=pointer?game.journal?.get?.(pointer):matches[0]??null;
  if(pointer&&!target)throw vaultError('Private Headquarters vault pointer exists but vault is inaccessible/missing; no legacy fallback.','vault-missing');
  if(!pointer&&matches.length===1){target=matches[0];pointer=target.id;}
  if(target){
   requirePrivateVaultPermissions(target,game.users);
   const full=target.getFlag?.(MODULE_ID,VAULT_FLAG)??target.flags?.[MODULE_ID]?.[VAULT_FLAG];
   if(!full||full.format!==FORMAT)throw vaultError('Headquarters private vault is empty or incompatible; refusing destructive recovery.','vault-incompatible');
   return adopt(target,full,pointer);
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
 return Object.freeze({read,save,initialize,isReady,publicRead:getPublic,diagnose,rescan,relinkToVault,startNewVault,lastFailure:()=>lastFailure});
}
