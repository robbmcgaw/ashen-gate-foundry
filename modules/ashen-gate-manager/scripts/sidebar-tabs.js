/**
 * Hide sidebar tabs from players (Manager 0.79.0 Journals, 0.80.0 Compendiums, 0.81.0 "only the Chat tab"; 0.84.0 one checklist,
 * see sidebar-policy.js). Presentation only: no document, permission, flag or ownership is written, and nothing here touches how
 * journals, compendium documents or pages open (by uuid or id), so Locations, Quest Log, handouts and links keep working. The GM
 * is never affected: a tab is hidden only for a non-GM user, for each tab the checklist does not keep (Chat is always kept).
 *
 * A hidden tab loses its whole layout slot: the tab button's wrapper (the <li> around it in the tab column, or the button
 * itself when there is none) gets display:none, so the remaining icons sit together with no gap. The panel is hidden too. A
 * wrapper Foundry itself had hidden (a tab this user may not render) is put back the way it was, never shown by mistake.
 *
 * The player dock can still open a hidden tab: `openSidebarTab` either pops the tab out (a separate window, outside #sidebar, so
 * nothing here touches it) or "peeks" it, showing just that panel (its button stays hidden) until the player switches to another
 * tab, which puts Chat back.
 *
 * Foundry V14 (14.367 source): the tab column is `#sidebar-tabs` (the Sidebar's `tabs` part, id `${sidebar.id}-tabs`; a
 * <nav class="tabs"> > <menu> > <li><button data-action="tab" data-tab="<id>">), each panel is `section#<id>` with
 * `data-tab="<id>"` (the tab's `tabName`), and the open tab is `ui.sidebar.tabGroups.primary`, changed with
 * `ui.sidebar.changeTab(tab, "primary")`. Core tab ids: chat, combat, scenes (GM only), placeables, actors, items, journal, tables,
 * cards, macros, playlists, compendium, settings. Tabs re-render through the `renderAbstractSidebarTab` hook (AppV2 calls the hook
 * of every parent class), which covers tabs a module adds. Not confirmed in a live world; each call is feature-detected.
 */
import { collapseSidebar } from './sidebar-collapse.js';
import { CORE_TAB_IDS, CHAT_TAB, tabKept, isEverything, cleanPolicy } from './sidebar-policy.js';

export const FALLBACK_TAB = 'chat';
const MARK = 'agmTabHidden';
const PRIOR = 'agmTabWasHidden';

/** Core sidebar tab ids (V14). The DOM's own tab buttons are added to this list, so a module's extra tab is covered too. */
export const KNOWN_TABS = CORE_TAB_IDS;
export const CHAT_ONLY_CLASS = 'agm-chat-only-sidebar';
/** Body attribute naming the tabs hidden for this player (space separated), so a report can say what was hidden. */
export const HIDDEN_ATTR = 'data-agm-tabs-hidden';
/** Tab whose panel the player dock is showing although its button is hidden. Cleared once the player moves to another tab. */
export const sharedPeek = { tab: null, armed: false };
/** What the dock did to open each tab, so a second press can undo it: {via:'popout'} or {via:'tab', prev, wasExpanded}. */
export const sharedDockOpen = {};

/** Tab ids to consider: the known core ids plus every tab button in the tab column. The second place that reads the sidebar DOM. */
export function listTabIds(doc) {
  const ids = new Set(KNOWN_TABS);
  for (const el of doc?.querySelectorAll?.('#sidebar-tabs [data-tab]') ?? []) if (el.dataset?.tab) ids.add(el.dataset.tab);
  return [...ids];
}

/** Tabs in the sidebar that are not core tabs (added by modules): [{id,label}]. Labels come from the button's own name. */
export function listExtraTabs(doc) {
  const out = [];
  for (const el of doc?.querySelectorAll?.('#sidebar-tabs [data-tab]') ?? []) {
    const id = el.dataset?.tab;
    if (!id || KNOWN_TABS.includes(id) || out.some(t => t.id === id)) continue;
    const label = String(el.getAttribute?.('aria-label') ?? el.dataset?.tooltip ?? el.title ?? '').trim();
    out.push({ id, label: label && label !== id ? label : 'Added tab' });
  }
  return out;
}

