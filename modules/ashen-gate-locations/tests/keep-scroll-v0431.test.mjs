/** 0.43.1: a Travel (or any) redraw keeps every scroll position and the focus. Mocked DOM stand-ins: logic only, not real Foundry layout. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {keepScroll, otherScrollers, captureView, restoreView} from '../scripts/keep-view.mjs';

const el = (cls, id, top = 0) => ({scrollTop: top, scrollLeft: 0, classList: [cls], getAttribute: k => k === 'id' ? (id ?? null) : null});
const root = (kids, extra = {}) => ({scrollTop: 0, scrollLeft: 0, contains: () => false, querySelectorAll: () => kids,
  querySelector: sel => kids.find(k => (k.getAttribute('id') ? `#${k.getAttribute('id')}` : `.${k.classList[0]}`) === sel) ?? null, ...extra});

test('otherScrollers finds scrolled containers by id or class order, skipping unscrolled ones', () => {
  const found = otherScrollers(root([el('agl-setup__body', null, 0), el('ag-table-wrap', null, 40), el('ag-table-wrap', null, 90), el('x', 'agl-ov-text', 7)]));
  assert.deepEqual(found.map(f => [f.key, f.n, f.top]), [['.ag-table-wrap', 0, 40], ['.ag-table-wrap', 1, 90], ['#agl-ov-text', 0, 7]]);
});

test('keepScroll: an in-place redraw of the Travel pane keeps the pane and nested scroll positions', () => {
  const pane = root([]);
  pane.scrollTop = 420;
  let kids = [el('ag-table-wrap', null, 55)];
  pane.querySelectorAll = () => kids;
  pane.querySelector = () => null;
  keepScroll(pane, () => { pane.scrollTop = 0; kids = [el('ag-table-wrap', null, 0)]; });   // the redraw resets both
  assert.equal(pane.scrollTop, 420);
  assert.equal(kids[0].scrollTop, 55);
});

test('keepScroll: focus returns to the same control without scrolling', () => {
  const calls = [];
  const sel = {tagName: 'SELECT', getAttribute: k => k === 'id' ? 'agl-ov-area' : null, focus: o => calls.push(o)};
  const pane = root([sel], {contains: e => e === sel});
  keepScroll(pane, () => {}, {active: sel});
  assert.deepEqual(calls, [{preventScroll: true}]);
});

test('window redraw keeps the scroll of containers the three named panes do not cover (GM Setup body)', () => {
  const body = el('agl-setup__body', null, 300);
  const before = {...root([body]), querySelector: () => null};
  const snap = captureView(before, {}, {selectedId: null, editorTab: 'content', active: null});
  const nextBody = el('agl-setup__body', null, 0);
  const after = {...root([nextBody]), querySelector: s => s === '.agl-setup__body' ? nextBody : null};
  restoreView(after, {}, snap);
  assert.equal(nextBody.scrollTop, 300);
});

test('the Travel tab redraws in place, and focusBack never scrolls (source wiring)', () => {
  const src = fs.readFileSync(new URL('../scripts/app.mjs', import.meta.url), 'utf8');
  assert.match(src, /async redrawTravel\(selector\)/);
  assert.match(src, /keepScroll\(pane,/);
  assert.match(src, /focusBack\(selector\) \{[^}]*focus\?\.\(\{preventScroll: true\}\)/);
  const travelDo = src.slice(src.indexOf('async travelDo('), src.indexOf('async saveSetup('));
  assert.ok(!/this\.render\(\)/.test(travelDo), 'travelDo no longer re-renders the whole window');
});
