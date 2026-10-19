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
export const CONTENT_ACTIONS=Object.freeze(['unlock-facility','acquire','import-defs','load-demo','browse-decoration']);
export const CONTENT_FORMS=Object.freeze(['decoration']);
export const SETUP_ACTIONS=Object.freeze(['set-rank','browse-background','add-rooms']);
export const SETUP_FORMS=Object.freeze(['player-access','config','ranks']);
const opts=(items,v)=>items.map(([value,label])=>`<option value="${esc(value)}" ${value===v?'selected':''}>${esc(label)}</option>`).join('');
export function facilityCard(r){
 const act=!r.active?'<small>Activate the Guildhall to unlock or acquire.</small>'
  :!r.unlocked?`<button data-action="unlock-facility" data-id="${esc(r.id)}" type="button">Unlock</button>`
  :`<button data-action="acquire" data-id="${esc(r.id)}" type="button">Acquire +1</button>`;
 return `<article class="aghq-catalogrow"><strong>${esc(r.name)}</strong><small>${esc(r.id)} · v${esc(r.version)} · ${esc(r.definitionStatus)} · ${esc(r.placements.join('/'))} · ${r.stages} stage(s)</small>
<span class="aghq-chips"><span class="aghq-chip aghq-chip--${esc(r.chip.toLowerCase())}">${esc(r.chip)}</span><span class="aghq-chip">owned ${r.owned}</span><span class="aghq-chip">installed ${r.installed}</span></span><div class="aghq-toolrow">${act}</div></article>`;
}
export function facilitiesPanel(view,list,{active=true}={}){
 const v={...DEFAULT_VIEW,...view};
 const toolbar=`<div class="aghq-toolrow"><button type="button" data-action="import-defs">Import Facility Definitions JSON</button></div>
<div class="aghq-filter-grid"><label>Find facilities<input type="search" data-catalog-search data-fac-filter="search" value="${esc(v.search)}" placeholder="Name, ID, status" aria-label="Search facilities"></label>
<label>Status<select data-fac-filter="status">${opts([['all','All statuses'],...CHIPS.map(x=>[x,x])],v.status)}</select></label>
<label>Placement<select data-fac-filter="placement">${opts(PLACEMENTS,v.placement)}</select></label>
<label>Sort<select data-fac-filter="sort">${opts(SORTS,v.sort)}</select></label>
<label>Group by<select data-fac-filter="group">${opts(GROUPS,v.group)}</select></label></div>`;
 const groups=list.groups.map(g=>`<section class="aghq-facgroup"><h4>${esc(g.label)} <small>(${g.rows.length})</small></h4>${g.rows.map(facilityCard).join('')}</section>`).join('')||'<p class="aghq-hint">No matching facilities.</p>';
 const decorations=active?`<h3>Decorations (GM-provided)</h3><form data-aghq-form="decoration" class="aghq-toolrow"><input name="art" placeholder="Foundry data asset path or HTTPS URL" required><button type="button" data-action="browse-decoration">Browse / Upload</button><button type="submit">Add Art</button></form>`:'';
 const dev=`<details class="aghq-dev"><summary>Developer Tools</summary><p class="aghq-hint">GM fixture setup · test world only</p><button type="button" data-action="load-demo">Seed Test Facility Records</button></details>`;
 return `<div class="aghq-management"><section class="aghq-panel" data-hq-section="catalog"><h3>Facilities — unlock, acquire, then install</h3><p class="aghq-hint">Imported and seeded facility definitions. Unlock makes a facility eligible for acquisition; Acquire +1 creates a copy. Switch to Guildhall Builder, take the edit lock and drag the copy onto the board.${active?'':' Nothing can be unlocked or acquired until the Guildhall is activated in GM Setup.'}</p>${toolbar}<p class="aghq-hint" data-catalog-count>${list.shown} of ${list.total} facilities</p>${groups}${decorations}${dev}</section></div>`;
}
