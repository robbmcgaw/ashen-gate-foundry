// Facilities tab (GM-only): rows, chips, filter, sort, group, and markup. No Foundry globals.
import {subTabs,tabPanelAttrs,fold} from './ag-html.mjs';
import {idDetails,plainToken} from './id-details.mjs';
export const CHIPS=Object.freeze(['Locked','Unlocked','Acquired']);
export const SORTS=Object.freeze([['name','Name A-Z'],['status','Status'],['id','ID'],['owned','Copies owned']]);
export const GROUPS=Object.freeze([['status','Status'],['definition','Definition status'],['none','No grouping']]);
export const PLACEMENTS=Object.freeze([['all','Any placement'],['shared','Shared'],['personal','Personal']]);
export const DEFAULT_VIEW=Object.freeze({search:'',status:'all',placement:'all',sort:'name',group:'status'});
export const DEF_STATUS=Object.freeze({draft:'Draft',approved:'Approved',proposed:'Proposed'});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Acquired wins over Unlocked; both need the Guildhall to be active. */
export function facilityChip({unlocked,owned}){return owned>0?'Acquired':unlocked?'Unlocked':'Locked';}
export function facilityRow(def,{unlocked=false,owned=0,installed=0,active=true}={}){
 return {id:def.id,name:def.name||'Unnamed facility',definitionStatus:def.status||'draft',version:def.version||'',scope:def.scope||'',
  placements:[...(def.placements??[])],stages:(def.stages??[]).length,owned,installed,active,
  chip:facilityChip({unlocked,owned}),unlocked};
}
export function filterRows(rows,v={}){
 const f={...DEFAULT_VIEW,...v},q=String(f.search).trim().toLowerCase();
 return rows.filter(r=>(f.status==='all'||r.chip===f.status)&&(f.placement==='all'||r.placements.includes(f.placement))
  &&(!q||[r.name,r.id,r.chip,r.definitionStatus,r.scope,...r.placements].some(t=>String(t).toLowerCase().includes(q))));
}
const byName=(a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id);
export function sortRows(rows,sort='name'){
 const cmp={name:byName,id:(a,b)=>a.id.localeCompare(b.id),status:(a,b)=>CHIPS.indexOf(a.chip)-CHIPS.indexOf(b.chip)||byName(a,b),owned:(a,b)=>b.owned-a.owned||byName(a,b)}[sort]||byName;
 return [...rows].sort(cmp);
}
/** [{key,label,rows}]; empty groups are dropped. */
export function groupRows(rows,group='status'){
 if(group==='none')return rows.length?[{key:'all',label:'All facilities',rows}]:[];
 const keyOf=r=>group==='definition'?r.definitionStatus:r.chip;
 const keys=group==='definition'?[...new Set(rows.map(keyOf))].sort():CHIPS;
 return keys.map(k=>({key:k,label:group==='definition'?(DEF_STATUS[k]??plainToken(k)):k,rows:rows.filter(r=>keyOf(r)===k)})).filter(g=>g.rows.length);
}
export function listFacilitiesTab(rows,view={}){
 const f={...DEFAULT_VIEW,...view},shown=sortRows(filterRows(rows,f),f.sort);
 return {total:rows.length,shown:shown.length,groups:groupRows(shown,f.group)};
}
// Actions that author or manage facility content. GM Setup must never offer these.
// 0.13.0: Guild Rank lives on the Facilities tab (its own row, labelled confirmation), not in GM Setup.
export const CONTENT_ACTIONS=Object.freeze(['unlock-facility','acquire','set-rank','browse-decoration']);
export const CONTENT_FORMS=Object.freeze(['decoration']);
// 0.13.0: Create missing player rooms is a GM toolbar action on Personal Quarters.
export const QUARTERS_ACTIONS=Object.freeze(['add-rooms']);
export const SETUP_ACTIONS=Object.freeze(['browse-background']);
export const SETUP_FORMS=Object.freeze(['setup']);
// Seeders and QA tools: only in the GM-only Developer Tools at the end of GM Setup.
export const DEV_ACTIONS=Object.freeze(['load-demo']);
// Facilities tab sub-tabs (one level, kit 2.2 subTabs).
export const SUB_TABS=Object.freeze([['facilities','Facilities'],['decorations','Decorations']]);
export const SUB_GROUP='aghq-facilities';
/** "1 stage", "2 stages". */
export const plural=(n,one,many=`${one}s`)=>`${n} ${n===1?one:many}`;
const opts=(items,v)=>items.map(([value,label])=>`<option value="${esc(value)}" ${value===v?'selected':''}>${esc(label)}</option>`).join('');
const BADGE={Acquired:'ag-badge ag-badge--ok',Unlocked:'ag-badge ag-badge--accent',Locked:'ag-badge'};
const PLACE={shared:'Shared',personal:'Personal'};
export function facilityCard(r){
 const act=!r.active?'<span class="aghq-hint">Activate the Guildhall first</span>'
  :!r.unlocked?`<button class="ag-btn ag-btn--sm" data-action="unlock-facility" data-id="${esc(r.id)}" type="button"><i class="fa-solid fa-lock-open" aria-hidden="true"></i> Unlock</button>`
  :`<button class="ag-btn ag-btn--sm" data-action="acquire" data-id="${esc(r.id)}" type="button"><i class="fa-solid fa-plus" aria-hidden="true"></i> Acquire +1</button>`;
 return `<li class="ag-row aghq-catalogrow"><span class="ag-row__icon"><i class="fa-solid fa-warehouse" aria-hidden="true"></i></span><div class="ag-row__main"><span class="ag-row__title">${esc(r.name)}</span><span class="ag-row__meta">v${esc(r.version)} · ${esc(DEF_STATUS[r.definitionStatus]??plainToken(r.definitionStatus))} · ${esc(r.placements.map(p=>PLACE[p]??plainToken(p)).join(' / '))} · ${plural(r.stages,'stage')}</span>
${idDetails(r.id)}<span class="aghq-badges"><span class="${BADGE[r.chip]??'ag-badge'}">${esc(r.chip)}</span><span class="ag-badge">Owned ${r.owned}</span><span class="ag-badge">Installed ${r.installed}</span></span></div><div class="ag-row__end">${act}</div></li>`;
}
/** Guild row above the sub-tabs: rank, capacity and the GM's Set rank (asks first). Only once the Guildhall is active. */
export function guildBar(g){
 if(!g)return '';
 return `<div class="aghq-guildbar"><span class="aghq-guildbar__facts"><strong>Guild rank ${g.rank}</strong> · ${g.used}/${g.slots} shared facilities · ${plural(g.orders,'order')} per downtime</span><span class="aghq-guildbar__set"><label class="ag-field ag-field--inline">New rank <select data-rank>${[1,2,3,4,5].map(i=>`<option value="${i}" ${i===g.rank?'selected':''}>${i}</option>`).join('')}</select></label><button type="button" class="ag-btn ag-btn--sm" data-action="set-rank">Set rank…</button></span></div>`;
}
const field=(label,html)=>`<label class="ag-field ag-field--inline">${label} ${html}</label>`;
/**
 * The Facilities tab. opts: {active, sub ('facilities'|'decorations'), guild (guildBar facts), art (decoration paths),
 * importHtml (the kit fileButton for the advanced importer), manager (General Manager can open)}.
 */
