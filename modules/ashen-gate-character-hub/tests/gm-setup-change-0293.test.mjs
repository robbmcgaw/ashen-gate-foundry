/**
 * GM Setup switches save through the Hub's change listener, also after the Hub is closed and opened again (0.29.3).
 * Mocked Foundry: the fake content element records listeners and dispatches a change to them the way the browser
 * bubbles it to .window-content. Proves the logic and wiring only, not the live Foundry window.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass} from '../scripts/sheet.mjs';

const Hub = createHubSheetClass(FakeActorSheetV2);

/** A .window-content stand-in: keeps listeners per type and dispatches events to them (bubbling phase). */
function fakeContent() {
  return {innerHTML: '', listeners: {},
    querySelector: () => null, insertAdjacentHTML: () => {},
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
    async dispatch(type, target) {
      const ev = {type, target, stopped: false, stopPropagation() { this.stopped = true; }, preventDefault() {}};
      return Promise.all((this.listeners[type] ?? []).map(fn => fn(ev)));
    }};
}
/** An input as the browser hands it to a change listener; `closest` walks up to itself for [data-edit]. */
function input(dataset, props = {}) {
  const el = {dataset, ...props, matches: sel => sel === '[data-edit]' ? 'edit' in dataset : false};
  el.closest = sel => sel === '[data-edit]' && 'edit' in dataset ? el : null;
  return el;
}

/** Opens a Hub the way ApplicationV2 does: each open builds a new content element and calls _replaceHTML on it. */
function open(sheet) { const content = fakeContent(); sheet._replaceHTML('', content); return content; }

test('Player visibility checkbox saves the setting through the change listener', async () => {
  installGlobals({user: users.gm, settings: {playerVisibility: {}}});
  const sheet = new Hub({document: makeActor()}), content = open(sheet);
  await content.dispatch('change', input({edit: 'part-visibility', part: 'professions'}, {checked: false}));
  assert.equal(game.settings.store.playerVisibility.professions, false);
  await content.dispatch('change', input({edit: 'part-visibility', part: 'professions'}, {checked: true}));
  assert.equal(game.settings.store.playerVisibility.professions, true);
});

test('closed and reopened Hub (new content element) still saves the checkbox: the 0.29.2 bug', async () => {
  installGlobals({user: users.gm, settings: {playerVisibility: {}}});
  const sheet = new Hub({document: makeActor()});
  open(sheet);
  const again = open(sheet);   // Foundry renders a new frame after close; the sheet instance is the same
  assert.equal(again.listeners.change?.length > 0, true, 'listeners bound on the new content element');
  await again.dispatch('change', input({edit: 'part-visibility', part: 'cinders'}, {checked: false}));
  assert.equal(game.settings.store.playerVisibility.cinders, false);
});

test('re-rendering into the same content element does not bind twice', async () => {
  installGlobals({user: users.gm, settings: {playerVisibility: {}}});
  const sheet = new Hub({document: makeActor()}), content = open(sheet);
  const n = content.listeners.change.length;
  sheet._replaceHTML('', content);
  assert.equal(content.listeners.change.length, n);
});

test('the edit is found from the input with closest(), so a nested target still routes', async () => {
  installGlobals({user: users.gm, settings: {playerVisibility: {}}});
  const sheet = new Hub({document: makeActor()}), content = open(sheet);
  const box = input({edit: 'part-visibility', part: 'quests'}, {checked: false});
  const inner = {dataset: {}, matches: () => false, closest: sel => sel === '[data-edit]' ? box : null};
  await content.dispatch('change', inner);
  assert.equal(game.settings.store.playerVisibility.quests, false);
});

test('a refused write shows a notice, writes nothing and redraws so the checkbox shows the stored value', async () => {
  const notes = installGlobals({user: users.owner, settings: {playerVisibility: {}}});
  const sheet = new Hub({document: makeActor()}), content = open(sheet);
  await content.dispatch('change', input({edit: 'part-visibility', part: 'professions'}, {checked: false}));
  assert.deepEqual(game.settings.store.playerVisibility, {});
  assert.match(notes.find(n => n[0] === 'warn')?.[1] ?? '', /Only the GM/);
  assert.ok(sheet.renders.length > 0, 'redrawn');
});

test('a failing settings write is reported, not swallowed', async () => {
  const notes = installGlobals({user: users.gm, settings: {playerVisibility: {}}});
  game.settings.set = async () => { throw new Error('[TEST] write failed'); };
  const sheet = new Hub({document: makeActor()}), content = open(sheet);
  await content.dispatch('change', input({edit: 'part-visibility', part: 'perks'}, {checked: false}));
  assert.match(notes.find(n => n[0] === 'warn')?.[1] ?? '', /\[TEST\] write failed/);
});

test('other GM Setup inputs (the pet limit setting is gone) and the Compact opacity slider save after a reopen too', async () => {
  installGlobals({user: users.gm, settings: {petCap: 0, compactOpacity: 100}});
  const sheet = new Hub({document: makeActor()});
  open(sheet);
  const content = open(sheet);
  await content.dispatch('change', input({edit: 'pet-cap-default'}, {value: '2'}));
  assert.equal(game.settings.store.petCap, 0, 'retired: nothing writes it any more');
  const slider = {dataset: {}, value: '70', matches: sel => sel === '[data-compact-opacity]', closest: () => null};
  await content.dispatch('change', slider);
  assert.equal(game.settings.store.compactOpacity, 70);
});
