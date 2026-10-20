/**
 * The left column: the character itself. Portrait with the equipment slots around it (display only), AC, initiative,
 * speed, proficiency, hit points, the six abilities, and a compact footer (hit dice, exhaustion, resources, conditions).
 * Slots: click opens the item sheet, right-click unequips, the small ⋯ button opens the slot menu (sheet.menu).
 * An empty slot's click or right-click opens its Equip… menu.
 */
import {esc, signed} from './constants.mjs';
import {btn} from './buttons.mjs';
import {headerData, abilitiesData} from './data.mjs';
import {equipmentLayout, equipChoices, SLOTS} from './items.mjs';
import {partyStashUsable} from './partners.mjs';
import {canSee, hiddenReason, hiddenBadge} from './visibility.mjs';

export const LEFT_SLOTS = ['head', 'neck', 'back', 'body', 'hands'];
export const RIGHT_SLOTS = ['mainhand', 'offhand', 'waist', 'feet', 'other'];
export const BOTTOM_SLOTS = ['ring1', 'ring2', 'trinket'];
/** Slots that trade places with each other ("Swap"). */
export const SLOT_PAIRS = {mainhand: 'offhand', offhand: 'mainhand', ring1: 'ring2', ring2: 'ring1'};

const SHORT = {head: 'Head', neck: 'Neck', back: 'Back', body: 'Body', hands: 'Hands', mainhand: 'Main', offhand: 'Off', waist: 'Waist', feet: 'Feet', ring1: 'Ring', ring2: 'Ring', trinket: 'Trinket', other: 'Other'};
const slotLabel = id => id === 'other' ? 'Other equipped' : SLOTS.find(s => s.id === id)?.label ?? id;

const moveSelect = (row, off) => `<select data-edit="item-slot" data-id="${esc(row.id)}" aria-label="Move ${esc(row.name)} to"${off ? ' disabled' : ''}><option value="">Move to…</option>${SLOTS.map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join('')}<option value="">Automatic</option></select>`;
const menuBtn = (action, label, opts = {}) => btn(action, label, {...opts, extra: 'agch-menu__btn'});

/** Controls for one equipped item inside a slot menu. */
function itemControls(row, slotId, layout, off) {
  const pair = SLOT_PAIRS[slotId], partner = pair ? layout.slots.find(s => s.id === pair)?.item : null;
  return [
    menuBtn('item-sheet', 'Open item', {icon: 'fa-solid fa-up-right-from-square', data: {id: row.id}, always: true}),
    row.usable ? menuBtn('item-use', 'Use', {icon: 'fa-solid fa-dice-d20', data: {id: row.id}, disabled: off}) : '',
    menuBtn('item-unequip', 'Unequip', {icon: 'fa-solid fa-hand', data: {id: row.id}, disabled: off}),
    row.canAttune ? menuBtn('item-attune', row.attuned ? 'Unattune' : 'Attune', {icon: 'fa-solid fa-sun', data: {id: row.id, attuned: row.attuned ? 0 : 1}, disabled: off}) : '',
    partyStashUsable() ? menuBtn('item-deposit', 'Move to party stash', {icon: 'fa-solid fa-people-carry-box', data: {id: row.id}, disabled: off}) : '',
    partner ? menuBtn('slot-swap', `Swap with ${partner.name}`, {icon: 'fa-solid fa-right-left', data: {id: row.id, slot: slotId, other: partner.id, 'other-slot': pair}, disabled: off}) : '',
    moveSelect(row, off)
  ].join('');
}

/** The open slot menu: the equipped item's actions, or Equip… choices for an empty slot. */
function slotMenu(actor, slotId, layout, off) {
  const head = (title, sub = '') => `<header class="agch-menu__head"><strong>${esc(title)}</strong>${sub}${btn('menu-close', '', {kind: 'ghost', icon: 'fa-solid fa-xmark', title: 'Close', always: true})}</header>`;
  if (slotId === 'other') {
    const rows = layout.other.map(r => `<div class="agch-menu__group"><span class="agch-menu__name">${esc(r.name)}</span>${itemControls(r, 'other', layout, off)}</div>`).join('');
    return head('Other equipped') + (rows || '<p class="agch-muted">Equipped items that don\'t fit a slot show here.</p>');
  }
  const s = layout.slots.find(x => x.id === slotId);
  if (!s) return '';
  if (s.item) return head(s.item.name, `<span class="agch-muted">${esc(s.label)}${s.item.attuned ? ' · Attuned' : ''}</span>`) + itemControls(s.item, slotId, layout, off);
  const choices = equipChoices(actor, slotId);
  return head(`${s.label}: empty`) + (choices.length
    ? `<span class="agch-muted">Equip…</span>${choices.map(c => menuBtn('slot-equip', c.name, {data: {id: c.id, slot: slotId}, disabled: off})).join('')}`
    : '<p class="agch-muted">No carried item fits here.</p>');
}

