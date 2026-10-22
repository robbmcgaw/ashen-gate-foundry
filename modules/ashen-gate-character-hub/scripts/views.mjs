/**
 * HTML for the hub. Tabs are a plain ordered registry so sections can be reordered or added later
 * without touching the sheet class. Every value is read from the live Actor at render time.
 */
import {MODULE_ID, esc, signed} from './constants.mjs';
import {skillsData, overviewData} from './data.mjs';
import {characterPanelHtml, compactPanelHtml, levelUpBtn, restoreBtn} from './character.mjs';
import {canPopOut, isPoppedOut} from './popout.mjs';
import {btn} from './buttons.mjs';
import {ITEM_TABS} from './tabs.mjs';
import {ashenGateTab, AG_PANELS, agPanelsFor, partnerApi, embedApi, panelState, knownProfessions} from './partners.mjs';
import {canSee, hiddenReason, hiddenBadge, partForPartner} from './visibility.mjs';
import {companionsTab, gmSetupTab} from './companion-views.mjs';
import {configAttrs} from './configure.mjs';
import {hotbarsHtml} from './hotbar-views.mjs';
import {journeyTab} from './journey-views.mjs';
import {sectionHtml, sectionKey} from './collapse.mjs';
import {lookMenuHtml} from './look.mjs';
import {codexBtn} from './codex.mjs';

export {btn, levelUpBtn, restoreBtn};

function overviewTab(ctx) {
  const {actor, editable} = ctx, off = !editable, o = overviewData(actor);
  const cfg = (kind, key) => off ? '' : configAttrs(kind, key), rc = off ? '' : ' (right-click to configure)';
  const icon = p => p >= 2 ? 'fa-solid fa-angles-up' : p >= 1 ? 'fa-solid fa-circle' : p > 0 ? 'fa-solid fa-circle-half-stroke' : 'fa-regular fa-circle';
  const skills = skillsData(actor).map(s => `<li${cfg('skill', s.key)}><button type="button" class="agch-row" data-action="roll-skill" data-skill="${esc(s.key)}"${off ? ' disabled' : ''} data-tooltip="${esc(s.label)} check${rc}" aria-label="${esc(s.label)} check, ${esc(s.profLabel)}">
      <i class="${icon(s.prof)} agch-prof" data-tooltip="${esc(s.profLabel)}" aria-hidden="true"></i><span class="agch-row__name">${esc(s.label)}</span>
      <span class="agch-muted agch-row__abbr">${esc(s.abilityAbbr)}</span><span class="agch-row__value">${signed(s.total)}</span><span class="agch-muted agch-row__passive" data-tooltip="Passive">${s.passive}</span></button></li>`).join('');
  const kv = rows => `<dl class="agch-kv">${rows.map(([k, v, attrs = '']) => `<div class="agch-kv__row"${attrs}><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  const TRAIT_KEYS = {Armor: 'armor', Weapons: 'weapon', Tools: 'tool', Languages: 'languages'};
  const skillHead = '<li class="agch-zebra__head" aria-hidden="true"><span></span><span class="agch-row__name">Skill</span><span class="agch-row__abbr">Abil.</span><span class="agch-row__value">Mod</span><span class="agch-row__passive">Pass.</span></li>';
  return `<div class="agch-overview">
    <div class="agch-overview__col">${sectionHtml(sectionKey('overview', 'skills'), 'Skills', `<ul class="ag-list agch-zebra agch-skills">${skills ? skillHead + skills : '<li class="ag-empty"><p class="ag-empty__title">No skills yet.</p></li>'}</ul>`)}</div>
    <div class="agch-overview__col">
      ${sectionHtml(sectionKey('overview', 'passives'), 'Passives &amp; Senses', kv([...o.passives.map(p => [`Passive ${p.label}`, String(p.value)]), ['Senses', esc(o.senses.join(', ') || 'None'), cfg('senses')]]))}
      ${sectionHtml(sectionKey('overview', 'proficiencies'), 'Proficiencies', kv(o.proficiencies.map(p => [p.label, esc(p.list.join(', ') || 'None'), TRAIT_KEYS[p.label] ? cfg('trait', TRAIT_KEYS[p.label]) : ''])))}
      ${professionsBox(actor)}
    </div></div>
    <p class="agch-muted agch-hint">Ability checks and saving throws roll from the ability tiles on the left.${off ? '' : ' Right-click a skill, sense or proficiency (or AC, speed, initiative, HP, an ability on the left), or use Configure… under the name, to open dnd5e\'s own settings for it.'}</p>`;
}

