/** Cinders (0.16.0): Cinder instances, Push and Backfire. Pure rules, no Foundry globals.
 * A Cinder instance owns its progression (points, unlocks) and moves between bearers with it. Strain stays on each character. */
import {cleanAccount} from './engine.mjs';
import {applyChange,chanceFor,strainEffectBonus} from './strain.mjs';

export const CINDER_CONTRACT = 'ag-cinder/1';
export const REGISTRY_SCHEMA = 'ag-cinder-instances/1';
export const CINDER_SCHEMA = 'ag-cinder/0.1';
export const POWER_SCHEMA = 'ag-power/0.1';
export const BACKFIRE_SCHEMA = 'ag-backfire/0.1';
export const CINDER_WALLET_CAP = 13;
export const INSTANCE_ID = /^cinst_[A-Za-z0-9]{8,32}$/;
export const MODIFIER_TARGETS = ['push.cost', 'backfire.chance', 'backfire.severity', 'strain.recovery'];
/** Statuses a Backfire may never apply: it must not kill, knock out, exhaust or remove a character from play. */
export const FORBIDDEN_STATUSES = new Set(['dead', 'unconscious', 'exhaustion', 'petrified', 'sleeping', 'stable', 'transformed', 'dying']);
const REF = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
const KEY = /^[a-z][a-z0-9_-]{0,40}$/;
const plain = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const int = v => Number.isSafeInteger(v);
const arr = v => Array.isArray(v) ? v : [];
const text = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

// ---- Definitions (imported content) ----
export const cinderBlock = def => plain(def?.cinder) ? def.cinder : {};
export const powerBlock = def => plain(def?.power) ? def.power : null;
export const backfireBlock = def => plain(def?.backfire) ? def.backfire : null;
/** Backfire categories (BF-* ids) for a Push mode: the mode's, else the power's, else the Cinder's. */
export function categoriesFor(cinderDef, powerDef, mode = null) {
  for (const list of [mode?.backfire_categories, powerBlock(powerDef)?.backfire_categories, cinderBlock(cinderDef).backfire_categories])
    if (Array.isArray(list) && list.length) return list.filter(id => typeof id === 'string');
  return [];
}
/** A Backfire effect is allowed only when it is a temporary dnd5e status that cannot take a character out of play. */
export function effectProblem(effect) {
  if (effect == null) return null;
  if (!plain(effect)) return 'effect must be an object';
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/.test(String(effect.status ?? ''))) return 'effect.status must be a dnd5e status id (e.g. poisoned)';
  if (FORBIDDEN_STATUSES.has(effect.status)) return `effect.status "${effect.status}" is not allowed: a Backfire never kills, knocks out, exhausts or removes a character`;
  const r = effect.rounds, m = effect.minutes;
  if (!((int(r) && r >= 1 && r <= 100) || (int(m) && m >= 1 && m <= 1440))) return 'effect needs a duration: rounds (1–100) or minutes (1–1440)';
  for (const k of Object.keys(effect)) if (!['status', 'rounds', 'minutes'].includes(k)) return `effect.${k} is not allowed (only status, rounds, minutes; no HP or other changes)`;
  return null;
}
function modifierProblems(list, where) {
  const errors = [];
  if (list == null) return errors;
  if (!Array.isArray(list)) return [`${where}: modifiers must be a list`];
  list.forEach((m, i) => {
    const at = `${where}.modifiers[${i}]`;
    if (!plain(m)) {errors.push(`${at} must be an object`); return;}
    if (!MODIFIER_TARGETS.includes(m.target)) errors.push(`${at}: target must be one of ${MODIFIER_TARGETS.join(', ')}`);
    if (!int(m.value) || m.value === 0 || Math.abs(m.value) > 100) errors.push(`${at}: value must be a whole number from -100 to 100, not 0`);
    if (m.powers != null && (!Array.isArray(m.powers) || m.powers.some(p => !REF.test(String(p)) || !String(p).startsWith('POWER-')))) errors.push(`${at}: powers must list POWER-* ids`);
    if (m.modes != null && (!Array.isArray(m.modes) || m.modes.some(x => !KEY.test(String(x))))) errors.push(`${at}: modes must list Push mode ids`);
    if (m.stack != null && !KEY.test(String(m.stack))) errors.push(`${at}: stack must be a short lower-case name`);
    if (!text(m.label, 80)) errors.push(`${at}: label (1–80 characters) is required, it is shown to players`);
  });
  return errors;
}
const refList = (v, prefix, at, errors) => {
  if (v == null) return;
  if (!Array.isArray(v) || v.some(x => !REF.test(String(x)) || !String(x).startsWith(prefix))) errors.push(`${at} must list ${prefix}* ids`);
};
/**
 * Check the typed block of a Cinder (Mutation, MUT-*), Power (POWER-*) or Backfire table (BackfireTable, BF-*) record.
 * Records of other types, or without the block, have nothing to check here. Returns {errors, warnings}.
 */
