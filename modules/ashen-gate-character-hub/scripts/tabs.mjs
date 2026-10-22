/**
 * Combat, Inventory (character or party stash), Magic and Features views. Every list is a column-headed list of item
 * cards (cards.mjs). The paper doll, initiative and rests are in character.mjs.
 */
import {esc, DIAMOND_PRESENT, DIAMOND_ABSENT} from './constants.mjs';
import {btn} from './buttons.mjs';
import {inventoryData, combatData, spellsData, featuresData} from './items.mjs';
import {partyStashHtml, partyStashUsable, electrumHidden} from './partners.mjs';
import {headerData} from './data.mjs';
import {canSee, hiddenBadge} from './visibility.mjs';
import {sectionHtml, sectionKey} from './collapse.mjs';
import {cardList, COLUMNS as C, containerLead, containerAttrs} from './cards.mjs';
import {ORGANIZE, listChoice, sortRows, groupRows, GROUP_BY, orderGroups, filterRows, FILTERS, actionLabel} from './organize.mjs';
import {favoritesSupported, isFavorite} from './item-actions.mjs';

/** Kit empty state: a title and, optionally, the next step. */
const empty = (title, text = '') => `<div class="ag-empty"><p class="ag-empty__title">${esc(title)}</p>${text ? `<p class="ag-empty__text">${esc(text)}</p>` : ''}</div>`;
const pips = (value, max) => `${value} / ${max}`;
const useBtn = (row, off) => row.usable ? btn('item-use', 'Use', {kind: 'sm', icon: 'fa-solid fa-dice-d20', data: {id: row.id}, title: `Use ${row.name}`, disabled: off}) : '';
const attunedBadge = r => r.attuned ? '<span class="ag-badge ag-badge--accent" data-tooltip="Attuned"><i class="fa-solid fa-sun" aria-hidden="true"></i> Attuned</span>' : '';

/** Search box for a tab (filters rows by name without a re-render; the text is kept per tab). */
const searchBox = (ctx, what) => `<label class="ag-search agch-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-filter data-tab="${esc(ctx.tab ?? '')}" placeholder="Search ${esc(what)}" aria-label="Search ${esc(what)}" value="${esc(ctx.sheet?.filters?.[ctx.tab] ?? '')}" data-ag-always></label>`;
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
  return `<button type="button" class="agch-star${on ? ' is-on' : ''}" data-action="item-favorite" data-id="${esc(row.id)}" aria-pressed="${on}" data-tooltip="${on ? `Remove ${esc(row.name)} from favourites` : `Add ${esc(row.name)} to favourites`}" aria-label="${on ? 'Unfavourite' : 'Favourite'} ${esc(row.name)}"${off ? ' disabled' : ''}><i class="${on ? 'fa-solid' : 'fa-regular'} fa-star" aria-hidden="true"></i></button>`;
}
/** Favourites first, in their own group: the starred rows (they also stay in their normal group). */
function favouritesSection(actor, tab, rows, columns, card, expanded) {
  if (!favoritesSupported(actor)) return '';
  const favs = rows.filter(r => isFavorite(actor, actor.items?.get?.(r.id)));
  return favs.length ? sectionHtml(sectionKey(tab, 'favourites'), `<i class="fa-solid fa-star agch-star__head" aria-hidden="true"></i> Favourites <span class="ag-badge">${favs.length}</span>`, cardList(favs, columns, {card, expanded, listKey: `${tab}-fav`})) : '';
}

// ---------- Combat ----------
/**
 * The list head (0.31.0): search, group / sort and filter chips in one block that stays at the top of the list while it
 * scrolls (CSS position: sticky on .agch-listhead), so filters stay in reach in a long list.
 */
