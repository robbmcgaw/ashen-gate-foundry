/**
 * HTML for the hub. Tabs are a plain ordered registry so sections can be reordered or added later
 * without touching the sheet class. Every value is read from the live Actor at render time.
 */
import {MODULE_ID, esc, signed, OPACITY_MIN, windowOpacity} from './constants.mjs';
import {abilitiesData, skillsData, overviewData} from './data.mjs';
import {characterPanelHtml} from './character.mjs';
import {btn} from './buttons.mjs';
import {ITEM_TABS} from './tabs.mjs';
import {ashenGateTab, AG_PANELS, agPanelsFor, partnerApi, embedApi, panelState} from './partners.mjs';
import {canSee, hiddenReason, hiddenBadge, partForPartner} from './visibility.mjs';
import {companionsTab, gmSetupTab} from './companion-views.mjs';
import {configAttrs} from './configure.mjs';
import {hotbarsHtml} from './hotbar-views.mjs';
import {journeyTab} from './journey-views.mjs';
import {sectionHtml, sectionKey} from './collapse.mjs';

export {btn};

function overviewTab(ctx) {
  const {actor, editable} = ctx, off = !editable, o = overviewData(actor);
  const cfg = (kind, key) => off ? '' : configAttrs(kind, key), rc = off ? '' : ' (right-click to configure)';
  const icon = p => p >= 2 ? 'fa-solid fa-angles-up' : p >= 1 ? 'fa-solid fa-circle' : p > 0 ? 'fa-solid fa-circle-half-stroke' : 'fa-regular fa-circle';
  const skills = skillsData(actor).map(s => `<li${cfg('skill', s.key)}><button type="button" class="agch-row" data-action="roll-skill" data-skill="${esc(s.key)}"${off ? ' disabled' : ''} title="${esc(s.label)} check${rc}" aria-label="${esc(s.label)} check, ${esc(s.profLabel)}">
      <i class="${icon(s.prof)} agch-prof" title="${esc(s.profLabel)}" aria-hidden="true"></i><span class="agch-row__name">${esc(s.label)}</span>
      <span class="agch-muted agch-row__abbr">${esc(s.abilityAbbr)}</span><span class="agch-row__value">${signed(s.total)}</span><span class="agch-muted agch-row__passive" title="Passive">${s.passive}</span></button></li>`).join('');
  const saves = abilitiesData(actor).map(a => `<li${cfg('ability', a.key)}><button type="button" class="agch-row" data-action="roll-save" data-ability="${esc(a.key)}"${off ? ' disabled' : ''} title="${esc(a.label)} saving throw${rc}" aria-label="${esc(a.label)} saving throw${a.saveProficient ? ', proficient' : ''}">
      <i class="${icon(a.saveProficient ? 1 : 0)} agch-prof" aria-hidden="true"></i><span class="agch-row__name">${esc(a.label)}</span><span class="agch-row__value">${signed(a.save)}</span></button></li>`).join('');
  const kv = rows => `<dl class="agch-kv">${rows.map(([k, v, attrs = '']) => `<div class="agch-kv__row"${attrs}><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  const TRAIT_KEYS = {Armor: 'armor', Weapons: 'weapon', Tools: 'tool', Languages: 'languages'};
  const skillHead = '<li class="agch-zebra__head" aria-hidden="true"><span></span><span class="agch-row__name">Skill</span><span class="agch-row__abbr">Abil.</span><span class="agch-row__value">Mod</span><span class="agch-row__passive">Pass.</span></li>';
  return `<div class="agch-overview">
    <div class="agch-overview__col">${sectionHtml(sectionKey('overview', 'skills'), 'Skills', `<ul class="ag-list agch-zebra agch-skills">${skills ? skillHead + skills : '<li class="ag-empty">No skills.</li>'}</ul>`)}</div>
    <div class="agch-overview__col">
      ${sectionHtml(sectionKey('overview', 'saves'), 'Saving Throws', `<ul class="ag-list agch-zebra agch-saves">${saves || '<li class="ag-empty">No abilities.</li>'}</ul>`)}
      ${sectionHtml(sectionKey('overview', 'passives'), 'Passives &amp; Senses', kv([...o.passives.map(p => [`Passive ${p.label}`, String(p.value)]), ['Senses', esc(o.senses.join(', ') || 'None'), cfg('senses')]]))}
      ${sectionHtml(sectionKey('overview', 'proficiencies'), 'Proficiencies', kv(o.proficiencies.map(p => [p.label, esc(p.list.join(', ') || 'None'), TRAIT_KEYS[p.label] ? cfg('trait', TRAIT_KEYS[p.label]) : ''])))}
    </div></div>
    <p class="agch-muted agch-hint">Ability checks and saves also roll from the ability tiles on the left.${off ? '' : ' Right-click a skill, save, sense or proficiency (or AC, speed, initiative, HP, an ability on the left) to open dnd5e\'s own settings for it.'}</p>`;
}