export function validateDefinition(record) {
  const errors = [], warnings = [];
  if (!plain(record)) return {errors: ['Expected a record object'], warnings};
  const id = String(record.id ?? '?'), type = record.entity_type;
  if (type === 'Mutation' && record.cinder != null) {
    const c = record.cinder;
    if (!plain(c)) errors.push(`${id}: cinder must be an object`);
    else {
      if (c.schema !== CINDER_SCHEMA) errors.push(`${id}: cinder.schema must be "${CINDER_SCHEMA}"`);
      refList(c.backfire_categories, 'BF-', `${id}: cinder.backfire_categories`, errors);
    }
  }
  if (type === 'Power' && record.power != null) {
    const p = record.power;
    if (!id.startsWith('POWER-')) errors.push(`${id}: a Power with a power block needs a POWER-* id`);
    if (!plain(p)) errors.push(`${id}: power must be an object`);
    else {
      if (p.schema !== POWER_SCHEMA) errors.push(`${id}: power.schema must be "${POWER_SCHEMA}"`);
      if (!['power', 'enhancement'].includes(p.kind)) errors.push(`${id}: power.kind must be power or enhancement`);
      if (p.standard != null && !plain(p.standard)) errors.push(`${id}: power.standard must be an object`);
      refList(p.backfire_categories, 'BF-', `${id}: power.backfire_categories`, errors);
      errors.push(...modifierProblems(p.modifiers, `${id}: power`));
      const modes = p.push_modes;
      if (modes != null && !Array.isArray(modes)) errors.push(`${id}: power.push_modes must be a list`);
      if (p.kind === 'enhancement' && arr(modes).length) errors.push(`${id}: an enhancement has no push_modes (it opens a mode by being in a mode's requires.powers)`);
      if (p.kind === 'enhancement' && !arr(p.modifiers).length) warnings.push(`${id}: enhancement with no modifiers; it only works as a requirement`);
      const seen = new Set();
      arr(modes).forEach((m, i) => {
        const at = `${id}: power.push_modes[${i}]`;
        if (!plain(m)) {errors.push(`${at} must be an object`); return;}
        if (!KEY.test(String(m.id ?? ''))) errors.push(`${at}: id must be a short lower-case name`);
        else if (seen.has(m.id)) errors.push(`${at}: duplicate mode id ${m.id}`);
        seen.add(m.id);
        if (!text(m.label, 80)) errors.push(`${at}: label (1–80 characters) is required`);
        if (!int(m.strain_cost) || m.strain_cost < 1 || m.strain_cost > 100) errors.push(`${at}: strain_cost must be a whole number from 1 to 100 (every Push gains Strain)`);
        if (m.effect != null && !text(m.effect, 2000)) errors.push(`${at}: effect must be text up to 2000 characters`);
        if (m.requires != null && (!plain(m.requires) || (m.requires.powers != null && !Array.isArray(m.requires.powers)))) errors.push(`${at}: requires must be {powers: [POWER-* ids]}`);
        refList(m.requires?.powers, 'POWER-', `${at}: requires.powers`, errors);
        refList(m.backfire_categories, 'BF-', `${at}: backfire_categories`, errors);
      });
    }
  }
  if (type === 'BackfireTable') {
    const b = record.backfire;
    if (!id.startsWith('BF-')) errors.push(`${id}: a BackfireTable needs a BF-* id`);
    if (!plain(b)) errors.push(`${id}: backfire block is required`);
    else {
      if (b.schema !== BACKFIRE_SCHEMA) errors.push(`${id}: backfire.schema must be "${BACKFIRE_SCHEMA}"`);
      if (!text(b.label, 80)) errors.push(`${id}: backfire.label (the category name, 1–80 characters) is required`);
      if (b.weight != null && (!int(b.weight) || b.weight < 1 || b.weight > 100)) errors.push(`${id}: backfire.weight must be 1 to 100`);
      if (!Array.isArray(b.entries) || !b.entries.length || b.entries.length > 100) errors.push(`${id}: backfire.entries must list 1 to 100 effects, mildest first`);
      const seen = new Set();
      arr(b.entries).forEach((e, i) => {
        const at = `${id}: backfire.entries[${i}]`;
        if (!plain(e)) {errors.push(`${at} must be an object`); return;}
        if (!KEY.test(String(e.id ?? ''))) errors.push(`${at}: id must be a short lower-case name`);
        else if (seen.has(e.id)) errors.push(`${at}: duplicate entry id ${e.id}`);
        seen.add(e.id);
        if (!text(e.text, 2000)) errors.push(`${at}: text (shown in chat) is required`);
        const problem = effectProblem(e.effect);
        if (problem) errors.push(`${at}: ${problem}`);
      });
    }
  }
  return {errors, warnings};
}

