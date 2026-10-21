/**
 * The left column: the character itself. Portrait with the equipment slots around it (display only), AC, initiative,
 * speed, proficiency, hit points (with hit dice, rests and exhaustion under the bar), the six abilities, conditions and
 * resources. Slots: click opens the item sheet, right-click unequips, the small ⋯ button opens the slot menu
 * (sheet.menu). An empty slot's click opens its Equip… menu. Right-click on a stat opens dnd5e's own configuration
 * window for it (configure.mjs), like the standard sheet.
 */
import {esc, signed, SLOT_PLACEHOLDERS, placeholderKind} from './constants.mjs';
import {btn} from './buttons.mjs';
import {headerData, abilitiesData} from './data.mjs';
import {equipmentLayout, equipChoices, SLOTS, featuresData} from './items.mjs';
import {partyStashUsable} from './partners.mjs';
import {canSee, hiddenReason, hiddenBadge} from './visibility.mjs';
import {configAttrs} from './configure.mjs';
import {toggleButton, bodyAttrs} from './collapse.mjs';
import {tooltipAttrs} from './tooltips.mjs';
import {strainHtml} from './cinders.mjs';

export const LEFT_SLOTS = ['head', 'neck', 'back', 'body', 'hands'];
export const RIGHT_SLOTS = ['mainhand', 'offhand', 'waist', 'feet', 'bracer'];
export const BOTTOM_SLOTS = ['ring1', 'ring2', 'trinket', 'trinket2', 'trinket3'];
/** Slots that trade places with each other ("Swap"). */
export const SLOT_PAIRS = {mainhand: 'offhand', offhand: 'mainhand', ring1: 'ring2', ring2: 'ring1'};

/** Empty-slot placeholder from the SLOT_PLACEHOLDERS table in constants.mjs: an icon, an image or a short word. */
export function placeholder(id) {
  const v = SLOT_PLACEHOLDERS[id] ?? id, kind = placeholderKind(v);
  if (kind === 'icon') return `<i class="${esc(v)} agch-slot__icon" aria-hidden="true"></i>`;
  if (kind === 'silhouette') return `<span class="agch-slot__mask" style="--agch-mask: url('${esc(v).replace(/'/g, '%27')}')" aria-hidden="true"></span>`;
  if (kind === 'image') return `<img class="agch-slot__ph" src="${esc(v)}" alt="">`;
  return `<span class="agch-slot__empty">${esc(v)}</span>`;
}
const slotLabel = id => SLOTS.find(s => s.id === id)?.label ?? id;

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

const menuHead = (title, sub = '') => `<header class="agch-menu__head"><strong>${esc(title)}</strong>${sub}${btn('menu-close', '', {kind: 'ghost', icon: 'fa-solid fa-xmark', title: 'Close', always: true})}</header>`;

/** The open slot menu: the equipped item's actions, or Equip… choices for an empty slot. */
function slotMenu(actor, slotId, layout, off) {
  const s = layout.slots.find(x => x.id === slotId);
  if (!s) return '';
  if (s.item) return menuHead(s.item.name, `<span class="agch-muted">${esc(s.label)}${s.item.attuned ? ' · Attuned' : ''}</span>`) + itemControls(s.item, slotId, layout, off);
  const choices = equipChoices(actor, slotId);
  return menuHead(`${s.label}: empty`) + (choices.length
    ? `<span class="agch-muted">Equip…</span>${choices.map(c => menuBtn('slot-equip', c.name, {data: {id: c.id, slot: slotId}, disabled: off})).join('')}`
    : '<p class="agch-muted">No carried item fits here.</p>');
}

