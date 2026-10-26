import test from 'node:test';
import assert from 'node:assert/strict';
import {FakeDocument} from './fake-dom.mjs';
import {HTML} from './kit-path.mjs';
const {bindSplitNav, showSplitDetail, showSplitList, isSplitStacked} = await import(HTML);
const sleep = ms => new Promise(r => setTimeout(r, ms));

globalThis.getComputedStyle = el => ({gridTemplateColumns: el.getAttribute('data-cols') ?? '300px 700px'});
const scrolls = [];
function mark(el) { el.scrollIntoView = opts => scrolls.push({el, ...opts}); return el; }

/** A split: list with rows (button.ag-row, selected one has aria-current), detail with a heading and a field. */
function build(doc, {stacked = true, selected = 0, rows = 4, parent = doc.body} = {}) {
  const root = doc.createElement('div');
  const create = doc.createElement('button', {'data-action': 'new'});
  const split = doc.createElement('div', {class: 'ag-split', 'data-cols': stacked ? '360px' : '300px 700px'});
  const list = doc.createElement('aside', {class: 'ag-split__list'});
  const buttons = Array.from({length: rows}, (_, i) => {
    const b = doc.createElement('button', {'data-action': 'select', 'data-id': `R${i}`});
    if (i === selected) b.setAttribute('aria-current', 'true');
    return mark(b);
  });
  const filter = doc.createElement('button', {'data-action': 'filters'});
  const box = doc.createElement('input', {type: 'checkbox'});
  list.append(filter, box, ...buttons);
  const detail = mark(doc.createElement('section', {class: 'ag-split__detail'}));
  const heading = doc.createElement('h2');
  const field = doc.createElement('input');
  detail.append(heading, field);
  split.append(list, detail);
  root.append(create, split);
  parent.append(root);
  // The module's own click handler: moves the selection, as every module does (here without re-rendering).
  list.addEventListener('click', e => { const b = e.target.closest('button'); if (b?.dataset.action === 'select') { buttons.forEach(x => x.removeAttribute('aria-current')); b.setAttribute('aria-current', 'true'); } });
  return {root, split, list, detail, heading, field, buttons, create, filter, box};
}

test('bindSplitNav: adds one Back to list button per detail, however often it is called, and one root listener', () => {
  const doc = new FakeDocument();
  const {root, detail} = build(doc);
  const a = bindSplitNav(root), b = bindSplitNav(root);
  assert.equal(a, b);
  assert.equal(root.listeners.click.length, 1);
  const backs = detail.children.filter(c => c.classList.contains('ag-split__back'));
  assert.equal(backs.length, 1);
  assert.equal(detail.children[0], backs[0], 'first thing in the detail');
  assert.equal(backs[0].getAttribute('type'), 'button');
  assert.match(backs[0].innerHTML, /Back to list/);
  a();
  assert.equal(root.listeners.click.length, 0);
  assert.doesNotThrow(() => bindSplitNav(null)());
});

test('isSplitStacked reads the column count', () => {
  const doc = new FakeDocument();
  assert.equal(isSplitStacked(build(doc, {stacked: true}).split), true);
  assert.equal(isSplitStacked(build(doc, {stacked: false}).split), false);
});

test('picking a row in a stacked split scrolls the detail into view and focuses its heading', async () => {
  const doc = new FakeDocument();
  const {root, detail, heading, buttons} = build(doc);
  bindSplitNav(root);
  scrolls.length = 0;
  buttons[2].click();
  assert.equal(scrolls.length, 0, 'not before the module has had its say');
  await sleep(450);
  const s = scrolls.find(x => x.el === detail);
  assert.ok(s, 'the detail was scrolled to');
  assert.equal(s.block, 'start');
  assert.equal(s.behavior, 'smooth');
  assert.equal(doc.activeElement, heading);
  assert.equal(heading.getAttribute('tabindex'), '-1');
});

test('reduced motion scrolls instantly', async () => {
  const doc = new FakeDocument();
  globalThis.matchMedia = q => ({matches: /reduce/.test(q)});
  try {
    const {root, detail, buttons} = build(doc);
    bindSplitNav(root);
    scrolls.length = 0;
    buttons[1].click();
    await sleep(450);
    assert.equal(scrolls.find(x => x.el === detail).behavior, 'auto');
  } finally { delete globalThis.matchMedia; }
});

test('side by side (not stacked) nothing scrolls or moves focus', async () => {
  const doc = new FakeDocument();
  const {root, buttons} = build(doc, {stacked: false});
  bindSplitNav(root);
  scrolls.length = 0;
  buttons[2].click();
  await sleep(450);
  assert.equal(scrolls.length, 0);
  assert.equal(doc.activeElement, null);
});

test('controls that do not select a row (filters, checkboxes, a row that is not selected afterwards) do nothing', async () => {
  const doc = new FakeDocument();
  const {root, filter, box} = build(doc);
  bindSplitNav(root);
  scrolls.length = 0;
  filter.click();
  box.click();
  await sleep(450);
  assert.equal(scrolls.length, 0);
});

test('a module that re-renders: the click is acted on by the next bindSplitNav call, on the new nodes', () => {
  const doc = new FakeDocument();
  const old = build(doc);
  bindSplitNav(old.root);
  scrolls.length = 0;
  old.buttons[3].click();
  old.root.remove();
  const fresh = build(doc, {selected: 3});
  bindSplitNav(fresh.root);
  const s = scrolls.find(x => x.el === fresh.detail);
  assert.ok(s, 'scrolled to the new detail');
  assert.equal(doc.activeElement, fresh.heading);
  scrolls.length = 0;
  bindSplitNav(fresh.root);
  assert.equal(scrolls.length, 0, 'acted on once');
});

test('a create control brings the new record into view on the next render', () => {
  const doc = new FakeDocument();
  const a = build(doc);
  bindSplitNav(a.root, {create: '[data-action="new"]'});
  scrolls.length = 0;
  a.create.click();
  const b = build(doc, {selected: -1});
  bindSplitNav(b.root, {create: '[data-action="new"]'});
  assert.ok(scrolls.find(x => x.el === b.detail));
  assert.equal(doc.activeElement, b.heading);
});

test('with no heading the first control in the detail gets focus (not the Back button)', () => {
  const doc = new FakeDocument();
  const {root, split, detail, heading, field} = build(doc);
  heading.remove();
  bindSplitNav(root);
  assert.ok(showSplitDetail(split));
  assert.equal(doc.activeElement, field);
  assert.equal(detail.children[0].classList.contains('ag-split__back'), true);
});

test('Back to list scrolls the selected row to the middle and focuses it', () => {
  const doc = new FakeDocument();
  const {root, detail, buttons} = build(doc, {selected: 2});
  bindSplitNav(root);
  const back = detail.children[0];
  scrolls.length = 0;
  back.click();
  const s = scrolls.find(x => x.el === buttons[2]);
  assert.ok(s);
  assert.equal(s.block, 'center');
  assert.equal(doc.activeElement, buttons[2]);
});

test('showSplitList with nothing selected scrolls to the list itself; tolerates empty splits', () => {
  const doc = new FakeDocument();
  const {split, list} = build(doc, {selected: -1});
  mark(list);
  scrolls.length = 0;
  assert.ok(showSplitList(split));
  assert.equal(scrolls[0].el, list);
  assert.equal(showSplitList(doc.createElement('div')), false);
  assert.equal(showSplitDetail(doc.createElement('div')), false);
});