// ---- Modifiers ----
/**
 * Add up the modifiers for one target from the powers unlocked on the Cinder.
 * unlocked: [{powerId, name, power}] where power is the power block. Scope: modifier.powers / modifier.modes (empty = all).
 * Modifiers sharing a stack name do not add up: only the one with the largest size counts. Returns {total, used:[{label,value,from}]}.
 */
export function collectModifiers(unlocked, target, {powerId = null, modeId = null} = {}) {
  const groups = new Map();
  for (const u of arr(unlocked)) for (const [i, m] of arr(u?.power?.modifiers).entries()) {
    if (!plain(m) || m.target !== target || !int(m.value)) continue;
    if (arr(m.powers).length && !m.powers.includes(powerId)) continue;
    if (arr(m.modes).length && !m.modes.includes(modeId)) continue;
    const key = m.stack ? `stack:${m.stack}` : `${u.powerId}#${i}`;
    const entry = {label: String(m.label ?? u.name ?? u.powerId), value: m.value, from: u.powerId};
    const prev = groups.get(key);
    if (!prev || Math.abs(entry.value) > Math.abs(prev.value)) groups.set(key, entry);
  }
  const used = [...groups.values()];
  return {total: used.reduce((s, m) => s + m.value, 0), used};
}
/** Push modes the bearer can use on a power: every mode whose requires.powers are all unlocked on the Cinder. */
export function availableModes(powerDef, unlockedPowerIds) {
  const have = new Set(arr(unlockedPowerIds));
  return arr(powerBlock(powerDef)?.push_modes).filter(m => plain(m) && arr(m.requires?.powers).every(id => have.has(id)));
}

// ---- Push ----
/**
 * Work out a Push before anything is rolled or written. Cost is never below 1 (every Push gains Strain); the Backfire chance uses the
 * Strain after the gain. Returns {cost, before, after, overflow, chance, guaranteed, modifiers:{cost, chance, severity}}.
 */
