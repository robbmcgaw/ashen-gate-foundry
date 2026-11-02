// 0.38.0: the condition picker (select-only combobox): markup, aria, keyboard, type-ahead, outside click, viewport flip/clamp.
// Fake DOM: proves the logic and the attributes, not how it looks or feels in a live browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pickerHTML, bindPicker, closePicker} from '../scripts/condition-picker.mjs';
import {pickerDoc, makeButton} from './picker-dom.mjs';

const choices = [
  {id: 'prone', label: 'Prone', img: 'i/prone.svg'}, {id: 'blinded', label: 'Blinded', img: 'i/blind.svg'}, {id: 'stunned', label: 'Stunned', img: 'i/stun.svg'},
  {id: 'poisoned', label: 'Poisoned', img: 'i/poison.svg'}, {id: 'raging', label: 'Raging', img: 'i/rage.svg'}, {id: 'zed', label: 'Zed Mark', img: 'i/z.svg'},
];
// Display order: Incapacitating [Stunned], Movement [Prone], Sensory [Blinded], Debilitating [Poisoned], Buffs [Raging], Other [Zed Mark]
const order = ['stunned', 'prone', 'blinded', 'poisoned', 'raging', 'zed'];
const setup = (opts = {}) => {
  const doc = pickerDoc(opts.view), btn = makeButton(doc, {value: opts.value ?? 'prone', box: opts.box});
  const picked = []; const p = bindPicker(btn, {choices, onChange: id => picked.push(id)});
  const rows = () => doc.body.querySelectorAll('[role="option"]');
  const key = (k, props = {}) => btn.dispatch('keydown', {key: k, ...props});
  const activeId = () => rows().find(r => r.attrs.has('data-active'))?.getAttribute('data-value');
  return {doc, btn, picked, p, rows, key, activeId};
};

