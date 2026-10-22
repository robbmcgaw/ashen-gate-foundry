/**
 * The strips at the bottom of the Hub (0.13.0) and the quick bar drawer:
 *   1. Mastery & marks: one button per mark the character may place (equipped weapons' masteries, spell marks), applied
 *      to the user's targeted tokens, then the marks this character has placed in the scene, each with ✕.
 *      0.28.0: the character's own Strain as a read-only chip (Ashen Gate | Cinders' api.strain).
 *      0.30.0: one compact strip that does not fold: the target count, the Strain chip and the "Mastery & marks" label sit
 *      together in the right corner, and the marks wrap onto more lines growing to the left of them.
 *      0.32.0: shown in Compact as well. 0.33.0: its help is a focusable "?" button (CH-25). 0.34.0: Compact leaves the
 *      Strain chip out (the Strain pill sits beside HP).
 *   2. Conditions (0.34.0, conditions.mjs), right under Mastery & marks.
 *   3. Quick bar: HOTBAR_SLOTS free slots the player fills by dragging the character's items or a macro. 0.34.0: a
 *      drawer under the whole Hub, below the bottom bar; its toggle sits at the end of that bar. Closed, it takes no
 *      room (the slots stay in the page, hidden, so the quick keys 1-9 and 0 keep working).
 */
import {esc} from './constants.mjs';
import {availableMarks, placedMarks, targetedTokens} from './marks.mjs';
import {hotbarData} from './hotbar.mjs';
import {tooltipAttrs, itemUuid} from './tooltips.mjs';
import {canSee, hiddenBadge} from './visibility.mjs';
import {strainModel} from './cinders.mjs';
import {conditionsStripHtml} from './conditions.mjs';

/**
 * Strain readout (0.28.0): read only, the character's own Strain from Cinders' api.strain (value, band, Push Backfire
 * chance). Nothing when Cinders is missing or can't be read, or when the GM hides the Strain bar from players.
 */
export function strainChip(actor) {
  const m = canSee('strain') ? strainModel(actor) : null;
  if (!m) return '';
  const tone = m.over || m.guaranteed ? ' ag-badge--danger' : m.chance > 0 ? ' ag-badge--warn' : '';
  const tip = `Your Strain ${m.label}${m.band ? `: ${m.band}` : ''}. Backfire on a Push from here: ${m.chance}%${m.guaranteed ? ' (guaranteed)' : ''}. Read only.`;
  return `<span class="ag-badge${tone} agch-hotbar__strain" data-tooltip="${esc(tip)}" aria-label="${esc(tip)}"><i class="fa-solid fa-fire" aria-hidden="true"></i> Strain ${esc(m.label)}${m.band ? ` · ${esc(m.band)}` : ''}</span>`;
}

function marksBar(actor, off, compact = false) {
  const marks = availableMarks(actor), placed = placedMarks(actor), n = targetedTokens().length;
  const buttons = marks.map(a => `<button type="button" class="agch-hotbtn" data-action="mark-apply" data-mark="${esc(a.mark.id)}"${tooltipAttrs(a.sourceUuids?.[0] ?? null, `${a.label}: put on or take off your targeted token${n === 1 ? '' : 's'} (from ${a.sources.join(', ')})`)} aria-label="${esc(`${a.label}: put on or take off your targeted token${n === 1 ? '' : 's'}`)}"${off ? ' disabled' : ''}>
      <img src="${esc(a.mark.icon)}" alt=""><span>${esc(a.label)}</span></button>`).join('');
  const onTargets = placed.length ? `<ul class="agch-placed" aria-label="Marks you placed">${placed.map(p => `<li><img src="${esc(p.mark.icon)}" alt=""> ${esc(p.tokenName)}: ${esc(p.mark.label)}
      <button type="button" class="agch-placed__off" data-action="mark-remove" data-scene="${esc(p.sceneId)}" data-token="${esc(p.tokenId)}" data-mark="${esc(p.mark.id)}" data-tooltip="Take ${esc(p.mark.label)} off ${esc(p.tokenName)}" aria-label="Take ${esc(p.mark.label)} off ${esc(p.tokenName)}"${off ? ' disabled' : ''}><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></li>`).join('')}</ul>` : '';
  const from = 'they come from equipped weapons with a mastery you know, and from spells like Hunter\'s Mark or Hex.';
  // 0.33.1: Compact says "No marks" on one line; where they come from moves into the help button.
  const empty = `<span class="agch-muted agch-marks__empty">${compact ? 'No marks' : `No marks: ${from}`}</span>`;
  const help = `Mastery & marks: target a token (T), then click a mark to put it on your targets or take it off. Tracking only: nothing is automated.${compact && !marks.length ? ` Marks: ${from}` : ''}`;
  return `<div class="agch-marks"><div class="agch-marks__list">${buttons || empty}${onTargets}</div>
    <div class="agch-marks__end"><span class="agch-muted agch-hotbar__targets"><i class="fa-solid fa-crosshairs" aria-hidden="true"></i> ${n ? `${n} target${n === 1 ? '' : 's'}` : 'No target'}</span>${compact ? '' : strainChip(actor)}<span class="agch-marks__title">Mastery &amp; marks</span><button type="button" class="agch-marks__help" data-tooltip="${esc(help)}" aria-label="${esc(help)}"><i class="fa-solid fa-circle-question" aria-hidden="true"></i></button></div></div>`;
}

