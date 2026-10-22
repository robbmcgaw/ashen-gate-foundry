/**
 * 0.30.0: Group and Sort stopped working for one character after the click-filters had been used. Mocked Foundry: a
 * fake .window-content keeps its listeners and a "generation" that goes up each time the Hub replaces its HTML. An
 * element from an older generation has been replaced, so (as in the browser) its events no longer reach the Hub.
 * Proves the sheet's state and wiring, not the live Foundry window.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass} from '../scripts/sheet.mjs';

const Hub = createHubSheetClass(FakeActorSheetV2);
const act = type => [{activation: {type}}];
const SPELLS = [
  {id: 'fb', name: '[TEST] Fire Bolt', type: 'spell', system: {level: 0, activities: act('action')}, labels: {school: 'Evocation'}},
  {id: 'bl', name: '[TEST] Bless', type: 'spell', system: {level: 1, prepared: 1, canPrepare: true, activities: act('action')}, labels: {school: 'Enchantment'}},
  {id: 'al', name: '[TEST] Alarm', type: 'spell', system: {level: 1, prepared: 0, canPrepare: true, properties: new Set(['ritual']), activities: act('minute')}, labels: {school: 'Abjuration'}}
];
function caster() {
  const actor = makeActor({items: SPELLS, system: {spells: {spell1: {value: 1, max: 2}}}});
  for (const d of SPELLS) actor.items.get(d.id).labels = d.labels;
  return actor;
}

/** A .window-content stand-in. `failNext` makes the next redraw throw part-way (after the HTML went in). */
function fakeContent() {
  const c = {gen: 0, html: '', listeners: {}, menus: [], failNext: false,
    get innerHTML() { return this.html; },
    set innerHTML(v) { this.html = v; this.gen++; this.menus = /class="agch-menu/.test(v) ? [{remove: () => { c.menus = []; }}] : []; },
    querySelector: () => null, insertAdjacentHTML: () => {},
    querySelectorAll(sel) {
      if (this.failNext) { this.failNext = false; throw new Error('[TEST] redraw failed'); }
      return sel === '.agch-menu' ? this.menus : [];
    },
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
    /** The browser delivers an event only while its target is still in the window. */
    async dispatch(type, target) {
      if (target.gen !== this.gen) return 'detached';
      const ev = {type, target, currentTarget: this, stopPropagation() {}, preventDefault() {}};
      return Promise.all((this.listeners[type] ?? []).map(fn => fn(ev)));
    }};
  return c;
}
/** An element the user can touch in the current drawing (a select, a button). */
const element = (content, {tag = 'SELECT', dataset = {}, value = ''} = {}) => {
  const el = {tagName: tag, dataset, value, gen: content.gen, matches: sel => sel === '[data-edit]' ? 'edit' in dataset : false};
  el.closest = sel => (sel === '[data-edit]' && 'edit' in dataset) || (tag === 'SELECT' && /\bselect\b/.test(sel)) ? el : null;
  return el;
};
/** Opens a Hub the way ApplicationV2 does: render() draws into the window's content element; a reopen builds a new one. */
function open(sheet) {
  const content = fakeContent();
  sheet.element = content;
  sheet.render = async () => { sheet.renders.push({}); sheet._replaceHTML(await sheet._renderHTML(), content); return sheet; };
  return sheet.render().then(() => content);
}
const groupSelect = c => element(c, {dataset: {edit: 'list-sort', tab: 'magic', field: 'group'}});
const sortSelect = c => element(c, {dataset: {edit: 'list-sort', tab: 'magic', field: 'sort'}});
const pick = async (c, el, value) => { el.value = value; await c.dispatch('click', el); return c.dispatch('change', el); };

test('the reported sequence: click-filters on and off, then Group and Sort still change the list', async () => {
  installGlobals({user: users.owner, settings: {}});
  const sheet = new Hub({document: caster()}); sheet.tab = 'magic';
  const content = await open(sheet);
  await sheet.dispatch('list-filter', {dataset: {tab: 'magic', key: 'prepared', value: '1'}});
  await sheet.dispatch('list-filter', {dataset: {tab: 'magic', key: 'prepared', value: '1'}});
  await sheet.dispatch('list-filter', {dataset: {tab: 'magic', key: 'level', value: '1'}});
  await sheet.dispatch('list-filter', {dataset: {tab: 'magic', key: 'level', value: '1'}});
  await pick(content, groupSelect(content), 'school');
  assert.equal(game.settings.store.listSort.magic.group, 'school');
  assert.match(content.innerHTML, /data-key="magic:school:Abjuration"/, 'grouped by school on screen');
  await pick(content, sortSelect(content), 'level');
  assert.equal(game.settings.store.listSort.magic.sort, 'level');
});

test('with a menu open, clicking the Group select keeps the select on screen, so the choice made in it counts', async () => {
  installGlobals({user: users.owner, settings: {}});
  const sheet = new Hub({document: caster()}); sheet.tab = 'magic';
  const content = await open(sheet);
  await sheet.dispatch('slot-menu', {dataset: {slot: 'head'}});
  assert.equal(sheet.menu, 'slot:head');
  const select = groupSelect(content), before = content.gen;
  await content.dispatch('click', select);   // before 0.30.0 this redrew and the open select was replaced
  assert.equal(content.gen, before, 'no redraw from under the select');
  assert.equal(sheet.menu, null, 'the menu is closed');
  assert.equal(content.menus.length, 0, 'and gone from the screen');
  select.value = 'school';   // the user picks from the list that is still open
  assert.notEqual(await content.dispatch('change', select), 'detached');
  assert.equal(game.settings.store.listSort.magic.group, 'school');
  assert.match(content.innerHTML, /data-key="magic:school:/, 'the next render draws again although the menu went away without one');
});

test('a click on anything else still closes the menu with a redraw', async () => {
  installGlobals({user: users.owner, settings: {}});
  const sheet = new Hub({document: caster()}); sheet.tab = 'magic';
  const content = await open(sheet);
  await sheet.dispatch('slot-menu', {dataset: {slot: 'head'}});
  const before = content.gen;
  await content.dispatch('click', element(content, {tag: 'DIV'}));
  assert.equal(sheet.menu, null);
  assert.ok(content.gen > before, 'redrawn without the menu');
});

test('closing the Hub resets what is only kept while it is open; the reopened Hub groups and sorts', async () => {
  installGlobals({user: users.owner, settings: {}});
  const sheet = new Hub({document: caster()}); sheet.tab = 'magic';
  await open(sheet);
  await sheet.dispatch('list-filter', {dataset: {tab: 'magic', key: 'ritual', value: '1'}});
  sheet.filters.magic = '[TEST] x'; sheet.menu = 'slot:head'; sheet.expanded.add('k');
  sheet._onClose({});
  assert.deepEqual(sheet.listFilters, {magic: {}, features: {}});
  assert.deepEqual([sheet.filters, sheet.menu, sheet.expanded.size], [{}, null, 0]);
  const again = await open(sheet);   // Foundry builds a new window for the same sheet instance
  assert.ok(again.listeners.change?.length > 0, 'listeners on the new content element');
  await pick(again, groupSelect(again), 'ritual');
  assert.equal(game.settings.store.listSort.magic.group, 'ritual');
  assert.match(again.innerHTML, /\[TEST\] Bless/, 'no filter left over from before');
});

test('a redraw that fails part-way still leaves a new window with its listeners', async () => {
  installGlobals({user: users.owner, settings: {}});
  const sheet = new Hub({document: caster()}); sheet.tab = 'magic';
  const content = fakeContent(); sheet.element = content; content.failNext = true;
  assert.throws(() => sheet._replaceHTML('<p>[TEST]</p>', content), /redraw failed/);
  assert.ok(content.listeners.change?.length > 0, 'bound before the redraw ran');
  assert.equal(sheet._agchHtml, null, 'a half-done redraw is never taken as what is on screen');
  sheet._replaceHTML('<p>[TEST]</p>', content);
  assert.equal(content.listeners.change.length, 2, 'and not bound twice');
  assert.equal(content.innerHTML, '<p>[TEST]</p>');
});
