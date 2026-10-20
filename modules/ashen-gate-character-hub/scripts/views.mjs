/**
 * HTML for the hub. Tabs are a plain ordered registry so sections can be reordered or added later
 * without touching the sheet class. Every value is read from the live Actor at render time.
 */
import {MODULE_ID, esc, signed} from './constants.mjs';
import {headerData, abilitiesData, skillsData} from './data.mjs';
import {btn} from './buttons.mjs';
import {ITEM_TABS} from './tabs.mjs';
import {partnersTab} from './partners.mjs';

export {btn};

const stat = (label, value, extra = '') => `<div class="agch-stat"><span class="agch-stat__label">${esc(label)}</span><span class="agch-stat__value">${value}</span>${extra}</div>`;

export function headerHtml(ctx) {
  const {actor, editable} = ctx, h = headerData(actor);
  const off = !editable;
  const classLine = h.classes.length
    ? h.classes.map(c => `${esc(c.name)} ${c.level}${c.subclass ? ` (${esc(c.subclass)})` : ''}`).join(' / ')
    : 'No class';
  const hp = h.hp;
  const hpEdit = (field, value, label) => `<label class="agch-hp__field"><span>${label}</span><input type="number" step="1" data-edit="hp.${field}" value="${value}" aria-label="${esc(label)} hit points"${off ? ' disabled' : ''}></label>`;
  const speed = h.speeds.length ? h.speeds.map(s => `${s.key === 'walk' ? '' : `${esc(s.label)} `}${s.value} ${esc(s.units)}`).join(', ') : '—';
  const exh = h.exhaustion;
  const conditions = h.conditions.map(c => `<button type="button" class="agch-chip${c.active ? ' is-active' : ''}" data-action="condition" data-id="${esc(c.id)}" aria-pressed="${c.active}"${off ? ' disabled' : ''}>${esc(c.label)}</button>`).join('');
  return `<section class="agch-hero ag-card" aria-label="Character summary">
    <img class="agch-portrait" src="${esc(h.img)}" alt="${esc(h.name)} portrait">
    <div class="agch-identity">
      <h2 class="agch-name">${esc(h.name)}</h2>
      <p class="agch-sub">${h.species ? `${esc(h.species)} · ` : ''}${classLine}${h.level ? ` · Level ${h.level}` : ''}</p>
    </div>
    <div class="agch-hp" role="group" aria-label="Hit points">
      <div class="agch-hp__now"><span class="agch-stat__label">HP</span><span class="agch-hp__value">${hp.value}<span class="agch-muted"> / ${hp.effectiveMax}</span></span>${hp.temp ? `<span class="ag-badge ag-badge--accent">+${hp.temp} temp</span>` : ''}</div>
      <div class="agch-hp__adjust"><input type="number" min="0" step="1" class="agch-hp__amount" data-hp-amount placeholder="0" aria-label="Amount"${off ? ' disabled' : ''}>
        ${btn('hp-damage', 'Damage', {kind: 'sm', icon: 'fa-solid fa-minus', disabled: off})}${btn('hp-heal', 'Heal', {kind: 'sm', icon: 'fa-solid fa-plus', disabled: off})}</div>
      <div class="agch-hp__fields">${hpEdit('value', hp.value, 'Current')}${hpEdit('temp', hp.temp, 'Temp')}${hpEdit('tempmax', hp.tempmax, 'Max adj.')}</div>
    </div>
    <div class="agch-stats">
      ${stat('AC', h.ac)}
      ${stat('Initiative', btn('roll-initiative', signed(h.init), {kind: 'sm', title: 'Roll initiative', disabled: off}))}
      ${stat('Speed', esc(speed))}
      ${stat('Proficiency', signed(h.prof))}
      ${stat('Inspiration', btn('inspiration', h.inspiration ? 'Yes' : 'No', {kind: h.inspiration ? 'primary' : 'sm', title: 'Toggle inspiration', disabled: off}))}
      ${stat('Exhaustion', `<span class="agch-step">${btn('exhaustion', '', {kind: 'sm', icon: 'fa-solid fa-minus', data: {step: -1}, title: 'Reduce exhaustion', disabled: off || exh.value <= 0})}<span>${exh.value} / ${exh.max}</span>${btn('exhaustion', '', {kind: 'sm', icon: 'fa-solid fa-plus', data: {step: 1}, title: 'Increase exhaustion', disabled: off || exh.value >= exh.max})}</span>`)}
      ${h.hd ? stat('Hit Dice', `${h.hd.value} / ${h.hd.max}`) : ''}
      ${h.resources.map(r => stat(r.label, `${r.value} / ${r.max}`)).join('')}
    </div>
    ${conditions ? `<div class="agch-conditions" role="group" aria-label="Conditions"><span class="agch-stat__label">Conditions</span>${conditions}</div>` : ''}
  </section>`;
}

