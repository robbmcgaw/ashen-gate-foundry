/**
 * Combat, Inventory and Features rows (0.53.0). Like Magic's (spell-rows.mjs), an item is one line by default: the same
 * icon, name, chips, fact columns and row controls as the long row, with the description opening on demand beneath it
 * (chevron or name; an "Open <item>" button in the detail row opens the item sheet). The per-user client setting
 * "Show item descriptions" (default off) brings back the long rows of 0.52 (cards.mjs cardList). Magic keeps its own setting.
 * The row, list, expand and band-height code is shared in compact-rows.mjs. 0.56.0: one line per row at every width, with per-tab
 * priority and step constants, below.
 */
import {dnd5eConfig, labelOf} from './constants.mjs';
import {cardList} from './cards.mjs';
import {registerViewSetting, readViewSetting, writeViewSetting, viewSwitch, compactList, toggleCompact} from './compact-rows.mjs';

export const ITEM_DESCRIPTIONS_SETTING = 'showItemDescriptions';
const ITEM = {p: 'agch-crow', action: 'item-expand'};
/** The tabs whose rows follow the setting. */
export const ITEM_ROW_TABS = ['combat', 'inventory', 'features'];

/** Per user (client scope), default off: off = compact rows with the description on demand, on = long rows. */
export function registerItemViewSetting(settings, onChange) {
  registerViewSetting(settings, onChange, ITEM_DESCRIPTIONS_SETTING, 'Character Hub: show item descriptions', 'Show each item\'s description under its name in the Combat, Inventory and Features tabs. Off: one line per item, open the description on demand.');
}
export const showItemDescriptions = () => readViewSetting(ITEM_DESCRIPTIONS_SETTING);
export const setShowItemDescriptions = on => writeViewSetting(ITEM_DESCRIPTIONS_SETTING, on);
/** The Filters / View popover's switch (Combat, Inventory, Features). Saves at once and says so; not counted in Filters (n). */
export const itemDescriptionsToggle = () => viewSwitch('item-descriptions', 'Show item descriptions', showItemDescriptions());

/**
 * 0.56.0: Combat, Inventory and Features rows are exactly one line, like Magic's (SPELL_PRIORITY / SPELL_STEPS in spell-rows.mjs).
 * Per tab ONE ordered priority list: `always` is never dropped; `optional` runs from the column that stays longest to the one that
 * goes first as the Hub narrows (so it drops in the reverse order). A dropped column moves into the open row, which always lists
 * every fact. The STEPS are the Hub body widths (px, container `agch-body`) at or below which each step applies, widest first; the
 * CSS container queries in styles/character-hub.css ("0.56.0") mirror them and a test compares them in order. ITEM_LAYOUT holds the
 * track arithmetic (px at the default Compact tokens, rem = 16px) the widths come from: see rowNeed() in compact-rows.mjs.
 */
export const COMBAT_PRIORITY = Object.freeze({
  always: Object.freeze(['star', 'icon', 'chevron', 'name', 'badges', 'use']),
  optional: Object.freeze(['tohit', 'dice', 'range', 'uses', 'recovery', 'properties'])
});
export const COMBAT_STEPS = Object.freeze([
  Object.freeze({width: 575, hides: 'properties'}),
  Object.freeze({width: 565, hides: 'recovery'}),
  Object.freeze({width: 535, hides: 'uses'}),
  Object.freeze({width: 475, hides: 'range'}),
  Object.freeze({width: 400, hides: 'dice'}),
  Object.freeze({width: 390, hides: 'tohit'})
]);
/**
 * Inventory (0.57.0): the name keeps a generous minimum width and nothing sits beside it. The actions are pinned and never hidden:
 * Use, the Equip / Equipped and Attune / Attuned toggles (like Magic's Prepare / Prepared) and Move to party stash; at the first step
 * they become icons. Quantity is only its number field on the line (minus and plus are in the open row at every width). Weight and
 * Value are low priority and go first, then Qty (its field moves into the open row beside minus and plus); Uses stays longest, right
 * before the actions (0.57.1).
 */
export const INVENTORY_PRIORITY = Object.freeze({
  always: Object.freeze(['fold', 'star', 'icon', 'chevron', 'name', 'actions']),
  optional: Object.freeze(['uses', 'qty', 'value', 'weight'])
});
export const INVENTORY_STEPS = Object.freeze([
  Object.freeze({width: 775, hides: 'action-labels'}),
  Object.freeze({width: 615, hides: 'weight'}),
  Object.freeze({width: 555, hides: 'value'}),
  Object.freeze({width: 490, hides: 'qty'})
]);
/** Inventory's list scrolls sideways below this width (px): its name track is wider than the other tabs'. */
export const INVENTORY_MIN_LIST = 416;
export const FEATURES_PRIORITY = Object.freeze({
  always: Object.freeze(['star', 'icon', 'chevron', 'name', 'use']),
  optional: Object.freeze(['uses', 'recovery', 'activation', 'type'])
});
export const FEATURES_STEPS = Object.freeze([
  Object.freeze({width: 590, hides: 'type'}),
  Object.freeze({width: 490, hides: 'activation'}),
  Object.freeze({width: 400, hides: 'recovery'}),
  Object.freeze({width: 390, hides: 'uses'})
]);
/** Equipped / Attuned badges show their word above this width and only their icon (with the word read out and in a tooltip) at or below it. */
export const ITEM_BADGE_STEP = 480;
/** Below this list width (px) the Hub body scrolls sideways; the pinned actions stay on the right. */
export const ITEM_MIN_LIST = 384;
export const ITEM_PRIORITY = Object.freeze({combat: COMBAT_PRIORITY, inventory: INVENTORY_PRIORITY, features: FEATURES_PRIORITY});
export const ITEM_STEPS = Object.freeze({combat: COMBAT_STEPS, inventory: INVENTORY_STEPS, features: FEATURES_STEPS});

