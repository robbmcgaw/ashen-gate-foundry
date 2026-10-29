/**
 * "Start players with the sidebar collapsed" (Manager 0.81.0). Presentation only. Once, when the game is ready, a non-GM user
 * whose world setting is on has the sidebar collapsed through Foundry's own call. Nothing is wrapped or overridden, nothing
 * is forced closed again on later renders, and the player's own expand and collapse keep working. Arriving chat messages are
 * never expanded or collapsed by this code. Turning the setting on or off mid-session does not collapse anyone live.
 *
 * Foundry V14 names (unconfirmed in a live world, each feature-detected): `ui.sidebar.collapse()`, with
 * `ui.sidebar.toggleExpanded(false)` as the second choice, and the `renderSidebar` hook for a sidebar not yet rendered.
 */
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
    if (ui?.sidebar?.rendered === false && waiting === null && typeof hooks?.once === 'function') {
      waiting = hooks.once('renderSidebar', () => { waiting = null; run(); });
      return false;
    }
    finished = true;
    return collapseSidebar(ui);
  };
  return { run, get done() { return finished; } };
}
