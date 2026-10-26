// A tiny mocked DOM for the shared kit tests: elements with attributes, children, events, focus and a selector
// matcher for compound selectors (tag, .class, [attr], [attr="v"], comma lists). No layout, no real browser.
const camel = s => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const kebab = s => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);

export class FakeElement {
  constructor(tag, attrs = {}, doc = null) {
    this.tagName = tag.toUpperCase();
    this.attrs = new Map();
    this.children = [];
    this.parentElement = null;
    this.listeners = {};
    this.ownerDocument = doc;
    this.disabled = false;
    this.hidden = false;
    this.open = false;
    this.textContent = '';
    this.value = '';
    this.files = [];
    this.clicks = 0;
    const self = this;
    this.dataset = new Proxy({}, {
      get: (_, k) => self.attrs.get(`data-${kebab(String(k))}`),
      set: (_, k, v) => { self.attrs.set(`data-${kebab(String(k))}`, String(v)); return true; },
      deleteProperty: (_, k) => { self.attrs.delete(`data-${kebab(String(k))}`); return true; },
      has: (_, k) => self.attrs.has(`data-${kebab(String(k))}`),
      ownKeys: () => [...self.attrs.keys()].filter(a => a.startsWith('data-')).map(a => camel(a.slice(5))),
      getOwnPropertyDescriptor: () => ({enumerable: true, configurable: true}),
    });
    this.classList = {contains: c => (self.attrs.get('class') ?? '').split(/\s+/).includes(c)};
    for (const [k, v] of Object.entries(attrs)) this.setAttribute(k, v);
  }
  get id() { return this.attrs.get('id') ?? ''; }
  set id(v) { this.attrs.set('id', String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  removeAttribute(k) { this.attrs.delete(k); }
  getAttributeNames() { return [...this.attrs.keys()]; }
  append(...kids) { for (const k of kids) { k.parentElement = this; k.ownerDocument ??= this.ownerDocument; this.children.push(k); } return this; }
  remove() { const p = this.parentElement; if (p) { p.children = p.children.filter(c => c !== this); this.parentElement = null; } }
  replaceWith(el) { const p = this.parentElement; if (!p) return; p.children = p.children.map(c => c === this ? el : c); el.parentElement = p; el.ownerDocument ??= p.ownerDocument; this.parentElement = null; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] ?? []).filter(f => f !== fn); }
  /** Bubbles like a DOM event; returns the event so tests can read defaultPrevented. */
  dispatch(type, props = {}) {
    const event = {type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...props};
    const results = [];
    for (let el = this; el; el = el.parentElement) for (const fn of [...(el.listeners[type] ?? [])]) results.push(fn(event));
    event.results = results;
    return event;
  }
  click() { this.clicks++; return this.dispatch('click'); }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  matches(selector) { return selector.split(',').some(one => matchCompound(this, one.trim())); }
  closest(selector) { for (let el = this; el; el = el.parentElement) if (el.matches(selector)) return el; return null; }
  *descendants() { for (const c of this.children) { yield c; yield* c.descendants(); } }
  querySelectorAll(selector) { return [...this.descendants()].filter(el => el.matches(selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}

function matchCompound(el, sel) {
  const parts = sel.match(/^[a-z]+|\.[\w-]+|\[[^\]]+\]/gi) ?? [];
  if (parts.join('') !== sel) throw new Error(`fake-dom cannot match selector "${sel}"`);
  return parts.every(p => {
    if (p.startsWith('.')) return el.classList.contains(p.slice(1));
    if (p.startsWith('[')) {
      const [, name, value] = p.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/) ?? [];
      return value === undefined ? el.attrs.has(name) : el.getAttribute(name) === value;
    }
    return el.tagName === p.toUpperCase();
  });
}

export class FakeDocument {
  constructor() { this.activeElement = null; this.body = new FakeElement('body', {}, this); }
  createElement(tag, attrs) { return new FakeElement(tag, attrs, this); }
  getElementById(id) { return this.body.querySelectorAll(`[id="${id}"]`)[0] ?? null; }
}

/** A Map-backed localStorage stand-in. */
export function fakeStorage() {
  const m = new Map();
  return {getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), map: m};
}
