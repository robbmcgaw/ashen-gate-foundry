/**
 * The Travel action calculator (0.40.0). PURE: no Foundry globals, no dice, nothing is applied to anyone. It turns an action (travel, scout or
 * explore), the effective condition severities for the area, and what the party carries into the numbers the GM resolves at the table.
 * Everything it returns is GM only: the service hands it out only through GM calls and never writes it to a player-readable place.
 *
 * Rules (Robb, 2026-10-31). Environmental ACTION COST adds at most +1 per action: harsh-weather 2+ adds +1 to exposed Travel, hard-ground 2+
 * adds +1 to Travel into the destination (both together still +1); the party then subtracts its mitigation against the condition that caused it
 * and any `travel.efficiency` for the destination's terrain; the cost is never below 1 and never above 2. Survey range, Scout precision and
 * navigation read the severity AFTER the party's mitigation (severity minus mitigation, at least 0). Mitigation protects the PARTY only: it never
 * lowers a condition on the Location or Region, never changes the pressure label, and for Blight Taint and Ashen Menace (no action penalty) it
 * only changes the guidance line.
 */
import {CONDITION_IDS, clampSeverity, conditionById, normalizeConditions, stepsRemaining} from './overland-conditions.mjs';

export const ACTION_IDS = Object.freeze(['travel', 'scout', 'explore']);
export const ACTION_LABEL = Object.freeze({travel: 'Travel', scout: 'Scout', explore: 'Explore'});
export const PRESSURE_LABEL = Object.freeze({normal: 'Normal', elevated: 'Elevated', high: 'High', dominant: 'Dominant'});
export const MAX_COST = 2;
/** Which conditions matter to which action (chips and guidance are shown only for these). */
export const RELEVANT = Object.freeze({
  travel: Object.freeze(['harsh-weather', 'hard-ground', 'poor-visibility', 'warped-paths', 'blight-taint', 'ashen-menace']),
  scout: Object.freeze(['poor-visibility', 'warped-paths', 'blight-taint', 'ashen-menace']),
  explore: Object.freeze(['harsh-weather', 'hard-ground', 'poor-visibility', 'blight-taint', 'ashen-menace'])
});
/** The GM guidance per condition: exactly the effect types Robb listed. */
export const GUIDANCE = Object.freeze({
  'harsh-weather': 'exposure, shelter, crossings, interrupted gathering.',
  'hard-ground': 'impassable routes, mount restrictions, difficult access.',
  'poor-visibility': 'reduced encounter warning, hidden hazards.',
  'blight-taint': 'elevated Ashen activity, corruption, contaminated materials or water; unusual gathering opportunities.',
  'warped-paths': 'shifting paths, uncertain destinations, magical shortcuts.',
  'ashen-menace': 'coordinated Ashen patrols, territorial responses; elevated danger level per the pressure label.'
});
export const NAVIGATION = Object.freeze({
  uncertain: 'Navigation: uncertain',
  anomalous: 'Navigation: anomalous',
  displacement: 'Possible displacement: resolve before finalising the destination'
});
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const minus = n => `−${n}`;

/** Encounter pressure from the effective severities: normal, elevated, high or dominant. Party mitigation never enters. */
export function pressureOf(sev) {
  const menace = clampSeverity(sev?.['ashen-menace']), blight = clampSeverity(sev?.['blight-taint']);
  if (menace >= 3) return 'dominant';
  if (menace >= 2 || (menace >= 1 && blight >= 2)) return 'high';
  if (menace >= 1 || blight >= 2) return 'elevated';
  return 'normal';
}
/** max(location, daily) per condition, never added. Both are {id: 0..3}; missing ids are 0. */
export function mergeSeverities(location, daily) {
  const a = normalizeConditions(location), b = normalizeConditions(daily);
  return Object.fromEntries(CONDITION_IDS.map(id => [id, Math.max(a[id], b[id])]));
}
/** A GM override ({condition, severity}) replaces that one condition's severity for one preview. Anything invalid is ignored (null). */
export function cleanOverride(o) {
  return o && typeof o === 'object' && CONDITION_IDS.includes(o.condition) && Number.isSafeInteger(o.severity) && o.severity >= 0 && o.severity <= 3
    ? {condition: o.condition, severity: o.severity} : null;
}
export function applyOverride(sev, override) {
  const o = cleanOverride(override), out = normalizeConditions(sev);
  if (o) out[o.condition] = o.severity;
  return out;
}

/** What the party carries, from the partyModifiers() totals (caps already applied there). */
export function partyNumbers(party, terrain = '') {
  const rows = Array.isArray(party?.rows) ? party.rows : [];
  const total = (target, pick = () => true) => rows.find(r => r.target === target && pick(r))?.total ?? 0;
  const mitigation = Object.fromEntries(CONDITION_IDS.map(id => [id, Math.min(3, total('condition.mitigation', r => r.condition === id))]));
  const named = terrain ? rows.find(r => r.target === 'travel.efficiency' && r.terrain === terrain) : null;
  const generic = rows.find(r => r.target === 'travel.efficiency' && r.terrain === '');
  return {
    exploreRange: Math.min(2, party?.bonus?.explore ?? total('explore.range')),
    scoutPrecision: Math.min(2, party?.bonus?.scout ?? total('scout.precision')),
    efficiency: Math.min(2, (named ?? generic)?.total ?? 0),
    mitigation
  };
}

const chipsFor = (action, sev) => RELEVANT[action].filter(id => sev[id] > 0).map(id => ({id, label: conditionById(id).label, severity: sev[id]}));

