/**
 * Add to the sheet (0.45.0): attacks, items, spells and features, from the Hub's Combat, Inventory, Magic and Features
 * tabs. Nothing here is a rule: the compendium browser is dnd5e's own (CompendiumBrowser.selectOne, as level-up.mjs
 * addClass uses it), the new item is built with Foundry's fromCompendium and dnd5e's item model onDropCreate hook, and
 * dnd5e's AdvancementManager.forNewItem runs for items that carry advancement (as the native sheet does on a drop).
 * Owner or GM only, checked here and not only by hiding the button. Every function resolves {ok, result?, error?}.
 *
 * Classes, subclasses, species and backgrounds are not added here: Level up (level-up.mjs) is their way in, and it keeps
 * the level backup. Dropping one says so.
 */
import {canEdit} from './actions.mjs';
import {requirePart} from './visibility.mjs';
import {formDialog, choiceDialog} from './ag-dialogs.mjs';
import {readDrop, resolveItemDrop, grantBundle} from './ag-item-drop.mjs';
import {renderBeside} from './popout.mjs';
import {advancementManager, showManager, hasSteps, setting} from './level-up.mjs';
import {esc} from './constants.mjs';

const refuse = error => ({ok: false, error});
const note = (kind, msg) => globalThis.ui?.notifications?.[kind]?.(msg);

/** The Item types each tab adds (dnd5e's own type ids). Combat also takes feats, checked for an attack activity. */
export const ADD_TYPES = Object.freeze({
  inventory: ['weapon', 'equipment', 'consumable', 'tool', 'loot', 'container'],
  magic: ['spell'],
  features: ['feat'],
  combat: ['weapon', 'feat']
});
/** What each tab's button is called and calls the thing it adds. */
export const ADD_LABELS = Object.freeze({
  inventory: {button: 'Add item…', what: 'item'},
  magic: {button: 'Add spell…', what: 'spell'},
  features: {button: 'Add feature…', what: 'feature'},
  combat: {button: 'Add attack…', what: 'attack'}
});
/** Every type a drop onto any list accepts. */
export const DROP_TYPES = Object.freeze([...new Set(Object.values(ADD_TYPES).flat())]);
/** Types that belong to Level up, not to a list. */
const LEVEL_TYPES = new Set(['class', 'subclass', 'race', 'background']);

const dnd5eApps = () => globalThis.dnd5e?.applications ?? {};
const titleCase = t => String(t).charAt(0).toUpperCase() + String(t).slice(1);
/** A type's label, as dnd5e / Foundry name it ("Weapon", "Equipment"). */
export function typeLabel(type) {
  const key = globalThis.CONFIG?.Item?.typeLabels?.[type];
  let label = null;
  try { label = key ? globalThis.game?.i18n?.localize?.(key) : null; } catch { label = null; }
  return label && label !== key ? label : titleCase(type);
}
/** Spell, weapon and so on, for a sentence. */
const typeName = type => typeLabel(type).toLowerCase();

/** {ok, error?}: whether this user may add to this character from this tab, and why not. */
export function addState(actor, tab, user = globalThis.game?.user) {
  if (!ADD_TYPES[tab]) return refuse(`There is nothing to add on ${tab}.`);
  if (actor?.type !== 'character') return refuse('Only characters get items added here.');
  if (!canEdit(actor, user)) return refuse(`Only ${actor?.name ?? 'the character'}'s owner or the GM can add to it.`);
  const hidden = requirePart(tab, user); if (hidden) return hidden;
  return {ok: true};
}
/** The reason shown on a disabled button, or '' when adding is allowed. */
export const addReason = (actor, tab, user) => { const s = addState(actor, tab, user); return s.ok ? '' : s.error; };

const hasAttack = doc => {
  const acts = doc?.system?.activities;
  const list = acts?.contents ?? (acts instanceof Map ? [...acts.values()] : Array.isArray(acts) ? acts : Object.values(acts ?? {}));
  return list.some(a => a?.type === 'attack');
};

