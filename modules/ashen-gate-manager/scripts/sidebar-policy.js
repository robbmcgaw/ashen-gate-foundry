/**
 * Which sidebar tabs players keep (Manager 0.84.0). One checklist replaces the old Journals / Compendiums / "only the Chat tab"
 * switches. Pure logic (no Foundry globals), so appearance.js, sidebar-tabs.js, gm-setup.js and the tests share one definition.
 *
 * Stored in the world setting `playerSidebarTabs` as JSON text: {"keep":[ids],"hide":[ids],"others":"keep"|"hide"}.
 *   keep / hide: the tabs the checklist listed when it was saved, ticked / unticked.
 *   others: what happens to a tab in neither list (a module added later): kept or hidden. "Everything" keeps them, "Chat only" hides them.
 * Chat is always kept. An empty setting means "not set yet": the old 0.79.0 to 0.81.0 settings are read instead (policyFromLegacy)
 * until the GM's client copies them across once (appearance.js migrateSidebarTabs). The old keys are never changed or removed.
 */
export const CHAT_TAB = 'chat';

/** Core V14 sidebar tabs in sidebar order (Foundry 14.367 Sidebar.TABS). `players:false` = players do not normally get it. */
export const CORE_TABS = Object.freeze([
  Object.freeze({ id: 'chat', label: 'Chat' }),
  Object.freeze({ id: 'combat', label: 'Combat' }),
  Object.freeze({ id: 'scenes', label: 'Scenes', players: false }),
  Object.freeze({ id: 'placeables', label: 'Placeables' }),
  Object.freeze({ id: 'actors', label: 'Actors' }),
  Object.freeze({ id: 'items', label: 'Items' }),
  Object.freeze({ id: 'journal', label: 'Journals' }),
  Object.freeze({ id: 'tables', label: 'Tables' }),
  Object.freeze({ id: 'cards', label: 'Cards' }),
  Object.freeze({ id: 'macros', label: 'Macros' }),
  Object.freeze({ id: 'playlists', label: 'Playlists' }),
  Object.freeze({ id: 'compendium', label: 'Compendiums' }),
  Object.freeze({ id: 'settings', label: 'Settings' })
]);
export const CORE_TAB_IDS = Object.freeze(CORE_TABS.map(t => t.id));

const idList = value => [...new Set((Array.isArray(value) ? value : []).map(v => String(v ?? '').trim()).filter(Boolean))];

/** The everything-kept policy. */
export const EVERYTHING = Object.freeze({ keep: Object.freeze([]), hide: Object.freeze([]), others: 'keep' });

/** Cleans any value into {keep,hide,others}. Chat is never in hide, and an id in both lists counts as hidden. */
export function cleanPolicy(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const hide = idList(raw.hide).filter(id => id !== CHAT_TAB);
  const keep = idList(raw.keep).filter(id => !hide.includes(id));
  return { keep, hide, others: raw.others === 'hide' ? 'hide' : 'keep' };
}

/** Parses the stored JSON text. Returns a cleaned policy, or null when nothing valid is stored (not set yet). */
export function parseStoredPolicy(text) {
  if (text && typeof text === 'object') return cleanPolicy(text);
  if (typeof text !== 'string' || text.trim() === '') return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? cleanPolicy(value) : null;
  } catch { return null; }
}

export const serializePolicy = policy => JSON.stringify(cleanPolicy(policy));

/** Does a player keep this tab? Chat always; a listed tab as ticked; any other tab by `others`. */
export function tabKept(policy, tabId) {
  if (tabId === CHAT_TAB) return true;
  const p = policy ?? EVERYTHING;
  if (p.hide?.includes(tabId)) return false;
  if (p.keep?.includes(tabId)) return true;
  return p.others !== 'hide';
}

/** True when no tab is hidden for anyone (nothing to apply). */
export const isEverything = policy => { const p = cleanPolicy(policy); return p.hide.length === 0 && p.others === 'keep'; };

