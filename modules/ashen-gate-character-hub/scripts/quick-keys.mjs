/**
 * Quick bar hotkeys (0.29.4). The slots always showed 1-9 and 0, but no key was ever bound to them, so in Foundry the
 * number keys went to Foundry's own macro bar. Now ten Foundry keybindings (Configure Controls → Ashen Gate |
 * Character Hub; 1-9 and 0 by default, players can change them) use a slot of the open Hub:
 *   - the Hub in front (the active window, else the one on top), when its quick bar is shown and you can use it;
 *   - with no such Hub the key is left alone, so Foundry's macro bar works as before;
 *   - never while typing in a field (search boxes, the HP amount, ...); holding a key down uses the slot once.
 * A popped-out Hub's own browser window does not reach Foundry's keyboard handling, so while the Hub is popped out that
 * window gets one keydown listener that matches the same bindings. The same key press is never used twice.
 */
import {MODULE_ID} from './constants.mjs';
import {HOTBAR_SLOTS} from './hotbar.mjs';

export const QUICK_KEY_ACTIONS = Array.from({length: HOTBAR_SLOTS}, (x, i) => `quickSlot${i + 1}`);
/** Default keys: Digit1 ... Digit9, then Digit0 for slot 10 (the labels on the slots). */
export const defaultQuickKey = i => `Digit${(i + 1) % 10}`;

const NOT_TYPING = /^(checkbox|radio|range|button|submit|reset|color|file|image)$/;
/** The key press goes to a field being typed in (or a select, or editable text). */
export function isTyping(target) {
  const el = target?.closest?.('input, textarea, select, [contenteditable]');
  if (!el) return false;
  if (el.tagName === 'INPUT') return !NOT_TYPING.test(el.type || 'text');
  if (el.matches?.('[contenteditable]')) return el.isContentEditable !== false && el.getAttribute?.('contenteditable') !== 'false';
  return true;
}

/** A Hub can take quick bar keys: drawn, not minimized, its quick bar shown and usable (not view only). */
export function takesQuickKeys(hub) {
  return !!hub?.rendered && !hub.minimized && hub.hubContext?.editable === true && !!hub.element?.querySelector?.('[data-hotbar-slot]');
}
/** The Hub a key press is for: the active window if it is one, else the open one on top. */
export function targetHub(hubs, active = null) {
  const ok = [...(hubs ?? [])].filter(takesQuickKeys);
  if (active && ok.includes(active)) return active;
  const z = h => Number(h.position?.zIndex ?? h.element?.style?.zIndex) || 0;
  return ok.sort((a, b) => z(b) - z(a))[0] ?? null;
}

const used = new WeakSet();
/**
 * One key press for slot `index` (0-based). Returns true when a Hub took it (Foundry then stops looking for other
 * bindings, so its macro bar does not also fire), false to leave the key to Foundry.
 */
export function pressQuickSlot(index, event, hubs, active = null) {
  if (event && typeof event === 'object' && used.has(event)) return true;
  if (isTyping(event?.target)) return false;
  const hub = targetHub(hubs, active);
  if (!hub) return false;
  if (event && typeof event === 'object') used.add(event);
  if (!event?.repeat) void hub.dispatch('hotbar-use', {dataset: {hotbarSlot: String(index)}}, event);
  return true;
}

/** Registers the ten keybindings (Foundry's init hook only). `onSlot(index, event)` returns whether the key was used. */
export function registerQuickKeys(keybindings, onSlot, precedence) {
  QUICK_KEY_ACTIONS.forEach((action, i) => keybindings.register(MODULE_ID, action, {
    name: `Quick bar slot ${i + 1}`,
    hint: 'While a Character Hub with its quick bar is open, uses this slot of the Hub in front. With no Hub open the key does what it did before (Foundry\'s macro bar).',
    editable: [{key: defaultQuickKey(i), modifiers: []}],
    restricted: false,
    ...(precedence === undefined ? {} : {precedence}),
    onDown: context => onSlot(i, context?.event ?? null)
  }));
}

/** The slot (0-based) whose binding matches a keydown, by key code and exact modifiers, or -1. */
export function slotForKey(event, bindingsOf) {
  const has = {Control: !!(event.ctrlKey || event.metaKey), Shift: !!event.shiftKey, Alt: !!event.altKey};
  return QUICK_KEY_ACTIONS.findIndex(action => (bindingsOf(action) ?? []).some(b => b?.key === event.code
    && Object.entries(has).every(([m, on]) => (b.modifiers ?? []).includes(m) === on)));
}
const bindingsOf = action => { try { return globalThis.game?.keybindings?.get?.(MODULE_ID, action) ?? []; } catch { return []; } };

/** Removes the popped-out window's key listener, if any. */
export function unbindQuickKeys(sheet) {
  const bound = sheet?._agchQuickKeys;
  if (!bound) return;
  bound.doc.removeEventListener?.('keydown', bound.handler);
  sheet._agchQuickKeys = null;
}
/** Called after every render: one keydown listener on the Hub's own window while it is popped out, none otherwise. */
export function syncQuickKeys(sheet) {
  const doc = sheet?.element?.ownerDocument ?? null;
  const out = !!doc && !!globalThis.document && doc !== globalThis.document ? doc : null;
  if (sheet._agchQuickKeys?.doc === out && out) return;
  unbindQuickKeys(sheet);
  if (!out?.addEventListener) return;
  const handler = ev => {
    if (ev.isComposing) return;
    const i = slotForKey(ev, bindingsOf);
    if (i < 0 || !pressQuickSlot(i, ev, [sheet], sheet)) return;
    ev.preventDefault?.();
    ev.stopPropagation?.();
  };
  out.addEventListener('keydown', handler);
  sheet._agchQuickKeys = {doc: out, handler};
}
