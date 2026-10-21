/* ---- 0.17.0: the GM's Shops tab (design §2–4, brief 2). Shops are GM data: one Journal, "Utilities Shops (GM Data)",
   no player permission, found by flags.ashen-gate-utilities.store = 'shops-gm' and created on the first save. One page
   per shop holds the record (flags.<id>.shop) and its log (flags.<id>.log); one page holds retiredIds and lists.
   Every API call checks GM inside the API. 0.18.0: presenting and buying live in shop-buy.mjs, which uses the storage
   helpers exported here. ---- */
import {ID,escapeHTML as E,COIN_LABELS,CP_VALUE,coinChoices,shownCoins,strandedElectrum,coinsText,normalizeShop,normalizeLine,normalizePurse,
 priceToCp,shopIdFromName,validId,SHOPS_CONTRACT,SHOP_SORTS,SHOP_BUY_TYPES,SHOP_LOG_CAP,listShops,shopPlace,initials,lineFromItem,lineRepeats,
 duplicateShop,restockLines,planShopPurseAdjust,shopLogEntry,MERCHANT_NAME_MAX,SHOP_FLAVOUR_MAX,LINE_FLAVOUR_MAX} from './core.mjs';
import {confirmDialog,formDialog} from './ag-dialogs.mjs';
import {readDrop,resolveItemDrop,bundleOf} from './ag-item-drop.mjs';
import {servicesAll,servicesApi,serviceSettingsHTML,serviceType,typeLabel as serviceTypeLabel,UNKNOWN_TYPE} from './services.mjs';
import {listsView,listsFooter,bindLists,handleLists} from './merchant-lists.mjs';
import {importView,importFooter,bindImport,handleImport} from './shop-import.mjs';

export const STORE='shops-gm',JOURNAL_NAME='Utilities Shops (GM Data)';
const isGM=()=>Boolean(game.user?.isGM);
const gmOnly=()=>{if(!isGM())throw Error('GM only.');};
const electrumEnabled=()=>game.settings.get(ID,'electrumEnabled')===true;
export const randomId=()=>foundry.utils?.randomID?.(16)??Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[b%62]).join('');
const clone=v=>structuredClone(v);

/* ---------- Storage ---------- */
let queue=Promise.resolve();
/** One write at a time, so two changes never read the same record. */
export const queueShops=run=>{const next=queue.then(run);queue=next.catch(()=>{});return next;};
export const shopsJournal=()=>[...(game.journal??[])].find(j=>j?.flags?.[ID]?.store===STORE)??null;
let creating=null;
/** Finds the GM Data journal, or creates it (no player permission). Safe to run again: found by flag, never by name. */
async function ensureJournal(){
 const found=shopsJournal();if(found)return found;
 creating??=Promise.resolve(JournalEntry.create({name:JOURNAL_NAME,ownership:{default:CONST?.DOCUMENT_OWNERSHIP_LEVELS?.NONE??0},flags:{[ID]:{store:STORE}}})).finally(()=>{creating=null;});
 const made=await creating;
 const j=shopsJournal()??made;if(!j)throw Error('Could not create the Utilities Shops journal.');
 return j;
}
const pagesOf=j=>[...(j?.pages??[])];
const shopPage=(id,j=shopsJournal())=>pagesOf(j).find(p=>p?.flags?.[ID]?.shop?.id===id)??null;
const metaPage=(j=shopsJournal())=>pagesOf(j).find(p=>p?.flags?.[ID]?.meta)??null;
export const readAll=()=>pagesOf(shopsJournal()).map(p=>p.flags?.[ID]?.shop).filter(s=>s&&typeof s==='object'&&s.id);
export const readMeta=()=>{const m=metaPage()?.flags?.[ID]?.meta??{};return {retiredIds:Array.isArray(m.retiredIds)?[...m.retiredIds]:[],lists:Array.isArray(m.lists)?clone(m.lists):[]};};
const pageText='<p>Utilities shop data (GM only). Edit it in Utilities → Shops.</p>';
/** Replaces our flags on a page (recursive: false, so coins and keys a record no longer has don't linger). */
async function writeFlags(page,ours,extra={}){
 const flags={...(page._source?.flags??page.flags??{}),[ID]:{...(page.flags?.[ID]??{}),...ours}};
 await page.update({...extra,flags},{recursive:false});
}
export async function writeShop(record,{log=null}={}){
 const j=await ensureJournal(),page=shopPage(record.id,j);
 if(page){await writeFlags(page,{shop:record,...(log?{log}:{})},{name:record.name});return;}
 await j.createEmbeddedDocuments('JournalEntryPage',[{name:record.name,type:'text',text:{content:pageText},flags:{[ID]:{shop:record,log:log??[]}}}]);
}
export async function writeMeta(meta){
 const j=await ensureJournal(),page=metaPage(j);
 if(page){await writeFlags(page,{meta});return;}
 await j.createEmbeddedDocuments('JournalEntryPage',[{name:'Shop lists and retired ids',type:'text',text:{content:pageText},flags:{[ID]:{meta}}}]);
}
/* 0.20.0: a service is stored like a shop (same journal, one page each) under flags.<id>.service. */
const servicePage=(id,j=shopsJournal())=>pagesOf(j).find(p=>p?.flags?.[ID]?.service?.id===id)??null;
export const readServices=()=>pagesOf(shopsJournal()).map(p=>p.flags?.[ID]?.service).filter(s=>s&&typeof s==='object'&&s.id);
export async function writeService(record){
 const j=await ensureJournal(),page=servicePage(record.id,j);
 if(page){await writeFlags(page,{service:record},{name:record.name});return;}
 await j.createEmbeddedDocuments('JournalEntryPage',[{name:record.name,type:'text',text:{content:pageText},flags:{[ID]:{service:record,log:[]}}}]);
}
export const deleteServicePage=id=>servicePage(id)?.delete();
export const logOf=id=>{const l=shopPage(id)?.flags?.[ID]?.log;return Array.isArray(l)?l:[];};
export const appendLog=(id,entry)=>[...logOf(id),entry].slice(-SHOP_LOG_CAP);

/* ---------- Locations (optional partner) ---------- */
export function locationsApi(){const m=game.modules?.get?.('ashen-gate-locations');const a=m?.active?m.api:null;return typeof a?.listLocations==='function'?a:null;}
/** id → {name, parentLocationId}; empty when Locations is not active or refuses. */
export function locationMap(){try{return new Map((locationsApi()?.listLocations()??[]).filter(l=>l?.id).map(l=>[l.id,l]));}catch{return new Map();}}

/* ---------- Drops (shared ag-item-drop helper; the shop editor takes folders) ---------- */
const asDrop=raw=>{
 const x=typeof raw==='string'?{uuid:raw}:raw;
 return x?.uuid&&!x.type?{...x,type:/(^|\.)Folder\./.test(x.uuid)?'Folder':'Item'}:x;
};
async function nameOf(x){let doc=null;try{doc=x?.uuid?await fromUuid(x.uuid):null;}catch{doc=null;}return doc?.name??x?.name??x?.uuid??x?.type??'Unknown';}
/**
 * Items from drop data: an Item (sheet, Items sidebar, compendium), a Folder of Items (sub-folders too), a uuid, or a
 * list of them. Anything else is skipped with the shared reason. A container comes with its contents (from its own
 * pack for a compendium container); an item inside a container that is also dropped comes with that container, not
 * on its own line. Nothing is changed at the source.
 */
