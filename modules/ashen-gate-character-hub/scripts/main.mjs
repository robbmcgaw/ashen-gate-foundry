/**
 * Ashen Gate | Character Hub: registers an alternative dnd5e character sheet (not the default)
 * and a small public API. The Actor stays the only store of character data.
 */
import {MODULE_ID, VERSION, SHEET_LABEL} from './constants.mjs';
import {createHubSheetClass} from './sheet.mjs';
import {openNativeSheet, nativeSheetClass} from './native.mjs';
import {registerCompanionSettings, petCapFor, companionsData, registerPetSlotSource, unregisterPetSlotSource} from './companions.mjs';
import {registerCollapseSetting} from './collapse.mjs';
import {registerListSortSetting} from './organize.mjs';
import {registerVisibilitySetting, PARTS, PRESETS, readVisibility, setVisibility, applyPreset, hiddenReason, canSee} from './visibility.mjs';

let HubSheet = null;

/** Registers the sheet for 'character' Actors only. makeDefault:false: players and the GM pick it per Actor. */
export function registerHubSheet(env = globalThis) {
  const Base = env.foundry?.applications?.sheets?.ActorSheetV2;
  const Config = env.foundry?.applications?.apps?.DocumentSheetConfig;
  if (!Base || !Config?.registerSheet) { console.error(`${MODULE_ID} | ActorSheetV2 / DocumentSheetConfig not found; the Character Hub is not registered.`); return null; }
  HubSheet = createHubSheetClass(Base);
  Config.registerSheet(env.Actor, MODULE_ID, HubSheet, {types: ['character'], makeDefault: false, label: SHEET_LABEL});
  // TODO (after the alpha): a GM-only "Set as default for characters" option.
  return HubSheet;
}

/** Open Hub sheets showing this Actor. */
export function openHubs(actor) {
  const out = [];
  for (const app of globalThis.foundry?.applications?.instances?.values?.() ?? []) if (HubSheet && app instanceof HubSheet && app.document === actor && app.rendered) out.push(app);
  return out;
}

/** One render per burst of changes (an item use can update the Actor and several Items at once). */
const pending = new Map();
export function scheduleRender(actor, delay = 50) {
  if (!actor) return;
  clearTimeout(pending.get(actor));
  pending.set(actor, setTimeout(() => { pending.delete(actor); for (const app of openHubs(actor)) app.render(); }, delay));
}
/** Re-draws every open Hub (a world setting that changes what is shown). One render per burst. */
let allPending = null;
export function renderAllHubs(delay = 50) {
  clearTimeout(allPending);
  allPending = setTimeout(() => { allPending = null; for (const app of globalThis.foundry?.applications?.instances?.values?.() ?? []) if (HubSheet && app instanceof HubSheet && app.rendered) app.render(); }, delay);
}
/** Modules whose world settings (Player Access, the stash switch) change what players see in the Hub. */
const PARTNER_IDS = new Set(PARTS.map(p => p.partner).filter(Boolean));
/** True for a changed Setting document of a partner module. Only the key is looked at, never the value: the Hub re-reads their public APIs. */
export const isPartnerSetting = setting => { const key = String(setting?.key ?? ''); return PARTNER_IDS.has(key.split('.')[0]); };

/** The Actor a changed document belongs to (an effect may sit on an Item on the Actor). */
export const actorOf = doc => { for (let d = doc, i = 0; d && i < 3; d = d.parent, i++) if (d.documentName === 'Actor') return d; return null; };

export function createApi() {
  return {
    version: VERSION,
    /** The registered sheet class, or null before init. */
    get sheetClass() { return HubSheet; },
    /** Opens the Hub for an Actor the user can see, whatever its default sheet is. */
    async open(actor) {
      if (!HubSheet || actor?.type !== 'character') return {ok: false, error: 'The Character Hub only opens for dnd5e characters.'};
      if (!globalThis.game?.user?.isGM && !actor.testUserPermission?.(globalThis.game.user, 'LIMITED')) return {ok: false, error: `You can't view ${actor.name}.`};
      const app = openHubs(actor)[0] ?? new HubSheet({document: actor});
      await app.render({force: true});
      return {ok: true, result: app};
    },
    openNativeSheet,
    nativeSheetAvailable: () => !!nativeSheetClass(),
    /** Companions (read only here): {mount, pets, cap}. Writes go through the Hub's Companions tab. */
    companions: actor => { const d = companionsData(actor); return {mount: d.mount ? {itemId: d.mount.itemId, name: d.mount.item.name, perkItemIds: d.mount.perkItemIds} : null,
      pets: d.pets.map(p => ({itemId: p.itemId, name: p.item.name, perkItemIds: p.perkItemIds})), petCap: d.cap === Infinity ? null : d.cap}; },
    petCapFor,
    /**
     * Which Hub parts players see. parts() lists {key, label, partner}; get() is the stored {key: boolean}; isShown(key)
     * is true when players see it (the GM's switch and the partner module's Player Access); hiddenReason(key) says why not.
     * set(patch) and applyPreset(id) are GM-only and resolve to {ok, result | error}.
     */
    playerVisibility: Object.freeze({
      parts: () => PARTS.map(({key, label, partner}) => ({key, label, partner: partner ?? null})),
      presets: () => PRESETS.map(({id, label}) => ({id, label})),
      get: () => readVisibility(),
      isShown: key => hiddenReason(key) === null,
      canSee: key => canSee(key),
      hiddenReason: key => hiddenReason(key),
      set: patch => setVisibility(patch),
      applyPreset: id => applyPreset(id)
    }),
    /** Reserved for a later companion skill tree: fn(actor) → extra pet slots added to the GM's limit. Unused today. */
    registerPetSlotSource,
    unregisterPetSlotSource
  };
}

if (globalThis.Hooks) {
  Hooks.once('init', () => {
    registerHubSheet();
    // Per user (client scope): how see-through the Hub window background is. Changed with the slider in the Hub header.
    game.settings.register(MODULE_ID, 'windowOpacity', {scope: 'client', config: false, type: Number, default: 100,
      onChange: () => { for (const app of globalThis.foundry?.applications?.instances?.values?.() ?? []) if (HubSheet && app instanceof HubSheet && app.rendered) app.applyOpacity(); }});
    // Per user (client scope): which Hub sections and inventory containers are collapsed.
    registerCollapseSetting(game.settings);
    // Per user (client scope): Magic and Features group/sort choices.
    registerListSortSetting(game.settings);
    registerCompanionSettings(game.settings, () => renderAllHubs());
    registerVisibilitySetting(game.settings, () => renderAllHubs());
    const mod = game.modules.get(MODULE_ID);
    if (mod) mod.api = createApi();
  });
  // Foundry re-renders the sheet for its own Actor changes too; these cover embedded Items/Effects and bursts.
  for (const hook of ['updateActor', 'createItem', 'updateItem', 'deleteItem', 'createActiveEffect', 'updateActiveEffect', 'deleteActiveEffect']) {
    Hooks.on(hook, doc => scheduleRender(actorOf(doc)));
  }
  // A partner's Player Access (or the Utilities stash switch) changed: re-draw so its part appears or vanishes for players.
  for (const hook of ['createSetting', 'updateSetting', 'deleteSetting']) Hooks.on(hook, setting => { if (isPartnerSetting(setting)) renderAllHubs(); });
  // Profession Ledger announces progression changes (its public hook); refresh any open Hub for that Actor.
  Hooks.on('ashenGateLedger.progressionChanged', data => { const actor = game.actors?.get?.(data?.actorId); if (actor) scheduleRender(actor); });
}