/** Build a policy from the checklist: `listed` = every tab id in the checklist, `kept` = the ticked ones. */
export function policyFromChecklist(listed, kept) {
  const keptSet = new Set(idList(kept));
  const all = idList(listed).filter(id => id !== CHAT_TAB);
  const keep = all.filter(id => keptSet.has(id)), hide = all.filter(id => !keptSet.has(id));
  // Every other tab unticked is the "Chat only" preset: tabs added later are hidden too, as the old switch did.
  return cleanPolicy({ keep: [CHAT_TAB, ...keep], hide, others: keep.length === 0 ? 'hide' : 'keep' });
}

/** The presets. `listed` = every tab id in the checklist. */
export const presetPolicy = (preset, listed = CORE_TAB_IDS) => policyFromChecklist(listed, preset === 'chat' ? [] : idList(listed));

/** 'everything', 'chat' or 'custom' for the listed tabs (what the summary line says). */
export function presetOf(policy, listed = CORE_TAB_IDS) {
  const ids = idList(listed).filter(id => id !== CHAT_TAB);
  const kept = ids.filter(id => tabKept(policy, id)).length;
  return kept === ids.length ? 'everything' : kept === 0 ? 'chat' : 'custom';
}

/**
 * The old settings as one policy: "only the Chat tab" (0.81.0) hid every tab but Chat, tabs added by modules included;
 * otherwise Journals (0.79.0) and Compendiums (0.80.0) were hidden one by one. The mapping, written out in the CHANGELOG:
 *   chatOnlySidebar on                    -> keep Chat only, hide every other tab, others hidden
 *   hideJournalsTab / hideCompendiumsTab  -> hide Journals / Compendiums, keep the rest, others kept
 *   none on                               -> Everything
 */
export function policyFromLegacy({ chatOnlySidebar = false, hideJournalsTab = false, hideCompendiumsTab = false } = {}) {
  if (chatOnlySidebar === true) return presetPolicy('chat');
  const hide = [hideJournalsTab === true ? 'journal' : null, hideCompendiumsTab === true ? 'compendium' : null].filter(Boolean);
  return cleanPolicy({ keep: CORE_TAB_IDS.filter(id => !hide.includes(id)), hide, others: 'keep' });
}

/** Same result for every tab (listed in either policy, or not listed at all)? Used so a save or migration never rewrites an unchanged choice. */
export function samePolicy(a, b) {
  const x = cleanPolicy(a), y = cleanPolicy(b);
  if (x.others !== y.others) return false;
  const ids = new Set([...x.keep, ...x.hide, ...y.keep, ...y.hide, ...CORE_TAB_IDS]);
  return [...ids].every(id => tabKept(x, id) === tabKept(y, id));
}

/**
 * The checklist rows for GM Setup: the core tabs, then any other tab found in the sidebar (extra = [{id,label}]).
 * Chat is always ticked and locked. Rows carry plain labels only.
 */
export function checklistRows(policy, extra = []) {
  const rows = [...CORE_TABS.map(t => ({ id: t.id, label: t.label, note: t.players === false ? 'players do not normally get this tab' : '', module: false })),
    ...extra.filter(t => t?.id && !CORE_TAB_IDS.includes(t.id)).map(t => ({ id: t.id, label: t.label || 'Added tab', note: 'added by a module', module: true }))];
  return rows.map(r => ({ ...r, kept: tabKept(policy, r.id), locked: r.id === CHAT_TAB }));
}

/** The line under the checklist for rows [{kept}]: "Players keep: Everything.", "Players keep: Chat only." or a count. */
export function summarizeRows(rows) {
  const others = rows.filter(r => r.id !== CHAT_TAB), kept = others.filter(r => r.kept).length;
  if (kept === others.length) return 'Players keep: Everything.';
  if (kept === 0) return 'Players keep: Chat only.';
  return `Players keep ${kept + 1} of ${rows.length} tabs.`;
}
