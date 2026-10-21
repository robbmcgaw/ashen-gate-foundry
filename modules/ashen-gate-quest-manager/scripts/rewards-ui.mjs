// Item rewards markup (GM editor section and player "Rewards" list). No Foundry globals, so it can be tested.
import {cleanText as E} from './core.mjs';
import {safeButton,options,emptyState} from './gm-panels.mjs';

const FALLBACK_IMG='icons/svg/item-bag.svg';
const tip=t=>` data-tooltip="${E(t)}" data-tooltip-class="ag-tooltip"`;
const SHOWN=[['on_complete',"After it's completed"],['shown','While the quest is visible'],['gm','Never (GM only)']];
const GOES=[['chosen','One character (chosen when granting)'],['each','Each character'],['split','Split between characters']];
const img=src=>`<img class="agq-reward__img" src="${E(src||FALLBACK_IMG)}" alt="">`;

function itemCell(r){
 const id=r.itemId?`<span class="agq-mono">${E(r.itemId)}</span>`
  :`<span class="ag-badge"${tip('No permanent id: this reward is tied to this world. It will not follow the item into another world or a reimport.')}>No permanent id</span>`;
 return `<span class="agq-reward__item">${img(r.img)}<span class="agq-reward__text"><span class="agq-reward__name">${E(r.name)}</span>${id}</span></span>`;
}
function statusCell(r){
 if(r.status==='missing'||r.status==='conflict')return `<span class="ag-badge ag-badge--danger"${tip(r.reason||'Missing')}>${r.status==='conflict'?'Conflict':'Missing'}</span>`;
 return '';
}
function rewardRow(r,{individual}){
 const label=E(r.name);
 const goes=individual
  ?`<select data-reward-field="recipient" aria-label="Goes to: ${label}" disabled>${options(GOES,r.recipient)}</select><span class="ag-field__hint">Individual quest: goes to its character.</span>`
  :`<select data-reward-field="recipient" aria-label="Goes to: ${label}">${options(GOES,r.recipient)}</select>`;
 return `<tr data-reward-key="${E(r.key)}"><td>${itemCell(r)}</td>
 <td class="is-num"><input type="number" class="agq-reward__qty" data-reward-field="quantity" min="1" step="1" value="${E(r.quantity)}" aria-label="Quantity: ${label}"></td>
 <td><select data-reward-field="visibility" aria-label="Shown to players: ${label}">${options(SHOWN,r.visibility)}</select></td>
 <td>${goes}</td><td>${statusCell(r)}</td>
 <td class="is-actions">${safeButton(`Remove ${r.name}`,'remove-reward',{kind:'danger',sm:true,iconOnly:true,icon:'fa-trash',title:'Remove this reward',data:{key:r.key}})}</td></tr>`;
}
/** GM editor section. rows = api.rewards.list() output; removed rows are not shown. */
export function rewardsSection(rows,{individual=false,status=''}={}){
 const shown=rows.filter(r=>!r.removed);
 const table=shown.length?`<div class="ag-table-wrap"><table class="ag-table agq-rewards__table"><thead><tr><th scope="col">Item</th><th scope="col" class="is-num">Qty</th><th scope="col">Shown to players</th><th scope="col">Goes to</th><th scope="col">Status</th><th scope="col" class="is-actions"><span class="ag-sr-only">Actions</span></th></tr></thead>
 <tbody>${shown.map(r=>rewardRow(r,{individual})).join('')}</tbody></table></div>`
  :emptyState('No item rewards yet','Drop an item here to add it.',{iconName:'fa-gift'});
 return `<section class="agq-rewards ag-section" data-reward-zone><div class="ag-section__head"><h3 class="ag-section__title">Item rewards</h3><span class="ag-field__hint" role="status" data-reward-status>${E(status)}</span></div>
 ${table}
 <div class="agq-reward-drop"><i class="fa-solid fa-gift" aria-hidden="true"></i> <span>Drop items here: from a character or NPC sheet, a compendium or the Items sidebar.</span></div></section>`;
}
/** Player reading view: only what publicView let through (name, img, quantity). Nothing when the list is empty. */
export function playerRewardsSection(rewards){
 if(!Array.isArray(rewards)||!rewards.length)return '';
 return `<section class="ag-section agq-rewards-view"><div class="ag-section__head"><h3 class="ag-section__title">Rewards</h3></div><ul class="ag-rows">${rewards.map(r=>`<li class="ag-row">${img(r.img)}<span class="ag-row__main"><span class="ag-row__title">${E(r.name)}</span></span><span class="ag-row__end">× ${E(r.quantity)}</span></li>`).join('')}</ul></section>`;
}
