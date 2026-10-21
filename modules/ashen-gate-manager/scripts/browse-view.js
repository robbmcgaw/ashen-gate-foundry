/**
 * Browse tab markup (0.24.0). Pure string builders over searchIndex/detailOf results, so the Node suite can check
 * what a GM sees; main.js mounts them and wires the events. Read-only: no control here edits a record.
 */
import {FACETS, FACET_LABELS, SORTS, GROUPS, ownerLabel} from './browse.js';
import {ORIGINS, RARITIES} from './item-filters.js';
import {itemTooltipAttrs} from './item-preview.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const KIND_LABELS = {JournalEntry: 'Journal', JournalEntryPage: 'Journal page'};
export const kindLabel = kind => KIND_LABELS[kind] ?? kind;
export const DEFAULT_STATE = Object.freeze({query: '', scope: 'all', filters: {}, managedOnly: false, unlinkedOnly: false, sort: 'name', group: 'kind', page: 0, detailKey: null});

const options = (map, current) => Object.entries(map).map(([value, label]) => `<option value="${value}"${value === current ? ' selected' : ''}>${esc(label)}</option>`).join('');

/**
 * Sort, Group and Refresh for All items. Since 0.43.0 they sit inside the Items tab's one toolbar, which also owns the
 * search box, Clear filters and Load compendiums, so this returns the controls only (no toolbar of its own).
 */
export function toolbarHtml(state) {
  return `<label class="agmanager-search-label">Sort <select data-ag-browse-sort>${options(SORTS, state.sort)}</select></label>
    <label class="agmanager-search-label">Group <select data-ag-browse-group>${options(GROUPS, state.group)}</select></label>
    <button type="button" class="ag-btn ag-btn--sm ag-btn--ghost ag-btn--icon" data-ag-browse-refresh aria-label="Refresh the index" data-tooltip="Refresh the index" data-tooltip-class="ag-tooltip"><i class="fa-solid fa-rotate" aria-hidden="true"></i></button>`;
}

function facetSelect(f, list, current) {
  const has = current !== undefined && current !== null && current !== '' && current !== 'all';
  const missing = has && !list.some(o => o.value === String(current)) ? `<option value="${esc(current)}" selected>${esc(f === 'owner' ? ownerLabel(current) : current)} (0)</option>` : '';
  if (!list.length && !has) return '';
  return `<label class="agbrowse-facet"><span>${esc(FACET_LABELS[f])}</span><select data-ag-browse-facet="${f}">
    <option value="all">All</option>${missing}${list.map(o => `<option value="${esc(o.value)}"${o.selected ? ' selected' : ''}>${esc(o.label)} (${o.count})</option>`).join('')}</select></label>`;
}

const chip = (text, tone = '') => text ? `<span class="ag-badge${tone ? ` ag-badge--${tone}` : ''}">${esc(text)}</span>` : '';
/** Manager rarity keys (lower case) to the dnd5e keys the kit's data-rarity badge uses. */
const DND5E_RARITY = {veryrare: 'veryRare'};
/** Rarity badge from the kit (.ag-rarity-badge[data-rarity], ag-ui.css kit 2). */
export const rarityPill = key => RARITIES[key] ? `<span class="ag-rarity-badge" data-rarity="${DND5E_RARITY[key] ?? key}">${esc(RARITIES[key])}</span>` : '';
const visTone = v => v === 'gm' ? 'danger' : v === 'reveal_gated' || v === 'reveal-gated' ? 'warn' : v === 'player' ? 'ok' : '';
const statusTone = s => s === 'approved' ? 'ok' : s === 'draft' ? 'warn' : '';

function rowHtml(e) {
  const meta = [e.tier ? `Tier ${e.tier}` : null, e.profession, e.quality].filter(Boolean).map(esc).join(' · ');
  const jump = e.moduleOpen ?? (e.open?.type === 'module' || e.open?.type === 'codex' ? e.open : null);
  const openLabel = jump ? esc(jump.label ?? `Open in ${ownerLabel(jump.module)}`) : 'Open';
  return `<li class="agbrowse-row" data-ag-browse-key="${esc(e.key)}"${e.draggable && e.uuid ? ' draggable="true"' : ''}>
    <div class="agbrowse-main">
      <button type="button" class="agbrowse-name" data-ag-browse-detail="${esc(e.key)}"${e.kind === 'Item' ? itemTooltipAttrs(e.uuid) : ''}>${esc(e.name)}</button>
      ${e.id ? `<code>${esc(e.id)}</code>` : ''}
      <div class="agbrowse-chips">${(e.kinds ?? [e.kind]).map(k => chip(kindLabel(k), 'accent')).join('')}${chip(e.entityType && e.entityType !== e.kind ? e.entityType : e.docType)}${chip(e.status, statusTone(e.status))}${chip(e.visibility, visTone(e.visibility))}${(e.chips ?? []).map(c => chip(c)).join('')}${e.unlinked ? chip('no world document') : ''}${rarityPill(e.rarity)}${e.origin && e.origin !== 'ag' ? chip(ORIGINS[e.origin]) : ''}${e.coreRef ? chip('core_ref') : ''}</div>
      ${meta ? `<div class="agmanager-tiny">${meta}</div>` : ''}
      <div class="agmanager-tiny agbrowse-prov">${esc(e.sources.join(' • '))}${e.folder ? ` — ${esc(e.folder)}` : ''}</div>
    </div>
    <div class="agbrowse-actions">
      <button type="button" class="ag-btn ag-btn--sm" data-ag-browse-open="${esc(e.key)}">${openLabel}</button>
      ${e.moduleOpen && e.uuid ? `<button type="button" class="ag-btn ag-btn--sm" data-ag-browse-sheet="${esc(e.key)}">Sheet</button>` : ''}
      ${e.id ? `<button type="button" class="ag-btn ag-btn--sm ag-btn--ghost" data-ag-browse-copy="${esc(e.id)}" aria-label="Copy id ${esc(e.id)}"><i class="fa-solid fa-copy" aria-hidden="true"></i> Copy id</button>` : ''}
    </div>
  </li>`;
}

