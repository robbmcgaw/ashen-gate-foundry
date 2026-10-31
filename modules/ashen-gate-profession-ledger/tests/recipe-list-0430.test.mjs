// 0.43.0: foldable profession headers, real item sheet vs read-only preview, link resolution, skill proficiency chips, no pill boxes.
// Mocked Foundry and a tiny fake DOM: logic and markup only, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {skillKeyOf,skillProficiency} from '../scripts/checks.mjs';
import {cleanDescription,resolveEnrichers,snapshotItem,readRecipePreviews} from '../scripts/result-preview.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const hooks={},opened=[],dialogs=[];let api;
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)};
const gm={id:'gm',isGM:true,name:'GM',active:true},alice={id:'u1',isGM:false,name:'Alice',active:true};
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){return this;}},HandlebarsApplicationMixin:c=>c,
  DialogV2:{prompt:async o=>{dialogs.push(o);}}}},utils:{escapeHTML:esc,randomID:()=>'idx'}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{}};
globalThis.ui={notifications:{info:()=>{},error:()=>{}}};
const def=(id,type,extra={})=>({id,entity_type:type,version:'0.1.0',refs:[],...extra});
const src=(id,type,{visibility='player',status='approved',definition=null}={})=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility,status,version:'0.1.0',refs:[],...(definition?{definition}:{})}}});
const worldDoc=(id,name,flags,observer)=>({id,uuid:`Item.${id}`,name,img:'',type:'loot',flags,system:{description:{value:''}},
  testUserPermission:(u)=>u.isGM||observer,sheet:{render:async()=>{opened.push(id);}},
  toObject(){return {_id:this.id,name:this.name,img:'',type:this.type,flags:structuredClone(this.flags),system:{description:{value:''}}};}});
const rec=(id,extra)=>def(id,'Recipe',{profession_id:'PROF-TEST-ALCHEMY',...extra});
const salve=rec('REC-TEST-SALVE',{name:'[TEST] Salve',result_item_id:'ITEM-TEST-SALVE',tier:'expert',effort:'long',workstation:'[TEST] Laboratory',
  ingredients:[{material_id:'MAT-TEST-LEAF',quantity:2},{material_id:'MAT-TEST-RESIN',quantity:1}]});
const world=[
 worldDoc('wsalve0000000000','Recipe: [TEST] Salve',src('REC-TEST-SALVE','Recipe',{definition:salve}),true),
 worldDoc('wleaf00000000000','[TEST] Leaf',src('MAT-TEST-LEAF','Material',{definition:def('MAT-TEST-LEAF','Material',{name:'[TEST] Leaf'})}),true),
 worldDoc('wresin0000000000','[TEST] Resin',src('MAT-TEST-RESIN','Material',{definition:def('MAT-TEST-RESIN','Material',{name:'[TEST] Resin'})}),false),
 worldDoc('wvial00000000000','[TEST] Salve Vial',src('ITEM-TEST-SALVE','Item',{definition:def('ITEM-TEST-SALVE','Item',{name:'[TEST] Salve Vial'})}),false),
 worldDoc('wprof00000000000','[TEST] Alchemy — Profession',src('PROF-TEST-ALCHEMY','Profession',{definition:def('PROF-TEST-ALCHEMY','Profession',{name:'[TEST] Alchemy'})}),true)];
world.get=id=>world.find(x=>x.id===id);
const previews={schema:'ag-result-previews/0.1',recipes:{'REC-TEST-SALVE':{
  result:{name:'[TEST] Salve Vial',img:'',type:'Consumable',text:'x',html:'<h3>Effects</h3><table><tr><th>Roll</th><th>Result</th></tr><tr><td>1</td><td>Fine</td></tr></table><p>Recipe: @UUID[Item.kkzdAWEiAHChoSd9]{Braided Metal Bracelet}</p>',price:'5 gp',uuid:'Item.wvial00000000000'},
  ingredients:[{name:'[TEST] Leaf',img:'',type:'Material',text:'',price:'',quantity:2},{name:'[TEST] Resin',img:'',type:'Material',text:'Sticky. @UUID[Item.abcdefghijklmnop]',price:'',quantity:1,uuid:'Item.wresin0000000000'}],tools:'',workstation:'[TEST] Laboratory'}}};
