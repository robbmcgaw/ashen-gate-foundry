/**
 * Spell preparation limits (0.51.0). Everything here reads dnd5e 6's own data; the Hub works out no rules of its own.
 *
 * How dnd5e 6.0.6 models it (checked against its source):
 *   - A spell has `system.method` ('spell', 'pact', 'atwill', 'innate', 'ritual'), `system.prepared` (0 unprepared,
 *     1 prepared, 2 always prepared) and `system.sourceItem` ('class:<identifier>'); `system.classIdentifier` resolves
 *     that to the spellcasting class (a subclass's spells resolve to its class).
 *   - `system.countsPrepared` is true when the method prepares (CONFIG.DND5E.spellcasting[method].prepares: 'spell' and
 *     'pact'), the spell is above cantrip level and prepared === 1. So always-prepared (2), cantrips, at-will, innate and
 *     ritual-only spells are never counted, and a spell with no source class is not counted either.
 *   - The limit is on the class item: `system.spellcasting.preparation.max` (from the class's preparation formula, for
 *     example a scale value) and `.value` (how many spells count). `item.spellcasting.preparation` is the same for the
 *     class, or for its subclass when the subclass has its own spellcasting (third casters).
 * dnd5e only shows these numbers; it never refuses to prepare past the maximum. This file does, for players.
 *
 * Never blocked: always-prepared spells, cantrips, at-will, innate, ritual-only, spells with no source class, spells
 * from items, and any class whose maximum dnd5e does not give (0 or missing: "limit unknown"). A wizard's spellbook
 * spells are just unprepared spells, so they are unlimited; only the prepared ones count.
 */
import {MODULE_ID, num, dnd5eConfig} from './constants.mjs';

export const ENFORCE_SETTING = 'enforcePrepLimits';
const isGM = () => globalThis.game?.user?.isGM === true;
const refuse = error => ({ok: false, error});

/** World setting "Enforce spell preparation limits" (GM Setup). Default on; an unregistered or unreadable value counts as on. */
export function registerPrepSettings(settings, onChange) {
  settings?.register?.(MODULE_ID, ENFORCE_SETTING, {name: 'Character Hub: enforce spell preparation limits', hint: 'Players cannot prepare more spells than their class allows. Change it in GM Setup.', scope: 'world', config: false, type: Boolean, default: true, onChange});
}
export function enforcementOn() {
  try { return globalThis.game?.settings?.get?.(MODULE_ID, ENFORCE_SETTING) !== false; } catch { return true; }
}
/** GM only. */
export async function setEnforcement(on) {
  if (!isGM()) return refuse('Only the GM can change whether spell preparation limits are enforced.');
  try { await globalThis.game?.settings?.set?.(MODULE_ID, ENFORCE_SETTING, on === true); } catch (err) { return refuse(`The setting was not saved: ${err?.message ?? err}`); }
  return {ok: true, result: on === true};
}

// ---------- Reading dnd5e's data ----------

/** True when this spell's method is one dnd5e prepares ('spell', 'pact'); without the config table, those two. */
export function methodPrepares(method) {
  const table = dnd5eConfig().spellcasting;
  return table ? !!table[method]?.prepares : method === 'spell' || method === 'pact';
}
/** dnd5e's own `countsPrepared`: a prepared (1) spell above cantrip level whose method prepares. Always (2) is not counted. */
export function countsPrepared(item) {
  const s = item?.system ?? {};
  if (typeof s.countsPrepared === 'boolean') return s.countsPrepared;
  return methodPrepares(s.method) && num(s.level) > 0 && num(s.prepared) === 1;
}
/** Would this spell count once prepared? (a prepares-method spell above cantrip level.) */
export const preparable = item => methodPrepares(item?.system?.method) && num(item?.system?.level) > 0;

/** The identifier of the class a spell belongs to ('' when none): dnd5e's `classIdentifier`, else its sourceItem. */
export function classIdOf(item, actor = item?.actor) {
  const s = item?.system ?? {};
  if (typeof s.classIdentifier === 'string' && s.classIdentifier) return s.classIdentifier;
  const src = typeof s.sourceItem === 'string' ? s.sourceItem : '';
  const cls = /^class:(.+)$/.exec(src);
  if (cls) return cls[1];
  const sub = /^subclass:(.+)$/.exec(src);
  if (sub) { const sc = [...(actor?.items ?? [])].find(i => i.type === 'subclass' && (i.identifier ?? i.system?.identifier) === sub[1]); return sc?.system?.classIdentifier ?? ''; }
  return '';
}

