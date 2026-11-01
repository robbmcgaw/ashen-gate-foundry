import test from 'node:test';import assert from 'node:assert/strict';
// 0.28.0 progressive reveal. Pure rules first, then a runtime with mocked Foundry (a GM, a Test player, a normal player; two Cinders, one bound).
// This proves logic and data flow, not the live Forge window. Synthetic [TEST] names only.
class FakeApplication {static DEFAULT_OPTIONS={};constructor(){this.rendered=false;}render(){this.rendered=true;return this;}async _prepareContext(){return {};}async _onRender(){}async close(){return this;}}
const oneTime=new Map(),saved=new Map(),socketHandlers=[],emitted=[];
globalThis.Hooks={once:(e,fn)=>oneTime.set(e,fn),on:()=>{},callAll:()=>{}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{confirm:async()=>true}}},utils:{escapeHTML:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),randomID:()=>Math.random().toString(36).slice(2)}};
globalThis.CSS={escape:v=>String(v)};
const {normalizeTree,validateTree,validatePackage,publicTree,publicAvailability}=await import('../scripts/engine.mjs');
const {revealStates,applyReveal,revealDetails,planShowCinderTrees,showCinderTreesText,isProgressive,cleanReveal}=await import('../scripts/reveal.mjs');
const {emptyTabText}=await import('../scripts/tree-tabs.mjs');
const {buildStateExport}=await import('../scripts/state-export.mjs');

// ---- a 24-node synthetic Cinder tree: six core powers chained C1..C6, each with P/M/G enhancements that need their core ----
const CORES=[1,2,3,4,5,6];
const mkNode=(pre,id,extra={})=>({id:`${pre}-${id}`,perkId:`POWER-T-${pre}-${id}`,cost:1,x:40,y:40,requiresAll:[],requiresAny:[],excludes:[],status:'approved',visibility:'gm',display:'hidden',...extra});
const cinderNodes=pre=>CORES.flatMap((n,i)=>[
  mkNode(pre,`C${n}`,{x:40+i*220,y:40,requiresAll:i?[`${pre}-C${n-1}`]:[]}),
  ...['P','M','G'].map((k,j)=>mkNode(pre,`C${n}${k}`,{x:40+i*220,y:160+j*110,requiresAll:[`${pre}-C${n}`]}))]);
const cinderTree=(id,pre,mut,o={})=>({id,name:`[TEST] ${pre} Cinder`,description:'',status:'approved',visibility:'gm',sourceRef:mut,provider:{kind:'cinder_milestone',maxPoints:16},nodes:cinderNodes(pre),...o});
const ids=t=>t.nodes.map(n=>n.id);
// the same graph as a published tree, with text on every node (what the GM client holds)
const fullTree=(pre='EMB')=>({...cinderTree('TRE',pre,'MUT-T-X',{visibility:'player',reveal:'progressive'}),nodes:cinderNodes(pre).map(n=>({...n,visibility:'player',display:'shown',name:`[TEST] ${n.id}`,description:`${n.id} secret text`,img:`icons/${n.id}.webp`}))});

