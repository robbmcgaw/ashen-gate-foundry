/**
 * 0.33.0 UI cleanup: focus kept on buttons and moved into / out of popovers (CH-02), the kit tab keyboard bound to the
 * Hub's own rows only (CH-20), Delete on a quick-bar slot (CH-11), Filters (n) (CH-07), button names (CH-18), the narrow
 * fold (CH-09), the per-render skin copy (GM-CO-04) and Help groups (CH-25). Mocked Foundry and a tiny fake DOM: this
 * proves the logic and wiring, not the live Foundry window, real focus or the browser's layout.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass, ACTIONS, hubUi} from '../scripts/sheet.mjs';
import {captureFocus, restoreFocus, focusFirstIn} from '../scripts/redraw.mjs';
import {ariaName, btn} from '../scripts/buttons.mjs';
import {activeFilters, filtersControl} from '../scripts/tabs.mjs';
import {HELP_HTML, HELP_SECTIONS} from '../scripts/help.mjs';
import {shellHtml} from '../scripts/views.mjs';

const Hub = createHubSheetClass(FakeActorSheetV2);

/** Matches one compound selector (tag, .class, [attr], [attr="v"]) against a fake element. */
function matchOne(e, sel) {
  const tag = sel.match(/^[a-z]+/i)?.[0];
  if (tag && tag.toUpperCase() !== e.tagName) return false;
  for (const [, c] of sel.matchAll(/\.([\w-]+)/g)) if (!e.classList.includes(c)) return false;
  for (const [, k, v] of sel.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
    const a = e.attributes.find(x => x.name === k);
    if (!a || (v !== undefined && a.value !== v)) return false;
  }
  return true;
}
function el(tagName, classes = [], attrs = {}) {
  const e = {tagName, classList: classes, attributes: Object.entries(attrs).map(([name, value]) => ({name, value: String(value)})), disabled: false, children: [],
    dataset: Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith('data-')).map(([k, v]) => [k.slice(5).replace(/-(\w)/g, (m, c) => c.toUpperCase()), String(v)])),
    matches: sel => sel.split(',').some(s => matchOne(e, s.trim())),
    getAttribute: k => e.attributes.find(a => a.name === k)?.value ?? null,
    querySelectorAll: sel => e.children.filter(c => c.matches(sel)),
    focus() { e.doc.activeElement = e; }};
  return e;
}
/** A .window-content stand-in: setting innerHTML "draws" the page registered for that HTML string. */
function fakeContent(pages) {
  const doc = {activeElement: null};
  let html = '', kids = [];
  const content = {listeners: {}, ownerDocument: doc, queried: [],
    get innerHTML() { return html; },
    set innerHTML(v) { html = v; kids = (pages[v] ?? (() => []))(); for (const k of kids) { k.doc = doc; for (const c of k.children) c.doc = doc; } },
    querySelectorAll(sel) { content.queried.push(sel); return sel === '*' ? kids : kids.filter(k => k.matches(sel)); },
    querySelector: sel => kids.find(k => k.matches(sel)) ?? null,
    contains: t => kids.includes(t) || kids.some(k => k.children.includes(t)),
    addEventListener(type, fn) { (content.listeners[type] ??= []).push(fn); },
    insertAdjacentHTML() {}, scrollTop: 0, scrollLeft: 0, classList: [], tagName: 'SECTION'};
  return content;
}
function openHub(pages, {user = users.owner, modules = {}} = {}) {
  installGlobals({user, modules});
  const sheet = new Hub({document: makeActor()});
  const content = fakeContent(pages);
  sheet.element = {style: {setProperty() {}, removeProperty() {}}, classList: {toggle() {}, remove() {}}, querySelector: () => null, ownerDocument: content.ownerDocument, dataset: {}};
  sheet.render = async () => sheet;
  return {sheet, content};
}
const chip = () => el('BUTTON', ['ag-chip'], {'data-action': 'list-filter', 'data-tab': 'magic', 'data-key': 'ritual'});
const railTab = id => el('BUTTON', ['agch-rail__tab'], {'data-action': 'hub-tab', 'data-tab': id, tabindex: id === 'overview' ? 0 : -1});

