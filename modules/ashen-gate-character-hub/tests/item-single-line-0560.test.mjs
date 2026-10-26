/**
 * 0.56.0 Combat, Inventory and Features: every item row is exactly one line, with Magic's system: one ordered priority list per
 * tab, container-query steps that mirror it, fixed-width grid templates, a pinned actions track with a gutter, Equipped / Attuned
 * as the only badges on the line, everything else in the open row. Mocked Foundry: this proves the markup, the constants and the
 * CSS text, not the live Forge layout.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass} from '../scripts/sheet.mjs';
import {COMBAT_PRIORITY, COMBAT_STEPS, INVENTORY_PRIORITY, INVENTORY_STEPS, FEATURES_PRIORITY, FEATURES_STEPS, ITEM_PRIORITY, ITEM_STEPS, ITEM_LAYOUT, ITEM_METRICS, ITEM_MIN_LIST, ITEM_BADGE_STEP, COL_ID} from '../scripts/item-rows.mjs';
import {dropOrder, rowNeed, ceil5} from '../scripts/compact-rows.mjs';
import {SPELL_PRIORITY, SPELL_STEPS} from '../scripts/spell-rows.mjs';
import {HELP_HTML} from '../scripts/help.mjs';

const CSS = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
const README = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const CHANGELOG = fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const Hub = createHubSheetClass(FakeActorSheetV2);
const act = type => [{activation: {type}}];
const DESC = '<p>A [TEST] description.</p>';
const NOTE = {'ashen-gate-manager': {source: {sourceId: 'REC-TEST', definition: {id: 'REC-TEST', kind: 'activity', effect_note: 'The GM decides the boon.'}}}};
const ITEMS = () => [
  {id: 'sw', name: '[TEST] Longsword', type: 'weapon', system: {equipped: true, mastery: 'vex', rarity: 'rare', activities: act('action'), description: {value: DESC}},
    labels: {damages: [{label: '1d8 + 3 Slashing'}], toHit: '+5', reach: '5 ft', properties: [{abbr: 'ver', label: 'Versatile'}]}},
  {id: 'bow', name: '[TEST] Longbow with a very long name that must stay on one line however narrow the Hub gets', type: 'weapon', system: {equipped: false, activities: act('action')}, labels: {damage: '1d8', range: '150 / 600 ft'}},
  {id: 'pot', name: '[TEST] Potion', type: 'consumable', flags: NOTE, system: {quantity: 3, weight: {value: 0.5, units: 'lb'}, price: {value: 50, denomination: 'gp'}, activities: act('bonus'), uses: {max: 1, spent: 0}, description: {value: DESC}}, labels: {activation: '1 Bonus Action'}},
  {id: 'cloak', name: '[TEST] Cloak', type: 'equipment', system: {equipped: true, attunement: 'required', attuned: true, rarity: 'uncommon'}},
  {id: 'ring', name: '[TEST] Ring', type: 'equipment', system: {equipped: false, attunement: 'optional'}},
  {id: 'pack', name: '[TEST] Backpack', type: 'container', system: {quantity: 1}},
  {id: 'rope', name: '[TEST] Rope', type: 'loot', system: {quantity: 1, container: 'pack', weight: {value: 10, units: 'lb'}}},
  {id: 'su', name: '[TEST] Action Surge', type: 'feat', system: {type: {value: 'class'}, activities: act('special'), uses: {max: 1, spent: 1}, description: {value: DESC}}, labels: {activation: 'Special', recovery: 'Short Rest', featType: 'Class Feature'}},
  {id: 'bl', name: '[TEST] Bless', type: 'spell', system: {level: 1, prepared: 1, canPrepare: true, activities: act('action')}, labels: {level: '1st Level', school: 'Enchantment', activation: '1 Action'}}
];
function actorWith() {
  const defs = ITEMS(), actor = makeActor({items: defs, system: {spells: {spell1: {value: 1, max: 2}}}});
  for (const d of defs) { if (d.labels) actor.items.get(d.id).labels = d.labels; if (d.flags) actor.items.get(d.id).flags = d.flags; }
  actor.system.favorites = []; actor.system.hasFavorite = id => actor.system.favorites.some(f => f.id === id);
  actor.system.addFavorite = async f => { actor.system.favorites.push(f); }; actor.system.removeFavorite = async id => { actor.system.favorites = actor.system.favorites.filter(f => f.id !== id); };
  return actor;
}
const setup = (settings = {}, user = users.owner) => installGlobals({user, settings});
const render = async (tab, pre = s => s) => { const s = new Hub({document: actorWith()}); s.tab = tab; pre(s); const h = await s._renderHTML(); return h.slice(h.indexOf('class="agch-body"')); };
const rowOf = (b, id) => { const at = b.indexOf(`data-item-id="${id}"`); return b.slice(b.lastIndexOf('<li', at), b.indexOf('</li>', at)); };
const lineOf = row => row.slice(0, row.indexOf('<div class="agch-card__detail'));
const detailOf = row => row.slice(row.indexOf('<div class="agch-card__detail'));
const actionsOf = row => row.slice(row.indexOf('<span class="agch-item__controls agch-card__actions">'), row.indexOf('<div class="agch-card__detail'));
const TABS = ['combat', 'inventory', 'features'];
const cap = t => t[0].toUpperCase() + t.slice(1);
const css56 = CSS.slice(CSS.indexOf('/* 0.56.0:'), CSS.indexOf('@media (prefers-reduced-motion: reduce) { .agch-app .agch-spell__chev'));

test('each tab has one ordered priority list: always shown, then optional columns from the longest-lasting to the first to go', () => {
  assert.deepEqual(COMBAT_PRIORITY.always, ['star', 'icon', 'chevron', 'name', 'badges', 'use']);
  assert.deepEqual(COMBAT_PRIORITY.optional, ['tohit', 'dice', 'range', 'uses', 'recovery', 'properties']);
  assert.deepEqual(INVENTORY_PRIORITY.always, ['fold', 'star', 'icon', 'chevron', 'name', 'badges', 'actions']);
  assert.deepEqual(INVENTORY_PRIORITY.optional, ['qty', 'value', 'weight', 'uses']);
  assert.deepEqual(FEATURES_PRIORITY.always, ['star', 'icon', 'chevron', 'name', 'use']);
  assert.deepEqual(FEATURES_PRIORITY.optional, ['uses', 'recovery', 'activation', 'type']);
  assert.deepEqual(dropOrder(COMBAT_PRIORITY), ['properties', 'recovery', 'uses', 'range', 'dice', 'tohit']);
  assert.deepEqual(dropOrder(INVENTORY_PRIORITY), ['uses', 'weight', 'value', 'qty']);
  assert.deepEqual(dropOrder(FEATURES_PRIORITY), ['type', 'activation', 'recovery', 'uses']);
  assert.deepEqual(dropOrder(SPELL_PRIORITY), ['components', 'casting', 'range', 'dice'], 'Magic reads the same way');
  assert.ok(Object.isFrozen(COMBAT_PRIORITY) && Object.isFrozen(COMBAT_PRIORITY.optional) && Object.isFrozen(ITEM_STEPS.combat[0]));
});

test('steps: columns drop in the reverse of the priority list, widest first, each above the sideways-scroll minimum', () => {
  const dropped = steps => steps.map(s => s.hides.replace(/^qty-compact$/, 'qty')).filter(h => h !== 'action-labels');
  assert.deepEqual(dropped(COMBAT_STEPS), dropOrder(COMBAT_PRIORITY));
  assert.deepEqual(dropped(INVENTORY_STEPS), dropOrder(INVENTORY_PRIORITY));
  assert.deepEqual(dropped(FEATURES_STEPS), dropOrder(FEATURES_PRIORITY));
  assert.equal(INVENTORY_STEPS[0].hides, 'action-labels', 'Inventory first folds its action labels into an icon cluster');
  assert.equal(INVENTORY_STEPS.at(-1).hides, 'qty-compact', 'Quantity shrinks last, it is never removed from the line');
  for (const t of TABS) {
    const w = ITEM_STEPS[t].map(s => s.width);
    assert.deepEqual(w, [...w].sort((a, b) => b - a), `${t}: widest first`);
    assert.equal(new Set(w).size, w.length, `${t}: distinct`);
    assert.ok(w.every(x => x > ITEM_MIN_LIST && x % 5 === 0), `${t}: above ${ITEM_MIN_LIST}, whole 5px`);
  }
  assert.deepEqual(COMBAT_STEPS.map(s => s.width), [575, 565, 535, 475, 400, 390]);
  assert.deepEqual(INVENTORY_STEPS.map(s => s.width), [755, 605, 555, 495, 430]);
  assert.deepEqual(FEATURES_STEPS.map(s => s.width), [590, 490, 400, 390]);
  assert.equal(ITEM_MIN_LIST, 384); assert.equal(ITEM_BADGE_STEP, 480);
  assert.deepEqual(ITEM_PRIORITY, {combat: COMBAT_PRIORITY, inventory: INVENTORY_PRIORITY, features: FEATURES_PRIORITY});
});

test('the step widths are the track arithmetic: each is at least what the row needs while that column is still shown', () => {
  for (const t of TABS) {
    const L = ITEM_LAYOUT[t], hidden = [];
    let labels = t === 'inventory';
    for (const s of ITEM_STEPS[t]) {
      const id = COL_ID[s.hides] ?? s.hides;
      // the state just above this step: every earlier column already gone (and labelled actions, until the labels fold)
      const need = Math.max(...Object.values(L.sets).map(cols => rowNeed({metrics: ITEM_METRICS, lead: L.lead, track: labels ? L.trackLabels : L.track, cols, hidden, widths: {...L.widths}})));
      assert.ok(s.width >= ceil5(need), `${t}/${s.hides}: ${s.width} >= ${ceil5(need)}`);
      assert.ok(s.width - ceil5(need) < 20 || s.width <= 400, `${t}/${s.hides}: close to the need, or one of the last steps lifted to just above the minimum list width (${s.width} vs ${ceil5(need)})`);
      if (s.hides === 'action-labels') labels = false; else if (s.hides !== 'qty-compact') hidden.push(id);
    }
  }
  // the default list area (about 600px): Combat, Features and Inventory show everything up to these columns
  const at600 = steps => steps.filter(s => s.width >= 600).map(s => s.hides);
  assert.deepEqual(at600(COMBAT_STEPS), []); assert.deepEqual(at600(FEATURES_STEPS), []); assert.deepEqual(at600(INVENTORY_STEPS), ['action-labels', 'uses']);
});

test('the CSS container queries match the step constants, in order, per tab', () => {
  for (const t of TABS) {
    const found = [...css56.matchAll(new RegExp(`@container agch-body \\(max-width: (\\d+)px\\) \\{\\n  /\\* ${cap(t)}: ([^*]*?) \\*/\\n([\\s\\S]*?)\\n\\}`, 'g'))].map(m => ({width: +m[1], text: m[2], body: m[3]}));
    assert.deepEqual(found.map(f => f.width), ITEM_STEPS[t].map(s => s.width), `${t}: CSS widths = constant, in order`);
    ITEM_STEPS[t].forEach((s, i) => {
      const id = COL_ID[s.hides] ?? s.hides;
      if (s.hides === 'action-labels') { assert.match(found[i].body, /--agch-ic-track: calc\(4 \* var\(--ag-control-h-sm\) \+ 3 \* var\(--ag-space-1\) \+ var\(--ag-space-2\)\)/); assert.match(found[i].body, /agch-act\.ag-btn > span/); }
      else if (s.hides === 'qty-compact') { assert.match(found[i].body, /--agch-iq-qty: 3\.125rem/); assert.match(found[i].body, /\.agch-qty \.ag-btn \{ display: none; \}/); assert.match(found[i].body, /\.agch-crow__qtyrow \{ display: flex; \}/); }
      else assert.match(found[i].body, new RegExp(`\\.agch-crows--${t} \\.agch-ic-${id} \\{ display: none; \\}`), `${t}: ${s.hides} hidden at ${s.width}`);
    });
  }
  assert.match(css56, new RegExp(`@container agch-body \\(max-width: ${ITEM_BADGE_STEP}px\\) \\{\\n  \\.agch-app \\.agch-crows \\.agch-sbadge__t \\{ position: absolute;`));
  assert.doesNotMatch(css56, /max-width: 640px|fact--late/);
});

test('fixed grid templates: every set ends in the actions track; hidden columns leave the template; the min width is 24rem', () => {
  for (const t of TABS) for (const [set, cols] of Object.entries(ITEM_LAYOUT[t].sets)) {
    const re = new RegExp(`\\.agch-crows--${t}\\.agch-set-${set}\\.agch-cards \\{ grid-template-columns: var\\(--agch-ic-lead\\) var\\(--agch-icon-size\\) minmax\\(5rem, 1fr\\)((?: [\\w.()-]+)*) var\\(--agch-ic-track\\); \\}`, 'g');
    const all = [...css56.matchAll(re)].map(m => m[1].trim().split(' ').filter(Boolean).length);
    assert.equal(all[0], cols.length, `${t}/${set}: base template has every column`);
    assert.ok(all.every((n, i) => i === 0 || n < all[i - 1]), `${t}/${set}: each step removes tracks`);
    assert.equal(all.at(-1), cols.filter(c => !ITEM_STEPS[t].some(s => (COL_ID[s.hides] ?? s.hides) === c && s.hides !== 'qty-compact')).length, `${t}/${set}: last template`);
  }
  assert.equal(ITEM_MIN_LIST * 1, 24 * 16); assert.match(css56, /\.agch-app \.agch-crows \{ min-width: 24rem; \}/);
  assert.match(css56, /grid-template-columns: var\(--agch-ic-lead\) var\(--agch-icon-size\) minmax\(5rem, 1fr\) 5\.5rem 3rem 4\.5rem 6rem var\(--agch-ic-track\)/, 'Combat weapons: Dice, To hit, Range, Properties');
  assert.match(css56, /--agch-ic-track: calc\(4\.25rem \+ var\(--ag-space-2\)\);/);
  assert.match(css56, /--agch-ic-track: calc\(4rem \+ 4\.75rem \+ 5rem \+ var\(--ag-control-h-sm\) \+ 3 \* var\(--ag-space-1\) \+ var\(--ag-space-2\)\);/);
  assert.match(css56, /\.agch-crows\.agch-cards > li:not\(\.agch-contents\) \{[^}]*display: grid; grid-template-columns: subgrid;[^}]*padding-inline: var\(--ag-space-2\);/, 'rows are subgrids with inner padding at the right edge');
  assert.doesNotMatch(css56, /flex-wrap: wrap|overflow-x/);
});

test('the actions track is fixed, has a gutter, is pinned, and its background follows the row state', () => {
  assert.match(css56, /\.agch-app \.agch-crows \.agch-card__actions \{[^}]*flex-wrap: nowrap;[^}]*box-sizing: border-box; width: var\(--agch-ic-track\); padding-inline-start: var\(--ag-space-2\); position: sticky; inset-inline-end: 0; z-index: 1; background: var\(--agch-row-bg\); \}/);
  assert.match(css56, /li:not\(\.agch-contents\) \{ --agch-row-bg: var\(--ag-surface\);[^}]*background: var\(--agch-row-bg\); \}/);
  assert.match(css56, /li\.is-alt \{ --agch-row-bg: color-mix\(in srgb, var\(--ag-text\) 5%, var\(--ag-surface\)\); \}/);
  assert.match(css56, /li:not\(\.agch-contents, \.agch-card__headrow\):hover \{ --agch-row-bg: var\(--ag-surface-hover\); \}/);
  assert.match(css56, /li\.agch-card__headrow \{ display: grid; --agch-row-bg: var\(--agch-bg-sunken\); \}/);
  assert.match(css56, /headrow > span:last-child \{[^}]*position: sticky; inset-inline-end: 0; background: var\(--agch-row-bg\); \}/);
  assert.match(css56, /\.agch-crows \.agch-use \{[^}]*flex: none; width: 4\.25rem;/);
});

test('name never wraps: ellipsis and a tooltip; chips are gone from the line', async () => {
  setup();
  for (const tab of TABS) {
    const b = await render(tab);
    assert.doesNotMatch(b, /agch-card__summary|data-action="item-more"/);
    const rows = [...b.matchAll(/<li class="agch-card agch-crow[^>]*data-item-id="(\w+)"/g)].map(m => m[1]);
    assert.ok(rows.length >= 1, tab);
    for (const id of rows) {
      const line = lineOf(rowOf(b, id));
      assert.match(line, /class="agch-item__name agch-crow__name"[^>]*data-tooltip="[^"]+"/, `${tab}/${id}: name has a tooltip`);
      assert.doesNotMatch(line, /Not equipped|agch-effect-badge|agch-mastery|ag-badge">|>Effect</, `${tab}/${id}: no mastery, Not equipped or Effect chip on the line`);
    }
  }
  assert.match(css56, /\.agch-app \.agch-crow__name \{[^}]*overflow: hidden; text-overflow: ellipsis; white-space: nowrap;/);
  assert.match(css56, /\.agch-app \.agch-crows \.agch-card__main \{ display: flex; flex-wrap: nowrap;/);
  assert.match(css56, /\.agch-app \.agch-crows \.agch-card__fact \{[^}]*text-overflow: ellipsis; white-space: nowrap;/);
  const bow = await render('combat');
  assert.match(rowOf(bow, 'bow'), /\[TEST\] Longbow with a very long name that must stay on one line however narrow the Hub gets<\/button>/);
});

test('badges on the line: Equipped and Attuned only, icon and word, tooltip; mastery, Not equipped, Effect and rarity are in the open row', async () => {
  setup();
  const c = await render('combat'), i = await render('inventory');
  assert.match(lineOf(rowOf(c, 'sw')), /agch-item__badges"><span class="ag-badge ag-badge--accent agch-sbadge" data-tooltip="Equipped"><i class="fa-solid fa-shield-halved" aria-hidden="true"><\/i><span class="agch-sbadge__t"> Equipped<\/span><\/span><\/span>/);
  assert.doesNotMatch(lineOf(rowOf(c, 'bow')), /agch-item__badges/, 'an unequipped weapon has no badge on the line');
  assert.match(lineOf(rowOf(i, 'cloak')), /Equipped<\/span><\/span><span class="ag-badge ag-badge--accent agch-sbadge" data-tooltip="Attuned"><i class="fa-solid fa-sun" aria-hidden="true"><\/i><span class="agch-sbadge__t"> Attuned/);
  const d = detailOf(rowOf(c, 'sw'));
  assert.match(d, /<dt>Mastery<\/dt><dd><span class="ag-badge agch-mastery[^"]*"[^>]*aria-label="[^"]*weapon mastery[^"]*"/);
  assert.match(d, /<dt>Equipped<\/dt><dd>Yes<\/dd>/); assert.match(d, /<dt>Rarity<\/dt><dd>/);
  assert.match(detailOf(rowOf(c, 'bow')), /<dt>Equipped<\/dt><dd>No<\/dd>/);
  const p = detailOf(rowOf(i, 'pot'));
  assert.match(p, /Effect \(the GM decides\): The GM decides the boon\./, 'the effect note is in the open row text');
  assert.doesNotMatch(lineOf(rowOf(i, 'pot')), /Effect/);
  assert.doesNotMatch(lineOf(rowOf(c, 'sw')), /Versatile<\/span><span class="agch-item__badges"/);
  // CSS: the word hides at the badge step, the icon and the tooltip stay
  assert.match(css56, /\.agch-sbadge \{ white-space: nowrap; \}/);
});

test('long rows (Show item descriptions) keep their chips, Not equipped and Effect', async () => {
  setup({showItemDescriptions: true});
  const c = await render('combat'), i = await render('inventory');
  assert.match(c, /Not equipped<\/span>/); assert.match(c, /agch-mastery/); assert.match(i, /agch-effect-badge/);
  assert.doesNotMatch(c + i, /agch-crows|agch-sbadge|agch-ic\b|agch-act\b/);
  assert.match(i, /data-action="item-equip" data-id="ring" data-tooltip|data-action="item-equip" data-id="ring"/);
});

test('Dice heading: no Damage / Healing anywhere in the item tabs, long or compact', async () => {
  for (const settings of [{}, {showItemDescriptions: true}]) {
    setup(settings);
    for (const tab of ['combat', 'inventory', 'features', 'magic']) assert.doesNotMatch(await render(tab), /Damage \/ Healing|>Damage</, `${tab}`);
  }
  setup(); assert.match(await render('combat'), /agch-ic-dice">Dice<\/span>/);
});

test('Inventory actions: four fixed slots in every row (Use, Equip, Attune, Move to stash), empty slots are hidden placeholders', async () => {
  setup();
  const b = await render('inventory');
  const pot = rowOf(b, 'pot');
  const kinds = row => [...actionsOf(row).matchAll(/agch-act agch-act--(use|equip|attune|stash)/g)].map(m => m[1]);
  for (const id of ['pot', 'cloak', 'ring', 'sw']) if (b.includes(`data-item-id="${id}"`)) assert.deepEqual(kinds(rowOf(b, id)), ['use', 'equip', 'attune', 'stash'], `${id}: the same four slots in the same order`);
  assert.match(actionsOf(pot), /agch-use agch-act agch-act--use" data-action="item-use" data-id="pot"[^>]*aria-label="Use \[TEST\] Potion"/);
  assert.match(actionsOf(pot), /<span class="agch-act agch-act--equip" aria-hidden="true"><\/span><span class="agch-act agch-act--attune" aria-hidden="true"><\/span>/, 'a potion has no Equip or Attune: placeholders keep the stash button in its column');
  const cloak = actionsOf(rowOf(b, 'cloak'));
  assert.match(cloak, /<span class="agch-act agch-act--use" aria-hidden="true"><\/span>/);
  assert.match(cloak, /ag-btn--primary agch-act agch-act--equip" data-action="item-unequip" data-id="cloak" data-tooltip="Unequip \[TEST\] Cloak" aria-label="Unequip \[TEST\] Cloak"><i class="fa-solid fa-hand" aria-hidden="true"><\/i><span>Unequip<\/span>/);
  assert.match(cloak, /agch-act agch-act--attune" data-action="item-attune" data-id="cloak" data-attuned="0" data-tooltip="Unattune \[TEST\] Cloak \(requires attunement\)" aria-label="Unattune \[TEST\] Cloak"><i class="fa-solid fa-moon" aria-hidden="true"><\/i><span>Unattune<\/span>/);
  const ring = actionsOf(rowOf(b, 'ring'));
  assert.match(ring, /fa-shield-halved" aria-hidden="true"><\/i><span>Equip<\/span>/); assert.match(ring, /data-tooltip="Attune \[TEST\] Ring \(attunement optional\)"/);
  // every button is a labelled control even when the label is visually hidden: it has an aria-label and a tooltip
  for (const part of [cloak, ring, actionsOf(pot)]) for (const m of part.matchAll(/<button [^>]*>/g)) { assert.match(m[0], /aria-label="[^"]+"/); assert.match(m[0], /data-tooltip="[^"]+"/); }
  // icon mode: the label span is visually hidden at the first step; the buttons are at least control-h-sm wide
  const icons = css56.slice(css56.indexOf(`max-width: ${INVENTORY_STEPS[0].width}px`));
  assert.match(icons, /\.agch-act \{ width: var\(--ag-control-h-sm\); \}/);
  assert.match(icons, /agch-use > span \{ position: absolute; width: 1px; height: 1px;/);
  assert.match(css56, /\.agch-crows span\.agch-act \{ display: block; min-height: var\(--ag-control-h-sm\); visibility: hidden; \}/);
});

test('Inventory quantity: minus, field and plus on the line; minus and plus are also in the open row, shown only at the narrowest step', async () => {
  setup();
  const b = await render('inventory');
  const line = lineOf(rowOf(b, 'pot'));
  assert.match(line, /data-label="Qty"><span class="agch-qty"><button[^>]*data-action="item-qty" data-id="pot" data-step="-1"[\s\S]*data-edit="item-qty" data-id="pot" value="3"[\s\S]*data-action="item-qty" data-id="pot" data-step="1"/);
  const d = detailOf(rowOf(b, 'pot'));
  assert.match(d, /<div class="agch-crow__qtyrow"><span>Quantity<\/span><button[^>]*data-action="item-qty" data-id="pot" data-step="-1"[^>]*aria-label="One fewer \[TEST\] Potion"[\s\S]*data-step="1"[^>]*aria-label="One more \[TEST\] Potion"/);
  assert.match(css56, /\.agch-crow__qtyrow \{ display: none; align-items: center;/);
  assert.doesNotMatch(b, /fact--late/);
});

test('container fold toggle, star and nested contents list keep working in the new grid', async () => {
  setup({collapsedSections: {'container:pack': false}});
  const b = await render('inventory');
  const pack = rowOf(b, 'pack');
  assert.match(pack, /agch-card__lead"><button[^>]*data-action="section-toggle" data-key="container:pack"[^>]*aria-expanded="true"/, 'fold toggle is the first control of the lead');
  assert.match(b, /<li class="agch-contents" data-sec-body="container:pack"><ul class="ag-list agch-cards agch-crowlist agch-crowlist--nested agch-crows agch-crows--inventory agch-set-all"[\s\S]*\[TEST\] Rope/);
  assert.match(css56, /--agch-ic-lead: calc\(2 \* var\(--ag-control-h-sm\) \+ var\(--ag-space-1\)\);/, 'room for the fold toggle and the star');
  assert.match(CSS, /\.agch-app \.agch-cards > li\.agch-contents \{ display: block;/, 'the contents row is not turned into a grid row');
  assert.match(css56, /li:not\(\.agch-contents\)/);
  assert.match(CSS, /\.agch-app \.agch-crowlist:not\(\.agch-crowlist--nested\) > \.agch-card__headrow \{ position: sticky;/, 'sticky headings kept');
});

test('every data-action of the long rows is still in the compact row, per tab', async () => {
  const acts = html => [...new Set([...html.matchAll(/data-action="([\w-]+)"/g)].map(m => m[1]))].sort();
  for (const tab of TABS) {
    setup({showItemDescriptions: true}); const long = await render(tab);
    setup(); const compact = await render(tab);
    for (const a of acts(long).filter(a => a !== 'item-more')) assert.ok(acts(compact).includes(a), `${tab}: ${a}`);
  }
});

test('observers: the same one-line rows, with the controls disabled', async () => {
  setup({}, users.observer);
  const b = await render('inventory');
  assert.match(actionsOf(rowOf(b, 'cloak')), /data-action="item-unequip" data-id="cloak"[^>]*disabled/);
  assert.match(rowOf(b, 'pot'), /data-action="item-qty" data-id="pot" data-step="1"[^>]*disabled/);
  assert.match(b, /agch-crows--inventory/);
});

test('Features: Type, Use time, Recovery, Uses; the set follows the grouping', async () => {
  setup();
  assert.match(await render('features'), /agch-set-notype/);
  setup({listSort: {features: {group: 'activation', sort: 'name'}}}); assert.match(await render('features'), /agch-set-noact/);
  setup({listSort: {features: {group: 'none', sort: 'name'}}}); assert.match(await render('features'), /agch-set-full/);
});

test('Combat: weapons, actions and mixed lists each get their own set; favourites use the mixed one', async () => {
  setup();
  const b = await render('combat');
  assert.match(b, /agch-crows--combat agch-set-weapons/); assert.match(b, /agch-crows--combat agch-set-actions/);
  setup({listSort: {combat: {group: 'none', sort: 'name'}}}); assert.match(await render('combat'), /agch-crows--combat agch-set-mixed/);
});

test('Magic is unchanged: its priority, its steps and none of the item classes', async () => {
  assert.deepEqual(SPELL_PRIORITY.optional, ['dice', 'range', 'casting', 'components']);
  assert.deepEqual(SPELL_STEPS.map(s => s.width), [680, 590, 505, 455, 415]);
  setup();
  const m = await render('magic');
  assert.match(m, /class="ag-list agch-cards agch-spelllist agch-spells"/);
  assert.doesNotMatch(m, /agch-crow|agch-ic|agch-sbadge|agch-act\b/);
  assert.match(CSS, /@container agch-body \(max-width: 680px\) \{\n  \.agch-app \.agch-spells \.agch-sp-comps/);
});

test('README, Help and CHANGELOG describe the single line, the priorities and the steps', () => {
  assert.match(CHANGELOG, /^## 0\.56\.0/m);
  assert.match(README, /single line since 0\.56\.0/);
  assert.match(README, /Properties at 575px[\s\S]*Recovery at 565px[\s\S]*Uses at 535px[\s\S]*Range at 475px[\s\S]*Dice at 400px[\s\S]*To hit at 390px/);
  assert.match(README, /icons at 755px[\s\S]*Uses at 605px[\s\S]*Weight at 555px[\s\S]*Value at 495px[\s\S]*Quantity at 430px/);
  assert.match(README, /Type at 590px[\s\S]*Use time at 490px[\s\S]*Recovery at 400px[\s\S]*Uses at 390px/);
  assert.match(HELP_HTML, /Combat, Inventory and Features[\s\S]*exactly one line/);
});
