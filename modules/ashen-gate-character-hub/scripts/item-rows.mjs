/**
 * Combat, Inventory and Features rows (0.53.0). Like Magic's (spell-rows.mjs), an item is one line by default: the same
 * icon, name, chips, fact columns and row controls as the long row, with the description opening on demand beneath it
 * (chevron or name; an "Open <item>" button in the detail row opens the item sheet). The per-user client setting
 * "Show item descriptions" (default off) brings back the long rows of 0.52 (cards.mjs cardList). Magic keeps its own setting.
 * The row, list, expand and band-height code is shared in compact-rows.mjs.
 */
import {esc} from './constants.mjs';
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
 * Columns for the compact rows: the ones named in `lateKeys` are the lower-priority facts. They show in the row, and in a
 * narrow window (container <= 640px) move into the open detail row instead. The long rows get the columns unchanged.
 */
export const withLate = (columns, lateKeys, compact) => compact ? columns.map(c => lateKeys.includes(c.key) ? {...c, late: true} : c) : columns;

/** What a compact item row adds to the card's options: the rarity edge and equipped weight, and the effect-note badge. */
export function itemRowOpts(row, o = {}) {
  let badges = o.badges ?? '';
  if (row.effectNote) badges = `<span class="ag-badge ag-badge--accent agch-effect-badge" data-tooltip="${esc(`Effect (the GM decides): ${row.effectNote}`)}"><i class="fa-solid fa-wand-sparkles" aria-hidden="true"></i> Effect</span>${badges}`;
  return {...o, badges, extra: `${row.equipped ? ' is-equipped' : ''}${row.rarity ? ' has-rarity ag-rarity-edge' : ''}`, attrs: row.rarity ? ` data-rarity="${row.rarity}"` : ''};
}

/**
 * A list function with cardList's signature: compact rows, or (compact false) the long rows with pinned headings too.
 * `nested` is a container's contents list (its headings are not pinned, so they don't stack on the outer ones).
 */
export const itemListFn = compact => (rows, columns, {card = () => ({}), after = () => '', listKey = '', expanded = null, nested = false} = {}) => {
  const cls = `agch-crowlist${nested ? ' agch-crowlist--nested' : ''}`;
  return compact
    ? compactList(rows, columns, {...ITEM, listCls: `${cls} agch-crows`, rowOpts: r => itemRowOpts(r, card(r)), after, listKey, expanded})
    : cardList(rows, columns, {card, after, listKey, expanded, cls});
};

/** Opens or closes one item row's description in place (no redraw, so focus stays on the control); the sheet remembers it. */
export const toggleItem = (sheet, target) => toggleCompact(sheet, target, ITEM);
