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
import {setKeepProportions, layoutOf} from './pin-proportions.mjs';

export const PIN_LOOKS = Object.freeze({framed: 'Framed (Foundry default)', image: 'Image only'});
export const DEFAULT_PIN_LOOK = 'framed';
export const NAME_SIZE = Object.freeze({min: 8, max: 48, default: 14});
export const CORE_FONT_SIZE = 32; // Foundry's default Note font size: any other value was set by hand and wins.
export const nameSizeOf = v => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(NAME_SIZE.max, Math.max(NAME_SIZE.min, n)) : NAME_SIZE.default; };
export const OFFSET = Object.freeze({min: -40, max: 40, default: 0});
export const offsetOf = v => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(OFFSET.max, Math.max(OFFSET.min, n)) : 0; };
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

/** 0.27.0: does this Note's location keep its art's proportions? Carried on the Note by notePatch (flags.<module>.pin.keep); false when absent. */
export const keepsProportions = note => {
  try { return note?.document?.getFlag?.(MODULE_ID, 'pin')?.keep === true; } catch { return false; }
};

/** 0.27.1: with Keep proportions on, the drawn name is hidden unless the location asked to show it (flags.<module>.pin.showName). */
export const hidesName = note => {
  try { const pin = note?.document?.getFlag?.(MODULE_ID, 'pin'); return pin?.keep === true && pin?.showName !== true; } catch { return false; }
};

/** 0.27.1: the banner width carried on the Note (flags.<module>.pin.width), or 0. Ignored when the GM hand-edited the Note's icon size
 *  (it no longer equals the size the module wrote), so a hand-set size still wins as before. */
export const noteBannerWidth = note => {
  try {
    const pin = note?.document?.getFlag?.(MODULE_ID, 'pin'), w = Number(pin?.width);
    if (pin?.keep !== true || !(w > 0)) return 0;
    const size = note.document.iconSize;
    return Number.isFinite(pin.size) && Number.isFinite(size) && size !== pin.size ? 0 : w;
  } catch { return 0; }
};

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
export function applyPinLook(note, {look = DEFAULT_PIN_LOOK, nameMode, showName = false, nameSize = NAME_SIZE.default, wrap = 0, nameOffset = 0} = {}) {
  if (!isBound(note)) return false;
  const imageOnly = pinLookOf(look) === 'image';
  const always = (nameMode ?? (showName ? 'always' : 'hover')) === 'always';
  // 0.27.0: draw the pin as a rectangle when its location asks for it (see pin-proportions.mjs); square otherwise.
  let layout = null;
  try {
    setKeepProportions(note.controlIcon, keepsProportions(note), () => { try { note.renderFlags?.set?.({refreshState: true, refreshTooltip: true}); } catch { /* ignore */ } }, noteBannerWidth(note));
    layout = layoutOf(note.controlIcon);
  } catch (err) { warn(err); }
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
    // 0.27.1: a pin that keeps its art's proportions carries its name in the art, so the drawn label is hidden in every name mode. Core sets
    // tooltip.visible on every refreshState (hover / layer highlight) and then calls refreshNote, so this re-applies each time. The Note's
    // text and label are untouched (they stay the leak guard and the Selected-players rule); only the drawing is hidden.
    if (tip && hidesName(note)) { tip.visible = false; return true; }
    if (tip && labelIsOurs(note.document) && note.document?.label) {
      // Always: force the label on. Hover: leave tooltip.visible to core (hover or Notes-layer highlight). The label style below applies in both.
      if (always) tip.visible = true;
      // Wrap the displayed text only: the Note's own text is never touched. Core rebuilds tooltip.text from document.label on its
      // refreshTooltip flag, so wrap 0 (or the name off) is restored by refreshPins().
      const lines = wrapLabel(note.document.label, wrap);
      if (wrapOf(wrap) && tip.text !== lines) tip.text = lines;
      moveLabel(note, offsetOf(nameOffset), layout);
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

/**
 * Moves the label relative to core's own spot. Core (Note#_refreshTooltip, 14.367) puts it at `halfPad = iconSize / 2 + 12` from the
 * Note's centre on the anchor's side (BOTTOM: anchor (0.5, 0), y = +halfPad; TOP: y = -halfPad; LEFT/RIGHT: x = -/+halfPad; CENTER: 0,0).
 * This recomputes that position from the document and adds the offset, so it is the same on every refresh (nothing accumulates, and
 * core's own re-position is simply overwritten with the same answer). Negative moves the name closer to the pin, never past the
 * icon's edge. Offset 0 leaves core's position alone.
 */
function moveLabel(note, offset, layout = null) {
  const tip = note.tooltip, doc = note.document, A = CONST_ANCHOR();
  if ((!offset && !layout) || !tip?.position?.set || !Number.isFinite(doc?.iconSize)) return;
  // 0.27.0: a pin drawn wider (or taller) than its Size pads from the rectangle's real half-width / half-height; otherwise iconSize / 2 as before.
  const halfW = layout?.halfW ?? doc.iconSize / 2, halfH = layout?.halfH ?? doc.iconSize / 2;
  const away = half => Math.max(half, half + 12 + offset);
  switch (doc.textAnchor) {
    case A.BOTTOM: tip.position.set(0, away(halfH)); break;
    case A.TOP: tip.position.set(0, -away(halfH)); break;
    case A.LEFT: tip.position.set(-away(halfW), 0); break;
    case A.RIGHT: tip.position.set(away(halfW), 0); break;
    default: break; // CENTER (or unknown): the label sits on the icon; nothing to move
  }
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
  try { const nameMode = legacyNameMode(get); return {look: pinLookOf(get('pinLook')), nameMode, showName: nameMode === 'always', nameSize: nameSizeOf(get('pinNameSize') ?? NAME_SIZE.default), wrap: wrapOf(get('pinNameWrap')), nameOffset: offsetOf(get('pinNameOffset'))}; } catch { return {look: DEFAULT_PIN_LOOK, nameMode: DEFAULT_NAME_MODE, showName: false, nameSize: NAME_SIZE.default, wrap: 0, nameOffset: 0}; }
};

/** Redraws every Note on the open scene so a changed setting shows at once. */
export function refreshPins(placeables = globalThis.canvas?.notes?.placeables) {
  for (const note of placeables ?? []) {
    try {
      if (!isBound(note)) continue;
      note.controlIcon?.refresh?.();   // 0.27.0: core redraws the square; a pin that keeps proportions is redrawn by the hook below
      note.renderFlags?.set?.({refreshState: true, refreshTooltip: true});
    } catch (err) { warn(err); }
  }
}

/** Registers the hook. `read` returns the current {look, showName}; called on every client. */
export function registerPinLook(hooks = globalThis.Hooks, read = readPinLook) {
  hooks.on('refreshNote', note => { try { applyPinLook(note, read()); } catch (err) { warn(err); } });
  // 0.27.0: the keep-proportions flag lives in the Note's module flags, which core does not treat as a reason to redraw.
  hooks.on('updateNote', (doc, changed) => {
    try {
      if (!changed?.flags?.[MODULE_ID]) return;
      const note = doc?.object;
      if (note && isBound(note)) note.renderFlags?.set?.({refreshState: true, refreshTooltip: true});
    } catch (err) { warn(err); }
  });
}
