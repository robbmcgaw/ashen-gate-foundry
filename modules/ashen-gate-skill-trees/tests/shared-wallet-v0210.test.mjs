import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  normalizeTree,validateTree,validatePackage,publicTree,professionStatus,availability,publicAvailability,purchase,refund,overrideGrant,
  reviewCandidates,reconcile,planTreeImport,accessErrors,cleanAccess,accessText,accessBlock,sharedWalletKey,walletKey,walletGroups,groupName,memberName,sameWallet
} from '../scripts/engine.mjs';
import {treePicker,libraryGroups,libraryItems,walletLine,professionGroups} from '../scripts/groups.mjs';
// 0.21.0: several profession trees share one wallet; optional proficiency gate. Pure logic, no Foundry.
const REF='PROF-TEST-ARTISTRY';
const tree=(key,name,{ref=REF,perk=i=>`PERK-TEST-${key}-${String(i+1).padStart(2,'0')}`,levels={},access}={})=>normalizeTree({
  id:`TEST-ART-${key}`,name:`[TEST] Artistry · ${name}`,status:'approved',visibility:'player',sourceRef:ref,provider:{kind:'profession'},...(access?{access}:{}),
  nodes:Array.from({length:24},(_,i)=>({id:`NODE-${key}-${String(i+1).padStart(2,'0')}`,perkId:perk(i),x:40+(i%6)*200,y:40+Math.floor(i/6)*120,
    requiresAll:[],requiresAny:[],excludes:[],status:'approved',visibility:'player',display:'shown',...(levels[i]?{minLevel:levels[i]}:{})}))});
const MUSIC=tree('MUS','Music',{levels:{23:13}}),PERF=tree('PRF','Performance'),VIS=tree('VIS','Visual Arts'),LIT=tree('LIT','Literary Arts');
const ALL=[MUSIC,PERF,VIS,LIT];
const nodeOf=(t,i)=>t.nodes[i].id;
/** Character state: one account per tree, and the siblings list a tree sees. */
const state=()=>{const acc=new Map(ALL.map(t=>[t.id,{unlocks:[]}]));
  return {acc,sib:t=>ALL.filter(x=>x.id!==t.id).map(x=>({tree:x,account:acc.get(x.id)})),
    buy(t,i,level){acc.set(t.id,purchase(t,acc.get(t.id),nodeOf(t,i),{level,siblings:this.sib(t)}));},
    st(t,level){return professionStatus(t,acc.get(t.id),level,this.sib(t));}};};

