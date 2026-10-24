/**
 * Ashen Gate | Character Hub: registers an alternative dnd5e character sheet (not the default)
 * and a small public API. The Actor stays the only store of character data.
 */
import {MODULE_ID, VERSION, SHEET_LABEL, COMPACT_SETTING} from './constants.mjs';
import {createHubSheetClass} from './sheet.mjs';
import {COMPACT_OPACITY_SETTING} from './compact-opacity.mjs';
import {registerQuickKeys, pressQuickSlot, targetHub} from './quick-keys.mjs';
import {hotbarLink, registerLinkSetting, linkOn} from './hotbar-link.mjs';
import {linkHub} from './sheet.mjs';
import {openNativeSheet, nativeSheetClass} from './native.mjs';
import {registerCompanionSettings, petCapFor, companionsData, registerPetSlotSource, unregisterPetSlotSource} from './companions.mjs';
import {registerCollapseSetting} from './collapse.mjs';
import {registerListSortSetting} from './organize.mjs';
import {registerLookSettings} from './look.mjs';
import * as journey from './journey.mjs';
import {registerMarksSocket, registerMarkHooks} from './marks.mjs';
import {flushQueue, QUEUE_FLAG} from './level-backup.mjs';
import {backupsFor, restoreBackup} from './level-restore.mjs';
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
/** Every Hub window open now, any character (quick bar keys pick from these). */
export const allHubs = () => HubSheet ? [...(globalThis.foundry?.applications?.instances?.values?.() ?? [])].filter(app => app instanceof HubSheet) : [];
export function renderAllHubs(delay = 50) {
  clearTimeout(allPending);
  allPending = setTimeout(() => { allPending = null; for (const app of globalThis.foundry?.applications?.instances?.values?.() ?? []) if (HubSheet && app instanceof HubSheet && app.rendered) app.render(); }, delay);
}
/** Modules whose world settings (Player Access, the stash switch, Manager's Codex access) change what players see in the Hub. */
const PARTNER_IDS = new Set([...PARTS.map(p => p.partner).filter(Boolean), 'ashen-gate-manager']);  // Manager: Codex player access, appearance (0.31.0)
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
    unregisterPetSlotSource,
    /**
     * Journey (0.20.0, alpha). entries(actor) is what this user may see (players: their own characters' visible
     * entries). recordReward(actor, {questId, questName, coins, text, items, grantId}) is GM-only and idempotent per
     * quest, or per quest + grantId (0.25.0: items [{name, img, quantity, itemId}] and grantId are optional).
     * addNote(actor, {text, date, hidden}) is GM-only.
     */
    /**
     * Level backups (0.28.0). list(actor) is the character's backup copies, newest first ([] for players: copies are
     * GM-only). restore(backup, {opId}) is GM-only: it puts the copy back onto its character after saving the character
     * as it is now as another copy; all or nothing; the same opId again does nothing. Resolves {ok, result | error}.
     */
    levelBackups: Object.freeze({
      list: actor => backupsFor(actor).map(a => { const {archivedFlags: _a, ...f} = a.flags[MODULE_ID].levelBackup; return {id: a.id, name: a.name, ...structuredClone(f)}; }),
      restore: (backup, options) => restoreBackup(backup, options)
    }),
    journey: Object.freeze({
      entries: actor => journey.journeyFor(actor),
      recordReward: (actor, reward) => journey.recordReward(actor, reward),
      addNote: (actor, note) => journey.addManual(actor, note)
    })
  };
}