/** One slot: the square (click = open sheet, right-click = unequip) and a small ⋯ button for the menu. */
function slotHtml(id, layout, menu) {
  const open = menu === `slot:${id}`;
  const more = (label, filled) => filled ? `<button type="button" class="agch-slot__more" data-action="slot-menu" data-slot="${id}" data-ag-always aria-haspopup="menu" aria-expanded="${open}" title="More for ${esc(label)}" aria-label="More actions: ${esc(label)}"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button>` : '';
  if (id === 'other') {
    const n = layout.other.length;
    return `<div class="agch-slotwrap"><button type="button" class="agch-slot${n ? ' is-filled' : ' is-empty'}${open ? ' is-open' : ''}" data-action="slot-menu" data-slot="other" data-ag-always
      aria-haspopup="menu" aria-expanded="${open}" aria-label="Other equipped: ${n}" title="Other equipped (${n}): click to list"><span class="agch-slot__empty">${n ? `+${n}` : SHORT.other}</span></button></div>`;
  }
  const s = layout.slots.find(x => x.id === id), item = s?.item;
  if (!item) return `<div class="agch-slotwrap"><button type="button" class="agch-slot is-empty${open ? ' is-open' : ''}" data-action="slot-menu" data-slot="${id}" data-ag-always
    aria-haspopup="menu" aria-expanded="${open}" aria-label="${esc(s.label)}: empty, equip" title="${esc(s.label)}: empty (click to equip)"><span class="agch-slot__empty">${esc(SHORT[id])}</span></button></div>`;
  const tip = `${item.name}${item.attuned ? ' (attuned)' : ''}`;
  return `<div class="agch-slotwrap"><button type="button" class="agch-slot is-filled${item.attuned ? ' is-attuned' : ''}${open ? ' is-open' : ''}" data-action="slot-open" data-slot="${id}" data-id="${esc(item.id)}" data-ag-always
    aria-label="${esc(s.label)}: ${esc(tip)}. Click to open, right-click to unequip" title="${esc(tip)} (click: open, right-click: unequip)"><img src="${esc(item.img)}" alt=""></button>${more(s.label, true)}</div>`;
}

function dollHtml(ctx, h) {
  const {actor, editable, sheet} = ctx, off = !editable, layout = equipmentLayout(actor), menu = sheet?.menu ?? null;
  const token = sheet?.dollArt === 'token';
  const art = token ? (actor.prototypeToken?.texture?.src || actor.img) : actor.img;
  const col = ids => ids.map(id => slotHtml(id, layout, menu)).join('');
  const openSlot = typeof menu === 'string' && menu.startsWith('slot:') ? menu.slice(5) : null;
  const where = !openSlot ? '' : LEFT_SLOTS.includes(openSlot) ? `is-left" style="--row:${LEFT_SLOTS.indexOf(openSlot)}` : RIGHT_SLOTS.includes(openSlot) ? `is-right" style="--row:${RIGHT_SLOTS.indexOf(openSlot)}` : 'is-bottom';
  const pop = openSlot ? `<div class="agch-menu agch-menu--slot ${where}" role="menu" aria-label="${esc(slotLabel(openSlot))}">${slotMenu(actor, openSlot, layout, off)}</div>` : '';
  return `${hiddenBadge('equipment') ? `<p class="agch-hidden-note">${hiddenBadge('equipment')}</p>` : ''}<section class="agch-doll" aria-label="Equipment (display only)">
    <div class="agch-doll__col">${col(LEFT_SLOTS)}</div>
    <div class="agch-doll__center">
      <div class="agch-doll__art"><img class="agch-doll__bg" src="${esc(art)}" alt="" aria-hidden="true"><img class="agch-doll__fg" src="${esc(art)}" alt="${esc(actor.name)}">
        ${btn('doll-art', token ? 'Portrait' : 'Token art', {kind: 'sm', extra: 'agch-doll__toggle', title: token ? 'Show portrait' : 'Show token art', always: true})}
        <div class="agch-ac" title="Armor Class"><span class="agch-ac__value">${h.ac}</span><span class="agch-ac__label">AC</span></div></div>
      <div class="agch-doll__row">${col(BOTTOM_SLOTS)}</div>
    </div>
    <div class="agch-doll__col">${col(RIGHT_SLOTS)}</div>
    ${pop}
  </section>`;
}