/**
 * Professions under Proficiencies (0.30.0): name and level from the Profession Ledger (knownProfessions). The box is a
 * button that jumps to Ashen Gate → Professions. No box when the Ledger is absent or Professions is hidden.
 */
export function professionsBox(actor) {
  const list = knownProfessions(actor);
  if (!list) return '';
  const rows = list.map(p => `<span class="agch-profbox__row"><span class="agch-profbox__name">${esc(p.name)}</span><span class="agch-profbox__level">Level ${p.level}</span></span>`).join('');
  const body = `<button type="button" class="agch-profbox" data-action="ag-jump" data-partner="ashen-gate-profession-ledger" data-ag-always data-tooltip="Show Ashen Gate → Professions" aria-label="${esc(`Professions: ${list.map(p => `${p.name} level ${p.level}`).join(', ') || 'none yet'}. Show Ashen Gate → Professions`)}">
    ${rows || '<span class="agch-profbox__row agch-muted">No professions yet.</span>'}</button>`;
  return sectionHtml(sectionKey('overview', 'professions'), `Professions${hiddenBadge('professions')}`, body);
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
  {id: 'journey', label: 'Journey', icon: 'fa-solid fa-book-open', render: journeyTab, parts: ['journey']},
  {id: 'gm-setup', label: 'GM Setup', icon: 'fa-solid fa-gear', render: gmSetupTab, gmOnly: true}
];
/** Tabs this user may open: GM Setup is GM-only; players don't get tabs whose parts are all hidden from them. */
export const visibleTabs = (user = globalThis.game?.user) => TABS.filter(t => user?.isGM === true || (!t.gmOnly && (!t.parts || t.parts.some(k => canSee(k, user)))));
/** For the GM: the reason a tab is hidden from players (every part hidden), else null. */
const tabHiddenReason = t => t.parts?.length && t.parts.every(k => hiddenReason(k)) ? hiddenReason(t.parts[0]) : null;

/** The id of the Hub's tab panel (one per open Hub), which every rail tab controls. */
export const panelId = sheet => `${String(sheet?.id ?? 'agch').replace(/[^A-Za-z0-9_-]/g, '')}-tabpanel`;
/**
 * The tab rail down the right edge (kit .ag-siderail). 0.33.0 (CH-01): each tab carries its text label, shown beside the
 * icon when the Hub is wide enough (character-hub.css) and kept for screen readers and the tooltip otherwise. GM Setup
 * is marked GM (kit .ag-tab--gm). CH-20: aria-controls points at the panel; the sheet binds the arrow keys (bindTablist).
 */
export function tabsHtml(active, sheet = null) {
  const gm = globalThis.game?.user?.isGM === true, controls = panelId(sheet);
  return `<div class="agch-railcol"><nav class="ag-siderail agch-rail" role="tablist" aria-orientation="vertical" aria-label="Character Hub sections">${visibleTabs().map(t => {
    const hidden = gm ? tabHiddenReason(t) : null, label = hidden ? `${t.label} (hidden from players: ${hidden})` : t.label, on = t.id === active;
    return `<button type="button" role="tab" id="${controls}-tab-${t.id}" data-action="hub-tab" data-tab="${t.id}" data-ag-always aria-selected="${on}" aria-controls="${controls}" tabindex="${on ? 0 : -1}" class="agch-rail__tab${on ? ' active' : ''}${hidden ? ' is-hidden' : ''}${t.gmOnly ? ' ag-tab--gm' : ''}" aria-label="${esc(t.gmOnly ? `${label} (GM only)` : label)}" data-tooltip="${esc(label)}" data-tooltip-direction="LEFT"><i class="${t.icon}" aria-hidden="true"></i><span class="agch-rail__label" aria-hidden="true">${esc(t.label)}</span>${hidden ? '<i class="fa-solid fa-eye-slash agch-rail__hidden" aria-hidden="true"></i>' : ''}</button>`;
  }).join('')}</nav></div>`;
}

