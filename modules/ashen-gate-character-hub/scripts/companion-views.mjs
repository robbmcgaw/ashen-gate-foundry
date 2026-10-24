/** Companions tab (0.47.0: a Mount box and a smaller Pet box) and the GM Setup tab (player visibility, look). */
import {esc} from './constants.mjs';
import {btn} from './buttons.mjs';
import {companionBoxes, gearChoices, perkChoices, tierOf, linkableActors, actorStats, legacyItemCompanions} from './companions.mjs';
import {companionRole, COMPANION_ROLES, companionStats, itemGives} from './companion-items.mjs';
import {itemRow} from './items.mjs';
import {cardList} from './cards.mjs';
import {tooltipAttrs, itemUuid} from './tooltips.mjs';
import {PARTS, PRESETS, readVisibility, hiddenReason} from './visibility.mjs';
import {sectionKey, toggleButton, bodyAttrs} from './collapse.mjs';
import {lookSetupCard} from './look.mjs';

const options = (items, placeholder) => `<option value="">${esc(placeholder)}</option>${items.map(i => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('')}`;
const GIVES = {key: 'gives', label: 'Gives', render: r => esc(r.gives || '—')};
const ROLE = {key: 'role', label: 'Kind', render: r => esc(r.roleLabel)};
const NAMES = {pet: {title: 'Pet', lower: 'pet', icon: 'fa-paw', gear: 'clothing'}, mount: {title: 'Mount', lower: 'mount', icon: 'fa-horse', gear: 'gear'}};
/** Items with a tier show it beside the name ("Name (Tier)"); the rest show the name alone. */
const withTier = item => { const t = tierOf(item); return t ? `${item.name} (${t})` : item.name; };

/** Perk rows (mount-perk / pet-perk) for the active companion: what each gives, Detach. */
function perkList(box, off) {
  if (!box.perks.length) return '';
  const rows = box.perks.map(i => ({...itemRow(i), gives: itemGives(i), roleLabel: companionRole(i) ? COMPANION_ROLES[companionRole(i)].label : 'Perk'}));
  return cardList(rows, [ROLE, GIVES], {listKey: `companion-${box.kind}`, card: r => ({controls: btn('companion-detach', 'Detach', {kind: 'sm', icon: 'fa-solid fa-link-slash', data: {kind: box.kind, id: r.id}, title: `Take ${r.name} off ${box.active.name} (it stays on the character)`, disabled: off})})});
}

/** The stats box: everything the socketed gear and perks give, from their own Active Effects and armour values (display only). */
function statsBox(box, owner) {
  const {lines, warnings} = companionStats([...box.gearItems, ...box.perks], {owner});
  const rows = lines.map(l => `<div class="agch-kv__row"><dt>${esc(l.label)}</dt><dd>${l.total !== null ? `<strong>${l.total >= 0 ? '+' : '−'}${Math.abs(l.total)}</strong> ` : ''}${l.parts.map(pt => `${esc(pt.text)} <span class="agch-muted">(${esc(pt.source)})</span>`).join(', ')}</dd></div>`).join('');
  return `<section class="agch-stats" aria-label="What ${esc(box.active.name)} gets">
    <h4 class="agch-subheading">${box.kind === 'mount' ? 'From gear and perks' : 'From clothing and perks'}</h4>
    ${rows ? `<dl class="agch-kv">${rows}</dl>` : '<p class="agch-muted">Nothing yet. Bonuses show here from the items\' own effects.</p>'}
    ${warnings.map(w => `<p class="ag-notice ag-notice--warn agch-notice" role="note"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${esc(w)}</p>`).join('')}</section>`;
}

/** One socket: label, the gear in it (icon, name, every bonus it gives, remove) or an empty slot with a keyboard picker. */
function socketHtml(box, socket, choices, off) {
  const kind = box.kind, n = NAMES[kind], drop = off ? '' : ` data-drop-companion="socket" data-kind="${kind}" data-socket="${esc(socket.key)}"`;
  if (socket.item) {
    const item = socket.item, gives = itemGives(item);
    return `<li class="agch-socketbox is-filled"${drop}><span class="agch-socketbox__label">${esc(socket.label)}</span>
      <button type="button" class="agch-socketbox__item" data-action="item-sheet" data-id="${esc(item.id)}" data-ag-always${tooltipAttrs(itemUuid(item), item.name)} aria-label="${esc(socket.label)}: ${esc(item.name)}. Open"><img src="${esc(item.img)}" alt=""><span class="agch-socketbox__text"><span>${esc(withTier(item))}</span><span class="agch-muted">${esc(gives || 'No bonuses listed')}</span></span></button>
      ${btn('companion-unsocket', 'Remove', {kind: 'ghost', extra: 'ag-btn--sm', icon: 'fa-solid fa-xmark', data: {kind, socket: socket.key}, title: `Take ${item.name} out of the ${socket.label} socket (it stays on the character)`, disabled: off})}</li>`;
  }
  const marked = choices.filter(c => c.marked).map(c => c.item), other = choices.filter(c => !c.marked).map(c => c.item);
  const group = (label, list) => list.length ? `<optgroup label="${esc(label)}">${list.map(i => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('')}</optgroup>` : '';
  return `<li class="agch-socketbox is-empty"${drop}><span class="agch-socketbox__label">${esc(socket.label)}</span>
    <span class="agch-socketbox__empty"><i class="fa-solid fa-circle-dot" aria-hidden="true"></i> Empty</span>
    ${off || !choices.length ? '' : `<select data-edit="companion-gear" data-kind="${kind}" data-socket="${esc(socket.key)}" aria-label="Add gear to the ${esc(socket.label)} socket"><option value="">Add gear…</option>${group(`Marked as ${n.lower} ${n.gear}`, marked)}${group('Other items on this character', other)}</select>`}</li>`;
}

