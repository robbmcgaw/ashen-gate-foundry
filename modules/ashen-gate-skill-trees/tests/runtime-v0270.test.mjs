import test from 'node:test';import assert from 'node:assert/strict';
// 0.27.0 runtime with mocked Foundry, a stand-in Profession Ledger and Cinders, and a Test player (Manager's list, Player Access OFF).
// Proves tabs, open(), the proficiency gate, the selected-perk panel model, treeVisibility and the Hub embed. It does not prove the live Forge window.
class FakeApplication {static DEFAULT_OPTIONS={};constructor(){this.rendered=false;}render(){this.rendered=true;return this;}async _prepareContext(){return {};}async _onRender(){}async close(){return this;}}
const oneTime=new Map(),saved=new Map(),socketHandlers=[],emitted=[];
globalThis.Hooks={once:(e,fn)=>oneTime.set(e,fn),on:()=>{},callAll:()=>{}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{confirm:async()=>true}}},utils:{escapeHTML:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),randomID:()=>Math.random().toString(36).slice(2)}};
globalThis.CSS={escape:v=>String(v)};
const MOD='ashen-gate-skill-trees',ART='PROF-T-ART',MUT='MUT-T-EMBER';
const node=(id,perk,o={})=>({id,perkId:perk,cost:1,x:40,y:40,requiresAll:[],requiresAny:[],excludes:[],status:'approved',visibility:'player',display:'shown',...o});
const profTree=(id,name,o={})=>({id,name,description:'',status:'approved',visibility:'player',sourceRef:ART,provider:{kind:'profession',maxPoints:null},...o,
  nodes:[node(`${id}-A`,`PERK-T-${id}-A`),node(`${id}-B`,`PERK-T-${id}-B`,{requiresAll:[`${id}-A`],x:240}),node(`${id}-C`,`PERK-T-${id}-C`,{requiresAny:[[`${id}-A`,`${id}-B`]],x:440})]});
const trees=[
  profTree('ART-MUS','[TEST] Artistry · Music'),
  profTree('ART-VIS','[TEST] Artistry · Visual Arts',{access:{toolProficienciesAnyOf:['painter']}}),
  profTree('ART-LIT','[TEST] Artistry · Literary Arts',{access:{toolProficienciesAnyOf:['calligrapher']}}),
  {id:'CIN-1',name:'[TEST] Ember Cinder',description:'',status:'approved',visibility:'player',sourceRef:MUT,provider:{kind:'cinder_milestone',maxPoints:16},
    nodes:[node('CIN-1-A','POWER-T-CIN-A'),node('CIN-1-B','POWER-T-CIN-B',{requiresAll:['CIN-1-A'],x:240})]},
  {id:'GEN-1',name:'[TEST] Generic',description:'',status:'approved',visibility:'player',sourceRef:null,provider:{kind:'generic_points',maxPoints:10},nodes:[node('GEN-1-A','PERK-T-GEN-A')]}];
const allNodes=trees.flatMap(t=>t.nodes);
const journal={flags:{[MOD]:{privateStore:true,payload:{schema:'ag-skill-trees/0.3',trees}}},async setFlag(m,k,v){this.flags[m][k]=v;}};
const html=name=>`<table><tr><th>Profession / Tree</th><td>Artistry</td></tr><tr><th>Tier</th><td>Apprentice (level 1)</td></tr><tr><th>Tool</th><td>Painter's Supplies</td></tr></table><h2>Effect &amp; Rules</h2><p>${name} first sentence. Second sentence.</p><h2>Notes</h2><p>A [TEST] note.</p>`;
const sheets=[];
const worldPerk=n=>({id:`W-${n.perkId}`,uuid:`Item.W-${n.perkId}`,documentName:'Item',type:'feat',name:`[TEST] ${n.id}`,img:null,ownership:{default:2},sheet:{render:f=>sheets.push([n.perkId,f])},
  system:{description:{value:html(n.id)}},testUserPermission:()=>true,
  flags:{'ashen-gate-manager':{source:{sourceId:n.perkId,entityType:n.perkId.startsWith('POWER')?'Power':'ProfessionPerk',status:'approved',visibility:'player',definition:{id:n.perkId,point_cost:1,tier:'apprentice'}}}},
  toObject(){return structuredClone({_id:this.id,name:this.name,type:this.type,img:this.img,system:this.system,flags:this.flags});}});
