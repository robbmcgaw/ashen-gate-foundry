export const MODULE_ID = 'ashen-gate-character-hub';
export const VERSION = '0.56.1';
export const SHEET_LABEL = 'Ashen Gate Character Hub';
/** The window title (0.37.0): the brand, in place of Foundry's "<Actor type>: <name>"; the name is the in-sheet heading. */
export const HUB_TITLE = 'Ashen Gate | Character Hub';
/**
 * The window title for one character (0.37.1): "Ashen Gate | Character Hub — <name>", so several open, minimised or
 * popped-out Hubs can be told apart. Plain text (Foundry sets it as text); a blank name leaves the brand alone.
 */
export const hubTitle = name => { const n = String(name ?? '').replace(/\s+/g, ' ').trim(); return n ? `${HUB_TITLE} — ${n}` : HUB_TITLE; };

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
/** +3 / −1 style modifier text. */
export const signed = n => { const v = Number(n) || 0; return v >= 0 ? `+${v}` : `−${Math.abs(v)}`; };
export const num = (v, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
/** CONFIG.DND5E, or {} when the system is not loaded (tests, other systems). */
export const dnd5eConfig = () => globalThis.CONFIG?.DND5E ?? {};
export const labelOf = entry => typeof entry === 'string' ? entry : entry?.label ?? '';

/**
 * Compact mode (0.29.0): a per-user client setting. When on, a Hub opens showing only the character art with its slots,
 * HP and the quick bar, in a narrow window. 0.29.0 also removed the window opacity slider; an old saved `windowOpacity`
 * value is simply never read again (the setting is no longer registered), so it can't change or break anything.
 */
export const COMPACT_SETTING = 'compactMode';
export function compactPreference() { try { return globalThis.game?.settings?.get?.(MODULE_ID, COMPACT_SETTING) === true; } catch { return false; } }

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
/**
 * A module or core asset path as a URL that works anywhere it is used, including inside an inline CSS custom property
 * (a relative url() there is resolved against the stylesheet, not the page). Relative paths go through Foundry's
 * getRoute (leading slash, route prefix / The Forge); without Foundry (tests) they just get a leading slash. Absolute
 * paths, data:/blob: URLs and full URLs are returned unchanged.
 */
export function assetUrl(path) {
  const v = String(path ?? '').trim();
  if (!v || v.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(v)) return v;
  const route = globalThis.foundry?.utils?.getRoute;
  if (typeof route === 'function') { try { const r = route(v); if (typeof r === 'string' && r) return r; } catch { /* fall through */ } }
  return `/${v}`;
}
/** How a placeholder value is drawn: 'icon' (Font Awesome), 'image' (path or URL) or 'text'. */
export function placeholderKind(value) {
  const v = String(value ?? '').trim();
  if (/(^|\s)fa-/.test(v)) return 'icon';
  if (/-white\.(png|webp|svg)$/i.test(v)) return 'silhouette';
  if (/\/|\.(webp|png|jpe?g|svg|gif|avif)$/i.test(v)) return 'image';
  return 'text';
}

/** Title bar notice (display only, 0.54.1; Inventory banner before): shown when the character owns any item with "diamond" in its name, or not. */
export const DIAMOND_PRESENT = 'Your soul may be returned';
export const DIAMOND_ABSENT = 'You do not possess a resurrection diamond';
