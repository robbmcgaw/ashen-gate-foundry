/** Companions tab and the GM Setup tab (player visibility, pet limits). */
import {esc, num} from './constants.mjs';
import {btn} from './buttons.mjs';
import {companionsData, freeItems, linkableActors, freeItemsFor, petCapOverride, defaultPetCap, NAME_MAX, DESC_MAX} from './companions.mjs';
import {companionRole, COMPANION_ROLES, companionStats, itemGives} from './companion-items.mjs';
import {itemRow} from './items.mjs';
import {cardList, plainText, summaryOf} from './cards.mjs';
import {speedsData} from './data.mjs';
import {tooltipAttrs, itemUuid} from './tooltips.mjs';
import {PARTS, PRESETS, readVisibility, hiddenReason} from './visibility.mjs';
import {sectionHtml, sectionKey, toggleButton, bodyAttrs} from './collapse.mjs';
import {isBackup} from './level-backup.mjs';
import {lookSetupCard} from './look.mjs';

const itemOptions = (items, placeholder) => `<option value="">${esc(placeholder)}</option>${items.map(i => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('')}`;
const GIVES = {key: 'gives', label: 'Gives', render: r => esc(r.gives || '—')};
const ROLE = {key: 'role', label: 'Kind', render: r => esc(r.roleLabel)};

/** Gear and perk rows in the 0.11.0 card style: what each gives (its own effects), Detach. */
function extrasList(entry, items, off, listKey) {
  if (!items.length) return '';
  const rows = items.map(i => { const role = companionRole(i); return {...itemRow(i), gives: itemGives(i), roleLabel: role ? COMPANION_ROLES[role].label : i.type === 'feat' ? 'Perk' : entry.kind === 'mount' ? 'Gear' : 'Clothing'}; });
  return cardList(rows, [ROLE, GIVES], {listKey, card: r => ({controls: btn('companion-unattach', 'Detach', {kind: 'sm', icon: 'fa-solid fa-link-slash', data: {entry: entry.id, id: r.id}, title: `Take ${r.name} off ${entry.displayName} (it stays on the character)`, disabled: off})})});
}

/** The stats box: what gear and perks give, from their own Active Effects and armour values (display only). */
function statsBox(entry, owner) {
  const {lines, warnings} = companionStats([...entry.gear, ...entry.perks, ...entry.clothingItems.filter(Boolean)], {owner});
  const base = entry.actor && (globalThis.game?.user?.isGM || entry.actor.testUserPermission?.(globalThis.game?.user, 'OBSERVER'));
  const a = base ? entry.actor.system?.attributes ?? {} : null;
  const baseLine = a ? `<p class="agch-stats__base"><span class="agch-muted">${esc(entry.actor.name)}'s sheet:</span> AC ${num(a.ac?.value)} · HP ${num(a.hp?.value)} / ${num(a.hp?.max)}${speedsData(a.movement ?? {}).map(sp => ` · ${esc(sp.label)} ${sp.value} ${esc(sp.units)}`).join('')}</p>` : '';
  const rows = lines.map(l => `<div class="agch-kv__row"><dt>${esc(l.label)}</dt><dd>${l.total !== null ? `<strong>${l.total >= 0 ? '+' : '−'}${Math.abs(l.total)}</strong> ` : ''}${l.parts.map(pt => `${esc(pt.text)} <span class="agch-muted">(${esc(pt.source)})</span>`).join(', ')}</dd></div>`).join('');
  return `<section class="agch-stats" aria-label="What ${esc(entry.displayName)} gets">
    <h4 class="agch-subheading">${entry.kind === 'mount' ? 'From gear and perks' : 'From clothing and perks'}</h4>${baseLine}
    ${rows ? `<dl class="agch-kv">${rows}</dl>` : '<p class="agch-muted">Nothing yet. Bonuses show here from the items\' own effects.</p>'}
    ${warnings.map(w => `<p class="ag-notice ag-notice--warn agch-notice" role="note"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${esc(w)}</p>`).join('')}</section>`;
}

