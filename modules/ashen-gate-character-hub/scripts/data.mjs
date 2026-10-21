/**
 * Read-only view models built from the live Actor on every render. Nothing here is stored:
 * the Actor, its Items and dnd5e's derived data stay the only source of truth.
 */
import {dnd5eConfig, labelOf, num} from './constants.mjs';

/** CONFIG.statusEffects is an array in older cores and may be keyed by id in V14; accept both. */
function statusEffects() {
  const s = globalThis.CONFIG?.statusEffects;
  return Array.isArray(s) ? s : Object.entries(s ?? {}).map(([id, e]) => ({id, ...e}));
}
export const statusEffectIds = () => new Set(statusEffects().map(e => e?.id).filter(Boolean));

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
  const speeds = speedsData(mv, cfg);
  const resources = Object.entries(sys.resources ?? {})
    .filter(([, r]) => num(r?.max) > 0).map(([key, r]) => ({key, label: r.label || key, value: num(r.value), max: num(r.max)}));
  return {
    name: actor.name, img: actor.img, species: speciesName(actor), classes, level: num(sys.details?.level),
    hp: {value: num(hp.value), temp: num(hp.temp), max: num(hp.max), tempmax: num(hp.tempmax), effectiveMax: num(hp.effectiveMax, num(hp.max) + num(hp.tempmax))},
    ac: num(attr.ac?.value), prof: num(attr.prof), init: num(attr.init?.total ?? attr.init?.mod),
    speeds, hover: mv.hover === true, inspiration: !!attr.inspiration,
    exhaustion: {value: num(attr.exhaustion), max: num(cfg.conditionTypes?.exhaustion?.levels, 6)},
    hd: attr.hd ? {value: num(attr.hd.value), max: num(attr.hd.max)} : null,
    resources, conditions: conditionsData(actor)
  };
}

/**
 * Speeds above 0, in dnd5e's movement-type order. dnd5e 6 keeps them in movement.speeds (the old movement.walk etc.
 * still read through a shim); older data has them directly on movement. Jump is a dnd5e 6 movement type too.
 */
export function speedsData(mv, cfg = dnd5eConfig()) {
  const units = mv.units ?? 'ft', speeds = mv.speeds && typeof mv.speeds === 'object' ? mv.speeds : mv;
  return Object.keys(cfg.movementTypes ?? {walk: 1, burrow: 1, climb: 1, fly: 1, jump: 1, swim: 1})
    .filter(k => num(speeds[k] ?? mv[k]) > 0).map(k => ({key: k, label: labelOf(cfg.movementTypes?.[k]) || k, value: num(speeds[k] ?? mv[k]), units}));
}

/** dnd5e conditions (not exhaustion, which has levels), with whether each is active on the Actor. */
export function conditionsData(actor) {
  const types = dnd5eConfig().conditionTypes ?? {}, effects = new Map(statusEffects().filter(e => e?.id).map(e => [e.id, e]));
  const active = actor.statuses ?? new Set();
  return Object.entries(types)
    .filter(([id, c]) => id !== 'exhaustion' && !c?.pseudo && effects.has(id))
    .map(([id, c]) => ({id, label: labelOf(c) || id, active: active.has(id), img: c?.img || c?.icon || effects.get(id)?.img || effects.get(id)?.icon || ''}))
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

/** Finds a label in a dnd5e config map, including nested {label, children} groups (languages). */
function labelIn(map, key) {
  for (const [k, v] of Object.entries(map ?? {})) {
    if (k === key) return labelOf(v);
    if (v && typeof v === 'object' && v.children) { const found = labelIn(v.children, key); if (found) return found; }
  }
  return '';
}
const titleCase = k => String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
const keysOf = v => v instanceof Set ? [...v] : Array.isArray(v) ? v : [];
/** One proficiency trait (armor, weapons, languages) as display labels, plus any custom text. */
function traitLabels(trait, map) {
  const out = keysOf(trait?.value).map(k => labelIn(map, k) || titleCase(k));
  for (const c of String(trait?.custom ?? '').split(';').map(x => x.trim()).filter(Boolean)) out.push(c);
  return out;
}

/** Overview tab: passives, senses and proficiencies, read from dnd5e's prepared data. */
export function overviewData(actor) {
  const sys = actor.system ?? {}, cfg = dnd5eConfig(), skills = sys.skills ?? {};
  const passives = [['prc', 'Perception'], ['ins', 'Insight'], ['inv', 'Investigation']]
    .filter(([k]) => skills[k]).map(([k, label]) => ({key: k, label: labelOf(cfg.skills?.[k]) || label, value: num(skills[k].passive)}));
  const senses = sys.attributes?.senses ?? {}, ranges = senses.ranges ?? senses, units = senses.units ?? 'ft';
  const senseKeys = Object.keys(cfg.senses ?? {darkvision: 1, blindsight: 1, tremorsense: 1, truesight: 1});
  const senseList = senseKeys.filter(k => num(ranges[k]) > 0).map(k => `${labelOf(cfg.senses?.[k]) || titleCase(k)} ${num(ranges[k])} ${units}`);
  if (senses.special) senseList.push(String(senses.special));
  const tr = sys.traits ?? {};
  const tools = Object.keys(sys.tools ?? {}).map(k => labelIn(cfg.tools, k) || labelIn(cfg.toolProficiencies, k) || titleCase(k));
  const proficiencies = [['Armor', traitLabels(tr.armorProf, cfg.armorProficiencies)], ['Weapons', traitLabels(tr.weaponProf, cfg.weaponProficiencies)],
    ['Tools', tools], ['Languages', traitLabels(tr.languages, cfg.languages)]].map(([label, list]) => ({label, list}));
  return {passives, senses: senseList, proficiencies};
}
