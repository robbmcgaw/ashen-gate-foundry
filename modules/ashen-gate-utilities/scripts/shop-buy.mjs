/* ---- 0.18.0: presenting shops and buying (design §5–7, brief 3).
   The GM presents a shop to all or chosen players. The GM client writes a player projection (no GM data) to a second
   Journal, "Utilities Shops (Player View)", found by flags.ashen-gate-utilities.store = 'shops-player': one page per
   presented shop, readable (Observer) only by the players it is shown to. Players read only that Journal, never the
   GM Data one. A purchase is a request to the GM client, which checks everything again on its own records and carries
   it out all or nothing: A items, B coins, C shop page, D history. Each failure puts the earlier steps back. ---- */
import {ID,isLevelBackup,escapeHTML as E,COIN_LABELS,coinChoices,shownCoins,strandedElectrum,coinsText,readCoins,projectShop,planShopPayment,checkPurchase,
 shopPurchaseEntry,shopPriceText,SHOP_REFUSALS,CONSENT_TIMEOUT_MS,consentVoters,createPoll,initials,shopLineName,purchaseCount,purchaseItemData,
 nothingCharged,purchaseText,presentedOwnership,quotePurchase,projectService,projectMerchantList,entrySummary,tradeCardHTML,coinStripHTML,coinChipsHTML,groupByCategory,normalizeMerchantList,audiencePresented} from './core.mjs';
import {itemButton} from './item-tips.mjs';
import {readAll,mustGet,writeShop,queueShops,appendLog,norm,locationsApi,randomId,purseDialog,button,icon,tip,writeService,readMeta} from './shops.mjs';
import {confirmDialog,formDialog,choiceDialog} from './ag-dialogs.mjs';
import {windowSize} from './ag-html.mjs';
import {modeSwitch,sellViewHTML,sellFlow,sellDrop,quoteSell,sell} from './shop-sell.mjs';
import {servicesAll,serviceViewHTML,bindServiceView,UNKNOWN_TYPE} from './services.mjs';

export const VIEW_STORE='shops-player',VIEW_JOURNAL_NAME='Utilities Shops (Player View)';
const SOCKET=`module.${ID}`;
export const BUY_TIMEOUT_MS=15000,BUY_VOTE_TIMEOUT_MS=CONSENT_TIMEOUT_MS+15000;
/** What a player is told when the GM is slow; the GM still finishes or refuses it and whispers the real result. */
export const GM_SLOW='The GM did not answer in time. If the purchase still goes through or is refused, you get a whisper with the result.';
const isGM=()=>Boolean(game.user?.isGM);
const gmOnly=()=>{if(!isGM())throw Error('GM only.');};
const electrum=()=>game.settings.get(ID,'electrumEnabled')===true;
const access=()=>game.settings.get(ID,'playerAccessEnabled')===true;
export const shopsOn=()=>game.settings.get(ID,'shopsEnabled')===true;
const clone=v=>structuredClone(v);
const levels=()=>globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS??{NONE:0,OBSERVER:2};
const players=()=>[...(game.users??[])].filter(u=>u?.id&&!u.isGM);
export const gmIds=()=>[...(game.users??[])].filter(u=>u.isGM).map(u=>u.id);
export const owns=(actor,user)=>Boolean(actor&&!isLevelBackup(actor)&&(user?.isGM||actor.testUserPermission?.(user,'OWNER')));
export const warn=what=>e=>console.warn(`[${ID}] ${what}: ${e?.message??e}`);

/** Set by main.mjs on ready: the party stash, the consent poll, the GM request channel and the history writer live there. */
let ctx={};
export function configureTrade(c){ctx={...ctx,...c};}
/** The same context, for selling (shop-sell.mjs). */
export const tradeCtx=()=>ctx;
/** *Party must accept when a player spends the party purse*: '' (never saved) follows the coin vote. */
export const shopVoteRequired=()=>{const v=game.settings.get(ID,'shopPurseVote');return v==='on'?true:v==='off'?false:Boolean(ctx.purseVoteRequired?.());};
/** Design §6 wording. The GM always passes. */
export function playerGate(user=game.user){if(user?.isGM)return;if(!access())throw Error('Utilities is hidden for players.');if(!shopsOn())throw Error('The GM has turned shops off.');}
/** The Shops tab shows for players while Player Access and *Shops on for players* are both on. */
export const shopsVisible=()=>isGM()||(access()&&shopsOn());

/* ---------- The player projection (GM client) ---------- */
const typeLabel=t=>{const l=CONFIG?.Item?.typeLabels?.[t];return l?game.i18n.localize(l):t;};
/** The linked place's name, only while Locations says it is revealed to everyone. */
function revealedPlace(id){
 if(!id)return null;const api=locationsApi();if(!api)return null;
 try{const l=api.listLocations({revealedOnly:true}).find(x=>x?.id===id);return l&&l.revealed===true&&l.audience?.mode!=='selected'?(l.published?.name||l.name||null):null;}catch{return null;}
}
export const projectionOf=shop=>projectShop(shop,{electrum:electrum(),locationName:revealedPlace(shop.locationId),typeLabel});
/** 0.20.0: a service's player view; null for a type this version doesn't know (never shown to players). */
export const serviceProjectionOf=svc=>svc?.known?projectService(svc,{locationName:revealedPlace(svc.locationId)}):null;
/** Shops and known services shown to someone right now (GM data). */
const presentedRecords=()=>[...readAll().filter(s=>s.presented).map(s=>({rec:s,view:projectionOf(s)})),...servicesAll().filter(s=>s.presented&&s.known).map(s=>({rec:s,view:serviceProjectionOf(s)}))].filter(x=>x.view);
/** The projection of a saved shop or known service by id, for a merchant list; null when missing or unknown. */
function projectAny(id){const shop=readAll().find(s=>s.id===id);if(shop)return projectionOf(shop);const svc=servicesAll().find(s=>s.id===id);return svc?serviceProjectionOf(svc):null;}
/** 0.25.0: merchant lists shared with the party or chosen players, with who may read each one. */
const sharedLists=()=>readMeta().lists.map(l=>{try{return normalizeMerchantList(l);}catch{return null;}}).filter(l=>l&&audiencePresented(l.audience))
 .map(l=>({audience:l.audience,view:projectMerchantList(l,{project:projectAny,locationName:revealedPlace(l.locationId)})}));
