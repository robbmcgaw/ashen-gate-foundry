import test from 'node:test';import assert from 'node:assert/strict';
// 0.21.0 shared profession wallet and proficiency gate through the module API. Mocked Foundry, a stand-in Profession Ledger
// (levels + meetsProficiency) and a fake element: proves the GM-side checks, writes and view data, not the live Foundry UI.
class FakeApplication {static DEFAULT_OPTIONS={};constructor(){this.rendered=false;}render(){this.rendered=true;return this;}async _prepareContext(){return {};}async _onRender(){}}
const oneTime=new Map(),hooks=new Map(),saved=new Map(),socketHandlers=[],emitted=[],chats=[];
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
globalThis.Hooks={once:(e,fn)=>oneTime.set(e,fn),on:(e,fn)=>hooks.set(e,fn),callAll:()=>{}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{}}},utils:{escapeHTML,randomID:()=>Math.random().toString(36).slice(2)}};
globalThis.ChatMessage={create:async m=>{chats.push(m);return m;}};
globalThis.CSS={escape:v=>String(v)};
globalThis.CONFIG={DND5E:{skills:{prf:{label:'Performance'}}}};
const MOD='ashen-gate-skill-trees',ART='PROF-TEST-ARTISTRY',HERB='PROF-TEST-HERB';
const pad=i=>String(i+1).padStart(2,'0');
const mkTree=(key,name,ref,extra={})=>({id:`TEST-${key}`,name,description:'',status:'approved',visibility:'player',sourceRef:ref,provider:{kind:'profession',maxPoints:null},...extra,
  nodes:Array.from({length:24},(_,i)=>({id:`NODE-${key}-${pad(i)}`,perkId:`PERK-TEST-${key}-${pad(i)}`,x:40+(i%6)*200,y:40+Math.floor(i/6)*120,
    requiresAll:[],requiresAny:[],excludes:[],status:'approved',visibility:'player',display:'shown'}))});
const KEYS=['MUS','PRF','VIS','LIT'],NAMES={MUS:'Music',PRF:'Performance',VIS:'Visual Arts',LIT:'Literary Arts'};
const art=KEYS.map(k=>mkTree(k,`[TEST] Artistry · ${NAMES[k]}`,ART,k==='LIT'?{access:{toolProficienciesAnyOf:['calligrapher'],skillProficienciesAnyOf:['prf']}}:{}));
const herb=mkTree('HRB','[TEST] Herbalism Tree',HERB);
const trees=[...art,herb];
const journal={flags:{[MOD]:{privateStore:true,payload:{schema:'ag-skill-trees/0.3',trees}}},async setFlag(m,k,v){this.flags[m][k]=v;}};
// The last node of every tree is a master perk (level 13); the rest are apprentice.
const perks=trees.flatMap(t=>t.nodes.map((n,i)=>({id:`W-${n.perkId}`,uuid:`Item.W-${n.perkId}`,documentName:'Item',type:'feat',name:`[TEST] ${n.perkId.slice(10)}`,img:null,
  system:{description:{value:''}},testUserPermission:()=>true,
  flags:{'ashen-gate-manager':{source:{sourceId:n.perkId,entityType:'ProfessionPerk',status:'approved',visibility:'player',definition:{id:n.perkId,tier:i===23?'master':'apprentice'}}}},
  toObject(){return structuredClone({_id:this.id,name:this.name,type:this.type,img:this.img,system:this.system,flags:this.flags});}})));
const gm={id:'gm',isGM:true,name:'GM'},player={id:'player1',isGM:false,name:'P1'},stranger={id:'stranger',isGM:false,name:'S'};
function makeActor(id){
  const actor={id,name:`[TEST] ${id}`,type:'character',get isOwner(){return game.user.isGM||game.user.id==='player1';},flags:{},items:[],
    testUserPermission:(u,level)=>u.isGM||(['OWNER','OBSERVER'].includes(level)&&u.id==='player1'),
    async setFlag(m,k,v){this.flags[m]??={};this.flags[m][k]=structuredClone(v);},
    async createEmbeddedDocuments(_t,data){const docs=data.map(d=>{const doc={...structuredClone(d),id:`EMB${Math.random()}`,parent:actor,
      toObject(){const {toObject,delete:_d,parent,...rest}=this;return structuredClone(rest);},async delete(){actor.items=actor.items.filter(x=>x!==doc);}};return doc;});
      actor.items.push(...docs);return docs;}};
  return actor;
}
const levels=new Map(),proficient=new Map(),calls=[];
const ledger={id:'ashen-gate-profession-ledger',active:true,api:{progression:{contract:'ag-ledger-progression/1',
  level:(actor,profId)=>levels.has(`${actor.id}|${profId}`)?{profId,xp:0,level:levels.get(`${actor.id}|${profId}`),tier:'Apprentice'}:null},
  meetsProficiency:(actorId,access)=>{calls.push([actorId,access]);const have=proficient.get(actorId)??[];
    const matched=[...(access.toolProficienciesAnyOf??[]),...(access.skillProficienciesAnyOf??[])].filter(x=>have.includes(x));return {ok:matched.length>0,matched};}}};