const skills={arc:{value:1},med:{value:2},his:{value:0.5},nat:{value:0}};
const belwar={id:'belwar',name:'[TEST] Belwar',type:'character',hasPlayerOwner:true,system:{skills},items:[{id:'bprof',name:'[TEST] Alchemy — Profession',type:'feat',system:{quantity:1,description:{value:''}},flags:src('PROF-TEST-ALCHEMY','Profession',{definition:def('PROF-TEST-ALCHEMY','Profession',{name:'[TEST] Alchemy'})})}],
  flags:{'ashen-gate-profession-ledger':{knownRecipes:['REC-TEST-SALVE'],recipePreviews:previews}},testUserPermission:(u,role)=>u.isGM||u.id==='u1'||role==='LIMITED'};
belwar.items.get=id=>belwar.items.find(i=>i.id===id)??null;
const moduleObj={active:true,version:'0.43.0',set api(v){api=v},get api(){return api}};
const values={partyRoster:['belwar'],libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]}};
globalThis.game={user:alice,users:{contents:[gm,alice],get:id=>[gm,alice].find(u=>u.id===id)},items:{contents:world,get:world.get},actors:{contents:[belwar],get:id=>id==='belwar'?belwar:undefined},
  socket:{emit:()=>{},on:()=>{}},modules:{get:id=>id==='ashen-gate-profession-ledger'?moduleObj:undefined},
  settings:{register:()=>{},registerMenu:()=>{},get:(id,k)=>values[k],set:async(id,k,v)=>{values[k]=v;}}};
globalThis.fromUuidSync=uuid=>world.find(d=>d.uuid===uuid)??null;
const {_test}=await import(pathToFileURL(path.resolve(here,'../scripts/main.js')));hooks.init();hooks.ready();
const app=api.open({view:'individual'});app.element={querySelector:()=>null,querySelectorAll:()=>[]};
const html=async()=>{app.view='individual';app.actorId='belwar';return (await app._prepareContext({})).html;};
const visible=h=>h.replace(/<[^>]*>/g,' ');
const css=fs.readFileSync(path.resolve(here,'../styles/ledger.css'),'utf8');

/* ---- fake DOM for the header button ---- */
function groupDom(){
  const body={hidden:false,id:'agl-grp-x'};
  const attrs={'aria-expanded':'true'};
  const btn={dataset:{action:'group-toggle',key:'x'},getAttribute:k=>attrs[k]??null,setAttribute:(k,v)=>{attrs[k]=v;}};
  const classes=new Set();
  const section={dataset:{aglGroup:'[TEST] Alchemy'},classList:{toggle:(c,on)=>on?classes.add(c):classes.delete(c)},querySelector:sel=>sel.includes('group-toggle')?btn:sel.includes('agl-group__body')?body:null};
  btn.closest=sel=>sel==='[data-agl-group]'?section:null;
  return {btn,body,section,attrs,classes};
}

test('profession header is a real button with aria-expanded and the count badge; default expanded',async()=>{
  memory.clear();
  const h=await html();
  const m=/<h4 class="agl-group__head"><button type="button" class="agl-group__toggle" data-action="group-toggle" data-key="([a-z0-9-]+)" aria-expanded="true" aria-controls="(agl-grp-[a-z0-9-]+)">(.*?)<\/button><\/h4>/s.exec(h);
  assert.ok(m,'a button header, not a summary');
  assert.match(m[3],/<strong>\[TEST\] Alchemy<\/strong> <span class="ag-badge">1 (?:recipe|formula)<\/span>/,'the count badge stays');
  assert.match(h,new RegExp(`<div class="agl-group__body agl-folder-body" id="${m[2]}">`),'body is controlled by the button and not hidden');
  assert.doesNotMatch(h.slice(h.indexOf('Known recipes')),/<summary><i class="fa-solid fa-folder-open"/,'no native summary header on the recipe list');
});