export function planPush({strainValue, config, mode, unlocked, powerId}) {
  const scope = {powerId, modeId: mode?.id ?? null};
  const costMods = collectModifiers(unlocked, 'push.cost', scope);
  const chanceMods = collectModifiers(unlocked, 'backfire.chance', scope);
  const severityMods = collectModifiers(unlocked, 'backfire.severity', scope);
  const cost = Math.max(1, (int(mode?.strain_cost) ? mode.strain_cost : 1) + costMods.total);
  const sim = applyChange({value: strainValue}, config, {op: 'add', amount: cost, source: {module: 'plan', kind: 'push'}, reason: 'plan'});
  const after = sim.state.value;
  return {cost, before: strainValue, after, overflow: sim.result.overflow, chance: chanceFor(config, after, chanceMods.total),
    guaranteed: after >= config.guarantee_at, modifiers: {cost: costMods, chance: chanceMods, severity: severityMods}};
}
/**
 * Resolve a Backfire with two rolls. roll(formula) → Promise<{total, formula}> (Foundry Roll in play, a fake in tests).
 * - chance 100: automatic; chance 0: none; else d100 ≤ chance.
 * - Category roll: 1d(total weight) over the BF tables (weight default 1). Effect roll: 1d(entries) + Strain bonus + severity modifiers,
 *   kept within the table (entries are ordered mildest first, so higher = worse).
 * tables: [{id, label, weight, entries:[{id, text, effect?}]}]. Returns a record for the chat card and the log.
 */
export async function resolveBackfire({chance, tables, config, strain, severity = 0, roll, forced = false}) {
  const out = {chance, check: null, backfire: false, category: null, categoryRoll: null, effectRoll: null, entry: null, note: null};
  if (forced || chance >= 100) out.backfire = true;
  else if (chance > 0) {
    const r = await roll('1d100');
    out.check = {formula: r.formula ?? '1d100', total: r.total};
    out.backfire = r.total <= chance;
  }
  if (!out.backfire) return out;
  const usable = arr(tables).filter(t => arr(t?.entries).length);
  if (!usable.length) {out.note = 'No Backfire table for this power: the GM decides what happens.'; return out;}
  const weights = usable.map(t => int(t.weight) && t.weight > 0 ? t.weight : 1), total = weights.reduce((a, b) => a + b, 0);
  let category = usable[0];
  if (usable.length > 1) {
    const r = await roll(`1d${total}`);
    out.categoryRoll = {formula: r.formula ?? `1d${total}`, total: r.total};
    let acc = 0;
    category = usable.find((t, i) => (acc += weights[i]) >= r.total) ?? usable.at(-1);
  }
  out.category = {id: category.id, label: category.label ?? category.id};
  const n = category.entries.length, bonus = strainEffectBonus(config, strain);
  const r = await roll(`1d${n}`);
  const result = Math.min(n, Math.max(1, r.total + bonus + (int(severity) ? severity : 0)));
  out.effectRoll = {formula: r.formula ?? `1d${n}`, die: r.total, strainBonus: bonus, severity: int(severity) ? severity : 0, result, of: n};
  const e = category.entries[result - 1];
  out.entry = {id: e.id, text: String(e.text ?? ''), position: result, effect: effectProblem(e.effect) || !e.effect ? null : {...e.effect}};
  return out;
}