const listHead = (label, toolbar, filters = '') => `<div class="agch-listhead">${toolbar}${filters ? `<div class="agch-filters" role="group" aria-label="${esc(label)}">${filters}</div>` : ''}</div>`;
/** Action-type chips for the dnd5e activation types these rows have (only when there is more than one). */
function actionChips(tab, all, f) {
  const types = orderGroups([...new Set(all.map(r => r.actType || 'none'))].map(k => ({key: k, label: actionLabel(k === 'none' ? '' : k)})), 'action').map(g => g.key);
  return types.length > 1 ? types.map(t => filterBtn(tab, 'action', t, esc(actionLabel(t === 'none' ? '' : t)), f.action === t, `Show only ${actionLabel(t === 'none' ? '' : t)}`)).join('') : '';
}
/**
 * Combat (0.31.0): one list grouped by main category (Combat, Professions, Consumables, Features, Trinkets) or by action
 * type, with search, sort, filter chips and favourites like Magic and Features.
 */
function combatTab(ctx) {
  const {actor, editable, sheet} = ctx, off = !editable, d = combatData(actor), h = headerData(actor), expanded = sheet?.expanded;
  const {group, sort} = listChoice('combat'), f = sheet?.listFilters?.combat ?? {};
  // dnd5e's damage labels include healing (heal activities), so the column says both.
  const dmg = {...C.damage, label: 'DMG/HEAL'};
  const weaponCols = [dmg, C.toHit, C.range, C.properties], actionCols = [C.range, dmg, C.uses, C.recovery], mixedCols = [dmg, C.toHit, C.range, C.uses];
  const card = r => ({controls: useBtn(r, off), star: starBtn(actor, r, off), badges: `${r.type === 'weapon' && !r.equipped ? '<span class="ag-badge">Not equipped</span>' : ''}${attunedBadge(r)}`});
  const shown = sortRows(filterRows(d.rows, f), sort);
  const groups = orderGroups(groupRows(shown, group === 'none' ? () => null : GROUP_BY[group], {allLabel: 'Everything'}), group);
  const colsFor = g => group !== 'category' ? mixedCols : g.key === 'combat' ? weaponCols : actionCols;
  const sections = groups.map(g => sectionHtml(sectionKey('combat', group, g.key), `${esc(g.label)} <span class="ag-badge">${g.items.length}</span>`, cardList(g.items, colsFor(g), {card, expanded, listKey: `combat-${group}-${g.key}`}))).join('');
  const toolbar = `<div class="ag-toolbar agch-toolbar">${searchBox(ctx, 'weapons and actions')}${organizeSelects('combat')}
    ${h.hp.value <= 0 ? `<div class="ag-toolbar__end">${btn('roll-death', 'Death save', {icon: 'fa-solid fa-dice-d20', disabled: off})}</div>` : ''}</div>`;
  const body = sections || (d.rows.length ? empty('Nothing matches.', 'Change the search or use Clear filters.') : empty('No weapons or actions yet.', 'Weapons, and items or features you can use, show here.'));
  return `${listHead('Combat filters', toolbar, `${actionChips('combat', d.rows, f)}${filterToggles('combat', f)}`)}
    ${favouritesSection(actor, 'combat', shown, mixedCols, card, expanded)}${body}
    <p class="agch-muted agch-hint">Use opens dnd5e's own usage dialog: attacks, damage, targets and resource use happen there. Initiative rolls from the tile on the left. Hide unequipped leaves out weapons and gear you carry but have not equipped.</p>`;
}

// ---------- Inventory ----------
/** True when any item the character owns (containers' contents too: they are Items on the Actor) has "diamond" in its name. */
export const hasDiamond = actor => [...(actor?.items ?? [])].some(i => /diamond/i.test(String(i.name ?? '')));
/** The display-only banner at the top of Inventory. Not stored, not clickable. */
export const diamondBanner = actor => hasDiamond(actor)
  ? `<p class="agch-diamond is-present" role="note">${esc(DIAMOND_PRESENT)}</p>`
  : `<p class="agch-diamond is-absent" role="note">${esc(DIAMOND_ABSENT)}</p>`;

