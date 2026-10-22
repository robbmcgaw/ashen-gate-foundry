/**
 * Escape closes only the Hub's own open popover (0.29.2): a slot / Other menu, the HP editor or a Journey entry being
 * edited (0.34.0: the conditions add list is gone; the quick bar drawer is not a popover, so it stays open). After a
 * mouse click focus sits on <body>, so a keydown listener on the Hub content never sees the key and Foundry's own
 * Escape closed the whole Hub. While something is open, one capture-phase listener sits on the Hub's owning document (ownerDocument, so a popped-out Hub's own window works too); it closes
 * the innermost popover and stops the event so Foundry does not also close the window. It is removed when nothing is
 * open, when the Hub moves between windows, and when it closes. Foundry dialogs (level-up, restore) handle their own.
 */

/** What Escape can close, innermost first: shown in the DOM (selector) and closable (close returns true). */
export const POPOVERS = [
  {selector: '.agch-menu', close: s => { if (!s.menu) return false; s.menu = null; return true; }},
  {selector: '[data-journey-form="edit"]', close: s => { if (!s.journeyEdit) return false; s.journeyEdit = null; return true; }}
];

const rootOf = sheet => sheet?.element ?? null;

/** The popover Escape would close now, or null. Only one that is actually drawn counts. */
export function openPopover(sheet) {
  const root = rootOf(sheet);
  if (!root?.querySelector) return null;
  return POPOVERS.find(p => root.querySelector(p.selector)) ?? null;
}

/**
 * Closes the innermost open popover and redraws. Returns true when one was closed. A key aimed at another window
 * (a Foundry dialog on top, say) is left alone.
 */
export function escapePopover(sheet, event) {
  if (event?.key !== 'Escape' || event.isComposing) return false;
  const root = rootOf(sheet), t = event.target, doc = root?.ownerDocument;
  if (t && root?.contains && !root.contains(t) && t !== doc?.body && t !== doc?.documentElement && t.closest?.('.application, .app, dialog')) return false;
  const pop = openPopover(sheet);
  if (!pop?.close(sheet)) return false;
  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
  sheet.render();
  return true;
}

/** Removes this Hub's document Escape listener, if any. */
export function unbindEscape(sheet) {
  const bound = sheet?._agchEscape;
  if (!bound) return;
  bound.doc.removeEventListener?.('keydown', bound.handler, true);
  sheet._agchEscape = null;
}

/**
 * Called after every render: one listener on the owning document while a popover is open, none otherwise. A Hub that
 * moved to another window (pop out / pop in) gets it moved to that window's document.
 */
export function syncEscape(sheet) {
  const doc = openPopover(sheet) ? rootOf(sheet)?.ownerDocument ?? null : null;
  if (sheet._agchEscape?.doc === doc && doc) return;
  unbindEscape(sheet);
  if (!doc?.addEventListener) return;
  const handler = ev => escapePopover(sheet, ev);
  doc.addEventListener('keydown', handler, true);
  sheet._agchEscape = {doc, handler};
}
