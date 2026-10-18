import test from 'node:test';import assert from 'node:assert/strict';
import {SCHEMA,normalizeTree,validateTree,validatePackage,allowedSourceForProvider,cleanAccount,grantPoints,purchase,availability,publicTree,publicAvailability,walletKey,changedPurchasedNodes} from '../scripts/engine.mjs';
const node=(id,opts={})=>({id,name:id,description:`Public ${id}`,x:120,y:120,cost:1,status:'test',visibility:'player',display:'shown',requiresAll:[],requiresAny:[],excludes:[],contentRef:null,...opts});
const tree=(id='TREE-TEST',options={})=>normalizeTree({id,name:id,description:'Public test',status:'test',visibility:'player',sourceRef:null,provider:{kind:'generic_points',maxPoints:8},
 nodes:[node('NOD-START'),node('NOD-LEFT',{x:320,requiresAll:['NOD-START']}),node('NOD-RIGHT',{x:340,y:340}),node('NOD-ANY',{x:650,requiresAny:[['NOD-LEFT','NOD-RIGHT']]})],...options});

test('valid flexible branching uses no sequential stage constraint',()=>{const t=tree();assert.deepEqual(validateTree(t).errors,[]);let a=grantPoints(t,{},3,'Scene 1');assert.equal(availability(t,a,'NOD-RIGHT').ok,true);a=purchase(t,a,'NOD-RIGHT');assert.equal(availability(t,a,'NOD-ANY').ok,true);a=purchase(t,a,'NOD-ANY');assert.deepEqual(a.unlocks,['NOD-RIGHT','NOD-ANY']);});
test('AND prerequisites require both nodes',()=>{const t=tree('TREE-AND',{nodes:[node('NOD-A'),node('NOD-B',{x:230}),node('NOD-C',{x:550,requiresAll:['NOD-A','NOD-B']})]});let a=grantPoints(t,{},3,'Start');a=purchase(t,a,'NOD-A');assert.equal(availability(t,a,'NOD-C').ok,false);a=purchase(t,a,'NOD-B');assert.equal(availability(t,a,'NOD-C').ok,true);});
test('OR groups, each group independently required',()=>{const t=tree('TREE-OR',{nodes:[node('NOD-A'),node('NOD-B'),node('NOD-C'),node('NOD-D',{requiresAny:[['NOD-A','NOD-B'],['NOD-C']]})]});let a=grantPoints(t,{},4,'Start');a=purchase(t,a,'NOD-B');assert.equal(availability(t,a,'NOD-D').ok,false);a=purchase(t,a,'NOD-C');assert.equal(availability(t,a,'NOD-D').ok,true);});
test('exclusion works in either direction',()=>{const t=tree('TREE-EX',{nodes:[node('NOD-A',{excludes:['NOD-B']}),node('NOD-B')]});let a=grantPoints(t,{},3,'Initial');a=purchase(t,a,'NOD-A');assert.match(availability(t,a,'NOD-B').reason,/exclusive/i);});
test('self-links, cycles, orphan refs and exclusions of dependencies rejected',()=>{for(const nodes of [
[node('NOD-A',{requiresAll:['NOD-A']})],
[node('NOD-A',{requiresAll:['NOD-B']}),node('NOD-B',{requiresAll:['NOD-A']})],
[node('NOD-A',{requiresAll:['NOD-UNKNOWN']})],
[node('NOD-A'),node('NOD-B',{requiresAll:['NOD-A'],excludes:['NOD-A']})]
])assert.ok(validateTree(tree('TREE-BAD',{nodes})).errors.length);});
test('sandbox placeholders are forced GM only and unspendable',()=>{const t=tree('TREE-HIDE',{nodes:[node('NOD-SECRET',{status:'placeholder',visibility:'gm',display:'hidden'})]});assert.deepEqual(validateTree(t).errors,[]);const acc=grantPoints(t,{},1,'Point 1');assert.equal(availability(t,acc,'NOD-SECRET').ok,false);assert.equal(publicTree(t).nodes.length,0);});
test('GM-only and reveal-gated nodes are omitted from public projection',()=>{const t=tree('TREE-VIS',{nodes:[node('NOD-ONE'),node('NOD-SECRET',{visibility:'gm',name:'secret description',description:'secret source ID PERK-SECRET'}),node('NOD-GATE',{visibility:'reveal_gated',name:'latent power',description:'GM lore'}),node('NOD-TEASER',{display:'teaser',name:'SECRET FINAL',description:'HIDDEN EFFECT',contentRef:{relation:'unlocks_perk',target_id:'PERK-PRIVATE',mode:'required'}})]});const projection=publicTree(t);assert.deepEqual(projection.nodes.map(x=>x.id),['NOD-ONE','NOD-TEASER']);const payload=JSON.stringify(projection);assert.ok(!payload.includes('secret description')&&!payload.includes('PERK-PRIVATE')&&!payload.includes('HIDDEN EFFECT')&&!payload.includes('GM lore'));assert.equal(projection.nodes[1].name,'Undiscovered');});
test('hidden required node blocks child without leaking ID',()=>{const t=tree('TREE-PRIV',{nodes:[node('NOD-HIDDEN',{visibility:'gm',description:'GM secret'}),node('NOD-VISIBLE',{x:380,requiresAll:['NOD-HIDDEN']})]});const publicView=publicTree(t);const child=publicView.nodes.find(n=>n.id==='NOD-VISIBLE');assert.deepEqual(child.requiresAll,[]);assert.equal(child.unrevealedPrerequisite,true);assert.equal(publicAvailability(publicView,{},'NOD-VISIBLE').ok,false);assert.ok(!JSON.stringify(publicView).includes('NOD-HIDDEN'));});
test('Cinder wallet cap 13 and duplicate milestone keys',()=>{const t=tree('TREE-CINDER',{provider:{kind:'cinder_milestone',maxPoints:13},sourceRef:'MUT-DEMO-CINDER'});let a=grantPoints(t,{},1,'Manifestation');assert.throws(()=>grantPoints(t,a,1,'manifestation'),/already/);assert.throws(()=>grantPoints(t,a,12,'Bulk milestone'),/exactly 1 point/);
 for(let i=1;i<=12;i++)a=grantPoints(t,a,1,`Milestone ${i}`);assert.equal(a.awarded,13);assert.throws(()=>grantPoints(t,a,1,'Beyond limit'),/13-point/);assert.equal(walletKey(t),'cinder:MUT-DEMO-CINDER');});
