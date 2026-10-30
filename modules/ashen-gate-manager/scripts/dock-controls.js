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
 *  3. (0.83.0) Token controls row: while the controls are docked, players' scene controls are cleaned and laid out as one
 *     horizontal row. The group buttons (`#scene-controls-controls`, V14 id confirmed from foundry.mjs 14.367: a <menu> of
 *     `button.control[data-control]`) are hidden, and of the tools (`button.tool[data-tool]` inside `#scene-controls-tools`)
 *     only Select (`select`), Select Targets (`target`), Measure (`ruler`) and Find My Token stay. Core has no find-my-token
 *     tool, so that one comes from another module and is recognised by name, label or icon (FIND_TOKEN_PATTERN); every other
 *     tool is hidden and its name is listed in `data-agm-tools-hidden` on <body> so it can be reported. If the open group is not
 *     the token group nothing is hidden. Only a marker attribute is set on the core buttons; handlers, the active-tool
 *     highlight and flyouts stay Foundry's own.
 *  4. (0.83.0) Scene navigation at the bottom left: `body.agm-nav-bottom` re-anchors the existing `#scene-navigation` with
 *     CSS (position, bottom, left) from measured `--agm-nav-h` / `--agm-controls-h` / `--agm-dock-h`, giving the stack
 *     dock / controls row / navigation. Nothing is moved in the page.
 *  5. User Configuration: one opener, `openUserConfiguration`, tries the V13/V14 ApplicationV2 sheet first and the older global
 *     class second. Both names are unconfirmed in a live world; it never throws and reports whether anything opened.
 */
export const PLAYERS_LIST_CLASS = 'agm-hide-players';
export const CONTROLS_DOCKED_CLASS = 'agm-controls-docked';
export const CONTROLS_SELECTOR = '#scene-controls';
export const CONTROLS_CLEAN_CLASS = 'agm-controls-clean';
export const NAV_BOTTOM_CLASS = 'agm-nav-bottom';
/** V14 (14.367) id first, the V11 to V13 id second. The one place that names the scene navigation. */
export const NAVIGATION_SELECTORS = Object.freeze(['#scene-navigation', '#navigation']);
/** Token-group tools kept for players (V14 data-tool values: select, target, ruler). */
export const KEEP_TOOLS = Object.freeze(['select', 'target', 'ruler']);
/** Another module's "find my token" tool: its data-tool, label or icon. Core 14.367 has none, so this is a best guess. */
export const FIND_TOKEN_PATTERN = /find[\s_-]*(my)?[\s_-]*token|locate[\s_-]*(my)?[\s_-]*token|my[\s_-]*token|token[\s_-]*(find|locate)|fa-(location-)?crosshairs|fa-binoculars|fa-street-view|fa-magnifying-glass-location/i;
export const GROUP_BUTTON_SELECTOR = 'button[data-control]';
export const TOOL_BUTTON_SELECTOR = 'button[data-tool]';
const HIDE_MARK = 'agmToolHidden';

export const shouldHidePlayersList = ({ isGM, setting }) => !isGM && setting === true;
export const shouldDockControls = ({ isGM, setting, dockShown }) => !isGM && setting === true && dockShown === true;
/** 0.83.0: the bottom-left stack (dock, controls row, scene navigation). Needs the dock, like the controls setting. */
export const shouldStackBottom = ({ isGM, setting, dockShown }) => !isGM && setting === true && dockShown === true;

/** The scene navigation element (the only place that knows its selector), or null. */
export function sceneNavigationElement(doc) {
  for (const selector of NAVIGATION_SELECTORS) {
    try { const el = doc?.querySelector?.(selector); if (el) return el; } catch { /* try the next selector */ }
  }
  return null;
}

/** keep | hide for one tool button, from its data-tool, label and icon classes. Defensive: unknown tools are hidden. */
export function classifyTool({ name = '', label = '', icon = '' } = {}) {
  if (KEEP_TOOLS.includes(String(name))) return 'keep';
  return FIND_TOKEN_PATTERN.test(`${name} ${label} ${icon}`) ? 'keep' : 'hide';
}
const wrapperOf = el => { try { return el.closest?.('li') ?? el; } catch { return el; } };
function hideEl(el, hide) {
  if (hide) { el.hidden = true; if (el.dataset) el.dataset[HIDE_MARK] = '1'; }
  else if (el.dataset?.[HIDE_MARK]) { el.hidden = false; delete el.dataset[HIDE_MARK]; }
}

