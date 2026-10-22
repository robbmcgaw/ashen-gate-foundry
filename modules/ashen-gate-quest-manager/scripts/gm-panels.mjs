// Quest Log markup that needs no Foundry globals, so it can be tested.
import {cleanText as E} from './core.mjs';
import {CHIPS,KIND_LABELS,SORTS,GROUPS,DEFAULT_VIEW} from './quests-tab.mjs';
const KINDS={primary:'ag-btn ag-btn--primary',secondary:'ag-btn',danger:'ag-btn ag-btn--danger',ghost:'ag-btn ag-btn--ghost'};
const tip=t=>t?` data-tooltip="${E(t)}" data-tooltip-class="ag-tooltip"`:'';
const icon=i=>i?`<i class="fa-solid ${E(i)}" aria-hidden="true"></i>`:'';
/** Kit button. kind: primary|secondary|danger|ghost. title becomes a Foundry tooltip (never a native title). */
export function safeButton(label,action,{disabled=false,kind='secondary',title='',icon:i='',sm=false,data={},iconOnly=false}={}){
 const cls=[KINDS[kind]||KINDS.secondary,sm?'ag-btn--sm':'',iconOnly?'ag-btn--icon':''].filter(Boolean).join(' ');
 const attrs=Object.entries(data).map(([k,v])=>` data-${E(k)}="${E(v)}"`).join('');
 const aria=iconOnly?` aria-label="${E(label)}"${tip(title||label)}`:tip(title);
 return `<button type="button" data-action="${E(action)}" class="${cls}"${attrs}${disabled?' disabled':''}${aria}>${iconOnly?icon(i):i?`${icon(i)} ${E(label)}`:E(label)}</button>`;
}
export function options(items,value){return items.map(([v,n])=>`<option value="${E(v)}" ${v===value?'selected':''}>${E(n)}</option>`).join('');}
export function emptyState(title,text,{iconName='fa-scroll',action=''}={}){return `<div class="ag-empty">${icon(iconName)}<p class="ag-empty__title">${E(title)}</p>${text?`<p class="ag-empty__text">${E(text)}</p>`:''}${action}</div>`;}
const BADGE={Active:'ag-badge--accent',Completed:'ag-badge--ok',Failed:'ag-badge--danger'};
export function statusBadge(status){return `<span class="${['ag-badge',BADGE[status]].filter(Boolean).join(' ')}">${status==='Hidden'||status==='Draft'?icon('fa-eye-slash'):''}${E(status)}</span>`;}
/** Objectives done/total as text plus a thin bar. */
export function progressMeter(done,total){
 const pct=total?Math.round(done/total*100):0;
 return `<span class="ag-meter agq-meter${total&&done===total?' ag-meter--ok':''}" role="progressbar" aria-label="Objectives complete" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><span class="ag-meter__value">${done}/${total}</span><span class="ag-meter__track"><span class="ag-meter__fill" style="--ag-meter:${pct}%"></span></span></span>`;
}
const locMeta=locs=>locs.length?` <span class="agq-meta-loc">${icon('fa-map-location-dot')} ${locs.map(E).join(', ')}</span>`:'';
/** GM Quests list: rows grouped under eyebrow headings with counts. */
export function questCards(groups,selectedId,{total=null}={}){
 if(!groups.length)return total===0
  ?emptyState('No quests yet','Create one with New quest, or import a file with Import.',{action:safeButton('New quest','new',{sm:true,icon:'fa-plus'})})
  :emptyState('Nothing matches','Change the search or filters to see more quests.',{iconName:'fa-magnifying-glass',action:safeButton('Clear filters','clear-filters',{sm:true,kind:'ghost'})});
 return groups.map(g=>`<section class="agq-group"><h3 class="ag-eyebrow agq-group__head">${E(g.label)} <span class="agq-group__count">${g.rows.length}</span></h3><div class="ag-rows">${g.rows.map(r=>{const sel=selectedId===r.id;return `<button type="button" class="ag-row agq-row${sel?' is-selected':''}" data-action="gm-select" data-id="${E(r.id)}"${sel?' aria-current="true"':''}><span class="ag-row__main"><span class="ag-row__title">${E(r.name)}</span><span class="ag-row__meta"><span class="agq-mono">${E(r.id)}</span> · ${E(r.kindLabel)}${locMeta(r.locations)}</span></span><span class="ag-row__end agq-row__end">${progressMeter(r.done,r.total)}${statusBadge(r.chip)}${r.visible?`<span class="ag-badge ag-badge--ok"${tip('Players can see this quest')}>${icon('fa-eye')}Visible</span>`:''}</span></button>`;}).join('')}</div></section>`).join('');
}
export function questsToolbar(view,locations,{shown=0,total=0}={}){
 const v={...DEFAULT_VIEW,...view};
 const chip=c=>`<button type="button" class="ag-chip" data-qv-status="${E(c)}" aria-pressed="${v.status===c}">${E(c)}</button>`;
 return `<div class="ag-toolbar agq-toolbar"><label class="ag-search">${icon('fa-magnifying-glass')}<input type="search" id="ag-gm-search" placeholder="Search quests" aria-label="Search quests by title, ID, location or text" value="${E(v.search)}"></label>
 <div class="ag-toolbar__filters"><div class="ag-chip-group" role="group" aria-label="Status">${CHIPS.map(chip).join('')}</div>
 <select id="ag-gm-type" aria-label="Type">${options([['all','All types'],...Object.entries(KIND_LABELS)],v.type)}</select>
 <select id="ag-gm-location" aria-label="Location">${options([['all','Any location'],...locations.map(x=>[x,x])],v.location)}</select>
 <select id="ag-gm-visible" aria-label="Visible to players">${options([['all','Visible or not'],['yes','Visible to players'],['no','Not visible']],v.visible)}</select>
 <select id="ag-gm-sort" aria-label="Sort">${options(SORTS.map(([k,n])=>[k,`Sort: ${n}`]),v.sort)}</select>
 <select id="ag-gm-group" aria-label="Group by">${options(GROUPS.map(([k,n])=>[k,k==='none'?n:`Group: ${n}`]),v.group)}</select></div>
 <span class="ag-toolbar__count" id="ag-gm-count">${shown} of ${total} quests</span>
 <div class="ag-toolbar__end">${safeButton('New quest','new',{icon:'fa-plus'})}${safeButton('Import','import',{sm:true,icon:'fa-file-import',title:'Import quest sources from a JSON file'})}${safeButton('Export','export',{sm:true,icon:'fa-file-export',title:'Export every quest source as JSON'})}</div></div>`;
}
/** GM Setup: settings only, saved together by the footer's Save Changes (Player Access included, decision D4). */
export function setupPanel({playerAccess,packIds,overlayVisible,openForPlayers=false}){
 return `<div class="agq-setup"><div class="agq-setup__body ag-scroll ag-pad" data-ag-scroll="setup">
 <section class="ag-section"><div class="ag-section__head"><h3 class="ag-section__title">Player Access</h3></div>
 <label class="ag-field ag-field--inline"><input type="checkbox" id="ag-player-access" ${playerAccess?'checked':''}> Show Quest Log to players</label>
 <p class="ag-field__hint">Controls the player window only, not which quests they see. Reveal each quest from the Quests tab. Saved with Save Changes.</p></section>
 <section class="ag-section"><div class="ag-section__head"><h3 class="ag-section__title">Players' screens</h3></div>
 <label class="ag-field ag-field--inline"><input type="checkbox" id="ag-open-for-players" ${openForPlayers?'checked':''}> Open the Quest Log for players when a quest is revealed to them</label>
 <p class="ag-field__hint">Off by default: assigning, revealing or completing a quest, or giving rewards, opens nothing on players' screens. When on, a newly revealed quest opens the player's Quest Log window at that quest (never a journal page). Saved with Save Changes.</p></section>
 <section class="ag-section"><div class="ag-section__head"><h3 class="ag-section__title">Compendium packs</h3></div>
 <label class="ag-field">Compendium pack IDs<input id="ag-compendium-packs" value="${E(packIds||'')}" placeholder="world.my-quests"><span class="ag-field__hint">Optional read-only quest definitions, not player quests. Leave blank unless you use a quest compendium. Reload Foundry after changing.</span></label></section>
 <section class="ag-section"><div class="ag-section__head"><h3 class="ag-section__title">Objectives overlay</h3></div>
 <p class="ag-field__hint">The on-screen overlay shows each user's tracked quests. This is only for you and changes right away.</p>
 ${safeButton(overlayVisible?'Hide objectives overlay':'Show objectives overlay','toggle-overlay',{sm:true,icon:'fa-list-check'})}</section></div>
 <footer class="ag-footer">${safeButton('Cancel','cancel-setup',{kind:'ghost'})}<span class="ag-footer__status" role="status"></span>${safeButton('Save Changes','save-setup',{kind:'primary'})}</footer></div>`;
}