test('cleanReveal and normalizeTree keep only the known value; absent stays absent',()=>{
  assert.equal(cleanReveal('progressive'),'progressive');
  for(const v of [undefined,null,'',' progressive','all','Progressive',1,true,{}])assert.equal(cleanReveal(v),null);
  assert.equal(normalizeTree(cinderTree('TRE','EMB','MUT-T-X')).reveal,undefined);
  assert.equal('reveal' in normalizeTree({...cinderTree('TRE','EMB','MUT-T-X'),reveal:'bogus'}),false);
  assert.equal(normalizeTree({...cinderTree('TRE','EMB','MUT-T-X'),reveal:'progressive'}).reveal,'progressive');
  assert.equal(isProgressive({reveal:'progressive'}),true);assert.equal(isProgressive({}),false);
});
test('validation: progressive is accepted; an unknown value is a warning (not an error) and is dropped; unshown nodes warn',()=>{
  const ok=validateTree({...cinderTree('TRE','EMB','MUT-T-X'),reveal:'progressive'});
  assert.deepEqual(ok.errors,[]);assert.ok(ok.warnings.some(w=>/reveal progressive: 24 nodes not player-visible/.test(w)),'stored hidden nodes are reported');
  const shown=validateTree({...fullTree(),sourceRef:'MUT-T-X'});assert.deepEqual(shown.errors,[]);assert.ok(!shown.warnings.some(w=>/^reveal/.test(w)));
  const bad=validateTree({...cinderTree('TRE','EMB','MUT-T-X'),reveal:'sometimes'});
  assert.deepEqual(bad.errors,[]);assert.ok(bad.warnings.some(w=>/reveal: unknown value "sometimes"; ignored/.test(w)));
  assert.equal(validatePackage({schema:'ag-skill-trees/0.3',trees:[{...cinderTree('TRE','EMB','MUT-T-X'),reveal:7}]}).errors.length,0);
});
test('the rule on a 24-node Cinder tree: nothing unlocked, then core 1 unlocked',()=>{
  const t=fullTree(),state=u=>{const m=revealStates(t,u),by=s=>[...m].filter(([,v])=>v===s).map(([k])=>k).sort();return {shown:by('shown'),silhouette:by('silhouette'),hidden:by('hidden')};};
  assert.equal(t.nodes.length,24);
  const none=state([]);
  assert.deepEqual(none.shown,['EMB-C1']);
  assert.deepEqual(none.silhouette,['EMB-C1G','EMB-C1M','EMB-C1P','EMB-C2']);
  assert.equal(none.hidden.length,19,'everything deeper is hidden');
  const one=state(['EMB-C1']);
  assert.deepEqual(one.shown,['EMB-C1','EMB-C1G','EMB-C1M','EMB-C1P','EMB-C2']);
  assert.deepEqual(one.silhouette,['EMB-C2G','EMB-C2M','EMB-C2P','EMB-C3']);
  assert.equal(one.hidden.length,15);
  // OR groups: available once any member is unlocked; a node with an unreleased prerequisite is never shown
  const or={reveal:'progressive',nodes:[{id:'AAA',requiresAll:[],requiresAny:[]},{id:'BBB',requiresAll:[],requiresAny:[]},{id:'CCC',requiresAll:[],requiresAny:[['AAA','BBB']]},{id:'DDD',requiresAll:['CCC'],requiresAny:[]},{id:'EEE',requiresAll:['AAA'],requiresAny:[],unrevealedPrerequisite:true}]};
  assert.equal(revealStates(or,[]).get('CCC'),'silhouette');assert.equal(revealStates(or,['BBB']).get('CCC'),'shown');assert.equal(revealStates(or,['BBB']).get('DDD'),'silhouette');
  assert.equal(revealStates(or,['AAA']).get('EEE'),'silhouette','one step beyond, but never available');assert.equal(revealStates(or,['AAA','BBB','CCC']).get('EEE'),'silhouette');
  // an unlocked node is always shown (a GM override can unlock deep)
  assert.equal(revealStates(t,['EMB-C4']).get('EMB-C4'),'shown');
});
test('publicTree: a progressive tree publishes text for the root only; later nodes are silhouettes; full:true (GM client) keeps everything; ordinary trees are unchanged',()=>{
  const pub=publicTree(fullTree());
  assert.equal(pub.reveal,'progressive');
  const real=pub.nodes.filter(n=>!n.silhouette);assert.deepEqual(real.map(n=>n.id),['EMB-C1']);
  const text=JSON.stringify(pub);
  for(const n of fullTree().nodes.filter(n=>n.id!=='EMB-C1')){
    assert.ok(!text.includes(`[TEST] ${n.id}"`),`${n.id} name`);assert.ok(!text.includes(`${n.id} secret text`),`${n.id} text`);assert.ok(!text.includes(`icons/${n.id}.webp`),`${n.id} img`);
  }
  assert.ok(text.includes('secret text')&&text.includes('icons/EMB-C1.webp'),'the root is published');
  assert.ok(pub.nodes.filter(n=>n.silhouette).every(n=>n.name==='Undiscovered'&&n.cost===1&&n.img===null&&n.description===''&&!('lane' in n)));
  assert.equal(publicTree(fullTree(),{full:true}).nodes.filter(n=>!n.silhouette).length,24);
  // stored hidden/teaser nodes are not a floor in a progressive tree: they are simply not published
  const mixed=fullTree();mixed.nodes[1].display='hidden';mixed.nodes[2].display='teaser';
  assert.equal(publicTree(mixed).nodes.length,22);
  // not progressive: exactly as before (stored hidden is dropped, teaser is a silhouette, shown carries text)
  const plain={...fullTree(),reveal:undefined};plain.nodes[1].display='hidden';plain.nodes[2].display='teaser';
  const p=publicTree(plain);assert.equal(p.reveal,undefined);assert.equal(p.nodes.length,23);assert.equal(p.nodes.find(n=>n.id===plain.nodes[2].id).silhouette,true);
  assert.equal(p.nodes.find(n=>n.id==='EMB-C3').name,'[TEST] EMB-C3');
});
test('applyReveal: hidden nodes never reach the model; silhouettes carry no text; shown nodes take their text from the character record only',()=>{
  const pub=publicTree(fullTree()),det=revealDetails(publicTree(fullTree(),{full:true}),[]);
  assert.deepEqual(det,{},'with nothing unlocked the character needs no record: the root is in the shared copy');
  const v0=applyReveal(pub,[],det);
  assert.deepEqual(v0.nodes.map(n=>n.id).sort(),['EMB-C1','EMB-C1G','EMB-C1M','EMB-C1P','EMB-C2']);
  const json0=JSON.stringify(v0);
  for(const n of fullTree().nodes.filter(n=>n.id!=='EMB-C1')){assert.ok(!json0.includes(`[TEST] ${n.id}"`));assert.ok(!json0.includes(`${n.id} secret`));assert.ok(!json0.includes(`icons/${n.id}.webp`));}
  assert.ok(v0.nodes.every(n=>n.id==='EMB-C1'||(n.silhouette&&n.name==='Undiscovered')));
  // silhouette edges only point at drawn nodes
  const keep=new Set(v0.nodes.map(n=>n.id));for(const n of v0.nodes)for(const r of [...n.requiresAll,...n.requiresAny.flat()])assert.ok(keep.has(r));
  // unlock core 1: its record holds exactly the shown, masked nodes
  const rec=revealDetails(publicTree(fullTree(),{full:true}),['EMB-C1']);
  assert.deepEqual(Object.keys(rec).sort(),['EMB-C1G','EMB-C1M','EMB-C1P','EMB-C2']);
  assert.ok(!JSON.stringify(rec).includes('EMB-C3'));
  const v1=applyReveal(pub,['EMB-C1'],rec);
  assert.deepEqual(v1.nodes.filter(n=>!n.silhouette).map(n=>n.id).sort(),['EMB-C1','EMB-C1G','EMB-C1M','EMB-C1P','EMB-C2']);
  assert.equal(v1.nodes.find(n=>n.id==='EMB-C2').name,'[TEST] EMB-C2');
  assert.deepEqual(v1.nodes.filter(n=>n.silhouette).map(n=>n.id).sort(),['EMB-C2G','EMB-C2M','EMB-C2P','EMB-C3']);
  assert.ok(!JSON.stringify(v1).includes('[TEST] EMB-C3"')&&!JSON.stringify(v1).includes('EMB-C3 secret'));
  // a shown node with no record fails closed (silhouette), and a record for a node that is not shown is ignored
  assert.equal(applyReveal(pub,['EMB-C1'],{}).nodes.find(n=>n.id==='EMB-C2').silhouette,true);
  const sneaky=applyReveal(pub,[],{'EMB-C3':{name:'[TEST] EMB-C3',description:'EMB-C3 secret text'}});assert.ok(!JSON.stringify(sneaky).includes('secret text')||JSON.stringify(sneaky).includes('EMB-C1 secret'));
  assert.ok(!JSON.stringify(sneaky).includes('EMB-C3 secret'));
  // an ordinary tree passes through untouched
  const plain=publicTree({...fullTree(),reveal:undefined});assert.equal(applyReveal(plain,[],{}),plain);
  // silhouettes cannot be unlocked or leak a reason name
  const sil=v0.nodes.find(n=>n.id==='EMB-C2');assert.equal(publicAvailability(v0,{awarded:5,unlocks:[]},sil.id).ok,false);
});
test('maintenance plan: Cinder trees only, status/positions/progress untouched, idempotent, placeholders skipped',()=>{
  const gen={id:'GEN-1',name:'[TEST] Generic',status:'approved',visibility:'gm',provider:{kind:'generic_points',maxPoints:5},nodes:[mkNode('G','A')]};
  const ph=cinderTree('CIN-P','PHD','MUT-T-PH');ph.nodes[0]={...ph.nodes[0],status:'placeholder'};
  const draft=cinderTree('CIN-D','DRF','MUT-T-DR',{status:'draft'});
  const input=[cinderTree('CIN-A','EMB','MUT-T-A'),gen,ph,draft].map(normalizeTree);
  const before=structuredClone(input);
  const {trees,counts}=planShowCinderTrees(input);
  assert.deepEqual(input,before,'the input is not mutated');
  assert.deepEqual(counts,{cinderTrees:3,treesChanged:3,nodesChanged:24+23+24,nodesSkipped:1,notReleased:1});
  assert.equal(trees[1],input[1],'a non-Cinder tree is returned as it was');
  for(const t of trees.filter(t=>t.provider.kind==='cinder_milestone')){
    assert.equal(t.visibility,'player');assert.equal(t.reveal,'progressive');
    const o=input.find(x=>x.id===t.id);assert.equal(t.status,o.status);
    t.nodes.forEach((n,i)=>{const w=o.nodes[i];assert.equal(n.status,w.status);assert.equal(n.x,w.x);assert.equal(n.y,w.y);assert.equal(n.perkId,w.perkId);assert.deepEqual(n.requiresAll,w.requiresAll);
      if(w.status==='placeholder'){assert.equal(n.visibility,'gm');assert.equal(n.display,'hidden');}else{assert.equal(n.visibility,'player');assert.equal(n.display,'shown');}});
    assert.deepEqual(validateTree(t).errors,[]);
  }
  const again=planShowCinderTrees(trees);
  assert.equal(again.counts.treesChanged,0);assert.equal(again.counts.nodesChanged,0);assert.deepEqual(again.trees,trees);
  assert.match(showCinderTreesText(counts),/Updated 3 of 3 Cinder trees \(71 perks set to shown\)\. 1 still in draft.*1 placeholder perk left GM-only\. Player view republished\./);
  assert.match(showCinderTreesText(again.counts),/already shown to their bearers; nothing changed/);
  assert.equal(showCinderTreesText(planShowCinderTrees([gen]).counts),'There are no Cinder trees to show.');
});
test('empty state text stays accurate and carries no ids',()=>{
  assert.match(emptyTabText('cinders',{actorName:'[TEST] Zed'}),/^\[TEST\] Zed has no bound Cinder yet\./);
  assert.equal(emptyTabText('cinders',{actorName:'[TEST] Zed',bound:true}),'[TEST] Zed has a bound Cinder, but its tree has not been released yet. Ask your GM.');
  assert.match(emptyTabText('cinders',{gm:true,bound:true}),/^No Cinder trees yet/,'the GM text is unchanged');
});
test('state export carries reveal (null when absent)',()=>{
  const out=buildStateExport({isGM:true,trees:[normalizeTree({...cinderTree('TRE','EMB','MUT-T-X'),reveal:'progressive'}),normalizeTree(cinderTree('UVW','ASH','MUT-T-Y'))],actors:[]});
  assert.deepEqual(out.trees.map(t=>[t.tree_id,t.reveal]),[['TRE','progressive'],['UVW',null]]);
});

