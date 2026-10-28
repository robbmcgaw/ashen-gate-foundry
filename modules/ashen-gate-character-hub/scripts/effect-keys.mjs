/**
 * 0.62.2: the dnd5e Active Effect change keys the Hub reads, in both shapes. dnd5e 6.0 moved roll bonuses (system.abilities.dex.bonuses.save
 * is now system.abilities.dex.save.roll.bonus, and so on) and keeps the old key working through a compatibility redirect
 * (ActiveEffect5e.SHIM_FIELDS / BONUS_SHIM_REGEX). Content can carry either, so the Hub understands both and shows them identically.
 * Full table with dnd5e source evidence: docs/dnd5e-effect-keys.md. Pure functions; nothing here touches a document.
 *
 * A rule is {kind, legacy, current, subjects?}. Templates use {s} for the ability/skill/tool/movement/sense key and {w} for the
 * attack type. A rule whose legacy and current are equal is a key that never moved (skill passive bonus): legacy is then false.
 */
const ATTACK_TYPES = ['mwak', 'rwak', 'msak', 'rsak'];
const MOVEMENT = ['walk', 'fly', 'swim', 'climb', 'burrow', 'jump'];
const SENSES = ['darkvision', 'blindsight', 'tremorsense', 'truesight'];

export const KEY_RULES = [
  {kind: 'save', scope: 'ability', legacy: 'system.abilities.{s}.bonuses.save', current: 'system.abilities.{s}.save.roll.bonus'},
  {kind: 'check', scope: 'ability', legacy: 'system.abilities.{s}.bonuses.check', current: 'system.abilities.{s}.check.roll.bonus'},
  {kind: 'skill', scope: 'skill', legacy: 'system.skills.{s}.bonuses.check', current: 'system.skills.{s}.roll.bonus'},
  {kind: 'skill-passive', scope: 'skill', legacy: 'system.skills.{s}.bonuses.passive', current: 'system.skills.{s}.bonuses.passive'},
  {kind: 'tool', scope: 'tool', legacy: 'system.tools.{s}.bonuses.check', current: 'system.tools.{s}.roll.bonus'},
  {kind: 'all-saves', scope: 'global', legacy: 'system.bonuses.abilities.save', current: 'system.rolls.ability.save.bonus'},
  {kind: 'all-checks', scope: 'global', legacy: 'system.bonuses.abilities.check', current: 'system.rolls.ability.check.bonus'},
  {kind: 'all-skills', scope: 'global', legacy: 'system.bonuses.abilities.skill', current: 'system.rolls.ability.skill.bonus'},
  {kind: 'attack', scope: 'attack', legacy: 'system.bonuses.{w}.attack', current: 'system.rolls.attack.{w}.bonus'},
  {kind: 'damage', scope: 'attack', legacy: 'system.bonuses.{w}.damage', current: 'system.rolls.damage.{w}.bonus'},
  {kind: 'initiative', scope: 'global', legacy: 'system.attributes.init.bonus', current: 'system.attributes.init.roll.bonus'},
  {kind: 'concentration', scope: 'global', legacy: 'system.attributes.concentration.bonuses.save', current: 'system.attributes.concentration.roll.bonus'},
  {kind: 'death', scope: 'global', legacy: 'system.attributes.death.bonuses.save', current: 'system.attributes.death.roll.bonus'},
  {kind: 'speed', scope: 'movement', legacy: 'system.attributes.movement.{s}', current: 'system.attributes.movement.speeds.{s}'},
  {kind: 'speed', scope: 'movement', legacy: 'system.attributes.movement.speed', current: 'system.attributes.movement.speeds.walk', fixed: 'walk'},
  {kind: 'sense', scope: 'sense', legacy: 'system.attributes.senses.{s}', current: 'system.attributes.senses.ranges.{s}'}
];

