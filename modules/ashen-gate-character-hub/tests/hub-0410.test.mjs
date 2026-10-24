/**
 * 0.41.0: the narrow Full window (CH-09) shows the character by default, puts the tabs in one slim row that scrolls
 * sideways, and keeps Mastery & marks, the Ashen Gate quick bar and the quick bar drawer pinned at the bottom (only the
 * split scrolls). Mocked Foundry and the CSS text: this proves the markup and the rules, not the browser's layout (that
 * was checked separately in headless Chromium).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass, railStep} from '../scripts/sheet.mjs';
import {HELP_HTML} from '../scripts/help.mjs';
import {VERSION} from '../scripts/constants.mjs';

const manifest = JSON.parse(fs.readFileSync(new URL('../module.json', import.meta.url), 'utf8'));
const CSS = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
const README = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const Hub = createHubSheetClass(FakeActorSheetV2);
/** Every `@container (max-width: 900px)` block, joined (the tab-row block sits after the rail rules so it wins). */
const narrow = CSS.split('@container (max-width: 900px) {').slice(1).map(b => b.slice(0, b.indexOf('\n}\n'))).join('\n');
const rule = sel => { const at = narrow.indexOf(`  ${sel} {`); assert.ok(at >= 0, `narrow rule ${sel}`); return narrow.slice(at, narrow.indexOf('}', at)); };

test('version is 0.45.0 in the code, module.json and its download URL', () => {
  assert.equal(VERSION, '0.45.0');
  assert.equal(manifest.version, '0.45.0');
  assert.match(manifest.download, /ashen-gate-character-hub-v0\.45\.0\/ashen-gate-character-hub\.zip$/);
});

test('a new Hub shows the whole character column: Hide character, no folded class', async () => {
  globalThis.localStorage = {getItem: () => null, setItem: (k, v) => { assert.deepEqual(JSON.parse(v), {charFoldReset: '0.44.0'}, 'opening stores only the one-time reset stamp'); }};
  try {
    installGlobals({user: users.owner});
    const sheet = new Hub({document: makeActor()});
    const html = await sheet._renderHTML();
    assert.match(html, /<div class="agch-root">/);
    assert.match(html, /aria-expanded="true"><i class="fa-solid fa-chevron-up" aria-hidden="true"><\/i><span>Hide character<\/span>/);
    for (const part of ['agch-doll', 'agch-tiles', 'agch-hp', 'agch-abil']) assert.match(html, new RegExp(part), part);
  } finally { delete globalThis.localStorage; }
});

test('a stored folded choice is kept; an unknown stored value falls back to shown', () => {
  for (const [stored, folded] of [[true, true], [false, false], ['yes', false]]) {
    globalThis.localStorage = {getItem: () => JSON.stringify({charFolded: stored, charFoldReset: '0.44.0'}), setItem: () => {}};
    try { installGlobals({user: users.owner}); assert.equal(new Hub({document: makeActor()}).charFolded, folded, String(stored)); }
    finally { delete globalThis.localStorage; }
  }
});

test('the bottom strips sit outside the scrolling split, after it', async () => {
  installGlobals({user: users.owner});
  const sheet = new Hub({document: makeActor()});
  sheet.quickOpen = true;
  const html = await sheet._renderHTML();
  const end = html.lastIndexOf('</div>'), split = html.indexOf('<div class="agch-split">');
  const bottom = html.indexOf('<div class="agch-bottombar">'), drawer = html.indexOf('class="agch-drawer"'), marks = html.indexOf('agch-hotbar--marks');
  assert.ok(split > 0 && marks > split && bottom > marks && drawer > bottom && drawer < end);
  assert.match(html, /data-action="quick-toggle"[^>]*aria-expanded="true"/);
  assert.doesNotMatch(html.slice(drawer, drawer + 200), / hidden>/, 'the open drawer is not hidden');
  // The split closes before the bottom strips: count its divs.
  const inner = html.slice(split, html.indexOf('<div class="agch-hotbars">'));
  assert.equal((inner.match(/<div\b/g) ?? []).length, (inner.match(/<\/div>/g) ?? []).length, 'marks is not inside the split');
});