/** Small portrait, name, one-line stats strip from the Actor, Open sheet and Remove. Nothing from a denied Actor shows. */
function activeHead(box, off) {
  const e = box.active, n = NAMES[box.kind], stats = e.actor ? actorStats(e.actor) : [];
  const art = e.art ? `<img src="${esc(e.art)}" alt="">` : `<i class="fa-solid ${n.icon} agch-companion__fallback" aria-hidden="true"></i>`;
  const open = e.actor ? btn('companion-open', 'Open sheet', {kind: 'sm', icon: 'fa-solid fa-up-right-from-square', data: {uuid: e.uuid}, title: `Open ${e.actor.name}'s sheet`, always: true}) : '';
  return `<div class="agch-cbox__who"><div class="agch-companion__art agch-companion__art--small">${art}</div>
    <div class="agch-companion__id"><p class="agch-cbox__name">${esc(e.name)}</p>
      ${stats.length ? `<p class="agch-cbox__stats">${stats.map(x => `<span><span class="agch-muted">${esc(x.label)}</span> ${esc(x.value)}</span>`).join('')}</p>` : ''}</div></div>
    ${e.denied ? '<p class="ag-notice ag-notice--warn agch-notice" role="note"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> This companion is not shared with you any more, so its sheet and stats are hidden. Remove it, or ask the GM to share it again.</p>' : ''}
    ${e.missing ? '<p class="ag-notice ag-notice--warn agch-notice" role="note"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> The linked Actor is gone. Remove this companion, or ask the GM.</p>' : ''}
    <div class="agch-cbox__buttons">${open}${btn('companion-remove', 'Remove…', {kind: 'danger', extra: 'ag-btn--sm', icon: 'fa-solid fa-trash', data: {kind: box.kind, uuid: e.uuid}, title: `Stop using ${e.name} as your ${n.lower} (the Actor is kept)`, disabled: off})}</div>`;
}

function boxHtml(box, {actor, off, listId}) {
  const kind = box.kind, n = NAMES[kind], choices = gearChoices(actor, kind), perks = perkChoices(actor, kind), actors = off ? [] : linkableActors(actor, kind);
  const others = box.others.map(e => `<option value="${esc(e.uuid)}">${esc(e.name)}</option>`).join('');
  const active = box.active ? `<option value="${esc(box.active.uuid)}" selected>${esc(box.active.name)}</option>` : '';
  const select = `<label class="agch-cbox__pick"><span>Active ${n.lower}</span><select data-edit="companion-active" data-kind="${kind}" aria-label="Choose your active ${n.lower}"${off ? ' disabled' : ''}><option value=""${box.active ? '' : ' selected'}>${box.active ? `No ${n.lower}` : `Choose a ${n.lower}…`}</option>${active}${others}</select></label>`;
  const link = off ? '' : `<div class="agch-cbox__link"><input type="search" class="agch-linkfind" list="${listId}" data-link-find data-kind="${kind}" placeholder="Find an Actor by name…" aria-label="Find a ${n.lower} Actor by name" autocomplete="off"><datalist id="${listId}">${actors.map(a => `<option value="${esc(a.name)}"></option>`).join('')}</datalist>
    ${actors.length ? `<select data-edit="companion-link" data-kind="${kind}" aria-label="Link a ${n.lower} Actor"><option value="">or link a world Actor…</option>${actors.map(a => `<option value="${esc(a.uuid)}">${esc(a.name)}</option>`).join('')}</select>` : ''}</div>`;
  const body = box.active ? `${activeHead(box, off)}${select}${link}
    <h4 class="agch-subheading">Sockets</h4><ul class="agch-sockets" role="group" aria-label="${esc(n.title)} sockets">${box.sockets.map(s => socketHtml(box, s, choices, off)).join('')}</ul>
    ${perkList(box, off)}
    ${off || !perks.length ? '' : `<label class="agch-cbox__pick"><span>${esc(n.title)} perk</span><select data-edit="companion-perk" data-kind="${kind}" aria-label="Give ${esc(box.active.name)} a perk">${options(perks, 'Add a perk…')}</select></label>`}
    ${statsBox(box, actor)}`
    : `<div class="ag-empty"><p class="ag-empty__title">No ${n.lower} yet.</p><p class="ag-empty__text">Drop a ${n.lower} Actor here or choose one.</p></div>${box.others.length ? select : ''}${link}`;
  return `<section class="ag-card agch-cbox agch-cbox--${kind}" aria-label="${esc(n.title)}"${off ? '' : ` data-drop-companion="box" data-kind="${kind}"`}>
    <h3 class="agch-sec__head"><i class="fa-solid ${n.icon}" aria-hidden="true"></i> ${esc(n.title)}</h3>${body}
    ${off ? '' : `<p class="agch-muted agch-hint"><i class="fa-solid fa-hand" aria-hidden="true"></i> Drop a ${n.lower} Actor on the box${box.active ? `, or ${n.gear} on a socket` : ''}.</p>`}</section>`;
}

