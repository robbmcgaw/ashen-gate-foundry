/** 0.11.0 item cards: facts from dnd5e labels, summaries, column headers, stripes, sort/group, favourites, search (mocked Foundry; logic only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {plainText, summaryOf, itemFacts, cardList, COLUMNS} from '../scripts/cards.mjs';
import {listChoice, setListChoice, sortRows, ORGANIZE} from '../scripts/organize.mjs';
import {itemRow} from '../scripts/items.mjs';
import * as ia from '../scripts/item-actions.mjs';
import {createHubSheetClass, ACTIONS, EDITS, applyFilter} from '../scripts/sheet.mjs';

const act = type => [{activation: {type}}];
const DESC = '<p>A [TEST] blade that hums with @UUID[Compendium.x.Item.abc]{Storm Power} and deals [[/r 1d6]] extra damage &amp; more. It keeps going for long enough that the summary has to be shortened somewhere sensible.</p><p>Second paragraph.</p>';
const ITEMS = () => [
  {id: 'sw', name: '[TEST] Longsword', type: 'weapon', system: {equipped: true, rarity: 'rare', activities: act('action'), description: {value: DESC}},
    labels: {damages: [{label: '1d8 + 3 Slashing'}], toHit: '+5', reach: '5 ft', properties: [{abbr: 'ver', label: 'Versatile'}]}},
  {id: 'bow', name: '[TEST] Longbow', type: 'weapon', system: {equipped: false, activities: act('action')}, labels: {damage: '1d8', damageTypes: 'Piercing', range: '150 / 600 ft'}},
  {id: 'pot', name: '[TEST] Potion', type: 'consumable', system: {quantity: 3, weight: {value: 0.5, units: 'lb'}, price: {value: 50, denomination: 'gp'}, activities: act('bonus'), uses: {max: 1, spent: 0}}, labels: {activation: '1 Bonus Action'}},
  {id: 'pack', name: '[TEST] Backpack', type: 'container', system: {quantity: 1}},
  {id: 'rope', name: '[TEST] Rope', type: 'loot', system: {quantity: 1, container: 'pack', weight: {value: 10, units: 'lb'}}},
  {id: 'fb', name: '[TEST] Fire Bolt', type: 'spell', system: {level: 0, activities: act('action')}, labels: {level: 'Cantrip', school: 'Evocation', activation: '1 Action', range: '120 ft', duration: 'Instantaneous', components: {vsm: 'V, S'}}},
  {id: 'bl', name: '[TEST] Bless', type: 'spell', system: {level: 1, prepared: 1, canPrepare: true, activities: act('action'), properties: new Set(['concentration'])}, labels: {level: '1st Level', school: 'Enchantment', activation: '1 Action', concentrationDuration: '1 Minute', components: {vsm: 'V, S, M'}}},
  {id: 'ab', name: '[TEST] Alarm', type: 'spell', system: {level: 1, prepared: 0, canPrepare: true, activities: act('action'), properties: new Set(['ritual'])}, labels: {level: '1st Level', school: 'Abjuration', activation: '1 Minute'}},
  {id: 'su', name: '[TEST] Action Surge', type: 'feat', system: {type: {value: 'class'}, activities: act('special'), uses: {max: 1, spent: 1}}, labels: {activation: 'Special', recovery: 'Short Rest', featType: 'Class Feature'}},
  {id: 'wi', name: '[TEST] Second Wind', type: 'feat', system: {type: {value: 'class'}, activities: act('bonus')}, labels: {activation: '1 Bonus Action', featType: 'Class Feature'}}
];
/** A character with dnd5e-style favourites on system (the real ones live on the character data model). */
function actorWith({favorites = true} = {}) {
  const defs = ITEMS(), actor = makeActor({items: defs, system: {spells: {spell1: {value: 1, max: 2}}}});
  for (const d of defs) if (d.labels) actor.items.get(d.id).labels = d.labels;
  if (favorites) {
    actor.system.favorites = [];
    actor.system.hasFavorite = id => actor.system.favorites.some(f => f.id === id);
    actor.system.addFavorite = async f => { actor.calls.push(['addFavorite', f]); actor.system.favorites.push(f); };
    actor.system.removeFavorite = async id => { actor.calls.push(['removeFavorite', id]); actor.system.favorites = actor.system.favorites.filter(f => f.id !== id); };
  }
  return actor;
}
const renderTab = async (tab, actor = actorWith(), setup = s => s) => { const s = new (createHubSheetClass(FakeActorSheetV2))({document: actor}); s.tab = tab; setup(s); return {sheet: s, html: await s._renderHTML()}; };
const body = html => html.slice(html.indexOf('class="agch-body"'));

