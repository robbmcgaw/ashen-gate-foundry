/** Stand-in for Ashen Gate | Skill Trees 0.17.0's public contract (api.accounts, ag-tree-accounts/1, and its two hooks), as the tests see it.
 * It keeps accounts per character and tree, gives / removes tagged perk Items, fires progressChanged after a write and checkProgress
 * before points or an unlock, exactly as its README describes. Not Skill Trees' code: Skill Trees' own tests prove its side. */
const clone=x=>structuredClone(x);
export function fakeSkillTrees({trees,worldItem,hooks}){
  const accounts=new Map(),key=(a,t)=>`${a.id}|${t}`;
  const byId=id=>trees.find(t=>t.id===id);
  const wallet=t=>t.provider.kind==='cinder_milestone'?`cinder:${t.sourceRef}`:`tree:${t.id}`;
  const clean=a=>({awarded:Number.isSafeInteger(a?.awarded)?a.awarded:0,unlocks:[...new Set(Array.isArray(a?.unlocks)?a.unlocks:[])],grants:Array.isArray(a?.grants)?clone(a.grants):[],revision:a?.revision??0});
  const gmOnly=()=>{if(!game.user.isGM)throw Error('GM only');};
  const grantOf=i=>i?.flags?.['ashen-gate-skill-trees']?.grant??null;
  const stats={setAccount:0};
  async function write(actor,tree,account){
    accounts.set(key(actor,tree.id),clean(account));
    hooks.callAll('ashenGateSkillTrees.progressChanged',{actorId:actor.id,treeId:tree.id,sourceRef:tree.sourceRef??null,kind:tree.provider.kind,wallet:wallet(tree),account:clean(account)});
  }
  function check(actor,tree,action){
    const c={actorId:actor.id,actorName:actor.name,treeId:tree.id,sourceRef:tree.sourceRef??null,kind:tree.provider.kind,action,blocked:null};
    hooks.callAll('ashenGateSkillTrees.checkProgress',c);
    if(c.blocked)throw Error(c.blocked);
  }
  async function syncItems(actor,tree,unlocks){
    const given=[],removed=[];
    for(const n of tree.nodes)if(n.perkId&&unlocks.includes(n.id)&&!actor.items.some(i=>grantOf(i)?.treeId===tree.id&&grantOf(i)?.nodeId===n.id)){
      const data=worldItem(n.perkId).toObject();delete data._id;
      data.flags={...data.flags,'ashen-gate-skill-trees':{grant:{perkId:n.perkId,treeId:tree.id,nodeId:n.id,wallet:wallet(tree)}}};
      const [doc]=await actor.createEmbeddedDocuments('Item',[data]);given.push(doc.name);
    }
    for(const i of [...actor.items])if(grantOf(i)?.treeId===tree.id&&!unlocks.includes(grantOf(i).nodeId)){await i.delete();removed.push(i.name);}
    return {given,removed};
  }
  const resolved=t=>({...clone(t),nodes:t.nodes.map(n=>({...clone(n),name:worldItem(n.perkId)?.name??n.perkId,cost:n.cost??1}))});
  const api={
    version:'0.17.0',
    listTrees:()=>trees.map(clone),
    open:opts=>{api.opened=opts;},
    grantPoints:async(actor,treeId,amount,label)=>{gmOnly();const t=byId(treeId);check(actor,t,'points');const a=clean(accounts.get(key(actor,treeId)));
      a.awarded+=amount;a.grants.push({key:label,amount});await write(actor,t,a);return a;},
    unlock:async(actor,treeId,nodeId)=>{gmOnly();const t=byId(treeId);check(actor,t,'unlock');const a=clean(accounts.get(key(actor,treeId)));
      a.unlocks.push(nodeId);await syncItems(actor,t,a.unlocks);await write(actor,t,a);return {ok:true};},
    accounts:{
      contract:'ag-tree-accounts/1',progressHook:'ashenGateSkillTrees.progressChanged',checkHook:'ashenGateSkillTrees.checkProgress',
      treeBySource:(sourceRef,{kind=null}={})=>{gmOnly();const t=trees.find(x=>x.sourceRef===sourceRef&&(!kind||x.provider.kind===kind));return t?resolved(t):null;},
      account:(actor,treeId)=>{gmOnly();return clean(accounts.get(key(actor,treeId)));},
      setAccount:async(actor,treeId,account)=>{gmOnly();stats.setAccount++;const t=byId(treeId);const a=clean(account);const r=await syncItems(actor,t,a.unlocks);await write(actor,t,a);return r;},
      grants:actor=>{if(!game.user.isGM&&!actor.isOwner)throw Error('Actor access denied');
        return actor.items.map(i=>({item:i,tag:grantOf(i)})).filter(x=>x.tag).map(({item,tag})=>({itemId:item.id,perkId:tag.perkId,treeId:tag.treeId,nodeId:tag.nodeId,wallet:tag.wallet}));},
      legacyData:()=>{gmOnly();return clone(api.legacy??{registry:null,settings:{strainConfig:null,maxCindersPerActor:null,initialCinderPoints:null},pointers:[]});}
    }
  };
  return {api,accounts,stats,seed:(actor,treeId,account)=>accounts.set(key(actor,treeId),clean(account))};
}
