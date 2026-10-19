/** Ashen Gate shared visual tree — isolated data/eligibility rules, no Foundry globals. */
import {applyAppearance,appearanceWarnings} from './appearance.mjs';
export const SCHEMA = 'ag-skill-trees/0.3';
/** 0.2 files (free-text nodes, contentRef links) are still read; 0.3 nodes name a perk by perkId. */
export const READABLE_SCHEMAS = ['ag-skill-trees/0.2', SCHEMA];
export const PROVIDERS = ['profession', 'cinder_milestone', 'generic_points'];
export const TYPES = ['approved', 'test', 'draft', 'placeholder'];
export const VISIBILITY = ['player', 'gm', 'reveal_gated'];
/** Source namespaces are domain-owned (DEC-0062/0063): HPERK is Hirelings only. */
export function allowedSourceForProvider(kind,sourceId) {
  const prefix=String(sourceId??'').split('-')[0];
  if(kind==='profession')return prefix==='PERK';
  if(kind==='cinder_milestone')return prefix==='POWER';
  return kind==='generic_points' && ['PERK','POWER'].includes(prefix);
}
export const asArray = v => Array.isArray(v) ? v : [];
export const clone = v => structuredClone(v);
const KEY = /^[A-Za-z][A-Za-z0-9_-]{2,100}$/;
const REF = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
const idList = arr => asArray(arr).filter(s => typeof s === 'string');
const plainObject = v => Boolean(v) && typeof v==='object' && !Array.isArray(v);
export const HISTORY_LIMIT = 50;
export const SNAPSHOT_LIMIT = 10;
/** Nodes the GM accepted at a level (override grant, or keep after a level drop): {level, at, by, reason}. */
const cleanKept = raw => Object.fromEntries(Object.entries(plainObject(raw)?raw:{})
  .filter(([id,k])=>KEY.test(id)&&plainObject(k)&&Number.isSafeInteger(k.level)&&k.level>=0)
  .map(([id,k])=>[id,{level:k.level,at:Number(k.at)||0,by:String(k.by??''),reason:String(k.reason??'').slice(0,200)}]));
/** Last 50 changes; only the last 10 removals keep the removed Item's data (for undo). */
export function trimHistory(list) {
  const out=asArray(list).filter(plainObject).slice(-HISTORY_LIMIT).map(h=>({...h}));
  let snaps=0;
  for(let i=out.length-1;i>=0;i--)if(out[i].itemSnapshot!=null){if(++snaps>SNAPSHOT_LIMIT)delete out[i].itemSnapshot;}
  return out;
}
export const cleanAccount = raw => {
  const r=raw && typeof raw==='object' ? raw : {};
  return {
    awarded: Number.isSafeInteger(r.awarded) && r.awarded>=0 ? r.awarded : 0,
    unlocks: [...new Set(idList(r.unlocks))],
    grants: asArray(r.grants).filter(x=>x && typeof x==='object' && typeof x.key==='string').map(x=>({key:x.key,amount:Math.max(0,Number(x.amount)||0)})),
    revision: Number.isSafeInteger(r.revision)&&r.revision>=0?r.revision:0,
    // 0.11.0, additive: GM-accepted nodes and the change history (both empty on older data).
    kept: cleanKept(r.kept),
    history: trimHistory(r.history)
  };
};
/** Add one history entry to an account (returns a new account). */
export function withHistory(rawAccount,entry) {
  const a=cleanAccount(rawAccount);
  a.history=trimHistory([...a.history,{...entry}]);
  return a;
}

