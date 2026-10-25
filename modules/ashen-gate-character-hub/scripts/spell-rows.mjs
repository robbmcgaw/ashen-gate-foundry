/**
 * Magic tab rows (0.51.0). By default a spell is one line (star, icon, name, school, casting time, range, duration with
 * C / R badges, components, Prepare, Cast) and its description opens on demand beneath it. The per-user client setting
 * "Show spell descriptions" (default off) brings back the long rows of 0.50 (cards.mjs cardList). Also the prepared-spell
 * count shown in the level strip, and the band-height sync that pins the column headings under the toolbar.
 */
import {MODULE_ID, esc} from './constants.mjs';
import {cell, iconHtml, headHtml} from './cards.mjs';
import {sectionKey} from './collapse.mjs';
import {tooltipAttrs} from './tooltips.mjs';
import {indicatorText} from './spell-prep.mjs';

export const DESCRIPTIONS_SETTING = 'showSpellDescriptions';

/** Per user (client scope), default off: off = compact rows with the description on demand, on = long rows. */
export function registerSpellViewSetting(settings, onChange) {
  settings?.register?.(MODULE_ID, DESCRIPTIONS_SETTING, {name: 'Character Hub: show spell descriptions', hint: 'Show each spell\'s description under its name in the Magic tab. Off: one line per spell, open the description on demand.', scope: 'client', config: false, type: Boolean, default: false, onChange});
}
export function showDescriptions() {
  try { return globalThis.game?.settings?.get?.(MODULE_ID, DESCRIPTIONS_SETTING) === true; } catch { return false; }
}
export async function setShowDescriptions(on) {
  try { await globalThis.game?.settings?.set?.(MODULE_ID, DESCRIPTIONS_SETTING, on === true); } catch (err) { return {ok: false, error: `The choice was not saved: ${err?.message ?? err}`}; }
  return {ok: true, result: on === true};
}

/** The Filters popover's switch. It saves at once and is marked so; it is a view choice, not a filter (not counted in Filters (n)). */
export const descriptionsToggle = () => `<label class="agch-switchrow"><input type="checkbox" data-edit="spell-descriptions" data-ag-always${showDescriptions() ? ' checked' : ''}> <span>Show spell descriptions</span> <span class="ag-badge">Applies now</span></label>`;

const verb = open => (open ? 'Hide' : 'Show');
/** One compact spell row. `expanded` is the sheet's Set of open detail keys. */
export function spellRowHtml(row, columns, {controls = '', star = '', badges = '', alt = false, expanded = null, listKey = '', iconUse = false} = {}) {
  const key = sectionKey('more', listKey, row.id), open = expanded?.has?.(key) === true;
  const tip = tooltipAttrs(row.uuid, row.summary ? `${row.name}: ${row.summary}` : row.name);
  const aria = `aria-expanded="${open}" aria-controls="${esc(key)}"`;
  const data = `data-action="spell-expand" data-id="${esc(row.id)}" data-key="${esc(key)}" data-ag-always`;
  const late = columns.filter(c => c.late).map(c => `<div><dt>${esc(c.label)}</dt><dd>${c.render ? c.render(row) : esc(row.facts?.[c.key] || '—')}</dd></div>`).join('');
  return `<li class="agch-card agch-spell${alt ? ' is-alt' : ''}${open ? ' is-open' : ''}" data-item-id="${esc(row.id)}"${row.uuid ? ` draggable="true" data-drag-uuid="${esc(row.uuid)}"` : ''}>`
    + `<span class="agch-card__lead">${star}</span>${iconHtml(row, iconUse)}`
    + `<span class="agch-card__main"><button type="button" class="agch-spell__chev" ${data} ${aria} aria-label="${esc(`${verb(open)} description of ${row.name}`)}" data-tooltip="${verb(open)} description"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>`
    + `<button type="button" class="agch-item__name agch-spell__name" ${data} ${aria} tabindex="-1"${tip}>${esc(row.name)}</button>${badges ? `<span class="agch-item__badges">${badges}</span>` : ''}</span>`
    + `${columns.map(c => cell(c, row)).join('')}<span class="agch-item__controls agch-card__actions">${controls}</span>`
    + `<div class="agch-card__detail agch-spell__detail" id="${esc(key)}" role="region" aria-label="${esc(`Description of ${row.name}`)}"${open ? '' : ' hidden'}>`
    + `${late ? `<dl class="agch-spell__facts">${late}</dl>` : ''}<p class="agch-spell__text">${esc(row.details || 'No description.')}</p>`
    + `<button type="button" class="ag-btn ag-btn--sm agch-spell__open" data-action="item-sheet" data-id="${esc(row.id)}" data-ag-always><span>Open ${esc(row.name)}</span></button></div></li>`;
}

/** A list of compact spell rows with the column headings (pinned by CSS while the list scrolls). */
export function spellList(rows, columns, {card = () => ({}), listKey = '', expanded = null} = {}) {
  let i = 0;
  const body = rows.map(r => spellRowHtml(r, columns, {alt: (i++ % 2) === 1, expanded, listKey, ...card(r)})).join('');
  return `<ul class="ag-list agch-cards agch-spelllist agch-spells" style="--agch-cols:${columns.length}">${headHtml(columns)}${body}</ul>`;
}

/** Opens or closes one row's description in place (no redraw, so focus stays on the control); the sheet remembers it. */
export function toggleSpell(sheet, target) {
  const key = target.dataset.key, open = !sheet.expanded.has(key);
  if (open) sheet.expanded.add(key); else sheet.expanded.delete(key);
  const li = target.closest?.('.agch-spell');
  const detail = li?.querySelector?.('.agch-spell__detail');
  if (detail) detail.hidden = !open;
  li?.classList?.toggle?.('is-open', open);
  for (const b of li?.querySelectorAll?.('[data-action="spell-expand"]') ?? []) {
    b.setAttribute?.('aria-expanded', String(open));
    if (b.classList?.contains?.('agch-spell__chev')) b.setAttribute?.('aria-label', String(b.getAttribute?.('aria-label') ?? '').replace(/^(Show|Hide)/, verb(open)));
  }
  return {ok: true, result: open};
}

/**
 * The prepared-spell count per class, as small items at the end of the level strip's existing flex row (no padding or
 * margin is added to the strip, so nothing moves). One class: "Prepared 4/6"; several: "Wizard 4/6" each. At the limit
 * the text says "full" and carries a check icon; the aria-label always says it in full.
 */
export function preparedIndicator(classes) {
  const shown = (classes ?? []).filter(c => c.known || c.value > 0), named = shown.length > 1;
  return shown.map(c => {
    const t = indicatorText(c, {named}), state = c.over ? ' is-over' : t.full ? ' is-full' : '';
    const icon = c.over ? 'fa-triangle-exclamation' : t.full ? 'fa-circle-check' : '';
    return `<span class="ag-badge agch-prepcount${state}" role="img" aria-label="${esc(t.tip)}" data-tooltip="${esc(t.tip)}">${icon ? `<i class="fa-solid ${icon}" aria-hidden="true"></i> ` : ''}${esc(t.text)}${c.over ? ' over' : t.full ? ' full' : ''}</span>`;
  }).join('');
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
