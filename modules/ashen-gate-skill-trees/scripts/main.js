import {
  SCHEMA,clone,asArray,cleanAccount,walletKey,normalizeTree,validateTree,validatePackage,allowedSourceForProvider,
  availability,publicAvailability,publicTree,totalSpent,grantPoints,purchase,changedPurchasedNodes,planTreeImport,
  resolveTree,perkCost,refund,resetUnlocks,grantTag,isGrantFor,missingGrants,savedDataReport,dependentsBlockingRefund,
  professionStatus,overrideGrant,reconcile,withHistory,reviewCandidates,removalOrder,planLedgerImport,CINDER_MAX_POINTS,
  sharedWalletKey,walletGroups,groupName,memberName,accessText,cleanAccess,PROFESSION_MAX_LEVEL
} from './engine.mjs';
import {graphEdges,edgeLine} from './graph.mjs';
import {NODE_SIZES,nodeSizeOf,tierBands,backgroundView,appearanceFromForm,BG_FITS,MAX_TIERS} from './appearance.mjs';
import {tooltipModel,initialSidebar,toggledSidebar,isNarrow,nudged,snapPos,prereqGroups,labelOf,NODE_STATUS_LABELS,NODE_VISIBILITY_LABELS,NODE_DISPLAY_LABELS} from './layout.mjs';
import {PLAYER_ACCESS_CONTRACT,PLAYER_ACCESS_SETTING,playerAccessAllowed,assertPlayerAccess,accessState,setPlayerAccess} from './player-access.mjs';
import {lookupWorldDefinition} from './definition-lookup.mjs';
import {launcherRoot,mountLauncher} from './ag-launchers.mjs';
import {confirmDialog,confirmDanger,guardDirty,infoDialog} from './ag-dialogs.mjs';
import {windowSize,uiState,subTabs,tabPanelAttrs,bindTablist,bindFolds,linkButton} from './ag-html.mjs';
import {readDrop,resolveItemDrop} from './ag-item-drop.mjs';
import {isLevelBackup,assertNotLevelBackup,LEVEL_BACKUP_REFUSAL} from './level-backup.mjs';
import {treePicker,libraryGroups,libraryItems,walletLine,professionGroups} from './groups.mjs';
import {QA_FIXTURE,QA_TREES,qaTreeLayouts,qaSourceItems,qaActorData,isQaDocument,qaCleanupBlockers} from './qa-fixtures.mjs';

/** Skill Trees: perk-assigned nodes, private GM definitions, GM-side unlocks that add the perk Item to the sheet. */
const MODULE='ashen-gate-skill-trees';
const VERSION='0.21.2';
const SOCKET=`module.${MODULE}`;
const {ApplicationV2,HandlebarsApplicationMixin,DialogV2}=foundry.applications.api;
const STORAGE_FLAG='privateStore';
const LEDGER_ID='ashen-gate-profession-ledger';
const LEDGER_CONTRACT='ag-ledger-progression/1';
const SAFE_SETTING='publicTreesV2';
// 0.17.0: generic partner contract. Skill Trees knows no partner by name: it reports progress changes and lets a partner veto one.
const ACCOUNTS_CONTRACT='ag-tree-accounts/1';
const PROGRESS_HOOK='ashenGateSkillTrees.progressChanged';
const CHECK_HOOK='ashenGateSkillTrees.checkProgress';
/** Settings and records written by 0.15.0/0.16.0 (Strain and Cinders, now Ashen Gate | Cinders), kept readable for a one-time adopt. */
const LEGACY_SETTINGS=['strainConfig','maxCindersPerActor','initialCinderPoints'];
let instance=null;
const openTreeWindows=new Set();
const canOpenTrees=()=>playerAccessAllowed(game,MODULE);
const checkTreePlayerAccess=()=>assertPlayerAccess(game,MODULE);
const playerAccessEnabled=()=>game.settings.get(MODULE,PLAYER_ACCESS_SETTING)!==false;
function syncTreePlayerAccess(enabled){
  refreshEmbeds();
  if(game.user?.isGM && instance?.rendered)instance.render();
  if(!game.user?.isGM && enabled!==true){
    const windows=new Set([...openTreeWindows,...(instance?[instance]:[])]);
    for(const window of windows)if(window?.rendered)Promise.resolve(window.close?.({animate:false}))
      .catch(err=>console.error(`[${MODULE}] Could not close hidden player window`,err));
  }
  const app=globalThis.ui?.actors;
  if(app?.element)addDirectoryLauncher(app,app.element);
  if(!game.user?.isGM && enabled!==true)globalThis.document?.querySelectorAll?.('[data-ag-launcher="ashen-gate-skill-trees"]')?.forEach(button=>button.remove());
}
const escape=x=>foundry.utils.escapeHTML(String(x??''));
const notify=(s,error=false)=>error?ui.notifications.error(s):ui.notifications.info(s);
const copy=x=>structuredClone(x);
const safeFlag=(document,key)=>document?.flags?.[MODULE]?.[key];
const sourceFlag=document=>document?.flags?.['ashen-gate-manager']?.source??null;
const hasOwner=actor=>Boolean(actor&&(game.user.isGM||actor.isOwner));
const actorChoices=()=> (game.actors?.contents??[]).filter(a=>a.type==='character' && hasOwner(a) && !isLevelBackup(a))
  .sort((a,b)=>a.name.localeCompare(b.name));
const gmPrivate=()=>game.user.isGM ? game.journal?.contents?.find(d=>safeFlag(d,STORAGE_FLAG)===true)??null:null;
const readPrivate=()=>{
  if(!game.user.isGM)return [];
  const payload=safeFlag(gmPrivate(),'payload');
  return asArray(payload?.trees).map(normalizeTree);
};
const readPublic=()=>asArray(game.settings.get(MODULE,SAFE_SETTING)?.trees);
const readSelectedTrees=preview=>game.user.isGM&&!preview?readPrivate():readPublic();
const readProgress=(actor,tree)=>cleanAccount(safeFlag(actor,'progressV2')?.[walletKey(tree)]);
const allProgressFor=(tree)=>(game.actors?.contents??[]).map(a=>readProgress(a,tree));
/** The Profession Ledger's read contract, or null when it is missing, off, or a different version (feature-detected, never required). */
const ledgerProgression=()=>{const m=game.modules?.get?.(LEDGER_ID);const p=m?.active?m.api?.progression:null;return p?.contract===LEDGER_CONTRACT&&typeof p.level==='function'?p:null;};
/** Ledger level for a profession tree: a number (0 = not in this profession), null when the Ledger is unavailable, undefined for other trees. */
function professionLevel(actor,tree){
  if(tree?.provider?.kind!=='profession')return undefined;
  const p=ledgerProgression();if(!p||!actor)return null;
  try{return p.level(actor,tree.sourceRef)?.level??0;}catch(error){console.warn(`[${MODULE}] Ledger level unavailable`,error);return null;}
}
/**
 * 0.21.0 shared wallet: the character's other trees of the same profession, each with its account ([{tree, account}]).
 * GM: private trees resolved from world perks (tier thresholds); players: the published projection. [] for other trees.
 */
function walletSiblings(actor,tree,{trees=null,resolve=null}={}){
  if(!actor||tree?.provider?.kind!=='profession')return [];
  const pool=trees??readSelectedTrees(false),res=resolve??(game.user.isGM&&!trees);
  return pool.filter(x=>x.id!==tree.id&&x.provider?.kind==='profession'&&x.sourceRef===tree.sourceRef)
    .map(x=>({tree:res?resolved(x):x,account:readProgress(actor,x)}));
}
/** GM-side siblings from the private trees (authoritative checks). */
const privateSiblings=(actor,tree)=>walletSiblings(actor,tree,{trees:readPrivate(),resolve:true});
/** Trees (as this user may see them) that belong to one profession, sorted by name. */
const professionTrees=(sourceRef,trees=readSelectedTrees(false))=>trees.filter(t=>t.provider?.kind==='profession'&&t.sourceRef===sourceRef)
  .sort((a,b)=>String(a.name).localeCompare(String(b.name)));
/** dnd5e name for a proficiency key ('prf' → Performance, 'calligrapher' → Calligrapher's Supplies); other text is shown as written. */
function proficiencyLabel(kind,key){
  try{
    if(kind==='skill'){const s=globalThis.CONFIG?.DND5E?.skills?.[key];if(s?.label)return String(s.label);}
    if(kind==='tool'){const label=globalThis.dnd5e?.documents?.Trait?.keyLabel?.(key,{trait:'tool'});if(label&&label!==key)return String(label);
      const t=globalThis.CONFIG?.DND5E?.toolTypes?.[key]??globalThis.CONFIG?.DND5E?.tools?.[key]?.label;if(typeof t==='string')return t;}
  }catch(error){console.warn(`[${MODULE}] Proficiency label unavailable`,error);}
  return String(key);
}
/** Clean the Ledger's {ok, matched} answer; null when it is not one. */
const accessAnswer=r=>r&&typeof r==='object'&&typeof r.ok==='boolean'?{ok:r.ok,matched:asArray(r.matched).filter(x=>typeof x==='string')}:null;
/** The Ledger's proficiency check, or null when the Ledger (or meetsProficiency) is absent. */
function ledgerMeetsProficiency(){const m=game.modules?.get?.(LEDGER_ID);const fn=m?.active?m.api?.meetsProficiency:null;return typeof fn==='function'?fn:null;}
/**
 * 0.21.0 access gate: the Ledger's answer for a tree with an access object. null when there is no gate or nobody can check,
 * so nothing is blocked. May be a Promise when the Ledger answers asynchronously (use accessCheck to wait for it).
 */
function accessCheckRaw(actor,tree){
  const access=cleanAccess(tree?.access),fn=access&&actor?ledgerMeetsProficiency():null;if(!fn)return null;
  try{return fn(actor.id,copy(access));}catch(error){console.warn(`[${MODULE}] Ledger proficiency check failed`,error);return null;}
}
async function accessCheck(actor,tree){try{return accessAnswer(await accessCheckRaw(actor,tree));}catch(error){console.warn(`[${MODULE}] Ledger proficiency check failed`,error);return null;}}
/** Same, for synchronous views (embed): a Promise answer counts as unknown there (the unlock itself still waits for it). */
function accessCheckNow(actor,tree){const r=accessCheckRaw(actor,tree);return typeof r?.then==='function'?null:accessAnswer(r);}
/** "Needs … proficiency" for a tree's gate (with its note), or '' when the tree has none or the Ledger cannot check it. */
const accessLine=tree=>cleanAccess(tree?.access)&&ledgerMeetsProficiency()?[accessText(tree.access,proficiencyLabel),cleanAccess(tree.access).note].filter(Boolean).join('. '):'';
/**
 * Shared profession wallet for one character (0.21.0): {sourceRef, level, earned, spent, available, overSpent, overAllocated, trees:[{id,name,spent}]}.
 * earned/available are null when the Ledger is unavailable; available never goes below 0 (overSpent says by how much). Trees: those this user may see.
 */
function walletFor(actor,sourceRef){
  const trees=professionTrees(sourceRef);if(!trees.length)return null;
  const gm=game.user.isGM,first=gm?resolved(trees[0]):trees[0];
  const st=professionStatus(first,readProgress(actor,trees[0]),professionLevel(actor,trees[0]),walletSiblings(actor,trees[0]));
  return {sourceRef,level:st.level,earned:st.ledger?st.earned:null,spent:st.spent,available:st.ledger?Math.max(0,st.available):null,
    overSpent:st.overSpent,overAllocated:st.overAllocated,trees:st.trees??[{id:first.id,name:first.name,spent:st.spent}]};
}
const historyEntry=(kind,extra={})=>({id:foundry.utils.randomID(12),kind,at:Date.now(),by:game.user?.id??'',byName:game.user?.name??'',...extra});
const download=(filename,data)=>{
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
};
// Plain-text message (one paragraph per line); the action button repeats the verb, Cancel on the left.
const confirm=(message,{title='Confirm',yes='Confirm',danger=false}={})=>confirmDialog(message,{title,yes,danger});
const formValues=v=>v&&typeof v.entries==='function'?Object.fromEntries(v.entries()):v??{};
/**
 * Form dialog with custom kit markup: Cancel on the left, the labelled action on the right (0.20.0; DialogV2.input had no Cancel).
 * Resolves the form values on the action, or null on Cancel or close. render(event, dialog) may wire the open dialog.
 */
const input=async(title,content,label='Save',{render}={})=>{
  const result=await foundry.applications.api.DialogV2.wait({classes:['ag-app','ag-dialog'],window:{title},content,modal:true,rejectClose:false,...(render?{render}:{}), // ag-lint-allow: custom form dialog with kit classes
    buttons:[{action:'cancel',label:'Cancel',callback:()=>null},{action:'ok',label,default:true,callback:(event,button)=>formValues(new FormData(button?.form??event?.currentTarget?.form))}]});
  return result&&typeof result==='object'?result:null;
};
const newKey=(prefix='LOCAL-NODE')=>`${prefix}-${foundry.utils.randomID(14)}`;
const checked=v=>v===true||v==='on'||v==='true';
// Perk text for the node: tags removed, and Manager [[AGREF:ID|label]] / Foundry @UUID[...]{label} links reduced to their label.
const plainText=html=>{
  const raw=String(html??'').replace(/\[\[AGREF:[^|\]]*\|([^\]]*)\]\]/g,'$1').replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g,'$1');
  if(typeof DOMParser==='function')return (new DOMParser().parseFromString(raw,'text/html').body?.textContent??'').replace(/\s+/g,' ').trim();
  return raw.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
};
/** The world perk for a permanent id (Manager's binding). The node's stored UUID is only a local hint. */
const perkDoc=id=>{const hit=lookupWorldDefinition(game,id,{});return hit.status==='ok'&&hit.document?.documentName==='Item'?hit.document:null;};
const perkInfo=id=>{const doc=perkDoc(id);if(!doc)return null;
  return {name:doc.name,description:plainText(doc.system?.description?.value),img:doc.img??null,cost:perkCost(sourceFlag(doc)?.definition),uuid:doc.uuid,tier:sourceFlag(doc)?.definition?.tier??null};};
const resolved=t=>resolveTree(t,id=>perkInfo(id));
const safePublicSource=n=>{
  if(!n.perkId)return true; // Older custom nodes have no perk.
  const hit=lookupWorldDefinition(game,n.perkId,{publicForAll:true,approvedOnly:true});
  const doc=hit.document,source=hit.source;
  return Boolean(doc?.documentName==='Item'&&doc?.type==='feat'&&source?.entityType===
    (n.perkId.startsWith('PERK-')?'ProfessionPerk':'Power') && !/placeholder/i.test(doc.name));
};
const project=t=>{const r=resolved(t);return publicTree({...r,nodes:r.nodes.map(n=>safePublicSource(n)?n:{...n,visibility:'gm',display:'hidden'})});};
const publishedPayload=trees=>({schema:SCHEMA,revision:Date.now(),trees:trees.map(project).filter(Boolean)});
async function initializeStore(){
  if(!game.user.isGM)throw Error('GM only');
  if(gmPrivate())return gmPrivate();
  if(!await confirm('Create a GM-only Journal for private tree definitions?\nThe public player view receives separately sanitized snapshots. No old v0.1 data or Actor progress will be changed.',{title:'Create the private tree journal?',yes:'Create journal'}))return null;
  return createStore();
}
/** Creates the module's own GM-only definitions Journal (no player access). Also used by the Manager import. */
async function createStore(){
  const d=await JournalEntry.create({name:'[AG] Skill Trees — GM Definitions',
    ownership:{default:CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE},
    flags:{[MODULE]:{[STORAGE_FLAG]:true,payload:{schema:SCHEMA,trees:[]}}}});
  if(!d)throw Error('Unable to create the private definition Journal');
  return d;
}
async function publishPublic(){
  if(!game.user.isGM)throw Error('GM only');
  await game.settings.set(MODULE,SAFE_SETTING,publishedPayload(readPrivate()));
  return readPublic().length;
}
async function saveTrees(trees,{previous=null,checkPurchased=true}={}){
  if(!game.user.isGM)throw Error('GM only');
  const store=gmPrivate();if(!store)throw Error('Initialize the private GM store first');
  const normalized=trees.map(normalizeTree);
  const check=validatePackage({schema:SCHEMA,trees:normalized});
  if(check.errors.length)throw Error(check.errors.slice(0,5).join('; '));
  if(checkPurchased){
    const old=previous??readPrivate();
    for(const t of normalized){const oldTree=old.find(x=>x.id===t.id);if(!oldTree)continue;
      const danger=changedPurchasedNodes(oldTree,t,allProgressFor(oldTree));
      if(danger.length)throw Error(`Existing Actor purchases protected: ${danger.slice(0,3).join('; ')}`);
    }
    for(const t of old){if(normalized.some(n=>n.id===t.id))continue;
      if(allProgressFor(t).some(a=>a.awarded||a.unlocks.length))throw Error(`${t.name||'This tree'} has progression: delete blocked`);
    }
    for(const t of normalized){if(t.provider.kind!=='generic_points'||t.provider.maxPoints==null)continue;
      if(allProgressFor(t).some(a=>a.awarded>t.provider.maxPoints))throw Error(`${t.name}: point limit cannot be reduced below previously awarded points`);
    }
  }
  await store.setFlag(MODULE,'payload',{schema:SCHEMA,trees:normalized});
  try{await game.settings.set(MODULE,SAFE_SETTING,publishedPayload(normalized));}
  catch(error){console.error(`[${MODULE}] Public projection update failed`,error);throw Error('Private save completed, but public projection did not update. Retry Publish before players use trees.');}
  return check.warnings;
}
async function persistAccount(actor,tree,next){
  if(!game.user.isGM)throw Error('GM only: Actor progression writes');
  if(!actor)throw Error('No Actor selected');
  assertNotLevelBackup(actor);
  const records=copy(safeFlag(actor,'progressV2')??{});
  records[walletKey(tree)]=cleanAccount(next);
  await actor.setFlag(MODULE,'progressV2',records);
  // 0.17.0: partner modules (e.g. Ashen Gate | Cinders) keep their own records in step through this hook.
  Hooks.callAll?.(PROGRESS_HOOK,{actorId:actor.id,treeId:tree.id,sourceRef:tree.sourceRef??null,kind:tree.provider?.kind??null,wallet:walletKey(tree),sharedWallet:sharedWalletKey(tree),account:copy(records[walletKey(tree)])});
}
const grantOf=item=>item?.flags?.[MODULE]?.grant??null;
const grantedItems=(actor,tree,nodeId=null)=>Array.from(actor?.items??[]).filter(i=>isGrantFor(grantOf(i),tree,nodeId));
/** Embedded copy of the world perk on the character, tagged with the perk id. Reuses an existing tagged copy. */
async function givePerk(actor,tree,node){
  const existing=grantedItems(actor,tree,node.id);
  if(existing.length)return {item:existing[0],created:false};
  const doc=perkDoc(node.perkId);
  if(!doc)throw Error(`${node.name||'This perk'} is not in this world. Import it through General Manager first.`);
  const data=doc.toObject();
  for(const key of ['_id','folder','sort','ownership','_stats'])delete data[key];
  data.flags={...(data.flags??{}),[MODULE]:{grant:{...grantTag(tree,node),perkUuid:doc.uuid}}};
  const [item]=await actor.createEmbeddedDocuments('Item',[data]);
  if(!item)throw Error(`Could not add ${doc.name} to ${actor.name}`);
  return {item,created:true};
}
// One unlock/refund at a time per character, so a double click or two clients cannot spend twice.
const actorLocks=new Map();
function withActorLock(actorId,fn){
  assertNotLevelBackup(game.actors?.get?.(actorId)); // every unlock/refund/override/reset/undo/setAccount/perk grant passes here first
  const run=(actorLocks.get(actorId)??Promise.resolve()).then(fn);
  const tail=run.catch(()=>{});actorLocks.set(actorId,tail);
  tail.then(()=>{if(actorLocks.get(actorId)===tail)actorLocks.delete(actorId);});
  return run;
}
/** Authoritative unlock (GM client): checks the private tree, adds the perk Item, then records the unlock. */
async function unlockNode(actor,treeId,nodeId,{forUser=null}={}){
  if(!game.user.isGM)throw Error('GM only: unlocks run on the GM client');
  if(!actor)throw Error('No character selected');
  return withActorLock(actor.id,async()=>{
    const stored=readPrivate().find(t=>t.id===treeId);if(!stored)throw Error('Unknown tree');
    const t=resolved(stored),n=t.nodes.find(x=>x.id===nodeId);if(!n)throw Error('Unknown node');
    const account=readProgress(actor,stored),level=professionLevel(actor,stored),siblings=privateSiblings(actor,stored);
    checkProgress(actor,stored,'unlock');
    // 0.21.0: a tree's proficiency gate applies to players only (the GM is never blocked); no Ledger answer, no gate.
    const access=forUser?await accessCheck(actor,stored):null;
    if(forUser){ // A player may unlock only what the player view shows them.
      const pub=project(stored),pn=pub?.nodes.find(x=>x.id===nodeId);
      if(!pub||!pn||pn.silhouette)throw Error('That node is not released to players');
      const ok=publicAvailability(pub,account,nodeId,{level,siblings,access,accessLabel:proficiencyLabel});if(!ok.ok)throw Error(ok.reason);
    }
    let next=purchase(t,account,nodeId,{level,siblings,access,accessLabel:proficiencyLabel});
    if(stored.provider.kind==='profession')next=withHistory(next,historyEntry('allocate',{nodeId,perkId:n.perkId,level,
      ...(forUser?{by:forUser.id,byName:forUser.name??''}:{})}));
    if(n.perkId&&!safePublicSource(n))throw Error(`${n.name||perkDoc(n.perkId)?.name||'This perk'} is not an approved, player-visible perk yet`);
    const grant=n.perkId?await givePerk(actor,stored,n):null;
    try{await persistAccount(actor,stored,next);}
    catch(error){
      if(grant?.created)await grant.item.delete().catch(e=>console.error(`[${MODULE}] Could not undo perk Item`,e));
      throw error;
    }
    return {node:n,item:grant?.item??null};
  });
}
/** GM refund: gives the points back, then removes the granted perk Item from the sheet. */
async function refundNode(actor,treeId,nodeId,{reason=''}={}){
  if(!game.user.isGM)throw Error('GM only');
  if(!actor)throw Error('No character selected');
  return withActorLock(actor.id,async()=>{
    const stored=readPrivate().find(t=>t.id===treeId);if(!stored)throw Error('Unknown tree');
    let next=refund(resolved(stored),readProgress(actor,stored),nodeId);
    if(stored.provider.kind==='profession'){
      // The removed Item's data is kept in the history so a later undo can restore it exactly.
      const item=grantedItems(actor,stored,nodeId)[0],node=stored.nodes.find(x=>x.id===nodeId);
      next=withHistory(next,historyEntry('remove',{nodeId,perkId:node?.perkId??null,level:professionLevel(actor,stored),reason:String(reason??'').slice(0,200),
        ...(item?.toObject?{itemSnapshot:item.toObject()}:{})}));
    }
    await persistAccount(actor,stored,next);
    return removeGrants(actor,stored,nodeId);
  });
}
/** GM override: allocate a node regardless of points, level or prerequisites, with a reason (kept at the current level). */
async function overrideNode(actor,treeId,nodeId,{reason=''}={}){
  if(!game.user.isGM)throw Error('GM only');
  if(!actor)throw Error('No character selected');
  return withActorLock(actor.id,async()=>{
    const stored=readPrivate().find(t=>t.id===treeId);if(!stored)throw Error('Unknown tree');
    const t=resolved(stored),n=t.nodes.find(x=>x.id===nodeId);if(!n)throw Error('Unknown node');
    const level=professionLevel(actor,stored);
    const {account,overridden}=overrideGrant(t,readProgress(actor,stored),nodeId,{level,reason,by:game.user.id,at:Date.now(),siblings:privateSiblings(actor,stored)});
    if(n.perkId&&!safePublicSource(n))throw Error(`${n.name||perkDoc(n.perkId)?.name||'This perk'} is not an approved, player-visible perk yet`);
    const next=withHistory(account,historyEntry('override',{nodeId,perkId:n.perkId,level,reason:String(reason).trim().slice(0,200),overridden}));
    const grant=n.perkId?await givePerk(actor,stored,n):null;
    try{await persistAccount(actor,stored,next);}
    catch(error){if(grant?.created)await grant.item.delete().catch(e=>console.error(`[${MODULE}] Could not undo perk Item`,e));throw error;}
    return {node:n,item:grant?.item??null,overridden};
  });
}
/** GM keeps an allocated node the character's level no longer covers (it still uses its point). */
async function keepNode(actor,treeId,nodeId,{reason=''}={}){
  if(!game.user.isGM)throw Error('GM only');
  if(!actor)throw Error('No character selected');
  return withActorLock(actor.id,async()=>{
    const stored=readPrivate().find(t=>t.id===treeId);if(!stored)throw Error('Unknown tree');
    if(stored.provider.kind!=='profession')throw Error('Only profession trees use levels');
    const acc=readProgress(actor,stored);if(!acc.unlocks.includes(nodeId))throw Error('That node is not allocated');
    const level=professionLevel(actor,stored);if(!Number.isSafeInteger(level))throw Error('Profession Ledger is not active');
    acc.kept[nodeId]={level,at:Date.now(),by:game.user.id,reason:String(reason??'').slice(0,200)};acc.revision++;
    const node=stored.nodes.find(x=>x.id===nodeId);
    await persistAccount(actor,stored,withHistory(acc,historyEntry('keep',{nodeId,perkId:node?.perkId??null,level,reason:String(reason??'').slice(0,200)})));
    return {kept:nodeId};
  });
}
/**
 * GM resolve of an over-allocated character: remove some nodes (points return, Items off the sheet, kept in history for undo)
 * and keep the rest at the current level. One write; refuses when a removal would strand a node that stays.
 */
