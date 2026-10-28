/**
 * 0.21.0: how this module's Map Notes are drawn. A display setting only: it never writes a Note, a flag or a label,
 * so changing it needs no migration and switching back restores Foundry's own look.
 *
 * Foundry V14 (14.367, read in client/canvas/placeables/note.mjs and containers/elements/control-icon.mjs):
 *  - A Note's `controlIcon` is a ControlIcon with three children: `bg` (a rounded square, tinted black at 0.4 alpha = the
 *    shaded layer), `icon` (the image) and `border` (the framed square). `bg` and `border` have eventMode "none" and the
 *    ControlIcon's own `hitArea` is what receives clicks, so hiding them leaves hover, drag and double-click untouched.
 *  - `Note#_refreshState` re-tints `border` and sets `tooltip.visible = hover || layer.highlightObjects`. It never touches
 *    `visible` on `bg` or `border`, so a value set here survives refreshes. Foundry then calls `Hooks.callAll("refreshNote", note, flags)`.
 *  - The label is `tooltip` (PreciseText), text `document.label` (text, else page name, else entry name), placed by `textAnchor`
 *    (default BOTTOM, i.e. under the icon), styled by `fontSize`/`textColor`/`fontFamily` with a 4px stroke.
 * Everything below is feature-detected and wrapped so a missing field in another build can never break a render.
 */
import {MODULE_ID} from './model.mjs';

export const PIN_LOOKS = Object.freeze({framed: 'Framed (Foundry default)', image: 'Image only'});
export const DEFAULT_PIN_LOOK = 'framed';
export const NAME_SIZE = Object.freeze({min: 8, max: 48, default: 14});
export const CORE_FONT_SIZE = 32; // Foundry's default Note font size: any other value was set by hand and wins.
export const nameSizeOf = v => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(NAME_SIZE.max, Math.max(NAME_SIZE.min, n)) : NAME_SIZE.default; };
export const WRAP = Object.freeze({off: 0, min: 6, max: 60});
/** 0 = no wrapping; otherwise whole characters per line, 6 to 60. A value from 1 to 5 counts as 6. */
export const wrapOf = v => { const n = Math.round(Number(v)); return !Number.isFinite(n) || n <= 0 ? 0 : Math.min(WRAP.max, Math.max(WRAP.min, n)); };

/**
 * Breaks a label into lines of at most `limit` characters (code points, not UTF-16 units), at word boundaries; a single word
 * longer than the limit is cut. Existing line breaks are kept and trailing spaces trimmed. limit 0 returns the text as it is.
 * Manual breaks, because PIXI's wordWrapWidth is in pixels and Robb asked for a number of characters.
 */
export function wrapLabel(text, limit) {
  const str = String(text ?? '');
  const n = wrapOf(limit);
  if (!n) return str;
  const out = [];
  for (const raw of str.split('\n')) {
    let line = '';
    const push = () => { out.push(line.trimEnd()); line = ''; };
    for (const word of raw.split(/\s+/).filter(Boolean)) {
      let w = Array.from(word);
      while (w.length > n) {                       // a word longer than a line is cut
        if (line) push();
        out.push(w.slice(0, n).join('')); w = w.slice(n);
      }
      const len = Array.from(line).length;
      if (line && len + 1 + w.length > n) push();
      line = line ? `${line} ${w.join('')}` : w.join('');
    }
    push();
  }
  return out.join('\n');
}
export const NAME_MODES = Object.freeze({hover: 'Only when hovering', always: 'Always shown'});
export const DEFAULT_NAME_MODE = 'hover'; // Foundry's own behaviour
export const nameModeOf = v => (v === 'always' ? 'always' : DEFAULT_NAME_MODE);
export const pinLookOf = v => (v === 'image' ? 'image' : DEFAULT_PIN_LOOK);

const isBound = note => {
  try { return !!(note?.document?.getFlag?.(MODULE_ID, 'pinKey') || note?.document?.getFlag?.(MODULE_ID, 'locationId')); } catch { return false; }
};

/**
 * True when the label Foundry would show is one this module wrote or one a player may read. A Note's own `text` is managed by
 * pinPresentation (the location's name, the unidentified label, or '' for hidden pins). Empty text falls back to the page name:
 * that is the Selected-players rule, and it is safe only when the page carries a player view. A Hidden location's page is
 * generically named and carries no view, so no label is forced for it.
 */
export function labelIsOurs(doc) {
  try {
    if (String(doc?.text ?? '').trim()) return true;
    return !!doc?.page?.getFlag?.(MODULE_ID, 'view');
  } catch { return false; }
}

