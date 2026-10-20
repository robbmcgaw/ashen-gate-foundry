/**
 * Browse tab markup (0.24.0). Pure string builders over searchIndex/detailOf results, so the Node suite can check
 * what a GM sees; main.js mounts them and wires the events. Read-only: no control here edits a record.
 */
import {FACETS, FACET_LABELS, SORTS, GROUPS, ownerLabel} from './browse.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const KIND_LABELS = {JournalEntry: 'Journal', JournalEntryPage: 'Journal page'};
export const kindLabel = kind => KIND_LABELS[kind] ?? kind;
export const DEFAULT_STATE = Object.freeze({query: '', scope: 'all', filters: {}, managedOnly: false, unlinkedOnly: false, sort: 'name', group: 'kind', page: 0, detailKey: null});

const options = (map, current) => Object.entries(map).map(([value, label]) => `<option value="${value}"${value === current ? ' selected' : ''}>${esc(label)}</option>`).join('');

/** Search box and the actions that never re-render while typing. */
export function toolbarHtml(state) {
  return `<div class="ag-toolbar agbrowse-toolbar">
    <input type="search" data-ag-browse-query value="${esc(state.query)}" placeholder="Search name, id, tag, text… (id:MAT-HERB, id:DEITY-, type:deity, tag:, status:, tier:)" aria-label="Search Browse" />
    <label>Sort <select data-ag-browse-sort>${options(SORTS, state.sort)}</select></label>
    <label>Group <select data-ag-browse-group>${options(GROUPS, state.group)}</select></label>
    <button type="button" data-ag-browse-refresh><i class="fa-solid fa-rotate"></i> Refresh</button>
    <button type="button" data-ag-browse-packs><i class="fa-solid fa-book-atlas"></i> <span data-ag-browse-packs-label>Load compendiums</span></button>
  </div>`;
}

function facetSelect(f, list, current) {
  const has = current !== undefined && current !== null && current !== '' && current !== 'all';
  const missing = has && !list.some(o => o.value === String(current)) ? `<option value="${esc(current)}" selected>${esc(f === 'owner' ? ownerLabel(current) : current)} (0)</option>` : '';
  if (!list.length && !has) return '';
  return `<label class="agbrowse-facet"><span>${esc(FACET_LABELS[f])}</span><select data-ag-browse-facet="${f}">
    <option value="all">All</option>${missing}${list.map(o => `<option value="${esc(o.value)}"${o.selected ? ' selected' : ''}>${esc(o.label)} (${o.count})</option>`).join('')}</select></label>`;
}

const chip = (text, tone = '') => text ? `<span class="ag-badge${tone ? ` ag-badge--${tone}` : ''}">${esc(text)}</span>` : '';
const visTone = v => v === 'gm' ? 'danger' : v === 'reveal_gated' || v === 'reveal-gated' ? 'warn' : v === 'player' ? 'ok' : '';
const statusTone = s => s === 'approved' ? 'ok' : s === 'draft' ? 'warn' : '';

function rowHtml(e) {
  const meta = [e.tier ? `Tier ${e.tier}` : null, e.profession, e.quality].filter(Boolean).map(esc).join(' · ');
  const jump = e.moduleOpen ?? (e.open?.type === 'module' || e.open?.type === 'codex' ? e.open : null);
  const openLabel = jump ? esc(jump.label ?? `Open in ${ownerLabel(jump.module)}`) : 'Open';
  return `<li class="agbrowse-row" data-ag-browse-key="${esc(e.key)}"${e.draggable && e.uuid ? ' draggable="true"' : ''}>
    <div class="agbrowse-main">
      <button type="button" class="agbrowse-name" data-ag-browse-detail="${esc(e.key)}">${esc(e.name)}</button>
      ${e.id ? `<code>${esc(e.id)}</code>` : ''}
      <div class="agbrowse-chips">${(e.kinds ?? [e.kind]).map(k => chip(kindLabel(k), 'accent')).join('')}${chip(e.entityType && e.entityType !== e.kind ? e.entityType : e.docType)}${chip(e.status, statusTone(e.status))}${chip(e.visibility, visTone(e.visibility))}${(e.chips ?? []).map(c => chip(c)).join('')}${e.unlinked ? chip('no world document') : ''}</div>
      ${meta ? `<div class="agmanager-tiny">${meta}</div>` : ''}
      <div class="agmanager-tiny agbrowse-prov">${esc(e.sources.join(' • '))}${e.folder ? ` — ${esc(e.folder)}` : ''}</div>
    </div>
    <div class="agbrowse-actions">
      <button type="button" data-ag-browse-open="${esc(e.key)}">${openLabel}</button>
      ${e.moduleOpen && e.uuid ? `<button type="button" data-ag-browse-sheet="${esc(e.key)}">Sheet</button>` : ''}
      ${e.id ? `<button type="button" data-ag-browse-copy="${esc(e.id)}" aria-label="Copy id ${esc(e.id)}"><i class="fa-solid fa-copy"></i> Copy id</button>` : ''}
    </div>
  </li>`;
}