const visibleListViews=()=>sharedLists().map(x=>x.view);
export const viewJournal=()=>[...(game.journal??[])].find(j=>j?.flags?.[ID]?.store===VIEW_STORE)??null;
const pagesOf=j=>[...(j?.pages??[])];
const VIEW_TEXT='<p>What players see of a shop (Utilities). Rebuilt by Utilities; don\'t edit it by hand.</p>';
let creatingView=null;
async function ensureViewJournal(){
 const found=viewJournal();if(found)return found;
 // The entry is Observer so players can open the pages they are given; each page sets its own ownership.
 creatingView??=Promise.resolve(JournalEntry.create({name:VIEW_JOURNAL_NAME,ownership:{default:levels().OBSERVER},flags:{[ID]:{store:VIEW_STORE}}})).finally(()=>{creatingView=null;});
 const made=await creatingView;return viewJournal()??made;
}
const sameOwnership=(have,want)=>Object.entries(want).every(([k,v])=>have?.[k]===v);
let syncChain=Promise.resolve();
/**
 * GM: makes the Player View pages match the presented shops (one page each, ownership per presentation; pages of shops
 * no longer shown are deleted). Writes nothing when they already match. Safe to run again.
 */
export function syncPlayerView(){
 if(!isGM())return Promise.resolve();
 const run=async()=>{
  const ids=players().map(u=>u.id);
  const want=new Map(presentedRecords().map(({rec,view})=>[rec.id,{name:rec.name,type:'text',text:{content:VIEW_TEXT},ownership:presentedOwnership(rec.presented,ids,levels()),
   flags:{[ID]:{shopId:rec.id,shopView:JSON.stringify(view)}}}]));
  // 0.20.0: a shown merchant list is one page (read only; it never lets anyone buy). 0.25.0: readable by the whole
  // party or only by the chosen players.
  for(const {view:v,audience} of sharedLists())want.set(v.id,{name:v.name,type:'text',text:{content:VIEW_TEXT},ownership:presentedOwnership(audiencePresented(audience),ids,levels()),flags:{[ID]:{listId:v.id,listView:JSON.stringify(v)}}});
  let j=viewJournal();if(!j&&!want.size)return;j??=await ensureViewJournal();
  const have=new Map(),remove=[];
  for(const p of pagesOf(j)){const id=p.flags?.[ID]?.shopId??p.flags?.[ID]?.listId;if(want.has(id)&&!have.has(id)&&Boolean(p.flags?.[ID]?.listId)===Boolean(want.get(id).flags[ID].listId))have.set(id,p);else remove.push(p.id);}
  const create=[],update=[];
  for(const [id,data] of want){
   const p=have.get(id);
   if(!p)create.push(data);
   // shopView is a JSON string, so an update always replaces it whole (nothing the GM just hid can linger).
   else{const key=data.flags[ID].listId?'listView':'shopView';
    if(p.flags?.[ID]?.[key]!==data.flags[ID][key]||p.name!==data.name||!sameOwnership(p.ownership,data.ownership))update.push({_id:p.id,name:data.name,ownership:data.ownership,[`flags.${ID}.${key}`]:data.flags[ID][key]});}
  }
  if(create.length)await j.createEmbeddedDocuments('JournalEntryPage',create);
  if(update.length)await j.updateEmbeddedDocuments('JournalEntryPage',update);
  if(remove.length)await j.deleteEmbeddedDocuments('JournalEntryPage',remove);
 };
 const next=syncChain.then(run);syncChain=next.catch(warn('Could not update the shop player view'));return next;
}
let syncTimer=null;
/** Hook-driven rebuild (shop saved, electrum, Locations). Only the first active GM writes. */
export function scheduleSync(){
 if(!isGM()||ctx.coordinatorIsMe?.()===false)return;
 clearTimeout(syncTimer);syncTimer=setTimeout(()=>{syncPlayerView().catch(warn('Could not update the shop player view'));},250);
}

/* ---------- Reading (player or GM) ---------- */
const parseView=(p,key='shopView')=>{try{return JSON.parse(p.flags?.[ID]?.[key]||'null');}catch{return null;}};
/** Projections of the shops and services presented to this user. A player reads only the pages Foundry lets them observe. */
export function forMe(){
 if(isGM())return presentedRecords().map(x=>x.view);
 playerGate();
 return pagesOf(viewJournal()).filter(p=>p.flags?.[ID]?.shopView&&p.testUserPermission?.(game.user,'OBSERVER')).map(p=>parseView(p)).filter(v=>v?.id);
}
export const viewOf=id=>forMe().find(v=>v.id===id)??null;
/** 0.20.0, api.shops.browse: the merchant lists the GM shows, read only. Browsing never lets anyone buy, sell or use. */
export function browse(){
 if(isGM())return visibleListViews();
 playerGate();
 return pagesOf(viewJournal()).filter(p=>p.flags?.[ID]?.listView&&p.testUserPermission?.(game.user,'OBSERVER')).map(p=>parseView(p,'listView')).filter(v=>v?.id);
}
/** An entry's read-only view from a shown merchant list, or null. */
export function browseViewOf(id){for(const l of browse()){const v=l.entries.find(e=>e.id===id);if(v)return v;}return null;}
/** Characters this user may send a purchase to (D9): owned characters; the GM: every character. */
export function receivers(user=game.user){
 const stash=ctx.stashActor?.();
 return [...(game.actors??[])].filter(a=>a.type==='character'&&a.id!==stash?.id&&owns(a,user)).sort((a,b)=>a.name.localeCompare(b.name));
}
/** The party stash when this user may spend from it, else null. */
export function readablePurse(user=game.user){const s=ctx.stashActor?.();if(!s||!readCoins(s))return null;return user?.isGM||ctx.stashEnabled?.()?s:null;}
function cleanReq(r={}){
 const payFrom=r.payFrom==='purse'?'purse':'actor';
 return {shopId:String(r.shopId??''),lineId:String(r.lineId??''),quantity:r.quantity===''||r.quantity===null||r.quantity===undefined?r.quantity:Number(r.quantity),
  payFrom,actorId:String(r.actorId??''),payerId:payFrom==='actor'?String(r.payerId||r.actorId||''):'',rev:r.rev===undefined?undefined:Number(r.rev)};
}
/**
 * api.shops.quote: the payment plan the buyer would see, or a refusal; nothing changes. Worked out from this user's
 * view of the shop (the merchant's coins only when they are shown), so the GM client may still refuse.
 */
export function quote(req={}){
 playerGate();
 const r=cleanReq(req),view=viewOf(r.shopId);
 if(!view)return {ok:false,reason:SHOP_REFUSALS.notOpen};
 const receiver=game.actors?.get(r.actorId),stash=ctx.stashActor?.();
 if(!receiver||receiver.id===stash?.id||!owns(receiver,game.user))return {ok:false,reason:'Choose a character you own to receive it.'};
 let payer;
 if(r.payFrom==='purse'){payer=readablePurse();if(!payer)return {ok:false,reason:'The party purse is not available.'};}
 else{payer=game.actors?.get(r.payerId);if(!payer||payer.id===stash?.id||!owns(payer,game.user))return {ok:false,reason:'You can only pay with the coins of a character you own.'};}
 const q=quotePurchase({view,lineId:r.lineId,quantity:r.quantity,rev:r.rev,hold:readCoins(payer),electrum:electrum()});
 return {...q,payFrom:r.payFrom,payerName:payer.name,receiverName:receiver.name,vote:r.payFrom==='purse'&&!isGM()&&shopVoteRequired()};
}