test('CH-02: a button keeps the focus across a redraw, also across a tab switch', () => {
  const {sheet, content} = openHub({a: () => [chip(), railTab('overview'), railTab('magic')], b: () => [chip(), railTab('overview'), railTab('magic')]});
  sheet.tab = 'magic';
  sheet._replaceHTML('a', content);
  content.querySelectorAll('*')[0].focus();
  sheet._replaceHTML('b', content);
  assert.equal(content.ownerDocument.activeElement, content.querySelectorAll('*')[0], 'the new twin of the chip has the focus');
  content.querySelectorAll('*')[1].focus();
  sheet.tab = 'overview';
  sheet._replaceHTML('a', content);
  assert.equal(content.ownerDocument.activeElement.dataset.tab, 'overview', 'the rail tab keeps the focus after switching');
});

test('CH-02: a popover that opens takes the focus; when it closes the focus goes back to its opener', async () => {
  const opener = () => el('BUTTON', [], {'data-action': 'more-menu', 'data-ag-always': ''});
  const menu = () => { const m = el('DIV', ['agch-menu']); m.children = [el('BUTTON', [], {'data-action': 'menu-close'}), el('BUTTON', [], {'data-action': 'open-native'})]; return m; };
  const {sheet, content} = openHub({closed: () => [opener()], open: () => [opener(), menu()], closed2: () => [opener()]});
  sheet._replaceHTML('closed', content);
  const button = content.querySelectorAll('*')[0];
  await sheet.dispatch('more-menu', button, {});
  assert.equal(sheet.menu, 'more');
  sheet._replaceHTML('open', content);
  assert.equal(content.ownerDocument.activeElement.dataset.action, 'open-native', 'first control in the menu, not its Close');
  ACTIONS['menu-close'](sheet);   // Close or Escape
  content.ownerDocument.activeElement = null;
  sheet._replaceHTML('closed2', content);
  assert.equal(content.ownerDocument.activeElement?.dataset.action, 'more-menu', 'back on the ⋯ button');
});

test('captureFocus / restoreFocus: fields keep text and caret as before; buttons by their data-* key; disabled or gone is null', () => {
  const doc = {activeElement: null};
  const input = Object.assign(el('INPUT', [], {'data-filter': '', 'data-tab': 'magic'}), {type: 'search', value: 'fir', defaultValue: '', selectionStart: 3, selectionEnd: 3, doc});
  const content = {ownerDocument: doc, contains: () => true};
  doc.activeElement = input;
  const saved = captureFocus(content);
  assert.equal(saved.dirty, true); assert.equal(saved.start, 3);
  const twin = Object.assign(el('INPUT', [], {'data-filter': '', 'data-tab': 'magic'}), {type: 'search', value: '', defaultValue: '', doc, setSelectionRange(a, b) { twin.caret = [a, b]; }});
  assert.equal(restoreFocus({querySelectorAll: () => [twin]}, saved), twin);
  assert.equal(twin.value, 'fir'); assert.deepEqual(twin.caret, [3, 3]);
  const b = el('BUTTON', [], {'data-action': 'cond-add'}); b.doc = doc; doc.activeElement = b;
  const sb = captureFocus(content);
  assert.equal(sb.dirty, false); assert.equal(sb.value, undefined);
  const b2 = el('BUTTON', [], {'data-action': 'cond-add'}); b2.doc = doc; b2.disabled = true;
  assert.equal(restoreFocus({querySelectorAll: () => [b2]}, sb), null, 'a disabled twin is left alone');
  assert.equal(restoreFocus({querySelectorAll: () => []}, sb), null);
  const pop = el('DIV', ['agch-menu']); pop.children = [Object.assign(el('BUTTON', [], {'data-action': 'menu-close'}), {doc})];
  assert.equal(focusFirstIn(pop)?.dataset.action, 'menu-close', 'only Close: it gets the focus');
});

test('CH-20: arrow keys are bound on the Hub\'s own rail and Ashen Gate sub-tabs only, never inside an embedded partner view', () => {
  const {sheet, content} = openHub({x: () => []});
  sheet._replaceHTML('x', content);
  assert.ok(content.queried.includes('.agch-rail, .agch-agtabs'));
  assert.ok(!content.queried.some(q => q === '[role="tablist"]'), 'no blanket tablist query that would reach an embed');
});

