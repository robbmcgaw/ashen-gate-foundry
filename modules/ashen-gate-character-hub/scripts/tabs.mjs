/**
 * Combat, Inventory (character or party stash), Magic and Features views. Every list is a column-headed list of item
 * cards (cards.mjs). The paper doll, initiative and rests are in character.mjs.
 */
import {esc} from './constants.mjs';
import {btn} from './buttons.mjs';
import {inventoryData, combatData, spellsData, featuresData} from './items.mjs';
import {partyStashHtml, partyStashUsable} from './partners.mjs';
import {headerData} from './data.mjs';
import {canSee, hiddenBadge} from './visibility.mjs';
import {sectionHtml, sectionKey} from './collapse.mjs';
import {cardList, COLUMNS as C, containerLead, containerAttrs} from './cards.mjs';
import {ORGANIZE, listChoice, sortRows, groupRows} from './organize.mjs';
import {favoritesSupported, isFavorite} from './item-actions.mjs';

const empty = text => `<p class="ag-empty">${esc(text)}</p>`;
const pips = (value, max) => `${value} / ${max}`;
const useBtn = (row, off) => row.usable ? btn('item-use', 'Use', {kind: 'sm', icon: 'fa-solid fa-dice-d20', data: {id: row.id}, title: `Use ${row.name}`, disabled: off}) : '';
const attunedBadge = r => r.attuned ? '<span class="ag-badge ag-badge--accent" title="Attuned"><i class="fa-solid fa-sun" aria-hidden="true"></i> Attuned</span>' : '';

