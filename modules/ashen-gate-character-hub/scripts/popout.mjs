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

/**
 * Opens an application next to the Hub (0.44.3). A Hub in its own browser window must open its item sheets and settings
 * windows there too: a plain render() puts them in the main Foundry window, where they cannot be seen from the pop-out.
 * Foundry's renderChild() registers the app as a child that shares the Hub's window (as dnd5e's sheets do). Not popped
 * out, or no renderChild: an ordinary render, exactly as before.
 */
export async function renderBeside(sheet, app) {
  if (isPoppedOut(sheet) && typeof sheet.renderChild === 'function') return sheet.renderChild(app);
  return app.render?.({force: true}) ?? app.render?.(true);
}