/** Draws one bound Note in the chosen look. Does nothing for other Notes. Never throws. */
export function applyPinLook(note, {look = DEFAULT_PIN_LOOK, nameMode, showName = false, nameSize = NAME_SIZE.default, wrap = 0} = {}) {
  if (!isBound(note)) return false;
  const imageOnly = pinLookOf(look) === 'image';
  const always = (nameMode ?? (showName ? 'always' : 'hover')) === 'always';
  try {
    const icon = note.controlIcon;
    if (icon) {
      if (icon.bg && 'visible' in icon.bg) icon.bg.visible = !imageOnly;
      if (icon.border && 'visible' in icon.border) {
        // Image only drops the frame at rest; it comes back while the pin is hovered, selected or highlighted, so the GM can see what they grab.
        const active = !!(note.hover || note.controlled || note.isPreview || note.layer?.highlightObjects);
        icon.border.visible = !imageOnly || active;
      }
    }
  } catch (err) { warn(err); }
  try {
    const tip = note.tooltip;
    if (tip && labelIsOurs(note.document) && note.document?.label) {
      // Always: force the label on. Hover: leave tooltip.visible to core (hover or Notes-layer highlight). The label style below applies in both.
      if (always) tip.visible = true;
      // Wrap the displayed text only: the Note's own text is never touched. Core rebuilds tooltip.text from document.label on its
      // refreshTooltip flag, so wrap 0 (or the name off) is restored by refreshPins().
      const lines = wrapLabel(note.document.label, wrap);
      if (wrapOf(wrap) && tip.text !== lines) tip.text = lines;
      // Core's canvas text style is already align 'center' with wordWrap off; it only switches to right/left for side anchors.
      if (wrapOf(wrap) && tip.style && ![CONST_ANCHOR().LEFT, CONST_ANCHOR().RIGHT].includes(note.document.textAnchor)) tip.style.align = 'center';
      // A little more outline and a soft shadow so the name reads over a busy map. Foundry rebuilds the style whenever the text changes.
      const style = tip.style;
      if (style) {
        // Core draws the label in canvas units (Note#_refreshTooltip: style.fontSize = document.fontSize, no extra scale), so this
        // number is what core would use. A font size the GM set by hand (not Foundry's default 32) wins over the setting.
        const handSet = Number.isFinite(note.document?.fontSize) && note.document.fontSize !== CORE_FONT_SIZE;
        const size = handSet ? note.document.fontSize : nameSizeOf(nameSize);
        if (!handSet && 'fontSize' in style) style.fontSize = size;
        const stroke = handSet ? Math.max(5, size / 6) : Math.max(2, Math.round(size / 6));
        if (typeof style.strokeThickness === 'number') style.strokeThickness = stroke;
        if ('dropShadow' in style) {
          style.dropShadow = true; style.dropShadowColor = 0x000000; style.dropShadowAlpha = 0.7;
          style.dropShadowBlur = Math.max(1, Math.round(size / 8)); style.dropShadowDistance = Math.max(1, Math.round(size / 14));
        }
      }
    }
  } catch (err) { warn(err); }
  return true;
}

const CONST_ANCHOR = () => globalThis.CONST?.TEXT_ANCHOR_POINTS ?? {};
let warned = false;
function warn(err) { if (!warned) { warned = true; console.warn(`${MODULE_ID} | pin look could not be applied`, err); } }

/** 0.22.2: `pinNameMode` ('' = never chosen) replaces the boolean `pinShowName`, which stays registered and is never rewritten:
 *  a saved true reads as 'always', anything else as 'hover'. */
export const legacyNameMode = get => {
  const chosen = get('pinNameMode');
  return chosen === 'always' || chosen === 'hover' ? chosen : (get('pinShowName') === true ? 'always' : DEFAULT_NAME_MODE);
};
export const readPinLook = (get = key => game.settings.get(MODULE_ID, key)) => {
  try { const nameMode = legacyNameMode(get); return {look: pinLookOf(get('pinLook')), nameMode, showName: nameMode === 'always', nameSize: nameSizeOf(get('pinNameSize') ?? NAME_SIZE.default), wrap: wrapOf(get('pinNameWrap'))}; } catch { return {look: DEFAULT_PIN_LOOK, nameMode: DEFAULT_NAME_MODE, showName: false, nameSize: NAME_SIZE.default, wrap: 0}; }
};

/** Redraws every Note on the open scene so a changed setting shows at once. */
export function refreshPins(placeables = globalThis.canvas?.notes?.placeables) {
  for (const note of placeables ?? []) {
    try { if (isBound(note)) note.renderFlags?.set?.({refreshState: true, refreshTooltip: true}); } catch (err) { warn(err); }
  }
}

/** Registers the hook. `read` returns the current {look, showName}; called on every client. */
export function registerPinLook(hooks = globalThis.Hooks, read = readPinLook) {
  hooks.on('refreshNote', note => { try { applyPinLook(note, read()); } catch (err) { warn(err); } });
}
