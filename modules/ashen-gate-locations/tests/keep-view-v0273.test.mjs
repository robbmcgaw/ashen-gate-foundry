/** 0.27.3: the Locations window keeps its scroll positions and focus across a redraw. Mocked DOM: logic only, not real Foundry layout. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {captureView, restoreView, revealSelected, focusSelector} from '../scripts/keep-view.mjs';

/** A scroller with a viewport of 100px and rows 20px tall. */
function scroller(rows = 50) {
  const el = {scrollTop: 0, scrollLeft: 0, clientHeight: 100, scrollHeight: rows * 20, rows: [], selected: -1};
  el.getBoundingClientRect = () => ({top: 0, bottom: 100});
  el.querySelector = sel => sel.includes('aria-current') ? (el.selected < 0 ? null : row(el, el.selected)) : sel.includes('data-action') ? {} : null;
  return el;
}
const row = (list, i) => ({getBoundingClientRect: () => ({top: i * 20 - list.scrollTop, bottom: i * 20 + 20 - list.scrollTop})});
function focusable(attrs, extra = {}) {
  const el = {tagName: 'BUTTON', focused: 0, getAttribute: k => attrs[k] ?? null, focus() { this.focused++; this.lastOpts = arguments[0]; }, ...extra};
  return el;
}
/** The window content: the old tree is captured, then "re-rendered" into fresh stand-ins. */
function content(parts, focusables = []) {
  return {
    list: parts.list, detail: parts.detail, pane: parts.pane,
    contains: el => focusables.includes(el),
    querySelector(sel) {
      if (sel === '.agl-list') return this.list ?? null;
      if (sel === '.agl-detail') return this.detail ?? null;
      if (sel === '.agl-pane') return this.pane ?? null;
      if (sel.startsWith('.agl-list')) return this.list ? {} : null;
      return focusables.find(f => focusSelectorMatches(f, sel)) ?? null;
    }
  };
}
const focusSelectorMatches = (f, sel) => focusSelector(f) === sel;
const redraw = (before, after, view, state, active) => {
  const snap = captureView(before, view, {...state, active});
  restoreView(after, view, snap);
  return snap;
};

test('list scroll survives a selection re-render and a visible row click does not jump', () => {
  const view = {};
  const list = scroller(), detail = scroller(), pane = scroller(5);
  list.scrollTop = 600; list.selected = 30;
  redraw(content({}), content({list, detail}), view, {selectedId: 'LOC-A', editorTab: 'content'});  // first render
  list.scrollTop = 600;
  const nextVisible = scroller(); nextVisible.selected = 31;                                          // user clicks row 31 (620-640), visible in the 600-700 viewport
  redraw(content({list, detail, pane}), content({list: nextVisible, detail: scroller(), pane: scroller(5)}), view, {selectedId: 'LOC-B', editorTab: 'content'});
  assert.equal(nextVisible.scrollTop, 600, 'list stays where it was');
});

test('detail pane keeps its scroll for the same selection and resets for a new one', () => {
  const view = {};
  const d1 = scroller(); const l1 = scroller();
  redraw(content({}), content({list: l1, detail: d1}), view, {selectedId: 'LOC-A', editorTab: 'content'});
  d1.scrollTop = 240;
  const d2 = scroller(), l2 = scroller();
  redraw(content({list: l1, detail: d1}), content({list: l2, detail: d2}), view, {selectedId: 'LOC-A', editorTab: 'content'});
  assert.equal(d2.scrollTop, 240, 'same selection (a save, a toggle) keeps the detail scroll');
  const d3 = scroller(), l3 = scroller();
  redraw(content({list: l2, detail: d2}), content({list: l3, detail: d3}), view, {selectedId: 'LOC-B', editorTab: 'content'});
  assert.equal(d3.scrollTop, 0, 'a new selection starts at the top');
});

test('editor tab switches keep the scroll of each tab', () => {
  const view = {};
  const d1 = scroller();
  redraw(content({}), content({list: scroller(), detail: d1}), view, {selectedId: 'LOC-A', editorTab: 'content'});
  d1.scrollTop = 300;
  const d2 = scroller();
  redraw(content({list: scroller(), detail: d1}), content({list: scroller(), detail: d2}), view, {selectedId: 'LOC-A', editorTab: 'map'});
  assert.equal(d2.scrollTop, 0, 'a tab not visited yet starts at the top');
  d2.scrollTop = 80;
  const d3 = scroller();
  redraw(content({list: scroller(), detail: d2}), content({list: scroller(), detail: d3}), view, {selectedId: 'LOC-A', editorTab: 'content'});
  assert.equal(d3.scrollTop, 300, 'back on the first tab its scroll returns');
});

