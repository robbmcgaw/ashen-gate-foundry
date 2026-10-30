/**
 * The player dock (Manager 0.81.0): a small group of buttons fixed in a screen corner, for the things "Show players only the
 * Chat tab" hides. Presentation only: it writes nothing, shows nothing a player could not already open, and is never drawn
 * for the GM or while the world setting is off. Styling is styles/player-dock.css (shared-kit tokens with a default fallback).
 *
 * Slots, left to right (or top to bottom in a corner column), by `order`:
 *   10 portrait     RESERVED and empty. The Character Hub will put a player-portrait button in
 *                   `[data-agm-dock-slot="portrait"]` later; nothing is built here and the empty slot takes no space.
 *   20 combat       opens the combat tracker (pop-out if this Foundry has one, else the sidebar tab)
 *   30 settings     opens the sidebar Settings tab (Configure Settings, Manage Modules, Players, Log Out)
 *   40 ashen-gate   a menu of the Ashen Gate windows this player may open
 *
 * Ashen Gate menu: the table below names the modules whose Actors-sidebar launchers players see. For each one that is active,
 * the entry is listed only when its public API has `open()` AND its public `playerAccess` (contract ag-player-access/1) reports
 * `playerAccessEnabled === true` for this user: the same gate each module uses for its own launcher. Nothing else of a module
 * is read; an absent, disabled or unreadable module is skipped.
 *
 * Keyboard: the menu opens on Enter/Space/click and focuses its first item; Arrow Up/Down, Home and End move; Escape closes
 * and returns focus to the Ashen Gate button; Tab or a click outside closes. Escape is only swallowed while a menu is open.
 */
import { openSidebarTab, sharedPeek } from './sidebar-tabs.js';

export const DOCK_ID = 'agm-player-dock';
export const ACCESS_CONTRACT = 'ag-player-access/1';
export const DOCK_SLOTS = Object.freeze([
  Object.freeze({ id: 'portrait', order: 10, reserved: true }),
  Object.freeze({ id: 'combat', order: 20 }),
  Object.freeze({ id: 'settings', order: 30 }),
  Object.freeze({ id: 'ashen-gate', order: 40 })
]);
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
      if (!isGM) {
        const access = api.playerAccess;
        if (access?.contract !== ACCESS_CONTRACT || typeof access.getState !== 'function') continue;
        const state = await access.getState();
        if (state?.contract !== ACCESS_CONTRACT || state.audience === 'gm-only' || state.playerAccessEnabled !== true) continue;
      }
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

/** Builds the dock element. `actions` = {combat(), settings(), listLaunchers() -> Promise, notify(message)}. */
export function buildDock(doc, { corner = 'top-left', actions }) {
  const root = make(doc, 'div', { id: DOCK_ID, class: 'agm-dock', role: 'group', 'aria-label': 'Player dock', 'data-corner': corner });
  const slots = {};
  for (const slot of [...DOCK_SLOTS].sort((a, b) => a.order - b.order)) {
    slots[slot.id] = make(doc, 'span', { class: 'agm-dock__slot', 'data-agm-dock-slot': slot.id });
    root.append(slots[slot.id]);
  }
  const combat = iconButton(doc, { action: 'combat', icon: 'fa-solid fa-swords', label: 'Combat', tooltip: 'Open the combat tracker' });
  const settings = iconButton(doc, { action: 'settings', icon: 'fa-solid fa-gears', label: 'Settings', tooltip: 'Open settings, modules, players and log out' });
  const ashen = iconButton(doc, { action: 'ashen-gate', icon: 'fa-solid fa-book-skull', label: 'Ashen Gate', tooltip: 'Open an Ashen Gate window',
    extra: { 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': `${DOCK_ID}-menu` } });
  const menu = make(doc, 'div', { id: `${DOCK_ID}-menu`, class: 'agm-dock__menu', role: 'menu', 'aria-label': 'Ashen Gate windows' });
  menu.hidden = true;
  slots.combat.append(combat); slots.settings.append(settings); slots['ashen-gate'].append(ashen, menu);

  let open = false, token = 0;
  const items = () => menu.querySelectorAll('[role="menuitem"]');
  const close = ({ refocus = false } = {}) => {
    token++;
    if (!open && menu.hidden) return;
    open = false; menu.hidden = true; ashen.setAttribute('aria-expanded', 'false');
    if (refocus) ashen.focus();
  };
  const show = async () => {
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
    items()[0]?.focus();
  };
  ashen.addEventListener('click', event => { event.preventDefault?.(); if (open) close({ refocus: true }); else void show(); });
  combat.addEventListener('click', event => { event.preventDefault?.(); close(); actions.combat(); });
  settings.addEventListener('click', event => { event.preventDefault?.(); close(); actions.settings(); });
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
  root.agmClose = close;
  root.agmIsOpen = () => open;
  return root;
}

/**
 * Draws, updates or removes the dock for the current user. Idempotent: running it again changes nothing. Returns the
 * element when the dock is showing, else null.
 */
export function applyPlayerDock({ game, doc, appearance, getUi = () => globalThis.ui, tabs = null, peek = sharedPeek }) {
  const state = appearance?.getState?.() ?? {};
  const show = shouldShowDock({ isGM: Boolean(game?.user?.isGM), setting: state.playerDock === true });
  const existing = doc?.getElementById?.(DOCK_ID) ?? null;
  if (!show) { existing?.remove(); return null; }
  const corner = state.playerDockCorner ?? 'top-left';
  if (existing) { if (existing.getAttribute('data-corner') !== corner) existing.setAttribute('data-corner', corner); return existing; }
  const notify = message => { try { getUi()?.notifications?.warn?.(message); } catch { /* nothing to tell the player with */ } };
  const reapply = () => { try { tabs?.apply?.(); } catch { /* the tab hider reports its own errors */ } };
  const open = (tabId, prefer, what) => { if (!openSidebarTab(tabId, { ui: getUi(), peek, prefer, reapply })) notify(`${what} could not be opened from here.`); };
  const dock = buildDock(doc, { corner, actions: {
    combat: () => open('combat', 'popout', 'The combat tracker'),
    settings: () => open('settings', 'tab', 'Settings'),
    listLaunchers: () => listDockLaunchers({ modules: game.modules, isGM: Boolean(game.user?.isGM) }),
    notify
  } });
  doc.body.append(dock);
  return dock;
}

/** Applies on install, on a setting change (live) and when the sidebar renders. Returns a function that stops listening. */
export function installPlayerDock({ game, hooks, doc = globalThis.document, getUi = () => globalThis.ui, appearance, tabs = null }) {
  const apply = () => { try { applyPlayerDock({ game, doc, appearance, getUi, tabs }); } catch (error) { console.warn('[ashen-gate-manager] Player dock not updated', error); } };
  apply();
  const outside = event => {
    const dock = doc?.getElementById?.(DOCK_ID);
    if (dock?.agmIsOpen?.() && !dock.contains(event.target)) dock.agmClose();
  };
  doc?.addEventListener?.('click', outside, true);
  const id = hooks?.on?.('renderSidebar', apply);
  const stop = appearance?.subscribe?.(apply);
  return () => {
    doc?.removeEventListener?.('click', outside, true);
    if (id !== undefined) hooks?.off?.('renderSidebar', id);
    if (typeof stop === 'function') stop();
    doc?.getElementById?.(DOCK_ID)?.remove();
  };
}
