import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {safeImagePath,cssUrl,cleanBackground,cleanTiers,tierBands,backgroundView,nodeSizeOf,appearanceFromForm,appearanceWarnings,NODE_SIZES} from '../scripts/appearance.mjs';
import {tooltipModel,initialSidebar,toggledSidebar,isNarrow} from '../scripts/layout.mjs';
import {normalizeTree,validateTree,publicTree,planTreeImport,validatePackage,SCHEMA} from '../scripts/engine.mjs';
import {graphEdges,edgeLine} from '../scripts/graph.mjs';

const node=(o={})=>({id:'NODE-A1',name:'Hardy',description:'x',x:100,y:100,requiresAll:[],requiresAny:[],excludes:[],status:'approved',visibility:'player',display:'shown',cost:2,...o});
const tree=(o={})=>({id:'TEST-TREE-1',name:'[TEST] Tree',status:'approved',visibility:'player',provider:{kind:'generic_points',maxPoints:10},nodes:[node()],...o});

test('image paths: only safe local image files',()=>{
  for(const ok of ['worlds/test/map.webp','modules/x/img/Level 1 (a).png','/worlds/t/b.JPG','icons/a-b_c.svg'])assert.equal(safeImagePath(ok),ok);
  for(const ok of ['https://assets.forge-vtt.com/5f2a/Art/Level%201.png','https://assets.forge-vtt.com/5f2a/a.webp','https://foo.bar.forge-vtt.com/x/y.jpg','HTTPS://Assets.Forge-VTT.com/a.png'])assert.equal(safeImagePath(ok),ok);
  assert.equal(cssUrl('https://assets.forge-vtt.com/a/b%20c.png'),'url("https://assets.forge-vtt.com/a/b%20c.png")');
  for(const bad of ['https://forge-vtt.com.evil.example/a.png','https://evilforge-vtt.com/a.png','https://forge-vtt.com/a.png','http://assets.forge-vtt.com/a.png','https://user@assets.forge-vtt.com/a.png','https://assets.forge-vtt.com:8080/a.png','https://assets.forge-vtt.com/a.png?x=1','https://assets.forge-vtt.com/a.png#x','https://assets.forge-vtt.com/../a.png','https://assets.forge-vtt.com/%2e%2e/a.png','https://assets.forge-vtt.com/a"b.png','https://assets.forge-vtt.com/<a>.png','https://assets.forge-vtt.com/a.html','file:///etc/a.png','ftp://assets.forge-vtt.com/a.png','//assets.forge-vtt.com/a.png','https://assets.forge-vtt.com//a.png','https://assets.forge-vtt.com/a%zz.png','https://evil.example/a.png','http://a/b.png','//evil.example/a.png','javascript:alert(1)','data:image/png;base64,AAAA','../secret.png','worlds/../a.png','a.png"onerror="x','a.png);background:url(x','worlds/t/<script>.png','worlds\\t\\a.png','worlds/t/a.html','worlds/t/','worlds/t/a%2e%2e.png','',null,undefined,42,'x'.repeat(301)+'.png'])assert.equal(safeImagePath(bad),null,String(bad));
  assert.equal(cssUrl('a b/c d.png'),'url("a%20b/c%20d.png")');
  assert.equal(cssUrl('javascript:alert(1)'),'url("")');
});
test('background: fit, opacity and unsafe image handling',()=>{
  assert.deepEqual(cleanBackground({image:'worlds/t/b.webp'}),{image:'worlds/t/b.webp',fit:'cover',opacity:.35});
  assert.deepEqual(cleanBackground({image:'worlds/t/b.webp',fit:'tile',opacity:5}),{image:'worlds/t/b.webp',fit:'tile',opacity:1});
  assert.equal(cleanBackground({image:'worlds/t/b.webp',fit:'weird',opacity:0}).fit,'cover');
  assert.equal(cleanBackground({image:'worlds/t/b.webp',opacity:0}).opacity,.05);
  assert.equal(cleanBackground({image:'https://x.test/a.png'}),null);
  assert.equal(backgroundView({background:{image:'https://x.test/a.png'}}),null);
  const v=backgroundView({background:{image:'worlds/t/b.webp',fit:'fixed',opacity:.5}});
  assert.equal(v.fixed,true);assert.match(v.style,/^--agst-bg-image:url\("worlds\/t\/b\.webp"\);--agst-bg-opacity:0\.5;$/);
});
test('tiers: sorted, bounded, unsafe icons dropped, bands run to the next tier',()=>{
  const tiers=cleanTiers([{level:2,label:' Two ',y:400,icon:'worlds/t/i2.png'},{level:1,y:0,icon:'https://x.test/i.png'},{level:'x',y:5},{level:3,y:9000}]);
  assert.deepEqual(tiers,[{level:1,label:'',y:0,icon:null},{level:2,label:'Two',y:400,icon:'worlds/t/i2.png'}]);
  const bands=tierBands(tiers,1000);
  assert.deepEqual(bands.map(b=>[b.top,b.height,b.text,b.alt]),[[0,400,'Level 1',false],[400,600,'Two',true]]);
  assert.equal(bands[0].iconStyle,'');assert.match(bands[1].iconStyle,/--agst-tier-icon:url\("worlds\/t\/i2\.png"\)/);
  assert.equal(cleanTiers(Array.from({length:60},(_,i)=>({level:1,y:i}))).length,40);
});
test('look fields round-trip through normalise, export JSON and import; unsafe values are removed',()=>{
  const raw=tree({nodeSize:'normal',background:{image:'worlds/t/b.webp',fit:'tile',opacity:.5},tiers:[{level:1,label:'One',y:0,icon:'worlds/t/i.png'}]});
  const n=normalizeTree(raw);
  assert.equal(n.nodeSize,'normal');assert.deepEqual(n.background,{image:'worlds/t/b.webp',fit:'tile',opacity:.5});assert.equal(n.tiers[0].icon,'worlds/t/i.png');
  const exported=JSON.parse(JSON.stringify({schema:SCHEMA,trees:[n]}));
  const plan=planTreeImport(exported,[],{mode:'skip'});
  assert.deepEqual(plan.errors,[]);assert.deepEqual(plan.apply[0].background,n.background);assert.deepEqual(plan.apply[0].tiers,n.tiers);assert.equal(plan.apply[0].nodeSize,'normal');
  const forge=normalizeTree(tree({background:{image:'https://assets.forge-vtt.com/1/b.webp'},tiers:[{level:1,y:0,icon:'https://assets.forge-vtt.com/1/i.png'}]}));
  assert.equal(forge.background.image,'https://assets.forge-vtt.com/1/b.webp');
  assert.equal(publicTree(forge).tiers[0].icon,'https://assets.forge-vtt.com/1/i.png');
  assert.equal(planTreeImport({schema:SCHEMA,trees:[forge]},[]).apply[0].background.image,'https://assets.forge-vtt.com/1/b.webp');
  assert.equal(publicTree(tree({background:{image:'https://evil.example/b.webp'}})).background,undefined);
  const evil=normalizeTree(tree({nodeSize:'huge',background:{image:'javascript:alert(1)',fit:'cover'},tiers:[{level:1,y:0,icon:'https://x.test/a.png',label:'<img src=x onerror=alert(1)>'}]}));
  assert.equal(evil.nodeSize,undefined);assert.equal(evil.background,undefined);assert.equal(evil.tiers[0].icon,null);
  const imported=planTreeImport({schema:SCHEMA,trees:[tree({background:{image:'//evil.test/a.png'}})]},[]);
  assert.deepEqual(imported.errors,[]);assert.equal(imported.apply[0].background,undefined);
  const check=validateTree(tree({background:{image:'https://x.test/a.png'},nodeSize:'huge'}));
  assert.deepEqual(check.errors,[]);assert.equal(check.warnings.length,2);
  assert.equal(validatePackage({schema:SCHEMA,trees:[tree({tiers:[{level:1,y:0,icon:'ftp://x/a.png'}]})]}).warnings.length,1);
});
test('existing trees without the new fields stay exactly as they were',()=>{
  const n=normalizeTree(tree());
  for(const k of ['nodeSize','background','tiers'])assert.equal(Object.hasOwn(n,k),false);
  assert.equal(nodeSizeOf(n),'compact');assert.equal(nodeSizeOf({nodeSize:'normal'}),'normal');
  assert.deepEqual(appearanceWarnings(tree()),[]);
});
test('players receive the look fields but never GM-only nodes',()=>{
  const t=tree({nodeSize:'normal',background:{image:'worlds/t/b.webp',fit:'cover',opacity:.4},tiers:[{level:1,y:0,label:'',icon:null}],
    nodes:[node(),node({id:'NODE-GM1',name:'Secret',visibility:'gm',display:'hidden'}),node({id:'NODE-DR1',name:'Draft',status:'draft'})]});
  const p=publicTree(t);
  assert.equal(p.nodeSize,'normal');assert.equal(p.background.image,'worlds/t/b.webp');assert.equal(p.tiers.length,1);
  assert.deepEqual(p.nodes.map(n=>n.id),['NODE-A1']);
  assert.equal(JSON.stringify(p).includes('Secret'),false);
  assert.equal(Object.hasOwn(publicTree(tree()),'background'),false);
});
test('form values become look fields; blank rows skipped; bad paths reported',()=>{
  const ok=appearanceFromForm({nodeSize:'normal',bgImage:' worlds/t/b.webp ',bgFit:'fixed',bgOpacity:'40',tierLevel:['1','',''],tierLabel:['A','',''],tierY:['0','',''],tierIcon:['worlds/t/i.png','','']});
  assert.deepEqual(ok.errors,[]);assert.equal(ok.nodeSize,'normal');assert.equal(ok.background.opacity,.4);assert.equal(ok.tiers.length,1);
  const bad=appearanceFromForm({nodeSize:'x',bgImage:'https://x.test/a.png',tierLevel:'1',tierY:'0',tierIcon:'javascript:1'});
  assert.equal(bad.errors.length,2);assert.equal(bad.nodeSize,'compact');
  assert.equal(appearanceFromForm({bgImage:'',tierLevel:[],tierY:[]}).background,null);
  assert.equal(appearanceFromForm({tierLevel:'0',tierY:'10'}).errors.length,1);
});
test('compact nodes are smaller and arrows meet the border of the right box',()=>{
  assert.ok(NODE_SIZES.compact.w<NODE_SIZES.normal.w&&NODE_SIZES.compact.h<NODE_SIZES.normal.h);
  const a={x:0,y:0},b={x:0,y:200};
  assert.notEqual(edgeLine(a,b,'compact').d,edgeLine(a,b,'normal').d);
  assert.equal(edgeLine(a,b).d,edgeLine(a,b,'normal').d); // default keeps the old geometry
  const edges=graphEdges([{id:'A',x:0,y:0,requiresAll:[]},{id:'B',x:0,y:200,requiresAll:['A']}],'compact');
  assert.equal(edges[0].d,edgeLine(a,b,'compact').d);
});
test('sidebar state: narrow starts closed, wide open, user choice wins, toggle flips',()=>{
  assert.equal(isNarrow(700),true);assert.equal(isNarrow(1100),false);assert.equal(isNarrow(0),false);
  assert.equal(initialSidebar(null,700),false);assert.equal(initialSidebar(null,1100),true);
  assert.equal(initialSidebar(true,700),true);assert.equal(initialSidebar(false,1100),false);
  assert.equal(toggledSidebar(null),false);assert.equal(toggledSidebar(true),false);assert.equal(toggledSidebar(false),true);
});
test('tooltip content for Locked, Available, Unlocked and hidden-name silhouettes',()=>{
  const base={id:'N1',name:'Hardy',description:'  Gain\n  toughness. '.repeat(30),cost:2,relText:'Requires Tough',reason:'Needs Tough'};
  const locked=tooltipModel({...base,flag:'LOCKED'}),avail=tooltipModel({...base,flag:'AVAILABLE',eligible:true,reason:'Available'}),done=tooltipModel({...base,flag:'UNLOCKED',unlocked:true});
  assert.deepEqual([locked.status,avail.status,done.status],['Locked','Available','Unlocked']);
  assert.equal(locked.reason,'Needs Tough');assert.equal(avail.reason,'');assert.equal(done.reason,'');
  assert.equal(locked.costText,'2 points');assert.equal(tooltipModel({...base,cost:1,flag:'LOCKED'}).costText,'1 point');
  assert.equal(locked.prerequisites,'Requires Tough');
  assert.ok(locked.text.length<=140&&locked.text.endsWith('…'));assert.equal(locked.text.includes('\n'),false);
  const sil=tooltipModel({id:'S',name:'Undiscovered',description:'secret',cost:3,silhouette:true,flag:'LOCKED'});
  assert.equal(sil.text,'');assert.equal(sil.costText,'');
  assert.equal(tooltipModel(null),null);
});
test('template and styles: sidebar, canvas, tooltip, band and background hooks exist; shared kit only',async()=>{
  const hbs=await readFile(new URL('../templates/tree.hbs',import.meta.url),'utf8');
  const css=await readFile(new URL('../styles/trees.css',import.meta.url),'utf8');
  for(const hook of ['agst-sidebar','agst-canvas-pane','agst-tip','agst-tier','data-act="toggle-sidebar"','data-act="appearance"','{{sizeClass}}','{{bg.style}}','<span class="ag-header__brand">Ashen Gate</span> | Skill Trees</h1>','<span class="ag-version">v{{moduleVersion}}</span>','data-act="help"'])assert.ok(hbs.includes(hook),hook);
  for(const act of ['grant','reset-tree','purchase','request','refund','assign-perk','edit-node','link','remove-node','tree-settings','undo','redo','player-preview','edit-mode','add-perk','publish','export','export-all','give-missing','backup-progress','create-tree','setup-save','setup-cancel'])assert.ok(hbs.includes(`data-act="${act}"`),act);
  assert.doesNotMatch(css,/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  assert.match(css,/@container \(max-width: 759px\)/);
});
