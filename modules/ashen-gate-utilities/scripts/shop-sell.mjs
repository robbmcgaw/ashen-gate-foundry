/* ---- 0.19.0: selling to a shop (design §7c S1–S9, brief 4).
   A player sells an item from a character they own to a presented shop that buys from players. The player confirms
   the item, the price and who is paid; the GM client checks everything again on its own records and carries it out
   all or nothing, in the same queue as purchases for that shop: A the shop page (merchant's coins, stock or a new hidden
   line, the sale), B pay the receiver, C remove the item, D history and the rebuilt player view. The item is removed
   last, so a failure anywhere leaves the seller holding it and no coins moved. ---- */
import {ID,escapeHTML as E,coinsText,readCoins,checkSell,planShopPayout,sellStockChange,shopSaleEntry,SHOP_REFUSALS,SELL_REFUSALS,
 sellRows,quoteSale,saleText,heldQuantity} from './core.mjs';
import {readAll,writeShop,queueShops,appendLog,logOf,norm,randomId,button,icon,dragData} from './shops.mjs';
import {tradeCtx,playerGate,viewOf,readablePurse,owns,queueBuy,whisper,gmIds,warn,syncPlayerView,empty} from './shop-buy.mjs';
import {formDialog,choiceDialog} from './ag-dialogs.mjs';

export const SELL_TIMEOUT_MS=15000;
/** What a seller is told when the GM is slow; the GM still finishes or refuses it and whispers the real result. */
export const SELL_SLOW='The GM did not answer in time. If the sale still goes through or is refused, you get a whisper with the result.';
const isGM=()=>Boolean(game.user?.isGM);
const electrum=()=>game.settings.get(ID,'electrumEnabled')===true;
const NOTHING_SOLD='Nothing was sold.';
/** A refusal from a step that started: always ends "Nothing was sold." */
const nothingSold=t=>{const s=String(t??'').trim();return /Nothing was sold/.test(s)?s:`${s}${/[.!?]$/.test(s)?'':'.'} ${NOTHING_SOLD}`.trim();};
const coinUpdate=coins=>Object.fromEntries(Object.entries(coins).map(([c,n])=>[`system.currency.${c}`,n]));
const paid=pay=>Object.entries(pay??{}).filter(([,n])=>n>0);
const itemData=item=>(typeof item?.toObject==='function'?item.toObject():structuredClone(item));
function cleanReq(r={}){
 return {shopId:String(r.shopId??''),itemId:String(r.itemId??''),actorId:String(r.actorId??''),payTo:r.payTo==='purse'?'purse':'actor',
  quantity:r.quantity===''||r.quantity===null||r.quantity===undefined?r.quantity:Number(r.quantity),rev:r.rev===undefined?undefined:Number(r.rev)};
}
/** The seller's character and the item on it (S8: a character the user owns, never the party stash). */
function sellerItem(r,user){
 const stash=tradeCtx().stashActor?.(),actor=game.actors?.get(r.actorId);
 if(!actor||actor.type!=='character'||actor.id===stash?.id||!owns(actor,user))throw Error(SELL_REFUSALS.notOwned);
 const item=actor.items?.get?.(r.itemId);if(!item)throw Error(`That item is no longer on ${actor.name}.`);
 return {actor,item};
}
/** Whose coins are paid: the seller's character, or the party purse (S5, no vote). */
function receiverFor(r,actor,user){
 if(r.payTo!=='purse')return actor;
 const stash=tradeCtx().stashActor?.();
 if(!stash||!readCoins(stash))throw Error('There is no party purse yet.');
 if(!user.isGM&&!tradeCtx().stashEnabled?.())throw Error('The GM has turned the party stash off.');
 return stash;
}

/* ---------- Quote (player or GM): nothing changes ---------- */
/** api.shops.quoteSell: the sale the seller would confirm, or a refusal. From this user's view of the shop. */
export function quoteSell(req={}){
 playerGate();
 const r=cleanReq(req),view=viewOf(r.shopId);
 if(!view)return {ok:false,reason:SHOP_REFUSALS.notOpen};
 let actor,item,receiver;
 try{({actor,item}=sellerItem(r,game.user));receiver=receiverFor(r,actor,game.user);}catch(e){return {ok:false,reason:e.message};}
 const data=itemData(item),q=quoteSale({view,item:data,quantity:r.quantity,rev:r.rev,hold:readCoins(receiver),electrum:electrum()});
 if(!q.ok)return q;
 return {...q,itemName:data.name,img:data.img??'',actorName:actor.name,payTo:r.payTo,receiverName:receiver.name,shopName:view.name};
}