/** One slot: the square (click = open sheet, right-click = unequip) and a small ⋯ button for the menu. */
function slotHtml(id, layout, menu) {
  const open = menu === `slot:${id}`;
  const s = layout.slots.find(x => x.id === id), item = s?.item;
  if (!item) return `<div class="agch-slotwrap"><button type="button" class="ag-slot agch-slot is-empty${open ? ' is-open is-active' : ''}" data-action="slot-menu" data-slot="${id}" data-ag-always
    aria-haspopup="menu" aria-expanded="${open}" aria-label="${esc(s.label)}: empty, equip" data-tooltip="${esc(s.label)}: empty (click to equip)">${placeholder(id)}</button></div>`;
  const tip = `${item.name}${item.attuned ? ' (attuned)' : ''}`;
  const more = `<button type="button" class="agch-slot__more" data-action="slot-menu" data-slot="${id}" data-ag-always aria-haspopup="menu" aria-expanded="${open}" data-tooltip="More for ${esc(s.label)}" aria-label="More actions: ${esc(s.label)}"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button>`;
  return `<div class="agch-slotwrap"><button type="button" class="ag-slot agch-slot is-filled${item.attuned ? ' is-attuned' : ''}${item.rarity ? ' has-rarity' : ''}${open ? ' is-open is-active' : ''}" data-action="slot-open" data-slot="${id}" data-id="${esc(item.id)}" data-ag-always${item.rarity ? ` data-rarity="${item.rarity}"` : ''}
    aria-label="${esc(s.label)}: ${esc(tip)}. Click to open, right-click to unequip"${tooltipAttrs(item.uuid, `${tip} (click: open, right-click: unequip)`)}><img src="${esc(item.img)}" alt=""></button>${more}</div>`;
}

/** Below the rings and trinkets: every equipped item not in a slot, in a list that folds open. */
function otherHtml(layout, menu, off) {
  const n = layout.other.length, key = 'doll:other';
  const rows = layout.other.map(r => {
    const open = menu === `other:${r.id}`;
    return `<li class="agch-other__row${r.rarity ? ' has-rarity ag-rarity-edge' : ''}"${r.rarity ? ` data-rarity="${r.rarity}"` : ''}>
      <img src="${esc(r.img)}" alt=""><button type="button" class="agch-other__name" data-action="slot-open" data-id="${esc(r.id)}" data-ag-always${tooltipAttrs(r.uuid, `${r.name} (click: open, right-click: unequip)`)}>${esc(r.name)}${r.attuned ? ' <i class="fa-solid fa-sun agch-other__att" data-tooltip="Attuned" aria-label="Attuned"></i>' : ''}</button>
      <button type="button" class="agch-slot__more is-shown" data-action="other-menu" data-id="${esc(r.id)}" data-ag-always aria-haspopup="menu" aria-expanded="${open}" data-tooltip="More for ${esc(r.name)}" aria-label="More actions: ${esc(r.name)}"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button>
      ${open ? `<div class="agch-menu agch-menu--inline" role="menu" aria-label="${esc(r.name)}">${menuHead(r.name)}${itemControls(r, 'other', layout, off)}</div>` : ''}</li>`;
  }).join('');
  return `<div class="agch-other">${toggleButton(key, `Other equipped <span class="ag-badge">${n}</span>`)}
    <ul class="agch-other__list"${bodyAttrs(key)}>${rows || '<li class="agch-muted">Equipped items that don\'t fit a slot show here.</li>'}</ul></div>`;
}

function dollHtml(ctx, h) {
  const {actor, editable, sheet} = ctx, off = !editable, layout = equipmentLayout(actor), menu = sheet?.menu ?? null;
  const token = sheet?.dollArt === 'token';
  const art = token ? (actor.prototypeToken?.texture?.src || actor.img) : actor.img;
  const col = ids => ids.map(id => slotHtml(id, layout, menu)).join('');
  const openSlot = typeof menu === 'string' && menu.startsWith('slot:') ? menu.slice(5) : null;
  const where = !openSlot ? '' : LEFT_SLOTS.includes(openSlot) ? `is-left" style="--row:${LEFT_SLOTS.indexOf(openSlot)}` : RIGHT_SLOTS.includes(openSlot) ? `is-right" style="--row:${RIGHT_SLOTS.indexOf(openSlot)}` : 'is-bottom';
  const pop = openSlot && BOTTOM_SLOTS.concat(LEFT_SLOTS, RIGHT_SLOTS).includes(openSlot) ? `<div class="agch-menu agch-menu--slot ${where}" role="menu" aria-label="${esc(slotLabel(openSlot))}">${slotMenu(actor, openSlot, layout, off)}</div>` : '';
  return `${hiddenBadge('equipment') ? `<p class="agch-hidden-note">${hiddenBadge('equipment')}</p>` : ''}<section class="agch-doll" aria-label="Equipment (display only)">
    <div class="agch-doll__col">${col(LEFT_SLOTS)}</div>
    <div class="agch-doll__center">
      <div class="agch-doll__art${off ? '' : ' is-editable'}"${off ? '' : ` data-art-edit="${token ? 'token' : 'portrait'}" data-tooltip="Double-click to change ${token ? 'token art' : 'portrait'}"`}><img class="agch-doll__bg" src="${esc(art)}" alt="" aria-hidden="true"><img class="agch-doll__fg" src="${esc(art)}" alt="${esc(actor.name)}">
        ${btn('doll-art', token ? 'Portrait' : 'Token art', {kind: 'sm', extra: 'agch-doll__toggle', title: token ? 'Show portrait' : 'Show token art', always: true})}
        <div class="agch-ac" data-tooltip="Armor Class${off ? '' : ' (right-click to configure)'}"${off ? '' : configAttrs('armorClass')}><span class="agch-ac__value">${h.ac}</span><span class="agch-ac__label">AC</span></div></div>
    </div>
    <div class="agch-doll__col">${col(RIGHT_SLOTS)}</div>
    <div class="agch-doll__row">${col(BOTTOM_SLOTS)}</div>
    ${pop}
  </section>${otherHtml(layout, menu, off)}`;
}

