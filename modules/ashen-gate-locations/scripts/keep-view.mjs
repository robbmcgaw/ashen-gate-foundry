/**
 * Keeps the reader's place when the Locations window redraws (0.27.3).
 * The window replaces its whole inner HTML on every render, which throws away every scroll position and the focused control.
 * captureView() records them before the swap; restoreView() puts them back after, then (only when the selection changed or the
 * window is new) nudges the selected row into view the minimum amount. A click on a row that is already visible moves nothing.
 * Plain DOM calls only, so it can be tested with small stand-in elements.
 */
const LIST = '.agl-list', DETAIL = '.agl-detail', PANE = '.agl-pane';

/** A selector that finds the same control again after a redraw, or null if nothing identifies it. */
export function focusSelector(el) {
  if (!el?.getAttribute) return null;
  const esc = s => globalThis.CSS?.escape ? globalThis.CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');
  const id = el.getAttribute('id');
  if (id) return `#${esc(id)}`;
  const attrs = ['data-action', 'data-id', 'data-group', 'data-tab', 'data-key', 'data-bind', 'data-filter', 'data-toggle', 'data-open', 'data-section', 'data-state'];
  const found = attrs.filter(a => el.getAttribute(a) !== null && el.getAttribute(a) !== undefined);
  if (!found.some(a => a === 'data-action' || a === 'data-bind' || a === 'data-filter' || a === 'data-toggle' || a === 'data-tab')) return null;
  const tag = (el.tagName ?? '').toLowerCase();
  return `${tag}${found.map(a => `[${a}="${esc(el.getAttribute(a))}"]`).join('')}`;
}

const at = el => el ? {top: el.scrollTop || 0, left: el.scrollLeft || 0} : null;

/**
 * 0.43.1: every other scroll container in `root` (setup body, tables, textareas, pickers), not only the three named above.
 * Each is keyed by its id, or by its first class plus its place among elements of that class, so it can be found again after a redraw.
 */
const KNOWN = new Set([LIST, DETAIL, PANE]);
export function otherScrollers(root) {
  const out = [];
  const seen = {};
  for (const el of root?.querySelectorAll?.('*') ?? []) {
    const cls = (el.classList?.[0] ?? String(el.className ?? '').split(/\s+/)[0]) || '';
    const id = el.getAttribute?.('id') || el.id || '';
    const key = id ? `#${id}` : cls ? `.${cls}` : '';
    if (!key || KNOWN.has(key)) continue;
    const n = seen[key] = (seen[key] ?? -1) + 1;
    if (el.scrollTop || el.scrollLeft) out.push({key, n, id: !!id, ...at(el)});
  }
  return out;
}
const findScroller = (root, s) => s.id ? root.querySelector?.(s.key) : [...(root.querySelectorAll?.(s.key) ?? [])][s.n];
const put = (el, pos) => { if (el && pos) { el.scrollTop = pos.top; el.scrollLeft = pos.left; } };

/** Call before content.innerHTML is replaced. `view` is the window's per-render memory: {id, tab, detail: {tab: pos}, rendered}. */
export function captureView(content, view, {selectedId, editorTab, active = globalThis.document?.activeElement} = {}) {
  const detail = content.querySelector(DETAIL);
  if (detail && view.rendered && view.id === selectedId) (view.detail ??= {})[view.tab] = at(detail);
  const focus = active && content.contains?.(active) ? focusSelector(active) : null;
  const caret = focus && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
  return {others: otherScrollers(content), self: at(content), list: at(content.querySelector(LIST)), pane: at(content.querySelector(PANE)), focus, caret, hadRows: !!content.querySelector(LIST + ' [data-action="select"]'),
    changed: !view.rendered || view.id !== selectedId, selectedId, editorTab};
}

/** Call after content.innerHTML is set. Updates `view` for the next render. */
export function restoreView(content, view, snap) {
  const list = content.querySelector(LIST), detail = content.querySelector(DETAIL), pane = content.querySelector(PANE);
  if (snap.changed) view.detail = {};                       // a new selection starts at the top of the detail pane
  view.id = snap.selectedId; view.tab = snap.editorTab; view.rendered = true;
  put(content, snap.self);
  put(pane, snap.pane);
  put(list, snap.list);
  put(detail, (view.detail ?? {})[snap.editorTab] ?? {top: 0, left: 0});
  for (const o of snap.others ?? []) put(findScroller(content, o), o);
  if (snap.changed) revealSelected(list, pane);
  if (snap.focus) {
    const next = content.querySelector(snap.focus);
    if (next) { try { next.focus({preventScroll: true}); if (snap.caret) next.setSelectionRange?.(...snap.caret); } catch { /* focus stays where it lands */ } }
  }
}

/** Scrolls the selected row into view, the minimum distance, in the list (or in the pane when the window is stacked). */
export function revealSelected(list, pane) {
  const row = list?.querySelector?.('[aria-current="true"]');
  if (!row?.getBoundingClientRect) return;
  for (const box of [list, pane]) {
    if (!box?.getBoundingClientRect || !(box.scrollHeight > box.clientHeight)) continue;
    const a = box.getBoundingClientRect(), b = row.getBoundingClientRect(), pad = 4;
    if (b.top < a.top) box.scrollTop = Math.max(0, box.scrollTop - (a.top - b.top) - pad);
    else if (b.bottom > a.bottom) box.scrollTop += b.bottom - a.bottom + pad;
  }
}

/**
 * 0.43.1: redraws one part of the window in place (e.g. the Travel pane after a switch) without moving the reader. `draw()` replaces the
 * part's HTML; every scroll position inside `part` (and the part itself) and the focused control are put back after. Returns draw()'s result.
 */
export function keepScroll(part, draw, {active = globalThis.document?.activeElement} = {}) {
  const snap = {self: at(part), others: otherScrollers(part)};
  const focus = active && part.contains?.(active) ? focusSelector(active) : null;
  const caret = focus && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
  const result = draw();
  put(part, snap.self);
  for (const o of snap.others) put(findScroller(part, o), o);
  if (focus) {
    const next = part.querySelector(focus);
    if (next) { try { next.focus({preventScroll: true}); if (caret) next.setSelectionRange?.(...caret); } catch { /* focus stays where it lands */ } }
  }
  return result;
}
