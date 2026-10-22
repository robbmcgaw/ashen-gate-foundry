/** 0.14.0: identity card, Magic/Features grouping, sorting and filters from dnd5e data, star column (mocked Foundry; logic only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {castable, filterRows, prepState, GROUP_BY, orderGroups, groupRows, sortRows} from '../scripts/organize.mjs';
import {spellsData, featuresData} from '../scripts/items.mjs';
import {createHubSheetClass, ACTIONS, setListFilter} from '../scripts/sheet.mjs';

const act = type => [{activation: {type}}];
const SPELLS = [
  {id: 'fb', name: '[TEST] Fire Bolt', type: 'spell', system: {level: 0, activities: act('action')}, labels: {school: 'Evocation'}},
  {id: 'bl', name: '[TEST] Bless', type: 'spell', system: {level: 1, prepared: 1, canPrepare: true, activities: act('action')}, labels: {school: 'Enchantment'}},
  {id: 'al', name: '[TEST] Alarm', type: 'spell', system: {level: 1, prepared: 0, canPrepare: true, properties: new Set(['ritual']), activities: act('minute')}, labels: {school: 'Abjuration'}},
  {id: 'sh', name: '[TEST] Shield', type: 'spell', system: {level: 1, prepared: 2, canPrepare: true, activities: act('reaction')}, labels: {school: 'Abjuration'}},
  {id: 'mi', name: '[TEST] Misty Step', type: 'spell', system: {level: 2, prepared: 1, canPrepare: true, activities: act('bonus')}, labels: {school: 'Conjuration'}},
  {id: 'fl', name: '[TEST] Fly', type: 'spell', system: {level: 3, prepared: 1, canPrepare: true, activities: act('action')}, labels: {school: 'Transmutation'}},
  {id: 'in', name: '[TEST] Innate Darkness', type: 'spell', system: {level: 2, canPrepare: false, usesSlots: false, uses: {max: 1, spent: 1}, activities: act('action')}, labels: {school: 'Evocation'}}
];
const FEATS = [
  {id: 'fighter', name: '[TEST] Fighter', type: 'class', system: {levels: 3, identifier: 'fighter'}},
  {id: 'elf', name: '[TEST] Elf', type: 'race'},
  {id: 'sage', name: '[TEST] Sage', type: 'background'},
  {id: 'su', name: '[TEST] Action Surge', type: 'feat', flags: {dnd5e: {advancementOrigin: 'fighter.adv1'}}, system: {type: {value: 'class'}, activities: act('special'), uses: {max: 1, spent: 1}}},
  {id: 'sw', name: '[TEST] Second Wind', type: 'feat', flags: {dnd5e: {advancementOrigin: 'fighter.adv2'}}, system: {type: {value: 'class'}, activities: act('bonus'), uses: {max: 2, spent: 0}}},
  {id: 'tr', name: '[TEST] Trance', type: 'feat', flags: {dnd5e: {advancementOrigin: 'elf.adv1'}}, system: {type: {value: 'race'}}},
  {id: 'gw', name: '[TEST] Great Weapon Fighting', type: 'feat', system: {type: {value: 'class'}}}
];
function actorWith(slots = {spell1: {value: 0, max: 4}, spell2: {value: 1, max: 2}}) {
  const defs = [...SPELLS, ...FEATS], actor = makeActor({items: defs, system: {spells: slots}});
  for (const d of defs) if (d.labels) actor.items.get(d.id).labels = d.labels;
  return actor;
}
const tab = async (name, setup = s => s, actor = actorWith()) => { const s = new (createHubSheetClass(FakeActorSheetV2))({document: actor}); s.tab = name; setup(s); return {sheet: s, html: await s._renderHTML()}; };
const body = html => html.slice(html.indexOf('class="agch-body"'));

test('castable from dnd5e data: cantrips always; prepared and a slot of its level or higher; uses for slotless spells', () => {
  installGlobals();
  const d = spellsData(actorWith()), row = id => d.levels.flatMap(l => l.spells).find(s => s.id === id);
  assert.deepEqual(d.slotsLeft, {1: 0, 2: 1});
  assert.equal(castable(row('fb'), d.slotsLeft), true, 'cantrip');
  assert.equal(castable(row('bl'), d.slotsLeft), true, 'no 1st-level slot left, but a 2nd-level one');
  assert.equal(castable(row('al'), d.slotsLeft), false, 'not prepared');
  assert.equal(castable(row('fl'), d.slotsLeft), false, 'no slot of level 3 or higher');
  assert.equal(castable(row('fl'), d.slotsLeft, {level: 3, value: 1}), true, 'a pact slot of its level counts');
  assert.equal(castable(row('in'), d.slotsLeft), false, 'slotless spell with no uses left');
  assert.deepEqual(['fb', 'bl', 'al', 'sh', 'in'].map(id => prepState(row(id))), ['cantrip', 'prepared', 'unprepared', 'always', 'free']);
});

test('Magic filters: one level at a time, prepared, ritual and castable only; Clear', async () => {
  installGlobals({user: users.owner, settings: {}});
  const {sheet, html} = await tab('magic');
  let b = body(html);
  assert.match(b, /data-action="list-filter" data-tab="magic" data-key="level" data-value="1" data-ag-always aria-pressed="false"[^>]*>1st Level|data-key="level" data-value="1"/);
  assert.match(b, /data-value="2"[^>]*>[^<]*<b>1 \/ 2<\/b>/, 'slot buttons show dnd5e slots left');
  await ACTIONS['list-filter'](sheet, {dataset: {tab: 'magic', key: 'level', value: '1'}});
  b = body(await sheet._renderHTML());
  assert.match(b, /\[TEST\] Bless/); assert.doesNotMatch(b, /\[TEST\] Fire Bolt|\[TEST\] Misty Step/);
  assert.match(b, /data-value="1"[^>]*aria-pressed="true"/);
  setListFilter(sheet, 'magic', 'level', '1');
  assert.equal(sheet.listFilters.magic.level, null, 'the same level again shows all');
  setListFilter(sheet, 'magic', 'castable', '1');
  b = body(await sheet._renderHTML());
  for (const id of ['Fire Bolt', 'Bless', 'Shield', 'Misty Step']) assert.match(b, new RegExp(`\\[TEST\\] ${id}`));
  for (const id of ['Alarm', 'Fly', 'Innate Darkness']) assert.doesNotMatch(b, new RegExp(`\\[TEST\\] ${id}`));
  setListFilter(sheet, 'magic', 'clear');
  setListFilter(sheet, 'magic', 'ritual', '1');
  b = body(await sheet._renderHTML());
  assert.match(b, /\[TEST\] Alarm/); assert.doesNotMatch(b, /\[TEST\] Bless/);
  assert.match(b, /Clear filters/);
  setListFilter(sheet, 'magic', 'clear'); setListFilter(sheet, 'magic', 'prepared', '1');
  b = body(await sheet._renderHTML());
  assert.doesNotMatch(b, /\[TEST\] Alarm/); assert.match(b, /\[TEST\] Innate Darkness/, 'spells that need no preparing stay');
  assert.equal(setListFilter(sheet, 'magic', 'nonsense', '1').nonsense, undefined, 'unknown filters ignored');
});

test('Magic groups by Prepared, Ritual, School and Action type; sorts by ritual and action type', async () => {
  installGlobals({user: users.owner, settings: {listSort: {magic: {group: 'prepared', sort: 'name'}}}});
  let b = body((await tab('magic')).html);
  assert.match(b, /data-key="magic:prepared:cantrip"[\s\S]*data-key="magic:prepared:always"[\s\S]*data-key="magic:prepared:prepared"[\s\S]*data-key="magic:prepared:free"[\s\S]*data-key="magic:prepared:unprepared"/);
  installGlobals({user: users.owner, settings: {listSort: {magic: {group: 'action', sort: 'name'}}}});
  b = body((await tab('magic')).html);
  assert.match(b, /data-key="magic:action:action"[\s\S]*data-key="magic:action:bonus"[\s\S]*data-key="magic:action:reaction"[\s\S]*data-key="magic:action:minute"/, 'Action, Bonus Action, Reaction first, in dnd5e order');
  installGlobals({user: users.owner, settings: {listSort: {magic: {group: 'ritual', sort: 'name'}}}});
  b = body((await tab('magic')).html);
  assert.match(b, /data-key="magic:ritual:ritual"[\s\S]*\[TEST\] Alarm[\s\S]*data-key="magic:ritual:other"/);
  const rows = spellsData(actorWith()).levels.flatMap(l => l.spells);
  assert.deepEqual(sortRows(rows, 'ritual').slice(0, 1).map(r => r.id), ['al']);
  assert.deepEqual(sortRows(rows, 'action').map(r => r.actType).slice(0, 4), ['action', 'action', 'action', 'action']);
  assert.equal(sortRows(rows, 'action').at(-1).actType, 'minute');
});

test('Features: grouped by source (the granting item), action type, uses; filters by action type and uses left', async () => {
  installGlobals({user: users.owner, settings: {listSort: {features: {group: 'source', sort: 'name'}}}});
  const d = featuresData(actorWith()), all = d.groups.flatMap(g => g.items);
  assert.deepEqual(all.map(r => [r.id, r.sourceName]).sort(), [['gw', ''], ['su', '[TEST] Fighter'], ['sw', '[TEST] Fighter'], ['tr', '[TEST] Elf']]);
  const g = orderGroups(groupRows(all, GROUP_BY.source), 'source');
  assert.deepEqual(g.map(x => x.label), ['[TEST] Elf', '[TEST] Fighter', 'Other']);
  let {sheet, html} = await tab('features', s => { s.menu = 'filters:features'; });   // the chips sit in the Filters popover (0.33.0)
  let b = body(html);
  assert.match(b, /data-key="features:source-elf"[\s\S]*data-key="features:source-fighter"[\s\S]*data-key="features:source-none"/);
  assert.match(b, /data-key="action" data-value="bonus"[\s\S]*data-key="action" data-value="special"[\s\S]*data-key="action" data-value="none"/, 'action-type buttons from dnd5e activation types');
  setListFilter(sheet, 'features', 'action', 'bonus');
  b = body(await sheet._renderHTML());
  assert.match(b, /<span>Filters \(1\)<\/span>/, 'Filters (n) counts what is on');
  assert.match(b, /data-key="clear" data-ag-always>Clear filters/);
  assert.match(b, /\[TEST\] Second Wind/); assert.doesNotMatch(b, /\[TEST\] Action Surge|\[TEST\] Trance/);
  setListFilter(sheet, 'features', 'clear'); setListFilter(sheet, 'features', 'left', '1');
  b = body(await sheet._renderHTML());
  assert.doesNotMatch(b, /\[TEST\] Action Surge/, 'no uses left'); assert.match(b, /\[TEST\] Second Wind/); assert.match(b, /\[TEST\] Trance/, 'features without uses stay');
  assert.deepEqual(filterRows(all, {uses: true}).map(r => r.id).sort(), ['su', 'sw']);
});

test('Species, class and background are the identity line in the header (0.37.0; chips in 0.34.0); no longer in Features', async () => {
  installGlobals({user: users.owner});
  const {html} = await tab('features');
  assert.match(html, /<header class="ag-header agch-head">[\s\S]*<p class="agch-head__ident"[\s\S]*data-id="elf"[^>]*\(species\)[\s\S]*data-id="fighter"[^>]*aria-label="[^"]*level 3 \(class\): open"[\s\S]*data-id="sage"[^>]*\(background\)[\s\S]*<\/header>[\s\S]*<aside class="agch-char"[\s\S]*data-action="inspiration"[\s\S]*agch-doll/);
  assert.doesNotMatch(html, /agch-idcard|<p class="agch-sub">/, 'no cards and no subtitle line');
  assert.doesNotMatch(body(html), /Class, Species &amp; Background|data-key="features:identity"/);
});

test('Favourites first in Features; the star has its own column in every list tab', async () => {
  installGlobals({user: users.owner, settings: {}});
  const actor = actorWith();
  actor.system.favorites = [{id: '.Item.tr'}]; actor.system.addFavorite = async () => {}; actor.system.removeFavorite = async () => {}; actor.system.hasFavorite = id => actor.system.favorites.some(f => f.id === id);
  const b = body((await tab('features', s => s, actor)).html);
  assert.match(b, /agch-sticky[\s\S]*?<\/div><\/div>\s*<section class="agch-sec" data-sec="features:favourites"/, 'Favourites is the first group');
  for (const t of ['combat', 'inventory', 'magic', 'features']) {
    const h = body((await tab(t, s => s, actor)).html);
    if (/agch-card"|agch-card /.test(h)) assert.match(h, /<span class="agch-card__lead">(?:<button[^>]*agch-sec__toggle--icon[\s\S]*?<\/button>)?<button type="button" class="agch-star/, `${t}: star sits in the lead column, before the image`);
  }
});

test('Inventory diamond banner: display only, any item with "diamond" in its name, containers too, observers see it', async () => {
  const {DIAMOND_PRESENT, DIAMOND_ABSENT} = await import('../scripts/constants.mjs');
  assert.equal(DIAMOND_ABSENT, 'You do not possess a resurrection diamond');
  assert.equal(DIAMOND_PRESENT, 'Your soul may be returned');
  const inv = async (items, user = users.owner) => { installGlobals({user}); const s = new (createHubSheetClass(FakeActorSheetV2))({document: makeActor({items})}); s.tab = 'inventory'; return body(await s._renderHTML()); };
  let b = await inv([{id: 'rope', name: '[TEST] Rope', type: 'loot'}]);
  assert.match(b, /<p class="agch-diamond is-absent" role="note">You do not possess a resurrection diamond<\/p>/);
  b = await inv([{id: 'pack', name: '[TEST] Backpack', type: 'container'}, {id: 'gem', name: '[TEST] Diamond (300 gp)', type: 'loot', system: {container: 'pack'}}]);
  assert.match(b, /<p class="agch-diamond is-present" role="note">Your soul may be returned<\/p>/, 'a diamond inside a backpack counts');
  b = await inv([{id: 'dust', name: '[TEST] Diamond Dust', type: 'loot'}]);
  assert.match(b, /is-present/, '"Diamond Dust" counts');
  b = await inv([{id: 'x', name: '[TEST] diamondback hide', type: 'loot'}]);
  assert.match(b, /is-present/, 'whole word not required, any case');
  b = await inv([{id: 'dust', name: '[TEST] Diamond Dust', type: 'loot'}], users.observer);
  assert.match(b, /Your soul may be returned/, 'observers see it too');
  assert.doesNotMatch(b, /agch-diamond[^>]*data-action/, 'not clickable');
});
