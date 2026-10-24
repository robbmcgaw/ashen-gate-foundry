/** Window layout state and the corner-tooltip content. Pure; the app wires these to the DOM. */
export const NARROW_WIDTH = 760;
export const isNarrow = width => Number.isFinite(width) && width > 0 && width < NARROW_WIDTH;
/** First render decides by width (drawer closed when narrow); after that the user's choice wins. */
export const initialSidebar = (current, width) => typeof current === 'boolean' ? current : !isNarrow(width);
export const toggledSidebar = current => !(current !== false);

import {sanitizePerkHtml} from './perk-html.mjs';
import {PROFESSION_TIER_LEVELS} from './engine.mjs';

const shorten = (text, max = 140) => {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
};
const STATUS = {UNLOCKED: 'Unlocked', AVAILABLE: 'Available', LOCKED: 'Locked'};
const list = (names, word = 'or') => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} ${word} ${names.at(-1)}`;

/**
 * The prerequisite sentence for a node (rel from relationsOf: {all, any:[{nodes}], excludes}). Required perks and OR groups
 * read as one line: "Requires A and one of B or C"; a crossroads with two groups reads "Requires one of A or B, and one of C or D".
 * Rivals are not part of it (see rivalLine).
 */
export function requirementText(rel = {}) {
  const parts = [...(rel.all ?? []).map(x => x.name),
    ...(rel.any ?? []).filter(g => g.nodes?.length).map(g => g.nodes.length === 1 ? g.nodes[0].name : `one of ${list(g.nodes.map(x => x.name))}`)];
  if (!parts.length) return '';
  const ors = parts.filter(p => p.startsWith('one of ')).length;
  return `Requires ${parts.length < 2 ? parts[0] : ors > 1 ? `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}` : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`}`;
}
/** "Choose one: X or Y" for a node that has rivals (excludes in either direction); '' otherwise. */
export const rivalLine = (name, rel = {}) => (rel.excludes ?? []).length ? `Choose one: ${list([name, ...rel.excludes.map(x => x.name)])}` : '';
/** The text read for a node: requirement, then the rival line. */
export const relationSentence = (name, rel) => [requirementText(rel), rivalLine(name, rel)].filter(Boolean).join('. ');
/** A node with two or more OR groups joins specialties (a crossroads). */
export const isCrossroads = node => (node?.requiresAny ?? []).filter(g => g?.length).length >= 2;
export const isRival = (node, rel) => (rel?.excludes ?? []).length > 0 || (node?.excludes ?? []).length > 0;

const TIER_BY_LEVEL = Object.fromEntries(Object.entries(PROFESSION_TIER_LEVELS).map(([name, level]) => [level, name[0].toUpperCase() + name.slice(1)]));
/** "Expert (level 7)" for a profession perk, "Level 3" for a node with only a level, '' otherwise. */
export function tierText(node) {
  const level = Number.isSafeInteger(node?.requiredLevel) ? node.requiredLevel : null;
  const given = String(node?.perkTier ?? '').trim();
  const name = given ? given[0].toUpperCase() + given.slice(1).toLowerCase() : level != null ? TIER_BY_LEVEL[level] ?? '' : '';
  if (name && level != null) return `${name} (level ${level})`;
  return name || (level != null ? `Level ${level}` : '');
}

/**
 * Tooltip card for a node as the canvas shows it (already projected for the viewer): name, tier and level, point cost,
 * the perk's description (sanitised markup, else plain text), requirement and rival lines, and Locked / Available / Unlocked.
 * actions: which controls the card may offer for a pinned node: learn 'purchase' (GM) or 'request' (player), refund (GM).
 */
export function tooltipModel(node) {
  if (!node) return null;
  const status = STATUS[node.flag] ?? (node.unlocked ? 'Unlocked' : node.eligible ? 'Available' : 'Locked');
  const cost = node.silhouette ? null : (node.cost ?? 1);
  const name = node.name || 'Unnamed';
  const html = node.silhouette ? '' : sanitizePerkHtml(node.descriptionHtml);
  const rel = node.rel ?? {};
  return {id: node.id, name, status, statusKey: status.toLowerCase(),
    cost, costText: cost == null ? '' : `${cost} point${cost === 1 ? '' : 's'}`,
    tier: node.silhouette ? '' : tierText(node),
    text: node.silhouette ? '' : shorten(node.description),
    html, fullText: node.silhouette || html ? '' : shorten(node.description, 1500),
    kind: node.silhouette ? '' : node.crossroads ? 'crossroads' : node.rival ? 'rival' : '',
    prerequisites: node.silhouette ? '' : (node.rel ? requirementText(rel) : node.relText ?? ''),
    rival: node.silhouette ? '' : rivalLine(name, rel),
    reason: status === 'Locked' ? String(node.reason ?? '') : '',
    canOpen: !node.silhouette && Boolean(node.perkId || node.unlocked), // players hold no world id: they open the copy on their sheet once learned
    actions: node.actions ?? {learn: null, refund: false}};
}

/** Default zoom (0.23.0): the whole width of a tree fits the viewport; never above 100% or below 25%. Tall trees scroll. */
export const MIN_ZOOM = .25, MAX_ZOOM = 1.6;
export function fitZoom(viewWidth, mapWidth) {
  if (!(viewWidth > 0) || !(mapWidth > 0)) return 1;
  return Math.min(1, Math.max(MIN_ZOOM, Math.floor((viewWidth - 2) / mapWidth * 100) / 100));
}

/**
 * Specialty / branch labels (0.23.0): one per distinct node lane, centred over the lane's nodes and sitting above its top row.
 * nodes: [{lane, x, y}]; w, h: the node footprint. Returns [{text, x, y}] with x the centre, in board px.
 */
export function laneLabels(nodes = [], {w = 0, h = 0} = {}) {
  const lanes = new Map();
  for (const n of nodes) {
    const name = typeof n?.lane === 'string' ? n.lane.trim() : '';
    if (!name || n.silhouette || !Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
    const l = lanes.get(name) ?? {text: name, left: Infinity, right: -Infinity, top: Infinity};
    l.left = Math.min(l.left, n.x); l.right = Math.max(l.right, n.x + w); l.top = Math.min(l.top, n.y);
    lanes.set(name, l);
  }
  return [...lanes.values()].map(l => ({text: l.text, x: Math.round((l.left + l.right) / 2), y: Math.max(4, Math.round(l.top + h / 2 - 52)), span: Math.round(l.right - l.left)}))
    .sort((a, b) => a.y - b.y || a.x - b.x);
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
