/**
 * The Travel tab (0.39.0; GM-only "Overland" tab in 0.37.0 to 0.38.0): markup only. app.mjs wires the buttons. Plain labels, no ids, no status words.
 * Players get Today (declare buttons, waiting requests) and the Journal. The GM gets the same plus direct buttons and, last, the GM-only sections.
 * A player's markup is built from the PUBLIC state alone: it never receives conditions, party modifiers or guidance.
 */
import {ACTIONS} from './overland.mjs';
import {SCOUT_LADDER} from './travel-modifiers.mjs';
import {conditionById, MAX_SEVERITY, OVERLAND_CONDITIONS} from './overland-conditions.mjs';
import {ACTION_LABEL} from './overland-preview.mjs';

const title = id => id.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
const TERRAIN_LABEL = {'difficult-terrain': 'Difficult terrain', marsh: 'Marsh', forest: 'Forest', hills: 'Hills', grassland: 'Grassland', road: 'Road'};
export const rowLabel = r => r.terrain !== null ? `${r.label}: ${r.terrain ? TERRAIN_LABEL[r.terrain] ?? title(r.terrain) : 'any terrain'}`
  : r.condition ? `${r.label}: ${conditionById(r.condition)?.label ?? title(r.condition)}` : r.label;
const ICON = {travel: 'fa-solid fa-shoe-prints', scout: 'fa-solid fa-binoculars', explore: 'fa-solid fa-compass'};
const signed = n => `+${n}`;
const off = html => html.replace('<button type="button"', '<button type="button" disabled');

