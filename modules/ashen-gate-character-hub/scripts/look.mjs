/**
 * Appearance of the Hub, per user (0.31.0). The header's Appearance menu changes only how the Hub looks for the user who
 * opens it; nothing on the character changes.
 *   - With General Manager's appearance API (api.appearance, contract ag-appearance/0.1-beta, feature-detected) the menu
 *     sets this user's own skin through setUserOverride ('' = the GM's world default) and this device's size through
 *     setSize. Manager stores both and keeps the world default; the Hub stores nothing.
 *   - Without Manager a small built-in choice: Dark / Light and Compact / Comfortable, stored per user in the user-scope
 *     setting `look` ({theme, density}; 'world' or missing = the GM's default). The GM's default is the world setting
 *     `lookDefault`, set in GM Setup. Drawn as data-agch-theme / data-agch-density on the Hub window (character-hub.css).
 */
import {MODULE_ID, esc} from './constants.mjs';
import {btn} from './buttons.mjs';
import {compactOpacityHtml} from './compact-opacity.mjs';

export const LOOK_SETTING = 'look';
export const LOOK_DEFAULT_SETTING = 'lookDefault';
export const APPEARANCE_CONTRACT = 'ag-appearance/0.1-beta';
export const THEMES = [['dark', 'Dark'], ['light', 'Light']];
export const DENSITIES = [['compact', 'Compact'], ['comfortable', 'Comfortable']];
const FIELDS = {theme: THEMES, density: DENSITIES};
const refuse = error => ({ok: false, error});
const isGM = () => globalThis.game?.user?.isGM === true;
const read = key => { try { const v = globalThis.game?.settings?.get?.(MODULE_ID, key); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; } };
const pick = (field, value, fallback) => FIELDS[field].some(([k]) => k === value) ? value : fallback;

export function registerLookSettings(settings, onChange = () => {}) {
  // user scope (Foundry V13+): stored per user, follows them to any computer; each user writes only their own.
  settings.register(MODULE_ID, LOOK_SETTING, {scope: 'user', config: false, type: Object, default: {}, onChange});
  settings.register(MODULE_ID, LOOK_DEFAULT_SETTING, {scope: 'world', config: false, type: Object, default: {}, onChange});
}

/** Manager's appearance API when it is active and offers the contract and the calls the menu uses, else null. */
export function managerAppearance() {
  const m = globalThis.game?.modules?.get?.('ashen-gate-manager'), a = m?.active ? m.api?.appearance : null;
  return a?.contract === APPEARANCE_CONTRACT && typeof a.getState === 'function' && typeof a.listSkins === 'function' && typeof a.setUserOverride === 'function' ? a : null;
}

/** The GM's world default for the built-in look: {theme, density} (Dark, Compact when unset). */
export const worldLook = () => { const w = read(LOOK_DEFAULT_SETTING); return {theme: pick('theme', w.theme, 'dark'), density: pick('density', w.density, 'compact')}; };
/** This user's own choice: each field a value or 'world' (follow the GM's default). */
export const userLook = () => { const u = read(LOOK_SETTING); return {theme: pick('theme', u.theme, 'world'), density: pick('density', u.density, 'world')}; };
/** What the built-in look draws for this user. */
export function effectiveLook() {
  const w = worldLook(), u = userLook();
  return {theme: u.theme === 'world' ? w.theme : u.theme, density: u.density === 'world' ? w.density : u.density};
}

/** This user's built-in choice (any user, own setting only). value 'world' goes back to the GM's default. */
export async function setUserLook(field, value) {
  if (!FIELDS[field] || (value !== 'world' && !FIELDS[field].some(([k]) => k === value))) return refuse('Unknown appearance choice.');
  const next = {...userLook(), [field]: value};
  try { await globalThis.game?.settings?.set?.(MODULE_ID, LOOK_SETTING, next); } catch (err) { return refuse(`Appearance not saved: ${err?.message ?? err}`); }
  return {ok: true, result: next};
}
/** GM only: the world default for the built-in look (GM Setup). */
export async function setWorldLook(field, value) {
  if (!isGM()) return refuse('Only the GM can change the default appearance.');
  if (!FIELDS[field]?.some(([k]) => k === value)) return refuse('Unknown appearance choice.');
  const next = {...worldLook(), [field]: value};
  try { await globalThis.game?.settings?.set?.(MODULE_ID, LOOK_DEFAULT_SETTING, next); } catch (err) { return refuse(`Default appearance not saved: ${err?.message ?? err}`); }
  return {ok: true, result: next};
}
/** With Manager: this user's skin ('' = the GM's world default). Manager checks and stores it. */
export async function setManagerSkin(id) {
  const a = managerAppearance();
  if (!a) return refuse('General Manager\'s appearance is not available.');
  const v = String(id ?? '');
  if (v && !(a.listSkins() ?? []).some(s => s.id === v)) return refuse('Unknown skin.');
  try { return {ok: true, result: await a.setUserOverride(v)}; } catch (err) { return refuse(`Appearance not saved: ${err?.message ?? err}`); }
}
/** With Manager: this device's size (Compact / Comfortable). */
export async function setManagerSize(id) {
  const a = managerAppearance();
  if (typeof a?.setSize !== 'function') return refuse('General Manager\'s size switch is not available.');
  try { return {ok: true, result: await a.setSize(String(id))}; } catch (err) { return refuse(`Size not saved: ${err?.message ?? err}`); }
}

