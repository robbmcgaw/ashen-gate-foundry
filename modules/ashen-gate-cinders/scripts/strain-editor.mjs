/** Ashen Gate | Cinders: the GM Setup → Strain editor, pure (no Foundry globals).
 * The draft has the shape of a Strain config, so validateConfig checks it as it is; a field the GM typed that is not a
 * whole number stays a string until it is fixed. Saving goes through api.strain.importConfig (GM only). */
import {validateConfig} from './strain.mjs';

const int = v => Number.isSafeInteger(v);
const MAX_BANDS = 50;

export const draftFromConfig = config => structuredClone(config);
/** Same values as the saved config (key order follows it, the draft being a copy). */
export const draftDirty = (draft, config) => Boolean(draft) && JSON.stringify(draft) !== JSON.stringify(config);

/** Typed text → value: '' stays '' (or null where empty means "none"), digits → a number, anything else stays text (invalid). */
function parse(raw, emptyIsNull) {
  const s = String(raw ?? '').trim();
  if (s === '') return emptyIsNull ? null : '';
  return /^\d+$/.test(s) ? Number(s) : s;
}
/** One edited field. path: bands.<i>.label|from|to, backfire_schedule.<i>, guarantee_at, normal_use_backfire_at,
 * allow_prevention_at_guarantee, hard_max, rest_recovery.long|short, effect_roll.strain_bonus.enabled|from|per.
 * Checkboxes pass a boolean. Returns a new draft; an unknown path changes nothing. */
export function setDraftField(draft, path, raw) {
  const d = structuredClone(draft), p = String(path).split('.');
  const bool = v => v === true || v === 'true' || v === 'on';
  if (p[0] === 'bands' && p.length === 3) {
    const band = d.bands?.[Number(p[1])];
    if (!band) return d;
    if (p[2] === 'label') band.label = String(raw ?? '');
    else if (p[2] === 'from') band.from = parse(raw, false);
    else if (p[2] === 'to') band.to = parse(raw, true);
    return d;
  }
  if (p[0] === 'backfire_schedule' && p.length === 2) {
    const i = Number(p[1]);
    if (Array.isArray(d.backfire_schedule) && int(i) && i >= 0 && i < d.backfire_schedule.length) d.backfire_schedule[i] = parse(raw, false);
    return d;
  }
  switch (path) {
    case 'guarantee_at': case 'normal_use_backfire_at': d[path] = parse(raw, false); break;
    case 'hard_max': d.hard_max = parse(raw, true); break;
    case 'allow_prevention_at_guarantee': d.allow_prevention_at_guarantee = bool(raw); break;
    case 'rest_recovery.long': case 'rest_recovery.short': d.rest_recovery = {...d.rest_recovery, [p[1]]: parse(raw, false)}; break;
    case 'effect_roll.strain_bonus.enabled': d.effect_roll.strain_bonus.enabled = bool(raw); break;
    case 'effect_roll.strain_bonus.from': case 'effect_roll.strain_bonus.per': d.effect_roll.strain_bonus[p[2]] = parse(raw, false); break;
  }
  return d;
}
/** A new open-ended band after the last one; the old last band is closed one step after its start (edit it next). */
export function addBand(draft) {
  const d = structuredClone(draft), last = d.bands.at(-1);
  if (d.bands.length >= MAX_BANDS || !last) return d;
  if (last.to === null || last.to === undefined) last.to = int(last.from) ? last.from : '';
  const from = int(last.to) ? last.to + 1 : '';
  d.bands.push({from, to: null, label: `Band ${d.bands.length}`});
  return d;
}
/** Remove one band; the band before it takes over its range (the last band stays open-ended when it was). Never the only band. */
export function removeBand(draft, index) {
  const d = structuredClone(draft), i = Number(index);
  if (d.bands.length < 2 || !int(i) || i < 0 || i >= d.bands.length) return d;
  const [gone] = d.bands.splice(i, 1);
  if (i === 0) d.bands[0].from = 0;
  else d.bands[i - 1].to = gone.to;
  return d;
}

/** Field keys the window marks: bands, band.<i>.label|from|to, schedule, schedule.<i>, guarantee, normalUse, prevention,
 * hardMax, rest.long, rest.short, effect.enabled, effect.from, effect.per, general. */
