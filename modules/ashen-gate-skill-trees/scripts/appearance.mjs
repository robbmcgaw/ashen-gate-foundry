/** Per-tree look: node size, canvas background and level/tier bands. All fields are optional and additive; no Foundry globals. */
export const NODE_SIZES = {compact: {w: 132, h: 46}, normal: {w: 181, h: 67}};
export const DEFAULT_NODE_SIZE = 'compact';
export const BG_FITS = ['cover', 'tile', 'fixed'];
export const MAX_TIERS = 40;
const IMAGE_EXT = /\.(?:png|jpe?g|webp|gif|svg|avif)$/i;
const SAFE_CHARS = /^[A-Za-z0-9 _\-.@+()/]+$/;

const FORGE_URL = /^https:\/\/((?:[a-z0-9-]+\.)+forge-vtt\.com)\/([A-Za-z0-9_\-.@+()/%]+)$/i;
/**
 * A stored image is either a plain local file path inside Foundry's data (e.g. worlds/x/map.webp) or an https
 * address on The Forge's own hosts (assets.forge-vtt.com, any *.forge-vtt.com). No other scheme or host, no "..",
 * no quotes or markup, no query or fragment. Anything else is dropped (null).
 */
export function safeImagePath(value) {
  if (typeof value !== 'string') return null;
  const p = value.trim();
  if (!p || p.length > 500) return null;
  if (p.includes('..') || p.endsWith('/') || !IMAGE_EXT.test(p)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(p) || p.startsWith('//')) {
    const m = FORGE_URL.exec(p);
    if (!m || m[2].startsWith('/') || m[2].includes('//')) return null;
    if (/%(?![0-9a-f]{2})|%(?:2e|2f|5c)/i.test(m[2])) return null;
    return p;
  }
  if (p.length > 300 || p.includes('//') || !SAFE_CHARS.test(p)) return null;
  return p;
}
/** Value for a CSS url("...") from an already-safe path (spaces are escaped). */
export const cssUrl = path => `url("${String(safeImagePath(path) ?? '').replace(/ /g, '%20')}")`;

const rangeInt = (v, lo, hi) => { if (v == null || String(v).trim() === '') return null; const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
export const nodeSizeOf = tree => Object.hasOwn(NODE_SIZES, tree?.nodeSize) ? tree.nodeSize : DEFAULT_NODE_SIZE;

export function cleanBackground(raw) {
  const image = safeImagePath(raw?.image);
  if (!image) return null;
  const opacity = Number(raw?.opacity);
  return {image, fit: BG_FITS.includes(raw?.fit) ? raw.fit : 'cover',
    opacity: Number.isFinite(opacity) ? Math.round(Math.min(1, Math.max(.05, opacity)) * 100) / 100 : .35};
}
export function cleanTiers(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_TIERS).map(t => {
    const level = rangeInt(t?.level, 1, 99), y = rangeInt(t?.y, 0, 6000);
    if (level == null || y == null) return null;
    return {level, label: String(t?.label ?? '').trim().slice(0, 40), y, icon: safeImagePath(t?.icon)};
  }).filter(Boolean).sort((a, b) => a.y - b.y || a.level - b.level);
}
/** Writes the cleaned look fields onto a (cloned) tree: only valid values are kept, invalid or empty fields are removed. */
export function applyAppearance(tree) {
  if (Object.hasOwn(NODE_SIZES, tree.nodeSize)) { /* keep */ } else delete tree.nodeSize;
  const bg = tree.background == null ? null : cleanBackground(tree.background);
  if (bg) tree.background = bg; else delete tree.background;
  const tiers = cleanTiers(tree.tiers);
  if (tiers.length) tree.tiers = tiers; else delete tree.tiers;
  return tree;
}
/** Warnings for look fields that will be dropped when the tree is normalised (shown in import/validation). */
export function appearanceWarnings(raw) {
  const out = [];
  if (raw?.nodeSize != null && !Object.hasOwn(NODE_SIZES, raw.nodeSize)) out.push('nodeSize must be compact or normal; ignored');
  if (raw?.background != null && !cleanBackground(raw.background)) out.push('background image path is not a safe local or Forge image file; ignored');
  if (Array.isArray(raw?.tiers)) {
    if (raw.tiers.length > MAX_TIERS) out.push(`only the first ${MAX_TIERS} tiers are kept`);
    raw.tiers.slice(0, MAX_TIERS).forEach((t, i) => {
      if (cleanTiers([t]).length !== 1) out.push(`tier ${i + 1}: needs a level (1-99) and a position; ignored`);
      else if (t.icon != null && t.icon !== '' && !safeImagePath(t.icon)) out.push(`tier ${i + 1}: icon path is not a safe local or Forge image file; ignored`);
    });
  }
  return out;
}
/** Tier bands for drawing: each runs from its y to the next tier (or the bottom of the canvas). */
export function tierBands(tiers, mapHeight) {
  const list = cleanTiers(tiers);
  return list.map((t, i) => {
    const end = i + 1 < list.length ? list[i + 1].y : Math.max(mapHeight, t.y + 60);
    return {...t, top: t.y, height: Math.max(24, end - t.y), alt: i % 2 === 1, text: t.label || `Level ${t.level}`,
      iconStyle: t.icon ? `--agst-tier-icon:${cssUrl(t.icon)};` : ''};
  });
}
/** What the canvas needs to draw the background, or null. fit "fixed" stays put while the tree scrolls. */
export function backgroundView(tree) {
  const bg = cleanBackground(tree?.background);
  if (!bg) return null;
  return {...bg, fixed: bg.fit === 'fixed', tile: bg.fit === 'tile', opacityPct: Math.round(bg.opacity * 100),
    style: `--agst-bg-image:${cssUrl(bg.image)};--agst-bg-opacity:${bg.opacity};`};
}
/** Settings-dialog values (lists are arrays, one entry per tier row) to the look fields. Blank tier rows are skipped. */
export function appearanceFromForm(v) {
  const list = x => Array.isArray(x) ? x : x == null ? [] : [x];
  const levels = list(v.tierLevel), labels = list(v.tierLabel), ys = list(v.tierY), icons = list(v.tierIcon);
  const tiers = levels.map((level, i) => ({level, label: labels[i], y: ys[i], icon: icons[i] || null}))
    .filter(t => String(t.level ?? '').trim() !== '' || String(t.y ?? '').trim() !== '');
  const bgImage = String(v.bgImage ?? '').trim();
  const errors = [];
  if (bgImage && !safeImagePath(bgImage)) errors.push('Background: use a local image file path or Forge asset address (png, jpg, webp, gif, svg or avif); other web addresses are not allowed.');
  tiers.forEach((t, i) => {
    if (cleanTiers([t]).length !== 1) errors.push(`Tier row ${i + 1}: needs a level (1-99) and a start position (0-6000).`);
    else if (t.icon && !safeImagePath(t.icon)) errors.push(`Tier row ${i + 1}: use a local image file path for the icon.`);
  });
  return {errors, nodeSize: Object.hasOwn(NODE_SIZES, v.nodeSize) ? v.nodeSize : DEFAULT_NODE_SIZE,
    background: bgImage ? {image: bgImage, fit: v.bgFit, opacity: Number(v.bgOpacity) / 100} : null, tiers};
}
