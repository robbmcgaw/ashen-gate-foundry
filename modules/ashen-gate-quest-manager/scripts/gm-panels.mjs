// GM tab markup that needs no Foundry globals, so it can be tested.
import {cleanText as E,STATUSES} from './core.mjs';
import {CHIPS,KIND_LABELS,SORTS,GROUPS,DEFAULT_VIEW} from './quests-tab.mjs';
export function safeButton(label,action,{disabled=false,kind='',title=''}={}){return `<button type="button" data-action="${E(action)}" class="${E(kind)}" ${disabled?'disabled':''} title="${E(title)}">${E(label)}</button>`;}
export function options(items,value){return items.map(([v,n])=>`<option value="${E(v)}" ${v===value?'selected':''}>${E(n)}</option>`).join('');}
const chipClass=c=>`ag-quest-chip ag-quest-chip--${E(c.toLowerCase())}`;
export function questCards(groups,selectedId){
 if(!groups.length)return '<p class="ag-quest-empty">No matching quests.</p>';
 return groups.map(g=>`<section class="ag-quest-group"><h4>${E(g.label)} <small>(${g.rows.length})</small></h4>${g.rows.map(r=>`<button class="ag-quest-card ${selectedId===r.id?'selected':''}" type="button" data-action="gm-select" data-id="${E(r.id)}"><strong>${E(r.name)}</strong><small>${E(r.id)} · ${E(r.kindLabel)}</small><span class="ag-quest-card-chips"><span class="${chipClass(r.chip)}">${E(r.chip)}</span>${r.visible?'<span class="ag-quest-chip ag-quest-chip--visible">Visible to players</span>':''}</span></button>`).join('')}</section>`).join('');
}
export function questsToolbar(view,locations){
 const v={...DEFAULT_VIEW,...view};
 return `<div class="ag-quest-toolbar">${safeButton('New quest','new',{kind:'primary'})}${safeButton('Import JSON','import',{kind:'secondary'})}${safeButton('Export Sources','export',{kind:'secondary'})}</div>
 <label>Search<input id="ag-gm-search" placeholder="Title, ID, location, text" value="${E(v.search)}"></label>
 <div class="ag-quest-filter-grid">
 <label>Type<select id="ag-gm-type">${options([['all','All types'],...Object.entries(KIND_LABELS)],v.type)}</select></label>
 <label>Status<select id="ag-gm-status">${options([['all','All statuses'],...CHIPS.map(x=>[x,x])],v.status)}</select></label>
 <label>Location<select id="ag-gm-location">${options([['all','Any location'],...locations.map(x=>[x,x])],v.location)}</select></label>
 <label>Visible to players<select id="ag-gm-visible">${options([['all','Either'],['yes','Visible'],['no','Not visible']],v.visible)}</select></label>
 <label>Sort<select id="ag-gm-sort">${options(SORTS,v.sort)}</select></label>
 <label>Group by<select id="ag-gm-group">${options(GROUPS,v.group)}</select></label></div>`;
}
// Settings only: no authoring, import or export lives here.
export function setupPanel({playerAccess,packIds,overlayVisible}){
 return `<div class="ag-quest-setup"><section class="ag-quest-admin"><h3>Player Access</h3><label class="ag-check"><input type="checkbox" id="ag-player-access" ${playerAccess?'checked':''}> Show Quest Log to players</label><p>This controls the player interface, not discovery or individual quest visibility. Use the reveal controls on each quest in the Quests tab.</p>${safeButton('Save Player Access','save-player-access',{kind:'secondary'})}</section>
 <section class="ag-quest-admin"><h3>Tracking overlay</h3><p>The on-screen objectives overlay shows each user's tracked quests. This is your own setting.</p>${safeButton(overlayVisible?'Hide Objectives Overlay':'Show Objectives Overlay','toggle-overlay',{kind:'secondary'})}</section>
 <section class="ag-quest-admin"><h3>Compendium packs</h3><p>Compendium IDs identify optional read-only Objective definitions, not player quests. Leave blank unless you use a custom Quest compendium.</p><label>Compendium pack IDs<input id="ag-compendium-packs" value="${E(packIds||'')}"></label>${safeButton('Save Pack Configuration (reload required)','save-pack-ids',{kind:'secondary'})}</section></div>`;
}
