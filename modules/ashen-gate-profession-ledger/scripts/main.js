import {SCHEMA,norm,professionFromTreeName,classify,normalizeRecipe,normalizeLibrary,
  sourceVisibility,sourceAvailableToPlayer,agSourceId,quantity} from './core.mjs';
import {GATHERING_PROFESSIONS,TIERS,ACCESS_LEVELS,gatherXP,knownRecipesOf,canLearnRecipe,progressOf,emptyProgress,
  nextProgress,isMaterialAwardCandidate,xpForLevel} from './progression.mjs';
import {PLAYER_ACCESS_CONTRACT,PLAYER_ACCESS_SETTING,playerAccessAllowed,assertPlayerAccess,accessState,setPlayerAccess} from './player-access.mjs';
import {lookupWorldDefinition,readWorldDefinition} from './definition-lookup.mjs';
import {planCraft,craftBlockers,executeCraft,resultItemData,materialStock,tierLabel,ConsentBroker} from './crafting.mjs';
import {launcherRoot,mountLauncher} from './ag-launchers.mjs';
const ID='ashen-gate-profession-ledger';
const VERSION='0.9.0';
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

/** React on all clients. Neither hiding nor revealing mutates Actor/campaign state. */
function syncLedgerPlayerAccess(enabled){
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
const GM_VIEWS=new Set(['gm']);
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
async function awardXP(actor,profId,points){
  if(!game.user.isGM)throw Error('Only the GM can award Profession XP');
  if(!actor||!linkedProfession(actor,profId))throw Error('Actor must own a matching Manager-tagged PROF-* Profession Item');
  const key=`${actor.id}:${profId}`;
  if(xpLocks.has(key))throw Error('Profession XP award already in progress');
  xpLocks.add(key);
  try {const before=actor.flags?.[ID]?.professionProgress??emptyProgress();const result=nextProgress(before,profId,points);
    await actor.setFlag(ID,'professionProgress',result.state);
    try{await syncProfessionSheet(actor,profId);}catch(err){console.warn(`[${ID}] XP saved; sheet description not updated`,err);}
    return result;
  }finally{xpLocks.delete(key);}
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
/** The GM confirms a checked result and a specific already-imported player-safe Material Item. */
async function awardGatheringItem(actor,worldItem,qty){
  if(!game.user.isGM)throw Error('Only GM can confirm gathering awards');
  if(!actor||!worldItem||!materialChoices().some(i=>i.id===worldItem.id))throw Error('Selected material is not an eligible Manager-imported MAT-* Item');
  if(!Number.isSafeInteger(qty)||qty<1||qty>99)throw Error('Gathering quantity must be 1–99');
  const data=worldItem.toObject();
  delete data._id;delete data.id;delete data.folder;delete data.sort;delete data.uuid;
  data.system={...(data.system??{}),quantity:qty};
  data.flags={...(data.flags??{}),[ID]:{...(data.flags?.[ID]??{}),entityType:'Material',sourceId:agSourceId(worldItem)}};
  const created=await actor.createEmbeddedDocuments('Item',[data]);
  if(!created?.length)throw Error('Foundry did not confirm an awarded Item');
  return created[0];
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
function professionCard(actor,p,{lastAward=null}={}){
  const gm=game.user.isGM;
  const flash=lastAward&&lastAward.actorId===actor.id&&lastAward.profId===p.sourceId;
  return `<div class="ag-card agl-prof ${flash?'agl-flash':''}">
    <div class="agl-prof-head"><strong>${esc(p.name)}</strong>${badge(`Level ${p.level}`,'ok')}${gm&&p.draft?badge('Draft','warn'):''}${flash?badge(`+${lastAward.points} XP`,'recipe'):''}</div>
    <div class="agl-xpbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.percent}"><span style="width:${p.percent}%"></span></div>
    <div class="agl-sub">${esc(p.tier)} · ${p.xp} XP${p.toNext!==null?` · ${p.toNext} XP to level ${p.level+1}`:' · maximum level'}${p.tracked?'':' · no XP awarded yet'}</div>
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
    const out=await runCraft(crafter,recipe,again.allocations,result,actor=>actor.id===crafter.id||approved.has(actor.id)||userOwns(requester,actor));
    return reply(true,`${crafter.name} crafted ${out.created?.name??result.name}.`);
  }catch(err){return reply(false,err.message);}
}
async function runCraft(crafter,recipe,allocations,result,allowed){
  if(craftLocks.has(crafter.id))throw Error(`${crafter.name} is already crafting`);
  craftLocks.add(crafter.id);
  try{
    const out=await executeCraft({crafter,recipe,allocations,resultId:recipe.resultItemId,
      resultData:resultItemData(result,{recipeId:recipe.id,resultId:recipe.resultItemId}),
      actorOf:id=>game.actors?.get?.(id),canWrite:actor=>owned(actor)&&allowed(actor)});
    await craftChatCard(crafter,recipe,result,out.consumed);
    return out;
  }finally{craftLocks.delete(crafter.id);}
}
async function craftChatCard(crafter,recipe,result,consumed){
  if(typeof globalThis.ChatMessage?.create!=='function')return;
  const used=consumed.map(c=>`<li>${c.quantity} × ${esc(c.name)}${c.actorId!==crafter.id?` <em>(from ${esc(c.actorName)})</em>`:''}</li>`).join('');
  try{await ChatMessage.create({speaker:ChatMessage.getSpeaker?.({actor:crafter}),content:`<div class="agl-chat-card">
    <header>${result?.img?`<img src="${esc(result.img)}" alt="" width="36" height="36">`:''}<div><strong>${esc(crafter.name)} crafted ${esc(result?.name??recipe.name)}</strong><span>${esc(professionLabel(recipe))}${recipe.tier?` · ${esc(tierLabel(recipe.tier))}`:''}</span></div></header>
    <p>Used:</p><ul>${used}</ul>${extraCost(recipe)?`<p class="agl-chat-note">The recipe also lists ${extraCost(recipe)} gp of additional cost (not deducted automatically).</p>`:''}</div>`});}
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
  if(confirm){
    const ok=await DialogV2.confirm({window:{title:`Craft ${recipe.name}?`},modal:true,rejectClose:false,
      content:`<p>${esc(actor.name)} crafts <strong>${esc(ctx.result.name)}</strong>, using:</p><ul>${list}</ul>${foreign.length?`<p>${esc(foreign.join(', '))}’s owner${foreign.length===1?'':'s'} will be asked on their screen. Any decline cancels the craft and nothing is used.</p>`:''}`});
    if(!ok)return null;
  }
  if(!ctx.plan.foreign.length){
    const out=await runCraft(actor,recipe,ctx.plan.allocations,ctx.result,()=>true);
    return {ok:true,message:`${actor.name} crafted ${out.created?.name??ctx.result.name}.`};
  }
  const request={type:'craft-request',requestId:newId(),requesterId:game.user.id,crafterId:actor.id,recipeId};
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

/** Learn / Craft / Award XP, shared by the Ledger window and the sheet tab. Returns {message} or null if cancelled. */
async function performAction(action,{id,actorId,points}){
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
    await awardXP(actor,id,amount);
    const after=progressOf(actor,id),name=professionsOf(actor).find(p=>p.sourceId===id)?.name??humanizeId(id);
    const levelUp=after.level>(before?.level??1);
    const message=`${actor.name}: +${amount} ${name} XP → ${after.xp} XP, level ${after.level}${levelUp?' (level up!)':''}.`;
    const recipients=[...new Set(allUsers().filter(u=>u.isGM||actor.testUserPermission?.(u,'OWNER')).map(u=>u.id))];
    try{await globalThis.ChatMessage?.create?.({whisper:recipients,speaker:ChatMessage.getSpeaker?.({actor}),content:`<div class="agl-chat-card"><header><div><strong>${esc(actor.name)} gained ${amount} ${esc(name)} XP</strong><span>Now level ${after.level} (${esc(after.tier)}) · ${after.xp} XP${levelUp?' · Level up!':''}</span></div></header></div>`});}
    catch(err){console.warn(`[${ID}] XP saved; chat note failed`,err);}
    return {message,award:{actorId:actor.id,profId:id,points:amount}};
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
    this.gather={actorId:null,profession:'Herbalism',eligibleProfessions:[...GATHERING_PROFESSIONS],tier:'Apprentice',dc:12,rollTotal:'',qty:1,materialId:'',locationId:'',preview:null};this.gatherBusy=false;
  }
  get actors(){return partyActors();}
  get library(){return catalog();}
  get actor(){const mine=myCharacters();return mine.find(a=>a.id===this.actorId)??mine[0]??null;}
  _tabs(){const names=[['individual','Individual'],['party','Party'],['catalog','Recipe Catalog'],['gathering','Gathering'],...(game.user.isGM?[['gm','GM Setup']]:[])];
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
  _catalog(lib){
    const gm=game.user.isGM,party=this.actors;
    const {known,found}=partyRecipes(party);
    const recipes=gm?lib.recipes:[...new Set([...known.keys(),...found.keys()])].map(id=>partyRecipeDefinition(id,lib)).filter(Boolean);
    const rows=recipes.map(r=>({group:professionLabel(r),html:recipeRow(r,lib,{knownBy:known.get(r.id)??[],foundBy:(found.get(r.id)??[]).map(x=>x.actor)})}));
    const hidden=gm?lib.recipes.filter(hiddenFromPlayers).length:0;
    return `<div class="ag-toolbar agl-toolbar">${this._search('Search recipes, professions or results')}</div>
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
    const manager=game.modules.get('ashen-gate-manager');
    const canOpen=Boolean(manager?.active&&typeof manager.api?.open==='function');
    return `<div class="agl-gm-setup">
      ${this._roster()}
      <section class="ag-card agl-panel"><h2>Player Access</h2>
        <p class="agl-sub">${playerAccessEnabled()?'Visible':'Hidden'} to players. This controls the Actors launcher, Ledger window and sheet tab only; it never changes Profession XP, known recipes or Items. Manager can also change this switch (${PLAYER_ACCESS_CONTRACT}).</p>
        <div class="agl-management-actions">${badge(`Player interface: ${playerAccessEnabled()?'Visible':'Hidden'}`,playerAccessEnabled()?'ok':'warn')}
          <button type="button" data-action="toggle-player-access" class="ag-btn">${playerAccessEnabled()?'Hide from players':'Show to players'}</button></div>
      </section>
      <section class="ag-card agl-panel"><h2>Profession XP</h2>
        <p class="agl-sub">Award XP from the <b>Individual</b> tab: pick a character, enter an amount on a profession and click Award. XP is stored on the character (Actor flags owned by this module), shown to the player in the Ledger and the sheet’s Professions tab, and written into the profession feature’s description on the character sheet. The player and GM get a whispered chat note.</p>
      </section>
      <section class="ag-card agl-panel"><h2>Catalog &amp; integrations</h2>
        <p class="agl-sub">General Manager imports recipes, materials and the items recipes make. A crafted item is copied from the recipe’s result item in the world Items directory. The Ledger catalog import below is only for older player-safe JSON catalogs.</p>
        <div class="agl-management-actions"><button type="button" class="ag-btn" data-action="import">Import Ledger recipe/material JSON</button>
        <button type="button" class="ag-btn" data-action="manager" ${canOpen?'':'disabled title="Manager is not installed, enabled or exposing its open API"'}>Open General Manager ↗</button></div>
      </section>
      <section class="ag-card agl-panel"><h2>GM visibility guide</h2><div class="agl-management-actions">${badge('All players','ok')} ${badge('Some players','partial')} ${badge('GM only','warn')} ${badge('Draft — hidden from players','warn')}</div>
        <p class="agl-sub">Draft recipes are visible only to you. A player never sees a draft recipe item, and can’t learn or craft it, until you approve it in General Manager.</p>
      </section>
    </div>`;
  }
  _help(){return `<section class="ag-card agl-panel agl-help"><h2>Profession Ledger Help</h2>
    <p><strong>Individual:</strong> your character’s crafting bench: professions with level and XP, materials, recipe items you can learn, and known recipes. <em>Craft</em> checks you know the recipe and have the materials, uses them up and puts the crafted item in your inventory, with a chat card. If a party member has what you’re missing, <em>Craft — ask the party</em> asks their owner on their screen; any decline cancels and nothing is used.</p>
    <p><strong>Learn:</strong> a recipe item in your inventory has a Learn button. Learning uses up one recipe item and the recipe stays known.</p>
    <p><strong>Party:</strong> every party member’s materials and recipes, by player or by profession.</p>
    <p><strong>Recipe Catalog:</strong> recipes your party has found or learned, in folders by profession${game.user.isGM?'. As GM you see every recipe, with drafts marked':''}.</p>
    <p><strong>Where XP lives:</strong> on your character, kept by the Profession Ledger. It’s shown here, in the Professions tab of the Tidy5e sheet, and in the profession feature’s description on your sheet. Only the GM awards XP.</p>
    <p><strong>Gathering:</strong> players request; the GM sets the check and confirms the material reward.</p>
    ${game.user.isGM?'<p><strong>GM Setup:</strong> choose the party, Player Access and imports.</p>':''}
    <button type="button" class="ag-btn" data-action="help-back">Back</button>
  </section>`;}
  _gathering(){
    const chars=this.actors,actor=chars.find(a=>a.id===this.gather.actorId)??this.actor;
    const gathering=GATHERING_PROFESSIONS;
    if(!game.user.isGM){
      const mine=myCharacters();
      return `<section class="ag-card agl-panel"><h2>Request gathering</h2><p class="agl-sub">Ask your GM at the table, then send a private gathering request. The GM decides which resources are available here.</p>
        <div class="agl-gather-form">${mine.length>1?`<label class="ag-field">Character<select data-agl-actor>${mine.map(a=>`<option value="${esc(a.id)}" ${a.id===this.actor?.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label>`:''}
        <label class="ag-field">Gathering profession<select data-gather-field="profession">${gathering.map(n=>`<option value="${esc(n)}" ${this.gather.profession===n?'selected':''}>${esc(n)}</option>`).join('')}</select></label></div>
        <button type="button" class="ag-btn ag-btn--primary" data-action="gather-player-request" ${this.actor&&owned(this.actor)?'':'disabled'}>Request gathering</button>
        <p class="agl-sub">A request never rolls dice, uses resources or awards XP.</p></section>`;
    }
    const mats=materialChoices();
    if(!this.gather.actorId&&actor)this.gather.actorId=actor.id;
    if(!this.gather.materialId&&mats[0])this.gather.materialId=agSourceId(mats[0]);
    const preview=this.gather.preview;
    return `<section class="ag-card agl-panel"><h2>Gathering encounter</h2>
      <p class="agl-sub">Material rewards come from player-visible world materials imported by General Manager. The Locations module owns resource availability; this does not invent pools, refresh, depletion or check modifiers.</p>
      <div class="agl-gather-form">
       <label class="ag-field">Character<select data-gather-field="actorId">${chars.map(a=>`<option value="${esc(a.id)}" ${this.gather.actorId===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label>
       <fieldset class="agl-gather-eligible"><legend>Professions available in this scene</legend>${gathering.map(n=>`<label><input type="checkbox" data-gather-eligible="${esc(n)}" ${this.gather.eligibleProfessions.includes(n)?'checked':''}> ${esc(n)}</label>`).join('')}</fieldset>
       <label class="ag-field">Character’s gathering profession<select data-gather-field="profession">${gathering.filter(n=>this.gather.eligibleProfessions.includes(n)).map(n=>`<option value="${esc(n)}" ${this.gather.profession===n?'selected':''}>${esc(n)}</option>`).join('')}</select></label>
       <label class="ag-field">Check DC<input data-gather-field="dc" type="number" min="1" max="40" step="1" value="${esc(this.gather.dc)}"></label>
       <label class="ag-field">Material tier<select data-gather-field="tier">${TIERS.map(n=>`<option value="${n}" ${this.gather.tier===n?'selected':''}>${n}</option>`).join('')}</select></label>
       <label class="ag-field">Location ID (optional)<input data-gather-field="locationId" maxlength="80" placeholder="LOC-* (reference only)" value="${esc(this.gather.locationId)}"></label>
       <label class="ag-field">Reward material<select data-gather-field="materialId">${mats.map(i=>`<option value="${esc(agSourceId(i))}" ${this.gather.materialId===agSourceId(i)?'selected':''}>${esc(i.name)}</option>`).join('')}</select></label>
       <label class="ag-field">Reward quantity<input data-gather-field="qty" type="number" min="1" max="99" step="1" value="${esc(this.gather.qty)}"></label>
       <label class="ag-field">Reported check total<input data-gather-field="rollTotal" type="number" min="0" max="200" step="1" placeholder="Enter after check" value="${esc(this.gather.rollTotal)}"></label>
      </div>
      <div class="agl-management-actions"><button type="button" class="ag-btn" data-action="gather-roll-request" ${actor?'':'disabled'}>Prompt character to roll</button><button type="button" class="ag-btn ag-btn--primary" data-action="gather-preview" ${actor&&mats.length?'':'disabled'}>Preview result</button></div>
      ${mats.length?'':'<div class="agl-note warn">Import at least one player-visible, approved material with General Manager before gathering awards.</div>'}
      <p class="agl-sub">Rolls are made on the character sheet. Suggested XP on success: <b>${gatherXP(this.gather.tier)} XP</b> for this tier; award it from the Individual tab.</p>
    </section>
    ${preview?`<section class="ag-card agl-panel agl-gather-result"><h2>Gathering result</h2><p>${esc(preview.actorName)} — ${esc(preview.profession)} · ${preview.rollTotal} versus DC ${preview.dc} ${preview.passed?badge('Success','ok'):badge('Failed check','warn')}</p>
      ${preview.passed?`<p class="agl-reward-reel" data-agl-reveal>Preparing reward reveal…</p>
      <button type="button" class="ag-btn ag-btn--primary" data-action="gather-award" ${this.gatherBusy?'disabled':''}>Confirm material award</button>`:'<p class="agl-sub">No award for a failed check.</p>'}</section>`:''}`;
  }
  async _prepareContext(options){checkPlayerLedger();const ctx=await super._prepareContext(options);
    this.demo=false;
    this.view=LEGACY_VIEWS[this.view]??this.view;
    if(!game.user.isGM){this.rosterDraft=null;if(GM_VIEWS.has(this.view))this.view='individual';}
    const lib=this.library;
    const content=({individual:()=>this._individual(lib),party:()=>this._party(lib),catalog:()=>this._catalog(lib),gathering:()=>this._gathering(),gm:()=>this._gmSetup(),help:()=>this._help()})[this.view]?.()??this._individual(lib);
    const inGm=game.user.isGM&&this.view==='gm';
    return {...ctx,html:`<div class="agl-shell"><header class="ag-header agl-header"><div class="ag-header__title agl-title">Ashen Gate | <strong>Profession Ledger</strong></div>
      <div class="ag-header__meta agl-header-right"><span class="agl-version">v${esc(game.modules.get(ID)?.version??VERSION)}</span><button type="button" class="ag-btn" data-action="help">Help</button></div>
      <input id="agl-file" type="file" accept="application/json,.json" hidden></header>
      <nav class="ag-tabs agl-tabs" aria-label="Profession Ledger views">${this._tabs()}</nav><main class="agl-main">${content}</main>
      <footer class="ag-footer agl-footer">${inGm?`<button type="button" class="ag-btn" data-action="gm-cancel">Cancel</button><span class="agl-footer-status" data-agl-roster-status>${this.rosterDirty?'Unsaved party changes':'Party saved'}</span><button type="button" class="ag-btn ag-btn--primary" data-action="roster-save" ${this.rosterDirty?'':'disabled'}>Save Changes</button>`
        :`<span class="agl-footer-status">${esc(this.notice||'')}</span>`}
      </footer></div>`};
  }
  async _onRender(context,options){await super._onRender(context,options);if(!canOpenLedger()){await this.close?.({animate:false});return;}openLedgerWindows.add(this);this._events?.abort();this._events=new AbortController();
    const signal=this._events.signal;
    this.element.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b||b.disabled)return;if(b.closest('summary'))e.preventDefault();void this._click(b.dataset.action,b.dataset.id,b.dataset);},{signal});
    this.element.querySelector('#agl-file')?.addEventListener('change',e=>this._upload(e),{signal});
    this.element.addEventListener('toggle',e=>{const key=e.target?.dataset?.folder;if(!key||this.query)return;if(e.target.open)this.closedFolders.delete(key);else this.closedFolders.add(key);},{signal,capture:true});
    this.element.addEventListener('change',e=>{
      if(e.target?.matches?.('[data-agl-actor]')){this.actorId=e.target.value;this.render();return;}
      if(e.target?.matches?.('[data-gather-eligible]')&&game.user.isGM){
        const name=e.target.dataset.gatherEligible;
        const next=new Set(this.gather.eligibleProfessions);
        if(e.target.checked)next.add(name);else next.delete(name);
        this.gather.eligibleProfessions=GATHERING_PROFESSIONS.filter(p=>next.has(p));
        if(!this.gather.eligibleProfessions.includes(this.gather.profession))this.gather.profession=this.gather.eligibleProfessions[0]??'';
        this.gather.preview=null;this.render();return;
      }
      if(e.target?.matches?.('[data-roster-actor]')&&game.user.isGM)this._rememberRosterDraft();
      if(e.target?.matches?.('[data-gather-field]')){this.gather[e.target.dataset.gatherField]=e.target.value;this.gather.preview=null;}
    },{signal});
    this.element.querySelector('[data-agl-search]')?.addEventListener('input',e=>{this.query=e.target.value;this._applySearch();},{signal});
    this._applySearch();this._syncRosterActions();if(this.view==='gathering'&&game.user.isGM&&this.gather.preview?.passed&&!this.gather.preview.revealDone)void this._animateGatherPreview();}
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
      if(action==='toggle-player-access'){if(!game.user.isGM)throw Error('GM only');const next=!playerAccessEnabled();await setPlayerAccess(game,ID,next);this.notice=`Player interface ${next?'visible':'hidden'}. Actor progression and known recipes are unchanged.`;this.render();say(this.notice);return;}
      if(action==='manager'){if(!game.user.isGM)throw Error('GM only');const m=game.modules.get('ashen-gate-manager');const api=m?.active?m.api:null;if(api?.open)api.open();else say('Ashen Gate Manager is not enabled.',true);return;}
      if(action==='skilltree'){const module=game.modules.get('ashen-gate-skill-trees');const api=module?.active?module.api:null;
        if(!api?.open){say('Skill Trees prototype is not enabled.',true);return;}
        const tree=api.listTrees?.()?.find(t=>norm(professionFromTreeName(t.name))===norm(id));api.open({actorId:this.actorId,treeId:tree?.id});return;}
      if(action==='roster-all'||action==='roster-clear'){if(!game.user.isGM)throw Error('GM only');
        for(const input of this.element.querySelectorAll('[data-roster-actor]')){const a=game.actors.get(input.dataset.rosterActor);input.checked=action==='roster-all'?Boolean(a?.hasPlayerOwner):false;}this._rememberRosterDraft();return;}
      if(action==='roster-save'){if(!game.user.isGM)throw Error('GM only');
        const ids=[...this.element.querySelectorAll('[data-roster-actor]:checked')].map(el=>el.dataset.rosterActor).filter(id=>game.actors.get(id)?.type==='character');
        await game.settings.set(ID,'partyRoster',ids);this.rosterDraft=null;this.notice=`Party saved: ${plural(ids.length,'character')}.`;this.render();say(this.notice);return;}
      if(['learn-recipe','craft','award-xp'].includes(action)){
        const actorId=data.actor??(String(id).includes(':')?String(id).split(':')[0]:this.actor?.id);
        const input=action==='award-xp'?this.element?.querySelector?.(`[data-xp-input="${id}"]`):null;
        const out=await performAction(action,{id,actorId,points:input?.value});
        if(!out)return;
        if(out.award)this.lastAward=out.award;
        this.notice=out.message;this.render();say(out.message,out.ok===false);return;}
      if(action==='gather-player-request'){const actor=this.actor;
        if(!actor||!owned(actor))throw Error('Select a character you own');
        const profession=this.gather.profession;if(!GATHERING_PROFESSIONS.includes(profession))throw Error('Unknown gathering profession');
        const gmIds=allUsers().filter(u=>u.isGM).map(u=>u.id);
        if(!gmIds.length)throw Error('No GM account available');
        await ChatMessage.create({user:game.user.id,whisper:gmIds,speaker:ChatMessage.getSpeaker(),content:`<div class="agl-chat"><strong>Gathering request</strong><p>${esc(actor.name)} requests a ${esc(profession)} gathering attempt. GM: choose eligible scene resources and difficulty in the Profession Ledger Gathering tab.</p></div>`});
        this.notice='Gathering request sent privately to the GM.';this.render();say(this.notice);return;}
      if(action==='gather-roll-request'){if(!game.user.isGM)throw Error('GM only');
        const actor=game.actors.get(this.gather.actorId);if(!actor||!this.actors.some(a=>a.id===actor.id))throw Error('Choose a party character');
        if(!GATHERING_PROFESSIONS.includes(this.gather.profession))throw Error('Unknown gathering profession');
        const userIds=[...new Set(allUsers().filter(u=>u.isGM||actor.testUserPermission?.(u,'OWNER')).map(u=>u.id))];
        await ChatMessage.create({user:game.user.id,whisper:userIds,speaker:ChatMessage.getSpeaker(),content:`<div class="agl-chat"><strong>Ashen Gate — Gathering Check</strong><p>${esc(actor.name)}: please make your GM-requested <b>${esc(this.gather.profession)}</b> check using your character sheet and report the total. The GM resolves the result.</p></div>`});
        this.notice=`Gathering check prompt sent for ${actor.name}.`;this.render();say(this.notice);return;}
      if(action==='gather-preview'){if(!game.user.isGM)throw Error('GM only');this._buildGatherPreview();this.render();return;}
      if(action==='gather-award'){if(!game.user.isGM)throw Error('GM only');await this._awardGathering();return;}
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
  _syncRosterActions(){
    const save=this.element?.querySelector?.('[data-action="roster-save"]');
    if(save)save.disabled=!this.rosterDirty;
    const status=this.element?.querySelector?.('[data-agl-roster-status]');
    if(status)status.textContent=this.rosterDirty?'Unsaved party changes':'Party saved';
  }
  async _leaveGmSetup(){
    if(!this.rosterDirty){this.rosterDraft=null;return true;}
    const discard=await DialogV2.confirm({window:{title:'Discard unsaved party changes?'},
      content:'<p>Your party selection has not been saved. Discard these changes and leave GM Setup?</p>',modal:true,rejectClose:false});
    if(!discard)return false;
    this.rosterDraft=null;return true;
  }
  async _animateGatherPreview(){
    const preview=this.gather.preview,label=this.element?.querySelector?.('[data-agl-reveal]');
    if(!preview||!label||preview.revealDone)return;
    const final=`Reward selected: ${preview.itemName} ×${preview.qty}`;
    const reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if(reduced){label.textContent=final;preview.revealDone=true;return;}
    const names=materialChoices().map(i=>i.name).slice(0,24);
    for(let i=0;i<12;i++){
      if(this.gather.preview!==preview||!this.element?.querySelector?.('[data-agl-reveal]'))return;
      label.textContent=`Finding… ${names[i%names.length]??preview.itemName}`;
      await new Promise(resolve=>setTimeout(resolve,65+i*7));
    }
    if(this.gather.preview===preview&&this.element?.querySelector?.('[data-agl-reveal]')){
      label.textContent=final;preview.revealDone=true;
    }
  }
  _buildGatherPreview(){
    const {actorId,profession,materialId,tier,locationId}=this.gather;
    const actor=game.actors.get(actorId),item=materialChoices().find(i=>agSourceId(i)===materialId);
    const dc=Number(this.gather.dc),rollTotal=Number(this.gather.rollTotal),qty=Number(this.gather.qty);
    if(!actor||!this.actors.some(a=>a.id===actor.id))throw Error('Select a party character');
    if(!this.gather.eligibleProfessions.includes(profession)||!TIERS.includes(tier))throw Error('Select a valid gathering profession and material tier');
    if(!item)throw Error('Choose a player-visible imported MAT-* world Item');
    if(!Number.isSafeInteger(dc)||dc<1||dc>40)throw Error('Enter a GM-selected DC from 1 to 40');
    if(this.gather.rollTotal===''||!Number.isSafeInteger(rollTotal)||rollTotal<0||rollTotal>200)throw Error('Enter the reported check total (0–200)');
    if(!Number.isSafeInteger(qty)||qty<1||qty>99)throw Error('Enter reward quantity from 1 to 99');
    if(locationId&&!/^LOC-[A-Z0-9-]+$/.test(locationId))throw Error('Optional Location reference must be a LOC-* ID');
    const profItem=professionItems(actor).find(i=>norm(professionDisplayName(i))===norm(profession));
    // A missing Actor Profession definition is a GM warning, not an assumed proficiency or a fabricated level.
    const progress=profItem?progressOf(actor,agSourceId(profItem)):null;
    if(progress&&progress.level<ACCESS_LEVELS[tier])throw Error(`${actor.name} needs Profession level ${ACCESS_LEVELS[tier]} to gather ${tier} materials; current level ${progress.level}`);
    this.gather.preview={actorId,actorName:actor.name,profession,tier,materialId,itemWorldId:item.id,itemName:item.name,
      qty,dc,rollTotal,passed:rollTotal>=dc,locationId,professionId:profItem?agSourceId(profItem):null,
      levelKnown:Boolean(progress),minimumLevel:ACCESS_LEVELS[tier]};
  }
  async _awardGathering(){
    if(this.gatherBusy)throw Error('An award is already being processed');
    const result=this.gather.preview;if(!result?.passed)throw Error('No successful gathering result is pending');
    const actor=game.actors.get(result.actorId),item=game.items.get?.(result.itemWorldId)??materialChoices().find(i=>i.id===result.itemWorldId);
    if(!actor||!this.actors.some(a=>a.id===actor.id)||!item||agSourceId(item)!==result.materialId)throw Error('The Actor or world Material Item changed; preview again');
    if(!materialChoices().some(i=>i.id===item.id))throw Error('The Material is no longer player-visible or eligible');
    const confirmed=await DialogV2.confirm({window:{title:'Confirm Gathering Material Award'},
      content:`<p>Award <strong>${result.qty} × ${esc(item.name)}</strong> to <strong>${esc(actor.name)}</strong> for a ${esc(result.profession)} check of <b>${result.rollTotal}</b> against DC <b>${result.dc}</b>?</p>
        <p>This awards the Item only. No automatic depletion or XP occurs.</p>`,modal:true,rejectClose:false});
    if(!confirmed)return;
    this.gatherBusy=true;
    try{await awardGatheringItem(actor,item,result.qty);
      // Success log is a private ChatMessage; do not store hidden Location pools in public world settings.
      const recipients=[...new Set(allUsers().filter(u=>u.isGM||actor.testUserPermission?.(u,'OWNER')).map(u=>u.id))];
      try{await ChatMessage.create({user:game.user.id,whisper:recipients,speaker:ChatMessage.getSpeaker(),content:`<div class="agl-chat"><strong>Gathering reward awarded</strong><p>${esc(actor.name)} received ${result.qty} × ${esc(item.name)} for ${esc(result.profession)}${result.locationId?` at ${esc(result.locationId)}`:''}.</p><p>Profession XP not awarded automatically. Suggested successful gather XP for ${esc(result.tier)}: ${gatherXP(result.tier)}.</p></div>`});}
      catch(err){console.warn(`[${ID}] Award succeeded but notification failed`,err);}
      this.gather.preview=null;this.gather.rollTotal='';this.notice=`Awarded ${result.qty} × ${item.name} to ${actor.name}.`;this.render();say(this.notice);
    }finally{this.gatherBusy=false;}
  }
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
      const out=await performAction(b.dataset.action,{id:b.dataset.id,actorId:b.dataset.actor??sheetActor.id,points:input?.value});
      if(out)say(out.message,out.ok===false);
      renderSheetTab({...params,tabContentsElement:target});
    }catch(err){console.error(`[${ID}]`,err);say(`Profession Ledger: ${err.message}`,true);}
  });
}
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
    awardProfessionXP:(actor,profId,amount)=>awardXP(actor,profId,amount),
    getKnownRecipes:(actor)=>{checkPlayerLedger();if(!actor?.testUserPermission?.(game.user,'OBSERVER')&&!game.user.isGM)throw Error('Actor access denied');return knownRecipesOf(actor);},
    inspectProfessionPerkChoices:(actor,profId)=>{checkPlayerLedger();if(!game.user.isGM&&!actor?.testUserPermission?.(game.user,'OBSERVER'))throw Error('Actor access denied');return progressOf(actor,profId);},
    learnRecipe:(actor,item)=>{checkPlayerLedger();return learnRecipe(actor,item);},
    craft:(actor,recipeId,options)=>craft(actor,recipeId,options),
    version:VERSION,source:'Actor inventories, Manager tagged Items, and optional Ledger catalog'};
  game.socket?.on?.(SOCKET,(message,senderId)=>void onSocket(message,senderId));
  const refresh=()=>{if(current?.rendered)current.render();};
  for(const hook of ['updateActor','createItem','updateItem','deleteItem'])Hooks.on(hook,refresh);
  // Handle Actor Directory already rendered before ready hook ran.
  addActorDirectoryLauncher(globalThis.ui?.actors, globalThis.ui?.actors?.element);
  console.info(`[${ID}] v${VERSION} ready. Open from the Actors directory, Module Settings or game.modules.get('${ID}').api.open()`);
});

/** Open Ledger on the Actors directory for both GM and players; idempotent across renders. */
function addActorDirectoryLauncher(application, renderedElement){
  mountLauncher(launcherRoot(application,renderedElement),{moduleId:ID,label:'Profession Ledger',icon:'fa-solid fa-book-open',
    onClick:()=>game.modules.get(ID)?.api?.open(),visible:canOpenLedger()});
}
Hooks.on('closeApplicationV2',app=>openLedgerWindows.delete(app));
Hooks.on('renderActorDirectory',(app,el)=>addActorDirectoryLauncher(app,el));

/** Test seam for the Node suite (mocked Foundry); not part of the public API. */
export const _test={craft,orchestrateCraft,onSocket,performAction,registerTidyTab,renderSheetTab,myCharacters,getBroker};
