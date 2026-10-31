/**
 * Reset travel day… (0.40.1): the labelled, danger confirmation the GM opens from the Travel tab to put the day back for testing.
 * A custom DialogV2 (a form plus a danger confirm) in the kit's classes: Cancel is the default button, the action is "Reset day".
 */
import {esc, readForm} from './ag-dialogs.mjs';

/** The four tick boxes, in the order shown, with their defaults. */
export const RESET_OPTIONS = Object.freeze([
  {name: 'clearJournal', label: 'Clear the travel journal', checked: false},
  {name: 'clearUsed', label: 'Clear today’s actions used (restore all actions)', checked: true},
  {name: 'clearRequests', label: 'Clear pending requests', checked: false},
  {name: 'clearDaily', label: 'Clear the daily condition overlay', checked: true}
]);

/** {day, clearJournal, clearUsed, clearRequests, clearDaily} from a submitted form (readForm output); a bad or empty day reads as 1. */
export function resetOptionsFromForm(form) {
  const f = form ?? {}, n = Math.trunc(Number(String(f.day ?? '').trim() || 1));
  return {day: Number.isFinite(n) && n >= 1 ? Math.min(n, 99999) : 1, ...Object.fromEntries(RESET_OPTIONS.map(o => [o.name, Array.isArray(f[o.name]) && f[o.name].length > 0]))};
}

/** Resolves the options to pass to api.overland.resetDay(), or null when cancelled (or when the browser has no DialogV2). */
export async function resetDayDialog() {
  const D = globalThis.foundry?.applications?.api?.DialogV2;
  if (!D?.wait) return null;
  const content = `<p>Puts the travel day back for testing. Players see the normal refresh and nothing else. Locations, Regions and their persistent conditions are not touched.</p>
    <div class="form-group"><label for="agl-reset-day">Day number</label><div class="form-fields"><input id="agl-reset-day" type="number" name="day" value="1" min="1" max="99999" step="1" inputmode="numeric"></div></div>
    <fieldset class="agl-reset-opts"><legend>Also</legend>${RESET_OPTIONS.map(o => `<label class="checkbox"><input type="checkbox" name="${esc(o.name)}" value="1"${o.checked ? ' checked' : ''}> ${esc(o.label)}</label>`).join('')}</fieldset>`;
  const result = await D.wait({ // ag-lint-allow: a form plus danger confirm that confirmDanger cannot hold
    classes: ['ag-app', 'ag-dialog', 'ag-dialog--danger', 'ag-dialog--danger-confirm'], window: {title: 'Reset travel day?'}, content, modal: true, rejectClose: false,
    buttons: [{action: 'cancel', label: 'Cancel', default: true, callback: () => null},
      {action: 'confirm', label: 'Reset day', default: false, callback: (event, button) => resetOptionsFromForm(readForm(button?.form ?? event?.currentTarget?.form))}]
  });
  return result && typeof result === 'object' ? result : null;
}
