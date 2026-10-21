/**
 * HTML for the hub. Tabs are a plain ordered registry so sections can be reordered or added later
 * without touching the sheet class. Every value is read from the live Actor at render time.
 */
import {MODULE_ID, esc, signed} from './constants.mjs';
import {abilitiesData, skillsData, overviewData} from './data.mjs';
import {characterPanelHtml, compactPanelHtml} from './character.mjs';
import {canPopOut, isPoppedOut} from './popout.mjs';
import {compactOpacityHtml} from './compact-opacity.mjs';
import {btn} from './buttons.mjs';
import {ITEM_TABS} from './tabs.mjs';
import {ashenGateTab, AG_PANELS, agPanelsFor, partnerApi, embedApi, panelState} from './partners.mjs';
import {canSee, hiddenReason, hiddenBadge, partForPartner} from './visibility.mjs';
import {companionsTab, gmSetupTab} from './companion-views.mjs';
import {configAttrs} from './configure.mjs';
import {hotbarsHtml} from './hotbar-views.mjs';
import {journeyTab} from './journey-views.mjs';
import {sectionHtml, sectionKey} from './collapse.mjs';
import {levelUpState} from './level-up.mjs';
import {backupsFor} from './level-restore.mjs';
import {isBackup} from './level-backup.mjs';

export {btn};

