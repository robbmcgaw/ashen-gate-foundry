// 0.13.2: GM Setup "Use electrum" (default off). Off hides ep in every Utilities coin UI, except a balance that still
// holds ep, which keeps a dimmed line and a GM-only, value-exact conversion with Undo. The purse still stores ep.
// Mocked Foundry globals: proves the logic and the markup, not the live Foundry UI or layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,COINS,coinChoices,shownCoins,strandedElectrum,coinValueCp,planElectrumConvert,convertPreview,convertEntry,planConvertUndo,planCoinMove,planPurseAdjust,planGoldAward,priceText,stashRow} from '../scripts/core.mjs';

// ---- Pure rules ----
test('coin choices and shown coins: ep only while electrum is on or a balance still holds some',()=>{
 assert.deepEqual(coinChoices(true),['cp','sp','ep','gp','pp']);assert.deepEqual(coinChoices(false),['cp','sp','gp','pp']);
 assert.deepEqual(shownCoins({cp:0,sp:0,ep:0,gp:1,pp:0},false),['cp','sp','gp','pp']);
 assert.deepEqual(shownCoins({cp:0,sp:0,ep:2,gp:1,pp:0},false),COINS,'ep > 0 is never hidden');
 assert.deepEqual(shownCoins({ep:0},true),COINS);
 assert.equal(strandedElectrum({ep:2},false),true);assert.equal(strandedElectrum({ep:2},true),false);assert.equal(strandedElectrum({ep:0},false),false);
 assert.deepEqual(COINS,['cp','sp','ep','gp','pp'],'the stored coin list is unchanged');
});
test('conversion keeps value exactly for every amount, to silver and to gold',()=>{
 for(let ep=1;ep<=250;ep++)for(const to of ['sp','gp']){
  const coins={cp:3,sp:7,ep,gp:11,pp:2},p=planElectrumConvert({to,coins});
  assert.equal(coinValueCp(p.after),coinValueCp(coins));assert.equal(p.after.ep,0);assert.equal(p.valueCp,ep*50);
  assert.equal(p.addSp*10+p.addGp*100,ep*50);assert.equal(p.after.cp,3);assert.equal(p.after.pp,2);
  if(to==='sp')assert.deepEqual([p.addSp,p.addGp],[ep*5,0]);else assert.deepEqual([p.addGp,p.addSp],[Math.floor(ep/2),(ep%2)*5]);
 }
 assert.throws(()=>planElectrumConvert({to:'sp',coins:{ep:0}}),/no electrum/);
 assert.throws(()=>planElectrumConvert({to:'pp',coins:{ep:2}}),/silver \(sp\) or gold \(gp\)/);
 assert.throws(()=>planElectrumConvert({to:'gp',coins:{ep:1.5}}),/no electrum/);
});
test('conversion preview is exact and labelled',()=>{
 const p=planElectrumConvert({to:'gp',coins:{cp:0,sp:2,ep:3,gp:10,pp:0}});
 assert.deepEqual(convertPreview(p),['Convert 3 ep → 1 gp + 5 sp.','Electrum: 3 → 0 ep','Gold: 10 → 11 gp','Silver: 2 → 7 sp',
  'Value kept exactly: 150 cp (1 ep = 5 sp = 50 cp). Total purse value 1170 cp before and after.']);
 assert.deepEqual(convertPreview(planElectrumConvert({to:'sp',coins:{cp:0,sp:0,ep:4,gp:0,pp:0}})).slice(0,3),['Convert 4 ep → 20 sp.','Electrum: 4 → 0 ep','Silver: 0 → 20 sp']);
});
test('conversion undo: puts ep back, refused if the added coins have left the purse',()=>{
 const e=convertEntry({plan:planElectrumConvert({to:'gp',coins:{cp:0,sp:0,ep:3,gp:0,pp:0}}),user:{id:'gm',name:'GM'}});
 assert.deepEqual([e.kind,e.amount,e.addGp,e.addSp,e.approval],['purse-convert',3,1,5,'gm']);
 assert.deepEqual(planConvertUndo(e,{cp:0,sp:5,ep:0,gp:1,pp:0}).next,{ep:3,sp:0,gp:0});
 assert.match(planConvertUndo(e,{cp:0,sp:4,ep:0,gp:1,pp:0}).reason,/4 sp, fewer than the 5 sp/);
 assert.match(planConvertUndo(e,{cp:0,sp:5,ep:0,gp:0,pp:0}).reason,/0 gp, fewer than the 1 gp/);
 assert.throws(()=>planConvertUndo({...e,undone:true},{}),/already undone/);
});
test('with electrum off, coin moves, adjustments and awards (each and split) never produce ep',()=>{
 assert.throws(()=>planCoinMove({kind:'deposit',coin:'ep',amount:1,actorHas:5,purseHas:0,electrum:false}),/Electrum is turned off/);
 assert.throws(()=>planCoinMove({kind:'take',coin:'ep',amount:1,actorHas:0,purseHas:5,electrum:false}),/Electrum is turned off/);
 assert.throws(()=>planPurseAdjust({op:'add',coin:'ep',amount:1,purseHas:0,electrum:false}),/Electrum is turned off/);
 for(const mode of ['each','split'])assert.throws(()=>planGoldAward({amount:9,mode,coin:'ep',electrum:false,recipients:[{id:'a',held:0}]}),/Electrum is turned off/);
 for(const coin of coinChoices(false))for(const mode of ['each','split']){
  const p=planGoldAward({amount:7,mode,coin,electrum:false,recipients:[{id:'a',name:'A',held:0},{id:'b',name:'B',held:0}]});assert.notEqual(p.coin,'ep');
 }
 assert.equal(planCoinMove({kind:'take',coin:'ep',amount:1,actorHas:0,purseHas:5}).coin,'ep','electrum on (the default for the pure rules) still allows ep');
});
test('an ep item price reads in gp/sp/cp of the same value while electrum is off',()=>{
 assert.deepEqual([priceText(4,'ep',false),priceText(3,'ep',false),priceText(0.1,'ep',false),priceText(3,'ep',true),priceText(3,'gp',false)],['2 gp','15 sp','5 cp','3 ep','3 gp']);
 assert.equal(stashRow({system:{price:{value:6,denomination:'ep'}}},{electrum:false}).value,'3 gp');
 assert.equal(stashRow({system:{price:{value:6,denomination:'ep'}}}).value,'6 ep');
});