/**
 * Builds the Item data for `actor` from a compendium or world Item, as dnd5e's sheet does for a drop. The id is kept
 * only when the item has advancement (the manager needs it) and the actor has no item with it already.
 */
export function itemDataFor(actor, doc) {
  const Item = globalThis.Item?.implementation ?? globalThis.Item;
  const owner = typeof Item?.fromCompendium === 'function' ? Item : globalThis.game?.items;
  if (typeof owner?.fromCompendium !== 'function') throw new Error('this version of Foundry has no fromCompendium()');
  const data = owner.fromCompendium(doc, {keepId: true});
  if (actor.items?.get?.(data._id)) delete data._id;
  // Another character's container id means nothing here.
  if (data.system && 'container' in data.system) data.system.container = null;
  return data;
}

/**
 * Adds one Item document to the character. `target` is the element the drop landed on or the tab's list (dnd5e's
 * onDropCreate reads it for the spell list). `sheet` shows dnd5e's advancement window when the item has steps.
 */
export async function addDocument(actor, doc, {tab = null, sheet = null, target = null, event = null, types = DROP_TYPES} = {}) {
  const state = tab ? addState(actor, tab) : (canEdit(actor) ? {ok: true} : refuse(`You don't own ${actor?.name ?? 'this character'}, so you can't add to it.`));
  if (!state.ok) return state;
  if (!doc || doc.documentName !== 'Item') return refuse('Drop an item.');
  if (LEVEL_TYPES.has(doc.type)) return refuse(`${doc.name} is a ${typeName(doc.type)}. Use Level up (⋯ menu) to add a class; the other character options are on the native sheet.`);
  if (!types.includes(doc.type)) return refuse(`${doc.name} is a ${typeName(doc.type)}, which doesn't go in this list.`);
  if (doc.parent === actor || (doc.parent?.documentName === 'Actor' && doc.parent.id === actor.id)) return refuse(`${doc.name} is already on ${actor.name}.`);
  if (tab === 'combat' && doc.type === 'feat' && !hasAttack(doc)) return refuse(`${doc.name} has no attack. Add it from the Features tab instead.`);
  try {
    // A container brings what is inside it (the shared grantBundle, as companion drops do); anything else is one item.
    const bundle = doc.type === 'container' ? (await grantBundle(doc)).data : [];
    const data = bundle.length > 1 ? bundle[0] : itemDataFor(actor, doc);
    const rows = bundle.length > 1 ? bundle : [data];
    const Model = globalThis.CONFIG?.Item?.dataModels?.[data.type];
    const evt = event ?? {target: target ?? sheet?.element ?? null, currentTarget: target ?? null, preventDefault() {}};
    // dnd5e's own per-type step for a new item (spell method and preparation, for instance). A failure is logged and the
    // item still goes on as dnd5e's defaults; it is never swallowed silently from the console.
    try { await Model?.onDropCreate?.(evt, actor, data); } catch (err) { console.warn('ashen-gate-character-hub | item onDropCreate', err); }
    const Manager = advancementManager();
    if (Object.keys(data.system?.advancement ?? {}).length && !setting('disableAdvancements', false) && typeof Manager?.forNewItem === 'function') {
      const manager = Manager.forNewItem(actor, data);
      if (rows.length === 1 && hasSteps(manager)) {
        await showManager(manager, sheet, () => note('info', `Added ${data.name} to ${actor.name}.`));
        return {ok: true, result: 'advancement', name: data.name};
      }
    }
    await actor.createEmbeddedDocuments('Item', rows, rows.length > 1 ? {keepId: true} : {});
    note('info', `Added ${data.name} to ${actor.name}${rows.length > 1 ? ` with ${rows.length - 1} ${rows.length === 2 ? 'item' : 'items'} inside` : ''}.`);
    return {ok: true, result: 'created', name: data.name};
  } catch (err) {
    console.error('ashen-gate-character-hub | add item', err);
    return refuse(`Could not add ${doc.name}: ${err?.message ?? err}`);
  }
}

