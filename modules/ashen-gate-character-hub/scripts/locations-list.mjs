/**
 * Ashen Gate → Locations (0.63.0): the Locations module's own list, drawn here with the Hub's markup. The list itself (Region folders,
 * search, filters, sort, who may see what) is built by Locations (`api.listModel`); this file only draws it and keeps the Hub's view settings
 * (search text, filters, sort: per open Hub; folded folders: per user on this computer, like the Hub's other folds). Opening a place goes through
 * Locations (`api.openLocation`, via the Hub's partner-open action), so the record that opens is Locations' own. Without `listModel` (an older
 * Locations) the Hub keeps showing what it showed before.
 */
import {esc} from './constants.mjs';
import {btn} from './buttons.mjs';
import {isCollapsed, setCollapsed, sectionKey} from './collapse.mjs';
import {linkButton} from './ag-html.mjs';

export const LOCATIONS_ID = 'ashen-gate-locations';
const SEARCH_DELAY = 150;

/** Locations' list-model function when that module is active and offers it, else null (then the Hub falls back). */
export function listModelApi(partnerApi) {
  const api = partnerApi(LOCATIONS_ID);
  return typeof api?.listModel === 'function' ? api : null;
}

/** This Hub window's view settings for the list (kept while the Hub is open; a fresh Hub starts clean). */
export function locUi(sheet) {
  return sheet.locUi ??= {query: '', filters: {}, sort: 'name', sortDesc: false, filtersOpen: false, filtering: false};
}

/** The options sent to Locations. The GM's Hub lists revealed places only, as it always has; Locations ignores filters and sort for a player. */
export const modelOptions = (ui, user) => ({query: ui.query, filters: ui.filters, sort: ui.sort, sortDesc: ui.sortDesc, revealedOnly: user?.isGM === true});

const foldKey = id => sectionKey('loc', id);

/** 0.65.0: "Your party is here" pin (Locations 0.36.0 flags). Shape + text, not colour; hidden unless it is meant to show. */
const HERE = 'Your party is here';
const herePin = hidden => `<span class="agch-loc__here" role="img" aria-label="${HERE}" data-tooltip="${HERE}" data-here-pin${hidden ? ' hidden' : ''}><i class="fa-solid fa-location-dot" aria-hidden="true"></i></span>`;

function rowHtml(r) {
  const kids = r.children?.length ? `<ul class="agch-loc__rows">${r.children.map(rowHtml).join('')}</ul>` : '';
  return `<li class="agch-loc__row${r.match === false ? ' agch-loc__row--path' : ''}">${linkButton(r.name, {data: {action: 'partner-open', partner: LOCATIONS_ID, ref: r.ref, agAlways: true}})}`
    + `${r.type ? ` <span class="agch-muted">${esc(r.type)}</span>` : ''}${r.active ? ' <span class="ag-badge ag-badge--ok">Here now</span>' : ''}`
    + `${r.restricted ? ' <span class="ag-badge">Selected players</span>' : ''}${kids}</li>`;
}

/** One folder: a header button that folds it, the places directly inside, then the folders inside it. While a search or filter is on, folders show open. */
function sectionHtml(s, filtering) {
  const key = foldKey(s.id), folded = !filtering && isCollapsed(key);
  // The pin shows on a folder that is itself the active place, or while it is folded around the active place (open folders show the place's own "Here now").
  const pin = s.hereNow ? herePin(false) : s.containsHere ? herePin(!folded) : '';
  const pinAttr = s.hereNow ? ' data-here-always' : '';
  const open = s.ref ? btn('partner-open', '', {kind: 'ghost sm', icon: 'fa-solid fa-arrow-up-right-from-square', data: {partner: LOCATIONS_ID, ref: s.ref}, title: `Open ${s.label}`, always: true, aria: `Open ${s.label}`}) : '';
  return `<li class="agch-loc__group">
    <h4 class="agch-loc__head"><button type="button" class="agch-loc__toggle" data-action="loc-fold" data-key="${esc(key)}" data-ag-always aria-expanded="${!folded}">`
    + `<i class="fa-solid fa-chevron-down agch-sec__chev" aria-hidden="true"></i><span class="agch-loc__name">${esc(s.label)}</span><span class="ag-badge agch-loc__count">${s.count}<span class="ag-sr-only"> places</span></span></button>${pin.replace('data-here-pin', `data-here-pin${pinAttr}`)}${open}</h4>
    <div class="agch-loc__body" data-sec-body="${esc(key)}"${folded ? ' hidden' : ''}>${s.rows.length ? `<ul class="agch-loc__rows">${s.rows.map(rowHtml).join('')}</ul>` : ''}`
    + `${s.sections.length ? `<ul class="agch-loc__groups">${s.sections.map(c => sectionHtml(c, filtering)).join('')}</ul>` : ''}</div></li>`;
}

const select = (attrs, label, options, value, all) => `<label class="ag-field ag-field--inline agch-loc__ctl"><span>${esc(label)}</span><select ${attrs} aria-label="${esc(label)}" data-ag-always>`
  + `${all === undefined ? '' : `<option value="">${esc(all)}</option>`}${options.map(o => `<option value="${esc(o.value)}"${o.value === value ? ' selected' : ''}>${esc(o.label)}${o.count === undefined ? '' : ` (${o.count})`}</option>`).join('')}</select></label>`;