test('a selection outside the visible list scrolls into view, the minimum distance', () => {
  const view = {};
  redraw(content({}), content({list: scroller(), detail: scroller()}), view, {selectedId: 'LOC-A', editorTab: 'content'});
  const below = scroller(); below.selected = 20; below.scrollTop = 0;   // row 20 is at 400-420, viewport 0-100
  // keep old scroll 0, selection changed (deep link / new location)
  redraw(content({list: scroller(), detail: scroller()}), content({list: below, detail: scroller()}), view, {selectedId: 'LOC-Z', editorTab: 'content'});
  assert.equal(below.scrollTop, 324, 'row bottom (420) lands at the viewport bottom plus 4px padding');
  const above = scroller(); above.selected = 2; above.scrollTop = 300;
  view.id = 'LOC-Z';
  redraw(content({list: below, detail: scroller()}), content({list: above, detail: scroller()}), view, {selectedId: 'LOC-Y', editorTab: 'content'});
  assert.equal(above.scrollTop, 36, 'scrolls up only as far as needed: row 2 (top 40) lands at the top edge less 4px padding');
});

test('a re-render with the same selection never re-centres on the selected row', () => {
  const view = {};
  const first = scroller(); first.selected = 40;
  redraw(content({}), content({list: first, detail: scroller()}), view, {selectedId: 'LOC-A', editorTab: 'content'});
  const old = scroller(); old.scrollTop = 0; old.selected = 40;           // user scrolled to the top, selection is far below
  const next = scroller(); next.selected = 40;
  redraw(content({list: old, detail: scroller()}), content({list: next, detail: scroller()}), view, {selectedId: 'LOC-A', editorTab: 'content'});
  assert.equal(next.scrollTop, 0, 'filter, expand/collapse, select mode: scroll stays where the user left it');
});

test('tree expand/collapse keeps list scroll horizontally and vertically', () => {
  const view = {};
  const a = scroller(); a.selected = 0;
  redraw(content({}), content({list: a, detail: scroller()}), view, {selectedId: 'LOC-A', editorTab: 'content'});
  a.scrollTop = 500; a.scrollLeft = 12;
  const b = scroller(); b.selected = 0;
  redraw(content({list: a, detail: scroller()}), content({list: b, detail: scroller()}), view, {selectedId: 'LOC-A', editorTab: 'content'});
  assert.deepEqual([b.scrollTop, b.scrollLeft], [500, 12]);
});

test('stacked layout: the outer pane scroll is kept too', () => {
  const view = {};
  const p1 = scroller(); p1.scrollTop = 150;
  redraw(content({pane: p1}), content({pane: scroller()}), view, {selectedId: 'LOC-A', editorTab: 'content'});
  const p2 = scroller();
  redraw(content({pane: p1, list: scroller(), detail: scroller()}), content({pane: p2, list: scroller(), detail: scroller()}), view, {selectedId: 'LOC-A', editorTab: 'content'});
  assert.equal(p2.scrollTop, 150, 'pane scroll carried to the redrawn pane');
  p2.scrollTop = 150;
  const p3 = scroller();
  redraw(content({pane: p2, list: scroller(), detail: scroller()}), content({pane: p3, list: scroller(), detail: scroller()}), view, {selectedId: 'LOC-A', editorTab: 'content'});
  assert.equal(p3.scrollTop, 150);
});

test('focus returns to the same control after a re-render, without scrolling', () => {
  const view = {};
  const oldRow = focusable({'data-action': 'select', 'data-id': 'LOC-B'});
  const newRow = focusable({'data-action': 'select', 'data-id': 'LOC-B'});
  const list = scroller();
  const snapContent = content({list, detail: scroller()}, [oldRow]);
  const next = content({list: scroller(), detail: scroller()}, [newRow]);
  redraw(content({}), next, view, {selectedId: 'LOC-A', editorTab: 'content'});
  redraw(snapContent, next, view, {selectedId: 'LOC-B', editorTab: 'content'}, oldRow);
  assert.equal(newRow.focused, 1);
  assert.deepEqual(newRow.lastOpts, {preventScroll: true});
});

test('focus restore keeps a text caret and ignores controls outside the window', () => {
  const view = {};
  const box = focusable({id: 'agl-party-text'}, {selectionStart: 3, selectionEnd: 5});
  const again = focusable({id: 'agl-party-text'}, {setSelectionRange(a, b) { this.sel = [a, b]; }});
  redraw(content({}), content({list: scroller(), detail: scroller()}), view, {selectedId: 'LOC-A', editorTab: 'content'});
  redraw(content({list: scroller(), detail: scroller()}, [box]), content({list: scroller(), detail: scroller()}, [again]), view, {selectedId: 'LOC-A', editorTab: 'content'}, box);
  assert.deepEqual(again.sel, [3, 5]);
  const outside = focusable({'data-action': 'select', 'data-id': 'X'});
  const snap = captureView(content({}), view, {selectedId: 'LOC-A', editorTab: 'content', active: outside});
  assert.equal(snap.focus, null);
});

test('revealSelected leaves a visible row alone', () => {
  const list = scroller(); list.scrollTop = 600; list.selected = 31;
  revealSelected(list, null);
  assert.equal(list.scrollTop, 600);
});

test('app.mjs redraws through the keep-view helper', () => {
  const src = fs.readFileSync(new URL('../scripts/app.mjs', import.meta.url), 'utf8');
  assert.match(src, /captureView\(content, view,/);
  assert.match(src, /restoreView\(content, view, snap\)/);
});