/* ---------- The sale (GM client) ---------- */
/** Checks (presented, Buys from players, S2, S7, S8), the price from fresh item data (S3) and the payout plan (S4). */
function gate(r,user){
 playerGate(user);
 const shop=readAll().find(s=>s.id===r.shopId);if(!shop)throw Error(SHOP_REFUSALS.notOpen);
 const asShop=user.isGM&&shop.presented?{...shop,presented:{mode:'all',userIds:[]}}:shop;
 const {actor,item}=sellerItem(r,user),data=itemData(item);
 const check=checkSell({shop:asShop,item:data,actorOwned:true,quantity:r.quantity,userId:user.id,rev:r.rev});if(!check.ok)throw Error(check.reason);
 const payout=planShopPayout({amountCp:check.valueCp,shopPurse:shop.purse,showPurse:shop.showPurse!==false,electrum:electrum()});
 if(!payout.ok){if(payout.cantAfford)void topUpWhisper(shop,payout.gmReason,data.name).catch(warn('Could not whisper the GM'));throw Error(payout.reason);}
 const receiver=receiverFor(r,actor,user),hold=readCoins(receiver);if(!hold)throw Error(`${receiver.name} has no dnd5e coins.`);
 return {shop,actor,item,data,check,payout,receiver,hold,have:heldQuantity(data)};
}
/** S4: the GM gets the refusal with a Top up shop purse button (no automatic top-up). */
function topUpWhisper(shop,reason,itemName){
 return whisper(`<p><strong>${E(shop.name)}</strong>: a player could not sell ${E(itemName)}. ${E(reason)} Merchant's coins: ${E(coinsText(shop.purse))}.</p><p><button type="button" class="ag-btn ag-btn--sm" data-agu-shop-topup="${E(shop.id)}"><i class="fa-solid fa-coins" aria-hidden="true"></i> Top up shop purse</button></p>`,gmIds());
}
function fixByHand(lines){void whisper(`<p><strong>Utilities shop sale: fix by hand</strong></p><ul>${lines.map(l=>`<li>${E(l)}</li>`).join('')}</ul>`,gmIds()).catch(warn('Could not whisper the GM'));}
/** Puts the shop page back after A: coins returned to the merchant, the stock raise or the new line undone, the sale dropped. */
async function undoShop(g,a){
 try{
  await queueShops(async()=>{
   const fresh=readAll().find(s=>s.id===g.shop.id);if(!fresh)return;
   let lines=fresh.lines;
   if(a.stock.kind==='add')lines=lines.filter(l=>l.lineId!==a.stock.line.lineId);
   else lines=lines.map(l=>l.lineId===a.stock.lineId&&l.stock!==null&&l.stock!==undefined?{...l,stock:Math.max(0,l.stock-g.check.quantity)}:l);
   const purse=fresh.purse?{...fresh.purse,...Object.fromEntries(paid(g.payout.pay).map(([c,n])=>[c,(Number(fresh.purse[c])||0)+n]))}:null;
   await writeShop(norm({...fresh,lines,purse}),{log:logOf(fresh.id).filter(e=>e?.id!==a.entry.id)});
  });
  return true;
 }catch(e){warn('Could not put the shop back')(e);return false;}
}
const shopFix=g=>`In ${g.shop.name}: give the merchant back ${coinsText(g.payout.pay)} and remove the ${g.data.name} that came in (×${g.check.quantity}).`;
/** A–D in order; each failure puts back what the earlier steps did. */
async function carryOut(r,user){
 const g=gate(r,user),ep=electrum();
 // A. One update of the shop's GM page: merchant's coins, stock or a new hidden line (S6), the sale. Never changes `rev`.
 let a;
 try{
  a=await queueShops(async()=>{
   const fresh=readAll().find(s=>s.id===g.shop.id);
   if(!fresh||fresh.rev!==g.shop.rev||JSON.stringify(fresh.purse)!==JSON.stringify(g.shop.purse))throw Error(SHOP_REFUSALS.changed);
   const stock=sellStockChange(fresh,g.data,g.check.quantity,{randomId});
   const entry=shopSaleEntry({id:randomId(),shop:fresh,itemName:g.data.name,check:g.check,payout:g.payout,stock,payTo:r.payTo,receiver:g.receiver,actor:g.actor,user,
    coinsBefore:g.hold,shopPurseBefore:fresh.purse,electrum:ep,worldTime:game.time?.worldTime??null,realTime:Date.now()});
   const lines=stock.kind==='add'?[...fresh.lines,stock.line]:fresh.lines.map(l=>l.lineId===stock.lineId?{...l,stock:stock.stockAfter}:l);
   await writeShop(norm({...fresh,lines,purse:fresh.purse?{...fresh.purse,...g.payout.shopAfter}:null}),{log:appendLog(fresh.id,entry)});
   return {stock,entry};
  });
 }catch(e){warn('Could not record the sale')(e);throw Error(e?.message===SHOP_REFUSALS.changed?`${SHOP_REFUSALS.changed} ${NOTHING_SOLD}`:`Could not record the sale. ${NOTHING_SOLD}`);}
 const undoA=async why=>{if(!await undoShop(g,a))fixByHand([`${why} ${shopFix(g)}`]);};
 // B. Pay the receiver: one currency update, only the coins that come in (never ep).
 const keys=paid(g.payout.pay).map(([c])=>c),now=readCoins(g.receiver);
 if(!now||keys.some(k=>(Number(now[k])||0)!==(Number(g.hold[k])||0))){await undoA('A sale was called off.');throw Error(`Those coins changed while selling. Look again. ${NOTHING_SOLD}`);}
 const after=Object.fromEntries(keys.map(c=>[c,(Number(now[c])||0)+g.payout.pay[c]]));
 try{if(keys.length)await g.receiver.update(coinUpdate(after));}
 catch(e){warn('Could not pay the seller')(e);await undoA('A sale payment failed.');throw Error(`Payment failed. ${NOTHING_SOLD}`);}
 // C. Remove the item from the seller, last: the whole item, or fewer in the stack.
 const left=g.have-g.check.quantity;let removed=false;
 try{
  const it=g.actor.items?.get?.(g.item.id);
  if(it&&heldQuantity(itemData(it))===g.have){
   if(left>0)await g.actor.updateEmbeddedDocuments('Item',[{_id:g.item.id,'system.quantity':left}]);
   else await g.actor.deleteEmbeddedDocuments('Item',[g.item.id]);
   const check=g.actor.items?.get?.(g.item.id);removed=left>0?heldQuantity(itemData(check))===left:!check;
  }
 }catch(e){warn('Could not remove the sold item')(e);}
 if(!removed){
  let back=true;
  try{const cur=readCoins(g.receiver);if(!cur||keys.some(k=>(Number(cur[k])||0)<g.payout.pay[k]))throw Error('coins already spent');
   if(keys.length)await g.receiver.update(coinUpdate(Object.fromEntries(keys.map(c=>[c,(Number(cur[c])||0)-g.payout.pay[c]]))));}
  catch(e){back=false;warn('Could not take the coins back')(e);}
  const shopBack=await undoShop(g,a);
  if(!back||!shopBack)fixByHand([...(back?[]:[`Take ${coinsText(g.payout.pay)} back from ${g.receiver.name}.`]),...(shopBack?[]:[shopFix(g)]),`Check that ${g.actor.name} still has ${g.data.name} ×${g.have}.`]);
  if(!back)throw Error('The item could not be taken and the coins could not be taken back yet. The GM has been told what to fix.');
  throw Error(`Could not take the item from ${g.actor.name}. ${NOTHING_SOLD}`);
 }
 // D. History (party purse sales), the rebuilt player view, the receipt.
 if(r.payTo==='purse')await tradeCtx().logStash?.(a.entry)?.catch?.(warn('Could not write stash history'));
 await syncPlayerView().catch(warn('Could not update the shop player view'));
 return saleText({quantity:g.check.quantity,name:g.data.name,shopName:g.shop.name,totalText:a.entry.totalText,payTo:r.payTo,receiverName:g.receiver.name});
}
const handled=new Map(),HANDLED_MS=10*60000;
/**
 * GM client: one sale request, in the same queue as purchases for that shop (and the purse's, when it is paid). The
 * same requestId is never carried out twice. If it ends after the seller stopped waiting, they get a whisper.
 */