/** The whole panel body for a model: toolbar (search, Filters, sort), the filter row, the folders, or an empty state. */
export function locationsListHtml(model, ui) {
  const c = model.controls, active = c.filters.filter(f => f.value).length;
  const search = `<label class="ag-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-agch-loc="query" placeholder="${esc(c.search.placeholder)}" aria-label="Search locations" value="${esc(ui.query)}" data-ag-always></label>`;
  const filtersChip = c.filters.length ? `<button type="button" class="ag-chip" data-action="loc-filters" data-ag-always aria-pressed="${ui.filtersOpen}" aria-expanded="${ui.filtersOpen}" aria-controls="agch-loc-filters"><i class="fa-solid fa-filter" aria-hidden="true"></i> Filters${active ? ` (${active})` : ''}</button>` : '';
  const sorts = c.sorts.length > 1 ? select('data-edit="loc-sort"', 'Sort by', c.sorts, c.sort)
    + (c.canReverse ? `<button type="button" class="ag-btn ag-btn--icon" data-action="loc-sortdir" data-ag-always aria-label="Sort direction: ${c.sortDesc ? 'descending' : 'ascending'}" data-tooltip="${c.sortDesc ? 'Descending (click for ascending)' : 'Ascending (click for descending)'}"><i class="fa-solid ${c.sortDesc ? 'fa-arrow-down-wide-short' : 'fa-arrow-up-short-wide'}" aria-hidden="true"></i></button>` : '') : '';
  const clear = model.filtering ? btn('loc-clear', 'Clear filters', {kind: 'ghost sm', icon: 'fa-solid fa-filter-circle-xmark', always: true}) : '';
  const count = model.audience === 'gm' ? `<span class="agch-muted agch-loc__count-line" role="status">Showing ${model.shown} of ${model.total}</span>` : '';
  const filterRow = ui.filtersOpen && c.filters.length ? `<div class="ag-toolbar__filters agch-loc__filters" id="agch-loc-filters" role="group" aria-label="Filter the list">${c.filters.map(f =>
    select(`data-edit="loc-filter" data-filter-key="${esc(f.key)}"`, f.label, f.options, f.value, f.all)).join('')}</div>` : '';
  const body = model.shown
    ? `<ul class="agch-loc__groups agch-loc__groups--root" aria-label="Locations by folder">${model.sections.map(s => sectionHtml(s, model.filtering)).join('')}</ul>`
    : model.empty === 'no-match'
      ? `<div class="ag-empty"><p class="ag-empty__title">Nothing matches</p><p class="ag-empty__text">No places match this search${c.filters.length ? ' and these filters' : ''}.</p>${clear}</div>`
      : '<div class="ag-empty"><p class="ag-empty__title">No places yet</p><p class="ag-empty__text">No places revealed yet.</p></div>';
  return `<div class="agch-loc" data-agch-locations><div class="ag-toolbar agch-loc__tools">${search}${filtersChip}${sorts}${clear && model.shown ? clear : ''}${count}</div>${filterRow}${body}</div>`;
}

/** Why a read was refused, worded like the other panels ("Not available to you right now."), so a player is never shown a half-empty shell. */
export const refused = err => /hidden|access|not available|permission|denied/i.test(err?.message ?? '');

/** The panel state for the Ashen Gate tab: {state: 'ok', html} or the same 'error' shape the other panels use. */
export function locationsPanelState(sheet, api, user) {
  const ui = locUi(sheet);
  try {
    const model = api.listModel(modelOptions(ui, user));
    ui.filtering = model.filtering === true;
    return {state: 'ok', html: locationsListHtml(model, ui)};
  } catch (err) {
    console.warn('ashen-gate-character-hub | locations list unavailable', err);
    const r = refused(err);
    return {state: 'error', refused: r, html: `<p class="agch-muted">${r ? 'Not available to you right now.' : 'Unavailable right now.'}</p>`};
  }
}

// ---------- interactions (called from the sheet's handlers) ----------

/** Search text: remembered at once, the list redrawn shortly after the last key. `delay` 0 redraws now (tests). */
export function setQuery(sheet, value, delay = SEARCH_DELAY) {
  const ui = locUi(sheet);
  ui.query = String(value ?? '');
  clearTimeout(ui.timer);
  if (!delay) return sheet.render();
  ui.timer = setTimeout(() => sheet.render(), delay);
  return null;
}
export function setFilter(sheet, key, value) { const ui = locUi(sheet); ui.filters = {...ui.filters, [key]: String(value ?? '')}; return sheet.render(); }
export function setSort(sheet, value) { locUi(sheet).sort = String(value ?? 'name'); return sheet.render(); }
export function toggleDirection(sheet) { const ui = locUi(sheet); ui.sortDesc = !ui.sortDesc; return sheet.render(); }
export function toggleFilters(sheet) { const ui = locUi(sheet); ui.filtersOpen = !ui.filtersOpen; return sheet.render(); }
export function clearAll(sheet) { const ui = locUi(sheet); ui.query = ''; ui.filters = {}; return sheet.render(); }

/**
 * Folds or unfolds one folder in place (no redraw, so the focus stays on its button). The choice is remembered per user, except while a
 * search or filter has every folder open: then it lasts only until the list is redrawn.
 */
export function foldFolder(sheet, target, root = sheet.element ?? target.closest?.('.agch-root')) {
  const key = target.dataset.key, folded = target.getAttribute('aria-expanded') !== 'false';
  target.setAttribute('aria-expanded', String(!folded));
  for (const el of root?.querySelectorAll?.(`[data-sec-body="${key}"]`) ?? []) el.hidden = folded;
  const pin = target.closest?.('h4')?.querySelector?.('[data-here-pin]:not([data-here-always])');
  if (pin) pin.hidden = !folded;
  return locUi(sheet).filtering ? {ok: true} : setCollapsed(key, folded);
}
