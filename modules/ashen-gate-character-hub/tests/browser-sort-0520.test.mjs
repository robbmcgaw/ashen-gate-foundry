/** 0.52.0: sorting in the Add spell… / Add item… compendium picker (mocked dnd5e browser; logic and markup, not the live window). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users} from './foundry-mock.mjs';
import * as bs from '../scripts/browser-sort.mjs';
import * as add from '../scripts/item-add.mjs';

const spell = (name, level, school, extra = {}) => ({name, type: 'spell', uuid: `Compendium.test.spells.Item.${name}`, system: {level, school, activation: {type: 'action', value: 1}, range: {units: 'ft', value: 30}, properties: [], source: {value: 'PHB'}, ...extra}});
const item = (name, type, extra = {}) => ({name, type, uuid: `Compendium.test.items.Item.${name}`, system: {rarities: [], price: {value: 0, denomination: 'gp'}, weight: {value: 1, units: 'lb'}, source: {value: ''}, ...extra}});
const names = list => list.map(e => e.name);
const setup = (settings = {}) => {
  installGlobals({settings});
  globalThis.CONFIG.DND5E.spellSchools = {abj: {label: 'Abjuration'}, evo: {label: 'Evocation'}, ill: {label: 'Illusion'}};
  globalThis.CONFIG.DND5E.currencies = {pp: {conversion: 0.1}, gp: {conversion: 1}, ep: {conversion: 2}, sp: {conversion: 10}, cp: {conversion: 100}};
};

test('spell keys: level, school, casting time, range, flags, source', () => {
  setup();
  const a = spell('Zap', 1, 'evo'), b = spell('Alarm', 1, 'abj'), c = spell('Light', 0, 'evo'), d = spell('Wish', 9, 'con');
  assert.deepEqual(names(bs.sortEntries('spell', [a, d, b, c], {key: 'level', dir: 'asc'})), ['Light', 'Alarm', 'Zap', 'Wish']);
  assert.deepEqual(names(bs.sortEntries('spell', [a, d, b, c], {key: 'level', dir: 'desc'})), ['Wish', 'Alarm', 'Zap', 'Light']);   // ties stay name A-Z when reversed
  // School by its label (Abjuration < Conjuration key 'con' is unknown so it reads as its key) then level then name
  assert.deepEqual(names(bs.sortEntries('spell', [a, b, c], {key: 'school', dir: 'asc'})), ['Alarm', 'Light', 'Zap']);
  assert.deepEqual(names(bs.sortEntries('spell', [a, b, c], {key: 'school', dir: 'desc'})), ['Light', 'Zap', 'Alarm']);
  const bonus = spell('Bonus', 1, 'evo', {activation: {type: 'bonus', value: 1}}), minute = spell('Ritualish', 1, 'evo', {activation: {type: 'minute', value: 10}}), react = spell('Shield', 1, 'abj', {activation: {type: 'reaction'}});
  assert.deepEqual(names(bs.sortEntries('spell', [minute, react, bonus, a], {key: 'casting', dir: 'asc'})), ['Zap', 'Bonus', 'Shield', 'Ritualish']);
  const self = spell('Self', 1, 'abj', {range: {units: 'self'}}), touch = spell('Touch', 1, 'abj', {range: {units: 'touch'}}), mile = spell('Mile', 1, 'abj', {range: {units: 'mi', value: 1}}), spec = spell('Special', 1, 'abj', {range: {units: 'spec'}}), sight = spell('Sight', 1, 'abj', {range: {units: 'any'}});
  const order = ['Self', 'Touch', 'Zap', 'Mile', 'Sight'];
  assert.deepEqual(names(bs.sortEntries('spell', [sight, mile, spec, a, touch, self], {key: 'range', dir: 'asc'})), [...order, 'Special']);
  assert.deepEqual(names(bs.sortEntries('spell', [sight, mile, spec, a, touch, self], {key: 'range', dir: 'desc'})), [...order.reverse(), 'Special']);   // special last both ways
  const conc = spell('Bless', 1, 'enc', {properties: ['concentration', 'vocal']}), rit = spell('Detect', 1, 'div', {properties: new Set(['ritual'])});
  assert.deepEqual(names(bs.sortEntries('spell', [a, rit, conc], {key: 'concentration', dir: 'asc'}))[0], 'Bless');
  assert.deepEqual(names(bs.sortEntries('spell', [a, rit, conc], {key: 'ritual', dir: 'asc'}))[0], 'Detect');
  const x = spell('Y', 1, 'evo', {source: {value: 'XGE'}}), y = spell('X', 1, 'evo', {source: {value: 'PHB'}}), none = spell('N', 1, 'evo', {source: {value: ''}});
  assert.deepEqual(names(bs.sortEntries('spell', [none, x, y], {key: 'source', dir: 'asc'})), ['X', 'Y', 'N']);
  assert.deepEqual(names(bs.sortEntries('spell', [none, x, y], {key: 'source', dir: 'desc'})), ['Y', 'X', 'N']);
});

test('rarity runs common to artifact, not alphabetical; none last in both directions', () => {
  setup();
  const mk = (n, r, price) => item(n, 'equipment', {rarities: r ? [r] : [], price: {value: price ?? 0, denomination: 'gp'}});
  const list = [mk('Plain', null), mk('V', 'veryRare', 5), mk('L', 'legendary'), mk('R', 'rare', 50), mk('U', 'uncommon'), mk('C', 'common'), mk('A', 'artifact'), mk('R2', 'rare', 10)];
  assert.deepEqual(names(bs.sortEntries('item', list, {key: 'rarity', dir: 'asc'})), ['C', 'U', 'R2', 'R', 'V', 'L', 'A', 'Plain']);   // rare: price 10 before 50
  assert.deepEqual(names(bs.sortEntries('item', list, {key: 'rarity', dir: 'desc'})), ['A', 'L', 'V', 'R2', 'R', 'U', 'C', 'Plain'])   // the price tie-break stays low to high;
  for (const form of ['veryRare', 'very rare', 'very-rare', 'VERY RARE']) assert.equal(bs.rarityRank(form), 3);
  assert.equal(bs.rarityRank(new Set(['legendary', 'uncommon'])), 1);   // the lowest of several
  assert.equal(bs.rarityRank([]), null);
  assert.equal(bs.rarityRank('mythic'), null);
});

test('price is counted in gp across every coin; zero or unknown is last in both directions', () => {
  setup();
  assert.equal(bs.priceGp({value: 100, denomination: 'cp'}), 1);
  assert.equal(bs.priceGp({value: 10, denomination: 'sp'}), 1);
  assert.equal(bs.priceGp({value: 2, denomination: 'ep'}), 1);
  assert.equal(bs.priceGp({value: 1, denomination: 'pp'}), 10);
  assert.equal(bs.priceGp({value: 5}), 5);
  assert.equal(bs.priceGp({value: 0, denomination: 'gp'}), null);
  assert.equal(bs.priceGp({value: 5, denomination: 'zz'}), null);
  const p = (n, value, denomination) => item(n, 'loot', {price: {value, denomination}});
  const list = [p('free', 0, 'gp'), p('9sp', 9, 'sp'), p('2pp', 2, 'pp'), p('1gp', 1, 'gp'), p('50cp', 50, 'cp'), p('15gp', 15, 'gp')];
  assert.deepEqual(names(bs.sortEntries('item', list, {key: 'price', dir: 'asc'})), ['50cp', '9sp', '1gp', '15gp', '2pp', 'free']);
  assert.deepEqual(names(bs.sortEntries('item', list, {key: 'price', dir: 'desc'})), ['2pp', '15gp', '1gp', '9sp', '50cp', 'free']);
});

test('item type order, weight in pounds, source, and name as the default', () => {
  setup();
  const t = [item('b', 'container'), item('a', 'weapon'), item('d', 'loot'), item('c', 'consumable'), item('e', 'tool'), item('f', 'equipment'), item('z', 'mystery')];
  assert.deepEqual(names(bs.sortEntries('item', t, {key: 'type', dir: 'asc'})), ['a', 'f', 'c', 'e', 'd', 'b', 'z']);
  assert.deepEqual(names(bs.sortEntries('item', t, {key: 'type', dir: 'desc'})), ['z', 'b', 'd', 'e', 'c', 'f', 'a']);
  assert.equal(bs.weightLb({value: 2, units: 'kg'}), 5);
  assert.equal(bs.weightLb({value: 1, units: 'tn'}), 2000);
  assert.equal(bs.weightLb({}), null);
  const w = [item('heavy', 'loot', {weight: {value: 10, units: 'lb'}}), item('kilo', 'loot', {weight: {value: 2, units: 'kg'}}), item('none', 'loot', {weight: {}}), item('air', 'loot', {weight: {value: 0, units: 'lb'}})];
  assert.deepEqual(names(bs.sortEntries('item', w, {key: 'weight', dir: 'asc'})), ['air', 'kilo', 'heavy', 'none']);
  assert.deepEqual(names(bs.sortEntries('item', w, {key: 'weight', dir: 'desc'})), ['heavy', 'kilo', 'air', 'none']);
  assert.deepEqual(names(bs.sortEntries('item', [item('b', 'loot'), item('A', 'loot'), item('c', 'loot')], {key: 'name', dir: 'asc'})), ['A', 'b', 'c']);
  assert.deepEqual(names(bs.sortEntries('item', [item('b', 'loot'), item('A', 'loot'), item('c', 'loot')], {key: 'name', dir: 'desc'})), ['c', 'b', 'A']);
});

test('stable: equal keys keep the incoming order, and keys are worked out once per entry', () => {
  setup();
  const same = ['q', 'w', 'e', 'r'].map(n => ({...item('same', 'loot'), uuid: n}));
  assert.deepEqual(bs.sortEntries('item', same, {key: 'rarity', dir: 'asc'}).map(e => e.uuid), ['q', 'w', 'e', 'r']);
  assert.deepEqual(bs.sortEntries('item', same, {key: 'rarity', dir: 'desc'}).map(e => e.uuid), ['q', 'w', 'e', 'r']);
  let reads = 0;
  const counted = Array.from({length: 200}, (_, i) => { const e = spell(`S${199 - i}`, i % 10, 'evo'); return new Proxy(e, {get(t, k) { if (k === 'system') reads++; return t[k]; }}); });
  bs.sortEntries('spell', counted, {key: 'level', dir: 'asc'});
  assert.equal(reads, 200);   // one key computation each, not one per comparison
});

test('which picker gets which sort', () => {
  assert.equal(bs.kindFor(['spell']), 'spell');
  assert.equal(bs.kindFor(add.ADD_TYPES.inventory), 'item');
  assert.equal(bs.kindFor(add.ADD_TYPES.combat), 'item');
  assert.equal(bs.kindFor(add.ADD_TYPES.features), null);
  assert.equal(bs.kindFor([]), null);
  assert.deepEqual(bs.SPELL_SORTS.map(([k]) => k), ['name', 'level', 'school', 'casting', 'range', 'concentration', 'ritual', 'source']);
  assert.deepEqual(bs.ITEM_SORTS.map(([k]) => k), ['name', 'type', 'rarity', 'price', 'weight', 'source']);
});

test('the choice is remembered per user, spells and items apart, with defaults', async () => {
  setup();
  assert.deepEqual(bs.loadChoice('spell'), {key: 'level', dir: 'asc'});
  assert.deepEqual(bs.loadChoice('item'), {key: 'name', dir: 'asc'});
  await bs.saveChoice('spell', {key: 'school', dir: 'desc'});
  await bs.saveChoice('item', {key: 'rarity', dir: 'asc'});
  assert.deepEqual(bs.loadChoice('spell'), {key: 'school', dir: 'desc'});
  assert.deepEqual(bs.loadChoice('item'), {key: 'rarity', dir: 'asc'});
  assert.deepEqual(globalThis.game.settings.store.browserSort, {spell: {key: 'school', dir: 'desc'}, item: {key: 'rarity', dir: 'asc'}});
  // an unknown saved value (a key from another version, junk) falls back
  setup({browserSort: {spell: {key: 'price', dir: 'sideways'}, item: 'junk'}});
  assert.deepEqual(bs.loadChoice('spell'), {key: 'level', dir: 'asc'});
  assert.deepEqual(bs.loadChoice('item'), {key: 'name', dir: 'asc'});
  // a settings failure never throws
  globalThis.game.settings.get = () => { throw new Error('nope'); };
  assert.deepEqual(bs.loadChoice('item'), {key: 'name', dir: 'asc'});
  const registered = []; bs.registerBrowserSortSetting({register: (...a) => registered.push(a)});
  assert.equal(registered[0][1], 'browserSort'); assert.equal(registered[0][2].scope, 'client'); assert.equal(registered[0][2].config, false);
});

test('markup: a labelled select and a pressed toggle with icon and text', () => {
  const html = bs.sortBarHtml('item', {key: 'rarity', dir: 'desc'}, 'cb-1');
  assert.match(html, /<label class="agch-bsort__label" for="cb-1-key">Sort by<\/label>/);
  assert.match(html, /<select id="cb-1-key" data-ag-sort="key">/);
  assert.match(html, /<option value="rarity" selected>Rarity<\/option>/);
  assert.equal((html.match(/ selected>/g) ?? []).length, 1);
  assert.match(html, /<button type="button" class="ag-chip agch-bsort__dir" data-ag-sort="dir" aria-pressed="true"[^>]*><i class="fa-solid fa-arrow-down-wide-short" aria-hidden="true"><\/i><span>Descending<\/span><\/button>/);
  assert.match(bs.sortBarHtml('spell', {key: 'level', dir: 'asc'}), /aria-pressed="false"/);
  assert.match(html, /role="group" aria-label="Sort results"/);
  assert.doesNotMatch(html, /aria-sort/);   // the results are a list, not a table: no column headers to sort
  assert.doesNotMatch(html, /<div[^>]*onclick|tabindex/);
});

test('the bar reports what the user changed', () => {
  const handlers = {};
  const el = key => ({addEventListener: (ev, fn) => { handlers[`${key}:${ev}`] = fn; }});
  const root = {querySelector: sel => el(sel.includes('"key"') ? 'key' : 'dir')};
  const seen = []; bs.bindSortBar(root, c => seen.push(c));
  handlers['key:change']({currentTarget: {value: 'price'}});
  handlers['dir:click']({currentTarget: {getAttribute: () => 'false'}});
  handlers['dir:click']({currentTarget: {getAttribute: () => 'true'}});
  assert.deepEqual(seen, [{key: 'price'}, {dir: 'desc'}, {dir: 'asc'}]);
});

test('entry facts show what the rows are sorted on', () => {
  setup();
  assert.equal(bs.entrySummary('spell', spell('A', 3, 'evo')), 'Level 3 · Evocation');
  assert.equal(bs.entrySummary('spell', spell('A', 0, 'abj')), 'Cantrip · Abjuration');
  assert.equal(bs.entrySummary('item', item('A', 'weapon', {rarities: ['rare'], price: {value: 500, denomination: 'gp'}})), 'Rare · 500 gp');
  assert.equal(bs.entrySummary('item', item('A', 'weapon', {rarities: ['veryRare'], price: {value: 5, denomination: 'sp'}})), 'Very rare · 5 sp');
  assert.equal(bs.entrySummary('item', item('A', 'weapon')), '');
});

/* ---- the subclass, over a stand-in for dnd5e's browser (same shape: static fetch + 50-row batches) ---- */
function fakeBrowser(index) {
  const log = {fetches: [], renders: []};
  class CompendiumBrowser {
    constructor(options = {}) { this.options = options; this.id = 'cb-7'; this.name = ''; this.element = {focused: null, querySelector: sel => ({focus: () => { this.element.focused = sel; }})}; this.listeners = {}; this.shown = []; }
    static BATCH = 50;
    static async selectOne() { return null; }
    static fetch(documentClass, {types = new Set(), filters = [], indexFields = new Set(), sort = true} = {}) {
      log.fetches.push({types, indexFields: [...indexFields], sortIsFunction: typeof sort === 'function'});
      let docs = index.filter(e => (!types.size || types.has(e.type)) && filters.every(f => f(e)));
      docs.sort(typeof sort === 'function' ? sort : (a, b) => a.name.localeCompare(b.name));
      return Promise.resolve(docs);
    }
    async _prepareResultsContext(context) {
      const f = this.name ? [e => e.name.toLowerCase().includes(this.name.toLowerCase())] : [];
      this.results = CompendiumBrowser.fetch('Item', {types: this.options.filters.locked.types, filters: f, indexFields: new Set(['system.source'])});
      return context;
    }
    async render(opts) { log.renders.push(opts); if (opts.parts?.includes('results')) { await this._prepareResultsContext({}); const host = {html: '', insertAdjacentHTML(_, h) { this.html = h; }, querySelector: () => null}; this.host = host; this._attachPartListeners('results', {querySelector: () => host}, {}); this.shown = (await this.results).slice(0, CompendiumBrowser.BATCH); } return this; }
    _attachPartListeners() {}
    async _renderResult(entry) { const sub = {textContent: 'Spell'}; return {querySelector: () => sub, sub}; }
    addEventListener(ev, fn) { this.listeners[ev] = fn; }
    get selected() { return this._selected ?? new Set(); }
  }
  return {CompendiumBrowser, log};
}
const big = () => Array.from({length: 120}, (_, i) => spell(`Spell ${String(i).padStart(3, '0')}`, 9 - (i % 10), 'evo'));