/* ---------- Present (GM) ---------- */
/** 0.20.0: a shop or a service by id (GM data), with how to store it again. */
export function getRecord(id){
 if(String(id).startsWith('SVC-')){const s=servicesAll().find(x=>x.id===id);if(!s)throw Error('That service no longer exists.');return s;}
 return mustGet(id);
}
async function writeRecord(old,patch){
 if(old.kind==='service'){const {known,...rec}=old;const next={...rec,...patch};await writeService(next);return next;}
 const next=norm({...old,...patch});await writeShop(next);return next;
}
async function present(id,{mode='all',userIds=[]}={}){
 gmOnly();
 if(!['all','users'].includes(mode))throw Error("Present to 'all' players or to chosen 'users'.");
 const known=new Set(players().map(u=>u.id)),ids=mode==='users'?[...new Set([].concat(userIds??[]))].filter(u=>known.has(u)):[];
 if(mode==='users'&&!ids.length)throw Error('Choose at least one player.');
 const shop=await queueShops(async()=>{const old=getRecord(id);if(old.kind==='service'&&!old.known)throw Error(`${UNKNOWN_TYPE}: this Utilities version can't show it to players.`);
  return writeRecord(old,{presented:{mode,userIds:ids,since:Date.now(),by:game.user?.id??null}});});
 await syncPlayerView();
 // No shop id or name in the broadcast: a player it isn't shown to learns nothing.
 game.socket?.emit?.(SOCKET,{type:'shop-presented',to:mode==='all'?'all':ids});
 return clone(shop);
}
async function stopShowing(id){
 gmOnly();
 const shop=await queueShops(async()=>writeRecord(getRecord(id),{presented:null}));
 await syncPlayerView();
 return clone(shop);
}
/**
 * 0.25.0, for merchant lists: several Present / Stop showing changes in one go (`presented` null stops showing), then
 * one player-view rebuild and one ping. A missing record or a service type this version doesn't know is skipped with
 * the reason; the rest go ahead. Returns {changed: [{id, name, presented}], skipped: [{id, reason}]}.
 */
export async function setPresentations(changes=[]){
 gmOnly();
 const known=new Set(players().map(u=>u.id)),changed=[],skipped=[],pinged=new Set();let all=false;
 await queueShops(async()=>{
  for(const {id,presented:p} of changes){
   try{
    const old=getRecord(id);
    if(p&&old.kind==='service'&&!old.known)throw Error(`${UNKNOWN_TYPE}: this Utilities version can't show it to players.`);
    const next=p?{mode:p.mode==='users'?'users':'all',userIds:p.mode==='users'?[...new Set(p.userIds??[])].filter(u=>known.has(u)):[],since:old.presented?.since??Date.now(),by:game.user?.id??null}:null;
    if(next?.mode==='users'&&!next.userIds.length)throw Error('Choose at least one player.');
    if(JSON.stringify(old.presented?{mode:old.presented.mode,userIds:old.presented.userIds}:null)===JSON.stringify(next?{mode:next.mode,userIds:next.userIds}:null))continue;
    const rec=await writeRecord(old,{presented:next});changed.push({id,name:rec.name,presented:clone(next)});
    if(next?.mode==='all')all=true;else for(const u of next?.userIds??[])pinged.add(u);
   }catch(e){skipped.push({id,reason:e?.message??String(e)});}
  }
 });
 if(changed.length)await syncPlayerView();
 if(all||pinged.size)game.socket?.emit?.(SOCKET,{type:'shop-presented',to:all?'all':[...pinged]});
 return {changed,skipped};
}
function presented(){gmOnly();return [...readAll(),...servicesAll()].filter(s=>s.presented).map(s=>({id:s.id,name:s.name,presented:clone(s.presented)}));}
const userLabel=u=>{const chars=[...(game.actors??[])].filter(a=>a.type==='character'&&a.testUserPermission?.(u,'OWNER')).map(a=>a.name);return `${u.name}${chars.length?` (${chars.join(', ')})`:''}${u.active?'':' · not logged in'}`;};
/** GM dialog: All players, or Chosen players with their characters. */
export async function presentDialog(id){
 gmOnly();const s=getRecord(id),pl=players();
 if(!pl.length)throw Error('There are no player users yet.');
 const form=await formDialog(`Present ${s.name}`,[
  {name:'mode',label:'Show to',type:'select',value:'all',options:[{value:'all',label:'All players (also players who log in later)'},{value:'users',label:'Chosen players (tick them below)'}]},
  {name:'users',label:'Chosen players',type:'checklist',options:pl.map(u=>({value:u.id,label:userLabel(u)})),hint:s.kind==='service'?'Only these players see the service and can use it, until you click Stop showing.':'Only these players see the shop and can buy from it, until you click Stop showing.'}
 ],{ok:s.kind==='service'?'Present service':'Present shop'});
 if(!form)return null;
 return present(id,{mode:form.mode==='users'?'users':'all',userIds:[].concat(form.users??[])});
}

/* ---------- The purchase (GM client) ---------- */
const buyQueues=new Map();
/** One purchase at a time per shop. */
export function queueBuy(shopId,run){const next=(buyQueues.get(shopId)??Promise.resolve()).then(run);buyQueues.set(shopId,next.catch(()=>{}));return next;}
const handled=new Map(),HANDLED_MS=10*60000;
const voting=new Set();
const pick=(coins,keys)=>Object.fromEntries(keys.map(k=>[k,Math.max(0,Math.floor(Number(coins?.[k])||0))]));
const coinUpdate=coins=>Object.fromEntries(Object.entries(coins).map(([c,n])=>[`system.currency.${c}`,n]));
/** Checks 1–6 on fresh data and the payment plan from fresh coins and the fresh shop purse. Throws the refusal. */
function gate(r,user){
 playerGate(user);
 const shop=readAll().find(s=>s.id===r.shopId);if(!shop)throw Error(SHOP_REFUSALS.notOpen);
 // The GM may buy from any shop that is shown to someone.
 const asShop=user.isGM&&shop.presented?{...shop,presented:{mode:'all',userIds:[]}}:shop;
 const c=checkPurchase({shop:asShop,lineId:r.lineId,quantity:r.quantity,rev:r.rev,userId:user.id});if(!c.ok)throw Error(c.reason);
 const stash=ctx.stashActor?.(),receiver=game.actors?.get(r.actorId);
 if(!receiver||receiver.id===stash?.id||!owns(receiver,user))throw Error('Choose a character you own to receive it.');
 let payer;
 if(r.payFrom==='purse'){
  if(!stash||!readCoins(stash))throw Error('There is no party purse yet.');
  if(!user.isGM&&!ctx.stashEnabled?.())throw Error('The GM has turned the party stash off.');
  payer=stash;
 }else{payer=game.actors?.get(r.payerId);if(!payer||payer.id===stash?.id||!owns(payer,user))throw Error('You can only pay with the coins of a character you own.');}
 const hold=readCoins(payer);if(!hold)throw Error(`${payer.name} has no dnd5e coins.`);
 const plan=planShopPayment({hold,totalCp:c.totalCp,priceCoin:c.line.priceCoin,shopPurse:shop.purse,electrum:electrum()});
 if(!plan.ok){if(plan.noChange)void topUpWhisper(shop,c.totalCp,c.line).catch(warn('Could not whisper the GM'));throw Error(plan.reason);}
 return {shop,line:c.line,quantity:c.quantity,stockAfter:c.stockAfter,totalCp:c.totalCp,receiver,payer,hold,plan,name:shopLineName(c.line),count:purchaseCount(c.line,c.quantity)};
}
export const whisper=(content,ids)=>ChatMessage.create({content,whisper:[...new Set(ids)],speaker:{alias:'Utilities'}});
/**
 * 0.22.0: the purchase, sale or bank card, whispered to the player who made it and the GM (never public). Called
 * without waiting after the change is done: a chat failure is only a console warning, never a refusal or a rollback.
 */