/** One DAILY condition: a 0 to 3 severity control for the chosen scope (saves at once), what the area has persistently, the effective severity and the party's mitigation. */
function conditionRow(c, {esc, here, level, scope}) {
  const levels = Array.from({length: MAX_SEVERITY + 1}, (_, n) => n);
  const persist = here?.persistent?.[c.id] ?? 0, source = here?.sources?.[c.id], effective = here?.effective?.[c.id] ?? c.severity;
  return `<li class="agl-tile agl-ov-cond" data-cond-row="${esc(c.id)}">
    <div class="agl-ov-cond__name"><span class="agl-ov-cond__label">${esc(c.label)}</span><span class="agl-ov-cond__hits">${esc(c.hits)}</span></div>
    <div class="ag-segmented" role="group" aria-label="${esc(c.label)} daily severity">${levels.map(n => `<button type="button" aria-pressed="${level(c.id) === n}" data-action="ov-cond" data-cond="${esc(c.id)}" data-sev="${n}" data-scope="${esc(scope)}" aria-label="${esc(c.label)} daily severity ${n}">${n}</button>`).join('')}</div>
    <p class="agl-ov-cond__math">Here: ${persist ? `${esc(persist)}${source ? ` from ${esc(source.name)}` : ' on this place'}` : 'none set on the place'}. Effective <strong>${esc(effective)}</strong> (the higher of the place and today). Party mitigation ${esc(signed(c.mitigation))} protects the party only.</p></li>`;
}
/** GM only: "Daily conditions", one list of six, for all areas or for the current area. */
function conditionsCard(list, {esc, now, here, area, scope, state}) {
  const level = id => scope === 'area' && area?.id ? state.areaConditions?.[area.id]?.[id] ?? 0 : state.conditions?.[id] ?? 0;
  const scopeBtn = (v, label) => `<button type="button" aria-pressed="${scope === v}" data-action="ov-scope" data-scope="${v}"${v === 'area' && !area?.id ? ' disabled' : ''}>${esc(label)}</button>`;
  return `<section class="ag-card" aria-labelledby="agl-ov-conds"><h3 id="agl-ov-conds">Daily conditions: weather and temporary effects ${now}</h3>
    <p class="agl-hint">Set how bad each one is today, 0 (none) to 3. They are an overlay for the whole day and combine with the severities set on Locations and Regions (the higher one counts; they never add). New day… clears only these. Nothing is applied for you.</p>
    <div class="ag-field agl-field"><span id="agl-ov-scope-l">Apply to</span><div class="ag-segmented" role="group" aria-labelledby="agl-ov-scope-l">${scopeBtn('all', 'All areas')}${scopeBtn('area', area?.id ? area.name : 'Current area')}</div></div>
    <ul class="agl-ov-conds" aria-label="Daily conditions">${list.map(c => conditionRow(c, {esc, here, level, scope})).join('')}</ul></section>`;
}
/** GM only: the party modifiers table and the Scout ladder. */
function modifiersCard(mods, {esc}) {
  const sources = r => `<ul class="agl-ov-sources">${r.sources.map(s => `<li>${esc(s.name)}${s.character ? ` (${esc(s.character)})` : ''}: ${esc(signed(s.value))}${s.counted ? '' : ` <span class="agl-hint">Not counted: ${esc(s.note || 'not used')}</span>`}</li>`).join('')}</ul>`;
  const table = mods.rows.length ? `<div class="ag-table-wrap"><table class="ag-table agl-ov-table"><caption class="ag-sr-only">Party travel modifiers</caption>
      <thead><tr><th scope="col">Modifier</th><th scope="col" class="is-num">Total</th><th scope="col">Cap</th><th scope="col">Sources</th></tr></thead>
      <tbody>${mods.rows.map(r => `<tr><th scope="row">${esc(rowLabel(r))}${r.unit ? `<br><span class="agl-hint">${esc(r.unit)}</span>` : ''}</th><td class="is-num">${esc(signed(r.total))}</td>
        <td>${r.cap == null ? 'No cap' : `Up to ${esc(signed(r.cap))}${r.capped ? ' (reached)' : ''}`}</td><td>${sources(r)}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="ag-empty"><i class="fa-solid fa-person-hiking" aria-hidden="true"></i><p class="ag-empty__title">No travel modifiers yet</p>
      <p class="ag-empty__text">Items and perks with travel modifiers show here while a player's character carries them (equipment when equipped).</p></div>`;
  return `<section class="ag-card" aria-labelledby="agl-ov-mods"><h3 id="agl-ov-mods">Party modifiers</h3>
        ${table}
        <p class="agl-hint">Read only. Within a stacking group only the best source counts, across the whole party; different groups add up to the cap. Gear set to familiar terrain is your call and is never added.</p>
        <p class="agl-hint"><strong>Scout precision</strong> is a guide, not a rule: ${SCOUT_LADDER.map(esc).join('; ')}. Anything finer, such as homing in on an exact spot, is yours to decide.</p></section>`;
}

const SHORTCUT_ICON = {beast: 'fa-solid fa-paw', hazard: 'fa-solid fa-triangle-exclamation', table: 'fa-solid fa-table-list', resource: 'fa-solid fa-gem'};
const SHORTCUT_NAME = {beast: 'Beast', hazard: 'Hazard', table: 'Roll table', resource: 'Gathering'};
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const areaOptions = (areas, selected, {esc, first, other = false}) => `<option value="">${esc(first)}</option>${areas.map(a => `<option value="${esc(a.id)}"${a.id === selected ? ' selected' : ''}>${esc(a.name)}${a.kind === 'region' ? ' (Region)' : ''}${a.active ? ' (party marker)' : ''}</option>`).join('')}${other ? `<option value="other"${selected === 'other' ? ' selected' : ''}>Other area (use only daily conditions and overrides)</option>` : ''}`;

/**
 * GM only: the Action preview card (0.40.0). `pv` is api.overland.previewAction(); `ui` is the card's own draft {text, cost (the adjusted cost or null),
 * destination, reached, overrideCond, overrideSev}. One primary button (Resolve); Cancel is a ghost button. Nothing here is rendered for a player.
 */
