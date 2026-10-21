/**
 * Level up (0.27.0): a Hub button that starts dnd5e's own level-up flow. It adds no rules: the steps are what the
 * dnd5e 6.0.6 character sheet does when a class's level selector goes up by one (base-actor-sheet.mjs #changeLevel):
 *   - unless the world setting dnd5e.disableAdvancements is on, build AdvancementManager.forLevelChange(actor,
 *     classId, 1); if it has steps, show it (dnd5e's advancement window applies the level);
 *   - otherwise update the class item's system.levels by +1.
 * If this dnd5e has no AdvancementManager.forLevelChange, the native sheet opens instead (its class level selector
 * does the same thing).
 *
 * When the button is ready: the user owns the character (or is the GM), it has a class, it is below dnd5e's
 * CONFIG.DND5E.maxLevel, and, unless the world's dnd5e "levelingMode" is "noxp" (milestone), its XP has reached
 * dnd5e's own next-level threshold (system.details.xp.max). Otherwise it says why on click and in its tooltip.
 * Nothing is recorded here: the Journey's level recorder (journey.mjs) notices the new level as before.
 */
import {canEdit} from './actions.mjs';
import {openNativeSheet} from './native.mjs';

const refuse = error => ({ok: false, error});
const setting = (key, fallback) => { try { return globalThis.game?.settings?.get?.('dnd5e', key) ?? fallback; } catch { return fallback; } };
/** dnd5e's level-up manager class, or null. */
export const advancementManager = () => globalThis.dnd5e?.applications?.advancement?.AdvancementManager ?? null;
const classesOf = actor => Object.values(actor?.classes ?? {}).filter(c => c?.id);

/** {ok, reason?, classes}: whether this user may start a level-up for this character now, and why not. */
export function levelUpState(actor, user = globalThis.game?.user) {
  const classes = classesOf(actor);
  if (actor?.type !== 'character') return {ok: false, reason: 'Only characters level up here.', classes};
  if (!canEdit(actor, user)) return {ok: false, reason: `Only ${actor.name}'s owner or the GM can level up.`, classes};
  if (!classes.length) return {ok: false, reason: 'No class yet: add one on the native sheet first.', classes};
  const level = Number(actor.system?.details?.level) || 0, max = Number(globalThis.CONFIG?.DND5E?.maxLevel) || 20;
  if (level >= max) return {ok: false, reason: `Already at the highest level (${max}).`, classes};
  if (setting('levelingMode', 'xpBoons') !== 'noxp') {
    const xp = actor.system?.details?.xp ?? {}, have = Number(xp.value) || 0, need = Number(xp.max);
    if (Number.isFinite(need) && have < need) return {ok: false, reason: `Not enough XP yet: ${have} of ${need}.`, classes};
  }
  return {ok: true, classes};
}

/**
 * Starts the level-up. `pickClass(options)` resolves a class id (or null to cancel) when there is more than one class.
 * `sheet` is the Hub; when it can render a child window (dnd5e sheets can) the advancement window opens that way.
 */
export async function startLevelUp(actor, {pickClass = null, sheet = null} = {}) {
  const state = levelUpState(actor);
  if (!state.ok) return refuse(state.reason);
  let cls = state.classes[0];
  if (state.classes.length > 1) {
    const id = await pickClass?.(state.classes.map(c => ({value: c.id, label: `${c.name} (level ${Number(c.system?.levels) || 0})`})));
    if (!id) return {ok: true, result: null};
    cls = state.classes.find(c => c.id === id);
    if (!cls) return refuse('That class is gone.');
  }
  const Manager = advancementManager();
  if (typeof Manager?.forLevelChange !== 'function') {
    const r = await openNativeSheet(actor);
    return r.ok ? {ok: true, result: 'native', notice: 'Level up from the class level selector on the native sheet.'} : r;
  }
  try {
    if (!setting('disableAdvancements', false)) {
      const manager = Manager.forLevelChange(actor, cls.id, 1);
      if (manager?.steps?.length) {
        if (typeof sheet?._renderChild === 'function') await sheet._renderChild(manager);
        else await manager.render({force: true});
        return {ok: true, result: 'advancement'};
      }
    }
    await cls.update({'system.levels': (Number(cls.system?.levels) || 0) + 1});
    return {ok: true, result: 'levels'};
  } catch (err) {
    console.error('ashen-gate-character-hub | level up', err);
    return refuse(`Could not start the level-up: ${err?.message ?? err}`);
  }
}