export async function itemsFromDrop(input){
 const out=[],skipped=[];
 for(const raw of [].concat(input??[])){
  const x=asDrop(raw),r=await resolveItemDrop(x,{folders:true});
  if(r.ok)out.push(...r.items);else skipped.push({name:await nameOf(x),reason:r.reason});
 }
 const ids=new Set(out.map(i=>i.id));
 const items=[];
 for(const item of out.filter((i,n)=>out.indexOf(i)===n)){
  if(item.system?.container&&ids.has(item.system.container))continue;
  items.push({item,contents:(await bundleOf(item)).slice(1)});
 }
 return {items,skipped};
}
/** New lines for `lines`: each item's own price, unlimited stock; `added` notes a repeat ("Already in this shop"). */
function linesFor(found,lines){
 const next=[...lines],added=[];let sort=Math.max(0,...lines.map(l=>Number(l.sort)||0));
 for(const {item,contents} of found){
  const line=lineFromItem(item.toObject(),contents.map(c=>c.toObject()),{randomId,uuid:item.uuid??null,electrum:electrumEnabled(),sort:sort+=10});
  added.push({lineId:line.lineId,name:item.name,contents:contents.length,repeat:lineRepeats(next,line)});next.push(line);
 }
 return {lines:next,added};
}

/* ---------- API (contract ag-utilities-shops/1). Every call is GM only. ---------- */
export function mustGet(id){const s=readAll().find(x=>x.id===id);if(!s)throw Error('That shop no longer exists.');return s;}
const stamp=()=>({updatedAt:Date.now(),updatedBy:game.user?.id??null});
const withLines=data=>({...data,lines:(Array.isArray(data?.lines)?data.lines:[]).map(l=>normalizeLine(l,{randomId}))});
export const norm=data=>normalizeShop(withLines(data),{electrum:electrumEnabled()});
function list({search='',sort='location'}={}){gmOnly();return listShops(readAll(),{search,sort,locations:locationMap()}).flatMap(g=>g.shops).map(clone);}
function get(id){gmOnly();const s=readAll().find(x=>x.id===id);return s?clone(s):null;}
async function create(data={}){
 gmOnly();
 return queueShops(async()=>{
  const all=readAll(),meta=readMeta(),taken=all.map(s=>s.id);
  if(data.id!==undefined&&data.id!==null&&data.id!==''){
   if(!validId(data.id,'SHOP'))throw Error('Shop id must be SHOP- and upper-case letters, digits and single hyphens.');
   if(taken.includes(data.id)||meta.retiredIds.includes(data.id))throw Error(`The shop id ${data.id} is already used.`);
  }
  const id=data.id||shopIdFromName(data.name,taken,'SHOP',meta.retiredIds),now=Date.now();
  const purse=data.purse??null;
  const record=norm({...data,id,purse,purseStart:data.purseStart===undefined?purse:data.purseStart,presented:null,rev:0,createdAt:now,...stamp()});
  await writeShop(record,{log:[]});
  return clone(record);
 });
}
/** Saves an existing shop. Live state (who it is presented to) and the creation time are kept from the stored record. */
async function save(record={}){
 gmOnly();
 return queueShops(async()=>{
  const old=mustGet(record.id);
  const next=norm({...record,id:old.id,presented:old.presented??null,createdAt:old.createdAt,rev:(Number(old.rev)||0)+1,...stamp()});
  await writeShop(next);return clone(next);
 });
}
async function duplicate(id){
 gmOnly();
 return queueShops(async()=>{
  const all=readAll(),meta=readMeta(),old=all.find(s=>s.id===id);if(!old)throw Error('That shop no longer exists.');
  const copy=norm(duplicateShop(old,{taken:all.map(s=>s.id),retired:meta.retiredIds,userId:game.user?.id??null}));
  await writeShop(copy,{log:[]});return clone(copy);
 });
}
/** Needs {confirm: true}; refused while the shop is shown to players. The id is retired, never reused. */
async function remove(id,{confirm=false}={}){
 gmOnly();
 if(confirm!==true)throw Error('Deleting a shop needs {confirm: true}.');
 return queueShops(async()=>{
  const old=mustGet(id);
  if(old.presented)throw Error('Stop showing this shop to players before you delete it.');
  const meta=readMeta();
  if(!meta.retiredIds.includes(id))meta.retiredIds.push(id);
  await writeMeta(meta);
  await shopPage(id)?.delete();
  return {id,name:old.name};
 });
}
async function addItems(id,input){
 gmOnly();
 const {items,skipped}=await itemsFromDrop(input);
 return queueShops(async()=>{
  const old=mustGet(id),{lines,added}=linesFor(items,old.lines??[]);
  if(added.length){const next=norm({...old,lines,rev:(Number(old.rev)||0)+1,...stamp()});await writeShop(next);}
  return {added,skipped};
 });
}
async function restock(id,lineIds){
 gmOnly();
 return queueShops(async()=>{const old=mustGet(id),next=norm({...old,lines:restockLines(old.lines,lineIds??null),rev:(Number(old.rev)||0)+1,...stamp()});await writeShop(next);return clone(next);});
}
/** op 'add' | 'remove' | 'set' on one coin; never below 0. asStart: the new coins are also what Restock cash goes back to. Logged. */
async function adjustPurse(id,{op,coin,amount,reason='',asStart=false}={}){
 gmOnly();
 return queueShops(async()=>{
  const old=mustGet(id),plan=planShopPurseAdjust({purse:old.purse,op,coin,amount,electrum:electrumEnabled()});
  const next=norm({...old,purse:plan.after,purseStart:asStart?plan.after:old.purseStart,rev:(Number(old.rev)||0)+1,...stamp()});
  const entry=shopLogEntry({id:randomId(),kind:'shop-purse-adjust',shopId:id,before:plan.before,after:plan.after,reason,user:game.user,op,coin,amount:plan.amount,asStart:asStart===true});
  await writeShop(next,{log:appendLog(id,entry)});
  return {shop:clone(next),entry:clone(entry)};
 });
}
/** Gives the shop a purse of `coins` (also its starting cash), or null for none (unlimited cash). Logged. */
async function setPurse(id,coins){
 gmOnly();
 return queueShops(async()=>{
  const old=mustGet(id),purse=normalizePurse(coins,{electrum:electrumEnabled()});
  const next=norm({...old,purse,purseStart:purse?{...purse}:null,rev:(Number(old.rev)||0)+1,...stamp()});
  const entry=shopLogEntry({id:randomId(),kind:'shop-purse-set',shopId:id,before:old.purse??null,after:purse,user:game.user});
  await writeShop(next,{log:appendLog(id,entry)});return clone(next);
 });
}
/** The purse back to its starting cash. Logged. */
async function restockCash(id){
 gmOnly();
 return queueShops(async()=>{
  const old=mustGet(id);if(!old.purse)throw Error('This shop has no coin purse.');
  const start=old.purseStart??Object.fromEntries(Object.keys(old.purse).map(c=>[c,0]));
  const next=norm({...old,purse:{...start},rev:(Number(old.rev)||0)+1,...stamp()});
  const entry=shopLogEntry({id:randomId(),kind:'shop-purse-restock',shopId:id,before:old.purse,after:next.purse,user:game.user});
  await writeShop(next,{log:appendLog(id,entry)});return clone(next);
 });
}
export function shopsApi(){
 return {contract:SHOPS_CONTRACT,sorts:[...SHOP_SORTS],list,get,create,save,duplicate,delete:remove,addItems,restock,adjustPurse,setPurse,restockCash,
  log:id=>{gmOnly();mustGet(id);return clone(logOf(id));}};
}