export function previewCard(pv, ui, {esc, btn, areas = [], now = ''}) {
  const label = ACTION_LABEL[pv.action], cost = ui.cost ?? pv.cost, short = pv.left < cost;
  const unit = n => (n === 1 ? 'action' : 'actions');
  const third = pv.action === 'explore' ? {name: 'Survey range', value: plural(pv.rangeRings, 'ring'), note: pv.rangeRings === 0 ? 'Current tile only' : ''}
    : pv.action === 'scout' ? {name: 'Scout precision', value: `Step ${pv.precision}`, note: SCOUT_LADDER[pv.precision]?.replace(/^\d: /, '') ?? ''}
    : {name: 'Destination', value: pv.destination?.name ?? 'Not chosen', note: pv.terrain ? `Terrain: ${TERRAIN_LABEL[pv.terrain] ?? pv.terrain}` : ''};
  const stat = (name, value, note = '') => `<div class="agl-tile agl-pv__stat"><dt>${esc(name)}</dt><dd><strong class="agl-pv__num">${esc(value)}</strong>${note ? `<span class="agl-hint">${esc(note)}</span>` : ''}</dd></div>`;
  const dest = pv.action === 'travel' ? `<div class="ag-form-grid">
      <div class="ag-field agl-field"><label for="agl-pv-dest">Destination</label><select id="agl-pv-dest">${areaOptions(areas, pv.destination ? (pv.destination.kind === 'other' ? 'other' : pv.destination.id) : '', {esc, first: 'Choose a destination…', other: true})}</select></div>
      <div class="ag-field agl-field"><label for="agl-pv-terrain">Destination terrain</label><select id="agl-pv-terrain"><option value="">No terrain bonus</option>${Object.entries(TERRAIN_LABEL).map(([k, v]) => `<option value="${k}"${pv.terrain === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
      ${pv.navigation?.flag === 'displacement' ? `<div class="ag-field agl-field"><label for="agl-pv-reached">Destination actually reached</label><select id="agl-pv-reached">${areaOptions(areas, ui.reached ?? (pv.destination?.kind === 'other' ? 'other' : pv.destination?.id ?? ''), {esc, first: 'Same as the destination', other: true})}</select></div>` : ''}
    </div>` : '';
  const chips = pv.conditions.length ? `<ul class="ag-chip-group agl-pv__chips" aria-label="Conditions that apply">${pv.conditions.map(c => `<li class="ag-badge">${esc(c.label)} ${esc(c.severity)}</li>`).join('')}</ul>`
    : '<p class="agl-hint">No conditions apply to this action.</p>';
  const shortcuts = pv.shortcuts.length ? `<div class="agl-pv__short" role="group" aria-label="Shortcuts for this area"><span class="agl-hint">Open (nothing is rolled or awarded):</span>
      ${pv.shortcuts.map(x => `<button type="button" class="ag-btn ag-btn--sm ag-btn--ghost" data-action="ov-open" data-uuid="${esc(x.uuid)}" data-loc="${esc(x.locationId)}"><i class="${SHORTCUT_ICON[x.kind]}" aria-hidden="true"></i><span>${esc(SHORTCUT_NAME[x.kind])}: ${esc(x.label)}</span></button>`).join('')}</div>` : '';
  const ov = pv.override;
  const override = `<fieldset class="agl-tile agl-pv__override"><legend>GM override <span class="agl-pv__legend-note">this action only</span></legend>
      <div class="agl-pv__ovrow"><label class="ag-sr-only" for="agl-pv-ovc">Condition to override</label><select id="agl-pv-ovc"><option value="">No override</option>${OVERLAND_CONDITIONS.map(c => `<option value="${c.id}"${ov?.condition === c.id ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</select>
      ${ov ? `<div class="ag-segmented" role="group" aria-label="Override severity">${[0, 1, 2, 3].map(n => `<button type="button" aria-pressed="${ov.severity === n}" data-action="ov-pv-ovsev" data-sev="${n}" aria-label="${esc(OVERLAND_CONDITIONS.find(c => c.id === ov.condition).label)} override severity ${n}">${n}</button>`).join('')}</div>` : ''}</div>
      <p class="agl-hint agl-pv__ovhint">For a spell or a special circumstance: it replaces that condition's severity for this preview only.</p></fieldset>`;
  const stepper = `<div class="ag-field agl-field"><span id="agl-pv-cost-l">Adjust cost</span><div class="agl-pv__step" role="group" aria-labelledby="agl-pv-cost-l">
      <button type="button" class="ag-btn ag-btn--sm" data-action="ov-pv-cost" data-delta="-1" aria-label="Lower the cost"${cost <= 0 ? ' disabled' : ''}>−</button>
      <output id="agl-pv-cost" aria-live="polite">${esc(cost)}</output>
      <button type="button" class="ag-btn ag-btn--sm" data-action="ov-pv-cost" data-delta="1" aria-label="Raise the cost"${cost >= 5 ? ' disabled' : ''}>+</button>
      ${cost !== pv.cost ? `<span class="agl-hint">Calculated ${esc(pv.cost)}</span>` : ''}</div></div>`;
  const resolve = btn('ov-pv-resolve', `Resolve ${label} · ${cost} ${unit(cost)}`, {kind: 'primary', icon: 'fa-solid fa-check'});
  return `<section class="ag-card agl-pv" aria-labelledby="agl-pv-h">
    <header class="agl-pv__head"><h3 id="agl-pv-h">${esc(label)} · ${esc(pv.area?.name ?? 'No area chosen')}</h3><span class="agl-hint" role="status">Day ${esc(pv.day)} · ${esc(pv.left)} of ${esc(pv.total)} actions remaining</span><span class="ag-badge">GM only</span></header>
    ${dest}
    <dl class="agl-pv__stats">${stat('Action cost', cost)}${stat(third.name, third.value, third.note)}${stat('Pressure', pv.pressure.label)}</dl>
    ${chips}
    ${pv.navigation ? `<p class="agl-pv__nav" role="status"><i class="fa-solid fa-compass" aria-hidden="true"></i> <strong>${esc(pv.navigation.text)}</strong></p>` : ''}
    <p class="agl-pv__calc"><strong>Calculated:</strong> ${pv.calculated.map(esc).join(' ')}</p>
    <p class="agl-pv__guide"><strong>GM guidance:</strong> ${pv.guidance.length ? pv.guidance.map(esc).join(' ') : 'Nothing special for this action.'}</p>
    ${shortcuts}${override}
    <div class="ag-field agl-field"><label for="agl-ov-text">What the party learns (optional) <span class="ag-badge">GM only</span></label><textarea id="agl-ov-text" rows="3" maxlength="2000">${esc(ui.text ?? '')}</textarea></div>
    ${stepper}
    ${short ? `<p class="agl-pv__block" role="alert">${esc(cost === pv.cost && pv.blocked ? pv.blocked.reason : `This costs ${plural(cost, 'action')} and only ${pv.left} ${pv.left === 1 ? 'is' : 'are'} left today.`)}</p>` : ''}
    <div class="agl-pv__foot">${btn('ov-pv-cancel', 'Cancel', {kind: 'ghost'})}${short ? off(resolve) : resolve}</div></section>`;
}

/** The journal: one card per day, newest day first, the day's entries in the order they happened. */
function journalCard(journal, {esc, gm}) {
  const days = [...new Set(journal.map(e => e.day))].sort((a, b) => b - a);
  const lines = text => esc(text).replace(/\n/g, '<br>');
  const control = (action, label, what, e, extra = '') => `<button type="button" class="ag-btn ag-btn--sm${extra}" data-action="${action}" data-id="${esc(e.id)}"><span>${label}<span class="ag-sr-only"> ${esc(what)}</span></span></button>`;
  const entry = e => {
    const what = `${ACTIONS[e.kind]}, day ${e.day}`;
    return `<li class="agl-tile agl-ov-entry"><div class="agl-ov-entry__head"><i class="${ICON[e.kind]}" aria-hidden="true"></i><strong>${esc(ACTIONS[e.kind])}</strong>${e.area ? ` <span class="agl-hint">${esc(e.area)}</span>` : ''}${Number.isSafeInteger(e.cost) ? ` <span class="agl-hint">${esc(e.cost)} ${e.cost === 1 ? 'action' : 'actions'}</span>` : ''}${e.by ? ` <span class="agl-hint">Asked by ${esc(e.by)}</span>` : ''}</div>
      ${e.text ? `<p class="agl-ov-entry__text">${lines(e.text)}</p>` : ''}
      ${gm ? `<div class="agl-ov-entry__tools">${control('ov-edit', 'Edit…', what, e)}${control('ov-delete', 'Delete entry', what, e, ' ag-btn--danger')}</div>` : ''}</li>`;
  };
  return `<section class="ag-card" aria-labelledby="agl-ov-journal"><h3 id="agl-ov-journal">Journal</h3>
    ${days.length ? days.map(d => `<article class="agl-ov-daycard" aria-label="Day ${d}"><h4>Day ${d}</h4><ol class="agl-ov-entries">${journal.filter(e => e.day === d).map(entry).join('')}</ol></article>`).join('')
      : `<div class="ag-empty"><i class="fa-solid fa-book-open" aria-hidden="true"></i><p class="ag-empty__title">Nothing in the journal yet</p>
        <p class="ag-empty__text">${gm ? 'Travel, Scout or Explore adds a card here.' : 'What the party does and learns on the road appears here.'}</p></div>`}
    ${gm && days.length ? `<div class="agl-ov-journal-tools"><button type="button" class="ag-btn ag-btn--sm ag-btn--danger" data-action="ov-clear"><i class="fa-solid fa-trash" aria-hidden="true"></i><span>Clear journal…</span></button></div>` : ''}</section>`;
}

/**
 * state: api.overland.state() for the GM, api.overland.publicState() for a player; mods: partyModifiers() (GM only, null for a player);
 * userId: the viewer (to point out their own waiting request); text: the GM's draft text; h: {esc, btn, tip, now} from app.mjs.
 * Returns the whole pane: one scrolling body, and for the GM the pinned footer.
 */
export function travelHtml({state, mods = null, gm = false, userId = '', text = '', preview = null, pv = {}, areas = [], scope = 'all'}, {esc, btn, now}) {
  const none = state.left < 1;
  const mine = state.requests.find(q => q.userId === userId);
  const rowBtn = (action, label, what, q, kind = '') => `<button type="button" class="ag-btn ag-btn--sm${kind}" data-action="${action}" data-user="${esc(q.userId)}"${action === 'ov-resolve' && none ? ' disabled' : ''}><span>${label}<span class="ag-sr-only"> ${esc(what)}</span></span></button>`;
  const requests = state.requests.length ? `<h4 id="agl-ov-req">${gm ? 'Waiting for you' : 'Waiting for the GM'}</h4>
    <ul class="agl-ov-requests" aria-labelledby="agl-ov-req">${state.requests.map(q => `<li class="agl-tile agl-ov-request"><span><strong>${esc(q.name || 'A player')}</strong> asks to ${esc(ACTIONS[q.action])}.</span>
      ${gm ? `<span class="agl-ov-request__tools">${rowBtn('ov-resolve', 'Resolve…', `${ACTIONS[q.action]} request from ${q.name || 'a player'}`, q)}${rowBtn('ov-dismiss', 'Dismiss', `${ACTIONS[q.action]} request from ${q.name || 'a player'}`, q)}</span>` : ''}</li>`).join('')}</ul>` : '';
  const buttons = gm
    ? `<div class="ag-field agl-field"><label for="agl-ov-area">Current area <span class="ag-badge">GM only</span></label><select id="agl-ov-area">${areaOptions(areas, state.area?.id ?? '', {esc, first: 'Choose an area…'})}</select>
        <small class="agl-hint">${state.area?.source === 'marker' ? 'Taken from the place marked as where the party is. ' : ''}Players see only its name${state.area ? '' : ', and only once you choose one'}.</small></div>
      <div class="agl-ov-actions">${Object.entries(ACTIONS).map(([k, label]) => btn(`ov-${k}`, label, {icon: ICON[k]})).join('')}</div>
      <p class="agl-hint">Each button opens a preview with the calculated cost. Nothing is spent until you Resolve it. Resolve on a request does the same.</p>`
    : `<div class="agl-ov-actions">${Object.entries(ACTIONS).map(([k, label]) => { const b = btn('ov-declare', label, {icon: ICON[k], data: {kind: k}}); return none ? off(b) : b; }).join('')}</div>
      <p class="agl-hint">${mine ? `You asked to ${esc(ACTIONS[mine.action])}. Waiting for the GM.` : none ? 'No actions are left today.' : 'Ask for an action; the GM decides and tells you what happens.'}</p>`;
  const today = `<section class="ag-card" aria-labelledby="agl-ov-today"><h3 id="agl-ov-today">Today${gm ? ` ${now}` : ''}</h3>
        <p class="agl-ov-day">Day ${esc(state.day)}</p>
        <p class="agl-ov-left" role="status" aria-live="polite" id="agl-ov-left">Actions left ${esc(state.left)} of ${esc(state.total)}</p>
        ${!gm && state.area ? `<p class="agl-ov-where">The party is in ${esc(state.area)}.</p>` : ''}
        <p class="agl-hint">The party shares ${esc(gm ? state.base : state.total)} actions a day${gm && state.bonus ? `, plus ${esc(state.bonus)} from what it carries` : ''}. Fights, encounters and talking don't use any.</p>
        ${buttons}
        <p class="agl-hint">Travel: move one neighbouring map tile, normally no check. Scout: learn roughly which way a known goal lies; a Navigation check can sharpen it. Explore: survey this tile and the ones next to it.</p>
        ${requests}</section>`;
  const journal = journalCard(state.journal, {esc, gm});
  if (!gm) return `<div class="agl-setup agl-overland"><div class="agl-setup__body">${today}${journal}</div></div>`;
  const previewHtml = preview ? previewCard(preview, {...pv, text}, {esc, btn, areas, now}) : '';
  const gmOnly = `<div class="agl-ov-gm" role="group" aria-labelledby="agl-ov-gmhead">
      <h2 id="agl-ov-gmhead" class="agl-ov-gmhead"><i class="fa-solid fa-lock" aria-hidden="true"></i> GM only <span class="agl-hint">Players never see anything below.</span></h2>
      <section class="ag-card" aria-labelledby="agl-ov-switches"><h3 id="agl-ov-switches">Table settings ${now}</h3>
        <label class="ag-field ag-field--inline agl-switch"><input type="checkbox" id="agl-ov-mounted" ${state.mounted ? 'checked' : ''}> Mounted</label>
        <label class="ag-field ag-field--inline agl-switch"><input type="checkbox" id="agl-ov-announce" ${state.announce ? 'checked' : ''}> Announce to players</label>
        <p class="agl-hint">Mounted counts modifiers that need a mount, and gear on a character's mount. Announce posts a short chat line for each action.</p></section>
      ${conditionsCard(mods?.conditions ?? [], {esc, now, here: state.here, area: state.area, scope: scope === 'area' && state.area?.id ? 'area' : 'all', state})}
      ${modifiersCard(mods ?? {rows: []}, {esc})}</div>`;
  return `<div class="agl-setup agl-overland">
    <div class="agl-setup__body">${previewHtml}${today}${journal}${gmOnly}</div>
    <footer class="ag-footer"><span class="ag-btn-group">${btn('ov-undo', 'Undo last', {kind: 'ghost', icon: 'fa-solid fa-rotate-left'})}${btn('ov-reset', 'Reset travel day…', {kind: 'ghost', icon: 'fa-solid fa-calendar-xmark'})}</span>
      <span class="ag-footer__status" role="status">${none ? 'No actions left today.' : 'Changes here apply at once.'}</span>
      ${btn('ov-newday', 'New day…', {kind: preview ? '' : 'primary', icon: 'fa-solid fa-sun'})}</footer>
  </div>`;
}
