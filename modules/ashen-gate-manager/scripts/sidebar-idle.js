/**
 * Auto-collapse of the sidebar chat and Settings panel for players (Manager 0.82.0). Presentation only. A non-GM player who
 * has expanded the sidebar (or opened Settings from the dock) sees it collapse again after `autoCollapseSeconds` (a GM setting,
 * default 8, 0 = off) with no use. Nothing is wrapped or overridden: the timer is driven by events on the sidebar element and
 * by the render hook, and the collapse is Foundry's own call (`collapseSidebar`, sidebar-collapse.js).
 *
 * Not idle (the timer re-waits a full delay instead of collapsing) while:
 *   - the pointer is over the sidebar (also paused, not just checked at the end);
 *   - focus is in a field inside the sidebar (the chat box, a select; a focused button does not count, or the tab you clicked
 *     to open the sidebar would keep it open for ever);
 *   - a text box in the sidebar holds text (chat message being written);
 *   - a dialog or context menu is open, or a window opened from Settings (Configure Settings, Manage Modules, User
 *     Configuration), or the dock's own menu is open.
 * Any pointer movement, press, key, input, focus change or wheel in the sidebar restarts the count. If the sidebar is showing a
 * tab other than Chat or Settings (when other tabs are not hidden) it is left alone. If Settings was peeked, Chat is put back
 * before the collapse so the next expand shows Chat.
 *
 * Foundry V14 names (unconfirmed in a live world): the sidebar root `#sidebar` with class `collapsed` when collapsed (also read
 * from `ui.sidebar.expanded`), and `ui.sidebar.changeTab`. Each is feature-detected.
 */
import { collapseSidebar } from './sidebar-collapse.js';
import { activeTab, FALLBACK_TAB } from './sidebar-tabs.js';

export const SIDEBAR_ID = 'sidebar';
export const COLLAPSIBLE_TABS = Object.freeze(['chat', 'settings']);
/** Sidebar events that count as use. */
export const ACTIVITY_EVENTS = Object.freeze(['pointermove', 'pointerdown', 'click', 'keydown', 'input', 'focusin', 'focusout', 'wheel']);
/** Open windows and menus that mean "still in use". Ids of the Settings-launched windows are unconfirmed V14 names. */
export const OPEN_SELECTORS = Object.freeze(['dialog[open]', '.application.dialog', '#context-menu', '.context-menu',
  '#client-settings', '#settings-config', '#module-management', '#user-config', '#keybindings']);
const NON_TEXT_INPUTS = Object.freeze(['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color', 'file', 'image']);

/** True when any text box inside `root` holds non-blank text. */
export function hasTypedText(root) {
  try {
    for (const el of root?.querySelectorAll?.('textarea, input') ?? []) {
      const type = String(el.type ?? el.getAttribute?.('type') ?? 'text').toLowerCase();
      if (NON_TEXT_INPUTS.includes(type)) continue;
      if (String(el.value ?? '').trim() !== '') return true;
    }
  } catch { /* treated as no text */ }
  return false;
}

/** True when a dialog, menu or Settings-launched window is open anywhere on the page. */
export function hasOpenWindow(doc, selectors = OPEN_SELECTORS) {
  for (const selector of selectors) {
    try { if (doc?.querySelector?.(selector)) return true; } catch { /* skip a selector this DOM rejects */ }
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
  const isExpanded = el => Boolean(el) && !el.classList?.contains?.('collapsed') && getUi()?.sidebar?.expanded !== false;
  const tabOk = () => { const tab = activeTab(getUi()); return !tab || COLLAPSIBLE_TABS.includes(tab); };
  const hovered = el => { try { return Boolean(el.matches?.(':hover')); } catch { return false; } };
  const busy = el => over || hovered(el) || focusInField(el) || hasTypedText(el) || hasOpenWindow(doc) || isDockMenuOpen();
  // Focus counts when it sits in a field you type into (the chat box, a select). A focused button, such as the tab you just
  // clicked to open the sidebar, must not keep it open for ever.
  const focusInField = el => { const a = doc?.activeElement; try { return Boolean(a && a !== el && el.contains?.(a) && a.matches?.('textarea, input, select, [contenteditable]')); } catch { return false; } };
  const stop = () => { if (timer !== null) { clearTimer(timer); timer = null; } };

  function fire() {
    timer = null;
    const el = sidebarEl();
    if (!seconds() || !isExpanded(el) || !tabOk()) return false;
    if (busy(el)) { arm(); return false; }
    const ui = getUi();
    try {
      if (activeTab(ui) && activeTab(ui) !== FALLBACK_TAB && typeof ui?.sidebar?.changeTab === 'function') ui.sidebar.changeTab(FALLBACK_TAB, 'primary');
    } catch { /* Chat is restored by the tab hider on the next render */ }
    const done = collapse(ui);
    try { onCollapsed?.(); } catch { /* the tab hider reports its own errors */ }
    return done;
  }
  /** (Re)starts the count if the sidebar is open and eligible; stops it otherwise. Safe to call any number of times. */
  function arm() {
    stop();
    const delay = seconds();
    const el = sidebarEl();
    if (!delay || over || !isExpanded(el) || !tabOk()) return false;
    timer = setTimer(fire, delay * 1000);
    return true;
  }
  /** Listens on the current sidebar element (re-run after a render replaced it). */
  function bind() {
    const el = sidebarEl();
    if (el === bound) return false;
    unbind?.(); unbind = null; bound = el; over = false;
    if (!el || typeof el.addEventListener !== 'function') return false;
    const enter = () => { over = true; stop(); };
    const leave = () => { over = false; arm(); };
    const use = () => arm();
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
    /** Stops the pending count (the dock closed Settings by hand). */
    cancel() { stop(); },
    refresh() { bind(); return arm(); },
    get pending() { return timer !== null; },
    dispose() { stop(); unbind?.(); unbind = null; bound = null; }
  };
}

/** Wires the collapser to the render hook and setting changes. Returns {idle, stop}. */
export function installSidebarIdleCollapse({ hooks, ...deps }) {
  const idle = createSidebarIdleCollapse(deps);
  const refresh = () => { try { idle.refresh(); } catch (error) { console.warn('[ashen-gate-manager] Auto-collapse not updated', error); } };
  const id = hooks?.on?.('renderSidebar', refresh);
  const unsub = deps.appearance?.subscribe?.(refresh);
  refresh();
  return {
    idle,
    stop() {
      if (id !== undefined) hooks?.off?.('renderSidebar', id);
      if (typeof unsub === 'function') unsub();
      idle.dispose();
    }
  };
}