/**
 * The one place that knows where a tab lives in the DOM. Returns the elements to hide: the panel, and for the tab button
 * its wrapper (<li> in the tab column) or the button itself when it has no such wrapper. Inside the sidebar only.
 */
export function tabElements(doc, tabId) {
  const found = [...(doc?.querySelectorAll?.(`#sidebar [data-tab="${tabId}"], #sidebar #${tabId}`) ?? [])];
  const out = new Set();
  for (const el of found) out.add(el.closest?.('#sidebar-tabs li') ?? el);
  return [...out];
}

/** A tab button (or its wrapper) sits in the tab column; a panel does not. */
const inTabColumn = el => Boolean(el.closest?.('#sidebar-tabs') || el.closest?.('#sidebar-tabs li') || el.matches?.('#sidebar-tabs li'));

/** Hide only for a non-GM user, and only a tab the checklist does not keep. */
export const shouldHideTab = ({ isGM, policy, tabId }) => !isGM && !tabKept(policy, tabId);

/**
 * Hides or restores the elements, remembering which ones we hid (and whether Foundry already had them hidden) so showing again
 * never un-hides anything else. keepPanel: hide only the tab button (the dock is showing that panel).
 */
export function setTabHidden(doc, tabId, hidden, { keepPanel = false } = {}) {
  const els = tabElements(doc, tabId);
  for (const el of els) {
    if (hidden && !(keepPanel && !inTabColumn(el))) {
      if (el.dataset && !el.dataset[MARK]) el.dataset[PRIOR] = el.hidden ? '1' : '';
      el.hidden = true;
      el.style?.setProperty?.('display', 'none', 'important');
      if (el.dataset) el.dataset[MARK] = '1';
    } else if (el.dataset?.[MARK]) {
      el.hidden = el.dataset[PRIOR] === '1';
      el.style?.removeProperty?.('display');
      delete el.dataset[MARK];
      delete el.dataset[PRIOR];
    }
  }
  return els.length;
}

/** The open sidebar tab, or null when this Foundry exposes neither name. */
export const activeTab = ui => ui?.sidebar?.tabGroups?.primary ?? ui?.sidebar?.activeTab ?? null;

/** If a hidden tab is the open sidebar tab, switch to Chat so the player is not left on a hidden panel. */
export function leaveTabs(ui, tabIds) {
  const sidebar = ui?.sidebar;
  const active = activeTab(ui);
  if (!tabIds.includes(active) || typeof sidebar?.changeTab !== 'function') return false;
  sidebar.changeTab(FALLBACK_TAB, 'primary');
  return true;
}

/**
 * Applies the checklist for the current user. Returns the ids of the tabs now hidden (a peeked tab counts: its button is hidden
 * even though its panel is showing). Idempotent: running it again changes nothing.
 */
export function applySidebarTabs({ game, doc, ui, appearance, peek = sharedPeek }) {
  const state = appearance?.getState?.() ?? {};
  const isGM = Boolean(game?.user?.isGM);
  const policy = cleanPolicy(state.playerSidebarTabs);
  const limited = !isGM && !isEverything(policy);
  const active = activeTab(ui);
  if (peek.tab) {
    if (active === peek.tab) peek.armed = true;
    else if (peek.armed || !limited) { peek.tab = null; peek.armed = false; }
  }
  const hiddenIds = [], mustLeave = [], ids = listTabIds(doc);
  for (const tabId of ids) {
    const hide = shouldHideTab({ isGM, policy, tabId });
    const peeked = hide && peek.tab === tabId;
    setTabHidden(doc, tabId, hide, { keepPanel: peeked });
    if (hide) { hiddenIds.push(tabId); if (!peeked) mustLeave.push(tabId); }
  }
  doc?.body?.classList?.toggle?.(CHAT_ONLY_CLASS, limited && ids.filter(id => id !== CHAT_TAB).every(id => hiddenIds.includes(id)));
  if (hiddenIds.length) doc?.body?.setAttribute?.(HIDDEN_ATTR, hiddenIds.join(' ')); else doc?.body?.removeAttribute?.(HIDDEN_ATTR);
  if (mustLeave.length) leaveTabs(ui, mustLeave);
  return hiddenIds;
}

/**
 * The one place that opens a sidebar tab for the dock. prefer 'popout' tries `ui.<tab>.renderPopout()` first (a separate
 * window, so a collapsed sidebar stays collapsed); otherwise it expands the sidebar, marks the tab as peeked and switches to
 * it. Every Foundry name is feature-detected. Returns 'popout', 'tab' or false (nothing could be opened); never throws.
 */