/** Older Item companions (from before 0.47.0) stay in saved data; they are listed here, read only. */
function olderCompanions(actor) {
  const old = legacyItemCompanions(actor);
  if (!old.length) return '';
  const key = sectionKey('companions', 'older');
  return `<section class="ag-card"><h3 class="agch-sec__head">${toggleButton(key, `Older companions <span class="ag-badge">${old.length}</span>`)}</h3><div${bodyAttrs(key)}>
    <p class="agch-muted">These pets and mounts were saved as items before 0.47.0. They are kept and not deleted, but the boxes above use Actors now. Link an Actor to replace one.</p>
    <ul class="agch-older">${old.map(e => `<li><span class="ag-badge">${e.kind === 'mount' ? 'Mount' : 'Pet'}</span> ${esc(e.name || e.item.name)}</li>`).join('')}</ul></div></section>`;
}

export function companionsTab({actor, editable, sheet}) {
  const off = !editable, boxes = companionBoxes(actor), id = String(sheet?.id ?? 'agch').replace(/[^A-Za-z0-9_-]/g, '');   // unique per window: two open Hubs must not share a datalist
  return `<div class="agch-cboxes">${boxHtml(boxes.mount, {actor, off, listId: `${id}-linkfind-mount`})}${boxHtml(boxes.pet, {actor, off, listId: `${id}-linkfind-pet`})}</div>
    ${olderCompanions(actor)}
    <p class="agch-muted agch-hint">A pet or mount is a world Actor. You can link many of each; one of each is active. Gear is made of items on this character and stays with its own pet or mount when you switch. Any gear item for a pet or mount fits any of its sockets. The stats box only reads the items' own effects; nothing is applied to the character or the Actor.</p>`;
}

/** GM Setup → Player visibility: one switch per part, quick presets, and why a part is hidden from players right now. */
function visibilityCard() {
  const on = readVisibility();
  const rows = PARTS.map(p => {
    const reason = hiddenReason(p.key, on);
    const status = !reason ? '<span class="ag-badge">Players see it</span>'
      : `<span class="ag-badge ag-badge--warn"><i class="fa-solid fa-eye-slash" aria-hidden="true"></i> Hidden from players: ${esc(reason)}</span>`;
    return `<li><label><input type="checkbox" data-edit="part-visibility" data-part="${esc(p.key)}"${on[p.key] ? ' checked' : ''}> ${esc(p.label)}</label>${status}</li>`;
  }).join('');
  const key = sectionKey('gm', 'visibility');
  return `<section class="ag-card"><h3 class="agch-sec__head">${toggleButton(key, 'Player visibility')}</h3><div${bodyAttrs(key)}>
    <p class="agch-muted">Choose which parts of the Character Hub players see, so you can bring systems in one at a time. You always see everything; hidden parts carry a "Hidden from players" badge. An Ashen Gate part is also hidden from players while its module is not active or its own Player Access is off (change that in the module's own GM Setup). Hiding a part changes no character data. The Hub refuses players' actions in Rests, Equipment slots, Companions, Hotbars and the party stash while they are hidden; items, spells and features stay usable on dnd5e's own sheet.</p>
    <div class="agch-vis__presets"><span class="agch-muted">Quick set:</span>${PRESETS.map(p => btn('visibility-preset', p.label, {kind: 'sm', data: {preset: p.id}})).join('')}</div>
    <ul class="agch-vis">${rows}</ul></div></section>`;
}

/** GM Setup: settings only (player visibility, look). The pet limit was retired in 0.47.0. */
export function gmSetupTab() {
  return `${visibilityCard()}${lookSetupCard()}`;
}