const tile = (label, value, {extra = '', title = ''} = {}) => `<div class="agch-tile"${title ? ` title="${esc(title)}"` : ''}><span class="agch-tile__label">${esc(label)}</span>${value}${extra}</div>`;

function hpHtml(h, off) {
  const hp = h.hp, max = Math.max(1, hp.effectiveMax);
  const pct = Math.max(0, Math.min(100, hp.value / max * 100)), tempPct = Math.max(0, Math.min(100 - pct, hp.temp / max * 100));
  const field = (key, value, label) => `<label class="agch-hp__field"><span>${label}</span><input type="number" step="1" data-edit="hp.${key}" value="${value}" aria-label="${esc(label === 'HP' ? 'Current' : label)} hit points"${off ? ' disabled' : ''}></label>`;
  return `<div class="agch-hp" role="group" aria-label="Hit points">
    <div class="agch-hp__bar" role="meter" aria-valuemin="0" aria-valuemax="${hp.effectiveMax}" aria-valuenow="${hp.value}" aria-label="Hit points">
      <span class="agch-hp__fill" style="width:${pct.toFixed(1)}%"></span><span class="agch-hp__temp" style="left:${pct.toFixed(1)}%;width:${tempPct.toFixed(1)}%"></span>
      <span class="agch-hp__text">${hp.value} / ${hp.effectiveMax} HP${hp.temp ? ` · +${hp.temp} temp` : ''}</span></div>
    <div class="agch-hp__row">${field('value', hp.value, 'HP')}${field('temp', hp.temp, 'Temp')}${field('tempmax', hp.tempmax, 'Max adj.')}
      <span class="agch-hp__adjust"><input type="number" min="0" step="1" class="agch-hp__amount" data-hp-amount placeholder="0" aria-label="Amount"${off ? ' disabled' : ''}>
      ${btn('hp-damage', 'Damage', {kind: 'sm', title: 'Damage: temp HP first, then HP', disabled: off})}${btn('hp-heal', 'Heal', {kind: 'sm', title: 'Heal up to max HP', disabled: off})}</span></div>
    ${hp.value <= 0 ? btn('roll-death', 'Death save', {kind: 'danger', icon: 'fa-solid fa-skull', disabled: off}) : ''}
  </div>`;
}

function abilitiesHtml(actor, off) {
  const tiles = abilitiesData(actor).map(a => `<div class="agch-abil">
      <button type="button" class="agch-abil__check" data-action="roll-check" data-ability="${esc(a.key)}" title="${esc(a.label)} check" aria-label="${esc(a.label)} check ${signed(a.mod)}, score ${a.value}"${off ? ' disabled' : ''}>
        <span class="agch-abil__key">${esc(String(a.abbr).toUpperCase())}</span><span class="agch-abil__mod">${signed(a.mod)}</span><span class="agch-abil__score">${a.value}</span></button>
      ${btn('roll-save', `Save ${signed(a.save)}`, {extra: `agch-abil__save${a.saveProficient ? ' is-prof' : ''}`, data: {ability: a.key}, title: `${a.label} saving throw${a.saveProficient ? ' (proficient)' : ''}`, disabled: off})}
    </div>`).join('');
  return tiles ? `<div class="agch-abils" role="group" aria-label="Abilities: click for a check, Save for a saving throw">${tiles}</div>` : '';
}

/** Active conditions as name chips (click removes); + shows the others inline to add one. */
function conditionsHtml(h, off, adding) {
  if (!h.conditions.length) return '';
  const active = h.conditions.filter(c => c.active), inactive = h.conditions.filter(c => !c.active);
  const chip = c => `<button type="button" class="agch-chip${c.active ? ' is-active' : ''}" data-action="condition" data-id="${esc(c.id)}" aria-pressed="${c.active}" title="${c.active ? `Remove ${esc(c.label)}` : `Add ${esc(c.label)}`}"${off ? ' disabled' : ''}>${c.img ? `<img src="${esc(c.img)}" alt="">` : ''}${esc(c.label)}${c.active && !off ? '<i class="fa-solid fa-xmark" aria-hidden="true"></i>' : ''}</button>`;
  return `<section class="agch-conds" aria-label="Conditions">
    <span class="agch-tile__label">Conditions</span>
    <div class="agch-chips">${active.map(chip).join('') || '<span class="agch-muted">None</span>'}
      ${off ? '' : btn('cond-add', '', {kind: 'ghost', extra: 'agch-conds__add', icon: adding ? 'fa-solid fa-minus' : 'fa-solid fa-plus', title: adding ? 'Hide conditions' : 'Add a condition'})}</div>
    ${adding && !off ? `<div class="agch-chips agch-conds__list" role="group" aria-label="Add a condition">${inactive.map(chip).join('')}</div>` : ''}
  </section>`;
}