export async function executeSell(msg,user){
 if(!isGM())throw Error('GM only.');
 const id=String(msg?.requestId??''),started=Date.now();
 for(const [k,t] of handled)if(started-t>HANDLED_MS)handled.delete(k);
 if(id){if(handled.has(id))throw Error('That sale was already handled.');handled.set(id,started);}
 const r=cleanReq(msg),limit=Number(msg?.timeoutMs)||SELL_TIMEOUT_MS,q=tradeCtx().queuePurse;let ok=false,text='';
 try{text=await queueBuy(r.shopId,()=>r.payTo==='purse'&&q?q(()=>carryOut(r,user)):carryOut(r,user));ok=true;return text;}
 catch(e){text=e?.message??String(e);throw Error(text);}
 finally{
  if(!user.isGM&&Date.now()-started>limit-2000){
   const name=readAll().find(s=>s.id===msg?.shopId)?.name;
   void whisper(`<p>Your sale${name?` to ${E(name)}`:''}${ok?' went through':' was not made'}: ${E(text)}</p>`,[user.id,...gmIds()]).catch(warn('Could not whisper the seller'));
  }
 }
}
/** api.shops.sell: the GM carries it out here; a player asks the GM client. Resolves the receipt text. */
export async function sell(req={}){
 const r=cleanReq(req);
 if(isGM())return executeSell({...r,requestId:randomId()},game.user);
 playerGate();
 // Can't afford still goes to the GM client, which refuses it again and whispers the GM the Top up button (S4).
 const q=quoteSell(r);if(!q.ok&&!q.cantAfford)throw Error(q.reason);
 return tradeCtx().requestGM('shop-sell',{...r,timeoutMs:SELL_TIMEOUT_MS},SELL_TIMEOUT_MS,{timeoutMessage:SELL_SLOW});
}

