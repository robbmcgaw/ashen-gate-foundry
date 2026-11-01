import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
// 0.27.0 pure logic (no Foundry): perk panel body and buttons, named reasons, tabs, the proficiency gate, node-tip hover. Synthetic data.
import {perkPanelBody,panelActions,sheetAction,lockReason,listNote,unlockLabel,REFUND_LABEL} from '../scripts/perk-panel.mjs';
import {availability,publicAvailability,prerequisiteReason} from '../scripts/engine.mjs';
import {tabOfTree,treesInTab,openTab,chooseActor,emptyTabText,isTreeTab,TREE_TABS} from '../scripts/tree-tabs.mjs';
import {classifyTree,hiddenHint} from '../scripts/tree-access.mjs';
import {bindNodeTip} from '../scripts/node-tip.mjs';

const TABLE='<table><tr><th>Profession / Tree</th><td>Artistry · Visual Arts</td></tr><tr><th>Specialty</th><td>Cartography</td></tr><tr><th>Tier</th><td>Apprentice (level 1)</td></tr><tr><th>Type</th><td>Passive</td></tr><tr><th>Automation</th><td>None</td></tr><tr><th>Requires</th><td>Nothing</td></tr><tr><th>Uses</th><td>At will</td></tr><tr><th>Tool</th><td>Painter\'s Supplies</td></tr></table>';
const DESC=`${TABLE}<h2>Effect &amp; Rules</h2><p>You always know north. Second [TEST] sentence.</p><h2>Notes</h2><p>A [TEST] note.</p><script>alert(1)</script>`;

test('A: the description table becomes label/value facts; effect and notes stay separate paragraphs; scripts are dropped',()=>{
  const r=perkPanelBody('[TEST] Waymarks',DESC,'');
  for(const [k,v] of [['Specialty','Cartography'],['Tier','Apprentice (level 1)'],['Type','Passive'],['Automation','None'],['Uses','At will'],['Tool','Painter\'s Supplies']])
    assert.ok(r.facts.includes(`<dt>${k}</dt><dd>${v.replace(/'/g,"'")}</dd>`),k);
  assert.doesNotMatch(r.facts,/Nothing/,'"Requires: Nothing" is noise');
  assert.match(r.body,/^<h5>Effect &amp; Rules<\/h5><p>You always know north\. Second \[TEST\] sentence\.<\/p><h5>Notes<\/h5><p>A \[TEST\] note\.<\/p>$/);
  assert.doesNotMatch(r.facts+r.body,/<script|alert|ProfessionArtistry|TierApprentice/);
  assert.equal(r.tier,'Apprentice (level 1)');
});
test('A: plain text and one-sentence effects still show whole; no description is empty',()=>{
  assert.equal(perkPanelBody('X','','Just text. More text.').body,'<p>Just text. More text.</p>');
  assert.equal(perkPanelBody('X','<p>Only one sentence.</p>','').body,'<p>Only one sentence.</p>');
  assert.deepEqual(perkPanelBody('X','',''),{facts:'',body:'',tier:''});
  assert.doesNotMatch(perkPanelBody('X','<p onclick="x()">hi<img src=x onerror=y></p>','').body,/onclick|<img|onerror/);
});

