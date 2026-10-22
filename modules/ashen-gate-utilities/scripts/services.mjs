/* ---- 0.20.0: services (design §3 Service record, §7b, brief 5). A service is stored like a shop (GM Data journal,
   one page each, flags.<id>.service) with no item lines and no shop purse, and is presented like a shop. Each type is
   one entry in SERVICE_REGISTRY: core's pure part (id, label, defaults, checkSettings) plus renderEditor, renderPlayer,
   quote and execute here. A record whose type this version doesn't know is kept untouched, listed for the GM as
   "Unknown service type", and never shown to players. The first type is the Bank: it changes coins at the standard
   rates in one currency update (all or nothing by itself), logged in stash History. The party purse needs no vote
   (D13); the fee is per bank, 0 by default (D14). ---- */
import {ID,escapeHTML as E,COIN_LABELS,coinChoices,readCoins,normalizeService,shopIdFromName,validId,SERVICE_TYPES,SHOP_REFUSALS,
 presentedTo,bankQuote,bankExchangeEntry,bankText,listShops,initials,coinStripHTML,coinChipsHTML,coinChipHTML} from './core.mjs';
import {readAll,readServices,writeService,deleteServicePage,readMeta,writeMeta,queueShops,randomId,locationMap,icon,button,serviceLogOf,appendServiceLog} from './shops.mjs';
import {tradeCtx,playerGate,viewOf,readablePurse,owns,queueBuy,whisper,gmIds,warn,receivers,empty,postTradeCard} from './shop-buy.mjs';

export const SERVICE_TIMEOUT_MS=15000;
/** What a customer is told when the GM is slow; the GM still finishes or refuses it and whispers the real result. */
export const SERVICE_SLOW='The GM did not answer in time. If the exchange still goes through or is refused, you get a whisper with the result.';
export const UNKNOWN_TYPE='Unknown service type';
const NOTHING_CHANGED='No coins changed.';
const isGM=()=>Boolean(game.user?.isGM);
const gmOnly=()=>{if(!isGM())throw Error('GM only.');};
const electrum=()=>game.settings.get(ID,'electrumEnabled')===true;
const clone=v=>structuredClone(v);
const nothingChanged=t=>{const s=String(t??'').trim();return /No coins changed/.test(s)?s:`${s}${/[.!?]$/.test(s)?'':'.'} ${NOTHING_CHANGED}`.trim();};

