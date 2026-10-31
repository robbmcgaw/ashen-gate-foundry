/**
 * Overland conditions and hazards (0.38.0): ONE concept with a classification. Natural ones are "conditions", unnatural ones are "hazards".
 * Exactly six, fixed. This file is the single source of truth: the `travel` owner check (travel-modifiers.mjs), the Overland tab,
 * scripts/validate-content.mjs and docs/modifiers-schema.md all read it. Pure data: no Foundry globals.
 * `guidance` is display help only; nothing is applied automatically.
 */
export const MAX_SEVERITY = 3;

export const OVERLAND_CONDITIONS = Object.freeze([
  Object.freeze({id: 'harsh-weather', label: 'Harsh Weather', kind: 'condition', hits: 'Rain, wind, storm, cold, heat.',
    guidance: 'Each unmitigated step costs the party one daily action.'}),
  Object.freeze({id: 'hard-ground', label: 'Hard Ground', kind: 'condition', hits: 'Marsh, scree, undergrowth, snow, mud.',
    guidance: 'Each unmitigated step makes Travel into the affected tile cost one extra step.'}),
  Object.freeze({id: 'poor-visibility', label: 'Poor Visibility', kind: 'condition', hits: 'Mist, haze, dimness, night, dust.',
    guidance: 'Each unmitigated step removes one Explore ring.'}),
  Object.freeze({id: 'warped-paths', label: 'Warped Paths', kind: 'hazard', hits: 'False trailmarks, misleading lights and sounds.',
    guidance: 'Each unmitigated step removes one Scout precision step; at 2 or more the GM may misdirect.'}),
  Object.freeze({id: 'blight-taint', label: 'Blight Taint', kind: 'hazard', hits: 'Blight-touched ground and weather.',
    guidance: "The GM's call (spoilage, Strain exposure); no travel stat."}),
  Object.freeze({id: 'ashen-menace', label: 'Ashen Menace', kind: 'hazard', hits: 'Ashen creatures abroad.',
    guidance: 'The GM raises encounter pressure.'})
]);
export const CONDITION_IDS = Object.freeze(OVERLAND_CONDITIONS.map(c => c.id));
export const conditionById = id => OVERLAND_CONDITIONS.find(c => c.id === id) ?? null;
export const KIND_LABEL = Object.freeze({condition: 'Conditions (natural)', hazard: 'Hazards (unnatural)'});

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