// ---- runtime: mocked Foundry ----
const MOD='ashen-gate-skill-trees',MUT='MUT-T-EMBER',OTHER='MUT-T-ASHEN';
const trees=[cinderTree('CIN-EMBER','EMB',MUT),cinderTree('CIN-ASH','ASH',OTHER),
  {id:'GEN-1',name:'[TEST] Generic',description:'',status:'approved',visibility:'player',sourceRef:null,provider:{kind:'generic_points',maxPoints:10},nodes:[{...mkNode('GEN','A'),visibility:'player',display:'shown'}]}];
const allNodes=trees.flatMap(t=>t.nodes);
const journal={flags:{[MOD]:{privateStore:true,payload:{schema:'ag-skill-trees/0.3',trees}}},async setFlag(m,k,v){this.flags[m][k]=structuredClone(v);}};
const worldPerk=n=>({id:`W-${n.perkId}`,uuid:`Item.W-${n.perkId}`,documentName:'Item',type:'feat',name:`[TEST] ${n.id}`,img:`icons/${n.id}.webp`,ownership:{default:2},sheet:{render:()=>{}},
  system:{description:{value:`<h2>Effect &amp; Rules</h2><p>${n.id} secret text.</p>`}},testUserPermission:()=>true,
  flags:{'ashen-gate-manager':{source:{sourceId:n.perkId,entityType:n.perkId.startsWith('POWER')?'Power':'ProfessionPerk',status:'approved',visibility:'player',definition:{id:n.perkId,point_cost:1,tier:'apprentice'}}}},
  toObject(){return structuredClone({_id:this.id,name:this.name,type:this.type,img:this.img,system:this.system,flags:this.flags});}});