/* ---------- View (GM only): sub-tabs Shops and Shop editor ---------- */
export const tip=text=>`data-tooltip="${E(text)}" data-tooltip-class="ag-tooltip"`;
export const icon=name=>`<i class="fa-solid ${E(name)}" aria-hidden="true"></i>`;
export const button=(action,label,{kind='',ic='',attrs='',disabled=false}={})=>`<button type="button" class="${['ag-btn',...kind.split(/\s+/).filter(Boolean).map(k=>`ag-btn--${k}`)].join(' ')}" data-action="${E(action)}"${disabled?' disabled':''} ${attrs}>${ic?`${icon(ic)} `:''}${E(label)}</button>`;
const opt=(v,label,sel)=>`<option value="${E(v)}"${String(v)===String(sel)?' selected':''}>${E(label)}</option>`;
export const art=(merchant,cls)=>merchant?.img?`<img class="${cls}" src="${E(merchant.img)}" alt="">`:`<span class="${cls}" aria-hidden="true">${E(initials(merchant?.name))}</span>`;
const SORT_LABELS={location:'Group by city',name:'Name',merchant:'Merchant',updated:'Recently changed'};
const typeLabel=t=>{const l=CONFIG?.Item?.typeLabels?.[t];return l?game.i18n.localize(l):t;};
const cashText=s=>s.purse?coinsText(s.purse):'Unlimited cash';

/** 0.18.0: who a shop is shown to, as a badge; '' when it isn't shown. */
export const shownBadge=s=>!s.presented?'':`<span class="ag-badge ag-badge--ok">${icon('fa-eye')} ${s.presented.mode==='all'?'Shown to all players':`Shown to ${s.presented.userIds.length} ${s.presented.userIds.length===1?'player':'players'}`}</span>`;
/** 0.18.0: Present… or, while shown, Open and Stop showing. */
export const presentButtons=s=>s.kind==='service'&&!s.known?'':s.presented?`${button('shop-view','Open',{kind:'sm',ic:'fa-store',attrs:`data-shop="${E(s.id)}" aria-label="Open ${E(s.name)} as players see it"`})}${button('shop-stop','Stop showing',{kind:'sm',ic:'fa-eye-slash',attrs:`data-shop="${E(s.id)}" aria-label="Stop showing ${E(s.name)}"`})}`
 :button('shop-present','Present…',{kind:'sm',ic:'fa-eye',attrs:`data-shop="${E(s.id)}" aria-label="Present ${E(s.name)}"`});
/** 0.20.0: a service in the list: its type (or "Unknown service type", never shown to players) instead of items and cash. */
function serviceRow(s,locations){
 const {place}=shopPlace(s,locations),meta=[s.merchant?.name,place,serviceTypeLabel(s.service?.type)].filter(Boolean).map(E).join(' · ');
 const unknown=!s.known?`<span class="ag-badge ag-badge--warn">${icon('fa-triangle-exclamation')} ${E(UNKNOWN_TYPE)}</span>`:'';
 return `<li class="ag-row agu-shop-row" data-shop-row="${E(s.id)}">${art(s.merchant,'ag-row__icon agu-shop-avatar')}<div class="ag-row__main"><span class="ag-row__title">${E(s.name)}</span><span class="ag-row__meta">${meta} · <code>${E(s.id)}</code></span></div>
 <div class="ag-row__end">${shownBadge(s)}${unknown}${button('shop-edit','Edit',{kind:'sm',ic:'fa-pen',attrs:`data-shop="${E(s.id)}" aria-label="Edit ${E(s.name)}"`})}${button('shop-duplicate','Duplicate',{kind:'sm',ic:'fa-copy',disabled:!s.known,attrs:`data-shop="${E(s.id)}" aria-label="Duplicate ${E(s.name)}"`})}${presentButtons(s)}</div></li>`;
}
function shopRow(s,locations){
 if(s.kind==='service')return serviceRow(s,locations);
 const {place}=shopPlace(s,locations),lines=s.lines??[],hidden=lines.filter(l=>l.hidden).length;
 const meta=[s.merchant?.name,place,`${lines.length} ${lines.length===1?'item':'items'}`].filter(Boolean).map(E).join(' · ');
 return `<li class="ag-row agu-shop-row" data-shop-row="${E(s.id)}">${art(s.merchant,'ag-row__icon agu-shop-avatar')}<div class="ag-row__main"><span class="ag-row__title">${E(s.name)}</span><span class="ag-row__meta">${meta} · <code>${E(s.id)}</code></span></div>
 <div class="ag-row__end">${shownBadge(s)}${hidden?`<span class="ag-badge">${icon('fa-eye-slash')} ${hidden} hidden</span>`:''}<span class="ag-badge${s.purse?'':' ag-badge--accent'}">${icon('fa-coins')} ${E(cashText(s))}</span>${button('shop-edit','Edit',{kind:'sm',ic:'fa-pen',attrs:`data-shop="${E(s.id)}" aria-label="Edit ${E(s.name)}"`})}${button('shop-duplicate','Duplicate',{kind:'sm',ic:'fa-copy',attrs:`data-shop="${E(s.id)}" aria-label="Duplicate ${E(s.name)}"`})}${presentButtons(s)}</div></li>`;
}
function listView(app){
 if(app.shopImport)return importView(app);
 const all=[...readAll(),...servicesAll()],locations=locationMap(),groups=listShops(all,{search:app.shopSearch,sort:app.shopSort,locations});
 const shown=groups.reduce((n,g)=>n+g.shops.length,0),nShops=all.filter(s=>s.kind!=='service').length,nSvc=all.length-nShops;
 const count=app.shopSearch.trim()?`${shown} of ${all.length}`:[`${nShops} ${nShops===1?'shop':'shops'}`,...(nSvc?[`${nSvc} ${nSvc===1?'service':'services'}`]:[])].join(' · ');
 const toolbar=`<div class="ag-toolbar"><label class="ag-search">${icon('fa-magnifying-glass')}<input type="search" id="agu-shop-search" placeholder="Search shops, merchants, places or items" value="${E(app.shopSearch)}" aria-label="Search shops"></label><div class="ag-toolbar__filters"><select id="agu-shop-sort" aria-label="Sort shops">${SHOP_SORTS.map(s=>opt(s,SORT_LABELS[s],app.shopSort)).join('')}</select></div><span class="ag-toolbar__count">${E(count)}</span><div class="ag-toolbar__end">${button('shop-import','Import JSON',{kind:'sm',ic:'fa-file-import',attrs:tip('Shop, Service and MerchantList records (ag-foundry-import/0.2). You see a preview first.')})}${button('shop-export','Export',{kind:'sm',ic:'fa-file-export',attrs:tip('Every shop, service and merchant list as one JSON file')})}<input type="file" id="agu-shop-import-file" accept=".json,application/json" hidden>${button('shop-new','New shop',{ic:'fa-plus'})}${button('shop-new-service','New service',{ic:'fa-scale-balanced'})}</div></div>`;
 if(!all.length)return toolbar+`<div class="ag-empty">${icon('fa-store')}<p class="ag-empty__title">No shops yet</p><p class="ag-empty__text">Create one with New shop, then drop items into it. New service makes a Bank. Import JSON reads shops from a file.</p>${button('shop-new','New shop',{kind:'sm',ic:'fa-plus'})}</div>`;
 if(!shown)return toolbar+`<div class="ag-empty">${icon('fa-magnifying-glass')}<p class="ag-empty__title">Nothing matches</p><p class="ag-empty__text">No shop or service name, merchant, place, item or id has that text.</p>${button('shop-clear-search','Clear search',{kind:'sm'})}</div>`;
 return toolbar+groups.map(g=>`<section class="agu-shop-group">${g.group?`<h3 class="ag-eyebrow">${E(g.group)} · ${g.shops.length}</h3>`:''}<ul class="ag-rows">${g.shops.map(s=>shopRow(s,locations)).join('')}</ul></section>`).join('');
}