test('C: Unlock (N point(s)) when available, Refund when learned, disabled with a visible reason otherwise',()=>{
  assert.equal(unlockLabel(1),'Unlock (1 point)…');assert.equal(unlockLabel(3),'Unlock (3 points)…');assert.equal(REFUND_LABEL,'Refund…');
  const can=panelActions({available:true,cost:2,mode:'player'});
  assert.deepEqual([can.unlock.show,can.unlock.enabled,can.unlock.act,can.unlock.label,can.refund.show,can.primary],[true,true,'request','Unlock (2 points)…',false,'unlock']);
  const gm=panelActions({available:true,mode:'gm'});assert.equal(gm.unlock.act,'purchase');
  const blocked=panelActions({available:false,reason:'Needs [TEST] Scribe',mode:'player'});
  assert.deepEqual([blocked.unlock.enabled,blocked.unlock.reason,blocked.primary],[false,'Needs [TEST] Scribe',null]);
  const pts=panelActions({available:false,reason:'No perk points left (4 of 4 used at level 4)',mode:'player'});assert.match(pts.unlock.reason,/No perk points left/);
  const tool=panelActions({available:false,reason:'Needs Painter\'s Supplies proficiency',mode:'player'});assert.equal(tool.unlock.reason,'Needs Painter\'s Supplies proficiency');
  const learnedGm=panelActions({unlocked:true,mode:'gm'});assert.deepEqual([learnedGm.unlock.show,learnedGm.refund.show,learnedGm.refund.enabled,learnedGm.refund.act,learnedGm.primary],[false,true,true,'refund','refund']);
  const learnedPlayer=panelActions({unlocked:true,mode:'player'});assert.equal(learnedPlayer.refund.enabled,false);assert.match(learnedPlayer.refund.reason,/Only the GM can refund/);
  assert.match(panelActions({available:true,mode:'player',hasActor:false}).unlock.reason,/Choose a character/);
  assert.match(panelActions({available:true,mode:'preview'}).unlock.reason,/Player preview is read-only/);
  assert.equal(panelActions({silhouette:true,mode:'player'}).unlock.enabled,false);
});
test('B: Open sheet… — GM needs a perk, a player needs the learned copy',()=>{
  assert.equal(sheetAction({gm:true,hasPerk:true}).enabled,true);assert.equal(sheetAction({gm:true,hasPerk:false}).enabled,false);
  assert.equal(sheetAction({gm:false,learnedCopy:true}).enabled,true);assert.match(sheetAction({gm:false}).reason,/Learn this perk/);
  assert.equal(sheetAction({silhouette:true,gm:true,hasPerk:true}).enabled,false);
});

const tree=(nodes,extra={})=>({id:'T',status:'approved',provider:{kind:'generic_points',maxPoints:10},nodes,...extra});
const n=(id,name,o={})=>({id,name,cost:1,requiresAll:[],requiresAny:[],excludes:[],status:'approved',visibility:'player',display:'shown',...o});
test('D: locked reasons name the perk or proficiency, in both the GM and the player engine',()=>{
  const t=tree([n('A','Scribe for Hire'),n('B','Phrasebook'),n('C','Quick Study',{requiresAll:['A']}),n('D','Master Hand',{requiresAll:['A','B']}),n('E','Either',{requiresAny:[['A','B']]}),n('F','Rival',{excludes:['A']})]);
  const acct=(...u)=>({awarded:5,unlocks:u,history:[]});
  assert.equal(availability(t,acct(),'C').reason,'Needs Scribe for Hire');
  assert.equal(publicAvailability(t,acct(),'C').reason,'Needs Scribe for Hire');
  assert.equal(publicAvailability(t,acct(),'D').reason,'Needs Scribe for Hire and Phrasebook');
  assert.equal(publicAvailability(t,acct('A'),'D').reason,'Needs Phrasebook');
  assert.equal(availability(t,acct(),'E').reason,'Needs one of Scribe for Hire or Phrasebook');
  assert.equal(publicAvailability(t,acct(),'E').reason,'Needs one of Scribe for Hire or Phrasebook');
  assert.equal(publicAvailability(t,acct('A'),'F').reason,'Excluded by Scribe for Hire');
  assert.equal(prerequisiteReason(t,acct('A','B'),t.nodes[3]),null);
  for(const id of ['C','D','E'])for(const fn of [availability,publicAvailability])assert.doesNotMatch(fn(t,acct(),id).reason,/^(Prerequisite required|Required prerequisite not unlocked|An alternative prerequisite is required|One required alternative is not unlocked)$/);
  const gate=tree([n('A','Perk')],{access:{toolProficienciesAnyOf:['painter']}});
  assert.equal(publicAvailability(gate,acct(),'A',{access:{ok:false},accessLabel:(k,x)=>"Painter's Supplies"}).reason,"Needs Painter's Supplies proficiency");
  const hidden=tree([n('A','Perk',{unrevealedPrerequisite:true})]);
  assert.equal(publicAvailability(hidden,acct(),'A').reason,'Needs a perk the GM has not revealed yet');
});
test('D: the lock line and the list note never read bare',()=>{
  assert.equal(lockReason({flag:'LOCKED',reason:'Needs Scribe for Hire'}),'Needs Scribe for Hire');
  assert.equal(lockReason({flag:'LOCKED',reason:''}),'Not available yet');assert.equal(lockReason({flag:'AVAILABLE',reason:'Available'}),'');
  assert.equal(listNote({flag:'LOCKED',reason:'Needs Scribe for Hire',requirement:'Requires Scribe for Hire',rivalText:'Choose one: A or B'}),'Needs Scribe for Hire. Choose one: A or B');
  assert.equal(listNote({flag:'AVAILABLE',requirement:'Requires Scribe for Hire'}),'Requires Scribe for Hire');
});