/**
 * Ashen Gate quick bar: a thin bar along the bottom edge of the Hub (0.29.0), hidden in Compact. 0.33.0 (CH-10): one
 * button per Ashen Gate sub-tab, with the same name and icon, and every one shows that module's view in the Ashen Gate
 * tab (its Open button there opens the module's own window). Players only get the ones shown to them (the GM's switch,
 * the module active, its Player Access on); the GM also sees missing modules, greyed out.
 */
export const AG_BAR = AG_PANELS.map(p => ({id: p.id, label: p.tab, icon: p.icon, view: true}));
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
    const usable = !!partnerApi(b.id);
    const current = active === 'ashen-gate' && (sheet?.agTab ?? agPanelsFor()[0]?.id) === b.id;
    const label = usable ? `Show ${b.label}` : `${b.label} (module not active)`;
    return `<button type="button" class="ag-btn ag-btn--ghost ag-btn--icon agch-agbar__btn${current ? ' active' : ''}${usable ? '' : ' is-missing'}" data-action="ag-jump" data-partner="${b.id}"${usable ? ' data-ag-always' : ' disabled'} aria-label="${esc(label)}" data-tooltip="${esc(label)}" data-tooltip-direction="UP" aria-pressed="${current}"><i class="${b.icon}" aria-hidden="true"></i></button>`;
  });
  return buttons.length ? `<nav class="agch-agbar" aria-label="Ashen Gate modules">${buttons.join('')}</nav>` : '';
}
/**
 * Compact / Full (0.29.0): one toggle button, pressed while Compact is on. The label says what a click switches to; the
 * tooltip says what it does. Only for you (client setting).
 */
export function compactBtn(compact) {
  const tip = compact ? 'Switch to the Full Hub (only for you)' : 'Switch to Compact: the character column with marks and the quick bar, in a small window (only for you)';
  return `<button type="button" class="ag-btn ag-btn--ghost agch-compact" data-action="compact-toggle" data-ag-always aria-pressed="${compact}" data-tooltip="${esc(tip)}"><i class="fa-solid ${compact ? 'fa-up-right-and-down-left-from-center' : 'fa-down-left-and-up-right-to-center'}" aria-hidden="true"></i><span>${compact ? 'Full' : 'Compact'}</span></button>`;
}
/** Pop out / Pop in (0.29.0): Foundry's own detach into a separate browser window; not offered where Foundry can't. */
export function popOutBtn(sheet) {
  if (!sheet || !canPopOut(sheet)) return '';
  const out = isPoppedOut(sheet);
  return btn('pop-out', out ? 'Pop in' : 'Pop out', {kind: 'ghost', extra: 'agch-menu__btn', icon: out ? 'fa-solid fa-arrow-right-to-bracket' : 'fa-solid fa-arrow-up-right-from-square', always: true,
    title: out ? 'Put the Hub back in the main Foundry window' : 'Open the Hub in its own browser window (e.g. on a second screen)'});
}
/**
 * The header's "⋯" menu (0.33.0, CH-03/CH-04): Appearance…, Pop out / Pop in, NPC Codex (when General Manager offers it
 * to this user) and Open native sheet, in Full, Compact and the limited view alike. The Appearance menu opens in the
 * same place (sheet.menu 'look').
 */
