/** Companions tab and the GM Setup tab (player visibility, pet limits). */
import {esc} from './constants.mjs';
import {btn} from './buttons.mjs';
import {companionsData, freeItems, petCapOverride, defaultPetCap} from './companions.mjs';
import {PARTS, PRESETS, readVisibility, hiddenReason} from './visibility.mjs';

const plain = html => String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const itemOptions = (items, placeholder) => `<option value="">${esc(placeholder)}</option>${items.map(i => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('')}`;

function companionCard(entry, {off, free, index, count}) {
  const item = entry.item, desc = plain(item.system?.description?.value);
  const perks = entry.perks.map(p => `<li class="agch-item"><img class="agch-item__img" src="${esc(p.img)}" alt="">
      <button type="button" class="agch-item__name" data-action="item-sheet" data-id="${esc(p.id)}" data-ag-always title="Open ${esc(p.name)}">${esc(p.name)}</button>
      <span class="agch-item__controls">${btn('companion-detach', 'Detach', {kind: 'sm', data: {entry: entry.id, id: p.id}, disabled: off})}</span>
      ${plain(p.system?.description?.value) ? `<p class="agch-muted agch-perk__desc">${esc(plain(p.system.description.value))}</p>` : ''}</li>`).join('');
  return `<article class="ag-card agch-companion" data-entry="${esc(entry.id)}">
    <header class="agch-companion__head"><img src="${esc(item.img)}" alt="">
      <button type="button" class="agch-item__name" data-action="item-sheet" data-id="${esc(item.id)}" data-ag-always title="Open ${esc(item.name)}">${esc(item.name)}</button>
      <span class="ag-badge">${entry.kind === 'mount' ? 'Mount' : 'Pet'}</span>
      <span class="agch-item__controls">${entry.kind === 'pet' ? `${btn('companion-move', '', {kind: 'sm', icon: 'fa-solid fa-arrow-up', data: {entry: entry.id, step: -1}, title: `Move ${item.name} up`, disabled: off || index === 0})}${btn('companion-move', '', {kind: 'sm', icon: 'fa-solid fa-arrow-down', data: {entry: entry.id, step: 1}, title: `Move ${item.name} down`, disabled: off || index === count - 1})}` : ''}
        ${btn('companion-remove', 'Remove', {kind: 'sm', icon: 'fa-solid fa-xmark', data: {entry: entry.id}, title: `Remove ${item.name} from companions (the item stays on the character)`, disabled: off})}</span></header>
    ${desc ? `<p class="agch-companion__desc">${esc(desc)}</p>` : ''}
    <h4 class="agch-subheading">Perks</h4>
    ${perks ? `<ul class="ag-list agch-items">${perks}</ul>` : '<p class="agch-muted">No perks attached.</p>'}
    ${off ? '' : `<div class="agch-drop" data-drop-companion="perk" data-entry="${esc(entry.id)}">Drop a perk item here
      <select data-edit="companion-attach" data-entry="${esc(entry.id)}" aria-label="Attach a perk to ${esc(item.name)}">${itemOptions(free, 'or attach one from this character…')}</select></div>`}
  </article>`;
}

export function companionsTab({actor, editable}) {
  const off = !editable, d = companionsData(actor), free = freeItems(actor), gm = globalThis.game?.user?.isGM === true;
  const addZone = (kind, label, full) => off ? '' : full ? '' : `<div class="agch-drop" data-drop-companion="${kind}">Drop ${label} item here
    <select data-edit="companion-add" data-kind="${kind}" aria-label="Add a ${kind} from this character's items">${itemOptions(free, 'or choose one of this character\'s items…')}</select></div>`;
  const mount = d.mount ? companionCard(d.mount, {off, free, index: 0, count: 1}) : '<p class="agch-muted">No mount.</p>';
  const pets = d.pets.map((p, i) => companionCard(p, {off, free, index: i, count: d.pets.length})).join('') || (d.cap === 0 ? '<p class="agch-muted">No pet slots yet. The GM can raise the pet limit.</p>' : '<p class="agch-muted">No pets.</p>');
  const override = petCapOverride(actor);
  const gmCap = gm ? `<label class="agch-gmcap">GM: pet limit for ${esc(actor.name)}
      <select data-edit="pet-cap-override" data-actor="${esc(actor.id)}">${capOptions(override)}</select></label>` : '';
  return `<h3 class="agch-heading">Mount <span class="ag-badge">${d.mount ? 1 : 0} / 1</span></h3>${mount}${addZone('mount', 'a mount', !!d.mount)}
    <h3 class="agch-heading">Pets <span class="ag-badge${d.overCap ? ' ag-badge--danger' : ''}">${d.pets.length} / ${esc(d.capLabel)}</span></h3>
    ${d.overCap ? `<p class="agch-notice" role="note">More pets than the current limit (${esc(d.capLabel)}). Nothing was removed; remove one or ask the GM.</p>` : ''}
    ${pets}${addZone('pet', 'a pet', d.pets.length >= d.cap)}${gmCap}
    <p class="agch-muted agch-hint">A companion is an Item on this character. Perk items only show their own text here: the Hub does not apply bonuses or effects. Removing a companion keeps its Item on the character.</p>`;
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
  return `<section class="ag-card"><h3>Player visibility</h3>
    <p class="agch-muted">Choose which parts of the Character Hub players see, so you can bring systems in one at a time. You always see everything; hidden parts carry a "Hidden from players" badge. An Ashen Gate part is also hidden from players while its module is not active or its own Player Access is off (change that in the module's own GM Setup). Hiding a part changes no character data, and players can't use its Hub actions while it is hidden.</p>
    <div class="agch-vis__presets"><span class="agch-muted">Quick set:</span>${PRESETS.map(p => btn('visibility-preset', p.label, {kind: 'sm', data: {preset: p.id}})).join('')}</div>
    <ul class="agch-vis">${rows}</ul></section>`;
}

/** GM Setup: settings only (player visibility, pet limits). */
export function gmSetupTab() {
  const chars = [...(globalThis.game?.actors ?? [])].filter(a => a.type === 'character').sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const rows = chars.map(a => { const d = companionsData(a); return `<tr><th scope="row">${esc(a.name)}</th><td>${d.mount ? 1 : 0}</td><td>${d.pets.length} / ${esc(d.capLabel)}</td>
    <td><select data-edit="pet-cap-override" data-actor="${esc(a.id)}" aria-label="Pet limit for ${esc(a.name)}">${capOptions(petCapOverride(a))}</select></td></tr>`; }).join('');
  return `${visibilityCard()}<section class="ag-card"><h3>Companions</h3>
    <label class="ag-field">Pets per character (world default)<input type="number" min="0" step="1" data-edit="pet-cap-default" value="${defaultPetCap()}"></label>
    <p class="agch-muted">Every character may have one mount. Pets start at 0: raise the world default or a character's limit to give pet slots. Limits apply when adding a pet; existing pets are never removed.</p>
    ${rows ? `<table class="agch-table"><thead><tr><th>Character</th><th>Mount</th><th>Pets</th><th>Pet limit</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="ag-empty">No characters.</p>'}</section>`;
}
