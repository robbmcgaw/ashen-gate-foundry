/**
 * Item actions. Each checks ownership, writes one update per document, and resolves to {ok, error?}.
 * Using an item and resting are handed to dnd5e (item.use(), actor.shortRest()/longRest()).
 */
import {MODULE_ID, esc, num} from './constants.mjs';
import {canEdit} from './actions.mjs';
import {requirePart} from './visibility.mjs';
import {attunementData, SLOTS} from './items.mjs';
import {electrumHidden} from './partners.mjs';
import {choiceDialog} from './ag-dialogs.mjs';
import {renderBeside} from './popout.mjs';
import {prepareCheck, limitMessage, limitInfo, notifyGmOver, CHECKED} from './spell-prep.mjs';

const refuse = error => ({ok: false, error});
const SLOT_IDS = new Set(SLOTS.map(s => s.id));
const notOwner = actor => refuse(`You don't own ${actor?.name ?? 'this character'}, so you can't change it.`);

function ownedItem(actor, id) {
  const item = actor?.items?.get?.(id);
  return item ? item : null;
}
async function run(what, fn) {
  try { return {ok: true, result: await fn()}; } catch (err) {
    console.error(`${MODULE_ID} |`, what, err);
    return refuse(`Could not ${what}: ${err?.message ?? err}`);
  }
}
/** Shared guard: the actor must be editable by this user and the item must be one of its own. */
function guard(actor, id) {
  if (!canEdit(actor)) return {error: notOwner(actor)};
  const item = ownedItem(actor, id);
  if (!item) return {error: refuse('That item is no longer on this character.')};
  return {item};
}

/**
 * The event handed to dnd5e's item.use (0.42.0). dnd5e 6 opens its attack and damage roll dialogs at
 * `top: event.clientY - 80` (activity/attack.mjs, activity/mixin.mjs). A key press (the quick bar keys 1-9 and 0) has no
 * clientY, and a button pressed with Enter or Space has clientY 0, so those dialogs were pinned to the top of the screen;
 * a click in a popped-out Hub gives a position in that other window. Such events are replaced by a click event at
 * `anchor` (the slot or row used), else at the middle of the screen, carrying the same Shift/Ctrl/Alt/Meta keys, so
 * dnd5e's fast-forward keys still work. A real mouse click in Foundry's own window is passed on unchanged.
 */
export function rollEvent(event, anchor = null, view = globalThis) {
  if (!event || typeof event !== 'object') return event;
  const here = !event.view || event.view === view;
  const pointed = Number.isFinite(event.clientY) && here && !(event.detail === 0 && !event.clientX && !event.clientY);
  if (pointed) return event;
  const Click = view?.PointerEvent ?? view?.MouseEvent;
  if (typeof Click !== 'function') return event;
  let box = null;
  for (const el of [anchor, anchor?.closest?.('.application, .window-app')]) {
    if (!el || (view?.document && el.ownerDocument && el.ownerDocument !== view.document)) continue;
    const r = el.getBoundingClientRect?.();
    if (r && (r.width || r.height)) { box = r; break; }
  }
  const x = box ? box.left + box.width / 2 : (view?.innerWidth ?? 0) / 2, y = box ? box.top + box.height / 2 : (view?.innerHeight ?? 0) / 2;
  return new Click('click', {clientX: Math.round(x), clientY: Math.round(y), shiftKey: !!event.shiftKey, ctrlKey: !!event.ctrlKey, altKey: !!event.altKey, metaKey: !!event.metaKey});
}

export async function useItem(actor, id, event, anchor = null) {
  const {item, error} = guard(actor, id); if (error) return error;
  if (typeof item.use !== 'function') return refuse(`${item.name} can't be used from here; open its sheet.`);
  return run(`use ${item.name}`, () => item.use({event: rollEvent(event, anchor)}));
}

/** Viewing an item sheet only needs to see the character; the item sheet itself enforces editing. */
export async function openItemSheet(actor, id, hub = null) {
  const item = ownedItem(actor, id);
  if (!item) return refuse('That item is no longer on this character.');
  return run('open the item', () => (item.sheet ? renderBeside(hub, item.sheet) : undefined));
}

