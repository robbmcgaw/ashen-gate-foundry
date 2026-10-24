// Item rewards markup (GM editor section and player "Rewards" list). No Foundry globals, so it can be tested.
import {cleanText as E,rewardLabel} from './core.mjs';
import {safeButton,options,emptyState} from './gm-panels.mjs';

const FALLBACK_IMG='icons/svg/item-bag.svg';
const tip=t=>` data-tooltip="${E(t)}" data-tooltip-class="ag-tooltip"`;
const SHOWN=[['on_complete',"After it's completed"],['shown','While the quest is visible'],['gm','Never (GM only)']];
const GOES=[['chosen','One character (chosen when granting)'],['each','Each character'],['split','Split between characters']];
const img=src=>`<img class="agq-reward__img" src="${E(src||FALLBACK_IMG)}" alt="">`;

const noteHint=r=>r.note?`<span class="ag-field__hint">${E(r.note)}</span>`:'';
// An item that cannot be found has only its permanent id for a name: it reads "Item not found" instead (ids stay out of the UI).
const named=rows=>rows.map(r=>({...r,name:rewardLabel(r,'Item not found')}));
function itemCell(r){
 const id=r.itemId?'':`<span class="ag-badge"${tip('No permanent id: this reward is tied to this world. It will not follow the item into another world or a reimport.')}>No permanent id</span>`;
 return `<span class="agq-reward__item">${img(r.img)}<span class="agq-reward__text"><span class="agq-reward__name">${E(r.name)}</span>${id}${noteHint(r)}</span></span>`;
}
function statusCell(r){
 if(r.gone)return `<span class="ag-badge"${tip('Given before, then taken out of the quest file on reimport. The grant history is kept.')}>No longer in the quest</span>`;
 if(r.status==='missing'||r.status==='conflict')return `<span class="ag-badge ag-badge--danger"${tip(r.reason||'Missing')}>${r.status==='conflict'?'Conflict':'Missing'}</span>`;
 if(r.givenNames?.length)return `<span class="ag-badge ag-badge--ok agq-given">Given to ${E(r.givenNames.join(', '))}</span>`;
 return r.givenNames?'<span class="ag-badge">Not yet</span>':'';
}
// 0.17.0 Four columns (QL-06): Shown to players and Goes to sit under the item name, each with its own label.
function rewardRow(r,{individual}){
 const label=E(r.name);
 const goes=individual
  ?`<label class="ag-field">Goes to<select data-reward-field="recipient" aria-label="Goes to: ${label}" disabled>${options(GOES,r.recipient)}</select><span class="ag-field__hint">Individual quest: goes to its character.</span></label>`
  :`<label class="ag-field">Goes to<select data-reward-field="recipient" aria-label="Goes to: ${label}">${options(GOES,r.recipient)}</select></label>`;
 const drag=r.status==='ok'&&r.uuid&&!r.gone?' draggable="true" data-reward-drag':'';
 return `<tr data-reward-key="${E(r.key)}"${drag}><td>${itemCell(r)}<div class="agq-reward__opts"><label class="ag-field">Shown to players<select data-reward-field="visibility" aria-label="Shown to players: ${label}">${options(SHOWN,r.visibility)}</select></label>${goes}</div></td>
 <td class="is-num"><input type="number" class="agq-reward__qty" data-reward-field="quantity" min="1" step="1" value="${E(r.quantity)}" aria-label="Quantity: ${label}"></td>
 <td>${statusCell(r)}</td>
 <td class="is-actions">${r.givenNames?.length&&!r.gone?safeButton('Grant again','grant-again',{sm:true,data:{key:r.key},title:'Give this reward once more'}):''}${safeButton(`Remove ${r.name}`,'remove-reward',{kind:'danger',sm:true,iconOnly:true,icon:'fa-trash',title:'Remove this reward',data:{key:r.key}})}</td></tr>`;
}
/** GM editor section. rows = api.rewards.list() output; removed rows are not shown. Its edits save at once (Applies now). */
export function rewardsSection(rows,{individual=false,status='',grantHtml='',canGive=false}={}){
 const shown=named(rows.filter(r=>!r.removed));
 const table=shown.length?`<div class="ag-table-wrap"><table class="ag-table agq-rewards__table"><thead><tr><th scope="col">Item</th><th scope="col" class="is-num">Qty</th><th scope="col">Status</th><th scope="col" class="is-actions"><span class="ag-sr-only">Actions</span></th></tr></thead>
 <tbody>${shown.map(r=>rewardRow(r,{individual})).join('')}</tbody></table></div>`
  :emptyState('No item rewards yet','Drop an item here to add it.',{iconName:'fa-gift'});
 return `<section class="agq-rewards ag-section" data-reward-zone><div class="ag-section__head"><h3 class="ag-section__title">Item rewards</h3><span class="ag-badge">Applies now</span><span class="ag-field__hint" role="status" data-reward-status>${E(status)}</span>${canGive&&!grantHtml?safeButton('Give rewards','open-grant',{icon:'fa-gift'}):''}</div>
 ${table}${grantHtml}
 <div class="agq-reward-drop"><i class="fa-solid fa-gift" aria-hidden="true"></i> <span>Drop items here: from a character or NPC sheet, a compendium or the Items sidebar.</span></div></section>`;
}
/** Player reading view: only what publicView let through (name, img, quantity). Nothing when the list is empty. */
export function playerRewardsSection(rewards){
 if(!Array.isArray(rewards)||!rewards.length)return '';
 return `<section class="ag-section agq-rewards-view"><div class="ag-section__head"><h3 class="ag-section__title">Rewards</h3></div><ul class="ag-rows">${rewards.map(r=>`<li class="ag-row">${img(r.img)}<span class="ag-row__main"><span class="ag-row__title">${E(r.name)}</span></span><span class="ag-row__end">× ${E(r.quantity)}</span></li>`).join('')}</ul></section>`;
}

