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
import {tooltipAttrs} from './tooltips.mjs';
import {coinIcon} from './coins.mjs';
import {ADD_LABELS, addReason} from './item-add.mjs';
import {showDescriptions, descriptionsToggle, spellList, preparedIndicator} from './spell-rows.mjs';
import {preparationSummary} from './spell-prep.mjs';

/** Kit empty state: a title and, optionally, the next step. */
const empty = (title, text = '') => `<div class="ag-empty"><p class="ag-empty__title">${esc(title)}</p>${text ? `<p class="ag-empty__text">${esc(text)}</p>` : ''}</div>`;
const pips = (value, max) => `${value} / ${max}`;
const useBtn = (row, off) => row.usable ? btn('item-use', 'Use', {kind: 'sm', icon: 'fa-solid fa-dice-d20', data: {id: row.id}, title: `Use ${row.name}`, disabled: off}) : '';
const attunedBadge = r => r.attuned ? '<span class="ag-badge ag-badge--accent" data-tooltip="Attuned"><i class="fa-solid fa-sun" aria-hidden="true"></i> Attuned</span>' : '';
/**
 * A weapon's mastery (0.30.0): the name from dnd5e's CONFIG.DND5E.weaponMasteries; hover shows dnd5e's own rules page
 * for it (rich tooltip) or, without dnd5e's tooltips, just the name. Dimmed when dnd5e says the character can't use it.
 */
export function masteryBadge(r) {
  const m = r?.mastery;
  if (!m) return '';
  const off = m.mastered === false, label = `${m.label} weapon mastery${off ? ' (not mastered by this character)' : ''}`;
  return `<span class="ag-badge agch-mastery${off ? ' is-off' : ' ag-badge--accent'}"${tooltipAttrs(m.reference, label, {kind: 'rule'})} aria-label="${esc(label)}"><i class="fa-solid fa-medal" aria-hidden="true"></i> ${esc(m.label)}</span>`;
}
/** The band at the top of a tab that stays in view while its list scrolls (0.30.0). 0.33.0 (CH-07): one toolbar row (Magic adds its spell levels). */
const stickyBand = html => `<div class="agch-sticky">${html}</div>`;

/**
 * The Add button at the right end of a tab's toolbar (0.45.0): "Add item…", "Add spell…", "Add feature…", "Add attack…".
 * Disabled, with the reason as its tooltip, for anyone who can't add (item-add.mjs checks again when it runs).
 */
export function addButton(ctx, tab) {
  const reason = addReason(ctx.actor, tab) || (ctx.editable ? '' : 'You can only add to a character you own.');
  return btn('item-add', ADD_LABELS[tab].button, {kind: 'sm', icon: 'fa-solid fa-plus', data: {tab}, title: reason || `${ADD_LABELS[tab].button.replace('…', '')} from the compendiums, or create one`, disabled: !!reason, aria: ADD_LABELS[tab].button});
}
const addEnd = (ctx, tab) => `<div class="ag-toolbar__end">${addButton(ctx, tab)}</div>`;
/** A list that takes dropped Items (0.45.0): the Hub's content drop handler reads data-item-drop. Not for observers. */
export const dropZone = (ctx, tab, html) => `<div class="agch-itemzone"${ctx.editable && !addReason(ctx.actor, tab) ? ` data-item-drop="${tab}"` : ''}>${html}</div>`;

/** Search box for a tab (filters rows by name without a re-render; the text is kept per tab). */
const searchBox = (ctx, what) => `<label class="ag-search agch-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-filter data-tab="${esc(ctx.tab ?? '')}" placeholder="Search ${esc(what)}" aria-label="Search ${esc(what)}" value="${esc(ctx.sheet?.filters?.[ctx.tab] ?? '')}" data-ag-always></label>`;
/** Group-by and sort selects for Combat, Magic and Features (remembered per user). Observers can use them too. */
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
function favouritesSection(actor, tab, rows, columns, card, expanded, list = null) {
  if (!favoritesSupported(actor)) return '';
  const favs = rows.filter(r => isFavorite(actor, actor.items?.get?.(r.id)));
  return favs.length ? sectionHtml(sectionKey(tab, 'favourites'), `<i class="fa-solid fa-star agch-star__head" aria-hidden="true"></i> Favourites <span class="ag-badge">${favs.length}</span>`, (list ?? cardList)(favs, columns, {card, expanded, listKey: `${tab}-fav`})) : '';
}

