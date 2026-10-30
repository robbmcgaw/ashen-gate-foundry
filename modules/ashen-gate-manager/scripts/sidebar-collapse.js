/**
 * "Start players with the sidebar collapsed" (Manager 0.81.0). Presentation only. Once, when the game is ready, a non-GM user
 * whose world setting is on has the sidebar collapsed through Foundry's own call. Nothing is wrapped or overridden, nothing
 * is forced closed again on later renders, and the player's own expand and collapse keep working. Arriving chat messages are
 * never expanded or collapsed by this code. Turning the setting on or off mid-session does not collapse anyone live.
 *
 * Foundry V14 names (verified against the 14.367 source, each still feature-detected): the state is the class `expanded` on
 * `#sidebar-content` (inside the `#sidebar` aside), read as `ui.sidebar.expanded` (a boolean getter; no `collapsed` class exists
 * anywhere). `ui.sidebar.collapse()`, `expand()` and `toggleExpanded(expanded?)` set it and fire the `collapseSidebar` hook
 * `(sidebar, collapsed)`. `#sidebar-content` starts WITHOUT `expanded`, so a fresh V14 sidebar is collapsed until a tab is
 * clicked or `activate()` is called. Use `isSidebarExpanded` below, never a class on `#sidebar`.
 */
export const SIDEBAR_CONTENT_ID = 'sidebar-content';

/**
 * Is the sidebar expanded? true or false when known, null when neither Foundry's `ui.sidebar.expanded` nor the
 * `#sidebar-content.expanded` class can say. The getter wins; the class is the fallback.
 */
export function isSidebarExpanded({ ui = globalThis.ui, doc = globalThis.document } = {}) {
  try {
    if (typeof ui?.sidebar?.expanded === 'boolean') return ui.sidebar.expanded;
    const content = doc?.getElementById?.(SIDEBAR_CONTENT_ID);
    if (content?.classList?.contains) return content.classList.contains('expanded');
  } catch { /* unknown */ }
  return null;
}
export const shouldCollapse = ({ isGM, setting }) => !isGM && setting === true;

/** Calls Foundry's collapse. Returns true when a call was made; never throws. */
export function collapseSidebar(ui) {
  const sidebar = ui?.sidebar;
  try {
    if (typeof sidebar?.collapse === 'function') { sidebar.collapse(); return true; }
    if (typeof sidebar?.toggleExpanded === 'function') { sidebar.toggleExpanded(false); return true; }
  } catch (error) { console.warn('[ashen-gate-manager] Sidebar not collapsed', error); }
  return false;
}

/**
 * Runs the one-time collapse. If the sidebar has not rendered yet it waits for the first render, then stops listening.
 * Returns {run, done}: run() is idempotent and does nothing after the first successful collapse.
 */
export function startSidebarCollapsed({ game, hooks, getUi = () => globalThis.ui, appearance }) {
  let finished = false, waiting = null;
  const wanted = () => {
    try { return shouldCollapse({ isGM: Boolean(game?.user?.isGM), setting: appearance?.getState?.()?.collapsePlayerSidebar === true }); } catch { return false; }
  };
  const run = () => {
    if (finished) return false;
    if (!wanted()) { finished = true; return false; }
    const ui = getUi();
    // A fresh V14 sidebar is already collapsed; leave it alone instead of firing the hook for nothing.
    if (ui?.sidebar?.rendered !== false && ui?.sidebar?.expanded === false) { finished = true; return false; }
    if (ui?.sidebar?.rendered === false && waiting === null && typeof hooks?.once === 'function') {
      waiting = hooks.once('renderSidebar', () => { waiting = null; run(); });
      return false;
    }
    finished = true;
    return collapseSidebar(ui);
  };
  return { run, get done() { return finished; } };
}
