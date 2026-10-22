/** Compact mode and Pop out (0.29.0). Mocked Foundry: proves the logic and markup, not Foundry's real detached window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass, COMPACT_SIZE, FULL_SIZE} from '../scripts/sheet.mjs';

const Hub = createHubSheetClass(FakeActorSheetV2);
const MAIN_DOC = {documentElement: {dataset: {}}};
const setup = (opts = {}) => { const notes = installGlobals(opts); globalThis.document = MAIN_DOC; MAIN_DOC.documentElement.dataset = {}; return notes; };
const head = html => html.slice(0, html.indexOf('</header>'));

test('Full by default: Compact button (not pressed), the tab rail and middle content; nothing to pop out without Foundry V14 detach', async () => {
  setup();
  const sheet = new Hub({document: makeActor()});
  assert.equal(sheet.compact, false);
  assert.deepEqual(sheet.options.position, FULL_SIZE);
  const html = await sheet._renderHTML();
  assert.match(head(html), /<button type="button" class="ag-btn ag-btn--ghost agch-compact" data-action="compact-toggle" data-ag-always aria-pressed="false" data-tooltip="[^"]+"><i class="fa-solid fa-down-left-and-up-right-to-center" aria-hidden="true"><\/i><span>Compact<\/span><\/button>/);
  assert.match(html, /role="tablist"/); assert.match(html, /agch-pane/);
  sheet.menu = 'more';
  assert.doesNotMatch(await sheet._renderHTML(), /data-action="pop-out"/, 'no detachWindow on the stand-in: no button in the ⋯ menu');
});

test('Compact preference: the Hub opens narrow with the character column and the hotbars, no tabs', async () => {
  setup({settings: {compactMode: true}});
  const sheet = new Hub({document: makeActor()});
  assert.equal(sheet.compact, true);
  assert.deepEqual(sheet.options.position, COMPACT_SIZE);
  const html = await sheet._renderHTML();
  assert.match(html, /<div class="agch-root agch-root--compact">/);
  assert.match(head(html), /aria-pressed="true"[^>]*><i class="fa-solid fa-up-right-and-down-left-from-center" aria-hidden="true"><\/i><span>Full<\/span>/);
  for (const gone of [/role="tablist"/, /agch-pane/, /agch-agbar/, /data-action="level-up"/, /data-action="open-native"/, /agch-tiles/, /agch-idcard/])
    assert.doesNotMatch(html, gone, String(gone));
  // 0.32.0: marks, hit dice and abilities are in Compact too (compact-stats-0320.test.mjs).
  assert.match(html, /<h2 class="agch-name">\[TEST\] Hero<\/h2>/);
  assert.match(html, /data-art-edit="portrait"/, 'double-click art still works');
  assert.match(html, /data-action="doll-art"/);
  assert.match(html, /data-action="slot-menu" data-slot="head"|data-slot="head"[^>]*data-action="slot-menu"/, 'slot boxes keep their actions');
  assert.match(html, /data-hp-bar/); assert.match(html, /data-action="hp-damage"[\s\S]*data-action="hp-heal"/);
  assert.match(html, /aria-label="Quick bar"/);
  assert.match(html, /data-action="help"/); assert.match(html, /ag-version/);
});

test('Compact keeps the HP editor and slot menu (sheet.menu) working', async () => {
  setup({settings: {compactMode: true}});
  const sheet = new Hub({document: makeActor()});
  sheet.menu = 'hp';
  assert.match(await sheet._renderHTML(), /agch-hpedit/);
  sheet.menu = 'slot:head';
  assert.match(await sheet._renderHTML(), /agch-menu--slot/);
});

test('toggle: saves the choice, switches size and restores the Full size it left', async () => {
  setup();
  const sheet = new Hub({document: makeActor()});
  sheet.position = {width: 1100, height: 700, top: 5, left: 5};
  await sheet.dispatch('compact-toggle', {dataset: {}}, {});
  assert.equal(sheet.compact, true);
  assert.equal(game.settings.store.compactMode, true, 'remembered for this user');
  assert.deepEqual(sheet.renders.at(-1), {position: COMPACT_SIZE});
  sheet.position = {width: 460, height: 650};
  await sheet.dispatch('compact-toggle', {dataset: {}}, {});
  assert.equal(sheet.compact, false);
  assert.equal(game.settings.store.compactMode, false);
  assert.deepEqual(sheet.renders.at(-1), {position: {width: 1100, height: 700}}, 'the Full size it had');
  sheet.position = {width: 1100, height: 700};
  await sheet.dispatch('compact-toggle', {dataset: {}}, {});
  assert.deepEqual(sheet.renders.at(-1), {position: {width: 460, height: 650}}, 'and the Compact size it had');
});

test('opening in Compact, then Full: the default Full size; Comfortable scales both', async () => {
  setup({settings: {compactMode: true}});
  MAIN_DOC.documentElement.dataset.agSize = 'comfortable';
  const sheet = new Hub({document: makeActor()});
  assert.deepEqual(sheet.options.position, {width: 600, height: 936});
  sheet.position = {width: 600, height: 936};
  await sheet.setCompact(false);
  assert.deepEqual(sheet.renders.at(-1), {position: {width: 1488, height: 960}});
});

test('player visibility: hidden equipment and hotbars stay hidden in Compact', async () => {
  setup({user: users.owner, settings: {compactMode: true, playerVisibility: {equipment: false, hotbars: false}}});
  const html = await new Hub({document: makeActor()})._renderHTML();
  assert.doesNotMatch(html, /agch-doll/); assert.doesNotMatch(html, /Quick bar/);
  assert.match(html, /data-hp-bar/, 'HP is always shown');
});

test('GM: follows the GM\'s own Compact choice; limited viewers get no toggle', async () => {
  setup({user: users.gm, settings: {compactMode: true}});
  const html = await new Hub({document: makeActor()})._renderHTML();
  assert.match(html, /agch-root--compact/);
  setup({user: users.observer, settings: {compactMode: true}});
  const actor = makeActor(); actor.limited = true;
  const lim = await new Hub({document: actor})._renderHTML();
  assert.doesNotMatch(lim, /compact-toggle/); assert.match(lim, /agch-root--limited/);
});

test('Pop out uses Foundry\'s own detachWindow / attachWindow; the label follows where the Hub is', async () => {
  setup();
  const calls = [];
  const sheet = new Hub({document: makeActor()});
  sheet.detachWindow = async () => { calls.push('detach'); sheet.element.ownerDocument = {}; };
  sheet.attachWindow = async () => { calls.push('attach'); sheet.element.ownerDocument = MAIN_DOC; };
  sheet._canDetach = () => true;
  sheet.element = {ownerDocument: MAIN_DOC};
  sheet.menu = 'more';   // 0.33.0: Pop out is in the header's ⋯ menu
  assert.match(head(await sheet._renderHTML()), /data-action="pop-out"[^>]*data-tooltip="Open the Hub in its own browser window[^"]*"[^>]*><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"><\/i><span>Pop out<\/span>/);
  assert.deepEqual(await sheet.dispatch('pop-out', {dataset: {}}, {}), {ok: true, result: 'out'});
  assert.equal(sheet.menu, null, 'the menu closes');
  sheet.menu = 'more';
  assert.match(head(await sheet._renderHTML()), /<span>Pop in<\/span>/);
  assert.deepEqual(await sheet.dispatch('pop-out', {dataset: {}}, {}), {ok: true, result: 'in'});
  assert.deepEqual(calls, ['detach', 'attach']);
  const before = sheet.renders.length;
  sheet._onDetach({}, {}); sheet._onAttach({}, {});
  assert.equal(sheet.renders.length, before + 2, 'redrawn after Foundry moves it');
  sheet._canDetach = () => false; sheet.menu = 'more';
  assert.doesNotMatch(await sheet._renderHTML(), /data-action="pop-out"/, 'Foundry says no: no button');
});

test('Compact and Pop out together: the compact header keeps Pop out (in its ⋯ menu since 0.33.0)', async () => {
  setup({settings: {compactMode: true}});
  const sheet = new Hub({document: makeActor()});
  sheet.detachWindow = async () => {}; sheet.element = {ownerDocument: MAIN_DOC};
  let h = head(await sheet._renderHTML());
  assert.ok(h.indexOf('compact-toggle') < h.indexOf('more-menu') && h.indexOf('more-menu') < h.indexOf('ag-version'));
  assert.doesNotMatch(h, /data-compact-opacity/, 'CH-04: no slider in the Compact header');
  sheet.menu = 'more';
  h = head(await sheet._renderHTML());
  assert.ok(h.indexOf('compact-toggle') < h.indexOf('pop-out') && h.indexOf('pop-out') < h.indexOf('ag-version'));
});

test('compact CSS uses kit tokens only', () => {
  const css = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('/* Compact mode (0.29.0)'));
  assert.ok(block.length > 40);
  assert.doesNotMatch(block, /\d+px/);
});

test('Compact see-through (experimental): slider only in Compact, 60-100 %, only the Compact window gets the variable', async () => {
  const {clampCompactOpacity, applyCompactOpacity, COMPACT_OPACITY_MIN} = await import('../scripts/compact-opacity.mjs');
  assert.equal(COMPACT_OPACITY_MIN, 60);
  assert.equal(clampCompactOpacity(10), 60); assert.equal(clampCompactOpacity(150), 100); assert.equal(clampCompactOpacity('75'), 75);
  assert.equal(clampCompactOpacity(undefined), 100); assert.equal(clampCompactOpacity('x'), 100);
  setup({settings: {compactMode: true, compactOpacity: 70}});
  const sheet = new Hub({document: makeActor()});
  const props = {};
  sheet.element = {style: {setProperty: (k, v) => { props[k] = v; }, removeProperty: k => { delete props[k]; }}};
  assert.doesNotMatch(head(await sheet._renderHTML()), /data-compact-opacity/, '0.33.0 (CH-04): not in the header');
  sheet.menu = 'look';
  const html = await sheet._renderHTML();
  assert.match(html, /agch-lookmenu[\s\S]*Background opacity[\s\S]*<input type="range" min="60" max="100" step="5" value="70" data-compact-opacity data-ag-always aria-label="[^"]+">/, 'in the Appearance menu');
  assert.equal(applyCompactOpacity(sheet), 70);
  assert.deepEqual(props, {'--agch-compact-alpha': '70%'});
  sheet.compact = false;
  assert.equal(applyCompactOpacity(sheet), 100);
  assert.deepEqual(props, {}, 'Full removes it: always opaque');
  assert.doesNotMatch(await sheet._renderHTML(), /data-compact-opacity/, 'no slider in Full (Appearance menu open)');
  const {saveCompactOpacity} = await import('../scripts/compact-opacity.mjs');
  await saveCompactOpacity(5);
  assert.equal(game.settings.store.compactOpacity, 60, 'saved clamped');
  const css = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
  assert.match(css, /--agch-bg: color-mix\(in srgb, var\(--ag-surface\) var\(--agch-compact-alpha, 100%\), transparent\)/, 'one variable, opaque when unset');
  assert.doesNotMatch(css, /--agch-bg-raised: color-mix|--agch-bg-sunken: color-mix/, 'HP box, slots and header stay solid');
});

test('Ashen Gate bottom bar: wraps on narrow windows; hidden in Compact', async () => {
  const css = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
  assert.match(css, /\.agch-app \.agch-agbar \{[^}]*flex-wrap: wrap/);
  setup({user: users.gm, settings: {compactMode: true}, modules: {'ashen-gate-headquarters': {active: true, api: {open() {}}}}});
  assert.doesNotMatch(await new Hub({document: makeActor()})._renderHTML(), /agch-agbar/);
  setup({user: users.gm, modules: {'ashen-gate-headquarters': {active: true, api: {open() {}}}}});
  assert.match(await new Hub({document: makeActor()})._renderHTML(), /<nav class="agch-agbar"/);
});
