/** Strain chip (0.8.0): a display-only status effect on each Actor with Strain above 0, one per Strain band, so tokens
 * (and Utilities' Conditions view) show the level at a glance. Strain stays the Actor value in flags['ashen-gate-strain'];
 * the chip is rebuilt from it and is never read back as the truth.
 *   - Status ids: `ag-strain-<band index>` (band order of the Strain config), registered in CONFIG.statusEffects with
 *     hud: false so the Token HUD never offers them. Icons come from STRAIN_CHIP_ICONS (placeholders, swap for art).
 *   - The active GM's client keeps exactly one chip per Actor: created, renamed or moved to the new band when Strain
 *     changes, removed at 0, when the setting is off, or when Character Hub hides the Strain bar from players.
 *   - Only that sync may create, change or delete a chip; any other attempt (Token HUD, sheet, Utilities' Remove) is
 *     refused on the client that makes it. Other effects are never touched. */
export const CHIP_PREFIX = 'ag-strain-';
export const CHIP_SETTING = 'strainChip';
/** Write option the sync passes so the guard lets its own writes through. */
export const CHIP_OPTION = 'agStrainChip';
const HUB_ID = 'ashen-gate-character-hub';

/** Placeholder icons by band index (0 = the lowest band). Bands past the end use the last icon.
 * Swap these for the campaign art (e.g. 'modules/ashen-gate-cinders/art/strain-3.webp') when it exists. */
export const STRAIN_CHIP_ICONS = Object.freeze([
  'icons/svg/aura.svg',
  'icons/svg/degen.svg',
  'icons/svg/daze.svg',
  'icons/svg/hazard.svg',
  'icons/svg/fire.svg',
  'icons/svg/lightning.svg',
  'icons/svg/skull.svg'
]);

export const chipIcon = index => STRAIN_CHIP_ICONS[Math.min(Math.max(0, index), STRAIN_CHIP_ICONS.length - 1)];
export const isChipStatus = id => typeof id === 'string' && id.startsWith(CHIP_PREFIX);
const statusList = s => s instanceof Set ? [...s] : Array.isArray(s) ? s : [];
/** True for an effect (document or plain data) that carries a Strain chip status. */
export const isChipEffect = effect => statusList(effect?.statuses).some(isChipStatus);

/** One status per band of the Strain config, for CONFIG.statusEffects. */
export function chipStatuses(config) {
  return config.bands.map((b, i) => ({id: `${CHIP_PREFIX}${i}`, name: `Strain: ${b.label}`, img: chipIcon(i), hud: false}));
}

/** The chip an Actor should carry at this Strain, or null (0 = no chip). Name: "Strain 6/10 (Band 3)", 10 = guarantee_at. */
export function chipFor(config, value) {
  if (!Number.isSafeInteger(value) || value < 1) return null;
  let index = config.bands.findIndex(b => value >= b.from && (b.to === null || value <= b.to));
  if (index < 0) index = config.bands.length - 1;
  return {statusId: `${CHIP_PREFIX}${index}`, name: `Strain ${value}/${config.guarantee_at} (${config.bands[index].label})`, img: chipIcon(index)};
}

/** What to write so `effects` end up with exactly `want` (or no chip): {create, update, remove}. Non-chip effects are ignored. */
export function planChip(effects, want) {
  const chips = [...(effects ?? [])].filter(isChipEffect);
  const id = e => e.id ?? e._id;
  if (!want) return {create: [], update: [], remove: chips.map(id)};
  const keep = chips.find(e => statusList(e.statuses).includes(want.statusId)) ?? chips[0];
  const remove = chips.filter(e => e !== keep).map(id);
  if (!keep) return {create: [{name: want.name, img: want.img, statuses: [want.statusId]}], update: [], remove};
  const st = statusList(keep.statuses);
  const same = keep.name === want.name && keep.img === want.img && !keep.disabled && st.length === 1 && st[0] === want.statusId;
  return {create: [], update: same ? [] : [{_id: id(keep), name: want.name, img: want.img, statuses: [want.statusId], disabled: false}], remove};
}

