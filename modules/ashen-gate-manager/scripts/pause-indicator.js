/**
 * Compact pause (0.59.0). Mirrors Foundry's real paused state (game.paused) to html[data-ag-paused="true"] and keeps a
 * small "Paused" indicator element in the page. styles/pause.css shows it, and hides the large native banner, only while
 * the GM setting (html[data-ag-pause="compact"]) is on. Pausing itself is never touched: no hook is replaced, nothing
 * is written to the game, and the native #pause element is only hidden by CSS.
 */
export const PAUSE_PILL_ID = 'ag-pause-pill';

/** Writes or removes html[data-ag-paused]. Returns the paused boolean. */
export function mirrorPaused(root, paused) {
  const on = Boolean(paused);
  if (root?.dataset) { if (on) root.dataset.agPaused = 'true'; else delete root.dataset.agPaused; }
  return on;
}

/** Adds the indicator once (text plus a decorative pause icon). Returns the element, or null without a document. */
export function ensurePausePill(doc) {
  if (!doc?.body || typeof doc.createElement !== 'function') return null;
  const found = doc.getElementById?.(PAUSE_PILL_ID);
  if (found) return found;
  const pill = doc.createElement('div');
  pill.id = PAUSE_PILL_ID;
  pill.setAttribute?.('role', 'status');
  const icon = doc.createElement('i');
  icon.className = 'fa-solid fa-pause';
  icon.setAttribute?.('aria-hidden', 'true');
  const label = doc.createElement('span');
  label.textContent = 'Paused';
  pill.append(icon, label);
  doc.body.append(pill);
  return pill;
}

/** Mirrors game.paused now (first load, reconnect) and on every pauseGame hook. Returns a function that stops mirroring. */
export function installPauseMirror({ game, hooks, doc = globalThis.document }) {
  const root = doc?.documentElement;
  ensurePausePill(doc);
  const sync = () => mirrorPaused(root, game?.paused);
  sync();
  // pauseGame hands the new state; game.paused is the same value but is what Foundry itself reads.
  const id = hooks?.on?.('pauseGame', paused => mirrorPaused(root, typeof paused === 'boolean' ? paused : game?.paused));
  return () => { if (id !== undefined) hooks?.off?.('pauseGame', id); };
}
