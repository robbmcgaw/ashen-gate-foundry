/**
 * Optional see-through background for Compact mode only (0.29.0, experimental). One client setting (`compactOpacity`,
 * per user, 100 = opaque by default) and one CSS variable (--agch-compact-alpha on the window). Only the window's own
 * background (--agch-bg) fades; the HP box, equipment slots, quick bar slots, header and text keep solid backgrounds.
 * The Full Hub never sets the variable, so it stays opaque. To remove the feature: delete this file, its imports, the
 * setting registration in main.mjs and the "Compact see-through" CSS block.
 */
import {MODULE_ID, esc} from './constants.mjs';

export const COMPACT_OPACITY_SETTING = 'compactOpacity';
/** Floor: below 60 % the name and header text sitting straight on the window background lose contrast over a bright map. */
export const COMPACT_OPACITY_MIN = 60;
export const clampCompactOpacity = v => { const n = Math.round(Number(v)); return v === null || v === '' || !Number.isFinite(n) ? 100 : Math.min(100, Math.max(COMPACT_OPACITY_MIN, n)); };
export function compactOpacity() { try { return clampCompactOpacity(globalThis.game?.settings?.get?.(MODULE_ID, COMPACT_OPACITY_SETTING)); } catch { return 100; } }
export function saveCompactOpacity(value) {
  try { return globalThis.game?.settings?.set?.(MODULE_ID, COMPACT_OPACITY_SETTING, clampCompactOpacity(value)); } catch (err) { console.warn(`${MODULE_ID} | compact opacity not saved`, err); return null; }
}
/** Sets the variable while the Hub is Compact, removes it in Full. Returns the value in use (100 in Full). */
export function applyCompactOpacity(sheet, value = compactOpacity()) {
  const style = sheet?.element?.style;
  if (sheet?.compact !== true) { style?.removeProperty?.('--agch-compact-alpha'); return 100; }
  const v = clampCompactOpacity(value);
  style?.setProperty?.('--agch-compact-alpha', `${v}%`);
  return v;
}
/** The slider, shown in the Compact header only. */
export function compactOpacityHtml() {
  const tip = `Compact background opacity (only for you, experimental): ${COMPACT_OPACITY_MIN}-100 %`;
  return `<label class="agch-cfade" data-tooltip="${esc(tip)}"><i class="fa-solid fa-circle-half-stroke" aria-hidden="true"></i><input type="range" min="${COMPACT_OPACITY_MIN}" max="100" step="5" value="${compactOpacity()}" data-compact-opacity data-ag-always aria-label="${esc(tip)}"></label>`;
}
