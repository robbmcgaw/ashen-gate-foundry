/**
 * Group and sort choices for the Magic and Features lists. Remembered per user on this computer in one client setting,
 * `listSort` ({magic: {group, sort}, features: {group, sort}}); a missing or unknown value falls back to the default.
 * Favourites are dnd5e's own (item-actions.mjs) and always get their own group at the top.
 */
import {MODULE_ID} from './constants.mjs';

export const LIST_SORT_SETTING = 'listSort';
export const ORGANIZE = {
  magic: {
    groups: [['level', 'Spell level'], ['school', 'School'], ['none', 'No groups']],
    sorts: [['name', 'Name'], ['level', 'Level'], ['school', 'School'], ['prepared', 'Prepared first']]
  },
  features: {
    groups: [['type', 'Feature type'], ['activation', 'Use time'], ['none', 'No groups']],
    sorts: [['name', 'Name'], ['type', 'Type'], ['uses', 'Has uses first']]
  }
};

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
  type: (a, b) => String(a.facts?.type ?? '').localeCompare(String(b.facts?.type ?? '')) || byName(a, b),
  uses: (a, b) => Number(!!b.uses) - Number(!!a.uses) || byName(a, b)
};
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