test('toggling collapses and expands, is remembered per user, and a re-render keeps it (and the focus key)',async()=>{
  memory.clear();
  const gkey=/data-agl-group="([^"]+)"/.exec(await html())[1];
  const d=groupDom();d.section.dataset.aglGroup=gkey;
  assert.equal(_test.groupToggleClick({dataset:{action:'craft'}}),false,'other actions are left alone');
  assert.equal(_test.groupToggleClick(d.btn),true);
  assert.equal(d.attrs['aria-expanded'],'false');assert.equal(d.body.hidden,true);assert.ok(d.classes.has('is-closed'));
  assert.equal(_test.groupOpen(gkey),false);
  const h=await html();
  assert.match(h,/aria-expanded="false" aria-controls=/,'a re-render draws it shut');
  assert.match(h,/class="agl-group__body agl-folder-body" id="agl-grp-[a-z0-9-]+" hidden>/);
  assert.ok([...memory.keys()].some(k=>k.startsWith('ag-ui:ashen-gate-profession-ledger:')),'kept in the per-user UI state, not a world setting');
  assert.equal(values.recipeGroupsClosed,undefined);
  _test.groupToggleClick(d.btn);
  assert.equal(d.attrs['aria-expanded'],'true');assert.equal(d.body.hidden,false);assert.equal(_test.groupOpen(gkey),true);
  assert.match(await html(),/aria-expanded="true" aria-controls=/);
});

test('focus stays on the same header button across a re-render',()=>{
  const attrsOf=o=>Object.entries(o).map(([name,value])=>({name,value}));
  const oldBtn={tagName:'BUTTON',attributes:attrsOf({'data-action':'group-toggle','data-key':'alch','aria-expanded':'false'}),matches:()=>true};
  const root={ownerDocument:{activeElement:oldBtn},contains:()=>true};
  const kept=_test.captureFocus(root);
  assert.ok(kept?.key.includes('data-action=group-toggle'));
  let focused=null;
  const newBtn={tagName:'BUTTON',disabled:false,attributes:attrsOf({'data-action':'group-toggle','data-key':'alch','aria-expanded':'false'}),focus:()=>{focused='new';}};
  const other={tagName:'BUTTON',disabled:false,attributes:attrsOf({'data-action':'group-toggle','data-key':'smith'}),focus:()=>{focused='other';}};
  root.querySelectorAll=()=>[other,newBtn];
  assert.equal(_test.restoreFocus(root,kept),newBtn);assert.equal(focused,'new');
});

test('permission branch: a player who may open the item gets the real sheet link; one who may not gets the preview button',async()=>{
  const h=await html();
  assert.match(h,/data-action="open-item" data-uuid="Item\.wleaf00000000000"/,'Observer on a released Material: real sheet');
  assert.match(h,/data-action="preview-item"[^>]*data-part="result"[^>]*>\[TEST\] Salve Vial<\/button>/,'no Observer: preview');
  assert.match(h,/data-action="preview-item"[^>]*data-part="i1"[^>]*>\[TEST\] Resin<\/button>/);
  opened.length=0;
  _test.itemLinkClick({dataset:{action:'open-item',uuid:'Item.wleaf00000000000'}});await new Promise(r=>setImmediate(r));
  assert.deepEqual(opened,['wleaf00000000000']);
});

