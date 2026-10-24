// 0.13.2: canonical ids never show in the UI. Mocked Foundry globals; proves the markup and messages, not the live window.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyState,applyOperation,freeSpot} from '../js/logic.mjs';
import {buildPlayerView} from '../js/player-view.mjs';
import {rankRulesPayload} from '../js/setup-form.mjs';
import {planFacilityImport} from '../js/logic.mjs';
import {assertNoIds,assertNoMachineText,findId} from '../../../scripts/test-helpers/no-ids.mjs';
import {embedHTML} from '../js/embed.mjs';

const hooks={once:{},on:{}};
const warnings=[],writes=[],infos=[];
let dialog=null,answer='cancel';
const gm={id:'gm',isGM:true,active:true,name:'GM'};
const player={id:'p1',isGM:false,active:true,name:'[TEST] Player'};
const AT=Date.UTC(2026,9,1,12,0,0);
const step=(s,op,p={},now)=>applyOperation(s,gm,op,p,now);
let state=step(emptyState(),'activate',{hq_ref:'HQ-TEST-001',location_ref:'LOC-TEST-001',campaign_key:'test',guild_key:'primary'});
state=step(state,'load_demo');state=step(state,'unlock_facility',{facility_ref:'FAC-DEMO-FORGE'});
state=step(state,'acquire',{facility_ref:'FAC-DEMO-FORGE',key:'copy_a'});
state=step(state,'acquire',{facility_ref:'FAC-DEMO-FORGE',key:'copy_b'});
state=step(state,'lock');
state=step(state,'install',{room_key:'common',key:'copy_a',x:0,y:0});
state=step(state,'add_rooms',{users:[{id:'p1'}]});
state=step(state,'register_hireling',{hireling_ref:'HIRE-TEST-ADA'});
state=step(state,'register_hireling',{hireling_ref:'HIRE-TEST-BEN'});
state=step(state,'assign_staff',{hireling_ref:'HIRE-TEST-ADA',installation_key:'copy_a'});
state=step(state,'depart_hireling',{hireling_ref:'HIRE-TEST-BEN',status:'retired',confirm:true},AT);
const hire=(id,name)=>({name,img:null,uuid:`Item.${id}`,flags:{'ashen-gate-manager':{source:{sourceId:id,entityType:'Hireling',visibility:'gm'}}}});
const settings=new Map([['ashen-gate-headquarters.playerAccessEnabled',true],['ashen-gate-headquarters.state',state]]);
const vault={id:'vault',ownership:{default:0},flags:{},update:async d=>{writes.push({vault:d});}};
let closed=0;
globalThis.foundry={applications:{api:{
  ApplicationV2:class{constructor(o){this.options=o;}render(){}close(){closed++;}},
  HandlebarsApplicationMixin:B=>class extends B{},
  DialogV2:{wait:async o=>{dialog=o;return o.buttons.find(b=>b.action===answer).callback();},prompt:async o=>{dialog=o;}}
}}};
globalThis.Hooks={once:(k,f)=>{hooks.once[k]=f;},on:(k,f)=>{(hooks.on[k]??=[]).push(f);return k;},off:()=>{}};
globalThis.ui={notifications:{warn:m=>warnings.push(m),info:m=>infos.push(m),error:m=>warnings.push(m)}};
globalThis.document={querySelectorAll:()=>[]};
let menu;
const mod={id:'ashen-gate-headquarters',version:'0.13.2'};
globalThis.game={user:gm,users:Object.assign(new Map([['gm',gm],['p1',player]]),{activeGM:gm}),modules:{get:()=>mod},
  settings:{register:()=>{},registerMenu:(_m,_k,o)=>{menu=o;},get:(m,k)=>structuredClone(settings.get(`${m}.${k}`)),set:async(m,k,v)=>{writes.push({[k]:v});settings.set(`${m}.${k}`,v);}},
  keybindings:{register:()=>{}},journal:{contents:[],get:()=>null},items:{contents:[hire('HIRE-TEST-ADA','[TEST] Ada'),hire('HIRE-TEST-BEN','[TEST] Ben'),hire('HIRE-TEST-CAL','[TEST] Cal')]},actors:{contents:[]}};
globalThis.JournalEntry={create:async d=>Object.assign(vault,d,{id:'vault'})};
await import('../js/main.mjs');
hooks.once.init();
await hooks.once.ready();
const code=readFileSync(new URL('../js/main.mjs',import.meta.url),'utf8');
const app=()=>{const a=new menu.type();clearInterval(a.leaseTimer);a.render=()=>{a.rendered=(a.rendered??0)+1;};return a;};
const read=()=>game.modules.get().api.getState();
const reset=()=>{writes.length=0;warnings.length=0;infos.length=0;dialog=null;};
const click=async(a,dataset,root={querySelector:()=>null})=>{reset();const btn={dataset};
  await a.click({target:{closest:sel=>sel==='button'?btn:null},preventDefault(){}},root);};