function overviewTab(ctx) {
  const {actor, editable} = ctx, off = !editable, o = overviewData(actor);
  const cfg = (kind, key) => off ? '' : configAttrs(kind, key), rc = off ? '' : ' (right-click to configure)';
  const icon = p => p >= 2 ? 'fa-solid fa-angles-up' : p >= 1 ? 'fa-solid fa-circle' : p > 0 ? 'fa-solid fa-circle-half-stroke' : 'fa-regular fa-circle';
  const skills = skillsData(actor).map(s => `<li${cfg('skill', s.key)}><button type="button" class="agch-row" data-action="roll-skill" data-skill="${esc(s.key)}"${off ? ' disabled' : ''} data-tooltip="${esc(s.label)} check${rc}" aria-label="${esc(s.label)} check, ${esc(s.profLabel)}">
      <i class="${icon(s.prof)} agch-prof" data-tooltip="${esc(s.profLabel)}" aria-hidden="true"></i><span class="agch-row__name">${esc(s.label)}</span>
      <span class="agch-muted agch-row__abbr">${esc(s.abilityAbbr)}</span><span class="agch-row__value">${signed(s.total)}</span><span class="agch-muted agch-row__passive" data-tooltip="Passive">${s.passive}</span></button></li>`).join('');
  const saves = abilitiesData(actor).map(a => `<li${cfg('ability', a.key)}><button type="button" class="agch-row" data-action="roll-save" data-ability="${esc(a.key)}"${off ? ' disabled' : ''} data-tooltip="${esc(a.label)} saving throw${rc}" aria-label="${esc(a.label)} saving throw${a.saveProficient ? ', proficient' : ''}">
      <i class="${icon(a.saveProficient ? 1 : 0)} agch-prof" aria-hidden="true"></i><span class="agch-row__name">${esc(a.label)}</span><span class="agch-row__value">${signed(a.save)}</span></button></li>`).join('');
  const kv = rows => `<dl class="agch-kv">${rows.map(([k, v, attrs = '']) => `<div class="agch-kv__row"${attrs}><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  const TRAIT_KEYS = {Armor: 'armor', Weapons: 'weapon', Tools: 'tool', Languages: 'languages'};
  const skillHead = '<li class="agch-zebra__head" aria-hidden="true"><span></span><span class="agch-row__name">Skill</span><span class="agch-row__abbr">Abil.</span><span class="agch-row__value">Mod</span><span class="agch-row__passive">Pass.</span></li>';
  return `<div class="agch-overview">
    <div class="agch-overview__col">${sectionHtml(sectionKey('overview', 'skills'), 'Skills', `<ul class="ag-list agch-zebra agch-skills">${skills ? skillHead + skills : '<li class="ag-empty"><p class="ag-empty__title">No skills yet.</p></li>'}</ul>`)}</div>
    <div class="agch-overview__col">
      ${sectionHtml(sectionKey('overview', 'saves'), 'Saving Throws', `<ul class="ag-list agch-zebra agch-saves">${saves || '<li class="ag-empty"><p class="ag-empty__title">No abilities yet.</p></li>'}</ul>`)}
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

/** The tab rail down the right edge (kit .ag-siderail): icon buttons, label in a Foundry tooltip and for screen readers. */
export function tabsHtml(active) {
  const gm = globalThis.game?.user?.isGM === true;
  return `<div class="agch-railcol"><nav class="ag-siderail agch-rail" role="tablist" aria-orientation="vertical" aria-label="Character Hub sections">${visibleTabs().map(t => {
    const hidden = gm ? tabHiddenReason(t) : null, label = hidden ? `${t.label} (hidden from players: ${hidden})` : t.label;
    return `<button type="button" role="tab" data-action="hub-tab" data-tab="${t.id}" data-ag-always aria-selected="${t.id === active}" class="agch-rail__tab${t.id === active ? ' active' : ''}${hidden ? ' is-hidden' : ''}" aria-label="${esc(label)}" data-tooltip="${esc(label)}" data-tooltip-direction="LEFT"><i class="${t.icon}" aria-hidden="true"></i>${hidden ? '<i class="fa-solid fa-eye-slash agch-rail__hidden" aria-hidden="true"></i>' : ''}</button>`;
  }).join('')}</nav></div>`;
}

/**
 * Ashen Gate quick bar: a thin bar along the bottom edge of the Hub (0.29.0; it sat under the tab rail before), hidden
 * in Compact. The first four show that
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
    return `<button type="button" class="ag-btn ag-btn--ghost ag-btn--icon agch-agbar__btn${current ? ' active' : ''}${usable ? '' : ' is-missing'}" data-action="${b.view ? 'ag-jump' : 'partner-open'}" data-partner="${b.id}"${usable ? ' data-ag-always' : ' disabled'} aria-label="${esc(label)}" data-tooltip="${esc(label)}" data-tooltip-direction="UP"${b.view ? ` aria-pressed="${current}"` : ''}><i class="${b.icon}" aria-hidden="true"></i></button>`;
  });
  return buttons.length ? `<nav class="agch-agbar" aria-label="Ashen Gate modules">${buttons.join('')}</nav>` : '';
}
/**
 * Level up (0.27.0): starts dnd5e's own level-up. When it isn't ready it stays clickable but aria-disabled, so a
 * click can say why (a disabled button shows no tooltip); the reason is also its tooltip.
 */
function levelUpBtn(actor) {
  const s = levelUpState(actor);
  return `<button type="button" class="ag-btn ag-btn--ghost agch-levelup" data-action="level-up" data-ag-always${s.ok ? '' : ' aria-disabled="true"'} data-tooltip="${esc(s.ok ? 'Start dnd5e\'s level-up for this character' : s.reason)}" aria-label="${esc(s.ok ? 'Level up' : `Level up: ${s.reason}`)}"><i class="fa-solid fa-arrow-up-right-dots" aria-hidden="true"></i><span>Level up</span></button>`;
}
/**
 * Restore (0.28.0): GM only. On a character with level backups, "Restore backup"; on a backup copy, "Restore this
 * backup". Nothing for players (restoreBackup refuses them anyway).
 */
function restoreBtn(actor) {
  if (globalThis.game?.user?.isGM !== true) return '';
  const copy = isBackup(actor), count = copy ? 1 : backupsFor(actor).length;
  if (!count) return '';
  const source = copy ? actor.flags[MODULE_ID].levelBackup.sourceName ?? 'the character' : null;
  return btn('level-restore', copy ? 'Restore this backup' : 'Restore backup', {kind: 'ghost', icon: 'fa-solid fa-clock-rotate-left', always: true,
    title: copy ? `Put this copy back onto ${source} (GM; asks first)` : `Put one of ${actor.name}'s ${count} level backup${count === 1 ? '' : 's'} back onto it (GM; asks first)`});
}
/**
 * Compact / Full (0.29.0): one toggle button, pressed while Compact is on. The label says what it is now; the tooltip
 * says what a click does. Only for you (client setting).
 */