async function resolveNodes(actor,treeId,{remove=[],keep=[],reason=''}={}){
  if(!game.user.isGM)throw Error('GM only');
  if(!actor)throw Error('No character selected');
  return withActorLock(actor.id,async()=>{
    const stored=readPrivate().find(t=>t.id===treeId);if(!stored)throw Error('Unknown tree');
    if(stored.provider.kind!=='profession')throw Error('Only profession trees use levels');
    const t=resolved(stored),level=professionLevel(actor,stored);
    if(!Number.isSafeInteger(level))throw Error('Profession Ledger is not active');
    const before=readProgress(actor,stored),why=String(reason??'').slice(0,200);
    const {order,blocked,account}=removalOrder(t,before,remove);
    if(blocked.length)throw Error(`Cannot remove ${blocked.map(b=>`${t.nodes.find(n=>n.id===b.nodeId)?.name??b.nodeId} (needed by ${b.by.join(', ')})`).join('; ')}. Remove those too, or keep it.`);
    let next=account;
    for(const nodeId of order){
      const item=grantedItems(actor,stored,nodeId)[0],node=stored.nodes.find(x=>x.id===nodeId);
      next=withHistory(next,historyEntry('remove',{nodeId,perkId:node?.perkId??null,level,reason:why,...(item?.toObject?{itemSnapshot:item.toObject()}:{})}));
    }
    for(const nodeId of keep.filter(id=>next.unlocks.includes(id))){
      next.kept[nodeId]={level,at:Date.now(),by:game.user.id,reason:why};
      next=withHistory(next,historyEntry('keep',{nodeId,perkId:stored.nodes.find(x=>x.id===nodeId)?.perkId??null,level,reason:why}));
    }
    next.revision++;
    await persistAccount(actor,stored,next);
    const removed=[],failed=[];
    for(const nodeId of order){try{removed.push(...(await removeGrants(actor,stored,nodeId)).removed);}catch(error){failed.push(error.message);}}
    if(failed.length)throw Error(failed.join(' '));
    return {removed,kept:keep.filter(id=>next.unlocks.includes(id)),status:professionStatus(t,next,level,privateSiblings(actor,stored))};
  });
}
/**
 * GM undo of one history entry (pick, GM grant, removal or keep). Restores the exact removed Item when its data was kept.
 * Refuses when the tree changed underneath (node gone or another perk) or the entry was already undone.
 */
async function undoHistory(actor,treeId,entryId){
  if(!game.user.isGM)throw Error('GM only');
  if(!actor)throw Error('No character selected');
  return withActorLock(actor.id,async()=>{
    const stored=readPrivate().find(t=>t.id===treeId);if(!stored)throw Error('Unknown tree');
    const t=resolved(stored);let acc=readProgress(actor,stored);
    const entry=acc.history.find(h=>h.id===entryId);if(!entry)throw Error('That change is no longer in the history');
    if(entry.undone)throw Error('That change was already undone');
    if(!['allocate','override','remove','keep'].includes(entry.kind))throw Error('That change cannot be undone here');
    const node=t.nodes.find(n=>n.id===entry.nodeId);
    if(!node||(node.perkId??null)!==(entry.perkId??null))throw Error('The tree layout changed since then (node removed or given another perk); undo it by hand');
    const level=professionLevel(actor,stored);let restored=null,removedNames=[];
    if(entry.kind==='keep'){
      if(!acc.kept[node.id])throw Error('That perk is no longer kept');
      delete acc.kept[node.id];
    }else if(entry.kind==='remove'){
      if(acc.unlocks.includes(node.id))throw Error(`${node.name} is already allocated again`);
      acc.unlocks.push(node.id);
      // Restored as the GM had it; if the level no longer covers it, the review flag says so.
    }else{
      if(!acc.unlocks.includes(node.id))throw Error(`${node.name} is not allocated any more`);
      const blockers=dependentsBlockingRefund(t,acc,node.id);
      if(blockers.length)throw Error(`Undo ${blockers.map(n=>n.name||'an unnamed perk').join(', ')} first; it depends on this perk`);
      acc=refund(t,acc,node.id);
    }
    acc.history=acc.history.map(h=>h.id===entryId?{...h,undone:true}:h);acc.revision++;
    acc=withHistory(acc,historyEntry('undo',{nodeId:node.id,perkId:node.perkId??null,level,undoes:entryId,undoneKind:entry.kind}));
    if(entry.kind==='remove'&&node.perkId&&!grantedItems(actor,stored,node.id).length){
      const snap=entry.itemSnapshot;
      if(snap){
        const data=structuredClone(snap);delete data._id;
        data.flags={...(data.flags??{}),[MODULE]:{...(data.flags?.[MODULE]??{}),grant:{...grantTag(stored,node),perkUuid:data.flags?.[MODULE]?.grant?.perkUuid??null}}};
        [restored]=await actor.createEmbeddedDocuments('Item',[data]);
      }else restored=(await givePerk(actor,stored,node)).item;
    }
    try{await persistAccount(actor,stored,acc);}
    catch(error){if(restored)await restored.delete().catch(e=>console.error(`[${MODULE}] Could not undo restored Item`,e));throw error;}
    if(['allocate','override'].includes(entry.kind))removedNames=(await removeGrants(actor,stored,node.id)).removed;
    return {undone:entry.kind,node:node.name,restored:restored?.name??null,removed:removedNames};
  });
}
/** Legacy Ledger perk choices for one character and profession tree, via the Ledger's public API (empty when unavailable). */
function legacyLedgerChoices(actor,tree){
  const m=game.modules?.get?.(LEDGER_ID);const fn=m?.active?m.api?.inspectProfessionPerkChoices:null;
  if(typeof fn!=='function')return [];
  try{return asArray(fn(actor,tree.sourceRef)?.selectedPerkIds);}catch(error){console.warn(`[${MODULE}] Ledger perk choices unavailable`,error);return [];}
}
/**
 * Import legacy Profession Ledger perk choices into profession trees. Dry run unless apply. Re-runnable:
 * already-allocated perks are skipped; nothing in the Ledger is changed or cleared; a perk Item already on the sheet is linked, not copied.
 */
async function importLedgerChoices({apply=false}={}){
  if(!game.user.isGM)throw Error('GM only');
  const rows=[];
  for(const stored of readPrivate().filter(t=>t.provider.kind==='profession')){
    const t=resolved(stored);
    for(const actor of game.actors?.contents??[]){
      const perkIds=legacyLedgerChoices(actor,stored);if(!perkIds.length)continue;
      const sheet=Array.from(actor.items??[]).filter(i=>!grantOf(i)&&/^PERK-/.test(sourceFlag(i)?.sourceId??'')).map(i=>sourceFlag(i).sourceId);
      for(const r of planLedgerImport(t,readProgress(actor,stored),perkIds,sheet))rows.push({...r,actorId:actor.id,actorName:actor.name,treeId:t.id,treeName:t.name});
    }
  }
  if(!apply)return {rows,applied:[],failed:[]};
  const applied=[],failed=[];
  for(const r of rows.filter(x=>x.action==='add'||x.action==='adopt')){
    const actor=game.actors.get(r.actorId),stored=readPrivate().find(t=>t.id===r.treeId);
    try{await withActorLock(actor.id,async()=>{
      const acc=readProgress(actor,stored);if(acc.unlocks.includes(r.nodeId))return;
      const node=resolved(stored).nodes.find(n=>n.id===r.nodeId);
      let created=null;
      if(r.action==='adopt'){
        const item=Array.from(actor.items??[]).find(i=>!grantOf(i)&&sourceFlag(i)?.sourceId===r.perkId);
        if(item)await item.update({[`flags.${MODULE}.grant`]:{...grantTag(stored,node),perkUuid:perkDoc(node.perkId)?.uuid??null}});
        else created=(await givePerk(actor,stored,node)).item;
      }else if(node.perkId)created=(await givePerk(actor,stored,node)).item;
      acc.unlocks.push(r.nodeId);acc.revision++;
      try{await persistAccount(actor,stored,withHistory(acc,historyEntry('migrate',{nodeId:r.nodeId,perkId:r.perkId,level:professionLevel(actor,stored),reason:'Imported Ledger perk choice'})));}
      catch(error){if(created)await created.delete().catch(()=>{});throw error;}
    });applied.push(r);}
    catch(error){failed.push(`${r.actorName}: ${r.name}: ${error.message}`);}
  }
  return {rows,applied,failed};
}
/** What one character's profession tree looks like at a level (for the Ledger's lower-XP text). null when there is no such tree. */
function professionReport(actor,profId,{level}={}){
  if(!actor)return null;
  if(!game.user.isGM&&actor.testUserPermission?.(game.user,'OBSERVER')!==true)throw Error('Actor access denied');
  const stored=professionTrees(profId)[0];if(!stored)return null;
  const t=game.user.isGM?resolved(stored):stored;
  const st=professionStatus(t,readProgress(actor,stored),Number.isSafeInteger(level)?level:professionLevel(actor,stored),walletSiblings(actor,stored));
  // 0.21.0: spent and the over-allocation cover every tree of the profession; with several trees, trees lists them.
  return {treeId:t.id,treeName:t.name,level:st.level,earned:st.earned,spent:st.spent,nodesAboveLevel:[...st.aboveLevel,...asArray(st.otherAboveLevel)],overSpent:st.overSpent,overAllocated:st.overAllocated,
    ...(st.trees?{trees:st.trees}:{})};
}
/**
 * Points earned, spent and available on every tree the current user can see, for partner modules (Character Hub). Read-only.
 * Profession trees earn 1 point per Ledger level (earned/available null when the Ledger is unavailable); other trees earn GM-awarded points.
 */
function pointsSummary(actor){
  if(!actor)throw Error('No Actor given');
  checkTreePlayerAccess();
  if(!hasOwner(actor))throw Error('Actor access denied');
  return readSelectedTrees(false).map(t=>{
    const acc=readProgress(actor,t),spent=totalSpent(t,acc),kind=t.provider?.kind??'generic_points';
    if(kind==='profession'){
      const st=professionStatus(t,acc,professionLevel(actor,t),walletSiblings(actor,t));
      // 0.21.0: spent/available are the profession's shared wallet; with several trees the row also says so (count the wallet once).
      return {treeId:t.id,name:t.name,kind,level:st.level,earned:st.ledger?st.earned:null,spent:st.spent,available:st.ledger?Math.max(0,st.available):null,
        ...(st.trees?{sourceRef:t.sourceRef,wallet:sharedWalletKey(t),treeSpent:st.treeSpent,walletTrees:st.trees.map(x=>x.id)}:{})};
    }
    return {treeId:t.id,name:t.name,kind,level:null,earned:acc.awarded,spent,available:Math.max(0,acc.awarded-spent)};
  });
}
/** GM reconcile report: every character × profession tree with something to look at. Read-only. */
function professionReconcile(){
  if(!game.user.isGM)throw Error('GM only');
  const rows=[];
  for(const stored of readPrivate().filter(t=>t.provider.kind==='profession')){
    const t=resolved(stored);
    for(const actor of game.actors?.contents??[]){
      const acc=readProgress(actor,stored),level=professionLevel(actor,stored);
      if(!acc.unlocks.length&&!(level>0))continue;
      const r=reconcile(t,acc,{level,itemTags:Array.from(actor.items??[]).map(grantOf),siblings:privateSiblings(actor,stored)});
      rows.push({actorId:actor.id,actorName:actor.name,treeId:t.id,treeName:t.name,profId:t.sourceRef,level:r.level,earned:r.earned,spent:r.spent,
        available:r.available,overAllocated:r.overAllocated,issues:r.issues});
    }
  }
  return rows;
}
async function resetTreeFor(actor,treeId){
  if(!game.user.isGM)throw Error('GM only');
  if(!actor)throw Error('No character selected');
  return withActorLock(actor.id,async()=>{
    const stored=readPrivate().find(t=>t.id===treeId);if(!stored)throw Error('Unknown tree');
    const before=readProgress(actor,stored);
    let next=resetUnlocks(before);
    if(stored.provider.kind==='profession')next=withHistory(next,historyEntry('reset',{nodeIds:before.unlocks,level:professionLevel(actor,stored)}));
    await persistAccount(actor,stored,next);
    return removeGrants(actor,stored,null);
  });
}
async function removeGrants(actor,tree,nodeId){
  const items=grantedItems(actor,tree,nodeId),failed=[];
  for(const item of items){try{await item.delete();}catch(error){console.error(`[${MODULE}] Could not remove perk Item`,error);failed.push(item.name);}}
  if(failed.length)throw Error(`Points refunded, but ${failed.join(', ')} could not be removed from ${actor.name}. Delete it from the sheet by hand.`);
  return {removed:items.map(i=>i.name)};
}
/** Re-runnable: adds the perk Item for unlocks recorded without one (e.g. before 0.8.0). Never removes anything. */
async function giveMissingPerks(){
  if(!game.user.isGM)throw Error('GM only');
  const given=[],failed=[];
  for(const actor of game.actors?.contents??[])for(const stored of readPrivate()){
    const acc=readProgress(actor,stored);if(!acc.unlocks.length)continue;
    for(const n of missingGrants(stored,acc,Array.from(actor.items??[]).map(grantOf))){
      try{await withActorLock(actor.id,()=>givePerk(actor,stored,n));given.push(`${actor.name}: ${perkDoc(n.perkId)?.name??(n.name||'a perk')}`);}
      catch(error){failed.push(`${actor.name}: ${error.message}`);}
    }
  }
  return {given,failed};
}
function missingGrantCount(){
  let count=0;
  for(const actor of game.actors?.contents??[])for(const stored of readPrivate()){
    count+=missingGrants(stored,readProgress(actor,stored),Array.from(actor.items??[]).map(grantOf)).length;
  }
  return count;
}
/** Before points or an unlock: a partner module may refuse by setting check.blocked to a reason (hook ashenGateSkillTrees.checkProgress). */
function checkProgress(actor,tree,action){
  const check={actorId:actor?.id??null,actorName:actor?.name??'',treeId:tree.id,sourceRef:tree.sourceRef??null,kind:tree.provider?.kind??null,action,blocked:null};
  Hooks.callAll?.(CHECK_HOOK,check);
  if(check.blocked)throw Error(String(check.blocked));
}
/**
 * GM: replace one character's account on one tree (points, unlocks) and make the perk Items match: give missing ones, remove
 * Items for nodes that are no longer unlocked. For partner modules that own progression elsewhere; the partner does its own checks.
 */
