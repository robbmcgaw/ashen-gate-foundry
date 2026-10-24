import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {assertNoIds,assertNoMachineText,findId} from '../../../scripts/test-helpers/no-ids.mjs';
// 0.21.2: canonical ids (PERK-*, PROF-*, NODE-*, TREE-* ...) are never shown. Mocked Foundry: proves the view data, embed HTML,
// messages and template, not the live window.
class FakeApplication {static DEFAULT_OPTIONS={};constructor(o){this.options=o;}render(){return this;}async _prepareContext(){return {};}async _onRender(){}}
const oneTime=new Map(),saved=new Map(),notes=[];
globalThis.Hooks={once:(e,fn)=>oneTime.set(e,fn),on:()=>{}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{confirm:async()=>true}}},utils:{escapeHTML:x=>String(x),randomID:()=>'r'}};
globalThis.document={documentElement:{dataset:{agSize:'comfortable'}},createElement:tag=>({tag,className:'',textContent:'',children:[],append(...c){this.children.push(...c);}})};
const MOD='ashen-gate-skill-trees',PROF='PROF-TP-HERB';
const node=(id,perk,extra={})=>({id:`NODE-${id}`,perkId:perk,cost:1,x:0,y:0,requiresAll:[],requiresAny:[],excludes:[],status:'approved',visibility:'player',display:'shown',name:`[TEST] Perk ${id}`,...extra});
const prof={id:'TREE-TP-PROF',name:'[TEST] Herbalism Tree',description:'',status:'approved',visibility:'player',sourceRef:PROF,provider:{kind:'profession',maxPoints:null},
  nodes:[node('P1','PERK-TP-P1'),node('P2','PERK-TP-P2',{requiresAll:['NODE-P1']}),node('P3','PERK-TP-GONE',{name:''})]};
const journal={flags:{[MOD]:{privateStore:true,payload:{schema:'ag-skill-trees/0.3',trees:[prof]}}},async setFlag(m,k,v){this.flags[m][k]=v;}};
const perk=id=>({id:`W${id}`,uuid:`Item.W${id}`,documentName:'Item',type:'feat',name:`[TEST] Perk ${id}`,img:null,ownership:{default:2},system:{description:{value:''}},testUserPermission:()=>true,
  toObject(){return {name:this.name,type:'feat',system:{},flags:{}};},
  flags:{'ashen-gate-manager':{source:{sourceId:`PERK-TP-${id}`,entityType:'ProfessionPerk',status:'approved',visibility:'player',definition:{id:`PERK-TP-${id}`,point_cost:1}}}}});
const gm={id:'gm',isGM:true,name:'GM'},owner={id:'u1',isGM:false,name:'Owner'};
const hero={id:'hero',name:'[TEST] Hero',type:'character',flags:{[MOD]:{progressV2:{'tree:TREE-TP-PROF':{unlocks:['NODE-P1'],history:[]}}}},items:[],
  async setFlag(m,k,v){this.flags[m]??={};this.flags[m][k]=structuredClone(v);},get isOwner(){return true;},testUserPermission:()=>true};
const ledger={active:true,api:{progression:{contract:'ag-ledger-progression/1',level:()=>({profId:PROF,xp:5,level:3,tier:'Apprentice'})}}};
globalThis.game={modules:new Map([[MOD,{id:MOD,active:true,version:'0.22.2'}],['ashen-gate-profession-ledger',ledger]]),
  settings:{register:()=>{},registerMenu:()=>{},get:(_m,k)=>saved.get(k)??(k==='playerAccessEnabled'?true:undefined),set:async(_m,k,v)=>{saved.set(k,v);return v;}},
  journal:{contents:[journal]},items:{contents:[perk('P1'),perk('P2')]},actors:{contents:[hero],get:id=>id==='hero'?hero:null},
  user:gm,users:{contents:[gm,owner],get:id=>[gm,owner].find(u=>u.id===id),activeGM:gm},socket:{on:()=>{},emit:()=>{}}};
globalThis.ui={actors:null,notifications:{info:m=>notes.push(m),error:m=>notes.push(m)}};
await import('../scripts/main.js');
oneTime.get('init')();oneTime.get('ready')();
const api=game.modules.get(MOD).api;