function fieldFor(error, draft) {
  let m;
  if ((m = /^bands\[(\d+)\]: label/.exec(error))) return [`band.${m[1]}.label`, 'Name: 1 to 60 characters.'];
  if ((m = /^bands\[(\d+)\]: from must be (\d+)/.exec(error))) return [`band.${m[1]}.from`, `Must be ${m[2]}: bands start at 0 and follow on with no gaps or overlaps.`];
  if ((m = /^bands\[(\d+)\]: only the last band/.exec(error))) return [`band.${m[1]}.to`, 'Only the last band can be open-ended: enter where this band stops.'];
  if ((m = /^bands\[(\d+)\]: to must be/.exec(error))) return [`band.${m[1]}.to`, 'Enter a whole number, not below From.'];
  if ((m = /^bands\[(\d+)\]: must be an object/.exec(error))) return [`band.${m[1]}.label`, 'This band is not readable: remove it.'];
  if (/^The last band must be open-ended/.test(error)) return [`band.${(draft.bands?.length ?? 1) - 1}.to`, 'Leave empty (open-ended), or reach the maximum Strain.'];
  if (/^bands must list/.test(error)) return ['bands', 'Keep 1 to 50 bands.'];
  if (/^backfire_schedule/.test(error)) return ['schedule', 'Each entry is a whole number from 0 to 100, never lower than the one before.'];
  if (/^guarantee_at/.test(error)) return ['guarantee', 'Enter a whole number, 0 or more.'];
  if (/^normal_use_backfire_at/.test(error)) return ['normalUse', 'Enter a whole number, 0 or more.'];
  if (/^allow_prevention_at_guarantee/.test(error)) return ['prevention', 'Tick or untick this box.'];
  if (/^hard_max must/.test(error)) return ['hardMax', 'Leave empty for no maximum, or enter a whole number of 1 or more.'];
  if (/^rest_recovery/.test(error)) return ['rest', 'Whole numbers from 0 to 100.'];
  if (/^effect_roll/.test(error)) return ['effect', 'From: 0 or more. Every: 1 to 100.'];
  return ['general', error];
}
/** Check the draft with validateConfig (the same check Save and Import use) and say which field each problem belongs to.
 * Returns {ok, config, errors: {key: [message]}, warnings: [message]}; ok only when validateConfig finds no error. */
export function checkDraft(draft) {
  const r = validateConfig(draft), errors = {};
  const put = (key, msg) => {(errors[key] ??= []).includes(msg) || errors[key].push(msg);};
  // Finer marks for the fields validateConfig reports as one message.
  const s = Array.isArray(draft?.backfire_schedule) ? draft.backfire_schedule : [];
  s.forEach((p, i) => {
    if (!int(p) || p < 0 || p > 100) put(`schedule.${i}`, 'Whole number from 0 to 100.');
    else if (i && int(s[i - 1]) && p < s[i - 1]) put(`schedule.${i}`, `Not below ${s[i - 1]}% (Strain ${i - 1}).`);
  });
  for (const k of ['long', 'short']) {const v = draft?.rest_recovery?.[k]; if (!int(v) || v < 0 || v > 100) put(`rest.${k}`, 'Whole number from 0 to 100.');}
  const sb = draft?.effect_roll?.strain_bonus ?? {};
  if (!int(sb.from) || sb.from < 0) put('effect.from', 'Whole number, 0 or more.');
  if (!int(sb.per) || sb.per < 1 || sb.per > 100) put('effect.per', 'Whole number from 1 to 100.');
  for (const e of r.errors) {
    const [key, msg] = fieldFor(e, draft ?? {});
    // The per-entry marks above already say it for these.
    if (key === 'schedule' && Object.keys(errors).some(k => k.startsWith('schedule.'))) continue;
    if (key === 'rest' && (errors['rest.long'] || errors['rest.short'])) continue;
    if (key === 'effect' && (errors['effect.from'] || errors['effect.per'])) continue;
    put(key, msg);
  }
  // Fine marks with no matching validateConfig error cannot happen with the rules above; keep ok tied to validateConfig alone.
  return {ok: r.errors.length === 0, config: r.config, errors, warnings: r.warnings};
}

/** The editor for the template. */
export function editorView(draft, check) {
  const err = key => (check.errors[key] ?? []).join(' ');
  const val = v => v === null || v === undefined ? '' : String(v);
  const bands = (draft.bands ?? []).map((b, i, all) => {
    const last = i === all.length - 1;
    return {index: i, number: i + 1, last, label: val(b?.label), from: val(b?.from), to: val(b?.to), canRemove: all.length > 1,
      labelError: err(`band.${i}.label`), fromError: err(`band.${i}.from`), toError: err(`band.${i}.to`),
      toHint: last ? 'Empty = open-ended' : ''};
  });
  const sb = draft.effect_roll?.strain_bonus ?? {};
  return {
    bands, bandsError: err('bands'), canAddBand: bands.length < MAX_BANDS,
    schedule: (Array.isArray(draft.backfire_schedule) ? draft.backfire_schedule : []).map((p, i) => ({index: i, value: val(p), error: err(`schedule.${i}`)})),
    scheduleError: err('schedule'),
    guaranteeAt: val(draft.guarantee_at), guaranteeError: err('guarantee'),
    normalUseAt: val(draft.normal_use_backfire_at), normalUseError: err('normalUse'),
    prevention: draft.allow_prevention_at_guarantee === true, preventionError: err('prevention'),
    hardMax: val(draft.hard_max), hardMaxError: err('hardMax'),
    restLong: val(draft.rest_recovery?.long), restLongError: err('rest.long'),
    restShort: val(draft.rest_recovery?.short), restShortError: err('rest.short'), restError: err('rest'),
    effectEnabled: sb.enabled === true, effectFrom: val(sb.from), effectFromError: err('effect.from'),
    effectPer: val(sb.per), effectPerError: err('effect.per'), effectError: err('effect'),
    general: check.errors.general ?? [], hasGeneral: Boolean(check.errors.general?.length),
    warnings: check.warnings, hasWarnings: check.warnings.length > 0, ok: check.ok
  };
}
