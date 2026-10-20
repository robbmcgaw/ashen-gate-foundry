export const MODULE_ID = 'ashen-gate-character-hub';
export const VERSION = '0.5.0';
export const SHEET_LABEL = 'Ashen Gate Character Hub';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
/** +3 / −1 style modifier text. */
export const signed = n => { const v = Number(n) || 0; return v >= 0 ? `+${v}` : `−${Math.abs(v)}`; };
export const num = (v, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
/** CONFIG.DND5E, or {} when the system is not loaded (tests, other systems). */
export const dnd5eConfig = () => globalThis.CONFIG?.DND5E ?? {};
export const labelOf = entry => typeof entry === 'string' ? entry : entry?.label ?? '';
