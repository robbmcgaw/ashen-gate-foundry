// Organizations tab (GM-only) logic: rows, chips, filter, sort, group. No Foundry globals.
import {objectiveRefs} from './objective-refs.mjs';
export const CHIPS=Object.freeze(['Hidden','Characters only','Revealed to party']);
export const SORTS=Object.freeze([['name','Name A-Z'],['status','Visibility'],['renown','Group Renown (high first)'],['folder','Folder']]);
export const GROUPS=Object.freeze([['status','Visibility'],['folder','Folder'],['none','No grouping']]);
export const DEFAULT_VIEW=Object.freeze({search:'',status:'all',sort:'name',group:'status'});
// Discovery is campaign state on the faction; party wins over per-character reveals.
export function visibilityChip(faction){
 const d=faction?.discovery??{};
 if(d.party)return 'Revealed to party';
 return (d.actors??[]).length?'Characters only':'Hidden';
}
/** Kit badge modifier for a visibility chip: Revealed ok, Characters only accent, Hidden plain. */
export function chipBadge(chip){return chip==='Revealed to party'?'ag-badge--ok':chip==='Characters only'?'ag-badge--accent':'';}
/** One row per faction: everything the GM roster shows, hidden or not. */
export function orgRow({faction,score=0,rank='',folderName=''}){
 const d=faction.discovery??{};
 return {id:faction.id,name:faction.name||faction.id,leader:faction.leader||'',tags:[...(faction.tags??[])],
  chip:visibilityChip(faction),badgeClass:chipBadge(visibilityChip(faction)),characters:(d.actors??[]).length,placeholder:Boolean(d.placeholder),
  selective:faction.field_reveals?.mode==='selective',score:Number(score)||0,rank:rank||'',
  folder:folderName||'Other Factions',objectives:objectiveRefs(faction).length};
}
export function filterRows(rows,v={}){
 const f={...DEFAULT_VIEW,...v},q=String(f.search).trim().toLowerCase();
 return rows.filter(r=>(f.status==='all'||r.chip===f.status)
  &&(!q||[r.name,r.id,r.leader,r.chip,r.folder,r.rank,...r.tags].some(t=>String(t).toLowerCase().includes(q))));
}
const byName=(a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id);
export function sortRows(rows,sort='name'){
 const cmp={name:byName,status:(a,b)=>CHIPS.indexOf(a.chip)-CHIPS.indexOf(b.chip)||byName(a,b),
  renown:(a,b)=>b.score-a.score||byName(a,b),folder:(a,b)=>a.folder.localeCompare(b.folder)||byName(a,b)}[sort]||byName;
 return [...rows].sort(cmp);
}
/** [{key,label,rows}]; empty groups are dropped. */
export function groupRows(rows,group='status'){
 if(group==='none')return rows.length?[{key:'all',label:'All organizations',rows}]:[];
 const keyOf=r=>group==='folder'?r.folder:r.chip;
 const keys=group==='folder'?[...new Set(rows.map(keyOf))]:CHIPS;
 return keys.map(k=>({key:k,label:k,rows:rows.filter(r=>keyOf(r)===k)})).filter(g=>g.rows.length);
}
export function listOrgsTab(rows,view={}){
 const f={...DEFAULT_VIEW,...view},shown=sortRows(filterRows(rows,f),f.sort);
 return {total:rows.length,shown:shown.length,groups:groupRows(shown,f.group)};
}
// Actions that author or manage content. GM Setup must never offer these.
export const CONTENT_ACTIONS=Object.freeze(['create','save','award','createFolder','saveFolder','discovery','addEntry','showEntry','addReward','editReward','removeReward','resolveRequest','resetUsage','resetChoice','saveFieldReveals','addObjective','removeObjective','exportAll','importJson']);
// GM Setup saves every setting with one Save Changes (Player Access, damping, group name).
export const SETUP_ACTIONS=Object.freeze(['saveSetup']);
// Demo data loaders: only in GM Setup's collapsed Developer Tools.
export const DEV_ACTIONS=Object.freeze(['seed']);
