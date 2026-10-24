import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {sanitizePerkHtml} from '../scripts/perk-html.mjs';
import {requirementText,rivalLine,relationSentence,isCrossroads,isRival,tierText,tooltipModel,fitZoom,laneLabels,MIN_ZOOM} from '../scripts/layout.mjs';
import {normalizeTree,resolveTree,validateTree,publicTree,planTreeImport,treeStats,treeStatsText,SCHEMA,PROFESSION_TREE_NODE_RANGE} from '../scripts/engine.mjs';

// 0.23.0 icon nodes, lanes, rival pairs, import counts. Mocked Foundry and pure logic: these prove the logic, not how it looks or behaves in the live Forge window.
const ref=(...names)=>names.map(name=>({name}));

test('perk text is reduced to safe structure: tables and headings stay, scripts, attributes, links, images and GM secrets go',()=>{
  const out=sanitizePerkHtml('<h3 class="x" onclick="a()">Effect</h3><table style="x"><tr><th>Use</th><td>Once per Long Rest</td></tr></table><p>See <a href="javascript:evil()">the rules</a> <img src=x onerror=alert(1)><script>alert(1)</script></p><section class="secret" id="s"><p>GM only</p><section><p>deeper</p></section></section><p>[[AGREF:PERK-X|Name]] and @UUID[Item.abc]{Rope} and [[/r 1d6]]{a roll}</p>');
  assert.equal(out,'<h3>Effect</h3><table><tr><th>Use</th><td>Once per Long Rest</td></tr></table><p>See the rules </p><p>Name and Rope and a roll</p>');
  assert.doesNotMatch(out,/script|onclick|javascript|GM only|deeper|PERK-X|<img|<a /);
  assert.equal(sanitizePerkHtml(''),'');assert.equal(sanitizePerkHtml(null),'');
  assert.equal(sanitizePerkHtml('<p>'+'x'.repeat(9000)+'</p>'),'','too large for the shared player view: the caller falls back to plain text');
  assert.equal(sanitizePerkHtml('a < b & c'),'a &lt; b &amp; c');
  assert.equal(sanitizePerkHtml('<p>one<p>two</div>'),'<p>one<p>two</p></p>','unbalanced markup is closed');
});

test('requirement and rival wording: "A and one of B or C", crossroads, "Choose one: X or Y"',()=>{
  assert.equal(requirementText({all:ref('A'),any:[{nodes:ref('B','C')}]}),'Requires A and one of B or C');
  assert.equal(requirementText({all:[],any:[{nodes:ref('A','B')},{nodes:ref('C','D')}]}),'Requires one of A or B, and one of C or D');
  assert.equal(requirementText({all:ref('A','B'),any:[]}),'Requires A and B');
  assert.equal(requirementText({all:ref('A','B','C'),any:[{nodes:ref('D','E','F')}]}),'Requires A, B, C and one of D, E or F');
  assert.equal(requirementText({all:[],any:[{nodes:ref('A')}]}),'Requires A');
  assert.equal(requirementText({all:[],any:[],excludes:ref('X')}),'');
  assert.equal(rivalLine('Hardy',{excludes:ref('Swift')}),'Choose one: Hardy or Swift');
  assert.equal(rivalLine('Hardy',{excludes:ref('Swift','Sly')}),'Choose one: Hardy, Swift or Sly');
  assert.equal(rivalLine('Hardy',{excludes:[]}),'');
  assert.equal(relationSentence('Hardy',{all:ref('A'),any:[],excludes:ref('Swift')}),'Requires A. Choose one: Hardy or Swift');
  assert.equal(isCrossroads({requiresAny:[['A','B'],['C']]}),true);assert.equal(isCrossroads({requiresAny:[['A','B']]}),false);
  assert.equal(isRival({excludes:['X']},{excludes:[]}),true);assert.equal(isRival({excludes:[]},{excludes:ref('X')}),true);assert.equal(isRival({excludes:[]},{excludes:[]}),false);
});

