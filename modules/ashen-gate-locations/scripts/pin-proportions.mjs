/**
 * 0.27.0: "Keep pin art proportions" (per location, GM-side presentation; see pin-look.mjs for the hook).
 *
 * Foundry V14 (14.367, client/canvas/containers/elements/control-icon.mjs): a Note's ControlIcon draws bg, icon and border as a
 * SQUARE of `size` (= document.iconSize) in `_refresh()`, sets `pivot` to (size/2, size/2) so the square is centred on the Note,
 * and sizes `hitArea` (a PIXI.Rectangle that receives clicks, hover and drag) to the same square. `_refresh()` runs on the
 * ControlIcon's own render flags (a different tick from the Note's `refreshNote` hook) and again after every texture redraw.
 * So this module wraps the ControlIcon instance's `_refresh`: core draws the square first, then {@link relayoutControlIcon}
 * redraws the three children and the hit area as a rectangle. With the toggle off nothing here runs and core's square is untouched.
 *
 * Everything here is feature-detected and wrapped; a missing field in another build leaves core's square.
 */

/** The widest or tallest the frame may get: 4 x the pin size (aspect 4:1 or 1:4). A more extreme image is fitted inside that
 *  frame, not stretched, so it stays undistorted but is drawn smaller than the frame. */
export const ASPECT_CAP = 4;
const STATE = Symbol.for('ashen-gate-locations.pinProportions');

const num = v => (Number.isFinite(v) && v > 0 ? v : 0);

/**
 * Pure layout maths. `size` is the pin Size (the frame height); `texW`/`texH` the image's natural size; `uiScale` is
 * canvas.dimensions.uiScale (only used for the corner radius and line width, as core does). Returns null when the inputs are not
 * usable (the caller then keeps core's square).
 *   frame:  {w, h}        the rounded rectangle for bg and border (h = size; w = size x aspect, aspect clamped to 1/4 .. 4)
 *   sprite: {x, y, w, h}  the image, fitted inside the frame at its true aspect and centred in it (no distortion)
 *   pivot:  {x, y}        the ControlIcon pivot, so the frame is centred on the Note's position exactly as core centres the square
 *   hit:    {x, y, w, h}  the click/hover/drag rectangle (same as the frame)
 *   halfW/halfH           half the frame's extent, for the label offset
 */
export function proportionalLayout({size, texW, texH, uiScale = 1} = {}) {
  const h = num(size), tw = num(texW), th = num(texH);
  if (!h || !tw || !th) return null;
  const aspect = tw / th;
  const clamped = Math.min(ASPECT_CAP, Math.max(1 / ASPECT_CAP, aspect));
  const w = h * clamped;
  // Fit the image inside the frame at its own aspect: equal to the frame unless the cap applied.
  const sw = aspect >= clamped ? w : h * aspect, sh = aspect >= clamped ? w / aspect : h;
  const s = num(uiScale) || 1;
  return {
    aspect, clamped, capped: clamped !== aspect, thickness: 2 * s, radius: 5 * s,
    frame: {w, h}, sprite: {x: (w - sw) / 2, y: (h - sh) / 2, w: sw, h: sh},
    pivot: {x: w / 2, y: h / 2}, hit: {x: 0, y: 0, w, h}, halfW: w / 2, halfH: h / 2
  };
}

/** The image's natural size, or null if the texture is not loaded (or is PIXI's empty placeholder). */
export function textureSize(tex, empty = globalThis.PIXI?.Texture?.EMPTY) {
  try {
    if (!tex || tex === empty) return null;
    const base = tex.baseTexture ?? tex.source;
    if (base && base.valid === false) return null;
    const o = tex.orig ?? tex.frame ?? tex;
    const w = num(o?.width) || num(base?.realWidth) || num(base?.width);
    const h = num(o?.height) || num(base?.realHeight) || num(base?.height);
    return w && h ? {w, h} : null;
  } catch { return null; }
}

/**
 * Draws the ControlIcon (bg, icon, border, hit area, pivot, elevation tooltip) as the rectangle in `layout`. Draws from scratch, so
 * it does not matter what core drew before. Returns true when it drew. Never throws.
 */
