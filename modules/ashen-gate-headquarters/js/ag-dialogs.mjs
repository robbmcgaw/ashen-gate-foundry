/**
 * Ashen Gate shared dialog helpers (ag-dialogs.mjs, UI kit 2).
 * Every module that ships this file ships an identical copy; scripts/check.mjs fails if the copies drift.
 *
 * Small DialogV2 helpers (Foundry's desktop app has no native prompt/confirm/alert).
 * Each helper feature-detects DialogV2 at call time and only falls back to the browser's
 * dialogs when DialogV2 is absent; with neither available it resolves as "cancelled".
 * Every DialogV2 window gets the classes 'ag-app' and 'ag-dialog' so the kit (ag-ui.css) and the
 * skins style it; buttons are always [cancel, confirm|ok] so Cancel sits bottom-left.
 * choiceDialog (kit 2.1.0) adds 'ag-dialog--choice': [cancel, ...choices], Cancel left, choices right.
 * Kit 2.2.0 adds confirmDanger (Cancel is the default button) and guardDirty (ask before unsaved edits are lost).
 * confirmDialog is unchanged.
 */
const dialogV2 = () => globalThis.foundry?.applications?.api?.DialogV2;
const native = name => { const fn = globalThis.window?.[name] ?? globalThis[name]; return typeof fn === 'function' ? fn : null; };
const CLASSES = Object.freeze(['ag-app', 'ag-dialog']);
const classes = (danger = false) => danger ? [...CLASSES, 'ag-dialog--danger'] : [...CLASSES];
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

/**
 * Yes/no question. Cancel is on the left, the labelled action on the right. Resolves true only on the action.
 * danger: true marks the window 'ag-dialog--danger' (red action button) for removes and resets.
 */
