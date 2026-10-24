// Quests tab (GM-only) logic: rows, sub-views, filter, sort, group. No Foundry globals.
import {STATUSES,publicView,associatedLocationIds,rewardRows,WORK_ORDER_DOMAINS} from './core.mjs';
export const CHIPS=Object.freeze(['Draft',...STATUSES]);
// Neutral labels for a record with no readable name: ids never stand in for a name.
export const UNTITLED='Untitled quest';
export const UNKNOWN_LOCATION='Unnamed location';
export const KIND_LABELS=Object.freeze({quest:'Quest',work_order:'Order',contract:'Contract'});
// 0.15.0 Sub-views inside the Quests tab, each with a count. `test` picks the rows the view shows.
export const SUBVIEWS=Object.freeze([
 {key:'all',label:'All',hint:'Every quest, order and contract',test:()=>true},
 {key:'drafts',label:'Drafts',hint:'Drafts are GM only until you give them a status',test:r=>r.chip==='Draft'},
 {key:'hidden',label:'Hidden',hint:'Hidden quests that are not drafts',test:r=>r.chip==='Hidden'},
 {key:'active',label:'Active',hint:'Available or Active',test:r=>r.chip==='Available'||r.chip==='Active'},
 {key:'closed',label:'Completed / Failed',hint:'Completed or Failed',test:r=>r.chip==='Completed'||r.chip==='Failed'},
 {key:'orders',label:'Orders',hint:'Work orders (crafting, production or creative)',test:r=>r.kind==='work_order'},
 {key:'contracts',label:'Contracts',hint:'Contracts',test:r=>r.kind==='contract'},
]);
export const SORTS=Object.freeze([['name','Title A-Z'],['status','Status'],['location','Location'],['changed','Recently changed'],['type','Type'],['level','Level']]);
export const GROUPS=Object.freeze([['none','No grouping'],['status','Status'],['location','Location'],['type','Type'],['level','Level'],['region','Region'],['giver','Giver']]);
// Draft is derived, not stored: a definition still marked draft/proposed that was never taken out of Hidden.
export function statusChip(source,state){
 if(state.status==='Hidden'&&['draft','proposed'].includes(source.status))return 'Draft';
 return state.status;
}
export function isPlayerVisible(source,state){try{return !!publicView(source,state);}catch{return false;}}
// Giver or faction, when the quest names one: typed refs whose relation says so, or a giver/faction string on the
// source descriptor. Quest files have no dedicated giver field; nothing is guessed from free text.
// "NPC-HALE-MARROW" -> "Hale Marrow": ids never show in the list. Typed names a quest file gives (source.giver) are kept as written.
export function giverLabel(v){
 const s=String(v??'').trim();
 if(!/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/.test(s))return s;
 return s.split('-').slice(1).map(w=>w.charAt(0)+w.slice(1).toLowerCase()).join(' ');
}
// Level and kind-of-quest detail come from the quest file's parameters (recommended_level, quest_type, contract_type) and
// the Work Order domain; a quest without them has no level and just its kind.
export function questLevel(source){
 const v=source.parameters?.recommended_level??source.parameters?.level,n=typeof v==='number'?v:/^\d{1,2}$/.test(String(v??'').trim())?Number(v):NaN;
 return Number.isInteger(n)&&n>=1&&n<=20?n:null;
}
const titleCase=t=>String(t).replace(/[_-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
export function questDetail(source){
 if(source.objective_kind==='work_order')return WORK_ORDER_DOMAINS.find(([k])=>k===source.work_order_domain)?.[1]??'';
 const t=source.objective_kind==='contract'?source.parameters?.contract_type:source.parameters?.quest_type;
 return typeof t==='string'&&t.trim()?titleCase(t.trim()):'';
}
const GIVER_RELATION=/giver|issuer|issued|offered|patron|employer|client|faction|sponsor/i;
export function questGivers(source){
 const refs=(source.refs||[]).filter(r=>GIVER_RELATION.test(r?.relation||'')).map(r=>r.target_id);
 const named=['giver','faction','issuer'].map(k=>source.source?.[k]).filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim());
 return [...new Set([...refs,...named].filter(Boolean))];
}
// When no typed giver is named, the source descriptor's free text (GM-only issuer notes) is shown as the quest's source.
export function questSource(source){return questGivers(source).length?'':String(source.source?.description??'').trim();}
// Tags are optional: a quest file may carry a `tags` list; the Quest Log adds none.
export const questTags=source=>Array.isArray(source.tags)?source.tags.filter(t=>typeof t==='string'&&t.trim()):[];
/** GM reward summary: item rows not taken out (name from the row or itemName(itemId)), plus the suggested-rewards text. */
export function rewardSummary(source,state,itemName=()=>null){
 let rows=[];try{rows=rewardRows(source,state);}catch{}
 const items=rows.filter(r=>!r.removed&&!r.gone).map(r=>({name:(r.origin==='gm'?r.ref?.name:itemName(r.itemId))||'Item',quantity:r.quantity}));
 return {items,text:String(source.outcomes?.description??'').trim()};
}
/**
 * One card per quest. ctx: {actorName(id), locationName(id), itemName(itemId)}; entries may carry `changed`
 * (ms, the GM record's last write).
 */
export function questRow({source,state,changed=null},ctx={}){
 const locations=[...new Set([...associatedLocationIds(source),...(state.publicLocationIds||[])])];
 const locName=id=>ctx.locationName?.(id)||UNKNOWN_LOCATION;
 return {id:source.id,name:source.name||UNTITLED,kind:source.objective_kind,kindLabel:KIND_LABELS[source.objective_kind]||source.objective_kind,
  detail:questDetail(source),level:questLevel(source),regions:[...new Set(locations.map(id=>ctx.locationRegion?.(id)).filter(x=>typeof x==='string'&&x.trim()))].sort((a,b)=>a.localeCompare(b)),
  chip:statusChip(source,state),visible:isPlayerVisible(source,state),
  locations,locationNames:locations.map(locName),givers:questGivers(source).map(giverLabel),giverIds:questGivers(source),sourceText:questSource(source),tags:questTags(source),
  audience:state.scope==='individual'?{scope:'individual',actorId:state.actorId,name:(state.actorId&&ctx.actorName?.(state.actorId))||(state.actorId?'Unknown character':'No character chosen')}:{scope:'party'},
  rewards:rewardSummary(source,state,ctx.itemName),changed:Number.isFinite(changed)?changed:null,
  summary:String(source.public_summary||''),
  total:(source.objectives||[]).length,done:(source.objectives||[]).filter(o=>state.progress?.[o.key]==='complete').length};
}
export const DEFAULT_VIEW=Object.freeze({search:'',nav:'all',type:'all',status:'all',location:'all',level:'all',region:'all',giver:'all',visible:'all',sort:'name',group:'status'});
/** How many of the filters behind Filters (n) are set (type, location, visible). */
export const filterCount=v=>['type','location','level','region','giver','visible'].filter(k=>(v?.[k]??'all')!=='all').length;
export function locationOptions(rows){
 const names=new Map();for(const r of rows)r.locations.forEach((id,i)=>names.set(id,r.locationNames?.[i]||UNKNOWN_LOCATION));
 return [...names].sort((a,b)=>a[1].localeCompare(b[1])||a[0].localeCompare(b[0]));
}
export const levelOptions=rows=>[...new Set(rows.map(r=>r.level).filter(n=>n!==null))].sort((a,b)=>a-b).map(n=>[String(n),`Level ${n}`]);
// Giver filter and group values are the giver's id (or the written name); the label is for display. Two ids that read alike
// (NPC-X, FACTION-X) both stay, the second and later told apart by their kind: "X (Npc)", "X (Faction)".
export function giverNames(rows){
 const ids=[...new Set(rows.flatMap(r=>r.giverIds||[]))],count=new Map();
 for(const id of ids)count.set(giverLabel(id),(count.get(giverLabel(id))||0)+1);
 return new Map(ids.map(id=>{const l=giverLabel(id),kind=id.split('-')[0];
  return [id,count.get(l)>1&&l!==id?`${l} (${kind.charAt(0)+kind.slice(1).toLowerCase()})`:l];}));
}
export const giverOptions=rows=>[...giverNames(rows)].sort((a,b)=>a[1].localeCompare(b[1])||a[0].localeCompare(b[0]));
/** A chosen filter value that is no longer among the options (its last quest changed) stays in the list, marked, so the
    select shows what is applied and the GM can clear it. */
export function keepSelected(options,value,label=value){
 return value==null||value==='all'||options.some(([v])=>String(v)===String(value))?options:[...options,[String(value),`${label} (none now)`]];
}
export const regionOptions=rows=>[...new Set(rows.flatMap(r=>r.regions||[]))].sort((a,b)=>a.localeCompare(b)).map(x=>[x,x]);
const subview=key=>SUBVIEWS.find(v=>v.key===key)||SUBVIEWS[0];
export function navCounts(rows){return Object.fromEntries(SUBVIEWS.map(v=>[v.key,rows.filter(v.test).length]));}
/** Search matches title, the permanent id (matched, never shown), location (id or name), giver or source text, tags, audience character, type, status and summary. */
export function matchesSearch(r,search){
 const q=String(search??'').trim().toLowerCase();if(!q)return true;
 return [r.name,r.id,r.summary,r.kindLabel,r.chip,...r.locations,...(r.locationNames||[]),...(r.givers||[]),...(r.giverIds||[]),r.detail,r.level!=null?`level ${r.level}`:null,...(r.regions||[]),r.sourceText,...(r.tags||[]),r.audience?.name]
  .some(t=>t!=null&&String(t).toLowerCase().includes(q));
}
export function filterRows(rows,v={}){
 const f={...DEFAULT_VIEW,...v},nav=subview(f.nav);
 return rows.filter(r=>nav.test(r)&&(f.type==='all'||r.kind===f.type)&&(f.status==='all'||r.chip===f.status)
  &&(f.location==='all'||r.locations.includes(f.location))&&(f.level==='all'||String(r.level)===String(f.level))&&(f.region==='all'||(r.regions||[]).includes(f.region))&&(f.giver==='all'||(r.giverIds||[]).includes(f.giver))
  &&(f.visible==='all'||(f.visible==='yes')===r.visible)&&matchesSearch(r,f.search));
}
const byName=(a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id);
const firstLoc=r=>r.locationNames?.length?[...r.locationNames].sort((a,b)=>a.localeCompare(b))[0]:null;
export function sortRows(rows,sort='name'){
 const rank=r=>CHIPS.indexOf(r.chip);
 const cmp={name:byName,id:(a,b)=>a.id.localeCompare(b.id),status:(a,b)=>rank(a)-rank(b)||byName(a,b),type:(a,b)=>a.kindLabel.localeCompare(b.kindLabel)||a.detail.localeCompare(b.detail)||byName(a,b),
  // Quests without a location go last; never-changed ones go last when sorting by change.
  location:(a,b)=>{const x=firstLoc(a),y=firstLoc(b);return x===y?byName(a,b):x===null?1:y===null?-1:x.localeCompare(y)||byName(a,b);},
  // Quests without a level go last.
  level:(a,b)=>(a.level??Infinity)-(b.level??Infinity)||byName(a,b),
  changed:(a,b)=>(b.changed??-Infinity)-(a.changed??-Infinity)||byName(a,b)}[sort]||byName;
 return [...rows].sort(cmp);
}
/** [{key,label,rows}]; empty groups are dropped. Location and giver groups use the first one (A-Z), giver falling back to
    the source text; "None" last. */
export function groupRows(rows,group='status'){
 if(group==='none')return [{key:'all',label:'All quests',rows}];
 if(group==='status'||group==='type'){
  const keys=group==='status'?CHIPS:Object.values(KIND_LABELS),keyOf=r=>group==='status'?r.chip:r.kindLabel;
  return keys.map(k=>({key:k,label:k,rows:rows.filter(r=>keyOf(r)===k)})).filter(g=>g.rows.length);
 }
 if(group==='level'){
  const levels=[...new Set(rows.map(r=>r.level).filter(n=>n!==null))].sort((a,b)=>a-b);
  const out=levels.map(n=>({key:`level-${n}`,label:`Level ${n}`,rows:rows.filter(r=>r.level===n)}));
  const rest=rows.filter(r=>r.level===null);if(rest.length)out.push({key:'none',label:'No level',rows:rest});
  return out;
 }
 const names=group==='giver'?giverNames(rows):null,nameOf=id=>names?.get(id)??id;
 const keyOf=group==='location'?firstLoc:group==='region'?r=>r.regions?.[0]??null:r=>r.giverIds?.length?[...r.giverIds].sort((a,b)=>nameOf(a).localeCompare(nameOf(b))||a.localeCompare(b))[0]:r.sourceText||null;
 const none=group==='location'?'No location':group==='region'?'No region':'No giver';
 const labelOf=k=>group==='giver'?nameOf(k):k;
 const keys=[...new Set(rows.map(keyOf).filter(k=>k!==null))].sort((a,b)=>labelOf(a).localeCompare(labelOf(b))||a.localeCompare(b));
 const out=keys.map(k=>({key:k,label:labelOf(k),rows:rows.filter(r=>keyOf(r)===k)}));
 const rest=rows.filter(r=>keyOf(r)===null);if(rest.length)out.push({key:'none',label:none,rows:rest});
 return out;
}
export function listQuestsTab(entries,view={},ctx={}){
 const all=entries.map(e=>questRow(e,ctx)),f={...DEFAULT_VIEW,...view};
 const shown=sortRows(filterRows(all,f),f.sort);
 return {total:all.length,shown:shown.length,groups:groupRows(shown,f.group),locations:keepSelected(locationOptions(all),f.location,ctx.locationName?.(f.location)||'a location that no longer matches'),levels:keepSelected(levelOptions(all),f.level,`Level ${f.level}`),
  regions:keepSelected(regionOptions(all),f.region),givers:keepSelected(giverOptions(all),f.giver,giverLabel(f.giver)),counts:navCounts(all),ids:shown.map(r=>r.id)};
}
/** "just now", "5 min ago", "3 h ago", "2 days ago", then the date. */
export function changedLabel(ms,now=Date.now()){
 if(!Number.isFinite(ms))return '';
 const s=Math.max(0,Math.round((now-ms)/1000));
 if(s<60)return 'just now';if(s<3600)return `${Math.floor(s/60)} min ago`;if(s<86400)return `${Math.floor(s/3600)} h ago`;
 if(s<86400*14){const d=Math.floor(s/86400);return `${d} ${d===1?'day':'days'} ago`;}
 return new Date(ms).toISOString().slice(0,10);
}
// 0.15.0 The GM's last Quests view and editor sections, kept per user (User flag `gmView`). Search is not kept.
// 0.17.0 Campaign status starts closed too; delegated assignments get their own section (saved on their own), and the
// source JSON its own (it was a fold inside GM notes). A section missing from a stored flag takes its default here.
export const EDITOR_SECTIONS=Object.freeze([['basics','Basics',true],['links','Links',false],['audience','Audience',true],['objectives','Objectives',true],['rewards','Rewards',false],['status','Campaign status and reveal',false],['gmnotes','GM notes',false],['details','Details (IDs)',false],['json','Advanced: source JSON',false],['assignments','Assignments (saved separately)',false]]);
export function gmViewState(raw){
 const r=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 const pick=(v,list,d)=>list.includes(v)?v:d;
 const sections=Object.fromEntries(EDITOR_SECTIONS.map(([k,,open])=>[k,typeof r.sections?.[k]==='boolean'?r.sections[k]:open]));
 return {nav:pick(r.nav,SUBVIEWS.map(v=>v.key),'all'),sort:pick(r.sort,SORTS.map(x=>x[0]),'name'),group:pick(r.group,GROUPS.map(x=>x[0]),'status'),sections};
}
// Actions that author or manage content. GM Setup must never offer these.
export const CONTENT_ACTIONS=Object.freeze(['new','gm-select','save-quest','cancel-edit','clear-filters','delete','import','export','add-objective','save-assignment','edit-assignment','cancel-assignment','remove-assignment','toggle-filters','collapse-groups','expand-groups','bulk-status','bulk-hide','bulk-reveal','bulk-duplicate','bulk-delete','bulk-all','bulk-clear']);
// GM Setup saves every setting with one Save Changes (Player Access included, D4); Cancel puts the form back.
export const SETUP_ACTIONS=Object.freeze(['save-setup','cancel-setup']);
/** Text for the GM with permanent ids swapped for what they stand for: quests by name, anything else by a neutral phrase.
    Used on import messages, which are built from the file's ids. `known` is [{id,name}]. */
export function hideIds(text,known=[]){
 let s=String(text??'');
 for(const {id,name} of [...known].sort((a,b)=>String(b.id).length-String(a.id).length))if(id)s=s.split(id).join(name||UNTITLED);
 return s.replace(/item reward [A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+/g,'an item reward').replace(/\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b/g,'an entry');
}