test('tooltip model: tier and level, cost, full perk markup, rival and crossroads kinds, actions; silhouettes show nothing',()=>{
  assert.equal(tierText({requiredLevel:7}),'Expert (level 7)');assert.equal(tierText({requiredLevel:7,perkTier:'expert'}),'Expert (level 7)');
  assert.equal(tierText({requiredLevel:2}),'Level 2');assert.equal(tierText({}),'');
  const base={id:'N1',name:'Hardy',cost:1,requiredLevel:4,description:'plain text',descriptionHtml:'<table><tr><td>Use</td></tr></table><script>x</script>',flag:'LOCKED',reason:'Needs Tough',
    rel:{all:ref('Tough'),any:[],excludes:ref('Swift')},rival:true,perkId:'PERK-X',actions:{learn:'purchase',refund:false}};
  const tip=tooltipModel(base);
  assert.equal(tip.tier,'Journeyman (level 4)');assert.equal(tip.costText,'1 point');
  assert.equal(tip.html,'<table><tr><td>Use</td></tr></table>');assert.equal(tip.fullText,'');
  assert.equal(tip.prerequisites,'Requires Tough');assert.equal(tip.rival,'Choose one: Hardy or Swift');assert.equal(tip.kind,'rival');
  assert.equal(tip.canOpen,true);assert.deepEqual(tip.actions,{learn:'purchase',refund:false});
  assert.equal(tooltipModel({...base,crossroads:true}).kind,'crossroads');
  const noHtml=tooltipModel({...base,descriptionHtml:'',description:'Long '.repeat(100)});
  assert.equal(noHtml.html,'');assert.ok(noHtml.fullText.length>140,'without markup the whole text shows, not 140 characters');
  const player=tooltipModel({...base,perkId:undefined,unlocked:false});assert.equal(player.canOpen,false,'a player without the perk has no sheet to open');
  assert.equal(tooltipModel({...base,perkId:undefined,unlocked:true,flag:'UNLOCKED'}).canOpen,true,'a learned perk opens the copy on the sheet');
  const sil=tooltipModel({id:'S',name:'Undiscovered',silhouette:true,description:'secret',descriptionHtml:'<p>secret</p>',rel:{excludes:ref('X')},rival:true,flag:'LOCKED'});
  assert.equal(sil.html,'');assert.equal(sil.rival,'');assert.equal(sil.prerequisites,'');assert.equal(sil.canOpen,false);assert.equal(sil.tier,'');
});

test('fit zoom: the whole tree width fits, never above 100% or below 25%',()=>{
  const width=1860+132+40;
  assert.equal(fitZoom(1000,width),.49);assert.equal(fitZoom(2400,width),1);assert.equal(fitZoom(100,width),MIN_ZOOM);
  assert.equal(fitZoom(0,width),1);assert.equal(fitZoom(900,0),1);
});

test('lane labels: one per specialty, centred over its nodes above the top row; hidden silhouettes and empty lanes are skipped',()=>{
  const labels=laneLabels([{lane:'Camp Lab',x:0,y:100},{lane:'Camp Lab',x:200,y:300},{lane:'Volatiles',x:600,y:100},{x:10,y:10},{lane:'  ',x:1,y:1},{lane:'Secret',x:1,y:1,silhouette:true}],{w:132,h:46});
  assert.deepEqual(labels.map(l=>[l.text,l.x,l.y]),[['Camp Lab',166,71],['Volatiles',666,71]]);
  assert.equal(laneLabels([{lane:'Edge',x:0,y:0}],{w:132,h:46})[0].y,4,'never above the board');
});

const node=(id,o={})=>({id,name:id,perkId:`PERK-T-${id}`,x:0,y:0,requiresAll:[],requiresAny:[],excludes:[],status:'approved',visibility:'player',display:'shown',...o});
const profTree=(nodes,extra={})=>({id:'T-TREE',name:'[TEST] Tree',status:'approved',visibility:'player',provider:{kind:'profession',maxPoints:null},sourceRef:'PROF-T',nodes,...extra});
const many=(n,mk=()=>({}))=>Array.from({length:n},(_,i)=>node(`N${String(i).padStart(2,'0')}`,{x:i*10,...mk(i)}));

test('tree counts: nodes, rival pairs (once), reachable nodes, and the most perks held together',()=>{
  const nodes=[node('A'),node('B',{requiresAll:['A']}),node('C',{requiresAll:['A'],excludes:['D']}),node('D',{requiresAll:['A'],excludes:['C']}),
    node('E',{requiresAny:[['B'],['C','D']]}),node('F',{requiresAll:['G']}),node('G',{requiresAll:['F']})];
  const stats=treeStats(profTree(nodes));
  assert.deepEqual(stats,{nodes:7,exclusivePairs:1,reachable:5,maxTogether:4});
  assert.equal(treeStatsText(stats),'7 nodes, 1 rival pair, up to 4 can be taken together');
  assert.equal(treeStatsText({nodes:1,exclusivePairs:0,reachable:1,maxTogether:1}),'1 node, 0 rival pairs, up to 1 can be taken together');
  const three=many(24,i=>i<6?{excludes:[`N${String(i+(i%2?-1:1)).padStart(2,'0')}`]}:{});
  assert.deepEqual(treeStats(profTree(three)),{nodes:24,exclusivePairs:3,reachable:24,maxTogether:21});
});

