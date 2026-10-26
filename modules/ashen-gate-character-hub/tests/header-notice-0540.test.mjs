/**
 * 0.54.0: the diamond message lives in the window's title bar. Mocked Foundry and a tiny fake DOM: this proves the markup,
 * the show / hide rules and the CSS text, not how the live window lays out or drags.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass} from '../scripts/sheet.mjs';
import {headerNotices, headerNoticeHtml, syncHeaderNotice} from '../scripts/header-notice.mjs';
import {DIAMOND_ABSENT, DIAMOND_PRESENT} from '../scripts/constants.mjs';

const css = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
const Hub = createHubSheetClass(FakeActorSheetV2);
const rule = sel => css.split('\n').find(l => l.startsWith(sel)) ?? '';

/** A header with a title and window buttons; the notice slot is inserted after the title. */
function fakeHeader() {
  const kids = [{name: 'title'}, {name: 'controls'}];
  const slot = {};
  const header = {
    ownerDocument: {createElement: () => { Object.assign(slot, {name: 'slot', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, remove() { kids.splice(kids.indexOf(slot), 1); slot.gone = true; }, addEventListener() {}}); return slot; }},
    querySelector: sel => sel === '[data-agch-notice-slot]' ? kids.find(k => k === slot) ?? null : null,
    append: n => kids.push(n)
  };
  const title = {after: n => kids.splice(1, 0, n)};
  let writes = 0;
  Object.defineProperty(slot, 'innerHTML', {get() { return this._h ?? ''; }, set(v) { this._h = v; writes++; }, configurable: true});
  return {header, title, slot, kids, writes: () => writes};
}
const sheetFor = (items, extra = {}) => {
  installGlobals({user: users.owner});
  const s = new Hub({document: makeActor({items})});
  const f = fakeHeader(); s.window = {header: f.header, title: f.title}; Object.assign(s, extra);
  return {s, f};
};

test('markup moves to the title bar: after the title, before the window buttons, once, on every tab, not in the panel', async () => {
  for (const tab of ['overview', 'combat', 'inventory', 'magic', 'features', 'journey']) {
    const {s, f} = sheetFor([{id: 'rope', name: '[TEST] Rope', type: 'loot'}]); s.tab = tab;
    const panel = await s._renderHTML();
    assert.doesNotMatch(panel, /resurrection diamond|agch-diamond|agch-notice/, `${tab}: not in the panel`);
    syncHeaderNotice(s);
    assert.deepEqual(f.kids.map(k => k.name), ['title', 'slot', 'controls'], `${tab}: between the title and the buttons`);
    const html = f.slot.innerHTML;
    assert.equal((html.match(/You do not possess a resurrection diamond/g) ?? []).length, 3, 'visible text once, plus the icon button label and tooltip');
    assert.match(html, /<p class="agch-notice__text is-danger" role="status"><i class="fa-solid fa-gem" aria-hidden="true"><\/i><span class="agch-notice__label">You do not possess a resurrection diamond<\/span><\/p>/);
  }
});

test('show / hide logic is unchanged: a diamond (any case, in a container) turns it green; Limited sees none', async () => {
  const none = headerNotices(makeActor({items: [{id: 'r', name: '[TEST] Rope', type: 'loot'}]}));
  assert.deepEqual(none.map(n => [n.tone, n.text]), [['danger', DIAMOND_ABSENT]]);
  const has = headerNotices(makeActor({items: [{id: 'p', name: '[TEST] Pack', type: 'container'}, {id: 'g', name: '[TEST] DIAMOND', type: 'loot', system: {container: 'p'}}]}));
  assert.deepEqual(has.map(n => [n.tone, n.text]), [['ok', DIAMOND_PRESENT]]);
  assert.deepEqual(headerNotices(makeActor(), {limited: true}), []);
  const {s, f} = sheetFor([{id: 'g', name: '[TEST] Diamond', type: 'loot'}]);
  syncHeaderNotice(s); assert.match(f.slot.innerHTML, /is-ok/); assert.match(f.slot.innerHTML, /Your soul may be returned/);
});

test('re-render with the same notice does not rewrite the bar (a screen reader does not hear it again); a change does', () => {
  const {s, f} = sheetFor([{id: 'r', name: '[TEST] Rope', type: 'loot'}]);
  syncHeaderNotice(s); syncHeaderNotice(s); syncHeaderNotice(s);
  assert.equal(f.writes(), 1);
  s.document.items.push({id: 'g', name: '[TEST] Diamond', type: 'loot'});
  syncHeaderNotice(s);
  assert.equal(f.writes(), 2);
});