function characterTab(ctx) {
  const {actor, editable} = ctx, off = !editable;
  const abilities = abilitiesData(actor).map(a => `<div class="agch-ability ag-card">
      <span class="agch-ability__label" title="${esc(a.label)}">${esc(a.abbr)}</span><span class="agch-ability__score">${a.value}</span>
      ${btn('roll-check', `Check ${signed(a.mod)}`, {kind: 'sm', data: {ability: a.key}, title: `${a.label} check`, disabled: off})}
      ${btn('roll-save', `Save ${signed(a.save)}`, {kind: a.saveProficient ? 'primary' : 'sm', extra: 'agch-save', data: {ability: a.key}, title: `${a.label} saving throw${a.saveProficient ? ' (proficient)' : ''}`, disabled: off})}
    </div>`).join('');
  const icon = p => p >= 2 ? 'fa-solid fa-angles-up' : p >= 1 ? 'fa-solid fa-circle' : p > 0 ? 'fa-solid fa-circle-half-stroke' : 'fa-regular fa-circle';
  const skills = skillsData(actor).map(s => `<li><button type="button" class="agch-row" data-action="roll-skill" data-skill="${esc(s.key)}"${off ? ' disabled' : ''} aria-label="${esc(s.label)} check, ${esc(s.profLabel)}">
      <i class="${icon(s.prof)} agch-prof" title="${esc(s.profLabel)}" aria-hidden="true"></i><span class="agch-row__name">${esc(s.label)}</span>
      <span class="agch-muted">${esc(s.abilityAbbr)}</span><span class="agch-row__value">${signed(s.total)}</span><span class="agch-muted" title="Passive">(${s.passive})</span></button></li>`).join('');
  return `<h3 class="agch-heading">Abilities &amp; Saves</h3><div class="agch-abilities">${abilities || '<p class="ag-empty">No abilities.</p>'}</div>
    <h3 class="agch-heading">Skills</h3><ul class="ag-list agch-skills">${skills || '<li class="ag-empty">No skills.</li>'}</ul>`;
}

/** The tab registry, in display order. Later views are appended here; reorder by moving entries. */
export const TABS = [
  {id: 'character', label: 'Character', icon: 'fa-solid fa-user', render: characterTab},
  ...ITEM_TABS,
  {id: 'ashen-gate', label: 'Ashen Gate', icon: 'fa-solid fa-dungeon', render: partnersTab}
];

export function tabsHtml(active) {
  return `<nav class="ag-tabs" role="tablist" aria-label="Character Hub sections">${TABS.map(t => `<button type="button" role="tab" data-action="hub-tab" data-tab="${t.id}" data-ag-always aria-selected="${t.id === active}" class="${t.id === active ? 'active' : ''}"><i class="${t.icon}" aria-hidden="true"></i> ${esc(t.label)}</button>`).join('')}</nav>`;
}

export function shellHtml(ctx) {
  const {actor, tab} = ctx;
  const version = globalThis.game?.modules?.get?.(MODULE_ID)?.version ?? '';
  const top = `<header class="ag-header"><h1>Ashen Gate | Character Hub</h1><div class="ag-header__actions"><span class="ag-version">v${esc(version)}</span>
    ${btn('open-native', 'Open native sheet', {kind: 'ghost', icon: 'fa-solid fa-file-lines', always: true, title: 'Open the standard dnd5e character sheet'})}
    ${btn('help', 'Help', {kind: 'ghost', icon: 'fa-solid fa-circle-question', always: true})}</div></header>`;
  if (ctx.limited) return `<div class="agch-root">${top}<section class="agch-hero ag-card"><img class="agch-portrait" src="${esc(actor.img)}" alt=""><div class="agch-identity"><h2 class="agch-name">${esc(actor.name)}</h2><p class="agch-sub">You have limited access to this character.</p></div></section></div>`;
  const current = TABS.find(t => t.id === tab) ?? TABS[0];
  const notice = ctx.editable ? '' : '<p class="agch-notice" role="note"><i class="fa-solid fa-eye" aria-hidden="true"></i> View only: you can look but not change or roll for this character.</p>';
  return `<div class="agch-root">${top}${headerHtml(ctx)}${tabsHtml(current.id)}${notice}
    <div class="agch-body" role="tabpanel" aria-label="${esc(current.label)}">${current.render(ctx)}</div></div>`;
}

export function errorHtml(err) {
  return `<div class="agch-root"><div class="ag-card agch-error" role="alert"><h3>The Character Hub could not be drawn</h3>
    <p>${esc(err?.message ?? String(err))}</p><p class="agch-muted">The character is unchanged. Retry, or use the native sheet. The error is also in the browser console (F12).</p>
    ${btn('retry', 'Retry', {kind: 'primary', icon: 'fa-solid fa-rotate', always: true})} ${btn('open-native', 'Open native sheet', {icon: 'fa-solid fa-file-lines', always: true})}</div></div>`;
}
