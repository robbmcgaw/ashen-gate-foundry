import test from 'node:test';import assert from 'node:assert/strict';
import {SCHEMA,normalizeTree,validateTree,validatePackage,resolveTree,perkCost,purchase,refund,resetUnlocks,dependentsBlockingRefund,
  missingGrants,grantTag,savedDataReport,changedPurchasedNodes,publicTree} from '../scripts/engine.mjs';
import {graphEdges,edgeLine,NODE_W,NODE_H} from '../scripts/graph.mjs';
import {NODE_SIZES} from '../scripts/appearance.mjs';
const n=(id,perkId,extra={})=>({id,perkId,x:100,y:100,requiresAll:[],requiresAny:[],excludes:[],status:'test',visibility:'player',display:'shown',...extra});
const tree=nodes=>normalizeTree({id:'TREE-PERKS',name:'[TEST] Perks',status:'test',visibility:'player',provider:{kind:'generic_points',maxPoints:10},nodes});
const perks={'PERK-A':{name:'A',cost:1},'PERK-B':{name:'B',cost:1},'PERK-C':{name:'C',cost:1},'PERK-D':{name:'D',cost:3}};
const look=id=>perks[id]??null;

test('0.3 perk nodes need no name or cost; 0.2 files still validate',()=>{
  assert.equal(SCHEMA,'ag-skill-trees/0.3');
  const t=tree([n('NODE-A','PERK-A')]);
  assert.deepEqual(validateTree(t).errors,[]);
  assert.deepEqual(validatePackage({schema:'ag-skill-trees/0.3',trees:[t]}).errors,[]);
  assert.deepEqual(validatePackage({schema:'ag-skill-trees/0.2',trees:[t]}).errors,[]);
  assert.ok(validatePackage({schema:'ag-skill-trees/9',trees:[t]}).errors.length);
  assert.ok(validateTree(tree([n('NODE-A','HPERK-A')])).errors.length,'HPERK belongs to Hirelings');
  assert.ok(validateTree(tree([n('NODE-A','POWER-A')])).errors.length===0,'generic trees may use POWER perks');
  assert.ok(validateTree(tree([n('NODE-A',null)])).errors.some(e=>/name/.test(e)),'a custom node still needs its own name');
});
test('old contentRef nodes become perk nodes without rewriting the stored link',()=>{
  const raw={id:'NODE-OLD',name:'Old',x:1,y:1,cost:2,contentRef:{relation:'unlocks_perk',target_id:'PERK-A',mode:'optional'},sourceUuid:'Item.old'};
  const t=tree([raw]),node=t.nodes[0];
  assert.equal(node.perkId,'PERK-A');assert.equal(node.perkUuid,'Item.old');
  assert.deepEqual(node.contentRef,raw.contentRef,'stored contentRef kept');
  assert.equal(resolveTree(t,()=>({name:'A'})).nodes[0].cost,2,'perk without a point_cost falls back to the stored node cost');
  assert.equal(resolveTree(t,()=>({name:'A',cost:4})).nodes[0].cost,4,'a cost on the perk wins');
});
test('perk cost reads point_cost from the perk definition',()=>{
  assert.equal(perkCost({point_cost:3}),3);assert.equal(perkCost({}),null);assert.equal(perkCost({point_cost:0}),null);assert.equal(perkCost(null),null);
});
test('refund is blocked while an unlocked node depends on it; OR groups only block on their last choice',()=>{
  const t=resolveTree(tree([n('NODE-A','PERK-A'),n('NODE-B','PERK-B'),n('NODE-C','PERK-C',{requiresAny:[['NODE-A','NODE-B']]}),n('NODE-D','PERK-D',{requiresAll:['NODE-A']})]),look);
  let acc={awarded:10,unlocks:[]};
  for(const id of ['NODE-A','NODE-B','NODE-C','NODE-D'])acc=purchase(t,acc,id);
  assert.throws(()=>refund(t,acc,'NODE-A'),/D first/);
  const withoutD=refund(t,acc,'NODE-D');
  assert.deepEqual(withoutD.unlocks,['NODE-A','NODE-B','NODE-C']);
  assert.deepEqual(refund(t,withoutD,'NODE-A').unlocks,['NODE-B','NODE-C'],'B still satisfies the OR group');
  assert.deepEqual(dependentsBlockingRefund(t,{unlocks:['NODE-B','NODE-C']},'NODE-B').map(x=>x.id),['NODE-C']);
  assert.throws(()=>refund(t,{unlocks:[]},'NODE-A'),/not unlocked/);
  const reset=resetUnlocks(acc);assert.deepEqual(reset.unlocks,[]);assert.equal(reset.awarded,10,'points awarded stay');
});
test('grant tags trace a perk Item to its tree and node; missing grants are found for backfill',()=>{
  const t=tree([n('NODE-A','PERK-A'),n('NODE-X',null,{name:'Custom'})]);
  const tag=grantTag(t,t.nodes[0]);
  assert.deepEqual(tag,{perkId:'PERK-A',treeId:'TREE-PERKS',nodeId:'NODE-A',wallet:'tree:TREE-PERKS'});
  const acc={unlocks:['NODE-A','NODE-X']};
  assert.deepEqual(missingGrants(t,acc,[]).map(x=>x.id),['NODE-A'],'custom nodes never need an Item');
  assert.deepEqual(missingGrants(t,acc,[tag,null]),[]);
});
test('saved-data report lists custom nodes and perks missing from the world, and changes nothing',()=>{
  const trees=[tree([n('NODE-A','PERK-A'),n('NODE-Z','PERK-ZZZ'),n('NODE-X',null,{name:'Custom'})])];
  const before=JSON.stringify(trees);
  const rows=savedDataReport(trees,id=>Boolean(perks[id]));
  assert.deepEqual(rows.map(r=>[r.nodeId,r.issue]),[['NODE-Z','missing_perk'],['NODE-X','custom']]);
  assert.equal(JSON.stringify(trees),before);
});
test('changing the perk of a purchased node is protected',()=>{
  const old=tree([n('NODE-A','PERK-A')]),next=tree([n('NODE-A','PERK-B')]);
  assert.ok(changedPurchasedNodes(old,next,[{unlocks:['NODE-A']}]).length);
  assert.deepEqual(changedPurchasedNodes(old,tree([n('NODE-A','PERK-A',{x:900})]),[{unlocks:['NODE-A']}]),[],'moving is fine');
});
test('player projection drops hidden nodes from prerequisite lists and edges',()=>{
  const t=resolveTree(tree([n('NODE-H','PERK-A',{visibility:'gm',display:'hidden'}),n('NODE-V','PERK-B',{requiresAll:['NODE-H'],excludes:['NODE-H']})]),look);
  const p=publicTree(t);
  assert.deepEqual(p.nodes.map(x=>x.id),['NODE-V']);
  assert.deepEqual(graphEdges(p.nodes),[]);
  assert.ok(!JSON.stringify(p).includes('NODE-H')&&!JSON.stringify(p).includes('PERK-'));
});
test('edges point from prerequisite to dependent and stop at the node border',()=>{
  const a={id:'A',x:0,y:0},b={id:'B',x:400,y:0,requiresAll:['A']},c={id:'C',x:400,y:300,requiresAny:[['A','B']],excludes:['B']},d={id:'D',x:0,y:300,excludes:['C']};
  c.unlocked=true;a.unlocked=true;
  const edges=graphEdges([a,b,{...c,excludes:['B']},{...d}].map(x=>({...x,excludes:x.excludes??[]})));
  const all=edges.find(e=>e.kind==='all');
  assert.deepEqual([all.from,all.to],['A','B']);
  const [,x1,x2]=all.d.match(/M ([\d.]+) [\d.]+ L ([\d.]+) [\d.]+/);
  assert.ok(Number(x1)>=NODE_W/2+NODE_SIZES.normal.icon/2&&Number(x2)<=400+NODE_W/2-NODE_SIZES.normal.icon/2,'segment runs between the two round icons, so the arrowhead is outside the target icon');
  assert.deepEqual(edges.filter(e=>e.kind==='any').map(e=>[e.from,e.to,e.group]),[['A','C',1],['B','C',1]]);
  assert.equal(edges.find(e=>e.from==='A'&&e.to==='C').active,true);
  assert.equal(edges.filter(e=>e.kind==='exclude').length,2);
  const twice=graphEdges([{id:'P',x:0,y:0,excludes:['Q']},{id:'Q',x:300,y:0,excludes:['P']}]);
  assert.equal(twice.length,1,'a two-way exclusion is drawn once');
  const line=edgeLine({x:0,y:0},{x:0,y:400});
  assert.match(line.d,new RegExp(`^M ${NODE_W/2} [\\d.]+ L ${NODE_W/2} `));
  assert.ok(line.my>NODE_H/2&&line.my<400);
});
