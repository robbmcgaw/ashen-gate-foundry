// Quest Log markup that needs no Foundry globals, so it can be tested.
import {cleanText as E,STATUSES} from './core.mjs';
import {KIND_LABELS,SORTS,GROUPS,DEFAULT_VIEW,SUBVIEWS,changedLabel,filterCount} from './quests-tab.mjs';
import {fold,fileButton} from './ag-html.mjs';
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
const KIND_ICON={quest:'fa-scroll',work_order:'fa-hammer',contract:'fa-file-signature'};
const meta=(i,label,text)=>`<span class="agq-card__fact">${icon(i)}<span class="ag-sr-only">${E(label)}: </span>${text}</span>`;
const rewardText=({items,text})=>{
 const parts=[];if(items.length)parts.push(items.map(i=>`${E(i.quantity)} × ${E(i.name)}`).join(', '));if(text)parts.push(E(text));
 return parts.join(' · ');
};
/** One GM quest card: pick box, then the card button (title and badges; facts; progress, rewards, last change). */
export function questCard(r,{selected=false,picked=false,now=Date.now()}={}){
 const vis=r.visible?`<span class="ag-badge ag-badge--ok"${tip('Players can see this quest')}>${icon('fa-eye')}Visible to players</span>`
  :`<span class="ag-badge"${tip('Players cannot see this quest')}>${icon('fa-eye-slash')}GM only</span>`;
 const facts=[];
 if(r.locationNames.length)facts.push(meta('fa-map-location-dot','Location',[...new Set(r.locationNames)].map(E).join(', ')+(r.regions?.length?` (${r.regions.map(E).join(', ')})`:'')));
 if(r.givers.length)facts.push(meta('fa-handshake','Giver',r.givers.map(E).join(', ')));
 else if(r.sourceText)facts.push(meta('fa-handshake','Source',E(r.sourceText)));
 facts.push(r.audience.scope==='individual'?meta('fa-user','Audience',`Individual: ${E(r.audience.name)}`):meta('fa-users','Audience','Party'));
 if(r.tags.length)facts.push(meta('fa-tags','Tags',r.tags.map(E).join(', ')));
 const rewards=rewardText(r.rewards),changed=changedLabel(r.changed,now);
 return `<div class="ag-row agq-card${selected?' is-selected':''}${picked?' is-picked':''}" data-qid="${E(r.id)}"><label class="agq-card__pick"><input type="checkbox" data-pick="${E(r.id)}"${picked?' checked':''}><span class="ag-sr-only">Select ${E(r.name)}</span></label>
 <button type="button" class="agq-card__main" data-action="gm-select" data-id="${E(r.id)}"${selected?' aria-current="true"':''}>
 <span class="agq-card__head"><span class="ag-row__title">${E(r.name)}</span><span class="agq-card__badges"><span class="ag-badge agq-kind agq-kind--${E(r.kind)}">${icon(KIND_ICON[r.kind]||'fa-scroll')}${E(r.kindLabel)}${r.detail?` · ${E(r.detail)}`:''}</span>${r.level!==null?`<span class="ag-badge">Level ${r.level}</span>`:''}${statusBadge(r.chip)}${vis}</span></span>
 <span class="agq-card__facts">${facts.join('')}</span>
 <span class="agq-card__stats">${progressMeter(r.done,r.total)}${rewards?meta('fa-gift','Rewards',rewards):''}${changed?`<span class="agq-card__fact agq-card__changed">${icon('fa-clock')}Changed ${E(changed)}</span>`:''}</span></button></div>`;
}
/** GM Quests list: cards grouped under eyebrow headings with counts. */
export function questCards(groups,selectedId,{total=null,picked=new Set(),now=Date.now()}={}){
 if(!groups.length)return total===0
  ?emptyState('No quests yet','Create one with New quest, or import quest files with General Manager.',{action:safeButton('New quest','new',{sm:true,icon:'fa-plus'})})
  :emptyState('Nothing matches','Change the view, search or filters to see more quests.',{iconName:'fa-magnifying-glass',action:safeButton('Clear filters','clear-filters',{sm:true,kind:'ghost'})});
 return groups.map(g=>`<section class="agq-group"><h3 class="ag-eyebrow agq-group__head">${E(g.label)} <span class="agq-group__count">${g.rows.length}</span></h3><div class="ag-rows">${g.rows.map(r=>questCard(r,{selected:selectedId===r.id,picked:picked.has(r.id),now})).join('')}</div></section>`).join('');
}
/** Sub-views with counts, directly under the tab strip. */
export function questsSubnav(nav,counts={}){
 return `<div class="ag-segmented agq-subnav" role="radiogroup" aria-label="Quest views">${SUBVIEWS.map(v=>`<button type="button" role="radio" data-qv-nav="${E(v.key)}" aria-checked="${nav===v.key}" tabindex="${nav===v.key?0:-1}"${tip(v.hint)}>${E(v.label)}<span class="ag-tab__count">${E(counts[v.key]??0)}</span></button>`).join('')}</div>`;
}
/** Toolbar, one row: search, Filters (n), Group, Sort, count, New quest. Type, Location and Visible sit in the second row that
    Filters (n) opens (0.17.0, QL-05). */
