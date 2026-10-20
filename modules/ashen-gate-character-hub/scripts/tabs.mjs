/** Combat, Inventory (character or party stash), Magic and Features views. The paper doll and rests are in character.mjs. */
import {esc} from './constants.mjs';
import {btn} from './buttons.mjs';
import {inventoryData, combatData, spellsData, featuresData} from './items.mjs';
import {partyStashHtml, partyStashUsable} from './partners.mjs';
import {headerData} from './data.mjs';

const empty = text => `<p class="ag-empty">${esc(text)}</p>`;
const pips = (value, max) => `${value} / ${max}`;

/** One item line: icon, name (opens its sheet), badges, then the given controls. */
export function itemLine(row, controls = '', {badges = ''} = {}) {
  const uses = row.uses ? `<span class="ag-badge" title="Uses">${pips(row.uses.value, row.uses.max)}</span>` : '';
  const qty = row.quantity > 1 ? `<span class="ag-badge" title="Quantity">×${row.quantity}</span>` : '';
  const att = row.attuned ? '<span class="ag-badge ag-badge--accent" title="Attuned"><i class="fa-solid fa-sun" aria-hidden="true"></i> Attuned</span>' : '';
  return `<li class="agch-item${row.equipped ? ' is-equipped' : ''}" data-item-id="${esc(row.id)}">
    <img class="agch-item__img" src="${esc(row.img)}" alt="">
    <button type="button" class="agch-item__name" data-action="item-sheet" data-id="${esc(row.id)}" data-ag-always title="Open ${esc(row.name)}">${esc(row.name)}</button>
    <span class="agch-item__badges">${qty}${uses}${att}${badges}</span><span class="agch-item__controls">${controls}</span></li>`;
}
const useBtn = (row, off) => row.usable ? btn('item-use', 'Use', {kind: 'sm', icon: 'fa-solid fa-dice-d20', data: {id: row.id}, title: `Use ${row.name}`, disabled: off}) : '';

// ---------- Combat ----------
function combatTab({actor, editable}) {
  const off = !editable, d = combatData(actor), h = headerData(actor);
  const top = `<div class="agch-toolbar">${btn('roll-initiative', 'Roll initiative', {icon: 'fa-solid fa-bolt', disabled: off})}
    ${h.hp.value <= 0 ? btn('roll-death', 'Death save', {kind: 'danger', icon: 'fa-solid fa-skull', disabled: off}) : ''}</div>`;
  const weapons = d.weapons.length ? `<ul class="ag-list agch-items">${d.weapons.map(w => itemLine(w, useBtn(w, off), {badges: w.equipped ? '' : '<span class="ag-badge">Not equipped</span>'})).join('')}</ul>` : empty('No weapons.');
  const groups = d.groups.map(g => `<h3 class="agch-heading">${esc(g.label)}</h3><ul class="ag-list agch-items">${g.items.map(r => itemLine(r, useBtn(r, off))).join('')}</ul>`).join('');
  return `${top}<h3 class="agch-heading">Weapons</h3>${weapons}${groups}
    <p class="agch-muted agch-hint">Use opens dnd5e's own usage dialog: attacks, damage, targets and resource use happen there.</p>`;
}

// ---------- Inventory ----------
function inventoryTab(ctx) {
  const {actor, editable} = ctx, off = !editable, d = inventoryData(actor), toParty = partyStashUsable();
  const currency = `<div class="agch-currency agch-coins" role="group" aria-label="Currency">${d.currency.map(c => `<label class="agch-coin"><span>${esc(c.abbr)}</span><input type="number" min="0" step="1" data-edit="currency" data-key="${esc(c.key)}" value="${c.value}" aria-label="${esc(c.label)}"${off ? ' disabled' : ''}></label>`).join('')}</div>`;
  const controls = r => [
    r.usable && r.type === 'consumable' ? useBtn(r, off) : '',
    `<span class="agch-qty">${btn('item-qty', '', {kind: 'sm', icon: 'fa-solid fa-minus', data: {id: r.id, step: -1}, title: `One fewer ${r.name}`, disabled: off || r.quantity <= 0})}<input type="number" min="0" step="1" data-edit="item-qty" data-id="${esc(r.id)}" value="${r.quantity}" aria-label="${esc(r.name)} quantity"${off ? ' disabled' : ''}>${btn('item-qty', '', {kind: 'sm', icon: 'fa-solid fa-plus', data: {id: r.id, step: 1}, title: `One more ${r.name}`, disabled: off})}</span>`,
    r.equippable ? btn(r.equipped ? 'item-unequip' : 'item-equip', r.equipped ? 'Unequip' : 'Equip', {kind: r.equipped ? 'primary' : 'sm', data: {id: r.id}, disabled: off}) : '',
    r.canAttune ? btn('item-attune', r.attuned ? 'Unattune' : 'Attune', {kind: 'sm', data: {id: r.id, attuned: r.attuned ? 0 : 1}, title: r.attunement === 'optional' ? 'Attunement optional' : 'Requires attunement', disabled: off}) : '',
    toParty ? btn('item-deposit', '', {kind: 'sm', icon: 'fa-solid fa-people-carry-box', data: {id: r.id}, title: `Move ${r.name} to the party stash`, disabled: off}) : ''
  ].join('');
  const list = rows => `<ul class="ag-list agch-items">${rows.map(r => itemLine(r, controls(r)) + (r.contents?.length ? `<li class="agch-contents"><ul class="ag-list agch-items">${r.contents.map(c => itemLine(c, controls(c))).join('')}</ul></li>` : '')).join('')}</ul>`;
  const groups = d.groups.map(g => `<h3 class="agch-heading">${esc(g.label)}</h3>${list(g.items)}`).join('') || empty('No items.');
  return `${currency}${groups}
    <p class="agch-muted agch-hint">Equipped items also show in the slots around the portrait.${toParty ? ' <i class="fa-solid fa-people-carry-box" aria-hidden="true"></i> moves an item to the party stash; take items back from Party stash.' : ''}</p>`;
}

