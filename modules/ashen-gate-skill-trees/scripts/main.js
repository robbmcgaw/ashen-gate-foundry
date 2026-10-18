import {
  SCHEMA,clone,asArray,cleanAccount,walletKey,normalizeTree,validateTree,validatePackage,allowedSourceForProvider,
  availability,publicAvailability,publicTree,totalSpent,grantPoints,purchase,changedPurchasedNodes
} from './engine.mjs';
import {PLAYER_ACCESS_CONTRACT,PLAYER_ACCESS_SETTING,playerAccessAllowed,assertPlayerAccess,accessState,setPlayerAccess} from './player-access.mjs';
import {lookupWorldDefinition} from './definition-lookup.mjs';
import {launcherRoot,mountLauncher} from './ag-launchers.mjs';
import {QA_FIXTURE,QA_TREES,qaTreeLayouts,qaSourceItems,qaActorData,isQaDocument,qaCleanupBlockers} from './qa-fixtures.mjs';

/** Skill Trees 0.6.0 alpha: shared Foundry development-standard UI; private GM definitions. */
const MODULE='ashen-gate-skill-trees';
const VERSION='0.6.2';
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
const parseList=v=>String(v??'').split(',').map(s=>s.trim()).filter(Boolean);
const parseAny=v=>String(v??'').split(';').map(parseList).filter(a=>a.length);
const newKey=(prefix='LOCAL-NODE')=>`${prefix}-${foundry.utils.randomID(14)}`;
const managerBinding=id=>lookupWorldDefinition(game,id,{}).document??null;
const safePublicSource=n=>{
  if(!n.contentRef)return true; // Sandbox nodes may be contentless.
  const hit=lookupWorldDefinition(game,n.contentRef.target_id,{publicForAll:true,approvedOnly:true});
  const doc=hit.document,source=hit.source;
  return Boolean(doc?.documentName==='Item'&&doc?.type==='feat'&&source?.entityType===
    (n.contentRef.target_id.startsWith('PERK-')?'ProfessionPerk':'Power') && !/placeholder/i.test(doc.name));
};
const project=t=>publicTree({...t,nodes:t.nodes.map(n=>safePublicSource(n)?n:{...n,visibility:'gm',display:'hidden'})});
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
function makePaths(nodes){
  const lookup=new Map(nodes.map(n=>[n.id,n]));const paths=[];
  for(const n of nodes)for(const id of [...asArray(n.requiresAll),...asArray(n.requiresAny).flat()]){
    const parent=lookup.get(id);if(!parent)continue;
    const x1=parent.x+90,y1=parent.y+33,x2=n.x+90,y2=n.y+33;
    const dx=(x2-x1)*0.5,dy=(y2-y1)*0.12;
    paths.push({from:id,to:n.id,d:`M ${x1} ${y1} C ${x1+dx} ${y1+dy}, ${x2-dx} ${y2-dy}, ${x2} ${y2}`,
      active:Boolean(n.unlocked&&parent.unlocked),isOr:asArray(n.requiresAny).some(g=>g.includes(id))});
  }
  return paths;
}

class SkillTreeApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS={id:'agst-window-v2',classes:['agst-window-v2'],window:{title:'Ashen Gate | Skill Trees',resizable:true,icon:'fa-solid fa-diagram-project'},position:{width:1120,height:740}};
  static PARTS={main:{template:`modules/${MODULE}/templates/tree.hbs`}};
  render(options){checkTreePlayerAccess();return super.render(options);}
  constructor(...args){super(...args);this.activeTab='trees';this.actorId=null;this.treeId=null;this.nodeId=null;this.editMode=false;this.playerPreview=false;this.linkFrom=null;this.zoom=1;this.search='';this.busy=false;this.undo=[];this.redo=[];}
  get actor(){return game.actors?.get(this.actorId)??null;}
  get trees(){return readSelectedTrees(this.playerPreview);}
  get tree(){return this.trees.find(t=>t.id===this.treeId)??null;}
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
    const nodes=asArray(t?.nodes).map(n=>{
      const unlocked=acc.unlocks.includes(n.id),e=t&&actor?
        (raw?availability(t,acc,n.id):publicAvailability(t,acc,n.id)):{ok:false,reason:'Choose a character'};
      return {...n,unlocked,eligible:!unlocked&&e.ok,reason:unlocked?'Unlocked':e.reason,
        selected:n.id===this.nodeId,flag:unlocked?'UNLOCKED':e.ok?'AVAILABLE':'LOCKED',
        placeholder:n.status==='placeholder',silhouette:n.silhouette??false,
        blocked:!unlocked&&!e.ok,style:`left:${n.x}px;top:${n.y}px;`};
    });
    const selected=nodes.find(n=>n.id===this.nodeId)??null;
    const maxX=Math.max(990,...nodes.map(n=>n.x+225)),maxY=Math.max(700,...nodes.map(n=>n.y+160));
    const spent=t?totalSpent(t,acc):0;
    const points=Math.max(0,acc.awarded-spent);
    const store=gmPrivate();
    const legacy=gm?asArray(game.settings.get(MODULE,'treeData')?.trees).length:0;
    const features=gm&&!preview?(game.items?.contents??[]).filter(i=>i.type==='feat'&&/^(PERK|POWER)-/.test(sourceFlag(i)?.sourceId??'') && lookupWorldDefinition(game,sourceFlag(i)?.sourceId).document===i
      &&(!t||allowedSourceForProvider(t.provider.kind,sourceFlag(i)?.sourceId)))
      .filter(i=>`${i.name} ${sourceFlag(i).sourceId}`.toLowerCase().includes(this.search.toLowerCase()))
      .map(i=>({uuid:i.uuid,name:i.name,id:sourceFlag(i).sourceId,status:sourceFlag(i).status,
        eligible:sourceFlag(i).status==='approved'&&sourceFlag(i).visibility==='player'})):[];
    const projectedCount=gm?readPublic().length:null;
    return {...ctx,gm,editing:gm&&this.editMode&&!preview,preview,initialized:!gm||!!store,legacy,
      moduleVersion:VERSION,playerAccessEnabled:gm?playerAccessEnabled():false,activeTrees:this.activeTab==='trees',activeSetup:gm&&this.activeTab==='setup',
      hasTree:!!t,tree:t,selected,canBuy:gm&&!preview&&!!selected&&!!actor&&!selected.contentRef?.target_id?.startsWith('PERK-')&&availability(t,acc,selected.id).ok,
      canRequest:!gm&&!!selected&&!!actor&&publicAvailability(t,acc,selected.id).ok,
      canGrant:gm&&!preview&&!!actor&&!!t&&t.provider.kind!=='profession',
      mode:t?.provider?.kind==='profession'?'Profession • Ledger-authoritative (read-only)':t?.provider?.kind==='cinder_milestone'?'Cinder • 13-point milestone wallet': 'Generic • GM-awarded points',
      trees:this.trees.map(x=>({id:x.id,name:x.name,selected:x.id===this.treeId})),
      actors:actorChoices().map(x=>({id:x.id,name:x.name,selected:x.id===this.actorId})),
      nodes,paths:makePaths(nodes),selectedId:this.nodeId,
      progress:{awarded:acc.awarded,spent,available:points,unlocks:acc.unlocks.length,cap:t?.provider?.maxPoints??null},
      mapWidth:Math.ceil(maxX),mapHeight:Math.ceil(maxY),zoom:this.zoom,zoomText:`${Math.round(this.zoom*100)}%`,
      hasFeatures:!!features.length,features,search:this.search,linkFrom:this.linkFrom,
      publishedCount:projectedCount,privateCount:gm?readPrivate().length:0,hasPrivateStore:!!store,hasPrivateTree:gm&&!!t,
      awaitingProvider:t?.provider.kind==='profession',isTest:t?.status==='test',
      bindingNote:selected?.contentRef?selected.contentRef.target_id:null,
      selectedBinding:gm&&selected?.contentRef?Boolean(managerBinding(selected.contentRef.target_id)):false};
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
    root.querySelector('#agst-feature-search')?.addEventListener('input',e=>{this.search=e.target.value;const cards=root.querySelectorAll('.agst-feature');for(const c of cards)c.hidden=!`${c.textContent}`.toLowerCase().includes(this.search.toLowerCase());},listenerOptions);
    root.querySelector('#agst-tree-import')?.addEventListener('change',e=>this._readFile(e),listenerOptions);
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
        case 'edit-node':await this._editNode();break;
        case 'new-node':await this._newNode();break;
        case 'remove-node':await this._removeNode();break;
        case 'tree-settings':await this._treeSettings();break;
        case 'link':this.linkFrom=this.nodeId;notify('Select another node to add an AND prerequisite connection.');break;
        case 'undo':await this._undo();break;
        case 'redo':await this._redo();break;
        case 'publish':await publishPublic();notify('Player projection republished.');break;
        case 'import':this.element.querySelector('#agst-tree-import')?.click();break;
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
    await confirm('<p><strong>Tree View</strong> shows a character’s accessible progression. Select a node to inspect its requirements.</p><p><strong>GM Setup</strong> contains tree import/export, publication and backups. Developer Tools are restricted to the GM.</p><p>Profession trees are read-only until the Profession Ledger adapter is verified. Cinder and generic wallets are experimental and never auto-grant Items.</p>','Skill Trees help');
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
    const t=copy(this.tree);const f=await input('Tree settings',`<div class="agst-form"><label>Name<input name="name" value="${escape(t.name)}" maxlength="120"></label>
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
  async _newNode(){
    if(!game.user.isGM||!this.editMode||!this.tree)throw Error('GM editor only');
    const t=copy(this.tree),f=await input('Add test/draft node',`<div class="agst-form"><label>Name<input name="name" value="New node" maxlength="120"></label>
      <label>Status<select name="status"><option value="draft">Draft (not spendable)</option><option value="test" ${t.status==='test'?'selected':''}>Test-only node</option></select></label>
      <p>Use the imported Feature palette to link real PERK/POWER source IDs.</p></div>`,'Add node');
    if(!f)return;
    const node={id:newKey(),name:String(f.name??'').trim(),description:'No automatic Item reward.',x:220+(t.nodes.length%4)*235,y:140+Math.floor(t.nodes.length/4)*135,
      cost:1,requiresAll:[],requiresAny:[],excludes:[],contentRef:null,sourceUuid:null,status:f.status,
      visibility:f.status==='test'&&t.status==='test'?'player':'gm',display:f.status==='test'&&t.status==='test'?'shown':'hidden'};
    t.nodes.push(node);await this._saveEdited(t);this.nodeId=node.id;notify('Node created.');
  }
  async _editNode(){
    if(!game.user.isGM||!this.editMode||!this.tree||!this.nodeId)throw Error('Choose a node while editing');
    const t=copy(this.tree),n=t.nodes.find(x=>x.id===this.nodeId);if(!n)throw Error('Missing node');
    const f=await input(`Edit node • ${n.name}`,`<div class="agst-form"><label>Name<input name="name" value="${escape(n.name)}" maxlength="120"></label>
      <label>Description<textarea name="description" rows="3">${escape(n.description)}</textarea></label>
      <label>Point cost<input type="number" name="cost" min="1" max="100" value="${n.cost}"></label>
      <label>Requires ALL (node IDs, commas)<input name="requiresAll" value="${escape(n.requiresAll.join(', '))}"></label>
      <label>Requires ANY (one OR group per semicolon)<input name="requiresAny" value="${escape(n.requiresAny.map(x=>x.join(', ')).join('; '))}"></label>
      <label>Mutually excludes (node IDs)<input name="excludes" value="${escape(n.excludes.join(', '))}"></label>
      <label>Status<select name="status">${['draft','test','approved','placeholder'].map(k=>`<option value="${k}" ${n.status===k?'selected':''}>${k}</option>`).join('')}</select></label>
      <label>Visibility<select name="visibility"><option value="gm" ${n.visibility==='gm'?'selected':''}>GM only</option><option value="player" ${n.visibility==='player'?'selected':''}>Player-visible</option><option value="reveal_gated" ${n.visibility==='reveal_gated'?'selected':''}>Reveal-gated (hidden until source released)</option></select></label>
      <label>Display<select name="display"><option value="hidden" ${n.display==='hidden'?'selected':''}>Hidden</option><option value="teaser" ${n.display==='teaser'?'selected':''}>Silhouette</option><option value="shown" ${n.display==='shown'?'selected':''}>Shown</option></select></label>
      <p>${n.contentRef?`Linked ID: <code>${escape(n.contentRef.target_id)}</code> (read-only; drop a new Feature to create a separate node).`:'No imported Feature binding.'}</p>
      <p class="agst-help">A placeholder is always GM-only; the editor enforces this even if other fields are selected.</p></div>`);
    if(!f)return;
    n.name=String(f.name??'').trim();n.description=String(f.description??'');n.cost=Number(f.cost);
    n.requiresAll=parseList(f.requiresAll);n.requiresAny=parseAny(f.requiresAny);n.excludes=parseList(f.excludes);
    n.status=f.status;n.visibility=f.status==='placeholder'?'gm':f.visibility;n.display=f.status==='placeholder'?'hidden':f.display;
    await this._saveEdited(t);notify('Node updated.');
  }
  async _removeNode(){
    if(!game.user.isGM||!this.editMode||!this.tree||!this.nodeId)throw Error('GM editor only');
    const t=copy(this.tree),n=t.nodes.find(n=>n.id===this.nodeId);
    if(!n)throw Error('Missing node');
    if(allProgressFor(t).some(a=>a.unlocks.includes(n.id)))throw Error('Purchased node cannot be deleted');
    if(!await confirm(`<p>Delete ${escape(n.name)} and its dependency connections? The permanent imported Feature is not deleted.</p>`,'Delete layout node'))return;
    t.nodes=t.nodes.filter(x=>x.id!==n.id);
    for(const x of t.nodes){x.requiresAll=x.requiresAll.filter(id=>id!==n.id);x.requiresAny=x.requiresAny.map(g=>g.filter(id=>id!==n.id)).filter(g=>g.length);x.excludes=x.excludes.filter(id=>id!==n.id);}
    await this._saveEdited(t);this.nodeId=null;notify('Node removed from layout only.');
  }
  async _linkTo(targetId){
    if(!this.tree||!this.editMode||!this.linkFrom)return;
    const t=copy(this.tree),source=t.nodes.find(x=>x.id===this.linkFrom),target=t.nodes.find(x=>x.id===targetId);
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
    const t=readPrivate().find(x=>x.id===this.tree.id),n=t?.nodes.find(x=>x.id===this.nodeId);
    if(!n)throw Error('Missing private node');
    if(n.contentRef?.target_id?.startsWith('PERK-'))throw Error('Profession PERK selection is Ledger-owned; Skill Trees cannot spend generic or Cinder points to purchase it');
    if(n.contentRef&&!safePublicSource(n))throw Error('Unverified/GM-only/unfinished Manager Feature cannot be purchased');
    purchase(t,readProgress(this.actor,t),n.id); // validate before opening confirmation
    if(!await confirm(`<p>Spend <strong>${n.cost}</strong> point(s) and unlock <strong>${escape(n.name)}</strong> for ${escape(this.actor.name)}?</p><p>This alpha records a node choice only. It does <strong>not</strong> grant or modify a Foundry Item.</p>`,'Confirm test unlock'))return;
    const check=purchase(t,readProgress(this.actor,t),n.id); // re-read after dialog
    await persistAccount(this.actor,t,check);notify('Unlock recorded; no Feature Item was awarded.');
  }
  async _request(){
    if(game.user.isGM||!this.tree||!this.actor||!this.nodeId)throw Error('Select an eligible perk');
    if(!this.actor.isOwner)throw Error('You do not own the selected character');
    const n=this.tree.nodes.find(x=>x.id===this.nodeId);
    const ok=publicAvailability(this.tree,readProgress(this.actor,this.tree),n?.id);
    if(!ok.ok)throw Error(ok.reason);
    const gms=(game.users?.contents??[]).filter(u=>u.isGM).map(u=>u.id);
    if(!gms.length)throw Error('No GM recipient found');
    await ChatMessage.create({content:`<p><strong>${escape(this.actor.name)}</strong> requests <strong>${escape(n.name)}</strong> on ${escape(this.tree.name)}.</p><p>GM: open Skill Trees, select the character and node, and confirm the unlock.</p>`,
      whisper:gms,speaker:{alias:'Ashen Gate • Skill Trees'}});
    notify('Unlock request sent privately to the GM.');
  }
  async _readFile(event){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    try{
      if(!game.user.isGM)throw Error('GM only');if(!gmPrivate())throw Error('Initialize GM storage first');
      if(file.size>2_000_000)throw Error('File too large (>2 MB)');
      const pack=JSON.parse(await file.text());
      if(pack?.schema_version==='ag-source-package/0.1' || pack?.manifest?.schema_version==='ag-source-package/0.1')
        throw Error('This is a canonical source package, not a Skill Trees layout. Import its generated ag-foundry-import/0.2 records through the General Manager; import tree layouts here only.');
      if(pack?.schema_version==='ag-foundry-import/0.2' || pack?.manifest?.schema_version==='ag-foundry-import/0.2')
        throw Error('General Manager import records cannot be loaded as a Skill Trees layout. Use the Manager to import PERK/POWER Features first.');
      const v=validatePackage(pack);
      if(v.errors.length)throw Error(v.errors.slice(0,6).join('; '));
      const current=readPrivate(),incoming=pack.trees.map(normalizeTree);
      const actions=incoming.map(t=>({id:t.id,name:t.name,update:current.some(x=>x.id===t.id)}));
      if(!await confirm(`<p>Import <strong>${incoming.length}</strong> tree layouts from ${escape(file.name)}?</p><div class="agst-preview">${actions.map(a=>`<div>${a.update?'UPDATE':'NEW'} · ${escape(a.name)}</div>`).join('')}</div><p>Purchased-node changes are blocked. Actor progress is never imported. Export backups first.</p>`,'Preview tree import'))return;
      const combined=new Map(current.map(t=>[t.id,t]));for(const t of incoming)combined.set(t.id,t);
      await saveTrees([...combined.values()]);notify('Tree layouts imported.');this.activeTab='trees';this.render();
    }catch(e){console.error(e);notify(`Import: ${e.message}`,true);}
  }
  _export(all){
    if(!game.user.isGM)throw Error('GM only');
    const trees=all?readPrivate():[this.tree].filter(Boolean);
    if(!trees.length)throw Error('No tree selected');
    download(all?'AG_Skill_Trees_v02_GM_Layouts.json':`AG_Skill_Tree_${this.tree.id}.json`,{schema:SCHEMA,exportedAt:new Date().toISOString(),status:'prototype_not_canonical',trees});
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
      const data=JSON.parse(raw);if(data.type!=='Item')throw Error('Drop a Foundry Item Feature');
      const doc=await fromUuid(data.uuid);if(doc?.documentName!=='Item'||doc.type!=='feat')throw Error('Only imported Feature Items can be linked');
      const source=sourceFlag(doc),id=source?.sourceId;
      if(lookupWorldDefinition(game,id).document!==doc)throw Error('Missing, archived or ambiguous source binding; resolve duplicates before linking');
      if(!/^(PERK|POWER)-[A-Z0-9-]+$/.test(id??''))throw Error('Feature has no Manager PERK-* / POWER-* source ID');
      if(!allowedSourceForProvider(this.tree.provider.kind,id))throw Error('Wrong Feature namespace for this tree: Profession uses PERK-*, Cinder uses POWER-*; HPERK-* belongs to Hirelings');
      if(this.tree.nodes.some(n=>n.contentRef?.target_id===id))throw Error('That source Feature is already on this tree');
      const board=this.element.querySelector('.agst-board'),rect=board.getBoundingClientRect();
      const x=Math.round(Math.max(0,Math.min(6000,(event.clientX-rect.left)/this.zoom-85))/10)*10;
      const y=Math.round(Math.max(0,Math.min(6000,(event.clientY-rect.top)/this.zoom-35))/10)*10;
      const valid=source.status==='approved'&&source.visibility==='player',placeholder=source.status!=='approved'||/placeholder/i.test(doc.name);
      const t=copy(this.tree),n={id:newKey(),name:doc.name,description:'Imported Feature binding; no automatic Item grant in this alpha.',
        x,y,cost:1,requiresAll:[],requiresAny:[],excludes:[],
        contentRef:{relation:id.startsWith('POWER-')?'unlocks_power':'unlocks_perk',target_id:id,mode:'required'},sourceUuid:doc.uuid,
        status:placeholder?'placeholder':'draft',visibility:'gm',display:'hidden'};
      t.nodes.push(n);await this._saveEdited(t);this.nodeId=n.id;this.render();
      notify(`Feature ${id} linked as ${placeholder?'a hidden placeholder':'a hidden draft; release it explicitly in node properties'}.`);
    }catch(e){console.error(e);notify(`Feature drop: ${e.message}`,true);}
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
      // Preview connected edges live while dragging. Saved IDs and positions remain untouched until pointer-up.
      const board=this.element.querySelector('.agst-board');
      for(const path of board?.querySelectorAll('path.agst-link')??[]){
        if(path.dataset.from!==id && path.dataset.to!==id)continue;
        const coords=nodeId=>{const el=board.querySelector(`.agst-node[data-id="${CSS.escape(nodeId)}"]`);
          return el?{x:parseFloat(el.style.left)+90,y:parseFloat(el.style.top)+33}:null;};
        const src=coords(path.dataset.from),dst=coords(path.dataset.to);if(!src||!dst)continue;
        const half=(dst.x-src.x)*.5,vert=(dst.y-src.y)*.12;
        path.setAttribute('d',`M ${src.x} ${src.y} C ${src.x+half} ${src.y+vert}, ${dst.x-half} ${dst.y-vert}, ${dst.x} ${dst.y}`);
      }
    };
    const stop=async e=>{
      window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);
      if(!moved)return;
      const t=copy(this.tree),n=t.nodes.find(v=>v.id===id);
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
    publish:async()=>{if(!game.user.isGM)throw Error('GM only');return publishPublic();}
  };
  if(ui.actors?.rendered) addDirectoryLauncher(ui.actors,ui.actors.element);
  Hooks.on('updateActor',actor=>{if(instance?.rendered && instance.actorId===actor.id)instance.render();});
  if(game.user.isGM){
    for(const eventName of ['createItem','updateItem','deleteItem'])Hooks.on(eventName,async()=>{
      if(!gmPrivate())return;
      try{await publishPublic();}catch(e){console.error(`[${MODULE}] Auto-publish error`,e);}
    });
  }
});
