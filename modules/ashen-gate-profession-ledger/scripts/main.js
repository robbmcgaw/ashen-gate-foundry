import {SCHEMA,PROFESSION_NAMES,norm,displayProfession,professionFromTreeName,classify,inventory,
  listMaterials,planRecipe,normalizeRecipe,normalizeLibrary,groupRecipesByProfession,sourceVisibility,sourceAvailableToPlayer,agSourceId,quantity,DEMO_LIBRARY,demoSnapshot} from './core.mjs';
import {LEDGER_SCOPE,PROGRESSION_SCHEMA,GATHERING_PROFESSIONS,TIERS,ACCESS_LEVELS,gatherXP,knownRecipesOf,canLearnRecipe,progressOf,emptyProgress,nextProgress,isMaterialAwardCandidate} from './progression.mjs';
import {PLAYER_ACCESS_CONTRACT,PLAYER_ACCESS_SETTING,playerAccessAllowed,assertPlayerAccess,accessState,setPlayerAccess} from './player-access.mjs';
import {lookupWorldDefinition,readWorldDefinition} from './definition-lookup.mjs';
import {launcherRoot,mountLauncher} from './ag-launchers.mjs';
const ID='ashen-gate-profession-ledger';
const {ApplicationV2,HandlebarsApplicationMixin,DialogV2}=foundry.applications.api;
const esc=value=>foundry.utils.escapeHTML(String(value??''));
const badge=(value,kind='')=>`<span class="agl-badge ${kind}">${esc(value)}</span>`;
const say=(message,error=false)=>error?ui.notifications.error(message):ui.notifications.info(message);
let current=null;
const openLedgerWindows=new Set();
const learnLocks=new Set();
const xpLocks=new Set();
const owned=(actor)=>game.user.isGM||Boolean(actor?.testUserPermission?.(game.user,'OWNER'));
const canOpenLedger=()=>playerAccessAllowed(game,ID);
const checkPlayerLedger=()=>assertPlayerAccess(game,ID);
const playerAccessEnabled=()=>game.settings.get(ID,PLAYER_ACCESS_SETTING)!==false;

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
const professionItems=(actor)=>Array.from(actor?.items??[]).filter(item=>classify(item)==='Profession'&&/^PROF-[A-Z0-9-]+$/.test(agSourceId(item)??'')&&(game.user.isGM||sourceAvailableToPlayer(item)));
const recipeItems=(actor)=>Array.from(actor?.items??[]).filter(item=>classify(item)==='Recipe'&&/^REC-[A-Z0-9-]+$/.test(agSourceId(item)??'')&&quantity(item)>0&&(game.user.isGM||sourceAvailableToPlayer(item)));
/** Exact Actor source ID and ownership enforced; no Actor state duplicated in Skill Trees. */
async function awardXP(actor,profId,points){
  if(!game.user.isGM)throw Error('Only the GM can award Profession XP');
  if(!actor||!linkedProfession(actor,profId))throw Error('Actor must own a matching Manager-tagged PROF-* Profession Item');
  const key=`${actor.id}:${profId}`;
  if(xpLocks.has(key))throw Error('Profession XP award already in progress');
  xpLocks.add(key);
  try {const before=actor.flags?.[ID]?.professionProgress??emptyProgress();const result=nextProgress(before,profId,points);
    await actor.setFlag(ID,'professionProgress',result.state);
    return result;
  }finally{xpLocks.delete(key);}
}
/** Consumes a real Actor-owned Recipe Item; writes only a permanent REC-* knowledge ID. */
async function learnRecipe(actor,item){
  if(!actor||!item||!owned(actor))throw Error('You need OWNER permission on that character to learn a recipe');
  if(!Array.from(actor.items??[]).some(i=>i.id===item.id))throw Error('The Recipe Item must be held by the selected character');
  if(classify(item)!=='Recipe')throw Error('This is not a Recipe Item');
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
        throw Error(`Item consumption failed AND knowledge rollback failed for ${id}; GM must reconcile the Actor before retrying`);
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
function liveActors(){const ids=new Set(rosterIds());return allCharacters().filter(a=>ids.has(a.id)&&(game.user.isGM||a.testUserPermission(game.user,'OBSERVER')));}
function players(){return (game.users?.contents??Array.from(game.users??[])).filter(u=>!u.isGM);}
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
function recipeVisibilityBadge(recipe){if(!game.user.isGM)return '';
  if(recipe.isDemo)return badge('Demo','demo');
  const item=game.items?.contents?.find(i=>i.uuid===recipe.sourceUuid);
  if(item)return visibilityBadge(item);
  return `<span class="agl-access" title="This catalog is stored in a shared world setting and is accessible to players; this does NOT mean a character has learned it.">${badge('Shared catalog','partial')}</span>`;
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

function professionFor(actor){
  // Ledger owns the authoritative Actor progression; experimental Skill Trees point totals are not Profession XP.
  const profs=new Map();
  for(const item of professionItems(actor)){
    const sourceId=agSourceId(item);
    const progress=progressOf(actor,sourceId);
    const name=String(item.name??'').trim();
    if(!name)continue;
    profs.set(sourceId,{name,sourceId,level:progress?.level??null,xp:progress?.xp??null,
      tier:progress?.tier??null,unspentPerkChoices:progress?.unspentPerkChoices??null,source:'Actor PROF Item / Ledger state'});
  }
  return [...profs.values()].sort((a,b)=>a.name.localeCompare(b.name));
}

function demoProfessions(actor){return (actor.professions??[]).map(name=>({name,level:null,xp:null,source:'Demo'}));}
const portrait=(a)=>`<span class="agl-avatar">${esc((a.name||'?').slice(0,1))}</span>`;
function renderActorButton(a,active=false){return `<button class="agl-actor ${active?'active':''}" data-action="actor" data-id="${esc(a.id)}">${portrait(a)}<span class="agl-actor-name">${esc(a.name)}</span>${a.isDemo?badge('DEMO','demo'):visibilityBadge(a)}</button>`;}
class LedgerApp extends HandlebarsApplicationMixin(ApplicationV2){
  static DEFAULT_OPTIONS={id:'agl-window',classes:['agl-app'],window:{title:'Ashen Gate | Profession Ledger',resizable:true,icon:'fa-solid fa-book-open'},position:{width:1210,height:780}};
  static PARTS={main:{template:`modules/${ID}/templates/ledger.hbs`}};
  render(options){checkPlayerLedger();return super.render(options);}
  constructor(...args){super(...args);this.view='party';this.previousView='party';this.actorId=null;this.recipeId=null;this.demo=false;this.query='';this.expandedRecipeGroups=new Set();this.recipeGroupsInitialized=false;this.notice='';this.rosterDraft=null;this._events=null;
    this.gather={actorId:null,profession:'Herbalism',eligibleProfessions:[...GATHERING_PROFESSIONS],tier:'Apprentice',dc:12,rollTotal:'',qty:1,materialId:'',locationId:'',preview:null};this.gatherBusy=false;
  }
  get actors(){return liveActors();}
  get library(){return catalog();}
  _default(){const actors=this.actors;if(!actors.some(a=>a.id===this.actorId))this.actorId=actors[0]?.id??null;
    if(!this.library.recipes.some(r=>r.id===this.recipeId))this.recipeId=this.library.recipes[0]?.id??null;
    if(!this.recipeGroupsInitialized&&this.recipe){this.expandedRecipeGroups.add(groupRecipesByProfession([this.recipe])[0].key);this.recipeGroupsInitialized=true;}}
  get actor(){return this.actors.find(a=>a.id===this.actorId)??null;}
  get recipe(){return this.library.recipes.find(r=>r.id===this.recipeId)??null;}
  _recipeRows(recipes){
    const groups=groupRecipesByProfession(recipes);
    if(!groups.length)return '<div class="agl-empty">No recipes indexed. Import a recipe catalog or adopt existing Recipe Items.</div>';
    const sections=groups.map(group=>`<section class="agl-recipe-group" data-recipe-group="${esc(group.key)}">
      <button type="button" class="agl-recipe-group-toggle" data-action="recipe-group" data-id="${esc(group.key)}" aria-expanded="${this.expandedRecipeGroups.has(group.key)?'true':'false'}">
        <span class="agl-group-chevron" aria-hidden="true">${this.expandedRecipeGroups.has(group.key)?'▾':'▸'}</span>
        <strong>${esc(group.name)}</strong><span class="agl-group-count">${group.recipes.length}</span>
      </button>
      <div class="agl-recipe-group-content" ${this.expandedRecipeGroups.has(group.key)?'':'hidden'}>
        ${group.recipes.map(r=>`<button type="button" class="agl-recipe ${r.id===this.recipeId?'active':''}" data-action="recipe" data-id="${esc(r.id)}" data-recipe-search="${esc(`${r.name} ${r.profession} ${r.tier??''} ${r.id??''}`.toLowerCase())}">
          <strong>${esc(r.name)}</strong><span>${esc(r.tier||'Tier not mapped')} ${r.hasStructuredIngredients?'':'• ingredients unmapped'}</span>
          ${recipeVisibilityBadge(r)} ${!this.demo&&this.actor&&knownRecipesOf(this.actor).includes(r.id)?badge('Learned','ok'):''}
        </button>`).join('')}
      </div>
    </section>`).join('');
    return `<div class="agl-recipe-browser">
      <div class="agl-recipe-toolbar"><input type="search" class="agl-recipe-search" data-agl-recipe-search="true" value="${esc(this.query)}" placeholder="Search recipes or tiers" aria-label="Search recipes by name, profession, or tier">
      <button type="button" class="agl-small" data-action="recipe-groups-expand">Expand all</button><button type="button" class="agl-small" data-action="recipe-groups-collapse">Collapse all</button></div>
      <div class="agl-recipe-groups">${sections}</div><div class="agl-empty agl-recipe-no-matches" hidden>No matching recipes.</div>
    </div>`;
  }
  _updateRecipeGroups(){
    const query=this.query.trim().toLowerCase();
    for(const group of this.element?.querySelectorAll?.('[data-recipe-group]')??[]){
      let hits=0;
      for(const recipe of group.querySelectorAll('[data-recipe-search]')){
        const match=!query||recipe.dataset.recipeSearch.includes(query);
        recipe.hidden=!match;if(match)hits++;
      }
      group.hidden=hits===0;
      const key=group.dataset.recipeGroup;
      const isOpen=Boolean(query)||this.expandedRecipeGroups.has(key);
      const toggle=group.querySelector('.agl-recipe-group-toggle');
      const body=group.querySelector('.agl-recipe-group-content');
      toggle?.setAttribute('aria-expanded',String(isOpen));
      if(body)body.hidden=!isOpen;
      const arrow=group.querySelector('.agl-group-chevron');if(arrow)arrow.textContent=isOpen?'▾':'▸';
    }
    const empty=this.element?.querySelector('.agl-recipe-no-matches');
    if(empty)empty.hidden=!query||[...this.element.querySelectorAll('[data-recipe-group]')].some(group=>!group.hidden);
  }
  _tabs(){const names=[['individual','Individual'],['party','Party'],['materials','Materials'],['recipes','Recipes'],['learning','Recipe Learning'],['gathering','Gathering'],['planner','Crafting Planner'],...(game.user.isGM?[['gm','GM Setup']]:[])];return names.map(([key,title])=>`<button type="button" data-action="tab" data-id="${key}" class="${(this.view===key||(key==='gm'&&this.view==='roster'))?'active':''}" aria-current="${(this.view===key||(key==='gm'&&this.view==='roster'))?'page':'false'}">${title}</button>`).join('');}
  _stats(actors,lib){const mat=listMaterials(actors,lib.materials,{includeRestricted:game.user.isGM});
    return `<div class="agl-kpis"><div><strong>${actors.length}</strong><span>Accessible party characters</span></div><div><strong>${mat.length}</strong><span>Material types</span></div><div><strong>${mat.reduce((n,x)=>n+x.total,0)}</strong><span>Material units</span></div><div><strong>${lib.recipes.length}</strong><span>Indexed recipes</span></div></div>`;}
  _individual(actor){
    const selector=`<section class="agl-panel agl-character-strip"><h2>Party characters</h2><div class="agl-actor-strip">${this.actors.map(a=>renderActorButton(a,a.id===actor?.id)).join('')||'<p class="agl-sub">No accessible roster characters.</p>'}</div></section>`;
    if(!actor)return `${selector}<div class="agl-empty">No accessible characters in the active roster. ${game.user.isGM?'Open GM Setup to choose your active characters.':'Ask your GM to configure the Party Roster and check your Actor permissions.'}</div>`;
    const known=this.demo?demoProfessions(actor):professionFor(actor);
    const all=[...PROFESSION_NAMES.map(n=>known.find(k=>norm(k.name)===norm(n))??{name:n,level:null,xp:null,source:null}),
      ...known.filter(k=>!PROFESSION_NAMES.some(n=>norm(n)===norm(k.name)))];
    const myInventory=inventory(actor,{includeRestricted:game.user.isGM}).filter(i=>(!i.category||i.category==='Material') && (!i.sourceId||i.sourceId.startsWith('MAT-')) &&
      (i.category==='Material'||this.library.materials.some(m=>m.id===i.sourceId||(!i.sourceId&&norm(m.name)===norm(i.name)))));
    return `${selector}<div class="agl-individual-content">
      <section class="agl-panel"><h2>${esc(actor.name)} <small>Professions</small> ${visibilityBadge(actor)}</h2><div class="agl-grid">${all.map(p=>`<div class="agl-card">
        <strong>${esc(p.name)}</strong>${badge(p.source?(p.level!==null?`Level ${p.level}`:'Known'):'Not tracked',p.source?'ok':'muted')}
        <p>${p.xp!==null?`XP recorded: ${p.xp} · ${esc(p.tier)} · ${p.unspentPerkChoices} pending perk choice(s)`:'Level/XP not recorded on Actor yet'}</p>
        ${game.user.isGM&&p.sourceId&&!this.demo?`<div class="agl-xp-award"><label>GM award XP <input type="number" data-xp-input="${esc(p.sourceId)}" min="1" max="1000" step="1" value="1"></label><button type="button" data-action="award-xp" data-id="${esc(p.sourceId)}">Award XP</button></div>`:''}
        ${p.source?`<button class="agl-small" data-action="skilltree" data-id="${esc(p.name)}">Open tree ↗</button>`:''}
      </div>`).join('')}</div></section>
      <aside class="agl-panel"><h2>Materials</h2>${myInventory.map(i=>`<div class="agl-line"><span>${esc(i.name)}</span><b>× ${i.qty}</b></div>`).join('')||'<p class="agl-sub">No recognized materials on this Actor.</p>'}</aside></div>`;
  }
  _roster(){if(!game.user.isGM)return '<div class="agl-empty">Party Roster is GM-only.</div>';
    const selected=this.rosterDraft??new Set(rosterIds());const chars=allCharacters();
    return `<section class="agl-panel agl-roster"><h2>Active party roster ${badge(`${selected.size} selected`,'ok')}</h2>
      <p class="agl-sub">Only checked character Actors contribute to the Ledger's live Individual, Party, Materials, and Crafting Planner views. Foundry permissions still limit what each player sees. Changes are saved for everyone in this world.</p>
      <div class="agl-roster-actions"><button type="button" data-action="roster-all">Select player-owned characters</button><button type="button" data-action="roster-clear">Clear selection</button><span class="agl-sub">Save changes with the footer button.</span></div>
      <div class="agl-roster-list">${chars.map(a=>`<label class="agl-roster-row"><input type="checkbox" data-roster-actor="${esc(a.id)}" ${selected.has(a.id)?'checked':''}>
        ${portrait(a)}<span class="agl-roster-name"><strong>${esc(a.name)}</strong><small>${a.hasPlayerOwner?'Player owned':'No player owner'}</small></span>${visibilityBadge(a)}
      </label>`).join('')||'<div class="agl-empty">No character Actors in this world.</div>'}</div>
      <div class="agl-note">Access indicators are calculated against non-GM user accounts. A roster entry does not grant ownership, observer permission, or disclose an inaccessible Actor to a player.</div>
    </section>`;
  }
  _party(actors,lib){if(!this.demo&&!rosterIds().length)return `<div class="agl-empty">The active party roster has not been configured. ${game.user.isGM?'<button data-action="tab" data-id="gm">Set up Party Roster →</button>':'Ask your GM to select the active characters.'}</div>`;
    const names=new Set(actors.flatMap(a=>(this.demo?demoProfessions(a):professionFor(a)).map(p=>p.name)));
    const rows=[...names].sort((a,b)=>a.localeCompare(b)).map(name=>{
      const holders=actors.map(a=>({actor:a,entry:(this.demo?demoProfessions(a):professionFor(a)).find(x=>norm(x.name)===norm(name))})).filter(x=>x.entry);
      const best=holders.map(x=>x.entry.level).filter(Number.isInteger).sort((a,b)=>b-a)[0];
      return `<div class="agl-line"><strong>${esc(name)}</strong><span>${holders.map(x=>`${esc(x.actor.name)} ${visibilityBadge(x.actor)}`).join(', ')}</span>${badge(best!=null?`Best level ${best}`:`${holders.length} qualified`,'ok')}</div>`;
    }).join('');
    const mats=listMaterials(actors,lib.materials,{includeRestricted:game.user.isGM}).slice(0,10);
    return `${this._stats(actors,lib)}<div class="agl-twocol"><section class="agl-panel"><h2>Party professions</h2>${rows||'<div class="agl-empty">No recognized Profession Items or progression yet. Import the approved Profession package when available.</div>'}</section>
      <section class="agl-panel"><h2>Material overview</h2>${mats.map(m=>`<div class="agl-line"><span>${esc(m.name)}</span><b>${m.total}</b></div>`).join('')||'<div class="agl-empty">No material Items found.</div>'}
      <button class="agl-link" data-action="tab" data-id="materials">Browse all party materials →</button></section></div>
      <div class="agl-note">Party totals are a <b>planning view</b>. Characters keep ownership of their Items. No materials are consumed or transferred here.</div>`;}
  _materials(actors,lib){if(!this.demo&&!rosterIds().length)return `<div class="agl-empty">No active roster. ${game.user.isGM?'<button data-action="tab" data-id="gm">Set up Party Roster →</button>':'Ask your GM to select the active characters.'}</div>`;
    const mats=listMaterials(actors,lib.materials,{includeRestricted:game.user.isGM});
    return `<section class="agl-panel"><h2>Party material inventory</h2><p class="agl-sub">Recognizes tagged MAT records and the material catalog. Only shows Actor inventories you can view.</p>
      <div class="agl-table-head"><b>Material</b><b>Total</b><b>Held by</b></div>
      ${mats.map(m=>`<div class="agl-material-row"><strong>${esc(m.name)}</strong><b>${m.total}</b><span>${m.sources.map(s=>`${esc(s.actorName)}: ${s.qty} ${visibilityBadge(game.actors?.get(s.actorId))}`).join('<br>')}</span></div>`).join('')||'<div class="agl-empty">No recognized Material Items in the accessible party inventories.</div>'}</section>`;}
  _recipes(lib){return `<div class="agl-twocol"><section class="agl-panel"><h2>Recipe definitions (${lib.recipes.length})</h2><p class="agl-sub">This indexes visible world recipes and catalog definitions; it does not indicate that your character has learned them.</p>${this._recipeRows(lib.recipes)}</section>${this._recipeDetail()}</div>`;}
  _recipeDetail(){const r=this.recipe;if(!r)return '<section class="agl-panel"><div class="agl-empty">No recipes loaded.</div></section>';
    return `<section class="agl-panel"><h2>${esc(r.name)} ${recipeVisibilityBadge(r)}</h2><p>${badge(r.profession||'Unassigned profession','ok')} ${badge(r.tier||'Tier unknown')} ${badge(r.effort||'Effort unspecified')}</p>
      <h3>Ingredients</h3>${r.hasStructuredIngredients?(r.ingredients.map(i=>`<div class="agl-line"><span>${esc(i.name||i.materialId)}</span><b>× ${i.quantity}</b></div>`).join('')||'<p>Recipe has no ingredients.</p>'):'<div class="agl-note">Ingredients are not stored as structured data. No assumptions have been made from the description.</div>'}
      <p class="agl-sub">${esc(r.description||'Open the Foundry Item for more details when available.')}</p>
      ${!this.demo&&this.actor?(knownRecipesOf(this.actor).includes(r.id)?badge('Known by selected character','ok'):`${badge('Not yet learned','warn')} <button type="button" data-action="tab" data-id="learning">Learn from owned Recipe Item →</button>`):''}
      <button data-action="tab" data-id="planner" class="agl-primary">Plan this craft →</button></section>`;}
  _characterSelector(){return `<section class="agl-panel agl-character-strip"><h2>Character</h2><div class="agl-actor-strip">${this.actors.map(a=>renderActorButton(a,a.id===this.actor?.id)).join('')||'<p class="agl-sub">No accessible roster characters.</p>'}</div></section>`;}
  _learning(){
    const actor=this.actor;
    if(this.demo)return '<div class="agl-empty">Recipe Learning is disabled in demonstration mode.</div>';
    if(!actor)return `${this._characterSelector()}<div class="agl-empty">Choose an accessible party character first.</div>`;
    const known=knownRecipesOf(actor),library=this.library;
    const available=recipeItems(actor);
    return `${this._characterSelector()}<div class="agl-twocol">
      <section class="agl-panel"><h2>Recipe Items held by ${esc(actor.name)}</h2>
        <p class="agl-sub">Learning consumes <b>one Actor-owned Recipe Item</b> and permanently records its <code>REC-*</code> ID. Learning does not require the character to meet the crafting tier.</p>
        ${available.map(i=>{const id=agSourceId(i),state=canLearnRecipe(actor,i,id),permitted=owned(actor)&&state.ok;
          return `<div class="agl-line agl-learn-row"><span><strong>${esc(i.name)}</strong><small>${esc(id)} • ×${quantity(i)}</small></span>
          <button type="button" data-action="learn-recipe" data-id="${esc(i.id)}" ${permitted?'':`disabled title="${esc(!owned(actor)?'You must own this Actor':state.reason)}"`}>${known.includes(id)?'Already learned':'Learn (consume 1)'}</button></div>`;}).join('')||'<div class="agl-empty">No tagged REC-* consumable Recipe Items found in this character’s inventory.</div>'}
      </section>
      <section class="agl-panel"><h2>Known recipes (${known.length})</h2>
        ${known.map(id=>{const def=library.recipes.find(r=>r.id===id);
          return `<div class="agl-line"><span><strong>${esc(def?.name??id)}</strong><small>${esc(id)}</small></span>${badge('Learned','ok')}</div>`;
        }).join('')||'<div class="agl-empty">No recipes learned yet.</div>'}
        <p class="agl-sub">Knowledge stays on this Actor when a world catalog is reimported. Indexed recipes are not automatically known.</p>
      </section></div>`;
  }
  _gathering(){
    if(this.demo)return '<div class="agl-empty">Gathering is disabled in demonstration mode. Use a real GM-selected character and Manager-imported materials in a test world.</div>';
    const chars=this.actors,actor=chars.find(a=>a.id===this.gather.actorId)??this.actor;
    const gathering=GATHERING_PROFESSIONS;
    if(!game.user.isGM){
      return `<section class="agl-panel"><h2>Request gathering</h2><p class="agl-sub">Ask your GM verbally, then send a private gathering request for an accessible character. The GM decides which professions and resources are available at this location.</p>
        ${this._characterSelector()}<label class="agl-field">Gathering profession<select data-gather-field="profession">${gathering.map(n=>`<option value="${esc(n)}" ${this.gather.profession===n?'selected':''}>${esc(n)}</option>`).join('')}</select></label>
        <button class="agl-primary" data-action="gather-player-request" ${actor&&owned(actor)?'':'disabled'}>Request gathering</button>
        <p class="agl-sub">A request never rolls dice, consumes resources or awards XP.</p></section>`;
    }
    const mats=materialChoices();
    if(!this.gather.actorId&&actor)this.gather.actorId=actor.id;
    if(!this.gather.materialId&&mats[0])this.gather.materialId=agSourceId(mats[0]);
    const preview=this.gather.preview;
    return `<section class="agl-panel"><h2>Gathering encounter ${badge('GM-controlled alpha','warn')}</h2>
      <p class="agl-sub">Configure an encounter for the current scene. Material rewards come from existing player-visible world <code>MAT-*</code> Items. The Locations module owns resource availability; this prototype does not invent pools, refresh, depletion or check modifiers.</p>
      <div class="agl-gather-form">
       <label class="agl-field">Character<select data-gather-field="actorId">${chars.map(a=>`<option value="${esc(a.id)}" ${this.gather.actorId===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label>
       <fieldset class="agl-gather-eligible"><legend>Professions available in this scene</legend>${gathering.map(n=>`<label><input type="checkbox" data-gather-eligible="${esc(n)}" ${this.gather.eligibleProfessions.includes(n)?'checked':''}> ${esc(n)}</label>`).join('')}</fieldset>
       <label class="agl-field">Character’s gathering profession<select data-gather-field="profession">${gathering.filter(n=>this.gather.eligibleProfessions.includes(n)).map(n=>`<option value="${esc(n)}" ${this.gather.profession===n?'selected':''}>${esc(n)}</option>`).join('')}</select></label>
       <label class="agl-field">GM-selected check DC<input data-gather-field="dc" type="number" min="1" max="40" step="1" value="${esc(this.gather.dc)}"></label>
       <label class="agl-field">Material tier (GM-selected)<select data-gather-field="tier">${TIERS.map(n=>`<option value="${n}" ${this.gather.tier===n?'selected':''}>${n}</option>`).join('')}</select></label>
       <label class="agl-field">Location ID (optional)<input data-gather-field="locationId" maxlength="80" placeholder="LOC-* (reference only)" value="${esc(this.gather.locationId)}"></label>
       <label class="agl-field">Reward Material Item<select data-gather-field="materialId">${mats.map(i=>`<option value="${esc(agSourceId(i))}" ${this.gather.materialId===agSourceId(i)?'selected':''}>${esc(i.name)} · ${esc(agSourceId(i))}</option>`).join('')}</select></label>
       <label class="agl-field">Reward quantity<input data-gather-field="qty" type="number" min="1" max="99" step="1" value="${esc(this.gather.qty)}"></label>
       <label class="agl-field">Reported check total<input data-gather-field="rollTotal" type="number" min="0" max="200" step="1" placeholder="Enter after check" value="${esc(this.gather.rollTotal)}"></label>
      </div>
      <div class="agl-management-actions"><button type="button" data-action="gather-roll-request" ${actor?'':'disabled'}>Prompt character to roll</button><button type="button" class="agl-primary" data-action="gather-preview" ${actor&&mats.length?'':'disabled'}>Preview result</button></div>
      ${mats.length?'':'<div class="agl-note warn">Import at least one player-visible, active MAT-* world Item with Manager before gathering awards.</div>'}
      <p class="agl-sub">Rolls are made using the character sheet, with the applicable check chosen by your GM. No proficiency formula is invented here. XP suggestion on success: <b>${gatherXP(this.gather.tier)} XP</b> for this tier, per Tim’s gathering progression direction; XP is awarded separately by GM.</p>
    </section>
    ${preview?`<section class="agl-panel agl-gather-result"><h2>Gathering result</h2><p>${esc(preview.actorName)} — ${esc(preview.profession)} · ${preview.rollTotal} versus DC ${preview.dc} ${preview.passed?badge('Success','ok'):badge('Failed check','warn')}</p>
      ${preview.passed?`<p class="agl-reward-reel" data-agl-reveal>Preparing reward reveal…</p><p class="agl-sub">The reveal animation is cosmetic; the GM-selected reward and check result are already fixed.</p>
      <button type="button" class="agl-primary" data-action="gather-award" ${this.gatherBusy?'disabled':''}>Confirm material award</button>`:'<p class="agl-sub">No award is available for this failed check.</p>'}</section>`:''}`;
  }
  _planner(actors,lib){const plan=this.recipe?planRecipe(this.recipe,actors,lib.materials,{includeRestricted:game.user.isGM}):null;
    const knows=Boolean(this.actor&&this.recipe&&knownRecipesOf(this.actor).includes(this.recipe.id));
    const eligible=knows&&owned(this.actor);
    return `${this._characterSelector()}<div class="agl-twocol"><section class="agl-panel"><h2>Choose a recipe</h2>${this._recipeRows(lib.recipes)}</section>
      <section class="agl-panel"><h2>Collaborative crafting plan</h2>${!this.recipe?'<div class="agl-empty">Select a recipe.</div>':`<p class="agl-sub">${esc(this.recipe.name)} · ${esc(this.recipe.profession||'Unassigned')}</p>
        ${!knows&&!this.demo?'<div class="agl-note warn">Selected character has not learned this recipe. Use Recipe Learning before requesting a craft.</div>':''}
        ${plan.unsupported?'<div class="agl-note warn">This recipe has no structured ingredient mapping. Planning is unavailable until its ingredients are provided.</div>':`
        <div class="agl-status ${plan.ready?'ok':'warn'}">${plan.ready?'✓ Materials available across visible party':'! Materials still needed'}</div>
        <h3>Requirements</h3>${plan.requirements.map(req=>`<div class="agl-line"><span>${esc(req.name)}</span><strong>${req.available}/${req.required}</strong>${req.missing?badge(`Need ${req.missing}`,'warn'):badge('Ready','ok')}</div>`).join('')}
        <h3>Suggested contributions</h3>${plan.allocations.map(a=>`<div class="agl-line"><span>${esc(a.actorName)} ${visibilityBadge(game.actors?.get(a.actorId))}</span><b>${a.quantity} × ${esc(a.name)}</b>${badge('Owner approval required','muted')}</div>`).join('')||'<p class="agl-sub">No matching materials found.</p>'}
        <button data-action="request" class="agl-primary" ${(!plan.ready||this.demo||!eligible)?'disabled':''}>Send permission requests</button>
        ${this.demo?'<div class="agl-sub">Permission requests are disabled in Demo mode.</div>':''}
        <div class="agl-note">Requests are chat whispers to the supplying characters’ owners. Players reply to approve or decline. This prototype does <strong>not</strong> consume or move Items, and does not automate approval recording.</div>`}`}</section></div>`;}
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
    if(status)status.textContent=this.rosterDirty?'Unsaved party roster changes':'Party roster saved';
  }
  async _leaveGmSetup(){
    if(!this.rosterDirty){this.rosterDraft=null;return true;}
    const discard=await DialogV2.confirm({window:{title:'Discard unsaved roster changes?'},
      content:'<p>Your party roster selection has not been saved. Discard these changes and leave GM Setup?</p>',modal:true,rejectClose:false});
    if(!discard)return false;
    this.rosterDraft=null;return true;
  }
  _gmSetup(){
    if(!game.user.isGM)return '<div class="agl-empty">GM Setup is restricted to the GM.</div>';
    const manager=game.modules.get('ashen-gate-manager');
    const canOpen=Boolean(manager?.active&&typeof manager.api?.open==='function');
    return `<div class="agl-gm-setup">
      <section class="agl-panel agl-management"><h2>Player Access</h2>
        <p class="agl-sub">${playerAccessEnabled()?'Visible':'Hidden'} to players. This controls the Actors launcher and Ledger window only; it never deletes or disables Profession XP, known recipes, Items, or other Foundry mechanics. Manager can also change this switch when it supports ${PLAYER_ACCESS_CONTRACT}.</p>
        <div class="agl-management-actions"><span class="agl-badge ${playerAccessEnabled()?'ok':'warn'}">Player interface: ${playerAccessEnabled()?'Visible':'Hidden'}</span>
          <button type="button" data-action="toggle-player-access" class="agl-primary">${playerAccessEnabled()?'Hide from players':'Show to players'}</button></div>
      </section>
      <section class="agl-panel agl-management"><h2>Catalog &amp; integrations</h2>
        <p class="agl-sub">Ledger imports a player-safe recipe/material catalog only. Use General Manager for world Item and Journal definitions. Neither action updates Actor XP or inventory.</p>
        <div class="agl-management-actions"><button type="button" data-action="import">Import Ledger recipe/material JSON</button>
        <button type="button" data-action="manager" ${canOpen?'':'disabled title="Manager is not installed, enabled or exposing its open API"'}>Open General Manager ↗</button></div>
        <p class="agl-sub">Import uses an explicit confirmation and replaces only the Ledger catalog. Existing party roster and Actor state are preserved. Manager's typed folder placement is a separate responsibility.</p>
      </section>
      ${this._roster()}
      <section class="agl-panel"><h2>GM visibility guide</h2><div class="agl-management-actions">${badge('All players','ok')} ${badge('Some players','partial')} ${badge('GM only','warn')} ${badge('Reveal gated','warn')}</div>
        <p class="agl-sub">Badges are advisory. Actual player access requires Foundry document permissions and source visibility. Indexed recipes are not automatically learned recipes.</p>
      </section>
    </div>`;
  }
  _help(){return `<section class="agl-panel agl-help"><h2>Profession Ledger Help</h2>
    <p><strong>Individual / Party:</strong> inspect Profession Items and the GM-selected party. Missing XP is shown as unknown until Tim's authoritative progression is connected.</p>
    <p><strong>Materials:</strong> count material Items on accessible party Actors only; world library definitions are not owned inventory.</p>
    <p><strong>Recipes:</strong> browse indexed, player-visible definitions. Indexing does not teach a recipe to a character.</p>
    <p><strong>Crafting Planner:</strong> request permission to contribute Items. Requests never consume inventory or award crafted Items.</p>
    <p><strong>Recipe Learning:</strong> learn from an Actor-owned tagged Recipe Item; consumes one Item and retains the permanent ID even after reimports.</p>
    <p><strong>Gathering:</strong> players may request; GMs configure a check and material reward, then manually verify and confirm the award. Profession XP is awarded separately.</p>
    <p><strong>GM Setup:</strong> configure the party roster and import a safe Ledger catalog. GM Setup is GM-only; testing requires actual imported Foundry records.</p>
    <button type="button" data-action="help-back">Back to ${esc(this.previousView==='gm'?'GM Setup':this.previousView)}</button>
  </section>`;}
  async _prepareContext(options){checkPlayerLedger();const ctx=await super._prepareContext(options);
    this.demo=false; // Demo-only modes retired in v0.7.0; all views use Foundry records.
    if(!game.user.isGM){this.rosterDraft=null;if(this.view==='gm'||this.view==='roster')this.view='party';}
    this._default();const actors=this.actors,lib=this.library;
    const content=({individual:()=>this._individual(this.actor),party:()=>this._party(actors,lib),materials:()=>this._materials(actors,lib),recipes:()=>this._recipes(lib),learning:()=>this._learning(),gathering:()=>this._gathering(),planner:()=>this._planner(actors,lib),gm:()=>this._gmSetup(),roster:()=>this._gmSetup(),help:()=>this._help()})[this.view]?.()??this._party(actors,lib);
    const inGm=game.user.isGM&&(this.view==='gm'||this.view==='roster');
    return {...ctx,html:`<div class="agl-shell"><header class="agl-header"><div><div class="agl-title">Ashen Gate | <strong>Profession Ledger</strong></div>
      <div class="agl-sub">${this.demo?'Experimental demonstration — no world changes':`Active roster: ${rosterIds().length} characters • Foundry access permissions enforced`}</div></div>
      <div class="agl-header-right"><span class="agl-version">v${esc(game.modules.get(ID)?.version??'0.7.0')} Alpha</span><button type="button" data-action="help">Help</button></div>
      <input id="agl-file" type="file" accept="application/json,.json" hidden></header>
      <nav class="agl-tabs" aria-label="Profession Ledger views">${this._tabs()}</nav><main>${content}</main>
      <footer class="agl-footer"><span class="agl-footer-status" ${inGm?'data-agl-roster-status':''}>${inGm?(this.rosterDirty?'Unsaved party roster changes':'Party roster saved'):esc(this.notice||'Alpha • Crafting plans never consume materials.')}</span>
        ${inGm?`<div class="agl-footer-actions"><button type="button" data-action="gm-cancel">Cancel / Back</button><button type="button" class="agl-primary" data-action="roster-save" ${this.rosterDirty?'':'disabled'}>Save party roster</button></div>`:`<span class="agl-footer-note">Source: Actor inventory + Manager-tagged Items</span>`}
      </footer></div>`};
  }
  async _onRender(context,options){await super._onRender(context,options);if(!canOpenLedger()){await this.close?.({animate:false});return;}openLedgerWindows.add(this);this._events?.abort();this._events=new AbortController();
    this.element.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b)void this._click(b.dataset.action,b.dataset.id);},{signal:this._events.signal});
    this.element.querySelector('#agl-file')?.addEventListener('change',e=>this._upload(e),{signal:this._events.signal});
    this.element.addEventListener('change',e=>{
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
    },{signal:this._events.signal});
    this.element.querySelector('[data-agl-recipe-search]')?.addEventListener('input',e=>{this.query=e.target.value;this._updateRecipeGroups();},{signal:this._events.signal});
    this._updateRecipeGroups();this._syncRosterActions();if(this.view==='gathering'&&game.user.isGM&&this.gather.preview?.passed&&!this.gather.preview.revealDone)void this._animateGatherPreview();}
  async _click(action,id){try{checkPlayerLedger();if(action==='tab'){
        const next=id==='roster'?'gm':id;
        if(!game.user.isGM&&next==='gm')throw Error('GM only');
        if((this.view==='gm'||this.view==='roster')&&next!=='gm'&&!await this._leaveGmSetup())return;
        this.view=next;this.render();return;}
      if(action==='help'){this.previousView=this.view==='roster'?'gm':this.view;this.view='help';this.render();return;}
      if(action==='help-back'){this.view=(!game.user.isGM&&this.previousView==='gm')?'party':this.previousView;this.render();return;}
      if(action==='gm-cancel'){if(!game.user.isGM)throw Error('GM only');if(!await this._leaveGmSetup())return;this.view='party';this.render();return;}
      if(action==='actor'){this.actorId=id;this.render();return;}
      if(action==='recipe'){this.recipeId=id;this.render();return;}
      if(action==='recipe-group'){if(this.expandedRecipeGroups.has(id))this.expandedRecipeGroups.delete(id);else this.expandedRecipeGroups.add(id);this._updateRecipeGroups();return;}
      if(action==='recipe-groups-expand'||action==='recipe-groups-collapse'){const open=action==='recipe-groups-expand';for(const group of this.element.querySelectorAll('[data-recipe-group]')){if(open)this.expandedRecipeGroups.add(group.dataset.recipeGroup);else this.expandedRecipeGroups.delete(group.dataset.recipeGroup);}this._updateRecipeGroups();return;}
      if(action==='demo')throw Error('Demonstration mode was removed. Use an isolated test world with imported source definitions.');
      if(action==='toggle-player-access'){if(!game.user.isGM)throw Error('GM only');const next=!playerAccessEnabled();await setPlayerAccess(game,ID,next);this.notice=`Player interface ${next?'visible':'hidden'}. Actor progression and known recipes are unchanged.`;this.render();say(this.notice);return;}
      if(action==='manager'){if(!game.user.isGM)throw Error('GM only');const m=game.modules.get('ashen-gate-manager');const api=m?.active?m.api:null;if(api?.open)api.open();else say('Ashen Gate Manager is not enabled.',true);return;}
      if(action==='skilltree'){const module=game.modules.get('ashen-gate-skill-trees');const api=module?.active?module.api:null;
        if(!api?.open){say('Skill Trees prototype is not enabled.',true);return;}
        const tree=api.listTrees?.()?.find(t=>norm(professionFromTreeName(t.name))===norm(id));api.open({actorId:this.actorId,treeId:tree?.id});return;}
      if(action==='roster-open'){if(!game.user.isGM)throw Error('GM only');this.view='gm';this.render();return;}
      if(action==='roster-all'||action==='roster-clear'){if(!game.user.isGM)throw Error('GM only');
        for(const input of this.element.querySelectorAll('[data-roster-actor]')){const a=game.actors.get(input.dataset.rosterActor);input.checked=action==='roster-all'?Boolean(a?.hasPlayerOwner):false;}this._rememberRosterDraft();return;}
      if(action==='roster-save'){if(!game.user.isGM)throw Error('GM only');
        const ids=[...this.element.querySelectorAll('[data-roster-actor]:checked')].map(el=>el.dataset.rosterActor).filter(id=>game.actors.get(id)?.type==='character');
        await game.settings.set(ID,'partyRoster',ids);this.rosterDraft=null;this.demo=false;this.notice=`Active roster saved: ${ids.length} characters.`;this.render();say(this.notice);return;}
      if(action==='learn-recipe'){if(this.demo)throw Error('Demo records cannot be learned');
        const actor=this.actor,item=actor?.items?.get?.(id);if(!item)throw Error('Recipe Item is missing or no longer held');
        if(!owned(actor))throw Error('OWNER permission is required to learn');
        const check=canLearnRecipe(actor,item,agSourceId(item));if(!check.ok)throw Error(check.reason);
        const ok=await DialogV2.confirm({window:{title:`Learn ${esc(item.name)}?`},content:`<p>Consume <strong>one ${esc(item.name)}</strong> held by <strong>${esc(actor.name)}</strong> and permanently learn <code>${esc(agSourceId(item))}</code>?</p><p>The item cannot be refunded automatically after a completed learning action. Tier eligibility affects crafting, not learning.</p>`,modal:true,rejectClose:false});
        if(!ok)return;const learned=await learnRecipe(actor,item);this.notice=`${actor.name} learned ${learned.name}.`;this.render();say(this.notice);return;}
      if(action==='award-xp'){if(!game.user.isGM)throw Error('GM only');if(this.demo)throw Error('Demo mode cannot grant XP');
        const actor=this.actor;const input=this.element.querySelector(`[data-xp-input="${id}"]`);
        const points=Number(input?.value);if(!Number.isSafeInteger(points)||points<1||points>1000)throw Error('XP award must be between 1 and 1000');
        const confirmed=await DialogV2.confirm({window:{title:'Confirm Profession XP award'},content:`<p>Award <strong>${points} XP</strong> to <strong>${esc(actor?.name)}</strong> for <code>${esc(id)}</code>?</p><p>This changes the Actor’s Ledger-owned progress only, not Skill Trees XP or unapproved perk selection.</p>`,modal:true,rejectClose:false});
        if(!confirmed)return;const result=await awardXP(actor,id,points);this.notice=`${actor.name}: ${id} now level ${result.level} (+${points} XP).`;this.render();say(this.notice);return;}
      if(action==='gather-player-request'){if(this.demo)throw Error('Demo gathering unavailable');const actor=this.actor;
        if(!actor||!owned(actor))throw Error('Select a character you own');
        const profession=this.gather.profession;if(!GATHERING_PROFESSIONS.includes(profession))throw Error('Unknown gathering profession');
        const gmIds=(game.users?.contents??Array.from(game.users??[])).filter(u=>u.isGM).map(u=>u.id);
        if(!gmIds.length)throw Error('No GM account available');
        await ChatMessage.create({user:game.user.id,whisper:gmIds,speaker:ChatMessage.getSpeaker(),content:`<div class="agl-chat"><strong>Gathering request</strong><p>${esc(actor.name)} requests a ${esc(profession)} gathering attempt. GM: choose eligible scene resources and difficulty in the Profession Ledger Gathering tab.</p></div>`});
        this.notice='Gathering request sent privately to the GM.';this.render();say(this.notice);return;}
      if(action==='gather-roll-request'){if(!game.user.isGM)throw Error('GM only');
        const actor=game.actors.get(this.gather.actorId);if(!actor||!this.actors.some(a=>a.id===actor.id))throw Error('Choose an active roster character');
        if(!GATHERING_PROFESSIONS.includes(this.gather.profession))throw Error('Unknown gathering profession');
        const userIds=[...new Set([...(game.users?.contents??[]).filter(u=>u.isGM||actor.testUserPermission?.(u,'OWNER')).map(u=>u.id)])];
        await ChatMessage.create({user:game.user.id,whisper:userIds,speaker:ChatMessage.getSpeaker(),content:`<div class="agl-chat"><strong>Ashen Gate — Gathering Check</strong><p>${esc(actor.name)}: please make your GM-requested <b>${esc(this.gather.profession)}</b> check using your character sheet and report the total. The GM resolves the result.</p></div>`});
        this.notice=`Gathering check prompt sent for ${actor.name}.`;this.render();say(this.notice);return;}
      if(action==='gather-preview'){if(!game.user.isGM)throw Error('GM only');this._buildGatherPreview();this.render();return;}
      if(action==='gather-award'){if(!game.user.isGM)throw Error('GM only');await this._awardGathering();return;}
      if(action==='import'){if(!game.user.isGM)throw Error('GM only');this.element.querySelector('#agl-file')?.click();return;}
      if(action==='request')await this._request();
    }catch(e){console.error(`[${ID}]`,e);say(`Profession Ledger: ${e.message}`,true);}}
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
    if(this.demo)throw Error('Demo gathering unavailable');
    const {actorId,profession,materialId,tier,locationId}=this.gather;
    const actor=game.actors.get(actorId),item=materialChoices().find(i=>agSourceId(i)===materialId);
    const dc=Number(this.gather.dc),rollTotal=Number(this.gather.rollTotal),qty=Number(this.gather.qty);
    if(!actor||!this.actors.some(a=>a.id===actor.id))throw Error('Select an active roster character');
    if(!this.gather.eligibleProfessions.includes(profession)||!TIERS.includes(tier))throw Error('Select a valid gathering profession and material tier');
    if(!item)throw Error('Choose a player-visible imported MAT-* world Item');
    if(!Number.isSafeInteger(dc)||dc<1||dc>40)throw Error('Enter a GM-selected DC from 1 to 40');
    if(this.gather.rollTotal===''||!Number.isSafeInteger(rollTotal)||rollTotal<0||rollTotal>200)throw Error('Enter the reported check total (0–200)');
    if(!Number.isSafeInteger(qty)||qty<1||qty>99)throw Error('Enter reward quantity from 1 to 99');
    if(locationId&&!/^LOC-[A-Z0-9-]+$/.test(locationId))throw Error('Optional Location reference must be a LOC-* ID');
    const profItem=professionItems(actor).find(i=>norm(i.name)===norm(profession));
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
      content:`<p>Award <strong>${result.qty} × ${esc(item.name)}</strong> to <strong>${esc(actor.name)}</strong> for a ${esc(result.profession)} check of <b>${result.rollTotal}</b> against GM DC <b>${result.dc}</b>?</p>
        <p>Profession tier eligibility is enforced when the Actor has tracked progress; untracked characters require GM verification until Tim's import is fully tested. This awards the Item only. No automatic depletion or XP occurs.</p>`,modal:true,rejectClose:false});
    if(!confirmed)return;
    this.gatherBusy=true;
    try{await awardGatheringItem(actor,item,result.qty);
      // Success log is a private ChatMessage; do not store hidden Location pools in public world settings.
      const recipients=[...new Set((game.users?.contents??[]).filter(u=>u.isGM||actor.testUserPermission?.(u,'OWNER')).map(u=>u.id))];
      try{await ChatMessage.create({user:game.user.id,whisper:recipients,speaker:ChatMessage.getSpeaker(),content:`<div class="agl-chat"><strong>Gathering reward awarded</strong><p>${esc(actor.name)} received ${result.qty} × ${esc(item.name)} for ${esc(result.profession)}${result.locationId?` at ${esc(result.locationId)}`:''}.</p><p>Profession XP not awarded automatically. Suggested successful gather XP for ${esc(result.tier)}: ${gatherXP(result.tier)}.</p></div>`});}
      catch(err){console.warn(`[${ID}] Award succeeded but notification failed`,err);}
      this.gather.preview=null;this.gather.rollTotal='';this.notice=`Awarded ${result.qty} × ${item.name} to ${actor.name}.`;this.render();say(this.notice);
    }finally{this.gatherBusy=false;}
  }
  async _upload(e){checkPlayerLedger();if(!game.user.isGM)return;const f=e.target.files?.[0];if(!f)return;
    try{const data=normalizeLibrary(JSON.parse(await f.text()));const approved=await DialogV2.confirm({window:{title:'Import Ledger Catalog'},
      content:`<p>Source format: <b>${esc(data.sourceSchema)}</b>.</p><p>Import <b>${data.recipes.length} Recipes</b> and <b>${data.materials.length} Materials</b> into the Ledger's <b>world-visible read-only catalog</b>?</p><p>${data.importSummary.skippedRestricted} restricted/inactive entries excluded; ${data.importSummary.unmappedRecipes} recipes have no verified structured ingredients and cannot be planned.</p><p>This REPLACES the previous Ledger catalog. It will not create or alter Foundry Items, Actor progression, or inventories. <strong>Only player-visible records may be stored here.</strong></p>`,modal:true,rejectClose:false});
      if(!approved)return;await game.settings.set(ID,'libraryData',data);this.demo=false;this.recipeId=null;this.recipeGroupsInitialized=false;this.expandedRecipeGroups.clear();this.query='';this.notice=`Imported ${data.recipes.length} recipe definitions and ${data.materials.length} materials (${data.importSummary.skippedRestricted} restricted excluded; ${data.importSummary.unmappedRecipes} recipes unmapped).`;this.render();say('Profession Ledger catalog loaded. No world Items were modified.');
    }catch(err){console.error(err);say(`Ledger import failed: ${err.message}`,true);}}
  async _request(){if(this.demo)return;const recipe=this.recipe;if(!recipe)throw Error('No recipe selected');
    if(!this.actor||!owned(this.actor)||!knownRecipesOf(this.actor).includes(recipe.id))throw Error('Selected crafter must own this character and have learned this recipe');
    if(ACCESS_LEVELS[recipe.tier]){
      const tracked=professionFor(this.actor).find(p=>norm(p.name)===norm(recipe.profession));
      if(tracked?.level!==null&&tracked?.level!==undefined&&tracked.level<ACCESS_LEVELS[recipe.tier])throw Error(`Selected crafter requires Profession level ${ACCESS_LEVELS[recipe.tier]} to craft ${recipe.tier} recipes`);
    }
    const actors=this.actors,plan=planRecipe(recipe,actors,this.library.materials,{includeRestricted:game.user.isGM});if(!plan.ready||plan.unsupported)throw Error('Ingredients are unavailable or unmapped');
    const people=new Map();for(const a of plan.allocations){const actor=game.actors.get(a.actorId);if(!actor)throw Error('Actor no longer exists');
      const item=actor.items.get(a.itemId);if(!item||Number(item.system?.quantity??0)<a.quantity)throw Error(`${a.actorName} inventory changed; refresh plan`);
      const owners=game.users.filter(u=>u.active&&(!u.isGM)&&actor.testUserPermission(u,'OWNER'));
      const users=[...new Set([...owners.map(u=>u.id),...game.users.filter(u=>u.isGM).map(u=>u.id)])];
      if(!users.length)throw Error(`No owner/GM to receive request for ${a.actorName}`);
      const key=a.actorId; if(!people.has(key))people.set(key,{actor,users,rows:[]});people.get(key).rows.push(a);}
    if(!people.size)throw Error('No materials to request');
    const approved=await DialogV2.confirm({window:{title:'Send Crafting Permission Requests'},
      content:`<p>Send private requests for <b>${esc(recipe.name)}</b> to the owners of ${people.size} contributing characters?</p><p>This asks for explicit permission but <b>does not grant permission or consume anything</b>.</p>`,modal:true,rejectClose:false});
    if(!approved)return;
    for(const {actor,users,rows} of people.values())await ChatMessage.create({
      user:game.user.id,whisper:users,speaker:ChatMessage.getSpeaker(),
      content:`<div class="agl-chat"><strong>Ashen Gate — Crafting Permission Request</strong><p>${esc(game.user.name)} wants to craft <b>${esc(recipe.name)}</b> using materials held by <b>${esc(actor.name)}</b>:</p><ul>${rows.map(r=>`<li>${r.quantity} × ${esc(r.name)}</li>`).join('')}</ul><p>Owner: please reply <b>Approve</b> or <b>Decline</b> in chat. No inventory changes have occurred.</p></div>`
    });
    this.notice=`Sent ${people.size} owner-specific requests; no materials consumed.`;this.render();say(this.notice);
  }
}
Hooks.once('init',()=>{
  // Existing player-facing installations stay visible on upgrade (PA-01). This is
  // an existing player UI, not the default for a brand-new future module.
  game.settings.register(ID,PLAYER_ACCESS_SETTING,{name:'Player Access — Profession Ledger',hint:'GM only: reveal or hide the player Ledger interface; does not disable Profession mechanics or erase character data.',scope:'world',config:true,type:Boolean,default:true,
    onChange:value=>syncLedgerPlayerAccess(value)});
  game.settings.register(ID,'libraryData',{name:'Profession Ledger catalog',scope:'world',config:false,type:Object,
    default:{schema:SCHEMA,source:'empty',recipes:[],materials:[]},onChange:()=>current?.render()});
  game.settings.register(ID,'partyRoster',{name:'Active party Actor IDs',scope:'world',config:false,type:Array,default:[],onChange:()=>{if(current?.rendered&&!current.demo)current.render();}});
  game.settings.registerMenu(ID,'open',{name:'Ashen Gate Profession Ledger',label:'Open Profession Ledger',
    hint:'Individual and party professions, materials, recipes and collaborative crafting plans. Player interface visibility is GM-controlled.',icon:'fa-solid fa-book-open',type:LedgerApp,restricted:false});
});
Hooks.once('ready',()=>{
  const module=game.modules.get(ID);if(!module)return;
  module.api={playerAccess:{contract:PLAYER_ACCESS_CONTRACT,getState:()=>accessState(game,ID),setEnabled:enabled=>setPlayerAccess(game,ID,enabled)},
    open:({actorId=null,view=null}={})=>{checkPlayerLedger();current??=new LedgerApp();if(actorId)current.actorId=actorId;if(view)current.view=!game.user.isGM&&['roster','gm'].includes(view)?'party':(view==='roster'?'gm':view);current.demo=false;current.render({force:true});return current;},
    getProfessionProgress:(actor,profId)=>{checkPlayerLedger();if(!actor?.testUserPermission?.(game.user,'OBSERVER')&&!game.user.isGM)throw Error('Actor access denied');return progressOf(actor,profId);},
    awardProfessionXP:(actor,profId,amount)=>awardXP(actor,profId,amount),
    getKnownRecipes:(actor)=>{checkPlayerLedger();if(!actor?.testUserPermission?.(game.user,'OBSERVER')&&!game.user.isGM)throw Error('Actor access denied');return knownRecipesOf(actor);},
    inspectProfessionPerkChoices:(actor,profId)=>{checkPlayerLedger();if(!game.user.isGM&&!actor?.testUserPermission?.(game.user,'OBSERVER'))throw Error('Actor access denied');return progressOf(actor,profId);},
    version:'0.7.2',source:'Actor inventories, Manager tagged Items, and optional Ledger catalog'};
  Hooks.on('updateActor',()=>{if(current?.rendered&&!current.demo)current.render();});
  Hooks.on('createItem',()=>{if(current?.rendered&&!current.demo)current.render();});
  Hooks.on('updateItem',()=>{if(current?.rendered&&!current.demo)current.render();});
  // Handle Actor Directory already rendered before ready hook ran.
  addActorDirectoryLauncher(globalThis.ui?.actors, globalThis.ui?.actors?.element);
  console.info(`[${ID}] v0.7.2 ready. Open from the Actors directory, Module Settings or game.modules.get('${ID}').api.open()`);
});

/** Open Ledger on the Actors directory for both GM and players; idempotent across renders. */
function addActorDirectoryLauncher(application, renderedElement){
  mountLauncher(launcherRoot(application,renderedElement),{moduleId:ID,label:'Profession Ledger',icon:'fa-solid fa-book-open',
    onClick:()=>game.modules.get(ID)?.api?.open(),visible:canOpenLedger()});
}
Hooks.on('closeApplicationV2',app=>openLedgerWindows.delete(app));
Hooks.on('renderActorDirectory',(app,el)=>addActorDirectoryLauncher(app,el));
