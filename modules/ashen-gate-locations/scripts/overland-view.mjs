/**
 * The Travel tab (0.39.0; GM-only "Overland" tab in 0.37.0 to 0.38.0): markup only. app.mjs wires the buttons. Plain labels, no ids, no status words.
 * Players get Today (declare buttons, waiting requests) and the Journal. The GM gets the same plus direct buttons and, last, the GM-only sections.
 * A player's markup is built from the PUBLIC state alone: it never receives conditions, party modifiers or guidance.
 */
import {ACTIONS} from './overland.mjs';
import {SCOUT_LADDER} from './travel-modifiers.mjs';
import {conditionById, MAX_SEVERITY} from './overland-conditions.mjs';

const title = id => id.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
const TERRAIN_LABEL = {'difficult-terrain': 'Difficult terrain', marsh: 'Marsh', forest: 'Forest', hills: 'Hills', grassland: 'Grassland', road: 'Road'};
export const rowLabel = r => r.terrain !== null ? `${r.label}: ${r.terrain ? TERRAIN_LABEL[r.terrain] ?? title(r.terrain) : 'any terrain'}`
  : r.condition ? `${r.label}: ${conditionById(r.condition)?.label ?? title(r.condition)}` : r.label;
const ICON = {travel: 'fa-solid fa-shoe-prints', scout: 'fa-solid fa-binoculars', explore: 'fa-solid fa-compass'};
const signed = n => `+${n}`;
const off = html => html.replace('<button type="button"', '<button type="button" disabled');

