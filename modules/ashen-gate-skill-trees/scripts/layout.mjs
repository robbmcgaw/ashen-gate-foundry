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