test('separate Cinders keep independent wallets and spending',()=>{const a=tree('TREE-CINA',{provider:{kind:'cinder_milestone',maxPoints:13},sourceRef:'MUT-ALPHA'}),b=tree('TREE-CINB',{provider:{kind:'cinder_milestone',maxPoints:13},sourceRef:'MUT-BETA'});assert.notEqual(walletKey(a),walletKey(b));let accA=purchase(a,grantPoints(a,{},1,'manifest'),'NOD-START');let accB=grantPoints(b,{},1,'first point');accB=grantPoints(b,accB,1,'second point');accB=grantPoints(b,accB,1,'third point');assert.equal(accA.awarded,1);assert.equal(accB.awarded,3);assert.equal(accB.unlocks.length,0);});
test('Profession provider is read-only and refuses XP/point grants',()=>{const t=tree('TREE-PROF',{provider:{kind:'profession',maxPoints:null},sourceRef:'PROF-ALCHEMY'});assert.equal(availability(t,{awarded:999},'NOD-START').ok,false);assert.throws(()=>grantPoints(t,{},1,'nope'),/Ledger/);});
test('duplicate tree IDs and duplicate Cinder sources fail package validation',()=>{const t=tree(),c=tree('TREE-CINDER',{provider:{kind:'cinder_milestone',maxPoints:13},sourceRef:'MUT-SAMPLE'});assert.ok(validatePackage({schema:SCHEMA,trees:[t,t]}).errors.length);assert.ok(validatePackage({schema:SCHEMA,trees:[c,{...c,id:'TREE-DUP'}]}).errors.some(e=>/Cinder wallet/.test(e)));});
test('purchased nodes cannot be removed or change dependencies',()=>{const old=tree(),a=grantPoints(old,{},1,'scene');const bought=purchase(old,a,'NOD-START');const next=tree('TREE-TEST',{nodes:old.nodes.filter(n=>n.id!=='NOD-START')});assert.ok(changedPurchasedNodes(old,next,[bought]).length);const next2=tree('TREE-TEST',{nodes:old.nodes.map(n=>n.id==='NOD-START'?{...n,cost:2}:n)});assert.ok(changedPurchasedNodes(old,next2,[bought]).length);});
test('progress normalizes duplicates and negative counts',()=>{assert.deepEqual(cleanAccount({awarded:-12,unlocks:['NOD-A','NOD-A'],revision:-1}).unlocks,['NOD-A']);assert.equal(cleanAccount({awarded:-12}).awarded,0);});

// DEC-0062/63 regression: namespace ownership is enforced on both drag and imported layout JSON.
test('typed domain-linked Features: Profession PERK and Cinder POWER; HPERK is reserved for Hirelings',()=>{
  assert.equal(allowedSourceForProvider('profession','PERK-EXAMPLE'),true);
  assert.equal(allowedSourceForProvider('profession','POWER-EXAMPLE'),false);
  assert.equal(allowedSourceForProvider('cinder_milestone','POWER-EXAMPLE'),true);
  assert.equal(allowedSourceForProvider('cinder_milestone','PERK-EXAMPLE'),false);
  assert.equal(allowedSourceForProvider('generic_points','HPERK-EXAMPLE'),false);
  const perk={relation:'unlocks_perk',target_id:'PERK-EXAMPLE',mode:'required'};
  const power={relation:'unlocks_power',target_id:'POWER-EXAMPLE',mode:'required'};
  const prof=tree('TREE-PROF-TYPED',{provider:{kind:'profession',maxPoints:null},sourceRef:'PROF-EXAMPLE',nodes:[node('NOD-PERK',{contentRef:perk})]});
  const cinder=tree('TREE-CIN-TYPED',{provider:{kind:'cinder_milestone',maxPoints:13},sourceRef:'MUT-EXAMPLE',nodes:[node('NOD-POWER',{contentRef:power})]});
  assert.deepEqual(validateTree(prof).errors,[]);
  assert.deepEqual(validateTree(cinder).errors,[]);
  assert.ok(validateTree({...prof,nodes:[node('NOD-WRONG',{contentRef:power})]}).errors.some(e=>e.includes('cannot link')));
  assert.ok(validateTree({...cinder,nodes:[node('NOD-WRONG',{contentRef:perk})]}).errors.some(e=>e.includes('cannot link')));
  assert.ok(validateTree({...prof,nodes:[node('NOD-WRONG',{contentRef:{...perk,target_id:'HPERK-EXAMPLE'}})]}).errors.length);
});
test('legacy POWER relation remains loadable but produces a migration warning',()=>{
  const t=tree('TREE-CIN-REL',{provider:{kind:'cinder_milestone',maxPoints:13},sourceRef:'MUT-EXAMPLE',nodes:[node('NOD-POWER',{contentRef:{relation:'unlocks_perk',target_id:'POWER-EXAMPLE',mode:'required'}})]});
  const validation=validateTree(t);
  assert.deepEqual(validation.errors,[]);
  assert.ok(validation.warnings.some(w=>w.includes('unlocks_power')));
});
