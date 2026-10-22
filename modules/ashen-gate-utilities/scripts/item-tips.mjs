/* ---- 0.24.0: item tooltips and click-to-open, the way dnd5e shows items (the same approach as the Character Hub,
   written here: nothing is imported from another module). Two kinds of item:
   - a real Item (a character's or the stash's): dnd5e's own "loading" tooltip markup with its UUID, so dnd5e's
     Tooltips5e fills it with the item's richTooltip() and its own rules for what a user may see; a click opens its sheet.
   - item data only (a shop line's snapshot for the GM, the trimmed copy in the player view): registered under a key at
     render time; on first hover a temporary, unsaved Item is built from it and its richTooltip() fills the tooltip;
     a click opens that temporary Item's sheet (read only), or a plain preview when the sheet can't be shown.
   A player's data is only ever the player view's `tip` (core.playerTipItem): no hidden lines, cost or GM notes.
   Without dnd5e's rich tooltips a plain Foundry tooltip (the name) stays. ---- */
import {escapeHTML as E} from './core.mjs';
import {infoDialog} from './ag-dialogs.mjs';

const TIP_CLASS='dnd5e2 dnd5e-tooltip item-tooltip';
/** True when dnd5e's rich tooltips are running (game.dnd5e.tooltips). */
export const richTooltipsAvailable=()=>!!globalThis.game?.dnd5e?.tooltips;
/** dnd5e's loading section for a UUID (its own helper when present, else the same markup). */
function loadingSection(uuid){
 const helper=globalThis.dnd5e?.utils?.loadingTooltip;
 if(typeof helper==='function')try{return helper({uuid});}catch{/* the same markup below */}
 return `<section class="loading" data-uuid="${E(uuid)}"><i class="fa-solid fa-spinner fa-spin-pulse" inert></i></section>`;
}
/** Attributes for a real Item: dnd5e's tooltip and a click that opens its sheet. Without dnd5e tooltips: `title` as a plain tooltip. */
export function uuidTipAttrs(uuid,title=''){
 if(!uuid)return title?` data-tooltip="${E(title)}"`:'';
 const tipAttr=richTooltipsAvailable()?` data-tooltip-html="${E(loadingSection(uuid))}" data-tooltip-class="${TIP_CLASS}" data-tooltip-direction="LEFT"`:title?` data-tooltip="${E(title)}"`:'';
 return `${tipAttr} data-agu-item-uuid="${E(uuid)}"`;
}

/* Item data registered for hover and click, by key (re-rendering the same line overwrites its entry). */
const registry=new Map(),CAP=600;
export const registeredTip=key=>registry.get(key)??null;
/** Attributes for item data only (a shop line). `key` names the line ("<shop>:<line>"); `title` is the plain fallback. */
export function dataTipAttrs(key,data,title=''){
 if(!key||!data)return title?` data-tooltip="${E(title)}"`:'';
 registry.delete(key);registry.set(key,data);
 while(registry.size>CAP)registry.delete(registry.keys().next().value);
 return ` data-agu-item-tip="${E(key)}"${title?` data-tooltip="${E(title)}"`:''}`;
}

