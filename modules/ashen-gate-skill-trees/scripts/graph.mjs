/** Skill tree graph geometry: edges run from prerequisite to dependent and stop at the node's border,
 * so the arrowhead stays visible. Pure; shared by the template context and the live drag preview. */
import {NODE_SIZES} from './appearance.mjs';
export const NODE_W = 181, NODE_H = 67;
const GAP = 3;
// A node keeps its width; its height grows with a long name, so a measured n.h (board px) overrides the default height.
const dims = (size, n) => { const d = NODE_SIZES[size] ?? {w: NODE_W, h: NODE_H}; return Number.isFinite(n?.h) && n.h > d.h ? {w: d.w, h: n.h} : d; };
export const nodeCenter = (n, size) => { const {w, h} = dims(size, n); return {x: n.x + w / 2, y: n.y + h / 2}; };
/** Where the line from box centre a toward point b leaves the node box (plus a small gap). */
function borderPoint(c, toward, size, n) {
  const {w: NODE_W, h: NODE_H} = dims(size, n);
  const dx = toward.x - c.x, dy = toward.y - c.y;
  if (!dx && !dy) return {...c};
  const scale = Math.min(dx ? (NODE_W / 2 + GAP) / Math.abs(dx) : Infinity, dy ? (NODE_H / 2 + GAP) / Math.abs(dy) : Infinity);
  return {x: c.x + dx * scale, y: c.y + dy * scale};
}
const r = v => Math.round(v * 10) / 10;
/** Straight segment between two node positions ({x,y} top-left), with its midpoint for a label. */
export function edgeLine(from, to, size) {
  const a = nodeCenter(from, size), b = nodeCenter(to, size);
  const s = borderPoint(a, b, size, from), e = borderPoint(b, a, size, to);
  return {d: `M ${r(s.x)} ${r(s.y)} L ${r(e.x)} ${r(e.y)}`, mx: r((s.x + e.x) / 2), my: r((s.y + e.y) / 2)};
}
/**
 * Every edge of a tree. kind: 'all' (required), 'any' (one of an OR group; group is 1-based), 'exclude' (either/or, no direction).
 * Exclusions listed on both nodes are drawn once. Edges to nodes not in the list (e.g. hidden from players) are left out.
 */
export function graphEdges(nodes, size) {
  const by = new Map(nodes.map(n => [n.id, n])), edges = [], seen = new Set();
  const unlocked = id => Boolean(by.get(id)?.unlocked);
  const add = (kind, from, to, extra = {}) => {
    const a = by.get(from), b = by.get(to);
    if (!a || !b || a === b) return;
    edges.push({kind, from, to, ...edgeLine(a, b, size), active: kind !== 'exclude' && unlocked(from) && unlocked(to), ...extra});
  };
  for (const n of nodes) {
    for (const id of n.requiresAll ?? []) add('all', id, n.id);
    (n.requiresAny ?? []).forEach((g, i) => { for (const id of g) add('any', id, n.id, {group: i + 1}); });
    for (const id of n.excludes ?? []) {
      const key = [n.id, id].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key); add('exclude', n.id, id);
    }
  }
  return edges;
}