function inventoryTab(ctx) {
  const {actor, editable, sheet} = ctx, off = !editable, d = inventoryData(actor), toParty = partyStashUsable(), expanded = sheet?.expanded;
  // Electrum follows Utilities' "Use electrum" (off: no ep box, unless the character still has some: then it shows dimmed).
  const offEp = electrumHidden(), coins = d.currency.filter(c => !(offEp && c.key === 'ep' && !c.value));
  const coinBox = c => { const dim = offEp && c.key === 'ep';
    return `<label class="agch-coin${dim ? ' is-off' : ''}"${dim ? ' data-tooltip="Electrum is off in Utilities. This character still has some; the GM can convert it there."' : ''}><span>${esc(c.abbr)}</span><input type="number" min="0" step="1"${dim ? ` max="${c.value}"` : ''} data-edit="currency" data-key="${esc(c.key)}" value="${c.value}" aria-label="${esc(c.label)}"${off ? ' disabled' : ''}></label>`; };
  const currency = `<div class="agch-currency agch-coins" role="group" aria-label="Currency">${coins.map(coinBox).join('')}</div>${offEp && coins.some(c => c.key === 'ep') ? '<p class="agch-muted agch-ep-off">Electrum is off in Utilities: it only shows because this character still has some. The GM can convert it there.</p>' : ''}`;
  const qty = {...C.quantity, render: r => `<span class="agch-qty">${btn('item-qty', '', {kind: 'sm', icon: 'fa-solid fa-minus', data: {id: r.id, step: -1}, title: `One fewer ${r.name}`, disabled: off || r.quantity <= 0})}<input type="number" min="0" step="1" data-edit="item-qty" data-id="${esc(r.id)}" value="${r.quantity}" aria-label="${esc(r.name)} quantity"${off ? ' disabled' : ''}>${btn('item-qty', '', {kind: 'sm', icon: 'fa-solid fa-plus', data: {id: r.id, step: 1}, title: `One more ${r.name}`, disabled: off})}</span>`};
  const columns = [qty, C.weight, C.value, C.uses];
  const controls = r => [
    r.usable && r.type === 'consumable' ? useBtn(r, off) : '',
    r.equippable ? btn(r.equipped ? 'item-unequip' : 'item-equip', r.equipped ? 'Unequip' : 'Equip', {kind: r.equipped ? 'primary' : 'sm', data: {id: r.id}, disabled: off}) : '',
    r.canAttune ? btn('item-attune', r.attuned ? 'Unattune' : 'Attune', {kind: 'sm', data: {id: r.id, attuned: r.attuned ? 0 : 1}, title: r.attunement === 'optional' ? 'Attunement optional' : 'Requires attunement', disabled: off}) : '',
    toParty ? btn('item-deposit', '', {kind: 'sm', icon: 'fa-solid fa-people-carry-box', data: {id: r.id}, title: `Move ${r.name} to the party stash`, disabled: off}) : ''
  ].join('');
  const card = r => ({controls: controls(r), lead: containerLead(r), star: starBtn(actor, r, off), badges: attunedBadge(r)});
  // A container's contents sit in a folding row under it (fold state shared with headings).
  const after = r => r.contents?.length ? `<li class="agch-contents"${containerAttrs(r)}>${cardList(r.contents, columns, {card, expanded, listKey: `inv-${r.id}`})}</li>` : '';
  const groups = d.groups.map(g => sectionHtml(sectionKey('inventory', g.type), esc(g.label), cardList(g.items, columns, {card, after, expanded, listKey: `inv-${g.type}`}))).join('') || empty('No items yet.', 'Items on this character show here.');
  return `${diamondBanner(actor)}${currency}${groups}
    <p class="agch-muted agch-hint">Equipped items also show in the slots around the portrait.${toParty ? ' <i class="fa-solid fa-people-carry-box" aria-hidden="true"></i> moves an item to the party stash; take items back from Party stash.' : ''}</p>`;
}

/** Inventory: this character's items, or (toggle) the Utilities party stash and purse. Players only get the views shown to them. */
function inventoryShell(ctx) {
  const mine = canSee('inventory'), stash = canSee('partyStash');
  const party = stash && (ctx.sheet?.invView === 'party' || !mine), d = party ? null : inventoryData(ctx.actor);
  const seg = (view, label, part) => `<button type="button" data-action="inv-view" data-view="${view}" data-ag-always role="radio" aria-checked="${(view === 'party') === party}">${esc(label)}${hiddenBadge(part)}</button>`;
  const segs = mine && stash ? `<div class="ag-segmented agch-seg" role="radiogroup" aria-label="Whose items">${seg('character', 'Character', 'inventory')}${seg('party', 'Party stash', 'partyStash')}</div>` : '';
  return `<div class="ag-toolbar agch-toolbar">${segs}
    ${searchBox(ctx, 'items')}
    ${d ? `<span class="ag-badge${d.attunement.value > d.attunement.max ? ' ag-badge--danger' : ''}" data-tooltip="Attuned items">Attuned ${d.attunement.value} / ${d.attunement.max}</span>` : ''}</div>
    ${party ? partyStashHtml(ctx.actor) : inventoryTab(ctx)}`;
}