const identifierOf = item => item?.identifier ?? item?.system?.identifier ?? String(item?.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
/** [identifier, class item] for each spellcasting class: dnd5e's `actor.spellcastingClasses`, else classes whose progression isn't 'none'. */
export function spellcastingClasses(actor) {
  const sc = actor?.spellcastingClasses;
  if (sc && typeof sc === 'object') return Object.entries(sc);
  return [...(actor?.items ?? [])].filter(i => i.type === 'class' && (i.system?.spellcasting?.progression ?? 'none') !== 'none').map(i => [identifierOf(i), i]);
}
/** The class's preparation maximum from dnd5e, or null when it gives none (a missing, non-numeric or 0 maximum is "unknown"). */
export function classLimit(cls) {
  try {
    const p = cls?.spellcasting?.preparation ?? cls?.system?.spellcasting?.preparation;
    const max = Math.trunc(Number(p?.max));
    return Number.isFinite(max) && max > 0 ? max : null;
  } catch { return null; }
}

/**
 * Per spellcasting class: {id, name, itemId, max (null = unknown), known, value, full, over, prepared: [{id, name}]}.
 * `value` counts the spells dnd5e counts for that class (always-prepared, cantrips and the like are not in it). A class
 * with no limit and nothing prepared is left out.
 */
export function preparationSummary(actor) {
  const spells = [...(actor?.items ?? [])].filter(i => i.type === 'spell' && countsPrepared(i));
  return spellcastingClasses(actor).map(([id, cls]) => {
    const prepared = spells.filter(sp => classIdOf(sp, actor) === id).map(sp => ({id: sp.id, name: sp.name})).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const max = classLimit(cls);
    return {id, name: cls.name, itemId: cls.id, max, known: max !== null, value: prepared.length, full: max !== null && prepared.length >= max, over: max !== null && prepared.length > max, prepared};
  }).filter(c => c.known || c.value > 0);
}

// ---------- Wording ----------

const article = name => (/^[aeiou]/i.test(String(name ?? '').trim()) ? 'an' : 'a');
const spellsWord = n => (n === 1 ? '1 spell' : `${n} spells`);
/** "You can prepare 6 spells as a Wizard. Unprepare one first." */
export const limitMessage = c => `You can prepare ${spellsWord(c.max)} as ${article(c.name)} ${c.name}. Unprepare one first.`;
/** The indicator text, tooltip and aria-label for one class (and whether to name it). */
export function indicatorText(c, {named = true} = {}) {
  const who = c.name, label = named ? who : 'Prepared';
  if (!c.known) return {text: `${label} ${c.value}`, tip: `${spellsWord(c.value)} prepared as ${article(who)} ${who} (limit unknown)`, full: false};
  const tip = `${c.value} of ${c.max} spells prepared as ${who}${c.over ? ' (over the limit)' : c.full ? ' (full)' : ''}`;
  return {text: `${label} ${c.value}/${c.max}`, tip, full: c.full};
}

// ---------- The check ----------

/**
 * What preparing this spell would do. {applies, class, unknown, over, blocked, gmOver}:
 * applies is false for anything the limit never touches (not a spell, already prepared or always prepared, cantrip,
 * at-will, innate, ritual-only, no source class). unknown: the class has no maximum, so nothing is blocked.
 * over: this would exceed the maximum. blocked: over, for a non-GM, while enforcement is on. gmOver: over, for a GM,
 * while enforcement is on (the GM is never blocked, but is told).
 */
export function prepareCheck(actor, item, {gm = isGM(), enforce = enforcementOn()} = {}) {
  const none = {applies: false, unknown: false, over: false, blocked: false, gmOver: false, class: null};
  if (item?.type !== 'spell' || !preparable(item) || num(item.system?.prepared) !== 0) return none;
  const id = classIdOf(item, actor);
  if (!id) return none;
  const c = preparationSummary(actor).find(row => row.id === id);
  if (!c) return none;
  if (!c.known) return {...none, applies: true, unknown: true, class: c};
  const over = c.value + 1 > c.max;
  return {...none, applies: true, class: c, over, blocked: over && !gm && enforce, gmOver: over && gm && enforce};
}
/** The GM's "over the limit" notice (the GM is told, never stopped). */
export function notifyGmOver(c, notify = globalThis.ui?.notifications) {
  notify?.warn?.(`Over the limit: ${c.value + 1} of ${c.max} spells prepared as ${article(c.name)} ${c.name}.`);
}
/** What a refusal carries so the Hub's dialog can offer the swap: the class, its maximum and its prepared spells. */
export const limitInfo = c => ({classId: c.id, className: c.name, max: c.max, prepared: c.prepared.map(p => ({...p}))});

// ---------- Foundry's own updates (the standard sheet's toggle) ----------

/** Options passed by the Hub's own updates, which have already been checked, so the guard below leaves them alone. */
export const CHECKED = 'agchPrepChecked';
/**
 * preUpdateItem guard: a player preparing a spell past their class's limit from any sheet (the standard sheet's toggle
 * included) is stopped with the same message; a GM is told "over the limit". Only the user who made the change checks it.
 * Returns false to cancel the update. It never throws: anything unexpected lets the update through.
 */
export function guardPrepareUpdate(item, changes, options = {}, userId = null) {
  try {
    if (options?.[CHECKED]) return true;
    const me = globalThis.game?.user;
    if (userId && me?.id && userId !== me.id) return true;
    if (item?.type !== 'spell' || !item.actor) return true;
    const next = changes?.system?.prepared ?? changes?.['system.prepared'];
    if (next === undefined || num(next) !== 1) return true;
    const c = prepareCheck(item.actor, item);
    if (c.blocked) { globalThis.ui?.notifications?.warn?.(limitMessage(c.class)); return false; }
    if (c.gmOver) notifyGmOver(c.class);
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} | preparation limit check skipped`, err);
    return true;
  }
}
