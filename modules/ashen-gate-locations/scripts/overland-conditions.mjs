/**
 * Travel conditions (0.38.0; conditions only since 0.39.0): ONE list of exactly six, fixed. The old condition/hazard split is gone from every
 * label; `kind` stays on the exported objects (always 'condition') for API compatibility and is never shown.
 * This file is the single source of truth: the `travel` owner check (travel-modifiers.mjs), the Travel tab,
 * scripts/validate-content.mjs and docs/modifiers-schema.md all read it. Pure data: no Foundry globals.
 * `guidance` is display help only; nothing is applied automatically.
 */
export const MAX_SEVERITY = 3;

export const OVERLAND_CONDITIONS = Object.freeze([
  Object.freeze({id: 'harsh-weather', label: 'Harsh Weather', kind: 'condition', hits: 'Rain, wind, storm, cold, heat.',
    guidance: 'Severity 2 or more makes exposed Travel cost one more action; severity 3 also shortens an Explore.'}),
  Object.freeze({id: 'hard-ground', label: 'Difficult Terrain', kind: 'condition', hits: 'Marsh, scree, undergrowth, snow, mud.',
    guidance: 'Severity 2 or more makes Travel into the area cost one more action.'}),
  Object.freeze({id: 'poor-visibility', label: 'Poor Visibility', kind: 'condition', hits: 'Mist, haze, dimness, night, dust.',
    guidance: 'Severity 2 or more removes an Explore ring and a Scout precision step; severity 3 removes a second ring.'}),
  Object.freeze({id: 'warped-paths', label: 'Warped Paths', kind: 'condition', hits: 'False trailmarks, misleading lights and sounds.',
    guidance: 'Severity 1 flags possible displacement on Travel; 2 or more makes Scout navigation uncertain and limits its precision.'}),
  Object.freeze({id: 'blight-taint', label: 'Blight Taint', kind: 'condition', hits: 'Blight-touched ground and weather.',
    guidance: "The GM's call (spoilage, Strain exposure); no travel stat. Severity 2 or more raises encounter pressure."}),
  Object.freeze({id: 'ashen-menace', label: 'Ashen Menace', kind: 'condition', hits: 'Ashen creatures abroad.',
    guidance: 'Raises the encounter pressure label; no travel stat.'})
]);
export const CONDITION_IDS = Object.freeze(OVERLAND_CONDITIONS.map(c => c.id));
export const conditionById = id => OVERLAND_CONDITIONS.find(c => c.id === id) ?? null;

const whole = (v, min, max) => Number.isSafeInteger(v) && v >= min ? Math.min(v, max) : min;
/** Severity 0 to 3 from whatever is stored. */
export const clampSeverity = v => whole(v, 0, MAX_SEVERITY);
/** {id: severity} for all six, from whatever is stored (missing or odd values become 0; unknown ids are dropped). */
export function normalizeConditions(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return Object.fromEntries(CONDITION_IDS.map(id => [id, clampSeverity(r[id])]));
}
/** Steps still biting: max(0, severity - mitigation). */
export const stepsRemaining = (severity, mitigation) => Math.max(0, clampSeverity(severity) - whole(mitigation, 0, MAX_SEVERITY));

/** A message for an applies.condition that is not one of the six; old ids get a re-import hint. */
export function unknownConditionMessage(value) {
  const list = CONDITION_IDS.join(', ');
  const old = typeof value === 'string' ? value : '';
  return `applies.condition must be one of the six ids: ${list}.${old ? ` "${old}" is not one of them: it is an older condition id, so update the pack to the six and re-import the record.` : ''}`;
}

/**
 * 0.40.0: PERSISTENT conditions, set on a Location or Region (GM only): a sparse {conditionId: 0..3}. An omitted id is "not set here" (the
 * parent decides); an explicit 0 IS set (it clears whatever a Region above says). Unknown ids and odd values are dropped.
 */
export function normalizeOverlandConditions(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const id of CONDITION_IDS) if (Number.isSafeInteger(r[id]) && r[id] >= 0) out[id] = Math.min(r[id], MAX_SEVERITY);
  return out;
}
/**
 * The persistent conditions in effect at a Location or Region. `locations`: the GM's location records (already normalized or not; only
 * id, parentLocationId, isRegion, name and overlandConditions are read). Walk: the location itself, then its Region ancestors, nearest first.
 * For each condition the NEAREST level that sets it wins (an explicit 0 wins and clears an inherited value); severities never add across levels.
 * Returns {severities: {id: 0..3 for all six}, sources: {id: null (set here, or nothing set anywhere) | {id, name} (the Region it comes from)}}.
 */
export function effectiveLocationConditions(locationId, locations) {
  const byId = new Map((Array.isArray(locations) ? locations : []).filter(l => l?.id).map(l => [l.id, l]));
  const chain = [], seen = new Set();
  for (let l = byId.get(locationId); l && !seen.has(l.id); l = byId.get(l.parentLocationId)) {
    seen.add(l.id);
    if (!chain.length || l.isRegion === true) chain.push(l);
  }
  const severities = {}, sources = {};
  for (const id of CONDITION_IDS) {
    severities[id] = 0; sources[id] = null;
    for (const [i, l] of chain.entries()) {
      const set = normalizeOverlandConditions(l.overlandConditions);
      if (id in set) { severities[id] = set[id]; sources[id] = i === 0 ? null : {id: l.id, name: l.name ?? l.id}; break; }
    }
  }
  return {severities, sources};
}