export function postTradeCard(entry,user){
 const run=async()=>{await whisper(tradeCardHTML(entry),[user?.id,...gmIds()].filter(Boolean));};
 void run().catch(warn('Could not post the chat card'));
}
/** D1a: the GM gets the refusal with a Top up shop purse button (no automatic top-up). */
async function topUpWhisper(shop,totalCp,line){
 return whisper(`<p><strong>${E(shop.name)}</strong>: a purchase was refused because the merchant can't make change for ${E(shopPriceText(totalCp,line.priceCoin,{electrum:electrum()}))}. Merchant's coins: ${E(coinsText(shop.purse))}.</p><p><button type="button" class="ag-btn ag-btn--sm" data-agu-shop-topup="${E(shop.id)}"><i class="fa-solid fa-coins" aria-hidden="true"></i> Top up shop purse</button></p>`,gmIds());
}
/** A rollback that failed: the GM is told exactly what to put right by hand. */
function fixByHand(lines){void whisper(`<p><strong>Utilities shop purchase: fix by hand</strong></p><ul>${lines.map(l=>`<li>${E(l)}</li>`).join('')}</ul>`,gmIds()).catch(warn('Could not whisper the GM'));}
async function removeMade(actor,data){
 const ids=data.map(d=>d._id).filter(id=>actor.items?.get?.(id));if(!ids.length)return true;
 try{await actor.deleteEmbeddedDocuments('Item',ids);return true;}catch(e){warn(`Could not remove purchase copies from ${actor.name}`)(e);return false;}
}
async function undoItems(g,data,why){if(!await removeMade(g.receiver,data))fixByHand([`${why} Delete the new ${g.name} from ${g.receiver.name}.`]);}
/** A–D in order; each failure puts back what the earlier steps did. */
async function carryOut(r,user,approval){
 const g=gate(r,user),keys=Object.keys(g.plan.after);
 // A. The item copies on the receiver (fresh ids, container contents linked), all checked before any coin moves.
 const data=purchaseItemData(g.line,g.quantity,{randomId});
 try{await g.receiver.createEmbeddedDocuments('Item',data,{keepId:true});}
 catch(e){warn('Could not create purchase items')(e);await undoItems(g,data,'A purchase failed.');throw Error('Could not add the item. Nothing was charged.');}
 if(data.some(d=>!g.receiver.items?.get?.(d._id))){await undoItems(g,data,'A purchase failed.');throw Error('Could not add the item. Nothing was charged.');}
 // B. One currency update on the payer, from the coins the plan was made from.
 const now=readCoins(g.payer);
 if(!now||keys.some(k=>pick(now,[k])[k]!==pick(g.hold,[k])[k])){await undoItems(g,data,'A purchase was called off.');throw Error('Those coins changed while buying. Look again. Nothing was charged.');}
 try{await g.payer.update(coinUpdate(g.plan.after));}
 catch(e){warn('Could not take the payment')(e);await undoItems(g,data,'A payment failed.');throw Error('Payment failed. Nothing was charged and nothing was given.');}
 // C. One update of the shop's GM page: stock, the shop purse, the sale. A purchase never changes `rev`.
 let entry;
 try{
  entry=await queueShops(async()=>{
   const fresh=readAll().find(s=>s.id===g.shop.id),fl=fresh?.lines?.find(l=>l.lineId===g.line.lineId);
   if(!fresh||fresh.rev!==g.shop.rev||!fl||fl.stock!==g.line.stock||JSON.stringify(fresh.purse)!==JSON.stringify(g.shop.purse))throw Error(SHOP_REFUSALS.changed);
   const e=shopPurchaseEntry({id:randomId(),shop:fresh,line:fl,itemName:g.name,quantity:g.quantity,payFrom:r.payFrom,payer:g.payer,actor:g.receiver,user,approval,plan:g.plan,
    coinsBefore:pick(g.hold,keys),shopPurseBefore:fresh.purse,createdItemIds:data.map(d=>d._id),electrum:electrum(),worldTime:game.time?.worldTime??null,realTime:Date.now()});
   const lines=fresh.lines.map(l=>l.lineId===fl.lineId?{...l,stock:g.stockAfter}:l);
   await writeShop(norm({...fresh,lines,purse:fresh.purse?{...fresh.purse,...g.plan.shopAfter}:null}),{log:appendLog(fresh.id,e)});
   return e;
  });
 }catch(e){
  warn('Could not update the shop')(e);
  let back=true;try{await g.payer.update(coinUpdate(pick(g.hold,keys)));}catch(err){back=false;warn('Could not put the coins back')(err);}
  const gone=await removeMade(g.receiver,data);
  if(!back||!gone)fixByHand([...(back?[]:[`Set ${g.payer.name}'s coins back to ${coinsText(pick(g.hold,keys))} (they are now ${coinsText(g.plan.after)}).`]),...(gone?[]:[`Delete the new ${g.name} from ${g.receiver.name}.`])]);
  if(!back)throw Error('Payment failed and your coins could not be put back yet. The GM has been told what to fix.');
  throw Error(e?.message===SHOP_REFUSALS.changed?`${SHOP_REFUSALS.changed} Nothing was charged.`:'Payment failed. Nothing was charged and nothing was given.');
 }
 // D. History (purse purchases), the rebuilt player view, the receipt.
 if(r.payFrom==='purse')await ctx.logStash?.(entry)?.catch?.(warn('Could not write stash history'));
 await syncPlayerView().catch(warn('Could not update the shop player view'));
 postTradeCard(entry,user);
 return purchaseText({count:g.count,name:g.name,receiverName:g.receiver.name,plan:g.plan,payFrom:r.payFrom});
}
async function runBuy(r,user){
 const first=gate(r,user);let approval=user.isGM?'gm':'not-required';
 if(!user.isGM&&r.payFrom==='purse'&&shopVoteRequired()){
  if(voting.has(user.id))throw Error('You already have a purchase waiting for the party.');
  voting.add(user.id);
  try{
   const total=shopPriceText(first.totalCp,first.line.priceCoin,{electrum:electrum()});
   const outcome=await ctx.runConsent(createPoll({id:randomId(),requesterId:user.id,voters:consentVoters(game.users,user.id)}),
    {purpose:'shop',requester:user.name,item:first.name,quantity:first.count,total,shop:first.shop.name,actor:first.receiver.name});
   if(outcome!=='approved'){
    const no=outcome==='denied'?'denied':'timed-out';
    const e=shopPurchaseEntry({id:randomId(),shop:first.shop,line:first.line,itemName:first.name,quantity:first.quantity,payFrom:'purse',payer:first.payer,actor:first.receiver,user,approval:no,
     plan:first.plan,coinsBefore:pick(first.hold,Object.keys(first.plan.after)),shopPurseBefore:first.shop.purse,electrum:electrum(),worldTime:game.time?.worldTime??null,realTime:Date.now()});
    await ctx.logStash?.({...e,moved:false})?.catch?.(warn('Could not write stash history'));
    throw Error(outcome==='denied'?`The party denied spending the purse on ${first.name}.`:'Not every player answered in time.');
   }
   approval='accepted';
  }finally{voting.delete(user.id);}
 }
 // After the vote: checks 3–5 and the plan again, inside the shop's queue (and the purse's, for purse money).
 return queueBuy(r.shopId,()=>r.payFrom==='purse'&&ctx.queuePurse?ctx.queuePurse(()=>carryOut(r,user,approval)):carryOut(r,user,approval));
}
/**
 * GM client: one purchase request. The same requestId is never carried out twice. If it ends after the buyer's
 * request stopped waiting, the buyer gets a whisper with the real result.
 */