test('F: tabs — Professions and Cinders, tree to tab, open() resolution, actor choice, empty state',()=>{
  assert.deepEqual(TREE_TABS.map(t=>t.id),['professions','cinders']);
  const trees=[{id:'P',provider:{kind:'profession'}},{id:'C',provider:{kind:'cinder_milestone'}},{id:'G',provider:{kind:'generic_points'}}];
  assert.deepEqual(treesInTab(trees,'professions').map(t=>t.id),['P','G'],'other trees stay reachable under Professions');
  assert.deepEqual(treesInTab(trees,'cinders').map(t=>t.id),['C']);assert.equal(tabOfTree(trees[1]),'cinders');
  assert.ok(isTreeTab('cinders')&&!isTreeTab('library')&&!isTreeTab(null));
  assert.equal(openTab({},{trees}),'professions');assert.equal(openTab({tab:'cinders'},{trees}),'cinders');assert.equal(openTab({tab:'nope'},{trees,current:'cinders'}),'cinders','unknown tab: keep the current one');
  assert.equal(openTab({tab:'professions',treeId:'C'},{trees}),'cinders','the tree decides');assert.equal(openTab({treeId:'MISSING',tab:'cinders'},{trees}),'cinders');
  const actors=[{id:'a'},{id:'b'}];
  assert.equal(chooseActor(actors,'b',()=>false),'b','a valid choice is kept');assert.equal(chooseActor(actors,null,a=>a.id==='b'),'b','first with a tree');assert.equal(chooseActor(actors,'x',()=>false),'a');assert.equal(chooseActor([],null),null);
  assert.match(emptyTabText('cinders',{actorName:'Rho'}),/Rho has no bound Cinder yet/);assert.match(emptyTabText('cinders',{gm:true}),/No Cinder trees yet/);assert.equal(emptyTabText('professions',{gm:false}),null);
});

test('E: the gate is per tree; hide only when the Ledger says no and the character owns nothing there',()=>{
  const gated={access:{toolProficienciesAnyOf:['painter']}},line='Needs painter proficiency';
  const base={tree:gated,line};
  assert.deepEqual(classifyTree({...base,check:{ok:false},owned:false}),{visible:false,hiddenFromPlayers:false,reason:'proficiency',note:line});
  assert.deepEqual(classifyTree({...base,check:{ok:false},owned:true}),{visible:true,hiddenFromPlayers:false,reason:null,note:line},'owned perks keep the tree, with a note');
  assert.equal(classifyTree({...base,check:{ok:true},owned:false}).visible,true);assert.equal(classifyTree({...base,check:{ok:true},owned:false}).note,'');
  assert.equal(classifyTree({...base,check:null,owned:false}).visible,true,'nobody could check: nothing is guessed');
  assert.equal(classifyTree({tree:{},check:{ok:false}}).visible,true,'no access object, no gate');
  const gm=classifyTree({...base,check:{ok:false},owned:false,asGM:true});assert.deepEqual([gm.visible,gm.hiddenFromPlayers],[true,true]);
  assert.equal(classifyTree({...base,check:{ok:false},owned:true,asGM:true}).hiddenFromPlayers,false);
  assert.equal(hiddenHint(0),'');assert.equal(hiddenHint(1),'1 tree hidden until you have the right tool proficiency');assert.equal(hiddenHint(3),'3 trees hidden until you have the right tool proficiency');
});