export function drawLayout(icon, layout) {
  try {
    const P = globalThis.PIXI;
    if (!icon || !layout || !P) return false;
    const {frame: f, sprite: s} = layout;
    const rect = new P.RoundedRectangle(0, 0, f.w, f.h, layout.radius);
    icon.pivot?.set?.(layout.pivot.x, layout.pivot.y);
    if (icon.bg?.clear) { icon.bg.clear(); icon.bg.beginFill(0xFFFFFF); icon.bg.drawShape(rect); icon.bg.endFill(); }
    if (icon.icon) {
      icon.icon.position?.set?.(s.x, s.y);
      icon.icon.width = s.w; icon.icon.height = s.h;
    }
    if (icon.border?.clear) {
      icon.border.clear();
      icon.border.lineStyle({width: layout.thickness, color: 0x000000, alignment: 0.75});
      icon.border.drawShape(rect);
      icon.border.lineStyle({width: layout.thickness / 2, color: 0xFFFFFF, alignment: 1});
      icon.border.drawShape(rect);
    }
    if (icon.tooltip?.position?.set) icon.tooltip.position.set(f.w / 2, icon.tooltip.position.y); // elevation text: centred over the wider frame
    const hit = layout.hit;
    if (icon.hitArea && 'width' in icon.hitArea) { icon.hitArea.x = hit.x; icon.hitArea.y = hit.y; icon.hitArea.width = hit.w; icon.hitArea.height = hit.h; }
    else if (P.Rectangle) icon.hitArea = new P.Rectangle(hit.x, hit.y, hit.w, hit.h);
    return true;
  } catch { return false; }
}

/** What the last relayout produced for this icon (for the label offset), or null while the icon is square. */
export const layoutOf = icon => icon?.[STATE]?.layout ?? null;

/**
 * Re-draws `icon` (a ControlIcon) as a rectangle, if its state says keep = true and its texture is loaded. If the texture is not
 * loaded yet, waits for it (once) and tries again; if it fails to load, the square stays. Returns the layout used, or null.
 * @param {object} opts {size, uiScale} override what the icon / canvas report (tests)
 */
export function relayoutControlIcon(icon, opts = {}) {
  const st = icon?.[STATE];
  if (!st) return null;
  st.layout = null;
  if (!st.keep) return null;
  const tex = icon.icon?.texture;
  const dims = textureSize(tex);
  if (!dims) { waitForTexture(icon, tex); return null; }
  const layout = proportionalLayout({
    size: opts.size ?? icon.size, texW: dims.w, texH: dims.h,
    uiScale: opts.uiScale ?? globalThis.canvas?.dimensions?.uiScale ?? 1
  });
  if (!layout || !drawLayout(icon, layout)) return null;
  st.layout = layout;
  return layout;
}

/** Re-applies once when a not-yet-loaded texture becomes valid. A texture that errors is left as core's square (nothing to do). */
function waitForTexture(icon, tex) {
  const st = icon[STATE];
  const base = tex?.baseTexture;
  if (!st || !base || tex === globalThis.PIXI?.Texture?.EMPTY || typeof base.once !== 'function' || st.waiting === base) return;
  st.waiting = base;
  const done = () => {
    if (st.waiting !== base) return;
    st.waiting = null;
    try { if (icon.destroyed || icon._destroyed) return; if (icon.icon?.texture === tex) relayoutControlIcon(icon); st.onChange?.(); } catch { /* keep the square */ }
  };
  base.once('loaded', done);
  base.once('error', () => { if (st.waiting === base) st.waiting = null; });
}

/**
 * Turns the behaviour on or off for one ControlIcon. Installs (once) a wrapper around the instance's `_refresh` so the rectangle is
 * redrawn right after every core refresh. Turning it off asks core for a normal refresh, which puts the square back (core resets
 * pivot, bg, icon size and hit area itself; only the sprite offset is ours to clear). Returns true when the state changed. `onChange` runs after a late texture load redraws the icon.
 */
export function setKeepProportions(icon, keep, onChange) {
  if (!icon || typeof icon._refresh !== 'function') return false;
  keep = keep === true;
  let st = icon[STATE];
  if (!st) {
    if (!keep) return false;                       // never touch an icon that was never switched on
    st = icon[STATE] = {keep: false, layout: null, waiting: null, original: icon._refresh};
    icon._refresh = function ag_refresh(...args) {
      const out = st.original.apply(this, args);
      try { if (st.keep) relayoutControlIcon(this); } catch { /* keep core's square */ }
      return out;
    };
  }
  st.onChange = onChange;
  if (st.keep === keep) return false;
  st.keep = keep;
  if (keep) relayoutControlIcon(icon);
  else {
    st.layout = null;
    try { icon.icon?.position?.set?.(0, 0); } catch { /* ignore */ }
    try { icon.refresh?.(); } catch { /* ignore */ }
  }
  return true;
}
