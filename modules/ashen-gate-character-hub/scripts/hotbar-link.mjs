/**
 * Quick bar ↔ Foundry hotbar link (0.42.0). Slot N of the Hub quick bar and slot N of the user's Foundry hotbar page 1
 * (the page the number keys use) are kept the same, both ways, for the character whose Hub is in front.
 *   - Hub → Foundry: a character Item becomes dnd5e's own item macro (dnd5e.documents.macro.create5eMacro, the same
 *     call as dragging the item onto the hotbar; it reuses a macro you already made for that item). A world Macro is
 *     assigned as it is. An empty Hub slot clears the Foundry slot.
 *   - Foundry → Hub: a dnd5e item macro (`dnd5e.documents.macro.rollItem("<name>", { event })`, dnd5e links it by the
 *     item's name) whose item is on this character, or a world Macro, goes into the Hub slot; an empty Foundry slot
 *     clears it. Anything else (another character's item, an activity macro) stays in Foundry and the Hub slot is left
 *     unchanged.
 *   - Only slots 1-10 (page 1) are read or written. Each side is compared with what it held at the last sync, so only
 *     the slots that really changed are copied, and a copy that already matches writes nothing: the sync never
 *     re-triggers itself (last write wins).
 *   - The first link of a character whose two bars differ (0.50.0: no question) is merged silently, once per character
 *     and user: every Hub slot is kept, the Hub's EMPTY slots are filled from Foundry's page 1, and Foundry's page 1 then
 *     takes the Hub bar. "Merged" is remembered on the User (flags['ashen-gate-character-hub'].hotbarLink[actorId]); an
 *     answer stored there by 0.42.0-0.49.x counts the same (the Hub's bar goes onto page 1). After that, bringing the
 *     character's Hub to the front puts its quick bar on Foundry's page 1.
 *   - Always on (0.46.0): there is no option. A `linkFoundryHotbar` value stored by 0.42.0-0.45.x is no longer read or
 *     registered, so it is ignored and left where it is; hotbar slot data is never touched by that.
 */
import {MODULE_ID} from './constants.mjs';
import {canEdit} from './actions.mjs';
import {canSee} from './visibility.mjs';
import {hotbarSlots, writeHotbarSlots, HOTBAR_SLOTS} from './hotbar.mjs';

export const LINK_FLAG = 'hotbarLink';
/** Stored values: 'merged' (0.50.0); 'hub' | 'foundry' | 'both' were the answers to the removed question and now mean "already linked". */
export const LINK_CHOICES = ['merged', 'hub', 'foundry', 'both'];

