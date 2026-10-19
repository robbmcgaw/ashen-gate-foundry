// v0.8.0 Award Gold: GM-only gold awards to dnd5e system.currency.gp, logged in stash history, with Undo.
// Mocked Foundry globals: proves the logic, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,planGoldAward,goldAwardEntry,planGoldUndo,readGp,goldCardHTML} from '../scripts/core.mjs';
import {readForm} from '../scripts/dialogs.mjs';

test('plan: each vs split, remainder kept back, bad input refused',()=>{
 const rs=[{id:'a',name:'A',gp:5},{id:'b',name:'B',gp:0},{id:'c',name:'C',gp:12}];
 const each=planGoldAward({amount:200,recipients:rs});
 assert.deepEqual([each.share,each.remainder,each.total],[200,0,600]);assert.deepEqual(each.recipients.map(r=>r.after),[205,200,212]);
 const split=planGoldAward({amount:200,mode:'split',recipients:rs});
 assert.deepEqual([split.share,split.remainder,split.total],[66,2,198]);
 assert.throws(()=>planGoldAward({amount:2,mode:'split',recipients:rs}),/cannot be split/);
 for(const amount of [0,-5,1.5,'x'])assert.throws(()=>planGoldAward({amount,recipients:rs}),/whole number/);
 assert.throws(()=>planGoldAward({amount:1,recipients:[]}),/at least one/);
 assert.throws(()=>planGoldAward({amount:1,mode:'all',recipients:rs}),/Mode/);
 assert.equal(planGoldAward({amount:1,recipients:[rs[0],rs[0]]}).recipients.length,1,'duplicates collapse');
 assert.equal(readGp({system:{}}),null);assert.equal(readGp({system:{currency:{gp:null}}}),0);assert.equal(readGp({system:{currency:{gp:7}}}),7);
});
test('undo plan refuses spent gold and double undo',()=>{
 const e=goldAwardEntry({id:'g',plan:planGoldAward({amount:10,recipients:[{id:'a',name:'A',gp:0},{id:'b',name:'B',gp:0}]}),user:{id:'gm',name:'GM'}});
 const r=planGoldUndo(e,id=>id==='a'?15:4);assert.deepEqual(r.map(x=>x.ok),[true,false]);assert.match(r[1].reason,/B has 4 gp, fewer than the 10 gp/);
 assert.equal(planGoldUndo(e,()=>undefined)[0].reason,'A no longer exists.');
 assert.throws(()=>planGoldUndo({...e,recipients:e.recipients.map(x=>({...x,undone:true}))},()=>99),/already undone/);
 assert.throws(()=>planGoldUndo({kind:'deposit'},()=>0),/not a gold award/);
});
test('readForm collects ticked checkboxes into arrays',()=>{
 const f=readForm({elements:[{name:'n',value:'3'},{name:'r',type:'checkbox',value:'a',checked:true},{name:'r',type:'checkbox',value:'b',checked:false},{name:'r',type:'checkbox',value:'c',checked:true},{name:'p',type:'checkbox',value:'1',checked:false}]});
 assert.deepEqual(f,{n:'3',r:['a','c']});
});
test('chat card escapes names and states the remainder',()=>{
 const e=goldAwardEntry({plan:planGoldAward({amount:7,mode:'split',recipients:[{id:'a',name:'<b>A</b>',gp:0},{id:'b',name:'B',gp:0}]}),reason:'Session 1'});
 const h=goldCardHTML(e);assert.match(h,/7 gp split evenly/);assert.match(h,/&lt;b&gt;A/);assert.match(h,/1 gp left over was not handed out/);assert.match(h,/Session 1/);
});

