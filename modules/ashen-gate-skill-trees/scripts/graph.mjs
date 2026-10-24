/** Skill tree graph geometry: edges run from prerequisite to dependent and stop at the node's border,
 * so the arrowhead stays visible. Pure; shared by the template context and the live drag preview. */
import {NODE_SIZES} from './appearance.mjs';
export const NODE_W = 181, NODE_H = 67;
const GAP = 3;
export const RING = 7; // ring and outer ring around the icon, px
// A node is a fixed-size icon centred in its footprint (NODE_SIZES w by h); a long name no longer grows it.
const dims = size => NODE_SIZES[size] ?? {w: NODE_W, h: NODE_H};
export const nodeCenter = (n, size) => { const {w, h} = dims(size); return {x: n.x + w / 2, y: n.y + h / 2}; };
/** Where the line from node centre a toward point b leaves the node's icon ring (plus a small gap). */
function borderPoint(c, toward, size, n) {
  const dx = toward.x - c.x, dy = toward.y - c.y;
  if (!dx && !dy) return {...c};
  // 0.23.0: a node is a round icon, so a line stops at the icon's outer ring, not at the old box edge.
  const radius = (NODE_SIZES[size]?.icon ?? NODE_SIZES.normal.icon) / 2 + RING + GAP;
  const scale = radius / Math.hypot(dx, dy);
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
