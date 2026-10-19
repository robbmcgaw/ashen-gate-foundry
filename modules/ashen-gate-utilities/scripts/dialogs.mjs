/**
 * Small DialogV2 helpers (Foundry's desktop app has no native prompt/confirm/alert).
 * Each helper feature-detects DialogV2 at call time and only falls back to the browser's
 * dialogs when DialogV2 is absent; with neither available it resolves as "cancelled".
 */
const dialogV2 = () => globalThis.foundry?.applications?.api?.DialogV2;
const native = name => { const fn = globalThis.window?.[name] ?? globalThis[name]; return typeof fn === 'function' ? fn : null; };
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const paragraphs = text => String(text ?? '').split('\n').map(line => `<p>${esc(line)}</p>`).join('');

/** Reads {name: value} from a submitted DialogV2 form. */
export function readForm(form) {
  const out = {};
  for (const el of form?.elements ?? []) {
    if (!el?.name) continue;
    // Checkboxes collect the ticked values into an array (absent when none are ticked).
    if (el.type === 'checkbox') { if (el.checked) (out[el.name] ??= []).push(el.value); }
    else out[el.name] = el.value;
  }
  return out;
}

/** Yes/no question. Cancel is on the left, the labelled action on the right. Resolves true only on the action. */
export async function confirmDialog(message, {title = 'Confirm', yes = 'Confirm', no = 'Cancel'} = {}) {
  const D = dialogV2();
  if (D?.wait) {
    return (await D.wait({
      window: {title}, content: paragraphs(message), modal: true, rejectClose: false,
      buttons: [{action: 'cancel', label: no, callback: () => false}, {action: 'confirm', label: yes, default: true, callback: () => true}]
    })) === true;
  }
  if (D?.confirm) return Boolean(await D.confirm({window: {title}, content: paragraphs(message), yes: {label: yes}, no: {label: no}, rejectClose: false, modal: true}));
  const fn = native('confirm');
  return fn ? Boolean(fn(message)) : false;
}

/**
 * Form dialog. fields: [{name, label, value, type: 'text'|'textarea'|'number'|'select'|'checkbox'|'checklist', options: [{value,label,checked}], checked, hint}].
 * Resolves {name: string} on the action button (checkbox/checklist: array of ticked values, absent if none), or null when cancelled or closed.
 */
export async function formDialog(title, fields, {ok = 'Save', cancel = 'Cancel'} = {}) {
  const D = dialogV2();
  if (D?.wait) {
    const row = f => {
      const id = `agdlg-${esc(f.name)}`;
      let control;
      if (f.type === 'checklist') return `<fieldset class="form-group"><legend>${esc(f.label)}</legend>${(f.options ?? []).map(o => `<label class="checkbox"><input type="checkbox" name="${esc(f.name)}" value="${esc(o.value)}"${o.checked ? ' checked' : ''}> ${esc(o.label ?? o.value)}</label>`).join('')}${f.hint ? `<p class="hint">${esc(f.hint)}</p>` : ''}</fieldset>`;
      if (f.type === 'checkbox') control = `<input id="${id}" type="checkbox" name="${esc(f.name)}" value="${esc(f.value ?? '1')}"${f.checked ? ' checked' : ''}>`;
      else if (f.type === 'textarea') control = `<textarea id="${id}" name="${esc(f.name)}" rows="4">${esc(f.value)}</textarea>`;
      else if (f.type === 'select') control = `<select id="${id}" name="${esc(f.name)}">${(f.options ?? []).map(o => `<option value="${esc(o.value)}"${String(o.value) === String(f.value) ? ' selected' : ''}>${esc(o.label ?? o.value)}</option>`).join('')}</select>`;
      else control = `<input id="${id}" type="${f.type === 'number' ? 'number' : 'text'}" name="${esc(f.name)}" value="${esc(f.value)}"${f.type === 'number' ? ' min="0" step="1"' : ''}>`;
      return `<div class="form-group"><label for="${id}">${esc(f.label)}</label><div class="form-fields">${control}</div>${f.hint ? `<p class="hint">${esc(f.hint)}</p>` : ''}</div>`;
    };
    const result = await D.wait({
      window: {title}, content: fields.map(row).join(''), modal: true, rejectClose: false,
      buttons: [{action: 'cancel', label: cancel, callback: () => null}, {action: 'ok', label: ok, default: true, callback: (event, button) => readForm(button?.form ?? event?.currentTarget?.form)}]
    });
    return result && typeof result === 'object' ? result : null;
  }
  const fn = native('prompt');
  if (!fn) return null;
  const out = {};
  for (const f of fields) {
    const v = fn(f.label, f.value ?? '');
    if (v === null || v === undefined) return null;
    out[f.name] = v;
  }
  return out;
}

/** Single text value; resolves the string, or null when cancelled. */
export async function promptText(title, label, value = '', opts = {}) {
  const r = await formDialog(title, [{name: 'value', label, value, type: opts.multiline ? 'textarea' : 'text'}], opts);
  return r ? r.value : null;
}

/** Plain-language message with a single Close button. */
export async function infoDialog(title, html, {close = 'Close'} = {}) {
  const D = dialogV2();
  if (D?.prompt) return D.prompt({window: {title}, content: html, ok: {label: close}, rejectClose: false});
  const fn = native('alert');
  if (fn) fn(String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  return undefined;
}