// ---------- Filters (Magic, Features) ----------

const filterBtn = (tab, key, value, label, on, title = '') => `<button type="button" class="ag-chip agch-filter" data-action="list-filter" data-tab="${tab}" data-key="${key}" data-value="${esc(value)}" data-ag-always aria-pressed="${on}"${title ? ` data-tooltip="${esc(title)}"` : ''}>${label}</button>`;
/** Toggle buttons for a tab's filters, plus Clear when any is on. f is the sheet's filter state for the tab. */
function filterToggles(tab, f) {
  const any = Object.values(f).some(v => v !== null && v !== undefined && v !== false);
  return `${FILTERS[tab].map(([k, label]) => filterBtn(tab, k, '1', esc(label), !!f[k])).join('')}${any ? `<button type="button" class="ag-chip agch-filter agch-filter--clear" data-action="list-filter" data-tab="${tab}" data-key="clear" data-ag-always>Clear filters</button>` : ''}`;
}

// ---------- Magic ----------
function magicTab(ctx) {
  const {actor, editable, sheet} = ctx, off = !editable, d = spellsData(actor), expanded = sheet?.expanded;
  if (!d.levels.length && !d.pact) return empty('No spells yet.', 'Spells on this character show here.');
  const {group, sort} = listChoice('magic'), f = sheet?.listFilters?.magic ?? {};
  const prep = s => s.always ? '<span class="ag-badge" data-tooltip="Always prepared">Always</span>'
    : s.canPrepare ? btn('spell-prepare', s.prepared ? 'Prepared' : 'Prepare', {kind: s.prepared ? 'primary' : 'sm', data: {id: s.id}, title: s.prepared ? 'Unprepare' : 'Prepare', disabled: off}) : '';
  const columns = [...(group === 'level' ? [] : [{...C.level, render: r => esc(r.facts.level || (r.level ? `Level ${r.level}` : 'Cantrip'))}]), ...(group === 'school' ? [] : [C.school]), C.castTime, C.range, C.duration, C.components];
  const card = s => ({controls: `${prep(s)}${btn('item-use', 'Cast', {kind: 'sm', icon: 'fa-solid fa-wand-sparkles', data: {id: s.id}, title: `Cast ${s.name}`, disabled: off})}`, star: starBtn(actor, s, off)});
  const all = d.levels.flatMap(l => l.spells), shown = filterRows(all, f, {slotsLeft: d.slotsLeft, pact: d.pact});
  const slotBadge = l => l.slots ? ` <span class="ag-badge" data-tooltip="Slots left">${pips(l.slots.value, l.slots.max)} slots</span>` : '';
  // Spell-level buttons (dnd5e's slots): click to show only that level, again to show all.
  const strip = `<div class="agch-slotstrip" role="group" aria-label="Show one spell level">${d.levels.filter(l => l.spells.length || l.slots).map(l =>
    filterBtn('magic', 'level', String(l.level), `${esc(l.label)}${l.slots ? ` <b>${pips(l.slots.value, l.slots.max)}</b>` : ''}`, f.level !== null && f.level !== undefined && Number(f.level) === l.level, `Show only ${l.label}${l.slots ? ` (${l.slots.value} of ${l.slots.max} slots left)` : ''}`)).join('')}
    ${d.pact ? `<span class="ag-badge" data-tooltip="Pact Magic slots">Pact (level ${d.pact.level}) ${pips(d.pact.value, d.pact.max)}</span>` : ''}</div>`;
  let sections;
  if (group === 'level') {
    sections = d.levels.filter(l => f.level === null || f.level === undefined || Number(f.level) === l.level).map(l => {
      const rows = sortRows(shown.filter(s => s.level === l.level), sort);
      return rows.length || !l.spells.length ? sectionHtml(sectionKey('magic', l.level), `${esc(l.label)}${slotBadge(l)}`, rows.length ? cardList(rows, columns, {card, expanded, listKey: `magic-${l.level}`}) : empty('No spells at this level.')) : '';
    }).join('');
  } else {
    const groups = groupRows(sortRows(shown, sort), group === 'none' ? () => null : GROUP_BY[group], {allLabel: 'All spells'});
    orderGroups(groups, group);
    sections = groups.map(g => sectionHtml(sectionKey('magic', group, g.key), esc(g.label), cardList(g.items, columns, {card, expanded, listKey: `magic-${group}-${g.key}`}))).join('');
  }
  return `<div class="ag-toolbar agch-toolbar">${searchBox(ctx, 'spells')}${organizeSelects('magic')}</div>${strip}
    <div class="agch-filters" role="group" aria-label="Spell filters">${filterToggles('magic', {...f, level: null})}</div>
    ${favouritesSection(actor, 'magic', sortRows(shown, sort), columns, card, expanded)}${sections || empty('Nothing matches.', 'Change the search or use Clear filters.')}
    <p class="agch-muted agch-hint">Cast opens dnd5e's casting dialog (slot level, upcasting and consumption). Castable only: cantrips, and prepared spells with a slot of their level or higher left. The star is dnd5e's own favourite (also on the standard sheet).</p>`;
}