/* ---------- Player shop window: the Sell sub-view and the Sell dialog ---------- */
const itemIcon=(img,cls='ag-row__icon')=>img?`<img class="${cls}" src="${E(img)}" alt="">`:`<span class="${cls}" aria-hidden="true">${icon('fa-box')}</span>`;
/** Buy / Sell switch for a shop that buys from players. */
export const modeSwitch=(view,mode)=>`<div class="ag-segmented agu-shop-mode" role="radiogroup" aria-label="Buy or sell">${[['buy','Buy'],['sell','Sell']].map(([id,label])=>`<button type="button" role="radio" data-shop-mode="${id}" aria-checked="${mode===id}">${label}</button>`).join('')}</div>`;
/** The Sell sub-view: where the coins go, then the character's items (sellable first, refused ones greyed with the reason). */
export function sellViewHTML(view,actor,state={}){
 if(!actor)return '';
 const purse=readablePurse(),payTo=purse&&state.payTo==='purse'?'purse':'actor';
 const dest=`<div class="ag-toolbar agu-sell-dest"><span class="ag-eyebrow" id="agu-sell-dest-${E(view.id)}">Coins go to</span><div class="ag-segmented" role="radiogroup" aria-labelledby="agu-sell-dest-${E(view.id)}">${[['actor',actor.name],...(purse?[['purse','Party purse']]:[])].map(([id,label])=>`<button type="button" role="radio" data-sell-pay="${id}" aria-checked="${payTo===id}">${E(label)}</button>`).join('')}</div></div>`;
 const rows=sellRows(view,[...(actor.items??[])].map(itemData),{electrum:electrum()});
 const row=x=>`<li class="ag-row agu-ware${x.ok?'':' is-disabled'}"${x.ok?'':' aria-disabled="true"'} data-sell-item="${E(x.id)}">${itemIcon(x.img)}<div class="ag-row__main"><span class="ag-row__title">${E(x.name)}</span><span class="ag-row__meta">${E(x.ok?[`×${x.quantity}`,x.priceText].join(' · '):`×${x.quantity} · ${x.reason}`)}</span></div>
  <div class="ag-row__end">${x.ok?button('shop-sell','Sell…',{kind:'sm',ic:'fa-coins',attrs:`data-shop="${E(view.id)}" data-item-id="${E(x.id)}" aria-label="Sell ${E(x.name)}"`}):''}</div></li>`;
 const ok=rows.filter(x=>x.ok),no=rows.filter(x=>!x.ok);
 const pct=`${view.name} pays ${view.buys.percent} % of an item's price. Drag an item from ${actor.name}'s sheet onto this window to sell it.`;
 return `${dest}<p class="ag-field__hint">${E(pct)}</p>
  <h3 class="ag-eyebrow">${E(actor.name)} can sell · ${ok.length}</h3>${ok.length?`<ul class="ag-rows agu-wares">${ok.map(row).join('')}</ul>`:empty('Nothing to sell here',`${actor.name} has nothing this shop buys.`)}
  ${no.length?`<h3 class="ag-eyebrow">This shop won't buy · ${no.length}</h3><ul class="ag-rows agu-wares">${no.map(row).join('')}</ul>`:''}`;
}
/** The sale as dialog HTML: the item, then what the merchant pays, from where, to whom, and the coins before → after. */
function saleHTML(q){
 const from=q.paidFrom==='unlimited'?'The merchant (unlimited)':'The merchant\'s coins';
 const kv=[['Selling',`${q.quantity>1?`${q.quantity} × `:''}${q.itemName}`],['From',q.actorName],['The merchant pays',`${q.totalText} (${q.percent} % of its price)`],['Paid from',from],
  ['Coins go to',q.payTo==='purse'?'Party purse':q.receiverName],[q.payTo==='purse'?'Party purse':`${q.receiverName}'s coins`,`${coinsText(q.before)} → ${coinsText(q.after)}`],
  ...(q.shopAfter?[['Merchant\'s coins after',coinsText(q.shopAfter)]]:[])];
 return `<ul class="ag-rows"><li class="ag-row">${itemIcon(q.img)}<div class="ag-row__main"><span class="ag-row__title">${E(q.itemName)}</span><span class="ag-row__meta">${E(q.shopName)}</span></div></li></ul><dl class="ag-kv">${kv.map(([k,v])=>`<dt>${E(k)}</dt><dd>${E(v)}</dd>`).join('')}</dl>`;
}
const refusalHTML=reason=>`<p class="ag-notice ag-notice--danger" role="alert">${icon('fa-circle-exclamation')}<span>${E(reason)}</span></p>`;
/** Sell dialog: how many (stacks only), then the sale with Sell item, or the refusal. Resolves the receipt, or null. */
export async function sellDialog(shopId,actorId,itemId,{payTo='actor'}={}){
 const view=viewOf(shopId);if(!view)throw Error(SHOP_REFUSALS.notOpen);
 if(!view.buys)throw Error(SELL_REFUSALS.notBuying);
 const {actor,item}=sellerItem({actorId,itemId},game.user),data=itemData(item),have=heldQuantity(data);
 let quantity=have>1?'':'1';
 for(;;){
  if(have>1){
   const each=quoteSale({view,item:data,quantity:1,hold:{},electrum:electrum()});
   const res=await formDialog(`Sell ${data.name}`,[{name:'quantity',label:'How many',type:'number',value:quantity||String(have),hint:`${actor.name} has ${have}.${each.ok?` The merchant pays ${each.totalText} each.`:''}`}],{ok:'Review sale'});
   if(!res)return null;quantity=res.quantity;
  }
  const req={shopId,itemId,actorId,quantity:Number(quantity),payTo,rev:view.rev},q=quoteSell(req);
  if(!q.ok){
   if(have>1&&await choiceDialog('Can\'t sell this',refusalHTML(q.reason),[{action:'change',label:'Change sale',default:true}])==='change')continue;
   if(have>1)return null;
   throw Error(q.reason);
  }
  if(await choiceDialog(`Sell ${data.name}?`,saleHTML(q),[{action:'sell',label:'Sell item',icon:'fa-solid fa-coins',default:true}])!=='sell')return null;
  return sell(req);
 }
}
/** Runs the Sell dialog and reports the result: the receipt, or the refusal. */
export function sellFlow(shopId,actorId,itemId,opts){
 return sellDialog(shopId,actorId,itemId,opts).then(msg=>{if(msg)ui.notifications?.info(msg);},e=>{const m=e?.message??String(e);ui.notifications?.[m===SELL_SLOW?'warn':'error'](m);});
}
/** A drop on the shop window: an item from the player's own character sheet opens the same Sell dialog. */
export function sellDrop(shopId,event,opts){
 const d=dragData(event),m=String(d?.uuid??'').match(/^Actor\.([^.]+)\.Item\.([^.]+)$/);
 if(d?.type!=='Item'||!m){ui.notifications?.warn('Drag an item from your own character sheet to sell it.');return Promise.resolve();}
 return sellFlow(shopId,m[1],m[2],opts);
}
