// Quests tab (GM-only) logic: rows, chips, filter, sort, group. No Foundry globals.
import {STATUSES,publicView,associatedLocationIds} from './core.mjs';
export const CHIPS=Object.freeze(['Draft',...STATUSES]);
export const KIND_LABELS=Object.freeze({quest:'Quest',work_order:'Order',contract:'Contract'});
export const SORTS=Object.freeze([['name','Title A-Z'],['status','Status'],['type','Type'],['id','ID']]);
export const GROUPS=Object.freeze([['none','No grouping'],['status','Status'],['type','Type']]);
// Draft is derived, not stored: a definition still marked draft/proposed that was never taken out of Hidden.
export function statusChip(source,state){
 if(state.status==='Hidden'&&['draft','proposed'].includes(source.status))return 'Draft';
 return state.status;
}
export function isPlayerVisible(source,state){try{return !!publicView(source,state);}catch{return false;}}
export function questRow({source,state}){
 return {id:source.id,name:source.name||source.id,kind:source.objective_kind,kindLabel:KIND_LABELS[source.objective_kind]||source.objective_kind,
  chip:statusChip(source,state),visible:isPlayerVisible(source,state),
  locations:[...new Set([...associatedLocationIds(source),...(state.publicLocationIds||[])])],
  summary:String(source.public_summary||'')};
}
export const DEFAULT_VIEW=Object.freeze({search:'',type:'all',status:'all',location:'all',visible:'all',sort:'name',group:'status'});
export function locationOptions(rows){return [...new Set(rows.flatMap(r=>r.locations))].sort();}
export function filterRows(rows,v={}){
 const f={...DEFAULT_VIEW,...v},q=String(f.search).trim().toLowerCase();
 return rows.filter(r=>(f.type==='all'||r.kind===f.type)&&(f.status==='all'||r.chip===f.status)
  &&(f.location==='all'||r.locations.includes(f.location))
  &&(f.visible==='all'||(f.visible==='yes')===r.visible)
  &&(!q||[r.name,r.id,r.summary,r.kindLabel,r.chip,...r.locations].some(t=>String(t).toLowerCase().includes(q))));
}
const byName=(a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id);
export function sortRows(rows,sort='name'){
 const rank=r=>CHIPS.indexOf(r.chip);
 const cmp={name:byName,id:(a,b)=>a.id.localeCompare(b.id),status:(a,b)=>rank(a)-rank(b)||byName(a,b),type:(a,b)=>a.kindLabel.localeCompare(b.kindLabel)||byName(a,b)}[sort]||byName;
 return [...rows].sort(cmp);
}
/** [{key,label,rows}]; empty groups are dropped. */
export function groupRows(rows,group='status'){
 if(group==='none')return [{key:'all',label:'All quests',rows}];
 const keys=group==='status'?CHIPS:Object.values(KIND_LABELS);
 const keyOf=r=>group==='status'?r.chip:r.kindLabel;
 return keys.map(k=>({key:k,label:k,rows:rows.filter(r=>keyOf(r)===k)})).filter(g=>g.rows.length);
}
export function listQuestsTab(entries,view={}){
 const all=entries.map(questRow),f={...DEFAULT_VIEW,...view};
 const shown=sortRows(filterRows(all,f),f.sort);
 return {total:all.length,shown:shown.length,groups:groupRows(shown,f.group),locations:locationOptions(all)};
}
// Actions that author or manage content. GM Setup must never offer these.
export const CONTENT_ACTIONS=Object.freeze(['new','gm-select','save-source','save-state','delete','import','export','add-objective','save-assignment','edit-assignment','remove-assignment']);
export const SETUP_ACTIONS=Object.freeze(['save-player-access','save-pack-ids','toggle-overlay']);
