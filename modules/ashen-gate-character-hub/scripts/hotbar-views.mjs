/**
 * The two hotbars at the bottom of the Hub (0.13.0), each folding away like a section:
 *   1. Marks: one button per mark the character may place (equipped weapons' masteries, spell marks), applied to
 *      the user's targeted tokens; below it, the marks this character has placed in the scene, each with ✕.
 *      0.28.0: the character's own Strain as a read-only chip at the end of the row (Ashen Gate | Cinders' api.strain).
 *   2. Quick bar: HOTBAR_SLOTS free slots the player fills by dragging the character's items or a macro.
 */
import {esc} from './constants.mjs';
import {availableMarks, placedMarks, targetedTokens} from './marks.mjs';
import {hotbarData} from './hotbar.mjs';
import {tooltipAttrs, itemUuid} from './tooltips.mjs';
import {toggleButton, bodyAttrs, sectionKey} from './collapse.mjs';
import {canSee, hiddenBadge} from './visibility.mjs';
import {strainModel} from './cinders.mjs';

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

function marksBar(actor, off) {
  const marks = availableMarks(actor), placed = placedMarks(actor), n = targetedTokens().length;
  const buttons = marks.map(a => `<button type="button" class="agch-hotbtn" data-action="mark-apply" data-mark="${esc(a.mark.id)}"${tooltipAttrs(a.sourceUuids?.[0] ?? null, `${a.label}: put on or take off your targeted token${n === 1 ? '' : 's'} (from ${a.sources.join(', ')})`)} aria-label="${esc(`${a.label}: put on or take off your targeted token${n === 1 ? '' : 's'}`)}"${off ? ' disabled' : ''}>
      <img src="${esc(a.mark.icon)}" alt=""><span>${esc(a.label)}</span></button>`).join('');
  const onTargets = placed.length ? `<ul class="agch-placed" aria-label="Marks you placed">${placed.map(p => `<li><img src="${esc(p.mark.icon)}" alt=""> ${esc(p.tokenName)}: ${esc(p.mark.label)}
      <button type="button" class="agch-placed__off" data-action="mark-remove" data-scene="${esc(p.sceneId)}" data-token="${esc(p.tokenId)}" data-mark="${esc(p.mark.id)}" data-tooltip="Take ${esc(p.mark.label)} off ${esc(p.tokenName)}" aria-label="Take ${esc(p.mark.label)} off ${esc(p.tokenName)}"${off ? ' disabled' : ''}><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></li>`).join('')}</ul>` : '';
  const empty = '<span class="agch-muted">No marks: they come from equipped weapons with a mastery you know, and from spells like Hunter\'s Mark or Hex.</span>';
  return `<div class="agch-hotbar__row">${buttons || empty}<span class="agch-muted agch-hotbar__targets">${n ? `${n} target${n === 1 ? '' : 's'}` : 'No target'}</span>${strainChip(actor)}</div>${onTargets}`;
}

function quickBar(actor, off) {
  return `<ol class="ag-hotbar agch-quick" aria-label="Quick bar">${hotbarData(actor).map(d => d.slot
    ? `<li><button type="button" class="ag-slot agch-quick__slot is-filled${d.missing ? ' is-missing' : ''}" data-action="hotbar-use" data-hotbar-slot="${d.index}"${tooltipAttrs(d.slot.type === 'Item' && !d.missing ? itemUuid(d.doc) : null, `${d.name}${d.missing ? ' (gone: right-click to clear)' : ' (click to use, right-click to clear)'}`)} aria-label="${esc(`Slot ${d.index + 1}: ${d.name}`)}"${off ? ' disabled' : ''}><img src="${esc(d.img)}" alt=""><span class="ag-slot__key agch-quick__n">${(d.index + 1) % 10}</span></button></li>`
    : `<li><span class="ag-slot agch-quick__slot is-empty" data-hotbar-slot="${d.index}" data-tooltip="Empty: drag one of this character's items or a macro here" aria-label="Slot ${d.index + 1}: empty"><span class="ag-slot__key agch-quick__n">${(d.index + 1) % 10}</span></span></li>`).join('')}</ol>`;
}

/** Both hotbars (Compact: the quick bar only), or nothing when the GM hides them from players. Observers see them disabled. */
export function hotbarsHtml(ctx) {
  if (!canSee('hotbars')) return '';
  const {actor, editable} = ctx, off = !editable;
  const bar = (key, title, body) => `<section class="agch-hotbar" data-sec="${esc(key)}"><h3 class="agch-hotbar__head">${toggleButton(key, title)}</h3><div class="agch-hotbar__body"${bodyAttrs(key)}>${body}</div></section>`;
  return `<div class="agch-hotbars">${hiddenBadge('hotbars') ? `<p class="agch-hidden-note">${hiddenBadge('hotbars')}</p>` : ''}
    ${ctx.compact ? '' : bar(sectionKey('hotbar', 'marks'), 'Mastery &amp; marks', marksBar(actor, off))}
    ${bar(sectionKey('hotbar', 'quick'), 'Quick bar', quickBar(actor, off))}</div>`;
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