const tile = (label, value, {extra = '', title = '', attrs = ''} = {}) => `<div class="agch-tile"${title ? ` data-tooltip="${esc(title)}"` : ''}${attrs}><span class="agch-tile__label">${esc(label)}</span>${value}${extra}</div>`;

/**
 * Health band of the HP fill colour, as a share of the effective max (max + max adjustment; temp HP doesn't count).
 * Integer maths, so the edges are exact: 70% and up is 'high' (green), 30% and up 'mid' (yellow), else 'low' (red).
 */
export function hpBand(value, effectiveMax) {
  const v = Math.max(0, Math.trunc(Number(value) || 0)), eff = Math.trunc(Number(effectiveMax) || 0);
  if (eff <= 0) return 'low';
  return v * 100 >= 70 * eff ? 'high' : v * 100 >= 30 * eff ? 'mid' : 'low';
}

/**
 * The HP bar's pieces as percentages of the bar. The bar is the larger of normal max and effective max (max + max
 * adjustment). A positive max adjustment is the blue frame at the right end; a negative one is the olive "lost" part
 * at the right end. Temp HP is the silver overshield after the current HP (pushed back when it would not fit, and
 * never into the lost part). The temp and lost/boost texts always show, so neither change hides the other.
 */
export function hpBar(hp) {
  const max = Math.max(0, Number(hp.max) || 0), adj = Number(hp.tempmax) || 0;
  const eff = Number.isFinite(Number(hp.effectiveMax)) && hp.effectiveMax !== undefined && hp.effectiveMax !== null ? Number(hp.effectiveMax) : max + adj;
  const scale = Math.max(1, eff, max);
  const value = Math.max(0, Number(hp.value) || 0), temp = Math.max(0, Number(hp.temp) || 0);
  const pct = x => Math.max(0, Math.min(100, x / scale * 100));
  const fill = pct(value), tempW = pct(temp), boostW = adj > 0 ? pct(adj) : 0, lostW = adj < 0 ? pct(-adj) : 0;
  const room = 100 - lostW, tempLeft = Math.max(0, Math.min(fill, room - tempW));
  return {fill, temp: Math.min(tempW, room - tempLeft), tempLeft, boost: boostW, boostLeft: 100 - boostW, lost: lostW, lostLeft: room,
    band: hpBand(value, eff), text: `${value} / ${eff} HP`, tempText: temp > 0 ? `(+${temp} TEMP)` : '',
    boostText: adj > 0 ? `(+${adj} MAX)` : '', lostText: adj < 0 ? `(−${-adj} MAX)` : ''};
}

/**
 * The bar itself. Layers, bottom to top: track, fill, reduced max, temp, raised-max frame, text (DOM order matches the
 * CSS z-index), so temp HP and a max change always show together.
 */