test('the whole filtered set is sorted before the 50-row batches, and the sort works with search', async () => {
  setup();
  const index = big(), {CompendiumBrowser, log} = fakeBrowser(index);
  const Sorted = bs.sortedBrowserClass(CompendiumBrowser);
  const b = new Sorted({filters: {locked: {types: new Set(['spell'])}}, agSort: {kind: 'spell'}});
  await b.render({parts: ['results']});
  const first = b.shown;
  assert.equal(first.length, 50);
  // 12 of the 120 are cantrips, spread through the compendium; they all come first, then level 1 follows
  assert.ok(first.slice(0, 12).every(e => e.system.level === 0) && first[12].system.level === 1, 'cantrips first even though they sit all through the compendium');
  assert.deepEqual(first.map(e => e.system.level), [...first.map(e => e.system.level)].sort((x, y) => x - y));
  // the full result set, not the visible page, is in order
  const all = await b.results;
  assert.equal(all.length, 120);
  assert.deepEqual(all.map(e => e.system.level), [...all.map(e => e.system.level)].sort((x, y) => x - y));
  assert.deepEqual(log.fetches.at(-1).indexFields.sort(), ['system.activation.type', 'system.activation.value', 'system.level', 'system.properties', 'system.range.units', 'system.range.value', 'system.school', 'system.source']);
  assert.equal(log.fetches.at(-1).sortIsFunction, true);
  // search narrows first, then the order applies to what is left
  b.name = 'Spell 01';
  await b.render({parts: ['results']});
  const found = await b.results;
  assert.equal(found.length, 10);
  assert.deepEqual(found.map(e => e.system.level), [...found.map(e => e.system.level)].sort((x, y) => x - y));
  // dnd5e's fetch is put back untouched afterwards
  assert.equal(CompendiumBrowser.fetch.name, 'fetch');
  assert.equal(Object.getOwnPropertyDescriptor(CompendiumBrowser, 'fetch').value, CompendiumBrowser.fetch);
  await CompendiumBrowser.fetch('Item', {});
  assert.equal(log.fetches.at(-1).sortIsFunction, false);
  assert.equal(log.fetches.at(-1).indexFields.length, 0);
});