/** The short ids the CSS classes use (agch-ic-<id>) for the fact columns' keys. */
export const COL_ID = Object.freeze({damage: 'dice', toHit: 'tohit', range: 'range', properties: 'props', uses: 'uses', recovery: 'recovery', activation: 'act', type: 'type', quantity: 'qty', weight: 'weight', value: 'value'});
/**
 * The track arithmetic. `widths` are the data columns in px (rem x 16), `lead` the star (and the container fold toggle in
 * Inventory), `track` the pinned actions plus its gutter, `sets` the column combinations a tab can show (CSS class agch-set-<name>).
 *   metrics: border 2 (1px each side), rowPad 12 (space-2 each side), gap 3 (space-1 between tracks), icon 24, main (name) 112 = 7rem.
 *   Combat / Features actions: Use 4.25rem = 68 + gutter space-2 6 = 74.
 *   Inventory lead: fold toggle 24 + gap 3 + star 24 = 51. Inventory name: planned at 176 (11rem; the track floor is 9rem). Inventory actions,
 *   icon cluster: 4 x 24 + 3 x 3 + 6 = 111; with labels: Use 64 + Equip toggle 84 + Attune toggle 84 + stash 24 + 3 x 3 + 6 = 271. Qty: the number field, 3rem = 48.
 */
export const ITEM_METRICS = Object.freeze({border: 2, rowPad: 12, gap: 3, icon: 24, main: 112});
export const ITEM_LAYOUT = Object.freeze({
  combat: Object.freeze({lead: 24, track: 74, widths: Object.freeze({tohit: 48, dice: 88, range: 72, uses: 56, recovery: 80, props: 96}),
    sets: Object.freeze({weapons: Object.freeze(['dice', 'tohit', 'range', 'props']), actions: Object.freeze(['range', 'dice', 'uses', 'recovery']), mixed: Object.freeze(['dice', 'tohit', 'range', 'uses'])})}),
  inventory: Object.freeze({lead: 51, track: 111, trackLabels: 271, main: 176, widths: Object.freeze({qty: 48, value: 64, weight: 56, uses: 48}),
    sets: Object.freeze({all: Object.freeze(['qty', 'weight', 'value', 'uses'])})}),
  features: Object.freeze({lead: 24, track: 74, widths: Object.freeze({type: 96, act: 88, recovery: 80, uses: 56}),
    sets: Object.freeze({full: Object.freeze(['type', 'act', 'uses', 'recovery']), notype: Object.freeze(['act', 'uses', 'recovery']), noact: Object.freeze(['type', 'uses', 'recovery'])})})
});

/**
 * Compact-row columns: each gets its fixed-width class (agch-ic agch-ic-<id>), a tooltip with the full value (the cell may be
 * cut with an ellipsis) and a plain-text `fact` for the open row. The long rows get the columns unchanged.
 */
export const itemCols = (columns, compact) => compact ? columns.map(c => {
  const id = COL_ID[c.key] ?? c.key;
  return {...c, cls: `agch-ic agch-ic-${id}`, tip: c.tip ?? (c.render ? false : true), fact: c.fact ?? (r => r.facts?.[c.key])};
}) : columns;
/** The set class for a column list: the set of the tab whose column ids match, in order ('' when none). */
export function setOf(tab, columns) {
  const ids = columns.map(c => String(c.cls ?? '').split(' ').pop().replace(/^agch-ic-/, '')).join(',');
  return Object.entries(ITEM_LAYOUT[tab]?.sets ?? {}).find(([, list]) => list.join(',') === ids)?.[0] ?? '';
}

/** What a compact item row adds to the card's options: the rarity edge and equipped weight. (The Effect, mastery and Not-equipped chips are in the open row since 0.56.0.) */
export function itemRowOpts(row, o = {}) {
  return {...o, extra: `${row.equipped ? ' is-equipped' : ''}${row.rarity ? ' has-rarity ag-rarity-edge' : ''}`, attrs: row.rarity ? ` data-rarity="${row.rarity}"` : ''};
}
const rarityLabel = row => labelOf(dnd5eConfig().itemRarity?.[row.rarity]) || row.rarity;

/**
 * A list function with cardList's signature: compact rows, or (compact false) the long rows with pinned headings too.
 * `nested` is a container's contents list (its headings are not pinned, so they don't stack on the outer ones). `tab` picks the
 * layout (agch-crows--<tab>); the set class follows the columns. A card's `extraFacts` ([label, value] pairs) follow the columns' facts in the open row.
 */
export const itemListFn = (compact, tab = '') => (rows, columns, {card = () => ({}), after = () => '', listKey = '', expanded = null, nested = false} = {}) => {
  const set = compact ? setOf(tab, columns) : '';
  const cls = `agch-crowlist${nested ? ' agch-crowlist--nested' : ''}`;
  const opts = r => { const {extraFacts = [], ...c} = card(r);
    const facts = [...columns.map(col => [col.label, col.fact?.(r)]), ...extraFacts, ...(r.rarity ? [['Rarity', rarityLabel(r)]] : [])];
    return itemRowOpts(r, {...c, facts}); };
  return compact
    ? compactList(rows, columns, {...ITEM, listCls: `${cls} agch-crows${tab ? ` agch-crows--${tab}` : ''}${set ? ` agch-set-${set}` : ''}`, rowOpts: opts, after, listKey, expanded})
    : cardList(rows, columns, {card, after, listKey, expanded, cls});
};

/** Opens or closes one item row's description in place (no redraw, so focus stays on the control); the sheet remembers it. */
export const toggleItem = (sheet, target) => toggleCompact(sheet, target, ITEM);
