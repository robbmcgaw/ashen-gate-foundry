/**
 * The player dock (Manager 0.81.0): a small group of buttons fixed in a screen corner, for the things "Show players only the
 * Chat tab" hides. Presentation only: it writes nothing, shows nothing a player could not already open, and is never drawn
 * for the GM or while the world setting is off. Styling is styles/player-dock.css (shared-kit tokens with a default fallback).
 *
 * Slots, top to bottom in a corner column, by `order` (0.85.2 order: Combat, Conditions, Quest Log, User Settings,
 * Foundry Settings, Ashen Gate last; ids and attributes are unchanged, only the labels and order):
 *   10 portrait       RESERVED and empty. The Character Hub puts its player-portrait button in `[data-agm-dock-slot="portrait"]`.
 *   20 combat         toggles the combat tracker (pop-out if this Foundry has one, else the sidebar tab); a second press closes it
 *   30 conditions     (0.82.0) toggles Utilities' Conditions overlay (`conditions.toggleOverlay`, else `openOverlay`)
 *   40 quest-tracker  (0.82.0; labelled Quest Log since 0.85.2) shows or hides Quest Log's "Tracked objectives" overlay, through its public `tracking` API
 *   50 user-config    (0.82.0; labelled User Settings since 0.85.2) the player's own User Configuration window (always shown; 0.83.0: a pill like the others;
 *                     0.85.0: a real toggle, the second press closes it)
 *   60 settings       (labelled Foundry Settings since 0.85.2) toggles the sidebar Settings tab (Configure Settings, Manage Modules, Players, Log Out)
 *   70 ashen-gate     a menu of the Ashen Gate windows this player may open
 *
 * SLOT CONTRACT (stable; the Character Hub adds its portrait button here): `[data-agm-dock-slot="portrait"]` is a <span>. Since
 * 0.83.0 it is the first child of `.agm-dock__head`, the top row of the dock (directly under `#agm-player-dock`), with the
 * minimize button on the same row at the right. It is empty and takes no space until a module appends to it; the minimize
 * button then sits alone, right-aligned. The other slots are inside `.agm-dock__body`. When the dock is minimized the body and
 * the portrait slot are hidden and only the minimize handle stays.
 *
 * Minimize (0.82.0): a small icon button in `.agm-dock__head` hides the body and portrait, leaving only that handle; pressing it
 * again restores. The choice is kept per user in localStorage (try/catch; the dock works without it).
 *
 * Toggles (0.83.0; User Configuration joined in 0.85.0): Combat, Conditions, Quest Log, User Settings and Foundry Settings are real toggles: the first press opens, the second closes,
 * and `aria-pressed` follows the real open state (re-read after each press and on every refresh).
 *
 * Live (0.83.0): module buttons and the Ashen Gate menu are re-checked against the CURRENT module state (nothing is cached)
 * on `ready`, on any `updateSetting` / `createSetting` / `deleteSetting` for an ashen-gate module (a GM changing Player Access
 * reaches connected players this way, in both directions), on sidebar and scene-controls renders, and, while a gated module
 * is active but its API is not there yet, on a short bounded retry.
 *
 * Ashen Gate menu: the table below names the modules whose Actors-sidebar launchers players see. For each one that is active,
 * the entry is listed only when its public API has `open()` AND its public `playerAccess` (contract ag-player-access/1) reports
 * `playerAccessEnabled === true` for this user: the same gate each module uses for its own launcher. Nothing else of a module
 * is read; an absent, disabled or unreadable module is skipped.
 *
 * Keyboard: the menu opens on Enter/Space/click and focuses its first item; Arrow Up/Down, Home and End move; Escape closes
 * and returns focus to the Ashen Gate button; Tab or a click outside closes. Escape is only swallowed while a menu is open.
 */
import { openSidebarTab, closeSidebarTab, isSidebarTabOpen, sharedPeek } from './sidebar-tabs.js';
import { applyPlayersList, createControlsLayout, shouldDockControls, toggleUserConfiguration, userConfigurationOpen } from './dock-controls.js';