/**
 * The tab registry, in display order. Later views are appended here; reorder by moving entries. `parts` are the
 * player-visibility parts a tab holds (visibility.mjs): players get the tab when they may see any of them.
 */
export const TABS = [
  {id: 'overview', label: 'Overview', icon: 'fa-solid fa-user', render: overviewTab, parts: ['overview']},
  ...ITEM_TABS,
  {id: 'ashen-gate', label: 'Ashen Gate', icon: 'fa-solid fa-dungeon', render: ashenGateTab, parts: AG_PANELS.map(p => partForPartner(p.id))},
  {id: 'companions', label: 'Companions', icon: 'fa-solid fa-horse', render: companionsTab, parts: ['companions']},
  {id: 'journey', label: 'Journey (alpha)', icon: 'fa-solid fa-book-open', render: journeyTab, parts: ['journey']},
  {id: 'gm-setup', label: 'GM Setup', icon: 'fa-solid fa-gear', render: gmSetupTab, gmOnly: true}
];
/** Tabs this user may open: GM Setup is GM-only; players don't get tabs whose parts are all hidden from them. */
export const visibleTabs = (user = globalThis.game?.user) => TABS.filter(t => user?.isGM === true || (!t.gmOnly && (!t.parts || t.parts.some(k => canSee(k, user)))));
/** For the GM: the reason a tab is hidden from players (every part hidden), else null. */
const tabHiddenReason = t => t.parts?.length && t.parts.every(k => hiddenReason(k)) ? hiddenReason(t.parts[0]) : null;

/** The tab rail down the right edge: icon buttons, label on hover (title) and for screen readers (aria-label). */
export function tabsHtml(active, sheet = null) {
  const gm = globalThis.game?.user?.isGM === true;
  return `<div class="agch-railcol"><nav class="agch-rail" role="tablist" aria-orientation="vertical" aria-label="Character Hub sections">${visibleTabs().map(t => {
    const hidden = gm ? tabHiddenReason(t) : null, label = hidden ? `${t.label} (hidden from players: ${hidden})` : t.label;
    return `<button type="button" role="tab" data-action="hub-tab" data-tab="${t.id}" data-ag-always aria-selected="${t.id === active}" class="agch-rail__tab${t.id === active ? ' active' : ''}${hidden ? ' is-hidden' : ''}" title="${esc(label)}" aria-label="${esc(label)}"><i class="${t.icon}" aria-hidden="true"></i>${hidden ? '<i class="fa-solid fa-eye-slash agch-rail__hidden" aria-hidden="true"></i>' : ''}</button>`;
  }).join('')}</nav>${agBarHtml(active, sheet)}</div>`;
}

/**
 * Ashen Gate quick bar: a second button group at the bottom of the rail, growing upward. The first four show that
 * module's own view in the Ashen Gate tab; Headquarters and Locations open their module's main window. Players only
 * get the ones shown to them (the GM's switch, the module active, its Player Access on); the GM also sees missing
 * modules, greyed out.
 */