export function compactBtn(compact) {
  const tip = compact ? 'Compact view is on: click for the Full Hub (only for you)' : 'Compact view: only the art, equipment slots, HP and quick bar, in a small window (only for you)';
  return `<button type="button" class="ag-btn ag-btn--ghost agch-compact" data-action="compact-toggle" data-ag-always aria-pressed="${compact}" data-tooltip="${esc(tip)}" aria-label="${esc(tip)}"><i class="fa-solid ${compact ? 'fa-up-right-and-down-left-from-center' : 'fa-down-left-and-up-right-to-center'}" aria-hidden="true"></i><span>${compact ? 'Full' : 'Compact'}</span></button>`;
}
/** Pop out / Pop in (0.29.0): Foundry's own detach into a separate browser window; not shown where Foundry can't. */
export function popOutBtn(sheet) {
  if (!sheet || !canPopOut(sheet)) return '';
  const out = isPoppedOut(sheet);
  return btn('pop-out', out ? 'Pop in' : 'Pop out', {kind: 'ghost', icon: out ? 'fa-solid fa-arrow-right-to-bracket' : 'fa-solid fa-arrow-up-right-from-square', always: true,
    title: out ? 'Put the Hub back in the main Foundry window' : 'Open the Hub in its own browser window (e.g. on a second screen)'});
}
export function shellHtml(ctx) {
  const {actor, tab} = ctx, compact = ctx.compact === true && !ctx.limited;
  const version = globalThis.game?.modules?.get?.(MODULE_ID)?.version ?? '';
  const top = `<header class="ag-header"><h1><span class="ag-header__brand">Ashen Gate</span> | Character Hub</h1><div class="ag-header__actions">
    ${ctx.limited ? '' : compactBtn(compact)}${compact ? compactOpacityHtml() : ''}${popOutBtn(ctx.sheet)}
    ${ctx.limited || compact ? '' : `${levelUpBtn(actor)}${restoreBtn(actor)}`}
    ${compact ? '' : btn('open-native', 'Open native sheet', {kind: 'ghost', icon: 'fa-solid fa-file-lines', always: true, title: 'Open the standard dnd5e character sheet'})}
    <span class="ag-version">v${esc(version)}</span>
    ${btn('help', 'Help', {kind: 'ghost', extra: 'ag-btn--sm', icon: 'fa-solid fa-circle-question', always: true})}</div></header>`;
  if (ctx.limited) return `<div class="agch-root agch-root--limited">${top}<section class="agch-hero ag-card"><img class="agch-portrait" src="${esc(actor.img)}" alt=""><div class="agch-ident__text"><h2 class="agch-name">${esc(actor.name)}</h2><p class="agch-sub">You have limited access to this character.</p></div></section></div>`;
  if (compact) return `<div class="agch-root agch-root--compact">${top}${compactPanelHtml(ctx)}${hotbarsHtml(ctx)}</div>`;
  const tabs = visibleTabs(), current = tabs.find(t => t.id === tab) ?? tabs[0];
  const notice = ctx.editable ? '' : '<p class="ag-notice ag-notice--info agch-notice" role="note"><i class="fa-solid fa-eye" aria-hidden="true"></i> View only: you can look but not change or roll for this character.</p>';
  if (!current) return `<div class="agch-root">${top}<div class="agch-split">${characterPanelHtml(ctx)}
    <section class="agch-pane"><div class="ag-empty"><p class="ag-empty__title">Nothing shared yet.</p><p class="ag-empty__text">Your GM hasn't shared any other sections yet.</p></div></section></div>${hotbarsHtml(ctx)}</div>`;
  return `<div class="agch-root">${top}<div class="agch-split">${characterPanelHtml(ctx)}
    <section class="agch-pane"><h2 class="agch-pane__title"><i class="${current.icon}" aria-hidden="true"></i> ${esc(current.label)}${current.parts ? hiddenBadge(current.parts) : ''}</h2>${notice}
    <div class="agch-body" role="tabpanel" aria-label="${esc(current.label)}">${current.render(ctx)}</div></section>${tabsHtml(current.id)}</div>${hotbarsHtml(ctx)}${agBarHtml(current.id, ctx.sheet)}</div>`;
}

export function errorHtml(err) {
  return `<div class="agch-root"><div class="ag-card agch-error" role="alert"><h3>The Character Hub could not be drawn</h3>
    <p>${esc(err?.message ?? String(err))}</p><p class="agch-muted">The character is unchanged. Retry, or use the native sheet. The error is also in the browser console (F12).</p>
    ${btn('retry', 'Retry', {kind: 'primary', icon: 'fa-solid fa-rotate', always: true})} ${btn('open-native', 'Open native sheet', {icon: 'fa-solid fa-file-lines', always: true})}</div></div>`;
}
