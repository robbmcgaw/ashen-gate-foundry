/**
 * Auto-collapse of the sidebar chat and Settings panel for players (Manager 0.82.0; reliability fixes 0.85.1). Presentation only.
 * A non-GM player who has expanded the sidebar (or opened Settings from the dock) sees it collapse again after
 * `autoCollapseSeconds` (a GM setting, default 8, 0 = off) with no use. Nothing is wrapped or overridden: the timer is driven by
 * events on the sidebar element and by Foundry's hooks, and the collapse is Foundry's own call (`collapseSidebar`).
 *
 * Not idle (the timer re-waits a full delay instead of collapsing) while, each recorded as a reason on <body data-agm-idle-busy>:
 *   - pointer: the pointer is really over the sidebar (`:hover` is asked at that moment; the enter/leave flag is only a fallback
 *     for a DOM that cannot answer, because that flag sticks when the element is re-rendered under the pointer);
 *   - focus: a <select> in the sidebar has focus. A focused text field does NOT count: V14 focuses the chat input by itself
 *     whenever the sidebar expands (`ChatLog#_toggleNotifications` calls `inputElement.focus()`), so a stale focus said nothing;
 *   - text: a text box in the sidebar holds text. The V14 chat box is a <prose-mirror id="chat-message"> whose editor is a
 *     contenteditable element, not a textarea, so text is read from contenteditable elements too;
 *   - window: a dialog, a context menu (only one that is rendered and has entries) or a Settings-launched window is open;
 *   - dock-menu: the player dock's own menu is open.
 * Any pointer movement, press, key, input, focus change or wheel in the sidebar restarts the count. The count is armed on
 * Foundry's `renderSidebar`, `collapseSidebar` (expanded by any path: tab click, keyboard shortcut, the dock) and
 * `changeSidebarTab` hooks. If the sidebar is showing a tab other than Chat or Settings it is left alone. If Settings was
 * peeked, Chat is put back before the collapse so the next expand shows Chat.
 *
 * Diagnostics for a report: `<body data-agm-idle-armed="8">` while a count runs (the delay in seconds) and
 * `<body data-agm-idle-busy="pointer|focus|text|window|dock-menu">` while the last check found the sidebar in use.
 *
 * Foundry V14 names (verified against 14.367, feature-detected): expanded means `ui.sidebar.expanded` is true, which is the class
 * `expanded` on `#sidebar-content` (there is no `collapsed` class on `#sidebar`); `toggleExpanded` fires
 * `collapseSidebar(sidebar, collapsed)`; tabs change with `ui.sidebar.changeTab`, which fires `changeSidebarTab`. A context menu is
 * a `<nav id="context-menu">` that exists only while open (created in `ContextMenu#render`, removed in `_close`, and never
 * inserted when it has no entries). Dialogs are `<dialog>` elements with `open` set by `show()`/`showModal()`; Configure Settings
 * is `#settings-config`, Manage Modules `#module-management`, Controls `#controls-config`, User Configuration a `.user-config`
 * application. A new chat message while collapsed only shows a notification popup or a pip; core does not expand the sidebar.
 */
import { collapseSidebar, isSidebarExpanded } from './sidebar-collapse.js';
import { activeTab, FALLBACK_TAB } from './sidebar-tabs.js';

export const SIDEBAR_ID = 'sidebar';
export const COLLAPSIBLE_TABS = Object.freeze(['chat', 'settings']);
/** Sidebar events that count as use. */
export const ACTIVITY_EVENTS = Object.freeze(['pointermove', 'pointerdown', 'click', 'keydown', 'input', 'focusin', 'focusout', 'wheel']);
/** Open windows and menus that mean "still in use". Each one counts only while shown (see isShown). */
export const OPEN_SELECTORS = Object.freeze(['dialog[open]', '.application.dialog', '#context-menu', '.context-menu',
  '#settings-config', '#module-management', '#controls-config', '.application.user-config']);
/** Reasons the sidebar can be in use, as written to the body attribute. */
export const BUSY_REASONS = Object.freeze(['pointer', 'focus', 'text', 'window', 'dock-menu']);
export const BUSY_ATTR = 'data-agm-idle-busy';
export const ARMED_ATTR = 'data-agm-idle-armed';

