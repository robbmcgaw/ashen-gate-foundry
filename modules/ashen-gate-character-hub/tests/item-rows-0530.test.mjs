/**
 * 0.53.0 Combat, Inventory and Features: one-line rows (description on demand) sharing Magic's machinery, and the Show item
 * descriptions setting. Mocked Foundry: this proves the markup and the logic, not the live Forge UI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass, ACTIONS, EDITS} from '../scripts/sheet.mjs';
import * as irows from '../scripts/item-rows.mjs';
import * as srows from '../scripts/spell-rows.mjs';
import {HELP_HTML} from '../scripts/help.mjs';

const CSS = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
const README = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const Hub = createHubSheetClass(FakeActorSheetV2);
const act = type => [{activation: {type}}];
const DESC = '<p>A [TEST] description that is long enough to be a real description of the item in question.</p>';
const ITEMS = () => [
  {id: 'sw', name: '[TEST] Longsword', type: 'weapon', system: {equipped: true, rarity: 'rare', activities: act('action'), description: {value: DESC}},
    labels: {damages: [{label: '1d8 + 3 Slashing'}], toHit: '+5', reach: '5 ft', properties: [{abbr: 'ver', label: 'Versatile'}]}},
  {id: 'bow', name: '[TEST] Longbow', type: 'weapon', system: {equipped: false, activities: act('action')}, labels: {damage: '1d8', range: '150 / 600 ft'}},
  {id: 'pot', name: '[TEST] Potion', type: 'consumable', system: {quantity: 3, weight: {value: 0.5, units: 'lb'}, price: {value: 50, denomination: 'gp'}, activities: act('bonus'), uses: {max: 1, spent: 0}, description: {value: DESC}}, labels: {activation: '1 Bonus Action'}},
  {id: 'cloak', name: '[TEST] Cloak', type: 'equipment', system: {equipped: false, attunement: 'required', rarity: 'uncommon'}},
  {id: 'pack', name: '[TEST] Backpack', type: 'container', system: {quantity: 1}},
  {id: 'rope', name: '[TEST] Rope', type: 'loot', system: {quantity: 1, container: 'pack', weight: {value: 10, units: 'lb'}}},
  {id: 'su', name: '[TEST] Action Surge', type: 'feat', system: {type: {value: 'class'}, activities: act('special'), uses: {max: 1, spent: 1}, description: {value: DESC}}, labels: {activation: 'Special', recovery: 'Short Rest', featType: 'Class Feature'}},
  {id: 'bl', name: '[TEST] Bless', type: 'spell', system: {level: 1, prepared: 1, canPrepare: true, activities: act('action'), description: {value: DESC}}, labels: {level: '1st Level', school: 'Enchantment', activation: '1 Action'}}
];
function actorWith() {
  const defs = ITEMS(), actor = makeActor({items: defs, system: {spells: {spell1: {value: 1, max: 2}}}});
  for (const d of defs) if (d.labels) actor.items.get(d.id).labels = d.labels;
  actor.system.favorites = [];
  actor.system.hasFavorite = id => actor.system.favorites.some(f => f.id === id);
  actor.system.addFavorite = async f => { actor.system.favorites.push(f); };
  actor.system.removeFavorite = async id => { actor.system.favorites = actor.system.favorites.filter(f => f.id !== id); };
  return actor;
}
const setup = (settings = {}, user = users.owner) => installGlobals({user, settings});
const render = async (tab, pre = s => s, actor = actorWith()) => { const s = new Hub({document: actor}); s.tab = tab; pre(s); return {sheet: s, html: await s._renderHTML()}; };
const body = html => html.slice(html.indexOf('class="agch-body"'));
const el = (attrs = {}, extra = {}) => ({dataset: attrs, ...extra});
const TABS = ['combat', 'inventory', 'features'];
/** Every data-action in a piece of markup, as a sorted unique list. */
const actions = html => [...new Set([...html.matchAll(/data-action="([\w-]+)"/g)].map(m => m[1]))].sort();