// ---- Integration through main.mjs ----
const handlers={once:new Map(),on:new Map()};const settings=new Map();const sent=[];const updates=[];const fired=[];let socketHandler=null;
globalThis.HTMLElement=class {};
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(o){this.options=o;this.rendered=false;}async render(){this.rendered=true;return this;}async close(){this.rendered=false;}}}}};
const gm={id:'gm',name:'GM',isGM:true,active:true},alice={id:'alice',name:'Alice',isGM:false,active:true},bob={id:'bob',name:'Bob',isGM:false,active:true};
function mkItems(){const m=new Map();return {get:id=>m.get(id),get size(){return m.size;},[Symbol.iterator]:()=>m.values(),add(d){const it={...d,uuid:`Item.${d.id}`};m.set(it.id,it);return it;}};}
function mkActor(id,name,owner,flags={},currency={cp:0,sp:0,ep:0,gp:0,pp:0}){const a={id,name,type:owner?'character':'npc',documentName:'Actor',statuses:new Set(),effects:[],flags,
 system:{currency:{...currency}},ownership:{},items:mkItems(),getFlag:(ns,k)=>flags[ns]?.[k],testUserPermission:(u,level)=>u.isGM||u.id===owner||level==='LIMITED',
 update:async d=>{updates.push({id,d});for(const [k,v] of Object.entries(d)){const path=k.split('.'),last=path.pop();path.reduce((o,p)=>o[p],a)[last]=v;}}};return a;}