function detailHtml(d) {
  if (!d) return '<p class="agmanager-tiny">Pick a name to see its details and related records.</p>';
  const link = r => r.key ? `<button type="button" class="agbrowse-link" data-ag-browse-detail="${esc(r.key)}">${esc(r.name)}</button> <code>${esc(r.id)}</code>` : `<code>${esc(r.id)}</code> <span class="agmanager-tiny">not in the index</span>`;
  return `<h3>${esc(d.entry.name)}</h3>
    <dl class="agbrowse-fields">${d.fields.map(f => `<dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd>`).join('')}</dl>
    ${d.description ? `<p class="agbrowse-desc">${esc(d.description)}</p>` : ''}
    <h4>Names (${d.outgoing.length})</h4>${d.outgoing.length ? `<ul>${d.outgoing.map(r => `<li>${link(r)}</li>`).join('')}</ul>` : '<p class="agmanager-tiny">No related ids.</p>'}
    <h4>Named by (${d.incoming.length})</h4>${d.incoming.length ? `<ul>${d.incoming.map(r => `<li>${link(r)}</li>`).join('')}</ul>` : '<p class="agmanager-tiny">Nothing names this id.</p>'}
    <button type="button" data-ag-browse-close>Close details</button>`;
}

/** Scope, facets, results, pager and the detail panel; re-rendered on every change except typing focus. */
export function bodyHtml(state, result, detail, status = {}) {
  const scope = [['ag', 'Ashen Gate'], ['nonag', 'Non-Ashen Gate'], ['all', 'All']].map(([v, l]) =>
    `<button type="button" role="radio" aria-checked="${state.scope === v}" class="${state.scope === v ? 'active' : ''}" data-ag-browse-scope="${v}">${l} (${result.scopes[v]})</button>`).join('');
  const facets = FACETS.map(f => facetSelect(f, result.facets[f], state.filters[f])).join('');
  const groups = result.groups.map(g => `${g.label ? `<li class="agbrowse-group"><strong>${esc(g.label)}</strong> <span class="agmanager-tiny">${g.total}</span></li>` : ''}${g.rows.map(rowHtml).join('')}`).join('');
  const packs = status.loading ? 'Loading compendium indexes…' : status.compendiums ? `${status.compendiumCount} compendium entries loaded.` : 'Compendiums are not loaded (press Load compendiums).';
  return `<div class="agbrowse-scope" role="radiogroup" aria-label="Show">${scope}</div>
    <div class="agbrowse-facets">${facets}
      <label class="agbrowse-check"><input type="checkbox" data-ag-browse-managed${state.managedOnly ? ' checked' : ''}/> Only imported by Manager</label>
      <label class="agbrowse-check"><input type="checkbox" data-ag-browse-unlinked${state.unlinkedOnly ? ' checked' : ''}/> Unlinked (no world document)</label>
      <button type="button" data-ag-browse-clear${result.activeFilters ? '' : ' disabled'}>Clear (${result.activeFilters})</button>
    </div>
    <p class="agmanager-tiny agbrowse-status">${result.total ? `${result.from}–${result.to} of ${result.total}` : 'No matches.'} ${esc(packs)} Read-only: drag a world or compendium row onto a sheet, canvas or journal.</p>
    <div class="agbrowse-layout">
      <ol class="agbrowse-results">${groups}</ol>
      <aside class="agbrowse-detail" aria-label="Details">${detailHtml(detail)}</aside>
    </div>
    <div class="agmanager-row agbrowse-pager">
      <button type="button" data-ag-browse-page="-1"${result.page > 0 ? '' : ' disabled'}>Previous</button>
      <span class="agmanager-tiny">Page ${result.page + 1} of ${result.pages}</span>
      <button type="button" data-ag-browse-page="1"${result.page + 1 < result.pages ? '' : ' disabled'}>Next</button>
    </div>`;
}