test('the preview popup says it is only a preview, keeps tables and headings, and never prints a raw @UUID',async()=>{
  const key=h=>/data-action="preview-item"[^>]*data-key="([a-z0-9]+)"/.exec(h)[1];
  const h=await html(),k=key(h);
  dialogs.length=0;opened.length=0;
  const btn=part=>({dataset:{action:'preview-item',actor:'belwar',key:k,part,ctx:''},focus(){}});
  _test.itemLinkClick(btn('result'));await new Promise(r=>setImmediate(r));
  assert.equal(dialogs.length,1,'the popup opened (the player cannot open the sheet)');assert.deepEqual(opened,[]);
  const body=dialogs[0].content;
  assert.match(body,/You can only preview this item\./);
  assert.match(body,/<h3>Effects<\/h3><table><tr><th>Roll<\/th><th>Result<\/th><\/tr><tr><td>1<\/td><td>Fine<\/td><\/tr><\/table>/,'table and heading kept');
  assert.match(body,/Recipe: Braided Metal Bracelet/);
  assert.doesNotMatch(body,/@UUID|@AGRef|Item\.kkzd/);
  dialogs.length=0;
  _test.itemLinkClick(btn('i1'));await new Promise(r=>setImmediate(r));
  assert.match(dialogs[0].content,/Sticky\. a linked item/,'a label-less link to an item the player cannot see shows no name and no id');
  assert.doesNotMatch(dialogs[0].content,/@UUID|abcdefghijklmnop/);
});

test('a preview opens the real sheet when the viewer may open it now (permission changed since the card was drawn)',async()=>{
  const k=/data-action="preview-item"[^>]*data-key="([a-z0-9]+)"/.exec(await html())[1];
  const resin=world.find(d=>d.id==='wresin0000000000');
  resin.testUserPermission=()=>true;
  try{
    dialogs.length=0;opened.length=0;
    _test.itemLinkClick({dataset:{action:'preview-item',actor:'belwar',key:k,part:'i1',ctx:''},focus(){}});await new Promise(r=>setImmediate(r));
    assert.deepEqual(opened,['wresin0000000000']);assert.equal(dialogs.length,0,'no popup when the sheet opens');
  }finally{resin.testUserPermission=u=>u.isGM;}
});