const stash=mkActor('stash','Ashen Gate | Party Stash',null,{[ID]:{partyStash:true}},{cp:0,sp:2,ep:0,gp:10,pp:0});
const wren=mkActor('pcA','[TEST] Wren','alice',{},{cp:1,sp:2,ep:3,gp:10,pp:4});
const users=[gm,alice,bob];users.get=id=>users.find(u=>u.id===id);
const actors=[stash,wren];actors.get=id=>actors.find(a=>a.id===id);
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{OBSERVER:2}};
globalThis.ChatMessage={create:async d=>d,getSpeaker:()=>({})};
globalThis.game={user:gm,users,actors,time:{worldTime:50},modules:new Map([[ID,{id:ID,active:true}]]),tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,o)=>settings.set(`${ns}.${key}`,{value:o.default,onChange:o.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}},
 socket:{emit:(ch,msg)=>sent.push(msg),on:(ch,fn)=>{socketHandler=fn;}}};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[],Item:{typeLabels:{loot:'Loot'}}};
globalThis.ui={notifications:{info:()=>{},warn:()=>{},error:()=>{}}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>handlers.on.set(k,fn),off:()=>{},callAll:(k,...a)=>fired.push([k,...a])};
await import('../scripts/main.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api;
await game.settings.set(ID,'playerAccessEnabled',true);await api.stash.setEnabled(true);
const tick=()=>new Promise(r=>setTimeout(r,5));
const receipt=id=>sent.find(m=>m.type==='receipt'&&m.requestId===id);
const hist=()=>game.settings.get(ID,'stashHistory');
const itemsHtml=async(user=gm)=>{game.user=user;try{const app=await api.stash.open();app.stashTab='items';return await app._renderHTML();}finally{game.user=gm;}};
const historyHtml=async(user=gm)=>{game.user=user;try{const app=await api.stash.open();app.stashTab='history';return await app._renderHTML();}finally{game.user=gm;}};
const purseOf=html=>html.match(/<section class="agu-purse"[\s\S]*?<\/section>/)[0];
/** Answers a sequence of DialogV2.wait calls: a form (values), 'confirm' or 'cancel'. Records every dialog. */
function scriptDialogs(steps){const seen=[];foundry.applications.api.DialogV2={wait:async o=>{seen.push(o);const s=steps[seen.length-1];
 if(s==='confirm')return o.buttons.find(b=>b.action==='confirm').callback();if(s==='cancel'||!s)return o.buttons.find(b=>b.action==='cancel').callback();
 return o.buttons.find(b=>b.action==='ok').callback({},{form:{elements:Object.entries(s).map(([name,value])=>({name,value}))}});}};return seen;}
const noDialogs=()=>{delete foundry.applications.api.DialogV2;};
const embedHtml=()=>{const el={innerHTML:'',classList:{add(){},remove(){}},addEventListener(){},querySelector:()=>null,contains:()=>true};const v=api.embed.mount(el,{actorId:'pcA',mode:'stash'});return new Promise(r=>setTimeout(()=>{const h=el.innerHTML;v.unmount();r(h);},5));};

test('setting: world, default off, GM Setup checkbox; API reads it; players cannot change it',async()=>{
 assert.equal(game.settings.get(ID,'electrumEnabled'),false);assert.equal(api.currency.electrumEnabled(),false);
 assert.deepEqual(api.currency.coins(),['cp','sp','gp','pp']);assert.equal(api.currency.contract,'ag-utilities-currency/1');
 assert.deepEqual(api.purse.coins,COINS,'purse.coins keeps all five dnd5e coins (data shape unchanged)');
 game.user=alice;try{await assert.rejects(api.currency.setElectrumEnabled(true),/GM only/);}finally{game.user=gm;}
 assert.equal(api.currency.electrumEnabled(),false);
 const app=await api.open();app.tab='setup';const html=await app._renderHTML();
 assert.match(html,/<input id="agu-electrum" type="checkbox" data-setup-field >Use electrum<\/label>/);
});
test('off, purse holds no ep: no electrum in the purse strip, coin choices or notes (GM, player and embed)',async()=>{
 for(const html of [purseOf(await itemsHtml()),purseOf(await itemsHtml(alice)),await embedHtml()]){
  assert.doesNotMatch(html,/Electrum|electrum|\bep\b/);
  for(const c of ['Copper','Silver','Gold','Platinum'])assert.match(html,new RegExp(`aria-label="${c}: \\d+"`));
  assert.doesNotMatch(html,/data-action="purse-convert"/);
 }
});
test('off: Award Gold and Adjust Purse offer no electrum',async()=>{
 let seen=scriptDialogs(['cancel']);try{await api.gold.openDialog();}finally{noDialogs();}
 assert.doesNotMatch(seen[0].content,/Electrum|value="ep"/);assert.match(seen[0].content,/value="sp"/);
 seen=scriptDialogs(['cancel']);try{await api.purse.openAdjust();}finally{noDialogs();}
 assert.doesNotMatch(seen[0].content,/Electrum|value="ep"/);assert.match(seen[0].content,/value="gp"/);
});
test('off: ep deposit/take/adjust/award are refused in the API and on the GM client, nothing moves',async()=>{
 updates.length=0;
 await assert.rejects(api.purse.adjust({coin:'ep',op:'add',amount:1}),/Electrum is turned off/);
 await assert.rejects(api.awardGold({amount:2,actorIds:['pcA'],coin:'ep'}),/Electrum is turned off/);
 await assert.rejects(api.purse.deposit({actorId:'pcA',coin:'ep',amount:1}),/Electrum is turned off/);
 game.user=alice;try{await assert.rejects(api.purse.deposit({actorId:'pcA',coin:'ep',amount:1}),/Electrum is turned off/);}finally{game.user=gm;}
 await socketHandler({type:'purse-deposit',requestId:'e1',userId:'alice',actorId:'pcA',coin:'ep',amount:1},'alice');await tick();
 assert.match(receipt('e1').message,/Electrum is turned off/);
 assert.equal(updates.length,0);assert.equal(wren.system.currency.ep,3,'the character keeps its own electrum; its sheet is not touched');
});
test('off, purse still holds ep: the ep line stays (dimmed) with a note; only the GM gets Convert',async()=>{
 stash.system.currency.ep=3;
 const gmPurse=purseOf(await itemsHtml());
 assert.match(gmPurse,/class="agu-coin agu-coin--off" role="group" aria-label="Electrum: 3 \(electrum is off\)"/);
 assert.match(gmPurse,/still holds 3 electrum \(ep\), worth 15 sp/);
 assert.match(gmPurse,/data-action="purse-convert"\s*>Convert electrum to silver\/gold</);
 assert.doesNotMatch(gmPurse.match(/<select id="agu-purse-coin">[\s\S]*?<\/select>/)[0],/value="ep"/,'still not offered to move');
 const playerPurse=purseOf(await itemsHtml(alice));
 assert.match(playerPurse,/aria-label="Electrum: 3 \(electrum is off\)"/);assert.match(playerPurse,/the GM can convert it/);
 assert.doesNotMatch(playerPurse,/data-action="purse-convert"|data-action="purse-adjust"/);
 const emb=await embedHtml();assert.match(emb,/aria-label="Electrum: 3 \(electrum is off\)"/);assert.match(emb,/data-action="purse-convert"/);
 game.user=alice;try{await assert.rejects(api.purse.convertElectrum({to:'gp'}),/GM only/);await assert.rejects(api.purse.openConvert(),/GM only/);}finally{game.user=gm;}
 assert.equal(stash.system.currency.ep,3);
});
test('Convert: exact preview, Cancel changes nothing, confirm converts in one update and records History',async()=>{
 let seen=scriptDialogs([{to:'gp',reason:''},'cancel']);try{assert.equal(await api.purse.openConvert(),null);}finally{noDialogs();}
 assert.equal(stash.system.currency.ep,3);
 assert.deepEqual(seen[1].buttons.map(b=>b.label),['Cancel','Convert 3 ep']);
 assert.equal(seen[1].content,['Convert 3 ep → 1 gp + 5 sp.','Electrum: 3 → 0 ep','Gold: 10 → 11 gp','Silver: 2 → 7 sp','Value kept exactly: 150 cp (1 ep = 5 sp = 50 cp). Total purse value 1170 cp before and after.'].map(l=>`<p>${l}</p>`).join(''));
 const value=coinValueCp(stash.system.currency);updates.length=0;
 seen=scriptDialogs([{to:'gp',reason:'[TEST] tidy purse'},'confirm']);let e;try{e=await api.purse.openConvert();}finally{noDialogs();}
 assert.deepEqual(updates,[{id:'stash',d:{'system.currency.ep':0,'system.currency.sp':7,'system.currency.gp':11}}]);
 assert.equal(coinValueCp(stash.system.currency),value);
 assert.deepEqual([e.kind,e.amount,e.to,e.addGp,e.addSp,e.reason],['purse-convert',3,'gp',1,5,'[TEST] tidy purse']);assert.equal(hist().at(-1).id,e.id);
 const html=await historyHtml();
 assert.match(html,/GM converted 3 ep to 1 gp \+ 5 sp in the party purse \(value kept: 150 cp\)/);assert.match(html,/Purse 3 → 0 ep · 10 → 11 gp · 2 → 7 sp/);
 assert.match(html,/data-action="purse-convert-undo"/);
 assert.doesNotMatch(purseOf(await itemsHtml()),/Electrum|electrum|\bep\b/,'once converted the ep line is gone');
 const ph=await historyHtml(alice);assert.match(ph,/GM converted 3 ep/);assert.doesNotMatch(ph,/purse-convert-undo/);
});
test('Convert Undo restores the electrum; refused (and logged) once the added coins are spent',async()=>{
 const e=hist().at(-1);stash.system.currency.sp=4;
 let r=await api.purse.undoConvert(e.id);assert.equal(r.ok,false);assert.match(r.reason,/4 sp, fewer than the 5 sp/);assert.equal(stash.system.currency.ep,0);
 stash.system.currency.sp=7;r=await api.purse.undoConvert(e.id);assert.equal(r.ok,true);
 assert.deepEqual([stash.system.currency.ep,stash.system.currency.sp,stash.system.currency.gp],[3,2,10]);
 await assert.rejects(api.purse.undoConvert(e.id),/already undone/);
 game.user=alice;try{await assert.rejects(api.purse.undoConvert(e.id),/GM only/);}finally{game.user=gm;}
 const cv=await historyHtml();assert.match(cv,/· undone/);
});
test('Convert refuses when the purse electrum changed after the preview',async()=>{
 const before={...stash.system.currency};updates.length=0;
 await assert.rejects(api.purse.convertElectrum({to:'sp',expectEp:2}),/electrum changed \(now 3 ep\); nothing was converted/);
 assert.deepEqual(stash.system.currency,before);assert.equal(updates.length,0);
});
test('on: everything comes back (ep counter, ep choices in Deposit/Take, Award Gold and Adjust), no convert prompt; hook fires',async()=>{
 fired.length=0;await api.currency.setElectrumEnabled(true);
 assert.deepEqual(fired,[[`${ID}.electrumChanged`,true]]);assert.equal(api.currency.hook,`${ID}.electrumChanged`);
 assert.deepEqual(api.currency.coins(),COINS);
 const purse=purseOf(await itemsHtml());
 assert.match(purse,/class="agu-coin" role="group" aria-label="Electrum: 3"/);assert.doesNotMatch(purse,/agu-coin--off|data-action="purse-convert"|electrum is off/);
 assert.match(purse.match(/<select id="agu-purse-coin">[\s\S]*?<\/select>/)[0],/value="ep"/);
 let seen=scriptDialogs(['cancel']);try{await api.gold.openDialog();}finally{noDialogs();}assert.match(seen[0].content,/Electrum \(ep\)/);
 seen=scriptDialogs(['cancel']);try{await api.purse.openAdjust();}finally{noDialogs();}assert.match(seen[0].content,/Electrum \(ep\): 3/);
 updates.length=0;assert.equal((await api.purse.adjust({coin:'ep',op:'add',amount:1})).purseAfter,4);
 await api.currency.setElectrumEnabled(false);assert.deepEqual(fired.at(-1),[`${ID}.electrumChanged`,false]);
});
test('turning electrum off keeps the purse data shape: still five coins with ep stored',()=>{
 assert.deepEqual(Object.keys(api.purse.totals()),COINS);assert.equal(api.purse.totals().ep,4);
});
