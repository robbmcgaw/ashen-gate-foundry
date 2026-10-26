/**
 * Magic tab rows (0.51.0). By default a spell is one line (star, icon, name, school, casting time, range, duration with
 * C / R badges, components, Prepare, Cast) and its description opens on demand beneath it. The per-user client setting
 * "Show spell descriptions" (default off) brings back the long rows of 0.50 (cards.mjs cardList). Also the prepared-spell
 * count shown in the level strip, and the band-height sync that pins the column headings under the toolbar.
 */
import {esc} from './constants.mjs';
import {registerViewSetting, readViewSetting, writeViewSetting, viewSwitch, compactRowHtml, compactList, toggleCompact} from './compact-rows.mjs';
import {indicatorText} from './spell-prep.mjs';

export {syncBandHeight} from './compact-rows.mjs';
export const DESCRIPTIONS_SETTING = 'showSpellDescriptions';
const SPELL = {p: 'agch-spell', action: 'spell-expand'};

/** Per user (client scope), default off: off = compact rows with the description on demand, on = long rows. */
export function registerSpellViewSetting(settings, onChange) {
  registerViewSetting(settings, onChange, DESCRIPTIONS_SETTING, 'Character Hub: show spell descriptions', 'Show each spell\'s description under its name in the Magic tab. Off: one line per spell, open the description on demand.');
}
export const showDescriptions = () => readViewSetting(DESCRIPTIONS_SETTING);
export const setShowDescriptions = on => writeViewSetting(DESCRIPTIONS_SETTING, on);

/** The Filters popover's switch. It saves at once and is marked so; it is a view choice, not a filter (not counted in Filters (n)). */
export const descriptionsToggle = () => viewSwitch('spell-descriptions', 'Show spell descriptions', showDescriptions());

/** One compact spell row. `expanded` is the sheet's Set of open detail keys. */
export const spellRowHtml = (row, columns, o = {}) => compactRowHtml(row, columns, {...SPELL, ...o});

/** A list of compact spell rows with the column headings (pinned by CSS while the list scrolls). */
export const spellList = (rows, columns, {card = () => ({}), listKey = '', expanded = null} = {}) => compactList(rows, columns, {...SPELL, listCls: 'agch-spelllist agch-spells', rowOpts: card, listKey, expanded});

/** Opens or closes one row's description in place (no redraw, so focus stays on the control); the sheet remembers it. */
export const toggleSpell = (sheet, target) => toggleCompact(sheet, target, SPELL);

/**
 * The prepared-spell count per class, as small items at the end of the level strip's existing flex row (no padding or
 * margin is added to the strip, so nothing moves). One class: "Prepared 4/6"; several: "Wizard 4/6" each. At the limit
 * the text says "full" and carries a check icon; the aria-label always says it in full.
 */
export function preparedIndicator(classes) {
  const shown = (classes ?? []).filter(c => c.known || c.value > 0), named = shown.length > 1;
  return shown.map(c => {
    const t = indicatorText(c, {named}), state = c.over ? ' is-over' : t.full ? ' is-full' : '';
    const icon = c.over ? 'fa-triangle-exclamation' : t.full ? 'fa-circle-check' : '';
    return `<span class="ag-badge agch-prepcount${state}" role="img" aria-label="${esc(t.tip)}" data-tooltip="${esc(t.tip)}">${icon ? `<i class="fa-solid ${icon}" aria-hidden="true"></i> ` : ''}${esc(t.text)}${c.over ? ' over' : t.full ? ' full' : ''}</span>`;
  }).join('');
}
