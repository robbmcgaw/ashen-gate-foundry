/**
 * Shared machinery for the one-line rows (0.51.0 Magic, 0.53.0 Combat, Inventory and Features): the row with its chevron and
 * on-demand detail, the list with pinned column headings, the in-place expand/collapse that keeps focus and the sheet's
 * remembered state, the band-height sync, and the per-user "show descriptions" client settings. spell-rows.mjs and
 * item-rows.mjs are thin callers; Magic's markup does not change.
 */
import {MODULE_ID, esc} from './constants.mjs';
import {cell, iconHtml, headHtml} from './cards.mjs';
import {sectionKey} from './collapse.mjs';
import {tooltipAttrs} from './tooltips.mjs';

/** Per user (client scope), default off: off = compact rows with the description on demand, on = the long rows. */
export function registerViewSetting(settings, onChange, key, name, hint) {
  settings?.register?.(MODULE_ID, key, {name, hint, scope: 'client', config: false, type: Boolean, default: false, onChange});
}
export function readViewSetting(key) {
  try { return globalThis.game?.settings?.get?.(MODULE_ID, key) === true; } catch { return false; }
}
export async function writeViewSetting(key, on) {
  try { await globalThis.game?.settings?.set?.(MODULE_ID, key, on === true); } catch (err) { return {ok: false, error: `The choice was not saved: ${err?.message ?? err}`}; }
  return {ok: true, result: on === true};
}
/** The Filters / View popover's switch. It saves at once and is marked so; it is a view choice, not a filter (not counted in Filters (n)). */
export const viewSwitch = (edit, label, on) => `<label class="agch-switchrow"><input type="checkbox" data-edit="${edit}" data-ag-always${on ? ' checked' : ''}> <span>${esc(label)}</span> <span class="ag-badge">Applies now</span></label>`;

const verb = open => (open ? 'Hide' : 'Show');
/**
 * One compact row. `p` is the class prefix (agch-spell for Magic, agch-crow for items), `action` the expand action, `extra`
 * more classes and `attrs` more attributes on the li, `lead` HTML before the star (a container's fold toggle).
 * `expanded` is the sheet's Set of open detail keys.
 */
export function compactRowHtml(row, columns, {p, action, controls = '', star = '', lead = '', badges = '', alt = false, expanded = null, listKey = '', iconUse = false, extra = '', attrs = '', facts = null, detailExtra = ''} = {}) {
  const key = sectionKey('more', listKey, row.id), open = expanded?.has?.(key) === true;
  const tip = tooltipAttrs(row.uuid, row.summary ? `${row.name}: ${row.summary}` : row.name);
  const aria = `aria-expanded="${open}" aria-controls="${esc(key)}"`;
  const data = `data-action="${action}" data-id="${esc(row.id)}" data-key="${esc(key)}" data-ag-always`;
  // `facts` (Magic 0.55.0, items 0.56.0): [label, value] pairs that are always in the open row (a value may be {html} for trusted
  // markup such as a badge); otherwise the columns marked `late`. `detailExtra` is trusted HTML after the facts (Inventory's quantity buttons).
  const late = facts ? facts.map(([l, v]) => `<div><dt>${esc(l)}</dt><dd>${v && v.html !== undefined ? v.html : esc(v || '—')}</dd></div>`).join('')
    : columns.filter(c => c.late).map(c => `<div><dt>${esc(c.label)}</dt><dd>${c.render ? c.render(row) : esc(row.facts?.[c.key] || '—')}</dd></div>`).join('');
  return `<li class="agch-card ${p}${alt ? ' is-alt' : ''}${open ? ' is-open' : ''}${extra}" data-item-id="${esc(row.id)}"${attrs}${row.uuid ? ` draggable="true" data-drag-uuid="${esc(row.uuid)}"` : ''}>`
    + `<span class="agch-card__lead">${lead}${star}</span>${iconHtml(row, iconUse)}`
    + `<span class="agch-card__main"><button type="button" class="${p}__chev" ${data} ${aria} aria-label="${esc(`${verb(open)} description of ${row.name}`)}" data-tooltip="${verb(open)} description"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>`
    + `<button type="button" class="agch-item__name ${p}__name" ${data} ${aria} tabindex="-1"${tip}>${esc(row.name)}</button>${badges ? `<span class="agch-item__badges">${badges}</span>` : ''}</span>`
    + `${columns.map(c => cell(c, row)).join('')}<span class="agch-item__controls agch-card__actions">${controls}</span>`
    + `<div class="agch-card__detail ${p}__detail" id="${esc(key)}" role="region" aria-label="${esc(`Description of ${row.name}`)}"${open ? '' : ' hidden'}>`
    + `${late ? `<dl class="${p}__facts">${late}</dl>` : ''}${detailExtra}<p class="${p}__text">${esc(row.details || 'No description.')}</p>`
    + `<button type="button" class="ag-btn ag-btn--sm ${p}__open" data-action="item-sheet" data-id="${esc(row.id)}" data-ag-always><span>Open ${esc(row.name)}</span></button></div></li>`;
}