export function questsToolbar(view,locations,{shown=0,total=0,filtersOpen=false,levels=[],regions=[],givers=[]}={}){
 const v={...DEFAULT_VIEW,...view},n=filterCount(v);
 return `<div class="agq-bars"><div class="ag-toolbar agq-toolbar"><label class="ag-search">${icon('fa-magnifying-glass')}<input type="search" id="ag-gm-search" placeholder="Search quests" aria-label="Search quests by title, location, giver or source, or tag" value="${E(v.search)}"></label>
 <div class="ag-toolbar__filters"><button type="button" class="ag-btn ag-btn--sm" data-action="toggle-filters" id="ag-gm-filters-toggle" aria-expanded="${filtersOpen}" aria-controls="ag-gm-filters">${icon('fa-filter')} <span data-filter-label>${filterLabel(n)}</span></button>
 <select id="ag-gm-group" aria-label="Group by">${options(GROUPS.map(([k,n])=>[k,k==='none'?n:`Group: ${n}`]),v.group)}</select>
 <select id="ag-gm-sort" aria-label="Sort">${options(SORTS.map(([k,n])=>[k,`Sort: ${n}`]),v.sort)}</select></div>
 <span class="ag-toolbar__count" id="ag-gm-count">${shown} of ${total} quests</span>
 <div class="ag-toolbar__end">${safeButton('New quest','new',{icon:'fa-plus'})}</div></div>
 <div class="ag-toolbar agq-filterrow" id="ag-gm-filters" role="group" aria-label="Filters"${filtersOpen?'':' hidden'}><div class="ag-toolbar__filters"><select id="ag-gm-type" aria-label="Type">${options([['all','All types'],...Object.entries(KIND_LABELS)],v.type)}</select>
 <select id="ag-gm-location" aria-label="Location">${options([['all','Any location'],...locations.map(x=>Array.isArray(x)?x:[x,x])],v.location)}</select>
 <select id="ag-gm-level" aria-label="Level">${options([['all','Any level'],...levels],v.level)}</select>
 <select id="ag-gm-region" aria-label="Region">${options([['all','Any region'],...regions],v.region)}</select>
 <select id="ag-gm-giver" aria-label="Giver">${options([['all','Any giver'],...givers],v.giver)}</select>
 <select id="ag-gm-visible" aria-label="Visible to players">${options([['all','Visible or not'],['yes','Visible to players'],['no','GM only']],v.visible)}</select></div>
 ${safeButton('Clear filters','clear-filters',{sm:true,kind:'ghost'})}</div></div>`;
}
export const filterLabel=n=>n?`Filters (${n})`:'Filters';
/** Bulk actions: a full-width row under the toolbar once quests are ticked (hidden until then). */
export function bulkBar(count,shown){
 if(!count)return '<div class="agq-bulk" id="ag-gm-bulk" role="group" aria-label="Bulk actions" hidden></div>';
 return `<div class="agq-bulk" id="ag-gm-bulk" role="group" aria-label="Bulk actions"><span class="agq-bulk__count" role="status">${count} selected</span>${safeButton(`Select all ${shown} shown`,'bulk-all',{sm:true,kind:'ghost'})}${safeButton('Clear','bulk-clear',{sm:true,kind:'ghost'})}
 <span class="agq-bulk__actions"><label class="agq-bulk__status"><span class="ag-sr-only">New status</span><select id="ag-bulk-status">${options([['','Set status…'],...STATUSES.map(s=>[s,s])],'')}</select></label>${safeButton('Apply','bulk-status',{sm:true})}
 ${safeButton('Hide','bulk-hide',{sm:true,icon:'fa-eye-slash',title:'Hide the selected quests from players'})}${safeButton('Reveal','bulk-reveal',{sm:true,icon:'fa-eye',title:'Reveal the selected quests to their audience. Drafts stay GM only.'})}${safeButton('Duplicate','bulk-duplicate',{sm:true,icon:'fa-copy',title:'Make a GM-only draft copy of each selected quest'})}${safeButton('Delete','bulk-delete',{sm:true,kind:'danger',icon:'fa-trash'})}</span></div>`;
}
/** The hint line that stays in the list column: how to start a bulk change, or how many are ticked. */
export function bulkHint(count,shown){
 if(count)return `<div class="agq-bulk agq-bulk--idle" id="ag-gm-bulkhint"><span class="ag-field__hint">${count} selected: bulk actions are above the list.</span></div>`;
 return `<div class="agq-bulk agq-bulk--idle" id="ag-gm-bulkhint"><span class="ag-field__hint">Tick quests to change several at once.</span>${shown?safeButton(`Select all ${shown} shown`,'bulk-all',{sm:true,kind:'ghost'}):''}</div>`;
}
/** Quest Log's own importer, demoted under General Manager's (decision QL-13): a fold at the end of the list column. */
export function questsAdvanced(){
 return fold({key:'quests-import',title:'Advanced: import here, or use General Manager',body:`<p class="ag-field__hint">General Manager's importer is the usual way to bring in quest files. Import here shows what a file adds first; quests already in this world are kept as they are.</p>
 <div class="ag-btn-group">${fileButton({label:'Import JSON…',accept:'.json,application/json',className:'ag-btn ag-btn--sm'})}${safeButton('Export JSON','export',{sm:true,icon:'fa-file-export',title:'Download every quest source as a JSON file'})}</div>`});
}
/** A collapsible editor section (the kit's fold); its open state is kept per user in the gmView flag (data-section). */
export function editorSection(key,title,body,{open=true,summary=''}={}){
 return fold({title,hint:summary||undefined,open,body}).replace('<details class="ag-fold"',`<details class="ag-fold agq-sec" data-section="${E(key)}"`);
}
/** GM Setup: settings only, saved together by the footer's Save Changes (Player Access included, decision D4). */
export function setupPanel({playerAccess,packIds,openForPlayers=false}){
 return `<div class="agq-setup"><div class="agq-setup__body ag-scroll ag-pad" data-ag-scroll="setup">
 <section class="ag-section"><div class="ag-section__head"><h3 class="ag-section__title">Player access</h3></div>
 <label class="ag-field ag-field--inline"><input type="checkbox" id="ag-player-access" ${playerAccess?'checked':''}> Show Quest Log to players</label>
 <p class="ag-field__hint">Controls the player window only, not which quests they see. Reveal each quest from the Quests tab.</p>
 <p class="ag-field__hint">The Journal tab also follows Character Hub's Quests visibility, when Character Hub is active.</p></section>
 <section class="ag-section"><div class="ag-section__head"><h3 class="ag-section__title">Players' screens</h3></div>
 <label class="ag-field ag-field--inline"><input type="checkbox" id="ag-open-for-players" ${openForPlayers?'checked':''}> Open the Quest Log for players when a quest is revealed to them</label>
 <p class="ag-field__hint">Off by default: assigning, revealing or completing a quest, or giving rewards, opens nothing on players' screens. When on, a newly revealed quest opens the player's Quest Log window at that quest (never a journal page).</p></section>
 <section class="ag-section"><div class="ag-section__head"><h3 class="ag-section__title">Compendium packs</h3></div>
 <label class="ag-field">Compendium pack IDs<input id="ag-compendium-packs" value="${E(packIds||'')}" placeholder="world.my-quests"><span class="ag-field__hint">Optional read-only quest definitions, not player quests. Leave blank unless you use a quest compendium. Reload Foundry after changing.</span></label></section></div>
 <footer class="ag-footer">${safeButton('Cancel','cancel-setup',{kind:'ghost'})}<span class="ag-footer__status" role="status"></span>${safeButton('Save Changes','save-setup',{kind:'primary'})}</footer></div>`;
}