// ---- Instances ----
export function normalizeInstance(raw) {
  const r = plain(raw) ? raw : {};
  const bearer = plain(r.bearer) && typeof r.bearer.actorId === 'string' && r.bearer.actorId ? {actorId: r.bearer.actorId, since: Number(r.bearer.since) || 0} : null;
  return {
    instanceId: String(r.instanceId ?? ''), definitionId: String(r.definitionId ?? ''),
    status: bearer ? 'bound' : (r.status === 'lost' ? 'lost' : 'unbound'), bearer,
    lastBearer: typeof r.lastBearer === 'string' ? r.lastBearer : null,
    progression: cleanAccount(r.progression), firstBoundAt: Number(r.firstBoundAt) || null,
    createdAt: Number(r.createdAt) || 0, revision: int(r.revision) && r.revision >= 0 ? r.revision : 0,
    migratedFrom: plain(r.migratedFrom) ? {actorId: String(r.migratedFrom.actorId ?? ''), at: Number(r.migratedFrom.at) || 0} : null
  };
}
export function normalizeRegistry(raw) {
  const list = arr(plain(raw) ? raw.instances : null).map(normalizeInstance).filter(i => INSTANCE_ID.test(i.instanceId) && REF.test(i.definitionId));
  const seen = new Set();
  return {schema: REGISTRY_SCHEMA, instances: list.filter(i => !seen.has(i.instanceId) && seen.add(i.instanceId))};
}
export const boundTo = (registry, actorId) => registry.instances.filter(i => i.bearer?.actorId === actorId);
export const bearerInstance = (registry, actorId, definitionId) => registry.instances.find(i => i.bearer?.actorId === actorId && i.definitionId === definitionId) ?? null;
const getInstance = (registry, instanceId) => {
  const i = registry.instances.find(x => x.instanceId === instanceId);
  if (!i) throw Error('Unknown Cinder');
  return i;
};
const replace = (registry, next) => ({...registry, instances: registry.instances.map(i => i.instanceId === next.instanceId ? next : i)});

export function createInstance(registry, definitionId, {instanceId, at = 0}) {
  if (!REF.test(String(definitionId ?? '')) || !String(definitionId).startsWith('MUT-')) throw Error('A Cinder is made from a MUT-* definition');
  if (!INSTANCE_ID.test(String(instanceId ?? ''))) throw Error('Invalid Cinder id');
  if (registry.instances.some(i => i.instanceId === instanceId)) throw Error('Cinder id already used');
  const inst = normalizeInstance({instanceId, definitionId, createdAt: at});
  return {registry: {...registry, instances: [...registry.instances, inst]}, instance: inst};
}
/** Checks shared by bind and transfer: one bearer per Cinder; at most `max` Cinders per character; one Cinder of a kind per character. */
function bearerProblem(registry, inst, actorId, max) {
  if (typeof actorId !== 'string' || !actorId) return 'Choose a character';
  const held = boundTo(registry, actorId).filter(i => i.instanceId !== inst.instanceId);
  if (held.some(i => i.definitionId === inst.definitionId)) return 'That character already bears a Cinder of this kind';
  if (int(max) && max >= 1 && held.length >= max) return `That character already bears ${held.length} Cinder${held.length === 1 ? '' : 's'} (the limit is ${max})`;
  return null;
}
/**
 * Bind an unbound (or lost) Cinder to a character. The first time a Cinder is ever bound it receives `initialPoints` (once per Cinder,
 * grant key "initial", within the 13-point wallet). Returns {registry, instance, initialAwarded}.
 */
