/**
 * Hide the Journals tab from players (Manager 0.79.0). Presentation only: no document, permission, flag or ownership is
 * written, and nothing here touches how journals or pages open (by uuid or id), so Locations, Quest Log and handouts keep
 * working. The GM is never affected: the tab is hidden only for a non-GM user while the world setting is on.
 *
 * Foundry V14 names are taken from the V13/V14 ApplicationV2 sidebar and were not confirmed in a live world:
 * tab buttons are `[data-action="tab"][data-tab="journal"]` inside `#sidebar-tabs`, the panel is `section#journal`
 * (`data-tab="journal"`), and the active tab is `ui.sidebar.tabGroups.primary` (changed with `ui.sidebar.changeTab(tab, "primary")`).
 */
export const HIDDEN_CLASS = 'agm-hide-journals';
export const FALLBACK_TAB = 'chat';
const MARK = 'agmJournalHidden';

/** The one place that knows where the Journals tab lives in the DOM: the tab button and the panel, inside the sidebar only. */
export function journalTabElements(doc) {
  return [...(doc?.querySelectorAll?.('#sidebar [data-tab="journal"], #sidebar #journal') ?? [])];
}

/** Hide only for a non-GM user with the setting on. */
export const shouldHideJournalTab = ({ isGM, setting }) => !isGM && setting === true;

/** Shows or hides the elements, remembering which ones we hid so showing again never un-hides anything else. */
export function setJournalTabHidden(doc, hidden) {
  const els = journalTabElements(doc);
  for (const el of els) {
    if (hidden) {
      el.hidden = true;
      if (el.dataset) el.dataset[MARK] = '1';
    } else if (el.dataset?.[MARK]) {
      el.hidden = false;
      delete el.dataset[MARK];
    }
  }
  doc?.body?.classList?.toggle?.(HIDDEN_CLASS, Boolean(hidden));
  return els.length;
}

/** If Journals is the open sidebar tab, switch to Chat so the player is not left on a hidden panel. */
export function leaveJournalTab(ui) {
  const sidebar = ui?.sidebar;
  const active = sidebar?.tabGroups?.primary ?? sidebar?.activeTab;
  if (active !== 'journal' || typeof sidebar?.changeTab !== 'function') return false;
  sidebar.changeTab(FALLBACK_TAB, 'primary');
  return true;
}

/** Applies the current setting for the current user. Returns true when the tab is hidden. */
export function applyJournalTabSetting({ game, doc, ui, appearance }) {
  const hide = shouldHideJournalTab({ isGM: Boolean(game?.user?.isGM), setting: appearance?.getState?.()?.hideJournalsTab === true });
  setJournalTabHidden(doc, hide);
  if (hide) leaveJournalTab(ui);
  return hide;
}

/**
 * Applies on load, whenever the setting changes (live), and after the sidebar or journal directory renders (a render
 * replaces the buttons). Returns a function that stops listening.
 */
export function installJournalTabHider({ game, hooks, doc = globalThis.document, getUi = () => globalThis.ui, appearance }) {
  const apply = () => { try { applyJournalTabSetting({ game, doc, ui: getUi(), appearance }); } catch (error) { console.warn('[ashen-gate-manager] Journals tab not updated', error); } };
  apply();
  const ids = ['ready', 'renderSidebar', 'renderJournalDirectory', 'changeSidebarTab'].map(name => [name, hooks?.on?.(name, apply)]);
  const stop = appearance?.subscribe?.(apply);
  return () => { for (const [name, id] of ids) if (id !== undefined) hooks?.off?.(name, id); if (typeof stop === 'function') stop(); };
}