/* ---------- The Bank ---------- */
/** Whose coins a bank request uses: the user's own character, or the party purse (no vote). Throws the refusal. */
function bankPayer(r,user,{forQuote=false}={}){
 const stash=tradeCtx().stashActor?.();
 if(r.payFrom==='purse'){
  if(forQuote){const p=readablePurse(user);if(!p)throw Error('The party purse is not available.');return p;}
  if(!stash||!readCoins(stash))throw Error('There is no party purse yet.');
  if(!user.isGM&&!tradeCtx().stashEnabled?.())throw Error('The GM has turned the party stash off.');
  return stash;
 }
 const a=game.actors?.get(r.actorId);
 if(!a||a.type!=='character'||a.id===stash?.id||!owns(a,user))throw Error('You can only change the coins of a character you own.');
 return a;
}
const coinOpts=(sel,ep)=>coinChoices(ep).map(c=>`<option value="${c}"${c===sel?' selected':''}>${E(COIN_LABELS[c])} (${c})</option>`).join('');
const bank={
 ...SERVICE_TYPES.bank,
 /** GM settings block in the editor. */
 renderEditor:settings=>`<div class="ag-form-grid"><label class="ag-field">Fee (%)<input type="number" min="0" max="50" step="1" data-svc-setting="feePercent" value="${E(settings?.feePercent??0)}"><span class="ag-field__hint">0 to 50; 0 means no fee. Taken in the coin the customer gives, rounded up, on top of the exchange.</span></label></div>`,
 /** The plan for `request` from `hold` (the chosen coins), or a refusal; nothing is written. */
 quote:(r,{view,hold})=>bankQuote({hold,from:r.from,to:r.to,receive:r.receive,feePercent:view.service?.settings?.feePercent??0,electrum:electrum()}),
 /** The customer's window body: whose coins, from, into, how many, the preview and Confirm exchange. */
 renderPlayer(view,state={}){
  const ep=electrum(),chars=receivers(),actor=chars.find(a=>a.id===state.actorId)??chars[0]??null,purse=readablePurse(),ro=state.readOnly===true;
  if(!actor&&!purse)return `<p class="ag-notice ag-notice--warn">${icon('fa-triangle-exclamation')}<span>You need a character of your own, or the party purse, to change coins here.</span></p>`;
  const b=bankState(state,{actor,purse}),fee=Number(view.service?.settings?.feePercent)||0,dis=ro?' disabled':'';
  const whose=[...(actor?[['actor',actor.name]]:[]),...(purse?[['purse','Party purse']]:[])];
  // 0.24.0: the chosen coins as coin boxes (the same ones as every purse).
  const held=readCoins(b.payFrom==='purse'?purse:actor),strip=held?`<div class="agu-bank__coins">${coinStripHTML(held,ep)}</div>`:'';
  return `<section class="agu-bank" aria-label="Change coins">
  <div class="ag-field"><span id="agu-bank-whose-${E(view.id)}">Whose coins</span><div class="ag-segmented" role="radiogroup" aria-labelledby="agu-bank-whose-${E(view.id)}">${whose.map(([id,label])=>`<button type="button" role="radio" data-bank-whose="${id}" aria-checked="${b.payFrom===id}"${dis}>${E(label)}</button>`).join('')}</div>${purse?'<span class="ag-field__hint">Party purse: no vote needed, nothing leaves the party. Every exchange is listed in stash History.</span>':''}</div>
  ${strip}
  <div class="ag-form-grid">
   <label class="ag-field">Change from<select data-bank="from"${dis}>${coinOpts(b.from,ep)}</select></label>
   <label class="ag-field">Into<select data-bank="to"${dis}>${coinOpts(b.to,ep)}</select></label>
   <label class="ag-field">How many to get<input type="number" min="1" step="1" data-bank="receive" value="${E(b.receive)}"${dis}></label>
  </div>
  <p class="ag-field__hint">${fee?`Fee: ${E(fee)} % of what you give, in that coin, rounded up.`:'No fee.'} 1 pp = 10 gp = 100 sp = 1000 cp.</p>
  <div data-bank-preview aria-live="polite">${ro?'':bankPreviewHTML(view,state)}</div>
  ${ro?'':`<div class="agu-actions">${button('bank-confirm','Confirm exchange',{kind:'primary',ic:'fa-scale-balanced',disabled:!quoteFor(view,state).ok,attrs:`data-shop="${E(view.id)}"`})}</div>`}</section>`;
 },
 /** GM client: fresh coins, the quote again, one currency update with both coins, then stash History and the receipt. */
 async execute(r,{service,user}){
  const payer=bankPayer(r,user),hold=readCoins(payer);if(!hold)throw Error(`${payer.name} has no dnd5e coins.`);
  const q=bankQuote({hold,from:r.from,to:r.to,receive:r.receive,feePercent:service.service.settings.feePercent,electrum:electrum()});
  if(!q.ok)throw Error(q.reason);
  try{await payer.update({[`system.currency.${q.from}`]:q.fromAfter,[`system.currency.${q.to}`]:q.toAfter});}
  catch(e){warn('Could not change the coins')(e);throw Error('The exchange failed.');}
  const entry=bankExchangeEntry({id:randomId(),service,quote:q,payFrom:r.payFrom,payer,user,worldTime:game.time?.worldTime??null,realTime:Date.now()});
  await tradeCtx().logStash?.(entry)?.catch?.(warn('Could not write stash history'));
  // 0.22.0: the bank's own log (GM data, on its page) and the card. Neither can undo or refuse the exchange.
  await queueShops(()=>appendServiceLog(service.id,entry)).catch(warn('Could not write the bank log'));
  postTradeCard(entry,user);
  return bankText(q,r.payFrom==='purse'?'the party purse':payer.name);
 }
};
/** The bank form's current values; whose coins falls back to what is available. */
function bankState(state,{actor,purse}){
 const b=state.bank??{},ep=electrum(),coins=coinChoices(ep);
 const payFrom=b.payFrom==='purse'&&purse?'purse':actor?'actor':'purse';
 return {payFrom,from:coins.includes(b.from)?b.from:'cp',to:coins.includes(b.to)?b.to:'gp',receive:b.receive??''};
}
const bankRequest=(view,state)=>{const chars=receivers(),actor=chars.find(a=>a.id===state.actorId)??chars[0]??null,b=bankState(state,{actor,purse:readablePurse()});
 return {serviceId:view.id,payFrom:b.payFrom,actorId:actor?.id??'',from:b.from,to:b.to,receive:b.receive===''?'':Number(b.receive),rev:view.rev};};
