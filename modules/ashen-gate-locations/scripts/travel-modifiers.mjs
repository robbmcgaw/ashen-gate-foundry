/**
 * The `travel` modifier scope (0.37.0): Locations is its owner. Items (ITEM-*) and perks (PERK-*) carry an `ag-modifiers/0.1` block
 * (docs/modifiers-schema.md); this file checks the entries General Manager hands to api.modifiers.validate, and adds up what the party
 * carries for the Overland tab. Pure data: no Foundry globals, so scripts/validate-content.mjs can import it too.
 * Nothing here is automatic play: the numbers are shown to the GM, who adjudicates.
 */
export const MODIFIER_CONTRACT = 'ag-modifier/1';
export const MODIFIER_SCOPE = 'travel';

export const TERRAINS = Object.freeze(['difficult-terrain', 'marsh', 'forest', 'hills', 'grassland', 'road']);
export const CONDITIONS = Object.freeze(['cold', 'heat', 'rain-and-wind', 'dust-and-ash', 'darkness', 'difficult-terrain',
  'mist-and-soft-ground', 'thin-air-quick-weather', 'hissing-grass', 'green-dimness', 'open-haze', 'rising-water']);
/** Closed set for applies.when. `mounted` follows the GM's Mounted switch; `familiar_terrain` is the GM's call (never added up). */
export const WHEN = Object.freeze(['mounted', 'familiar_terrain']);

/** values: the whole numbers one entry may carry (all positive); cap: the most the total can reach (null: no cap is set). */
export const TARGETS = Object.freeze({
  'travel.actions': Object.freeze({values: [1, 2], cap: 2, label: 'Bonus daily actions'}),
  'travel.efficiency': Object.freeze({values: [1], cap: 2, label: 'Travel efficiency', unit: 'steps of terrain cost removed', applies: 'terrain'}),
  'scout.precision': Object.freeze({values: [1, 2], cap: 2, label: 'Scout precision', unit: 'steps'}),
  'explore.range': Object.freeze({values: [1], cap: 2, label: 'Explore range', unit: 'extra rings of tiles'}),
  'condition.mitigation': Object.freeze({values: [1, 2, 3], cap: null, label: 'Condition mitigation', unit: 'steps a named penalty is reduced', applies: 'condition'})
});
export const TARGET_IDS = Object.freeze(Object.keys(TARGETS));
export const SCOUT_LADDER = Object.freeze(['0: direction only', '1: a named region or quadrant', '2: a named landmark or route']);

const ENTRY_KEYS = ['target', 'value', 'label', 'scope', 'op', 'applies', 'stack'];
const KEY = /^[a-z][a-z0-9_-]{0,40}$/;
const plain = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const arr = v => Array.isArray(v) ? v : [];
const sortedUnique = list => [...new Set(list)].sort();
const words = list => list.join(', ');