export const AG_BAR = [
  {id: 'ashen-gate-profession-ledger', label: 'Professions', icon: 'fa-solid fa-hammer', view: true},
  {id: 'ashen-gate-skill-trees', label: 'Skill Trees', icon: 'fa-solid fa-diagram-project', view: true},
  {id: 'ashen-gate-cinders', label: 'Cinders', icon: 'fa-solid fa-fire', view: true},
  {id: 'ashen-gate-factions', label: 'Renown', icon: 'fa-solid fa-flag', view: true},
  {id: 'ashen-gate-quest-manager', label: 'Quests', icon: 'fa-solid fa-scroll', view: true},
  {id: 'ashen-gate-headquarters', label: 'Headquarters', icon: 'fa-solid fa-chess-rook'},
  {id: 'ashen-gate-locations', label: 'Locations', icon: 'fa-solid fa-map-location-dot'}
];
/** For a player, a section whose summary refuses them is left out, as in the Ashen Gate tab's sub-tabs. */
function refusedFor(b, actor) {
  if (!b.view || !actor || globalThis.game?.user?.isGM === true) return false;
  const panel = AG_PANELS.find(p => p.id === b.id);
  if (!panel || embedApi(panel.id, panel.embedMode)) return false;
  return panelState(panel, actor).refused === true;
}
export function agBarHtml(active = null, sheet = null) {
  const actor = sheet?.document ?? null;
  const buttons = AG_BAR.filter(b => canSee(partForPartner(b.id)) && !refusedFor(b, actor)).map(b => {
    const api = partnerApi(b.id), usable = !!api && (b.view || typeof api.open === 'function');
    const current = b.view && active === 'ashen-gate' && (sheet?.agTab ?? agPanelsFor()[0]?.id) === b.id;
    const label = !api ? `${b.label} (module not active)` : b.view ? `${b.label} (show here)` : `Open ${b.label}`;
    return `<button type="button" class="agch-rail__tab agch-agbar__btn${current ? ' active' : ''}${usable ? '' : ' is-missing'}" data-action="${b.view ? 'ag-jump' : 'partner-open'}" data-partner="${b.id}"${usable ? ' data-ag-always' : ' disabled'} title="${esc(label)}" aria-label="${esc(label)}"${b.view ? ` aria-pressed="${current}"` : ''}><i class="${b.icon}" aria-hidden="true"></i></button>`;
  });
  return buttons.length ? `<nav class="agch-rail agch-agbar" aria-label="Ashen Gate modules">${buttons.join('')}</nav>` : '';
}
export function shellHtml(ctx) {
  const {actor, tab} = ctx;
  const version = globalThis.game?.modules?.get?.(MODULE_ID)?.version ?? '';
  const top = `<header class="ag-header"><h1>Ashen Gate | Character Hub</h1><div class="ag-header__actions">
    <label class="agch-opacity" title="Window background opacity (only for you): slide left to see the map behind"><i class="fa-solid fa-circle-half-stroke" aria-hidden="true"></i><input type="range" min="${OPACITY_MIN}" max="100" step="5" value="${windowOpacity()}" data-opacity data-ag-always aria-label="Window background opacity"></label>
    <span class="ag-version">v${esc(version)}</span>
    ${btn('open-native', 'Open native sheet', {kind: 'ghost', icon: 'fa-solid fa-file-lines', always: true, title: 'Open the standard dnd5e character sheet'})}
    ${btn('help', 'Help', {kind: 'ghost', icon: 'fa-solid fa-circle-question', always: true})}</div></header>`;
  if (ctx.limited) return `<div class="agch-root agch-root--limited">${top}<section class="agch-hero ag-card"><img class="agch-portrait" src="${esc(actor.img)}" alt=""><div class="agch-identity"><h2 class="agch-name">${esc(actor.name)}</h2><p class="agch-sub">You have limited access to this character.</p></div></section></div>`;
  const tabs = visibleTabs(), current = tabs.find(t => t.id === tab) ?? tabs[0];
  const notice = ctx.editable ? '' : '<p class="agch-notice" role="note"><i class="fa-solid fa-eye" aria-hidden="true"></i> View only: you can look but not change or roll for this character.</p>';
  if (!current) return `<div class="agch-root">${top}<div class="agch-split">${characterPanelHtml(ctx)}
    <section class="agch-pane"><p class="ag-empty">The GM hasn't shared any other sections yet.</p></section></div>${hotbarsHtml(ctx)}</div>`;
  return `<div class="agch-root">${top}<div class="agch-split">${characterPanelHtml(ctx)}
    <section class="agch-pane"><h2 class="agch-pane__title"><i class="${current.icon}" aria-hidden="true"></i> ${esc(current.label)}${current.parts ? hiddenBadge(current.parts) : ''}</h2>${notice}
    <div class="agch-body" role="tabpanel" aria-label="${esc(current.label)}">${current.render(ctx)}</div></section>${tabsHtml(current.id, ctx.sheet)}</div>${hotbarsHtml(ctx)}</div>`;
}

export function errorHtml(err) {
  return `<div class="agch-root"><div class="ag-card agch-error" role="alert"><h3>The Character Hub could not be drawn</h3>
    <p>${esc(err?.message ?? String(err))}</p><p class="agch-muted">The character is unchanged. Retry, or use the native sheet. The error is also in the browser console (F12).</p>
    ${btn('retry', 'Retry', {kind: 'primary', icon: 'fa-solid fa-rotate', always: true})} ${btn('open-native', 'Open native sheet', {icon: 'fa-solid fa-file-lines', always: true})}</div></div>`;
}
