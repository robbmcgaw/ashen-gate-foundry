import test from 'node:test';
import assert from 'node:assert/strict';
import {FakeDocument} from './fake-dom.mjs';
import {HTML} from './kit-path.mjs';
const {bindRadioGroups} = await import(HTML);

/** A radiogroup of buttons like the kit's .ag-segmented; `checked` is the index with aria-checked="true" (or -1). */
function group(doc, {checked = 0, label = 'Mode', values = ['a', 'b', 'c'], parent = doc.body, tabindex = false} = {}) {
  const g = doc.createElement('div', {class: 'ag-segmented', role: 'radiogroup', 'aria-label': label});
  const radios = values.map((v, i) => {
    const r = doc.createElement('button', {role: 'radio', 'data-value': v, 'aria-checked': String(i === checked)});
    if (tabindex) r.setAttribute('tabindex', i === checked ? '0' : '-1');
    return r;
  });
  g.append(...radios);
  parent.append(g);
  return {g, radios};
}
const key = (el, k, extra = {}) => el.dispatch('keydown', {key: k, ...extra});
const checkedOf = radios => radios.map(r => r.getAttribute('aria-checked'));
const stops = radios => radios.map(r => r.getAttribute('tabindex'));

test('bindRadioGroups: roving tabindex puts one Tab stop on the checked radio (the first when none is checked)', () => {
  const doc = new FakeDocument();
  const {radios} = group(doc, {checked: 1});
  const none = group(doc, {checked: -1, label: 'None'});
  bindRadioGroups(doc.body);
  assert.deepEqual(stops(radios), ['-1', '0', '-1']);
  assert.deepEqual(stops(none.radios), ['0', '-1', '-1']);
});

test('bindRadioGroups: arrows move focus and select through the module click handler, wrapping; Home/End jump', () => {
  const doc = new FakeDocument();
  const {radios} = group(doc, {checked: 0});
  const picked = [];
  // The module's own handler: moves aria-checked itself, as the real ones do.
  for (const r of radios) r.addEventListener('click', () => { picked.push(r.dataset.value); radios.forEach(x => x.setAttribute('aria-checked', String(x === r))); });
  bindRadioGroups(doc.body);
  assert.ok(key(radios[0], 'ArrowRight').defaultPrevented);
  assert.equal(doc.activeElement, radios[1]);
  assert.deepEqual(picked, ['b']);
  assert.deepEqual(checkedOf(radios), ['false', 'true', 'false']);
  assert.deepEqual(stops(radios), ['-1', '0', '-1'], 'the Tab stop follows the selection');
  key(radios[1], 'ArrowDown');
  assert.equal(doc.activeElement, radios[2]);
  key(radios[2], 'ArrowRight');
  assert.equal(doc.activeElement, radios[0], 'Right on the last radio wraps to the first');
  key(radios[0], 'ArrowLeft');
  assert.equal(doc.activeElement, radios[2], 'Left on the first wraps to the last');
  key(radios[2], 'ArrowUp');
  assert.equal(doc.activeElement, radios[1]);
  key(radios[1], 'Home');
  assert.equal(doc.activeElement, radios[0]);
  key(radios[0], 'End');
  assert.equal(doc.activeElement, radios[2]);
  assert.deepEqual(picked, ['b', 'c', 'a', 'c', 'b', 'a', 'c']);
  assert.deepEqual(checkedOf(radios), ['false', 'false', 'true']);
});

test('bindRadioGroups: aria-checked is kept in sync when the module handler leaves it alone', () => {
  const doc = new FakeDocument();
  const {radios} = group(doc, {checked: 0});
  bindRadioGroups(doc.body);
  key(radios[0], 'ArrowRight');
  assert.deepEqual(checkedOf(radios), ['false', 'true', 'false']);
  assert.deepEqual(stops(radios), ['-1', '0', '-1']);
});

test('bindRadioGroups: skips disabled radios, ignores other keys and modified keys, and a lone radio stays put', () => {
  const doc = new FakeDocument();
  const {radios} = group(doc, {checked: 0});
  radios[1].disabled = true;
  bindRadioGroups(doc.body);
  key(radios[0], 'ArrowRight');
  assert.equal(doc.activeElement, radios[2], 'the disabled radio is skipped');
  assert.equal(stops(radios)[1], '-1');
  assert.equal(key(radios[2], 'a').defaultPrevented, false, 'other keys are left alone');
  assert.equal(key(radios[2], 'ArrowRight', {ctrlKey: true}).defaultPrevented, false, 'Ctrl+Arrow is not ours');
  assert.equal(key(radios[2], 'ArrowRight', {altKey: true}).defaultPrevented, false);
  const one = group(doc, {values: ['x'], label: 'One'});
  const before = one.radios[0].clicks;
  assert.ok(key(one.radios[0], 'ArrowRight').defaultPrevented);
  assert.equal(one.radios[0].clicks, before, 'a single radio is not re-clicked');
});