globalThis.game={modules:new Map([[MOD,{id:MOD,active:true}],['ashen-gate-profession-ledger',ledger]]),
  settings:{register:()=>{},registerMenu:()=>{},get:(_m,k)=>saved.get(k)??(k==='playerAccessEnabled'?true:undefined),set:async(_m,k,v)=>{saved.set(k,v);return v;}},
  journal:{contents:[journal]},items:{contents:perks},
  actors:{contents:[],get(id){return this.contents.find(a=>a.id===id)??null;}},
  user:gm,users:{contents:[gm,player],get:id=>[gm,player].find(u=>u.id===id),activeGM:gm},
  socket:{on:(_n,fn)=>socketHandlers.push(fn),emit:(_n,msg)=>emitted.push(msg)}};
globalThis.ui={actors:null,notifications:{info:()=>{},error:()=>{},warn:()=>{}}};
await import('../scripts/main.js');
oneTime.get('init')();oneTime.get('ready')();
const api=game.modules.get(MOD).api;
await api.publish();
const acc=(a,key)=>a.flags[MOD]?.progressV2?.[`tree:TEST-${key}`]??{unlocks:[],history:[]};
const fresh=(id,{art:la,herb:lh}={})=>{const a=makeActor(id);game.actors.contents.push(a);if(la!=null)levels.set(`${id}|${ART}`,la);if(lh!=null)levels.set(`${id}|${HERB}`,lh);return a;};
const node=(key,i)=>`NODE-${key}-${pad(i)}`;
const ask=async(a,key,i)=>{await socketHandlers[0]({type:'unlock-request',requestId:`r${Math.random()}`,userId:'player1',actorId:a.id,treeId:`TEST-${key}`,nodeId:node(key,i)},'player1');return emitted.at(-1);};