test('CH-11: Delete or Backspace on a filled quick-bar slot clears it (with Undo); other keys and empty slots do nothing', async () => {
  const {sheet, content} = openHub({x: () => []});
  sheet._replaceHTML('x', content);
  const cleared = [];
  sheet._clearQuickSlot = slot => cleared.push(slot);
  const key = (k, filled = true) => ({key: k, preventDefault() { this.prevented = true; }, target: {matches: sel => filled && sel === '.agch-quick__slot.is-filled'}});
  for (const fn of content.listeners.keydown) { fn(key('Delete')); fn(key('Backspace')); fn(key('x')); fn(key('Delete', false)); }
  assert.equal(cleared.length, 2);
});

test('CH-14: the Cinder chip in Compact opens Full for this window only', async () => {
  installGlobals({user: users.owner, settings: {compactMode: true}, modules: {'ashen-gate-cinders': {active: true, api: {}}}});
  const sheet = new Hub({document: makeActor()});
  sheet.render = async () => sheet;
  await ACTIONS['cinder-open'](sheet, {dataset: {}});
  assert.equal(sheet.compact, false);
  assert.equal(game.settings.store.compactMode, true, 'the saved choice stays Compact');
});

test('CH-18: a visible label is the name; a tooltip only names an icon-only button, or a labelled one when it starts with the label', () => {
  assert.equal(ariaName('Prepared', 'Unprepare'), '', '"Prepared" is not announced "Unprepare"');
  assert.equal(ariaName('Use', 'Use [TEST] Sword'), 'Use [TEST] Sword', 'repeated buttons name their object');
  assert.equal(ariaName('Death save', 'Death save (right-click to configure)'), '', 'no "(right-click …)" in the name');
  assert.equal(ariaName('', 'Close'), 'Close');
  assert.equal(ariaName('+2', 'Roll initiative', 'Roll initiative +2'), 'Roll initiative +2');
  assert.doesNotMatch(btn('pop-out', 'Pop out', {title: 'Open the Hub in its own browser window'}), /aria-label/);
  assert.match(btn('menu-close', '', {icon: 'fa-solid fa-xmark', title: 'Close'}), /data-tooltip="Close" aria-label="Close"/);
});

test('CH-07: Filters (n) counts what is on (not Magic\'s spell level); Clear filters beside it; the popover only while open', () => {
  installGlobals({user: users.owner, settings: {}});
  assert.equal(activeFilters('magic', {level: 1, ritual: true, prepared: false}), 1);
  assert.equal(activeFilters('combat', {action: 'bonus', equipped: true}), 2);
  const sheet = {listFilters: {combat: {action: 'bonus', equipped: true}}, menu: null};
  let html = filtersControl({sheet}, 'combat', '<b>[TEST] chips</b>');
  assert.match(html, /aria-expanded="false"><i class="fa-solid fa-filter" aria-hidden="true"><\/i><span>Filters \(2\)<\/span>/);
  assert.match(html, /data-key="clear"/); assert.doesNotMatch(html, /\[TEST\] chips|agch-filtermenu/);
  sheet.menu = 'filters:combat';
  html = filtersControl({sheet}, 'combat', '<b>[TEST] chips</b>');
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /agch-filtermenu[\s\S]*data-field="group"[\s\S]*data-field="sort"[\s\S]*\[TEST\] chips/);
  assert.doesNotMatch(filtersControl({sheet: {listFilters: {}}}, 'features', ''), /data-key="clear"|Filters \(/);
});

test('CH-09: the character column folds in a narrow window; Show character opens it and the choice is remembered', async () => {
  const mem = {};
  globalThis.localStorage = {getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }};
  try {
    installGlobals({user: users.owner});
    const sheet = new Hub({document: makeActor()});
    sheet.render = async () => sheet;
    assert.equal(sheet.charFolded, true);
    let html = await sheet._renderHTML();
    assert.match(html, /<div class="agch-root agch-root--charfolded">/);
    assert.match(html, /data-action="char-fold" data-ag-always aria-expanded="false"><i[^>]*><\/i><span>Show character<\/span>/);
    assert.match(html, /<p class="agch-charsum"><span>HP <b>20 \/ 24<\/b><\/span><span>AC <b>15<\/b><\/span><\/p>/);
    await ACTIONS['char-fold'](sheet);
    assert.equal(sheet.charFolded, false);
    html = await sheet._renderHTML();
    assert.doesNotMatch(html, /agch-root--charfolded/); assert.match(html, /<span>Hide character<\/span>/);
    assert.equal(new Hub({document: makeActor()}).charFolded, false, 'remembered per user (kit uiState)');
    assert.equal(hubUi().get('charFolded'), false);
  } finally { delete globalThis.localStorage; }
});