/* ---- 0.12.0: Give rewards panel. choices: {[rewardKey]: {give, actorId | actorIds | split:{[actorId]: n}}} ---- */
const owedParty=r=>r.party.filter(p=>!p.given);
/** The panel's starting choices: every grantable row ticked; each = every character still owed; chosen and split empty. */
export function defaultChoices(rows){
 const out={};
 for(const r of rows)out[r.key]={give:r.grantable,actorId:'',actorIds:owedParty(r).map(p=>p.id),split:{}};
 return out;
}
/** What each character will receive, and what stops the grant: {problems:[text], receive:[{name, items:[{name,quantity}]}]}. Pure. */
export function grantSummary(rows,choices,{individual=false}={}){
 rows=named(rows);
 const problems=[],by=new Map();
 const give=(p,r,q)=>{if(!by.has(p.id))by.set(p.id,{name:p.name,items:[]});by.get(p.id).items.push({name:r.name,quantity:q});};
 for(const r of rows){
  const c=choices[r.key];if(!c?.give||!r.grantable)continue;
  if(individual){const p=r.party[0];if(p)give(p,r,r.quantity);continue;}
  if(r.recipient==='each'){const ids=new Set(c.actorIds??[]);const ps=owedParty(r).filter(p=>ids.has(p.id));if(!ps.length)problems.push(`Tick at least one character for ${r.name}.`);ps.forEach(p=>give(p,r,r.quantity));}
  else if(r.recipient==='split'){
   const parts=owedParty(r).map(p=>[p,Number(c.split?.[p.id]??0)]);
   if(parts.some(([,n])=>!Number.isInteger(n)||n<0))problems.push(`Split ${r.name} in whole numbers.`);
   const total=parts.reduce((t,[,n])=>t+(Number.isInteger(n)&&n>0?n:0),0);
   if(total!==r.quantity)problems.push(`${r.name}: ${total} of ${r.quantity} shared.`);
   else parts.filter(([,n])=>n>0).forEach(([p,n])=>give(p,r,n));
  }else{const p=r.party.find(x=>x.id===c.actorId);if(!p)problems.push(`Choose a character for ${r.name}.`);else give(p,r,r.quantity);}
 }
 if(!problems.length&&!by.size)problems.push('Tick at least one reward to give.');
 return {problems,receive:[...by.values()]};
}
export function receiveList(summary){
 if(!summary.receive.length)return '<li>Nobody yet.</li>';
 return summary.receive.map(p=>`<li><strong>${E(p.name)}</strong>: ${p.items.map(i=>`${E(i.quantity)} × ${E(i.name)}`).join(', ')}</li>`).join('');
}
function goesToCell(r,c,individual){
 const label=E(r.name),owed=owedParty(r);
 if(individual)return E(r.party[0]?.name??'The quest\'s character');
 if(!owed.length)return '<span class="ag-field__hint">No characters left to give it to.</span>';
 if(r.recipient==='each')return `<div class="agq-grant__choices">${owed.map(p=>`<label class="ag-field ag-field--inline"><input type="checkbox" data-grant-each value="${E(p.id)}" ${(c.actorIds??[]).includes(p.id)?'checked':''}> ${E(p.name)}</label>`).join('')}</div>`;
 if(r.recipient==='split'){
  const total=owed.reduce((t,p)=>t+(Number(c.split?.[p.id])||0),0);
  return `<div class="agq-grant__choices">${owed.map(p=>`<label class="ag-field ag-field--inline">${E(p.name)} <input type="number" class="agq-reward__qty" data-grant-split="${E(p.id)}" min="0" step="1" value="${E(c.split?.[p.id]??0)}" aria-label="${E(p.name)}: how many ${label}"></label>`).join('')}<span class="ag-field__hint" data-grant-split-status>${total} of ${r.quantity} shared</span></div>`;
 }
 return `<select data-grant-actor aria-label="Character for ${label}"><option value="">Choose a character</option>${options(owed.map(p=>[p.id,p.name]),c.actorId)}</select>`;
}
/** The Give rewards panel (inside Item rewards). rows: grantable() rows still owed. */
export function grantPanel(rows,choices,{individual=false,noParty=false}={}){
  const summary=grantSummary(rows,choices,{individual}),blocked=summary.problems.length>0;
 rows=named(rows);
 const body=rows.map(r=>{const c=choices[r.key]??{};const ok=r.grantable;
  return `<tr data-grant-key="${E(r.key)}" data-recipient="${E(individual?'individual':r.recipient)}"><td><input type="checkbox" data-grant-give ${ok&&c.give?'checked':''} ${ok?'':'disabled'} aria-label="Give ${E(r.name)}"></td>
  <td><span class="agq-reward__item">${img(r.img)}<span class="agq-reward__text"><span class="agq-reward__name">${E(r.name)} × ${E(r.quantity)}</span>${noteHint(r)}${ok?'':`<span class="ag-field__hint">${E(r.reason||'Not available.')}</span>`}</span></span></td>
  <td>${ok?goesToCell(r,c,individual):''}</td></tr>`;}).join('');
 return `<div class="agq-grant" data-grant-panel role="group" aria-labelledby="agq-grant-title"><h4 class="agq-h agq-grant__title" id="agq-grant-title">Give rewards</h4>
 ${noParty?'<p class="ag-notice ag-notice--warn"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> No player owns a character yet, so there is nobody to give party rewards to.</p>':''}
 <div class="ag-table-wrap"><table class="ag-table"><thead><tr><th scope="col"><span class="ag-sr-only">Give</span></th><th scope="col">Item</th><th scope="col">Goes to</th></tr></thead><tbody>${body}</tbody></table></div>
 <h4 class="agq-h">Will receive</h4><ul class="ag-list" data-grant-summary>${receiveList(summary)}</ul>
 <footer class="ag-footer agq-grant__footer">${safeButton('Not now','close-grant',{kind:'ghost'})}<span class="ag-footer__status" role="status" data-grant-status>${E(summary.problems.join(' '))}</span>${safeButton('Grant rewards','grant-rewards',{kind:'primary',disabled:blocked,icon:'fa-gift'})}</footer></div>`;
}