/** The command dnd5e 6 writes for an item macro (documents/macro.mjs create5eMacro, type "Item"). */
export const UNSAFE_NAME = /["\\`\r\n\u2028\u2029]|\$\{/;
/** An item name that could break out of the string in the macro command (quote, backslash, backtick, `${`, newline). */
export const unsafeName = name => UNSAFE_NAME.test(String(name ?? ''));
/** Defensive escape for a name placed in macro code. Names that need it are never linked (see push), so safe names come out unchanged. */
const escapeName = name => String(name ?? '').replace(/[\\"`]/g, c => '\\' + c).replace(/\$\{/g, '\\${').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
export const itemMacroCommand = item => `dnd5e.documents.macro.rollItem("${escapeName(item?._source?.name ?? item?.name)}", { event })`;
const ITEM_MACRO = /^dnd5e\.documents\.macro\.rollItem\("(.*)", \{ event \}\)$/s;
/** The item name a dnd5e item macro rolls, or null (an activity macro or any other command). */
export function itemMacroName(macro) {
  const m = ITEM_MACRO.exec(String(macro?.command ?? '').trim());
  return m ? m[1] : null;
}
const sourceName = i => i?._source?.name ?? i?.name;

/**
 * What a Foundry hotbar macro is for this character: {kind: 'empty'} (no macro), {kind: 'entry', entry} (the Hub can
 * hold it) or {kind: 'foreign'} (leave both sides alone).
 */
export function macroToEntry(macro, actor, user = globalThis.game?.user) {
  if (!macro) return {kind: 'empty'};
  const name = itemMacroName(macro);
  if (name !== null) {
    if (unsafeName(name)) return {kind: 'foreign'};   // never trust a hostile-looking name, in either direction
    const item = [...(actor?.items ?? [])].find(i => sourceName(i) === name);   // dnd5e uses the first item of that name
    return item ? {kind: 'entry', entry: {type: 'Item', id: item.id}} : {kind: 'foreign'};
  }
  if (String(macro.command ?? '').includes('dnd5e.documents.macro.rollItem')) return {kind: 'foreign'};   // an activity macro
  const uuid = String(macro.uuid ?? '');
  if (macro.pack || !uuid.startsWith('Macro.')) return {kind: 'foreign'};
  if (!user?.isGM && macro.testUserPermission?.(user, 'LIMITED') !== true) return {kind: 'foreign'};
  return {kind: 'entry', entry: {type: 'Macro', uuid}};
}
const sameEntry = (a, b) => (!a && !b) || (!!a && !!b && a.type === b.type && (a.id ?? null) === (b.id ?? null) && (a.uuid ?? null) === (b.uuid ?? null));
/** True when the Foundry macro already stands for the Hub slot (both empty counts). */
export function matches(entry, macro, actor, user) {
  const m = macroToEntry(macro, actor, user);
  return entry ? m.kind === 'entry' && sameEntry(entry, m.entry) : m.kind === 'empty';
}

/** Page 1 of the user's Foundry hotbar: HOTBAR_SLOTS macro ids (or null), slot 1 first. */
export const pageIds = (user = globalThis.game?.user) => Array.from({length: HOTBAR_SLOTS}, (x, i) => user?.hotbar?.[i + 1] ?? user?.hotbar?.[String(i + 1)] ?? null);
const macroById = id => (id ? globalThis.game?.macros?.get?.(id) ?? null : null);
const keyOf = e => (e ? `${e.type}:${e.id ?? e.uuid}` : '');
const fromUuid = uuid => { try { return globalThis.fromUuidSync?.(uuid) ?? null; } catch { return null; } };

/** May this user create a script Macro (Foundry's MACRO_SCRIPT permission; a GM always may)? */
export const canCreateScriptMacro = (user = globalThis.game?.user) => user?.isGM === true || user?.can?.('MACRO_SCRIPT') === true;

/**
 * One link per client. `env` lets tests pass stand-ins: {user, macros, notify, create (dnd5e create5eMacro)}.
 * Every change runs one at a time (a queue), so two events never interleave their reads and writes.
 */
export function createHotbarLink(env = {}) {
  const user = () => env.user?.() ?? globalThis.game?.user;
  const notify = msg => (env.notify ?? (m => globalThis.ui?.notifications?.info?.(m)))(msg);
  const create = () => env.create ?? globalThis.dnd5e?.documents?.macro?.create5eMacro;
  const macros = () => env.macros?.() ?? [...(globalThis.game?.macros ?? [])];
  let linked = null, lastFoundry = null, lastHub = null, queue = Promise.resolve(), noticed = false;
  const run = fn => (queue = queue.then(fn).catch(err => { console.warn(`${MODULE_ID} | hotbar link`, err); return null; }));
  // 0.60.1: the sync is for players. A GM's macro hotbar is never read or written, whichever character is open, whichever path asks
  // (sheet open, hooks, tests): every entry point and every writer checks it.
  const isGM = () => user()?.isGM === true;
  const eligible = actor => !isGM() && !!actor && typeof user()?.assignHotbarMacro === 'function' && canEdit(actor) && canSee('hotbars');
  let warned = false;
  const skipped = reason => { if (warned) return; warned = true; notify(`A quick-bar item was not copied to Foundry's hotbar because ${reason} Rename the item to link it.`); };
  const quiet = () => { if (noticed) return; noticed = true; notify('The quick bar slot works, but Foundry\'s hotbar copy could not be made: you may not create script macros in this world. Ask the GM for the "Use Script Macros" permission.'); };

  /** Puts one Hub slot on Foundry's page 1. Never throws; a copy that can't be made leaves the Foundry slot as it is. */
  async function push(actor, i, entry) {
    if (isGM()) return null;
    const u = user(), slot = i + 1, current = macroById(pageIds(u)[i]);
    if (matches(entry, current, actor, u)) return;
    if (!entry) return u.assignHotbarMacro(null, slot);
    if (entry.type === 'Macro') { const m = fromUuid(entry.uuid); return m ? u.assignHotbarMacro(m, slot) : null; }
    const item = actor.items?.get?.(entry.id);
    if (!item) return null;
    const name = sourceName(item);
    if (unsafeName(name)) { skipped('its name has a quote, backslash, backtick, "${" or line break, which is not safe in a macro.'); return null; }
    if ([...(actor.items ?? [])].find(i => sourceName(i) === name) !== item) { skipped('another item on this character has the same name, and dnd5e macros find items by name.'); return null; }
    const command = itemMacroCommand(item);
    const mine = macros().find(m => m.name === item.name && m.command === command && m.isAuthor);   // dnd5e's own reuse rule
    if (mine) return u.assignHotbarMacro(mine, slot);
    const make = create();
    if (typeof make !== 'function' || !canCreateScriptMacro(u)) return quiet();
    try { await make({type: 'Item', uuid: item.uuid}, slot); } catch (err) { console.warn(`${MODULE_ID} | hotbar macro`, err); quiet(); }
  }
  const snapshot = actor => { lastFoundry = pageIds(user()); lastHub = hotbarSlots(actor).map(keyOf); };
  /** Hub slots from Foundry: `which(i, m, hubEntry)` says whether slot i takes Foundry's macro m. */
  async function pull(actor, which) {
    if (isGM()) return 0;
    const u = user(), hub = hotbarSlots(actor), ids = pageIds(u), patch = {};
    ids.forEach((id, i) => {
      const m = macroToEntry(macroById(id), actor, u);
      if (m.kind === 'foreign' || !which(i, m, hub[i])) return;
      const next = m.kind === 'entry' ? m.entry : null;
      if (!sameEntry(next, hub[i])) patch[i] = next;
    });
    const n = Object.keys(patch).length;
    if (n) await writeHotbarSlots(actor, patch);
    return n;
  }
  /** The silent first-link merge: keep every Hub slot, fill the Hub's empty slots from Foundry, then Foundry takes the Hub bar. Returns how many Hub slots were filled. */
  async function merge(actor) {
    if (isGM()) return 0;
    const filled = await pull(actor, (i, m, h) => !h && m.kind === 'entry');
    const hub = hotbarSlots(actor);
    for (let i = 0; i < HOTBAR_SLOTS; i++) await push(actor, i, hub[i]);
    return filled;
  }

  return {
    get linked() { return linked; },
    /** Do the two bars differ, and does Foundry's page 1 hold anything (only then is there something to lose)? */
    compare(actor) {
      const u = user(), hub = hotbarSlots(actor), ids = pageIds(u);
      return {differ: ids.some((id, i) => !matches(hub[i], macroById(id), actor, u)), foundryEmpty: ids.every(id => !id)};
    },
    /**
     * The Hub of `actor` came to the front (opened or focused). Links it unless it already is. The first time a
     * character's bars differ (and Foundry's page 1 holds something) they are merged without asking (see the header).
     */
    activate(actor) {
      if (isGM() || !eligible(actor) || linked === actor) return Promise.resolve(null);
      return run(async () => {
        if (linked === actor) return null;
        const u = user(), flags = u?.flags?.[MODULE_ID]?.[LINK_FLAG], remembered = flags?.[actor.id];
        let filled = 0, merged = false;
        const {differ, foundryEmpty} = this.compare(actor);
        if (!LINK_CHOICES.includes(remembered) && differ && !foundryEmpty) {
          filled = await merge(actor); merged = true;
          try { await u.setFlag?.(MODULE_ID, LINK_FLAG, {...(flags ?? {}), [actor.id]: 'merged'}); } catch (err) { console.warn(`${MODULE_ID} | hotbar link flag`, err); }
        } else {
          const hub = hotbarSlots(actor);
          for (let i = 0; i < HOTBAR_SLOTS; i++) await push(actor, i, hub[i]);
        }
        linked = actor; snapshot(actor);
        if (filled) notify(`${actor.name}'s quick bar now also holds ${filled === 1 ? 'a macro' : `${filled} macros`} from your Foundry hotbar.`);
        return merged ? 'merged' : 'hub';
      });
    },
    /** The linked character's quick bar changed (any client): copy the slots that changed to Foundry. */
    hubChanged(actor) {
      if (isGM() || actor !== linked) return Promise.resolve(null);
      return run(async () => {
        if (actor !== linked || !eligible(actor)) return null;
        const hub = hotbarSlots(actor);
        for (let i = 0; i < HOTBAR_SLOTS; i++) if (keyOf(hub[i]) !== lastHub?.[i]) await push(actor, i, hub[i]);
        snapshot(actor);
        return true;
      });
    },
    /** This user's Foundry hotbar changed or was redrawn: copy the page-1 slots that changed into the Hub. */
    foundryChanged() {
      if (isGM() || !linked) return Promise.resolve(null);
      return run(async () => {
        const actor = linked;
        if (!actor || !eligible(actor)) return null;
        const ids = pageIds(user());
        if (lastFoundry && ids.every((id, i) => id === lastFoundry[i])) return null;
        await pull(actor, i => ids[i] !== lastFoundry?.[i]);
        snapshot(actor);
        return true;
      });
    },
    /** The GM hid the quick bar: forget the link. The bars stay as they are. */
    unlink() { linked = null; lastFoundry = null; lastHub = null; },
    /** Waits for the queued work (tests). */
    idle: () => queue
  };
}

/** The link for this client (main.mjs wires Foundry's hooks to it; the sheet calls activate). */
export const hotbarLink = createHotbarLink();