function detailHtml(d) {
  if (!d) return '<p class="agmanager-tiny">Pick a name to see its details and related records.</p>';
  const link = r => r.key ? `<button type="button" class="agbrowse-link" data-ag-browse-detail="${esc(r.key)}">${esc(r.name)}</button> <code>${esc(r.id)}</code>` : `<code>${esc(r.id)}</code> <span class="agmanager-tiny">not in the index</span>`;
  const item = d.entry.kind === 'Item' && d.entry.uuid;
  return `<h3>${esc(d.entry.name)}</h3>
    ${item ? `<div class="agpreview" data-ag-item-preview="${esc(d.entry.key)}" aria-live="polite"><p class="agmanager-tiny">Loading item card…</p></div>` : ''}
    ${item ? '<details class="agbrowse-more"><summary>Index fields</summary>' : ''}<dl class="agbrowse-fields">${d.fields.map(f => `<dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd>`).join('')}</dl>${item ? '</details>' : ''}
    ${d.description ? `<p class="agbrowse-desc">${esc(d.description)}</p>` : ''}
    <h4>Names (${d.outgoing.length})</h4>${d.outgoing.length ? `<ul>${d.outgoing.map(r => `<li>${link(r)}</li>`).join('')}</ul>` : '<p class="agmanager-tiny">No related ids.</p>'}
    <h4>Named by (${d.incoming.length})</h4>${d.incoming.length ? `<ul>${d.incoming.map(r => `<li>${link(r)}</li>`).join('')}</ul>` : '<p class="agmanager-tiny">Nothing names this id.</p>'}
    <button type="button" class="ag-btn ag-btn--sm ag-btn--ghost" data-ag-browse-close>Close details</button>`;
}

/** Same pager style as Ashen Gate records: small ghost chevron buttons with a label and tooltip. */
const pagerButton = (step, label, icon, enabled) => `<button type="button" class="ag-btn ag-btn--sm ag-btn--ghost ag-btn--icon" data-ag-browse-page="${step}" aria-label="${label}" data-tooltip="${label}" data-tooltip-class="ag-tooltip"${enabled ? '' : ' disabled'}><i class="fa-solid ${icon}" aria-hidden="true"></i></button>`;

/** Scope, facets, results, pager and the detail panel; re-rendered on every change except typing focus. */
export function bodyHtml(state, result, detail, status = {}) {
  const scope = [['ag', 'Ashen Gate'], ['nonag', 'Non-Ashen Gate'], ['all', 'All']].map(([v, l]) =>
    `<button type="button" role="radio" aria-checked="${state.scope === v}" data-ag-browse-scope="${v}">${l} (${result.scopes[v]})</button>`).join('');
  const facets = FACETS.map(f => facetSelect(f, result.facets[f], state.filters[f])).join('');
  const groups = result.groups.map(g => `${g.label ? `<li class="agbrowse-group"><strong>${esc(g.label)}</strong> <span class="agmanager-tiny">${g.total}</span></li>` : ''}${g.rows.map(rowHtml).join('')}`).join('');
  const packs = status.loading ? 'Loading compendium indexes…' : status.compendiums ? `${status.compendiumCount} compendium entries loaded.` : 'Compendiums are not loaded (press Load compendiums).';
  return `<div class="ag-segmented agbrowse-scope" role="radiogroup" aria-label="Show">${scope}</div>
    <div class="agbrowse-facets">${facets}
      <label class="agbrowse-check"><input type="checkbox" data-ag-browse-managed${state.managedOnly ? ' checked' : ''}/> Only imported by Manager</label>
      <label class="agbrowse-check"><input type="checkbox" data-ag-browse-unlinked${state.unlinkedOnly ? ' checked' : ''}/> Unlinked (no world document)</label>
    </div>
    <p class="agmanager-tiny agbrowse-status">${result.total ? `${result.from}–${result.to} of ${result.total}` : 'No matches.'} ${esc(packs)} Read-only: drag a world or compendium row onto a sheet, canvas or journal.</p>
    <div class="agbrowse-layout">
      <ol class="agbrowse-results">${groups}</ol>
      <aside class="agbrowse-detail" aria-label="Details">${detailHtml(detail)}</aside>
    </div>
    <div class="aglib-pager agbrowse-pager">
      ${pagerButton(-1, 'Previous page', 'fa-chevron-left', result.page > 0)}
      <span class="aglib-num">Page ${result.page + 1} of ${result.pages}</span>
      ${pagerButton(1, 'Next page', 'fa-chevron-right', result.page + 1 < result.pages)}
    </div>`;
}
