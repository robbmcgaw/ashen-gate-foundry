/**
 * Ashen Gate shared HTML helpers (ag-html.mjs, UI kit 2).
 * Every module that ships this file ships an identical copy; scripts/check.mjs fails if the copies drift.
 */

/** Window size scale for html[data-ag-size="comfortable"] (General Manager → My Appearance → Size). */
export const COMFORTABLE_SCALE = 1.2;

/**
 * Default window size for the current kit size set: {width, height} scaled by 1.2 when the
 * document is set to Comfortable, otherwise unchanged. Never larger than the viewport.
 * Reads the attribute when called, so call it when the window is created, not at import time.
 */
export function windowSize({width, height} = {}, {doc = globalThis.document, view = globalThis} = {}) {
  const scale = doc?.documentElement?.dataset?.agSize === 'comfortable' ? COMFORTABLE_SCALE : 1;
  const fit = (value, max) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return value;
    const scaled = Math.round(value * scale);
    return typeof max === 'number' && max > 0 ? Math.min(scaled, Math.floor(max)) : scaled;
  };
  return {width: fit(width, view?.innerWidth), height: fit(height, view?.innerHeight)};
}
