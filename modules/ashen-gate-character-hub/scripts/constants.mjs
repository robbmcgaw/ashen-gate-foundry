export const MODULE_ID = 'ashen-gate-character-hub';
export const VERSION = '0.28.0';
export const SHEET_LABEL = 'Ashen Gate Character Hub';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
/** +3 / −1 style modifier text. */
export const signed = n => { const v = Number(n) || 0; return v >= 0 ? `+${v}` : `−${Math.abs(v)}`; };
export const num = (v, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
/** CONFIG.DND5E, or {} when the system is not loaded (tests, other systems). */
export const dnd5eConfig = () => globalThis.CONFIG?.DND5E ?? {};
export const labelOf = entry => typeof entry === 'string' ? entry : entry?.label ?? '';

/** Window background opacity: a per-user client setting, 20-100 % (100 = opaque). Only backgrounds use it. */
export const OPACITY_MIN = 20;
export const clampOpacity = v => { const n = Math.round(Number(v)); return Number.isFinite(n) && v !== null && v !== '' ? Math.min(100, Math.max(OPACITY_MIN, n)) : 100; };
export function windowOpacity() { try { return clampOpacity(globalThis.game?.settings?.get?.(MODULE_ID, 'windowOpacity')); } catch { return 100; } }

/**
 * Empty equipment-slot placeholders, one line per slot. Each value is one of:
 *   - a Font Awesome class, e.g. 'fa-solid fa-ring'
 *   - an image path, e.g. 'icons/equipment/finger/ring-band-gold.webp' (Foundry's core icon library; browse it in the
 *     Forge file picker) or any other image URL
 *   - plain text, shown as a short word (used where no icon fits)
 * A white silhouette (a file named *-white.png / .webp / .svg, like the ones in assets/slots/) is drawn as a mask in the
 * theme's muted colour, so it shows the same faint way as the Font Awesome icons in dark and light skins.
 * To change a placeholder, edit its line here.
 */
export const SLOT_PLACEHOLDERS = {
  head: 'fa-solid fa-hat-wizard',
  neck: 'fa-solid fa-gem',
  back: 'modules/ashen-gate-character-hub/assets/slots/cloak-white.png',
  body: 'fa-solid fa-shirt',
  hands: 'fa-solid fa-mitten',
  mainhand: 'fa-solid fa-khanda',
  offhand: 'fa-solid fa-shield-halved',
  waist: 'modules/ashen-gate-character-hub/assets/slots/waist-white.png',
  feet: 'fa-solid fa-shoe-prints',
  bracer: 'modules/ashen-gate-character-hub/assets/slots/bracers-white.png',
  ring1: 'fa-solid fa-ring',
  ring2: 'fa-solid fa-ring',
  trinket: 'fa-solid fa-feather',
  trinket2: 'fa-solid fa-feather',
  trinket3: 'fa-solid fa-feather'
};
/** How a placeholder value is drawn: 'icon' (Font Awesome), 'image' (path or URL) or 'text'. */
export function placeholderKind(value) {
  const v = String(value ?? '').trim();
  if (/(^|\s)fa-/.test(v)) return 'icon';
  if (/-white\.(png|webp|svg)$/i.test(v)) return 'silhouette';
  if (/\/|\.(webp|png|jpe?g|svg|gif|avif)$/i.test(v)) return 'image';
  return 'text';
}

/** Inventory banner (display only): shown when the character owns any item with "diamond" in its name, or not. */
export const DIAMOND_PRESENT = 'Your soul may be returned';
export const DIAMOND_ABSENT = 'You do not possess a resurrection diamond';