export function hpBarHtml(hp, off = false) {
  const b = hpBar(hp), f = n => n.toFixed(1);
  const tip = off ? 'Hit points' : 'Hit points: double-click to edit, right-click for dnd5e\'s hit point settings';
  return `<div class="agch-hp__bar${off ? '' : ' is-editable'}" data-hp-bar data-band="${b.band}"${off ? '' : ` tabindex="0"${configAttrs('hitPoints')}`} role="meter" aria-valuemin="0" aria-valuemax="${hp.effectiveMax}" aria-valuenow="${hp.value}" aria-label="${esc(`${b.text} ${b.tempText} ${b.boostText} ${b.lostText}`.replace(/\s+/g, ' ').trim())}" data-tooltip="${esc(tip)}">
      <span class="agch-hp__fill" style="width:${f(b.fill)}%"></span>${b.lost ? `<span class="agch-hp__lost" style="left:${f(b.lostLeft)}%;width:${f(b.lost)}%"></span>` : ''}${b.temp ? `<span class="agch-hp__temp" style="left:${f(b.tempLeft)}%;width:${f(b.temp)}%"></span>` : ''}${b.boost ? `<span class="agch-hp__boost" style="left:${f(b.boostLeft)}%;width:${f(b.boost)}%"></span>` : ''}
      <span class="agch-hp__text">${esc(b.text)}${b.tempText ? ` <span class="agch-hp__temptext">${esc(b.tempText)}</span>` : ''}${b.boostText ? ` <span class="agch-hp__boosttext">${esc(b.boostText)}</span>` : ''}${b.lostText ? ` <span class="agch-hp__losttext">${esc(b.lostText)}</span>` : ''}</span></div>`;
}

/** Double-click on the bar: a small editor for current, temp and max adjustment (one update on Apply). */
function hpEditor(hp) {
  const field = (key, label, value, min) => `<label class="agch-hpedit__field"><span>${label}</span><input type="number" step="1"${min !== null ? ` min="${min}"` : ''} data-hpedit="${key}" value="${value}"></label>`;
  return `<div class="agch-menu agch-hpedit" role="dialog" aria-label="Edit hit points">
    ${menuHead('Hit points')}
    <div class="agch-hpedit__fields">${field('value', 'Current', hp.value, 0)}${field('temp', 'Temp', hp.temp, 0)}${field('tempmax', 'Max adj.', hp.tempmax, null)}</div>
    <footer class="agch-hpedit__foot">${btn('menu-close', 'Cancel', {kind: 'ghost', always: true})}${btn('hp-apply', 'Apply', {kind: 'primary', icon: 'fa-solid fa-check'})}</footer></div>`;
}

function hitDiceHtml(h, off) {
  const rests = canSee('rest'), restHidden = hiddenReason('rest');
  const restTip = what => `${what}${restHidden && rests ? ` (hidden from players: ${restHidden})` : ''}`;
  const restBtns = rests ? `${btn('rest', '', {kind: 'ghost', extra: 'agch-restbtn', icon: 'fa-solid fa-mug-hot', data: {type: 'short'}, title: restTip('Short Rest (dnd5e dialog: spend hit dice)'), disabled: off})}${btn('rest', '', {kind: 'ghost', extra: 'agch-restbtn', icon: 'fa-solid fa-campground', data: {type: 'long'}, title: restTip('Long Rest (dnd5e dialog)'), disabled: off})}${restHidden ? '<i class="fa-solid fa-eye-slash agch-muted" aria-hidden="true"></i>' : ''}` : '';
  const hd = h.hd ? `<span class="agch-hd" data-tooltip="Hit Dice left${off ? '' : ' (right-click to configure)'}"${off ? '' : configAttrs('hitDice')}><i class="fa-solid fa-dice-d20" aria-hidden="true"></i><span class="agch-vh">Hit Dice</span> <b>${h.hd.value} / ${h.hd.max}</b></span>` : '';
  return hd || restBtns ? `<span class="ag-badge agch-pill agch-pill--hd">${hd}${restBtns}</span>` : '';
}
/** Exhaustion on one line: a skull, − level +. */
function exhaustionHtml(h, off) {
  const exh = h.exhaustion;
  return `<span class="ag-badge agch-pill agch-pill--exh${exh.value ? ' is-on' : ''}" data-tooltip="Exhaustion ${exh.value} of ${exh.max}"><i class="fa-solid fa-skull" aria-hidden="true"></i><span class="agch-vh">Exhaustion</span>${btn('exhaustion', '', {kind: 'ghost', icon: 'fa-solid fa-minus', data: {step: -1}, title: 'Reduce exhaustion', disabled: off || exh.value <= 0})}<b>${exh.value}</b>${btn('exhaustion', '', {kind: 'ghost', icon: 'fa-solid fa-plus', data: {step: 1}, title: 'Increase exhaustion', disabled: off || exh.value >= exh.max})}</span>`;
}