export async function setQuantity(actor, id, raw) {
  const {item, error} = guard(actor, id); if (error) return error;
  const q = Math.trunc(num(raw, NaN));
  if (!Number.isFinite(q) || q < 0) return refuse('Quantity must be 0 or more.');
  return run('change the quantity', () => item.update({'system.quantity': q}));
}

export async function setCurrency(actor, key, raw) {
  if (!canEdit(actor)) return notOwner(actor);
  if (!(key in (actor.system?.currency ?? {}))) return refuse(`Unknown currency ${key}.`);
  const v = Math.trunc(num(raw, NaN));
  if (!Number.isFinite(v) || v < 0) return refuse('Coins must be 0 or more.');
  // Electrum off in Utilities: the Hub may lower what a character still has, never add any.
  if (key === 'ep' && electrumHidden() && v > num(actor.system.currency.ep)) return refuse('Electrum is off (Utilities GM setting). Ask the GM to convert it or turn it on.');
  return run('change currency', () => actor.update({[`system.currency.${key}`]: v}));
}

/**
 * Prepares or unprepares a spell. Unpreparing always works. Preparing past the class's limit (dnd5e's
 * system.spellcasting.preparation.max) is refused for a player with a plain error, {code: 'prep-limit', limit}; a GM is
 * never refused but is told "over the limit"; a class with no known maximum is allowed (result.note 'limit unknown').
 */
export async function togglePrepared(actor, id) {
  const {item, error} = guard(actor, id); if (error) return error;
  if (item.type !== 'spell') return refuse(`${item.name} is not a spell.`);
  if (num(item.system.prepared) === 2) return refuse(`${item.name} is always prepared.`);
  if (item.system.canPrepare !== true) return refuse(`${item.name} is not a prepared spell for its spellcasting method.`);
  const options = {[CHECKED]: true};
  if (item.system.prepared) return run('change preparation', () => item.update({'system.prepared': 0}, options));
  const c = prepareCheck(actor, item);
  if (c.blocked) return {...refuse(limitMessage(c.class)), code: 'prep-limit', limit: limitInfo(c.class)};
  if (c.gmOver) notifyGmOver(c.class);
  if (c.unknown) console.debug(`${MODULE_ID} | preparation limit unknown for ${c.class.name}; allowed`);
  const r = await run('change preparation', () => item.update({'system.prepared': 1}, options));
  return c.unknown && r.ok ? {...r, note: 'limit unknown'} : r;
}

/** The dialog for a refused prepare: Cancel (the default) and one "Unprepare X and prepare Y" button per prepared spell. */
export function limitPrompt(item, limit) {
  const list = limit.prepared.map(p => `<li>${esc(p.name)}</li>`).join('');
  return {title: 'Preparation limit reached',
    content: `<p>${esc(limitMessage({name: limit.className, max: limit.max}))}</p><p>Prepared as ${esc(limit.className)}:</p><ul>${list}</ul>`,
    choices: limit.prepared.map(p => ({action: `unprepare:${p.id}`, label: `Unprepare ${p.name} and prepare ${item.name}`}))};
}
/** Default ask: Cancel is the default button (Enter never swaps a spell). Resolves the chosen action or null. */
export async function askPrepareLimit({title, content, choices}) {
  const D = globalThis.foundry?.applications?.api?.DialogV2;
  if (!D?.wait) return choiceDialog(title, content, choices);
  const result = await D.wait({   // ag-lint-allow: Cancel must be the default button
    classes: ['ag-app', 'ag-dialog', 'ag-dialog--choice'], window: {title}, content, modal: true, rejectClose: false,
    buttons: [{action: 'cancel', label: 'Cancel', default: true, callback: () => null},
      ...choices.map(c => ({action: c.action, label: c.label, class: 'ag-dialog__choice', default: false, callback: () => c.action}))]
  });
  return choices.some(c => c.action === result) ? result : null;
}
/** The Hub's Prepare button: togglePrepared, and on a limit refusal the dialog that swaps one prepared spell for this one. */
export async function togglePreparedAsk(actor, id, {ask = askPrepareLimit} = {}) {
  const r = await togglePrepared(actor, id);
  if (r.ok || r.code !== 'prep-limit') return r;
  const item = ownedItem(actor, id);
  let choice;
  try { choice = await ask(limitPrompt(item, r.limit)); } catch (err) { return refuse(`Could not ask about the preparation limit: ${err?.message ?? err}`); }
  if (!choice || choice === 'cancel') return {ok: false, cancelled: true, error: null};
  const out = choice.startsWith('unprepare:') ? choice.slice(10) : '';
  if (!r.limit.prepared.some(p => p.id === out)) return refuse('Unknown choice.');
  const un = await togglePrepared(actor, out);
  if (!un.ok) return un;
  return togglePrepared(actor, id);
}

