/**
 * Ashen Gate shared HTML helpers (ag-html.mjs, UI kit 2).
 * Every module that ships this file ships an identical copy; scripts/check.mjs fails if the copies drift.
 * Kit 2.2.0 adds uiState, subTabs/tabPanelAttrs/bindTablist, fold/bindFolds, fileButton/bindFileButtons and
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
 * tab's data-tab is also remembered (read it back with state.get(key, fallback, ids)). Returns an unbind function.
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
  }
  return () => undo.forEach(fn => fn());
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