/** Search box for a tab (filters rows by name without a re-render; the text is kept per tab). */
const searchBox = (ctx, what) => `<input type="search" class="agch-search" data-filter data-tab="${esc(ctx.tab ?? '')}" placeholder="Search ${esc(what)}" aria-label="Search ${esc(what)}" value="${esc(ctx.sheet?.filters?.[ctx.tab] ?? '')}" data-ag-always>`;
/** Group-by and sort selects for Magic and Features (remembered per user). Observers can use them too. */
function organizeSelects(tab) {
  const o = ORGANIZE[tab], c = listChoice(tab);
  const sel = (field, label, list) => `<label class="agch-orgsel"><span>${label}</span><select data-edit="list-sort" data-tab="${tab}" data-field="${field}" data-ag-always aria-label="${label}">${list.map(([k, l]) => `<option value="${k}"${c[field] === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  return sel('group', 'Group', o.groups) + sel('sort', 'Sort', o.sorts);
}
/** The favourite star (dnd5e's own favourites); nothing when this dnd5e version has none. */
function starBtn(actor, row, off) {
  if (!favoritesSupported(actor)) return '';
  const item = actor.items?.get?.(row.id), on = isFavorite(actor, item);
  return `<button type="button" class="agch-star${on ? ' is-on' : ''}" data-action="item-favorite" data-id="${esc(row.id)}" aria-pressed="${on}" title="${on ? `Remove ${esc(row.name)} from favourites` : `Add ${esc(row.name)} to favourites`}" aria-label="${on ? 'Unfavourite' : 'Favourite'} ${esc(row.name)}"${off ? ' disabled' : ''}><i class="${on ? 'fa-solid' : 'fa-regular'} fa-star" aria-hidden="true"></i></button>`;
}
/** Favourites first, in their own group: the starred rows (they also stay in their normal group). */
function favouritesSection(actor, tab, rows, columns, card, expanded) {
  if (!favoritesSupported(actor)) return '';
  const favs = rows.filter(r => isFavorite(actor, actor.items?.get?.(r.id)));
  return favs.length ? sectionHtml(sectionKey(tab, 'favourites'), `<i class="fa-solid fa-star agch-star__head" aria-hidden="true"></i> Favourites <span class="ag-badge">${favs.length}</span>`, cardList(favs, columns, {card, expanded, listKey: `${tab}-fav`})) : '';
}

// ---------- Combat ----------
function combatTab(ctx) {
  const {actor, editable, sheet} = ctx, off = !editable, d = combatData(actor), h = headerData(actor), expanded = sheet?.expanded;
  const top = `<div class="agch-toolbar">${searchBox(ctx, 'weapons and actions')}
    ${h.hp.value <= 0 ? btn('roll-death', 'Death save', {kind: 'danger', icon: 'fa-solid fa-skull', disabled: off}) : ''}</div>`;
  const weaponCols = [C.damage, C.toHit, C.range, C.properties], actionCols = [C.range, C.damage, C.uses, C.recovery];
  const weapons = d.weapons.length ? cardList(d.weapons, weaponCols, {expanded, listKey: 'combat-weapons',
    card: w => ({controls: useBtn(w, off), badges: `${w.equipped ? '' : '<span class="ag-badge">Not equipped</span>'}${attunedBadge(w)}`})}) : empty('No weapons.');
  const groups = d.groups.map(g => sectionHtml(sectionKey('combat', g.key), esc(g.label), cardList(g.items, actionCols, {expanded, listKey: `combat-${g.key}`, card: r => ({controls: useBtn(r, off)})}))).join('');
  return `${top}${sectionHtml(sectionKey('combat', 'weapons'), 'Weapons', weapons)}${groups}
    <p class="agch-muted agch-hint">Use opens dnd5e's own usage dialog: attacks, damage, targets and resource use happen there. Initiative rolls from the tile on the left.</p>`;
}

// ---------- Inventory ----------
function inventoryTab(ctx) {
  const {actor, editable, sheet} = ctx, off = !editable, d = inventoryData(actor), toParty = partyStashUsable(), expanded = sheet?.expanded;
  const currency = `<div class="agch-currency agch-coins" role="group" aria-label="Currency">${d.currency.map(c => `<label class="agch-coin"><span>${esc(c.abbr)}</span><input type="number" min="0" step="1" data-edit="currency" data-key="${esc(c.key)}" value="${c.value}" aria-label="${esc(c.label)}"${off ? ' disabled' : ''}></label>`).join('')}</div>`;
  const qty = {...C.quantity, render: r => `<span class="agch-qty">${btn('item-qty', '', {kind: 'sm', icon: 'fa-solid fa-minus', data: {id: r.id, step: -1}, title: `One fewer ${r.name}`, disabled: off || r.quantity <= 0})}<input type="number" min="0" step="1" data-edit="item-qty" data-id="${esc(r.id)}" value="${r.quantity}" aria-label="${esc(r.name)} quantity"${off ? ' disabled' : ''}>${btn('item-qty', '', {kind: 'sm', icon: 'fa-solid fa-plus', data: {id: r.id, step: 1}, title: `One more ${r.name}`, disabled: off})}</span>`};
  const columns = [qty, C.weight, C.value, C.uses];
  const controls = r => [
    r.usable && r.type === 'consumable' ? useBtn(r, off) : '',
    r.equippable ? btn(r.equipped ? 'item-unequip' : 'item-equip', r.equipped ? 'Unequip' : 'Equip', {kind: r.equipped ? 'primary' : 'sm', data: {id: r.id}, disabled: off}) : '',
    r.canAttune ? btn('item-attune', r.attuned ? 'Unattune' : 'Attune', {kind: 'sm', data: {id: r.id, attuned: r.attuned ? 0 : 1}, title: r.attunement === 'optional' ? 'Attunement optional' : 'Requires attunement', disabled: off}) : '',
    toParty ? btn('item-deposit', '', {kind: 'sm', icon: 'fa-solid fa-people-carry-box', data: {id: r.id}, title: `Move ${r.name} to the party stash`, disabled: off}) : ''
  ].join('');
  const card = r => ({controls: controls(r), lead: containerLead(r), badges: attunedBadge(r)});
  // A container's contents sit in a folding row under it (fold state shared with headings).
  const after = r => r.contents?.length ? `<li class="agch-contents"${containerAttrs(r)}>${cardList(r.contents, columns, {card, expanded, listKey: `inv-${r.id}`})}</li>` : '';
  const groups = d.groups.map(g => sectionHtml(sectionKey('inventory', g.type), esc(g.label), cardList(g.items, columns, {card, after, expanded, listKey: `inv-${g.type}`}))).join('') || empty('No items.');
  return `${currency}${groups}
    <p class="agch-muted agch-hint">Equipped items also show in the slots around the portrait.${toParty ? ' <i class="fa-solid fa-people-carry-box" aria-hidden="true"></i> moves an item to the party stash; take items back from Party stash.' : ''}</p>`;
}

/** Inventory: this character's items, or (toggle) the Utilities party stash and purse. Players only get the views shown to them. */
function inventoryShell(ctx) {
  const mine = canSee('inventory'), stash = canSee('partyStash');
  const party = stash && (ctx.sheet?.invView === 'party' || !mine), d = party ? null : inventoryData(ctx.actor);
  const seg = (view, label, part) => `<button type="button" data-action="inv-view" data-view="${view}" data-ag-always aria-pressed="${(view === 'party') === party}">${esc(label)}${hiddenBadge(part)}</button>`;
  const segs = mine && stash ? `<div class="agch-seg" role="group" aria-label="Whose items">${seg('character', 'Character', 'inventory')}${seg('party', 'Party stash', 'partyStash')}</div>` : '';
  return `<div class="agch-toolbar">${segs}
    ${searchBox(ctx, 'items')}
    ${d ? `<span class="ag-badge${d.attunement.value > d.attunement.max ? ' ag-badge--danger' : ''}" title="Attuned items">Attuned ${d.attunement.value} / ${d.attunement.max}</span>` : ''}</div>
    ${party ? partyStashHtml(ctx.actor) : inventoryTab(ctx)}`;
}

// ---------- Magic ----------
function magicTab(ctx) {
  const {actor, editable, sheet} = ctx, off = !editable, d = spellsData(actor), expanded = sheet?.expanded;
  if (!d.levels.length && !d.pact) return empty('No spells.');
  const {group, sort} = listChoice('magic');
  const prep = s => s.always ? '<span class="ag-badge" title="Always prepared">Always</span>'
    : s.canPrepare ? btn('spell-prepare', s.prepared ? 'Prepared' : 'Prepare', {kind: s.prepared ? 'primary' : 'sm', data: {id: s.id}, title: s.prepared ? 'Unprepare' : 'Prepare', disabled: off}) : '';
  const columns = [...(group === 'level' ? [] : [{...C.level, render: r => esc(r.facts.level || (r.level ? `Level ${r.level}` : 'Cantrip'))}]), ...(group === 'school' ? [] : [C.school]), C.castTime, C.range, C.duration, C.components];
  const card = s => ({controls: `${prep(s)}${btn('item-use', 'Cast', {kind: 'sm', icon: 'fa-solid fa-wand-sparkles', data: {id: s.id}, title: `Cast ${s.name}`, disabled: off})}`, star: starBtn(actor, s, off)});
  const all = d.levels.flatMap(l => l.spells);
  const slotBadge = l => l.slots ? ` <span class="ag-badge" title="Slots left">${pips(l.slots.value, l.slots.max)} slots</span>` : '';
  const pact = d.pact ? `<h3 class="agch-heading">Pact Magic <span class="ag-badge">Level ${d.pact.level} · ${pips(d.pact.value, d.pact.max)} slots</span></h3>` : '';
  const slotStrip = group === 'level' ? '' : (() => { const ls = d.levels.filter(l => l.slots); return ls.length ? `<p class="agch-slotstrip">${ls.map(l => `<span class="ag-badge" title="${esc(l.label)} slots left">${esc(l.label)} ${pips(l.slots.value, l.slots.max)}</span>`).join(' ')}</p>` : ''; })();
  let sections;
  if (group === 'level') {
    sections = d.levels.map(l => sectionHtml(sectionKey('magic', l.level), `${esc(l.label)}${slotBadge(l)}`,
      l.spells.length ? cardList(sortRows(l.spells, sort), columns, {card, expanded, listKey: `magic-${l.level}`}) : empty('No spells at this level.'))).join('');
  } else {
    const groups = groupRows(sortRows(all, sort), r => group === 'school' ? {key: r.facts.school || 'none', label: r.facts.school || 'No school'} : null, {allLabel: 'All spells'});
    if (group === 'school') groups.sort((a, b) => a.label.localeCompare(b.label));
    sections = groups.map(g => sectionHtml(sectionKey('magic', group, g.key), esc(g.label), cardList(g.items, columns, {card, expanded, listKey: `magic-${group}-${g.key}`}))).join('');
  }
  return `<div class="agch-toolbar">${searchBox(ctx, 'spells')}${organizeSelects('magic')}</div>${slotStrip}${pact}
    ${favouritesSection(actor, 'magic', sortRows(all, sort), columns, card, expanded)}${sections}
    <p class="agch-muted agch-hint">Cast opens dnd5e's casting dialog (slot level, upcasting and consumption). The star is dnd5e's own favourite (also on the standard sheet). Full spell preparation is on the native sheet.</p>`;
}

// ---------- Features ----------
function featuresTab(ctx) {
  const {actor, editable, sheet} = ctx, off = !editable, d = featuresData(actor), expanded = sheet?.expanded;
  const {group, sort} = listChoice('features');
  const identity = d.identity.length ? cardList(d.identity, [{key: 'detail', label: 'Detail', render: r => esc(r.detail)}], {expanded, listKey: 'features-identity'}) : '';
  const columns = [...(group === 'type' ? [] : [{...C.type, render: r => esc(r.typeLabel || r.facts.type || '—')}]), ...(group === 'activation' ? [] : [C.activation]), C.uses, C.recovery];
  const card = r => ({controls: useBtn(r, off), star: starBtn(actor, r, off)});
  const all = d.groups.flatMap(g => g.items.map(r => ({...r, typeKey: g.key, typeLabel: g.label})));
  const groups = group === 'type' ? d.groups.map(g => ({key: g.key, label: g.label, items: sortRows(all.filter(r => r.typeKey === g.key), sort)}))
    : groupRows(sortRows(all, sort), r => group === 'activation' ? {key: r.facts.activation || 'none', label: r.facts.activation || 'No use time'} : null, {allLabel: 'All features'});
  if (group === 'activation') groups.sort((a, b) => (a.key === 'none') - (b.key === 'none') || a.label.localeCompare(b.label));
  const sections = groups.map(g => sectionHtml(sectionKey('features', group === 'type' ? g.key : `${group}-${g.key}`), esc(g.label), cardList(g.items, columns, {card, expanded, listKey: `features-${group}-${g.key}`}))).join('');
  return `<div class="agch-toolbar">${searchBox(ctx, 'features')}${organizeSelects('features')}</div>
    ${identity ? sectionHtml(sectionKey('features', 'identity'), 'Class, Species &amp; Background', identity) : ''}
    ${favouritesSection(actor, 'features', sortRows(all, sort), columns, card, expanded)}${sections || empty('No features.')}
    <p class="agch-muted agch-hint">Level up and advancement choices are on the native sheet. The star is dnd5e's own favourite (also on the standard sheet).</p>`;
}

export const ITEM_TABS = [
  {id: 'combat', label: 'Combat', icon: 'fa-solid fa-khanda', render: combatTab, parts: ['combat']},
  {id: 'inventory', label: 'Inventory', icon: 'fa-solid fa-sack', render: inventoryShell, parts: ['inventory', 'partyStash']},
  {id: 'magic', label: 'Magic', icon: 'fa-solid fa-wand-sparkles', render: magicTab, parts: ['magic']},
  {id: 'features', label: 'Features', icon: 'fa-solid fa-star', render: featuresTab, parts: ['features']}
];
