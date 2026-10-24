import {SCHEMA,norm,professionFromTreeName,classify,normalizeRecipe,normalizeLibrary,isActivity,effectNoteOf,displayProfession,
  sourceVisibility,sourceAvailableToPlayer,agSourceId,quantity,isLevelBackup,LEVEL_BACKUP_REFUSAL} from './core.mjs';
import {GATHERING_PROFESSIONS,TIERS,ACCESS_LEVELS,gatherXP,knownRecipesOf,canLearnRecipe,progressOf,emptyProgress,
  nextProgress,adjustProgress,xpHistoryOf,XP_CAP,professionLevelOf,isMaterialAwardCandidate,xpForLevel,suggestActivityXP} from './progression.mjs';
import {DRAFT_RECIPE_LABEL_DEFAULTS,RECIPE_LABEL_MAX,recipeLabelsOf,resolveRecipeLabels,pickRecipeLabel,cleanLabelStore,cleanRecipeLabel} from './recipe-labels.mjs';
import {PLAYER_ACCESS_CONTRACT,PLAYER_ACCESS_SETTING,playerAccessAllowed,assertPlayerAccess,accessState,setPlayerAccess} from './player-access.mjs';
import {lookupWorldDefinition,readWorldDefinition,isActiveDefinition,definitionSource} from './definition-lookup.mjs';
import {planCraft,craftBlockers,executeCraft,craftResultData,materialStock,tierLabel,ConsentBroker} from './crafting.mjs';
import {tierBadge} from './tier-style.mjs';
import {launcherRoot,mountLauncher} from './ag-launchers.mjs';
import {confirmDialog,confirmDanger,guardDirty,infoDialog} from './ag-dialogs.mjs';
import {windowSize,uiState,subTabs,tabPanelAttrs,bindTablist,fold,bindFolds,fileButton,bindFileButtons,linkButton} from './ag-html.mjs';
import {SKILL_IDS,SKILL_LABELS,MODE_LABELS,craftCheckPlan,professionKey,effectiveMapping,toolKeys,toolLabel,skillLabel,toolRef,requiredToolRef,toolRefLabel,heldTool,looseToolName,
  checkOption,rollModeFor,rollCheck,formatBonus,CROSSWALK_LISTS,DEFAULT_PROFESSION_TOOLS,DEFAULT_GATHER_SKILLS,migrateCheckMapping,compactCheckMapping,advantageToolsOf,advantageItemsOf,cleanItemList,
  TOOL_GROUP_KEYS,isToolGroup,toolProficiencyMatches,expandToolGroups} from './checks.mjs';
import {allProfessions,categoryOfKey,declaredCategory} from './professions.mjs';
import {signatureOf,tiersCrossed,signaturePlan,signatureTierName,signatureTierLevel} from './signature-perks.mjs';
import {PROFESSION_KEYS,professionTitle,meetsAccess,catalogCrosswalk,definitionProfessionKey,unmappedProfessions,assignmentPlan,rowId,startingRecipePlan,isStartingRecipe,parseBaselineFile,baselineChanges,exportCrosswalk} from './assign.mjs';
import {DEFAULT_DC_BY_TIER,tierName,defaultDC,normalizeNode,gatherOutcome,gatherReward,exhaustsNode,helperEligibility,checkGatherRequest,canRunGathering,nodeBlocker,startBlocker,playerBlocker,GATHER_FIX,
  stackMaterial,DRAFT_STATES} from './gathering.mjs';
import {NODE_SCHEMA,NODE_ID,ACTIVITIES,ACTIVITY_KEYS,NODE_PROFESSIONS,TABLES,TABLE_LABELS,activityLabel,skillText,nodeIdFromName,checkTemplate,normalizeStore,plainTemplate,saveTemplate,
  duplicateTemplate,removeTemplate,templateReferences,templateNode,resolveEntry,templatePlayerView,planNodeImport,applyNodeImport,exportNodes,migrateLocationNodes,entryNodeId} from './nodes.mjs';
import {EXOTIC_SETTING,DEFAULT_EXOTIC_PERCENT,EXOTIC_MODES,DESIGNATED_CONDITIONS,GATHERING_KEYS,clampPercent,normalizeExotics,materialMeta,filterMaterials,
  exoticEligibility,resolveGatherRewards,defaultRoll,nodeProfessionKey,professionKeyFromId,materialProfessionKeys} from './exotic.mjs';
const ID='ashen-gate-profession-ledger';
const VERSION='0.32.4';
const MAX_PROFESSION_LEVEL=16;
/** Called on the GM client whenever a gather or craft chat card offers an XP award. Nothing listens yet:
 * this is the seam for later automation. Payload: {kind, actorId, professionId, professionName, suggested, messageId, ...};
 * 0.29.0: an activity card also suggests XP (suggested, suggestedBasis in plain words). */
const XP_HOOK='ashenGateLedger.xpOpportunity';
/** Called on the client that wrote the XP (the GM) after every Profession XP change. It only says "look again":
 * read the level through api.progression.level, never from this payload. Payload: {actorId, profId, previousLevel, level, xp}. */
const PROGRESSION_HOOK='ashenGateLedger.progressionChanged';
const PROGRESSION_CONTRACT='ag-ledger-progression/1';
const LOCATIONS_ID='ashen-gate-locations';
const SOCKET=`module.${ID}`;
const {ApplicationV2,HandlebarsApplicationMixin,DialogV2}=foundry.applications.api;
const esc=value=>foundry.utils.escapeHTML(String(value??''));
/** Kit badge; recipe items and partial visibility use the accent variant, muted the plain one. */
const BADGE_KIND={ok:'ok',warn:'warn',recipe:'accent',partial:'accent'};
const badge=(value,kind='')=>`<span class="ag-badge${BADGE_KIND[kind]?` ag-badge--${BADGE_KIND[kind]}`:''}">${esc(value)}</span>`;
/** D6: material quality uses the item rarity colours (Common → common, Rare → rare, Exotic → veryRare). There is no boss tier yet. */
const QUALITY_RARITY={common:'common',rare:'rare',exotic:'veryRare'};
const qualityBadge=quality=>{const q=String(quality??'').trim().toLowerCase();
  return QUALITY_RARITY[q]?`<span class="ag-rarity-badge" data-rarity="${QUALITY_RARITY[q]}">Quality: ${q[0].toUpperCase()}${q.slice(1)}</span>`:'';};
/** Kit empty state: "No X yet." title, then the next step. Both arguments are HTML (escape names first). */
const emptyState=(title,text='',action='')=>`<div class="ag-empty"><p class="ag-empty__title">${title}</p>${text?`<p class="ag-empty__text">${text}</p>`:''}${action}</div>`;
/** Kit notice; the message is HTML. */
const notice=(html,kind='info')=>`<div class="ag-notice ag-notice--${kind}"><i class="fa-solid ${kind==='warn'?'fa-triangle-exclamation':'fa-circle-info'}" aria-hidden="true"></i><span>${html}</span></div>`;
/** A Material's quality from the catalog the current user may read, or null. */
/** A kit row's meta line, or nothing when there is nothing to show. */
const rowMeta=html=>html?`<span class="ag-row__meta">${html}</span>`:'';
const materialQuality=(sourceId,lib)=>sourceId?lib.materials.find(m=>m.id===sourceId)?.quality??null:null;
// Notifications are shown as HTML, and messages carry actor, node and file names a player or a file can choose: escape them.
// Notification text goes through notifyText. Whether V14 renders it as HTML (names must be escaped) or as plain text (escaping
// would show "&amp;") could not be confirmed offline: escaping is the safe default; set ESCAPE_NOTIFICATIONS=false to flip it.
const ESCAPE_NOTIFICATIONS=true;
const notifyText=text=>ESCAPE_NOTIFICATIONS?esc(text):String(text??'');
const say=(message,error=false)=>error?ui.notifications.error(notifyText(message)):ui.notifications.info(notifyText(message));
const plural=(n,one,many=`${one}s`)=>`${n} ${n===1?one:many}`;
/** 0.26.2: a control's identity across a re-render: its tag, name and data-* attributes (tooltips aside). */
const FOCUSABLE='input, textarea, select, button, a[href], [tabindex]';
const controlKey=el=>`${el.tagName}[${[...(el.attributes??[])].filter(a=>a.name==='name'||(a.name.startsWith('data-')&&!a.name.startsWith('data-tooltip'))).map(a=>`${a.name}=${a.value}`).sort().join('][')}]`;
const textLike=el=>el.tagName==='TEXTAREA'||(el.tagName==='INPUT'&&/^(text|search|number)$/.test(el.type||'text'));
/** The focused control inside root (with its caret, and text typed but not yet saved), or null. */
function captureFocus(root){
  const el=root?.ownerDocument?.activeElement??globalThis.document?.activeElement;
  if(!el||el===root||!root?.contains?.(el)||!el.matches?.(FOCUSABLE)||!el.attributes)return null;
  const field=textLike(el);let start=null,end=null;
  if(field)try{start=el.selectionStart;end=el.selectionEnd;}catch{}
  return {key:controlKey(el),value:field?el.value:undefined,defaultValue:field?el.defaultValue:undefined,dirty:field&&el.value!==el.defaultValue,start,end};
}
/** Focuses the same control again without scrolling; typed text comes back unless the field now shows another saved value. */
function restoreFocus(root,saved){
  if(!saved?.key)return null;
  const el=[...(root?.querySelectorAll?.(FOCUSABLE)??[])].find(f=>controlKey(f)===saved.key);
  if(!el||el.disabled)return null;
  if(saved.dirty&&el.defaultValue===saved.defaultValue)el.value=saved.value;
  el.focus?.({preventScroll:true});
  if(saved.start!=null)try{el.setSelectionRange?.(saved.start,saved.end??saved.start);}catch{}
  return el;
}
let current=null;
const openLedgerWindows=new Set();
const learnLocks=new Set();
const xpLocks=new Set();
const craftLocks=new Set();
/** The one target check: a Character Hub level backup is refused; anything else (or null) passes through. */
const playable=actor=>{if(isLevelBackup(actor))throw Error(LEVEL_BACKUP_REFUSAL);return actor;};
/** Every actor-id entry point resolves here: null when missing, an error for a level backup. */
const actorById=id=>playable(game.actors?.get?.(id)??null);
const owned=(actor)=>game.user.isGM||Boolean(actor?.testUserPermission?.(game.user,'OWNER'));
const userOwns=(user,actor)=>Boolean(user?.isGM||actor?.testUserPermission?.(user,'OWNER'));
const canOpenLedger=()=>playerAccessAllowed(game,ID);
const checkPlayerLedger=()=>assertPlayerAccess(game,ID);
const playerAccessEnabled=()=>game.settings.get(ID,PLAYER_ACCESS_SETTING)!==false;
const itemOf=(actor,id)=>actor?.items?.get?.(id)??Array.from(actor?.items??[]).find(i=>i.id===id)??null;
const allUsers=()=>game.users?.contents??Array.from(game.users??[]);
const userById=id=>game.users?.get?.(id)??allUsers().find(u=>u.id===id)??null;
const newId=()=>foundry.utils.randomID?.()??Math.random().toString(36).slice(2,18);
/** Canonical IDs are never shown to players; this is the last-resort readable label. */
const humanizeId=id=>String(id??'').replace(/^[A-Z]+-/,'').split('-').map(w=>w.charAt(0)+w.slice(1).toLowerCase()).join(' ');
const looksLikeId=value=>/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/.test(String(value??''));
const recipeTitle=name=>String(name??'').replace(/^Recipe\s*:\s*/i,'');
const modeSelect=(mode,attrs='name="mode"')=>`<select ${attrs}>${['1','0','-1'].map(m=>`<option value="${m}" ${String(mode)===m?'selected':''}>${MODE_LABELS[m]}</option>`).join('')}</select>`;
const modeHint=preset=>preset.sources.length?`Preset from ${preset.sources.join('; ')}. You can change it.`:'No advantage or disadvantage found on the sheet, effects or helpers. You can still choose one.';

/** React on all clients. Neither hiding nor revealing mutates Actor/campaign state. */
function syncLedgerPlayerAccess(enabled){
  refreshEmbeds();
  if(game.user?.isGM&&current?.rendered)current.render();
  if(!game.user?.isGM&&enabled!==true){
    const windows=new Set([...openLedgerWindows,...(current?[current]:[])]);
    for(const window of windows)if(window?.rendered)Promise.resolve(window.close?.({animate:false}))
      .catch(err=>console.error(`[${ID}] Could not close hidden player window`,err));
  }
  const app=globalThis.ui?.actors;
  if(app?.element) addActorDirectoryLauncher(app,app.element);
  // A sidebar may have been rendered by a V14 wrapper rather than ui.actors.
  if(!game.user?.isGM&&enabled!==true){
    globalThis.document?.querySelectorAll?.('[data-ag-launcher="ashen-gate-profession-ledger"]')?.forEach(button=>button.remove());
  }
}
/** 0.25.0: one result per synchronous pass (a render looks materials up many times); recomputed on the next task. */
function perTick(fn){let cached=null;return ()=>{if(cached)return cached.value;cached={value:fn()};queueMicrotask(()=>{cached=null;});return cached.value;};}
const materialChoices=perTick(()=>(game.items?.contents??[]).filter(item=>isMaterialAwardCandidate(item,agSourceId) && classify(item)==='Material' && lookupWorldDefinition(game,agSourceId(item),{entityType:'Material',publicForAll:true,approvedOnly:true}).document===item).sort((a,b)=>a.name.localeCompare(b.name)));
const linkedProfession=(actor,id)=>Array.from(actor?.items??[]).some(item=>classify(item)==='Profession'&&agSourceId(item)===id);
/** A character's own Items are already on their sheet, so only explicitly GM-only or reveal-gated records are withheld. */
const playerSafe=item=>!['gm','reveal_gated'].includes(sourceVisibility(item));
const professionItems=(actor)=>Array.from(actor?.items??[]).filter(item=>classify(item)==='Profession'&&/^PROF-[A-Z0-9-]+$/.test(agSourceId(item)??'')&&(game.user.isGM||playerSafe(item)));
const heldRecipeItems=(actor)=>Array.from(actor?.items??[]).filter(item=>classify(item)==='Recipe'&&/^REC-[A-Z0-9-]+$/.test(agSourceId(item)??'')&&quantity(item)>0);
/** Players only ever see released recipe items; drafts are GM information, not player noise. */
const recipeItems=(actor)=>heldRecipeItems(actor).filter(item=>game.user.isGM||sourceAvailableToPlayer(item));
const itemStatus=item=>item?.flags?.['ashen-gate-manager']?.source?.status??'approved';
const GM_VIEWS=new Set(['gm','assign','nodes']);
/** 0.26.0 sub-tabs (kit 2.2). The chosen one is remembered per user on this device (uiState), never in world data. */
const GM_SETUP_TABS=[{id:'party',label:'Party'},{id:'tools',label:'Tools and checks'},{id:'gather',label:'Gathering & crafting'},{id:'access',label:'Player Access'}];
const GATHER_TAB_IDS=['requests','active','start'];
/** Assign sub-tabs (0.30.0 Starting recipes, 0.31.0 Signature perks). */
const ASSIGN_TABS=[{id:'professions',label:'Professions'},{id:'recipes',label:'Starting recipes'},{id:'signature',label:'Signature perks'}];
const LEGACY_VIEWS={materials:'party',recipes:'party',planner:'individual',learning:'individual',roster:'gm'};
const HIDDEN_STATUSES=['draft','proposed','superseded','retired','placeholder'];
const hiddenFromPlayers=(recipe)=>HIDDEN_STATUSES.includes(recipe?.status)||['gm','reveal_gated'].includes(recipe?.sourceVisibility);
const nameList=(actors)=>actors.map(a=>a.name).join(', ');
const professionDisplayName=item=>item?.flags?.['ashen-gate-manager']?.source?.definition?.name??String(item?.name??'').replace(/\s+[—–-]\s+Profession$/i,'').trim();

/** Mirror Ledger-owned XP into the profession feature's description so it is visible on any sheet. */
const MIRROR=/<p class="agl-progress-mirror">[\s\S]*?<\/p>/;
function progressMirror(progress){
  const next=progress.level<16?xpForLevel(progress.level+1):null;
  return `<p class="agl-progress-mirror"><strong>Profession Ledger:</strong> Level ${progress.level} (${esc(progress.tier)}) · ${progress.xp} XP${next!==null?` · ${next-progress.xp} XP to level ${progress.level+1}`:' · maximum level'}</p>`;
}
async function syncProfessionSheet(actor,profId){
  const item=Array.from(actor?.items??[]).find(i=>classify(i)==='Profession'&&agSourceId(i)===profId);
  const progress=progressOf(actor,profId);
  if(!item||!progress||typeof actor.updateEmbeddedDocuments!=='function')return;
  const html=String(item.system?.description?.value??'');
  const block=progressMirror(progress);
  const next=MIRROR.test(html)?html.replace(MIRROR,block):`${block}${html}`;
  if(next!==html)await actor.updateEmbeddedDocuments('Item',[{_id:item.id,'system.description.value':next}]);
}
/** Exact Actor source ID and ownership enforced; no Actor state duplicated in Skill Trees. */
function announceProgression(actor,profId,previousLevel,level,xp){
  try{Hooks.callAll?.(PROGRESSION_HOOK,{actorId:actor.id,profId,previousLevel,level,xp});}catch(err){console.warn(`[${ID}] ${PROGRESSION_HOOK} listener failed`,err);}
}
/** 0.28.0: the Skill Trees tree to open for a profession (PROF-* id or name). Skill Trees' listTreesForProfession (one profession
 * may have several trees, shown by Skill Trees as one entry) when it has it, else the first tree named after the profession. */
function professionTreeId(api,ref){
  if(typeof api?.listTreesForProfession==='function'){
    try{const trees=api.listTreesForProfession(ref);if(Array.isArray(trees)&&trees.length)return trees[0]?.id;}catch(err){console.warn(`[${ID}] Skill Trees listTreesForProfession failed`,err);}
  }
  const name=/^PROF-/.test(String(ref??''))?professionTitle(definitionProfessionKey(ref,'')??''):ref;
  return api?.listTrees?.()?.find(t=>norm(professionFromTreeName(t.name))===norm(name))?.id;
}
/** 0.28.0 public read: does a character have any proficiency in an access list (see meetsAccess)? Skill Trees uses it to
 * gate a tree. GM or anyone who can see the Actor, like progression.level (not tied to Ledger Player Access). */
function meetsProficiency(actorRef,access){
  const actor=typeof actorRef==='string'?game.actors?.get?.(actorRef):actorRef;
  if(!actor)throw Error('No Actor given');
  if(!game.user?.isGM&&actor.testUserPermission?.(game.user,'OBSERVER')!==true)throw Error('Actor access denied');
  if(access!=null&&(typeof access!=='object'||Array.isArray(access)))throw Error('Access must be {toolProficienciesAnyOf, skillProficienciesAnyOf}');
  return meetsAccess(actor,access??{});
}
/** Public read of one Profession's level (contract ag-ledger-progression/1). GM or anyone who can see the Actor.
 * Not tied to Ledger Player Access: that hides the Ledger window, not Profession mechanics. */
function progressionLevel(actor,profId){
  if(!actor)throw Error('No Actor given');
  if(!game.user?.isGM&&actor.testUserPermission?.(game.user,'OBSERVER')!==true)throw Error('Actor access denied');
  return professionLevelOf(actor,profId,linkedProfession(actor,profId));
}
/** Public read (0.18.0) of a character's professions for partner modules (Character Hub). GM or the Actor's owner; never history or perk ids.
 * Players never see GM-only or reveal-gated Profession Items (professionItems). Works without Skill Trees. */
function listProfessions(actor){
  if(!actor)throw Error('No Actor given');
  checkPlayerLedger();
  if(!game.user?.isGM&&actor.testUserPermission?.(game.user,'OWNER')!==true)throw Error('Actor access denied');
  return professionsOf(actor).map(p=>({professionId:p.sourceId,name:p.name,level:p.level,xp:p.xp,xpToNext:p.toNext,maxLevel:MAX_PROFESSION_LEVEL,
    tier:p.tier,unspentPerkChoices:progressOf(actor,p.sourceId)?.unspentPerkChoices??0}));
}
const xpEntry=(kind,extra={})=>({kind,at:Date.now(),by:game.user.id,byName:game.user.name,...extra});
async function awardXP(actor,profId,points,extra={}){
  if(!game.user.isGM)throw Error('Only the GM can award Profession XP');
  playable(actor);
  if(!actor||!linkedProfession(actor,profId))throw Error('The character must hold the matching imported profession');
  const key=`${actor.id}:${profId}`;
  if(xpLocks.has(key))throw Error('Profession XP award already in progress');
  xpLocks.add(key);
  try {const before=actor.flags?.[ID]?.professionProgress??emptyProgress();const result=nextProgress(before,profId,points,xpEntry('award',extra));
    await actor.setFlag(ID,'professionProgress',result.state);
    announceProgression(actor,profId,result.previousLevel,result.level,result.state.professions[profId].xp);
    try{await syncProfessionSheet(actor,profId);}catch(err){console.warn(`[${ID}] XP saved; sheet description not updated`,err);}
    return result;
  }finally{xpLocks.delete(key);}
}
/** Skill Trees' view of perks a level no longer covers (optional partner; null when absent or it fails). */
function skillTreesReport(actor,profId,level){
  if(!actor||!profId)return null;
  const m=game.modules?.get?.('ashen-gate-skill-trees');
  if(!m?.active||typeof m.api?.professionReport!=='function')return null;
  try{return m.api.professionReport(actor,profId,{level})??null;}catch(err){console.warn(`[${ID}] Skill Trees report unavailable`,err);return null;}
}
/** Known recipes of this profession, for telling the GM which recipes a lower level locks. */
const professionRecipes=(actor,profId)=>knownRecipesOf(actor).map(id=>partyRecipeDefinition(id,catalog())).filter(r=>r&&r.professionId===profId).map(r=>({id:r.id,name:r.name,tier:r.tier}));
/** Plain sentence listing what depends on levels the change takes away. Nothing is deleted. */
function dependentsText(plan,name,actor=null,profId=null){
  const parts=[];
  const tree=skillTreesReport(actor,profId,plan.level);
  if(tree?.nodesAboveLevel?.length)parts.push(`${tree.nodesAboveLevel.length} ${name} Skill Tree perk${tree.nodesAboveLevel.length===1?'':'s'} (${tree.nodesAboveLevel.map(n=>n.name).join(', ')}) ${tree.nodesAboveLevel.length===1?'needs':'need'} a higher level than ${plan.level}. They are kept, not removed. Resolve them in Skill Trees.`);
  else if(tree?.overSpent>0)parts.push(`${name} Skill Tree perks use ${tree.overSpent} more point${tree.overSpent===1?'':'s'} than level ${plan.level} gives. They are kept, not removed. Resolve them in Skill Trees.`);
  if(!tree&&plan.perksBeyondLevel.length)parts.push(`${plan.perksBeyondLevel.length} held ${name} perk${plan.perksBeyondLevel.length===1?'':'s'} (${plan.perksBeyondLevel.join(', ')}) ${plan.perksBeyondLevel.length===1?'exceeds':'now exceed'} level ${plan.level}. They are kept, not removed. Review them.`);
  const sig=signaturePerksBeyondLevel(actor,profId,plan.level);
  if(sig.length)parts.push(`${sig.length} held ${name} signature perk${sig.length===1?'':'s'} (${sig.map(x=>`${x.name}, ${x.tier}`).join('; ')}) ${sig.length===1?'needs':'need'} a higher level than ${plan.level}. ${sig.length===1?'It is':'They are'} kept, not removed.`);
  if(plan.lockedRecipes.length)parts.push(`Known recipes now above this level (kept, but crafting is blocked until the level returns): ${plan.lockedRecipes.join(', ')}.`);
  return parts.join(' ');
}
/** GM-only data-layer XP change (signed amount or exact value). Never deletes perks; records history. */
async function adjustXP(actor,profId,{delta=null,set=null,reason='',messageId=null,kind=null}={}){
  if(!game.user.isGM)throw Error('Only the GM can adjust Profession XP');
  playable(actor);
  if(!actor||!linkedProfession(actor,profId))throw Error('The character must hold the matching imported profession');
  const key=`${actor.id}:${profId}`;
  if(xpLocks.has(key))throw Error('Profession XP change already in progress');
  xpLocks.add(key);
  try{
    const before=actor.flags?.[ID]?.professionProgress??emptyProgress();
    const result=adjustProgress(before,profId,{delta,set,recipes:professionRecipes(actor,profId),
      entry:xpEntry(kind??(set!==null?'set':'adjust'),{reason:String(reason??'').slice(0,200),messageId})});
    await actor.setFlag(ID,'professionProgress',result.state);
    announceProgression(actor,profId,result.previousLevel,result.level,result.state.professions[profId].xp);
    try{await syncProfessionSheet(actor,profId);}catch(err){console.warn(`[${ID}] XP saved; sheet description not updated`,err);}
    return result;
  }finally{xpLocks.delete(key);}
}
/** Visible record for the owner and GMs of an XP change, so nothing happens silently. */
async function whisperXpNote(actor,html){
  const recipients=[...new Set(allUsers().filter(u=>u.isGM||actor.testUserPermission?.(u,'OWNER')).map(u=>u.id))];
  try{await globalThis.ChatMessage?.create?.({whisper:recipients,speaker:ChatMessage.getSpeaker?.({actor}),content:`<div class="agl-chat-card"><header><div>${html}</div></header></div>`});}
  catch(err){console.warn(`[${ID}] XP saved; chat note failed`,err);}
}
/** Consumes a real Actor-owned Recipe Item; writes only a permanent REC-* knowledge ID. */
async function learnRecipe(actor,item){
  playable(actor);
  if(!actor||!item||!owned(actor))throw Error('You need OWNER permission on that character to learn a recipe');
  if(game.user.isGM&&actor.hasPlayerOwner)throw Error(`${actor.name}'s player learns this recipe from their own Ledger or character sheet`);
  if(!Array.from(actor.items??[]).some(i=>i.id===item.id))throw Error('The Recipe Item must be held by the selected character');
  if(classify(item)!=='Recipe')throw Error('This is not a Recipe Item');
  if(!game.user.isGM&&!sourceAvailableToPlayer(item))throw Error('The GM has not released this recipe to players yet');
  const id=agSourceId(item);
  const eligible=canLearnRecipe(actor,item,id);
  if(!eligible.ok)throw Error(eligible.reason);
  const key=`${actor.id}:${id}`;
  if(learnLocks.has(key))throw Error('Recipe learning already in progress');
  learnLocks.add(key);
  try {
    const current=item.parent?.items?.get?.(item.id)??actor.items?.get?.(item.id)??item;
    const checked=canLearnRecipe(actor,current,id);
    if(!checked.ok)throw Error(checked.reason);
    const oldList=knownRecipesOf(actor);
    const oldQty=quantity(current);
    // Flag first, then consume; if consumption fails, restore the previous knowledge list.
    await actor.setFlag(ID,'knownRecipes',[...oldList,id]);
    try {
      if(oldQty>1)await actor.updateEmbeddedDocuments('Item',[{_id:current.id,'system.quantity':oldQty-1}]);
      else await actor.deleteEmbeddedDocuments('Item',[current.id]);
    }catch(err){
      try {await actor.setFlag(ID,'knownRecipes',oldList);}catch(rollback){
        console.error(`[${ID}] Recipe knowledge rollback failed`,rollback);
        throw Error(`Item consumption failed AND knowledge rollback failed for ${current.name}; GM must reconcile the Actor before retrying`);
      }
      throw Error(`Recipe learning was cancelled because Item consumption failed: ${err.message}`);
    }
    return {sourceId:id,name:current.name};
  }finally{learnLocks.delete(key);}
}
/** The roster is an explicit GM-owned world selection, not a permission grant. */
function rosterIds(){const stored=game.settings.get(ID,'partyRoster');return Array.isArray(stored)?stored.filter(x=>typeof x==='string'):[];}
function allCharacters(){return (game.actors?.contents??[]).filter(a=>a.type==='character'&&!isLevelBackup(a)).sort((a,b)=>a.name.localeCompare(b.name));}
/** Party = roster characters this user can see in the Actors sidebar (at least LIMITED).
 * Only Ledger data is shown for them: name, professions, materials, recipes and held recipe items. */
function partyActorsFor(user){const ids=new Set(rosterIds());return allCharacters().filter(a=>ids.has(a.id)&&(user?.isGM||a.testUserPermission?.(user,'LIMITED')));}
const partyActors=()=>partyActorsFor(game.user);
/** Characters whose Individual (crafting) view this user may open: the GM any party member, a player their own. */
function myCharacters(){
  if(game.user.isGM){const party=partyActors();return party.length?party:allCharacters().filter(a=>a.hasPlayerOwner);}
  const mine=partyActors().filter(a=>owned(a));
  const assigned=game.user.character;
  if(assigned?.type==='character'&&!isLevelBackup(assigned)&&owned(assigned)&&!mine.some(a=>a.id===assigned.id))mine.push(assigned);
  return mine;
}
/** Known and found recipes for the given party. Never mutates Actors. */
function partyRecipes(actors){
  const known=new Map(),found=new Map(),unreleased=[];
  for(const actor of actors){
    for(const id of knownRecipesOf(actor)){if(!known.has(id))known.set(id,[]);known.get(id).push(actor);}
    for(const item of heldRecipeItems(actor)){const released=sourceAvailableToPlayer(item),id=agSourceId(item);
      if(!released)unreleased.push({actor,item});
      if(released||game.user.isGM){if(!found.has(id))found.set(id,[]);found.get(id).push({actor,item});}}
  }
  return {known,found,unreleased};
}
/** A player may read an approved, player-visible definition only for an ID the party knows or holds; never the whole catalog. */
function partyRecipeDefinition(id,lib){
  const indexed=lib.recipes.find(r=>r.id===id);if(indexed||game.user.isGM)return indexed??null;
  const full=readWorldDefinition(game,id,{entityType:'Recipe',partyKnown:true});
  if(full.status!=='ok')return null;
  const doc=full.document;
  return normalizeRecipe({...doc.toObject(),uuid:doc.uuid,id,status:'approved',sourceDefinition:full.definition});
}
function ingredientName(ing,lib){
  const mat=lib.materials.find(m=>m.id===ing.materialId);if(mat?.name)return mat.name;
  if(ing.name&&ing.name!==ing.materialId)return ing.name;
  // Ingredient of a party-known recipe: its approved player-visible Material name may be shown.
  const hit=ing.materialId?lookupWorldDefinition(game,ing.materialId,{entityType:'Material',partyKnown:!game.user.isGM}):null;
  if(hit?.status==='ok')return hit.document.name;
  return looksLikeId(ing.name||ing.materialId)?humanizeId(ing.name||ing.materialId):(ing.name||'Unknown material');
}
/** Readable profession for a recipe, from the PROF-* definition; never a raw ID. */
function professionLabel(recipe){
  const id=recipe?.professionId;
  if(id&&looksLikeId(id)){
    const hit=lookupWorldDefinition(game,id,{entityType:'Profession',partyKnown:!game.user.isGM});
    if(hit?.status==='ok')return professionDisplayName(hit.document);
    return humanizeId(id);
  }
  const raw=String(recipe?.profession??'').trim();
  return raw&&!looksLikeId(raw)?raw:(raw?humanizeId(raw):'Unassigned profession');
}
/* ---- Recipe names per profession (0.29.0, display only) ----------------------------------------
 * What a profession calls its recipes ("Formula" for Alchemy), shown where the Ledger shows recipes of one profession.
 * Layers, highest first: the GM's edit (setting recipeLabels), the imported Profession record (recipeLabel /
 * recipeLabelPlural), the draft built-in defaults (recipe-labels.mjs), "Recipe". Ids, types and saved data never change. */
const RECIPE_LABEL_SETTING='recipeLabels';
let importedLabelCache=null;
/** recipeLabel/recipeLabelPlural from the Profession records this client can read, by profession key. World records first
 * (a player reads only released ones), then the profession features on characters. Kept for one synchronous render pass. */
function importedRecipeLabels(){
  if(importedLabelCache)return importedLabelCache;
  const out=new Map();
  const note=doc=>{
    if(classify(doc)!=='Profession')return;
    const def=doc?.flags?.['ashen-gate-manager']?.source?.definition??null,labels=recipeLabelsOf(def);
    if(!labels)return;
    const key=definitionProfessionKey(agSourceId(doc),def?.name??professionDisplayName(doc),declaredCategory(doc));
    if(key&&!out.has(key))out.set(key,labels);
  };
  for(const doc of game.items?.contents??[])if(game.user?.isGM||sourceAvailableToPlayer(doc))note(doc);
  for(const actor of game.actors?.contents??[])for(const item of actor?.items??[])note(item);
  importedLabelCache=out;
  queueMicrotask(()=>{importedLabelCache=null;});
  return out;
}
const gmRecipeLabels=()=>cleanLabelStore(game.settings.get(ID,RECIPE_LABEL_SETTING));
/** The profession key for a PROF-* id or a profession name, or null. */
function labelKeyOf(ref){
  const text=String(ref??'').trim();
  if(!text)return null;
  if(/^PROF-[A-Z0-9-]+$/.test(text))return definitionProfessionKey(text,'');
  return professionKey(displayProfession(text))||null;
}
/** {singular, plural} for a profession key. `gm` is the GM layer (the saved edits, or GM Setup's draft). */
const recipeLabelsFor=(key,gm=gmRecipeLabels())=>resolveRecipeLabels(key?[gm[key],importedRecipeLabels().get(key),DRAFT_RECIPE_LABEL_DEFAULTS[key]]:[]);
/** GM Setup: the labels a profession gets without the GM's edit, and where they come from (plain words). */
function lowerRecipeLabels(key){
  const imported=importedRecipeLabels().get(key)??null,draft=DRAFT_RECIPE_LABEL_DEFAULTS[key]??null,r=resolveRecipeLabels([imported,draft]);
  return {...r,from:imported?'From content':draft?'Built-in name (draft)':'Default'};
}
/** The GM's edits worth saving: cleaned, and a profession whose edit gives exactly what it would get anyway is dropped. */
function compactLabels(raw){
  const out={};
  for(const [key,value] of Object.entries(cleanLabelStore(raw))){
    const lower=lowerRecipeLabels(key),mine=resolveRecipeLabels([value,lower]);
    if(mine.singular!==lower.singular||mine.plural!==lower.plural)out[key]=value;
  }
  return out;
}
/** Public read: the label for a profession (name or PROF-* id). Unknown professions get "Recipe". */
const recipeLabelFor=(ref,opts={})=>pickRecipeLabel(recipeLabelsFor(labelKeyOf(ref)),opts);
/** The label of one recipe's profession ("Formula" for an Alchemy recipe). */
const recipeWord=(recipe,opts={})=>pickRecipeLabel(recipeLabelsFor(labelKeyOf(recipe?.professionId)??labelKeyOf(professionLabel(recipe))),opts);
/** 0.29.0: a recipe's effect note (activities); older stored catalog rows read it from their source definition. */
const effectNote=recipe=>recipe?.effectNote??effectNoteOf(recipe?.sourceDefinition);
const effectNoteHtml=recipe=>{const note=isActivity(recipe)?effectNote(recipe):null;
  return note?`<p class="agl-recipe-effect"><span class="agl-label">Effect</span> ${esc(note)} <small class="agl-sub">(the GM decides at the table)</small></p>`:'';};

/** The world ITEM-* document a recipe produces (Manager import), or null. */
function resultDocument(recipe,{forPlayer=!game.user.isGM}={}){
  const id=recipe?.resultItemId;
  if(!id||!/^ITEM-[A-Z0-9-]+$/.test(id))return null;
  const hit=lookupWorldDefinition(game,id,{entityType:'Item',partyKnown:forPlayer});
  if(hit?.status!=='ok')return null;
  if(forPlayer&&(hit.source?.visibility!=='player'||hit.source?.status!=='approved'))return null;
  return hit.document;
}
function players(){return allUsers().filter(u=>!u.isGM);}
/** Only evaluated on the GM client; never expose names of inaccessible Actors to players. */
function visibilityInfo(doc){
  if(!game.user.isGM||!doc)return null;
  const declared=sourceVisibility(doc);
  if(declared==='gm')return {label:'GM-only source',kind:'warn',details:'Ashen Gate source metadata marks this record GM-only, regardless of Foundry document ownership.'};
  if(declared==='reveal_gated')return {label:'Reveal gated',kind:'warn',details:'Ashen Gate source metadata requires an explicit reveal. This Ledger does not infer reveal state from Foundry permission.'};
  const accounts=players();
  if(!accounts.length)return {label:'No player accounts',kind:'muted',details:'No non-GM user accounts exist to check.'};
  const viewers=accounts.filter(u=>doc.testUserPermission?.(u,'OBSERVER'));
  const details=`Visible to: ${viewers.map(u=>u.name).join(', ')||'none'}; Not visible to: ${accounts.filter(u=>!viewers.includes(u)).map(u=>u.name).join(', ')||'none'}`;
  return viewers.length===0?{label:'GM only',kind:'warn',details}:viewers.length===accounts.length?{label:'All players',kind:'ok',details}:{label:`${viewers.length}/${accounts.length} players`,kind:'partial',details};
}
const tip=text=>`data-tooltip="${esc(text)}" data-tooltip-class="ag-tooltip"`;
function visibilityBadge(doc){const v=visibilityInfo(doc);return v?`<span class="agl-access" ${tip(v.details)}>${badge(v.label,v.kind)}</span>`:'';}
/** GM-only explanation of why players can't see a record. */
function draftBadge(status,visibility){
  if(!game.user.isGM)return '';
  const out=[];
  if(HIDDEN_STATUSES.includes(status)){const s=String(status);
    out.push(`<span class="agl-access" ${tip(`Players can't see or learn a ${s} recipe, even if a character holds or knows it. Approve it in General Manager to release it.`)}>${badge(`${s[0].toUpperCase()}${s.slice(1)} — hidden from players`,'warn')}</span>`);}
  if(visibility==='gm')out.push(badge('GM-only source','warn'));
  if(visibility==='reveal_gated')out.push(badge('Reveal gated','warn'));
  return out.join(' ');
}
function catalog(){
  const stored=game.settings.get(ID,'libraryData');
  // Native world definitions override cached catalogue snapshots. A stale
  // snapshot must never bypass an archived/hidden world definition.
  const world=(game.items?.contents??[]).filter(doc=>{
    const flag=doc?.flags?.['ashen-gate-manager']?.source;
    return !!flag?.sourceId && ['Recipe','Material'].includes(flag.entityType);
  });
  const managedIds=new Set(world.map(doc=>doc.flags['ashen-gate-manager'].source.sourceId));
  const sources=world.filter(doc=>{
    const src=doc.flags['ashen-gate-manager'].source;
    return lookupWorldDefinition(game,src.sourceId,{entityType:src.entityType,approvedOnly:!game.user.isGM}).document===doc;
  });
  // Old Ledger catalog rows without world projections remain readable. All
  // manager-backed records are read from the current native binding instead.
  const recipes=[...(stored?.recipes??[])].filter(x=>!managedIds.has(x.id) &&
    (game.user.isGM||(sourceAvailableToPlayer(x)&&/^REC-[A-Z0-9-]+$/.test(x.id??''))));
  const materials=[...(stored?.materials??[])].filter(x=>!managedIds.has(x.id) &&
    (game.user.isGM||(sourceAvailableToPlayer(x)&&/^MAT-[A-Z0-9-]+$/.test(x.id??''))));
  for(const doc of sources){
    const src=doc.flags['ashen-gate-manager'].source, agId=src.sourceId,kind=src.entityType;
    const full=readWorldDefinition(game,agId,{entityType:kind,approvedOnly:!game.user.isGM});
    if(full.status==='invalid_definition')continue; // corrupted identity/ref metadata must fail closed
    if(kind==='Recipe'){
      // Historical Manager items lacked source.definition; read legacy structured
      // flags if present but never infer ingredients from formatted HTML.
      const r=normalizeRecipe({...doc.toObject(),uuid:doc.uuid,id:agId,
        status:src.status,...(full.status==='ok'?{sourceDefinition:full.definition}:{})});
      recipes.push(r);
    }else if(kind==='Material'){
      materials.push(full.status==='ok'?{...full.definition,sourceDefinition:full.definition,
        sourceVisibility:src.visibility,sourceUuid:doc.uuid}:{id:agId,name:doc.name,sourceVisibility:src.visibility});
    }
  }
  return {recipes:recipes.sort((a,b)=>a.name.localeCompare(b.name)),materials,source:stored?.source??'Foundry Items'};
}

/** Profession rows for a character. Untracked progress is shown as its real state: level 1, 0 XP. */
function professionsOf(actor){
  return professionItems(actor).map(item=>{
    const sourceId=agSourceId(item),progress=progressOf(actor,sourceId);
    const xp=progress?.xp??0,level=progress?.level??1;
    const next=level<16?xpForLevel(level+1):null,floor=xpForLevel(level);
    return {sourceId,item,name:professionDisplayName(item)||humanizeId(sourceId),xp,level,tracked:Boolean(progress),
      tier:progress?.tier??'Apprentice',next,floor,toNext:next===null?null:next-xp,
      percent:next===null?100:Math.round(100*(xp-floor)/Math.max(1,next-floor)),draft:HIDDEN_STATUSES.includes(itemStatus(item))};
  }).sort((a,b)=>a.name.localeCompare(b.name));
}
/** Material Items held by a character, as the current user may see them. */
function materialsOf(actor,lib){
  return materialStock(actor,{playerView:!game.user.isGM}).filter(i=>i.category==='Material'||
    lib.materials.some(m=>(i.sourceId&&m.id===i.sourceId)||(!i.sourceId&&norm(m.name)===norm(i.name)))).sort((a,b)=>a.name.localeCompare(b.name));
}
function partyMaterials(actors,lib){
  const keyed=new Map();
  for(const actor of actors)for(const item of materialsOf(actor,lib)){
    const key=item.sourceId??`NAME-${norm(item.name)}`;
    if(!keyed.has(key))keyed.set(key,{key,name:item.name,total:0,holders:[]});
    const row=keyed.get(key);row.total+=item.qty;row.holders.push({actor,qty:item.qty});
  }
  return [...keyed.values()].sort((a,b)=>a.name.localeCompare(b.name));
}

/** Everything the crafting UI needs for one recipe and one crafter. */
function craftContext(actor,recipe,lib){
  const result=resultDocument(recipe);
  const blockers=craftBlockers({recipe,crafter:actor,knownIds:knownRecipesOf(actor),result,label:recipeWord(recipe,{capitalize:false})});
  const plan=planCraft(recipe,actor,partyActors(),{materialDefs:lib.materials,playerView:!game.user.isGM,nameOf:ing=>ingredientName(ing,lib)});
  return {recipe,result,blockers,plan};
}
const extraCost=recipe=>{const gp=Number(recipe?.sourceDefinition?.additional_gp);return Number.isFinite(gp)&&gp>0?gp:null;};

/** GM Setup: profession → tool, and gathering profession → check skill (defaults filled in). */
const checkMapping=()=>effectiveMapping(game.settings.get(ID,'checkMapping'),{baseline:baselineLayer()});
/** 0.27.0: the mapping the checks use for advantage tools, with the imported Profession content (catalog layer, GM-read:
 * gathering is run by the GM). Same check tools and skills as checkMapping. */
const rollMapping=()=>crosswalkInfo().map;
/** 0.20.0: the GM's imported baseline file layer ({key:{lists}}), or null. Stored in the world setting crosswalkBaseline. */
const BASELINE_SETTING='crosswalkBaseline';
const baselineRecord=()=>{try{const v=game.settings.get(ID,BASELINE_SETTING);return v&&typeof v==='object'&&v.professions&&typeof v.professions==='object'?v:null;}catch{return null;}};
const baselineLayer=()=>baselineRecord()?.professions??null;
/** 0.22.0: the professions whose check skill is set from Skill to Access (gathering professions and Enchanting).
 * 0.28.0: and creative professions (Artistry: Performance). */
const hasCheckSkill=k=>GATHERING_PROFESSIONS.some(n=>professionKey(n)===k)||k==='enchanting'||categoryOfKey(k)==='creative';
/** The saved shape of the mapping (what GM Setup edits and saves): check tool/skill plus the GM's own crosswalk lists. */
const mappingDraft=map=>({tools:{...map.tools},skills:{...map.skills},...Object.fromEntries(CROSSWALK_LISTS.map(l=>[l,structuredClone(map.gm[l])]))});
/** 0.27.0: the check a Tools and checks cell drives: the check tool (Tool to Access), the check skill (Skill to Access, for
 * gathering professions and Enchanting) or none. */
const mapCheckField=(list,k)=>list==='qualifyTools'?'tools':list==='qualifySkills'&&hasCheckSkill(k)?'skills':null;
/** A cell's values in effect, the check it rolls first (when that check is one of them). */
function mapCellValues(map,list,k){
  const values=[...(map[list]?.[k]??[])],field=mapCheckField(list,k),check=field?map[field]?.[k]||'':'';
  return check&&values.includes(check)?[check,...values.filter(v=>v!==check)]:values;
}
const sameSet=(a,b)=>a.length===b.length&&a.every(v=>b.includes(v));
const MAP_ORIGIN={default:'Default',catalog:'From content',baseline:'From baseline file',gm:'Set by GM'};
const MAP_HEADING={qualifySkills:'skill to access',qualifyTools:'tool to access',advantageTools:'tool for advantage',advantageItems:'carried gear for advantage'};
/** 0.28.0: the profession groups of the Tools and checks table, in order (registry categories). */
const PROFESSION_GROUPS=Object.freeze([['crafting','Crafting professions'],['gathering','Gathering professions'],['creative','Creative professions']]);
/** 0.28.0: the values a tool cell offers: the tool groups (Any musical instrument) first, then every dnd5e tool. */
const mapToolOptions=()=>[...TOOL_GROUP_KEYS,...toolKeys()];
/** The lists GM Setup edits (0.27.0: carried gear for advantage is part of the Tool for Advantage cell). */
const MAP_LISTS=Object.freeze(['qualifySkills','qualifyTools','advantageTools','advantageItems']);
const MAP_FIELD={skillProficienciesAnyOf:'qualifySkills',toolProficienciesAnyOf:'qualifyTools',advantageToolsAnyOf:'advantageTools'};
const mapLabelOf=list=>list==='qualifySkills'?skillLabel:list==='advantageItems'?String:toolLabel;
/** Content names for this cell that match no dnd5e skill/tool, until the GM (or a baseline file) sets the cell. */
const mapUnmatched=(map,unresolved,list,k)=>['catalog','default'].includes(map.origin?.[k]?.[list])?[...new Set(unresolved.filter(u=>(u.key??professionKey(u.profession))===k&&(u.list??MAP_FIELD[u.field])===list).map(u=>u.name))]:[];
/** The visible part of a cell: the values in effect, their source, and a check that is not among them. */
function mapCellSummary({k,title,list,map,unresolved}){
  const values=mapCellValues(map,list,k),labelOf=mapLabelOf(list),field=mapCheckField(list,k),check=field?map[field]?.[k]||'':'';
  // The advantage cell also lists the carried gear that gives advantage, marked "(carried)".
  const items=list==='advantageTools'?mapCellValues(map,'advantageItems',k):[];
  const shown=[...values.map(labelOf),...items.map(n=>`${n} (carried)`)];
  const text=shown.length?shown.join(', '):'None',unmatched=mapUnmatched(map,unresolved,list,k);
  const checkNote=!field||(check?values.includes(check):!values.length)?'':`Check rolls ${check?labelOf(check):`no ${list==='qualifySkills'?'skill':'tool'}`}`;
  const originOf=l=>MAP_ORIGIN[map.origin?.[k]?.[l]]??'Default';
  const origin=items.length?(values.length?`${originOf(list)} · carried gear: ${originOf('advantageItems')}`:`Carried gear: ${originOf('advantageItems')}`):originOf(list);
  return {text,aria:`${title} ${MAP_HEADING[list]}: ${text}`,origin,checkNote,unmatched,values,items};
}
/** A Tools and checks cell: a button with the values that opens a checkbox list in the cell (Escape or Done closes it). */
function mapCellHtml({k,title,list,map,unresolved,options}){
  const v=mapCellSummary({k,title,list,map,unresolved}),labelOf=mapLabelOf(list),id=`agl-mp-${k}-${list}`,field=mapCheckField(list,k);
  const kind=list==='qualifySkills'?'skill':'tool';
  const hint=list==='advantageTools'?'Proficiency with, or carrying, any ticked tool gives advantage on this profession’s gathering checks.'
    :`Proficiency in any ticked ${kind} qualifies.${field?` The first one is the ${kind} the check rolls${list==='qualifyTools'?' (when a recipe names no tool; Any musical instrument is never rolled by itself)':''}; it stays first while it stays ticked.`:''}`;
  // 0.28.0: tool groups (Any musical instrument) stay at the top of the unticked values.
  const sorted=[...v.values,...[...options].filter(o=>!v.values.includes(o)).sort((a,b)=>(isToolGroup(b)-isToolGroup(a))||labelOf(a).localeCompare(labelOf(b)))];
  return `<div class="agl-mpick" data-map-picker data-map-list="${list}" data-map-prof="${esc(k)}">
    <button type="button" class="agl-mpick__toggle" data-action="map-pick" aria-expanded="false" aria-controls="${id}" aria-label="${esc(v.aria)}" ${tip(`Edit ${title} ${MAP_HEADING[list]}`)}><span class="agl-mpick__value">${esc(v.text)}</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>
    <small class="agl-sub agl-mpick__origin">${esc([v.origin,v.checkNote].filter(Boolean).join(' · '))}</small>
    ${v.unmatched.length?`<small class="agl-mpick__unmatched">Not matched: ${esc(v.unmatched.join(', '))}</small>`:''}
    <div class="agl-mpick__pop" id="${id}" role="group" aria-label="${esc(`${title} ${MAP_HEADING[list]}`)}" hidden>
      <p class="agl-sub">${esc(hint)}</p>
      ${v.unmatched.length?`<p class="agl-sub">The content names ${esc(v.unmatched.map(n=>`“${n}”`).join(', '))}, which matches no dnd5e ${kind}. Tick the ${kind} it means.</p>`:''}
      <div class="agl-mpick__list">${sorted.map(o=>`<label><input type="checkbox" data-map-cell="${list}" data-map-prof="${esc(k)}" value="${esc(o)}" ${v.values.includes(o)?'checked':''}> ${esc(labelOf(o))}</label>`).join('')}</div>
      ${list==='advantageTools'?mapGearHtml(k,title,v.items):''}
      <div class="agl-mpick__actions"><button type="button" class="ag-btn ag-btn--sm ag-btn--ghost" data-action="map-clear" data-id="${esc(k)}" data-list="${list}">Clear (None)</button><button type="button" class="ag-btn ag-btn--sm" data-action="map-pick-done">Done</button></div>
    </div></div>`;
}
/** 0.27.0: the carried-gear part of the advantage cell: an item a character carries (inventory name, any case, or a core
 * item UUID or identifier) gives advantage. Untick to remove; type a name and Add (or Enter) to add one. */
function mapGearHtml(k,title,items){
  return `<fieldset class="agl-mpick__gear"><legend>Carried gear (advantage while carried)</legend>
    ${items.length?`<div class="agl-mpick__list">${items.map(n=>`<label><input type="checkbox" data-map-cell="advantageItems" data-map-prof="${esc(k)}" value="${esc(n)}" checked> ${esc(n)}</label>`).join('')}</div>`:'<p class="agl-sub">None.</p>'}
    <div class="agl-mpick__add"><input type="text" data-map-item-input maxlength="200" placeholder="Item name, e.g. Fishing Tackle" aria-label="${esc(`${title}: add carried gear for advantage`)}"><button type="button" class="ag-btn ag-btn--sm" data-action="map-add-item" data-id="${esc(k)}">Add</button></div>
  </fieldset>`;
}
/** A row differs from its defaults: the GM set one of its lists, or its check tool/skill differs from the built-in default. */
const mapRowCustom=(draft,k)=>MAP_LISTS.some(l=>draft[l]?.[k])||(draft.tools[k]??'')!==(DEFAULT_PROFESSION_TOOLS[k]??'')||(draft.skills[k]??'')!==(DEFAULT_GATHER_SKILLS[k]??'');
/** The profession's check tool. 0.28.0: a tool group (Any musical instrument) is never a check tool by itself. */
const professionTool=name=>{const key=checkMapping().tools[professionKey(name)];return key&&!isToolGroup(key)?{key,uuid:null,name:null}:null;};
/** Advantage tools for a profession's checks. 0.22.0: gathering professions only; a crafting profession gets none.
 * 0.27.0: from the full crosswalk (GM Setup, baseline file, else the imported Profession content, else none), the same
 * values GM Setup shows. Before, the checks skipped the imported content's advantage tools. */
const advantageToolsFor=name=>advantageToolsOf(rollMapping(),professionKey(name));
/** 0.27.0: carried gear that gives advantage on a profession's checks (gathering professions only), e.g. Fishing Tackle. */
const advantageItemsFor=name=>advantageItemsOf(rollMapping(),professionKey(name));

/** GM: imported, active PROF-* Profession Items with their definitions (the catalog layer and the Items to assign). */
function professionDefinitions(){return game.user?.isGM?visibleProfessionDefinitions():[];}
/** 0.32.2: the same list for any user: a player only gets the Profession records released to the party (what a recipe card
 * needs to name the profession's tools). GM-only uses (catalog layer, Assign) still go through professionDefinitions. */
function visibleProfessionDefinitions(){
  const gm=Boolean(game.user?.isGM),out=[];
  for(const doc of game.items?.contents??[]){
    const id=agSourceId(doc);if(!/^PROF-[A-Z0-9-]+$/.test(id??'')||classify(doc)!=='Profession')continue;
    const hit=lookupWorldDefinition(game,id,gm?{entityType:'Profession'}:{entityType:'Profession',partyKnown:true});
    if(hit.status!=='ok'||hit.document!==doc)continue;
    const def=hit.source?.definition??{},name=def.name??professionDisplayName(doc),category=declaredCategory(doc);
    // 0.28.0: a profession imported with category `creative` that is not built in joins the registry here (definitionProfessionKey).
    out.push({sourceId:id,name,category,access:def.access??null,key:definitionProfessionKey(id,name,category),uuid:doc.uuid,itemName:doc.name,doc});
  }
  return out;
}
/** GM: the crosswalk with the catalog layer, for Assign and the GM Setup table. `stored` defaults to the saved setting. */
function crosswalkInfo(stored=game.settings.get(ID,'checkMapping')){
  const defs=professionDefinitions(),cat=catalogCrosswalk(defs);
  return {defs,...cat,map:effectiveMapping(stored,{catalog:cat.catalog,baseline:baselineLayer()})};
}
const requireCrosswalkGM=()=>{if(!game.user?.isGM)throw Error('Only the GM can import or export the profession crosswalk');};
/** GM dry run of a baseline file: which rows it changes. Writes nothing. */
function previewBaseline(data){
  requireCrosswalkGM();
  const parsed=parseBaselineFile(data),info=crosswalkInfo();
  return {...parsed,changes:parsed.ok?baselineChanges(baselineLayer(),parsed.baseline,info.map):[],current:baselineRecord()?{fileName:baselineRecord().fileName??'',importedAt:baselineRecord().importedAt??''}:null};
}
/** GM: store a validated baseline file as the baseline layer (replaces the previous one). GM edits still win. */
async function applyBaseline(data,{fileName=''}={}){
  requireCrosswalkGM();
  const parsed=parseBaselineFile(data);
  if(!parsed.ok)throw Error(`Baseline file not applied: ${parsed.errors.join(' ')}`);
  const record={schema:'ag-ledger-crosswalk-baseline/1',fileName:String(fileName??'').slice(0,200),importedAt:new Date().toISOString(),professions:parsed.baseline};
  await game.settings.set(ID,BASELINE_SETTING,record);
  return {professions:Object.keys(parsed.baseline).length,unresolved:parsed.unresolved,unknownProfessions:parsed.unknownProfessions};
}
/** GM: the current effective table (catalog and baseline included) in the baseline file shape. */
function exportCurrentCrosswalk(){requireCrosswalkGM();return exportCrosswalk(crosswalkInfo().map,{version:VERSION});}
const requireAssignGM=()=>{if(!game.user?.isGM)throw Error('Only the GM can assign professions');};
/** Assign targets: the given characters, else the Ledger party, else dnd5e's Primary Party. */
function assignActors(actorIds=null){
  if(Array.isArray(actorIds)&&actorIds.length)return actorIds.map(actorById).filter(a=>a?.type==='character');
  const party=partyActors();if(party.length)return party;
  try{const members=game.settings.get('dnd5e','primaryParty')?.actor?.system?.members??[];
    return [...members].map(m=>m?.actor??m).filter(a=>a?.type==='character'&&!isLevelBackup(a));}catch{return [];}
}
/** Profession keys a character already holds: any profession feature, tagged or named, so nothing is duplicated. */
const heldProfessionKeys=actor=>new Set(Array.from(actor?.items??[]).filter(i=>classify(i)==='Profession').map(i=>professionKey(professionDisplayName(i))).filter(Boolean));
const heldProfessionIds=actor=>new Set(Array.from(actor?.items??[]).map(agSourceId).filter(id=>/^PROF-/.test(id??'')));
/** GM dry run: what each character qualifies for, with the reason, and what is missing. Changes nothing. */
function assignPreview({actorIds=null}={}){
  requireAssignGM();
  const info=crosswalkInfo(),items=new Map();
  for(const d of info.defs)if(d.key){if(!items.has(d.key))items.set(d.key,[]);items.get(d.key).push(d);}
  const actors=assignActors(actorIds);
  const rows=assignmentPlan(actors,info.map,{professionItems:items,heldKeys:heldProfessionKeys,heldIds:heldProfessionIds}).map(r=>({...r,id:rowId(r)}));
  return {actors:actors.map(a=>({id:a.id,name:a.name})),rows,unmapped:unmappedProfessions(info.map),unresolved:info.unresolved,conflicts:info.conflicts};
}
/** The plan rows of one status that `rowIds` selects. Omitted/null = every row; anything else must be an array of ids the plan holds, else it throws (a malformed list never widens to every row). */
function selectedRows(plan,status,rowIds){
  if(rowIds==null)return plan.rows.filter(r=>r.status===status);
  if(!Array.isArray(rowIds))throw Error('rowIds must be a list of row ids');
  const known=new Set(plan.rows.map(r=>r.id));
  const bad=rowIds.filter(id=>typeof id!=='string'||!known.has(id));
  if(bad.length)throw Error('Unknown row id: preview again and pick from the list');
  const want=new Set(rowIds);
  return plan.rows.filter(r=>r.status===status&&want.has(r.id));
}
const assignLocks=new Set();
/**
 * GM: add the missing Profession Items. `rowIds` limits it to those proposals (from assignPreview); otherwise every
 * proposal. Re-checks each character just before adding, so re-running adds nothing. Never touches XP, progression,
 * Skill Tree perks or existing Items.
 */
async function assignProfessions({actorIds=null,rowIds=null}={}){
  requireAssignGM();
  const plan=assignPreview({actorIds});
  const picked=selectedRows(plan,'propose',rowIds);
  const defs=new Map(professionDefinitions().map(d=>[d.sourceId,d]));
  const added=[],skipped=[];
  for(const actorId of [...new Set(picked.map(r=>r.actorId))]){
    const actor=game.actors?.get?.(actorId);
    if(!actor||assignLocks.has(actorId)){skipped.push({actorId,reason:'busy or missing'});continue;}
    assignLocks.add(actorId);
    try{
      const keys=heldProfessionKeys(actor),ids=heldProfessionIds(actor),data=[];
      for(const row of picked.filter(r=>r.actorId===actorId)){
        const def=defs.get(row.sourceId);
        if(!def||ids.has(row.sourceId)||keys.has(row.key)){skipped.push({...row,reason:'already has it'});continue;}
        const copy=def.doc.toObject();
        for(const k of ['_id','folder','sort','ownership'])delete copy[k];
        data.push(copy);ids.add(row.sourceId);keys.add(row.key);added.push({actorId,actorName:actor.name,profession:row.profession,sourceId:row.sourceId,reason:row.reason});
      }
      if(data.length)await actor.createEmbeddedDocuments('Item',data);
    }finally{assignLocks.delete(actorId);}
  }
  return {added,skipped};
}
/* ---- Starting recipes (0.30.0, GM only) -------------------------------------------------------
 * The GM grants the `starting: true` recipes of each player character's professions straight into its known recipes
 * (the same knownRecipes Actor flag Learn writes), without a recipe item. Separate from learnRecipe, whose rule that the
 * GM doesn't learn for player-owned characters is unchanged. Never removes or duplicates a known recipe. */
const requireGrantGM=()=>{if(!game.user?.isGM)throw Error('Only the GM can grant starting recipes');};
const isPlayerCharacter=a=>a?.type==='character'&&!isLevelBackup(a)&&a.hasPlayerOwner===true;
/** The given characters (each must be a player character; a level backup is refused), else Assign's party, player characters only. */
function grantActors(actorIds=null,what='starting recipes'){
  if(Array.isArray(actorIds)&&actorIds.length)return [...new Set(actorIds)].map(id=>{const a=actorById(id);
    if(!a)throw Error('Character not found');
    if(!isPlayerCharacter(a))throw Error(`${a.name} is not a player character: ${what} go to player-owned characters only.`);
    return a;});
  return assignActors().filter(isPlayerCharacter);
}
/** PROF-* ids and profession keys a character holds (any profession feature, as Assign counts them). */
function heldProfessionsOf(actor){
  const ids=heldProfessionIds(actor),keys=heldProfessionKeys(actor);
  for(const id of ids){const k=definitionProfessionKey(id,'');if(k)keys.add(k);}
  return {ids,keys};
}
/** '' when players may have this recipe; else why it is not granted (named after what the GM fixes in General Manager). */
function startingUnreleased(recipe){
  const status=String(recipe?.status??''),vis=recipe?.sourceVisibility;
  if(HIDDEN_STATUSES.includes(status))return `${status[0].toUpperCase()}${status.slice(1)}: not released to players. Approve it in General Manager.`;
  if(vis==='gm')return 'GM-only: not released to players. Make it player-visible in General Manager.';
  if(vis==='reveal_gated')return 'Reveal-gated: not released to players yet. Reveal it in General Manager.';
  if(vis!=='player')return 'Not released to players: make it player-visible in General Manager.';
  return '';
}
/** GM dry run: the starting recipes each player character would get. Writes nothing. */
function startingRecipesPreview({actorIds=null}={}){
  requireGrantGM();
  const actors=grantActors(actorIds),lib=catalog(),byId=new Map(lib.recipes.map(r=>[r.id,r]));
  const rows=startingRecipePlan(actors,lib.recipes,{heldProfessions:heldProfessionsOf,known:knownRecipesOf,unreleased:startingUnreleased})
    .map(r=>({...r,recipeName:recipeTitle(r.recipeName),profession:professionLabel(byId.get(r.recipeId))}));
  return {actors:actors.map(a=>{const h=heldProfessionsOf(a);return {id:a.id,name:a.name,hasProfession:h.ids.size>0||h.keys.size>0};}),
    rows,startingRecipes:lib.recipes.filter(isStartingRecipe).length};
}
const grantLocks=new Set();
/**
 * GM: `preview` (the default) returns the dry run and writes nothing. `preview: false` adds the 'new' rows (`rowIds`
 * limits it to those) to each character's known recipes, re-checked just before writing, so a second run grants
 * nothing. All or nothing: if one character can't be updated, the characters already updated are put back.
 * Returns {granted:[{actorId, actorName, recipes:[{id, name, profession}]}], skipped}.
 */
async function grantStartingRecipes({preview=true,actorIds=null,rowIds=null}={}){
  requireGrantGM();
  const plan=startingRecipesPreview({actorIds});
  if(preview!==false)return {preview:true,...plan};
  const picked=selectedRows(plan,'new',rowIds);
  const ids=[...new Set(picked.map(r=>r.actorId))];
  if(ids.some(id=>grantLocks.has(id)))throw Error('Starting recipes are already being granted');
  const granted=[],skipped=[],written=[];
  ids.forEach(id=>grantLocks.add(id));
  try{
    for(const actorId of ids){
      const actor=actorById(actorId);
      if(!isPlayerCharacter(actor))throw Error('Character not found');
      const raw=actor.flags?.[ID]?.knownRecipes,before=Array.isArray(raw)?[...raw]:[],known=new Set(knownRecipesOf(actor)),add=[];
      for(const row of picked.filter(r=>r.actorId===actorId)){
        if(known.has(row.recipeId)){skipped.push({...row,reason:'already known'});continue;}
        known.add(row.recipeId);add.push(row);
      }
      if(!add.length)continue;
      try{await actor.setFlag(ID,'knownRecipes',[...before,...add.map(r=>r.recipeId)]);}
      catch(err){
        for(const w of written.reverse())try{await w.actor.setFlag(ID,'knownRecipes',w.before);}catch(rollback){
          console.error(`[${ID}] Starting recipe rollback failed`,rollback);
          throw Error(`Starting recipes: ${actor.name} could not be updated AND putting back ${w.actor.name}'s known recipes failed; check ${w.actor.name}'s known recipes before retrying`);
        }
        throw Error(`Starting recipes were not granted: ${actor.name} could not be updated (${err.message}). Nothing was changed.`);
      }
      written.push({actor,before});
      granted.push({actorId,actorName:actor.name,recipes:add.map(r=>({id:r.recipeId,name:r.recipeName,profession:r.profession}))});
    }
  }finally{ids.forEach(id=>grantLocks.delete(id));}
  return {preview:false,granted,skipped};
}
/* ---- Signature perks (0.31.0) -----------------------------------------------------------------
 * A ProfessionPerk record with `signature: true`, a `tier` (journeyman | expert) and a `profession_id` is imported by General
 * Manager as a feat Item. When a character's level in that profession reaches the tier (Journeyman 4, Expert 7), the GM client
 * adds the imported Item to the Actor. Nothing is ever removed. The Item on the Actor is the only record: no Ledger flag copies it. */
const requireSignatureGM=()=>{if(!game.user?.isGM)throw Error('Only the GM can grant signature perks');};
/** GM: imported, active signature perks (Manager source definition) with their world Items. */
function signaturePerkDefs(){
  if(!game.user?.isGM)return [];
  const out=[];
  for(const doc of game.items?.contents??[]){
    const id=agSourceId(doc);if(!/^PERK-[A-Z0-9-]+$/.test(id??'')||classify(doc)!=='ProfessionPerk')continue;
    const hit=lookupWorldDefinition(game,id,{entityType:'ProfessionPerk'});
    if(hit.status!=='ok'||hit.document!==doc)continue;
    const sig=signatureOf(hit.source?.definition);
    if(sig)out.push({...sig,name:sig.name||doc.name,visibility:hit.source.visibility,doc});
  }
  return out;
}
/** '' when the perk may go to a player; else why not. A signature perk in a player's hands is visible to them, so GM-only ones are held back. */
function signatureUnreleased(perk){
  if(perk.visibility==='gm')return 'GM-only: not released to players. Make it player-visible in General Manager.';
  if(perk.visibility==='reveal_gated')return 'Reveal-gated: not released to players yet. Reveal it in General Manager.';
  if(perk.visibility!=='player')return 'Not released to players: make it player-visible in General Manager.';
  return '';
}
const holdsSourceItem=(actor,sourceId)=>Array.from(actor?.items??[]).some(i=>agSourceId(i)===sourceId);
const professionNameOf=(actor,profId)=>professionsOf(actor).find(p=>p.sourceId===profId)?.name??humanizeId(profId);
/** Signature perks a character holds above the given level of a profession (read from the held Item's own source definition). */
function signaturePerksBeyondLevel(actor,profId,level){
  if(!actor||!profId)return [];
  return Array.from(actor.items??[]).map(i=>signatureOf(i.flags?.['ashen-gate-manager']?.source?.definition))
    .filter(sig=>sig&&sig.professionId===profId&&sig.level>level).map(sig=>({id:sig.id,name:sig.name,tier:signatureTierName(sig.tier)}));
}
const signatureQueue=new Map();
/** One grant at a time per character, so the progression hook and the catch-up action can't both add the same perk. */
function inSignatureQueue(actorId,fn){
  const prev=signatureQueue.get(actorId)??Promise.resolve();
  const next=prev.catch(()=>{}).then(fn);
  signatureQueue.set(actorId,next);
  next.then(()=>{},()=>{}).then(()=>{if(signatureQueue.get(actorId)===next)signatureQueue.delete(actorId);});
  return next;
}
/** Add the perks this character doesn't hold yet (re-checked inside the queue, so re-running adds nothing), then post one
 * chat note per profession. Returns the perks added. GM only. */
async function addSignaturePerks(actor,perks){
  requireSignatureGM();
  const added=await inSignatureQueue(actor.id,async()=>{
    const fresh=[...new Map(perks.filter(p=>!holdsSourceItem(actor,p.id)).map(p=>[p.id,p])).values()];
    if(!fresh.length)return [];
    const data=fresh.map(p=>{const copy=p.doc.toObject();for(const k of ['_id','folder','sort','ownership'])delete copy[k];return copy;});
    await actor.createEmbeddedDocuments('Item',data);
    return fresh;
  });
  for(const profId of [...new Set(added.map(p=>p.professionId))]){
    const mine=added.filter(p=>p.professionId===profId),name=professionNameOf(actor,profId);
    const tiers=[...new Set(mine.map(p=>p.tier))].map(t=>`${esc(signatureTierName(t))}: ${esc(mine.filter(p=>p.tier===t).map(p=>p.name).join(', '))}`).join(' · ');
    await whisperXpNote(actor,`<strong>${esc(actor.name)} earned ${mine.length===1?'a signature perk':'signature perks'} in ${esc(name)}</strong><span>${tiers}</span>`);
  }
  return added;
}
const signatureWarned=new Set();
/** Tell the GM once per session (notification and a GM whisper) when a reached tier has no grantable signature perk imported. */
function warnSignatureMissing(actor,profId,tier,why){
  const key=`${profId}:${tier}`;if(signatureWarned.has(key))return;signatureWarned.add(key);
  const name=professionNameOf(actor,profId),text=`${actor.name} reached ${signatureTierName(tier)} in ${name}, but ${why} Import the signature perks with General Manager; then use Assign → Signature perks to catch up.`;
  try{ui.notifications.warn(notifyText(text));}catch{}
  try{void globalThis.ChatMessage?.create?.({whisper:allUsers().filter(u=>u.isGM).map(u=>u.id),content:`<div class="agl-chat-card"><header><div><strong>Signature perk not granted</strong><span>${esc(text)}</span></div></header></div>`});}catch(err){console.warn(`[${ID}] signature note failed`,err);}
}
/**
 * ashenGateLedger.progressionChanged: for each signature tier the change crossed upward, add that profession's signature perks.
 * The hook fires only on the client that wrote the XP, which is always a GM, so exactly one client acts per change.
 * Lowering never removes anything (the hook's level only goes up here). A tier with nothing imported is reported once.
 */
async function onProgressionChanged(payload){
  if(!game.user?.isGM)return;
  const {actorId,profId,previousLevel,level}=payload??{};
  const tiers=tiersCrossed(previousLevel,level);
  if(!tiers.length)return;
  const actor=game.actors?.get?.(actorId);
  if(!actor||actor.type!=='character'||isLevelBackup(actor)||!linkedProfession(actor,profId))return;
  const defs=signaturePerkDefs(),forProfession=defs.filter(p=>p.professionId===profId);
  const expected=forProfession.length>0||GATHERING_KEYS.includes(professionKeyFromId(profId));
  const grant=[];
  for(const tier of tiers){
    const atTier=forProfession.filter(p=>p.tier===tier),ok=atTier.filter(p=>!signatureUnreleased(p));
    if(ok.length)grant.push(...ok);
    else if(atTier.length)warnSignatureMissing(actor,profId,tier,`its signature perks aren't released to players (${signatureUnreleased(atTier[0])})`);
    else if(expected)warnSignatureMissing(actor,profId,tier,`no ${signatureTierName(tier)} signature perk for ${professionNameOf(actor,profId)} is imported.`);
  }
  if(grant.length)await addSignaturePerks(actor,grant);
}
/** GM dry run for the catch-up: characters who hold a tier but lack its perks. Writes nothing. */
function signaturePerksPreview({actorIds=null}={}){
  requireSignatureGM();
  const actors=grantActors(actorIds,'signature perks'),defs=signaturePerkDefs();
  const rows=signaturePlan(actors,defs,{
    professions:a=>professionItems(a).map(i=>({id:agSourceId(i),name:professionDisplayName(i)||humanizeId(agSourceId(i)),level:progressOf(a,agSourceId(i))?.level??1})),
    holds:holdsSourceItem,unreleased:signatureUnreleased});
  return {actors:actors.map(a=>({id:a.id,name:a.name,hasProfession:professionItems(a).length>0})),rows,signaturePerks:defs.length};
}
/**
 * GM: add the 'new' rows of the preview (`rowIds` limits it). Re-checked just before writing, so a second run adds nothing.
 * A character that can't be updated is reported in `failed`; the others still get theirs (re-running finishes the job).
 * Returns {granted:[{actorId, actorName, perks:[{id, name, profession, tier}]}], skipped, failed}.
 */
async function grantSignaturePerks({actorIds=null,rowIds=null}={}){
  requireSignatureGM();
  const plan=signaturePerksPreview({actorIds}),defs=new Map(signaturePerkDefs().map(p=>[p.id,p]));
  const picked=selectedRows(plan,'new',rowIds);
  const granted=[],skipped=[],failed=[];
  for(const actorId of [...new Set(picked.map(r=>r.actorId))]){
    const actor=actorById(actorId),rows=picked.filter(r=>r.actorId===actorId);
    try{
      const added=await addSignaturePerks(actor,rows.map(r=>defs.get(r.perkId)).filter(Boolean));
      for(const r of rows)if(!added.some(p=>p.id===r.perkId))skipped.push({...r,reason:'already held'});
      if(added.length)granted.push({actorId,actorName:actor.name,perks:added.map(p=>({id:p.id,name:p.name,profession:professionNameOf(actor,p.professionId),tier:signatureTierName(p.tier)}))});
    }catch(err){console.error(`[${ID}] signature perks for ${actor.name}`,err);failed.push({actorId,actorName:actor.name,error:String(err?.message??err)});}
  }
  return {preview:false,granted,skipped,failed};
}
/**
 * What a recipe needs at the bench. Its own tool wins; a workstation-only recipe needs no tool; otherwise
 * the profession's tool. The tool check uses the recipe's tool, else the profession's tool.
 */
function craftRequirement(recipe,actor=null){
  const activity=isActivity(recipe),access=activityAccess(recipe);
  // The recipe's own tools: its single tool field plus every required_tools entry (all are needed for a craft).
  // 0.28.0: an activity's tools, and the tools in its access list, are alternatives: any one of them will do.
  const own=[toolRef(recipe?.tool),...(recipe?.tools??[]).map(requiredToolRef),...access.tools.map(requiredToolRef)].filter(Boolean)
    .filter((ref,i,list)=>list.findIndex(r=>toolRefLabel(r)===toolRefLabel(ref))===i);
  const profLabel=professionLabel(recipe),profTool=professionTool(profLabel);
  const tools=own.length?own:recipe?.workstation||!profTool?[]:[profTool];
  // 0.32.2: one tool requirement that is the profession's own (or one of its allowed tools) is met by ANY tool GM Setup
  // allows for that profession (Inscription: Calligrapher's Supplies, Cartographer's Tools or Painter's Supplies).
  const anyOf=activity?null:alternativeTools(tools,profLabel,{fromProfession:!own.length});
  const checks=own.length?own:profTool?[profTool]:[];
  const usable=ref=>heldTool(actor,ref)||(ref.key&&toolProficiencyMatches(actor,ref.key).length);
  const carriedRef=!actor||!anyOf?null:anyOf.find(ref=>heldTool(actor,ref))??null,carried=carriedRef;
  const missing=!actor?[]:activity?(tools.some(usable)?[]:tools):anyOf?(carried?[]:anyOf):tools.filter(ref=>!heldTool(actor,ref));
  // A profession whose main check is a skill (Enchanting: Arcana) offers that skill; a recipe tool is offered beside it.
  const skill=checkMapping().skills[professionKey(profLabel)]||null;
  const tool=tools[0]??null;
  const shown=anyOf??tools;
  return {tool,tools:anyOf??tools,anyOf:Boolean(anyOf),carried:carried?toolRefLabel(carried):null,activity,toolLabel:anyOf?orList(shown.map(toolRefLabel)):tools.map(toolRefLabel).join(activity?' or ':' + '),fromProfession:Boolean(tool&&!own.length),workstation:recipe?.workstation??null,
    check:checks[0]??null,skill,checkPlan:actor?craftCheckPlan(actor,{tools:expandToolGroups(actor,anyOf??checks),skill,skills:access.skills}):null,held:Boolean(actor&&tools.length&&!missing.length),
    lacks:missing.length>0,missing:missing.map(toolRefLabel)};
}
/** "A", "A or B", "A, B or C". */
const orList=names=>names.length<2?names.join(''):`${names.slice(0,-1).join(', ')} or ${names.at(-1)}`;
/** 0.32.2: the tools GM Setup allows for a profession (Tools column: GM edits, baseline file, imported content, else the
 * built-in default), as tool references. One synchronous pass shares the result, so a long recipe list reads it once. */
let toolSetMemo=null;
function professionToolSet(profLabel){
  const key=professionKey(profLabel);
  if(!toolSetMemo){toolSetMemo=new Map();queueMicrotask(()=>{toolSetMemo=null;});}
  if(toolSetMemo.has(key))return toolSetMemo.get(key);
  let list=[];
  try{
    const {catalog}=catalogCrosswalk(visibleProfessionDefinitions());
    const map=effectiveMapping(game.settings.get(ID,'checkMapping'),{catalog,baseline:baselineLayer()});
    list=(map.qualifyTools[key]??[]).map(k=>({key:k,uuid:null,name:null}));
  }catch(err){console.warn(`[${ID}] profession tool list`,err);}
  toolSetMemo.set(key,list);return list;
}
/** The tools any one of which meets a single tool requirement, or null when the requirement stays as it is (no tool, several
 * tools that are all needed, or a named tool outside the profession's allowed list). The check tool leads, then the rest. */
function alternativeTools(tools,profLabel,{fromProfession}){
  if(tools.length!==1)return null;
  const set=professionToolSet(profLabel),one=tools[0],sameKey=(a,b)=>a.key&&a.key===b.key;
  if(!set.length||!(fromProfession||set.some(r=>sameKey(r,one)||(one.name&&looseToolName(one.name)===looseToolName(toolLabel(r.key))))))return null;
  const list=[...set];
  if(fromProfession&&!list.some(r=>sameKey(r,one)))list.unshift(one);
  return list.length>1?list:null;
}
const skillIdOfName=name=>{const t=String(name??'').trim();return SKILL_IDS.includes(t)?t:SKILL_IDS.find(k=>norm(SKILL_LABELS[k])===norm(t))??null;};
/** 0.28.0: an activity recipe's optional access list ({toolProficienciesAnyOf, skillProficienciesAnyOf}), as extra check
 * choices: its tools as tool names (groups allowed), its skills as dnd5e skill ids. Empty for a craft recipe. */
function activityAccess(recipe){
  const raw=isActivity(recipe)?recipe?.sourceDefinition?.access??recipe?.access:null;
  const list=v=>Array.isArray(v)?v.filter(x=>typeof x==='string'&&x.trim()).slice(0,10):[];
  return {tools:list(raw?.toolProficienciesAnyOf),skills:[...new Set(list(raw?.skillProficienciesAnyOf).map(skillIdOfName).filter(Boolean))]};
}
/** "doesn't carry X" for one tool, "doesn't carry X, Y" when several of the required tools are missing.
 * 0.28.0: an activity's tools are alternatives, so it says the character has none of them. */
const lacksText=(req,actor)=>req.anyOf?`${actor.name} carries none of these`:req.activity?(req.tools.length>1?`${actor.name} has none of these`:`${actor.name} doesn’t have this`)
  :req.tools.length>1?`${actor.name} doesn’t carry ${req.missing.join(', ')}`:`${actor.name} doesn’t carry this`;
function requirementHTML(req,actor){
  const parts=[];
  if(req.tool){
    // 0.32.2: any-of requirement: the readable list; with a character, which one is carried, or that one of them is needed.
    const text=req.anyOf&&actor&&req.lacks?`Needs one of: ${req.toolLabel}`:req.toolLabel;
    const state=!actor?'':req.lacks?badge(req.anyOf?'None carried':lacksText(req,actor),'warn'):req.anyOf?badge(`${req.carried}: carried`,'ok'):badge(req.activity?'Ready':req.tools.length>1?'All carried':'Carried','ok');
    parts.push(`<span class="agl-station"><i class="fa-solid fa-screwdriver-wrench" aria-hidden="true"></i><span class="agl-label agl-label--inline">${req.activity?'Uses':'Tool'}</span> <span>${esc(text)}</span>${state?` ${state}`:''}</span>`);}
  if(req.workstation)parts.push(`<span class="agl-station"><i class="fa-solid fa-warehouse" aria-hidden="true"></i><span class="agl-label agl-label--inline">Station</span> <span>${esc(req.workstation)}</span></span>`);
  if(!parts.length&&!req.activity)parts.push('<span class="agl-station agl-sub"><i class="fa-solid fa-screwdriver-wrench" aria-hidden="true"></i><span class="agl-label agl-label--inline">Tool or station</span> <span>None needed</span></span>');
  return parts.length?`<div class="agl-recipe-station">${parts.join('')}</div>`:'';
}

/** 0.32.0: a short stable key for a recipe, so two cards that show the same item keep distinct focus keys on re-render.
 * It is only a data attribute; no id is ever shown. */
const ctxKey=text=>{let h=0;for(const c of String(text??''))h=(h*31+c.charCodeAt(0))|0;return (h>>>0).toString(36);};
/** 0.32.0: can this user open this definition's world Item? Players only get an approved, player-visible Item they have at
 * least Observer permission on; the GM gets any active one. Returns {state:'ok',doc} | {state:'hidden'} (player, not allowed)
 * | {state:'missing'|'blocked'} (GM: not imported, or duplicate/wrong type). Never exposes a document the user may not open. */
function itemAccess(sourceId,entityType){
  const gm=Boolean(game.user?.isGM);
  const hit=lookupWorldDefinition(game,sourceId,{entityType,partyKnown:!gm});
  if(hit?.status!=='ok'||!hit.document)return {state:gm?(hit?.status==='not_found'||hit?.status==='invalid'?'missing':'blocked'):'hidden'};
  if(!gm){
    if(hit.source?.visibility!=='player'||hit.source?.status!=='approved')return {state:'hidden'};
    try{if(hit.document.testUserPermission?.(game.user,'OBSERVER')!==true)return {state:'hidden'};}catch{return {state:'hidden'};}
  }
  return {state:'ok',doc:hit.document};
}
/** 0.32.0: one item a recipe names, as a link when the user may open it. A link is a real button; otherwise the name is plain
 * text, with a tooltip for a player and a GM-only hint for the GM (never an id). `sourceId` may be null (name only). */
function itemRef(name,sourceId,entityType,ctx=''){
  const label=esc(name||'Unknown item');
  if(!sourceId)return `<span class="agl-item-plain">${label}</span>`;
  const access=itemAccess(sourceId,entityType);
  if(access.state==='ok'&&access.doc?.uuid)
    return `<button type="button" class="ag-link agl-item-link" data-action="open-item" data-uuid="${esc(access.doc.uuid)}" data-ctx="${esc(ctx)}" ${tip('Show this item')}>${label}</button>`;
  if(game.user?.isGM)
    return `<span class="agl-item-plain">${label}</span> <small class="agl-sub">GM: ${access.state==='missing'?'not imported yet':'can’t be opened (duplicate or wrong record type)'}</small>`;
  return `<span class="agl-item-plain" ${tip('Your GM hasn’t released this item to you yet.')}>${label}</span>`;
}
/** 0.32.0: open the world Item behind an item link, re-checking permission now (the markup is never trusted). */
async function openItemLink(uuid){
  const m=/^Item\.([A-Za-z0-9]{16})$/.exec(String(uuid??''));
  const doc=m?game.items?.get?.(m[1]):null;
  const src=doc?definitionSource(doc):null;
  // Only what a recipe links to: a Material or an Item, never a recipe, profession or other record.
  if(!doc||!src?.sourceId||!['Material','Item'].includes(src.entityType))return say('That item can’t be opened.',true);
  const access=itemAccess(src.sourceId,src.entityType);
  if(access.state!=='ok'||access.doc!==doc)return say(game.user?.isGM?'That item can’t be opened.':'You can’t open this item yet.',true);
  await doc.sheet?.render?.(true);
}
/** Click on an item link (any surface: window, Tidy5e tab, Character Hub embed). Returns true when it handled the click. */
function itemLinkClick(button){
  if(button?.dataset?.action!=='open-item')return false;
  void openItemLink(button.dataset.uuid).catch(err=>{console.error(`[${ID}]`,err);say(`Profession Ledger: ${err.message}`,true);});
  return true;
}

/** Baseline recipe row used by every list (Individual, Party, Catalog, sheet tab). */
function recipeRow(recipe,lib,{actor=null,craft=null,knownBy=[],foundBy=[],showStatus=true,learnItem=null,available=true}={}){
  const gm=game.user.isGM;
  const result=craft?.result??resultDocument(recipe);
  const ctx=ctxKey(recipe.id);
  const ingredients=recipe.hasStructuredIngredients?recipe.ingredients.map(ing=>{
    const name=ingredientName(ing,lib);
    const req=craft?.plan.requirements.find(r=>r.materialId?r.materialId===ing.materialId:r.name===name);
    const state=!req?'':req.own>=req.required?'ok':req.party>=req.required?'partial':'warn';
    const have=req?` <small>(${req.own} on hand${req.party>req.own?`, ${req.party} in party`:''})</small>`:'';
    return `<li class="agl-ing ${state}"><span class="agl-qty">${ing.quantity} ×</span> ${itemRef(name,ing.materialId,'Material',ctx)}${have}</li>`;
  }).join(''):'<li class="agl-ing">No ingredient list yet</li>';
  const status=[];
  if(showStatus){
    if(gm)status.push(draftBadge(recipe.status,recipe.sourceVisibility));
    if(knownBy.length)status.push(badge(`Known by ${nameList(knownBy)}`,'ok'));
    if(foundBy.length)status.push(badge(`${recipeWord(recipe)} item: ${nameList(foundBy)}`,'recipe'));
    if(gm&&!knownBy.length&&!foundBy.length)status.push(badge('Not found by the party yet','muted'));
  }
  let actions='';
  const activity=isActivity(recipe);
  // 0.28.0: an activity has Complete activity in place of Craft (no materials to check).
  if(craft&&actor&&activity){
    const button=(attrs='disabled')=>`<button type="button" class="ag-btn" ${attrs}><i class="fa-solid fa-masks-theater" aria-hidden="true"></i> Complete activity</button>`;
    if(craft.blockers.length)actions=`${owned(actor)?button():''}<span class="agl-reason">${esc(craft.blockers[0])}</span>`;
    else if(owned(actor))actions=button(`data-action="complete-activity" data-id="${esc(recipe.id)}" data-actor="${esc(actor.id)}"`);
  }else if(craft&&actor){
    const {blockers,plan}=craft;
    const missing=plan.missing.map(m=>`${m.missing} × ${m.name}`).join(', ');
    // 0.26.2: a blocked recipe still shows its (disabled) Craft button beside the reason, like a recipe missing materials.
    if(blockers.length)actions=`${owned(actor)?'<button type="button" class="ag-btn" disabled><i class="fa-solid fa-hammer" aria-hidden="true"></i> Craft</button>':''}<span class="agl-reason">${esc(blockers[0])}</span>`;
    else if(!owned(actor))actions='';
    else if(plan.ownReady)actions=`<button type="button" class="ag-btn" data-action="craft" data-id="${esc(recipe.id)}" data-actor="${esc(actor.id)}"><i class="fa-solid fa-hammer" aria-hidden="true"></i> Craft</button>`;
    else if(plan.ready)actions=`<button type="button" class="ag-btn" data-action="craft" data-id="${esc(recipe.id)}" data-actor="${esc(actor.id)}"><i class="fa-solid fa-hand-holding" aria-hidden="true"></i> Craft — ask the party</button><span class="agl-reason">Uses ${esc([...new Set(plan.foreign.map(a=>a.actorName))].join(', '))}’s materials</span>`;
    else actions=`<button type="button" class="ag-btn" disabled><i class="fa-solid fa-hammer" aria-hidden="true"></i> Craft</button><span class="agl-reason">Missing ${esc(missing)}</span>`;
  }
  if(learnItem&&actor)actions=learnControl(actor,learnItem,{available});
  const gp=extraCost(recipe);
  const effort=recipe.effort?`${String(recipe.effort)[0].toUpperCase()}${String(recipe.effort).slice(1)} effort`:'';
  const meta=[activity?'Activity':'',tierLabel(recipe.tier),effort].filter(Boolean);
  const search=`${recipe.name} ${professionLabel(recipe)} ${recipeWord(recipe)} ${meta.join(' ')} ${result?.name??''} ${activity?effectNote(recipe)??'':''}`.toLowerCase();
  // 0.32.0: header (name, tier, effort), then Needs → Makes, then the tool or station, then the quieter text, then who knows it.
  const makes=result?`<span class="agl-qty">1 ×</span> ${itemRef(result.name,recipe.resultItemId,'Item',ctx)}`
    :`<span class="agl-reason">${gm&&recipe.resultItemId?'The result item is not imported yet':'Not available yet'}</span>`;
  return `<article class="ag-card agl-recipe-row" data-recipe-search="${esc(search)}">
    <div class="agl-recipe-head">
      <div class="agl-recipe-title">${learnItem?'<i class="fa-solid fa-scroll agl-recipe-mark" aria-hidden="true"></i>':''}<strong>${esc(recipe.name)}</strong>
        <span class="agl-recipe-badges">${activity?badge('Activity'):''}${tierBadge(tierLabel(recipe.tier),esc)}${effort?`<span class="ag-badge agl-effort"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${esc(effort)}</span>`:''}</span></div>
      <div class="agl-recipe-actions">${actions}</div>
    </div>
    ${activity?'':`<div class="agl-recipe-flow">
      <div class="agl-recipe-needs"><span class="agl-label">Needs</span><ul class="agl-ings">${ingredients}</ul></div>
      <i class="fa-solid fa-arrow-right agl-recipe-arrow" aria-hidden="true"></i>
      <div class="agl-recipe-makes"><span class="agl-label">Makes</span><div>${makes}</div></div>
    </div>`}
    ${gp?`<div><small class="agl-sub">Also costs ${gp} gp (not deducted automatically)</small></div>`:''}
    ${requirementHTML(craftRequirement(recipe,craft?actor:null),craft?actor:null)}
    ${recipe.description?`<p class="agl-recipe-summary">${esc(recipe.description)}</p>`:''}
    ${effectNoteHtml(recipe)}
    ${status.filter(Boolean).length?`<div class="agl-recipe-status">${status.join(' ')}</div>`:''}
  </article>`;
}
function learnControl(actor,item,{available=true}={}){
  const id=agSourceId(item),state=canLearnRecipe(actor,item,id);
  if(game.user.isGM&&actor.hasPlayerOwner)return `<span class="agl-reason">${esc(actor.name)}’s player learns this</span>`;
  if(!owned(actor))return '';
  // 0.26.2: say where Craft is, or why there is none (a known recipe whose record the player can't read isn't listed).
  if(knownRecipesOf(actor).includes(id))return `${badge('Already known','ok')}<span class="agl-reason">${available?'Craft it under Known recipes':game.user.isGM?'Not in the recipe catalog: import it with General Manager':'Can’t be crafted yet: your GM hasn’t released this recipe'}</span>`;
  if(!state.ok)return `<span class="agl-reason">${esc(state.reason)}</span>`;
  return `<button type="button" class="ag-btn" data-action="learn-recipe" data-id="${esc(`${actor.id}:${item.id}`)}" data-actor="${esc(actor.id)}"><i class="fa-solid fa-book" aria-hidden="true"></i> Learn</button>`;
}
/** 0.29.0: a profession folder counts its recipes in the profession's word ("2 formulas"), from its recipes' profession.
 * Folders of other things (Gathering Nodes) show the number only. */
const folderWord=g=>{const recipe=g.rows.find(r=>r.recipe)?.recipe;return recipe?` ${recipeWord(recipe,{plural:g.rows.length!==1,capitalize:false})}`:'';};
/** Folders grouped by profession; native <details> so they work without the app (sheet tab). Rows: {group, html, recipe?}. */
const BIG_FOLDER_ROWS=40;
function folders(rows,closed=new Set()){
  if(!rows.length)return '';
  const groups=new Map();
  for(const row of rows){const key=norm(row.group)||'unassigned';if(!groups.has(key))groups.set(key,{key,name:row.group||'Unassigned profession',rows:[]});groups.get(key).rows.push(row);}
  // A big list (a world with hundreds of recipes) starts with every folder shut, so the window opens at a glance;
  // such folders remember being opened as `open:<key>`. Search still opens the folders that match.
  const big=rows.length>BIG_FOLDER_ROWS;
  const isOpen=g=>big?closed.has(`open:${g.key}`):!closed.has(g.key);
  return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(g=>`<details class="agl-folder" data-folder="${esc(g.key)}" ${big?'data-big ':''}${isOpen(g)?'open':''}>
    <summary><i class="fa-solid fa-folder-open" aria-hidden="true"></i> <strong>${esc(g.name)}</strong> <span class="ag-badge">${g.rows.length}${esc(folderWord(g))}</span></summary>
    <div class="agl-folder-body">${g.rows.map(r=>r.html).join('')}</div></details>`).join('');
}
const HISTORY_LABELS={award:'Awarded',adjust:'Adjusted',set:'Set',undo:'Award undone'};
/** 0.26.0: which half of a card's "GM: XP" fold is showing (award | adjust), per actor and profession, for this client. */
const xpModes=new Map();
const XP_MODES=[['award','Award'],['adjust','Adjust']];
/** GM only: one "GM: XP" fold per profession card: Award or Adjust (a segmented switch), then the recorded history.
 * Players never receive this markup. */
function xpPanel(actor,p){
  const key=`${actor.id}:${p.sourceId}`,mode=xpModes.get(key)==='adjust'?'adjust':'award';
  const rows=xpHistoryOf(actor,p.sourceId).slice(-8).reverse().map(h=>`<li>${esc(new Date(h.at??0).toLocaleString())} · ${esc(h.byName??'GM')} · ${esc(HISTORY_LABELS[h.kind]??h.kind)} ${h.delta>0?'+':h.delta<0?'−':''}${Math.abs(Number(h.delta)||0)} (${Number(h.from)} → ${Number(h.to)})${h.reason?` · ${esc(h.reason)}`:''}${h.messageId?' · from chat card':''}</li>`).join('');
  const attrs=`data-id="${esc(p.sourceId)}" data-actor="${esc(actor.id)}"`;
  const body=`<div class="ag-segmented" role="radiogroup" aria-label="${esc(p.name)} XP change">${XP_MODES.map(([m,label])=>`<button type="button" role="radio" aria-checked="${mode===m}" data-action="xp-mode" data-mode="${m}" data-key="${esc(key)}">${label}</button>`).join('')}</div>
    <div class="agl-xp-award" data-xp-pane="award"${mode==='award'?'':' hidden'}><label class="ag-field">Award XP <input type="number" data-xp-input="${esc(p.sourceId)}" min="1" max="1000" step="1" value="1"></label><button type="button" class="ag-btn" data-action="award-xp" ${attrs}>Award ${esc(p.name)} XP</button></div>
    <div class="agl-xp-award" data-xp-pane="adjust"${mode==='adjust'?'':' hidden'}><label class="ag-field">Change (+/−) <input type="number" step="1" data-xp-delta="${esc(p.sourceId)}" placeholder="−5"></label>
    <label class="ag-field">or Set to <input type="number" min="0" max="${XP_CAP}" step="1" data-xp-set="${esc(p.sourceId)}" placeholder="${p.xp}"></label>
    <label class="ag-field">Why <input type="text" maxlength="200" data-xp-reason="${esc(p.sourceId)}" placeholder="Accidental award"></label>
    <button type="button" class="ag-btn" data-action="adjust-xp" ${attrs}>Adjust XP…</button></div>
    ${rows?`<p class="agl-sub">XP history (GM only):</p><ul class="agl-sub agl-xp-history">${rows}</ul>`:''}`;
  return fold({key:`xp:${key}`,title:'GM: XP',body});
}
/** The "GM: XP" Award/Adjust switch. Only the panes inside this card change; nothing is saved. Works in the window,
 * the Tidy5e tab and the Character Hub embed (each click handler calls this first). Returns true when it handled the click. */
function xpModeClick(button){
  if(button?.dataset?.action!=='xp-mode')return false;
  const mode=button.dataset.mode==='adjust'?'adjust':'award';
  xpModes.set(button.dataset.key,mode);
  const fold=button.closest?.('.ag-fold');
  fold?.querySelectorAll?.('[data-action="xp-mode"]')?.forEach(b=>b.setAttribute('aria-checked',String(b.dataset.mode===mode)));
  fold?.querySelectorAll?.('[data-xp-pane]')?.forEach(pane=>{pane.hidden=pane.dataset.xpPane!==mode;});
  return true;
}
function professionCard(actor,p,{lastAward=null}={}){
  const gm=game.user.isGM;
  const flash=lastAward&&lastAward.actorId===actor.id&&lastAward.profId===p.sourceId;
  const value=`${p.xp} XP${p.toNext!==null?` · ${p.toNext} XP to level ${p.level+1}`:' · maximum level'}`;
  return `<div class="ag-card agl-prof ${flash?'agl-flash':''}">
    <div class="agl-prof-head"><strong class="agl-prof-name" data-tooltip="${esc(p.name)}">${esc(p.name)}</strong><span class="agl-prof-badges">${badge(`Level ${p.level}`,'ok')}${gm&&p.draft?badge('Draft','warn'):''}${flash?badge(`+${lastAward.points} XP`,'recipe'):''}</span></div>
    <div class="ag-meter ag-meter--ok"><span class="ag-meter__label">${tierBadge(p.tier,esc)}</span><span class="ag-meter__value">${esc(value)}</span><span class="ag-meter__track" role="progressbar" aria-label="${esc(p.name)} XP" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.percent}" aria-valuetext="${esc(value)}" style="--ag-meter:${p.percent}%"><span class="ag-meter__fill"></span></span></div>
    ${p.tracked?'':'<div class="agl-sub">No XP awarded yet.</div>'}
    ${gm?xpPanel(actor,p):''}
  </div>`;
}
/** The crafting panel for one character: used by the Individual tab and the Tidy5e sheet tab. */
function characterPanel(actor,lib,{closed=new Set(),lastAward=null,surface='app'}={}){
  const profs=professionsOf(actor),mats=materialsOf(actor,lib);
  const known=knownRecipesOf(actor);
  const knownRows=known.map(id=>partyRecipeDefinition(id,lib)).filter(Boolean).map(recipe=>({group:professionLabel(recipe),recipe,
    html:recipeRow(recipe,lib,{actor,craft:craftContext(actor,recipe,lib),knownBy:[actor],showStatus:game.user.isGM})}));
  const hiddenKnown=known.length-knownRows.length;
  const toLearn=recipeItems(actor).map(item=>{
    const id=agSourceId(item),def=partyRecipeDefinition(id,lib);
    const recipe=def??{id,name:recipeTitle(item.name),ingredients:[],hasStructuredIngredients:false,sourceVisibility:sourceVisibility(item)};
    return recipeRow({...recipe,status:itemStatus(item)},lib,{actor,learnItem:item,knownBy:known.includes(id)?[actor]:[],foundBy:[actor],showStatus:game.user.isGM,available:Boolean(def)});
  });
  return `<div class="agl-character ${surface==='sheet'?'agl-on-sheet':''}">
    <section class="agl-col-side">
      <div class="agl-section"><h3>Professions</h3>
        ${profs.map(p=>professionCard(actor,p,{lastAward})).join('')||emptyState(`${esc(actor.name)} has no profession yet.`,game.user.isGM?'Drag a profession feature (imported by General Manager) onto the character sheet, or use Assign.':'Your GM adds professions to your character.')}
        ${profs.length?`<p class="agl-sub agl-where"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> XP is stored on ${esc(actor.name)} by the Profession Ledger, and also shown in each profession feature’s description on the character sheet.</p>`:''}
      </div>
      <div class="agl-section"><h3>Materials</h3>
        ${mats.length?`<ul class="ag-rows">${mats.map(i=>`<li class="ag-row"><span class="ag-row__main"><span class="ag-row__title">${esc(i.name)}</span>${rowMeta(qualityBadge(materialQuality(i.sourceId,lib)))}</span><span class="ag-row__end"><b>× ${i.qty}</b></span></li>`).join('')}</ul>`
          :emptyState('No crafting materials yet.','Materials appear here when the character gathers or carries them.')}
      </div>
    </section>
    <section class="agl-col-main">
      ${toLearn.length?`<div class="agl-section"><h3>Recipes to learn <span class="ag-badge">${toLearn.length}</span></h3>
        <p class="agl-sub">Recipe items in ${esc(actor.name)}’s inventory. Learning uses up one recipe item.</p>${toLearn.join('')}</div>`:''}
      <div class="agl-section"><h3>Known recipes <span class="ag-badge">${knownRows.length}</span></h3>
        ${folders(knownRows,closed)||emptyState(`${esc(actor.name)} hasn’t learned a recipe yet.`,toLearn.length?'Learn one from a recipe item above.':'A recipe item in the inventory can be learned here.')}
        ${hiddenKnown>0?`<p class="agl-sub">${game.user.isGM?`${plural(hiddenKnown,'known recipe is','known recipes are')} not in this world’s recipe catalog, so ${hiddenKnown===1?'it isn’t':'they aren’t'} listed and can’t be crafted. Import ${hiddenKnown===1?'it':'them'} with General Manager.`
          :`${plural(hiddenKnown,'known recipe is','known recipes are')} not available right now: your GM hasn’t released ${hiddenKnown===1?'it':'them'} in this world yet, so ${hiddenKnown===1?'it':'they'} can’t be crafted.`}</p>`:''}
      </div>
    </section>
  </div>`;
}

/** Cross-character crafts: the primary GM client asks each supplying character's owner, then crafts. */
const pendingCrafts=new Map();
let broker=null;
const consentDialogs=new Map();
const activeGM=()=>game.users?.activeGM??allUsers().find(u=>u.isGM&&u.active)??null;
function sendSocket(message){
  const payload={...message,userId:game.user.id};
  try{game.socket?.emit?.(SOCKET,payload);}catch(err){console.error(`[${ID}] socket emit failed`,err);}
  // Foundry does not echo a socket message to its sender; deliver locally as well.
  queueMicrotask(()=>void onSocket(payload,game.user.id));
}
function getBroker(){return broker??=new ConsentBroker({send:sendSocket,newId});}
async function onSocket(message,senderId){
  if(!message||typeof message!=='object')return;
  const from=typeof senderId==='string'?senderId:message.userId;
  try{
    switch(message.type){
      case 'craft-request': if(game.user.isGM&&activeGM()?.id===game.user.id&&from!==game.user.id)await orchestrateCraft(message,from);return;
      case 'craft-result': {if(message.toUserId!==game.user.id)return;const wait=pendingCrafts.get(message.requestId);if(wait){pendingCrafts.delete(message.requestId);wait(message);}return;}
      case 'consent-request': if(Array.isArray(message.toUserIds)&&message.toUserIds.includes(game.user.id))await showConsent(message);return;
      case 'consent-response': if(game.user.isGM)getBroker().deliver(message,from);return;
      case 'consent-closed': {for(const [key,dialog] of consentDialogs)if(key.startsWith(`${message.requestId}:`)){consentDialogs.delete(key);dialog?.close?.();}return;}
      case 'gather-request': if(game.user.isGM&&activeGM()?.id===game.user.id&&from!==game.user.id)await handleGatherRequest(message,from);return;
      case 'gather-request-result': {if(message.toUserId!==game.user.id||!userById(from)?.isGM)return;receiveGatherRequestResult(message);return;}
      case 'gather-requests-cleared': if(!game.user.isGM&&userById(from)?.isGM&&myGatherRequests.size){myGatherRequests.clear();say('The GM reloaded: gathering requests that were waiting were cleared. Ask again if you still want to gather.');refreshLedger();}return;
      case 'gather-roll': if(!game.user.isGM&&Array.isArray(message.toUserIds)&&message.toUserIds.includes(game.user.id))await showGatherRoll(message);return;
      case 'gather-rolled': if(game.user.isGM&&activeGM()?.id===game.user.id)await receiveGatherRoll(message,from);return;
      case 'gather-closed': if(incomingRolls.delete(message.sessionId)||gatherDialogs.has(`roll:${message.sessionId}`)){closeGatherDialogs(`roll:${message.sessionId}`);if(message.reason&&!game.user.isGM)say(message.reason);refreshLedger();}return;
    }
  }catch(err){console.error(`[${ID}] socket ${message.type}`,err);}
}
/** Popup on the material owner's screen. Closing the window counts as Decline. */
async function showConsent(message){
  const key=`${message.requestId}:${message.consentId}`;
  const rows=(message.rows??[]).map(r=>`<li>${Number(r.quantity)} × ${esc(r.name)}</li>`).join('');
  const content=`<p><strong>${esc(message.requesterName)}</strong> wants to craft <strong>${esc(message.recipeName)}</strong> for ${esc(message.crafterName)} using materials from <strong>${esc(message.actorName)}</strong>:</p><ul>${rows}</ul><p>If you allow it, these are removed from ${esc(message.actorName)}’s inventory when the item is crafted. Declining cancels the craft.</p>`;
  const answer=await new Promise(resolve=>{
    let settled=false;const done=value=>{if(!settled){settled=true;resolve(value);}};
    try{
      const dialog=new DialogV2({id:`agl-consent-${message.consentId}`,classes:['agl-consent','ag-app','ag-dialog'],window:{title:`Allow ${message.actorName}’s materials?`},content,modal:false, // ag-lint-allow: custom dialog, has ag-dialog classes
        buttons:[{action:'decline',label:'Decline',icon:'fa-solid fa-xmark',callback:()=>done(false)},{action:'allow',label:'Allow',icon:'fa-solid fa-check',default:true,callback:()=>done(true)}],
        rejectClose:false});
      const close=dialog.close?.bind(dialog);
      dialog.close=async(...args)=>{done(false);return close?.(...args);};
      consentDialogs.set(key,dialog);
      dialog.render({force:true});
    }catch(err){console.error(`[${ID}] consent dialog`,err);done(false);}
  });
  // Already closed by the requester (cancelled, timed out, or answered by another owner).
  if(!consentDialogs.delete(key))return;
  sendSocket({type:'consent-response',requestId:message.requestId,consentId:message.consentId,approved:answer===true});
}
/** GM side: re-plans with the requester's own view, asks owners, then crafts. */
async function orchestrateCraft(request,senderId){
  const reply=(ok,text)=>{
    if(request.requesterId!==game.user.id)sendSocket({type:'craft-result',requestId:request.requestId,toUserId:request.requesterId,ok,message:text});
    return {ok,message:text};
  };
  if(!game.user.isGM)throw Error('Only the GM client coordinates shared-material crafts');
  const requester=userById(request.requesterId);
  if(!requester||(senderId&&senderId!==request.requesterId))return reply(false,'Craft request could not be verified');
  const crafter=game.actors?.get?.(request.crafterId);
  if(isLevelBackup(crafter))return reply(false,LEVEL_BACKUP_REFUSAL);
  if(!crafter||!userOwns(requester,crafter))return reply(false,'You need to own the crafting character');
  const lib=catalog(),recipe=lib.recipes.find(r=>r.id===request.recipeId);
  if(!recipe||(!requester.isGM&&hiddenFromPlayers(recipe)))return reply(false,'This recipe is not available');
  const result=resultDocument(recipe,{forPlayer:!requester.isGM});
  const blockers=craftBlockers({recipe,crafter,knownIds:knownRecipesOf(crafter),result,label:recipeWord(recipe,{capitalize:false})});
  if(blockers.length)return reply(false,blockers[0]);
  const contributors=partyActorsFor(requester);
  const opts={materialDefs:lib.materials,playerView:!requester.isGM,nameOf:ing=>ingredientName(ing,lib)};
  const plan=planCraft(recipe,crafter,contributors,opts);
  if(!plan.ready)return reply(false,`Missing ${plan.missing.map(m=>`${m.missing} × ${m.name}`).join(', ')}`);
  const isForeign=actor=>actor.id!==crafter.id&&(requester.isGM||!userOwns(requester,actor));
  const byActor=new Map();
  for(const a of plan.allocations){const actor=game.actors.get(a.actorId);if(!actor||!isForeign(actor))continue;
    if(!byActor.has(actor.id))byActor.set(actor.id,{actor,rows:[]});byActor.get(actor.id).rows.push({name:a.name,quantity:a.quantity});}
  const requests=[],approved=new Set();
  for(const {actor,rows} of byActor.values()){
    const ownerIds=allUsers().filter(u=>u.active&&!u.isGM&&actor.testUserPermission?.(u,'OWNER')).map(u=>u.id);
    // No owner online: the GM answers for that character. A GM's own request needs no second click.
    if(!ownerIds.length&&requester.id===game.user.id){approved.add(actor.id);continue;}
    requests.push({actorId:actor.id,actorName:actor.name,approverIds:ownerIds.length?ownerIds:[game.user.id],rows});
  }
  const consent=await getBroker().ask({requestId:request.requestId,requester:requester.name,crafterName:crafter.name,recipeName:recipe.name,requests});
  if(!consent.approved)return reply(false,`${consent.reason??'Declined'}. Nothing was used.`);
  for(const r of requests)approved.add(r.actorId);
  // Inventories may have changed while waiting: plan again and only use approved characters.
  const again=planCraft(recipe,crafter,contributors.filter(a=>approved.has(a.id)||!isForeign(a)),opts);
  if(!again.ready)return reply(false,'Materials changed while waiting for approval. Nothing was used; try again.');
  try{
    const out=await runCraft(crafter,recipe,again.allocations,result,actor=>actor.id===crafter.id||approved.has(actor.id)||userOwns(requester,actor),craftCheckFromRequest(recipe,crafter,request.check));
    return reply(true,`${crafter.name} crafted ${out.created?.name??result.name}.`);
  }catch(err){return reply(false,err.message);}
}
/** The requester rolled the tool check on their own client; the GM keeps only the numbers and re-labels it. */
function craftCheckFromRequest(recipe,crafter,check){
  const plan=craftRequirement(recipe,crafter).checkPlan;
  if(!plan||!check)return null;
  const picked=plan.options.find(o=>`${o.kind}:${o.key??o.ref?.name??o.ref?.uuid}`===check.choice)??plan.selected;
  const label=checkOption(crafter,picked).label;
  const total=Number(check.total),mode=Math.sign(Number(check.mode)||0);
  return Number.isSafeInteger(total)&&total>=-20&&total<=100?{label,total,mode}:{label,unavailable:true};
}
async function runCraft(crafter,recipe,allocations,result,allowed,check=null){
  if(craftLocks.has(crafter.id))throw Error(`${crafter.name} is already crafting`);
  craftLocks.add(crafter.id);
  try{
    const out=await executeCraft({crafter,recipe,allocations,resultId:recipe.resultItemId,
      resultData:(await craftResultData(result,{recipeId:recipe.id,resultId:recipe.resultItemId,awardCore:awardCoreItems(),loadCore:uuid=>fromUuid(uuid)})).data,
      actorOf:id=>game.actors?.get?.(id),canWrite:actor=>owned(actor)&&allowed(actor)});
    await craftChatCard(crafter,recipe,result,out.consumed,check);
    return out;
  }finally{craftLocks.delete(crafter.id);}
}
const modeText=mode=>mode>0?' with advantage':mode<0?' with disadvantage':'';
/** Chat card line for a tool check (shown, no automatic failure yet). */
const checkLine=check=>!check?'':check.unavailable?`<p class="agl-chat-note">${esc(check.label)} check: not rolled (dnd5e could not roll it here).</p>`
  :`<p><strong>${esc(check.label)} check:</strong> ${Number(check.total)}${modeText(check.mode)}</p>`;
/** XP stays GM-coordinated: the card carries what to award; the GM's client adds the button (see decorateChatCard). */
function xpFlag(kind,actor,{professionId=null,professionName='',suggested=null,suggestedBasis=null}={}){
  const profId=professionId&&linkedProfession(actor,professionId)?professionId:null,amount=Number.isSafeInteger(suggested)&&suggested>0?suggested:null;
  // 0.29.0: how the suggested amount was worked out (plain words, GM only), for an activity card.
  return {kind,actorId:actor.id,actorName:actor.name,professionId:profId,professionName:String(professionName||''),suggested:amount,
    ...(amount&&typeof suggestedBasis==='string'&&suggestedBasis?{suggestedBasis:suggestedBasis.slice(0,300)}:{}),awarded:null};
}
async function postXpCard(data,xp,extra={}){
  if(typeof globalThis.ChatMessage?.create!=='function')return null;
  const message=await ChatMessage.create({...data,flags:{...(data.flags??{}),[ID]:{xp}}});
  try{Hooks.callAll?.(XP_HOOK,{...structuredClone(xp),messageId:message?.id??null,...extra});}catch(err){console.warn(`[${ID}] ${XP_HOOK} listener failed`,err);}
  return message;
}
async function craftChatCard(crafter,recipe,result,consumed,check=null){
  if(typeof globalThis.ChatMessage?.create!=='function')return;
  const used=consumed.map(c=>`<li>${c.quantity} × ${esc(c.name)}${c.actorId!==crafter.id?` <em>(from ${esc(c.actorName)})</em>`:''}</li>`).join('');
  const prof=professionLabel(recipe);
  const profId=recipe.professionId??agSourceId(professionItems(crafter).find(i=>professionKey(professionDisplayName(i))===professionKey(prof)))??null;
  try{await postXpCard({speaker:ChatMessage.getSpeaker?.({actor:crafter}),content:`<div class="agl-chat-card">
    <header>${result?.img?`<img src="${esc(result.img)}" alt="" width="36" height="36">`:''}<div><strong>${esc(crafter.name)} crafted ${esc(result?.name??recipe.name)}</strong><span>${esc(prof)}${recipe.tier?` · ${esc(tierLabel(recipe.tier))}`:''}</span></div></header>
    ${checkLine(check)}<p>Used:</p><ul>${used}</ul>${extraCost(recipe)?`<p class="agl-chat-note">The ${esc(recipeWord(recipe,{capitalize:false}))} also lists ${extraCost(recipe)} gp of additional cost (not deducted automatically).</p>`:''}
    <div class="agl-xp-slot" data-agl-xp></div></div>`},xpFlag('craft',crafter,{professionId:profId,professionName:prof}),{recipeId:recipe.id,check});}
  catch(err){console.warn(`[${ID}] Craft succeeded; chat card failed`,err);}
}
const choiceOf=o=>`${o.kind}:${o.key??o.ref?.name??o.ref?.uuid}`;
/** The check part of the Craft and Complete activity dialogs: the check (a choice when there are several) and the roll mode. */
function checkPickHtml(actor,{cplan,picked,option,mode,preset,card}){
  if(!option)return '';
  return `<div class="agl-check-pick">${cplan.options.length>1?`<label class="ag-field">Check (bonus)<select name="check">${cplan.options.map(o=>{const c=checkOption(actor,o);return `<option value="${esc(choiceOf(o))}" ${o===picked?'selected':''}>${esc(c.label)}${o.kind==='tool'?' (tool)':''} ${formatBonus(c.bonus)}</option>`;}).join('')}</select></label>`
    :`<span><strong>${esc(option.label)} check</strong> ${formatBonus(option.bonus)}${option.proficient?'':' (not proficient)'}</span>`}
    <label class="ag-field ag-field--inline">Roll ${modeSelect(mode)}</label><p class="agl-sub">${esc(modeHint(preset))} The result goes on the ${esc(card)}; it doesn’t decide success yet.</p></div>`;
}
/** Player/GM entry point: checks, confirms, then crafts locally or asks the party through the GM. */
async function craft(actor,recipeId,{confirm=true}={}){
  checkPlayerLedger();
  playable(actor);
  if(!actor||!owned(actor))throw Error('You need to own that character to craft');
  if(!knownRecipesOf(actor).includes(recipeId))throw Error(`${actor.name} has not learned this recipe`);
  const lib=catalog(),recipe=partyRecipeDefinition(recipeId,lib);
  if(!recipe)throw Error('This recipe is not available to you');
  if(isActivity(recipe))throw Error(`${recipe.name} is an activity: use Complete activity`);
  const ctx=craftContext(actor,recipe,lib);
  if(ctx.blockers.length)throw Error(ctx.blockers[0]);
  if(!ctx.plan.ready)throw Error(`Missing ${ctx.plan.missing.map(m=>`${m.missing} × ${m.name}`).join(', ')}`);
  const list=ctx.plan.allocations.map(a=>`<li>${a.quantity} × ${esc(a.name)}${a.own?'':` — from <strong>${esc(a.actorName)}</strong>`}</li>`).join('');
  const foreign=[...new Set(ctx.plan.foreign.map(a=>a.actorName))];
  const req=craftRequirement(recipe,actor);
  const cplan=req.checkPlan;
  let picked=cplan?.selected??null;
  const advantageTools=advantageToolsFor(professionLabel(recipe)),advantageItems=advantageItemsFor(professionLabel(recipe));
  const presetOf=o=>o?.key?rollModeFor(actor,{kind:o.kind,key:o.key},{advantageTools,advantageItems}):{mode:0,sources:[]};
  let option=picked?checkOption(actor,picked):null;
  const preset=presetOf(picked);
  let mode=preset.mode;
  if(confirm){
    const needs=[req.tool?`<li>${req.anyOf?'Tool (any one)':req.tools.length>1?'Tools (all needed)':'Tool'}: <strong>${esc(req.toolLabel)}</strong>${req.lacks?` — <strong>${esc(req.anyOf||req.tools.length>1?`${lacksText(req,actor)}.`:`${actor.name} doesn’t carry this tool.`)}</strong>`:req.anyOf?` (${esc(req.carried)}: carried)`:' (carried)'}</li>`:'',
      req.workstation?`<li>Workstation: <strong>${esc(req.workstation)}</strong> (confirm with your GM)</li>`:'',
      extraCost(recipe)?`<li>Also costs ${extraCost(recipe)} gp — not deducted automatically.</li>`:''].join('');
    const answer=await DialogV2.wait({classes:['ag-app','ag-dialog'],window:{title:`Craft ${recipe.name}?`},modal:true,rejectClose:false, // ag-lint-allow: custom dialog, has ag-dialog classes
      content:`<p>${esc(actor.name)} crafts <strong>${esc(ctx.result.name)}</strong>, using:</p><ul>${list}</ul>${needs?`<ul>${needs}</ul>`:''}
        ${checkPickHtml(actor,{cplan,picked,option,mode,preset,card:'craft card'})}
        ${foreign.length?`<p>${esc(foreign.join(', '))}’s owner${foreign.length===1?'':'s'} will be asked on their screen. Any decline cancels the craft and nothing is used.</p>`:''}`,
      buttons:[{action:'cancel',label:'Cancel',callback:()=>false},{action:'craft',label:'Craft',default:true,callback:(event,button)=>({mode:button?.form?.elements?.mode?.value,check:button?.form?.elements?.check?.value})}]});
    if(!answer)return null;
    if(typeof answer==='object'&&answer.mode!=null)mode=Math.sign(Number(answer.mode)||0);
    const chosen=typeof answer==='object'?cplan?.options.find(o=>choiceOf(o)===answer.check):null;
    if(chosen&&chosen!==picked){picked=chosen;option=checkOption(actor,picked);}
  }
  let check=null;
  if(option){
    try{const rolled=await rollCheck(actor,option,mode);check=rolled?{label:option.label,total:rolled.total,mode}:{label:option.label,unavailable:true};}
    catch(err){throw Error(`Crafting cancelled (${err.message}). Nothing was used.`);}
  }
  if(!ctx.plan.foreign.length){
    const out=await runCraft(actor,recipe,ctx.plan.allocations,ctx.result,()=>true,check);
    return {ok:true,message:`${actor.name} crafted ${out.created?.name??ctx.result.name}.`};
  }
  const request={type:'craft-request',requestId:newId(),requesterId:game.user.id,crafterId:actor.id,recipeId,
    check:check&&!check.unavailable?{total:check.total,mode:check.mode,choice:picked?choiceOf(picked):null}:null};
  if(game.user.isGM)return orchestrateCraft(request,game.user.id);
  if(!activeGM())throw Error('Using another character’s materials needs the GM to be online');
  const outcome=new Promise(resolve=>{
    const timer=setTimeout(()=>{pendingCrafts.delete(request.requestId);resolve({ok:false,message:'No answer from the party in time. Nothing was used.'});},180000);
    pendingCrafts.set(request.requestId,message=>{clearTimeout(timer);resolve({ok:message.ok,message:message.message});});
  });
  sendSocket(request);
  say(`Asking ${foreign.join(', ')}’s owner${foreign.length===1?'':'s'}…`);
  return outcome;
}

/* ---- Creative activities (0.28.0) --------------------------------------------------------------
 * A Recipe record with kind "activity" (a performance, a commission, writing…) has no ingredients and makes no item.
 * Complete activity rolls the profession's check like Craft and posts a chat card where the GM awards profession XP,
 * exactly as from a craft card. Nothing is created, consumed or paid. */
const activityLocks=new Set();
const effortLabel=effort=>effort?`${String(effort)[0].toUpperCase()}${String(effort).slice(1)} effort`:'';
/** The record of a completed activity: a chat card with the check and the GM-only XP award (flag kind "activity"). */
async function activityChatCard(actor,recipe,check=null){
  if(typeof globalThis.ChatMessage?.create!=='function')return null;
  const prof=professionLabel(recipe);
  const profId=recipe.professionId??agSourceId(professionItems(actor).find(i=>professionKey(professionDisplayName(i))===professionKey(prof)))??null;
  const meta=[prof,recipe.tier?tierLabel(recipe.tier):'',effortLabel(recipe.effort)].filter(Boolean).join(' · ');
  // 0.29.0: the GM's award is prefilled with the suggested XP for the activity's tier and effort (still editable).
  const suggestion=suggestActivityXP(recipe.tier,recipe.effort),note=effectNote(recipe);
  return postXpCard({speaker:ChatMessage.getSpeaker?.({actor}),content:`<div class="agl-chat-card">
    <header><div><strong>${esc(actor.name)} completed ${esc(recipe.name)}</strong><span>${esc(meta)}</span></div></header>
    ${checkLine(check)}${note?`<p class="agl-chat-note"><strong>Effect:</strong> ${esc(note)} (the GM decides at the table)</p>`:''}<div class="agl-xp-slot" data-agl-xp></div></div>`},
    xpFlag('activity',actor,{professionId:profId,professionName:prof,suggested:suggestion.xp,suggestedBasis:suggestion.text}),{recipeId:recipe.id,effort:recipe.effort??null,check});
}
/** Player/GM entry point: the same checks as Craft (owner, known, tier level), the check dialog, the roll, then the card. */
async function completeActivity(actor,recipeId,{confirm=true}={}){
  checkPlayerLedger();
  playable(actor);
  if(!actor||!owned(actor))throw Error('You need to own that character to complete an activity');
  if(!knownRecipesOf(actor).includes(recipeId))throw Error(`${actor.name} has not learned this activity`);
  const lib=catalog(),recipe=partyRecipeDefinition(recipeId,lib);
  if(!recipe)throw Error('This activity is not available to you');
  if(!isActivity(recipe))throw Error(`${recipe.name} is crafted, not completed as an activity`);
  const ctx=craftContext(actor,recipe,lib);
  if(ctx.blockers.length)throw Error(ctx.blockers[0]);
  const req=craftRequirement(recipe,actor),cplan=req.checkPlan;
  let picked=cplan?.selected??null,option=picked?checkOption(actor,picked):null;
  const preset=picked?.key?rollModeFor(actor,{kind:picked.kind,key:picked.key}):{mode:0,sources:[]};
  let mode=preset.mode;
  if(confirm){
    const needs=[req.tool?`<li>${req.tools.length>1?'Uses one of':'Uses'}: <strong>${esc(req.toolLabel)}</strong>${req.lacks?` — <strong>${esc(`${lacksText(req,actor)}.`)}</strong>`:''}</li>`:'',
      req.workstation?`<li>Workstation: <strong>${esc(req.workstation)}</strong> (confirm with your GM)</li>`:'',
      extraCost(recipe)?`<li>Also costs ${extraCost(recipe)} gp — not deducted automatically.</li>`:''].join('');
    const meta=[tierLabel(recipe.tier),effortLabel(recipe.effort)].filter(Boolean).join(' · ');
    const answer=await DialogV2.wait({classes:['ag-app','ag-dialog'],window:{title:`Complete ${recipe.name}?`},modal:true,rejectClose:false, // ag-lint-allow: custom dialog, has ag-dialog classes
      content:`<p>${esc(actor.name)} completes <strong>${esc(recipe.name)}</strong>${meta?` (${esc(meta)})`:''}. Nothing is used up and no item is made; the GM can award profession XP from the chat card.</p>${needs?`<ul>${needs}</ul>`:''}
        ${checkPickHtml(actor,{cplan,picked,option,mode,preset,card:'activity card'})}`,
      buttons:[{action:'cancel',label:'Cancel',callback:()=>false},{action:'complete',label:'Complete activity',default:true,callback:(event,button)=>({mode:button?.form?.elements?.mode?.value,check:button?.form?.elements?.check?.value})}]});
    if(!answer)return null;
    if(typeof answer==='object'&&answer.mode!=null)mode=Math.sign(Number(answer.mode)||0);
    const chosen=typeof answer==='object'?cplan?.options.find(o=>choiceOf(o)===answer.check):null;
    if(chosen&&chosen!==picked){picked=chosen;option=checkOption(actor,picked);}
  }
  if(activityLocks.has(actor.id))throw Error(`${actor.name} is already completing an activity`);
  activityLocks.add(actor.id);
  try{
    let check=null;
    if(option){
      try{const rolled=await rollCheck(actor,option,mode);check=rolled?{label:option.label,total:rolled.total,mode}:{label:option.label,unavailable:true};}
      catch(err){throw Error(`Activity cancelled (${err.message}).`);}
    }
    try{await activityChatCard(actor,recipe,check);}catch(err){console.warn(`[${ID}] Activity completed; chat card failed`,err);}
    return {ok:true,message:`${actor.name} completed ${recipe.name}.`};
  }finally{activityLocks.delete(actor.id);}
}

/* ---- Gathering ---------------------------------------------------------------------------------
 * The GM client runs every gathering check. Nodes come from the Locations module (feature-detected)
 * or are ad-hoc. One lead, one check per node; eligible helpers give advantage, not another attempt. */
const locationsApi=()=>{const m=game.modules?.get?.(LOCATIONS_ID);return m?.active&&m.api?m.api:null;};
const gatherSessions=new Map();       // GM client: sessionId → session awaiting its roll
const gatherRequests=new Map();       // GM client: requestId → player request waiting in the Gathering tab queue (0.21.0)
const pendingGatherRequests=new Map();// player client: requestId → resolve(first reply: queued or refused)
const myGatherRequests=new Map();     // player client: actorId → {requestId, title} while the GM has not answered
const lastGatherRequestAt=new Map();  // GM client: actorId → when its last request was queued (rate limit)
let gatherRequestCooldownMs=30000;
const incomingRolls=new Map();        // roller client: sessionId → roll prompt
const gatherDialogs=new Map();        // any client: key → open DialogV2
const exhaustedHere=new Set();        // node keys spent in this GM session, even if Locations could not record it
let lastGather=null;
const worldMaterial=id=>id?materialChoices().find(i=>agSourceId(i)===id)??null:null;
/** Machine-readable metadata of an awardable world material (Manager's definition), or null. */
const worldMaterialMeta=id=>{const item=worldMaterial(id);return item?materialMeta(item.flags?.['ashen-gate-manager']?.source?.definition,{name:item.name}):null;};
/** 0.25.0 GM: a MAT-* id's state: ok (awardable: approved, player-visible), missing (not imported), draft (not approved),
 * gm-only, not-visible, duplicate or retired; `status` is its Manager status. Draft, gm-only and not-visible can be used anyway. */
function materialState(id){
  if(!id)return {state:'missing',status:''};
  if(worldMaterial(id))return {state:'ok',status:'approved'};
  const managed=(game.items?.contents??[]).filter(i=>agSourceId(i)===id&&i.flags?.['ashen-gate-manager']?.source);
  if(!managed.length)return {state:'missing',status:''};
  const active=managed.filter(isActiveDefinition);
  if(!active.length)return {state:'retired',status:String(managed[0].flags['ashen-gate-manager'].source.status??'')};
  if(active.length>1)return {state:'duplicate',status:''};
  const src=active[0].flags['ashen-gate-manager'].source;
  if(src.status!=='approved')return {state:'draft',status:String(src.status||'draft')};
  if(src.visibility!=='player')return {state:'gm-only',status:src.status};
  return {state:'not-visible',status:src.status};
}
const usableAnyway=state=>DRAFT_STATES.includes(state);
/** GM: the one active world Material of a draft/unreleased id (for "use anyway"), else null. Never for players. */
function draftMaterial(id){
  if(!game.user?.isGM||!usableAnyway(materialState(id).state))return null;
  return (game.items?.contents??[]).find(i=>agSourceId(i)===id&&i.flags?.['ashen-gate-manager']?.source&&isActiveDefinition(i))??null;
}
/** The world Material to award: an awardable one, or (GM "use anyway" only) a draft/unreleased one. */
const awardMaterial=(id,allowDraft=false)=>worldMaterial(id)??(allowDraft?draftMaterial(id):null);
const itemMeta=item=>item?materialMeta(item.flags?.['ashen-gate-manager']?.source?.definition,{name:item.name}):null;
/** Exotic metadata lookup for a gather: awardable materials, plus draft/unreleased ones when the GM uses them anyway. */
const metaFor=allowDraft=>id=>worldMaterialMeta(id)??(allowDraft?itemMeta(draftMaterial(id)):null);
/** GM: why a MAT-* cannot be awarded ('' when it can), named after what the GM fixes in General Manager. 0.25.0: "not imported" vs "draft/unreleased". */
function materialUnavailable(id){
  const {state,status}=materialState(id);
  return {ok:'',missing:'Not imported in this world: import it with General Manager',duplicate:'Imported more than once: remove the duplicate in General Manager',
    retired:'Retired or superseded: restore it in General Manager',draft:`Draft/unreleased (status: ${status}): approve it in General Manager, or use it anyway (GM)`,
    'gm-only':'Unreleased (GM-only): make it player-visible in General Manager, or use it anyway (GM)',
    'not-visible':'Not visible to every player: check its permissions, or use it anyway (GM)'}[state]??'';
}
/** GM: every imported Material with readable metadata, awardable or not ({...meta, unavailable: reason|'', state, draft}), one per id. */
function materialCatalog(){
  const out=new Map();
  for(const item of game.items?.contents??[]){
    const id=agSourceId(item);if(!id?.startsWith('MAT-')||out.has(id))continue;
    const meta=materialMeta(item.flags?.['ashen-gate-manager']?.source?.definition,{name:item.name});
    if(meta){const s=materialState(id);out.set(id,{...meta,unavailable:materialUnavailable(id),state:s.state,status:s.status,draft:usableAnyway(s.state)});}
  }
  return [...out.values()];
}
/** GM: every imported Material that can be awarded now or used anyway, once per id: {id, name, state, status, quality, tier}. */
const gmMaterialChoices=perTick(()=>gmMaterialList());
function gmMaterialList(){
  const out=new Map();
  for(const item of game.items?.contents??[]){
    const id=agSourceId(item);if(!/^MAT-[A-Z0-9-]+$/.test(id??'')||out.has(id)||classify(item)!=='Material')continue;
    const s=materialState(id);if(s.state!=='ok'&&!usableAnyway(s.state))continue;
    const doc=s.state==='ok'?worldMaterial(id):draftMaterial(id),meta=itemMeta(doc);
    out.set(id,{id,name:doc?.name??item.name,state:s.state,status:s.status,quality:meta?.quality??null,tier:meta?.tier??null});
  }
  return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
const draftText=m=>m.state==='draft'?`draft (${m.status})`:m.state==='gm-only'?'GM-only':'not visible to every player';
/** GM select options: released materials, then draft/unreleased ones in their own group, marked. A stored id that is not imported stays selectable and says so. */
function materialOptions(selected,{blank='',quality=null}={}){
  const list=gmMaterialChoices().filter(m=>!quality||norm(m.quality)===norm(quality));
  // With hundreds of materials the name alone is ambiguous (Mining Master Common / Rare): say the quality and tier too.
  const kind=m=>[m.quality,m.tier!=null?`Tier ${m.tier}`:''].filter(Boolean).join(' ');
  const opt=m=>`<option value="${esc(m.id)}" ${selected===m.id?'selected':''}>${esc(m.name)}${!quality&&kind(m)?` · ${esc(kind(m))}`:''}${m.state==='ok'?'':` — ${esc(draftText(m))}`}</option>`;
  const released=list.filter(m=>m.state==='ok'),drafts=list.filter(m=>m.state!=='ok');
  return `${blank?`<option value="">${esc(blank)}</option>`:''}${selected&&!list.some(m=>m.id===selected)?`<option value="${esc(selected)}" selected>${esc(humanizeId(selected))} — ${esc(materialState(selected).state==='missing'?'not imported':materialState(selected).state)}</option>`:''}${released.length?`<optgroup label="Released">${released.map(opt).join('')}</optgroup>`:''}${drafts.length?`<optgroup label="Draft / unreleased (GM only)">${drafts.map(opt).join('')}</optgroup>`:''}`;
}
/** GM badge beside a chosen material: nothing when it is released; "Draft", "Unreleased" or "Not imported" otherwise. */
function materialBadge(id){
  if(!id)return '';
  const s=materialState(id);
  if(s.state==='ok')return '';
  const label=s.state==='missing'?'Not imported':s.state==='draft'?'Draft':usableAnyway(s.state)?'Unreleased':s.state==='duplicate'?'Imported twice':'Retired';
  return `<span ${tip(materialUnavailable(id))}>${badge(label,'warn')}</span>`;
}
/** GM: the first material problem of a node (its common table), as startBlocker/nodeBlocker options. */
function nodeMaterialCheck(node,allowDraft=false){
  const ids=[...new Set([node?.materialId,...(node?.tables?.common??[]).map(e=>e.materialId)].filter(Boolean))];
  for(const id of ids){const s=materialState(id);if(s.state!=='ok'&&!(allowDraft&&usableAnyway(s.state)))return {materialFound:false,materialState:s.state,materialStatus:s.status,materialId:id,materialName:materialName(id),allowDraft};}
  return {materialFound:true,materialState:'ok',allowDraft};
}
/** A skip reason with the specific Manager fix when the material is not awardable. */
const skipReason=(id,reason)=>/^Not an imported/.test(reason)?materialUnavailable(id)||reason:reason;
/** A PROF-* id as a gathering-profession key, from its world Profession definition's name, else from the id. */
function professionKeyOfId(id){
  const hit=game.user.isGM?lookupWorldDefinition(game,id,{entityType:'Profession'}):null;
  const key=professionKey(hit?.status==='ok'?hit.source?.definition?.name??hit.document?.name:'');
  return GATHERING_KEYS.includes(key)?key:professionKeyFromId(id);
}
// 0.17.0: crafting awards the linked 2024 core item (Manager Core Links) when one exists; GM Setup, default on.
const CORE_AWARD_SETTING='awardCoreItems';
const awardCoreItems=()=>game.settings.get(ID,CORE_AWARD_SETTING)!==false;
const exoticPercent=()=>clampPercent(game.settings.get(ID,EXOTIC_SETTING));
const requireGM=()=>{if(!game.user?.isGM)throw Error('Only the GM can read Exotic gathering setup');};
/** Test seam: a scripted d100 for the Node suite. Production uses Foundry's dice RNG. */
let exoticRoll=defaultRoll;
const materialName=id=>worldMaterial(id)?.name??humanizeId(id);
const refreshLedger=()=>{if(current?.rendered)current.render();};
const nodeBusy=key=>[...gatherSessions.values()].some(s=>s.node.key===key)||[...gatherRequests.values()].some(r=>r.node.key===key);
const closeGatherDialogs=prefix=>{for(const [key,dialog] of gatherDialogs)if(key.startsWith(prefix)){gatherDialogs.delete(key);dialog?.close?.();}};

/** Gathering nodes the current user may see: GM every location, a player revealed ones (Locations sanitizes them). */
function gatherLocations(){
  const api=locationsApi();
  if(typeof api?.listLocations!=='function'||typeof api?.resourcesAt!=='function')return {ok:false,reason:GATHER_FIX.noLocations,locations:[]};
  try{
    const gm=game.user.isGM;
    // 0.25.0: an entry that refers to a Ledger node template (nodeId) takes the template's check and materials (GM only:
    // players never read the template store; Locations publishes what they may see).
    const templates=gm?new Map(safeNodeStore().nodes.map(t=>[t.id,t])):new Map();
    const locations=(api.listLocations()??[]).map(loc=>{
      const revealed=gm?loc?.revealed===true:true;
      const nodes=(api.resourcesAt(loc.id)??[]).map((entry,index)=>normalizeNode(gm?resolveEntry(entry,id=>templates.get(id)):entry,{locationId:loc.id,locationName:loc.name??'Unnamed location',locationRevealed:revealed,index}))
        .filter(n=>n&&(gm||n.visible)).map(n=>gm?n:{...n,exotics:[]}).map(n=>exhaustedHere.has(n.key)?{...n,exhausted:true,gatherable:false,why:'Already gathered (exhausted)'}:n)
        .map(n=>({...n,blocked:nodeBlocker(n,gm?nodeMaterialCheck(n):{forPlayer:true})}));
      return {id:loc.id,name:String(loc.name??'Unnamed location'),revealed,nodes};
    }).filter(l=>l.nodes.length).sort((a,b)=>a.name.localeCompare(b.name));
    return {ok:true,locations};
  }catch(err){return {ok:false,reason:err.message,locations:[]};}
}
function findNode(locationId,nodeId){
  const loc=gatherLocations().locations.find(l=>l.id===locationId);
  return {location:loc??null,node:nodeId?loc?.nodes.find(n=>n.id===nodeId)??null:null};
}
/** GM only: each configured Exotic candidate with its name and eligibility at this node. */
const exoticRows=(node,{allowDraft=false}={})=>normalizeExotics(node?.exotics).map(e=>{const meta=metaFor(allowDraft)(e.materialId),check=exoticEligibility(e,node,meta,{keyOf:professionKeyOfId});
  const name=meta?.name??materialCatalog().find(m=>m.id===e.materialId)?.name??materialName(e.materialId);
  return {...e,name,meta,eligible:check.eligible,reason:skipReason(e.materialId,check.reason),draft:usableAnyway(materialState(e.materialId).state)};});
const exoticRule=e=>e.mode==='designated'?`designated: ${e.chance==null?'no chance set':`${e.chance}%`} · ${DESIGNATED_CONDITIONS[e.condition]??''}`:'random discovery';
/** GM-only one-line summary of a node's Exotic candidates. */
function exoticSummary(node,{allowDraft=false}={}){
  const rows=exoticRows(node,{allowDraft});if(!rows.length)return '';
  const designated=rows.some(r=>r.eligible&&r.mode==='designated');
  return `Exotic candidates (GM only): ${rows.map(r=>`${r.name} — ${exoticRule(r)}${r.eligible?'':` (not eligible: ${r.reason})`}`).join('; ')}.${designated?' Designated source: its own rules replace the discovery roll.':` Discovery chance ${exoticPercent()}% on a success.`}`;
}
const nodeTitle=n=>n.label||materialName(n.materialId)||'Gathering spot';
/** What everyone may read about a node: no unrevealed location or hidden entry names. */
const publicNodeTitle=n=>!n.visible||!n.locationRevealed?'a gathering spot':`${nodeTitle(n)}${n.locationName?` at ${n.locationName}`:''}`;
/** `forPlayers` hides a DC the GM has not shown in Locations. */
const nodeSummary=(n,{forPlayers=false}={})=>[skillText(n.skill),n.tier?`Tier ${n.tier} (${tierName(n.tier)})`:'',Number.isInteger(n.dc)&&(!forPlayers||n.dcVisible)?`DC ${n.dc}`:''].filter(Boolean).join(' · ');

/** Which check the lead can roll: the profession's tool and/or skill, then any other skill. */
function gatherCheckPlan(lead,node){
  // 0.25.0: a template may allow several gathering professions; the lead uses the first one they have (else the first listed).
  const listed=node.professions?.length>1?node.professions.find(k=>professionItems(lead).some(i=>professionKey(professionDisplayName(i))===k))??node.professions[0]:null;
  const raw=listed?professionTitle(listed):node.skill;
  const skillKey=SKILL_IDS.includes(raw)?raw:SKILL_IDS.find(k=>norm(SKILL_LABELS[k])===norm(raw))??null;
  const toolDirect=!skillKey&&toolKeys().includes(raw)?raw:null;
  const profession=skillKey||toolDirect?'':raw;
  const pk=professionKey(profession),map=rollMapping();
  // A template's own check skill/tool wins over GM Setup's profession defaults.
  const toolKey=node.checkTool||(toolDirect??(pk?map.tools[pk]||null:null));
  const skill=node.checkSkill||(skillKey??(pk?map.skills[pk]||null:null));
  const options=[...(toolKey?[{kind:'tool',key:toolKey}]:[]),...(skill?[{kind:'skill',key:skill}]:[]),
    ...SKILL_IDS.filter(k=>k!==skill).map(key=>({kind:'skill',key}))];
  const tool=toolKey?{key:toolKey,uuid:null,name:null}:null;
  const hasTool=tool&&(heldTool(lead,tool)||checkOption(lead,{kind:'tool',key:toolKey}).proficient);
  const first=hasTool||!skill?options[0]:options.find(o=>o.kind==='skill'&&o.key===skill);
  const profItem=pk?professionItems(lead).find(i=>professionKey(professionDisplayName(i))===pk):null;
  return {profession,professionKey:pk,toolKey,skill,options,selected:`${first.kind}:${first.key}`,advantageTools:advantageToolsOf(map,pk),advantageItems:advantageItemsOf(map,pk),
    professionId:profItem?agSourceId(profItem):null,professionName:profItem?professionDisplayName(profItem):profession};
}
const parseChoice=(plan,choice)=>plan.options.find(o=>`${o.kind}:${o.key}`===choice)??null;
function helperInfo(helpers,lead,plan){
  return helpers.map(h=>({id:h.id,name:h.name,...helperEligibility(h,{leadId:lead.id,toolRefs:plan.toolKey?[{key:plan.toolKey}]:[],
    hasProfession:a=>Boolean(plan.professionKey)&&professionItems(a).some(i=>professionKey(professionDisplayName(i))===plan.professionKey)})}));
}
/** The roll prompt sent to whoever rolls for the lead. Only public node details. */
function gatherProjection(session){
  return {sessionId:session.id,actorId:session.leadId,actorName:session.leadName,title:publicNodeTitle(session.node),
    summary:nodeSummary(session.node,{forPlayers:true}),dc:session.node.dcVisible?session.node.dc:null,options:session.plan.options,selected:session.plan.selected,advantageTools:session.plan.advantageTools??[],advantageItems:session.plan.advantageItems??[],
    assists:session.helpers.filter(h=>h.eligible).map(h=>h.name)};
}

/** GM: start a gathering check for a node (Locations or ad-hoc). The lead's owner gets the roll prompt. */
async function startGather({node,leadId,helperIds=[],requesterId=null,allowDraft=false}){
  if(!canRunGathering(game.user))throw Error('Only the GM can start gathering');
  const party=partyActors(),lead=actorById(leadId);
  // allowDraft (0.25.0): the GM uses draft/unreleased materials anyway for this one check.
  const blocked=startBlocker({rosterCount:rosterIds().length,partyCount:party.length,leadInParty:Boolean(lead)&&party.some(a=>a.id===lead.id),node,
    ...nodeMaterialCheck(node,allowDraft===true),busy:Boolean(node)&&[...gatherSessions.values()].some(s=>s.node.key===node.key)});
  if(blocked)throw Error(blocked);
  if(exhaustedHere.has(node.key))throw Error(nodeBlocker({...node,exhausted:true}));
  const plan=gatherCheckPlan(lead,node);
  const helpers=helperInfo([...new Set(helperIds)].map(id=>game.actors.get(id)).filter(a=>a&&a.id!==lead.id&&party.some(p=>p.id===a.id)),lead,plan);
  const session={id:newId(),node,leadId:lead.id,leadName:lead.name,helpers,plan,requesterId,allowDraft:allowDraft===true,status:'rolling',createdAt:Date.now()};
  session.rollerIds=allUsers().filter(u=>u.active&&!u.isGM&&lead.testUserPermission?.(u,'OWNER')).map(u=>u.id);
  gatherSessions.set(session.id,session);
  if(session.rollerIds.length)sendSocket({type:'gather-roll',toUserIds:session.rollerIds,...gatherProjection(session)});
  refreshLedger();
  return session;
}
function cancelGather(sessionId){
  if(!canRunGathering(game.user))throw Error('Only the GM can cancel gathering');
  const session=gatherSessions.get(sessionId);if(!session)return false;
  gatherSessions.delete(sessionId);
  sendSocket({type:'gather-closed',sessionId,toUserIds:session.rollerIds??[],reason:'The GM cancelled this gathering check.'});
  refreshLedger();return true;
}
async function exhaustInLocations(node){
  if(!node.locationId)return 'adhoc';
  if(!node.finite)return 'session';
  const api=locationsApi();
  if(!node.id||typeof api?.markNodeExhausted!=='function')return 'manual';
  try{await api.markNodeExhausted(node.locationId,node.id,true);return 'recorded';}
  catch(err){console.warn(`[${ID}] Locations could not mark ${node.locationId}/${node.id} exhausted`,err);return 'manual';}
}
/** GM: resolve the one check. Awards the bundle (stacking), exhausts the node, posts a card for everyone. */
async function resolveGather(sessionId,{total,choice,mode=0,by=''}){
  if(!canRunGathering(game.user))throw Error('Only the GM resolves gathering');
  const session=gatherSessions.get(sessionId);
  if(!session||session.status!=='rolling')throw Error('This gathering check is no longer open');
  const n=Number(total);if(!Number.isSafeInteger(n)||n<-20||n>100)throw Error('Enter the check total (−20 to 100)');
  const lead=game.actors.get(session.leadId);if(!lead)throw Error(`${session.leadName} is no longer in this world`);
  const option=parseChoice(session.plan,choice)??parseChoice(session.plan,session.plan.selected);
  session.status='resolving';
  const {node}=session;
  let award=null,reward=null,exoticAward=null,exoticNote='';
  const outcome=gatherOutcome(n,node.dc);
  // Shared resolver: the Common/Rare bundle, then at most one Exotic roll (Location and ad-hoc nodes alike).
  let rewards;
  try{rewards=resolveGatherRewards({node,outcome,percent:exoticPercent(),roll:exoticRoll,metaOf:metaFor(session.allowDraft),keyOf:professionKeyOfId});}
  catch(err){session.status='rolling';throw err;}
  const exotic=rewards.exotic;
  try{
    reward=rewards.base;
    if(reward){
      let item=awardMaterial(reward.materialId,session.allowDraft);
      if(!item&&reward.rare){reward={materialId:node.materialId,quantity:node.quantity,rare:false,noRareFallback:true};item=awardMaterial(node.materialId,session.allowDraft);}
      if(!item)throw Error(materialUnavailable(reward.materialId)?`${materialName(reward.materialId)}: ${materialUnavailable(reward.materialId)}`:`The material “${materialName(reward.materialId)}” is not an imported, player-visible world material`);
      award={...await stackMaterial(lead,item,reward.quantity,{sourceIdOf:agSourceId,flagScope:ID}),name:item.name,img:item.img,quantity:reward.quantity,quality:reward.rare?'rare':'common'};
    }
  }catch(err){session.status='rolling';throw err;}
  if(exotic.materialId){
    // The normal bundle is already given; an Exotic that cannot be written is reported to the GM, never retried.
    const item=awardMaterial(exotic.materialId,session.allowDraft);
    try{
      if(!item)throw Error('not an imported, player-visible world material');
      exoticAward={...await stackMaterial(lead,item,1,{sourceIdOf:agSourceId,flagScope:ID}),name:item.name,img:item.img,quantity:1,materialId:exotic.materialId};
    }catch(err){console.warn(`[${ID}] Exotic ${exotic.materialId} could not be given`,err);exoticNote=`Exotic ${item?.name??materialName(exotic.materialId)} was found but could not be given (${err.message}). Give it by hand.`;}
  }
  gatherSessions.delete(sessionId);
  let exhausted=null;
  if(exhaustsNode(node,outcome)){exhaustedHere.add(node.key);exhausted=await exhaustInLocations(node);}
  sendSocket({type:'gather-closed',sessionId,toUserIds:session.rollerIds??[]});
  const check={label:option?checkOption(lead,option).label:'Check',total:n,mode:Math.sign(Number(mode)||0)};
  const verdict=outcome.result==='rare'?'Success by 5+':outcome.result==='common'?'Success':'Failed';
  const assists=session.helpers.filter(h=>h.eligible).map(h=>h.name);
  // Only awarded materials are named; candidates, chances and the d100 stay with the GM.
  const got=[award,exoticAward].filter(Boolean);
  const head=got.length?`${lead.name} gathered ${got.map(a=>`${a.quantity} × ${a.name}`).join(' and ')}`:`${lead.name} found nothing usable`;
  const lines=[`<p><strong>${esc(check.label)} check:</strong> ${n}${modeText(check.mode)}${node.dcVisible?` vs DC ${node.dc}`:''} — <strong>${verdict}</strong>${award?` ${qualityBadge(award.quality)}`:''}</p>`,
    exoticAward?`<p class="agl-exotic-find"><strong>Exotic find:</strong> ${exoticAward.quantity} × ${esc(exoticAward.name)} ${qualityBadge('exotic')}</p>`:'',
    assists.length?`<p>Assisted by ${esc(assists.join(', '))} (advantage, not another attempt).</p>`:'',
    reward?.noRareFallback?'<p class="agl-chat-note">Success by 5+, but this node has no rare material, so it gave its common bundle.</p>':'',
    exhausted==='session'?'<p class="agl-chat-note">This gathering spot is used up for now.</p>':exhausted?'<p class="agl-chat-note">This gathering spot is now exhausted.</p>':''];
  try{await postXpCard({speaker:ChatMessage.getSpeaker?.({actor:lead}),content:`<div class="agl-chat-card agl-gather-card">
    <header>${award?.img?`<img src="${esc(award.img)}" alt="" width="36" height="36">`:''}<div><strong>${esc(head)}</strong><span>Gathering · ${esc(publicNodeTitle(node))}${node.tier?` · Tier ${node.tier}`:''}</span></div></header>
    ${lines.join('')}<div class="agl-xp-slot" data-agl-xp></div></div>`},
    xpFlag('gather',lead,{professionId:session.plan.professionId,professionName:session.plan.professionName,suggested:outcome.result!=='fail'&&node.tier?gatherXP(tierName(node.tier)):null}),
    {outcome:outcome.result,nodeKey:node.key,locationId:node.locationId});}
  catch(err){console.warn(`[${ID}] Gathering resolved; chat card failed`,err);}
  const skipped=(exotic.skipped??[]).map(x=>({...x,reason:skipReason(x.materialId,x.reason)}));
  if(skipped.length){
    // GM-only: a configured candidate that could not be found this time, and why. Players never get this.
    const names=new Map(materialCatalog().map(m=>[m.id,m.name]));
    const text=skipped.map(x=>`Exotic candidate ${names.get(x.materialId)??materialName(x.materialId)} skipped: ${x.reason}.`).join(' ');
    exoticNote=exoticNote?`${exoticNote} ${text}`:text;
  }
  if(exoticNote){
    try{await globalThis.ChatMessage?.create?.({whisper:allUsers().filter(u=>u.isGM).map(u=>u.id),content:`<div class="agl-chat-card"><p><strong>GM:</strong> ${esc(exoticNote)}</p></div>`});}catch{}
  }
  if(exhausted==='manual'){
    try{await globalThis.ChatMessage?.create?.({whisper:allUsers().filter(u=>u.isGM).map(u=>u.id),content:`<div class="agl-chat-card"><p><strong>GM:</strong> Locations could not record that <em>${esc(nodeTitle(node))}</em> at ${esc(node.locationName)} is exhausted. Mark it in Locations.</p></div>`});}catch{}
  }
  lastGather={leadName:lead.name,title:nodeTitle(node),total:n,dc:node.dc,verdict,award,exoticAward,exotic:{...exotic,skipped},exoticNote,exhausted,by,
    tableRoll:reward?.tableRoll?.roll!=null?reward.tableRoll:null,usedDraft:session.allowDraft};
  refreshLedger();
  return {outcome,reward,award,exotic:{...exotic,skipped},exoticAward,awards:rewards.awards,exhausted};
}

/** Roll prompt fields; shared by the player popup and the GM's "Roll for them" panel. */
function rollFields(actor,proj,prefix=''){
  const opts=proj.options.map(o=>{const c=checkOption(actor,o);return `<option value="${esc(`${o.kind}:${o.key}`)}" ${proj.selected===`${o.kind}:${o.key}`?'selected':''}>${esc(c.label)}${o.kind==='tool'?' (tool)':''} ${formatBonus(c.bonus)}</option>`;}).join('');
  const sel=parseChoice({options:proj.options},proj.selected);
  const preset=rollModeFor(actor,sel??{},{assists:proj.assists,advantageTools:Array.isArray(proj.advantageTools)?proj.advantageTools:[],advantageItems:Array.isArray(proj.advantageItems)?proj.advantageItems:[]});
  return `<div class="agl-roll-fields"><label class="ag-field">Check (bonus)<select name="check" ${prefix?`data-gather-roll-check="${esc(prefix)}"`:''}>${opts}</select></label>
    <label class="ag-field">Roll ${modeSelect(preset.mode,`name="mode" ${prefix?`data-gather-roll-mode="${esc(prefix)}"`:''}`)}</label></div>
    <p class="agl-sub">${esc(modeHint(preset))}</p>`;
}
async function rollForGather(actor,proj,{choice,mode}){
  const option=parseChoice({options:proj.options},choice)??parseChoice({options:proj.options},proj.selected);
  if(!option)throw Error('Choose a check');
  const out=await rollCheck(actor,checkOption(actor,option),Math.sign(Number(mode)||0));
  if(!out)throw Error('dnd5e could not roll this check here. Roll on your sheet and tell the GM your total.');
  return {total:out.total,choice:`${option.kind}:${option.key}`,mode:out.mode};
}
/** Player popup: the GM-approved check is ready. Closing it leaves the check open (it stays in the Gathering tab). */
async function showGatherRoll(message){
  const actor=game.actors?.get?.(message.actorId);
  if(!actor||!owned(actor))return;
  incomingRolls.set(message.sessionId,message);refreshLedger();
  try{
    const dialog=new DialogV2({id:`agl-gather-${message.sessionId}`,classes:['agl-consent','ag-app','ag-dialog'],window:{title:`Gathering check — ${message.actorName}`},modal:false,rejectClose:false, // ag-lint-allow: custom dialog, has ag-dialog classes
      content:`<p><strong>${esc(message.actorName)}</strong> gathers at ${esc(message.title)}.</p><p>${esc(message.summary)}</p>${message.assists.length?`<p>Assisted by ${esc(message.assists.join(', '))}.</p>`:''}${rollFields(actor,message)}`,
      buttons:[{action:'later',label:'Later',icon:'fa-solid fa-clock'},{action:'roll',label:'Roll',icon:'fa-solid fa-dice-d20',default:true,
        callback:(event,button)=>{void submitGatherRoll(message.sessionId,{choice:button?.form?.elements?.check?.value,mode:button?.form?.elements?.mode?.value});}}]});
    gatherDialogs.set(`roll:${message.sessionId}`,dialog);
    dialog.render({force:true});
  }catch(err){console.error(`[${ID}] gathering roll dialog`,err);}
}
async function submitGatherRoll(sessionId,{choice,mode}){
  const proj=incomingRolls.get(sessionId);
  try{
    if(!proj)throw Error('This gathering check is no longer open');
    const actor=game.actors.get(proj.actorId);if(!actor||!owned(actor))throw Error('You need to own the gathering character');
    const rolled=await rollForGather(actor,proj,{choice,mode});
    incomingRolls.delete(sessionId);closeGatherDialogs(`roll:${sessionId}`);
    sendSocket({type:'gather-rolled',sessionId,actorId:actor.id,...rolled});
    say(`${actor.name} rolled ${rolled.total}. The GM resolves the result.`);refreshLedger();
  }catch(err){say(`Profession Ledger: ${err.message}`,true);}
}
/** GM side of a player's roll: only an owner of the lead can answer, once. */
async function receiveGatherRoll(message,senderId){
  const session=gatherSessions.get(message.sessionId);
  if(!session||session.status!=='rolling'||message.actorId!==session.leadId)return false;
  const sender=userById(senderId),lead=game.actors.get(session.leadId);
  if(!sender||sender.isGM||!userOwns(sender,lead))return false;
  if(!parseChoice(session.plan,message.choice))return false;
  await resolveGather(session.id,{total:message.total,choice:message.choice,mode:message.mode,by:sender.name});
  return true;
}

/** Player: ask the GM to gather an available node at a revealed location (0.21.0: it waits in the GM's queue). */
async function requestGather({actorId,locationId,nodeId,helperIds=[]}){
  checkPlayerLedger();
  if(game.user?.isGM)throw Error('The GM starts gathering directly: use Start gathering check');
  const actor=actorById(actorId);
  if(!actor||!owned(actor))throw Error('Choose a character you own');
  if(!locationId||!nodeId)throw Error('Choose an available gathering spot');
  if(myGatherRequests.has(actor.id))return {ok:false,status:'refused',message:`${actor.name} already has a gathering request waiting for the GM.`};
  if(!activeGM())throw Error('Gathering needs the GM to be online');
  const request={type:'gather-request',requestId:newId(),requesterId:game.user.id,actorId:actor.id,locationId,nodeId,
    helperIds:[...new Set(helperIds)].filter(id=>typeof id==='string'&&id!==actor.id).slice(0,8)};
  const outcome=new Promise(resolve=>{
    const timer=setTimeout(()=>{pendingGatherRequests.delete(request.requestId);resolve({ok:false,status:'refused',message:'No answer from the GM in time.'});},30000);
    pendingGatherRequests.set(request.requestId,message=>{clearTimeout(timer);resolve({ok:message.ok,status:message.status??(message.ok?'approved':'refused'),message:message.message});});
  });
  sendSocket(request);
  return outcome;
}
/** Player: a reply to a request. The first one (queued or refused) answers requestGather; approved/declined arrive later. */
function receiveGatherRequestResult(message){
  const wait=pendingGatherRequests.get(message.requestId);
  if(message.status==='queued'&&message.actorId)myGatherRequests.set(message.actorId,{requestId:message.requestId,title:message.title??''});
  if(wait){pendingGatherRequests.delete(message.requestId);wait(message);}
  else if(['approved','declined'].includes(message.status)){
    for(const [actorId,r] of myGatherRequests)if(r.requestId===message.requestId)myGatherRequests.delete(actorId);
    say(message.message,!message.ok);
  }
  refreshLedger();
}
const gatherReply=(request,status,text,extra={})=>{const ok=status==='queued'||status==='approved';
  sendSocket({type:'gather-request-result',requestId:request.requestId,toUserId:request.requesterId,actorId:request.actorId,ok,status,message:text,...extra});return {ok,status,message:text};};
/** GM: the checks a request must pass now (and again on Approve). Returns {verdict, actor, node, setup}. */
function verifyGatherRequest(request,requester,{ignoreId=null}={}){
  const actor=game.actors?.get?.(request.actorId);
  const {location,node}=findNode(request.locationId,typeof request.nodeId==='string'?request.nodeId:null);
  const busy=Boolean(node)&&([...gatherSessions.values()].some(s=>s.node.key===node.key)||[...gatherRequests.values()].some(r=>r.requestId!==ignoreId&&r.node.key===node.key));
  const verdict=checkGatherRequest({ownsActor:Boolean(actor)&&!requester.isGM&&userOwns(requester,actor),inParty:Boolean(actor)&&!isLevelBackup(actor)&&rosterIds().includes(actor.id),location,node,busy});
  return {verdict,actor,node};
}
/**
 * GM: verify a player's request against the full Locations record, then queue it in the Gathering tab for Approve or
 * Decline. One waiting request per character, and a short cooldown per character between requests.
 */
async function handleGatherRequest(request,senderId){
  if(!canRunGathering(game.user))return {ok:false,status:'refused',message:'Only the GM can approve gathering'};
  const reply=(status,text,extra)=>gatherReply(request,status,text,extra);
  const requester=userById(request.requesterId);
  if(!requester||senderId!==request.requesterId)return reply('refused','Gathering request could not be verified');
  const {verdict,actor,node}=verifyGatherRequest(request,requester);
  if(!verdict.ok)return reply('refused',verdict.reason);
  if([...gatherRequests.values()].some(r=>r.actorId===actor.id))return reply('refused',`${actor.name} already has a gathering request waiting for the GM.`);
  const since=Date.now()-(lastGatherRequestAt.get(actor.id)??-Infinity);
  if(since<gatherRequestCooldownMs)return reply('refused',`Wait ${Math.ceil((gatherRequestCooldownMs-since)/1000)} s before asking again for ${actor.name}.`);
  const party=partyActors();
  // Setup problems are reported now, not after the GM has approved: the player gets a plain line, the GM the exact fix.
  const base={rosterCount:rosterIds().length,partyCount:party.length,leadInParty:party.some(a=>a.id===actor.id),node};
  const setup=startBlocker({...base,...nodeMaterialCheck(node)});
  // 0.25.0: a node whose only problem is a draft/unreleased material waits in the queue; the GM may approve it with that material anyway.
  const draft=Boolean(setup)&&!startBlocker({...base,...nodeMaterialCheck(node,true)});
  if(setup&&!draft){say(`Profession Ledger: ${requester.name}’s gathering request can’t start. ${setup}`,true);
    return reply('refused',`The GM can’t start this yet: ${nodeBlocker(node,{...nodeMaterialCheck(node),forPlayer:true})||'the party is not set up.'} They have been told.`);}
  const helperIds=(Array.isArray(request.helperIds)?request.helperIds:[]).filter(id=>typeof id==='string'&&id!==actor.id&&party.some(p=>p.id===id)).slice(0,8);
  gatherRequests.set(request.requestId,{requestId:request.requestId,requesterId:requester.id,requesterName:requester.name,actorId:actor.id,actorName:actor.name,
    locationId:request.locationId,nodeId:request.nodeId,node,helperIds,draft,at:Date.now()});
  lastGatherRequestAt.set(actor.id,Date.now());
  say(`${requester.name} asks for ${actor.name} to gather ${nodeTitle(node)}. See Profession Ledger → Gathering → Requests.${draft?` ${setup}`:''}`);
  refreshLedger();
  return reply('queued',`Request sent. ${actor.name} waits for the GM to approve gathering at ${publicNodeTitle(node)}.`,{title:publicNodeTitle(node)});
}
const queuedRequest=requestId=>{const r=gatherRequests.get(requestId);if(!r)throw Error('That gathering request is no longer waiting');return r;};
/** GM: approve a queued request. Checks it again, then starts the gather exactly as Start gathering check does. */
async function approveGatherRequest(requestId,{allowDraft=false}={}){
  if(!canRunGathering(game.user))throw Error('Only the GM can approve gathering');
  const r=queuedRequest(requestId),requester=userById(r.requesterId);
  const {verdict,actor,node}=requester?verifyGatherRequest(r,requester,{ignoreId:requestId}):{verdict:{ok:false,reason:'The player who asked is no longer in this world'}};
  if(!verdict.ok){gatherRequests.delete(requestId);gatherReply(r,'declined',`The gathering request for ${r.actorName} can’t go ahead: ${verdict.reason}`);refreshLedger();throw Error(`Request removed: ${verdict.reason}`);}
  gatherRequests.delete(requestId);
  let session;
  try{session=await startGather({node,leadId:actor.id,helperIds:r.helperIds,requesterId:r.requesterId,allowDraft:allowDraft===true});}
  catch(err){gatherRequests.set(requestId,r);refreshLedger();throw err;}
  gatherReply(r,'approved',`Approved. ${actor.name}’s gathering check is ready to roll.`);
  refreshLedger();
  return session;
}
/** GM: decline a queued request; the player is told, with the reason when one is given. */
function declineGatherRequest(requestId,{reason=''}={}){
  if(!canRunGathering(game.user))throw Error('Only the GM can decline gathering');
  const r=queuedRequest(requestId);
  gatherRequests.delete(requestId);
  const why=String(reason??'').replace(/[<>]/g,'').replace(/\s+/g,' ').trim().slice(0,200);
  gatherReply(r,'declined',`The GM declined ${r.actorName}’s gathering request${why?`: ${why}`:'.'}`);
  refreshLedger();
  return true;
}
/** GM: the queue, oldest first, as plain data. */
function listGatherRequests(){
  if(!canRunGathering(game.user))throw Error('Only the GM can see gathering requests');
  return [...gatherRequests.values()].sort((a,b)=>a.at-b.at).map(r=>({requestId:r.requestId,requesterId:r.requesterId,requesterName:r.requesterName,actorId:r.actorId,actorName:r.actorName,
    locationId:r.locationId,nodeId:r.nodeId,title:nodeTitle(r.node),locationName:r.node.locationName,helperIds:[...r.helperIds],draftMaterial:r.draft===true,at:r.at}));
}

/* ---- Gathering node templates (0.25.0) ------------------------------------------------------------
 * The Ledger owns node templates (nodes.mjs). They are GM data: stored in the flag `gatheringNodes` of a GM-only Journal
 * ("Profession Ledger (GM Data)", ownership NONE), the same pattern Locations uses, never in a world setting players can
 * read. Every read and write here is GM-only in the data layer, not just hidden in the UI. */
const NODE_FLAG='gatheringNodes';
const GM_JOURNAL_NAME='Profession Ledger (GM Data)';
const requireNodesGM=()=>{if(!game.user?.isGM)throw Error('Only the GM can manage gathering nodes');};
const gmJournal=()=>[...(game.journal??[])].find(j=>j?.getFlag?.(ID,'role')==='gm-data')??null;
function readNodeStore(){requireNodesGM();return normalizeStore(gmJournal()?.getFlag?.(ID,NODE_FLAG));}
/** For renders and lookups that must never throw: the GM's store, or an empty one. */
function safeNodeStore(){try{return readNodeStore();}catch{return normalizeStore({});}}
let nodeWrites=Promise.resolve();
/** Writes the whole store (serialised, so two saves never interleave). Derived problem notes are not stored. */
function writeNodeStore(store){
  requireNodesGM();
  const clean=normalizeStore(store),data=structuredClone({...clean,nodes:clean.nodes.map(({problems,...n})=>n)});
  const run=async()=>{
    const doc=gmJournal();
    if(doc)await doc.update({[`flags.${ID}.${NODE_FLAG}`]:data});
    else{
      if(typeof globalThis.JournalEntry?.create!=='function')throw Error('Foundry cannot create the Profession Ledger GM Data journal here');
      await globalThis.JournalEntry.create({name:GM_JOURNAL_NAME,ownership:{default:globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.NONE??0},
        flags:{[ID]:{role:'gm-data',[NODE_FLAG]:data}}});
    }
    refreshLedger();
    return normalizeStore(data);
  };
  const next=nodeWrites.then(run,run);
  nodeWrites=next.catch(()=>{});
  return next;
}
const nodeTemplate=id=>safeNodeStore().nodes.find(t=>t.id===id)??null;
/** GM: Locations' full records [{id, name, resources:[GM entries]}], or null when Locations is not active. */
function locationRecords(){
  const api=locationsApi();
  if(typeof api?.listLocations!=='function'||typeof api?.resourcesAt!=='function')return null;
  try{return (api.listLocations()??[]).map(l=>({id:l.id,name:String(l.name??'Unnamed location'),resources:api.resourcesAt(l.id)??[]}));}
  catch(err){console.warn(`[${ID}] Locations records unavailable`,err);return null;}
}
/** GM: where a template is used (see nodes.mjs templateReferences). */
function nodeReferences(id){requireNodesGM();return templateReferences(id,{locations:locationRecords()??[],store:readNodeStore()});}
async function saveNodeTemplate(raw,{isNew=false}={}){
  requireNodesGM();
  const r=saveTemplate(readNodeStore(),raw,{isNew});
  if(!r.ok)throw Error(r.errors.join(' '));
  await writeNodeStore(r.store);
  return structuredClone(r.node);
}
async function duplicateNodeTemplate(id){requireNodesGM();const r=duplicateTemplate(readNodeStore(),id);await writeNodeStore(r.store);return structuredClone(r.node);}
/** GM: deletes a template and retires its id. Locations are never changed: an entry that refers to it says the template is gone. */
async function deleteNodeTemplate(id){
  requireNodesGM();
  const references=nodeReferences(id);
  await writeNodeStore(removeTemplate(readNodeStore(),id));
  return {removed:id,references};
}
function previewNodeFile(data){requireNodesGM();return structuredClone(planNodeImport(readNodeStore(),data));}
/** GM: imports a node file: adds new ids, updates templates the GM has not edited; never removes one or overwrites an edit. */
async function importNodeFile(data){
  requireNodesGM();
  const store=readNodeStore(),plan=planNodeImport(store,data);
  if(!plan.ok)throw Error(`Node file not imported: ${plan.errors.slice(0,3).join(' ')}${plan.errors.length>3?` (+${plan.errors.length-3} more)`:''}`);
  await writeNodeStore(applyNodeImport(store,plan));
  return {added:plan.add.map(n=>n.id),updated:plan.update.map(n=>n.id),kept:plan.keep.map(n=>n.id),unchanged:plan.unchanged.map(n=>n.id),retired:plan.retired.map(n=>n.id),warnings:plan.warnings};
}
function exportNodeFile(){requireNodesGM();return exportNodes(readNodeStore());}
/**
 * GM: copies Location gathering entries that were never copied into templates (migration, safe to run again). Locations
 * records are never changed; the original entries are kept as a backup in the store, and the GM gets a whispered note.
 */
async function copyLocationNodes(){
  requireNodesGM();
  const locations=locationRecords();
  if(!locations)throw Error(GATHER_FIX.noLocations);
  const store=readNodeStore();
  const out=migrateLocationNodes(store,locations,{by:game.user.name,locationsVersion:game.modules?.get?.(LOCATIONS_ID)?.version??''});
  if(out.created.length||out.linked||out.store.migrationVersion!==store.migrationVersion)await writeNodeStore(out.store);
  if(out.created.length||out.linked){
    const text=`Profession Ledger copied ${plural(out.created.length+out.linked,'Location gathering node')} into node templates (${plural(out.created.length,'new template')}${out.linked?`, ${out.linked} matched an identical one`:''}). Locations records were not changed. The original Location entries are backed up in the Journal “${GM_JOURNAL_NAME}”. Review them in Ledger > Gathering Nodes.`;
    try{await globalThis.ChatMessage?.create?.({whisper:allUsers().filter(u=>u.isGM).map(u=>u.id),content:`<div class="agl-chat-card"><p><strong>GM:</strong> ${esc(text)}</p></div>`});}catch{}
  }
  return {created:[...out.created],linked:out.linked,skipped:out.skipped};
}
/** Active GM, once per world (migrationVersion 1): the first copy of Location nodes. Later copies are the GM's button. */
async function autoMigrateNodes(){
  try{
    if(!game.user?.isGM||activeGM()?.id!==game.user.id||!locationRecords())return;
    if(!gmJournal()&&typeof globalThis.JournalEntry?.create!=='function')return;
    if(readNodeStore().migrationVersion>=1)return;
    await copyLocationNodes();
  }catch(err){console.warn(`[${ID}] gathering node migration`,err);}
}
/** A normalized node to roll on a template directly (not at a Location): a fresh spot each time, like an ad-hoc node. */
function templateGatherNode(id,tier=null){
  const t=nodeTemplate(id);
  if(!t)return null;
  return normalizeNode({...templateNode(t,{tier,id:`tpl-${newId()}`}),finite:false},{locationId:null,index:0});
}

/* ---- XP from chat cards (GM-only button, never automatic) ---- */
async function awardXpFromCard(message,points){
  if(!game.user.isGM)throw Error('Only the GM can award Profession XP');
  const x=message?.flags?.[ID]?.xp;
  if(!x)throw Error('This card has no XP award');
  if(x.awarded)throw Error('XP was already awarded from this card');
  if(!x.professionId)throw Error(`${x.actorName} has no matching profession feature to award XP to`);
  const out=await performAction('award-xp',{id:x.professionId,actorId:x.actorId,points,messageId:message.id??null});
  try{await message.update?.({[`flags.${ID}.xp.awarded`]:{points:Number(points),at:Date.now(),by:game.user.id,byName:game.user.name}});}catch(err){console.warn(`[${ID}] XP awarded; card not marked`,err);}
  return out;
}
/** GM-only. Takes back the XP given from this card and re-enables Award XP. Idempotent: a card with no award is a no-op error. */
async function undoAwardFromCard(message){
  if(!game.user.isGM)throw Error('Only the GM can undo an XP award');
  const x=message?.flags?.[ID]?.xp,key=`undo:${message?.id}`;
  if(!x)throw Error('This card has no XP award');
  if(xpLocks.has(key))throw Error('Undo already in progress');
  xpLocks.add(key);
  try{
    const award=x.awarded;
    if(!award)throw Error('There is no XP award on this card to undo');
    const actor=game.actors?.get?.(x.actorId);
    if(!actor)throw Error(`${x.actorName} is no longer in this world`);
    // Clear the card first so a second click cannot take the XP back twice; restore it if the XP change fails.
    await message.update({[`flags.${ID}.xp.awarded`]:null,[`flags.${ID}.xp.undone`]:{points:Number(award.points),awardedAt:award.at??null,at:Date.now(),by:game.user.id,byName:game.user.name}});
    try{
      const have=progressOf(actor,x.professionId)?.xp??0,take=Math.min(Number(award.points),have);
      const r=await adjustXP(actor,x.professionId,{delta:-take,reason:`Undo award from chat card (${award.points} XP)`,messageId:message.id??null,kind:'undo'});
      const note=take<Number(award.points)?` Only ${take} could be taken back: the profession has less XP than was awarded.`:'';
      const dep=dependentsText(r,x.professionName,actor,x.professionId);
      await whisperXpNote(actor,`<strong>${esc(actor.name)}: ${take} ${esc(x.professionName)} XP award taken back</strong><span>Now level ${r.level} · ${r.xp} XP${dep?` · ${esc(dep)}`:''}</span>`);
      return {message:`${actor.name}: ${take} ${x.professionName} XP taken back → ${r.xp} XP, level ${r.level}.${note}${dep?` ${dep}`:''}`};
    }catch(err){
      await message.update({[`flags.${ID}.xp.awarded`]:award,[`flags.${ID}.xp.undone`]:null}).catch(()=>{});
      throw err;
    }
  }finally{xpLocks.delete(key);}
}
/** renderChatMessageHTML: players see nothing until the GM awards; the GM gets an amount and a button. */
function decorateChatCard(message,html){
  const x=message?.flags?.[ID]?.xp,slot=html?.querySelector?.('[data-agl-xp]');
  if(!x||!slot)return;
  if(x.awarded){
    slot.innerHTML=`<p class="agl-chat-note">+${Number(x.awarded.points)} ${esc(x.professionName)} XP awarded by the GM.</p>${game.user.isGM?'<button type="button" data-agl-xp-undo><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Undo award</button>':''}`;
    const undo=slot.querySelector('[data-agl-xp-undo]');
    undo?.addEventListener?.('click',async event=>{
      event.preventDefault?.();undo.disabled=true;
      try{const ok=await confirmDanger(`Take back ${Number(x.awarded.points)} ${x.professionName} XP from ${x.actorName} and allow Award XP on this card again?`,{title:'Undo XP award?',yes:'Undo award'});
        if(!ok){undo.disabled=false;return;}
        say((await undoAwardFromCard(message)).message);}
      catch(err){undo.disabled=false;say(`Profession Ledger: ${err.message}`,true);}
    });
    return;}
  if(!game.user.isGM){slot.innerHTML='';return;}
  if(!x.professionId){slot.innerHTML=`<p class="agl-chat-note">GM: ${esc(x.actorName)} has no matching profession feature, so there is no XP to award here.</p>`;return;}
  slot.innerHTML=`<div class="agl-xp-award"><label>XP <input type="number" min="1" max="1000" step="1" value="${x.suggested??1}" data-agl-xp-points></label>
    <button type="button" data-agl-xp-award><i class="fa-solid fa-star" aria-hidden="true"></i> Award ${esc(x.professionName)} XP</button></div>${x.suggested?`<p class="agl-chat-note">Suggested: ${Number(x.suggested)} XP.${x.suggestedBasis?` ${esc(x.suggestedBasis)} You can change it before awarding.`:''} GM only.</p>`:'<p class="agl-chat-note">GM only.</p>'}`;
  const button=slot.querySelector('[data-agl-xp-award]');
  button?.addEventListener?.('click',async event=>{
    event.preventDefault?.();button.disabled=true;
    try{const out=await awardXpFromCard(message,Number(slot.querySelector('[data-agl-xp-points]')?.value));say(out.message);}
    catch(err){button.disabled=false;say(`Profession Ledger: ${err.message}`,true);}
  });
}

/** Learn / Craft / Complete activity / Award XP, shared by the Ledger window and the sheet tab. Returns {message} or null if cancelled. */
async function performAction(action,{id,actorId,points,delta=null,set=null,reason='',messageId=null}){
  checkPlayerLedger();
  const actor=actorById(actorId);
  if(action==='learn-recipe'){
    const itemId=String(id).includes(':')?String(id).split(':')[1]:id;
    const item=itemOf(actor,itemId);if(!actor||!item)throw Error('Recipe Item is missing or no longer held');
    if(!owned(actor))throw Error('OWNER permission is required to learn');
    if(game.user.isGM&&actor.hasPlayerOwner)throw Error(`${actor.name}'s player learns this recipe from their own Ledger or character sheet`);
    const check=canLearnRecipe(actor,item,agSourceId(item));if(!check.ok)throw Error(check.reason);
    const name=recipeTitle(item.name);
    // 0.29.0: in the words of the recipe's profession ("formula item"), when its record is readable.
    const def=partyRecipeDefinition(agSourceId(item),catalog()),word=def?recipeWord(def,{capitalize:false}):'recipe';
    const ok=await confirmDialog(`${actor.name} learns ${name}.\nThis uses up one ${word} item (${quantity(item)} held). The ${word} stays known.`,{title:`Learn ${name}?`,yes:`Learn ${name}`});
    if(!ok)return null;
    const learned=await learnRecipe(actor,item);
    return {message:`${actor.name} learned ${recipeTitle(learned.name)}.`};
  }
  if(action==='award-xp'){
    if(!game.user.isGM)throw Error('GM only');
    const amount=Number(points);if(!Number.isSafeInteger(amount)||amount<1||amount>1000)throw Error('XP award must be between 1 and 1000');
    const before=progressOf(actor,id);
    await awardXP(actor,id,amount,{messageId});
    const after=progressOf(actor,id),name=professionsOf(actor).find(p=>p.sourceId===id)?.name??humanizeId(id);
    const levelUp=after.level>(before?.level??1);
    const message=`${actor.name}: +${amount} ${name} XP → ${after.xp} XP, level ${after.level}${levelUp?' (level up!)':''}.`;
    const recipients=[...new Set(allUsers().filter(u=>u.isGM||actor.testUserPermission?.(u,'OWNER')).map(u=>u.id))];
    try{await globalThis.ChatMessage?.create?.({whisper:recipients,speaker:ChatMessage.getSpeaker?.({actor}),content:`<div class="agl-chat-card"><header><div><strong>${esc(actor.name)} gained ${amount} ${esc(name)} XP</strong><span>Now level ${after.level} (${esc(after.tier)}) · ${after.xp} XP${levelUp?' · Level up!':''}</span></div></header></div>`});}
    catch(err){console.warn(`[${ID}] XP saved; chat note failed`,err);}
    return {message,award:{actorId:actor.id,profId:id,points:amount}};
  }
  if(action==='adjust-xp'){
    if(!game.user.isGM)throw Error('GM only');
    const blank=v=>v===null||v===undefined||String(v).trim()==='';
    if(blank(delta)===blank(set))throw Error('Enter either an XP change (+ or −) or a Set to value, not both');
    const d=blank(delta)?null:Number(delta),st=blank(set)?null:Number(set);
    if(!linkedProfession(actor,id))throw Error('The character must hold the matching imported profession');
    const name=professionsOf(actor).find(p=>p.sourceId===id)?.name??humanizeId(id);
    const plan=adjustProgress(actor.flags?.[ID]?.professionProgress??emptyProgress(),id,{delta:d,set:st,recipes:professionRecipes(actor,id)});
    if(plan.xp===plan.from)throw Error(`${actor.name}'s ${name} XP is already ${plan.from}${plan.clamped?` (limits are 0 and ${XP_CAP})`:''}`);
    const dep=dependentsText(plan,name,actor,id);
    const ok=await confirmDialog(`${actor.name}: ${name} XP ${plan.from} → ${plan.xp}${plan.clamped?` (limited to 0–${XP_CAP})`:''}. Level ${plan.previousLevel} → ${plan.level}.${dep?`\nHeads up: ${dep}`:''}\nThe owner is told in chat, and the change is recorded in the XP history.`,{title:`Adjust ${name} XP?`,yes:'Adjust XP'});
    if(!ok)return null;
    const r=await adjustXP(actor,id,{delta:d,set:st,reason});
    const sign=r.xp-r.from>0?'+':'−',amount=Math.abs(r.xp-r.from);
    await whisperXpNote(actor,`<strong>${esc(actor.name)}'s ${esc(name)} XP adjusted by the GM (${sign}${amount})</strong><span>Now level ${r.level} · ${r.xp} XP${reason?` · ${esc(String(reason).slice(0,200))}`:''}${dep?` · ${esc(dep)}`:''}</span>`);
    return {message:`${actor.name}: ${name} XP ${r.from} → ${r.xp}, level ${r.level}.${dep?` ${dep}`:''}`,...(r.xp>r.from?{award:{actorId:actor.id,profId:id,points:r.xp-r.from}}:{})};
  }
  if(action==='craft')return craft(actor,id);
  if(action==='complete-activity')return completeActivity(actor,id);
  throw Error(`Unknown action ${action}`);
}

/* ---- Gathering Nodes tab helpers (0.25.0) ---- */
const tierRange=t=>t.tier.min===t.tier.max?`${t.tier.min}`:`${t.tier.min}–${t.tier.max}`;
/** One line about a template: activity, professions, tiers, DC, check, finite. */
function templateLine(t){
  const check=[t.check.skill?skillLabel(t.check.skill):'',t.check.tool?toolLabel(t.check.tool):''].filter(Boolean).join(' or ');
  return [t.activity?activityLabel(t.activity):'No activity set',t.professions.map(professionTitle).join(', '),`Tier ${tierRange(t)}`,
    t.dc!=null?`DC ${t.dc}${t.dcVisible?' (shown)':''}`:'DC by tier',check?`Check: ${check}`:'',t.finite?'Finite at a Location':'Renewable'].filter(Boolean).join(' · ');
}
/** The template's material tables, each material with its draft/not-imported badge (GM only). */
function templateMaterialsHtml(t){
  const name=id=>esc(gmMaterialChoices().find(m=>m.id===id)?.name??humanizeId(id));
  const part=(label,list,fmt)=>list.length?`<span>${label}: ${list.map(e=>`${fmt(e)} ${materialBadge(e.materialId)}`).join(', ')}</span>`:'';
  const qty=e=>`${e.quantity} × ${name(e.materialId)}${e.chance!=null&&e.chance!==100?` (${e.chance}%)`:''}`;
  const parts=[part('Common',t.materials.common,qty),part('Rare',t.materials.rare,qty),
    part('Exotic',t.materials.exotic,e=>`${name(e.materialId)} (${e.mode==='designated'?`designated ${e.chance??'—'}%`:'discovery'})`)].filter(Boolean);
  return parts.length?parts.join(' · '):'No materials: the GM awards it by hand';
}
/** An editor draft (all strings) from a template, or a blank one. */
function nodeDraftOf(t){
  if(!t)return {isNew:true,errors:[],data:{id:'',name:'',activity:'',professions:[],tierMin:'1',tierMax:'1',checkSkill:'',checkTool:'',dc:'',dcVisible:false,finite:true,note:'',common:[],rare:[],exotic:[]}};
  return {isNew:false,errors:[...(t.problems??[])],data:{id:t.id,name:t.name,activity:t.activity,professions:[...t.professions],tierMin:String(t.tier.min),tierMax:String(t.tier.max),
    checkSkill:t.check.skill,checkTool:t.check.tool,dc:t.dc==null?'':String(t.dc),dcVisible:t.dcVisible,finite:t.finite,note:t.note,
    common:t.materials.common.map(e=>({materialId:e.materialId,quantity:String(e.quantity),chance:e.chance==null?'':String(e.chance)})),
    rare:t.materials.rare.map(e=>({materialId:e.materialId,quantity:String(e.quantity),chance:e.chance==null?'':String(e.chance)})),
    exotic:t.materials.exotic.map(e=>({materialId:e.materialId,mode:e.mode,chance:e.chance==null?'':String(e.chance??''),condition:e.condition??'success'}))}};
}
/** The template a draft describes (checkTemplate input). Rows with no material chosen are left out. A new node with no id gets one from its name. */
function draftTemplate(d,taken){
  const n=v=>v===''||v==null?undefined:Number(v);
  const rows=list=>list.filter(e=>e.materialId).map(e=>({materialId:e.materialId,quantity:n(e.quantity),chance:n(e.chance)}));
  return {id:d.id.trim()||nodeIdFromName(d.name,taken),name:d.name,activity:d.activity,professions:d.professions,tier:{min:n(d.tierMin),max:n(d.tierMax)},
    check:{skill:d.checkSkill,tool:d.checkTool},dc:n(d.dc)??null,dcVisible:d.dcVisible===true,finite:d.finite!==false,note:d.note,
    materials:{common:rows(d.common),rare:rows(d.rare),exotic:d.exotic.filter(e=>e.materialId).map(e=>({materialId:e.materialId,mode:e.mode,...(e.mode==='designated'?{chance:n(e.chance),condition:e.condition}:{})}))}};
}

const portrait=(a)=>a?.img?`<img class="agl-avatar" src="${esc(a.img)}" alt="">`:`<span class="agl-avatar">${esc((a?.name||'?').slice(0,1))}</span>`;
class LedgerApp extends HandlebarsApplicationMixin(ApplicationV2){
  static DEFAULT_OPTIONS={id:'agl-window',classes:['agl-app','ag-app'],window:{title:'Ashen Gate | Profession Ledger',resizable:true,icon:'fa-solid fa-book-open'},position:{width:1180,height:800}};
  static PARTS={main:{template:`modules/${ID}/templates/ledger.hbs`}};
  render(options){checkPlayerLedger();return super.render(options);}
  // Compact size; Comfortable scales it when the window is created (windowSize). A size the user resized to is kept by Foundry.
  constructor(options={},...rest){super({...options,position:{...windowSize(LedgerApp.DEFAULT_OPTIONS.position),...options?.position}},...rest);this.view='individual';this.actorId=null;this.demo=false;this.query='';
    this.closedFolders=new Set();this.partySort='player';this.lastAward=null;this.notice='';this.rosterDraft=null;this._events=null;
    this.mapDraft=null;
    // source: 'location' | 'template' (0.25.0, a Ledger node template) | 'adhoc'. allowDraft: the GM's "use draft materials anyway".
    this.gather={source:'location',actorId:null,nodeRef:'',helperIds:[],pending:false,templateId:'',templateTier:'',allowDraft:false,
      adhoc:{label:'',skill:'Herbalism',tier:'1',dc:'',materialId:'',rareMaterialId:'',quantity:'1',rareQuantity:'1',exotics:[]},
      // Exotic picker filters: profession and tier default to the ad-hoc node's own.
      pick:{query:'',profession:'node',tier:'node'}};
    this.exoticDraft=null;
    this.coreAwardDraft=null;
    this.accessDraft=null;
    this.assignState={target:'party',preview:null,selected:new Set()};
    // 0.30.0 Assign → Starting recipes: target, dry run, ticked rows and the last grant's result.
    this.grantState={target:'party',preview:null,selected:new Set(),result:null};this.assignTab=null;
    // 0.31.0 Assign → Signature perks: same shape.
    this.signatureState={target:'party',preview:null,selected:new Set(),result:null};
    // 0.25.0 Gathering Nodes tab: the open editor draft, an import preview, and the activity filter.
    this.nodeDraft=null;this.nodeImport=null;this.nodeFilter='all';
    // 0.26.0: sub-tabs shown (null: pick on first show), and the node editor's unsaved-edit guard (kit guardDirty).
    this.gmTab=null;this.gatherTab=null;
    this.nodeGuard=guardDirty({status:()=>this.element?.querySelector?.('[data-agl-node-status]')});
  }
  /** Per-user, per-device UI memory (sub-tabs, folds); never world data. */
  get _ui(){return this.__ui??=uiState(ID);}
  /** Asks before closing over unsaved GM Setup or node editor changes (Keep editing is the default). */
  async close(options={}){
    if(game.user?.isGM&&!options?.force){
      if(this.view==='gm'&&this.setupDirty&&!await this._leaveGmSetup())return this;
      if(this.nodeGuard?.dirty&&!await this.nodeGuard.confirm())return this;
    }
    clearInterval(this._focusTimer);this._focusTimer=null;
    return super.close?.(options);
  }
  get actors(){return partyActors();}
  get library(){return catalog();}
  get actor(){const mine=myCharacters();return mine.find(a=>a.id===this.actorId)??mine[0]??null;}
  _tabs(){
    // 0.31.1: Gathering Nodes is a sub-tab of Gathering (the GM's top row stays within six tabs), so Gathering stays selected on it.
    const onTab=key=>this.view===key||(key==='gathering'&&this.view==='nodes');
    const names=[['individual','Individual'],['party','Party'],['catalog','Recipe Catalog'],['gathering','Gathering'],...(game.user.isGM?[['assign','Assign'],['gm','GM Setup']]:[])];
    // 0.26.0 (PL-10): ids and aria-controls; bindTablist adds the arrow keys (one Tab stop, Left/Right, Home/End).
    return names.map(([key,title])=>`<button type="button" role="tab" id="agl-tab-${key}" aria-controls="agl-panel" data-action="tab" data-id="${key}" class="${[onTab(key)?'active':'',GM_VIEWS.has(key)?'ag-tab--gm':''].filter(Boolean).join(' ')}" aria-selected="${onTab(key)}" tabindex="${onTab(key)?0:-1}">${title}</button>`).join('');}
  _search(placeholder){return `<label class="ag-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-agl-search value="${esc(this.query)}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"></label>`;}
  _noRoster(){return game.user.isGM?emptyState('No party yet.','Choose the party characters in GM Setup.','<button type="button" class="ag-btn ag-btn--sm" data-action="tab" data-id="gm"><i class="fa-solid fa-gears" aria-hidden="true"></i> Choose the party in GM Setup</button>')
    :emptyState('No party yet.','Your GM hasn’t chosen the party yet. The Ledger fills in once they do.');}
  _individual(lib){
    const mine=myCharacters(),actor=this.actor;
    if(!actor)return game.user.isGM&&!rosterIds().length?this._noRoster():(game.user.isGM?emptyState('No characters in the party.','Add characters in GM Setup.'):emptyState('No character of yours in the party yet.','Ask your GM to add your character to the party.'));
    const picker=mine.length>1?`<label class="ag-field ag-field--inline">Character <select data-agl-actor>${mine.map(a=>`<option value="${esc(a.id)}" ${a.id===actor.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label>`:`<div class="agl-who">${portrait(actor)}<strong>${esc(actor.name)}</strong></div>`;
    const gmNote=game.user.isGM?notice(`Viewing <b>${esc(actor.name)}</b> as GM. Award or adjust XP under <b>GM: XP</b> on a profession below; ${actor.hasPlayerOwner?'the player learns recipes from their own Ledger or sheet.':'you can learn recipes for this character.'}`):'';
    return `<div class="ag-toolbar agl-toolbar">${this._search('Search recipes')}<div class="ag-toolbar__filters">${picker}</div></div>${gmNote}${characterPanel(actor,lib,{closed:this.closedFolders,lastAward:this.lastAward})}`;
  }
  _party(lib){
    if(!rosterIds().length)return this._noRoster();
    const actors=this.actors;
    if(!actors.length)return emptyState('No party characters visible yet.','Ask your GM to give players at least Limited permission on party characters.');
    const gm=game.user.isGM;
    const hidden=gm&&players().length?actors.filter(a=>players().every(u=>!a.testUserPermission?.(u,'LIMITED'))):[];
    const mats=partyMaterials(actors,lib);
    const {known,found}=partyRecipes(actors);
    const ids=[...new Set([...known.keys(),...found.keys()])];
    const defs=new Map(ids.map(id=>[id,partyRecipeDefinition(id,lib)]).filter(([,d])=>d));
    let recipes;
    if(this.partySort==='profession'){
      recipes=folders([...defs.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(r=>({group:professionLabel(r),recipe:r,
        html:recipeRow(r,lib,{knownBy:known.get(r.id)??[],foundBy:(found.get(r.id)??[]).map(x=>x.actor)})})),this.closedFolders);
    }else{
      const mine=new Set(myCharacters().map(a=>a.id));// 0.26.2: players get the way to their own character's view too (that is where Craft is).
      recipes=actors.map(actor=>{
        const mineKnown=knownRecipesOf(actor).filter(id=>defs.has(id));
        const mineFound=[...found.entries()].filter(([id,list])=>defs.has(id)&&list.some(x=>x.actor.id===actor.id)).map(([id])=>id);
        const list=[...new Set([...mineKnown,...mineFound])].map(id=>defs.get(id)).sort((a,b)=>professionLabel(a).localeCompare(professionLabel(b))||a.name.localeCompare(b.name));
        const key=`actor-${actor.id}`;
        return `<details class="agl-folder" data-folder="${esc(key)}" ${this.closedFolders.has(key)?'':'open'}><summary>${portrait(actor)} <strong>${esc(actor.name)}</strong> <span class="ag-badge">${mineKnown.length} known${mineFound.length?` · ${mineFound.length} to learn`:''}</span></summary>
          <div class="agl-folder-body">${gm||mine.has(actor.id)?`<div class="ag-btn-group agl-folder-actions"><button type="button" class="ag-btn ag-btn--sm" data-action="open-individual" data-id="${esc(actor.id)}">Open ${esc(actor.name)}’s view</button></div>`:''}${list.map(r=>recipeRow(r,lib,{knownBy:mineKnown.includes(r.id)?[actor]:[],foundBy:mineFound.includes(r.id)?[actor]:[]})).join('')||emptyState('No recipes yet.')}</div></details>`;
      }).join('');
    }
    const profRows=actors.map(a=>{const p=professionsOf(a);return `<li class="ag-row">${portrait(a)}<span class="ag-row__main"><span class="ag-row__title">${esc(a.name)}</span><span class="ag-row__meta">${p.map(x=>`${esc(x.name)} ${badge(`L${x.level}`,'ok')}`).join(' ')||'No professions'}</span></span></li>`;}).join('');
    return `${hidden.length?notice(`No player can see ${esc(nameList(hidden))} (needs at least Limited permission), so players won’t see ${hidden.length===1?'that character':'those characters'} here.`,'warn'):''}
      <div class="ag-toolbar agl-toolbar">${this._search('Search party recipes')}<div class="ag-toolbar__filters"><div class="ag-segmented" role="radiogroup" aria-label="Sort recipes">
        <button type="button" role="radio" aria-checked="${this.partySort==='player'}" data-action="party-sort" data-id="player">By player</button>
        <button type="button" role="radio" aria-checked="${this.partySort==='profession'}" data-action="party-sort" data-id="profession">By profession</button></div></div></div>
      <div class="agl-party">
        <section class="agl-col-main"><div class="agl-section"><h3>Party recipes <span class="ag-badge">${defs.size}</span></h3>
          <p class="agl-sub">Recipes the party knows, and recipe items someone holds but hasn’t learned yet. Craft and learn from the Individual tab.</p>
          ${recipes||emptyState('No party recipes yet.','Recipes appear here once someone in the party finds a recipe item or learns a recipe.')}</div></section>
        <section class="agl-col-side">
          <div class="agl-section"><h3>Party materials <span class="ag-badge">${mats.length}</span></h3>
            ${mats.length?`<ul class="ag-rows">${mats.map(m=>`<li class="ag-row"><span class="ag-row__main"><span class="ag-row__title">${esc(m.name)}</span><span class="ag-row__meta agl-holders">${qualityBadge(materialQuality(m.key,lib))}${m.holders.map(h=>badge(`${h.actor.name} ${h.qty}`)).join('')}</span></span><span class="ag-row__end"><b>× ${m.total}</b></span></li>`).join('')}</ul>`
              :emptyState('No crafting materials in the party yet.','Materials appear here when party characters gather or carry them.')}
            <p class="agl-sub">Characters keep their own items. A craft that needs someone else’s materials asks their owner first.</p></div>
          <div class="agl-section"><h3>Professions</h3><ul class="ag-rows">${profRows}</ul></div>
        </section>
      </div>`;
  }
  /** GM-only: is General Manager there to open? */
  _managerReady(){const manager=game.modules.get('ashen-gate-manager');return Boolean(manager?.active&&typeof manager.api?.open==='function');}
  /** 0.26.0 (PL-05): the older Ledger JSON import, demoted to a closed fold at the end of the Recipe Catalog.
   * General Manager is the documented import path. */
  _catalogAdvanced(){
    if(!game.user.isGM)return '';
    return fold({key:'catalog-import',title:'Advanced: import here, or use General Manager',body:`<p class="agl-sub">General Manager imports recipes, materials and the items recipes make; use it for new content. This import is only for older player-safe Ledger JSON catalogs, and it replaces the previous Ledger catalog. It never creates or changes Items, XP or inventories.</p>
      <div class="ag-btn-group">${fileButton({label:'Import Ledger recipe/material JSON…',accept:'application/json,.json',data:{aglFile:'catalog'}})}</div>`});
  }
  _catalog(lib){
    const gm=game.user.isGM,party=this.actors;
    const {known,found}=partyRecipes(party);
    const recipes=gm?lib.recipes:[...new Set([...known.keys(),...found.keys()])].map(id=>partyRecipeDefinition(id,lib)).filter(Boolean);
    const rows=recipes.map(r=>({group:professionLabel(r),recipe:r,html:recipeRow(r,lib,{knownBy:known.get(r.id)??[],foundBy:(found.get(r.id)??[]).map(x=>x.actor)})}));
    const hidden=gm?lib.recipes.filter(hiddenFromPlayers).length:0;
    const canOpen=gm&&this._managerReady();
    const legend=`${badge('All players','ok')} ${badge('Some players','partial')} ${badge('GM only','warn')} ${badge('Draft — hidden from players','warn')}`;
    return `<div class="ag-toolbar agl-toolbar">${this._search('Search recipes, professions or results')}${gm?`<div class="ag-toolbar__end"><button type="button" class="ag-btn ag-btn--sm" data-action="manager" ${canOpen?'':'disabled'}><i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i> Open General Manager</button></div>`:''}</div>
      ${gm?notice(`GM view: every recipe in the world. ${hidden?`<b>${hidden} of ${lib.recipes.length} ${lib.recipes.length===1?'recipe':'recipes'} ${hidden===1?'is':'are'} draft or GM-only and hidden from players.</b> `:''}Players only see recipes someone in the party has found or learned; a draft stays hidden until you approve it in General Manager.${canOpen?'':' <b>General Manager is not installed or enabled.</b>'}<br>${legend}`,hidden?'warn':'info')
        :'<p class="agl-sub">Recipes your party has found or learned, by profession. Craft and learn from the Individual tab.</p>'}
      ${folders(rows,this.closedFolders)||(gm?emptyState('No recipes in this world yet.','Import recipes with General Manager.'):emptyState('No recipes yet.','A recipe appears here once someone in the party finds its recipe item or learns it.'))}
      <div class="ag-empty agl-no-matches" hidden><p class="ag-empty__title">Nothing matches.</p><p class="ag-empty__text">Clear the search to see every recipe.</p></div>
      ${this._catalogAdvanced()}`;
  }
  _roster(){if(!game.user.isGM)return emptyState('Party Roster is GM-only.');
    const selected=this.rosterDraft??new Set(rosterIds());const chars=allCharacters();
    return `<section class="ag-card agl-panel agl-roster"><h2>Party ${badge(`${selected.size} selected`,'ok')}</h2>
      <p class="agl-sub">Checked characters make up the party. A player sees a party member in the Party tab, and can ask to use their materials, when they have at least Limited permission on that character. Changes are saved for everyone in this world.</p>
      <div class="agl-roster-actions"><button type="button" class="ag-btn" data-action="roster-all">Select player-owned characters</button><button type="button" class="ag-btn" data-action="roster-clear">Clear selection</button></div>
      ${chars.length?`<div class="ag-rows agl-roster-list">${chars.map(a=>`<label class="ag-row agl-roster-row"><input type="checkbox" data-roster-actor="${esc(a.id)}" ${selected.has(a.id)?'checked':''}>
        ${portrait(a)}<span class="ag-row__main"><span class="ag-row__title">${esc(a.name)}</span><span class="ag-row__meta">${a.hasPlayerOwner?'Player owned':'No player owner'}</span></span><span class="ag-row__end">${visibilityBadge(a)}</span>
      </label>`).join('')}</div>`:emptyState('No characters in this world yet.','Create character Actors, then choose the party here.')}
      ${notice('Access indicators are calculated against non-GM user accounts. Being in the party does not grant ownership or show a player anything beyond the Ledger’s profession, material and recipe lists.')}
    </section>`;
  }
  /** 0.26.0 (PL-04): GM Setup sections as sub-tabs under the one footer. Every panel is rendered (the others hidden), so
   * switching sub-tabs never re-renders and never drops a draft; Save Changes saves every sub-tab at once. */
  _gmSetup(){
    if(!game.user.isGM)return emptyState('GM Setup is restricted to the GM.');
    const tab=this.gmTab=GM_SETUP_TABS.some(t=>t.id===this.gmTab)?this.gmTab:this._ui.get('gmSetupTab','party',GM_SETUP_TABS.map(t=>t.id));
    const panels={party:this._roster(),
      tools:`${this._toolSetup()}${this._recipeNamesSetup()}`,
      gather:`${this._exoticSetup()}${this._coreAwardSetup()}`,
      access:`<section class="ag-card agl-panel"><h2>Player Access ${badge(playerAccessEnabled()?'Visible to players':'Hidden from players',playerAccessEnabled()?'ok':'warn')}</h2>
        <p class="agl-sub">Controls the Actors launcher, Ledger window and sheet tab only; it never changes Profession XP, known recipes or Items. Manager can also change this setting (${PLAYER_ACCESS_CONTRACT}). Saved with <b>Save Changes</b>.</p>
        <label class="ag-field ag-field--inline"><input type="checkbox" data-player-access ${(this.accessDraft??playerAccessEnabled())?'checked':''}> Players can open the Profession Ledger</label>
      </section>`};
    return `${subTabs({group:'agl-gm-setup',label:'GM Setup sections',tabs:GM_SETUP_TABS,selected:tab})}
      <div class="agl-gm-setup">${GM_SETUP_TABS.map(t=>`<div class="agl-subpanel" ${tabPanelAttrs('agl-gm-setup',t.id,{hidden:t.id!==tab})}>${panels[t.id]}</div>`).join('')}</div>`;
  }
  /** GM Setup: the generic Exotic discovery chance (a setting only; candidates are chosen per node). */
  _exoticSetup(){
    const value=this.exoticDraft??String(exoticPercent());
    return `<section class="ag-card agl-panel"><h2>Exotic discovery</h2>
      <p class="agl-sub">Chance that a successful gathering check also finds one Exotic material, rolled once on d100 (2% means a roll of 01–02). Only nodes with Exotic candidates roll; a designated source uses its own chance instead. Whole percent, 0–100 (0 turns random discovery off). Saved with <b>Save Changes</b>.</p>
      <label class="ag-field ag-field--inline">Discovery chance %<input type="number" min="0" max="100" step="1" data-exotic-chance value="${esc(value)}"></label>
    </section>`;
  }
  /** GM Setup: award the linked 2024 core item instead of the world item (Manager Core Links). */
  _coreAwardSetup(){
    const on=this.coreAwardDraft??awardCoreItems();
    return `<section class="ag-card agl-panel"><h2>Crafted items</h2>
      <p class="agl-sub">When General Manager has linked a recipe's result to a 2024 core item, crafting gives a fresh copy of that core item, keeping the Ashen Gate name and id. Unlinked items, or a missing core item, give the world item as before. Saved with <b>Save Changes</b>.</p>
      <label class="ag-field ag-field--inline"><input type="checkbox" data-core-award ${on?'checked':''}> Award the linked core item when crafting</label>
    </section>`;
  }
  /** D4: Player Access is a draft like the other GM Setup settings; only Save Changes writes it. */
  get accessDirty(){return this.accessDraft!=null&&this.accessDraft!==playerAccessEnabled();}
  get setupDirty(){return this.rosterDirty||this.mapDirty||this.exoticDirty||this.coreAwardDirty||this.accessDirty||this.labelDirty;}
  _clearSetupDrafts(){this.rosterDraft=null;this.mapDraft=null;this.exoticDraft=null;this.coreAwardDraft=null;this.accessDraft=null;this.labelDraft=null;}
  /** 0.29.0: the Recipe names draft as it would be saved (see compactLabels). */
  get labelDirty(){return this.labelDraft!=null&&JSON.stringify(compactLabels(this.labelDraft))!==JSON.stringify(compactLabels(gmRecipeLabels()));}
  /** 0.29.0: GM Setup → Tools and checks → Recipe names: what each profession calls a recipe (display only). A box left
   * empty uses the label underneath (imported content, the draft built-in default, Recipe), shown as its placeholder. */
  _recipeNamesSetup(){
    const draft=this.labelDraft??gmRecipeLabels();
    const row=p=>{const k=p.key,title=professionTitle(k),own=draft[k]??{},lower=lowerRecipeLabels(k);
      const from=cleanRecipeLabel(own.singular)||cleanRecipeLabel(own.plural)?'Set by GM':lower.from;
      const input=(field,label)=>`<input type="text" maxlength="${RECIPE_LABEL_MAX}" data-label-key="${esc(k)}" data-label-field="${field}" value="${esc(own[field]??'')}" placeholder="${esc(lower[field])}" aria-label="${esc(`${title}: ${label}`)}">`;
      return `<tr data-label-row="${esc(k)}"><th scope="row">${esc(title)}</th><td>${input('singular','singular (for example Formula)')}</td><td>${input('plural','plural (for example Formulas)')}</td><td><span class="agl-sub" data-label-from="${esc(k)}">${esc(from)}</span></td></tr>`;};
    const set=Object.keys(compactLabels(draft)).length;
    return `<section class="ag-card agl-panel agl-recipe-names"><h2>Recipe names</h2>
      <p class="agl-sub">What each profession calls a recipe, shown in its folders, buttons and messages (lists that mix professions keep “recipes”). Only the words change: ids, imports and saved characters don’t. Leave a box empty to use the name in grey: from the imported Profession content, else the built-in draft name (Alchemy formulas, Blacksmithing blueprints, Artistry compositions), else Recipe. Up to ${RECIPE_LABEL_MAX} characters. Saved with <b>Save Changes</b>.</p>
      ${fold({key:'recipe-names',title:'Names by profession',hint:set?`${set} set by you`:'none set by you',body:`<div class="ag-table-wrap agl-map-wrap"><table class="ag-table agl-map agl-label-table"><thead><tr><th scope="col">Profession</th><th scope="col">Singular</th><th scope="col">Plural</th><th scope="col">From</th></tr></thead>
      <tbody>${PROFESSION_GROUPS.map(([category,label])=>{const list=allProfessions().filter(p=>p.category===category);return list.length?`<tr class="agl-map-group"><th colspan="4" scope="colgroup">${label}</th></tr>${list.map(row).join('')}`:'';}).join('')}</tbody></table></div>`})}
    </section>`;
  }
  get coreAwardDirty(){return this.coreAwardDraft!=null&&this.coreAwardDraft!==awardCoreItems();}
  get exoticDirty(){return this.exoticDraft!==null&&clampPercent(this.exoticDraft,exoticPercent())!==exoticPercent();}
  /** 0.22.0: one row per profession, crafting then gathering: Skill to Access | Tool to Access | Tool for Advantage.
   * 0.27.0: every cell is a multi-select (a checkbox list that opens in the cell). The first value is the check it rolls (the
   * tool for every profession, the skill for gathering professions and Enchanting); it stays first while it stays ticked.
   * Each cell shows the value in effect and where it comes from (built-in default, imported content, baseline file or the
   * GM). Content names that match no dnd5e tool or skill are listed in the cell so the GM can tick what they mean. */
  _toolSetup(){
    const draft=this.mapDraft??mappingDraft(checkMapping());
    const {map,unresolved,conflicts}=crosswalkInfo(draft),keys=mapToolOptions();
    const row=name=>{const k=professionKey(name),title=professionTitle(k),gathering=GATHERING_PROFESSIONS.includes(name);
      const cell=list=>mapCellHtml({k,title,list,map,unresolved,options:list==='qualifySkills'?SKILL_IDS:keys});
      return `<tr data-map-row="${esc(k)}"><th scope="row"><span class="agl-map-prof">${esc(title)}</span>
          <button type="button" class="ag-btn ag-btn--sm ag-btn--ghost" data-action="map-reset" data-id="${esc(k)}" aria-label="Reset ${esc(title)} to default" ${mapRowCustom(draft,k)?'':'hidden'} ${tip(`Back to the imported content, baseline file or built-in default`)}>Reset to default</button></th>
        <td>${cell('qualifySkills')}</td><td>${cell('qualifyTools')}</td>
        <td>${gathering?cell('advantageTools'):'<span class="agl-sub">—</span>'}</td></tr>`;};
    const group=(label,names)=>`<tr class="agl-map-group"><th colspan="4" scope="colgroup">${label}</th></tr>${names.map(row).join('')}`;
    const notes=conflicts.map(c=>`${c}: several imported Profession definitions disagree, so the content is not used for it.`);
    const adv=GATHERING_PROFESSIONS.map(n=>professionKey(n)).filter(k=>map.advantageTools[k]?.length||map.advantageItems[k]?.length);
    return `<section class="ag-card agl-panel"><h2>Tools and checks</h2>
      <p class="agl-sub">Proficiency in any <b>skill</b> or <b>tool to access</b> qualifies a character for the profession in <b>Assign</b>; <b>Any musical instrument</b> matches proficiency with any instrument. The first skill and tool in a cell are the profession’s checks: crafting rolls the tool when a recipe names none of its own, gathering offers the tool and the skill, and creative activities offer the activity’s tools and the skill. A character proficient with, or carrying, any <b>tool for advantage</b> starts gathering checks with advantage (gathering professions only; crafting checks never get it). Under each cell: where its value comes from. Saved with <b>Save Changes</b>.</p>
      <p class="agl-sub" data-map-adv-summary>${adv.length?`Gathering advantage: ${esc(adv.map(k=>`${professionTitle(k)} (${[...map.advantageTools[k].map(toolLabel),...map.advantageItems[k].map(n=>`${n}, carried`)].join(', ')})`).join('; '))}.`:'No gathering profession has a tool for advantage yet.'}</p>
      ${notes.length?`<ul class="agl-sub">${notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>`:''}
      ${this._baselinePanel()}
      <div class="ag-table-wrap agl-map-wrap"><table class="ag-table agl-map"><thead><tr><th scope="col">Profession</th><th scope="col">Skill to Access</th><th scope="col">Tool to Access</th><th scope="col">Tool for Advantage</th></tr></thead>
      <tbody>${PROFESSION_GROUPS.map(([category,label])=>{const names=allProfessions().filter(p=>p.category===category).map(p=>p.name);return names.length?group(label,names):'';}).join('')}</tbody></table></div></section>`;
  }
  /** GM: baseline file import (file → preview → apply) and export of the current table. */
  _baselinePanel(){
    const rec=baselineRecord(),p=this.baselinePreview;
    const LIST={qualifySkills:'Skill to Access',qualifyTools:'Tool to Access',advantageTools:'Tool for Advantage',items:'Carried items (legacy)',advantageItems:'Carried gear for advantage'};
    const show=(list,v)=>v==null?'<span class="agl-sub">not set by the file</span>':v.length?esc(v.map(list==='qualifySkills'?skillLabel:list==='items'||list==='advantageItems'?String:toolLabel).join(', ')):'<span class="agl-sub">None</span>';
    let preview='';
    if(p){
      const r=p.result,notes=[...r.errors,...r.unknownProfessions.map(n=>`“${n}” is not a profession; ignored.`),...r.unresolved.map(u=>`${u.profession}: ${LIST[u.list]} “${u.name}” matches no dnd5e ${u.list==='qualifySkills'?'skill':'tool'}; ignored.`)];
      const rows=r.changes.map(c=>`<tr><th scope="row">${esc(c.profession)}</th><td>${esc(LIST[c.list])}</td><td>${show(c.list,c.before)}</td><td>${show(c.list,c.after)}</td><td>${c.gmWins?'<span class="agl-sub">Your edit still wins</span>':''}</td></tr>`).join('');
      preview=`<div class="agl-baseline-preview" role="region" aria-label="Baseline file preview"><h3>Preview: ${esc(p.fileName||'baseline file')}</h3>
        ${notes.length?`<ul class="agl-sub">${notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>`:''}
        ${r.ok?(rows?`<div class="ag-table-wrap agl-map-wrap"><table class="ag-table agl-map"><thead><tr><th scope="col">Profession</th><th scope="col">List</th><th scope="col">Baseline now</th><th scope="col">From this file</th><th scope="col">Note</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="agl-sub">This file changes nothing.</p>'):'<p class="agl-sub">Fix the file and import it again. Nothing was changed.</p>'}
        <div class="agl-editor-actions"><button type="button" class="ag-btn ag-btn--ghost" data-action="xwalk-cancel">Cancel</button>${r.ok?`<button type="button" class="ag-btn ag-btn--primary" data-action="xwalk-apply"><i class="fa-solid fa-check" aria-hidden="true"></i> Apply baseline</button>`:''}</div></div>`;
    }
    // 0.26.0 (PL-04): a fold; a waiting preview shows below it, never hidden. Apply baseline writes at once (not with Save Changes), so it says so.
    return fold({key:'baseline',title:'Baseline file',hint:rec?(rec.fileName||'imported file'):'none imported',body:`<p class="agl-sub"><b>Baseline file</b>: ${rec?`${esc(rec.fileName||'imported file')}, imported ${esc(String(rec.importedAt??'').slice(0,10))}`:'none imported'}. Layers, lowest first: built in, Profession catalog, baseline file, your edits here (your edits always win; Reset a row to fall back). ${badge('Applies now')} Apply baseline saves at once, not with Save Changes.</p>
      <div class="ag-btn-group">${fileButton({label:'Import baseline file…',accept:'application/json,.json',data:{aglFile:'baseline'}})}<button type="button" class="ag-btn" data-action="xwalk-export"><i class="fa-solid fa-file-export" aria-hidden="true"></i> Export current table</button></div>`})+preview;
  }
  /** GM Assign: sub-tabs Professions and (0.30.0) Starting recipes; both panels rendered, the other hidden. */
  _assign(){
    if(!game.user.isGM)return emptyState('Assign is restricted to the GM.');
    const tab=this.assignTab=ASSIGN_TABS.some(t=>t.id===this.assignTab)?this.assignTab:this._ui.get('assignTab','professions',ASSIGN_TABS.map(t=>t.id));
    const panels={professions:this._assignProfessions(),recipes:this._assignRecipes(),signature:this._assignSignature()};
    return `${subTabs({group:'agl-assign',label:'Assign',tabs:ASSIGN_TABS,selected:tab})}
      ${ASSIGN_TABS.map(t=>`<div class="agl-subpanel" ${tabPanelAttrs('agl-assign',t.id,{hidden:t.id!==tab})}>${panels[t.id]}</div>`).join('')}`;
  }
  /** 0.30.0 GM: grant the starting recipes of each player character's professions (dry run, then confirm). */
  _assignRecipes(){
    const g=this.grantState,party=assignActors().filter(isPlayerCharacter),chars=allCharacters().filter(isPlayerCharacter);
    const target=`<label class="ag-field ag-field--inline">Characters <select data-grant-target><option value="party" ${g.target==='party'?'selected':''}>Whole party (${party.length})</option>${chars.map(c=>`<option value="${esc(c.id)}" ${g.target===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label>`;
    const result=g.result?`<div class="agl-section" role="status"><h3>Granted</h3>${g.result.granted.length
      ?`<ul>${g.result.granted.map(x=>`<li><b>${esc(x.actorName)}</b> (${x.recipes.length}): ${esc(x.recipes.map(r=>r.name).join(', '))}</li>`).join('')}</ul>`
      :'<p class="agl-sub">Nothing new was granted.</p>'}</div>`:'';
    const p=g.preview;
    let body='<p class="agl-sub">Preview lists the starting recipes of each player character’s professions. Nothing changes until you confirm.</p>';
    if(p){
      const fresh=p.rows.filter(r=>r.status==='new');
      const groups=p.actors.map(act=>{const rows=p.rows.filter(r=>r.actorId===act.id),n=rows.filter(r=>r.status==='new').length,k=rows.filter(r=>r.status==='known').length;
        const note=!act.hasProfession?'no profession yet':!rows.length?'no starting recipes for their professions':`${n?`${plural(n,'recipe')} to grant`:'nothing to grant'}${k?`, ${k} already known`:''}`;
        return `<tr class="agl-map-group agl-assign-actor"><th colspan="4" scope="rowgroup">${esc(act.name)} <span class="agl-sub">— ${esc(note)}</span></th></tr>${rows.map(r=>`<tr>
          <td>${r.status==='new'?`<input type="checkbox" data-grant-row="${esc(r.id)}" ${g.selected.has(r.id)?'checked':''} aria-label="Grant ${esc(r.recipeName)} to ${esc(r.actorName)}">`:''}</td>
          <td>${esc(r.recipeName)}</td><td>${esc(r.profession)}</td>
          <td>${r.status==='new'?badge('Will grant','ok'):r.status==='known'?badge('Already known','muted'):`${badge('Not granted','warn')} <span class="agl-reason">${esc(r.reason)}</span>`}</td></tr>`).join('')}`;}).join('');
      body=`${p.startingRecipes?'':'<p class="agl-sub">No imported recipe is marked as a starting recipe. Import the recipes with General Manager.</p>'}
        ${groups?`<div class="ag-table-wrap agl-map-wrap"><table class="ag-table agl-map agl-assign"><thead><tr><th scope="col"><span class="ag-sr-only">Grant</span></th><th scope="col">Recipe</th><th scope="col">Profession</th><th scope="col">Result</th></tr></thead><tbody>${groups}</tbody></table></div>`
          :emptyState('No player characters to check.','Choose the party in GM Setup, or pick one character above.')}
        <p class="agl-sub">${fresh.length?`${plural(fresh.length,'starting recipe')} to grant. Granting adds them to the known recipes: no recipe item is needed or used up, and no known recipe is removed. A recipe above the character’s level is known but can’t be crafted until the level is reached.`:'Nothing new to grant.'}</p>
        ${fresh.length>1?`<div class="ag-btn-group agl-select-actions"><button type="button" class="ag-btn ag-btn--ghost ag-btn--sm" data-action="grant-select" data-id="all">Select all</button><button type="button" class="ag-btn ag-btn--ghost ag-btn--sm" data-action="grant-select" data-id="none">Clear selection</button></div>`:''}
        <div class="agl-management-actions"><button type="button" class="ag-btn" data-action="grant-apply" data-id="selected" ${[...g.selected].some(id=>fresh.some(r=>r.id===id))?'':'disabled'}>Grant selected…</button>
          <button type="button" class="ag-btn ag-btn--primary" data-action="grant-apply" data-id="all" ${fresh.length?'':'disabled'}>Grant all new (${fresh.length})…</button></div>`;
    }
    return `<section class="ag-card agl-panel"><h2>Grant starting recipes</h2>
      <p class="agl-sub">Adds the recipes marked as starting recipes for the professions each player character has to their known recipes. Run it again after a character gains a profession; recipes they already know are skipped.</p>
      <div class="ag-toolbar agl-toolbar">${target}<button type="button" class="ag-btn" data-action="grant-preview"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> Preview</button></div>
      ${result}${body}</section>`;
  }
  /** 0.31.0 GM: catch-up for signature perks (characters who already hold a tier but lack its perks): dry run, then confirm. */
  _assignSignature(){
    const g=this.signatureState,party=assignActors().filter(isPlayerCharacter),chars=allCharacters().filter(isPlayerCharacter);
    const target=`<label class="ag-field ag-field--inline">Characters <select data-signature-target><option value="party" ${g.target==='party'?'selected':''}>Whole party (${party.length})</option>${chars.map(c=>`<option value="${esc(c.id)}" ${g.target===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label>`;
    let result='';
    if(g.result){
      const done=g.result.granted.length?`<ul>${g.result.granted.map(x=>`<li><b>${esc(x.actorName)}</b> (${x.perks.length}): ${esc(x.perks.map(p=>p.name).join(', '))}</li>`).join('')}</ul>`:'<p class="agl-sub">Nothing new was granted.</p>';
      const bad=g.result.failed?.length?`${notice(`Not granted: ${g.result.failed.map(f=>`${esc(f.actorName)} (${esc(f.error)})`).join('; ')}. Press Preview and grant again to finish.`,'warn')}`:'';
      result=`<div class="agl-section" role="status"><h3>Granted</h3>${done}${bad}</div>`;
    }
    const p=g.preview;
    let body='<p class="agl-sub">Preview lists signature perks for tiers each player character has already reached. Nothing changes until you confirm.</p>';
    if(p){
      const fresh=p.rows.filter(r=>r.status==='new');
      const groups=p.actors.map(act=>{const rows=p.rows.filter(r=>r.actorId===act.id),n=rows.filter(r=>r.status==='new').length,k=rows.filter(r=>r.status==='held').length;
        const note=!act.hasProfession?'no profession yet':!rows.length?'no signature perks for the tiers reached':`${n?`${plural(n,'perk')} to grant`:'nothing to grant'}${k?`, ${k} already held`:''}`;
        return `<tr class="agl-map-group agl-assign-actor"><th colspan="4" scope="rowgroup">${esc(act.name)} <span class="agl-sub">— ${esc(note)}</span></th></tr>${rows.map(r=>`<tr>
          <td>${r.status==='new'?`<input type="checkbox" data-signature-row="${esc(r.id)}" ${g.selected.has(r.id)?'checked':''} aria-label="Grant ${esc(r.perkName)} to ${esc(r.actorName)}">`:''}</td>
          <td>${esc(r.perkName)}</td><td>${esc(r.profession)} · ${tierBadge(r.tier,esc)}</td>
          <td>${r.status==='new'?badge('Will grant','ok'):r.status==='held'?badge('Already held','muted'):`${badge('Not granted','warn')} <span class="agl-reason">${esc(r.reason)}</span>`}</td></tr>`).join('')}`;}).join('');
      body=`${p.signaturePerks?'':'<p class="agl-sub">No signature perks are imported. Import them with General Manager.</p>'}
        ${groups?`<div class="ag-table-wrap agl-map-wrap"><table class="ag-table agl-map agl-assign"><thead><tr><th scope="col"><span class="ag-sr-only">Grant</span></th><th scope="col">Perk</th><th scope="col">Profession and tier</th><th scope="col">Result</th></tr></thead><tbody>${groups}</tbody></table></div>`
          :emptyState('No player characters to check.','Choose the party in GM Setup, or pick one character above.')}
        <p class="agl-sub">${fresh.length?`${plural(fresh.length,'signature perk')} to grant. Each is added to the character as an Item and announced in chat. Nothing is removed, and a perk a character already holds is skipped.`:'Nothing new to grant.'}</p>
        ${fresh.length>1?`<div class="ag-btn-group agl-select-actions"><button type="button" class="ag-btn ag-btn--ghost ag-btn--sm" data-action="signature-select" data-id="all">Select all</button><button type="button" class="ag-btn ag-btn--ghost ag-btn--sm" data-action="signature-select" data-id="none">Clear selection</button></div>`:''}
        <div class="agl-management-actions"><button type="button" class="ag-btn" data-action="signature-apply" data-id="selected" ${[...g.selected].some(id=>fresh.some(r=>r.id===id))?'':'disabled'}>Grant selected…</button>
          <button type="button" class="ag-btn ag-btn--primary" data-action="signature-apply" data-id="all" ${fresh.length?'':'disabled'}>Grant all new (${fresh.length})…</button></div>`;
    }
    return `<section class="ag-card agl-panel"><h2>Grant signature perks</h2>
      <p class="agl-sub">Signature perks are granted automatically when a character reaches Journeyman (level 4) or Expert (level 7) in a profession. Use this for characters who reached a tier before the perks were imported. They keep a perk if their XP is lowered later.</p>
      <div class="ag-toolbar agl-toolbar">${target}<button type="button" class="ag-btn" data-action="signature-preview"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> Preview</button></div>
      ${result}${body}</section>`;
  }
  /** GM: assign the profession features characters qualify for (dry run, then confirm). Not part of GM Setup. */
  _assignProfessions(){
    const a=this.assignState,party=assignActors(),chars=allCharacters();
    const target=`<label class="ag-field ag-field--inline">Characters <select data-assign-target><option value="party" ${a.target==='party'?'selected':''}>Whole party (${party.length})</option>${chars.map(c=>`<option value="${esc(c.id)}" ${a.target===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label>`;
    const p=a.preview;
    let body='<p class="agl-sub">Preview shows each character’s profession matches. Nothing changes until you confirm.</p>';
    if(p){
      const proposals=p.rows.filter(r=>r.status==='propose');
      const STATUS={has:['Already has','muted'],'no-item':['No imported Profession Item: import it with Manager','warn'],conflict:['Several imported Profession Items: archive the extra one in Manager','warn']};
      const groups=p.actors.map(act=>{const rows=p.rows.filter(r=>r.actorId===act.id);
        return `<tr class="agl-map-group agl-assign-actor"><th colspan="4" scope="rowgroup">${esc(act.name)}${rows.length?'':' <span class="agl-sub">— no skill or tool proficiency matches a profession</span>'}</th></tr>${rows.map(r=>`<tr>
          <td>${r.status==='propose'?`<input type="checkbox" data-assign-row="${esc(r.id)}" ${a.selected.has(r.id)?'checked':''} aria-label="Add ${esc(r.profession)} to ${esc(r.actorName)}">`:''}</td>
          <td>${esc(r.profession)}</td><td>${esc(r.reason)}</td>
          <td>${r.status==='propose'?badge(`Will add ${r.itemName}`,'ok'):badge(...STATUS[r.status])}</td></tr>`).join('')}`;}).join('');
      const notes=[p.unmapped.length?`No qualifying skill or tool is set for ${p.unmapped.join(', ')}, so nobody is proposed for ${p.unmapped.length===1?'it':'them'}. Set them in GM Setup → Tools and checks.`:'',
        ...p.conflicts.map(c=>`${c}: imported Profession definitions disagree; check them in Manager.`),
        ...p.unresolved.map(u=>`${u.profession}: catalog ${u.field==='skillProficienciesAnyOf'?'skill':'tool'} “${u.name}” matches no dnd5e ${u.field==='skillProficienciesAnyOf'?'skill':'tool'} and is ignored.`)].filter(Boolean);
      body=`${notes.map(n=>`<p class="agl-sub">${esc(n)}</p>`).join('')}
        ${groups?`<div class="ag-table-wrap agl-map-wrap"><table class="ag-table agl-map agl-assign"><thead><tr><th scope="col"><span class="ag-sr-only">Add</span></th><th scope="col">Profession</th><th scope="col">Reason</th><th scope="col">Result</th></tr></thead><tbody>${groups}</tbody></table></div>`
          :emptyState('No characters to check.','Choose the party in GM Setup, or pick one character above.')}
        <p class="agl-sub">${proposals.length?`${plural(proposals.length,'profession feature')} to add. Adding never changes XP, levels, perks or existing Items.`:'Nothing new to add.'}</p>
        <div class="agl-management-actions"><button type="button" class="ag-btn" data-action="assign-apply" data-id="selected" ${[...a.selected].some(id=>proposals.some(r=>r.id===id))?'':'disabled'}>Add selected</button>
          <button type="button" class="ag-btn ag-btn--primary" data-action="assign-apply" data-id="all" ${proposals.length?'':'disabled'}>Add all missing (${proposals.length})</button></div>`;
    }
    return `<section class="ag-card agl-panel"><h2>Assign professions</h2>
      <p class="agl-sub">Matches each character’s skill and tool <b>proficiencies</b> (not class) against GM Setup → Tools and checks, and proposes the imported Profession features they don’t have yet.</p>
      <div class="ag-toolbar agl-toolbar">${target}<button type="button" class="ag-btn" data-action="assign-preview"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> Preview</button></div>
      ${body}</section>`;
  }
  _help(){return `
    <p><strong>Individual:</strong> your character’s crafting bench: professions with level and XP, materials, recipe items you can learn, and known recipes. <em>Craft</em> checks you know the recipe and have the materials, uses them up and puts the crafted item in your inventory, with a chat card. If a party member has what you’re missing, <em>Craft — ask the party</em> asks their owner on their screen; any decline cancels and nothing is used.</p>
    <p><strong>Learn:</strong> a recipe item in your inventory has a Learn button. Learning uses up one recipe item and the recipe stays known.</p>
    <p><strong>Party:</strong> every party member’s materials and recipes, by player or by profession.</p>
    <p><strong>Recipe Catalog:</strong> recipes your party has found or learned, in folders by profession${game.user.isGM?'. As GM you see every recipe, with drafts marked':''}.</p>
    <p><strong>Where XP lives:</strong> on your character, kept by the Profession Ledger. It’s shown here, in the Professions tab of the Tidy5e sheet, and in the profession feature’s description on your sheet. Only the GM awards XP.</p>
    <p><strong>Gathering:</strong> pick a gathering spot at a location your party knows and press <b>Request gather</b>. It waits in the GM’s Requests list until they approve or decline (with a reason); one waiting request per character. The GM can also send a check to you directly. The lead gatherer rolls one check for the party (skill or tool bonus shown, advantage preset from the sheet, effects and helpers). Success gives one common bundle, success by 5+ a rare one instead; failure exhausts the spot. The result is posted in chat.</p>
    <p><strong>Tools:</strong> a recipe shows the tool or workstation it needs and warns if your character doesn’t carry the tool. Crafting rolls a tool check; the result is on the craft card. Gold costs are shown, not deducted.</p>
    <p><strong>Activities:</strong> some known recipes are creative activities (Artistry: a performance, a composition, a commission…). They need no ingredients and make no item: <em>Complete activity</em> rolls the check like Craft and posts a chat card, where the GM can award profession XP. The award starts at a suggested amount from the activity’s tier and effort (Apprentice and Short effort: 1 XP, up to 8 XP for Master and Extended effort), which the GM can change. An activity may have an <em>Effect</em>: what it can give, decided by the GM at the table.</p>
    <p><strong>Names:</strong> a profession may call its recipes something else (for example formulas). Its folders and messages use that word; lists that mix professions say recipes.</p>
    <p><strong>XP:</strong> the GM awards profession XP from the gather, craft and activity chat cards${game.user.isGM?', or under <b>GM: XP</b> on a profession card (Award or Adjust, with the history)':''}.</p>
    ${game.user.isGM?'<p><strong>Gathering (GM):</strong> three sub-tabs. <em>Requests</em> lists what players asked for (Approve or Decline); <em>Active checks</em> holds the open checks and the last result; <em>Start gathering</em> starts a check on a Location node, a node template or an ad-hoc node. The Gathering tab opens on Requests when any are waiting.</p>':''}
    ${game.user.isGM?'<p><strong>Gathering → Gathering nodes:</strong> reusable gathering spots, each with a permanent node id, with an activity, profession(s), tier range, check, DC and common/rare/exotic material tables. Roll on one from anywhere (Gathering → Start gathering → Node template), point a Location at one by id, or import/export node files. Edit opens the node in place of the list; <em>All nodes</em> or Cancel goes back to where you were. <em>Copy Location nodes</em> makes templates from the gathering nodes your Locations already have, without changing Locations. Draft materials are listed for you, marked; tick <em>Use draft materials anyway</em> on the Gathering tab to award one.</p>':''}
    ${game.user.isGM?'<p><strong>Recipe names (GM):</strong> GM Setup → Tools and checks → <em>Recipe names</em> sets what each profession calls a recipe, singular and plural. Leave a box empty to use the default shown in grey (from the imported Profession content, else the built-in draft name, else Recipe). Only the words shown change, saved with <b>Save Changes</b>.</p>':''}
    ${game.user.isGM?'<p><strong>Assign:</strong> preview which profession features each party character qualifies for from their skill and tool proficiencies (the Skill to Access and Tool to Access in GM Setup → Tools and checks), then add the missing ones. Re-running adds nothing new; XP is never changed. Its <em>Starting recipes</em> sub-tab previews the recipes marked as starting recipes for each player character’s professions, then grants them as known recipes without a recipe item. Recipes already known are skipped, and recipes not released to players are not granted; press it again after a character gains a profession.</p>':''}
    ${game.user.isGM?'<p><strong>GM Setup:</strong> sub-tabs <em>Party</em>, <em>Tools and checks</em>, <em>Gathering &amp; crafting</em> and <em>Player Access</em>; every change on any of them is saved together with <b>Save Changes</b>, and <b>Cancel</b> discards them and stays on GM Setup. <em>Tools and checks</em> has one row per profession, crafting, gathering, then creative (Artistry; <em>Any musical instrument</em> matches any instrument proficiency): the skills and tools that give access (any one qualifies; the first skill and tool are also the profession’s checks) and, for gathering, the tools that give advantage (gathering professions only; ignored for crafting). Click a cell to tick several values; under it you see where its value comes from (default, imported content, baseline file or your edit). Its <em>Baseline file</em> section imports a baseline crosswalk file (preview, then Apply baseline, which saves at once) and exports the current table. General Manager imports recipes and materials; the older Ledger JSON import is under <em>Advanced</em> at the end of the Recipe Catalog. XP is awarded from the Individual tab.</p>':''}
  `;}
  /** Ad-hoc node from the GM's form; same shape as a Locations entry. */
  _adhocNode(){
    const a=this.gather.adhoc;
    // Each ad-hoc node is its own spot, so several can be worked at once.
    return normalizeNode({id:`adhoc-${newId()}`,label:a.label,skill:a.skill,tier:a.tier,dc:a.dc,dcVisible:true,materialId:a.materialId,rareMaterialId:a.rareMaterialId,exotics:a.exotics,
      quantity:a.quantity,rareQuantity:a.rareQuantity,finite:false},{locationId:null,index:0});
  }
  _selectedNode(){
    if(this.gather.source==='adhoc')return this._adhocNode();
    if(this.gather.source==='template')return this.gather.templateId?templateGatherNode(this.gather.templateId,this.gather.templateTier):null;
    const [locationId,nodeId]=String(this.gather.nodeRef??'').split('|');
    return findNode(locationId,nodeId).node;
  }
  /** GM Gathering tab, Node template source: pick a template and a tier inside its range. */
  _templatePick(templates){
    const g=this.gather,t=templates.find(x=>x.id===g.templateId)??null;
    const opt=x=>`<option value="${esc(x.id)}" ${g.templateId===x.id?'selected':''}>${esc(x.name)} · Tier ${esc(tierRange(x))}</option>`;
    const groups=ACTIVITY_KEYS.map(k=>[activityLabel(k),templates.filter(x=>x.activity===k)]).concat([['No activity set',templates.filter(x=>!x.activity)]]).filter(([,l])=>l.length);
    const tiers=t?Array.from({length:t.tier.max-t.tier.min+1},(_,i)=>t.tier.min+i):[];
    return `<div class="agl-gather-form"><label class="ag-field">Node template<select data-gather-field="templateId"><option value="">Choose a node template…</option>${groups.map(([label,l])=>`<optgroup label="${esc(label)}">${l.map(opt).join('')}</optgroup>`).join('')}</select></label>
      ${t?`<label class="ag-field">Tier<select data-gather-field="templateTier">${tiers.map(n=>`<option value="${n}" ${String(g.templateTier||t.tier.min)===String(n)?'selected':''}>${n} · ${esc(tierName(n))}</option>`).join('')}</select></label>`:'<div></div>'}</div>
      ${t?`<p class="agl-sub">${esc(templateLine(t))}</p><p class="agl-sub">${templateMaterialsHtml(t)}</p>`:''}
      ${templates.length?'':emptyState('No node templates yet.','Create one in Gathering Nodes, or copy your Location nodes there.','<button type="button" class="ag-btn ag-btn--sm" data-action="tab" data-id="nodes"><i class="fa-solid fa-mountain" aria-hidden="true"></i> Open Gathering Nodes</button>')}`;
  }
  /** GM-only tab (0.25.0): gathering node templates, grouped by activity. Authoring lives here, not in GM Setup. */
  _nodes(){
    if(!game.user.isGM)return emptyState('Gathering Nodes are GM-only.');
    const store=safeNodeStore(),locations=locationRecords(),f=this.nodeFilter;
    const shown=store.nodes.filter(n=>f==='all'||(f==='none'?!n.activity:n.activity===f));
    const rows=shown.map(n=>({group:n.activity?activityLabel(n.activity):'No activity set',html:this._nodeRow(n,templateReferences(n.id,{locations:locations??[],store}))}));
    const copied=store.migrations.reduce((k,r)=>k+(Array.isArray(r.created)?r.created.length:0)+(Number(r.linked)||0),0);
    const migNote=store.migrations.length?notice(`${plural(copied,'Location gathering node')} copied into templates (last copy ${esc(new Date(store.migrations.at(-1).at).toLocaleString())}). Locations records were not changed; the original entries are backed up in the Journal “${esc(GM_JOURNAL_NAME)}”.`):'';
    const filter=`<label class="ag-field ag-field--inline">Activity<select data-node-filter><option value="all" ${f==='all'?'selected':''}>All</option>${ACTIVITY_KEYS.map(k=>`<option value="${k}" ${f===k?'selected':''}>${esc(activityLabel(k))}</option>`).join('')}${store.nodes.some(n=>!n.activity)?`<option value="none" ${f==='none'?'selected':''}>No activity set</option>`:''}</select></label>`;
    const canCopy=Boolean(locations);
    // 0.26.0 (PL-03): the editor and the import preview open in place of the list (never above or below it), with a way
    // back; their Cancel and Save Changes / Apply import sit in the window footer.
    if(this.nodeDraft||this.nodeImport)return `<div class="ag-toolbar agl-toolbar">${linkButton('All nodes',{data:{action:this.nodeDraft?'node-cancel':'node-import-cancel'},icon:'fa-solid fa-arrow-left'})}</div>
      ${this.nodeDraft?this._nodeEditor(store):this._nodeImportPreview()}`;
    return `<div class="ag-toolbar agl-toolbar">${this._search('Search nodes, ids or materials')}<div class="ag-toolbar__filters">${filter}<span class="ag-toolbar__count">${shown.length} of ${store.nodes.length}</span></div>
        <div class="ag-toolbar__end">${fileButton({label:'Import nodes…',accept:'application/json,.json',data:{aglFile:'nodes'},className:'ag-btn ag-btn--sm'})}
        <button type="button" class="ag-btn ag-btn--sm" data-action="node-export" ${store.nodes.length?'':'disabled'}><i class="fa-solid fa-file-export" aria-hidden="true"></i> Export</button>
        <button type="button" class="ag-btn ag-btn--sm" data-action="node-copy-locations" ${canCopy?'':`disabled ${tip(GATHER_FIX.noLocations)}`}><i class="fa-solid fa-map-location-dot" aria-hidden="true"></i> Copy Location nodes</button>
        <button type="button" class="ag-btn ag-btn--primary ag-btn--sm" data-action="node-new"><i class="fa-solid fa-plus" aria-hidden="true"></i> New node</button></div></div>
      <p class="agl-sub">Node templates are gathering spots you can roll on from anywhere (Gathering → Node template). A Location can point to one by its NODE id. Ids are permanent: a deleted node’s id is never reused. Players never see node templates.</p>
      ${migNote}
      ${folders(rows,this.closedFolders)||emptyState(store.nodes.length?'No nodes match this filter.':'No gathering nodes yet.',store.nodes.length?'Choose All activities.':'Create one with New node, import a node file, or copy the gathering nodes your Locations already have.')}
      <div class="ag-empty agl-no-matches" hidden><p class="ag-empty__title">Nothing matches.</p><p class="ag-empty__text">Clear the search to see every node.</p></div>`;
  }
  _nodeRow(t,refs){
    const search=[t.name,t.id,activityLabel(t.activity),...t.professions.map(professionTitle),...TABLES.flatMap(k=>t.materials[k].map(e=>`${e.materialId} ${gmMaterialChoices().find(m=>m.id===e.materialId)?.name??''}`))].join(' ').toLowerCase();
    const used=refs.filter(r=>r.kind==='reference'),from=refs.filter(r=>r.kind==='copied-from');
    const where=[used.length?badge(`Used by ${plural(used.length,'Location entry','Location entries')}`,'ok'):'',from.length?`<span ${tip(from.map(r=>r.locationName).join(', '))}>${badge(`Copied from ${plural(from.length,'Location entry','Location entries')}`)}</span>`:'',
      t.meta.origin==='import'&&!t.meta.edited?badge('Imported'):'',t.meta.edited&&t.meta.origin!=='gm'?badge('Edited here'):''].filter(Boolean).join(' ');
    return `<article class="ag-card agl-recipe-row agl-node-card" data-recipe-search="${esc(search)}">
      <div class="agl-recipe-head"><div class="agl-recipe-title"><strong>${esc(t.name)}</strong>
        <span class="agl-recipe-meta">${esc(templateLine(t))}</span><span class="agl-recipe-meta">${templateMaterialsHtml(t)}</span>${t.note?`<span class="agl-recipe-meta">${esc(t.note)}</span>`:''}
        ${t.problems?.length?`<span class="agl-reason">${esc(t.problems.join(' '))}</span>`:''}</div>
        <div class="agl-recipe-actions">${where}<button type="button" class="ag-btn ag-btn--sm" data-action="node-edit" data-id="${esc(t.id)}"><i class="fa-solid fa-pen" aria-hidden="true"></i> Edit</button>
          <button type="button" class="ag-btn ag-btn--sm" data-action="node-duplicate" data-id="${esc(t.id)}"><i class="fa-solid fa-copy" aria-hidden="true"></i> Duplicate</button>
          <button type="button" class="ag-btn ag-btn--sm ag-btn--danger" data-action="node-delete" data-id="${esc(t.id)}"><i class="fa-solid fa-trash" aria-hidden="true"></i> Delete</button></div></div></article>`;
  }
  /** GM node editor. Text edits are kept without a re-render; structure changes (rows, activity, mode) re-render. */
  _nodeEditor(store){
    const {isNew,data:d,errors=[]}=this.nodeDraft;
    const taken=new Set([...store.nodes.map(n=>n.id),...store.retiredIds]);
    const sel=(field,options,value)=>`<select data-node-field="${field}">${options.map(([v,l])=>`<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
    const tierOpts=TIERS.map((t,i)=>[String(i+1),`${i+1} · ${t}`]);
    const row=(table,e,i)=>table==='exotic'?`<li class="ag-row agl-node-mat">
        <label class="ag-field">Material ${materialBadge(e.materialId)}<select data-node-mat="${table}" data-node-row="${i}" data-node-key="materialId">${materialOptions(e.materialId,{blank:'Choose…',quality:'Exotic'})}</select></label>
        <label class="ag-field">Rule<select data-node-mat="${table}" data-node-row="${i}" data-node-key="mode">${EXOTIC_MODES.map(m=>`<option value="${m}" ${e.mode===m?'selected':''}>${m==='designated'?'Designated source':'Random discovery'}</option>`).join('')}</select></label>
        ${e.mode==='designated'?`<label class="ag-field">Chance %<input type="number" min="1" max="100" step="1" data-node-mat="${table}" data-node-row="${i}" data-node-key="chance" value="${esc(e.chance)}" placeholder="required"></label>
        <label class="ag-field">When<select data-node-mat="${table}" data-node-row="${i}" data-node-key="condition">${Object.entries(DESIGNATED_CONDITIONS).map(([k,l])=>`<option value="${k}" ${e.condition===k?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`:''}
        <span class="ag-row__end"><button type="button" class="ag-btn ag-btn--sm" data-action="node-row-remove" data-id="${table}:${i}">Remove</button></span></li>`
      :`<li class="ag-row agl-node-mat">
        <label class="ag-field">Material ${materialBadge(e.materialId)}<select data-node-mat="${table}" data-node-row="${i}" data-node-key="materialId">${materialOptions(e.materialId,{blank:'Choose…'})}</select></label>
        <label class="ag-field">Quantity<input type="number" min="1" max="999" step="1" data-node-mat="${table}" data-node-row="${i}" data-node-key="quantity" value="${esc(e.quantity)}" placeholder="1"></label>
        <label class="ag-field">Chance %<input type="number" min="1" max="100" step="1" data-node-mat="${table}" data-node-row="${i}" data-node-key="chance" value="${esc(e.chance)}" placeholder="${d[table].length>1?'required':'100'}"></label>
        <span class="ag-row__end"><button type="button" class="ag-btn ag-btn--sm" data-action="node-row-remove" data-id="${table}:${i}">Remove</button></span></li>`;
    const tables=TABLES.map(t=>`<fieldset class="agl-node-table"><legend>${esc(TABLE_LABELS[t])}</legend>
        <p class="agl-sub">${t==='exotic'?'Exotic candidates: random discovery uses the GM Setup chance on a success; a designated source uses its own chance.':'One bundle per success. With several materials, each needs a chance and the chances add up to 100.'}</p>
        ${d[t].length?`<ul class="ag-rows">${d[t].map((e,i)=>row(t,e,i)).join('')}</ul>`:''}
        <div class="agl-management-actions"><button type="button" class="ag-btn ag-btn--sm" data-action="node-row-add" data-id="${t}"><i class="fa-solid fa-plus" aria-hidden="true"></i> Add ${t} material</button></div></fieldset>`).join('');
    const used=[...new Set(TABLES.flatMap(t=>d[t].map(e=>e.materialId)).filter(Boolean))];
    const test=used.length?`<ul class="ag-rows">${used.map(id=>{const s=materialState(id),m=gmMaterialChoices().find(x=>x.id===id);
      return `<li class="ag-row"><span class="ag-row__main"><span class="ag-row__title">${esc(m?.name??humanizeId(id))}</span><span class="ag-row__meta">${s.state==='ok'?'Can be awarded':esc(materialUnavailable(id))}</span></span><span class="ag-row__end">${s.state==='ok'?badge('Released','ok'):materialBadge(id)}</span></li>`;}).join('')}</ul>`
      :'<p class="agl-sub">No materials yet.</p>';
    // Basics, Check and Materials open; Node test closed (each remembered per user once toggled). No fold inside a fold.
    const basics=`<div class="agl-gather-form">
        <label class="ag-field">Name<input data-node-field="name" maxlength="80" value="${esc(d.name)}" placeholder="e.g. [TEST] River reeds"></label>
        <label class="ag-field">Activity${sel('activity',[['','Choose…'],...ACTIVITY_KEYS.map(k=>[k,activityLabel(k)])],d.activity)}</label>
        <fieldset class="agl-gather-eligible"><legend>Gathering professions</legend>${NODE_PROFESSIONS.map(k=>`<label><input type="checkbox" data-node-prof="${k}" ${d.professions.includes(k)?'checked':''}> ${esc(professionTitle(k))}</label>`).join('')}
          <span class="agl-sub">None ticked: the activity’s profession. The first one the lead has gives the XP.</span></fieldset>
        <label class="ag-field">Lowest tier${sel('tierMin',tierOpts,d.tierMin)}</label>
        <label class="ag-field">Highest tier${sel('tierMax',tierOpts,d.tierMax)}</label>
        <label class="ag-field ag-field--inline"><input type="checkbox" data-node-field="finite" ${d.finite?'checked':''}> Finite: used up when gathered at a Location</label>
        <label class="ag-field">Note (GM)<input data-node-field="note" maxlength="500" value="${esc(d.note)}"></label>
      </div>`;
    // 0.32.1: the permanent id lives in a closed Details fold (GM only), never in the main form.
    // 0.32.4 The id is made from the name when the node is saved and never changes. A saved node shows it read-only; a new node has only
    // "Advanced: set id (optional)" (saveNodeTemplate still checks prefix, characters and that it is unused).
    const details=`<div class="agl-gather-form">${isNew?'':`<label class="ag-field">Permanent id<input value="${esc(d.id)}" readonly aria-readonly="true"></label>`}
        ${isNew?`<label class="ag-field">Advanced: set id (optional)<input data-node-field="id" maxlength="60" value="${esc(d.id)}" placeholder="NODE-MY-ID" autocomplete="off"></label>`:''}
        <span class="agl-sub">${isNew?'Made from the name when you save, and it cannot be changed after that. Leave Advanced empty unless you need a particular id (NODE- then upper-case letters and digits).':'Made when the node was created. It cannot be changed, even if you rename the node.'}</span></div>`;
    const check=`<div class="agl-gather-form">
        <label class="ag-field">DC<input type="number" min="1" max="40" step="1" data-node-field="dc" value="${esc(d.dc)}" placeholder="Default for the tier (${Object.values(DEFAULT_DC_BY_TIER).join('/')})"></label>
        <label class="ag-field ag-field--inline"><input type="checkbox" data-node-field="dcVisible" ${d.dcVisible?'checked':''}> Players see the DC</label>
        <label class="ag-field">Check skill${sel('checkSkill',[['','The profession’s (GM Setup)'],...SKILL_IDS.map(k=>[k,skillLabel(k)])],d.checkSkill)}</label>
        <label class="ag-field">Check tool${sel('checkTool',[['','The profession’s (GM Setup)'],...toolKeys().map(k=>[k,toolLabel(k)])],d.checkTool)}</label>
      </div>`;
    const count=TABLES.reduce((n,t)=>n+d[t].filter(e=>e.materialId).length,0);
    return `<section class="ag-card agl-panel agl-node-editor"><h2>${isNew?'New gathering node':`Edit ${esc(d.name||'gathering node')}`}</h2>
      ${errors.length?`<div class="ag-notice ag-notice--warn" role="alert"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>${errors.map(esc).join('<br>')}</span></div>`:''}
      ${fold({key:'node-basics',title:'Basics',open:true,body:basics})}
      ${fold({key:'node-check',title:'Check',open:true,body:check})}
      ${fold({key:'node-materials',title:'Materials',count,open:true,body:tables})}
      ${fold({key:'node-details',title:'Details',body:details})}
      ${fold({key:'node-test',title:'Node test',hint:'can each material be awarded now?',body:`<p class="agl-sub">Whether each material can be awarded now. A draft or unreleased one is awarded only when you tick “Use draft materials anyway” on the Gathering tab.</p>${test}`})}
    </section>`;
  }
  /** GM: what a node file import will do; nothing is written until Apply. */
  _nodeImportPreview(){
    const {fileName,plan}=this.nodeImport;
    // One fold per outcome with a node per line (a sandbox file has 30 nodes); short lists start open.
    const list=(label,nodes,kind='')=>nodes.length?`<li><details class="agl-node-plan-group" ${nodes.length<=8?'open':''}><summary>${badge(`${label}: ${nodes.length}`,kind)}</summary>
        <ul class="agl-node-plan-list">${nodes.map(n=>`<li>${esc(n.name)}</li>`).join('')}</ul></details></li>`:'';
    return `<section class="ag-card agl-panel agl-node-import"><h2>Import ${esc(fileName||'node file')}</h2>
      ${plan.ok?`<ul class="agl-node-plan">${list('New',plan.add,'ok')}${list('Updated',plan.update,'ok')}${list('Kept (edited here; your edit stays)',plan.keep,'warn')}${list('Unchanged',plan.unchanged)}${list('Skipped (deleted id; ids are never reused)',plan.retired,'warn')}</ul>
        ${plan.warnings.length?`<p class="agl-sub">${plan.warnings.map(esc).join('<br>')}</p>`:''}<p class="agl-sub">Import never removes a node and never overwrites one you edited here. Locations are not changed.</p>`
        :`<div class="ag-notice ag-notice--warn" role="alert"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>This file can’t be imported:<br>${plan.errors.map(esc).join('<br>')}</span></div>`}
    </section>`;
  }
  _gathering(){
    return game.user.isGM?this._gatherGM():this._gatherPlayer();
  }
  /** GM ad-hoc form: Exotic candidates from the imported catalog. Choosing one sets eligibility; it never awards by itself. */
  _exoticPicker(node){
    const a=this.gather.adhoc,p=this.gather.pick;
    // Every imported Exotic is listed; one that cannot be awarded (draft, GM-only) is shown with its fix, not hidden.
    const metas=materialCatalog();
    const nodeProf=nodeProfessionKey(node),nodeTier=node?.tier??null;
    const profession=p.profession==='node'?nodeProf:p.profession==='any'?null:p.profession;
    const tierOpt=p.tier==='node'?{maxTier:nodeTier}:p.tier==='any'?{}:{tier:Number(p.tier)};
    const chosen=new Set(a.exotics.map(e=>e.materialId));
    const list=(p.profession==='node'&&!nodeProf)?[]:filterMaterials(metas,{query:p.query,profession,quality:'Exotic',...tierOpt,keyOf:professionKeyOfId}).filter(m=>!chosen.has(m.id)).slice(0,50);
    const profLabel=professionTitle;
    const rows=exoticRows({...node,exotics:a.exotics},{allowDraft:this.gather.allowDraft}).map(r=>`<li class="ag-row agl-exotic-row">
        <span class="ag-row__title">${esc(r.name)}</span> ${qualityBadge('exotic')}${r.draft?` ${materialBadge(r.materialId)}`:''}${r.meta?.tier?` <small class="agl-sub">Tier ${r.meta.tier}</small>`:''} ${r.eligible?badge('Eligible','ok'):badge(r.reason,'warn')}
        <label class="ag-field ag-field--inline">Rule<select data-adhoc-exotic="${esc(r.materialId)}" data-exotic-key="mode">${EXOTIC_MODES.map(m=>`<option value="${m}" ${r.mode===m?'selected':''}>${m==='designated'?'Designated source':'Random discovery'}</option>`).join('')}</select></label>
        ${r.mode==='designated'?`<label class="ag-field ag-field--inline">Chance %<input type="number" min="1" max="100" step="1" data-adhoc-exotic="${esc(r.materialId)}" data-exotic-key="chance" value="${esc(r.chance??'')}" placeholder="required"></label>
        <label class="ag-field ag-field--inline">When<select data-adhoc-exotic="${esc(r.materialId)}" data-exotic-key="condition">${Object.entries(DESIGNATED_CONDITIONS).map(([k,l])=>`<option value="${k}" ${r.condition===k?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`:''}
        <span class="ag-row__end"><button type="button" class="ag-btn ag-btn--sm" data-action="adhoc-exotic-remove" data-id="${esc(r.materialId)}">Remove</button></span></li>`).join('');
    // 0.26.0 (PL-02): a closed fold under the ad-hoc form; its title counts the chosen candidates.
    return fold({key:'adhoc-exotics',title:'Exotic candidates',count:`${a.exotics.length} chosen`,hint:'optional, GM only',body:`<div class="agl-exotic-pick">
      <p class="agl-sub">Pick which Exotic materials this node can give. A pick sets eligibility only: a successful check rolls d100 once (discovery ${exoticPercent()}%, set in GM Setup), or a designated source uses its own chance instead. A failed check never finds one. Players never see this list. A draft or unreleased Exotic can be picked; it is only found when “Use draft materials anyway” is ticked.</p>
      ${rows?`<ul class="ag-rows agl-exotic-list">${rows}</ul>`:''}
      <div class="ag-toolbar agl-exotic-filters">
        <label class="ag-field">Search<input type="search" data-gather-pick="query" value="${esc(p.query)}" placeholder="Material name"></label>
        <label class="ag-field">Gathering profession<select data-gather-pick="profession"><option value="node" ${p.profession==='node'?'selected':''}>This node’s (${esc(nodeProf?profLabel(nodeProf):'none')})</option><option value="any" ${p.profession==='any'?'selected':''}>Any</option>${GATHERING_KEYS.map(k=>`<option value="${k}" ${p.profession===k?'selected':''}>${esc(profLabel(k))}</option>`).join('')}</select></label>
        <label class="ag-field">Tier<select data-gather-pick="tier"><option value="node" ${p.tier==='node'?'selected':''}>Up to this node’s (${esc(nodeTier??'—')})</option><option value="any" ${p.tier==='any'?'selected':''}>Any</option>${TIERS.map((t,i)=>`<option value="${i+1}" ${p.tier===String(i+1)?'selected':''}>${i+1} · ${t}</option>`).join('')}</select></label>
        <span class="agl-sub">${qualityBadge('exotic')} · Type: Material</span></div>
      ${list.length?`<ul class="ag-rows agl-exotic-list">${list.map(m=>{const off=Boolean(m.unavailable)&&!m.draft;return `<li class="ag-row agl-exotic-row${off?' is-off':''}"${off?' aria-disabled="true"':''}><span class="ag-row__main"><span class="ag-row__title">${esc(m.name)}</span>
        <span class="ag-row__meta">Tier ${m.tier??'—'}${m.unavailable?` · ${esc(m.unavailable)}`:''}</span></span>
        <span class="ag-row__end">${qualityBadge('exotic')}${m.draft?materialBadge(m.id):''}<button type="button" class="ag-btn ag-btn--sm" data-action="adhoc-exotic-add" data-id="${esc(m.id)}" ${off?'disabled':''}>Add</button></span></li>`;}).join('')}</ul>`
        :`<p class="agl-sub">${p.profession==='node'&&!nodeProf?'This node’s skill is not a gathering profession, so no Exotic can be found here. Choose a gathering profession above.':'No imported Exotic materials match. Exotics come from General Manager (quality “Exotic”; a draft one is marked and needs “Use draft materials anyway”).'}</p>`}
    </div>`});
  }
  /** GM: players' gathering requests waiting for Approve or Decline (0.21.0). 0.26.0 (PL-06): one kit card per request,
   * the reason above Decline (left) and Approve (right, primary). */
  _gatherQueue(){
    const list=[...gatherRequests.values()].sort((a,b)=>a.at-b.at);
    if(!list.length)return emptyState('No gathering requests waiting.','Players ask to gather from their own Gathering tab. Their requests wait here for you to approve or decline.');
    const cards=list.map(r=>{
      const actor=game.actors?.get?.(r.actorId),node=r.node;
      const plan=actor?gatherCheckPlan(actor,node):null,info=plan?helperInfo(r.helperIds.map(id=>game.actors.get(id)).filter(Boolean),actor,plan):[];
      const need=node.tier?ACCESS_LEVELS[tierName(node.tier)]:null,progress=plan?.professionId?progressOf(actor,plan.professionId):null;
      const draftNote=r.draft?`<p class="agl-reason">${esc(startBlocker({rosterCount:1,partyCount:1,leadInParty:true,node,...nodeMaterialCheck(node)}))} Approve gives it anyway (players still never see draft materials listed).</p>`:'';
      return `<article class="ag-card ag-card--compact agl-request" data-request="${esc(r.requestId)}"><p><strong>${esc(r.requesterName)}</strong> asks for <strong>${esc(r.actorName)}</strong> to gather <strong>${esc(nodeTitle(node))}</strong> at ${esc(node.locationName)}.</p>${draftNote}
        <p class="agl-sub">${esc(nodeSummary(node))} · common ${node.quantity} × ${esc(materialName(node.materialId))}${node.rareMaterialId?`, rare ${node.rareQuantity} × ${esc(materialName(node.rareMaterialId))}`:''}${node.finite?' · finite':''}</p>
        <p class="agl-sub">${info.length?`Helpers: ${info.map(h=>`${esc(h.name)} (${esc(h.reason)}${h.eligible?' — gives advantage':''})`).join(', ')}`:'No helpers.'}
          ${plan&&!plan.professionId?` · ${esc(r.actorName)} has no ${esc(plan.profession||'matching')} profession feature.`:''}
          ${need&&progress&&progress.level<need?` · ${esc(plan.professionName)} level ${progress.level}; tier ${node.tier} usually needs level ${need}.`:''}</p>
        <label class="ag-field">Reason for declining (optional, sent to the player)<input type="text" maxlength="200" data-gather-decline-reason="${esc(r.requestId)}"></label>
        <div class="agl-editor-actions"><button type="button" class="ag-btn ag-btn--ghost" data-action="gather-decline" data-id="${esc(r.requestId)}"><i class="fa-solid fa-xmark" aria-hidden="true"></i> Decline</button>
          <button type="button" class="ag-btn ag-btn--primary" data-action="gather-approve" data-id="${esc(r.requestId)}"${r.draft?' data-draft="1"':''}><i class="fa-solid fa-check" aria-hidden="true"></i> ${r.draft?'Approve (use draft material)':'Approve'}</button></div></article>`;}).join('');
    return `<p class="agl-sub">Players asked to gather. Approve starts the check as Start gathering does (the lead’s owner rolls); Decline tells the player, with your reason if you give one.</p>
      <div class="agl-request-list">${cards}</div>`;
  }
  /** GM Gathering sub-tab to show: the one picked, else Requests when any wait, else the one remembered (or Start gathering). */
  _gatherTabNow(){
    if(GATHER_TAB_IDS.includes(this.gatherTab))return this.gatherTab;
    return this.gatherTab=gatherRequests.size?'requests':this._ui.get('gatherTab','start',GATHER_TAB_IDS);
  }
  _gatherPlayer(){
    const mine=myCharacters(),actor=mine.find(a=>a.id===this.gather.actorId)??mine[0]??null;
    const rolls=[...incomingRolls.values()].filter(r=>mine.some(a=>a.id===r.actorId));
    const rollCards=rolls.map(r=>{const a=game.actors.get(r.actorId);return `<section class="ag-card agl-panel agl-gather-roll"><h2>Your gathering check</h2>
      <p><strong>${esc(r.actorName)}</strong> gathers at ${esc(r.title)} · ${esc(r.summary)}</p>${r.assists.length?`<p class="agl-sub">Assisted by ${esc(r.assists.join(', '))}.</p>`:''}
      ${rollFields(a,r,r.sessionId)}<div class="agl-management-actions"><button type="button" class="ag-btn" data-action="gather-player-roll" data-id="${esc(r.sessionId)}"><i class="fa-solid fa-dice-d20" aria-hidden="true"></i> Roll</button></div></section>`;}).join('');
    const where=gatherLocations();
    const party=partyActors().filter(a=>a.id!==actor?.id);
    const nodes=where.locations.map(loc=>`<fieldset class="agl-node-group"><legend>${esc(loc.name)}</legend>${loc.nodes.map(n=>{
      const value=`${loc.id}|${n.id??''}`,ok=n.gatherable&&n.id&&!n.blocked;
      return `<label class="agl-node ${ok?'':'is-off'}"><input type="radio" name="agl-node" data-gather-field="nodeRef" value="${esc(value)}" ${this.gather.nodeRef===value&&ok?'checked':''} ${ok?'':'disabled'}>
        <span><strong>${esc(nodeTitle(n))}</strong> <small>${esc(nodeSummary(n,{forPlayers:true}))}</small>${ok?'':` <small class="agl-reason">${esc(n.blocked||n.why)}</small>`}${n.note?`<small class="agl-sub">${esc(n.note)}</small>`:''}</span></label>`;}).join('')}</fieldset>`).join('');
    const waiting=actor?myGatherRequests.get(actor.id):null,pending=this.gather.pending||Boolean(waiting);
    const blocker=playerBlocker({rosterCount:rosterIds().length,mine:actor?mine.length:0,where});
    return `${rollCards}<section class="ag-card agl-panel"><h2>Request gathering</h2>
      <p class="agl-sub">Pick a gathering spot at a location your party knows. The GM approves it, then the lead gatherer rolls one check for the party. Helpers with suitable tools give advantage, not another attempt.</p>
      ${blocker?emptyState('Gathering isn’t ready yet.',esc(blocker))
        :`<div class="agl-gather-form">${mine.length>1?`<label class="ag-field">Lead gatherer<select data-gather-field="actorId">${mine.map(a=>`<option value="${esc(a.id)}" ${a.id===actor.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label>`:`<div class="agl-who">${portrait(actor)}<strong>${esc(actor.name)}</strong> leads</div>`}
          ${party.length?`<fieldset class="agl-gather-eligible"><legend>Helpers (optional)</legend>${party.map(h=>`<label><input type="checkbox" data-gather-helper="${esc(h.id)}" ${this.gather.helperIds.includes(h.id)?'checked':''}> ${esc(h.name)}</label>`).join('')}</fieldset>`:''}</div>
          <div class="agl-nodes">${nodes}</div>
          <div class="agl-management-actions"><button type="button" class="ag-btn ag-btn--primary" data-action="gather-request" ${pending?'disabled':''}><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> ${pending?'Waiting for the GM…':'Request gather'}</button></div>
          ${waiting?`<p class="agl-sub" role="status">${esc(actor.name)}’s request${waiting.title?` (${esc(waiting.title)})`:''} is waiting for the GM. You’ll be told when they answer.</p>`:''}`}
    </section>`;
  }
  _gatherGM(){
    const party=this.actors,where=gatherLocations(),mats=gmMaterialChoices(),templates=safeNodeStore().nodes;
    if(!party.length)return rosterIds().length?emptyState('No party characters found.',esc(GATHER_FIX.partyMissing)):emptyState('No party yet.',esc(GATHER_FIX.noParty),'<button type="button" class="ag-btn ag-btn--sm" data-action="tab" data-id="gm"><i class="fa-solid fa-gears" aria-hidden="true"></i> Open GM Setup</button>');
    const g=this.gather;
    if(!where.ok&&g.source==='location')g.source=templates.length?'template':'adhoc';
    const lead=party.find(a=>a.id===g.actorId)??party[0];g.actorId=lead.id;
    const node=this._selectedNode();
    const plan=node?gatherCheckPlan(lead,node):null;
    const helpers=plan?helperInfo(party.filter(a=>a.id!==lead.id),lead,plan):[];
    const sessions=[...gatherSessions.values()].map(s=>{const a=game.actors.get(s.leadId),proj=gatherProjection(s);return `<section class="ag-card agl-panel agl-gather-roll">
      <h2>${esc(s.leadName)} · ${esc(nodeTitle(s.node))}${s.node.locationName?` <small class="agl-sub">at ${esc(s.node.locationName)}</small>`:''}</h2>
      <p>${esc(nodeSummary(s.node))}${proj.assists.length?` · assisted by ${esc(proj.assists.join(', '))}`:''}</p>
      <p class="agl-sub">${s.rollerIds.length?`Waiting for ${esc(nameList(s.rollerIds.map(userById).filter(Boolean)))} to roll. You can also roll for them or record a total.`:'No owner is online: roll for them or record the total.'}</p>
      ${a?rollFields(a,proj,s.id):''}
      <div class="agl-management-actions"><button type="button" class="ag-btn ag-btn--ghost" data-action="gather-cancel" data-id="${esc(s.id)}">Cancel check</button>
        <label class="ag-field ag-field--inline">Total <input type="number" min="-20" max="100" step="1" data-gather-total="${esc(s.id)}"></label><button type="button" class="ag-btn" data-action="gather-record" data-id="${esc(s.id)}">Record total</button>
        <button type="button" class="ag-btn" data-action="gather-gm-roll" data-id="${esc(s.id)}"><i class="fa-solid fa-dice-d20" aria-hidden="true"></i> Roll for ${esc(s.leadName)}</button></div></section>`;}).join('');
    const last=lastGather?notice(`${esc(lastGather.leadName)} · ${esc(lastGather.title)}: ${lastGather.total} vs DC ${lastGather.dc} — <b>${esc(lastGather.verdict)}</b>${lastGather.award?`, ${lastGather.award.quantity} × ${esc(lastGather.award.name)} ${qualityBadge(lastGather.award.quality)}${lastGather.award.stacked?` (now ${lastGather.award.total})`:''}`:''}${lastGather.tableRoll?` · material table d${lastGather.tableRoll.faces} ${lastGather.tableRoll.roll}`:''}${lastGather.usedDraft?' · draft materials allowed':''}${lastGather.exoticAward?` + ${esc(lastGather.exoticAward.name)} ${qualityBadge('exotic')}`:''}${lastGather.exotic?.roll!=null?` · Exotic d100 ${lastGather.exotic.roll} vs ${lastGather.exotic.target} (${lastGather.exotic.kind})`:''}${lastGather.exoticNote?` · <b>${esc(lastGather.exoticNote)}</b>`:''}${lastGather.exhausted==='recorded'?' · node marked exhausted in Locations':lastGather.exhausted==='manual'?' · <b>mark the node exhausted in Locations</b>':lastGather.exhausted==='session'?' · renewable node: blocked until you reload':''}. Award XP from the chat card.`):'';
    const nodeOptions=where.locations.map(loc=>`<optgroup label="${esc(loc.name)}${loc.revealed?'':' (unrevealed)'}">${loc.nodes.map(n=>{const value=`${loc.id}|${n.id??''}`,ok=n.gatherable&&!nodeBusy(n.key),byHand=!n.materialId&&!nodeBusy(n.key);
      return `<option value="${esc(value)}" ${g.nodeRef===value?'selected':''} ${ok||byHand?'':'disabled'}>${esc(nodeTitle(n))} · ${esc(nodeSummary(n)||'no DC')}${n.visible?'':' · hidden from players'}${byHand?' — no material: award by hand':n.blocked?` — ${esc(n.blocked)}`:ok?'':' — in progress'}</option>`;}).join('')}</optgroup>`).join('');
    const a=g.adhoc,matOpts=(selected,blank)=>materialOptions(selected,{blank});
    const gatherSkills=Array.isArray(locationsApi()?.GATHERING?.skills)?locationsApi().GATHERING.skills:GATHERING_PROFESSIONS;
    const skillChoices=[...gatherSkills.map(p=>[p,PROFESSION_KEYS.includes(professionKey(p))?professionTitle(professionKey(p)):p]),...SKILL_IDS.map(k=>[k,skillLabel(k)])];
    const form=g.source==='adhoc'?`<div class="agl-gather-form">
       <label class="ag-field">Label<input data-gather-adhoc="label" maxlength="80" value="${esc(a.label)}" placeholder="e.g. Roadside herb patch"></label>
       <label class="ag-field">Skill / profession<select data-gather-adhoc="skill">${skillChoices.map(([v,l])=>`<option value="${esc(v)}" ${a.skill===v?'selected':''}>${esc(l)}</option>`).join('')}</select></label>
       <label class="ag-field">Tier<select data-gather-adhoc="tier">${TIERS.map((t,i)=>`<option value="${i+1}" ${String(a.tier)===String(i+1)?'selected':''}>${i+1} · ${t}</option>`).join('')}</select></label>
       <label class="ag-field">DC<input data-gather-adhoc="dc" type="number" min="1" max="40" step="1" value="${esc(a.dc)}" placeholder="Default for tier: ${defaultDC(a.tier)}"></label>
       <label class="ag-field">Common material ${materialBadge(a.materialId)}<select data-gather-adhoc="materialId">${matOpts(a.materialId,'Choose…')}</select></label>
       <label class="ag-field">Common quantity<input data-gather-adhoc="quantity" type="number" min="1" max="99" step="1" value="${esc(a.quantity)}"></label>
       <label class="ag-field">Rare material (success by 5+) ${materialBadge(a.rareMaterialId)}<select data-gather-adhoc="rareMaterialId">${matOpts(a.rareMaterialId,'None — common instead')}</select></label>
       <label class="ag-field">Rare quantity<input data-gather-adhoc="rareQuantity" type="number" min="1" max="99" step="1" value="${esc(a.rareQuantity)}"></label></div>
       ${this._exoticPicker(node)}
       ${mats.length?'':notice('Import at least one material with General Manager first.','warn')}`
      :g.source==='template'?this._templatePick(templates)
      :`<label class="ag-field">Gathering node<select data-gather-field="nodeRef"><option value="">Choose a node…</option>${nodeOptions}</select></label>
       ${where.locations.length?'':emptyState('No gathering resources in Locations yet.','Add gathering resources to a location in Locations, or use a node template or an ad-hoc node.')}`;
    const blocker=g.source==='adhoc'&&node&&!node.materialId?'Choose a common material for the ad-hoc node.'
      :g.source==='template'&&!node?(templates.length?'Choose a node template.':'No node templates yet: create one in Gathering Nodes.')
      :startBlocker({rosterCount:rosterIds().length,partyCount:party.length,leadInParty:true,node,...nodeMaterialCheck(node,g.allowDraft),busy:Boolean(node)&&nodeBusy(node.key)});
    const ready=!blocker;
    const lead0=lead,rollers=allUsers().filter(u=>u.active&&!u.isGM&&lead0.testUserPermission?.(u,'OWNER'));
    const startLabel=rollers.length?`Send gathering check to ${nameList(rollers)}`:'Start gathering check (you roll)';
    const start=`<section class="ag-card agl-panel"><h2>Start gathering</h2>
      ${fold({key:'gather-how',title:'How gathering works',body:'<p class="agl-sub">One lead gatherer, one check per node for the party. Helpers with suitable tools give advantage, not another attempt. Success gives one common bundle; success by 5+ gives one rare bundle instead. A success can also find one Exotic when the node has Exotic candidates (only an awarded Exotic is shown to players). Failure exhausts the node. Players can also ask for a node from their Gathering tab: their requests wait in Requests.</p>'})}
      <div class="ag-segmented" role="radiogroup" aria-label="Node source"><button type="button" role="radio" aria-checked="${g.source==='location'}" data-action="gather-source" data-id="location" ${where.ok?'':`disabled data-tooltip="${esc(where.reason)}" data-tooltip-class="ag-tooltip"`}>Location node</button><button type="button" role="radio" aria-checked="${g.source==='template'}" data-action="gather-source" data-id="template">Node template</button><button type="button" role="radio" aria-checked="${g.source==='adhoc'}" data-action="gather-source" data-id="adhoc">Ad-hoc node</button></div>
      ${where.ok?'':`<p class="agl-sub">${esc(where.reason)} Node templates and ad-hoc nodes still work.</p>`}
      ${form}
      ${node?`<p class="agl-sub">${esc(nodeSummary(node))} · common ${node.quantity} × ${esc(node.materialId?materialName(node.materialId):'—')}${node.rareMaterialId?` · rare ${node.rareQuantity} × ${esc(materialName(node.rareMaterialId))}`:''}${node.finite?' · finite':''}${node.note&&node.materialId?` · ${esc(node.note)}`:''}</p>
        ${g.source!=='adhoc'&&exoticSummary(node,{allowDraft:g.allowDraft})?`<p class="agl-sub">${esc(exoticSummary(node,{allowDraft:g.allowDraft}))}</p>`:''}
        `:''}
      <div class="agl-gather-form">
        <label class="ag-field">Lead gatherer<select data-gather-field="actorId">${party.map(p=>`<option value="${esc(p.id)}" ${p.id===lead.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>
        ${plan?`<div class="agl-sub">${esc(lead.name)}: ${plan.options.slice(0,2).map(o=>{const c=checkOption(lead,o);return `${esc(c.label)} ${formatBonus(c.bonus)}`;}).join(' · ')}${plan.professionId?'':` · no ${esc(plan.profession||'matching')} profession feature (no XP target)`}</div>`:'<div></div>'}
        ${helpers.length?`<fieldset class="agl-gather-eligible"><legend>Helpers</legend>${helpers.map(h=>`<label ${tip(h.reason)}><input type="checkbox" data-gather-helper="${esc(h.id)}" ${g.helperIds.includes(h.id)?'checked':''}> ${esc(h.name)} ${badge(h.eligible?'Advantage':h.reason,h.eligible?'ok':'muted')}</label>`).join('')}</fieldset>`:''}
      </div>
      <div class="agl-field-group"><label class="ag-field ag-field--inline"><input type="checkbox" data-gather-allow-draft aria-describedby="agl-allow-draft-hint" ${g.allowDraft?'checked':''}> Use draft materials anyway</label>
        <p class="ag-field__hint" id="agl-allow-draft-hint">GM only: this check can award draft or unreleased materials. Players still only see released ones.</p></div>
      ${blocker?`<p class="agl-reason" role="status">${esc(blocker)}</p>`:''}
      <div class="agl-management-actions"><button type="button" class="ag-btn ag-btn--primary" data-action="gather-start" ${ready?'':'disabled'}><i class="fa-solid fa-seedling" aria-hidden="true"></i> ${esc(startLabel)}</button></div>
    </section>`;
    // 0.26.0 (PL-02): Requests (n) · Active checks (n) · Start gathering. Every panel is rendered (the others hidden), so a
    // sub-tab switch keeps what was typed; new requests and checks no longer push Start gathering down the page.
    const tab=this._gatherTabNow();
    const active=sessions||last?`${last}${sessions}`:emptyState('No gathering checks open.','Start one in Start gathering, or approve a request. Checks wait here until they are rolled or cancelled.');
    const tabs=this._gatherTabs();
    const panels={requests:this._gatherQueue(),active,start,nodes:''};
    return `${subTabs({group:'agl-gather',label:'Gathering',tabs,selected:tab})}
      ${tabs.map(t=>`<div class="agl-subpanel" ${tabPanelAttrs('agl-gather',t.id,{hidden:t.id!==tab})}>${panels[t.id]}</div>`).join('')}`;
  }
  /** The GM's Gathering sub-tabs. Gathering nodes (0.31.1) is the fourth: it opens the node templates in the same place. */
  _gatherTabs(){return [{id:'requests',label:'Requests',count:gatherRequests.size},{id:'active',label:'Active checks',count:gatherSessions.size},{id:'start',label:'Start gathering'},{id:'nodes',label:'Gathering nodes'}];}
  /** The same sub-tab row around the node templates, with Gathering nodes selected; the other three go back to Gathering. */
  _nodesInGathering(content){
    const tabs=this._gatherTabs();
    return `${subTabs({group:'agl-gather',label:'Gathering',tabs,selected:'nodes'})}
      ${tabs.map(t=>`<div class="agl-subpanel" ${tabPanelAttrs('agl-gather',t.id,{hidden:t.id!=='nodes'})}>${t.id==='nodes'?content:''}</div>`).join('')}`;
  }
  async _prepareContext(options){checkPlayerLedger();const ctx=await super._prepareContext(options);
    this.demo=false;
    this.view=LEGACY_VIEWS[this.view]??this.view;
    if(!game.user.isGM){this.rosterDraft=null;if(GM_VIEWS.has(this.view))this.view='individual';}
    const lib=this.library;
    const content=({individual:()=>this._individual(lib),party:()=>this._party(lib),catalog:()=>this._catalog(lib),gathering:()=>this._gathering(),nodes:()=>this._nodesInGathering(this._nodes()),assign:()=>this._assign(),gm:()=>this._gmSetup()})[this.view]?.()??this._individual(lib);
    const inGm=game.user.isGM&&this.view==='gm',inNodes=game.user.isGM&&this.view==='nodes';
    const plan=this.nodeImport?.plan;
    const footer=inGm?`<button type="button" class="ag-btn ag-btn--ghost" data-action="gm-cancel">Cancel</button><span class="ag-footer__status" role="status" data-agl-roster-status>${this.setupStatus}</span><button type="button" class="ag-btn ag-btn--primary" data-action="roster-save" ${this.setupDirty?'':'disabled'}>Save Changes</button>`
      :inNodes&&this.nodeDraft?`<button type="button" class="ag-btn ag-btn--ghost" data-action="node-cancel">Cancel</button><span class="ag-footer__status" role="status" data-agl-node-status>${this.nodeGuard?.dirty?'Unsaved changes':esc(this.notice||'')}</span><button type="button" class="ag-btn ag-btn--primary" data-action="node-save"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save Changes</button>`
      :inNodes&&this.nodeImport?`<button type="button" class="ag-btn ag-btn--ghost" data-action="node-import-cancel">Cancel</button><span class="ag-footer__status" role="status">${esc(this.notice||'')}</span>${plan?.ok?`<button type="button" class="ag-btn ag-btn--primary" data-action="node-import-apply" ${plan.add.length||plan.update.length?'':'disabled'}><i class="fa-solid fa-file-import" aria-hidden="true"></i> Apply import</button>`:''}`
      :`<span class="ag-footer__status agl-footer-note" role="status">${esc(this.notice||'')}</span>`;
    return {...ctx,html:`<div class="agl-shell"><header class="ag-header"><div class="ag-header__title"><h1><span class="ag-header__brand">Ashen Gate</span> | Profession Ledger</h1></div>
      <div class="ag-header__meta"><span class="ag-version">v${esc(game.modules.get(ID)?.version??VERSION)}</span><button type="button" class="ag-btn ag-btn--ghost ag-btn--sm" data-action="help"><i class="fa-solid fa-circle-question" aria-hidden="true"></i> Help</button></div></header>
      <nav class="ag-tabs ag-tabs--scroll" role="tablist" aria-label="Profession Ledger views">${this._tabs()}</nav><main class="agl-main" id="agl-panel" role="tabpanel" aria-labelledby="agl-tab-${esc(this.view==='nodes'?'gathering':this.view)}" tabindex="-1" data-agl-screen="${esc(this._screen())}">${content}</main>
      <footer class="ag-footer">${footer}</footer></div>`};
  }
  /** 0.22.0: every action re-renders the whole part, which replaces the .agl-main scroll box (and the tables' sideways
   * scroll) and so jumped back to the top. The positions are kept across a re-render of the same screen; a new screen starts at the top.
   * 0.26.2: a "screen" is the tab, and on Gathering Nodes also list / editor / import (data-agl-screen on .agl-main), read from
   * the DOM being replaced. Renders can follow each other quickly (Save writes the node Journal, whose update hook renders
   * again), so the way back to the node list (_returnTo) waits for the render that actually shows the list, is applied
   * after everything else in _onRender has changed the DOM, and the editor's scroll position is never put on the list.
   * The focused control is also kept across a re-render (same data-action, data-id, name, data-* fields). */
  /** Which screen .agl-main shows: the tab, and on Gathering Nodes the list, the editor or the import preview. */
  _screen(){return this.view==='nodes'?`nodes:${this.nodeDraft?'editor':this.nodeImport?'import':'list'}`:this.view;}
  _captureScroll(){
    const main=this.element?.querySelector?.('.agl-main');
    this._scrollState=main?{screen:main.dataset?.aglScreen??this._renderedView,top:main.scrollTop,wraps:[...(main.querySelectorAll?.('.agl-map-wrap')??[])].map(w=>w.scrollLeft),
      focus:captureFocus(this.element)}:null;
  }
  _restoreScroll(){
    const s=this._scrollState,main=this.element?.querySelector?.('.agl-main');
    this._scrollState=null;
    if(!main)return;
    const screen=main.dataset?.aglScreen??this.view,back=this._returnTo;
    this._renderedView=screen;
    if(back&&back.screen===screen){
      this._returnTo=null;this._holdScroll(main,back.top);
      if(back.focus)this._focusSoon(back.focus);
      return;
    }
    if(s&&s.screen===screen){
      this._holdScroll(main,s.top);[...(main.querySelectorAll?.('.agl-map-wrap')??[])].forEach((w,i)=>{if(s.wraps[i])w.scrollLeft=s.wraps[i];});
      if(s.focus)restoreFocus(this.element,s.focus);
    }
  }
  /** Sets the scroll position, and once more on the next frame if a late layout change (Foundry's own steps after
   * _onRender) moved it before the GM could scroll. */
  _holdScroll(main,top){
    main.scrollTop=top;
    const raf=globalThis.requestAnimationFrame;if(typeof raf!=='function'||!top)return;
    raf(()=>{if(main.isConnected!==false&&main.scrollTop!==top)main.scrollTop=top;});
  }
  /** Focuses the control (without scrolling). A modal confirm (Discard changes?) that is still closing makes this window
   * inert and then hands the focus back to the button that opened it, which the re-render removed, so the focus lands on
   * the page: try again for a moment until it takes, unless the GM has moved the focus somewhere else. */
  _focusSoon(selector){
    clearInterval(this._focusTimer);this._focusTimer=null;
    const doc=globalThis.document;
    const attempt=()=>{const el=this.element?.querySelector?.(selector);if(!el||el.disabled)return true;el.focus?.({preventScroll:true});return !doc||doc.activeElement===el;};
    if(attempt())return;
    let tries=0;
    this._focusTimer=setInterval(()=>{
      const a=doc?.activeElement,elsewhere=a&&a!==doc.body&&!a.closest?.('dialog')&&!a.closest?.('.ag-dialog');
      if(++tries>40||elsewhere||attempt()){clearInterval(this._focusTimer);this._focusTimer=null;}
    },50);
  }
  async _preRender(context,options){await super._preRender?.(context,options);this._captureScroll();}
  async _onRender(context,options){await super._onRender(context,options);if(!canOpenLedger()){await this.close?.({animate:false});return;}openLedgerWindows.add(this);this._events?.abort();this._events=new AbortController();
    const signal=this._events.signal;
    this.element.addEventListener('click',e=>{
      const sub=e.target.closest?.('.ag-tabs--sub [role="tab"]');
      if(sub){
        // Gathering nodes shares Gathering's sub-tab row but is its own view (it has an editor and a footer).
        if(game.user.isGM&&sub.id.startsWith('agl-gather-')&&(sub.dataset.tab==='nodes'||this.view==='nodes')){void this._click('gather-tab',sub.dataset.tab);return;}
        this._showSubTab(sub);return;}
      const b=e.target.closest('[data-action]');if(!b||b.disabled)return;if(b.closest('summary'))e.preventDefault();if(xpModeClick(b)||itemLinkClick(b))return;
      // 0.27.0: a Tools and checks cell's checkbox list opens and closes in place (no re-render, the draft is untouched).
      if(b.dataset.action==='map-pick'||b.dataset.action==='map-pick-done'){const picker=b.closest('[data-map-picker]');
        this._toggleMapPicker(picker,b.dataset.action==='map-pick'&&picker?.querySelector('.agl-mpick__pop')?.hidden!==false);return;}
      void this._click(b.dataset.action,b.dataset.id,b.dataset);},{signal});
    // Escape in an open cell list closes it and returns focus to its button (and does not close the window).
    // Enter in the carried-gear name box adds it (no form submit).
    this.element.addEventListener('keydown',e=>{
      if(e.key==='Enter'&&e.target?.matches?.('[data-map-item-input]')){e.preventDefault();const k=e.target.closest('[data-map-picker]')?.dataset?.mapProf;if(k)void this._click('map-add-item',k,{});return;}
      if(e.key!=='Escape')return;const picker=e.target?.closest?.('[data-map-picker]');
      if(!picker||picker.querySelector('.agl-mpick__pop')?.hidden!==false)return;e.preventDefault();e.stopPropagation();this._toggleMapPicker(picker,false);},{signal});
    if(this._reopenMapPicker){const {list,k}=this._reopenMapPicker;this._reopenMapPicker=null;
      const picker=this.element.querySelector(`[data-map-picker][data-map-list="${list}"][data-map-prof="${k}"]`);
      if(picker){this._toggleMapPicker(picker,true);picker.querySelector('[data-map-item-input]')?.focus?.();}}
    // 0.26.0: kit file buttons (a real button plus a visually hidden input), tab keyboard, remembered folds.
    const unbind=[bindFileButtons(this.element,([file],wrap)=>this._readFile(wrap?.dataset?.aglFile,file)),
      bindTablist(this.element.querySelector('nav.ag-tabs')),...[...this.element.querySelectorAll('.ag-tabs--sub')].map(list=>bindTablist(list)),bindFolds(this.element,this._ui)];
    signal.addEventListener('abort',()=>unbind.forEach(fn=>fn()));
    if(this.nodeDraft)this.nodeGuard.watch(this.element.querySelector('.agl-node-editor'));
    this.element.addEventListener('toggle',e=>{const key=e.target?.dataset?.folder;if(!key||this.query)return;if(e.target.dataset.big!==undefined){if(e.target.open)this.closedFolders.add(`open:${key}`);else this.closedFolders.delete(`open:${key}`);return;}if(e.target.open)this.closedFolders.delete(key);else this.closedFolders.add(key);},{signal,capture:true});
    this.element.addEventListener('change',e=>{
      if(e.target?.matches?.('[data-agl-actor]')){this.actorId=e.target.value;this.render();return;}
      if(e.target?.matches?.('[data-gather-helper]')){
        const id=e.target.dataset.gatherHelper,next=new Set(this.gather.helperIds);
        if(e.target.checked)next.add(id);else next.delete(id);
        this.gather.helperIds=[...next];if(game.user.isGM)this.render();return;
      }
      if(e.target?.matches?.('[data-gather-field]')){const f=e.target.dataset.gatherField;if(['actorId','nodeRef','templateId','templateTier'].includes(f)){this.gather[f]=e.target.value;if(f==='actorId')this.gather.helperIds=this.gather.helperIds.filter(id=>id!==e.target.value);if(f==='templateId')this.gather.templateTier='';this.render();}return;}
      if(e.target?.matches?.('[data-gather-allow-draft]')&&game.user.isGM){this.gather.allowDraft=e.target.checked;this.render();return;}
      if(e.target?.matches?.('[data-node-filter]')&&game.user.isGM){this.nodeFilter=e.target.value;this.render();return;}
      if(e.target?.matches?.('[data-node-field],[data-node-prof],[data-node-mat]')&&game.user.isGM&&this.nodeDraft){if(this._nodeDraftChange(e.target))this.render();return;}
      if(e.target?.matches?.('[data-gather-adhoc]')&&game.user.isGM){this.gather.adhoc[e.target.dataset.gatherAdhoc]=e.target.value;this.render();return;}
      if(e.target?.matches?.('[data-gather-pick]')&&game.user.isGM){this.gather.pick[e.target.dataset.gatherPick]=e.target.value;this.render();return;}
      if(e.target?.matches?.('[data-adhoc-exotic]')&&game.user.isGM){
        const id=e.target.dataset.adhocExotic,k=e.target.dataset.exoticKey,entry=this.gather.adhoc.exotics.find(x=>x.materialId===id);
        if(entry&&['mode','chance','condition'].includes(k)){entry[k]=e.target.value;this.gather.adhoc.exotics=normalizeExotics(this.gather.adhoc.exotics.map(x=>x===entry?{chance:'',...x}:x));}
        this.render();return;}
      if(e.target?.matches?.('[data-player-access]')&&game.user.isGM){this.accessDraft=e.target.checked;this._syncRosterActions();return;}
      if(e.target?.matches?.('[data-core-award]')&&game.user.isGM){this.coreAwardDraft=e.target.checked;this._syncRosterActions();return;}
      if(e.target?.matches?.('[data-exotic-chance]')&&game.user.isGM){this.exoticDraft=e.target.value;this._syncRosterActions();return;}
      if(e.target?.matches?.('[data-map-cell]')&&game.user.isGM){this._rememberMapDraft(e.target);return;}
      if(e.target?.matches?.('[data-assign-target]')&&game.user.isGM){this.assignState={target:e.target.value,preview:null,selected:new Set()};this.render();return;}
      if(e.target?.matches?.('[data-assign-row]')&&game.user.isGM){const id=e.target.dataset.assignRow;if(e.target.checked)this.assignState.selected.add(id);else this.assignState.selected.delete(id);this.render();return;}
      if(e.target?.matches?.('[data-grant-target]')&&game.user.isGM){this.grantState={target:e.target.value,preview:null,selected:new Set(),result:null};this.render();return;}
      if(e.target?.matches?.('[data-grant-row]')&&game.user.isGM){const id=e.target.dataset.grantRow;if(e.target.checked)this.grantState.selected.add(id);else this.grantState.selected.delete(id);this.render();return;}
      if(e.target?.matches?.('[data-signature-target]')&&game.user.isGM){this.signatureState={target:e.target.value,preview:null,selected:new Set(),result:null};this.render();return;}
      if(e.target?.matches?.('[data-signature-row]')&&game.user.isGM){const id=e.target.dataset.signatureRow;if(e.target.checked)this.signatureState.selected.add(id);else this.signatureState.selected.delete(id);this.render();return;}
      if(e.target?.matches?.('[data-roster-actor]')&&game.user.isGM)this._rememberRosterDraft();
    },{signal});
    this.element.querySelector('[data-agl-search]')?.addEventListener('input',e=>{this.query=e.target.value;this._applySearch();},{signal});
    this.element.addEventListener?.('input',e=>{if(e.target?.matches?.('[data-label-field]'))this._rememberLabelDraft(e.target);},{signal});
    this._applySearch();this._syncRosterActions();
    // Last, once the folds, search and guards have shaped the DOM.
    this._restoreScroll();}
  /** Sub-tab switch inside GM Setup or Gathering (GM): panels are already rendered, so nothing re-renders and no draft is touched. */
  _showSubTab(tab){
    const list=tab.closest('[role="tablist"]'),id=tab.dataset.tab;
    for(const t of list?.querySelectorAll?.('[role="tab"]')??[]){
      const on=t===tab;t.setAttribute('aria-selected',String(on));t.setAttribute('tabindex',on?'0':'-1');
      const panel=this.element.querySelector(`#${t.getAttribute('aria-controls')}`);if(panel)panel.hidden=!on;
    }
    if(tab.id.startsWith('agl-gm-setup-')&&GM_SETUP_TABS.some(t=>t.id===id))this._ui.set('gmSetupTab',this.gmTab=id);
    if(tab.id.startsWith('agl-gather-')&&GATHER_TAB_IDS.includes(id))this._ui.set('gatherTab',this.gatherTab=id);
    if(tab.id.startsWith('agl-assign-')&&ASSIGN_TABS.some(t=>t.id===id))this._ui.set('assignTab',this.assignTab=id);
  }
  /** A file picked with one of the kit file buttons: catalog JSON, baseline file or node file. */
  async _readFile(kind,file){
    if(!file)return;
    if(kind==='catalog')return this._upload(file);
    if(kind==='baseline')return this._uploadBaseline(file);
    if(kind==='nodes')return this._uploadNodes(file);
  }
  /** Records one node editor input in the draft. Returns true when the editor must re-render (its layout changed). */
  _nodeDraftChange(el){
    const d=this.nodeDraft.data;
    if(el.dataset.nodeProf){const k=el.dataset.nodeProf,set=new Set(d.professions);if(el.checked)set.add(k);else set.delete(k);d.professions=NODE_PROFESSIONS.filter(x=>set.has(x));return false;}
    if(el.dataset.nodeMat){
      const row=d[el.dataset.nodeMat]?.[Number(el.dataset.nodeRow)],k=el.dataset.nodeKey;
      if(!row||!['materialId','quantity','chance','mode','condition'].includes(k))return false;
      row[k]=el.value;return k==='materialId'||k==='mode';
    }
    const f=el.dataset.nodeField;
    if(['dcVisible','finite'].includes(f)){d[f]=el.checked;return false;}
    if(!['id','name','activity','tierMin','tierMax','dc','checkSkill','checkTool','note'].includes(f))return false;
    d[f]=f==='id'?el.value.trim().toUpperCase():el.value;
    if(f==='tierMin'&&Number(d.tierMax)<Number(d.tierMin))d.tierMax=d.tierMin;
    if(f==='tierMax'&&Number(d.tierMin)>Number(d.tierMax))d.tierMin=d.tierMax;
    // Text fields never re-render (that would move focus away while the GM types).
    return ['activity','tierMin','tierMax'].includes(f);
  }
  /** GM: read a node file and show its import preview; nothing is saved until Apply import. */
  async _uploadNodes(f){if(!game.user.isGM||!f)return;
    try{const data=JSON.parse(await f.text());this._rememberNodeList();this.nodeImport={fileName:f.name??'',data,plan:previewNodeFile(data)};this.render();}
    catch(err){say(`Node file not read: ${err.message}`,true);}}
  /** Client-side filter; folders open while searching and hide when empty. */
  _applySearch(){
    const query=this.query.trim().toLowerCase();
    const root=this.element;if(!root?.querySelectorAll)return;
    for(const row of root.querySelectorAll('[data-recipe-search]'))row.hidden=Boolean(query)&&!row.dataset.recipeSearch.includes(query);
    for(const folder of root.querySelectorAll('[data-folder]')){
      const rows=[...folder.querySelectorAll('[data-recipe-search]')];
      folder.hidden=Boolean(query)&&rows.length>0&&rows.every(r=>r.hidden);
      if(query&&!folder.hidden)folder.open=true;
    }
    const empty=root.querySelector?.('.agl-no-matches');
    if(empty)empty.hidden=!query||[...root.querySelectorAll('[data-recipe-search]')].some(r=>!r.hidden);
  }
  async _click(action,id,data={}){try{checkPlayerLedger();
      if(action==='tab'){
        const next=LEGACY_VIEWS[id]??id;
        if(!game.user.isGM&&GM_VIEWS.has(next))throw Error('GM only');
        if(this.view==='gm'&&next!=='gm'&&!await this._leaveGmSetup())return;
        if(next!=='nodes'&&!await this._leaveNodes())return;
        if(next==='gathering'&&this.view!=='gathering')this.gatherTab=null;
        this.view=next;this.render();return;}
      if(action==='gather-tab'){
        if(!game.user.isGM)throw Error('GM only');
        if(id==='nodes'){this.view='nodes';this.render();return;}
        if(!GATHER_TAB_IDS.includes(id))return;
        if(!await this._leaveNodes())return;
        this._ui.set('gatherTab',this.gatherTab=id);this.view='gathering';this.render();return;}
      if(action==='help'){await infoDialog('Profession Ledger help',this._help());return;}
      // 0.26.0 (PL-13): Cancel discards the GM Setup drafts and stays on GM Setup (the suite convention).
      if(action==='gm-cancel'){if(!game.user.isGM)throw Error('GM only');if(!await this._leaveGmSetup())return;this.baselinePreview=null;this.render();return;}
      if(action==='actor'||action==='open-individual'){if(!myCharacters().some(a=>a.id===id))throw Error('You can only open your own character');this.actorId=id;this.view='individual';this.render();return;}
      if(action==='party-sort'){this.partySort=id==='profession'?'profession':'player';this.render();return;}
      if(action==='demo')throw Error('Demonstration mode was removed. Use an isolated test world with imported source definitions.');
      if(action==='xwalk-cancel'){this.baselinePreview=null;this.render();return;}
      if(action==='xwalk-apply'){requireCrosswalkGM();const p=this.baselinePreview;if(!p)throw Error('Import a baseline file first');
        const out=await applyBaseline(p.data,{fileName:p.fileName});this.baselinePreview=null;
        this.notice=`Baseline file applied: ${out.professions} profession${out.professions===1?'':'s'}. Your own edits still win.`;say(this.notice);this.render();return;}
      if(action==='xwalk-export'){const data=exportCurrentCrosswalk();
        const save=globalThis.foundry?.utils?.saveDataToFile??globalThis.saveDataToFile;
        if(typeof save!=='function')throw Error('This Foundry version cannot download files here');
        save(JSON.stringify(data,null,2),'application/json',`ag-profession-crosswalk-${data.exportedAt.slice(0,10)}.json`);return;}
      if(action==='map-clear'){if(!game.user.isGM)throw Error('GM only');
        const picker=this.element?.querySelector?.(`[data-map-picker][data-map-list="${data.list??''}"][data-map-prof="${id??''}"]`)??null;
        for(const box of picker?.querySelectorAll?.('input[data-map-cell]')??[])box.checked=false;
        this._setMapCell(data.list,id,[]);if(data.list==='advantageTools')this._setMapCell('advantageItems',id,[]);if(picker)this._syncMapCell(picker);return;}
      if(action==='map-add-item'){if(!game.user.isGM)throw Error('GM only');
        const picker=this.element?.querySelector?.(`[data-map-picker][data-map-list="advantageTools"][data-map-prof="${id??''}"]`)??null;
        const name=String(picker?.querySelector?.('[data-map-item-input]')?.value??data.value??'').trim();if(!name)return;
        this.mapDraft??=mappingDraft(checkMapping());
        this._setMapCell('advantageItems',id,[...mapCellValues(crosswalkInfo(this.mapDraft).map,'advantageItems',id),name]);
        // Re-render to list the new item, then reopen this cell with the focus back in the name box.
        this._reopenMapPicker={list:'advantageTools',k:id};this.render();return;}
      if(action==='map-reset'){if(!game.user.isGM)throw Error('GM only');this.mapDraft??=mappingDraft(checkMapping());const d=this.mapDraft;
        // Back to the default: the check tool/skill and the access/advantage lists. A legacy items list is left as it is.
        for(const l of MAP_LISTS)delete d[l][id];
        d.tools[id]=DEFAULT_PROFESSION_TOOLS[id]??'';if(id in DEFAULT_GATHER_SKILLS)d.skills[id]=DEFAULT_GATHER_SKILLS[id];else delete d.skills[id];
        this.render();return;}
      if(action==='assign-preview'){requireAssignGM();const a=this.assignState;
        a.preview=assignPreview({actorIds:a.target==='party'?null:[a.target]});a.selected=new Set(a.preview.rows.filter(r=>r.status==='propose').map(r=>r.id));this.render();return;}
      if(action==='assign-apply'){requireAssignGM();const a=this.assignState;if(!a.preview)throw Error('Preview first');
        const rows=a.preview.rows.filter(r=>r.status==='propose'&&(id==='all'||a.selected.has(r.id)));
        if(!rows.length)throw Error('Nothing selected to add');
        const ok=await confirmDialog(`Add these profession features:\n${rows.map(r=>`• ${r.actorName}: ${r.profession} (${r.reason})`).join('\n')}\nXP, levels, Skill Tree perks and existing Items are not changed.`,{title:'Add profession features?',yes:'Add features'});
        if(!ok)return;
        const out=await assignProfessions({actorIds:a.target==='party'?null:[a.target],rowIds:rows.map(r=>r.id)});
        a.preview=assignPreview({actorIds:a.target==='party'?null:[a.target]});a.selected=new Set();
        this.notice=`Added ${plural(out.added.length,'profession feature')}${out.skipped.length?`; ${out.skipped.length} skipped (already there)`:''}.`;this.render();say(this.notice);return;}
      if(action==='grant-preview'){requireGrantGM();const g=this.grantState;
        g.preview=startingRecipesPreview({actorIds:g.target==='party'?null:[g.target]});g.selected=new Set(g.preview.rows.filter(r=>r.status==='new').map(r=>r.id));g.result=null;this.render();return;}
      if(action==='grant-select'){requireGrantGM();const g=this.grantState;if(!g.preview)return;g.selected=id==='none'?new Set():new Set(g.preview.rows.filter(r=>r.status==='new').map(r=>r.id));this.render();return;}
      if(action==='grant-apply'){requireGrantGM();const g=this.grantState;if(!g.preview)throw Error('Preview first');
        const rows=g.preview.rows.filter(r=>r.status==='new'&&(id==='all'||g.selected.has(r.id)));
        if(!rows.length)throw Error('Nothing selected to grant');
        const byActor=[...new Set(rows.map(r=>r.actorName))].map(n=>`• ${n}: ${rows.filter(r=>r.actorName===n).map(r=>r.recipeName).join(', ')}`);
        const ok=await confirmDialog(`Grant these starting recipes:\n${byActor.join('\n')}\nNo recipe item is needed or used up, and no known recipe is removed.`,{title:'Grant starting recipes?',yes:'Grant recipes'});
        if(!ok)return;
        const actorIds=g.target==='party'?null:[g.target];
        const out=await grantStartingRecipes({preview:false,actorIds,rowIds:rows.map(r=>r.id)});
        g.result=out;g.preview=startingRecipesPreview({actorIds});g.selected=new Set();
        const total=out.granted.reduce((n,x)=>n+x.recipes.length,0);
        this.notice=total?`Granted ${plural(total,'starting recipe')} to ${plural(out.granted.length,'character')}.`:'Nothing new to grant.';this.render();say(this.notice);return;}
      if(action==='signature-preview'){requireSignatureGM();const g=this.signatureState;
        g.preview=signaturePerksPreview({actorIds:g.target==='party'?null:[g.target]});g.selected=new Set(g.preview.rows.filter(r=>r.status==='new').map(r=>r.id));g.result=null;this.render();return;}
      if(action==='signature-select'){requireSignatureGM();const g=this.signatureState;if(!g.preview)return;g.selected=id==='none'?new Set():new Set(g.preview.rows.filter(r=>r.status==='new').map(r=>r.id));this.render();return;}
      if(action==='signature-apply'){requireSignatureGM();const g=this.signatureState;if(!g.preview)throw Error('Preview first');
        const rows=g.preview.rows.filter(r=>r.status==='new'&&(id==='all'||g.selected.has(r.id)));
        if(!rows.length)throw Error('Nothing selected to grant');
        const byActor=[...new Set(rows.map(r=>r.actorName))].map(n=>`• ${n}: ${rows.filter(r=>r.actorName===n).map(r=>r.perkName).join(', ')}`);
        const ok=await confirmDialog(`Grant these signature perks:\n${byActor.join('\n')}\nEach is added to the character as an Item and announced in chat. Nothing is removed.`,{title:'Grant signature perks?',yes:'Grant perks'});
        if(!ok)return;
        const actorIds=g.target==='party'?null:[g.target];
        const out=await grantSignaturePerks({actorIds,rowIds:rows.map(r=>r.id)});
        g.result=out;g.preview=signaturePerksPreview({actorIds});g.selected=new Set();
        const total=out.granted.reduce((n,x)=>n+x.perks.length,0);
        this.notice=total?`Granted ${plural(total,'signature perk')} to ${plural(out.granted.length,'character')}.${out.failed.length?` ${plural(out.failed.length,'character')} could not be updated.`:''}`:out.failed.length?`${plural(out.failed.length,'character')} could not be updated.`:'Nothing new to grant.';
        this.render();say(this.notice,out.failed.length>0&&!total);return;}
      if(action==='manager'){if(!game.user.isGM)throw Error('GM only');const m=game.modules.get('ashen-gate-manager');const api=m?.active?m.api:null;if(api?.open)api.open();else say('Ashen Gate Manager is not enabled.',true);return;}
      if(action==='skilltree'){const module=game.modules.get('ashen-gate-skill-trees');const api=module?.active?module.api:null;
        if(!api?.open){say('Skill Trees is not enabled.',true);return;}
        api.open({actorId:this.actorId,treeId:professionTreeId(api,id)});return;}
      if(action==='roster-all'||action==='roster-clear'){if(!game.user.isGM)throw Error('GM only');
        for(const input of this.element.querySelectorAll('[data-roster-actor]')){const a=game.actors.get(input.dataset.rosterActor);input.checked=action==='roster-all'?Boolean(a?.hasPlayerOwner):false;}this._rememberRosterDraft();return;}
      if(action==='roster-save'){if(!game.user.isGM)throw Error('GM only');
        const ids=[...this.element.querySelectorAll('[data-roster-actor]:checked')].map(el=>el.dataset.rosterActor).filter(id=>allCharacters().some(a=>a.id===id));
        const saved=[];
        if(this.rosterDirty||!this.setupDirty){await game.settings.set(ID,'partyRoster',ids);saved.push(`party: ${plural(ids.length,'character')}`);}
        // 0.26.2: only what differs from the built-in defaults is stored (see compactCheckMapping); other saved keys are kept.
        if(this.mapDirty){await game.settings.set(ID,'checkMapping',compactCheckMapping({...game.settings.get(ID,'checkMapping'),...structuredClone(this.mapDraft)}));saved.push('tools and checks');}
        if(this.exoticDirty){const pct=clampPercent(this.exoticDraft,exoticPercent());await game.settings.set(ID,EXOTIC_SETTING,pct);saved.push(`Exotic discovery ${pct}%`);}
        if(this.coreAwardDirty){await game.settings.set(ID,CORE_AWARD_SETTING,this.coreAwardDraft);saved.push(`core item awards ${this.coreAwardDraft?'on':'off'}`);}
        if(this.labelDirty){await game.settings.set(ID,RECIPE_LABEL_SETTING,compactLabels(this.labelDraft));saved.push('recipe names');}
        if(this.accessDirty){const on=this.accessDraft;await setPlayerAccess(game,ID,on);saved.push(`Player Access ${on?'on (players can open the Ledger)':'off (hidden from players)'}`);}
        this._clearSetupDrafts();this.notice=`Saved ${saved.join('; ')}.`;this.render();say(this.notice);return;}
      if(['learn-recipe','craft','complete-activity','award-xp','adjust-xp'].includes(action)){
        const actorId=data.actor??(String(id).includes(':')?String(id).split(':')[0]:this.actor?.id);
        const input=action==='award-xp'?this.element?.querySelector?.(`[data-xp-input="${id}"]`):null;
        const q=n=>this.element?.querySelector?.(`[data-xp-${n}="${id}"]`)?.value;
        const out=await performAction(action,{id,actorId,points:input?.value,delta:action==='adjust-xp'?q('delta'):null,set:action==='adjust-xp'?q('set'):null,reason:action==='adjust-xp'?q('reason'):''});
        if(!out)return;
        if(out.award)this.lastAward=out.award;
        this.notice=out.message;this.render();say(out.message,out.ok===false);return;}
      if(action==='adhoc-exotic-add'||action==='adhoc-exotic-remove'){if(!game.user.isGM)throw Error('GM only');
        // 0.25.0: a draft/unreleased Exotic can be picked (it is found only with "Use draft materials anyway"); a missing one cannot.
        if(action==='adhoc-exotic-add'){const why=materialUnavailable(id);if(why&&!usableAnyway(materialState(id).state))throw Error(why);}
        const list=this.gather.adhoc.exotics.filter(x=>x.materialId!==id);
        this.gather.adhoc.exotics=normalizeExotics(action==='adhoc-exotic-add'?[...list,{materialId:id,mode:'discovery'}]:list);this.render();return;}
      if(action==='gather-source'){if(!game.user.isGM)throw Error('GM only');this.gather.source=['adhoc','template'].includes(id)?id:'location';this.render();return;}
      if(action==='gather-start'){if(!game.user.isGM)throw Error('GM only');
        const session=await startGather({node:this._selectedNode(),leadId:this.gather.actorId,helperIds:this.gather.helperIds,allowDraft:this.gather.allowDraft});
        this.gather.nodeRef='';this.gather.helperIds=[];this.gatherTab='active';
        this.notice=session.rollerIds.length?`Gathering check sent to ${session.leadName}’s player.`:`No owner of ${session.leadName} is online: roll for them in Active checks.`;this.render();say(this.notice);return;}
      if(action==='gather-cancel'){cancelGather(id);this.notice='Gathering check cancelled. Nothing was used.';this.render();return;}
      if(action==='gather-gm-roll'||action==='gather-record'){if(!game.user.isGM)throw Error('GM only');
        const session=gatherSessions.get(id);if(!session)throw Error('This gathering check is no longer open');
        const choice=this.element?.querySelector?.(`[data-gather-roll-check="${id}"]`)?.value??session.plan.selected;
        const mode=this.element?.querySelector?.(`[data-gather-roll-mode="${id}"]`)?.value??0;
        let total;
        if(action==='gather-record'){total=this.element?.querySelector?.(`[data-gather-total="${id}"]`)?.value;if(total===''||total==null)throw Error('Enter the check total first');}
        else{const lead=game.actors.get(session.leadId);total=(await rollForGather(lead,gatherProjection(session),{choice,mode})).total;}
        const out=await resolveGather(id,{total:Number(total),choice,mode,by:game.user.name});
        this.notice=out.award?`${session.leadName} gathered ${out.award.quantity} × ${out.award.name}${out.exoticAward?` and an Exotic ${out.exoticAward.name}`:''}.`:`${session.leadName}’s gathering failed; the node is exhausted.`;this.render();say(this.notice);return;}
      if(action==='gather-player-roll'){
        await submitGatherRoll(id,{choice:this.element?.querySelector?.(`[data-gather-roll-check="${id}"]`)?.value,mode:this.element?.querySelector?.(`[data-gather-roll-mode="${id}"]`)?.value});return;}
      if(action==='gather-request'){
        const mine=myCharacters(),actor=mine.find(a=>a.id===this.gather.actorId)??mine[0];
        const [locationId,nodeId]=String(this.gather.nodeRef??'').split('|');
        if(!locationId||!nodeId)throw Error('Choose an available gathering spot');
        this.gather.pending=true;this.render();say('Gathering request sent to the GM.');
        let out;try{out=await requestGather({actorId:actor?.id,locationId,nodeId,helperIds:this.gather.helperIds});}finally{this.gather.pending=false;}
        this.notice=out.message;if(out.ok){this.gather.nodeRef='';this.gather.helperIds=[];}this.render();say(out.message,!out.ok);return;}
      if(action==='gather-approve'){if(!game.user.isGM)throw Error('Only the GM can approve gathering');await approveGatherRequest(id,{allowDraft:data.draft==='1'});if(!gatherRequests.size)this.gatherTab='active';this.render();return;}
      if(action.startsWith('node-')){await this._nodeAction(action,id);return;}
      if(action==='gather-decline'){if(!game.user.isGM)throw Error('Only the GM can decline gathering');
        const reason=this.element?.querySelector?.(`[data-gather-decline-reason="${id}"]`)?.value??'';declineGatherRequest(id,{reason});this.render();return;}
    }catch(e){console.error(`[${ID}]`,e);say(`Profession Ledger: ${e.message}`,true);}}
  /** GM: Gathering Nodes tab actions. Every write goes through the GM-only data layer. */
  async _nodeAction(action,id){
    requireNodesGM();
    if(action==='node-new'){this._openNodeEditor(nodeDraftOf(null),null);return;}
    if(action==='node-edit'){const t=nodeTemplate(id);if(!t)throw Error('That gathering node no longer exists');this._openNodeEditor(nodeDraftOf(t),id);return;}
    if(action==='node-cancel'){if(!await this.nodeGuard.confirm())return;this._closeNodeEditor();return;}
    if(action==='node-row-add'){if(!this.nodeDraft||!TABLES.includes(id))return;
      this.nodeDraft.data[id].push(id==='exotic'?{materialId:'',mode:'discovery',chance:'',condition:'success'}:{materialId:'',quantity:'1',chance:''});this.nodeGuard.markDirty();this.render();return;}
    if(action==='node-row-remove'){const [t,i]=String(id).split(':');if(!this.nodeDraft||!TABLES.includes(t))return;this.nodeDraft.data[t].splice(Number(i),1);this.nodeGuard.markDirty();this.render();return;}
    if(action==='node-save'){
      const draft=this.nodeDraft;if(!draft)return;
      const store=readNodeStore(),taken=new Set([...store.nodes.map(n=>n.id),...store.retiredIds]);
      const raw=draftTemplate(draft.data,taken),r=saveTemplate(store,raw,{isNew:draft.isNew});
      if(!r.ok){draft.errors=r.errors;this.render();throw Error(`Node not saved: ${r.errors[0]}${r.errors.length>1?` (+${r.errors.length-1} more)`:''}`);}
      await writeNodeStore(r.store);
      this.notice=`Saved node ${r.node.name}.`;this._closeNodeEditor(r.node.id);say(this.notice);return;}
    if(action==='node-duplicate'){const copy=await duplicateNodeTemplate(id);this.notice=`Duplicated as ${copy.name}.`;this._openNodeEditor(nodeDraftOf(nodeTemplate(copy.id)),copy.id);say(this.notice);return;}
    if(action==='node-delete'){
      const t=nodeTemplate(id);if(!t)throw Error('That gathering node no longer exists');
      const refs=nodeReferences(id),used=refs.filter(r=>r.kind==='reference'),from=refs.filter(r=>r.kind==='copied-from');
      const lines=[`Delete the gathering node “${t.name}”? Its id is retired and never reused.`,
        ...(used.length?[`${plural(used.length,'Location entry','Location entries')} point${used.length===1?'s':''} to this node: ${used.map(r=>r.locationName).join(', ')}. They are not changed or removed; each shows that its node template is gone until you pick another one in Locations.`]:[]),
        ...(from.length?[`It was copied from ${plural(from.length,'Location entry','Location entries')} (${from.map(r=>r.locationName).join(', ')}); those keep their own gathering data in Locations.`]:[]),
        'Characters keep everything they already gathered.'];
      if(!await confirmDanger(lines.join('\n'),{title:`Delete ${t.name}?`,yes:'Delete node'}))return;
      await deleteNodeTemplate(id);
      if(this.nodeDraft?.data.id===id)this.nodeDraft=null;
      this.notice=`Deleted node ${t.name}.${used.length?` ${plural(used.length,'Location entry','Location entries')} still point${used.length===1?'s':''} to it: pick another node there.`:''}`;this.render();say(this.notice);return;}
    if(action==='node-import-cancel'){this.nodeImport=null;this._backToNodeList();this.render();return;}
    if(action==='node-import-apply'){const p=this.nodeImport;if(!p)throw Error('Choose a node file first');
      const out=await importNodeFile(p.data);this.nodeImport=null;this._backToNodeList();
      this.notice=`Imported nodes: ${out.added.length} new, ${out.updated.length} updated${out.kept.length?`, ${out.kept.length} kept as you edited them`:''}${out.retired.length?`, ${out.retired.length} skipped (deleted ids)`:''}.`;this.render();say(this.notice);return;}
    if(action==='node-export'){const data=exportNodeFile();
      const save=globalThis.foundry?.utils?.saveDataToFile??globalThis.saveDataToFile;
      if(typeof save!=='function')throw Error('This Foundry version cannot download files here');
      save(JSON.stringify(data,null,2),'application/json',`ag-gathering-nodes-${data.exportedAt.slice(0,10)}.gathering-nodes.json`);return;}
    if(action==='node-copy-locations'){const out=await copyLocationNodes();
      this.notice=out.created.length||out.linked?`Copied ${plural(out.created.length+out.linked,'Location node')} (${plural(out.created.length,'new template')}). Locations were not changed.`:'No new Location nodes to copy: every Location gathering node has been copied before.';
      this.render();say(this.notice);return;}
  }
  /** 0.26.0 (PL-03): remember where the node list was, so closing the editor or import preview returns to it. */
  _rememberNodeList(focusId=null){
    if(this.nodeDraft||this.nodeImport)return;
    this._nodeList={top:this.element?.querySelector?.('.agl-main')?.scrollTop??0,focusId};
  }
  _backToNodeList(focusId){
    const back=this._nodeList;this._nodeList=null;
    const id=focusId??back?.focusId;
    this._returnTo={screen:'nodes:list',top:back?.top??0,focus:id?`[data-action="node-edit"][data-id="${String(id).replace(/["\\]/g,'\\$&')}"]`:'[data-action="node-new"]'};
  }
  _openNodeEditor(draft,focusId){this._rememberNodeList(focusId);this._returnTo=null;this.nodeGuard.markClean();this.nodeDraft=draft;this.render();}
  _closeNodeEditor(focusId){this.nodeGuard.markClean();this.nodeDraft=null;this._backToNodeList(focusId);this.render();}
  /** Unsaved party-roster edits live only in this client until the GM confirms Save. */
  get rosterDirty(){
    if(this.rosterDraft===null)return false;
    const saved=new Set(rosterIds());
    return this.rosterDraft.size!==saved.size||[...this.rosterDraft].some(id=>!saved.has(id));
  }
  _rememberRosterDraft(){
    const inputs=[...this.element?.querySelectorAll?.('[data-roster-actor]')??[]];
    this.rosterDraft=new Set(inputs.filter(el=>el.checked).map(el=>el.dataset.rosterActor));
    this._syncRosterActions();
  }
  /** Unsaved tool/check mapping edits, compared with the effective saved mapping (lists: with the GM's saved lists). */
  get mapDirty(){
    if(!this.mapDraft)return false;
    const saved=mappingDraft(checkMapping());
    const flat=v=>Array.isArray(v)?JSON.stringify([...v].sort()):v??'';
    return ['tools','skills',...CROSSWALK_LISTS].some(k=>{const a=this.mapDraft[k]??{},b=saved[k]??{};return [...new Set([...Object.keys(a),...Object.keys(b)])].some(x=>flat(a[x])!==flat(b[x]));});
  }
  /** 0.27.0: a ticked/unticked box in a Tools and checks cell: the cell's list becomes the ticked values. */
  _rememberMapDraft(el){
    const picker=el?.closest?.('[data-map-picker]');
    const list=el?.dataset?.mapCell??picker?.dataset?.mapList,k=picker?.dataset?.mapProf??el?.dataset?.mapProf;
    const ticked=picker?[...picker.querySelectorAll(`input[data-map-cell="${list}"]:checked`)].map(i=>String(i.value)):(el?.checked===false?[]:[String(el?.value??'')].filter(Boolean));
    this._setMapCell(list,k,ticked);
    if(picker)this._syncMapCell(picker);
  }
  /** 0.27.0: set one cell of the draft to these values. Values already in the cell keep their order (so the check, first,
   * stays first while it stays ticked); new ones go last. The check tool/skill becomes the first value ('' for none). The GM's
   * list is kept only when it differs from what the content, baseline file or built-in default give (0.26.2 diff save);
   * ticking back what is saved restores the saved cell, so it is not an unsaved change. */
  _setMapCell(list,k,ticked){
    if(!MAP_LISTS.includes(list)||!k)return;
    this.mapDraft??=mappingDraft(checkMapping());
    const d=this.mapDraft,field=mapCheckField(list,k),valid=list==='qualifySkills'?SKILL_IDS:mapToolOptions();
    const want=list==='advantageItems'?cleanItemList(ticked??[]):[...new Set((ticked??[]).filter(v=>valid.includes(v)))],prev=mapCellValues(crosswalkInfo(d).map,list,k);
    const next=[...prev.filter(v=>want.includes(v)),...want.filter(v=>!prev.includes(v))];
    const saved=mappingDraft(checkMapping()),savedShown=mapCellValues(crosswalkInfo(saved).map,list,k);
    const lower=crosswalkInfo({[list]:Object.fromEntries(Object.entries(d[list]).filter(([x])=>x!==k))}).map[list][k]??[];
    // Carried gear is matched by name in any case, so it is compared that way too.
    const same=(a,b)=>list==='advantageItems'?sameSet(a.map(norm),b.map(norm)):sameSet(a,b);
    if(same(next,savedShown)){
      if(saved[list][k])d[list][k]=structuredClone(saved[list][k]);else delete d[list][k];
      if(field){if(k in saved[field])d[field][k]=saved[field][k];else delete d[field][k];}
    }else{
      if(same(next,lower))delete d[list][k];else d[list][k]=next;
      // 0.28.0: the check tool is the first real tool; a group (Any musical instrument) qualifies but is not rolled.
      if(field)d[field][k]=next.find(v=>!isToolGroup(v))??'';
    }
    this._syncRosterActions();
  }
  /** Redraw one cell's summary (and its row's Reset) in place, so an open checkbox list keeps its focus. */
  _syncMapCell(picker){
    const k=picker.dataset.mapProf,list=picker.dataset.mapList,d=this.mapDraft??mappingDraft(checkMapping()),{map,unresolved}=crosswalkInfo(d);
    const v=mapCellSummary({k,title:professionTitle(k),list,map,unresolved});
    const value=picker.querySelector('.agl-mpick__value');if(value)value.textContent=v.text;
    picker.querySelector('.agl-mpick__toggle')?.setAttribute('aria-label',v.aria);
    const origin=picker.querySelector('.agl-mpick__origin');if(origin)origin.textContent=[v.origin,v.checkNote].filter(Boolean).join(' · ');
    const reset=picker.closest('tr')?.querySelector('[data-action="map-reset"]');if(reset)reset.hidden=!mapRowCustom(d,k);
  }
  /** Open or close a cell's checkbox list (one open at a time); closing returns focus to its button. */
  _toggleMapPicker(picker,open,{focus=true}={}){
    if(!picker)return;
    if(open)for(const other of this.element?.querySelectorAll?.('[data-map-picker]')??[])if(other!==picker)this._toggleMapPicker(other,false,{focus:false});
    const pop=picker.querySelector('.agl-mpick__pop'),btn=picker.querySelector('.agl-mpick__toggle');
    if(pop)pop.hidden=!open;btn?.setAttribute('aria-expanded',String(open));
    if(open)pop?.querySelector('input')?.focus?.();else if(focus)btn?.focus?.();
  }
  get setupStatus(){const n=[this.rosterDirty,this.mapDirty,this.exoticDirty,this.coreAwardDirty,this.accessDirty,this.labelDirty].filter(Boolean).length;
    return n>1?'Unsaved changes':this.rosterDirty?'Unsaved party changes':this.mapDirty?'Unsaved tool and check changes':this.exoticDirty?'Unsaved Exotic discovery change':this.coreAwardDirty?'Unsaved crafted-item change':this.accessDirty?'Unsaved Player Access change':this.labelDirty?'Unsaved recipe name changes':'All changes saved';}
  /** 0.29.0: a Recipe names box. Kept as typed (no re-render, so focus and typing stay); Save Changes cleans and saves it. */
  _rememberLabelDraft(el){
    const k=el?.dataset?.labelKey,field=el?.dataset?.labelField;
    if(!game.user.isGM||!k||!['singular','plural'].includes(field)||!allProfessions().some(p=>p.key===k))return;
    const draft=this.labelDraft??structuredClone(gmRecipeLabels());
    draft[k]={...(draft[k]??{}),[field]:String(el.value??'').slice(0,RECIPE_LABEL_MAX)};
    this.labelDraft=draft;this._syncRosterActions();
  }
  _syncRosterActions(){
    const save=this.element?.querySelector?.('[data-action="roster-save"]');
    if(save)save.disabled=!this.setupDirty;
    const status=this.element?.querySelector?.('[data-agl-roster-status]');
    if(status)status.textContent=this.setupStatus;
  }
  /** Before leaving Gathering nodes by a tab or sub-tab: ask once about an edited node and/or an import preview that was not
   * applied. Nothing is changed until the answer is Discard, so Keep editing leaves the draft, the preview, the dirty mark and
   * the focus exactly as they were. */
  async _leaveNodes(){
    if(this.view!=='nodes')return true;
    const dirty=Boolean(this.nodeDraft&&this.nodeGuard?.dirty);
    const plan=this.nodeImport?.plan;
    const preview=Boolean(plan?.ok&&(plan.add.length||plan.update.length));
    if(dirty||preview){
      const both=dirty&&preview;
      const discard=await confirmDanger(both?'Your node changes have not been saved, and the node import has not been applied.':dirty?'Your changes have not been saved.':'This node import has not been applied yet.',
        {title:preview&&!dirty?'Discard this import preview?':'Discard unsaved changes?',yes:preview&&!dirty?'Discard preview':'Discard changes',no:preview&&!dirty?'Keep reviewing':'Keep editing'});
      if(!discard)return false;
      if(dirty){this.nodeGuard.markClean();this.nodeDraft=null;}
    }
    this.nodeImport=null;
    return true;
  }
  async _leaveGmSetup(){
    if(!this.setupDirty){this._clearSetupDrafts();return true;}
    const discard=await confirmDanger('Your GM Setup changes have not been saved.',{title:'Discard unsaved changes?',yes:'Discard changes',no:'Keep editing'});
    if(!discard)return false;
    this._clearSetupDrafts();return true;
  }
  /** GM: read a baseline file and show its preview; nothing is saved until Apply baseline. */
  async _uploadBaseline(f){if(!game.user.isGM||!f)return;
    try{const data=JSON.parse(await f.text());this.baselinePreview={fileName:f.name??'',data,result:previewBaseline(data)};this.render();}
    catch(err){say(`Baseline file not read: ${err.message}`,true);}}
  async _upload(f){checkPlayerLedger();if(!game.user.isGM||!f)return;
    try{const data=normalizeLibrary(JSON.parse(await f.text()));const approved=await confirmDialog(`Source format: ${data.sourceSchema}.\nImport ${data.recipes.length} recipes and ${data.materials.length} materials into the Ledger's world-visible read-only catalog?\n${data.importSummary.skippedRestricted} restricted/inactive entries excluded; ${data.importSummary.unmappedRecipes} recipes have no verified structured ingredients and cannot be crafted.\nThis replaces the previous Ledger catalog. It will not create or alter Foundry Items, Actor progression, or inventories. Only player-visible records may be stored here.`,{title:'Import the Ledger catalog?',yes:'Import catalog'});
      if(!approved)return;await game.settings.set(ID,'libraryData',data);this.query='';this.notice=`Imported ${data.recipes.length} recipe definitions and ${data.materials.length} materials (${data.importSummary.skippedRestricted} restricted excluded; ${data.importSummary.unmappedRecipes} recipes unmapped).`;this.render();say('Profession Ledger catalog loaded. No world Items were modified.');
    }catch(err){console.error(err);say(`Ledger import failed: ${err.message}`,true);}}
}

/** Tidy5e "Professions" tab: the same crafting panel, rendered into the sheet. */
function renderSheetTab(params){
  const root=params?.tabContentsElement??params?.element;
  const target=root?.matches?.('[data-agl-sheet-tab]')?root:(root?.querySelector?.('[data-agl-sheet-tab]')??root);
  const actor=params?.app?.actor??params?.app?.document??params?.data?.actor;
  if(!target||!actor)return;
  if(!canOpenLedger()){target.innerHTML=emptyState('The GM has hidden the Profession Ledger.');return;}
  target.innerHTML=`<div class="agl-sheet ag-app"><div class="agl-sheet-head"><strong>Professions</strong><button type="button" class="ag-btn ag-btn--sm" data-action="open-ledger">Open Profession Ledger</button></div>${characterPanel(actor,catalog(),{surface:'sheet'})}</div>`;
  bindFolds(target,uiState(ID));
  if(target.dataset.aglBound)return;
  target.dataset.aglBound='1';
  target.addEventListener('click',async e=>{
    const b=e.target.closest?.('[data-action]');if(!b||b.disabled||!target.contains(b))return;
    e.preventDefault();e.stopPropagation();
    if(xpModeClick(b)||itemLinkClick(b))return;
    const sheetActor=params?.app?.actor??params?.app?.document??actor;
    try{
      if(b.dataset.action==='open-ledger'){game.modules.get(ID)?.api?.open({actorId:sheetActor.id,view:'individual'});return;}
      const input=b.dataset.action==='award-xp'?target.querySelector(`[data-xp-input="${b.dataset.id}"]`):null;
      const q=n=>target.querySelector(`[data-xp-${n}="${b.dataset.id}"]`)?.value;
      const adj=b.dataset.action==='adjust-xp';
      const out=await performAction(b.dataset.action,{id:b.dataset.id,actorId:b.dataset.actor??sheetActor.id,points:input?.value,delta:adj?q('delta'):null,set:adj?q('set'):null,reason:adj?q('reason'):''});
      if(out)say(out.message,out.ok===false);
      renderSheetTab({...params,tabContentsElement:target});
    }catch(err){console.error(`[${ID}]`,err);say(`Profession Ledger: ${err.message}`,true);}
  });
}
/* ---- 0.19.0: embed API. A partner module (Character Hub) mounts this character's Individual panel into its own element.
   Same panel and the same performAction route as the Tidy5e tab, so every action keeps its own checks. ---- */
const EMBED_MODES=new Set(['individual']);
const embeds=new Set();
/** Why this user may not see the actor's panel here, or '' when they may (GM, or the Actor's owner). */
function embedRefusal(actor){
  if(!canOpenLedger())return 'The GM has hidden the Profession Ledger.';
  if(!actor)return 'That character no longer exists.';
  if(isLevelBackup(actor))return LEVEL_BACKUP_REFUSAL;
  if(!game.user?.isGM&&actor.testUserPermission?.(game.user,'OWNER')!==true)return `Only ${actor.name}'s owner and the GM can see this.`;
  return '';
}
/** api.embed.mount(element, {actorId, mode:'individual'}) → {unmount, refresh}. */
function mountEmbed(element,{actorId,mode='individual'}={}){
  if(!element||typeof element.addEventListener!=='function')throw TypeError('mount needs a DOM element.');
  if(!EMBED_MODES.has(mode))throw Error(`Unknown embed mode "${mode}". Supported: ${[...EMBED_MODES].join(', ')}.`);
  const abort=new AbortController(),ctrl={actorId:String(actorId??''),mounted:true};
  element.classList?.add('agl-embed');
  ctrl.render=()=>{
    if(!ctrl.mounted)return;
    if(element.isConnected===false){ctrl.unmount();return;}
    const actor=game.actors?.get?.(ctrl.actorId)??null,refusal=embedRefusal(actor);
    element.innerHTML=refusal?emptyState(esc(refusal))
      :`<div class="agl-sheet agl-embed__body">${characterPanel(actor,catalog(),{surface:'sheet'})}</div>`;
    if(!refusal)bindFolds(element,uiState(ID));
  };
  ctrl.unmount=()=>{if(!ctrl.mounted)return;ctrl.mounted=false;abort.abort();embeds.delete(ctrl);element.innerHTML='';element.classList?.remove('agl-embed');};
  element.addEventListener('click',async e=>{
    const b=e.target?.closest?.('[data-action]');if(!b||b.disabled||!element.contains(b))return;
    if(b.closest?.('summary'))e.preventDefault?.();
    e.stopPropagation?.();
    if(xpModeClick(b)||itemLinkClick(b))return;
    const actor=game.actors?.get?.(ctrl.actorId)??null;
    try{
      if(embedRefusal(actor))throw Error(embedRefusal(actor));
      const input=b.dataset.action==='award-xp'?element.querySelector(`[data-xp-input="${b.dataset.id}"]`):null;
      const q=n=>element.querySelector(`[data-xp-${n}="${b.dataset.id}"]`)?.value;
      const adj=b.dataset.action==='adjust-xp';
      const out=await performAction(b.dataset.action,{id:b.dataset.id,actorId:b.dataset.actor??actor.id,points:input?.value,delta:adj?q('delta'):null,set:adj?q('set'):null,reason:adj?q('reason'):''});
      if(out)say(out.message,out.ok===false);
      ctrl.render();
    }catch(err){console.error(`[${ID}]`,err);say(`Profession Ledger: ${err.message}`,true);}
  },{signal:abort.signal});
  embeds.add(ctrl);ctrl.render();
  return {unmount:ctrl.unmount,refresh:()=>ctrl.render()};
}
/** Redraw embeds (all, or those showing one character). */
function refreshEmbeds(actorId=null){for(const e of [...embeds])if(!actorId||e.actorId===actorId)e.render();}

/** Feature-detected: does nothing unless Tidy5e Sheet exposes its tab registration API. */
function registerTidyTab(api){
  try{
    if(typeof api?.registerCharacterTab!=='function'||typeof api?.models?.HtmlTab!=='function')return false;
    api.registerCharacterTab(new api.models.HtmlTab({title:'Professions',tabId:`${ID}-professions`,iconClass:'fa-solid fa-hammer',
      html:'<div class="agl-sheet-tab" data-agl-sheet-tab></div>',enabled:()=>canOpenLedger(),onRender:params=>renderSheetTab(params)}));
    return true;
  }catch(err){console.warn(`[${ID}] Tidy5e Professions tab not registered`,err);return false;}
}
Hooks.once('tidy5e-sheet.ready',api=>registerTidyTab(api));

Hooks.once('init',()=>{
  // Existing player-facing installations stay visible on upgrade (PA-01).
  game.settings.register(ID,PLAYER_ACCESS_SETTING,{name:'Player Access — Profession Ledger',hint:'GM only: reveal or hide the player Ledger interface; does not disable Profession mechanics or erase character data.',scope:'world',config:true,type:Boolean,default:true,
    onChange:value=>syncLedgerPlayerAccess(value)});
  game.settings.register(ID,'libraryData',{name:'Profession Ledger catalog',scope:'world',config:false,type:Object,
    default:{schema:SCHEMA,source:'empty',recipes:[],materials:[]},onChange:()=>current?.render()});
  game.settings.register(ID,CORE_AWARD_SETTING,{name:'Award linked core items when crafting',scope:'world',config:false,type:Boolean,default:true});
  game.settings.register(ID,EXOTIC_SETTING,{name:'Exotic discovery chance (%)',scope:'world',config:false,type:Number,default:DEFAULT_EXOTIC_PERCENT,onChange:()=>{if(current?.rendered)current.render();}});
  game.settings.register(ID,BASELINE_SETTING,{name:'Profession crosswalk baseline file',scope:'world',config:false,type:Object,default:{},onChange:()=>{if(current?.rendered)current.render();}});
  game.settings.register(ID,'checkMapping',{name:'Profession tools and gathering checks',scope:'world',config:false,type:Object,default:{},onChange:()=>{if(current?.rendered)current.render();}});
  // 0.29.0: GM edits of what each profession calls a recipe ({[professionKey]: {singular?, plural?}}); display only, new and empty by default.
  game.settings.register(ID,RECIPE_LABEL_SETTING,{name:'Recipe names per profession',scope:'world',config:false,type:Object,default:{},onChange:()=>{if(current?.rendered)current.render();}});
  game.settings.register(ID,'checkMappingVersion',{name:'Profession tools and checks data version',scope:'world',config:false,type:Number,default:0});
  game.settings.register(ID,'partyRoster',{name:'Active party Actor IDs',scope:'world',config:false,type:Array,default:[],onChange:()=>{if(current?.rendered)current.render();}});
  // 0.25.0: GM-only (restricted). Players open the Ledger from the Actors sidebar; with no player-visible setting or menu,
  // Configure Settings shows players no Profession Ledger section at all.
  game.settings.registerMenu(ID,'open',{name:'Ashen Gate Profession Ledger',label:'Open Profession Ledger',
    hint:'Professions, materials, recipes and crafting for your character and party. Player interface visibility is GM-controlled.',icon:'fa-solid fa-book-open',type:LedgerApp,restricted:true});
});
Hooks.once('ready',()=>{
  const module=game.modules.get(ID);if(!module)return;
  module.api={playerAccess:{contract:PLAYER_ACCESS_CONTRACT,getState:()=>accessState(game,ID),setEnabled:enabled=>setPlayerAccess(game,ID,enabled)},
    open:({actorId=null,view=null}={})=>{checkPlayerLedger();current??=new LedgerApp();if(actorId)current.actorId=actorId;
      if(view){const next=LEGACY_VIEWS[view]??view;current.view=!game.user.isGM&&GM_VIEWS.has(next)?'individual':next;}
      current.demo=false;current.render({force:true});return current;},
    getProfessionProgress:(actor,profId)=>{checkPlayerLedger();if(!actor?.testUserPermission?.(game.user,'OBSERVER')&&!game.user.isGM)throw Error('Actor access denied');return progressOf(actor,profId);},
    /** 0.18.0: every profession this character has, as [{professionId,name,level,xp,xpToNext,maxLevel,tier,unspentPerkChoices}]. Owner or GM only. */
    getProfessions:actor=>listProfessions(actor),
    awardProfessionXP:(actor,profId,amount)=>awardXP(actor,profId,amount),
    adjustProfessionXP:(actor,profId,options)=>adjustXP(actor,profId,options),
    getProfessionXPHistory:(actor,profId)=>{if(!game.user.isGM)throw Error('Only the GM can read XP history');return xpHistoryOf(actor,profId);},
    getKnownRecipes:(actor)=>{checkPlayerLedger();if(!actor?.testUserPermission?.(game.user,'OBSERVER')&&!game.user.isGM)throw Error('Actor access denied');return knownRecipesOf(actor);},
    inspectProfessionPerkChoices:(actor,profId)=>{checkPlayerLedger();if(!game.user.isGM&&!actor?.testUserPermission?.(game.user,'OBSERVER'))throw Error('Actor access denied');return progressOf(actor,profId);},
    learnRecipe:(actor,item)=>{checkPlayerLedger();return learnRecipe(actor,item);},
    craft:(actor,recipeId,options)=>craft(actor,recipeId,options),
    /** 0.28.0: complete an activity recipe (kind "activity"): roll, post the card with the GM's XP award. Owner or GM. */
    completeActivity:(actor,recipeId,options)=>completeActivity(actor,recipeId,options),
    /** 0.29.0: what a profession (name or PROF-* id) calls a recipe, e.g. "Formula"; {plural, capitalize}. Display only: ids,
     * types and saved data say Recipe/REC- as before. Unknown professions get "Recipe". Feature-detect it. */
    recipeLabel:(professionNameOrId,{plural=false,capitalize=true}={})=>recipeLabelFor(professionNameOrId,{plural:Boolean(plural),capitalize:capitalize!==false}),
    /** 0.28.0: (actorId or Actor, {toolProficienciesAnyOf?, skillProficienciesAnyOf?}) → {ok, matched}. GM or Actor observer. */
    meetsProficiency:(actorId,access)=>meetsProficiency(actorId,access),
    /** 0.28.0: the professions the Ledger knows: [{name, key, id, category: 'crafting'|'gathering'|'creative'}]. */
    professions:()=>allProfessions().map(p=>({...p})),
    /** Gathering: start/resolve/cancel are GM-only; request is a player asking the GM. */
    gathering:{nodes:()=>{checkPlayerLedger();return structuredClone(gatherLocations());},
      start:({locationId=null,nodeId=null,node=null,templateId=null,tier=null,leadId,helperIds=[],allowDraft=false}={})=>{checkPlayerLedger();
        if(templateId)requireNodesGM();
        const target=templateId?templateGatherNode(templateId,tier):node?normalizeNode({dcVisible:true,...node,id:`adhoc-${newId()}`},{locationId:null}):findNode(locationId,nodeId).node;
        if(templateId&&!target)throw Error('That gathering node no longer exists');
        return startGather({node:target,leadId,helperIds,allowDraft});},
      resolve:(sessionId,result)=>resolveGather(sessionId,result),cancel:sessionId=>cancelGather(sessionId),
      request:options=>requestGather(options),
      /** GM only (0.21.0): the request queue, and Approve (starts the gather) / Decline (tells the player). */
      requests:()=>{checkPlayerLedger();return listGatherRequests();},
      approve:(requestId,options)=>approveGatherRequest(requestId,options),decline:(requestId,options)=>declineGatherRequest(requestId,options),
      /** Node templates (0.25.0, contract ag-gathering-nodes/1), GM only. Locations may point an entry at a template ({nodeId}); see docs/gathering-nodes-schema.md. */
      templates:{contract:NODE_SCHEMA,schema:NODE_SCHEMA,
        list:()=>{requireNodesGM();return readNodeStore().nodes.map(t=>({...plainTemplate(t),meta:structuredClone(t.meta),problems:[...t.problems]}));},
        get:id=>{requireNodesGM();const t=readNodeStore().nodes.find(n=>n.id===id);return t?{...plainTemplate(t),meta:structuredClone(t.meta),problems:[...t.problems]}:null;},
        check:raw=>{requireNodesGM();const r=checkTemplate(raw);return {ok:!r.errors.length,errors:r.errors,warnings:r.warnings};},
        create:raw=>saveNodeTemplate(raw,{isNew:true}),update:raw=>saveNodeTemplate(raw,{isNew:false}),
        duplicate:id=>duplicateNodeTemplate(id),remove:id=>deleteNodeTemplate(id),references:id=>structuredClone(nodeReferences(id)),
        /** A Location entry ({nodeId, …}) resolved against its template: the node the Ledger gathers. */
        resolve:entry=>{requireNodesGM();return normalizeNode(resolveEntry(entry??{},id=>nodeTemplate(id)),{locationId:null});},
        /** What a Location may publish to players for a template: no chances, no Exotics, DC only when shown. */
        playerView:(id,options)=>{requireNodesGM();const t=nodeTemplate(id);return t?templatePlayerView(t,options):null;},
        preview:data=>previewNodeFile(data),import:data=>importNodeFile(data),export:()=>exportNodeFile(),
        copyFromLocations:()=>copyLocationNodes()},
      /** Exotic candidates (contract ag-ledger-exotic/1), GM only: Locations' resource editor uses these when the Ledger is active. */
      exotic:{contract:'ag-ledger-exotic/1',defaultDcByTier:{...DEFAULT_DC_BY_TIER},
        percent:()=>{requireGM();return exoticPercent();},
        /** Imported, approved, player-visible Materials as {id,name,quality,tier,professions}; filters: query, profession (e.g. 'Herbalism'), quality, tier, maxTier.
         * includeUnavailable: also draft/GM-only ones, each with {available, reason} (the Manager fix). */
        materials:({query='',profession=null,quality='Exotic',tier=null,maxTier=null,includeUnavailable=false}={})=>{requireGM();
          const metas=materialCatalog().filter(m=>includeUnavailable||!m.unavailable);
          const prof=profession?professionKey(profession):null;
          return filterMaterials(metas,{query,profession:prof,quality,tier,maxTier,keyOf:professionKeyOfId})
            .map(m=>({id:m.id,name:m.name,quality:m.quality,tier:m.tier,professions:materialProfessionKeys(m,professionKeyOfId),
              ...(includeUnavailable?{available:!m.unavailable,reason:m.unavailable}:{})}));},
        /** Each candidate on a node ({skill, tier, exotics}) with {eligible, reason}. */
        eligibility:node=>{requireGM();return exoticRows(normalizeNode(node??{},{})??{}).map(({meta,...r})=>r);}}},
    /** Stable read contract for partner modules (Skill Trees). Never returns history or perk choices. */
    progression:{contract:PROGRESSION_CONTRACT,level:(actor,profId)=>progressionLevel(actor,profId)},
    /** GM only (0.16.0): profession assignment from skill/tool proficiencies. preview changes nothing; apply adds missing PROF-* Items. */
    assign:{preview:options=>{checkPlayerLedger();return structuredClone(assignPreview(options));},
      apply:options=>{checkPlayerLedger();return assignProfessions(options);}},
    /** GM only (0.30.0): grantStartingRecipes({preview = true, actorIds?, rowIds?}). See the README. */
    grantStartingRecipes:async options=>{checkPlayerLedger();return structuredClone(await grantStartingRecipes(options));},
    /** GM only (0.31.0): signaturePerks.preview({actorIds?}) writes nothing; grant({actorIds?, rowIds?}) adds the missing perks. See the README. */
    signaturePerks:{preview:options=>{checkPlayerLedger();return structuredClone(signaturePerksPreview(options));},
      grant:async options=>{checkPlayerLedger();return structuredClone(await grantSignaturePerks(options));}},
    /** GM only (0.20.0): baseline file import (preview, then apply) and export of the current crosswalk table. */
    crosswalk:{previewBaseline:data=>structuredClone(previewBaseline(data)),applyBaseline:(data,options)=>applyBaseline(data,options),
      exportTable:()=>exportCurrentCrosswalk(),baseline:()=>{requireCrosswalkGM();return structuredClone(baselineRecord());}},
    hooks:{xpOpportunity:XP_HOOK,progressionChanged:PROGRESSION_HOOK},
    embed:{contract:'ag-ledger-embed/1',modes:[...EMBED_MODES],mount:mountEmbed},
    version:VERSION,source:'Actor inventories, Manager tagged Items, and optional Ledger catalog'};
  game.socket?.on?.(SOCKET,(message,senderId)=>void onSocket(message,senderId));
  if(game.user?.isGM&&activeGM()?.id===game.user.id)void migrateMapping();
  // 0.28.0: note imported creative professions (registry extras) so the GM's tables list them from the start.
  if(game.user?.isGM)try{professionDefinitions();}catch(err){console.warn(`[${ID}] Could not read imported professions`,err);}
  // 0.25.0: after every module's ready (Locations sets its API there), copy Location gathering nodes into templates once.
  if(game.user?.isGM&&activeGM()?.id===game.user.id)setTimeout(()=>void autoMigrateNodes(),0);
  // 0.21.0: the request queue lives on the GM's client; after a GM reload tell players their waiting requests are gone.
  if(game.user?.isGM&&activeGM()?.id===game.user.id)sendSocket({type:'gather-requests-cleared'});
  const refresh=()=>{if(current?.rendered)current.render();refreshEmbeds();};
  for(const hook of ['updateActor','createItem','updateItem','deleteItem'])Hooks.on(hook,refresh);
  // 0.31.0: signature perks are granted on the GM client that wrote the XP (the only client that fires this hook).
  Hooks.on(PROGRESSION_HOOK,payload=>{void onProgressionChanged(payload).catch(err=>{console.error(`[${ID}] signature perks`,err);try{say(`Signature perks were not granted: ${err.message}`,true);}catch{}});});
  // Another GM client saved node templates.
  for(const hook of ['createJournalEntry','updateJournalEntry'])Hooks.on(hook,doc=>{if(game.user?.isGM&&doc?.getFlag?.(ID,'role')==='gm-data')refresh();});
  // Handle Actor Directory already rendered before ready hook ran.
  addActorDirectoryLauncher(globalThis.ui?.actors, globalThis.ui?.actors?.element);
  console.info(`[${ID}] v${VERSION} ready. Open from the Actors directory, Module Settings or game.modules.get('${ID}').api.open()`);
});

/** Active GM once per world. Version 1 (0.22.0): Fishing's saved check skill '' (the old default) becomes Survival, see
 * migrateCheckMapping. Version 2 (0.26.2): tools and check skills saved equal to today's built-in default are dropped, so
 * they follow the defaults again (see compactCheckMapping); every other saved value stays. Each step is safe to re-run. */
async function migrateMapping(){
  try{
    const version=Number(game.settings.get(ID,'checkMappingVersion'))||0;
    if(version<1){
      const next=migrateCheckMapping(game.settings.get(ID,'checkMapping'));
      if(next)await game.settings.set(ID,'checkMapping',next);
      await game.settings.set(ID,'checkMappingVersion',1);
    }
    if(version<2){
      const stored=game.settings.get(ID,'checkMapping'),next=compactCheckMapping(stored);
      if(JSON.stringify(next)!==JSON.stringify(stored??{}))await game.settings.set(ID,'checkMapping',next);
      await game.settings.set(ID,'checkMappingVersion',2);
    }
  }catch(err){console.warn(`[${ID}] tools and checks migration`,err);}
}
/** Open Ledger on the Actors directory for both GM and players; idempotent across renders. */
function addActorDirectoryLauncher(application, renderedElement){
  mountLauncher(launcherRoot(application,renderedElement),{moduleId:ID,label:'Professions',title:'Profession Ledger',icon:'fa-solid fa-book-open',
    onClick:()=>game.modules.get(ID)?.api?.open(),visible:canOpenLedger()});
}
Hooks.on('closeApplicationV2',app=>openLedgerWindows.delete(app));
Hooks.on('renderActorDirectory',(app,el)=>addActorDirectoryLauncher(app,el));
Hooks.on('renderChatMessageHTML',(message,html)=>{try{decorateChatCard(message,html);}catch(err){console.warn(`[${ID}] chat card controls`,err);}});

/** Test seam for the Node suite (mocked Foundry); not part of the public API. */
export const _test={craft,orchestrateCraft,onSocket,performAction,registerTidyTab,renderSheetTab,myCharacters,getBroker,
  startGather,resolveGather,cancelGather,setExoticRoll:fn=>{exoticRoll=fn??defaultRoll;},handleGatherRequest,gatherRequests,myGatherRequests,
  setGatherRequestCooldown:ms=>{gatherRequestCooldownMs=ms;},resetGatherRequests:()=>{gatherRequests.clear();lastGatherRequestAt.clear();myGatherRequests.clear();},receiveGatherRoll,gatherSessions,decorateChatCard,awardXpFromCard,undoAwardFromCard,adjustXP,gatherLocations,
  readNodeStore,writeNodeStore,copyLocationNodes,autoMigrateNodes,approveGatherRequest,materialState,nodeWrites:()=>nodeWrites,xpModeClick,itemLinkClick,openItemLink,recipeRow,itemRef,gatherCheckPlan,advantageToolsFor,advantageItemsFor};
