/** Read-only view models for the Actor's embedded Items (inventory, combat, spells, features). */
import {MODULE_ID, dnd5eConfig, labelOf, num} from './constants.mjs';
import {itemFacts, plainText, summaryOf} from './cards.mjs';
import {COMBAT_CATEGORIES} from './organize.mjs';

const bySortThenName = (a, b) => (num(a.sort) - num(b.sort)) || String(a.name).localeCompare(String(b.name));
/** dnd5e keeps activities in a Collection; tests may pass an array. */
export const activitiesOf = item => { const a = item.system?.activities; return a ? [...(a.values?.() ?? a)] : []; };

/** dnd5e's item rarity keys (CONFIG.DND5E.itemRarity). Anything else (mundane items: '') gets no rarity colour. */
export const RARITIES = new Set(['common', 'uncommon', 'rare', 'veryRare', 'legendary', 'artifact']);

/**
 * 0.36.0: the effect note of an activity recipe (Profession Ledger 0.29.0): a REC- Item whose Manager source definition says
 * `kind: "activity"` may carry `effect_note` (or `effectNote`), plain text naming a boon the GM decides at the table.
 * Whitespace collapsed, cut to EFFECT_NOTE_MAX characters; null for crafts, other items or no note. Display only.
 */
export const EFFECT_NOTE_MAX = 400;
export function effectNoteOf(item) {
  const src = item?.flags?.['ashen-gate-manager']?.source, def = src?.definition;
  if (!def || typeof def !== 'object' || !/^REC-/.test(String(src.sourceId ?? def.id ?? ''))) return null;
  if (String(def.kind ?? def.recipe?.kind ?? '').trim().toLowerCase() !== 'activity') return null;
  const value = def.effect_note ?? def.effectNote;
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > EFFECT_NOTE_MAX ? `${text.slice(0, EFFECT_NOTE_MAX - 1).trimEnd()}…` : text;
}
export const EFFECT_NOTE_LEAD = 'Effect (the GM decides): ';

export function itemRow(item) {
  const s = item.system ?? {}, uses = s.uses ?? {};
  const effectNote = effectNoteOf(item);
  // The note follows the description: its first part shows under the name like a summary, all of it under "More".
  const description = plainText(s.description?.value);
  const details = effectNote ? [description, `${EFFECT_NOTE_LEAD}${effectNote}`].filter(Boolean).join('\n\n') : description;
  const {summary, more} = summaryOf(details);
  return {effectNote,
    facts: itemFacts(item), summary, more, details, sort: num(item.sort), actType: activitiesOf(item)[0]?.activation?.type ?? '', uuid: item.uuid ?? (item.parent?.uuid ? `${item.parent.uuid}.Item.${item.id}` : null),
    id: item.id, name: item.name, img: item.img, type: item.type, quantity: num(s.quantity, 1),
    equippable: 'equipped' in s, equipped: !!s.equipped,
    canAttune: s.attunement === 'required' || s.attunement === 'optional', attunement: s.attunement ?? '', attuned: !!s.attuned,
    uses: num(uses.max) > 0 ? {value: num(uses.value, num(uses.max) - num(uses.spent)), max: num(uses.max)} : null,
    usable: activitiesOf(item).length > 0, container: s.container ?? null, rarity: RARITIES.has(s.rarity) ? s.rarity : '',
    mastery: item.type === 'weapon' ? weaponMastery(item) : null
  };
}

/**
 * A weapon's mastery from dnd5e's own data (0.30.0): the key in system.mastery, its label and rules page from
 * CONFIG.DND5E.weaponMasteries. `mastered` follows dnd5e's system.masteryOptions (dnd5e lists the mastery there only
 * when the character can use it): true / false, or null when this dnd5e has no masteryOptions. Null: no mastery.
 */
export function weaponMastery(item) {
  const key = typeof item?.system?.mastery === 'string' ? item.system.mastery : '';
  if (!key) return null;
  const cfg = dnd5eConfig().weaponMasteries?.[key];
  let options;
  try { options = item.system.masteryOptions; } catch { options = undefined; }
  const mastered = Array.isArray(options) ? options.some(o => o?.value === key) : null;
  return {key, label: labelOf(cfg) || key, reference: typeof cfg?.reference === 'string' ? cfg.reference : null, mastered};
}