const gm={id:'gm',isGM:true,name:'GM'},tester={id:'u-test',isGM:false,name:'Tester'},real={id:'u-real',isGM:false,name:'Real'};
const mkActor=(id,name,owner,{cinders}={})=>{const actor={id,name,documentName:'Actor',type:'character',items:[],flags:cinders?{'ashen-gate-cinders':{cinders}}:{},
  get isOwner(){return game.user.isGM||game.user.id===owner;},testUserPermission:(u)=>u.isGM||u.id===owner,
  async setFlag(m,k,v){this.flags[m]??={};this.flags[m][k]=structuredClone(v);actor.writes.push(k);},writes:[],
  async createEmbeddedDocuments(_t,data){const docs=data.map(d=>({...structuredClone(d),id:`EMB${Math.random()}`,parent:actor,sheet:{render:()=>{}},async delete(){actor.items=actor.items.filter(x=>x!==this);}}));actor.items.push(...docs);return docs;}};return actor;};
const aaron=mkActor('A1','[TEST] Aaron','u-test'),zed=mkActor('Z1','[TEST] Zed','u-test',{cinders:[{instanceId:'ci_1',definitionId:MUT}]}),outsider=mkActor('O1','[TEST] Outsider','u-real');
const TESTERS=['u-test'];
globalThis.game={modules:new Map([[MOD,{id:MOD,active:true}],['ashen-gate-cinders',{id:'ashen-gate-cinders',active:true}],['ashen-gate-manager',{id:'ashen-gate-manager',active:true}]]),
  settings:{settings:new Map([['ashen-gate-manager.testPlayers',{}]]),register:()=>{},registerMenu:()=>{},
    get:(m,k)=>k==='testPlayers'?TESTERS:saved.get(k)??(k==='playerAccessEnabled'?false:undefined),set:async(_m,k,v)=>{saved.set(k,structuredClone(v));return v;}},
  journal:{contents:[journal]},items:{contents:allNodes.map(worldPerk)},actors:{contents:[aaron,zed,outsider],get(id){return this.contents.find(a=>a.id===id)??null;}},
  user:gm,users:{contents:[gm,tester,real],get:id=>[gm,tester,real].find(u=>u.id===id),activeGM:gm},socket:{on:(_n,fn)=>socketHandlers.push(fn),emit:(_n,m)=>emitted.push(m)}};