// ---------- Features ----------
function featuresTab(ctx) {
  const {actor, editable, sheet} = ctx, off = !editable, d = featuresData(actor), expanded = sheet?.expanded;
  const {group, sort} = listChoice('features'), f = sheet?.listFilters?.features ?? {};
  const columns = [...(group === 'type' ? [] : [{...C.type, render: r => esc(r.typeLabel || r.facts.type || '—')}]), ...(group === 'activation' ? [] : [C.activation]), C.uses, C.recovery];
  const card = r => ({controls: useBtn(r, off), star: starBtn(actor, r, off)});
  const all = d.groups.flatMap(g => g.items.map(r => ({...r, typeKey: g.key, typeLabel: g.label}))), shown = filterRows(all, f);
  const groups = group === 'type' ? d.groups.map(g => ({key: g.key, label: g.label, items: sortRows(shown.filter(r => r.typeKey === g.key), sort)})).filter(g => g.items.length)
    : orderGroups(groupRows(sortRows(shown, sort), group === 'none' ? () => null : GROUP_BY[group], {allLabel: 'All features'}), group);
  const sections = groups.map(g => sectionHtml(sectionKey('features', group === 'type' ? g.key : `${group}-${g.key}`), esc(g.label), cardList(g.items, columns, {card, expanded, listKey: `features-${group}-${g.key}`}))).join('');
  // Action-type buttons for the dnd5e activation types these features have.
  const actBtns = actionChips('features', all, f);
  return `<div class="ag-toolbar agch-toolbar">${searchBox(ctx, 'features')}${organizeSelects('features')}</div>
    <div class="agch-filters" role="group" aria-label="Feature filters">${actBtns}${filterToggles('features', f)}</div>
    ${favouritesSection(actor, 'features', sortRows(shown, sort), columns, card, expanded)}${sections || (all.length ? empty('Nothing matches.', 'Change the search or use Clear filters.') : empty('No features yet.', 'Class, species and other features show here.'))}
    <p class="agch-muted agch-hint">Class, species and background are on the card at the top of the character. Level up and advancement choices are on the native sheet. The star is dnd5e's own favourite (also on the standard sheet).</p>`;
}

export const ITEM_TABS = [
  {id: 'combat', label: 'Combat', icon: 'fa-solid fa-khanda', render: combatTab, parts: ['combat']},
  {id: 'inventory', label: 'Inventory', icon: 'fa-solid fa-sack', render: inventoryShell, parts: ['inventory', 'partyStash']},
  {id: 'magic', label: 'Magic', icon: 'fa-solid fa-wand-sparkles', render: magicTab, parts: ['magic']},
  {id: 'features', label: 'Features', icon: 'fa-solid fa-star', render: featuresTab, parts: ['features']}
];
