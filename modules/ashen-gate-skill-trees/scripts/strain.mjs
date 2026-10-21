/** Strain (0.15.0): one shared number per character. Pure rules, no Foundry globals.
 * Kept apart from the trees on purpose: its Actor data lives under its own flag scope, so it can move to its own module later unchanged. */
export const STRAIN_SCOPE = 'ashen-gate-strain';
export const STRAIN_CONTRACT = 'ag-strain/1';
export const CONFIG_SCHEMA = 'ag-strain-config/0.1';
export const STRAIN_HISTORY_LIMIT = 30;
export const MAX_STEP = 1000;
const SLUG = /^[a-z][a-z0-9_-]{0,40}$/;
const MODULE_ID = /^[a-z0-9][a-z0-9_-]{0,80}$/;
const plain = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const int = v => Number.isSafeInteger(v);

/** Engine defaults: the spec's schedule and neutral band labels. Campaign band names arrive by importing a config file. */
export const DEFAULT_CONFIG = Object.freeze({
  schema: CONFIG_SCHEMA,
  backfire_schedule: Object.freeze([0, 5, 10, 20, 25, 35, 50, 60, 75, 90, 100]),
  guarantee_at: 10,
  normal_use_backfire_at: 10,
  allow_prevention_at_guarantee: false,
  bands: Object.freeze([
    {from: 0, to: 0, label: 'Band 0'}, {from: 1, to: 2, label: 'Band 1'}, {from: 3, to: 4, label: 'Band 2'},
    {from: 5, to: 6, label: 'Band 3'}, {from: 7, to: 8, label: 'Band 4'}, {from: 9, to: 9, label: 'Band 5'},
    {from: 10, to: null, label: 'Band 6'}
  ].map(Object.freeze)),
  hard_max: null,
  rest_recovery: Object.freeze({long: 1, short: 0}),
  // 0.16.0: higher Strain pushes the Backfire effect roll toward the severe end of the table: +1 per `per` Strain from `from`.
  effect_roll: Object.freeze({strain_bonus: Object.freeze({enabled: true, from: 5, per: 2})})
});
export const defaultConfig = () => structuredClone({...DEFAULT_CONFIG, backfire_schedule: [...DEFAULT_CONFIG.backfire_schedule],
  bands: DEFAULT_CONFIG.bands.map(b => ({...b})), rest_recovery: {...DEFAULT_CONFIG.rest_recovery},
  effect_roll: {strain_bonus: {...DEFAULT_CONFIG.effect_roll.strain_bonus}}});

