import {esc} from './constants.mjs';

/**
 * The accessible name a button gets besides its visible label (0.33.0, CH-18). An icon-only button is named by its
 * tooltip. A labelled button keeps its label as its name; only when the tooltip starts with the label and names the
 * object ("Use Longsword" for "Use") does that become the name, so repeated buttons stay apart. `aria` names a button
 * whose label is only a number; it must contain the label ("Roll initiative +2").
 */
export function ariaName(label, title, aria = '') {
  if (aria) return aria;
  if (!label) return title || '';
  const t = String(title ?? '').replace(/\s*\([^)]*\)\s*$/, '');
  return t.length > label.length && t.toLowerCase().startsWith(String(label).toLowerCase()) ? t : '';
}
/** A kit button. `always` keeps it clickable for observers (tabs, Help, open sheets). `title` is the tooltip. */
export const btn = (action, label, {kind = '', icon = '', data = {}, title = '', disabled = false, always = false, extra = '', aria = ''} = {}) => {
  const name = ariaName(label, title, aria);
  return `<button type="button" class="ag-btn${kind ? ` ag-btn--${kind}` : ''}${extra ? ` ${extra}` : ''}" data-action="${action}"${Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('')}${title ? ` data-tooltip="${esc(title)}"` : ''}${name ? ` aria-label="${esc(name)}"` : ''}${disabled ? ' disabled' : ''}${always ? ' data-ag-always' : ''}>${icon ? `<i class="${icon}" aria-hidden="true"></i>` : ''}${label ? `<span>${esc(label)}</span>` : ''}</button>`;
};