export function bindInstance(registry, instanceId, actorId, {max = 1, at = 0, initialPoints = 0} = {}) {
  const inst = getInstance(registry, instanceId);
  if (inst.bearer) throw Error('This Cinder is already bound; use Transfer to move it');
  const problem = bearerProblem(registry, inst, actorId, max);
  if (problem) throw Error(problem);
  const progression = cleanAccount(inst.progression);
  let initialAwarded = 0;
  if (!inst.firstBoundAt && int(initialPoints) && initialPoints > 0 && !progression.grants.some(g => g.key === 'initial')) {
    initialAwarded = Math.min(initialPoints, CINDER_WALLET_CAP - progression.awarded);
    if (initialAwarded > 0) {progression.awarded += initialAwarded; progression.grants.push({key: 'initial', amount: initialAwarded}); progression.revision++;}
  }
  const next = {...inst, status: 'bound', bearer: {actorId, since: at}, progression, firstBoundAt: inst.firstBoundAt ?? at, revision: inst.revision + 1};
  return {registry: replace(registry, next), instance: next, initialAwarded};
}
export function unbindInstance(registry, instanceId, {lost = false} = {}) {
  const inst = getInstance(registry, instanceId);
  if (!inst.bearer) throw Error('This Cinder has no bearer');
  const next = {...inst, status: lost ? 'lost' : 'unbound', bearer: null, lastBearer: inst.bearer.actorId, revision: inst.revision + 1};
  return {registry: replace(registry, next), instance: next, from: inst.bearer.actorId};
}
/** Move a bound Cinder to another character, keeping its progression. No new starting point. */
export function transferInstance(registry, instanceId, toActorId, {max = 1, at = 0} = {}) {
  const inst = getInstance(registry, instanceId);
  if (!inst.bearer) throw Error('This Cinder has no bearer; use Bind');
  if (inst.bearer.actorId === toActorId) throw Error('That character already bears this Cinder');
  const problem = bearerProblem(registry, inst, toActorId, max);
  if (problem) throw Error(problem);
  const next = {...inst, status: 'bound', bearer: {actorId: toActorId, since: at}, lastBearer: inst.bearer.actorId, revision: inst.revision + 1};
  return {registry: replace(registry, next), instance: next, from: inst.bearer.actorId};
}
/** Record a progression change made on the bearer's tree. Returns the registry unchanged when the actor is not the bearer. */
export function withProgression(registry, actorId, definitionId, account) {
  const inst = bearerInstance(registry, actorId, definitionId);
  if (!inst) return {registry, instance: null};
  const next = {...inst, progression: cleanAccount(account), revision: inst.revision + 1};
  return {registry: replace(registry, next), instance: next};
}
const hasProgress = a => {const c = cleanAccount(a); return c.awarded > 0 || c.unlocks.length > 0;};
/**
 * Dry run: turn per-character Cinder progress (progressV2['cinder:MUT-*'] from before 0.16.0) into Cinders bound to that character.
 * actors: [{actorId, name, accounts}] where accounts is the progressV2 record. Never writes.
 */
export function planMigration(registry, actors, {max = 1} = {}) {
  const rows = [];
  for (const a of arr(actors)) for (const [key, account] of Object.entries(plain(a.accounts) ? a.accounts : {})) {
    if (!key.startsWith('cinder:') || !hasProgress(account)) continue;
    const definitionId = key.slice(7);
    if (!REF.test(definitionId)) continue;
    const base = {actorId: a.actorId, name: a.name ?? a.actorId, definitionId, account: cleanAccount(account)};
    if (bearerInstance(registry, a.actorId, definitionId)) {rows.push({...base, action: 'skip', reason: 'Already a Cinder bound to this character.'}); continue;}
    // A Cinder of this kind that this character bore or was migrated from: the progress is its copy, not older data.
    if (registry.instances.some(i => i.definitionId === definitionId && (i.lastBearer === a.actorId || i.migratedFrom?.actorId === a.actorId))) {
      rows.push({...base, action: 'skip', reason: 'This progress belongs to a Cinder this character bore; it is already a Cinder.'}); continue;
    }
    const held = boundTo(registry, a.actorId).length + rows.filter(r => r.actorId === a.actorId && r.action === 'create').length;
    rows.push({...base, action: 'create', reason: held >= max ? `Creates a bound Cinder; the character then bears more than the limit of ${max}. Review in the Cinders tab.` : 'Creates a Cinder bound to this character with this progress. No starting point is added.'});
  }
  return rows;
}

// ---- Player-safe view ----
/** What a bearer may see of their own Cinder (no GM notes, no other bearers). */
export function bearerView(inst, {definitionName = null} = {}) {
  const p = cleanAccount(inst.progression);
  return {instanceId: inst.instanceId, definitionId: inst.definitionId, name: definitionName ?? inst.definitionId, status: inst.status,
    awarded: p.awarded, unlocks: [...p.unlocks]};
}