test('narrow CSS: only the split scrolls; the root and bottom strips do not', () => {
  assert.match(rule('.agch-app .agch-split'), /overflow-y: auto/);
  assert.match(rule('.agch-app .agch-split'), /grid-template-areas: "rail" "char" "pane"/);
  assert.doesNotMatch(narrow, /\.agch-root \{[^}]*overflow-y: auto/, 'the whole root no longer scrolls');
  assert.doesNotMatch(narrow, /agch-bottombar|agch-drawer|agch-quicktoggle|agch-agbar|agch-hotbars/, 'the bottom strips are not restyled or hidden');
  assert.match(CSS, /\.agch-app \.agch-root \{[^}]*overflow: hidden/);
  assert.match(CSS, /\.agch-app \.agch-bottombar \{ flex: none;/);
  assert.match(CSS, /\.agch-app \.agch-drawer \{ flex: none;/);
  assert.match(CSS, /\.agch-app \.agch-hotbars \{ flex: none;/);
});

test('narrow CSS: the tabs are one slim sticky row that scrolls sideways', () => {
  assert.match(rule('.agch-app .agch-railcol'), /position: sticky; top: 0/);
  const rail = rule('.agch-app .agch-rail');
  assert.match(rail, /flex-direction: row; flex-wrap: nowrap/);
  assert.match(rail, /overflow-x: auto/);
  const tab = rule('.agch-app .agch-rail .agch-rail__tab');
  assert.match(tab, /display: inline-flex/);
  assert.match(tab, /height: var\(--ag-control-h-sm\)/);
  assert.match(tab, /font-size: var\(--ag-text-sm\)/);
  assert.match(tab, /flex: none/, 'tabs never shrink, so their names are not clipped');
  assert.match(rule('.agch-app .agch-rail__label'), /font-size: var\(--ag-text-xs\);[^}]*white-space: nowrap/);
  const last = sel => CSS.lastIndexOf(sel);
  assert.ok(last('  .agch-app .agch-rail .agch-rail__tab {') > last('\n.agch-app .agch-rail .agch-rail__tab {'), 'the narrow tab rule comes after the base rule, so it wins');
  assert.ok(last('  .agch-app .agch-rail__hidden {') > last('\n.agch-app .agch-rail__hidden {'));
  assert.match(rule('.agch-app .agch-root--charfolded .agch-char > :not(.agch-ident, .agch-charfold, .agch-charsum)'), /display: none/);
});

test('Left / Right move along the rail (wrapping), with a roving tabindex', () => {
  const tabs = [];
  const parent = {querySelectorAll: () => tabs};
  let focused = null;
  for (let i = 0; i < 3; i++) {
    const t = {i, parentElement: parent, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, focus() { focused = this; }};
    tabs.push(t);
  }
  railStep(tabs[0], 1);
  assert.equal(focused, tabs[1]);
  assert.deepEqual(tabs.map(t => t.attrs.tabindex), ['-1', '0', '-1']);
  railStep(tabs[0], -1);
  assert.equal(focused, tabs[2], 'wraps to the end');
});

test('Help and README describe the shown-by-default character, the slim tab row and the pinned bottom', () => {
  for (const words of ['Hide character', 'Show character', 'one slim row', 'scrolls sideways', 'stay along the bottom', 'quick bar']) assert.ok(HELP_HTML.includes(words), words);
  assert.doesNotMatch(HELP_HTML, /character folds to its Cinders, the star, HP and AC; <strong>Show character<\/strong> opens it/);
  assert.match(README, /The character shows by default there; \*\*Hide character\*\*/);
  assert.match(README, /stay pinned along the bottom \(0\.41\.0\)/);
});