// ---------- Combat ----------
/** Action-type chips for the dnd5e activation types these rows have (only when there is more than one). */
function actionChips(tab, all, f) {
  const types = orderGroups([...new Set(all.map(r => r.actType || 'none'))].map(k => ({key: k, label: actionLabel(k === 'none' ? '' : k)})), 'action').map(g => g.key);
  return types.length > 1 ? types.map(t => filterBtn(tab, 'action', t, esc(actionLabel(t === 'none' ? '' : t)), f.action === t, `Show only ${actionLabel(t === 'none' ? '' : t)}`)).join('') : '';
}
/**
 * Combat (0.31.0): one list grouped by main category (Combat, Professions, Consumables, Features, Trinkets) or by action
 * type, with search, sort, filter chips and favourites like Magic and Features; the search, selects and chips sit in
 * 0.30.0's frozen band (stickyBand).
 */
function combatTab(ctx) {
  const {actor, editable, sheet} = ctx, off = !editable, d = combatData(actor), h = headerData(actor), expanded = sheet?.expanded;
  const {group, sort} = listChoice('combat'), f = sheet?.listFilters?.combat ?? {};
  // dnd5e's damage labels include healing (heal activities), so the column says both.
  const dmg = {...C.damage, label: 'Damage / Healing'};
  const weaponCols = [dmg, C.toHit, C.range, C.properties], actionCols = [C.range, dmg, C.uses, C.recovery], mixedCols = [dmg, C.toHit, C.range, C.uses];
  const card = r => ({iconUse: !off, controls: useBtn(r, off), star: starBtn(actor, r, off), badges: `${masteryBadge(r)}${r.type === 'weapon' && !r.equipped ? '<span class="ag-badge">Not equipped</span>' : ''}${attunedBadge(r)}`});
  const shown = sortRows(filterRows(d.rows, f), sort);
  const groups = orderGroups(groupRows(shown, group === 'none' ? () => null : GROUP_BY[group], {allLabel: 'Everything'}), group);
  const colsFor = g => group !== 'category' ? mixedCols : g.key === 'combat' ? weaponCols : actionCols;
  const sections = groups.map(g => sectionHtml(sectionKey('combat', group, g.key), `${esc(g.label)} <span class="ag-badge">${g.items.length}</span>`, cardList(g.items, colsFor(g), {card, expanded, listKey: `combat-${group}-${g.key}`}))).join('');
  const toolbar = `<div class="ag-toolbar agch-toolbar">${searchBox(ctx, 'weapons and actions')}${filtersControl(ctx, 'combat', `${actionChips('combat', d.rows, f)}${filterToggles('combat', f)}`)}
    <div class="ag-toolbar__end">${h.hp.value <= 0 ? btn('roll-death', 'Death save', {icon: 'fa-solid fa-dice-d20', disabled: off}) : ''}${addButton(ctx, 'combat')}</div></div>`;
  const body = sections || (d.rows.length ? empty('Nothing matches.', 'Change the search or use Clear filters.') : empty('No weapons or actions yet.', 'Weapons, and items or features you can use, show here.'));
  return dropZone(ctx, 'combat', `${stickyBand(toolbar)}
    ${favouritesSection(actor, 'combat', shown, mixedCols, card, expanded)}${body}
    <p class="agch-muted agch-hint">Use opens dnd5e's own usage dialog: attacks, damage, targets and resource use happen there. Initiative rolls from the tile on the left. Hide unequipped leaves out weapons and gear you carry but have not equipped. Add attack… picks a weapon or an attack feature from the compendiums, or creates one; you can also drop an item here.</p>`);
}

// ---------- Inventory ----------
/** True when any item the character owns (containers' contents too: they are Items on the Actor) has "diamond" in its name. */
export const hasDiamond = actor => [...(actor?.items ?? [])].some(i => /diamond/i.test(String(i.name ?? '')));
/** The display-only banner at the top of Inventory. Not stored, not clickable. Absent is muted, not an error (0.33.0, CH-13). */
export const diamondBanner = actor => hasDiamond(actor)
  ? `<p class="agch-diamond is-present" role="note">${esc(DIAMOND_PRESENT)}</p>`
  : `<p class="agch-diamond is-absent" role="note">${esc(DIAMOND_ABSENT)}</p>`;

