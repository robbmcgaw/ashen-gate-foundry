/**
 * 0.37.8: gather history. Pure helpers; main.js does the world setting, the GM gate and the screens.
 * The record is one small object per gather: {id, at, title, tiers, dc, professions, given, rows:[{actorId,name,total,result,pending,xp,drops:[{name,quantity,kind,given}]}]}.
 * Capped at 10, newest first. Anything unreadable in the stored setting is dropped on read and never rewritten until the next real save.
 */
export const HISTORY_MAX=10;
export const HISTORY_SCHEMA='ag-gather-history/0.1';
const RESULTS=new Set(['fail','common','rare']);
const KINDS=new Set(['common','rare','exotic']);
const text=(v,n=120)=>typeof v==='string'?v.slice(0,n):'';
const int=v=>Number.isFinite(Number(v))?Math.trunc(Number(v)):null;
function cleanRow(r){
  if(!r||typeof r!=='object')return null;
  const name=text(r.name);if(!name)return null;
  const drops=(Array.isArray(r.drops)?r.drops:[]).slice(0,12).map(d=>d&&typeof d==='object'&&text(d.name)?{name:text(d.name),quantity:Math.max(1,int(d.quantity)??1),kind:KINDS.has(d.kind)?d.kind:'common',given:d.given===true}:null).filter(Boolean);
  return {actorId:text(r.actorId,64),name,total:int(r.total)??0,result:RESULTS.has(r.result)?r.result:'fail',pending:r.pending===true,xp:Number.isFinite(Number(r.xp))&&r.xp!==null?Math.max(0,int(r.xp)):null,drops};
}
export function cleanEntry(e){
  if(!e||typeof e!=='object')return null;
  const id=text(e.id,80),at=Number(e.at);
  if(!id||!Number.isFinite(at))return null;
  const rows=(Array.isArray(e.rows)?e.rows:[]).slice(0,24).map(cleanRow).filter(Boolean);
  return {id,at,title:text(e.title)||'Gather',tiers:(Array.isArray(e.tiers)?e.tiers:[]).map(int).filter(n=>n!==null).slice(0,8),dc:int(e.dc),professions:(Array.isArray(e.professions)?e.professions:[]).map(p=>text(p,60)).filter(Boolean).slice(0,8),
    given:rows.every(r=>r.pending!==true&&r.drops.every(d=>d.given)),rows};
}
/** The stored setting → a clean list, newest first, at most 10. Missing or malformed → []. Never throws, never writes. */
export function readHistory(raw){
  const list=Array.isArray(raw)?raw:Array.isArray(raw?.entries)?raw.entries:[];
  const seen=new Set(),out=[];
  for(const e of list){const c=cleanEntry(e);if(c&&!seen.has(c.id)){seen.add(c.id);out.push(c);}}
  return out.sort((a,b)=>b.at-a.at).slice(0,HISTORY_MAX);
}
export const storedHistory=entries=>({schema:HISTORY_SCHEMA,entries});
/** Add or replace the entry with the same id (keeping any XP already recorded), newest first, oldest dropped. */
export function upsertEntry(entries,entry){
  const next=cleanEntry(entry);if(!next)return entries;
  const old=entries.find(e=>e.id===next.id);
  if(old)for(const row of next.rows){const was=old.rows.find(r=>r.actorId&&r.actorId===row.actorId);if(was&&row.xp==null)row.xp=was.xp;}
  return [next,...entries.filter(e=>e.id!==next.id)].sort((a,b)=>b.at-a.at).slice(0,HISTORY_MAX);
}
export const removeEntry=(entries,id)=>entries.filter(e=>e.id!==id);
export function setRowXp(entries,id,actorId,xp){
  return entries.map(e=>e.id!==id?e:{...e,rows:e.rows.map(r=>r.actorId===actorId?{...r,xp:xp==null?null:Math.max(0,int(xp)??0)}:r)});
}
/** 'Today, 9:42 PM', 'Yesterday, 9:42 PM', 'Oct 28' (same year) or 'Oct 28, 2025'. Never a raw timestamp. */
export function humanWhen(ms,now=Date.now()){
  const d=new Date(ms),n=new Date(now);
  const day=x=>new Date(x.getFullYear(),x.getMonth(),x.getDate()).getTime();
  const diff=Math.round((day(n)-day(d))/86400000);
  const time=d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
  if(diff===0)return `Today, ${time}`;
  if(diff===1)return `Yesterday, ${time}`;
  const date=d.toLocaleDateString('en-US',{month:'short',day:'numeric',...(d.getFullYear()!==n.getFullYear()?{year:'numeric'}:{})});
  return date;
}
