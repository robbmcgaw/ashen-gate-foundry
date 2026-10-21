/**
 * The two hotbars at the bottom of the Hub (0.13.0), each folding away like a section:
 *   1. Marks: one button per mark the character may place (equipped weapons' masteries, spell marks), applied to
 *      the user's targeted tokens; below it, the marks this character has placed in the scene, each with ✕.
 *   2. Quick bar: HOTBAR_SLOTS free slots the player fills by dragging the character's items or a macro.
 */
import {esc} from './constants.mjs';
import {availableMarks, placedMarks, targetedTokens} from './marks.mjs';
import {hotbarData} from './hotbar.mjs';
import {toggleButton, bodyAttrs, sectionKey} from './collapse.mjs';
import {canSee, hiddenBadge} from './visibility.mjs';

function marksBar(actor, off) {
  const marks = availableMarks(actor), placed = placedMarks(actor), n = targetedTokens().length;
  const buttons = marks.map(a => `<button type="button" class="agch-hotbtn" data-action="mark-apply" data-mark="${esc(a.mark.id)}" title="${esc(`${a.label}: put on or take off your targeted token${n === 1 ? '' : 's'} (from ${a.sources.join(', ')})`)}"${off ? ' disabled' : ''}>
      <img src="${esc(a.mark.icon)}" alt=""><span>${esc(a.label)}</span></button>`).join('');
  const onTargets = placed.length ? `<ul class="agch-placed" aria-label="Marks you placed">${placed.map(p => `<li><img src="${esc(p.mark.icon)}" alt=""> ${esc(p.tokenName)}: ${esc(p.mark.label)}
      <button type="button" class="agch-placed__off" data-action="mark-remove" data-scene="${esc(p.sceneId)}" data-token="${esc(p.tokenId)}" data-mark="${esc(p.mark.id)}" title="Take ${esc(p.mark.label)} off ${esc(p.tokenName)}" aria-label="Take ${esc(p.mark.label)} off ${esc(p.tokenName)}"${off ? ' disabled' : ''}><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></li>`).join('')}</ul>` : '';
  const empty = '<span class="agch-muted">No marks: they come from equipped weapons with a mastery you know, and from spells like Hunter\'s Mark or Hex.</span>';
  return `<div class="agch-hotbar__row">${buttons || empty}<span class="agch-muted agch-hotbar__targets">${n ? `${n} target${n === 1 ? '' : 's'}` : 'No target'}</span></div>${onTargets}`;
}

function quickBar(actor, off) {
  return `<ol class="agch-quick" aria-label="Quick bar">${hotbarData(actor).map(d => d.slot
    ? `<li><button type="button" class="agch-quick__slot is-filled${d.missing ? ' is-missing' : ''}" data-action="hotbar-use" data-hotbar-slot="${d.index}" title="${esc(`${d.name}${d.missing ? ' (gone: right-click to clear)' : ' (click to use, right-click to clear)'}`)}" aria-label="${esc(`Slot ${d.index + 1}: ${d.name}`)}"${off ? ' disabled' : ''}><img src="${esc(d.img)}" alt=""><span class="agch-quick__n">${(d.index + 1) % 10}</span></button></li>`
    : `<li><span class="agch-quick__slot is-empty" data-hotbar-slot="${d.index}" title="Empty: drag one of this character's items or a macro here" aria-label="Slot ${d.index + 1}: empty"><span class="agch-quick__n">${(d.index + 1) % 10}</span></span></li>`).join('')}</ol>`;
}

/** Both hotbars, or nothing when the GM hides them from players. Observers see them disabled. */
export function hotbarsHtml(ctx) {
  if (!canSee('hotbars')) return '';
  const {actor, editable} = ctx, off = !editable;
  const bar = (key, title, body) => `<section class="agch-hotbar" data-sec="${esc(key)}"><h3 class="agch-hotbar__head">${toggleButton(key, title)}</h3><div class="agch-hotbar__body"${bodyAttrs(key)}>${body}</div></section>`;
  return `<div class="agch-hotbars">${hiddenBadge('hotbars') ? `<p class="agch-hidden-note">${hiddenBadge('hotbars')}</p>` : ''}
    ${bar(sectionKey('hotbar', 'marks'), 'Mastery &amp; marks', marksBar(actor, off))}
    ${bar(sectionKey('hotbar', 'quick'), 'Quick bar', quickBar(actor, off))}</div>`;
}
