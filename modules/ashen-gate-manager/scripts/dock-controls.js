/**
 * Player screen helpers for the dock (Manager 0.82.0). Presentation only: nothing is written, no document, permission or flag
 * changes, and the GM is never affected (every function checks `isGM` first and does nothing for the GM).
 *
 *  1. Players list: `body.agm-hide-players` hides the bottom-left players / latency / FPS panel (`#players`, unconfirmed V14 id)
 *     through styles/player-dock.css. Only a class is toggled; the element is neither moved nor removed, so Foundry keeps
 *     updating it.
 *  2. Scene controls under the dock: the existing `#scene-controls` element is NOT rebuilt or re-parented. While the setting
 *     is on, `body.agm-controls-docked` makes the stylesheet re-anchor it with position:fixed beneath the dock, and this code
 *     only measures the dock and the controls and publishes `--agm-dock-h` / `--agm-controls-h` on <html> so the stylesheet can
 *     stack them (a ResizeObserver, feature-detected, keeps the numbers current). Tool buttons, the active-tool highlight and
 *     flyout sub-tools stay Foundry's own, with their handlers intact. When the setting goes off, the class and variables are
 *     removed and Foundry's layout returns by itself.
 *  3. User Configuration: one opener, `openUserConfiguration`, tries the V13/V14 ApplicationV2 sheet first and the older global
 *     class second. Both names are unconfirmed in a live world; it never throws and reports whether anything opened.
 */
export const PLAYERS_LIST_CLASS = 'agm-hide-players';
export const CONTROLS_DOCKED_CLASS = 'agm-controls-docked';
export const CONTROLS_SELECTOR = '#scene-controls';

export const shouldHidePlayersList = ({ isGM, setting }) => !isGM && setting === true;
export const shouldDockControls = ({ isGM, setting, dockShown }) => !isGM && setting === true && dockShown === true;

/** Adds or removes a class on <body>; works with classList.toggle or, failing that, add/remove. Returns true when it is set. */
export function setBodyClass(doc, name, on) {
  const list = doc?.body?.classList;
  if (!list) return false;
  if (typeof list.toggle === 'function') list.toggle(name, Boolean(on));
  else if (on) list.add?.(name); else list.remove?.(name);
  return Boolean(on);
}

/** Players list: hide for a non-GM player while the setting is on. Idempotent; live. */
export function applyPlayersList({ game, doc, state }) {
  return setBodyClass(doc, PLAYERS_LIST_CLASS, shouldHidePlayersList({ isGM: Boolean(game?.user?.isGM), setting: state?.hidePlayersList === true }));
}

/**
 * Keeps the layout numbers for the docked scene controls. `enable({dock, corner})` / `disable()` are idempotent; `measure()`
 * re-reads the sizes (call it after a render of the dock or the controls).
 */
export function createControlsLayout({ doc, win = globalThis.window ?? globalThis }) {
  let observer = null, on = false, dockEl = null;
  const root = () => doc?.documentElement ?? null;
  const setVar = (name, value) => { try { root()?.style?.setProperty?.(name, value); } catch { /* the stylesheet falls back to 0 */ } };
  const clearVars = () => { try { root()?.style?.removeProperty?.('--agm-dock-h'); root()?.style?.removeProperty?.('--agm-controls-h'); } catch { /* nothing to clear */ } };
  const controls = () => { try { return doc?.querySelector?.(CONTROLS_SELECTOR) ?? null; } catch { return null; } };
  const px = el => { try { const h = el?.getBoundingClientRect?.().height; return Number.isFinite(h) ? Math.round(h) : 0; } catch { return 0; } };
  function measure() {
    if (!on) return false;
    setVar('--agm-dock-h', `${px(dockEl)}px`);
    setVar('--agm-controls-h', `${px(controls())}px`);
    return true;
  }
  function watch() {
    if (typeof win?.ResizeObserver !== 'function') return;
    try {
      observer ??= new win.ResizeObserver(() => measure());
      for (const el of [dockEl, controls()]) if (el) observer.observe(el);
    } catch { observer = null; }
  }
  return {
    get active() { return on; },
    enable({ dock, corner = 'top-left' }) {
      dockEl = dock;
      on = true;
      setBodyClass(doc, CONTROLS_DOCKED_CLASS, true);
      try { doc.body?.setAttribute?.('data-agm-dock-corner', corner); } catch { /* the default corner rules apply */ }
      watch();
      measure();
      return true;
    },
    disable() {
      if (!on && !doc?.body?.classList?.contains?.(CONTROLS_DOCKED_CLASS)) return false;
      on = false; dockEl = null;
      try { observer?.disconnect?.(); } catch { /* nothing observed */ }
      observer = null;
      setBodyClass(doc, CONTROLS_DOCKED_CLASS, false);
      try { doc.body?.removeAttribute?.('data-agm-dock-corner'); } catch { /* attribute already gone */ }
      clearVars();
      return true;
    },
    measure
  };
}

/**
 * Opens the player's own User Configuration window. The one place that knows the class: V13/V14
 * `foundry.applications.sheets.UserConfig` (ApplicationV2, `{document: user}`), then the older global `UserConfig`
 * (`new UserConfig(user)`). Returns true when a window was asked to open; never throws.
 */
export function openUserConfiguration({ foundryNs = globalThis.foundry, game = globalThis.game, globals = globalThis } = {}) {
  const user = game?.user;
  if (!user) return false;
  try {
    const V2 = foundryNs?.applications?.sheets?.UserConfig;
    if (typeof V2 === 'function') { new V2({ document: user }).render({ force: true }); return true; }
    const legacy = globals?.UserConfig;
    if (typeof legacy === 'function') { new legacy(user).render(true); return true; }
  } catch (error) { console.warn('[ashen-gate-manager] User Configuration not opened', error); }
  return false;
}
