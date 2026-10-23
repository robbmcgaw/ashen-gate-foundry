/**
 * 0.37.1: the window title is "Ashen Gate | Character Hub — <name>" (the brand only in 0.37.0), so several open,
 * minimised or popped-out Hubs can be told apart. It follows a rename on the next render, and is always plain text.
 * Mocked Foundry and a tiny fake window: this proves the logic, not the live Foundry title bar or a real browser window.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass} from '../scripts/sheet.mjs';
import {VERSION, HUB_TITLE, hubTitle} from '../scripts/constants.mjs';

const Hub = createHubSheetClass(FakeActorSheetV2);
const MAIN_DOC = {documentElement: {dataset: {}}, title: 'Foundry Virtual Tabletop'};

/** A Hub with a stand-in frame: element, its .window-content and the title bar heading Foundry drew at first render. */
function openHub({user = users.owner, actor = makeActor(), ownerDocument = MAIN_DOC} = {}) {
  installGlobals({user, modules: {'ashen-gate-character-hub': {active: true, version: VERSION}}});
  globalThis.document = MAIN_DOC;
  game.user.targets = new Set();
  const sheet = new Hub({document: actor});
  const content = {innerHTML: '', ownerDocument, listeners: {}, classList: [], tagName: 'SECTION', scrollTop: 0, scrollLeft: 0,
    querySelectorAll: () => [], querySelector: () => null, contains: () => false, addEventListener(t, fn) { (this.listeners[t] ??= []).push(fn); }, insertAdjacentHTML() {}};
  sheet.element = {style: {setProperty() {}, removeProperty() {}}, classList: {toggle() {}, remove() {}, add() {}}, querySelector: () => null, ownerDocument, dataset: {}};
  // Foundry sets the bar's text from `title` when the frame is drawn, and not again on later renders.
  sheet.window = {title: {textContent: sheet.title, innerHTML: null}};
  sheet.render = async () => sheet;
  return {sheet, content, actor};
}
const draw = async ({sheet, content}) => sheet._replaceHTML(await sheet._renderHTML(), content);



test('the title is the brand, an em dash and the character\'s name', async () => {
  const hub = openHub();
  assert.equal(hub.sheet.title, 'Ashen Gate | Character Hub — [TEST] Hero');
  assert.equal(hubTitle('[TEST] Hero'), `${HUB_TITLE} — [TEST] Hero`);
  await draw(hub);
  assert.equal(hub.sheet.window.title.textContent, 'Ashen Gate | Character Hub — [TEST] Hero');
  assert.equal(hubTitle('  '), HUB_TITLE, 'a blank name leaves the brand alone');
  assert.equal(hubTitle(' [TEST]  Two\nLines '), `${HUB_TITLE} — [TEST] Two Lines`, 'one line of text');
});

test('a name with HTML characters stays plain text in the title', async () => {
  const actor = makeActor(); actor.name = '[TEST] <b>Bold</b> & "Q"';
  const hub = openHub({actor});
  assert.equal(hub.sheet.title, 'Ashen Gate | Character Hub — [TEST] <b>Bold</b> & "Q"', 'not escaped: Foundry sets it as text');
  actor.name = '[TEST] <img src=x onerror=alert(1)>';
  await draw(hub);
  assert.equal(hub.sheet.window.title.textContent, 'Ashen Gate | Character Hub — [TEST] <img src=x onerror=alert(1)>');
  assert.equal(hub.sheet.window.title.innerHTML, null, 'written as textContent, never innerHTML');
});

test('renaming the actor and re-rendering updates the title bar', async () => {
  const hub = openHub();
  await draw(hub);
  hub.actor.name = '[TEST] Renamed';
  assert.equal(hub.sheet.window.title.textContent, 'Ashen Gate | Character Hub — [TEST] Hero', 'not before the render');
  await draw(hub);
  assert.equal(hub.sheet.title, 'Ashen Gate | Character Hub — [TEST] Renamed');
  assert.equal(hub.sheet.window.title.textContent, 'Ashen Gate | Character Hub — [TEST] Renamed');
  assert.equal(MAIN_DOC.title, 'Foundry Virtual Tabletop', 'the main Foundry tab title is never touched');
  hub.sheet.window.title = {textContent: 'stale'};   // a render with the same HTML still keeps the title right
  hub.sheet._replaceHTML(hub.sheet._agchHtml, hub.content);
  assert.equal(hub.sheet.window.title.textContent, 'Ashen Gate | Character Hub — [TEST] Renamed');
});

test('popped out: the browser window\'s title follows the name too', async () => {
  const pop = {documentElement: {dataset: {}}, title: 'Ashen Gate | Character Hub — [TEST] Hero'};
  const hub = openHub({ownerDocument: pop});
  hub.actor.name = '[TEST] Away';
  await draw(hub);
  assert.equal(pop.title, 'Ashen Gate | Character Hub — [TEST] Away');
  assert.equal(hub.sheet.window.title.textContent, 'Ashen Gate | Character Hub — [TEST] Away');
  assert.equal(MAIN_DOC.title, 'Foundry Virtual Tabletop');
});

test('a limited view uses the same title', async () => {
  const actor = makeActor(); actor.limited = true;
  const hub = openHub({user: users.observer, actor});
  const html = await hub.sheet._renderHTML();
  assert.match(html, /agch-root--limited/);
  assert.equal(hub.sheet.title, 'Ashen Gate | Character Hub — [TEST] Hero');
  hub.sheet._replaceHTML(html, hub.content);
  assert.equal(hub.sheet.window.title.textContent, 'Ashen Gate | Character Hub — [TEST] Hero');
});

test('no title bar (no frame yet): the render does not fail', async () => {
  const hub = openHub();
  hub.sheet.window = undefined;
  await draw(hub);
  assert.equal(hub.sheet.title, 'Ashen Gate | Character Hub — [TEST] Hero');
});