/* Editor draft: the record plus the typed text of each line's price, cost and stock (turned into copper on save). */
const fmt=(cp,coin)=>{const v=cp/CP_VALUE[coin];return String(Number(v.toFixed(3)));};
const shownCoin=c=>c==='ep'&&!electrumEnabled()?'sp':c;
function lineDraft(l){const coin=shownCoin(l.priceCoin);return {...clone(l),_price:fmt(l.priceCp,coin),_coin:coin,_cost:l.costCp===null||l.costCp===undefined?'':fmt(l.costCp,coin),_stock:l.stock===null||l.stock===undefined?'':String(l.stock),_stockEdited:false};}
export function draftFrom(record,{kind='shop'}={}){
 if(kind==='service'||record?.kind==='service'){
  const r=record?clone(record):{id:null,kind:'service',name:'',merchant:{name:'',img:''},locationId:null,flavour:'',gmNotes:'',service:{type:'bank',settings:serviceType('bank').defaults()},known:true};
  return {...r,kind:'service',saved:Boolean(record),service:{type:r.service?.type??'',settings:{...(r.service?.settings??{})}}};
 }
 const r=record?clone(record):{id:null,name:'',merchant:{name:'',img:''},locationId:null,flavour:'',gmNotes:'',purse:null,purseStart:null,showPurse:true,buys:{enabled:false,percent:50,types:[]},lines:[]};
 return {...r,saved:Boolean(record),knownLineIds:(r.lines??[]).map(l=>l.lineId),lines:(r.lines??[]).map(lineDraft),buys:{enabled:r.buys?.enabled===true,percent:r.buys?.percent??50,types:[...(r.buys?.types??[])]}};
}
const lineName=l=>l.item?.name||'Unnamed item';
/** The record a draft saves as. Throws a plain message naming the item when a price, cost or stock can't be kept. */
export function recordFrom(d){
 if(d.kind==='service'){const {saved,known,lines,knownLineIds,...rest}=d;return {...rest,merchant:{name:d.merchant?.name??'',img:d.merchant?.img??''},service:{type:d.service.type,settings:{...d.service.settings}}};}
 const lines=d.lines.map(l=>{
  const {_price,_coin,_cost,_stock,_stockEdited,...line}=l;let priceCp,costCp,stock;
  try{priceCp=priceToCp({value:String(_price).trim()===''?0:_price,denomination:_coin});}catch(e){throw Error(`${lineName(l)}: ${e.message}`);}
  try{costCp=String(_cost).trim()===''?null:priceToCp({value:_cost,denomination:_coin});}catch(e){throw Error(`${lineName(l)} cost: ${e.message}`);}
  const s=String(_stock).trim();stock=s===''?null:Number(s);
  if(stock!==null&&(!Number.isInteger(stock)||stock<0))throw Error(`${lineName(l)}: stock must be a whole number from 0, or blank for unlimited.`);
  return {...line,priceCp,priceCoin:_coin,costCp,stock,stockStart:_stockEdited?stock:line.stockStart===undefined?stock:line.stockStart};
 });
 const percent=Number(d.buys.percent);
 const {saved,knownLineIds,...rest}=d;
 return {...rest,merchant:{name:d.merchant?.name??'',img:d.merchant?.img??''},buys:{enabled:d.buys.enabled===true,percent:Number.isFinite(percent)?percent:d.buys.percent,types:[...d.buys.types]},lines};
}

