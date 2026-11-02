/**
 * Pop-out window memory for the player dock (Manager 0.101.0). When the dock opens a sidebar tab as a pop-out window (today the
 * combat tracker; any tab the dock pops out goes through the same code), the window used to come back at Foundry's default
 * spot. This remembers where the player left it: left, top, width and height, per user and per browser, in localStorage
 * (client state only: no world setting, flag or document is written, and no other user or browser is affected). One key per
 * tab: `agm-dock-window:<userId>:<tabId>`.
 *
 * Capture (no monkey patching): Foundry V14 (14.367 source, as understood; not confirmed in a live world) keeps an
 * ApplicationV2's geometry in `app.position` ({left, top, width, height, ...}; height may be "auto") and moves/resizes through
 * `app.setPosition()`. There is no "moved" hook, so while a tracked pop-out is open a `pointerup` (the end of a drag or resize
 * on the window frame) and a ResizeObserver on its element schedule one debounced capture; the dock's second press and the
 * `close<Class>` hooks capture once more at close, from `app.position`, so a window whose element is already gone is still
 * saved. A capture that equals what is stored writes nothing. Foundry itself does not persist pop-out geometry for this.
 *
 * Restore: after the dock has rendered the pop-out, the saved rectangle is clamped into the current viewport (the window is
 * never wider or taller than the viewport, never smaller than a minimum, and always fully on screen) and applied with
 * `setPosition`. With no saved value, or a corrupt one, nothing is changed. Every Foundry call is feature-detected and wrapped;
 * nothing here throws.
 */
export const KEY_PREFIX = 'agm-dock-window:';
export const MIN_WIDTH = 240;
export const MIN_HEIGHT = 160;
export const SAVE_DELAY_MS = 400;

const num = v => typeof v === 'number' && Number.isFinite(v);
const keyFor = (userId, tabId) => `${KEY_PREFIX}${userId ?? ''}:${tabId}`;

/** A stored/captured rectangle, or null when it has no usable left and top. width/height are kept only when finite and positive. */
export function cleanRect(raw) {
  if (!raw || typeof raw !== 'object' || !num(raw.left) || !num(raw.top)) return null;
  const out = { left: Math.round(raw.left), top: Math.round(raw.top) };
  if (num(raw.width) && raw.width > 0) out.width = Math.round(raw.width);
  if (num(raw.height) && raw.height > 0) out.height = Math.round(raw.height);
  return out;
}

/** Fits a rectangle into the viewport: size between the minimum and the viewport, then moved so every edge is on screen. */
export function clampRect(rect, viewport) {
  const r = cleanRect(rect);
  const vw = viewport?.width, vh = viewport?.height;
  if (!r || !num(vw) || !num(vh) || vw <= 0 || vh <= 0) return null;
  const out = {};
  const w = r.width === undefined ? undefined : Math.min(Math.max(r.width, Math.min(MIN_WIDTH, vw)), vw);
  const h = r.height === undefined ? undefined : Math.min(Math.max(r.height, Math.min(MIN_HEIGHT, vh)), vh);
  // An unknown size still has to leave a visible area, so it is assumed to be the minimum when pulling the corner in.
  out.left = Math.min(Math.max(r.left, 0), Math.max(0, vw - (w ?? Math.min(MIN_WIDTH, vw))));
  out.top = Math.min(Math.max(r.top, 0), Math.max(0, vh - (h ?? Math.min(MIN_HEIGHT, vh))));
  if (w !== undefined) out.width = w;
  if (h !== undefined) out.height = h;
  return out;
}

export function readRect(storage, userId, tabId) {
  try {
    const text = storage?.getItem?.(keyFor(userId, tabId));
    return text ? cleanRect(JSON.parse(text)) : null;
  } catch { return null; }
}
/** Returns true only when something was written (an equal value is not rewritten). */
export function writeRect(storage, userId, tabId, rect) {
  try {
    const clean = cleanRect(rect);
    if (!clean || !storage?.setItem) return false;
    const text = JSON.stringify(clean);
    if (storage.getItem?.(keyFor(userId, tabId)) === text) return false;
    storage.setItem(keyFor(userId, tabId), text);
    return true;
  } catch { return false; }
}

