import {SCHEMA,PROFESSION_NAMES,norm,professionFromTreeName,classify,normalizeRecipe,normalizeLibrary,
  sourceVisibility,sourceAvailableToPlayer,agSourceId,quantity} from './core.mjs';
import {GATHERING_PROFESSIONS,TIERS,ACCESS_LEVELS,gatherXP,knownRecipesOf,canLearnRecipe,progressOf,emptyProgress,
  nextProgress,adjustProgress,xpHistoryOf,XP_CAP,professionLevelOf,isMaterialAwardCandidate,xpForLevel} from './progression.mjs';
import {PLAYER_ACCESS_CONTRACT,PLAYER_ACCESS_SETTING,playerAccessAllowed,assertPlayerAccess,accessState,setPlayerAccess} from './player-access.mjs';
import {lookupWorldDefinition,readWorldDefinition} from './definition-lookup.mjs';
import {planCraft,craftBlockers,executeCraft,craftResultData,materialStock,tierLabel,ConsentBroker} from './crafting.mjs';
import {launcherRoot,mountLauncher} from './ag-launchers.mjs';
import {SKILL_IDS,SKILL_LABELS,MODE_LABELS,craftCheckPlan,professionKey,effectiveMapping,toolKeys,toolLabel,skillLabel,toolRef,requiredToolRef,toolRefLabel,heldTool,
  checkOption,rollModeFor,rollCheck,formatBonus,CROSSWALK_LISTS} from './checks.mjs';
import {PROFESSION_KEYS,professionTitle,catalogCrosswalk,unmappedProfessions,assignmentPlan,rowId,parseBaselineFile,baselineChanges,exportCrosswalk} from './assign.mjs';
import {DEFAULT_DC_BY_TIER,tierName,defaultDC,normalizeNode,gatherOutcome,gatherReward,exhaustsNode,helperEligibility,checkGatherRequest,canRunGathering,nodeBlocker,startBlocker,playerBlocker,GATHER_FIX,
  stackMaterial} from './gathering.mjs';
import {EXOTIC_SETTING,DEFAULT_EXOTIC_PERCENT,EXOTIC_MODES,DESIGNATED_CONDITIONS,GATHERING_KEYS,clampPercent,normalizeExotics,materialMeta,filterMaterials,
  exoticEligibility,resolveGatherRewards,defaultRoll,nodeProfessionKey,professionKeyFromId,materialProfessionKeys} from './exotic.mjs';