/** A list of compact rows with the column headings (pinned by CSS while the list scrolls). `after(row)` adds HTML after a row. */
export function compactList(rows, columns, {p, action, listCls, rowOpts = () => ({}), after = () => '', listKey = '', expanded = null} = {}) {
  let i = 0;
  const body = rows.map(r => compactRowHtml(r, columns, {p, action, alt: (i++ % 2) === 1, expanded, listKey, ...rowOpts(r)}) + after(r)).join('');
  return `<ul class="ag-list agch-cards ${listCls}" style="--agch-cols:${columns.length}">${headHtml(columns)}${body}</ul>`;
}

/** Opens or closes one row's description in place (no redraw, so focus stays on the control); the sheet remembers it. */
export function toggleCompact(sheet, target, {p, action}) {
  const key = target.dataset.key, open = !sheet.expanded.has(key);
  if (open) sheet.expanded.add(key); else sheet.expanded.delete(key);
  const li = target.closest?.(`.${p}`);
  const detail = li?.querySelector?.(`.${p}__detail`);
  if (detail) detail.hidden = !open;
  li?.classList?.toggle?.('is-open', open);
  for (const b of li?.querySelectorAll?.(`[data-action="${action}"]`) ?? []) {
    b.setAttribute?.('aria-expanded', String(open));
    if (b.classList?.contains?.(`${p}__chev`)) b.setAttribute?.('aria-label', String(b.getAttribute?.('aria-label') ?? '').replace(/^(Show|Hide)/, verb(open)));
  }
  return {ok: true, result: open};
}

/**
 * The column headings pin under the toolbar band: the band's height goes into --agch-band-h on the scrolling body, and
 * is kept current when the band wraps (ResizeObserver, when there is one).
 */
export function syncBandHeight(content) {
  const body = content?.querySelector?.('.agch-body'), band = body?.querySelector?.('.agch-sticky');
  if (!body?.style) return;
  body._agchBandObserver?.disconnect?.();
  if (!band) { body.style.removeProperty?.('--agch-band-h'); return; }
  const set = () => body.style.setProperty('--agch-band-h', `${Math.ceil(band.getBoundingClientRect?.().height ?? band.offsetHeight ?? 0)}px`);
  set();
  if (typeof globalThis.ResizeObserver === 'function') { body._agchBandObserver = new globalThis.ResizeObserver(set); body._agchBandObserver.observe(band); }
}

// ---------- Shared layout rules for the one-line rows (0.56.0: Combat, Inventory, Features; Magic's constants keep their own steps) ----------

/**
 * The drop order of a priority constant: its optional list runs from the column that stays longest to the one that goes first,
 * so columns drop in the reverse order. (Magic's SPELL_PRIORITY and the item tabs' constants all read this way.)
 */
export const dropOrder = priority => [...(priority?.optional ?? [])].reverse();
/** Round up to the next 5px, the grain of the step widths. */
export const ceil5 = n => Math.ceil(n / 5) * 5;
/**
 * The Hub body width (px, at the default Compact tokens) a one-line row needs: border, row padding, the lead and icon tracks, a
 * name of at least `main`, the visible data columns, the actions track and the gaps between tracks. `cols` is the visible
 * columns' widths; `hidden` ids are left out. The step widths in item-rows.mjs are this, rounded up to 5px (and never below the
 * list's sideways-scroll minimum). The name track itself may shrink to 5rem before anything overflows, which is the slack that
 * absorbs the Comfortable size's larger tokens.
 */
export function rowNeed({metrics, lead, track, cols, hidden = [], widths = {}}) {
  const shown = cols.filter(k => !hidden.includes(k));
  const data = shown.reduce((sum, k) => sum + (widths[k] ?? 0), 0);
  const tracks = 3 + shown.length + 1;
  return metrics.border + metrics.rowPad + lead + metrics.icon + metrics.main + data + track + metrics.gap * (tracks - 1);
}
/**
 * A small state badge that stays beside the name (Equipped, Attuned): an icon and the word, so colour is never the only signal.
 * Below the badge step the word is visually hidden (CSS) and the tooltip and screen-reader text carry it.
 */
export const stateBadge = (icon, label, tip = label) => `<span class="ag-badge ag-badge--accent agch-sbadge" data-tooltip="${esc(tip)}"><i class="fa-solid ${icon}" aria-hidden="true"></i><span class="agch-sbadge__t"> ${esc(label)}</span></span>`;