async function setAccountFor(actor,treeId,account){
  if(!game.user.isGM)throw Error('GM only');
  if(!actor)throw Error('No character');
  return withActorLock(actor.id,async()=>{
    const stored=readPrivate().find(t=>t.id===treeId);if(!stored)throw Error('Unknown tree');
    const t=resolved(stored),next=cleanAccount(account),known=new Set(t.nodes.map(n=>n.id));
    const stray=next.unlocks.find(id=>!known.has(id));if(stray)throw Error(`Node ${stray} is not on ${t.name}`);
    const given=[];
    try{
      for(const n of t.nodes)if(n.perkId&&!n.perkMissing&&next.unlocks.includes(n.id)){const g=await givePerk(actor,stored,n);if(g.created)given.push(g);}
      await persistAccount(actor,stored,next);
    }catch(error){for(const g of given)await g.item.delete().catch(e=>console.error(`[${MODULE}] Could not undo perk Item`,e));throw error;}
    const removed=[],failed=[];
    for(const item of grantedItems(actor,stored).filter(i=>!next.unlocks.includes(grantOf(i)?.nodeId))){
      try{await item.delete();removed.push(item.name);}catch(error){failed.push(item.name);}
    }
    if(failed.length)throw Error(`Progress saved, but ${failed.join(', ')} could not be removed from ${actor.name}. Delete it from the sheet by hand.`);
    return {given:given.map(g=>g.item.name),removed};
  });
}
function accountsApi(){
  const gmOnly=()=>{if(!game.user.isGM)throw Error('GM only');};
  return {
    contract:ACCOUNTS_CONTRACT,progressHook:PROGRESS_HOOK,checkHook:CHECK_HOOK,
    /** GM: the private tree with this source id (e.g. a cinder_milestone tree's MUT-* id), resolved from world perks; null when none. */
    treeBySource:(sourceRef,{kind=null}={})=>{gmOnly();const t=readPrivate().find(x=>x.sourceRef===sourceRef&&(!kind||x.provider?.kind===kind));return t?copy(resolved(t)):null;},
    /** GM: one character's account on one tree. */
    account:(actor,treeId)=>{gmOnly();const t=readPrivate().find(x=>x.id===treeId);if(!t)throw Error('Unknown tree');return readProgress(actor,t);},
    setAccount:(actor,treeId,account)=>setAccountFor(actor,treeId,account),
    /** Perk Items a tree gave this character: [{itemId, perkId, treeId, nodeId, wallet}]. GM or the Actor's owner. */
    grants:actor=>{if(!actor)throw Error('No Actor');if(!game.user.isGM&&!actor.isOwner)throw Error('Actor access denied');
      return Array.from(actor.items??[]).map(i=>({item:i,tag:grantOf(i)})).filter(x=>x.tag?.treeId).map(({item,tag})=>({itemId:item.id,perkId:tag.perkId??null,treeId:tag.treeId,nodeId:tag.nodeId,wallet:tag.wallet??null}));},
    /** GM, read-only: what Skill Trees 0.15.0/0.16.0 saved for Strain and Cinders, for a one-time adopt by the module that owns them now. */
    legacyData:()=>{gmOnly();
      const settings=Object.fromEntries(LEGACY_SETTINGS.map(k=>[k,game.settings.get(MODULE,k)??null]));
      return {registry:copy(gmPrivate()?.flags?.[MODULE]?.cinders??null),settings,
        pointers:(game.actors?.contents??[]).filter(a=>Array.isArray(safeFlag(a,'cinders'))&&safeFlag(a,'cinders').length).map(a=>({actorId:a.id,pointers:copy(safeFlag(a,'cinders'))}))};}
  };
}
// Player unlocks: the active GM's client does the checks and the writes (players cannot be trusted to).
const pendingRequests=new Map();
function onSocket(message,senderId){
  if(!message||typeof message!=='object')return;
  if(message.type==='unlock-result'){
    const wait=pendingRequests.get(message.requestId);if(!wait||message.userId!==game.user.id)return;
    pendingRequests.delete(message.requestId);clearTimeout(wait.timer);
    if(message.ok)wait.resolve(message);else wait.reject(Error(message.message));
    return;
  }
  if(message.type==='unlock-request'&&game.user.isGM&&game.users?.activeGM?.id===game.user.id)return handleUnlockRequest(message,senderId);
}
async function handleUnlockRequest(message,senderId){
  const userId=typeof senderId==='string'&&game.users?.get(senderId)?senderId:message.userId;
  const reply=(ok,text)=>game.socket.emit(SOCKET,{type:'unlock-result',requestId:message.requestId,userId,ok,message:text});
  try{
    const user=game.users?.get(userId),actor=game.actors?.get(message.actorId);
    if(!user||user.isGM)throw Error('Unknown player');
    if(!playerAccessEnabled())throw Error('Skill Trees is hidden from players right now');
    if(!actor||actor.testUserPermission?.(user,'OWNER')!==true)throw Error('You do not own that character');
    assertNotLevelBackup(actor);
    const {node}=await unlockNode(actor,message.treeId,message.nodeId,{forUser:user});
    reply(true,`${node.name} unlocked for ${actor.name}.`);
  }catch(error){reply(false,String(error?.message??error));}
}
function requestUnlock(actor,treeId,nodeId){
  if(!game.users?.activeGM)return Promise.reject(Error('A GM must be logged in to unlock perks (the GM client adds the perk to the sheet).'));
  const requestId=foundry.utils.randomID(16);
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pendingRequests.delete(requestId);reject(Error('No answer from the GM client. Check that a GM is connected and try again.'));},20000);
    pendingRequests.set(requestId,{resolve,reject,timer});
    game.socket.emit(SOCKET,{type:'unlock-request',requestId,userId:game.user.id,actorId:actor.id,treeId,nodeId});
  });
}
/** Readable prerequisite lists for a node: the keyboard/screen-reader version of the arrows. */
function relationsOf(nodes,n){
  const by=new Map(nodes.map(x=>[x.id,x]));
  const ref=id=>{const x=by.get(id);return x?{id,name:x.name,unlocked:Boolean(x.unlocked)}:null;};
  return {
    all:asArray(n.requiresAll).map(ref).filter(Boolean),
    any:asArray(n.requiresAny).map((g,i)=>({index:i+1,nodes:g.map(ref).filter(Boolean)})).filter(g=>g.nodes.length),
    excludes:[...new Set([...asArray(n.excludes),...nodes.filter(x=>asArray(x.excludes).includes(n.id)).map(x=>x.id)])].map(ref).filter(Boolean),
    leadsTo:nodes.filter(x=>asArray(x.requiresAll).includes(n.id)||asArray(x.requiresAny).some(g=>g.includes(n.id))).map(x=>ref(x.id))
  };
}
/** Node state as words and the kit badge tone (the corner tip and the inspector use the same pair). */
const STATE_VIEW={UNLOCKED:{text:'Unlocked',badge:'ag-badge--ok'},AVAILABLE:{text:'Available',badge:'ag-badge--accent'},LOCKED:{text:'Locked',badge:''}};
const TIP_BADGE={unlocked:'ag-badge--ok',available:'ag-badge--accent'};
const HISTORY_LABELS={allocate:'Picked',override:'GM grant',remove:'Removed',keep:'Kept',reset:'Reset',undo:'Undo',migrate:'Imported from Ledger'};
const relationText=r=>[r.all.length?`Requires ${r.all.map(x=>x.name).join(' and ')}`:'',
  ...r.any.map(g=>`Requires one of ${g.nodes.map(x=>x.name).join(' or ')}`),
  r.excludes.length?`Cannot be taken with ${r.excludes.map(x=>x.name).join(', ')}`:''].filter(Boolean).join('. ');

const PROVIDER_TEXT={profession:'Profession',cinder_milestone:'Cinder',generic_points:'Generic points'};
const STATUS_VIEW={draft:{text:'Draft',cls:''},test:{text:'Test',cls:'ag-badge--warn'},approved:{text:'Approved',cls:'ag-badge--ok'}};
/** Tree Library rows (GM): one per private layout, sorted by name; search text is the lower-case name. */
function libraryRows(trees,selectedId){
  return trees.map(t=>{const n=asArray(t.nodes).length,st=STATUS_VIEW[t.status]??{text:String(t.status??''),cls:''};
    return {id:t.id,name:t.name||'Unnamed tree',search:String(t.name||t.id).toLowerCase(),kind:PROVIDER_TEXT[t.provider?.kind]??'Generic points',
      nodeText:`${n} perk${n===1?'':'s'}`,statusText:st.text,statusClass:st.cls,playerVisible:t.visibility==='player',
      visibilityText:t.visibility==='player'?'Player-visible':'GM only',selected:t.id===selectedId};})
    .sort((a,b)=>a.name.localeCompare(b.name));
}
const countText=(shown,total)=>shown===total?`${total} tree${total===1?'':'s'}`:`${shown} of ${total} trees`;
const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;
const awardLabel=n=>`Award ${plural(Number.isFinite(n)&&n>0?n:0,'point')}`;
/** Sidebar and Tree Library sub-tabs (0.20.0): group → the app field and per-user memory key that hold the choice. */
const SIDE_TABS=[{id:'perk',label:'Perk'},{id:'character',label:'Character'},{id:'edit',label:'Edit'}];
const LIBRARY_TABS=[{id:'trees',label:'Trees'},{id:'checks',label:'Checks & maintenance'}];
const SUB_GROUPS={'agst-side':'sideTab','agst-library':'libraryTab'};
const sideTabsFor=gm=>gm?SIDE_TABS:SIDE_TABS.filter(t=>t.id!=='edit');
/** Sub-tab row and panel attributes for one group (kit 2.2 subTabs/tabPanelAttrs); the selected tab falls back to the first. */
function subTabView(group,label,tabs,selected){
  const pick=tabs.some(t=>t.id===selected)?selected:tabs[0].id;
  return {pick,tabs:subTabs({group,label,tabs,selected:pick}),panel:Object.fromEntries(tabs.map(t=>[t.id,tabPanelAttrs(group,t.id,{hidden:t.id!==pick})]))};
}

class SkillTreeApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS={id:'agst-window-v2',classes:['ag-app','agst-window-v2'],window:{title:'Ashen Gate | Skill Trees',resizable:true,icon:'fa-solid fa-diagram-project'},position:{width:1120,height:740}}; // Compact; Comfortable scales it when the window opens (windowSize)
  static PARTS={main:{template:`modules/${MODULE}/templates/tree.hbs`}};
  render(options){
    checkTreePlayerAccess();
    // Keep the canvas and sidebar scroll positions: tall trees must not jump to the top on every click.
    const el=this.element;
    if(el?.querySelector)this._scroll={vp:[el.querySelector('.agst-viewport')?.scrollLeft??0,el.querySelector('.agst-viewport')?.scrollTop??0],side:el.querySelector('.agst-sidebar-scroll')?.scrollTop??0};
    // Focus survives the re-render: remember the focused control by its data-* key (restored in _onRender).
    const active=globalThis.document?.activeElement,key=el?.contains?.(active)?active.closest?.('[data-act],[data-tab]'):null;
    if(key)this._focusKey={act:key.dataset.act??null,id:key.dataset.id??key.dataset.tree??null,tab:key.dataset.tab??null};
    return super.render(options);
  }
  constructor(options={}){super({...options,position:{...windowSize(SkillTreeApp.DEFAULT_OPTIONS.position),...options.position}});this.activeTab='trees';this.actorId=null;this.treeId=null;this.nodeId=null;this.editMode=false;this.playerPreview=false;this.linkFrom=null;this.zoom=1;this.search='';this.busy=false;this.undo=[];this.redo=[];this.sidebarOpen=null;this._scroll=null;this._tips={};
    // 0.20.0: remembered per user (kit uiState): the sidebar and Tree Library sub-tabs and the open folds.
    this.ui=uiState(MODULE);this.sideTab=this.ui.get('sideTab','perk',SIDE_TABS.map(t=>t.id));this.libraryTab=this.ui.get('libraryTab','trees',LIBRARY_TABS.map(t=>t.id));
    this._unbind=[];this._pendingMove=null;this._moveTimer=null;
    // GM Setup draft (Player Access): "Unsaved changes" in the footer, and a question before a tab switch or close drops it.
    this.guard=guardDirty({status:()=>this.element?.querySelector?.('[data-agst-setup-status]')});}
  /** Close asks first when GM Setup has unsaved changes. */
  async close(options){if(!(await this.guard?.confirm()??true))return this;return super.close?.(options);}
  get actor(){return game.actors?.get(this.actorId)??null;}
  get trees(){return readSelectedTrees(this.playerPreview);}
  /** Raw stored tree (GM editor writes). Never save the resolved view: perk text must stay on the perk. */
  get storedTree(){return game.user.isGM?readPrivate().find(t=>t.id===this.treeId)??null:null;}
  /** Display tree: GM sees it resolved from world perks; players (and preview) see the published projection. */
  get tree(){const t=this.trees.find(t=>t.id===this.treeId)??null;return t&&game.user.isGM&&!this.playerPreview?resolved(t):t;}
  _defaults(){
    const trees=this.trees;
    if(!trees.some(t=>t.id===this.treeId))this.treeId=trees[0]?.id??null;
    const actors=actorChoices();if(!actors.some(a=>a.id===this.actorId))this.actorId=actors[0]?.id??null;
    if(!this.tree?.nodes?.some(n=>n.id===this.nodeId))this.nodeId=null;
    if(!game.user.isGM){this.editMode=false;this.playerPreview=false;this.activeTab='trees';}
  }
  async _prepareContext(options){
    checkTreePlayerAccess();
    const ctx=await super._prepareContext(options);this._defaults();
    const gm=game.user.isGM,preview=gm&&this.playerPreview,raw=gm&&!preview;
    const t=this.tree,actor=this.actor,acc=t&&actor?readProgress(actor,t):cleanAccount();
    const profession=t?.provider?.kind==='profession';
    const level=profession&&actor?professionLevel(actor,t):null;
    // 0.21.0: the profession's other trees share the wallet; players (and preview) also meet the tree's proficiency gate.
    const siblings=profession&&actor?walletSiblings(actor,t,{trees:this.trees,resolve:raw}):[];
    const access=!raw&&actor&&t?await accessCheck(actor,t):null;
    const gate=t?accessLine(t):'';
    const prof=profession?professionStatus(t,acc,actor?level:null,siblings):null;
    const above=new Set(asArray(prof?.aboveLevel).map(x=>x.nodeId));
    const base=asArray(t?.nodes).map(n=>({...n,unlocked:acc.unlocks.includes(n.id)}));
    const nodes=base.map(n=>{
      const unlocked=n.unlocked,e=t&&actor?
        (raw?availability(t,acc,n.id,{level,siblings}):publicAvailability(t,acc,n.id,{level,siblings,access,accessLabel:proficiencyLabel})):{ok:false,reason:'Choose a character'};
      const rel=relationsOf(base,n),flag=unlocked?'UNLOCKED':e.ok?'AVAILABLE':'LOCKED',state=STATE_VIEW[flag];
      const overLevel=unlocked&&above.has(n.id),kept=unlocked&&Boolean(acc.kept[n.id]);
      return {...n,unlocked,eligible:!unlocked&&e.ok,overLevel,kept,reason:unlocked?(overLevel?`Unlocked, but needs level ${n.requiredLevel} (now ${level})`:kept?`Unlocked (kept by the GM at level ${acc.kept[n.id].level})`:'Unlocked'):e.reason,
        levelText:profession&&Number.isSafeInteger(n.requiredLevel)?`Level ${n.requiredLevel}`:'',
        selected:n.id===this.nodeId,flag,stateText:state.text,badgeClass:state.badge,rel,relText:relationText(rel),
        placeholder:n.status==='placeholder',silhouette:n.silhouette??false,img:n.silhouette?null:n.img??null,
        statusText:labelOf(NODE_STATUS_LABELS,n.status),visibilityText:labelOf(NODE_VISIBILITY_LABELS,n.visibility),displayText:labelOf(NODE_DISPLAY_LABELS,n.display),
        label:[`${n.name}: ${state.text}`,`${n.cost??1} point${(n.cost??1)===1?'':'s'}`,relationText(rel)].filter(Boolean).join('. '),
        blocked:!unlocked&&!e.ok,style:`left:${n.x}px;top:${n.y}px;`};
    });
    const selected=nodes.find(n=>n.id===this.nodeId)??null;
    const onTree=new Set(asArray(t?.nodes).map(n=>n.perkId).filter(Boolean));
    const size=nodeSizeOf(t),dim=NODE_SIZES[size];
    const maxX=Math.max(420,...nodes.map(n=>n.x+dim.w+40)),maxY=Math.max(520,...nodes.map(n=>n.y+dim.h+60),...asArray(t?.tiers).map(x=>x.y+80));
    this._tips=Object.fromEntries(nodes.map(n=>[n.id,tooltipModel(n)]));
    const spent=t?totalSpent(t,acc):0;
    const points=Math.max(0,acc.awarded-spent);
    const store=gmPrivate();
    const legacy=gm?asArray(game.settings.get(MODULE,'treeData')?.trees).length:0;
    const features=gm&&!preview?(game.items?.contents??[]).filter(i=>i.type==='feat'&&/^(PERK|POWER)-/.test(sourceFlag(i)?.sourceId??'') && lookupWorldDefinition(game,sourceFlag(i)?.sourceId).document===i
      &&(!t||allowedSourceForProvider(t.provider.kind,sourceFlag(i)?.sourceId)))
      .filter(i=>`${i.name} ${sourceFlag(i).sourceId}`.toLowerCase().includes(this.search.toLowerCase()))
      .map(i=>({uuid:i.uuid,name:i.name,id:sourceFlag(i).sourceId,statusText:labelOf(NODE_STATUS_LABELS,sourceFlag(i).status),img:i.img,onTree:onTree.has(sourceFlag(i).sourceId),
        eligible:sourceFlag(i).status==='approved'&&sourceFlag(i).visibility==='player'}))
      .sort((a,b)=>a.name.localeCompare(b.name)):[];
    const setupReport=gm&&!preview&&this.activeTab==='library'?savedDataReport(readPrivate(),id=>Boolean(perkDoc(id))):[];
    const projectedCount=gm?readPublic().length:null;
    const libraryTrees=gm&&this.activeTab==='library'?libraryRows(readPrivate(),this.treeId):[];
    const libraryList=gm&&this.activeTab==='library'?libraryItems(libraryGroups(libraryTrees,readPrivate(),g=>this._libraryWallet(g))):[];
    const picker=treePicker(this.trees,this.treeId,ref=>this.ui.get(`profTree:${ref}`,null));
    if(picker.tabs)this.ui.set(`profTree:${picker.tabs.sourceRef}`,picker.tabs.selected); // the tree last open in this profession, per user
    const side=subTabView('agst-side','Skill tree menu sections',sideTabsFor(gm),this.sideTab);this.sideTab=side.pick;
    const library=subTabView('agst-library','Tree Library sections',LIBRARY_TABS,this.libraryTab);this.libraryTab=library.pick;
    const missing=gm&&!preview&&this.activeTab==='library'?missingGrantCount():0;
    return {...ctx,sideTabs:side.tabs,sidePanel:side.panel,libraryTabs:library.tabs,libraryPanel:library.panel,
      libraryLink:linkButton('Tree Library',{data:{act:'tab-library'}}),
      canUndoEdit:this.undo.length>0,canRedoEdit:this.redo.length>0,
      linkFromName:this.linkFrom?nodes.find(n=>n.id===this.linkFrom)?.name??'':'',gm,editing:gm&&this.editMode&&!preview,preview,initialized:!gm||!!store,legacy,
      moduleVersion:game.modules?.get?.(MODULE)?.version??VERSION,libraryTrees,libraryList,libraryCountText:countText(libraryTrees.length,libraryTrees.length),playerAccessEnabled:gm?(this._setupDraft?.playerAccessEnabled??playerAccessEnabled()):false,setupDirty:gm&&this._setupDirty(),activeTrees:this.activeTab==='trees',activeSetup:gm&&this.activeTab==='setup',activeLibrary:gm&&this.activeTab==='library',gmPanel:gm&&(this.activeTab==='setup'||this.activeTab==='library'),
      hasTree:!!t,tree:t,selected,canBuy:gm&&!preview&&!!selected&&!!actor&&availability(t,acc,selected.id,{level,siblings}).ok,
      canRequest:!gm&&!!selected&&!!actor&&publicAvailability(t,acc,selected.id,{level,siblings,access,accessLabel:proficiencyLabel}).ok,
      // The requirement line, unless it is already the Unlock reason shown just above it.
      accessGate:gate&&(raw||!(selected?.reason&&gate.startsWith(selected.reason)))?{text:gate,met:access?.ok===true,gmNote:raw}:null,
      canRefund:raw&&!!selected?.unlocked&&!!actor,
      canReset:raw&&!!actor&&!!t&&acc.unlocks.length>0,
      canOverride:raw&&profession&&!!actor&&!!selected&&!selected.unlocked&&!selected.perkMissing,
      canKeep:raw&&profession&&!!actor&&!!selected?.overLevel,
      prof:prof?{...prof,levelText:prof.ledger?String(prof.level):'—',available:Math.max(0,prof.available),
        aboveText:[...prof.aboveLevel.map(x=>`${x.name} (level ${x.threshold})`),...asArray(prof.otherAboveLevel).map(x=>`${x.name} in ${x.treeName} (level ${x.threshold})`)].join(', '),
        overSpentText:`${plural(prof.overSpent,'point')} used`,
        sharedText:prof.trees?`Shared by ${prof.trees.length} trees of this profession. Points used: ${prof.trees.map(x=>`${memberName(x,groupName(prof.trees))} ${x.spent}`).join(' · ')}`:''}:null,
      ledgerMissing:profession&&!ledgerProgression(),
      roster:raw&&profession?this._roster(t):[],
      history:raw&&profession&&actor?[...acc.history].reverse().slice(0,12).map(h=>({...h,when:new Date(h.at||0).toLocaleString(),
        node:t.nodes.find(n=>n.id===h.nodeId)?.name??(h.nodeIds?plural(h.nodeIds.length,'perk'):''),label:HISTORY_LABELS[h.kind]??h.kind,
        canUndo:Boolean(h.id)&&!h.undone&&['allocate','override','remove','keep'].includes(h.kind)})):[],
      professionReport:gm&&!preview&&this.activeTab==='library'?professionReconcile().filter(r=>r.issues.length):[],
      actorName:actor?.name??'',
      canGrant:gm&&!preview&&!!actor&&!!t&&t.provider.kind!=='profession',
      mode:t?.provider?.kind==='profession'?'Profession • points from Profession Ledger level':t?.provider?.kind==='cinder_milestone'?`Cinder • ${CINDER_MAX_POINTS}-point milestone wallet`: 'Generic • GM-awarded points',
      trees:picker.options,treeTabs:picker.tabs?subTabs({group:'agst-proftree',label:`${picker.tabs.name} trees`,tabs:picker.tabs.tabs,selected:picker.tabs.selected}):'',
      treePanel:picker.tabs?tabPanelAttrs('agst-proftree',picker.tabs.selected):'',
      actors:actorChoices().map(x=>({id:x.id,name:x.name,selected:x.id===this.actorId})),
      nodes,sizeClass:`agst-size-${size}`,nodeSize:size,bg:backgroundView(t),tiers:tierBands(t?.tiers,Math.ceil(maxY)),canAppearance:gm&&!preview&&this.editMode,
      sidebarOpen:this.sidebarOpen!==false,
      edges:graphEdges(nodes,size).map(e=>({...e,marker:e.kind==='exclude'?'':`url(#agst-arrow-${e.active?'active':e.kind})`,
        label:e.kind==='exclude'?'✕':e.kind==='any'?(e.group>1?`OR ${e.group}`:'OR'):''})),selectedId:this.nodeId,
      progress:{awarded:acc.awarded,spent,available:points,unlocks:acc.unlocks.length,cap:t?.provider?.maxPoints??null},
      mapWidth:Math.ceil(maxX),mapHeight:Math.ceil(maxY),zoom:this.zoom,zoomText:`${Math.round(this.zoom*100)}%`,
      hasFeatures:!!features.length,features,search:this.search,linkFrom:this.linkFrom,
      publishedCount:projectedCount,privateCount:gm?readPrivate().length:0,hasPrivateStore:!!store,hasPrivateTree:gm&&!!t,
      isProfession:profession,isTest:t?.status==='test',
      bindingNote:raw&&selected?.perkId?selected.perkId:null,bindingName:raw&&selected?.perkId?(perkDoc(selected.perkId)?.name||selected.name||'Unnamed perk'):null,
      selectedBinding:raw&&selected?.perkId?!selected.perkMissing:false,selectedCustom:raw&&!!selected?.custom,
      setupReport,hasSetupReport:setupReport.length>0,missingGrants:missing,missingGrantsText:`${plural(missing,'unlocked perk')} ${missing===1?'is':'are'}`};
  }
  /** Tree Library line for a profession with several trees: the shared wallet once, for the character picked in Skill Trees. */
  _libraryWallet(group){
    const actor=this.actor,base='1 point per profession level, '+PROFESSION_MAX_LEVEL+' at most, shared by '+group.trees.length+' trees';
    if(!actor)return `Shared wallet: ${base}.`;
    const w=walletFor(actor,group.sourceRef);
    return w?`Shared wallet (${base}). ${walletLine(actor.name,w)}.`:`Shared wallet: ${base}.`;
  }
  /** GM list of every character on a profession tree: level, points used, and whether they need review. */
  _roster(t){
    const rows=[];
    for(const a of actorChoices()){
      const acc=readProgress(a,t),level=professionLevel(a,t);
      const st=professionStatus(t,acc,level,privateSiblings(a,t));
      if(!st.spent&&!(level>0))continue;
      rows.push({id:a.id,name:a.name,selected:a.id===this.actorId,level:st.ledger?st.level:'—',spent:st.spent,earned:st.earned,
        status:!st.ledger?'Ledger off':st.overAllocated?'Needs review':st.available>0?`${st.available} to choose`:'Up to date',
        review:st.overAllocated,toChoose:st.ledger&&!st.overAllocated&&st.available>0});
    }
    return rows.sort((a,b)=>Number(b.review)-Number(a.review)||a.name.localeCompare(b.name));
  }
  async _onRender(context,options){
    await super._onRender(context,options);if(!canOpenTrees()){await this.close?.({animate:false});return;}instance=this;openTreeWindows.add(this);
    const root=this.element;
    this._listeners?.abort();this._listeners=new AbortController();
    for(const fn of this._unbind.splice(0))fn();
    const listenerOptions={signal:this._listeners.signal};
    root.addEventListener('click',e=>this._clicked(e),listenerOptions);
    // Esc leaves Connect prerequisite (before Foundry's own Esc handling closes the window).
    root.addEventListener('keydown',e=>{if(e.key==='Escape'&&this.linkFrom){e.preventDefault();e.stopPropagation();this.linkFrom=null;this.render();}},listenerOptions);
    // Kit 2.2: arrow keys on the top tabs and sub-tabs, remembered sub-tabs and folds.
    const topTabs=root.querySelector('nav.ag-tabs');if(topTabs)this._unbind.push(bindTablist(topTabs));
    this._wireSubTabs(root,listenerOptions);
    this._wireTreeTabs(root,listenerOptions);
    this._unbind.push(bindFolds(root,this.ui));
    root.addEventListener('change',e=>{
      const el=e.target;
      if(el.id==='agst-tree-choice'){const pick=el.value;const go=()=>{this.treeId=pick;this.nodeId=null;this.linkFrom=null;this.undo=[];this.redo=[];this.render();};
        if(this._pendingMove)void this._commitMove().then(go);else go();}
      if(el.id==='agst-actor-choice'){this.actorId=el.value;this.render();}
    },listenerOptions);
    root.querySelector('#agst-feature-search')?.addEventListener('input',e=>{this.search=e.target.value;const cards=root.querySelectorAll('.agst-feature');for(const c of cards)c.hidden=!`${c.textContent}`.toLowerCase().includes(this.search.toLowerCase());},listenerOptions);
    this._wireLibrarySearch(root,listenerOptions);
    root.querySelector('[data-agst-setup]')?.addEventListener('change',()=>this._onSetupChange(),listenerOptions);
    if(this._setupDirty())this.guard.markDirty();
    const shell=root.querySelector('.agst-shell');
    this.sidebarOpen=initialSidebar(this.sidebarOpen,shell?.clientWidth);
    this._applySidebar();
    this._showTip(this.nodeId);
    const viewport=root.querySelector('.agst-viewport');
    if(viewport){
      viewport.addEventListener('pointerdown',e=>this._pointerDown(e),listenerOptions);
      viewport.addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();this._setZoom(this.zoom+(e.deltaY<0?.1:-.1));},{...listenerOptions,passive:false});
      if(this._scroll){viewport.scrollLeft=this._scroll.vp[0];viewport.scrollTop=this._scroll.vp[1];}
    }
    const side=root.querySelector('.agst-sidebar-scroll');if(side&&this._scroll)side.scrollTop=this._scroll.side;
    const board=root.querySelector('.agst-board');
    if(board){
      board.style.zoom=String(this.zoom);
      this._fitEdges();
      // Corner tooltip: hover or keyboard focus previews a node; the selected node shows when nothing else does.
      const nodeOf=e=>e.target.closest?.('.agst-node')?.dataset.id??null;
      board.addEventListener('pointerover',e=>{const id=nodeOf(e);if(id)this._showTip(id);},listenerOptions);
      board.addEventListener('focusin',e=>{const id=nodeOf(e);if(id)this._showTip(id);},listenerOptions);
      board.addEventListener('pointerout',e=>{if(nodeOf(e))this._showTip(this.nodeId);},listenerOptions);
      board.addEventListener('focusout',e=>{if(nodeOf(e))this._showTip(this.nodeId);},listenerOptions);
      if(this._refocus&&this.nodeId){board.querySelector(`.agst-node[data-id="${CSS.escape(this.nodeId)}"]`)?.focus({preventScroll:true});this._focusKey=null;}
      this._refocus=false;
      board.addEventListener('keydown',e=>this._nodeKey(e),listenerOptions);
      board.addEventListener('dragover',e=>{if(game.user.isGM&&this.editMode&&!this.playerPreview)e.preventDefault();},listenerOptions);
      board.addEventListener('drop',e=>this._dropped(e),listenerOptions);
    }
    root.querySelectorAll('.agst-feature').forEach(el=>el.addEventListener('dragstart',e=>e.dataTransfer?.setData('text/plain',JSON.stringify({type:'Item',uuid:el.dataset.uuid})),listenerOptions));
    this._restoreFocus(root);
  }
  /** Put focus back on the control that had it before the re-render (same data-act and id, or the same sub-tab). */
  _restoreFocus(root){
    const key=this._focusKey;this._focusKey=null;if(!key)return;
    const q=v=>CSS.escape(String(v));
    const sel=key.tab?`[data-tab="${q(key.tab)}"]`:key.act?`[data-act="${q(key.act)}"]${key.id?`:is([data-id="${q(key.id)}"],[data-tree="${q(key.id)}"])`:''}`:null;
    if(sel)root.querySelector(sel)?.focus({preventScroll:true});
  }
  /** Sidebar and Tree Library sub-tabs switch in place (no re-render, so focus and scroll stay); kit bindTablist adds the keys. */
  _wireSubTabs(root,listenerOptions){
    for(const list of root.querySelectorAll('.ag-tabs--sub')){
      const first=list.querySelector('[role="tab"]'),group=Object.keys(SUB_GROUPS).find(g=>first?.id?.startsWith(`${g}-tab-`));if(!group)continue;
      const key=SUB_GROUPS[group];
      this._unbind.push(bindTablist(list,{state:this.ui,key}));
      list.addEventListener('click',e=>{const tab=e.target.closest?.('[role="tab"]');if(tab)this._showSubTab(list,key,tab.dataset.tab);},listenerOptions);
    }
  }
  /** 0.21.0: sub-tabs between the trees of one profession (they share its wallet). Choosing one opens that tree. */
  _wireTreeTabs(root,listenerOptions){
    const list=root.querySelector('.agst-tree-tabs .ag-tabs--sub');if(!list)return;
    this._unbind.push(bindTablist(list));
    list.addEventListener('click',e=>{
      const tab=e.target.closest?.('[role="tab"]');if(!tab||tab.dataset.tab===this.treeId)return;
      const go=()=>{this.treeId=tab.dataset.tab;this.nodeId=null;this.linkFrom=null;this.undo=[];this.redo=[];this.render();};
      if(this._pendingMove)void this._commitMove().then(go);else go();
    },listenerOptions);
  }
  _showSubTab(list,key,tab){
    this[key]=tab;
    for(const b of list.querySelectorAll('[role="tab"]')){
      const on=b.dataset.tab===tab;b.setAttribute('aria-selected',String(on));b.setAttribute('tabindex',on?'0':'-1');
      const panel=this.element?.querySelector?.(`#${CSS.escape(b.getAttribute('aria-controls')??'')}`);if(panel)panel.hidden=!on;
    }
  }
  /** Edit layout: arrow keys move the focused node 10 px (Shift 50 px); the position is saved once the keys stop (WCAG 2.5.7). */
  _nodeKey(event){
    const target=event.target?.closest?.('.agst-node');if(!target||!game.user.isGM||!this.editMode||this.playerPreview||!this.storedTree)return;
    const id=target.dataset.id,next=nudged({x:parseFloat(target.style.left),y:parseFloat(target.style.top)},event.key,event.shiftKey);
    if(!next)return;
    event.preventDefault();
    target.style.left=`${next.x}px`;target.style.top=`${next.y}px`;this._redrawEdges(id);
    this._pendingMove={id,...next};clearTimeout(this._moveTimer);
    this._moveTimer=setTimeout(()=>void this._commitMove(),400);
  }
  async _commitMove(){
    clearTimeout(this._moveTimer);const move=this._pendingMove;this._pendingMove=null;if(!move)return;
    try{await this._moveNode(move.id,move.x,move.y);}catch(error){notify(error.message,true);}
    this.nodeId=move.id;this._refocus=true;this.render();
  }
  /** Saves one node's position (GM editor only). */
  async _moveNode(id,x,y){
    if(!game.user.isGM||!this.editMode||this.playerPreview||!this.storedTree)throw Error('GM editor only');
    const t=copy(this.storedTree),n=t.nodes.find(v=>v.id===id);if(!n)throw Error('Missing node');
    n.x=snapPos(x);n.y=snapPos(y);
    try{await this._saveEdited(t);}catch(err){console.error(err);notify(err.message,true);}
  }
  /** Redraw the edges (arrowheads and labels) touching one node from the nodes' current positions on the board. */
  _redrawEdges(id){
    const board=this.element?.querySelector?.('.agst-board');if(!board||!this.tree)return;
    const size=nodeSizeOf(this.tree),w=NODE_SIZES[size].w;
    const pos=nodeId=>{const el=board.querySelector(`.agst-node[data-id="${CSS.escape(nodeId)}"]`);
      return el?{x:parseFloat(el.style.left),y:parseFloat(el.style.top),...(el.offsetWidth?{h:el.offsetHeight*w/el.offsetWidth}:{})}:null;};
    for(const el of board.querySelectorAll('[data-edge]')){
      if(el.dataset.from!==id&&el.dataset.to!==id)continue;
      const src=pos(el.dataset.from),dst=pos(el.dataset.to);if(!src||!dst)continue;
      const line=edgeLine(src,dst,size);
      if(el.tagName.toLowerCase()==='path')el.setAttribute('d',line.d);else{el.setAttribute('x',line.mx);el.setAttribute('y',line.my);}
    }
  }
  /** Tree Library search: filters the rows as you type (no re-render) and keeps the count in step. */
  _wireLibrarySearch(root,listenerOptions){
    const input=root.querySelector('[data-agst-library-search]');if(!input)return;
    const rows=[...root.querySelectorAll('[data-agst-library-row]')],count=root.querySelector('[data-agst-library-count]'),none=root.querySelector('[data-agst-library-nomatch]');
    const apply=()=>{const q=input.value.trim().toLowerCase();let shown=0;
      for(const row of rows){row.hidden=Boolean(q)&&!row.dataset.search.includes(q);if(!row.hidden)shown++;}
      // 0.21.0: a profession heading shows while any of its trees does.
      for(const head of root.querySelectorAll('[data-agst-library-group]'))head.hidden=!rows.some(r=>r.dataset.agstLibraryIn===head.dataset.agstLibraryGroup&&!r.hidden);
      if(count)count.textContent=countText(shown,rows.length);if(none)none.hidden=!(rows.length&&!shown);};
    input.addEventListener('input',apply,listenerOptions);
    root.querySelector('[data-agst-library-clear]')?.addEventListener('click',()=>{input.value='';apply();input.focus();},listenerOptions);
  }
  /** GM Setup form values as shown (not yet saved). */
  _readSetup(){
    const box=this.element?.querySelector?.('[data-agst-setup] [name="playerAccessEnabled"]');
    return {playerAccessEnabled:box?Boolean(box.checked):playerAccessEnabled()};
  }
  /** A GM Setup control changed: say so in the footer. Nothing is written until Save Changes (D4). */
  _onSetupChange(){
    this._setupDraft=this._readSetup();
    if(this._setupDirty())this.guard.markDirty();else this.guard.markClean();
    const status=this.element?.querySelector?.('[data-agst-setup-status]');
    if(status)status.textContent=this._setupDirty()?'Unsaved changes':'';
  }
  _setupDirty(){return Boolean(this._setupDraft)&&this._setupDraft.playerAccessEnabled!==playerAccessEnabled();}
  /** Save Changes in GM Setup. GM only; writes only the settings that changed (same setting key as before). */
  async _saveSetup(values={}){
    if(!game.user.isGM)throw Error('GM only');
    const next=values.playerAccessEnabled;
    this._setupDraft=null;
    if(typeof next!=='boolean'||next===playerAccessEnabled()){notify('No changes to save.');return false;}
    await setPlayerAccess(game,MODULE,next);
    notify(`Saved. Player Access: ${next?'players can open Skill Trees':'hidden from players'}. Points and unlocks are unchanged.`);
    return true;
  }
  /**
   * Nodes keep their width but grow in height to show the whole name, so redraw each edge to the node's real border.
   * The height is read relative to the fixed width, so the board zoom does not matter.
   */
  _fitEdges(){
    const board=this.element?.querySelector?.('.agst-board');if(!board||!this.tree)return;
    const size=nodeSizeOf(this.tree),w=NODE_SIZES[size].w;
    const box=id=>{const el=board.querySelector(`.agst-node[data-id="${CSS.escape(id)}"]`);if(!el)return null;
      const h=el.offsetWidth?el.offsetHeight*w/el.offsetWidth:NODE_SIZES[size].h;
      return {x:parseFloat(el.style.left),y:parseFloat(el.style.top),h};};
    const boxes=new Map();const get=id=>{if(!boxes.has(id))boxes.set(id,box(id));return boxes.get(id);};
    for(const el of board.querySelectorAll('[data-edge]')){
      const src=get(el.dataset.from),dst=get(el.dataset.to);if(!src||!dst)continue;
      const line=edgeLine(src,dst,size);
      if(el.tagName.toLowerCase()==='path')el.setAttribute('d',line.d);else{el.setAttribute('x',line.mx);el.setAttribute('y',line.my);}
    }
  }
  _applySidebar(){
    const open=this.sidebarOpen!==false,layout=this.element?.querySelector?.('.agst-layout');
    layout?.classList.toggle('agst-sidebar-open',open);
    this.element?.querySelectorAll?.('[data-act="toggle-sidebar"]').forEach(b=>b.setAttribute('aria-expanded',String(open)));
  }
  /** Fill the corner card from the prepared tooltip data (text only, never markup); no re-render. */
  _showTip(id){
    const card=this.element?.querySelector?.('.agst-tip');if(!card)return;
    const tip=this._tips?.[id]??null;
    card.hidden=!tip;
    if(!tip){card.replaceChildren();return;}
    const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;e.textContent=text;return e;};
    const head=make('div','agst-tip-head','');head.append(make('strong','',tip.name),make('span',`ag-badge ${TIP_BADGE[tip.statusKey]??''}`.trim(),tip.status));
    card.replaceChildren(head);
    if(tip.costText)card.append(make('div','agst-tip-line',tip.costText));
    if(tip.text)card.append(make('p','agst-tip-text',tip.text));
    if(tip.prerequisites)card.append(make('div','agst-tip-line agst-tip-req',tip.prerequisites));
    else if(tip.reason)card.append(make('div','agst-tip-line agst-tip-req',tip.reason));
  }
  _setZoom(value){
    this.zoom=Math.min(1.6,Math.max(.4,Math.round(value*10)/10));
    const board=this.element?.querySelector?.('.agst-board');if(board)board.style.zoom=String(this.zoom);
    const label=this.element?.querySelector?.('.agst-zoom-label');if(label)label.textContent=`${Math.round(this.zoom*100)}%`;
  }
  async _clicked(event){
    try{checkTreePlayerAccess();}catch(error){notify(error.message,true);await this.close?.({animate:false});return;}
    const el=event.target.closest('[data-act]');if(!el||this.busy)return;
    if(this._pendingMove)await this._commitMove(); // save a keyboard move before anything else changes the tree or the mode
    const action=el.dataset.act,id=el.dataset.id;
    if(action.startsWith('tab-')){
      if(action===`tab-${this.activeTab}`)return;
      // Leaving GM Setup with unsaved changes asks first (kit guardDirty); Keep editing stays put.
      if(this.activeTab==='setup'&&!(await this.guard.confirm()))return;
      this._setupDraft=null;this.guard.markClean();
    }
    if(action==='tab-trees'){this.activeTab='trees';this.render();return;}
    if(action==='tab-library'){if(!game.user.isGM){notify('Tree Library is restricted to the GM.',true);return;}this.activeTab='library';this.editMode=false;this.playerPreview=false;this.render();return;}
    if(action==='tab-setup'){if(!game.user.isGM){notify('GM Setup is restricted to the GM.',true);return;}this.activeTab='setup';this.editMode=false;this.playerPreview=false;this.render();return;}
    if(action==='select'){
      if(this.linkFrom&&game.user.isGM&&this.editMode){try{await this._linkTo(id);}catch(e){notify(e.message,true);}return;}
      this.nodeId=id;this.sideTab='perk';this._refocus=true;this.render();return;
    }
    if(action==='cancel-link'){this.linkFrom=null;this.render();return;}
    if(action==='toggle-sidebar'){this.sidebarOpen=toggledSidebar(this.sidebarOpen);this._applySidebar();return;}
    if(action==='zoom-in'){this._setZoom(this.zoom+.1);return;}
    if(action==='zoom-out'){this._setZoom(this.zoom-.1);return;}
    if(action==='zoom-reset'){this._setZoom(1);return;}
    this.busy=true;
    try{
      switch(action){
        case 'help': await this._help();break;
        // D4: GM Setup settings are written only by Save Changes; Cancel drops the edits (the re-render shows the saved values).
        case 'setup-save':await this._saveSetup(this._readSetup());this.guard.markClean();break;
        case 'setup-cancel':this._setupDraft=null;this.guard.markClean();break;
        case 'initialize': await initializeStore();break;
        case 'qa-install':await this._installQa();break;
        case 'qa-reset':await this._resetQa();break;
        case 'create-tree':await this._newTree();break;
        case 'edit-mode':this.editMode=!this.editMode;this.linkFrom=null;this.activeTab='trees';if(this.editMode)this.sideTab='edit';break;
        case 'player-preview':this.playerPreview=!this.playerPreview;this.activeTab='trees';this.editMode=false;this.nodeId=null;break;
        case 'grant':await this._grant();break;
        case 'purchase':await this._purchase();break;
        case 'request':await this._request();break;
        case 'refund':await this._refund();break;
        case 'override':await this._override();break;
        case 'keep':await this._keep();break;
        case 'resolve':await this._resolve();break;
        case 'undo-history':await this._undoHistory(id);break;
        case 'ledger-import':await this._ledgerImport();break;
        case 'pick-actor':this.actorId=id;break;
        case 'open-row':this.treeId=el.dataset.tree;this.actorId=el.dataset.actor??this.actorId;this.nodeId=null;this.activeTab='trees';break;
        case 'reset-tree':await this._resetTree();break;
        case 'give-missing':await this._giveMissing();break;
        case 'edit-node':await this._editNode();break;
        case 'copy-id':{const v=el.dataset.copy??'';try{await navigator.clipboard.writeText(v);notify('Id copied.');}catch{notify('Could not copy. Select the id and copy it by hand.',true);}break;}
        case 'add-perk':await this._addPerkFromList(el.dataset.uuid);break;
        case 'assign-perk':await this._assignPerk();break;
        case 'remove-node':await this._removeNode();break;
        case 'tree-settings':await this._treeSettings();break;
        case 'appearance':await this._appearance();break;
        case 'link':this.linkFrom=this.nodeId;break;
        case 'move-node':await this._moveNodeDialog();break;
        case 'undo':await this._undo();break;
        case 'redo':await this._redo();break;
        case 'publish':await publishPublic();notify('Player view republished.');break;
        case 'export':this._export(false,el.dataset.tree);break;
        case 'export-all':this._export(true);break;
        case 'backup-progress':this._backupProgress();break;
        case 'legacy-preview':await this._legacyPreview();break;
        case 'legacy-clear':await this._legacyClear();break;
      }
      this.render();
    }catch(error){console.error(`[${MODULE}]`,error);notify(`Skill Trees: ${error.message}`,true);}finally{this.busy=false;}
  }
  async _help(){
    await infoDialog('Skill Trees help',`
      <h3>Skill Trees</h3><p>Shows a character’s tree. Each node is a perk. Arrows point from a prerequisite to the perk it opens; a dashed arrow marked OR means any one of that group is enough; a red dotted line marked ✕ joins perks that cannot both be taken. The menu beside the canvas has three tabs:</p>
      <ul><li><strong>Perk</strong>: the selected perk, what it needs and what it opens, and its actions (Unlock, Remove, Grant). Selecting a node opens this tab. “Tree as a list” selects nodes from the keyboard.</li>
      <li><strong>Character</strong>: points, Award points, the characters on a profession tree, the character’s History (every change can be undone) and Reset this tree.</li>
      <li><strong>Edit</strong> (GM): with Edit layout on, Tree settings, Appearance, Undo/Redo and the Perks list.</li></ul>
      <p><strong>Unlock</strong> spends the character’s points and adds the perk to their sheet. Players unlock their own characters while a GM is logged in; the GM can unlock, refund or reset (refund removes the perk from the sheet).</p>
      <h3>Editing a tree (GM)</h3><p>Turn on <strong>Edit layout</strong> above the canvas. Add perks from the Edit tab (drag, or press Add). Move a node by dragging it, by focusing it and using the arrow keys (Shift for bigger steps), or with Move node. <strong>Connect prerequisite</strong> adds a required arrow; Esc or Cancel connecting stops. <strong>Player preview</strong> shows what players see.</p>
      <h3>Tree Library (GM)</h3><p><strong>Trees</strong> lists every tree with Open and Export, Export all trees and New tree. <strong>Checks &amp; maintenance</strong> has the saved-data and profession perk checks, older-data moves (Ledger perk choices, legacy trees), the progress backup and Republish player view. Tree files are imported through General Manager.</p>
      <h3>GM Setup</h3><p>Player access (saved with Save Changes) and Developer Tools.</p>
      <h3>Profession trees</h3><p>Profession trees get 1 point per profession level from the Profession Ledger (level 16 = 16 points; a tree has 24 perks, so players choose 16). Each perk needs the level of its tier (Apprentice 1, Journeyman 4, Expert 7, Artisan 10, Master 13). Players pick their own; only the GM can remove a perk, grant one as an override, or keep one the level no longer covers. A character with perks above their level waits on GM review before picking again: the banner’s <strong>Review</strong> button (or the whisper’s) lists them, to keep or remove each.</p>
      <h3>Professions with several trees</h3><p>A profession can have more than one tree (for example one per craft). Its trees share one wallet: 1 point per profession level, 16 at most, whichever tree the points go into. The Tree list shows the profession once; the tabs below it switch between its trees, and the Character tab shows how many points each tree uses. A tree can ask for a tool or skill proficiency: players without one can browse it but not pick from it (the Profession Ledger checks it); the GM can still unlock and grant.</p>`);
  }
  async _installQa(){
    if(!game.user.isGM)throw Error('GM only');
    if(!gmPrivate())throw Error('Initialize the GM store first');
    const layouts=qaTreeLayouts();
    const existing=readPrivate(),existingIds=new Set(existing.map(t=>t.id));
    if(layouts.some(t=>existingIds.has(t.id)))throw Error('QA layout IDs are already present; reset the existing fixture or resolve the collision before reinstalling');
    if([...game.actors.contents,...game.items.contents].some(doc=>isQaDocument(doc)))
      throw Error('QA documents already exist; use Reset QA Fixture before reinstalling');
    if(game.items.contents.some(doc=>qaSourceItems().some(item=>item.flags['ashen-gate-manager'].source.sourceId===sourceFlag(doc)?.sourceId)))
      throw Error('QA source IDs already exist; refusing to create duplicate source bindings');
    if(!await confirm('This creates one real [AG QA] character Actor, two draft GM-only Feature Items, and three [AG QA] tree layouts in the existing private Journal. They are not approved game content, do not award XP/Perks or grant Item effects, and can be removed using Reset QA Fixture.\nUse a disposable test world. You must manually grant a test player Actor ownership for player tests.',{title:'Install test records?',yes:'Install test records'}))return;
    const created=[];
    try{
      const actor=await Actor.create(qaActorData());if(!actor)throw Error('QA Actor creation did not return a document');created.push(actor);
      for(const data of qaSourceItems()){const item=await Item.create(data);if(!item)throw Error('QA Item creation did not return a document');created.push(item);}
      await saveTrees([...existing,...layouts]);
      this.treeId=QA_TREES.generic;this.actorId=actor.id;this.nodeId=null;this.activeTab='trees';
      notify(`Installed ${created.length} native QA documents and ${layouts.length} test tree layouts. Give a test player Owner permission to the [AG QA] Actor.`);
    }catch(error){
      // Source writes and the public projection are separate Foundry operations.
      // Restore only layouts from this installation; never touch preexisting trees.
      if(readPrivate().some(t=>layouts.some(qa=>qa.id===t.id))){
        try{await saveTrees(existing,{checkPurchased:false});}
        catch(revertError){console.error(`[${MODULE}] QA layout rollback failed`,revertError);}
      }
      for(const doc of created.reverse()){try{if(isQaDocument(doc))await doc.delete();}catch(cleanupError){console.error(`[${MODULE}] QA cleanup failed`,cleanupError);}}
      throw Error(`QA fixture installation failed; check [AG QA] documents before retrying: ${error.message}`);
    }
  }
  async _resetQa(){
    if(!game.user.isGM)throw Error('GM only');
    if(!gmPrivate())throw Error('Initialize the GM store first');
    const layouts=readPrivate(),qaIds=new Set(Object.values(QA_TREES));
    const qaTrees=layouts.filter(t=>qaIds.has(t.id)&&t.name.startsWith('[AG QA]'));
    if(layouts.some(t=>qaIds.has(t.id)&&!t.name.startsWith('[AG QA]')))
      throw Error('QA layout ID is occupied by a non-QA tree; refusing to delete it');
    const actors=game.actors?.contents??[],items=game.items?.contents??[];
    const qaDocs=[...items.filter(isQaDocument),...actors.filter(isQaDocument)];
    const blockers=qaCleanupBlockers(qaTrees,actors);
    if(blockers.length)throw Error(`Cannot reset: another Actor has QA tree progress. ${blockers.slice(0,3).join('; ')}`);
    if(!qaTrees.length&&!qaDocs.length){notify('No marked [AG QA] fixture records to reset.');return;}
    if(!await confirmDanger(`This removes ${qaTrees.length} QA tree layouts and deletes only ${qaDocs.length} native documents tagged ${QA_FIXTURE} (including the disposable QA Actor and its test progress).\nUnrelated layouts, world records, and other Actors are not deleted. Export test evidence before resetting. Existing legacy Demo trees are not touched.`,{title:'Remove test records?',yes:'Remove test records'}))return;
    // Store is updated before native deletion: a failed deletion remains safely tagged for a retry.
    await saveTrees(layouts.filter(t=>!(qaIds.has(t.id)&&t.name.startsWith('[AG QA]'))),{checkPurchased:false});
    const failures=[];
    for(const doc of qaDocs){try{await doc.delete();}catch(error){failures.push(doc.name??doc.id);console.error(`[${MODULE}] Could not delete QA record`,error);}}
    if(failures.length)throw Error(`QA tree layouts removed, but these tagged QA docs still need cleanup: ${failures.join(', ')}`);
    this.treeId=null;this.actorId=null;this.nodeId=null;this.undo=[];this.redo=[];
    notify('Removed marked QA records and layouts. Production Actors and definitions were not modified.');
  }
  async _newTree(){
    if(!game.user.isGM)throw Error('GM only');
    const f=await input('Create tree',`<div class="ag-form-grid agst-dialog"><label class="ag-field">Name<input name="name" value="New Tree" maxlength="120" required></label>
      <label class="ag-field">Provider<select name="kind"><option value="generic_points">Generic points</option><option value="cinder_milestone">Cinder • ${CINDER_MAX_POINTS} milestones</option><option value="profession">Profession • Ledger read-only</option></select></label>
      <label class="ag-field">Linked profession or mutation (optional)<input name="sourceRef" placeholder="Paste the source id from General Manager"></label>
      <label class="ag-field">Generic point limit (1–999)<input type="number" name="maxPoints" value="10" min="1" max="999"></label>
      <p>Created as a hidden draft. Only explicitly released nodes become player-visible.</p></div>`,'Create');
    if(!f)return;
    const kind=f.kind||'generic_points';const t={id:newKey('LOCAL-TREE'),name:String(f.name??'').trim(),description:'New draft tree.',sourceRef:String(f.sourceRef??'').trim()||null,
      provider:{kind,maxPoints:kind==='cinder_milestone'?CINDER_MAX_POINTS:kind==='profession'?null:Number(f.maxPoints)},status:'draft',visibility:'gm',nodes:[]};
    const v=validateTree(t);if(v.errors.length)throw Error(v.errors.join('; '));
    await saveTrees([...readPrivate(),t]);this.treeId=t.id;this.activeTab='trees';this.editMode=true;this.sideTab='edit';this.nodeId=null;notify('Draft tree created.');
  }
  async _saveEdited(t,{recordHistory=true}={}){
    const old=readPrivate(),prior=old.find(o=>o.id===t.id);if(!prior)throw Error('Selected tree is missing');
    const v=validateTree(t);if(v.errors.length)throw Error(v.errors.join('; '));
    const next=old.map(x=>x.id===t.id?t:x);await saveTrees(next,{previous:old});
    if(recordHistory){this.undo.push({treeId:t.id,tree:prior});if(this.undo.length>30)this.undo.shift();this.redo=[];}
    if(v.warnings.length)console.warn(`[${MODULE}] Tree warnings`,v.warnings);
  }
  async _treeSettings(){
    if(!game.user.isGM||!this.editMode||!this.tree)throw Error('GM editor only');
    const t=copy(this.storedTree);const f=await input('Tree settings',`<div class="ag-form-grid agst-dialog"><label class="ag-field">Name<input name="name" value="${escape(t.name)}" maxlength="120"></label>
      <label class="ag-field">Description (player-readable when published)<textarea name="description" rows="3">${escape(t.description)}</textarea></label>
      <label class="ag-field">Release status<select name="status"><option value="draft" ${t.status==='draft'?'selected':''}>Draft: GM only</option><option value="test" ${t.status==='test'?'selected':''}>Test: not canon</option><option value="approved" ${t.status==='approved'?'selected':''}>Approved</option></select></label>
      <label class="ag-field">Visibility<select name="visibility"><option value="gm" ${t.visibility==='gm'?'selected':''}>GM only</option><option value="player" ${t.visibility==='player'?'selected':''}>Player-visible</option></select></label>
      ${t.provider.kind==='generic_points'?`<label class="ag-field">Max points<input type="number" min="1" max="999" name="maxPoints" value="${t.provider.maxPoints??10}"></label>`:''}
      <p>Only release source content you have permission to show. Editing does not change a Profession's XP rules.</p></div>`);
    if(!f)return;
    t.name=String(f.name??'').trim();t.description=String(f.description??'');t.status=f.status;t.visibility=f.visibility;
    if(t.provider.kind==='generic_points')t.provider.maxPoints=Number(f.maxPoints);
    await this._saveEdited(t);notify('Tree saved and player snapshot refreshed.');
  }
  /** Perk Items in the world this tree may use (Manager-bound, right namespace), for the picker. */
  _worldPerks(t){
    return (game.items?.contents??[]).filter(i=>i.type==='feat'&&/^(PERK|POWER)-/.test(sourceFlag(i)?.sourceId??'')&&perkDoc(sourceFlag(i).sourceId)===i
      &&allowedSourceForProvider(t.provider.kind,sourceFlag(i).sourceId)).sort((a,b)=>a.name.localeCompare(b.name));
  }
  /** New node for a world perk. An approved player-visible perk is shown on the tree; anything else starts GM-only. */
  async _addPerkNode(doc,x=null,y=null){
    if(!game.user.isGM||!this.editMode||this.playerPreview||!this.storedTree)throw Error('GM editor only');
    if(doc?.documentName!=='Item'||doc.type!=='feat')throw Error('Only perk Feature Items can be added');
    const source=sourceFlag(doc),id=source?.sourceId;
    if(!/^(PERK|POWER)-[A-Z0-9-]+$/.test(id??''))throw Error('That Item is not a General Manager perk');
    if(perkDoc(id)!==doc)throw Error('Missing, archived or duplicated perk binding; resolve duplicates in General Manager first');
    const t=copy(this.storedTree);
    if(!allowedSourceForProvider(t.provider.kind,id))throw Error('Wrong perk type for this tree: Profession and generic trees use perks, Cinder trees use powers, and Hireling perks belong to Hirelings');
    if(t.nodes.some(n=>n.perkId===id))throw Error(`${doc.name} is already on this tree`);
    const count=t.nodes.length;
    x??=120+(count%4)*235;y??=120+Math.floor(count/4)*135;
    const released=source.status==='approved'&&source.visibility==='player'&&!/placeholder/i.test(doc.name);
    const n={id:newKey('NODE'),perkId:id,perkUuid:doc.uuid,x,y,requiresAll:[],requiresAny:[],excludes:[],
      status:released?(t.status==='approved'?'approved':'test'):source.status==='approved'?'draft':'placeholder',
      visibility:released?'player':'gm',display:released?'shown':'hidden'};
    t.nodes.push(n);await this._saveEdited(t);this.nodeId=n.id;
    notify(released?`${doc.name} added. Players see it once the tree is player-visible and published.`:`${doc.name} added as a GM-only node (the perk is not approved and player-visible yet).`);
  }
  async _addPerkFromList(uuid){
    const doc=(game.items?.contents??[]).find(i=>i.uuid===uuid);
    if(!doc)throw Error('That perk is no longer in this world');
    await this._addPerkNode(doc);
  }
  /** Give an existing node (an older custom node, or one whose perk changed) a perk from the world. */
  async _assignPerk(){
    if(!game.user.isGM||!this.editMode||!this.storedTree||!this.nodeId)throw Error('Choose a node while editing');
    const t=copy(this.storedTree),n=t.nodes.find(x=>x.id===this.nodeId);if(!n)throw Error('Missing node');
    const used=new Set(t.nodes.filter(x=>x.id!==n.id).map(x=>x.perkId).filter(Boolean));
    const perks=this._worldPerks(t).filter(i=>!used.has(sourceFlag(i).sourceId));
    if(!perks.length)throw Error('No unused perks of the right type in this world. Import perks through General Manager first.');
    const f=await input('Assign perk',`<div class="ag-form-grid agst-dialog"><label class="ag-field">Perk<select name="perk">${perks.map(i=>{const id=sourceFlag(i).sourceId;
      return `<option value="${escape(id)}" ${id===n.perkId?'selected':''}>${escape(i.name)}</option>`;}).join('')}</select></label>
      <p>The node takes its name, text, picture and point cost from the perk. Position and prerequisites stay as they are.</p></div>`,'Assign');
    if(!f?.perk)return;
    const doc=perkDoc(f.perk);if(!doc)throw Error('That perk is no longer in this world');
    n.perkId=f.perk;n.perkUuid=doc.uuid;
    await this._saveEdited(t);notify(`Node now gives ${doc.name}.`);
  }
  async _editNode(){
    if(!game.user.isGM||!this.editMode||!this.storedTree||!this.nodeId)throw Error('Choose a node while editing');
    const t=copy(this.storedTree),n=t.nodes.find(x=>x.id===this.nodeId);if(!n)throw Error('Missing node');
    const shown=resolved(t),nameOf=id=>shown.nodes.find(x=>x.id===id)?.name??'Unnamed perk',others=t.nodes.filter(x=>x.id!==n.id);
    const groups=Math.max(3,n.requiresAny.length+1);
    const reqOf=id=>n.requiresAll.includes(id)?'all':(i=>i>=0?`any${i+1}`:'none')(n.requiresAny.findIndex(g=>g.includes(id)));
    const opts=id=>['none','all',...Array.from({length:groups},(_,i)=>`any${i+1}`)].map(v=>`<option value="${v}" ${reqOf(id)===v?'selected':''}>${v==='none'?'—':v==='all'?'Required':`OR group ${v.slice(3)}`}</option>`).join('');
    const rowOf=i=>{const x=others[i];return `<tr><th scope="row">${escape(nameOf(x.id))}</th><td><select name="req_${i}" aria-label="${escape(nameOf(x.id))} as a prerequisite">${opts(x.id)}</select></td>
      <td><input type="checkbox" name="ex_${i}" aria-label="Cannot be taken with ${escape(nameOf(x.id))}" ${n.excludes.includes(x.id)?'checked':''}></td></tr>`;};
    const custom=!n.perkId;
    // 0.20.0: the node's own fields first, then the other nodes grouped by tier (one <tbody> each); labelled status options.
    const bands=tierBands(t.tiers,0),need=new Map(shown.nodes.map(x=>[x.id,x.requiredLevel]));
    const tierGroups=prereqGroups(others.map(x=>({id:x.id,name:nameOf(x.id),x:x.x,y:x.y,requiredLevel:need.get(x.id)})),bands);
    const body=tierGroups.map(g=>`<tbody>${g.label?`<tr class="agst-group-row"><th scope="rowgroup" colspan="3">${escape(g.label)}</th></tr>`:''}${g.nodes.map(x=>rowOf(others.findIndex(o=>o.id===x.id))).join('')}</tbody>`).join('');
    const sel=(name,labels,value)=>`<select name="${name}">${Object.entries(labels).map(([k,label])=>`<option value="${k}" ${value===k?'selected':''}>${escape(label)}</option>`).join('')}</select>`;
    const f=await input(`Edit node • ${nameOf(n.id)}`,`<div class="ag-form-grid agst-dialog">
      ${custom?`<div class="ag-notice ag-notice--warn"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>Older custom node with no perk: it records an unlock but gives no Item. Use <strong>Assign perk</strong> to turn it into a perk node.</span></div>
        <label class="ag-field">Name<input name="name" value="${escape(n.name)}" maxlength="120"></label>
        <label class="ag-field">Description<textarea name="description" rows="3">${escape(n.description)}</textarea></label>
        <label class="ag-field">Point cost<input type="number" name="cost" min="1" max="100" value="${n.cost??1}"></label>`
        :`<p>Perk: <strong>${escape(perkDoc(n.perkId)?.name||nameOf(n.id))}</strong>. Name, text, picture and point cost come from the perk.</p>`}
      <label class="ag-field">Status${sel('status',NODE_STATUS_LABELS,n.status)}</label>
      <label class="ag-field">Visibility${sel('visibility',NODE_VISIBILITY_LABELS,n.visibility)}</label>
      <label class="ag-field">Display${sel('display',NODE_DISPLAY_LABELS,n.display)}</label>
      <p class="agst-help">A placeholder is always GM-only; the editor enforces this even if other fields are selected.</p>
      ${others.length?`<div class="ag-table-wrap"><table class="ag-table"><caption>Before this node can be unlocked</caption><thead><tr><th scope="col">Node</th><th scope="col">Needed?</th><th scope="col">Cannot be taken with</th></tr></thead>${body}</table></div>
      <p class="agst-help"><strong>Required</strong>: every one is needed. <strong>OR group</strong>: any one node of that group is enough (each group must be met).</p>`:''}</div>`);
    if(!f)return;
    if(custom){n.name=String(f.name??'').trim();n.description=String(f.description??'');n.cost=Number(f.cost);}
    const any=new Map();n.requiresAll=[];n.excludes=[];
    others.forEach((x,i)=>{
      const v=String(f[`req_${i}`]??reqOf(x.id));
      if(v==='all')n.requiresAll.push(x.id);
      else if(/^any\d+$/.test(v)){const g=Number(v.slice(3));any.set(g,[...(any.get(g)??[]),x.id]);}
      if(checked(f[`ex_${i}`]))n.excludes.push(x.id);
    });
    n.requiresAny=[...any.keys()].sort((a,b)=>a-b).map(k=>any.get(k));
    n.status=f.status;n.visibility=f.status==='placeholder'?'gm':f.visibility;n.display=f.status==='placeholder'?'hidden':f.display;
    await this._saveEdited(t);notify('Node updated.');
  }
  /** Node size, canvas background and level/tier bands. GM editor only; images are picked with Foundry's FilePicker. */
  async _appearance(){
    if(!game.user.isGM||!this.editMode||!this.storedTree)throw Error('GM editor only');
    const t=copy(this.storedTree),bg=t.background??{},tiers=asArray(t.tiers);
    const FP=foundry.applications?.apps?.FilePicker?.implementation??globalThis.FilePicker;
    const row=x=>`<tr class="agst-tier-row"><td><input type="number" name="tierLevel" min="1" max="99" value="${escape(x.level??'')}" aria-label="Level"></td>
      <td><input name="tierLabel" maxlength="40" value="${escape(x.label??'')}" placeholder="Optional name" aria-label="Tier name"></td>
      <td><input type="number" name="tierY" min="0" max="6000" step="10" value="${escape(x.y??'')}" aria-label="Starts at (px from top)"></td>
      <td class="agst-pick"><input name="tierIcon" value="${escape(x.icon??'')}" placeholder="No icon" aria-label="Icon file"><button type="button" class="ag-btn ag-btn--sm" data-pick="tierIcon">Browse</button></td>
      <td><button type="button" class="ag-btn ag-btn--sm ag-btn--ghost ag-btn--icon" data-del-tier aria-label="Remove tier" data-tooltip="Remove tier" data-tooltip-class="ag-tooltip"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></td></tr>`;
    const content=`<div class="ag-form-grid agst-dialog agst-appearance">
      <label class="ag-field">Node size<select name="nodeSize">${Object.keys(NODE_SIZES).map(k=>`<option value="${k}" ${nodeSizeOf(t)===k?'selected':''}>${k==='compact'?'Compact (default; best for tall trees)':'Normal'}</option>`).join('')}</select></label>
      <fieldset><legend>Canvas background</legend>
        <label class="ag-field">Image<span class="agst-pick"><input name="bgImage" value="${escape(bg.image??'')}" placeholder="No background"><button type="button" class="ag-btn ag-btn--sm" data-pick="bgImage">Browse</button></span></label>
        <label class="ag-field">Fit<select name="bgFit">${BG_FITS.map(k=>`<option value="${k}" ${(bg.fit??'cover')===k?'selected':''}>${{cover:'Cover (fill the tree)',tile:'Tile (repeat)',fixed:'Fixed (stays put while scrolling)'}[k]}</option>`).join('')}</select></label>
        <label class="ag-field">Opacity <output data-opacity>${Math.round((bg.opacity??.35)*100)}%</output><input type="range" name="bgOpacity" min="5" max="100" step="5" value="${Math.round((bg.opacity??.35)*100)}"></label>
      </fieldset>
      <fieldset><legend>Level / tier bands</legend>
        <p class="agst-help">A band starts at the position (pixels from the top) and runs to the next band. The icon shows behind the level badge; with no icon a built-in one is used. Players see bands and icons.</p>
        <div class="ag-table-wrap"><table class="ag-table"><thead><tr><th scope="col">Level</th><th scope="col">Name</th><th scope="col">Starts at</th><th scope="col">Icon</th><th scope="col"><span class="ag-sr-only">Remove</span></th></tr></thead><tbody data-tiers>${tiers.map(row).join('')}</tbody></table></div>
        <button type="button" class="ag-btn ag-btn--sm" data-add-tier><i class="fa-solid fa-plus" aria-hidden="true"></i> Add tier</button>
      </fieldset></div>`;
    const wire=(event,dialog)=>{
      const el=dialog.element,body=el.querySelector('[data-tiers]');
      el.addEventListener('click',e=>{
        const pick=e.target.closest('[data-pick]');
        if(pick){const field=pick.parentElement.querySelector(`input[name="${pick.dataset.pick}"]`);
          new FP({type:'image',current:field.value,callback:path=>{field.value=path;}}).render(true);return;}
        if(e.target.closest('[data-add-tier]')){
          if(body.children.length>=MAX_TIERS)return;
          const last=[...body.querySelectorAll('[name="tierLevel"]')].map(i=>Number(i.value)||0),ys=[...body.querySelectorAll('[name="tierY"]')].map(i=>Number(i.value)||0);
          body.insertAdjacentHTML('beforeend',row({level:Math.max(0,...last)+1,y:ys.length?Math.max(...ys)+300:0}));return;}
        if(e.target.closest('[data-del-tier]'))e.target.closest('tr').remove();
      });
      el.addEventListener('input',e=>{if(e.target.name==='bgOpacity')el.querySelector('[data-opacity]').textContent=`${e.target.value}%`;});
    };
    const read=(event,button)=>{const fd=new FormData(button.form);
      return appearanceFromForm({nodeSize:fd.get('nodeSize'),bgImage:fd.get('bgImage'),bgFit:fd.get('bgFit'),bgOpacity:fd.get('bgOpacity'),
        tierLevel:fd.getAll('tierLevel'),tierLabel:fd.getAll('tierLabel'),tierY:fd.getAll('tierY'),tierIcon:fd.getAll('tierIcon')});};
    const out=await DialogV2.wait({classes:['ag-app','ag-dialog'],window:{title:'Tree appearance'},content,render:wire,rejectClose:false, // ag-lint-allow: custom dialog, has ag-dialog classes
      buttons:[{action:'cancel',label:'Cancel',callback:()=>null},{action:'ok',label:'Save',default:true,callback:read}]});
    if(!out)return;
    if(out.errors.length)throw Error(out.errors[0]);
    t.nodeSize=out.nodeSize;
    if(out.background)t.background=out.background;else delete t.background;
    if(out.tiers.length)t.tiers=out.tiers;else delete t.tiers;
    await this._saveEdited(t);notify('Appearance saved and player snapshot refreshed.');
  }
  /** Move node…: exact position for the selected node (keyboard alternative to dragging, with the arrow keys). */
  async _moveNodeDialog(){
    if(!game.user.isGM||!this.editMode||this.playerPreview||!this.storedTree||!this.nodeId)throw Error('Choose a node while editing');
    const n=this.storedTree.nodes.find(x=>x.id===this.nodeId);if(!n)throw Error('Missing node');
    const name=this.tree?.nodes.find(x=>x.id===n.id)?.name??'this node';
    const f=await input(`Move ${name}`,`<div class="ag-form-grid agst-dialog">
      <label class="ag-field">From the left (px)<input type="number" name="x" min="0" max="6000" step="10" value="${escape(n.x)}"></label>
      <label class="ag-field">From the top (px)<input type="number" name="y" min="0" max="6000" step="10" value="${escape(n.y)}"></label>
      <p class="agst-help">Positions snap to 10 px. Tip: focus a node on the canvas and use the arrow keys (Shift for 50 px).</p></div>`,'Move node');
    if(!f)return;
    await this._moveNode(n.id,Number(f.x),Number(f.y));this._refocus=true;
  }
  async _removeNode(){
    if(!game.user.isGM||!this.editMode||!this.tree||!this.nodeId)throw Error('GM editor only');
    const t=copy(this.storedTree),n=t.nodes.find(n=>n.id===this.nodeId);
    if(!n)throw Error('Missing node');
    if(allProgressFor(t).some(a=>a.unlocks.includes(n.id)))throw Error('Purchased node cannot be deleted');
    if(!await confirmDanger(`Remove ${this.tree?.nodes.find(x=>x.id===n.id)?.name??'this node'} and its connections from this tree? The perk Item itself is not deleted.`,{title:'Remove this node?',yes:'Remove node'}))return;
    t.nodes=t.nodes.filter(x=>x.id!==n.id);
    for(const x of t.nodes){x.requiresAll=x.requiresAll.filter(id=>id!==n.id);x.requiresAny=x.requiresAny.map(g=>g.filter(id=>id!==n.id)).filter(g=>g.length);x.excludes=x.excludes.filter(id=>id!==n.id);}
    await this._saveEdited(t);this.nodeId=null;notify('Node removed from layout only.');
  }
  async _linkTo(targetId){
    if(!this.tree||!this.editMode||!this.linkFrom)return;
    const t=copy(this.storedTree),source=t.nodes.find(x=>x.id===this.linkFrom),target=t.nodes.find(x=>x.id===targetId);
    if(!source||!target||source.id===target?.id)throw Error('Select a different node');
    target.requiresAll=[...new Set([...target.requiresAll,source.id])];
    await this._saveEdited(t);this.linkFrom=null;this.nodeId=targetId;notify('Prerequisite connection added.');this.render();
  }
  async _undo(){
    if(!game.user.isGM||!this.editMode||!this.undo.length)return;
    const record=this.undo.pop(),current=readPrivate();const present=current.find(t=>t.id===record.treeId);
    if(!present)return;
    await saveTrees(current.map(t=>t.id===record.treeId?record.tree:t));this.redo.push({treeId:record.treeId,tree:present});notify('Undo applied.');
  }
  async _redo(){
    if(!game.user.isGM||!this.editMode||!this.redo.length)return;
    const record=this.redo.pop(),current=readPrivate();const present=current.find(t=>t.id===record.treeId);
    if(!present)return;
    await saveTrees(current.map(t=>t.id===record.treeId?record.tree:t));this.undo.push({treeId:record.treeId,tree:present});notify('Redo applied.');
  }
  async _grant(){
    if(!game.user.isGM||!this.actor||!this.tree)throw Error('Choose tree and Actor');
    if(this.tree.provider.kind==='profession')throw Error('Profession XP/points belong to the Ledger');
    // One prompt (0.20.0): the action button names the amount, so there is no second "Are you sure?".
    const f=await input('Award progression points',`<div class="ag-form-grid agst-dialog"><p><strong>${escape(this.actor.name)}</strong> · ${escape(this.tree.name)}</p>
      <label class="ag-field">Award label (unique per Actor/track)<input name="label" maxlength="100" value="Milestone ${readProgress(this.actor,this.tree).grants.length+1}"></label>
      <label class="ag-field">Points to award<input type="number" min="1" max="${this.tree.provider.kind==='cinder_milestone'?'1':'100'}" name="amount" value="1"></label>
      <p>Cinder: one point per uniquely labeled manifestation/milestone, ${CINDER_MAX_POINTS} lifetime points maximum. GM only.</p></div>`,awardLabel(1),{render:(_event,dialog)=>{
        const el=dialog?.element,amount=el?.querySelector?.('[name="amount"]'),button=el?.querySelector?.('[data-action="ok"]');
        amount?.addEventListener('input',()=>{if(button)button.textContent=awardLabel(Number(amount.value));});}});
    if(!f)return;
    const a=readProgress(this.actor,this.tree),next=grantPoints(this.tree,a,Number(f.amount),String(f.label??''));
    await persistAccount(this.actor,this.tree,next);notify(`${awardLabel(Number(f.amount)).replace('Award','Awarded')} to ${this.actor.name}.`);
  }
  async _purchase(){
    if(!game.user.isGM||!this.tree||!this.actor||!this.nodeId)throw Error('GM and Actor selection required');
    const actor=this.actor,t=this.tree,n=t.nodes.find(x=>x.id===this.nodeId);
    if(!n)throw Error('Missing private node');
    const ok=availability(t,readProgress(actor,t),n.id,{level:professionLevel(actor,t),siblings:privateSiblings(actor,t)});if(!ok.ok)throw Error(ok.reason);
    if(!await confirm(`Spend ${plural(ok.cost,'point')} and unlock ${n.name} for ${actor.name}?\n${n.perkId?'The perk is added to the character sheet.':'This older custom node has no perk, so nothing is added to the sheet.'}`,{title:'Unlock this perk?',yes:'Unlock perk'}))return;
    const {item}=await unlockNode(actor,t.id,n.id);
    notify(item?`${n.name} unlocked and added to ${actor.name}.`:`${n.name} unlocked (no perk Item: custom node).`);
  }
  async _request(){
    if(game.user.isGM||!this.tree||!this.actor||!this.nodeId)throw Error('Select an available perk');
    const actor=this.actor;if(!actor.isOwner)throw Error('You do not own the selected character');
    const n=this.tree.nodes.find(x=>x.id===this.nodeId);
    const ok=publicAvailability(this.tree,readProgress(actor,this.tree),n?.id,{level:professionLevel(actor,this.tree),siblings:walletSiblings(actor,this.tree),
      access:await accessCheck(actor,this.tree),accessLabel:proficiencyLabel});
    if(!ok.ok)throw Error(ok.reason);
    if(!await confirm(`Spend ${plural(n.cost??1,'point')} to unlock ${n.name} for ${actor.name}?\nThe perk is added to the character sheet. Only the GM can undo it.`,{title:'Unlock this perk?',yes:'Unlock perk'}))return;
    const result=await requestUnlock(actor,this.tree.id,n.id);
    notify(result.message);
  }
  async _refund(){
    if(!game.user.isGM||!this.tree||!this.actor||!this.nodeId)throw Error('GM, character and node required');
    const actor=this.actor,n=this.tree.nodes.find(x=>x.id===this.nodeId);if(!n)throw Error('Missing node');
    const items=grantedItems(actor,this.tree,n.id).map(i=>i.name);
    let reason='';
    if(this.tree.provider.kind==='profession'){
      const f=await input('Remove perk',`<div class="ag-form-grid agst-dialog"><p>Remove <strong>${escape(n.name)}</strong> from ${escape(actor.name)}?</p><p>The point goes back to the character${items.length?` and <strong>${items.map(escape).join(', ')}</strong> is removed from the sheet`:''}. Recorded in the history.</p>
        <label class="ag-field">Reason (optional)<input name="reason" maxlength="200" placeholder="Player asked to swap perks"></label></div>`,'Remove perk');
      if(!f)return;reason=String(f.reason??'');
    }else if(!await confirmDanger(`Refund ${n.name} for ${actor.name}?\nThe points go back to the character${items.length?` and ${items.join(', ')} is removed from the sheet`:''}.`,{title:'Refund this perk?',yes:'Refund points'}))return;
    const {removed}=await refundNode(actor,this.tree.id,n.id,{reason});
    notify(`Refunded ${n.name}${removed.length?`; removed ${removed.join(', ')} from ${actor.name}`:''}.`);
  }
  async _override(){
    if(!game.user.isGM||!this.tree||!this.actor||!this.nodeId)throw Error('GM, character and node required');
    const actor=this.actor,t=this.tree,n=t.nodes.find(x=>x.id===this.nodeId);if(!n)throw Error('Missing node');
    const check=availability(t,readProgress(actor,t),n.id,{level:professionLevel(actor,t),siblings:privateSiblings(actor,t)});
    const f=await input('Grant perk (GM override)',`<div class="ag-form-grid agst-dialog"><p>Give <strong>${escape(n.name)}</strong> to ${escape(actor.name)} as a GM override.</p>
      ${check.ok?'<p>The normal rules allow this pick.</p>':`<div class="ag-notice ag-notice--warn"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>Overrides: ${escape(check.reason)}.</span></div>`}
      <p>It uses 1 point and is kept at the current level, so it does not flag the character for review. Recorded in the history.</p>
      <label class="ag-field">Reason (required)<input name="reason" maxlength="200" required placeholder="Story reward"></label></div>`,'Grant perk');
    if(!f)return;
    const {item}=await overrideNode(actor,t.id,n.id,{reason:String(f.reason??'')});
    notify(`${n.name} granted to ${actor.name}${item?' and added to the sheet':''}.`);
  }
  /**
   * One dialog for an over-allocated character: Keep or Remove for each flagged perk (Keep preselected).
   * 0.21.0: a profession with several trees is reviewed as one wallet, so the rows cover all of its trees.
   */
  async _resolve(){
    if(!game.user.isGM||!this.tree||!this.actor)throw Error('GM and character required');
    const actor=this.actor,t=this.tree,level=professionLevel(actor,t);
    const group=t.provider.kind==='profession'?professionTrees(t.sourceRef,readPrivate()).map(resolved):[t];
    const many=group.length>1;
    const rows=group.flatMap(x=>reviewCandidates(x,readProgress(actor,x),level,privateSiblings(actor,x)).map(r=>({...r,treeId:x.id,treeName:x.name})));
    if(!rows.length){notify(`${actor.name} has nothing to review on ${t.name}.`);return;}
    const st=professionStatus(t,readProgress(actor,t),level,privateSiblings(actor,t));
    const where=many?`${group.length} trees of this profession (one shared wallet)`:t.name;
    const f=await input(`Review ${actor.name}`,`<div class="ag-form-grid agst-dialog"><p><strong>${escape(actor.name)}</strong> · ${escape(where)} · level ${escape(level)}: ${st.spent} of ${st.earned} points used.</p>
      <p>Keep: the perk stays and still uses its point. Remove: the perk leaves the sheet and its point comes back (undo is in the History).</p>
      <div class="ag-table-wrap"><table class="ag-table"><thead><tr><th scope="col">Perk</th>${many?'<th scope="col">Tree</th>':''}<th scope="col">Needs</th><th scope="col">Keep</th><th scope="col">Remove</th></tr></thead><tbody>
      ${rows.map((r,i)=>`<tr><th scope="row">${escape(r.name)}</th>${many?`<td>${escape(r.treeName)}</td>`:''}<td>level ${escape(r.threshold)}${r.aboveLevel?' <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span class="ag-sr-only"> above the current level</span>':''}</td>
        <td><input type="radio" name="${many?`r-${i}`:`n-${escape(r.nodeId)}`}" value="keep" checked aria-label="Keep ${escape(r.name)}"></td>
        <td><input type="radio" name="${many?`r-${i}`:`n-${escape(r.nodeId)}`}" value="remove" aria-label="Remove ${escape(r.name)}"></td></tr>`).join('')}
      </tbody></table></div><label class="ag-field">Reason (optional)<input name="reason" maxlength="200" placeholder="XP corrected"></label></div>`,'Apply');
    if(!f)return;
    const removed=(r,i)=>f[many?`r-${i}`:`n-${r.nodeId}`]==='remove';
    let kept=0,gone=0,off=[],status=null;
    for(const x of group){
      const mine=rows.map((r,i)=>({r,i})).filter(({r})=>r.treeId===x.id);if(!mine.length)continue;
      const remove=mine.filter(({r,i})=>removed(r,i)).map(({r})=>r.nodeId),keep=mine.filter(({r,i})=>!removed(r,i)).map(({r})=>r.nodeId);
      const out=await resolveNodes(actor,x.id,{remove,keep,reason:String(f.reason??'')});
      kept+=out.kept.length;gone+=remove.length;off.push(...out.removed);status=out.status;
    }
    const still=professionStatus(t,readProgress(actor,t),level,privateSiblings(actor,t)).overAllocated||Boolean(status?.overAllocated);
    notify(`${actor.name}: kept ${kept}, removed ${gone}${off.length?` (${off.join(', ')} off the sheet)`:''}.${still?' Still needs review.':''}`,still);
  }
  async _undoHistory(entryId){
    if(!game.user.isGM||!this.tree||!this.actor)throw Error('GM and character required');
    const actor=this.actor,entry=readProgress(actor,this.tree).history.find(h=>h.id===entryId);if(!entry)throw Error('That change is no longer in the history');
    const node=this.tree.nodes.find(n=>n.id===entry.nodeId)?.name??entry.nodeId;
    // Plain text: confirmDialog escapes the message itself (no markup, no pre-escaping).
    const what={allocate:`take back the pick of ${node} (the perk leaves the sheet, the point returns)`,override:`take back the GM grant of ${node} (the perk leaves the sheet)`,
      remove:`put ${node} back${entry.itemSnapshot?' exactly as it was on the sheet':' (a fresh copy of the perk)'}`,keep:`stop keeping ${node} (it may be flagged for review again)`}[entry.kind];
    if(!await confirmDanger(`Undo for ${actor.name}: ${what}?`,{title:'Undo this change?',yes:'Undo change'}))return;
    const r=await undoHistory(actor,this.tree.id,entryId);
    notify(`Undone: ${r.node}${r.restored?` restored to ${actor.name}`:''}${r.removed.length?`; removed ${r.removed.join(', ')}`:''}.`);
  }
  async _ledgerImport(){
    if(!game.user.isGM)throw Error('GM only');
    const {rows}=await importLedgerChoices({apply:false});
    if(!rows.length){notify('No Profession Ledger perk choices to import (none saved, or no profession tree has them).');return;}
    const todo=rows.filter(r=>r.action==='add'||r.action==='adopt');
    const table=rows.map(r=>`<tr><td>${escape(r.actorName)}</td><td>${escape(r.treeName)}</td><td>${escape(r.name??'A perk')}</td><td>${escape(r.reason)}</td></tr>`).join('');
    const intro=`Profession Ledger perk choices found. Nothing has been changed yet. ${todo.length} will be allocated; the Ledger keeps its own record untouched. Safe to run again.`;
    if(!todo.length){
      await infoDialog('Nothing to import',`<p>${escape(intro)}</p><div class="ag-table-wrap"><table class="ag-table"><thead><tr><th scope="col">Character</th><th scope="col">Tree</th><th scope="col">Perk</th><th scope="col">What happens</th></tr></thead><tbody>${table}</tbody></table></div>`);
      return;
    }
    const lines=rows.map(r=>`${r.actorName} · ${r.treeName} · ${r.name??'A perk'}: ${r.reason}`).join('\n');
    if(!await confirm(`${intro}\n${lines}`,{title:'Import Ledger perk choices?',yes:'Import choices'}))return;
    const {applied,failed}=await importLedgerChoices({apply:true});
    if(failed.length)throw Error(`Imported ${applied.length}; ${failed.length} failed: ${failed.slice(0,4).join('; ')}`);
    notify(`Imported ${plural(applied.length,'Ledger perk choice')}. Characters above their level are flagged for review.`);
  }
  async _keep(){
    if(!game.user.isGM||!this.tree||!this.actor||!this.nodeId)throw Error('GM, character and node required');
    const actor=this.actor,n=this.tree.nodes.find(x=>x.id===this.nodeId);if(!n)throw Error('Missing node');
    const f=await input('Keep perk',`<div class="ag-form-grid agst-dialog"><p>Keep <strong>${escape(n.name)}</strong> on ${escape(actor.name)} although it needs level ${escape(n.requiredLevel)}?</p>
      <p>It still uses its point, so new picks wait until the level gives enough points. If the level drops further it is flagged again.</p>
      <label class="ag-field">Reason (optional)<input name="reason" maxlength="200"></label></div>`,'Keep perk');
    if(!f)return;
    await keepNode(actor,this.tree.id,n.id,{reason:String(f.reason??'')});
    notify(`${n.name} kept for ${actor.name}.`);
  }
  async _resetTree(){
    if(!game.user.isGM||!this.tree||!this.actor)throw Error('GM and character required');
    const actor=this.actor,acc=readProgress(actor,this.tree);
    if(!await confirmDanger(`Reset ${this.tree.name} for ${actor.name}?\nAll ${plural(acc.unlocks.length,'unlock')} are refunded and the perks this tree gave are removed from the sheet. Points awarded stay.`,{title:'Reset this tree?',yes:'Reset tree'}))return;
    const {removed}=await resetTreeFor(actor,this.tree.id);
    notify(`Reset ${this.tree.name} for ${actor.name}; removed ${plural(removed.length,'perk Item')}.`);
  }
  async _giveMissing(){
    if(!game.user.isGM)throw Error('GM only');
    if(!await confirm('Add the perk Item to every character that has an unlocked perk node but no matching Item on the sheet (for example, unlocks made before Skill Trees 0.8.0)?\nNothing is removed. Safe to run again.',{title:'Give missing perks?',yes:'Give missing perks'}))return;
    const {given,failed}=await giveMissingPerks();
    if(failed.length)throw Error(`Gave ${given.length}; ${failed.length} failed: ${failed.slice(0,4).join('; ')}`);
    notify(given.length?`Gave ${plural(given.length,'perk Item')}: ${given.slice(0,6).join('; ')}`:'Nothing missing: every unlocked perk is on its sheet.');
  }
  /** Export all GM layouts, or one (the row's tree; the selected tree when no id is given). */
  _export(all,treeId=null){
    if(!game.user.isGM)throw Error('GM only');
    const one=treeId?readPrivate().find(t=>t.id===treeId)??null:this.storedTree;
    const trees=all?readPrivate():[one].filter(Boolean);
    if(!trees.length)throw Error('No tree selected');
    download(all?'AG_Skill_Trees_GM_Layouts.json':`AG_Skill_Tree_${trees[0].id}.json`,{schema:SCHEMA,exportedAt:new Date().toISOString(),status:'prototype_not_canonical',trees});
  }
  _backupProgress(){
    if(!game.user.isGM)throw Error('GM only');
    download('AG_Skill_Tree_Actor_Progress_v02_BACKUP.json',{
      schema:'ag-skill-trees-progress/0.2',createdAt:new Date().toISOString(),
      actors:(game.actors?.contents??[]).map(a=>({actorId:a.id,actorName:a.name,progress:copy(safeFlag(a,'progressV2')??{})})),
      note:'GM backup only. It is not restored automatically.'});notify('GM Actor progress backup downloaded.');
  }
  async _legacyPreview(){
    if(!game.user.isGM)throw Error('GM only');
    const old=asArray(game.settings.get(MODULE,'treeData')?.trees);if(!old.length)throw Error('No legacy v0.1 trees found');
    if(!gmPrivate())throw Error('Initialize GM storage first');
    const candidates=old.filter(t=>!readPrivate().some(v=>v.id===t.id));
    if(!await confirm(`Legacy v0.1 contains ${old.length} trees; ${candidates.length} can be migrated into new GM-only hidden draft layouts.\nOld Stage rules and UUID Item rewards are not imported as working mechanics. Actor progress stays in its v0.1 flags and is not migrated. The original setting is not cleared by this action.\nBack up your world before proceeding.`,{title:'Migrate legacy trees?',yes:'Migrate trees'}))return;
    const migration=candidates.map(t=>normalizeTree({
      id:t.id,name:t.name,description:'Migrated layout from v0.1; all content requires re-review before release.',
      status:'draft',visibility:'gm',sourceRef:/^PROF-/.test(t.sourceId??'')?t.sourceId:null,
      provider:/^PROF-/.test(t.sourceId??'')?{kind:'profession'}:{kind:'generic_points',maxPoints:10},
      nodes:asArray(t.nodes).map(n=>({id:n.id,name:n.name,x:n.x,y:n.y,description:'Legacy: verify original source',cost:1,
        requiresAll:n.prerequisiteMode==='all'?asArray(n.prerequisites):[],
        requiresAny:n.prerequisiteMode==='all'||!asArray(n.prerequisites).length?[]:[asArray(n.prerequisites)],
        excludes:asArray(n.excludes),status:'draft',visibility:'gm',display:'hidden',contentRef:null,sourceUuid:null}))}));
    download('AG_Skill_Trees_v01_Legacy_Backup.json',game.settings.get(MODULE,'treeData'));
    await saveTrees([...readPrivate(),...migration]);notify(`${migration.length} legacy layouts imported as hidden drafts. Original v0.1 setting remains until you clear it.`);
  }
  async _legacyClear(){
    if(!game.user.isGM)throw Error('GM only');
    const old=game.settings.get(MODULE,'treeData');if(!asArray(old?.trees).length)return notify('No legacy setting to clear');
    if(!await confirmDanger(`Privacy cleanup: download a backup and clear the legacy v0.1 world setting which may be visible to players.\nThis leaves any old v0.1 Actor flags untouched. Only do this after your layout migration is reviewed.`,{title:'Clear the legacy public setting?',yes:'Back up and clear'}))return;
    download('AG_Skill_Trees_v01_Legacy_Backup_BEFORE_CLEAR.json',old);
    await game.settings.set(MODULE,'treeData',{schema:'ag-skill-trees/0.1',trees:[]});notify('Legacy setting cleared; backup downloaded.');
  }
  async _dropped(event){
    if(!game.user.isGM||!this.editMode||this.playerPreview||!this.tree)return;
    event.preventDefault();
    try{
      // ag-item-drop/1: any Foundry Item drag (sidebar, perk list, Manager Browse); folders and non-Items are refused with a warning.
      const dropped=await resolveItemDrop(readDrop(event));
      if(!dropped.ok)return ui.notifications.warn(`Perk drop: ${dropped.reason}`);
      const doc=dropped.items[0];
      const board=this.element.querySelector('.agst-board'),rect=board.getBoundingClientRect();
      const x=Math.round(Math.max(0,Math.min(6000,(event.clientX-rect.left)/this.zoom-NODE_SIZES[nodeSizeOf(this.tree)].w/2))/10)*10;
      const y=Math.round(Math.max(0,Math.min(6000,(event.clientY-rect.top)/this.zoom-NODE_SIZES[nodeSizeOf(this.tree)].h/2))/10)*10;
      await this._addPerkNode(doc,x,y);this.render();
    }catch(e){console.error(e);notify(`Perk drop: ${e.message}`,true);}
  }
  /** Drag empty canvas with the mouse to pan (touch and wheel already scroll the viewport). */
  _panStart(event){
    const viewport=this.element.querySelector('.agst-viewport');if(!viewport||event.pointerType!=='mouse'||event.button!==0)return;
    if(event.target.closest('.agst-node'))return;
    const x=event.clientX,y=event.clientY,left=viewport.scrollLeft,top=viewport.scrollTop;
    viewport.classList.add('agst-panning');
    const move=e=>{viewport.scrollLeft=left-(e.clientX-x);viewport.scrollTop=top-(e.clientY-y);};
    const stop=()=>{viewport.classList.remove('agst-panning');window.removeEventListener('pointermove',move);};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',stop,{once:true});
  }
  _pointerDown(event){
    if(!event.target.closest('.agst-node'))return this._panStart(event);
    if(!game.user.isGM||!this.editMode||this.playerPreview||event.button!==0)return;
    const target=event.target.closest('.agst-node');if(!target||!this.tree)return;
    const id=target.dataset.id,original=this.tree.nodes.find(n=>n.id===id);if(!original)return;
    const startX=event.clientX,startY=event.clientY;let moved=false;
    const move=e=>{
      const dx=(e.clientX-startX)/this.zoom,dy=(e.clientY-startY)/this.zoom;
      if(Math.hypot(dx,dy)>4)moved=true;
      if(!moved)return;
      target.style.left=`${Math.max(0,Math.min(6000,original.x+dx))}px`;
      target.style.top=`${Math.max(0,Math.min(6000,original.y+dy))}px`;
      // Edges (and their arrowheads and labels) follow the node live. Positions are saved on pointer-up.
      this._redrawEdges(id);
    };
    const stop=async e=>{
      window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);
      if(!moved)return;
      try{await this._moveNode(id,original.x+(e.clientX-startX)/this.zoom,original.y+(e.clientY-startY)/this.zoom);}catch(error){notify(error.message,true);}
      this.render();
    };
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',stop,{once:true});
  }
}

