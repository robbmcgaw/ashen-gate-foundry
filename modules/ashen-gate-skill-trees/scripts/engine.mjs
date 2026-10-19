/** Ashen Gate shared visual tree — isolated data/eligibility rules, no Foundry globals. */
export const SCHEMA = 'ag-skill-trees/0.2';
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
export const cleanAccount = raw => {
  const r=raw && typeof raw==='object' ? raw : {};
  return {
    awarded: Number.isSafeInteger(r.awarded) && r.awarded>=0 ? r.awarded : 0,
    unlocks: [...new Set(idList(r.unlocks))],
    grants: asArray(r.grants).filter(x=>x && typeof x==='object' && typeof x.key==='string').map(x=>({key:x.key,amount:Math.max(0,Number(x.amount)||0)})),
    revision: Number.isSafeInteger(r.revision)&&r.revision>=0?r.revision:0
  };
};
export function walletKey(tree) {
  return tree.provider.kind==='cinder_milestone' ? `cinder:${tree.sourceRef}` : `tree:${tree.id}`;
}
export function normalizeTree(raw) {
  const tree=clone(raw);
  tree.description=tree.description??'';
  tree.status=tree.status??'draft';
  tree.visibility=tree.visibility??'gm';
  tree.provider=tree.provider??{kind:'generic_points',maxPoints:10};
  tree.nodes=asArray(tree.nodes).map(n=>({
    ...n,description:n.description??'',requiresAll:asArray(n.requiresAll),
    requiresAny:asArray(n.requiresAny).map(g=>asArray(g)), excludes:asArray(n.excludes),
    cost:n.cost??1, status:n.status??'draft', visibility:n.visibility??'gm', display:n.display??'hidden',
    contentRef:n.contentRef??null, sourceUuid:n.sourceUuid??null
  }));
  return tree;
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
    if(typeof n.name!=='string'||!n.name.trim()||n.name.length>120)errors.push(`${n.id}: invalid name`);
    if(!Number.isFinite(n.x)||!Number.isFinite(n.y)||n.x<0||n.x>6000||n.y<0||n.y>6000)errors.push(`${n.id}: invalid position`);
    if(!Number.isSafeInteger(n.cost)||n.cost<1||n.cost>100)errors.push(`${n.id}: invalid point cost`);
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
  if(obj?.schema!==SCHEMA||!Array.isArray(obj.trees))return {errors:[`Expected {schema:'${SCHEMA}',trees:[...]}`],warnings:[]};
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
  return a.unlocks.reduce((s,id)=>{const n=tree.nodes.find(n=>n.id===id);return s+(n?.cost??0);},0);
}
export function availability(tree,rawAccount,nodeId,{canModify=true}={}) {
  const a=cleanAccount(rawAccount),n=tree.nodes.find(x=>x.id===nodeId);
  if(!n)return {ok:false,reason:'Unknown node'};
  if(tree.provider.kind==='profession'||n.contentRef?.target_id?.startsWith('PERK-'))return {ok:false,reason:'Profession PERK selections require the Ledger authority; this point wallet cannot purchase them'};
  if(!canModify)return {ok:false,reason:'You cannot change this character'};
  if(a.unlocks.includes(n.id))return {ok:false,reason:'Already unlocked'};
  if(n.status==='placeholder'||n.status==='draft')return {ok:false,reason:'Unfinished content — cannot unlock'};
  if(tree.status==='draft')return {ok:false,reason:'Tree is in draft mode'};
  if(n.visibility!=='player'||n.display!=='shown')return {ok:false,reason:'Not released to players'};
  const taken=tree.nodes.filter(x=>a.unlocks.includes(x.id));
  const excluded=taken.find(x=>n.excludes.includes(x.id)||x.excludes.includes(n.id));
  if(excluded)return {ok:false,reason:`Mutually exclusive with ${excluded.name}`};
  if(n.requiresAll.some(id=>!a.unlocks.includes(id)))return {ok:false,reason:'Required prerequisite not unlocked'};
  if(n.requiresAny.some(group=>!group.some(id=>a.unlocks.includes(id))))return {ok:false,reason:'One required alternative is not unlocked'};
  const points=a.awarded-totalSpent(tree,a);
  if(points<n.cost)return {ok:false,reason:`Need ${n.cost-points} more point(s)`};
  return {ok:true,reason:'Available',cost:n.cost};
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
export function purchase(tree,rawAccount,nodeId) {
  const a=cleanAccount(rawAccount),ok=availability(tree,a,nodeId);
  if(!ok.ok)throw Error(ok.reason);
  a.unlocks.push(nodeId);a.revision++;
  return a;
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
    nodes:visible.map(n=> {
      if(n.display==='teaser')return {id:n.id,name:'Undiscovered',description:'',x:n.x,y:n.y,cost:n.cost,
        silhouette:true,requiresAll:[],requiresAny:[],excludes:[],unrevealedPrerequisite:true};
      const missing=n.requiresAll.some(id=>!visibleIds.has(id))||n.requiresAny.some(g=>g.some(id=>!visibleIds.has(id)));
      return {id:n.id,name:n.name,description:n.description,x:n.x,y:n.y,cost:n.cost,
        silhouette:false,requiresAll:n.requiresAll.filter(id=>visibleIds.has(id)),
        requiresAny:n.requiresAny.map(g=>g.filter(id=>visibleIds.has(id))).filter(g=>g.length),
        excludes:n.excludes.filter(id=>visibleIds.has(id)),
        unrevealedPrerequisite:missing,status:n.status,purchaseAuthority:n.contentRef?.target_id?.startsWith('PERK-')?'ledger':'tree'};
    })
  };
}
/** Only use projected node state for the player's UI, but authoritative GM graph for GM unlock. */
export function publicAvailability(tree,acc,nodeId) {
  const n=tree.nodes.find(n=>n.id===nodeId);
  if(!n)return {ok:false,reason:'Unknown node'};
  if(n.silhouette)return {ok:false,reason:'Not yet revealed'};
  if(n.unrevealedPrerequisite)return {ok:false,reason:'Unrevealed prerequisite'};
  const a=cleanAccount(acc);
  if(tree.provider.kind==='profession'||n.purchaseAuthority==='ledger')return {ok:false,reason:'Profession perk selection is controlled by the Ledger'};
  if(a.unlocks.includes(nodeId))return {ok:false,reason:'Already unlocked'};
  if(n.excludes.some(id=>a.unlocks.includes(id)) || tree.nodes.some(x=>a.unlocks.includes(x.id)&&asArray(x.excludes).includes(nodeId)))return {ok:false,reason:'Excluded by a chosen perk'};
  if(n.requiresAll.some(id=>!a.unlocks.includes(id)))return {ok:false,reason:'Prerequisite required'};
  if(n.requiresAny.some(g=>!g.some(id=>a.unlocks.includes(id))))return {ok:false,reason:'An alternative prerequisite is required'};
  const spent=tree.nodes.filter(x=>a.unlocks.includes(x.id)).reduce((s,x)=>s+x.cost,0);
  if(a.awarded-spent<n.cost)return {ok:false,reason:`Need ${n.cost-(a.awarded-spent)} more point(s)`};
  return {ok:true,reason:'Available to request'};
}
export function changedPurchasedNodes(oldTree,newTree,accounts) {
  const prior=new Map(oldTree.nodes.map(n=>[n.id,n]));const incoming=new Map(newTree.nodes.map(n=>[n.id,n]));const warnings=[];
  for(const a of accounts){for(const id of cleanAccount(a).unlocks){
    const old=prior.get(id),now=incoming.get(id);
    if(!old||!now){warnings.push(`Purchased node ${id} missing`);continue;}
    const relevant=n=>JSON.stringify([n.cost,n.contentRef,n.requiresAll,n.requiresAny,n.excludes]);
    if(relevant(old)!==relevant(now))warnings.push(`Purchased node ${id} changes cost, binding, or dependencies`);
  }}
  if(oldTree.provider.kind!==newTree.provider.kind||walletKey(oldTree)!==walletKey(newTree)){
    if(accounts.some(a=>cleanAccount(a).awarded>0||cleanAccount(a).unlocks.length))warnings.push('Cannot change provider or wallet identity with existing progression');
  }
  return [...new Set(warnings)];
}