const gm={id:'gm',isGM:true,name:'GM'},tester={id:'u-test',isGM:false,name:'Tester'},real={id:'u-real',isGM:false,name:'Real'};
const mkActor=(id,name,owner,{cinders}={})=>{const actor={id,name,documentName:'Actor',type:'character',items:[],flags:cinders?{'ashen-gate-cinders':{cinders}}:{},
  get isOwner(){return game.user.isGM||game.user.id===owner;},testUserPermission:(u,lvl)=>u.isGM||u.id===owner,
  async setFlag(m,k,v){this.flags[m]??={};this.flags[m][k]=structuredClone(v);},
  async createEmbeddedDocuments(_t,data){const docs=data.map(d=>{const doc={...structuredClone(d),id:`EMB${Math.random()}`,parent:actor,sheet:{render:f=>sheets.push([doc.id,f])},async delete(){actor.items=actor.items.filter(x=>x!==doc);}};return doc;});actor.items.push(...docs);return docs;}};return actor;};
// Aaron sorts first and holds no Cinder; Zed is bound to the Ember Cinder. Both belong to the Test player.
const aaron=mkActor('A1','[TEST] Aaron','u-test'),zed=mkActor('Z1','[TEST] Zed','u-test',{cinders:[{instanceId:'ci_1',definitionId:MUT}]}),outsider=mkActor('O1','[TEST] Outsider','u-real');
const levels=new Map([['A1|'+ART,5],['Z1|'+ART,5],['O1|'+ART,5]]),proficient=new Map();
const ledger={id:'ashen-gate-profession-ledger',active:true,api:{progression:{contract:'ag-ledger-progression/1',level:(a,p)=>levels.has(`${a.id}|${p}`)?{profId:p,xp:0,level:levels.get(`${a.id}|${p}`),tier:'x'}:null},
  meetsProficiency:(actorId,access)=>{const have=proficient.get(actorId)??[];const matched=[...(access.toolProficienciesAnyOf??[]),...(access.skillProficienciesAnyOf??[])].filter(x=>have.includes(x));return {ok:matched.length>0,matched};}}};
const TESTERS=['u-test'];let playerAccess=false;
globalThis.game={modules:new Map([[MOD,{id:MOD,active:true}],['ashen-gate-profession-ledger',ledger],['ashen-gate-cinders',{id:'ashen-gate-cinders',active:true}],['ashen-gate-manager',{id:'ashen-gate-manager',active:true}]]),
  settings:{settings:new Map([['ashen-gate-manager.testPlayers',{}]]),register:()=>{},registerMenu:()=>{},
    get:(m,k)=>k==='testPlayers'?TESTERS:saved.get(k)??(k==='playerAccessEnabled'?playerAccess:undefined),set:async(_m,k,v)=>{saved.set(k,v);return v;}},
  journal:{contents:[journal]},items:{contents:allNodes.map(worldPerk)},actors:{contents:[aaron,zed,outsider],get(id){return this.contents.find(a=>a.id===id)??null;}},
  user:gm,users:{contents:[gm,tester,real],get:id=>[gm,tester,real].find(u=>u.id===id),activeGM:gm},socket:{on:(_n,fn)=>socketHandlers.push(fn),emit:(_n,m)=>emitted.push(m)}};
globalThis.ui={actors:null,notifications:{info:()=>{},error:()=>{},warn:()=>{}}};
await import('../scripts/main.js');
oneTime.get('init')();oneTime.get('ready')();
const api=game.modules.get(MOD).api;
const as=u=>{game.user=u;};
const prep=app=>app.constructor.prototype._prepareContext.call(app,{});
const fresh=()=>{ // a new window for the current user (open() reuses one instance, so drop it first)
  const app=api.open();return app;};
test('setup: the GM publishes every tree',async()=>{as(gm);assert.equal(await api.publish(),5);});