/**
 * Marks the Hub window with the built-in look, or clears it while Manager's appearance is active (Manager's tokens then
 * apply; it re-themes the content in the sheet's render).
 */
export function applyLook(el) {
  if (!el?.dataset) return null;
  if (managerAppearance()) { delete el.dataset.agchTheme; delete el.dataset.agchDensity; return null; }
  const l = effectiveLook();
  el.dataset.agchTheme = l.theme; el.dataset.agchDensity = l.density;
  return l;
}

const choice = (action, value, label, on, data = {}) => `<button type="button" role="radio" aria-checked="${on}" data-action="${action}" data-value="${esc(value)}"${Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('')} data-ag-always>${esc(label)}</button>`;
const group = (label, buttons) => `<div class="agch-look__group"><span class="agch-look__label">${esc(label)}</span><div class="ag-segmented agch-seg" role="radiogroup" aria-label="${esc(label)}">${buttons}</div></div>`;

/**
 * The Appearance menu (opened from the header's "⋯" menu since 0.33.0): Manager's skins and sizes, or the built-in
 * Dark / Light and Compact / Comfortable size. In Compact view it also holds the see-through background slider (CH-04).
 */
export function lookMenuHtml(sheet = null) {
  const fade = sheet?.compact === true ? `<div class="agch-look__group"><span class="agch-look__label">Background opacity</span>${compactOpacityHtml()}</div>` : '';
  const a = managerAppearance();
  const head = `<header class="agch-menu__head"><strong>Appearance</strong><span class="agch-muted">Only for you</span>${btn('menu-close', '', {kind: 'ghost', icon: 'fa-solid fa-xmark', title: 'Close', always: true})}</header>`;
  if (a) {
    let state = {}, skins = [], sizes = [];
    try { state = a.getState() ?? {}; skins = a.listSkins() ?? []; sizes = typeof a.listSizes === 'function' ? a.listSizes() ?? [] : []; } catch { /* drawn with what was read */ }
    const mine = state.userOverride ?? '', world = skins.find(s => s.id === state.worldDefault)?.label ?? state.worldDefault ?? 'GM default';
    const skinRows = [{id: '', label: `GM default (${world})`}, ...skins].map(s => `<button type="button" class="agch-menu__btn agch-look__skin" aria-pressed="${mine === s.id}" data-action="look-skin" data-value="${esc(s.id)}" data-ag-always>${mine === s.id ? '<i class="fa-solid fa-check" aria-hidden="true"></i>' : '<i class="fa-regular fa-circle" aria-hidden="true"></i>'}<span>${esc(s.label)}</span></button>`).join('');
    const sizeRow = sizes.length && typeof a.setSize === 'function' ? group('Size (this device)', sizes.map(z => choice('look-size', z.id, z.label, z.selected === true)).join('')) : '';
    const more = typeof a.openMyAppearance === 'function' ? btn('look-more', 'More in My Appearance', {kind: 'sm', icon: 'fa-solid fa-up-right-from-square', always: true}) : '';
    return `<div class="agch-menu agch-lookmenu" role="group" aria-label="Appearance">${head}<span class="agch-muted">Skin (all Ashen Gate windows)</span>${skinRows}${sizeRow}${fade}${more}</div>`;
  }
  const u = userLook(), w = worldLook(), name = (list, k) => list.find(([v]) => v === k)?.[1] ?? k;
  const row = (label, field, list) => group(label, [choice('look-set', 'world', `GM default (${name(list, w[field])})`, u[field] === 'world', {field}), ...list.map(([k, l]) => choice('look-set', k, l, u[field] === k, {field}))].join(''));
  return `<div class="agch-menu agch-lookmenu" role="group" aria-label="Appearance">${head}${row('Theme', 'theme', THEMES)}${row('Size', 'density', DENSITIES)}${fade}
    <p class="agch-muted">Saved for your user. Install General Manager for its full set of skins.</p></div>`;
}

/** GM Setup card: the built-in default every user starts from (used while General Manager's appearance is not active). */
export function lookSetupCard() {
  const w = worldLook(), a = managerAppearance();
  const sel = (field, label, list) => `<label class="ag-field">${esc(label)}<select data-edit="look-default" data-field="${field}">${list.map(([k, l]) => `<option value="${k}"${w[field] === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  return `<section class="ag-card agch-looksetup"><h3>Hub appearance (default)</h3>
    ${a ? '<p class="agch-muted">General Manager\'s appearance is active: the world default skin is set in General Manager → Appearance. Each player picks their own in the Hub\'s <strong>⋯ → Appearance…</strong> menu. The choices below apply only when General Manager is not active.</p>' : '<p class="agch-muted">The look every user starts from. Each player can still pick their own in the Hub\'s <strong>⋯ → Appearance…</strong> menu.</p>'}
    <div class="agch-looksetup__row">${sel('theme', 'Theme', THEMES)}${sel('density', 'Size', DENSITIES)}</div></section>`;
}