test('description text: plain text only, enricher names kept, rolls show their formula', () => {
  const t = plainText(DESC);
  assert.doesNotMatch(t, /[<>]/);
  assert.match(t, /hums with Storm Power and deals 1d6 extra damage & more\./);
  assert.match(t, /\n\nSecond paragraph|\nSecond paragraph/);
  assert.equal(plainText('<script>alert(1)</script><p>Hi</p>'), 'alert(1)Hi', 'tags dropped; the card escapes whatever is left');
  const s = summaryOf(t);
  assert.ok(s.summary.length <= 141); assert.match(s.summary, /…$/); assert.equal(s.more, true);
  assert.deepEqual(summaryOf('Short.'), {summary: 'Short.', more: false});
  assert.equal(summaryOf('Short.\nMore below.').more, true, 'a short first line with more text still offers More');
  assert.equal(summaryOf('').summary, '');
});

test('key facts come from dnd5e\'s own labels and item data', () => {
  installGlobals();
  const a = actorWith(), f = id => itemFacts(a.items.get(id));
  assert.deepEqual([f('sw').damage, f('sw').toHit, f('sw').range, f('sw').properties], ['1d8 + 3 Slashing', '+5', '5 ft', 'Versatile']);
  assert.equal(f('bow').damage, '1d8 Piercing', 'older label shape still reads');
  assert.deepEqual([f('bl').level, f('bl').school, f('bl').activation, f('bl').duration, f('bl').concentration, f('bl').components], ['1st Level', 'Enchantment', '1 Action', '1 Minute', true, 'V, S, M']);
  assert.equal(f('ab').ritual, true);
  assert.deepEqual([f('su').uses, f('su').recovery, f('su').type], ['0 / 1', 'Short Rest', 'Class Feature']);
  assert.deepEqual([f('pot').quantity, f('pot').weight, f('pot').value, f('pot').uses], ['3', '0.5 lb', '50 gp', '1 / 1']);
  assert.equal(itemFacts({system: {}}).damage, '', 'missing data is just empty');
});

test('card list: column headers, stripes, rarity, summary with More, full text kept open across renders', () => {
  installGlobals();
  const a = actorWith(), rows = ['sw', 'bow', 'pot'].map(id => itemRow(a.items.get(id)));
  const cols = [COLUMNS.damage, COLUMNS.toHit];
  let html = cardList(rows, cols, {listKey: 'x'});
  assert.match(html, /<ul class="ag-list agch-cards" style="--agch-cols:2"><li class="agch-card__headrow" aria-hidden="true"><span><\/span><span><\/span><span>Item<\/span><span>Damage<\/span><span>To hit<\/span><span>Actions<\/span><\/li>/);
  const cards = html.match(/<li class="agch-card(?: [^"]*)?"/g);
  assert.deepEqual(cards, ['<li class="agch-card is-equipped has-rarity ag-rarity-edge"', '<li class="agch-card is-alt"', '<li class="agch-card"'], 'stripes alternate');
  assert.match(html, /data-item-id="sw" data-rarity="rare"/);
  assert.match(html, /data-label="Damage">1d8 \+ 3 Slashing</);
  assert.match(html, /data-label="To hit">—</, 'empty facts show a dash');
  assert.match(html, /data-action="item-more" data-id="sw" data-key="more:x:sw" data-ag-always aria-expanded="false"/);
  assert.match(html, /class="agch-card__detail" id="more:x:sw" hidden>A \[TEST\] blade/);
  html = cardList(rows, cols, {listKey: 'x', expanded: new Set(['more:x:sw'])});
  assert.match(html, /aria-expanded="true"[^>]*>Less</); assert.match(html, /id="more:x:sw">A/);
});

test('More toggles the full text in place and the sheet remembers it', async () => {
  installGlobals({settings: {showItemDescriptions: true}});   // the long rows (0.53.0: compact is the default)
  const {sheet} = await renderTab('combat');
  const detail = {hidden: true}, attrs = {};
  const target = {dataset: {key: 'more:combat-category-combat:sw'}, textContent: 'More', setAttribute: (k, v) => { attrs[k] = v; }, closest: () => ({querySelector: () => detail})};
  ACTIONS['item-more'](sheet, target);
  assert.equal(detail.hidden, false); assert.equal(target.textContent, 'Less'); assert.equal(attrs['aria-expanded'], 'true');
  assert.equal(sheet.expanded.has('more:combat-category-combat:sw'), true);
  assert.match(await sheet._renderHTML(), /id="more:combat-category-combat:sw">/, 'still open after a re-render');
  ACTIONS['item-more'](sheet, target);
  assert.equal(detail.hidden, true); assert.equal(sheet.expanded.size, 0);
});

