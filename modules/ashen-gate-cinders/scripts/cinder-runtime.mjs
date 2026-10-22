/** Cinders, Foundry side: the GM-only Cinder registry, bind / transfer / unbind, Push and normal-use Backfire, chat cards.
 * Records live in this module's GM-only Journal. A bearer's progress is written to their Cinder tree through Skill Trees' public
 * api.accounts (ag-tree-accounts/1), so the tree window keeps working; Skill Trees knows nothing about Cinders. */
import {CINDER_CONTRACT,CINDER_WALLET_CAP,cleanAccount,normalizeRegistry,createInstance,bindInstance,unbindInstance,transferInstance,withProgression,boundTo,bearerInstance,
  planMigration,powerBlock,availableModes,planPush,resolveBackfire,categoriesFor,backfireBlock,effectProblem,collectModifiers,validateDefinition,
  MODIFIER_CONTRACT,MODIFIER_SCOPE,MODIFIER_TARGETS,validateModifiers,blockModifiers,isLevelBackup,LEVEL_BACKUP_MESSAGE,definitionArt,isPushable} from './cinder.mjs';
import {SLOT_KIND,SLOT_LABEL,bearerItemsOf,bearerTag,planBearerItems,bearerItemData,playerUpdateProblem} from './bearer-items.mjs';
import {SOCKETS_CONTRACT,SOCKETS_HOOK,MAX_SOCKETS,normalizeSockets,socketMirror,socketPlan,applySocketOp,withoutItem} from './sockets.mjs';
import {cleanArt,artInput,resolveArt} from './orb.mjs';

export const CINDER_HOOK='ashenGateCinder.changed';
export const MAX_CINDERS_SETTING='maxCindersPerActor';
export const INITIAL_POINTS_SETTING='initialCinderPoints';
export const SOCKETS_SETTING='socketsPerCinder';
export const STORE_FLAG='gmRecords';
const walletOf=definitionId=>`cinder:${definitionId}`;
const emptyAccount=()=>({awarded:0,unlocks:[],grants:[],revision:0});

/**
 * deps: module, socket, strain (Strain runtime), lookup(id) → world definition hit, escape,
 * trees() → {status: 'ok'|'missing'|'old', accounts?, api?, message?} (Skill Trees, looked up at call time),
 * blocked() → a reason while Cinders must stay off, else null.
 * 0.10.0: pushOffer() → whether this user is offered a Push when they use a signature ability (world switch and their own setting);
 * offerPush({actor, ability, modes}) → the chosen mode id, or null for "Use without Push" (the dialog; absent = never offered).
 */