/** The companion's own text (Item description or Actor biography), shown until the player writes their own. */
const ownText = entry => summaryOf(plainText(entry.item?.system?.description?.value ?? entry.actor?.system?.details?.biography?.value ?? ''), 300).summary;

/** Card header: art (never stretched), the player's name box, open and remove buttons. */
function cardHead(entry, {off, index, count}) {
  const open = entry.actor ? btn('companion-open', '', {kind: 'sm', icon: 'fa-solid fa-up-right-from-square', data: {entry: entry.id}, title: `Open ${entry.actor.name}'s sheet`, always: true})
    : entry.item ? btn('item-sheet', '', {kind: 'sm', icon: 'fa-solid fa-up-right-from-square', data: {id: entry.item.id}, title: `Open ${entry.item.name}`, always: true}) : '';
  const moves = entry.kind === 'pet' ? `${btn('companion-move', '', {kind: 'sm', icon: 'fa-solid fa-arrow-up', data: {entry: entry.id, step: -1}, title: `Move ${entry.displayName} up`, disabled: off || index === 0})}${btn('companion-move', '', {kind: 'sm', icon: 'fa-solid fa-arrow-down', data: {entry: entry.id, step: 1}, title: `Move ${entry.displayName} down`, disabled: off || index === count - 1})}` : '';
  const source = entry.actor ? 'Actor' : entry.item ? 'Item' : 'Missing';
  return `<header class="agch-companion__head"><div class="agch-companion__art"><img src="${esc(entry.art)}" alt=""></div>
    <div class="agch-companion__id"><input type="text" class="agch-companion__name" data-edit="companion-name" data-entry="${esc(entry.id)}" value="${esc(entry.name)}" maxlength="${NAME_MAX}" placeholder="${esc(entry.actor?.name || entry.item?.name || 'Name')}" aria-label="Name for ${esc(entry.displayName)}"${off ? ' disabled' : ''}>
      <span class="agch-companion__badges"><span class="ag-badge">${entry.kind === 'mount' ? 'Mount' : 'Pet'}</span><span class="ag-badge" data-tooltip="${entry.missing ? 'The linked Actor is gone' : `Linked ${source.toLowerCase()}`}">${source}</span></span></div>
    <span class="agch-item__controls">${open}${moves}${btn('companion-remove', 'Remove', {kind: 'danger', extra: 'ag-btn--sm', icon: 'fa-solid fa-trash', data: {entry: entry.id}, title: `Remove ${entry.displayName} from companions (the Actor or Item is kept)`, disabled: off})}</span></header>
    ${entry.denied ? '<p class="ag-notice ag-notice--warn agch-notice" role="note"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> This companion is not shared with you any more, so its sheet and notes are hidden. Remove it, or ask the GM to share it again.</p>' : ''}
    ${entry.missing ? '<p class="ag-notice ag-notice--warn agch-notice" role="note"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> The linked Actor is gone. Remove this companion, or ask the GM.</p>' : ''}
    <textarea class="agch-companion__desc" data-edit="companion-desc" data-entry="${esc(entry.id)}" rows="3" maxlength="${DESC_MAX}" placeholder="${esc(ownText(entry) || `Description (your own notes for this ${entry.kind})`)}" aria-label="Description for ${esc(entry.displayName)}"${off ? ' disabled' : ''}>${esc(entry.description)}</textarea>`;
}

function mountCard(entry, {off, free, actor}) {
  const choices = freeItemsFor(actor, 'mount');
  return `<article class="ag-card agch-companion agch-companion--mount" data-entry="${esc(entry.id)}">
    ${cardHead(entry, {off, index: 0, count: 1})}
    ${statsBox(entry, actor)}
    <h4 class="agch-subheading">Gear and perks</h4>
    ${extrasList(entry, [...entry.gear, ...entry.perks], off, `mount-${entry.id}`) || '<p class="agch-muted">No gear or perks yet.</p>'}
    ${off ? '' : `<div class="agch-drop" data-drop-companion="extra" data-entry="${esc(entry.id)}"><i class="fa-solid fa-horse-head" aria-hidden="true"></i> Drop mount gear or a mount perk here
      <select data-edit="companion-extra" data-entry="${esc(entry.id)}" aria-label="Give ${esc(entry.displayName)} gear or a perk from this character">${itemOptions(choices, 'or choose one of this character\'s items…')}</select></div>`}
  </article>`;
}

