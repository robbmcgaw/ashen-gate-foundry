/**
 * Ashen Gate shared HTML helpers (ag-html.mjs, UI kit 2).
 * Every module that ships this file ships an identical copy; scripts/check.mjs fails if the copies drift.
 * Kit 2.4.0 adds bindRadioGroups (WAI-ARIA radio group keys for role="radiogroup" switches) and bindScrollTabs (edge cues on a scrolling tab strip).
 * Kit 2.3.0 adds idSlug/generateId/checkNewId, pickerOptions/filterPickerOptions/missingLabel and refPicker/bindRefPickers
 * (permanent ids made for the GM and searchable record pickers; docs/ui-ux-guidelines.md §17b). Kit 2.2.0 adds uiState, subTabs/tabPanelAttrs/bindTablist, fold/bindFolds, fileButton/bindFileButtons and
 * linkButton. They are additive: nothing calls them until a module adopts them (usage: docs/ui-ux-guidelines.md §17).
 */

/** Window size scale for html[data-ag-size="comfortable"] (General Manager → My Appearance → Size). */
export const COMFORTABLE_SCALE = 1.2;

/**
 * Default window size for the current kit size set: {width, height} scaled by 1.2 when the
 * document is set to Comfortable, otherwise unchanged. Never larger than the viewport.
 * Reads the attribute when called, so call it when the window is created, not at import time.
 */
export function windowSize({width, height} = {}, {doc = globalThis.document, view = globalThis} = {}) {
  const scale = doc?.documentElement?.dataset?.agSize === 'comfortable' ? COMFORTABLE_SCALE : 1;
  const fit = (value, max) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return value;
    const scaled = Math.round(value * scale);
    return typeof max === 'number' && max > 0 ? Math.min(scaled, Math.floor(max)) : scaled;
  };
  return {width: fit(width, view?.innerWidth), height: fit(height, view?.innerHeight)};
}

// ---------- Kit 2.2.0 ----------
const escHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const kebab = k => String(k).replace(/[A-Z]/g, c => `-${c.toLowerCase()}`).replace(/[^a-z0-9_-]/g, '');
/** data-* attributes from {key: value} (camelCase keys become kebab-case); values are escaped. */
const dataAttrs = (data = {}) => Object.entries(data ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== false)
  .map(([k, v]) => ` data-${kebab(k)}="${escHtml(v === true ? '' : v)}"`).join('');
const icon = cls => cls ? `<i class="${escHtml(cls)}" aria-hidden="true"></i> ` : '';

/**
 * Small per-user, per-device UI memory (selected sub-tab, open folds) in localStorage under
 * "ag-ui:<namespace>:<user id>". Never throws: without storage it remembers nothing and get() returns the fallback.
 * get(key, fallback, allowed?) returns the fallback when the stored value is not in `allowed` (an array).
 */