function addDirectoryLauncher(app,html){
  return mountLauncher(launcherRoot(app,html),{moduleId:MODULE,label:'Skill Trees',icon:'fa-solid fa-diagram-project',
    onClick:()=>{try{open();}catch(error){notify(error.message,true);}},visible:canOpenTrees()});
}
/** Owners and GMs of an Actor (chat whisper recipients). */
const ownerIds=(actor,{gmOnly=false}={})=>[...new Set((game.users?.contents??[]).filter(u=>u.isGM||(!gmOnly&&actor.testUserPermission?.(u,'OWNER')===true)).map(u=>u.id))];
const openButton=(actor,tree,label,{resolve=false}={})=>`<button type="button" class="ag-btn ag-btn--sm" data-agst-open-tree data-actor-id="${escape(actor.id)}" data-tree-id="${escape(tree.id)}"${resolve?' data-agst-resolve="1"':''}><i class="fa-solid fa-diagram-project" aria-hidden="true"></i> ${escape(label)}</button>`;
/**
 * GM client, after the Ledger changes a profession's XP: tell the owner about new perk picks,
 * and tell the GM when a lower level leaves perks above it. Never changes any data.
 */
async function onProgressionChanged({actorId,profId,previousLevel,level}={}){
  refreshEmbeds(actorId);
  if(instance?.rendered)instance.render();
  if(!game.user?.isGM||game.users?.activeGM?.id!==game.user.id)return;
  const actor=game.actors?.get?.(actorId);if(!actor||isLevelBackup(actor)||!Number.isSafeInteger(level)||!Number.isSafeInteger(previousLevel)||level===previousLevel)return;
  // 0.21.0: one note per profession (its trees share one wallet), naming the profession's group when it has several trees.
  const group=professionGroups(professionTrees(profId,readPrivate()))[0];if(!group)return;
  const stored=group.trees.find(x=>project(x))??group.trees[0],t=resolved(stored);
  const st=professionStatus(t,readProgress(actor,stored),level,privateSiblings(actor,stored)),name=group.multi?group.name:t.name;
  const above=[...st.aboveLevel,...asArray(st.otherAboveLevel)];
  try{
    if(level>previousLevel&&!st.overAllocated&&st.available>0&&group.trees.some(x=>project(x))){
      const gained=level-previousLevel;
      await ChatMessage.create({speaker:{alias:'Skill Trees'},whisper:ownerIds(actor),
        content:`<div class="agst-chat"><p><strong>${escape(actor.name)}</strong>: ${gained} perk${gained===1?'':'s'} to choose in <strong>${escape(name)}</strong> (level ${level}; ${st.available} point${st.available===1?'':'s'} to spend${group.multi?` across ${group.trees.length} trees`:''}).</p>${openButton(actor,t,'Open Skill Tree')}</div>`});
    }
    if(level<previousLevel&&st.overAllocated){
      await ChatMessage.create({speaker:{alias:'Skill Trees'},whisper:ownerIds(actor,{gmOnly:true}),
        content:`<div class="agst-chat"><p><strong>${escape(actor.name)}</strong> needs review in <strong>${escape(name)}</strong>: level ${level} no longer covers ${above.length?escape(above.map(x=>x.name).join(', ')):`${st.overSpent} point${st.overSpent===1?'':'s'} used`}. Nothing was removed.</p>${openButton(actor,t,'Review',{resolve:true})}</div>`});
    }
  }catch(error){console.error(`[${MODULE}] Could not post the profession note`,error);}
}
function wireChatButtons(_message,html){
  const root=html?.querySelectorAll?html:html?.[0];
  root?.querySelectorAll?.('[data-agst-open-tree]')?.forEach(b=>b.addEventListener('click',event=>{
    event.preventDefault();
    try{open({actorId:b.dataset.actorId,treeId:b.dataset.treeId,resolve:b.dataset.agstResolve==='1'&&game.user.isGM});}catch(error){notify(error.message,true);}
  }));
}
/* ---- 0.14.0: embed API. A partner module (Character Hub) mounts a compact, character-scoped list of this character's
   trees: points, unlocked perks, perks available now (with the real Unlock), locked perks with the reason, and Open tree.
   Players see the published projection only; Unlock uses the same checks and GM-client request as the window. ---- */