/** dnd5e's own favourite id for an item on its actor (a relative UUID, ".Item.<id>"). */
// 0.54.1: V14 deprecates ClientDocument#getRelativeUUID (removed in V16) for foundry.utils.buildRelativeUuid; use the new one when it exists.
export const favoriteId = (actor, item) => {
  try {
    const build = globalThis.foundry?.utils?.buildRelativeUuid;
    if (typeof build === 'function') { const id = build(item, actor); if (typeof id === 'string' && id) return id; }
    else if (typeof item?.getRelativeUUID === 'function') { const id = item.getRelativeUUID(actor); if (typeof id === 'string' && id) return id; }
  } catch { /* fall through to the plain form */ }
  return `.Item.${item?.id}`;
};
/** True when this dnd5e version keeps favourites on the character (system.favorites, dnd5e 3+). */
export const favoritesSupported = actor => typeof actor?.system?.addFavorite === 'function' && typeof actor?.system?.removeFavorite === 'function';
export const isFavorite = (actor, item) => {
  try { return favoritesSupported(actor) && (actor.system.hasFavorite?.(favoriteId(actor, item)) ?? (actor.system.favorites ?? []).some(f => f.id === favoriteId(actor, item))); } catch { return false; }
};
/**
 * Star / unstar an item. Uses dnd5e's own character favourites (the same list the standard sheet's Favorites shows),
 * so nothing new is stored. Owner or GM only.
 */
export async function toggleFavorite(actor, id) {
  const {item, error} = guard(actor, id); if (error) return error;
  if (!favoritesSupported(actor)) return refuse('This version of dnd5e has no favourites for this character.');
  const fid = favoriteId(actor, item);
  return isFavorite(actor, item)
    ? run('remove the favourite', () => actor.system.removeFavorite(fid))
    : run('add the favourite', () => actor.system.addFavorite({type: 'item', id: fid}));
}

export async function rest(actor, type) {
  if (!canEdit(actor)) return notOwner(actor);
  const hidden = requirePart('rest'); if (hidden) return hidden;
  const method = type === 'long' ? 'longRest' : 'shortRest';
  if (typeof actor[method] !== 'function') return refuse(`This version of dnd5e has no ${method}().`);
  return run(`take a ${type} rest`, () => actor[method]({}));
}

// ---------- Equip, attune, worn slot ----------

const attunedItems = actor => [...(actor.items ?? [])].filter(i => i.system?.attuned);

/** Default prompt: the shared choice dialog (Cancel left, the choices right). Resolves to the chosen action, or null. */
export async function askDialog({title, content, buttons}) {
  if (!globalThis.foundry?.applications?.api?.DialogV2?.wait) throw new Error('Foundry dialogs are not available');
  const cancel = buttons.find(b => b.action === 'cancel')?.label ?? 'Cancel';
  return choiceDialog(title, content, buttons.filter(b => b.action !== 'cancel'), {cancel});
}

/**
 * The attunement question when equipping an item that requires attunement and is not attuned.
 * Free slot → Attune and equip / Equip without attuning / Cancel. At the limit → explain, list attuned items with
 * Unattune shortcuts, and still offer Equip without attuning / Cancel.
 */
export function attunePrompt(actor, item) {
  const {value, max} = attunementData(actor);
  if (value < max) return {atLimit: false, title: `Attune to ${item.name}?`,
    content: `<p><strong>${esc(item.name)}</strong> requires attunement. You are attuned to ${value} of ${max} items.</p><p>Attune now?</p>`,
    buttons: [{action: 'cancel', label: 'Cancel'}, {action: 'equip', label: 'Equip without attuning'}, {action: 'attune', label: 'Attune and equip', default: true}]};
  const attuned = attunedItems(actor);
  return {atLimit: true, title: 'Attunement limit reached',
    content: `<p><strong>${esc(item.name)}</strong> requires attunement, but you are already attuned to ${value} of ${max} items. Unattune one first to attune this one:</p><ul>${attuned.map(i => `<li>${esc(i.name)}</li>`).join('')}</ul>`,
    buttons: [{action: 'cancel', label: 'Cancel'}, {action: 'equip', label: 'Equip without attuning'}, ...attuned.map(i => ({action: `unattune:${i.id}`, label: `Unattune ${i.name}`}))]};
}