/**
 * Carried weight (0.30.0): a small kit meter beside the coin purse, filled with dnd5e's carried weight against its
 * carrying capacity (system.attributes.encumbrance). Nothing when dnd5e gives no capacity.
 */
export function weightBar(enc) {
  if (!enc) return '';
  const text = `${enc.value} / ${enc.max} ${enc.units}`, tip = `Carried weight ${text} (dnd5e's carrying capacity)${enc.over ? ': over capacity' : ''}`;
  return `<span class="ag-meter${enc.over ? ' ag-meter--danger' : ''} agch-weight" data-tooltip="${esc(tip)}"><span class="ag-meter__label agch-weight__label"><i class="fa-solid fa-weight-hanging" aria-hidden="true"></i><span class="ag-sr-only">Carried weight</span></span><span class="ag-meter__value">${esc(text)}</span><span class="ag-meter__track" role="progressbar" aria-valuemin="0" aria-valuemax="${enc.max}" aria-valuenow="${Math.min(enc.value, enc.max)}" aria-valuetext="${esc(text)}" aria-label="${esc(tip)}" style="--ag-meter:${enc.pct}%"><span class="ag-meter__fill"></span></span></span>`;
}
/** The coin purse and the weight bar beside it, at the top of the Inventory list (it scrolls with the list since 0.33.0). */
function purseHtml(ctx, d) {
  const off = !ctx.editable;
  // Electrum follows Utilities' "Use electrum" (off: no ep box, unless the character still has some: then it shows dimmed).
  const offEp = electrumHidden(), coins = d.currency.filter(c => !(offEp && c.key === 'ep' && !c.value));
  const coinBox = c => { const dim = offEp && c.key === 'ep';
    return `<label class="agch-coin agch-coin--${esc(c.key)}${dim ? ' is-off' : ''}"${dim ? ' data-tooltip="Electrum is off in Utilities. This character still has some; the GM can convert it there."' : ` data-tooltip="${esc(c.label)}"`}>${coinIcon(c.key)}<span>${esc(c.abbr)}</span><input type="number" min="0" step="1"${dim ? ` max="${c.value}"` : ''} data-edit="currency" data-key="${esc(c.key)}" value="${c.value}" aria-label="${esc(c.label)}"${off ? ' disabled' : ''}></label>`; };
  return `<div class="agch-purse"><div class="agch-currency agch-coins" role="group" aria-label="Currency">${coins.map(coinBox).join('')}</div>${weightBar(d.encumbrance)}</div>${offEp && coins.some(c => c.key === 'ep') ? '<p class="agch-muted agch-ep-off">Electrum is off in Utilities: it only shows because this character still has some. The GM can convert it there.</p>' : ''}`;
}

function inventoryTab(ctx, d = inventoryData(ctx.actor)) {
  const {actor, editable, sheet} = ctx, off = !editable, toParty = partyStashUsable(), expanded = sheet?.expanded;
  const qty = {...C.quantity, render: r => `<span class="agch-qty">${btn('item-qty', '', {kind: 'sm', icon: 'fa-solid fa-minus', data: {id: r.id, step: -1}, title: `One fewer ${r.name}`, disabled: off || r.quantity <= 0})}<input type="number" min="0" step="1" data-edit="item-qty" data-id="${esc(r.id)}" value="${r.quantity}" aria-label="${esc(r.name)} quantity"${off ? ' disabled' : ''}>${btn('item-qty', '', {kind: 'sm', icon: 'fa-solid fa-plus', data: {id: r.id, step: 1}, title: `One more ${r.name}`, disabled: off})}</span>`};
  const columns = [qty, C.weight, C.value, C.uses];
  const controls = r => [
    r.usable && r.type === 'consumable' ? useBtn(r, off) : '',
    r.equippable ? btn(r.equipped ? 'item-unequip' : 'item-equip', r.equipped ? 'Unequip' : 'Equip', {kind: r.equipped ? 'primary' : 'sm', data: {id: r.id}, disabled: off}) : '',
    r.canAttune ? btn('item-attune', r.attuned ? 'Unattune' : 'Attune', {kind: 'sm', data: {id: r.id, attuned: r.attuned ? 0 : 1}, title: r.attunement === 'optional' ? 'Attunement optional' : 'Requires attunement', disabled: off}) : '',
    toParty ? btn('item-deposit', '', {kind: 'sm', icon: 'fa-solid fa-people-carry-box', data: {id: r.id}, title: `Move ${r.name} to the party stash`, disabled: off}) : ''
  ].join('');
  const card = r => ({iconUse: !off, controls: controls(r), lead: containerLead(r), star: starBtn(actor, r, off), badges: `${masteryBadge(r)}${attunedBadge(r)}`});
  // A container's contents sit in a folding row under it (fold state shared with headings).
  const after = r => r.contents?.length ? `<li class="agch-contents"${containerAttrs(r)}>${cardList(r.contents, columns, {card, expanded, listKey: `inv-${r.id}`})}</li>` : '';
  const groups = d.groups.map(g => sectionHtml(sectionKey('inventory', g.type), esc(g.label), cardList(g.items, columns, {card, after, expanded, listKey: `inv-${g.type}`}))).join('') || empty('No items yet.', 'Items on this character show here.');
  return `${diamondBanner(actor)}${groups}
    <p class="agch-muted agch-hint">Equipped items also show in the slots around the portrait.${toParty ? ' <i class="fa-solid fa-people-carry-box" aria-hidden="true"></i> moves an item to the party stash; take items back from Party stash.' : ''}</p>`;
}

