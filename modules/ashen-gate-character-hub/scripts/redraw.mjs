/**
 * Quiet redraws (0.29.4). Any change to the character (the GM setting Strain, say) redraws an open Hub, and replacing
 * the content put every list back at the top and dropped the focus of a field being typed in. Now each redraw:
 *   - keeps the scroll position of every scrolled area, remembered per tab (Inventory, Magic, ... and Compact), so a
 *     live update never moves a player who is reading a list, and switching back to a tab returns to where it was;
 *   - gives the focus (and caret, and text typed but not yet saved) back to the field that had it;
 *   - is skipped altogether when the new HTML is the same as what is shown (a change the Hub doesn't display).
 * Scrolled areas are matched by tag and class names plus their order, so embedded partner views keep theirs too.
 */

/** Classes that only describe a passing state, ignored when matching elements across a redraw. */
const STATE_CLASS = /^(is|has)-/;
const elementKey = el => `${el.tagName}.${[...(el.classList ?? [])].filter(c => !STATE_CLASS.test(c)).sort().join('.')}`;

/** Every element of the content (the content first), each with a key that is the same for its twin after a redraw. */
function keyed(content) {
  const seen = new Map(), out = [[':content', content]];
  for (const el of content?.querySelectorAll?.('*') ?? []) {
    const k = elementKey(el), n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    out.push([`${k}#${n}`, el]);
  }
  return out;
}

/** Scroll offsets of the areas that are scrolled now: {key: {top, left}}. */
export function captureScroll(content) {
  const out = {};
  for (const [k, el] of keyed(content)) if (el.scrollTop > 0 || el.scrollLeft > 0) out[k] = {top: el.scrollTop, left: el.scrollLeft};
  return out;
}
/** Puts saved scroll offsets back on the matching areas. */
export function restoreScroll(content, saved) {
  if (!saved || !Object.keys(saved).length) return;
  for (const [k, el] of keyed(content)) {
    const s = saved[k];
    if (!s) continue;
    el.scrollTop = s.top;
    el.scrollLeft = s.left;
  }
}

/** A field's identity across redraws: its tag, name and data-* attributes (tooltips aside). */
export function fieldKey(el) {
  const attrs = [...(el.attributes ?? [])].filter(a => a.name === 'name' || (a.name.startsWith('data-') && !a.name.startsWith('data-tooltip')))
    .map(a => `${a.name}=${a.value}`).sort();
  return `${el.tagName}[${attrs.join('][')}]`;
}
/**
 * What keeps the focus across a redraw: fields (0.29.4) and, since 0.33.0 (CH-02), buttons, links and other focusable
 * controls (tabs, filter chips, the slot ⋯ button, Compact / Full ...), matched by the same fieldKey.
 */
const FIELDS = 'input, textarea, select';
export const FOCUSABLE = 'input, textarea, select, button, a[href], [tabindex]';
const TEXTLIKE = /^(text|search|number|email|url|tel|password)$/;
const textLike = el => el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && TEXTLIKE.test(el.type || 'text'));

/** The Hub control that has the focus now (a field also with its caret and any text typed but not saved), or null. */
export function captureFocus(content) {
  const el = content?.ownerDocument?.activeElement;
  if (!el || el === content || !content.contains?.(el) || !el.matches?.(FOCUSABLE)) return null;
  const field = el.matches(FIELDS);
  let start = null, end = null;
  if (field) try { start = el.selectionStart; end = el.selectionEnd; } catch {}
  return {key: fieldKey(el), value: field ? el.value : undefined, defaultValue: field ? el.defaultValue : undefined, dirty: field && textLike(el) && el.value !== el.defaultValue, start, end};
}
/**
 * Focuses the same control again, without scrolling. Text typed but not saved is put back, unless the field now shows
 * a different saved value (someone else changed it). Returns the control, or null when it is gone or disabled.
 */
export function restoreFocus(content, saved) {
  if (!saved?.key) return null;
  const el = [...(content?.querySelectorAll?.(FOCUSABLE) ?? [])].find(f => fieldKey(f) === saved.key);
  if (!el || el.disabled) return null;
  if (saved.dirty && el.defaultValue === saved.defaultValue) el.value = saved.value;
  el.focus?.({preventScroll: true});
  if (saved.start !== null && saved.start !== undefined) try { el.setSelectionRange?.(saved.start, saved.end ?? saved.start); } catch {}
  return el;
}
/**
 * Popovers (0.33.0, CH-02): the first control inside a popover that just opened gets the focus (its Close button only
 * when there is nothing else). Returns the control, or null.
 */
export function focusFirstIn(popover) {
  const all = [...(popover?.querySelectorAll?.(FOCUSABLE) ?? [])].filter(el => !el.disabled && el.getAttribute?.('tabindex') !== '-1');
  const el = all.find(c => c.dataset?.action !== 'menu-close') ?? all[0] ?? null;
  el?.focus?.({preventScroll: true});
  return el;
}