/** Check a config file. Returns {errors, warnings, config}; config is null when there are errors. Missing fields take the defaults. */
export function validateConfig(raw) {
  const errors = [], warnings = [];
  if (!plain(raw)) return {errors: ['Expected a Strain config object'], warnings, config: null};
  if (raw.schema !== CONFIG_SCHEMA) errors.push(`schema must be "${CONFIG_SCHEMA}"`);
  const known = new Set(Object.keys(DEFAULT_CONFIG));
  for (const key of Object.keys(raw)) if (!known.has(key)) warnings.push(`Unknown field "${key}" is ignored`);
  const c = {...defaultConfig(), ...Object.fromEntries(Object.entries(raw).filter(([k]) => known.has(k)))};
  c.schema = CONFIG_SCHEMA;

  const s = c.backfire_schedule;
  if (!Array.isArray(s) || !s.length || s.length > 1000) errors.push('backfire_schedule must list 1 to 1000 percentages (index = Strain)');
  else {
    if (s.some(p => !int(p) || p < 0 || p > 100)) errors.push('backfire_schedule entries must be whole numbers from 0 to 100');
    else if (s.some((p, i) => i && p < s[i - 1])) errors.push('backfire_schedule must not go down as Strain rises');
  }
  if (!int(c.guarantee_at) || c.guarantee_at < 0) errors.push('guarantee_at must be a whole number of 0 or more');
  if (!int(c.normal_use_backfire_at) || c.normal_use_backfire_at < 0) errors.push('normal_use_backfire_at must be a whole number of 0 or more');
  if (typeof c.allow_prevention_at_guarantee !== 'boolean') errors.push('allow_prevention_at_guarantee must be true or false');
  if (c.hard_max !== null && (!int(c.hard_max) || c.hard_max < 1)) errors.push('hard_max must be null (no maximum) or a whole number of 1 or more');
  if (!plain(c.rest_recovery) || !['long', 'short'].every(k => int(c.rest_recovery[k]) && c.rest_recovery[k] >= 0 && c.rest_recovery[k] <= 100))
    errors.push('rest_recovery needs long and short, whole numbers from 0 to 100');
  else c.rest_recovery = {long: c.rest_recovery.long, short: c.rest_recovery.short};
  const sb = plain(c.effect_roll) ? c.effect_roll.strain_bonus : null;
  if (!plain(sb) || typeof sb.enabled !== 'boolean' || !int(sb.from) || sb.from < 0 || !int(sb.per) || sb.per < 1 || sb.per > 100)
    errors.push('effect_roll.strain_bonus needs enabled (true/false), from (0 or more) and per (1 to 100)');
  else c.effect_roll = {strain_bonus: {enabled: sb.enabled, from: sb.from, per: sb.per}};

  // Bands: from 0 upward with no gaps or overlaps; the last one may be open-ended (to: null).
  const b = c.bands;
  if (!Array.isArray(b) || !b.length || b.length > 50) errors.push('bands must list 1 to 50 bands');
  else {
    let next = 0;
    b.forEach((band, i) => {
      const where = `bands[${i}]`;
      if (!plain(band)) {errors.push(`${where} must be an object`); return;}
      if (typeof band.label !== 'string' || !band.label.trim() || band.label.length > 60) errors.push(`${where}: label must be 1 to 60 characters`);
      if (band.from !== next) errors.push(`${where}: from must be ${next} (bands start at 0 and leave no gaps)`);
      const last = i === b.length - 1;
      if (band.to === null || band.to === undefined) {if (!last) errors.push(`${where}: only the last band can be open-ended`); next = Infinity;}
      else if (!int(band.to) || band.to < band.from) errors.push(`${where}: to must be a whole number not below from`);
      else next = band.to + 1;
    });
    const top = b.at(-1);
    if (plain(top) && top.to !== null && top.to !== undefined && (c.hard_max === null || top.to < c.hard_max))
      errors.push('The last band must be open-ended (to: null) or reach hard_max');
    c.bands = b.filter(plain).map(x => ({from: x.from, to: x.to ?? null, label: String(x.label ?? '').trim()}));
  }
  if (int(c.guarantee_at) && Array.isArray(s) && s.length && s.at(-1) !== 100 && s.length - 1 >= c.guarantee_at)
    warnings.push('The schedule does not reach 100%; the guarantee still makes it 100% from guarantee_at');
  if (int(c.hard_max) && int(c.guarantee_at) && c.hard_max < c.guarantee_at) warnings.push('hard_max is below guarantee_at, so the guaranteed Backfire can never be reached');
  return {errors, warnings, config: errors.length ? null : c};
}
/** A stored config that fails the check (hand-edited, older) falls back to the defaults rather than breaking reads. */
export function normalizeConfig(raw) {
  if (raw == null) return defaultConfig();
  const r = validateConfig(raw);
  return r.config ?? defaultConfig();
}

export function bandFor(config, value) {
  const c = config ?? DEFAULT_CONFIG;
  return c.bands.find(b => value >= b.from && (b.to === null || value <= b.to)) ?? c.bands.at(-1);
}
/** Scheduled Backfire % at a Strain value (above the schedule: its last entry), plus a modifier bonus.
 * From guarantee_at it is 100 unless the config allows modifiers to prevent it. */
export function chanceFor(config, value, bonus = 0) {
  const c = config ?? DEFAULT_CONFIG, s = c.backfire_schedule;
  const base = s[Math.min(Math.max(0, value), s.length - 1)];
  const guaranteed = value >= c.guarantee_at;
  let chance = Math.min(100, Math.max(0, base + (int(bonus) ? bonus : 0)));
  if (guaranteed && !c.allow_prevention_at_guarantee) chance = 100;
  return chance;
}

export function normalizeState(raw) {
  const r = plain(raw) ? raw : {};
  return {
    value: int(r.value) && r.value >= 0 ? r.value : 0,
    history: Array.isArray(r.history) ? r.history.filter(plain).slice(-STRAIN_HISTORY_LIMIT).map(h => ({...h})) : []
  };
}
function cleanSource(source) {
  if (!plain(source)) throw Error('Strain change needs a source: {module, kind, ref?}');
  const module = String(source.module ?? ''), kind = String(source.kind ?? '');
  if (!MODULE_ID.test(module)) throw Error('Strain source.module must be the calling module id');
  if (!SLUG.test(kind)) throw Error('Strain source.kind must be a short lower-case word (e.g. push, crafting, hazard, rest_long)');
  const out = {module, kind};
  if (source.ref != null) {
    if (typeof source.ref !== 'string' || source.ref.length > 120) throw Error('Strain source.ref must be a short string');
    out.ref = source.ref;
  }
  return out;
}