/** Inventory: this character's items, or (toggle) the Utilities party stash and purse. Players only get the views shown to them. */
function inventoryShell(ctx) {
  const mine = canSee('inventory'), stash = canSee('partyStash');
  const party = stash && (ctx.sheet?.invView === 'party' || !mine), d = party ? null : inventoryData(ctx.actor);
  const seg = (view, label, part) => `<button type="button" data-action="inv-view" data-view="${view}" data-ag-always role="radio" aria-checked="${(view === 'party') === party}">${esc(label)}${hiddenBadge(part)}</button>`;
  const segs = mine && stash ? `<div class="ag-segmented agch-seg" role="radiogroup" aria-label="Whose items">${seg('character', 'Character', 'inventory')}${seg('party', 'Party stash', 'partyStash')}</div>` : '';
  const html = `${stickyBand(`<div class="ag-toolbar agch-toolbar">${segs}
    ${searchBox(ctx, 'items')}
    ${d ? `<span class="ag-badge${d.attunement.value > d.attunement.max ? ' ag-badge--danger' : ''}" data-tooltip="Attuned items">Attuned ${d.attunement.value} / ${d.attunement.max}</span>` : ''}${d ? addEnd(ctx, 'inventory') : ''}</div>`)}
    ${d ? purseHtml(ctx, d) : ''}${party ? partyStashHtml(ctx.actor) : inventoryTab(ctx, d)}`;
  return party ? html : dropZone(ctx, 'inventory', html);
}

// ---------- Filters (Magic, Features) ----------

const filterBtn = (tab, key, value, label, on, title = '') => `<button type="button" class="ag-chip agch-filter" data-action="list-filter" data-tab="${tab}" data-key="${key}" data-value="${esc(value)}" data-ag-always aria-pressed="${on}"${title ? ` data-tooltip="${esc(title)}"` : ''}>${label}</button>`;
/** Toggle buttons for a tab's filters. f is the sheet's filter state for the tab. */
function filterToggles(tab, f) {
  return FILTERS[tab].map(([k, label]) => filterBtn(tab, k, '1', esc(label), !!f[k])).join('');
}
const isOn = v => v !== null && v !== undefined && v !== false;
/** How many of a tab's filters are on (Magic's spell level is not counted: its strip shows it). */
export const activeFilters = (tab, f = {}) => Object.entries(f).filter(([k, v]) => isOn(v) && !(tab === 'magic' && k === 'level')).length;
/**
 * Filters (n) (0.33.0, CH-07): one button in the toolbar opens a popover with Group, Sort and the filter chips; n counts
 * the filters that are on. Clear filters sits beside it while any filter is on. The popover is a Hub menu
 * (sheet.menu 'filters:<tab>'), so a click outside or Escape closes it.
 */
