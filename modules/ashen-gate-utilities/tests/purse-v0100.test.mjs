// v0.10.0 party purse (dnd5e system.currency on the stash Actor), coin-type Award Gold, stash table columns.
// Mocked Foundry globals: proves the logic, not the live Foundry UI or layout.
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ID,COINS,readCoin,readCoins,planCoinMove,planPurseAdjust,purseEntry,planPurseUndo,purseUndoable,planGoldAward,goldAwardEntry,planGoldUndo,goldCardHTML} from '../scripts/core.mjs';

test('coins read from dnd5e currency; blank is 0, missing currency is null',()=>{
 assert.deepEqual(COINS,['cp','sp','ep','gp','pp']);
 assert.deepEqual(readCoins({system:{currency:{gp:3,sp:'',pp:null}}}),{cp:0,sp:0,ep:0,gp:3,pp:0});
 assert.equal(readCoins({system:{}}),null);assert.equal(readCoin({system:{currency:{}}},'xx'),null);
});
test('deposit/take bounds: whole amounts only, never more than the giver holds',()=>{
 const p=planCoinMove({kind:'deposit',coin:'gp',amount:5,actorHas:10,purseHas:0});
 assert.deepEqual([p.actorAfter,p.purseAfter],[5,5]);
 assert.throws(()=>planCoinMove({kind:'deposit',coin:'gp',amount:11,actorHas:10,purseHas:0,actorName:'W'}),/W has 10 gp, fewer than 11 gp/);
 assert.throws(()=>planCoinMove({kind:'take',coin:'sp',amount:3,actorHas:0,purseHas:2}),/purse has 2 sp, fewer than 3 sp/);
 for(const amount of [0,-1,1.5,'x','',null])assert.throws(()=>planCoinMove({kind:'take',coin:'gp',amount,actorHas:9,purseHas:9}),/whole number/);
 assert.throws(()=>planCoinMove({kind:'take',coin:'zz',amount:1,actorHas:9,purseHas:9}),/Coin must be/);
 const t=planCoinMove({kind:'take',coin:'cp',amount:2,actorHas:0,purseHas:2});assert.deepEqual([t.actorAfter,t.purseAfter],[2,0]);
});
test('GM adjust: add, remove (not below 0), set (0 allowed), no-op refused',()=>{
 assert.equal(planPurseAdjust({op:'add',coin:'sp',amount:4,purseHas:1}).purseAfter,5);
 assert.equal(planPurseAdjust({op:'set',coin:'sp',amount:0,purseHas:1}).purseAfter,0);
 assert.throws(()=>planPurseAdjust({op:'remove',coin:'sp',amount:2,purseHas:1}),/fewer than 2 sp/);
 assert.throws(()=>planPurseAdjust({op:'set',coin:'sp',amount:1,purseHas:1}),/already has/);
 assert.throws(()=>planPurseAdjust({op:'add',coin:'sp',amount:0,purseHas:1}),/whole number from 1/);
});
test('purse undo refusal rules: no negative, no double undo, deposits and failed takes are not undoable',()=>{
 const add=purseEntry({kind:'purse-adjust',approval:'gm',plan:planPurseAdjust({op:'add',coin:'gp',amount:10,purseHas:0})});
 assert.equal(planPurseUndo(add,{purseHas:4}).ok,false);assert.match(planPurseUndo(add,{purseHas:4}).reason,/has 4 gp, fewer than the 10 gp added/);
 assert.equal(planPurseUndo(add,{purseHas:12}).purseNext,2);
 const rem=purseEntry({kind:'purse-adjust',approval:'gm',plan:planPurseAdjust({op:'remove',coin:'gp',amount:3,purseHas:5})});
 assert.equal(planPurseUndo(rem,{purseHas:0}).purseNext,3,'undoing a removal puts the coins back');
 assert.throws(()=>planPurseUndo({...add,undone:true},{purseHas:99}),/already undone/);
 const dep=purseEntry({kind:'purse-deposit',approval:'not-required',plan:planCoinMove({kind:'deposit',coin:'gp',amount:1,actorHas:1,purseHas:0})});
 assert.equal(purseUndoable(dep),false);assert.throws(()=>planPurseUndo(dep,{purseHas:1}),/Deposits are not undone/);
 const denied=purseEntry({kind:'purse-take',approval:'denied',plan:planCoinMove({kind:'take',coin:'gp',amount:1,actorHas:0,purseHas:1})});
 assert.equal(denied.moved,false);assert.equal(purseUndoable(denied),false);
 const take=purseEntry({kind:'purse-take',approval:'accepted',actor:{id:'a',name:'W'},plan:planCoinMove({kind:'take',coin:'gp',amount:2,actorHas:0,purseHas:5})});
 assert.match(planPurseUndo(take,{purseHas:3,actorHas:1}).reason,/W has 1 gp, fewer than the 2 gp taken/);
 assert.match(planPurseUndo(take,{purseHas:3,actorHas:undefined}).reason,/no longer exists/);
 assert.deepEqual([planPurseUndo(take,{purseHas:3,actorHas:2}).purseNext,planPurseUndo(take,{purseHas:3,actorHas:2}).actorNext],[5,0]);
});
test('Award Gold coin choice: same each/split logic, old gp entries still read as gp',()=>{
 const plan=planGoldAward({amount:7,mode:'split',coin:'sp',recipients:[{id:'a',name:'A',held:1},{id:'b',name:'B',held:0}]});
 assert.deepEqual([plan.coin,plan.share,plan.remainder,plan.recipients[0].after],['sp',3,1,4]);
 const e=goldAwardEntry({plan});assert.equal(e.coin,'sp');assert.match(goldCardHTML(e),/Coins awarded: 7 sp split evenly/);
 const old={...goldAwardEntry({plan:planGoldAward({amount:2,recipients:[{id:'a',name:'A',gp:0}]})})};delete old.coin;
 const asked=[];planGoldUndo(old,(id,coin)=>{asked.push(coin);return 5;});assert.deepEqual(asked,['gp']);
 assert.throws(()=>planGoldAward({amount:1,coin:'xp',recipients:[{id:'a',held:0}]}),/Coin must be/);
});
test('stash header and rows share one column definition (no auto column), also when narrow',()=>{
 const css=fs.readFileSync(new URL('../styles/utilities.css',import.meta.url),'utf8');
 const tmpl=css.match(/\.agu-stash-grid \{[^}]*grid-template-columns:([^;]+);/);assert.ok(tmpl,'one grid rule for .agu-stash-grid');assert.equal(tmpl[1].trim(),'var(--agu-stash-cols)');
 const cols=[...css.matchAll(/--agu-stash-cols:([^;]+);/g)].map(m=>m[1].trim());
 assert.equal(cols.length,2,'wide and narrow templates');for(const c of cols)assert.doesNotMatch(c,/\bauto\b/);
 assert.equal(cols[0].split(/\s+(?![^(]*\))/).length,7,'seven columns: icon, Item, Qty, Weight, Value, Type, Action');
 assert.doesNotMatch(css,/\.agu-stash-(head|row)[^{]*\{[^}]*grid-template-columns/,'header/row never set their own template');
});

// ---- Integration through main.mjs ----
const handlers={once:new Map(),on:new Map()};const settings=new Map();const sent=[];const updates=[];let socketHandler=null;
globalThis.HTMLElement=class {};
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(o){this.options=o;this.rendered=false;}async render(){this.rendered=true;return this;}async close(){this.rendered=false;}}}}};
const gm={id:'gm',name:'GM',isGM:true,active:true},alice={id:'alice',name:'Alice',isGM:false,active:true},bob={id:'bob',name:'Bob',isGM:false,active:true};
function mkItems(){const m=new Map();return {get:id=>m.get(id),get size(){return m.size;},[Symbol.iterator]:()=>m.values(),add(d){const it={...d,id:d.id,uuid:`Item.${d.id}`};m.set(it.id,it);return it;}};}
function mkActor(id,name,owner,flags={},currency={cp:0,sp:0,ep:0,gp:0,pp:0}){const a={id,name,type:owner?'character':'npc',documentName:'Actor',statuses:new Set(),effects:[],flags,
 system:{currency:{...currency},hp:{value:7}},ownership:{},items:mkItems(),getFlag:(ns,k)=>flags[ns]?.[k],testUserPermission:(u,level)=>u.isGM||u.id===owner||level==='LIMITED',
 update:async d=>{updates.push({id,d});if(a.failNext){a.failNext=false;throw Error('locked');}for(const [k,v] of Object.entries(d)){const path=k.split('.'),last=path.pop();path.reduce((o,p)=>o[p],a)[last]=v;}}};return a;}
