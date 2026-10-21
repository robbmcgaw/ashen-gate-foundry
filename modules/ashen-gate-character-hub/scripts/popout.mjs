/**
 * Pop out (0.29.0): Foundry V14's own ApplicationV2 detach. detachWindow() moves the Hub into a separate browser window,
 * attachWindow() brings it back; Foundry carries the app, its stylesheets and its children. Nothing custom: when the
 * running Foundry has no detachWindow (or _canDetach() says no), the button is simply not shown.
 */
const MAIN = () => globalThis.document;

/** The Hub lives in another browser window (its element belongs to a document other than the main one). */
export function isPoppedOut(sheet) {
  const doc = sheet?.element?.ownerDocument;
  return !!doc && !!MAIN() && doc !== MAIN();
}
/** Foundry offers detaching for this window, or it is already out (so it can come back). */
export function canPopOut(sheet) {
  if (isPoppedOut(sheet)) return typeof sheet.attachWindow === 'function';
  if (typeof sheet?.detachWindow !== 'function') return false;
  try { return sheet._canDetach?.() !== false; } catch { return false; }
}
/** Pop out, or back in when already out. Resolves {ok, result: 'out' | 'in'} or {ok: false, error}. */
export async function togglePopOut(sheet) {
  if (!canPopOut(sheet)) return {ok: false, error: 'This Foundry version cannot pop windows out.'};
  const out = isPoppedOut(sheet);
  await (out ? sheet.attachWindow() : sheet.detachWindow());
  return {ok: true, result: out ? 'in' : 'out'};
}