const quoteFor=(view,state)=>{const r=bankRequest(view,state);if(r.receive==='')return {ok:false,empty:true};return quote(r);};
/** The preview: You give, You get, before → after; or the refusal. */
export function bankPreviewHTML(view,state){
 const q=quoteFor(view,state);
 if(q.empty)return '<p class="ag-field__hint">Say how many coins you want to get.</p>';
 if(!q.ok)return `<p class="ag-notice ag-notice--danger" role="alert">${icon('fa-circle-exclamation')}<span>${E(q.reason)}</span></p>`;
 const whose=q.payFrom==='purse'?'Party purse':q.payerName;
 const kv=[['You give',`${coinChipHTML(q.from,q.total)}${q.fee?` ${E(`(${q.give} ${q.from} + ${q.fee} ${q.from} fee)`)}`:''}`],['You get',coinChipHTML(q.to,q.receive)],
  [whose,`${coinChipHTML(q.from,q.fromBefore)} → ${coinChipHTML(q.from,q.fromAfter)}, ${coinChipHTML(q.to,q.toBefore)} → ${coinChipHTML(q.to,q.toAfter)}`]];
 return `<dl class="ag-kv">${kv.map(([k,v])=>`<dt>${E(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

/** The registry: core's pure part plus the views and the GM-client step. A new type is one more entry. */
export const SERVICE_REGISTRY=Object.freeze({bank});
export const serviceType=type=>SERVICE_REGISTRY[type]??null;
export const typeLabel=type=>serviceType(type)?.label??UNKNOWN_TYPE;

/* ---------- Records (GM) ---------- */
/** Stored records with `known` (this version knows the type). Unknown types are read as they are, never rewritten. */
export function servicesAll(){
 return readServices().map(s=>{try{const n=normalizeService(s);return {...s,known:n.known&&Boolean(serviceType(n.service.type))};}catch{return {...s,known:false};}});
}
const strip=({known,...rec})=>rec;
function mustGetService(id){const s=servicesAll().find(x=>x.id===id);if(!s)throw Error('That service no longer exists.');return s;}
const stamp=()=>({updatedAt:Date.now(),updatedBy:game.user?.id??null});
const takenIds=()=>[...readAll().map(s=>s.id),...readServices().map(s=>s.id),...readMeta().lists.map(l=>l.id)];
/** A record to store: checked by its type, `known` left out. Refuses a type this version doesn't know. */
function normSvc(data){
 const type=String(data?.service?.type??'');
 if(!serviceType(type))throw Error(type?`${UNKNOWN_TYPE}: ${type}. Update Utilities to change it.`:'Choose a service type.');
 return strip(normalizeService(data));
}
function list({search='',sort='location'}={}){gmOnly();return listShops(servicesAll().map(s=>({...s,lines:[]})),{search,sort,locations:locationMap()}).flatMap(g=>g.shops).map(({lines,...s})=>clone(s));}
function get(id){gmOnly();const s=servicesAll().find(x=>x.id===id);return s?clone(s):null;}
async function create(data={}){
 gmOnly();
 return queueShops(async()=>{
  const meta=readMeta(),taken=takenIds();
  if(data.id!==undefined&&data.id!==null&&data.id!==''){
   if(!validId(data.id,'SVC'))throw Error('Service id must be SVC- and upper-case letters, digits and single hyphens.');
   if(taken.includes(data.id)||meta.retiredIds.includes(data.id))throw Error(`The service id ${data.id} is already used.`);
  }
  const type=String(data.service?.type||'bank'),t=serviceType(type);
  const id=data.id||shopIdFromName(data.name,taken,'SVC',meta.retiredIds),now=Date.now();
  const record=normSvc({...data,id,kind:'service',service:{type,settings:{...(t?.defaults()??{}),...(data.service?.settings??{})}},presented:null,rev:0,createdAt:now,...stamp()});
  await writeService(record);return clone({...record,known:true});
 });
}
/** Saves an existing service. Live state (who it is shown to) and the creation time come from the stored record. */
async function save(record={}){
 gmOnly();
 return queueShops(async()=>{
  const old=mustGetService(record.id);
  if(!old.known)throw Error(`${UNKNOWN_TYPE}: ${old.service?.type}. Update Utilities to change it.`);
  const t=serviceType(record.service?.type);
  const next=normSvc({...record,id:old.id,kind:'service',service:{type:record.service?.type,settings:{...(t?.defaults()??{}),...(record.service?.settings??{})}},
   presented:old.presented??null,createdAt:old.createdAt,rev:(Number(old.rev)||0)+1,...stamp()});
  await writeService(next);return clone({...next,known:true});
 });
}
async function duplicate(id){
 gmOnly();
 return queueShops(async()=>{
  const old=mustGetService(id);if(!old.known)throw Error(`${UNKNOWN_TYPE}: ${old.service?.type}. Update Utilities to change it.`);
  const meta=readMeta(),name=`${old.name} (copy)`.slice(0,120),now=Date.now();
  const copy=normSvc({...strip(old),id:shopIdFromName(name,takenIds(),'SVC',meta.retiredIds),name,presented:null,rev:0,createdAt:now,...stamp()});
  await writeService(copy);return clone({...copy,known:true});
 });
}
/** Needs {confirm: true}; refused while shown to players. The id is retired, never reused. Unknown types may be deleted. */
async function remove(id,{confirm=false}={}){
 gmOnly();
 if(confirm!==true)throw Error('Deleting a service needs {confirm: true}.');
 return queueShops(async()=>{
  const old=mustGetService(id);
  if(old.presented)throw Error('Stop showing this service to players before you delete it.');
  const meta=readMeta();if(!meta.retiredIds.includes(id))meta.retiredIds.push(id);
  await writeMeta(meta);await deleteServicePage(id);
  return {id,name:old.name};
 });
}
const types=()=>Object.values(SERVICE_REGISTRY).map(t=>({id:t.id,label:t.label,defaults:t.defaults()}));
/** 0.22.0: the service's own log (bank exchanges), oldest first, at most SHOP_LOG_CAP. GM only. */
function log(id){gmOnly();mustGetService(id);return clone(serviceLogOf(id));}

/* ---------- Using a service (player or GM) ---------- */
function cleanReq(r={}){
 return {serviceId:String(r.serviceId??''),payFrom:r.payFrom==='purse'?'purse':'actor',actorId:String(r.actorId??''),from:String(r.from??''),to:String(r.to??''),
  receive:r.receive===''||r.receive===null||r.receive===undefined?r.receive:Number(r.receive),rev:r.rev===undefined?undefined:Number(r.rev)};
}
/**
 * api.shops.services.quote: the plan the customer would confirm, or a refusal; nothing changes. Worked out from this
 * user's view of the service (presented to them; a merchant list never counts), so the GM client may still refuse.
 */
export function quote(req={}){
 playerGate();
 const r=cleanReq(req),view=viewOf(r.serviceId);
 if(!view||view.kind!=='service')return {ok:false,reason:SHOP_REFUSALS.notOpen};
 const t=serviceType(view.service?.type);if(!t)return {ok:false,reason:SHOP_REFUSALS.notOpen};
 let payer;try{payer=bankPayer(r,game.user,{forQuote:true});}catch(e){return {ok:false,reason:e.message};}
 const q=t.quote(r,{view,hold:readCoins(payer)});
 return q.ok?{...q,payFrom:r.payFrom,payerName:payer.name,serviceName:view.name}:q;
}
/** The shared checks on the GM's own record: Player Access, shops on, the service exists, its type is known, shown to this user, unchanged. */
function gate(r,user){
 playerGate(user);
 const service=servicesAll().find(s=>s.id===r.serviceId);
 if(!service||!service.known)throw Error(SHOP_REFUSALS.notOpen);
 // The GM may use any service that is shown to someone.
 if(!(user.isGM?Boolean(service.presented):presentedTo(service,user.id)))throw Error(SHOP_REFUSALS.notOpen);
 if(r.rev!==undefined&&r.rev!==(service.rev??0))throw Error('The service changed. Look again.');
 return {service,type:serviceType(service.service.type)};
}
const handled=new Map(),HANDLED_MS=10*60000;
/**
 * GM client: one service request, in the same queue as purchases (and the purse's, for party purse coins). The same
 * requestId is never carried out twice. If it ends after the customer stopped waiting, they get a whisper.
 */
export async function executeServiceUse(msg,user){
 if(!isGM())throw Error('GM only.');
 const id=String(msg?.requestId??''),started=Date.now();
 for(const [k,t] of handled)if(started-t>HANDLED_MS)handled.delete(k);
 if(id){if(handled.has(id))throw Error('That request was already handled.');handled.set(id,started);}
 const r=cleanReq(msg),limit=Number(msg?.timeoutMs)||SERVICE_TIMEOUT_MS,q=tradeCtx().queuePurse;let ok=false,text='';
 const run=async()=>{const {service,type}=gate(r,user);return type.execute(r,{service,user});};
 try{text=await queueBuy(r.serviceId,()=>r.payFrom==='purse'&&q?q(run):run());ok=true;return text;}
 catch(e){text=nothingChanged(e?.message??String(e));throw Error(text);}
 finally{
  if(!user.isGM&&Date.now()-started>limit-2000){
   const name=readServices().find(s=>s.id===msg?.serviceId)?.name;
   void whisper(`<p>Your request${name?` at ${E(name)}`:''}${ok?' went through':' was not carried out'}: ${E(text)}</p>`,[user.id,...gmIds()]).catch(warn('Could not whisper the customer'));
  }
 }
}
/** api.shops.services.use: the GM carries it out here; a player asks the GM client. Resolves the receipt text. */
export async function use(req={}){
 const r=cleanReq(req);
 if(isGM())return executeServiceUse({...r,requestId:randomId()},game.user);
 playerGate();
 const q=quote(r);if(!q.ok)throw Error(nothingChanged(q.reason));
 return tradeCtx().requestGM('service-use',{...r,timeoutMs:SERVICE_TIMEOUT_MS},SERVICE_TIMEOUT_MS,{timeoutMessage:SERVICE_SLOW});
}

/* ---------- Player window body ---------- */
const portrait=m=>m?.img?`<img class="agu-shop-portrait" src="${E(m.img)}" alt="">`:`<span class="agu-shop-portrait" aria-hidden="true">${E(initials(m?.name))}</span>`;
/** A service as the customer sees it. `state.readOnly`: browsing from a merchant list, so every action is off. */
export function serviceViewHTML(view,state={}){
 const t=serviceType(view.service?.type),ro=state.readOnly===true;
 const meta=[view.merchant?.name,view.location?.name].filter(Boolean).map(E).join(' · ');
 const badge=ro?`<span class="ag-badge">${icon('fa-book-open')} Browsing only</span>`:`<span class="ag-badge ag-badge--ok">${icon('fa-door-open')} Open for you</span>`;
 const head=`<header class="agu-shop-head">${portrait(view.merchant)}<div class="agu-shop-head__text"><h2>${E(view.name)}</h2>${meta?`<p class="agu-note">${meta}</p>`:''}${view.flavour?`<p>${E(view.flavour)}</p>`:''}</div>${badge}</header>`;
 const note=ro?`<p class="ag-notice ag-notice--info">${icon('fa-circle-info')}<span>Ask the GM to open this. You can look, but you can't use it until your GM shows it to you.</span></p>`:'';
 return `<section class="agu-shop-view" aria-label="${E(view.name)}">${head}${note}${t?t.renderPlayer(view,state):empty('Not available','This service is not available.')}</section>`;
}
/** Wires the bank form inside a shop window. `win` holds actorId and bank state; `again` re-renders. */
export function bindServiceView(win,content,view,again){
 if(!view||view.kind!=='service')return;
 win.bank??={};
 for(const b of content.querySelectorAll('[data-bank-whose]'))b.addEventListener('click',()=>{win.bank={...win.bank,payFrom:b.dataset.bankWhose};again();});
 const preview=()=>{const box=content.querySelector('[data-bank-preview]');if(box)box.innerHTML=bankPreviewHTML(view,win);const c=content.querySelector('[data-action="bank-confirm"]');if(c)c.disabled=!quoteFor(view,win).ok;};
 for(const el of content.querySelectorAll('[data-bank]'))el.addEventListener(el.tagName==='SELECT'?'change':'input',()=>{win.bank={...win.bank,[el.dataset.bank]:el.value};preview();});
 const c=content.querySelector('[data-action="bank-confirm"]');
 c?.addEventListener('click',()=>{
  if(c.disabled)return;c.disabled=true;
  use(bankRequest(view,win)).then(msg=>{ui.notifications?.info(msg);win.bank={...win.bank,receive:''};},e=>{const m=e?.message??String(e);ui.notifications?.[m===SERVICE_SLOW?'warn':'error'](m);}).finally(again);
 });
}

/* ---------- GM editor block ---------- */
/** The type select and that type's settings block, for the Shop editor. */
export function serviceSettingsHTML(d){
 const t=serviceType(d.service?.type);
 if(!t)return `<p class="ag-notice ag-notice--warn">${icon('fa-triangle-exclamation')}<span>${E(UNKNOWN_TYPE)}: ${E(d.service?.type||'none')}. This Utilities version keeps it as it is and never shows it to players. Update Utilities to change it, or delete it.</span></p>`;
 return `<section class="ag-section"><div class="ag-section__head"><h3 class="ag-section__title">Service</h3></div>
 <div class="ag-form-grid"><label class="ag-field">Service type<select data-shop-field="serviceType">${Object.values(SERVICE_REGISTRY).map(x=>`<option value="${E(x.id)}"${x.id===t.id?' selected':''}>${E(x.label)}</option>`).join('')}</select><span class="ag-field__hint">Bank: changes coins at the standard rates (1 pp = 10 gp = 100 sp = 1000 cp). It has unlimited coins.</span></label></div>
 ${t.renderEditor(d.service.settings??{})}</section>`;
}

export function servicesApi(){
 return {list,get,create,save,duplicate,delete:remove,types,log,quote:req=>clone(quote(req)),use};
}