test('link resolution: labels win, readable label-less links show the name, nothing raw is ever left',()=>{
  const read=ref=>ref==='Item.wleaf00000000000'?'[TEST] Leaf':null;
  assert.equal(resolveEnrichers('See @UUID[Item.zzzzzzzzzzzzzzzz]{Bracelet} and @AGRef[NPC-X]{Oren}.'),'See Bracelet and Oren.');
  assert.equal(resolveEnrichers('@UUID[Item.wleaf00000000000]',read),'[TEST] Leaf');
  assert.equal(resolveEnrichers('@UUID[Item.nope]',read),'a linked item');
  assert.equal(resolveEnrichers('@AGRef[NPC-SECRET]'),'a linked item');
  assert.equal(resolveEnrichers('Deal [[/r 2d6]] and [[/damage 1d4 fire]]{burn}'),'Deal 2d6 and burn');
  for(const raw of ['@UUID[Compendium.a.b.Item.c]','@UUID[Item.a]{ }','x @Embed[Item.b] y','@UUID[Item.a]{B}@UUID[Item.c]'])assert.doesNotMatch(cleanDescription(raw,read),/@UUID|@Embed|@AGRef|\[Item\./);
  assert.equal(snapshotItem({name:'N',system:{description:{value:'<p>@UUID[Item.q]{Name}</p>'}}}).text,'Name');
  const old=readRecipePreviews({recipes:{'REC-TEST-A':{result:{name:'Old',text:'Recipe: @UUID[Item.kk]{Braided}'},ingredients:[]}}})['REC-TEST-A'].result;
  assert.doesNotMatch(_test.previewBodyHtml(old),/@UUID/,'an older text-only snapshot is cleaned when shown');
});

test('the description HTML is allow-listed: no scripts, styles, event handlers, links or secret blocks',()=>{
  const out=cleanDescription('<p onclick="x()">a<script>alert(1)</script></p><section class="secret"><p>GM</p></section><a href="javascript:x">l</a><img src=x onerror=y><style>p{}</style><table><tr><td colspan="2" style="x">c</td></tr></table>');
  assert.equal(out,'<p>a</p>l<table><tr><td colspan="2">c</td></tr></table>');
  assert.doesNotMatch(out,/script|onclick|onerror|secret|GM|style|href/);
});

test('skill keys are found from labels in any case or spacing',()=>{
  assert.equal(skillKeyOf('Arcana'),'arc');assert.equal(skillKeyOf('arc'),'arc');assert.equal(skillKeyOf(' ARCANA '),'arc');
  assert.equal(skillKeyOf('Sleight of Hand'),'slt');assert.equal(skillKeyOf('sleight-of-hand'),'slt');assert.equal(skillKeyOf('Animal  Handling'),'ani');
  assert.equal(skillKeyOf('Medicine'),'med');assert.equal(skillKeyOf('Lockpicking'),null);assert.equal(skillKeyOf(''),null);assert.equal(skillKeyOf(null),null);
});

test('skill proficiency: expertise and proficient are marked; half and none are not',()=>{
  const a={system:{skills}};
  assert.equal(skillProficiency(a,'arc'),'proficient');assert.equal(skillProficiency(a,'med'),'expertise');
  assert.equal(skillProficiency(a,'his'),'half');assert.equal(skillProficiency(a,'nat'),'none');assert.equal(skillProficiency(a,'zzz'),'none');
  assert.equal(skillProficiency({system:{skills:{arc:{proficient:1}}}},'arc'),'proficient','the proficient field when there is no value');
});

test('the Check chip: green with text and tooltip when proficient, Expertise says so, half and none stay neutral (not red)',()=>{
  const req=skill=>({tool:null,workstation:null,activity:false,gmApplied:false,skill});
  const chip=(skill,actor=belwar)=>_test.requirementHTML(req(skill),actor);
  const arc=chip('Arcana');
  assert.match(arc,/class="agl-station agl-check is-proficient"[^>]*data-proficiency="proficient"/);
  assert.match(arc,/<span>Arcana<\/span> <span class="ag-badge ag-badge--ok agl-skill-state" data-tooltip="Proficient in Arcana"[^>]*><i [^>]*><\/i> Proficient<\/span>/);
  const med=chip('med');
  assert.match(med,/ag-badge--ok agl-skill-state" data-tooltip="Expertise in Medicine"[^>]*><i [^>]*><\/i> Expertise<\/span>/);
  for(const [skill,why] of [['History','half proficiency'],['Nature','not proficient'],['Stealth','skill the character lacks']]){
    const h=chip(skill);
    assert.doesNotMatch(h,/ag-badge|is-proficient|danger|warn/,`${why}: neutral`);
    assert.match(h,/<span class="agl-label agl-label--inline">Check<\/span>/);
  }
  assert.doesNotMatch(_test.requirementHTML(req('Arcana'),null),/ag-badge/,'no character, no state');
  assert.match(_test.requirementHTML({...req('Arcana'),gmApplied:true,tool:{key:'x'},toolLabel:'T',tools:[],anyOf:false},belwar),/Proficient in Arcana/,'the GM-applied enchanting check chip too');
});

test('no pill radius on cards, headers or badges of the recipe list',()=>{
  const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m=>[m[1].trim(),m[2]]);
  const tall=/\.agl-(recipe|group|folder|prof|preview|station|flow)/;
  const bad=rules.filter(([sel,body])=>tall.test(sel)&&/radius-control|999px|border-radius:\s*50%/.test(body)).map(([sel])=>sel);
  assert.deepEqual(bad,[],'recipe-list boxes use var(--ag-radius), never the control pill');
  assert.match(css,/\.agl-group__toggle\{[^}]*border-radius:var\(--ag-radius\)/);
  assert.match(css,/\.agl-recipe-row \.ag-badge,\.agl-recipe-station \.ag-badge\{border-radius:var\(--ag-radius\);white-space:normal\}/);
  assert.match(css,/\.agl-group\{[^}]*border-radius:var\(--ag-radius\)/);
});
