/**
 * Group and sort choices for the Magic and Features lists. Remembered per user on this computer in one client setting,
 * `listSort` ({magic: {group, sort}, features: {group, sort}}); a missing or unknown value falls back to the default.
 * Favourites are dnd5e's own (item-actions.mjs) and always get their own group at the top.
 */
import {MODULE_ID} from './constants.mjs';

export const LIST_SORT_SETTING = 'listSort';
export const ORGANIZE = {
  magic: {
    groups: [['level', 'Spell level'], ['school', 'School'], ['prepared', 'Prepared'], ['ritual', 'Ritual'], ['action', 'Action type'], ['none', 'No groups']],
    sorts: [['name', 'Name'], ['level', 'Level'], ['school', 'School'], ['prepared', 'Prepared first'], ['ritual', 'Ritual first'], ['action', 'Action type']]
  },
  features: {
    // 'activation' keeps its pre-0.14.0 key; it now groups by dnd5e's activation type.
    groups: [['type', 'Feature type'], ['activation', 'Action type'], ['source', 'Source'], ['uses', 'Uses'], ['none', 'No groups']],
    sorts: [['name', 'Name'], ['type', 'Type'], ['uses', 'Has uses first'], ['action', 'Action type']]
  }
};

/** dnd5e activation types in table order (CONFIG.DND5E.activityActivationTypes); others follow, then none. */
const ACTION_ORDER = ['action', 'bonus', 'reaction', 'minute', 'hour', 'day', 'legendary', 'mythic', 'lair', 'crew', 'special'];
const actionRank = t => { const i = ACTION_ORDER.indexOf(t); return t ? (i < 0 ? ACTION_ORDER.length : i) : ACTION_ORDER.length + 1; };
const ACTION_FALLBACK = {action: 'Action', bonus: 'Bonus Action', reaction: 'Reaction', minute: 'Minute', hour: 'Hour', day: 'Day', special: 'Special'};
export const actionLabel = t => t ? (globalThis.CONFIG?.DND5E?.activityActivationTypes?.[t]?.label ?? ACTION_FALLBACK[t] ?? t) : 'No action type';

/** Preparation state from dnd5e data: 'cantrip', 'always', 'prepared', 'free' (method needs no preparing) or 'unprepared'. */
export const prepState = r => (r.level ?? 0) === 0 ? 'cantrip' : r.always ? 'always' : r.prepared ? 'prepared' : r.canPrepare ? 'unprepared' : 'free';
const PREP = {cantrip: 'Cantrips', always: 'Always prepared', prepared: 'Prepared', free: 'Known (no preparing)', unprepared: 'Not prepared'};
const PREP_ORDER = ['cantrip', 'always', 'prepared', 'free', 'unprepared'];

/** Group key and label for a row under each grouping (rows from items.mjs). */
export const GROUP_BY = {
  school: r => ({key: r.facts?.school || 'none', label: r.facts?.school || 'No school'}),
  prepared: r => ({key: prepState(r), label: PREP[prepState(r)]}),
  ritual: r => r.facts?.ritual ? {key: 'ritual', label: 'Ritual'} : {key: 'other', label: 'Not ritual'},
  action: r => ({key: r.actType || 'none', label: actionLabel(r.actType)}),
  activation: r => ({key: r.actType || 'none', label: actionLabel(r.actType)}),
  source: r => ({key: r.sourceId || 'none', label: r.sourceName || 'Other'}),
  uses: r => r.uses ? {key: 'uses', label: 'Has uses'} : {key: 'none', label: 'No uses'}
};
/** Group order for each grouping (keys); unlisted keys sort by label after them. */
export function orderGroups(groups, by) {
  const rank = by === 'prepared' ? g => PREP_ORDER.indexOf(g.key) : by === 'action' || by === 'activation' ? g => actionRank(g.key === 'none' ? '' : g.key)
    : by === 'ritual' ? g => (g.key === 'ritual' ? 0 : 1) : by === 'uses' ? g => (g.key === 'uses' ? 0 : 1) : g => (g.key === 'none' ? 1 : 0);
  return groups.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
}

export function registerListSortSetting(settings) {
  settings.register(MODULE_ID, LIST_SORT_SETTING, {scope: 'client', config: false, type: Object, default: {}});
}

/** {group, sort} for a tab, always valid. */
export function listChoice(tab) {
  const o = ORGANIZE[tab];
  let v = null;
  try { v = globalThis.game?.settings?.get?.(MODULE_ID, LIST_SORT_SETTING)?.[tab]; } catch { v = null; }
  const pick = (list, value) => list.some(([k]) => k === value) ? value : list[0][0];
  return {group: pick(o.groups, v?.group), sort: pick(o.sorts, v?.sort)};
}

