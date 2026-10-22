import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
// 0.19.5: the Undo confirmation is plain text escaped once by confirmDialog, so no literal tag text or
// double-escaped entities reach the dialog. Mocked Foundry and DialogV2: proves the message, not the live UI.
class FakeApplication{static DEFAULT_OPTIONS={};render(){return this;}async _prepareContext(){return {};}}
const oneTime=new Map();
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
globalThis.Hooks={once:(e,fn)=>oneTime.set(e,fn),on:()=>{}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{}}},utils:{escapeHTML,randomID:()=>'r'}};
const MOD='ashen-gate-skill-trees',NAME='[TEST] Salt & <Ash> "Ward"';
const node={id:'G1',name:NAME,cost:1,x:0,y:0,requiresAll:[],requiresAny:[],excludes:[],status:'approved',visibility:'player',display:'shown'};
const tree={id:'TP-GEN',name:'[TEST] Generic Tree',description:'',status:'approved',visibility:'player',provider:{kind:'generic_points',maxPoints:10},nodes:[node]};
const journal={flags:{[MOD]:{privateStore:true,payload:{schema:'ag-skill-trees/0.3',trees:[tree]}}},async setFlag(m,k,v){this.flags[m][k]=v;}};
const history=['allocate','override','remove','keep'].map((kind,i)=>({id:`h${i}`,kind,nodeId:'G1',at:i,by:'gm'}));
const hero={id:'hero',name:'[TEST] Hero & Co',type:'character',items:[],flags:{[MOD]:{progressV2:{'tree:TP-GEN':{awarded:5,unlocks:['G1'],history}}}},
  async setFlag(){},isOwner:true,testUserPermission:()=>true};
const gm={id:'gm',isGM:true,name:'GM'};
globalThis.game={modules:new Map([[MOD,{id:MOD,active:true}]]),settings:{register:()=>{},registerMenu:()=>{},get:()=>undefined,set:async(_m,_k,v)=>v},
  journal:{contents:[journal]},items:{contents:[]},actors:{contents:[hero],get:id=>id==='hero'?hero:null},user:gm,users:{contents:[gm],activeGM:gm}};
globalThis.ui={actors:null,notifications:{info:()=>{},error:()=>{}}};
await import('../scripts/main.js');
oneTime.get('init')();oneTime.get('ready')();
const app=game.modules.get(MOD).api.open();app.actorId='hero';app.treeId='TP-GEN';

for(const h of history)test(`Undo (${h.kind}) confirmation has no literal tag text or double-escaped entities`,async()=>{
  let seen;foundry.applications.api.DialogV2={wait:async o=>{seen=o;return o.buttons.find(b=>b.action==='cancel').callback();}};
  await app._undoHistory(h.id);
  assert.equal(seen.window.title,'Undo this change?');
  const html=seen.content;
  // What the browser shows: tags dropped, entities decoded once.
  const shown=html.replace(/<\/?p>/g,'').replace(/&(lt|gt|quot|#39|amp);/g,(_m,e)=>({lt:'<',gt:'>',quot:'"','#39':"'",amp:'&'}[e]));
  assert.doesNotMatch(shown,/<\/?(strong|em|b|p|br)\b/i,'no literal tag text');
  assert.doesNotMatch(shown,/&(amp|lt|gt|quot|#39);/,'no literal entity text');
  assert.ok(shown.includes(NAME),'the node name is shown exactly');
  assert.ok(shown.includes('[TEST] Hero & Co'));
  // User text is still escaped in the markup: the only real tags are the helper's paragraphs.
  assert.doesNotMatch(html.replace(/<\/?p>/g,''),/[<>]/);
});

test('no confirm() message in Skill Trees carries markup or pre-escaped text',async()=>{
  const src=await fs.readFile(new URL('../scripts/main.js',import.meta.url),'utf8');
  const calls=[...src.matchAll(/await confirm(?:Danger)?\(([^;]*?),\{title:/g)].map(m=>m[1]);
  assert.ok(calls.length>=10);
  for(const c of calls){assert.doesNotMatch(c,/<\/?[a-z]+[ >]|&[a-z#0-9]+;/i,c);assert.doesNotMatch(c,/escape\(/,c);}
  const undo=src.slice(src.indexOf('async _undoHistory('),src.indexOf('async _ledgerImport('));
  assert.doesNotMatch(undo,/<strong>|escape\(/);
});