/** Problems with one travel entry (a modifier object whose scope is filled in). Messages start at `at`. */
export function entryProblems(m, at) {
  if (!plain(m)) return [`${at} must be an object`];
  const errors = [];
  if (m.scope != null && m.scope !== MODIFIER_SCOPE) errors.push(`${at}: scope must be "${MODIFIER_SCOPE}" here`);
  if (m.op != null && m.op !== 'add') errors.push(`${at}: op must be "add"`);
  const extra = Object.keys(m).filter(k => !ENTRY_KEYS.includes(k));
  if (extra.length) errors.push(`${at}: unknown field(s) ${extra.join(', ')}`);
  const def = TARGETS[m.target];
  if (!def) errors.push(`${at}: target must be one of ${words(TARGET_IDS)}`);
  if (!Number.isSafeInteger(m.value) || m.value === 0) errors.push(`${at}: value must be a positive whole number`);
  else if (m.value < 0) errors.push(`${at}: value must be positive (travel modifiers only help)`);
  else if (def && !def.values.includes(m.value)) errors.push(`${at}: ${m.target} takes ${def.values.length === 1 ? `only ${def.values[0]}` : `${def.values[0]} to ${def.values.at(-1)}`}${m.target === 'condition.mitigation' ? ' (no blanket immunity)' : ''}`);
  if (typeof m.label !== 'string' || !m.label.trim() || m.label.length > 80) errors.push(`${at}: label (1–80 characters) is required, it is shown to players`);
  if (m.stack != null && !KEY.test(String(m.stack))) errors.push(`${at}: stack must be a short lower-case name`);
  if (m.applies != null) {
    if (!plain(m.applies)) errors.push(`${at}: applies must be an object {terrain?, condition?, when?}`);
    else {
      const a = m.applies, own = def?.applies;
      for (const k of Object.keys(a)) if (!['terrain', 'condition', 'when'].includes(k)) errors.push(`${at}: applies.${k} is not one travel modifiers read (terrain, condition, when)`);
      if (a.terrain !== undefined) {
        if (def && own !== 'terrain') errors.push(`${at}: applies.terrain is only for travel.efficiency`);
        else if (!Array.isArray(a.terrain) || !a.terrain.length || a.terrain.some(t => !TERRAINS.includes(t)) || new Set(a.terrain).size !== a.terrain.length)
          errors.push(`${at}: applies.terrain must list each of ${words(TERRAINS)} at most once`);
      }
      if (a.condition !== undefined) {
        if (def && own !== 'condition') errors.push(`${at}: applies.condition is only for condition.mitigation`);
        else if (typeof a.condition !== 'string' || !CONDITIONS.includes(a.condition)) errors.push(`${at}: applies.condition must be one id from ${words(CONDITIONS)}`);
      }
      if (a.when !== undefined && (!Array.isArray(a.when) || !a.when.length || a.when.some(w => !WHEN.includes(w)) || new Set(a.when).size !== a.when.length))
        errors.push(`${at}: applies.when must list each of ${words(WHEN)} at most once`);
    }
  }
  if (m.target === 'condition.mitigation' && !(plain(m.applies) && m.applies.condition !== undefined))
    errors.push(`${at}: condition.mitigation needs applies.condition (one condition id; there is no blanket immunity)`);
  return errors;
}

/**
 * The scope owner's check for record-level modifiers blocks (General Manager calls it as api.modifiers.validate).
 * entries: [{index, scope, modifier}] with scope filled in. Returns {errors, warnings}.
 */
export function validateModifiers(entries, {recordId = '?'} = {}) {
  const errors = [], warnings = [];
  for (const e of arr(entries)) {
    const at = `${recordId}: modifiers.list[${Number.isInteger(e?.index) ? e.index : '?'}]`;
    const modifier = {...(plain(e?.modifier) ? e.modifier : {}), scope: e?.scope ?? e?.modifier?.scope};
    errors.push(...entryProblems(modifier, at));
    if (plain(modifier.applies) && arr(modifier.applies.when).includes('familiar_terrain'))
      warnings.push(`${at}: familiar_terrain is the GM's call; it is listed in the Overland tab but never added to the totals.`);
  }
  return {errors, warnings};
}

/** A usable travel entry in one shape, or null when anything about it is invalid. */
export function normalizeModifier(m, defaultScope = MODIFIER_SCOPE) {
  if (!plain(m)) return null;
  const withScope = {...m, scope: m.scope ?? defaultScope};
  if (withScope.scope !== MODIFIER_SCOPE || entryProblems(withScope, 'x').length) return null;
  const a = plain(m.applies) ? m.applies : {};
  return {target: m.target, value: m.value, label: m.label, stack: typeof m.stack === 'string' ? m.stack : null,
    terrain: Array.isArray(a.terrain) ? sortedUnique(a.terrain) : null, condition: typeof a.condition === 'string' ? a.condition : null,
    when: sortedUnique(arr(a.when))};
}
/** The valid travel entries of a record's imported definition (the block's scope is the default for its entries). */
export function blockModifiers(definition) {
  const block = definition?.modifiers;
  if (!plain(block) || !Array.isArray(block.list)) return [];
  return block.list.map(m => normalizeModifier(m, block.scope)).filter(Boolean);
}

