/**
 * Every change goes straight to the Actor or Item through Foundry/dnd5e's own methods. Each
 * action checks permission itself (not only the hidden button) and resolves to {ok, error?}.
 * Rolls, item use and rests are delegated to dnd5e so its dialogs, consumption and chat apply.
 */
import {num} from './constants.mjs';

const refuse = error => ({ok: false, error});
const done = (result = null) => ({ok: true, result});

/** Owners (and the GM, who owns everything) may change or act for the character. */
export function canEdit(actor, user = globalThis.game?.user) {
  if (!actor) return false;
  if (user?.isGM) return true;
  if (typeof actor.testUserPermission === 'function' && user) return actor.testUserPermission(user, 'OWNER');
  return actor.isOwner === true;
}

async function guarded(actor, what, fn) {
  if (!canEdit(actor)) return refuse(`You don't own ${actor?.name ?? 'this character'}, so you can't ${what}.`);
  try { return done(await fn()); } catch (err) {
    console.error('ashen-gate-character-hub |', what, err);
    return refuse(`Could not ${what}: ${err?.message ?? err}`);
  }
}
/** Calls a system method if it exists; otherwise a clear refusal instead of a TypeError. */
function call(target, method, what, ...args) {
  if (typeof target?.[method] !== 'function') throw new Error(`this version of dnd5e has no ${method}() for ${what}`);
  return target[method](...args);
}

// ---------- Hit points ----------

/** Damage takes temp HP first, then current HP (never below 0). Healing stops at the effective max. */
export function hpAfter(hp, delta) {
  let value = num(hp.value), temp = num(hp.temp);
  const max = num(hp.effectiveMax, num(hp.max) + num(hp.tempmax));
  if (delta < 0) {
    const fromTemp = Math.min(temp, -delta);
    temp -= fromTemp;
    value = Math.max(0, value - (-delta - fromTemp));
  } else value = Math.min(max, value + delta);
  return {value, temp};
}
export const adjustHp = (actor, delta) => guarded(actor, 'change hit points', () => {
  const {value, temp} = hpAfter(actor.system.attributes.hp, num(delta));
  return actor.update({'system.attributes.hp.value': value, 'system.attributes.hp.temp': temp});
});
const HP_FIELDS = new Set(['value', 'temp', 'tempmax']);
export const setHp = (actor, field, raw) => {
  if (!HP_FIELDS.has(field)) return Promise.resolve(refuse(`Unknown hit point field ${field}.`));
  const v = Math.trunc(num(raw, NaN));
  if (!Number.isFinite(v)) return Promise.resolve(refuse('Enter a whole number.'));
  return guarded(actor, 'change hit points', () => actor.update({[`system.attributes.hp.${field}`]: field === 'tempmax' ? v : Math.max(0, v)}));
};

// ---------- Inspiration, exhaustion, conditions (the same calls the dnd5e sheet and token HUD use) ----------

export const toggleInspiration = actor => guarded(actor, 'change inspiration',
  () => actor.update({'system.attributes.inspiration': !actor.system.attributes.inspiration}));
export const changeExhaustion = (actor, step) => guarded(actor, 'change exhaustion',
  () => call(actor, 'toggleStatusEffect', 'exhaustion', 'exhaustion', {levels: step < 0 ? -1 : 1}));
export const toggleCondition = (actor, id) => guarded(actor, 'change conditions',
  () => call(actor, 'toggleStatusEffect', 'conditions', id));

// ---------- Rolls (dnd5e's own roll methods and dialogs; the click event carries its fast-forward keys) ----------

export const rollSkill = (actor, skill, event) => guarded(actor, 'roll',
  () => call(actor, 'rollSkill', 'skill checks', {skill, event}));
export const rollAbilityCheck = (actor, ability, event) => guarded(actor, 'roll',
  () => call(actor, 'rollAbilityCheck', 'ability checks', {ability, event}));
export const rollSavingThrow = (actor, ability, event) => guarded(actor, 'roll',
  () => call(actor, 'rollSavingThrow', 'saving throws', {ability, event}));
export const rollInitiative = (actor, event) => guarded(actor, 'roll initiative',
  () => call(actor, 'rollInitiativeDialog', 'initiative', {event}));
export const rollDeathSave = (actor, event) => guarded(actor, 'roll a death save',
  () => call(actor, 'rollDeathSave', 'death saves', {event}));