/** Browse compendiums… : dnd5e's browser locked to this tab's types; the pick is added like a drop. */
export async function browseAndAdd(actor, tab, {sheet = null} = {}) {
  const state = addState(actor, tab); if (!state.ok) return state;
  const {CompendiumBrowser} = dnd5eApps();
  if (typeof CompendiumBrowser?.selectOne !== 'function') return refuse("This version of dnd5e has no compendium browser to pick from. Drag the item onto the list, or use Create new….");
  let uuid;
  try { uuid = await CompendiumBrowser.selectOne({filters: {locked: {types: new Set(ADD_TYPES[tab])}}}); } catch (err) {
    console.error('ashen-gate-character-hub | compendium browser', err);
    return refuse(`Could not open the compendium browser: ${err?.message ?? err}`);
  }
  if (!uuid) return {ok: true, result: null};
  const doc = await globalThis.fromUuid?.(uuid);
  if (!doc) return refuse("That item no longer exists or you can't see it.");
  return addDocument(actor, doc, {tab, sheet, types: ADD_TYPES[tab]});
}

/** Create new… : name and type in a small form, then a blank embedded Item whose sheet opens beside the Hub. */
export const createPick = async (tab, {ask = formDialog} = {}) => {
  const types = ADD_TYPES[tab], what = ADD_LABELS[tab].what;
  return ask(`Create new ${what}`, [
    {name: 'name', label: 'Name', type: 'text', value: ''},
    ...(types.length > 1 ? [{name: 'type', label: 'Type', type: 'select', value: types[0], options: types.map(t => ({value: t, label: typeLabel(t)}))}] : [])
  ], {ok: 'Create'});
};
export async function createNew(actor, tab, {sheet = null, pick = createPick} = {}) {
  const state = addState(actor, tab); if (!state.ok) return state;
  const types = ADD_TYPES[tab], got = await pick(tab);
  if (!got) return {ok: true, result: null};
  const name = String(got.name ?? '').trim(), type = types.length === 1 ? types[0] : got.type;
  if (!name) return refuse('Give it a name first.');
  if (!types.includes(type)) return refuse('Pick one of the types listed.');
  try {
    // Re-check at the write: the user, the character's ownership or Player visibility may have changed under the dialog.
    const again = addState(actor, tab); if (!again.ok) return again;
    const [item] = await actor.createEmbeddedDocuments('Item', [{name, type}]);
    note('info', `Added ${name} to ${actor.name}.`);
    if (item?.sheet) await renderBeside(sheet, item.sheet);
    return {ok: true, result: 'created', name, item};
  } catch (err) {
    console.error('ashen-gate-character-hub | create item', err);
    return refuse(`Could not create ${name}: ${err?.message ?? err}`);
  }
}

/** The Add… button's own dialog: Browse compendiums… or Create new…. Resolves 'browse', 'create' or null. */
export const addChoice = (tab, ask = choiceDialog) => ask(ADD_LABELS[tab].button.replace('…', ''), `<p>Add a ${esc(ADD_LABELS[tab].what)} to this character.</p>`,
  [{action: 'browse', label: 'Browse compendiums…', icon: 'fa-solid fa-book-atlas', default: true}, {action: 'create', label: 'Create new…', icon: 'fa-solid fa-file-circle-plus'}]);

/** The Add button. `choose` and `pick` are the dialogs (replaced in tests). */
export async function startAdd(actor, tab, {sheet = null, choose = addChoice, pick = createPick} = {}) {
  const state = addState(actor, tab); if (!state.ok) return state;
  const how = await choose(tab);
  if (how === 'browse') return browseAndAdd(actor, tab, {sheet});
  if (how === 'create') return createNew(actor, tab, {sheet, pick});
  return {ok: true, result: null};
}

/** A drop on a list: one Item, through the shared item-drop standard (folders and non-Items are refused with its text). */
export async function dropOnList(actor, tab, event, {sheet = null, target = null} = {}) {
  const state = addState(actor, tab); if (!state.ok) return state;
  const r = await resolveItemDrop(readDrop(event));
  if (!r.ok) return refuse(r.reason);
  return addDocument(actor, r.items[0], {tab, sheet, target, event});
}