export async function executeBuy(msg,user){
 if(!isGM())throw Error('GM only.');
 const id=String(msg?.requestId??''),now=Date.now();
 for(const [k,t] of handled)if(now-t>HANDLED_MS)handled.delete(k);
 if(id){if(handled.has(id))throw Error('That purchase was already handled.');handled.set(id,now);}
 const limit=Number(msg?.timeoutMs)||BUY_TIMEOUT_MS;let ok=false,text='';
 try{text=await runBuy(cleanReq(msg),user);ok=true;return text;}
 catch(e){text=nothingCharged(e?.message??String(e));throw Error(text);}
 finally{
  if(!user.isGM&&Date.now()-now>limit-2000){
   const name=readAll().find(s=>s.id===msg?.shopId)?.name;
   void whisper(`<p>Your purchase${name?` at ${E(name)}`:''}${ok?' went through':' was not made'}: ${E(text)}</p>`,[user.id,...gmIds()]).catch(warn('Could not whisper the buyer'));
  }
 }
}
/** api.shops.buy: the GM carries it out here; a player asks the GM client. Resolves the receipt text. */
export async function buy(req={}){
 const r=cleanReq(req);
 if(isGM())return executeBuy({...r,requestId:randomId()},game.user);
 playerGate();
 const q=quote(r);if(!q.ok)throw Error(nothingCharged(q.reason));
 const timeout=q.vote?BUY_VOTE_TIMEOUT_MS:BUY_TIMEOUT_MS;
 if(q.vote)ui.notifications?.info('Asking the party to approve…');
 return ctx.requestGM('shop-buy',{...r,timeoutMs:timeout},timeout,{timeoutMessage:GM_SLOW});
}

/* ---------- Player shop window and the Buy dialog ---------- */
const coinStrip=(coins,ep)=>coinStripHTML(coins,ep);
const portrait=m=>m?.img?`<img class="agu-shop-portrait" src="${E(m.img)}" alt="">`:`<span class="agu-shop-portrait" aria-hidden="true">${E(initials(m?.name))}</span>`;
const stockBadge=l=>l.soldOut?'<span class="ag-badge ag-badge--danger">Sold out</span>':l.stock===null||l.stock===undefined?'<span class="ag-badge">In stock</span>':`<span class="ag-badge">${E(l.stock)} left</span>`;
/** 0.24.0: the item as a button: dnd5e's tooltip from the player view's trimmed copy, a click opens it read only. */
export const wareItem=(view,l,inner,cls)=>itemButton({key:`${view.id}:${l.lineId}`,data:l.tip??{name:l.name,img:l.img,type:'loot',system:{description:{value:l.description??''}}},name:l.name,inner,cls});
/**
 * 0.24.0: one ware as a card: picture and name (hover: the item tooltip, click: open it), what it is, flavour, then the
 * price as coins, the stock and Buy…. The same card for players and the GM's "Open" view.
 */