function footHtml(h, off) {
  const exh = h.exhaustion, rests = canSee('rest'), restHidden = hiddenReason('rest');
  const restTip = what => `${what}${restHidden && rests ? ` (hidden from players: ${restHidden})` : ''}`;
  const restBtns = rests ? `${btn('rest', '', {kind: 'ghost', extra: 'agch-restbtn', icon: 'fa-solid fa-mug-hot', data: {type: 'short'}, title: restTip('Short Rest (dnd5e dialog: spend hit dice)'), disabled: off})}${btn('rest', '', {kind: 'ghost', extra: 'agch-restbtn', icon: 'fa-solid fa-campground', data: {type: 'long'}, title: restTip('Long Rest (dnd5e dialog)'), disabled: off})}${restHidden ? '<i class="fa-solid fa-eye-slash agch-muted" aria-hidden="true"></i>' : ''}` : '';
  const hd = h.hd ? `<span title="Hit dice left">Hit Dice <b>${h.hd.value} / ${h.hd.max}</b></span>` : rests ? 'Rest' : '';
  return `<div class="agch-foot">
    ${hd || restBtns ? `<span class="agch-pill">${hd}
      ${restBtns}</span>` : ''}
    <span class="agch-pill">Exhaustion ${btn('exhaustion', '', {kind: 'ghost', icon: 'fa-solid fa-minus', data: {step: -1}, title: 'Reduce exhaustion', disabled: off || exh.value <= 0})}<b>${exh.value} / ${exh.max}</b>${btn('exhaustion', '', {kind: 'ghost', icon: 'fa-solid fa-plus', data: {step: 1}, title: 'Increase exhaustion', disabled: off || exh.value >= exh.max})}</span>
    ${h.resources.map(r => `<span class="agch-pill">${esc(r.label)} <b>${r.value} / ${r.max}</b></span>`).join('')}
  </div>`;
}

/** The whole left column. */
export function characterPanelHtml(ctx) {
  const {actor, editable, sheet} = ctx, off = !editable, h = headerData(actor);
  const classLine = h.classes.length ? h.classes.map(c => `${esc(c.name)} ${c.level}${c.subclass ? ` (${esc(c.subclass)})` : ''}`).join(' / ') : 'No class';
  const walk = h.speeds.find(s => s.key === 'walk') ?? h.speeds[0];
  const otherSpeeds = h.speeds.filter(s => s !== walk).map(s => `${esc(s.label)} ${s.value}`).join(', ');
  return `<aside class="agch-char" aria-label="Character">
    <div class="agch-ident">
      <div class="agch-ident__text"><h2 class="agch-name">${esc(h.name)}</h2><p class="agch-sub">${h.species ? `${esc(h.species)} · ` : ''}${classLine}${h.level ? ` · Level ${h.level}` : ''}</p></div>
      ${btn('inspiration', '', {extra: `agch-insp${h.inspiration ? ' is-active' : ''}`, icon: 'fa-solid fa-star', title: h.inspiration ? 'Inspiration (click to spend)' : 'No inspiration (click to gain)', disabled: off})}
    </div>
    ${canSee('equipment') ? dollHtml(ctx, h) : ''}
    <div class="agch-tiles${canSee('equipment') ? '' : ' agch-tiles--4'}">
      ${canSee('equipment') ? '' : tile('AC', `<span class="agch-tile__value">${h.ac}</span>`, {title: 'Armor Class'})}
      ${tile('Initiative', btn('roll-initiative', signed(h.init), {extra: 'agch-tile__roll', title: 'Roll initiative', disabled: off}))}
      ${tile('Speed', `<span class="agch-tile__value">${walk ? `${walk.value} ${esc(walk.units)}` : '—'}</span>`, {extra: otherSpeeds ? `<span class="agch-tile__more">${otherSpeeds}</span>` : ''})}
      ${tile('Proficiency', `<span class="agch-tile__value">${signed(h.prof)}</span>`)}
    </div>
    ${hpHtml(h, off)}
    ${abilitiesHtml(actor, off)}
    ${conditionsHtml(h, off, sheet?.condAdd === true)}
    ${footHtml(h, off)}
  </aside>`;
}
