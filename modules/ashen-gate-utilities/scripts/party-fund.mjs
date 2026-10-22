/* ---- 0.24.0: Party Fund (Party Inventory → Party Fund). Replaces the Bank service for everyday use: deposit and take
   coins between a character and the party purse (main.mjs, unchanged rules and vote), a log of the purse's coins, and
   Change coins: a character's or the party purse's coins at the standard rates (1 pp = 10 gp = 100 sp = 1000 cp), the
   same rules as the Bank (whole coins only, ep only while Use electrum is on), with no fee unless the GM sets one in GM
   Setup. Same gate as the stash: Player Access and the stash on for players. The GM client makes the one currency
   update, writes stash History (`coin-exchange`) and whispers the card to the player and the GM. ---- */
import {ID,escapeHTML as E,COIN_LABELS,coinChoices,readCoins,bankQuote,bankText,coinExchangeEntry} from './core.mjs';
import {tradeCtx,receivers,readablePurse,whisper,gmIds,warn,postTradeCard} from './shop-buy.mjs';
import {bankPayer} from './services.mjs';
import {icon,button,randomId} from './shops.mjs';

export const FUND_TIMEOUT_MS=15000;
export const FUND_FEE_MAX=50;
export const FUND_SLOW='The GM did not answer in time. If the exchange still goes through or is refused, you get a whisper with the result.';
const NOTHING_CHANGED='No coins changed.';
const isGM=()=>Boolean(game.user?.isGM);
const electrum=()=>game.settings.get(ID,'electrumEnabled')===true;
const nothingChanged=t=>{const s=String(t??'').trim();return /No coins changed/.test(s)?s:`${s}${/[.!?]$/.test(s)?'':'.'} ${NOTHING_CHANGED}`.trim();};
/** GM Setup → Party Fund → exchange fee: a whole percent 0–50, 0 (no fee) by default. */
export function fundFee(){const n=Number(game.settings.get(ID,'exchangeFeePercent'));return Number.isInteger(n)&&n>=0&&n<=FUND_FEE_MAX?n:0;}
/** The stash's own gate: the GM always passes; a player needs Player Access and the stash on for players. */
export function fundGate(user=game.user){
 if(user?.isGM)return;
 if(game.settings.get(ID,'playerAccessEnabled')!==true)throw Error('Utilities is hidden for players.');
 if(!tradeCtx().stashEnabled?.())throw Error('The GM has turned the party stash off.');
}
function cleanReq(r={}){
 return {payFrom:r.payFrom==='purse'?'purse':'actor',actorId:String(r.actorId??''),from:String(r.from??''),to:String(r.to??''),
  receive:r.receive===''||r.receive===null||r.receive===undefined?r.receive:Number(r.receive)};
}
/** api.purse.quoteExchange: the plan the customer would confirm, or a refusal; nothing changes. The GM client checks again. */
export function quoteExchange(req={}){
 fundGate();
 const r=cleanReq(req);let payer;
 try{payer=bankPayer(r,game.user,{forQuote:true});}catch(e){return {ok:false,reason:e.message};}
 const q=bankQuote({hold:readCoins(payer),from:r.from,to:r.to,receive:r.receive,feePercent:fundFee(),electrum:electrum()});
 return q.ok?{...q,payFrom:r.payFrom,payerName:payer.name}:q;
}
const handled=new Map(),HANDLED_MS=10*60000;
/**
 * GM client: one exchange, in the purse's queue. Fresh coins and the quote again, one currency update with both coins,
 * then stash History and the card (neither can undo or refuse it). The same requestId is never carried out twice.
 */
export async function executeExchange(msg,user){
 if(!isGM())throw Error('GM only.');
 const id=String(msg?.requestId??''),started=Date.now();
 for(const [k,t] of handled)if(started-t>HANDLED_MS)handled.delete(k);
 if(id){if(handled.has(id))throw Error('That request was already handled.');handled.set(id,started);}
 const r=cleanReq(msg),limit=Number(msg?.timeoutMs)||FUND_TIMEOUT_MS,q=tradeCtx().queuePurse??(run=>run());let ok=false,text='';
 const run=async()=>{
  fundGate(user);
  const payer=bankPayer(r,user),hold=readCoins(payer);if(!hold)throw Error(`${payer.name} has no dnd5e coins.`);
  const plan=bankQuote({hold,from:r.from,to:r.to,receive:r.receive,feePercent:fundFee(),electrum:electrum()});
  if(!plan.ok)throw Error(plan.reason);
  try{await payer.update({[`system.currency.${plan.from}`]:plan.fromAfter,[`system.currency.${plan.to}`]:plan.toAfter});}
  catch(e){warn('Could not change the coins')(e);throw Error('The exchange failed.');}
  const entry=coinExchangeEntry({id:randomId(),quote:plan,payFrom:r.payFrom,payer,user,worldTime:game.time?.worldTime??null,realTime:Date.now()});
  await tradeCtx().logStash?.(entry)?.catch?.(warn('Could not write stash history'));
  postTradeCard(entry,user);
  return bankText(plan,r.payFrom==='purse'?'the party purse':payer.name);
 };
 try{text=await q(run);ok=true;return text;}
 catch(e){text=nothingChanged(e?.message??String(e));throw Error(text);}
 finally{
  if(!user.isGM&&Date.now()-started>limit-2000)void whisper(`<p>Your coin exchange${ok?' went through':' was not carried out'}: ${E(text)}</p>`,[user.id,...gmIds()]).catch(warn('Could not whisper the player'));
 }
}
/** api.purse.exchange: the GM carries it out here; a player asks the GM client. Resolves the receipt text. */
export async function exchange(req={}){
 const r=cleanReq(req);
 if(isGM())return executeExchange({...r,requestId:randomId()},game.user);
 fundGate();
 const q=quoteExchange(r);if(!q.ok)throw Error(nothingChanged(q.reason));
 return tradeCtx().requestGM('fund-exchange',{...r,timeoutMs:FUND_TIMEOUT_MS},FUND_TIMEOUT_MS,{timeoutMessage:FUND_SLOW});
}

