/** Companions tab (0.48.0: a Mount box and up to three Pet boxes) and the GM Setup tab (player visibility, look). */
import {enforcementOn} from './spell-prep.mjs';
import {esc, MODULE_ID} from './constants.mjs';
import {btn} from './buttons.mjs';
import {LABEL_NAME_MAX, LABEL_DESCRIPTION_MAX, KIND_TITLE, TYPE_FLAG, companionKindOf, notACreature, ownedByPlayer, companionBoxes, gearChoices, perkChoices, tierOf, linkableActors, actorStats, legacyItemCompanions, defaultPetSlots, petSlotOverrides, MAX_PET_SLOTS, COMPANION_TYPES} from './companions.mjs';
import {isBackup} from './level-backup.mjs';
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
/** data-slot for a pet box (the mount has none). */
const slotAttr = box => box.kind === 'pet' ? ` data-slot="${box.slot}"` : '';
const slotData = box => box.kind === 'pet' ? {slot: box.slot} : {};
const NAMES = {pet: {title: 'Pet', lower: 'pet', icon: 'fa-paw', gear: 'clothing'}, mount: {title: 'Mount', lower: 'mount', icon: 'fa-horse', gear: 'gear'}};
/** Items with a tier show it beside the name ("Name (Tier)"); the rest show the name alone. */
const withTier = item => { const t = tierOf(item); return t ? `${item.name} (${t})` : item.name; };

/** Perk rows (mount-perk / pet-perk) for the active companion: what each gives, Detach. */
function perkList(box, off) {
  if (!box.perks.length) return '';
  const rows = box.perks.map(i => ({...itemRow(i), gives: itemGives(i), roleLabel: companionRole(i) ? COMPANION_ROLES[companionRole(i)].label : 'Perk'}));
  return cardList(rows, [ROLE, GIVES], {listKey: `companion-${box.kind}`, after: r => box.perkProblems?.[r.id] ? `<li class="agch-perknote" data-perk-problem><p class="ag-notice ag-notice--warn agch-notice" role="note"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${esc(box.perkProblems[r.id])} Use Detach to take it off.</p></li>` : '', card: r => ({controls: btn('companion-detach', 'Detach', {kind: 'sm', icon: 'fa-solid fa-link-slash', data: {kind: box.kind, id: r.id, ...slotData(box)}, title: `Take ${r.name} off ${box.active.name} (it stays on the character)`, disabled: off})})});
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
  const kind = box.kind, n = NAMES[kind], drop = off ? '' : ` data-drop-companion="socket" data-kind="${kind}"${slotAttr(box)} data-socket="${esc(socket.key)}"`;
  if (socket.item) {
    const item = socket.item, gives = itemGives(item);
    return `<li class="agch-socketbox is-filled"${drop}><span class="agch-socketbox__label">${esc(socket.label)}</span>
      <button type="button" class="agch-socketbox__item" data-action="item-sheet" data-id="${esc(item.id)}" data-ag-always${tooltipAttrs(itemUuid(item), item.name)} aria-label="${esc(socket.name)}: ${esc(item.name)}. Open"><img src="${esc(item.img)}" alt=""><span class="agch-socketbox__text"><span>${esc(withTier(item))}</span><span class="agch-muted">${esc(gives || 'No bonuses listed')}</span></span></button>
      ${socket.problem ? `<p class="ag-notice ag-notice--warn agch-notice agch-socketbox__note" role="note" data-socket-problem><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${esc(socket.problem)} Use Remove to take it out.</p>` : ''}
      ${btn('companion-unsocket', 'Remove', {kind: 'ghost', extra: 'ag-btn--sm', icon: 'fa-solid fa-xmark', data: {kind, socket: socket.key, ...slotData(box)}, title: `Take ${item.name} out of the ${socket.name} socket (it stays on the character)`, disabled: off})}</li>`;
  }
  const marked = choices.map(c => c.item), other = [];
  const group = (label, list) => list.length ? `<optgroup label="${esc(label)}">${list.map(i => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('')}</optgroup>` : '';
  return `<li class="agch-socketbox is-empty"${drop}><span class="agch-socketbox__label">${esc(socket.label)}</span>
    <span class="agch-socketbox__empty"><i class="fa-solid fa-circle-dot" aria-hidden="true"></i> Empty</span>
    ${off || !choices.length ? '' : `<select data-edit="companion-gear" data-kind="${kind}"${slotAttr(box)} data-socket="${esc(socket.key)}" aria-label="Add gear to the ${esc(socket.name)} socket"><option value="">Add gear…</option>${group(`Marked as ${n.lower} ${n.gear}`, marked)}</select>`}</li>`;
}