export async function confirmDialog(message, {title = 'Confirm', yes = 'Confirm', no = 'Cancel', danger = false} = {}) {
  const D = dialogV2();
  if (D?.wait) {
    return (await D.wait({
      classes: classes(danger), window: {title}, content: paragraphs(message), modal: true, rejectClose: false,
      buttons: [{action: 'cancel', label: no, callback: () => false}, {action: 'confirm', label: yes, default: true, callback: () => true}]
    })) === true;
  }
  if (D?.confirm) return Boolean(await D.confirm({classes: classes(danger), window: {title}, content: paragraphs(message), yes: {label: yes}, no: {label: no}, rejectClose: false, modal: true}));
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
      classes: classes(), window: {title}, content: fields.map(row).join(''), modal: true, rejectClose: false,
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
  if (D?.prompt) return D.prompt({classes: classes(), window: {title}, content: html, ok: {label: close}, rejectClose: false});
  const fn = native('alert');
  if (fn) fn(String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  return undefined;
}

/**
 * Tick-box list. items: [{key, label, checked}]. Resolves the array of ticked keys on the action button
 * (possibly empty), or null when cancelled or closed. Without DialogV2 it asks one yes/no per item.
 */
export async function checklistDialog(title, intro, items, {ok = 'Apply', cancel = 'Cancel'} = {}) {
  const D = dialogV2();
  if (D?.wait) {
    const rows = items.map((it, i) => `<div class="form-group"><label class="checkbox"><input type="checkbox" name="pick-${i}" data-key="${esc(it.key)}"${it.checked ? ' checked' : ''}> ${esc(it.label)}</label></div>`).join('');
    const result = await D.wait({
      classes: classes(), window: {title}, content: paragraphs(intro) + rows, modal: true, rejectClose: false,
      buttons: [{action: 'cancel', label: cancel, callback: () => null}, {action: 'ok', label: ok, default: true, callback: (event, button) => {
        const form = button?.form ?? event?.currentTarget?.form;
        return [...(form?.elements ?? [])].filter(el => el?.type === 'checkbox' && el.checked).map(el => el.dataset.key);
      }}]
    });
    return Array.isArray(result) ? result : null;
  }
  const fn = native('confirm');
  if (!fn) return null;
  return items.filter(it => fn(`${intro}\n\n${it.label}?`)).map(it => it.key);
}

/**
 * One of several actions. choices: [{action, label, icon?, default?, danger?}], in the order shown (after Cancel).
 * Resolves the chosen action, or null on Cancel or close. A danger choice marks the window 'ag-dialog--danger'.
 * Without DialogV2 it asks for the choice's number with prompt().
 */
export async function choiceDialog(title, html, choices, {cancel = 'Cancel'} = {}) {
  const list = (choices ?? []).filter(c => c?.action && c.action !== 'cancel');
  const D = dialogV2();
  if (D?.wait) {
    const cls = c => ['ag-dialog__choice', c.default ? 'ag-dialog__choice--default' : '', c.danger ? 'ag-dialog__choice--danger' : ''].filter(Boolean).join(' ');
    const result = await D.wait({
      classes: [...classes(list.some(c => c.danger)), 'ag-dialog--choice'], window: {title}, content: html, modal: true, rejectClose: false,
      buttons: [{action: 'cancel', label: cancel, callback: () => null},
        ...list.map(c => ({action: c.action, label: c.label, ...(c.icon ? {icon: c.icon} : {}), class: cls(c), default: Boolean(c.default), callback: () => c.action}))]
    });
    return list.some(c => c.action === result) ? result : null;
  }
  const fn = native('prompt');
  if (!fn || !list.length) return null;
  const text = String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const answer = fn(`${text}\n\n${list.map((c, i) => `${i + 1}. ${c.label}`).join('\n')}`.trim(), '');
  const pick = list[Number.parseInt(String(answer ?? '').trim(), 10) - 1];
  return pick ? pick.action : null;
}

/**
 * Destructive yes/no (kit 2.2.0): "Delete <thing>?" title, a labelled red action ("Delete <thing>", never OK/Yes),
 * and Cancel as the default button, so Enter and first focus never delete. Resolves true only on the action.
 */
export async function confirmDanger(message, {title, yes, no = 'Cancel'} = {}) {
  title ||= 'Delete?';
  yes ||= 'Delete';
  const D = dialogV2();
  const cls = [...classes(true), 'ag-dialog--danger-confirm'];
  if (D?.wait) {
    return (await D.wait({
      classes: cls, window: {title}, content: paragraphs(message), modal: true, rejectClose: false,
      buttons: [{action: 'cancel', label: no, default: true, callback: () => false}, {action: 'confirm', label: yes, default: false, callback: () => true}]
    })) === true;
  }
  if (D?.confirm) return Boolean(await D.confirm({classes: cls, window: {title}, content: paragraphs(message), yes: {label: yes, default: false}, no: {label: no, default: true}, rejectClose: false, modal: true}));
  const fn = native('confirm');
  return fn ? Boolean(fn(message)) : false;
}

/**
 * Unsaved-edit guard (kit 2.2.0) for one draft form. Tracks dirty state, writes "Unsaved changes" into the footer
 * status, and asks "Discard unsaved changes?" (Keep editing is the default) before anything throws the edits away.
 *   status: the footer status element, or a function returning it (looked up again on each change, so re-renders are fine)
 *   ask: replaces the dialog (tests, or a "Save and <action>" choiceDialog); resolves true to discard
 * Returns {dirty, watch(form), markDirty(), markClean(), confirm(), guard(fn)}:
 *   watch(form) marks dirty on input/change inside it (returns an unbind function);
 *   confirm() resolves true when clean or when the user discards (then it is clean again), false to keep editing;
 *   guard(fn) wraps a tab switch, selection change or close so it only runs after confirm().
 */
export function guardDirty({status, text = 'Unsaved changes', title = 'Discard unsaved changes?',
  message = 'Your changes have not been saved.', discard = 'Discard changes', keep = 'Keep editing', ask, onChange} = {}) {
  let dirty = false;
  const statusEl = () => (typeof status === 'function' ? status() : status) ?? null;
  const paint = () => {
    const el = statusEl();
    if (!el) return;
    if (dirty) { el.textContent = text; el.dataset.agDirty = 'true'; }
    else if (el.dataset?.agDirty) { el.textContent = ''; delete el.dataset.agDirty; }
  };
  const set = value => {
    const changed = dirty !== value;
    dirty = value;
    paint();
    if (changed) onChange?.(dirty);
  };
  const api = {
    get dirty() { return dirty; },
    markDirty() { set(true); },
    markClean() { set(false); },
    watch(form) {
      if (!form?.addEventListener) return () => {};
      const on = () => set(true);
      form.addEventListener('input', on);
      form.addEventListener('change', on);
      paint();
      return () => { form.removeEventListener('input', on); form.removeEventListener('change', on); };
    },
    async confirm() {
      if (!dirty) return true;
      const ok = ask ? await ask() : await confirmDanger(message, {title, yes: discard, no: keep});
      if (ok === true) set(false);
      return ok === true;
    },
    guard(fn) {
      return async (...args) => (await api.confirm()) ? fn(...args) : undefined;
    },
  };
  return api;
}
