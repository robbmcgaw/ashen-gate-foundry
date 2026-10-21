/**
 * Collapsible sections (headings and inventory containers). Which ones are collapsed is remembered per user on this
 * computer in one client setting, `collapsedSections` ({key: true}). A missing or odd value just means "all open".
 * Toggling changes the DOM directly (no re-render) and saves the setting; the next render reads it again.
 */
import {MODULE_ID, esc} from './constants.mjs';

export const COLLAPSE_SETTING = 'collapsedSections';
/** Keys kept at most (container keys are item ids and pile up over a campaign); the oldest are dropped first. */
export const COLLAPSE_MAX = 300;

/** Section keys are made from tab ids, group keys and item ids; anything else is stripped so they are safe in selectors. */
export const sectionKey = (...parts) => parts.map(p => String(p ?? '').replace(/[^A-Za-z0-9_-]/g, '')).join(':');

export function registerCollapseSetting(settings) {
  settings.register(MODULE_ID, COLLAPSE_SETTING, {scope: 'client', config: false, type: Object, default: {}});
}

export function collapsedState() {
  try {
    const v = globalThis.game?.settings?.get?.(MODULE_ID, COLLAPSE_SETTING);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}
export const isCollapsed = key => collapsedState()[key] === true;

/** Saves one key. Only `true` entries are stored; reopening a section removes its key. */
export async function setCollapsed(key, collapsed) {
  const next = {...collapsedState()};
  delete next[key];
  if (collapsed) next[key] = true;
  const keys = Object.keys(next);
  for (const k of keys.slice(0, Math.max(0, keys.length - COLLAPSE_MAX))) delete next[k];
  try { await globalThis.game?.settings?.set?.(MODULE_ID, COLLAPSE_SETTING, next); } catch (err) { console.warn(`${MODULE_ID} | collapsed sections not saved`, err); }
  return {ok: true, result: next};
}

/** The chevron button that opens/closes a section. `always`: observers can fold sections too. */
export function toggleButton(key, label, {icon = false} = {}) {
  const open = !isCollapsed(key);
  const chevron = `<i class="fa-solid fa-chevron-down agch-sec__chev" aria-hidden="true"></i>`;
  return icon
    ? `<button type="button" class="agch-sec__toggle agch-sec__toggle--icon" data-action="section-toggle" data-key="${esc(key)}" data-ag-always aria-expanded="${open}" title="${open ? 'Collapse' : 'Expand'} ${esc(label)}" aria-label="${open ? 'Collapse' : 'Expand'} ${esc(label)}">${chevron}</button>`
    : `<button type="button" class="agch-sec__toggle" data-action="section-toggle" data-key="${esc(key)}" data-ag-always aria-expanded="${open}">${chevron}<span class="agch-sec__title">${label}</span></button>`;
}
/** Attributes for the element a toggle opens and closes. */
export const bodyAttrs = key => ` data-sec-body="${esc(key)}"${isCollapsed(key) ? ' hidden' : ''}`;

/** A heading with a collapse toggle and its body. `titleHtml` is trusted HTML (callers escape names). */
export function sectionHtml(key, titleHtml, bodyHtml, {extra = ''} = {}) {
  return `<section class="agch-sec${extra ? ` ${extra}` : ''}" data-sec="${esc(key)}"><h3 class="agch-heading agch-sec__head">${toggleButton(key, titleHtml)}</h3>
    <div class="agch-sec__body"${bodyAttrs(key)}>${bodyHtml}</div></section>`;
}

/** Flips a section in the open sheet without a re-render and remembers it. */
export function toggleSection(root, key) {
  const now = !isCollapsed(key);
  const sel = `[data-sec-body="${key}"]`, btnSel = `[data-action="section-toggle"][data-key="${key}"]`;
  for (const el of root?.querySelectorAll?.(sel) ?? []) el.hidden = now;
  for (const b of root?.querySelectorAll?.(btnSel) ?? []) {
    b.setAttribute?.('aria-expanded', String(!now));
    if (b.classList?.contains?.('agch-sec__toggle--icon')) { const t = `${now ? 'Expand' : 'Collapse'}${(b.title ?? '').replace(/^(Expand|Collapse)/, '')}`; b.title = t; b.setAttribute?.('aria-label', t); }
  }
  return setCollapsed(key, now);
}