/** Class, species and background as one small card at the top (they rarely change). Click one to open its sheet. */
function identityCard(actor) {
  const rows = featuresData(actor).identity;
  if (!rows.length) return '';
  return `<section class="agch-idcard" aria-label="Class, species and background">${rows.map(r => `<button type="button" class="agch-idcard__item" data-action="item-sheet" data-id="${esc(r.id)}" data-ag-always${tooltipAttrs(r.uuid, `Open ${r.name}`)}>
    <img src="${esc(r.img)}" alt=""><span class="agch-idcard__text"><span class="agch-idcard__name">${esc(r.name)}</span><span class="agch-idcard__detail">${esc(r.detail)}</span></span></button>`).join('')}</section>`;
}

function hpHtml(h, off, menu) {
  const hp = h.hp;
  return `<div class="agch-hp" role="group" aria-label="Hit points">
    ${hpBarHtml(hp, off)}
    ${menu === 'hp' && !off ? hpEditor(hp) : ''}
    <div class="agch-hp__row">
      <span class="agch-hp__adjust" role="group" aria-label="Damage or heal">${btn('hp-damage', '', {kind: 'sm', icon: 'fa-solid fa-minus', title: 'Damage: subtract the amount (temp HP first, then HP)', disabled: off})}<input type="number" min="0" step="1" class="agch-hp__amount" data-hp-amount placeholder="0" aria-label="Amount to add or subtract"${off ? ' disabled' : ''}>${btn('hp-heal', '', {kind: 'sm', icon: 'fa-solid fa-plus', title: 'Heal: add the amount (up to max HP)', disabled: off})}</span>
      ${hitDiceHtml(h, off)}${exhaustionHtml(h, off)}</div>
    ${hp.value <= 0 ? `<span${off ? '' : configAttrs('death')}>${btn('roll-death', 'Death save', {icon: 'fa-solid fa-dice-d20', title: off ? 'Death save' : 'Death save (right-click to configure)', disabled: off})}</span>` : ''}
  </div>`;
}

function abilitiesHtml(actor, off) {
  const tiles = abilitiesData(actor).map(a => `<div class="agch-abil"${off ? '' : configAttrs('ability', a.key)}>
      <button type="button" class="agch-abil__check" data-action="roll-check" data-ability="${esc(a.key)}" data-tooltip="${esc(a.label)} check${off ? '' : ' (right-click to configure)'}" aria-label="${esc(a.label)} check ${signed(a.mod)}, score ${a.value}"${off ? ' disabled' : ''}>
        <span class="agch-abil__key">${esc(String(a.abbr).toUpperCase())}</span><span class="agch-abil__mod">${signed(a.mod)}</span><span class="agch-abil__score">${a.value}</span></button>
      ${btn('roll-save', `Save ${signed(a.save)}`, {extra: `agch-abil__save${a.saveProficient ? ' is-prof' : ''}`, data: {ability: a.key}, title: `${a.label} saving throw${a.saveProficient ? ' (proficient)' : ''}`, disabled: off})}
    </div>`).join('');
  return tiles ? `<div class="agch-abils" role="group" aria-label="Abilities: click for a check, Save for a saving throw">${tiles}</div>` : '';
}