test('hidden-state fallback: an icon button carries the full message (aria-label and tooltip); only CSS decides which one shows', () => {
  const html = headerNoticeHtml(headerNotices(makeActor({items: []})));
  const btn = html.match(/<button [^>]*data-notice-button[^>]*>/)[0];
  assert.match(btn, /type="button"/);
  assert.match(btn, /aria-label="You do not possess a resurrection diamond"/);
  assert.match(btn, /data-tooltip="You do not possess a resurrection diamond"/);
  assert.match(btn, /class="agch-notice__icon is-danger"/);
  assert.match(css, /\.agch-notice__icon \{[^}]*display: none/, 'icon hidden while the text shows');
  const q = css.slice(css.indexOf('@container agch-head (max-width: 900px)'));
  assert.match(q, /\.agch-notice__text[^{]*\{ display: none; \}/, 'text hidden under 900px');
  assert.match(q, /\.agch-notice__icon \{ display: inline-flex; \}/, 'icon shown instead');
  assert.match(css, /\.application\.agch-app > \.window-header \{ container: agch-head \/ inline-size; \}/, 'the title bar is the container');
});

test('Compact hides the text first and shows the icon', async () => {
  const {s, f} = sheetFor([{id: 'r', name: '[TEST] Rope', type: 'loot'}], {compact: true});
  syncHeaderNotice(s);
  assert.match(f.slot.innerHTML, /data-compact="true"/);
  assert.match(css, /\.agch-notice\[data-compact="true"\] \.agch-notice__text[^{]*\{ display: none; \}/);
  assert.match(css, /\.agch-notice\[data-compact="true"\] \.agch-notice__icon \{ display: inline-flex; \}/);
  s.compact = false; syncHeaderNotice(s);
  assert.match(f.slot.innerHTML, /data-compact="false"/);
});

test('drag region is not blocked: the text takes no pointer events; the notice is not a button or link except the narrow icon', () => {
  assert.match(rule('.application.agch-app .agch-notice__text '), /pointer-events: none/);
  assert.match(rule('.application.agch-app .agch-notice__text '), /white-space: nowrap/);
  assert.match(rule('.application.agch-app .agch-notice__label '), /text-overflow: ellipsis/);
  const html = headerNoticeHtml(headerNotices(makeActor({items: []})));
  assert.deepEqual([...html.matchAll(/<(button|a)\b/g)].map(m => m[1]), ['button']);
  assert.doesNotMatch(html, /draggable|data-action/);
});

test('several notices: the first shows, "+N" with a tooltip carries the rest, the icon button carries all', () => {
  const html = headerNoticeHtml([
    {id: 'a', tone: 'danger', icon: 'fa-solid fa-gem', text: 'First [TEST]'},
    {id: 'b', tone: 'ok', icon: 'fa-solid fa-gem', text: 'Second [TEST]'},
    {id: 'c', tone: 'ok', icon: 'fa-solid fa-gem', text: 'Third [TEST]'}]);
  assert.match(html, /<span class="agch-notice__label">First \[TEST\]<\/span>/);
  assert.match(html, /class="agch-notice__more" data-tooltip="Second \[TEST\]\. Third \[TEST\]" aria-label="2 more: Second \[TEST\]\. Third \[TEST\]">\+2<\/span>/);
  assert.match(html, /aria-label="First \[TEST\]\. Second \[TEST\]\. Third \[TEST\]"/);
  assert.doesNotMatch(html.match(/<p class="agch-notice__text[\s\S]*?<\/p>/)[0], /Second/);
  assert.equal(headerNoticeHtml([]), '');
});

test('no notices (or no header): the slot is removed or nothing happens', () => {
  const {s, f} = sheetFor([{id: 'r', name: '[TEST] Rope', type: 'loot'}]);
  syncHeaderNotice(s); assert.ok(f.kids.includes(f.slot));
  s.hubContext; syncHeaderNotice({...s, window: undefined});   // no header: no throw
  Object.defineProperty(s, 'hubContext', {get: () => ({limited: true})});
  syncHeaderNotice(s); assert.ok(f.slot.gone);
});

test('the title keeps its text and window buttons are not displaced: only an extra flex item between them', () => {
  assert.match(css, /\.window-header:has\(> \.agch-notice-slot\) \.window-title \{ flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis/);
  assert.match(rule('.application.agch-app .agch-notice-slot '), /margin-inline: auto/);
});