/** One condition: a 0 to 3 severity control (saves at once), the party's mitigation, the steps remaining and, while any remain, the guidance line. */
function conditionRow(c, {esc}) {
  const levels = Array.from({length: MAX_SEVERITY + 1}, (_, n) => n);
  return `<li class="agl-ov-cond" data-cond-row="${esc(c.id)}">
    <div class="agl-ov-cond__name"><strong>${esc(c.label)}</strong><br><span class="agl-hint">${esc(c.hits)}</span></div>
    <div class="ag-segmented" role="group" aria-label="${esc(c.label)} severity">${levels.map(n => `<button type="button" aria-pressed="${c.severity === n}" data-action="ov-cond" data-cond="${esc(c.id)}" data-sev="${n}" aria-label="${esc(c.label)} severity ${n}">${n}</button>`).join('')}</div>
    <p class="agl-ov-cond__math">Party mitigation ${esc(signed(c.mitigation))}. Steps remaining <strong>${esc(c.remaining)}</strong>.</p>
    ${c.remaining > 0 ? `<p class="agl-ov-cond__guide">${esc(c.guidance)}</p>` : ''}</li>`;
}
/** GM only: "Today's conditions", one list of six. */
function conditionsCard(list, {esc, now}) {
  return `<section class="ag-card" aria-labelledby="agl-ov-conds"><h3 id="agl-ov-conds">Today's conditions ${now}</h3>
    <p class="agl-hint">Set how bad each one is today, 0 (none) to 3. The party's mitigation, from what it carries, is taken off; what is left is shown with a reminder of what it usually means. Nothing is applied for you. New day… clears them all.</p>
    <ul class="agl-ov-conds" aria-label="Conditions">${list.map(c => conditionRow(c, {esc})).join('')}</ul></section>`;
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

/** The journal: one card per day, newest day first, the day's entries in the order they happened. */
function journalCard(journal, {esc, gm}) {
  const days = [...new Set(journal.map(e => e.day))].sort((a, b) => b - a);
  const lines = text => esc(text).replace(/\n/g, '<br>');
  const control = (action, label, what, e, extra = '') => `<button type="button" class="ag-btn ag-btn--sm${extra}" data-action="${action}" data-id="${esc(e.id)}"><span>${label}<span class="ag-sr-only"> ${esc(what)}</span></span></button>`;
  const entry = e => {
    const what = `${ACTIONS[e.kind]}, day ${e.day}`;
    return `<li class="agl-ov-entry"><div class="agl-ov-entry__head"><i class="${ICON[e.kind]}" aria-hidden="true"></i><strong>${esc(ACTIONS[e.kind])}</strong>${e.by ? ` <span class="agl-hint">Asked by ${esc(e.by)}</span>` : ''}</div>
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
export function travelHtml({state, mods = null, gm = false, userId = '', text = ''}, {esc, btn, now}) {
  const none = state.left < 1;
  const mine = state.requests.find(q => q.userId === userId);
  const rowBtn = (action, label, what, q, kind = '') => `<button type="button" class="ag-btn ag-btn--sm${kind}" data-action="${action}" data-user="${esc(q.userId)}"${action === 'ov-resolve' && none ? ' disabled' : ''}><span>${label}<span class="ag-sr-only"> ${esc(what)}</span></span></button>`;
  const requests = state.requests.length ? `<h4 id="agl-ov-req">${gm ? 'Waiting for you' : 'Waiting for the GM'}</h4>
    <ul class="agl-ov-requests" aria-labelledby="agl-ov-req">${state.requests.map(q => `<li class="agl-ov-request"><span><strong>${esc(q.name || 'A player')}</strong> asks to ${esc(ACTIONS[q.action])}.</span>
      ${gm ? `<span class="agl-ov-request__tools">${rowBtn('ov-resolve', 'Resolve', `${ACTIONS[q.action]} request from ${q.name || 'a player'}`, q)}${rowBtn('ov-dismiss', 'Dismiss', `${ACTIONS[q.action]} request from ${q.name || 'a player'}`, q)}</span>` : ''}</li>`).join('')}</ul>` : '';
  const buttons = gm
    ? `<div class="agl-ov-actions">${Object.entries(ACTIONS).map(([k, label]) => btn(`ov-${k}`, label, {icon: ICON[k]})).join('')}</div>
      <div class="ag-field agl-field"><label for="agl-ov-text">What the party learns (optional) <span class="ag-badge">GM only</span></label>
        <textarea id="agl-ov-text" rows="3" maxlength="2000">${esc(text)}</textarea></div>
      <p class="agl-hint">Each button spends one action and adds a journal card with this text. Resolve does the same for a request.</p>`
    : `<div class="agl-ov-actions">${Object.entries(ACTIONS).map(([k, label]) => { const b = btn('ov-declare', label, {icon: ICON[k], data: {kind: k}}); return none ? off(b) : b; }).join('')}</div>
      <p class="agl-hint">${mine ? `You asked to ${esc(ACTIONS[mine.action])}. Waiting for the GM.` : none ? 'No actions are left today.' : 'Ask for an action; the GM decides and tells you what happens.'}</p>`;
  const today = `<section class="ag-card" aria-labelledby="agl-ov-today"><h3 id="agl-ov-today">Today${gm ? ` ${now}` : ''}</h3>
        <p class="agl-ov-day">Day ${esc(state.day)}</p>
        <p class="agl-ov-left" role="status" aria-live="polite" id="agl-ov-left">Actions left ${esc(state.left)} of ${esc(state.total)}</p>
        <p class="agl-hint">The party shares ${esc(gm ? state.base : state.total)} actions a day${gm && state.bonus ? `, plus ${esc(state.bonus)} from what it carries` : ''}. Fights, encounters and talking don't use any.</p>
        ${buttons}
        <p class="agl-hint">Travel: move one neighbouring map tile, normally no check. Scout: learn roughly which way a known goal lies; a Navigation check can sharpen it. Explore: survey this tile and the ones next to it.</p>
        ${requests}</section>`;
  const journal = journalCard(state.journal, {esc, gm});
  if (!gm) return `<div class="agl-setup agl-overland"><div class="agl-setup__body">${today}${journal}</div></div>`;
  const gmOnly = `<div class="agl-ov-gm" role="group" aria-labelledby="agl-ov-gmhead">
      <h2 id="agl-ov-gmhead" class="agl-ov-gmhead"><i class="fa-solid fa-lock" aria-hidden="true"></i> GM only <span class="agl-hint">Players never see anything below.</span></h2>
      <section class="ag-card" aria-labelledby="agl-ov-switches"><h3 id="agl-ov-switches">Table settings ${now}</h3>
        <label class="ag-field ag-field--inline agl-switch"><input type="checkbox" id="agl-ov-mounted" ${state.mounted ? 'checked' : ''}> Mounted</label>
        <label class="ag-field ag-field--inline agl-switch"><input type="checkbox" id="agl-ov-announce" ${state.announce ? 'checked' : ''}> Announce to players</label>
        <p class="agl-hint">Mounted counts modifiers that need a mount, and gear on a character's mount. Announce posts a short chat line for each action.</p></section>
      ${conditionsCard(mods?.conditions ?? [], {esc, now})}
      ${modifiersCard(mods ?? {rows: []}, {esc})}</div>`;
  return `<div class="agl-setup agl-overland">
    <div class="agl-setup__body">${today}${journal}${gmOnly}</div>
    <footer class="ag-footer">${btn('ov-undo', 'Undo last', {kind: 'ghost', icon: 'fa-solid fa-rotate-left'})}
      <span class="ag-footer__status" role="status">${none ? 'No actions left today.' : 'Changes here apply at once.'}</span>
      ${btn('ov-newday', 'New day…', {kind: 'primary', icon: 'fa-solid fa-sun'})}</footer>
  </div>`;
}
