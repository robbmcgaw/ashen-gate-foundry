/** The GM-only Overland tab (0.37.0): markup only. app.mjs wires the buttons. Plain labels, no ids, no status words. */
import {ACTIONS} from './overland.mjs';
import {SCOUT_LADDER} from './travel-modifiers.mjs';

const title = id => id.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
const TERRAIN_LABEL = {'difficult-terrain': 'Difficult terrain', marsh: 'Marsh', forest: 'Forest', hills: 'Hills', grassland: 'Grassland', road: 'Road'};
const CONDITION_LABEL = {cold: 'Cold', heat: 'Heat', 'rain-and-wind': 'Rain and wind', 'dust-and-ash': 'Dust and ash', darkness: 'Darkness', 'difficult-terrain': 'Difficult terrain',
  'mist-and-soft-ground': 'Mist and soft ground', 'thin-air-quick-weather': 'Thin air, quick weather', 'hissing-grass': 'Hissing grass', 'green-dimness': 'Green dimness',
  'open-haze': 'Open haze', 'rising-water': 'Rising water'};
export const rowLabel = r => r.terrain !== null ? `${r.label}: ${r.terrain ? TERRAIN_LABEL[r.terrain] ?? title(r.terrain) : 'any terrain'}`
  : r.condition ? `${r.label}: ${CONDITION_LABEL[r.condition] ?? title(r.condition)}` : r.label;
const ICON = {travel: 'fa-solid fa-shoe-prints', scout: 'fa-solid fa-binoculars', explore: 'fa-solid fa-compass'};
const signed = n => `+${n}`;

/**
 * state: api.overland state(); mods: partyModifiers(); h: {esc, btn, tip, now} from app.mjs.
 * Returns the whole pane: one scrolling body and the pinned footer.
 */
export function overlandHtml(state, mods, {esc, btn, tip, now}) {
  const none = state.left < 1;
  const log = state.log.slice(-8).reverse();
  const sources = r => `<ul class="agl-ov-sources">${r.sources.map(s => `<li>${esc(s.name)}${s.character ? ` (${esc(s.character)})` : ''}: ${esc(signed(s.value))}${s.counted ? '' : ` <span class="agl-hint">Not counted: ${esc(s.note || 'not used')}</span>`}</li>`).join('')}</ul>`;
  const table = mods.rows.length ? `<div class="ag-table-wrap"><table class="ag-table agl-ov-table"><caption class="ag-sr-only">Party travel modifiers</caption>
      <thead><tr><th scope="col">Modifier</th><th scope="col" class="is-num">Total</th><th scope="col">Cap</th><th scope="col">Sources</th></tr></thead>
      <tbody>${mods.rows.map(r => `<tr><th scope="row">${esc(rowLabel(r))}${r.unit ? `<br><span class="agl-hint">${esc(r.unit)}</span>` : ''}</th><td class="is-num">${esc(signed(r.total))}</td>
        <td>${r.cap == null ? 'No cap' : `Up to ${esc(signed(r.cap))}${r.capped ? ' (reached)' : ''}`}</td><td>${sources(r)}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="ag-empty"><i class="fa-solid fa-person-hiking" aria-hidden="true"></i><p class="ag-empty__title">No travel modifiers yet</p>
      <p class="ag-empty__text">Items and perks with travel modifiers show here while a player's character carries them (equipment when equipped).</p></div>`;
  return `<div class="agl-setup agl-overland">
    <div class="agl-setup__body">
      <section class="ag-card" aria-labelledby="agl-ov-today"><h3 id="agl-ov-today">Today ${now}</h3>
        <p class="agl-ov-day">Day ${esc(state.day)}</p>
        <p class="agl-ov-left" role="status" aria-live="polite" id="agl-ov-left">Actions left ${esc(state.left)} of ${esc(state.total)}</p>
        <p class="agl-hint">The party shares ${esc(state.base)} actions a day${state.bonus ? `, plus ${esc(state.bonus)} from what it carries` : ''}. Fights, encounters and talking don't use any.</p>
        <div class="agl-ov-actions">${Object.entries(ACTIONS).map(([k, label]) => btn(`ov-${k}`, label, {icon: ICON[k]})).join('')}</div>
        <p class="agl-hint">Travel: move one neighbouring map tile, normally no check. Scout: learn roughly which way a known goal lies; a Navigation check can sharpen it. Explore: survey this tile and the ones next to it.</p>
        <label class="ag-field ag-field--inline agl-switch"><input type="checkbox" id="agl-ov-mounted" ${state.mounted ? 'checked' : ''}> Mounted</label>
        <label class="ag-field ag-field--inline agl-switch"><input type="checkbox" id="agl-ov-announce" ${state.announce ? 'checked' : ''}> Announce to players</label>
        <p class="agl-hint">Mounted counts modifiers that need a mount, and gear on a character's mount. Announce posts a short chat line for each action.</p>
        <h4>Log</h4>
        ${log.length ? `<ol class="agl-ov-log" aria-label="Recent overland actions">${log.map(e => `<li>${esc(e.text)}</li>`).join('')}</ol>`
          : '<p class="agl-hint">No actions yet. Travel, Scout or Explore adds a line here.</p>'}</section>
      <section class="ag-card" aria-labelledby="agl-ov-mods"><h3 id="agl-ov-mods">Party modifiers</h3>
        ${table}
        <p class="agl-hint">Read only. Within a stacking group only the best source counts, across the whole party; different groups add up to the cap. Gear set to familiar terrain is your call and is never added.</p>
        <p class="agl-hint"><strong>Scout precision</strong> is a guide, not a rule: ${SCOUT_LADDER.map(esc).join('; ')}. Anything finer, such as homing in on an exact spot, is yours to decide.</p></section>
    </div>
    <footer class="ag-footer">${btn('ov-undo', 'Undo last', {kind: 'ghost', icon: 'fa-solid fa-rotate-left'})}
      <span class="ag-footer__status" role="status">${none ? 'No actions left today.' : 'Changes here apply at once.'}</span>
      ${btn('ov-newday', 'New day…', {kind: 'primary', icon: 'fa-solid fa-sun'})}</footer>
  </div>`;
}