test('bindRadioGroups: each group keeps to itself and a group nested in a container is found', () => {
  const doc = new FakeDocument();
  const wrap = doc.createElement('section');
  doc.body.append(wrap);
  const one = group(doc, {parent: wrap, label: 'One'});
  const two = group(doc, {parent: wrap, label: 'Two', checked: 2});
  bindRadioGroups(wrap);
  key(one.radios[0], 'ArrowRight');
  assert.equal(doc.activeElement, one.radios[1]);
  key(two.radios[2], 'Home');
  assert.equal(doc.activeElement, two.radios[0]);
  assert.deepEqual(checkedOf(one.radios), ['false', 'true', 'false']);
  assert.deepEqual(checkedOf(two.radios), ['true', 'false', 'false']);
});

test('bindRadioGroups: calling it after every render adds ONE listener per root (no double steps) and unbind removes it', () => {
  const doc = new FakeDocument();
  const {radios} = group(doc, {checked: 0});
  const first = bindRadioGroups(doc.body);
  const second = bindRadioGroups(doc.body);
  const third = bindRadioGroups(doc.body);
  assert.equal(doc.body.listeners.keydown.length, 1);
  assert.equal(doc.body.listeners.click.length, 1);
  assert.equal(first, second);
  assert.equal(second, third);
  let n = 0;
  radios.forEach(r => r.addEventListener('click', () => n++));
  key(radios[0], 'ArrowRight');
  assert.equal(n, 1, 'one arrow press is one click');
  assert.equal(doc.activeElement, radios[1]);
  first();
  assert.equal(doc.body.listeners.keydown.length, 0);
  key(radios[1], 'ArrowRight');
  assert.equal(doc.activeElement, radios[1], 'after unbind the arrows do nothing');
  assert.equal(bindRadioGroups(doc.body) !== first, true, 'binding again after unbind works');
  assert.equal(doc.body.listeners.keydown.length, 1);
});

test('bindRadioGroups: nested bound roots do not both handle one key press', () => {
  const doc = new FakeDocument();
  const inner = doc.createElement('div');
  doc.body.append(inner);
  const {radios} = group(doc, {parent: inner, checked: 0});
  bindRadioGroups(doc.body);
  bindRadioGroups(inner);
  let n = 0;
  radios.forEach(r => r.addEventListener('click', () => n++));
  key(radios[0], 'ArrowRight');
  assert.equal(n, 1);
  assert.equal(doc.activeElement, radios[1]);
});

test('bindRadioGroups: mouse clicks re-sync the Tab stop; groups rendered later work with the same listener', () => {
  const doc = new FakeDocument();
  const {radios} = group(doc, {checked: 0});
  radios[2].addEventListener('click', () => radios.forEach(x => x.setAttribute('aria-checked', String(x === radios[2]))));
  bindRadioGroups(doc.body);
  radios[2].click();
  assert.deepEqual(stops(radios), ['-1', '-1', '0']);
  const later = group(doc, {label: 'Later'});
  bindRadioGroups(doc.body);
  assert.deepEqual(stops(later.radios), ['0', '-1', '-1']);
  key(later.radios[0], 'End');
  assert.equal(doc.activeElement, later.radios[2]);
});

test('bindRadioGroups: focus lost to a re-render is restored to the same radio on the next bind', () => {
  const doc = new FakeDocument();
  const area = doc.createElement('div');
  doc.body.append(area);
  const first = group(doc, {parent: area, label: 'Re-rendered'});
  const rerender = () => {
    first.g.remove();
    first.radios.forEach(r => { r.isConnected = false; });
    return group(doc, {parent: area, label: 'Re-rendered', checked: 1});
  };
  let fresh;
  first.radios[1].addEventListener('click', () => { fresh = rerender(); doc.activeElement = null; });
  bindRadioGroups(area);
  key(first.radios[0], 'ArrowRight');
  assert.equal(doc.activeElement, null, 'the browser dropped focus with the old node');
  bindRadioGroups(area);
  assert.equal(doc.activeElement, fresh.radios[1], 'the same radio (by label and data-value) has focus again');
});

test('bindRadioGroups: does not steal focus the user has moved elsewhere, and tolerates empty roots', () => {
  const doc = new FakeDocument();
  const area = doc.createElement('div');
  const other = doc.createElement('input');
  doc.body.append(area, other);
  const first = group(doc, {parent: area, label: 'Left alone'});
  bindRadioGroups(area);
  key(first.radios[0], 'ArrowRight');
  other.focus();
  bindRadioGroups(area);
  assert.equal(doc.activeElement, other);
  assert.doesNotThrow(() => bindRadioGroups(null)());
  assert.doesNotThrow(() => bindRadioGroups(doc.createElement('div'))());
});

test('bindRadioGroups: a stand-in root without addEventListener (module tests) is synced but not listened to', () => {
  const doc = new FakeDocument();
  const {g, radios} = group(doc, {checked: 1});
  const stub = {querySelectorAll: sel => sel === '[role="radiogroup"]' ? [g] : [], matches: () => false};
  assert.doesNotThrow(() => bindRadioGroups(stub)());
  assert.deepEqual(stops(radios), ['-1', '0', '-1']);
});