test('CH-12: Change portrait… / Change token art… for owners; observers get neither the button nor the action', async () => {
  installGlobals({user: users.owner});
  const sheet = new Hub({document: makeActor()});
  sheet.render = async () => sheet;
  let html = await sheet._renderHTML();
  assert.match(html, /data-action="art-change" data-art="portrait" data-tooltip="Change portrait…" aria-label="Change portrait…"/);
  sheet.dollArt = 'token';
  assert.match(await sheet._renderHTML(), /data-art="token" data-tooltip="Change token art…"/);
  const r = await ACTIONS['art-change'](sheet, {dataset: {art: 'token'}});
  assert.equal(r.ok, false); assert.match(r.error, /file picker/, 'reaches the same picker as double-click (absent in the mock)');
  installGlobals({user: users.observer});
  const obs = new Hub({document: makeActor()});
  assert.doesNotMatch(await obs._renderHTML(), /data-action="art-change"/);
  assert.equal(await ACTIONS['art-change'](obs, {dataset: {art: 'portrait'}}), null);
});

test('GM-CO-04: Manager\'s skin is no longer copied onto the content on each render, except in a popped-out Hub', () => {
  const calls = [];
  const appearance = {contract: 'ag-appearance/0.1-beta', applyTo: () => calls.push('applyTo')};
  const {sheet, content} = openHub({a: () => [], b: () => []}, {modules: {'ashen-gate-manager': {active: true, api: {appearance}}}});
  globalThis.document = {};
  sheet.element.ownerDocument = globalThis.document;
  sheet._replaceHTML('a', content);
  assert.equal(calls.length, 0);
  sheet.element.ownerDocument = {};   // its own browser window
  sheet._replaceHTML('b', content);
  assert.equal(calls.length, 1);
  delete globalThis.document;
});

test('CH-01 / CH-03: rail tabs carry their names, GM Setup is marked GM; the header holds Compact, ⋯ and Help', () => {
  installGlobals({user: users.gm});
  const html = shellHtml({actor: makeActor(), tab: 'overview', editable: true, limited: false, sheet: {id: 'CharacterHubSheet-Actor-x'}});
  assert.match(html, /class="agch-rail__tab ag-tab--gm" aria-label="GM Setup \(GM only\)"[^>]*><i class="fa-solid fa-gear" aria-hidden="true"><\/i><span class="agch-rail__label" aria-hidden="true">GM Setup<\/span>/);
  assert.match(html, /aria-controls="CharacterHubSheet-Actor-x-tabpanel"/);
  assert.match(html, /<div class="agch-body" id="CharacterHubSheet-Actor-x-tabpanel" role="tabpanel"/);
  assert.match(html, /data-tab="journey"[^>]*><i[^>]*><\/i><span class="agch-rail__label" aria-hidden="true">Journey<\/span>/, 'CH-23: no "(alpha)" in the tab');
});

test('CH-25: Help is grouped into folds (the first open), and names the new places', () => {
  assert.equal((HELP_HTML.match(/<details class="ag-fold"/g) ?? []).length, HELP_SECTIONS.length);
  assert.match(HELP_HTML, /^[\s\S]*?<details class="ag-fold" open>/);
  assert.equal((HELP_HTML.match(/<details class="ag-fold" open>/g) ?? []).length, 1);
  for (const words of ['Configure…', 'Change portrait…', 'Filters', 'Show character', 'Appearance…', 'Quest Log', 'Headquarters', 'Delete']) assert.ok(HELP_HTML.includes(words), words);
  assert.doesNotMatch(HELP_HTML, /Level up<\/strong> \(top right\)|Perks, Renown, Quests/);
});
