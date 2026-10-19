import {
  SCHEMA,clone,asArray,cleanAccount,walletKey,normalizeTree,validateTree,validatePackage,allowedSourceForProvider,
  availability,publicAvailability,publicTree,totalSpent,grantPoints,purchase,changedPurchasedNodes,planTreeImport,
  resolveTree,perkCost,refund,resetUnlocks,grantTag,isGrantFor,missingGrants,savedDataReport
} from './engine.mjs';
import {graphEdges,edgeLine} from './graph.mjs';
import {PLAYER_ACCESS_CONTRACT,PLAYER_ACCESS_SETTING,playerAccessAllowed,assertPlayerAccess,accessState,setPlayerAccess} from './player-access.mjs';
import {lookupWorldDefinition} from './definition-lookup.mjs';
import {launcherRoot,mountLauncher} from './ag-launchers.mjs';
import {QA_FIXTURE,QA_TREES,qaTreeLayouts,qaSourceItems,qaActorData,isQaDocument,qaCleanupBlockers} from './qa-fixtures.mjs';

/** Skill Trees: perk-assigned nodes, private GM definitions, GM-side unlocks that add the perk Item to the sheet. */
const MODULE='ashen-gate-skill-trees';
const VERSION='0.8.0';
const SOCKET=`module.${MODULE}`;
const {ApplicationV2,HandlebarsApplicationMixin,DialogV2}=foundry.applications.api;
const STORAGE_FLAG='privateStore';
const SAFE_SETTING='publicTreesV2';
let instance=null;
const openTreeWindows=new Set();
const canOpenTrees=()=>playerAccessAllowed(game,MODULE);
const checkTreePlayerAccess=()=>assertPlayerAccess(game,MODULE);
const playerAccessEnabled=()=>game.settings.get(MODULE,PLAYER_ACCESS_SETTING)!==false;
function syncTreePlayerAccess(enabled){
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
const actorChoices=()=> (game.actors?.contents??[]).filter(a=>a.type==='character' && hasOwner(a))
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
const download=(filename,data)=>{
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
};
const confirm=async(content,title='Confirm')=>Boolean(await DialogV2.confirm({window:{title},content,modal:true,rejectClose:false}));
const formValues=v=>v&&typeof v.entries==='function'?Object.fromEntries(v.entries()):v??{};
const input=async(title,content,label='Save')=>{
  const result=await DialogV2.input({window:{title},content,ok:{label}});
  return result?formValues(result):null;
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
  return {name:doc.name,description:plainText(doc.system?.description?.value),img:doc.img??null,cost:perkCost(sourceFlag(doc)?.definition),uuid:doc.uuid};};
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
  if(!await confirm('<p>Create a <strong>GM-only Journal</strong> for private tree definitions?</p><p>The public player view receives separately sanitized snapshots. No old v0.1 data or Actor progress will be changed.</p>','Initialize Skill Trees'))return null;
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
      if(allProgressFor(t).some(a=>a.awarded||a.unlocks.length))throw Error(`Tree ${t.id} has progression: delete blocked`);
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
  const records=copy(safeFlag(actor,'progressV2')??{});
  records[walletKey(tree)]=cleanAccount(next);
  await actor.setFlag(MODULE,'progressV2',records);
}
const grantOf=item=>item?.flags?.[MODULE]?.grant??null;
const grantedItems=(actor,tree,nodeId=null)=>Array.from(actor?.items??[]).filter(i=>isGrantFor(grantOf(i),tree,nodeId));
/** Embedded copy of the world perk on the character, tagged with the perk id. Reuses an existing tagged copy. */
async function givePerk(actor,tree,node){
  const existing=grantedItems(actor,tree,node.id);
  if(existing.length)return {item:existing[0],created:false};
  const doc=perkDoc(node.perkId);
  if(!doc)throw Error(`Perk ${node.perkId} is not in this world. Import it through General Manager first.`);
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
    const account=readProgress(actor,stored);
    if(forUser){ // A player may unlock only what the player view shows them.
      const pub=project(stored),pn=pub?.nodes.find(x=>x.id===nodeId);
      if(!pub||!pn||pn.silhouette)throw Error('That node is not released to players');
      const ok=publicAvailability(pub,account,nodeId);if(!ok.ok)throw Error(ok.reason);
    }
    const next=purchase(t,account,nodeId);
    if(n.perkId&&!safePublicSource(n))throw Error(`${n.perkId} is not an approved, player-visible perk yet`);
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
async function refundNode(actor,treeId,nodeId){
  if(!game.user.isGM)throw Error('GM only');
  if(!actor)throw Error('No character selected');
  return withActorLock(actor.id,async()=>{
    const stored=readPrivate().find(t=>t.id===treeId);if(!stored)throw Error('Unknown tree');
    const next=refund(resolved(stored),readProgress(actor,stored),nodeId);
    await persistAccount(actor,stored,next);
    return removeGrants(actor,stored,nodeId);
  });
}
async function resetTreeFor(actor,treeId){
  if(!game.user.isGM)throw Error('GM only');
  if(!actor)throw Error('No character selected');
  return withActorLock(actor.id,async()=>{
    const stored=readPrivate().find(t=>t.id===treeId);if(!stored)throw Error('Unknown tree');
    await persistAccount(actor,stored,resetUnlocks(readProgress(actor,stored)));
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
    if(stored.provider.kind==='profession')continue;
    const acc=readProgress(actor,stored);if(!acc.unlocks.length)continue;
    for(const n of missingGrants(stored,acc,Array.from(actor.items??[]).map(grantOf))){
      try{await withActorLock(actor.id,()=>givePerk(actor,stored,n));given.push(`${actor.name}: ${perkDoc(n.perkId)?.name??n.perkId}`);}
      catch(error){failed.push(`${actor.name}: ${error.message}`);}
    }
  }
  return {given,failed};
}
function missingGrantCount(){
  let count=0;
  for(const actor of game.actors?.contents??[])for(const stored of readPrivate()){
    if(stored.provider.kind==='profession')continue;
    count+=missingGrants(stored,readProgress(actor,stored),Array.from(actor.items??[]).map(grantOf)).length;
  }
  return count;
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
const relationText=r=>[r.all.length?`Requires ${r.all.map(x=>x.name).join(' and ')}`:'',
  ...r.any.map(g=>`Requires one of ${g.nodes.map(x=>x.name).join(' or ')}`),
  r.excludes.length?`Cannot be taken with ${r.excludes.map(x=>x.name).join(', ')}`:''].filter(Boolean).join('. ');

class SkillTreeApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS={id:'agst-window-v2',classes:['ag-app','agst-window-v2'],window:{title:'Ashen Gate | Skill Trees',resizable:true,icon:'fa-solid fa-diagram-project'},position:{width:1120,height:740}};
  static PARTS={main:{template:`modules/${MODULE}/templates/tree.hbs`}};
  render(options){checkTreePlayerAccess();return super.render(options);}
  constructor(...args){super(...args);this.activeTab='trees';this.actorId=null;this.treeId=null;this.nodeId=null;this.editMode=false;this.playerPreview=false;this.linkFrom=null;this.zoom=1;this.search='';this.busy=false;this.listOpen=false;this.undo=[];this.redo=[];}
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
    const base=asArray(t?.nodes).map(n=>({...n,unlocked:acc.unlocks.includes(n.id)}));
    const nodes=base.map(n=>{
      const unlocked=n.unlocked,e=t&&actor?
        (raw?availability(t,acc,n.id):publicAvailability(t,acc,n.id)):{ok:false,reason:'Choose a character'};
      const rel=relationsOf(base,n),flag=unlocked?'UNLOCKED':e.ok?'AVAILABLE':'LOCKED';
      return {...n,unlocked,eligible:!unlocked&&e.ok,reason:unlocked?'Unlocked':e.reason,
        selected:n.id===this.nodeId,flag,rel,relText:relationText(rel),
        placeholder:n.status==='placeholder',silhouette:n.silhouette??false,img:n.silhouette?null:n.img??null,
        label:[`${n.name}: ${flag}`,`${n.cost??1} point${(n.cost??1)===1?'':'s'}`,relationText(rel)].filter(Boolean).join('. '),
        blocked:!unlocked&&!e.ok,style:`left:${n.x}px;top:${n.y}px;`};
    });
    const selected=nodes.find(n=>n.id===this.nodeId)??null;
    const onTree=new Set(asArray(t?.nodes).map(n=>n.perkId).filter(Boolean));
    const profession=t?.provider?.kind==='profession';
    const maxX=Math.max(990,...nodes.map(n=>n.x+225)),maxY=Math.max(700,...nodes.map(n=>n.y+160));
    const spent=t?totalSpent(t,acc):0;
    const points=Math.max(0,acc.awarded-spent);
    const store=gmPrivate();
    const legacy=gm?asArray(game.settings.get(MODULE,'treeData')?.trees).length:0;
    const features=gm&&!preview?(game.items?.contents??[]).filter(i=>i.type==='feat'&&/^(PERK|POWER)-/.test(sourceFlag(i)?.sourceId??'') && lookupWorldDefinition(game,sourceFlag(i)?.sourceId).document===i
      &&(!t||allowedSourceForProvider(t.provider.kind,sourceFlag(i)?.sourceId)))
      .filter(i=>`${i.name} ${sourceFlag(i).sourceId}`.toLowerCase().includes(this.search.toLowerCase()))
      .map(i=>({uuid:i.uuid,name:i.name,id:sourceFlag(i).sourceId,status:sourceFlag(i).status,img:i.img,onTree:onTree.has(sourceFlag(i).sourceId),
        eligible:sourceFlag(i).status==='approved'&&sourceFlag(i).visibility==='player'}))
      .sort((a,b)=>a.name.localeCompare(b.name)):[];
    const setupReport=gm&&!preview&&this.activeTab==='setup'?savedDataReport(readPrivate(),id=>Boolean(perkDoc(id))):[];
    const projectedCount=gm?readPublic().length:null;
    return {...ctx,gm,editing:gm&&this.editMode&&!preview,preview,initialized:!gm||!!store,legacy,
      moduleVersion:VERSION,playerAccessEnabled:gm?playerAccessEnabled():false,activeTrees:this.activeTab==='trees',activeSetup:gm&&this.activeTab==='setup',
      hasTree:!!t,tree:t,selected,canBuy:gm&&!preview&&!!selected&&!!actor&&availability(t,acc,selected.id).ok,
      canRequest:!gm&&!!selected&&!!actor&&!profession&&publicAvailability(t,acc,selected.id).ok,
      canRefund:raw&&!!selected?.unlocked&&!!actor&&!profession,
      canReset:raw&&!!actor&&!!t&&!profession&&acc.unlocks.length>0,
      actorName:actor?.name??'',
      canGrant:gm&&!preview&&!!actor&&!!t&&t.provider.kind!=='profession',
      mode:t?.provider?.kind==='profession'?'Profession • Ledger-authoritative (read-only)':t?.provider?.kind==='cinder_milestone'?'Cinder • 13-point milestone wallet': 'Generic • GM-awarded points',
      trees:this.trees.map(x=>({id:x.id,name:x.name,selected:x.id===this.treeId})),
      actors:actorChoices().map(x=>({id:x.id,name:x.name,selected:x.id===this.actorId})),
      nodes,edges:graphEdges(nodes).map(e=>({...e,marker:e.kind==='exclude'?'':`url(#agst-arrow-${e.active?'active':e.kind})`,
        label:e.kind==='exclude'?'✕':e.kind==='any'?(e.group>1?`OR ${e.group}`:'OR'):''})),selectedId:this.nodeId,listOpen:this.listOpen,
      progress:{awarded:acc.awarded,spent,available:points,unlocks:acc.unlocks.length,cap:t?.provider?.maxPoints??null},
      mapWidth:Math.ceil(maxX),mapHeight:Math.ceil(maxY),zoom:this.zoom,zoomText:`${Math.round(this.zoom*100)}%`,
      hasFeatures:!!features.length,features,search:this.search,linkFrom:this.linkFrom,
      publishedCount:projectedCount,privateCount:gm?readPrivate().length:0,hasPrivateStore:!!store,hasPrivateTree:gm&&!!t,
      awaitingProvider:t?.provider.kind==='profession',isTest:t?.status==='test',
      bindingNote:raw&&selected?.perkId?selected.perkId:null,
      selectedBinding:raw&&selected?.perkId?!selected.perkMissing:false,selectedCustom:raw&&!!selected?.custom,
      setupReport,hasSetupReport:setupReport.length>0,missingGrants:gm&&!preview&&this.activeTab==='setup'?missingGrantCount():0};
  }
  async _onRender(context,options){
    await super._onRender(context,options);if(!canOpenTrees()){await this.close?.({animate:false});return;}instance=this;openTreeWindows.add(this);
    const root=this.element;
    this._listeners?.abort();this._listeners=new AbortController();
    const listenerOptions={signal:this._listeners.signal};
    root.addEventListener('click',e=>this._clicked(e),listenerOptions);
    root.addEventListener('change',e=>{
      const el=e.target;
      if(el.id==='agst-tree-choice'){this.treeId=el.value;this.nodeId=null;this.linkFrom=null;this.undo=[];this.redo=[];this.render();}
      if(el.id==='agst-actor-choice'){this.actorId=el.value;this.render();}
    },listenerOptions);
    root.querySelector('.agst-tree-list')?.addEventListener('toggle',e=>{this.listOpen=e.target.open;},listenerOptions);
    root.querySelector('#agst-feature-search')?.addEventListener('input',e=>{this.search=e.target.value;const cards=root.querySelectorAll('.agst-feature');for(const c of cards)c.hidden=!`${c.textContent}`.toLowerCase().includes(this.search.toLowerCase());},listenerOptions);
    const board=root.querySelector('.agst-board');
    if(board){
      board.style.zoom=String(this.zoom);
      board.addEventListener('dragover',e=>{if(game.user.isGM&&this.editMode&&!this.playerPreview)e.preventDefault();},listenerOptions);
      board.addEventListener('drop',e=>this._dropped(e),listenerOptions);
      board.addEventListener('pointerdown',e=>this._pointerDown(e),listenerOptions);
    }
    root.querySelectorAll('.agst-feature').forEach(el=>el.addEventListener('dragstart',e=>e.dataTransfer?.setData('text/plain',JSON.stringify({type:'Item',uuid:el.dataset.uuid})),listenerOptions));
  }
  async _clicked(event){
    try{checkTreePlayerAccess();}catch(error){notify(error.message,true);await this.close?.({animate:false});return;}
    const el=event.target.closest('[data-act]');if(!el||this.busy)return;
    const action=el.dataset.act,id=el.dataset.id;
    if(action==='tab-trees'){this.activeTab='trees';this.render();return;}
    if(action==='tab-setup'){if(!game.user.isGM){notify('GM Setup is restricted to the GM.',true);return;}this.activeTab='setup';this.editMode=false;this.playerPreview=false;this.render();return;}
    if(action==='select'){
      if(this.linkFrom&&game.user.isGM&&this.editMode){try{await this._linkTo(id);}catch(e){notify(e.message,true);}return;}
      this.nodeId=id;this.render();return;
    }
    if(action==='zoom-in'){this.zoom=Math.min(1.6,Math.round((this.zoom+.1)*10)/10);this.render();return;}
    if(action==='zoom-out'){this.zoom=Math.max(.6,Math.round((this.zoom-.1)*10)/10);this.render();return;}
    if(action==='zoom-reset'){this.zoom=1;this.render();return;}
    this.busy=true;
    try{
      switch(action){
        case 'help': await this._help();break;
        case 'toggle-player-access':if(!game.user.isGM)throw Error('GM only');{const next=!playerAccessEnabled();await setPlayerAccess(game,MODULE,next);notify(`Player tree interface ${next?'visible':'hidden'}; purchased nodes and point pools are unchanged.`);}break;
        case 'initialize': await initializeStore();break;
        case 'qa-install':await this._installQa();break;
        case 'qa-reset':await this._resetQa();break;
        case 'create-tree':await this._newTree();break;
        case 'edit-mode':this.editMode=!this.editMode;this.linkFrom=null;this.activeTab='trees';break;
        case 'player-preview':this.playerPreview=!this.playerPreview;this.activeTab='trees';this.editMode=false;this.nodeId=null;break;
        case 'grant':await this._grant();break;
        case 'purchase':await this._purchase();break;
        case 'request':await this._request();break;
        case 'refund':await this._refund();break;
        case 'reset-tree':await this._resetTree();break;
        case 'give-missing':await this._giveMissing();break;
        case 'edit-node':await this._editNode();break;
        case 'add-perk':await this._addPerkFromList(el.dataset.uuid);break;
        case 'assign-perk':await this._assignPerk();break;
        case 'remove-node':await this._removeNode();break;
        case 'tree-settings':await this._treeSettings();break;
        case 'link':this.linkFrom=this.nodeId;notify('Select another node to add an AND prerequisite connection.');break;
        case 'undo':await this._undo();break;
        case 'redo':await this._redo();break;
        case 'publish':await publishPublic();notify('Player projection republished.');break;
        case 'export':this._export(false);break;
        case 'export-all':this._export(true);break;
        case 'backup-progress':this._backupProgress();break;
        case 'legacy-preview':await this._legacyPreview();break;
        case 'legacy-clear':await this._legacyClear();break;
      }
      this.render();
    }catch(error){console.error(`[${MODULE}]`,error);notify(`Skill Trees: ${error.message}`,true);}finally{this.busy=false;}
  }
  async _help(){
    await confirm('<p><strong>Tree View</strong> shows a character’s tree. Each node is a perk. Arrows point from a prerequisite to the perk it opens; a dashed arrow marked OR means any one of that group is enough; a red dotted line marked ✕ joins perks that cannot both be taken. Select a node to read the same information as text.</p><p><strong>Unlock</strong> spends the character’s points and adds the perk to their sheet. Players unlock their own characters while a GM is logged in; the GM can unlock, refund or reset (refund removes the perk from the sheet).</p><p><strong>GM Setup</strong> has publishing, export (backups) and the saved-data check. Tree files are imported through General Manager.</p><p>Profession trees are read-only here: the Profession Ledger owns profession perk choices.</p>','Skill Trees help');
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
    if(!await confirm('<p><strong>Install test-world records?</strong> This creates one real [AG QA] character Actor, two draft GM-only Feature Items, and three [AG QA] tree layouts in the existing private Journal. They are not approved game content, do not award XP/Perks or grant Item effects, and can be removed using Reset QA Fixture.</p><p>Use a disposable test world. You must manually grant a test player Actor ownership for player tests.</p>','Install QA Fixture'))return;
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
    if(!await confirm(`<p><strong>Remove QA test records?</strong> This removes ${qaTrees.length} QA tree layouts and deletes only ${qaDocs.length} native documents tagged <code>${QA_FIXTURE}</code> (including the disposable QA Actor and its test progress).</p><p>Unrelated layouts, world records, and other Actors are not deleted. Export test evidence before resetting. Existing legacy Demo trees are not touched.</p>`,'Reset QA Fixture'))return;
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
    const f=await input('Create tree',`<div class="agst-form"><label>Name<input name="name" value="New Tree" maxlength="120" required></label>
      <label>Provider<select name="kind"><option value="generic_points">Generic points</option><option value="cinder_milestone">Cinder • 13 milestones</option><option value="profession">Profession • Ledger read-only</option></select></label>
      <label>Canonical source ID (PROF-* / MUT-* when applicable)<input name="sourceRef" placeholder="MUT-EXAMPLE or PROF-EXAMPLE"></label>
      <label>Generic point limit (1–999)<input type="number" name="maxPoints" value="10" min="1" max="999"></label>
      <p>Created as a hidden draft. Only explicitly released nodes become player-visible.</p></div>`,'Create');
    if(!f)return;
    const kind=f.kind||'generic_points';const t={id:newKey('LOCAL-TREE'),name:String(f.name??'').trim(),description:'New draft tree.',sourceRef:String(f.sourceRef??'').trim()||null,
      provider:{kind,maxPoints:kind==='cinder_milestone'?13:kind==='profession'?null:Number(f.maxPoints)},status:'draft',visibility:'gm',nodes:[]};
    const v=validateTree(t);if(v.errors.length)throw Error(v.errors.join('; '));
    await saveTrees([...readPrivate(),t]);this.treeId=t.id;this.activeTab='trees';this.editMode=true;this.nodeId=null;notify('Draft tree created.');
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
    const t=copy(this.storedTree);const f=await input('Tree settings',`<div class="agst-form"><label>Name<input name="name" value="${escape(t.name)}" maxlength="120"></label>
      <label>Description (player-readable when published)<textarea name="description" rows="3">${escape(t.description)}</textarea></label>
      <label>Release status<select name="status"><option value="draft" ${t.status==='draft'?'selected':''}>Draft: GM only</option><option value="test" ${t.status==='test'?'selected':''}>Test: not canon</option><option value="approved" ${t.status==='approved'?'selected':''}>Approved</option></select></label>
      <label>Visibility<select name="visibility"><option value="gm" ${t.visibility==='gm'?'selected':''}>GM only</option><option value="player" ${t.visibility==='player'?'selected':''}>Player-visible</option></select></label>
      ${t.provider.kind==='generic_points'?`<label>Max points<input type="number" min="1" max="999" name="maxPoints" value="${t.provider.maxPoints??10}"></label>`:''}
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
    if(!/^(PERK|POWER)-[A-Z0-9-]+$/.test(id??''))throw Error('That Item has no General Manager PERK-* / POWER-* id');
    if(perkDoc(id)!==doc)throw Error('Missing, archived or duplicated perk binding; resolve duplicates in General Manager first');
    const t=copy(this.storedTree);
    if(!allowedSourceForProvider(t.provider.kind,id))throw Error('Wrong perk type for this tree: Profession and generic trees use PERK-*, Cinder trees use POWER-*; HPERK-* belongs to Hirelings');
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
    const f=await input('Assign perk',`<div class="agst-form"><label>Perk<select name="perk">${perks.map(i=>{const id=sourceFlag(i).sourceId;
      return `<option value="${escape(id)}" ${id===n.perkId?'selected':''}>${escape(i.name)} (${escape(id)})</option>`;}).join('')}</select></label>
      <p>The node takes its name, text, picture and point cost from the perk. Position and prerequisites stay as they are.</p></div>`,'Assign');
    if(!f?.perk)return;
    const doc=perkDoc(f.perk);if(!doc)throw Error('That perk is no longer in this world');
    n.perkId=f.perk;n.perkUuid=doc.uuid;
    await this._saveEdited(t);notify(`Node now gives ${doc.name}.`);
  }
  async _editNode(){
    if(!game.user.isGM||!this.editMode||!this.storedTree||!this.nodeId)throw Error('Choose a node while editing');
    const t=copy(this.storedTree),n=t.nodes.find(x=>x.id===this.nodeId);if(!n)throw Error('Missing node');
    const shown=resolved(t),nameOf=id=>shown.nodes.find(x=>x.id===id)?.name??id,others=t.nodes.filter(x=>x.id!==n.id);
    const groups=Math.max(3,n.requiresAny.length+1);
    const reqOf=id=>n.requiresAll.includes(id)?'all':(i=>i>=0?`any${i+1}`:'none')(n.requiresAny.findIndex(g=>g.includes(id)));
    const opts=id=>['none','all',...Array.from({length:groups},(_,i)=>`any${i+1}`)].map(v=>`<option value="${v}" ${reqOf(id)===v?'selected':''}>${v==='none'?'—':v==='all'?'Required':`OR group ${v.slice(3)}`}</option>`).join('');
    const rows=others.map((x,i)=>`<tr><th scope="row">${escape(nameOf(x.id))}</th><td><select name="req_${i}" aria-label="${escape(nameOf(x.id))} as a prerequisite">${opts(x.id)}</select></td>
      <td><input type="checkbox" name="ex_${i}" aria-label="Cannot be taken with ${escape(nameOf(x.id))}" ${n.excludes.includes(x.id)?'checked':''}></td></tr>`).join('');
    const custom=!n.perkId;
    const f=await input(`Edit node • ${nameOf(n.id)}`,`<div class="agst-form">
      ${custom?`<p class="agst-warn">Older custom node with no perk: it records an unlock but gives no Item. Use <strong>Assign Perk</strong> to turn it into a perk node.</p>
        <label>Name<input name="name" value="${escape(n.name)}" maxlength="120"></label>
        <label>Description<textarea name="description" rows="3">${escape(n.description)}</textarea></label>
        <label>Point cost<input type="number" name="cost" min="1" max="100" value="${n.cost??1}"></label>`
        :`<p>Perk <code>${escape(n.perkId)}</code>: name, text, picture and point cost come from the perk.</p>`}
      ${others.length?`<table class="agst-prereq-table"><caption>Before this node can be unlocked</caption><thead><tr><th scope="col">Node</th><th scope="col">Needed?</th><th scope="col">Cannot be taken with</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="agst-help"><strong>Required</strong>: every one is needed. <strong>OR group</strong>: any one node of that group is enough (each group must be met).</p>`:''}
      <label>Status<select name="status">${['draft','test','approved','placeholder'].map(k=>`<option value="${k}" ${n.status===k?'selected':''}>${k}</option>`).join('')}</select></label>
      <label>Visibility<select name="visibility"><option value="gm" ${n.visibility==='gm'?'selected':''}>GM only</option><option value="player" ${n.visibility==='player'?'selected':''}>Player-visible</option><option value="reveal_gated" ${n.visibility==='reveal_gated'?'selected':''}>Reveal-gated (hidden until source released)</option></select></label>
      <label>Display<select name="display"><option value="hidden" ${n.display==='hidden'?'selected':''}>Hidden</option><option value="teaser" ${n.display==='teaser'?'selected':''}>Silhouette</option><option value="shown" ${n.display==='shown'?'selected':''}>Shown</option></select></label>
      <p class="agst-help">A placeholder is always GM-only; the editor enforces this even if other fields are selected.</p></div>`);
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
  async _removeNode(){
    if(!game.user.isGM||!this.editMode||!this.tree||!this.nodeId)throw Error('GM editor only');
    const t=copy(this.storedTree),n=t.nodes.find(n=>n.id===this.nodeId);
    if(!n)throw Error('Missing node');
    if(allProgressFor(t).some(a=>a.unlocks.includes(n.id)))throw Error('Purchased node cannot be deleted');
    if(!await confirm(`<p>Remove ${escape(this.tree?.nodes.find(x=>x.id===n.id)?.name??n.id)} and its connections from this tree? The perk Item itself is not deleted.</p>`,'Remove node'))return;
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
    const f=await input('Award progression points',`<div class="agst-form"><p><strong>${escape(this.actor.name)}</strong> · ${escape(this.tree.name)}</p>
      <label>Award label (unique per Actor/track)<input name="label" maxlength="100" value="Milestone ${readProgress(this.actor,this.tree).grants.length+1}"></label>
      <label>Points to award<input type="number" min="1" max="${this.tree.provider.kind==='cinder_milestone'?'1':'100'}" name="amount" value="1"></label>
      <p>Cinder: one point per uniquely labeled manifestation/milestone, 13 lifetime points maximum. GM only.</p></div>`,'Award');
    if(!f)return;
    const a=readProgress(this.actor,this.tree),next=grantPoints(this.tree,a,Number(f.amount),String(f.label??''));
    if(!await confirm(`<p>Grant ${Number(f.amount)} point(s) to ${escape(this.actor.name)} for <strong>${escape(this.tree.name)}</strong>?</p>`,'Confirm award'))return;
    await persistAccount(this.actor,this.tree,next);notify('Points awarded.');
  }
  async _purchase(){
    if(!game.user.isGM||!this.tree||!this.actor||!this.nodeId)throw Error('GM and Actor selection required');
    const actor=this.actor,t=this.tree,n=t.nodes.find(x=>x.id===this.nodeId);
    if(!n)throw Error('Missing private node');
    const ok=availability(t,readProgress(actor,t),n.id);if(!ok.ok)throw Error(ok.reason);
    if(!await confirm(`<p>Spend <strong>${ok.cost}</strong> point(s) and unlock <strong>${escape(n.name)}</strong> for ${escape(actor.name)}?</p><p>${n.perkId?'The perk is added to the character sheet.':'This older custom node has no perk, so nothing is added to the sheet.'}</p>`,'Unlock perk'))return;
    const {item}=await unlockNode(actor,t.id,n.id);
    notify(item?`${n.name} unlocked and added to ${actor.name}.`:`${n.name} unlocked (no perk Item: custom node).`);
  }
  async _request(){
    if(game.user.isGM||!this.tree||!this.actor||!this.nodeId)throw Error('Select an available perk');
    const actor=this.actor;if(!actor.isOwner)throw Error('You do not own the selected character');
    const n=this.tree.nodes.find(x=>x.id===this.nodeId);
    const ok=publicAvailability(this.tree,readProgress(actor,this.tree),n?.id);
    if(!ok.ok)throw Error(ok.reason);
    if(!await confirm(`<p>Spend <strong>${n.cost??1}</strong> point(s) to unlock <strong>${escape(n.name)}</strong> for ${escape(actor.name)}?</p><p>The perk is added to the character sheet. Only the GM can refund it.</p>`,'Unlock perk'))return;
    const result=await requestUnlock(actor,this.tree.id,n.id);
    notify(result.message);
  }
  async _refund(){
    if(!game.user.isGM||!this.tree||!this.actor||!this.nodeId)throw Error('GM, character and node required');
    const actor=this.actor,n=this.tree.nodes.find(x=>x.id===this.nodeId);if(!n)throw Error('Missing node');
    const items=grantedItems(actor,this.tree,n.id).map(i=>i.name);
    if(!await confirm(`<p>Refund <strong>${escape(n.name)}</strong> for ${escape(actor.name)}?</p><p>The point(s) go back to the character${items.length?` and <strong>${items.map(escape).join(', ')}</strong> is removed from the sheet`:''}.</p>`,'Refund perk'))return;
    const {removed}=await refundNode(actor,this.tree.id,n.id);
    notify(`Refunded ${n.name}${removed.length?`; removed ${removed.join(', ')} from ${actor.name}`:''}.`);
  }
  async _resetTree(){
    if(!game.user.isGM||!this.tree||!this.actor)throw Error('GM and character required');
    const actor=this.actor,acc=readProgress(actor,this.tree);
    if(!await confirm(`<p>Reset <strong>${escape(this.tree.name)}</strong> for ${escape(actor.name)}?</p><p>All ${acc.unlocks.length} unlock(s) are refunded and the perks this tree gave are removed from the sheet. Points awarded stay.</p>`,'Reset tree'))return;
    const {removed}=await resetTreeFor(actor,this.tree.id);
    notify(`Reset ${this.tree.name} for ${actor.name}; removed ${removed.length} perk Item(s).`);
  }
  async _giveMissing(){
    if(!game.user.isGM)throw Error('GM only');
    if(!await confirm('<p>Add the perk Item to every character that has an unlocked perk node but no matching Item on the sheet (for example, unlocks made before Skill Trees 0.8.0)?</p><p>Nothing is removed. Safe to run again.</p>','Give missing perks'))return;
    const {given,failed}=await giveMissingPerks();
    if(failed.length)throw Error(`Gave ${given.length}; ${failed.length} failed: ${failed.slice(0,4).join('; ')}`);
    notify(given.length?`Gave ${given.length} perk Item(s): ${given.slice(0,6).join('; ')}`:'Nothing missing: every unlocked perk is on its sheet.');
  }
  _export(all){
    if(!game.user.isGM)throw Error('GM only');
    const trees=all?readPrivate():[this.storedTree].filter(Boolean);
    if(!trees.length)throw Error('No tree selected');
    download(all?'AG_Skill_Trees_GM_Layouts.json':`AG_Skill_Tree_${this.storedTree?.id??this.tree.id}.json`,{schema:SCHEMA,exportedAt:new Date().toISOString(),status:'prototype_not_canonical',trees});
  }
  _backupProgress(){
    if(!game.user.isGM)throw Error('GM only');
    download('AG_Skill_Tree_Actor_Progress_v02_BACKUP.json',{
      schema:'ag-skill-trees-progress/0.2',createdAt:new Date().toISOString(),
      actors:(game.actors?.contents??[]).map(a=>({actorId:a.id,actorName:a.name,progress:copy(safeFlag(a,'progressV2')??{})})),
      note:'GM backup only. No automatic restore in this alpha.'});notify('GM Actor progress backup downloaded.');
  }
  async _legacyPreview(){
    if(!game.user.isGM)throw Error('GM only');
    const old=asArray(game.settings.get(MODULE,'treeData')?.trees);if(!old.length)throw Error('No legacy v0.1 trees found');
    if(!gmPrivate())throw Error('Initialize GM storage first');
    const candidates=old.filter(t=>!readPrivate().some(v=>v.id===t.id));
    if(!await confirm(`<p>Legacy v0.1 contains <strong>${old.length}</strong> trees; <strong>${candidates.length}</strong> can be migrated into new GM-only <em>hidden draft layouts</em>.</p><p>Old Stage rules and UUID Item rewards are NOT imported as working mechanics. Actor progress stays in its v0.1 flags and is not migrated. The original setting is not cleared by this action.</p><p><strong>Back up your world before proceeding.</strong></p>`,'Preview legacy migration'))return;
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
    if(!await confirm(`<p><strong>Privacy cleanup:</strong> download a backup and clear the legacy v0.1 world setting which may be visible to players.</p><p>This leaves any old v0.1 Actor flags untouched. Only do this after your layout migration is reviewed.</p>`,'Clear legacy public setting?'))return;
    download('AG_Skill_Trees_v01_Legacy_Backup_BEFORE_CLEAR.json',old);
    await game.settings.set(MODULE,'treeData',{schema:'ag-skill-trees/0.1',trees:[]});notify('Legacy setting cleared; backup downloaded.');
  }
  async _dropped(event){
    if(!game.user.isGM||!this.editMode||this.playerPreview||!this.tree)return;
    event.preventDefault();
    try{
      const raw=event.dataTransfer?.getData('text/plain')??'';
      let data;try{data=JSON.parse(raw);}catch{throw Error('Drop a perk Item from the Items sidebar or the perk list');}
      if(data?.type!=='Item')throw Error('Drop a perk Item from the Items sidebar or the perk list');
      const doc=await fromUuid(data.uuid);
      const board=this.element.querySelector('.agst-board'),rect=board.getBoundingClientRect();
      const x=Math.round(Math.max(0,Math.min(6000,(event.clientX-rect.left)/this.zoom-85))/10)*10;
      const y=Math.round(Math.max(0,Math.min(6000,(event.clientY-rect.top)/this.zoom-35))/10)*10;
      await this._addPerkNode(doc,x,y);this.render();
    }catch(e){console.error(e);notify(`Perk drop: ${e.message}`,true);}
  }
  _pointerDown(event){
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
      const board=this.element.querySelector('.agst-board');
      const pos=nodeId=>{const el=board?.querySelector(`.agst-node[data-id="${CSS.escape(nodeId)}"]`);
        return el?{x:parseFloat(el.style.left),y:parseFloat(el.style.top)}:null;};
      for(const el of board?.querySelectorAll('[data-edge]')??[]){
        if(el.dataset.from!==id && el.dataset.to!==id)continue;
        const src=pos(el.dataset.from),dst=pos(el.dataset.to);if(!src||!dst)continue;
        const line=edgeLine(src,dst);
        if(el.tagName.toLowerCase()==='path')el.setAttribute('d',line.d);
        else{el.setAttribute('x',line.mx);el.setAttribute('y',line.my);}
      }
    };
    const stop=async e=>{
      window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);
      if(!moved)return;
      const t=copy(this.storedTree),n=t.nodes.find(v=>v.id===id);
      n.x=Math.round(Math.max(0,Math.min(6000,original.x+(e.clientX-startX)/this.zoom))/10)*10;
      n.y=Math.round(Math.max(0,Math.min(6000,original.y+(e.clientY-startY)/this.zoom))/10)*10;
      try{await this._saveEdited(t);}catch(err){console.error(err);notify(err.message,true);}
      this.render();
    };
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',stop,{once:true});
  }
}

function addDirectoryLauncher(app,html){
  return mountLauncher(launcherRoot(app,html),{moduleId:MODULE,label:'Skill Trees',icon:'fa-solid fa-diagram-project',
    onClick:()=>{try{open();}catch(error){notify(error.message,true);}},visible:canOpenTrees()});
}
function open({treeId=null,actorId=null}={}){
  checkTreePlayerAccess();
  if(!instance)instance=new SkillTreeApp();
  if(treeId)instance.treeId=treeId;
  if(actorId)instance.actorId=actorId;
  instance.render({force:true});return instance;
}
Hooks.once('init',()=>{
  Hooks.on('renderActorDirectory',addDirectoryLauncher);
  Hooks.on('closeApplicationV2',app=>{openTreeWindows.delete(app);if(instance===app)instance=null;});
  // Existing player-facing Skill Trees retains player access on upgrade.
  game.settings.register(MODULE,PLAYER_ACCESS_SETTING,{name:'Player Access — Skill Trees',hint:'GM only: hide or reveal the player tree interface without deleting points, node unlocks or Feature Items.',scope:'world',config:true,type:Boolean,default:true,
    onChange:value=>syncTreePlayerAccess(value)});
  // Preserve v0.1 registration for explicit legacy migration/backup; never silently delete it.
  game.settings.register(MODULE,'treeData',{scope:'world',config:false,type:Object,default:{schema:'ag-skill-trees/0.1',trees:[]}});
  game.settings.register(MODULE,SAFE_SETTING,{scope:'world',config:false,type:Object,default:{schema:SCHEMA,trees:[]},onChange:()=>instance?.rendered&&instance.render()});
  game.settings.registerMenu(MODULE,'open',{name:'Ashen Gate | Skill Trees',label:'Open Skill Trees',hint:'Interactive Skill Trees v0.6. GM-controlled player access; independent of Manager.',icon:'fa-solid fa-diagram-project',type:SkillTreeApp,restricted:false});
});
Hooks.once('ready',()=>{
  const mod=game.modules.get(MODULE);if(!mod)return;
  mod.api={
    version:VERSION,open,
    playerAccess:{contract:PLAYER_ACCESS_CONTRACT,getState:()=>accessState(game,MODULE),setEnabled:enabled=>setPlayerAccess(game,MODULE,enabled)},
    listTrees:()=>{checkTreePlayerAccess();return copy(readSelectedTrees(false));},
    actorProgress:(actor,treeId)=>{checkTreePlayerAccess();if(!game.user.isGM&&!hasOwner(actor))throw Error('Actor access denied');const t=readSelectedTrees(false).find(x=>x.id===treeId);return t?readProgress(actor,t):null;},
    grantPoints:async(actor,treeId,amount,label)=>{
      if(!game.user.isGM)throw Error('GM only');const t=readPrivate().find(x=>x.id===treeId);if(!t)throw Error('Unknown tree');
      const next=grantPoints(t,readProgress(actor,t),amount,label);await persistAccount(actor,t,next);return next;
    },
    grantXp:async()=>{throw Error('Legacy XP grant retired: Profession XP belongs to the Profession Ledger; use grantPoints for Cinders/generic trees.');},
    publish:async()=>{if(!game.user.isGM)throw Error('GM only');return publishPublic();},
    // Unlock spends the character's points and adds the perk Item. A player's call is checked and done by the active GM client.
    unlock:async(actor,treeId,nodeId)=>{checkTreePlayerAccess();
      if(game.user.isGM){const {node,item}=await unlockNode(actor,treeId,nodeId);return {ok:true,nodeId:node.id,itemId:item?.id??null};}
      if(!actor?.isOwner)throw Error('Actor access denied');await requestUnlock(actor,treeId,nodeId);return {ok:true,nodeId};},
    refund:async(actor,treeId,nodeId)=>refundNode(actor,treeId,nodeId),
    resetTree:async(actor,treeId)=>resetTreeFor(actor,treeId),
    giveMissingPerks:async()=>giveMissingPerks(),
    // GM-only, UI-less hand-off used by General Manager's single importer. Never touches Actor progress.
    previewTreeImport:(pack,{mode='skip'}={})=>{
      if(!game.user.isGM)throw Error('GM only');
      const {errors,rows}=planTreeImport(pack,readPrivate(),{mode});
      return {errors,rows:rows.map(({id,name,action,reason})=>({id,name,action,reason}))};
    },
    importTrees:async(pack,{mode='skip'}={})=>{
      if(!game.user.isGM)throw Error('GM only');if(!gmPrivate())throw Error('Initialize GM storage first (Skill Trees → GM Setup).');
      const current=readPrivate();
      const {errors,rows,apply}=planTreeImport(pack,current,{mode});
      if(errors.length)throw Error(`Import blocked: ${errors[0]}`);
      const report={created:rows.filter(r=>r.action==='new').map(r=>r.id),updated:rows.filter(r=>r.action==='update').map(r=>r.id),
        skipped:rows.filter(r=>r.action==='skip').map(r=>({id:r.id,reason:r.reason})),failed:[],
        // Layouts import even when a perk is not in the world yet; those nodes cannot be unlocked until it is.
        warnings:savedDataReport(apply,id=>Boolean(perkDoc(id))).map(r=>`${r.treeId} / ${r.nodeId}: ${r.text}`)};
      if(!apply.length)return report;
      const combined=new Map(current.map(t=>[t.id,t]));for(const t of apply)combined.set(t.id,t);
      try{await saveTrees([...combined.values()]);}
      catch(error){return {created:[],updated:[],skipped:report.skipped,failed:apply.map(t=>({id:t.id,reason:String(error?.message??error)})),warnings:report.warnings};}
      return report;
    }
  };
  game.socket?.on?.(SOCKET,onSocket);
  if(ui.actors?.rendered) addDirectoryLauncher(ui.actors,ui.actors.element);
  Hooks.on('updateActor',actor=>{if(instance?.rendered && instance.actorId===actor.id)instance.render();});
  if(game.user.isGM){
    // World perks feed node names/text; an Item on a character sheet does not change the published view.
    for(const eventName of ['createItem','updateItem','deleteItem'])Hooks.on(eventName,async item=>{
      if(item?.parent||!gmPrivate())return;
      try{await publishPublic();}catch(e){console.error(`[${MODULE}] Auto-publish error`,e);}
    });
  }
});