// ---- Integration through main.mjs ----
const handlers={once:new Map(),on:new Map()};const settings=new Map();const chat=[];
globalThis.HTMLElement=class {};
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(o){this.options=o;this.rendered=false;}async render(){this.rendered=true;return this;}async close(){this.rendered=false;}}}}};
const gm={id:'gm',name:'GM',isGM:true,active:true},alice={id:'alice',name:'Alice',isGM:false,active:true},bob={id:'bob',name:'Bob',isGM:false,active:true},dan={id:'dan',name:'Dan',isGM:false,active:false};
const updates=[];
function mkActor(id,name,owner,currency={pp:1,gp:10,ep:2,sp:3,cp:4}){const a={id,name,type:'character',documentName:'Actor',statuses:new Set(),effects:[],items:[],flags:{},system:{currency:{...currency},hp:{value:9}},
 getFlag:()=>undefined,testUserPermission:(u,level)=>u.isGM||u.id===owner||level==='LIMITED',
 update:async d=>{updates.push({id,d});if(a.failNext){a.failNext=false;throw Error('locked');}for(const [k,v] of Object.entries(d)){const path=k.split('.'),last=path.pop();path.reduce((o,p)=>o[p],a)[last]=v;}}};return a;}
const [wren,ash,rook,vale]=[mkActor('pcA','[TEST] Wren','alice'),mkActor('pcB','[TEST] Ash','bob'),mkActor('pcC','[TEST] Rook','dan'),mkActor('pcD','[TEST] Vale','alice')];
const users=[gm,alice,bob,dan];users.get=id=>users.find(u=>u.id===id);
const actors=[wren,ash,rook,vale];actors.get=id=>actors.find(a=>a.id===id);
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{OBSERVER:2}};
globalThis.ChatMessage={create:async d=>{chat.push(d);return d;},getSpeaker:()=>({alias:'GM'})};
globalThis.game={user:gm,users,actors,time:{worldTime:1000},modules:new Map([[ID,{id:ID,active:true}]]),tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,o)=>settings.set(`${ns}.${key}`,{value:o.default,onChange:o.onChange}),get:(ns,key)=>{const x=settings.get(`${ns}.${key}`);if(!x)throw Error('not registered');return x.value;},set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}},
 socket:{emit:()=>{},on:()=>{}}};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[],Item:{typeLabels:{}}};
