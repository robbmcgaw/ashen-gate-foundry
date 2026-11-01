import test from 'node:test';import assert from 'node:assert/strict';
// 0.23.0 runtime with mocked Foundry: proves click, pin, sheet, permission and refund-order logic, not the live Forge window.
class FakeApplication {static DEFAULT_OPTIONS={};constructor(){this.rendered=false;}render(){this.rendered=true;return this;}async _prepareContext(){return {};}async _onRender(){}}
const oneTime=new Map(),saved=new Map(),notes=[];
globalThis.Hooks={once:(e,fn)=>oneTime.set(e,fn),on:()=>{}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{confirm:async()=>true}}},utils:{escapeHTML:x=>x,randomID:()=>Math.random().toString(36).slice(2)}};
globalThis.document={documentElement:{dataset:{agSize:'comfortable'}},createElement:tag=>({tag,className:'',textContent:'',innerHTML:'',attrs:{},children:[],append(...c){this.children.push(...c);},setAttribute(k,v){this.attrs[k]=v;}})};
const MOD='ashen-gate-skill-trees';
const n=(id,perkId,o={})=>({id,perkId,x:100,y:100,requiresAll:[],requiresAny:[],excludes:[],status:'test',visibility:'player',display:'shown',...o});
const tree={id:'IC-TREE',name:'[TEST] Tree',description:'',status:'test',visibility:'player',sourceRef:null,provider:{kind:'generic_points',maxPoints:10},nodes:[
  n('NODE-A','PERK-IC-A'),n('NODE-B','PERK-IC-B',{x:400,requiresAll:['NODE-A']}),n('NODE-C','PERK-IC-C',{x:700,excludes:['NODE-D']}),n('NODE-D','PERK-IC-D',{x:1000,excludes:['NODE-C']}),
  {id:'NODE-T',name:'Hidden',description:'',cost:1,x:1300,y:100,requiresAll:[],requiresAny:[],excludes:[],status:'test',visibility:'player',display:'teaser'}]};
const journal={flags:{[MOD]:{privateStore:true,payload:{schema:'ag-skill-trees/0.3',trees:[tree]}}},async setFlag(m,k,v){this.flags[m][k]=v;}};
const sheets=[];
const perk=(id,sourceId,name)=>({id,uuid:`Item.${id}`,documentName:'Item',type:'feat',name,img:'icons/test.webp',sheet:{render:force=>sheets.push([id,force])},
  system:{description:{value:'<table><tr><td>Use</td></tr></table><p>Rules text</p>'}},testUserPermission:()=>true,
  flags:{'ashen-gate-manager':{source:{sourceId,entityType:'ProfessionPerk',status:'approved',visibility:'player',definition:{id:sourceId,point_cost:1}}}},
  toObject(){return structuredClone({name:this.name,type:this.type,img:this.img,system:this.system,flags:this.flags});}});
const gm={id:'gm',isGM:true},player={id:'player1',isGM:false};
const actor={id:'A1',name:'[TEST] Hero',type:'character',isOwner:true,flags:{},items:[],testUserPermission:()=>true,
  async setFlag(m,k,v){this.flags[m]??={};this.flags[m][k]=structuredClone(v);},
  async createEmbeddedDocuments(_t,data){const docs=data.map(d=>{const doc={...structuredClone(d),id:`EMB${Math.random()}`,sheet:{render:force=>sheets.push([doc.id,force])},async delete(){actor.items=actor.items.filter(x=>x!==doc);}};return doc;});actor.items.push(...docs);return docs;}};
globalThis.game={modules:new Map([[MOD,{id:MOD,active:true}]]),
  settings:{register:()=>{},registerMenu:()=>{},get:(_m,k)=>saved.get(k)??(k==='playerAccessEnabled'?true:undefined),set:async(_m,k,v)=>{saved.set(k,v);return v;}},
  journal:{contents:[journal]},items:{contents:['A','B','C','D'].map(x=>perk(`W${x}`,`PERK-IC-${x}`,`[TEST] Perk ${x}`))},
  actors:{contents:[actor],get:id=>id==='A1'?actor:null},user:gm,users:{contents:[gm,player],get:id=>[gm,player].find(u=>u.id===id),activeGM:gm},socket:{on:()=>{},emit:()=>{}}};
globalThis.ui={actors:null,notifications:{info:m=>notes.push(m),error:m=>notes.push(m)}};
await import('../scripts/main.js');
oneTime.get('init')();oneTime.get('ready')();
const api=game.modules.get(MOD).api;
const app=api.open();app.treeId='IC-TREE';app.actorId='A1';
const click=(act,id,extra={})=>app._clicked({target:{closest:sel=>sel==='[data-act]'?{dataset:{act,id},closest:()=>null}:null}, ...extra});

test('a plain click on a node only selects it; Open sheet… opens the sheet; nothing learns or refunds',async()=>{
  await api.grantPoints(actor,'IC-TREE',5,'Start');
  sheets.length=0;notes.length=0;
  await click('open-perk','NODE-A');
  assert.equal(app.nodeId,'NODE-A','0.27.0: a click selects');assert.deepEqual(sheets,[],'and opens no sheet');
  assert.equal(actor.items.length,0);assert.deepEqual(actor.flags[MOD].progressV2['tree:IC-TREE'].unlocks??[],[]);
  await click('open-sheet','NODE-A');
  assert.deepEqual(sheets,[['WA',true]],'the GM gets the world perk sheet from the panel button');
  await click('open-sheet','NODE-T');assert.match(notes.at(-1),/no perk sheet to open/);assert.equal(sheets.length,1,'a custom node has no sheet');
  app.nodeId='NODE-A';app._dragged=true;await click('open-perk','NODE-B');assert.equal(app.nodeId,'NODE-A','the click that ends a drag selects nothing');assert.equal(app._dragged,false);
  app.nodeId=null;
});

