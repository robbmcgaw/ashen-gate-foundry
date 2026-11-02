// Test helper (not a test): a FakeDocument with document-level listeners, a viewport and elements that have inline style and a box.
import {FakeDocument} from '../../../scripts/kit-tests/fake-dom.mjs';
export function pickerDoc({width = 1000, height = 700} = {}) {
  const doc = new FakeDocument(), listeners = {}, wlisteners = {};
  doc.addEventListener = (t, fn) => { (listeners[t] ??= []).push(fn); };
  doc.removeEventListener = (t, fn) => { listeners[t] = (listeners[t] ?? []).filter(f => f !== fn); };
  doc.fire = (t, props = {}) => { for (const fn of [...(listeners[t] ?? [])]) fn({type: t, ...props}); };
  doc.listenerCount = () => Object.values(listeners).reduce((n, a) => n + a.length, 0);
  doc.defaultView = {innerWidth: width, innerHeight: height, addEventListener: (t, fn) => { (wlisteners[t] ??= []).push(fn); }, removeEventListener: (t, fn) => { wlisteners[t] = (wlisteners[t] ?? []).filter(f => f !== fn); }};
  doc.wfire = t => { for (const fn of [...(wlisteners[t] ?? [])]) fn({type: t}); };
  const make = doc.createElement.bind(doc);
  doc.createElement = (tag, attrs) => {
    const el = make(tag, attrs), props = new Map();
    el.style = {setProperty: (k, v) => props.set(k, v), get: k => props.get(k)};
    el.box = {left: 0, top: 0, width: 0, height: 0};
    el.getBoundingClientRect = () => ({left: el.box.left, top: el.box.top, width: el.box.width, height: el.box.height, right: el.box.left + el.box.width, bottom: el.box.top + el.box.height});
    Object.defineProperty(el, 'offsetWidth', {get: () => el.box.width});
    return el;
  };
  return doc;
}
/** A combobox button in a pickerDoc, at the given box. */
export function makeButton(doc, {id = 'pick', value = '', box = {left: 20, top: 20, width: 200, height: 28}} = {}) {
  const b = doc.createElement('button', {id, role: 'combobox', value, 'aria-label': 'Condition'});
  b.value = value; b.box = box;
  const img = doc.createElement('img'), name = doc.createElement('span', {class: 'agu-combo__name'});
  b.append(img, name); doc.body.append(b);
  return b;
}
