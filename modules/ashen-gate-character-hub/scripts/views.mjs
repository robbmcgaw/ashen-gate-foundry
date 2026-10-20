/**
 * HTML for the hub. Tabs are a plain ordered registry so sections can be reordered or added later
 * without touching the sheet class. Every value is read from the live Actor at render time.
 */
import {MODULE_ID, esc, signed} from './constants.mjs';
import {abilitiesData, skillsData, overviewData} from './data.mjs';
import {characterPanelHtml} from './character.mjs';
import {btn} from './buttons.mjs';
import {ITEM_TABS} from './tabs.mjs';
import {ashenGateTab} from './partners.mjs';
import {companionsTab, gmSetupTab} from './companion-views.mjs';

export {btn};

function overviewTab(ctx) {
  const {actor, editable} = ctx, off = !editable, o = overviewData(actor);
  const icon = p => p >= 2 ? 'fa-solid fa-angles-up' : p >= 1 ? 'fa-solid fa-circle' : p > 0 ? 'fa-solid fa-circle-half-stroke' : 'fa-regular fa-circle';
  const skills = skillsData(actor).map(s => `<li><button type="button" class="agch-row" data-action="roll-skill" data-skill="${esc(s.key)}"${off ? ' disabled' : ''} aria-label="${esc(s.label)} check, ${esc(s.profLabel)}">
      <i class="${icon(s.prof)} agch-prof" title="${esc(s.profLabel)}" aria-hidden="true"></i><span class="agch-row__name">${esc(s.label)}</span>
      <span class="agch-muted agch-row__abbr">${esc(s.abilityAbbr)}</span><span class="agch-row__value">${signed(s.total)}</span><span class="agch-muted agch-row__passive" title="Passive">(${s.passive})</span></button></li>`).join('');
  const saves = abilitiesData(actor).map(a => `<li><button type="button" class="agch-row" data-action="roll-save" data-ability="${esc(a.key)}"${off ? ' disabled' : ''} aria-label="${esc(a.label)} saving throw${a.saveProficient ? ', proficient' : ''}">
      <i class="${icon(a.saveProficient ? 1 : 0)} agch-prof" aria-hidden="true"></i><span class="agch-row__name">${esc(a.label)}</span><span class="agch-row__value">${signed(a.save)}</span></button></li>`).join('');
  const kv = rows => `<dl class="agch-kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
  return `<h3 class="agch-heading">Skills</h3><ul class="ag-list agch-skills">${skills || '<li class="ag-empty">No skills.</li>'}</ul>
    <div class="agch-overview">
      <section><h3 class="agch-heading">Saving Throws</h3><ul class="ag-list agch-saves">${saves || '<li class="ag-empty">No abilities.</li>'}</ul></section>
      <section><h3 class="agch-heading">Passives &amp; Senses</h3>${kv([...o.passives.map(p => [`Passive ${p.label}`, String(p.value)]), ['Senses', esc(o.senses.join(', ') || 'None')]])}</section>
      <section><h3 class="agch-heading">Proficiencies</h3>${kv(o.proficiencies.map(p => [p.label, esc(p.list.join(', ') || 'None')]))}</section>
    </div>
    <p class="agch-muted agch-hint">Ability checks and saves also roll from the ability tiles on the left.</p>`;
}

/** The tab registry, in display order. Later views are appended here; reorder by moving entries. */
export const TABS = [
  {id: 'overview', label: 'Overview', icon: 'fa-solid fa-user', render: overviewTab},
  ...ITEM_TABS.filter(t => t.id !== 'rest'),
  {id: 'ashen-gate', label: 'Ashen Gate', icon: 'fa-solid fa-dungeon', render: ashenGateTab},
  {id: 'companions', label: 'Companions', icon: 'fa-solid fa-horse', render: companionsTab},
  ...ITEM_TABS.filter(t => t.id === 'rest'),
  {id: 'gm-setup', label: 'GM Setup', icon: 'fa-solid fa-gear', render: gmSetupTab, gmOnly: true}
];
/** Tabs this user may open (GM Setup is GM-only). */
export const visibleTabs = () => TABS.filter(t => !t.gmOnly || globalThis.game?.user?.isGM === true);

export function tabsHtml(active) {
  return `<nav class="ag-tabs" role="tablist" aria-label="Character Hub sections">${visibleTabs().map(t => `<button type="button" role="tab" data-action="hub-tab" data-tab="${t.id}" data-ag-always aria-selected="${t.id === active}" class="${t.id === active ? 'active' : ''}"><i class="${t.icon}" aria-hidden="true"></i> ${esc(t.label)}</button>`).join('')}</nav>`;
}

export function shellHtml(ctx) {
  const {actor, tab} = ctx;
  const version = globalThis.game?.modules?.get?.(MODULE_ID)?.version ?? '';
  const top = `<header class="ag-header"><h1>Ashen Gate | Character Hub</h1><div class="ag-header__actions"><span class="ag-version">v${esc(version)}</span>
    ${btn('open-native', 'Open native sheet', {kind: 'ghost', icon: 'fa-solid fa-file-lines', always: true, title: 'Open the standard dnd5e character sheet'})}
    ${btn('help', 'Help', {kind: 'ghost', icon: 'fa-solid fa-circle-question', always: true})}</div></header>`;
  if (ctx.limited) return `<div class="agch-root agch-root--limited">${top}<section class="agch-hero ag-card"><img class="agch-portrait" src="${esc(actor.img)}" alt=""><div class="agch-identity"><h2 class="agch-name">${esc(actor.name)}</h2><p class="agch-sub">You have limited access to this character.</p></div></section></div>`;
  const tabs = visibleTabs(), current = tabs.find(t => t.id === tab) ?? tabs[0];
  const notice = ctx.editable ? '' : '<p class="agch-notice" role="note"><i class="fa-solid fa-eye" aria-hidden="true"></i> View only: you can look but not change or roll for this character.</p>';
  return `<div class="agch-root">${top}<div class="agch-split">${characterPanelHtml(ctx)}
    <section class="agch-pane">${tabsHtml(current.id)}${notice}
    <div class="agch-body" role="tabpanel" aria-label="${esc(current.label)}">${current.render(ctx)}</div></section></div></div>`;
}

export function errorHtml(err) {
  return `<div class="agch-root"><div class="ag-card agch-error" role="alert"><h3>The Character Hub could not be drawn</h3>
    <p>${esc(err?.message ?? String(err))}</p><p class="agch-muted">The character is unchanged. Retry, or use the native sheet. The error is also in the browser console (F12).</p>
    ${btn('retry', 'Retry', {kind: 'primary', icon: 'fa-solid fa-rotate', always: true})} ${btn('open-native', 'Open native sheet', {icon: 'fa-solid fa-file-lines', always: true})}</div></div>`;
}