/** Inline editor for the player's own name and description. The draft lives on the window until Save or Cancel. */
function labelForm(e, edit) {
  const dirty = edit.name !== e.customName || edit.description !== e.description;
  return `<form class="agch-labelform" data-label-form onsubmit="return false">
    <label class="agch-cbox__pick"><span>Name</span><input type="text" maxlength="${LABEL_NAME_MAX}" value="${esc(edit.name)}" placeholder="${esc(e.actorName)}" data-edit="companion-label-field" data-field="name" autofocus></label>
    <label class="agch-cbox__pick"><span>Description</span><textarea rows="3" maxlength="${LABEL_DESCRIPTION_MAX}" data-edit="companion-label-field" data-field="description">${esc(edit.description)}</textarea></label>
    <p class="agch-muted agch-cbox__unsaved" role="status">${dirty ? 'Unsaved changes' : ''}</p>
    <div class="agch-cbox__buttons">${btn('companion-label-cancel', 'Cancel', {kind: 'ghost', extra: 'ag-btn--sm'})}${btn('companion-label-save', 'Save changes', {kind: 'primary', extra: 'ag-btn--sm'})}</div></form>`;
}

/** Small portrait, name, one-line stats strip from the Actor, Open sheet and Remove. Nothing from a denied Actor shows. */
function activeHead(box, off, edit = null) {
  const e = box.active, n = NAMES[box.kind], stats = e.actor ? actorStats(e.actor) : [];
  const art = e.art ? `<img src="${esc(e.art)}" alt="">` : `<i class="fa-solid ${n.icon} agch-companion__fallback" aria-hidden="true"></i>`;
  const open = e.actor ? btn('companion-open', 'Open sheet', {kind: 'sm', icon: 'fa-solid fa-up-right-from-square', data: {uuid: e.uuid}, title: `Open ${e.actor.name}'s sheet`, always: true}) : '';
  return `<div class="agch-cbox__who"><div class="agch-companion__art agch-companion__art--small">${art}</div>
    <div class="agch-companion__id"><p class="agch-cbox__name">${esc(e.name)}</p>
      ${e.customName && e.actor && e.actorName !== e.name ? `<p class="agch-muted agch-cbox__real">${esc(e.actorName)}</p>` : ''}
      ${stats.length ? `<p class="agch-cbox__stats">${stats.map(x => `<span><span class="agch-muted">${esc(x.label)}</span> ${esc(x.value)}</span>`).join('')}</p>` : ''}</div></div>
    ${edit ? labelForm(e, edit) : e.description ? `<p class="agch-cbox__desc">${esc(e.description)}</p>` : ''}
    ${e.denied ? '<p class="ag-notice ag-notice--warn agch-notice" role="note"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> This companion is not shared with you any more, so its sheet and stats are hidden. Remove it, or ask the GM to share it again.</p>' : ''}
    ${e.ineligible ? `<p class="ag-notice ag-notice--warn agch-notice" role="note" data-companion-ineligible><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> <strong>Can't be a companion.</strong> ${esc(e.actorName)} is not a creature (${esc(companionKindOf(e.actor).reason)}). It stays linked until you press Remove…, which only unlinks it and changes nothing on that Actor.</p>` : ''}
    ${e.notOwned ? '<p class="ag-notice ag-notice--warn agch-notice" role="note"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> No longer owned. It stays linked until you clear it, but it is not listed for you automatically.</p>' : ''}
    ${e.missing ? '<p class="ag-notice ag-notice--warn agch-notice" role="note"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> The linked Actor is gone. Remove this companion, or ask the GM.</p>' : ''}
    <div class="agch-cbox__buttons">${open}${off || edit ? '' : btn('companion-label-edit', 'Edit name…', {kind: 'sm', icon: 'fa-solid fa-pen', data: {uuid: e.uuid}, title: `Give ${e.actorName} your own name and description`})}${btn('companion-remove', 'Remove…', {kind: 'danger', extra: 'ag-btn--sm', icon: 'fa-solid fa-trash', data: {kind: box.kind, uuid: e.uuid}, title: `Stop using ${e.name} as your ${n.lower} (the Actor is kept)`, disabled: off})}</div>`;
}

/** The find / link controls, shared by the pet boxes (one row for the whole Pet area) or inside the mount box. */
function linkHtml(actor, kind, listId, off) {
  if (off) return '';
  const n = NAMES[kind], actors = linkableActors(actor, kind);
  return `<div class="agch-cbox__link"><input type="search" class="agch-linkfind" list="${listId}" data-link-find data-kind="${kind}" placeholder="Find an Actor by name…" aria-label="Find a ${n.lower} Actor by name" autocomplete="off"><datalist id="${listId}">${actors.map(a => `<option value="${esc(a.name)}"></option>`).join('')}</datalist>
    ${actors.length ? `<select data-edit="companion-link" data-kind="${kind}" aria-label="Link a ${n.lower} Actor"><option value="">or link a world Actor…</option>${actors.map(a => `<option value="${esc(a.uuid)}">${esc(a.name)}</option>`).join('')}</select>` : ''}</div>`;
}

/** One box: the mount, or one of the pet boxes (pet.slot). */
function boxHtml(box, {actor, off, listId, numbered = false, withLink = true, edit = null}) {
  const kind = box.kind, n = NAMES[kind], perks = perkChoices(actor, kind), sa = slotAttr(box);
  const title = kind === 'pet' && numbered ? `${n.title} ${box.slot + 1}` : n.title;
  const tagged = (name, tag) => tag ? `${name} (${tag})` : name;
  const others = box.others.map(e => `<option value="${esc(e.uuid)}">${esc(tagged(e.name, KIND_TITLE[kind]))}</option>`).join('');
  const active = box.active ? `<option value="${esc(box.active.uuid)}" selected>${esc(tagged(box.active.name, KIND_TITLE[kind]))}</option>` : '';
  const owned = box.available.length ? `<optgroup label="Yours to use">${box.available.map(e => `<option value="${esc(e.uuid)}">${esc(tagged(e.name, e.tag))}</option>`).join('')}</optgroup>` : '';
  const select = `<label class="agch-cbox__pick"><span>Active ${n.lower}: choose which linked ${n.lower} to manage</span><select data-edit="companion-active" data-kind="${kind}"${sa} aria-label="Choose ${kind === 'pet' && numbered ? `the active pet for ${esc(title)}` : `your active ${n.lower}`}"${off ? ' disabled' : ''}><option value=""${box.active ? '' : ' selected'}>${box.active ? 'None' : `Choose a ${n.lower}…`}</option>${active}${others}${owned}</select></label>`;
  const link = withLink ? linkHtml(actor, kind, listId, off) : '';
  const body = box.active ? `${activeHead(box, off, edit && box.active && edit.uuid === box.active.uuid ? edit : null)}${select}${link}
    <h4 class="agch-subheading">Sockets</h4><ul class="agch-sockets" role="group" aria-label="${esc(title)} sockets">${box.sockets.map(x => socketHtml(box, x, gearChoices(actor, kind, x), off)).join('')}</ul>
    ${perkList(box, off)}
    ${off || !perks.length ? '' : `<label class="agch-cbox__pick"><span>${esc(n.title)} perk</span><select data-edit="companion-perk" data-kind="${kind}"${sa} aria-label="Give ${esc(box.active.name)} a perk">${options(perks, 'Add a perk…')}</select></label>`}
    ${statsBox(box, actor)}`
    : `<div class="ag-empty"><p class="ag-empty__title">No ${n.lower} yet.</p><p class="ag-empty__text">Drop a ${n.lower} Actor here or choose one.</p></div>${box.others.length || box.available.length ? select : ''}${link}`;
  return `<section class="ag-card agch-cbox agch-cbox--${kind}" aria-label="${esc(title)}"${off ? '' : ` data-drop-companion="box" data-kind="${kind}"${sa}`}>
    <h3 class="agch-sec__head"><i class="fa-solid ${n.icon}" aria-hidden="true"></i> ${esc(title)}</h3>
    <p class="agch-muted agch-hint agch-cbox__what">The active ${n.lower} is the one you are managing now: its sheet, sockets (${n.lower} ${n.gear} slots) and perks show below. “Yours to use” lists creatures you own that fit.</p>${body}
    ${off ? '' : `<p class="agch-muted agch-hint"><i class="fa-solid fa-hand" aria-hidden="true"></i> Drop a ${n.lower} Actor on the box${box.active ? `, or ${n.gear} on a socket` : ''}.</p>`}</section>`;
}

/** The Pet area: one box per pet slot (up to three) with one find / link row for all of them. */
function petArea(boxes, {actor, off, id, edit}) {
  const {pets, petSlots} = boxes;
  if (!pets.length) return `<section class="ag-card agch-cbox agch-cbox--petnone" aria-label="Pets"><h3 class="agch-sec__head"><i class="fa-solid fa-paw" aria-hidden="true"></i> Pets</h3>
    <div class="ag-empty"><p class="ag-empty__title">No pet slots.</p><p class="ag-empty__text">${esc(actor.name)} has no pet slots. The GM can change that in GM Setup.</p></div></section>`;
  const numbered = pets.length > 1;
  return `<div class="agch-pets" role="group" aria-label="Pets">
    ${off ? '' : `<div class="agch-pets__link">${linkHtml(actor, 'pet', `${id}-linkfind-pet`, off)}</div>`}
    ${pets.map(b => boxHtml(b, {actor, off, listId: '', numbered, withLink: false, edit})).join('')}</div>`;
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
  const off = !editable, boxes = companionBoxes(actor), edit = off ? null : sheet?.labelEdit ?? null, id = String(sheet?.id ?? 'agch').replace(/[^A-Za-z0-9_-]/g, '');   // unique per window: two open Hubs must not share a datalist
  return `<div class="agch-cboxes">${boxHtml(boxes.mount, {actor, off, listId: `${id}-linkfind-mount`, edit})}${petArea(boxes, {actor, off, id, edit})}</div>
    ${olderCompanions(actor)}
    <p class="agch-muted agch-hint">A pet or mount is a world Actor. You can link many of each. One mount and up to ${boxes.petSlots} ${boxes.petSlots === 1 ? 'pet is' : 'pets are'} active at a time; a pet can be active in one pet box only. Gear is made of items on this character and stays with its own pet or mount when you switch. Saddle, Tack, Head and Body items go in their own sockets; items that don't say where they go fit any socket of their kind. The stats box only reads the items' own effects; nothing is applied to the character or the Actor.</p>`;
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

/** GM Setup → Pet slots: the default (0 to 3) and one override per character. */
function petSlotsCard() {
  const def = defaultPetSlots(), over = petSlotOverrides(), counts = [...Array(MAX_PET_SLOTS + 1).keys()];
  const chars = [...(globalThis.game?.actors ?? [])].filter(a => a.type === 'character' && !isBackup(a)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const rows = chars.map(a => `<li><label><span>${esc(a.name)}</span><select data-edit="pet-slot-override" data-actor="${esc(a.id)}" aria-label="Pet slots for ${esc(a.name)}"><option value=""${over[a.id] === undefined ? ' selected' : ''}>Default (${def})</option>${counts.map(n => `<option value="${n}"${over[a.id] === n ? ' selected' : ''}>${n}</option>`).join('')}</select></label></li>`).join('');
  const key = sectionKey('gm', 'petslots');
  return `<section class="ag-card"><h3 class="agch-sec__head">${toggleButton(key, 'Pet slots')}</h3><div${bodyAttrs(key)}>
    <p class="agch-muted">How many pets a character can have active at once, from 0 to 3. Characters can link as many pets as they like; this only limits the pet boxes. Lowering the number never removes a pet: empty extra boxes are hidden and a pet already in an extra box stays until the player clears it.</p>
    <label class="agch-cbox__pick"><span>Default pet slots</span><input type="number" min="0" max="${MAX_PET_SLOTS}" step="1" value="${def}" data-edit="pet-slots-default" aria-label="Default pet slots"></label>
    ${rows ? `<h4 class="agch-subheading">Per character</h4><ul class="agch-vis agch-petslots">${rows}</ul>` : '<p class="agch-muted">No characters yet.</p>'}</div></section>`;
}

export const CTYPE_PAGE = 50;
/**
 * GM Setup → Companion types (0.58.3): the GM's override of what kind of companion an NPC Actor counts as. Rows are grouped (Overrides
 * open; Pets, Mounts and Not companions closed) with counts, 50 shown per group ("Show more"), and Actors that don't matter (people and
 * other non-companions nobody owns) stay behind "Show all NPC Actors (n)". Search reaches every row. The party stash and other
 * non-creatures are never listed unless the GM has put an override on one (so it can be cleared). Display only: the saved flag is unchanged.
 */
function companionTypesCard() {
  const npcs = [...(globalThis.game?.actors ?? [])].filter(a => a.type === 'npc' && !isBackup(a) && (COMPANION_TYPES.includes(a.flags?.[MODULE_ID]?.[TYPE_FLAG]) || !notACreature(a)))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const choices = [['pet', 'Pet'], ['mount', 'Mount'], ['either', 'Either'], ['none', 'None']];
  const groups = [['overrides', 'Overrides', true], ['pets', 'Pets', false], ['mounts', 'Mounts', false], ['none', 'Not companions', false]].map(([id, label, open]) => ({id, label, open, rows: []}));
  const by = Object.fromEntries(groups.map(g => [g.id, g]));
  let hiddenCount = 0;
  for (const a of npcs) {
    const set = a.flags?.[MODULE_ID]?.[TYPE_FLAG], automatic = companionKindOf(a, {automatic: true}), kind = companionKindOf(a).kind, owned = ownedByPlayer(a);
    const gid = COMPANION_TYPES.includes(set) ? 'overrides' : kind === 'mount' ? 'mounts' : kind === 'none' ? 'none' : 'pets';
    const minor = gid === 'none' && !owned;
    if (minor) hiddenCount++;
    const row = `<li data-ctype-row data-name="${esc(String(a.name).toLowerCase())}"${minor ? ' data-minor' : ''}><label><span class="agch-ctype__name">${esc(a.name)}</span>
      <select data-edit="companion-type" data-actor="${esc(a.id)}" aria-label="Companion type for ${esc(a.name)}"><option value=""${COMPANION_TYPES.includes(set) ? '' : ' selected'}>Automatic: ${esc(automatic.label)}</option>${choices.map(([v, l]) => `<option value="${v}"${set === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label></li>`;
    by[gid].rows.push({html: row, minor});
  }
  const shown = groups.filter(g => g.rows.length);
  // Before any script runs: people and other non-companions nobody owns are hidden, and only the first 50 of a group show.
  const html = shown.map(g => { let n = 0; const rows = g.rows.map(r => r.minor || n++ >= CTYPE_PAGE ? r.html.replace('<li ', '<li hidden ') : r.html).join(''), visible = g.rows.filter(r => !r.minor).length;
    return `<details class="agch-ctgroup" data-ctgroup="${g.id}" data-limit="${CTYPE_PAGE}"${g.open ? ' open' : ''}${visible ? '' : ' hidden'}><summary>${esc(g.label)} <span class="ag-badge">${g.rows.length}</span></summary>
      <ul class="agch-vis agch-ctypes">${rows}</ul>
      <p class="agch-ctype__more" data-ctype-more-wrap${visible > CTYPE_PAGE ? '' : ' hidden'}><button type="button" class="ag-btn ag-btn--sm" data-action="ctype-more" data-group="${g.id}" data-ag-always>Show more…</button></p></details>`; }).join('');
  const key = sectionKey('gm', 'companiontypes');
  return `<section class="ag-card" data-ctypes><h3 class="agch-sec__head">${toggleButton(key, 'Companion types')}</h3><div${bodyAttrs(key)}>
    <p class="agch-muted">Override what kind of companion an NPC Actor counts as. Otherwise its import id (CRE-PET / CRE-MOUNT) decides, then its size. Players pick from the NPCs they own.</p>
    ${npcs.length ? `<div class="agch-ctype__tools"><label class="ag-search agch-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-ctype-filter placeholder="Search NPC Actors" aria-label="Search NPC Actors" data-ag-always></label>
    ${hiddenCount ? `<label class="agch-switchrow"><input type="checkbox" data-edit="ctype-all" data-ag-always> <span>Show all NPC Actors (${hiddenCount} more)</span></label>` : ''}</div>
    ${html}` : '<p class="agch-muted">No NPC Actors yet.</p>'}</div></section>`;
}

/** GM Setup → Spell preparation: the world switch for the class limits (the GM is never blocked, only told). */
function preparationCard() {
  const key = sectionKey('gm', 'spellprep');
  return `<section class="ag-card"><h3 class="agch-sec__head">${toggleButton(key, 'Spell preparation')}</h3><div${bodyAttrs(key)}>
    <p class="agch-muted">With this on, a player who tries to prepare a spell past what their class can prepare (dnd5e's preparation limit) is stopped, on the Hub and on the standard sheet, and offered to swap one prepared spell for it. You are never stopped on any character; you are told when you go over. Always-prepared, at-will, innate and ritual-only spells and cantrips never count, wizard spellbook spells are not limited, and a class dnd5e gives no limit for is not limited.</p>
    <label class="agch-switchrow"><input type="checkbox" data-edit="prep-enforce"${enforcementOn() ? ' checked' : ''}> <span>Enforce spell preparation limits</span> <span class="ag-badge">Applies now</span></label></div></section>`;
}

/** GM Setup: settings only (player visibility, pet slots, companion types, spell preparation, look). */
export function gmSetupTab() {
  return `${visibilityCard()}${petSlotsCard()}${companionTypesCard()}${preparationCard()}${lookSetupCard()}`;
}