test('players spend one 16-point wallet across the four trees; the 17th pick is refused in any of them',async()=>{
  const a=fresh('SA',{art:16});proficient.set('SA',['prf']);
  for(const k of KEYS)for(let i=0;i<4;i++)assert.equal((await ask(a,k,i)).ok,true,`${k} ${i}`);
  assert.equal(a.items.length,16);
  for(const k of KEYS){const r=await ask(a,k,10);assert.equal(r.ok,false);assert.match(r.message,/No perk points left \(16 of 16 used at level 16, shared by 4 trees\)/);}
  assert.deepEqual(api.professionWallet('SA',ART),{sourceRef:ART,level:16,earned:16,spent:16,available:0,overSpent:0,overAllocated:false,
    trees:[{id:'TEST-LIT',name:'[TEST] Artistry · Literary Arts',spent:4},{id:'TEST-MUS',name:'[TEST] Artistry · Music',spent:4},{id:'TEST-PRF',name:'[TEST] Artistry · Performance',spent:4},{id:'TEST-VIS',name:'[TEST] Artistry · Visual Arts',spent:4}]});
});
test('GM unlock, refund, override and undo all use the shared total',async()=>{
  const a=fresh('SB',{art:3});
  for(const [k,i] of [['MUS',0],['PRF',0],['VIS',0]])await api.unlock(a,`TEST-${k}`,node(k,i));
  await assert.rejects(()=>api.unlock(a,'TEST-LIT',node('LIT',0)),/No perk points left \(3 of 3 used at level 3, shared by 4 trees\)/);
  await api.refund(a,'TEST-PRF',node('PRF',0),{reason:'[TEST] swap'});
  assert.equal(api.professionWallet('SB',ART).available,1);
  await api.unlock(a,'TEST-LIT',node('LIT',0)); // the GM is never blocked by the proficiency gate
  assert.equal(api.professionWallet('SB',ART).available,0);
  // Undo the Performance removal: the perk comes back and the profession is over by one (flagged, nothing removed).
  const removal=acc(a,'PRF').history.find(h=>h.kind==='remove');
  await api.undo(a,'TEST-PRF',removal.id);
  let w=api.professionWallet('SB',ART);assert.equal(w.spent,4);assert.equal(w.overSpent,1);assert.equal(w.overAllocated,true);
  assert.match(api.reconcileProfessions().find(r=>r.actorId==='SB'&&r.treeId==='TEST-VIS').issues[0].detail,/4 points used across 4 trees/);
  // GM override in a fifth slot names the shared rule it overrides, and is kept, so it adds no review.
  const r=await api.overrideGrant(a,'TEST-MUS',node('MUS',1),{reason:'[TEST] story'});
  assert.match(r.overridden[0],/Waiting on GM review/);
  // Keep the Performance pick: the over-allocation clears for every tree.
  await api.keep(a,'TEST-PRF',node('PRF',0),{reason:'[TEST] grandfathered'});
  w=api.professionWallet('SB',ART);assert.equal(w.overAllocated,false);assert.equal(w.spent,5);
  assert.equal(api.professionReport(a,ART,{}).overAllocated,false);
});
test('a lower Ledger level flags the whole profession once (one GM note), and review covers every tree',async()=>{
  const a=fresh('SC',{art:6});proficient.set('SC',['calligrapher']);
  for(const [k,i] of [['MUS',0],['MUS',1],['PRF',0],['VIS',0],['LIT',0],['LIT',1]])assert.equal((await ask(a,k,i)).ok,true);
  chats.length=0;levels.set(`SC|${ART}`,4);
  await hooks.get('ashenGateLedger.progressionChanged')({actorId:'SC',profId:ART,previousLevel:6,level:4});
  assert.equal(chats.length,1,'one note for the profession, not one per tree');
  assert.match(chats[0].content,/needs review in <strong>\[TEST\] Artistry<\/strong>: level 4 no longer covers 2 points used/);
  for(const k of KEYS)assert.match((await ask(a,k,5)).message,/Waiting on GM review/);
  const rep=api.professionReport(a,ART,{});
  assert.equal(rep.spent,6);assert.equal(rep.overSpent,2);assert.equal(rep.trees.length,4);
  // Remove one pick in two different trees: back within the wallet.
  await api.resolve(a,'TEST-MUS',{remove:[node('MUS',1)],keep:[]});
  await api.resolve(a,'TEST-LIT',{remove:[node('LIT',1)],keep:[]});
  assert.equal(api.professionWallet('SC',ART).overAllocated,false);assert.equal(a.items.length,4);
  // Level up: one owner note for the profession.
  chats.length=0;levels.set(`SC|${ART}`,7);
  await hooks.get('ashenGateLedger.progressionChanged')({actorId:'SC',profId:ART,previousLevel:4,level:7});
  assert.equal(chats.length,1);assert.match(chats[0].content,/3 perks to choose in <strong>\[TEST\] Artistry<\/strong> \(level 7; 3 points to spend across 4 trees\)/);
});
test('single-tree profession: unchanged numbers, report and summary rows (regression)',async()=>{
  const a=fresh('SD',{herb:2});
  assert.equal((await ask(a,'HRB',0)).ok,true);assert.equal((await ask(a,'HRB',1)).ok,true);
  assert.match((await ask(a,'HRB',2)).message,/No perk points left \(2 of 2 used at level 2\)$/);
  assert.deepEqual(api.professionReport(a,HERB,{}),{treeId:'TEST-HRB',treeName:'[TEST] Herbalism Tree',level:2,earned:2,spent:2,nodesAboveLevel:[],overSpent:0,overAllocated:false});
  const rows=api.pointsSummary(a);
  assert.deepEqual(rows.find(r=>r.treeId==='TEST-HRB'),{treeId:'TEST-HRB',name:'[TEST] Herbalism Tree',kind:'profession',level:2,earned:2,spent:2,available:0});
  assert.deepEqual(api.professionWallet('SD',HERB).trees,[{id:'TEST-HRB',name:'[TEST] Herbalism Tree',spent:2}]);
});
test('pointsSummary rows of a shared profession carry the wallet (count it once)',async()=>{
  const a=fresh('SE',{art:5});await api.unlock(a,'TEST-MUS',node('MUS',0));await api.unlock(a,'TEST-VIS',node('VIS',0));
  const rows=api.pointsSummary(a).filter(r=>r.sourceRef===ART);
  assert.equal(rows.length,4);
  for(const r of rows){assert.equal(r.spent,2);assert.equal(r.available,3);assert.equal(r.wallet,'profession:PROF-TEST-ARTISTRY');assert.equal(r.walletTrees.length,4);}
  assert.deepEqual(rows.map(r=>[r.treeId,r.treeSpent]).sort(),[['TEST-LIT',0],['TEST-MUS',1],['TEST-PRF',0],['TEST-VIS',1]]);
});
test('proficiency gate: player blocked with the reason, unblocked by a match; a missing Ledger check never blocks',async()=>{
  const a=fresh('SF',{art:4});proficient.set('SF',[]);calls.length=0;
  const r=await ask(a,'LIT',0);assert.equal(r.ok,false);assert.equal(r.message,'Needs calligrapher or Performance proficiency');
  assert.deepEqual(calls[0],['SF',{toolProficienciesAnyOf:['calligrapher'],skillProficienciesAnyOf:['prf']}],'the Ledger is asked with the actor id and the access object');
  assert.equal((await ask(a,'MUS',0)).ok,true,'trees without a gate are not checked');
  proficient.set('SF',['prf']);assert.equal((await ask(a,'LIT',0)).ok,true);
  // Ledger without meetsProficiency: no gate.
  const fn=ledger.api.meetsProficiency;delete ledger.api.meetsProficiency;proficient.set('SF',[]);
  try{assert.equal((await ask(a,'LIT',1)).ok,true);}finally{ledger.api.meetsProficiency=fn;}
  // An answer that is not {ok:boolean} counts as no answer; an async answer is awaited.
  ledger.api.meetsProficiency=()=>'yes';try{assert.equal((await ask(a,'LIT',2)).ok,true);}finally{ledger.api.meetsProficiency=fn;}
  ledger.api.meetsProficiency=async()=>({ok:false,matched:[]});try{assert.match((await ask(a,'LIT',3)).message,/^Needs calligrapher/);}finally{ledger.api.meetsProficiency=fn;}
  // The GM can still unlock and grant on the gated tree.
  await api.overrideGrant(a,'TEST-LIT',node('LIT',4),{reason:'[TEST] mentor'});
  assert.ok(acc(a,'LIT').unlocks.includes(node('LIT',4)));
});
test('API: listTreesForProfession and professionWallet keep the player rules',async()=>{
  const a=fresh('SG',{art:2});
  assert.deepEqual(api.listTreesForProfession(ART).map(t=>t.id),['TEST-LIT','TEST-MUS','TEST-PRF','TEST-VIS']);
  assert.deepEqual(api.listTreesForProfession('PROF-TEST-NONE'),[]);
  assert.equal(api.listTreesForProfession(ART)[0].nodes[0].perkId,'PERK-TEST-LIT-01','GM: the private trees');
  game.user=player;
  try{
    const pub=api.listTreesForProfession(ART);
    assert.equal(pub.length,4);assert.ok(!JSON.stringify(pub).includes('PERK-TEST'),'players get the published projection');
    assert.deepEqual(pub.find(t=>t.id==='TEST-LIT').access,{toolProficienciesAnyOf:['calligrapher'],skillProficienciesAnyOf:['prf']});
    assert.equal(api.professionWallet('SG',ART).earned,2);
    game.user=stranger;assert.throws(()=>api.professionWallet('SG',ART),/Actor access denied/);
    assert.throws(()=>api.professionWallet('NOPE',ART),/No Actor/);
  }finally{game.user=gm;}
  assert.equal(api.professionWallet('SG','PROF-TEST-NONE'),null);
});
test('embed: one entry per profession with tree sub-tabs and the shared wallet; data groups the trees',async()=>{
  const a=fresh('SH',{art:5,herb:1});proficient.set('SH',[]);await api.unlock(a,'TEST-MUS',node('MUS',0));
  const groups=api.embed.data('SH');
  const artG=groups.find(g=>g.sourceRef===ART);
  assert.equal(artG.shared,true);assert.equal(artG.name,'[TEST] Artistry');assert.equal(artG.available,4);assert.equal(artG.spent,1);
  assert.deepEqual(artG.trees.map(t=>[t.label,t.treeSpent]),[['Literary Arts',0],['Music',1],['Performance',0],['Visual Arts',0]]);
  const one=groups.find(g=>g.sourceRef===HERB);assert.equal(one.shared,false);assert.equal(one.trees.length,1);
  assert.equal(one.trees[0].treeSpent,undefined,'single trees keep the 0.14.0 model fields');
  const listeners={};const el={innerHTML:'',classList:{add(){},remove(){}},isConnected:true,addEventListener:(t,fn)=>{listeners[t]=fn;},contains:()=>true};
  game.user=player;
  try{
    api.embed.mount(el,{actorId:'SH'});
    assert.equal((el.innerHTML.match(/agst-embed__profession/g)??[]).length,1,'one Artistry entry, not four');
    assert.match(el.innerHTML,/<summary><strong>\[TEST\] Artistry<\/strong><span class="ag-badge ag-badge--accent">4 points to spend<\/span><span class="agst-embed__muted">1 of 5 spent · level 5<\/span><\/summary>/);
    assert.match(el.innerHTML,/role="tablist" aria-label="\[TEST\] Artistry trees"/);
    assert.equal((el.innerHTML.match(/role="tabpanel"/g)??[]).length,4);
    assert.match(el.innerHTML,/Needs calligrapher or Performance proficiency/,'the gate shows on the gated tree');
    assert.doesNotMatch(el.innerHTML,/data-agst-embed="unlock" data-tree="TEST-LIT"/,'no Unlock on a tree the player cannot use');
    assert.match(el.innerHTML,/data-agst-embed="unlock" data-tree="TEST-PRF"/);
  }finally{game.user=gm;}
});
test('window: the tree picker shows Artistry once with sub-tabs; the Character panel shows the shared wallet',async()=>{
  const a=fresh('SI',{art:4});await api.unlock(a,'TEST-PRF',node('PRF',0));
  const app=api.open({treeId:'TEST-VIS',actorId:'SI'});
  const ctx=await app._prepareContext({});
  assert.deepEqual(ctx.trees.map(o=>o.label),['[TEST] Artistry (4 trees)','[TEST] Herbalism Tree']);
  assert.equal(ctx.trees[0].selected,true);
  assert.match(ctx.treeTabs,/class="ag-tabs ag-tabs--sub" role="tablist" aria-label="\[TEST\] Artistry trees"/);
  assert.deepEqual([...ctx.treeTabs.matchAll(/data-tab="([^"]+)"[^>]*>([^<]+)</g)].map(m=>[m[1],m[2]]),
    [['TEST-LIT','Literary Arts'],['TEST-MUS','Music'],['TEST-PRF','Performance'],['TEST-VIS','Visual Arts']]);
  assert.match(ctx.treeTabs,/data-tab="TEST-VIS"[^>]*aria-selected="true"/);
  assert.match(ctx.treePanel,/role="tabpanel"/);
  assert.equal(ctx.prof.spent,1);assert.equal(ctx.prof.available,3);
  assert.equal(ctx.prof.sharedText,'Shared by 4 trees of this profession. Points used: Literary Arts 0 · Music 0 · Performance 1 · Visual Arts 0');
  app.treeId='TEST-LIT';app.nodeId=node('LIT',0);
  let c=await app._prepareContext({});
  assert.equal(c.accessGate.text,'Needs calligrapher or Performance proficiency');assert.equal(c.accessGate.gmNote,true);
  assert.equal(c.canBuy,true,'GM is not blocked by the gate');
  // Tree Library: one Artistry heading with the wallet line for the picked character.
  app.activeTab='library';
  c=await app._prepareContext({});
  const heads=c.libraryList.filter(i=>i.head);
  assert.equal(heads.length,1);assert.equal(heads[0].head.name,'[TEST] Artistry');
  assert.equal(heads[0].head.walletText,'Shared wallet (1 point per profession level, 16 at most, shared by 4 trees). [TEST] SI: 1 of 4 points used at level 4.');
  assert.equal(c.libraryList.filter(i=>i.group===heads[0].head.key).length,4);
  app.activeTab='trees';
});
test('validation on save: one perk on two Artistry trees is refused',async()=>{
  const twin=structuredClone(art[1]);twin.nodes[0].perkId=art[0].nodes[0].perkId;
  const before=structuredClone(journal.flags[MOD].payload);
  await assert.rejects(()=>api.importTrees({schema:'ag-skill-trees/0.3',trees:[twin]},{mode:'update'}).then(r=>{if(r.failed.length)throw Error(r.failed[0].reason);}),/put shared perks in one tree/);
  assert.deepEqual(journal.flags[MOD].payload,before,'nothing was saved');
});