globalThis.ui={actors:null,notifications:{info:()=>{},error:()=>{},warn:()=>{}}};
await import('../scripts/main.js');
oneTime.get('init')();oneTime.get('ready')();
const api=game.modules.get(MOD).api;
const as=u=>{game.user=u;};
const prep=app=>app.constructor.prototype._prepareContext.call(app,{});
const stored=()=>journal.flags[MOD].payload.trees;
const secrets=pre=>CORES.flatMap(n=>['','P','M','G'].map(k=>`${pre}-C${n}${k}`));
const leaks=(blob,hiddenIds)=>hiddenIds.filter(id=>new RegExp(`\\[TEST\\] ${id}(?![A-Z0-9])`).test(blob)||blob.includes(`${id} secret`)||blob.includes(`icons/${id}.webp`));
const stateOf=ctx=>({shown:ctx.nodes.filter(n=>!n.silhouette).map(n=>n.id).sort(),sil:ctx.nodes.filter(n=>n.silhouette).map(n=>n.id).sort()});

test('before the action: Cinder trees are GM-only, players see none, and the empty state says the Cinder is bound but not released',async()=>{
  assert.equal(await api.publish(),1,'only the generic tree is player-visible');
  as(tester);
  const app=api.open({tab:'cinders',actorId:'Z1'});const c=await prep(app);
  assert.equal(c.hasTree,false);assert.equal(c.emptyText,'[TEST] Zed has a bound Cinder, but its tree has not been released yet. Ask your GM.');
  assert.doesNotMatch(c.emptyText,/MUT-|CIN-|POWER-/);
  app.actorId='A1';assert.match((await prep(app)).emptyText,/\[TEST\] Aaron has no bound Cinder yet\./,'no Cinder bound: the old sentence');
});
test('showCinderTrees: GM only (data layer), confirmation-free API, counts, idempotent, nothing else touched',async()=>{
  as(tester);await assert.rejects(()=>api.showCinderTrees(),/GM only/);
  as(real);await assert.rejects(()=>api.showCinderTrees(),/GM only/);
  as(gm);
  const before=structuredClone(stored());
  const r1=await api.showCinderTrees();
  assert.deepEqual(r1,{cinderTrees:2,treesChanged:2,nodesChanged:48,nodesSkipped:0,notReleased:0});
  for(const t of stored().filter(t=>t.provider.kind==='cinder_milestone')){
    const o=before.find(x=>x.id===t.id);
    assert.equal(t.visibility,'player');assert.equal(t.reveal,'progressive');assert.equal(t.status,'approved');
    assert.ok(t.nodes.every((n,i)=>n.visibility==='player'&&n.display==='shown'&&n.status===o.nodes[i].status&&n.x===o.nodes[i].x&&n.y===o.nodes[i].y&&n.perkId===o.nodes[i].perkId));
  }
  assert.deepEqual(stored().find(t=>t.id==='GEN-1'),normalizeTree(before.find(t=>t.id==='GEN-1')),'other trees untouched');
  const snapshot=JSON.stringify(stored());
  const r2=await api.showCinderTrees();
  assert.deepEqual(r2,{cinderTrees:2,treesChanged:0,nodesChanged:0,nodesSkipped:0,notReleased:0});
  assert.equal(JSON.stringify(stored()),snapshot,'a second run changes nothing');
  assert.equal(JSON.stringify(zed.flags[MOD]?.progressV2??null),'null','no progress written');
});
test('the shared player copy never carries the text of a later node (the world setting every client can read)',()=>{
  const published=JSON.stringify(saved.get('publicTreesV2'));
  const later=secrets('EMB').filter(id=>id!=='EMB-C1').concat(secrets('ASH').filter(id=>id!=='ASH-C1'));
  assert.deepEqual(leaks(published,later),[]);
  assert.ok(published.includes('[TEST] EMB-C1')&&published.includes('icons/EMB-C1.webp'),'only the first power is published in full');
  const tree=saved.get('publicTreesV2').trees.find(t=>t.id==='CIN-EMBER');
  assert.equal(tree.nodes.filter(n=>!n.silhouette).length,1);assert.equal(tree.reveal,'progressive');
});
test('the bearer sees the first power and silhouettes beyond it, before unlocking anything; never other Cinders; Test player included',async()=>{
  as(tester); // a Test player: Player Access is off
  assert.doesNotThrow(()=>api.open({tab:'cinders',actorId:'Z1'}));
  const app=api.open({tab:'cinders',actorId:'Z1'});const c=await prep(app);
  assert.deepEqual(c.trees.map(o=>o.value),['CIN-EMBER'],'the bound Cinder only; the other Cinder tree is not listed');
  assert.equal(c.hasTree,true);
  assert.deepEqual(stateOf(c),{shown:['EMB-C1'],sil:['EMB-C1G','EMB-C1M','EMB-C1P','EMB-C2']});
  const hidden=secrets('EMB').filter(id=>!c.nodes.some(n=>n.id===id));assert.equal(hidden.length,19);
  // the first power is the one to spend on
  const first=c.nodes.find(n=>n.id==='EMB-C1');assert.equal(first.name,'[TEST] EMB-C1');assert.equal(first.silhouette,false);
  // nothing leaks into the model, the tooltips, the list, the embed or any aria label
  const blob=JSON.stringify({ctx:c.nodes,labels:c.nodes.map(n=>n.label),tips:app._tips,list:c.nodes.map(n=>n.listNote),edges:c.edges,tree:c.tree,panel:c.panel});
  assert.deepEqual(leaks(blob,hidden),[]);assert.deepEqual(leaks(blob,['EMB-C1G','EMB-C1M','EMB-C1P','EMB-C2']),[],'silhouettes are nameless too');
  assert.ok(c.nodes.filter(n=>n.silhouette).every(n=>n.name==='Undiscovered'&&n.img===null&&/^Undiscovered/.test(n.label)));
  app.nodeId='EMB-C2';const sel=await prep(app);assert.equal(sel.panel.unlock.enabled,false);assert.equal(sel.panel.body??'','');
  assert.deepEqual(leaks(JSON.stringify(sel.panel),secrets('EMB')),[]);
  // the Hub embed uses the same rule
  const data=api.embed.data('Z1'),emb=JSON.stringify(data);
  const treeData=data.flatMap(g=>g.trees).find(t=>t.id==='CIN-EMBER');
  assert.deepEqual(treeData.nodes.map(n=>n.id),['EMB-C1'],'embed.data lists only shown nodes (no silhouettes, no hidden)');
  assert.deepEqual(leaks(emb,secrets('EMB').filter(id=>id!=='EMB-C1')),[]);
  // another character, another Cinder: nothing
  assert.throws(()=>api.open({actorId:'A1',treeId:'CIN-EMBER'}),/Unknown tree/);
  assert.equal(api.embed.data('A1').flatMap(g=>g.trees).some(t=>/CIN-/.test(t.id)),false);
  assert.ok(!JSON.stringify(api.listTrees()).includes('ASH-'),'the unbound Cinder is not listed');
  assert.deepEqual(leaks(JSON.stringify(api.listTrees()),secrets('EMB').filter(id=>id!=='EMB-C1')),[],'listTrees has no character: the shared minimum');
  // the per-character record exists for the bearer only, and is empty (the first power is in the shared copy)
  assert.equal(aaron.flags[MOD]?.revealV1,undefined);assert.equal(outsider.flags[MOD]?.revealV1,undefined);
});
test('the GM client keeps the full view and the Player preview matches the player',async()=>{
  as(gm);
  const app=api.open({tab:'cinders',actorId:'Z1',treeId:'CIN-EMBER'});
  const raw=await prep(app);assert.equal(raw.nodes.length,24);assert.ok(raw.nodes.every(n=>!n.silhouette),'the GM sees everything');
  app.playerPreview=true;const pre=await prep(app);
  assert.deepEqual(stateOf(pre),{shown:['EMB-C1'],sil:['EMB-C1G','EMB-C1M','EMB-C1P','EMB-C2']});
  app.playerPreview=false;
});
test('unlocking the first power reveals the next tier; the record holds only what that character may read',async()=>{
  as(gm);
  await api.grantPoints(zed,'CIN-EMBER',1,'m1');await api.grantPoints(zed,'CIN-EMBER',1,'m2');
  await api.unlock(zed,'CIN-EMBER','EMB-C1');
  const rec=zed.flags[MOD].revealV1;
  assert.equal(rec.schema,'ag-skill-trees-reveal/0.1');
  assert.deepEqual(Object.keys(rec.trees['CIN-EMBER']).sort(),['EMB-C1G','EMB-C1M','EMB-C1P','EMB-C2']);
  assert.deepEqual(leaks(JSON.stringify(rec),secrets('EMB').filter(id=>!['EMB-C1G','EMB-C1M','EMB-C1P','EMB-C2'].includes(id))),[]);
  const writes=zed.writes.filter(k=>k==='revealV1').length;
  as(tester);
  const app=api.open({tab:'cinders',actorId:'Z1',treeId:'CIN-EMBER'});const c=await prep(app);
  assert.deepEqual(stateOf(c),{shown:['EMB-C1','EMB-C1G','EMB-C1M','EMB-C1P','EMB-C2'],sil:['EMB-C2G','EMB-C2M','EMB-C2P','EMB-C3']});
  assert.equal(c.nodes.find(n=>n.id==='EMB-C2').name,'[TEST] EMB-C2');assert.equal(c.nodes.find(n=>n.id==='EMB-C1').unlocked,true);
  const deeper=secrets('EMB').filter(id=>!c.nodes.some(n=>n.id===id));assert.equal(deeper.length,15);
  assert.deepEqual(leaks(JSON.stringify({n:c.nodes,t:app._tips,e:c.edges,tree:c.tree}),deeper),[]);
  const emb=api.embed.data('Z1').flatMap(g=>g.trees).find(t=>t.id==='CIN-EMBER');
  assert.deepEqual(emb.nodes.map(n=>n.id).sort(),['EMB-C1','EMB-C1G','EMB-C1M','EMB-C1P','EMB-C2']);
  assert.deepEqual(emb.nodes.find(n=>n.id==='EMB-C2').requiresAll,['[TEST] EMB-C1']);
  assert.deepEqual(leaks(JSON.stringify(emb),deeper),[]);
  // a republish re-checks every character and writes nothing when nothing changed
  as(gm);await api.publish();assert.equal(zed.writes.filter(k=>k==='revealV1').length,writes,'idempotent');
});
test('a player asking the GM client to unlock: the revealed node works; a hidden or silhouette node is refused',async()=>{
  as(gm);
  const ask=async(nodeId)=>{emitted.length=0;await socketHandlers[0]({type:'unlock-request',requestId:'r'+nodeId,userId:'u-test',actorId:'Z1',treeId:'CIN-EMBER',nodeId},'u-test');return emitted.find(m=>m.type==='unlock-result');};
  const deep=await ask('EMB-C4');assert.equal(deep.ok,false);
  const sil=await ask('EMB-C3');assert.equal(sil.ok,false,'one step beyond: still locked');
  const ok=await ask('EMB-C2');assert.equal(ok.ok,true,ok.message);
  assert.deepEqual(stateOf(await (async()=>{as(tester);return prep(api.open({tab:'cinders',actorId:'Z1',treeId:'CIN-EMBER'}));})()).sil.includes('EMB-C3'),false,'C3 is now shown');
  as(gm);await api.refund(zed,'CIN-EMBER','EMB-C2');
  as(tester);const back=await prep(api.open({tab:'cinders',actorId:'Z1',treeId:'CIN-EMBER'}));
  assert.deepEqual(stateOf(back).shown.includes('EMB-C3'),false,'a refund hides the tier again');
});
test('a later edit of the tree republishes without leaking, and turning reveal off shows all released nodes again',async()=>{
  as(gm);
  const t=structuredClone(stored().find(x=>x.id==='CIN-EMBER'));delete t.reveal;
  await assert.doesNotReject(async()=>{const {importTrees}=api;await importTrees({schema:'ag-skill-trees/0.3',trees:[t]},{mode:'update'});});
  assert.equal(saved.get('publicTreesV2').trees.find(x=>x.id==='CIN-EMBER').reveal,undefined);
  as(tester);const c=await prep(api.open({tab:'cinders',actorId:'Z1',treeId:'CIN-EMBER'}));
  assert.equal(c.nodes.length,24);assert.ok(c.nodes.every(n=>!n.silhouette));
  as(gm);await api.showCinderTrees();
  assert.equal(stored().find(x=>x.id==='CIN-EMBER').reveal,'progressive');
});