export const DOCK_ID = 'agm-player-dock';
export const ACCESS_CONTRACT = 'ag-player-access/1';
export const DOCK_SLOTS = Object.freeze([
  Object.freeze({ id: 'portrait', order: 10, reserved: true }),
  Object.freeze({ id: 'combat', order: 20 }),
  Object.freeze({ id: 'conditions', order: 30 }),
  Object.freeze({ id: 'quest-tracker', order: 40 }),
  Object.freeze({ id: 'user-config', order: 50 }),
  Object.freeze({ id: 'settings', order: 60 }),
  Object.freeze({ id: 'ashen-gate', order: 70 })
]);
/**
 * Extra dock buttons that belong to another module's public API. Shown only when the module is active, offers the function
 * named by `needs`, and reports Player Access on (ag-player-access/1), the same gate as the launchers. Nothing else is read.
 */
export const DOCK_EXTRAS = Object.freeze([
  Object.freeze({ id: 'quest-tracker', moduleId: 'ashen-gate-quest-manager', needs: api => typeof api?.tracking?.set === 'function' && typeof api?.tracking?.getState === 'function' }),
  Object.freeze({ id: 'conditions', moduleId: 'ashen-gate-utilities', needs: api => typeof api?.conditions?.toggleOverlay === 'function' || typeof api?.conditions?.openOverlay === 'function' })
]);
/** Setting keys that can change a gate: any world setting of an Ashen Gate module (Player Access lives in each module's own namespace). */
export const ACCESS_KEY_PREFIX = 'ashen-gate';
export const RETRY_DELAYS_MS = Object.freeze([250, 500, 1000, 2000, 4000, 8000]);
export const MINIMIZED_KEY_PREFIX = 'agm-player-dock-minimized:';
/** Same names as the Actors-sidebar launchers. A module not listed here is not offered. */
export const DOCK_LAUNCHERS = Object.freeze([
  Object.freeze({ id: 'ashen-gate-quest-manager', label: 'Quest Log', icon: 'fa-solid fa-scroll', order: 10 }),
  Object.freeze({ id: 'ashen-gate-factions', label: 'Renown', icon: 'fa-solid fa-shield-halved', order: 20 }),
  Object.freeze({ id: 'ashen-gate-profession-ledger', label: 'Professions', icon: 'fa-solid fa-book-open', order: 30 }),
  Object.freeze({ id: 'ashen-gate-skill-trees', label: 'Skill Trees', icon: 'fa-solid fa-diagram-project', order: 40 }),
  Object.freeze({ id: 'ashen-gate-locations', label: 'Locations', icon: 'fa-solid fa-map-location-dot', order: 50 }),
  Object.freeze({ id: 'ashen-gate-headquarters', label: 'Headquarters', icon: 'fa-solid fa-building', order: 60 }),
  Object.freeze({ id: 'ashen-gate-cinders', label: 'Cinders', icon: 'fa-solid fa-fire', order: 70 }),
  Object.freeze({ id: 'ashen-gate-utilities', label: 'Utilities', icon: 'fa-solid fa-dice-d20', order: 100 })
]);

/** Show for a non-GM user with the setting on. */
export const shouldShowDock = ({ isGM, setting }) => !isGM && setting === true;

async function playerMayOpen(api) {
  const access = api?.playerAccess;
  if (access?.contract !== ACCESS_CONTRACT || typeof access.getState !== 'function') return false;
  const state = await access.getState();
  return state?.contract === ACCESS_CONTRACT && state.audience !== 'gm-only' && state.playerAccessEnabled === true;
}

/**
 * Reads, right now, which DOCK_EXTRAS this player may use: {ids, waiting}. `waiting` is true when a gated module is active
 * but its API object is not there yet (it sets it in its own ready hook), so the caller should look again soon. Nothing is
 * cached. Never throws; an absent or unreadable module is skipped.
 */
export async function evaluateDockExtras({ modules, isGM = false, table = DOCK_EXTRAS }) {
  const ids = new Set();
  let waiting = false;
  for (const entry of table) {
    try {
      const mod = modules?.get?.(entry.moduleId);
      if (!mod?.active) continue;
      if (!mod.api) { waiting = true; continue; }
      if (!entry.needs(mod.api)) continue;
      if (!isGM && !(await playerMayOpen(mod.api))) continue;
      ids.add(entry.id);
    } catch (error) { console.warn(`[ashen-gate-manager] ${entry.id} not offered in the dock`, error); }
  }
  return { ids, waiting };
}
/** The ids of the DOCK_EXTRAS this player may use right now. */
export async function listDockExtras(args) { return (await evaluateDockExtras(args)).ids; }