/**
 * Apply one validated change. op: 'add' | 'remove' | 'set'. Returns {state, result} without writing anything.
 * - add/remove take a whole number 1–1000; set takes 0 or more. Remove stops at 0. Add stops at hard_max (when set) and records the overflow.
 * - Every change needs a source and a reason. A change whose opId is already in the history changes nothing (result.duplicate).
 * - A change that moves nothing (remove at 0) is not written (result.changed false).
 */
export function applyChange(rawState, config, {op, amount, source, reason, opId = null, at = 0, by = ''} = {}) {
  const c = config ?? DEFAULT_CONFIG, state = normalizeState(rawState);
  if (!['add', 'remove', 'set'].includes(op)) throw Error('Strain op must be add, remove or set');
  if (!int(amount) || amount < (op === 'set' ? 0 : 1) || amount > (op === 'set' ? 100000 : MAX_STEP))
    throw Error(op === 'set' ? 'Strain can only be set to a whole number of 0 or more' : `Strain ${op} takes a whole number from 1 to ${MAX_STEP}`);
  const src = cleanSource(source);
  const why = String(reason ?? '').trim();
  if (!why) throw Error('Give a reason for the Strain change');
  if (why.length > 200) throw Error('Strain reason is limited to 200 characters');
  if (opId != null && (typeof opId !== 'string' || !opId || opId.length > 100)) throw Error('opId must be a short string');
  if (opId) {
    const seen = state.history.find(h => h.opId === opId);
    if (seen) return {state, result: {from: seen.to - seen.delta, to: seen.to, delta: seen.delta, overflow: seen.overflow ?? 0, duplicate: true, changed: false}};
  }
  const from = state.value;
  let target = op === 'add' ? from + amount : op === 'remove' ? Math.max(0, from - amount) : amount;
  let overflow = 0;
  if (c.hard_max !== null && target > c.hard_max) {
    // A value already above a newly lowered hard_max is never pushed down by an add.
    const capped = op === 'set' ? c.hard_max : Math.max(c.hard_max, from);
    overflow = target - capped; target = capped;
  }
  const delta = target - from;
  if (delta === 0 && overflow === 0) return {state, result: {from, to: from, delta: 0, overflow: 0, duplicate: false, changed: false}};
  const entry = {at, by, op, delta, to: target, source: src, reason: why, ...(overflow ? {overflow} : {}), ...(opId ? {opId} : {})};
  const history = [...state.history, entry].slice(-STRAIN_HISTORY_LIMIT);
  return {state: {value: target, history}, result: {from, to: target, delta, overflow, duplicate: false, changed: true}};
}

/** Bonus to the Backfire effect roll from Strain: +1 at `from`, +1 more every `per` Strain after (default 5–6: +1, 7–8: +2, 9–10: +3). */
export function strainEffectBonus(config, value) {
  const sb = (config ?? DEFAULT_CONFIG).effect_roll?.strain_bonus;
  if (!sb?.enabled || !int(value) || value < sb.from) return 0;
  return Math.floor((value - sb.from) / sb.per) + 1;
}

/** Strain removed by a rest of this type ('long' | 'short'), never below 0. bonus: later recovery modifiers. */
export function restRecovery(config, type, bonus = 0) {
  const c = config ?? DEFAULT_CONFIG;
  const base = c.rest_recovery?.[type] ?? 0;
  return Math.max(0, base + (int(bonus) ? bonus : 0));
}

/** Read-only summary for display: value, band, the scheduled Backfire % at the current Strain, and the guarantee flags. */
export function summarize(config, rawState) {
  const c = config ?? DEFAULT_CONFIG, s = normalizeState(rawState);
  const band = bandFor(c, s.value);
  return {value: s.value, band: {label: band.label, from: band.from, to: band.to}, chance: chanceFor(c, s.value),
    guaranteed: s.value >= c.guarantee_at, normalUseBackfires: s.value >= c.normal_use_backfire_at,
    guaranteeAt: c.guarantee_at, hardMax: c.hard_max};
}