/** Every string the template can print, minus the keys the template only uses for data-* wiring or the GM Details fold. */
const WIRING=new Set(['id','uuid','value','treeId','nodeId','actorId','key','group','sourceRef','profId','issue','code','kind','from','to','selectedId','bindingNote','requiresAll','requiresAny','excludes','perkId','perkUuid','sourceId','style','marker','head']);
const strings=(v,path='',out=[])=>{
  if(typeof v==='string')out.push([path,v]);
  else if(Array.isArray(v))v.forEach((x,i)=>strings(x,`${path}[${i}]`,out));
  else if(v&&typeof v==='object')for(const [k,x] of Object.entries(v))if(!WIRING.has(k))strings(x,`${path}.${k}`,out);
  return out;};
const assertContextClean=(ctx,where)=>{for(const [p,s] of strings(ctx))assertNoMachineText(s,`${where} ${p}`);};

test('player and GM view data never carries an id in a printed field',async()=>{
  for(const [user,tab] of [[owner,'trees'],[gm,'trees'],[gm,'library'],[gm,'setup']]){
    game.user=user;const app=api.open();app.activeTab=tab;app.actorId='hero';app.treeId='TREE-TP-PROF';
    app.editMode=user.isGM&&tab==='trees';app.nodeId='NODE-P2';
    assertContextClean(await app._prepareContext(),`${user.name} ${tab}`);
  }
});

test('GM Edit layout perk shelf shows names and status words, and still finds a perk by its id',async()=>{
  game.user=gm;const app=api.open();app.activeTab='trees';app.treeId='TREE-TP-PROF';app.editMode=true;app.actorId='hero';
  let ctx=await app._prepareContext();
  assert.deepEqual(ctx.features.map(f=>f.statusText),['Approved','Approved']);
  app.search='tp-p2';ctx=await app._prepareContext();
  assert.deepEqual(ctx.features.map(f=>f.name),['[TEST] Perk P2'],'search by id still matches');
  assertContextClean(ctx,'shelf');
  app.search='';app.nodeId='NODE-P1';ctx=await app._prepareContext();
  assert.ok(ctx.bindingNote,'the id stays available for the Details fold');
  assert.equal(ctx.bindingName,'[TEST] Perk P1');
});

test('the template prints ids only in the GM Details fold',async()=>{
  const tpl=await fs.readFile(new URL('../templates/tree.hbs',import.meta.url),'utf8');
  const bare=tpl.replace(/\sdata-[a-z-]+="[^"]*"/g,'').replace(/\s(?:value|id|for|name)="[^"]*"/g,'');
  for(const field of ['id','perkId','sourceRef','treeId','nodeId','bindingNote'])
    for(const m of bare.matchAll(new RegExp(`\\{\\{\\{?${field}\\}?\\}\\}`,'g'))){
      const before=bare.slice(0,m.index);
      assert.ok(field==='bindingNote'&&before.lastIndexOf('<details')>before.lastIndexOf('</details>'),`{{${field}}} is printed outside the Details fold`);
    }
});

test('embed (player and GM) and messages name perks, never ids',async()=>{
  game.user=gm;await api.publish();
  for(const user of [owner,gm]){
    game.user=user;
    const el={innerHTML:'',isConnected:true,classList:{add(){},remove(){}},addEventListener(){},contains:()=>true};
    const view=api.embed.mount(el,{actorId:'hero',mode:'character'});
    assert.match(el.innerHTML,/Perk P1/);
    assertNoMachineText(el.innerHTML,`${user.name} embed`);view.unmount();
  }
  game.user=gm;
  await assert.rejects(()=>api.unlock(hero,'TREE-TP-PROF','NODE-P3'),e=>{assertNoMachineText(e.message,'unlock error');return /not in this world/.test(e.message);});
  const check=await api.canUnlock?.(hero,'TREE-TP-PROF','NODE-P3');
  if(check)assertNoMachineText(check.reason??'','unlock reason');
  assert.equal(findId('<button aria-label="Open Herbalism">Open</button>'),null);
});

test('Ledger import rows and import plan rows carry plain words only',async()=>{
  const {planLedgerImport,planTreeImport}=await import('../scripts/engine.mjs');
  const t={...prof,nodes:[node('P1','PERK-TP-P1',{name:''}),node('P2','PERK-TP-P2')]};
  for(const r of planLedgerImport(t,{unlocks:[],history:[]},['PERK-TP-P1','PERK-TP-P2','PERK-TP-NONE'],new Set(['PERK-TP-P2']))){
    assertNoMachineText(`${r.name??''} ${r.reason}`,'Ledger import row');
  }
  for(const r of planTreeImport({schema:'ag-skill-trees/0.3',trees:[prof]},[prof],{mode:'update'}).rows)assertNoMachineText(`${r.name} ${r.reason}`,'import plan row');
});