test('setting: Show item descriptions is per user, default off, client scope; independent of the spell one', () => {
  const reg = [];
  irows.registerItemViewSetting({register: (m, k, d) => reg.push([k, d])});
  assert.equal(reg[0][0], 'showItemDescriptions'); assert.equal(reg[0][1].scope, 'client'); assert.equal(reg[0][1].default, false); assert.equal(reg[0][1].type, Boolean);
  setup(); assert.equal(irows.showItemDescriptions(), false); assert.equal(srows.showDescriptions(), false);
  setup({showItemDescriptions: true}); assert.equal(irows.showItemDescriptions(), true); assert.equal(srows.showDescriptions(), false, 'Magic is separate');
  setup({showSpellDescriptions: true}); assert.equal(irows.showItemDescriptions(), false, 'the spell switch does not change item rows');
});

test('default: Combat, Inventory and Features rows are one line with a hidden description and a chevron', async () => {
  setup();
  for (const tab of TABS) {
    const b = body((await render(tab)).html);
    assert.match(b, /class="ag-list agch-cards agch-crowlist agch-crows agch-crows--\w+( agch-set-\w+)?"/, tab);
    assert.doesNotMatch(b, /agch-card__summary|data-action="item-more"/, `${tab}: no summary or More in the row`);
    assert.match(b, /class="agch-crow__chev" data-action="item-expand" data-id="\w+" data-key="more:[^"]+" data-ag-always aria-expanded="false" aria-controls="more:[^"]+" aria-label="Show description of \[TEST\] [^"]+" data-tooltip="Show description"/, `${tab} chevron`);
    assert.match(b, /class="agch-item__name agch-crow__name" data-action="item-expand"[^>]*tabindex="-1"/, `${tab}: the name toggles too, the chevron is the tab stop`);
    assert.match(b, /class="agch-card__detail agch-crow__detail" id="more:[^"]+" role="region" aria-label="Description of \[TEST\] [^"]+" hidden>/, tab);
    assert.match(b, /<button type="button" class="ag-btn ag-btn--sm agch-crow__open" data-action="item-sheet" data-id="\w+" data-ag-always><span>Open \[TEST\] /, `${tab}: the sheet is one click from the detail row`);
    assert.doesNotMatch(b, /agch-spell/, `${tab}: no Magic markup`);
  }
  assert.match(body((await render('combat')).html), /\[TEST\] description that is long enough/, 'the full text is in the detail row');
});