export function openSidebarTab(tabId, { ui = globalThis.ui, peek = sharedPeek, prefer = 'tab', reapply = null, memory = sharedDockOpen } = {}) {
  const popout = () => {
    const app = ui?.[tabId];
    if (typeof app?.renderPopout !== 'function') return false;
    try { app.renderPopout(); memory[tabId] = { via: 'popout' }; return 'popout'; } catch (error) { console.warn('[ashen-gate-manager] Pop-out failed', error); return false; }
  };
  const inline = () => {
    const sidebar = ui?.sidebar;
    if (typeof sidebar?.changeTab !== 'function') return false;
    try {
      memory[tabId] = { via: 'tab', prev: activeTab(ui), wasExpanded: sidebar.expanded !== false };
      if (typeof sidebar.expand === 'function') sidebar.expand();
      peek.tab = tabId; peek.armed = false;
      sidebar.changeTab(tabId, 'primary');
      if (typeof reapply === 'function') reapply();
      return 'tab';
    } catch (error) { console.warn('[ashen-gate-manager] Sidebar tab not opened', error); peek.tab = null; return false; }
  };
  return (prefer === 'popout' ? popout() || inline() : inline() || popout()) || false;
}

/** Is the tab showing right now, as a rendered pop-out (`ui.<tab>.popout`, V14 AbstractSidebarTab) or as the open tab of an expanded sidebar? */
export function isSidebarTabOpen(tabId, { ui = globalThis.ui } = {}) {
  try {
    if (ui?.[tabId]?.popout?.rendered === true) return true;
    return activeTab(ui) === tabId && ui?.sidebar?.expanded !== false;
  } catch { return false; }
}

/**
 * Undoes openSidebarTab for the dock's second press. A pop-out is closed with its own `close()`. A tab opened inside the
 * sidebar goes back to the tab that was open before (Chat if unknown) and the sidebar is collapsed again if the dock had
 * expanded it. Returns 'popout', 'tab' or false (it was not open); never throws.
 */
export function closeSidebarTab(tabId, { ui = globalThis.ui, peek = sharedPeek, reapply = null, memory = sharedDockOpen } = {}) {
  const rec = memory[tabId];
  delete memory[tabId];
  try {
    const pop = ui?.[tabId]?.popout;
    if (pop?.rendered === true && typeof pop.close === 'function') {
      Promise.resolve(pop.close()).catch(error => console.warn('[ashen-gate-manager] Pop-out not closed', error));
      return 'popout';
    }
    if (activeTab(ui) !== tabId || typeof ui?.sidebar?.changeTab !== 'function') return false;
    if (peek.tab === tabId) { peek.tab = null; peek.armed = false; }
    const back = rec?.via === 'tab' && rec.prev && rec.prev !== tabId ? rec.prev : FALLBACK_TAB;
    ui.sidebar.changeTab(back, 'primary');
    if (rec?.via === 'tab' && rec.wasExpanded === false) collapseSidebar(ui);
    if (typeof reapply === 'function') reapply();
    return 'tab';
  } catch (error) { console.warn('[ashen-gate-manager] Sidebar tab not closed', error); return false; }
}

/**
 * Applies on load, whenever a setting changes (live), and after the sidebar or any sidebar tab renders (a render
 * replaces a panel). Returns a function that stops listening; `.apply` re-runs it on demand (the dock uses that).
 */
export function installSidebarTabHider({ game, hooks, doc = globalThis.document, getUi = () => globalThis.ui, appearance }) {
  const apply = () => { try { applySidebarTabs({ game, doc, ui: getUi(), appearance }); } catch (error) { console.warn('[ashen-gate-manager] Sidebar tabs not updated', error); } };
  apply();
  const names = ['ready', 'renderSidebar', 'renderSidebarTab', 'renderAbstractSidebarTab', 'changeSidebarTab'];
  const ids = names.map(name => [name, hooks?.on?.(name, apply)]);
  const stop = appearance?.subscribe?.(apply);
  const off = () => { for (const [name, id] of ids) if (id !== undefined) hooks?.off?.(name, id); if (typeof stop === 'function') stop(); };
  off.apply = apply;
  return off;
}