// ---- Profession trees (0.11.0): points come from the Profession Ledger level; this module owns the allocations. ----
export const PROFESSION_MAX_LEVEL = 16;
export const PROFESSION_TREE_NODES = 24;
export const PROFESSION_TIER_LEVELS = Object.freeze({apprentice:1,journeyman:4,expert:7,artisan:10,master:13});
/** One perk point per profession level, level 1 included (level 16 = 16 points). */
export const pointsForLevel = level => Number.isSafeInteger(level)&&level>=1 ? Math.min(level,PROFESSION_MAX_LEVEL) : 0;
export const tierLevel = tier => PROFESSION_TIER_LEVELS[String(tier??'').trim().toLowerCase()] ?? null;
/** Level a profession node needs: its perk's tier, raised (never lowered) by the node's own minLevel. */
export function nodeThreshold(n) {
  const tier=tierLevel(n?.perkTier)??1;
  return Number.isSafeInteger(n?.minLevel)&&n.minLevel>tier?n.minLevel:tier;
}
/** Level a node needs as shown: the published requiredLevel (player view has no perk tier), else worked out. */
const needLevel = n => Number.isSafeInteger(n?.requiredLevel) ? n.requiredLevel : nodeThreshold(n);
/** Every profession node costs 1 point; other trees use the node/perk cost. */
export const nodeCost = (tree,n) => tree?.provider?.kind==='profession' ? 1 : (n?.cost ?? 1);
const keptAt = (a,id,level) => Boolean(a.kept[id]) && Number.isSafeInteger(level) && a.kept[id].level<=level;
/**
 * Where a character stands on a profession tree. level: the Ledger level (0 = does not have the profession; null = Ledger not available).
 * Over-allocated: an allocated node needs a higher level, or more points are used than the level gives, and the GM has not kept it.
 */
export function professionStatus(tree,rawAccount,level) {
  const a=cleanAccount(rawAccount),ledger=Number.isSafeInteger(level)&&level>=0;
  const earned=ledger?pointsForLevel(level):0,spent=totalSpent(tree,a);
  const taken=tree.nodes.filter(n=>a.unlocks.includes(n.id));
  const aboveLevel=ledger?taken.filter(n=>needLevel(n)>level&&!keptAt(a,n.id,level)).map(n=>({nodeId:n.id,name:n.name||n.perkId||n.id,threshold:needLevel(n)})):[];
  const keptCount=taken.filter(n=>keptAt(a,n.id,level)).length;
  const overSpent=ledger?Math.max(0,spent-earned-keptCount):0;
  return {ledger,level:ledger?level:null,earned,spent,available:earned-spent,maxPoints:PROFESSION_MAX_LEVEL,nodeCount:tree.nodes.length,
    aboveLevel,overSpent,overAllocated:aboveLevel.length>0||overSpent>0};
}
export function walletKey(tree) {
  return tree.provider.kind==='cinder_milestone' ? `cinder:${tree.sourceRef}` : `tree:${tree.id}`;
}
/** Permanent perk id of a node: 0.3 perkId, or a 0.2 contentRef link (kept as is, never rewritten). */
export function nodePerkId(n) {
  if(typeof n?.perkId==='string'&&n.perkId)return n.perkId;
  const ref=n?.contentRef?.target_id;
  return typeof ref==='string'&&/^(PERK|POWER)-/.test(ref)?ref:null;
}
export function normalizeTree(raw) {
  const tree=clone(raw);
  tree.description=tree.description??'';
  tree.status=tree.status??'draft';
  tree.visibility=tree.visibility??'gm';
  tree.provider=tree.provider??{kind:'generic_points',maxPoints:10};
  tree.nodes=asArray(tree.nodes).map(n=>{
    const perkId=nodePerkId(n);
    return {
      ...n,name:n.name??'',description:n.description??'',requiresAll:asArray(n.requiresAll),
      requiresAny:asArray(n.requiresAny).map(g=>asArray(g)), excludes:asArray(n.excludes),
      // A perk node takes its cost from the perk; a stored cost is only the fallback.
      cost:n.cost??(perkId?null:1), status:n.status??'draft', visibility:n.visibility??'gm', display:n.display??'hidden',
      perkId, perkUuid:n.perkUuid??n.sourceUuid??null,
      contentRef:n.contentRef??null, sourceUuid:n.sourceUuid??null
    };
  });
  // Look fields (nodeSize, background, tiers) are optional; only safe values survive.
  return applyAppearance(tree);
}
/** Point cost stored on the perk's source definition (point_cost), or null when the perk names none. */
export function perkCost(definition) {
  const c=definition?.point_cost??definition?.cost;
  return Number.isSafeInteger(c)&&c>=1&&c<=100?c:null;
}
/**
 * Fill each node's name, description, image and cost from its assigned perk.
 * lookup(perkId,node) returns {name,description,img,cost,uuid} or null when the perk is not in this world.
 * Nodes without a perk are older custom nodes and keep their stored text.
 */