const SUBJECTS = {ability: null, skill: null, tool: null, attack: ATTACK_TYPES, movement: MOVEMENT, sense: SENSES};
const esc = s => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
const compile = tpl => new RegExp(`^${esc(tpl).replace(/\{s\}/g, '(\\w+)').replace(/\{w\}/g, '(mwak|rwak|msak|rsak)')}$`);
const COMPILED = KEY_RULES.map(rule => ({rule, legacy: compile(rule.legacy), current: compile(rule.current), moved: rule.legacy !== rule.current}));

/**
 * What a change key is, in either shape: {kind, scope, subject, legacy, current, currentKey, legacyKey}, or null for a key the Hub has no rule for.
 * `subject` is the ability / skill / tool / attack type / movement type / sense (null for global bonuses); `legacy` is true only for the old shape.
 */
export function normalizeEffectKey(key) {
  const k = String(key ?? '').trim();
  if (!k.startsWith('system.')) return null;
  for (const c of COMPILED) {
    const fromCurrent = c.current.exec(k), fromLegacy = c.moved ? c.legacy.exec(k) : null;
    const m = fromCurrent ?? fromLegacy;
    if (!m) continue;
    const subject = c.rule.fixed ?? m[1] ?? null;
    if (subject && SUBJECTS[c.rule.scope] && !SUBJECTS[c.rule.scope].includes(subject)) continue;
    const fill = tpl => tpl.replace(/\{[sw]\}/g, subject);
    return {kind: c.rule.kind, scope: c.rule.scope, subject, legacy: !fromCurrent, currentKey: fill(c.rule.current), legacyKey: fill(c.rule.legacy)};
  }
  return null;
}

/** The dnd5e 6.0 form of a key (unchanged when it has no rule or is already current). */
export const toCurrentKey = key => normalizeEffectKey(key)?.currentKey ?? key;
/** The dnd5e 5.x form of a key (unchanged when it has no rule). Only for worlds below 6.0. */
export const toLegacyKey = key => normalizeEffectKey(key)?.legacyKey ?? key;

/** True when the version string is dnd5e 6.0 or later. An unreadable version counts as not (so the old key is written, which every version accepts). */
export function systemUsesCurrentKeys(version = globalThis.game?.system?.id === 'dnd5e' ? globalThis.game.system.version : null) {
  const major = parseInt(String(version ?? '').split('.')[0], 10);
  return Number.isFinite(major) && major >= 6;
}
/** The key to WRITE into a new effect for this world: the 6.0 form on dnd5e >= 6.0, otherwise the old form. (The Hub itself writes no companion effects; this is for any that do.) */
export const keyForWorld = (key, version) => (systemUsesCurrentKeys(version) ? toCurrentKey(key) : toLegacyKey(key));

// ---------- Labels ----------
const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const abil = k => globalThis.CONFIG?.DND5E?.abilities?.[k]?.label ?? String(k).toUpperCase();
const skill = k => globalThis.CONFIG?.DND5E?.skills?.[k]?.label ?? k;
const tool = k => { const t = globalThis.CONFIG?.DND5E?.tools?.[k]; return (typeof t?.label === 'string' && t.label) || cap(String(k).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()); };
const ATTACKS = {mwak: 'Melee weapon', rwak: 'Ranged weapon', msak: 'Melee spell', rsak: 'Ranged spell'};
/** Human label for a recognised key, identical for the old and the 6.0 shape; null when the key has no rule. */
export function effectKeyLabel(key) {
  const n = normalizeEffectKey(key);
  if (!n) return null;
  const s = n.subject;
  switch (n.kind) {
    case 'save': return `${abil(s)} saves`;
    case 'check': return `${abil(s)} checks`;
    case 'skill': return skill(s);
    case 'skill-passive': return `${skill(s)} (passive)`;
    case 'tool': return `${tool(s)} (tool)`;
    case 'all-saves': return 'Saving throws';
    case 'all-checks': return 'Ability checks';
    case 'all-skills': return 'Skill checks';
    case 'attack': case 'damage': return `${ATTACKS[s]} ${n.kind}`;
    case 'initiative': return 'Initiative';
    case 'concentration': return 'Concentration saves';
    case 'death': return 'Death saves';
    case 'speed': return `${cap(s)} speed`;
    case 'sense': return cap(s);
    default: return null;
  }
}
