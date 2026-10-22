/**
 * Popovers stay inside the Hub (0.34.0). The Filters popover opened to the right of its button and ran past the window
 * edge. It now opens aligned to the button's right edge (CSS) and, after each draw, is moved sideways just enough to
 * stay inside the area that would clip it: the scrolling list it sits in, else the Hub. The same goes for the header's
 * "⋯" and Appearance menus. Works in Full, Compact and a popped-out Hub (only element rectangles are read).
 */

/** Popovers placed this way. Slot menus and the HP editor have their own positions. */
export const PLACED = '.agch-filtermenu, .agch-moremenu, .agch-lookmenu';

/**
 * Horizontal shift in px that brings `rect` inside `bounds` (both {left, right}) with `pad` px to spare. A box wider than
 * the room is pinned to the left edge (its own max-width keeps it inside there).
 */
export function clampShift(rect, bounds, pad = 4) {
  const left = Number(rect?.left), right = Number(rect?.right), bl = Number(bounds?.left), br = Number(bounds?.right);
  if (![left, right, bl, br].every(Number.isFinite)) return 0;
  if (right - left >= br - bl - pad * 2 || left < bl + pad) return bl + pad - left;
  if (right > br - pad) return br - pad - right;
  return 0;
}

/** The area that clips a popover: the scrolling tab list it is in, else the Hub root, else the window content. */
export const boundsOf = (pop, content) => pop?.closest?.('.agch-body') ?? pop?.closest?.('.agch-root') ?? content ?? null;

/** Moves one popover inside its bounds (CSS variable --agch-pop-shift). Returns the shift used. */
export function keepInside(pop, bounds) {
  if (!pop?.style || typeof pop.getBoundingClientRect !== 'function' || typeof bounds?.getBoundingClientRect !== 'function') return 0;
  pop.style.removeProperty?.('--agch-pop-shift');
  const shift = Math.round(clampShift(pop.getBoundingClientRect(), bounds.getBoundingClientRect()));
  if (shift) pop.style.setProperty?.('--agch-pop-shift', `${shift}px`);
  return shift;
}

/** After a draw: every open placed popover in the content is kept inside. */
export function placePopovers(content) {
  for (const pop of content?.querySelectorAll?.(PLACED) ?? []) keepInside(pop, boundsOf(pop, content));
}