export function resolveTree(tree,lookup) {
  const t=normalizeTree(tree);
  t.nodes=t.nodes.map(n=>{
    if(!n.perkId)return {...n,custom:true,perkMissing:false,img:null,cost:n.cost??1};
    const perk=lookup?.(n.perkId,n)??null;
    return {...n,custom:false,perkMissing:!perk,
      name:perk?.name??(n.name||n.perkId),description:perk?.description??n.description??'',
      img:perk?.img??null,cost:perk?.cost??n.cost??1,perkUuid:perk?.uuid??n.perkUuid,perkTier:perk?.tier??null};
  });
  // Worked out fresh from the perk every time; a stored requiredLevel is never trusted.
  if(t.provider.kind==='profession')t.nodes=t.nodes.map(n=>({...n,cost:1,requiredLevel:nodeThreshold(n)}));
  return t;
}
export function validateTree(input) {
  const errors=[], warnings=[];
  if(!input||typeof input!=='object'||Array.isArray(input))return {errors:['Invalid tree object'],warnings:[]};
  const t=normalizeTree(input),nodes=t.nodes;
  if(!KEY.test(t.id??''))errors.push('Invalid tree layout ID');
  if(typeof t.name!=='string'||!t.name.trim()||t.name.length>120)errors.push('Invalid tree name');
  if(!PROVIDERS.includes(t.provider?.kind))errors.push('Unknown progression provider');
  if(!['draft','test','approved'].includes(t.status))errors.push('Invalid tree status');
  if(!VISIBILITY.includes(t.visibility))errors.push('Invalid tree visibility');
  if(t.provider.kind==='cinder_milestone' && !/^MUT-[A-Z0-9-]+$/.test(t.sourceRef??''))errors.push('Cinder trees need a MUT-* identity');
  if(t.provider.kind==='profession' && !/^PROF-[A-Z0-9-]+$/.test(t.sourceRef??''))errors.push('Profession trees need a PROF-* identity');
  if(t.provider.kind==='cinder_milestone' && t.provider.maxPoints!==13)errors.push('Cinder prototype wallet limit must be 13');
  if(t.provider.kind==='generic_points' && (t.provider.maxPoints!=null && (!Number.isSafeInteger(t.provider.maxPoints)||t.provider.maxPoints<1||t.provider.maxPoints>999)))errors.push('Invalid generic maximum points');
  if(nodes.length>300)errors.push('Maximum 300 nodes per layout');
  const by=new Map();
  for(const n of nodes) {
    if(!KEY.test(n.id??''))errors.push(`Invalid node ID ${n.id}`);
    if(by.has(n.id))errors.push(`Duplicate node ID ${n.id}`);
    by.set(n.id,n);
    if(n.perkId){
      if(!REF.test(n.perkId)||!['PERK','POWER'].includes(n.perkId.split('-')[0]))errors.push(`${n.id}: perk must be a PERK-* or POWER-* id`);
      else if(!allowedSourceForProvider(t.provider.kind,n.perkId))errors.push(`${n.id}: ${t.provider.kind} tree cannot use ${n.perkId} (PERK=Profession, POWER=Cinder; HPERK=Hirelings)`);
      if(typeof n.name!=='string'||n.name.length>120)errors.push(`${n.id}: invalid name`);
    }else if(typeof n.name!=='string'||!n.name.trim()||n.name.length>120)errors.push(`${n.id}: invalid name`);
    if(!Number.isFinite(n.x)||!Number.isFinite(n.y)||n.x<0||n.x>6000||n.y<0||n.y>6000)errors.push(`${n.id}: invalid position`);
    if(n.cost!=null&&(!Number.isSafeInteger(n.cost)||n.cost<1||n.cost>100))errors.push(`${n.id}: invalid point cost`);
    if(!TYPES.includes(n.status))errors.push(`${n.id}: invalid status`);
    if(!VISIBILITY.includes(n.visibility)||!['shown','teaser','hidden'].includes(n.display))errors.push(`${n.id}: invalid visibility`);
    if(!Array.isArray(n.requiresAll)||!Array.isArray(n.requiresAny)||!Array.isArray(n.excludes))errors.push(`${n.id}: invalid prerequisite lists`);
    if(n.requiresAny.some(g=>!Array.isArray(g)||!g.length))errors.push(`${n.id}: empty OR requirement group`);
    if(n.contentRef!=null) {
      const ref=n.contentRef;
      if(!ref||typeof ref!=='object'||!['PERK','POWER'].includes(String(ref.target_id??'').split('-')[0])||!REF.test(ref.target_id??'')||!['required','optional'].includes(ref.mode)||!ref.relation)errors.push(`${n.id}: invalid PERK-*/POWER-* content reference`);
      else if(!allowedSourceForProvider(t.provider.kind,ref.target_id))errors.push(`${n.id}: ${t.provider.kind} tree cannot link ${ref.target_id} (PERK=Profession, POWER=Cinder; HPERK=Hirelings)`);
      else if(ref.target_id.startsWith('POWER-') && ref.relation==='unlocks_perk')warnings.push(`${n.id}: POWER link uses old unlocks_perk relation; new links use unlocks_power`);
    }
    if(n.status==='placeholder' && (n.display!=='hidden'||n.visibility!=='gm'))errors.push(`${n.id}: placeholder must be GM-only and hidden`);
    if(n.minLevel!=null && (!Number.isSafeInteger(n.minLevel)||n.minLevel<1||n.minLevel>99))errors.push(`${n.id}: invalid level gate`);
  }
  warnings.push(...appearanceWarnings(input));
  const adjacency=new Map(nodes.map(n=>[n.id,[]]));
  for(const n of nodes){
    const dep=[...idList(n.requiresAll),...n.requiresAny.flatMap(g=>idList(g))];
    if(dep.length!==new Set(dep).size)warnings.push(`${n.id}: duplicate prerequisite reference`);
    for(const parent of dep){
      if(parent===n.id)errors.push(`${n.id}: self dependency`);
      else if(!by.has(parent))errors.push(`${n.id}: missing prerequisite ${parent}`);
      else adjacency.get(parent).push(n.id);
    }
    for(const ex of idList(n.excludes)){
      if(ex===n.id || !by.has(ex))errors.push(`${n.id}: invalid exclusion ${ex}`);
      if(dep.includes(ex))errors.push(`${n.id}: excludes required prerequisite ${ex}`);
    }
    if(n.status==='approved' && n.contentRef && n.contentRef.mode==='required' && n.visibility==='player' && n.display==='shown' && !n.sourceUuid)warnings.push(`${n.id}: permanent ID will require a world Item binding`);
  }
  if(t.provider.kind==='profession'&&nodes.length!==PROFESSION_TREE_NODES)warnings.push(`Profession trees have ${PROFESSION_TREE_NODES} nodes (16 can be chosen); this one has ${nodes.length}`);
  const perkUse=new Map();
  for(const n of nodes)if(n.perkId){if(perkUse.has(n.perkId))warnings.push(`${n.id}: ${n.perkId} is also on ${perkUse.get(n.perkId)}`);else perkUse.set(n.perkId,n.id);}
  const state=new Map(),path=[];
  const dfs=id=>{
    if(state.get(id)===1){errors.push(`Dependency cycle: ${[...path,id].join(' → ')}`);return;}
    if(state.get(id)===2)return;
    state.set(id,1);path.push(id);
    for(const child of adjacency.get(id)??[])dfs(child);
    path.pop();state.set(id,2);
  };
  for(const n of nodes)dfs(n.id);
  for(const n of nodes){
    const deps=[...idList(n.requiresAll),...n.requiresAny.flatMap(g=>idList(g))];
    for(const d of deps){const p=by.get(d);if(p?.excludes.includes(n.id)||n.excludes.includes(d))errors.push(`${n.id}: prerequisite conflicts with an exclusion on ${d}`);}
  }
  return {errors:[...new Set(errors)],warnings:[...new Set(warnings)]};
}
/** What a layout import would do, without writing. mode 'skip' keeps existing trees; 'update' replaces their layout. */
export function planTreeImport(pack,existing=[],{mode='skip'}={}) {
  if(!['skip','update'].includes(mode))return {errors:['mode must be skip or update.'],rows:[],apply:[]};
  const check=validatePackage(pack);
  if(check.errors.length)return {errors:check.errors,rows:[],apply:[]};
  const known=new Set(existing.map(t=>t.id));
  const rows=pack.trees.map(raw=>{
    const tree=normalizeTree(raw),exists=known.has(tree.id);
    const action=!exists?'new':mode==='update'?'update':'skip';
    return {id:tree.id,name:tree.name,action,tree,
      reason:action==='new'?'':action==='update'?'Replaces the layout; purchased nodes are protected.':'Already in this world; kept as is.'};
  });
  return {errors:[],rows,apply:rows.filter(r=>r.action!=='skip').map(r=>r.tree)};
}
export function validatePackage(obj) {
  const errors=[],warnings=[];
  if(!READABLE_SCHEMAS.includes(obj?.schema)||!Array.isArray(obj.trees))return {errors:[`Expected {schema:'${SCHEMA}',trees:[...]} (${READABLE_SCHEMAS.join(' or ')})`],warnings:[]};
  if(obj.trees.length>120)errors.push('Too many trees (max 120)');
  const ids=new Set(), cinders=new Set();
  for(const tree of obj.trees){
    if(!tree||typeof tree!=='object'||Array.isArray(tree)){errors.push('Invalid tree in package');continue;}
    const v=validateTree(tree);
    for(const e of v.errors)errors.push(`${tree?.id??'?'}: ${e}`);
    for(const w of v.warnings)warnings.push(`${tree?.id??'?'}: ${w}`);
    if(ids.has(tree.id))errors.push(`Duplicate tree ID ${tree.id}`);ids.add(tree.id);
    if(tree.provider?.kind==='cinder_milestone'){
      if(cinders.has(tree.sourceRef))errors.push(`Duplicate Cinder wallet source ${tree.sourceRef}`);
      cinders.add(tree.sourceRef);
    }
  }
  return {errors,warnings};
}
export function totalSpent(tree,acc){
  const a=cleanAccount(acc);
  return a.unlocks.reduce((s,id)=>{const n=tree.nodes.find(n=>n.id===id);return s+(n?nodeCost(tree,n):0);},0);
}
/** Profession-only checks shared by the GM and player views. null when nothing blocks. */
function professionBlock(tree,a,n,level) {
  if(tree.provider.kind!=='profession')return null;
  if(level===null||level===undefined)return 'Profession Ledger is not active: profession points are unavailable';
  if(level<1)return 'This character does not have this profession';
  const st=professionStatus(tree,a,level);
  if(st.overAllocated)return 'Waiting on GM review: this character has perks above their profession level';
  const need=needLevel(n);
  if(need>level)return `Needs profession level ${need} (now ${level})`;
  if(st.available<1)return `No perk points left (${st.spent} of ${st.earned} used at level ${level})`;
  return null;
}
export function availability(tree,rawAccount,nodeId,{canModify=true,level=null}={}) {
  const a=cleanAccount(rawAccount),n=tree.nodes.find(x=>x.id===nodeId);
  if(!n)return {ok:false,reason:'Unknown node'};
  if(!canModify)return {ok:false,reason:'You cannot change this character'};
  if(a.unlocks.includes(n.id))return {ok:false,reason:'Already unlocked'};
  if(n.perkMissing)return {ok:false,reason:`Perk ${n.perkId} is not in this world. Import it through General Manager first`};
  if(n.status==='placeholder'||n.status==='draft')return {ok:false,reason:'Unfinished content — cannot unlock'};
  if(tree.status==='draft')return {ok:false,reason:'Tree is in draft mode'};
  if(n.visibility!=='player'||n.display!=='shown')return {ok:false,reason:'Not released to players'};
  const taken=tree.nodes.filter(x=>a.unlocks.includes(x.id));
  const excluded=taken.find(x=>n.excludes.includes(x.id)||x.excludes.includes(n.id));
  if(excluded)return {ok:false,reason:`Mutually exclusive with ${excluded.name}`};
  if(n.requiresAll.some(id=>!a.unlocks.includes(id)))return {ok:false,reason:'Required prerequisite not unlocked'};
  if(n.requiresAny.some(group=>!group.some(id=>a.unlocks.includes(id))))return {ok:false,reason:'One required alternative is not unlocked'};
  const blocked=professionBlock(tree,a,n,level);
  if(blocked)return {ok:false,reason:blocked};
  const cost=nodeCost(tree,n);
  if(tree.provider.kind!=='profession'){const points=a.awarded-totalSpent(tree,a);if(points<cost)return {ok:false,reason:`Need ${cost-points} more point(s)`};}
  return {ok:true,reason:'Available',cost};
}
export function grantPoints(tree,rawAccount,amount,grantKey) {
  if(tree.provider.kind==='profession')throw Error('Profession points are owned by the Ledger');
  if(!Number.isSafeInteger(amount)||amount<1||amount>100)throw Error('Points must be an integer between 1 and 100');
  if(tree.provider.kind==='cinder_milestone' && amount!==1)throw Error('Each Cinder milestone must award exactly 1 point');
  if(typeof grantKey!=='string'||!grantKey.trim()||grantKey.length>100)throw Error('Name this point award uniquely');
  const a=cleanAccount(rawAccount),key=grantKey.trim().toLowerCase();
  if(a.grants.some(g=>g.key.toLowerCase()===key))throw Error('This award label was already used for this character and tree');
  const cap=tree.provider.kind==='cinder_milestone'?13:tree.provider.maxPoints??null;
  if(cap!=null && a.awarded+amount>cap)throw Error(`Award would exceed the ${cap}-point limit`);
  a.awarded+=amount;a.grants.push({key:grantKey.trim(),amount});a.revision++;
  return a;
}
export function purchase(tree,rawAccount,nodeId,{level=null}={}) {
  const a=cleanAccount(rawAccount),ok=availability(tree,a,nodeId,{level});
  if(!ok.ok)throw Error(ok.reason);
  a.unlocks.push(nodeId);a.revision++;
  return a;
}
/**
 * GM override: allocate a node whatever its points, level or prerequisites, with a reason. The node is kept at the current level,
 * so it does not flag the character for review. Returns the account and the rules that were overridden (for the confirmation).
 */
