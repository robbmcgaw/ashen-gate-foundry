/* 0.38.0: the condition picker, a select-only combobox: a button showing the current icon and name that opens a scrollable
   list of rows (icon + name) under small group headers. A native <select> cannot show pictures, so this replaces it in the
   Party Conditions card and in the pop-out overlay. The list opens in a layer on the document body (not inside the window),
   so neither the window's scrolling nor the overlay's narrow frame can clip it. Uses kit classes (ag-btn, ag-picker__*). */
import {escapeHTML as E} from './core.mjs';
import {groupConditionChoices, normKey} from './condition-kinds.mjs';

let open = null;   // the one open list: {close(opts)}
/** Close any open list. Called before a window re-renders so a list never outlives its button. */
export function closePicker({focus = false} = {}) { open?.close({focus}); }

/**
 * The closed control. `id` goes on the button and its `value` attribute is the picked status id, so the code that applies
 * a condition reads `#id`.value exactly as it read the select. `iconId` keeps the old id of the picture inside it.
 */
export function pickerHTML({id, iconId = '', choices, pick, label, describedBy = '', disabled = false, cls = ''}) {
  const cur = choices.find(c => c.id === pick) ?? choices[0];
  return `<span class="agu-combo${cls ? ` ${E(cls)}` : ''}"><button type="button" id="${E(id)}" class="ag-btn agu-combo__button" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="${E(id)}-list" aria-label="${E(label)}"${describedBy ? ` aria-describedby="${E(describedBy)}"` : ''} value="${E(cur?.id ?? '')}"${disabled || !choices.length ? ' disabled' : ''}><img class="agu-status-icon agu-combo__icon"${iconId ? ` id="${E(iconId)}"` : ''} src="${E(cur?.img ?? '')}" alt=""><span class="agu-combo__name">${E(cur?.label ?? 'No conditions')}</span><i class="fa-solid fa-chevron-down agu-combo__caret" aria-hidden="true"></i></button></span>`;
}

const MARGIN = 8, MAX_H = 320;
const sel = (el, cls) => el.querySelector?.(`.${cls}`);
/**
 * Wire one closed control. `choices` are {id, label, img}; `onChange(id)` runs after a pick. Returns {open, close} (for tests).
 * Keys on the button: Down/Up/Alt+Down/Enter/Space open it; letters open it at the first match. In the list: Up/Down move,
 * Home/End jump, Enter or Space choose, Escape closes and keeps focus on the button, Tab closes, letters jump (type-ahead).
 * Focus stays on the button; aria-activedescendant names the highlighted row.
 */