test('root cause of the missing Cinder tree: the window opened on the first character alphabetically, who holds no Cinder; a Test player now lands on the bearer',async()=>{
  as(tester);
  assert.doesNotThrow(()=>api.open({tab:'cinders'}),'a Test player passes the gate with Player Access off');
  const app=api.open({tab:'cinders'});
  const ctx=await prep(app);
  assert.equal(app.treeTab,'cinders');
  assert.equal(app.actorId,'Z1','the character with a bound Cinder is chosen, not Aaron');
  assert.deepEqual(ctx.trees.map(o=>o.value),['CIN-1']);
  assert.equal(ctx.activeCinders,true);assert.equal(ctx.activeProfessions,false);
  assert.equal(ctx.hasTree,true);
  // choosing the character with no Cinder shows the empty state, not a hidden tab
  app.actorId='A1';const empty=await prep(app);
  assert.equal(empty.hasTree,false);assert.match(empty.emptyText,/\[TEST\] Aaron has no bound Cinder yet/);assert.equal(empty.emptyTitle,'No Cinder tree yet');
});
test('a normal player is still refused while Player Access is off; the Test player has no GM power',async()=>{
  as(real);assert.throws(()=>api.open(),/hidden/);
  as(tester);
  assert.throws(()=>api.exportState(),/GM only/);
  await assert.rejects(()=>api.grantPoints(zed,'CIN-1',1,'x'),/GM only/);
  assert.throws(()=>api.listTrees().length&&api.accounts.account(zed,'CIN-1'),/GM only/);
});
test('Test player: the Cinder tree opens through the same paths a Player-Access-on player uses',async()=>{
  as(tester);
  assert.deepEqual(api.listTrees().map(t=>t.id).sort(),['ART-LIT','ART-MUS','ART-VIS','CIN-1']);
  assert.deepEqual(api.pointsSummary(zed).map(r=>r.treeId).includes('CIN-1'),true);
  assert.doesNotThrow(()=>api.open({actorId:'Z1',treeId:'CIN-1'}));
  assert.throws(()=>api.open({actorId:'A1',treeId:'CIN-1'}),/Unknown tree/);
});

test('open(): tab defaults and backward compatibility',async()=>{
  as(gm);
  const app=api.open();
  assert.equal(app.activeTab,'trees');
  assert.equal(new app.constructor().treeTab,'professions','a window with no history starts on Professions');
  api.open({tab:'professions'});const first=await prep(app);assert.ok(first.activeProfessions);
  api.open({tab:'cinders'});assert.equal(app.treeTab,'cinders');assert.equal(app.activeTab,'trees');
  api.open({actorId:'A1'});assert.equal(app.treeTab,'cinders','an actor-only call keeps the tab');assert.equal(app.actorId,'A1');
  api.open({treeId:'ART-MUS'});assert.equal(app.treeTab,'professions','a tree decides its own tab');assert.equal(app.treeId,'ART-MUS');
  api.open({tab:'professions',treeId:'CIN-1'});assert.equal(app.treeTab,'cinders','the tree wins over a mismatched tab');assert.equal(app.treeId,'CIN-1');
  api.open({tab:'bogus'});assert.equal(app.treeTab,'cinders','an unknown tab is ignored');
  api.open({treeId:'ART-VIS',actorId:'Z1'});assert.equal(app.treeId,'ART-VIS');assert.equal(app.actorId,'Z1','the Hub call {actorId, treeId} still works');
  api.open({tab:'professions'});assert.equal(app.treeTab,'professions');
  assert.equal(app.tree?.id,'ART-VIS','each tab remembers its last tree');
  api.open({tab:'cinders'});assert.equal(app.treeId,'CIN-1');
  assert.equal(api.open({resolve:false}),app,'open still returns the window');
});