export const INVENTORY_TYPES = [['weapon', 'Weapons'], ['equipment', 'Equipment'], ['consumable', 'Consumables'], ['tool', 'Tools'], ['container', 'Containers'], ['loot', 'Loot']];
export const isInventory = item => INVENTORY_TYPES.some(([t]) => t === item.type);

/** Items by category. Items inside a container are listed under it, not at the top level. */
export function inventoryData(actor) {
  const items = [...(actor.items ?? [])].filter(isInventory).sort(bySortThenName);
  const ids = new Set(items.map(i => i.id));
  const inside = id => items.filter(i => i.system?.container === id).map(itemRow);
  const groups = INVENTORY_TYPES.map(([type, label]) => ({type, label, items: items
    .filter(i => i.type === type && !(i.system?.container && ids.has(i.system.container)))
    .map(i => ({...itemRow(i), contents: i.type === 'container' ? inside(i.id) : []}))})).filter(g => g.items.length);
  return {groups, attunement: attunementData(actor), currency: currencyData(actor), encumbrance: encumbranceData(actor)};
}

/**
 * Carried weight against carrying capacity, as dnd5e works it out (system.attributes.encumbrance: value, max, pct).
 * The Hub adds no rules: null when dnd5e gives no capacity. Units: dnd5e's default weight unit (lb or kg).
 */
export function encumbranceData(actor) {
  const e = actor?.system?.attributes?.encumbrance;
  const max = num(e?.max), value = Math.round(num(e?.value) * 100) / 100;
  if (!e || !(max > 0)) return null;
  let units = '';
  try { units = globalThis.dnd5e?.utils?.defaultUnits?.('weight') ?? ''; } catch { units = ''; }
  const abbr = dnd5eConfig().weightUnits?.[units]?.abbreviation ?? (units || 'lb');
  const pct = Math.max(0, Math.min(100, Number.isFinite(Number(e.pct)) ? num(e.pct) : value / max * 100));
  return {value, max, pct: Math.round(pct), units: abbr, over: value > max};
}

/** dnd5e derives attunement.value from attuned items; max is the actor's setting (3 by default). */
export function attunementData(actor) {
  const a = actor.system?.attributes?.attunement ?? {};
  const counted = [...(actor.items ?? [])].filter(i => i.system?.attuned).length;
  return {value: num(a.value, counted), max: num(a.max, 3)};
}

export function currencyData(actor) {
  const cfg = dnd5eConfig().currencies ?? {}, cur = actor.system?.currency ?? {};
  const keys = Object.keys(cfg).length ? Object.keys(cfg) : ['pp', 'gp', 'ep', 'sp', 'cp'];
  return keys.filter(k => k in cur || cfg[k]).map(k => ({key: k, label: labelOf(cfg[k]) || k.toUpperCase(), abbr: cfg[k]?.abbreviation ?? k, value: num(cur[k])}));
}

// ---------- Combat ----------

const ACTIVATION_GROUPS = [['action', 'Actions'], ['bonus', 'Bonus Actions'], ['reaction', 'Reactions']];
const ARMOR_TYPES = new Set(['light', 'medium', 'heavy', 'natural', 'shield']);
const FEATURE_TYPES = new Set(['feat', 'class', 'subclass', 'race', 'background']);
/** Profession things by their Ashen Gate id (flags['ashen-gate-manager'].source.sourceId): professions, recipes, materials. */
const PROFESSION_ID = /^(PROF|REC|MAT)-/;
/**
 * Combat's main category for an item (0.31.0): Professions (tools, and PROF-/REC-/MAT- records), Combat (weapons, armor
 * and shields), Consumables, Features (features, class, subclass, species, background) and Trinkets (everything else:
 * rings, wondrous items, loot). Display only; nothing is stored.
 */
export function combatCategory(item) {
  const id = String(item?.flags?.['ashen-gate-manager']?.source?.sourceId ?? '');
  if (item?.type === 'tool' || PROFESSION_ID.test(id)) return 'professions';
  if (item?.type === 'weapon' || (item?.type === 'equipment' && ARMOR_TYPES.has(item.system?.type?.value))) return 'combat';
  if (item?.type === 'consumable') return 'consumables';
  if (FEATURE_TYPES.has(item?.type)) return 'features';
  return 'trinkets';
}
export {COMBAT_CATEGORIES};
/**
 * Weapons (equipped first), then other usable items and features grouped by their first activity's activation.
 * `rows` (0.31.0) is all of them in one list, each with its main `category`, for Combat's group / sort / filters.
 */