export function overrideGrant(tree,rawAccount,nodeId,{level=null,reason='',by='',at=0}={}) {
  const a=cleanAccount(rawAccount),n=tree.nodes.find(x=>x.id===nodeId);
  if(!n)throw Error('Unknown node');
  if(a.unlocks.includes(n.id))throw Error('Already unlocked');
  if(n.perkMissing)throw Error(`Perk ${n.perkId} is not in this world. Import it through General Manager first`);
  if(!String(reason??'').trim())throw Error('Give a reason for the override');
  const check=availability(tree,a,nodeId,{level});
  a.unlocks.push(n.id);a.revision++;
  if(tree.provider.kind==='profession')a.kept[n.id]={level:Number.isSafeInteger(level)?level:0,at,by,reason:String(reason).trim().slice(0,200)};
  return {account:a,overridden:check.ok?[]:[check.reason]};
}
/** Unlocked nodes that still count on nodeId: requiresAll, or an OR group with no other unlocked choice. */
export function dependentsBlockingRefund(tree,rawAccount,nodeId) {
  const a=cleanAccount(rawAccount),have=new Set(a.unlocks);have.delete(nodeId);
  return tree.nodes.filter(x=>have.has(x.id)&&(asArray(x.requiresAll).includes(nodeId)||
    asArray(x.requiresAny).some(g=>g.includes(nodeId)&&!g.some(id=>id!==nodeId&&have.has(id)))));
}
/** Give the points back and drop the unlock. Points awarded and award labels are kept. */
export function refund(tree,rawAccount,nodeId) {
  const a=cleanAccount(rawAccount);
  if(!a.unlocks.includes(nodeId))throw Error('That node is not unlocked');
  const blockers=dependentsBlockingRefund(tree,a,nodeId);
  if(blockers.length)throw Error(`Refund ${blockers.map(n=>n.name||n.id).join(', ')} first; it depends on this node`);
  a.unlocks=a.unlocks.filter(id=>id!==nodeId);delete a.kept[nodeId];a.revision++;
  return a;
}
/** Refund every unlock on the tree (points stay awarded). */
export function resetUnlocks(rawAccount) {
  const a=cleanAccount(rawAccount);a.unlocks=[];a.kept={};a.revision++;return a;
}
/** The tag written on a perk Item given by a tree unlock; it makes the grant traceable and idempotent. */
export const grantTag=(tree,node)=>({perkId:node.perkId,treeId:tree.id,nodeId:node.id,wallet:walletKey(tree)});
export const isGrantFor=(tag,tree,nodeId)=>Boolean(tag)&&tag.treeId===tree.id&&(nodeId==null||tag.nodeId===nodeId);
/** Unlocked perk nodes with no granted Item on the character (e.g. unlocked before 0.8.0). */
export function missingGrants(tree,rawAccount,itemTags) {
  const a=cleanAccount(rawAccount),tags=asArray(itemTags);
  return tree.nodes.filter(n=>n.perkId&&a.unlocks.includes(n.id)&&!tags.some(t=>isGrantFor(t,tree,n.id)));
}
/** GM report of saved data that needs attention: custom nodes (no perk) and perks missing from the world. */
export function savedDataReport(trees,perkExists) {
  const rows=[];
  for(const raw of asArray(trees)){const t=normalizeTree(raw);
    for(const n of t.nodes){
      if(!n.perkId)rows.push({treeId:t.id,treeName:t.name,nodeId:n.id,nodeName:n.name,issue:'custom',
        text:'Custom node with no perk. It still works (unlocks record points only); assign a perk to give an Item.'});
      else if(!perkExists(n.perkId))rows.push({treeId:t.id,treeName:t.name,nodeId:n.id,nodeName:n.name||n.perkId,issue:'missing_perk',
        text:`${n.perkId} is not in this world. Import it through General Manager; until then the node cannot be unlocked.`});
    }
  }
  return rows;
}
/** Safe-for-all-clients public projection. No GM-only names, text, references or prereq references. */
export function publicTree(tree) {
  const t=normalizeTree(tree);
  if(t.visibility!=='player'||t.status==='draft')return null;
  const allowed=n=>n.status!=='placeholder'&&n.status!=='draft'&&n.visibility==='player'&&n.display!=='hidden';
  const visible=t.nodes.filter(allowed);
  const visibleIds=new Set(visible.map(n=>n.id));
  return {
    id:t.id,name:t.name,description:t.description,sourceRef:t.sourceRef??null,
    provider:{kind:t.provider.kind,maxPoints:t.provider.kind==='profession'?null:t.provider.maxPoints??null},
    status:t.status,visibility:'player',
    ...(t.nodeSize?{nodeSize:t.nodeSize}:{}),...(t.background?{background:t.background}:{}),...(t.tiers?{tiers:t.tiers}:{}),
    nodes:visible.map(n=> {
      if(n.display==='teaser')return {id:n.id,name:'Undiscovered',description:'',img:null,x:n.x,y:n.y,cost:n.cost??1,
        silhouette:true,requiresAll:[],requiresAny:[],excludes:[],unrevealedPrerequisite:true};
      const missing=n.requiresAll.some(id=>!visibleIds.has(id))||n.requiresAny.some(g=>g.some(id=>!visibleIds.has(id)));
      return {id:n.id,name:n.name,description:n.description,img:typeof n.img==='string'?n.img:null,x:n.x,y:n.y,cost:n.cost??1,
        silhouette:false,requiresAll:n.requiresAll.filter(id=>visibleIds.has(id)),
        requiresAny:n.requiresAny.map(g=>g.filter(id=>visibleIds.has(id))).filter(g=>g.length),
        excludes:n.excludes.filter(id=>visibleIds.has(id)),
        unrevealedPrerequisite:missing,status:n.status,
        ...(t.provider.kind==='profession'?{requiredLevel:needLevel(n),cost:1}:{})};
    })
  };
}
/** Only use projected node state for the player's UI, but authoritative GM graph for GM unlock. */
export function publicAvailability(tree,acc,nodeId,{level=null}={}) {
  const n=tree.nodes.find(n=>n.id===nodeId);
  if(!n)return {ok:false,reason:'Unknown node'};
  if(n.silhouette)return {ok:false,reason:'Not yet revealed'};
  if(n.unrevealedPrerequisite)return {ok:false,reason:'Unrevealed prerequisite'};
  const a=cleanAccount(acc);
  if(a.unlocks.includes(nodeId))return {ok:false,reason:'Already unlocked'};
  if(n.excludes.some(id=>a.unlocks.includes(id)) || tree.nodes.some(x=>a.unlocks.includes(x.id)&&asArray(x.excludes).includes(nodeId)))return {ok:false,reason:'Excluded by a chosen perk'};
  if(n.requiresAll.some(id=>!a.unlocks.includes(id)))return {ok:false,reason:'Prerequisite required'};
  if(n.requiresAny.some(g=>!g.some(id=>a.unlocks.includes(id))))return {ok:false,reason:'An alternative prerequisite is required'};
  const blocked=professionBlock(tree,a,n,level);
  if(blocked)return {ok:false,reason:blocked};
  if(tree.provider.kind!=='profession'){
    const spent=tree.nodes.filter(x=>a.unlocks.includes(x.id)).reduce((s,x)=>s+(x.cost??1),0),cost=n.cost??1;
    if(a.awarded-spent<cost)return {ok:false,reason:`Need ${cost-(a.awarded-spent)} more point(s)`};
  }
  return {ok:true,reason:'Available'};
}
export function changedPurchasedNodes(oldTree,newTree,accounts) {
  const prior=new Map(oldTree.nodes.map(n=>[n.id,n]));const incoming=new Map(newTree.nodes.map(n=>[n.id,n]));const warnings=[];
  for(const a of accounts){for(const id of cleanAccount(a).unlocks){
    const old=prior.get(id),now=incoming.get(id);
    if(!old||!now){warnings.push(`Purchased node ${id} missing`);continue;}
    const relevant=n=>JSON.stringify([n.cost,nodePerkId(n),n.requiresAll,n.requiresAny,n.excludes]);
    if(relevant(old)!==relevant(now))warnings.push(`Purchased node ${id} changes cost, binding, or dependencies`);
  }}
  if(oldTree.provider.kind!==newTree.provider.kind||walletKey(oldTree)!==walletKey(newTree)){
    if(accounts.some(a=>cleanAccount(a).awarded>0||cleanAccount(a).unlocks.length))warnings.push('Cannot change provider or wallet identity with existing progression');
  }
  return [...new Set(warnings)];
}