const EMBED_MODES=new Set(['character']);
const embeds=new Set();
// Perk text as plain words, never cut (0.20.0): it wraps instead.
const shortText=x=>String(x??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
/** Why this user may not see the character's trees here, or '' (GM, or the Actor's owner, with Player Access on). */
function embedRefusal(actor){
  if(!canOpenTrees())return 'The GM has hidden Skill Trees.';
  if(!actor)return 'That character no longer exists.';
  if(isLevelBackup(actor))return LEVEL_BACKUP_REFUSAL;
  if(!hasOwner(actor))return `Only ${actor.name}'s owner and the GM can see this.`;
  return '';
}
/** One tree's rows for the embed. GM: the private tree resolved from world perks; players: the published projection. */
function embedTreeModel(actor,stored){
  const gm=game.user.isGM,t=gm?resolved(stored):stored,acc=readProgress(actor,stored),level=professionLevel(actor,stored);
  // 0.21.0: the profession's shared wallet, and (players) the tree's proficiency gate when the Ledger can check it.
  const siblings=walletSiblings(actor,stored),access=gm?null:accessCheckNow(actor,stored);
  const nodes=asArray(t.nodes).filter(n=>!n.silhouette).map(n=>{
    const unlocked=acc.unlocks.includes(n.id);
    const e=unlocked?{ok:false}:(gm?availability(t,acc,n.id,{level,siblings}):publicAvailability(t,acc,n.id,{level,siblings,access,accessLabel:proficiencyLabel}));
    return {id:n.id,name:n.name||'Unnamed',cost:n.cost??1,text:shortText(n.description),unlocked,available:!unlocked&&e.ok,reason:unlocked?'':String(e.reason??'')};
  });
  const spent=totalSpent(t,acc),profession=t.provider?.kind==='profession';
  const st=profession?professionStatus(t,acc,level,siblings):null;
  const earned=profession?(st.ledger?st.earned:null):acc.awarded,available=profession?(st.ledger?Math.max(0,st.available):null):Math.max(0,acc.awarded-spent);
  return {id:t.id,name:t.name||'Unnamed tree',profession,level:profession&&st.ledger?st.level:null,earned,spent:profession?st.spent:spent,available,nodes,
    ...(st?.trees?{sourceRef:t.sourceRef,wallet:sharedWalletKey(t),treeSpent:st.treeSpent}:{}),
    ...(profession&&accessLine(stored)?{access:accessLine(stored)}:{})};
}
/**
 * 0.21.0 embed data: the character's trees grouped by wallet. A profession with several trees is one group with the shared
 * wallet once ({shared:true, name, sourceRef, level, earned, spent, available, trees:[model…]}); every other tree is a group of one.
 */
function embedData(actor){
  const models=new Map(readSelectedTrees(false).map(t=>[t.id,embedTreeModel(actor,t)]));
  return professionGroups(readSelectedTrees(false)).map(g=>{
    const trees=g.trees.map(t=>({...models.get(t.id),label:g.members.find(m=>m.id===t.id)?.label??t.name}));
    const first=trees[0];
    return {key:g.key,shared:g.multi,name:g.name,sourceRef:g.sourceRef,kind:g.kind,profession:first.profession,
      level:first.level,earned:first.earned,spent:first.spent,available:first.available,trees};
  });
}
function embedHTML(ctrl){
  const actor=game.actors?.get?.(ctrl.actorId)??null,refusal=embedRefusal(actor);
  if(refusal)return `<div class="ag-empty"><p class="ag-empty__title">${escape(refusal)}</p></div>`;
  const groups=embedData(actor);
  const active=m=>m.nodes.some(n=>n.unlocked||n.available)||Number(m.earned)>0;
  const shown=groups.filter(g=>g.trees.some(active));
  const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
  // Kit parts (0.20.0): points as an ag-badge, unlocked perks as ok badges in an ag-chip-group row; no control inside <summary>.
  const pts=m=>m.available===null?'<span class="ag-badge">Points come from the Profession Ledger (not active)</span>'
    :`<span class="ag-badge${m.available?' ag-badge--accent':''}">${plural(m.available,'point')} to spend</span><span class="agst-embed__muted">${m.spent} of ${m.earned} spent${m.level!==null?` · level ${m.level}`:''}</span>`;
  const body=m=>{
    const unlocked=m.nodes.filter(n=>n.unlocked),avail=m.nodes.filter(n=>n.available),locked=m.nodes.filter(n=>!n.unlocked&&!n.available);
    return `<div class="agst-embed__actions"><button type="button" class="ag-btn ag-btn--sm" data-agst-embed="open" data-tree="${escape(m.id)}" aria-label="Open tree: ${escape(m.name)}">Open tree</button></div>
      ${m.access?`<p class="agst-embed__muted agst-embed__access">${escape(m.access)}</p>`:''}
      ${avail.length?`<h4>Available now</h4><ul class="agst-embed__list">${avail.map(n=>`<li><span class="agst-embed__name">${escape(n.name)}</span><span class="agst-embed__muted">${plural(n.cost,'point')}</span>
        <button type="button" class="ag-btn ag-btn--sm ag-btn--primary" data-agst-embed="unlock" data-tree="${escape(m.id)}" data-node="${escape(n.id)}" aria-label="Unlock ${escape(n.name)}">Unlock</button>${n.text?`<p class="agst-embed__text">${escape(n.text)}</p>`:''}</li>`).join('')}</ul>`:''}
      <h4>Unlocked</h4>${unlocked.length?`<ul class="ag-chip-group agst-embed__chips">${unlocked.map(n=>`<li class="ag-badge ag-badge--ok">${escape(n.name)}</li>`).join('')}</ul>`:'<p class="agst-embed__muted">None yet.</p>'}
      ${locked.length?`<details class="agst-embed__locked"><summary>Locked (${locked.length})</summary><ul class="agst-embed__list">${locked.map(n=>`<li><span class="agst-embed__name">${escape(n.name)}</span><span class="agst-embed__muted">${escape(n.reason)}</span></li>`).join('')}</ul></details>`:''}`;
  };
  const tree=m=>`<details class="agst-embed__tree" data-tree="${escape(m.id)}" ${ctrl.closed.has(m.id)?'':'open'}><summary><strong>${escape(m.name)}</strong>${pts(m)}</summary>
      ${body(m)}
    </details>`;
  // 0.21.0: a profession with several trees is one entry: the shared wallet once, then sub-tabs between its trees.
  const profession=g=>{
    const pick=g.trees.some(m=>m.id===ctrl.tabs.get(g.key))?ctrl.tabs.get(g.key)
      :(g.trees.find(m=>m.nodes.some(n=>n.available))??g.trees.find(m=>m.nodes.some(n=>n.unlocked))??g.trees[0]).id;
    const tabGroup=`agst-embed-${ctrl.actorId}-${g.key}`;
    return `<details class="agst-embed__tree agst-embed__profession" data-tree="${escape(g.key)}" data-agst-wallet="${escape(g.key)}" ${ctrl.closed.has(g.key)?'':'open'}><summary><strong>${escape(g.name)}</strong>${pts(g)}</summary>
      <p class="agst-embed__muted">One wallet shared by ${g.trees.length} trees: ${g.trees.map(m=>`${escape(m.label)} ${m.treeSpent??0}`).join(' · ')}</p>
      ${subTabs({group:tabGroup,label:`${g.name} trees`,tabs:g.trees.map(m=>({id:m.id,label:m.label})),selected:pick})}
      ${g.trees.map(m=>`<section class="agst-embed__panel" ${tabPanelAttrs(tabGroup,m.id,{hidden:m.id!==pick})}>${body(m)}</section>`).join('')}
    </details>`;
  };
  const others=groups.length-shown.length;
  return `<div class="agst-embed__body">${shown.map(g=>g.shared?profession(g):tree(g.trees[0])).join('')||'<div class="ag-empty"><p class="ag-empty__title">No points or perks yet</p></div>'}
    ${others?`<p class="agst-embed__muted">${plural(others,'other tree')} with nothing to spend yet. <button type="button" class="ag-btn ag-btn--sm" data-agst-embed="open">Open Skill Trees</button></p>`:''}</div>`;
}
/** Unlock from the embed: the same confirm, checks and route as the window (GM unlocks here; a player asks the GM client). */
async function embedUnlock(actor,treeId,nodeId){
  checkTreePlayerAccess();
  const refusal=embedRefusal(actor);if(refusal)throw Error(refusal);
  const stored=readSelectedTrees(false).find(t=>t.id===treeId);if(!stored)throw Error('Unknown tree');
  const level=professionLevel(actor,stored);
  if(game.user.isGM){
    const t=resolved(stored),n=t.nodes.find(x=>x.id===nodeId);if(!n)throw Error('Missing private node');
    const ok=availability(t,readProgress(actor,t),n.id,{level,siblings:privateSiblings(actor,stored)});if(!ok.ok)throw Error(ok.reason);
    if(!await confirm(`Spend ${plural(ok.cost,'point')} and unlock ${n.name} for ${actor.name}?\n${n.perkId?'The perk is added to the character sheet.':'This older custom node has no perk, so nothing is added to the sheet.'}`,{title:'Unlock this perk?',yes:'Unlock perk'}))return null;
    const {item}=await unlockNode(actor,t.id,n.id);
    return item?`${n.name} unlocked and added to ${actor.name}.`:`${n.name} unlocked (no perk Item: custom node).`;
  }
  if(!actor.isOwner)throw Error('You do not own the selected character');
  const n=stored.nodes.find(x=>x.id===nodeId);
  const ok=publicAvailability(stored,readProgress(actor,stored),n?.id,{level,siblings:walletSiblings(actor,stored),access:await accessCheck(actor,stored),accessLabel:proficiencyLabel});if(!ok.ok)throw Error(ok.reason);
  if(!await confirm(`Spend ${plural(n.cost??1,'point')} to unlock ${n.name} for ${actor.name}?\nThe perk is added to the character sheet. Only the GM can undo it.`,{title:'Unlock this perk?',yes:'Unlock perk'}))return null;
  const result=await requestUnlock(actor,stored.id,n.id);
  return result.message;
}
/** api.embed.mount(element, {actorId, mode:'character'}) → {unmount, refresh}. */
function mountEmbed(element,{actorId,mode='character'}={}){
  if(!element||typeof element.addEventListener!=='function')throw TypeError('mount needs a DOM element.');
  if(!EMBED_MODES.has(mode))throw Error(`Unknown embed mode "${mode}". Supported: ${[...EMBED_MODES].join(', ')}.`);
  const abort=new AbortController(),ctrl={actorId:String(actorId??''),closed:new Set(),mounted:true,busy:false,tabs:new Map(),unbind:[]};
  const memory=uiState(MODULE); // the tree last shown per profession, per user (0.21.0)
  element.classList?.add('agst-embed');
  ctrl.render=()=>{
    if(!ctrl.mounted)return;
    if(element.isConnected===false){ctrl.unmount();return;}
    for(const fn of ctrl.unbind.splice(0))fn();
    element.innerHTML=embedHTML(ctrl);
    for(const list of element.querySelectorAll?.('.agst-embed__profession .ag-tabs--sub')??[])ctrl.unbind.push(bindTablist(list));
  };
  ctrl.unmount=()=>{if(!ctrl.mounted)return;ctrl.mounted=false;abort.abort();for(const fn of ctrl.unbind.splice(0))fn();embeds.delete(ctrl);element.innerHTML='';element.classList?.remove('agst-embed');};
  element.addEventListener('click',async e=>{
    // A profession's tree tab: show that tree's panel in place and remember it.
    const tab=e.target?.closest?.('.agst-embed__profession [role="tab"]');
    if(tab&&element.contains(tab)){
      const box=tab.closest('[data-agst-wallet]'),key=box?.dataset.agstWallet;if(!key)return;
      ctrl.tabs.set(key,tab.dataset.tab);memory.set(`embedTree:${key}`,tab.dataset.tab);
      for(const b of box.querySelectorAll('[role="tab"]')){const on=b===tab;b.setAttribute('aria-selected',String(on));b.setAttribute('tabindex',on?'0':'-1');
        const panel=box.querySelector(`#${CSS.escape(b.getAttribute('aria-controls')??'')}`);if(panel)panel.hidden=!on;}
      return;
    }
    const b=e.target?.closest?.('[data-agst-embed]');if(!b||!element.contains(b))return;
    e.preventDefault?.();e.stopPropagation?.();
    if(ctrl.busy||b.disabled)return;
    const actor=game.actors?.get?.(ctrl.actorId)??null;
    try{
      if(b.dataset.agstEmbed==='open'){open({actorId:ctrl.actorId,treeId:b.dataset.tree||null});return;}
      if(b.dataset.agstEmbed==='unlock'){
        ctrl.busy=true;b.disabled=true;
        const message=await embedUnlock(actor,b.dataset.tree,b.dataset.node);
        if(message)notify(message);
        ctrl.render();
      }
    }catch(error){notify(`Skill Trees: ${error?.message??error}`,true);if(b.isConnected!==false)b.disabled=false;}
    finally{ctrl.busy=false;}
  },{signal:abort.signal});
  element.addEventListener('toggle',e=>{const id=e.target?.dataset?.tree;if(!id||!e.target.matches?.('.agst-embed__tree'))return;if(e.target.open)ctrl.closed.delete(id);else ctrl.closed.add(id);},{signal:abort.signal,capture:true});
  try{for(const g of professionGroups(readSelectedTrees(false)))if(g.multi){const last=memory.get(`embedTree:${g.key}`,null);if(last)ctrl.tabs.set(g.key,last);}}
  catch(error){console.warn(`[${MODULE}] Could not restore the embed's tree tabs`,error);}
  embeds.add(ctrl);ctrl.render();
  return {unmount:ctrl.unmount,refresh:()=>ctrl.render()};
}
/** Redraw embeds (all, or those showing one character). */
function refreshEmbeds(actorId=null){for(const e of [...embeds])if(!actorId||e.actorId===actorId)e.render();}

function open({treeId=null,actorId=null,resolve=false}={}){
  checkTreePlayerAccess();
  if(!instance)instance=new SkillTreeApp();
  if(treeId)instance.treeId=treeId;
  if(actorId)instance.actorId=actorId;
  if(treeId||actorId)instance.activeTab='trees';
  const rendered=instance.render({force:true});
  // From the GM's Review whisper: go straight to the review dialog.
  if(resolve&&game.user.isGM)Promise.resolve(rendered).then(()=>instance._resolve()).then(()=>instance.render())
    .catch(error=>notify(`Skill Trees: ${error.message}`,true));
  return instance;
}
Hooks.once('init',()=>{
  // 0.15.0/0.16.0 settings (Strain, Cinders): still registered, hidden, so their values stay readable for Ashen Gate | Cinders' adopt.
  for(const key of LEGACY_SETTINGS)game.settings.register(MODULE,key,{scope:'world',config:false,type:key==='strainConfig'?Object:Number,default:null});
  Hooks.on('renderActorDirectory',addDirectoryLauncher);
  Hooks.on('closeApplicationV2',app=>{openTreeWindows.delete(app);if(instance===app)instance=null;});
  // Existing player-facing Skill Trees retains player access on upgrade.
  game.settings.register(MODULE,PLAYER_ACCESS_SETTING,{name:'Player Access — Skill Trees',hint:'GM only: hide or reveal the player tree interface without deleting points, node unlocks or Feature Items.',scope:'world',config:true,type:Boolean,default:true,
    onChange:value=>syncTreePlayerAccess(value)});
  // Preserve v0.1 registration for explicit legacy migration/backup; never silently delete it.
  game.settings.register(MODULE,'treeData',{scope:'world',config:false,type:Object,default:{schema:'ag-skill-trees/0.1',trees:[]}});
  game.settings.register(MODULE,SAFE_SETTING,{scope:'world',config:false,type:Object,default:{schema:SCHEMA,trees:[]},onChange:()=>{refreshEmbeds();if(instance?.rendered)instance.render();}});
  game.settings.registerMenu(MODULE,'open',{name:'Ashen Gate | Skill Trees',label:'Open Skill Trees',hint:'Opens the Skill Trees window. Players need Player access on (Skill Trees → GM Setup).',icon:'fa-solid fa-diagram-project',type:SkillTreeApp,restricted:false});
});
Hooks.once('ready',()=>{
  const mod=game.modules.get(MODULE);if(!mod)return;
  mod.api={
    version:VERSION,open,
    playerAccess:{contract:PLAYER_ACCESS_CONTRACT,getState:()=>accessState(game,MODULE),setEnabled:enabled=>setPlayerAccess(game,MODULE,enabled)},
    listTrees:()=>{checkTreePlayerAccess();return copy(readSelectedTrees(false));},
    actorProgress:(actor,treeId)=>{checkTreePlayerAccess();if(!game.user.isGM&&!hasOwner(actor))throw Error('Actor access denied');const t=readSelectedTrees(false).find(x=>x.id===treeId);return t?readProgress(actor,t):null;},
    /** 0.13.0: points per tree for one character, [{treeId,name,kind,level,earned,spent,available}]. Owner or GM only; read-only. */
    pointsSummary:actor=>pointsSummary(actor),
    embed:{contract:'ag-trees-embed/1',modes:[...EMBED_MODES],mount:mountEmbed,
      /** 0.21.0: the embed's data, trees grouped by wallet (a profession with several trees is one group). Owner or GM. */
      data:actorId=>{checkTreePlayerAccess();const actor=game.actors?.get?.(actorId)??null,refusal=embedRefusal(actor);if(refusal)throw Error(refusal);return copy(embedData(actor));}},
    /** 0.21.0: the trees of one profession (same rules as listTrees: GM all, players the published ones), sorted by name. */
    listTreesForProfession:sourceRef=>{checkTreePlayerAccess();return copy(professionTrees(String(sourceRef??'')));},
    /**
     * 0.21.0: a character's shared profession wallet, {sourceRef, level, earned, spent, available, trees:[{id,name,spent}]}, or null when
     * this user can see no tree of that profession. earned/available are null when the Ledger is unavailable. Owner or GM only.
     */
    professionWallet:(actorId,sourceRef)=>{checkTreePlayerAccess();
      const actor=typeof actorId==='string'?game.actors?.get?.(actorId)??null:actorId??null;if(!actor)throw Error('No Actor given');
      if(!hasOwner(actor))throw Error('Actor access denied');
      return walletFor(actor,String(sourceRef??''));},
    /** 0.17.0: generic account access for partner modules (contract ag-tree-accounts/1). GM only except grants(). */
    accounts:accountsApi(),
    grantPoints:async(actor,treeId,amount,label)=>{
      if(!game.user.isGM)throw Error('GM only');const t=readPrivate().find(x=>x.id===treeId);if(!t)throw Error('Unknown tree');
      checkProgress(actor,t,'points');
      const next=grantPoints(t,readProgress(actor,t),amount,label);await persistAccount(actor,t,next);return next;
    },
    grantXp:async()=>{throw Error('Legacy XP grant retired: Profession XP belongs to the Profession Ledger; use grantPoints for Cinders/generic trees.');},
    publish:async()=>{if(!game.user.isGM)throw Error('GM only');return publishPublic();},
    // Unlock spends the character's points and adds the perk Item. A player's call is checked and done by the active GM client.
    unlock:async(actor,treeId,nodeId)=>{checkTreePlayerAccess();
      if(game.user.isGM){const {node,item}=await unlockNode(actor,treeId,nodeId);return {ok:true,nodeId:node.id,itemId:item?.id??null};}
      if(!actor?.isOwner)throw Error('Actor access denied');await requestUnlock(actor,treeId,nodeId);return {ok:true,nodeId};},
    refund:async(actor,treeId,nodeId,options)=>refundNode(actor,treeId,nodeId,options),
    /** Profession trees (0.11.0). GM override grant and keep are GM-only; reports are read-only. */
    overrideGrant:async(actor,treeId,nodeId,options)=>overrideNode(actor,treeId,nodeId,options),
    keep:async(actor,treeId,nodeId,options)=>keepNode(actor,treeId,nodeId,options),
    resolve:async(actor,treeId,options)=>resolveNodes(actor,treeId,options),
    undo:async(actor,treeId,entryId)=>undoHistory(actor,treeId,entryId),
    importLedgerPerkChoices:async(options)=>importLedgerChoices(options),
    professionReport:(actor,profId,options)=>professionReport(actor,profId,options),
    reconcileProfessions:()=>professionReconcile(),
    resetTree:async(actor,treeId)=>resetTreeFor(actor,treeId),
    giveMissingPerks:async()=>giveMissingPerks(),
    // GM-only, UI-less hand-off used by General Manager's single importer. Never touches Actor progress.
    previewTreeImport:(pack,{mode='skip'}={})=>{
      if(!game.user.isGM)throw Error('GM only');
      const {errors,rows}=planTreeImport(pack,readPrivate(),{mode});
      return {errors,rows:rows.map(({id,name,action,reason})=>({id,name,action,reason}))};
    },
    importTrees:async(pack,{mode='skip'}={})=>{
      if(!game.user.isGM)throw Error('GM only');
      // The GM-only definitions Journal belongs to this module, so the import creates it when missing instead of failing.
      let createdStorage=false;
      if(!gmPrivate()){try{await createStore();createdStorage=true;}catch(error){throw Error(`Could not create the GM-only Skill Trees storage Journal: ${error?.message??error}. Open Skill Trees > GM Setup (or Tree Library) and click Initialize GM Storage, then import again.`);}}
      const current=readPrivate();
      const {errors,rows,apply}=planTreeImport(pack,current,{mode});
      if(errors.length)throw Error(`Import blocked: ${errors[0]}`);
      const report={created:rows.filter(r=>r.action==='new').map(r=>r.id),updated:rows.filter(r=>r.action==='update').map(r=>r.id),
        skipped:rows.filter(r=>r.action==='skip').map(r=>({id:r.id,reason:r.reason})),failed:[],
        // Layouts import even when a perk is not in the world yet; those nodes cannot be unlocked until it is.
        warnings:savedDataReport(apply,id=>Boolean(perkDoc(id))).map(r=>`${r.treeName} / ${r.nodeName}: ${r.text}`),
        ...(createdStorage?{notes:['Created the GM-only Skill Trees storage Journal "[AG] Skill Trees — GM Definitions" (no player access).']}:{})};
      if(!apply.length)return report;
      const combined=new Map(current.map(t=>[t.id,t]));for(const t of apply)combined.set(t.id,t);
      try{await saveTrees([...combined.values()]);}
      catch(error){return {created:[],updated:[],skipped:report.skipped,failed:apply.map(t=>({id:t.id,reason:String(error?.message??error)})),warnings:report.warnings};}
      return report;
    }
  };
  game.socket?.on?.(SOCKET,onSocket);
  if(ui.actors?.rendered) addDirectoryLauncher(ui.actors,ui.actors.element);
  Hooks.on('updateActor',actor=>{refreshEmbeds(actor.id);if(instance?.rendered && instance.actorId===actor.id)instance.render();});
  // Profession Ledger (optional partner): its hook only says "look again"; the level is read through its API.
  Hooks.on('ashenGateLedger.progressionChanged',data=>void onProgressionChanged(data));
  Hooks.on('renderChatMessageHTML',wireChatButtons);
  if(game.user.isGM){
    // World perks feed node names/text; an Item on a character sheet does not change the published view.
    // A failed publish leaves players on the old tree, so tell the GM (once until a publish works again).
    let publishFailed=false;
    for(const eventName of ['createItem','updateItem','deleteItem'])Hooks.on(eventName,async item=>{
      if(item?.parent||!gmPrivate())return;
      try{await publishPublic();publishFailed=false;}catch(e){
        console.error(`[${MODULE}] Auto-publish error`,e);
        if(!publishFailed)ui.notifications?.error?.(`Skill Trees could not update the player view after a perk Item changed: ${e?.message??e}. Players still see the previous trees. Open Skill Trees → Tree Library → Publish Player View to retry.`);
        publishFailed=true;
      }
    });
  }
});