export function bindPicker(button, {choices, onChange = () => {}} = {}) {
  if (!button || typeof button.addEventListener !== 'function') return null;
  const doc = button.ownerDocument ?? globalThis.document, view = doc?.defaultView ?? globalThis;
  const groups = groupConditionChoices(choices), flat = groups.flatMap(g => g.items);
  let pop = null, rows = [], active = -1, typed = '', typedAt = 0, offs = [];

  const current = () => button.getAttribute('value') ?? button.value ?? '';
  const paint = c => {
    const img = button.querySelector?.('img'), name = sel(button, 'agu-combo__name');
    if (img) img.setAttribute('src', c.img ?? ''); if (name) name.textContent = c.label;
  };
  const setActive = i => {
    if (!pop || !rows.length) return;
    active = (i + rows.length) % rows.length;
    rows.forEach((r, n) => { if (n === active) r.setAttribute('data-active', ''); else r.removeAttribute('data-active'); });
    button.setAttribute('aria-activedescendant', rows[active].id);
    rows[active].scrollIntoView?.({block: 'nearest'});
  };
  function close({focus = true} = {}) {
    if (!pop) return;
    for (const off of offs) off(); offs = [];
    pop.remove(); pop = null; rows = []; active = -1; open = null;
    button.setAttribute('aria-expanded', 'false'); button.removeAttribute('aria-activedescendant');
    if (focus) button.focus?.();
  }
  function choose(i) {
    const c = flat[i]; if (!c) return;
    const changed = c.id !== current();
    button.value = c.id; button.setAttribute('value', c.id); paint(c);
    close({focus: true});
    if (changed) onChange(c.id);
  }
  function place() {
    const st = pop.style, r = button.getBoundingClientRect?.();
    if (!st || !r) return;
    const vw = view.innerWidth ?? 1024, vh = view.innerHeight ?? 768;
    st.setProperty('min-width', `${Math.round(r.width)}px`); st.setProperty('max-width', `${Math.max(120, vw - MARGIN * 2)}px`);
    st.setProperty('max-height', `${MAX_H}px`);
    const below = vh - r.bottom - MARGIN, above = r.top - MARGIN, h = Math.min(pop.scrollHeight || MAX_H, MAX_H);
    const up = h > below && above > below, room = Math.max(96, up ? above : below);
    st.setProperty('max-height', `${Math.min(MAX_H, room)}px`);
    const w = pop.offsetWidth || r.width, left = Math.min(Math.max(MARGIN, r.left), Math.max(MARGIN, vw - w - MARGIN));
    st.setProperty('left', `${Math.round(left)}px`);
    if (up) { st.setProperty('bottom', `${Math.round(vh - r.top + 2)}px`); st.setProperty('top', 'auto'); }
    else { st.setProperty('top', `${Math.round(r.bottom + 2)}px`); st.setProperty('bottom', 'auto'); }
  }
  function openList(startAt = null) {
    if (pop || button.disabled || !flat.length || !doc?.body) return;
    closePicker();
    const mk = (tag, attrs = {}) => { const el = doc.createElement(tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return el; };
    pop = mk('div', {class: 'ag-app agu-combo-layer', id: `${button.id}-list-layer`});
    const list = mk('div', {class: 'ag-picker__list agu-combo__list', id: `${button.id}-list`, role: 'listbox', 'aria-label': button.getAttribute('aria-label') ?? 'Condition'});
    let n = 0;
    for (const g of groups) {
      const head = mk('div', {class: 'ag-picker__group agu-combo__head', role: 'presentation', id: `${button.id}-grp-${g.key}`});
      head.textContent = g.label;
      const grp = mk('div', {role: 'group', 'aria-labelledby': head.id, class: 'agu-combo__group'});
      grp.append(head);
      for (const c of g.items) {
        const row = mk('div', {class: 'ag-picker__option agu-combo__option', role: 'option', id: `${button.id}-opt-${n}`, 'aria-selected': String(c.id === current()), 'data-value': c.id, 'data-index': String(n)});
        const img = mk('img', {class: 'agu-status-icon', src: c.img ?? '', alt: ''}), name = mk('span', {class: 'agu-combo__name'});
        name.textContent = c.label; row.append(img, name);
        const at = n;
        row.addEventListener('mousedown', e => e.preventDefault());   // keep focus on the button
        row.addEventListener('click', () => choose(at));
        row.addEventListener('mousemove', () => { if (active !== at) setActive(at); });
        grp.append(row); n++;
      }
      list.append(grp);
    }
    rows = [...list.querySelectorAll('[role="option"]')];
    pop.append(list); doc.body.append(pop);
    button.setAttribute('aria-expanded', 'true');
    place();
    const idx = startAt ?? Math.max(0, flat.findIndex(c => c.id === current()));
    setActive(idx);
    const onDown = e => { if (!pop.contains(e.target) && !button.contains(e.target)) close({focus: false}); };
    const onAway = e => { if (!pop || !pop.contains?.(e.target)) close({focus: false}); };
    const onBlurWin = () => close({focus: false});
    doc.addEventListener('pointerdown', onDown, true); doc.addEventListener('mousedown', onDown, true);
    doc.addEventListener('scroll', onAway, true); view.addEventListener?.('resize', onBlurWin); view.addEventListener?.('blur', onBlurWin);
    offs = [() => doc.removeEventListener('pointerdown', onDown, true), () => doc.removeEventListener('mousedown', onDown, true), () => doc.removeEventListener('scroll', onAway, true), () => view.removeEventListener?.('resize', onBlurWin), () => view.removeEventListener?.('blur', onBlurWin)];
    open = {close};
  }
  /** Index of the next row whose name starts with what was typed (a repeated single letter cycles), or -1. */
  function typeahead(ch) {
    const now = Date.now(), fresh = now - typedAt > 700;
    typed = fresh ? ch : typed + ch; typedAt = now;
    const repeat = typed.length > 1 && [...typed].every(c => c === typed[0]);
    const from = pop ? active : flat.findIndex(c => c.id === current()), probe = normKey(repeat ? typed[0] : typed);
    const start = typed.length === 1 || repeat ? from + 1 : Math.max(from, 0);
    for (let k = 0; k < flat.length; k++) { const i = (start + k + flat.length) % flat.length; if (normKey(flat[i].label).startsWith(probe)) return i; }
    return -1;
  }
  button.addEventListener('click', () => { if (pop) close({focus: false}); else openList(); });
  button.addEventListener('keydown', e => {
    if (button.disabled || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (!pop) {
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ' || k === 'Spacebar') { e.preventDefault(); return openList(); }
      if (k === 'Home' || k === 'End') { e.preventDefault(); return openList(k === 'Home' ? 0 : flat.length - 1); }
      if (k.length === 1 && !e.altKey) { const i = typeahead(k); openList(i >= 0 ? i : null); e.preventDefault?.(); }
      return;
    }
    if (k === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (k === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (k === 'Home') { e.preventDefault(); setActive(0); }
    else if (k === 'End') { e.preventDefault(); setActive(rows.length - 1); }
    else if (k === 'Enter' || k === ' ' || k === 'Spacebar') { e.preventDefault(); choose(active); }
    else if (k === 'Escape') { e.preventDefault(); e.stopPropagation?.(); close({focus: true}); }
    else if (k === 'Tab') close({focus: false});
    else if (k.length === 1 && !e.altKey) { e.preventDefault(); const i = typeahead(k); if (i >= 0) setActive(i); }
  });
  // Space on a button fires click on keyup in browsers; keydown already handled it, so swallow that click once.
  button.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Spacebar') e.preventDefault?.(); });
  return {open: openList, close, get isOpen() { return Boolean(pop); }};
}
