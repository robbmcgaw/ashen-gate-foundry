// 0.22.0 Pure logic for the GM Quests list's collapsible group headers. No Foundry globals, no DOM.
// A group's open/closed choice is kept per user (kit uiState) under a key made of the group-by mode and the group key,
// so "Status: Active" and "Location: Active Hollow" never share a choice. Nothing here reads storage: callers pass `stored`.
export const FOLD_THRESHOLD=12;

/** Group-by modes whose list is folded; "none" is one flat list. */
export const isFolded=mode=>mode!=='none';

/** Storage key for one group in one mode. */
export const storeKey=(mode,groupKey)=>`qgroup:${mode}:${groupKey}`;

/** Short markup-safe key (no raw ids in the page): stable for the same mode and group key. */
export function domKey(mode,groupKey){
 let h=5381;for(const c of `${mode}\u0000${groupKey}`)h=((h*33)^c.codePointAt(0))>>>0;
 return `grp-${mode}-${h.toString(36)}`;
}

/** True while a search or any filter narrows the list (the sub-view tabs are not filters). */
export function filterActive(view={}){
 return String(view.search??'').trim()!==''||['type','status','location','level','region','giver','visible'].some(k=>(view[k]??'all')!=='all');
}

/**
 * Open state for every group: {[group.key]: boolean}.
 *  - while a search or filter is active every group is open and nothing is saved, so a match cannot hide in a closed group;
 *  - otherwise the saved choice wins (stored: {[storeKey]: boolean});
 *  - otherwise the default: closed when there are more than FOLD_THRESHOLD quests in all, except the group holding the
 *    selected quest; open when there are fewer.
 */
export function openStates({groups=[],mode='status',total=0,selectedId=null,stored={},filtering=false}={}){
 const out={};
 for(const g of groups){
  const saved=stored?.[storeKey(mode,g.key)];
  const hasSelected=selectedId!=null&&g.rows.some(r=>r.id===selectedId);
  out[g.key]=filtering?true:typeof saved==='boolean'?saved:(hasSelected||total<=FOLD_THRESHOLD);
 }
 return out;
}

/** The saved choices that Collapse all / Expand all write: {[storeKey]: boolean} for every group shown. */
export function setAll(groups=[],mode='status',open=false){
 return Object.fromEntries(groups.map(g=>[storeKey(mode,g.key),open]));
}

/** Reads the saved choices for these groups from a uiState-like {get(name)}. */
export function readStored(state,groups=[],mode='status'){
 const out={};
 for(const g of groups){const v=state?.get?.(storeKey(mode,g.key));if(typeof v==='boolean')out[storeKey(mode,g.key)]=v;}
 return out;
}

/** True when every group is already open / already closed (to disable the matching toolbar button). */
export const allOpen=states=>Object.values(states).every(Boolean);
export const allClosed=states=>Object.values(states).every(v=>!v);

/**
 * Which toolbar buttons are usable: {collapse, expand, reason}. Both are off with "No grouping", with nothing to fold, and
 * while a search or filter holds the groups open; `reason` says why (for the tooltip).
 */
export function toolbarState({mode='status',filtering=false,open={}}={}){
 const keys=Object.keys(open);
 if(!isFolded(mode))return {collapse:false,expand:false,reason:'Groups are off. Pick a Group by choice to fold the list.'};
 if(!keys.length)return {collapse:false,expand:false,reason:'There are no groups to fold.'};
 if(filtering)return {collapse:false,expand:false,reason:'Groups stay open while a search or filter is on, so a match is never hidden.'};
 return {collapse:!allClosed(open),expand:!allOpen(open),reason:''};
}