test('four trees of one profession share 16 points: the 17th pick is refused in every tree',()=>{
  const s=state();
  for(const t of ALL)for(let i=0;i<4;i++)s.buy(t,i,16);
  for(const t of ALL){
    const st=s.st(t,16);
    assert.equal(st.earned,16);assert.equal(st.spent,16);assert.equal(st.available,0);assert.equal(st.treeSpent,4);
    assert.deepEqual(st.trees.map(x=>[x.name,x.spent]),[['[TEST] Artistry · Literary Arts',4],['[TEST] Artistry · Music',4],['[TEST] Artistry · Performance',4],['[TEST] Artistry · Visual Arts',4]]);
    const r=availability(t,s.acc.get(t.id),nodeOf(t,10),{level:16,siblings:s.sib(t)});
    assert.equal(r.ok,false);assert.equal(r.reason,'No perk points left (16 of 16 used at level 16, shared by 4 trees)');
    assert.throws(()=>s.buy(t,10,16),/No perk points left/);
  }
});
test('a pick in one tree lowers what the others have at once; a refund gives it back to all of them',()=>{
  const s=state();
  s.buy(MUSIC,0,3);s.buy(MUSIC,1,3);
  assert.equal(s.st(VIS,3).available,1);assert.equal(s.st(LIT,3).spent,2);
  s.buy(VIS,0,3);
  assert.equal(availability(PERF,s.acc.get(PERF.id),nodeOf(PERF,0),{level:3,siblings:s.sib(PERF)}).ok,false);
  s.acc.set(MUSIC.id,refund(MUSIC,s.acc.get(MUSIC.id),nodeOf(MUSIC,1)));
  assert.equal(s.st(PERF,3).available,1);
  s.buy(PERF,0,3);assert.equal(s.st(MUSIC,3).spent,3);
});
test('without siblings (or with unrelated trees) a profession tree behaves exactly as before',()=>{
  const acc={unlocks:[nodeOf(MUSIC,0),nodeOf(MUSIC,1)]};
  const other=tree('OTH','Other',{ref:'PROF-TEST-OTHER'}),cinder=normalizeTree({id:'TEST-CIN',name:'[TEST] Cinder',sourceRef:'MUT-TEST',provider:{kind:'cinder_milestone'},nodes:[]});
  const before=professionStatus(MUSIC,acc,4);
  assert.deepEqual(before,{ledger:true,level:4,earned:4,spent:2,available:2,maxPoints:16,nodeCount:24,aboveLevel:[],overSpent:0,overAllocated:false});
  assert.deepEqual(professionStatus(MUSIC,acc,4,[{tree:other,account:{unlocks:[nodeOf(other,0)]}},{tree:cinder,account:{unlocks:['x']}},{tree:MUSIC,account:acc}]),before);
  assert.deepEqual(sameWallet(MUSIC,[{tree:other,account:{}}]),[]);
  assert.equal(availability(MUSIC,acc,nodeOf(MUSIC,2),{level:2}).reason,'No perk points left (2 of 2 used at level 2)');
  assert.equal(walletKey(MUSIC),'tree:TEST-ART-MUS','storage key unchanged: no migration');
  assert.equal(sharedWalletKey(MUSIC),'profession:PROF-TEST-ARTISTRY');assert.equal(sharedWalletKey(cinder),'cinder:MUT-TEST');
});
test('a lower level over-allocates the whole profession: every tree waits on review, keep counts across trees',()=>{
  const s=state();
  s.buy(MUSIC,0,5);s.buy(MUSIC,1,5);s.buy(PERF,0,5);s.buy(VIS,0,5);
  for(const t of ALL){const st=s.st(t,3);assert.equal(st.overSpent,1);assert.equal(st.overAllocated,true);}
  assert.match(availability(LIT,s.acc.get(LIT.id),nodeOf(LIT,0),{level:3,siblings:s.sib(LIT)}).reason,/Waiting on GM review/);
  assert.equal(reconcile(LIT,s.acc.get(LIT.id),{level:3,siblings:s.sib(LIT)}).issues[0].detail,'4 points used across 4 trees of this profession; level 3 gives 3.');
  // Review rows come from every tree that has picks.
  const rows=ALL.flatMap(t=>reviewCandidates(t,s.acc.get(t.id),3,s.sib(t)).map(r=>r.nodeId));
  assert.equal(rows.length,4);
  // Keeping one pick in Performance clears the flag for all four.
  const p=s.acc.get(PERF.id);s.acc.set(PERF.id,{...p,kept:{[nodeOf(PERF,0)]:{level:3,at:1,by:'gm',reason:'[TEST]'}}});
  for(const t of ALL)assert.equal(s.st(t,3).overAllocated,false);
});
test('a perk above the level in one tree blocks picks in the others and is named there',()=>{
  const s=state();
  s.acc.set(MUSIC.id,{unlocks:[nodeOf(MUSIC,23)]});
  const st=s.st(VIS,7);
  assert.equal(st.overAllocated,true);assert.deepEqual(st.aboveLevel,[]);
  assert.deepEqual(st.otherAboveLevel.map(x=>[x.treeId,x.nodeId,x.threshold]),[['TEST-ART-MUS','NODE-MUS-24',13]]);
  assert.match(availability(VIS,s.acc.get(VIS.id),nodeOf(VIS,0),{level:7,siblings:s.sib(VIS)}).reason,/Waiting on GM review/);
  assert.deepEqual(reviewCandidates(MUSIC,s.acc.get(MUSIC.id),7,s.sib(MUSIC)).map(r=>r.nodeId),['NODE-MUS-24']);
  assert.equal(s.st(VIS,13).overAllocated,false);
});
test('GM override across trees reports the shared wallet and is kept, so nothing needs review',()=>{
  const s=state();s.buy(MUSIC,0,2);s.buy(PERF,0,2);
  const {account,overridden}=overrideGrant(VIS,s.acc.get(VIS.id),nodeOf(VIS,0),{level:2,reason:'[TEST] story',siblings:s.sib(VIS)});
  assert.deepEqual(overridden,['No perk points left (2 of 2 used at level 2, shared by 4 trees)']);
  s.acc.set(VIS.id,account);
  assert.equal(s.st(LIT,2).spent,3);assert.equal(s.st(LIT,2).overAllocated,false,'the GM grant is kept at level 2');
});
test('validation: trees may share a profession; one perk on two of its trees is an error; the Cinder rule stays',()=>{
  assert.deepEqual(validatePackage({schema:'ag-skill-trees/0.3',trees:ALL}).errors,[]);
  const twin=tree('TWN','Twin',{perk:i=>i===5?'PERK-TEST-MUS-03':`PERK-TEST-TWN-${String(i+1).padStart(2,'0')}`});
  assert.deepEqual(validatePackage({schema:'ag-skill-trees/0.3',trees:[MUSIC,twin]}).errors,
    ['PERK-TEST-MUS-03 is on two PROF-TEST-ARTISTRY trees (TEST-ART-MUS and TEST-ART-TWN); put shared perks in one tree']);
  const elsewhere=tree('ELS','Elsewhere',{ref:'PROF-TEST-OTHER',perk:i=>`PERK-TEST-MUS-${String(i+1).padStart(2,'0')}`});
  assert.deepEqual(validatePackage({schema:'ag-skill-trees/0.3',trees:[MUSIC,elsewhere]}).errors,[],'other professions may reuse a perk (as before)');
  const cinder=id=>({id,name:`[TEST] ${id}`,status:'approved',visibility:'player',sourceRef:'MUT-TEST',provider:{kind:'cinder_milestone'},nodes:[]});
  assert.deepEqual(validatePackage({schema:'ag-skill-trees/0.3',trees:[cinder('TEST-CIN-A'),cinder('TEST-CIN-B')]}).errors,['Duplicate Cinder wallet source MUT-TEST']);
  assert.ok(validateTree(tree('SHORT','Short')).warnings.length===0,'24 nodes per tree still the rule, per tree');
});
test('import preview checks the shared-perk rule against the trees already in the world',()=>{
  const twin=tree('TWN','Twin',{perk:i=>i===5?'PERK-TEST-MUS-03':`PERK-TEST-TWN-${String(i+1).padStart(2,'0')}`});
  const plan=planTreeImport({schema:'ag-skill-trees/0.3',trees:[twin]},ALL);
  assert.deepEqual(plan.apply,[]);assert.match(plan.errors[0],/PERK-TEST-MUS-03 is on two PROF-TEST-ARTISTRY trees/);
  // Re-importing the four trees themselves (update) is fine: a tree never collides with its own old copy.
  assert.deepEqual(planTreeImport({schema:'ag-skill-trees/0.3',trees:ALL},ALL,{mode:'update'}).errors,[]);
  assert.deepEqual(planTreeImport({schema:'ag-skill-trees/0.3',trees:[VIS]},[MUSIC,PERF]).errors,[]);
});
test('shipped tree files raise no new shared-perk error',async()=>{
  const files=['../data/demo-trees.json','../data/template-16-levels.json','../data/sample-sandbox-import-v02.json','../../../test-fixtures/playtest/AG_Playtest_SkillTrees_0.6.1.json','../../../test-fixtures/cinder/AG_Test_Cinder_Tree.json'];
  for(const f of files){
    const pack=JSON.parse(await fs.readFile(new URL(f,import.meta.url),'utf8'));
    assert.ok(!validatePackage(pack).errors.some(e=>/shared perks|access/.test(e)),f);
  }
});
test('access gate: schema, cleaning, text, and the player-only block',()=>{
  assert.deepEqual(accessErrors(undefined),[]);
  assert.deepEqual(accessErrors({toolProficienciesAnyOf:['calligrapher'],skillProficienciesAnyOf:['prf'],note:'[TEST] note'}),[]);
  assert.deepEqual(accessErrors('tools'),['access must be an object']);
  assert.deepEqual(accessErrors({toolProficiencyAnyOf:['x']}),['access: unknown field toolProficiencyAnyOf']);
  assert.deepEqual(accessErrors({toolProficienciesAnyOf:'x'}),['access: toolProficienciesAnyOf must be a list of up to 40 names']);
  assert.deepEqual(accessErrors({note:'only a note'}),['access needs at least one tool or skill proficiency']);
  assert.match(validateTree({...MUSIC,access:{skills:['prf']}}).errors.join(),/unknown field skills/);
  assert.deepEqual(validateTree({...MUSIC,access:{skillProficienciesAnyOf:['prf']}}).errors,[]);
  assert.deepEqual(cleanAccess({toolProficienciesAnyOf:[' a ','a',''],note:' n '}),{toolProficienciesAnyOf:['a'],note:'n'});
  assert.equal(normalizeTree({...MUSIC,access:{note:'x'}}).access,undefined,'an empty gate is dropped');
  const labels={tool:{calligrapher:"Calligrapher's Supplies"},skill:{prf:'Performance'}};
  const gated=tree('GAT','Gated',{access:{toolProficienciesAnyOf:['calligrapher'],skillProficienciesAnyOf:['prf']}});
  const label=(k,x)=>labels[k][x]??x;
  assert.equal(accessText(gated.access,label),"Needs Calligrapher's Supplies or Performance proficiency");
  assert.equal(accessText({toolProficienciesAnyOf:['A','B','C']}),'Needs A, B or C proficiency');
  assert.equal(accessBlock(gated,null),null,'no Ledger answer: no gate');
  assert.equal(accessBlock(gated,{ok:true,matched:['prf']}),null);
  assert.equal(accessBlock(MUSIC,{ok:false}),null,'a tree without a gate never blocks');
  const acc={unlocks:[]};
  const r=availability(gated,acc,nodeOf(gated,0),{level:4,access:{ok:false,matched:[]},accessLabel:label});
  assert.deepEqual(r,{ok:false,reason:"Needs Calligrapher's Supplies or Performance proficiency",access:true});
  assert.equal(availability(gated,acc,nodeOf(gated,0),{level:4}).ok,true,'GM path passes no answer: never blocked');
  assert.throws(()=>purchase(gated,acc,nodeOf(gated,0),{level:4,access:{ok:false}}),/proficiency/);
  const pub=publicTree(gated);
  assert.deepEqual(pub.access,{toolProficienciesAnyOf:['calligrapher'],skillProficienciesAnyOf:['prf']},'players see the requirement');
  assert.equal(pub.nodes.length,24,'a gated tree stays browsable');
  assert.match(publicAvailability(pub,acc,pub.nodes[0].id,{level:4,access:{ok:false}}).reason,/^Needs calligrapher or prf proficiency$/);
  assert.equal(publicAvailability(pub,acc,pub.nodes[0].id,{level:4,access:{ok:true,matched:['prf']}}).ok,true);
});
test('grouping: one picker entry per profession with sub-tabs, Library groups with the wallet once',()=>{
  const herb=normalizeTree({id:'TEST-HERB',name:'[TEST] Herbalism',sourceRef:'PROF-TEST-HERB',provider:{kind:'profession'},nodes:[]});
  const gen=normalizeTree({id:'TEST-GEN',name:'[TEST] Generic',provider:{kind:'generic_points',maxPoints:5},nodes:[]});
  const trees=[gen,MUSIC,herb,PERF,VIS,LIT];
  assert.deepEqual(walletGroups(trees).map(g=>[g.key,g.trees.length]),[['tree:TEST-GEN',1],['profession:PROF-TEST-ARTISTRY',4],['profession:PROF-TEST-HERB',1]]);
  assert.equal(groupName(ALL),'[TEST] Artistry');assert.equal(memberName(MUSIC,'[TEST] Artistry'),'Music');
  assert.equal(groupName([MUSIC,{name:'Unrelated'}]),'[TEST] Artistry · Music','no shared head: the first name');
  let p=treePicker(trees,'TEST-ART-VIS');
  assert.deepEqual(p.options.map(o=>[o.value,o.label,o.selected]),[['TEST-GEN','[TEST] Generic',false],['TEST-ART-VIS','[TEST] Artistry (4 trees)',true],['TEST-HERB','[TEST] Herbalism',false]]);
  assert.deepEqual(p.tabs.tabs.map(t=>t.label),['Literary Arts','Music','Performance','Visual Arts']);assert.equal(p.tabs.selected,'TEST-ART-VIS');
  p=treePicker(trees,'TEST-GEN',ref=>ref===REF?'TEST-ART-PRF':null);
  assert.equal(p.tabs,null);assert.equal(p.options[1].value,'TEST-ART-PRF','the tree last open in that profession');
  assert.equal(treePicker(trees,'TEST-GEN',()=>'GONE').options[1].value,'TEST-ART-LIT','a forgotten tree falls back to the first');
  const rows=trees.map(t=>({id:t.id,name:t.name}));
  const groups=libraryGroups(rows,trees,g=>walletLine('[TEST] Hero',{earned:16,spent:5,level:16})+` · ${g.trees.length}`);
  assert.deepEqual(groups.map(g=>[g.multi,g.name,g.rows.length]),[[false,'[TEST] Generic',1],[true,'[TEST] Artistry',4],[false,'[TEST] Herbalism',1]].sort((a,b)=>a[1].localeCompare(b[1])));
  const items=libraryItems(groups);
  assert.equal(items.filter(i=>i.head).length,1,'one heading: the profession with several trees');
  assert.equal(items.find(i=>i.head).head.walletText,'[TEST] Hero: 5 of 16 points used at level 16 · 4');
  assert.ok(items.filter(i=>i.group==='profession:PROF-TEST-ARTISTRY').length===4);
  assert.equal(walletLine('[TEST] Artistry',{earned:null,spent:2}),'[TEST] Artistry: 2 points used (Profession Ledger not active)');
  assert.deepEqual(professionGroups([herb]).map(g=>g.multi),[false]);
});