/** Three clothing slots for a pet: drop an item on a slot, click to open, ✕ to take it off. */
function clothingSlots(entry, off, actor) {
  const choices = freeItemsFor(actor, 'pet', 'clothing');
  return `<div class="agch-clothing" role="group" aria-label="${esc(entry.displayName)}'s clothing">${entry.clothingItems.map((item, i) => item
    ? `<div class="agch-clothing__slot is-filled"><button type="button" class="ag-slot agch-slot is-filled" data-action="item-sheet" data-id="${esc(item.id)}" data-ag-always${tooltipAttrs(itemUuid(item), item.name)} aria-label="Clothing ${i + 1}: ${esc(item.name)}"><img src="${esc(item.img)}" alt=""></button>
        ${btn('companion-unattach', '', {kind: 'ghost', extra: 'agch-clothing__off', icon: 'fa-solid fa-xmark', data: {entry: entry.id, id: item.id}, title: `Take ${item.name} off`, disabled: off})}</div>`
    : `<div class="agch-clothing__slot"${off ? '' : ` data-drop-companion="clothing" data-entry="${esc(entry.id)}" data-slot="${i}"`}><span class="ag-slot agch-slot is-empty" data-tooltip="Clothing slot ${i + 1}: drop pet clothing here"><i class="fa-solid fa-shirt agch-slot__icon" aria-hidden="true"></i></span>
        ${off || !choices.length ? '' : `<select data-edit="companion-clothing" data-entry="${esc(entry.id)}" data-slot="${i}" aria-label="Put clothing in slot ${i + 1}">${itemOptions(choices, 'Wear…')}</select>`}</div>`).join('')}</div>`;
}

function petCard(entry, {off, index, count, actor}) {
  const perkChoices = freeItemsFor(actor, 'pet', 'perk');
  return `<article class="ag-card agch-companion agch-companion--pet" data-entry="${esc(entry.id)}">
    ${cardHead(entry, {off, index, count})}
    <h4 class="agch-subheading">Clothing</h4>${clothingSlots(entry, off, actor)}
    ${entry.perks.length ? `<h4 class="agch-subheading">Perks</h4>${extrasList(entry, entry.perks, off, `pet-${entry.id}`)}` : ''}
    ${entry.clothingItems.some(Boolean) || entry.perks.length ? statsBox(entry, actor) : ''}
    ${off ? '' : `<div class="agch-drop" data-drop-companion="perk" data-entry="${esc(entry.id)}">Drop a pet perk here
      <select data-edit="companion-attach" data-entry="${esc(entry.id)}" aria-label="Give ${esc(entry.displayName)} a perk">${itemOptions(perkChoices, 'or choose one of this character\'s items…')}</select></div>`}
  </article>`;
}