if (globalThis.Hooks) {
  Hooks.once('init', () => {
    registerHubSheet();
    // Per user (client scope): Compact or Full (0.29.0). Changed with the Compact/Full button; read when a Hub opens.
    // (The 0.10.0-0.28.x windowOpacity setting is no longer registered: a saved value is ignored.)
    game.settings.register(MODULE_ID, COMPACT_SETTING, {scope: 'client', config: false, type: Boolean, default: false});
    // Per user: Compact-only background opacity (experimental, compact-opacity.mjs). 100 = opaque.
    game.settings.register(MODULE_ID, COMPACT_OPACITY_SETTING, {scope: 'client', config: false, type: Number, default: 100});
    // Per user (client scope): which Hub sections and inventory containers are collapsed.
    registerCollapseSetting(game.settings);
    // Per user (client scope): Magic and Features group/sort choices.
    registerListSortSetting(game.settings);
    // 0.31.0: the built-in look (per user) and its world default, used while General Manager's appearance is absent.
    registerLookSettings(game.settings, () => renderAllHubs());
    journey.registerJourneySettings(game.settings);
    registerCompanionSettings(game.settings, () => renderAllHubs());
    registerVisibilitySetting(game.settings, () => renderAllHubs());
    // 0.42.0: per user, the quick bar linked to Foundry's hotbar page 1 (hotbar-link.mjs). Off: the link is forgotten;
    // on: the Hub in front links now.
    registerLinkSetting(game.settings, on => { if (on === false) hotbarLink.unlink(); else { const hub = targetHub(allHubs(), globalThis.ui?.activeWindow ?? null); if (hub) void linkHub(hub); } renderAllHubs(); });
    // Quick bar keys (0.29.4, quick-keys.mjs): 1-9 and 0 use the open Hub's quick bar; without a Hub they stay Foundry's.
    if (game.keybindings?.register) registerQuickKeys(game.keybindings, (i, event) => pressQuickSlot(i, event, allHubs(), globalThis.ui?.activeWindow ?? null),
      globalThis.CONST?.KEYBINDING_PRECEDENCE?.PRIORITY);
    const mod = game.modules.get(MODULE_ID);
    if (mod) mod.api = createApi();
  });
  // Journey (0.20.0): record level-ups, Renown tier changes and completed quests from now on (journey.mjs).
  const later = (fn, ms = 400) => { let t = null; return (...a) => { clearTimeout(t); t = setTimeout(() => { void Promise.resolve(fn(...a)).catch(err => console.warn(`${MODULE_ID} | journey`, err)); }, ms); }; };
  const levelLater = new Map(), recordLevelSoon = actor => { if (actor?.type !== 'character') return; if (!levelLater.has(actor.id)) levelLater.set(actor.id, later(a => journey.recordLevel(a))); levelLater.get(actor.id)(actor); };
  const renownSoon = later(() => journey.recordRenown(), 800), questsSoon = later(() => journey.recordQuests(), 800);
  Hooks.once('ready', () => {
    for (const a of game.actors ?? []) if (a.type === 'character') recordLevelSoon(a);
    renownSoon(); questsSoon();
  });
  Hooks.on('updateActor', actor => recordLevelSoon(actor));
  for (const hook of ['createItem', 'updateItem', 'deleteItem']) Hooks.on(hook, item => { if (item?.type === 'class') recordLevelSoon(actorOf(item)); });
  // Renown keeps players' views and Quest Log its state in journals: any journal change re-checks (through their public APIs only).
  for (const hook of ['createJournalEntry', 'updateJournalEntry']) Hooks.on(hook, () => { renownSoon(); questsSoon(); });
  // Target marks for tokens the player doesn't own go through the GM client (marks.mjs).
  Hooks.once('ready', () => registerMarksSocket());
  // 0.45.1: an attack roll ends the Sap on the attacker and the Vex they placed on a creature they target (marks.mjs).
  registerMarkHooks();
  // Level backups (0.27.0) a player queued while no GM was on: the coordinating GM makes them (level-backup.mjs).
  const flushSoon = later(() => flushQueue(), 1000);
  Hooks.once('ready', () => flushSoon());
  Hooks.on('updateActor', (actor, changes) => { if (changes?.flags?.[MODULE_ID]?.[QUEUE_FLAG]?.length) flushSoon(); });
  // A mark placed or removed on someone else's token: redraw the Hub of the character who placed it.
  for (const hook of ['createActiveEffect', 'deleteActiveEffect']) Hooks.on(hook, effect => {
    const by = effect?.flags?.[MODULE_ID]?.mark?.by;
    if (by) { try { scheduleRender(globalThis.fromUuidSync?.(by)); } catch {} }
  });
  // 0.42.0 Foundry hotbar link: the linked character's quick bar changed (any client) → this user's Foundry page 1;
  // this user's hotbar changed (assignHotbarMacro may skip the updateUser hook, so the hotbar's redraw is watched too).
  Hooks.on('updateActor', (actor, changes) => { if (changes?.flags?.[MODULE_ID] && 'hotbar' in changes.flags[MODULE_ID]) void hotbarLink.hubChanged(actor); });
  Hooks.on('updateUser', (user, changes) => { if (user === game.user && changes && 'hotbar' in changes) void hotbarLink.foundryChanged(); });
  Hooks.on('renderHotbar', () => { if (linkOn()) void hotbarLink.foundryChanged(); });
  // The GM hid the quick bar from players: forget the link (the bars stay as they are).
  Hooks.on('updateSetting', setting => { if (String(setting?.key ?? '').startsWith(`${MODULE_ID}.`) && !globalThis.game?.user?.isGM && hotbarLink.linked && !canSee('hotbars')) hotbarLink.unlink(); });
  // Utilities' "Use electrum" changed: redraw so the coin boxes follow it.
  Hooks.on('ashen-gate-utilities.electrumChanged', () => renderAllHubs());
  // The marks bar shows how many tokens you target.
  Hooks.on('targetToken', user => { if (user === game.user) renderAllHubs(100); });
  // Foundry re-renders the sheet for its own Actor changes too; these cover embedded Items/Effects and bursts.
  for (const hook of ['updateActor', 'createItem', 'updateItem', 'deleteItem', 'createActiveEffect', 'updateActiveEffect', 'deleteActiveEffect']) {
    Hooks.on(hook, doc => scheduleRender(actorOf(doc)));
  }
  // A partner's Player Access (or the Utilities stash switch) changed: re-draw so its part appears or vanishes for players.
  for (const hook of ['createSetting', 'updateSetting', 'deleteSetting']) Hooks.on(hook, setting => { if (isPartnerSetting(setting)) renderAllHubs(); });
  // Profession Ledger announces progression changes (its public hook); refresh any open Hub for that Actor.
  Hooks.on('ashenGateLedger.progressionChanged', data => { const actor = game.actors?.get?.(data?.actorId); if (actor) scheduleRender(actor); });
  // Ashen Gate | Cinders announces Cinder changes (bind, transfer, progress); Strain changes arrive as updateActor.
  Hooks.on('ashenGateCinder.changed', data => { for (const id of [data?.actorId, data?.fromActorId]) { const actor = game.actors?.get?.(id); if (actor) scheduleRender(actor); } });
  // 0.31.0: the first bind of a Cinder is a Journey milestone (the binding GM client writes it; once per instance).
  Hooks.on('ashenGateCinder.changed', data => { if (data?.kind === 'bind') void Promise.resolve(journey.recordCinderBind(data)).catch(err => console.warn(`${MODULE_ID} | journey`, err)); });
  // 0.19.0: Cinder sockets changed (attach, detach, swap, lock, count): redraw that character's Hub.
  Hooks.on('ashenGateSockets.changed', data => { const actor = game.actors?.get?.(data?.actorId); if (actor) scheduleRender(actor); });
}
