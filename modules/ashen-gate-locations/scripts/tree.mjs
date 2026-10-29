/**
 * 1.8.0 Tree mode: locations nested under their parents (Regions are the folders) to any depth. Pure functions over
 * records (GM) or player views; nothing here is saved. Works for both by passing how to read an item's id and parent.
 */
import {wouldCycle, parentMap} from './model.mjs';

const GM = {idOf: l => l.id, parentOf: l => l.parentLocationId || ''};
/** Player views: the pin key is the identity; `parent` is present only when the player may see it (safe label). */
export const VIEW = {idOf: v => v.key || v.id, parentOf: v => v.parent?.key || ''};

/**
 * Nodes: [{item, id, depth, children: [node], direct, total}]. An item whose parent is missing (deleted, or not visible
 * to this reader) or part of a loop sits at the top. `direct`/`total` count every child/descendant in `items`.
 * `show` (a Set of ids, optional) keeps only those nodes; `sort` orders siblings.
 */
export function buildTree(items, {idOf = GM.idOf, parentOf = GM.parentOf, show = null, sort = null} = {}) {
  const byId = new Map(items.map(i => [idOf(i), i]));
  const parents = new Map(items.map(i => [idOf(i), parentOf(i)]));
  const parentIn = id => {
    const p = parents.get(id);
    return p && byId.has(p) && !wouldCycle(id, p, parents) ? p : '';
  };
  const kids = new Map();
  for (const i of items) { const p = parentIn(idOf(i)); if (!kids.has(p)) kids.set(p, []); kids.get(p).push(i); }
  const count = new Map();
  const total = id => {
    if (count.has(id)) return count.get(id);
    count.set(id, 0);
    const n = (kids.get(id) ?? []).reduce((s, k) => s + 1 + total(idOf(k)), 0);
    count.set(id, n);
    return n;
  };
  const make = (item, depth) => {
    const id = idOf(item);
    const list = (kids.get(id) ?? []).filter(k => !show || show.has(idOf(k)));
    if (sort) list.sort(sort);
    return {item, id, depth, children: list.map(k => make(k, depth + 1)), direct: (kids.get(id) ?? []).length, total: total(id)};
  };
  const roots = (kids.get('') ?? []).filter(i => !show || show.has(idOf(i)));
  if (sort) roots.sort(sort);
  return roots.map(i => make(i, 0));
}

/** Ids of `matches` plus every ancestor of each, so a filtered tree still shows the path to every match. */
export function withAncestors(items, matches, {idOf = GM.idOf, parentOf = GM.parentOf} = {}) {
  const parents = new Map(items.map(i => [idOf(i), parentOf(i)]));
  const out = new Set();
  for (const m of matches) {
    for (let id = idOf(m); id && !out.has(id) && parents.has(id); id = parents.get(id)) out.add(id);
  }
  return out;
}

/** Ancestors of `id`, top first, as items: Overworld > Frontier > ... > its parent. Stops at a missing parent or a loop. */
export function breadcrumb(items, id, {idOf = GM.idOf, parentOf = GM.parentOf} = {}) {
  const byId = new Map(items.map(i => [idOf(i), i]));
  const out = [], seen = new Set([id]);
  for (let p = parentOf(byId.get(id) ?? {}); p && byId.has(p) && !seen.has(p); p = parentOf(byId.get(p))) { seen.add(p); out.unshift(byId.get(p)); }
  return out;
}

/** Flattens a tree in display order, skipping the children of closed nodes. `open(id)` → boolean. */
export function flatten(nodes, open = () => true, out = []) {
  for (const n of nodes) { out.push(n); if (n.children.length && open(n.id)) flatten(n.children, open, out); }
  return out;
}

/** Where `id` may move: Regions (folders) that are not itself or inside it. GM records. */
export function moveTargets(all, id) {
  const parents = parentMap(all.filter(l => l.id !== id));
  return all.filter(l => l.isRegion && l.id !== id && !wouldCycle(id, l.id, parents));
}

/** 0.32.1: Region path for a place, outermost first ("Fosstryn Frontier › Fosstryn › The Muster"), using the same breadcrumb as the list. */
export function regionPath(all, l) { return [...breadcrumb(all, l.id), l].map(x => x.name).join(' › '); }

/**
 * 0.32.1: the one list of Regions a place can go inside (the "Inside" select and the "Move to…" dialog). Only isRegion places, never the place itself or
 * anything that would loop; a new place (no id) has nothing to exclude. Sorted by path, so same-named Regions sit under their own parents.
 * Returns [{loc, path}]. Display only: the API and the data layer still accept any parent id.
 */
export function regionChoices(all, id = '') {
  const list = id ? moveTargets(all, id) : all.filter(l => l.isRegion);
  return list.map(loc => ({loc, path: regionPath(all, loc)})).sort((a, b) => a.path.localeCompare(b.path));
}

/** 0.32.1: names for the Region drop-down: every Region's name once (alphabetical). The stored value stays the plain name. */
export function regionNames(all) {
  return [...new Set(all.filter(l => l.isRegion && l.name).map(l => l.name))].sort((a, b) => a.localeCompare(b));
}

/** 0.32.1: when "Inside" changes to a Region, the Region text follows it, but only if it was empty or the old parent Region's name. Otherwise unchanged. */
export function regionAfterParentChange(all, draft, newParentId) {
  const cur = draft.region || '', byId = new Map(all.map(l => [l.id, l]));
  const next = byId.get(newParentId), old = byId.get(draft.parentLocationId);
  if (!next?.isRegion || !next.name) return cur;
  return !cur || (old?.isRegion && cur === old.name) ? next.name : cur;
}

/** Checks a reparent. Returns the location's current parent id; throws a message the GM can show. */
export function checkMove(all, id, parentId) {
  const loc = all.find(l => l.id === id);
  if (!loc) throw new Error('No location found with that reference.');
  if (parentId && !all.some(l => l.id === parentId)) throw new Error('No location found with that reference.');
  if (parentId === id || (parentId && wouldCycle(id, parentId, parentMap(all.filter(l => l.id !== id)))))
    throw new Error(`${loc.name} cannot go inside ${all.find(l => l.id === parentId)?.name ?? 'that place'}: that place is inside ${loc.name}.`);
  return loc.parentLocationId || '';
}