export function filtersControl(ctx, tab, chips, extra = '') {
  const f = ctx.sheet?.listFilters?.[tab] ?? {}, n = activeFilters(tab, f), open = ctx.sheet?.menu === `filters:${tab}`;
  const any = Object.values(f).some(isOn);
  const pop = open ? `<div class="agch-menu agch-filtermenu" role="group" aria-label="Filters">
      <header class="agch-menu__head"><strong>Group, sort and filter</strong>${btn('menu-close', '', {kind: 'ghost', icon: 'fa-solid fa-xmark', title: 'Close', always: true})}</header>
      <div class="agch-filtermenu__selects">${organizeSelects(tab)}</div>${chips ? `<div class="agch-filters" role="group" aria-label="Filters">${chips}</div>` : ''}${extra}</div>` : '';
  return `<span class="agch-filterwrap"><button type="button" class="ag-btn ag-btn--sm agch-filtersbtn${n ? ' is-on' : ''}" data-action="filters-menu" data-tab="${tab}" data-ag-always aria-haspopup="true" aria-expanded="${open}"><i class="fa-solid fa-filter" aria-hidden="true"></i><span>Filters${n ? ` (${n})` : ''}</span></button>${pop}</span>
    ${any ? `<button type="button" class="ag-chip agch-filter agch-filter--clear" data-action="list-filter" data-tab="${tab}" data-key="clear" data-ag-always>Clear filters</button>` : ''}`;
}

// ---------- Magic ----------
function magicTab(ctx) {
  const {actor, editable, sheet} = ctx, off = !editable, d = spellsData(actor), expanded = sheet?.expanded;
  if (!d.levels.length && !d.pact) return dropZone(ctx, 'magic', `${stickyBand(`<div class="ag-toolbar agch-toolbar">${addEnd(ctx, 'magic')}</div>`)}${empty('No spells yet.', 'Add a spell, or drop one here.')}`);
  const {group, sort} = listChoice('magic'), f = sheet?.listFilters?.magic ?? {};
  const prep = s => s.always ? '<span class="ag-badge" data-tooltip="Always prepared">Always</span>'
    : s.canPrepare ? btn('spell-prepare', s.prepared ? 'Prepared' : 'Prepare', {kind: s.prepared ? 'primary' : 'sm', data: {id: s.id}, title: s.prepared ? 'Unprepare' : 'Prepare', disabled: off}) : '';
  // 0.33.0 (CH-08): four fact columns; the spell level and school sit beside the name (unless the list is grouped by them).
  const columns = [C.castTime, C.range, C.duration, C.components];
  const spellBadges = r => `${group === 'level' ? '' : `<span class="ag-badge">${esc(r.facts.level || (r.level ? `Level ${r.level}` : 'Cantrip'))}</span>`}${group === 'school' || !r.facts.school ? '' : `<span class="ag-badge">${esc(r.facts.school)}</span>`}`;
  const long = showDescriptions();
  const list = long ? (rows, cols, o) => cardList(rows, cols, {...o, cls: 'agch-spelllist'}) : spellList;
  const card = s => ({iconUse: !off, controls: `${prep(s)}${btn('item-use', 'Cast', {kind: 'sm', icon: 'fa-solid fa-wand-sparkles', data: {id: s.id}, title: `Cast ${s.name}`, disabled: off})}`, star: starBtn(actor, s, off), badges: spellBadges(s)});
  const all = d.levels.flatMap(l => l.spells), shown = filterRows(all, f, {slotsLeft: d.slotsLeft, pact: d.pact});
  const slotBadge = l => l.slots ? ` <span class="ag-badge" data-tooltip="Slots left">${pips(l.slots.value, l.slots.max)} slots</span>` : '';
  // Spell-level buttons (dnd5e's slots): click to show only that level, again to show all.
  const strip = `<div class="agch-slotstrip" role="group" aria-label="Show one spell level">${d.levels.filter(l => l.spells.length || l.slots).map(l =>
    filterBtn('magic', 'level', String(l.level), `${esc(l.label)}${l.slots ? ` <b>${pips(l.slots.value, l.slots.max)}</b>` : ''}`, f.level !== null && f.level !== undefined && Number(f.level) === l.level, `Show only ${l.label}${l.slots ? ` (${l.slots.value} of ${l.slots.max} slots left)` : ''}`)).join('')}
    ${d.pact ? `<span class="ag-badge" data-tooltip="Pact Magic slots">Pact (level ${d.pact.level}) ${pips(d.pact.value, d.pact.max)}</span>` : ''}${preparedIndicator(preparationSummary(actor))}</div>`;
  let sections;
  if (group === 'level') {
    sections = d.levels.filter(l => f.level === null || f.level === undefined || Number(f.level) === l.level).map(l => {
      const rows = sortRows(shown.filter(s => s.level === l.level), sort);
      return rows.length || !l.spells.length ? sectionHtml(sectionKey('magic', l.level), `${esc(l.label)}${slotBadge(l)}`, rows.length ? list(rows, columns, {card, expanded, listKey: `magic-${l.level}`}) : empty('No spells at this level.')) : '';
    }).join('');
  } else {
    const groups = groupRows(sortRows(shown, sort), group === 'none' ? () => null : GROUP_BY[group], {allLabel: 'All spells'});
    orderGroups(groups, group);
    sections = groups.map(g => sectionHtml(sectionKey('magic', group, g.key), esc(g.label), list(g.items, columns, {card, expanded, listKey: `magic-${group}-${g.key}`}))).join('');
  }
  return dropZone(ctx, 'magic', `${stickyBand(`<div class="ag-toolbar agch-toolbar">${searchBox(ctx, 'spells')}${filtersControl(ctx, 'magic', filterToggles('magic', f), `<div class="agch-filtermenu__opts">${descriptionsToggle()}</div>`)}${addEnd(ctx, 'magic')}</div>${strip}`)}
    ${favouritesSection(actor, 'magic', sortRows(shown, sort), columns, card, expanded, list)}${sections || empty('Nothing matches.', 'Change the search or use Clear filters.')}
    <p class="agch-muted agch-hint">Cast opens dnd5e's casting dialog (slot level, upcasting and consumption). Castable only: cantrips, and prepared spells with a slot of their level or higher left. Add spell… picks a spell from the compendiums or creates one; you can also drop one here. The star is dnd5e's own favourite (also on the standard sheet).</p>`);
}

