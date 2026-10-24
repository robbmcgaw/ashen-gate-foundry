/**
 * 0.46.0: the header holds Compact, Appearance, Pop out / Pop in and Level up as icon buttons; the ⋯ menu is only
 * Configure…, NPC Codex and Open native sheet (plus Restore backup… for the GM); the hotbar link has no option.
 * Mocked Foundry: this proves the markup, the actions and the CSS rules, not the live window or how it wraps.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass, ACTIONS} from '../scripts/sheet.mjs';
import {headerHtml, moreMenuHtml, popOutBtn} from '../scripts/views.mjs';
import {HELP_HTML} from '../scripts/help.mjs';
import {VERSION, MODULE_ID} from '../scripts/constants.mjs';

const Hub = createHubSheetClass(FakeActorSheetV2);
const css = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const MAIN_DOC = {documentElement: {dataset: {}}, title: 'Foundry Virtual Tabletop'};
const setup = user => { installGlobals({user, modules: {[MODULE_ID]: {active: true, version: VERSION}}}); globalThis.document = MAIN_DOC; };
const ctxFor = (actor, user, extra = {}) => ({actor, sheet: {menu: null}, limited: false, editable: user.isGM || actor.testUserPermission(user, 'OWNER'), ...extra});
const buttons = html => [...html.matchAll(/<button [^>]*>/g)].map(m => m[0]);

test('header: Compact, Appearance, Pop out and Level up sit together, in that order, before ⋯, version and Help', async () => {
  setup(users.owner);
  const sheet = new Hub({document: makeActor()});
  sheet._canDetach = () => true; sheet.detachWindow = async () => {}; sheet.element = {ownerDocument: MAIN_DOC};
  const html = await sheet._renderHTML(), head = html.slice(0, html.indexOf('</header>'));
  const at = s => head.indexOf(s);
  const order = ['compact-toggle', 'look-menu', 'pop-out', 'level-up', 'more-menu', 'ag-version', 'data-action="help"'].map(at);
  assert.ok(order.every(i => i > 0) && order.every((v, i) => !i || v > order[i - 1]), `order ${order}`);
  assert.ok(at('agch-head__tools') < at('compact-toggle') && at('level-up') < at('more-menu'), 'the four sit in one group');
  for (const action of ['look-menu', 'pop-out', 'level-up', 'more-menu']) {
    const tag = buttons(head).find(b => b.includes(`data-action="${action}"`));
    assert.match(tag, /aria-label="[^"]+"/, `${action}: aria-label`); assert.match(tag, /data-tooltip="[^"]+"/, `${action}: tooltip`);
    assert.match(tag, /type="button"/);
  }
  assert.doesNotMatch(head, /<span>(Appearance|Pop out|Level up)<\/span>/, 'icon only');
  assert.match(css, /\.agch-app \.agch-head__tools \{[^}]*flex-wrap: wrap/, 'the group wraps in a narrow window');
  assert.match(css, /\.agch-app \.agch-head \.ag-header__actions \{[^}]*flex-wrap: wrap/, 'so does the header');
});

test('header: Level up keeps aria-disabled with its reason; Pop out is hidden where Foundry cannot detach; a popped-out Hub keeps Pop in', async () => {
  installGlobals({user: users.owner, settings: {levelingMode: 'xp'}, modules: {[MODULE_ID]: {active: true, version: VERSION}}}); globalThis.document = MAIN_DOC;
  const actor = makeActor({system: {details: {level: 3, xp: {value: 5, max: 2700}}}});
  const sheet = new Hub({document: actor});
  sheet._canDetach = () => false; sheet.element = {ownerDocument: MAIN_DOC};
  const head = html => html.slice(0, html.indexOf('</header>'));
  let h = head(await sheet._renderHTML());
  const lvl = buttons(h).find(b => b.includes('data-action="level-up"'));
  assert.match(lvl, /aria-disabled="true"/); assert.match(lvl, /aria-label="Level up: [^"]+"/); assert.match(lvl, /data-tooltip="[^"]+"/);
  assert.doesNotMatch(h, /data-action="pop-out"/);
  sheet._canDetach = () => true; sheet.detachWindow = async () => { sheet.element.ownerDocument = {}; }; sheet.attachWindow = async () => {};
  await sheet.dispatch('pop-out', {dataset: {}}, {});
  h = head(await sheet._renderHTML());
  assert.match(buttons(h).find(b => b.includes('data-action="pop-out"')), /aria-label="Pop in"/);
  assert.equal(popOutBtn(null), '');
});

test('header buttons work: Appearance opens its menu under its own button, in Full and Compact', async () => {
  setup(users.owner);
  for (const compact of [false, true]) {
    const sheet = new Hub({document: makeActor()}); sheet.compact = compact;
    await ACTIONS['look-menu'](sheet, {dataset: {}});
    const html = await sheet._renderHTML();
    assert.match(html, /<span class="agch-lookwrap"><button[^>]*data-action="look-menu"[^>]*aria-expanded="true"[^>]*>[\s\S]*?<\/button><div class="agch-menu agch-lookmenu"/, `compact ${compact}`);
    assert.doesNotMatch(html, /agch-moremenu/);
    await ACTIONS['look-menu'](sheet, {dataset: {}});
    assert.doesNotMatch(await sheet._renderHTML(), /agch-lookmenu/, 'a second click closes it');
  }
});

test('⋯ menu: Configure…, Open native sheet only, for the owner; no Restore, Level up, Appearance, Pop out, name or link', () => {
  setup(users.owner);
  const actor = makeActor();
  const html = moreMenuHtml({menu: 'more'}, ctxFor(actor, users.owner, {sheet: {menu: 'more'}}));
  const labels = [...html.matchAll(/<span>([^<]+)<\/span>/g)].map(m => m[1]);
  assert.deepEqual(labels, ['Configure…', 'Open native sheet']);
  assert.match(html, /aria-label="More: Configure, Open native sheet"/);
  assert.doesNotMatch(html, /level-restore|level-up|look-menu|pop-out|name-edit|hotbar-link/);
});

test('⋯ menu: an observer has no Configure…; the GM gets Restore backup… as the one extra item, last', () => {
  setup(users.observer);
  const actor = makeActor();
  const obs = moreMenuHtml({menu: 'more'}, ctxFor(actor, users.observer, {sheet: {menu: 'more'}, editable: false}));
  assert.deepEqual([...obs.matchAll(/<span>([^<]+)<\/span>/g)].map(m => m[1]), ['Open native sheet']);
  setup(users.gm);
  const copy = makeActor(); copy.name = '[TEST] Hero - level 3'; copy.flags[MODULE_ID] = {levelBackup: {sourceId: 'actor1', sourceName: '[TEST] Hero'}};
  const gm = moreMenuHtml({menu: 'more'}, ctxFor(copy, users.gm, {sheet: {menu: 'more'}}));
  assert.deepEqual([...gm.matchAll(/<span>([^<]+)<\/span>/g)].map(m => m[1]), ['Configure…', 'Open native sheet', 'Restore this backup…']);
  assert.match(gm, /aria-label="More: Configure, Open native sheet, Restore backup"/);
  setup(users.owner);
  assert.doesNotMatch(moreMenuHtml({menu: 'more'}, ctxFor(copy, users.owner, {sheet: {menu: 'more'}})), /level-restore/, 'never shown to a player');
});

test('limited view: no Compact or Level up; Appearance and Pop out stay; ⋯ has Open native sheet only', async () => {
  setup(users.observer);
  const actor = makeActor({perms: {observer: 'LIMITED'}}); actor.limited = true;
  const sheet = new Hub({document: actor});
  sheet._canDetach = () => true; sheet.detachWindow = async () => {}; sheet.element = {ownerDocument: MAIN_DOC};
  const html = await sheet._renderHTML(), head = html.slice(0, html.indexOf('</header>'));
  assert.doesNotMatch(head, /compact-toggle|level-up/);
  assert.match(head, /data-action="look-menu"/); assert.match(head, /data-action="pop-out"/);
  assert.match(head, /aria-label="More: Open native sheet"/);
});

test('hotbar link has no option: no menu item, no action, no stored-setting handling; Help and README say it is always on', () => {
  assert.equal(ACTIONS['hotbar-link'], undefined);
  const src = ['main.mjs', 'sheet.mjs', 'views.mjs', 'hotbar-link.mjs'].map(f => fs.readFileSync(new URL(`../scripts/${f}`, import.meta.url), 'utf8')).join('\n');
  assert.doesNotMatch(src, /settings\.(get|set|register)\([^)]*linkFoundryHotbar|registerLinkSetting|setLinkOn|linkMenuItem/);
  assert.doesNotMatch(HELP_HTML + readme, /Link quick bar to Foundry|turn it off/i);
  assert.match(HELP_HTML, /always linked/i); assert.match(readme, /always linked/i);
  assert.doesNotMatch(HELP_HTML, /Edit name and title…<\/strong> in the <strong>⋯/, 'the pencil is the way to edit');
});