test('changing the sort saves it, redraws only the results, restores focus; the next browser starts with it', async () => {
  setup();
  const {CompendiumBrowser, log} = fakeBrowser(big());
  const Sorted = bs.sortedBrowserClass(CompendiumBrowser);
  const b = new Sorted({filters: {locked: {types: new Set(['spell'])}}, agSort: {kind: 'spell'}});
  await b.render({parts: ['results']});
  assert.match(b.host.html, /Sort by/);
  assert.match(b.host.html, /<option value="level" selected>/);
  const before = log.renders.length;
  await b._agChange({key: 'name'});
  assert.equal(log.renders.length, before + 1); assert.deepEqual(log.renders.at(-1), {parts: ['results']});
  assert.equal(b.element.focused, '[data-ag-sort="key"]');
  assert.deepEqual((await b.results).slice(0, 2).map(e => e.name), ['Spell 000', 'Spell 001']);
  await b._agChange({dir: 'desc'});
  assert.equal(b.element.focused, '[data-ag-sort="dir"]');
  assert.deepEqual((await b.results)[0].name, 'Spell 119');
  assert.match(b.host.html, /<option value="name" selected>/); assert.match(b.host.html, /aria-pressed="true"/);
  assert.deepEqual(globalThis.game.settings.store.browserSort.spell, {key: 'name', dir: 'desc'});
  const again = new Sorted({filters: {locked: {types: new Set(['spell'])}}, agSort: {kind: 'spell'}});
  await again.render({parts: ['results']});
  assert.match(again.host.html, /<option value="name" selected>/); assert.match(again.host.html, /aria-pressed="true"/);
  // items have their own memory
  const items = new Sorted({filters: {locked: {types: new Set(['loot'])}}, agSort: {kind: 'item'}});
  await items.render({parts: ['results']});
  assert.match(items.host.html, /<option value="name" selected>/); assert.match(items.host.html, /aria-pressed="false"/);
});

