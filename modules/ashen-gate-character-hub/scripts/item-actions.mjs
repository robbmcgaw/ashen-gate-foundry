/**
 * Item actions. Each checks ownership, writes one update per document, and resolves to {ok, error?}.
 * Using an item and resting are handed to dnd5e (item.use(), actor.shortRest()/longRest()).
 */
import {MODULE_ID, esc, num} from './constants.mjs';
import {canEdit} from './actions.mjs';
import {attunementData, SLOTS} from './items.mjs';

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

export async function useItem(actor, id, event) {
  const {item, error} = guard(actor, id); if (error) return error;
  if (typeof item.use !== 'function') return refuse(`${item.name} can't be used from here; open its sheet.`);
  return run(`use ${item.name}`, () => item.use({event}));
}

/** Viewing an item sheet only needs to see the character; the item sheet itself enforces editing. */
export async function openItemSheet(actor, id) {
  const item = ownedItem(actor, id);
  if (!item) return refuse('That item is no longer on this character.');
  return run('open the item', () => item.sheet?.render?.({force: true}) ?? item.sheet?.render?.(true));
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
  return run('change currency', () => actor.update({[`system.currency.${key}`]: v}));
}

export async function togglePrepared(actor, id) {
  const {item, error} = guard(actor, id); if (error) return error;
  if (item.type !== 'spell') return refuse(`${item.name} is not a spell.`);
  if (num(item.system.prepared) === 2) return refuse(`${item.name} is always prepared.`);
  if (item.system.canPrepare !== true) return refuse(`${item.name} is not a prepared spell for its spellcasting method.`);
  return run('change preparation', () => item.update({'system.prepared': Number(!item.system.prepared)}));
}

export async function rest(actor, type) {
  if (!canEdit(actor)) return notOwner(actor);
  const method = type === 'long' ? 'longRest' : 'shortRest';
  if (typeof actor[method] !== 'function') return refuse(`This version of dnd5e has no ${method}().`);
  return run(`take a ${type} rest`, () => actor[method]({}));
}

// ---------- Equip, attune, worn slot ----------

const attunedItems = actor => [...(actor.items ?? [])].filter(i => i.system?.attuned);

/** Default prompt: a DialogV2 with one button per choice. Resolves to the chosen action, or null. */
export async function askDialog({title, content, buttons}) {
  const D = globalThis.foundry?.applications?.api?.DialogV2;
  if (!D?.wait) throw new Error('Foundry dialogs are not available');
  return D.wait({window: {title}, content, buttons, rejectClose: false});
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
  return run('move the item', () => item.update({[`flags.${MODULE_ID}.slot`]: slot || null}));
}

/** Swaps two equipped items between their boxes (main hand ↔ off hand, ring ↔ ring). Display only. */
export async function swapSlots(actor, idA, slotA, idB, slotB) {
  const a = guard(actor, idA); if (a.error) return a.error;
  const b = guard(actor, idB); if (b.error) return b.error;
  if (!SLOT_IDS.has(slotA) || !SLOT_IDS.has(slotB)) return refuse('Unknown slot.');
  return run('swap the items', async () => {
    await a.item.update({[`flags.${MODULE_ID}.slot`]: slotB});
    await b.item.update({[`flags.${MODULE_ID}.slot`]: slotA});
  });
}