function purseSection(d,saved){
 const ep=electrumEnabled(),has=Boolean(d.purse),live=Boolean(saved?.purse);
 const strip=has?`<div class="agu-coins">${shownCoins(d.purse,ep).map(c=>`<div class="agu-coin${c==='ep'&&strandedElectrum(d.purse,ep)?' agu-coin--off':''}" role="group" aria-label="${E(COIN_LABELS[c])}: ${E(d.purse[c]??0)}"><span class="agu-coin__label">${E(COIN_LABELS[c])} <abbr ${tip(COIN_LABELS[c])}>${c}</abbr></span><strong class="agu-coin__value">${E(d.purse[c]??0)}</strong></div>`).join('')}</div>`:'';
 const start=has&&d.purseStart?`<p class="ag-field__hint">Starting cash (Restock cash goes back to it): ${E(coinsText(d.purseStart))}</p>`:'';
 const actions=has?`<div class="ag-btn-group">${button('shop-purse-adjust','Add / Remove / Set…',{kind:'sm',ic:'fa-coins',disabled:!live})}${button('shop-purse-restock','Restock cash',{kind:'sm',ic:'fa-rotate-left',disabled:!live})}</div>${live?'':'<p class="ag-field__hint">Save the shop to change its coins.</p>'}`:'';
 return `<section class="ag-section"><div class="ag-section__head"><h3 class="ag-section__title">Merchant's coins</h3></div>
 <label class="ag-field ag-field--inline"><input type="checkbox" role="switch" data-shop-field="hasPurse"${has?' checked':''}> This shop has its own coin purse</label>
 <p class="ag-field__hint">${has?'Buyers\' coins go in and change comes out of it. If it can\'t make change, the buyer pays the exact amount or the sale is refused.':'Off: the merchant always has change and takings are not counted (unlimited cash).'}</p>
 ${strip}${start}${actions}
 ${has?`<label class="ag-field ag-field--inline"><input type="checkbox" role="switch" data-shop-field="showPurse"${d.showPurse!==false?' checked':''}> Show merchant's coins to players</label>`:''}</section>`;
}
function buysSection(d){
 const types=new Set(d.buys.types);
 return `<section class="ag-section"><div class="ag-section__head"><h3 class="ag-section__title">Buys from players</h3></div>
 <label class="ag-field ag-field--inline"><input type="checkbox" role="switch" data-shop-field="buysEnabled"${d.buys.enabled?' checked':''}> This shop buys items from players</label>
 <div class="ag-form-grid"><label class="ag-field">Pays (% of the item's price)<input type="number" min="1" max="100" step="1" data-shop-field="buysPercent" value="${E(d.buys.percent)}"></label></div>
 <div class="ag-field"><span id="agu-shop-buy-types">Item types it buys</span><div class="ag-chip-group" role="group" aria-labelledby="agu-shop-buy-types">${SHOP_BUY_TYPES.map(t=>`<button type="button" class="ag-chip" data-shop-buy-type="${E(t)}" aria-pressed="${types.has(t)}">${E(typeLabel(t))}</button>`).join('')}</div><p class="ag-field__hint">None picked: every type here. Containers are never bought. Players sell from the shop window while the shop is shown to them; an item the shop doesn't stock yet comes in as a hidden line for you to show or remove.</p></div></section>`;
}
function linesTable(d){
 const coins=coinChoices(electrumEnabled());
 if(!d.lines.length)return `<div class="ag-empty">${icon('fa-box-open')}<p class="ag-empty__title">No items yet</p><p class="ag-empty__text">Drop items below from a character sheet, the Items sidebar, a compendium or a folder.</p></div>`;
 const row=l=>{const it=l.item??{},qty=Number(it.system?.quantity)||1,n=lineName(l),contents=(l.contents??[]).length,coinOpts=[...new Set([...coins,l._coin])].map(c=>opt(c,c,l._coin)).join('');
  return `<tr data-line="${E(l.lineId)}"><td><div class="agu-shop-item">${it.img?`<img class="agu-shop-thumb" src="${E(it.img)}" alt="">`:''}<div class="agu-shop-item__text"><strong>${E(n)}</strong>${qty>1?` <span class="ag-badge">Sold as ${E(qty)}</span>`:''}${contents?` <span class="ag-badge">With ${contents} ${contents===1?'item':'items'} inside</span>`:''}${lineRepeats(d.lines,l)?` <span class="ag-badge ag-badge--warn">Already in this shop</span>`:''}${l.soldIn&&l.hidden?` <span class="ag-badge ag-badge--warn">${icon('fa-hand-holding-dollar')} Bought from players</span>`:''}<code>${E(l.itemId??'No permanent id')}</code></div></div></td>
  <td><div class="agu-shop-price"><input type="number" min="0" step="any" data-line-field="_price" value="${E(l._price)}" aria-label="Price of ${E(n)}"><select data-line-field="_coin" aria-label="Price coin of ${E(n)}">${coinOpts}</select></div></td>
  <td><input class="agu-shop-num" type="number" min="0" step="1" data-line-field="_stock" value="${E(l._stock)}" placeholder="∞" aria-label="Stock of ${E(n)} (blank: unlimited)">${l.stock===0&&!l._stockEdited?' <span class="ag-badge ag-badge--danger">Sold out</span>':''}</td>
  <td><input type="text" maxlength="${LINE_FLAVOUR_MAX}" data-line-field="flavour" value="${E(l.flavour??'')}" placeholder="Optional" aria-label="Flavour text for ${E(n)}"></td>
  <td><input class="agu-shop-num" type="number" min="0" step="any" data-line-field="_cost" value="${E(l._cost)}" aria-label="Cost of ${E(n)} (GM only)"></td>
  <td><input type="checkbox" role="switch" data-line-field="hidden"${l.hidden?' checked':''} aria-label="Hide ${E(n)} from players"></td>
  <td class="is-actions">${button('shop-line-remove','',{kind:'icon sm danger',ic:'fa-trash',attrs:`data-line-id="${E(l.lineId)}" aria-label="Remove ${E(n)}" ${tip(`Remove ${n}`)}`})}</td></tr>`;};
 return `<div class="ag-table-wrap"><table class="ag-table agu-shop-lines"><thead><tr><th scope="col">Item</th><th scope="col">Price each</th><th scope="col">Stock</th><th scope="col">Flavour</th><th scope="col">Cost <span class="ag-gm-flag">${icon('fa-eye-slash')} GM</span></th><th scope="col">Hidden</th><th scope="col"><span class="ag-sr-only">Remove</span></th></tr></thead><tbody>${d.lines.map(row).join('')}</tbody></table></div>`;
}
function editorView(app){
 const d=app.shopDraft;
 if(!d)return `<div class="ag-empty">${icon('fa-store')}<p class="ag-empty__title">No shop open</p><p class="ag-empty__text">Pick Edit on a shop in the Shops list, or start a new one.</p>${button('shop-new','New shop',{kind:'sm',ic:'fa-plus'})}</div>`;
 if(d.kind==='service')return serviceEditorView(d);
 const saved=d.id?readAll().find(s=>s.id===d.id)??null:null,loc=locationsApi();
 const locs=loc?[...locationMap().values()].sort((a,b)=>String(a.name).localeCompare(String(b.name))):[];
 const locField=loc?`<label class="ag-field">Linked location<select data-shop-field="locationId"><option value="">None</option>${locs.map(l=>opt(l.id,l.name,d.locationId)).join('')}${d.locationId&&!locs.some(l=>l.id===d.locationId)?opt(d.locationId,d.locationId,d.locationId):''}</select><span class="ag-field__hint">Players see the place only once it is revealed in Locations.</span></label>`:'';
 const restockable=d.lines.some(l=>l.stockStart!==null&&l.stockStart!==undefined);
 return `<div class="agu-shop-editor"><div class="agu-shop-editor__head"><h2>${E(d.saved?d.name||'Unnamed shop':'New shop')}</h2>${d.id?`<code>${E(d.id)}</code>`:''}${saved?`${shownBadge(saved)}<span class="ag-btn-group">${presentButtons(saved)}</span>`:''}</div>
 <div class="ag-form-grid">
  <label class="ag-field">Shop name<input type="text" maxlength="${MERCHANT_NAME_MAX}" data-shop-field="name" value="${E(d.name)}" required><span class="ag-field__hint">Required.</span></label>
  <label class="ag-field">Merchant name<input type="text" maxlength="${MERCHANT_NAME_MAX}" data-shop-field="merchantName" value="${E(d.merchant?.name??'')}"></label>
  <div class="ag-field"><span>Merchant art</span><div class="agu-shop-art">${art(d.merchant,'agu-shop-art__img')}<input type="text" data-shop-field="merchantImg" value="${E(d.merchant?.img??'')}" placeholder="Image path" aria-label="Merchant art path">${button('shop-pick-art','Choose image',{kind:'sm',ic:'fa-image'})}</div><span class="ag-field__hint">Empty: the merchant's initials.</span></div>
  ${locField}
  <label class="ag-field ag-field--wide">Flavour text (players see this)<textarea maxlength="${SHOP_FLAVOUR_MAX}" data-shop-field="flavour" rows="3">${E(d.flavour??'')}</textarea></label>
  <label class="ag-field ag-field--wide"><span>GM notes <span class="ag-gm-flag">${icon('fa-eye-slash')} GM only</span></span><textarea data-shop-field="gmNotes" rows="2">${E(d.gmNotes??'')}</textarea></label>
 </div>
 <section class="ag-section"><div class="ag-section__head"><h3 class="ag-section__title">Items for sale · ${d.lines.length}</h3>${button('shop-restock','Restock',{kind:'sm',ic:'fa-boxes-stacked',disabled:!saved||!restockable,attrs:tip('Stock back to where it started')})}</div>
 ${linesTable(d)}
 <div class="agu-dropzone agu-shop-drop" data-shop-drop>${icon('fa-hand-holding')} Drop items here from a character sheet, the Items sidebar, a compendium or a folder. A container brings what is inside it. The source item is not changed.</div>
 <p class="ag-field__hint">Price starts at the item's own price. Stock blank means unlimited; a number counts down with each sale. Hidden items and cost never reach players.</p></section>
 ${purseSection(d,saved)}${buysSection(d)}
 ${d.saved?`<section class="ag-section agu-danger-zone"><div class="ag-section__head"><h3 class="ag-section__title">Danger zone</h3></div><p class="ag-field__hint">Deleting removes the shop and its items list. Its id is never reused.</p>${button('shop-delete','Delete shop',{kind:'danger',ic:'fa-trash'})}</section>`:''}
 </div>`;
}
/** 0.20.0: the editor for a service: the shared fields, then the type select and that type's settings (no items, no purse). */
function serviceEditorView(d){
 const saved=d.id?servicesAll().find(s=>s.id===d.id)??null:null,loc=locationsApi(),known=Boolean(serviceType(d.service?.type));
 const locs=loc?[...locationMap().values()].sort((a,b)=>String(a.name).localeCompare(String(b.name))):[];
 const locField=loc?`<label class="ag-field">Linked location<select data-shop-field="locationId"><option value="">None</option>${locs.map(l=>opt(l.id,l.name,d.locationId)).join('')}${d.locationId&&!locs.some(l=>l.id===d.locationId)?opt(d.locationId,d.locationId,d.locationId):''}</select><span class="ag-field__hint">Players see the place only once it is revealed in Locations.</span></label>`:'';
 const fields=known?`<div class="ag-form-grid">
  <label class="ag-field">Service name<input type="text" maxlength="${MERCHANT_NAME_MAX}" data-shop-field="name" value="${E(d.name)}" required><span class="ag-field__hint">Required.</span></label>
  <label class="ag-field">Merchant name<input type="text" maxlength="${MERCHANT_NAME_MAX}" data-shop-field="merchantName" value="${E(d.merchant?.name??'')}"></label>
  <div class="ag-field"><span>Merchant art</span><div class="agu-shop-art">${art(d.merchant,'agu-shop-art__img')}<input type="text" data-shop-field="merchantImg" value="${E(d.merchant?.img??'')}" placeholder="Image path" aria-label="Merchant art path">${button('shop-pick-art','Choose image',{kind:'sm',ic:'fa-image'})}</div><span class="ag-field__hint">Empty: the merchant's initials.</span></div>
  ${locField}
  <label class="ag-field ag-field--wide">Flavour text (players see this)<textarea maxlength="${SHOP_FLAVOUR_MAX}" data-shop-field="flavour" rows="3">${E(d.flavour??'')}</textarea></label>
  <label class="ag-field ag-field--wide"><span>GM notes <span class="ag-gm-flag">${icon('fa-eye-slash')} GM only</span></span><textarea data-shop-field="gmNotes" rows="2">${E(d.gmNotes??'')}</textarea></label>
 </div>`:'';
 return `<div class="agu-shop-editor"><div class="agu-shop-editor__head"><h2>${E(d.saved?d.name||'Unnamed service':'New service')}</h2>${d.id?`<code>${E(d.id)}</code>`:''}${saved?`${shownBadge(saved)}<span class="ag-btn-group">${presentButtons(saved)}</span>`:''}</div>
 ${fields}${serviceSettingsHTML(d)}
 ${d.saved?`<section class="ag-section agu-danger-zone"><div class="ag-section__head"><h3 class="ag-section__title">Danger zone</h3></div><p class="ag-field__hint">Deleting removes the service. Its id is never reused. Merchant lists that name it skip it.</p>${button('shop-delete','Delete service',{kind:'danger',ic:'fa-trash'})}</section>`:''}
 </div>`;
}
const SUBS=[['list','Shops'],['editor','Shop editor'],['lists','Merchant lists']];
export function shopsView(app){
 if(!isGM())return '';
 const sub=SUBS.some(([id])=>id===app.shopSub)?app.shopSub:'list';
 const seg=`<div class="ag-segmented agu-shop-subtabs" role="radiogroup" aria-label="Shops sections">${SUBS.map(([id,label])=>`<button type="button" role="radio" data-shop-sub="${id}" aria-checked="${sub===id}">${label}</button>`).join('')}</div>`;
 return `<section class="agu-shops" aria-label="Shops">${seg}${sub==='editor'?editorView(app):sub==='lists'?listsView(app):listView(app)}</section>`;
}
export function shopsFooter(app){
 if(isGM()&&app.shopSub==='lists')return listsFooter(app);
 if(isGM()&&app.shopImport&&(app.shopSub??'list')==='list')return importFooter(app);
 if(!isGM()||app.shopSub!=='editor'||!app.shopDraft)return null;
 if(app.shopDraft.kind==='service'&&!serviceType(app.shopDraft.service?.type))return `<footer class="ag-footer agu-footer">${button('shop-cancel','Cancel',{kind:'ghost'})}<span class="ag-footer__status" role="status">${E(UNKNOWN_TYPE)}: can't be changed here</span>${button('shop-save','Save Changes',{kind:'primary',disabled:true})}</footer>`;
 return `<footer class="ag-footer agu-footer">${button('shop-cancel','Cancel',{kind:'ghost'})}<span class="ag-footer__status" role="status" data-shop-status>${E(app.shopStatus??'')}</span>${button('shop-save','Save Changes',{kind:'primary'})}</footer>`;
}