export function combatData(actor) {
  const items = [...(actor.items ?? [])].sort(bySortThenName);
  const row = i => ({...itemRow(i), category: combatCategory(i)});
  const weapons = items.filter(i => i.type === 'weapon').map(row).sort((a, b) => Number(b.equipped) - Number(a.equipped));
  const usable = items.filter(i => i.type !== 'weapon' && i.type !== 'spell' && activitiesOf(i).length);
  const groupOf = i => activitiesOf(i)[0]?.activation?.type;
  const groups = ACTIVATION_GROUPS.map(([key, label]) => ({key, label, items: usable.filter(i => groupOf(i) === key).map(row)}));
  groups.push({key: 'other', label: 'Other', items: usable.filter(i => !ACTIVATION_GROUPS.some(([k]) => k === groupOf(i))).map(row)});
  return {weapons, groups: groups.filter(g => g.items.length), rows: [...weapons, ...usable.map(row)]};
}

// ---------- Spells ----------

export function spellsData(actor) {
  const cfg = dnd5eConfig(), slots = actor.system?.spells ?? {};
  const spells = [...(actor.items ?? [])].filter(i => i.type === 'spell').sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const levels = new Map();
  for (const sp of spells) {
    const level = num(sp.system?.level);
    if (!levels.has(level)) levels.set(level, []);
    const prepared = num(sp.system?.prepared);
    levels.get(level).push({...itemRow(sp), level, prepared, always: prepared === 2, canPrepare: sp.system?.canPrepare === true && level > 0,
      usesSlots: typeof sp.system?.usesSlots === 'boolean' ? sp.system.usesSlots : level > 0});
  }
  const slotOf = level => { const s = slots[`spell${level}`]; return s && num(s.max) > 0 ? {value: num(s.value), max: num(s.max)} : null; };
  const out = [...levels.keys()].sort((a, b) => a - b).map(level => ({level, label: labelOf(cfg.spellLevels?.[level]) || (level ? `Level ${level}` : 'Cantrips'), slots: level ? slotOf(level) : null, spells: levels.get(level)}));
  for (let level = 1; level <= 9; level++) if (!levels.has(level) && slotOf(level)) out.push({level, label: labelOf(cfg.spellLevels?.[level]) || `Level ${level}`, slots: slotOf(level), spells: []});
  out.sort((a, b) => a.level - b.level);
  const p = slots.pact;
  const pact = p && num(p.max) > 0 ? {level: num(p.level), value: num(p.value), max: num(p.max)} : null;
  const slotsLeft = Object.fromEntries(out.filter(l => l.slots).map(l => [l.level, l.slots.value]));
  return {levels: out, pact, slotsLeft};
}

// ---------- Features ----------

/** Where a feature came from, the way dnd5e's own sheet names it: the item that granted it (flags.dnd5e.advancementOrigin). */
export function featureSource(actor, item) {
  const origin = item.flags?.dnd5e?.advancementOrigin ?? (typeof item.getFlag === 'function' ? item.getFlag('dnd5e', 'advancementOrigin') : null);
  const granting = origin ? actor.items?.get?.(String(origin).split('.')[0]) : null;
  return granting ? {sourceId: granting.id, sourceName: granting.name, sourceType: granting.type} : {sourceId: '', sourceName: '', sourceType: ''};
}

export function featuresData(actor) {
  const cfg = dnd5eConfig().featureTypes ?? {};
  const items = [...(actor.items ?? [])].sort(bySortThenName);
  const ID_ORDER = ['class', 'subclass', 'race', 'background'];
  const identity = items.filter(i => ID_ORDER.includes(i.type)).sort((a, b) => ID_ORDER.indexOf(a.type) - ID_ORDER.indexOf(b.type)).map(i => ({...itemRow(i), detail: i.type === 'class' ? `Level ${num(i.system?.levels)}` : i.type === 'race' ? 'Species' : i.type[0].toUpperCase() + i.type.slice(1)}));
  const groups = new Map();
  for (const f of items.filter(i => i.type === 'feat')) {
    const key = f.system?.type?.value || 'other';
    if (!groups.has(key)) groups.set(key, {key, label: labelOf(cfg[key]) || (key === 'other' ? 'Other Features' : key), items: []});
    groups.get(key).items.push({...itemRow(f), ...featureSource(actor, f)});
  }
  return {identity, groups: [...groups.values()]};
}