/** Quest Log's tracker overlay: shows it if hidden, hides it if shown (the player's own tracker preference). Returns true when it asked. */
export async function toggleQuestTracker({ modules }) {
  const api = modules?.get?.('ashen-gate-quest-manager')?.api;
  if (typeof api?.tracking?.set !== 'function' || typeof api?.tracking?.getState !== 'function') return false;
  const state = await api.tracking.getState();
  await api.tracking.set({ visible: state?.visible !== true });
  return true;
}

/** Utilities' Conditions overlay: opens it. Returns true when it asked. */
export async function openConditions({ modules }) {
  const api = modules?.get?.('ashen-gate-utilities')?.api;
  if (typeof api?.conditions?.openOverlay !== 'function') return false;
  await api.conditions.openOverlay();
  return true;
}
/** Shows or hides the Conditions overlay: `toggleOverlay()` when Utilities has it, else the older `openOverlay()`. */
export async function toggleConditions({ modules }) {
  const api = modules?.get?.('ashen-gate-utilities')?.api;
  if (typeof api?.conditions?.toggleOverlay === 'function') { await api.conditions.toggleOverlay(); return true; }
  return openConditions({ modules });
}
/** Is the Conditions overlay open? Needs `isOverlayOpen()`; without it the button is simply never shown as pressed. */
export async function conditionsOpen({ modules }) {
  try { const fn = modules?.get?.('ashen-gate-utilities')?.api?.conditions?.isOverlayOpen; return typeof fn === 'function' ? (await fn()) === true : false; } catch { return false; }
}
/** Is Quest Log's tracker overlay shown? */
export async function questTrackerOpen({ modules }) {
  try { const api = modules?.get?.('ashen-gate-quest-manager')?.api; return typeof api?.tracking?.getState === 'function' ? (await api.tracking.getState())?.visible === true : false; } catch { return false; }
}

/** Per-user minimized state in localStorage (any failure reads as "not minimized" and is ignored on write). */
export function readDockMinimized(storage, userId) {
  try { return storage?.getItem?.(`${MINIMIZED_KEY_PREFIX}${userId ?? ''}`) === '1'; } catch { return false; }
}
export function writeDockMinimized(storage, userId, minimized) {
  try {
    if (minimized) storage?.setItem?.(`${MINIMIZED_KEY_PREFIX}${userId ?? ''}`, '1');
    else storage?.removeItem?.(`${MINIMIZED_KEY_PREFIX}${userId ?? ''}`);
    return true;
  } catch { return false; }
}
const localStore = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

/**
 * The launchers this user may open, in order: [{id,label,icon,open}]. `modules` is game.modules. Never throws; a module that
 * is absent, inactive, without open(), or whose access state is missing, invalid or false is skipped.
 */
export async function listDockLaunchers({ modules, isGM = false, table = DOCK_LAUNCHERS }) {
  const out = [];
  for (const entry of [...table].sort((a, b) => a.order - b.order)) {
    try {
      const mod = modules?.get?.(entry.id);
      const api = mod?.api;
      if (!mod?.active || typeof api?.open !== 'function') continue;
      if (!isGM && !(await playerMayOpen(api))) continue;
      out.push({ id: entry.id, label: entry.label, icon: entry.icon, open: () => api.open() });
    } catch (error) { console.warn(`[ashen-gate-manager] ${entry.id} not offered in the dock`, error); }
  }
  return out;
}

function make(doc, tag, attrs = {}, kids = []) {
  const el = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v; else el.setAttribute(k, v);
  }
  if (kids.length) el.append(...kids);
  return el;
}
function iconButton(doc, { action, icon, label, tooltip, extra = {} }) {
  const glyph = make(doc, 'i', { class: icon, 'aria-hidden': 'true' });
  const text = make(doc, 'span', { class: 'agm-dock__label' });
  text.textContent = label;
  return make(doc, 'button', { type: 'button', class: 'ag-btn agm-dock__btn', 'data-agm-dock': action, 'data-tooltip': tooltip, ...extra }, [glyph, text]);
}

