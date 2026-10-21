import {esc} from './constants.mjs';

/** A kit button. `always` keeps it clickable for observers (tabs, Help, open sheets). */
export const btn = (action, label, {kind = '', icon = '', data = {}, title = '', disabled = false, always = false, extra = ''} = {}) =>
  `<button type="button" class="ag-btn${kind ? ` ag-btn--${kind}` : ''}${extra ? ` ${extra}` : ''}" data-action="${action}"${Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('')}${title ? ` data-tooltip="${esc(title)}" aria-label="${esc(title)}"` : ''}${disabled ? ' disabled' : ''}${always ? ' data-ag-always' : ''}>${icon ? `<i class="${icon}" aria-hidden="true"></i>` : ''}${label ? `<span>${esc(label)}</span>` : ''}</button>`;