test('closed markup: one combobox button with the icon and name, value, aria; the old select id and icon id are kept', () => {
  const html = pickerHTML({id: 'agu-condition-status', iconId: 'agu-condition-icon', choices, pick: 'blinded', label: 'Native condition'});
  assert.match(html, /<button type="button" id="agu-condition-status" class="ag-btn agu-combo__button" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="agu-condition-status-list" aria-label="Native condition" value="blinded">/);
  assert.match(html, /<img class="agu-status-icon agu-combo__icon" id="agu-condition-icon" src="i\/blind.svg" alt=""><span class="agu-combo__name">Blinded<\/span>/);
  assert.ok(!html.includes('<select') && !html.includes('<option'));
  assert.match(pickerHTML({id: 'a', choices, pick: 'nope', label: 'L'}), /value="prone"[^>]*>.*Prone/, 'an unknown pick shows the first');
  assert.match(pickerHTML({id: 'a', choices, pick: 'prone', label: 'L', disabled: true, describedBy: 'd'}), /aria-describedby="d" value="prone" disabled>/);
  assert.match(pickerHTML({id: 'a', choices: [], pick: '', label: 'L'}), / disabled>/);
});
test('open: listbox with groups (role=group, presentation headers) and options (icon + name, aria-selected); headers are not options', () => {
  const t = setup(); t.btn.click();
  assert.equal(t.btn.getAttribute('aria-expanded'), 'true');
  const list = t.doc.body.querySelector('[role="listbox"]');
  assert.equal(list.id, 'pick-list'); assert.equal(list.getAttribute('aria-label'), 'Condition');
  assert.deepEqual(t.rows().map(r => r.getAttribute('data-value')), order);
  const heads = t.doc.body.querySelectorAll('.agu-combo__head');
  assert.deepEqual(heads.map(h => h.textContent), ['Incapacitating', 'Movement restricting', 'Sensory and mental', 'Debilitating', 'Buffs and stances', 'Other']);
  assert.ok(heads.every(h => h.getAttribute('role') === 'presentation'));
  assert.equal(t.doc.body.querySelectorAll('[role="group"]').length, 6);
  assert.equal(t.doc.body.querySelectorAll('[role="group"]')[0].getAttribute('aria-labelledby'), heads[0].id);
  const prone = t.rows().find(r => r.getAttribute('data-value') === 'prone');
  assert.equal(prone.getAttribute('aria-selected'), 'true'); assert.equal(t.rows().filter(r => r.getAttribute('aria-selected') === 'true').length, 1);
  assert.equal(prone.querySelector('img').getAttribute('src'), 'i/prone.svg'); assert.equal(prone.querySelector('.agu-combo__name').textContent, 'Prone');
  assert.equal(t.activeId(), 'prone', 'opens on the current value'); assert.equal(t.btn.getAttribute('aria-activedescendant'), prone.id);
  assert.ok(t.rows().every(r => r.id.startsWith('pick-opt-')));
});
test('keyboard: Down/Up wrap, Home/End jump, Enter picks, focus stays on the button', () => {
  const t = setup({value: 'stunned'}); t.btn.focus();
  const e = t.key('ArrowDown'); assert.ok(e.defaultPrevented); assert.equal(t.p.isOpen, true);
  assert.equal(t.activeId(), 'stunned');
  t.key('ArrowDown'); assert.equal(t.activeId(), 'prone');
  t.key('ArrowUp'); t.key('ArrowUp'); assert.equal(t.activeId(), 'zed', 'wraps from the first to the last');
  t.key('Home'); assert.equal(t.activeId(), 'stunned'); t.key('End'); assert.equal(t.activeId(), 'zed');
  assert.equal(t.doc.activeElement, t.btn);
  t.key('ArrowUp'); t.key('Enter');
  assert.deepEqual(t.picked, ['raging']); assert.equal(t.btn.value, 'raging'); assert.equal(t.btn.getAttribute('value'), 'raging');
  assert.equal(t.btn.querySelector('.agu-combo__name').textContent, 'Raging'); assert.equal(t.btn.querySelector('img').getAttribute('src'), 'i/rage.svg');
  assert.equal(t.p.isOpen, false); assert.equal(t.btn.getAttribute('aria-expanded'), 'false'); assert.equal(t.btn.getAttribute('aria-activedescendant'), null);
  assert.equal(t.doc.activeElement, t.btn); assert.equal(t.doc.body.querySelectorAll('[role="listbox"]').length, 0, 'the layer is removed');
});
test('Space picks too; Enter and Space on the closed button open it; choosing the same value does not fire onChange', () => {
  const t = setup(); t.key('Enter'); assert.equal(t.p.isOpen, true); t.key(' '); assert.deepEqual(t.picked, [], 'same value: no change');
  assert.equal(t.p.isOpen, false); t.key(' '); assert.equal(t.p.isOpen, true); t.key('ArrowDown'); t.key(' ');
  assert.deepEqual(t.picked, ['blinded']);
  t.key('Home'); assert.equal(t.p.isOpen, true, 'Home opens on the first row'); assert.equal(t.activeId(), 'stunned');
});
test('Escape closes and returns focus to the button without changing the value; Tab closes and lets focus move on', () => {
  const t = setup(); t.btn.click(); t.key('ArrowDown'); t.doc.activeElement = null;
  const e = t.key('Escape'); assert.ok(e.defaultPrevented); assert.equal(t.p.isOpen, false); assert.equal(t.doc.activeElement, t.btn);
  assert.equal(t.btn.value, 'prone'); assert.deepEqual(t.picked, []);
  t.btn.click(); t.doc.activeElement = null; const tab = t.key('Tab'); assert.ok(!tab.defaultPrevented); assert.equal(t.p.isOpen, false); assert.equal(t.doc.activeElement, null);
});
test('type-ahead: a letter on the closed button opens at the first match; the same letter again cycles', () => {
  const t = setup(); t.key('b'); assert.equal(t.p.isOpen, true); assert.equal(t.activeId(), 'blinded');
  t.key('Escape'); const u = setup({value: 'prone'}); u.btn.click(); u.key('p'); assert.equal(u.activeId(), 'poisoned', 'next P after Prone in the list'); u.key('p'); assert.equal(u.activeId(), 'prone');
});
test('type-ahead details', () => {
  const t = setup({value: 'stunned'}); t.btn.click();
  t.key('p'); assert.equal(t.activeId(), 'prone'); t.key('o'); assert.equal(t.activeId(), 'poisoned', '"po" narrows to Poisoned');
  t.key('x'); assert.equal(t.activeId(), 'poisoned', 'no match: the highlight stays');
  const t2 = setup({value: 'prone'}); t2.btn.click(); t2.key('z'); assert.equal(t2.activeId(), 'zed'); t2.key('Escape');
  assert.equal(setup().p.isOpen, false);
});
test('mouse: clicking a row picks it; the pointer highlights; clicking the button again closes; click outside closes; click inside the list does not', () => {
  const t = setup(); t.btn.click();
  const stun = t.rows().find(r => r.getAttribute('data-value') === 'stunned');
  const md = stun.dispatch('mousedown'); assert.ok(md.defaultPrevented, 'keeps focus on the button');
  stun.dispatch('mousemove'); assert.equal(t.activeId(), 'stunned');
  t.doc.fire('pointerdown', {target: stun}); assert.equal(t.p.isOpen, true);
  t.doc.fire('pointerdown', {target: t.btn}); assert.equal(t.p.isOpen, true, 'the button handles its own click');
  t.btn.click(); assert.equal(t.p.isOpen, false);
  t.btn.click(); t.doc.fire('pointerdown', {target: t.doc.body}); assert.equal(t.p.isOpen, false); assert.equal(t.doc.listenerCount(), 0, 'no listeners left on the document');
  t.btn.click();
  const again = t.rows().find(r => r.getAttribute('data-value') === 'stunned'); again.click();
  assert.deepEqual(t.picked, ['stunned']);
});
test('scrolling the page, resizing the window or losing the window closes the list; scrolling inside it does not', () => {
  const t = setup(); t.btn.click(); const list = t.doc.body.querySelector('[role="listbox"]');
  t.doc.fire('scroll', {target: list}); assert.equal(t.p.isOpen, true);
  t.doc.fire('scroll', {target: t.doc.body}); assert.equal(t.p.isOpen, false);
  t.btn.click(); t.doc.wfire('resize'); assert.equal(t.p.isOpen, false);
  t.btn.click(); t.doc.wfire('blur'); assert.equal(t.p.isOpen, false);
});
test('only one list is open at a time; closePicker() closes it before a window re-renders', () => {
  const t = setup(); const b2 = makeButton(t.doc, {id: 'two', value: 'prone', box: {left: 20, top: 80, width: 200, height: 28}}); const p2 = bindPicker(b2, {choices});
  t.btn.click(); p2.open(); assert.equal(t.p.isOpen, false); assert.equal(p2.isOpen, true);
  closePicker(); assert.equal(p2.isOpen, false); assert.equal(t.doc.body.querySelectorAll('[role="listbox"]').length, 0);
});
test('disabled: does not open by click or key', () => {
  const t = setup(); t.btn.disabled = true; t.btn.click(); t.key('ArrowDown'); assert.equal(t.p.isOpen, false);
});
test('placement: opens below, flips above near the bottom, clamps to the viewport sides, caps the height to the room', () => {
  const low = setup({view: {width: 400, height: 300}, box: {left: 10, top: 250, width: 200, height: 28}}); low.btn.click();
  const layer = low.doc.body.querySelector('.agu-combo-layer');
  assert.equal(layer.style.get('bottom'), `${300 - 250 + 2}px`); assert.equal(layer.style.get('top'), 'auto');
  assert.ok(parseInt(layer.style.get('max-height')) <= 250 - 8, 'fits above the button');
  const high = setup({box: {left: 20, top: 20, width: 200, height: 28}}); high.btn.click();
  const l2 = high.doc.body.querySelector('.agu-combo-layer'); assert.equal(l2.style.get('top'), '50px'); assert.equal(l2.style.get('bottom'), 'auto'); assert.equal(l2.style.get('left'), '20px');
  const edge = setup({view: {width: 300, height: 700}, box: {left: 250, top: 20, width: 200, height: 28}}); edge.btn.click();
  const l3 = edge.doc.body.querySelector('.agu-combo-layer'); assert.equal(l3.style.get('left'), '92px', 'pulled back so the 200px layer ends 8px inside the 300px viewport');
  assert.equal(l3.style.get('min-width'), '200px');
  assert.equal(l3.getAttribute('class').split(/\s+/).includes('ag-app'), true, 'carries the kit tokens');
});