export function createCinders(deps){
  const {module,socket,strain,lookup,escape,trees,blocked}=deps;
  const sourceOf=doc=>doc?.flags?.['ashen-gate-manager']?.source??null;
  const requireOn=()=>{const why=blocked();if(why)throw Error(why);};
  const requireGM=()=>{requireOn();if(!game.user?.isGM)throw Error('GM only');};
  const setting=key=>{const v=game.settings.get(module,key);return Number.isSafeInteger(v)?v:1;};
  /** Skill Trees' accounts API; throws a clear message when Skill Trees is missing or too old. */
  const accounts=()=>{const t=trees();if(t.status!=='ok')throw Error(t.message);return t.accounts;};

  // ---- Registry (this module's GM-only Journal) ----
  const store=()=>game.user?.isGM?game.journal?.contents?.find(d=>d.flags?.[module]?.[STORE_FLAG]===true)??null:null;
  const readRegistry=()=>{requireGM();return normalizeRegistry(store()?.flags?.[module]?.registry);};
  async function createStore(){
    const d=await JournalEntry.create({name:'[AG] Cinders — GM Records',ownership:{default:CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE},
      flags:{[module]:{[STORE_FLAG]:true,registry:{schema:'ag-cinder-instances/1',instances:[]}}}});
    if(!d)throw Error('Unable to create the GM-only Cinders Journal');
    return d;
  }
  async function saveRegistry(registry){let s=store();if(!s)s=await createStore();await s.setFlag(module,'registry',registry);}
  let chain=Promise.resolve();
  // One registry change at a time (bind, transfer, unbind, progress sync), so two GM actions cannot overwrite each other.
  const withRegistry=fn=>{const run=chain.then(fn);chain=run.catch(()=>{});return run;};

  const cinderTree=definitionId=>accounts().treeBySource(definitionId,{kind:'cinder_milestone'});
  const definition=id=>{const hit=lookup(id);return hit?.status==='ok'?sourceOf(hit.document)?.definition??null:null;};
  const definitionName=id=>{const hit=lookup(id);return hit?.status==='ok'?hit.document.name:id;};
  /** 0.9.0: the art the MUT-* definition gives its Cinders (cinder.art), or null. */
  const defArt=id=>definitionArt(definition(id));
  const actorById=id=>game.actors?.get?.(id)??null;
  const notBackup=actor=>{if(isLevelBackup(actor))throw Error(LEVEL_BACKUP_MESSAGE);};
  const playable=()=>(game.actors?.contents??[]).filter(a=>!isLevelBackup(a));
  const changed=(kind,instance,extra={})=>Hooks.callAll(CINDER_HOOK,{kind,instanceId:instance.instanceId,definitionId:instance.definitionId,actorId:instance.bearer?.actorId??null,...extra});
  const socketsChanged=(kind,instance,actorId,extra={})=>Hooks.callAll(SOCKETS_HOOK,{kind,hostKind:'cinder',instanceId:instance.instanceId,definitionId:instance.definitionId,actorId,...extra});
  const itemOf=(actor,id)=>id?actor?.items?.get?.(id)??[...(actor?.items??[])].find(i=>i.id===id)??null:null;
  /** The item's marker (flags.<module>.attachedTo = {instanceId, slot}, null when detached). The registry is the truth; Repair fixes markers. */
  const markerOf=item=>item?.flags?.[module]?.attachedTo??null;
  async function setMarker(item,value){if(item&&JSON.stringify(markerOf(item))!==JSON.stringify(value))await item.setFlag(module,'attachedTo',value);}
  async function clearMarkers(actor,entries){for(const a of entries??[])await setMarker(itemOf(actor,a.itemId),null);}

  // ---- Bearer: the tree account (through Skill Trees) and a pointer in this module's Actor flags ----
  const pointersOf=actor=>Array.isArray(actor?.flags?.[module]?.cinders)?actor.flags[module].cinders.filter(p=>p&&typeof p.instanceId==='string'):[];
  async function setPointers(actor,pointers){await actor.setFlag(module,'cinders',pointers);}
  function treeFor(instance){const t=cinderTree(instance.definitionId);if(!t)throw Error(`No Cinder tree uses ${instance.definitionId}. Import it into Skill Trees first.`);return t;}
  const pointerData=instance=>({instanceId:instance.instanceId,definitionId:instance.definitionId,name:definitionName(instance.definitionId),sockets:socketMirror(instance.sockets),art:instance.art??null,...withDefaultArt(instance.definitionId)});
  // 0.9.0: the definition's art copied to the bearer's pointer (a player may not see the MUT-* record). Left out when there is none,
  // so pointers saved before read the same.
  const withDefaultArt=definitionId=>{const d=defArt(definitionId);return d?{defaultArt:d}:{};};
  async function writeBearer(actor,instance){
    const tree=treeFor(instance);
    await accounts().setAccount(actor,tree.id,instance.progression);
    await setPointers(actor,[...pointersOf(actor).filter(p=>p.instanceId!==instance.instanceId),pointerData(instance)]);
  }
  async function clearBearer(actor,instance){
    const tree=cinderTree(instance.definitionId);
    if(tree)await accounts().setAccount(actor,tree.id,emptyAccount());
    await setPointers(actor,pointersOf(actor).filter(p=>p.instanceId!==instance.instanceId));
  }
  const hasProgress=(actor,definitionId)=>{const t=cinderTree(definitionId);if(!t)return false;const a=cleanAccount(accounts().account(actor,t.id));return a.awarded>0||a.unlocks.length>0;};

  // ---- Bearer items (0.10.0): the signature ability and passive a Cinder gives its bearer from the moment it is bound ----
  /** This module's tagged copies on a character: [{id, item, tag}]. Skill Trees' perk copies are never in this list. */
  const taggedOn=actor=>[...(actor?.items??[])].map(item=>({id:item.id,item,tag:bearerTag(item,module)})).filter(x=>x.tag);
  /** What each Cinder the character bears should give it. items null = its definition cannot be read now (its copies are left alone). */
  const bearerWant=(registry,actorId)=>boundTo(registry,actorId).map(inst=>{const def=definition(inst.definitionId);
    return {instanceId:inst.instanceId,definitionId:inst.definitionId,items:def?bearerItemsOf(def):null};});
  /** The world Item a bearer item is copied from: {doc}, or {problem} when it is missing or of the wrong kind. */
  function bearerSource(sourceId,slot){
    const hit=lookup(sourceId),label=SLOT_LABEL[slot].toLowerCase();
    if(hit?.status!=='ok'||hit.document?.documentName!=='Item')return {problem:`${sourceId} (the Cinder's ${label}) is not in this world as an Item. Import it through General Manager.`};
    const kind=powerBlock(sourceOf(hit.document)?.definition)?.kind;
    if(kind!==SLOT_KIND[slot])return {problem:`${sourceId} is ${kind?`a ${kind}`:'not a Power with a power block'}, not a ${SLOT_KIND[slot]}, so it is not given as the Cinder's ${label}.`};
    return {doc:hit.document};
  }
  /** Make one character carry exactly the bearer items of the Cinders it bears (the registry is the truth). Idempotent: missing copies
   * are created, duplicates and copies for Cinders it does not bear are removed; untagged items (Skill Trees' perks included) are never touched.
   * Resolves {done: [text], problems: [text]}. */
  async function syncBearerItems(actor,registry){
    const plan=planBearerItems(taggedOn(actor),bearerWant(registry,actor.id)),done=[],problems=[];
    for(const r of plan.remove){const item=itemOf(actor,r.id);if(!item)continue;await item.delete();done.push(`${actor.name}: removed ${item.name}`);}
    const data=[];
    for(const c of plan.create){const src=bearerSource(c.sourceId,c.slot);if(src.problem)problems.push(`${actor.name}: ${src.problem}`);else data.push(bearerItemData(src.doc.toObject(),module,c));}
    if(data.length)for(const item of await actor.createEmbeddedDocuments('Item',data)??[])done.push(`${actor.name}: gained ${item.name}`);
    return {done,problems};
  }
  const bearerSync=(actor,registry)=>syncBearerItems(actor,registry).catch(error=>({done:[],problems:[`${actor.name}: ${error?.message??error}`]}));
  const WHY={duplicate:'a second copy','replaced':'the Cinder now gives another power','not on the Cinder':'the Cinder gives none','not borne':'does not bear that Cinder'};
  /** Check rows: bearer items missing (repairable when the source is in the world), extra copies, sources missing or of the wrong kind. */
  function bearerReport(registry){
    const rows=[];
    for(const actor of playable()){
      const plan=planBearerItems(taggedOn(actor),bearerWant(registry,actor.id));
      for(const c of plan.create){const src=bearerSource(c.sourceId,c.slot),name=definitionName(c.definitionId);
        rows.push(src.problem?{instanceId:c.instanceId,name,actorId:actor.id,text:`${actor.name}: ${src.problem}`}
          :{instanceId:c.instanceId,name,actorId:actor.id,repair:true,text:`${actor.name} is missing this Cinder's ${SLOT_LABEL[c.slot].toLowerCase()} (${c.sourceId}).`});}
      for(const r of plan.remove)rows.push({instanceId:r.instanceId,name:itemOf(actor,r.id)?.name??r.id,actorId:actor.id,repair:true,
        text:`${actor.name} has an extra ${SLOT_LABEL[r.slot].toLowerCase()} item (${WHY[r.why]??r.why}).`});
    }
    return rows;
  }

  // ---- GM operations ----
  /** New unbound Cinder. Its art is the definition's art (0.9.0) unless options.art names another image. */
  async function create(definitionId,{art}={}){
    requireGM();
    if(lookup(definitionId)?.status!=='ok')throw Error(`${definitionId} is not in this world. Import it through General Manager first.`);
    const own=art===undefined?defArt(definitionId):artInput(art);
    return withRegistry(async()=>{
      const {registry,instance}=createInstance(readRegistry(),definitionId,{instanceId:`cinst_${foundry.utils.randomID(16)}`,at:Date.now(),art:own});
      await saveRegistry(registry);changed('create',instance);return instance;
    });
  }
  async function bind(instanceId,actor){
    requireGM();if(!actor)throw Error('Choose a character');notBackup(actor);accounts();
    return withRegistry(async()=>{
      const {registry,instance,initialAwarded}=bindInstance(readRegistry(),instanceId,actor.id,{max:setting(MAX_CINDERS_SETTING),at:Date.now(),initialPoints:game.settings.get(module,INITIAL_POINTS_SETTING)??1});
      if(hasProgress(actor,instance.definitionId))throw Error(`${actor.name} already has progress on this Cinder's tree from before Cinders. Use Move existing Cinder progress first.`);
      try{await writeBearer(actor,instance);await saveRegistry(registry);}
      catch(error){await clearBearer(actor,instance).catch(e=>console.error(`[${module}] Could not undo bind`,e));throw error;}
      // 0.10.0: the signature ability and passive. A missing source never undoes the bind; Manage → Check names it, Repair gives it later.
      const bearerItems=await bearerSync(actor,registry);
      changed('bind',instance);return {instance,initialAwarded,bearerItems};
    });
  }
  /** Move a bound Cinder to another character: points and unlocks go with it; Strain and Backfire conditions stay where they are. */
  async function transfer(instanceId,toActor){
    requireGM();if(!toActor)throw Error('Choose a character');notBackup(toActor);accounts();
    return withRegistry(async()=>{
      const {registry,instance,from,detached}=transferInstance(readRegistry(),instanceId,toActor.id,{max:setting(MAX_CINDERS_SETTING),at:Date.now()});
      if(hasProgress(toActor,instance.definitionId))throw Error(`${toActor.name} already has progress on this Cinder's tree from before Cinders. Use Move existing Cinder progress first.`);
      // New bearer first, then the record, then the old bearer: an interruption never leaves the Cinder with nobody.
      try{await writeBearer(toActor,instance);await saveRegistry(registry);}
      catch(error){await clearBearer(toActor,instance).catch(e=>console.error(`[${module}] Could not undo transfer`,e));throw error;}
      const bearerItems=await bearerSync(toActor,registry);
      const old=actorById(from);let left=null;
      if(old){try{await clearBearer(old,instance);await clearMarkers(old,detached);const r=await syncBearerItems(old,registry);bearerItems.done.push(...r.done);}catch(error){left=error.message;}}
      changed('transfer',instance,{fromActorId:from});if(detached.length)socketsChanged('transfer',instance,from);
      if(left)throw Error(`Cinder moved to ${toActor.name}, but cleaning up the previous bearer failed: ${left}. Run Manage → Check.`);
      return {instance,from,bearerItems};
    });
  }
  async function unbind(instanceId){
    requireGM();
    return withRegistry(async()=>{
      const {registry,instance,from,detached}=unbindInstance(readRegistry(),instanceId);
      await saveRegistry(registry);
      const old=actorById(from);if(old){await clearBearer(old,instance);await clearMarkers(old,detached);await syncBearerItems(old,registry);}
      changed('unbind',instance,{fromActorId:from});if(detached.length)socketsChanged('unbind',instance,from);return {instance,from};
    });
  }
  /**
   * Re-hook (0.7.0, GM): after a character's Actor data was replaced in place (Character Hub's level-backup Restore keeps the
   * Actor id), rewrite everything this module mirrors on it from the records, which stay the truth. Never changes a record.
   *   - a bearer pointer for each Cinder bound to it (sockets and art copied from the record); pointers to Cinders it does not bear dropped;
   *   - its Cinder tree accounts set from each Cinder's progression, and Cinder progress on trees of Cinders it does not bear
   *     removed (through Skill Trees; skipped, and said so, when Skill Trees is missing);
   *   - item socket markers: set for its items in its Cinders' sockets, cleared on the rest;
   *   - (0.10.0) its bearer items: the signature ability and passive of each Cinder it bears, missing ones given, extra ones removed.
   * Re-runnable. Resolves {instances: [instanceId], done: [text]}.
   */
  async function rehook(actor){
    requireGM();if(!actor?.id)throw Error('Choose a character');notBackup(actor);
    return withRegistry(async()=>{
      const registry=readRegistry(),mine=boundTo(registry,actor.id),done=[],t=trees();
      const want=mine.map(pointerData),before=JSON.stringify(pointersOf(actor));
      if(JSON.stringify(want)!==before){await setPointers(actor,want);done.push(`${actor.name}: bearer links rewritten (${mine.length} Cinder${mine.length===1?'':'s'})`);}
      if(t.status==='ok'){
        for(const inst of mine){const tree=cinderTree(inst.definitionId);if(!tree)continue;
          const r=await t.accounts.setAccount(actor,tree.id,inst.progression);if(r.given?.length||r.removed?.length)done.push(`${actor.name}: ${[...r.given.map(x=>`+${x}`),...r.removed.map(x=>`−${x}`)].join(', ')}`);}
        const stray=new Set(t.accounts.grants(actor).filter(g=>g.wallet?.startsWith('cinder:')).map(g=>g.wallet.slice(7)).filter(d=>registry.instances.some(i=>i.definitionId===d)&&!bearerInstance(registry,actor.id,d)));
        for(const d of stray){const tree=cinderTree(d);if(!tree)continue;const r=await t.accounts.setAccount(actor,tree.id,emptyAccount());done.push(`${actor.name}: removed ${r.removed.join(', ')}`);}
      }else done.push(`Cinder tree progress not checked: ${t.message}`);
      for(const item of actor.items??[]){
        const inst=mine.find(i=>i.sockets.attached.some(a=>a.itemId===item.id)),slot=inst?.sockets.attached.find(a=>a.itemId===item.id).slot;
        const marker=inst?{instanceId:inst.instanceId,slot}:null;
        if(JSON.stringify(markerOf(item))!==JSON.stringify(marker)&&(marker||markerOf(item))){await setMarker(item,marker);done.push(`${actor.name}: ${item.name} ${marker?'marked attached':'unmarked'}`);}
      }
      const items=await bearerSync(actor,registry);done.push(...items.done,...items.problems);
      for(const inst of mine)changed('rehook',inst);
      return {instances:mine.map(i=>i.instanceId),done};
    });
  }
  /** Deleted bearer: the Cinder is kept with its progress, marked lost (active GM only). */
  async function onDeleteActor(actor){
    if(blocked()||!game.user?.isGM||game.users?.activeGM?.id!==game.user.id||!store())return;
    await withRegistry(async()=>{
      let registry=readRegistry(),hit=false;
      for(const inst of boundTo(registry,actor.id)){({registry}=unbindInstance(registry,inst.instanceId,{lost:true}));hit=true;}
      if(hit){await saveRegistry(registry);ui.notifications?.warn?.(`${actor.name} was deleted while bearing a Cinder. The Cinder and its progress are kept as Lost in Cinders → Manage.`);}
    }).catch(error=>console.error(`[${module}] Could not mark Cinder lost`,error));
  }
  /** Skill Trees hook after any account write: a bearer's change goes onto the Cinder record too. */
  async function onProgressChanged(data){
    if(blocked()||data?.kind!=='cinder_milestone'||!game.user?.isGM||game.users?.activeGM?.id!==game.user.id||!store())return;
    await withRegistry(async()=>{
      const registry=readRegistry(),inst=bearerInstance(registry,data.actorId,data.sourceRef);
      if(!inst||JSON.stringify(cleanAccount(inst.progression))===JSON.stringify(cleanAccount(data.account)))return;
      const next=withProgression(registry,data.actorId,data.sourceRef,data.account);
      await saveRegistry(next.registry);changed('progress',next.instance);
    }).catch(error=>console.error(`[${module}] Could not record Cinder progress`,error));
  }
  /** Skill Trees hook before points or an unlock: once a Cinder of a kind exists, only its bearer progresses on that tree. */
  function onCheckProgress(check){
    if(blocked()||check?.kind!=='cinder_milestone')return;
    if(isLevelBackup(actorById(check.actorId))){check.blocked=LEVEL_BACKUP_MESSAGE;return;}
    if(!game.user?.isGM||!store())return;
    const mine=readRegistry().instances.filter(i=>i.definitionId===check.sourceRef);
    if(mine.length&&!mine.some(i=>i.bearer?.actorId===check.actorId))check.blocked=`${check.actorName||'This character'} does not bear this Cinder. Bind or transfer it in Cinders → Manage first.`;
  }
  function migrationPlan(){
    requireGM();
    const acc=accounts(),cinderTrees=(trees().api?.listTrees?.()??[]).filter(t=>t.provider?.kind==='cinder_milestone'&&t.sourceRef);
    const actors=playable().map(a=>({actorId:a.id,name:a.name,accounts:Object.fromEntries(cinderTrees.map(t=>[walletOf(t.sourceRef),acc.account(a,t.id)]))}));
    return planMigration(readRegistry(),actors,{max:setting(MAX_CINDERS_SETTING)});
  }
  /** Turn per-character Cinder tree progress (no Cinder yet) into Cinders bound to that character. Items stay; safe to run again. */
  async function migrate({dryRun=true}={}){
    requireGM();
    const rows=migrationPlan();
    if(dryRun)return rows;
    return withRegistry(async()=>{
      let registry=readRegistry();
      for(const row of rows.filter(r=>r.action==='create')){
        const instanceId=`cinst_${foundry.utils.randomID(16)}`,at=Date.now();
        ({registry}=createInstance(registry,row.definitionId,{instanceId,at}));
        registry.instances=registry.instances.map(i=>i.instanceId===instanceId?{...i,progression:row.account,migratedFrom:{actorId:row.actorId,at}}:i);
        // max: Infinity; going over the limit is reported in the plan, not refused (nothing is taken away).
        ({registry}=bindInstance(registry,instanceId,row.actorId,{max:Infinity,at,initialPoints:0}));
        const actor=actorById(row.actorId);
        if(actor)await setPointers(actor,[...pointersOf(actor).filter(p=>p.definitionId!==row.definitionId),{instanceId,definitionId:row.definitionId,name:definitionName(row.definitionId)}]);
        row.instanceId=instanceId;
      }
      await saveRegistry(registry);
      return rows;
    });
  }
  /** One-time adopt of what Skill Trees 0.15.0/0.16.0 saved (Cinder records, bearer pointers). Re-runnable: ids already here are skipped. */
  async function adoptLegacy(){
    requireGM();
    const t=trees();if(t.status!=='ok'||typeof t.accounts.legacyData!=='function')return {instances:0,pointers:0};
    const legacy=t.accounts.legacyData();
    return withRegistry(async()=>{
      const registry=readRegistry(),known=new Set(registry.instances.map(i=>i.instanceId));
      const incoming=normalizeRegistry(legacy.registry).instances.filter(i=>!known.has(i.instanceId));
      if(incoming.length)await saveRegistry({...registry,instances:[...registry.instances,...incoming]});
      let pointers=0;
      for(const {actorId,pointers:list} of legacy.pointers??[]){
        const actor=actorById(actorId);if(!actor)continue;
        const have=new Set(pointersOf(actor).map(p=>p.instanceId)),add=(Array.isArray(list)?list:[]).filter(p=>p?.instanceId&&!have.has(p.instanceId));
        if(add.length){await setPointers(actor,[...pointersOf(actor),...add]);pointers+=add.length;}
      }
      return {instances:incoming.length,pointers};
    });
  }
  /** GM check: bearers that no longer exist, tree accounts out of date, Cinder powers on the wrong character. Read-only. */
  function report(){
    requireGM();
    const registry=readRegistry(),rows=bearerReport(registry),t=trees();
    if(t.status!=='ok'){rows.push({instanceId:null,name:'Skill Trees',text:t.message});return rows;}
    for(const inst of registry.instances){
      const name=definitionName(inst.definitionId),actor=inst.bearer?actorById(inst.bearer.actorId):null,tree=cinderTree(inst.definitionId);
      if(!tree)rows.push({instanceId:inst.instanceId,name,text:`No Cinder tree uses ${inst.definitionId}; its powers cannot be unlocked.`});
      if(inst.bearer&&!actor)rows.push({instanceId:inst.instanceId,name,text:'Its bearer is not in this world.'});
      if(actor&&tree){
        const mirror=cleanAccount(t.accounts.account(actor,tree.id));
        if(JSON.stringify(mirror.unlocks)!==JSON.stringify(inst.progression.unlocks)||mirror.awarded!==inst.progression.awarded)rows.push({instanceId:inst.instanceId,name,repair:true,text:`${actor.name}'s tree progress differs from the Cinder.`});
      }
    }
    for(const actor of playable())for(const g of t.accounts.grants(actor)){
      if(!g.wallet?.startsWith('cinder:'))continue;const definitionId=g.wallet.slice(7);
      if(registry.instances.some(i=>i.definitionId===definitionId)&&!bearerInstance(registry,actor.id,definitionId))
        rows.push({instanceId:null,name:actor.items?.get?.(g.itemId)?.name??g.perkId,actorId:actor.id,repair:true,text:`${actor.name} has a Cinder power (${g.perkId}) but does not bear that Cinder.`});
    }
    rows.push(...socketReport(registry));
    return rows;
  }
  /** Repair what report() flags: bearers' tree progress rewritten from the Cinder; Cinder progress taken off non-bearers; (0.10.0) missing
   * bearer items given and extra copies removed (the re-runnable "give missing bearer items" step for Cinders bound before 0.10.0). Never changes a Cinder. */
  async function repair(){
    requireGM();
    const acc=accounts();
    return withRegistry(async()=>{
      const registry=readRegistry(),done=[];
      for(const actor of playable()){const r=await bearerSync(actor,registry);done.push(...r.done,...r.problems);}
      for(const inst of registry.instances){const actor=inst.bearer?actorById(inst.bearer.actorId):null,tree=cinderTree(inst.definitionId);if(!actor||!tree)continue;
        const r=await acc.setAccount(actor,tree.id,inst.progression);if(r.given.length||r.removed.length)done.push(`${actor.name}: ${[...r.given.map(x=>`+${x}`),...r.removed.map(x=>`−${x}`)].join(', ')}`);}
      for(const actor of playable()){
        const stray=new Set(acc.grants(actor).filter(g=>g.wallet?.startsWith('cinder:')).map(g=>g.wallet.slice(7)).filter(d=>registry.instances.some(i=>i.definitionId===d)&&!bearerInstance(registry,actor.id,d)));
        for(const d of stray){const tree=cinderTree(d);if(!tree)continue;const r=await acc.setAccount(actor,tree.id,emptyAccount());done.push(`${actor.name}: removed ${r.removed.join(', ')}`);}
      }
      done.push(...await socketRepair(registry));
      return done;
    });
  }

  // ---- What a character can do (the bearer's owner can read it from the Items on the sheet; the GM re-checks on Push) ----
  /** Unlocked Cinder powers of one Cinder, from the perk Items Skill Trees gave: [{powerId, name, nodeId, item, power}]. */
  function sheetPowers(actor,definitionId){
    const t=trees();if(t.status!=='ok')return [];
    return t.accounts.grants(actor).filter(g=>g.wallet===walletOf(definitionId)).map(g=>{
      const item=actor.items?.get?.(g.itemId)??[...(actor.items??[])].find(i=>i.id===g.itemId);
      return {powerId:g.perkId,name:item?.name??g.perkId,nodeId:g.nodeId,item,power:powerBlock(sourceOf(item)?.definition??null)};
    }).filter(p=>p.powerId&&p.item);
  }
  /** Cinder modifiers from the PERK-* Items on the character (their imported modifiers block), one entry per perk id:
   * [{sourceId, name, itemId, modifiers}]. They count for every Cinder the character bears, narrowed by applies / requires. */
  function perkSources(actor){
    const seen=new Set(),out=[];
    for(const item of actor?.items??[]){
      const src=sourceOf(item),id=src?.sourceId;
      if(typeof id!=='string'||!id.startsWith('PERK-')||seen.has(id))continue;
      const modifiers=blockModifiers(src.definition);if(!modifiers.length)continue;
      seen.add(id);out.push({sourceId:id,name:item.name??id,itemId:item.id??null,modifiers});
    }
    return out;
  }
  // ---- Sockets (0.3.0): items attached to a Cinder; their cinder modifiers count while attached and active ----
  /** Why an Item cannot go in a Cinder socket, or null. It fits when it is an imported ITEM-* whose record has cinder modifiers. */
  function socketItemProblem(item,{user=game.user}={}){
    if(!item)return 'That item is not in the bearer\'s inventory';
    const src=sourceOf(item);
    if(!String(src?.sourceId??'').startsWith('ITEM-'))return `${item.name} is not an Ashen Gate item (ITEM-*) imported by General Manager`;
    if(!blockModifiers(src.definition).length)return `${item.name} has no Cinder modifiers, so it does not fit a socket`;
    if(!user?.isGM&&src.visibility==='gm')return 'GM only';
    return null;
  }
  const itemSource=item=>({sourceId:sourceOf(item)?.sourceId??item?.id,name:item?.name??'',modifiers:blockModifiers(sourceOf(item)?.definition)});
  /** Sockets of one Cinder on its bearer: rawSockets is the registry entry (GM) or the bearer's pointer copy (anyone who can read the actor). */
  function socketState(actor,definitionId,rawSockets){
    const sockets=normalizeSockets(rawSockets),powers=sheetPowers(actor,definitionId),perks=perkSources(actor);
    const hostBonus=collectModifiers(powers,'sockets.count',{extra:perks}).total;
    const itemBonus=ids=>collectModifiers(powers,'sockets.count',{extra:[...perks,...ids.map(id=>itemSource(itemOf(actor,id)))]}).total-hostBonus;
    const plan=socketPlan(sockets,{setting:game.settings.get(module,SOCKETS_SETTING),hostBonus,itemBonus,present:id=>Boolean(itemOf(actor,id))});
    return {sockets,plan,powers,perks,activeItems:plan.slots.filter(x=>x.active).map(x=>itemSource(itemOf(actor,x.itemId)))};
  }
  const pointerFor=(actor,instanceId)=>pointersOf(actor).find(p=>p.instanceId===instanceId)??null;
  const canRead=actor=>Boolean(actor)&&(game.user?.isGM||actor.isOwner);
  const requirePlayerAccess=()=>{if(!game.user?.isGM&&!deps.playerAccess())throw Error('The GM has hidden Cinders.');};
  /** The Cinder's tree and its unspent points, through Skill Trees' public reads (listTrees, pointsSummary: GM or the owner). Null when not available. */
  function treePoints(actor,definitionId){
    const t=trees();if(t.status!=='ok')return {treeId:null,unspent:null};
    let tree=null,row=null;
    try{tree=(t.api.listTrees?.()??[]).find(x=>x?.provider?.kind==='cinder_milestone'&&x.sourceRef===definitionId)??null;}catch{tree=null;}
    if(!tree)return {treeId:null,unspent:null};
    try{row=(t.api.pointsSummary?.(actor)??[]).find(r=>r.treeId===tree.id)??null;}catch{row=null;}
    return {treeId:tree.id,unspent:Number.isSafeInteger(row?.available)?row.available:null};
  }
  /** The bearer items of one Cinder on the character: {active: {powerId, name, itemId, summary, modes} | null, passive: {powerId, name, itemId, summary} | null}. */
  function signatureOf(actor,instanceId,modes){
    const out={active:null,passive:null};
    for(const {item,tag} of taggedOn(actor)){
      if(tag.instanceId!==instanceId||out[tag.slot])continue;
      const power=powerBlock(sourceOf(item)?.definition);
      out[tag.slot]={powerId:tag.sourceId,name:item.name??tag.sourceId,itemId:item.id,summary:power?.standard?.summary??'',
        ...(tag.slot==='active'?{modes:isPushable(power)?modes(power,tag.sourceId):[]}:{})};
    }
    return out;
  }
  function list(actor){
    requireOn();requirePlayerAccess();if(!canRead(actor))throw Error('Actor access denied');
    const strainState=strain.readState(actor),config=strain.config();
    // GM only: when the bearer got the Cinder (the registry is never read for players).
    const since=game.user?.isGM&&store()?new Map(readRegistry().instances.map(i=>[i.instanceId,i.bearer?.since||null])):null;
    return pointersOf(actor).map(p=>{
      const st=socketState(actor,p.definitionId,p.sockets),extra=[...st.perks,...st.activeItems];
      const powers=st.powers,ids=powers.map(x=>x.powerId);
      // art: what the orb draws (own, then the definition's; null = default orb). ownArt: the Cinder's own image only.
      const ownArt=cleanArt(p.art),defaultArt=cleanArt(p.defaultArt)??defArt(p.definitionId);
      const modes=(power,powerId)=>availableModes({power},ids).map(m=>{const plan=planPush({strainValue:strainState.value,config,mode:m,unlocked:powers,powerId,extra});
        return {id:m.id,label:m.label,effect:m.effect??'',cost:plan.cost,after:plan.after,chance:plan.chance,guaranteed:plan.guaranteed,
          modifiers:[...plan.modifiers.cost.used,...plan.modifiers.chance.used,...plan.modifiers.severity.used]};});
      return {instanceId:p.instanceId,definitionId:p.definitionId,name:p.name??p.definitionId,art:resolveArt(ownArt,defaultArt),ownArt,defaultArt,
        artSource:ownArt?'cinder':defaultArt?'definition':null,...treePoints(actor,p.definitionId),
        ...(since?{bearerSince:since.get(p.instanceId)??null}:{}),
        powers:powers.filter(x=>x.power?.kind==='power').map(x=>({powerId:x.powerId,name:x.name,itemId:x.item.id,nodeId:x.nodeId,standard:x.power.standard?.summary??'',modes:modes(x.power,x.powerId)})),
        enhancements:powers.filter(x=>x.power?.kind==='enhancement').map(x=>({powerId:x.powerId,name:x.name})),
        // 0.10.0 (additive): the bearer items on this character, read from its own tagged Items. null when it has none in that slot.
        signature:signatureOf(actor,p.instanceId,modes)};
    });
  }
  function previewPush(actor,instanceId,powerId,modeId){
    const c=list(actor).find(x=>x.instanceId===instanceId);if(!c)throw Error('That character does not bear this Cinder');
    const p=c.powers.find(x=>x.powerId===powerId)??(c.signature?.active?.powerId===powerId?c.signature.active:null);if(!p)throw Error('That power is not unlocked');
    const m=p.modes.find(x=>x.id===modeId);if(!m)throw Error('That Push is not available');
    return {...m,powerId,powerName:p.name,strain:strain.readState(actor).value};
  }

  // ---- Push and Backfire (GM client) ----
  const roll=async formula=>{const r=await new Roll(formula).evaluate();return {total:r.total,formula};};
  function tablesFor(cinderDef,powerDef,mode){
    return categoriesFor(cinderDef,powerDef,mode).map(id=>{const b=backfireBlock(definition(id));return b?{id,label:b.label??id,weight:b.weight??1,entries:b.entries??[]}:null;}).filter(Boolean);
  }
  async function applyEffect(actor,effect,{opId}){
    const problem=effectProblem(effect);if(problem)throw Error(problem);
    const status=CONFIG.statusEffects?.find?.(s=>s.id===effect.status);
    await actor.createEmbeddedDocuments('ActiveEffect',[{name:status?game.i18n.localize(status.name??status.label??effect.status):effect.status,img:status?.img??status?.icon??null,
      statuses:[effect.status],duration:effect.rounds?{rounds:effect.rounds}:{seconds:effect.minutes*60},flags:{[module]:{backfire:{opId}}}}]);
  }
  /** Checks shared by Push and normal use; throws when the character cannot use the power. */
  function context(actor,powerId){
    const registry=readRegistry();
    const unlockedOn=(inst,tree)=>tree?tree.nodes.filter(n=>n.perkId&&inst.progression.unlocks.includes(n.id)).map(n=>({powerId:n.perkId,name:definitionName(n.perkId),power:powerBlock(definition(n.perkId))})):[];
    const ctx=(inst,tree,node)=>{const st=socketState(actor,inst.definitionId,inst.sockets);
      return {instance:inst,tree,node,unlocked:unlockedOn(inst,tree),extra:[...st.perks,...st.activeItems],powerDef:definition(powerId),cinderDef:definition(inst.definitionId)};};
    for(const inst of boundTo(registry,actor.id)){
      // 0.10.0: the Cinder's signature ability. Always usable by its bearer; the tree's unlocked powers still modify it.
      if(bearerItemsOf(definition(inst.definitionId)).active===powerId)return ctx(inst,cinderTree(inst.definitionId),null);
      const tree=cinderTree(inst.definitionId);if(!tree)continue;
      const node=tree.nodes.find(n=>n.perkId===powerId);if(!node)continue;
      if(!inst.progression.unlocks.includes(node.id))throw Error('That power is not unlocked on the Cinder');
      return ctx(inst,tree,node);
    }
    throw Error('This character does not bear a Cinder with that power');
  }
  async function push(actor,powerId,modeId,{forUser=null}={}){
    requireGM();if(!actor)throw Error('No character');notBackup(actor);accounts();
    const ctx=context(actor,powerId),power=powerBlock(ctx.powerDef);
    if(!isPushable(power))throw Error('That power has no Push');
    const mode=availableModes(ctx.powerDef,ctx.unlocked.map(u=>u.powerId)).find(m=>m.id===modeId);
    if(!mode)throw Error('That Push is not available');
    const config=strain.config(),plan=planPush({strainValue:strain.readState(actor).value,config,mode,unlocked:ctx.unlocked,powerId,extra:ctx.extra});
    // Everything is rolled before anything is written.
    const backfire=await resolveBackfire({chance:plan.chance,tables:tablesFor(ctx.cinderDef,ctx.powerDef,mode),config,strain:plan.after,severity:plan.modifiers.severity.total,roll});
    const opId=`push:${foundry.utils.randomID(16)}`,powerName=definitionName(powerId);
    // The one write that must succeed: if it fails, the Push did not happen and nothing else is done.
    const change=await strain.api.add(actor,plan.cost,{source:{module,kind:'push',ref:powerId},reason:`Push: ${powerName} (${mode.label})`,opId});
    const result={opId,kind:'push',actorId:actor.id,instanceId:ctx.instance.instanceId,powerId,powerName,mode:{id:mode.id,label:mode.label,effect:mode.effect??''},
      plan,strain:{from:change.from,to:change.to,overflow:change.overflow},backfire,effectApplied:false,effectError:null,by:forUser?.id??game.user.id};
    await finish(actor,result);
    return result;
  }
  /** Normal use at or above the threshold: an automatic Backfire. No Strain is added; the use itself is never blocked or undone. */
  async function useBackfire(actor,powerId,{forUser=null}={}){
    requireGM();if(!actor)throw Error('No character');notBackup(actor);accounts();
    const config=strain.config(),value=strain.readState(actor).value;
    if(value<config.normal_use_backfire_at)return null;
    const ctx=context(actor,powerId);if(!isPushable(powerBlock(ctx.powerDef)))return null;
    const severity=collectModifiers(ctx.unlocked,'backfire.severity',{powerId,modeId:null,extra:ctx.extra}).total;
    const backfire=await resolveBackfire({chance:100,forced:true,tables:tablesFor(ctx.cinderDef,ctx.powerDef,null),config,strain:value,severity,roll});
    const result={opId:`use:${foundry.utils.randomID(16)}`,kind:'use',actorId:actor.id,instanceId:ctx.instance.instanceId,powerId,powerName:definitionName(powerId),
      mode:null,plan:null,strain:{from:value,to:value,overflow:0},backfire,effectApplied:false,effectError:null,by:forUser?.id??game.user.id};
    await finish(actor,result);
    return result;
  }
  async function finish(actor,result){
    const effect=result.backfire.entry?.effect;
    if(effect){try{await applyEffect(actor,effect,{opId:result.opId});result.effectApplied=true;}catch(error){result.effectError=String(error?.message??error);}}
    try{await ChatMessage.create({speaker:ChatMessage.getSpeaker?.({actor})??{actor:actor.id},content:card(actor,result),flags:{[module]:{cinder:{opId:result.opId}}}});}
    catch(error){console.error(`[${module}] Cinder chat card failed`,error);ui.notifications?.error?.(`Cinder ${result.kind==='push'?'Push':'Backfire'} for ${actor.name} was recorded, but its chat card failed: ${error?.message??error}`);}
  }
  function card(actor,r){
    const b=r.backfire,e=escape,parts=[];
    parts.push(`<div class="agc-chat"><h3>${e(r.kind==='push'?`Push: ${r.powerName}`:`${r.powerName}: Backfire`)}</h3>`);
    if(r.mode)parts.push(`<p><strong>${e(r.mode.label)}</strong>${r.mode.effect?` — ${e(r.mode.effect)}`:''}</p>`);
    const band=strain.api.get(actor).band.label;
    parts.push(r.kind==='push'?`<p>Strain ${r.strain.from} → <strong>${r.strain.to}</strong> (${e(band)})${r.strain.overflow?`, ${r.strain.overflow} over the maximum`:''}</p>`
      :`<p>Strain ${r.strain.to} (${e(band)}): at this Strain every use of a Cinder power backfires.</p>`);
    if(r.plan){
      const mods=[...r.plan.modifiers.cost.used.map(m=>`${m.label} ${m.value>0?'+':''}${m.value} cost`),...r.plan.modifiers.chance.used.map(m=>`${m.label} ${m.value>0?'+':''}${m.value}%`)];
      parts.push(`<p>Backfire chance <strong>${b.chance}%</strong>${b.check?` · d100 = ${b.check.total}`:b.chance>=100?' · automatic':''}${mods.length?` <small>(${e(mods.join(', '))})</small>`:''}</p>`);
    }
    if(!b.backfire)parts.push('<p><strong>No Backfire.</strong></p>');
    else{
      parts.push('<p class="agc-backfire"><strong>Backfire!</strong></p>');
      if(b.category)parts.push(`<p>Category: <strong>${e(b.category.label)}</strong>${b.categoryRoll?` (${e(b.categoryRoll.formula)} = ${b.categoryRoll.total})`:''}</p>`);
      if(b.effectRoll){const x=b.effectRoll,adds=[x.strainBonus?`${x.strainBonus>0?'+':''}${x.strainBonus} Strain`:'',x.severity?`${x.severity>0?'+':''}${x.severity} perks`:''].filter(Boolean);
        parts.push(`<p>Effect ${e(x.formula)} = ${x.die}${adds.length?` ${e(adds.join(' '))}`:''} → <strong>${x.result} of ${x.of}</strong></p>`);}
      if(b.entry)parts.push(`<p>${e(b.entry.text)}</p>`);
      if(b.note)parts.push(`<p><em>${e(b.note)}</em></p>`);
      if(r.effectApplied)parts.push(`<p><small>Applied: ${e(b.entry.effect.status)} (${b.entry.effect.rounds?`${b.entry.effect.rounds} rounds`:`${b.entry.effect.minutes} minutes`}).</small></p>`);
      if(r.effectError)parts.push(`<p><small>GM: the effect could not be applied (${e(r.effectError)}); apply it by hand.</small></p>`);
      if(b.entry&&!b.entry.effect)parts.push('<p><small>The GM adjudicates this effect.</small></p>');
    }
    parts.push('</div>');
    return parts.join('');
  }

  // ---- Socket operations (GM client; a bearer's owner is relayed here and re-checked) ----
  const putInstance=(registry,next)=>({...registry,instances:registry.instances.map(i=>i.instanceId===next.instanceId?next:i)});
  async function mirrorSockets(inst){
    const actor=inst.bearer?actorById(inst.bearer.actorId):null;if(!actor)return;
    const want=socketMirror(inst.sockets),art=inst.art??null,defaultArt=defArt(inst.definitionId),p=pointerFor(actor,inst.instanceId);
    if(p&&(JSON.stringify(p.sockets??null)!==JSON.stringify(want)||cleanArt(p.art)!==art||cleanArt(p.defaultArt)!==defaultArt))
      await setPointers(actor,pointersOf(actor).map(x=>{if(x.instanceId!==inst.instanceId)return x;const {defaultArt:_old,...rest}=x;return {...rest,sockets:want,art,...withDefaultArt(inst.definitionId)};}));
  }
  /** Attach, detach or swap on the GM client. One registry write, then the bearer's copy and the item markers. */
  async function socketOp(actor,instanceId,op,{user=game.user}={}){
    requireGM();if(!actor)throw Error('No character');notBackup(actor);
    return withRegistry(async()=>{
      let registry=readRegistry();
      const inst=registry.instances.find(i=>i.instanceId===instanceId);if(!inst)throw Error('Unknown Cinder');
      if(inst.bearer?.actorId!==actor.id)throw Error('That character does not bear this Cinder');
      if(!user.isGM&&inst.sockets.locked)throw Error('The GM has locked this Cinder\'s sockets');
      // An item that left the bearer's inventory reads as an empty socket; its entry is dropped on this write.
      const sockets={...inst.sockets,attached:inst.sockets.attached.filter(a=>itemOf(actor,a.itemId))};
      let other=null,next={...op};
      if(op.kind!=='detach'){
        const item=itemOf(actor,op.itemId),problem=socketItemProblem(item,{user});if(problem)throw Error(problem);
        next.sourceId=sourceOf(item).sourceId;
        other=registry.instances.find(i=>i.instanceId!==instanceId&&i.sockets.attached.some(a=>a.itemId===op.itemId))??null;
      }
      const r=applySocketOp(sockets,{...next,by:user.id,at:Date.now()},socketState(actor,inst.definitionId,sockets).plan);
      if(!r.changed)return {changed:false,duplicate:Boolean(r.duplicate),slot:r.slot};
      const updated={...inst,sockets:r.sockets,revision:inst.revision+1};
      registry=putInstance(registry,updated);
      // Attaching an item that sits in another Cinder's socket takes it out there first (same write).
      const moved=other?{...other,sockets:withoutItem(other.sockets,op.itemId),revision:other.revision+1}:null;
      if(moved)registry=putInstance(registry,moved);
      await saveRegistry(registry);
      const after=[];
      try{
        await mirrorSockets(updated);if(moved)await mirrorSockets(moved);
        if(r.removed&&r.removed.itemId!==op.itemId)await setMarker(itemOf(actor,r.removed.itemId),null);
        if(op.kind!=='detach')await setMarker(itemOf(actor,op.itemId),{instanceId,slot:r.slot});
      }catch(error){after.push(String(error?.message??error));}
      socketsChanged(op.kind,updated,actor.id,{slot:r.slot});if(moved)socketsChanged('detach',moved,moved.bearer?.actorId??null);
      if(after.length)ui.notifications?.warn?.(`Cinder socket saved, but updating the character failed (${after[0]}). Run Cinders → Manage → Repair.`);
      return {changed:true,slot:r.slot};
    });
  }
  const SOCKET_KINDS=['attach','detach','swap'];
  const cleanSocketOp=op=>{
    if(!op||!SOCKET_KINDS.includes(op.kind))throw Error('Unknown socket operation');
    const slot=op.slot==null||op.slot===''?null:Number(op.slot);
    return {kind:op.kind,slot:Number.isSafeInteger(slot)?slot:(slot==null?null:-1),itemId:typeof op.itemId==='string'?op.itemId:null,opId:typeof op.opId==='string'&&op.opId.length<=64?op.opId:null};
  };
  /** api.sockets attach / detach / swap: the GM does it directly; an owner's request goes to the active GM client, which re-checks. */
  async function requestSocket(actor,instanceId,raw){
    requireOn();if(!actor)throw Error('No character');notBackup(actor);
    const op=cleanSocketOp(raw);op.opId??=`sock:${foundry.utils.randomID(16)}`;
    if(op.kind==='detach'&&op.slot==null)throw Error('Choose a socket');
    if(game.user.isGM)return socketOp(actor,instanceId,op);
    requirePlayerAccess();if(!actor.isOwner)throw Error('Actor access denied');
    const p=pointerFor(actor,instanceId);if(!p)throw Error('That character does not bear this Cinder');
    if(normalizeSockets(p.sockets).locked)throw Error('The GM has locked this Cinder\'s sockets');
    return request('cinder-socket',{actorId:actor.id,instanceId,op});
  }
  /** The bearer's view of their Cinders' sockets (GM or owner, while Player Access allows). */
  function hosts(actor){
    requireOn();requirePlayerAccess();if(!canRead(actor))throw Error('Actor access denied');
    return pointersOf(actor).map(p=>{
      const st=socketState(actor,p.definitionId,p.sockets);
      return {hostKind:'cinder',instanceId:p.instanceId,definitionId:p.definitionId,name:p.name??p.definitionId,capacity:st.plan.capacity,base:st.plan.base,
        free:st.plan.free,locked:st.sockets.locked,canEdit:Boolean(game.user.isGM||(!st.sockets.locked&&actor.isOwner)),
        slots:st.plan.slots.map(x=>{const item=itemOf(actor,x.itemId);return {slot:x.slot,itemId:x.itemId,sourceId:x.sourceId,name:item?.name??x.sourceId??x.itemId,active:x.active,
          modifiers:blockModifiers(sourceOf(item)?.definition).map(m=>({target:m.target,value:m.value,label:m.label}))};})};
    });
  }
  /** Items on the character that fit a Cinder socket, with where each is attached. */
  function socketable(actor){
    requireOn();requirePlayerAccess();if(!canRead(actor))throw Error('Actor access denied');
    return [...(actor.items??[])].filter(i=>!socketItemProblem(i)).map(i=>({itemId:i.id,name:i.name,sourceId:sourceOf(i).sourceId,attachedTo:markerOf(i)}))
      .sort((a,b)=>a.name.localeCompare(b.name));
  }
  function canAttach(actor,instanceId,itemId){
    const reasons=[];
    try{requireOn();requirePlayerAccess();if(!canRead(actor))throw Error('Actor access denied');}catch(e){return {ok:false,reasons:[e.message]};}
    const p=pointerFor(actor,instanceId);if(!p)return {ok:false,reasons:['That character does not bear this Cinder']};
    const st=socketState(actor,p.definitionId,p.sockets);
    if(!game.user.isGM&&st.sockets.locked)reasons.push('The GM has locked this Cinder\'s sockets');
    if(!game.user.isGM&&!actor.isOwner)reasons.push('Actor access denied');
    const problem=socketItemProblem(itemOf(actor,itemId));if(problem)reasons.push(problem);
    if(st.sockets.attached.some(a=>a.itemId===itemId))reasons.push('That item is already in a socket on this Cinder');
    else if(st.plan.free<=0)reasons.push(st.plan.capacity?'All sockets are in use; detach or swap an item':'This Cinder has no sockets');
    return {ok:!reasons.length,reasons};
  }
  async function gmSocketSetting(instanceId,change){
    requireGM();
    return withRegistry(async()=>{
      const registry=readRegistry(),inst=registry.instances.find(i=>i.instanceId===instanceId);if(!inst)throw Error('Unknown Cinder');
      const updated={...inst,sockets:{...inst.sockets,...change},revision:inst.revision+1};
      await saveRegistry(putInstance(registry,updated));await mirrorSockets(updated);
      socketsChanged(Object.keys(change)[0]==='locked'?'lock':'count',updated,updated.bearer?.actorId??null);
      return socketMirror(updated.sockets);
    });
  }
  /** GM: lock or unlock a Cinder's sockets for players (enforced on the GM client). */
  const setLocked=(instanceId,locked)=>gmSocketSetting(instanceId,{locked:locked===true});
  /** GM: this Cinder's own socket count (null = the world setting). */
  function setCount(instanceId,count){
    if(count!==null&&!(Number.isSafeInteger(count)&&count>=0&&count<=MAX_SOCKETS))throw Error(`Socket count must be 0 to ${MAX_SOCKETS}, or empty for the default`);
    return gmSocketSetting(instanceId,{count});
  }
  /** GM: this Cinder's own orb image (a path, or null for the default orb). Saved on the record, copied to the bearer for the sheet. */
  async function setArt(instanceId,path){
    requireGM();const art=artInput(path);
    return withRegistry(async()=>{
      const registry=readRegistry(),inst=registry.instances.find(i=>i.instanceId===instanceId);if(!inst)throw Error('Unknown Cinder');
      if((inst.art??null)===art)return {changed:false,art};
      const updated={...inst,art,revision:inst.revision+1};
      await saveRegistry(putInstance(registry,updated));await mirrorSockets(updated);
      changed('art',updated,{art});return {changed:true,art};
    });
  }
  /** GM drop target: an Item dropped on a socket. A world Item is copied into the bearer's inventory first (and removed again if attaching fails). */
  async function attachDropped(instanceId,itemDoc,{slot=null}={}){
    requireGM();
    const inst=readRegistry().instances.find(i=>i.instanceId===instanceId);if(!inst)throw Error('Unknown Cinder');
    const actor=inst.bearer?actorById(inst.bearer.actorId):null;if(!actor)throw Error('This Cinder has no bearer');
    if(!itemDoc||itemDoc.documentName!=='Item')throw Error('Drop an Item');
    if(itemDoc.parent){if(itemDoc.parent.id!==actor.id)throw Error(`That item belongs to ${itemDoc.parent.name}, not the bearer`);
      return {...await requestSocket(actor,instanceId,{kind:slot!=null&&inst.sockets.attached.some(a=>a.slot===slot)?'swap':'attach',slot,itemId:itemDoc.id}),created:null};}
    const problem=socketItemProblem(itemDoc);if(problem)throw Error(problem);
    const data=itemDoc.toObject();delete data._id;if(data.flags?.[module])delete data.flags[module].attachedTo;
    const [copy]=await actor.createEmbeddedDocuments('Item',[data]);
    try{return {...await requestSocket(actor,instanceId,{kind:slot!=null&&inst.sockets.attached.some(a=>a.slot===slot)?'swap':'attach',slot,itemId:copy.id}),created:copy.id};}
    catch(error){await copy.delete?.().catch(e=>console.error(`[${module}] Could not remove the copied item`,e));throw error;}
  }
  /** Check: bearer copies and item markers that disagree with the registry. */
  function socketReport(registry){
    const rows=[];
    for(const inst of registry.instances){
      const actor=inst.bearer?actorById(inst.bearer.actorId):null;if(!actor)continue;
      const name=definitionName(inst.definitionId),p=pointerFor(actor,inst.instanceId);
      if(p&&JSON.stringify(normalizeSockets(p.sockets).attached.map(({slot,itemId})=>[slot,itemId]))!==JSON.stringify(inst.sockets.attached.map(({slot,itemId})=>[slot,itemId]))||
        (p&&(normalizeSockets(p.sockets).locked!==inst.sockets.locked||normalizeSockets(p.sockets).count!==inst.sockets.count)))
        rows.push({instanceId:inst.instanceId,name,repair:true,text:`${actor.name}'s copy of this Cinder's sockets differs from the Cinder.`});
      if(p&&(cleanArt(p.art)!==(inst.art??null)||cleanArt(p.defaultArt)!==defArt(inst.definitionId)))rows.push({instanceId:inst.instanceId,name,repair:true,text:`${actor.name}'s copy of this Cinder's art differs from the Cinder.`});
      for(const a of inst.sockets.attached){const item=itemOf(actor,a.itemId);
        if(!item)rows.push({instanceId:inst.instanceId,name,repair:true,text:`A socketed item (${a.sourceId??a.itemId}) is no longer on ${actor.name}; its socket reads as empty.`});
        else if(JSON.stringify(markerOf(item))!==JSON.stringify({instanceId:inst.instanceId,slot:a.slot}))rows.push({instanceId:inst.instanceId,name,repair:true,text:`${item.name} is in a socket but not marked as attached.`});}
    }
    for(const actor of game.actors?.contents??[])for(const item of actor.items??[]){const m=markerOf(item);if(!m)continue;
      const inst=registry.instances.find(i=>i.instanceId===m.instanceId);
      if(!inst||inst.bearer?.actorId!==actor.id||!inst.sockets.attached.some(a=>a.itemId===item.id&&a.slot===m.slot))rows.push({instanceId:m.instanceId??null,name:item.name,actorId:actor.id,repair:true,text:`${item.name} on ${actor.name} is marked as attached, but no Cinder socket holds it.`});}
    return rows;
  }
  /** Repair sockets: drop entries for items that are gone, rewrite bearer copies and markers from the registry. Never deletes an item. */
  async function socketRepair(registry){
    const done=[];let next=registry,dirty=false;
    for(const inst of registry.instances){
      const actor=inst.bearer?actorById(inst.bearer.actorId):null;if(!actor)continue;
      const kept=inst.sockets.attached.filter(a=>itemOf(actor,a.itemId));
      if(kept.length!==inst.sockets.attached.length){next=putInstance(next,{...inst,sockets:{...inst.sockets,attached:kept},revision:inst.revision+1});dirty=true;done.push(`${actor.name}: emptied ${inst.sockets.attached.length-kept.length} socket(s) whose item is gone`);}
    }
    if(dirty)await saveRegistry(next);
    for(const inst of next.instances){const actor=inst.bearer?actorById(inst.bearer.actorId):null;if(!actor)continue;
      const old=pointerFor(actor,inst.instanceId),before=JSON.stringify(old?.sockets??null),artBefore=`${cleanArt(old?.art)}|${cleanArt(old?.defaultArt)}`;await mirrorSockets(inst);
      const p=pointerFor(actor,inst.instanceId);
      if(before!==JSON.stringify(p?.sockets??null))done.push(`${actor.name}: socket copy updated`);
      if(p&&artBefore!==`${cleanArt(p.art)}|${cleanArt(p.defaultArt)}`)done.push(`${actor.name}: Cinder art copy updated`);
      for(const a of inst.sockets.attached){const item=itemOf(actor,a.itemId);if(item&&JSON.stringify(markerOf(item))!==JSON.stringify({instanceId:inst.instanceId,slot:a.slot})){await setMarker(item,{instanceId:inst.instanceId,slot:a.slot});done.push(`${actor.name}: ${item.name} marked attached`);}}}
    for(const actor of game.actors?.contents??[])for(const item of actor.items??[]){const m=markerOf(item);if(!m)continue;
      const inst=next.instances.find(i=>i.instanceId===m.instanceId);
      if(!inst||inst.bearer?.actorId!==actor.id||!inst.sockets.attached.some(a=>a.itemId===item.id&&a.slot===m.slot)){await setMarker(item,null);done.push(`${actor.name}: ${item.name} unmarked`);}}
    return done;
  }

  // ---- Player requests (relayed to the active GM client, which re-checks everything) ----
  const pending=new Map();
  function request(type,data){
    if(!game.users?.activeGM)return Promise.reject(Error('A GM must be logged in for this (the GM client checks and records Pushes and socket changes).'));
    const requestId=foundry.utils.randomID(16);
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(requestId);reject(Error('No answer from the GM client. Check that a GM is connected and try again.'));},20000);
      pending.set(requestId,{resolve,reject,timer});
      game.socket.emit(socket,{type,requestId,userId:game.user.id,...data});
    });
  }
  async function onSocket(message,senderId){
    if(!message||typeof message!=='object')return;
    if(message.type==='cinder-result'){
      const wait=pending.get(message.requestId);if(!wait||message.userId!==game.user.id)return;
      pending.delete(message.requestId);clearTimeout(wait.timer);
      if(message.ok)wait.resolve(message.result);else wait.reject(Error(message.message));return;
    }
    if(!['cinder-push','cinder-use','cinder-socket'].includes(message.type)||!game.user.isGM||game.users?.activeGM?.id!==game.user.id)return;
    const userId=typeof senderId==='string'&&game.users?.get(senderId)?senderId:message.userId;
    const reply=(ok,payload)=>game.socket.emit(socket,{type:'cinder-result',requestId:message.requestId,userId,ok,...(ok?{result:payload}:{message:payload})});
    try{
      const user=game.users?.get(userId),actor=actorById(message.actorId);
      if(!user||user.isGM)throw Error('Unknown player');
      if(!deps.playerAccess())throw Error('Cinders is hidden from players right now');
      if(!actor||actor.testUserPermission?.(user,'OWNER')!==true)throw Error('You do not own that character');
      notBackup(actor);
      if(message.type==='cinder-socket'){reply(true,await socketOp(actor,String(message.instanceId??''),cleanSocketOp(message.op),{user}));return;}
      const r=message.type==='cinder-push'?await push(actor,message.powerId,message.modeId,{forUser:user}):await useBackfire(actor,message.powerId,{forUser:user});
      reply(true,r?{opId:r.opId,backfire:r.backfire.backfire}:null);
    }catch(error){reply(false,String(error?.message??error));}
  }
  /** api.cinder.push: the GM pushes directly; an owner's Push is rolled and recorded by the active GM client. */
  async function requestPush(actor,powerId,modeId){
    requireOn();if(!actor)throw Error('No character');notBackup(actor);
    if(game.user.isGM)return push(actor,powerId,modeId);
    requirePlayerAccess();if(!actor.isOwner)throw Error('Actor access denied');
    return request('cinder-push',{actorId:actor.id,powerId,modeId});
  }
  /** dnd5e activity use on the using client: a Cinder power used at or above the threshold backfires.
   * 0.10.0: a Cinder's signature ability offers a Push first (onSignatureUse). dnd5e.postUseActivity(activity, usageConfig, results). */
  async function onUseActivity(activity,usageConfig,results){
    if(blocked())return;
    const item=activity?.item,actor=item?.actor??activity?.actor;if(!actor)return;
    const tag=bearerTag(item,module);
    if(tag){if(tag.slot==='active')await onSignatureUse(actor,item,tag,results);return;}
    const t=trees();if(t.status!=='ok')return;
    let grant;try{grant=t.accounts.grants(actor).find(g=>g.itemId===item.id&&g.wallet?.startsWith('cinder:'));}catch{return;}
    if(!grant)return;
    if(strain.readState(actor).value<strain.config().normal_use_backfire_at)return;
    if(powerBlock(sourceOf(item)?.definition)?.kind!=='power')return;
    try{
      if(game.user.isGM)await useBackfire(actor,grant.perkId);
      else if(actor.isOwner)await request('cinder-use',{actorId:actor.id,powerId:grant.perkId});
    }catch(error){console.error(`[${module}] Cinder Backfire on use failed`,error);ui.notifications?.error?.(`Cinder Backfire: ${error?.message??error}`);}
  }
  /** Normal-use Backfire at or above the threshold, on the GM client (a player's goes there). */
  async function normalUse(actor,powerId){
    if(strain.readState(actor).value<strain.config().normal_use_backfire_at)return null;
    if(game.user.isGM)return useBackfire(actor,powerId);
    if(actor.isOwner)return request('cinder-use',{actorId:actor.id,powerId});
    return null;
  }
  // One offer per use: dnd5e fires postUseActivity once per use; the chat card id (and the item while its offer is open) guard against a repeat.
  const offered=new Set(),offering=new Set();
  /**
   * The signature ability was used through its dnd5e use button (the use itself is done and never blocked). On the using client:
   * offer a Push when this user has the offer on and a mode is available; a chosen mode runs the normal Push path (a player's on the GM
   * client). "Use without Push" (or no offer) leaves the use as it was, and from the normal-use point the automatic Backfire applies.
   */
  async function onSignatureUse(actor,item,tag,results){
    const key=results?.message?.id??results?.message?._id??null;
    if(key){if(offered.has(key))return;offered.add(key);if(offered.size>200)offered.delete(offered.values().next().value);}
    if(!pointerFor(actor,tag.instanceId)||!(game.user.isGM||actor.isOwner))return;
    const powerId=tag.sourceId;
    try{
      let pushed=false;
      const canOffer=typeof deps.offerPush==='function'&&deps.pushOffer?.()===true&&(game.user.isGM||deps.playerAccess())&&!offering.has(item.id);
      if(canOffer){
        let ability=null;try{ability=list(actor).find(c=>c.instanceId===tag.instanceId)?.signature?.active??null;}catch{ability=null;}
        if(ability?.modes?.length){
          offering.add(item.id);
          try{const modeId=await deps.offerPush({actor,ability,modes:ability.modes});
            if(modeId&&ability.modes.some(m=>m.id===modeId)){await requestPush(actor,powerId,modeId);pushed=true;}}
          finally{offering.delete(item.id);}
        }
      }
      if(!pushed)await normalUse(actor,powerId);
    }catch(error){console.error(`[${module}] Cinder signature ability use failed`,error);ui.notifications?.error?.(`Cinder: ${error?.message??error}`);}
  }
  /** Players may use a bearer item, never change its mechanics, delete it, or make one (enforced on the client making the change;
   * the GM changes anything). Returns false to refuse, as Foundry's pre-hooks expect. */
  const byGM=userId=>(game.users?.get?.(userId)??game.user)?.isGM===true;
  const refuse=why=>{ui.notifications?.warn?.(why);return false;};
  const itemGuards={
    preCreateItem:(item,data,_o,userId)=>{if(!byGM(userId)&&(bearerTag(item,module)||bearerTag(data,module)))return refuse('Only the GM can give a Cinder\'s signature ability or passive.');},
    preUpdateItem:(item,changes,_o,userId)=>{if(byGM(userId)||!bearerTag(item,module))return;const why=playerUpdateProblem(changes);if(why)return refuse(why);},
    preDeleteItem:(item,_o,userId)=>{if(!byGM(userId)&&bearerTag(item,module))return refuse('Only the GM can remove a Cinder\'s signature ability or passive.');}
  };
  for(const ev of ['preCreateActiveEffect','preUpdateActiveEffect','preDeleteActiveEffect'])
    itemGuards[ev]=(effect,...rest)=>{const userId=rest.at(-1);if(!byGM(userId)&&bearerTag(effect?.parent,module))return refuse('Only the GM can change the effects of a Cinder\'s signature ability or passive.');};
  /** Strain recovery modifiers (added to rest recovery): each borne Cinder's unlocked powers and active socket items, plus the character's perks once
   * (a perk's requires is met when any borne Cinder has those powers unlocked). */
  function recoveryBonus(actor){
    const cinders=pointersOf(actor).map(p=>socketState(actor,p.definitionId,p.sockets));
    const fromPowers=cinders.reduce((s,c)=>s+collectModifiers(c.powers,'strain.recovery',{extra:c.activeItems}).total,0);
    const have=cinders.flatMap(c=>c.powers).map(x=>({powerId:x.powerId}));
    return fromPowers+collectModifiers(have,'strain.recovery',{extra:perkSources(actor)}).total;
  }
  /** api.modifiers.forActor: the cinder modifiers the character's perks carry (GM or owner, while Player Access allows). */
  function perkModifiers(actor){
    requireOn();requirePlayerAccess();if(!canRead(actor))throw Error('Actor access denied');
    return perkSources(actor).flatMap(src=>src.modifiers.map(m=>({sourceId:src.sourceId,name:src.name,itemId:src.itemId,...structuredClone(m)})));
  }

  const api={
    contract:CINDER_CONTRACT,hook:CINDER_HOOK,
    list,previewPush,push:requestPush,validateDefinition,setArt,
    instances:()=>readRegistry().instances,
    create,bind,transfer,unbind,rehook,migrate,adoptLegacy,report,repair
  };
  /** The scope owner for "cinder" modifiers (contract ag-modifier/1): General Manager 0.41.0+ calls validate on import. */
  const modifiersApi={contract:MODIFIER_CONTRACT,scope:MODIFIER_SCOPE,targets:[...MODIFIER_TARGETS],validate:validateModifiers,forActor:perkModifiers};
  /** Cinder sockets (contract ag-sockets/1, host kind "cinder"). Reads: GM or the bearer's owner. Changes: GM, or the owner while
   * Player Access allows and the Cinder is not locked; always checked on the active GM client. */
  const socketsApi={contract:SOCKETS_CONTRACT,hook:SOCKETS_HOOK,hostKinds:['cinder'],maxSockets:MAX_SOCKETS,
    hosts,socketable,canAttach,
    slots:(actor,instanceId)=>hosts(actor).find(h=>h.instanceId===instanceId)??null,
    attach:(actor,instanceId,itemId,{slot=null,opId=null}={})=>requestSocket(actor,instanceId,{kind:'attach',slot,itemId,opId}),
    detach:(actor,instanceId,slot,{opId=null}={})=>requestSocket(actor,instanceId,{kind:'detach',slot,opId}),
    swap:(actor,instanceId,slot,itemId,{opId=null}={})=>requestSocket(actor,instanceId,{kind:'swap',slot,itemId,opId}),
    setLocked,setCount,attachDropped};
  return {api,modifiersApi,socketsApi,itemGuards,onDeleteActor,onProgressChanged,onCheckProgress,onSocket,onUseActivity,recoveryBonus,readRegistry,migrationPlan,definitionName,cinderTree,store,
    register(){
      game.settings.register(module,MAX_CINDERS_SETTING,{name:'Cinders per character',hint:'GM: the most Cinders one character can bear at once (default 1).',scope:'world',config:true,type:Number,default:1,range:{min:1,max:9,step:1}});
      game.settings.register(module,SOCKETS_SETTING,{name:'Sockets per Cinder',hint:'GM: how many items a Cinder can hold in its sockets (default 3). A Cinder can have its own number (Manage), and perks or items can add sockets.',scope:'world',config:true,type:Number,default:3,range:{min:0,max:MAX_SOCKETS,step:1}});
      game.settings.register(module,INITIAL_POINTS_SETTING,{name:'Starting Cinder points',hint:'GM: points a Cinder gets the first time it is bound (once per Cinder; a transferred Cinder keeps its points and gets none).',scope:'world',config:true,type:Number,default:1,range:{min:0,max:CINDER_WALLET_CAP,step:1}});
    }
  };
}
