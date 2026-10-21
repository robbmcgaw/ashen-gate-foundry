/**
 * Level up (0.27.0): a Hub button that starts dnd5e's own level-up flow. It adds no rules; the steps are what the
 * dnd5e 6.0.6 character sheet does:
 *   - Advance a class it has (base-actor-sheet.mjs #changeLevel): unless the world setting dnd5e.disableAdvancements
 *     is on, AdvancementManager.forLevelChange(actor, classId, 1), shown when it has steps; otherwise the class item's
 *     system.levels goes up by 1.
 *   - Add a class (character-sheet.mjs #findItem, then _onDropSingleItem): dnd5e's CompendiumBrowser.selectOne with
 *     its class filter (classes the character already has are left out), then AdvancementManager.forNewItem when the
 *     class has advancements, else the class item is created. dnd5e 6.0.6 checks no multiclass prerequisites.
 * If this dnd5e lacks those, the native sheet opens instead (same controls).
 *
 * Who may: the GM always; the owner when the world's dnd5e "levelingMode" is "noxp" (milestone: the GM says when),
 * otherwise once the XP reached dnd5e's next-level amount (system.details.xp.max). Never at CONFIG.DND5E.maxLevel.
 * Before the change a snapshot is taken; after it succeeds a backup copy is kept (level-backup.mjs). Cancelling
 * dnd5e's window leaves no copy. Nothing is recorded here: the Journey's level recorder notices the new level.
 */
import {canEdit} from './actions.mjs';
import {openNativeSheet} from './native.mjs';
import {saveBackup} from './level-backup.mjs';

export const ADD_CLASS = '__add-class';
const refuse = error => ({ok: false, error});
const setting = (key, fallback) => { try { return globalThis.game?.settings?.get?.('dnd5e', key) ?? fallback; } catch { return fallback; } };
const dnd5eApps = () => globalThis.dnd5e?.applications ?? {};
/** dnd5e's level-up manager class, or null. */
export const advancementManager = () => dnd5eApps().advancement?.AdvancementManager ?? null;
const classesOf = actor => Object.values(actor?.classes ?? {}).filter(c => c?.id);

/** {ok, reason?, classes, level}: whether this user may start a level-up for this character now, and why not. */
export function levelUpState(actor, user = globalThis.game?.user) {
  const classes = classesOf(actor), level = Number(actor?.system?.details?.level) || 0;
  if (actor?.type !== 'character') return {ok: false, reason: 'Only characters level up here.', classes, level};
  if (!canEdit(actor, user)) return {ok: false, reason: `Only ${actor.name}'s owner or the GM can level up.`, classes, level};
  const max = Number(globalThis.CONFIG?.DND5E?.maxLevel) || 20;
  if (level >= max) return {ok: false, reason: `Already at the highest level (${max}).`, classes, level};
  if (user?.isGM !== true && setting('levelingMode', 'xpBoons') !== 'noxp') {
    const xp = actor.system?.details?.xp ?? {}, have = Number(xp.value) || 0, need = Number(xp.max);
    if (Number.isFinite(need) && have < need) return {ok: false, reason: `Not enough XP yet: ${have} of ${need}.`, classes, level};
  }
  return {ok: true, classes, level};
}

/** Choices for the dialog: each class to advance, then "Add a class". */
export const levelChoices = classes => [...classes.map(c => ({value: c.id, label: `${c.name} (level ${Number(c.system?.levels) || 0} → ${(Number(c.system?.levels) || 0) + 1})`})),
  {value: ADD_CLASS, label: 'Add a class (multiclass)'}];

/** Shows dnd5e's advancement window; `then` runs once it completes (never when it is cancelled). */
async function showManager(manager, sheet, then) {
  const H = globalThis.Hooks;
  let doneId = null, closeId = null;
  const off = () => { H?.off?.('dnd5e.advancementManagerComplete', doneId); H?.off?.('closeAdvancementManager', closeId); };
  doneId = H?.on?.('dnd5e.advancementManagerComplete', m => { if (m !== manager) return; off(); void then(); });
  closeId = H?.on?.('closeAdvancementManager', m => { if (m === manager) off(); });
  if (typeof sheet?._renderChild === 'function') await sheet._renderChild(manager);
  else await manager.render({force: true});
}