globalThis.ui={notifications:{info:()=>{},warn:()=>{},error:()=>{}}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>handlers.on.set(k,fn),off:()=>{}};
await import('../scripts/main.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api;
const hist=()=>game.settings.get(ID,'stashHistory');
const coins=a=>({...a.system.currency});

test('players are rejected by the API itself, nothing changes',async()=>{
 game.user=alice;
 await assert.rejects(api.awardGold({amount:200,actorIds:['pcA']}),/GM only/);
 await assert.rejects(api.undoGoldAward('x'),/GM only/);
 assert.throws(()=>api.gold.defaultRecipients(),/GM only/);
 game.user=gm;assert.equal(wren.system.currency.gp,10);assert.equal(updates.length,0);assert.equal(hist().length,0);
});
test('default recipients: dnd5e primary party members, else characters of connected players',()=>{
 game.actors.party={name:'[TEST] Party',system:{members:[{actor:wren},{actor:rook}]}};
 assert.deepEqual(api.gold.defaultRecipients(),{source:'party',partyName:'[TEST] Party',actorIds:['pcA','pcC']});
 delete game.actors.party;
 const d=api.gold.defaultRecipients();assert.equal(d.source,'players');
 assert.deepEqual(d.actorIds.sort(),['pcA','pcB','pcD'],'Rook belongs to an offline player');
});
test('award each: one update per actor, only gp changes, history + GM-whispered card',async()=>{
 updates.length=0;chat.length=0;const before=coins(ash);
 const {entry,failed}=await api.awardGold({amount:200,actorIds:['pcA','pcB'],reason:'Session 1'});
 assert.deepEqual(failed,[]);
 assert.deepEqual(updates,[{id:'pcA',d:{'system.currency.gp':210}},{id:'pcB',d:{'system.currency.gp':210}}]);
 assert.deepEqual(coins(ash),{...before,gp:210});assert.equal(ash.system.hp.value,9);
 const h=hist().at(-1);assert.equal(h.id,entry.id);
 assert.deepEqual({kind:h.kind,approval:h.approval,amount:h.amount,mode:h.mode,share:h.share,remainder:h.remainder,reason:h.reason,public:h.public,userId:h.userId,userName:h.userName,worldTime:h.worldTime},
  {kind:'gold-award',approval:'gm',amount:200,mode:'each',share:200,remainder:0,reason:'Session 1',public:false,userId:'gm',userName:'GM',worldTime:1000});
 assert.ok(h.realTime>0);
 assert.deepEqual(h.recipients,[{actorId:'pcA',actorName:'[TEST] Wren',before:10,added:200,after:210,undone:false},{actorId:'pcB',actorName:'[TEST] Ash',before:10,added:200,after:210,undone:false}]);
 assert.equal(chat.length,1);assert.deepEqual(chat[0].whisper,['gm']);assert.match(chat[0].content,/200 gp each/);
});
test('award split: remainder is not paid and is recorded; public card has no whisper',async()=>{
 chat.length=0;
 const {entry}=await api.awardGold({amount:100,mode:'split',actorIds:['pcA','pcB','pcC'],public:true});
 assert.deepEqual([entry.share,entry.remainder],[33,1]);assert.equal(rook.system.currency.gp,43);
 assert.deepEqual(chat[0].whisper,[]);assert.match(chat[0].content,/1 gp left over/);
});
test('missing dnd5e currency fails clearly before anyone is paid',async()=>{
 updates.length=0;const odd=mkActor('npcX','[TEST] Odd',null);delete odd.system.currency;actors.push(odd);
 await assert.rejects(api.awardGold({amount:5,actorIds:['pcA','npcX']}),/no dnd5e gold \(system\.currency\.gp\)/);
 assert.equal(updates.length,0);actors.pop();
});
test('undo: full, then double undo refused',async()=>{
 const {entry}=await api.awardGold({amount:50,actorIds:['pcA','pcB']});const a=wren.system.currency.gp,b=ash.system.currency.gp;
 const res=await api.undoGoldAward(entry.id);
 assert.deepEqual(res.map(r=>[r.ok,r.removed]),[[true,50],[true,50]]);
 assert.deepEqual([wren.system.currency.gp,ash.system.currency.gp],[a-50,b-50]);
 const h=hist().find(x=>x.id===entry.id);assert.ok(h.recipients.every(r=>r.undone));assert.equal(h.undo.length,1);
 await assert.rejects(api.undoGoldAward(entry.id),/already undone/);
 assert.equal(wren.system.currency.gp,a-50);
});
test('undo partial: spent gold is refused per actor, never negative; a later retry only touches the rest',async()=>{
 const {entry}=await api.awardGold({amount:500,actorIds:['pcA','pcD']});
 vale.system.currency.gp=100;// spent most of it
 const res=await api.undoGoldAward(entry.id);
 assert.deepEqual(res.map(r=>r.ok),[true,false]);assert.match(res[1].reason,/\[TEST\] Vale has 100 gp, fewer than the 500 gp awarded/);
 assert.equal(vale.system.currency.gp,100);
 vale.system.currency.gp=600;updates.length=0;
 const again=await api.undoGoldAward(entry.id);
 assert.deepEqual(again.map(r=>[r.actorId,r.ok]),[['pcD',true]]);assert.deepEqual(updates,[{id:'pcD',d:{'system.currency.gp':100}}]);
 await assert.rejects(api.undoGoldAward(entry.id),/already undone/);
});
test('a failed actor update is reported, the rest are paid and logged',async()=>{
 ash.failNext=true;const {entry,failed}=await api.awardGold({amount:1,actorIds:['pcA','pcB']});
 assert.deepEqual(entry.recipients.map(r=>r.actorId),['pcA']);assert.deepEqual(failed,[{actorName:'[TEST] Ash',reason:'locked'}]);
});
test('players see only public gold awards, without gp totals; old entries pass through',async()=>{
 const old={id:'old1',kind:'deposit',approval:'not-required',moved:true,userName:'Alice',actorName:'Wren',itemName:'Rope',quantity:1,realTime:1};
 await game.settings.set(ID,'stashHistory',[old,...hist()]);
 await game.settings.set(ID,'playerAccessEnabled',true);await game.settings.set(ID,'stashEnabled',true);
 game.user=alice;
 try{
  const seen=api.stash.history();
  assert.deepEqual(seen[0],old);
  const gold=seen.filter(h=>h.kind==='gold-award');assert.equal(gold.length,1);assert.equal(gold[0].public,true);
  assert.ok(gold[0].recipients.every(r=>r.before===undefined&&r.after===undefined));
 }finally{game.user=gm;}
});
test('GM History tab renders old entries and gold rows with Undo only while something is left to undo',async()=>{
 const stash={...mkActor('stash','Ashen Gate | Party Stash',null),type:'npc',items:Object.assign([],{size:0,get:()=>null}),getFlag:(ns,k)=>ns===ID&&k==='partyStash'?true:undefined,flags:{[ID]:{partyStash:true}}};
 actors.push(stash);
 try{
  const app=await api.open();app.tab='inventory';app.stashTab='history';
  const html=await app._renderHTML();
  assert.match(html,/Alice \(Wren\) put Rope in the stash/,'old deposit row still renders');
  assert.match(html,/GM awarded 200 gp each to \[TEST\] Wren, \[TEST\] Ash/);
  assert.match(html,/GM split 100 gp between/);assert.match(html,/1 gp not handed out/);
  assert.match(html,/Session 1/);assert.match(html,/\[TEST\] Vale \+500 gp \(10 → 510\) · undone/);
  const undoButtons=html.match(/data-action="gold-undo"/g)??[];
  const open=hist().filter(h=>h.kind==='gold-award'&&h.recipients.some(r=>!r.undone)).length;
  assert.equal(undoButtons.length,open);assert.ok(open>0);
  assert.match(html,/data-action="gold-award"/);
 }finally{actors.pop();}
});
test('dialog: party ticked by default, confirmation shows each share and the remainder, Cancel is left',async()=>{
 game.actors.party={name:'[TEST] Party',system:{members:[wren,ash]}};
 const seen=[];const gp0=[wren.system.currency.gp,ash.system.currency.gp];
 foundry.applications.api.DialogV2={wait:async o=>{seen.push(o);
  if(seen.length===1)return o.buttons.find(b=>b.action==='ok').callback({},{form:{elements:[{name:'amount',value:'25'},{name:'mode',value:'split'},{name:'reason',value:'Session 1'},
   {name:'recipients',type:'checkbox',value:'pcA',checked:true},{name:'recipients',type:'checkbox',value:'pcB',checked:true},{name:'public',type:'checkbox',value:'1',checked:false}]}});
  return o.buttons.find(b=>b.action==='confirm').callback();}};
 try{
  const out=await api.gold.openDialog();
  assert.match(seen[0].content,/value="pcA" checked/);assert.match(seen[0].content,/value="pcB" checked/);assert.doesNotMatch(seen[0].content,/value="pcC" checked/);
  assert.match(seen[0].content,/members of \[TEST\] Party/);
  assert.deepEqual(seen[1].buttons.map(b=>b.label),['Cancel','Award 24 gp']);
  assert.match(seen[1].content,/12 gp each/);assert.match(seen[1].content,/1 gp left over will NOT be handed out/);assert.match(seen[1].content,/GM only/);
  assert.deepEqual([wren.system.currency.gp,ash.system.currency.gp],[gp0[0]+12,gp0[1]+12]);assert.equal(out.entry.reason,'Session 1');
  // Cancel at the confirmation pays nobody.
  seen.length=0;foundry.applications.api.DialogV2={wait:async o=>{seen.push(o);return seen.length===1?o.buttons.find(b=>b.action==='ok').callback({},{form:{elements:[{name:'amount',value:'9'},{name:'recipients',type:'checkbox',value:'pcA',checked:true}]}}):o.buttons.find(b=>b.action==='cancel').callback();}};
  assert.equal(await api.gold.openDialog(),null);assert.equal(wren.system.currency.gp,gp0[0]+12);
 }finally{delete foundry.applications.api.DialogV2;delete game.actors.party;}
});
