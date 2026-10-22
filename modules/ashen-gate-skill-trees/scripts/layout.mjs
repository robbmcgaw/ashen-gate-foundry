/** Window layout state and the corner-tooltip content. Pure; the app wires these to the DOM. */
export const NARROW_WIDTH = 760;
export const isNarrow = width => Number.isFinite(width) && width > 0 && width < NARROW_WIDTH;
/** First render decides by width (drawer closed when narrow); after that the user's choice wins. */
export const initialSidebar = (current, width) => typeof current === 'boolean' ? current : !isNarrow(width);
export const toggledSidebar = current => !(current !== false);

const shorten = (text, max = 140) => {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
};
const STATUS = {UNLOCKED: 'Unlocked', AVAILABLE: 'Available', LOCKED: 'Locked'};
/**
 * Tooltip card for a node as the canvas shows it (already projected for the viewer):
 * name, cost, short text, prerequisites in words and Locked / Available / Unlocked.
 */
export function tooltipModel(node) {
  if (!node) return null;
  const status = STATUS[node.flag] ?? (node.unlocked ? 'Unlocked' : node.eligible ? 'Available' : 'Locked');
  const cost = node.silhouette ? null : (node.cost ?? 1);
  return {id: node.id, name: node.name || 'Unnamed', status, statusKey: status.toLowerCase(),
    cost, costText: cost == null ? '' : `${cost} point${cost === 1 ? '' : 's'}`,
    text: node.silhouette ? '' : shorten(node.description),
    prerequisites: node.relText ?? '',
    reason: status === 'Locked' ? String(node.reason ?? '') : ''};
}

/** Node fields as words (inspector, Edit node dialog): never the raw stored value. */
export const NODE_STATUS_LABELS = {draft: 'Draft', test: 'Test', approved: 'Approved', placeholder: 'Placeholder (GM only)'};
export const NODE_VISIBILITY_LABELS = {gm: 'GM only', player: 'Player-visible', reveal_gated: 'Reveal-gated (hidden until source released)'};
export const NODE_DISPLAY_LABELS = {hidden: 'Hidden', teaser: 'Silhouette', shown: 'Shown'};
export const labelOf = (labels, value) => labels[value] ?? String(value ?? '');

/** Keyboard move in Edit layout (0.20.0): arrow keys step 10 px, Shift 50 px; same 0–6000 board and 10 px grid as dragging. */
export const NUDGE_STEP = 10, NUDGE_STEP_LARGE = 50, BOARD_MAX = 6000;
const ARROWS = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};
export const snapPos = v => Math.round(Math.max(0, Math.min(BOARD_MAX, Number(v) || 0)) / 10) * 10;
/** The new {x, y} for an arrow key, or null for any other key. */
export function nudged({x, y} = {}, key, shift = false) {
  const dir = ARROWS[key];
  if (!dir) return null;
  const step = shift ? NUDGE_STEP_LARGE : NUDGE_STEP;
  return {x: snapPos((Number(x) || 0) + dir[0] * step), y: snapPos((Number(y) || 0) + dir[1] * step)};
}

/**
 * Rows of the Edit node prerequisite table, grouped by tier (0.20.0): by the level a node needs (profession trees),
 * else by the tier band it sits in, else one unlabelled group. nodes: [{id, name, x, y, requiredLevel?}];
 * bands: [{y, text}] from tierBands(). Groups run top to bottom; rows inside run by position, then name.
 */
export function prereqGroups(nodes = [], bands = []) {
  const sorted = [...bands].filter(b => Number.isFinite(b?.y)).sort((a, b) => a.y - b.y);
  const groupOf = n => {
    if (Number.isSafeInteger(n.requiredLevel)) return {key: `level:${n.requiredLevel}`, label: `Level ${n.requiredLevel}`, order: n.requiredLevel};
    if (!sorted.length) return {key: 'all', label: '', order: 0};
    const band = [...sorted].reverse().find(b => (Number(n.y) || 0) >= b.y);
    return band ? {key: `band:${band.y}`, label: band.text, order: band.y} : {key: 'band:top', label: 'Above the first band', order: -1};
  };
  const groups = new Map();
  for (const n of nodes) {
    const g = groupOf(n);
    if (!groups.has(g.key)) groups.set(g.key, {label: g.label, order: g.order, nodes: []});
    groups.get(g.key).nodes.push(n);
  }
  const byPos = (a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0) || String(a.name ?? '').localeCompare(String(b.name ?? ''));
  return [...groups.values()].sort((a, b) => a.order - b.order).map(g => ({label: g.label, nodes: g.nodes.sort(byPos)}));
}