/**
 * Read-only check of one character on one profession tree. itemTags: Skill Trees grant tags of every Item on the sheet.
 * Codes: LEDGER_UNAVAILABLE, OVER_SPENT, ABOVE_THRESHOLD, PREREQ_BROKEN, MISSING_ITEM, ORPHAN_ITEM, DUPLICATE_ITEM, PERK_NOT_IN_WORLD.
 */
export function reconcile(tree,rawAccount,{level=null,itemTags=[]}={}) {
  const a=cleanAccount(rawAccount),st=professionStatus(tree,a,level),issues=[];
  const by=new Map(tree.nodes.map(n=>[n.id,n])),tags=asArray(itemTags).filter(Boolean),name=id=>by.get(id)?.name||id;
  if(!st.ledger)issues.push({code:'LEDGER_UNAVAILABLE',nodeId:null,detail:'Profession Ledger is not active, so the level and points cannot be checked.'});
  if(st.overSpent>0)issues.push({code:'OVER_SPENT',nodeId:null,detail:`${st.spent} points used; level ${st.level} gives ${st.earned}.`});
  for(const x of st.aboveLevel)issues.push({code:'ABOVE_THRESHOLD',nodeId:x.nodeId,detail:`${x.name} needs level ${x.threshold}; the character is level ${st.level}.`});
  for(const id of a.unlocks){
    const n=by.get(id);if(!n)continue;
    const broken=n.requiresAll.some(p=>!a.unlocks.includes(p))||n.requiresAny.some(g=>!g.some(p=>a.unlocks.includes(p)));
    if(broken&&!a.kept[id])issues.push({code:'PREREQ_BROKEN',nodeId:id,detail:`${name(id)} is allocated without its prerequisites.`});
    if(n.perkMissing)issues.push({code:'PERK_NOT_IN_WORLD',nodeId:id,detail:`${n.perkId} is not in this world.`});
    const mine=tags.filter(t=>isGrantFor(t,tree,id));
    if(n.perkId&&!n.perkMissing&&!mine.length)issues.push({code:'MISSING_ITEM',nodeId:id,detail:`${name(id)} is allocated but its perk Item is not on the sheet.`});
    if(mine.length>1)issues.push({code:'DUPLICATE_ITEM',nodeId:id,detail:`${name(id)} is on the sheet ${mine.length} times.`});
    if(n.perkId&&tags.some(t=>t.treeId!==tree.id&&t.perkId===n.perkId))issues.push({code:'DUPLICATE_ITEM',nodeId:id,detail:`${n.perkId} was also given by another tree.`});
  }
  for(const t of tags)if(t.treeId===tree.id&&!a.unlocks.includes(t.nodeId))issues.push({code:'ORPHAN_ITEM',nodeId:t.nodeId,detail:`A perk Item from ${name(t.nodeId)} is on the sheet, but the node is not allocated.`});
  return {...st,issues};
}