test('Show item descriptions on: the long rows (summary and More), headings still pinned', async () => {
  setup({showItemDescriptions: true});
  for (const tab of TABS) {
    const b = body((await render(tab)).html);
    assert.match(b, /class="ag-list agch-cards agch-crowlist"/, tab);
    assert.doesNotMatch(b, /agch-crow__chev|agch-crows"|data-action="item-expand"/, `${tab}: no compact markup`);
  }
  assert.match(body((await render('combat')).html), /agch-card__summary[\s\S]*\[TEST\] description/);
});

test('every control of the long row is still in the compact row', async () => {
  for (const tab of TABS) {
    setup({showItemDescriptions: true});
    const long = body((await render(tab, s => { s.listFilters = {combat: {}, magic: {}, features: {}}; })).html);
    setup();
    const compact = body((await render(tab)).html);
    const need = actions(long).filter(a => a !== 'item-more');
    for (const a of need) assert.ok(actions(compact).includes(a), `${tab}: ${a} kept`);
    assert.deepEqual(actions(compact).filter(a => !actions(long).includes(a)), ['item-expand'], `${tab}: the only new action is the expander`);
    for (const re of [/data-action="item-favorite"/]) if (tab !== 'inventory') assert.match(compact, re);
  }
});

test('Combat compact row: star, icon, equipped badge, columns and Use on the line (0.56.0: other chips are in the open row)', async () => {
  setup();
  const b = body((await render('combat')).html);
  assert.match(b, /<span class="agch-ic agch-ic-dice">Dice<\/span><span class="agch-ic agch-ic-tohit">To hit<\/span><span class="agch-ic agch-ic-range">Range<\/span><span class="agch-ic agch-ic-props">Properties<\/span>/);
  assert.match(b, /data-action="item-favorite" data-id="sw"/);
  assert.match(b, /data-action="item-use" data-id="sw" aria-label="Use \[TEST\] Longsword"/, 'icon');
  assert.match(b, /ag-btn--sm agch-use agch-act agch-act--use" data-action="item-use" data-id="sw"/, 'Use button, fixed width class');
  assert.match(b, /agch-crow(?: is-alt)? is-equipped has-rarity ag-rarity-edge" data-item-id="sw" data-rarity="rare"/, "rarity and equipped kept");
  assert.match(b, /agch-item__badges"><span class="ag-badge ag-badge--accent agch-sbadge" data-tooltip="Equipped"><i class="fa-solid fa-shield-halved" aria-hidden="true"><\/i><span class="agch-sbadge__t"> Equipped<\/span><\/span><\/span>/);
  assert.doesNotMatch(b, /Not equipped<\/span>/, 'no chip for it on the line');
  assert.match(b, /<dt>Equipped<\/dt><dd>No<\/dd>/, 'the longbow says so in its open row');
  assert.doesNotMatch(b, /fact--late/, 'no late columns: every fact is in the open row at every width');
  const sw = b.slice(b.indexOf('data-item-id="sw"'), b.indexOf('</li>', b.indexOf('data-item-id="sw"')));
  assert.match(sw, /<dl class="agch-crow__facts"><div><dt>Dice<\/dt><dd>1d8 \+ 3 Slashing<\/dd><\/div><div><dt>To hit<\/dt><dd>\+5<\/dd><\/div><div><dt>Range<\/dt><dd>5 ft<\/dd><\/div><div><dt>Properties<\/dt><dd>Versatile<\/dd><\/div><div><dt>Equipped<\/dt><dd>Yes<\/dd><\/div><div><dt>Rarity<\/dt><dd>/);
});

test('Inventory compact row: quantity, weight, value, uses, equip, attune, use, container fold, party stash', async () => {
  setup({collapsedSections: {'container:pack': true}});
  const b = body((await render('inventory')).html);
  assert.match(b, /data-label="Qty"><span class="agch-qty">[\s\S]*data-edit="item-qty" data-id="pot" value="3"/);
  for (const re of [/data-action="item-unequip" data-id="sw"/, /data-action="item-equip" data-id="bow"/, /data-action="item-attune" data-id="cloak" data-attuned="1"/, /data-action="item-use" data-id="pot"/, /data-action="item-qty" data-id="pot" data-step="-1"/, /data-action="item-qty" data-id="pot" data-step="1"/]) assert.match(b, re);
  assert.match(b, /data-key="container:pack" data-ag-always aria-expanded="false"/, 'container fold toggle');
  assert.match(b, /<li class="agch-contents" data-sec-body="container:pack" hidden><ul class="ag-list agch-cards agch-crowlist agch-crowlist--nested agch-crows agch-crows--inventory agch-set-all"[\s\S]*\[TEST\] Rope/);
  assert.match(b, /agch-ic agch-ic-weight" data-label="Weight"/); assert.match(b, /agch-ic agch-ic-value" data-label="Value"/);
  assert.doesNotMatch(b, /fact--late/);
});

test('Features compact row: type, use time, uses, recovery, Use; Type only when not grouped by it', async () => {
  setup();
  const b = body((await render('features')).html);
  assert.match(b, /<span class="agch-ic agch-ic-act">Use time<\/span><span class="agch-ic agch-ic-uses">Uses<\/span><span class="agch-ic agch-ic-recovery">Recovery<\/span>/, 'grouped by type: no Type column');
  assert.match(b, /agch-set-notype/);
  assert.match(b, /data-action="item-use" data-id="su"/); assert.match(b, /data-action="item-favorite" data-id="su"/);
  assert.doesNotMatch(b, /fact--late/);
  setup({listSort: {features: {group: 'none', sort: 'name'}}});
  const g = body((await render('features')).html);
  assert.match(g, /<span class="agch-ic agch-ic-type">Type<\/span><span class="agch-ic agch-ic-act">Use time<\/span><span class="agch-ic agch-ic-uses">Uses<\/span><span class="agch-ic agch-ic-recovery">Recovery<\/span>/, 'ungrouped: Type shows');
  assert.match(g, /agch-set-full/);
  assert.match(g, /data-label="Type"[^>]*>[^<]+</);
});

test('the open row lists every column and the badges that left the line, at any width', async () => {
  setup();
  const b = body((await render('inventory')).html);
  assert.match(b, /<dl class="agch-crow__facts"><div><dt>Qty<\/dt><dd>3<\/dd><\/div><div><dt>Weight<\/dt><dd>0.5 lb<\/dd><\/div><div><dt>Value<\/dt><dd>50 gp<\/dd><\/div><div><dt>Uses<\/dt><dd>1 \/ 1<\/dd><\/div><\/dl>/);
  setup({showItemDescriptions: true});
  assert.doesNotMatch(body((await render('inventory')).html), /fact--late|agch-crow__facts/);
});

test('expand and collapse: no redraw, focus stays, kept across a re-render, kept per tab and list', async () => {
  setup();
  const keys = {combat: 'more:combat-category-combat:sw', inventory: 'more:inv-consumable:pot', features: 'more:features-type-class:su'};
  for (const tab of TABS) {
    const {sheet, html} = await render(tab);
    assert.ok(html.includes(`id="${keys[tab]}"`), `${tab}: key ${keys[tab]}`);
    const attrs = {}, detail = {hidden: true};
    const mk = c => ({classList: {contains: x => x === c}, getAttribute: k => attrs[c + k] ?? 'Show description of x', setAttribute: (k, v) => { attrs[c + k] = v; }});
    const li = {classList: {toggle: (c, v) => { attrs.open = v; }}, querySelector: () => detail, querySelectorAll: () => [mk('agch-crow__chev'), mk('agch-crow__name')]};
    const target = el({key: keys[tab]}, {closest: sel => (sel === '.agch-crow' ? li : null)});
    const r = ACTIONS['item-expand'](sheet, target);
    assert.deepEqual([r.ok, r.result, detail.hidden, attrs.open, attrs['agch-crow__chevaria-expanded'], attrs['agch-crow__chevaria-label']], [true, true, false, true, 'true', 'Hide description of x'], tab);
    assert.equal(sheet.renders.length, 0, `${tab}: no re-render, so the focus stays on the control`);
    const again = body(await sheet._renderHTML());
    assert.match(again, new RegExp(`aria-expanded="true" aria-controls="${keys[tab]}" aria-label="Hide description of`), `${tab}: still open after a re-render`);
    assert.match(again, new RegExp(`id="${keys[tab]}" role="region" aria-label="Description of [^"]+">`), `${tab}: not hidden`);
    assert.match(again, /agch-crow(?: is-alt)? is-open/);
    // other tabs are not affected
    for (const other of TABS.filter(t => t !== tab)) {
      sheet.tab = other;
      assert.doesNotMatch(body(await sheet._renderHTML()), /agch-crow is-open|aria-expanded="true" aria-controls="more:/, `${tab} open does not open ${other}`);
    }
    ACTIONS['item-expand'](sheet, target);
    assert.equal(sheet.expanded.size, 0); assert.equal(detail.hidden, true);
  }
});

test('Magic is unchanged: its own markup, its own setting and action, unaffected by the item switch', async () => {
  setup();
  const open = s => { s.menu = 'filters:magic'; };
  const a = body((await render('magic', open)).html);
  setup({showItemDescriptions: true});
  const b = body((await render('magic', open)).html);
  assert.equal(a, b, 'the item switch does not touch Magic');
  assert.match(a, /class="ag-list agch-cards agch-spelllist agch-spells"/);
  assert.match(a, /agch-spell__chev" data-action="spell-expand"/);
  assert.doesNotMatch(a, /agch-crow/);
  assert.match(a, /data-edit="spell-descriptions"/); assert.doesNotMatch(a, /item-descriptions/);
});

test('the switch: Combat and Features in Filters, Inventory in View; applies now; saves and redraws; not counted in Filters (n)', async () => {
  setup();
  for (const [tab, label] of [['combat', 'Filters'], ['features', 'Filters'], ['inventory', 'View']]) {
    const {html} = await render(tab, s => { s.menu = `filters:${tab}`; });
    const b = body(html);
    assert.match(b, new RegExp(`data-action="filters-menu" data-tab="${tab}"[^>]*aria-expanded="true"><i class="fa-solid [\\w-]+" aria-hidden="true"></i><span>${label}</span>`), tab);
    assert.match(b, /agch-filtermenu[\s\S]*data-edit="item-descriptions" data-ag-always> <span>Show item descriptions<\/span> <span class="ag-badge">Applies now<\/span>/, tab);
    assert.doesNotMatch(b, /data-edit="item-descriptions" data-ag-always checked/);
  }
  assert.doesNotMatch(body((await render('inventory', s => { s.menu = 'filters:inventory'; })).html), /data-edit="list-sort"/, 'View has no group / sort');
  assert.match(body((await render('combat', s => { s.menu = 'filters:combat'; })).html), /data-edit="list-sort" data-tab="combat" data-field="group"/, 'Filters keeps group / sort');
  const {sheet} = await render('combat');
  const r = await EDITS['item-descriptions'](sheet, {checked: true});
  assert.equal(r.ok, true); assert.equal(game.settings.store.showItemDescriptions, true); assert.equal(sheet.renders.length, 1);
  assert.equal(game.settings.store.showSpellDescriptions, undefined, 'Magic setting untouched');
  assert.match(body((await render('combat', s => { s.menu = 'filters:combat'; })).html), /data-edit="item-descriptions" data-ag-always checked/);
  assert.doesNotMatch(body((await render('combat', s => { s.menu = 'filters:combat'; })).html), /<span>Filters \(/, 'a view choice is not a filter');
  const off = await EDITS['item-descriptions'](sheet, {checked: false});
  assert.equal(off.result, false); assert.equal(game.settings.store.showItemDescriptions, false);
});

test('Party stash view has no item rows and no View button', async () => {
  setup({}, users.gm);
  const {html} = await render('inventory', s => { s.invView = 'party'; });
  assert.doesNotMatch(body(html), /data-edit="item-descriptions"|agch-crow/);
});

test('observers see compact rows with the same controls disabled, as in the long rows', async () => {
  setup({}, users.observer);
  const b = body((await render('combat')).html);
  assert.match(b, /agch-crow__chev/); assert.match(b, /data-action="item-use" data-id="sw"[^>]*disabled/);
  assert.match(b, /<img class="agch-item__img" src="[^"]*" alt="">/, 'plain image, not a Use button');
});

test('sticky headings and reduced motion (CSS text); the 640px late-column rule is gone', () => {
  assert.match(CSS, /\.agch-app \.agch-crowlist:not\(\.agch-crowlist--nested\) > \.agch-card__headrow \{ position: sticky; top: var\(--agch-band-h, 0\); z-index: 4; \}/);
  const at = CSS.indexOf('/* 0.53.0: Combat, Inventory'), seg = CSS.slice(at, CSS.indexOf('/* Compact mode (0.29.0)', at));
  assert.doesNotMatch(seg, /fact--late|max-width: 640px/);
  assert.match(seg, /prefers-reduced-motion/);
});

test('help and README describe it; the version is 0.53.0', () => {
  assert.match(HELP_HTML, /Show item descriptions/); assert.match(README, /showItemDescriptions/); assert.match(README, /Item rows \(0\.53\.0; single line since 0\.56\.0\)/);
  assert.match(fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'), /^## 0\.53\.0/m);
});