// B: node tip — hover and focus only
const el=(id,parent=null)=>({dataset:id?{id}:{},parent,matches:q=>q===':focus-visible',closest(sel){for(let x=this;x;x=x.parent){if(sel==='.agst-node'&&x.dataset.id)return x;}return null;}});
test('B: the card follows hover and keyboard focus only — it hides on pointer leave and blur, and a selected node never keeps it up',()=>{
  const board=new EventTarget(),root=new EventTarget(),shown=[];
  bindNodeTip(board,{root,show:id=>shown.push(id),pinned:()=>null});
  const fire=(t,type,props={})=>{const e=new Event(type,{bubbles:true});for(const [k,v] of Object.entries(props))Object.defineProperty(e,k,{value:v});t.dispatchEvent(e);};
  const a=el('N1');
  fire(board,'pointerover',{target:a,pointerType:'mouse'});assert.equal(shown.at(-1),'N1');
  fire(board,'pointerout',{target:a,relatedTarget:el(null),pointerType:'mouse'});assert.equal(shown.at(-1),null);
  fire(board,'focusin',{target:a});assert.equal(shown.at(-1),'N1');fire(board,'focusout',{target:a});assert.equal(shown.at(-1),null);
});
test('B: after a re-render the card picks up a node the pointer already rests on',()=>{
  const board=Object.assign(new EventTarget(),{querySelector:q=>q==='.agst-node:hover'?{dataset:{id:'N7'}}:null}),shown=[];
  const ctl=bindNodeTip(board,{root:board,show:id=>shown.push(id),pinned:()=>null});
  ctl.seedHover();assert.equal(shown.at(-1),'N7');
  const empty=Object.assign(new EventTarget(),{querySelector:()=>null}),s2=[];
  bindNodeTip(empty,{root:empty,show:id=>s2.push(id),pinned:()=>null}).seedHover();assert.deepEqual(s2,[]);
});
test('B: main.js — a node click only selects; hover has no path to the selection; the sheet opens from its own button',async()=>{
  const src=await fs.readFile(new URL('../scripts/main.js',import.meta.url),'utf8');
  assert.match(src,/if\(action==='open-sheet'\)\{await this\._openPerkSheet\(id\);return;\}/);
  assert.doesNotMatch(src,/if\(action==='open-sheet'\|\|!editing\)/);
  const tip=src.slice(src.indexOf('  _showTip(id){'),src.indexOf('  /** Select a node and move to its Unlock'));
  assert.doesNotMatch(tip,/this\.nodeId=|\.render\(/,'showing the card never changes the selection or re-renders');
  const tpl=await fs.readFile(new URL('../templates/tree.hbs',import.meta.url),'utf8');
  assert.match(tpl,/Click, or press Enter, to select it · Unlock…, Refund… and Open sheet… are in the Selected perk panel · Right-click, or press Shift\+Enter, to jump to them/);
  assert.match(tpl,/data-act="open-sheet" data-id="\{\{selected\.id\}\}"/);
});
test('F: a Test player is a player here — no module code branches on isTestPlayer except the access gate and the Manager list hook',async()=>{
  const src=await fs.readFile(new URL('../scripts/main.js',import.meta.url),'utf8');
  assert.match(src,/Hooks\.on\('updateSetting',setting=>\{if\(setting\?\.key==='ashen-gate-manager\.testPlayers'\)syncTreePlayerAccess/);
  assert.equal((src.match(/isTestPlayer\(/g)??[]).length,2,'window close on access off, and the GM-side unlock check: nothing grants more');
});