/**
 * The memory the dock shares. getUserId is read each time (the user may not exist yet at load). win is the browser window
 * (innerWidth/innerHeight), doc its document; both optional so a missing piece only skips that part.
 */
export function createPopoutPositions({ storage, getUserId = () => null, win = globalThis.window, doc = globalThis.document, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = id => clearTimeout(id) } = {}) {
  const tracked = new Map(); // tabId -> { app, timer, stop }
  const viewport = () => ({ width: win?.innerWidth, height: win?.innerHeight });
  const popoutOf = (tabId, ui, result) => { try { return result?.setPosition ? result : (ui?.[tabId]?.popout ?? null); } catch { return null; } };

  function capture(tabId) {
    try {
      const t = tracked.get(tabId);
      return t ? writeRect(storage, getUserId(), tabId, t.app?.position) : false;
    } catch { return false; }
  }
  function schedule(tabId) {
    try {
      const t = tracked.get(tabId);
      if (!t) return;
      if (t.timer !== undefined) clearTimer(t.timer);
      t.timer = setTimer(() => { t.timer = undefined; capture(tabId); }, SAVE_DELAY_MS);
    } catch { /* the position is captured at close anyway */ }
  }
  function untrack(tabId) {
    const t = tracked.get(tabId);
    if (!t) return;
    if (t.timer !== undefined) { try { clearTimer(t.timer); } catch { /* ignore */ } }
    try { t.stop?.(); } catch { /* ignore */ }
    tracked.delete(tabId);
  }
  /** Closing (dock second press, or a close hook): save once, then stop watching. */
  function release(tabId) { capture(tabId); untrack(tabId); }

  function watch(tabId, app) {
    untrack(tabId);
    const t = { app, timer: undefined, stop: null };
    tracked.set(tabId, t);
    const onUp = () => schedule(tabId);
    const stops = [];
    try { doc?.addEventListener?.('pointerup', onUp, true); stops.push(() => doc?.removeEventListener?.('pointerup', onUp, true)); } catch { /* optional */ }
    try {
      const el = app?.element;
      const RO = globalThis.ResizeObserver;
      if (el && typeof RO === 'function') { const ro = new RO(onUp); ro.observe(el); stops.push(() => ro.disconnect()); }
    } catch { /* optional */ }
    t.stop = () => { for (const s of stops) { try { s(); } catch { /* ignore */ } } };
  }

  /** Applies the saved rectangle (clamped) to a rendered pop-out. Returns the rectangle applied, or null. */
  function restore(tabId, app) {
    try {
      const saved = readRect(storage, getUserId(), tabId);
      const fit = saved && clampRect(saved, viewport());
      if (!fit || typeof app?.setPosition !== 'function') return null;
      app.setPosition(fit);
      return fit;
    } catch { return null; }
  }

  /**
   * Called by openSidebarTab right after `renderPopout()` ran. `result` is what renderPopout returned (a promise or the app).
   * Restores once the window has rendered, then starts watching it. Never throws.
   */
  function attach(tabId, { ui, result } = {}) {
    try {
      Promise.resolve(result).then(
        value => { const app = popoutOf(tabId, ui, value); if (!app) return; restore(tabId, app); watch(tabId, app); },
        () => { /* the dock reports a failed open itself */ }
      ).catch(() => {});
    } catch { /* fail soft */ }
  }

  /** A `close<Class>` hook fired for `app`: save and stop for whichever tab it belongs to. */
  function onClosed(app) {
    try { for (const [tabId, t] of [...tracked]) if (t.app === app) release(tabId); } catch { /* fail soft */ }
  }
  function clear(tabIds) {
    try { for (const id of tabIds ?? []) storage?.removeItem?.(keyFor(getUserId(), id)); } catch { /* nothing to clear */ }
  }
  return { attach, restore, watch, capture, release, onClosed, clear, isTracking: tabId => tracked.has(tabId) };
}
