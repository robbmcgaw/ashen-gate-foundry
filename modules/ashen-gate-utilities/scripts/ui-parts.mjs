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
/** True for an element inside a dialog window (a kit dialog, or any <dialog>), which is closing or still open. */
const inDialog=el=>Boolean(el?.closest?.('dialog,.ag-dialog'));
/**
 * 0.27.0: after a dialog closes and the view re-renders, focus the first control `keys` still names (the button that
 * opened it, usually). Leaves focus alone when the user has already moved on to something outside `root`.
 * 0.27.1: focus still inside the closing dialog is not "moved on".
 */
export function refocus(root,keys){
 const doc=globalThis.document,active=doc?.activeElement;
 if(active&&active!==doc?.body&&!inDialog(active)&&root?.contains?.(active)===false)return false;
 return [].concat(keys).filter(Boolean).some(k=>restoreFocus(root,k));
}
const focusTimers=new WeakMap();
/**
 * 0.27.1: refocus, then try again for a moment. A modal dialog that is still closing keeps `root` inert and then hands
 * focus back to the button that opened it, which a re-render replaced (or which was disabled while the dialog was
 * open), so focus lands on the page. Every `every` ms, up to `tries` times, focus the control again until it takes;
 * stop as soon as the user has moved focus somewhere else, or the control is gone. One retry per root at a time.
 */
export function refocusSoon(root,keys,{every=50,tries=40}={}){
 const list=[].concat(keys).filter(Boolean),doc=globalThis.document;
 if(!root)return false;
 clearInterval(focusTimers.get(root));focusTimers.delete(root);
 const ok=refocus(root,list);
 const target=()=>{for(const k of list){let el=null;try{el=root.querySelector?.(k)??null;}catch{el=null;}if(el&&!el.disabled&&typeof el.focus==='function')return el;}return null;};
 if(!doc||!list.length||typeof setInterval!=='function')return ok;
 const first=target();if(!first||doc.activeElement===first)return ok;
 let n=0;
 const timer=setInterval(()=>{
  const a=doc.activeElement,el=target(),elsewhere=a&&a!==doc.body&&a!==el&&!inDialog(a);
  if(++n>tries||elsewhere||!el){stop();return;}
  if(a!==el)el.focus({preventScroll:true});
  if(doc.activeElement===el)stop();
 },every);
 function stop(){clearInterval(timer);if(focusTimers.get(root)===timer)focusTimers.delete(root);}
 timer?.unref?.();focusTimers.set(root,timer);
 return ok;
}

/* 0.27.1: Foundry's keybindings listen on the window, and its Space binding pauses the game and cancels the key. A Space
   that bubbles out of a Utilities window therefore paused the game and the focused button never clicked. Space and
   Enter stop at the module's root when they start on one of its controls; the browser's own action (click the button,
   type the space, open the select) is untouched, and so is every listener inside the root. */
export const KEY_CONTROLS='button,a[href],select,input,textarea,summary,[role="tab"],[role="button"],[role="radio"],[role="checkbox"],[role="switch"],[contenteditable=""],[contenteditable="true"]';
const activationKey=ev=>ev?.key===' '||ev?.key==='Spacebar'||ev?.code==='Space'||ev?.key==='Enter';
/** The keydown/keyup listener body: stops Space/Enter from leaving `root` when they start on one of its controls. */
export function stopActivationKeys(root,ev){
 if(!activationKey(ev))return false;
 const c=ev.target?.closest?.(KEY_CONTROLS);
 if(!c||(c!==root&&root?.contains?.(c)===false))return false;
 ev.stopPropagation();return true;
}
const guarded=new WeakSet();
/** Once per root element (a window's content, which survives re-renders): the Space/Enter guard on keydown and keyup. */
export function guardKeys(root){
 if(!root?.addEventListener||guarded.has(root))return false;guarded.add(root);
 const stop=ev=>{stopActivationKeys(root,ev);};
 root.addEventListener('keydown',stop);root.addEventListener('keyup',stop);
 return true;
}
