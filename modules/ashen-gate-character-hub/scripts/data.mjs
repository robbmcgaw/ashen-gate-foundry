/**
 * Read-only view models built from the live Actor on every render. Nothing here is stored:
 * the Actor, its Items and dnd5e's derived data stay the only source of truth.
 */
import {dnd5eConfig, labelOf, num} from './constants.mjs';

/** CONFIG.statusEffects is an array in older cores and may be keyed by id in V14; accept both. */
export function statusEffectIds() {
  const s = globalThis.CONFIG?.statusEffects;
  const list = Array.isArray(s) ? s : Object.entries(s ?? {}).map(([id, e]) => ({id, ...e}));
  return new Set(list.map(e => e?.id).filter(Boolean));
}

function speciesName(actor) {
  const r = actor.system?.details?.race;
  if (r && typeof r === 'object') return r.name ?? '';
  return actor.items?.find?.(i => i.type === 'race')?.name ?? '';
}

export function headerData(actor) {
  const sys = actor.system ?? {}, attr = sys.attributes ?? {}, cfg = dnd5eConfig();
  const classes = Object.values(actor.classes ?? {}).map(c => ({name: c.name, level: num(c.system?.levels), subclass: c.subclass?.name ?? ''}));
  const hp = attr.hp ?? {};
  const mv = attr.movement ?? {};
  const units = mv.units ?? 'ft';
  const speeds = Object.keys(cfg.movementTypes ?? {walk: 1, fly: 1, swim: 1, climb: 1, burrow: 1})
    .filter(k => num(mv[k]) > 0).map(k => ({key: k, label: labelOf(cfg.movementTypes?.[k]) || k, value: num(mv[k]), units}));
  const resources = Object.entries(sys.resources ?? {})
    .filter(([, r]) => num(r?.max) > 0).map(([key, r]) => ({key, label: r.label || key, value: num(r.value), max: num(r.max)}));
  return {
    name: actor.name, img: actor.img, species: speciesName(actor), classes, level: num(sys.details?.level),
    hp: {value: num(hp.value), temp: num(hp.temp), max: num(hp.max), tempmax: num(hp.tempmax), effectiveMax: num(hp.effectiveMax, num(hp.max) + num(hp.tempmax))},
    ac: num(attr.ac?.value), prof: num(attr.prof), init: num(attr.init?.total ?? attr.init?.mod),
    speeds, inspiration: !!attr.inspiration,
    exhaustion: {value: num(attr.exhaustion), max: num(cfg.conditionTypes?.exhaustion?.levels, 6)},
    hd: attr.hd ? {value: num(attr.hd.value), max: num(attr.hd.max)} : null,
    resources, conditions: conditionsData(actor)
  };
}

/** dnd5e conditions (not exhaustion, which has levels), with whether each is active on the Actor. */
export function conditionsData(actor) {
  const types = dnd5eConfig().conditionTypes ?? {}, known = statusEffectIds();
  const active = actor.statuses ?? new Set();
  return Object.entries(types)
    .filter(([id, c]) => id !== 'exhaustion' && !c?.pseudo && known.has(id))
    .map(([id, c]) => ({id, label: labelOf(c) || id, active: active.has(id)}))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function abilitiesData(actor) {
  const cfg = dnd5eConfig().abilities ?? {};
  return Object.entries(actor.system?.abilities ?? {}).map(([key, a]) => ({
    key, label: labelOf(cfg[key]) || key.toUpperCase(), abbr: cfg[key]?.abbreviation ?? key.toUpperCase(),
    value: num(a.value), mod: num(a.mod), save: num(a.save?.value ?? a.save, num(a.mod)), saveProficient: num(a.proficient) >= 1
  }));
}

/** Proficiency multiplier → label for screen readers and the badge. */
export const PROF_LABELS = {0: 'Not proficient', 0.5: 'Half proficient', 1: 'Proficient', 2: 'Expertise'};

export function skillsData(actor) {
  const cfg = dnd5eConfig(), skills = cfg.skills ?? {}, abilities = cfg.abilities ?? {};
  return Object.entries(actor.system?.skills ?? {}).map(([key, s]) => {
    const prof = num(s.proficient ?? s.value);
    return {key, label: labelOf(skills[key]) || key, ability: s.ability, abilityAbbr: abilities[s.ability]?.abbreviation ?? s.ability ?? '',
      total: num(s.total), passive: num(s.passive), prof, profLabel: PROF_LABELS[prof] ?? 'Proficient'};
  }).sort((a, b) => a.label.localeCompare(b.label));
}
