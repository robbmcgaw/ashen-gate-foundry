/* ---- 0.26.0: Utilities' own small UI parts, built on the shared kit classes (ag-ui.css): one button helper, one empty
   state, kit record rows, and focus kept on the same control across a re-render. Every view in the module uses these. ---- */
import {escapeHTML as E} from './core.mjs';

export const tip=text=>`data-tooltip="${E(text)}" data-tooltip-class="ag-tooltip"`;
export const icon=name=>`<i class="fa-solid ${E(name)}" aria-hidden="true"></i>`;
/** Kit button kinds: primary, danger, ghost, sm, icon (space-separated to combine, e.g. 'ghost sm'). */
const KINDS=new Set(['primary','danger','ghost','sm','icon']);
/** One button helper for the whole module. `ic` (or `icon`) is a Font Awesome solid icon name; `cls` adds a class. */
export const button=(action,label,{kind='',ic='',icon:ic2='',cls='',attrs='',disabled=false}={})=>{
 const classes=['ag-btn',...String(kind).split(/\s+/).filter(k=>KINDS.has(k)).map(k=>`ag-btn--${k}`),...(cls?[cls]:[])].join(' '),i=ic||ic2;
 return `<button type="button" class="${E(classes)}" data-action="${E(action)}"${disabled?' disabled':''} ${attrs}>${i?`${icon(i)} `:''}${E(label)}</button>`;
};
/** One empty state: an optional icon, a title, the next step, and at most one low-emphasis action (HTML). */
export const emptyState=(title,text='',{icon:ic='',action=''}={})=>`<div class="ag-empty">${ic?icon(ic):''}<p class="ag-empty__title">${E(title)}</p>${text?`<p class="ag-empty__text">${E(text)}</p>`:''}${action}</div>`;
/** A kit record row. title and meta are HTML the caller has escaped; end holds the row's badges and actions. */
export const rowHTML=({title,meta='',end='',lead='',cls='',attrs=''})=>`<li class="ag-row${cls?` ${cls}`:''}"${attrs?` ${attrs}`:''}>${lead}<div class="ag-row__main"><span class="ag-row__title">${title}</span>${meta?`<span class="ag-row__meta">${meta}</span>`:''}</div>${end?`<div class="ag-row__end">${end}</div>`:''}</li>`;
export const rowsHTML=(rows,{cls=''}={})=>`<ul class="ag-rows${cls?` ${cls}`:''}">${[].concat(rows).join('')}</ul>`;

/* Focus survives re-renders: before a render, remember a selector for the focused control (by id, or by its data-*
   attributes); after it, focus the matching control again, if there still is one. */
const cssEsc=v=>String(v).replace(/["\\]/g,'\\$&');
/** A selector that finds this control again after a re-render, or null. */
export function focusKey(el){
 if(!el||typeof el.getAttribute!=='function')return null;
 if(el.id)return `#${globalThis.CSS?.escape?CSS.escape(el.id):el.id}`;
 const data=[...(el.attributes??[])].filter(a=>a.name.startsWith('data-')&&!a.name.startsWith('data-tooltip'));
 if(!data.length)return null;
 return `${el.tagName.toLowerCase()}${data.map(a=>`[${a.name}="${cssEsc(a.value)}"]`).join('')}`;
}
/** Focus the control `key` names under root (no scroll jump); true when one was found. */
export function restoreFocus(root,key){
 if(!key||!root?.querySelector)return false;
 let el=null;try{el=root.querySelector(key);}catch{el=null;}
 if(!el||el.disabled||typeof el.focus!=='function')return false;
 el.focus({preventScroll:true});return true;
}
/**
 * 0.27.0: after a dialog closes and the view re-renders, focus the first control `keys` still names (the button that
 * opened it, usually). Leaves focus alone when the user has already moved on to something outside `root`.
 */
export function refocus(root,keys){
 const doc=globalThis.document,active=doc?.activeElement;
 if(active&&active!==doc?.body&&root?.contains?.(active)===false)return false;
 return [].concat(keys).filter(Boolean).some(k=>restoreFocus(root,k));
}