test('a browser opened without a sort kind is dnd5e\'s own, and rows get their sort facts', async () => {
  setup();
  const {CompendiumBrowser, log} = fakeBrowser(big());
  const Sorted = bs.sortedBrowserClass(CompendiumBrowser);
  const plain = new Sorted({filters: {locked: {types: new Set(['spell'])}}});
  await plain.render({parts: ['results']});
  assert.equal(log.fetches.at(-1).sortIsFunction, false); assert.equal(plain.host.html, '');
  const sorted = new Sorted({filters: {locked: {types: new Set(['spell'])}}, agSort: {kind: 'spell'}});
  const row = await sorted._renderResult(spell('Fireball', 3, 'evo'), 'Item');
  assert.equal(row.sub.textContent, 'Spell · Level 3 · Evocation');
  assert.equal(bs.sortedBrowserClass(CompendiumBrowser), Sorted);   // one subclass per browser class
});

test('Add spell… and Add item… open the sorted picker; anything else falls back to selectOne', async () => {
  const picks = [];
  const mk = Base => { const w = installGlobals({user: users.owner}); globalThis.dnd5e = {applications: {CompendiumBrowser: Base}}; return w; };
  // a full browser: Add spell opens the subclass with the spell kind, locked to spells
  const {CompendiumBrowser} = fakeBrowser(big());
  mk(CompendiumBrowser);
  globalThis.fromUuid = async () => null;
  const originalRender = CompendiumBrowser.prototype.render;
  CompendiumBrowser.prototype.render = async function() { picks.push([this.options.agSort, [...this.options.filters.locked.types], this.options.selection]); queueMicrotask(() => this.listeners.close()); return this; };
  const actor = makeActor();
  let r = await add.browseAndAdd(actor, 'magic'); assert.deepEqual(r, {ok: true, result: null});
  r = await add.browseAndAdd(actor, 'inventory');
  r = await add.browseAndAdd(actor, 'features');
  CompendiumBrowser.prototype.render = originalRender;
  assert.deepEqual(picks[0], [{kind: 'spell'}, ['spell'], {min: 1, max: 1}]);
  assert.deepEqual(picks[1], [{kind: 'item'}, ['weapon', 'equipment', 'consumable', 'tool', 'loot', 'container'], {min: 1, max: 1}]);
  assert.equal(picks.length, 2, 'features keep dnd5e\'s own picker');
  // a browser without what the sort needs, or that cannot be built: selectOne, exactly as before
  for (const Base of [{async selectOne(o) { picks.push(['plain', o]); return null; }}, class Broken { static fetch() {} static async selectOne(o) { picks.push(['broken', o]); return null; } _prepareResultsContext() {} _attachPartListeners() {} _renderResult() {} constructor() { throw new Error('boom'); } }]) {
    mk(Base); picks.length = 0;
    r = await add.browseAndAdd(makeActor(), 'magic');
    assert.deepEqual(r, {ok: true, result: null});
    assert.equal(picks.length, 1); assert.deepEqual([...picks[0][1].filters.locked.types], ['spell']);
  }
});