test('Edit layout: a click selects the node (for editing); Open perk sheet on its card opens the sheet',async()=>{
  app.editMode=true;sheets.length=0;
  await click('open-perk','NODE-B');assert.equal(app.nodeId,'NODE-B');assert.equal(sheets.length,0);
  await click('open-sheet','NODE-B');assert.deepEqual(sheets,[['WB',true]]);
  app.editMode=false;app.nodeId=null;
});

test('hover only previews: the corner card has no buttons and never pins; right-click / Shift+Enter selects the node and jumps to its panel button',async()=>{
  app._jumpToAction('NODE-A');assert.equal(app.nodeId,'NODE-A');assert.equal(app.sideTab,'perk');assert.equal(app._focusAction,true);
  app._focusAction=false;
  const ctx=await prepare();
  assert.equal(ctx.selected.id,'NODE-A');
  assert.equal(ctx.panel.unlock.show,true);assert.equal(ctx.panel.unlock.enabled,true);assert.equal(ctx.panel.unlock.act,'purchase');
  assert.match(ctx.panel.unlock.label,/^Unlock \(1 point\)/);assert.equal(ctx.panel.primary,'unlock');assert.equal(ctx.panel.refund.show,false);
  const card={hidden:true,className:'',children:[],replaceChildren(...c){this.children=c;},append(...c){this.children.push(...c);}};
  app.element={querySelector:s=>s==='.agst-tip'?card:null};
  app._tips=app._tips;
  app._showTip('NODE-A');
  assert.equal(card.className,'agst-tip','the card is a preview, never a control surface');
  assert.ok(!card.children.some(c=>c.className==='agst-tip-actions'));
  const desc=card.children.find(c=>c.className==='agst-tip-desc');assert.match(desc.innerHTML,/<table>.*Rules text/);
  assert.ok(card.children.some(c=>/Click, or press Enter, to select this perk/.test(c.textContent)));
  assert.equal(app._pinned,undefined,'nothing is pinned any more');
  // learned: the panel offers Refund, not Unlock
  await api.unlock(actor,'IC-TREE','NODE-A');
  const after=await prepare();
  assert.equal(after.panel.unlock.show,false);assert.equal(after.panel.refund.show,true);assert.equal(after.panel.refund.enabled,true);assert.equal(after.panel.refund.act,'refund');
  app.nodeId=null;
});

async function prepare(){return app.constructor.prototype._prepareContext.call(app,{});}
async function SkillTreeApp_prepare(){await prepare();}

test('permissions: a player has no Unlock-for-others, no Refund, and opens only the copy on their own sheet',async()=>{
  game.user=gm;await click('publish');game.user=player;app.playerPreview=false;
  app.nodeId='NODE-A';
  let ctx=await prepare();
  assert.equal(ctx.panel.refund.show,true);assert.equal(ctx.panel.refund.enabled,false,'players never refund');assert.match(ctx.panel.refund.reason,/Only the GM can refund/);
  assert.equal(ctx.panel.sheet.enabled,true,'learned: the copy on the sheet');
  app.nodeId='NODE-B';ctx=await prepare();
  assert.equal(ctx.panel.unlock.act,'request','a player asks (the GM client unlocks)');assert.equal(ctx.panel.unlock.enabled,true);
  assert.equal(ctx.panel.sheet.enabled,false);assert.match(ctx.panel.sheet.reason,/Learn this perk/);
  const tips=app._tips;
  assert.equal(tips['NODE-A'].canOpen,true,'learned: the copy on the sheet');assert.equal(tips['NODE-B'].canOpen,false,'not learned: no world id to open');
  sheets.length=0;notes.length=0;
  await click('open-sheet','NODE-A');assert.equal(sheets.length,1);assert.notEqual(sheets[0][0],'WA','the player opens their own copy, not the world perk');
  await click('open-sheet','NODE-B');assert.match(notes.at(-1),/Learn this perk to open its sheet/);assert.equal(sheets.length,1);
  await click('open-sheet','NODE-T');assert.match(notes.at(-1),/not been revealed/);
  game.user=gm;app.nodeId=null;
});

test('refunding a node that another node requires is refused until the dependent is refunded first (runtime)',async()=>{
  game.user=gm;
  await api.unlock(actor,'IC-TREE','NODE-B');
  await assert.rejects(()=>api.refund(actor,'IC-TREE','NODE-A'),/Refund \[TEST\] Perk B first; it depends on this node/);
  assert.equal(actor.items.length,2,'both perks stay on the sheet');
  assert.deepEqual(actor.flags[MOD].progressV2['tree:IC-TREE'].unlocks,['NODE-A','NODE-B']);
  await api.refund(actor,'IC-TREE','NODE-B');
  const r=await api.refund(actor,'IC-TREE','NODE-A');
  assert.deepEqual(r.removed,['[TEST] Perk A']);assert.equal(actor.items.length,0);
});

test('rival nodes: taking one blocks the other with a plain reason',async()=>{
  await api.unlock(actor,'IC-TREE','NODE-C');
  await assert.rejects(()=>api.unlock(actor,'IC-TREE','NODE-D'),/exclusive|cannot|Mutually|excluded/i);
});
