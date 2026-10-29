/**
 * Hide sidebar tabs from players (Manager 0.79.0 Journals, 0.80.0 Compendiums). Presentation only: no document,
 * permission, flag or ownership is written, and nothing here touches how journals, compendium documents or pages open
 * (by uuid or id), so Locations, Quest Log, handouts and links keep working. The GM is never affected: a tab is hidden
 * only for a non-GM user while its world setting is on.
 *
 * A hidden tab loses its whole layout slot: the tab button's wrapper (the <li> around it in the tab column, or the button
 * itself when there is none) gets display:none, so the remaining icons sit together with no gap. The panel is hidden too.
 *
 * Foundry V14 names are from the V13/V14 ApplicationV2 sidebar and were not confirmed in a live world: the tab column is
 * `#sidebar-tabs` (a <menu> of <li><button data-action="tab" data-tab="...">), panels are `section#<id>` with
 * `data-tab="<id>"`, and the active tab is `ui.sidebar.tabGroups.primary` (changed with `ui.sidebar.changeTab(tab, "primary")`).
 */
export const FALLBACK_TAB = 'chat';
const MARK = 'agmTabHidden';

/** tab id (data-tab) -> its GM Setup state key, body class and directory render hook. */
export const SIDEBAR_TABS = Object.freeze({
  journal: Object.freeze({ stateKey: 'hideJournalsTab', bodyClass: 'agm-hide-journals', hook: 'renderJournalDirectory' }),
  compendium: Object.freeze({ stateKey: 'hideCompendiumsTab', bodyClass: 'agm-hide-compendiums', hook: 'renderCompendiumDirectory' })
});

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

/** Hide only for a non-GM user with the setting on. */
export const shouldHideTab = ({ isGM, setting }) => !isGM && setting === true;

/** Hides or restores the elements, remembering which ones we hid so showing again never un-hides anything else. */
export function setTabHidden(doc, tabId, hidden) {
  const els = tabElements(doc, tabId);
  for (const el of els) {
    if (hidden) {
      el.hidden = true;
      el.style?.setProperty?.('display', 'none', 'important');
      if (el.dataset) el.dataset[MARK] = '1';
    } else if (el.dataset?.[MARK]) {
      el.hidden = false;
      el.style?.removeProperty?.('display');
      delete el.dataset[MARK];
    }
  }
  doc?.body?.classList?.toggle?.(SIDEBAR_TABS[tabId].bodyClass, Boolean(hidden));
  return els.length;
}

/** If a hidden tab is the open sidebar tab, switch to Chat so the player is not left on a hidden panel. */
export function leaveTabs(ui, tabIds) {
  const sidebar = ui?.sidebar;
  const active = sidebar?.tabGroups?.primary ?? sidebar?.activeTab;
  if (!tabIds.includes(active) || typeof sidebar?.changeTab !== 'function') return false;
  sidebar.changeTab(FALLBACK_TAB, 'primary');
  return true;
}

/** Applies every tab setting for the current user. Returns the ids of the tabs now hidden. */
export function applySidebarTabs({ game, doc, ui, appearance }) {
  const state = appearance?.getState?.() ?? {};
  const hiddenIds = [];
  for (const [tabId, cfg] of Object.entries(SIDEBAR_TABS)) {
    const hide = shouldHideTab({ isGM: Boolean(game?.user?.isGM), setting: state[cfg.stateKey] === true });
    setTabHidden(doc, tabId, hide);
    if (hide) hiddenIds.push(tabId);
  }
  if (hiddenIds.length) leaveTabs(ui, hiddenIds);
  return hiddenIds;
}

/**
 * Applies on load, whenever a setting changes (live), and after the sidebar or a hidden tab's directory renders (a render
 * replaces the buttons). Returns a function that stops listening.
 */
export function installSidebarTabHider({ game, hooks, doc = globalThis.document, getUi = () => globalThis.ui, appearance }) {
  const apply = () => { try { applySidebarTabs({ game, doc, ui: getUi(), appearance }); } catch (error) { console.warn('[ashen-gate-manager] Sidebar tabs not updated', error); } };
  apply();
  const names = ['ready', 'renderSidebar', 'changeSidebarTab', ...Object.values(SIDEBAR_TABS).map(t => t.hook)];
  const ids = names.map(name => [name, hooks?.on?.(name, apply)]);
  const stop = appearance?.subscribe?.(apply);
  return () => { for (const [name, id] of ids) if (id !== undefined) hooks?.off?.(name, id); if (typeof stop === 'function') stop(); };
}