/**
 * Builds the dock element. `actions` = {combat(), settings(), questTracker(), conditions(), userConfig(), listLaunchers() -> Promise,
 * listExtras() -> Promise<Set>, setMinimized(bool), notify(message)}; `minimized` is the starting state.
 */
export function buildDock(doc, { corner = 'top-left', actions, minimized = false }) {
  const root = make(doc, 'div', { id: DOCK_ID, class: 'agm-dock', role: 'group', 'aria-label': 'Player dock', 'data-corner': corner });
  const head = make(doc, 'div', { class: 'agm-dock__head' });
  const toggleGlyph = make(doc, 'i', { class: 'fa-solid fa-grip', 'aria-hidden': 'true' });
  const toggle = make(doc, 'button', { type: 'button', class: 'ag-btn ag-btn--ghost ag-btn--icon agm-dock__toggle', 'data-agm-dock': 'minimize', 'aria-controls': `${DOCK_ID}-body` }, [toggleGlyph]);
  const body = make(doc, 'div', { id: `${DOCK_ID}-body`, class: 'agm-dock__body' });
  root.append(head, body);
  const slots = {};
  for (const slot of [...DOCK_SLOTS].sort((a, b) => a.order - b.order)) {
    slots[slot.id] = make(doc, 'span', { class: 'agm-dock__slot', 'data-agm-dock-slot': slot.id });
    if (slot.id === 'portrait') head.append(slots[slot.id], toggle); else body.append(slots[slot.id]);
  }
  const combat = iconButton(doc, { action: 'combat', icon: 'fa-solid fa-swords', label: 'Combat', tooltip: 'Show or hide the combat tracker', extra: { 'aria-pressed': 'false' } });
  const settings = iconButton(doc, { action: 'settings', icon: 'fa-solid fa-gears', label: 'Foundry Settings', tooltip: 'Show or hide Foundry settings, modules, players and log out', extra: { 'aria-pressed': 'false' } });
  const ashen = iconButton(doc, { action: 'ashen-gate', icon: 'fa-solid fa-book-skull', label: 'Ashen Gate', tooltip: 'Open an Ashen Gate window',
    extra: { 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': `${DOCK_ID}-menu` } });
  const menu = make(doc, 'div', { id: `${DOCK_ID}-menu`, class: 'agm-dock__menu', role: 'menu', 'aria-label': 'Ashen Gate windows' });
  menu.hidden = true;
  const quest = iconButton(doc, { action: 'quest-tracker', icon: 'fa-solid fa-bullseye', label: 'Quest Log', tooltip: 'Show or hide the tracked quest objectives', extra: { 'aria-pressed': 'false' } });
  const conditions = iconButton(doc, { action: 'conditions', icon: 'fa-solid fa-heart-pulse', label: 'Conditions', tooltip: 'Show or hide the conditions window', extra: { 'aria-pressed': 'false' } });
  const userConfig = iconButton(doc, { action: 'user-config', icon: 'fa-solid fa-user-gear', label: 'User Settings', tooltip: 'Show or hide your user settings', extra: { 'aria-pressed': 'false' } });
  for (const extra of [quest, conditions]) extra.hidden = true; // shown only once the owning module is confirmed
  slots.combat.append(combat); slots.settings.append(settings); slots['ashen-gate'].append(ashen, menu);
  slots['quest-tracker'].append(quest); slots.conditions.append(conditions); slots['user-config'].append(userConfig);

  let open = false, token = 0;
  const items = () => menu.querySelectorAll('[role="menuitem"]');
  const close = ({ refocus = false } = {}) => {
    token++;
    if (!open && menu.hidden) return;
    open = false; menu.hidden = true; ashen.setAttribute('aria-expanded', 'false');
    if (refocus) ashen.focus();
  };
  const show = async ({ focus = true } = {}) => {
    const mine = ++token;
    open = true; menu.hidden = false; ashen.setAttribute('aria-expanded', 'true');
    let launchers = [];
    try { launchers = await actions.listLaunchers(); } catch { launchers = []; }
    if (mine !== token || !open) return;
    for (const old of [...menu.children]) old.remove();
    if (!launchers.length) {
      const none = make(doc, 'button', { type: 'button', role: 'menuitem', class: 'ag-btn ag-btn--ghost agm-dock__item', 'aria-disabled': 'true' });
      none.textContent = 'No windows available yet';
      menu.append(none);
    }
    for (const entry of launchers) {
      const text = make(doc, 'span'); text.textContent = entry.label;
      const item = make(doc, 'button', { type: 'button', role: 'menuitem', class: 'ag-btn ag-btn--ghost agm-dock__item', 'data-agm-launcher': entry.id, tabindex: '-1' },
        [make(doc, 'i', { class: entry.icon, 'aria-hidden': 'true' }), text]);
      item.addEventListener('click', event => {
        event.preventDefault?.();
        close({ refocus: true });
        try { Promise.resolve(entry.open()).catch(error => actions.notify(error?.message ?? String(error))); } catch (error) { actions.notify(error?.message ?? String(error)); }
      });
      menu.append(item);
    }
    if (focus) items()[0]?.focus();
  };
  ashen.addEventListener('click', event => { event.preventDefault?.(); if (open) close({ refocus: true }); else void show(); });
  const toggles = { combat, settings, 'quest-tracker': quest, conditions, 'user-config': userConfig };
  /** Sets aria-pressed on each toggle from the real open state (actions.isOpen(id), sync or async). Never throws. */
  let pressedToken = 0;
  async function syncPressed() {
    const mine = ++pressedToken;
    for (const [id, button] of Object.entries(toggles)) {
      let on = false;
      try { on = (await actions.isOpen?.(id)) === true; } catch { on = false; }
      if (mine !== pressedToken) return;
      button.setAttribute('aria-pressed', String(on));
    }
  }
  const run = (work, sync = false) => { try { Promise.resolve(work()).then(ok => { if (ok === false) actions.notify('That window is not available right now.'); }).catch(error => actions.notify(error?.message ?? String(error))).finally(() => { if (sync) void syncPressed(); }); } catch (error) { actions.notify(error?.message ?? String(error)); } };
  quest.addEventListener('click', event => { event.preventDefault?.(); close(); run(actions.questTracker, true); });
  conditions.addEventListener('click', event => { event.preventDefault?.(); close(); run(actions.conditions, true); });
  userConfig.addEventListener('click', event => { event.preventDefault?.(); close(); run(actions.userConfig, true); });
  combat.addEventListener('click', event => { event.preventDefault?.(); close(); actions.combat(); syncPressed(); });
  settings.addEventListener('click', event => { event.preventDefault?.(); close(); actions.settings(); syncPressed(); });
  menu.addEventListener('keydown', event => {
    const list = [...items()], at = list.indexOf(doc.activeElement);
    const move = i => { event.preventDefault?.(); list[(i + list.length) % list.length]?.focus(); };
    if (event.key === 'ArrowDown') move(at + 1);
    else if (event.key === 'ArrowUp') move(at < 0 ? -1 : at - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(-1);
    else if (event.key === 'Tab') close();
  });
  root.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !open) return;
    event.preventDefault?.(); event.stopPropagation?.();
    close({ refocus: true });
  });
  // Minimize: only .agm-dock__body hides; the handle (this button) stays, keeps focus and restores the dock.
  let min = false, extrasToken = 0;
  const setMinimized = (value, { persist = true } = {}) => {
    min = Boolean(value);
    close();
    body.hidden = min;
    slots.portrait.hidden = min;
    root.setAttribute('data-minimized', min ? 'true' : 'false');
    toggle.setAttribute('aria-expanded', String(!min));
    const label = min ? 'Show the player dock' : 'Minimize the player dock';
    toggle.setAttribute('aria-label', label); toggle.setAttribute('data-tooltip', label);
    toggleGlyph.className = min ? 'fa-solid fa-grip' : 'fa-solid fa-minus';
    if (persist) { try { actions.setMinimized?.(min); } catch { /* the choice just is not remembered */ } }
    return min;
  };
  toggle.addEventListener('click', event => { event.preventDefault?.(); setMinimized(!min); });
  setMinimized(minimized, { persist: false });
  /** Re-checks which module buttons may show (module state or Player Access can change). Never throws. */
  let retryTimer = null, attempt = 0;
  const refreshExtras = async () => {
    const mine = ++extrasToken;
    let found = { ids: new Set(), waiting: false };
    try { const got = await actions.listExtras?.(); found = got instanceof Set ? { ids: got, waiting: false } : { ids: got?.ids ?? new Set(), waiting: Boolean(got?.waiting) }; } catch { /* hidden until the next check */ }
    if (mine !== extrasToken) return;
    quest.hidden = !found.ids.has('quest-tracker'); conditions.hidden = !found.ids.has('conditions');
    slots['quest-tracker'].hidden = quest.hidden; slots.conditions.hidden = conditions.hidden;
    // A gated module that is active but has no API yet sets it in its own ready hook: look again soon (bounded).
    if (retryTimer !== null) { actions.clearTimer?.(retryTimer); retryTimer = null; }
    if (found.waiting && attempt < RETRY_DELAYS_MS.length && actions.setTimer) retryTimer = actions.setTimer(() => { retryTimer = null; attempt++; void refreshAll(); }, RETRY_DELAYS_MS[attempt]);
    else if (!found.waiting) attempt = 0;
  };
  /** Re-reads every module gate, the open Ashen Gate menu and the pressed states. Called by the hooks; never throws. */
  const refreshAll = async () => {
    await refreshExtras();
    if (open) await show({ focus: false });
    await syncPressed();
  };
  void refreshExtras().then(syncPressed);
  root.agmRefresh = refreshAll;
  root.agmSyncPressed = syncPressed;
  root.agmSetMinimized = setMinimized;
  root.agmIsMinimized = () => min;
  root.agmClose = close;
  root.agmIsOpen = () => open;
  return root;
}

/**
 * Draws, updates or removes the dock for the current user, and applies the page-level player settings that go with it (the
 * players list, the scene controls under the dock). Idempotent: running it again changes nothing. Returns the element when
 * the dock is showing, else null.
 */
export function applyPlayerDock({ game, doc, appearance, getUi = () => globalThis.ui, tabs = null, peek = sharedPeek, storage = localStore(), layout = null, idle = null, toggleConfig = toggleUserConfiguration, configOpen = userConfigurationOpen, setTimer = null, clearTimer = null, memory }) {
  const state = appearance?.getState?.() ?? {};
  const isGM = Boolean(game?.user?.isGM);
  try { applyPlayersList({ game, doc, state }); } catch (error) { console.warn('[ashen-gate-manager] Players list not updated', error); }
  const show = shouldShowDock({ isGM, setting: state.playerDock === true });
  const existing = doc?.getElementById?.(DOCK_ID) ?? null;
  const corner = state.playerDockCorner ?? 'top-left';
  const place = dock => {
    try {
      // 0.85.0: the corner always applies, with or without docked controls. (The removed 0.83.0 stack used to override it.)
      const controls = Boolean(dock) && shouldDockControls({ isGM, setting: state.dockSceneControls === true, dockShown: true });
      const pullNav = !isGM && state.pullSceneNavigationLeft === true;
      if (dock) layout?.enable({ dock, corner, controls, pullNav });
      else { layout?.disable(); if (pullNav) layout?.enableNavOnly?.(); }
    } catch (error) { console.warn('[ashen-gate-manager] Scene controls not moved', error); }
  };
  if (!show) { existing?.remove(); place(null); return null; }
  if (existing) {
    if (existing.getAttribute('data-corner') !== corner) existing.setAttribute('data-corner', corner);
    existing.agmRefresh?.();
    place(existing);
    return existing;
  }
  const notify = message => { try { getUi()?.notifications?.warn?.(message); } catch { /* nothing to tell the player with */ } };
  const reapply = () => { try { tabs?.apply?.(); } catch { /* the tab hider reports its own errors */ } };
  const mem = memory ? { memory } : {};
  const toggleTab = (tabId, prefer, what) => {
    const ui = getUi();
    if (isSidebarTabOpen(tabId, { ui })) {
      closeSidebarTab(tabId, { ui, peek, reapply, ...mem });
      if (tabId === 'settings') idle?.cancel?.();
      return;
    }
    if (!openSidebarTab(tabId, { ui, peek, prefer, reapply, ...mem })) notify(`${what} could not be opened from here.`);
    else if (tabId === 'settings') idle?.arm?.();
  };
  const userId = game.user?.id;
  const dock = buildDock(doc, { corner, minimized: readDockMinimized(storage, userId), actions: {
    combat: () => toggleTab('combat', 'popout', 'The combat tracker'),
    settings: () => toggleTab('settings', 'tab', 'Settings'),
    questTracker: () => toggleQuestTracker({ modules: game.modules }),
    conditions: () => toggleConditions({ modules: game.modules }),
    userConfig: () => toggleConfig({ game }),
    isOpen: id => {
      if (id === 'combat' || id === 'settings') return isSidebarTabOpen(id, { ui: getUi() });
      if (id === 'quest-tracker') return questTrackerOpen({ modules: game.modules });
      if (id === 'conditions') return conditionsOpen({ modules: game.modules });
      if (id === 'user-config') return configOpen({ game });
      return false;
    },
    listLaunchers: () => listDockLaunchers({ modules: game.modules, isGM }),
    listExtras: () => evaluateDockExtras({ modules: game.modules, isGM }),
    setTimer, clearTimer,
    setMinimized: minimized => { writeDockMinimized(storage, userId, minimized); try { layout?.measure(); } catch { /* sizes catch up on the next render */ } },
    notify
  } });
  doc.body.append(dock);
  place(dock);
  return dock;
}

/** Hooks that re-check the module gates and pressed states without rebuilding the dock. */
export const LIVE_HOOKS = Object.freeze(['ready', 'updateSetting', 'createSetting', 'deleteSetting', 'collapseSidebar', 'changeSidebarTab', 'renderCombatTracker', 'closeCombatTracker', 'renderUserConfig', 'closeUserConfig']);
const isModuleSetting = setting => String(setting?.key ?? '').startsWith(ACCESS_KEY_PREFIX);

/**
 * Applies on install, on a setting change (live), when the sidebar or scene controls render, on `ready` and whenever a world
 * setting of an Ashen Gate module changes (Player Access on or off reaches connected players at once). Returns a function that
 * stops listening.
 */
export function installPlayerDock({ game, hooks, doc = globalThis.document, getUi = () => globalThis.ui, appearance, tabs = null, idle = null, layout = createControlsLayout({ doc }), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = id => clearTimeout(id) }) {
  const apply = () => { try { applyPlayerDock({ game, doc, appearance, getUi, tabs, idle, layout, setTimer, clearTimer }); } catch (error) { console.warn('[ashen-gate-manager] Player dock not updated', error); } };
  const refresh = () => { try { const dock = doc?.getElementById?.(DOCK_ID); if (dock) void dock.agmRefresh?.(); else apply(); } catch (error) { console.warn('[ashen-gate-manager] Player dock not refreshed', error); } };
  apply();
  const outside = event => {
    const dock = doc?.getElementById?.(DOCK_ID);
    if (dock?.agmIsOpen?.() && !dock.contains(event.target)) dock.agmClose();
  };
  doc?.addEventListener?.('click', outside, true);
  const ids = ['renderSidebar', 'renderSceneControls'].map(name => [name, hooks?.on?.(name, apply)]);
  for (const name of LIVE_HOOKS) {
    const handler = ['updateSetting', 'createSetting', 'deleteSetting'].includes(name) ? setting => { if (isModuleSetting(setting)) refresh(); } : refresh;
    ids.push([name, hooks?.on?.(name, handler)]);
  }
  const stop = appearance?.subscribe?.(apply);
  return () => {
    doc?.removeEventListener?.('click', outside, true);
    for (const [name, id] of ids) if (id !== undefined) hooks?.off?.(name, id);
    if (typeof stop === 'function') stop();
    layout?.disable();
    doc?.getElementById?.(DOCK_ID)?.remove();
  };
}
