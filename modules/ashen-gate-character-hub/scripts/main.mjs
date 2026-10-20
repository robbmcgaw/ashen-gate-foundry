/**
 * Ashen Gate | Character Hub: registers an alternative dnd5e character sheet (not the default)
 * and a small public API. The Actor stays the only store of character data.
 */
import {MODULE_ID, VERSION, SHEET_LABEL} from './constants.mjs';
import {createHubSheetClass} from './sheet.mjs';
import {openNativeSheet, nativeSheetClass} from './native.mjs';

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
    nativeSheetAvailable: () => !!nativeSheetClass()
  };
}

if (globalThis.Hooks) {
  Hooks.once('init', () => {
    registerHubSheet();
    const mod = game.modules.get(MODULE_ID);
    if (mod) mod.api = createApi();
  });
  // Foundry re-renders the sheet for its own Actor changes too; these cover embedded Items/Effects and bursts.
  for (const hook of ['updateActor', 'createItem', 'updateItem', 'deleteItem', 'createActiveEffect', 'updateActiveEffect', 'deleteActiveEffect']) {
    Hooks.on(hook, doc => scheduleRender(actorOf(doc)));
  }
  // Profession Ledger announces progression changes (its public hook); refresh any open Hub for that Actor.
  Hooks.on('ashenGateLedger.progressionChanged', data => { const actor = game.actors?.get?.(data?.actorId); if (actor) scheduleRender(actor); });
}