const ID='ashen-gate-profession-ledger';
const VERSION='0.20.0';
const MAX_PROFESSION_LEVEL=16;
/** Called on the GM client whenever a gather or craft chat card offers an XP award. Nothing listens yet:
 * this is the seam for later automation. Payload: {kind, actorId, professionId, professionName, suggested, messageId, ...}. */
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
const say=(message,error=false)=>error?ui.notifications.error(message):ui.notifications.info(message);
const plural=(n,one,many=`${one}s`)=>`${n} ${n===1?one:many}`;
let current=null;
const openLedgerWindows=new Set();
const learnLocks=new Set();
const xpLocks=new Set();
const craftLocks=new Set();
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
const materialChoices=()=> (game.items?.contents??[]).filter(item=>isMaterialAwardCandidate(item,agSourceId) && classify(item)==='Material' && lookupWorldDefinition(game,agSourceId(item),{entityType:'Material',publicForAll:true,approvedOnly:true}).document===item).sort((a,b)=>a.name.localeCompare(b.name));
const linkedProfession=(actor,id)=>Array.from(actor?.items??[]).some(item=>classify(item)==='Profession'&&agSourceId(item)===id);
/** A character's own Items are already on their sheet, so only explicitly GM-only or reveal-gated records are withheld. */
const playerSafe=item=>!['gm','reveal_gated'].includes(sourceVisibility(item));
const professionItems=(actor)=>Array.from(actor?.items??[]).filter(item=>classify(item)==='Profession'&&/^PROF-[A-Z0-9-]+$/.test(agSourceId(item)??'')&&(game.user.isGM||playerSafe(item)));
const heldRecipeItems=(actor)=>Array.from(actor?.items??[]).filter(item=>classify(item)==='Recipe'&&/^REC-[A-Z0-9-]+$/.test(agSourceId(item)??'')&&quantity(item)>0);
/** Players only ever see released recipe items; drafts are GM information, not player noise. */
const recipeItems=(actor)=>heldRecipeItems(actor).filter(item=>game.user.isGM||sourceAvailableToPlayer(item));
const itemStatus=item=>item?.flags?.['ashen-gate-manager']?.source?.status??'approved';
const GM_VIEWS=new Set(['gm','assign']);
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
  if(!actor||!linkedProfession(actor,profId))throw Error('Actor must own a matching Manager-tagged PROF-* Profession Item');
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
  if(plan.lockedRecipes.length)parts.push(`Known recipes now above this level (kept, but crafting is blocked until the level returns): ${plan.lockedRecipes.join(', ')}.`);
  return parts.join(' ');
}
/** GM-only data-layer XP change (signed amount or exact value). Never deletes perks; records history. */
async function adjustXP(actor,profId,{delta=null,set=null,reason='',messageId=null,kind=null}={}){
  if(!game.user.isGM)throw Error('Only the GM can adjust Profession XP');
  if(!actor||!linkedProfession(actor,profId))throw Error('Actor must own a matching Manager-tagged PROF-* Profession Item');
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
function allCharacters(){return (game.actors?.contents??[]).filter(a=>a.type==='character').sort((a,b)=>a.name.localeCompare(b.name));}
/** Party = roster characters this user can see in the Actors sidebar (at least LIMITED).
 * Only Ledger data is shown for them: name, professions, materials, recipes and held recipe items. */
function partyActorsFor(user){const ids=new Set(rosterIds());return allCharacters().filter(a=>ids.has(a.id)&&(user?.isGM||a.testUserPermission?.(user,'LIMITED')));}
const partyActors=()=>partyActorsFor(game.user);
/** Characters whose Individual (crafting) view this user may open: the GM any party member, a player their own. */
function myCharacters(){
  if(game.user.isGM){const party=partyActors();return party.length?party:allCharacters().filter(a=>a.hasPlayerOwner);}
  const mine=partyActors().filter(a=>owned(a));
  const assigned=game.user.character;
  if(assigned?.type==='character'&&owned(assigned)&&!mine.some(a=>a.id===assigned.id))mine.push(assigned);
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
function visibilityBadge(doc){const v=visibilityInfo(doc);return v?`<span class="agl-access" title="${esc(v.details)}">${badge(v.label,v.kind)}</span>`:'';}
/** GM-only explanation of why players can't see a record. */
function draftBadge(status,visibility){
  if(!game.user.isGM)return '';
  const out=[];
  if(HIDDEN_STATUSES.includes(status)){const s=String(status);
    out.push(`<span class="agl-access" title="Players can't see or learn a ${esc(s)} recipe, even if a character holds or knows it. Approve it in General Manager to release it.">${badge(`${s[0].toUpperCase()}${s.slice(1)} — hidden from players`,'warn')}</span>`);}
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
  const blockers=craftBlockers({recipe,crafter:actor,knownIds:knownRecipesOf(actor),result});
  const plan=planCraft(recipe,actor,partyActors(),{materialDefs:lib.materials,playerView:!game.user.isGM,nameOf:ing=>ingredientName(ing,lib)});
  return {recipe,result,blockers,plan};
}
const extraCost=recipe=>{const gp=Number(recipe?.sourceDefinition?.additional_gp);return Number.isFinite(gp)&&gp>0?gp:null;};

/** GM Setup: profession → tool, and gathering profession → check skill (defaults filled in). */
const checkMapping=()=>effectiveMapping(game.settings.get(ID,'checkMapping'),{baseline:baselineLayer()});
/** 0.20.0: the GM's imported baseline file layer ({key:{lists}}), or null. Stored in the world setting crosswalkBaseline. */
const BASELINE_SETTING='crosswalkBaseline';
const baselineRecord=()=>{try{const v=game.settings.get(ID,BASELINE_SETTING);return v&&typeof v==='object'&&v.professions&&typeof v.professions==='object'?v:null;}catch{return null;}};
const baselineLayer=()=>baselineRecord()?.professions??null;
/** The saved shape of the mapping (what GM Setup edits and saves): check tool/skill plus the GM's own crosswalk lists. */
const mappingDraft=map=>({tools:{...map.tools},skills:{...map.skills},...Object.fromEntries(CROSSWALK_LISTS.map(l=>[l,structuredClone(map.gm[l])]))});
const professionTool=name=>{const key=checkMapping().tools[professionKey(name)];return key?{key,uuid:null,name:null}:null;};
/** GM-configured advantage tools for a profession's checks (none unless the GM set them in GM Setup). */
const advantageToolsFor=name=>{const k=professionKey(name);return k?[...(checkMapping().advantageTools[k]??[])]:[];};

/** GM: imported, active PROF-* Profession Items with their definitions (the catalog layer and the Items to assign). */
function professionDefinitions(){
  if(!game.user?.isGM)return [];
  const out=[];
  for(const doc of game.items?.contents??[]){
    const id=agSourceId(doc);if(!/^PROF-[A-Z0-9-]+$/.test(id??'')||classify(doc)!=='Profession')continue;
    const hit=lookupWorldDefinition(game,id,{entityType:'Profession'});
    if(hit.status!=='ok'||hit.document!==doc)continue;
    const def=hit.source?.definition??{},name=def.name??professionDisplayName(doc);
    const named=professionKey(name),key=PROFESSION_KEYS.includes(named)?named:professionKeyFromId(id);
    out.push({sourceId:id,name,access:def.access??null,key:PROFESSION_KEYS.includes(key)?key:null,uuid:doc.uuid,itemName:doc.name,doc});
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
  if(Array.isArray(actorIds)&&actorIds.length)return actorIds.map(id=>game.actors?.get?.(id)).filter(a=>a?.type==='character');
  const party=partyActors();if(party.length)return party;
  try{const members=game.settings.get('dnd5e','primaryParty')?.actor?.system?.members??[];
    return [...members].map(m=>m?.actor??m).filter(a=>a?.type==='character');}catch{return [];}
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
const assignLocks=new Set();
/**
 * GM: add the missing Profession Items. `rowIds` limits it to those proposals (from assignPreview); otherwise every
 * proposal. Re-checks each character just before adding, so re-running adds nothing. Never touches XP, progression,
 * Skill Tree perks or existing Items.
 */
async function assignProfessions({actorIds=null,rowIds=null}={}){
  requireAssignGM();
  const plan=assignPreview({actorIds});
  const picked=plan.rows.filter(r=>r.status==='propose'&&(!Array.isArray(rowIds)||rowIds.includes(r.id)));
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
/**
 * What a recipe needs at the bench. Its own tool wins; a workstation-only recipe needs no tool; otherwise
 * the profession's tool. The tool check uses the recipe's tool, else the profession's tool.
 */
function craftRequirement(recipe,actor=null){
  // The recipe's own tools: its single tool field plus every required_tools entry (all are needed).
  const own=[toolRef(recipe?.tool),...(recipe?.tools??[]).map(requiredToolRef)].filter(Boolean)
    .filter((ref,i,list)=>list.findIndex(r=>toolRefLabel(r)===toolRefLabel(ref))===i);
  const profLabel=professionLabel(recipe),profTool=professionTool(profLabel);
  const tools=own.length?own:recipe?.workstation||!profTool?[]:[profTool];
  const checks=own.length?own:profTool?[profTool]:[];
  const missing=actor?tools.filter(ref=>!heldTool(actor,ref)):[];
  // A profession whose main check is a skill (Enchanting: Arcana) offers that skill; a recipe tool is offered beside it.
  const skill=checkMapping().skills[professionKey(profLabel)]||null;
  const tool=tools[0]??null;
  return {tool,tools,toolLabel:tools.map(toolRefLabel).join(' + '),fromProfession:Boolean(tool&&!own.length),workstation:recipe?.workstation??null,
    check:checks[0]??null,skill,checkPlan:actor?craftCheckPlan(actor,{tools:checks,skill}):null,held:Boolean(actor&&tools.length&&!missing.length),
    lacks:missing.length>0,missing:missing.map(toolRefLabel)};
}
/** "doesn't carry X" for one tool, "doesn't carry X, Y" when several of the required tools are missing. */
const lacksText=(req,actor)=>req.tools.length>1?`${actor.name} doesn’t carry ${req.missing.join(', ')}`:`${actor.name} doesn’t carry this`;
function requirementHTML(req,actor){
  const parts=[];
  if(req.tool)parts.push(`${esc(req.toolLabel)}${actor?(req.lacks?` ${badge(lacksText(req,actor),'warn')}`:` ${badge(req.tools.length>1?'All carried':'Carried','ok')}`):''}`);
  if(req.workstation)parts.push(`Workstation: ${esc(req.workstation)}`);
  return parts.length?`<div><span class="agl-label">Uses</span> ${parts.join(' · ')}</div>`:'';
}

/** Baseline recipe row used by every list (Individual, Party, Catalog, sheet tab). */
function recipeRow(recipe,lib,{actor=null,craft=null,knownBy=[],foundBy=[],showStatus=true,learnItem=null}={}){
  const gm=game.user.isGM;
  const result=craft?.result??resultDocument(recipe);
  const ingredients=recipe.hasStructuredIngredients?recipe.ingredients.map(ing=>{
    const name=ingredientName(ing,lib);
    const req=craft?.plan.requirements.find(r=>r.materialId?r.materialId===ing.materialId:r.name===name);
    const state=!req?'':req.own>=req.required?'ok':req.party>=req.required?'partial':'warn';
    const have=req?` <small>(${req.own} on hand${req.party>req.own?`, ${req.party} in party`:''})</small>`:'';
    return `<li class="agl-ing ${state}">${ing.quantity} × ${esc(name)}${have}</li>`;
  }).join(''):'<li class="agl-ing">No ingredient list yet</li>';
  const status=[];
  if(showStatus){
    if(gm)status.push(draftBadge(recipe.status,recipe.sourceVisibility));
    if(knownBy.length)status.push(badge(`Known by ${nameList(knownBy)}`,'ok'));
    if(foundBy.length)status.push(badge(`Recipe item: ${nameList(foundBy)}`,'recipe'));
    if(gm&&!knownBy.length&&!foundBy.length)status.push(badge('Not found by the party yet','muted'));
  }
  let actions='';
  if(craft&&actor){
    const {blockers,plan}=craft;
    const missing=plan.missing.map(m=>`${m.missing} × ${m.name}`).join(', ');
    if(blockers.length)actions=`<span class="agl-reason">${esc(blockers[0])}</span>`;
    else if(!owned(actor))actions='';
    else if(plan.ownReady)actions=`<button type="button" class="ag-btn ag-btn--primary" data-action="craft" data-id="${esc(recipe.id)}" data-actor="${esc(actor.id)}"><i class="fa-solid fa-hammer"></i> Craft</button>`;
    else if(plan.ready)actions=`<button type="button" class="ag-btn" data-action="craft" data-id="${esc(recipe.id)}" data-actor="${esc(actor.id)}"><i class="fa-solid fa-hand-holding"></i> Craft — ask the party</button><span class="agl-reason">Uses ${esc([...new Set(plan.foreign.map(a=>a.actorName))].join(', '))}’s materials</span>`;
    else actions=`<button type="button" class="ag-btn" disabled><i class="fa-solid fa-hammer"></i> Craft</button><span class="agl-reason">Missing ${esc(missing)}</span>`;
  }
  if(learnItem&&actor)actions=learnControl(actor,learnItem);
  const gp=extraCost(recipe);
  const meta=[tierLabel(recipe.tier),recipe.effort?`${String(recipe.effort)[0].toUpperCase()}${String(recipe.effort).slice(1)} effort`:''].filter(Boolean);
  const search=`${recipe.name} ${professionLabel(recipe)} ${meta.join(' ')} ${result?.name??''}`.toLowerCase();
  return `<article class="ag-card agl-recipe-row" data-recipe-search="${esc(search)}">
    <div class="agl-recipe-head">
      <div class="agl-recipe-title">${learnItem?'<i class="fa-solid fa-scroll agl-recipe-mark" aria-hidden="true"></i>':''}<strong>${esc(recipe.name)}</strong>
        <span class="agl-recipe-meta">${meta.map(m=>esc(m)).join(' · ')}</span></div>
      <div class="agl-recipe-actions">${actions}</div>
    </div>
    <div class="agl-recipe-body">
      <div><span class="agl-label">Needs</span><ul class="agl-ings">${ingredients}</ul></div>
      <div><span class="agl-label">Makes</span> ${result?esc(result.name):`<span class="agl-reason">${gm&&recipe.resultItemId?`Result item ${esc(recipe.resultItemId)} is not imported`:'Not available yet'}</span>`}${gp?` <small class="agl-sub">· also costs ${gp} gp (not deducted automatically)</small>`:''}</div>
      ${requirementHTML(craftRequirement(recipe,craft?actor:null),craft?actor:null)}
    </div>
    ${recipe.description?`<p class="agl-recipe-summary">${esc(recipe.description)}</p>`:''}
    ${status.filter(Boolean).length?`<div class="agl-recipe-status">${status.join(' ')}</div>`:''}
    ${gm?`<small class="agl-id">${esc(recipe.id)}</small>`:''}
  </article>`;
}
function learnControl(actor,item){
  const id=agSourceId(item),state=canLearnRecipe(actor,item,id);
  if(game.user.isGM&&actor.hasPlayerOwner)return `<span class="agl-reason">${esc(actor.name)}’s player learns this</span>`;
  if(!owned(actor))return '';
  if(knownRecipesOf(actor).includes(id))return badge('Already known','ok');
  if(!state.ok)return `<span class="agl-reason">${esc(state.reason)}</span>`;
  return `<button type="button" class="ag-btn ag-btn--primary" data-action="learn-recipe" data-id="${esc(`${actor.id}:${item.id}`)}" data-actor="${esc(actor.id)}"><i class="fa-solid fa-book"></i> Learn</button>`;
}
/** Folders grouped by profession; native <details> so they work without the app (sheet tab). */
function folders(rows,closed=new Set()){
  if(!rows.length)return '';
  const groups=new Map();
  for(const row of rows){const key=norm(row.group)||'unassigned';if(!groups.has(key))groups.set(key,{key,name:row.group||'Unassigned profession',rows:[]});groups.get(key).rows.push(row);}
  return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(g=>`<details class="agl-folder" data-folder="${esc(g.key)}" ${closed.has(g.key)?'':'open'}>
    <summary><i class="fa-solid fa-folder-open" aria-hidden="true"></i> <strong>${esc(g.name)}</strong> <span class="agl-count">${g.rows.length}</span></summary>
    <div class="agl-folder-body">${g.rows.map(r=>r.html).join('')}</div></details>`).join('');
}
const HISTORY_LABELS={award:'Awarded',adjust:'Adjusted',set:'Set',undo:'Award undone'};
/** GM only: adjust / set XP, plus the recorded history. Players never receive this markup. */
function xpAdjustPanel(actor,p){
  const rows=xpHistoryOf(actor,p.sourceId).slice(-8).reverse().map(h=>`<li>${esc(new Date(h.at??0).toLocaleString())} · ${esc(h.byName??'GM')} · ${esc(HISTORY_LABELS[h.kind]??h.kind)} ${h.delta>0?'+':h.delta<0?'−':''}${Math.abs(Number(h.delta)||0)} (${Number(h.from)} → ${Number(h.to)})${h.reason?` · ${esc(h.reason)}`:''}${h.messageId?' · from chat card':''}</li>`).join('');
  const attrs=`data-id="${esc(p.sourceId)}" data-actor="${esc(actor.id)}"`;
  return `<details class="agl-xp-adjust"><summary>Adjust XP</summary>
    <div class="agl-xp-award"><label class="ag-field">Change (+/−) <input type="number" step="1" data-xp-delta="${esc(p.sourceId)}" placeholder="−5"></label>
    <label class="ag-field">or Set to <input type="number" min="0" max="${XP_CAP}" step="1" data-xp-set="${esc(p.sourceId)}" placeholder="${p.xp}"></label>
    <label class="ag-field">Why <input type="text" maxlength="200" data-xp-reason="${esc(p.sourceId)}" placeholder="Accidental award"></label>
    <button type="button" class="ag-btn" data-action="adjust-xp" ${attrs}>Apply</button></div>
    ${rows?`<p class="agl-sub">XP history (GM only):</p><ul class="agl-sub">${rows}</ul>`:''}</details>`;
}
function professionCard(actor,p,{lastAward=null}={}){
  const gm=game.user.isGM;
  const flash=lastAward&&lastAward.actorId===actor.id&&lastAward.profId===p.sourceId;
  return `<div class="ag-card agl-prof ${flash?'agl-flash':''}">
    <div class="agl-prof-head"><strong>${esc(p.name)}</strong>${badge(`Level ${p.level}`,'ok')}${gm&&p.draft?badge('Draft','warn'):''}${flash?badge(`+${lastAward.points} XP`,'recipe'):''}</div>
    <div class="agl-xpbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.percent}"><span style="width:${p.percent}%"></span></div>
    <div class="agl-sub">${esc(p.tier)} · ${p.xp} XP${p.toNext!==null?` · ${p.toNext} XP to level ${p.level+1}`:' · maximum level'}${p.tracked?'':' · no XP awarded yet'}</div>
    ${gm?xpAdjustPanel(actor,p):''}
    ${gm?`<div class="agl-xp-award"><label class="ag-field">Award XP <input type="number" data-xp-input="${esc(p.sourceId)}" min="1" max="1000" step="1" value="1"></label><button type="button" class="ag-btn" data-action="award-xp" data-id="${esc(p.sourceId)}" data-actor="${esc(actor.id)}">Award</button></div>`:''}
  </div>`;
}
/** The crafting panel for one character: used by the Individual tab and the Tidy5e sheet tab. */
function characterPanel(actor,lib,{closed=new Set(),lastAward=null,surface='app'}={}){
  const profs=professionsOf(actor),mats=materialsOf(actor,lib);
  const known=knownRecipesOf(actor);
  const knownRows=known.map(id=>partyRecipeDefinition(id,lib)).filter(Boolean).map(recipe=>({group:professionLabel(recipe),
    html:recipeRow(recipe,lib,{actor,craft:craftContext(actor,recipe,lib),showStatus:game.user.isGM})}));
  const hiddenKnown=known.length-knownRows.length;
  const toLearn=recipeItems(actor).map(item=>{
    const id=agSourceId(item),def=partyRecipeDefinition(id,lib);
    const recipe=def??{id,name:recipeTitle(item.name),ingredients:[],hasStructuredIngredients:false,sourceVisibility:sourceVisibility(item)};
    return recipeRow({...recipe,status:itemStatus(item)},lib,{actor,learnItem:item,showStatus:game.user.isGM});
  });
  return `<div class="agl-character ${surface==='sheet'?'agl-on-sheet':''}">
    <section class="agl-col-side">
      <div class="agl-section"><h3>Professions</h3>
        ${profs.map(p=>professionCard(actor,p,{lastAward})).join('')||`<div class="ag-empty">${esc(actor.name)} has no profession yet. ${game.user.isGM?'Drag a profession feature (imported by General Manager) onto the character sheet.':'Ask your GM to add one.'}</div>`}
        ${profs.length?`<p class="agl-sub agl-where"><i class="fa-solid fa-circle-info"></i> XP is stored on ${esc(actor.name)} by the Profession Ledger, and also shown in each profession feature’s description on the character sheet.</p>`:''}
      </div>
      <div class="agl-section"><h3>Materials</h3>
        ${mats.map(i=>`<div class="agl-line"><span>${esc(i.name)}</span><b>× ${i.qty}</b></div>`).join('')||'<div class="ag-empty">No crafting materials.</div>'}
      </div>
    </section>
    <section class="agl-col-main">
      ${toLearn.length?`<div class="agl-section"><h3>Recipes to learn <span class="agl-count">${toLearn.length}</span></h3>
        <p class="agl-sub">Recipe items in ${esc(actor.name)}’s inventory. Learning uses up one recipe item.</p>${toLearn.join('')}</div>`:''}
      <div class="agl-section"><h3>Known recipes <span class="agl-count">${knownRows.length}</span></h3>
        ${folders(knownRows,closed)||`<div class="ag-empty">${esc(actor.name)} hasn’t learned a recipe yet.${toLearn.length?' Learn one from a recipe item above.':''}</div>`}
        ${hiddenKnown>0&&!game.user.isGM?`<p class="agl-sub">${plural(hiddenKnown,'known recipe is','known recipes are')} not available right now.</p>`:''}
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
      case 'gather-request-result': {if(message.toUserId!==game.user.id)return;const wait=pendingGatherRequests.get(message.requestId);if(wait){pendingGatherRequests.delete(message.requestId);wait(message);}return;}
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
      const dialog=new DialogV2({id:`agl-consent-${message.consentId}`,classes:['agl-consent'],window:{title:`Allow ${message.actorName}’s materials?`},content,modal:false,
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
  if(!crafter||!userOwns(requester,crafter))return reply(false,'You need to own the crafting character');
  const lib=catalog(),recipe=lib.recipes.find(r=>r.id===request.recipeId);
  if(!recipe||(!requester.isGM&&hiddenFromPlayers(recipe)))return reply(false,'This recipe is not available');
  const result=resultDocument(recipe,{forPlayer:!requester.isGM});
  const blockers=craftBlockers({recipe,crafter,knownIds:knownRecipesOf(crafter),result});
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
function xpFlag(kind,actor,{professionId=null,professionName='',suggested=null}={}){
  const profId=professionId&&linkedProfession(actor,professionId)?professionId:null;
  return {kind,actorId:actor.id,actorName:actor.name,professionId:profId,professionName:String(professionName||''),suggested:Number.isSafeInteger(suggested)&&suggested>0?suggested:null,awarded:null};
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
    ${checkLine(check)}<p>Used:</p><ul>${used}</ul>${extraCost(recipe)?`<p class="agl-chat-note">The recipe also lists ${extraCost(recipe)} gp of additional cost (not deducted automatically).</p>`:''}
    <div class="agl-xp-slot" data-agl-xp></div></div>`},xpFlag('craft',crafter,{professionId:profId,professionName:prof}),{recipeId:recipe.id,check});}
  catch(err){console.warn(`[${ID}] Craft succeeded; chat card failed`,err);}
}
/** Player/GM entry point: checks, confirms, then crafts locally or asks the party through the GM. */
async function craft(actor,recipeId,{confirm=true}={}){
  checkPlayerLedger();
  if(!actor||!owned(actor))throw Error('You need to own that character to craft');
  if(!knownRecipesOf(actor).includes(recipeId))throw Error(`${actor.name} has not learned this recipe`);
  const lib=catalog(),recipe=partyRecipeDefinition(recipeId,lib);
  if(!recipe)throw Error('This recipe is not available to you');
  const ctx=craftContext(actor,recipe,lib);
  if(ctx.blockers.length)throw Error(ctx.blockers[0]);
  if(!ctx.plan.ready)throw Error(`Missing ${ctx.plan.missing.map(m=>`${m.missing} × ${m.name}`).join(', ')}`);
  const list=ctx.plan.allocations.map(a=>`<li>${a.quantity} × ${esc(a.name)}${a.own?'':` — from <strong>${esc(a.actorName)}</strong>`}</li>`).join('');
  const foreign=[...new Set(ctx.plan.foreign.map(a=>a.actorName))];
  const req=craftRequirement(recipe,actor);
  const cplan=req.checkPlan,choiceOf=o=>`${o.kind}:${o.key??o.ref?.name??o.ref?.uuid}`;
  let picked=cplan?.selected??null;
  const advantageTools=advantageToolsFor(professionLabel(recipe));
  const presetOf=o=>o?.key?rollModeFor(actor,{kind:o.kind,key:o.key},{advantageTools}):{mode:0,sources:[]};
  let option=picked?checkOption(actor,picked):null;
  const preset=presetOf(picked);
  let mode=preset.mode;
  if(confirm){
    const needs=[req.tool?`<li>${req.tools.length>1?'Tools (all needed)':'Tool'}: <strong>${esc(req.toolLabel)}</strong>${req.lacks?` — <strong>${esc(req.tools.length>1?`${lacksText(req,actor)}.`:`${actor.name} doesn’t carry this tool.`)}</strong>`:' (carried)'}</li>`:'',
      req.workstation?`<li>Workstation: <strong>${esc(req.workstation)}</strong> (confirm with your GM)</li>`:'',
      extraCost(recipe)?`<li>Also costs ${extraCost(recipe)} gp — not deducted automatically.</li>`:''].join('');
    const answer=await DialogV2.confirm({window:{title:`Craft ${recipe.name}?`},modal:true,rejectClose:false,
      content:`<p>${esc(actor.name)} crafts <strong>${esc(ctx.result.name)}</strong>, using:</p><ul>${list}</ul>${needs?`<ul>${needs}</ul>`:''}
        ${option?`<div class="agl-check-pick">${cplan.options.length>1?`<label class="ag-field">Check (bonus)<select name="check">${cplan.options.map(o=>{const c=checkOption(actor,o);return `<option value="${esc(choiceOf(o))}" ${o===picked?'selected':''}>${esc(c.label)}${o.kind==='tool'?' (tool)':''} ${formatBonus(c.bonus)}</option>`;}).join('')}</select></label>`
          :`<span><strong>${esc(option.label)} check</strong> ${formatBonus(option.bonus)}${option.proficient?'':' (not proficient)'}</span>`}
          <label class="ag-field ag-field--inline">Roll ${modeSelect(mode)}</label><p class="agl-sub">${esc(modeHint(preset))} The result goes on the craft card; it doesn’t decide success yet.</p></div>`:''}
        ${foreign.length?`<p>${esc(foreign.join(', '))}’s owner${foreign.length===1?'':'s'} will be asked on their screen. Any decline cancels the craft and nothing is used.</p>`:''}`,
      yes:{callback:(event,button)=>({mode:button?.form?.elements?.mode?.value})}});
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

/* ---- Gathering ---------------------------------------------------------------------------------
 * The GM client runs every gathering check. Nodes come from the Locations module (feature-detected)
 * or are ad-hoc. One lead, one check per node; eligible helpers give advantage, not another attempt. */
const locationsApi=()=>{const m=game.modules?.get?.(LOCATIONS_ID);return m?.active&&m.api?m.api:null;};
const gatherSessions=new Map();       // GM client: sessionId → session awaiting its roll
const gatherRequests=new Map();       // GM client: requestId → player request awaiting approval
const pendingGatherRequests=new Map();// player client: requestId → resolve(result)
const incomingRolls=new Map();        // roller client: sessionId → roll prompt
const gatherDialogs=new Map();        // any client: key → open DialogV2
const exhaustedHere=new Set();        // node keys spent in this GM session, even if Locations could not record it
let lastGather=null;
const worldMaterial=id=>id?materialChoices().find(i=>agSourceId(i)===id)??null:null;
/** Machine-readable metadata of an awardable world material (Manager's definition), or null. */
const worldMaterialMeta=id=>{const item=worldMaterial(id);return item?materialMeta(item.flags?.['ashen-gate-manager']?.source?.definition,{name:item.name}):null;};
/** GM: why a MAT-* cannot be awarded ('' when it can), named after what the GM fixes in General Manager. */
function materialUnavailable(id){
  if(worldMaterial(id))return '';
  const docs=(game.items?.contents??[]).filter(i=>agSourceId(i)===id);
  const src=docs[0]?.flags?.['ashen-gate-manager']?.source;
  if(!docs.length||!src)return 'Not in this world: import it with General Manager';
  if(docs.length>1)return 'Imported more than once: remove the duplicate in General Manager';
  if(src.status!=='approved')return `${src.status?src.status[0].toUpperCase()+src.status.slice(1):'Not approved'}: approve it in General Manager first`;
  if(src.visibility!=='player')return 'GM-only: make it player-visible in General Manager first';
  return 'Not visible to every player: check its permissions';
}
/** GM: every imported Material with readable metadata, awardable or not ({...meta, unavailable: reason|''}), one per id. */
function materialCatalog(){
  const out=new Map();
  for(const item of game.items?.contents??[]){
    const id=agSourceId(item);if(!id?.startsWith('MAT-')||out.has(id))continue;
    const meta=materialMeta(item.flags?.['ashen-gate-manager']?.source?.definition,{name:item.name});
    if(meta)out.set(id,{...meta,unavailable:materialUnavailable(id)});
  }
  return [...out.values()];
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
const materialName=id=>worldMaterial(id)?.name??(game.user.isGM?id:humanizeId(id));
const refreshLedger=()=>{if(current?.rendered)current.render();};
const nodeBusy=key=>[...gatherSessions.values()].some(s=>s.node.key===key)||[...gatherRequests.values()].some(r=>r.node.key===key);
const closeGatherDialogs=prefix=>{for(const [key,dialog] of gatherDialogs)if(key.startsWith(prefix)){gatherDialogs.delete(key);dialog?.close?.();}};

/** Gathering nodes the current user may see: GM every location, a player revealed ones (Locations sanitizes them). */
function gatherLocations(){
  const api=locationsApi();
  if(typeof api?.listLocations!=='function'||typeof api?.resourcesAt!=='function')return {ok:false,reason:GATHER_FIX.noLocations,locations:[]};
  try{
    const gm=game.user.isGM;
    const locations=(api.listLocations()??[]).map(loc=>{
      const revealed=gm?loc?.revealed===true:true;
      const nodes=(api.resourcesAt(loc.id)??[]).map((entry,index)=>normalizeNode(entry,{locationId:loc.id,locationName:loc.name??loc.id,locationRevealed:revealed,index}))
        .filter(n=>n&&(gm||n.visible)).map(n=>gm?n:{...n,exotics:[]}).map(n=>exhaustedHere.has(n.key)?{...n,exhausted:true,gatherable:false,why:'Already gathered (exhausted)'}:n)
        .map(n=>({...n,blocked:nodeBlocker(n,{materialFound:!gm||Boolean(worldMaterial(n.materialId)),forPlayer:!gm})}));
      return {id:loc.id,name:String(loc.name??loc.id),revealed,nodes};
    }).filter(l=>l.nodes.length).sort((a,b)=>a.name.localeCompare(b.name));
    return {ok:true,locations};
  }catch(err){return {ok:false,reason:err.message,locations:[]};}
}
function findNode(locationId,nodeId){
  const loc=gatherLocations().locations.find(l=>l.id===locationId);
  return {location:loc??null,node:nodeId?loc?.nodes.find(n=>n.id===nodeId)??null:null};
}
/** GM only: each configured Exotic candidate with its name and eligibility at this node. */
const exoticRows=node=>normalizeExotics(node?.exotics).map(e=>{const meta=worldMaterialMeta(e.materialId),check=exoticEligibility(e,node,meta,{keyOf:professionKeyOfId});
  const name=meta?.name??materialCatalog().find(m=>m.id===e.materialId)?.name??materialName(e.materialId);
  return {...e,name,meta,eligible:check.eligible,reason:skipReason(e.materialId,check.reason)};});
const exoticRule=e=>e.mode==='designated'?`designated: ${e.chance==null?'no chance set':`${e.chance}%`} · ${DESIGNATED_CONDITIONS[e.condition]??''}`:'random discovery';
/** GM-only one-line summary of a node's Exotic candidates. */
function exoticSummary(node){
  const rows=exoticRows(node);if(!rows.length)return '';
  const designated=rows.some(r=>r.eligible&&r.mode==='designated');
  return `Exotic candidates (GM only): ${rows.map(r=>`${r.name} — ${exoticRule(r)}${r.eligible?'':` (not eligible: ${r.reason})`}`).join('; ')}.${designated?' Designated source: its own rules replace the discovery roll.':` Discovery chance ${exoticPercent()}% on a success.`}`;
}
const nodeTitle=n=>n.label||materialName(n.materialId)||'Gathering spot';
/** What everyone may read about a node: no unrevealed location or hidden entry names. */
const publicNodeTitle=n=>!n.visible||!n.locationRevealed?'a gathering spot':`${nodeTitle(n)}${n.locationName?` at ${n.locationName}`:''}`;
/** `forPlayers` hides a DC the GM has not shown in Locations. */
const nodeSummary=(n,{forPlayers=false}={})=>[n.skill,n.tier?`Tier ${n.tier} (${tierName(n.tier)})`:'',Number.isInteger(n.dc)&&(!forPlayers||n.dcVisible)?`DC ${n.dc}`:''].filter(Boolean).join(' · ');

/** Which check the lead can roll: the profession's tool and/or skill, then any other skill. */
function gatherCheckPlan(lead,node){
  const raw=node.skill;
  const skillKey=SKILL_IDS.includes(raw)?raw:SKILL_IDS.find(k=>norm(SKILL_LABELS[k])===norm(raw))??null;
  const toolDirect=!skillKey&&toolKeys().includes(raw)?raw:null;
  const profession=skillKey||toolDirect?'':raw;
  const pk=professionKey(profession),map=checkMapping();
  const toolKey=toolDirect??(pk?map.tools[pk]||null:null);
  const skill=skillKey??(pk?map.skills[pk]||null:null);
  const options=[...(toolKey?[{kind:'tool',key:toolKey}]:[]),...(skill?[{kind:'skill',key:skill}]:[]),
    ...SKILL_IDS.filter(k=>k!==skill).map(key=>({kind:'skill',key}))];
  const tool=toolKey?{key:toolKey,uuid:null,name:null}:null;
  const hasTool=tool&&(heldTool(lead,tool)||checkOption(lead,{kind:'tool',key:toolKey}).proficient);
  const first=hasTool||!skill?options[0]:options.find(o=>o.kind==='skill'&&o.key===skill);
  const profItem=pk?professionItems(lead).find(i=>professionKey(professionDisplayName(i))===pk):null;
  return {profession,professionKey:pk,toolKey,skill,options,selected:`${first.kind}:${first.key}`,advantageTools:pk?[...(map.advantageTools[pk]??[])]:[],
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
    summary:nodeSummary(session.node,{forPlayers:true}),dc:session.node.dcVisible?session.node.dc:null,options:session.plan.options,selected:session.plan.selected,advantageTools:session.plan.advantageTools??[],
    assists:session.helpers.filter(h=>h.eligible).map(h=>h.name)};
}

/** GM: start a gathering check for a node (Locations or ad-hoc). The lead's owner gets the roll prompt. */
async function startGather({node,leadId,helperIds=[],requesterId=null}){
  if(!canRunGathering(game.user))throw Error('Only the GM can start gathering');
  const party=partyActors(),lead=game.actors?.get?.(leadId);
  const blocked=startBlocker({rosterCount:rosterIds().length,partyCount:party.length,leadInParty:Boolean(lead)&&party.some(a=>a.id===lead.id),node,
    materialFound:Boolean(node&&worldMaterial(node.materialId)),busy:Boolean(node)&&[...gatherSessions.values()].some(s=>s.node.key===node.key)});
  if(blocked)throw Error(blocked);
  if(exhaustedHere.has(node.key))throw Error(nodeBlocker({...node,exhausted:true}));
  const plan=gatherCheckPlan(lead,node);
  const helpers=helperInfo([...new Set(helperIds)].map(id=>game.actors.get(id)).filter(a=>a&&a.id!==lead.id&&party.some(p=>p.id===a.id)),lead,plan);
  const session={id:newId(),node,leadId:lead.id,leadName:lead.name,helpers,plan,requesterId,status:'rolling',createdAt:Date.now()};
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
  try{rewards=resolveGatherRewards({node,outcome,percent:exoticPercent(),roll:exoticRoll,metaOf:worldMaterialMeta,keyOf:professionKeyOfId});}
  catch(err){session.status='rolling';throw err;}
  const exotic=rewards.exotic;
  try{
    reward=rewards.base;
    if(reward){
      let item=worldMaterial(reward.materialId);
      if(!item&&reward.rare){reward={materialId:node.materialId,quantity:node.quantity,rare:false,noRareFallback:true};item=worldMaterial(node.materialId);}
      if(!item)throw Error(`The material ${reward.materialId} is not an imported, player-visible world material`);
      award={...await stackMaterial(lead,item,reward.quantity,{sourceIdOf:agSourceId,flagScope:ID}),name:item.name,img:item.img,quantity:reward.quantity};
    }
  }catch(err){session.status='rolling';throw err;}
  if(exotic.materialId){
    // The normal bundle is already given; an Exotic that cannot be written is reported to the GM, never retried.
    const item=worldMaterial(exotic.materialId);
    try{
      if(!item)throw Error('not an imported, player-visible world material');
      exoticAward={...await stackMaterial(lead,item,1,{sourceIdOf:agSourceId,flagScope:ID}),name:item.name,img:item.img,quantity:1,materialId:exotic.materialId};
    }catch(err){console.warn(`[${ID}] Exotic ${exotic.materialId} could not be given`,err);exoticNote=`Exotic ${item?.name??exotic.materialId} was found but could not be given (${err.message}). Give it by hand.`;}
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
  const lines=[`<p><strong>${esc(check.label)} check:</strong> ${n}${modeText(check.mode)}${node.dcVisible?` vs DC ${node.dc}`:''} — <strong>${verdict}</strong>${reward?.rare?' (rare bundle)':''}</p>`,
    exoticAward?`<p class="agl-exotic-find"><strong>Exotic find:</strong> ${exoticAward.quantity} × ${esc(exoticAward.name)}</p>`:'',
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
    const text=skipped.map(x=>`Exotic candidate ${names.get(x.materialId)??x.materialId} skipped: ${x.reason}.`).join(' ');
    exoticNote=exoticNote?`${exoticNote} ${text}`:text;
  }
  if(exoticNote){
    try{await globalThis.ChatMessage?.create?.({whisper:allUsers().filter(u=>u.isGM).map(u=>u.id),content:`<div class="agl-chat-card"><p><strong>GM:</strong> ${esc(exoticNote)}</p></div>`});}catch{}
  }
  if(exhausted==='manual'){
    try{await globalThis.ChatMessage?.create?.({whisper:allUsers().filter(u=>u.isGM).map(u=>u.id),content:`<div class="agl-chat-card"><p><strong>GM:</strong> Locations could not record that <em>${esc(nodeTitle(node))}</em> at ${esc(node.locationName)} is exhausted. Mark it in Locations.</p></div>`});}catch{}
  }
  lastGather={leadName:lead.name,title:nodeTitle(node),total:n,dc:node.dc,verdict,award,exoticAward,exotic:{...exotic,skipped},exoticNote,exhausted,by};
  refreshLedger();
  return {outcome,reward,award,exotic:{...exotic,skipped},exoticAward,awards:rewards.awards,exhausted};
}

/** Roll prompt fields; shared by the player popup and the GM's "Roll for them" panel. */
function rollFields(actor,proj,prefix=''){
  const opts=proj.options.map(o=>{const c=checkOption(actor,o);return `<option value="${esc(`${o.kind}:${o.key}`)}" ${proj.selected===`${o.kind}:${o.key}`?'selected':''}>${esc(c.label)}${o.kind==='tool'?' (tool)':''} ${formatBonus(c.bonus)}</option>`;}).join('');
  const sel=parseChoice({options:proj.options},proj.selected);
  const preset=rollModeFor(actor,sel??{},{assists:proj.assists,advantageTools:Array.isArray(proj.advantageTools)?proj.advantageTools:[]});
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
    const dialog=new DialogV2({id:`agl-gather-${message.sessionId}`,classes:['agl-consent','ag-app'],window:{title:`Gathering check — ${message.actorName}`},modal:false,rejectClose:false,
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

/** Player: ask the GM to gather an available node at a revealed location. */
async function requestGather({actorId,locationId,nodeId,helperIds=[]}){
  checkPlayerLedger();
  const actor=game.actors?.get?.(actorId);
  if(!actor||!owned(actor))throw Error('Choose a character you own');
  if(!locationId||!nodeId)throw Error('Choose an available gathering spot');
  if(!activeGM())throw Error('Gathering needs the GM to be online');
  const request={type:'gather-request',requestId:newId(),requesterId:game.user.id,actorId:actor.id,locationId,nodeId,
    helperIds:[...new Set(helperIds)].filter(id=>typeof id==='string'&&id!==actor.id).slice(0,8)};
  const outcome=new Promise(resolve=>{
    const timer=setTimeout(()=>{pendingGatherRequests.delete(request.requestId);resolve({ok:false,message:'No answer from the GM in time.'});},300000);
    pendingGatherRequests.set(request.requestId,message=>{clearTimeout(timer);resolve({ok:message.ok,message:message.message});});
  });
  sendSocket(request);
  return outcome;
}
/** GM: verify a player's request against the full Locations record, then ask the GM in a popup. */
async function handleGatherRequest(request,senderId){
  const reply=(ok,text)=>{sendSocket({type:'gather-request-result',requestId:request.requestId,toUserId:request.requesterId,ok,message:text});return {ok,message:text};};
  if(!canRunGathering(game.user))return {ok:false,message:'Only the GM can approve gathering'};
  const requester=userById(request.requesterId);
  if(!requester||senderId!==request.requesterId)return reply(false,'Gathering request could not be verified');
  const actor=game.actors?.get?.(request.actorId);
  const {location,node}=findNode(request.locationId,typeof request.nodeId==='string'?request.nodeId:null);
  const verdict=checkGatherRequest({ownsActor:Boolean(actor)&&!requester.isGM&&userOwns(requester,actor),inParty:Boolean(actor)&&rosterIds().includes(actor.id),
    location,node,busy:Boolean(node)&&nodeBusy(node.key)});
  if(!verdict.ok)return reply(false,verdict.reason);
  const party=partyActors();
  // Setup problems are reported now, not after the GM has approved: the player gets a plain line, the GM the exact fix.
  const setup=startBlocker({rosterCount:rosterIds().length,partyCount:party.length,leadInParty:party.some(a=>a.id===actor.id),node,materialFound:Boolean(worldMaterial(node.materialId))});
  if(setup){say(`Profession Ledger: ${requester.name}’s gathering request can’t start. ${setup}`,true);
    return reply(false,`The GM can’t start this yet: ${nodeBlocker(node,{materialFound:Boolean(worldMaterial(node.materialId)),forPlayer:true})||'the party is not set up.'} They have been told.`);}
  const helpers=(Array.isArray(request.helperIds)?request.helperIds:[]).map(id=>game.actors.get(id)).filter(a=>a&&a.id!==actor.id&&party.some(p=>p.id===a.id));
  gatherRequests.set(request.requestId,{node,actorId:actor.id});
  let approved=false;
  try{approved=await askGatherApproval(request.requestId,{requester,actor,node,helpers});}finally{gatherRequests.delete(request.requestId);}
  if(!approved)return reply(false,'The GM declined the gathering request.');
  try{await startGather({node,leadId:actor.id,helperIds:helpers.map(h=>h.id),requesterId:requester.id});}
  catch(err){return reply(false,err.message);}
  return reply(true,`Approved. ${actor.name}’s gathering check is ready to roll.`);
}
/** Popup on the GM's screen. Closing the window counts as Decline. */
function askGatherApproval(requestId,{requester,actor,node,helpers}){
  return new Promise(resolve=>{
    let settled=false;const done=value=>{if(!settled){settled=true;resolve(value);}};
    try{
      const plan=gatherCheckPlan(actor,node),info=helperInfo(helpers,actor,plan);
      const need=node.tier?ACCESS_LEVELS[tierName(node.tier)]:null,progress=plan.professionId?progressOf(actor,plan.professionId):null;
      const content=`<p><strong>${esc(requester.name)}</strong> asks for <strong>${esc(actor.name)}</strong> to gather <strong>${esc(nodeTitle(node))}</strong> at ${esc(node.locationName)}.</p>
        <p>${esc(nodeSummary(node))} · common ${node.quantity} × ${esc(materialName(node.materialId))}${node.rareMaterialId?`, rare ${node.rareQuantity} × ${esc(materialName(node.rareMaterialId))}`:''}${node.finite?' · finite':''}</p>
        ${info.length?`<ul>${info.map(h=>`<li>${esc(h.name)}: ${esc(h.reason)}${h.eligible?' — gives advantage':''}</li>`).join('')}</ul>`:'<p>No helpers.</p>'}
        ${!plan.professionId?`<p class="agl-sub">${esc(actor.name)} has no ${esc(plan.profession||'matching')} profession feature.</p>`:''}
        ${need&&progress&&progress.level<need?`<p class="agl-sub">${esc(actor.name)} is ${esc(plan.professionName)} level ${progress.level}; tier ${node.tier} usually needs level ${need}.</p>`:''}`;
      const dialog=new DialogV2({id:`agl-gather-req-${requestId}`,classes:['agl-consent','ag-app'],window:{title:'Gathering request'},content,modal:false,rejectClose:false,
        buttons:[{action:'decline',label:'Decline',icon:'fa-solid fa-xmark',callback:()=>done(false)},{action:'approve',label:'Approve',icon:'fa-solid fa-check',default:true,callback:()=>done(true)}]});
      const close=dialog.close?.bind(dialog);
      dialog.close=async(...args)=>{done(false);return close?.(...args);};
      gatherDialogs.set(`req:${requestId}`,dialog);
      dialog.render({force:true});
    }catch(err){console.error(`[${ID}] gathering approval dialog`,err);done(false);}
  });
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
    slot.innerHTML=`<p class="agl-chat-note">+${Number(x.awarded.points)} ${esc(x.professionName)} XP awarded by the GM.</p>${game.user.isGM?'<button type="button" data-agl-xp-undo><i class="fa-solid fa-rotate-left"></i> Undo award</button>':''}`;
    const undo=slot.querySelector('[data-agl-xp-undo]');
    undo?.addEventListener?.('click',async event=>{
      event.preventDefault?.();undo.disabled=true;
      try{const ok=await DialogV2.confirm({window:{title:'Undo XP award?'},content:`<p>Take back <strong>${Number(x.awarded.points)} ${esc(x.professionName)} XP</strong> from <strong>${esc(x.actorName)}</strong> and allow Award XP on this card again?</p>`,modal:true,rejectClose:false});
        if(!ok){undo.disabled=false;return;}
        say((await undoAwardFromCard(message)).message);}
      catch(err){undo.disabled=false;say(`Profession Ledger: ${err.message}`,true);}
    });
    return;}
  if(!game.user.isGM){slot.innerHTML='';return;}
  if(!x.professionId){slot.innerHTML=`<p class="agl-chat-note">GM: ${esc(x.actorName)} has no matching profession feature, so there is no XP to award here.</p>`;return;}
  slot.innerHTML=`<div class="agl-xp-award"><label>XP <input type="number" min="1" max="1000" step="1" value="${x.suggested??1}" data-agl-xp-points></label>
    <button type="button" data-agl-xp-award><i class="fa-solid fa-star"></i> Award ${esc(x.professionName)} XP</button></div>${x.suggested?`<p class="agl-chat-note">Suggested: ${x.suggested} XP. GM only.</p>`:'<p class="agl-chat-note">GM only.</p>'}`;
  const button=slot.querySelector('[data-agl-xp-award]');
  button?.addEventListener?.('click',async event=>{
    event.preventDefault?.();button.disabled=true;
    try{const out=await awardXpFromCard(message,Number(slot.querySelector('[data-agl-xp-points]')?.value));say(out.message);}
    catch(err){button.disabled=false;say(`Profession Ledger: ${err.message}`,true);}
  });
}

/** Learn / Craft / Award XP, shared by the Ledger window and the sheet tab. Returns {message} or null if cancelled. */
async function performAction(action,{id,actorId,points,delta=null,set=null,reason='',messageId=null}){
  checkPlayerLedger();
  const actor=game.actors?.get?.(actorId)??null;
  if(action==='learn-recipe'){
    const itemId=String(id).includes(':')?String(id).split(':')[1]:id;
    const item=itemOf(actor,itemId);if(!actor||!item)throw Error('Recipe Item is missing or no longer held');
    if(!owned(actor))throw Error('OWNER permission is required to learn');
    if(game.user.isGM&&actor.hasPlayerOwner)throw Error(`${actor.name}'s player learns this recipe from their own Ledger or character sheet`);
    const check=canLearnRecipe(actor,item,agSourceId(item));if(!check.ok)throw Error(check.reason);
    const name=recipeTitle(item.name);
    const ok=await DialogV2.confirm({window:{title:`Learn ${name}?`},content:`<p><strong>${esc(actor.name)}</strong> learns <strong>${esc(name)}</strong>.</p><p>This uses up one recipe item (${quantity(item)} held). The recipe stays known.</p>`,modal:true,rejectClose:false});
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
    if(!linkedProfession(actor,id))throw Error('Actor must own a matching Manager-tagged PROF-* Profession Item');
    const name=professionsOf(actor).find(p=>p.sourceId===id)?.name??humanizeId(id);
    const plan=adjustProgress(actor.flags?.[ID]?.professionProgress??emptyProgress(),id,{delta:d,set:st,recipes:professionRecipes(actor,id)});
    if(plan.xp===plan.from)throw Error(`${actor.name}'s ${name} XP is already ${plan.from}${plan.clamped?` (limits are 0 and ${XP_CAP})`:''}`);
    const dep=dependentsText(plan,name,actor,id);
    const ok=await DialogV2.confirm({window:{title:`Adjust ${name} XP?`},content:`<p><strong>${esc(actor.name)}</strong>: ${esc(name)} XP ${plan.from} → <strong>${plan.xp}</strong>${plan.clamped?` (limited to 0–${XP_CAP})`:''}. Level ${plan.previousLevel} → <strong>${plan.level}</strong>.</p>${dep?`<p><strong>Heads up:</strong> ${esc(dep)}</p>`:''}<p>The owner is told in chat, and the change is recorded in the XP history.</p>`,modal:true,rejectClose:false});
    if(!ok)return null;
    const r=await adjustXP(actor,id,{delta:d,set:st,reason});
    const sign=r.xp-r.from>0?'+':'−',amount=Math.abs(r.xp-r.from);
    await whisperXpNote(actor,`<strong>${esc(actor.name)}'s ${esc(name)} XP adjusted by the GM (${sign}${amount})</strong><span>Now level ${r.level} · ${r.xp} XP${reason?` · ${esc(String(reason).slice(0,200))}`:''}${dep?` · ${esc(dep)}`:''}</span>`);
    return {message:`${actor.name}: ${name} XP ${r.from} → ${r.xp}, level ${r.level}.${dep?` ${dep}`:''}`,...(r.xp>r.from?{award:{actorId:actor.id,profId:id,points:r.xp-r.from}}:{})};
  }
  if(action==='craft')return craft(actor,id);
  throw Error(`Unknown action ${action}`);
}

const portrait=(a)=>a?.img?`<img class="agl-avatar" src="${esc(a.img)}" alt="">`:`<span class="agl-avatar">${esc((a?.name||'?').slice(0,1))}</span>`;
class LedgerApp extends HandlebarsApplicationMixin(ApplicationV2){
  static DEFAULT_OPTIONS={id:'agl-window',classes:['agl-app','ag-app'],window:{title:'Ashen Gate | Profession Ledger',resizable:true,icon:'fa-solid fa-book-open'},position:{width:1180,height:800}};
  static PARTS={main:{template:`modules/${ID}/templates/ledger.hbs`}};
  render(options){checkPlayerLedger();return super.render(options);}
  constructor(...args){super(...args);this.view='individual';this.previousView='individual';this.actorId=null;this.demo=false;this.query='';
    this.closedFolders=new Set();this.partySort='player';this.lastAward=null;this.notice='';this.rosterDraft=null;this._events=null;
    this.mapDraft=null;
    this.gather={source:'location',actorId:null,nodeRef:'',helperIds:[],pending:false,
      adhoc:{label:'',skill:'Herbalism',tier:'1',dc:'',materialId:'',rareMaterialId:'',quantity:'1',rareQuantity:'1',exotics:[]},
      // Exotic picker filters: profession and tier default to the ad-hoc node's own.
      pick:{query:'',profession:'node',tier:'node'}};
    this.exoticDraft=null;
    this.coreAwardDraft=null;
    this.assignState={target:'party',preview:null,selected:new Set()};
  }
  get actors(){return partyActors();}
  get library(){return catalog();}
  get actor(){const mine=myCharacters();return mine.find(a=>a.id===this.actorId)??mine[0]??null;}
  _tabs(){const names=[['individual','Individual'],['party','Party'],['catalog','Recipe Catalog'],['gathering','Gathering'],...(game.user.isGM?[['assign','Assign'],['gm','GM Setup']]:[])];
    return names.map(([key,title])=>`<button type="button" data-action="tab" data-id="${key}" class="${this.view===key?'active':''}" aria-current="${this.view===key?'page':'false'}">${title}</button>`).join('');}
  _search(placeholder){return `<input type="search" class="agl-search" data-agl-search value="${esc(this.query)}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}">`;}
  _noRoster(){return `<div class="ag-empty">The GM hasn’t chosen the party yet. ${game.user.isGM?'<button type="button" class="ag-btn" data-action="tab" data-id="gm">Choose the party in GM Setup →</button>':'Ask your GM to set up the party in the Profession Ledger.'}</div>`;}
  _individual(lib){
    const mine=myCharacters(),actor=this.actor;
    if(!actor)return game.user.isGM&&!rosterIds().length?this._noRoster():`<div class="ag-empty">${game.user.isGM?'No characters in the party.':'You don’t own a character in the party. Ask your GM to add your character in the Profession Ledger’s GM Setup.'}</div>`;
    const picker=mine.length>1?`<label class="ag-field ag-field--inline">Character <select data-agl-actor>${mine.map(a=>`<option value="${esc(a.id)}" ${a.id===actor.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label>`:`<div class="agl-who">${portrait(actor)}<strong>${esc(actor.name)}</strong></div>`;
    const gmNote=game.user.isGM?`<div class="agl-note">Viewing <b>${esc(actor.name)}</b> as GM. Award XP on a profession below; ${actor.hasPlayerOwner?'the player learns recipes from their own Ledger or sheet.':'you can learn recipes for this character.'}</div>`:'';
    return `<div class="ag-toolbar agl-toolbar">${picker}${this._search('Search recipes')}</div>${gmNote}${characterPanel(actor,lib,{closed:this.closedFolders,lastAward:this.lastAward})}`;
  }
  _party(lib){
    if(!rosterIds().length)return this._noRoster();
    const actors=this.actors;
    if(!actors.length)return '<div class="ag-empty">None of the party characters are visible to you. Ask your GM to give players at least Limited permission on party characters.</div>';
    const gm=game.user.isGM;
    const hidden=gm&&players().length?actors.filter(a=>players().every(u=>!a.testUserPermission?.(u,'LIMITED'))):[];
    const mats=partyMaterials(actors,lib);
    const {known,found}=partyRecipes(actors);
    const ids=[...new Set([...known.keys(),...found.keys()])];
    const defs=new Map(ids.map(id=>[id,partyRecipeDefinition(id,lib)]).filter(([,d])=>d));
    let recipes;
    if(this.partySort==='profession'){
      recipes=folders([...defs.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(r=>({group:professionLabel(r),
        html:recipeRow(r,lib,{knownBy:known.get(r.id)??[],foundBy:(found.get(r.id)??[]).map(x=>x.actor)})})),this.closedFolders);
    }else{
      recipes=actors.map(actor=>{
        const mineKnown=knownRecipesOf(actor).filter(id=>defs.has(id));
        const mineFound=[...found.entries()].filter(([id,list])=>defs.has(id)&&list.some(x=>x.actor.id===actor.id)).map(([id])=>id);
        const list=[...new Set([...mineKnown,...mineFound])].map(id=>defs.get(id)).sort((a,b)=>professionLabel(a).localeCompare(professionLabel(b))||a.name.localeCompare(b.name));
        const key=`actor-${actor.id}`;
        return `<details class="agl-folder" data-folder="${esc(key)}" ${this.closedFolders.has(key)?'':'open'}><summary>${portrait(actor)} <strong>${esc(actor.name)}</strong> <span class="agl-count">${mineKnown.length} known${mineFound.length?` · ${mineFound.length} to learn`:''}</span>${gm?` <button type="button" class="ag-btn ag-btn--sm" data-action="open-individual" data-id="${esc(actor.id)}">Open ${esc(actor.name)}’s view</button>`:''}</summary>
          <div class="agl-folder-body">${list.map(r=>recipeRow(r,lib,{knownBy:mineKnown.includes(r.id)?[actor]:[],foundBy:mineFound.includes(r.id)?[actor]:[]})).join('')||'<div class="ag-empty">No recipes yet.</div>'}</div></details>`;
      }).join('');
    }
    const profRows=actors.map(a=>{const p=professionsOf(a);return `<div class="agl-line"><span class="agl-who">${portrait(a)}<strong>${esc(a.name)}</strong></span><span>${p.map(x=>`${esc(x.name)} ${badge(`L${x.level}`,'ok')}`).join(' ')||'<span class="agl-sub">No professions</span>'}</span></div>`;}).join('');
    return `${hidden.length?`<div class="agl-note warn">No player can see ${esc(nameList(hidden))} (needs at least Limited permission), so players won’t see ${hidden.length===1?'that character':'those characters'} here.</div>`:''}
      <div class="ag-toolbar agl-toolbar">${this._search('Search party recipes')}<div class="agl-segmented" role="group" aria-label="Sort recipes">
        <button type="button" class="ag-btn ${this.partySort==='player'?'active':''}" data-action="party-sort" data-id="player">By player</button>
        <button type="button" class="ag-btn ${this.partySort==='profession'?'active':''}" data-action="party-sort" data-id="profession">By profession</button></div></div>
      <div class="agl-party">
        <section class="agl-col-main"><div class="agl-section"><h3>Party recipes <span class="agl-count">${defs.size}</span></h3>
          <p class="agl-sub">Recipes the party knows, and recipe items someone holds but hasn’t learned yet. Craft and learn from the Individual tab.</p>
          ${recipes||'<div class="ag-empty">No one in the party has found or learned a recipe yet.</div>'}</div></section>
        <section class="agl-col-side">
          <div class="agl-section"><h3>Party materials <span class="agl-count">${mats.length}</span></h3>
            ${mats.map(m=>`<div class="agl-material"><div class="agl-line"><strong>${esc(m.name)}</strong><b>× ${m.total}</b></div><div class="agl-holders">${m.holders.map(h=>`<span class="agl-chip">${esc(h.actor.name)} ${h.qty}</span>`).join('')}</div></div>`).join('')||'<div class="ag-empty">No crafting materials in the party.</div>'}
            <p class="agl-sub">Characters keep their own items. A craft that needs someone else’s materials asks their owner first.</p></div>
          <div class="agl-section"><h3>Professions</h3>${profRows}</div>
        </section>
      </div>`;
  }
  /** GM-only catalog management: legacy JSON import, Manager shortcut, draft visibility guide. */
  _catalogTools(){
    if(!game.user.isGM)return '';
    const manager=game.modules.get('ashen-gate-manager');
    const canOpen=Boolean(manager?.active&&typeof manager.api?.open==='function');
    return `<section class="ag-card agl-panel agl-catalog-tools"><h2>Catalog tools</h2>
        <p class="agl-sub">General Manager imports recipes, materials and the items recipes make. A crafted item is copied from the recipe’s result item in the world Items directory. The Ledger catalog import below is only for older player-safe JSON catalogs.</p>
        <div class="agl-management-actions"><button type="button" class="ag-btn" data-action="import">Import Ledger recipe/material JSON</button>
        <button type="button" class="ag-btn" data-action="manager" ${canOpen?'':'disabled title="Manager is not installed, enabled or exposing its open API"'}>Open General Manager ↗</button></div>
        <div class="agl-management-actions">${badge('All players','ok')} ${badge('Some players','partial')} ${badge('GM only','warn')} ${badge('Draft — hidden from players','warn')}</div>
        <p class="agl-sub">Draft recipes are visible only to you. A player never sees a draft recipe item, and can’t learn or craft it, until you approve it in General Manager.</p>
      </section>`;
  }
  _catalog(lib){
    const gm=game.user.isGM,party=this.actors;
    const {known,found}=partyRecipes(party);
    const recipes=gm?lib.recipes:[...new Set([...known.keys(),...found.keys()])].map(id=>partyRecipeDefinition(id,lib)).filter(Boolean);
    const rows=recipes.map(r=>({group:professionLabel(r),html:recipeRow(r,lib,{knownBy:known.get(r.id)??[],foundBy:(found.get(r.id)??[]).map(x=>x.actor)})}));
    const hidden=gm?lib.recipes.filter(hiddenFromPlayers).length:0;
    return `<div class="ag-toolbar agl-toolbar">${this._search('Search recipes, professions or results')}</div>
      ${this._catalogTools()}
      ${gm?`<div class="agl-note ${hidden?'warn':''}">GM view: every recipe in the world. ${hidden?`<b>${hidden} of ${lib.recipes.length} ${lib.recipes.length===1?'recipe':'recipes'} ${hidden===1?'is':'are'} draft or GM-only and hidden from players.</b> `:''}Players only see recipes someone in the party has found or learned.</div>`
        :'<p class="agl-sub">Recipes your party has found or learned, by profession.</p>'}
      ${folders(rows,this.closedFolders)||`<div class="ag-empty">${gm?'No recipes in this world. Import recipes with General Manager.':'No recipes yet. A recipe appears here once someone in the party finds its recipe item or learns it.'}</div>`}
      <div class="ag-empty agl-no-matches" hidden>No matching recipes.</div>`;
  }
  _roster(){if(!game.user.isGM)return '<div class="ag-empty">Party Roster is GM-only.</div>';
    const selected=this.rosterDraft??new Set(rosterIds());const chars=allCharacters();
    return `<section class="ag-card agl-panel agl-roster"><h2>Party ${badge(`${selected.size} selected`,'ok')}</h2>
      <p class="agl-sub">Checked characters make up the party. A player sees a party member in the Party tab, and can ask to use their materials, when they have at least Limited permission on that character. Changes are saved for everyone in this world.</p>
      <div class="agl-roster-actions"><button type="button" class="ag-btn" data-action="roster-all">Select player-owned characters</button><button type="button" class="ag-btn" data-action="roster-clear">Clear selection</button></div>
      <div class="agl-roster-list">${chars.map(a=>`<label class="agl-roster-row"><input type="checkbox" data-roster-actor="${esc(a.id)}" ${selected.has(a.id)?'checked':''}>
        ${portrait(a)}<span class="agl-roster-name"><strong>${esc(a.name)}</strong><small>${a.hasPlayerOwner?'Player owned':'No player owner'}</small></span>${visibilityBadge(a)}
      </label>`).join('')||'<div class="ag-empty">No character Actors in this world.</div>'}</div>
      <div class="agl-note">Access indicators are calculated against non-GM user accounts. Being in the party does not grant ownership or show a player anything beyond the Ledger’s profession, material and recipe lists.</div>
    </section>`;
  }
  _gmSetup(){
    if(!game.user.isGM)return '<div class="ag-empty">GM Setup is restricted to the GM.</div>';
    return `<div class="agl-gm-setup">
      ${this._roster()}
      <section class="ag-card agl-panel"><h2>Player Access</h2>
        <p class="agl-sub">${playerAccessEnabled()?'Visible':'Hidden'} to players. This controls the Actors launcher, Ledger window and sheet tab only; it never changes Profession XP, known recipes or Items. Manager can also change this switch (${PLAYER_ACCESS_CONTRACT}).</p>
        <div class="agl-management-actions">${badge(`Player interface: ${playerAccessEnabled()?'Visible':'Hidden'}`,playerAccessEnabled()?'ok':'warn')}
          <button type="button" data-action="toggle-player-access" class="ag-btn">${playerAccessEnabled()?'Hide from players':'Show to players'}</button></div>
      </section>
      ${this._toolSetup()}
      ${this._exoticSetup()}
      ${this._coreAwardSetup()}
    </div>`;
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
  get coreAwardDirty(){return this.coreAwardDraft!=null&&this.coreAwardDraft!==awardCoreItems();}
  get exoticDirty(){return this.exoticDraft!==null&&clampPercent(this.exoticDraft,exoticPercent())!==exoticPercent();}
  /** Profession → tool (crafting default and gathering), gathering profession → check skill, and (0.16.0) the
   * Assign crosswalk: qualifying skills/tools and advantage tools. Unticked lists follow the catalog, else the check tool/skill. */
  _toolSetup(){
    const draft=this.mapDraft??mappingDraft(checkMapping());
    const {map,catalog,unresolved,conflicts}=crosswalkInfo(draft),keys=toolKeys();
    const ORIGIN={gm:'set by you',baseline:'from the baseline file',catalog:'from the Profession catalog',default:'from the check tool/skill'};
    const ITEM_ORIGIN={...ORIGIN,default:'built in'},fileLayer=baselineLayer();
    const multi=(k,name,list,options,labelOf,current)=>`<details class="agl-multi"><summary>${current.length?esc(current.map(labelOf).join(', ')):'<span class="agl-sub">None</span>'}</summary>
      <div class="agl-multi-list">${options.map(o=>`<label><input type="checkbox" data-map-list="${list}" data-map-prof="${esc(k)}" value="${esc(o)}" ${current.includes(o)?'checked':''}> ${esc(labelOf(o))}</label>`).join('')}</div></details>`;
    const rows=PROFESSION_NAMES.map(name=>{const k=professionKey(name),gathering=GATHERING_PROFESSIONS.includes(name),hasSkill=gathering||k==='enchanting';
      const origin=map.origin[k]??{},fileAdv=fileLayer?.[k]?.advantageTools,adv=draft.advantageTools[k]??fileAdv??[],suggest=!draft.advantageTools[k]&&!fileAdv&&catalog[k]?.advantageTools?.length?catalog[k].advantageTools:[];
      const custom=CROSSWALK_LISTS.some(l=>draft[l][k]);
      return `<tr><th scope="row">${esc(name)}${gathering?' <small class="agl-sub">gathering</small>':''}</th>
        <td><select data-map-tool="${esc(k)}" aria-label="${esc(name)} tool"><option value="">— None —</option>${keys.map(t=>`<option value="${esc(t)}" ${map.tools[k]===t?'selected':''}>${esc(toolLabel(t))}</option>`).join('')}</select></td>
        <td>${hasSkill?`<select data-map-skill="${esc(k)}" aria-label="${esc(name)} ${gathering?'gathering':'craft'} skill"><option value="">— None —</option>${SKILL_IDS.map(sk=>`<option value="${sk}" ${map.skills[k]===sk?'selected':''}>${esc(skillLabel(sk))}</option>`).join('')}</select>`:'<span class="agl-sub">—</span>'}</td>
        <td>${multi(k,name,'qualifySkills',SKILL_IDS,skillLabel,map.qualifySkills[k]??[])}<small class="agl-sub">${esc(ORIGIN[origin.qualifySkills]??'')}</small></td>
        <td>${multi(k,name,'qualifyTools',keys,toolLabel,map.qualifyTools[k]??[])}<small class="agl-sub">${esc(ORIGIN[origin.qualifyTools]??'')}</small></td>
        <td><input type="text" data-map-items="${esc(k)}" value="${esc((map.items[k]??[]).join(', '))}" placeholder="None" aria-label="${esc(name)} qualifying items (carried), comma separated"><small class="agl-sub">${esc(ITEM_ORIGIN[origin.items]??'')}</small></td>
        <td>${multi(k,name,'advantageTools',keys,toolLabel,adv)}${draft.advantageTools[k]?'':fileAdv?`<small class="agl-sub">${esc(ORIGIN.baseline)}</small>`:''}${suggest.length?`<small class="agl-sub">Catalog suggests ${esc(suggest.map(toolLabel).join(', '))}; tick to use</small>`:''}</td>
        <td>${custom?`<button type="button" class="ag-btn" data-action="map-reset" data-id="${esc(k)}" title="Clear your qualifying and advantage choices for ${esc(name)}">Reset</button>`:''}</td></tr>`;}).join('');
    const notes=[...unresolved.map(u=>`${u.profession}: catalog ${u.field==='skillProficienciesAnyOf'?'skill':'tool'} “${u.name}” matches no dnd5e ${u.field==='skillProficienciesAnyOf'?'skill':'tool'} and is ignored.`),
      ...conflicts.map(c=>`${c}: several imported Profession definitions disagree, so the catalog is not used for it.`)];
    return `<section class="ag-card agl-panel"><h2>Tools and checks</h2>
      <p class="agl-sub">The tool each profession uses. A recipe with no tool or workstation of its own needs its profession’s tool, and crafting rolls a check with it (shown on the craft card; it doesn’t decide success yet). Gathering offers the tool check and, for gathering professions, the skill below; the roller can pick another skill. Enchanting’s main check is the Arcana skill: a craft offers it, and also the recipe’s own tool (such as Jeweler’s Tools) when it names one. Helpers carrying the tool give advantage. Saved with <b>Save Changes</b>.</p>
      <p class="agl-sub"><b>Qualifying skills / tools / items</b> are what the <b>Assign</b> tab reads: proficiency in any one of the skills or tools, or carrying one of the items (core items by name or UUID, any case, comma separated; Fishing Tackle for Fishing by default), qualifies a character for the profession. Until you set your own, they come from the baseline file, else the imported Profession catalog, else the check tool and skill. <b>Advantage tools</b>: a character proficient with, or carrying, one of them starts that profession’s gathering and crafting checks with advantage. Only tools you tick here or the baseline file sets count.</p>
      ${notes.length?`<ul class="agl-sub">${notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>`:''}
      ${this._baselinePanel()}
      <div class="agl-map-wrap"><table class="agl-map"><thead><tr><th>Profession</th><th>Tool</th><th>Check skill (gathering / Enchanting)</th><th>Qualifying skills</th><th>Qualifying tools</th><th>Qualifying items (carried)</th><th>Advantage tools</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }
  /** GM: baseline file import (file → preview → apply) and export of the current table. */
  _baselinePanel(){
    const rec=baselineRecord(),p=this.baselinePreview;
    const LIST={qualifySkills:'Qualifying skills',qualifyTools:'Qualifying tools',advantageTools:'Advantage tools',items:'Qualifying items'};
    const show=(list,v)=>v==null?'<span class="agl-sub">not set by the file</span>':v.length?esc(v.map(list==='qualifySkills'?skillLabel:list==='items'?String:toolLabel).join(', ')):'<span class="agl-sub">None</span>';
    let preview='';
    if(p){
      const r=p.result,notes=[...r.errors,...r.unknownProfessions.map(n=>`“${n}” is not a profession; ignored.`),...r.unresolved.map(u=>`${u.profession}: ${LIST[u.list]} “${u.name}” matches no dnd5e ${u.list==='qualifySkills'?'skill':'tool'}; ignored.`)];
      const rows=r.changes.map(c=>`<tr><th scope="row">${esc(c.profession)}</th><td>${esc(LIST[c.list])}</td><td>${show(c.list,c.before)}</td><td>${show(c.list,c.after)}</td><td>${c.gmWins?'<span class="agl-sub">Your edit still wins</span>':''}</td></tr>`).join('');
      preview=`<div class="agl-baseline-preview" role="region" aria-label="Baseline file preview"><h3>Preview: ${esc(p.fileName||'baseline file')}</h3>
        ${notes.length?`<ul class="agl-sub">${notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>`:''}
        ${r.ok?(rows?`<div class="agl-map-wrap"><table class="agl-map"><thead><tr><th>Profession</th><th>List</th><th>Baseline now</th><th>From this file</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="agl-sub">This file changes nothing.</p>'):'<p class="agl-sub">Fix the file and import it again. Nothing was changed.</p>'}
        <div class="agl-management-actions"><button type="button" class="ag-btn" data-action="xwalk-cancel">Cancel</button>${r.ok?`<button type="button" class="ag-btn ag-btn--primary" data-action="xwalk-apply">Apply baseline</button>`:''}</div></div>`;
    }
    return `<div class="agl-baseline"><p class="agl-sub"><b>Baseline file</b>: ${rec?`${esc(rec.fileName||'imported file')}, imported ${esc(String(rec.importedAt??'').slice(0,10))}`:'none imported'}. Layers, lowest first: built in, Profession catalog, baseline file, your edits here (your edits always win; Reset a row to fall back).</p>
      <div class="agl-management-actions"><button type="button" class="ag-btn" data-action="xwalk-import">Import baseline file…</button><button type="button" class="ag-btn" data-action="xwalk-export">Export current table</button>
      <input id="agl-xwalk-file" type="file" accept="application/json,.json" hidden></div>${preview}</div>`;
  }
  /** GM: assign the profession features characters qualify for (dry run, then confirm). Not part of GM Setup. */
  _assign(){
    if(!game.user.isGM)return '<div class="ag-empty">Assign is restricted to the GM.</div>';
    const a=this.assignState,party=assignActors(),chars=allCharacters();
    const target=`<label class="ag-field ag-field--inline">Characters <select data-assign-target><option value="party" ${a.target==='party'?'selected':''}>Whole party (${party.length})</option>${chars.map(c=>`<option value="${esc(c.id)}" ${a.target===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label>`;
    const p=a.preview;
    let body='<p class="agl-sub">Preview shows each character’s profession matches. Nothing changes until you confirm.</p>';
    if(p){
      const proposals=p.rows.filter(r=>r.status==='propose');
      const STATUS={has:['Already has','muted'],'no-item':['No imported Profession Item: import it with Manager','warn'],conflict:['Several imported Profession Items: archive the extra one in Manager','warn']};
      const groups=p.actors.map(act=>{const rows=p.rows.filter(r=>r.actorId===act.id);
        return `<tr class="agl-assign-actor"><th colspan="4" scope="rowgroup">${esc(act.name)}${rows.length?'':' <span class="agl-sub">— no skill or tool proficiency matches a profession</span>'}</th></tr>${rows.map(r=>`<tr>
          <td>${r.status==='propose'?`<input type="checkbox" data-assign-row="${esc(r.id)}" ${a.selected.has(r.id)?'checked':''} aria-label="Add ${esc(r.profession)} to ${esc(r.actorName)}">`:''}</td>
          <td>${esc(r.profession)}</td><td>${esc(r.reason)}</td>
          <td>${r.status==='propose'?badge(`Will add ${r.itemName}`,'ok'):badge(...STATUS[r.status])}</td></tr>`).join('')}`;}).join('');
      const notes=[p.unmapped.length?`No qualifying skill or tool is set for ${p.unmapped.join(', ')}, so nobody is proposed for ${p.unmapped.length===1?'it':'them'}. Set them in GM Setup → Tools and checks.`:'',
        ...p.conflicts.map(c=>`${c}: imported Profession definitions disagree; check them in Manager.`)].filter(Boolean);
      body=`${notes.map(n=>`<p class="agl-sub">${esc(n)}</p>`).join('')}
        <div class="agl-map-wrap"><table class="agl-map agl-assign"><thead><tr><th></th><th>Profession</th><th>Reason</th><th>Result</th></tr></thead><tbody>${groups||'<tr><td colspan="4">No characters to check.</td></tr>'}</tbody></table></div>
        <p class="agl-sub">${proposals.length?`${plural(proposals.length,'profession feature')} to add. Adding never changes XP, levels, perks or existing Items.`:'Nothing new to add.'}</p>
        <div class="agl-management-actions"><button type="button" class="ag-btn" data-action="assign-apply" data-id="selected" ${[...a.selected].some(id=>proposals.some(r=>r.id===id))?'':'disabled'}>Add selected</button>
          <button type="button" class="ag-btn ag-btn--primary" data-action="assign-apply" data-id="all" ${proposals.length?'':'disabled'}>Add all missing (${proposals.length})</button></div>`;
    }
    return `<section class="ag-card agl-panel"><h2>Assign professions</h2>
      <p class="agl-sub">Matches each character’s skill and tool <b>proficiencies</b> (not class) against GM Setup → Tools and checks, and proposes the imported PROF-* Profession features they don’t have yet.</p>
      <div class="ag-toolbar agl-toolbar">${target}<button type="button" class="ag-btn" data-action="assign-preview"><i class="fa-solid fa-magnifying-glass"></i> Preview</button></div>
      ${body}</section>`;
  }
  _help(){return `<section class="ag-card agl-panel agl-help"><h2>Profession Ledger Help</h2>
    <p><strong>Individual:</strong> your character’s crafting bench: professions with level and XP, materials, recipe items you can learn, and known recipes. <em>Craft</em> checks you know the recipe and have the materials, uses them up and puts the crafted item in your inventory, with a chat card. If a party member has what you’re missing, <em>Craft — ask the party</em> asks their owner on their screen; any decline cancels and nothing is used.</p>
    <p><strong>Learn:</strong> a recipe item in your inventory has a Learn button. Learning uses up one recipe item and the recipe stays known.</p>
    <p><strong>Party:</strong> every party member’s materials and recipes, by player or by profession.</p>
    <p><strong>Recipe Catalog:</strong> recipes your party has found or learned, in folders by profession${game.user.isGM?'. As GM you see every recipe, with drafts marked':''}.</p>
    <p><strong>Where XP lives:</strong> on your character, kept by the Profession Ledger. It’s shown here, in the Professions tab of the Tidy5e sheet, and in the profession feature’s description on your sheet. Only the GM awards XP.</p>
    <p><strong>Gathering:</strong> pick a gathering spot at a location your party knows and send a request; the GM approves it. The lead gatherer rolls one check for the party (skill or tool bonus shown, advantage preset from the sheet, effects and helpers). Success gives one common bundle, success by 5+ a rare one instead; failure exhausts the spot. The result is posted in chat.</p>
    <p><strong>Tools:</strong> a recipe shows the tool or workstation it needs and warns if your character doesn’t carry the tool. Crafting rolls a tool check; the result is on the craft card. Gold costs are shown, not deducted.</p>
    <p><strong>XP:</strong> the GM awards profession XP from the gather and craft chat cards.</p>
    ${game.user.isGM?'<p><strong>Assign:</strong> preview which profession features each party character qualifies for from their skill and tool proficiencies, or from carrying a qualifying item (Fishing Tackle for Fishing), then add the missing ones. Re-running adds nothing new; XP is never changed.</p>':''}
    ${game.user.isGM?'<p><strong>GM Setup:</strong> choose the party, Player Access, and the tool and check mapping. <em>Tools and checks</em> can import a baseline crosswalk file (preview, then apply) and export the current table. Recipe imports and Manager are in the Recipe Catalog tab; XP is awarded from the Individual tab.</p>':''}
    <button type="button" class="ag-btn" data-action="help-back">Back</button>
  </section>`;}
  /** Ad-hoc node from the GM's form; same shape as a Locations entry. */
  _adhocNode(){
    const a=this.gather.adhoc;
    // Each ad-hoc node is its own spot, so several can be worked at once.
    return normalizeNode({id:`adhoc-${newId()}`,label:a.label,skill:a.skill,tier:a.tier,dc:a.dc,dcVisible:true,materialId:a.materialId,rareMaterialId:a.rareMaterialId,exotics:a.exotics,
      quantity:a.quantity,rareQuantity:a.rareQuantity,finite:false},{locationId:null,index:0});
  }
  _selectedNode(){
    if(this.gather.source==='adhoc')return this._adhocNode();
    const [locationId,nodeId]=String(this.gather.nodeRef??'').split('|');
    return findNode(locationId,nodeId).node;
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
    const profLabel=k=>GATHERING_PROFESSIONS.find(n=>professionKey(n)===k)??k;
    const rows=exoticRows({...node,exotics:a.exotics}).map(r=>`<li class="agl-exotic-row">
        <strong>${esc(r.name)}</strong>${r.meta?.tier?` <small class="agl-sub">Tier ${r.meta.tier}</small>`:''} ${r.eligible?badge('Eligible','ok'):badge(r.reason,'warn')}
        <label class="ag-field ag-field--inline">Rule<select data-adhoc-exotic="${esc(r.materialId)}" data-exotic-key="mode">${EXOTIC_MODES.map(m=>`<option value="${m}" ${r.mode===m?'selected':''}>${m==='designated'?'Designated source':'Random discovery'}</option>`).join('')}</select></label>
        ${r.mode==='designated'?`<label class="ag-field ag-field--inline">Chance %<input type="number" min="1" max="100" step="1" data-adhoc-exotic="${esc(r.materialId)}" data-exotic-key="chance" value="${esc(r.chance??'')}" placeholder="required"></label>
        <label class="ag-field ag-field--inline">When<select data-adhoc-exotic="${esc(r.materialId)}" data-exotic-key="condition">${Object.entries(DESIGNATED_CONDITIONS).map(([k,l])=>`<option value="${k}" ${r.condition===k?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`:''}
        <button type="button" class="ag-btn" data-action="adhoc-exotic-remove" data-id="${esc(r.materialId)}">Remove</button></li>`).join('');
    return `<fieldset class="agl-exotic-pick"><legend>Exotic candidates (optional, GM only)</legend>
      <p class="agl-sub">Pick which Exotic materials this node can give. A pick sets eligibility only: a successful check rolls d100 once (discovery ${exoticPercent()}%, set in GM Setup), or a designated source uses its own chance instead. A failed check never finds one. Players never see this list.</p>
      ${rows?`<ul class="agl-exotic-list">${rows}</ul>`:''}
      <div class="ag-toolbar agl-exotic-filters">
        <label class="ag-field">Search<input type="search" data-gather-pick="query" value="${esc(p.query)}" placeholder="Material name"></label>
        <label class="ag-field">Gathering profession<select data-gather-pick="profession"><option value="node" ${p.profession==='node'?'selected':''}>This node’s (${esc(nodeProf?profLabel(nodeProf):'none')})</option><option value="any" ${p.profession==='any'?'selected':''}>Any</option>${GATHERING_KEYS.map(k=>`<option value="${k}" ${p.profession===k?'selected':''}>${esc(profLabel(k))}</option>`).join('')}</select></label>
        <label class="ag-field">Tier<select data-gather-pick="tier"><option value="node" ${p.tier==='node'?'selected':''}>Up to this node’s (${esc(nodeTier??'—')})</option><option value="any" ${p.tier==='any'?'selected':''}>Any</option>${TIERS.map((t,i)=>`<option value="${i+1}" ${p.tier===String(i+1)?'selected':''}>${i+1} · ${t}</option>`).join('')}</select></label>
        <span class="agl-sub">Rarity: Exotic · Type: Material</span></div>
      ${list.length?`<ul class="agl-exotic-list">${list.map(m=>`<li class="agl-exotic-row${m.unavailable?' is-off':''}"><strong>${esc(m.name)}</strong> <small class="agl-sub">Tier ${m.tier??'—'}</small>
        ${m.unavailable?badge(m.unavailable,'warn'):''}<button type="button" class="ag-btn" data-action="adhoc-exotic-add" data-id="${esc(m.id)}" ${m.unavailable?`disabled title="${esc(m.unavailable)}"`:''}>Add</button></li>`).join('')}</ul>`
        :`<p class="agl-sub">${p.profession==='node'&&!nodeProf?'This node’s skill is not a gathering profession, so no Exotic can be found here. Choose a gathering profession above.':'No imported Exotic materials match. Exotics come from General Manager (approved, player-visible, quality “Exotic”).'}</p>`}
    </fieldset>`;
  }
  _gatherPlayer(){
    const mine=myCharacters(),actor=mine.find(a=>a.id===this.gather.actorId)??mine[0]??null;
    const rolls=[...incomingRolls.values()].filter(r=>mine.some(a=>a.id===r.actorId));
    const rollCards=rolls.map(r=>{const a=game.actors.get(r.actorId);return `<section class="ag-card agl-panel agl-gather-roll"><h2>Your gathering check</h2>
      <p><strong>${esc(r.actorName)}</strong> gathers at ${esc(r.title)} · ${esc(r.summary)}</p>${r.assists.length?`<p class="agl-sub">Assisted by ${esc(r.assists.join(', '))}.</p>`:''}
      ${rollFields(a,r,r.sessionId)}<div class="agl-management-actions"><button type="button" class="ag-btn ag-btn--primary" data-action="gather-player-roll" data-id="${esc(r.sessionId)}"><i class="fa-solid fa-dice-d20"></i> Roll</button></div></section>`;}).join('');
    const where=gatherLocations();
    const party=partyActors().filter(a=>a.id!==actor?.id);
    const nodes=where.locations.map(loc=>`<fieldset class="agl-node-group"><legend>${esc(loc.name)}</legend>${loc.nodes.map(n=>{
      const value=`${loc.id}|${n.id??''}`,ok=n.gatherable&&n.id&&!n.blocked;
      return `<label class="agl-node ${ok?'':'is-off'}"><input type="radio" name="agl-node" data-gather-field="nodeRef" value="${esc(value)}" ${this.gather.nodeRef===value&&ok?'checked':''} ${ok?'':'disabled'}>
        <span><strong>${esc(nodeTitle(n))}</strong> <small>${esc(nodeSummary(n,{forPlayers:true}))}</small>${ok?'':` <small class="agl-reason">${esc(n.blocked||n.why)}</small>`}${n.note?`<small class="agl-sub">${esc(n.note)}</small>`:''}</span></label>`;}).join('')}</fieldset>`).join('');
    const pending=this.gather.pending;
    const blocker=playerBlocker({rosterCount:rosterIds().length,mine:actor?mine.length:0,where});
    return `${rollCards}<section class="ag-card agl-panel"><h2>Request gathering</h2>
      <p class="agl-sub">Pick a gathering spot at a location your party knows. The GM approves it, then the lead gatherer rolls one check for the party. Helpers with suitable tools give advantage, not another attempt.</p>
      ${blocker?`<div class="ag-empty">${esc(blocker)}</div>`
        :`<div class="agl-gather-form">${mine.length>1?`<label class="ag-field">Lead gatherer<select data-gather-field="actorId">${mine.map(a=>`<option value="${esc(a.id)}" ${a.id===actor.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label>`:`<div class="agl-who">${portrait(actor)}<strong>${esc(actor.name)}</strong> leads</div>`}
          ${party.length?`<fieldset class="agl-gather-eligible"><legend>Helpers (optional)</legend>${party.map(h=>`<label><input type="checkbox" data-gather-helper="${esc(h.id)}" ${this.gather.helperIds.includes(h.id)?'checked':''}> ${esc(h.name)}</label>`).join('')}</fieldset>`:''}</div>
          <div class="agl-nodes">${nodes}</div>
          <div class="agl-management-actions"><button type="button" class="ag-btn ag-btn--primary" data-action="gather-request" ${pending?'disabled':''}><i class="fa-solid fa-paper-plane"></i> ${pending?'Waiting for the GM…':'Send request to GM'}</button></div>`}
    </section>`;
  }
  _gatherGM(){
    const party=this.actors,where=gatherLocations(),mats=materialChoices();
    if(!party.length)return rosterIds().length?`<div class="ag-empty">${esc(GATHER_FIX.partyMissing)}</div>`:`<div class="ag-empty">${esc(GATHER_FIX.noParty)} <button type="button" class="ag-btn" data-action="tab" data-id="gm">Open GM Setup →</button></div>`;
    const g=this.gather;
    if(!where.ok)g.source='adhoc';
    const lead=party.find(a=>a.id===g.actorId)??party[0];g.actorId=lead.id;
    const node=this._selectedNode();
    const plan=node?gatherCheckPlan(lead,node):null;
    const helpers=plan?helperInfo(party.filter(a=>a.id!==lead.id),lead,plan):[];
    const sessions=[...gatherSessions.values()].map(s=>{const a=game.actors.get(s.leadId),proj=gatherProjection(s);return `<section class="ag-card agl-panel agl-gather-roll">
      <h2>${esc(s.leadName)} · ${esc(nodeTitle(s.node))}${s.node.locationName?` <small class="agl-sub">at ${esc(s.node.locationName)}</small>`:''}</h2>
      <p>${esc(nodeSummary(s.node))}${proj.assists.length?` · assisted by ${esc(proj.assists.join(', '))}`:''}</p>
      <p class="agl-sub">${s.rollerIds.length?`Waiting for ${esc(nameList(s.rollerIds.map(userById).filter(Boolean)))} to roll. You can also roll for them or record a total.`:'No owner is online: roll for them or record the total.'}</p>
      ${a?rollFields(a,proj,s.id):''}
      <div class="agl-management-actions"><button type="button" class="ag-btn" data-action="gather-cancel" data-id="${esc(s.id)}">Cancel</button>
        <label class="ag-field ag-field--inline">Total <input type="number" min="-20" max="100" step="1" data-gather-total="${esc(s.id)}"></label><button type="button" class="ag-btn" data-action="gather-record" data-id="${esc(s.id)}">Record total</button>
        <button type="button" class="ag-btn ag-btn--primary" data-action="gather-gm-roll" data-id="${esc(s.id)}"><i class="fa-solid fa-dice-d20"></i> Roll for ${esc(s.leadName)}</button></div></section>`;}).join('');
    const last=lastGather?`<div class="agl-note">${esc(lastGather.leadName)} · ${esc(lastGather.title)}: ${lastGather.total} vs DC ${lastGather.dc} — <b>${esc(lastGather.verdict)}</b>${lastGather.award?`, ${lastGather.award.quantity} × ${esc(lastGather.award.name)}${lastGather.award.stacked?` (now ${lastGather.award.total})`:''}`:''}${lastGather.exoticAward?` + Exotic ${esc(lastGather.exoticAward.name)}`:''}${lastGather.exotic?.roll!=null?` · Exotic d100 ${lastGather.exotic.roll} vs ${lastGather.exotic.target} (${lastGather.exotic.kind})`:''}${lastGather.exoticNote?` · <b>${esc(lastGather.exoticNote)}</b>`:''}${lastGather.exhausted==='recorded'?' · node marked exhausted in Locations':lastGather.exhausted==='manual'?' · <b>mark the node exhausted in Locations</b>':lastGather.exhausted==='session'?' · renewable node: blocked until you reload':''}. Award XP from the chat card.</div>`:'';
    const nodeOptions=where.locations.map(loc=>`<optgroup label="${esc(loc.name)}${loc.revealed?'':' (unrevealed)'}">${loc.nodes.map(n=>{const value=`${loc.id}|${n.id??''}`,ok=n.gatherable&&!nodeBusy(n.key),byHand=!n.materialId&&!nodeBusy(n.key);
      return `<option value="${esc(value)}" ${g.nodeRef===value?'selected':''} ${ok||byHand?'':'disabled'}>${esc(nodeTitle(n))} · ${esc(nodeSummary(n)||'no DC')}${n.visible?'':' · hidden from players'}${byHand?' — no material: award by hand':n.blocked?` — ${esc(n.blocked)}`:ok?'':' — in progress'}</option>`;}).join('')}</optgroup>`).join('');
    const a=g.adhoc,matOpts=(selected,blank)=>`${blank?`<option value="">${blank}</option>`:''}${mats.map(i=>`<option value="${esc(agSourceId(i))}" ${selected===agSourceId(i)?'selected':''}>${esc(i.name)}</option>`).join('')}`;
    const gatherSkills=Array.isArray(locationsApi()?.GATHERING?.skills)?locationsApi().GATHERING.skills:GATHERING_PROFESSIONS;
    const skillChoices=[...gatherSkills.map(p=>[p,p]),...SKILL_IDS.map(k=>[k,skillLabel(k)])];
    const form=g.source==='adhoc'?`<div class="agl-gather-form">
       <label class="ag-field">Label<input data-gather-adhoc="label" maxlength="80" value="${esc(a.label)}" placeholder="e.g. Roadside herb patch"></label>
       <label class="ag-field">Skill / profession<select data-gather-adhoc="skill">${skillChoices.map(([v,l])=>`<option value="${esc(v)}" ${a.skill===v?'selected':''}>${esc(l)}</option>`).join('')}</select></label>
       <label class="ag-field">Tier<select data-gather-adhoc="tier">${TIERS.map((t,i)=>`<option value="${i+1}" ${String(a.tier)===String(i+1)?'selected':''}>${i+1} · ${t}</option>`).join('')}</select></label>
       <label class="ag-field">DC<input data-gather-adhoc="dc" type="number" min="1" max="40" step="1" value="${esc(a.dc)}" placeholder="Default for tier: ${defaultDC(a.tier)}"></label>
       <label class="ag-field">Common material<select data-gather-adhoc="materialId">${matOpts(a.materialId,'Choose…')}</select></label>
       <label class="ag-field">Common quantity<input data-gather-adhoc="quantity" type="number" min="1" max="99" step="1" value="${esc(a.quantity)}"></label>
       <label class="ag-field">Rare material (success by 5+)<select data-gather-adhoc="rareMaterialId">${matOpts(a.rareMaterialId,'None — common instead')}</select></label>
       <label class="ag-field">Rare quantity<input data-gather-adhoc="rareQuantity" type="number" min="1" max="99" step="1" value="${esc(a.rareQuantity)}"></label></div>
       ${this._exoticPicker(node)}
       ${mats.length?'':'<div class="agl-note warn">Import at least one approved, player-visible material with General Manager first.</div>'}`
      :`<label class="ag-field">Gathering node<select data-gather-field="nodeRef"><option value="">Choose a node…</option>${nodeOptions}</select></label>
       ${where.locations.length?'':'<div class="ag-empty">No gathering resources in Locations yet.</div>'}`;
    const blocker=g.source==='adhoc'&&node&&!node.materialId?'Choose a common material for the ad-hoc node.'
      :startBlocker({rosterCount:rosterIds().length,partyCount:party.length,leadInParty:true,node,materialFound:Boolean(node&&worldMaterial(node.materialId)),busy:Boolean(node)&&nodeBusy(node.key)});
    const ready=!blocker;
    return `${sessions}${last}<section class="ag-card agl-panel"><h2>Start gathering</h2>
      <p class="agl-sub">One lead gatherer, one check per node for the party. Helpers with suitable tools give advantage, not another attempt. Success gives one common bundle; success by 5+ gives one rare bundle instead. A success can also find one Exotic when the node has Exotic candidates (only an awarded Exotic is shown to players). Failure exhausts the node. Players can also request a node from their Gathering tab.</p>
      <div class="agl-segmented" role="group" aria-label="Node source"><button type="button" class="ag-btn ${g.source!=='adhoc'?'active':''}" data-action="gather-source" data-id="location" ${where.ok?'':`disabled title="${esc(where.reason)}"`}>Location node</button><button type="button" class="ag-btn ${g.source==='adhoc'?'active':''}" data-action="gather-source" data-id="adhoc">Ad-hoc node</button></div>
      ${where.ok?'':`<p class="agl-sub">${esc(where.reason)} Ad-hoc nodes still work.</p>`}
      ${form}
      ${node?`<p class="agl-sub">${esc(nodeSummary(node))} · common ${node.quantity} × ${esc(node.materialId?materialName(node.materialId):'—')}${node.rareMaterialId?` · rare ${node.rareQuantity} × ${esc(materialName(node.rareMaterialId))}`:''}${node.finite?' · finite':''}${node.note&&node.materialId?` · ${esc(node.note)}`:''}</p>
        ${g.source!=='adhoc'&&exoticSummary(node)?`<p class="agl-sub">${esc(exoticSummary(node))}</p>`:''}
        `:''}
      <div class="agl-gather-form">
        <label class="ag-field">Lead gatherer<select data-gather-field="actorId">${party.map(p=>`<option value="${esc(p.id)}" ${p.id===lead.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>
        ${plan?`<div class="agl-sub">${esc(lead.name)}: ${plan.options.slice(0,2).map(o=>{const c=checkOption(lead,o);return `${esc(c.label)} ${formatBonus(c.bonus)}`;}).join(' · ')}${plan.professionId?'':` · no ${esc(plan.profession||'matching')} profession feature (no XP target)`}</div>`:'<div></div>'}
        ${helpers.length?`<fieldset class="agl-gather-eligible"><legend>Helpers</legend>${helpers.map(h=>`<label title="${esc(h.reason)}"><input type="checkbox" data-gather-helper="${esc(h.id)}" ${g.helperIds.includes(h.id)?'checked':''}> ${esc(h.name)} ${badge(h.eligible?'Advantage':h.reason,h.eligible?'ok':'muted')}</label>`).join('')}</fieldset>`:''}
      </div>
      ${blocker?`<p class="agl-reason" role="status">${esc(blocker)}</p>`:''}
      <div class="agl-management-actions"><button type="button" class="ag-btn ag-btn--primary" data-action="gather-start" ${ready?'':'disabled'}><i class="fa-solid fa-seedling"></i> Start gathering check</button></div>
    </section>`;
  }
  async _prepareContext(options){checkPlayerLedger();const ctx=await super._prepareContext(options);
    this.demo=false;
    this.view=LEGACY_VIEWS[this.view]??this.view;
    if(!game.user.isGM){this.rosterDraft=null;if(GM_VIEWS.has(this.view))this.view='individual';}
    const lib=this.library;
    const content=({individual:()=>this._individual(lib),party:()=>this._party(lib),catalog:()=>this._catalog(lib),gathering:()=>this._gathering(),assign:()=>this._assign(),gm:()=>this._gmSetup(),help:()=>this._help()})[this.view]?.()??this._individual(lib);
    const inGm=game.user.isGM&&this.view==='gm';
    return {...ctx,html:`<div class="agl-shell"><header class="ag-header agl-header"><div class="ag-header__title agl-title">Ashen Gate | <strong>Profession Ledger</strong></div>
      <div class="ag-header__meta agl-header-right"><span class="agl-version">v${esc(game.modules.get(ID)?.version??VERSION)}</span><button type="button" class="ag-btn" data-action="help">Help</button></div>
      <input id="agl-file" type="file" accept="application/json,.json" hidden></header>
      <nav class="ag-tabs agl-tabs" aria-label="Profession Ledger views">${this._tabs()}</nav><main class="agl-main">${content}</main>
      <footer class="ag-footer agl-footer">${inGm?`<button type="button" class="ag-btn" data-action="gm-cancel">Cancel</button><span class="agl-footer-status" data-agl-roster-status>${this.setupStatus}</span><button type="button" class="ag-btn ag-btn--primary" data-action="roster-save" ${this.rosterDirty||this.mapDirty?'':'disabled'}>Save Changes</button>`
        :`<span class="agl-footer-status">${esc(this.notice||'')}</span>`}
      </footer></div>`};
  }
  async _onRender(context,options){await super._onRender(context,options);if(!canOpenLedger()){await this.close?.({animate:false});return;}openLedgerWindows.add(this);this._events?.abort();this._events=new AbortController();
    const signal=this._events.signal;
    this.element.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b||b.disabled)return;if(b.closest('summary'))e.preventDefault();void this._click(b.dataset.action,b.dataset.id,b.dataset);},{signal});
    this.element.querySelector('#agl-file')?.addEventListener('change',e=>this._upload(e),{signal});
    this.element.querySelector('#agl-xwalk-file')?.addEventListener('change',e=>this._uploadBaseline(e),{signal});
    this.element.addEventListener('toggle',e=>{const key=e.target?.dataset?.folder;if(!key||this.query)return;if(e.target.open)this.closedFolders.delete(key);else this.closedFolders.add(key);},{signal,capture:true});
    this.element.addEventListener('change',e=>{
      if(e.target?.matches?.('[data-agl-actor]')){this.actorId=e.target.value;this.render();return;}
      if(e.target?.matches?.('[data-gather-helper]')){
        const id=e.target.dataset.gatherHelper,next=new Set(this.gather.helperIds);
        if(e.target.checked)next.add(id);else next.delete(id);
        this.gather.helperIds=[...next];if(game.user.isGM)this.render();return;
      }
      if(e.target?.matches?.('[data-gather-field]')){const f=e.target.dataset.gatherField;if(['actorId','nodeRef'].includes(f)){this.gather[f]=e.target.value;if(f==='actorId')this.gather.helperIds=this.gather.helperIds.filter(id=>id!==e.target.value);this.render();}return;}
      if(e.target?.matches?.('[data-gather-adhoc]')&&game.user.isGM){this.gather.adhoc[e.target.dataset.gatherAdhoc]=e.target.value;this.render();return;}
      if(e.target?.matches?.('[data-gather-pick]')&&game.user.isGM){this.gather.pick[e.target.dataset.gatherPick]=e.target.value;this.render();return;}
      if(e.target?.matches?.('[data-adhoc-exotic]')&&game.user.isGM){
        const id=e.target.dataset.adhocExotic,k=e.target.dataset.exoticKey,entry=this.gather.adhoc.exotics.find(x=>x.materialId===id);
        if(entry&&['mode','chance','condition'].includes(k)){entry[k]=e.target.value;this.gather.adhoc.exotics=normalizeExotics(this.gather.adhoc.exotics.map(x=>x===entry?{chance:'',...x}:x));}
        this.render();return;}
      if(e.target?.matches?.('[data-core-award]')&&game.user.isGM){this.coreAwardDraft=e.target.checked;this._syncRosterActions();return;}
      if(e.target?.matches?.('[data-exotic-chance]')&&game.user.isGM){this.exoticDraft=e.target.value;this._syncRosterActions();return;}
      if(e.target?.matches?.('[data-map-tool],[data-map-skill],[data-map-list],[data-map-items]')&&game.user.isGM){this._rememberMapDraft(e.target);return;}
      if(e.target?.matches?.('[data-assign-target]')&&game.user.isGM){this.assignState={target:e.target.value,preview:null,selected:new Set()};this.render();return;}
      if(e.target?.matches?.('[data-assign-row]')&&game.user.isGM){const id=e.target.dataset.assignRow;if(e.target.checked)this.assignState.selected.add(id);else this.assignState.selected.delete(id);this.render();return;}
      if(e.target?.matches?.('[data-roster-actor]')&&game.user.isGM)this._rememberRosterDraft();
    },{signal});
    this.element.querySelector('[data-agl-search]')?.addEventListener('input',e=>{this.query=e.target.value;this._applySearch();},{signal});
    this._applySearch();this._syncRosterActions();}
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
        this.view=next;this.render();return;}
      if(action==='help'){this.previousView=this.view;this.view='help';this.render();return;}
      if(action==='help-back'){this.view=(!game.user.isGM&&GM_VIEWS.has(this.previousView))?'individual':this.previousView;this.render();return;}
      if(action==='gm-cancel'){if(!game.user.isGM)throw Error('GM only');if(!await this._leaveGmSetup())return;this.view='individual';this.render();return;}
      if(action==='actor'||action==='open-individual'){if(!myCharacters().some(a=>a.id===id))throw Error('You can only open your own character');this.actorId=id;this.view='individual';this.render();return;}
      if(action==='party-sort'){this.partySort=id==='profession'?'profession':'player';this.render();return;}
      if(action==='demo')throw Error('Demonstration mode was removed. Use an isolated test world with imported source definitions.');
      if(action==='xwalk-import'){requireCrosswalkGM();this.element.querySelector('#agl-xwalk-file')?.click();return;}
      if(action==='xwalk-cancel'){this.baselinePreview=null;this.render();return;}
      if(action==='xwalk-apply'){requireCrosswalkGM();const p=this.baselinePreview;if(!p)throw Error('Import a baseline file first');
        const out=await applyBaseline(p.data,{fileName:p.fileName});this.baselinePreview=null;
        this.notice=`Baseline file applied: ${out.professions} profession${out.professions===1?'':'s'}. Your own edits still win.`;say(this.notice);this.render();return;}
      if(action==='xwalk-export'){const data=exportCurrentCrosswalk();
        const save=globalThis.foundry?.utils?.saveDataToFile??globalThis.saveDataToFile;
        if(typeof save!=='function')throw Error('This Foundry version cannot download files here');
        save(JSON.stringify(data,null,2),'application/json',`ag-profession-crosswalk-${data.exportedAt.slice(0,10)}.json`);return;}
      if(action==='map-reset'){if(!game.user.isGM)throw Error('GM only');this.mapDraft??=mappingDraft(checkMapping());for(const l of CROSSWALK_LISTS)delete this.mapDraft[l][id];this.render();return;}
      if(action==='assign-preview'){requireAssignGM();const a=this.assignState;
        a.preview=assignPreview({actorIds:a.target==='party'?null:[a.target]});a.selected=new Set(a.preview.rows.filter(r=>r.status==='propose').map(r=>r.id));this.render();return;}
      if(action==='assign-apply'){requireAssignGM();const a=this.assignState;if(!a.preview)throw Error('Preview first');
        const rows=a.preview.rows.filter(r=>r.status==='propose'&&(id==='all'||a.selected.has(r.id)));
        if(!rows.length)throw Error('Nothing selected to add');
        const ok=await DialogV2.confirm({window:{title:'Add profession features?'},modal:true,rejectClose:false,
          content:`<p>Add these profession features:</p><ul>${rows.map(r=>`<li><strong>${esc(r.actorName)}</strong>: ${esc(r.profession)} <small>(${esc(r.reason)})</small></li>`).join('')}</ul><p>XP, levels, Skill Tree perks and existing Items are not changed.</p>`});
        if(!ok)return;
        const out=await assignProfessions({actorIds:a.target==='party'?null:[a.target],rowIds:rows.map(r=>r.id)});
        a.preview=assignPreview({actorIds:a.target==='party'?null:[a.target]});a.selected=new Set();
        this.notice=`Added ${plural(out.added.length,'profession feature')}${out.skipped.length?`; ${out.skipped.length} skipped (already there)`:''}.`;this.render();say(this.notice);return;}
      if(action==='toggle-player-access'){if(!game.user.isGM)throw Error('GM only');const next=!playerAccessEnabled();await setPlayerAccess(game,ID,next);this.notice=`Player interface ${next?'visible':'hidden'}. Actor progression and known recipes are unchanged.`;this.render();say(this.notice);return;}
      if(action==='manager'){if(!game.user.isGM)throw Error('GM only');const m=game.modules.get('ashen-gate-manager');const api=m?.active?m.api:null;if(api?.open)api.open();else say('Ashen Gate Manager is not enabled.',true);return;}
      if(action==='skilltree'){const module=game.modules.get('ashen-gate-skill-trees');const api=module?.active?module.api:null;
        if(!api?.open){say('Skill Trees prototype is not enabled.',true);return;}
        const tree=api.listTrees?.()?.find(t=>norm(professionFromTreeName(t.name))===norm(id));api.open({actorId:this.actorId,treeId:tree?.id});return;}
      if(action==='roster-all'||action==='roster-clear'){if(!game.user.isGM)throw Error('GM only');
        for(const input of this.element.querySelectorAll('[data-roster-actor]')){const a=game.actors.get(input.dataset.rosterActor);input.checked=action==='roster-all'?Boolean(a?.hasPlayerOwner):false;}this._rememberRosterDraft();return;}
      if(action==='roster-save'){if(!game.user.isGM)throw Error('GM only');
        const ids=[...this.element.querySelectorAll('[data-roster-actor]:checked')].map(el=>el.dataset.rosterActor).filter(id=>game.actors.get(id)?.type==='character');
        const saved=[];
        if(this.rosterDirty||(!this.mapDirty&&!this.exoticDirty&&!this.coreAwardDirty)){await game.settings.set(ID,'partyRoster',ids);saved.push(`party: ${plural(ids.length,'character')}`);}
        if(this.mapDirty){await game.settings.set(ID,'checkMapping',structuredClone(this.mapDraft));saved.push('tools and checks');}
        if(this.exoticDirty){const pct=clampPercent(this.exoticDraft,exoticPercent());await game.settings.set(ID,EXOTIC_SETTING,pct);saved.push(`Exotic discovery ${pct}%`);}
        if(this.coreAwardDirty){await game.settings.set(ID,CORE_AWARD_SETTING,this.coreAwardDraft);saved.push(`core item awards ${this.coreAwardDraft?'on':'off'}`);}
        this.rosterDraft=null;this.mapDraft=null;this.exoticDraft=null;this.coreAwardDraft=null;this.notice=`Saved ${saved.join('; ')}.`;this.render();say(this.notice);return;}
      if(['learn-recipe','craft','award-xp','adjust-xp'].includes(action)){
        const actorId=data.actor??(String(id).includes(':')?String(id).split(':')[0]:this.actor?.id);
        const input=action==='award-xp'?this.element?.querySelector?.(`[data-xp-input="${id}"]`):null;
        const q=n=>this.element?.querySelector?.(`[data-xp-${n}="${id}"]`)?.value;
        const out=await performAction(action,{id,actorId,points:input?.value,delta:action==='adjust-xp'?q('delta'):null,set:action==='adjust-xp'?q('set'):null,reason:action==='adjust-xp'?q('reason'):''});
        if(!out)return;
        if(out.award)this.lastAward=out.award;
        this.notice=out.message;this.render();say(out.message,out.ok===false);return;}
      if(action==='adhoc-exotic-add'||action==='adhoc-exotic-remove'){if(!game.user.isGM)throw Error('GM only');
        if(action==='adhoc-exotic-add'){const why=materialUnavailable(id);if(why)throw Error(why);}
        const list=this.gather.adhoc.exotics.filter(x=>x.materialId!==id);
        this.gather.adhoc.exotics=normalizeExotics(action==='adhoc-exotic-add'?[...list,{materialId:id,mode:'discovery'}]:list);this.render();return;}
      if(action==='gather-source'){if(!game.user.isGM)throw Error('GM only');this.gather.source=id==='adhoc'?'adhoc':'location';this.render();return;}
      if(action==='gather-start'){if(!game.user.isGM)throw Error('GM only');
        const session=await startGather({node:this._selectedNode(),leadId:this.gather.actorId,helperIds:this.gather.helperIds});
        this.gather.nodeRef='';this.gather.helperIds=[];
        this.notice=session.rollerIds.length?`Gathering check sent to ${session.leadName}’s player.`:`No owner of ${session.leadName} is online: roll for them below.`;this.render();say(this.notice);return;}
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
      if(action==='import'){if(!game.user.isGM)throw Error('GM only');this.element.querySelector('#agl-file')?.click();return;}
    }catch(e){console.error(`[${ID}]`,e);say(`Profession Ledger: ${e.message}`,true);}}
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
  _rememberMapDraft(el){
    this.mapDraft??=mappingDraft(checkMapping());
    if(el.dataset.mapTool)this.mapDraft.tools[el.dataset.mapTool]=el.value;
    if(el.dataset.mapSkill)this.mapDraft.skills[el.dataset.mapSkill]=el.value;
    if(el.dataset.mapItems){const k=el.dataset.mapItems,next=String(el.value??'').split(',').map(v=>v.trim()).filter(Boolean);
      const current=crosswalkInfo(this.mapDraft).map.items[k]??[];
      if(this.mapDraft.items?.[k]||JSON.stringify(next)!==JSON.stringify(current)){this.mapDraft.items??={};this.mapDraft.items[k]=next;}}
    if(el.dataset.mapList){
      const list=el.dataset.mapList,k=el.dataset.mapProf;
      const current=this.mapDraft[list][k]??(list==='advantageTools'?baselineLayer()?.[k]?.advantageTools??[]:crosswalkInfo(this.mapDraft).map[list][k]??[]);
      const next=el.checked?[...new Set([...current,el.value])]:current.filter(v=>v!==el.value);
      this.mapDraft[list][k]=next;
      // Keep the picker open: refresh only its summary.
      const summary=el.closest?.('details')?.querySelector?.('summary');
      if(summary)summary.textContent=next.length?next.map(list==='qualifySkills'?skillLabel:toolLabel).join(', '):'None';
    }
    this._syncRosterActions();
  }
  get setupStatus(){const n=[this.rosterDirty,this.mapDirty,this.exoticDirty,this.coreAwardDirty].filter(Boolean).length;
    return n>1?'Unsaved changes':this.rosterDirty?'Unsaved party changes':this.mapDirty?'Unsaved tool and check changes':this.exoticDirty?'Unsaved Exotic discovery change':this.coreAwardDirty?'Unsaved crafted-item change':'All changes saved';}
  _syncRosterActions(){
    const save=this.element?.querySelector?.('[data-action="roster-save"]');
    if(save)save.disabled=!this.rosterDirty&&!this.mapDirty&&!this.exoticDirty&&!this.coreAwardDirty;
    const status=this.element?.querySelector?.('[data-agl-roster-status]');
    if(status)status.textContent=this.setupStatus;
  }
  async _leaveGmSetup(){
    if(!this.rosterDirty&&!this.mapDirty&&!this.exoticDirty&&!this.coreAwardDirty){this.rosterDraft=null;this.mapDraft=null;this.exoticDraft=null;this.coreAwardDraft=null;return true;}
    const discard=await DialogV2.confirm({window:{title:'Discard unsaved GM Setup changes?'},
      content:'<p>Your party or tool changes have not been saved. Discard these changes and leave GM Setup?</p>',modal:true,rejectClose:false});
    if(!discard)return false;
    this.rosterDraft=null;this.mapDraft=null;this.exoticDraft=null;this.coreAwardDraft=null;return true;
  }
  /** GM: read a baseline file and show its preview; nothing is saved until Apply baseline. */
  async _uploadBaseline(e){if(!game.user.isGM)return;const f=e.target.files?.[0];if(!f)return;
    try{const data=JSON.parse(await f.text());this.baselinePreview={fileName:f.name??'',data,result:previewBaseline(data)};this.render();}
    catch(err){say(`Baseline file not read: ${err.message}`,true);}finally{if(e.target)e.target.value='';}}
  async _upload(e){checkPlayerLedger();if(!game.user.isGM)return;const f=e.target.files?.[0];if(!f)return;
    try{const data=normalizeLibrary(JSON.parse(await f.text()));const approved=await DialogV2.confirm({window:{title:'Import Ledger Catalog'},
      content:`<p>Source format: <b>${esc(data.sourceSchema)}</b>.</p><p>Import <b>${data.recipes.length} Recipes</b> and <b>${data.materials.length} Materials</b> into the Ledger's <b>world-visible read-only catalog</b>?</p><p>${data.importSummary.skippedRestricted} restricted/inactive entries excluded; ${data.importSummary.unmappedRecipes} recipes have no verified structured ingredients and cannot be crafted.</p><p>This REPLACES the previous Ledger catalog. It will not create or alter Foundry Items, Actor progression, or inventories. <strong>Only player-visible records may be stored here.</strong></p>`,modal:true,rejectClose:false});
      if(!approved)return;await game.settings.set(ID,'libraryData',data);this.query='';this.notice=`Imported ${data.recipes.length} recipe definitions and ${data.materials.length} materials (${data.importSummary.skippedRestricted} restricted excluded; ${data.importSummary.unmappedRecipes} recipes unmapped).`;this.render();say('Profession Ledger catalog loaded. No world Items were modified.');
    }catch(err){console.error(err);say(`Ledger import failed: ${err.message}`,true);}}
}

/** Tidy5e "Professions" tab: the same crafting panel, rendered into the sheet. */
function renderSheetTab(params){
  const root=params?.tabContentsElement??params?.element;
  const target=root?.matches?.('[data-agl-sheet-tab]')?root:(root?.querySelector?.('[data-agl-sheet-tab]')??root);
  const actor=params?.app?.actor??params?.app?.document??params?.data?.actor;
  if(!target||!actor)return;
  if(!canOpenLedger()){target.innerHTML='<div class="ag-empty">The GM has hidden the Profession Ledger.</div>';return;}
  target.innerHTML=`<div class="agl-sheet ag-app"><div class="agl-sheet-head"><strong>Professions</strong><button type="button" class="ag-btn ag-btn--sm" data-action="open-ledger">Open Profession Ledger</button></div>${characterPanel(actor,catalog(),{surface:'sheet'})}</div>`;
  if(target.dataset.aglBound)return;
  target.dataset.aglBound='1';
  target.addEventListener('click',async e=>{
    const b=e.target.closest?.('[data-action]');if(!b||b.disabled||!target.contains(b))return;
    e.preventDefault();e.stopPropagation();
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
    element.innerHTML=refusal?`<div class="ag-empty">${esc(refusal)}</div>`
      :`<div class="agl-sheet agl-embed__body">${characterPanel(actor,catalog(),{surface:'sheet'})}</div>`;
  };
  ctrl.unmount=()=>{if(!ctrl.mounted)return;ctrl.mounted=false;abort.abort();embeds.delete(ctrl);element.innerHTML='';element.classList?.remove('agl-embed');};
  element.addEventListener('click',async e=>{
    const b=e.target?.closest?.('[data-action]');if(!b||b.disabled||!element.contains(b))return;
    if(b.closest?.('summary'))e.preventDefault?.();
    e.stopPropagation?.();
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
  game.settings.register(ID,'partyRoster',{name:'Active party Actor IDs',scope:'world',config:false,type:Array,default:[],onChange:()=>{if(current?.rendered)current.render();}});
  game.settings.registerMenu(ID,'open',{name:'Ashen Gate Profession Ledger',label:'Open Profession Ledger',
    hint:'Professions, materials, recipes and crafting for your character and party. Player interface visibility is GM-controlled.',icon:'fa-solid fa-book-open',type:LedgerApp,restricted:false});
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
    /** Gathering: start/resolve/cancel are GM-only; request is a player asking the GM. */
    gathering:{nodes:()=>{checkPlayerLedger();return structuredClone(gatherLocations());},
      start:({locationId=null,nodeId=null,node=null,leadId,helperIds=[]}={})=>{checkPlayerLedger();
        const target=node?normalizeNode({dcVisible:true,...node,id:`adhoc-${newId()}`},{locationId:null}):findNode(locationId,nodeId).node;return startGather({node:target,leadId,helperIds});},
      resolve:(sessionId,result)=>resolveGather(sessionId,result),cancel:sessionId=>cancelGather(sessionId),
      request:options=>requestGather(options),
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
    /** GM only (0.20.0): baseline file import (preview, then apply) and export of the current crosswalk table. */
    crosswalk:{previewBaseline:data=>structuredClone(previewBaseline(data)),applyBaseline:(data,options)=>applyBaseline(data,options),
      exportTable:()=>exportCurrentCrosswalk(),baseline:()=>{requireCrosswalkGM();return structuredClone(baselineRecord());}},
    hooks:{xpOpportunity:XP_HOOK,progressionChanged:PROGRESSION_HOOK},
    embed:{contract:'ag-ledger-embed/1',modes:[...EMBED_MODES],mount:mountEmbed},
    version:VERSION,source:'Actor inventories, Manager tagged Items, and optional Ledger catalog'};
  game.socket?.on?.(SOCKET,(message,senderId)=>void onSocket(message,senderId));
  const refresh=()=>{if(current?.rendered)current.render();refreshEmbeds();};
  for(const hook of ['updateActor','createItem','updateItem','deleteItem'])Hooks.on(hook,refresh);
  // Handle Actor Directory already rendered before ready hook ran.
  addActorDirectoryLauncher(globalThis.ui?.actors, globalThis.ui?.actors?.element);
  console.info(`[${ID}] v${VERSION} ready. Open from the Actors directory, Module Settings or game.modules.get('${ID}').api.open()`);
});

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
  startGather,resolveGather,cancelGather,setExoticRoll:fn=>{exoticRoll=fn??defaultRoll;},handleGatherRequest,receiveGatherRoll,gatherSessions,decorateChatCard,awardXpFromCard,undoAwardFromCard,adjustXP,gatherLocations};