/* ---------- Wiring ---------- */
const markDirty=(app,root)=>{app.shopDirty=true;app.shopStatus='Unsaved changes';const st=root.querySelector?.('[data-shop-status]');if(st)st.textContent=app.shopStatus;};
export const dragData=event=>readDrop(event);
const report=(added,skipped)=>{
 const repeats=added.filter(a=>a.repeat).map(a=>a.name);
 if(added.length)ui.notifications?.info(`Added ${added.length} ${added.length===1?'item':'items'}: ${added.map(a=>a.name).join(', ')}.`);
 if(repeats.length)ui.notifications?.warn(`Already in this shop: ${repeats.join(', ')}. Added again as a separate line.`);
 if(skipped.length)ui.notifications?.warn(`Not added: ${skipped.map(s=>`${s.name} (${s.reason})`).join(', ')}`);
 if(!added.length&&!skipped.length)ui.notifications?.warn('Nothing to add.');
};
/** Adds dropped items to the open draft (saved with Save Changes, discarded with Cancel). */
export async function dropIntoDraft(app,data){
 gmOnly();if(!app.shopDraft)return {added:[],skipped:[]};
 const {items,skipped}=await itemsFromDrop(data);
 const {lines,added}=linesFor(items,app.shopDraft.lines);
 app.shopDraft.lines=[...app.shopDraft.lines,...lines.slice(app.shopDraft.lines.length).map(lineDraft)];
 if(added.length)app.shopDirty=true,app.shopStatus='Unsaved changes';
 report(added,skipped);return {added,skipped};
}
export function bindShops(app,root,{error,render}){
 if(app.tab!=='shops'||!isGM())return;
 bindLists(app,root,{error,render});
 bindImport(app,root,{error,render});
 for(const b of root.querySelectorAll('[data-shop-sub]'))b.addEventListener('click',()=>{app.shopSub=b.dataset.shopSub;render();});
 root.querySelector('#agu-shop-search')?.addEventListener('input',e=>{app.shopSearch=e.target.value;const at=e.target.selectionStart;Promise.resolve(render()).then(()=>{const q=app.element?.querySelector?.('#agu-shop-search');if(q){q.focus();q.setSelectionRange?.(at,at);}}).catch(error);});
 root.querySelector('#agu-shop-sort')?.addEventListener('change',e=>{app.shopSort=e.target.value;render();});
 const d=app.shopDraft;if(!d)return;
 for(const el of root.querySelectorAll('[data-shop-field]'))el.addEventListener(el.type==='checkbox'||el.tagName==='SELECT'?'change':'input',()=>{
  const f=el.dataset.shopField,v=el.type==='checkbox'?el.checked:el.value;
  if(f==='merchantName')d.merchant={...d.merchant,name:v};else if(f==='merchantImg')d.merchant={...d.merchant,img:v};
  else if(f==='locationId')d.locationId=v||null;else if(f==='buysEnabled')d.buys.enabled=v;else if(f==='buysPercent')d.buys.percent=v;
  else if(f==='serviceType'){const t=serviceType(v);d.service={type:v,settings:t?t.defaults():{}};markDirty(app,root);render();return;}
  else if(f==='hasPurse'){d.purse=v?(d.purse??Object.fromEntries(coinChoices(electrumEnabled()).map(c=>[c,0]))):null;d.purseStart=v?(d.purseStart??{...d.purse}):null;markDirty(app,root);render();return;}
  else d[f]=v;
  markDirty(app,root);
 });
 for(const el of root.querySelectorAll('[data-svc-setting]'))el.addEventListener(el.tagName==='SELECT'||el.type==='checkbox'?'change':'input',()=>{d.service.settings={...d.service.settings,[el.dataset.svcSetting]:el.type==='checkbox'?el.checked:el.value};markDirty(app,root);});
 for(const b of root.querySelectorAll('[data-shop-buy-type]'))b.addEventListener('click',()=>{const t=b.dataset.shopBuyType,on=d.buys.types.includes(t);d.buys.types=on?d.buys.types.filter(x=>x!==t):[...d.buys.types,t];b.setAttribute('aria-pressed',String(!on));markDirty(app,root);});
 for(const el of root.querySelectorAll('[data-line-field]'))el.addEventListener(el.type==='checkbox'||el.tagName==='SELECT'?'change':'input',()=>{
  const line=d.lines.find(l=>l.lineId===el.closest?.('[data-line]')?.dataset.line);if(!line)return;
  const f=el.dataset.lineField;line[f]=el.type==='checkbox'?el.checked:el.value;if(f==='_stock')line._stockEdited=true;
  markDirty(app,root);
 });
 const zone=root.querySelector('[data-shop-drop]');
 if(zone){
  zone.addEventListener('dragover',ev=>{ev.preventDefault();zone.classList.add('agu-drop-over');});
  zone.addEventListener('dragleave',ev=>{if(!zone.contains(ev.relatedTarget))zone.classList.remove('agu-drop-over');});
  zone.addEventListener('drop',ev=>{ev.preventDefault();ev.stopPropagation();zone.classList.remove('agu-drop-over');dropIntoDraft(app,dragData(ev)).then(r=>{if(r.added.length)return render();}).catch(error);});
 }
}
/** Shop purse change from the editor: form, then a labelled confirmation with before → after. */
export async function purseDialog(id){
 const s=mustGet(id),ep=electrumEnabled();if(!s.purse)throw Error('This shop has no coin purse.');
 const form=await formDialog('Change the merchant\'s coins',[
  {name:'coin',label:'Coin',type:'select',value:'gp',options:coinChoices(ep).map(c=>({value:c,label:`${COIN_LABELS[c]} (${c}): ${s.purse[c]??0}`}))},
  {name:'op',label:'Change',type:'select',value:'add',options:[{value:'add',label:'Add'},{value:'remove',label:'Remove'},{value:'set',label:'Set to'}]},
  {name:'amount',label:'Amount',type:'number',value:''},
  {name:'reason',label:'Reason (optional)',type:'text',value:''},
  {name:'asStart',label:'Also make this the starting cash (what Restock cash goes back to)',type:'checkbox',value:'1'}
 ],{ok:'Review Change'});
 if(!form)return null;
 const op=['add','remove','set'].includes(form.op)?form.op:'add',coin=coinChoices(ep).includes(form.coin)?form.coin:'gp',asStart=[].concat(form.asStart??[]).length>0;
 const plan=planShopPurseAdjust({purse:s.purse,op,coin,amount:form.amount,electrum:ep});
 if(!await confirmDialog(`${s.name}: ${COIN_LABELS[coin]} ${plan.before[coin]??0} → ${plan.after[coin]} ${coin}.\nCoins after: ${coinsText(plan.after)}.${asStart?'\nThis also becomes the starting cash.':''}${form.reason?.trim()?`\nReason: ${form.reason.trim()}`:''}`,{title:'Change the merchant\'s coins?',yes:`Set ${coin} to ${plan.after[coin]}`}))return null;
 return adjustPurse(id,{op,coin,amount:form.amount,reason:form.reason??'',asStart});
}
function openArtPicker(app,render){
 const FP=foundry.applications?.apps?.FilePicker?.implementation??globalThis.FilePicker;
 if(!FP)throw Error('The Foundry file picker is not available here. Type the image path instead.');
 new FP({type:'image',current:app.shopDraft?.merchant?.img??'',callback:path=>{if(!app.shopDraft)return;app.shopDraft.merchant={...app.shopDraft.merchant,img:path};app.shopDirty=true;app.shopStatus='Unsaved changes';render();}}).render(true);
}
const discardOk=async app=>!app.shopDirty||confirmDialog('Your changes to this shop are not saved. Discard them?',{title:'Discard unsaved changes?',yes:'Discard changes',no:'Keep editing',danger:true});
const openDraft=(app,record,opts)=>{app.shopDraft=draftFrom(record,opts);app.shopDirty=false;app.shopStatus='';app.shopSub='editor';};
/** Shops tab actions. Returns false when the action isn't a Shops one. */
export async function handleShops(app,action,b,{render,root}){
 if(await handleLists(app,action,b,{render,root}))return true;
 if(action.startsWith('shop-import')||action==='shop-export'){gmOnly();if(await handleImport(app,action,{render,root}))return true;}
 if(!action.startsWith('shop-'))return false;
 gmOnly();
 const d=app.shopDraft,svc=()=>servicesApi(),isSvc=id=>String(id??'').startsWith('SVC-');
 switch(action){
  case 'shop-new':if(!await discardOk(app))return true;openDraft(app,null);break;
  case 'shop-new-service':if(!await discardOk(app))return true;openDraft(app,null,{kind:'service'});break;
  case 'shop-clear-search':app.shopSearch='';break;
  case 'shop-edit':{if(d?.id!==b.dataset.shop&&!await discardOk(app))return true;const s=isSvc(b.dataset.shop)?svc().get(b.dataset.shop):get(b.dataset.shop);if(!s)throw Error(isSvc(b.dataset.shop)?'That service no longer exists.':'That shop no longer exists.');if(d?.id!==s.id)openDraft(app,s);else app.shopSub='editor';break;}
  case 'shop-duplicate':{const copy=isSvc(b.dataset.shop)?await svc().duplicate(b.dataset.shop):await duplicate(b.dataset.shop);ui.notifications?.info(`Made ${copy.name}.`);break;}
  case 'shop-pick-art':openArtPicker(app,render);return true;
  case 'shop-line-remove':{
   const line=d?.lines.find(l=>l.lineId===b.dataset.lineId);if(!line)return true;
   if(!await confirmDialog(`Remove ${lineName(line)} from this shop? It leaves the shop when you save.`,{title:'Remove this item?',yes:'Remove item',danger:true}))return true;
   d.lines=d.lines.filter(l=>l!==line);app.shopDirty=true;app.shopStatus='Unsaved changes';break;
  }
  case 'shop-restock':{
   if(!d?.id)return true;
   if(!await confirmDialog('Put every item\'s stock back to where it started? Unlimited items stay unlimited. Unsaved stock edits are replaced.',{title:'Restock this shop?',yes:'Restock items'}))return true;
   const s=await restock(d.id);for(const l of d.lines){const fresh=s.lines.find(x=>x.lineId===l.lineId);if(fresh){l.stock=fresh.stock;l.stockStart=fresh.stockStart;l._stock=fresh.stock===null?'':String(fresh.stock);l._stockEdited=false;}}
   ui.notifications?.info('Stock is back to where it started.');break;
  }
  case 'shop-purse-adjust':{if(!d?.id)return true;const r=await purseDialog(d.id);if(!r)return true;d.purse=clone(r.shop.purse);d.purseStart=clone(r.shop.purseStart);ui.notifications?.info(`Merchant's coins: ${coinsText(r.shop.purse)}.`);break;}
  case 'shop-purse-restock':{
   if(!d?.id)return true;const s=mustGet(d.id);
   if(!await confirmDialog(`Put the merchant's coins back to the starting cash?\n${coinsText(s.purse)} → ${coinsText(s.purseStart)}.`,{title:'Restock cash?',yes:'Restock cash'}))return true;
   const r=await restockCash(d.id);d.purse=clone(r.purse);d.purseStart=clone(r.purseStart);ui.notifications?.info(`Merchant's coins: ${coinsText(r.purse)}.`);break;
  }
  case 'shop-cancel':{if(!await discardOk(app))return true;app.shopDraft=null;app.shopDirty=false;app.shopStatus='';app.shopSub='list';break;}
  case 'shop-save':{
   if(!d)return true;
   const rec=recordFrom(d);
   if(d.kind==='service'){const saved=d.id?await svc().save(rec):await svc().create(rec);openDraft(app,saved);app.shopStatus='Saved';ui.notifications?.info(`Saved ${saved.name}.`);break;}
   const old=d.id?readAll().find(s=>s.id===d.id):null;
   if(old?.purse&&!rec.purse&&Object.values(old.purse).some(n=>n>0)&&!await confirmDialog(`Remove ${old.name}'s coin purse? It holds ${coinsText(old.purse)}; those coins are not kept. The shop then has unlimited cash.`,{title:'Remove the merchant\'s coins?',yes:'Remove purse and save',danger:true}))return true;
   const saved=d.id?await save(rec):await create(rec);
   openDraft(app,saved);app.shopStatus='Saved';ui.notifications?.info(`Saved ${saved.name}.`);break;
  }
  case 'shop-delete':{
   if(!d?.id)return true;
   if(d.kind==='service'){
    if(!await confirmDialog(`Delete ${d.name}? The service is removed and this can't be undone. Coins already changed are not affected.`,{title:'Delete this service?',yes:'Delete service',danger:true}))return true;
    await svc().delete(d.id,{confirm:true});ui.notifications?.info(`Deleted ${d.name}.`);app.shopDraft=null;app.shopDirty=false;app.shopStatus='';app.shopSub='list';break;
   }
   if(!await confirmDialog(`Delete ${d.name}? Its items list, prices and coins are removed and this can't be undone. Items already bought are not affected.`,{title:'Delete this shop?',yes:'Delete shop',danger:true}))return true;
   await remove(d.id,{confirm:true});ui.notifications?.info(`Deleted ${d.name}.`);app.shopDraft=null;app.shopDirty=false;app.shopStatus='';app.shopSub='list';break;
  }
  default:return false;
 }
 await render();return true;
}
/**
 * 0.19.0: an open editor follows sales and purchases on its shop, so Save Changes never drops an item a player just
 * sold or puts back stock that was bought: new lines come in, untouched stock and the merchant's coins follow the record.
 * Lines the GM removed in the draft stay removed.
 */