/**
 * Equips an item (optionally into a chosen worn slot). Items that require attunement prompt first; optional
 * attunement does not prompt (dnd5e treats it as optional). Unattuning from the prompt asks again with the freed slot.
 */
export async function equipItem(actor, id, {slot = null, ask = askDialog} = {}) {
  const {item, error} = guard(actor, id); if (error) return error;
  if (!('equipped' in (item.system ?? {}))) return refuse(`${item.name} can't be equipped.`);
  if (slot !== null && !SLOT_IDS.has(slot)) return refuse(`Unknown slot ${slot}.`);
  if (slot) { const hidden = requirePart('equipment'); if (hidden) return hidden; }
  const diff = {'system.equipped': true};
  if (slot) diff[`flags.${MODULE_ID}.slot`] = slot;
  if (item.system.attunement === 'required' && !item.system.attuned) {
    let decided = false;
    for (let round = 0; round < 4 && !decided; round++) {
      const p = attunePrompt(actor, item);
      let choice;
      try { choice = await ask(p); } catch (err) { return refuse(`Could not ask about attunement: ${err?.message ?? err}`); }
      if (!choice || choice === 'cancel') return {ok: false, cancelled: true, error: null};
      if (choice === 'attune' && !p.atLimit) { diff['system.attuned'] = true; decided = true; continue; }
      if (choice === 'equip') { decided = true; continue; }
      if (choice.startsWith('unattune:')) {
        const r = await setAttuned(actor, choice.slice(9), false);
        if (!r.ok) return r;
        continue;
      }
      return refuse('Unknown choice.');
    }
    if (!decided) return refuse('Nothing was equipped.');
  }
  return run(`equip ${item.name}`, () => item.update(diff));
}

/** Unequipping leaves attunement as it is. */
export async function unequipItem(actor, id) {
  const {item, error} = guard(actor, id); if (error) return error;
  return run(`unequip ${item.name}`, () => item.update({'system.equipped': false}));
}

/** Attune refuses at the actor's limit (and names what is attuned); unattune always works. */
export async function setAttuned(actor, id, attuned) {
  const {item, error} = guard(actor, id); if (error) return error;
  if (attuned) {
    if (!['required', 'optional'].includes(item.system?.attunement)) return refuse(`${item.name} can't be attuned.`);
    if (item.system.attuned) return {ok: true, result: item};
    const {value, max} = attunementData(actor);
    if (value >= max) return refuse(`You are attuned to ${value} of ${max} items. Unattune one first: ${attunedItems(actor).map(i => i.name).join(', ')}.`);
  }
  return run(attuned ? `attune to ${item.name}` : `end attunement to ${item.name}`, () => item.update({'system.attuned': !!attuned}));
}

/** The paper-doll box an equipped item shows in. Display only; '' returns it to its natural place. */
export async function setSlot(actor, id, slot) {
  const {item, error} = guard(actor, id); if (error) return error;
  if (slot && !SLOT_IDS.has(slot)) return refuse(`Unknown slot ${slot}.`);
  const hidden = requirePart('equipment'); if (hidden) return hidden;
  return run('move the item', () => item.update({[`flags.${MODULE_ID}.slot`]: slot || null}));
}

/** Swaps two equipped items between their boxes (main hand ↔ off hand, ring ↔ ring). Display only. */
export async function swapSlots(actor, idA, slotA, idB, slotB) {
  const a = guard(actor, idA); if (a.error) return a.error;
  const b = guard(actor, idB); if (b.error) return b.error;
  if (!SLOT_IDS.has(slotA) || !SLOT_IDS.has(slotB)) return refuse('Unknown slot.');
  const hidden = requirePart('equipment'); if (hidden) return hidden;
  return run('swap the items', async () => {
    await a.item.update({[`flags.${MODULE_ID}.slot`]: slotB});
    await b.item.update({[`flags.${MODULE_ID}.slot`]: slotA});
  });
}