const INVISIBLE = /[\u200b-\u200d\u2060\ufeff\u00a0]/g;
const cleanText = value => String(value ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').replace(INVISIBLE, ' ').trim();
/** Parts of the sidebar that hold values but are not typing: the dice tray / roll controls and message-mode buttons. */
const CONTROL_IDS = Object.freeze(['chat-controls', 'message-modes', 'roll-privacy']);
const CONTROL_CLASS = /(^|\s)(dice-tray\S*|roll-controls|chat-controls|control-buttons)(\s|$)/;
const FREE_TEXT_TYPES = Object.freeze(['text', 'search', '']);
const inControls = el => { for (let n = el; n; n = n.parentElement) { if (CONTROL_IDS.includes(n.id) || CONTROL_CLASS.test(String(n.getAttribute?.('class') ?? ''))) return true; } return false; };
const inEditor = el => { for (let n = el; n; n = n.parentElement) { if (n.id === 'chat-message' || String(n.tagName).toLowerCase() === 'prose-mirror') return true; } return false; };
const flagged = el => el?.hidden === true || el?.disabled === true || el?.readOnly === true
  || ['readonly', 'disabled', 'hidden'].some(a => el?.hasAttribute?.(a) || el?.getAttribute?.(a) === '');
/** "tag#id.class" of an element, trimmed, for the diagnostic. */
export function describeElement(el) {
  try { const cls = String(el.getAttribute?.('class') ?? '').trim().split(/\s+/).filter(Boolean)[0]; return `${String(el.tagName ?? '').toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}`.slice(0, 60); } catch { return 'unknown'; }
}
/**
 * The element that holds typed text inside `root`, or null. Only two things count: the chat message editor (`#chat-message`,
 * the `prose-mirror` element or its editable child; its `value` or editable text with tags, zero-width and nbsp characters
 * ignored, so an empty paragraph or a placeholder is empty), and genuine free-text fields (textarea, input type text or
 * search) that are not read-only, disabled or hidden and are not part of the dice tray or roll controls. Number, range, hidden
 * and every other input type are ignored, as is any other contenteditable.
 */
export function typedTextElement(root) {
  try {
    const editors = [...(root?.querySelectorAll?.('[id="chat-message"]') ?? []), ...[...(root?.querySelectorAll?.('[contenteditable]') ?? [])].filter(inEditor)];
    for (const ed of editors) {
      if (ed.hidden === true) continue;
      const editable = ed.getAttribute?.('contenteditable') != null ? ed : ed.querySelector?.('[contenteditable]');
      if (editable && String(editable.getAttribute?.('contenteditable')).toLowerCase() === 'false') continue;
      const text = editable ? cleanText(editable.textContent) : cleanText(typeof ed.value === 'string' ? ed.value : ed.textContent);
      if (text !== '') return ed;
    }
    for (const el of root?.querySelectorAll?.('textarea, input') ?? []) {
      if (flagged(el) || inControls(el) || inEditor(el)) continue;
      const tag = String(el.tagName ?? '').toLowerCase();
      if (tag === 'input' && !FREE_TEXT_TYPES.includes(String(el.type ?? el.getAttribute?.('type') ?? 'text').toLowerCase())) continue;
      if (cleanText(el.value) !== '') return el;
    }
  } catch { /* treated as no text */ }
  return null;
}
/** True when the chat message editor or a free-text field in `root` holds non-blank text. */
export const hasTypedText = root => typedTextElement(root) !== null;

/** Is this element really on screen? Not hidden, not an unopened dialog, not an empty menu shell. */
export function isShown(el) {
  try {
    if (!el || el.hidden === true || el.getAttribute?.('aria-hidden') === 'true') return false;
    if (String(el.tagName).toLowerCase() === 'dialog' && !(el.hasAttribute?.('open') || el.getAttribute?.('open') !== null || el.open === true)) return false;
    if (el.id === 'context-menu' || el.classList?.contains?.('context-menu')) { if (!el.children?.length) return false; }
    if (typeof el.checkVisibility === 'function' && el.checkVisibility() === false) return false;
    return true;
  } catch { return false; }
}

/** True when a dialog, menu or Settings-launched window is open (and shown) anywhere on the page. */
export function hasOpenWindow(doc, selectors = OPEN_SELECTORS) {
  for (const selector of selectors) {
    try {
      const list = doc?.querySelectorAll ? [...doc.querySelectorAll(selector)] : [doc?.querySelector?.(selector)];
      if (list.some(el => isShown(el))) return true;
    } catch { /* skip a selector this DOM rejects */ }
  }
  return false;
}

export function createSidebarIdleCollapse({
  game, doc = globalThis.document, getUi = () => globalThis.ui, appearance,
  collapse = collapseSidebar, onCollapsed = null, isDockMenuOpen = () => false,
  setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = id => clearTimeout(id)
}) {
  let timer = null, over = false, bound = null, unbind = null;
  const seconds = () => {
    try {
      if (game?.user?.isGM) return 0;
      const n = Number(appearance?.getState?.()?.autoCollapseSeconds);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch { return 0; }
  };
  const sidebarEl = () => doc?.getElementById?.(SIDEBAR_ID) ?? null;
  const isExpanded = el => Boolean(el) && isSidebarExpanded({ ui: getUi(), doc }) === true;
  const tabOk = () => { const tab = activeTab(getUi()); return !tab || COLLAPSIBLE_TABS.includes(tab); };
  // Ask the browser whether the pointer is really over the sidebar. The enter/leave flag sticks when the element is re-rendered
  // under the pointer or the pointer leaves the window, so it is used only when the DOM cannot answer `:hover`.
  const hovered = el => { try { return Boolean(el.matches(':hover')); } catch { return over; } };
  // A focused select counts (its native list leaves no trace in the DOM). A focused text field does not: V14 focuses the chat
  // box itself whenever the sidebar expands, so only typed text (hasTypedText) keeps the sidebar open.
  const focusInSelect = el => { const a = doc?.activeElement; try { return Boolean(a && a !== el && el.contains?.(a) && a.matches?.('select')); } catch { return false; } };
  /** Why the sidebar is in use right now, or null when it is idle. */
  const busyReason = el => {
    if (hovered(el)) return 'pointer';
    if (focusInSelect(el)) return 'focus';
    const typed = typedTextElement(el);
    if (typed) return `text:${describeElement(typed)}`;
    if (hasOpenWindow(doc)) return 'window';
    try { if (isDockMenuOpen()) return 'dock-menu'; } catch { /* not open */ }
    return null;
  };
  const mark = (name, value) => {
    try {
      const body = doc?.body;
      if (!body?.setAttribute) return;
      if (value === null || value === undefined) { if (body.getAttribute?.(name) !== null) body.removeAttribute?.(name); }
      else if (body.getAttribute?.(name) !== String(value)) body.setAttribute(name, String(value));
    } catch { /* diagnostics only */ }
  };
  const stop = () => { if (timer !== null) { clearTimer(timer); timer = null; } mark(ARMED_ATTR, null); };
  const clearMarks = () => { mark(ARMED_ATTR, null); mark(BUSY_ATTR, null); };

  function fire() {
    timer = null;
    mark(ARMED_ATTR, null);
    const el = sidebarEl();
    if (!seconds() || !isExpanded(el) || !tabOk()) { mark(BUSY_ATTR, null); return false; }
    const reason = busyReason(el);
    if (reason) { mark(BUSY_ATTR, reason); arm(false); return false; }
    mark(BUSY_ATTR, null);
    const ui = getUi();
    try {
      if (activeTab(ui) && activeTab(ui) !== FALLBACK_TAB && typeof ui?.sidebar?.changeTab === 'function') ui.sidebar.changeTab(FALLBACK_TAB, 'primary');
    } catch { /* Chat is restored by the tab hider on the next render */ }
    const done = collapse(ui);
    try { onCollapsed?.(); } catch { /* the tab hider reports its own errors */ }
    return done;
  }
  /**
   * (Re)starts the count if the sidebar is open and eligible; stops it otherwise. Safe to call any number of times. The pointer
   * does not stop the count: it is checked when the count ends (fire), so a stuck enter flag cannot freeze it.
   * `diagnose` false (pointer moves) skips refreshing the busy attribute.
   */
  function arm(diagnose = true) {
    stop();
    const delay = seconds();
    const el = sidebarEl();
    if (!delay || !isExpanded(el) || !tabOk()) { mark(BUSY_ATTR, null); return false; }
    timer = setTimer(fire, delay * 1000);
    mark(ARMED_ATTR, delay);
    if (diagnose) mark(BUSY_ATTR, busyReason(el));
    return true;
  }
  /** Listens on the current sidebar element (re-run after a render replaced it). */
  function bind() {
    const el = sidebarEl();
    if (el === bound) return false;
    unbind?.(); unbind = null; bound = el; over = false;
    if (!el || typeof el.addEventListener !== 'function') return false;
    const enter = () => { over = true; arm(); };
    const leave = () => { over = false; arm(); };
    const use = event => arm(event?.type !== 'pointermove');
    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointerleave', leave);
    for (const type of ACTIVITY_EVENTS) el.addEventListener(type, use);
    unbind = () => {
      el.removeEventListener?.('pointerenter', enter);
      el.removeEventListener?.('pointerleave', leave);
      for (const type of ACTIVITY_EVENTS) el.removeEventListener?.(type, use);
    };
    return true;
  }
  return {
    arm, bind, fire,
    /** Stops the pending count (the dock closed Settings by hand, or the sidebar collapsed). */
    cancel() { stop(); mark(BUSY_ATTR, null); },
    refresh() { bind(); return arm(); },
    get pending() { return timer !== null; },
    dispose() { stop(); clearMarks(); unbind?.(); unbind = null; bound = null; }
  };
}

/**
 * Wires the collapser to Foundry's hooks and setting changes. Returns {idle, stop}. `renderSidebar` covers a new element,
 * `collapseSidebar(sidebar, collapsed)` covers the sidebar being expanded or collapsed by any path (clicking a tab toggles a
 * class without a render), `changeSidebarTab` covers switching between Chat and Settings.
 */
export function installSidebarIdleCollapse({ hooks, ...deps }) {
  const idle = createSidebarIdleCollapse(deps);
  const refresh = () => { try { idle.refresh(); } catch (error) { console.warn('[ashen-gate-manager] Auto-collapse not updated', error); } };
  const onCollapse = (_sidebar, collapsed) => { if (collapsed === true) { try { idle.cancel(); } catch { /* nothing pending */ } } else refresh(); };
  const names = [['renderSidebar', refresh], ['collapseSidebar', onCollapse], ['changeSidebarTab', refresh]];
  const ids = names.map(([name, fn]) => [name, hooks?.on?.(name, fn)]);
  const unsub = deps.appearance?.subscribe?.(refresh);
  refresh();
  return {
    idle,
    stop() {
      for (const [name, id] of ids) if (id !== undefined) hooks?.off?.(name, id);
      if (typeof unsub === 'function') unsub();
      idle.dispose();
    }
  };
}