function wareCard(view,l,{ro,chars}){
 const pic=wareItem(view,l,l.img?`<img src="${E(l.img)}" alt="">`:icon('fa-box'),'agu-item-link agu-ware-card__img');
 const meta=[l.per>1?`${l.per} per purchase`:'',l.type].filter(Boolean).join(' · ');
 return `<li class="agu-ware-card${l.soldOut?' is-disabled':''}" data-line="${E(l.lineId)}">${pic}<div class="agu-ware-card__body">${wareItem(view,l,E(l.name),'agu-item-link agu-ware-card__name')}${meta?`<span class="agu-ware-card__meta">${E(meta)}</span>`:''}${l.flavour?`<span class="agu-ware-card__flavour">${E(l.flavour)}</span>`:''}</div>
  <div class="agu-ware-card__foot"><strong class="agu-ware__price" aria-label="Price ${E(l.priceText)}">${coinChipsHTML(l.priceText)}</strong>${stockBadge(l)}${button('shop-buy','Buy…',{kind:'sm',ic:'fa-cart-shopping',disabled:ro||l.soldOut||!chars.length,attrs:`data-shop="${E(view.id)}" data-line-id="${E(l.lineId)}" aria-label="Buy ${E(l.name)}"`})}</div></li>`;
}
/** The wares grouped by category (item type), each group a grid of cards. */
export function waresHTML(view,opts){
 return groupByCategory(view.lines).map(g=>`<section class="agu-ware-group" aria-label="${E(g.category)}"><h4 class="ag-eyebrow">${E(g.category)} · ${g.lines.length}</h4><ul class="agu-ware-grid">${g.lines.map(l=>wareCard(view,l,opts)).join('')}</ul></section>`).join('');
}
export const empty=(title,text)=>`<div class="ag-empty">${icon('fa-store')}<p class="ag-empty__title">${E(title)}</p><p class="ag-empty__text">${E(text)}</p></div>`;
/** One presented shop as the buyer sees it (the shop window). `state.actorId`: whose coins the strip shows. */
export function shopViewHTML(view,state={}){
 if(view.kind==='service')return serviceViewHTML(view,state);
 const ro=state.readOnly===true,ep=electrum(),chars=receivers(),actor=chars.find(a=>a.id===state.actorId)??chars[0]??null,purse=readablePurse();
 const meta=[view.merchant?.name,view.location?.name].filter(Boolean).map(E).join(' · ');
 const head=`<header class="agu-shop-head">${portrait(view.merchant)}<div class="agu-shop-head__text"><h2>${E(view.name)}</h2>${meta?`<p class="agu-note">${meta}</p>`:''}${view.flavour?`<p>${E(view.flavour)}</p>`:''}</div>${ro?`<span class="ag-badge">${icon('fa-book-open')} Browsing only</span>`:`<span class="ag-badge ag-badge--ok">${icon('fa-door-open')} Open for you</span>`}</header>`;
 const own=actor?readCoins(actor):null;
 const strips=[
  purse?`<section class="agu-shop-coins"><h3 class="ag-eyebrow">Party purse</h3>${coinStrip(readCoins(purse),ep)}</section>`:'',
  chars.length?`<section class="agu-shop-coins"><h3 class="ag-eyebrow"><label for="agu-shop-actor-${E(view.id)}">Your coins</label></h3><select id="agu-shop-actor-${E(view.id)}" data-shop-actor aria-label="Whose coins">${chars.map(a=>`<option value="${E(a.id)}"${a.id===actor?.id?' selected':''}>${E(a.name)}</option>`).join('')}</select>${own?coinStrip(own,ep):'<p class="agu-note">This character has no dnd5e coins.</p>'}</section>`:'',
  view.purse?`<section class="agu-shop-coins"><h3 class="ag-eyebrow">Merchant's coins</h3>${coinStrip(view.purse,ep)}<p class="ag-field__hint">Change comes from here.</p></section>`:''
 ].filter(Boolean).join('');
 const wares=view.lines.length?`<div class="agu-wares">${waresHTML(view,{ro,chars})}</div>`:empty('Nothing for sale right now','The merchant has nothing out on the counter yet.');
 const none=ro?`<p class="ag-notice ag-notice--info">${icon('fa-circle-info')}<span>Ask the GM to open this. You can look, but you can't buy${view.buys?' or sell':''} here until your GM shows you this shop.</span></p>`:chars.length?'':`<p class="ag-notice ag-notice--warn">${icon('fa-triangle-exclamation')}<span>You need a character of your own to ${view.buys?'buy or sell':'buy'} here.</span></p>`;
 // 0.19.0: a shop that buys from players gets a Buy / Sell switch.
 const mode=!ro&&view.buys&&state.mode==='sell'?'sell':'buy';
 const body=mode==='sell'?sellViewHTML(view,actor,state):`<h3 class="ag-eyebrow">For sale · ${view.lines.length}</h3>${wares}`;
 return `<section class="agu-shop-view" aria-label="${E(view.name)}">${head}${strips?`<div class="agu-shop-strips">${strips}</div>`:''}${none}${view.buys&&!ro?modeSwitch(view,mode):''}${body}</section>`;
}
const avatar=v=>v.merchant?.img?`<img class="ag-row__icon agu-shop-avatar" src="${E(v.merchant.img)}" alt="">`:`<span class="ag-row__icon agu-shop-avatar" aria-hidden="true">${E(initials(v.merchant?.name))}</span>`;
const entryRow=(v,end)=>`<li class="ag-row agu-shop-row">${avatar(v)}<div class="ag-row__main"><span class="ag-row__title">${E(v.name)}</span><span class="ag-row__meta">${[v.merchant?.name,v.location?.name,entrySummary(v)].filter(Boolean).map(E).join(' · ')}</span></div><div class="ag-row__end">${end}</div></li>`;
function openShopsHTML(){
 let views;try{views=forMe();}catch(e){return empty('Shops are closed',e.message);}
 if(!views.length)return empty('No shops open for you','When your GM shows you a shop, it opens here and in its own window.');
 return `<h3 class="ag-eyebrow">Open shops · ${views.length}</h3><ul class="ag-rows">${views.map(v=>entryRow(v,button('shop-view',v.kind==='service'?'Open':'Open shop',{kind:'sm',ic:'fa-store',attrs:`data-shop="${E(v.id)}" aria-label="Open ${E(v.name)}"`}))).join('')}</ul>`;
}
/** 0.20.0: the lists the GM shares, read only. 0.25.0: an entry presented to this user is Open (Open shop), any other is Closed (Look inside, read only). */
function merchantListHTML(){
 let lists,open;try{lists=browse();open=new Set(forMe().map(v=>v.id));}catch(e){return empty('Shops are closed',e.message);}
 if(!lists.length)return empty('No merchant list yet',"Your GM hasn't shared a merchant list.");
 return lists.map(l=>`<section class="agu-shop-group"><h3 class="ag-eyebrow">${E([l.name,l.location?.name].filter(Boolean).join(' · '))} · ${l.entries.length}</h3>${l.entries.length?`<ul class="ag-rows">${l.entries.map(v=>entryRow(v,open.has(v.id)?`<span class="ag-badge ag-badge--ok">${icon('fa-door-open')} Open</span>${button('shop-view',v.kind==='service'?'Open':'Open shop',{kind:'sm',ic:'fa-store',attrs:`data-shop="${E(v.id)}" aria-label="Open ${E(v.name)}"`})}`
  :`<span class="ag-badge">${icon('fa-door-closed')} Closed</span>${button('shop-view','Look inside',{kind:'sm',ic:'fa-eye',attrs:`data-shop="${E(v.id)}" aria-label="Look inside ${E(v.name)}"`})}`)).join('')}</ul>`:'<p class="ag-field__hint">Nothing on this list yet.</p>'}</section>`).join('');
}
/** The player's Shops tab: Open shops (presented to this user) and Merchant list (read only). */
export function playerShopsView(app={}){
 const sub=app.playerShopSub==='lists'?'lists':'open';
 const seg=`<div class="ag-segmented agu-shop-subtabs" role="radiogroup" aria-label="Shops sections">${[['open','Open shops'],['lists','Merchant list']].map(([id,label])=>`<button type="button" role="radio" data-player-shop-sub="${id}" aria-checked="${sub===id}">${label}</button>`).join('')}</div>`;
 return `<section class="agu-shops" aria-label="Shops">${seg}${sub==='lists'?merchantListHTML():openShopsHTML()}</section>`;
}
/** Wires the player's Shops sub-tabs. */
export function bindPlayerShops(app,root,{render}){
 if(app.tab!=='shops'||isGM())return;
 for(const b of root.querySelectorAll('[data-player-shop-sub]'))b.addEventListener('click',()=>{app.playerShopSub=b.dataset.playerShopSub;render();});
}
/** The plan (or the refusal) as dialog HTML, kit parts only. */
/** 0.24.0: the item at the top of a purchase preview: picture, name (tooltip, click to open), what it is, the price each. */
const previewItem=(view,line)=>!view||!line?'':`<div class="agu-preview-item">${wareItem(view,line,line.img?`<img src="${E(line.img)}" alt="">`:icon('fa-box'),'agu-item-link agu-preview-item__img')}<div class="agu-preview-item__text">${wareItem(view,line,E(line.name),'agu-item-link agu-ware-card__name')}<span class="agu-ware-card__meta">${E(line.type??'')}${line.type?' · ':''}${coinChipsHTML(line.priceText)} each</span></div></div>`;
function quoteHTML(q,name,{view=null,line=null}={}){
 if(!q.ok)return `${previewItem(view,line)}<p class="ag-notice ag-notice--danger" role="alert">${icon('fa-circle-exclamation')}<span>${E(nothingCharged(q.reason))}</span></p>`;
 const back=Object.values(q.back??{}).some(n=>n>0);
 const kv=[['Buying',E(`${q.count} ${name}`)],['Goes to',E(q.receiverName)],['Total',coinChipsHTML(q.totalText)],[q.payFrom==='purse'?'The party purse pays':'You pay',coinChipsHTML(coinsText(q.pay))],...(back?[['Change back',coinChipsHTML(coinsText(q.back))]]:[]),
  [q.payFrom==='purse'?'Party purse after':`${q.payerName} after`,coinChipsHTML(coinsText(q.after))]];
 return `${previewItem(view,line)}<dl class="ag-kv">${kv.map(([k,v])=>`<dt>${E(k)}</dt><dd>${v}</dd>`).join('')}</dl>${q.vote?`<p class="ag-notice ag-notice--info">${icon('fa-users')}<span>The party must accept before the purse pays. Every other connected player is asked; no answer in 60 seconds cancels.</span></p>`:''}`;
}
/** Buy dialog: how many, goes to, pay with; then the plan with Confirm purchase, or the refusal with Change purchase. */
export async function buyDialog(shopId,lineId,{actorId=''}={}){
 const view=viewOf(shopId);if(!view)throw Error(SHOP_REFUSALS.notOpen);
 const line=view.lines.find(l=>l.lineId===lineId);if(!line)throw Error(SHOP_REFUSALS.changed);
 const chars=receivers();if(!chars.length)throw Error('You need a character of your own to buy here.');
 const first=chars.some(a=>a.id===actorId)?actorId:chars[0].id,vote=!isGM()&&shopVoteRequired();
 let form={quantity:'1',actorId:first,pay:`actor:${first}`};
 for(;;){
  const pays=[...(readablePurse()?[{value:'purse',label:`Party purse${vote?' (party must accept)':''}`}]:[]),...chars.map(a=>({value:`actor:${a.id}`,label:`${a.name}'s coins`}))];
  const res=await formDialog(`Buy ${line.name}`,[
   {name:'quantity',label:'How many',type:'number',value:form.quantity,hint:`${line.priceText} each${line.per>1?`, ${line.per} per purchase`:''}.${line.stock===null||line.stock===undefined?'':` ${line.stock} left.`}`},
   {name:'actorId',label:'Goes to',type:'select',value:form.actorId,options:chars.map(a=>({value:a.id,label:a.name}))},
   {name:'pay',label:'Pay with',type:'select',value:form.pay,options:pays}
  ],{ok:'Review purchase'});
  if(!res)return null;
  form={...form,...res};
  const pay=String(form.pay??''),req={shopId,lineId,quantity:Number(form.quantity),actorId:form.actorId,payFrom:pay==='purse'?'purse':'actor',payerId:pay.startsWith('actor:')?pay.slice(6):'',rev:view.rev};
  const q=quote(req);
  if(!q.ok){if(await choiceDialog('Can\'t buy this',quoteHTML(q,line.name,{view,line}),[{action:'change',label:'Change purchase',default:true}])!=='change')return null;continue;}
  if(await choiceDialog(`Buy ${line.name}?`,quoteHTML(q,line.name,{view,line}),[{action:'buy',label:'Confirm purchase',icon:'fa-solid fa-cart-shopping',default:true}])!=='buy')return null;
  return buy(req);
 }
}
const windows=new Map();
let ShopWindowClass=null;
function shopWindowClass(){
 if(ShopWindowClass)return ShopWindowClass;
 ShopWindowClass=class extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS={classes:['ag-app','ag-utilities','agu-shop-window'],window:{title:'Shop',resizable:true,minimizable:true},position:{width:560,height:640}};
  constructor(shopId){super({id:`ashen-gate-utilities-shop-${String(shopId).toLowerCase()}`,position:windowSize(ShopWindowClass.DEFAULT_OPTIONS.position)});this.shopId=shopId;this.actorId='';this.mode='buy';this.payTo='actor';this.readOnly=false;this.bank={};}
  /** The live view when this shop is presented to the user, else its read-only view from a shown merchant list. */
  current(){let v=null,ro=false;try{v=viewOf(this.shopId);if(!v){v=browseViewOf(this.shopId);ro=Boolean(v);}}catch{v=null;}return {v,ro};}
  get title(){return this.current().v?.name??'Shop';}
  async _renderHTML(){const {v,ro}=this.current();this.readOnly=ro;return `<div class="agu-shop-window__body">${v?shopViewHTML(v,this):empty('This shop is closed now','It opens again when your GM shows it to you.')}</div>`;}
  _replaceHTML(html,content){content.innerHTML=html;
   // 0.20.0: a service's own controls (the Bank form).
   if(!this.readOnly){const {v}=this.current();if(v?.kind==='service')bindServiceView(this,content,v,()=>this.render().catch(ctx.error??console.error));}
   content.querySelector('[data-shop-actor]')?.addEventListener('change',e=>{this.actorId=e.target.value;this.render().catch(ctx.error??console.error);});
   for(const b of content.querySelectorAll('[data-action="shop-buy"]'))b.addEventListener('click',()=>{if(b.disabled)return;b.disabled=true;buyFlow(b.dataset.shop,b.dataset.lineId,{actorId:this.actorId}).finally(()=>{b.disabled=false;});});
   // 0.19.0: Buy / Sell, where the coins go, Sell…, and a drop from the player's own sheet.
   const again=()=>this.render().catch(ctx.error??console.error);
   for(const b of content.querySelectorAll('[data-shop-mode]'))b.addEventListener('click',()=>{this.mode=b.dataset.shopMode;again();});
   for(const b of content.querySelectorAll('[data-sell-pay]'))b.addEventListener('click',()=>{this.payTo=b.dataset.sellPay;again();});
   const seller=()=>this.actorId||receivers()[0]?.id||'';
   for(const b of content.querySelectorAll('[data-action="shop-sell"]'))b.addEventListener('click',()=>{if(b.disabled)return;b.disabled=true;sellFlow(b.dataset.shop,seller(),b.dataset.itemId,{payTo:this.payTo}).finally(()=>{b.disabled=false;});});
   const body=content.querySelector('.agu-shop-window__body');
   if(body){
    body.addEventListener('dragover',ev=>ev.preventDefault());
    body.addEventListener('drop',ev=>{ev.preventDefault();let v=null;try{v=viewOf(this.shopId);}catch{v=null;}
     if(!v){ui.notifications?.warn('Ask the GM to open this.');return;}
     if(!v.buys){ui.notifications?.warn('This shop doesn\'t buy items.');return;}
     this.mode='sell';sellDrop(this.shopId,ev,{payTo:this.payTo}).finally(again);});
   }
  }
  _onClose(o){super._onClose?.(o);if(windows.get(this.shopId)===this)windows.delete(this.shopId);}
 };
 return ShopWindowClass;
}
/** Runs the Buy dialog and reports the result: the receipt, or the refusal ending "Nothing was charged." */
export function buyFlow(shopId,lineId,opts){
 return buyDialog(shopId,lineId,opts).then(msg=>{if(msg)ui.notifications?.info(msg);},e=>{const m=e?.message??String(e);ui.notifications?.[m===GM_SLOW?'warn':'error'](m===GM_SLOW?m:nothingCharged(m));});
}
/** api.shops.open(id?): the shop's own window, or the Shops tab with no id. */
export async function openShop(id){
 if(!isGM())playerGate();
 if(!id)return ctx.openTab?.('shops');
 if(!viewOf(id)&&!browseViewOf(id))throw Error(SHOP_REFUSALS.notOpen);
 let w=windows.get(id);if(!w){w=new (shopWindowClass())(id);windows.set(id,w);}
 await w.render({force:true});return w;
}
/** Re-renders open shop windows; closes them all when shops are no longer visible to this user. */
export function refreshShopWindows(){
 for(const w of [...windows.values()]){if(!shopsVisible()){w.close().catch(()=>{});continue;}if(w.rendered)w.render().catch(()=>{});}
}
const announced=new Set();
/** A player's client after the GM presents a shop: each newly visible shop opens in its own window. */
function openNewShops(){
 if(isGM()||!shopsVisible())return;
 let views=[];try{views=forMe();}catch{return;}
 for(const v of views){if(announced.has(v.id))continue;announced.add(v.id);ui.notifications?.info(`${v.name} is open for you.`);openShop(v.id).catch(()=>{});}
 for(const id of [...announced])if(!views.some(v=>v.id===id))announced.delete(id);
}
/** Broadcasts every client handles (merged into main.mjs's socket handlers). */
export const tradeSocketHandlers={
 'shop-presented':msg=>{if(isGM())return;if(msg?.to!=='all'&&!(Array.isArray(msg?.to)&&msg.to.includes(game.user?.id)))return;
  // The page may arrive a moment after the ping; look twice.
  setTimeout(openNewShops,300);setTimeout(openNewShops,1500);}
};