/** Foundry side. `strain` is createStrain()'s result; `blocked()` a reason the module is off, else null. */
export function createStrainChip({module, strain, blocked = () => null}) {
  const enabled = () => game.settings.get(module, CHIP_SETTING) !== false;
  /** Character Hub's "Strain bar" player toggle, read through its public api.playerVisibility; Hub missing = shown. */
  const hubHidesStrain = () => {
    const hub = game.modules?.get?.(HUB_ID);
    const vis = hub?.active ? hub.api?.playerVisibility : null;
    if (typeof vis?.isShown !== 'function') return false;
    try { return vis.isShown('strain') === false; } catch { return false; }
  };
  const isSyncClient = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
  /** Why chips are off right now, or null. */
  const offReason = () => !enabled() ? 'setting' : hubHidesStrain() ? 'hidden' : null;
  const wanted = actor => offReason() ? null : chipFor(strain.config(), strain.readState(actor).value);

  function registerStatuses() {
    const list = globalThis.CONFIG?.statusEffects;
    if (!Array.isArray(list)) return;
    for (let i = list.length - 1; i >= 0; i--) if (isChipStatus(list[i]?.id)) list.splice(i, 1);
    if (!blocked()) list.push(...chipStatuses(strain.config()));
  }

  // One sync at a time per Actor; each run reads the Actor as it is then, so extra runs write nothing.
  const locks = new Map();
  const withLock = (id, fn) => {
    const run = (locks.get(id) ?? Promise.resolve()).then(fn), tail = run.catch(() => {});
    locks.set(id, tail); tail.then(() => { if (locks.get(id) === tail) locks.delete(id); });
    return run;
  };
  /** Active GM client: bring one Actor's chip in line with its Strain. Resolves the plan that was written (or null). */
  function sync(actor) {
    if (!actor || !isSyncClient() || blocked()) return Promise.resolve(null);
    return withLock(actor.id, async () => {
      const plan = planChip(actor.effects, wanted(actor)), opts = {[CHIP_OPTION]: true};
      if (plan.remove.length) await actor.deleteEmbeddedDocuments('ActiveEffect', plan.remove, opts);
      if (plan.update.length) await actor.updateEmbeddedDocuments('ActiveEffect', plan.update, opts);
      if (plan.create.length) await actor.createEmbeddedDocuments('ActiveEffect', plan.create, opts);
      return plan;
    }).catch(error => { console.error(`[${module}] Strain chip for ${actor.name} failed`, error); return null; });
  }
  const syncAll = () => isSyncClient() && !blocked() ? Promise.all((game.actors?.contents ?? []).map(sync)) : Promise.resolve([]);

  /** Every client: refuse chip writes that do not come from the sync (Strain is changed only through api.strain). */
  // One notice per few seconds: a bulk write (e.g. Character Hub's restore) can try several chips at once.
  let warnedAt = -Infinity;
  const refuse = () => {
    if (Date.now() - warnedAt > 3000) { warnedAt = Date.now(); ui.notifications?.warn?.('The Strain chip follows the character\'s Strain. Change Strain in Ashen Gate | Cinders (or the Character Hub Strain bar); the chip updates itself.'); }
    return false;
  };
  const guard = (doc, data, options) => {
    if (blocked() || options?.[CHIP_OPTION] === true) return undefined;
    if (isChipEffect(doc) || isChipEffect(data)) return refuse();
    return undefined;
  };

  return {
    sync, syncAll, registerStatuses, offReason,
    register(onChange = () => {}) {
      game.settings.register(module, CHIP_SETTING, {name: 'Show Strain chip on tokens', scope: 'world', config: true, type: Boolean, default: true,
        hint: 'A status icon for the character\'s Strain band on its token, seen by everyone who sees the token (also listed in Utilities\' Conditions). Display only: Strain is unchanged. Not shown while Character Hub hides the Strain bar from players.',
        onChange: () => { syncAll(); onChange(); }});
    },
    hooks: {
      preCreateActiveEffect: (doc, data, options) => guard(doc, data, options),
      preUpdateActiveEffect: (doc, changes, options) => guard(doc, changes, options),
      preDeleteActiveEffect: (doc, options) => guard(doc, null, options),
      /** Strain or any flag replaced (e.g. a level-backup restore): re-check that Actor. */
      updateActor: (actor, changes) => { if (changes?.flags) sync(actor); },
      /** A new Actor copied from one with a chip (e.g. a level backup, whose Strain is taken off) loses it. */
      createActor: actor => sync(actor),
      /** Character Hub's player visibility changed: chips follow its Strain bar toggle. */
      updateSetting: setting => { if (setting?.key === `${HUB_ID}.playerVisibility`) syncAll(); }
    }
  };
}