test('Combat: no initiative in the tab (it is on the left), weapons and actions keep Use', async () => {
  installGlobals({user: users.owner});
  const {html} = await renderTab('combat');
  assert.doesNotMatch(body(html), /roll-initiative|Roll initiative/);
  assert.match(html, /agch-tile[^>]*data-config="initiative"[\s\S]*data-action="roll-initiative"/, 'initiative still on the character column');
  assert.match(body(html), /<span>Dice<\/span><span>To hit<\/span><span>Range<\/span><span>Properties<\/span>/);
  assert.match(body(html), /data-action="item-use" data-id="sw"/);
  assert.match(body(html), /Not equipped/);
});

test('Inventory: quantity, weight, value, uses columns; every action kept; containers still fold', async () => {
  installGlobals({user: users.owner, settings: {collapsedSections: {'container:pack': true}}});
  const {html} = await renderTab('inventory');
  const b = body(html);
  assert.match(b, /<span>Qty<\/span><span>Weight<\/span><span>Value<\/span><span>Uses<\/span>/);
  assert.match(b, /data-label="Qty"><span class="agch-qty">[\s\S]*data-edit="item-qty" data-id="pot" value="3"/);
  assert.match(b, /data-label="Weight">0.5 lb<[\s\S]*data-label="Value">50 gp</);
  for (const re of [/data-action="item-unequip" data-id="sw"/, /data-action="item-equip" data-id="bow"/, /data-action="item-use" data-id="pot"/]) assert.match(b, re);
  assert.match(b, /data-key="container:pack" data-ag-always aria-expanded="false"/);
  assert.match(b, /<li class="agch-contents" data-sec-body="container:pack" hidden><ul class="ag-list agch-cards agch-crowlist agch-crowlist--nested[\s\S]*\[TEST\] Rope/);
});

test('group and sort choices: per user, safe defaults, unknown values refused', async () => {
  installGlobals({settings: {}});
  assert.deepEqual(listChoice('magic'), {group: 'level', sort: 'name'});
  installGlobals({settings: {listSort: {magic: {group: 'bogus', sort: 'prepared'}}}});
  assert.deepEqual(listChoice('magic'), {group: 'level', sort: 'prepared'});
  globalThis.game.settings.get = () => { throw new Error('not registered'); };
  assert.deepEqual(listChoice('features'), {group: 'type', sort: 'name'});
  installGlobals({settings: {}});
  assert.equal((await setListChoice('magic', 'group', 'school')).ok, true);
  assert.deepEqual(game.settings.store.listSort, {magic: {group: 'school', sort: 'name'}});
  assert.equal((await setListChoice('magic', 'group', 'nope')).ok, false);
  assert.equal((await setListChoice('magic', 'colour', 'x')).ok, false);
  const rows = [{name: 'B', level: 1, prepared: 0}, {name: 'A', level: 2, prepared: 1}, {name: 'C', level: 0, always: true}];
  assert.deepEqual(sortRows(rows, 'name').map(r => r.name), ['A', 'B', 'C']);
  assert.deepEqual(sortRows(rows, 'level').map(r => r.name), ['C', 'B', 'A']);
  assert.deepEqual(sortRows(rows, 'prepared').map(r => r.name), ['C', 'A', 'B']);
  assert.ok(ORGANIZE.magic.sorts.some(([k]) => k === 'school') && ORGANIZE.features.groups.length === 5);
});

test('Magic (long rows): toolbar with search, group and sort; group by school; columns follow the grouping', async () => {
  installGlobals({user: users.owner, settings: {showSpellDescriptions: true}});
  let {sheet, html} = await renderTab('magic');
  let b = body(html);
  assert.match(b, /data-filter data-tab="magic" placeholder="Search spells"/);
  assert.doesNotMatch(b, /data-edit="list-sort"/, '0.33.0: Group and Sort sit in the Filters popover');
  assert.match(b, /data-action="filters-menu" data-tab="magic" data-ag-always aria-haspopup="true" aria-expanded="false"/);
  sheet.menu = 'filters:magic';
  assert.match(body(await sheet._renderHTML()), /agch-filtermenu[\s\S]*data-edit="list-sort" data-tab="magic" data-field="group" data-ag-always/);
  sheet.menu = null;
  assert.match(b, /data-key="magic:0"[\s\S]*data-key="magic:1"/, 'spell levels as folding groups');
  assert.match(b, /<span>Casting<\/span><span>Range<\/span><span>Duration<\/span><span>Components<\/span>/, '0.33.0 (CH-08): four fact columns');
  assert.match(b, /\[TEST\] Bless<\/button><span class="agch-item__badges"><span class="ag-badge">Enchantment<\/span>/, 'the school sits beside the name (grouped by level: no level badge)');
  assert.match(b, /1 Minute <span class="ag-badge agch-flag" data-tooltip="Concentration"><span aria-hidden="true">C<\/span><span class="ag-sr-only">Concentration<\/span><\/span>/);
  assert.match(b, /data-tooltip="Ritual"><span aria-hidden="true">R</);
  assert.match(b, /data-action="spell-prepare" data-id="bl"[\s\S]*data-action="item-use" data-id="bl"/, 'Prepare and Cast kept');
  await EDITS['list-sort'](sheet, {dataset: {tab: 'magic', field: 'group'}, value: 'school'});
  b = body(await sheet._renderHTML());
  assert.match(b, /data-key="magic:school:Abjuration"[\s\S]*data-key="magic:school:Enchantment"[\s\S]*data-key="magic:school:Evocation"/);
  assert.match(b, /<span>Casting<\/span>/);
  assert.doesNotMatch(b, /<span class="ag-badge">Enchantment<\/span>/, 'grouped by school: no school badge');
  assert.match(b, /\[TEST\] Bless<\/button><span class="agch-item__badges"><span class="ag-badge">1st Level<\/span>/, 'the level (dnd5e label) sits beside the name');
  assert.match(b, /agch-slotstrip/, 'slots still shown when not grouped by level');
  await EDITS['list-sort'](sheet, {dataset: {tab: 'magic', field: 'group'}, value: 'none'});
  await EDITS['list-sort'](sheet, {dataset: {tab: 'magic', field: 'sort'}, value: 'prepared'});
  b = body(await sheet._renderHTML());
  assert.match(b, /All spells[\s\S]*\[TEST\] Bless[\s\S]*\[TEST\] Fire Bolt[\s\S]*\[TEST\] Alarm/, 'prepared first, then level, then name');
});

test('Features: group by action type, sort by uses; Use kept', async () => {
  installGlobals({user: users.owner, settings: {listSort: {features: {group: 'activation', sort: 'uses'}}}});
  const b = body((await renderTab('features')).html);
  assert.match(b, /data-key="features:activation-bonus"[\s\S]*data-key="features:activation-special"/, 'grouped by dnd5e activation type');
  assert.match(b, /<span>Type<\/span><span>Uses<\/span><span>Recovery<\/span>/);
  assert.match(b, /data-action="item-use" data-id="su"/);
});

test('favourites: dnd5e\'s own list; star toggles it; Favourites group first; owner only; no star without support', async () => {
  installGlobals({user: users.owner, settings: {}});
  const actor = actorWith();
  let b = body((await renderTab('magic', actor)).html);
  assert.match(b, /data-action="item-favorite" data-id="bl" aria-pressed="false"/);
  assert.doesNotMatch(b, /Favourites/);
  assert.equal((await ia.toggleFavorite(actor, 'bl')).ok, true);
  assert.deepEqual(actor.calls.at(-1), ['addFavorite', {type: 'item', id: '.Item.bl'}]);
  b = body((await renderTab('magic', actor)).html);
  assert.match(b, /data-key="magic:favourites"[\s\S]*\[TEST\] Bless[\s\S]*data-key="magic:0"/, 'Favourites group at the top');
  assert.match(b, /class="agch-star is-on" data-action="item-favorite" data-id="bl" aria-pressed="true"/);
  await ia.toggleFavorite(actor, 'bl');
  assert.deepEqual(actor.calls.at(-1), ['removeFavorite', '.Item.bl']);
  installGlobals({user: users.observer});
  assert.equal((await ia.toggleFavorite(actor, 'su')).ok, false, 'observers refused in the action layer');
  const plain = actorWith({favorites: false});
  installGlobals({user: users.owner});
  assert.doesNotMatch(body((await renderTab('features', plain)).html), /item-favorite/, 'no star when dnd5e has no favourites');
  assert.equal((await ia.toggleFavorite(plain, 'su')).ok, false);
});

test('search: per tab, hides non-matching cards and sections left empty', async () => {
  installGlobals();
  const card = name => ({hidden: false, querySelector: () => ({textContent: name})});
  const a = card('[TEST] Bless'), b = card('[TEST] Fire Bolt');
  const classes = new Set();
  const sec = {classList: {toggle: (c, on) => on ? classes.add(c) : classes.delete(c)}, querySelectorAll: () => [b]};
  const root = {querySelectorAll: sel => sel.includes('.agch-sec') ? [sec] : sel.includes('agch-contents') ? [] : [a, b]};
  applyFilter(root, 'bless');
  assert.deepEqual([a.hidden, b.hidden], [false, true]);
  assert.equal(classes.has('is-filtered-out'), true, 'a section with no match is hidden');
  applyFilter(root, '');
  assert.equal(classes.has('is-filtered-out'), false);
  const {sheet} = await renderTab('magic');
  sheet.filters.magic = 'bolt';
  assert.match(body(await sheet._renderHTML()), /data-tab="magic" placeholder="Search spells" aria-label="Search spells" value="bolt"/, 'search text kept per tab');
  sheet.tab = 'features';
  assert.match(body(await sheet._renderHTML()), /placeholder="Search features" aria-label="Search features" value=""/);
});
