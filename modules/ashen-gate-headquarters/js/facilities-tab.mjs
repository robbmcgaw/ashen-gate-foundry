// Facilities tab (GM-only): rows, chips, filter, sort, group, and markup. No Foundry globals.
export const CHIPS=Object.freeze(['Locked','Unlocked','Acquired']);
export const SORTS=Object.freeze([['name','Name A-Z'],['status','Status'],['id','ID'],['owned','Copies owned']]);
export const GROUPS=Object.freeze([['status','Status'],['definition','Definition status'],['none','No grouping']]);
export const PLACEMENTS=Object.freeze([['all','Any placement'],['shared','Shared'],['personal','Personal']]);
export const DEFAULT_VIEW=Object.freeze({search:'',status:'all',placement:'all',sort:'name',group:'status'});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Acquired wins over Unlocked; both need the Guildhall to be active. */
export function facilityChip({unlocked,owned}){return owned>0?'Acquired':unlocked?'Unlocked':'Locked';}
export function facilityRow(def,{unlocked=false,owned=0,installed=0,active=true}={}){
 return {id:def.id,name:def.name||def.id,definitionStatus:def.status||'draft',version:def.version||'',scope:def.scope||'',
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
 return keys.map(k=>({key:k,label:k,rows:rows.filter(r=>keyOf(r)===k)})).filter(g=>g.rows.length);
}
export function listFacilitiesTab(rows,view={}){
 const f={...DEFAULT_VIEW,...view},shown=sortRows(filterRows(rows,f),f.sort);
 return {total:rows.length,shown:shown.length,groups:groupRows(shown,f.group)};
}
// Actions that author or manage facility content. GM Setup must never offer these.
export const CONTENT_ACTIONS=Object.freeze(['unlock-facility','acquire','import-defs','browse-decoration']);
export const CONTENT_FORMS=Object.freeze(['decoration']);
export const SETUP_ACTIONS=Object.freeze(['set-rank','browse-background','add-rooms']);
export const SETUP_FORMS=Object.freeze(['setup']);
// Seeders and QA tools: only in the GM-only Developer Tools at the end of GM Setup.
export const DEV_ACTIONS=Object.freeze(['load-demo']);
const opts=(items,v)=>items.map(([value,label])=>`<option value="${esc(value)}" ${value===v?'selected':''}>${esc(label)}</option>`).join('');
const BADGE={Acquired:'ag-badge ag-badge--ok',Unlocked:'ag-badge ag-badge--accent',Locked:'ag-badge'};
export function facilityCard(r){
 const act=!r.active?'<span class="aghq-hint">Activate the Guildhall first</span>'
  :!r.unlocked?`<button class="ag-btn ag-btn--sm" data-action="unlock-facility" data-id="${esc(r.id)}" type="button"><i class="fa-solid fa-lock-open" aria-hidden="true"></i> Unlock</button>`
  :`<button class="ag-btn ag-btn--sm" data-action="acquire" data-id="${esc(r.id)}" type="button"><i class="fa-solid fa-plus" aria-hidden="true"></i> Acquire +1</button>`;
 return `<li class="ag-row aghq-catalogrow"><span class="ag-row__icon"><i class="fa-solid fa-warehouse" aria-hidden="true"></i></span><div class="ag-row__main"><span class="ag-row__title">${esc(r.name)}</span><span class="ag-row__meta"><span class="aghq-coderef">${esc(r.id)}</span> · v${esc(r.version)} · ${esc(r.definitionStatus)} · ${esc(r.placements.join('/'))} · ${r.stages} stage(s)</span>
<span class="aghq-badges"><span class="${BADGE[r.chip]??'ag-badge'}">${esc(r.chip)}</span><span class="ag-badge">Owned ${r.owned}</span><span class="ag-badge">Installed ${r.installed}</span></span></div><div class="ag-row__end">${act}</div></li>`;
}
export function facilitiesPanel(view,list,{active=true}={}){
 const v={...DEFAULT_VIEW,...view};
 const toolbar=`<div class="ag-toolbar"><label class="ag-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-catalog-search data-fac-filter="search" value="${esc(v.search)}" placeholder="Search facilities" aria-label="Search facilities"></label>
<div class="ag-toolbar__filters"><select data-fac-filter="status" aria-label="Status">${opts([['all','All statuses'],...CHIPS.map(x=>[x,x])],v.status)}</select>
<select data-fac-filter="placement" aria-label="Placement">${opts(PLACEMENTS,v.placement)}</select>
<select data-fac-filter="sort" aria-label="Sort">${opts(SORTS.map(([k,l])=>[k,`Sort: ${l}`]),v.sort)}</select>
<select data-fac-filter="group" aria-label="Group by">${opts(GROUPS.map(([k,l])=>[k,`Group: ${l}`]),v.group)}</select></div>
<span class="ag-toolbar__count" data-catalog-count>${list.shown} of ${list.total} facilities</span>
<div class="ag-toolbar__end"><button type="button" class="ag-btn ag-btn--sm" data-action="import-defs"><i class="fa-solid fa-file-import" aria-hidden="true"></i> Import facility definitions</button></div></div>`;
 const empty=list.total?'<div class="ag-empty"><p class="ag-empty__title">Nothing matches.</p><p class="ag-empty__text">Change the search or the filters.</p></div>'
  :'<div class="ag-empty"><i class="fa-solid fa-warehouse" aria-hidden="true"></i><p class="ag-empty__title">No facility definitions yet.</p><p class="ag-empty__text">Import a facilities file with Import facility definitions, or in General Manager.</p></div>';
 const groups=list.groups.map(g=>`<section class="aghq-facgroup"><h4 class="ag-eyebrow">${esc(g.label)} (${g.rows.length})</h4><ul class="ag-rows">${g.rows.map(facilityCard).join('')}</ul></section>`).join('')||empty;
 const decorations=active?`<section class="ag-section aghq-decor-section"><div class="ag-section__head"><h3 class="ag-section__title">Decorations</h3></div><p class="aghq-hint">Artwork players can place in their Personal Quarters.</p><form data-aghq-form="decoration" class="aghq-toolrow"><label class="ag-field aghq-grow">Image path or URL<input name="art" placeholder="Foundry data asset path or HTTPS URL" required></label><button type="button" class="ag-btn ag-btn--sm" data-action="browse-decoration"><i class="fa-solid fa-folder-open" aria-hidden="true"></i> Browse / Upload</button><button type="submit" class="ag-btn"><i class="fa-solid fa-plus" aria-hidden="true"></i> Add art</button></form></section>`:'';
 return `<div class="aghq-pane" data-hq-section="catalog"><p class="aghq-hint">Unlock makes a facility eligible; Acquire +1 creates a copy. Then open Guildhall Builder, select Edit Guildhall and drag the copy onto the board.${active?'':' Nothing can be unlocked or acquired until the Guildhall is activated in the Activation tab.'}</p>${toolbar}${groups}${decorations}</div>`;
}
