/**
 * Light overland travel (0.37.0). The party shares a few overland actions a day (Travel, Scout, Explore); the GM adjudicates the rest at the table.
 * This file is the state and the service behind the GM-only Overland tab and api.overland. No Foundry globals: main.mjs supplies them.
 * Daily conditions are rolled by the GM beforehand; nothing here rolls.
 */
import {CONDITION_IDS, OVERLAND_CONDITIONS, normalizeConditions, stepsRemaining} from './overland-conditions.mjs';
import {blockModifiers, combine, SCOUT_LADDER, MODIFIER_SCOPE} from './travel-modifiers.mjs';

export const OVERLAND_CONTRACT = 'ag-overland/1';
export const BASE_ACTIONS = 3;
export const LOG_MAX = 20;
export const ACTIONS = Object.freeze({travel: 'Travel', scout: 'Scout', explore: 'Explore'});
const whole = (v, min, max) => Number.isSafeInteger(v) && v >= min ? Math.min(v, max) : min;

/** The stored state, whatever is in the world setting: {day, used, mounted, announce, conditions: {id: 0..3}, log: [{kind, day}]}. A world saved before 0.38.0 has no conditions: all six default to 0. */
export function normalizeState(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const day = whole(r.day, 1, 99999);
  const log = (Array.isArray(r.log) ? r.log : []).filter(e => e && ACTIONS[e.kind] && Number.isSafeInteger(e.day) && e.day >= 1)
    .map(e => ({kind: e.kind, day: e.day})).slice(-LOG_MAX);
  return {day, used: whole(r.used, 0, 99), mounted: r.mounted === true, announce: r.announce === true, conditions: normalizeConditions(r.conditions), log};
}
export const totalActions = bonus => BASE_ACTIONS + whole(bonus, 0, 2);
export const actionsLeft = (state, bonus) => Math.max(0, totalActions(bonus) - state.used);
export const logLine = e => `Day ${e.day}: ${ACTIONS[e.kind]}`;

/** Spends one action. Throws when none are left (the GM can start a New day, or adjudicate a bonus action at the table). */
export function spend(state, kind, bonus) {
  if (!ACTIONS[kind]) throw new Error(`Unknown overland action "${kind}".`);
  if (!actionsLeft(state, bonus)) throw new Error('No overland actions left today. Start a New day when the party has rested.');
  return {...state, used: state.used + 1, log: [...state.log, {kind, day: state.day}].slice(-LOG_MAX)};
}
/** Takes back the last action spent today. Throws when there is none. */
export function undo(state) {
  const last = state.log.at(-1);
  if (!last || last.day !== state.day || state.used < 1) throw new Error('Nothing to undo today.');
  return {...state, used: state.used - 1, log: state.log.slice(0, -1)};
}
/** A new day gives the actions back, adds one to the day and clears every condition and hazard back to 0. */
export const newDay = state => ({...state, day: state.day + 1, used: 0, conditions: normalizeConditions(null)});
/** Sets one condition or hazard (one of the six) to severity 0 to 3. */
export function setCondition(state, id, severity) {
  if (!CONDITION_IDS.includes(id)) throw new Error(`Unknown condition "${id}". Use one of: ${CONDITION_IDS.join(', ')}.`);
  if (!Number.isSafeInteger(severity) || severity < 0 || severity > 3) throw new Error('Severity is a whole number from 0 to 3.');
  return {...state, conditions: {...state.conditions, [id]: severity}};
}

/**
 * Party sources for the table: every Ashen Gate ITEM-* / PERK-* on a party character (player-owned `character` Actor) that carries travel modifiers.
 * Equipment counts while equipped. When Character Hub exposes a character's mount (api.companions), the items assigned to that mount count only
 * while the Mounted switch is on; without the Hub every item is simply "on the character".
 * deps.mountItems?(actor) -> Set of Item ids on that character's mount (or null when unknown).
 */
