/** The GM list: search, filters, sort and grouping. Pure functions over the location records; nothing here is saved. */
import {THREATS, threatLabel, hasUnpublishedChanges} from './model.mjs';

export const NONE = '__none';
export const HAS = '__has';
export const GROUP_MODES = Object.freeze([{value: 'none', label: 'None'}, {value: 'region', label: 'Region'}, {value: 'threat', label: 'Threat level'},
  {value: 'profession', label: 'Gathering profession'}, {value: 'quest', label: 'Quest'}]);
export const SORTS = Object.freeze([{value: 'name', label: 'Name'}, {value: 'threat', label: 'Threat'}, {value: 'region', label: 'Region, then name'},
  {value: 'nodes', label: 'Gathering nodes'}, {value: 'status', label: 'Status'}]);
export const STATUS_FILTERS = Object.freeze([{value: 'hidden', label: 'Hidden'}, {value: 'unidentified', label: 'Unidentified'}, {value: 'revealed', label: 'Revealed'},
  {value: 'unpublished', label: 'Unpublished edits'}]);
export const emptyFilters = () => ({threat: '', region: '', profession: '', quest: '', status: ''});
export const hasFilters = f => Object.values(f).some(Boolean);

const skillsOf = l => [...new Set((l.resources ?? []).map(r => String(r.skill ?? '').trim()).filter(Boolean))];
const questIdsOf = l => [...new Set((l.quests ?? []).map(q => q.questId).filter(Boolean))];

/** Lower-case text a search matches: name, type, region, threat, gathering skills and node names, materials, linked quests. */
export function searchText(l, {questName = id => id, materialName = id => id} = {}) {
  const parts = [l.name, l.type, l.region, l.threat, threatLabel(l.threat), l.state];
  for (const r of l.resources ?? []) parts.push(r.label, r.skill, r.materialId, materialName(r.materialId), r.rareMaterialId, materialName(r.rareMaterialId));
  for (const id of questIdsOf(l)) parts.push(id, questName(id));
  return parts.filter(Boolean).join('\n').toLowerCase();
}
export const matchesQuery = (text, query) => String(query).toLowerCase().split(/\s+/).filter(Boolean).every(t => text.includes(t));

const test = {
  threat: (l, v) => (l.threat || 'normal') === v,
  region: (l, v) => v === NONE ? !l.region : l.region === v,
  profession: (l, v) => skillsOf(l).includes(v),
  quest: (l, v) => v === HAS ? questIdsOf(l).length > 0 : v === NONE ? questIdsOf(l).length === 0 : questIdsOf(l).includes(v),
  status: (l, v) => v === 'unpublished' ? hasUnpublishedChanges(l) : l.state === v
};
/** Rows that pass every filter (AND), optionally ignoring one so a dropdown can count its own alternatives. */
export function applyFilters(rows, filters, except = null) {
  const active = Object.entries(filters).filter(([k, v]) => v && k !== except);
  return active.length ? rows.filter(l => active.every(([k, v]) => test[k](l, v))) : rows;
}
const countBy = (rows, keysOf) => { const m = new Map(); for (const l of rows) for (const k of new Set(keysOf(l))) m.set(k, (m.get(k) ?? 0) + 1); return m; };
/** Options for each filter dropdown with counts: [{value, label, count}]. Counts follow the other active filters. */
export function filterOptions(rows, filters, questName = id => id) {
  const base = key => applyFilters(rows, filters, key);
  const opts = {};
  const threats = countBy(base('threat'), l => [l.threat || 'normal']);
  opts.threat = THREATS.map(t => ({value: t.value, label: t.label, count: threats.get(t.value) ?? 0}));
  const regions = countBy(base('region'), l => [l.region || NONE]);
  opts.region = [...regions].filter(([k]) => k !== NONE).sort((a, b) => a[0].localeCompare(b[0])).map(([k, n]) => ({value: k, label: k, count: n}));
  if (regions.has(NONE)) opts.region.push({value: NONE, label: 'No region', count: regions.get(NONE)});
  const profs = countBy(base('profession'), skillsOf);
  opts.profession = [...profs].sort((a, b) => a[0].localeCompare(b[0])).map(([k, n]) => ({value: k, label: k, count: n}));
  const qrows = base('quest'), quests = countBy(qrows, questIdsOf);
  opts.quest = [{value: HAS, label: 'Has linked quest', count: qrows.filter(l => questIdsOf(l).length).length},
    {value: NONE, label: 'No quest', count: qrows.filter(l => !questIdsOf(l).length).length},
    ...[...quests].map(([id, n]) => ({value: id, label: questName(id), count: n})).sort((a, b) => a.label.localeCompare(b.label))];
  const srows = base('status');
  opts.status = STATUS_FILTERS.map(s => ({...s, count: srows.filter(l => test.status(l, s.value)).length}));
  return opts;
}

const STATUS_ORDER = ['hidden', 'unidentified', 'revealed'];
const byName = (a, b) => a.name.localeCompare(b.name);
/** Row comparator for a sort key. `desc` flips the main key only; ties always fall back to name A-Z. */
export function comparator(sort = 'name', desc = false) {
  const dir = desc ? -1 : 1;
  const num = {threat: l => THREATS.findIndex(t => t.value === (l.threat || 'normal')), nodes: l => (l.resources ?? []).length, status: l => STATUS_ORDER.indexOf(l.state)};
  if (sort === 'name') return (a, b) => dir * byName(a, b);
  if (sort === 'region') return (a, b) => dir * ((!a.region) - (!b.region) || (a.region ?? '').localeCompare(b.region ?? '')) || byName(a, b);
  const f = num[sort] ?? num.threat;
  return (a, b) => dir * (f(a) - f(b)) || byName(a, b);
}
/** Groups of already-sorted rows: [{key, label, rows}]. A location appears under every profession or quest it has. */
export function groupRows(rows, mode, questName = id => id) {
  if (mode === 'none') return rows.length ? [{key: '', label: '', rows}] : [];
  const groups = new Map();
  const put = (key, label, l) => { if (!groups.has(key)) groups.set(key, {key, label, rows: []}); groups.get(key).rows.push(l); };
  for (const l of rows) {
    if (mode === 'threat') put(l.threat || 'normal', threatLabel(l.threat), l);
    else if (mode === 'profession') { const s = skillsOf(l); if (s.length) s.forEach(k => put(k, k, l)); else put('', 'No gathering', l); }
    else if (mode === 'quest') { const q = questIdsOf(l); if (q.length) q.forEach(id => put(id, questName(id), l)); else put('', 'No quest', l); }
    else put(l.region || '', l.region || 'No region', l);
  }
  const order = THREATS.map(t => t.value);
  return [...groups.values()].sort(mode === 'threat' ? (a, b) => order.indexOf(a.key) - order.indexOf(b.key)
    : (a, b) => (a.key === '') - (b.key === '') || a.label.localeCompare(b.label));
}
