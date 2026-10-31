/**
 * Corner tooltip behaviour for the tree canvas (0.24.3). Pure of Foundry: the app hands in the board element, a show(id|null)
 * that fills or hides the card, and pinned() for the node the GM / player pinned on purpose (right-click, Menu key, Shift+Enter).
 *
 * What the card shows, in order: the node under the pointer, else the node with keyboard focus, else the pinned node, else nothing.
 * Click-focus does not count (only :focus-visible), so a node you clicked does not keep the card up after the pointer leaves.
 * Hides on pointer leave (including to empty space and out of the canvas), blur, Escape, scroll, pan, drag start, tap elsewhere
 * (touch/pen: a tap shows it, it stays until a tap elsewhere), re-render and close.
 */
const NODE = '.agst-node';
const idOf = el => el?.closest?.(NODE)?.dataset?.id ?? null;
const keyboardFocus = el => { try { return el?.matches?.(':focus-visible') !== false; } catch { return true; } };

export function bindNodeTip(board, {show, pinned = () => null, unpin = () => {}, root = board, signal} = {}) {
  let hover = null, focus = null, pointerKind = 'mouse';
  const rest = () => hover ?? focus ?? pinned() ?? null;
  const paint = () => show(rest());
  const opts = signal ? {signal} : undefined;
  const on = (target, type, fn, extra) => target.addEventListener(type, fn, {...opts, ...extra});

  on(board, 'pointerover', e => { pointerKind = e.pointerType || 'mouse'; const id = idOf(e.target); if (id) { hover = id; paint(); } });
  on(board, 'pointerout', e => {
    if ((e.pointerType || pointerKind) !== 'mouse') return; // touch / pen: stays until a tap elsewhere
    const id = idOf(e.target); if (!id) return;
    if (idOf(e.relatedTarget) === id) return; // moving between parts of the same node
    hover = null; paint();
  });
  on(board, 'pointerleave', () => { if (pointerKind !== 'mouse') return; hover = null; paint(); });
  on(board, 'focusin', e => { const id = idOf(e.target); if (id && keyboardFocus(e.target)) { focus = id; paint(); } });
  on(board, 'focusout', e => { if (idOf(e.target)) { focus = null; paint(); } });
  // A tap or click anywhere that is not a node or the card dismisses the hover/touch preview (and starts a pan).
  on(root, 'pointerdown', e => { if (!idOf(e.target) && !e.target?.closest?.('.agst-tip')) { hover = null; paint(); } });
  on(root, 'scroll', () => { if (hover) { hover = null; paint(); } }, {capture: true});
  on(board, 'dragstart', () => dismiss());
  on(root, 'wheel', () => { if (hover) { hover = null; paint(); } }, {passive: true});

  /** Hide every transient preview. Returns true when a card was showing. */
  function dismiss({pin = false} = {}) {
    const was = rest() != null;
    hover = null; focus = null; if (pin) unpin(); paint();
    return was;
  }
  // Escape closes the card first (before Foundry's own Escape handling closes the window).
  on(root, 'keydown', e => {
    if (e.key !== 'Escape') return;
    if (!rest()) return;
    e.stopPropagation(); dismiss({pin: true});
  });
  return {
    dismiss, refresh: paint, state: () => ({hover, focus}),
  };
}