/** Active conditions as name chips (click removes); + shows the others inline to add one. */
function conditionsHtml(h, off, adding) {
  if (!h.conditions.length) return '';
  const active = h.conditions.filter(c => c.active), inactive = h.conditions.filter(c => !c.active);
  const chip = c => `<button type="button" class="ag-chip agch-chip${c.active ? ' is-active' : ''}" data-action="condition" data-id="${esc(c.id)}" aria-pressed="${c.active}" data-tooltip="${c.active ? `Remove ${esc(c.label)}` : `Add ${esc(c.label)}`}"${off ? ' disabled' : ''}>${c.img ? `<img src="${esc(c.img)}" alt="">` : ''}${esc(c.label)}${c.active && !off ? '<i class="fa-solid fa-xmark" aria-hidden="true"></i>' : ''}</button>`;
  return `<section class="agch-conds" aria-label="Conditions">
    <span class="agch-tile__label">Conditions</span>
    <div class="agch-chips">${active.map(chip).join('') || '<span class="agch-muted">None</span>'}
      ${off ? '' : btn('cond-add', '', {kind: 'ghost', extra: 'agch-conds__add', icon: adding ? 'fa-solid fa-minus' : 'fa-solid fa-plus', title: adding ? 'Hide conditions' : 'Add a condition'})}</div>
    ${adding && !off ? `<div class="agch-chips agch-conds__list" role="group" aria-label="Add a condition">${inactive.map(chip).join('')}</div>` : ''}
  </section>`;
}

/** Resources (Ki and the like) as small pills. */
function footHtml(h) {
  return h.resources.length ? `<div class="agch-foot">${h.resources.map(r => `<span class="ag-badge agch-pill">${esc(r.label)} <b>${r.value} / ${r.max}</b></span>`).join('')}</div>` : '';
}

/** The whole left column. */
export function characterPanelHtml(ctx) {
  const {actor, editable, sheet} = ctx, off = !editable, h = headerData(actor);
  const classLine = h.classes.length ? h.classes.map(c => `${esc(c.name)} ${c.level}${c.subclass ? ` (${esc(c.subclass)})` : ''}`).join(' / ') : 'No class';
  const walk = h.speeds.find(s => s.key === 'walk') ?? h.speeds[0];
  const otherSpeeds = h.speeds.filter(s => s !== walk).map(s => `${esc(s.label)} ${s.value}`).concat(h.hover ? ['Hover'] : []).join(', ');
  const cfg = (kind, key) => off ? '' : configAttrs(kind, key);
  const rc = off ? '' : ' (right-click to configure)';
  return `<aside class="agch-char" aria-label="Character">
    <div class="agch-ident">
      <div class="agch-ident__text"><h2 class="agch-name">${esc(h.name)}</h2><p class="agch-sub">${featuresData(actor).identity.length ? (h.level ? `Level ${h.level}` : '') : `${h.species ? `${esc(h.species)} · ` : ''}${classLine}${h.level ? ` · Level ${h.level}` : ''}`}</p></div>
      ${btn('inspiration', '', {extra: `agch-insp${h.inspiration ? ' is-active' : ''}`, icon: 'fa-solid fa-star', title: h.inspiration ? 'Inspiration (click to spend)' : 'No inspiration (click to gain)', disabled: off})}
    </div>
    ${identityCard(actor)}
    ${canSee('equipment') ? dollHtml(ctx, h) : ''}
    <div class="agch-tiles${canSee('equipment') ? '' : ' agch-tiles--4'}">
      ${canSee('equipment') ? '' : tile('AC', `<span class="agch-tile__value">${h.ac}</span>`, {title: `Armor Class${rc}`, attrs: cfg('armorClass')})}
      ${tile('Initiative', btn('roll-initiative', signed(h.init), {extra: 'agch-tile__roll', title: `Roll initiative${rc}`, disabled: off}), {attrs: cfg('initiative')})}
      ${tile('Speed', `<span class="agch-tile__value">${walk ? `${walk.value} ${esc(walk.units)}` : '—'}</span>`, {extra: otherSpeeds ? `<span class="agch-tile__more">${otherSpeeds}</span>` : '', title: `Speed${rc ? ' (right-click to set walk, climb, fly, burrow, swim, jump, hover and units)' : ''}`, attrs: cfg('movement')})}
      ${tile('Proficiency', `<span class="agch-tile__value">${signed(h.prof)}</span>`)}
    </div>
    ${hpHtml(h, off, sheet?.menu ?? null)}
    ${canSee('strain') ? strainHtml(actor, off) : ''}
    ${abilitiesHtml(actor, off)}
    ${conditionsHtml(h, off, sheet?.condAdd === true)}
    ${footHtml(h)}
  </aside>`;
}
