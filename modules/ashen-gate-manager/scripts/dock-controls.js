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
 *  4. (0.85.0) Scene navigation: left where Foundry puts it (top left) unless the dock occupies the top-left corner. Then
 *     `body.agm-nav-offset` and `--agm-nav-shift` slide the existing `#scene-navigation` to the right of the dock column (the dock,
 *     and the token controls under it when docked), measured as `--agm-dock-w`. Nothing is reserved above, below or for its
 *     expanded scene list, and in any other corner nothing is touched. (0.83.0's "bottom-left stack" setting was reverted.)
 *  5. User Configuration (0.85.0 toggle): `foundry.applications.sheets.UserConfig` (ApplicationV2, `{document: user}`, confirmed in
 *     Foundry 14.367). The open window is found in the core registry `foundry.applications.instances` (instance of that class,
 *     `document === game.user`, `rendered`), so the state is the real one: the first press opens, the next press calls its
 *     `close()`, and closing it any other way (its own X) simply makes it not found. The older global `UserConfig` is the fallback
 *     for opening only. It never throws.
 */
export const PLAYERS_LIST_CLASS = 'agm-hide-players';
export const CONTROLS_DOCKED_CLASS = 'agm-controls-docked';
export const CONTROLS_SELECTOR = '#scene-controls';
export const CONTROLS_CLEAN_CLASS = 'agm-controls-clean';
export const NAV_OFFSET_CLASS = 'agm-nav-offset';
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
/** 0.85.0: the scene navigation is nudged only for a player whose dock is showing in the top-left corner. */
export const shouldOffsetNavigation = ({ isGM, corner, dockShown }) => !isGM && dockShown === true && corner === 'top-left';
export const NAV_GAP_PX = 8;

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
 * Keeps the layout numbers for the dock group. `enable({dock, corner, controls})` / `disable()` are idempotent; `measure()`
 * re-reads the sizes (call it after a render of the dock or the controls). `enable` always records the corner on <body>
 * (`data-agm-dock-corner`), whatever else is on; `controls` also docks and tidies the token controls; a top-left dock also
 * slides the scene navigation to its right.
 */
export function createControlsLayout({ doc, win = globalThis.window ?? globalThis }) {
  let observer = null, on = false, dockEl = null, corner = 'top-left', controlsOn = false, navShift = 0;
  const root = () => doc?.documentElement ?? null;
  const setVar = (name, value) => { try { root()?.style?.setProperty?.(name, value); } catch { /* the stylesheet falls back to 0 */ } };
  const clearVars = () => { try { for (const name of ['--agm-dock-h', '--agm-controls-h', '--agm-dock-w', '--agm-nav-shift']) root()?.style?.removeProperty?.(name); } catch { /* nothing to clear */ } };
  const controls = () => { try { return doc?.querySelector?.(CONTROLS_SELECTOR) ?? null; } catch { return null; } };
  const rect = el => { try { return el?.getBoundingClientRect?.() ?? null; } catch { return null; } };
  const px = el => { const h = rect(el)?.height; return Number.isFinite(h) ? Math.round(h) : 0; };
  const offsetNav = () => shouldOffsetNavigation({ isGM: false, corner, dockShown: on });
  function measure() {
    if (!on) return false;
    const d = rect(dockEl), c = controlsOn ? rect(controls()) : null;
    setVar('--agm-dock-h', `${px(dockEl)}px`);
    setVar('--agm-controls-h', `${px(controls())}px`);
    const left = Number.isFinite(d?.left) ? d.left : 0;
    const right = Math.max(Number.isFinite(d?.right) ? d.right : 0, Number.isFinite(c?.right) ? c.right : 0);
    setVar('--agm-dock-w', `${Math.max(0, Math.round(right - left))}px`);
    measureNav(right);
    return true;
  }
  /** Slides the navigation so its left edge is NAV_GAP_PX right of `groupRight`. Its natural left is read with our own shift taken off. */
  function measureNav(groupRight) {
    if (!offsetNav()) { navShift = 0; try { root()?.style?.removeProperty?.('--agm-nav-shift'); } catch { /* nothing set */ } return; }
    const nav = sceneNavigationElement(doc), r = rect(nav);
    if (!r || !Number.isFinite(r.left)) { navShift = 0; setVar('--agm-nav-shift', '0px'); return; }
    const ow = Number(nav.offsetWidth);
    const scale = ow > 0 && r.width > 0 ? r.width / ow : 1; // #ui-left is scaled by the interface scale
    const natural = r.left - navShift * scale;
    navShift = Math.max(0, Math.round((groupRight + NAV_GAP_PX - natural) / scale));
    setVar('--agm-nav-shift', `${navShift}px`);
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
    enable({ dock, corner: where = 'top-left', controls: dockControls = false }) {
      dockEl = dock; corner = where; on = true; controlsOn = Boolean(dockControls);
      setBodyClass(doc, CONTROLS_DOCKED_CLASS, controlsOn);
      setBodyClass(doc, NAV_OFFSET_CLASS, offsetNav());
      applyControlsFilter({ doc, on: controlsOn });
      try { doc.body?.setAttribute?.('data-agm-dock-corner', corner); } catch { /* the default corner rules apply */ }
      watch();
      measure();
      return true;
    },
    disable() {
      const cl = doc?.body?.classList;
      if (!on && !cl?.contains?.(CONTROLS_DOCKED_CLASS) && !cl?.contains?.(NAV_OFFSET_CLASS) && !doc?.body?.hasAttribute?.('data-agm-dock-corner')) return false;
      on = false; dockEl = null; controlsOn = false; navShift = 0;
      applyControlsFilter({ doc, on: false });
      try { observer?.disconnect?.(); } catch { /* nothing observed */ }
      observer = null;
      setBodyClass(doc, CONTROLS_DOCKED_CLASS, false);
      setBodyClass(doc, NAV_OFFSET_CLASS, false);
      try { doc.body?.removeAttribute?.('data-agm-dock-corner'); } catch { /* attribute already gone */ }
      clearVars();
      return true;
    },
    measure
  };
}

/** The user configuration class (ApplicationV2 sheet in V13/V14), or null. */
const userConfigClass = foundryNs => { const V2 = foundryNs?.applications?.sheets?.UserConfig; return typeof V2 === 'function' ? V2 : null; };

/**
 * The player's own User Configuration window if it is open right now, else null. Looked up in the core registry of rendered
 * ApplicationV2 windows (`foundry.applications.instances`, a Map): an instance of `foundry.applications.sheets.UserConfig` whose
 * `document` is this user and that is `rendered` (not closing or closed). This is the real state, so closing the window with its
 * own X needs no bookkeeping here.
 */
export function findUserConfiguration({ foundryNs = globalThis.foundry, game = globalThis.game } = {}) {
  try {
    const V2 = userConfigClass(foundryNs), user = game?.user;
    const registry = foundryNs?.applications?.instances;
    if (!V2 || !user || typeof registry?.values !== 'function') return null;
    for (const app of registry.values()) if (app instanceof V2 && app.document === user && app.rendered === true) return app;
  } catch { /* treated as not open */ }
  return null;
}
/** Is the User Configuration window open? */
export const userConfigurationOpen = args => findUserConfiguration(args) !== null;

/**
 * Opens the player's own User Configuration window, or closes it if it is already open (a true toggle). Opening: V13/V14
 * `foundry.applications.sheets.UserConfig` (`{document: user}`, `render({force: true})`), else the older global `UserConfig`
 * (`new UserConfig(user)`). Closing: the window's own `close()`. Resolves to true when it opened or closed something; never throws.
 */
export async function toggleUserConfiguration({ foundryNs = globalThis.foundry, game = globalThis.game, globals = globalThis } = {}) {
  const user = game?.user;
  if (!user) return false;
  try {
    const open = findUserConfiguration({ foundryNs, game });
    if (open) { await open.close(); return true; }
    const V2 = userConfigClass(foundryNs);
    if (V2) { await new V2({ document: user }).render({ force: true }); return true; }
    const legacy = globals?.UserConfig;
    if (typeof legacy === 'function') { new legacy(user).render(true); return true; }
  } catch (error) { console.warn('[ashen-gate-manager] User Configuration not toggled', error); }
  return false;
}
