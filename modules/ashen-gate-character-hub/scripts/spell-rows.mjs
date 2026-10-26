/**
 * Magic tab rows (0.51.0; strictly one line since 0.55.0). By default a spell is one line (star, icon, chevron, name with C / R badges,
 * casting, range, components, Prepare, Cast) and its description opens on demand beneath it. The per-user client setting
 * "Show spell descriptions" (default off) brings back the long rows of 0.50 (cards.mjs cardList). Also the prepared-spell
 * count shown in the level strip, and the band-height sync that pins the column headings under the toolbar.
 */
import {esc} from './constants.mjs';
import {registerViewSetting, readViewSetting, writeViewSetting, viewSwitch, compactRowHtml, compactList, toggleCompact} from './compact-rows.mjs';
import {indicatorText} from './spell-prep.mjs';

export {syncBandHeight} from './compact-rows.mjs';
export const DESCRIPTIONS_SETTING = 'showSpellDescriptions';
const SPELL = {p: 'agch-spell', action: 'spell-expand'};

/**
 * 0.55.0: every spell row is one line. The columns, in the order they drop as the Hub narrows (styles: container steps on the
 * Hub body): Components, then Casting, then Range (its place is taken by the short "Action · 30 ft" text), then that text.
 * School, Duration and the rest are in the open row; C / R badges beside the name carry concentration and ritual.
 */
export const SPELL_COLUMNS = Object.freeze([
  Object.freeze({key: 'activation', label: 'Casting', cls: 'agch-sp-cast', tip: true}),
  Object.freeze({key: 'range', label: 'Range', cls: 'agch-sp-range', tip: true}),
  Object.freeze({key: 'components', label: 'Components', cls: 'agch-sp-comps', tip: true}),
  Object.freeze({key: 'brief', label: 'Casting · Range', cls: 'agch-sp-brief', render: r => esc(`${r.facts?.activation || '—'} · ${r.facts?.range || '—'}`)})
]);
/** The open row's facts: everything the line does not show at some width. */
export const spellFacts = r => [['Level', r.facts?.level || (r.level ? `Level ${r.level}` : 'Cantrip')], ['School', r.facts?.school], ['Casting', r.facts?.activation], ['Range', r.facts?.range], ['Duration', r.facts?.duration], ['Components', r.facts?.components]];

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
export const spellList = (rows, columns, {card = () => ({}), listKey = '', expanded = null} = {}) => compactList(rows, columns, {...SPELL, listCls: 'agch-spelllist agch-spells', rowOpts: r => ({facts: spellFacts(r), ...card(r)}), listKey, expanded});

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
