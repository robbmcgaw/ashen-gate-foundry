/**
 * 1.15.0 travel behaviours for the Travel tracker: pace, night watches, foraging and navigation checks. Tracking only:
 * none of them changes a roll, the hazard chance, supplies or rest. Each one's data lives on the journey
 * (journey.behaviours, journey.mjs) and every change goes through the GM-only API (api.travel.setBehaviours /
 * openCheck), which is where permissions are enforced. Pure apart from the injected deps, so tests can drive it.
 *
 * deps: {api() → the Locations API, characters() → [{id, name}] the GM can put on watch, skillLabel(id) → string}
 * Players get pace and watch order from api.travel.state() (the players' page); the checks panel is GM-only.
 */
import {esc} from './model.mjs';
import {PACES, WATCHES, WATCH_LABELS, CHECKS, CHECK_SKILLS} from './journey.mjs';

const PACE_LABELS = Object.freeze({slow: 'Slow', normal: 'Normal', fast: 'Fast'});
const CHECK_LABELS = Object.freeze({forage: 'Foraging', navigate: 'Navigation'});
const NOTE = '<p class="agl-hint">Tracking only: nothing is rolled or changed automatically.</p>';

const option = (value, label, selected) => `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(label)}</option>`;
const toggle = (id, on) => `<label class="agl-travel__toggle"><input type="checkbox" data-travel-change="bh:${id}:enabled"${on ? ' checked' : ''}> Track on this journey</label>`;
const gmActive = ctx => ctx.isGM && ctx.journey?.status === 'active';

/** Reads a control's value: checkbox state or select value. */
const checkedOf = el => el?.checked === true;
const valueOf = el => String(el?.value ?? '');

export function travelBehaviours({api, characters = () => [], skillLabel = id => id}) {
  const travel = () => api().travel;

  const pace = {
    id: 'pace', label: 'Pace (tracking only)', icon: 'fa-solid fa-person-walking', audience: 'everyone',
    appliesTo: ctx => ctx.isGM ? gmActive(ctx) : Boolean(ctx.state?.behaviours?.pace),
    render(ctx) {
      if (!ctx.isGM) return `<p>Pace: <strong>${esc(PACE_LABELS[ctx.state.behaviours.pace] ?? ctx.state.behaviours.pace)}</strong></p>${NOTE}`;
      const b = ctx.journey.behaviours.pace;
      if (!b.enabled) return `${toggle('pace', false)}<p class="agl-hint">Off for this journey. Players don't see a pace.</p>`;
      return `<label>Pace <select data-travel-change="bh:pace:value">${PACES.map(p => option(p, PACE_LABELS[p], p === b.value)).join('')}</select></label>
        ${toggle('pace', true)}<p class="agl-hint">Players see the pace.</p>${NOTE}`;
    },
    async act(action, {el}) {
      if (action === 'enabled') return travel().setBehaviours({pace: {enabled: checkedOf(el)}});
      if (action === 'value') return travel().setBehaviours({pace: {value: valueOf(el)}});
      throw new Error(`Unknown pace action "${action}".`);
    }
  };

  const watch = {
    id: 'watch', label: 'Night watches (tracking only)', icon: 'fa-solid fa-moon', audience: 'everyone',
    appliesTo: ctx => ctx.isGM ? gmActive(ctx) : Boolean(ctx.state?.behaviours?.watch),
    render(ctx) {
      if (!ctx.isGM) {
        const rows = ctx.state.behaviours.watch.map(w => `<li><strong>${esc(WATCH_LABELS[w.watch] ?? w.watch)}:</strong> ${w.names.length ? w.names.map(esc).join(', ') : '—'}</li>`).join('');
        return `<ol class="agl-travel__watches">${rows}</ol>${NOTE}`;
      }
      const b = ctx.journey.behaviours.watch;
      if (!b.enabled) return `${toggle('watch', false)}<p class="agl-hint">Off for this journey. Players don't see a watch order.</p>`;
      const known = characters();
      const names = new Map(known.map(c => [c.id, c.name]));
      // Characters already on watch stay listed even if they have left the party.
      const ids = [...new Set([...known.map(c => c.id), ...WATCHES.flatMap(w => b[w])])];
      if (!ids.length) return `${toggle('watch', true)}<p class="agl-hint">No characters to put on watch. Create character Actors first.</p>`;
      const head = WATCHES.map(w => `<th scope="col">${esc(WATCH_LABELS[w].replace(' watch', ''))}</th>`).join('');
      const rows = ids.map(id => `<tr><th scope="row">${esc(names.get(id) ?? id)}</th>${WATCHES.map(w => `<td><input type="checkbox" aria-label="${esc(`${names.get(id) ?? id}: ${WATCH_LABELS[w]}`)}"
        data-travel-change="bh:watch:toggle" data-watch="${w}" data-actor="${esc(id)}"${b[w].includes(id) ? ' checked' : ''}></td>`).join('')}</tr>`).join('');
      return `<table class="agl-travel__watch"><thead><tr><th scope="col">Character</th>${head}</tr></thead><tbody>${rows}</tbody></table>
        ${toggle('watch', true)}<p class="agl-hint">Players see who is on each watch.</p>${NOTE}`;
    },
    async act(action, {el}) {
      if (action === 'enabled') return travel().setBehaviours({watch: {enabled: checkedOf(el)}});
      if (action !== 'toggle') throw new Error(`Unknown watch action "${action}".`);
      const w = el?.dataset?.watch, id = el?.dataset?.actor;
      if (!WATCHES.includes(w) || !id) throw new Error('Pick a watch and a character.');
      const current = travel().getBehaviours()?.watch?.[w] ?? [];
      const next = checkedOf(el) ? [...new Set([...current, id])] : current.filter(x => x !== id);
      return travel().setBehaviours({watch: {[w]: next}});
    }
  };

  const checks = {
    id: 'checks', label: 'Foraging and navigation (tracking only)', icon: 'fa-solid fa-compass', audience: 'gm',
    // Hidden entirely without Utilities' prefilled rolls (feature-detected through the API).
    appliesTo: ctx => gmActive(ctx) && travel().checksAvailable() === true,
    render(ctx) {
      const b = ctx.journey.behaviours.checks;
      if (!b.enabled) return `${toggle('checks', false)}<p class="agl-hint">Off for this journey.</p>`;
      const rows = CHECKS.map(c => `<div class="agl-travel__row"><label>${esc(CHECK_LABELS[c])} skill <select data-travel-change="bh:checks:skill" data-check="${c}">
        ${CHECK_SKILLS.map(s => option(s, skillLabel(s), s === b[c])).join('')}</select></label>
        <button type="button" class="ag-btn" data-travel="bh:checks:${c}"><i class="fa-solid fa-dice-d20" aria-hidden="true"></i><span>${esc(CHECK_LABELS[c])} check</span></button></div>`).join('');
      return `${rows}${toggle('checks', true)}<p class="agl-hint">Opens Utilities → Rolls with the check filled in (Group result, the party ticked). Change anything there, including Individual rolls, then Start Rolls. Only you see this panel.</p>${NOTE}`;
    },
    async act(action, {el}) {
      if (action === 'enabled') return travel().setBehaviours({checks: {enabled: checkedOf(el)}});
      if (action === 'skill') {
        const c = el?.dataset?.check;
        if (!CHECKS.includes(c)) throw new Error('Pick foraging or navigation.');
        return travel().setBehaviours({checks: {[c]: valueOf(el)}});
      }
      if (CHECKS.includes(action)) return travel().openCheck(action);
      throw new Error(`Unknown check action "${action}".`);
    }
  };

  return [pace, watch, checks];
}