export function moreMenuHtml(sheet) {
  const open = sheet?.menu === 'more' ? 'more' : sheet?.menu === 'look' ? 'look' : null;
  const menu = open === 'more' ? `<div class="agch-menu agch-moremenu" role="group" aria-label="More">
    ${btn('look-menu', 'Appearance…', {kind: 'ghost', extra: 'agch-menu__btn', icon: 'fa-solid fa-palette', always: true, title: 'Change how the Hub looks for you (only for you)'})}
    ${popOutBtn(sheet)}${codexBtn({menu: true})}
    ${btn('open-native', 'Open native sheet', {kind: 'ghost', extra: 'agch-menu__btn', icon: 'fa-solid fa-file-lines', always: true, title: 'Open the standard dnd5e character sheet'})}</div>`
    : open === 'look' ? lookMenuHtml(sheet) : '';
  return `<span class="agch-lookwrap"><button type="button" class="ag-btn ag-btn--ghost ag-btn--icon agch-morebtn" data-action="more-menu" data-ag-always aria-haspopup="true" aria-expanded="${open !== null}" aria-label="More: appearance, pop out, NPC Codex, native sheet" data-tooltip="More: Appearance, Pop out, NPC Codex, Open native sheet"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button>${menu}</span>`;
}
/** Header (0.33.0): brand left; Compact / Full and the "⋯" menu; version and Help together at the far right. */
export function headerHtml(ctx, compact) {
  const version = globalThis.game?.modules?.get?.(MODULE_ID)?.version ?? '';
  return `<header class="ag-header"><h1><span class="ag-header__brand">Ashen Gate</span> | Character Hub</h1><div class="ag-header__actions">
    ${ctx.limited ? '' : compactBtn(compact)}${moreMenuHtml(ctx.sheet)}
    <span class="ag-header__meta agch-head__meta"><span class="ag-version">v${esc(version)}</span>
    ${btn('help', 'Help', {kind: 'ghost', extra: 'ag-btn--sm', icon: 'fa-solid fa-circle-question', always: true})}</span></div></header>`;
}
export function shellHtml(ctx) {
  const {actor, tab} = ctx, compact = ctx.compact === true && !ctx.limited;
  const top = headerHtml(ctx, compact);
  if (ctx.limited) return `<div class="agch-root agch-root--limited">${top}<section class="agch-hero ag-card"><img class="agch-portrait" src="${esc(actor.img)}" alt=""><div class="agch-ident__text"><h2 class="agch-name">${esc(actor.name)}</h2><p class="agch-sub">You have limited access to this character.</p></div></section></div>`;
  if (compact) return `<div class="agch-root agch-root--compact">${top}${compactPanelHtml(ctx)}${hotbarsHtml(ctx)}</div>`;
  const tabs = visibleTabs(), current = tabs.find(t => t.id === tab) ?? tabs[0];
  const folded = ctx.sheet?.charFolded !== false ? ' agch-root--charfolded' : '';
  const notice = ctx.editable ? '' : '<p class="ag-notice ag-notice--info agch-notice" role="note"><i class="fa-solid fa-eye" aria-hidden="true"></i> View only: you can look but not change or roll for this character.</p>';
  if (!current) return `<div class="agch-root${folded}">${top}<div class="agch-split">${characterPanelHtml(ctx)}
    <section class="agch-pane"><div class="ag-empty"><p class="ag-empty__title">Nothing shared yet.</p><p class="ag-empty__text">Your GM hasn't shared any other sections yet.</p></div></section></div>${hotbarsHtml(ctx)}</div>`;
  return `<div class="agch-root${folded}">${top}<div class="agch-split">${characterPanelHtml(ctx)}
    <section class="agch-pane"><h2 class="agch-pane__title"><i class="${current.icon}" aria-hidden="true"></i> ${esc(current.label)}${current.parts ? hiddenBadge(current.parts) : ''}</h2>${notice}
    <div class="agch-body" id="${panelId(ctx.sheet)}" role="tabpanel" aria-labelledby="${panelId(ctx.sheet)}-tab-${current.id}">${current.render(ctx)}</div></section>${tabsHtml(current.id, ctx.sheet)}</div>${hotbarsHtml(ctx)}${agBarHtml(current.id, ctx.sheet)}</div>`;
}

export function errorHtml(err) {
  return `<div class="agch-root"><div class="ag-card agch-error" role="alert"><h3>The Character Hub could not be drawn</h3>
    <p>${esc(err?.message ?? String(err))}</p><p class="agch-muted">The character is unchanged. Retry, or use the native sheet. The error is also in the browser console (F12).</p>
    ${btn('retry', 'Retry', {kind: 'primary', icon: 'fa-solid fa-rotate', always: true})} ${btn('open-native', 'Open native sheet', {icon: 'fa-solid fa-file-lines', always: true})}</div></div>`;
}