globalThis.FormData=class{constructor(form){this.v=form.values;}get(k){return k in this.v?this.v[k]:null;}entries(){return Object.entries(this.v);}};
const submit=async(a,name,values)=>{reset();const form={dataset:{aghqForm:name},values};await a.submit({target:{closest:()=>form},preventDefault(){}});};
const ANY_ID=/\b(?:HIRE|HQ|FAC|LOC)-[A-Z0-9]+(?:-[A-Z0-9]+)*/;
const seen=html=>`${html}`.replace(/<details class="aghq-iddetails"[\s\S]*?<\/details>/g,'');
const noIds=(html,where)=>{assertNoMachineText(seen(html),where);assert.equal(seen(html).replace(/<[^>]*>/g,' ').match(ANY_ID),null,`${where} shows an id`);};
const views=['activation','builder','quarters','benefits','hirelings','facilities','manage'];

test('every main view hides canonical ids for the GM (ids live only in Details folds)',()=>{
  for(const sub of ['facilities','decorations']){
    for(const tab of views){const a=app();a.tab=tab;a.facSub=sub;noIds(a.page(read()),`GM ${tab}`);}
  }
  const a=app();a.tab='builder';a.selectedCopy='copy_a';noIds(a.page(read()),'GM builder with a selected facility');
  a.tab='quarters';a.selectedCopy='copy_a';noIds(a.page(read()),'GM quarters');
  a.tab='hirelings';noIds(a.page(read()),'GM hirelings');
});

test('the GM Details fold keeps the id and a Copy ID button',()=>{
  const a=app();a.tab='facilities';const html=a.page(read());
  assert.match(html,/<details class="aghq-iddetails"[^>]*><summary>Details<\/summary>[\s\S]*FAC-DEMO-FORGE[\s\S]*data-action="copy-id"/);
  a.tab='hirelings';assert.match(a.page(read()),/aghq-iddetails/);
});

test('an unactivated Guildhall (activation form and facility library) shows no ids',()=>{
  const saved=settings.get('ashen-gate-headquarters.state');
  const fresh={...emptyState(),catalog:read().catalog};
  const a=app();a.tab='activation';noIds(a.activation(fresh,true),'activation');
  assert.ok(!/placeholder="[^"]*-EXAMPLE/.test(a.activation(fresh,true)));
  settings.set('ashen-gate-headquarters.state',saved);
});

test('player views show no ids',()=>{
  const full=read();game.user=player;
  try{
    for(const tab of ['builder','quarters','benefits','activation']){const a=app();a.tab=tab;a.selectedCopy='copy_a';noIds(a.page(full),`player ${tab}`);}
  }finally{game.user=gm;}
});

test('the Character Hub embed shows no ids',()=>{
  const actor={id:'a1',name:'[TEST] Hero',testUserPermission:(u)=>u.id==='p1'};
  const view=buildPlayerView(read(),actor,[gm,player]);
  assert.ok(view.facilities.length>0);
  noIds(embedHTML({canOpen:()=>true,isGM:()=>false,userOwns:()=>true,actorById:()=>actor,view:()=>view,open(){}},'a1'),'embed');
});

test('error and notification text uses names, not ids',async()=>{
  assert.throws(()=>step(step(emptyState(),'load_demo'),'activate',{hq_ref:'bad',location_ref:'bad',campaign_key:'t',guild_key:'primary'}),e=>!findId(e.message)&&!ANY_ID.test(e.message));
  const planned=planFacilityImport([{id:'FAC-BROKEN',name:'[TEST] Broken'},{id:'FAC-BROKEN',name:'[TEST] Broken'}]);
  for(const e of planned.errors)assert.ok(!ANY_ID.test(e)&&/Broken|Facility 1/.test(e),e);
  const a=app();a.tab='hirelings';
  noIds(a.hirelingName('HIRE-TEST-ADA'),'hireling name');
  assert.equal(a.hirelingName('HIRE-NOPE'),'this hireling');
});

test('GM Setup rank unlocks are named checkboxes that still save the same refs',()=>{
  const a=app();a.tab='manage';const html=a.page(read());
  noIds(html,'GM Setup');
  assert.match(html,/type="checkbox" name="unlock_1" value="FAC-DEMO-FORGE"[^>]*> \[?[^<]*/);
  const data={getAll:k=>k==='unlock_2'?['FAC-DEMO-FORGE','FAC-DEMO-DESK']:[],get:()=>null};
  assert.deepEqual(rankRulesPayload(data)[1].unlock_refs,['FAC-DEMO-FORGE','FAC-DEMO-DESK']);
});

test('machine tokens (statuses, stage keys, relations, recipients) never show as raw text',()=>{
  const full=read();
  full.catalog=full.catalog.map(d=>({...d,status:'reveal_gated',stages:d.stages.map(t=>({...t,label:'',benefits:(t.benefits??[]).map(b=>({...b,recipient:'also_available_as_journal'}))}))}));
  for(const user of [gm,player]){
    game.user=user;
    try{for(const tab of ['builder','quarters','benefits','hirelings','facilities','manage']){const a=app();a.tab=tab;a.selectedCopy='copy_a';noIds(a.page(full),`${user.isGM?'GM':'player'} ${tab} with raw tokens`);}}
    finally{game.user=gm;}
  }
  const actor={id:'a1',name:'[TEST] Hero',testUserPermission:(u)=>u.id==='p1'};
  assertNoMachineText(embedHTML({canOpen:()=>true,isGM:()=>false,userOwns:()=>true,actorById:()=>actor,view:()=>buildPlayerView(full,actor,[gm,player]),open(){}},'a1'),'embed with raw tokens');
  assert.throws(()=>step(read(),'no_such_op'),e=>!/no_such_op/.test(e.message));
});
