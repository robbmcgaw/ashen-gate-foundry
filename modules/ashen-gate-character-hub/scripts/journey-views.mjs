/**
 * Journey tab (0.20.0, alpha): the character's accomplishments, newest first. Players see their own character's
 * visible entries. The GM sees every character's journey (character picker), hidden entries too, and can add GM
 * notes (text and an optional date), edit any entry, hide or show it, and delete GM notes.
 */
import {esc} from './constants.mjs';
import {btn} from './buttons.mjs';
import {journeyFor, canRead, partyActors, TYPES, TEXT_MAX} from './journey.mjs';

const ICONS = {level: 'fa-solid fa-arrow-up-right-dots', renown: 'fa-solid fa-flag', quest: 'fa-solid fa-scroll', reward: 'fa-solid fa-coins', cinder: 'fa-solid fa-fire', manual: 'fa-solid fa-feather-pointed'};
const when = e => e.date ?? (e.at ? new Date(e.at).toISOString().slice(0, 10) : '');

/** The character whose journey is shown: this sheet's, or (GM) the one picked. */
export function journeyActor(ctx) {
  const gm = globalThis.game?.user?.isGM === true, picked = ctx.sheet?.journeyActorId;
  return gm && picked ? globalThis.game?.actors?.get?.(picked) ?? ctx.actor : ctx.actor;
}

/** A reward's item pictures (0.25.0): image, name as alt text, name and quantity as the tooltip. Never ids. */
function rewardItems(e) {
  const list = Array.isArray(e.data?.items) ? e.data.items.filter(i => typeof i?.name === 'string' && i.name) : [];
  if (!list.length) return '';
  return ` <span class="agch-journey__items">${list.map(i => {
    const tip = Number(i.quantity) > 1 ? `${i.quantity} × ${i.name}` : i.name;
    return `<img src="${esc(i.img || 'icons/svg/item-bag.svg')}" alt="${esc(i.name)}" data-tooltip="${esc(tip)}">`;
  }).join('')}</span>`;
}

function row(e, gm, editing) {
  const controls = gm ? `<span class="agch-journey__ctl">${btn('journey-edit', '', {kind: 'ghost', icon: 'fa-solid fa-pen', data: {id: e.id}, title: 'Edit'})}
    ${btn(e.hidden ? 'journey-show' : 'journey-hide', '', {kind: 'ghost', icon: e.hidden ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash', data: {id: e.id}, title: e.hidden ? 'Show to the player' : 'Hide from the player'})}
    ${e.manual ? btn('journey-delete', '', {kind: 'ghost', icon: 'fa-solid fa-trash', data: {id: e.id}, title: 'Delete this GM note'}) : ''}</span>` : '';
  if (editing) return `<li class="agch-journey__entry is-editing" data-entry="${esc(e.id)}"><form class="agch-journey__form" data-journey-form="edit">
    <input type="text" name="text" value="${esc(e.text)}" maxlength="${TEXT_MAX}" aria-label="Entry text"><input type="date" name="date" value="${esc(e.date ?? '')}" aria-label="Date (optional)">
    <span class="agch-journey__formbtns">${btn('journey-cancel', 'Cancel', {kind: 'ghost'})}${btn('journey-save', 'Save Changes', {kind: 'primary', data: {id: e.id}})}</span></form></li>`;
  return `<li class="agch-journey__entry${e.hidden ? ' is-hidden' : ''}" data-entry="${esc(e.id)}" data-type="${esc(e.type)}">
    <i class="${ICONS[e.type] ?? 'fa-solid fa-circle'} agch-journey__icon" data-tooltip="${esc(TYPES[e.type] ?? e.type)}" aria-hidden="true"></i>
    <span class="agch-journey__when">${esc(when(e))}</span><span class="agch-journey__text">${esc(e.text)}${rewardItems(e)}${e.hidden ? ' <span class="ag-badge ag-badge--warn"><i class="fa-solid fa-eye-slash" aria-hidden="true"></i> Hidden from player</span> <span class="ag-gm-flag"><i class="fa-solid fa-eye-slash" aria-hidden="true"></i> GM only</span>' : ''}</span>${controls}</li>`;
}

export function journeyTab(ctx) {
  const gm = globalThis.game?.user?.isGM === true, actor = journeyActor(ctx);
  const head = `<p class="agch-journey__alpha"><span class="ag-badge ag-badge--accent">New · alpha</span> Accomplishments are recorded from now on: level-ups, Renown tier changes, completed quests${gm ? ', and your own notes' : ''}.</p>`;
  if (!canRead(actor)) return `${head}<div class="ag-empty"><p class="ag-empty__title">This Journey is private.</p><p class="ag-empty__text">Only this character's owner and the GM can see it.</p></div>`;
  const picker = gm ? `<label class="agch-orgsel"><span>Character</span><select data-edit="journey-actor" aria-label="Show the Journey of">${[...new Map([ctx.actor, ...partyActors()].filter(Boolean).map(a => [a.id, a])).values()]
    .map(a => `<option value="${esc(a.id)}"${a.id === actor.id ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>` : '';
  const add = gm ? `<form class="agch-journey__form agch-journey__add" data-journey-form="add">
      <input type="text" name="text" maxlength="${TEXT_MAX}" placeholder="Add a GM note to ${esc(actor.name)}'s Journey" aria-label="New Journey entry">
      <input type="date" name="date" aria-label="Date (optional)"><label class="agch-journey__hide"><input type="checkbox" name="hidden"> Hidden from player</label>
      ${btn('journey-add', 'Add entry', {kind: 'primary', icon: 'fa-solid fa-plus'})}</form>` : '';
  const entries = journeyFor(actor), editing = ctx.sheet?.journeyEdit ?? null;
  const list = entries.length ? `<ol class="agch-journey" aria-label="${esc(actor.name)}'s Journey, newest first">${entries.map(e => row(e, gm, gm && editing === e.id)).join('')}</ol>`
    : '<div class="ag-empty"><i class="fa-solid fa-book-open" aria-hidden="true"></i><p class="ag-empty__title">No accomplishments yet.</p><p class="ag-empty__text">Level-ups, Renown ranks and completed quests show here as they happen.</p></div>';
  return `${head}${gm ? `<div class="ag-toolbar agch-toolbar">${picker}</div>${add}` : ''}${list}`;
}