/* ---------- GM view actions (Shops tab rows and editor) and player tab actions ---------- */
/** Returns false when the action isn't one of these. */
export async function handleTrade(app,action,b,{render}){
 if(action==='shop-view'){await openShop(b.dataset.shop);return true;}
 if(action==='shop-present'){gmOnly();const s=await presentDialog(b.dataset.shop);if(s)ui.notifications?.info(`${s.name} is shown to ${s.presented.mode==='all'?'all players':`${s.presented.userIds.length} ${s.presented.userIds.length===1?'player':'players'}`}.`);await render();return true;}
 if(action==='shop-stop'){
  gmOnly();const s=getRecord(b.dataset.shop),svc=s.kind==='service';
  if(!await confirmDialog(svc?`Stop showing ${s.name}? Players can no longer use it. Its settings stay as they are.`:`Stop showing ${s.name}? Players can no longer see it or buy from it. Its items, stock and coins stay as they are.`,{title:svc?'Stop showing this service?':'Stop showing this shop?',yes:'Stop showing'}))return true;
  await stopShowing(s.id);ui.notifications?.info(`${s.name} is no longer shown to players.`);await render();return true;
 }
 return false;
}
/** Wires the GM's Top up shop purse button in the whispered refusal. */
export function bindChatCard(message,html){
 const root=typeof html?.querySelectorAll==='function'?html:html?.[0];
 for(const b of root?.querySelectorAll?.('[data-agu-shop-topup]')??[]){
  if(!isGM()){b.hidden=true;continue;}
  b.addEventListener('click',()=>{purseDialog(b.dataset.aguShopTopup).then(r=>{if(r)ui.notifications?.info(`Merchant's coins: ${coinsText(r.shop.purse)}.`);}).catch(e=>ui.notifications?.error(e?.message??String(e)));});
 }
}
/** The added `api.shops` calls (contract ag-utilities-shops/1). */
export function tradeApi(){
 return {present,stopShowing,presented,open:openShop,forMe:()=>clone(forMe()),browse:()=>clone(browse()),quote:req=>clone(quote(req)),buy,quoteSell:req=>clone(quoteSell(req)),sell};
}
/** Hooks: GM rebuilds the player view on shop, electrum and Locations changes; everyone re-renders on view changes. */
export function tradeHooks(rerender){
 // Shops already open at login don't pop up again; only newly presented ones do.
 if(!isGM()&&shopsVisible())try{for(const v of forMe())announced.add(v.id);}catch{/* not visible yet */}
 const onPage=page=>{
  const store=page?.parent?.flags?.[ID]?.store;
  if(store==='shops-gm')scheduleSync();
  if(store===VIEW_STORE){refreshShopWindows();rerender();if(!isGM())openNewShops();}
 };
 for(const ev of ['createJournalEntryPage','updateJournalEntryPage','deleteJournalEntryPage'])Hooks.on(ev,onPage);
 const onLocations=doc=>{if(doc?.flags?.['ashen-gate-locations']||doc?.parent?.flags?.['ashen-gate-locations'])scheduleSync();};
 for(const ev of ['updateJournalEntry','updateJournalEntryPage'])Hooks.on(ev,onLocations);
 Hooks.on(`${ID}.electrumChanged`,()=>{scheduleSync();refreshShopWindows();});
 Hooks.on('renderChatMessageHTML',bindChatCard);
}
