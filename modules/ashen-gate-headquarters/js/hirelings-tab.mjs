// Hirelings tab (GM-only): plain-language labels, search/status filter and grouping. No Foundry globals.
import {DEPARTED} from './hirelings.mjs';
export const EMPLOYMENT=Object.freeze({active:'Active',dismissed:'Dismissed',retired:'Retired',departed:'Permanently departed',deceased:'Deceased'});
/** Perk status → label and kit badge tone. */
export const PERK_STATUS=Object.freeze({eligible:['Eligible','ok'],inactive:['Inactive','warn'],nonstacking:["Doesn't stack",'warn'],unverified:['Unverified','']});
export const HISTORY_EVENTS=Object.freeze({permanent_departure:'Permanent departure'});
export const STATUS_FILTERS=Object.freeze([['all','All'],['active','Active'],['departed','Departed']]);
export const DEFAULT_VIEW=Object.freeze({search:'',status:'all'});
export const DEPARTURE_REASONS=Object.freeze(DEPARTED.map(k=>[k,EMPLOYMENT[k]]));
const words=k=>String(k??'').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
export const employmentLabel=k=>EMPLOYMENT[k]??words(k);
export const perkStatus=k=>{const [label,tone]=PERK_STATUS[k]??[words(k),''];return {label,tone};};
export const historyEvent=k=>HISTORY_EVENTS[k]??words(k);
/** A history timestamp as a local date and time; '' when missing or unreadable (never the raw ISO string). */
export function localDate(at,locale){const d=new Date(at);return at&&!Number.isNaN(d.getTime())?d.toLocaleString(locale):'';}
/**
 * Facility names for the station select and the card: the name alone, "#2", "#3"… only when two installed copies share it.
 * items: [{key, name}] → Map key → label.
 */
export function stationLabels(items){
 const total=new Map(),seen=new Map(),out=new Map();
 for(const i of items)total.set(i.name,(total.get(i.name)??0)+1);
 for(const i of items){const n=(seen.get(i.name)??0)+1;seen.set(i.name,n);out.set(i.key,total.get(i.name)>1?`${i.name} #${n}`:i.name);}
 return out;
}
/** Roster rows ({hireling_ref, employment_status, name}) filtered by view, grouped Active then Departed (empty groups dropped). */
export function rosterGroups(rows,view={}){
 const v={...DEFAULT_VIEW,...view},q=String(v.search).trim().toLowerCase();
 const active=r=>r.employment_status==='active';
 const shown=rows.filter(r=>(v.status==='all'||(v.status==='active')===active(r))&&(!q||String(r.name??'').toLowerCase().includes(q)))
  .sort((a,b)=>String(a.name).localeCompare(String(b.name)));
 return {total:rows.length,shown:shown.length,groups:[['active','Active',shown.filter(active)],['departed','Departed',shown.filter(r=>!active(r))]]
  .filter(([, ,list])=>list.length).map(([key,label,list])=>({key,label,rows:list}))};
}
