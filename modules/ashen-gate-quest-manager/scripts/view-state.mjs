// 0.14.0 Keeps the reader's place when the Quest Log window redraws (a save, picking a quest, another client's change).
// Every scrolling panel carries data-ag-scroll="<key>"; its offset is kept per key, so each list and each quest's
// editor keeps its own place. The field being typed in keeps focus and caret; its unsaved text is put back only when
// asked (a redraw caused by someone else), never after Cancel or picking another quest.
const TEXT_TYPES=new Set(['','text','search','number','email','url','tel','password']);
const ROW_ATTRS=['data-key','data-reward-key','data-grant-key'];
const FIELD_ATTRS=['data-reward-field','data-grant-actor','data-grant-split'];
const quote=v=>String(v).replace(/["\\]/g,'\\$&');
const isTextField=el=>el?.tagName==='TEXTAREA'||(el?.tagName==='INPUT'&&TEXT_TYPES.has(String(el.type??'').toLowerCase()));

/** A selector that finds the same field in the redrawn markup, or null when it can't be told apart. */
export function fieldSelector(el){
 if(!el||typeof el!=='object')return null;
 if(el.id)return `#${globalThis.CSS?.escape?CSS.escape(el.id):el.id}`;
 const row=el.closest?.(ROW_ATTRS.map(a=>`[${a}]`).join(','));
 const rowAttr=row&&ROW_ATTRS.find(a=>row.getAttribute?.(a)!=null);
 if(!rowAttr)return null;
 const fieldAttr=FIELD_ATTRS.find(a=>el.getAttribute?.(a)!=null);
 const own=fieldAttr?`[${fieldAttr}="${quote(el.getAttribute(fieldAttr))}"]`:el.classList?.[0]?`.${el.classList[0]}`:null;
 return own?`[${rowAttr}="${quote(row.getAttribute(rowAttr))}"] ${own}`:null;
}

/** Saves each marked panel's scroll offset into `memo` and returns the focused field (or null). */
export function captureView(root,memo){
 for(const el of root?.querySelectorAll?.('[data-ag-scroll]')??[]){const key=el.dataset?.agScroll;if(key)memo[key]={top:el.scrollTop||0,left:el.scrollLeft||0};}
 const active=(root?.ownerDocument??globalThis.document)?.activeElement;
 if(!active||active===root||!root?.contains?.(active))return null;
 const selector=fieldSelector(active);if(!selector)return null;
 const text=isTextField(active);
 return {selector,text,value:text?active.value:undefined,start:text?active.selectionStart??null:null,end:text?active.selectionEnd??null:null};
}

/** Puts the saved offsets back on the redrawn panels, then focus (and, with keepText, the unsaved text). */
export function restoreView(root,memo,focus,{keepText=false}={}){
 for(const el of root?.querySelectorAll?.('[data-ag-scroll]')??[]){const at=memo[el.dataset?.agScroll];if(!at)continue;el.scrollTop=at.top;el.scrollLeft=at.left;}
 if(!focus)return;
 const el=root?.querySelector?.(focus.selector);if(!el)return;
 if(focus.text&&keepText&&typeof focus.value==='string'&&el.value!==focus.value){el.value=focus.value;el.dispatchEvent?.(new Event('input',{bubbles:true}));}
 el.focus?.({preventScroll:true});
 if(focus.text&&focus.start!==null)try{el.setSelectionRange?.(focus.start,focus.end??focus.start);}catch{}
}