/** Advance class `cls` by one level, as the native class level selector does. */
async function advanceClass(actor, cls, sheet, after) {
  const Manager = advancementManager();
  if (!setting('disableAdvancements', false)) {
    const manager = Manager.forLevelChange(actor, cls.id, 1);
    if (manager?.steps?.length) { await showManager(manager, sheet, after); return 'advancement'; }
  }
  await cls.update({'system.levels': (Number(cls.system?.levels) || 0) + 1});
  await after();
  return 'levels';
}

/** Add a class through dnd5e's compendium browser and its new-item advancement, as the native "Add class" does. */
async function addClass(actor, sheet, after) {
  const {CompendiumBrowser} = dnd5eApps(), Manager = advancementManager(), g = globalThis.game;
  const existing = new Set(Object.keys(actor.classes ?? {}));
  const filters = {locked: {types: new Set(['class']), arbitrary: [{o: 'NOT', v: {k: 'system.identifier', o: 'in', v: existing}}]},
    initial: {additional: {properties: {sidekick: -1}}}};
  const uuid = await CompendiumBrowser.selectOne({filters});
  if (!uuid) return null;
  const doc = await globalThis.fromUuid(uuid);
  if (doc?.type !== 'class') return null;
  const itemData = g.items.fromCompendium(doc, {keepId: true});
  if (Object.keys(itemData.system?.advancement ?? {}).length && !setting('disableAdvancements', false)) {
    const manager = Manager.forNewItem(actor, itemData);
    if (manager?.steps?.length) { await showManager(manager, sheet, after); return 'advancement'; }
  }
  globalThis.CONFIG?.Item?.dataModels?.class?.onDropCreate?.(null, actor, itemData);
  await actor.createEmbeddedDocuments('Item', [itemData]);
  await after();
  return 'created';
}

/**
 * Starts the level-up. `choose(options)` resolves a class id, ADD_CLASS, or null (cancel); it is asked whenever the
 * character has a class (so "Add a class" is always offered). `sheet` is the Hub; when it can render a child window
 * (dnd5e sheets can) dnd5e's window opens that way. `onBackup(result)` hears how the backup went.
 */
export async function startLevelUp(actor, {choose = null, sheet = null, onBackup = null} = {}) {
  const state = levelUpState(actor);
  if (!state.ok) return refuse(state.reason);
  const snapshot = actor.toObject?.() ?? structuredClone({...actor, _id: actor.id});
  const pick = state.classes.length ? await choose?.(levelChoices(state.classes)) : ADD_CLASS;
  if (!pick) return {ok: true, result: null};
  const cls = pick === ADD_CLASS ? null : state.classes.find(c => c.id === pick);
  if (pick !== ADD_CLASS && !cls) return refuse('That class is gone.');
  const Manager = advancementManager();
  if (typeof Manager?.[cls ? 'forLevelChange' : 'forNewItem'] !== 'function' || (!cls && typeof dnd5eApps().CompendiumBrowser?.selectOne !== 'function')) {
    const r = await openNativeSheet(actor);
    return r.ok ? {ok: true, result: 'native', notice: cls ? 'Level up from the class level selector on the native sheet.' : 'Add the class on the native sheet (Add class).'} : r;
  }
  const after = async () => {
    let b;
    try { b = await saveBackup(actor, snapshot, state.level); } catch (err) { console.error('ashen-gate-character-hub | level backup', err); b = refuse(err?.message ?? String(err)); }
    onBackup?.(b); return b;
  };
  try {
    return {ok: true, result: cls ? await advanceClass(actor, cls, sheet, after) : await addClass(actor, sheet, after)};
  } catch (err) {
    console.error('ashen-gate-character-hub | level up', err);
    return refuse(`Could not start the level-up: ${err?.message ?? err}`);
  }
}