export function collectSources(actors, {mountItems = null} = {}) {
  const out = [];
  for (const actor of actors ?? []) {
    let mount = null;
    try { mount = mountItems ? mountItems(actor) : null; } catch { mount = null; }
    const seen = new Set();
    for (const item of [...(actor?.items ?? [])]) {
      const src = item?.flags?.['ashen-gate-manager']?.source, id = src?.sourceId;
      if (typeof id !== 'string' || !/^(ITEM|PERK)-/.test(id) || seen.has(id)) continue;
      const modifiers = blockModifiers(src.definition);
      if (!modifiers.length) continue;
      seen.add(id);
      const onMount = mount instanceof Set && mount.has(item.id);
      out.push({sourceId: id, name: item.name ?? id, character: actor.name ?? '', modifiers, mountItem: onMount,
        inactive: !onMount && id.startsWith('ITEM-') && item.type === 'equipment' && item.system?.equipped !== true ? 'not equipped' : null});
    }
  }
  return out;
}

/**
 * The partyModifiers() shape: the combined party rows, plus for each of the six conditions and hazards its severity today, the party's
 * mitigation (the condition.mitigation total, capped at 3) and the steps remaining = max(0, severity - mitigation). Condition rows carry the same three numbers.
 */
export function withConditions(mods, conditions) {
  const sev = normalizeConditions(conditions);
  const mitigation = id => mods.rows.find(r => r.target === 'condition.mitigation' && r.condition === id)?.total ?? 0;
  for (const r of mods.rows) if (r.condition) Object.assign(r, {severity: sev[r.condition] ?? 0, remaining: stepsRemaining(sev[r.condition], r.total)});
  const list = OVERLAND_CONDITIONS.map(c => ({id: c.id, label: c.label, kind: c.kind, hits: c.hits, guidance: c.guidance,
    severity: sev[c.id], mitigation: mitigation(c.id), remaining: stepsRemaining(sev[c.id], mitigation(c.id))}));
  return {contract: OVERLAND_CONTRACT, scope: MODIFIER_SCOPE, ...mods, ladder: [...SCOUT_LADDER], conditions: list};
}

/**
 * deps: {isGM(), read() -> stored object, write(state) -> Promise, actors() -> party character Actors, mountItems?(actor), announce?(text)}.
 * Every method is GM only; the checks live here, not in the tab.
 */
export function createOverland(deps) {
  const requireGM = () => { if (deps.isGM() !== true) throw new Error('Only the GM can use overland travel.'); };
  const stored = () => normalizeState(deps.read());
  const party = () => combine(collectSources(deps.actors(), {mountItems: deps.mountItems}), {mounted: stored().mounted});
  const view = (state, mods) => ({contract: OVERLAND_CONTRACT, day: state.day, used: state.used, base: BASE_ACTIONS, bonus: mods.bonus.actions,
    total: totalActions(mods.bonus.actions), left: actionsLeft(state, mods.bonus.actions), mounted: state.mounted, announce: state.announce, conditions: {...state.conditions},
    log: state.log.map(e => ({kind: e.kind, day: e.day, text: logLine(e)}))});
  const save = async state => { await deps.write(state); return state; };
  const api = {
    /** GM: {contract, day, used, base, bonus, total, left, mounted, announce, log: [{kind, day, text}]}. */
    state() { requireGM(); return view(stored(), party()); },
    /** GM: {contract, mounted, bonus: {actions, explore, scout}, ladder, rows: [{key, target, terrain, condition, label, unit, total, cap, capped, sources: [{name, character, label, value, counted, note}]}]}. */
    partyModifiers() { requireGM(); return withConditions(structuredClone(party()), stored().conditions); },
    async act(kind) {
      requireGM();
      const mods = party(), next = await save(spend(stored(), kind, mods.bonus.actions));
      if (next.announce && deps.announce) await deps.announce(`${ACTIONS[kind]}: the party uses an overland action (${actionsLeft(next, mods.bonus.actions)} left today).`);
      return view(next, mods);
    },
    async undo() { requireGM(); return view(await save(undo(stored())), party()); },
    async newDay() { requireGM(); return view(await save(newDay(stored())), party()); },
    async setMounted(value) { requireGM(); return view(await save({...stored(), mounted: value === true}), party()); },
    async setCondition(id, severity) { requireGM(); return view(await save(setCondition(stored(), id, severity)), party()); },
    async setAnnounce(value) { requireGM(); return view(await save({...stored(), announce: value === true}), party()); }
  };
  return Object.freeze(api);
}

let current = null;
/** The window's handle on the service (main.mjs sets it on ready). Not part of the public api. */
export const useOverland = service => { current = service; };
export const overland = () => current;