export function facilitiesPanel(view,list,{active=true,sub='facilities',guild=null,art=[],importHtml='',manager=false}={}){
 const v={...DEFAULT_VIEW,...view};
 const pick=SUB_TABS.some(([id])=>id===sub)?sub:'facilities';
 const tabs=subTabs({group:SUB_GROUP,label:'Facilities sections',tabs:SUB_TABS.map(([id,label])=>({id,label,count:id==='facilities'?list.total:art.length})),selected:pick});
 const panel=id=>tabPanelAttrs(SUB_GROUP,id);
 if(pick==='decorations'){
  const grid=art.length?`<div class="aghq-artgrid">${art.map((url,i)=>`<span class="aghq-decoration-card"><img src="${esc(url)}" alt="Decoration ${i+1}"></span>`).join('')}</div>`:'<p class="aghq-hint">No artwork yet.</p>';
  const body=active?`<p class="aghq-hint">Artwork players can place in their Personal Quarters.</p><form data-aghq-form="decoration" class="aghq-toolrow"><label class="ag-field aghq-grow">Image path or URL<input name="art" placeholder="worlds/my-world/art/rug.webp" required></label><button type="button" class="ag-btn ag-btn--sm" data-action="browse-decoration"><i class="fa-solid fa-folder-open" aria-hidden="true"></i> Browse…</button><button type="submit" class="ag-btn"><i class="fa-solid fa-plus" aria-hidden="true"></i> Add art</button></form>${grid}`
   :'<div class="ag-empty"><i class="fa-solid fa-image" aria-hidden="true"></i><p class="ag-empty__title">No decorations yet.</p><p class="ag-empty__text">Activate the Guildhall in the Activation tab, then add artwork here.</p></div>';
  return `<div class="aghq-pane aghq-facpane">${guildBar(guild)}${tabs}<section class="aghq-subpanel" ${panel('decorations')}>${body}</section></div>`;
 }
 const toolbar=`<div class="ag-toolbar"><label class="ag-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-catalog-search data-fac-filter="search" value="${esc(v.search)}" placeholder="Search facilities" aria-label="Search facilities"></label>
<div class="ag-toolbar__filters">${field('Status',`<select data-fac-filter="status">${opts([['all','All'],...CHIPS.map(x=>[x,x])],v.status)}</select>`)}
${field('Placement',`<select data-fac-filter="placement">${opts(PLACEMENTS.map(([k,l])=>[k,k==='all'?'Any':l]),v.placement)}</select>`)}
${field('Sort',`<select data-fac-filter="sort">${opts(SORTS,v.sort)}</select>`)}
${field('Group',`<select data-fac-filter="group">${opts(GROUPS.map(([k,l])=>[k,k==='none'?'None':l]),v.group)}</select>`)}</div>
<span class="ag-toolbar__count" data-catalog-count>${list.shown} of ${plural(list.total,'facility','facilities')}</span></div>`;
 const empty=list.total?'<div class="ag-empty"><p class="ag-empty__title">Nothing matches.</p><p class="ag-empty__text">Change the search or the filters.</p></div>'
  :'<div class="ag-empty"><i class="fa-solid fa-warehouse" aria-hidden="true"></i><p class="ag-empty__title">No facility definitions yet.</p><p class="ag-empty__text">Import a facilities file in General Manager, or under Advanced below.</p></div>';
 const groups=list.groups.map(g=>`<section class="aghq-facgroup"><h4 class="ag-eyebrow">${esc(g.label)} (${g.rows.length})</h4><ul class="ag-rows">${g.rows.map(facilityCard).join('')}</ul></section>`).join('')||empty;
 // Decision HQ-07: the second importer stays, demoted to a labelled fold; General Manager is the primary path.
 const advanced=fold({key:'facility-import',title:'Advanced: import here, or use General Manager',body:`<p class="aghq-hint">General Manager is the usual place to import facility files. This imports a JSON file of facility definitions straight into Headquarters; facilities already in the catalog are kept as they are.</p><div class="aghq-toolrow">${importHtml}${manager?'<button type="button" class="ag-btn" data-action="open-manager"><i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i> Open General Manager</button>':''}</div>`});
 const hint=`<p class="aghq-hint">Unlock makes a facility eligible; Acquire +1 creates a copy to place in Guildhall Builder.${active?'':' Nothing can be unlocked or acquired until the Guildhall is activated in the Activation tab.'}</p>`;
 return `<div class="aghq-pane aghq-facpane" data-hq-section="catalog">${guildBar(guild)}${tabs}<section class="aghq-subpanel" ${panel('facilities')}>${toolbar}${hint}${groups}${advanced}</section></div>`;
}