/**
 * Cleans the token controls for a player: hides the group buttons and every tool except Select, Select Targets, Measure and
 * Find My Token. `on` false restores what was hidden. Returns {clean, kept, hidden} (names); never throws. Nothing is hidden
 * unless the token group is the open one (so a player is never left without a way to switch group).
 */
export function applyControlsFilter({ doc, on }) {
  const result = { clean: false, kept: [], hidden: [] };
  try {
    const root = doc?.querySelector?.(CONTROLS_SELECTOR) ?? null;
    const groups = [...(root?.querySelectorAll?.(GROUP_BUTTON_SELECTOR) ?? [])];
    const tools = [...(root?.querySelectorAll?.(TOOL_BUTTON_SELECTOR) ?? [])];
    const names = tools.map(el => el.dataset?.tool);
    const activeGroup = groups.find(el => el.getAttribute?.('aria-pressed') === 'true')?.dataset?.control;
    const tokenGroup = activeGroup ? /^tokens?$/.test(activeGroup) : names.includes('target') || names.includes('ruler');
    const clean = Boolean(on) && tokenGroup && tools.length > 0;
    setBodyClass(doc, CONTROLS_CLEAN_CLASS, clean);
    for (const el of groups) hideEl(wrapperOf(el), clean);
    for (const el of tools) {
      const name = el.dataset?.tool ?? '';
      const label = el.getAttribute?.('aria-label') ?? '';
      const verdict = classifyTool({ name, label, icon: el.getAttribute?.('class') ?? '' });
      if (verdict === 'keep') { el.setAttribute?.('data-agm-keep', '1'); (clean ? result.kept : []).push(name); }
      else el.removeAttribute?.('data-agm-keep');
      hideEl(wrapperOf(el), clean && verdict === 'hide');
      if (clean && verdict === 'hide') result.hidden.push(name);
    }
    result.clean = clean;
    if (clean) doc.body?.setAttribute?.('data-agm-tools-hidden', result.hidden.join(' '));
    else doc.body?.removeAttribute?.('data-agm-tools-hidden');
  } catch (error) { console.warn('[ashen-gate-manager] Scene controls not tidied', error); }
  return result;
}

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
  const clearVars = () => { try { for (const name of ['--agm-dock-h', '--agm-controls-h', '--agm-nav-h']) root()?.style?.removeProperty?.(name); } catch { /* nothing to clear */ } };
  const nav = () => sceneNavigationElement(doc);
  let stackOn = false, controlsOn = false;
  const controls = () => { try { return doc?.querySelector?.(CONTROLS_SELECTOR) ?? null; } catch { return null; } };
  const px = el => { try { const h = el?.getBoundingClientRect?.().height; return Number.isFinite(h) ? Math.round(h) : 0; } catch { return 0; } };
  function measure() {
    if (!on) return false;
    setVar('--agm-dock-h', `${px(dockEl)}px`);
    setVar('--agm-controls-h', `${px(controls())}px`);
    setVar('--agm-nav-h', stackOn ? `${px(nav())}px` : '0px');
    return true;
  }
  function watch() {
    if (typeof win?.ResizeObserver !== 'function') return;
    try {
      observer ??= new win.ResizeObserver(() => measure());
      for (const el of [dockEl, controls(), stackOn ? nav() : null]) if (el) observer.observe(el);
    } catch { observer = null; }
  }
  return {
    get active() { return on; },
    /** controls: stack the (cleaned) controls under the dock; stack: also the bottom-left stack with the scene navigation. */
    enable({ dock, corner = 'top-left', controls: dockControls = true, stack = false }) {
      dockEl = dock;
      on = true; stackOn = Boolean(stack); controlsOn = Boolean(dockControls || stack);
      setBodyClass(doc, CONTROLS_DOCKED_CLASS, controlsOn);
      setBodyClass(doc, NAV_BOTTOM_CLASS, stackOn);
      applyControlsFilter({ doc, on: controlsOn });
      try { doc.body?.setAttribute?.('data-agm-dock-corner', stackOn ? 'bottom-left' : corner); } catch { /* the default corner rules apply */ }
      watch();
      measure();
      return true;
    },
    disable() {
      if (!on && !doc?.body?.classList?.contains?.(CONTROLS_DOCKED_CLASS) && !doc?.body?.classList?.contains?.(NAV_BOTTOM_CLASS)) return false;
      on = false; dockEl = null; stackOn = false; controlsOn = false;
      applyControlsFilter({ doc, on: false });
      setBodyClass(doc, NAV_BOTTOM_CLASS, false);
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