/** Inventory: this character's items, or (toggle) the Utilities party stash and purse. */
function inventoryShell(ctx) {
  const party = ctx.sheet?.invView === 'party', d = party ? null : inventoryData(ctx.actor);
  const seg = (view, label) => `<button type="button" data-action="inv-view" data-view="${view}" data-ag-always aria-pressed="${(view === 'party') === party}">${esc(label)}</button>`;
  const filter = ctx.sheet?.filter ?? '';
  return `<div class="agch-toolbar"><div class="agch-seg" role="group" aria-label="Whose items">${seg('character', 'Character')}${seg('party', 'Party stash')}</div>
    <input type="search" class="agch-search" data-filter placeholder="Search items" aria-label="Search items" value="${esc(filter)}" data-ag-always>
    ${d ? `<span class="ag-badge${d.attunement.value > d.attunement.max ? ' ag-badge--danger' : ''}" title="Attuned items">Attuned ${d.attunement.value} / ${d.attunement.max}</span>` : ''}</div>
    ${party ? partyStashHtml(ctx.actor) : inventoryTab(ctx)}`;
}

// ---------- Magic ----------
function magicTab({actor, editable}) {
  const off = !editable, d = spellsData(actor);
  if (!d.levels.length && !d.pact) return empty('No spells.');
  const prep = s => s.always ? '<span class="ag-badge" title="Always prepared">Always</span>'
    : s.canPrepare ? btn('spell-prepare', s.prepared ? 'Prepared' : 'Prepare', {kind: s.prepared ? 'primary' : 'sm', data: {id: s.id}, title: s.prepared ? 'Unprepare' : 'Prepare', disabled: off}) : '';
  const pact = d.pact ? `<h3 class="agch-heading">Pact Magic <span class="ag-badge">Level ${d.pact.level} · ${pips(d.pact.value, d.pact.max)} slots</span></h3>` : '';
  return pact + d.levels.map(l => `<h3 class="agch-heading">${esc(l.label)}${l.slots ? ` <span class="ag-badge" title="Slots left">${pips(l.slots.value, l.slots.max)} slots</span>` : ''}</h3>
    ${l.spells.length ? `<ul class="ag-list agch-items">${l.spells.map(s => itemLine(s, `${prep(s)}${btn('item-use', 'Cast', {kind: 'sm', icon: 'fa-solid fa-wand-sparkles', data: {id: s.id}, title: `Cast ${s.name}`, disabled: off})}`)).join('')}</ul>` : empty('No spells at this level.')}`).join('')
    + '<p class="agch-muted agch-hint">Cast opens dnd5e\'s casting dialog (slot level, upcasting and consumption). Full spell preparation is on the native sheet.</p>';
}

// ---------- Features ----------
function featuresTab({actor, editable}) {
  const off = !editable, d = featuresData(actor);
  const identity = d.identity.length ? `<ul class="ag-list agch-items">${d.identity.map(r => itemLine(r, '', {badges: `<span class="ag-badge">${esc(r.detail)}</span>`})).join('')}</ul>` : '';
  const groups = d.groups.map(g => `<h3 class="agch-heading">${esc(g.label)}</h3><ul class="ag-list agch-items">${g.items.map(r => itemLine(r, useBtn(r, off))).join('')}</ul>`).join('');
  return (identity ? `<h3 class="agch-heading">Class, Species &amp; Background</h3>${identity}` : '') + (groups || empty('No features.'))
    + '<p class="agch-muted agch-hint">Level up and advancement choices are on the native sheet.</p>';
}

export const ITEM_TABS = [
  {id: 'combat', label: 'Combat', icon: 'fa-solid fa-khanda', render: combatTab},
  {id: 'inventory', label: 'Inventory', icon: 'fa-solid fa-sack', render: inventoryShell},
  {id: 'magic', label: 'Magic', icon: 'fa-solid fa-wand-sparkles', render: magicTab},
  {id: 'features', label: 'Features', icon: 'fa-solid fa-star', render: featuresTab}
];
