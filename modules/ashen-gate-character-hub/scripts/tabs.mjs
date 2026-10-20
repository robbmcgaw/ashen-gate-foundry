/** Combat, Inventory (with the equipment paper doll), Magic, Features and Rest views. */
import {esc} from './constants.mjs';
import {btn} from './buttons.mjs';
import {inventoryData, combatData, spellsData, featuresData, equipmentLayout, equipChoices, SLOTS} from './items.mjs';
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
function dollHtml(ctx) {
  const {actor, editable, sheet} = ctx, off = !editable, layout = equipmentLayout(actor);
  const token = sheet?.dollArt === 'token';
  const art = token ? (actor.prototypeToken?.texture?.src || actor.img) : actor.img;
  const moveSelect = row => `<select data-edit="item-slot" data-id="${esc(row.id)}" aria-label="Move ${esc(row.name)} to"${off ? ' disabled' : ''}><option value="">Move to…</option>${SLOTS.map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join('')}<option value="">Automatic</option></select>`;
  const box = s => {
    if (s.item) return `<div class="agch-slot is-filled" data-slot="${s.id}"><span class="agch-slot__label">${esc(s.label)}</span>
      <button type="button" class="agch-slot__item" data-action="item-sheet" data-id="${esc(s.item.id)}" data-ag-always title="Open ${esc(s.item.name)}"><img src="${esc(s.item.img)}" alt=""><span>${esc(s.item.name)}</span></button>
      ${s.item.attuned ? '<span class="ag-badge ag-badge--accent">Attuned</span>' : ''}
      <span class="agch-slot__controls">${btn('item-unequip', 'Unequip', {kind: 'sm', data: {id: s.item.id}, disabled: off})}${moveSelect(s.item)}</span></div>`;
    const choices = equipChoices(actor, s.id);
    return `<div class="agch-slot" data-slot="${s.id}"><span class="agch-slot__label">${esc(s.label)}</span>
      ${choices.length ? `<select data-edit="equip-slot" data-slot="${s.id}" aria-label="Equip into ${esc(s.label)}"${off ? ' disabled' : ''}><option value="">Equip…</option>${choices.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select>` : '<span class="agch-muted">Empty</span>'}</div>`;
  };
  const by = id => box(layout.slots.find(s => s.id === id));
  const other = layout.other.length ? `<h4 class="agch-subheading">Other equipped</h4><ul class="ag-list agch-items">${layout.other.map(r => itemLine(r, `${btn('item-unequip', 'Unequip', {kind: 'sm', data: {id: r.id}, disabled: off})}${moveSelect(r)}`)).join('')}</ul>` : '';
  return `<section class="agch-doll" aria-label="Equipment">
    <div class="agch-doll__col">${['head', 'neck', 'back', 'body', 'ring1', 'ring2'].map(by).join('')}</div>
    <div class="agch-doll__art"><img src="${esc(art)}" alt="${esc(actor.name)}">${btn('doll-art', token ? 'Show portrait' : 'Show token art', {kind: 'sm', always: true})}</div>
    <div class="agch-doll__col">${['mainhand', 'offhand', 'hands', 'waist', 'feet', 'trinket'].map(by).join('')}</div>
  </section>${other}<p class="agch-muted agch-hint">Boxes are a display only: dnd5e has no worn-slot rules, so nothing limits what goes where. "Move to…" changes only where an item shows.</p>`;
}

function inventoryTab(ctx) {
  const {actor, editable} = ctx, off = !editable, d = inventoryData(actor);
  const currency = `<div class="agch-currency" role="group" aria-label="Currency">${d.currency.map(c => `<label class="agch-coin"><span>${esc(c.abbr)}</span><input type="number" min="0" step="1" data-edit="currency" data-key="${esc(c.key)}" value="${c.value}" aria-label="${esc(c.label)}"${off ? ' disabled' : ''}></label>`).join('')}</div>`;
  const controls = r => [
    r.usable && r.type === 'consumable' ? useBtn(r, off) : '',
    `<span class="agch-qty">${btn('item-qty', '', {kind: 'sm', icon: 'fa-solid fa-minus', data: {id: r.id, step: -1}, title: `One fewer ${r.name}`, disabled: off || r.quantity <= 0})}<input type="number" min="0" step="1" data-edit="item-qty" data-id="${esc(r.id)}" value="${r.quantity}" aria-label="${esc(r.name)} quantity"${off ? ' disabled' : ''}>${btn('item-qty', '', {kind: 'sm', icon: 'fa-solid fa-plus', data: {id: r.id, step: 1}, title: `One more ${r.name}`, disabled: off})}</span>`,
    r.equippable ? btn(r.equipped ? 'item-unequip' : 'item-equip', r.equipped ? 'Unequip' : 'Equip', {kind: r.equipped ? 'primary' : 'sm', data: {id: r.id}, disabled: off}) : '',
    r.canAttune ? btn('item-attune', r.attuned ? 'Unattune' : 'Attune', {kind: 'sm', data: {id: r.id, attuned: r.attuned ? 0 : 1}, title: r.attunement === 'optional' ? 'Attunement optional' : 'Requires attunement', disabled: off}) : ''
  ].join('');
  const list = rows => `<ul class="ag-list agch-items">${rows.map(r => itemLine(r, controls(r)) + (r.contents?.length ? `<li class="agch-contents"><ul class="ag-list agch-items">${r.contents.map(c => itemLine(c, controls(c))).join('')}</ul></li>` : '')).join('')}</ul>`;
  const groups = d.groups.map(g => `<h3 class="agch-heading">${esc(g.label)}</h3>${list(g.items)}`).join('') || empty('No items.');
  return `<div class="agch-toolbar"><span class="ag-badge${d.attunement.value > d.attunement.max ? ' ag-badge--danger' : ''}" title="Attuned items">Attuned ${d.attunement.value} / ${d.attunement.max}</span>${currency}</div>
    <h3 class="agch-heading">Equipment</h3>${dollHtml(ctx)}${groups}`;
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

// ---------- Rest ----------
function restTab({actor, editable}) {
  const off = !editable, h = headerData(actor);
  return `<div class="agch-rest">
    <div class="ag-card"><h3>Short Rest</h3><p class="agch-muted">Spend hit dice${h.hd ? ` (${h.hd.value} / ${h.hd.max} left)` : ''} and recover short-rest uses.</p>${btn('rest', 'Short Rest', {kind: 'primary', icon: 'fa-solid fa-mug-hot', data: {type: 'short'}, disabled: off})}</div>
    <div class="ag-card"><h3>Long Rest</h3><p class="agch-muted">Recover hit points, hit dice, spell slots and long-rest uses.</p>${btn('rest', 'Long Rest', {kind: 'primary', icon: 'fa-solid fa-campground', data: {type: 'long'}, disabled: off})}</div>
  </div><p class="agch-muted agch-hint">Both open dnd5e's own rest dialog.</p>`;
}

export const ITEM_TABS = [
  {id: 'combat', label: 'Combat', icon: 'fa-solid fa-khanda', render: combatTab},
  {id: 'inventory', label: 'Inventory', icon: 'fa-solid fa-sack', render: inventoryTab},
  {id: 'magic', label: 'Magic', icon: 'fa-solid fa-wand-sparkles', render: magicTab},
  {id: 'features', label: 'Features', icon: 'fa-solid fa-star', render: featuresTab},
  {id: 'rest', label: 'Rest', icon: 'fa-solid fa-bed', render: restTab}
];