/* ---------- Change coins form (Party Fund tab) ---------- */
/** The form's values; whose coins falls back to what is available. `app.fund` holds what the user picked. */
export function fundState(app={}){
 const f=app.fund??{},chars=receivers(),purse=readablePurse(),coins=coinChoices(electrum());
 const actor=chars.find(a=>a.id===f.actorId)??chars[0]??null;
 const payFrom=f.payFrom==='purse'&&purse?'purse':actor?'actor':purse?'purse':'actor';
 return {payFrom,actorId:actor?.id??'',from:coins.includes(f.from)?f.from:'cp',to:coins.includes(f.to)?f.to:'gp',receive:f.receive??'',chars,purse};
}
export const fundRequest=app=>{const s=fundState(app);return {payFrom:s.payFrom,actorId:s.actorId,from:s.from,to:s.to,receive:s.receive===''?'':Number(s.receive)};};
const quoteFor=app=>{const r=fundRequest(app);if(r.receive==='')return {ok:false,empty:true};return quoteExchange(r);};
/** You give, You get, before → after; or the refusal. */
export function fundPreviewHTML(app){
 let q;try{q=quoteFor(app);}catch(e){q={ok:false,reason:e.message};}
 if(q.empty)return '<p class="ag-field__hint">Say how many coins you want to get.</p>';
 if(!q.ok)return `<p class="ag-notice ag-notice--danger" role="alert">${icon('fa-circle-exclamation')}<span>${E(q.reason)}</span></p>`;
 const whose=q.payFrom==='purse'?'Party purse':q.payerName;
 const kv=[['You give',`${q.total} ${q.from}${q.fee?` (${q.give} ${q.from} + ${q.fee} ${q.from} fee)`:''}`],['You get',`${q.receive} ${q.to}`],
  [whose,`${COIN_LABELS[q.from]} ${q.fromBefore} → ${q.fromAfter}, ${COIN_LABELS[q.to].toLowerCase()} ${q.toBefore} → ${q.toAfter}`]];
 return `<dl class="ag-kv">${kv.map(([k,v])=>`<dt>${E(k)}</dt><dd>${E(v)}</dd>`).join('')}</dl>`;
}
export const fundCanConfirm=app=>{try{return quoteFor(app).ok===true;}catch{return false;}};
/** The Change coins section. */
export function exchangeHTML(app){
 const s=fundState(app),ep=electrum(),fee=fundFee();
 if(!s.chars.length&&!s.purse)return `<section class="agu-fund-exchange" aria-label="Change coins"><h3>Change coins</h3><p class="ag-notice ag-notice--warn">${icon('fa-triangle-exclamation')}<span>You need a character of your own, or the party purse, to change coins.</span></p></section>`;
 const opt=(v,label,sel)=>`<option value="${E(v)}"${v===sel?' selected':''}>${E(label)}</option>`;
 const whoseSel=s.payFrom==='purse'?'purse':`actor:${s.actorId}`;
 const whose=[...s.chars.map(a=>opt(`actor:${a.id}`,`${a.name}'s coins`,whoseSel)),...(s.purse?[opt('purse','Party purse',whoseSel)]:[])].join('');
 const coinOpts=sel=>coinChoices(ep).map(c=>opt(c,`${COIN_LABELS[c]} (${c})`,sel)).join('');
 return `<section class="agu-fund-exchange" aria-label="Change coins"><h3>Change coins</h3>
 <div class="ag-form-grid">
  <label class="ag-field">Whose coins<select id="agu-fund-whose" data-fund="whose">${whose}</select></label>
  <label class="ag-field">Change from<select id="agu-fund-from" data-fund="from">${coinOpts(s.from)}</select></label>
  <label class="ag-field">Into<select id="agu-fund-to" data-fund="to">${coinOpts(s.to)}</select></label>
  <label class="ag-field">How many to get<input type="number" id="agu-fund-receive" data-fund="receive" min="1" step="1" inputmode="numeric" value="${E(s.receive)}"></label>
 </div>
 <p class="ag-field__hint">${fee?`Fee: ${E(fee)} % of what you give, in that coin, rounded up.`:'No fee.'} 1 pp = 10 gp = 100 sp = 1000 cp. Party purse: no vote needed, nothing leaves the party. Every exchange is in the log below.</p>
 <div data-fund-preview aria-live="polite">${fundPreviewHTML(app)}</div>
 <div class="agu-actions">${button('fund-exchange','Confirm exchange',{kind:'primary',ic:'fa-scale-balanced',disabled:!fundCanConfirm(app)})}</div></section>`;
}
/** Wires the Change coins inputs: the preview and Confirm update in place (no re-render while typing). */
export function bindExchange(app,root){
 const update=()=>{const box=root.querySelector?.('[data-fund-preview]');if(box)box.innerHTML=fundPreviewHTML(app);const c=root.querySelector?.('[data-action="fund-exchange"]');if(c)c.disabled=!fundCanConfirm(app);};
 for(const el of root.querySelectorAll?.('[data-fund]')??[])el.addEventListener(el.tagName==='SELECT'?'change':'input',()=>{
  const k=el.dataset.fund,v=el.value;
  app.fund={...(app.fund??{}),...(k==='whose'?(v==='purse'?{payFrom:'purse'}:{payFrom:'actor',actorId:v.replace(/^actor:/,'')}):{[k]:v})};
  update();
 });
}