export function followRecord(d,stored){
 if(!d?.id||d.kind==='service'||!stored||stored.id!==d.id)return false;
 const known=new Set([...(d.knownLineIds??[]),...d.lines.map(l=>l.lineId)]),fresh=(stored.lines??[]).filter(l=>!known.has(l.lineId));let changed=false;
 if(fresh.length){d.lines=[...d.lines,...fresh.map(lineDraft)];d.knownLineIds=[...known,...fresh.map(l=>l.lineId)];changed=true;}
 for(const l of d.lines){const s=(stored.lines??[]).find(x=>x.lineId===l.lineId);if(s&&!l._stockEdited&&l.stock!==s.stock){l.stock=s.stock;l._stock=s.stock===null||s.stock===undefined?'':String(s.stock);changed=true;}}
 if(d.purse&&stored.purse&&JSON.stringify(d.purse)!==JSON.stringify(stored.purse)){d.purse=clone(stored.purse);changed=true;}
 return changed;
}
/** The GM's window follows saved shops, electrum and Locations changes. */
export function shopHooks(rerender,app=()=>null){
 const onPage=page=>{if(page?.parent?.flags?.[ID]?.store!==STORE)return;const d=app()?.shopDraft,stored=page.flags?.[ID]?.shop;if(d&&stored)followRecord(d,stored);rerender();};
 for(const ev of ['createJournalEntryPage','updateJournalEntryPage','deleteJournalEntryPage'])Hooks.on(ev,onPage);
 Hooks.on(`${ID}.electrumChanged`,()=>rerender());
}