const stash=mkActor('stash','Ashen Gate | Party Stash',null,{[ID]:{partyStash:true}});
const wren=mkActor('pcA','[TEST] Wren','alice',{},{cp:1,sp:2,ep:3,gp:10,pp:4}),ash=mkActor('pcB','[TEST] Ash','bob',{},{cp:0,sp:0,ep:0,gp:3,pp:0});
const users=[gm,alice,bob];users.get=id=>users.find(u=>u.id===id);
const actors=[stash,wren,ash];actors.get=id=>actors.find(a=>a.id===id);
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{OBSERVER:2}};
globalThis.ChatMessage={create:async d=>d,getSpeaker:()=>({})};
globalThis.game={user:gm,users,actors,time:{worldTime:50},modules:new Map([[ID,{id:ID,active:true}]]),tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,o)=>settings.set(`${ns}.${key}`,{value:o.default,onChange:o.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}},
 socket:{emit:(ch,msg)=>sent.push(msg),on:(ch,fn)=>{socketHandler=fn;}}};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[],Item:{typeLabels:{loot:'Loot',consumable:'Consumable'}}};
globalThis.ui={notifications:{info:()=>{},warn:()=>{},error:()=>{}}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>handlers.on.set(k,fn),off:()=>{}};
await import('../scripts/main.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api;
await game.settings.set(ID,'playerAccessEnabled',true);
const tick=()=>new Promise(r=>setTimeout(r,5));
const receipt=id=>sent.find(m=>m.type==='receipt'&&m.requestId===id);
const voteRequest=()=>sent.filter(m=>m.type==='stash-vote-request').at(-1);
const hist=()=>game.settings.get(ID,'stashHistory');
const onlyCurrency=list=>list.every(u=>Object.keys(u.d).length===1&&/^system\.currency\.(cp|sp|ep|gp|pp)$/.test(Object.keys(u.d)[0]));

test('player cannot adjust the purse: the API itself refuses',async()=>{
 game.user=alice;
 await assert.rejects(api.purse.adjust({coin:'gp',op:'add',amount:5}),/GM only/);
 await assert.rejects(api.purse.undo('x'),/GM only/);
 game.user=gm;assert.equal(updates.length,0);assert.equal(hist().length,0);
});
test('stash off for players: players cannot see or move coins, the GM still can',async()=>{
 game.user=alice;assert.throws(()=>api.purse.totals(),/turned the party stash off/);
 await assert.rejects(api.purse.deposit({actorId:'pcA',coin:'gp',amount:1}),/turned the party stash off/);
 game.user=gm;await socketHandler({type:'purse-deposit',requestId:'off',userId:'alice',actorId:'pcA',coin:'gp',amount:1},'alice');await tick();
 assert.equal(receipt('off').ok,false);assert.equal(wren.system.currency.gp,10);
 assert.deepEqual(api.purse.totals(),{cp:0,sp:0,ep:0,gp:0,pp:0});
 await api.stash.setEnabled(true);updates.length=0;
});
test('deposit 5 gp from a character: GM client moves it, one update per document, only currency, history entry',async()=>{
 game.user=alice;const p=api.purse.deposit({actorId:'pcA',coin:'gp',amount:5});const req=sent.at(-1);assert.equal(req.type,'purse-deposit');
 assert.equal(updates.length,0,'the player client changes nothing itself');
 game.user=gm;await socketHandler(req,'alice');await tick();assert.equal(receipt(req.requestId).ok,true);
 game.user=alice;await socketHandler(receipt(req.requestId));assert.match(await p,/put 5 gp in the party purse/);game.user=gm;
 assert.deepEqual(updates,[{id:'stash',d:{'system.currency.gp':5}},{id:'pcA',d:{'system.currency.gp':5}}]);
 assert.deepEqual(wren.system.currency,{cp:1,sp:2,ep:3,gp:5,pp:4});assert.equal(wren.system.hp.value,7);
 const h=hist().at(-1);
 assert.deepEqual({kind:h.kind,approval:h.approval,userName:h.userName,actorName:h.actorName,coin:h.coin,amount:h.amount,purse:[h.purseBefore,h.purseAfter],actor:[h.actorBefore,h.actorAfter]},
  {kind:'purse-deposit',approval:'not-required',userName:'Alice',actorName:'[TEST] Wren',coin:'gp',amount:5,purse:[0,5],actor:[10,5]});
});
test('deposit bounds and ownership are re-checked on the GM client',async()=>{
 updates.length=0;
 await socketHandler({type:'purse-deposit',requestId:'d2',userId:'alice',actorId:'pcA',coin:'pp',amount:5},'alice');await tick();
 assert.match(receipt('d2').message,/has 4 pp, fewer than 5 pp/);
 await socketHandler({type:'purse-deposit',requestId:'d3',userId:'alice',actorId:'pcB',coin:'gp',amount:1},'alice');await tick();
 assert.match(receipt('d3').message,/do not own/);
 await socketHandler({type:'purse-deposit',requestId:'d4',userId:'alice',actorId:'pcA',coin:'gp',amount:-3},'alice');await tick();
 assert.match(receipt('d4').message,/whole number/);
 assert.equal(updates.length,0);
});
test('take with the vote: a deny keeps the coins and is logged; all accepts move them',async()=>{
 socketHandler({type:'purse-take',requestId:'t1',userId:'alice',actorId:'pcA',coin:'gp',amount:2},'alice');await tick();
 let vr=voteRequest();assert.deepEqual(vr.voters,['bob']);assert.equal(vr.item,'2 gp');
 await socketHandler({type:'stash-vote',pollId:vr.pollId,userId:'bob',vote:'deny'},'bob');await tick();
 assert.match(receipt('t1').message,/denied taking 2 gp/);assert.equal(stash.system.currency.gp,5);
 assert.deepEqual([hist().at(-1).kind,hist().at(-1).approval,hist().at(-1).moved],['purse-take','denied',false]);
 updates.length=0;
 socketHandler({type:'purse-take',requestId:'t2',userId:'alice',actorId:'pcA',coin:'gp',amount:2},'alice');await tick();
 vr=voteRequest();await socketHandler({type:'stash-vote',pollId:vr.pollId,userId:'bob',vote:'accept'},'bob');await tick();
 assert.equal(receipt('t2').ok,true);assert.deepEqual([stash.system.currency.gp,wren.system.currency.gp],[3,7]);
 assert.deepEqual(updates,[{id:'pcA',d:{'system.currency.gp':7}},{id:'stash',d:{'system.currency.gp':3}}]);
 assert.deepEqual([hist().at(-1).approval,hist().at(-1).purseAfter],['accepted',3]);
});
test('take: silence until the deadline cancels; more than the purse holds is refused before any vote',async()=>{
 mock.timers.enable({apis:['setTimeout']});
 try{socketHandler({type:'purse-take',requestId:'t3',userId:'alice',actorId:'pcA',coin:'gp',amount:1},'alice');await Promise.resolve();await Promise.resolve();mock.timers.tick(60001);}
 finally{mock.timers.reset();}
 await tick();assert.match(receipt('t3').message,/in time/);assert.equal(stash.system.currency.gp,3);
 const before=sent.filter(m=>m.type==='stash-vote-request').length;
 await socketHandler({type:'purse-take',requestId:'t4',userId:'alice',actorId:'pcA',coin:'gp',amount:4},'alice');await tick();
 assert.match(receipt('t4').message,/purse has 3 gp, fewer than 4 gp/);assert.equal(sent.filter(m=>m.type==='stash-vote-request').length,before);
});
test('take with the vote turned off needs no vote',async()=>{
 await api.stash.setVoteRequired(false);const before=sent.filter(m=>m.type==='stash-vote-request').length;
 await socketHandler({type:'purse-take',requestId:'t5',userId:'alice',actorId:'pcA',coin:'gp',amount:1},'alice');await tick();
 assert.equal(receipt('t5').ok,true);assert.equal(sent.filter(m=>m.type==='stash-vote-request').length,before);assert.equal(hist().at(-1).approval,'not-required');
 await api.stash.setVoteRequired(true);
});
test('GM adjusts silver with a reason, then Undo; undo of a spent take is refused, never negative',async()=>{
 updates.length=0;
 const e=await api.purse.adjust({coin:'sp',op:'add',amount:30,reason:'[TEST] sold loot'});
 assert.deepEqual(updates,[{id:'stash',d:{'system.currency.sp':30}}]);
 assert.deepEqual([e.kind,e.approval,e.op,e.purseBefore,e.purseAfter,e.reason],['purse-adjust','gm','add',0,30,'[TEST] sold loot']);
 stash.system.currency.sp=10;// the party spent some
 let r=await api.purse.undo(e.id);assert.equal(r.ok,false);assert.match(r.reason,/has 10 sp, fewer than the 30 sp added/);assert.equal(stash.system.currency.sp,10);
 stash.system.currency.sp=40;r=await api.purse.undo(e.id);assert.equal(r.ok,true);assert.equal(stash.system.currency.sp,10);
 await assert.rejects(api.purse.undo(e.id),/already undone/);
 const take=hist().find(h=>h.kind==='purse-take'&&h.approval==='accepted');wren.system.currency.gp=0;
 r=await api.purse.undo(take.id);assert.equal(r.ok,false);assert.match(r.reason,/Wren has 0 gp, fewer than the 2 gp taken/);
 wren.system.currency.gp=5;updates.length=0;r=await api.purse.undo(take.id);assert.equal(r.ok,true);
 assert.deepEqual(updates,[{id:'stash',d:{'system.currency.gp':4}},{id:'pcA',d:{'system.currency.gp':3}}],'purse was 2 after the no-vote take');
 const dep=hist().find(h=>h.kind==='purse-deposit');await assert.rejects(api.purse.undo(dep.id),/Deposits are not undone/);
 assert.ok(Object.values(stash.system.currency).every(n=>n>=0)&&Object.values(wren.system.currency).every(n=>n>=0));
});
test('a failed second update puts the first back, so coins are never created or lost',async()=>{
 const g=[stash.system.currency.gp,wren.system.currency.gp];wren.failNext=true;
 await assert.rejects(api.purse.deposit({actorId:'pcA',coin:'gp',amount:1}),/locked/);
 assert.deepEqual([stash.system.currency.gp,wren.system.currency.gp],g);
});
test('Award Gold can award silver, only that coin changes, Undo returns it',async()=>{
 updates.length=0;const {entry}=await api.awardGold({amount:4,actorIds:['pcA','pcB'],coin:'sp'});
 assert.deepEqual(updates,[{id:'pcA',d:{'system.currency.sp':6}},{id:'pcB',d:{'system.currency.sp':4}}]);assert.equal(entry.coin,'sp');
 const res=await api.undoGoldAward(entry.id);assert.deepEqual(res.map(r=>[r.ok,r.removed,r.coin]),[[true,4,'sp'],[true,4,'sp']]);
 assert.equal(ash.system.currency.sp,0);
});
test('only the five currency fields were ever written',()=>{assert.ok(onlyCurrency(updates));});
test('players see purse totals and purse history without character totals; old entries render unchanged',async()=>{
 const old={id:'old1',kind:'deposit',approval:'not-required',moved:true,userName:'Alice',actorName:'Wren',itemName:'Rope',quantity:1,realTime:1};
 await game.settings.set(ID,'stashHistory',[old,...hist()]);
 game.user=alice;
 try{
  assert.equal(api.purse.totals().sp,10);
  const seen=api.stash.history();assert.deepEqual(seen[0],old);
  const purse=seen.filter(h=>h.kind?.startsWith('purse-'));assert.ok(purse.length>3);
  assert.ok(purse.every(h=>h.actorBefore===null&&h.actorAfter===null&&h.undo.length===0));
  const app=await api.stash.open();app.stashTab='history';const html=await app._renderHTML();
  assert.match(html,/Alice \(Wren\) put Rope in the stash/);assert.match(html,/Alice \(\[TEST\] Wren\) put 5 gp in the party purse/);
  assert.match(html,/GM added 30 sp to the party purse/);assert.doesNotMatch(html,/data-action="purse-undo"/);
 }finally{game.user=gm;}
});
test('GM History shows purse rows with before → after, reason and Undo only where possible',async()=>{
 const app=await api.stash.open();app.stashTab='history';const html=await app._renderHTML();
 assert.match(html,/Purse 0 → 30 sp/);assert.match(html,/\[TEST\] sold loot/);assert.match(html,/Alice \(\[TEST\] Wren\) tried to take 2 gp from the party purse/);
 const undoable=hist().filter(purseUndoable).length;assert.equal((html.match(/data-action="purse-undo"/g)??[]).length,undoable);
 assert.match(html,/Coins awarded|awarded 4 sp each/);
});
// 0.25.0: the purse strip moved to Party Inventory → Party Fund; Items shows the purse in one line.
test('Party Fund tab: purse strip with five labelled counters (electrum on); Items: header and rows render the same cells',async()=>{
 await game.settings.set(ID,'electrumEnabled',true);
 stash.items.add({id:'it1',name:'Potion',type:'consumable',img:'p.webp',system:{quantity:2,weight:{value:0.5,units:'lb'},price:{value:50,denomination:'gp'}}});
 game.user=alice;
 try{
  const app=await api.stash.open();app.stashTab='fund';const fund=await app._renderHTML();
  for(const c of ['Copper','Silver','Electrum','Gold','Platinum'])assert.match(fund,new RegExp(`aria-label="${c}: \\d+"`));
  assert.match(fund,/data-action="purse-deposit"/);assert.match(fund,/data-action="purse-take"/);assert.doesNotMatch(fund,/data-action="purse-adjust"/);
  app.stashTab='items';const html=await app._renderHTML();
  assert.doesNotMatch(html,/data-action="purse-deposit"/);assert.match(html,/Party purse: <strong><span class="agu-coin-chips">[\s\S]*?<\/strong>[\s\S]*?data-stash-tab="fund"/);
  const head=html.match(/<div class="agu-stash-grid agu-stash-head"[^>]*>(.*?)<\/div>/)[1],row=html.match(/<div class="agu-stash-grid agu-stash-row"[^>]*>(.*?)<\/div>/)[1];
  const cols=s=>[...s.matchAll(/class="agu-stash-cell (agu-col-\w+)"/g)].map(m=>m[1]);
  assert.deepEqual(cols(head),cols(row));assert.deepEqual(cols(head),['agu-col-icon','agu-col-item','agu-col-qty','agu-col-weight','agu-col-value','agu-col-type','agu-col-action']);
  assert.deepEqual([...head.matchAll(/>([^<]*)<\/span>/g)].map(m=>m[1]),['','Item','Qty','Weight (each)','Value (each)','Type','Action']);
  assert.match(row,/Consumable/);assert.match(row,/data-action="stash-take"/);
 }finally{game.user=gm;}
 const gmApp=await api.stash.open();gmApp.stashTab='fund';const gmHtml=await gmApp._renderHTML();assert.match(gmHtml,/data-action="purse-adjust"/);
 await game.settings.set(ID,'electrumEnabled',false);
});
test('GM adjust dialog: coin/op/amount/reason, labelled confirmation, Cancel changes nothing',async()=>{
 const seen=[];const sp=stash.system.currency.sp;
 foundry.applications.api.DialogV2={wait:async o=>{seen.push(o);return seen.length===1?o.buttons.find(b=>b.action==='ok').callback({},{form:{elements:[{name:'coin',value:'sp'},{name:'op',value:'set'},{name:'amount',value:'0'},{name:'reason',value:''}]}}):o.buttons.find(b=>b.action==='cancel').callback();}};
 try{
  assert.equal(await api.purse.openAdjust(),null);assert.equal(stash.system.currency.sp,sp);
  assert.deepEqual(seen[1].buttons.map(b=>b.label),['Cancel','Set purse to 0 sp']);assert.match(seen[1].content,new RegExp(`${sp} → 0 sp`));
 }finally{delete foundry.applications.api.DialogV2;}
});

// ---- v0.10.1 separate coin vote ----
test('coin vote: never saved, it inherits the item vote; once saved it is independent',async()=>{
 assert.equal(game.settings.get(ID,'purseVoteRequired'),'');
 await api.stash.setVoteRequired(true);assert.equal(api.purse.isVoteRequired(),true);
 await api.stash.setVoteRequired(false);assert.equal(api.purse.isVoteRequired(),false,'follows the item vote while unset');
 await api.purse.setVoteRequired(true);await api.stash.setVoteRequired(false);
 assert.equal(api.purse.isVoteRequired(),true,'independent once saved');assert.equal(api.stash.isVoteRequired(),false);
 await api.stash.setVoteRequired(true);
});
test('player cannot change the coin vote',async()=>{
 game.user=alice;
 try{await assert.rejects(api.purse.setVoteRequired(false),/GM only/);}finally{game.user=gm;}
 assert.equal(game.settings.get(ID,'purseVoteRequired'),'on');
});
test('coin vote off: Take applies at once with a "no vote" history entry, bounds still enforced; item vote unaffected',async()=>{
 await api.purse.setVoteRequired(false);await api.stash.setVoteRequired(true);
 stash.system.currency.gp=5;wren.system.currency.gp=1;
 const before=sent.filter(m=>m.type==='stash-vote-request').length;
 await socketHandler({type:'purse-take',requestId:'c1',userId:'alice',actorId:'pcA',coin:'gp',amount:2},'alice');await tick();
 assert.equal(receipt('c1').ok,true);assert.equal(sent.filter(m=>m.type==='stash-vote-request').length,before);
 assert.deepEqual([stash.system.currency.gp,wren.system.currency.gp],[3,3]);
 assert.deepEqual([hist().at(-1).kind,hist().at(-1).approval,hist().at(-1).moved],['purse-take','not-required',true]);
 await socketHandler({type:'purse-take',requestId:'c2',userId:'alice',actorId:'pcA',coin:'gp',amount:4},'alice');await tick();
 assert.match(receipt('c2').message,/purse has 3 gp, fewer than 4 gp/);
 await socketHandler({type:'purse-take',requestId:'c3',userId:'alice',actorId:'pcB',coin:'gp',amount:1},'alice');await tick();
 assert.match(receipt('c3').message,/do not own/);
 const app=await api.stash.open();app.stashTab='fund';const html=await app._renderHTML();assert.match(html,/Coin vote: off/);
});
test('coin vote on: the vote flow is unchanged even when the item vote is off',async()=>{
 await api.purse.setVoteRequired(true);await api.stash.setVoteRequired(false);
 socketHandler({type:'purse-take',requestId:'c4',userId:'alice',actorId:'pcA',coin:'gp',amount:1},'alice');await tick();
 const vr=voteRequest();assert.deepEqual(vr.voters,['bob']);assert.equal(vr.item,'1 gp');
 await socketHandler({type:'stash-vote',pollId:vr.pollId,userId:'bob',vote:'accept'},'bob');await tick();
 assert.equal(receipt('c4').ok,true);assert.equal(hist().at(-1).approval,'accepted');
 const app=await api.stash.open();app.stashTab='fund';assert.match(await app._renderHTML(),/Coin vote: on/);
 await api.stash.setVoteRequired(true);
});
