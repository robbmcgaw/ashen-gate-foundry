/** Cinders, Foundry side: the GM-only Cinder registry, bind / transfer / unbind, Push and normal-use Backfire, chat cards.
 * Records live in this module's GM-only Journal. A bearer's progress is written to their Cinder tree through Skill Trees' public
 * api.accounts (ag-tree-accounts/1), so the tree window keeps working; Skill Trees knows nothing about Cinders. */
import {CINDER_CONTRACT,cleanAccount,normalizeRegistry,createInstance,bindInstance,unbindInstance,transferInstance,withProgression,boundTo,bearerInstance,
  planMigration,powerBlock,availableModes,planPush,resolveBackfire,categoriesFor,backfireBlock,effectProblem,collectModifiers,validateDefinition} from './cinder.mjs';

export const CINDER_HOOK='ashenGateCinder.changed';
export const MAX_CINDERS_SETTING='maxCindersPerActor';
export const INITIAL_POINTS_SETTING='initialCinderPoints';
export const STORE_FLAG='gmRecords';
const walletOf=definitionId=>`cinder:${definitionId}`;
const emptyAccount=()=>({awarded:0,unlocks:[],grants:[],revision:0});

/**
 * deps: module, socket, strain (Strain runtime), lookup(id) → world definition hit, escape,
 * trees() → {status: 'ok'|'missing'|'old', accounts?, api?, message?} (Skill Trees, looked up at call time),
 * blocked() → a reason while Cinders must stay off, else null.
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
  const actorById=id=>game.actors?.get?.(id)??null;
  const changed=(kind,instance,extra={})=>Hooks.callAll(CINDER_HOOK,{kind,instanceId:instance.instanceId,definitionId:instance.definitionId,actorId:instance.bearer?.actorId??null,...extra});

  // ---- Bearer: the tree account (through Skill Trees) and a pointer in this module's Actor flags ----
  const pointersOf=actor=>Array.isArray(actor?.flags?.[module]?.cinders)?actor.flags[module].cinders.filter(p=>p&&typeof p.instanceId==='string'):[];
  async function setPointers(actor,pointers){await actor.setFlag(module,'cinders',pointers);}
  function treeFor(instance){const t=cinderTree(instance.definitionId);if(!t)throw Error(`No Cinder tree uses ${instance.definitionId}. Import it into Skill Trees first.`);return t;}
  async function writeBearer(actor,instance){
    const tree=treeFor(instance);
    await accounts().setAccount(actor,tree.id,instance.progression);
    await setPointers(actor,[...pointersOf(actor).filter(p=>p.instanceId!==instance.instanceId),{instanceId:instance.instanceId,definitionId:instance.definitionId,name:definitionName(instance.definitionId)}]);
  }
  async function clearBearer(actor,instance){
    const tree=cinderTree(instance.definitionId);
    if(tree)await accounts().setAccount(actor,tree.id,emptyAccount());
    await setPointers(actor,pointersOf(actor).filter(p=>p.instanceId!==instance.instanceId));
  }
  const hasProgress=(actor,definitionId)=>{const t=cinderTree(definitionId);if(!t)return false;const a=cleanAccount(accounts().account(actor,t.id));return a.awarded>0||a.unlocks.length>0;};

  // ---- GM operations ----
  async function create(definitionId){
    requireGM();
    if(lookup(definitionId)?.status!=='ok')throw Error(`${definitionId} is not in this world. Import it through General Manager first.`);
    return withRegistry(async()=>{
      const {registry,instance}=createInstance(readRegistry(),definitionId,{instanceId:`cinst_${foundry.utils.randomID(16)}`,at:Date.now()});
      await saveRegistry(registry);changed('create',instance);return instance;
    });
  }
  async function bind(instanceId,actor){
    requireGM();if(!actor)throw Error('Choose a character');accounts();
    return withRegistry(async()=>{
      const {registry,instance,initialAwarded}=bindInstance(readRegistry(),instanceId,actor.id,{max:setting(MAX_CINDERS_SETTING),at:Date.now(),initialPoints:game.settings.get(module,INITIAL_POINTS_SETTING)??1});
      if(hasProgress(actor,instance.definitionId))throw Error(`${actor.name} already has progress on this Cinder's tree from before Cinders. Use Move existing Cinder progress first.`);
      try{await writeBearer(actor,instance);await saveRegistry(registry);}
      catch(error){await clearBearer(actor,instance).catch(e=>console.error(`[${module}] Could not undo bind`,e));throw error;}
      changed('bind',instance);return {instance,initialAwarded};
    });
  }
  /** Move a bound Cinder to another character: points and unlocks go with it; Strain and Backfire conditions stay where they are. */
  async function transfer(instanceId,toActor){
    requireGM();if(!toActor)throw Error('Choose a character');accounts();
    return withRegistry(async()=>{
      const {registry,instance,from}=transferInstance(readRegistry(),instanceId,toActor.id,{max:setting(MAX_CINDERS_SETTING),at:Date.now()});
      if(hasProgress(toActor,instance.definitionId))throw Error(`${toActor.name} already has progress on this Cinder's tree from before Cinders. Use Move existing Cinder progress first.`);
      // New bearer first, then the record, then the old bearer: an interruption never leaves the Cinder with nobody.
      try{await writeBearer(toActor,instance);await saveRegistry(registry);}
      catch(error){await clearBearer(toActor,instance).catch(e=>console.error(`[${module}] Could not undo transfer`,e));throw error;}
      const old=actorById(from);let left=null;
      if(old){try{await clearBearer(old,instance);}catch(error){left=error.message;}}
      changed('transfer',instance,{fromActorId:from});
      if(left)throw Error(`Cinder moved to ${toActor.name}, but cleaning up the previous bearer failed: ${left}. Run Manage → Check.`);
      return {instance,from};
    });
  }
  async function unbind(instanceId){
    requireGM();
    return withRegistry(async()=>{
      const {registry,instance,from}=unbindInstance(readRegistry(),instanceId);
      await saveRegistry(registry);
      const old=actorById(from);if(old)await clearBearer(old,instance);
      changed('unbind',instance,{fromActorId:from});return {instance,from};
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
    if(blocked()||check?.kind!=='cinder_milestone'||!game.user?.isGM||!store())return;
    const mine=readRegistry().instances.filter(i=>i.definitionId===check.sourceRef);
    if(mine.length&&!mine.some(i=>i.bearer?.actorId===check.actorId))check.blocked=`${check.actorName||'This character'} does not bear this Cinder. Bind or transfer it in Cinders → Manage first.`;
  }
  function migrationPlan(){
    requireGM();
    const acc=accounts(),cinderTrees=(trees().api?.listTrees?.()??[]).filter(t=>t.provider?.kind==='cinder_milestone'&&t.sourceRef);
    const actors=(game.actors?.contents??[]).map(a=>({actorId:a.id,name:a.name,accounts:Object.fromEntries(cinderTrees.map(t=>[walletOf(t.sourceRef),acc.account(a,t.id)]))}));
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
    const registry=readRegistry(),rows=[],t=trees();
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
    for(const actor of game.actors?.contents??[])for(const g of t.accounts.grants(actor)){
      if(!g.wallet?.startsWith('cinder:'))continue;const definitionId=g.wallet.slice(7);
      if(registry.instances.some(i=>i.definitionId===definitionId)&&!bearerInstance(registry,actor.id,definitionId))
        rows.push({instanceId:null,name:actor.items?.get?.(g.itemId)?.name??g.perkId,actorId:actor.id,repair:true,text:`${actor.name} has a Cinder power (${g.perkId}) but does not bear that Cinder.`});
    }
    return rows;
  }
  /** Repair what report() flags: bearers' tree progress rewritten from the Cinder; Cinder progress taken off non-bearers. Never changes a Cinder. */
  async function repair(){
    requireGM();
    const acc=accounts();
    return withRegistry(async()=>{
      const registry=readRegistry(),done=[];
      for(const inst of registry.instances){const actor=inst.bearer?actorById(inst.bearer.actorId):null,tree=cinderTree(inst.definitionId);if(!actor||!tree)continue;
        const r=await acc.setAccount(actor,tree.id,inst.progression);if(r.given.length||r.removed.length)done.push(`${actor.name}: ${[...r.given.map(x=>`+${x}`),...r.removed.map(x=>`−${x}`)].join(', ')}`);}
      for(const actor of game.actors?.contents??[]){
        const stray=new Set(acc.grants(actor).filter(g=>g.wallet?.startsWith('cinder:')).map(g=>g.wallet.slice(7)).filter(d=>registry.instances.some(i=>i.definitionId===d)&&!bearerInstance(registry,actor.id,d)));
        for(const d of stray){const tree=cinderTree(d);if(!tree)continue;const r=await acc.setAccount(actor,tree.id,emptyAccount());done.push(`${actor.name}: removed ${r.removed.join(', ')}`);}
      }
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
  const canRead=actor=>Boolean(actor)&&(game.user?.isGM||actor.isOwner);
  const requirePlayerAccess=()=>{if(!game.user?.isGM&&!deps.playerAccess())throw Error('The GM has hidden Cinders.');};
  function list(actor){
    requireOn();requirePlayerAccess();if(!canRead(actor))throw Error('Actor access denied');
    const strainState=strain.readState(actor),config=strain.config();
    return pointersOf(actor).map(p=>{
      const powers=sheetPowers(actor,p.definitionId),ids=powers.map(x=>x.powerId);
      return {instanceId:p.instanceId,definitionId:p.definitionId,name:p.name??p.definitionId,
        powers:powers.filter(x=>x.power?.kind==='power').map(x=>({powerId:x.powerId,name:x.name,itemId:x.item.id,nodeId:x.nodeId,standard:x.power.standard?.summary??'',
          modes:availableModes({power:x.power},ids).map(m=>{const plan=planPush({strainValue:strainState.value,config,mode:m,unlocked:powers,powerId:x.powerId});
            return {id:m.id,label:m.label,effect:m.effect??'',cost:plan.cost,after:plan.after,chance:plan.chance,guaranteed:plan.guaranteed,
              modifiers:[...plan.modifiers.cost.used,...plan.modifiers.chance.used,...plan.modifiers.severity.used]};})})),
        enhancements:powers.filter(x=>x.power?.kind==='enhancement').map(x=>({powerId:x.powerId,name:x.name}))};
    });
  }
  function previewPush(actor,instanceId,powerId,modeId){
    const c=list(actor).find(x=>x.instanceId===instanceId);if(!c)throw Error('That character does not bear this Cinder');
    const p=c.powers.find(x=>x.powerId===powerId);if(!p)throw Error('That power is not unlocked');
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
    for(const inst of boundTo(registry,actor.id)){
      const tree=cinderTree(inst.definitionId);if(!tree)continue;
      const node=tree.nodes.find(n=>n.perkId===powerId);if(!node)continue;
      if(!inst.progression.unlocks.includes(node.id))throw Error('That power is not unlocked on the Cinder');
      const unlocked=tree.nodes.filter(n=>n.perkId&&inst.progression.unlocks.includes(n.id)).map(n=>({powerId:n.perkId,name:definitionName(n.perkId),power:powerBlock(definition(n.perkId))}));
      return {instance:inst,tree,node,unlocked,powerDef:definition(powerId),cinderDef:definition(inst.definitionId)};
    }
    throw Error('This character does not bear a Cinder with that power');
  }
  async function push(actor,powerId,modeId,{forUser=null}={}){
    requireGM();if(!actor)throw Error('No character');accounts();
    const ctx=context(actor,powerId),power=powerBlock(ctx.powerDef);
    if(power?.kind!=='power')throw Error('That power has no Push');
    const mode=availableModes(ctx.powerDef,ctx.unlocked.map(u=>u.powerId)).find(m=>m.id===modeId);
    if(!mode)throw Error('That Push is not available');
    const config=strain.config(),plan=planPush({strainValue:strain.readState(actor).value,config,mode,unlocked:ctx.unlocked,powerId});
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
    requireGM();if(!actor)throw Error('No character');accounts();
    const config=strain.config(),value=strain.readState(actor).value;
    if(value<config.normal_use_backfire_at)return null;
    const ctx=context(actor,powerId);if(powerBlock(ctx.powerDef)?.kind!=='power')return null;
    const severity=collectModifiers(ctx.unlocked,'backfire.severity',{powerId,modeId:null}).total;
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

  // ---- Player requests (relayed to the active GM client, which re-checks everything) ----
  const pending=new Map();
  function request(type,data){
    if(!game.users?.activeGM)return Promise.reject(Error('A GM must be logged in to use a Cinder Push (the GM client rolls and records it).'));
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
    if(!['cinder-push','cinder-use'].includes(message.type)||!game.user.isGM||game.users?.activeGM?.id!==game.user.id)return;
    const userId=typeof senderId==='string'&&game.users?.get(senderId)?senderId:message.userId;
    const reply=(ok,payload)=>game.socket.emit(socket,{type:'cinder-result',requestId:message.requestId,userId,ok,...(ok?{result:payload}:{message:payload})});
    try{
      const user=game.users?.get(userId),actor=actorById(message.actorId);
      if(!user||user.isGM)throw Error('Unknown player');
      if(!deps.playerAccess())throw Error('Cinders is hidden from players right now');
      if(!actor||actor.testUserPermission?.(user,'OWNER')!==true)throw Error('You do not own that character');
      const r=message.type==='cinder-push'?await push(actor,message.powerId,message.modeId,{forUser:user}):await useBackfire(actor,message.powerId,{forUser:user});
      reply(true,r?{opId:r.opId,backfire:r.backfire.backfire}:null);
    }catch(error){reply(false,String(error?.message??error));}
  }
  /** api.cinder.push: the GM pushes directly; an owner's Push is rolled and recorded by the active GM client. */
  async function requestPush(actor,powerId,modeId){
    requireOn();if(!actor)throw Error('No character');
    if(game.user.isGM)return push(actor,powerId,modeId);
    requirePlayerAccess();if(!actor.isOwner)throw Error('Actor access denied');
    return request('cinder-push',{actorId:actor.id,powerId,modeId});
  }
  /** dnd5e activity use on the using client: a Cinder power used at or above the threshold backfires. */
  async function onUseActivity(activity){
    if(blocked())return;
    const item=activity?.item,actor=item?.actor??activity?.actor;if(!actor)return;
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
  /** Strain recovery modifiers from the bearer's unlocked Cinder powers (added to rest recovery). */
  function recoveryBonus(actor){
    return pointersOf(actor).reduce((s,p)=>s+collectModifiers(sheetPowers(actor,p.definitionId),'strain.recovery').total,0);
  }

  const api={
    contract:CINDER_CONTRACT,hook:CINDER_HOOK,
    list,previewPush,push:requestPush,validateDefinition,
    instances:()=>readRegistry().instances,
    create,bind,transfer,unbind,migrate,adoptLegacy,report,repair
  };
  return {api,onDeleteActor,onProgressChanged,onCheckProgress,onSocket,onUseActivity,recoveryBonus,readRegistry,migrationPlan,definitionName,cinderTree,store,
    register(){
      game.settings.register(module,MAX_CINDERS_SETTING,{name:'Cinders per character',hint:'GM: the most Cinders one character can bear at once (default 1).',scope:'world',config:true,type:Number,default:1,range:{min:1,max:9,step:1}});
      game.settings.register(module,INITIAL_POINTS_SETTING,{name:'Starting Cinder points',hint:'GM: points a Cinder gets the first time it is bound (once per Cinder; a transferred Cinder keeps its points and gets none).',scope:'world',config:true,type:Number,default:1,range:{min:0,max:13,step:1}});
    }
  };
}