export async function setListChoice(tab, field, value) {
  const o = ORGANIZE[tab];
  if (!o || !['group', 'sort'].includes(field)) return {ok: false, error: 'Unknown list choice.'};
  const list = field === 'group' ? o.groups : o.sorts;
  if (!list.some(([k]) => k === value)) return {ok: false, error: 'Unknown list choice.'};
  let all = {};
  try { const cur = globalThis.game?.settings?.get?.(MODULE_ID, LIST_SORT_SETTING); all = cur && typeof cur === 'object' && !Array.isArray(cur) ? cur : {}; } catch { all = {}; }
  const next = {...all, [tab]: {...listChoice(tab), [field]: value}};
  try { await globalThis.game?.settings?.set?.(MODULE_ID, LIST_SORT_SETTING, next); } catch (err) { console.warn(`${MODULE_ID} | list choice not saved`, err); }
  return {ok: true, result: next[tab]};
}

const byName = (a, b) => String(a.name).localeCompare(String(b.name));
const COMPARE = {
  name: byName,
  level: (a, b) => (a.level ?? 0) - (b.level ?? 0) || byName(a, b),
  school: (a, b) => String(a.facts?.school ?? '').localeCompare(String(b.facts?.school ?? '')) || (a.level ?? 0) - (b.level ?? 0) || byName(a, b),
  prepared: (a, b) => Number(!!(b.always || b.prepared)) - Number(!!(a.always || a.prepared)) || (a.level ?? 0) - (b.level ?? 0) || byName(a, b),
  type: (a, b) => String(a.typeLabel ?? a.facts?.type ?? '').localeCompare(String(b.typeLabel ?? b.facts?.type ?? '')) || byName(a, b),
  uses: (a, b) => Number(!!b.uses) - Number(!!a.uses) || byName(a, b),
  ritual: (a, b) => Number(!!b.facts?.ritual) - Number(!!a.facts?.ritual) || (a.level ?? 0) - (b.level ?? 0) || byName(a, b),
  action: (a, b) => actionRank(a.actType) - actionRank(b.actType) || byName(a, b)
};

// ---------- Filters (per open sheet, not saved) ----------

/**
 * Can this spell be cast now, from dnd5e data: cantrips always; otherwise it must be prepared (or its method needs
 * no preparing) and, if it uses spell slots, the character must have a slot of its level or higher left (or a pact
 * slot of that level or higher). A spell that doesn't use slots needs uses left when it has limited uses.
 */
export function castable(r, slotsLeft = {}, pact = null) {
  const level = r.level ?? 0;
  if (level === 0) return true;
  if (prepState(r) === 'unprepared') return false;
  if (r.usesSlots === false) return !r.uses || r.uses.value > 0;
  for (let l = level; l <= 9; l++) if ((slotsLeft[l] ?? 0) > 0) return true;
  return !!pact && pact.value > 0 && pact.level >= level;
}
export const FILTERS = {
  magic: [['prepared', 'Prepared only'], ['ritual', 'Ritual only'], ['castable', 'Castable only']],
  features: [['uses', 'Has uses'], ['left', 'Uses left']]
};
/** Applies a tab's filters to its rows. f: {level, action, prepared, ritual, castable, uses, left}. */
export function filterRows(rows, f = {}, {slotsLeft = {}, pact = null} = {}) {
  return rows.filter(r => (f.level === undefined || f.level === null || (r.level ?? 0) === Number(f.level))
    && (!f.action || (r.actType || 'none') === f.action)
    && (!f.prepared || prepState(r) !== 'unprepared')
    && (!f.ritual || r.facts?.ritual)
    && (!f.castable || castable(r, slotsLeft, pact))
    && (!f.uses || !!r.uses)
    && (!f.left || (r.uses ? r.uses.value > 0 : true)));
}
export const sortRows = (rows, sort) => [...rows].sort(COMPARE[sort] ?? byName);

/**
 * Groups rows: keyOf(row) → {key, label}. Group order follows `order` (keys) when given, else first appearance.
 * 'none' puts everything in one group with `allLabel`.
 */
export function groupRows(rows, keyOf, {order = null, allLabel = 'All'} = {}) {
  const groups = new Map();
  for (const r of rows) {
    const g = keyOf(r) ?? {key: 'all', label: allLabel};
    if (!groups.has(g.key)) groups.set(g.key, {...g, items: []});
    groups.get(g.key).items.push(r);
  }
  const out = [...groups.values()];
  if (order) out.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return out;
}