export function uiState(namespace, {storage, userId} = {}) {
  const store = () => { try { return storage ?? globalThis.localStorage ?? null; } catch { return null; } };
  const key = `ag-ui:${namespace}:${userId ?? globalThis.game?.user?.id ?? 'local'}`;
  const read = () => { try { const v = JSON.parse(store()?.getItem(key) ?? '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
  return {
    key,
    get(name, fallback, allowed) {
      const v = read()[name];
      if (v === undefined || (Array.isArray(allowed) && !allowed.includes(v))) return fallback;
      return v;
    },
    set(name, value) {
      const all = read();
      if (value === undefined) delete all[name]; else all[name] = value;
      try { store()?.setItem(key, JSON.stringify(all)); } catch { /* storage full or blocked: forget quietly */ }
      return value;
    },
  };
}

/**
 * Sub-tab row (.ag-tabs.ag-tabs--sub, role="tablist"). tabs: [{id, label, icon?, count?}]; selected: a tab id.
 * Each tab is a <button role="tab" data-tab="<id>"> with roving tabindex and aria-controls="<group>-panel-<id>";
 * give each panel tabPanelAttrs(group, id). Call bindTablist() after render for the arrow keys.
 */
export function subTabs({group, label, tabs = [], selected} = {}) {
  const pick = tabs.some(t => t.id === selected) ? selected : tabs[0]?.id;
  const g = kebab(group);
  return `<div class="ag-tabs ag-tabs--sub" role="tablist"${label ? ` aria-label="${escHtml(label)}"` : ''}>${tabs.map(t => {
    const on = t.id === pick;
    const count = t.count === undefined || t.count === null ? '' : ` <span class="ag-tab__count">${escHtml(t.count)}</span>`;
    return `<button type="button" role="tab" id="${g}-tab-${kebab(t.id)}" data-tab="${escHtml(t.id)}" aria-controls="${g}-panel-${kebab(t.id)}" aria-selected="${on}" tabindex="${on ? 0 : -1}">${icon(t.icon)}${escHtml(t.label)}${count}</button>`;
  }).join('')}</div>`;
}

/** Attributes for the panel of sub-tab `tab` in `group` (pairs with subTabs). */
export function tabPanelAttrs(group, tab, {hidden = false} = {}) {
  const g = kebab(group);
  return `id="${g}-panel-${kebab(tab)}" role="tabpanel" aria-labelledby="${g}-tab-${kebab(tab)}" tabindex="0"${hidden ? ' hidden' : ''}`;
}

/**
 * Keyboard pattern for a tab row (W3C APG Tabs, manual activation): one Tab stop, Left/Right (Up/Down when
 * aria-orientation="vertical") move focus, Home/End jump to the ends, Enter/Space click the tab as before.
 * root: a [role="tablist"] element, or a container whose tablists are all bound. Tabs are its role="tab" children,
 * or its direct buttons/links (which then get role="tab"). Wires each tab's aria-controls panel with
 * role="tabpanel" and aria-labelledby. Clicks keep running the module's own handlers; with {state, key} a clicked
 * tab's data-tab is also remembered (read it back with state.get(key, fallback, ids)). A scrolling strip (.ag-tabs--scroll) or
 * side rail (.ag-siderail) also gets bindScrollTabs(), so it shows where more tabs are hidden. Returns an unbind function.
 */
export function bindTablist(root, {state, key} = {}) {
  if (!root?.querySelectorAll) return () => {};
  const lists = root.matches?.('[role="tablist"], .ag-tabs') ? [root] : [...root.querySelectorAll('[role="tablist"]')];
  const undo = [];
  for (const list of lists) {
    list.setAttribute('role', 'tablist');
    const tabs = () => [...list.children].filter(el => el.getAttribute('role') === 'tab' || /^(BUTTON|A)$/.test(el.tagName))
      .filter(el => !el.disabled && !el.hidden);
    const all = tabs();
    const selected = all.find(t => t.getAttribute('aria-selected') === 'true' || t.classList.contains('active') || t.getAttribute('aria-current') === 'page') ?? all[0];
    for (const t of all) {
      t.setAttribute('role', 'tab');
      if (t.getAttribute('aria-selected') === null) t.setAttribute('aria-selected', String(t === selected));
      t.setAttribute('tabindex', t === selected ? '0' : '-1');
      const panelId = t.getAttribute('aria-controls');
      const panel = panelId ? (list.ownerDocument ?? globalThis.document)?.getElementById?.(panelId) : null;
      if (panel) {
        if (!t.id) t.id = `${panelId}-tab`;
        panel.setAttribute('role', 'tabpanel');
        if (!panel.getAttribute('aria-labelledby')) panel.setAttribute('aria-labelledby', t.id);
      }
    }
    const onKey = event => {
      const items = tabs();
      const i = items.indexOf(event.target?.closest?.('[role="tab"]') ?? event.target);
      if (i < 0) return;
      const vertical = list.getAttribute('aria-orientation') === 'vertical';
      const next = {[vertical ? 'ArrowDown' : 'ArrowRight']: i + 1, [vertical ? 'ArrowUp' : 'ArrowLeft']: i - 1, Home: 0, End: items.length - 1}[event.key];
      if (next === undefined) return;
      event.preventDefault();
      const to = items[(next + items.length) % items.length];
      for (const t of items) t.setAttribute('tabindex', t === to ? '0' : '-1');
      to.focus();
    };
    const onClick = event => {
      const t = event.target?.closest?.('[role="tab"]');
      if (!t || !tabs().includes(t)) return;
      for (const x of tabs()) x.setAttribute('tabindex', x === t ? '0' : '-1');
      if (state && key && t.dataset?.tab !== undefined) state.set(key, t.dataset.tab);
    };
    list.addEventListener('keydown', onKey);
    list.addEventListener('click', onClick);
    undo.push(() => { list.removeEventListener('keydown', onKey); list.removeEventListener('click', onClick); });
    if (list.matches?.('.ag-tabs--scroll, .ag-siderail')) undo.push(bindScrollTabs(list));
  }
  return () => undo.forEach(fn => fn());
}

const SCROLL_BOUND = new WeakMap();

/**
 * Scroll cue for a tab strip that scrolls (.ag-tabs--scroll, or a .ag-siderail that overflows): sets data-ag-more-before /
 * data-ag-more-after (and data-ag-axis="x" | "y") on it while more tabs lie hidden in that direction, and the kit CSS fades
 * that edge. It also scrolls the selected tab (aria-selected="true", .active or aria-current) into view when called, which a
 * re-render would otherwise lose, and keeps a focused tab clear of the fade (CSS scroll-padding does that for the browser's
 * own focus scrolling). Nothing animates, so reduced motion needs no special case. bindTablist() calls it for you; call it
 * directly for a strip that does not use bindTablist. One listener set per element, so calling it after every render is
 * safe. Returns an unbind function.
 */
export function bindScrollTabs(list) {
  if (!list?.addEventListener || typeof list.scrollWidth !== 'number') return () => {};
  const axisOf = () => list.scrollWidth - list.clientWidth > 1 ? 'x' : list.scrollHeight - list.clientHeight > 1 ? 'y' : null;
  const fitSelected = () => {
    const axis = axisOf();
    const on = list.querySelector?.('[aria-selected="true"], .active, [aria-current]');
    if (!axis || !on?.getBoundingClientRect) return;
    const a = list.getBoundingClientRect(), b = on.getBoundingClientRect(), pad = 28;
    if (axis === 'y') {
      if (b.top < a.top + pad) list.scrollTop = Math.max(0, list.scrollTop - (a.top + pad - b.top));
      else if (b.bottom > a.bottom - pad) list.scrollTop += b.bottom - (a.bottom - pad);
    } else if (b.left < a.left + pad) list.scrollLeft = Math.max(0, list.scrollLeft - (a.left + pad - b.left));
    else if (b.right > a.right - pad) list.scrollLeft += b.right - (a.right - pad);
  };
  const known = SCROLL_BOUND.get(list);
  if (known) { known.update(); fitSelected(); known.update(); return known.unbind; }
  const update = () => {
    const axis = axisOf();
    const size = axis === 'y' ? list.scrollHeight : list.scrollWidth, view = axis === 'y' ? list.clientHeight : list.clientWidth;
    const pos = Math.abs(axis === 'y' ? list.scrollTop : list.scrollLeft);
    const set = (name, on) => (on ? list.setAttribute(name, '') : list.removeAttribute(name));
    if (axis) list.setAttribute('data-ag-axis', axis); else list.removeAttribute('data-ag-axis');
    set('data-ag-more-before', !!axis && pos > 1);
    set('data-ag-more-after', !!axis && pos + view < size - 1);
  };
  list.addEventListener('scroll', update, {passive: true});
  let watcher = null;
  if (typeof globalThis.ResizeObserver === 'function') {
    watcher = new globalThis.ResizeObserver(update);
    watcher.observe(list);
    for (const child of list.children ?? []) watcher.observe(child);
  }
  const unbind = () => { list.removeEventListener('scroll', update); watcher?.disconnect(); SCROLL_BOUND.delete(list); };
  SCROLL_BOUND.set(list, {update, unbind});
  update();
  fitSelected();
  update();
  return unbind;
}

const RADIO_BOUND = new WeakMap();
let radioPendingFocus = null;
const radiosOf = group => [...group.querySelectorAll('[role="radio"]')].filter(r => r.closest('[role="radiogroup"]') === group);
const radioKey = el => el.getAttribute('id') || [...(el.getAttributeNames?.() ?? [])].filter(n => n.startsWith('data-')).sort().map(n => `${n}=${el.getAttribute(n)}`).join('|');
const groupKey = group => group.getAttribute('id') || group.getAttribute('aria-label') || group.getAttribute('aria-labelledby') || '';

/** Roving tabindex for one radiogroup: the checked radio (or the first enabled one) is the only Tab stop. */
function syncRadioGroup(group) {
  const all = radiosOf(group);
  const enabled = all.filter(r => !r.disabled);
  const stop = enabled.find(r => r.getAttribute('aria-checked') === 'true') ?? enabled[0];
  for (const r of all) {
    if (r.getAttribute('aria-checked') === null) r.setAttribute('aria-checked', 'false');
    r.setAttribute('tabindex', r === stop ? '0' : '-1');
  }
}

/**
 * Keyboard pattern for value switches (W3C APG Radio Group): root is a [role="radiogroup"] element or a container of them
 * (buttons with role="radio" and aria-checked, e.g. the kit's .ag-segmented). One Tab stop per group (roving tabindex on the
 * checked radio, or the first when none is), Right/Down and Left/Up move focus to the next/previous enabled radio, wrapping,
 * Home/End jump to the ends, and the radio that gets focus is also selected by clicking it, so the module's own click handler
 * runs exactly as for a mouse click. If that handler leaves aria-checked alone, the kit moves it. Space/Enter still click.
 * Safe to call after every render: it re-syncs tabindex and adds ONE delegated listener per root (groups added later are
 * covered), so re-renders never stack handlers. If the click re-rendered and focus fell to the page, the next call restores it
 * to the same radio (found by its group label and data-* attributes). Use it only for groups where selecting is harmless to
 * repeat; a choice with consequences (it saves, publishes or asks first) is a group of aria-pressed buttons instead.
 * Returns an unbind function.
 */
export function bindRadioGroups(root) {
  if (!root?.querySelectorAll) return () => {};
  const groups = () => root.matches?.('[role="radiogroup"]') ? [root] : [...root.querySelectorAll('[role="radiogroup"]')];
  const found = groups();
  for (const g of found) syncRadioGroup(g);
  const doc = root.ownerDocument ?? globalThis.document;
  if (radioPendingFocus && Date.now() - radioPendingFocus.at > 2000) radioPendingFocus = null;
  if (radioPendingFocus) {
    const active = doc?.activeElement;
    if (active && active !== doc.body && active.isConnected !== false) radioPendingFocus = null;
    else {
      const g = found.find(x => groupKey(x) === radioPendingFocus.group);
      const target = g && radiosOf(g).find(r => radioKey(r) === radioPendingFocus.radio && !r.disabled);
      if (target) { radioPendingFocus = null; target.focus?.(); }
    }
  }
  if (RADIO_BOUND.has(root)) return RADIO_BOUND.get(root);
  if (typeof root.addEventListener !== 'function') return () => {};
  const onKey = event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const current = event.target?.closest?.('[role="radio"]');
    const group = current?.closest?.('[role="radiogroup"]');
    if (!group) return;
    const items = radiosOf(group).filter(r => !r.disabled && !r.hidden);
    const i = items.indexOf(current);
    if (i < 0) return;
    const to = {ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: items.length - 1}[event.key];
    if (to === undefined) return;
    event.preventDefault();
    const next = items[(to + items.length) % items.length];
    if (next === current) return;
    radioPendingFocus = {group: groupKey(group), radio: radioKey(next), at: Date.now()};
    next.focus?.();
    next.click?.();
    // The module's handler may already have moved the selection (or re-rendered); only fill in what it left alone.
    if (current.getAttribute('aria-checked') === 'true' && next.getAttribute('aria-checked') !== 'true') {
      for (const r of radiosOf(group)) r.setAttribute('aria-checked', String(r === next));
    }
    syncRadioGroup(group);
  };
  const onClick = event => {
    const group = event.target?.closest?.('[role="radio"]')?.closest?.('[role="radiogroup"]');
    if (group) syncRadioGroup(group);
  };
  root.addEventListener('keydown', onKey);
  root.addEventListener('click', onClick);
  const unbind = () => { root.removeEventListener('keydown', onKey); root.removeEventListener('click', onClick); RADIO_BOUND.delete(root); };
  RADIO_BOUND.set(root, unbind);
  return unbind;
}

/**
 * Collapsible section: <details class="ag-fold" data-ag-fold-key="<key>">. title and count are escaped text;
 * body is HTML the caller has already escaped. Keep controls out of the title (no buttons inside <summary>) and
 * never put a fold inside a fold. bindFolds() remembers open/closed per user.
 */
export function fold({key, title, count, open = false, body = '', hint} = {}) {
  const c = count === undefined || count === null ? '' : `<span class="ag-fold__count">${escHtml(count)}</span>`;
  const h = hint ? `<span class="ag-fold__hint">${escHtml(hint)}</span>` : '';
  return `<details class="ag-fold"${key ? ` data-ag-fold-key="${escHtml(key)}"` : ''}${open ? ' open' : ''}><summary class="ag-fold__summary"><span class="ag-fold__title">${escHtml(title)}</span>${c}${h}</summary><div class="ag-fold__body">${body}</div></details>`;
}

/**
 * Restores and remembers every keyed fold under root (details.ag-fold[data-ag-fold-key]) in a uiState.
 * A fold with nothing stored keeps the open state it was rendered with. Returns an unbind function.
 */
export function bindFolds(root, state) {
  if (!root?.querySelectorAll || !state) return () => {};
  const undo = [];
  for (const el of root.querySelectorAll('details.ag-fold[data-ag-fold-key]')) {
    const name = `fold:${el.dataset.agFoldKey}`;
    const stored = state.get(name);
    if (typeof stored === 'boolean' && stored !== el.open) el.open = stored;
    const onToggle = () => { if (state.get(name) !== el.open) state.set(name, el.open); };
    el.addEventListener('toggle', onToggle);
    undo.push(() => el.removeEventListener('toggle', onToggle));
  }
  return () => undo.forEach(fn => fn());
}

/**
 * File picker that keyboard users can reach: a real <button> plus a visually hidden (not display:none) file input.
 * label is the button text ("Choose file…"); data adds data-* attributes to the wrapper (a key for the handler).
 * Wire it with bindFileButtons(root, handler). A drop zone may stay beside it, but never instead of it.
 */
export function fileButton({label = 'Choose file…', accept, multiple = false, icon: iconClass = 'fa-solid fa-file-import', disabled = false, data, className = 'ag-btn'} = {}) {
  return `<span class="ag-file"${dataAttrs(data)}><button type="button" class="${escHtml(className)}" data-ag-file-button${disabled ? ' disabled' : ''}>${icon(iconClass)}${escHtml(label)}</button><input type="file" class="ag-file__input ag-sr-only" tabindex="-1" aria-hidden="true"${accept ? ` accept="${escHtml(accept)}"` : ''}${multiple ? ' multiple' : ''}${disabled ? ' disabled' : ''}></span>`;
}

/**
 * Wires every fileButton under root: the button opens its input; a pick calls handler(files, wrapper) with an
 * array of File, then clears the input so picking the same file again still fires. Returns an unbind function.
 */
export function bindFileButtons(root, handler) {
  if (!root?.querySelectorAll || typeof handler !== 'function') return () => {};
  const undo = [];
  for (const wrap of root.querySelectorAll('.ag-file')) {
    const button = wrap.querySelector('[data-ag-file-button]'), input = wrap.querySelector('input[type="file"]');
    if (!button || !input) continue;
    const onClick = event => { event?.preventDefault?.(); if (!button.disabled && !input.disabled) input.click(); };
    const onChange = async () => {
      const files = [...(input.files ?? [])];
      try { if (files.length) await handler(files, wrap); } finally { input.value = ''; }
    };
    button.addEventListener('click', onClick);
    input.addEventListener('change', onChange);
    undo.push(() => { button.removeEventListener('click', onClick); input.removeEventListener('change', onChange); });
  }
  return () => undo.forEach(fn => fn());
}

/**
 * A <button type="button" class="ag-link"> that looks like an inline link, for in-app navigation ("Open in
 * Locations", "Go to GM Setup"). It is a real button, so it takes focus and Enter/Space. Use <a href> for real URLs.
 * data adds data-* attributes (data: {action: 'open-location', id}). label is escaped text.
 */
export function linkButton(label, {data, icon: iconClass, ariaLabel, tooltip} = {}) {
  return `<button type="button" class="ag-link"${dataAttrs(data)}${ariaLabel ? ` aria-label="${escHtml(ariaLabel)}"` : ''}${tooltip ? ` data-tooltip="${escHtml(tooltip)}"` : ''}>${icon(iconClass)}${escHtml(label)}</button>`;
}

// ---------- Kit 2.3.0: permanent ids made for the GM, and record pickers ----------
/**
 * Upper-case slug of a display name for a permanent id: accents stripped, runs of anything but A-Z/0-9 become one
 * hyphen, no leading/trailing hyphen, cut at maxLen on a whole hyphen part where possible. '' for a name with no letters.
 */
export function idSlug(name, maxLen = 48) {
  let slug = String(name ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (slug.length > maxLen) slug = (slug[maxLen] === '-' ? slug.slice(0, maxLen) : slug.slice(0, maxLen).replace(/-[^-]*$/, '')) || slug.slice(0, maxLen);
  return slug;
}

/**
 * A new permanent id `<PREFIX>-<SLUG>` from a display name, unique among `taken` (ids in use, including retired ones):
 * `-2`, `-3`… are added while the id exists. Generate once at creation and keep it; renaming never regenerates it.
 */
export function generateId(prefix, name, taken = [], {fallback = 'NEW', maxLen = 48} = {}) {
  if (!/^[A-Z][A-Z0-9]*$/.test(String(prefix ?? ''))) throw new TypeError('Id prefix must be upper-case letters and digits.');
  const used = new Set([...(taken ?? [])].map(String)), base = `${prefix}-${idSlug(name, maxLen) || fallback}`;
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

/**
 * Checks an id typed under "Advanced: set id" before creating a record. Returns '' when fine, else a sentence for the
 * GM. `prefixes` is the allowed prefix (or list); `taken` holds ids already used (existing or retired). Upper-case only,
 * letters/digits separated by single hyphens.
 */
export function checkNewId(id, {prefixes, taken = []} = {}) {
  const list = [].concat(prefixes ?? []).map(String), value = String(id ?? '').trim();
  if (!value) return 'Enter an id, or leave it empty to make one from the name.';
  if (!new RegExp(`^(?:${list.join('|')})(?:-[A-Z0-9]+)+$`).test(value)) return `Use ${list.map(p => `${p}-`).join(' or ')} followed by upper-case letters and digits, with single hyphens.`;
  if ([...(taken ?? [])].map(String).includes(value)) return 'That id is already used. Ids are never reused.';
  return '';
}

/**
 * Picker options from records [{value, label, kind?, kindLabel?, group?, gm?}]: only the valid `kinds` (when given), no
 * GM-only records unless `gm` is true, minus `exclude` values; sorted by group then name. hint = the kind label.
 */
export function pickerOptions(records, {kinds, gm = false, exclude = [], hints = {}} = {}) {
  const skip = new Set([...exclude].map(String)), want = kinds ? new Set([].concat(kinds)) : null;
  return [...(records ?? [])]
    .filter(r => r && r.value !== undefined && r.value !== null && String(r.label ?? '').trim() && !skip.has(String(r.value)) && (!want || want.has(r.kind)) && (gm || !r.gm))
    .map(r => ({value: String(r.value), label: String(r.label).trim(), hint: String(r.hint ?? r.kindLabel ?? hints[r.kind] ?? ''), group: String(r.group ?? '')}))
    .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
}

/** Options whose name, hint or group contains every word of `query` (case-insensitive). No query: all of them. */
export function filterPickerOptions(options, query) {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...(options ?? [])];
  return (options ?? []).filter(o => { const hay = `${o.label} ${o.hint ?? ''} ${o.group ?? ''}`.toLowerCase(); return words.every(w => hay.includes(w)); });
}

/** querySelectorAll as a real array (a NodeList has no filter/map/some). */
const qa = (el, selector) => [...(el?.querySelectorAll?.(selector) ?? [])];
const ID_LIKE = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b/;
/** The text for a link whose record is gone: "Missing: <last known name>", never a raw id. */
export function missingLabel(lastKnownName) {
  const name = String(lastKnownName ?? '').trim();
  return `Missing: ${name && !ID_LIKE.test(name) ? name : 'a record that no longer exists'}`;
}

/**
 * A searchable record picker (combobox with type-ahead) that stores an id under the hood and shows names.
 * options: from pickerOptions(). value: the stored id ('' for none). If value is set but not among the options the
 * link is broken: it shows "Missing: <missingName>" with a Replace… button (the stored value is kept until the GM
 * replaces or clears it). A hidden input (id = `id`, plus `data`) carries the value for forms; wire with bindRefPickers().
 * label/none/placeholder/hint are escaped text. `none: null` removes the None choice (a required link).
 */
export function refPicker({id, label, options = [], value = '', missingName, none = 'None', placeholder = 'Search by name…', hint, data, disabled = false, taken = [], inList = false} = {}) {
  const val = String(value ?? ''), current = options.find(o => o.value === val), broken = !!val && !current;
  const listId = `${id}-list`, used = new Set([...taken].map(String));
  let lastGroup = null, items = '';
  if (none !== null) items += `<li role="option" id="${escHtml(id)}-opt-none" class="ag-picker__option ag-picker__option--none" data-value="" data-label="${escHtml(none)}" data-search="">${escHtml(none)}</li>`;
  options.forEach((o, i) => {
    if (o.group && o.group !== lastGroup) items += `<li role="presentation" class="ag-picker__group" data-group="${escHtml(o.group)}">${escHtml(o.group)}</li>`;
    lastGroup = o.group;
    items += `<li role="option" id="${escHtml(id)}-opt-${i}" class="ag-picker__option" data-value="${escHtml(o.value)}" data-label="${escHtml(o.label)}" data-group="${escHtml(o.group ?? '')}" data-search="${escHtml(`${o.label} ${o.hint ?? ''} ${o.group ?? ''}`.toLowerCase())}" aria-selected="${o.value === val}"${used.has(o.value) ? ' data-taken="true" hidden' : ''}>${escHtml(o.label)}${o.hint ? ` <span class="ag-picker__hint">${escHtml(o.hint)}</span>` : ''}</li>`;
  });
  const shown = current ? current.label : '';
  const missing = broken ? `<span class="ag-picker__missing" data-ag-picker-missing><i class="fa-solid fa-link-slash" aria-hidden="true"></i> ${escHtml(missingLabel(missingName))} <button type="button" class="ag-btn ag-btn--sm" data-ag-picker-replace>Replace…</button></span>` : '';
  return `<div class="ag-field ag-picker${broken ? ' is-missing' : ''}" data-ag-picker${inList ? ' data-ag-list-picker' : ''}>
<label for="${escHtml(id)}-text">${escHtml(label)}</label>
<input type="hidden" class="ag-picker__value" id="${escHtml(id)}" value="${escHtml(val)}"${dataAttrs(data)}>${missing}
<div class="ag-picker__box"${broken ? ' hidden' : ''}><input type="text" class="ag-picker__input" id="${escHtml(id)}-text" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="${escHtml(listId)}" autocomplete="off" value="${escHtml(shown)}" placeholder="${escHtml(placeholder)}" data-shown="${escHtml(shown)}"${disabled ? ' disabled' : ''}>
<ul class="ag-picker__list" id="${escHtml(listId)}" role="listbox" aria-label="${escHtml(label)}" hidden>${items}<li role="presentation" class="ag-picker__empty" hidden>No matches</li></ul></div>${hint ? `<span class="ag-field__hint">${escHtml(hint)}</span>` : ''}</div>`;
}

/** Wires one .ag-picker wrapper; returns its unbind function. `after(value, label, wrap)` runs after a choice. */
function bindPicker(wrap, after) {
  const hidden = wrap.querySelector('.ag-picker__value'), input = wrap.querySelector('.ag-picker__input'), list = wrap.querySelector('.ag-picker__list');
  if (!hidden || !input || !list) return () => {};
  const options = () => qa(list, '[role="option"]');
  const heads = () => qa(list, '.ag-picker__group');
  const empty = list.querySelector('.ag-picker__empty');
  const free = o => o.getAttribute('data-taken') !== 'true';
  let active = -1;
  const visible = () => options().filter(o => !o.hidden);
  const setActive = i => {
    const vis = visible(); active = vis.length ? (i + vis.length) % vis.length : -1;
    options().forEach(o => o.removeAttribute('data-active'));
    if (active >= 0) { vis[active].setAttribute('data-active', 'true'); input.setAttribute('aria-activedescendant', vis[active].id ?? ''); vis[active].scrollIntoView?.({block: 'nearest'}); }
    else input.removeAttribute('aria-activedescendant');
  };
  const filter = typed => {
    const words = typed ? String(input.value ?? '').toLowerCase().split(/\s+/).filter(Boolean) : [];
    for (const o of options()) o.hidden = !free(o) || (o.getAttribute('data-value') === '' ? words.length > 0 : !words.every(w => (o.getAttribute('data-search') ?? '').includes(w)));
    for (const h of heads()) h.hidden = !options().some(o => !o.hidden && o.getAttribute('data-group') === h.getAttribute('data-group') && o.getAttribute('data-value') !== '');
    if (empty) empty.hidden = visible().length > 0;
  };
  const open = typed => { filter(typed); list.hidden = false; input.setAttribute('aria-expanded', 'true'); setActive(typed ? 0 : Math.max(0, visible().findIndex(o => o.getAttribute('data-value') === hidden.value))); };
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); input.value = input.getAttribute('data-shown') ?? ''; };
  const choose = opt => {
    if (!opt) return;
    const v = opt.getAttribute('data-value') ?? '', label = v === '' ? '' : (opt.getAttribute('data-label') ?? '');
    hidden.value = v; input.setAttribute('data-shown', label); input.value = label;
    options().forEach(o => o.setAttribute('aria-selected', String(o === opt)));
    const gone = wrap.querySelector('[data-ag-picker-missing]'); if (gone) gone.hidden = true;
    const box = wrap.querySelector('.ag-picker__box'); if (box) box.hidden = false;
    list.hidden = true; input.setAttribute('aria-expanded', 'false');
    if (typeof hidden.dispatchEvent === 'function' && typeof globalThis.Event === 'function') hidden.dispatchEvent(new globalThis.Event('change', {bubbles: true}));
    after?.(v, label, wrap);
  };
  const onInput = () => open(true);
  const onFocus = () => { if (list.hidden) open(false); };
  const onKey = e => {
    if (e.key === 'ArrowDown') { e.preventDefault?.(); if (list.hidden) open(false); else setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault?.(); if (list.hidden) open(false); else setActive(active - 1); }
    else if (e.key === 'Enter') { if (!list.hidden) { e.preventDefault?.(); choose(visible()[active]); } }
    else if (e.key === 'Escape') { if (!list.hidden) { e.preventDefault?.(); e.stopPropagation?.(); close(); } }
  };
  const onBlur = () => close();
  const onDown = e => e.preventDefault?.();
  const onClick = e => { const opt = e.target?.closest?.('[role="option"]'); if (opt) choose(opt); };
  const replace = wrap.querySelector('[data-ag-picker-replace]');
  const onReplace = e => {
    e?.preventDefault?.();
    const gone = wrap.querySelector('[data-ag-picker-missing]'), box = wrap.querySelector('.ag-picker__box');
    if (box) box.hidden = false;
    if (gone) gone.hidden = true;
    input.focus?.(); open(false);
  };
  input.addEventListener('input', onInput); input.addEventListener('focus', onFocus); input.addEventListener('keydown', onKey); input.addEventListener('blur', onBlur);
  list.addEventListener('mousedown', onDown); list.addEventListener('click', onClick);
  replace?.addEventListener('click', onReplace);
  return () => {
    input.removeEventListener('input', onInput); input.removeEventListener('focus', onFocus); input.removeEventListener('keydown', onKey); input.removeEventListener('blur', onBlur);
    list.removeEventListener('mousedown', onDown); list.removeEventListener('click', onClick); replace?.removeEventListener('click', onReplace);
  };
}

/**
 * Wires every refPicker under root (not the ones inside a refList): type to filter, Up/Down/Enter/Escape, click to
 * choose, Replace… for a broken link. Choosing sets the hidden value, shows the name, fires a bubbling `change` on the
 * hidden input and calls onChange(value, label, wrapper). Returns an unbind function.
 */
export function bindRefPickers(root, onChange) {
  if (!root?.querySelectorAll) return () => {};
  const undo = qa(root, '.ag-picker').filter(w => w.getAttribute('data-ag-list-picker') === null).map(w => bindPicker(w, onChange));
  return () => undo.forEach(fn => fn());
}

/**
 * A list of links to several records (locations, prerequisite quests…): each shown by name with Remove, and a picker
 * to add another. values: stored ids. names: {id: last known name} for a link whose record is gone, which shows
 * "Missing: <name>" with Replace… and Remove. locked: a sentence to show instead of the controls when the records
 * cannot be listed (a partner module is off); the links stay and are read back unchanged.
 */
export function refList({id, label, options = [], values = [], names = {}, addLabel = 'Add…', placeholder = 'Search by name…', hint, locked, noun = 'link'} = {}) {
  const byValue = new Map(options.map(o => [o.value, o]));
  const rows = [...new Set([...values].map(String))].map(v => {
    const o = byValue.get(v), name = o ? o.label : missingLabel(names?.[v]);
    if (locked) return `<li class="ag-reflist__item" data-value="${escHtml(v)}" data-label="${escHtml(names?.[v] ?? '')}"><span class="ag-reflist__name">${escHtml(names?.[v] && !ID_LIKE.test(names[v]) ? names[v] : `A ${noun} (names unavailable)`)}</span></li>`;
    return `<li class="ag-reflist__item${o ? '' : ' is-missing'}" data-value="${escHtml(v)}" data-label="${escHtml(o ? o.label : (names?.[v] ?? ''))}"><span class="ag-reflist__name">${o ? '' : '<i class="fa-solid fa-link-slash" aria-hidden="true"></i> '}${escHtml(name)}${o?.hint ? ` <span class="ag-picker__hint">${escHtml(o.hint)}</span>` : ''}</span>${o ? '' : `<button type="button" class="ag-btn ag-btn--sm" data-ag-reflist-replace aria-label="Replace the missing ${escHtml(noun)}">Replace…</button>`}<button type="button" class="ag-btn ag-btn--sm" data-ag-reflist-remove aria-label="Remove ${escHtml(o ? o.label : 'the missing ' + noun)}">Remove</button></li>`;
  }).join('');
  const add = locked ? `<p class="ag-field__hint">${escHtml(locked)}</p>`
    : refPicker({id: `${id}-add`, label: addLabel, options, none: null, placeholder, taken: values, inList: true});
  return `<div class="ag-field ag-reflist" data-ag-reflist id="${escHtml(id)}" role="group" aria-labelledby="${escHtml(id)}-label"><span class="ag-reflist__label" id="${escHtml(id)}-label">${escHtml(label)}</span>
<ul class="ag-reflist__items" data-ag-reflist-items>${rows}</ul><p class="ag-field__hint ag-reflist__none"${rows ? ' hidden' : ''}>None yet.</p>${add}${hint ? `<span class="ag-field__hint">${escHtml(hint)}</span>` : ''}</div>`;
}

/** The ids in a refList (element or any ancestor of it), in the order shown. */
export function readRefList(el) {
  const box = (el?.matches?.('.ag-reflist') || el?.classList?.contains?.('ag-reflist')) ? el : el?.querySelector?.('.ag-reflist');
  return qa(box, '.ag-reflist__item').map(li => li.getAttribute('data-value')).filter(v => v !== null && v !== '');
}

/**
 * Wires every refList under root: choosing in the add picker appends the record by name, Remove drops it, and
 * Replace… on a missing link swaps it for the next record chosen. onChange(values, listElement) after each change.
 * Returns an unbind function.
 */
export function bindRefLists(root, onChange) {
  if (!root?.querySelectorAll) return () => {};
  const undo = [];
  for (const box of qa(root, '.ag-reflist')) {
    const items = box.querySelector('[data-ag-reflist-items]'), none = box.querySelector('.ag-reflist__none'), pickerWrap = box.querySelector('.ag-picker');
    const doc = box.ownerDocument ?? globalThis.document;
    const mk = (tag, attrs, text) => { const el = doc.createElement(tag); for (const [k, v] of Object.entries(attrs ?? {})) el.setAttribute(k, v); if (text !== undefined) el.textContent = text; return el; };
    const taken = (value, on) => { for (const o of qa(pickerWrap, '[role="option"]')) if (o.getAttribute('data-value') === value) { if (on) o.setAttribute('data-taken', 'true'); else o.removeAttribute('data-taken'); o.hidden = on; } };
    const sync = () => { if (none) none.hidden = qa(items, '.ag-reflist__item').length > 0; onChange?.(readRefList(box), box); };
    let replacing = null;
    const onClick = e => {
      const rm = e.target?.closest?.('[data-ag-reflist-remove]'), rep = e.target?.closest?.('[data-ag-reflist-replace]');
      if (rm) { const li = rm.closest('.ag-reflist__item'); const v = li.getAttribute('data-value'); li.remove(); taken(v, false); if (replacing === li) replacing = null; sync(); }
      else if (rep) { replacing = rep.closest('.ag-reflist__item'); pickerWrap?.querySelector('.ag-picker__input')?.focus?.(); }
    };
    box.addEventListener('click', onClick);
    undo.push(() => box.removeEventListener('click', onClick));
    if (pickerWrap) {
      const hidden = pickerWrap.querySelector('.ag-picker__value'), input = pickerWrap.querySelector('.ag-picker__input');
      undo.push(bindPicker(pickerWrap, (value, label) => {
        if (!value) return;
        const li = mk('li', {class: 'ag-reflist__item', 'data-value': value, 'data-label': label});
        li.append(mk('span', {class: 'ag-reflist__name'}, label), mk('button', {type: 'button', class: 'ag-btn ag-btn--sm', 'data-ag-reflist-remove': '', 'aria-label': `Remove ${label}`}, 'Remove'));
        if (replacing && replacing.parentElement) { const old = replacing.getAttribute('data-value'); replacing.replaceWith(li); taken(old, false); replacing = null; }
        else items.append(li);
        taken(value, true);
        hidden.value = ''; input.value = ''; input.setAttribute('data-shown', '');
        sync();
      }));
    }
  }
  return () => undo.forEach(fn => fn());
}