// ---------- Features ----------
function featuresTab(ctx) {
  const {actor, editable, sheet} = ctx, off = !editable, d = featuresData(actor), expanded = sheet?.expanded;
  const {group, sort} = listChoice('features'), f = sheet?.listFilters?.features ?? {};
  const columns = [...(group === 'type' ? [] : [{...C.type, render: r => esc(r.typeLabel || r.facts.type || '—')}]), ...(group === 'activation' ? [] : [C.activation]), C.uses, C.recovery];
  const card = r => ({iconUse: !off, controls: useBtn(r, off), star: starBtn(actor, r, off)});
  const all = d.groups.flatMap(g => g.items.map(r => ({...r, typeKey: g.key, typeLabel: g.label}))), shown = filterRows(all, f);
  const groups = group === 'type' ? d.groups.map(g => ({key: g.key, label: g.label, items: sortRows(shown.filter(r => r.typeKey === g.key), sort)})).filter(g => g.items.length)
    : orderGroups(groupRows(sortRows(shown, sort), group === 'none' ? () => null : GROUP_BY[group], {allLabel: 'All features'}), group);
  const sections = groups.map(g => sectionHtml(sectionKey('features', group === 'type' ? g.key : `${group}-${g.key}`), esc(g.label), cardList(g.items, columns, {card, expanded, listKey: `features-${group}-${g.key}`}))).join('');
  // Action-type buttons for the dnd5e activation types these features have.
  const actBtns = actionChips('features', all, f);
  return dropZone(ctx, 'features', `${stickyBand(`<div class="ag-toolbar agch-toolbar">${searchBox(ctx, 'features')}${filtersControl(ctx, 'features', `${actBtns}${filterToggles('features', f)}`)}${addEnd(ctx, 'features')}</div>`)}
    ${favouritesSection(actor, 'features', sortRows(shown, sort), columns, card, expanded)}${sections || (all.length ? empty('Nothing matches.', 'Change the search or use Clear filters.') : empty('No features yet.', 'Class, species and other features show here.'))}
    <p class="agch-muted agch-hint">Class, species and background are on the card at the top of the character. Level up is under the character's name; it opens dnd5e's own advancement. Add feature… picks a feature from the compendiums or creates one; you can also drop one here. The star is dnd5e's own favourite (also on the standard sheet).</p>`);
}

export const ITEM_TABS = [
  {id: 'combat', label: 'Combat', icon: 'fa-solid fa-khanda', render: combatTab, parts: ['combat']},
  {id: 'inventory', label: 'Inventory', icon: 'fa-solid fa-sack', render: inventoryShell, parts: ['inventory', 'partyStash']},
  {id: 'magic', label: 'Magic', icon: 'fa-solid fa-wand-sparkles', render: magicTab, parts: ['magic']},
  {id: 'features', label: 'Features', icon: 'fa-solid fa-star', render: featuresTab, parts: ['features']}
];
