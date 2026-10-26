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
 * 0.55.0: what a Magic row shows, by what players use at the table. ONE ordered list: the row always keeps ALWAYS; the optional
 * columns are listed from the one that stays longest to the one that goes first as the Hub narrows. A dropped column moves
 * into the open row. The CSS container steps (styles/character-hub.css, "0.55.0 Magic") mirror SPELL_STEPS; a test compares them.
 */
export const SPELL_PRIORITY = Object.freeze({
  always: Object.freeze(['star', 'icon', 'chevron', 'name', 'badges', 'prepare', 'cast']),
  optional: Object.freeze(['dice', 'range', 'casting', 'components'])
});
/** The Hub body widths (px) at or below which each step applies, widest first, in the order columns drop (Components first). */
export const SPELL_STEPS = Object.freeze([
  Object.freeze({width: 680, hides: 'components'}),
  Object.freeze({width: 590, hides: 'casting'}),
  Object.freeze({width: 505, hides: 'range'}),
  Object.freeze({width: 455, hides: 'dice-compact'}),
  Object.freeze({width: 415, hides: 'dice'})
]);
/** Below this list width (px) the Hub body scrolls sideways; the buttons stay pinned on the right. */
export const SPELL_MIN_LIST = 384;

const str = v => (v === null || v === undefined ? '' : String(v)).trim();
/** The spell's damage or healing dice, compact: "8d6 Fire" -> "8d6 fire", "2d8 + 3 Healing" -> "2d8+3 heal", parts joined with " + ". Base value (no upcast scaling). */
export function diceText(facts) {
  return str(facts?.damage).split(/,\s*/).filter(Boolean).map(p => p.replace(/\s*\+\s*/g, '+').replace(/temporary hit points/gi, 'temp HP').replace(/\bhealing\b/gi, 'heal').replace(/\b(?!HP\b)([A-Za-z]+)\b/g, w => (/^\d*d\d+$/i.test(w) ? w : w.toLowerCase()))).join(' + ');
}
/** The same in full, for the tooltip and the open row. */
export const diceFull = facts => str(facts?.damage).split(/,\s*/).filter(Boolean).join(' + ');

/** A casting time that is not a plain Action: a short word by the name ("Bonus", "Reaction", "1 min"), shown only while the Casting column is hidden. */
export function castingShort(label) {
  const t = str(label);
  if (!t || /^(1 )?action$/i.test(t)) return '';
  if (/bonus/i.test(t)) return 'Bonus';
  if (/reaction/i.test(t)) return 'Reaction';
  const m = t.match(/^(\d+)\s*(minute|hour|round|day)s?$/i);
  return m ? `${m[1]} ${{minute: 'min', hour: 'hr', round: 'rd', day: 'day'}[m[2].toLowerCase()]}` : t;
}
export function castingException(facts) {
  const short = castingShort(facts?.activation);
  return short ? ` <span class="ag-badge agch-cast-ex" data-tooltip="${esc(`Casting time: ${facts.activation}`)}"><span aria-hidden="true">${esc(short)}</span><span class="ag-sr-only">${esc(`Casting time: ${facts.activation}`)}</span></span>` : '';
}

/** Columns in display order (Dice, Range, Casting, Components); they drop in the reverse order, see SPELL_PRIORITY. */
export const SPELL_COLUMNS = Object.freeze([
  Object.freeze({key: 'dice', label: 'Dice', cls: 'agch-sp-dice', render: r => esc(diceText(r.facts)), tip: r => diceFull(r.facts)}),
  Object.freeze({key: 'range', label: 'Range', cls: 'agch-sp-range', tip: true}),
  Object.freeze({key: 'activation', label: 'Casting', cls: 'agch-sp-cast', tip: true}),
  Object.freeze({key: 'components', label: 'Components', cls: 'agch-sp-comps', tip: true})
]);
/** The open row's facts: everything the line does not show at some width. */
export const spellFacts = r => [['Level', r.facts?.level || (r.level ? `Level ${r.level}` : 'Cantrip')], ['School', r.facts?.school], ['Casting', r.facts?.activation], ['Range', r.facts?.range], ['Dice', diceFull(r.facts)], ['Duration', r.facts?.duration], ['Components', r.facts?.components]];

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
