/**
 * 0.34.0: the Locations list as data, for a partner module (Character Hub) that draws its own markup. Pure: no Foundry globals.
 *
 * It is the same list the Locations window draws, built from the same functions (list-filter.mjs for search, filters, counts and
 * sort; region-groups.mjs for the nested Region folders; tree.mjs for rows nested under a non-Region parent), so the two cannot
 * drift apart. The GM gets the GM list: records, every filter, every sort. A player gets the player list: only what the window
 * shows a player (published views; hidden places are never present, unidentified ones carry their generic label and no id),
 * search by name, type and region, sorted by name. Nothing here is saved, and the output holds plain values only.
 */
import {SORTS, FILTER_CONTROLS, emptyFilters, hasFilters, searchText, matchesQuery, applyFilters, filterOptions, comparator, withNodeInfo} from './list-filter.mjs';
import {buildTree, withAncestors} from './tree.mjs';
import {buildRegionSections, GM_ACCESS, VIEW_ACCESS} from './region-groups.mjs';

export const LIST_CONTRACT = 'ag-locations-list/1';
const PLAYER_SORTS = Object.freeze([{value: 'name', label: 'Name'}]);
const byName = (a, b) => a.name.localeCompare(b.name);

/** Only known filter keys, as strings; anything else is dropped. */
export function cleanFilters(filters) {
  const out = emptyFilters();
  for (const k of Object.keys(out)) if (filters && typeof filters[k] === 'string') out[k] = filters[k];
  return out;
}
export const cleanSort = sort => SORTS.some(s => s.value === sort) ? sort : 'name';

/**
 * records: GM location records (not archived) or the player's views. options: {gm, query, filters, sort, sortDesc,
 * context: {templates, questName(id), materialName(id)}}. Returns the model described in the Locations README (`listModel`).
 */
export function buildListModel(records, {gm = false, query = '', filters = {}, sort = 'name', sortDesc = false, context = {}, personalUserIds = []} = {}) {
  const q = String(query ?? '').trim();
  const f = gm ? cleanFilters(filters) : emptyFilters();
  const key = gm ? cleanSort(sort) : 'name', desc = gm && sortDesc === true;
  const access = gm ? GM_ACCESS : VIEW_ACCESS;
  const questName = context.questName ?? (id => id), materialName = context.materialName ?? (id => id);
  let list = records, rows = records, fopts = null;
  let cmp = byName;
  if (gm) {
    list = rows = withNodeInfo(records, context.templates);
    if (q) rows = rows.filter(l => matchesQuery(searchText(l, {questName, materialName}), q));
    const searched = rows;
    cmp = comparator(key, desc);
    rows = applyFilters(rows, f).sort(cmp);
    fopts = filterOptions(searched, f, questName);
  } else {
    const lq = q.toLowerCase();
    rows = records.filter(l => !lq || [l.name, l.type, l.region].some(s => String(s ?? '').toLowerCase().includes(lq)));
  }
  const filtering = hasFilters(f) || !!q;
  // Same as the window: while searching or filtering, keep the matches and every folder on the way to them.
  const show = filtering ? withAncestors(list, rows, access) : null;
  const items = show ? list.filter(i => show.has(access.idOf(i))) : list;
  const matched = filtering ? new Set(rows.map(access.idOf)) : null;
  const refOf = gm ? l => l.id : l => l.id || l.key;
  // 0.36.0 (additive): `hereNow` = this place is where the party is (same as `active`); `containsHere` = something inside this row/folder is. Both are
  // plain booleans from places this user already sees, so a partner can draw a pin on the nearest collapsed folder.
  // 0.42.0 (additive): `restrictedLabel` is the text for the badge on a restricted row: "Personal" when it is revealed to the player of the character whose
  // Hub is open (`personalUserIds`, set by the API only for the GM or that character's own player), else "Selected players".
  const mine = new Set(personalUserIds);
  const audienceIds = item => (gm ? item.audience?.userIds : item.share?.userIds) ?? [];
  const node = (item, children = []) => {
    const restricted = gm ? item.audience?.mode === 'selected' : !!item.share;
    const out = {ref: refOf(item), name: item.name, state: item.state ?? '', active: item.active === true, hereNow: item.active === true,
      containsHere: children.some(c => c.hereNow || c.containsHere), isRegion: item.isRegion === true,
      restricted, restrictedLabel: restricted ? (audienceIds(item).some(u => mine.has(u)) ? 'Personal' : 'Selected players') : '', match: !matched || matched.has(access.idOf(item)), children};
    if (item.type) out.type = item.type;
    return out;
  };
  // The window shows the GM plain rows under a header, and a player the places nested under a non-Region parent.
  const rowNodes = s => gm ? s.rows.map(l => node(l))
    : buildTree(s.rows, {...access, sort: cmp}).map(function make(n) { return node(n.item, n.children.map(make)); });
  const section = s => {
    const rows = rowNodes(s), sections = s.sections.map(section), hereNow = s.item?.active === true;
    return {id: s.id, label: s.label, count: s.count, unidentified: s.unidentified, flat: s.flat, container: s.container, ref: s.item ? refOf(s.item) : null, hereNow,
      containsHere: hereNow || rows.some(r => r.hereNow || r.containsHere) || sections.some(c => c.containsHere), rows, sections};
  };
  const sections = buildRegionSections(items, access, {sortRows: cmp}).map(section);
  return {
    contract: LIST_CONTRACT, audience: gm ? 'gm' : 'player', query: q, filtering,
    total: records.length, shown: rows.length, empty: rows.length ? '' : records.length ? 'no-match' : 'none',
    controls: {
      search: {placeholder: gm ? 'Search name, region, skill, material, quest…' : 'Search locations'},
      filters: gm ? FILTER_CONTROLS.map(c => ({key: c.key, label: c.label, all: c.all, value: f[c.key],
        options: fopts[c.key].map(o => ({value: o.value, label: o.label, count: o.count}))})) : [],
      sorts: (gm ? SORTS : PLAYER_SORTS).map(s => ({value: s.value, label: s.label})), sort: key, sortDesc: desc, canReverse: gm
    },
    filters: f, sort: key, sortDesc: desc,
    sections
  };
}