export function companionsTab({actor, editable}) {
  const off = !editable, d = companionsData(actor), free = freeItems(actor), gm = globalThis.game?.user?.isGM === true;
  const addZone = (kind, label, full) => {
    if (off || full) return '';
    const actors = linkableActors(actor, kind);
    return `<div class="agch-drop agch-drop--add" data-drop-companion="${kind}"><i class="fa-solid ${kind === 'mount' ? 'fa-horse' : 'fa-paw'}" aria-hidden="true"></i> ${label}
    ${actors.length ? `<select data-edit="companion-link" data-kind="${kind}" aria-label="Link a ${kind} Actor"><option value="">or link a world Actor…</option>${actors.map(a => `<option value="${esc(a.uuid)}">${esc(a.name)}</option>`).join('')}</select>` : ''}
    <select data-edit="companion-add" data-kind="${kind}" aria-label="Add a ${kind} from this character's items">${itemOptions(free, 'or choose one of this character\'s items…')}</select></div>`;
  };
  const mount = d.mount ? mountCard(d.mount, {off, free, actor}) : '<p class="agch-muted">No mount.</p>';
  const pets = d.pets.map((p, i) => petCard(p, {off, index: i, count: d.pets.length, actor})).join('') || (d.cap === 0 ? '<p class="agch-muted">No pet slots yet. The GM can raise the pet limit.</p>' : '<p class="agch-muted">No pets.</p>');
  const override = petCapOverride(actor);
  const gmCap = gm && !isBackup(actor) ? `<label class="agch-gmcap">GM: pet limit for ${esc(actor.name)}
      <select data-edit="pet-cap-override" data-actor="${esc(actor.id)}">${capOptions(override)}</select></label>` : '';
  return `${sectionHtml(sectionKey('companions', 'mount'), `Mount <span class="ag-badge">${d.mount ? 1 : 0} / 1</span>`, `${mount}${addZone('mount', 'Drop the mount Actor (from the Actors sidebar) or a mount Item here', !!d.mount)}`)}
    ${sectionHtml(sectionKey('companions', 'pets'), `Pets <span class="ag-badge${d.overCap ? ' ag-badge--danger' : ''}">${d.pets.length} / ${esc(d.capLabel)}</span>`, `
    ${d.overCap ? `<p class="ag-notice ag-notice--warn agch-notice" role="note"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> More pets than the current limit (${esc(d.capLabel)}). Nothing was removed; remove one or ask the GM.</p>` : ''}
    ${pets}${addZone('pet', 'Drop a pet Actor or Item here', d.pets.length >= d.cap)}`)}${gmCap}
    <p class="agch-muted agch-hint">A mount or pet is a world Actor or an Item on this character. Gear, clothing and perks are Items on this character. The stats box only reads their own effects; the Hub applies nothing to the mount or the character. Removing a companion or taking an item off keeps the Actor and Items.</p>`;
}

const capOptions = current => [['', `World default (${defaultPetCap()})`], ['none', 'No pets'], ['unlimited', 'Unlimited'], ...[0, 1, 2, 3, 4, 5, 6].map(n => [String(n), String(n)])]
  .filter(([v], i, all) => all.findIndex(([x]) => x === v) === i)
  .map(([v, l]) => `<option value="${v}"${String(current ?? '') === v ? ' selected' : ''}>${esc(l)}</option>`).join('');

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

/** GM Setup: settings only (player visibility, pet limits). */
export function gmSetupTab() {
  const chars = [...(globalThis.game?.actors ?? [])].filter(a => a.type === 'character' && !isBackup(a)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const rows = chars.map(a => { const d = companionsData(a); return `<tr><th scope="row">${esc(a.name)}</th><td class="is-num">${d.mount ? 1 : 0}</td><td class="is-num">${d.pets.length} / ${esc(d.capLabel)}</td>
    <td><select data-edit="pet-cap-override" data-actor="${esc(a.id)}" aria-label="Pet limit for ${esc(a.name)}">${capOptions(petCapOverride(a))}</select></td></tr>`; }).join('');
  const key = sectionKey('gm', 'companions');
  return `${visibilityCard()}${lookSetupCard()}<section class="ag-card"><h3 class="agch-sec__head">${toggleButton(key, 'Companions')}</h3><div${bodyAttrs(key)}>
    <label class="ag-field">Pets per character (world default)<input type="number" min="0" step="1" data-edit="pet-cap-default" value="${defaultPetCap()}"></label>
    <p class="agch-muted">Every character may have one mount. Pets start at 0: raise the world default or a character's limit to give pet slots. Limits apply when adding a pet; existing pets are never removed.</p>
    ${rows ? `<div class="ag-table-wrap"><table class="ag-table agch-table"><thead><tr><th scope="col">Character</th><th scope="col" class="is-num">Mount</th><th scope="col" class="is-num">Pets</th><th scope="col">Pet limit</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="ag-empty"><p class="ag-empty__title">No characters yet.</p><p class="ag-empty__text">Player characters show here once they exist in the world.</p></div>'}</div></section>`;
}