export function quickBar(actor, off) {
  return `<ol class="ag-hotbar agch-quick" aria-label="Quick bar">${hotbarData(actor).map(d => d.slot
    ? `<li><button type="button" class="ag-slot agch-quick__slot is-filled${d.missing ? ' is-missing' : ''}" data-action="hotbar-use" data-hotbar-slot="${d.index}"${tooltipAttrs(d.slot.type === 'Item' && !d.missing ? itemUuid(d.doc) : null, `${d.name}${d.missing ? ' (gone: right-click to clear)' : ' (click to use, right-click to clear)'}`)} aria-label="${esc(`Slot ${d.index + 1}: ${d.name}`)}"${off ? ' disabled' : ''}><img src="${esc(d.img)}" alt=""><span class="ag-slot__key agch-quick__n">${(d.index + 1) % 10}</span></button></li>`
    : `<li><span class="ag-slot agch-quick__slot is-empty" data-hotbar-slot="${d.index}" data-tooltip="Empty: drag one of this character's items or a macro here" aria-label="Slot ${d.index + 1}: empty"><span class="ag-slot__key agch-quick__n">${(d.index + 1) % 10}</span></span></li>`).join('')}</ol>`;
}

/**
 * The strips under the character (Full and Compact): Mastery & marks (hidden with the GM's Hotbars switch, as before),
 * then Conditions (0.34.0; it follows the character, like the Conditions box did). Observers see them disabled.
 */
export function hotbarsHtml(ctx, compact = false) {
  const {actor, editable} = ctx, off = !editable, marks = canSee('hotbars');
  const conds = conditionsStripHtml(ctx);
  if (!marks && !conds) return '';
  return `<div class="agch-hotbars">${marks && hiddenBadge('hotbars') ? `<p class="agch-hidden-note">${hiddenBadge('hotbars')}</p>` : ''}
    ${marks ? `<section class="agch-hotbar agch-hotbar--marks" data-sec="hotbar:marks" aria-label="Mastery and marks">${marksBar(actor, off, compact)}</section>` : ''}${conds}</div>`;
}

/** The drawer's id (one per open Hub), for the toggle's aria-controls. */
export const drawerId = sheet => `${String(sheet?.id ?? 'agch').replace(/[^A-Za-z0-9_-]/g, '')}-quickbar`;
/** The Quick bar toggle at the end of the bottom bar (0.34.0); nothing while the GM hides the hotbars. */
export function quickToggleHtml(sheet) {
  if (!canSee('hotbars')) return '';
  const open = sheet?.quickOpen === true;
  return `<button type="button" class="ag-btn ag-btn--ghost ag-btn--sm agch-quicktoggle" data-action="quick-toggle" data-ag-always aria-expanded="${open}" aria-controls="${drawerId(sheet)}" data-tooltip="${open ? 'Hide the quick bar (its keys 1-9 and 0 still work)' : 'Show the quick bar under the Hub'}" data-tooltip-direction="UP"><i class="fa-solid ${open ? 'fa-chevron-down' : 'fa-chevron-up'}" aria-hidden="true"></i><span>Quick bar</span></button>`;
}
/** The quick bar drawer under the bottom bar: shown while open, otherwise hidden (no room taken). */
export function quickDrawerHtml(ctx) {
  if (!canSee('hotbars')) return '';
  const open = ctx.sheet?.quickOpen === true;
  return `<div class="agch-drawer" id="${drawerId(ctx.sheet)}" role="region" aria-label="Quick bar"${open ? '' : ' hidden'}>${quickBar(ctx.actor, !ctx.editable)}</div>`;
}

/**
 * Undo notices after a quick-bar clear (0.26.0): kit notices floating over the bottom of the sheet (they don't move
 * the layout), one per pending clear, newest last. Each Undo button carries its own entry id.
 */
export function undoNoticesHtml(list) {
  if (!list?.length) return '';
  return `<div class="agch-undo" role="status" aria-live="polite">${list.map(u => `<div class="ag-notice ag-notice--info agch-undo__notice">
    <i class="fa-solid fa-eraser" aria-hidden="true"></i><span class="agch-undo__text">Cleared slot ${u.index + 1}: ${esc(u.name ?? 'item')}</span>
    <button type="button" class="ag-btn ag-btn--sm" data-action="hotbar-undo" data-undo="${esc(u.id)}" aria-label="${esc(`Undo: put ${u.name ?? 'it'} back in slot ${u.index + 1}`)}"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i><span>Undo</span></button></div>`).join('')}</div>`;
}