test('same tabs for every role: the template always renders Professions and Cinders; an empty tab is an empty state',async()=>{
  const fs=await import('node:fs/promises');
  const tpl=await fs.readFile(new URL('../templates/tree.hbs',import.meta.url),'utf8');
  const nav=tpl.slice(tpl.indexOf('<nav class="ag-tabs'),tpl.indexOf('</nav>'));
  const before=nav.slice(0,nav.indexOf('{{#if gm}}'));
  assert.match(before,/data-act="tab-professions"/);assert.match(before,/data-act="tab-cinders"/,'not behind {{#if gm}} or any role condition');
  assert.doesNotMatch(before,/\{\{#if (gm|hasCinder)/);
  as(gm);const app=api.open({tab:'cinders',actorId:'A1'});
  const ctx=await prep(app);assert.equal(ctx.trees.length>0,true,'the GM lists the Cinder trees under Cinders');
  assert.ok(ctx.trees[0].label.includes('Ember'));
  app.actorId='Z1';const bearer=await prep(app);assert.match(bearer.trees[0].label,/Ember Cinder \(bound\)/,'the GM sees which Cinder trees are bound to the chosen character');
});

test('selected-perk panel: facts, effect and notes are separate; a locked perk names what it needs; buttons carry their reasons',async()=>{
  as(tester);levels.set('Z1|'+ART,5);
  const app=api.open({tab:'professions',actorId:'Z1',treeId:'ART-MUS'});
  app.nodeId='ART-MUS-B';
  const c=await prep(app);
  assert.equal(c.selected.flag,'LOCKED');
  assert.equal(c.selected.lockText,'Needs [TEST] ART-MUS-A','named, never a bare "Prerequisite required"');
  assert.doesNotMatch(c.selected.lockText,/^Prerequisite required$/);
  assert.match(c.panel.facts,/<dt>Tier<\/dt><dd>Apprentice \(level 1\)<\/dd>/);assert.match(c.panel.facts,/<dt>Tool<\/dt><dd>Painter's Supplies<\/dd>/);
  assert.doesNotMatch(c.panel.facts+c.panel.body,/ProfessionArtistry|TierApprentice/,'not one run-together string');
  assert.match(c.panel.body,/<h5>Effect &amp; Rules<\/h5><p>ART-MUS-B first sentence\. Second sentence\.<\/p>/);
  assert.match(c.panel.body,/<h5>Notes<\/h5><p>A \[TEST\] note\.<\/p>/);
  assert.equal(c.panel.unlock.show,true);assert.equal(c.panel.unlock.enabled,false);assert.equal(c.panel.unlock.reason,'Needs [TEST] ART-MUS-A');
  assert.equal(c.panel.refund.show,false);
  // the list says the same thing
  const row=c.nodes.find(n=>n.id==='ART-MUS-B');assert.match(row.listNote,/^Needs \[TEST\] ART-MUS-A/);
  // OR group names
  app.nodeId='ART-MUS-C';const orc=await prep(app);
  assert.equal(orc.selected.lockText,'Needs one of [TEST] ART-MUS-A or [TEST] ART-MUS-B');
  // available: Unlock (N point(s))
  app.nodeId='ART-MUS-A';const ok=await prep(app);
  assert.equal(ok.panel.unlock.enabled,true);assert.equal(ok.panel.unlock.label,'Unlock (1 point)…');assert.equal(ok.panel.unlock.act,'request');
});
test('Unlock / Refund states across roles: points, character, preview, player refund',async()=>{
  as(tester);
  const app=api.open({tab:'professions',actorId:'A1',treeId:'ART-MUS'});app.nodeId='ART-MUS-A';
  levels.set('A1|'+ART,1);
  let c;
  // GM unlocks A so the player has something learned and no point left
  as(gm);await api.unlock(aaron,'ART-MUS','ART-MUS-A');
  as(tester);app.nodeId='ART-MUS-B';c=await prep(app);
  assert.equal(c.panel.unlock.enabled,false);assert.match(c.panel.unlock.reason,/No perk points left/);
  app.nodeId='ART-MUS-A';c=await prep(app);
  assert.equal(c.selected.unlocked,true);assert.equal(c.panel.unlock.show,false);assert.equal(c.panel.refund.show,true);assert.equal(c.panel.refund.enabled,false);
  assert.match(c.panel.refund.reason,/Only the GM can refund/);assert.equal(c.panel.sheet.enabled,true,'a learned perk opens its copy');
  as(gm);app.actorId='A1';c=await prep(app);
  assert.equal(c.panel.refund.enabled,true);assert.equal(c.panel.refund.act,'refund');assert.equal(c.panel.primary,'refund');
  app.playerPreview=true;c=await prep(app);assert.equal(c.panel.refund.enabled,false);assert.match(c.panel.refund.reason,/Player preview is read-only/);
  app.playerPreview=false;
  await api.refund(aaron,'ART-MUS','ART-MUS-A');levels.set('A1|'+ART,5);
});

test('proficiency gate in the window: hidden while missing and owning nothing; shown again with the proficiency; kept (with a note) when perks are owned',async()=>{
  as(tester);proficient.set('Z1',[]);
  const app=api.open({tab:'professions',actorId:'Z1',treeId:'ART-MUS'});
  let c=await prep(app);
  const names=c.trees.map(o=>o.label);
  assert.ok(names.every(n=>!/Visual Arts|Literary Arts/.test(n)),'both gated sub-trees are hidden');
  assert.deepEqual([...app._hidden].sort(),['ART-LIT','ART-VIS']);
  assert.equal(c.hiddenHint,'2 trees hidden until you have the right tool proficiency');
  assert.deepEqual(c.hiddenTrees.map(h=>h.note).sort(),['Needs Calligrapher\'s Supplies proficiency'.replace("Calligrapher's Supplies",'calligrapher'),'Needs painter proficiency'].sort());
  // Per-tree: Visual Arts alone returns once the painter proficiency is there; Literary Arts stays hidden.
  proficient.set('Z1',['painter']);c=await prep(app);
  assert.deepEqual([...app._hidden],['ART-LIT']);assert.equal(c.hiddenHint,'1 tree hidden until you have the right tool proficiency');
  assert.ok(c.trees.some(o=>/Artistry/.test(o.label)));
  assert.match(c.treeTabs,/data-tab="ART-VIS"/);assert.doesNotMatch(c.treeTabs,/data-tab="ART-LIT"/);
  // Owned perks edge case: the character bought in Visual Arts, then lost the proficiency.
  as(gm);await api.unlock(zed,'ART-VIS','ART-VIS-A');
  proficient.set('Z1',[]);as(tester);
  app.treeId='ART-VIS';c=await prep(app);
  assert.deepEqual([...app._hidden],['ART-LIT'],'Visual Arts stays visible because it holds an owned perk');
  assert.equal(c.treeNote,'Needs painter proficiency');
  assert.match(c.treeTabs,/data-tab="ART-VIS"/);
  // Regained: shows again with no note
  proficient.set('Z1',['painter','calligrapher']);c=await prep(app);
  assert.equal(app._hidden.size,0);assert.equal(c.hiddenHint,'');assert.equal(c.treeNote,'');
  as(gm);await api.refund(zed,'ART-VIS','ART-VIS-A');
});
test('GM sees every tree, marked when players like this character would not',async()=>{
  as(gm);proficient.set('Z1',[]);
  const app=api.open({tab:'professions',actorId:'Z1',treeId:'ART-LIT'});
  const c=await prep(app);
  assert.equal(app._hidden.size,0,'the GM is never filtered');
  assert.ok(c.trees.some(o=>/Literary Arts|Artistry/.test(o.label)));
  assert.equal(c.treeHiddenFromPlayers,true);assert.equal(c.hiddenHint,'');assert.deepEqual(c.hiddenTrees,[]);
  assert.match(c.treeTabs,/data-tab="ART-LIT"/);
});

test('api.treeVisibility: player, GM, forUser, positional id, and who may ask',async()=>{
  proficient.set('Z1',[]);as(tester);
  const v=api.treeVisibility('Z1');
  assert.equal(v.contract,'ag-tree-visibility/1');
  assert.deepEqual(v.hiddenTreeIds.sort(),['ART-LIT','ART-VIS']);
  assert.ok(v.visibleTreeIds.includes('ART-MUS')&&v.visibleTreeIds.includes('CIN-1'));
  assert.equal(v.hint,'2 trees hidden until you have the right tool proficiency');
  assert.deepEqual(api.treeVisibility({actorId:'Z1'}).hiddenTreeIds.sort(),['ART-LIT','ART-VIS'],'object form');
  assert.deepEqual(api.treeVisibility(zed).hiddenTreeIds.length,2,'an Actor document is accepted');
  const row=v.trees.find(t=>t.treeId==='ART-VIS');assert.deepEqual([row.visible,row.reason,row.note],[false,'proficiency','Needs painter proficiency']);
  assert.throws(()=>api.treeVisibility('O1'),/Actor access denied/,'a player only asks about their own characters');
  assert.throws(()=>api.treeVisibility({actorId:'Z1',forUser:'gm'}),/Actor access denied/,'a player cannot ask as someone else');
  assert.throws(()=>api.treeVisibility('NOPE'),/No Actor given/);
  as(gm);
  const g=api.treeVisibility('Z1');
  assert.deepEqual(g.hiddenTreeIds,[]);assert.equal(g.hint,'');assert.equal(g.viewer.isGM,true);assert.equal(g.trees.length,5,'the GM sees every tree');
  assert.deepEqual(g.trees.filter(t=>t.hiddenFromPlayers).map(t=>t.treeId).sort(),['ART-LIT','ART-VIS']);assert.equal(g.hiddenFromPlayersCount,2);
  const asPlayer=api.treeVisibility({actorId:'Z1',forUser:'u-test'});
  assert.deepEqual(asPlayer.hiddenTreeIds.sort(),['ART-LIT','ART-VIS'],'a GM can ask what a given player would see');assert.equal(asPlayer.viewer.isGM,false);
  assert.throws(()=>api.treeVisibility({actorId:'Z1',forUser:'u-real'}),/Actor access denied/,'that user does not own the character');
  proficient.set('Z1',['painter','calligrapher']);as(tester);
  assert.deepEqual(api.treeVisibility('Z1').hiddenTreeIds,[]);assert.equal(api.treeVisibility('Z1').hint,'');
});
test('no Ledger answer: nothing is hidden on a guess',async()=>{
  ledger.active=false;as(tester);proficient.set('Z1',[]);
  try{assert.deepEqual(api.treeVisibility('Z1').hiddenTreeIds,[]);}finally{ledger.active=true;}
});

test('hover never selects: the card follows the pointer while the selected node stays put; leaving clears the card',async()=>{
  as(gm);const app=api.open({tab:'professions',actorId:'A1',treeId:'ART-MUS'});app.nodeId='ART-MUS-A';await prep(app);
  const card={hidden:true,className:'',children:[],replaceChildren(...c){this.children=c;},append(...c){this.children.push(...c);}};
  globalThis.document={createElement:()=>({className:'',textContent:'',innerHTML:'',children:[],append(){},setAttribute(){}})};
  app.element={querySelector:s=>s==='.agst-tip'?card:null};
  app._showTip('ART-MUS-C');assert.equal(card.hidden,false);assert.equal(app.nodeId,'ART-MUS-A','hover left the selection alone');
  app._showTip(null);assert.equal(card.hidden,true);assert.equal(card.children.length,0);assert.equal(app.nodeId,'ART-MUS-A');
});

// ---- Hub embed (api.embed): G wrong panel / duplicate ids, H named reasons, I collapse, J proficiency hiding ----
function fakeEl(){
  const listeners=[];
  const el={innerHTML:'',isConnected:true,classes:new Set(),listeners,classList:{add:c=>el.classes.add(c),remove:c=>el.classes.delete(c)},
    addEventListener(type,fn,{signal}={}){const l={type,fn};listeners.push(l);signal?.addEventListener('abort',()=>listeners.splice(listeners.indexOf(l),1));},
    contains:()=>true,async fire(type,target){for(const l of listeners.filter(x=>x.type===type))await l.fn({target,stopPropagation(){},preventDefault(){}});}};
  return el;
}
const panelsOf=h=>[...h.matchAll(/<section class="agst-embed__panel" data-agst-panel="([^"]+)" id="[^"]+"[^>]*?(hidden)?>([\s\S]*?)<\/section>/g)].map(m=>({tree:m[1],hidden:Boolean(m[2]),body:m[3]}));
test('H: embed.data names what each perk needs (no ids) and locked rows say it',async()=>{
  as(gm);proficient.set('Z1',[]);
  const g=api.embed.data('Z1').flatMap(x=>x.trees).find(t=>t.id==='ART-MUS');
  const b=g.nodes.find(n=>n.id==='ART-MUS-B'),c=g.nodes.find(n=>n.id==='ART-MUS-C'),a=g.nodes.find(n=>n.id==='ART-MUS-A');
  assert.deepEqual(a.requiresAll,[]);assert.deepEqual(a.requiresAny,[]);
  assert.deepEqual(b.requiresAll,['[TEST] ART-MUS-A']);
  assert.deepEqual(c.requiresAny,[['[TEST] ART-MUS-A','[TEST] ART-MUS-B']]);
  assert.equal(b.reason,'Needs [TEST] ART-MUS-A');assert.equal(c.reason,'Needs one of [TEST] ART-MUS-A or [TEST] ART-MUS-B');
  assert.ok(!JSON.stringify(g.nodes.map(n=>[n.requiresAll,n.requiresAny])).includes('ART-MUS-A"'.replace('ART','NODE')),'names, not node ids');
  const el=fakeEl(),view=api.embed.mount(el,{actorId:'Z1'});
  assert.match(el.innerHTML,/Needs \[TEST\] ART-MUS-A/);assert.doesNotMatch(el.innerHTML,/Prerequisite required/);
  view.unmount();
});
test('J: the embed hides gated trees from a player (hint lists them), shows everything to the GM, and shows a tree again with the proficiency',async()=>{
  proficient.set('Z1',[]);as(tester);
  const ids=api.embed.data('Z1').flatMap(g=>g.trees.map(t=>t.id));
  assert.ok(!ids.includes('ART-VIS')&&!ids.includes('ART-LIT')&&ids.includes('ART-MUS'));
  const el=fakeEl(),view=api.embed.mount(el,{actorId:'Z1'});
  assert.doesNotMatch(el.innerHTML,/data-tree="ART-VIS"|data-tree="ART-LIT"/,'the gated trees are not listed at all');assert.match(el.innerHTML,/data-tree="ART-MUS"/);
  assert.match(el.innerHTML,/<details class="agst-embed__hidden"><summary>2 trees hidden until you have the right tool proficiency<\/summary>/);
  proficient.set('Z1',['painter']);view.refresh();
  assert.deepEqual(panelsOf(el.innerHTML).map(p=>p.tree).sort(),['ART-MUS','ART-VIS']);
  assert.match(el.innerHTML,/1 tree hidden until/);
  view.unmount();
  as(gm);const gel=fakeEl(),gv=api.embed.mount(gel,{actorId:'Z1'});
  assert.equal(panelsOf(gel.innerHTML).length,3);assert.doesNotMatch(gel.innerHTML,/trees? hidden until/);gv.unmount();
});
test('G: two copies of the same character never share ids, and the highlighted sub-tab shows its own perks',async()=>{
  as(gm);proficient.set('Z1',['painter','calligrapher']);
  const one=fakeEl(),two=fakeEl(),v1=api.embed.mount(one,{actorId:'Z1'}),v2=api.embed.mount(two,{actorId:'Z1'});
  const ids=h=>[...h.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
  const a=ids(one.innerHTML),b=ids(two.innerHTML);
  assert.ok(a.length>6);
  assert.deepEqual(a.filter(x=>b.includes(x)),[],'no id appears in both copies (document-wide lookups cannot collide)');
  assert.equal(new Set(a).size,a.length,'and none repeats inside a copy');
  // Click the Visual Arts tab in copy one: it must show Visual Arts perks only, and copy two stays as it was.
  const before2=two.innerHTML;
  const mkTab=(tree,sel)=>({dataset:{tab:tree},attrs:{'aria-selected':String(sel)},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]??null;}});
  const tabs=['ART-LIT','ART-MUS','ART-VIS'].map(t=>mkTab(t,t==='ART-LIT'));
  const panels=['ART-LIT','ART-MUS','ART-VIS'].map(t=>({dataset:{agstPanel:t},hidden:t!=='ART-LIT'}));
  const box={dataset:{agstWallet:'wallet:key'},querySelectorAll:sel=>sel==='[role="tab"]'?tabs:sel==='[data-agst-panel]'?panels:[],querySelector:()=>null};
  const target=tabs[2];target.closest=sel=>sel==='.agst-embed__profession [role="tab"]'?target:sel==='[data-agst-wallet]'?box:null;
  await one.fire('click',target);
  assert.deepEqual(panels.map(p=>[p.dataset.agstPanel,p.hidden]),[['ART-LIT',true],['ART-MUS',true],['ART-VIS',false]]);
  assert.deepEqual(tabs.map(t=>t.attrs['aria-selected']),['false','false','true']);
  assert.equal(two.innerHTML,before2,'the other copy is untouched');
  v1.unmount();v2.unmount();
});
test('G: every panel holds only its own tree\'s perks, and the picked tab is the one shown',async()=>{
  as(gm);proficient.set('Z1',['painter','calligrapher']);
  const el=fakeEl(),view=api.embed.mount(el,{actorId:'Z1'});
  const mark=(h,tree)=>panelsOf(h).find(p=>p.tree===tree);
  for(const p of panelsOf(el.innerHTML)){
    const others=['ART-LIT','ART-MUS','ART-VIS'].filter(t=>t!==p.tree);
    for(const o of others)assert.doesNotMatch(p.body,new RegExp(`data-tree="${o}"`),`${p.tree} panel has no ${o} perks`);
    assert.match(p.body,new RegExp(`data-tree="${p.tree}"`));
  }
  const pick=panelsOf(el.innerHTML).filter(p=>!p.hidden);assert.equal(pick.length,1,'exactly one panel is open');
  // selecting Visual Arts through the real click path keeps selection and panel in step after a refresh
  const tabs=[...el.innerHTML.matchAll(/data-tab="([^"]+)"/g)].map(m=>m[1]);assert.ok(tabs.includes('ART-VIS'));
  const t={dataset:{tab:'ART-VIS'},setAttribute(){},getAttribute:()=>null};
  t.closest=sel=>sel==='.agst-embed__profession [role="tab"]'?t:sel==='[data-agst-wallet]'?{dataset:{agstWallet:el.innerHTML.match(/data-agst-wallet="([^"]+)"/)[1]},querySelectorAll:()=>[]}:null;
  await el.fire('click',t);view.refresh();
  const shown=panelsOf(el.innerHTML).filter(p=>!p.hidden);
  assert.deepEqual(shown.map(p=>p.tree),['ART-VIS']);assert.match(el.innerHTML,/data-tab="ART-VIS"[^>]*aria-selected="true"/);
  assert.match(shown[0].body,/\[TEST\] ART-VIS-A|ART-VIS-A/);assert.doesNotMatch(shown[0].body,/ART-LIT-A/);
  view.unmount();
});
test('I: every profession block folds the same way (a closed header hides the sub-tabs and panels too)',async()=>{
  const fs=await import('node:fs/promises');
  const css=await fs.readFile(new URL('../styles/trees.css',import.meta.url),'utf8');
  assert.match(css,/\.agst-embed details\.agst-embed__tree:not\(\[open\]\)>:not\(summary\)\{display:none\}/);
  as(gm);await api.grantPoints(zed,'CIN-1',1,'[TEST] award');
  proficient.set('Z1',['painter','calligrapher']);
  const el=fakeEl(),view=api.embed.mount(el,{actorId:'Z1'});
  const blocks=[...el.innerHTML.matchAll(/<details class="agst-embed__tree[^"]*" data-tree="([^"]+)"[^>]*><summary>/g)];
  assert.ok(blocks.length>=2,'a multi-tree profession and single trees all open with <details data-tree><summary>');
  assert.equal([...el.innerHTML.matchAll(/<details class="agst-embed__tree/g)].length,blocks.length,'no block is built differently');
  view.unmount();
});