test('import preview carries the counts, and a tree of 22 to 30 nodes no longer warns while 10 or 40 do',()=>{
  const plan=planTreeImport({schema:SCHEMA,trees:[profTree(many(24,i=>i<2?{excludes:[`N0${1-i}`]}:{}))]},[]);
  assert.deepEqual(plan.errors,[]);
  assert.equal(plan.rows[0].summary,'24 nodes, 1 rival pair, up to 23 can be taken together');
  assert.deepEqual(plan.rows[0].stats,{nodes:24,exclusivePairs:1,reachable:24,maxTogether:23});
  const warnings=n=>validateTree(profTree(many(n))).warnings;
  for(const n of [20,22,24,30,36])assert.deepEqual(warnings(n),[],`${n} nodes`);
  for(const n of [10,19,37])assert.ok(warnings(n).some(w=>new RegExp(`usually have ${PROFESSION_TREE_NODE_RANGE.min} to ${PROFESSION_TREE_NODE_RANGE.max} nodes \\(16 points to spend\\); this one has ${n}`).test(w)),`${n} nodes`);
  assert.doesNotMatch(JSON.stringify(warnings(24)),/24 nodes/);
  // a tree whose rival pairs leave fewer than 16 perks holdable together
  const tight=many(20,i=>i<15?{excludes:[`N${String(i+(i%2?-1:1)).padStart(2,'0')}`].filter(id=>Number(id.slice(1))<15)}:{});
  assert.ok(validateTree(profTree(tight)).warnings.some(w=>/Only \d+ perks can be taken together, fewer than the 16 profession points/.test(w)));
});

test('lane is kept, trimmed and limited; the player view carries lane and perk markup but never ids, UUIDs or lanes of hidden/teaser nodes',()=>{
  const n=normalizeTree(profTree([node('A',{lane:'  Camp Lab  '}),node('B',{lane:'x'.repeat(60)}),node('C')]));
  assert.equal(n.nodes[0].lane,'Camp Lab');assert.equal(n.nodes[1].lane.length,40);assert.equal('lane' in n.nodes[2],false);
  const resolved=resolveTree(profTree([node('A',{lane:'Camp Lab'}),node('T',{lane:'Hidden Lane',display:'teaser'}),node('G',{lane:'Hidden Lane',visibility:'gm'})]),pid=>({name:`[TEST] Perk ${pid.slice(-1)}`,description:'plain',
    html:'<table><tr><td>Use</td></tr></table><script>1</script><section class="secret"><p>GM</p></section>',img:null,cost:1,uuid:'Item.WORLD1',tier:'apprentice'}));
  const pub=publicTree(resolved),text=JSON.stringify(pub);
  assert.equal(pub.nodes[0].lane,'Camp Lab');assert.equal(pub.nodes[0].descriptionHtml,'<table><tr><td>Use</td></tr></table>');
  assert.equal(pub.nodes.find(x=>x.silhouette).lane,undefined);
  assert.doesNotMatch(text,/PERK-|Item\.WORLD|Hidden Lane|<script|GM<|secret/);
});

test('template, styles and kit rules for the icon nodes',async()=>{
  const [tpl,css]=await Promise.all(['../templates/tree.hbs','../styles/trees.css'].map(p=>readFile(new URL(p,import.meta.url),'utf8')));
  const start=tpl.indexOf('<button type="button" class="agst-node'),btn=tpl.slice(start,tpl.indexOf('</button>',start));
  assert.match(btn,/data-act="open-perk"/);assert.doesNotMatch(btn,/<strong>|<small>|\{\{name\}\}|\{\{cost\}\}|agst-node-main/,'no text and no badge inside a node');
  assert.match(btn,/aria-label="\{\{label\}\}"/);assert.doesNotMatch(btn,/data-act="(purchase|request|refund)"/,'a plain click never learns or refunds');
  for(const cls of ['agst-locked','agst-eligible','agst-unlocked','agst-rival','agst-crossroads'])assert.ok(btn.includes(cls),cls);
  for(const hook of ['{{#each lanes}}','agst-lane','Choose one'])assert.ok(tpl.includes(hook),hook);
  for(const sel of ['.agst-locked','.agst-eligible','.agst-unlocked','.agst-rival','.agst-crossroads','.agst-lane','.agst-tip-desc table','.agst-tip.agst-tip-live'])assert.ok(css.includes(sel),sel);
  assert.match(css,/agst-rival[^{]*\{[^}]*dashed/);assert.match(css,/agst-crossroads[^{]*\{[^}]*double/);
  assert.match(css,/\.agst-tip\{[^}]*pointer-events:none/);assert.doesNotMatch(css,/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
});