// ---------- Equipment paper doll (display only: dnd5e has no worn-slot rules) ----------

export const SLOTS = [
  {id: 'head', label: 'Head'}, {id: 'neck', label: 'Neck'}, {id: 'back', label: 'Back'}, {id: 'body', label: 'Body armor'},
  {id: 'mainhand', label: 'Main hand'}, {id: 'offhand', label: 'Off hand'}, {id: 'hands', label: 'Hands'}, {id: 'waist', label: 'Waist'},
  {id: 'feet', label: 'Feet'}, {id: 'bracer', label: 'Bracers'}, {id: 'ring1', label: 'Ring'}, {id: 'ring2', label: 'Ring'},
  {id: 'trinket', label: 'Trinket'}, {id: 'trinket2', label: 'Trinket'}, {id: 'trinket3', label: 'Trinket'}
];
const SLOT_IDS = new Set(SLOTS.map(s => s.id));
export const WORN_SLOTS = new Set(['head', 'neck', 'back', 'hands', 'waist', 'feet', 'bracer', 'trinket', 'trinket2', 'trinket3']);
const TRINKETS = new Set(['trinket', 'trinket2', 'trinket3']);
/** Name hints for worn items the system does not classify; the owner can always reassign. */
const NAME_HINTS = [['head', /\b(helm|helmet|hat|hood|circlet|crown|cap|diadem|headband)\b/i], ['neck', /\b(amulet|necklace|periapt|medallion|pendant|torc|scarab)\b/i],
  ['back', /\b(cloak|cape|mantle|wings)\b/i], ['bracer', /\b(bracers?|bracelets?|vambraces?|armbands?)\b/i], ['hands', /\b(gloves|gauntlets?)\b/i], ['waist', /\b(belt|girdle|sash)\b/i], ['feet', /\b(boots|shoes|slippers|sandals)\b/i]];

export const slotFlag = item => { const s = item.flags?.[MODULE_ID]?.slot; return SLOT_IDS.has(s) ? s : null; };
/** Where an item would naturally sit: 'hand', 'ring', a slot id, or null (shown under "Other equipped"). */
export function naturalSlot(item) {
  if (item.type === 'weapon') return 'hand';
  if (item.type !== 'equipment') return null;
  const t = item.system?.type?.value;
  if (['light', 'medium', 'heavy', 'natural'].includes(t)) return 'body';
  if (t === 'shield') return 'offhand';
  if (t === 'ring') return 'ring';
  for (const [slot, re] of NAME_HINTS) if (re.test(item.name ?? '')) return slot;
  if (t === 'trinket') return 'trinket';
  return null;
}
const fits = (natural, slot) => natural === slot || (natural === 'hand' && (slot === 'mainhand' || slot === 'offhand')) || (natural === 'ring' && (slot === 'ring1' || slot === 'ring2'))
  || (natural === 'trinket' && TRINKETS.has(slot));

/** Equipped items placed into boxes: owner-assigned slot first, then the natural slot; anything left goes to "Other". */
export function equipmentLayout(actor) {
  const equipped = [...(actor.items ?? [])].filter(i => i.system?.equipped && ['weapon', 'equipment', 'tool'].includes(i.type)).sort(bySortThenName);
  const boxes = Object.fromEntries(SLOTS.map(s => [s.id, null])), other = [];
  const rest = [];
  for (const item of equipped) { const f = slotFlag(item); if (f && !boxes[f]) boxes[f] = item; else rest.push(item); }
  for (const item of rest) {
    const n = naturalSlot(item);
    const target = SLOTS.find(s => !boxes[s.id] && n && fits(n, s.id));
    if (target) boxes[target.id] = item; else other.push(item);
  }
  return {slots: SLOTS.map(s => ({...s, item: boxes[s.id] ? itemRow(boxes[s.id]) : null})), other: other.map(itemRow)};
}

/** Carried, unequipped items that could go in an empty box. Worn boxes also offer unclassified wearables. */
export function equipChoices(actor, slot) {
  return [...(actor.items ?? [])]
    .filter(i => ['weapon', 'equipment'].includes(i.type) && 'equipped' in (i.system ?? {}) && !i.system.equipped)
    .filter(i => { const n = naturalSlot(i); return fits(n, slot) || (WORN_SLOTS.has(slot) && n === null && i.type === 'equipment'); })
    .sort(bySortThenName).map(itemRow);
}