const randomKey=()=>globalThis.foundry?.utils?.randomID?.(16)??Math.random().toString(36).slice(2,18).padEnd(16,'0');
/** A temporary, unsaved Item from data (never created in the world), readable by the user who hovers it; null when it can't be built. */
export function temporaryItem(data){
 const Cls=globalThis.CONFIG?.Item?.documentClass;if(typeof Cls!=='function'||!data)return null;
 const observer=globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER??2;
 const {_id,folder,sort,_stats,ownership,flags,effects,...rest}=structuredClone(data);
 try{return new Cls({...rest,_id:randomKey(),ownership:{default:observer}});}catch{return null;}
}
/** dnd5e's tooltip HTML for item data: {content, classes}, or null without dnd5e's richTooltip. */
export async function richTooltipOf(data){
 const item=temporaryItem(data);if(typeof item?.richTooltip!=='function')return null;
 try{const r=await item.richTooltip();const content=typeof r?.content==='string'?r.content:r?.content?.outerHTML;return content?{content,classes:Array.isArray(r.classes)?r.classes:[]}:null;}catch{return null;}
}
const building=new WeakSet();
/** First hover on registered data: fills data-tooltip-html from the temporary Item and shows it if still hovered. */
async function buildTip(el){
 if(building.has(el)||el.dataset.tooltipHtml)return;
 const data=registeredTip(el.dataset.aguItemTip);if(!data)return;
 building.add(el);
 try{
  const r=await richTooltipOf(data);if(!r)return;
  el.dataset.tooltipHtml=r.content;el.dataset.tooltipClass=[...new Set([...TIP_CLASS.split(' '),...r.classes])].join(' ');el.dataset.tooltipDirection??='LEFT';
  delete el.dataset.tooltip;
  if(el.matches?.(':hover'))globalThis.game?.tooltip?.activate?.(el,{html:r.content,cssClass:el.dataset.tooltipClass,direction:el.dataset.tooltipDirection});
 }finally{building.delete(el);}
}
/** A plain preview when no item sheet can be shown: picture, name, type and description as given. */
function previewDialog(data){
 const desc=data?.system?.description?.value??'';
 return infoDialog(data?.name??'Item',`<div class="agu-item-preview">${data?.img?`<img src="${E(data.img)}" alt="">`:''}<div><strong>${E(data?.name??'Item')}</strong>${data?.type?`<p class="ag-field__hint">${E(data.type)}</p>`:''}</div></div>${desc?`<div class="agu-item-preview__desc">${desc}</div>`:''}`);
}
/** Opens the item sheet for registered data (read only, a temporary Item), else the plain preview. */
export async function openDataItem(data){
 const item=temporaryItem(data);
 if(item){
  try{
   // An ApplicationV2 document sheet (dnd5e 5+) takes {document, editable}; anything else opens as the Item's own sheet.
   const Cls=item.sheet?.constructor,V2=globalThis.foundry?.applications?.api?.DocumentSheetV2;
   const sheet=Cls&&(!V2||Cls.prototype instanceof V2)?new Cls({document:item,editable:false}):item.sheet;
   if(sheet?.render){await sheet.render({force:true});return sheet;}
  }
  catch{/* the preview below */}
 }
 await previewDialog(data);return null;
}
/** Opens a real Item's sheet by UUID. */
export async function openUuidItem(uuid){
 const doc=await globalThis.fromUuid?.(uuid);
 if(!doc?.sheet)throw Error('That item could not be opened.');
 await doc.sheet.render(true);return doc.sheet;
}
const fail=e=>globalThis.ui?.notifications?.error?.(e?.message??String(e));
let installed=false;
/** Once per client: hover and click (and Enter/Space on a focused item) for every [data-agu-item-tip] / [data-agu-item-uuid] in any window or dialog. */
export function installItemTips(root=globalThis.document){
 if(installed||!root?.addEventListener)return false;installed=true;
 root.addEventListener('pointerover',ev=>{const el=ev.target?.closest?.('[data-agu-item-tip]');if(el)buildTip(el).catch(()=>{});});
 root.addEventListener('focusin',ev=>{const el=ev.target?.closest?.('[data-agu-item-tip]');if(el)buildTip(el).catch(()=>{});});
 const open=el=>{
  if(el.dataset.aguItemUuid)return openUuidItem(el.dataset.aguItemUuid).catch(fail);
  const data=registeredTip(el.dataset.aguItemTip);if(!data)return fail(Error('That item could not be opened.'));
  globalThis.game?.tooltip?.deactivate?.();return openDataItem(data).catch(fail);
 };
 root.addEventListener('click',ev=>{const el=ev.target?.closest?.('[data-agu-item-open]');if(!el)return;ev.preventDefault();open(el);});
 root.addEventListener('keydown',ev=>{if(ev.key!=='Enter'&&ev.key!==' ')return;const el=ev.target?.closest?.('[data-agu-item-open]');if(!el||el.tagName==='BUTTON')return;ev.preventDefault();open(el);});
 return true;
}
/**
 * The item's name (or picture) as a button: hover shows the item tooltip, click opens it. `uuid` for a real Item,
 * else `key` + `data`. `inner` is the button's HTML (escaped by the caller), `cls` its class.
 */
export function itemButton({uuid=null,key=null,data=null,name='Item',inner=null,cls='agu-item-link'}={}){
 const attrs=uuid?uuidTipAttrs(uuid,`Open ${name}`):dataTipAttrs(key,data,`Open ${name}`);
 return `<button type="button" class="${E(cls)}" data-agu-item-open${attrs} aria-label="${E(`Open ${name}`)}">${inner??E(name)}</button>`;
}