/**
 * calculateAction input: {action, area: {id?, name} | null, destination: {id?, name} | null (travel), severities: {id: 0..3} (effective),
 * party: partyModifiers() result, left: actions left today, terrain: one of TERRAINS | '' (the destination's, for efficiency),
 * override: {condition, severity} | null}.
 * Returns {action, area, destination, cost, baseCost, rangeRings, precision, navigation, pressure, conditions, severities, calculated, guidance,
 * override, protectedFrom, blocked?}. `navigation` is null or {flag: 'uncertain' | 'anomalous' | 'displacement', text}; `blocked` is {reason} only when the cost is more than the actions left.
 */
export function calculateAction(input) {
  const action = input?.action;
  if (!ACTION_IDS.includes(action)) throw new Error(`Unknown action "${action}". Use one of: ${ACTION_IDS.join(', ')}.`);
  const override = cleanOverride(input.override);
  const sev = applyOverride(input.severities, override);
  const party = partyNumbers(input.party, input.terrain ?? '');
  const label = id => conditionById(id).label;
  const remaining = id => stepsRemaining(sev[id], party.mitigation[id]);
  const calculated = [], guidance = [];
  let cost = 1, rangeRings = null, precision = null, navigation = null;

  if (action === 'travel') {
    const causes = ['harsh-weather', 'hard-ground'].filter(id => sev[id] >= 2);
    if (causes.length) {
      const names = causes.map(id => `${label(id)} ${sev[id]}`).join(' and ');
      const protectedBy = Math.min(1, Math.max(...causes.map(id => party.mitigation[id])));
      cost = 2 - protectedBy;
      calculated.push(`Travel costs 1, plus 1 for ${names} (conditions add at most 1 in total)${protectedBy ? ", minus 1 for the party's mitigation" : ''}.`);
    } else calculated.push('Travel costs 1; no condition adds to it.');
    if (party.efficiency > 0) {
      const used = Math.min(party.efficiency, cost - 1);
      cost -= used;
      calculated.push(used ? `Party travel efficiency for this terrain takes it down by ${used}.` : 'Party travel efficiency for this terrain has nothing to remove.');
    }
    cost = Math.min(MAX_COST, Math.max(1, cost));
    if (remaining('warped-paths') >= 1) { navigation = {flag: 'displacement', text: NAVIGATION.displacement}; calculated.push(`Warped Paths ${sev['warped-paths']}: ${NAVIGATION.displacement}.`); }
  } else if (action === 'explore') {
    const vis = remaining('poor-visibility'), visCut = vis >= 3 ? 2 : vis >= 2 ? 1 : 0, wx = remaining('harsh-weather') >= 3 ? 1 : 0;
    rangeRings = Math.max(0, 1 + party.exploreRange - visCut - wx);
    calculated.push(`Explore costs 1. Survey range: 1 ring${party.exploreRange ? `, +${party.exploreRange} from the party` : ''}${visCut ? `, ${minus(visCut)} for Poor Visibility ${sev['poor-visibility']}` : ''}${wx ? `, ${minus(1)} for Harsh Weather 3` : ''} = ${plural(rangeRings, 'ring')}.`);
    if (rangeRings === 0) calculated.push('0 rings is the current tile only; Explore still reveals useful local information.');
  } else {
    const visCut = remaining('poor-visibility') >= 2 ? 1 : 0, warped = remaining('warped-paths');
    let p = Math.min(2, Math.max(0, party.scoutPrecision - visCut));
    const parts = [`Scout costs 1. Precision: step 0 (direction only)${party.scoutPrecision ? `, +${party.scoutPrecision} from the party` : ''}${visCut ? `, ${minus(1)} for Poor Visibility ${sev['poor-visibility']}` : ''}`];
    if (warped >= 2 && p > 1) { p = 1; parts.push('limited to 1 by Warped Paths'); }
    precision = p;
    calculated.push(`${parts.join(', ')} = step ${p}.`);
    if (warped >= 3) { navigation = {flag: 'anomalous', text: NAVIGATION.anomalous}; calculated.push(`${NAVIGATION.anomalous}.`); }
    else if (warped >= 2) { navigation = {flag: 'uncertain', text: NAVIGATION.uncertain}; calculated.push(`${NAVIGATION.uncertain}.`); }
  }

  const pressure = pressureOf(sev), protectedFrom = [];
  for (const id of RELEVANT[action]) {
    if (!sev[id]) continue;
    let line = `${label(id)}: ${id === 'ashen-menace' ? `coordinated Ashen patrols, territorial responses; danger level per the pressure label (${PRESSURE_LABEL[pressure]}).` : GUIDANCE[id]}`;
    if ((id === 'blight-taint' || id === 'ashen-menace') && party.mitigation[id] > 0) { line += ` The party is protected from ${label(id)}; the area itself is unchanged.`; protectedFrom.push(id); }
    guidance.push(line);
  }
  if (override) calculated.push(`GM override: ${label(override.condition)} ${override.severity} for this action only.`);
  const out = {action, area: input.area ?? null, destination: action === 'travel' ? input.destination ?? null : null, cost, baseCost: 1, rangeRings, precision, navigation,
    pressure: {id: pressure, label: PRESSURE_LABEL[pressure]}, conditions: chipsFor(action, sev), severities: sev, calculated, guidance, override, protectedFrom};
  if (Number.isSafeInteger(input.left) && input.left < cost) {
    out.blocked = {reason: input.left <= 0 ? 'No actions are left today. Start a New day, or adjudicate this one at the table.'
      : `This costs ${plural(cost, 'action')} and only ${input.left} is left today.`};
  }
  return out;
}