/** The stacking group: an explicit `stack` name (within one target), else target + applies. */
const groupKey = m => m.stack ? `${m.target}|stack:${m.stack}` : `${m.target}|${m.terrain?.join('+') ?? ''}|${m.condition ?? ''}|${m.when.join('+')}`;

/**
 * Adds up what the party carries.
 * sources: [{sourceId, name, character, mountItem?, inactive?: 'not equipped', modifiers: [normalized]}]
 * mounted: the GM's Mounted switch.
 * Returns {mounted, bonus: {actions, explore, scout}, rows: [{key, target, terrain, condition, label, unit, total, cap, capped, sources}]}.
 * Rules: within a stacking group only the highest value counts (the whole party shares the group, so the best source wins);
 * different groups add; travel.actions, explore.range, scout.precision and travel.efficiency (per terrain) stop at +2.
 * A modifier counts when it is not inactive, every `when` it names is met (mounted: the switch is on; familiar_terrain: never, it is the GM's call),
 * and, for an item on the character's mount, the switch is on.
 */
export function combine(sources, {mounted = false} = {}) {
  const contributions = [];
  for (const s of arr(sources)) for (const m of arr(s.modifiers)) {
    let reason = null;
    if (s.inactive) reason = s.inactive;
    else if ((s.mountItem || m.when.includes('mounted')) && !mounted) reason = 'needs the Mounted switch';
    else if (m.when.includes('familiar_terrain')) reason = 'familiar terrain is your call';
    contributions.push({s, m, reason});
  }
  const rowSpecs = [];
  for (const target of TARGET_IDS) {
    const mine = contributions.filter(c => c.m.target === target);
    if (!mine.length) continue;
    if (target === 'travel.efficiency') {
      const named = TERRAINS.filter(t => mine.some(c => c.m.terrain?.includes(t)));
      for (const t of named) rowSpecs.push({target, terrain: t, items: mine.filter(c => !c.m.terrain || c.m.terrain.includes(t))});
      const generic = mine.filter(c => !c.m.terrain);
      if (generic.length) rowSpecs.push({target, terrain: '', items: generic});
    } else if (target === 'condition.mitigation') {
      for (const cond of CONDITIONS.filter(c => mine.some(x => x.m.condition === c))) rowSpecs.push({target, condition: cond, items: mine.filter(c => c.m.condition === cond)});
    } else rowSpecs.push({target, items: mine});
  }
  const rows = rowSpecs.map(spec => {
    const best = new Map();
    for (const c of spec.items) {
      if (c.reason) continue;
      const k = groupKey(c.m), cur = best.get(k);
      if (!cur || c.m.value > cur.m.value) best.set(k, c);
    }
    const win = new Set(best.values());
    const sum = [...win].reduce((n, c) => n + c.m.value, 0);
    const def = TARGETS[spec.target];
    const total = def.cap == null ? sum : Math.min(sum, def.cap);
    return {key: spec.terrain !== undefined ? `${spec.target}:${spec.terrain || '*'}` : spec.condition ? `${spec.target}:${spec.condition}` : spec.target,
      target: spec.target, terrain: spec.terrain ?? null, condition: spec.condition ?? null, label: def.label, unit: def.unit ?? '',
      total, cap: def.cap, capped: def.cap != null && sum > def.cap,
      sources: spec.items.map(c => {
        const beaten = !c.reason && !win.has(c) ? best.get(groupKey(c.m)) : null;
        return {name: c.s.name, character: c.s.character ?? '', label: c.m.label, value: c.m.value, counted: win.has(c),
          note: c.reason ?? (beaten ? `${beaten.s.name} gives more in the same group` : '')};
      })};
  });
  const total = target => rows.find(r => r.key === target)?.total ?? 0;
  return {mounted: mounted === true, bonus: {actions: total('travel.actions'), explore: total('explore.range'), scout: total('scout.precision')}, rows};
}
