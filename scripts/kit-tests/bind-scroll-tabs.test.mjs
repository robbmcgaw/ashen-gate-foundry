import test from 'node:test';
import assert from 'node:assert/strict';
import {FakeDocument} from './fake-dom.mjs';
import {HTML} from './kit-path.mjs';
const {bindScrollTabs, bindTablist} = await import(HTML);

/** A tab strip whose geometry the test controls: `box` is the strip, each tab reports a rect inside it. */
function strip(doc, {cls = 'ag-tabs ag-tabs--scroll', scrollWidth = 600, clientWidth = 300, scrollHeight = 40, clientHeight = 40, selected = 0, tabW = 100} = {}) {
  const list = doc.createElement('div', {class: cls, role: 'tablist'});
  Object.assign(list, {scrollWidth, clientWidth, scrollHeight, clientHeight, scrollLeft: 0, scrollTop: 0});
  list.getBoundingClientRect = () => ({left: 0, right: list.clientWidth, top: 0, bottom: list.clientHeight});
  const tabs = Array.from({length: 6}, (_, i) => {
    const t = doc.createElement('button', {role: 'tab', 'aria-selected': String(i === selected)});
    t.getBoundingClientRect = () => ({left: i * tabW - list.scrollLeft, right: (i + 1) * tabW - list.scrollLeft, top: 0, bottom: 30});
    return t;
  });
  list.append(...tabs);
  doc.body.append(list);
  return {list, tabs};
}
const more = list => [list.getAttribute('data-ag-more-before') !== null, list.getAttribute('data-ag-more-after') !== null];

test('bindScrollTabs: marks only the edges that have hidden tabs, and follows the scroll position', () => {
  const doc = new FakeDocument();
  const {list} = strip(doc);
  bindScrollTabs(list);
  assert.deepEqual(more(list), [false, true], 'at the start only the end is cut off');
  assert.equal(list.getAttribute('data-ag-axis'), 'x');
  list.scrollLeft = 150;
  list.dispatch('scroll');
  assert.deepEqual(more(list), [true, true], 'in the middle both ends are');
  list.scrollLeft = 300;
  list.dispatch('scroll');
  assert.deepEqual(more(list), [true, false], 'at the end only the start is cut off');
});

test('bindScrollTabs: no cue when every tab fits; the cue goes when the window grows', () => {
  const doc = new FakeDocument();
  const {list} = strip(doc, {scrollWidth: 300, clientWidth: 300});
  bindScrollTabs(list);
  assert.deepEqual(more(list), [false, false]);
  assert.equal(list.getAttribute('data-ag-axis'), null);
  list.scrollWidth = 520;
  list.dispatch('scroll');
  assert.deepEqual(more(list), [false, true]);
  list.scrollWidth = 300;
  list.dispatch('scroll');
  assert.deepEqual(more(list), [false, false]);
});

test('bindScrollTabs: a vertical rail that overflows is marked on the y axis', () => {
  const doc = new FakeDocument();
  const {list} = strip(doc, {cls: 'ag-siderail', scrollWidth: 60, clientWidth: 60, scrollHeight: 500, clientHeight: 200});
  bindScrollTabs(list);
  assert.equal(list.getAttribute('data-ag-axis'), 'y');
  assert.deepEqual(more(list), [false, true]);
  list.scrollTop = 300;
  list.dispatch('scroll');
  assert.deepEqual(more(list), [true, false]);
});

test('bindScrollTabs: the selected tab is scrolled into view when the strip is bound (a re-render resets the scroll)', () => {
  const doc = new FakeDocument();
  const {list} = strip(doc, {selected: 5});
  bindScrollTabs(list);
  assert.ok(list.scrollLeft >= 600 - 300 - 28 + 0, `scrolled right to show the last tab (${list.scrollLeft})`);
  assert.deepEqual(more(list), [true, false]);
  const {list: first} = strip(doc, {selected: 0});
  bindScrollTabs(first);
  assert.equal(first.scrollLeft, 0, 'a visible selected tab leaves the scroll alone');
});

test('bindScrollTabs: one listener set per strip however often it is called; unbind removes it', () => {
  const doc = new FakeDocument();
  const {list} = strip(doc);
  const a = bindScrollTabs(list);
  const b = bindScrollTabs(list);
  assert.equal(a, b);
  assert.equal(list.listeners.scroll.length, 1);
  a();
  assert.equal(list.listeners.scroll.length, 0);
  assert.equal(bindScrollTabs(list) !== a, true);
  assert.equal(list.listeners.scroll.length, 1);
});

test('bindScrollTabs: watches size changes with a ResizeObserver when there is one, and stops on unbind', () => {
  const seen = [];
  globalThis.ResizeObserver = class { constructor(fn) { this.fn = fn; seen.push(this); this.targets = []; } observe(t) { this.targets.push(t); } disconnect() { this.gone = true; } };
  try {
    const doc = new FakeDocument();
    const {list, tabs} = strip(doc);
    const unbind = bindScrollTabs(list);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].targets.length, 1 + tabs.length);
    list.clientWidth = 700;
    seen[0].fn();
    assert.deepEqual(more(list), [false, false], 'a resize that makes everything fit clears the cue');
    unbind();
    assert.equal(seen[0].gone, true);
  } finally { delete globalThis.ResizeObserver; }
});

test('bindScrollTabs: harmless on elements without geometry and on nothing', () => {
  const doc = new FakeDocument();
  const plain = doc.createElement('div', {class: 'ag-tabs ag-tabs--scroll'});
  assert.doesNotThrow(() => bindScrollTabs(plain)());
  assert.doesNotThrow(() => bindScrollTabs(null)());
  assert.equal(plain.getAttribute('data-ag-axis'), null);
});

test('bindTablist wires the scroll cue for scrolling strips only, and its unbind removes both', () => {
  const doc = new FakeDocument();
  const {list} = strip(doc);
  const unbind = bindTablist(list);
  assert.deepEqual(more(list), [false, true]);
  assert.equal(list.listeners.scroll.length, 1);
  const {list: sub} = strip(doc, {cls: 'ag-tabs ag-tabs--sub'});
  bindTablist(sub);
  assert.equal(sub.listeners.scroll, undefined, 'a sub-tab row is not a scrolling strip');
  unbind();
  assert.equal(list.listeners.scroll.length, 0);
});
